/**
 * P1 escalation (F014, SR-6/Q-F).
 *
 * P1 determination is SYSTEM-decided in the flows (contractor-on-site, vulnerable
 * occupants, business-critical kitchen during service, stock at risk). This module
 * sends the text message to the on-duty escalation manager with a deep-link to the
 * ticket in the IoT Support dashboard (OohP1EscalationLink), and tracks the
 * dispatch/acknowledgement record (OohSmsLog) for the P1 log + SLA metric.
 *
 * Providers:
 *   log    → records the dispatch without sending (dev/fixture; also the safe default
 *            until the SMS gateway decision lands — Q-F, blocked on Spencer/James)
 *   twilio → Twilio REST API (credentials via config; no SDK dependency)
 *
 * Self-paging exclusion: only flow outcomes call escalateP1 — dashboard-originated
 * ticket updates never route through this module, so the app cannot page itself.
 */

import { randomUUID } from 'crypto';
import axios from 'axios';
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

async function sendViaProvider(to, body) {
    if (config.sms.provider === 'twilio') {
        const { accountSid, authToken, from } = config.sms.twilio;
        if (!accountSid || !authToken || !from) throw new Error('Twilio provider selected but not configured');
        await axios.post(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            new URLSearchParams({ To: to, From: from, Body: body }),
            { auth: { username: accountSid, password: authToken }, timeout: 15000 }
        );
        return { provider: 'twilio', sent: true };
    }
    // 'log' provider — dispatch recorded, nothing sent. `sent: false` is what makes dispatchOk
    // honest: a log-mode no-op must NOT be recorded as a successful dispatch (Test 11c).
    console.warn(`[SMS:log] Would send to ${to || '(no on-duty number configured)'}: ${body}`);
    return { provider: 'log', sent: false };
}

/**
 * The ONLY verified escalation origin. The sole live caller — the OOH dashboard's own outcome
 * endpoint (routes/api.js) — asserts this value because it has itself just created an OOH-categorised
 * ticket (the `ooh`/`ooh_p1` tags, the "Support Request" ticket-category, the [OOH] subject prefix).
 * The flag is the in-code proxy for "this P1 carries the OOH categorisation." Any other value — or
 * none — is NOT a verified OOH-dashboard P1 and must never page (fail-closed). See DESIGN-GATE §1A/§3.
 */
export const OOH_ORIGIN = 'ooh-dashboard';

/**
 * Sends the P1 text and records the dispatch. Returns the SMS log entry.
 * SMS failure never blocks the escalation outcome — it raises an F021 alert.
 *
 * `origin` (§1A, fail-closed): the text is sent ONLY for a P1 raised from the OOH dashboard. The
 * origin defaults to undefined, so a caller that does not explicitly assert OOH origin cannot page.
 */
export async function escalateP1({ operator, siteNo, siteName, ticketId, summary, origin }) {
    const link = buildEscalationLink(ticketId);
    const body = `OOH P1 — ${siteName} (${siteNo}): ${summary}. Ticket #${ticketId}: ${link}`;
    const originVerified = origin === OOH_ORIGIN;
    const entry = {
        id: randomUUID(),
        OohP1EscalationLink: link,
        ticketId,
        siteNo,
        siteName,
        summary,
        sentTo: config.sms.onDutyName,
        sentToNumber: config.sms.onDutyNumber ? '(configured)' : '(not configured)', // never persist the raw number
        dispatchedBy: operator.name,
        dispatchedAt: new Date().toISOString(),
        provider: config.sms.provider,
        origin: origin ?? null,
        dispatchReason: null,
        dispatchOk: false,
        OohP1AckAt: null,
        OohP1AckBy: null
    };

    // State 0 (§1A) — fail-closed OOH-origin guard, BEFORE any send. If the origin is absent, unknown,
    // or anything other than the verified OOH marker, we do NOT call sendViaProvider(): record the
    // dispatch as not-sent with a distinct reason, raise an internal alert, persist the log entry, and
    // return — so the handler still sees the honest "phone the on-duty manager now" card (same safe
    // surface as log mode) and the P1 outcome is never blocked. This is belt-and-braces on top of the
    // structural fact that escalateP1 has exactly one (OOH) caller and BAU alarms never enter this app.
    if (!originVerified) {
        entry.dispatchReason = 'origin-unverified';
        console.warn(`[SMS] P1 dispatch BLOCKED for ticket ${ticketId}: origin '${origin ?? '(absent)'}' is not a verified OOH-dashboard P1 — not sending`);
        raiseAlert('p1-escalation-origin-unverified', `P1 SMS for ticket #${ticketId} (${siteName}) NOT sent — escalation origin '${origin ?? '(absent)'}' is not a verified OOH-dashboard P1; phone the on-duty manager manually`);
        try {
            const col = await collection('OohSmsLog');
            await col.upsert(entry);
        } catch (err) {
            console.error(`[SMS] Failed to persist SMS log entry: ${err.message}`);
        }
        return entry;
    }

    try {
        const result = await sendViaProvider(config.sms.onDutyNumber, body);
        // dispatchOk is true ONLY on a genuine transmission (twilio 2xx). Log-mode returns
        // sent:false, so a no-op is never recorded as a send (Test 11c).
        entry.dispatchOk = (result?.sent !== false);
    } catch (err) {
        console.error(`[SMS] P1 dispatch failed for ticket ${ticketId}: ${err.message}`);
        raiseAlert('sms-dispatch-failed', `P1 SMS for ticket #${ticketId} (${siteName}) failed to send — chase manually`);
    }
    try {
        const col = await collection('OohSmsLog');
        await col.upsert(entry);
    } catch (err) {
        console.error(`[SMS] Failed to persist SMS log entry: ${err.message}`);
    }
    return entry;
}

/**
 * Records acknowledgement of a P1 (from the IoT Support dashboard via shared store,
 * or the Admin page) — feeds the P1 SLA metric.
 */
export async function acknowledgeP1(smsId, actorName) {
    const col = await collection('OohSmsLog');
    const entry = await col.get(smsId);
    if (!entry) throw Object.assign(new Error('P1 record not found'), { status: 404 });
    entry.OohP1AckAt = new Date().toISOString();
    entry.OohP1AckBy = actorName;
    await col.upsert(entry);
    return entry;
}

/**
 * P1 dispatch log, newest first (Admin + F026 P1 log tab).
 */
export async function smsLog(limit = 50) {
    const col = await collection('OohSmsLog');
    return (await col.query(() => true))
        .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt))
        .slice(0, limit);
}
