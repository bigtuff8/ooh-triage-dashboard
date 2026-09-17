/**
 * The single control write path (F002) + sync-status confirmation loop (F008).
 *
 * Order of checks on every dispatch — all server-side:
 *   1. F004: a valid handler confirmation token for this site/operator
 *   2. F016: global/per-site kill-switch
 *   3. device exists in the resolved site's inventory and is online
 *   4. F009: capability + value guardrails (registry)
 *   5. dispatch as a TB shared attribute (the ONLY write mechanism, D2a)
 *
 * "Applied" means the device echoed the change back (*SyncStatus = synced) —
 * never HTTP 200. Pending / failed / rejected / timeout are first-class states;
 * IT700 slow-echo gets a timeout state and a late-sync background watch (CR-03).
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
import { scheduleOverride } from './overrides.js';
import { addLateSyncNote, createLateSyncTicket } from './zendesk.js';
import { recordControlEvent } from './metrics.js';

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

// actionId → action record (per-replica in-memory; durable trail lives in OohAuditLog).
//
// C1 (DEFERRED — NOT built in this item): this Map and the pollTimer below are the ONLY home of
// an in-flight action's late-sync watch. A pod restart inside the lateSyncWatchMs window silently
// drops both — the late echo is never observed, the audit stays uncorrected as 'timeout', and no
// late-sync note ever fires. The only true fix is persisting the minimal watch fields (actionId,
// _device identity, attribute, value, auditId, ticketId, deadline, watchUntil, state) to Cosmos on
// dispatch and rehydrating non-settled actions into this Map (re-arming the poller) on startup.
// That is the C1 proof obligation and is DEFERRED; C1 stays OPEN until it lands. The C1 known-gap
// test asserts this restart hole as an expected LIMIT, not passing behaviour.
const actions = new Map();
let pollTimer = null;

/**
 * Validates and dispatches a control command. Returns the initial action record.
 */
export async function dispatch({ operator, confirmToken, siteNo, deviceId, command, value, hold, direction }) {
    // 1. F004 confirmation gate — atomically CONSUME the single-use token (C2). This runs
    // FIRST, before any pre-write await (killswitch/resolve below) and before the device
    // write, and the get-then-delete is synchronous with no await between: two interleaved
    // dispatches with the same token cannot both pass. The token is spent on ADMISSION, so a
    // retry after a real-but-unacknowledged write is denied — the handler must re-confirm.
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

    // D9 — registration gate (Spencer §3 rule 2). TB silently drops commands for a device it hasn't
    // claimed via a first state publish; assert ≥1 published timeseries key before dispatching so the
    // handler is never told a change was sent when the bridge would swallow it. A failing device is
    // capture-only. Inserted after the online check, before validation/write.
    if (!await tb.hasPublishedState(device)) {
        throw Object.assign(new Error('Device has not registered with the platform yet (no state published) — it cannot accept remote commands. Capture and escalate.'), { status: 409, registration: true });
    }

    // 4. F009 guardrails
    const check = registry.validateCommand(device, command, value);
    if (!check.ok) throw Object.assign(new Error(check.reason), { status: 422, guardrail: true });

    const previousValue = check.attribute === 'switchDesired' ? device.telemetry?.switch_1
        : check.attribute === 'setpointDesired' ? device.telemetry?.heatingSetpoint
        : check.attribute === 'modeDesired' ? device.telemetry?.mode
        : device.telemetry?.hwBoostHours ?? 0;

    // D3 #2 — pre-dispatch edge classification. The bridge is edge-triggered: re-writing the same
    // desired dispatches nothing. Classify BEFORE any write so an already-satisfied request is an
    // honest no-op success (no write) and a duplicate-pending one surfaces "identical change in
    // flight" rather than a silent do-nothing that the handler mistakes for a fresh dispatch.
    const edge = await confirm.classifyPreDispatch(tb, device, check.attribute, check.value);
    const dispatchTs = Date.now();

    if (edge.outcome === 'already-satisfied') {
        // No write. Success-equivalent: the device is already confirmed at the requested value.
        return await recordNoWriteOutcome({
            device, site, operator, command, direction, hold, check, previousValue,
            state: 'already-set',
            detail: `${check.attribute} already at ${check.value} (device already confirmed) — no change dispatched`
        });
    }
    if (edge.outcome === 'duplicate-pending') {
        // No write — an identical change is in flight / never confirmed; a re-send won't move the
        // edge-triggered bridge. Surface it so the handler waits/escalates rather than re-issuing.
        throw Object.assign(
            new Error('An identical change is already in flight and has not confirmed yet — re-sending won’t move it. Keep waiting or escalate.'),
            { status: 409, duplicatePending: true }
        );
    }

    // 5. dispatch (edge.outcome === 'dispatch')
    await tb.writeSharedAttribute(device, check.attribute, check.value);

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
        outcome: 'pending',
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
        slowEchoDevice: !!registry.capabilitiesFor(device.deviceType)?.slowEcho,
        command,
        actionType,
        attribute: check.attribute,
        value: check.value,
        previousValue,
        hold: hold || null,           // { revertAt: ISO string, label }
        state: 'pending',
        dispatchedAt: new Date().toISOString(),
        dispatchTs,                   // D3 #3 fresh-echo guard: a settle requires syncTs > dispatchTs
        deadline: Date.now() + config.control.syncTimeoutMs,
        watchUntil: Date.now() + config.control.lateSyncWatchMs,
        settledAt: null,
        auditId: auditEntry.id,
        ticketId: null,
        overrideId: null,
        _device: device
    };
    actions.set(actionId, action);
    ensurePolling();
    return publicAction(action);
}

/**
 * Records an edge no-op outcome (already-satisfied) — no device write happened, but the requested
 * state is already confirmed on the device, so this is an honest success-equivalent. Audited as
 * 'already-set' and returned as a terminal action the frontend treats like synced (no polling).
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
        slowEchoDevice: !!registry.capabilitiesFor(device.deviceType)?.slowEcho,
        command,
        actionType,
        attribute: check.attribute,
        value: check.value,
        previousValue,
        hold: hold || null,
        state,                          // 'already-set' — terminal, no write, no poll
        dispatchedAt: new Date().toISOString(),
        dispatchTs: Date.now(),
        deadline: Date.now(),
        watchUntil: Date.now(),
        settledAt: new Date().toISOString(),
        reported: check.value,
        auditId: auditEntry.id,
        ticketId: null,
        overrideId: null,
        _device: device
    };
    // A hold on an already-satisfied change still needs to be scheduled (the value is right NOW but
    // the operator asked to hold it past the next schedule slot).
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
 * "Keep waiting" on a timeout — extends the deadline by 30s and re-enters pending.
 */
export function extendWait(actionId) {
    const a = actions.get(actionId);
    if (!a || (a.state !== 'timeout' && a.state !== 'pending')) return null;
    a.state = 'pending';
    a.deadline = Date.now() + 30000;
    return publicAction(a);
}

/**
 * Associates the Zendesk ticket created at outcome time so late-sync updates land on it.
 */
export function attachTicket(actionId, ticketId) {
    const a = actions.get(actionId);
    if (a) a.ticketId = ticketId;
}

function publicAction(a) {
    const { _device, deadline, watchUntil, ...pub } = a;
    return pub;
}

function ensurePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollAll, config.control.syncPollIntervalMs);
    pollTimer.unref?.();
}

async function pollAll() {
    for (const a of actions.values()) {
        if (['pending', 'timeout'].includes(a.state)) {
            try { await pollOne(a); } catch (err) {
                console.error(`[CONTROL] Sync poll failed for ${a.actionId}: ${err.message}`);
            }
        }
        // prune fully-settled actions after the watch window
        if (Date.now() > a.watchUntil && !['pending', 'timeout'].includes(a.state)) actions.delete(a.actionId);
        if (Date.now() > a.watchUntil && a.state === 'timeout') { actions.delete(a.actionId); }
    }
    if (actions.size === 0 && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function pollOne(a) {
    const state = await tb.readControlState(a._device, a.attribute);
    const { sync, reported } = state;
    // D3 #3 — a settle requires a FRESH echo (syncTs > dispatchTs). This defeats the stale-synced
    // trap: a silently-ignored value never lands a fresh 'synced' of the requested value, so the
    // action times out honestly instead of latching onto a leftover 'synced' from a prior command.
    const settled = confirm.isSettled(state, a.value, a.dispatchTs);

    if (settled) {
        const wasTimeout = a.state === 'timeout';
        a.state = wasTimeout ? 'late-synced' : 'synced';
        a.settledAt = new Date().toISOString();
        a.reported = reported;
        await audit.updateOutcome(a.auditId, 'synced', wasTimeout ? `late device confirmation at ${a.settledAt}` : null);
        recordControlEvent('synced');
        if (wasTimeout) {
            // C6 durable channel. LAZY ticket creation (panel decision): we do NOT create a Zendesk
            // ticket for every timeout — most timed-out actions never echo late, so an eager ticket
            // would be a wasted write on the overwhelming majority. The durable target is created
            // here, at the ONE moment a late echo actually needs somewhere to land, and only when the
            // handler never made an outcome/escalation ticket (a.ticketId still null). If a ticket
            // already exists (escalate/Done via api.js:256), we reuse it. Best-effort: a failure to
            // create/annotate is logged, never thrown — the audit correction above already stuck.
            try {
                if (!a.ticketId) {
                    const ticket = await createLateSyncTicket(a);
                    a.ticketId = ticket.id;
                }
                await addLateSyncNote(a.ticketId, a);
            } catch (err) {
                console.error(`[CONTROL] Late-sync ticket note failed: ${err.message}`);
            }
        }
        if (a.hold?.revertAt) {
            try {
                a.overrideId = await scheduleOverride(a);
            } catch (err) {
                console.error(`[CONTROL] Failed to persist hold for ${a.actionId}: ${err.message}`);
                recordControlEvent('hold-persist-failed');
            }
        }
        return;
    }

    // failed/rejected only count when FRESH (belong to this dispatch) — a stale terminal echo from a
    // previous command must not fail a brand-new dispatch (same syncTs>dispatchTs freshness gate).
    if (confirm.isFreshTerminal(state, a.dispatchTs)) {
        a.state = sync;
        a.settledAt = new Date().toISOString();
        await audit.updateOutcome(a.auditId, sync);
        recordControlEvent(sync);
        return;
    }

    if (a.state === 'pending' && Date.now() > a.deadline) {
        a.state = 'timeout';
        await audit.updateOutcome(a.auditId, 'timeout');
        recordControlEvent('timeout');
    }
}

/**
 * TEST-ONLY seam (C1 known-gap test). Simulates exactly what a pod restart drops: the in-memory
 * actions Map and the poll timer. There is deliberately NO rehydrate — that is the DEFERRED Cosmos
 * persistence fix (C1). Used to prove the restart hole is a KNOWN, EXPECTED gap (no late note, no
 * audit correction, no alert after a mid-window restart), not passing behaviour.
 */
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
