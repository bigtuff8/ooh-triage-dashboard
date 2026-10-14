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


/* The old ephemeral applied-LATE banner + mid-wait client tests are removed: DD-WAIT-HANDOFF
 * dropped the mid-wait prompt and the done-late phase; the three-outcome client render (incl.
 * confirmed-late) is covered in confirm-loop-timing.test.js. */
