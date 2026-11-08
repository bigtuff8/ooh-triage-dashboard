/**
 * OOHDASH-146 D14 / B27: the shared urgency helper.
 *
 * ONE pure function, urgencyOf(neededAt, now, opts), used by the browser (classic script, attaches
 * OohUrgency to globalThis) and by the server (services/urgency.js loads this same file, so the two can
 * never drift). The browser result is never trusted: the server recomputes on POST /api/outcomes and
 * POST /api/oneoffs.
 *
 * Rule (design section 2B.1): the IoT team acts within `responseWorkingHours` (3) OFFICE hours of the
 * request. Office hours default to Monday to Friday 09:00 to 17:00 Europe/London, excluding bank
 * holidays. A request is URGENT when it is needed BEFORE the earliest moment the IoT team could do it
 * (now plus 3 working hours); a request needed at or after that moment is NOT urgent.
 *
 * neededAt may be: a Date, epoch milliseconds, an ISO string with Z or an offset, or a local wall-clock
 * string 'YYYY-MM-DDTHH:mm' (read as Europe/London time). Daylight saving is handled with Intl.
 */
(function (root) {
    'use strict';

    var DEFAULTS = {
        tz: 'Europe/London',
        officeHours: 'Mon-Fri 09:00-17:00',
        responseWorkingHours: 3,
        bankHolidays: []
    };

    var DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    /** Parses 'Mon-Fri 09:00-17:00' into { days: Set<0..6>, openMin, closeMin }. Falls back to the default. */
    function parseOfficeHours(spec) {
        var m = /^\s*([A-Za-z]{3})(?:\s*-\s*([A-Za-z]{3}))?\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(String(spec || ''));
        if (!m) return parseOfficeHours(DEFAULTS.officeHours);
        var a = DAY_NAMES.indexOf(m[1].toLowerCase());
        var b = m[2] ? DAY_NAMES.indexOf(m[2].toLowerCase()) : a;
        if (a < 0 || b < 0) return parseOfficeHours(DEFAULTS.officeHours);
        var days = {};
        for (var d = a; ; d = (d + 1) % 7) { days[d] = true; if (d === b) break; }
        var openMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
        var closeMin = parseInt(m[5], 10) * 60 + parseInt(m[6], 10);
        if (!(closeMin > openMin)) return parseOfficeHours(DEFAULTS.officeHours);
        return { days: days, openMin: openMin, closeMin: closeMin };
    }

    var _fmtCache = {};
    function fmt(tz) {
        if (!_fmtCache[tz]) {
            _fmtCache[tz] = new Intl.DateTimeFormat('en-GB', {
                timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
            });
        }
        return _fmtCache[tz];
    }

    /** Wall-clock parts of an instant in the zone: { y, mo, d, h, mi, s, dow }. */
    function partsOf(epochMs, tz) {
        var out = {};
        fmt(tz).formatToParts(new Date(epochMs)).forEach(function (p) { out[p.type] = p.value; });
        return {
            y: +out.year, mo: +out.month, d: +out.day, h: +out.hour % 24, mi: +out.minute, s: +out.second,
            dow: DAY_NAMES.indexOf(String(out.weekday).toLowerCase().slice(0, 3))
        };
    }

    /** Offset (ms) of the zone from UTC at an instant. */
    function offsetAt(epochMs, tz) {
        var p = partsOf(epochMs, tz);
        var asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
        return asUtc - Math.floor(epochMs / 1000) * 1000;
    }

    /** The instant at which the zone's wall clock reads y-mo-d h:mi (DST-safe; nonexistent times roll forward). */
    function wallToEpoch(y, mo, d, h, mi, tz) {
        var guess = Date.UTC(y, mo - 1, d, h, mi, 0);
        var e = guess - offsetAt(guess, tz);
        var off2 = offsetAt(e, tz);
        if (guess - off2 !== e) e = guess - off2;
        return e;
    }

    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function dateKey(p) { return p.y + '-' + pad(p.mo) + '-' + pad(p.d); }

    /** Coerces neededAt / now to epoch ms, or NaN. */
    function toEpoch(v, tz) {
        if (v === null || v === undefined || v === '') return NaN;
        if (typeof v === 'number') return v;
        if (typeof v === 'object' && typeof v.getTime === 'function') return v.getTime();
        var s = String(v).trim();
        var local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
        if (local) return wallToEpoch(+local[1], +local[2], +local[3], +local[4], +local[5], tz);
        var t = Date.parse(s);
        return isNaN(t) ? NaN : t;
    }

    function mergeOpts(opts) {
        var o = opts || {};
        var bh = {};
        (o.bankHolidays || DEFAULTS.bankHolidays).forEach(function (k) { bh[String(k).slice(0, 10)] = true; });
        var rh = Number(o.responseWorkingHours);
        return {
            tz: o.tz || DEFAULTS.tz,
            hours: parseOfficeHours(o.officeHours || DEFAULTS.officeHours),
            responseMs: (rh > 0 ? rh : DEFAULTS.responseWorkingHours) * 3600000,
            bankHolidays: bh
        };
    }

    /**
     * The earliest instant the IoT team could act on a request made at startMs: startMs plus
     * `responseMs` of OFFICE time (skipping evenings, weekends and bank holidays).
     */
    function addWorkingTime(startMs, cfg) {
        var cursor = startMs;
        var remaining = cfg.responseMs;
        for (var i = 0; i < 800; i++) {
            var p = partsOf(cursor, cfg.tz);
            var working = cfg.hours.days[p.dow] && !cfg.bankHolidays[dateKey(p)];
            if (working) {
                var open = wallToEpoch(p.y, p.mo, p.d, Math.floor(cfg.hours.openMin / 60), cfg.hours.openMin % 60, cfg.tz);
                var close = wallToEpoch(p.y, p.mo, p.d, Math.floor(cfg.hours.closeMin / 60), cfg.hours.closeMin % 60, cfg.tz);
                if (cursor < open) cursor = open;
                if (cursor < close) {
                    var avail = close - cursor;
                    if (remaining <= avail) return cursor + remaining;
                    remaining -= avail;
                }
            }
            // next calendar day, 00:00 local
            var next = wallToEpoch(p.y, p.mo, p.d + 1, 0, 0, cfg.tz);
            cursor = Math.max(next, cursor + 1);
        }
        return NaN;
    }

    /**
     * urgencyOf(neededAt, now, opts) -> { urgent, urgency, label, earliestActionAt, neededAtMs } | null.
     * `urgency` is 'urgent' or 'not-urgent'. Returns null when neededAt or now cannot be read, so a
     * caller never treats garbage as "not urgent".
     */
    function urgencyOf(neededAt, now, opts) {
        var cfg = mergeOpts(opts);
        var nowMs = toEpoch(now === undefined || now === null ? Date.now() : now, cfg.tz);
        var neededMs = toEpoch(neededAt, cfg.tz);
        if (isNaN(nowMs) || isNaN(neededMs)) return null;
        var earliest = addWorkingTime(nowMs, cfg);
        if (isNaN(earliest)) return null;
        var urgent = neededMs < earliest;
        return {
            urgent: urgent,
            urgency: urgent ? 'urgent' : 'not-urgent',
            label: urgent ? 'Urgent — outside office hours' : 'Not urgent — the IoT team can pick this up in time',
            earliestActionAt: earliest,
            neededAtMs: neededMs
        };
    }

    var api = { urgencyOf: urgencyOf, parseOfficeHours: parseOfficeHours, DEFAULTS: DEFAULTS };
    root.OohUrgency = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
