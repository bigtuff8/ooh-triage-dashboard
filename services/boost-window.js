/**
 * OOHDASH-141 — pure, side-effect-free clamp service for pub heating boost windows.
 *
 * Enforces the 01:00 / 07:00 Europe/London rules:
 *  - Refuse any boost starting between 01:00 and 07:00 local.
 *  - Clamp ON boosts so they end by the next local 01:00 (the ceiling C).
 *    If the remaining window is under 15 min, refuse.
 *  - OFF boosts are never clamped (OFF is always safe to apply past midnight).
 *    `until-0700` reverts to the next local 07:00 (the morning edge M).
 *
 * DST handling: uses the existing getLocalParts / buildCandidateUtc from schedule.js
 * (Intl-backed, no date-fns-tz dependency). The two-candidate ± 1-hour probe correctly
 * handles fall-back night (two 01:00s — takes the earlier UTC) and spring-forward
 * (no 01:00 BST — takes the first UTC where local >= 01:00, i.e. 01:00Z = 02:00 BST).
 */

import { getLocalParts, buildCandidateUtc } from './schedule.js';

// Duration keys: numeric-minute strings as sent by the UI ('30', '60', '120') plus
// named aliases ('30m', '1h', '2h') for backwards compat and the until-0700 / until-next-on specials.
const DURATION_MIN = { '30': 30, '60': 60, '120': 120, 'until-0700': null, 'until-next-on': null, '30m': 30, '1h': 60, '2h': 120 };

// 11-hour cap for until-next-on: must fit inside the 12 h retry window.
const UNTIL_NEXT_ON_MAX_MS = 11 * 60 * 60 * 1000;
const MIN_REMAINING_MS = 15 * 60 * 1000; // 15-minute minimum after clamp

/**
 * Find the next UTC instant strictly after `nowMs` where the local clock in `tz`
 * reads >= `targetHour` (0–23). Probes ±1h around today's and tomorrow's naive
 * buildCandidateUtc result to handle DST fall-back and spring-forward correctly.
 */
function findNextLocalBoundary(nowMs, localParts, targetHour, tz) {
    const { year, month, day } = localParts;
    const candidates = [];
    for (const dayOff of [0, 1]) {
        const base = buildCandidateUtc(year, month, day + dayOff, targetHour, 0, tz).getTime();
        for (const hourOff of [-1, 0, 1]) {
            const c = base + hourOff * 3600000;
            if (c > nowMs) {
                const lp = getLocalParts(new Date(c), tz);
                if (lp.hour >= targetHour) {
                    candidates.push(c);
                }
            }
        }
    }
    candidates.sort((a, b) => a - b);
    // Safety fallback: 24h from now (should never be needed given the dayOff=1 candidates)
    return candidates[0] ?? (nowMs + 24 * 3600000);
}

/**
 * Compute and validate the boost window.
 *
 * @param {number} nowMs - current time as ms since epoch
 * @param {'on'|'off'} direction
 * @param {'30m'|'1h'|'2h'|'until-0700'|'until-next-on'} durationKey
 * @param {string} [tz='Europe/London']
 * @param {number|null} [nextOnMs] - for until-next-on: the earliest nextOn.atMs across chosen zones, or null
 * @returns {{ ok: true, revertAtMs, requestedMin, effectiveMin, clamped, fallback?: 'until-0700' }
 *           |{ ok: false, code, message }}
 */
export function clampBoostWindow(nowMs, direction, durationKey, tz = 'Europe/London', nextOnMs = null) {
    if (!Object.prototype.hasOwnProperty.call(DURATION_MIN, durationKey)) {
        return { ok: false, code: 'invalid-duration', message: `Invalid duration key: ${durationKey}` };
    }
    if (direction !== 'on' && direction !== 'off') {
        return { ok: false, code: 'invalid-direction', message: `Invalid direction: ${direction}` };
    }

    const nowDate = new Date(nowMs);
    const { year, month, day, hour, minute } = getLocalParts(nowDate, tz);
    const localParts = { year, month, day, hour, minute };

    // Refuse window: [01:00, 07:00) local
    if (hour >= 1 && hour < 7) {
        return {
            ok: false,
            code: 'refused-window',
            message: "The heating can't be turned on or off from here between 01:00 and 07:00. Log it and the IoT helpdesk will pick it up in the morning."
        };
    }

    if (direction === 'on') {
        const requestedMin = DURATION_MIN[durationKey];
        // Ceiling C: earliest UTC after now where local >= 01:00
        const C = findNextLocalBoundary(nowMs, localParts, 1, tz);
        const rawRevertAt = nowMs + requestedMin * 60000;
        const revertAt = Math.min(rawRevertAt, C);
        const clamped = revertAt < rawRevertAt;

        // Too close to the ceiling: refuse rather than send a trivially-short boost
        if (clamped && (revertAt - nowMs) < MIN_REMAINING_MS) {
            const leftMin = Math.round((revertAt - nowMs) / 60000);
            return {
                ok: false,
                code: 'too-close',
                message: `Only ${leftMin} minute${leftMin !== 1 ? 's' : ''} left before the 01:00 cut-off, so the heating wasn't changed.`
            };
        }

        const effectiveMin = Math.round((revertAt - nowMs) / 60000);
        return { ok: true, revertAtMs: revertAt, requestedMin, effectiveMin, clamped };
    }

    // direction === 'off'
    if (durationKey === 'until-next-on') {
        // Dynamic: use the earliest nextOn.atMs across the chosen zones, with 15 min / 11 h guards.
        const M07 = findNextLocalBoundary(nowMs, localParts, 7, tz);
        if (
            nextOnMs === null ||
            nextOnMs - nowMs < MIN_REMAINING_MS ||
            nextOnMs - nowMs > UNTIL_NEXT_ON_MAX_MS
        ) {
            // Fall back to until-0700
            const effectiveMin = Math.round((M07 - nowMs) / 60000);
            return { ok: true, revertAtMs: M07, requestedMin: null, effectiveMin, clamped: false, fallback: 'until-0700' };
        }
        const effectiveMin = Math.round((nextOnMs - nowMs) / 60000);
        return { ok: true, revertAtMs: nextOnMs, requestedMin: null, effectiveMin, clamped: false };
    }
    if (durationKey === 'until-0700') {
        // Morning edge M: earliest UTC after now where local >= 07:00
        const M = findNextLocalBoundary(nowMs, localParts, 7, tz);
        const effectiveMin = Math.round((M - nowMs) / 60000);
        return { ok: true, revertAtMs: M, requestedMin: null, effectiveMin, clamped: false };
    } else {
        const requestedMin = DURATION_MIN[durationKey];
        const revertAt = nowMs + requestedMin * 60000;
        return { ok: true, revertAtMs: revertAt, requestedMin, effectiveMin: requestedMin, clamped: false };
    }
}
