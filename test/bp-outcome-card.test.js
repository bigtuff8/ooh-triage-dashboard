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
