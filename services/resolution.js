/**
 * Deterministic site → device resolution (F004, CR-01/TQ-2).
 *
 * The canonical key is the house number (TB siteNo). Rules:
 *  - exactly one match → resolvable (UI must still show the confirmation gate)
 *  - 0 matches         → explicit reject, never a fuzzy fallback
 *  - >1 matches        → explicit ambiguous reject + data-quality flag; control blocked
 *
 * No write is dispatched until the handler has confirmed the resolved target —
 * enforcement lives in control.js which requires a confirmed resolution token.
 */

import { randomUUID } from 'crypto';
import * as bridge from './bridge.js';
import { addDataQualityFlag } from './notices.js';

// Confirmed-resolution tokens: short-lived, one per confirm. Control dispatch CONSUMES the
// token exactly once (consumeConfirmation) before any device write, so a confirm authorises a
// single dispatch and a replay/double-fire is rejected (C2). isConfirmed remains a pure,
// non-consuming read for the workspace auto-refresh only (never on the dispatch path).
const confirmations = new Map();
const CONFIRM_TTL_MS = 4 * 60 * 60 * 1000; // one call, generously

function pruneConfirmations() {
    const now = Date.now();
    for (const [k, v] of confirmations) if (now - v.at > CONFIRM_TTL_MS) confirmations.delete(k);
}

/**
 * Resolves a house number. Returns
 *  { status:'resolved', site } | { status:'none' } | { status:'ambiguous', matches:[...] }
 */
export async function resolveSite(siteNo, operator) {
    const matches = await bridge.getSitesByNumber(siteNo);
    if (matches.length === 0) return { status: 'none', siteNo: String(siteNo) };
    if (matches.length > 1) {
        await addDataQualityFlag(
            `House ID ${siteNo} ambiguous — matches ${matches.map(m => `“${m.siteName}”`).join(' and ')}. Handler ${operator?.name || 'unknown'} routed to escalate.`
        );
        return {
            status: 'ambiguous',
            siteNo: String(siteNo),
            matches: matches.map(m => ({ siteName: m.siteName, brand: m.brand }))
        };
    }
    return { status: 'resolved', site: matches[0] };
}

/**
 * Records the handler's explicit confirmation of a resolved site and returns the
 * confirmation token that control dispatch requires (second half of the F004 gate).
 */
export async function confirmSite(siteNo, operator) {
    const result = await resolveSite(siteNo, operator);
    if (result.status !== 'resolved') {
        throw Object.assign(new Error('Site is not uniquely resolvable — confirmation refused'), { status: 409, resolution: result });
    }
    pruneConfirmations();
    const token = randomUUID();
    confirmations.set(token, { siteNo: result.site.siteNo, operatorId: operator.id, at: Date.now() });
    return { token, site: result.site };
}

/**
 * Validates a confirmation token WITHOUT consuming it. Returns true only when the token
 * belongs to this operator and this site. Read-only: for the workspace auto-refresh
 * pre-check only — NEVER on the dispatch path (see consumeConfirmation for that).
 */
export function isConfirmed(token, siteNo, operatorId) {
    pruneConfirmations();
    const c = confirmations.get(token);
    return !!c && c.siteNo === String(siteNo) && c.operatorId === operatorId;
}

/**
 * Atomically validates AND consumes a confirmation token for a dispatch (C2 single-use).
 * On a full match it deletes the token in the SAME synchronous event-loop tick as the get()
 * — no await in between — then returns true; a second dispatch with the same token finds
 * nothing and gets false. On no match (unknown/expired token, or wrong site/operator) it
 * returns false and does NOT delete, so a mismatched attempt cannot spend the legitimate
 * owner's token. Single-replica atomicity (Node single-threaded, synchronous Map delete) is
 * the proof baseline at replicas:1; cross-replica single-use is deferred (C5).
 */
export function consumeConfirmation(token, siteNo, operatorId) {
    pruneConfirmations();
    const c = confirmations.get(token);
    if (!c || c.siteNo !== String(siteNo) || c.operatorId !== operatorId) return false;
    confirmations.delete(token);
    return true;
}
