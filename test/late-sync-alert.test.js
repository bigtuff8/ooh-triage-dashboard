/**
 * C6/C1 — late-sync alert (durable ticket note + ephemeral in-session banner) unit tests.
 *
 * Two channels with honestly-different durability:
 *   - EPHEMERAL / in-session: a device that echoes AFTER the timeout ("late-synced") settles the
 *     client tracker to a DISTINCT 'done-late' phase with an "applied LATE" banner — never the plain
 *     "Applied" card — for a handler still on the tracker. (vm sandbox, real 2s poll on a fake clock.)
 *   - DURABLE / cross-shift: control.pollOne posts the reworded ACTIONABLE Zendesk late-sync note to
 *     the action's ticket, LAZILY creating a ticket only when a late echo needs a durable target
 *     (never one Zendesk write per benign timeout). The audit is corrected to synced-late.
 *
 * C1 KNOWN-GAP (asserts the LIMIT, not a fix): a pod restart mid-window drops the in-memory actions
 * Map + poller, so a late echo fires NO note, NO audit correction, NO alert. This documents the
 * restart hole as an EXPECTED gap under the current in-memory design — it is NOT passing behaviour;
 * it flips only when the DEFERRED Cosmos-persistence fix (C1) lands.
 *
 * Server tests drive the REAL control.dispatch()/poll loop through the fixture seam with audit,
 * zendesk and tb-client replaced by spies/controllable stubs (node --test
 * --experimental-test-module-mocks). Client tests evaluate public/js/control.js in a vm sandbox with
 * a controllable fake clock. No live portal call, no real waiting.
 */
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/* ===================== server-side: three-outcome late confirm + save-and-resume ===================== */

// Fixture mode + isolated store BEFORE importing config-backed modules. OOHDASH-123: compress the
// per-class confirm timing + fixture trajectory so a late confirm (after the confirm limit) and a
// save-and-resume play out in-test. Step 100ms → accepted at 200ms, telemetry match at 300ms; the
// IT700 confirm limit sits between (250ms) so the action goes INDETERMINATE and then CONFIRMS late.
process.env.DATA_MODE = 'fixture';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-c6-'));
process.env.WRITES_DISABLED = 'false';
process.env.SYNC_POLL_INTERVAL_MS = '10';     // base watcher tick
process.env.OOH_SIM_STEP_MS = '100';
process.env.OOH_COPY_MIN_IT700 = '0';         // keep the per-class invariant satisfied at tiny limits
process.env.OOH_CONFIRM_LIMIT_MS_IT700 = '250';
process.env.OOH_LATE_WATCH_MS_IT700 = '10000';
process.env.OOH_CONFIRM_POLL_MS_SALUS = '10';

// Audit spy — record updateOutcome calls so we can assert the confirmed-late correction.
const auditCalls = { updateOutcome: [] };
mock.module('../services/audit.js', {
    namedExports: {
        logAction: async (e) => ({ id: `audit-${Math.random().toString(16).slice(2)}`, ...e }),
        updateOutcome: async (auditId, outcome, extraDetail) => { auditCalls.updateOutcome.push({ auditId, outcome, extraDetail }); },
        attachTicket: async () => {},
        attachReconciledCallTicket: async () => {}
    }
});

// Zendesk spy — count result-note posts and lazy ticket creations without any external call.
const zdCalls = { notes: [], created: 0 };
let lazyTicketSeq = 70001;
mock.module('../services/zendesk.js', {
    namedExports: {
        addLateSyncNote: async (ticketId, action) => { zdCalls.notes.push({ ticketId, action }); },
        createLateSyncTicket: async () => { zdCalls.created += 1; return { id: lazyTicketSeq++, url: '#lazy' }; },
        resolveSiteName: async () => null,
        zendeskStatus: () => ({ mode: 'fixture', healthy: true, configured: true }),
        hhmm: () => '00:00'
    }
});

const control = await import('../services/control.js');
const resolution = await import('../services/resolution.js');
const tbClient = await import('../services/tb-client.js');

// A real online IT700 fixture (slow-echo class). Default sim trajectory confirms LATE (after the 250ms limit).
const SITE_NO = '6773';
const DEVICE_ID = 'gk-6773-salusit700-1';
const OPERATOR = { id: 'op-1', name: 'Handler One', email: 'h1@example.com' };
const SETPOINT_CMD = { command: 'setpoint', value: 22, direction: 'up' };  // 20 → 22, within ±3°C

async function dispatchOne(siteNo = SITE_NO, deviceId = DEVICE_ID) {
    const { token } = await resolution.confirmSite(siteNo, OPERATOR);
    return control.dispatch({ operator: OPERATOR, confirmToken: token, siteNo, deviceId, ...SETPOINT_CMD });
}

async function waitForState(actionId, state, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const a = control.getAction(actionId);
        if (a && a.state === state) return a;
        if (Date.now() > deadline) throw new Error(`action ${actionId} did not reach '${state}' (last: ${a?.state})`);
        await new Promise(r => setTimeout(r, 5));
    }
}

beforeEach(() => {
    auditCalls.updateOutcome.length = 0;
    zdCalls.notes.length = 0;
    zdCalls.created = 0;
    // Isolate the fixture sim so one test's confirmed telemetry can't pre-satisfy the next (same device).
    tbClient.__resetSim?.();
});

test('late confirm — an action NOT confirmed by the limit goes INDETERMINATE, then CONFIRMS late: durable note posted, audit corrected to confirmed-late', async () => {
    const action = await dispatchOne();
    // Releases immediately (slow class) as in-flight.
    assert.equal(action.state, 'in-flight');
    // Not confirmed by the 250ms limit → INDETERMINATE (never "failed", never "done").
    await waitForState(action.actionId, 'indeterminate');
    // The device then confirms on its heartbeat → CONFIRMED late.
    const confirmed = await waitForState(action.actionId, 'confirmed');
    assert.equal(confirmed.confirmedLate, true, 'a confirm after the limit is flagged late');
    assert.equal(String(confirmed.confirmedValue), '22');

    // Durable note posted (lazily created a ticket since the handler attached none), audit corrected.
    assert.ok(zdCalls.notes.length >= 1, 'a result note is posted to the ticket');
    const correction = auditCalls.updateOutcome.find(c => c.outcome === 'confirmed');
    assert.ok(correction, 'audit corrected to confirmed');
    assert.match(correction.extraDetail, /late confirmation/i, 'carries the confirmed-late marker');
});

test('save-and-resume (WU10) — a pod restart mid-watch no longer drops the result: resume re-reads the store, settles the late confirm and notes the ticket', async () => {
    // This INVERTS the old C1 known-gap: the restart hole is now closed by the OohActionInflight store.
    const action = await dispatchOne();
    // Simulate a pod restart WHILE still in flight (before the ~300ms telemetry match): drop the
    // in-memory watcher + poller. The durable in-flight record survives in OohActionInflight.
    control.__dropForRestartTest();
    assert.equal(control.getAction(action.actionId), null, 'the in-memory watch is gone after the restart');

    // Let the device confirm while nothing is watching.
    await new Promise(r => setTimeout(r, 450));
    const notesBefore = zdCalls.notes.length;

    // Resume-on-load reads the store, does one confirm read, and settles the (now confirmed) action.
    const res = await control.resumeInflight();
    assert.ok(res.resumed >= 0, 'resume ran');
    assert.ok(zdCalls.notes.length > notesBefore, 'the late result lands on the ticket after resume (restart hole closed)');
});

/* ============================ client-side: ephemeral applied-LATE banner ============================ */

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

function loadControl() {
    const clock = fakeClock();
    const rendered = { html: '' };
    const calls = { escalate: 0, posts: [], gets: [] };
    const state = {
        siteNo: '6832', confirmToken: 'tok-1',
        me: { control: { midWaitPromptMs: 30000 } },
        workspace: { site: { siteNo: '6832', siteName: 'The Red Lion', accountId: 'gk-6832' } },
        flow: { stage: 1, data: {} }
    };
    const server = { action: { actionId: 'act-1', state: 'pending', actionType: 'setpoint', slowEchoDevice: true } };
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
        closeModal: () => {}, render: () => {}, toast: () => {}, registerIssue: () => {},
        outButtons: () => '', writesDisabled: () => null,
        Date, Number, Math, JSON, String, console, window: {}
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(readFileSync(new URL('../public/js/control.js', import.meta.url), 'utf8'), ctx, { filename: 'control.js' });
    return { ctx, state, calls, rendered, clock, server };
}

// Seed the compose state and dispatch, entering the confirm/waiting phase with the poller running.
async function enterConfirm(h) {
    h.ctx.window.ctl = { device: { deviceId: 'IT500-BAR-6832', zone: 'Bar', telemetry: {} }, mode: 'up', phase: 'compose', error: null, action: null, val: 19, hold: 'none' };
    await h.ctx.ctlSend();
}

test('in-session late banner — a late echo (state late-synced) settles the tracker to a DISTINCT applied-LATE banner (phase done-late), not a plain "Applied"', async () => {
    const h = loadControl();
    await enterConfirm(h);
    assert.equal(h.ctx.window.ctl.phase, 'confirm');

    // The device echoes LATE. The 2s self-poll observes late-synced.
    h.server.action.state = 'late-synced';
    h.server.action.settledAt = new Date().toISOString();
    h.clock.tick(2000);
    await new Promise(r => setImmediate(r));

    assert.equal(h.ctx.window.ctl.phase, 'done-late', 'distinct done-late phase, not done');
    assert.match(h.rendered.html, /sync-applied-late/, 'the applied-LATE banner renders');
    assert.match(h.rendered.html, /Applied LATE/i);
    assert.match(h.rendered.html, /reported as/i);
    assert.match(h.rendered.html, /actioned twice/i, 'warns to check nothing was actioned twice');
    assert.doesNotMatch(h.rendered.html, /data-testid="sync-applied"/, 'NOT the plain Applied card');
});

test('interrupt-precedence — a late echo supersedes a stale mid-wait card: settling to done-late clears the mid-wait prompt', async () => {
    const h = loadControl();
    await enterConfirm(h);
    // Let the mid-wait prompt fire first (still pending at 30s).
    h.clock.tick(30000);
    await new Promise(r => setImmediate(r));
    assert.match(h.rendered.html, /sync-midwait/, 'mid-wait card is showing');

    // Now the device echoes late — the poller settles to done-late and clears the mid-wait card.
    h.server.action.state = 'late-synced';
    h.server.action.settledAt = new Date().toISOString();
    h.clock.tick(2000);
    await new Promise(r => setImmediate(r));

    assert.equal(h.ctx.window.ctl.phase, 'done-late');
    assert.equal(h.ctx.window.ctl.midWait, false, 'mid-wait state cleared on settle');
    assert.doesNotMatch(h.rendered.html, /sync-midwait/, 'the applied-LATE banner supersedes the stale mid-wait card');
    assert.match(h.rendered.html, /sync-applied-late/);
});
