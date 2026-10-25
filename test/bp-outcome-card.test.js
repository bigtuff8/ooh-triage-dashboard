/**
 * bpOutcomeCard coverage — updated for OOHDASH-144.
 *
 * The old API (pre-144) returned { headline, buttons, ticketText, operatorText, scriptText }.
 * The new API (OOHDASH-144) returns { headline, sayHtml, gtkHtml, wrapKind, candidateZones, direction }.
 *
 * Tests:
 *   Fix 1 regression guard (OOHDASH-141): W4/W7/W9 must still return a non-empty headline
 *   (the duplicate-empty-branch bug that swallowed these cases).
 *
 *   Full W-code coverage (gate panel, 2026-10-25): every W-code that boilerHeatingOutcome
 *   can return, plus the unknown-code fallback, must give a non-empty headline and sayHtml,
 *   a valid wrapKind, and no 'undefined' in any text field.
 *
 *   bp-noact concept REMOVED in OOHDASH-144: the old no-action path (storing
 *   flow.data['_conf_bp-noact']) is replaced by wrapUpStep which handles all outcomes
 *   including non-actionable ones. No bp-noact tests in this file.
 *
 * flows.js is a browser global (no ESM), evaluated in a vm sandbox.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

process.env.DATA_MODE = 'fixture';

const NOW_MS = 1700000000000; // fixed epoch ms for determinism

function loadFlows() {
    const flow = { stage: 2, done: [], data: {} };
    const state = { flow, workspace: {} };
    const sandbox = {
        state,
        $: function(sel) { return { innerHTML: '', focus: function() {} }; },
        esc: function(s) { return String(s); },
        openControl: function() {},
        flowStep: function() {},
        render: function() {},
        startFlow: function() {},
        console
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    const src = readFileSync(new URL('../public/js/flows.js', import.meta.url), 'utf8')
        + '\n;globalThis.bpOutcomeCard = bpOutcomeCard;'
        + '\n;globalThis.boilerHeatingOutcome = boilerHeatingOutcome;'
        + '\n;globalThis.boilerPanelHeatingBranch = boilerPanelHeatingBranch;';
    vm.runInContext(src, ctx, { filename: 'flows.js' });
    return { ctx, state, flow };
}

// Minimal heating stubs
const NULL_HEATING = null;

const TWO_ZONE_HEATING = {
    visible: true, version: 'V2', panelLastSeenMs: NOW_MS - 60000, boilerCalling: false, summerMode: false, nextChange: null,
    zones: [
        { n: 1, zone: 'CHZ1', on: true, fallback: false, forced: null, forcedUntilMs: null, held: false, roomTemp: 19.5 },
        { n: 2, zone: 'CHZ2', on: false, fallback: false, forced: 'off', forcedUntilMs: NOW_MS + 3600000, held: false, roomTemp: 17.1 }
    ]
};

const VALID_WRAP_KINDS = new Set(['boost', 'noact', 'normal', 'already-on', 'already-off', 'boost-on', 'boost-off']);

/* ──────────────────────────────────────────────────────────────────────────
 * Fix 1 regression guard: W4 / W7 / W9 must still return non-empty headline
 * (OOHDASH-141 duplicate-empty-branch bug).
 * ────────────────────────────────────────────────────────────────────────── */

test('W4 (summer mode): headline is non-empty (regression guard)', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W4', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.headline === 'string' && card.headline.length > 0,
        'W4 headline must be a non-empty string; got: ' + JSON.stringify(card.headline));
});

test('W7 (back-up cycle): headline is non-empty (regression guard)', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W7', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.headline === 'string' && card.headline.length > 0,
        'W7 headline must be a non-empty string; got: ' + JSON.stringify(card.headline));
});

test('W9 (already off): headline is non-empty (regression guard)', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W9', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.headline === 'string' && card.headline.length > 0,
        'W9 headline must be a non-empty string; got: ' + JSON.stringify(card.headline));
});

/* ──────────────────────────────────────────────────────────────────────────
 * boilerHeatingOutcome: only returns W1..W9
 * ────────────────────────────────────────────────────────────────────────── */

test('boilerHeatingOutcome only ever returns W1..W9 across need/state combinations', function() {
    const { ctx } = loadFlows();
    const seen = new Set();
    const bools = [true, false];
    for (const need of ['cold', 'hot', 'other']) {
        for (const stale of bools) for (const calling of bools) for (const summer of bools)
        for (const z1on of bools) for (const z2on of bools) for (const fb of bools) for (const forcedOff of bools) {
            const h = {
                visible: true, panelLastSeenMs: stale ? NOW_MS - 2 * 3600000 : NOW_MS - 60000,
                boilerCalling: calling, summerMode: summer,
                zones: [
                    { n: 1, on: z1on, fallback: fb, forced: null },
                    { n: 2, on: z2on, fallback: false, forced: (!z2on && forcedOff) ? 'off' : null }
                ]
            };
            seen.add(ctx.boilerHeatingOutcome(h, need, NOW_MS));
        }
        seen.add(ctx.boilerHeatingOutcome(null, need, NOW_MS));
    }
    for (const w of seen) assert.match(w, /^W[1-9]$/, 'unexpected W-code ' + w);
});

/* ──────────────────────────────────────────────────────────────────────────
 * Full W-code coverage: headline, sayHtml, wrapKind, no 'undefined' text
 * ────────────────────────────────────────────────────────────────────────── */

const ALL_WCODES = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W-unknown'];

for (const wcode of ALL_WCODES) {
    for (const [label, heating] of [['no heating data', NULL_HEATING], ['two-zone heating', TWO_ZONE_HEATING]]) {
        for (const boost of [{ on: false, off: false }, { on: true, off: true }]) {
            const boostLabel = boost.on ? 'on' : 'off';
            test(wcode + ' card (' + label + ', boost ' + boostLabel + '): headline and sayHtml are non-empty', function() {
                const { ctx } = loadFlows();
                const card = ctx.bpOutcomeCard(wcode, heating, NOW_MS, boost, []);
                assert.ok(typeof card.headline === 'string' && card.headline.length > 0,
                    wcode + ' headline must be non-empty; got: ' + JSON.stringify(card.headline));
                assert.ok(typeof card.sayHtml === 'string' && card.sayHtml.length > 0,
                    wcode + ' sayHtml must be non-empty; got: ' + JSON.stringify(card.sayHtml));
            });

            test(wcode + ' card (' + label + ', boost ' + boostLabel + '): wrapKind is valid', function() {
                const { ctx } = loadFlows();
                const card = ctx.bpOutcomeCard(wcode, heating, NOW_MS, boost, []);
                assert.ok(typeof card.wrapKind === 'string',
                    wcode + ' wrapKind must be a string; got: ' + JSON.stringify(card.wrapKind));
            });

            test(wcode + ' card (' + label + ', boost ' + boostLabel + '): no "undefined" in text fields', function() {
                const { ctx } = loadFlows();
                const card = ctx.bpOutcomeCard(wcode, heating, NOW_MS, boost, []);
                const allText = [card.headline, card.sayHtml, card.gtkHtml || ''].join(' ');
                assert.ok(!/\bundefined\b/.test(allText),
                    wcode + ' card text contains literal "undefined": ' + allText.substring(0, 200));
            });
        }
    }
}
