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
 */
function getLocalParts(date, tz) {
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
 */
function buildCandidateUtc(year, month, day, hh, mm, tz) {
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
