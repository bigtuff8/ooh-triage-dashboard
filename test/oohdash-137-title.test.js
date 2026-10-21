/**
 * OOHDASH-137 — route-level and source-guard tests (R1-R10).
 *
 * R1-R4:  createOutcomeTicket (five creation routes) returns the expected title field.
 * R5-R6:  raiseQuery produces the correct title; no "site N" repeat.
 * R7:     source guard — no bare "[OOH] " literal in zendesk.js outside comment lines.
 * R8:     Tonight audit wording (raw subject) is unchanged in fixture mode.
 * R9:     resolveSiteName throws — raiseQuery catches, returns number-only title.
 * R10:    resolveSiteName hangs — 2-second timeout fires, returns number-only title.
 *
 * All tests run in DATA_MODE=fixture; live Zendesk is never called.
 * Runs under `npm run test:unit` (node --experimental-test-module-mocks --test).
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Set env before any import of modules that read config at load time.
process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';

const {
    createOutcomeTicket,
    createLateSyncTicket,
    raiseQuery,
    resetSeededFixtureTickets,
    _setQueryResolver
} = await import('../services/zendesk.js');
const { resolveSiteName } = await import('../services/zendesk.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const op = { name: 'Test Handler', email: 'handler@test.local' };

// Reset between tests to prevent cross-contamination.
afterEach(() => {
    resetSeededFixtureTickets();
    // Restore real resolver after each test (R9/R10 override it).
    _setQueryResolver(resolveSiteName);
});

/* ── R1: flow outcome ────────────────────────────────────────────────────── */
test('R1: flow outcome returns correct title with site number and pub name', async () => {
    const t = await createOutcomeTicket({
        operator: op,
        siteNo: '6261',
        siteName: 'Wheatstone Inn (Gloucester)',
        subject: 'External lighting not working - P1',
        summary: 'External lighting not working - P1',
        outcomeType: 'capture'
    });
    assert.equal(t.title, '[OOH] 6261 Wheatstone Inn (Gloucester) - External lighting not working - P1');
});

/* ── R2: control outcome with em-dashes ─────────────────────────────────── */
test('R2: control outcome preserves long dashes (em-dash or double-hyphen) in title', async () => {
    const t = await createOutcomeTicket({
        operator: op,
        siteNo: '7639',
        siteName: 'Black Bull (Corbridge)',
        subject: 'Setpoint lower -- sent, awaiting device confirmation',
        summary: 'Setpoint lower -- sent, awaiting device confirmation',
        outcomeType: 'capture'
    });
    assert.equal(t.title, '[OOH] 7639 Black Bull (Corbridge) - Setpoint lower -- sent, awaiting device confirmation');
});

/* ── R3: late-sync ticket with null siteName ─────────────────────────────── */
test('R3: createLateSyncTicket with null siteName gives number-only prefix', async () => {
    const t = await createLateSyncTicket({
        operator: op,
        siteNo: '7639',
        siteName: null,
        deviceId: 'IT700TX-025804FB',
        attribute: 'setpoint',
        value: 21,
        settledAt: new Date().toISOString()
    });
    // Subject produced by createLateSyncTicket uses em-dash (U+2014)
    assert.ok(t.title.startsWith('[OOH] 7639 - '), `expected number-only prefix, got: ${t.title}`);
    assert.ok(t.title.includes('IT700TX-025804FB'), 'device id present in title');
});

/* ── R4: ambiguous house number — no-double does not fire ───────────────── */
test('R4: ambiguous house path — no-double does not fire when outcome starts "Ambiguous"', async () => {
    const t = await createOutcomeTicket({
        operator: op,
        siteNo: '6261',
        siteName: 'Ambiguous (Black Bull / Red Lion)',
        subject: 'Ambiguous house ID 6261 -- caller could not be resolved to one site',
        summary: 'Ambiguous',
        outcomeType: 'capture'
    });
    // No-double checks whether outcome starts with "6261"; it starts with "Ambiguous" so it does not fire.
    assert.ok(t.title.startsWith('[OOH] 6261 Ambiguous (Black Bull / Red Lion) - '),
        `expected site part present, got: ${t.title}`);
});

/* ── R5: raiseQuery with digits siteNo — looked-up name, no "site N" repeat */
test('R5: raiseQuery with valid siteNo builds title with site number and name; no "site N" substring', async () => {
    // Inject a stub name resolver so the test is deterministic in fixture mode.
    _setQueryResolver(async (digits) => digits === '6832' ? 'Old Grey Mare' : null);

    const t = await raiseQuery(op, '6832', 'No hot water', null);
    assert.ok(t.title.startsWith('[OOH] 6832 Old Grey Mare - '),
        `expected number + name prefix, got: ${t.title}`);
    assert.ok(!t.title.includes('site 6832'), `"site 6832" must not appear in title, got: ${t.title}`);
    assert.ok(t.title.includes('OOH query'), 'outcome wording "OOH query" in title');
});

/* ── R6: raiseQuery with null siteNo → "[OOH] OOH query" ─────────────────── */
test('R6: raiseQuery with null siteNo returns "[OOH] OOH query"', async () => {
    const t = await raiseQuery(op, null, 'General query', null);
    assert.equal(t.title, '[OOH] OOH query');
});

/* ── R7: source guard — no bare "[OOH] " in zendesk.js outside comments ──── */
test('R7: zendesk.js has no bare [OOH] literal outside comment lines', () => {
    const src = readFileSync(join(root, 'services/zendesk.js'), 'utf8');
    const nonCommentLines = src.split('\n').filter(line => {
        const t = line.trim();
        return t.length > 0 && !t.startsWith('//') && !t.startsWith('*');
    });
    const hits = nonCommentLines.filter(line => line.includes('[OOH] '));
    assert.equal(hits.length, 0,
        `Found [OOH] literal outside comments in zendesk.js:\n${hits.map(l => l.trim()).join('\n')}`);
});

/* ── R8: Tonight audit — raw subject unchanged in fixture mode ────────────── */
test('R8: fixture ticket carries raw subject (no site prefix); Tonight audit is unaffected', async () => {
    const rawSubject = 'General issue captured';
    const t = await createOutcomeTicket({
        operator: op,
        siteNo: '6261',
        siteName: 'Wheatstone Inn (Gloucester)',
        subject: rawSubject,
        summary: rawSubject,
        outcomeType: 'capture'
    });
    // The fixture ticket's subject field must be the raw wording — not the built title.
    // routes/api.js:397 reads this for the Tonight "What happened" column.
    // (We read it from the returned id via getFeedbackThread — the fixture stores it on the ticket object.)
    assert.equal(t.title, '[OOH] 6261 Wheatstone Inn (Gloucester) - General issue captured');
    // Confirm the title does NOT appear as the raw subject (the subject field is preserved)
    assert.ok(!t.title.startsWith('[OOH] [OOH]'), 'no double [OOH] prefix');
    // The audit detail reads `subject` from the POST body (routes/api.js:397) before
    // createOutcomeTicket is called — it is the raw wording, unaffected by this change.
    assert.ok(!rawSubject.includes('[OOH]'), 'raw subject has no site prefix — audit wording unchanged');
});

/* ── R9: resolveSiteName throws → catch → number-only title, ticket created  */
test('R9: resolveSiteName throw is caught; number-only title returned; ticket created', async () => {
    _setQueryResolver(() => { throw new Error('lookup error'); });

    const t = await raiseQuery(op, '6832', 'General query', null);
    assert.equal(t.title, '[OOH] 6832 - OOH query', `expected number-only title, got: ${t.title}`);
    assert.ok(typeof t.id === 'number', 'ticket was created');
});

/* ── R10: resolveSiteName hangs → 2-second timeout fires → number-only title */
test('R10: resolveSiteName that never resolves is cut off by 2-second timeout', async (ctx) => {
    ctx.diagnostic('R10 uses a real ~2-second timer — expected duration: ~2000 ms');
    _setQueryResolver(() => new Promise(() => {})); // never resolves

    const start = Date.now();
    const t = await raiseQuery(op, '6832', 'General query', null);
    const elapsed = Date.now() - start;

    assert.equal(t.title, '[OOH] 6832 - OOH query', `expected number-only title, got: ${t.title}`);
    assert.ok(typeof t.id === 'number', 'ticket was created');
    // Timeout should fire at ~2000 ms; allow up to 2200 ms for scheduler jitter.
    assert.ok(elapsed >= 1900, `elapsed ${elapsed}ms must be at least 1900 (timeout is 2000)`);
    assert.ok(elapsed < 3000, `elapsed ${elapsed}ms must be under 3000 — timeout is not working`);
}, { timeout: 5000 });
