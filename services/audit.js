/**
 * App action audit log (feeds the Tonight view, F026 review queue mirror,
 * and the F021/F022 metrics).
 *
 * Every entry carries the real operator identity (OohOperatorIdentity) — never
 * the API service account. Audit write failures never block the business action;
 * they are logged as errors for investigation (security-standards: audit logging
 * must not fail silently).
 */

import { randomUUID } from 'crypto';
import { collection } from './store.js';

/**
 * Records an audit entry. OohActionType values: setpoint-up | setpoint-down |
 * heating-off-frost | heating-off-mode | hw-boost | capture | escalate-p1 |
 * scope-only | no-action | query | note | revert | admin-*.
 */
export async function logAction({ actionType, operator, siteNo, siteName, deviceId, zone, detail, outcome, ticketId, controlActionId, OohCaptureClass }) {
    const entry = {
        id: randomUUID(),
        OohActionType: actionType,
        OohOperatorIdentity: operator ? `${operator.name} (${operator.email || operator.id})` : 'system',
        operatorId: operator?.id || 'system',
        operatorName: operator?.name || 'system',
        siteNo: siteNo || null,
        siteName: siteName || null,
        deviceId: deviceId || null,
        zone: zone || null,
        detail: detail || '',
        outcome: outcome || null,
        ticketId: ticketId || null,
        controlActionId: controlActionId || null,
        OohCaptureClass: OohCaptureClass || null,
        OohActionAt: new Date().toISOString()
    };
    try {
        const col = await collection('OohAuditLog');
        await col.upsert(entry);
    } catch (err) {
        console.error(`[AUDIT] Failed to persist audit entry (${actionType} ${siteNo}): ${err.message}`);
    }
    return entry;
}

/**
 * Attaches the outcome ticket to an existing audit entry (control actions are
 * audited at dispatch; the ticket is created at outcome time).
 */
export async function attachTicket(auditId, ticketId) {
    try {
        const col = await collection('OohAuditLog');
        const entry = await col.get(auditId);
        if (!entry) return;
        entry.ticketId = ticketId;
        await col.upsert(entry);
    } catch (err) {
        console.error(`[AUDIT] Failed to attach ticket to audit entry ${auditId}: ${err.message}`);
    }
}

/**
 * Records the Zendesk Talk call ticket reconciled to an outcome (F003 provenance).
 * outcome is one of merged|linked|ambiguous|none; callTicketId is null when nothing matched.
 */
export async function attachReconciledCallTicket(auditId, callTicketId, reconcileOutcome) {
    if (!auditId) return;
    try {
        const col = await collection('OohAuditLog');
        const entry = await col.get(auditId);
        if (!entry) return;
        entry.OohReconciledCallTicketId = callTicketId ?? null;
        entry.OohReconcileOutcome = reconcileOutcome || null;
        await col.upsert(entry);
    } catch (err) {
        console.error(`[AUDIT] Failed to attach reconciled call ticket to audit entry ${auditId}: ${err.message}`);
    }
}

/**
 * Updates the outcome of an existing audit entry (e.g. timeout → late sync).
 */
export async function updateOutcome(auditId, outcome, extraDetail) {
    try {
        const col = await collection('OohAuditLog');
        const entry = await col.get(auditId);
        if (!entry) return;
        entry.outcome = outcome;
        if (extraDetail) entry.detail += ` · ${extraDetail}`;
        await col.upsert(entry);
    } catch (err) {
        console.error(`[AUDIT] Failed to update audit entry ${auditId}: ${err.message}`);
    }
}

/**
 * Start of the current OOH period: 17:00 today, or the previous 17:00 if we're
 * before it (covers overnight shifts); weekends roll back to Friday 17:00 only
 * in the sense that everything since the last weekday-17:00 boundary shows.
 */
export function oohPeriodStart(nowDate = new Date()) {
    const start = new Date(nowDate);
    start.setHours(17, 0, 0, 0);
    if (start > nowDate) start.setDate(start.getDate() - 1);
    return start;
}

/**
 * Entries since the current OOH period start, newest first (Tonight view).
 */
export async function entriesTonight() {
    const since = oohPeriodStart().toISOString();
    const col = await collection('OohAuditLog');
    const rows = await col.query(e => e.OohActionAt >= since);
    return rows.sort((a, b) => b.OohActionAt.localeCompare(a.OohActionAt));
}

/**
 * Entries since an arbitrary ISO timestamp (metrics windows).
 */
export async function entriesSince(sinceIso) {
    const col = await collection('OohAuditLog');
    return (await col.query(e => e.OohActionAt >= sinceIso))
        .sort((a, b) => b.OohActionAt.localeCompare(a.OohActionAt));
}
