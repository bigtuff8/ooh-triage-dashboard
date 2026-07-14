/**
 * Call-ticket reconciliation (F003 / A4).
 *
 * OOH calls arrive through Zendesk Talk, which auto-creates a call ticket carrying a native
 * VoiceComment (recording_url, answered_by, started_at, caller number). At OOH outcome time this
 * module auto-identifies that call ticket by a multi-signal confidence score and, when confident,
 * MERGES it INTO the OOH outcome ticket so there is one record with the recording attached and no
 * duplicate. When not confident it falls back to a link-only internal note (R11).
 *
 * FREEZE RULE: the OOH ticket must remain the survivor with [TRG] as its first comment (that is
 * what the frozen consumer parses from the search description). We therefore merge the call ticket
 * INTO the OOH ticket, and every non-merge path only appends internal comments — the first [TRG]
 * comment is never mutated.
 *
 * Design-injectable: reconcileCallTicket accepts { zendeskApi } so it is unit-testable with a fake
 * client; it defaults to the real zendesk service. It must never throw into the outcome path — the
 * caller (routes/api.js) treats it as best-effort, like SMS dispatch.
 */

import * as zendeskDefault from './zendesk.js';
import { config } from '../config.js';

// IM-03 fix: for non-control outcomes (captures — the bulk of OOH volume) sessionStart is the
// outcome time (now), and the operator commonly logs the outcome well after the call started. A
// 5-min pre-window missed those calls entirely (time signal never awarded → recording never
// surfaced). Widened to 45 min to cover realistic call-handling duration. This is a positive
// scoring signal, not a filter; the answered-by + site signals still disambiguate, and ≥2 plausible
// candidates fall to the safe ambiguous link-only path (R11) rather than a wrong auto-merge.
const WINDOW_BEFORE_MS = 45 * 60 * 1000;

/** Single trimmed line, lower-cased, for tolerant name comparison. */
function normName(str) {
    return String(str ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Resolves the operator's Zendesk agent id from the configured email→id map (optional signal). */
function operatorAgentId(operator) {
    try {
        const map = JSON.parse(config.reconciliation.operatorAgentMap || '{}');
        const email = operator?.email ? String(operator.email).toLowerCase() : null;
        return email && map[email] != null ? map[email] : null;
    } catch {
        return null;
    }
}

/**
 * Multi-signal confidence score for one candidate call ticket (0–1):
 *   answered-by = this operator .35 · started_at inside the window .35 · site/house-id match .20 ·
 *   caller number match .10 (usually N/A producer-side).
 */
function scoreCandidate(candidate, { operator, agentId, sessionStart, outcomeTime, siteNo, callerNumber }) {
    let score = 0;
    const v = candidate.voice || {};

    // Answered-by (0.35): prefer the agent-id map; fall back to a name match.
    if (agentId != null && v.answered_by_id != null && String(v.answered_by_id) === String(agentId)) {
        score += 0.35;
    } else if (v.answered_by_name && operator?.name && normName(v.answered_by_name) === normName(operator.name)) {
        score += 0.35;
    }

    // Call started within [sessionStart − 5min, outcomeTime] (0.35).
    if (v.started_at) {
        const t = new Date(v.started_at).getTime();
        const lo = new Date(sessionStart).getTime() - WINDOW_BEFORE_MS;
        const hi = new Date(outcomeTime).getTime();
        if (!Number.isNaN(t) && t >= lo && t <= hi) score += 0.35;
    }

    // Site / house-ID match (0.20).
    if (siteNo && candidate.siteHint && String(candidate.siteHint).includes(String(siteNo))) score += 0.20;

    // Caller number (0.10) — bonus when the producer captured one.
    if (callerNumber && v.from && normName(v.from) === normName(callerNumber)) score += 0.10;

    return +score.toFixed(2);
}

/**
 * Reconciles the OOH outcome ticket with its originating Zendesk Talk call ticket.
 * Returns { action: 'merged'|'linked'|'ambiguous'|'none', ... } and never throws.
 */
export async function reconcileCallTicket({ oohTicketId, operator, siteNo, sessionStart, outcomeTime, callerNumber }, deps = {}) {
    const zendesk = deps.zendeskApi || zendeskDefault;
    const thresholds = deps.thresholds || {
        autoMerge: config.reconciliation.autoMergeThreshold,
        link: config.reconciliation.linkThreshold
    };

    const sinceIso = new Date(new Date(sessionStart).getTime() - WINDOW_BEFORE_MS).toISOString();
    const candidates = await zendesk.findCallTickets({ sinceIso });
    if (!candidates || candidates.length === 0) return { action: 'none', candidates: 0 };

    const agentId = operatorAgentId(operator);
    const scored = candidates
        .map(c => ({ ticket: c, score: scoreCandidate(c, { operator, agentId, sessionStart, outcomeTime, siteNo, callerNumber }) }))
        .sort((a, b) => b.score - a.score);
    const above = scored.filter(s => s.score >= thresholds.link);

    if (above.length === 0) {
        return { action: 'none', candidates: candidates.length, bestScore: scored[0]?.score ?? 0 };
    }

    // ≥2 plausible candidates → ambiguous (R11): list each with its recording; NO merge, NO close.
    if (above.length >= 2) {
        const lines = ['[OOH] Multiple possible call recordings for this outcome — not auto-merged (please confirm which call this was):'];
        for (const s of above) {
            lines.push(`• Candidate call ticket #${s.ticket.id} (confidence ${s.score})`);
            if (s.ticket.voice?.recording_url) lines.push(`Call recording: ${s.ticket.voice.recording_url}`);
        }
        await zendesk.addRecordingNote(oohTicketId, lines.join('\n'));
        return { action: 'ambiguous', candidates: candidates.length, matched: above.map(s => ({ id: s.ticket.id, score: s.score })) };
    }

    // Exactly one candidate above the link floor.
    const best = above[0];
    const recordingUrl = best.ticket.voice?.recording_url || null;

    if (best.score >= thresholds.autoMerge) {
        await zendesk.mergeTickets(oohTicketId, best.ticket.id, {
            targetComment: `Merged OOH call ticket #${best.ticket.id} into this ticket (recording + call history preserved). Matched with confidence ${best.score}.`,
            sourceComment: `Merged into OOH outcome ticket #${oohTicketId}.`
        });
        // IM-01 belt-and-braces: guarantee the recording URL is on the OOH survivor regardless of
        // whether Zendesk's merge carries the source VoiceComment across (documented merge behaviour
        // closes the source + adds a link note; it does not reliably copy comments to the target).
        if (recordingUrl) await zendesk.addRecordingNote(oohTicketId, `Call recording: ${recordingUrl}`);
        return { action: 'merged', callTicketId: best.ticket.id, score: best.score, recordingUrl };
    }

    // 0.50–0.79 → link-only: probable match, recording surfaced, both tickets left intact.
    const lines = [`[OOH] Probable call ticket #${best.ticket.id} for this outcome (confidence ${best.score}) — not auto-merged.`];
    if (recordingUrl) lines.push(`Call recording: ${recordingUrl}`);
    await zendesk.addRecordingNote(oohTicketId, lines.join('\n'));
    return { action: 'linked', callTicketId: best.ticket.id, score: best.score, recordingUrl };
}
