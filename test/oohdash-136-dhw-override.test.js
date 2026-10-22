/**
 * OOHDASH-136 — Unit tests for decodeDhwOverride and dhwOverrideOutcome (U1–U20).
 *
 * Pure-function tests: no network, no browser, no fixture data.
 * Fixed clock: 2026-10-21T18:40:00Z = epoch ms 1792608000000 (Wed 21 Oct 2026, 19:40 UK BST).
 *
 * U1  – V2 auto (on schedule)
 * U2  – V2 on-until (22:00 BST)
 * U3  – V2 off-until (06:00 BST next day)
 * U4  – V2 not-a-number (abc, 1.5, empty string)
 * U5  – V2 implausible (Spencer sentinel values 1 and -1)
 * U6  – V2 auto-ended (override ended 40 min ago, within 6 h)
 * U7  – V2 boundary: exactly 6 h → auto-ended; just over 6 h → implausible
 * U8  – V1 auto (output4Override 0)
 * U9  – V1 on-v1 (corrupt latest, valid row in history)
 * U10 – V1 off-v1 (valid negative row)
 * U11 – V1 not-reconfirmed (newest valid row 50 min old)
 * U12 – V1 hidden dhw-not-wired (mask[3] = false)
 * U13 – dual-marker: heating_scenario wins over output1OutputMask → V2
 * U14 – hide gates: separate-dhw, no separate_dhw key, version-unknown, no-reading
 * U15 – stale panel (3 h 15 min ago) → can't confirm, explanation "3 hours ago"
 * U16 – panelLastSeenMs null → can't confirm, "isn't reporting"
 * U17 – browser recompute: on-until → auto-ended when clock passes untilMs
 * U18 – time formatting: midnight, 'HH:MM tomorrow', 'on Ddd D Mmm at HH:MM', GMT midnight
 * U19 – V1 history read failed (null historyRows) → can't confirm, not-reconfirmed
 * U20 – parity: server dhwOverrideOutcome and flows.js browser twin agree on all major inputs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

// Module-level env setup before importing tb-device.js.
process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

const { decodeDhwOverride, dhwOverrideOutcome } = await import('../services/tb-device.js');

// ── Fixed clock ──────────────────────────────────────────────────────────────
const NOW = 1792608000000; // 2026-10-21T18:40:00Z

// 3 minutes before NOW — panel is fresh (well within the 60-minute stale threshold).
const FRESH_SEEN = NOW - 3 * 60000; // 1792607820000

// ── Scope helpers ────────────────────────────────────────────────────────────
const v2cs = (separateDhw) => ({ heating_scenario: { separate_dhw: separateDhw } });

/* ── U1: V2 auto ──────────────────────────────────────────────────────────── */
test('U1: V2, separate_dhw 0, DHW.override "0" → Auto (on schedule)', () => {
    const r = decodeDhwOverride(
        {},
        v2cs(0),
        FRESH_SEEN,
        { 'DHW.override': '0' },
        null,
        NOW
    );
    assert.equal(r.visible, true);
    assert.equal(r.panelVersion, 'V2');
    assert.equal(r.mode, 'auto');
    assert.equal(r.unreadableReason, null);
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'auto');
    assert.match(oc.headline, /Auto \(on schedule\)/);
    assert.match(oc.ticketSentence, /Auto \(on schedule\)/);
});

/* ── U2: V2 on-until ─────────────────────────────────────────────────────── */
test('U2: V2, DHW.override "1792616400" → Override ON until 22:00 (BST)', () => {
    // 1792616400 seconds = 2026-10-21T21:00:00Z = 22:00 UK BST
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '1792616400' }, null, NOW);
    assert.equal(r.visible, true);
    assert.equal(r.mode, 'on-until');
    assert.equal(r.untilMs, 1792616400000);
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'on-until');
    assert.match(oc.headline, /Override ON until 22:00/);
    assert.match(oc.script, /22:00/);
});

/* ── U3: V2 off-until ────────────────────────────────────────────────────── */
test('U3: V2, DHW.override "-1792645200" → Override OFF until 06:00 tomorrow (BST)', () => {
    // abs(1792645200) * 1000 = 1792645200000 = 2026-10-22T05:00:00Z = 06:00 BST Oct 22
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '-1792645200' }, null, NOW);
    assert.equal(r.visible, true);
    assert.equal(r.mode, 'off-until');
    assert.equal(r.untilMs, 1792645200000);
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'off-until');
    assert.match(oc.headline, /Override OFF until 06:00 tomorrow/);
});

/* ── U4: V2 not-a-number ─────────────────────────────────────────────────── */
test('U4a: V2, DHW.override "abc" → can\'t confirm, not-a-number', () => {
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': 'abc' }, null, NOW);
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.unreadableReason, 'not-a-number');
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'cant-confirm');
    assert.match(oc.explanation, /doesn't make sense/);
});
test('U4b: V2, DHW.override "1.5" → can\'t confirm, not-a-number', () => {
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '1.5' }, null, NOW);
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.unreadableReason, 'not-a-number');
});
test('U4c: V2, DHW.override "" → can\'t confirm, not-a-number', () => {
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '' }, null, NOW);
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.unreadableReason, 'not-a-number');
});

/* ── U5: V2 implausible (Spencer sentinel values) ────────────────────────── */
test('U5a: V2, DHW.override "1" → can\'t confirm, implausible', () => {
    // abs(1)*1000 = 1000 ms — far outside the 6 h–365 d plausibility window
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '1' }, null, NOW);
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.unreadableReason, 'implausible');
});
test('U5b: V2, DHW.override "-1" → can\'t confirm, implausible', () => {
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '-1' }, null, NOW);
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.unreadableReason, 'implausible');
});

/* ── U6: V2 auto-ended ───────────────────────────────────────────────────── */
test('U6: V2, DHW.override "1792602000" (ended 18:00 BST, 1h40m ago) → auto-ended', () => {
    // 1792602000 seconds = 2026-10-21T17:00:00Z = 18:00 BST — in the past but within 6 h
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '1792602000' }, null, NOW);
    assert.equal(r.mode, 'auto-ended');
    assert.equal(r.untilMs, 1792602000000);
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'auto-ended');
    assert.match(oc.explanation, /ended at 18:00/);
});

/* ── U7: V2 boundary — exactly 6 h inclusive ────────────────────────────── */
test('U7a: V2, ended exactly 6 h ago (1792586400) → auto-ended (boundary inclusive)', () => {
    // endMs = 1792586400000 = now - 21600000 = now - exactly 6 h
    // Check: endMs < (now - pastWindowMs) → 1792586400000 < 1792586400000 → false → passes
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '1792586400' }, null, NOW);
    assert.equal(r.mode, 'auto-ended', 'exactly 6 h ago should be auto-ended (boundary inclusive)');
});
test('U7b: V2, ended 7h47m ago (1792580000) → can\'t confirm, implausible (over 6 h)', () => {
    // 1792580000000 < 1792586400000 (= now - 6 h) → implausible
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '1792580000' }, null, NOW);
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.unreadableReason, 'implausible');
});

/* ── U8: V1 auto ─────────────────────────────────────────────────────────── */
test('U8: V1, mask [false,true,false,true], output4Override "0" → Auto (on schedule)', () => {
    const r = decodeDhwOverride(
        { output1OutputMask: [false, true, false, true] },
        {},
        FRESH_SEEN,
        { output4Override: '0' },
        null,
        NOW
    );
    assert.equal(r.visible, true);
    assert.equal(r.panelVersion, 'V1');
    assert.equal(r.mode, 'auto');
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'auto');
});

/* ── U9: V1 on-v1 with corrupt latest, valid history row ────────────────── */
test('U9: V1, latest corrupt, history row at 18:36Z valid positive → Override ON', () => {
    // Row at 18:36:00Z = NOW - 4min = 1792607760000; value 1792608660000 (~1.79e12, valid)
    const rowTs = NOW - 4 * 60000; // 1792607760000
    const r = decodeDhwOverride(
        { output1OutputMask: [false, false, false, true] },
        {},
        FRESH_SEEN,
        { output4Override: '3213428566365480600000000' }, // 25-digit corrupt latest
        [{ ts: rowTs, value: '1792608660000' }],           // valid positive history row
        NOW
    );
    assert.equal(r.visible, true);
    assert.equal(r.mode, 'on-v1');
    assert.equal(r.confirmedAtMs, rowTs);
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'on-v1');
    assert.match(oc.headline, /Override ON$/);
    assert.doesNotMatch(oc.headline, /until/);
});

/* ── U10: V1 off-v1 ─────────────────────────────────────────────────────── */
test('U10: V1, latest "-1792608540000" at row 18:34Z → Override OFF', () => {
    // Row at 18:34:00Z = NOW - 6min = 1792607640000; value is negative valid epoch ms
    const rowTs = NOW - 6 * 60000; // 1792607640000
    const r = decodeDhwOverride(
        { output1OutputMask: [false, false, false, true] },
        {},
        FRESH_SEEN,
        { output4Override: '-1792608540000' },
        [{ ts: rowTs, value: '-1792608540000' }],
        NOW
    );
    assert.equal(r.mode, 'off-v1');
    assert.equal(r.confirmedAtMs, rowTs);
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'off-v1');
    assert.match(oc.headline, /Override OFF$/);
    assert.doesNotMatch(oc.headline, /until/);
});

/* ── U11: V1 not-reconfirmed (row 50 min old > 35-min window) ──────────── */
test('U11: V1, newest valid row at 17:50Z (50 min ago) → can\'t confirm, not-reconfirmed', () => {
    const rowTs = NOW - 50 * 60000; // 1792605000000 = 17:50:00Z
    const r = decodeDhwOverride(
        { output1OutputMask: [false, false, false, true] },
        {},
        FRESH_SEEN,
        { output4Override: '1792605900000' }, // non-zero → enters history path
        [{ ts: rowTs, value: '1792605900000' }], // valid but 50 min old > 35-min confirm window
        NOW
    );
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.unreadableReason, 'not-reconfirmed');
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'cant-confirm');
    assert.match(oc.explanation, /re-confirmed/);
});

/* ── U12: V1 hidden — output 4 not wired for DHW ─────────────────────────── */
test('U12: V1, mask [false,true,true,false] → hidden, dhw-not-wired', () => {
    const r = decodeDhwOverride(
        { output1OutputMask: [false, true, true, false] },
        {},
        FRESH_SEEN,
        { output4Override: '1792608660000' },
        null,
        NOW
    );
    assert.equal(r.visible, false);
    assert.equal(r.hiddenReason, 'dhw-not-wired');
    assert.equal(dhwOverrideOutcome(r, NOW), null);
});

/* ── U13: dual-marker — heating_scenario takes precedence over output1OutputMask ─ */
test('U13: both heating_scenario (separate_dhw 0) and output1OutputMask → treated as V2, Auto', () => {
    const r = decodeDhwOverride(
        { output1OutputMask: [false, false, false, true] }, // V1 marker present
        { heating_scenario: { separate_dhw: 0 } },          // V2 marker — wins
        FRESH_SEEN,
        { 'DHW.override': '0' },
        null,
        NOW
    );
    assert.equal(r.panelVersion, 'V2');
    assert.equal(r.mode, 'auto');
});

/* ── U14: hide gates ─────────────────────────────────────────────────────── */
test('U14a: V2 separate_dhw 1 → hidden, separate-dhw', () => {
    const r = decodeDhwOverride({}, { heating_scenario: { separate_dhw: 1 } }, FRESH_SEEN, { 'DHW.override': '0' }, null, NOW);
    assert.equal(r.visible, false);
    assert.equal(r.hiddenReason, 'separate-dhw');
    assert.equal(dhwOverrideOutcome(r, NOW), null);
});
test('U14b: V2 heating_scenario with no separate_dhw key → hidden, separate-dhw', () => {
    // separate_dhw absent → undefined → !== 0 → hidden
    const r = decodeDhwOverride({}, { heating_scenario: {} }, FRESH_SEEN, { 'DHW.override': '0' }, null, NOW);
    assert.equal(r.visible, false);
    assert.equal(r.hiddenReason, 'separate-dhw');
});
test('U14c: neither heating_scenario nor output1OutputMask → hidden, version-unknown', () => {
    const r = decodeDhwOverride({}, {}, FRESH_SEEN, { 'DHW.override': '0' }, null, NOW);
    assert.equal(r.visible, false);
    assert.equal(r.hiddenReason, 'version-unknown');
});
test('U14d: V2 panel with no DHW.override key in telemetry → hidden, no-reading', () => {
    const r = decodeDhwOverride({}, { heating_scenario: { separate_dhw: 0 } }, FRESH_SEEN, {}, null, NOW);
    assert.equal(r.visible, false);
    assert.equal(r.hiddenReason, 'no-reading');
});

/* ── U15: stale panel (last seen 3 h 15 min ago) ────────────────────────── */
test('U15: panel last seen 3 h 15 min ago → can\'t confirm, explanation says "3 hours ago"', () => {
    // 15:25:00Z = NOW - (3*60 + 15)*60000 = NOW - 11700000 = 1792596300000
    const lastSeen = NOW - 11700000; // 1792596300000 = 2026-10-21T15:25:00Z
    const r = decodeDhwOverride({}, v2cs(0), lastSeen, { 'DHW.override': '0' }, null, NOW);
    assert.equal(r.visible, true);
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.unreadableReason, 'stale');
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'cant-confirm');
    // Math.round(11700000 / 3600000) = Math.round(3.25) = 3 → "3 hours ago"
    assert.match(oc.explanation, /3 hours ago/);
    assert.match(oc.ticketSentence, /3 hours ago/);
});

/* ── U16: panelLastSeenMs null ──────────────────────────────────────────── */
test('U16: panelLastSeenMs null → can\'t confirm, explanation says "isn\'t reporting"', () => {
    const r = decodeDhwOverride({}, v2cs(0), null, { 'DHW.override': '0' }, null, NOW);
    assert.equal(r.visible, true);
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.panelLastSeenMs, null);
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'cant-confirm');
    assert.match(oc.explanation, /isn't reporting/);
    assert.match(oc.ticketSentence, /isn't reporting/);
});

/* ── U17: browser recompute — on-until → auto-ended when clock passes untilMs ─ */
test('U17: ON until 22:00, re-evaluated at 22:00:01 UTC → auto-ended without refetch', () => {
    // Decode at NOW (before 22:00 UTC = 23:00 BST)
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': '1792616400' }, null, NOW);
    assert.equal(r.mode, 'on-until');
    assert.equal(r.untilMs, 1792616400000);

    // Re-evaluate 1 second after untilMs passes; panelLastSeenMs still within stale threshold
    // nowMs = 1792616401000; panelLastSeenMs = FRESH_SEEN; diff = 1792616401000 - 1792607820000 = 8581000 ms = ~143 min
    // NOTE: this exceeds 60 min stale threshold so re-apply staleness logic applies.
    // To isolate the auto-ended transition (not staleness), use a panelLastSeenMs that is still
    // fresh at 22:00:01 UTC. Use a lastSeen 5 min before untilMs = 1792616100000.
    const lateSeen = 1792616100000; // 5 min before untilMs
    const r2 = { ...r, panelLastSeenMs: lateSeen };
    const laterNow = 1792616401000; // 22:00:01 UTC = 23:00:01 BST
    const oc = dhwOverrideOutcome(r2, laterNow);
    assert.equal(oc.state, 'auto-ended');
    assert.match(oc.explanation, /ended at 22:00/);
});

/* ── U18: time formatting ────────────────────────────────────────────────── */
test('U18a: until 2026-10-21T23:00:00Z → "midnight" (00:00 BST Oct 22, tomorrow)', () => {
    // 2026-10-21T23:00:00Z = 00:00 BST Oct 22 (BST = UTC+1, BST ends Oct 25)
    // = 1792540800000 + 23*3600000 = 1792540800000 + 82800000 = 1792623600000
    const untilMs = 1792623600000;
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': String(untilMs / 1000) }, null, NOW);
    assert.equal(r.mode, 'on-until');
    const oc = dhwOverrideOutcome(r, NOW);
    assert.match(oc.headline, /until midnight$/);
});
test('U18b: until 2026-10-24T22:00:00Z → "on Sat 24 Oct at 23:00" (23:00 BST, a later day)', () => {
    // 2026-10-24T00:00:00Z = 1792540800000 + 3*86400000 = 1792800000000
    // 2026-10-24T22:00:00Z = 1792800000000 + 22*3600000 = 1792879200000; BST +1 → 23:00 BST
    const untilMs = 1792879200000;
    const r = decodeDhwOverride({}, v2cs(0), FRESH_SEEN, { 'DHW.override': String(untilMs / 1000) }, null, NOW);
    assert.equal(r.mode, 'on-until');
    const oc = dhwOverrideOutcome(r, NOW);
    assert.match(oc.headline, /on Sat 24 Oct at 23:00/);
});
test('U18c: GMT context — until 2026-10-28T00:00:00Z → "midnight" (midnight GMT, tomorrow)', () => {
    // BST ends 2026-10-25. nowMs = 2026-10-27T18:40:00Z (GMT).
    // 2026-10-27T18:40:00Z = 1792608000000 + 6*86400000 = 1793126400000
    // 2026-10-28T00:00:00Z = 1793126400000 + 5*3600000 + 20*60000 = 1793126400000 + 19200000 = 1793145600000
    const gmtNow = 1793126400000; // 2026-10-27T18:40:00Z (GMT)
    const untilMs = 1793145600000; // 2026-10-28T00:00:00Z (midnight GMT Oct 28 = tomorrow)
    const lastSeen = gmtNow - 5 * 60000; // 5 min ago, fresh
    const r = decodeDhwOverride({}, v2cs(0), lastSeen, { 'DHW.override': String(untilMs / 1000) }, null, gmtNow);
    assert.equal(r.mode, 'on-until');
    const oc = dhwOverrideOutcome(r, gmtNow);
    assert.match(oc.headline, /until midnight$/);
});

/* ── U19: V1 history read failed → can't confirm, site still loads ─────── */
test('U19: V1 history read fails (null historyRows) → can\'t confirm, not-reconfirmed; no throw', () => {
    const r = decodeDhwOverride(
        { output1OutputMask: [false, false, false, true] },
        {},
        FRESH_SEEN,
        { output4Override: '1792608660000' }, // non-zero, would enter history path
        null, // null simulates a failed history read
        NOW
    );
    assert.equal(r.visible, true);
    assert.equal(r.mode, 'cant-confirm');
    assert.equal(r.unreadableReason, 'not-reconfirmed');
    // The outcome function must not throw
    const oc = dhwOverrideOutcome(r, NOW);
    assert.equal(oc.state, 'cant-confirm');
});

/* ── U20: parity — server twin and flows.js browser twin agree ──────────── */
test('U20: dhwOverrideOutcome in tb-device.js and flows.js browser twin return identical state, headline and ticketSentence for all major inputs', () => {
    // Load the flows.js browser twin via vm (same approach as area-representative.test.js).
    const sandbox = {
        state: { workspace: { devices: [] } },
        $: () => ({}),
        esc: s => String(s),
        openControl: () => {},
        flowStep: () => {},
        render: () => {},
        startFlow: () => {},
        console
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    const src = readFileSync(new URL('../public/js/flows.js', import.meta.url), 'utf8')
        + '\n;globalThis.dhwOverrideOutcome = dhwOverrideOutcome;';
    vm.runInContext(src, ctx, { filename: 'flows.js' });
    const browserOutcome = ctx.dhwOverrideOutcome;

    // Representative dhwOverride objects covering every path through dhwOverrideOutcome.
    const recentSeen = FRESH_SEEN;
    const staleSeen = NOW - 11700000; // 3 h 15 min ago (> 60-min stale threshold)
    const cases = [
        // auto
        { visible: true, panelVersion: 'V2', mode: 'auto', untilMs: null, confirmedAtMs: null, panelLastSeenMs: recentSeen, unreadableReason: null, decodedAtMs: NOW },
        // auto-ended
        { visible: true, panelVersion: 'V2', mode: 'auto-ended', untilMs: 1792602000000, confirmedAtMs: null, panelLastSeenMs: recentSeen, unreadableReason: null, decodedAtMs: NOW },
        // on-until
        { visible: true, panelVersion: 'V2', mode: 'on-until', untilMs: 1792616400000, confirmedAtMs: null, panelLastSeenMs: recentSeen, unreadableReason: null, decodedAtMs: NOW },
        // off-until
        { visible: true, panelVersion: 'V2', mode: 'off-until', untilMs: 1792645200000, confirmedAtMs: null, panelLastSeenMs: recentSeen, unreadableReason: null, decodedAtMs: NOW },
        // on-v1 (confirmedAtMs within 35-min confirm window)
        { visible: true, panelVersion: 'V1', mode: 'on-v1', untilMs: null, confirmedAtMs: recentSeen, panelLastSeenMs: recentSeen, unreadableReason: null, decodedAtMs: NOW },
        // off-v1
        { visible: true, panelVersion: 'V1', mode: 'off-v1', untilMs: null, confirmedAtMs: recentSeen, panelLastSeenMs: recentSeen, unreadableReason: null, decodedAtMs: NOW },
        // cant-confirm: re-applied staleness (panelLastSeenMs > 60 min ago)
        { visible: true, panelVersion: 'V2', mode: 'auto', untilMs: null, confirmedAtMs: null, panelLastSeenMs: staleSeen, unreadableReason: null, decodedAtMs: NOW },
        // cant-confirm: not-reconfirmed (stored in the object)
        { visible: true, panelVersion: 'V1', mode: 'cant-confirm', untilMs: null, confirmedAtMs: null, panelLastSeenMs: recentSeen, unreadableReason: 'not-reconfirmed', decodedAtMs: NOW },
        // cant-confirm: not-a-number
        { visible: true, panelVersion: 'V2', mode: 'cant-confirm', untilMs: null, confirmedAtMs: null, panelLastSeenMs: recentSeen, unreadableReason: 'not-a-number', decodedAtMs: NOW },
        // cant-confirm: implausible
        { visible: true, panelVersion: 'V2', mode: 'cant-confirm', untilMs: null, confirmedAtMs: null, panelLastSeenMs: recentSeen, unreadableReason: 'implausible', decodedAtMs: NOW },
        // null panelLastSeenMs (re-applied staleness → "isn't reporting")
        { visible: true, panelVersion: 'V2', mode: 'auto', untilMs: null, confirmedAtMs: null, panelLastSeenMs: null, unreadableReason: null, decodedAtMs: NOW },
    ];

    for (const dhwOv of cases) {
        const serverResult = dhwOverrideOutcome(dhwOv, NOW);
        const browserResult = browserOutcome(dhwOv, NOW);
        const label = `mode=${dhwOv.mode} unreadableReason=${dhwOv.unreadableReason} panelLastSeenMs=${dhwOv.panelLastSeenMs}`;
        if (serverResult === null) {
            assert.equal(browserResult, null, `${label}: both should be null`);
        } else {
            assert.equal(browserResult.state, serverResult.state, `${label}: state`);
            assert.equal(browserResult.headline, serverResult.headline, `${label}: headline`);
            assert.equal(browserResult.ticketSentence, serverResult.ticketSentence, `${label}: ticketSentence`);
        }
    }
});
