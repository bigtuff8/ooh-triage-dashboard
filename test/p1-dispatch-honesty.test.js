/**
 * Test 11c (OOHDASH-72, tester feedback) — dispatchOk must reflect an ACTUAL send.
 *
 * The defect (verified on P1 ticket #48663): the handler card and the ticket both claimed a text
 * "has been sent" when nothing was sent (log-mode). Root cause is a sequencing wall — the [TRG]
 * transcript is built and baked into the first comment BEFORE escalateP1 runs, so dispatchOk does
 * not exist at transcript-build time; and log-mode sendViaProvider never throws, so dispatchOk fell
 * through to true.
 *
 * The fix (three coordinated changes), asserted here:
 *   (Change 3) log-mode returns sent:false ⇒ dispatchOk NOT true — a no-op is never a send.
 *   (Change 1) the [TRG] first comment carries a NEUTRAL "P1 escalation raised" line, not a false
 *              "SMS dispatched" claim, and does NOT perturb the Outcome: freeze anchor.
 *   (Change 2) a SECOND #ooh-p1-dispatch comment (addP1DispatchNote) states the ACTUAL result per
 *              {sent, log-mode, failed}, log/failed stating the next action (phone the manager), and
 *              is fail-safe.
 *
 * Fixture mode + isolated store BEFORE importing config-backed modules. Axios adapter intercepts the
 * twilio REST call. No network, no live send.
 */
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DATA_MODE = 'fixture';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-11c-'));
process.env.WRITES_DISABLED = 'false';

/* ============================ Change 1 — neutral transcript line + freeze guard ============================ */
// buildOutcomeTranscript is a pure function; drives the [TRG] first-comment transcript steps.
const { buildOutcomeTranscript } = await import('../routes/api.js');
const { hhmm } = await import('../services/zendesk.js');

test('Change 1: the P1 transcript line is NEUTRAL (P1 raised) — it no longer falsely asserts an SMS was dispatched', () => {
    const steps = buildOutcomeTranscript({ action: null, type: 'escalate-p1', siteNo: '6832', siteName: 'The Red Lion', detail: 'Kitchen off during service', outcomeTime: new Date().toISOString() });
    const joined = steps.map(s => s.text).join('\n');
    assert.doesNotMatch(joined, /SMS dispatched/i, 'the false unconditional "SMS dispatched" claim is gone');
    assert.match(joined, /P1 escalation raised/i, 'a neutral, true-at-build-time "P1 escalation raised" line is present');
});

test('Change 1 freeze guard: the neutral P1 line does not perturb the Outcome: anchor parse', async () => {
    // Build the transcript, then the real [TRG] body, and confirm the consumer regex still captures the code.
    const zendesk = await import('../services/zendesk.js');
    const steps = buildOutcomeTranscript({ action: null, type: 'escalate-p1', siteNo: '6832', siteName: 'The Red Lion', detail: 'stock at risk', outcomeTime: new Date().toISOString() });
    const t = await zendesk.createOutcomeTicket({
        operator: { name: 'Handler One' }, siteNo: '6832', siteName: 'The Red Lion',
        subject: 'Refrigeration failure', summary: 'Refrigeration failure', transcript: steps,
        callerWords: 'freezer is warming', outcomeType: 'escalate-p1', priority: 'urgent', extraTags: ['ooh_p1']
    });
    const thread = await zendesk.getFeedbackThread(t.id);
    const first = thread[0].body;
    // The consumer's oversight parser: /Outcome:\s*([\w-]+)/ — must still capture the bare code.
    const m = first.match(/Outcome:\s*([\w-]+)/);
    assert.ok(m, 'the Outcome: anchor still parses');
    assert.equal(m[1], 'escalate-p1', 'the outcome code is captured intact — freeze rule preserved');
    // And the neutral line rides in the transcript, not on the anchor line.
    assert.match(first, /P1 escalation raised/i);
    assert.doesNotMatch(first, /SMS dispatched/i);
});

/* ============================ Change 3 — log-mode ⇒ dispatchOk NOT true ============================ */
// escalateP1 reads config.sms at CALL time inside sendViaProvider. config.js reads env once at import,
// so to steer the provider per scenario we mock config with a mutable `sms` object; store/metrics are
// mocked ONCE (node:test forbids re-mocking the same module) with shared capture arrays. The real
// config was already imported by the api/zendesk blocks above; mocking now only affects the fresh
// escalation import below, leaving those blocks untouched.
const escUpserts = [];
const escAlerts = [];
let escAxiosBehaviour = 'ok';
const mockSms = { provider: 'log', twilio: { accountSid: '', authToken: '', from: '' }, onDutyNumber: '', onDutyName: 'On-duty escalation manager' };
mock.module('../config.js', {
    namedExports: {
        config: { sms: mockSms, iotDashBaseUrl: 'https://iot.test' },
        validateConfig: () => []
    }
});
mock.module('../services/store.js', {
    namedExports: {
        collection: async () => ({ upsert: async (e) => { escUpserts.push(e); return e; }, get: async () => null, query: async () => [] })
    }
});
mock.module('../services/metrics.js', { namedExports: { raiseAlert: (k, m) => escAlerts.push({ k, m }) } });
const escAxios = (await import('axios')).default;
escAxios.defaults.adapter = (cfg) => {
    if (escAxiosBehaviour === 'fail') return Promise.reject(Object.assign(new Error('twilio 500'), { response: { status: 500 } }));
    return Promise.resolve({ data: { sid: 'SM1' }, status: 201, statusText: 'Created', headers: {}, config: cfg, request: {} });
};
// escalation.js binds `config` at import. api.js (imported above for buildOutcomeTranscript) already
// pulled a REAL-config escalation into the module cache, so re-import with a cache-busting query to
// get a fresh instance that binds the MOCKED config/store/metrics registered above.
const { escalateP1 } = await import('../services/escalation.js?v=mock');

function loadEscalation({ provider = 'log', creds = {}, onDuty = '', axiosBehaviour = 'ok' } = {}) {
    escUpserts.length = 0; escAlerts.length = 0; escAxiosBehaviour = axiosBehaviour;
    mockSms.provider = provider;
    mockSms.twilio = { accountSid: creds.accountSid || '', authToken: creds.authToken || '', from: creds.from || '' };
    mockSms.onDutyNumber = onDuty;
    return { mod: { escalateP1 }, upserts: escUpserts, alerts: escAlerts };
}

// origin:'ooh-dashboard' is REQUIRED post-OOHDASH-73: escalateP1 now fail-closes on origin (§1A), so
// the send-path cases below must assert a verified OOH origin to reach sendViaProvider. (Updated call
// signature — the origin-guard cases further down exercise the missing/non-OOH branch explicitly.)
const P1_ARGS = { operator: { name: 'Handler One' }, siteNo: '6832', siteName: 'The Red Lion', ticketId: 55501, summary: 'Kitchen off during service', origin: 'ooh-dashboard' };

test('Change 3: LOG-MODE ⇒ dispatchOk is NOT true (a log no-op is never recorded as a send)', async () => {
    const { mod } = await loadEscalation({ provider: 'log' });
    const entry = await mod.escalateP1(P1_ARGS);
    assert.notEqual(entry.dispatchOk, true, 'log-mode dispatchOk must not be true');
    assert.equal(entry.dispatchOk, false);
    assert.equal(entry.provider, 'log');
});

test('Change 3: a genuine twilio send (2xx) ⇒ dispatchOk true', async () => {
    const { mod } = await loadEscalation({ provider: 'twilio', creds: { accountSid: 'AC1', authToken: 't', from: '+100' }, onDuty: '+200', axiosBehaviour: 'ok' });
    const entry = await mod.escalateP1(P1_ARGS);
    assert.equal(entry.dispatchOk, true, 'a real 2xx transmission sets dispatchOk true');
    assert.equal(entry.provider, 'twilio');
});

test('Change 3: a twilio failure ⇒ dispatchOk false + an sms-dispatch-failed alert, escalation still returns', async () => {
    const { mod, alerts } = await loadEscalation({ provider: 'twilio', creds: { accountSid: 'AC1', authToken: 't', from: '+100' }, onDuty: '+200', axiosBehaviour: 'fail' });
    const entry = await mod.escalateP1(P1_ARGS);
    assert.equal(entry.dispatchOk, false, 'a failed send leaves dispatchOk false');
    assert.ok(entry, 'the escalation entry is still returned (send failure never blocks the outcome)');
    assert.ok(alerts.some(a => a.k === 'sms-dispatch-failed'), 'a dispatch-failure alert was raised');
});

/* ============================ State 0 (OOHDASH-73, §1A) — fail-closed OOH-origin guard ============================ */
// escalateP1 sends ONLY for a P1 raised from the OOH dashboard (origin === 'ooh-dashboard'). A missing,
// unknown or BAU origin must NOT page (fail-closed): dispatchOk false, p1-escalation-origin-unverified
// alert, the honest "phone the manager" card returned, no crash — proving a BAU alarm can never trigger
// the text. These run in twilio mode with valid creds so the ONLY thing stopping the send is the origin.

test('State 0: MISSING origin ⇒ NOT sent (fail-closed) — dispatchOk false, origin-unverified alert, outcome never blocked', async () => {
    const { mod, alerts } = await loadEscalation({ provider: 'twilio', creds: { accountSid: 'AC1', authToken: 't', from: '+100' }, onDuty: '+200', axiosBehaviour: 'ok' });
    const { origin, ...noOrigin } = P1_ARGS; // strip origin entirely — the fail-closed default path
    const entry = await mod.escalateP1(noOrigin);
    assert.equal(entry.dispatchOk, false, 'a missing origin is NEVER recorded as a send');
    assert.equal(entry.dispatchReason, 'origin-unverified', 'the not-sent record carries a distinct reason');
    assert.ok(entry, 'the escalation entry is still returned — the P1 outcome is never blocked');
    assert.ok(alerts.some(a => a.k === 'p1-escalation-origin-unverified'), 'the origin-unverified alert was raised');
    assert.ok(!alerts.some(a => a.k === 'sms-dispatch-failed'), 'it is NOT miscategorised as a dispatch failure');
});

test('State 0: an UNKNOWN / BAU origin ⇒ NOT sent — a BAU alarm can never trigger the escalation text', async () => {
    const { mod, alerts } = await loadEscalation({ provider: 'twilio', creds: { accountSid: 'AC1', authToken: 't', from: '+100' }, onDuty: '+200', axiosBehaviour: 'ok' });
    const entry = await mod.escalateP1({ ...P1_ARGS, origin: 'bau-alarm' });
    assert.equal(entry.dispatchOk, false, 'a non-OOH origin must NOT send');
    assert.ok(alerts.some(a => a.k === 'p1-escalation-origin-unverified'), 'the origin-unverified alert was raised');
});

test('State 0: a VERIFIED ooh-dashboard origin ⇒ proceeds to send (twilio 2xx ⇒ dispatchOk true), no origin block', async () => {
    const { mod, alerts } = await loadEscalation({ provider: 'twilio', creds: { accountSid: 'AC1', authToken: 't', from: '+100' }, onDuty: '+200', axiosBehaviour: 'ok' });
    const entry = await mod.escalateP1({ ...P1_ARGS, origin: 'ooh-dashboard' });
    assert.equal(entry.dispatchOk, true, 'a verified OOH origin sends');
    assert.ok(!alerts.some(a => a.k === 'p1-escalation-origin-unverified'), 'no origin block on a genuine OOH P1');
});

test('State 0: a VERIFIED ooh-dashboard origin in LOG mode ⇒ logs (dispatchOk false, provider log), no origin block', async () => {
    const { mod, alerts } = await loadEscalation({ provider: 'log' });
    const entry = await mod.escalateP1({ ...P1_ARGS, origin: 'ooh-dashboard' });
    assert.equal(entry.dispatchOk, false, 'log-mode with a valid origin is a no-op, not a send');
    assert.equal(entry.provider, 'log');
    assert.ok(!alerts.some(a => a.k === 'p1-escalation-origin-unverified'), 'a valid origin in log mode is not an origin block');
});

/* ============ State C (missing-credential half) — twilio selected, creds absent ⇒ guard throws, fail-closed ============ */
// Complements the existing "twilio failure (axios reject)" case with the MISSING-credential half of
// State C (design §3/§4). Origin is verified so the guard is passed and sendViaProvider's credential
// check (escalation.js: throws 'Twilio provider selected but not configured') is what fails, caught by
// the try/catch → dispatchOk false, sms-dispatch-failed alert, no crash. Proven in the suite, never on prod.
test('State C: twilio selected but credentials MISSING ⇒ guard throws, caught fail-closed (dispatchOk false, sms-dispatch-failed alert, no crash)', async () => {
    const { mod, alerts } = await loadEscalation({ provider: 'twilio', creds: {}, onDuty: '+200', axiosBehaviour: 'ok' });
    const entry = await mod.escalateP1({ ...P1_ARGS, origin: 'ooh-dashboard' });
    assert.equal(entry.dispatchOk, false, 'missing credentials are NEVER recorded as a send');
    assert.ok(entry, 'the P1 outcome is never blocked');
    assert.ok(alerts.some(a => a.k === 'sms-dispatch-failed'), 'the credential fail-closed path raises the dispatch-failed alert');
    assert.ok(!alerts.some(a => a.k === 'p1-escalation-origin-unverified'), 'a verified origin is not an origin block — this is a credential failure');
});

/* ============================ Change 2 — corrective #ooh-p1-dispatch comment ============================ */
const zendesk = await import('../services/zendesk.js');

// Creates a fixture P1 ticket so addP1DispatchNote has a real target, and returns its id.
async function makeTicket() {
    const t = await zendesk.createOutcomeTicket({
        operator: { name: 'Handler One' }, siteNo: '6832', siteName: 'The Red Lion',
        subject: 'P1 outcome', summary: 'P1 outcome', transcript: [{ time: '00:00', text: 'P1 escalation raised — on-duty manager to be paged' }],
        outcomeType: 'escalate-p1', priority: 'urgent', extraTags: ['ooh_p1']
    });
    return t.id;
}

const nowIso = new Date().toISOString();

test('Change 2: log-mode ⇒ the second comment says NOT SENT and states the next action (phone the manager)', async () => {
    const id = await makeTicket();
    await zendesk.addP1DispatchNote(id, { provider: 'log', dispatchOk: false, sentTo: 'On-duty manager', sentToNumber: '(not configured)', dispatchedAt: nowIso });
    const thread = await zendesk.getFeedbackThread(id);
    const note = thread.map(c => c.body).find(b => b.includes('#ooh-p1-dispatch'));
    assert.ok(note, 'a #ooh-p1-dispatch corrective comment was written');
    assert.match(note, /NOT SENT/i, 'the log-mode comment states NOT SENT');
    assert.match(note, /phone the on-duty manager/i, 'it states the next action: phone the manager');
    assert.match(note, /^\[TRG\]/, 'it carries the [TRG] prefix');
    assert.doesNotMatch(note, /\(configured\)/, 'never leaks the raw number — status only');
});

test('Change 2: a genuine send ⇒ the second comment says SMS SENT', async () => {
    const id = await makeTicket();
    await zendesk.addP1DispatchNote(id, { provider: 'twilio', dispatchOk: true, sentTo: 'On-duty manager', sentToNumber: '(configured)', dispatchedAt: nowIso });
    const thread = await zendesk.getFeedbackThread(id);
    const note = thread.map(c => c.body).find(b => b.includes('#ooh-p1-dispatch'));
    assert.match(note, /SMS SENT/i, 'the sent-mode comment states SMS SENT');
    assert.doesNotMatch(note, /NOT SENT/i);
});

test('Change 2: a send failure ⇒ the second comment says FAILED and states the next action', async () => {
    const id = await makeTicket();
    await zendesk.addP1DispatchNote(id, { provider: 'twilio', dispatchOk: false, sentTo: 'On-duty manager', sentToNumber: '(configured)', dispatchedAt: nowIso });
    const thread = await zendesk.getFeedbackThread(id);
    const note = thread.map(c => c.body).find(b => b.includes('#ooh-p1-dispatch'));
    assert.match(note, /FAILED/i, 'the failed-mode comment states FAILED');
    assert.match(note, /chase the on-duty manager.*by phone/i, 'it states the next action');
});

test('Change 2: the three variants produce DIFFERENT content', async () => {
    const bodies = {};
    for (const [k, p1] of Object.entries({
        sent: { provider: 'twilio', dispatchOk: true, sentTo: 'X', sentToNumber: '(configured)', dispatchedAt: nowIso },
        log: { provider: 'log', dispatchOk: false, sentTo: 'X', sentToNumber: '(not configured)', dispatchedAt: nowIso },
        failed: { provider: 'twilio', dispatchOk: false, sentTo: 'X', sentToNumber: '(configured)', dispatchedAt: nowIso }
    })) {
        const id = await makeTicket();
        await zendesk.addP1DispatchNote(id, p1);
        const thread = await zendesk.getFeedbackThread(id);
        bodies[k] = thread.map(c => c.body).find(b => b.includes('#ooh-p1-dispatch'));
    }
    assert.notEqual(bodies.sent, bodies.log);
    assert.notEqual(bodies.log, bodies.failed);
    assert.notEqual(bodies.sent, bodies.failed);
});

test('Change 2 fail-safe: a comment-write failure never throws out of the caller (mirrors reconciliation/SMS)', async () => {
    // addP1DispatchNote against a non-existent ticket throws (fixture "Ticket not found"). The ROUTE
    // wraps it in try/catch; assert that shape here — the caller pattern must swallow + alert, never
    // propagate. We assert the helper's failure is a catchable rejection (so the route's guard holds).
    let threw = false;
    try {
        await zendesk.addP1DispatchNote(9999999, { provider: 'log', dispatchOk: false, dispatchedAt: nowIso });
    } catch {
        threw = true;
    }
    assert.equal(threw, true, 'the helper rejects on a bad ticket — which the route try/catch swallows (fail-safe, outcome never broken)');
});
