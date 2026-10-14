/**
 * OOHDASH-123 Rosetta Stone — durable in-flight action store (design §7, build plan §5, WU10).
 *
 * With Salus now taking tens of minutes to confirm, a pod restart can silently drop a result. Each
 * in-flight action is persisted to the Cosmos container `OohActionInflight` (partition /storePartition
 * = "ooh") on dispatch, and read back by control.resumeInflight() on server start so the watcher is
 * re-armed. Records are retired by settle (delete-on-terminal); the resume safety sweep marks any
 * past-late-watch record INDETERMINATE even if its watcher was lost. No personal data is stored.
 *
 * All fields keep the `Ooh` context prefix (DATA_DICTIONARY governance). Best-effort by contract: the
 * caller wraps every call so a store outage degrades save-and-resume but never blocks a dispatch.
 */

import { collection } from './store.js';

const COLLECTION = 'OohActionInflight';

/** Persist a freshly-dispatched action as an in-flight record. */
export async function persist(action) {
    const col = await collection(COLLECTION);
    await col.upsert({
        id: action.actionId,
        storePartition: 'ooh',
        OohActionId: action.actionId,
        OohActionDevice: action.deviceId,
        OohActionSiteNo: action.siteNo,
        OohActionSiteName: action.siteName,
        OohActionZone: action.zone,
        OohActionCapability: action.command,
        OohActionType: action.actionType,
        OohActionRequestedValue: action.requestedValue,
        OohActionDispatchAt: new Date(action.dispatchTs).toISOString(),
        OohActionConfirmKey: action.confirmKey,
        OohActionConfirmLimitAt: new Date(action.confirmLimitAt).toISOString(),
        OohActionLateWatchUntil: new Date(action.lateWatchUntil).toISOString(),
        OohActionState: 'in-flight',
        OohActionAuditId: action.auditId,
        OohActionTicketId: action.ticketId || null
    });
}

/** Merge a patch into an existing in-flight record (e.g. attach ticket, flip state to indeterminate). */
export async function update(actionId, patch) {
    const col = await collection(COLLECTION);
    const doc = await col.get(actionId);
    if (!doc) return;
    await col.upsert({ ...doc, ...patch });
}

/** Retire a settled action — delete-on-terminal (confirmed / non-delivery). */
export async function retire(actionId /* , finalState */) {
    const col = await collection(COLLECTION);
    await col.delete(actionId);
}

/** All records still in flight (for resume-on-load). */
export async function listInflight() {
    const col = await collection(COLLECTION);
    return col.query(d => d.OohActionState === 'in-flight');
}
