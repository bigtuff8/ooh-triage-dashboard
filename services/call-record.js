/**
 * OOHDASH-159 rev 5 (James decision E1) — server-side call record.
 *
 * Every call is recorded automatically; the OOH agent never has a "log it" step.
 *  - A call record starts when the agent confirms the site (POST /api/sites/:siteNo/confirm).
 *  - As the agent works through an issue the browser sends its progress (what we know so far,
 *    notes, which flow) after each step: POST /api/calls/:id/progress.
 *  - An outcome ticket created during the call is linked to its issue (POST /api/outcomes with
 *    callId + issueKey), so the record is appended to that ticket rather than duplicated.
 *  - The record is FINALISED when the agent presses "End call" or "Raise another issue", or
 *    automatically when they leave the screen (browser keepalive request) or after IDLE minutes
 *    with no activity (in-process sweeper, below).
 *
 * Finalising an issue writes it to the IoT Support Dashboard (Zendesk, the system it reads):
 *  - issue with a ticket   → one internal "[OOH CALL RECORD]" comment on that ticket;
 *  - issue with no ticket  → (abandoned part-way, or a call with no issue at all) one ticket created
 *                            already SOLVED ("closed"), tagged ooh_call_record, for contact history.
 * Idempotency: each issue carries finalisedAt; a second finalise of the same issue (a double
 * click, the keepalive request racing the End-call button, or the sweeper) writes nothing.
 *
 * Silent running: the idle sweeper is an unref'd in-process timer inside the existing server.
 * It opens no window, spends no tokens and makes no network call unless a call is actually idle
 * past the limit; an idle tick is a scan of an in-memory map (microseconds).
 */
import { randomUUID } from 'crypto';
import * as zendesk from './zendesk.js';
import { collection } from './store.js';

export const DEFAULT_IDLE_MIN = 20;
const SWEEP_EVERY_MS = 60 * 1000;
const MAX_ISSUES = 20;
const MAX_CALL_HOURS = 8; // hard cap: finalise regardless of heartbeat after this many hours

const calls = new Map(); // callId -> record (single replica: k8s/deployment.yaml replicas: 1)
let sweeper = null;

function idleMs() {
    const n = Number(process.env.OOH_CALL_IDLE_MIN);
    return (Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_MIN) * 60 * 1000;
}

function hhmm(ms) {
    return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
}

function clean(s, max) {
    return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 300);
}

async function persist(rec) {
    // Best-effort durability so a pod restart can still finalise open calls. Never blocks the call.
    try { const col = await collection('OohCallRecords'); await col.upsert({ ...rec }); }
    catch (err) { console.error(`[CALL] persist failed for ${rec.id}: ${err.message}`); }
}

export function _reset() { calls.clear(); }
export function _get(id) { return calls.get(id) || null; }

/** Starts a call record at site confirm. Returns the call id. */
export function startCall({ operator, siteNo, siteName, nowMs }) {
    const t = nowMs || Date.now();
    const rec = {
        id: 'call-' + randomUUID(),
        siteNo: String(siteNo), siteName: siteName || null,
        operatorId: operator?.id || null, operatorName: operator?.name || 'OOH',
        startedAt: t, lastActivityAt: t, lastHeartbeatAt: t, status: 'open', finalisedAt: null, finalReason: null,
        issues: {}
    };
    calls.set(rec.id, rec);
    persist(rec);
    return rec.id;
}

function ownCall(callId, operatorId) {
    const rec = calls.get(callId);
    if (!rec) return null;
    if (operatorId && rec.operatorId && rec.operatorId !== operatorId) return null;
    return rec;
}

/**
 * Records progress on an issue (called after each step). Fields are sanitised and capped.
 * Returns false when the call is unknown, not this operator's, or already finalised.
 */
export function recordProgress(callId, operatorId, { issueKey, cat, knownSoFar, notes, outcome, ticketId, nowMs } = {}) {
    const rec = ownCall(callId, operatorId);
    if (!rec) return false;
    if (rec.status !== 'open') {
        // Part 2c 409 trigger: an unknown issue arrived on a finalised record from the same operator.
        // If the issueKey is already on the record → silent 200 (return true).
        // If it's new → signal 409 (return null) so the caller returns 409 Conflict.
        if (issueKey) {
            const known = !!rec.issues[clean(issueKey, 40)];
            return known ? true : null;
        }
        return false;
    }
    const t = nowMs || Date.now();
    rec.lastActivityAt = t;
    if (issueKey) {
        const key = clean(issueKey, 40);
        if (!rec.issues[key] && Object.keys(rec.issues).length >= MAX_ISSUES) return true;
        const iss = rec.issues[key] || (rec.issues[key] = { key, cat: null, knownSoFar: [], notes: null, outcome: null, ticketId: null, startedAt: t, finalisedAt: null });
        if (iss.finalisedAt) return true; // a finalised issue is frozen
        if (cat) iss.cat = clean(cat, 40);
        if (Array.isArray(knownSoFar)) iss.knownSoFar = knownSoFar.filter(x => typeof x === 'string').map(x => clean(x, 200)).filter(Boolean).slice(0, 30);
        if (notes !== undefined) iss.notes = notes ? clean(notes, 1000) : null;
        if (outcome) iss.outcome = clean(outcome, 180);
        if (ticketId) iss.ticketId = Number(ticketId) || iss.ticketId;
    }
    persist(rec);
    return true;
}

/** Plain-text record written to the ticket. Pure — unit tested. */
export function buildCallRecordText(rec, issue, reason, nowMs) {
    const why = {
        'end-call': 'the agent pressed End call',
        'another-issue': 'the agent pressed Raise another issue',
        'left-screen': 'the agent left the screen',
        'idle': 'no activity for ' + Math.round(idleMs() / 60000) + ' minutes',
        'site-change': 'the agent opened a different site',
        'max-lifetime': 'the call exceeded the maximum duration (' + MAX_CALL_HOURS + ' hours)'
    }[reason] || 'the call was closed';
    const lines = ['[OOH CALL RECORD] Published automatically by the OOH Dashboard.'];
    lines.push(`Site: ${rec.siteName || 'unknown'} (${rec.siteNo}) · Agent: ${rec.operatorName}`);
    lines.push(`Call started ${hhmm(rec.startedAt)} · record closed ${hhmm(nowMs || Date.now())} because ${why}.`);
    if (issue) {
        if (issue.cat) lines.push(`Issue: ${issue.cat}`);
        (issue.knownSoFar || []).forEach(k => lines.push(`Known so far: ${k}`));
        if (issue.outcome) lines.push(`Outcome: ${issue.outcome}`);
        else lines.push('Outcome: none reached (the issue was not finished on the call).');
        if (issue.notes) lines.push(`Agent notes: ${issue.notes}`);
    } else {
        lines.push('No issue was started on this call (the site was confirmed and the call ended).');
    }
    return lines.join('\n');
}

async function writeIssue(rec, issue, reason, nowMs) {
    const body = buildCallRecordText(rec, issue, reason, nowMs);
    if (issue && issue.ticketId) {
        await zendesk.addIssueSummaryComment(issue.ticketId, body);
        return { ticketId: issue.ticketId, appended: true };
    }
    const subject = issue && issue.cat ? `Call record — ${issue.cat} (no outcome reached)` : 'Call record — no issue raised';
    const t = await zendesk.createOutcomeTicket({
        operator: { name: rec.operatorName, id: rec.operatorId }, siteNo: rec.siteNo, siteName: rec.siteName,
        subject, summary: subject, detail: body, outcomeType: 'call-record',
        extraTags: ['ooh_call_record'], status: 'solved'
    });
    if (issue) issue.ticketId = t.id;
    return { ticketId: t.id, appended: false };
}

/**
 * Updates lastHeartbeatAt — called by the browser every 2 minutes while a call is open.
 * Returns false when the call is unknown, not this operator's, or already finalised.
 */
export async function heartbeat(callId, operatorId) {
    const rec = ownCall(callId, operatorId);
    if (!rec || rec.status !== 'open') return false;
    rec.lastHeartbeatAt = Date.now();
    rec.lastActivityAt = rec.lastHeartbeatAt;
    await persist(rec);
    return true;
}

/** Returns resume info if the same operator has an open/recently-finalised call at this site. */
export function sameOperatorResume(operatorId, siteNo) {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const now = Date.now();
    for (const rec of calls.values()) {
        if (rec.operatorId !== operatorId) continue;
        if (String(rec.siteNo) !== String(siteNo)) continue;
        if (rec.status === 'open') return { callId: rec.id, canResume: true };
        // Recently finalised within 2 hours — offer to reopen
        if (rec.status === 'finalised' && rec.finalisedAt && now - rec.finalisedAt < TWO_HOURS) {
            return { callId: rec.id, canResume: true, wasFinalised: true };
        }
    }
    return null;
}

/**
 * Re-opens a finalised call record so queued browser writes can replay.
 * Returns { ok, error? }.
 */
export async function reopen(callId, operatorId) {
    // Check in-memory first
    let rec = calls.get(callId);
    if (!rec) {
        // May have been swept and removed from memory — try Cosmos
        try {
            const col = await collection('OohCallRecords');
            rec = await col.get(callId);
            if (rec) calls.set(rec.id, rec);
        } catch (_) { /* Cosmos unavailable; can only reopen in-memory calls */ }
    }
    if (!rec) return { ok: false, error: 'unknown-call' };
    if (operatorId && rec.operatorId && rec.operatorId !== operatorId) return { ok: false, error: 'forbidden' };
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (rec.finalisedAt && Date.now() - rec.finalisedAt > TWO_HOURS) return { ok: false, error: 'expired' };
    rec.status = 'open';
    rec.finalisedAt = null;
    rec.finalReason = null;
    rec.lastHeartbeatAt = Date.now();
    rec.lastActivityAt = rec.lastHeartbeatAt;
    calls.set(rec.id, rec);
    await persist(rec);
    return { ok: true };
}

/** Returns the operatorId for the given ticketId, or null if not found. */
export function operatorHasTicket(ticketId, operatorId) {
    for (const rec of calls.values()) {
        if (rec.operatorId !== operatorId) continue;
        for (const iss of Object.values(rec.issues || {})) {
            if (iss.ticketId === Number(ticketId)) return true;
        }
    }
    return false;
}

/** Returns the confirmed siteNo for the operator's current open call, or null. */
export function confirmedSiteForOperator(operatorId) {
    for (const rec of calls.values()) {
        if (rec.operatorId === operatorId && rec.status === 'open') return rec.siteNo;
    }
    return null;
}

/**
 * Finalises an issue (reason 'another-issue' with issueKey) or the whole call (any other reason).
 * Idempotent. Returns { ok, already, written: [{ticketId, appended}] }.
 */
export async function finalise(callId, operatorId, { reason, issueKey, nowMs } = {}) {
    const rec = ownCall(callId, operatorId);
    if (!rec) return { ok: false, error: 'unknown-call' };
    const t = nowMs || Date.now();
    const written = [];
    const issueOnly = reason === 'another-issue' && issueKey;
    if (rec.status !== 'open') return { ok: true, already: true, written };
    const targets = issueOnly
        ? [rec.issues[clean(issueKey, 40)]].filter(Boolean)
        : Object.values(rec.issues);
    for (const iss of targets) {
        if (iss.finalisedAt) continue;
        iss.finalisedAt = t; // claim first: a racing second finalise sees it and writes nothing
        try { written.push(await writeIssue(rec, iss, reason, t)); }
        catch (err) { iss.finalisedAt = null; console.error(`[CALL] write failed for ${rec.id}/${iss.key}: ${err.message}`); }
    }
    if (!issueOnly) {
        rec.status = 'finalised';
        rec.finalisedAt = t;
        rec.finalReason = reason || 'end-call';
        // A call with no issue at all is still contact history: one closed record.
        if (!Object.keys(rec.issues).length) {
            try { written.push(await writeIssue(rec, null, reason, t)); }
            catch (err) { console.error(`[CALL] write failed for ${rec.id}: ${err.message}`); }
        }
    } else {
        rec.lastActivityAt = t;
    }
    await persist(rec);
    if (!issueOnly) calls.delete(rec.id);
    return { ok: true, already: false, written };
}

/** Finalises every open call idle for longer than the limit. Returns the ids finalised. */
export async function sweepIdle(nowMs) {
    const t = nowMs || Date.now();
    const limit = idleMs();
    const hardCap = MAX_CALL_HOURS * 60 * 60 * 1000;
    const done = [];
    for (const rec of [...calls.values()]) {
        if (rec.status !== 'open') continue;
        // Hard lifetime cap: finalise regardless of heartbeat after MAX_CALL_HOURS.
        if (t - rec.startedAt > hardCap) {
            await finalise(rec.id, null, { reason: 'max-lifetime', nowMs: t });
            done.push(rec.id);
            continue;
        }
        // Durable sweep: use Cosmos lastHeartbeatAt, not in-memory lastActivityAt.
        // Fail-safe: if the Cosmos read fails for any reason, skip this candidate — never fall
        // back to in-memory, which would lose the ETag race guard.
        let durableTs = null;
        try {
            const col = await collection('OohCallRecords');
            const durable = await col.get(rec.id);
            if (durable) durableTs = durable.lastHeartbeatAt || durable.lastActivityAt;
        } catch (err) {
            console.warn(`[CALL] sweep: Cosmos read failed for ${rec.id}, skipping this tick: ${err.message}`);
            continue;
        }
        // If Cosmos has no record yet (new call, persist hasn't landed) fall back to in-memory.
        const checkTs = durableTs !== null ? durableTs : rec.lastHeartbeatAt || rec.lastActivityAt;
        if (t - checkTs > limit) {
            await finalise(rec.id, null, { reason: 'idle', nowMs: t });
            done.push(rec.id);
        }
    }
    return done;
}

/** Re-loads open calls after a restart (they will finalise on the next sweep if idle). */
export async function resumeOpenCalls() {
    try {
        const col = await collection('OohCallRecords');
        const open = await col.query(d => d.status === 'open');
        open.forEach(d => { if (!calls.has(d.id)) calls.set(d.id, d); });
        return open.length;
    } catch (err) {
        console.error(`[CALL] resume failed: ${err.message}`);
        return 0;
    }
}

export function startIdleSweeper() {
    if (sweeper) return;
    sweeper = setInterval(() => { sweepIdle().catch(err => console.error(`[CALL] sweep failed: ${err.message}`)); }, SWEEP_EVERY_MS);
    if (sweeper.unref) sweeper.unref();
}
