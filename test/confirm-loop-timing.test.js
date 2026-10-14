/**
 * OOHDASH-123 Rosetta Stone — per-class confirm timing + the three-outcome client tracker.
 *
 * Replaces the old R11/C7 mid-wait decision-prompt suite: DD-WAIT-HANDOFF removed the mid-wait prompt
 * (the handler is released at once for slow classes) and DD-RESEND-UX removed every resend affordance.
 *
 * Covers:
 *   - config: the per-class timing block + its invariant; the legacy syncTimeoutMs/midWaitPromptMs are gone;
 *   - /me no longer ships a mid-wait knob;
 *   - services/control.js stamps confirmLimitAt/lateWatchUntil off the per-class contract (not a global
 *     timeout) and NOT CONFIRMED fires at the confirm limit;
 *   - public/js/control.js renders exactly the three outcomes, shows no resend control, and never prints
 *     a raw gate:/vendor: string (the translated operatorError is shown instead).
 *
 * public/js/control.js is a browser global (no ESM), evaluated in a vm sandbox with stub globals and a
 * controllable fake clock. No network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

let importCounter = 0;
async function freshConfig(overrides = {}) {
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    return import(`../config.js?clt=${++importCounter}`);
}

/* -------------------- config: per-class timing + invariant -------------------- */

test('config: per-class control timings default correctly (design §5)', async () => {
    const { config } = await freshConfig();
    const c = config.control.classes;
    assert.equal(c.tuya.confirmLimitMs, 10000);
    assert.equal(c.tuya.copyMinutes, null);
    assert.equal(c['salus-it700'].confirmLimitMs, 2700000);
    assert.equal(c['salus-it700'].copyMinutes, 5);
    assert.equal(c['salus-it500'].confirmLimitMs, 2100000);
    assert.equal(c['salus-it500'].copyMinutes, 15);
    assert.equal(c.monitor.offlineHours, 48);
    // the legacy global timers are gone
    assert.equal(config.control.syncTimeoutMs, undefined);
    assert.equal(config.control.midWaitPromptMs, undefined);
});

test('config invariant: a confirm limit below copyMinutes*60000 is rejected', async () => {
    const { validateConfig } = await freshConfig({ OOH_CONFIRM_LIMIT_MS_IT700: '1000' }); // < 5min copy
    assert.ok(validateConfig().some(p => p.includes('salus-it700')));
    delete process.env.OOH_CONFIRM_LIMIT_MS_IT700;
});

test('/me no longer ships a mid-wait knob (DD-WAIT-HANDOFF)', () => {
    const apiSrc = readFileSync(new URL('../routes/api.js', import.meta.url), 'utf8');
    assert.doesNotMatch(apiSrc, /midWaitPromptMs/, '/me must not carry midWaitPromptMs any more');
});

/* -------------------- source invariants: control plane + no resend -------------------- */

test('server lifecycle: control.js stamps confirmLimitAt/lateWatchUntil off the per-class contract; NOT CONFIRMED at the limit', () => {
    const src = readFileSync(new URL('../services/control.js', import.meta.url), 'utf8');
    assert.match(src, /confirmLimitAt:\s*dispatchTs\s*\+\s*confirmLimitMs/);
    assert.match(src, /lateWatchUntil:\s*dispatchTs\s*\+\s*lateWatchMs/);
    assert.match(src, /a\.state\s*===\s*'in-flight'\s*&&\s*Date\.now\(\)\s*>\s*a\.confirmLimitAt/);
    assert.doesNotMatch(src, /midWaitPromptMs/);
});

test('no resend affordance anywhere in the client (DD-RESEND-UX)', () => {
    const src = readFileSync(new URL('../public/js/control.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /ctlRetry|ctlWaitMore|ctlMidWait/, 'the resend / keep-waiting / mid-wait functions are removed');
    assert.doesNotMatch(src, />\s*Resend\s*</, 'no Resend button');
    assert.doesNotMatch(src, />\s*Try again\s*</, 'no Try again button');
});

/* -------------------- client: three-outcome render (vm sandbox) -------------------- */

function loadControl(serverAction) {
    const rendered = { html: '' };
    const calls = { posts: [], gets: [] };
    const server = { action: serverAction };
    const state = {
        siteNo: '6261', confirmToken: 'tok-1',
        workspace: { site: { siteNo: '6261', siteName: 'The Red Lion', accountId: 'gk-6261' } },
        flow: { stage: 1, data: {} }
    };
    const api = {
        post: async (url) => { calls.posts.push(url); if (url === '/api/control/dispatch') return { action: { ...server.action } }; return { ticket: { id: 901 } }; },
        get: async (url) => { calls.gets.push(url); return { action: { ...server.action } }; }
    };
    const sandbox = {
        state, api, server, calls, rendered,
        setTimeout: () => ({ unref() {} }), clearTimeout: () => {}, setInterval: () => ({ unref() {} }), clearInterval: () => {},
        esc: s => String(s), openModal: (html) => { rendered.html = html; }, closeModal: () => {},
        render: () => {}, toast: () => {}, registerIssue: () => {}, outButtons: () => '',
        notesDraftClear: () => {}, writesDisabled: () => null,
        Date, Number, Math, JSON, String, console, window: {}
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(readFileSync(new URL('../public/js/control.js', import.meta.url), 'utf8'), ctx, { filename: 'control.js' });
    return { ctx, state, calls, rendered, server };
}

async function sendWith(h, mode = 'switchoff') {
    h.ctx.window.ctl = { device: { deviceId: 'gk-6237-externallighting-1', zone: 'Car park', telemetry: { switch_1: true } }, mode, phase: 'compose', error: null, action: null, val: false, hold: 'none' };
    await h.ctx.ctlSend();
}

test('client: a confirmed outcome renders the green confirmed card (the only success)', async () => {
    const h = loadControl({ actionId: 'a1', state: 'confirmed', status: 'accepted', confirmedValue: false, actionType: 'switch-off', slowEchoDevice: false, copyMinutes: null });
    await sendWith(h);
    assert.match(h.rendered.html, /sync-confirmed/);
});

test('client: a non-delivery renders the plain translated sentence and NEVER a raw gate:/vendor: string', async () => {
    const h = loadControl({ actionId: 'a2', state: 'non-delivery', status: 'pending', operatorError: 'Could not reach the device right now — try again in a moment.', lastErrorRaw: 'vendor: No active Tuya session owns device 6237', actionType: 'switch-off', slowEchoDevice: false });
    await sendWith(h);
    assert.match(h.rendered.html, /sync-notdelivered/);
    assert.match(h.rendered.html, /Could not reach the device/);
    assert.doesNotMatch(h.rendered.html, /vendor:/, 'the raw vendor string must never appear on screen');
    assert.doesNotMatch(h.rendered.html, /gate:/, 'the raw gate string must never appear on screen');
});

test('client: an indeterminate outcome shows "not confirmed" with NO resend button', async () => {
    const h = loadControl({ actionId: 'a3', state: 'indeterminate', status: 'accepted', operatorError: "We sent the command but the device hasn't confirmed it yet.", actionType: 'switch-off', slowEchoDevice: false });
    await sendWith(h);
    assert.match(h.rendered.html, /sync-notconfirmed/);
    assert.doesNotMatch(h.rendered.html, /Resend/i, 'no resend affordance on a not-confirmed outcome');
});

test('client: a slow (Salus) class is released at once with the "carry on" handoff card', async () => {
    const h = loadControl({ actionId: 'a4', state: 'in-flight', status: 'pending', slowEchoDevice: true, copyMinutes: 5, actionType: 'setpoint-up' });
    await sendWith(h, 'up');
    assert.match(h.rendered.html, /sync-sent-slow/);
    assert.match(h.rendered.html, /about\s*<b>5 minutes/);
});
