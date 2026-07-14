/**
 * Zendesk integration (F011 outcome tickets · F013 callback lookup · F015 feedback
 * notes · F017 capture-and-escalate).
 *
 * Every OOH outcome writes a ticket tagged `ooh` with a `[TRG]` internal comment
 * carrying the real operator identity (OohOperatorIdentity) — the ticket requester
 * is the API service account, so identity ALWAYS also lives in the comment body.
 *
 * fixture mode → tickets are simulated in-memory (seeded from the design dataset)
 * so no live Zendesk writes happen in dev/tests. live mode → real API.
 */

import axios from 'axios';
import { config } from '../config.js';

const live = () => config.dataMode === 'live';
const baseUrl = () => `https://${config.zendesk.subdomain}.zendesk.com/api/v2`;
const authHeader = () => ({
    Authorization: `Basic ${Buffer.from(`${config.zendesk.email}/token:${config.zendesk.apiToken}`).toString('base64')}`,
    'Content-Type': 'application/json'
});

let zendeskHealthy = true;

async function zd(method, path, data, params) {
    try {
        const res = await axios({ method, url: `${baseUrl()}${path}`, data, params, headers: authHeader(), timeout: 15000 });
        zendeskHealthy = true;
        return res.data;
    } catch (err) {
        zendeskHealthy = false;
        throw err;
    }
}

/* ------------------------------------------------------------------ */
/* Site tag resolution (Zendesk Site field 11405878329244 ↔ TB siteNo) */
/* ------------------------------------------------------------------ */

let siteOptionsCache = { at: 0, options: [] };

async function resolveSiteTag(siteNo) {
    if (!live()) return `fixture::site::${siteNo}`;
    try {
        if (Date.now() - siteOptionsCache.at > 60 * 60 * 1000) {
            const all = [];
            let url = `/ticket_fields/${config.zendesk.siteFieldId}/options.json?per_page=100`;
            while (url) {
                const data = await zd('GET', url);
                all.push(...(data.custom_field_options || []));
                url = data.next_page ? data.next_page.replace(baseUrl(), '') : null;
            }
            siteOptionsCache = { at: Date.now(), options: all };
        }
        // House ID is embedded in the option name/value — require exactly one match
        const matches = siteOptionsCache.options.filter(o =>
            new RegExp(`(^|[^0-9])${siteNo}([^0-9]|$)`).test(o.name) || o.value.includes(siteNo));
        return matches.length === 1 ? matches[0].value : null;
    } catch (err) {
        console.error(`[ZD] Site tag resolution failed for ${siteNo}: ${err.message}`);
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Fixture ticket store (dev/tests only)                               */
/* ------------------------------------------------------------------ */

// In-memory by design: ids restart at 45121 on every boot, so after a dev-server
// restart the durable audit log can reference ids that now belong to different
// fixture tickets. Impossible in live mode (Zendesk assigns real ids); accepted
// for dev (tester finding 7, 2026-07-11).
let fixtureSeq = 45121;
const fixtureTickets = [
    { id: 45097, siteNo: '6234', subject: 'No hot water — intermittent', status: 'hold', custom_status_id: 25999056633884, priority: 'normal', created_at: daysAgo(3), updated_at: daysAgo(1), tags: ['ooh'], visit: true, comments: [
        { public: false, body: '[TRG] Call taken by OOH — no hot water, boost applied (2h), issue recurred · Operator: Test Handler', created_at: daysAgo(3) },
        { public: false, body: 'IoT team review — DHW sensor suspected, Bellrock visit requested', created_at: daysAgo(2) }] },
    { id: 45102, siteNo: '6360', subject: 'Accommodation heating — thermostat capped at 21', status: 'open', custom_status_id: 25999053444508, priority: 'normal', created_at: daysAgo(2), updated_at: daysAgo(1), tags: ['ooh'], visit: false, comments: [
        { public: false, body: '[TRG] Call taken by OOH — accommodation cold, setpoint raised to 21 (max allowed) · Operator: Test Handler', created_at: daysAgo(2) }] },
    { id: 45110, siteNo: '6851', subject: 'Restaurant zone cold — write failed, escalated', status: 'open', custom_status_id: 25999053444508, priority: 'high', created_at: daysAgo(1), updated_at: daysAgo(1), tags: ['ooh'], visit: false, comments: [
        { public: false, body: '[TRG] Setpoint write failed (vendor rejected) — captured for IoT team · Operator: Test Handler', created_at: daysAgo(1) }] },
    { id: 45115, siteNo: '6749', subject: 'External lighting not on', status: 'pending', custom_status_id: 25999081452188, priority: 'normal', created_at: daysAgo(1), updated_at: daysAgo(1), tags: ['ooh'], visit: false, comments: [
        { public: false, body: '[TRG] Lighting not controllable remotely, captured; manual override guidance given · Operator: Test Handler', created_at: daysAgo(1) }] }
];

function daysAgo(n) { return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString(); }

/* ------------------------------------------------------------------ */
/* F011/F001/F002 — outcome tickets ([TRG] contract with the frozen    */
/* IoT Support dashboard consumer — design-spec.md §1/§2)              */
/* ------------------------------------------------------------------ */

/** Collapses any string to a single trimmed line (anchors + summary must be one line each). */
function oneLine(str) {
    return String(str ?? '').replace(/\s+/g, ' ').trim();
}

/** Local Europe/London HH:MM for a transcript timestamp (matches the consumer step regex). */
export function hhmm(iso) {
    try {
        return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

/**
 * The consumer's server parser captures Outcome with /Outcome:\s*([\w-]+)/ — a bare hyphenated
 * code only. A space silently truncates the capture, so coerce anything non-conforming to a safe
 * code (design-spec §4 note 2). App outcome types are already raw codes; this is defence-in-depth.
 */
function sanitizeOutcomeCode(outcomeType) {
    const raw = oneLine(outcomeType);
    if (/^[\w-]+$/.test(raw)) return raw;
    return raw.toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'no-action';
}

/**
 * Builds the canonical [TRG] first-comment body (design-spec §2.1). ORDER IS FREEZE-CRITICAL:
 * summary → Operator → Caller's words → Outcome → Transcript. The three anchor lines MUST precede
 * the (unbounded) transcript so they survive Zendesk's ~1500-char description truncation (CT-I1),
 * which is what the consumer's oversight parser reads.
 */
function buildTrgBody({ operator, summary, callerWords, outcomeType, transcript, defaultTime, dataQualityNote }) {
    const lines = [`[TRG] ${oneLine(summary).slice(0, 180)}`];
    lines.push(`Operator: ${oneLine(operator?.name) || 'OOH'} (OOH)`);
    if (callerWords) lines.push(`Caller's words: "${oneLine(callerWords)}"`);
    lines.push(`Outcome: ${sanitizeOutcomeCode(outcomeType)}`);

    const steps = (Array.isArray(transcript) ? transcript : []).filter(s => s && s.text);
    if (steps.length) {
        lines.push('Transcript:');
        for (const s of steps) {
            const time = /^\d{1,2}:\d{2}$/.test(s.time) ? s.time : defaultTime;
            lines.push(`${time} | ${oneLine(s.text)}`);
        }
    }
    if (dataQualityNote) lines.push('', dataQualityNote);
    return lines.join('\n');
}

/**
 * Creates the Zendesk ticket for a completed OOH issue. Returns { id, url }.
 * The [TRG] internal first comment carries the operator identity, caller words, raw outcome code
 * and the full timestamped action transcript (the ticket requester is the API service account,
 * so identity always lives in the comment body).
 */
export async function createOutcomeTicket({ operator, siteNo, siteName, subject, summary, transcript = [], detail, callerWords, outcomeType, priority = 'normal', extraTags = [] }) {
    const summaryLine = summary || subject || detail || 'OOH outcome';
    const defaultTime = hhmm(new Date().toISOString());
    // If no structured transcript was supplied but a detail string exists, keep at least one step
    // so degraded/non-control outcomes still render a transcript line.
    let steps = Array.isArray(transcript) ? transcript.filter(s => s && s.text) : [];
    if (!steps.length && detail) steps = [{ time: defaultTime, text: detail }];

    const buildBody = dataQualityNote =>
        buildTrgBody({ operator, summary: summaryLine, callerWords, outcomeType, transcript: steps, defaultTime, dataQualityNote });

    // F002 — Ticket Category is set on every OOH outcome ticket (Explore reporting only).
    const categoryField = { id: config.zendesk.categoryFieldId, value: config.zendesk.categoryValue };

    if (!live()) {
        const t = {
            id: fixtureSeq++, siteNo, subject, status: 'new', custom_status_id: 11404223315612,
            priority, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            tags: [config.zendesk.oohTag, ...extraTags], visit: false,
            custom_fields: [categoryField],
            comments: [{ public: false, body: buildBody(null), created_at: new Date().toISOString() }]
        };
        fixtureTickets.unshift(t);
        return { id: t.id, url: `#fixture-ticket-${t.id}` };
    }

    const siteTag = await resolveSiteTag(siteNo);
    const customFields = [categoryField];
    if (siteTag) customFields.push({ id: config.zendesk.siteFieldId, value: siteTag });
    const dataQualityNote = siteTag ? null
        : `(Site field could not be resolved for house ID ${siteNo} — flagged for data-quality review)`;
    const payload = {
        ticket: {
            subject: `[OOH] ${subject}`,
            comment: { body: buildBody(dataQualityNote), public: false },
            priority,
            tags: [config.zendesk.oohTag, ...extraTags],
            custom_fields: customFields
        }
    };
    const data = await zd('POST', '/tickets.json', payload);
    return { id: data.ticket.id, url: `https://${config.zendesk.subdomain}.zendesk.com/agent/tickets/${data.ticket.id}` };
}

/**
 * Appends a late-sync annotation after an IT700-style timeout resolved itself (F008).
 */
export async function addLateSyncNote(ticketId, action) {
    const body = `[TRG] Late device confirmation: ${action.attribute} = ${action.value} on ${action.deviceId} synced at ${action.settledAt} (was reported as timed out). Treat the change as applied.`;
    return addInternalComment(ticketId, body);
}

/**
 * F015 — adds an operator note/feedback internal comment to a ticket.
 */
export async function addFeedbackNote(ticketId, operator, body) {
    const text = `[OOH NOTE] ${body}\n\nOperator: ${operator.name} (${operator.email || operator.id})`;
    return addInternalComment(ticketId, text);
}

async function addInternalComment(ticketId, body) {
    if (!live()) {
        const t = fixtureTickets.find(x => x.id === Number(ticketId));
        if (!t) throw Object.assign(new Error('Ticket not found'), { status: 404 });
        t.comments.push({ public: false, body, created_at: new Date().toISOString() });
        t.updated_at = new Date().toISOString();
        return { ok: true };
    }
    await zd('PUT', `/tickets/${ticketId}.json`, { ticket: { comment: { body, public: false } } });
    return { ok: true };
}

/**
 * F015 — the feedback thread: OOH/TRG internal comments on a ticket, oldest first.
 */
export async function getFeedbackThread(ticketId) {
    if (!live()) {
        const t = fixtureTickets.find(x => x.id === Number(ticketId));
        if (!t) throw Object.assign(new Error('Ticket not found'), { status: 404 });
        return t.comments.map(c => ({ body: c.body, at: c.created_at, public: c.public }));
    }
    const data = await zd('GET', `/tickets/${ticketId}/comments.json`);
    return (data.comments || []).map(c => ({ body: c.body, at: c.created_at, public: c.public }));
}

/**
 * Sets the caller-expects-an-update-by date (Follow-up Date field).
 */
export async function setFollowUpDate(ticketId, date) {
    if (!live()) {
        const t = fixtureTickets.find(x => x.id === Number(ticketId));
        if (!t) throw Object.assign(new Error('Ticket not found'), { status: 404 });
        t.followUp = date;
        return { ok: true };
    }
    await zd('PUT', `/tickets/${ticketId}.json`, { ticket: { custom_fields: [{ id: config.zendesk.followUpFieldId, value: date }] } });
    return { ok: true };
}

/* ------------------------------------------------------------------ */
/* F013 — callback lookup (translation layer)                          */
/* ------------------------------------------------------------------ */

const STATUS_TRANSLATIONS = {
    11404223315612: { name: 'New', agent: 'Just received — not yet picked up', caller: 'Your issue has been logged and our team will be picking it up shortly.' },
    25999053375260: { name: 'Triage', agent: 'Being assessed by the IoT team', caller: 'Your issue has been received and our team is working out the best way to resolve it.' },
    25999053444508: { name: 'Investigating', agent: 'Being actively investigated', caller: 'Our team is actively looking into this right now.' },
    25999037104284: { name: 'Monitoring', agent: 'Being monitored — waiting to see if it settles', caller: 'Our team has made some changes and is monitoring the situation to make sure it’s resolved.' },
    25999056203932: { name: 'Awaiting Remote Fix', agent: 'A remote fix is being applied', caller: 'Our team is applying a fix remotely — this should take effect shortly.' },
    25999081452188: { name: 'Awaiting Customer Action', agent: 'Waiting for the site to do something', caller: 'We’re waiting for someone on site to take an action. Has that been done?' },
    25999056357276: { name: 'Follow Up Check', agent: 'Scheduled for a follow-up check', caller: 'This is scheduled for a follow-up check by our team.' },
    25999056432284: { name: 'Escalated to EM', agent: 'Escalated to the engineering manager', caller: 'This has been escalated to our senior team for action.' },
    25999081650076: { name: 'Sent to Repairs Admin', agent: 'Passed to the repair contractor', caller: 'This has been referred to the maintenance contractor. They should be in touch to arrange a visit. Please be aware that any visit may be chargeable, as all our work goes through GK Repairs Admin.' },
    25999081709724: { name: 'Sent to Network', agent: 'Passed to the network engineering team', caller: 'This has been referred to our specialist engineering team for investigation.' },
    25999056633884: { name: 'Awaiting GK Repair', agent: 'Waiting for GK repair contractor to attend', caller: 'A repair contractor has been notified. They should be in touch to arrange a visit. Please be aware that any visit may be chargeable, as all our work goes through GK Repairs Admin.' },
    25999056690332: { name: 'Post-Repair LH Check', agent: 'Repair done — our team needs to re-check', caller: 'The contractor has been out and our team just needs to do a final check on our system.' },
    25999067648796: { name: 'Escalation Query', agent: 'Query raised during escalation', caller: 'There’s a query being resolved before this can proceed — our team is on it.' },
    25999081991196: { name: 'Escalation Overdue', agent: 'Escalation is overdue — being chased', caller: 'This escalation is being chased — our team is following up.' },
    25999082641308: { name: 'Resolved', agent: 'Resolved', caller: 'This was marked as resolved.' },
    25999068372252: { name: 'Done', agent: 'Completed and closed', caller: 'This was completed and closed.' },
    25999038553244: { name: 'Closed', agent: 'Closed', caller: 'This ticket has been closed.' },
    26381319932188: { name: 'Customer Replied', agent: 'Caller has replied — being reviewed', caller: 'Your message has been received and our team will review it.' }
};

// Engineer-visit statuses always carry the chargeable-visit warning
const VISIT_STATUS_IDS = [25999081650076, 25999056633884];

function friendlyTimeElapsed(dateStr) {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 5) return 'just now';
    if (mins < 30) return `${mins} minutes ago`;
    if (mins < 90) return 'about an hour ago';
    if (mins < 360) return `${Math.floor(mins / 60)} hours ago`;
    if (mins < 720) return 'earlier today';
    if (mins < 1440) return new Date(dateStr).getHours() < 12 ? 'this morning' : 'last night';
    if (mins < 2880) return 'yesterday';
    if (mins < 10080) return `${Math.floor(mins / 1440)} days ago`;
    return 'about a week ago';
}

function translateComment(body) {
    if (!body) return '';
    let text = body
        .replace(/ThingsBoard|TB\b/gi, 'our monitoring system')
        .replace(/Tuya|Lighthouse|LH\b/gi, 'our control system')
        .replace(/Salus|Intesis/gi, 'the thermostat system')
        .replace(/Dragino|gateway|R10[aA]/gi, "the site's communication unit")
        .replace(/Tongou|[Pp]ower\s*[Pp]ause|[Cc]ontactor/g, 'the power control unit')
        .replace(/\[TRG\]/g, 'OOH agent:')
        .replace(/\[OOH NOTE\]/g, 'OOH note:');
    if (text.length > 220) text = text.substring(0, 220) + '…';
    return text;
}

function buildCallerScript(ticket, statusInfo) {
    const created = friendlyTimeElapsed(ticket.created_at);
    return `I can see your issue was reported ${created}. ${statusInfo.caller}`;
}

/**
 * Composite callback lookup for a resolved site: grouped, translated tickets with
 * caller scripts, timelines and the chargeable-visit warning.
 */
export async function callbackLookup(siteNo) {
    let rawTickets;
    if (!live()) {
        rawTickets = fixtureTickets.filter(t => t.siteNo === String(siteNo));
    } else {
        const siteTag = await resolveSiteTag(siteNo);
        if (!siteTag) return { tickets: { active: [], recent: [], closed: [] }, totalFound: 0, unresolvedSiteTag: true };
        const daysAgoStr = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const data = await zd('GET', '/search.json', null, {
            query: `type:ticket custom_field_${config.zendesk.siteFieldId}:${siteTag} created>${daysAgoStr}`,
            sort_by: 'updated_at', sort_order: 'desc'
        });
        rawTickets = (data.results || []).slice(0, 12);
    }

    const groups = { active: [], recent: [], closed: [] };
    for (const t of rawTickets) {
        const statusInfo = STATUS_TRANSLATIONS[t.custom_status_id] ||
            { name: t.status, agent: t.status, caller: 'Our team is handling this.' };
        const comments = live()
            ? (await zd('GET', `/tickets/${t.id}/comments.json`, null, { sort_order: 'desc' }).catch(() => ({ comments: [] }))).comments || []
            : [...(t.comments || [])].reverse();
        const visit = VISIT_STATUS_IDS.includes(t.custom_status_id) || !!t.visit;
        const enriched = {
            id: t.id,
            subject: t.subject,
            status: { raw: t.status, name: statusInfo.name, agent: statusInfo.agent, caller: statusInfo.caller },
            createdFriendly: friendlyTimeElapsed(t.created_at),
            updatedFriendly: friendlyTimeElapsed(t.updated_at),
            visit,
            script: buildCallerScript(t, statusInfo) + (visit ? ' A visit may be involved — if the fault isn’t Lighthouse equipment, the visit may be chargeable.' : ''),
            timeline: comments.slice(0, 6).map(c => ({
                at: c.created_at,
                atFriendly: friendlyTimeElapsed(c.created_at),
                text: translateComment(c.body)
            }))
        };
        const isClosed = ['closed'].includes(t.status);
        const isResolved = ['solved', 'closed'].includes(t.status);
        if (isClosed) groups.closed.push(enriched);
        else if (!isResolved) groups.active.push(enriched);
        groups.recent.push(enriched);
    }
    return { tickets: groups, totalFound: rawTickets.length };
}

/**
 * Recent OOH tickets for the Site Workspace side panel (last 4).
 */
export async function ticketsForSite(siteNo) {
    const { tickets } = await callbackLookup(siteNo);
    return tickets.recent.slice(0, 4);
}

/**
 * "Raise a query" from the Tonight view — lands on a ticket for the IoT team.
 */
export async function raiseQuery(operator, siteNo, text) {
    const subject = `OOH query${siteNo ? ` — site ${siteNo}` : ''}`;
    return createOutcomeTicket({
        operator,
        siteNo: siteNo || 'unknown',
        subject,
        summary: subject,
        transcript: [{ time: hhmm(new Date().toISOString()), text: `Query raised: ${text}` }],
        outcomeType: 'query',
        extraTags: ['ooh_query']
    });
}

/* ------------------------------------------------------------------ */
/* F003 — call-ticket reconciliation (Zendesk Talk)                    */
/* ------------------------------------------------------------------ */

// Fixture Talk call tickets (dev/tests only). Seeded via the fixture-mode /api test route so
// reconciliation is exercisable without live Zendesk; empty in normal runs → reconciliation no-ops.
let fixtureCallTickets = [];

/**
 * FIXTURE ONLY — seeds a Zendesk Talk call ticket for reconciliation tests. No-op in live mode.
 */
export function seedFixtureCallTicket({ id, subject, siteHint, recordingUrl, answeredById, answeredByName, startedAt, from }) {
    if (live()) return null;
    const ticket = {
        id: Number(id), subject: subject || 'Inbound call', status: 'open',
        siteHint: siteHint || subject || '',
        voice: {
            recording_url: recordingUrl || null,
            answered_by_id: answeredById ?? null,
            answered_by_name: answeredByName || null,
            started_at: startedAt || new Date().toISOString(),
            from: from || null
        }
    };
    fixtureCallTickets.push(ticket);
    return ticket;
}

/** FIXTURE ONLY — resets seeded call tickets (test isolation). */
export function resetFixtureCallTickets() { fixtureCallTickets = []; }

/** FIXTURE ONLY — returns a seeded call ticket by id (test assertions). */
export function getFixtureCallTicket(id) { return fixtureCallTickets.find(c => c.id === Number(id)) || null; }

/** Extracts the native VoiceComment metadata (recording, answered-by, started-at, caller) from a call ticket. */
async function extractVoiceMeta(ticket) {
    try {
        const data = await zd('GET', `/tickets/${ticket.id}/comments.json`);
        const vc = (data.comments || []).find(c => c.type === 'VoiceComment' || c.data?.recording_url);
        const d = vc?.data || {};
        return {
            recording_url: d.recording_url || null,
            answered_by_id: d.answered_by_id ?? null,
            answered_by_name: null,
            started_at: d.started_at || vc?.created_at || ticket.created_at || null,
            from: d.from || null
        };
    } catch (err) {
        console.error(`[ZD] Voice metadata read failed for call ticket ${ticket.id}: ${err.message}`);
        return { recording_url: null, answered_by_id: null, answered_by_name: null, started_at: ticket.created_at || null, from: null };
    }
}

/**
 * Candidate Zendesk Talk call tickets created since `sinceIso` (normalised for scoring).
 * Returns [] when nothing matches — reconciliation then no-ops.
 */
export async function findCallTickets({ sinceIso }) {
    if (!live()) {
        return fixtureCallTickets.map(c => ({ id: c.id, subject: c.subject, status: c.status, siteHint: c.siteHint, voice: { ...c.voice } }));
    }
    const dateStr = String(sinceIso).split('T')[0];
    const data = await zd('GET', '/search.json', null, {
        query: `type:ticket via:voice created>=${dateStr}`, sort_by: 'created_at', sort_order: 'desc'
    });
    const results = (data.results || []).slice(0, 25);
    const candidates = [];
    for (const t of results) {
        candidates.push({
            id: t.id,
            subject: t.subject,
            status: t.status,
            siteHint: `${t.subject || ''} ${t.raw_subject || ''}`.trim(),
            voice: await extractVoiceMeta(t)
        });
    }
    return candidates;
}

/**
 * Merges a Zendesk Talk call ticket INTO the OOH outcome ticket (OOH is the survivor and keeps
 * [TRG] as its first comment, so the oversight parse is preserved — freeze rule). The call's
 * comments (incl. the native VoiceComment) come across; the call ticket is closed as merged.
 */
export async function mergeTickets(oohTicketId, callTicketId, { targetComment, sourceComment } = {}) {
    if (!live()) {
        const src = fixtureCallTickets.find(c => c.id === Number(callTicketId));
        const target = fixtureTickets.find(x => x.id === Number(oohTicketId));
        if (src) { src.status = 'closed'; src.mergedInto = Number(oohTicketId); }
        if (target && src) {
            // Simulate the call's voice comment coming across onto the OOH ticket
            target.comments.push({
                public: false,
                body: `${targetComment || `Merged OOH call ticket #${callTicketId}.`}${src.voice?.recording_url ? `\nCall recording: ${src.voice.recording_url}` : ''}`,
                created_at: new Date().toISOString()
            });
            target.updated_at = new Date().toISOString();
        }
        return { ok: true, merged: true, oohTicketId: Number(oohTicketId), callTicketId: Number(callTicketId) };
    }
    await zd('POST', `/tickets/${oohTicketId}/merge.json`, {
        ids: [Number(callTicketId)],
        target_comment: targetComment,
        source_comment: sourceComment
    });
    return { ok: true, merged: true, oohTicketId: Number(oohTicketId), callTicketId: Number(callTicketId) };
}

/**
 * Posts an internal (public:false) provenance/recording note on the OOH ticket. NEVER the first
 * comment — [TRG] stays first — so the oversight parse is untouched (link-only / ambiguous paths).
 */
export async function addRecordingNote(oohTicketId, body) {
    return addInternalComment(oohTicketId, body);
}

/**
 * Health signal for /healthz.
 */
export function zendeskStatus() {
    return { mode: live() ? 'live' : 'fixture', healthy: live() ? zendeskHealthy : true, configured: !!(config.zendesk.subdomain && config.zendesk.apiToken) };
}
