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
import * as audit from './audit.js';
import { scheduleOverride } from './overrides.js';
import { addLateSyncNote } from './zendesk.js';
import { recordControlEvent } from './metrics.js';

const COMMAND_ACTION_TYPE = {
    setpoint: v => `setpoint-${v.direction || 'change'}`,
    frost: () => 'heating-off-frost',
    mode: () => 'heating-off-mode',
    hwboost: () => 'hw-boost'
};

// actionId → action record (per-replica in-memory; durable trail lives in OohAuditLog)
const actions = new Map();
let pollTimer = null;

/**
 * Validates and dispatches a control command. Returns the initial action record.
 */
export async function dispatch({ operator, confirmToken, siteNo, deviceId, command, value, hold, direction }) {
    // 1. F004 confirmation gate
    if (!resolution.isConfirmed(confirmToken, siteNo, operator.id)) {
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

    // 4. F009 guardrails
    const check = registry.validateCommand(device, command, value);
    if (!check.ok) throw Object.assign(new Error(check.reason), { status: 422, guardrail: true });

    const previousValue = check.attribute === 'setpointDesired' ? device.telemetry?.heatingSetpoint
        : check.attribute === 'modeDesired' ? device.telemetry?.mode
        : device.telemetry?.hwBoostHours ?? 0;

    // 5. dispatch
    await tb.writeSharedAttribute(device, check.attribute, check.value);

    const actionId = randomUUID();
    const actionType = COMMAND_ACTION_TYPE[command]({ direction });
    const auditEntry = await audit.logAction({
        actionType,
        operator,
        siteNo: site.siteNo,
        siteName: site.siteName,
        deviceId: device.deviceId,
        zone: device.zone,
        detail: `${check.attribute} → ${check.value}${previousValue != null ? ` (was ${previousValue})` : ''}${hold ? ` · hold until ${hold.revertAt}` : ''}`,
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
    const { sync, reported } = await tb.readControlState(a._device, a.attribute);
    const settled = sync === 'synced' && String(reported) === String(a.value);

    if (settled) {
        const wasTimeout = a.state === 'timeout';
        a.state = wasTimeout ? 'late-synced' : 'synced';
        a.settledAt = new Date().toISOString();
        a.reported = reported;
        await audit.updateOutcome(a.auditId, 'synced', wasTimeout ? `late device confirmation at ${a.settledAt}` : null);
        recordControlEvent('synced');
        if (wasTimeout && a.ticketId) {
            await addLateSyncNote(a.ticketId, a).catch(err => console.error(`[CONTROL] Late-sync ticket note failed: ${err.message}`));
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

    if (sync === 'failed' || sync === 'rejected') {
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
 * In-flight/settled action counts for /healthz detail.
 */
export function controlQueueStatus() {
    const counts = {};
    for (const a of actions.values()) counts[a.state] = (counts[a.state] || 0) + 1;
    return counts;
}
