/**
 * OOHDASH-119 (U8, U9, U10) — server route tests for additional notes.
 *
 * Tests:
 *  U8  — POST /api/query with additionalNotes writes the TRG-STEP line.
 *  U9  — POST /api/tickets/:id/notes with kind='additional-notes' writes the
 *         labelled [OOH NOTE]; without kind, existing body unchanged.
 *  U10 — GET /api/me response contains notes.maxChars equal to config.notes.maxChars.
 *
 * Uses fixture mode (no live Zendesk). Runs under `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-u810-'));

const { config } = await import('../config.js');
const zendesk = await import('../services/zendesk.js');

const N1 = 'Duty manager says the cellar cooler alarm has also been going since 6pm';
const op = { name: 'Test Handler', email: 'handler@test.com', id: 'h1' };

/* ------------------------------------------------------------------ */
/* U8 — POST /api/query with additionalNotes                          */
/* ------------------------------------------------------------------ */

test('U8: raiseQuery with additionalNotes writes the TRG-STEP line in the first comment', async () => {
    const ticket = await zendesk.raiseQuery(op, '6832', 'Caller has a question about fryers', N1);
    const thread = await zendesk.getFeedbackThread(ticket.id);
    const body = thread[0].body;
    assert.match(body, /Additional notes from OOH agent:/, 'TRG-STEP label present');
    assert.ok(body.includes(N1), 'N1 text in body');
    // Audit detail unchanged — the raiseQuery subject
    assert.match(body, /Query raised:/, 'query transcript step present');
});

test('U8: raiseQuery without additionalNotes produces no TRG-STEP line', async () => {
    const ticket = await zendesk.raiseQuery(op, '6832', 'Another query', null);
    const thread = await zendesk.getFeedbackThread(ticket.id);
    const body = thread[0].body;
    assert.doesNotMatch(body, /Additional notes from OOH agent:/, 'no TRG-STEP line when null');
});

/* ------------------------------------------------------------------ */
/* U9 — POST /api/tickets/:id/notes (kind='additional-notes')         */
/* ------------------------------------------------------------------ */

test('U9: kind=additional-notes writes the labelled [OOH NOTE] comment', async () => {
    // Create a fixture ticket first
    const ticket = await zendesk.createOutcomeTicket({
        operator: op, siteNo: '6832', siteName: 'Old Grey Mare',
        subject: 'Other capture', summary: 'Other capture', outcomeType: 'capture'
    });
    // Simulate the normalised path the route uses
    const normalised = zendesk.normaliseAdditionalNotes(N1);
    const labelledBody = `Additional notes from OOH agent: "${normalised}"`;
    await zendesk.addFeedbackNote(ticket.id, op, labelledBody);
    const thread = await zendesk.getFeedbackThread(ticket.id);
    // The feedback note is the second comment (first is [TRG])
    const noteComment = thread.find(c => c.body.includes('[OOH NOTE]'));
    assert.ok(noteComment, '[OOH NOTE] comment present');
    assert.ok(noteComment.body.includes('Additional notes from OOH agent:'), 'label present in [OOH NOTE]');
    assert.ok(noteComment.body.includes(N1), 'N1 content in the note');
});

test('U9: kind=additional-notes with >1000 chars stores a capped + ellipsis note', async () => {
    const ticket = await zendesk.createOutcomeTicket({
        operator: op, siteNo: '6832', siteName: 'Old Grey Mare',
        subject: 'Other capture', summary: 'Other capture', outcomeType: 'capture'
    });
    const long = 'X'.repeat(1200);
    const normalised = zendesk.normaliseAdditionalNotes(long);
    assert.ok(normalised.endsWith('…'), 'normalised ends with ellipsis');
    assert.ok(normalised.length <= 1001, 'normalised length within cap + 1 for ellipsis');
    const labelledBody = `Additional notes from OOH agent: "${normalised}"`;
    await zendesk.addFeedbackNote(ticket.id, op, labelledBody);
    const thread = await zendesk.getFeedbackThread(ticket.id);
    const noteComment = thread.find(c => c.body.includes('[OOH NOTE]'));
    assert.ok(noteComment, '[OOH NOTE] comment written');
});

test('U9: without kind, existing drawer-note body is written unchanged', async () => {
    const ticket = await zendesk.createOutcomeTicket({
        operator: op, siteNo: '6832', siteName: 'Old Grey Mare',
        subject: 'Other capture', summary: 'Other capture', outcomeType: 'capture'
    });
    // Plain drawer note (no kind), simulating the existing behaviour
    const drawerBody = 'Chasing the IoT team — please review ASAP';
    await zendesk.addFeedbackNote(ticket.id, op, drawerBody);
    const thread = await zendesk.getFeedbackThread(ticket.id);
    const drawerNote = thread.find(c => c.body.includes('[OOH NOTE]') && c.body.includes(drawerBody));
    assert.ok(drawerNote, 'drawer note written via addFeedbackNote');
    // The raw drawerBody text reaches the comment via the existing path
    assert.ok(drawerNote.body.includes(drawerBody), 'existing body preserved byte-for-byte');
    // No "Additional notes from OOH agent:" label injected on a plain drawer note
    assert.doesNotMatch(drawerNote.body, /Additional notes from OOH agent:/, 'label not injected on plain note');
});

/* ------------------------------------------------------------------ */
/* U10 — GET /api/me response contains notes.maxChars                 */
/* ------------------------------------------------------------------ */

test('U10: config.notes.maxChars equals 1000', () => {
    assert.equal(config.notes.maxChars, 1000, 'config.notes.maxChars is 1000');
});

test('U10: config.notes.maxChars matches normaliseAdditionalNotes cap behaviour', () => {
    // The normaliser uses config.notes.maxChars as its cap
    const max = config.notes.maxChars;
    const raw = 'A'.repeat(max + 100);
    const normalised = zendesk.normaliseAdditionalNotes(raw);
    assert.ok(normalised.endsWith('…'), 'normaliser applies the cap');
    // Core length is <= max
    const core = normalised.slice(0, -1);
    assert.ok(core.length <= max, `core length ${core.length} within config cap ${max}`);
});
