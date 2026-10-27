/**
 * P1 escalation log (OOHDASH-153, Approach B clean-up).
 *
 * Records a positive audit entry when a P1 ticket is raised with the ooh_p1 tag.
 * There is no SMS provider here — the page is sent by the IoT Support Dashboard
 * when it sees the ooh_p1 ticket (Approach B, contract in
 * docs/project/HANDOFF_OOH-to-IoT-Support_p1-sms-contract.md).
 *
 * The OohSmsLog collection name is kept so the P1 SLA metric (services/metrics.js)
 * and any legacy entries remain compatible across a standard image rollback.
 */

import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { collection } from './store.js';
import { raiseAlert } from './metrics.js';

/**
 * Builds the deep-link that lands directly on the ticket detail in the
 * IoT Support dashboard (F026 item 1 owns the landing behaviour).
 */
export function buildEscalationLink(ticketId) {
    return `${config.iotDashBaseUrl}/?ticket=${ticketId}`;
}

/**
 * Records a positive P1 audit entry in the OohSmsLog collection.
 * The dispatchedAt field is kept under that name so services/metrics.js
 * P1 SLA maths and any legacy entries continue to work without change.
 *
 * Fail-safe: a store write failure never blocks the P1 outcome.
 * The Zendesk ticket with the ooh_p1 tag already exists and the
 * IoT Support Dashboard page still fires. A raiseAlert makes the
 * missing Admin row visible.
 *
 * Returns the entry (written or synthetic on failure).
 */
export async function recordP1Raised({ operator, siteNo, siteName, ticketId, summary }) {
    const link = buildEscalationLink(ticketId);
    const entry = {
        id: randomUUID(),
        ticketId,
        siteNo,
        siteName,
        summary,
        raisedBy: operator.name,
        dispatchedAt: new Date().toISOString(), // kept for metrics.js SLA maths + legacy rows
        OohP1EscalationLink: link,
        status: 'P1 ticket raised with ooh_p1 tag; OOH side complete; IoT Support Dashboard will page the on-duty manager.',
        OohP1AckAt: null,
        OohP1AckBy: null
    };

    try {
        const col = await collection('OohSmsLog');
        await col.upsert(entry);
    } catch (err) {
        console.error(`[P1-LOG] Failed to persist P1 log entry for ticket #${ticketId}: ${err.message}`);
        raiseAlert('p1-log-write-failed', `P1 log entry for ticket #${ticketId} (${siteName}) failed to write — the P1 outcome was not blocked; the Admin log row is missing`);
    }

    return entry;
}

/**
 * P1 escalation log, newest first (Admin + F026 P1 log tab).
 */
export async function p1Log(limit = 50) {
    const col = await collection('OohSmsLog');
    return (await col.query(() => true))
        .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt))
        .slice(0, limit);
}

/**
 * Records acknowledgement of a P1 (from the IoT Support dashboard via shared store,
 * or the Admin page) — feeds the P1 SLA metric.
 */
export async function acknowledgeP1(p1Id, actorName) {
    const col = await collection('OohSmsLog');
    const entry = await col.get(p1Id);
    if (!entry) throw Object.assign(new Error('P1 record not found'), { status: 404 });
    entry.OohP1AckAt = new Date().toISOString();
    entry.OohP1AckBy = actorName;
    await col.upsert(entry);
    return entry;
}
