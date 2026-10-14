/**
 * The single control write path (F002) + the three-outcome confirmation watcher (OOHDASH-123).
 *
 * Order of checks on every dispatch — all server-side:
 *   1. F004: a valid handler confirmation token for this site/operator
 *   2. F016: global/per-site kill-switch
 *   3. device exists in the resolved site's inventory and is online
 *   4. D9 registration gate (device has published state)
 *   5. F009: capability + value guardrails (registry)
 *   6. OOHDASH-123: write the *Requested key to SERVER_SCOPE (the IoT Command Gate dispatches)
 *
 * The outcome is ONE of three (design §5): CONFIRMED (status=accepted AND the device's own confirming
 * telemetry matches AND its ts > dispatchTs — the ONLY success), NOT DELIVERED (a gate/vendor
 * rejection), or NOT CONFIRMED (accepted-but-unproven at the per-vendor confirm limit — never called
 * failed, never done; the watcher keeps watching to the late-watch horizon). `accepted` on its own is
 * always in-flight, never success (the OOHDASH-102 false-success bug we must not reintroduce).
 *
 * DD-RESEND-UX (James override): NO resend. A stuck/not-confirmed command is never re-fired; the
 * watcher keeps watching and updates the ticket, then reports "not confirmed".
 * DD-WAIT-HANDOFF: for slow (Salus) classes the handler is released immediately; the background
 * watcher updates a ticket note and the client shows the result when it lands.
 */

import { randomUUID } from 'crypto';
import { config } from '../config.js';
import * as bridge from './bridge.js';
import * as registry from './registry.js';
import * as killswitch from './killswitch.js';
import * as resolution from './resolution.js';
import * as tb from './tb-client.js';
import * as confirm from './confirm.js';
import * as audit from './audit.js';
import * as errors from './errors.js';
import { scheduleOverride } from './overrides.js';
import { addLateSyncNote, createLateSyncTicket } from './zendesk.js';
import { recordControlEvent } from './metrics.js';
import * as inflight from './inflight-store.js';

/** Formats an ISO timestamp as e.g. "Sat 07:00" for audit detail strings. */
function friendlyTime(iso) {
    return new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

const COMMAND_ACTION_TYPE = {
    setpoint: v => `setpoint-${v.direction || 'change'}`,
    switch: v => `switch-${v.value ? 'on' : 'off'}`,
    frost: () => 'heating-off-frost',
    mode: () => 'heating-off-mode',
    hwboost: () => 'hw-boost'
};

// actionId → action record (per-replica in-memory watcher). The DURABLE in-flight record lives in
// Cosmos (OohActionInflight, WU10) so a minutes-long Salus result survives a pod restart (save-and-resume).
const actions = new Map();
let pollTimer = null;
// How long a terminal (confirmed/non-delivery) result is kept in the watcher so the client can read it.
const TERMINAL_GRACE_MS = 5 * 60 * 1000;

/**
 * Validates and dispatches a control command. Returns the initial action record.
 */
export async function dispatch({ operator, confirmToken, siteNo, deviceId, command, value, hold, direction }) {
    // 1. F004 confirmation gate — atomically CONSUME the single-use token (C2).
    if (!resolution.consumeConfirmation(confirmToken, siteNo, operator.id)) {
        throw Object.assign(new Error('Site has not been confirmed for this call — confirm the site before sending any change'), { status: 409 });
    }

    // 2. F016 kill-switch
    const blocked = await killswitch.writesBlocked(siteNo);
    if (blocked) throw Object.assign(new Error(blocked), { status: 423 });

    // 3. resolve the device within the site
    const sites = await bridge.getSitesByNumber(siteNo);
    if (sites.length !== 1) throw Object.assign(new Error('Site is no longer uniquely resolvable'), { status: 409 });
    const site = sites[0];
    const device = site.devices.find(d => d.deviceId === deviceId);
    if (!device) throw Object.assign(new Error('Device not found at this site'), { status: 404 });
    if (!device.online) throw Object.assign(new Error('Device is offline — no command can reach it'), { status: 409 });

    // D9 — registration gate (Spencer §3 rule 2): a device with no published state silently drops
    // commands. Assert ≥1 published timeseries key before dispatching; a failing device is capture-only.
    if (!await tb.hasPublishedState(device)) {
        throw Object.assign(new Error('Device has not registered with the platform yet (no state published) — it cannot accept remote commands. Capture and escalate.'), { status: 409, registration: true });
    }

    // 4. F009 guardrails
    const check = registry.validateCommand(device, command, value);
    if (!check.ok) throw Object.assign(new Error(check.reason), { status: 422, guardrail: true });

    const contract = registry.capabilitiesContractFor(device.deviceType);
    // previousValue for the audit "was X" line — read from the device's own confirming telemetry.
    const previousValue = confirmingTelemetry(device, contract);

    // 5. Pre-dispatch (design §6 / WU5): judge "already satisfied" from the confirming telemetry, not
    // from Desired, and NEVER dead-end (no 409 duplicate-pending — DD-RESEND-UX). If the device already
    // reads the requested value, it is an honest no-write success.
    const edge = await confirm.preDispatchCheck(tb, device, device.deviceType, check.value, contract);
    if (edge.outcome === 'already-satisfied') {
        return await recordNoWriteOutcome({
            device, site, operator, command, direction, hold, check, previousValue,
            state: 'already-set',
            detail: `${contract.confirmKeys[0] || check.attribute} already at ${check.value} (device already reads the requested value) — no change dispatched`
        });
    }

    // 6. dispatch — the single SERVER_SCOPE Requested write (never re-fired). dispatchTs is the
    // server-assigned lastUpdateTs so the fresh-echo guard compares like-for-like clocks.
    const dispatchTs = await tb.writeServerScopeAttribute(device, check.attribute, check.value);

    const actionId = randomUUID();
    const actionType = COMMAND_ACTION_TYPE[command]({ direction, value: check.value });
    const auditEntry = await audit.logAction({
        actionType,
        operator,
        siteNo: site.siteNo,
        siteName: site.siteName,
        deviceId: device.deviceId,
        zone: device.zone,
        detail: `${check.attribute} → ${check.value}${previousValue != null ? ` (was ${previousValue})` : ''}${hold ? ` · hold until ${friendlyTime(hold.revertAt)}` : ''}`,
        outcome: 'in-flight',
        controlActionId: actionId
    });

    const confirmLimitMs = contract.confirmLimitMs || 10000;
    const lateWatchMs = contract.lateWatchMs || 120000;
    const confirmPollMs = contract.confirmPollMs || config.control.syncPollIntervalMs;
    const action = {
        actionId,
        operator: { id: operator.id, name: operator.name, email: operator.email },
        siteNo: site.siteNo,
        siteName: site.siteName,
        deviceId: device.deviceId,
        zone: device.zone,
        deviceType: device.deviceType,
        slowEchoDevice: contract.copyMinutes != null,   // Salus: released at once, watched in background
        copyMinutes: contract.copyMinutes,
        command,
        actionType,
        attribute: check.attribute,            // the *Requested key written
        requestedKey: check.attribute,
        confirmKey: contract.confirmKeys[0] || null,
        value: check.value,
        requestedValue: check.value,
        previousValue,
        hold: hold || null,
        state: 'in-flight',                    // in-flight | confirmed | non-delivery | indeterminate | already-set
        status: 'pending',                     // in-flight sub-state: pending | accepted
        confirmedValue: null,
        confirmedLate: false,
        operatorError: null,                   // translated, safe to show
        lastErrorRaw: null,                    // raw gate/vendor text — ticket only
        dispatchSanityWarning: false,
        dispatchedAt: new Date().toISOString(),
        settledAt: null,
        auditId: auditEntry.id,
        ticketId: null,
        overrideId: null,
        // internal watcher fields (stripped from the public view)
        dispatchTs,
        contract,
        confirmLimitAt: dispatchTs + confirmLimitMs,
        lateWatchUntil: dispatchTs + lateWatchMs,
        confirmPollMs,
        nextPollAt: Date.now() + confirmPollMs,
        _dispatchSanityAt: contract.copyMinutes != null ? Date.now() + config.control.dispatchSanityMs : null,
        _device: device
    };
    actions.set(actionId, action);
    // WU10 — persist the in-flight record so a minutes-long result survives a pod restart.
    try { await inflight.persist(action); }
    catch (err) { console.error(`[CONTROL] in-flight persist failed for ${actionId}: ${err.message}`); }
    ensurePolling();
    return publicAction(action);
}

/** The device's own confirming telemetry value for this class (first present confirm key). */
function confirmingTelemetry(device, contract) {
    const t = device?.telemetry || {};
    for (const k of (contract.confirmKeys || [])) { if (t[k] !== undefined) return t[k]; }
    return null;
}

/**
 * Records an edge no-op outcome (already-satisfied) — no device write happened, but the device already
 * reads the requested value, so this is an honest success-equivalent (audited 'already-set').
 */
async function recordNoWriteOutcome({ device, site, operator, command, direction, hold, check, previousValue, state, detail }) {
    const actionId = randomUUID();
    const actionType = COMMAND_ACTION_TYPE[command]({ direction, value: check.value });
    const auditEntry = await audit.logAction({
        actionType,
        operator,
        siteNo: site.siteNo,
        siteName: site.siteName,
        deviceId: device.deviceId,
        zone: device.zone,
        detail,
        outcome: 'already-set',
        controlActionId: actionId
    });
    const action = {
        actionId,
        operator: { id: operator.id, name: operator.name, email: operator.email },
        siteNo: site.siteNo,
        siteName: site.siteName,
        deviceId: device.deviceId,
        zone: device.zone,
        deviceType: device.deviceType,
        slowEchoDevice: false,
        copyMinutes: null,
        command,
        actionType,
        attribute: check.attribute,
        requestedKey: check.attribute,
        value: check.value,
        requestedValue: check.value,
        previousValue,
        hold: hold || null,
        state,                          // 'already-set' — terminal, no write, no poll
        status: 'confirmed',
        confirmedValue: check.value,
        confirmedLate: false,
        operatorError: null,
        lastErrorRaw: null,
        dispatchSanityWarning: false,
        dispatchedAt: new Date().toISOString(),
        settledAt: new Date().toISOString(),
        auditId: auditEntry.id,
        ticketId: null,
        overrideId: null,
        _device: device
    };
    if (action.hold?.revertAt) {
        try { action.overrideId = await scheduleOverride(action); }
        catch (err) { console.error(`[CONTROL] Failed to persist hold for already-set ${actionId}: ${err.message}`); }
    }
    recordControlEvent('already-set');
    return publicAction(action);
}

/**
 * Current state of a control action (frontend polls this).
 */
export function getAction(actionId) {
    const a = actions.get(actionId);
    return a ? publicAction(a) : null;
}

/**
 * DD-WAIT-HANDOFF: the "keep waiting" affordance is removed (the handler is released and the watcher
 * runs regardless). Retained as a benign no-op so the legacy route returns the live action rather than
 * a 404. It never re-fires the command and never extends any deadline (DD-RESEND-UX).
 */
export function extendWait(actionId) {
    const a = actions.get(actionId);
    return a ? publicAction(a) : null;
}

/**
 * Associates the Zendesk ticket created at outcome time so late-confirm / not-confirmed updates land on it.
 */
export function attachTicket(actionId, ticketId) {
    const a = actions.get(actionId);
    if (a) {
        a.ticketId = ticketId;
        inflight.update(actionId, { OohActionTicketId: ticketId }).catch(() => {});
    }
}

function publicAction(a) {
    // Strips only the internal watcher fields. `lastErrorRaw` is RETAINED so the server-side ticket
    // builder can write the raw gate/vendor text to the ticket (design §9); the client renders only the
    // translated `operatorError` and must never display `lastErrorRaw` (WU6/WU12 enforce that rule).
    const {
        _device, _dispatchSanityAt, dispatchTs, contract, confirmLimitAt, lateWatchUntil,
        confirmPollMs, nextPollAt, ...pub
    } = a;
    return pub;
}

function ensurePolling() {
    if (pollTimer) return;
    // The watcher runs on a BASE tick; each action is read only when its own class confirmPollMs has
    // elapsed (Tuya ~3s, Salus ~60s), so a minutes-long Salus watch costs a read a minute, not a second.
    pollTimer = setInterval(pollAll, config.control.syncPollIntervalMs);
    pollTimer.unref?.();
}

async function pollAll() {
    const now = Date.now();
    for (const a of actions.values()) {
        // dispatch-sanity one-shot (WU5 / DD-RESEND-UX): for a slow (Salus) class, if the status attr
        // has not advanced past dispatchTs within dispatchSanityMs, the write may have been swallowed.
        if (a._dispatchSanityAt && now >= a._dispatchSanityAt) {
            a._dispatchSanityAt = null;
            try { await dispatchSanityCheck(a); } catch (err) { console.error(`[CONTROL] dispatch-sanity failed for ${a.actionId}: ${err.message}`); }
        }
        if (isWatchable(a) && now >= a.nextPollAt) {
            a.nextPollAt = now + a.confirmPollMs;
            try { await pollOne(a); } catch (err) {
                console.error(`[CONTROL] Confirm poll failed for ${a.actionId}: ${err.message}`);
            }
        }
        // Retire from the in-memory watcher. A terminal result is kept a short grace so the client can
        // read it; a still-live action is dropped (and finalised INDETERMINATE) past the late-watch horizon.
        const terminal = a.state === 'confirmed' || a.state === 'non-delivery';
        if (terminal && a.settledAt && now - Date.parse(a.settledAt) > TERMINAL_GRACE_MS) {
            actions.delete(a.actionId);
        } else if (now > a.lateWatchUntil) {
            if (a.state === 'in-flight' || a.state === 'indeterminate') finaliseIndeterminate(a);
            actions.delete(a.actionId);
        }
    }
    if (actions.size === 0 && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// Still worth polling while not in a terminal state (confirmed/non-delivery/already-set).
function isWatchable(a) {
    return a.state === 'in-flight' || a.state === 'indeterminate';
}

async function pollOne(a) {
    const state = await tb.readCommandState(a._device, a.deviceType);
    a.status = confirm.isAcceptedFresh(state, a.dispatchTs) ? 'accepted' : 'pending';
    const outcome = confirm.classifyOutcome(state, a.requestedValue, a.dispatchTs, a.contract);

    if (outcome === 'CONFIRMED') {
        const wasLate = a.state === 'indeterminate';
        a.state = 'confirmed';
        a.status = 'accepted';
        a.confirmedValue = state.telemetryValue;
        a.confirmedLate = wasLate;
        a.settledAt = new Date().toISOString();
        await audit.updateOutcome(a.auditId, 'confirmed', wasLate ? `late confirmation at ${a.settledAt}` : null);
        recordControlEvent(wasLate ? 'confirmed-late' : 'confirmed');
        await retireInflight(a, 'confirmed');
        if (wasLate || a.slowEchoDevice) await noteLateResultToTicket(a, 'confirmed');
        if (a.hold?.revertAt) {
            try { a.overrideId = await scheduleOverride(a); }
            catch (err) { console.error(`[CONTROL] Failed to persist hold for ${a.actionId}: ${err.message}`); recordControlEvent('hold-persist-failed'); }
        }
        return;
    }

    if (outcome === 'NON-DELIVERY') {
        a.state = 'non-delivery';
        a.settledAt = new Date().toISOString();
        a.lastErrorRaw = state.lastError || null;
        a.operatorError = errors.translateLastError(state.lastError);
        await audit.updateOutcome(a.auditId, 'non-delivery', errors.safeTicketError(state.lastError));
        recordControlEvent('non-delivery');
        await retireInflight(a, 'non-delivery');
        await noteLateResultToTicket(a, 'non-delivery');
        return;
    }

    // IN-FLIGHT: once the confirm limit elapses with neither a confirming reading nor a rejection, it
    // is NOT CONFIRMED (indeterminate). Never "failed", never "done" — keep watching to the late-watch
    // horizon and update the ticket if it lands later.
    if (a.state === 'in-flight' && Date.now() > a.confirmLimitAt) {
        a.state = 'indeterminate';
        a.operatorError = errors.NOT_CONFIRMED_MESSAGE;
        await audit.updateOutcome(a.auditId, 'indeterminate');
        recordControlEvent('indeterminate');
        await noteLateResultToTicket(a, 'indeterminate');
        await inflight.update(a.actionId, { OohActionState: 'indeterminate' }).catch(() => {});
    }
}

/** The one-shot Salus dispatch-sanity check (DD-RESEND-UX repurpose of the SQ-09 dedup fallback). */
async function dispatchSanityCheck(a) {
    if (a.state !== 'in-flight') return;
    const state = await tb.readCommandState(a._device, a.deviceType);
    const advanced = typeof state.statusTs === 'number' && state.statusTs > a.dispatchTs;
    if (!advanced) {
        a.dispatchSanityWarning = true;
        recordControlEvent('dispatch-sanity-warning');
        try {
            if (!a.ticketId) { const t = await createLateSyncTicket(a); a.ticketId = t.id; }
            await addLateSyncNote(a.ticketId, { ...a, _sanityNote: 'The command write did not register with the gate within 5s — it may not have reached the device (possible identical-value filter). Raise a ticket if the device does not respond.' });
        } catch (err) { console.error(`[CONTROL] dispatch-sanity ticket note failed: ${err.message}`); }
    }
}

function finaliseIndeterminate(a) {
    if (a.state !== 'indeterminate') {
        a.state = 'indeterminate';
        a.operatorError = errors.NOT_CONFIRMED_MESSAGE;
        audit.updateOutcome(a.auditId, 'indeterminate').catch(() => {});
        recordControlEvent('indeterminate');
    }
    inflight.update(a.actionId, { OohActionState: 'indeterminate' }).catch(() => {});
}

async function retireInflight(a, finalState) {
    try { await inflight.retire(a.actionId, finalState); }
    catch (err) { console.error(`[CONTROL] in-flight retire failed for ${a.actionId}: ${err.message}`); }
}

/**
 * Durable channel for a result the operator may no longer be watching (a late confirm, a not-confirmed
 * at the limit, a background Salus result, or a non-delivery). Lazy: only creates a ticket if one does
 * not already exist. Best-effort — a failure is logged, never thrown.
 */
async function noteLateResultToTicket(a, kind) {
    try {
        if (!a.ticketId) {
            const ticket = await createLateSyncTicket(a);
            a.ticketId = ticket.id;
            await inflight.update(a.actionId, { OohActionTicketId: ticket.id }).catch(() => {});
        }
        await addLateSyncNote(a.ticketId, { ...a, _resultKind: kind });
    } catch (err) {
        console.error(`[CONTROL] result ticket note failed for ${a.actionId}: ${err.message}`);
    }
}

/**
 * WU10 — resume in-flight watchers after a pod restart. Reads all durable in-flight records, does one
 * confirm read each, settles terminal ones, re-arms live ones, marks past-late-watch ones INDETERMINATE.
 */
export async function resumeInflight() {
    let records = [];
    try { records = await inflight.listInflight(); }
    catch (err) { console.error(`[CONTROL] resume: could not read in-flight store: ${err.message}`); return { resumed: 0 }; }
    let resumed = 0;
    for (const rec of records) {
        try {
            const device = await resolveDeviceForResume(rec);
            if (!device) { await inflight.update(rec.OohActionId, { OohActionState: 'indeterminate' }).catch(() => {}); continue; }
            const contract = registry.capabilitiesContractFor(device.deviceType);
            const dispatchTs = Date.parse(rec.OohActionDispatchAt);
            const confirmLimitAt = Date.parse(rec.OohActionConfirmLimitAt);
            const lateWatchUntil = Date.parse(rec.OohActionLateWatchUntil);
            const action = {
                actionId: rec.OohActionId,
                operator: { id: null, name: 'system (resumed)', email: null },
                siteNo: rec.OohActionSiteNo || null,
                siteName: rec.OohActionSiteName || null,
                deviceId: rec.OohActionDevice,
                zone: device.zone,
                deviceType: device.deviceType,
                slowEchoDevice: contract.copyMinutes != null,
                copyMinutes: contract.copyMinutes,
                command: rec.OohActionCapability,
                actionType: rec.OohActionType || rec.OohActionCapability,
                attribute: contract.requestedKey,
                requestedKey: contract.requestedKey,
                confirmKey: contract.confirmKeys[0] || null,
                value: rec.OohActionRequestedValue,
                requestedValue: rec.OohActionRequestedValue,
                previousValue: null,
                hold: null,
                state: 'in-flight',
                status: 'pending',
                confirmedValue: null,
                confirmedLate: false,
                operatorError: null,
                lastErrorRaw: null,
                dispatchSanityWarning: false,
                dispatchedAt: rec.OohActionDispatchAt,
                settledAt: null,
                auditId: rec.OohActionAuditId || null,
                ticketId: rec.OohActionTicketId || null,
                overrideId: null,
                dispatchTs,
                contract,
                confirmLimitAt,
                lateWatchUntil,
                confirmPollMs: contract.confirmPollMs || config.control.syncPollIntervalMs,
                nextPollAt: 0,
                _dispatchSanityAt: null,
                _device: device
            };
            // One confirm read now.
            const state = await tb.readCommandState(device, device.deviceType);
            const outcome = confirm.classifyOutcome(state, action.requestedValue, dispatchTs, contract);
            if (outcome === 'CONFIRMED') {
                action.state = 'confirmed'; action.confirmedValue = state.telemetryValue; action.confirmedLate = true; action.settledAt = new Date().toISOString();
                recordControlEvent('confirmed-late');
                await retireInflight(action, 'confirmed');
                await noteLateResultToTicket(action, 'confirmed');
            } else if (outcome === 'NON-DELIVERY') {
                action.state = 'non-delivery'; action.settledAt = new Date().toISOString();
                action.lastErrorRaw = state.lastError; action.operatorError = errors.translateLastError(state.lastError);
                await retireInflight(action, 'non-delivery');
                await noteLateResultToTicket(action, 'non-delivery');
            } else if (Date.now() > lateWatchUntil) {
                finaliseIndeterminate(action);
                await noteLateResultToTicket(action, 'indeterminate');
            } else {
                actions.set(action.actionId, action);
                ensurePolling();
                resumed++;
            }
        } catch (err) {
            console.error(`[CONTROL] resume of ${rec.OohActionId} failed: ${err.message}`);
        }
    }
    return { resumed };
}

async function resolveDeviceForResume(rec) {
    try {
        if (!rec.OohActionSiteNo) return null;
        const sites = await bridge.getSitesByNumber(rec.OohActionSiteNo);
        if (sites.length !== 1) return null;
        return sites[0].devices.find(d => d.deviceId === rec.OohActionDevice) || null;
    } catch { return null; }
}

/** TEST-ONLY seam — simulates what a pod restart drops: the in-memory watcher Map + poll timer. */
export function __dropForRestartTest() {
    actions.clear();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/**
 * In-flight/settled action counts for /healthz detail.
 */
export function controlQueueStatus() {
    const counts = {};
    for (const a of actions.values()) counts[a.state] = (counts[a.state] || 0) + 1;
    return counts;
}
