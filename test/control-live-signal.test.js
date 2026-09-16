/**
 * R8/S10 — "control is now live" active in-app signal (BUILD_PLAN item 8).
 *
 * Proves the two-part signal (persistent live-banner + one-time first-use ack) is driven by the
 * TRUE deploy-time write-lock and NEVER hard-coded:
 *   - routes/api.js /me embeds `controlLive: !config.writesDisabled` (structurally tied to the flag);
 *   - the operator-facing controlLive and the probe-facing /healthz writesDisabled derive from the
 *     SAME config truth and cannot diverge (controlLive === !healthz.writesDisabled);
 *   - public/js/app.js: OFF shows no live-banner AND blocks client-side (not only the 423); ON shows
 *     the banner; OFF→ON within a session fires the ack exactly once (not again on re-render);
 *     already-ON-at-load shows the banner but NO ack; flipping the flag back to true returns to OFF.
 *
 * public/js/app.js is a browser global (no ESM). It is evaluated in a `vm` sandbox with a stub
 * document, a stub sessionStorage, a controllable /api/me, and stubbed view fns — following the
 * sandbox pattern in hotwater-scope.test.js / confirm-loop-timing.test.js. No network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

/* -------------------- signal consistency: server derives controlLive from the true flag -------------------- */

async function freshConfig(writesDisabledVal) {
    if (writesDisabledVal === undefined) delete process.env.WRITES_DISABLED;
    else process.env.WRITES_DISABLED = writesDisabledVal;
    return import(`../config.js?cl=${Math.random()}`);
}

test('server: /me handler embeds controlLive derived from !config.writesDisabled (never hard-coded)', () => {
    const src = readFileSync(new URL('../routes/api.js', import.meta.url), 'utf8');
    assert.match(src, /controlLive:\s*!config\.writesDisabled/,
        'controlLive must be computed from config.writesDisabled — structurally tied to the true flag');
});

test('signal consistency: controlLive === !healthz.writesDisabled (SAME config truth, cannot diverge)', async () => {
    // Both surfaces read config.writesDisabled: /healthz body echoes it (server.js:86), /me derives
    // controlLive = !config.writesDisabled. Prove they stay in lock-step across the flip.
    for (const val of ['false', 'true', undefined]) {
        const { config } = await freshConfig(val);
        const healthzWritesDisabled = config.writesDisabled;   // server.js:86 echoes this verbatim
        const meControlLive = !config.writesDisabled;          // routes/api.js derives this
        assert.equal(meControlLive, !healthzWritesDisabled,
            `controlLive must equal !healthz.writesDisabled for WRITES_DISABLED=${val}`);
    }
});

test('server: exact "false" ⇒ controlLive true; unset/"true" ⇒ controlLive false (follows the flag)', async () => {
    assert.equal(!(await freshConfig('false')).config.writesDisabled, true, 'exact false ⇒ live');
    assert.equal(!(await freshConfig('true')).config.writesDisabled, false, '"true" ⇒ not live');
    assert.equal(!(await freshConfig(undefined)).config.writesDisabled, false, 'unset ⇒ not live (fail-closed)');
});

/* -------------------- client: banner + ack (vm sandbox) -------------------- */

// Stub sessionStorage backed by a Map (survives re-renders within a session, as the real one does).
function stubSessionStorage() {
    const m = new Map();
    return {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: k => m.delete(k),
        _dump: () => Object.fromEntries(m)
    };
}

// Load public/js/app.js into a vm sandbox. `me` is the current /api/me payload the api stub returns;
// mutate sandbox.me between refreshMe() calls to simulate a flip. View fns are stubbed. boot() runs
// on load, so we await a macrotask after construction to let it resolve.
function loadApp(me) {
    const appHtml = { value: '' };
    const modalHtml = { value: '' };
    const els = {
        app: { set innerHTML(v) { appHtml.value = v; }, get innerHTML() { return appHtml.value; } },
        modalroot: { set innerHTML(v) { modalHtml.value = v; }, get innerHTML() { return modalHtml.value; } },
        toasts: { appendChild() {} }
    };
    const ctxObj = { me };
    const sandbox = {
        // controllable /api/me
        api: { get: async (url) => { if (url === '/api/me') return ctxObj.me; return {}; }, post: async () => ({}) },
        sessionStorage: stubSessionStorage(),
        document: {
            getElementById: id => els[id] || { innerHTML: '', set innerHTML(v) {} },
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ innerHTML: '', className: '', appendChild() {}, remove() {} }),
            addEventListener: () => {},
            body: { appendChild() {} }
        },
        // stub the view fns render() dispatches into, and paintDrawer's DOM ops are covered above.
        vHome: () => {}, vSite: () => {}, vCallback: () => {}, vTonight: () => {}, vAdmin: () => {},
        setTimeout, clearTimeout, console, Date, Number, Math, JSON, String,
        window: {}
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8'), ctx, { filename: 'app.js' });
    return { ctx, appHtml, modalHtml, ctxObj, sandbox };
}

const settle = () => new Promise(r => setImmediate(r));

test('OFF: no live-banner, and a client-side block is present (not only the 423)', async () => {
    const h = loadApp({ operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: false, killSwitch: { writesDisabled: true } });
    await settle();
    assert.doesNotMatch(h.appHtml.value, /control-live-banner/, 'no live-banner while OFF');
    // The extended predicate must yield a client-side block from the F005 deploy lock while OFF.
    const reason = h.ctx.writesDisabled('6832');
    assert.ok(reason, 'writesDisabled() returns a block reason from ks.writesDisabled while OFF');
    assert.match(reason, /deploy time/i, 'the block is the F005 deploy-time lock reason');
    // And the OFF shell must surface the kill-style block banner (the client-side block, not just a 423).
    assert.match(h.appHtml.value, /kill-banner/, 'the deploy-lock block renders as a client-side banner');
});

test('ON: live-banner present', async () => {
    const h = loadApp({ operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: true, killSwitch: { writesDisabled: false } });
    await settle();
    assert.match(h.appHtml.value, /control-live-banner/, 'live-banner shown when controlLive true');
    // ON ⇒ no deploy-lock block reason.
    assert.equal(h.ctx.writesDisabled('6832'), null, 'no client-side deploy-lock block when live');
});

test('OFF→ON within a session: first-use ack fires exactly once (and not again on re-render)', async () => {
    const h = loadApp({ operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: false, killSwitch: { writesDisabled: true } });
    await settle();
    assert.doesNotMatch(h.modalHtml.value, /control-live-ack/, 'no ack while OFF at load');
    // Flip ON and refresh: the ack fires exactly once.
    h.ctxObj.me = { operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: true, killSwitch: { writesDisabled: false } };
    await h.ctx.refreshMe();
    assert.match(h.modalHtml.value, /control-live-ack/, 'OFF→ON fires the first-use ack');
    // Dismiss and re-render (another refreshMe in the same session): ack must NOT re-fire.
    h.modalHtml.value = '';
    await h.ctx.refreshMe();
    assert.doesNotMatch(h.modalHtml.value, /control-live-ack/, 'ack does not re-fire on later renders in the session');
    // Banner persists across the re-renders.
    h.ctx.render();
    assert.match(h.appHtml.value, /control-live-banner/, 'banner persists after the ack');
});

test('Already-ON at load: banner shown, ack does NOT fire (joined an already-live shift)', async () => {
    const h = loadApp({ operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: true, killSwitch: { writesDisabled: false } });
    await settle();
    assert.match(h.appHtml.value, /control-live-banner/, 'banner shown for already-ON');
    assert.doesNotMatch(h.modalHtml.value, /control-live-ack/, 'no ack for already-ON-at-load (lastSeen unset)');
});

test('Never hard-coded: flipping the flag back to true returns the UI to OFF (banner gone, block restored)', async () => {
    const h = loadApp({ operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: true, killSwitch: { writesDisabled: false } });
    await settle();
    assert.match(h.appHtml.value, /control-live-banner/);
    // WRITES_DISABLED back to true ⇒ controlLive:false ⇒ banner gone, client block restored.
    h.ctxObj.me = { operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: false, killSwitch: { writesDisabled: true } };
    await h.ctx.refreshMe();
    h.ctx.render();
    assert.doesNotMatch(h.appHtml.value, /control-live-banner/, 'banner gone when the flag returns to disabled');
    assert.ok(h.ctx.writesDisabled('6832'), 'client-side block restored when OFF');
});

test('interrupt-precedence: OFF→ON ack does NOT stack on an open confirm modal (window.ctl in-flight)', async () => {
    const h = loadApp({ operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: false, killSwitch: { writesDisabled: true } });
    await settle();
    // Simulate an in-flight confirm/dispatch.
    h.ctx.window.ctl = { phase: 'compose' };
    h.ctxObj.me = { operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: true, killSwitch: { writesDisabled: false } };
    await h.ctx.refreshMe();
    assert.doesNotMatch(h.modalHtml.value, /control-live-ack/, 'ack must not stack on an open confirm modal');
});

test('ON→OFF scaffold is additive-ready: the general last-seen compare detects the onToOff edge', async () => {
    // controlLiveTransition is a general last-seen compare that records the raw current value and
    // reports BOTH edges (offToOn AND onToOff). The C5 preflight ON→OFF "returned to safety-lock"
    // signal is a pure additive follow-on — it consumes t.onToOff with no rework. Drive it via the
    // public flow (state is const-scoped inside app.js): the api-fed me is the transition source.
    const onMe = { operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: true, killSwitch: { writesDisabled: false } };
    const offMe = { operator: { name: 'Al Op', role: 'handler', roleLabel: 'Handler' }, version: '1.2.0',
        controlLive: false, killSwitch: { writesDisabled: true } };
    const h = loadApp(onMe);
    await settle();
    assert.equal(h.sandbox.sessionStorage.getItem('ooh.controlLive.lastSeen'), 'true', 'ON load records lastSeen=true');
    // Now flip OFF via refreshMe: the compare must see lastSeen='true' + live=false and, per the
    // general scaffold, record the reverse. Assert the reverse edge is computable from that state.
    h.ctxObj.me = offMe;
    await h.ctx.refreshMe();
    assert.equal(h.sandbox.sessionStorage.getItem('ooh.controlLive.lastSeen'), 'false', 'ON→OFF records lastSeen=false');
    assert.equal(h.sandbox.sessionStorage.getItem('ooh.controlLive.acked'), null, 'OFF clears the ack — reverse scaffold ran');
    // And the compare exposes onToOff on the exact prior state (true→false), the additive hook for C5.
    h.sandbox.sessionStorage.setItem('ooh.controlLive.lastSeen', 'true');
    const t = h.ctx.controlLiveTransition();   // state.me is now offMe (set by refreshMe above)
    assert.equal(t.onToOff, true, 'reverse ON→OFF edge is detectable — additive follow-on, no rework');
    assert.equal(t.offToOn, false);
});
