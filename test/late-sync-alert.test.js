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

/* ============================ server-side: durable note + lazy ticket ============================ */

// Fixture mode + isolated store BEFORE importing config-backed modules. Tiny timers so the real
// poll loop transitions pending → timeout → late-synced within the test with a short fake wait.
process.env.DATA_MODE = 'fixture';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-c6-'));
// OOHDASH-12 made writes fail-closed by default; these dispatch tests need writes enabled.
process.env.WRITES_DISABLED = 'false';
process.env.SYNC_TIMEOUT_MS = '0';          // first poll after dispatch → timeout immediately
process.env.SYNC_POLL_INTERVAL_MS = '5';    // sweep fast so the test wait is short

// Controllable device sync, keyed by deviceId so two in-flight actions on different devices can be
// steered independently (a shared global would leak one action's echo onto another). Default pending.
let syncByDevice = {};
function setSync(deviceId, result) { syncByDevice[deviceId] = result; }
mock.module('../services/tb-client.js', {
    namedExports: {
        writeSharedAttribute: async () => {},
        readControlState: async (device) => ({ ...(syncByDevice[device.deviceId] || { sync: 'pending', reported: null }) }),
        tbStatus: () => ({ mode: 'fixture', read: true, write: true })
    }
});

// Audit spy — record updateOutcome calls so we can assert the synced-late correction.
const auditCalls = { updateOutcome: [] };
mock.module('../services/audit.js', {
    namedExports: {
        logAction: async (e) => ({ id: `audit-${Math.random().toString(16).slice(2)}`, ...e }),
        updateOutcome: async (auditId, outcome, extraDetail) => { auditCalls.updateOutcome.push({ auditId, outcome, extraDetail }); },
        attachTicket: async () => {},
        attachReconciledCallTicket: async () => {}
    }
});

// Zendesk spy — count late-note posts and lazy ticket creations without any external call.
const zdCalls = { notes: [], created: 0 };
let lazyTicketSeq = 70001;
mock.module('../services/zendesk.js', {
    namedExports: {
        addLateSyncNote: async (ticketId, action) => { zdCalls.notes.push({ ticketId, action }); },
        createLateSyncTicket: async () => ({ id: lazyTicketSeq++, url: '#lazy' }),
        // Other exports the control.js dependency graph imports (e.g. bridge.js) must be present on
        // the mock or the module fails to instantiate — these are inert stubs, not under test here.
        resolveSiteName: async () => null,
        zendeskStatus: () => ({ mode: 'fixture', healthy: true, configured: true }),
        hhmm: () => '00:00'
    }
});

const control = await import('../services/control.js');
const resolution = await import('../services/resolution.js');

const SITE_NO = '6832';
const DEVICE_ID = 'IT500-BAR-6832';
const SITE_NO_B = '6851';
const DEVICE_ID_B = 'IT500-BAR-6851';
const OPERATOR = { id: 'op-1', name: 'Handler One', email: 'h1@example.com' };
const SETPOINT_CMD = { command: 'setpoint', value: 19, direction: 'up' };

async function dispatchOne(siteNo = SITE_NO, deviceId = DEVICE_ID) {
    const { token } = await resolution.confirmSite(siteNo, OPERATOR);
    return control.dispatch({ operator: OPERATOR, confirmToken: token, siteNo, deviceId, ...SETPOINT_CMD });
}

// Polls control.getAction until it reaches `state` (or throws after a short deadline). Lets the real
// setInterval poll loop advance in real time — but the interval is 5ms so this is fast and stable.
async function waitForState(actionId, state, timeoutMs = 2000) {
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
    syncByDevice = {};
});

test('durable note — a timed-out action that echoes late posts the reworded actionable note and corrects the audit to synced-late', async () => {
    const action = await dispatchOne();
    // First poll: SYNC_TIMEOUT_MS=0 so it flips to timeout.
    await waitForState(action.actionId, 'timeout');
    // Simulate the handler having escalated (a ticket already exists on the action).
    control.attachTicket(action.actionId, 45097);
    // Device now echoes late.
    setSync(DEVICE_ID, { sync: 'synced', reported: 19 });
    await waitForState(action.actionId, 'late-synced');

    // Durable note posted to the EXISTING ticket (no lazy create needed).
    assert.equal(zdCalls.notes.length, 1, 'exactly one late-sync note posted');
    assert.equal(zdCalls.notes[0].ticketId, 45097, 'note lands on the pre-existing ticket');

    // Audit corrected: timeout row updated to synced with the late marker.
    const correction = auditCalls.updateOutcome.find(c => c.outcome === 'synced');
    assert.ok(correction, 'audit corrected to synced');
    assert.match(correction.extraDetail, /late device confirmation/i, 'carries the synced-late marker');
});

test('lazy ticket target — a late echo with NO existing ticket lazily creates one to carry the note; a benign timeout that never echoes creates nothing', async () => {
    const before = lazyTicketSeqUsed();
    // Case A: benign timeout on device B — it never echoes. No ticket, no note should ever be created.
    const benign = await dispatchOne(SITE_NO_B, DEVICE_ID_B);
    await waitForState(benign.actionId, 'timeout');
    // Give the poller several sweeps while device B stays 'pending' echo — it must NOT create a ticket.
    await new Promise(r => setTimeout(r, 40));
    assert.equal(zdCalls.notes.length, 0, 'a benign timeout writes no late note');
    assert.equal(lazyTicketSeqUsed() - before, 0, 'a benign timeout creates no lazy ticket');

    // Case B: late echo on device A with no ticket attached — lazy create fires exactly once.
    const late = await dispatchOne(SITE_NO, DEVICE_ID);
    await waitForState(late.actionId, 'timeout');
    assert.equal(control.getAction(late.actionId).ticketId, null, 'no ticket before the late echo');
    setSync(DEVICE_ID, { sync: 'synced', reported: 19 });
    await waitForState(late.actionId, 'late-synced');

    assert.equal(lazyTicketSeqUsed() - before, 1, 'exactly one ticket lazily created — only when the late echo needed a target');
    assert.equal(zdCalls.notes.length, 1, 'the note posts to the lazily-created ticket');
    assert.ok(zdCalls.notes[0].ticketId >= 70001, 'note lands on the lazily-created ticket id');
});

// Helper: how many lazy tickets were created this run (seq started at 70001).
function lazyTicketSeqUsed() { return lazyTicketSeq - 70001; }

/* ---- C1 KNOWN-GAP: pod restart mid-window drops the watch → NO note, NO correction, NO alert ---- */

test('C1 KNOWN-GAP (asserts the LIMIT, not a fix) — a pod restart mid-window drops the in-memory watch: a later echo fires NO note, NO audit correction, NO alert', async () => {
    const action = await dispatchOne();
    await waitForState(action.actionId, 'timeout');
    control.attachTicket(action.actionId, 45102);

    // Baseline: nothing has fired yet for THIS action (it only timed out).
    const notesBefore = zdCalls.notes.filter(n => n.ticketId === 45102).length;
    const correctionsBefore = auditCalls.updateOutcome.filter(c => c.outcome === 'synced').length;

    // Simulate a pod restart: the in-memory actions Map + poller are gone. control.__dropForRestartTest
    // is a TEST-ONLY seam that clears exactly what a process exit would drop. There is NO rehydrate
    // (that is the DEFERRED Cosmos fix), so the watch is permanently lost.
    control.__dropForRestartTest();
    assert.equal(control.getAction(action.actionId), null, 'the action is gone after the simulated restart — watch dropped');

    // The device now echoes late — but nothing is observing it anymore.
    setSync(DEVICE_ID, { sync: 'synced', reported: 19 });
    await new Promise(r => setTimeout(r, 60)); // ample time for a poll sweep, had one survived

    // KNOWN, EXPECTED GAP — this is the C1 hole, NOT passing behaviour. It flips to the opposite
    // assertion only once Cosmos persistence of in-flight actions lands (C1 stays OPEN until then).
    assert.equal(zdCalls.notes.filter(n => n.ticketId === 45102).length, notesBefore, 'C1 GAP: no late note fires after a restart');
    assert.equal(auditCalls.updateOutcome.filter(c => c.outcome === 'synced').length, correctionsBefore, 'C1 GAP: the audit stays uncorrected after a restart');
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
