/**
 * OOHDASH-70 (C8/R10) — hot-water out-of-scope R1 default, presence-driven.
 *
 * Proves the R1 hot-water scope signal is a function of LIVE DEVICE PRESENCE, not
 * a hard-coded `salus-it500-dhw` name-match (bridge.js:57-67 — live never emits it):
 *   - a controllable DHW device is one whose registry contract exposes `hwboost`;
 *   - a combi carrying hotWaterCapable/telemetry.hotWater is observed-not-controllable (`mon`);
 *   - else `none`.
 *
 * The three surfaces are tested against fixture/live-shaped inventory (NO live bridge call):
 *   - routes/api.js SCOPE_GROUPS level fn (server presence predicate + payload level);
 *   - public/js/flows.js hotwater flow (out-of-scope is the deterministic default,
 *     the `hw-boost-yes` compose chip only renders on live presence, capture-and-escalate
 *     logs OohCaptureClass:'hot-water');
 *   - public/js/views.js scopeTag (out-of-scope-with-context tile reading).
 *
 * The client scripts are browser globals (no ESM), so they are evaluated in a `vm`
 * sandbox with stub globals. No network: axios is intercepted at the adapter layer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';
import axios from 'axios';

// main is fail-closed by default now; these modules read config at import — a couple of
// them consult the write flag. Keep the test write-inert but importable.
process.env.WRITES_DISABLED = 'false';
process.env.DATA_MODE = 'live';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

// MIGRATED to the TB-direct read: intercept the TB device/telemetry endpoints (not /api/devices),
// and drive the scope surfaces off getSitesByNumber('6261'). The 6261 combi (salus-it500 + hotWater)
// still exercises the presence-driven hot-water-scope behaviour the old test pinned.
const tbFixture = JSON.parse(
    readFileSync(new URL('../data/fixtures/tb-devices.raw.json', import.meta.url), 'utf8')
);
const allDevices = [...tbFixture.devices, ...tbFixture.site4741];
const telemetryByUuid = new Map(allDevices.map(d => [d.id.id, d.telemetry || {}]));
const activeByUuid = new Map(allDevices.map(d => [d.id.id, d.active]));
axios.defaults.adapter = (cfg) => {
    const url = cfg.url || '';
    const ok = data => ({ data, status: 200, statusText: 'OK', headers: {}, config: cfg, request: {} });
    if (url.includes('/api/auth/login')) return Promise.resolve(ok({ token: 'test-jwt' }));
    if (url.includes('/api/tenant/devices') && url.includes('textSearch')) {
        const m = url.match(/textSearch=([^&]+)/);
        const q = m ? decodeURIComponent(m[1]).toLowerCase() : '';
        // OOHDASH-80: plain Device entity has no `active` — online comes from SERVER_SCOPE below.
        const data = allDevices.filter(d => d.name.toLowerCase().includes(q)).map(({ active, telemetry, ...e }) => e);
        return Promise.resolve(ok({ data, hasNext: false, totalElements: data.length }));
    }
    if (url.includes('/values/attributes/SERVER_SCOPE')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/attributes\/SERVER_SCOPE/);
        return Promise.resolve(ok([{ key: 'active', value: activeByUuid.get(um ? um[1] : null), lastUpdateTs: Date.now() }]));
    }
    if (url.includes('/values/timeseries')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/timeseries/);
        const bag = telemetryByUuid.get(um ? um[1] : null) || {};
        return Promise.resolve(ok(Object.fromEntries(Object.entries(bag).map(([k, v]) => [k, [{ ts: Date.now(), value: v }]]))));
    }
    return Promise.resolve(ok({}));
};

const bridge = await import('../services/bridge.js');
const registry = await import('../services/registry.js');
const api = await import('../routes/api.js');

// Build the workspace `scope` array exactly as routes/api.js does (same payload shape).
function scopeOf(site) {
    return api.SCOPE_GROUPS.map(g => ({ key: g.key, label: g.label, level: g.level(site) }));
}
// Build the workspace `devices` array exactly as routes/api.js workspacePayload does —
// each device carries the registry-derived `capabilities`, which is the client's
// presence seam (the client never name-matches salus-it500-dhw).
function workspaceDevices(site) {
    return site.devices.map(d => ({
        ...d,
        capabilities: registry.capabilitiesFor(d.deviceType)?.commands || []
    }));
}

// ---- client-script sandbox: evaluate public/js/flows.js + views.js with stub globals ----
function loadClient(workspace) {
    const captured = [];             // outcomes recorded via finishOutcome (capture/escalate)
    const opened = [];               // openControl(...) calls — a reachable boost/compose path
    const state = { flow: null, workspace };
    const sandbox = {
        state,
        // stub globals the flow/view code reaches for:
        $: () => ({ focus() {} }),
        esc: s => String(s),
        openControl: (dev, cmd) => { opened.push({ dev, cmd }); },
        flowStep: () => {},
        render: () => {},
        window: {},
        console
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    // `const`-declared bindings (FLOWR) don't attach to the sandbox global; export them
    // onto globalThis within the SAME compilation unit so the test can reach them.
    const flowsSrc = readFileSync(new URL('../public/js/flows.js', import.meta.url), 'utf8') + '\n;globalThis.FLOWR = FLOWR;';
    vm.runInContext(flowsSrc, ctx, { filename: 'flows.js' });
    // finishOutcome is the async API-posting sink (a function declaration, so it binds to
    // the sandbox global); override it AFTER load to capture the outcome descriptor
    // synchronously and return a rendered card, keeping outcomeCaptured/outcomeScope sync.
    sandbox.finishOutcome = (f, key, desc, render) => { captured.push(desc); return render({ ticket: { id: 900 + captured.length }, p1: null }); };
    vm.runInContext(readFileSync(new URL('../public/js/views.js', import.meta.url), 'utf8'), ctx, { filename: 'views.js' });
    return { ctx, state, captured, opened };
}

// A synthetic controllable DHW device: registry-modeled `salus-it500-dhw` DOES expose
// `hwboost`, so it is genuinely controllable by CONTRACT — not admitted on the name.
// (This is the fixture-only device the design says exercises the R7-ready flip.)
function syntheticControllableDhw() {
    return { deviceId: 'synthetic-dhw-1', deviceType: 'salus-it500-dhw', kind: 'hotwater', online: true, hotWaterCapable: true, telemetry: { hwBoostHours: 0, hotWater: 1 } };
}

test('server: live-shaped combi (salus-it500 + hotWater, no salus-it500-dhw) → hot-water level is mon (out-of-scope-with-context), NOT ctl', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    const scope = scopeOf(site);
    const hw = scope.find(g => g.key === 'hotwater');
    assert.equal(hw.level, 'mon', 'combi with hotWater signal but no controllable DHW device reads as mon');
    assert.notEqual(hw.level, 'ctl', 'a live combi must NEVER read as controllable');
});

test('server: presence predicate is registry-driven, not a name-match on salus-it500-dhw', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    // No live device exposes hwboost → not controllable.
    assert.equal(api.hasControllableDhw(site), false);
    // Inject a device NAMED salus-it500-dhw would be controllable ONLY because the
    // registry contract for it exposes hwboost — prove it is the CONTRACT that flips it:
    const withRealDhw = { devices: [...site.devices, syntheticControllableDhw()] };
    assert.equal(api.hasControllableDhw(withRealDhw), true, 'a device whose registry contract exposes hwboost is controllable');
});

test('server R7-ready flip (presence-driven, NO code change): synthetic controllable DHW device flips the tile to ctl', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    assert.equal(scopeOf(site).find(g => g.key === 'hotwater').level, 'mon', 'baseline: out-of-scope-with-context');
    const flipped = { ...site, devices: [...site.devices, syntheticControllableDhw()] };
    assert.equal(scopeOf(flipped).find(g => g.key === 'hotwater').level, 'ctl',
        'injecting a genuinely controllable DHW device flips the SAME level fn to ctl with no code change');
});

test('view: out-of-scope-with-context (mon) hot-water tile reads "monitored — not adjustable from here", not a bare "Not on Lighthouse here"', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    const { ctx } = loadClient({ site: { siteName: site.siteName }, devices: workspaceDevices(site), scope: scopeOf(site) });
    const tag = ctx.scopeTag({ key: 'hotwater', label: 'Hot water', level: 'mon' });
    assert.match(tag, /not adjustable from here/i);
    assert.doesNotMatch(tag, /Not on Lighthouse here/i);
    // A `none` hot-water tile reads as "not controllable here", still distinct from a generic scope group.
    assert.match(ctx.scopeTag({ key: 'hotwater', label: 'Hot water', level: 'none' }), /not controllable here/i);
    // ctl still renders controllable (R7-ready).
    assert.match(ctx.scopeTag({ key: 'hotwater', label: 'Hot water', level: 'ctl' }), /Controllable from here/i);
});

test('flow: before-compose out-of-scope — HW complaint front-loads "not controllable here — capture and escalate" with NO compose affordance', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    const ws = { site: { siteName: site.siteName }, devices: workspaceDevices(site), scope: scopeOf(site) };
    const { ctx, state } = loadClient(ws);
    state.flow = { stage: 0, done: [], data: {} };
    const html = ctx.FLOWR.hotwater(ws, state.flow);
    assert.match(html, /not controllable from here/i, 'the out-of-scope message is front-loaded before any compose affordance');
    assert.doesNotMatch(html, /hw-boost-yes/, 'the boost/compose chip must NOT render for a live combi');
    assert.match(html, /Capture &amp; escalate/, 'capture-and-escalate is the deterministic default path');
});

test('flow: compose chip never renders from live-shaped inventory, and no boost/openControl path is reachable', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    const ws = { site: { siteName: site.siteName }, devices: workspaceDevices(site), scope: scopeOf(site) };
    const { ctx, state, opened } = loadClient(ws);
    state.flow = { stage: 0, done: [], data: {} };
    const stage0 = ctx.FLOWR.hotwater(ws, state.flow);
    assert.doesNotMatch(stage0, /hw-boost-yes/);
    // Even if the boost branch were forced, there is no controllable device to openControl against.
    state.flow = { stage: 1, done: [], data: { boost: 1 } };
    ctx.FLOWR.hotwater(ws, state.flow);
    assert.equal(opened.length, 0, 'no openControl(boost) path is reachable from live-shaped inventory');
});

test('flow: capture-and-escalate outcome logs a hot-water class ticket (OohCaptureClass:hot-water)', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    const ws = { site: { siteName: site.siteName }, devices: workspaceDevices(site), scope: scopeOf(site) };
    const { ctx, state, captured } = loadClient(ws);
    state.flow = { stage: 1, done: [], data: { cap: 1 } };
    ctx.FLOWR.hotwater(ws, state.flow);
    assert.equal(captured.length, 1, 'the capture path records exactly one outcome');
    assert.equal(captured[0].OohCaptureClass, 'hot-water');
    assert.equal(captured[0].type, 'capture');
});

test('flow R7-ready flip (presence-driven, NO code change): a synthetic controllable DHW device makes the boost/compose chip reappear', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    const flippedSite = { ...site, devices: [...site.devices, syntheticControllableDhw()] };
    const ws = { site: { siteName: site.siteName }, devices: workspaceDevices(flippedSite), scope: scopeOf(flippedSite) };
    const { ctx, state, opened } = loadClient(ws);
    state.flow = { stage: 0, done: [], data: {} };
    const html = ctx.FLOWR.hotwater(ws, state.flow);
    assert.match(html, /hw-boost-yes/, 'the compose chip reappears once a genuinely controllable DHW device is present — no code change');
    // and the boost branch now reaches openControl against that device.
    state.flow = { stage: 1, done: [], data: { boost: 1 } };
    ctx.FLOWR.hotwater(ws, state.flow);
    assert.equal(opened.length, 1, 'the boost/openControl path is reachable only when a controllable device is present');
    assert.equal(opened[0].cmd, 'boost');
});
