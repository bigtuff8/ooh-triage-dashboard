/**
 * OOHDASH-122 — degraded banner fix: derivation correctness + guard truth table.
 *
 * U1-U3:  bridgeDegraded() derivation — imported from routes/api.js (real production export);
 *         bridge status provided via argument so bridge.bridgeStatus() default is not exercised.
 * U5:     Cold-start module state (documents the residual /healthz boot window, DECISION 2).
 * U6-U14: Guard truth table S1-S9 from design §5, vm sandbox (public/js/app.js).
 *
 * No network. No wall-clock sleeps.
 */
import { test, mock, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

// bridgeDegraded is loaded dynamically after env and mocks are in place (see below).
// Static import would hoist before process.env.DATA_MODE is set, corrupting config.dataMode.
let bridgeDegraded;

/* ------------------------------------------------------------------ */
/* U1-U3: derivation correctness (exercises real bridgeDegraded export) */
/* ------------------------------------------------------------------ */

test('U1 AC-1: boot state (healthy:false, lastError:null) → not degraded', () => {
    assert.equal(bridgeDegraded({ healthy: false, lastError: null }), false,
        'a fresh pod with no read yet is not degraded');
});

test('U2 AC-2: after a good read (healthy:true, lastError:null) → not degraded', () => {
    assert.equal(bridgeDegraded({ healthy: true, lastError: null }), false,
        'a successful read is not degraded');
});

test('U3 AC-2: after a failed read (healthy:false, lastError set) → degraded', () => {
    assert.equal(bridgeDegraded({ healthy: false, lastError: 'Request failed with status code 503' }), true,
        'a recorded error is degraded');
});

/* ------------------------------------------------------------------ */
/* U5: cold-start module state (live mode, no probe, no real read)      */
/* Documents the residual /healthz boot window (design DECISION 2).    */
/* ------------------------------------------------------------------ */

// DATA_MODE=live and mocks must be set before any config-backed import.
process.env.DATA_MODE = 'live';

// Minimal mocks so tb-device.js loads in live mode without real network calls.
// The zendesk and store stubs cover all named imports used transitively when
// routes/api.js is loaded by the before() hook for U1-U3.
mock.module('../services/tb-client.js', {
    namedExports: {
        readRequest: async () => { throw new Error('readRequest must not be called in U5 (no probe or real read triggered)'); },
        readServerScopeAttributes: async () => [],
        readSharedScopeAttributes: async () => null,
        tbStatus: () => ({ healthy: true, lastError: null }),
    }
});
const _noop = async () => {};
const _noopSync = () => {};
mock.module('../services/zendesk.js', {
    namedExports: {
        resolveSiteName: async () => 'Test Site',
        siteDirectory: async () => [],
        hhmm: () => '',
        zendeskStatus: () => ({ healthy: true }),
        addLateSyncNote: _noop,
        createLateSyncTicket: _noop,
        createOutcomeTicket: _noop,
        addFeedbackNote: _noop,
        getFeedbackThread: async () => [],
        setFollowUpDate: _noop,
        callbackLookup: async () => null,
        ticketsForSite: async () => [],
        raiseQuery: _noop,
        findCallTickets: async () => [],
        mergeTickets: _noop,
        addRecordingNote: _noop,
        normaliseAdditionalNotes: (raw) => raw || '',
        normalizeVoiceMeta: () => ({}),
        seedFixtureCallTicket: _noopSync,
        resetFixtureCallTickets: _noopSync,
        seedFixtureTicket: _noopSync,
        resetSeededFixtureTickets: _noopSync,
        getFixtureCallTicket: () => null,
        buildAuthHeader: () => ({}),
    }
});
class _ConcurrencyError extends Error {}
mock.module('../services/store.js', {
    namedExports: {
        ConcurrencyError: _ConcurrencyError,
        collection: async () => ({}),
        storeProbe: async () => ({ healthy: true }),
        storeStatus: () => ({ healthy: true }),
    }
});

// Load the real bridgeDegraded export from routes/api.js after env + mocks are in place.
// Cache-busting keeps this import separate from the U5 tb-device.js instance.
before(async () => {
    ({ bridgeDegraded } = await import(`../routes/api.js?bd=${Math.random()}`));
});

test('U5 AC-1: cold-start module state — bridgeDegraded(bridgeStatus()) is false before any read or probe', async () => {
    // Cache-bust to get a fresh module instance (lastReadOk=false, lastReadError=null per line 84-85).
    const { bridgeStatus } = await import(`../services/tb-device.js?u5=${Math.random()}`);
    const status = bridgeStatus();
    assert.equal(status.healthy, false, 'fresh boot: healthy is false (latch not yet proven)');
    assert.equal(status.lastError, null, 'fresh boot: lastError is null (no real read has failed)');
    assert.equal(bridgeDegraded(status), false,
        'bridgeDegraded must be false at cold start — the false-negative this ticket fixes');
});

/* ------------------------------------------------------------------ */
/* U6-U14: guard truth table S1-S9 (vm sandbox, public/js/app.js)      */
/* Verifies no combination renders both banners simultaneously.         */
/* ------------------------------------------------------------------ */

function stubSessionStorage() {
    const m = new Map();
    return {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: k => m.delete(k),
    };
}

/**
 * Load public/js/app.js in a vm sandbox. `me` is the /api/me payload (operator, killSwitch,
 * controlLive, degraded). `siteNo` and `workspace` can be set via ctx.__setState({ ... }).
 *
 * A test-seam preamble injects `function __setState(patch)` into the same script scope as
 * `state`, so it closes over the const and can mutate it from outside the vm.
 */
function loadApp(me, { siteNo = null } = {}) {
    const appHtml = { value: '' };
    const els = {
        app: { set innerHTML(v) { appHtml.value = v; }, get innerHTML() { return appHtml.value; } },
        modalroot: { set innerHTML(v) {}, get innerHTML() { return ''; } },
        toasts: { appendChild() {} },
    };
    const ctxObj = { me };
    const sandbox = {
        api: { get: async (url) => { if (url === '/api/me') return ctxObj.me; return {}; }, post: async () => ({}) },
        sessionStorage: stubSessionStorage(),
        document: {
            getElementById: id => els[id] || { innerHTML: '', set innerHTML(v) {} },
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ innerHTML: '', className: '', appendChild() {}, remove() {} }),
            addEventListener: () => {},
            body: { appendChild() {} },
        },
        vHome: () => {}, vSite: () => {}, vCallback: () => {}, vTonight: () => {}, vAdmin: () => {},
        setTimeout, clearTimeout, console, Date, Number, Math, JSON, String,
        window: {},
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    // Prepend a test-seam function that closes over `state` so we can mutate it from outside.
    // (const state is script-scoped and not a property of ctx; a function declaration that shares
    // the same script can close over it and expose it to the test.)
    const appSrc = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
    const preamble = 'function __setState(patch) { Object.assign(state, patch); }\n';
    vm.runInContext(preamble + appSrc, ctx, { filename: 'app.js' });
    // Set siteNo and initial workspace via the injected seam.
    if (siteNo !== null) ctx.__setState({ siteNo });
    return { ctx, appHtml, ctxObj };
}

const settle = () => new Promise(r => setImmediate(r));

/** Base operator for all sandbox tests. */
const OP = { name: 'Test Handler', role: 'handler', roleLabel: 'Handler' };

/** Render and return the app HTML after a full settle cycle. h is the loadApp result. */
async function render(h) {
    await settle();
    h.ctx.render();
    return h.appHtml.value ?? '';
}

function hasBanner(html, testid) {
    return html.includes(`data-testid="${testid}"`);
}

// S1: Cold start — me.degraded now false (bug fixed), controlLive true, no kills.
test('U6 AC-2 S1: cold start → green only, no red', async () => {
    const me = { operator: OP, version: '1.3.8', controlLive: true, degraded: false,
        killSwitch: { writesDisabled: false } };
    const h = loadApp(me);
    const html = await render(h);
    assert.ok(hasBanner(html, 'control-live-banner'), 'S1: green banner present');
    assert.ok(!hasBanner(html, 'kill-banner'), 'S1: red banner absent');
});

// S2: Account-level read failure — me.degraded true.
test('U7 AC-2 S2: account-level degraded → red only', async () => {
    const me = { operator: OP, version: '1.3.8', controlLive: true, degraded: true,
        killSwitch: { writesDisabled: false } };
    const h = loadApp(me);
    const html = await render(h);
    assert.ok(hasBanner(html, 'kill-banner'), 'S2: red banner present');
    assert.ok(!hasBanner(html, 'control-live-banner'), 'S2: green banner absent');
});

// S3: Workspace-level failure only — me.degraded false, workspace.degraded true.
test('U8 AC-2 S3: workspace-level degraded → red only', async () => {
    const me = { operator: OP, version: '1.3.8', controlLive: true, degraded: false,
        killSwitch: { writesDisabled: false } };
    const h = loadApp(me, { siteNo: '6832' });
    // Use the injected seam to set workspace.degraded (ctx.state is script-scoped const,
    // not a ctx property; __setState closes over it from the same script scope).
    h.ctx.__setState({ workspace: { degraded: true, site: { siteNo: '6832', siteName: 'Old Grey Mare' } },
        confirmToken: 'tok' });
    const html = await render(h);
    assert.ok(hasBanner(html, 'kill-banner'), 'S3: red banner present');
    assert.ok(!hasBanner(html, 'control-live-banner'), 'S3: green banner absent');
});

// S4: Both degraded — me.degraded true, workspace.degraded true.
test('U9 AC-2 S4: both degraded → red only', async () => {
    const me = { operator: OP, version: '1.3.8', controlLive: true, degraded: true,
        killSwitch: { writesDisabled: false } };
    const h = loadApp(me, { siteNo: '6832' });
    h.ctx.__setState({ workspace: { degraded: true, site: { siteNo: '6832', siteName: 'Old Grey Mare' } } });
    const html = await render(h);
    assert.ok(hasBanner(html, 'kill-banner'), 'S4: red banner present');
    assert.ok(!hasBanner(html, 'control-live-banner'), 'S4: green banner absent');
});

// S5: Fully healthy — me.degraded false, no kills.
test('U10 AC-2 S5: fully healthy → green only', async () => {
    const me = { operator: OP, version: '1.3.8', controlLive: true, degraded: false,
        killSwitch: { writesDisabled: false } };
    const h = loadApp(me);
    const html = await render(h);
    assert.ok(hasBanner(html, 'control-live-banner'), 'S5: green banner present');
    assert.ok(!hasBanner(html, 'kill-banner'), 'S5: red banner absent');
});

// S6: Deploy lock — controlLive false, ks.writesDisabled true.
test('U11 AC-2 S6: deploy lock → red only, no green', async () => {
    const me = { operator: OP, version: '1.3.8', controlLive: false, degraded: false,
        killSwitch: { writesDisabled: true } };
    const h = loadApp(me);
    const html = await render(h);
    assert.ok(hasBanner(html, 'kill-banner'), 'S6: red banner present');
    assert.ok(!hasBanner(html, 'control-live-banner'), 'S6: green banner absent (controlLive false)');
});

// S7: Global kill-switch on, writes enabled — controlLive true, ks.global true.
test('U12 AC-2 S7: global kill-switch on → red only (recommended guard)', async () => {
    const me = { operator: OP, version: '1.3.8', controlLive: true, degraded: false,
        killSwitch: { writesDisabled: false, global: true, reason: 'maintenance', actor: 'Admin' } };
    const h = loadApp(me);
    const html = await render(h);
    assert.ok(hasBanner(html, 'kill-banner'), 'S7: red banner present');
    assert.ok(!hasBanner(html, 'control-live-banner'), 'S7: green banner absent (guard !kill)');
});

// S8: Site kill-switch on, that site open.
test('U13 AC-2 S8: site kill-switch on (this site) → red only', async () => {
    const me = { operator: OP, version: '1.3.8', controlLive: true, degraded: false,
        killSwitch: { writesDisabled: false, sites: { '6832': { reason: 'engineer on site', actor: 'Admin' } } } };
    const h = loadApp(me, { siteNo: '6832' });
    const html = await render(h);
    assert.ok(hasBanner(html, 'kill-banner'), 'S8: red banner present');
    assert.ok(!hasBanner(html, 'control-live-banner'), 'S8: green banner absent for this site');
});

// S9: Site kill-switch on, different site — should show green.
test('U14 AC-2 S9: site kill-switch on (different site) → green only', async () => {
    const me = { operator: OP, version: '1.3.8', controlLive: true, degraded: false,
        killSwitch: { writesDisabled: false, sites: { '9999': { reason: 'engineer on site', actor: 'Admin' } } } };
    const h = loadApp(me, { siteNo: '6832' });  // this site ≠ the kill-switched site
    const html = await render(h);
    assert.ok(hasBanner(html, 'control-live-banner'), 'S9: green banner present (other site\'s kill)');
    assert.ok(!hasBanner(html, 'kill-banner'), 'S9: red banner absent');
});
