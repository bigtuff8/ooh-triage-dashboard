/**
 * OOHDASH-123 (D-DARK-FLEETS) - dark-fleet "device not reporting" heating copy.
 *
 * Fix 2: for the dark iT500 / bare-salus devices (offline, not reporting), the heating flow now says
 * "device not reporting" with NO controls, instead of only reusing the generic gateway "not responding"
 * connectivity branch. The operator OUTCOME (offline, no controls, captured for the IoT team) is
 * unchanged; the WORDS match James's binding decision.
 *
 * Client scripts are browser globals (no ESM), evaluated in a vm sandbox (mirrors aircon-removal).
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
    return { ctx, state, captured, opened, started };
}

// A site whose only Accommodation heating device is a DARK (offline, not reporting) iT500.
const darkIt500Ws = () => ({
    site: { siteNo: '7001', siteName: 'The Dark Arms' },
    devices: [
        { deviceId: 'IT500-ACC-7001', deviceType: 'salus-it500', kind: 'heating', area: 'Accommodation', online: false, telemetry: {} }
    ]
});

/* ------------------------------ the dark-fleet surface ------------------------------ */

test('dark-fleet: an all-dark iT500 area shows "device not reporting" with NO warmer/cooler/off controls', () => {
    const { ctx, state } = loadClient(darkIt500Ws());
    state.flow = { cat: 'heating', stage: 1, done: [], data: { area: 'Accommodation' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    // The explicit "device not reporting" live-read line is pushed to the done trail the operator sees.
    assert.ok(state.flow.done.some(d => /device not reporting/i.test(d)), 'the explicit D-DARK-FLEETS live-read line is shown');
    assert.match(html, /not reporting/i, 'the dark-fleet body explains the device is not reporting');
    assert.match(html, /data-testid="reco-dark-fleet"/, 'the dedicated dark-fleet surface renders');
    // No controls are offered.
    assert.doesNotMatch(html, /data-testid="need-warm"/, 'no Warmer control');
    assert.doesNotMatch(html, /data-testid="need-cool"/, 'no Cooler control');
    assert.doesNotMatch(html, /data-testid="need-off"/, 'no Turn-it-off control');
    // It is NOT the generic connectivity divert.
    assert.notEqual(state.flow.cat, 'connectivity', 'does not divert into the generic gateway branch');
});

test('dark-fleet: the bare-salus type is treated identically to iT500', () => {
    const ws = darkIt500Ws();
    ws.devices[0] = { deviceId: 'gk-elmwood-salus-1', deviceType: 'salus', kind: 'heating', area: 'Accommodation', online: false, telemetry: {} };
    const { ctx, state } = loadClient(ws);
    state.flow = { cat: 'heating', stage: 1, done: [], data: { area: 'Accommodation' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /data-testid="reco-dark-fleet"/, 'bare-salus surfaces the dark-fleet copy too');
});

test('dark-fleet: capture routes to a normal IoT-team capture (dark-fleet-heating), never openControl', () => {
    const { ctx, state, captured, opened } = loadClient(darkIt500Ws());
    state.flow = { cat: 'heating', stage: 2, done: [], data: { area: 'Accommodation', need: 'darkcap' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.equal(captured.length, 1, 'exactly one capture recorded');
    assert.equal(captured[0].OohCaptureClass, 'dark-fleet-heating');
    assert.equal(captured[0].type, 'capture', 'a normal capture, not a P1');
    assert.equal(opened.length, 0, 'no openControl - a dark device is never actuated');
    assert.match(html, /Captured for the IoT team/i, 'the captured outcome renders');
});

test('dark-fleet: end-with-no-action routes to a no-action outcome', () => {
    const { ctx, state, captured } = loadClient(darkIt500Ws());
    state.flow = { cat: 'heating', stage: 2, done: [], data: { area: 'Accommodation', need: 'darknoact' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].type, 'no-action');
    assert.match(html, /no action taken/i);
});

/* ------------------------------ regression guards ------------------------------ */

test('regression: a MIXED area (dark iT500 + ONLINE iT700) still reads the live thermostat with controls', () => {
    const ws = darkIt500Ws();
    ws.devices.push({ deviceId: 'gk-7001-salusit700-1', deviceType: 'salus-it700', kind: 'heating', area: 'Accommodation', online: true, telemetry: { localTemperature: 18, heatingSetpoint: 20 } });
    const { ctx, state } = loadClient(ws);
    state.flow = { cat: 'heating', stage: 1, done: [], data: { area: 'Accommodation' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.doesNotMatch(html, /data-testid="reco-dark-fleet"/, 'a live thermostat is present, so not the dark surface');
    assert.match(html, /data-testid="need-warm"/, 'the live thermostat still offers controls');
});

test('regression: an offline NON-dark area (offline iT700 only) still diverts to the generic connectivity branch', () => {
    const ws = darkIt500Ws();
    ws.devices[0] = { deviceId: 'gk-7001-salusit700-1', deviceType: 'salus-it700', kind: 'heating', area: 'Accommodation', online: false, telemetry: {} };
    const { ctx, state } = loadClient(ws);
    state.flow = { cat: 'heating', stage: 1, done: [], data: { area: 'Accommodation' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.doesNotMatch(html, /data-testid="reco-dark-fleet"/, 'an offline iT700 is a comms fault, not a dark device');
    assert.equal(state.flow.cat, 'connectivity', 'still diverts to the generic connectivity branch');
});
