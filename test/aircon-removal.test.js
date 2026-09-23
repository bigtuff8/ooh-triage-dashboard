/**
 * OOHDASH-82 (design §6, §7, §10.1) — aircon removal + referral, and the two-area heating chips.
 *
 * Proves:
 *   - an intesis device classifies non-controllable with null control (kind aircon);
 *   - validateCommand refuses a setpoint on intesis (empty registry commands);
 *   - the aircon flow submits a capture with OohCaptureClass 'aircon-referral' and never calls
 *     openControl (no live actuation — the write-lock invariant holds);
 *   - an aircon keyword resolves to the aircon suggestion chip;
 *   - the heating first step renders only the DISTINCT present areas (Accommodation / Bar-Restaurant)
 *     plus the fallback chip and the aircon shortcut — never serials, never a gateway.
 *
 * Client scripts are browser globals (no ESM), evaluated in a vm sandbox (mirrors hotwater-scope).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

process.env.DATA_MODE = 'fixture';

const { classifyDevice } = await import('../services/tb-device.js');
const registry = await import('../services/registry.js');

/* ------------------------------ classifier + registry ------------------------------ */

test('classifier: an intesis device is non-controllable with null control (kind aircon)', () => {
    const c = classifyDevice('gk-6218-intesis-1', 'default', { heatingSetpoint: 24 });
    assert.equal(c.kind, 'aircon');
    assert.equal(c.deviceType, 'intesis');
    assert.equal(c.controllable, false);
    assert.equal(c.control, null);
});

test('registry: validateCommand refuses a setpoint on intesis (empty commands — control removed)', () => {
    const di = { deviceType: 'intesis', telemetry: { heatingSetpoint: 24 } };
    const r = registry.validateCommand(di, 'setpoint', 25);
    assert.equal(r.ok, false);
    assert.match(r.reason, /does not support/i);
});

/* ------------------------------ flow sandbox ------------------------------ */

function loadClient(workspace) {
    const captured = [];
    const opened = [];
    const started = [];
    const boxes = {};                       // selector → { innerHTML } — stable across a call
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
        + '\n;globalThis.FLOWR = FLOWR; globalThis.issueSearch = issueSearch;';
    vm.runInContext(src, ctx, { filename: 'flows.js' });
    sandbox.finishOutcome = (f, key, desc, render) => { captured.push(desc); return render({ ticket: { id: 900 + captured.length }, p1: null }); };
    return { ctx, state, captured, opened, started };
}

const ws = () => ({
    site: { siteNo: '6218', siteName: 'The Test Arms' },
    devices: [
        { deviceId: 'gk-6218-salusit700', deviceType: 'salus-it700', kind: 'heating', area: 'Accommodation', online: true, telemetry: { localTemperature: 19, heatingSetpoint: 21 } },
        { deviceId: 'gk-6218-salusit500-2', deviceType: 'salus-it500', kind: 'heating', area: 'Accommodation', online: true, telemetry: { localTemperature: 17, heatingSetpoint: 20 } },
        { deviceId: 'gk-6218-salusit500-3', deviceType: 'salus-it500', kind: 'heating', area: 'Bar/Restaurant', online: true, telemetry: { localTemperature: 21, heatingSetpoint: 20 } },
        { deviceId: 'gk-6218-salusit500-4', deviceType: 'salus-it500', kind: 'heating', area: null, online: true, telemetry: { localTemperature: 18, heatingSetpoint: 20 } },
        { deviceId: 'gk-6218-intesis-1', deviceType: 'intesis', kind: 'aircon', area: null, online: true, telemetry: { heatingSetpoint: 24 } },
        { deviceId: 'gk-6218-salusit700-gateway-1', deviceType: 'gateway', kind: 'gateway', area: null, online: false, telemetry: {} }
    ]
});

test('flow: the aircon flow submits a capture with OohCaptureClass aircon-referral and never openControls', () => {
    const { ctx, state, captured, opened } = loadClient(ws());
    state.flow = { cat: 'aircon', stage: 0, done: [], data: {} };
    ctx.FLOWR.aircon(state.workspace, state.flow);
    assert.equal(captured.length, 1, 'exactly one capture recorded');
    assert.equal(captured[0].OohCaptureClass, 'aircon-referral');
    assert.equal(captured[0].type, 'capture', 'a NORMAL capture, not a P1 escalation');
    assert.equal(opened.length, 0, 'no openControl — aircon is never actuated (write-lock holds)');
});

test('flow: an aircon keyword resolves to the aircon suggestion chip', () => {
    const { ctx } = loadClient(ws());
    ctx.issueSearch('the air con is not working');
    assert.match(ctx.boxes['#isugg'].innerHTML, /suggest-aircon/, 'the aircon suggestion chip is offered for an aircon keyword');
});

test('flow: heating step renders only present AREAS (Accommodation/Bar-Restaurant) + fallback + aircon shortcut — never serials or a gateway', () => {
    const { ctx, state } = loadClient(ws());
    state.flow = { cat: 'heating', stage: 0, done: [], data: {} };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /data-testid="area-accommodation"/, 'Accommodation chip present');
    assert.match(html, /data-testid="area-bar-restaurant"/, 'Bar/Restaurant chip present');
    assert.match(html, /data-testid="area-unmapped"/, 'the unmapped fallback chip present (the null-area iT500)');
    assert.match(html, /data-testid="aircon-shortcut"/, 'the aircon shortcut present (the site has an Intesis)');
    // No device serial and no gateway ever appears as a chip.
    assert.doesNotMatch(html, /salusit500|salusit700|intesis|gateway/i, 'no serial or gateway leaks into the chips');
});

test('flow: a site with NO aircon shows no aircon shortcut', () => {
    const w = ws();
    w.devices = w.devices.filter(d => d.kind !== 'aircon');
    const { ctx, state } = loadClient(w);
    state.flow = { cat: 'heating', stage: 0, done: [], data: {} };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.doesNotMatch(html, /data-testid="aircon-shortcut"/);
});

test('flow: choosing Accommodation reads the coldest online zone with a "coldest of N zones" note', () => {
    const { ctx, state } = loadClient(ws());
    // Accommodation has two online devices (19°C and 17°C) → the 17°C iT500 is the representative.
    state.flow = { cat: 'heating', stage: 1, done: [], data: { area: 'Accommodation' } };
    const html = ctx.FLOWR.heating(state.workspace, state.flow);
    assert.match(html, /17°C/, 'the coldest of the two Accommodation zones is surfaced');
    assert.match(html, /coldest of 2 zones in Accommodation/i, 'the honest representative note is shown');
    assert.match(html, /gk-6218-salusit500-2/, 'the representative device is the 17°C Staff iT500');
});
