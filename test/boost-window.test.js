/**
 * OOHDASH-141 — Unit tests for clampBoostWindow (BW1–BW18).
 *
 * Pure-function tests: no network, no TB, no fixture data.
 * Uses fixed UTC timestamps to exercise every row of design §5.
 *
 * BW1  – 22:00 GMT winter ON 2h → ends midnight (no clamp, effectiveMin=120)
 * BW2  – 00:30 GMT winter ON 2h → clamped to 30 min (ceiling at 01:00Z)
 * BW3  – 00:50 GMT winter ON 30m → refused (10 min left < 15)
 * BW4  – 00:40 GMT winter ON 1h → clamped to 20 min (≥ 15 min → ok)
 * BW5  – 01:01 GMT winter ON → refused (01:00–07:00 window)
 * BW6a – 06:59 GMT winter ON → refused (window)
 * BW6b – 07:00 GMT winter ON → ok (just past window)
 * BW7  – 06:59 GMT winter OFF → refused; 07:00 OFF → ok
 * BW8  – 23:00 GMT winter OFF 1h → ok, no clamp, ends 00:00Z
 * BW9  – 22:00 GMT winter OFF until-0700 → ok, ends 07:00Z next day
 * BW10 – Fall-back 2026-10-25: 22:30Z (= 23:30 BST) ON 2h → clamped to 90 min (ceiling = 00:00Z)
 * BW11 – Fall-back: 01:30Z Oct 25 ON 1h → refused (in window after fall-back)
 * BW12 – Spring-forward 2027-03-28: 00:30Z ON 2h → clamped to 30 min (ceiling = 01:00Z = 02:00 BST)
 * BW13 – Spring-forward: 22:00Z Mar 27 OFF until-0700 → ends 06:00Z Mar 28 (~480 min)
 * BW14 – invalid direction → ok:false, code:invalid-direction
 * BW15 – invalid durationKey → ok:false, code:invalid-duration
 * BW16 – ON: 23:30 GMT ON 2h → clamped to 90 min (ceiling at next 01:00Z = 01:30 later = clamp to 90)
 * BW17 – OFF: 22:00 winter OFF 1h is NOT clamped (OFF boosts are never clamped by 01:00 rule)
 * BW18 – OFF: between 01:00 and 07:00 is also refused for OFF (Option B)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

const { clampBoostWindow } = await import('../services/boost-window.js');

// ── Fixed winter timestamps (2027-01-15 / 16, GMT = UTC) ──────────────────
const JAN15_22 = Date.UTC(2027, 0, 15, 22,  0, 0); // 22:00Z Jan 15
const JAN16_00_30 = Date.UTC(2027, 0, 16,  0, 30, 0); // 00:30Z Jan 16
const JAN16_00_40 = Date.UTC(2027, 0, 16,  0, 40, 0); // 00:40Z Jan 16
const JAN16_00_50 = Date.UTC(2027, 0, 16,  0, 50, 0); // 00:50Z Jan 16
const JAN16_01_01 = Date.UTC(2027, 0, 16,  1,  1, 0); // 01:01Z (in refuse window)
const JAN16_06_59 = Date.UTC(2027, 0, 16,  6, 59, 0); // 06:59Z (in refuse window)
const JAN16_07_00 = Date.UTC(2027, 0, 16,  7,  0, 0); // 07:00Z (past refuse window)
const JAN15_23_00 = Date.UTC(2027, 0, 15, 23,  0, 0); // 23:00Z Jan 15
const JAN15_23_30 = Date.UTC(2027, 0, 15, 23, 30, 0); // 23:30Z Jan 15
const JAN16_01_00 = Date.UTC(2027, 0, 16,  1,  0, 0); // 01:00Z (ceiling for winter)

// ── Fall-back night: 2026-10-25 ──────────────────────────────────────────
// Clocks go back at 02:00 BST → 01:00 GMT, so BST night has two 01:00s.
// Conservative ceiling = FIRST 01:00 BST = 00:00Z Oct 25.
const FB_2230 = Date.UTC(2026,  9, 24, 22, 30, 0); // 22:30Z Oct 24 = 23:30 BST
const FB_0130 = Date.UTC(2026,  9, 25,  1, 30, 0); // 01:30Z Oct 25 = 01:30 GMT (in window)
const FB_CEIL = Date.UTC(2026,  9, 25,  0,  0, 0); // 00:00Z Oct 25 = first 01:00 BST

// ── Spring-forward night: 2027-03-28 (Sunday) ───────────────────────────
// At 01:00 GMT clocks jump to 02:00 BST. 01:00 BST does not exist.
// First local >= 01:00 after 00:30Z = 01:00Z (= 02:00 BST).
const SF_0030 = Date.UTC(2027,  2, 28,  0, 30, 0); // 00:30Z Mar 28
const SF_CEIL = Date.UTC(2027,  2, 28,  1,  0, 0); // 01:00Z Mar 28 = 02:00 BST (ceiling)
const SF_OFF_START = Date.UTC(2027, 2, 27, 22,  0, 0); // 22:00Z Mar 27 (the night before)
const SF_MORNING   = Date.UTC(2027, 2, 28,  6,  0, 0); // 06:00Z Mar 28 = 07:00 BST (morning edge)

/* ── BW1: 22:00 GMT ON 2h → ends 00:00Z (no clamp) ─────────────────── */
test('BW1: 22:00 GMT ON 2h — ends midnight, not clamped, effectiveMin=120', () => {
    const r = clampBoostWindow(JAN15_22, 'on', '2h');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, false);
    assert.equal(r.effectiveMin, 120);
    assert.equal(r.requestedMin, 120);
    // revertAt = 22:00 + 2h = 00:00Z Jan 16 = midnight
    assert.equal(r.revertAtMs, JAN15_22 + 120 * 60000);
});

/* ── BW2: 00:30 GMT ON 2h → clamped to 30 min ───────────────────────── */
test('BW2: 00:30 GMT ON 2h — clamped to 30 min (ceiling at 01:00Z)', () => {
    const r = clampBoostWindow(JAN16_00_30, 'on', '2h');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, true);
    assert.equal(r.effectiveMin, 30);
    assert.equal(r.requestedMin, 120);
    assert.equal(r.revertAtMs, JAN16_01_00);
});

/* ── BW3: 00:50 GMT ON 30m → refused (10 min left < 15) ─────────────── */
test('BW3: 00:50 GMT ON 30m — refused (only 10 min to 01:00 cut-off)', () => {
    const r = clampBoostWindow(JAN16_00_50, 'on', '30m');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'too-close');
    assert.match(r.message, /10 minute/);
});

/* ── BW4: 00:40 GMT ON 1h → clamped to 20 min (ok, ≥ 15) ───────────── */
test('BW4: 00:40 GMT ON 1h — clamped to 20 min (20 ≥ 15, not refused)', () => {
    const r = clampBoostWindow(JAN16_00_40, 'on', '1h');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, true);
    assert.equal(r.effectiveMin, 20);
    assert.equal(r.revertAtMs, JAN16_01_00);
});

/* ── BW5: 01:01 GMT (in refuse window) → refused ────────────────────── */
test('BW5: 01:01 GMT ON 1h — refused (01:00–07:00 window)', () => {
    const r = clampBoostWindow(JAN16_01_01, 'on', '1h');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'refused-window');
    assert.match(r.message, /01:00 and 07:00/);
});

/* ── BW6: 06:59 refused; 07:00 allowed ──────────────────────────────── */
test('BW6a: 06:59 GMT ON 1h — refused (still in window)', () => {
    const r = clampBoostWindow(JAN16_06_59, 'on', '1h');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'refused-window');
});
test('BW6b: 07:00 GMT ON 1h — allowed (past window boundary)', () => {
    const r = clampBoostWindow(JAN16_07_00, 'on', '1h');
    assert.equal(r.ok, true);
});

/* ── BW7: OFF window checks ──────────────────────────────────────────── */
test('BW7a: 06:59 GMT OFF 1h — refused (window applies to OFF too: Option B)', () => {
    const r = clampBoostWindow(JAN16_06_59, 'off', '1h');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'refused-window');
});
test('BW7b: 07:00 GMT OFF 1h — allowed', () => {
    const r = clampBoostWindow(JAN16_07_00, 'off', '1h');
    assert.equal(r.ok, true);
});

/* ── BW8: 23:00 GMT OFF 1h → ends 00:00Z, no clamp ─────────────────── */
test('BW8: 23:00 GMT OFF 1h — ok, not clamped, ends 00:00Z', () => {
    const r = clampBoostWindow(JAN15_23_00, 'off', '1h');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, false);
    assert.equal(r.effectiveMin, 60);
    assert.equal(r.revertAtMs, JAN15_23_00 + 60 * 60000); // 00:00Z Jan 16
});

/* ── BW9: 22:00 GMT OFF until-0700 → ends 07:00Z next day ──────────── */
test('BW9: 22:00 GMT OFF until-0700 — ok, ends 07:00Z Jan 16 (~540 min)', () => {
    const r = clampBoostWindow(JAN15_22, 'off', 'until-0700');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, false);
    assert.equal(r.requestedMin, null);
    // Next 07:00 GMT = 07:00Z Jan 16
    const expected0700 = Date.UTC(2027, 0, 16, 7, 0, 0);
    assert.equal(r.revertAtMs, expected0700);
    // 22:00→07:00 = 9h = 540 min
    assert.equal(r.effectiveMin, 540);
});

/* ── BW10: Fall-back night: 22:30Z (23:30 BST) ON 2h → clamped to 90 ─ */
test('BW10: Fall-back 2026-10-24: 22:30Z (23:30 BST) ON 2h — clamped to 90 min (ceiling = 00:00Z = first 01:00 BST)', () => {
    const r = clampBoostWindow(FB_2230, 'on', '2h');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, true);
    // 22:30Z + 2h = 00:30Z; ceiling = 00:00Z (first 01:00 BST on fall-back night)
    assert.equal(r.revertAtMs, FB_CEIL);
    // remaining = 00:00Z - 22:30Z = 90 min
    assert.equal(r.effectiveMin, 90);
});

/* ── BW11: Fall-back: 01:30Z Oct 25 (second pass) → refused ─────────── */
test('BW11: Fall-back 2026-10-25: 01:30Z (01:30 GMT, second pass) ON 1h — refused (in 01:00–07:00 window)', () => {
    const r = clampBoostWindow(FB_0130, 'on', '1h');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'refused-window');
});

/* ── BW12: Spring-forward: 00:30Z Mar 28 ON 2h → clamped to 30 min ─── */
test('BW12: Spring-forward 2027-03-28: 00:30Z ON 2h — clamped to 30 min (ceiling = 01:00Z = 02:00 BST)', () => {
    const r = clampBoostWindow(SF_0030, 'on', '2h');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, true);
    assert.equal(r.revertAtMs, SF_CEIL); // 01:00Z Mar 28
    assert.equal(r.effectiveMin, 30);
});

/* ── BW13: Spring-forward: 22:00Z Mar 27 OFF until-0700 → 06:00Z Mar 28 */
test('BW13: Spring-forward 2027-03-27: 22:00Z OFF until-0700 — ends 06:00Z Mar 28 (~480 min, next 07:00 BST = 06:00Z)', () => {
    const r = clampBoostWindow(SF_OFF_START, 'off', 'until-0700');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, false);
    // 07:00 BST on Mar 28 = 06:00Z Mar 28
    assert.equal(r.revertAtMs, SF_MORNING);
    // 22:00Z Mar 27 → 06:00Z Mar 28 = 8h = 480 min
    assert.equal(r.effectiveMin, 480);
});

/* ── BW14: invalid direction ─────────────────────────────────────────── */
test('BW14: invalid direction "both" → ok:false, code:invalid-direction', () => {
    const r = clampBoostWindow(JAN15_22, 'both', '1h');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid-direction');
});

/* ── BW15: invalid durationKey ───────────────────────────────────────── */
test('BW15: invalid durationKey "3h" → ok:false, code:invalid-duration', () => {
    const r = clampBoostWindow(JAN15_22, 'on', '3h');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid-duration');
});

/* ── BW16: 23:30 GMT ON 2h → clamped to 90 min ─────────────────────── */
test('BW16: 23:30 GMT ON 2h — clamped to 90 min (ceiling at 01:00Z next day)', () => {
    const r = clampBoostWindow(JAN15_23_30, 'on', '2h');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, true);
    // rawRevertAt = 23:30 + 2h = 01:30Z Jan 16; ceiling = 01:00Z Jan 16
    assert.equal(r.revertAtMs, JAN16_01_00);
    // remaining = 01:00Z - 23:30Z = 90 min
    assert.equal(r.effectiveMin, 90);
    assert.equal(r.requestedMin, 120);
});

/* ── BW17: OFF is never clamped by the 01:00 rule ───────────────────── */
test('BW17: 22:00 GMT OFF 2h — not clamped (OFF boosts bypass the 01:00 ceiling rule)', () => {
    const r = clampBoostWindow(JAN15_22, 'off', '2h');
    assert.equal(r.ok, true);
    assert.equal(r.clamped, false);
    assert.equal(r.effectiveMin, 120);
    assert.equal(r.revertAtMs, JAN15_22 + 120 * 60000);
});

/* ── BW18: OFF in the 01:00–07:00 window is also refused ────────────── */
test('BW18: 03:00 GMT OFF 1h — refused (01:00–07:00 window applies to OFF, design James-3 Option B)', () => {
    const t0300 = Date.UTC(2027, 0, 16, 3, 0, 0);
    const r = clampBoostWindow(t0300, 'off', '1h');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'refused-window');
});
