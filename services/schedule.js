/**
 * Schedule decoder for boiler panels and PowerPause circuits.
 *
 * Decodes the "next scheduled change" from a device's SHARED_SCOPE schedule JSON,
 * honouring timezone and day-order configuration (DD-SCHED-DISPLAY, display ON by default).
 *
 * OOHDASH-123 design section 10.
 * SQ-13: day-order and timezone are invertible assumptions -- confirm with device owner
 * before treating decoded output as authoritative.
 *
 * DST caveat: the Intl offset approach is accurate at the instant queried. Each candidate
 * date is re-queried independently, so DST transitions between now and the candidate are
 * handled correctly for day and time selection. Ambiguous wall-clock times at the DST
 * "fall-back" boundary resolve to the earlier (pre-transition) UTC instant.
 */

// Day-name lookup (JS weekday: 0=Sun, 1=Mon, ..., 6=Sat)
const JS_WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Map long English weekday name -> JS weekday index
const WEEKDAY_JS = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6
};

/**
 * Read the local date/time parts for a given UTC Date in a named IANA timezone.
 * Returns { year, month (1-based), day, hour (0-23), minute, jsDay (0=Sun) }.
 * Exported for use by services/boost-window.js (OOHDASH-141).
 */
export function getLocalParts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hour12: false
  });
  const parts = fmt.formatToParts(date);
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  // hour12:false can yield '24' at midnight on some ICU builds; normalise.
  const hour = parseInt(p.hour, 10) % 24;
  const jsDay = WEEKDAY_JS[p.weekday] ?? 0;
  return {
    year: parseInt(p.year, 10),
    month: parseInt(p.month, 10),
    day: parseInt(p.day, 10),
    hour,
    minute: parseInt(p.minute, 10),
    jsDay
  };
}

/**
 * Build the UTC Date that corresponds to local Y/M/D HH:MM in tz.
 * Uses two-step Intl offset: treat target local time as UTC, read back the
 * local interpretation to derive the zone offset, then correct.
 * Date.UTC handles day-of-month overflow (e.g. Jan 33 -> Feb 2) correctly.
 * Exported for use by services/boost-window.js (OOHDASH-141).
 */
export function buildCandidateUtc(year, month, day, hh, mm, tz) {
  const approxUtcMs = Date.UTC(year, month - 1, day, hh, mm, 0, 0);
  const approxDate = new Date(approxUtcMs);
  const localParts = getLocalParts(approxDate, tz);
  const localAsUtcMs = Date.UTC(
    localParts.year, localParts.month - 1, localParts.day,
    localParts.hour, localParts.minute, 0, 0
  );
  const offsetMs = localAsUtcMs - approxUtcMs;
  return new Date(approxUtcMs - offsetMs);
}

/**
 * Map a JS weekday (0=Sun) to its character position in a loops string.
 * mon-first: Mon=0 ... Sun=6  -> (jsDay + 6) % 7
 * sun-first: Sun=0 ... Sat=6  -> jsDay
 */
function jsToLoopsIdx(jsDay, dayOrder) {
  return dayOrder === 'sun-first' ? jsDay : (jsDay + 6) % 7;
}

/**
 * Parse the schedule input into a plain array of entries, or signal the error type.
 * Returns: Array (may be empty) | null (absent) | 'unsafe' (parse failure)
 */
function parseInput(scheduleJson) {
  if (scheduleJson == null) return null;
  let raw = scheduleJson;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return 'unsafe'; }
  }
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.schedule)) return raw.schedule;
  return null;
}

/**
 * Find the soonest schedule entry strictly after `now`.
 *
 * @param {object|Array|string|null|undefined} scheduleJson
 *   Parsed object ({schedule:[...]}), bare array, JSON string, or absent.
 * @param {Date} now  Reference time (UTC Date).
 * @param {{ dayOrder?: 'mon-first'|'sun-first', tz?: string }} [opts]
 * @returns {{ ok: true, at: Date, value, timeText: string, dayText: string, raw: object }
 *         | { ok: false, reason: 'absent'|'unsafe' }}
 */
export function decodeNextChange(scheduleJson, now, opts = {}) {
  const { dayOrder = 'mon-first', tz = 'Europe/London' } = opts;
  try {
    const parsed = parseInput(scheduleJson);
    if (parsed === 'unsafe') return { ok: false, reason: 'unsafe' };
    if (!parsed || parsed.length === 0) return { ok: false, reason: 'absent' };

    // Retain only well-formed entries
    const entries = parsed.filter(
      e => e && typeof e.time === 'string' && typeof e.loops === 'string'
    );
    if (entries.length === 0) return { ok: false, reason: 'absent' };

    const nowParts = getLocalParts(now, tz);
    let best = null;

    // Search today through 6 days ahead (7 days total) for the soonest active entry.
    for (let daysAhead = 0; daysAhead <= 6; daysAhead++) {
      const jsDay = (nowParts.jsDay + daysAhead) % 7;
      const loopsIdx = jsToLoopsIdx(jsDay, dayOrder);

      for (const entry of entries) {
        if ((entry.loops[loopsIdx] ?? '0') !== '1') continue;

        const timeParts = entry.time.split(':');
        const hh = parseInt(timeParts[0], 10);
        const mm = parseInt(timeParts[1], 10);
        if (isNaN(hh) || isNaN(mm)) continue;

        // Build the actual UTC instant for this entry on the candidate local date.
        const candidateUtc = buildCandidateUtc(
          nowParts.year, nowParts.month, nowParts.day + daysAhead,
          hh, mm, tz
        );

        if (candidateUtc > now) {
          if (!best || candidateUtc < best.at) {
            let dayText;
            if (daysAhead === 0) dayText = 'today';
            else if (daysAhead === 1) dayText = 'tomorrow';
            else dayText = JS_WEEKDAY[jsDay];

            best = {
              ok: true,
              at: candidateUtc,
              value: entry.value,
              timeText: entry.time,
              dayText,
              raw: entry
            };
          }
        }
      }
    }

    return best ?? { ok: false, reason: 'absent' };
  } catch {
    return { ok: false, reason: 'unsafe' };
  }
}

/**
 * OOHDASH-140: Evaluate a normalised schedule entry array against a reference time.
 *
 * entries: array of { time:'HH:MM', loops:'<7 chars sun-first>', on:boolean, enabled:boolean }
 * now:     Date (reference time)
 * opts:    { tz?: string } — defaults to 'Europe/London'
 *
 * Returns { state:'on'|'off'|'none'|'off-only', lastChange, nextOn, nextOff, entryCount }
 * where each time ref is { time:'HH:MM', dayText:'today'|'tomorrow'|'yesterday'|weekdayName, atMs }
 * or null. loops position 0 = Sunday (sun-first), matching both OWON bit0 and Tongou position 0.
 */
export function evaluateSchedule(entries, now, opts = {}) {
    const tz = opts.tz ?? 'Europe/London';
    const nowDate = now instanceof Date ? now : new Date(now);
    const nowMs = nowDate.getTime();

    // Active entries: enabled===true AND loops has at least one '1'
    const active = (entries || []).filter(e => e.enabled === true && typeof e.loops === 'string' && e.loops.includes('1'));

    if (!active.length) {
        return { state: 'none', lastChange: null, nextOn: null, nextOff: null, entryCount: 0 };
    }

    // Check if any ON entries exist
    const hasOn = active.some(e => e.on === true);
    if (!hasOn) {
        return { state: 'off-only', lastChange: null, nextOn: null, nextOff: null, entryCount: active.length };
    }

    const nowParts = getLocalParts(nowDate, tz);

    // Helper: build candidate UTC for an entry on a given day-offset from today
    function candidateFor(entry, dayOffset) {
        const parts = entry.time.split(':');
        const hh = parseInt(parts[0], 10);
        const mm = parseInt(parts[1], 10);
        if (isNaN(hh) || isNaN(mm)) return null;
        return buildCandidateUtc(nowParts.year, nowParts.month, nowParts.day + dayOffset, hh, mm, tz);
    }

    // Helper: loops index for sun-first (position 0 = Sunday = JS day 0)
    function loopsIdx(jsDay) {
        return jsDay; // sun-first: position 0=Sun matches JS getDay()=0
    }

    // Helper: dayText for a day offset
    function dayText(offset) {
        if (offset === 0) return 'today';
        if (offset === 1) return 'tomorrow';
        if (offset === -1) return 'yesterday';
        const candidate = new Date(nowDate.getTime() + offset * 86400000);
        const parts = getLocalParts(candidate, tz);
        return JS_WEEKDAY[parts.jsDay];
    }

    // Walk BACK up to 7 days to find lastChange
    let lastChange = null;
    for (let daysBack = 0; daysBack <= 7 && !lastChange; daysBack++) {
        // Collect all entries that fire on this day (check jsDay for that candidate date)
        const candidateDateMs = nowMs - daysBack * 86400000;
        const candidateDate = new Date(candidateDateMs);
        const candidateParts = getLocalParts(candidateDate, tz);
        const jsDay = candidateParts.jsDay;

        // Find entries that fire on this weekday
        const firingEntries = active.filter(e => e.loops[loopsIdx(jsDay)] === '1');
        if (!firingEntries.length) continue;

        // For each firing entry, build the UTC time and check if it's <= now
        const candidates = [];
        for (const e of firingEntries) {
            const parts = e.time.split(':');
            const hh = parseInt(parts[0], 10);
            const mm = parseInt(parts[1], 10);
            if (isNaN(hh) || isNaN(mm)) continue;
            const utc = buildCandidateUtc(candidateParts.year, candidateParts.month, candidateParts.day, hh, mm, tz);
            if (utc.getTime() <= nowMs) {
                candidates.push({ e, utc, atMs: utc.getTime() });
            }
        }

        if (!candidates.length) continue;

        // Sort by time descending, pick latest
        candidates.sort((a, b) => b.atMs - a.atMs);
        // Same-minute conflict resolution: OFF wins
        const latestMs = candidates[0].atMs;
        const atSameMinute = candidates.filter(c => c.atMs === latestMs);
        let winner;
        if (atSameMinute.length > 1) {
            // OFF wins on conflict
            winner = atSameMinute.find(c => c.e.on === false) || atSameMinute[0];
        } else {
            winner = candidates[0];
        }

        const offset = daysBack === 0 ? 0 : -daysBack;
        lastChange = {
            time: winner.e.time,
            dayText: dayText(offset),
            atMs: winner.atMs,
            on: winner.e.on
        };
    }

    const state = lastChange ? (lastChange.on ? 'on' : 'off') : 'none';

    // Walk FORWARD up to 7 days to find nextOn and nextOff
    function findNext(wantOn) {
        for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
            const candidateDate = new Date(nowMs + daysAhead * 86400000);
            const candidateParts = getLocalParts(candidateDate, tz);
            const jsDay = candidateParts.jsDay;

            const firingEntries = active.filter(e => e.loops[loopsIdx(jsDay)] === '1' && e.on === wantOn);
            if (!firingEntries.length) continue;

            const candidates = [];
            for (const e of firingEntries) {
                const parts = e.time.split(':');
                const hh = parseInt(parts[0], 10);
                const mm = parseInt(parts[1], 10);
                if (isNaN(hh) || isNaN(mm)) continue;
                const utc = buildCandidateUtc(candidateParts.year, candidateParts.month, candidateParts.day, hh, mm, tz);
                if (utc.getTime() > nowMs) {
                    candidates.push({ e, utc, atMs: utc.getTime() });
                }
            }

            if (!candidates.length) continue;

            candidates.sort((a, b) => a.atMs - b.atMs);
            const first = candidates[0];
            return {
                time: first.e.time,
                dayText: dayText(daysAhead),
                atMs: first.atMs
            };
        }
        return null;
    }

    const nextOn = findNext(true);
    const nextOff = findNext(false);

    return { state, lastChange: lastChange ? { time: lastChange.time, dayText: lastChange.dayText, atMs: lastChange.atMs } : null, nextOn, nextOff, entryCount: active.length };
}

/**
 * Return a human-readable operator string for the next scheduled change, or null.
 *
 * Format (ASCII only, straight apostrophe):
 *   "based on the device's stored schedule, next change to <value> at <HH:MM> <dayText>"
 *
 * @param {object|Array|string|null|undefined} scheduleJson
 * @param {Date} now
 * @param {{ dayOrder?: 'mon-first'|'sun-first', tz?: string }} [opts]
 * @returns {string|null}
 */
export function describeNextChange(scheduleJson, now, opts = {}) {
  const result = decodeNextChange(scheduleJson, now, opts);
  if (!result.ok) return null;
  return `based on the device's stored schedule, next change to ${result.value} at ${result.timeText} ${result.dayText}`;
}
