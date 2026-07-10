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

// Confirmed-resolution tokens: short-lived, one per confirm, consumed by control dispatch
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
 * Validates a confirmation token for a dispatch. Returns true only when the token
 * belongs to this operator and this site.
 */
export function isConfirmed(token, siteNo, operatorId) {
    pruneConfirmations();
    const c = confirmations.get(token);
    return !!c && c.siteNo === String(siteNo) && c.operatorId === operatorId;
}
