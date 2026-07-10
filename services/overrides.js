/**
 * Durable timed-override (hold) store + revert worker (F010, D3a/IM-02/OOH-4).
 *
 * A hold re-asserts an operator's value until its revert time, then restores the
 * captured original value. Requirements this module satisfies:
 *  - durable: holds live in OohOverrides (Cosmos in live mode) and survive restarts
 *  - single-owner: reverts are claimed with an optimistic-concurrency lease so a
 *    revert fires exactly once even with multiple replicas
 *  - no lost originals: if a device already has an active hold, a new hold inherits
 *    the ORIGINAL revert value and supersedes the old hold — two operators can't
 *    clobber each other's captured original
 *  - honest failure: a revert that cannot be confirmed becomes status=revert-failed
 *    and raises an F021 alert (rendered danger-highlighted in the F026 queue)
 */

import { randomUUID, createHash } from 'crypto';
import { hostname } from 'os';
import { collection, ConcurrencyError } from './store.js';
import * as tb from './tb-client.js';
import * as bridge from './bridge.js';
import * as killswitch from './killswitch.js';
import * as audit from './audit.js';
import { recordControlEvent, raiseAlert } from './metrics.js';

const WORKER_INTERVAL_MS = 30 * 1000;
const REVERT_CONFIRM_TIMEOUT_MS = 90 * 1000;
const LEASE_MS = 3 * 60 * 1000;
const OWNER = `${hostname()}-${process.pid}`;

let workerTimer = null;

/**
 * Creates a hold from a synced control action (called by control.js).
 * Returns the override id.
 */
export async function scheduleOverride(action) {
    const col = await collection('OohOverrides');

    // Supersede any active hold on the same device+attribute, inheriting its original
    const existing = (await col.query(o =>
        o.status === 'active' && o.deviceId === action.deviceId && o.attribute === action.attribute
    ))[0];
    let revertValue = action.previousValue;
    if (existing) {
        revertValue = existing.revertValue;
        existing.status = 'superseded';
        existing.supersededBy = action.actionId;
        await col.upsert(existing);
    }

    const doc = await col.upsert({
        id: randomUUID(),
        siteNo: action.siteNo,
        siteName: action.siteName,
        deviceId: action.deviceId,
        zone: action.zone,
        deviceType: action.deviceType,
        attribute: action.attribute,
        heldValue: action.value,
        revertValue,
        OohOverrideRevertAt: action.hold.revertAt,
        holdLabel: action.hold.label || null,
        createdBy: action.operator.name,
        createdById: action.operator.id,
        createdAt: new Date().toISOString(),
        sourceActionId: action.actionId,
        ticketId: action.ticketId || null,
        status: 'active',
        leaseOwner: null,
        leaseUntil: null
    });
    startWorker();
    return doc.id;
}

/**
 * Active holds (Admin table + read-only mirror for the F026 queue).
 */
export async function activeOverrides() {
    const col = await collection('OohOverrides');
    return (await col.query(o => ['active', 'reverting', 'revert-failed'].includes(o.status)))
        .sort((a, b) => a.OohOverrideRevertAt.localeCompare(b.OohOverrideRevertAt));
}

/**
 * Cancels a hold by reverting it immediately (Admin action, Popconfirm-guarded in UI).
 */
export async function cancelOverride(overrideId, operator) {
    const col = await collection('OohOverrides');
    const doc = await col.get(overrideId);
    if (!doc || !['active', 'revert-failed'].includes(doc.status)) {
        throw Object.assign(new Error('Hold not found or already finished'), { status: 404 });
    }
    doc.OohOverrideRevertAt = new Date().toISOString(); // due now
    doc.cancelRequestedBy = operator.name;
    await col.upsert(doc, { ifVersion: doc._version });
    await runWorkerOnce(); // revert promptly rather than waiting for the next tick
    const after = await col.get(overrideId);
    return after;
}

/**
 * Links the outcome ticket to a hold so revert notes can land on it.
 */
export async function attachTicketToOverride(overrideId, ticketId) {
    const col = await collection('OohOverrides');
    const doc = await col.get(overrideId);
    if (doc) { doc.ticketId = ticketId; await col.upsert(doc); }
}

/**
 * Starts the background revert worker (idempotent).
 */
export function startWorker() {
    if (workerTimer) return;
    workerTimer = setInterval(() => runWorkerOnce().catch(err =>
        console.error(`[OVERRIDES] Worker cycle failed: ${err.message}`)), WORKER_INTERVAL_MS);
    workerTimer.unref?.();
}

/**
 * One worker pass: claim due holds with a lease and revert them. Exported for tests.
 */
export async function runWorkerOnce() {
    const col = await collection('OohOverrides');
    const now = new Date().toISOString();
    const due = await col.query(o =>
        (o.status === 'active' && o.OohOverrideRevertAt <= now) ||
        // stale lease recovery: another replica died mid-revert
        (o.status === 'reverting' && o.leaseUntil && o.leaseUntil < now)
    );

    for (const doc of due) {
        let claimed;
        try {
            doc.status = 'reverting';
            doc.leaseOwner = OWNER;
            doc.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
            claimed = await col.upsert(doc, { ifVersion: doc._version });
        } catch (err) {
            if (err instanceof ConcurrencyError) continue; // another replica owns it — exactly-once
            throw err;
        }
        await revert(col, claimed);
    }
}

async function revert(col, doc) {
    const blocked = await killswitch.writesBlocked(doc.siteNo);
    if (blocked) {
        // Do not silently drop the revert — back to active, retried each cycle, alert raised
        doc.status = 'active';
        doc.leaseOwner = null;
        doc.leaseUntil = null;
        await col.upsert(doc);
        raiseAlert('revert-blocked', `Hold revert for ${doc.deviceId} (${doc.siteName}) is blocked by the kill-switch — will retry`);
        return;
    }

    try {
        const device = await bridge.getDevice(doc.siteNo, doc.deviceId) || {
            deviceId: doc.deviceId, deviceType: doc.deviceType, telemetry: {}
        };
        await tb.writeSharedAttribute(device, doc.attribute, doc.revertValue);

        // Confirm the revert echoed back before declaring it done
        const deadline = Date.now() + REVERT_CONFIRM_TIMEOUT_MS;
        let confirmed = false;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 3000));
            const { sync, reported } = await tb.readControlState(device, doc.attribute);
            if (sync === 'synced' && String(reported) === String(doc.revertValue)) { confirmed = true; break; }
            if (sync === 'failed' || sync === 'rejected') break;
        }

        doc.status = confirmed ? 'reverted' : 'revert-failed';
        doc.revertedAt = new Date().toISOString();
        doc.leaseOwner = null;
        doc.leaseUntil = null;
        await col.upsert(doc);

        await audit.logAction({
            actionType: 'revert',
            operator: null,
            siteNo: doc.siteNo,
            siteName: doc.siteName,
            deviceId: doc.deviceId,
            zone: doc.zone,
            detail: `Timed override revert: ${doc.attribute} → ${doc.revertValue} (held ${doc.heldValue} by ${doc.createdBy})${doc.cancelRequestedBy ? ` · cancelled early by ${doc.cancelRequestedBy}` : ''}`,
            outcome: confirmed ? 'synced' : 'revert-failed',
            ticketId: doc.ticketId
        });
        recordControlEvent(confirmed ? 'revert-ok' : 'revert-failed');
        if (!confirmed) raiseAlert('revert-failed', `Hold revert for ${doc.deviceId} (${doc.siteName}) was NOT confirmed by the device — manual check needed`);
    } catch (err) {
        console.error(`[OVERRIDES] Revert dispatch failed for ${doc.id}: ${err.message}`);
        doc.status = 'revert-failed';
        doc.leaseOwner = null;
        doc.leaseUntil = null;
        await col.upsert(doc);
        recordControlEvent('revert-failed');
        raiseAlert('revert-failed', `Hold revert for ${doc.deviceId} (${doc.siteName}) failed to dispatch: ${err.message}`);
    }
}
