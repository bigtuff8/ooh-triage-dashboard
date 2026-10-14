/**
 * OOHDASH-128 — client-side flow tests for legacy bare-salus screen copy (C1-C8).
 *
 * Proves:
 *   C1  step 0 with mixed workspace: area chips for Accommodation and Bar/Restaurant; NO area-unmapped
 *       button (D3 — unplaced z-1 excluded from fallback); heating-unplaced-note present.
 *   C2  choose Accommodation: "the only reporting zone" reading line; area-not-reporting-note present.
 *   C3  choose Bar/Restaurant: reco-dark-fleet with plural heading "The heating units in this area".
 *   C4  unmapped iT500 + unplaced salus: area-unmapped chip still present (iT500 kept); note present.
 *   C5  only unplaced salus: reworded alert; heating-unplaced-note present; no area chips.
 *   C6  no heating devices at all: "No heating on Lighthouse at this site."; note absent.
 *   C7  2 unplaced salus, 1 online: footnote ends "They are not used in this check."
 *   C8  area of 2 online iT700 units: "coldest of 2 zones" (unchanged); area-not-reporting-note absent.
 *
 * Pattern: vm sandbox (same as test/aircon-removal.test.js). workspace injected as state.workspace.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

process.env.DATA_MODE = 'fixture';

function loadClient(workspace) {
    const captured = [];
    const opened = [];
    const started = [];
    const boxes = {};
    const state = { flow: null, workspace, smartEntryText: '' };
    const sandbox = {
        state,
        boxes,
        $: (sel) => (boxes[sel] || (boxes[sel] = { innerHTML: '', focus() {} })),
        esc: s => String(s),
        openControl: (dev, cmd) => { opened.push({ dev, cmd }); },
        flowStep: () => {},
        render: () => {},
        startFlow: (k, txt) => { started.push({ k, txt }); },
        console
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    const src = readFileSync(new URL('../public/js/flows.js', import.meta.url), 'utf8')
        + '\n;globalThis.FLOWR = FLOWR;';
    vm.runInContext(src, ctx, { filename: 'flows.js' });
    sandbox.finishOutcome = (f, key, desc, render) => { captured.push(desc); return render({ ticket: { id: 900 + captured.length }, p1: null }); };
    return { ctx, state, captured, opened };
}

// ── Workspace builders ────────────────────────────────────────────────────────

// C1/C2/C3: mixed workspace — 1 online iT700 Accommodation, 3 offline salus Accommodation,
//            2 offline salus Bar/Restaurant, 1 offline salus area null (z-1)
function wsC1() {
    return {
        site: { siteNo: '5204', siteName: 'Bramley Farm Inn' },
        devices: [
            { deviceId: 'gk-5204-salusit700', deviceType: 'salus-it700', kind: 'heating', area: 'Accommodation', online: true,  telemetry: { localTemperature: 19.5, heatingSetpoint: 21, mode: 'Heat' } },
            { deviceId: 'gk_bramleyfarm_salus_STA10109321 (5204-f-1)', deviceType: 'salus', kind: 'heating', area: 'Accommodation', online: false, telemetry: {} },
            { deviceId: 'gk_bramleyfarm_salus_STA10109322 (5204-f-2)', deviceType: 'salus', kind: 'heating', area: 'Accommodation', online: false, telemetry: {} },
            { deviceId: 'gk_bramleyfarm_salus_STA10109323 (5204-f-3)', deviceType: 'salus', kind: 'heating', area: 'Accommodation', online: false, telemetry: {} },
            { deviceId: 'gk_bramleyfarm_salus_STA10109324 (5204-r-2)', deviceType: 'salus', kind: 'heating', area: 'Bar/Restaurant', online: false, telemetry: {} },
            { deviceId: 'gk_bramleyfarm_salus_STA10109325 (5204-r-3)', deviceType: 'salus', kind: 'heating', area: 'Bar/Restaurant', online: false, telemetry: {} },
            { deviceId: 'gk_bramleyfarm_salus_STA10109369 (5204-z-1)', deviceType: 'salus', kind: 'heating', area: null, online: false, telemetry: {} },
        ]
    };
}

// C4: 1 unmapped online iT500 + 1 unplaced bare-salus
function wsC4() {
    return {
        site: { siteNo: '5204', siteName: 'Bramley Farm Inn' },
        devices: [
            { deviceId: 'gk-5204-salusit500-4', deviceType: 'salus-it500', kind: 'heating', area: null, online: true, telemetry: { localTemperature: 18, heatingSetpoint: 20 } },
            { deviceId: 'gk_bramleyfarm_salus_STA10109369 (5204-z-1)', deviceType: 'salus', kind: 'heating', area: null, online: false, telemetry: {} },
        ]
    };
}

// C5: only 1 unplaced salus
function wsC5() {
    return {
        site: { siteNo: '5204', siteName: 'Bramley Farm Inn' },
        devices: [
            { deviceId: 'gk_bramleyfarm_salus_STA10109369 (5204-z-1)', deviceType: 'salus', kind: 'heating', area: null, online: false, telemetry: {} },
        ]
    };
}

// C6: no heating devices
function wsC6() {
    return {
        site: { siteNo: '5204', siteName: 'Bramley Farm Inn' },
        devices: [
            { deviceId: 'gk-5204-lwgateway-1', deviceType: 'gateway', kind: 'gateway', area: null, online: true, telemetry: {} },
        ]
    };
}

// C7: 2 unplaced salus, 1 online
function wsC7() {
    return {
        site: { siteNo: '5204', siteName: 'Bramley Farm Inn' },
        devices: [
            { deviceId: 'gk_salus_a (5204-z-1)', deviceType: 'salus', kind: 'heating', area: null, online: false, telemetry: {} },
            { deviceId: 'gk_salus_b (5204-z-2)', deviceType: 'salus', kind: 'heating', area: null, online: true,  telemetry: {} },
        ]
    };
}

// C8: 2 online iT700 Accommodation
function wsC8() {
    return {
        site: { siteNo: '5204', siteName: 'Bramley Farm Inn' },
        devices: [
            { deviceId: 'gk-5204-salusit700-1', deviceType: 'salus-it700', kind: 'heating', area: 'Accommodation', online: true, telemetry: { localTemperature: 19.5, heatingSetpoint: 21, mode: 'Heat' } },
            { deviceId: 'gk-5204-salusit700-2', deviceType: 'salus-it700', kind: 'heating', area: 'Accommodation', online: true, telemetry: { localTemperature: 21.0, heatingSetpoint: 21, mode: 'Heat' } },
        ]
    };
}

// ── C1: step 0 mixed workspace ────────────────────────────────────────────────
test('C1: step 0 — area chips + NO area-unmapped (D3) + heating-unplaced-note for z-1', () => {
    const { ctx, state } = loadClient(wsC1());
    state.flow = { cat: 'heating', stage: 0, done: [], data: {} };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /data-testid="area-accommodation"/, 'Accommodation chip present');
    assert.match(html, /data-testid="area-bar-restaurant"/, 'Bar/Restaurant chip present');
    // D3: unplaced salus must NOT trigger the fallback button
    assert.doesNotMatch(html, /data-testid="area-unmapped"/, 'area-unmapped chip must be absent (D3)');
    assert.match(html, /data-testid="heating-unplaced-note"/, 'heating-unplaced-note present');
    assert.match(html, /1 older Salus heating unit/, 'footnote mentions 1 unit');
    // No device serial names on screen
    assert.doesNotMatch(html, /STA101/, 'no device serials on screen');
});

// ── C2: choose Accommodation (mixed-health) ───────────────────────────────────
test('C2: choose Accommodation — "the only reporting zone" reading line + area-not-reporting-note', () => {
    const { ctx, state } = loadClient(wsC1());
    state.flow = { cat: 'heating', stage: 1, done: [], data: { area: 'Accommodation' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /the only reporting zone in Accommodation/, 'reading line: only reporting zone');
    assert.match(html, /data-testid="area-not-reporting-note"/, 'area-not-reporting-note present');
    assert.match(html, /3 other heating units in Accommodation are not reporting/, '3 offline in Accommodation');
    assert.match(html, /Nothing done on this call caused this/, 'reassurance sentence present');
    assert.match(html, /data-testid="need-warm"/, 'need-warm chip still present (iT700 online)');
});

// ── C3: choose Bar/Restaurant (all dark-fleet) ────────────────────────────────
test('C3: choose Bar/Restaurant — plural dark-fleet heading "The heating units in this area"', () => {
    const { ctx, state } = loadClient(wsC1());
    state.flow = { cat: 'heating', stage: 1, done: [], data: { area: 'Bar/Restaurant' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /data-testid="reco-dark-fleet"/, 'reco-dark-fleet present');
    assert.match(html, /The heating units in this area are not reporting/, 'plural heading (OQ4)');
    assert.doesNotMatch(html, /data-testid="need-warm"/, 'no need-warm in dark-fleet outcome');
    assert.doesNotMatch(html, /data-testid="need-cool"/, 'no need-cool in dark-fleet outcome');
});

// ── C4: unmapped iT500 + unplaced salus ──────────────────────────────────────
test('C4: unmapped iT500 + unplaced salus — area-unmapped chip present; note present', () => {
    const { ctx, state } = loadClient(wsC4());
    state.flow = { cat: 'heating', stage: 0, done: [], data: {} };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    // iT500 has null area and is NOT salus — it drives the fallback button
    assert.match(html, /data-testid="area-unmapped"/, 'area-unmapped chip present (iT500 kept in fallback)');
    assert.match(html, /data-testid="heating-unplaced-note"/, 'heating-unplaced-note present (salus z-1)');
});

// ── C5: only unplaced salus — reworded alert ──────────────────────────────────
test('C5: only unplaced salus — reworded no-area alert; note present; no area chips', () => {
    const { ctx, state } = loadClient(wsC5());
    state.flow = { cat: 'heating', stage: 0, done: [], data: {} };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /No heating area can be checked on Lighthouse at this site/, 'reworded alert');
    assert.match(html, /data-testid="heating-unplaced-note"/, 'footnote present');
    assert.doesNotMatch(html, /data-testid="area-accommodation"/, 'no area chip');
    assert.doesNotMatch(html, /data-testid="area-bar-restaurant"/, 'no bar chip');
    assert.doesNotMatch(html, /data-testid="area-unmapped"/, 'no fallback chip');
});

// ── C6: no heating devices at all ────────────────────────────────────────────
test('C6: no heating devices — "No heating on Lighthouse at this site." note absent', () => {
    const { ctx, state } = loadClient(wsC6());
    state.flow = { cat: 'heating', stage: 0, done: [], data: {} };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /No heating on Lighthouse at this site/, 'original no-heating message');
    assert.doesNotMatch(html, /data-testid="heating-unplaced-note"/, 'note absent when no unplaced salus');
    assert.doesNotMatch(html, /No heating area can be checked/, 'reworded alert not shown when no salus');
});

// ── C7: 2 unplaced salus, 1 online — "not used in this check." ───────────────
test('C7: 2 unplaced salus (1 online) — footnote says "They are not used in this check." (not "not reporting")', () => {
    const { ctx, state } = loadClient(wsC7());
    state.flow = { cat: 'heating', stage: 0, done: [], data: {} };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /data-testid="heating-unplaced-note"/, 'note present');
    assert.match(html, /2 older Salus heating units/, 'plural unit count');
    assert.match(html, /They are not used in this check/, 'online path: not "not reporting"');
    assert.doesNotMatch(html, /They are not reporting/, 'offline phrase must be absent when any online');
});

// ── C8: 2 online iT700 — "coldest of 2 zones" unchanged ─────────────────────
test('C8: area of 2 online iT700 units — "coldest of 2 zones" unchanged; area-not-reporting-note absent', () => {
    const { ctx, state } = loadClient(wsC8());
    state.flow = { cat: 'heating', stage: 1, done: [], data: { area: 'Accommodation' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /coldest of 2 zones in Accommodation/, 'unchanged reading line when all online');
    assert.doesNotMatch(html, /data-testid="area-not-reporting-note"/, 'note absent when nOff===0');
    assert.doesNotMatch(html, /reporting zone/, 'no "reporting zone" language when all online');
});
