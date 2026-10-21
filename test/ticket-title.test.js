/**
 * OOHDASH-137 — ticket title module unit tests (T1-T20).
 *
 * Tests every rule in services/ticket-title.js: normalisation, cleaning, joining,
 * no-double, cap, fallbacks, idempotency. No network. No imports other than the
 * module under test. Runs under `npm run test:unit`.
 *
 * Deviation from build plan: T4 expected output is "[OOH] 1110 - General issue captured"
 * not "[OOH] General issue captured". The plan description says "stand-in normaliseSiteNo
 * = null" but per the normaliseSiteNo spec the regex /^(?:[A-Za-z]{1,5}[-_ ]?)?(\d{3,6})$/
 * matches "md-1110" and returns "1110". The stand-in check lives in cleanSiteName, which
 * returns null for "md-1110" (matches /^[A-Za-z]{1,5}[-_]\d{3,6}$/). The site part is
 * therefore "1110" (digits with no name), not empty. This is the correct behaviour per
 * the spec; the plan description contained an error in the expected output for T4.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOohTitle, normaliseSiteNo, cleanSiteName } from '../services/ticket-title.js';

/* ── T1: normal case ──────────────────────────────────────────────────────── */
test('T1: normal case — site number, full name and outcome', () => {
    const out = buildOohTitle({
        siteNo: '6261',
        siteName: 'Wheatstone Inn (Gloucester)',
        outcome: 'General issue captured'
    });
    assert.equal(out, '[OOH] 6261 Wheatstone Inn (Gloucester) - General issue captured');

    // Additional: a 90-character siteName is cut to 60 characters (57 + "...")
    const longName = 'A'.repeat(90);
    const out2 = buildOohTitle({ siteNo: '6261', siteName: longName, outcome: 'General issue captured' });
    assert.ok(out2.startsWith('[OOH] 6261 '), 'site prefix present with long name');
    assert.ok(out2.includes('A'.repeat(57) + '...'), 'long name cut at 57+...');
    assert.ok(!out2.includes('A'.repeat(58)), 'name not longer than 60 chars in title');
});

/* ── T2: null siteName ───────────────────────────────────────────────────── */
test('T2: null siteName falls back to number-only prefix; long dashes in outcome are kept', () => {
    // Long dash (em dash U+2014): control chars are 0x00-0x1F and 0x7F; em dash is 0x2014 -- kept.
    const em = '—';
    const out = buildOohTitle({ siteNo: '6261', siteName: null, outcome: `Setpoint lower ${em}${em} sent` });
    assert.equal(out, `[OOH] 6261 - Setpoint lower ${em}${em} sent`);
});

/* ── T3: brand-prefix siteNo "gk-6261" ──────────────────────────────────── */
test('T3: gk-prefix siteNo is normalised to digits', () => {
    const out = buildOohTitle({
        siteNo: 'gk-6261',
        siteName: 'Wheatstone Inn (Gloucester)',
        outcome: 'General issue captured'
    });
    assert.equal(out, '[OOH] 6261 Wheatstone Inn (Gloucester) - General issue captured');
});

/* ── T4: stand-in siteNo and stand-in siteName ────────────────────────────
   normaliseSiteNo("md-1110") = "1110" (regex matches).
   cleanSiteName("md-1110", "1110") = null (stand-in pattern).
   sitePart = "1110". Result: "[OOH] 1110 - General issue captured".
   (Plan description had "[OOH] General issue captured" — that was an error;
    see file-level deviation note.)
   ─────────────────────────────────────────────────────────────────────────── */
test('T4: stand-in siteName is rejected; stand-in-format siteNo extracts digits', () => {
    const out = buildOohTitle({ siteNo: 'md-1110', siteName: 'md-1110', outcome: 'General issue captured' });
    assert.equal(out, '[OOH] 1110 - General issue captured');
    // Verify sub-steps
    assert.equal(normaliseSiteNo('md-1110'), '1110', 'normaliseSiteNo extracts digits from md-prefix form');
    assert.equal(cleanSiteName('md-1110', '1110'), null, 'cleanSiteName rejects stand-in siteName');
});

/* ── T5: siteName equals the site number ─────────────────────────────────── */
test('T5: siteName equal to bare siteNo digits is treated as missing', () => {
    const out = buildOohTitle({ siteNo: '6261', siteName: '6261', outcome: 'General issue captured' });
    assert.equal(out, '[OOH] 6261 - General issue captured');
});

/* ── T6: siteName starts with the site number ───────────────────────────── */
test('T6: leading siteNo digits stripped from siteName', () => {
    const out = buildOohTitle({ siteNo: '6261', siteName: '6261 Wheatstone Inn', outcome: 'General issue captured' });
    assert.equal(out, '[OOH] 6261 Wheatstone Inn - General issue captured');
});

/* ── T7: control characters and multiple spaces in siteName ─────────────── */
test('T7: siteName with line breaks and double spaces collapses to single spaces', () => {
    const out = buildOohTitle({
        siteNo: '6261',
        siteName: 'Wheatstone\tInn\n  (Gloucester)',
        outcome: 'General issue captured'
    });
    // tab and \n replaced with space, double space collapsed
    assert.equal(out, '[OOH] 6261 Wheatstone Inn (Gloucester) - General issue captured');
});

/* ── T8: underscore-separated siteNo "gk_7639" ───────────────────────────── */
test('T8: underscore-separated siteNo gk_7639 is normalised to 7639', () => {
    assert.equal(normaliseSiteNo('gk_7639'), '7639');
    const out = buildOohTitle({ siteNo: 'gk_7639', siteName: 'Black Bull (Corbridge)', outcome: 'General issue' });
    assert.ok(out.startsWith('[OOH] 7639 Black Bull (Corbridge)'));
});

/* ── T9: upper-case prefix "GK-7639" ─────────────────────────────────────── */
test('T9: upper-case brand prefix GK-7639 is normalised to 7639', () => {
    assert.equal(normaliseSiteNo('GK-7639'), '7639');
    const out = buildOohTitle({ siteNo: 'GK-7639', siteName: 'Black Bull (Corbridge)', outcome: 'General issue' });
    assert.ok(out.startsWith('[OOH] 7639 Black Bull'));
});

/* ── T10: space-padded siteNo " 7639 " ──────────────────────────────────── */
test('T10: space-padded siteNo is normalised to bare digits', () => {
    assert.equal(normaliseSiteNo(' 7639 '), '7639');
    const out = buildOohTitle({ siteNo: ' 7639 ', siteName: 'Black Bull (Corbridge)', outcome: 'General issue' });
    assert.ok(out.startsWith('[OOH] 7639 Black Bull'));
});

/* ── T11: null siteNo ────────────────────────────────────────────────────── */
test('T11: null siteNo produces empty site part; siteName is unused', () => {
    const out = buildOohTitle({ siteNo: null, siteName: 'Wheatstone Inn', outcome: 'General issue captured' });
    assert.equal(out, '[OOH] General issue captured');
    assert.ok(!out.includes('Wheatstone'), 'siteName ignored when siteNo is null');
});

/* ── T12: empty string siteNo ────────────────────────────────────────────── */
test('T12: empty string siteNo behaves the same as null', () => {
    const out = buildOohTitle({ siteNo: '', siteName: 'Wheatstone Inn', outcome: 'General issue captured' });
    assert.equal(out, '[OOH] General issue captured');
});

/* ── T13: "unknown" siteNo ───────────────────────────────────────────────── */
test('T13: siteNo "unknown" (any case) is treated as null', () => {
    assert.equal(normaliseSiteNo('unknown'), null);
    assert.equal(normaliseSiteNo('UNKNOWN'), null);
    const out = buildOohTitle({ siteNo: 'unknown', siteName: 'Wheatstone Inn', outcome: 'General issue captured' });
    assert.equal(out, '[OOH] General issue captured');
});

/* ── T14: null siteNo, null siteName, outcome "OOH query" ───────────────── */
test('T14: null siteNo + null siteName + "OOH query" outcome', () => {
    const out = buildOohTitle({ siteNo: null, siteName: null, outcome: 'OOH query' });
    assert.equal(out, '[OOH] OOH query');
});

/* ── T15: outcome starts with different digits ───────────────────────────── */
test('T15: outcome starting with different site digits does NOT trigger no-double', () => {
    const out = buildOohTitle({ siteNo: '6261', siteName: 'Wheatstone Inn (Gloucester)', outcome: '6202 Horse & Groom' });
    assert.ok(out.startsWith('[OOH] 6261 Wheatstone Inn (Gloucester) - 6202 Horse & Groom'),
        `no-double must not fire for different digits; got: ${out}`);
});

/* ── T16: outcome starts with siteNo digits → no-double fires ───────────── */
test('T16: outcome starting with siteNo digits triggers no-double; site part dropped', () => {
    const out = buildOohTitle({ siteNo: '6261', siteName: 'Wheatstone Inn (Gloucester)', outcome: '6261 Wheatstone has heating issue' });
    // Site part dropped; outcome kept intact
    assert.equal(out, '[OOH] 6261 Wheatstone has heating issue');
    assert.ok(!out.startsWith('[OOH] 6261 Wheatstone Inn'), 'site part with siteName is dropped');
});

/* ── T17: siteNo digits appear mid-outcome (not at start) ───────────────── */
test('T17: siteNo digits appearing mid-outcome do NOT trigger no-double', () => {
    // Device ID "IT700E6261FB" contains "6261" but is not at the start
    const out = buildOohTitle({ siteNo: '6261', siteName: 'Wheatstone Inn (Gloucester)', outcome: 'Device IT700E6261FB offline' });
    assert.ok(out.startsWith('[OOH] 6261 Wheatstone Inn (Gloucester) - Device IT700E6261FB offline'),
        `no-double must not fire for mid-string match; got: ${out}`);
});

/* ── T18: outcome already has "[OOH] " prefix; idempotency ─────────────── */
test('T18: strips one leading [OOH] prefix; buildOohTitle is idempotent on its own output', () => {
    const base = buildOohTitle({ siteNo: '6261', siteName: 'Wheatstone Inn (Gloucester)', outcome: 'General issue captured' });
    // Passing result back as outcome gives the same string
    const second = buildOohTitle({ siteNo: '6261', siteName: 'Wheatstone Inn (Gloucester)', outcome: base });
    assert.equal(second, base, 'idempotent: second call equals first');

    // Direct [OOH] prefix in outcome is also stripped
    const direct = buildOohTitle({ siteNo: '6261', siteName: 'Wheatstone Inn (Gloucester)', outcome: '[OOH] General issue captured' });
    assert.equal(direct, base, 'explicit [OOH] prefix in outcome is stripped to same result');
});

/* ── T19: 300-char outcome — result capped at exactly 150 chars ──────────── */
test('T19: 300-char outcome is capped to exactly 150 chars ending "..."; site part is whole', () => {
    const longOutcome = 'X'.repeat(300);
    const out = buildOohTitle({ siteNo: '6261', siteName: 'Wheatstone Inn (Gloucester)', outcome: longOutcome });
    assert.equal(out.length, 150, `result must be exactly 150 chars, got ${out.length}`);
    assert.ok(out.endsWith('...'), 'result ends with ...');
    // Site part must be whole: "[OOH] 6261 Wheatstone Inn (Gloucester) - "
    assert.ok(out.startsWith('[OOH] 6261 Wheatstone Inn (Gloucester) - '), 'site part not cut');
});

/* ── T20: null and undefined outcome ─────────────────────────────────────── */
test('T20: null and undefined outcome both become "OOH outcome"', () => {
    const outNull = buildOohTitle({ siteNo: '6261', siteName: 'Wheatstone Inn (Gloucester)', outcome: null });
    const outUndef = buildOohTitle({ siteNo: '6261', siteName: 'Wheatstone Inn (Gloucester)', outcome: undefined });
    assert.equal(outNull, '[OOH] 6261 Wheatstone Inn (Gloucester) - OOH outcome');
    assert.equal(outUndef, '[OOH] 6261 Wheatstone Inn (Gloucester) - OOH outcome');
    assert.ok(!outNull.includes('undefined'), 'literal "undefined" must not appear');
    assert.ok(!outUndef.includes('undefined'), 'literal "undefined" must not appear');
});
