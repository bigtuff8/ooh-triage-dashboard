/**
 * OOHDASH-144 — Unit tests.
 *
 * TT-1  zoneTimetable: every-day schedule → currentTempC, nextOn (step-up only), midnight walk-back
 * TT-2  any entry not '1111111' → everyDay:false, no nextOn
 * TT-3  malformed/empty → null; V2 CHZ2.schedule decoded for zone 2
 * UN-1  until-next-on clampBoostWindow: uses nextOnMs when 15min–11h; too far/close/missing → fallback
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

const { zoneTimetable } = await import('../services/schedule.js');
const { clampBoostWindow } = await import('../services/boost-window.js');

// ─── Fixed reference times ────────────────────────────────────────────────
const TZ = 'Europe/London';
// 2027-01-15 20:00 UTC (winter, UK = UTC+0), so local time is 20:00
const NOW_MS = Date.UTC(2027, 0, 15, 20, 0, 0); // Fri 20:00 GMT

// A simple every-day schedule: 06:30 → 21°C (heat up), 23:00 → 15°C (cool down)
const EVERY_DAY_SCHED = {
    schedule: [
        { value: 21, time: '06:30', loops: '1111111', timer_id: 't1' },
        { value: 15, time: '23:00', loops: '1111111', timer_id: 't2' }
    ]
};

// A weekday-only schedule
const WEEKDAY_SCHED = {
    schedule: [
        { value: 21, time: '06:30', loops: '1111100', timer_id: 't3' },
        { value: 15, time: '23:00', loops: '1111100', timer_id: 't4' }
    ]
};

// ─── TT-1: every-day schedule → currentTempC, nextOn (step-up only) ───────
test('TT-1a: every-day schedule returns everyDay:true and currentTempC', () => {
    const result = zoneTimetable(EVERY_DAY_SCHED, NOW_MS, TZ);
    assert.ok(result, 'should return a result object');
    assert.equal(result.everyDay, true, 'everyDay should be true for 1111111 loops');
    // At 20:00 the current slot started at 06:30 (21°C, since 23:00 is in the future)
    assert.equal(result.currentTempC, 21, 'currentTempC should be 21 at 20:00');
});

test('TT-1b: every-day schedule returns nextOn pointing to next step-up (06:30 next day)', () => {
    const result = zoneTimetable(EVERY_DAY_SCHED, NOW_MS, TZ);
    assert.ok(result, 'should return a result');
    assert.ok(result.nextOn, 'should have nextOn');
    // At 20:00 the next step-up is 06:30 tomorrow
    assert.equal(result.nextOn.timeText, '06:30', 'nextOn timeText should be 06:30');
    assert.equal(result.nextOn.tempC, 21, 'nextOn tempC should be 21');
    assert.ok(result.nextOn.atMs > NOW_MS, 'nextOn atMs should be in the future');
    // Should be < 12h away (06:30 is 10.5h from 20:00)
    const hoursAway = (result.nextOn.atMs - NOW_MS) / 3600000;
    assert.ok(hoursAway > 9 && hoursAway < 12, 'nextOn should be ~10.5h away');
});

test('TT-1c: midnight walk-back — at 02:00 the next 06:30 is still today (< 12h)', () => {
    const at0200 = Date.UTC(2027, 0, 16, 2, 0, 0); // 02:00 GMT (after midnight)
    const result = zoneTimetable(EVERY_DAY_SCHED, at0200, TZ);
    assert.ok(result && result.nextOn, 'should have nextOn at 02:00');
    assert.equal(result.nextOn.timeText, '06:30');
    const hoursAway = (result.nextOn.atMs - at0200) / 3600000;
    assert.ok(hoursAway > 3 && hoursAway < 6, 'nextOn should be ~4.5h away at 02:00');
});

// ─── TT-2: any entry not '1111111' → everyDay:false, no nextOn ────────────
test('TT-2a: weekday-only schedule returns everyDay:false', () => {
    const result = zoneTimetable(WEEKDAY_SCHED, NOW_MS, TZ);
    assert.ok(result, 'should return a result');
    assert.equal(result.everyDay, false, 'everyDay should be false for non-1111111 loops');
});

test('TT-2b: weekday-only schedule (sun-first) returns nextOn for next step-up day', () => {
    // WEEKDAY_SCHED loops='1111100' with sun-first = Sun-Thu active. NOW=Fri 20:00 GMT.
    // Fri+Sat have no entries; Sun has 06:30 (21°C, step-up from 23:00 setback).
    const result = zoneTimetable(WEEKDAY_SCHED, NOW_MS, TZ);
    assert.ok(result, 'should return a result');
    assert.ok(result.nextOn, 'nextOn should now be non-null (SQ-13 confirmed)');
    assert.equal(result.nextOn.timeText, '06:30', 'next step-up is 06:30');
    assert.equal(result.nextOn.dayText, 'Sunday', 'next active day after Fri is Sunday');
    assert.equal(result.nextOn.tempC, 21);
});


// ─── TT-3: malformed/empty → null ─────────────────────────────────────────
test('TT-3a: null schedule → zoneTimetable returns null', () => {
    const result = zoneTimetable(null, NOW_MS, TZ);
    assert.equal(result, null, 'null schedule should return null');
});

test('TT-3b: empty schedule array → zoneTimetable returns null', () => {
    const result = zoneTimetable({ schedule: [] }, NOW_MS, TZ);
    assert.equal(result, null, 'empty schedule array should return null');
});

test('TT-3c: undefined schedule → zoneTimetable returns null', () => {
    const result = zoneTimetable(undefined, NOW_MS, TZ);
    assert.equal(result, null, 'undefined schedule should return null');
});

test('TT-3d: schedule without loops field → everyDay:false, no nextOn', () => {
    const noLoops = { schedule: [{ value: 21, time: '06:30', timer_id: 'x' }] };
    const result = zoneTimetable(noLoops, NOW_MS, TZ);
    // Should not throw; everyDay should be false (no loops = cannot confirm every-day)
    if (result !== null) {
        assert.equal(result.everyDay, false, 'no-loops entry should not be treated as every-day');
    }
    // Either null or everyDay:false is acceptable
});

// ─── UN-1: until-next-on clampBoostWindow ─────────────────────────────────
// nextOnMs valid (15min–11h from now) → revertAtMs = nextOnMs
test('UN-1a: until-next-on with nextOnMs 2h away → revertAtMs = nextOnMs', () => {
    const now = Date.UTC(2027, 0, 15, 20, 0, 0); // 20:00 GMT
    const nextOnMs = now + 2 * 60 * 60 * 1000;   // 22:00 GMT (2h away)
    const result = clampBoostWindow(now, 'off', 'until-next-on', 'Europe/London', nextOnMs);
    assert.equal(result.ok, true, 'should be ok');
    assert.equal(result.revertAtMs, nextOnMs, 'revertAtMs should equal nextOnMs');
    assert.ok(!result.fallback, 'should have no fallback');
});

// nextOnMs too far (> 11h) → fallback to until-0700
test('UN-1b: until-next-on with nextOnMs 12h away → fallback until-0700', () => {
    const now = Date.UTC(2027, 0, 15, 20, 0, 0); // 20:00 GMT
    const nextOnMs = now + 12 * 60 * 60 * 1000;  // 08:00 next day (too far)
    const result = clampBoostWindow(now, 'off', 'until-next-on', 'Europe/London', nextOnMs);
    assert.equal(result.ok, true, 'should be ok (fallback path)');
    assert.equal(result.fallback, 'until-0700', 'should fallback to until-0700');
});

// nextOnMs too close (< 15min) → fallback to until-0700
test('UN-1c: until-next-on with nextOnMs 5 min away → fallback until-0700', () => {
    const now = Date.UTC(2027, 0, 15, 20, 0, 0); // 20:00 GMT
    const nextOnMs = now + 5 * 60 * 1000;          // 5 min away (too close)
    const result = clampBoostWindow(now, 'off', 'until-next-on', 'Europe/London', nextOnMs);
    assert.equal(result.ok, true, 'should be ok (fallback path)');
    assert.equal(result.fallback, 'until-0700', 'should fallback to until-0700');
});

// nextOnMs null → fallback to until-0700
test('UN-1d: until-next-on with null nextOnMs → fallback until-0700', () => {
    const now = Date.UTC(2027, 0, 15, 20, 0, 0); // 20:00 GMT
    const result = clampBoostWindow(now, 'off', 'until-next-on', 'Europe/London', null);
    assert.equal(result.ok, true, 'should be ok (fallback path)');
    assert.equal(result.fallback, 'until-0700', 'should fallback to until-0700 when no timetable');
});

// ─── TT-4: day-varying schedule (SQ-13 confirmed sun-first) ───────────────
// Schedule: loops='1000011' (Sun/Fri/Sat) at 09:00 + setback at 22:00,
//           loops='0111100' (Mon-Thu) at 11:00 + setback at 22:00.
// All times GMT (winter, UTC+0). Dates around 2027-01-15 (Friday).
const DAY_VARYING_SCHED = {
    schedule: [
        { value: 21, time: '09:00', loops: '1000011', timer_id: 'dv1' }, // Sun/Fri/Sat heat on
        { value: 15, time: '22:00', loops: '1000011', timer_id: 'dv2' }, // Sun/Fri/Sat setback
        { value: 21, time: '11:00', loops: '0111100', timer_id: 'dv3' }, // Mon-Thu heat on
        { value: 15, time: '22:00', loops: '0111100', timer_id: 'dv4' }, // Mon-Thu setback
    ]
};

test('TT-4a: day-varying schedule — at Fri 20:00 nextOn is Sat 09:00 (tomorrow)', () => {
    // Fri 20:00: today's 09:00 already fired; 22:00 setback is next but is not a step-up.
    // Sat (jsDay=6, loops[6]='1'): 09:00 (21°C), prev=22:00 (15°C) → step-up → nextOn.
    const friEvening = Date.UTC(2027, 0, 15, 20, 0, 0); // Fri 2027-01-15 20:00 GMT
    const result = zoneTimetable(DAY_VARYING_SCHED, friEvening, TZ);
    assert.ok(result, 'should return a result');
    assert.equal(result.everyDay, false);
    assert.ok(result.nextOn, 'should have nextOn');
    assert.equal(result.nextOn.timeText, '09:00');
    assert.equal(result.nextOn.dayText, 'tomorrow');
    assert.equal(result.nextOn.tempC, 21);
});

test('TT-4b: day-varying schedule — at Mon 08:00 nextOn is Mon 11:00 (today)', () => {
    // Mon (jsDay=1, loops[1]='1' for dv3/dv4): 11:00 step-up fires today after 08:00.
    const monMorning = Date.UTC(2027, 0, 18, 8, 0, 0); // Mon 2027-01-18 08:00 GMT
    const result = zoneTimetable(DAY_VARYING_SCHED, monMorning, TZ);
    assert.ok(result, 'should return a result');
    assert.equal(result.everyDay, false);
    assert.ok(result.nextOn, 'should have nextOn');
    assert.equal(result.nextOn.timeText, '11:00');
    assert.equal(result.nextOn.dayText, 'today');
    assert.equal(result.nextOn.tempC, 21);
});

test('TT-4c: day-varying schedule — at Sun 10:00 nextOn is Mon 11:00 (tomorrow)', () => {
    // Sun (jsDay=0, loops[0]='1'): 09:00 already fired; 22:00 setback is not a step-up.
    // Mon (jsDay=1): 11:00 step-up is next → tomorrow.
    const sunMidMorning = Date.UTC(2027, 0, 17, 10, 0, 0); // Sun 2027-01-17 10:00 GMT
    const result = zoneTimetable(DAY_VARYING_SCHED, sunMidMorning, TZ);
    assert.ok(result, 'should return a result');
    assert.equal(result.everyDay, false);
    assert.ok(result.nextOn, 'should have nextOn');
    assert.equal(result.nextOn.timeText, '11:00');
    assert.equal(result.nextOn.dayText, 'tomorrow');
    assert.equal(result.nextOn.tempC, 21);
});
