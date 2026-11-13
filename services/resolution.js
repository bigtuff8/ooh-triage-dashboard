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
 *
 * Q3 (OOHDASH-164 Stage 1): resolveSite runs inventory only (~100ms) and starts the full
 * device read + Zendesk lookup in background. All callers (summary, confirm, workspace) join
 * the same in-flight read via getBackgroundSiteRead().
 */

import { randomUUID } from 'crypto';
import { config } from '../config.js';
import * as bridge from './bridge.js';
import { addDataQualityFlag } from './notices.js';

// Q3: background reads keyed by siteNo → { sitePromise, zdPromise, startedAt }
const backgroundReads = new Map();
const BACKGROUND_TTL_MS = 5 * 60 * 1000; // drop stale entries after 5 min

function pruneBackground() {
    const now = Date.now();
    for (const [k, v] of backgroundReads) if (now - v.startedAt > BACKGROUND_TTL_MS) backgroundReads.delete(k);
}

/**
 * Q3: Start (or join) the background full site read + Zendesk lookup for siteNo.
 * Returns { sitePromise, zdPromise } where sitePromise resolves to the site array.
 * Multiple calls for the same siteNo return the same promises (in-flight dedup).
 */
export function startBackgroundRead(siteNo) {
    pruneBackground();
    const key = String(siteNo);
    if (!backgroundReads.has(key)) {
        // Start full device read (Q7 in-flight map in tb-device.js deduplicates concurrent calls)
        const sitePromise = bridge.getSitesByNumber(siteNo);
        // Start Zendesk ticket lookup in background
        let zdPromise;
        try {
            const zendesk = bridge._zendesk ? bridge._zendesk() : null;
            // Lazy import to avoid circular deps
            zdPromise = import('./zendesk.js').then(m => m.callbackLookup(siteNo)).catch(() => null);
        } catch {
            zdPromise = Promise.resolve(null);
        }
        // Always start Zendesk in background
        zdPromise = import('./zendesk.js').then(m => m.callbackLookup(siteNo)).catch(() => null);
        backgroundReads.set(key, { sitePromise, zdPromise, startedAt: Date.now() });
    }
    return backgroundReads.get(key);
}

/**
 * Q3: Get the background read result for siteNo. Starts one if not already in flight.
 * Returns the site array (or throws if the read fails).
 */
export async function getBackgroundSiteRead(siteNo) {
    const { sitePromise } = startBackgroundRead(siteNo);
    return sitePromise;
}

/**
 * Q3: Get the background Zendesk result for siteNo (non-throwing — returns null on failure).
 */
export async function getBackgroundZdRead(siteNo) {
    const { zdPromise } = startBackgroundRead(siteNo);
    return zdPromise;
}

// Confirmed-resolution tokens: short-lived, one per confirm. Control dispatch CONSUMES the
// token exactly once (consumeConfirmation) before any device write, so a confirm authorises a
// single dispatch and a replay/double-fire is rejected (C2). isConfirmed remains a pure,
// non-consuming read for the workspace auto-refresh only (never on the dispatch path).
const confirmations = new Map();
const CONFIRM_TTL_MS = 4 * 60 * 60 * 1000; // one call, generously

// Q4: idempotent confirm cache — keyed on `${operatorId}:${siteNo}`, TTL 10s.
// Multiple rapid POSTs from the same operator for the same site return the same token.
const _confirmIdempMap = new Map();
const CONFIRM_IDEMP_TTL_MS = 10 * 1000;

function _confirmIdempPurge() {
    const now = Date.now();
    for (const [k, v] of _confirmIdempMap) if (now - v.at > CONFIRM_IDEMP_TTL_MS) _confirmIdempMap.delete(k);
}

function pruneConfirmations() {
    const now = Date.now();
    for (const [k, v] of confirmations) if (now - v.at > CONFIRM_TTL_MS) confirmations.delete(k);
}

/**
 * Q3: Quick inventory-only resolve — checks if siteNo exists using the Zendesk site directory
 * (1-hour cache) rather than a full TB device read. In fixture mode falls back to the full read.
 * Returns { status, siteNo, [site], [matches] } just like resolveSite, but with a stub site
 * (no devices) so the confirm screen can render immediately.
 * Also starts the background full device read and Zendesk lookup.
 */
export async function resolveSiteInventory(siteNo, operator) {
    const key = String(siteNo);

    // Fixture mode: no Zendesk directory; use full read (it's instant from file)
    if (config.dataMode !== 'live') {
        return resolveSite(siteNo, operator);
    }

    // Live mode: check Zendesk directory (cached, fast)
    let dir;
    try {
        const zendesk = await import('./zendesk.js');
        dir = await zendesk.siteDirectory();
    } catch {
        // Fallback: full read
        return resolveSite(siteNo, operator);
    }

    const matches = dir.filter(d => String(d.siteNo) === key);

    if (matches.length === 0) return { status: 'none', siteNo: key };

    if (matches.length > 1) {
        await addDataQualityFlag(
            `House ID ${siteNo} ambiguous — multiple directory entries. Handler ${operator?.name || 'unknown'} routed to escalate.`
        ).catch(() => {});
        return {
            status: 'ambiguous',
            siteNo: key,
            matches: matches.map(m => ({ siteName: m.siteName || `gk-${key}`, brand: m.brand }))
        };
    }

    // Exactly one — start background full read and return stub
    startBackgroundRead(siteNo);

    const d = matches[0];
    const stubSite = {
        siteNo: key,
        siteName: d.siteName || `gk-${key}`,
        nameUnverified: !d.siteName,
        accountId: `gk-${key}`,
        brand: d.brand,
        address: undefined,
        callsLast30Days: undefined,
        devices: []
    };
    return { status: 'resolved', site: stubSite, backgroundStarted: true };
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
            `House ID ${siteNo} ambiguous — matches ${matches.map(m => `”${m.siteName}”`).join(' and ')}. Handler ${operator?.name || 'unknown'} routed to escalate.`
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
 *
 * Q4: idempotent within a 10-second window — multiple rapid POSTs from the same operator
 * for the same site return the same token without creating a new one. This prevents duplicate
 * call records and double-token generation from rapid re-clicks.
 */
export async function confirmSite(siteNo, operator) {
    // Q3: use background read result if available (avoids a second full read)
    let result;
    if (config.dataMode === 'live' && backgroundReads.has(String(siteNo))) {
        const matches = await getBackgroundSiteRead(siteNo).catch(() => null);
        if (matches && matches.length === 1) {
            result = { status: 'resolved', site: matches[0] };
        } else if (matches && matches.length === 0) {
            result = { status: 'none', siteNo: String(siteNo) };
        } else if (matches && matches.length > 1) {
            result = { status: 'ambiguous', siteNo: String(siteNo), matches: matches.map(m => ({ siteName: m.siteName, brand: m.brand })) };
        }
    }
    if (!result) {
        result = await resolveSite(siteNo, operator);
    }
    if (result.status !== 'resolved') {
        throw Object.assign(new Error('Site is not uniquely resolvable — confirmation refused'), { status: 409, resolution: result });
    }

    // Q4: idempotency check
    _confirmIdempPurge();
    const idempKey = `${operator.id}:${result.site.siteNo}`;
    const existing = _confirmIdempMap.get(idempKey);
    if (existing) {
        // Return existing token if still valid
        const c = confirmations.get(existing.token);
        if (c) return { token: existing.token, site: result.site };
    }

    pruneConfirmations();
    const token = randomUUID();
    confirmations.set(token, { siteNo: result.site.siteNo, operatorId: operator.id, at: Date.now() });
    _confirmIdempMap.set(idempKey, { token, at: Date.now() });
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
 * OOHDASH-144 §9 handover-safe append authority check.
 *
 * Returns true when this operator has ANY active (unconsumed) site confirmation for siteNo.
 * Used by the outcomes append path: the original boost token has already been consumed by
 * dispatchBoilerBoost (consumeConfirmation), so we cannot check that specific token.
 * Instead we check that the operator has confirmed this site on their current call — which
 * is true for the original agent (who confirmed before the boost) AND a different agent who
 * picks up after a handover and has re-confirmed the same site.
 *
 * This does NOT consume the confirmation, so it remains valid for any further operations.
 * It does NOT make the boost control token reusable — that token is permanently gone.
 *
 * Design citation: "If a different agent finishes the issue, for example after a handover,
 * they can still add to the same ticket as long as they have confirmed the same site on their
 * call" (design section "Keeping it to one ticket in the awkward cases").
 */
export function hasSiteConfirmation(siteNo, operatorId) {
    pruneConfirmations();
    for (const c of confirmations.values()) {
        if (c.siteNo === String(siteNo) && c.operatorId === operatorId) return true;
    }
    return false;
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
