/**
 * OOHDASH-137 — pure OOH Zendesk ticket title builder.
 *
 * No imports. Never throws. Three named exports:
 *   buildOohTitle({ siteNo, siteName, outcome })   — main entry point.
 *   normaliseSiteNo(raw)                           — used by the back-fill script and raiseQuery.
 *   cleanSiteName(name, siteNo)                    — used by the back-fill script.
 *
 * All three are pure functions with no side effects.
 */

/**
 * Applies the standard text-clean to any input value: coerce to string, replace every
 * control character (U+0000–U+001F and U+007F, including line breaks and tabs) with a
 * space, collapse runs of spaces to one, then trim.
 */
function textClean(x) {
    return String(x ?? '')
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim();
}

/**
 * Normalises a raw site-number input. Three outcomes:
 *   - A digit string (e.g. "6261") when the cleaned value matches the siteNo pattern.
 *   - null when the cleaned value is empty or equals "unknown" (any case).
 *   - { freeText: <string> } for any other non-empty value (the query route's
 *     free-text path only — the handler typed words rather than a number).
 *
 * Recognised site-number patterns (all normalise to bare digits):
 *   plain digits:          "6261"
 *   brand prefix + digits: "gk-6261", "gk_6261", "GK 6261", "md-1110", " 7639 "
 */
export function normaliseSiteNo(raw) {
    const cleaned = textClean(raw);
    if (!cleaned || cleaned.toLowerCase() === 'unknown') return null;
    const m = cleaned.match(/^(?:[A-Za-z]{1,5}[-_ ]?)?(\d{3,6})$/);
    if (m) return m[1];
    return { freeText: cleaned.slice(0, 40) };
}

/**
 * Cleans and validates a pub name for inclusion in the ticket title, given the site
 * number as bare digits (from normaliseSiteNo).
 *
 * Returns null when the name should be treated as missing:
 *   - empty or "unknown" after text-clean;
 *   - equals the bare siteNo digits (e.g. siteName "6261" when siteNo is "6261");
 *   - matches the stand-in placeholder pattern (e.g. "gk-5209", "gk_5209").
 *
 * A leading site-number prefix followed by spaces/hyphens is stripped, so
 * "6261 Wheatstone Inn" becomes "Wheatstone Inn". Names longer than 60 characters
 * are cut at 57 plus "...".
 */
export function cleanSiteName(name, siteNo) {
    const cleaned = textClean(name);
    if (!cleaned) return null;
    if (cleaned.toLowerCase() === 'unknown') return null;
    if (cleaned === siteNo) return null;
    // Stand-in placeholder: "gk-5209", "gk_5209", "md-1110", etc.
    if (/^[A-Za-z]{1,5}[-_]\d{3,6}$/.test(cleaned)) return null;

    // Strip a leading site-number block such as "6261 " or "6261 - ".
    const stripped = cleaned.replace(new RegExp(`^${siteNo}[\\s-]+`), '').trim();
    if (!stripped) return null;

    if (stripped.length > 60) return stripped.slice(0, 57) + '...';
    return stripped;
}

/**
 * Builds the full Zendesk ticket title for an OOH outcome.
 *
 * Pattern: "[OOH] <sitePart> - <outcome>", where sitePart is the site number with
 * an optional pub name. Fallbacks:
 *   - no trusted pub name: "[OOH] <number> - <outcome>"
 *   - no site number:      "[OOH] <outcome>"
 *   - freeText siteNo:     "[OOH] <freeText> - <outcome>"
 *
 * The no-double rule drops the site part when the outcome already starts with the
 * site digits (so the number is not repeated). Only the start of the outcome is
 * checked; device IDs that happen to contain the digits mid-string are unaffected.
 *
 * The result is capped at 150 characters by shortening only the outcome (ending "...").
 * The "[OOH] " prefix and the site part are never shortened.
 *
 * Never throws. Idempotent — passing the function's own output as outcome returns
 * the same string.
 */
export function buildOohTitle({ siteNo, siteName, outcome }) {
    // 1. Normalise site number.
    const normalisedNo = normaliseSiteNo(siteNo);

    // 2. Clean the pub name (only usable when we have a digit site number).
    const cleanedName = (normalisedNo && typeof normalisedNo === 'string')
        ? cleanSiteName(siteName, normalisedNo)
        : null;

    // 3. Clean the outcome: strip one leading "[OOH] " prefix, default to "OOH outcome".
    let cleanedOutcome = textClean(outcome).replace(/^\[OOH\]\s*/, '');
    if (!cleanedOutcome) cleanedOutcome = 'OOH outcome';

    // 4. Build the site part.
    let sitePart;
    if (normalisedNo === null) {
        sitePart = '';
    } else if (typeof normalisedNo === 'string') {
        sitePart = normalisedNo + (cleanedName ? ' ' + cleanedName : '');
    } else {
        // freeText from the query route
        sitePart = normalisedNo.freeText;
    }

    // 5. No-double: if the outcome already starts with the site digits, drop the site
    //    part to avoid repeating the number. Only checked at the start of the outcome.
    if (sitePart && typeof normalisedNo === 'string') {
        if (new RegExp(`^${normalisedNo}(\\D|$)`).test(cleanedOutcome)) sitePart = '';
    }

    // 6. Join.
    const prefix = '[OOH] ';
    const sep = sitePart ? ' - ' : '';
    let result = prefix + (sitePart ? sitePart + sep : '') + cleanedOutcome;

    // 7. Cap at 150 characters by shortening only the outcome.
    const MAX = 150;
    if (result.length > MAX) {
        const fixedLen = prefix.length + (sitePart ? sitePart.length + sep.length : 0);
        const budget = MAX - fixedLen;
        const cut = budget >= 3 ? cleanedOutcome.slice(0, budget - 3) + '...' : '...';
        result = prefix + (sitePart ? sitePart + sep : '') + cut;
    }

    return result;
}
