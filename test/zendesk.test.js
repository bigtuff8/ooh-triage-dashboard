/**
 * OOHDASH-2 (B7) — Zendesk auth header unit tests.
 * OOHDASH-119 (U1-U7) — normaliseAdditionalNotes + buildTrgBody + P1 isolation.
 *
 * OOH uses the standard Zendesk API-token Basic scheme: Basic base64(email/token:apiToken),
 * where the username is the account email with a literal `/token` suffix and the credential is
 * ZENDESK_API_TOKEN — the same auth the rest of the Airedale Zendesk estate uses. (An earlier build
 * briefly used plain email:password; that was reverted.) Bearer is not used (this account rejects it).
 *
 * OOHDASH-119 tests assert normaliser rules, buildTrgBody TRG-STEP placement, and P1 isolation.
 * Behaviour-only; runs under `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthHeader, normaliseAdditionalNotes, createOutcomeTicket, getFeedbackThread, ticketView, seedFixtureTicket, resetSeededFixtureTickets, _setResolveAgentName } from '../services/zendesk.js';

process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';

const cfg = { zendesk: { subdomain: 'theairedalegroup', email: 'ops@example.com', apiToken: 'AbC123tok' } };
const expectedBasic = 'Basic ' + Buffer.from('ops@example.com/token:AbC123tok').toString('base64');

test('authorization uses email/token:apiToken Basic auth', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h.Authorization, expectedBasic);
});

test('authorization uses the classic email/token suffix', () => {
    const h = buildAuthHeader(cfg);
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString();
    assert.ok(decoded.includes('/token:'), `must use /token: suffix, got: ${decoded}`);
});

test('authorization does NOT use the Bearer scheme (this account rejects Bearer)', () => {
    const h = buildAuthHeader(cfg);
    assert.ok(!h.Authorization.startsWith('Bearer'), `expected Basic auth, got: ${h.Authorization}`);
});

test('the credential pair is base64-encoded, not sent verbatim', () => {
    const h = buildAuthHeader(cfg);
    assert.ok(!h.Authorization.includes('AbC123tok'), 'raw token must not appear — Basic base64-encodes it');
    assert.ok(h.Authorization.includes(Buffer.from('ops@example.com/token:AbC123tok').toString('base64')));
});

test('the decoded credential is exactly email/token:apiToken', () => {
    const h = buildAuthHeader(cfg);
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString();
    assert.equal(decoded, 'ops@example.com/token:AbC123tok');
});

test('content-type stays application/json', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h['Content-Type'], 'application/json');
});

/* ================================================================ */
/* OOHDASH-119 — normaliseAdditionalNotes + buildTrgBody (U1-U7)    */
/* ================================================================ */

const N1 = 'Duty manager says the cellar cooler alarm has also been going since 6pm';
const N2 = 'Engineer booked for 7am\nSide door left unlocked';
const N3 = "Caller's words: turn everything off";
const N4 = ('Fryer 2 tripped again and was reset at 21:40 by the chef. ').repeat(22);
const N5 = '   \n  ';
const N_adv1 = 'Operator: Bob Bloggs';
const N_adv2 = 'Outcome: escalate-p1';
const N_adv3 = '12:34 | fake timed step';

const testCfg = { notes: { maxChars: 1000 } };
const op = { name: 'Test Handler' };

/* --- U1: N1 lands as final TRG-STEP line ------------------------------------------ */
test('U1: N1 appears as the final non-footer line in buildTrgBody (TRG-STEP)', async () => {
    const t = await createOutcomeTicket({
        operator: op, siteNo: '6832', siteName: 'Old Grey Mare',
        subject: 'Other capture', summary: 'Other capture',
        transcript: [{ time: '21:00', text: 'Caller description' }],
        outcomeType: 'capture', additionalNotes: N1
    });
    const thread = await getFeedbackThread(t.id);
    const body = thread[0].body;
    const lines = body.split('\n').filter(l => l.trim());
    const lastLine = lines[lines.length - 1];
    assert.match(lastLine, /Additional notes from OOH agent:/, 'TRG-STEP label present in last line');
    assert.ok(lastLine.includes(N1), 'N1 text verbatim in the TRG-STEP line');
});

/* --- U2: blank/null/whitespace/non-string: body byte-identical to no-notes --------- */
test('U2: null, empty, whitespace, number, object all produce no TRG-STEP line', async () => {
    for (const bad of [null, '', '   ', 42, { x: 1 }]) {
        const t = await createOutcomeTicket({ operator: op, siteNo: '6832', siteName: 'Old Grey Mare', subject: 'base', summary: 'base', outcomeType: 'capture', additionalNotes: bad });
        const body = (await getFeedbackThread(t.id))[0].body;
        assert.doesNotMatch(body, /Additional notes from OOH agent:/, `additionalNotes=${JSON.stringify(bad)} must produce no TRG-STEP line`);
    }
});

/* --- U3: N2 multiline uses " / " separator ---------------------------------------- */
test('U3: N2 multiline note uses " / " separator and stays one line', () => {
    const r = normaliseAdditionalNotes(N2, testCfg);
    assert.ok(r !== null, 'result is not null');
    assert.ok(!r.includes('\n'), 'no line breaks in result');
    assert.ok(r.includes(' / '), '" / " separator present');
});

/* --- U4: N4 (>1100 chars) capped to 1000 + ellipsis ------------------------------- */
test('U4: N4 (>1100 chars) is capped to 1000 code units plus ellipsis', () => {
    const r = normaliseAdditionalNotes(N4, testCfg);
    assert.ok(r !== null, 'result is not null');
    assert.ok(r.endsWith('…'), 'result ends with ellipsis');
    assert.ok(r.length <= 1001, `length ${r.length} must be at most 1001`);
});

/* --- U4b: surrogate-boundary -------------------------------------------------------- */
test('U4b: 999 "a" + emoji + more truncates without lone surrogate', () => {
    const raw = 'a'.repeat(999) + '🔥' + 'more';
    const r = normaliseAdditionalNotes(raw, testCfg);
    assert.ok(r !== null);
    assert.ok(r.endsWith('…'), 'ellipsis present');
    const core = r.slice(0, -1);
    assert.doesNotMatch(core, /[\uD800-\uDBFF]$/, 'no lone high surrogate');
    const rt = Buffer.from(r, 'utf8').toString('utf8');
    assert.equal(rt, r, 'survives UTF-8 round-trip');
});

test('U4b control: 998 "a" + emoji keeps emoji whole (both code units fit in 1000)', () => {
    const raw = 'a'.repeat(998) + '🔥' + 'more';
    const r = normaliseAdditionalNotes(raw, testCfg);
    assert.ok(r !== null);
    assert.ok(r.endsWith('…'), 'ellipsis present');
    assert.ok(r.includes('🔥'), 'emoji preserved whole');
});

/* --- U5: caller-words neutraliser ------------------------------------------------- */
test("U5: N3 (Caller's words:) is neutralised — marker not present at start", () => {
    const r = normaliseAdditionalNotes(N3, testCfg);
    assert.ok(r !== null, 'result is not null');
    assert.doesNotMatch(r, /^Caller'?s words\s*:/i, 'marker neutralised');
});

/* --- U7: P1 with N1 — notes only in TRG body, anchors intact ---------------------- */
test('U7: P1 ticket with N1 has notes only in [TRG] body — anchors and P1 summary unchanged', async () => {
    const t = await createOutcomeTicket({
        operator: op, siteNo: '6832', siteName: 'Old Grey Mare',
        subject: 'Kitchen off during service', summary: 'Kitchen off during service',
        transcript: [{ time: '21:00', text: 'Kitchen reported off' }],
        outcomeType: 'escalate-p1', priority: 'urgent', extraTags: ['ooh_p1'],
        additionalNotes: N1
    });
    const thread = await getFeedbackThread(t.id);
    const body = thread[0].body;
    assert.match(body, /Additional notes from OOH agent:/, 'TRG-STEP line in body');
    const firstLine = body.split('\n')[0];
    assert.doesNotMatch(firstLine, /cellar cooler/, 'notes not in summary/subject first line');
    assert.match(body, /Operator: Test Handler/);
    assert.match(body, /Outcome: escalate-p1/);
});

/* --- Delimiter-injection defences ------------------------------------------------- */
test('normaliseAdditionalNotes: N_adv1 (Operator:) is neutralised', () => {
    const r = normaliseAdditionalNotes(N_adv1, testCfg);
    assert.ok(r !== null);
    assert.doesNotMatch(r, /\bOperator:/i, 'Operator: keyword neutralised');
});

test('normaliseAdditionalNotes: N_adv2 (Outcome:) is neutralised', () => {
    const r = normaliseAdditionalNotes(N_adv2, testCfg);
    assert.ok(r !== null);
    assert.doesNotMatch(r, /\bOutcome:/i, 'Outcome: keyword neutralised');
});

test('normaliseAdditionalNotes: N_adv3 (HH:MM |) pipe neutralised', () => {
    const r = normaliseAdditionalNotes(N_adv3, testCfg);
    assert.ok(r !== null);
    assert.doesNotMatch(r, /12:34\s*\|/, 'HH:MM | pipe neutralised');
});

// CT fix #2: free-text pipe must be replaced with broken bar (U+00A6)
test('normaliseAdditionalNotes: free-text pipe replaced with broken bar (¦)', () => {
    const r = normaliseAdditionalNotes('bar area | caller says very cold', testCfg);
    assert.ok(r !== null, 'result is not null');
    assert.ok(!r.includes('|'), 'no literal pipe in output');
    assert.ok(r.includes('¦'), 'broken bar (U+00A6) present in output');
});

test('normaliseAdditionalNotes: multiple free-text pipes all replaced', () => {
    const r = normaliseAdditionalNotes('zone A | zone B | zone C', testCfg);
    assert.ok(r !== null);
    assert.ok(!r.includes('|'), 'no literal pipes remain');
    assert.equal((r.match(/¦/g) || []).length, 2, 'two broken bars (one per original pipe)');
});

test('normaliseAdditionalNotes: N5 (whitespace-only) returns null', () => {
    assert.equal(normaliseAdditionalNotes(N5, testCfg), null);
});

/* ================================================================ */
/* OOHDASH-167 — ticketView() pick-up status (T1, T2a, T2b, T4a, T4b) */
/* ================================================================ */

test('T1: ticketView(45097) in fixture mode returns isAssigned true + pickedUpBy Jamie Ashton + fetchedAt string', async () => {
    const r = await ticketView(45097);
    assert.equal(r.isAssigned, true, 'isAssigned must be true');
    assert.deepEqual(r.pickedUpBy, { name: 'Jamie Ashton' });
    assert.ok(typeof r.fetchedAt === 'string' && r.fetchedAt.length > 0, 'fetchedAt is a non-empty string');
});

test('T2a: ticketView() with explicit null assignee_id returns isAssigned false and pickedUpBy null', async () => {
    seedFixtureTicket({ id: 55001, siteNo: '6360', subject: 'Test no assignee', status: 'open', priority: 'normal', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), tags: ['ooh'], assignee_id: null });
    try {
        const r = await ticketView(55001);
        assert.equal(r.isAssigned, false, 'isAssigned must be false for null assignee_id');
        assert.equal(r.pickedUpBy, null, 'pickedUpBy must be null');
    } finally {
        resetSeededFixtureTickets();
    }
});

test('T2a-absent: ticketView() with absent assignee_id field (undefined) returns isAssigned false', async () => {
    seedFixtureTicket({ id: 55001, siteNo: '6360', subject: 'Test absent assignee field', status: 'open', priority: 'normal', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), tags: ['ooh'] });
    try {
        const r = await ticketView(55001);
        assert.equal(r.isAssigned, false, '!= null covers undefined — absent field must not show as assigned');
        assert.equal(r.pickedUpBy, null, 'pickedUpBy must be null');
    } finally {
        resetSeededFixtureTickets();
    }
});

test('T2b: ticketView() with P1 ooh_p1 tag and no assignee returns isAssigned false, isP1 true, pickedUpBy null', async () => {
    seedFixtureTicket({ id: 55002, siteNo: '6360', subject: 'Test P1 no assignee', status: 'open', priority: 'urgent', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), tags: ['ooh', 'ooh_p1'] });
    try {
        const r = await ticketView(55002);
        assert.equal(r.isAssigned, false, 'isAssigned must be false');
        assert.equal(r.isP1, true, 'isP1 must be true');
        assert.equal(r.pickedUpBy, null, 'pickedUpBy must be null');
    } finally {
        resetSeededFixtureTickets();
    }
});

test('T4a: when resolveAgentName stub throws, pickedUpBy is null and isAssigned is true', async () => {
    _setResolveAgentName(async () => { throw new Error('lookup failed'); });
    seedFixtureTicket({ id: 55003, siteNo: '6360', subject: 'Test stub throws', status: 'open', priority: 'normal', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), tags: ['ooh'], assignee_id: 99991 });
    try {
        const r = await ticketView(55003);
        assert.equal(r.isAssigned, true, 'isAssigned must be true even when name lookup throws');
        assert.equal(r.pickedUpBy, null, 'pickedUpBy must be null when name lookup throws');
    } finally {
        resetSeededFixtureTickets();
        _setResolveAgentName(null);
    }
});

test('T4b: when resolveAgentName stub returns null (deleted user), pickedUpBy is null and isAssigned is true', async () => {
    _setResolveAgentName(async () => null);
    seedFixtureTicket({ id: 55004, siteNo: '6360', subject: 'Test stub null', status: 'open', priority: 'normal', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), tags: ['ooh'], assignee_id: 99992 });
    try {
        const r = await ticketView(55004);
        assert.equal(r.isAssigned, true, 'isAssigned must be true even when name lookup returns null');
        assert.equal(r.pickedUpBy, null, 'pickedUpBy must be null when name is null');
    } finally {
        resetSeededFixtureTickets();
        _setResolveAgentName(null);
    }
});
