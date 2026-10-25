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
import * as confirm from './confirm.js';
import * as bridge from './bridge.js';
import * as killswitch from './killswitch.js';
import * as audit from './audit.js';
import * as registry from './registry.js';
import { recordControlEvent, raiseAlert } from './metrics.js';
import { config } from '../config.js';
// Lazy import to avoid static-binding issues under the test module-mocking framework.
const _zendesk = () => import('./zendesk.js');

const WORKER_INTERVAL_MS = 30 * 1000;
// OOHDASH-123 (WU14): the revert confirm uses the per-class confirm limit, but a single worker pass must
// not block for the full Salus window (up to 45 min). We poll up to this synchronous cap; if the revert
// has been dispatched but not yet confirmed, the doc stays 'reverting' and a later cycle RE-CONFIRMS
// (without re-dispatching) until the per-class late-watch horizon — no false revert-failed alert fires.
const REVERT_CONFIRM_CAP_MS = 3 * 60 * 1000;
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
    // OOHDASH-141: for boiler-panel, action.revertValue is always explicitly set to 0 (auto).
    // For all other types, fall back to action.previousValue (the captured original).
    let revertValue = action.revertValue !== undefined ? action.revertValue : action.previousValue;
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
        leaseUntil: null,
        // OOHDASH-141: boiler-specific fields (undefined values are omitted cleanly).
        ...(action.panelVersion !== undefined ? { panelVersion: action.panelVersion } : {}),
        ...(action.boilerZone !== undefined ? { boilerZone: action.boilerZone } : {}),
        ...(action.direction !== undefined ? { direction: action.direction } : {}),
        ...(action.footprint !== undefined ? { footprint: action.footprint } : {}),
        ...(action.d2CeilingAtMs !== undefined ? { d2CeilingAtMs: action.d2CeilingAtMs } : {}),
        ...(action.clampedFromMin !== undefined ? { clampedFromMin: action.clampedFromMin } : {})
    });
    startWorker();
    return doc.id;
}

/**
 * OOHDASH-144: active boiler-panel holds for a specific site (for the workspace banner and
 * flow intercept). Reads from the in-memory Cosmos store; a read error returns null (fail-soft).
 *
 * Maps each doc to { id, deviceId, boilerZone, direction, panelVersion, revertAt, holdLabel,
 * createdBy, ticketId, ending }, sorted by boilerZone.
 * `ending` = true when a cancel or revert attempt is already in progress.
 */
export async function activeBoostHoldsForSite(siteNo) {
    try {
        const col = await collection('OohOverrides');
        const docs = await col.query(o =>
            o.status === 'active' &&
            o.deviceType === 'boiler-panel' &&
            String(o.siteNo) === String(siteNo)
        );
        return docs
            .sort((a, b) => (a.boilerZone || '').localeCompare(b.boilerZone || ''))
            .map(o => ({
                id: o.id,
                deviceId: o.deviceId,
                boilerZone: o.boilerZone || null,
                direction: o.direction || null,
                panelVersion: o.panelVersion || null,
                revertAt: o.OohOverrideRevertAt || null,
                holdLabel: o.holdLabel || null,
                createdBy: o.createdBy || null,
                ticketId: o.ticketId || null,
                ending: !!(o.cancelRequestedBy || o.revertAttempts)
            }));
    } catch (err) {
        console.error(`[OVERRIDES] activeBoostHoldsForSite failed for ${siteNo}: ${err.message}`);
        return null;
    }
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
    // OOHDASH-141: boiler-panel has its own revert path with kill-switch exemption and
    // direction-based identity. Branch first before the standard kill-switch check.
    if (doc.deviceType === 'boiler-panel') {
        return await revertBoiler(col, doc);
    }

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
        const contract = registry.capabilitiesContractFor(device.deviceType);
        let confirmed = false, rejected = false, rawError = null, stillPending = false;

        if (doc.revertDispatchedTs) {
            // RE-CONFIRM a revert already dispatched on a prior cycle — read once, classify, do NOT
            // re-fire (a slow Salus revert legitimately takes minutes; we just keep checking).
            const st = await tb.readCommandState(device, device.deviceType);
            const oc = confirm.classifyOutcome(st, doc.revertValue, doc.revertDispatchedTs, contract);
            if (oc === 'CONFIRMED') confirmed = true;
            else if (oc === 'NON-DELIVERY') { rejected = true; rawError = st.lastError; }
            else stillPending = true;
        } else {
            // Edge-safe revert (OOHDASH-123 WU14): judge from the device's own confirming telemetry. If
            // the device already reads the revert value (its own schedule reclaimed the slot), it is
            // truthfully reverted with no write — no false revert-failed.
            const edge = await confirm.preDispatchCheck(tb, device, device.deviceType, doc.revertValue, contract);
            if (edge.outcome === 'already-satisfied') {
                confirmed = true;
            } else {
                // Write the Requested key so the gate dispatches, then confirm with the three-outcome rule.
                const dispatchTs = await tb.writeServerScopeAttribute(device, doc.attribute, doc.revertValue);
                doc.revertDispatchedTs = dispatchTs;
                if (contract.copyMinutes != null) {
                    // Slow (Salus) class — do NOT block the worker for minutes; re-confirm on later cycles.
                    stillPending = true;
                } else {
                    // Fast (Tuya) class — confirm synchronously within a bounded window.
                    const cap = Math.min(contract.confirmLimitMs || REVERT_CONFIRM_CAP_MS, REVERT_CONFIRM_CAP_MS);
                    const pollMs = Math.min(contract.confirmPollMs || 3000, 5000);
                    const deadline = Date.now() + cap;
                    while (Date.now() < deadline) {
                        await new Promise(r => setTimeout(r, pollMs));
                        const st = await tb.readCommandState(device, device.deviceType);
                        const oc = confirm.classifyOutcome(st, doc.revertValue, dispatchTs, contract);
                        if (oc === 'CONFIRMED') { confirmed = true; break; }
                        if (oc === 'NON-DELIVERY') { rejected = true; rawError = st.lastError; break; }
                    }
                    if (!confirmed && !rejected) stillPending = true;
                }
            }
        }

        // A still-pending revert past its per-class late-watch horizon is given up (real alert); before
        // that it stays dispatched and is re-confirmed on a later cycle — NO false revert-failed alert.
        const lateWatchUntil = (doc.revertDispatchedTs || Date.now()) + (contract.lateWatchMs || REVERT_CONFIRM_CAP_MS);
        if (stillPending && Date.now() <= lateWatchUntil) {
            doc.status = 'active';          // keep due so a later cycle re-confirms (revertDispatchedTs guards re-fire)
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
            return;                         // no audit row / alert yet — the revert is in flight
        }

        confirmed = confirmed && !rejected;
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
            detail: `Timed override revert: ${doc.attribute} → ${doc.revertValue} (held ${doc.heldValue} by ${doc.createdBy})${doc.cancelRequestedBy ? ` · cancelled early by ${doc.cancelRequestedBy}` : ''}${rawError ? ` · gate/vendor: ${String(rawError).slice(0, 200)}` : ''}`,
            outcome: confirmed ? 'confirmed' : 'revert-failed',
            ticketId: doc.ticketId
        });
        recordControlEvent(confirmed ? 'revert-ok' : 'revert-failed');
        if (!confirmed) raiseAlert('revert-failed', `Hold revert for ${doc.deviceId} (${doc.siteName}) was ${rejected ? 'rejected by the gate/vendor' : 'NOT confirmed within its window'} — manual check needed`);
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

/* ------------------------------------------------------------------ */
/* OOHDASH-141 — boiler-panel revert path                              */
/* ------------------------------------------------------------------ */

/**
 * Revert a boiler-panel hold. Branches from revert() before the standard kill-switch check.
 * Implements design §6: direction-based identity, kill-switch exemption, bounded retry.
 */
async function revertBoiler(col, doc) {
    const exempt = config.boilerBoost?.revertExempt === 'all';

    // Kill-switch: when NOT exempt, check and bounce like the standard path.
    if (!exempt) {
        const blocked = await killswitch.writesBlocked(doc.siteNo);
        if (blocked) {
            doc.status = 'active';
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
            raiseAlert('revert-blocked', `Boiler hold revert for ${doc.deviceId} ${doc.boilerZone} blocked by kill-switch — will retry`);
            return;
        }
    } else {
        console.log(`[BOILER-REVERT-EXEMPT] processing revert for ${doc.deviceId} ${doc.boilerZone} (exempt from kill-switch + WRITES_DISABLED)`);
    }

    try {
        const device = await bridge.getDevice(doc.siteNo, doc.deviceId) || {
            deviceId: doc.deviceId, deviceType: doc.deviceType, telemetry: {}
        };
        const version = doc.panelVersion || 'v2';
        const zone = doc.boilerZone;
        const held = doc.heldValue; // ±1

        // Read current state for identity check
        const { zones: zoneStates } = await tb.readBoilerState(device, version, [zone]);
        const zState = zoneStates[0];
        const liveDir = zState?.dir ?? 0;

        let revertOutcome = null;
        let ticketNote = null;
        let shouldWrite = false;

        if (liveDir === 0) {
            // Already on auto — timetable change or panel cleared it
            revertOutcome = 'already-auto';
            ticketNote = 'already-auto';
        } else if (liveDir === -held) {
            // Opposite direction — someone else forced it the other way
            revertOutcome = 'superseded-by-other';
            ticketNote = 'superseded';
            raiseAlert('boost-superseded', `Boiler zone ${zone} on ${doc.deviceId} (${doc.siteName}) was superseded by an opposite override — not reverting`);
        } else {
            // liveDir === held: zone is still in our direction
            if (version === 'v1') {
                const attrTs = zState?.attrTs;
                const docAttrTs = doc.footprint?.attrTs ?? null;
                if (docAttrTs === null || attrTs === docAttrTs) {
                    // Our write, or no footprint recorded (IN-FLIGHT-TIMEOUT) — revert
                    shouldWrite = true;
                } else if (attrTs !== docAttrTs) {
                    // Attr ts changed — someone re-applied
                    if (held === 1) {
                        // ON: D2 wins — always revert to respect 01:00 rule
                        shouldWrite = true;
                    } else {
                        // OFF: decision 2 (leave it, alert)
                        revertOutcome = 'same-direction-skip';
                        ticketNote = 'same-direction-skip';
                        raiseAlert('boost-same-direction-re-override', `Boiler zone ${zone} OFF on ${doc.deviceId} — someone re-applied OFF; leaving as-is (D2 does not apply to OFF)`);
                    }
                }
            } else {
                // V2: cannot tell apart, always revert
                shouldWrite = true;
            }
        }

        if (!shouldWrite) {
            // Non-write resolution
            doc.status = revertOutcome === 'already-auto' ? 'reverted' : 'reverted';
            if (revertOutcome === 'superseded-by-other') doc.status = 'superseded-by-other';
            if (revertOutcome === 'same-direction-skip') doc.status = 'reverted'; // mark reverted, no write
            doc.revertOutcome = revertOutcome; // OOHDASH-144: persist for cancel-route result
            doc.revertedAt = new Date().toISOString();
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
            await audit.logAction({ actionType: 'boiler-revert', operator: null, siteNo: doc.siteNo, siteName: doc.siteName, deviceId: doc.deviceId, zone: doc.zone, detail: `Boiler zone ${zone} revert: ${revertOutcome}`, outcome: doc.status, ticketId: doc.ticketId });
            recordControlEvent('revert-ok');
            if (doc.ticketId && ticketNote) {
                try { await (await _zendesk()).addBoostRevertNote(doc.ticketId, doc, ticketNote); } catch (e) { console.error(`[OVERRIDES] boost ticket note failed: ${e.message}`); }
            }
            return;
        }

        // Write: revert to auto
        const preRevert = zState;
        await tb.revertBoilerZoneToAuto(device, version, zone);

        // Confirm: poll up to 20s for override=0
        const CONFIRM_MS = 20000;
        const POLL_MS = 1000;
        const deadline = Date.now() + CONFIRM_MS;
        let confirmed = false;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, POLL_MS));
            const { zones: postZones } = await tb.readBoilerState(device, version, [zone]);
            const postZ = postZones[0];
            const postDir = postZ?.dir ?? 0;
            if (postDir === 0) {
                if (version === 'v2') {
                    // V2: check overrideTs advanced (confirms new sample)
                    const preTs = preRevert?.overrideTs ?? 0;
                    if ((postZ?.overrideTs ?? 0) > preTs) { confirmed = true; break; }
                    // If overrideTs is null or same but dir=0, accept it (panel may not echo ts)
                    if (postZ?.overrideTs == null) { confirmed = true; break; }
                } else {
                    // V1: attrTs should have advanced from the revert write
                    const preAttrTs = preRevert?.attrTs ?? 0;
                    if ((postZ?.attrTs ?? 0) > preAttrTs) { confirmed = true; break; }
                    if (postZ?.attrTs == null) { confirmed = true; break; }
                }
            }
        }

        if (confirmed) {
            const confirmedAtMs = Date.now();
            doc.status = 'reverted';
            doc.revertOutcome = 'written'; // OOHDASH-144: persisted for cancel-route result
            doc.revertedAt = new Date().toISOString();
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
            await audit.logAction({ actionType: 'boiler-revert', operator: null, siteNo: doc.siteNo, siteName: doc.siteName, deviceId: doc.deviceId, zone: doc.zone, detail: `Boiler zone ${zone} reverted to auto (confirmed)`, outcome: 'confirmed', ticketId: doc.ticketId });
            recordControlEvent('revert-ok');
            if (doc.ticketId) {
                try { await (await _zendesk()).addBoostRevertNote(doc.ticketId, doc, 'reverted'); } catch (e) { console.error(`[OVERRIDES] boost ticket note failed: ${e.message}`); }
            }
            // §6.5 late-revert check for ON boosts
            if (doc.direction === 'on' && doc.d2CeilingAtMs && confirmedAtMs > doc.d2CeilingAtMs + 2 * 60000) {
                const lateMin = Math.round((confirmedAtMs - doc.d2CeilingAtMs) / 60000);
                const note = `Heating ran past 01:00 by approximately ${lateMin} min (revert confirmed late). Manual check may be needed.`;
                raiseAlert('d2-late-revert', `${doc.deviceId} ${zone}: ${note}`);
                if (doc.ticketId) {
                    try { await (await _zendesk()).addBoostRevertNote(doc.ticketId, doc, 'd2-late-revert'); } catch (e) { console.error(`[OVERRIDES] late-revert note failed: ${e.message}`); }
                }
            }
        } else {
            // Not confirmed — bounded retry (§6.4): retry every 5 min for up to 12h
            const attempts = (doc.revertAttempts || 0) + 1;
            const maxRetryMs = 12 * 60 * 60 * 1000;
            const elapsedMs = Date.now() - new Date(doc.createdAt).getTime();
            if (elapsedMs < maxRetryMs) {
                doc.status = 'active';
                doc.revertAttempts = attempts;
                doc.lastRevertAttemptAt = new Date().toISOString();
                doc.OohOverrideRevertAt = new Date(Date.now() + 5 * 60000).toISOString();
                doc.leaseOwner = null;
                doc.leaseUntil = null;
                await col.upsert(doc);
                raiseAlert('revert-failed', `Boiler zone ${zone} on ${doc.deviceId} revert NOT confirmed (attempt ${attempts}) — retrying in 5 min`);
            } else {
                doc.status = 'revert-failed';
                doc.revertAttempts = attempts;
                doc.lastRevertAttemptAt = new Date().toISOString();
                doc.revertedAt = new Date().toISOString();
                doc.leaseOwner = null;
                doc.leaseUntil = null;
                await col.upsert(doc);
                await audit.logAction({ actionType: 'boiler-revert', operator: null, siteNo: doc.siteNo, siteName: doc.siteName, deviceId: doc.deviceId, zone: doc.zone, detail: `Boiler zone ${zone} revert FAILED after ${attempts} attempts`, outcome: 'revert-failed', ticketId: doc.ticketId });
                recordControlEvent('revert-failed');
                raiseAlert('revert-failed', `Boiler zone ${zone} on ${doc.deviceId} (${doc.siteName}) — may still be forced ON/OFF — manual check needed`);
                if (doc.ticketId) {
                    try { await (await _zendesk()).addBoostRevertNote(doc.ticketId, doc, 'revert-failed'); } catch (e) { console.error(`[OVERRIDES] boost ticket note failed: ${e.message}`); }
                }
            }
        }
    } catch (err) {
        console.error(`[OVERRIDES] Boiler revert failed for ${doc.id}: ${err.message}`);
        const attempts = (doc.revertAttempts || 0) + 1;
        const maxRetryMs = 12 * 60 * 60 * 1000;
        const elapsedMs = Date.now() - new Date(doc.createdAt).getTime();
        if (elapsedMs < maxRetryMs) {
            doc.status = 'active';
            doc.revertAttempts = attempts;
            doc.lastRevertAttemptAt = new Date().toISOString();
            doc.OohOverrideRevertAt = new Date(Date.now() + 5 * 60000).toISOString();
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
        } else {
            doc.status = 'revert-failed';
            doc.revertAttempts = attempts;
            doc.leaseOwner = null;
            doc.leaseUntil = null;
            await col.upsert(doc);
            recordControlEvent('revert-failed');
            raiseAlert('revert-failed', `Boiler zone ${doc.boilerZone} on ${doc.deviceId} (${doc.siteName}) failed to revert: ${err.message}`);
        }
    }
}
