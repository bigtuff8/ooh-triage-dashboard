/**
 * R11/C7 — confirm-loop timing (mid-wait decision prompt) unit tests.
 *
 * Proves the client-side mid-wait prompt without touching the server clock:
 *   - config invariant `0 < midWaitPromptMs <= syncTimeoutMs` enforced; default 30000;
 *   - /api/me delivers control.midWaitPromptMs to the client;
 *   - the prompt fires at midWaitPromptMs while the action is still pending, rendering the
 *     three-choice decision card;
 *   - keep-on-hold dismisses (still polling), escalate → ctlEscalate, stop-waiting → immediate
 *     timeout treatment (no residual wait to 90s);
 *   - the prompt is suppressed when the action settles before the timer fires;
 *   - the server lifecycle (services/control.js) syncTimeoutMs/lateSyncWatchMs behaviour is
 *     untouched — the 90s timeout and 10-min watch fire off config exactly as before.
 *
 * public/js/control.js is a browser global (no ESM), so it is evaluated in a `vm` sandbox with
 * stub globals and a CONTROLLABLE fake clock (setTimeout/clearTimeout/setInterval intercepted) so
 * the mid-wait horizon can be advanced deterministically with no real waiting. No network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

/* -------------------- config invariant + default -------------------- */

let importCounter = 0;
async function freshConfig(overrides = {}) {
    for (const k of ['MID_WAIT_PROMPT_MS', 'SYNC_TIMEOUT_MS']) delete process.env[k];
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    return import(`../config.js?tmw=${++importCounter}`);
}

test('config: midWaitPromptMs defaults to 30000', async () => {
    const { config } = await freshConfig();
    assert.equal(config.control.midWaitPromptMs, 30000);
});

test('config invariant: valid when 0 < midWaitPromptMs <= syncTimeoutMs', async () => {
    const { config, validateConfig } = await freshConfig({ MID_WAIT_PROMPT_MS: '30000', SYNC_TIMEOUT_MS: '90000' });
    assert.ok(config.control.midWaitPromptMs <= config.control.syncTimeoutMs);
    assert.ok(!validateConfig().some(p => p.includes('MID_WAIT_PROMPT_MS')));
});

test('config invariant: midWaitPromptMs > syncTimeoutMs is rejected', async () => {
    const { validateConfig } = await freshConfig({ MID_WAIT_PROMPT_MS: '120000', SYNC_TIMEOUT_MS: '90000' });
    assert.ok(validateConfig().some(p => p.includes('MID_WAIT_PROMPT_MS')));
});

test('config invariant: midWaitPromptMs = 0 is rejected', async () => {
    const { validateConfig } = await freshConfig({ MID_WAIT_PROMPT_MS: '0' });
    assert.ok(validateConfig().some(p => p.includes('MID_WAIT_PROMPT_MS')));
});

test('config invariant: midWaitPromptMs == syncTimeoutMs is allowed (boundary)', async () => {
    const { validateConfig } = await freshConfig({ MID_WAIT_PROMPT_MS: '90000', SYNC_TIMEOUT_MS: '90000' });
    assert.ok(!validateConfig().some(p => p.includes('MID_WAIT_PROMPT_MS')));
});

/* -------------------- /api/me delivery -------------------- */

test('/api/me delivers control.midWaitPromptMs to the client', async () => {
    process.env.DATA_MODE = 'fixture';
    delete process.env.MID_WAIT_PROMPT_MS;
    // Import a fresh api module bound to a fresh config so the /me payload reflects the default.
    const { config } = await import(`../config.js?me=${++importCounter}`);
    // The /me handler reads config.control.midWaitPromptMs directly; assert the source value the
    // handler serialises (routes/api.js embeds `control: { midWaitPromptMs: config.control.midWaitPromptMs }`).
    const apiSrc = readFileSync(new URL('../routes/api.js', import.meta.url), 'utf8');
    assert.match(apiSrc, /control:\s*\{\s*midWaitPromptMs:\s*config\.control\.midWaitPromptMs\s*\}/,
        '/me handler must embed control.midWaitPromptMs on the payload');
    assert.equal(config.control.midWaitPromptMs, 30000);
});

/* -------------------- client mid-wait timing (vm sandbox + fake clock) -------------------- */

// A deterministic fake clock: setTimeout/setInterval register callbacks; tick(ms) advances time
// and fires any timers whose delay has elapsed. clearTimeout/clearInterval cancel them.
function fakeClock() {
    let now = 0, seq = 0;
    const timers = new Map();
    return {
        setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + (ms || 0), repeat: false }); return { id, unref() {} }; },
        clearTimeout: (t) => { if (t) timers.delete(t.id ?? t); },
        setInterval: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + (ms || 0), every: ms || 0, repeat: true }); return { id, unref() {} }; },
        clearInterval: (t) => { if (t) timers.delete(t.id ?? t); },
        tick(ms) {
            const target = now + ms;
            // Fire every due timer (one-shots once, intervals repeatedly) up to `target`, honouring
            // fire order by scheduled time. Async callbacks resolve on the microtask queue between
            // ticks (tests await a macrotask after ticking).
            let guard = 0;
            for (;;) {
                let next = null;
                for (const [id, tm] of timers) {
                    if (tm.at <= target && (!next || tm.at < next.tm.at)) next = { id, tm };
                }
                if (!next || ++guard > 10000) break;
                now = next.tm.at;
                if (next.tm.repeat) next.tm.at += next.tm.every || 1;
                else timers.delete(next.id);
                next.tm.fn();
            }
            now = target;
        },
        pendingOneShots: () => [...timers.values()].filter(t => !t.repeat).length
    };
}

// Load public/js/control.js into a vm sandbox with stub globals and the fake clock. Returns the
// context plus captured render HTML and the escalate/api call log.
function loadControl({ meControl } = {}) {
    const clock = fakeClock();
    const rendered = { html: '' };
    const calls = { escalate: 0, posts: [], gets: [] };
    const state = {
        siteNo: '6832',
        confirmToken: 'tok-1',
        me: { control: meControl ?? { midWaitPromptMs: 30000 } },
        workspace: { site: { siteNo: '6832', siteName: 'The Red Lion', accountId: 'gk-6832' } },
        flow: { stage: 1, data: {} }
    };
    // api stub: dispatch returns a pending action; the action-poll get returns whatever the test
    // has queued as the current server state.
    const server = { action: { actionId: 'act-1', state: 'pending', actionType: 'setpoint', slowEchoDevice: false } };
    const api = {
        post: async (url) => {
            calls.posts.push(url);
            if (url === '/api/control/dispatch') return { action: { ...server.action } };
            if (url.endsWith('/wait')) return { action: { ...server.action, state: 'pending' } };
            return { ticket: { id: 901 }, p1: null };
        },
        get: async (url) => { calls.gets.push(url); return { action: { ...server.action } }; }
    };
    const sandbox = {
        state, api, server, calls, rendered, clock,
        setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
        setInterval: clock.setInterval, clearInterval: clock.clearInterval,
        esc: s => String(s),
        openModal: (html) => { rendered.html = html; },
        closeModal: () => {},
        render: () => {},
        toast: () => {},
        registerIssue: () => {},
        outButtons: () => '',
        writesDisabled: () => null,
        Date, Number, Math, JSON, String, console,
        // ctlEscalate is defined in control.js; override AFTER load to count invocations.
        window: {}
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(readFileSync(new URL('../public/js/control.js', import.meta.url), 'utf8'), ctx, { filename: 'control.js' });
    // Count escalate invocations without losing the teardown it performs.
    const realEscalate = ctx.ctlEscalate;
    ctx.ctlEscalate = async (...a) => { calls.escalate += 1; return realEscalate(...a); };
    ctx.window.ctlEscalate = ctx.ctlEscalate;
    return { ctx, state, calls, rendered, clock, server };
}

// Enter the confirm/waiting phase: seed window.ctl as ctlSend's compose path would, then run
// ctlSend to dispatch and arm the mid-wait timer.
async function enterConfirm(h) {
    h.ctx.window.ctl = { device: { deviceId: 'IT500-BAR-6832', zone: 'Bar', telemetry: {} }, mode: 'up', phase: 'compose', error: null, action: null, val: 19, hold: 'none' };
    await h.ctx.ctlSend();
}

test('mid-wait prompt fires at midWaitPromptMs while still pending → three-choice card renders', async () => {
    const h = loadControl();
    await enterConfirm(h);
    assert.equal(h.ctx.window.ctl.phase, 'confirm');
    // Before the horizon: no card.
    h.clock.tick(29000);
    assert.doesNotMatch(h.rendered.html, /sync-midwait/);
    // At the horizon: the decision card renders with all three choices.
    h.clock.tick(1000);
    assert.match(h.rendered.html, /sync-midwait/, 'mid-wait card renders at the horizon');
    assert.match(h.rendered.html, /midwait-hold/);
    assert.match(h.rendered.html, /midwait-stop/);
    assert.match(h.rendered.html, /midwait-escalate/);
    assert.equal(h.ctx.window.ctl.midWait, true);
});

test('keep-on-hold: dismisses the card, stays confirming, timer not re-armed', async () => {
    const h = loadControl();
    await enterConfirm(h);
    h.clock.tick(30000);
    assert.match(h.rendered.html, /sync-midwait/);
    h.ctx.ctlMidWaitHold();
    assert.equal(h.ctx.window.ctl.midWait, false);
    assert.equal(h.ctx.window.ctl.phase, 'confirm', 'still waiting');
    assert.doesNotMatch(h.rendered.html, /sync-midwait/, 'card dismissed');
    // No further one-shot mid-wait timer pending (not nagged again for this window).
    assert.equal(h.clock.pendingOneShots(), 0);
});

test('escalate: mid-wait escalate routes to ctlEscalate', async () => {
    const h = loadControl();
    await enterConfirm(h);
    h.clock.tick(30000);
    await h.ctx.ctlEscalate();
    assert.equal(h.calls.escalate, 1, 'ctlEscalate invoked');
});

test('stop-waiting: adopts timeout treatment immediately without waiting the residual to 90s', async () => {
    const h = loadControl();
    await enterConfirm(h);
    h.clock.tick(30000);
    assert.match(h.rendered.html, /sync-midwait/);
    h.ctx.ctlMidWaitStop();
    assert.equal(h.ctx.window.ctl.phase, 'timeout', 'timeout treatment adopted at 30s, not 90s');
    // The timeout card's honest "keep watching in the background" tone is shown.
    assert.match(h.rendered.html, /sync-timeout/);
    assert.match(h.rendered.html, /keep watching in the background/i);
});

test('suppressed on early settle: action settles before the horizon → card never renders', async () => {
    const h = loadControl();
    await enterConfirm(h);
    // The real 2s client poller is running. Settle the server BEFORE the 30s horizon, then let the
    // poller observe it: it flips to 'done' and calls clearCtlMidWait, cancelling the armed prompt.
    h.server.action.state = 'synced';
    h.server.action.settledAt = new Date().toISOString();
    h.clock.tick(2000);           // fire one poll cycle
    await new Promise(r => setImmediate(r));   // let the async poll body resolve
    assert.equal(h.ctx.window.ctl.phase, 'done', 'poller observed the early settle');
    // Now advance well past the mid-wait horizon: the prompt must never appear.
    h.clock.tick(60000);
    await new Promise(r => setImmediate(r));
    assert.doesNotMatch(h.rendered.html, /sync-midwait/, 'no mid-wait card once settled early');
    assert.notEqual(h.ctx.window.ctl.midWait, true);
});

test('mid-wait card cannot stack on the confirm modal (renders only in confirm sync-tracker phase)', async () => {
    const h = loadControl();
    // In compose (the confirm modal) the timer guard refuses to show the card.
    h.ctx.window.ctl = { device: { deviceId: 'd', zone: 'Bar', telemetry: {} }, mode: 'up', phase: 'compose', action: null, val: 19, hold: 'none', midWait: false };
    h.ctx.armCtlMidWait();
    h.clock.tick(60000);
    assert.notEqual(h.ctx.window.ctl.midWait, true, 'timer must not raise the card while the confirm/compose modal is open');
});

/* -------------------- server lifecycle unchanged -------------------- */

test('server lifecycle unchanged: control.js still stamps deadline/watchUntil off config and times out at syncTimeoutMs', async () => {
    // Static assertion that the server action lifecycle was NOT altered by this item — the deadline
    // is still config.control.syncTimeoutMs, the watch is still config.control.lateSyncWatchMs, and
    // the timeout still fires at the deadline. (Behavioural single-use/late-sync coverage lives in
    // control-single-use.test.js; here we guard against a stray edit to the server clock.)
    const src = readFileSync(new URL('../services/control.js', import.meta.url), 'utf8');
    assert.match(src, /deadline:\s*Date\.now\(\)\s*\+\s*config\.control\.syncTimeoutMs/, 'deadline still off syncTimeoutMs');
    assert.match(src, /watchUntil:\s*Date\.now\(\)\s*\+\s*config\.control\.lateSyncWatchMs/, 'watch still off lateSyncWatchMs');
    assert.match(src, /a\.state\s*===\s*'pending'\s*&&\s*Date\.now\(\)\s*>\s*a\.deadline/, 'timeout still fires at the deadline');
    // No mid-wait knob leaked into the server lifecycle.
    assert.doesNotMatch(src, /midWaitPromptMs/, 'the mid-wait prompt is client-only — must not appear in services/control.js');
});
