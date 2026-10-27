/**
 * OOHDASH-153 — P1 log (Approach B clean-up).
 *
 * Contains:
 *   - Two transcript tests moved from p1-dispatch-honesty.test.js (Change 1 assertions:
 *     the neutral P1 transcript line and the Outcome: anchor freeze guard — these remain
 *     true and are kept as regression tests).
 *   - Unit tests for services/p1-log.js: recordP1Raised, p1Log, acknowledgeP1.
 *   - Source guards: no false text claims in flows.js, D2 sentence appears exactly 7 times,
 *     no escalation.js import and no addP1DispatchNote anywhere in routes/ or services/.
 *
 * Fixture mode + isolated store BEFORE importing config-backed modules. No network.
 */
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

process.env.DATA_MODE = 'fixture';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-p1log-'));
process.env.WRITES_DISABLED = 'false';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ============================================================
   Moved from p1-dispatch-honesty.test.js — Change 1 assertions
   ============================================================ */

// buildOutcomeTranscript is a pure function; drives the [TRG] first-comment transcript steps.
const { buildOutcomeTranscript } = await import('../routes/api.js');
const { hhmm } = await import('../services/zendesk.js');

test('Change 1 (kept): the P1 transcript line is NEUTRAL (P1 raised) — does not falsely assert an SMS was dispatched', () => {
    const steps = buildOutcomeTranscript({ action: null, type: 'escalate-p1', siteNo: '6832', siteName: 'The Red Lion', detail: 'Kitchen off during service', outcomeTime: new Date().toISOString() });
    const joined = steps.map(s => s.text).join('\n');
    assert.doesNotMatch(joined, /SMS dispatched/i, 'the false unconditional "SMS dispatched" claim is gone');
    assert.match(joined, /P1 escalation raised/i, 'a neutral, true-at-build-time "P1 escalation raised" line is present');
});

test('Change 1 freeze guard (kept): the neutral P1 line does not perturb the Outcome: anchor parse', async () => {
    const zendesk = await import('../services/zendesk.js');
    const steps = buildOutcomeTranscript({ action: null, type: 'escalate-p1', siteNo: '6832', siteName: 'The Red Lion', detail: 'stock at risk', outcomeTime: new Date().toISOString() });
    const t = await zendesk.createOutcomeTicket({
        operator: { name: 'Handler One' }, siteNo: '6832', siteName: 'The Red Lion',
        subject: 'Refrigeration failure', summary: 'Refrigeration failure', transcript: steps,
        callerWords: 'freezer is warming', outcomeType: 'escalate-p1', priority: 'urgent', extraTags: ['ooh_p1']
    });
    const thread = await zendesk.getFeedbackThread(t.id);
    const first = thread[0].body;
    const m = first.match(/Outcome:\s*([\w-]+)/);
    assert.ok(m, 'the Outcome: anchor still parses');
    assert.equal(m[1], 'escalate-p1', 'the outcome code is captured intact — freeze rule preserved');
    assert.match(first, /P1 escalation raised/i);
    assert.doesNotMatch(first, /SMS dispatched/i);
});

/* ============================================================
   services/p1-log.js unit tests
   ============================================================ */

const logUpserts = [];
let logStoreThrows = false;
const logAlerts = [];

mock.module('../services/store.js', {
    namedExports: {
        collection: async () => ({
            upsert: async (e) => {
                if (logStoreThrows) throw new Error('store write failed');
                logUpserts.push(e);
                return e;
            },
            get: async (id) => logUpserts.find(e => e.id === id) ?? null,
            query: async () => [...logUpserts]
        }),
        ConcurrencyError: class ConcurrencyError extends Error {}
    }
});
mock.module('../services/metrics.js', {
    namedExports: {
        raiseAlert: (k, m) => logAlerts.push({ k, m }),
        activeAlerts: () => [],
        clearAlert: () => {}
    }
});

// Cache-bust to get a fresh instance bound to the mocked store/metrics.
const p1LogMod = await import('../services/p1-log.js?v=mock');

function resetCaptures() {
    logUpserts.length = 0;
    logAlerts.length = 0;
    logStoreThrows = false;
}

const P1_ARGS = { operator: { name: 'Handler One' }, siteNo: '6832', siteName: 'The Red Lion', ticketId: 55501, summary: 'Kitchen off during service' };

test('recordP1Raised: writes the positive status text to OohSmsLog', async () => {
    resetCaptures();
    const entry = await p1LogMod.recordP1Raised(P1_ARGS);
    assert.equal(logUpserts.length, 1, 'one upsert written');
    assert.equal(logUpserts[0].status, 'P1 ticket raised with ooh_p1 tag; OOH side complete; IoT Support Dashboard will page the on-duty manager.');
    assert.equal(entry.ticketId, 55501);
    assert.equal(entry.siteNo, '6832');
    assert.ok(entry.dispatchedAt, 'dispatchedAt is set (metrics SLA compat)');
    assert.ok(entry.OohP1EscalationLink, 'escalation link is set');
});

test('recordP1Raised: no SMS-specific fields on the entry', async () => {
    resetCaptures();
    const entry = await p1LogMod.recordP1Raised(P1_ARGS);
    assert.equal(entry.sentTo, undefined, 'sentTo is absent');
    assert.equal(entry.sentToNumber, undefined, 'sentToNumber is absent');
    assert.equal(entry.provider, undefined, 'provider is absent');
    assert.equal(entry.dispatchOk, undefined, 'dispatchOk is absent');
    assert.equal(entry.origin, undefined, 'origin is absent');
});

test('recordP1Raised: store failure never throws — raises p1-log-write-failed alert', async () => {
    resetCaptures();
    logStoreThrows = true;
    let threw = false;
    let entry;
    try {
        entry = await p1LogMod.recordP1Raised(P1_ARGS);
    } catch {
        threw = true;
    }
    assert.equal(threw, false, 'store failure never throws out of recordP1Raised');
    assert.ok(entry, 'the entry is still returned');
    assert.ok(logAlerts.some(a => a.k === 'p1-log-write-failed'), 'a p1-log-write-failed alert was raised');
});

test('acknowledgeP1: sets OohP1AckAt and OohP1AckBy on the record', async () => {
    resetCaptures();
    const e = await p1LogMod.recordP1Raised(P1_ARGS);
    const acked = await p1LogMod.acknowledgeP1(e.id, 'Admin User');
    assert.ok(acked.OohP1AckAt, 'OohP1AckAt is set after ack');
    assert.equal(acked.OohP1AckBy, 'Admin User');
});

test('acknowledgeP1: throws 404 for an unknown id', async () => {
    resetCaptures();
    let threw = false;
    try {
        await p1LogMod.acknowledgeP1('no-such-id', 'Admin User');
    } catch (err) {
        threw = true;
        assert.equal(err.status, 404);
    }
    assert.equal(threw, true, 'unknown id throws with status 404');
});

test('p1Log: returns entries newest first', async () => {
    resetCaptures();
    await p1LogMod.recordP1Raised({ ...P1_ARGS, ticketId: 100 });
    await new Promise(r => setTimeout(r, 5));
    await p1LogMod.recordP1Raised({ ...P1_ARGS, ticketId: 101 });
    const log = await p1LogMod.p1Log();
    assert.ok(log.length >= 2, 'at least two entries');
    // newest should be ticket 101
    assert.equal(log[0].ticketId, 101, 'newest entry is first');
});

/* ============================================================
   Source guards
   ============================================================ */

test('Source guard: no "a text has gone" or "sent an urgent text" in flows.js', () => {
    const flowsContent = readFileSync(join(__dirname, '..', 'public', 'js', 'flows.js'), 'utf8');
    assert.doesNotMatch(flowsContent, /a text has gone/i, '"a text has gone" must not appear in flows.js');
    assert.doesNotMatch(flowsContent, /sent an urgent text/i, '"sent an urgent text" must not appear in flows.js');
});

test('Source guard: D2 sentence appears exactly 7 times in flows.js', () => {
    const flowsContent = readFileSync(join(__dirname, '..', 'public', 'js', 'flows.js'), 'utf8');
    // The sentence as it appears in the JS source file — apostrophes are \' inside single-quoted strings
    const d2 = "I\\'ve raised an urgent P1 ticket for this site and someone will call you back shortly.";
    const count = flowsContent.split(d2).length - 1;
    assert.equal(count, 7, `D2 sentence must appear exactly 7 times; found ${count}`);
});

test('Source guard: no escalation.js import in routes/ or services/', () => {
    const routes = readFileSync(join(__dirname, '..', 'routes', 'api.js'), 'utf8');
    assert.doesNotMatch(routes, /escalation\.js/, 'escalation.js must not be imported in routes/api.js');
    // Check services directory has no cross-reference to escalation.js
    const p1log = readFileSync(join(__dirname, '..', 'services', 'p1-log.js'), 'utf8');
    assert.doesNotMatch(p1log, /escalation\.js/, 'escalation.js must not be referenced in services/p1-log.js');
});

test('Source guard: no addP1DispatchNote in routes/ or services/', () => {
    const routes = readFileSync(join(__dirname, '..', 'routes', 'api.js'), 'utf8');
    assert.doesNotMatch(routes, /addP1DispatchNote/, 'addP1DispatchNote must not appear in routes/api.js');
    const zendesk = readFileSync(join(__dirname, '..', 'services', 'zendesk.js'), 'utf8');
    assert.doesNotMatch(zendesk, /addP1DispatchNote/, 'addP1DispatchNote must not appear in services/zendesk.js');
});

test('Source guard: dispatchOk does not appear in public/js/views.js', () => {
    const views = readFileSync(join(__dirname, '..', 'public', 'js', 'views.js'), 'utf8');
    assert.doesNotMatch(views, /dispatchOk/, 'dispatchOk must not appear in views.js after OOHDASH-153');
});
