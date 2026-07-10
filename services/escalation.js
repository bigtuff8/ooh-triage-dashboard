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
        return { provider: 'twilio' };
    }
    // 'log' provider — dispatch recorded, nothing sent
    console.warn(`[SMS:log] Would send to ${to || '(no on-duty number configured)'}: ${body}`);
    return { provider: 'log' };
}

/**
 * Sends the P1 text and records the dispatch. Returns the SMS log entry.
 * SMS failure never blocks the escalation outcome — it raises an F021 alert.
 */
export async function escalateP1({ operator, siteNo, siteName, ticketId, summary }) {
    const link = buildEscalationLink(ticketId);
    const body = `OOH P1 — ${siteName} (${siteNo}): ${summary}. Ticket #${ticketId}: ${link}`;
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
        dispatchOk: false,
        OohP1AckAt: null,
        OohP1AckBy: null
    };
    try {
        await sendViaProvider(config.sms.onDutyNumber, body);
        entry.dispatchOk = true;
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
