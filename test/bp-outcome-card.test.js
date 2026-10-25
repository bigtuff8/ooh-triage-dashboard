/**
 * v1.5.4 hotfix — bpOutcomeCard W4/W7/W9 and bp-noact detail.
 *
 * Fix 1 (OOHDASH-141 duplicate-empty-branch bug): bpOutcomeCard returned undefined
 * headline/buttons for W4 (summer mode), W7 (back-up cycle) and W9 (already off)
 * because the first duplicate empty branch swallowed each case.
 *
 * Fix 2 (bp-noact 400 error): outcomeNoAction was called with detail:'', causing the
 * API to reject it with 400. The fix derives detail from the current card's ticketText.
 *
 * flows.js is a browser global (no ESM), evaluated in a vm sandbox — mirrors the
 * pattern in area-representative.test.js and dark-fleet-heating.test.js.
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
        $: (sel) => ({ innerHTML: '', focus() {} }),
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
        + '\n;globalThis.boilerPanelHeatingBranch = boilerPanelHeatingBranch;';
    vm.runInContext(src, ctx, { filename: 'flows.js' });
    return { ctx, state, flow };
}

// Minimal heating stub: null zones, no stale flag.
// bpOutcomeCard handles heating=null for all W-codes (zones defaults to []).
const NULL_HEATING = null;

/* ──────────────────────────────────────────────────────────────────────────
 * Fix 1: W4 / W7 / W9 outcome cards
 * ────────────────────────────────────────────────────────────────────────── */

test('W4 (summer mode): headline is non-empty', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W4', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.headline === 'string' && card.headline.length > 0,
        'W4 headline must be a non-empty string; got: ' + JSON.stringify(card.headline));
});

test('W4 (summer mode): buttons contains at least one <button', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W4', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.buttons === 'string' && card.buttons.includes('<button'),
        'W4 buttons must contain <button; got: ' + JSON.stringify(card.buttons));
});

test('W4 (summer mode): ticketText is non-empty', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W4', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.ticketText === 'string' && card.ticketText.length > 0,
        'W4 ticketText must be non-empty');
});

test('W7 (back-up cycle): headline is non-empty', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W7', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.headline === 'string' && card.headline.length > 0,
        'W7 headline must be a non-empty string; got: ' + JSON.stringify(card.headline));
});

test('W7 (back-up cycle): buttons contains at least one <button', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W7', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.buttons === 'string' && card.buttons.includes('<button'),
        'W7 buttons must contain <button; got: ' + JSON.stringify(card.buttons));
});

test('W7 (back-up cycle): ticketText is non-empty', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W7', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.ticketText === 'string' && card.ticketText.length > 0,
        'W7 ticketText must be non-empty');
});

test('W9 (already off): headline is non-empty', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W9', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.headline === 'string' && card.headline.length > 0,
        'W9 headline must be a non-empty string; got: ' + JSON.stringify(card.headline));
});

test('W9 (already off): buttons contains at least one <button', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W9', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.buttons === 'string' && card.buttons.includes('<button'),
        'W9 buttons must contain <button; got: ' + JSON.stringify(card.buttons));
});

test('W9 (already off): ticketText is non-empty', function() {
    const { ctx } = loadFlows();
    var card = ctx.bpOutcomeCard('W9', NULL_HEATING, NOW_MS);
    assert.ok(typeof card.ticketText === 'string' && card.ticketText.length > 0,
        'W9 ticketText must be non-empty');
});

/* ──────────────────────────────────────────────────────────────────────────
 * Fix 2: bp-noact uses a non-empty detail derived from the current card
 *
 * When need==='bp-noact', boilerPanelHeatingBranch now computes:
 *   var cardN = bpOutcomeCard(f.data.bpWcode || 'W1', heating, nowMs);
 *   outcomeNoAction(f, 'bp-noact', { ..., detail: cardN.ticketText, ... });
 *
 * finishOutcome (the browser confirm-step renderer) stores the payload under
 * f.data['_conf_bp-noact'] on first call. We assert that stored detail is
 * non-empty — proving the API will receive a valid detail string.
 * ────────────────────────────────────────────────────────────────────────── */

test('bp-noact (default W1): stored outcome detail is non-empty', function() {
    const { ctx, flow } = loadFlows();
    // Minimal workspace: no heating data (falls back to null, which is fine for W1).
    var ws = { boilerControl: null, boostAvailable: { on: false, off: false }, site: { siteNo: '0000' } };
    flow.data = { need: 'bp-noact', bpWcode: 'W1' };
    flow.stage = 2;
    ctx.boilerPanelHeatingBranch(ws, flow, {}, ws.site);
    var stored = flow.data['_conf_bp-noact'];
    assert.ok(stored, 'finishOutcome must have stored the outcome payload');
    assert.ok(typeof stored.detail === 'string' && stored.detail.length > 0,
        'bp-noact detail must be non-empty; got: ' + JSON.stringify(stored.detail));
});

test('bp-noact (W4 — summer mode): stored outcome detail is non-empty', function() {
    const { ctx, flow } = loadFlows();
    var ws = { boilerControl: null, boostAvailable: { on: false, off: false }, site: { siteNo: '0000' } };
    flow.data = { need: 'bp-noact', bpWcode: 'W4' };
    flow.stage = 2;
    ctx.boilerPanelHeatingBranch(ws, flow, {}, ws.site);
    var stored = flow.data['_conf_bp-noact'];
    assert.ok(stored, 'finishOutcome must have stored the outcome payload for W4');
    assert.ok(typeof stored.detail === 'string' && stored.detail.length > 0,
        'bp-noact W4 detail must be non-empty; got: ' + JSON.stringify(stored.detail));
});

test('bp-noact (W7 — back-up cycle): stored outcome detail is non-empty', function() {
    const { ctx, flow } = loadFlows();
    var ws = { boilerControl: null, boostAvailable: { on: false, off: false }, site: { siteNo: '0000' } };
    flow.data = { need: 'bp-noact', bpWcode: 'W7' };
    flow.stage = 2;
    ctx.boilerPanelHeatingBranch(ws, flow, {}, ws.site);
    var stored = flow.data['_conf_bp-noact'];
    assert.ok(stored, 'finishOutcome must have stored the outcome payload for W7');
    assert.ok(typeof stored.detail === 'string' && stored.detail.length > 0,
        'bp-noact W7 detail must be non-empty; got: ' + JSON.stringify(stored.detail));
});

test('bp-noact (W9 — already off): stored outcome detail is non-empty', function() {
    const { ctx, flow } = loadFlows();
    var ws = { boilerControl: null, boostAvailable: { on: false, off: false }, site: { siteNo: '0000' } };
    flow.data = { need: 'bp-noact', bpWcode: 'W9' };
    flow.stage = 2;
    ctx.boilerPanelHeatingBranch(ws, flow, {}, ws.site);
    var stored = flow.data['_conf_bp-noact'];
    assert.ok(stored, 'finishOutcome must have stored the outcome payload for W9');
    assert.ok(typeof stored.detail === 'string' && stored.detail.length > 0,
        'bp-noact W9 detail must be non-empty; got: ' + JSON.stringify(stored.detail));
});

/* ──────────────────────────────────────────────────────────────────────────
 * Full coverage (gate panel, 2026-10-25): every W-code that boilerHeatingOutcome
 * can return, plus the unknown-code fallback, must give a non-empty headline,
 * ticketText and at least one button, and bp-noact must store a non-empty detail.
 * ────────────────────────────────────────────────────────────────────────── */

const ALL_WCODES = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W-unknown'];
const TWO_ZONE_HEATING = {
    visible: true, version: 'V2', panelLastSeenMs: NOW_MS - 60000, boilerCalling: false, summerMode: false, nextChange: null,
    zones: [
        { n: 1, zone: 'CHZ1', on: true, fallback: false, forced: null, forcedUntilMs: null, held: false, roomTemp: 19.5 },
        { n: 2, zone: 'CHZ2', on: false, fallback: false, forced: 'off', forcedUntilMs: NOW_MS + 3600000, held: false, roomTemp: 17.1 }
    ]
};

test('boilerHeatingOutcome only ever returns W1..W9 across need/state combinations', function() {
    const { ctx } = loadFlows();
    vm.runInContext(';globalThis.boilerHeatingOutcome = boilerHeatingOutcome;',
        ctx);
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

for (const wcode of ALL_WCODES) {
    for (const [label, heating] of [['no heating data', NULL_HEATING], ['two-zone heating', TWO_ZONE_HEATING]]) {
        for (const boost of [{ on: false, off: false }, { on: true, off: true }]) {
            test(wcode + ' card (' + label + ', boost ' + (boost.on ? 'on' : 'off') + '): headline, ticketText and a button are present', function() {
                const { ctx } = loadFlows();
                const card = ctx.bpOutcomeCard(wcode, heating, NOW_MS, boost);
                assert.ok(typeof card.headline === 'string' && card.headline.length > 0, 'headline empty');
                assert.ok(typeof card.ticketText === 'string' && card.ticketText.length > 0, 'ticketText empty');
                assert.ok(typeof card.buttons === 'string' && card.buttons.indexOf('<button') >= 0, 'no button');
                assert.ok(!/undefined/.test(card.headline + card.operatorText + card.scriptText + card.ticketText), 'card text contains "undefined"');
            });
        }
    }
    test('bp-noact (' + wcode + '): stored outcome detail is non-empty', function() {
        const { ctx, flow } = loadFlows();
        var ws = { boilerControl: { heating: TWO_ZONE_HEATING }, boostAvailable: { on: true, off: true }, site: { siteNo: '0000' } };
        flow.data = { need: 'bp-noact', bpWcode: wcode };
        flow.stage = 2;
        ctx.boilerPanelHeatingBranch(ws, flow, {}, ws.site);
        var stored = flow.data['_conf_bp-noact'];
        assert.ok(stored && typeof stored.detail === 'string' && stored.detail.length > 0,
            'bp-noact ' + wcode + ' detail must be non-empty; got: ' + JSON.stringify(stored && stored.detail));
    });
}
