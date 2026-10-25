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
// Lazy import for boost-only zendesk helpers (avoids static-binding issues in test module mocking).
const _zendeskBoost = () => import('./zendesk.js');
import { clampBoostWindow } from './boost-window.js';
import { recordControlEvent, raiseAlert } from './metrics.js';
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

    // OOHDASH-135 Item 3 Level B: salus-it500 flag gate (defence-in-depth, server-side).
    // Even if the Level A UI gate (routes/api.js) is bypassed or the client sends a direct
    // request, this check refuses iT500 commands when SALUS_IT500_CTL_ENABLED=false.
    // The error is 422 (guardrail) so the operator sees a clear "not yet enabled" message
    // rather than a generic server error.
    if (device.deviceType === 'salus-it500' && !config.salusIt500CtlEnabled) {
        throw Object.assign(
            new Error('iT500 setpoint control is not yet enabled — the fleet is reconnecting and will be activated once confirmed (SALUS_IT500_CTL_ENABLED)'),
            { status: 422, guardrail: true }
        );
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

/* ------------------------------------------------------------------ */
/* OOHDASH-141 — boiler-panel boost dispatch                           */
/* ------------------------------------------------------------------ */

/**
 * Dispatches a pub heating boost (ON or OFF) to a boiler-panel device.
 * Returns the action record, or { _warnings } for a 409 pre-read warning.
 */
export async function dispatchBoilerBoost({ operator, confirmToken, siteNo, deviceId, zones, direction, durationKey, acknowledgedWarnings, callerWords, appendToHoldId }) {
    // F004 — validate confirmation token (non-consuming). We consume it just before the first
    // write so that a warnings-only pre-read can be followed by a second acknowledged request
    // without the token being spent on the read. The window between isConfirmed and
    // consumeConfirmation is single-event-loop-tick risk only (Node.js), which is acceptable.
    if (!resolution.isConfirmed(confirmToken, siteNo, operator.id)) {
        throw Object.assign(new Error('Site has not been confirmed for this call — confirm the site before sending any change'), { status: 409 });
    }

    // F016 — kill-switch (standard; revert uses the exempt path)
    const blocked = await killswitch.writesBlocked(siteNo);
    if (blocked) throw Object.assign(new Error(blocked), { status: 423 });

    // Feature flags
    if (!config.boilerBoost.enabled || config.boilerBoost.sitesDeny.includes(String(siteNo))) {
        throw Object.assign(new Error('Pub heating boost is not available for this site (flag or deny list)'), { status: 423 });
    }
    if (direction === 'on' && !config.boilerBoost.onEnabled) {
        throw Object.assign(new Error('Pub heating boost ON is not currently enabled'), { status: 423 });
    }

    // Resolve site and device
    const sites = await bridge.getSitesByNumber(siteNo);
    if (sites.length !== 1) throw Object.assign(new Error('Site is no longer uniquely resolvable'), { status: 409 });
    const site = sites[0];
    const device = site.devices.find(d => d.deviceId === deviceId);
    if (!device) throw Object.assign(new Error('Device not found at this site'), { status: 404 });
    if (device.deviceType !== 'boiler-panel') {
        throw Object.assign(new Error('Device is not a boiler-panel'), { status: 409 });
    }
    if (!device.online) throw Object.assign(new Error('Device is offline — no command can reach it'), { status: 409 });
    if (!await tb.hasPublishedState(device)) {
        throw Object.assign(new Error('Device has not registered with the platform yet'), { status: 409, registration: true });
    }
    if (device.heating?.stale === true) {
        throw Object.assign(new Error('Boiler panel data is stale — confirmation would be unreliable. Try again when the panel reports.'), { status: 409 });
    }

    // Determine panel version from site-level boilerControl (populated by decodeBoilerHeating).
    // device.deviceType is always 'boiler-panel' (mapped from the TB boilerControl profile),
    // so V1/V2 discrimination comes from site.boilerControl.isV2 (set at site-read time).
    const panelVersion = site.boilerControl?.isV2 ? 'v2' : 'v1';

    // Clamp: 01:00/07:00 window check.
    // For until-next-on, compute the earliest nextOn.atMs across the requested zones so the
    // server resolves the dynamic duration (§7). A null here falls back to until-0700.
    let nextOnMs = null;
    if (durationKey === 'until-next-on' && direction === 'off') {
        const { zoneTimetable: zt } = await import('./schedule.js');
        const { collection } = await import('./store.js');
        // We need the zone timetables — re-read from the device's SHARED_SCOPE.
        // Use site.boilerControl.heating.zones which was read moments ago (no extra round-trip).
        const heatingZones = site.boilerControl?.heating?.zones || [];
        for (const requestedZone of zones) {
            const zData = heatingZones.find(z => z.zone === requestedZone || z.zone === ('CHZ' + requestedZone));
            if (zData?.timetable?.nextOn?.atMs) {
                const atMs = zData.timetable.nextOn.atMs;
                if (nextOnMs === null || atMs < nextOnMs) nextOnMs = atMs;
            }
        }
    }
    const clampResult = clampBoostWindow(Date.now(), direction, durationKey, 'Europe/London', nextOnMs);
    if (!clampResult.ok) {
        throw Object.assign(new Error(clampResult.message), { status: 422, code: clampResult.code });
    }

    // Validate each zone
    const zoneValidations = [];
    for (const zone of zones) {
        const check = registry.validateCommand(device, direction === 'on' ? 'boost-on' : 'boost-off', { zone, durationKey, panelVersion });
        if (!check.ok) throw Object.assign(new Error(check.reason), { status: 422, guardrail: true });
        zoneValidations.push({ zone, n: check.n, attribute: check.attribute });
    }

    // Pre-read: check for existing engineer override
    const { zones: preStates } = await tb.readBoilerState(device, panelVersion, zones);
    const warnings = preStates.filter(z => z.dir !== 0 && !acknowledgedWarnings).map(z => ({
        zone: z.zone,
        currentDir: z.dir > 0 ? 'on' : 'off',
        message: `Pub zone ${z.zone === 'CHZ1' ? '1' : '2'} is already forced ${z.dir > 0 ? 'ON' : 'OFF'} (set at the panel or by an engineer)`
    }));
    if (warnings.length) return { _warnings: warnings };

    // F004 — consume the confirmation token exactly once, only when we are about to write.
    // This allows the warnings-only path to leave the token intact for a subsequent acknowledged request.
    if (!resolution.consumeConfirmation(confirmToken, siteNo, operator.id)) {
        throw Object.assign(new Error('Confirmation token has expired or was already used — re-confirm the site'), { status: 409 });
    }

    const contract = config.control.classes['boiler-panel'];
    const confirmLimitMs = panelVersion === 'v1' ? contract.confirmLimitMsV1 : contract.confirmLimitMs;
    const confirmPollMs = contract.confirmPollMs;

    // Dispatch each zone and confirm
    const actionId = randomUUID();
    const zoneOutcomes = [];
    const overrideIds = [];

    for (const { zone, n, attribute } of zoneValidations) {
        const preState = preStates.find(z => z.zone === zone);
        const baselineOverrideTs = preState?.overrideTs ?? 0;
        const baselineAttrTs = preState?.attrTs ?? 0;

        let sentAtMs, dispatchOk = false, dispatchError = null, deliveryTag = null;
        try {
            if (panelVersion === 'v2') {
                ({ sentAtMs } = await tb.dispatchBoilerRpc(device, zone, n, clampResult.effectiveMin));
            } else {
                ({ attrTs: sentAtMs } = await tb.writeSharedScopeAttribute(device, attribute, n));
            }
            dispatchOk = true;
        } catch (err) {
            if (err.delivery === 'rejected') {
                deliveryTag = 'NON-DELIVERY';
                dispatchError = err.message;
            } else {
                deliveryTag = 'IN-FLIGHT-TIMEOUT';
                dispatchError = err.message;
            }
        }

        await audit.logAction({
            actionType: `boiler-boost-${direction}`,
            operator,
            siteNo: site.siteNo,
            siteName: site.siteName,
            deviceId: device.deviceId,
            zone: device.zone,
            detail: `Boiler ${direction.toUpperCase()} on ${zone} (${panelVersion}, attr=${attribute || zone}) n=${n}, effectiveMin=${clampResult.effectiveMin}${clampResult.clamped ? ' [CLAMPED]' : ''}`,
            outcome: dispatchOk ? 'in-flight' : (deliveryTag || 'non-delivery'),
            controlActionId: actionId
        });

        let outcome = 'IN-FLIGHT-TIMEOUT';
        let confirmed = false;

        if (deliveryTag === 'NON-DELIVERY') {
            outcome = 'NON-DELIVERY';
            raiseAlert('boost-non-delivery', `Boiler boost ${direction} on ${device.deviceId} ${zone} was rejected: ${dispatchError}`);
        } else if (dispatchOk) {
            // Confirm poll
            const deadline = Date.now() + confirmLimitMs;
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, confirmPollMs));
                const { zones: pollZones } = await tb.readBoilerState(device, panelVersion, [zone]);
                const pz = pollZones[0];
                if (pz?.dir === n) {
                    if (panelVersion === 'v2' && (pz.overrideTs ?? 0) > baselineOverrideTs) { confirmed = true; break; }
                    if (panelVersion === 'v1' && (pz.overrideTs ?? 0) > baselineAttrTs) { confirmed = true; break; }
                    if (config.dataMode === 'fixture') { confirmed = true; break; } // fixture sim
                }
            }
            if (confirmed) {
                outcome = 'CONFIRMED';
            } else {
                outcome = 'IN-FLIGHT-TIMEOUT';
                raiseAlert('boost-unverified', `Boiler boost ${direction} on ${device.deviceId} ${zone} not confirmed within ${confirmLimitMs}ms — hold still scheduled`);
            }
        }

        zoneOutcomes.push({ zone, outcome, dispatchError, panelVersion });

        // Schedule hold on CONFIRMED or IN-FLIGHT-TIMEOUT (not NON-DELIVERY)
        if (outcome !== 'NON-DELIVERY') {
            const overrideAttr = panelVersion === 'v2' ? `${zone}.override` : attribute;
            const holdAction = {
                actionId,
                operator,
                siteNo: site.siteNo,
                siteName: site.siteName,
                deviceId: device.deviceId,
                zone: device.zone,           // area zone (not boilerZone)
                deviceType: 'boiler-panel',
                attribute: overrideAttr,
                value: n,
                revertValue: 0,              // always auto
                previousValue: 0,
                ticketId: null,              // set after ticket creation
                hold: {
                    revertAt: new Date(clampResult.revertAtMs).toISOString(),
                    label: `Boiler boost ${direction.toUpperCase()} ${zone} for ${clampResult.effectiveMin} min`
                },
                // Boiler-specific
                panelVersion,
                boilerZone: zone,
                direction,
                footprint: panelVersion === 'v1' ? { attrTs: baselineAttrTs, confirmed } : { confirmed },
                d2CeilingAtMs: direction === 'on' ? clampResult.revertAtMs : undefined,
                clampedFromMin: clampResult.clamped ? clampResult.requestedMin : undefined
            };
            try {
                const oid = await scheduleOverride(holdAction);
                overrideIds.push({ zone, overrideId: oid });
            } catch (err) {
                console.error(`[CONTROL] Boiler hold persist failed for ${zone}: ${err.message}`);
                recordControlEvent('hold-persist-failed');
            }
        }
    }

    // Create or append Zendesk ticket (synchronous; failure raises alert but does not cancel hold).
    // OOHDASH-144 §9.2a: if appendToHoldId is provided and valid, add to the existing ticket instead
    // of creating a new one (one ticket per issue).
    let ticketId = null;
    let appendResolved = false;
    if (appendToHoldId) {
        try {
            const { collection: col2 } = await import('./store.js');
            const col = await col2('OohOverrides');
            const holdDoc = await col.get(appendToHoldId);
            if (
                holdDoc &&
                holdDoc.ticketId &&
                String(holdDoc.siteNo) === String(siteNo) &&
                holdDoc.deviceType === 'boiler-panel' &&
                (Date.now() - new Date(holdDoc.createdAt).getTime()) < 12 * 60 * 60 * 1000
            ) {
                ticketId = holdDoc.ticketId;
                appendResolved = true;
                const { addBoostActionNote } = await _zendeskBoost();
                if (addBoostActionNote) {
                    await addBoostActionNote(ticketId, {
                        operator, zones, direction, durationKey,
                        revertAtMs: clampResult.revertAtMs, outcomes: zoneOutcomes
                    });
                }
            }
        } catch (e) {
            console.error(`[CONTROL] appendToHoldId resolve failed: ${e.message}`);
        }
    }
    if (!appendResolved) {
        try {
            const preStateMap = Object.fromEntries(preStates.map(z => [z.zone, z]));
            const { createBoostTicket } = await _zendeskBoost();
            const ticket = await createBoostTicket({
                operator,
                callerWords,
                siteNo: site.siteNo,
                siteName: site.siteName,
                panelVersion,
                zones,
                direction,
                durationKey,
                requestedMin: clampResult.requestedMin,
                effectiveMin: clampResult.effectiveMin,
                clamped: clampResult.clamped,
                fallback: clampResult.fallback || null,
                revertAtMs: clampResult.revertAtMs,
                previousStates: preStates,
                acknowledgedWarnings: !!acknowledgedWarnings,
                outcomes: zoneOutcomes
            });
            ticketId = ticket.id;
        } catch (err) {
            console.error(`[CONTROL] Boost ticket creation failed: ${err.message}`);
            raiseAlert('boost-ticket-failed', `Zendesk ticket creation failed for boiler boost on ${deviceId}: ${err.message}`);
        }
    }
    // Attach ticketId to all holds
    if (ticketId) {
        const { collection: col3 } = await import('./store.js');
        const col = await col3('OohOverrides');
        for (const { zone, overrideId } of overrideIds) {
            try {
                const doc = await col.get(overrideId);
                if (doc) { doc.ticketId = ticketId; await col.upsert(doc); }
            } catch (e) { console.error(`[CONTROL] boost ticketId attach failed for ${zone}: ${e.message}`); }
        }
    }

    recordControlEvent(`boiler-boost-${direction}`);

    const action = {
        actionId,
        operator: { id: operator.id, name: operator.name, email: operator.email },
        siteNo: site.siteNo,
        siteName: site.siteName,
        deviceId: device.deviceId,
        deviceType: 'boiler-panel',
        panelVersion,
        zones: zoneOutcomes,
        direction,
        durationKey,
        requestedMin: clampResult.requestedMin,
        effectiveMin: clampResult.effectiveMin,
        clamped: clampResult.clamped,
        fallback: clampResult.fallback || null,
        revertAtMs: clampResult.revertAtMs,
        ticketId,
        overrideIds,
        dispatchedAt: new Date().toISOString()
    };
    actions.set(actionId, { ...action, _boilerBoost: true });
    return action;
}
