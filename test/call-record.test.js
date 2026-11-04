/**
 * OOHDASH-159 rev 5 (E1): server-side call record. Starts at site confirm, finalised once by End call /
 * Raise another issue / leaving the screen / idle. Idempotent; a call with no ticket gets one closed record.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-call-'));
process.env.OOH_CALL_IDLE_MIN = '20';
const cr = await import('../services/call-record.js');
const zd = await import('../services/zendesk.js');

const op = { id: 'op-1', name: 'Test Handler' };
beforeEach(() => cr._reset());

test('CR-1: record text carries what we know so far, the outcome and why it closed', () => {
    const rec = { siteNo: '8888', siteName: 'The Test Arms', operatorName: 'Test Handler', startedAt: Date.UTC(2026, 9, 29, 18, 0) };
    const txt = cr.buildCallRecordText(rec, { cat: 'Kitchen equipment', knownSoFar: ['Checked: Fryer is off'], outcome: 'Kitchen equipment on with the manual override' }, 'end-call', Date.UTC(2026, 9, 29, 18, 7));
    assert.match(txt, /\[OOH CALL RECORD\]/);
    assert.match(txt, /Known so far: Checked: Fryer is off/);
    assert.match(txt, /Outcome: Kitchen equipment on with the manual override/);
    assert.match(txt, /the agent pressed End call/);
});

test('CR-2: finalise is idempotent — a second End call writes nothing', async () => {
    const id = cr.startCall({ operator: op, siteNo: '8888', siteName: 'The Test Arms' });
    cr.recordProgress(id, op.id, { issueKey: 'i1', cat: 'Kitchen equipment', knownSoFar: ['Customer: needed now: no'] });
    const a = await cr.finalise(id, op.id, { reason: 'end-call' });
    assert.equal(a.ok, true);
    assert.equal(a.written.length, 1, 'one record for the unfinished issue');
    assert.equal(a.written[0].appended, false, 'no ticket existed, so a closed call-record ticket is created');
    const b = await cr.finalise(id, op.id, { reason: 'left-screen' });
    assert.ok(!b.ok || b.already || b.written.length === 0, 'the second finalise writes nothing');
});

test('CR-3: an issue with an outcome ticket gets the record appended to that ticket, not a new one', async () => {
    const t = await zd.createOutcomeTicket({ operator: op, siteNo: '8888', siteName: 'The Test Arms', subject: 'Kitchen', outcomeType: 'capture', detail: 'x' });
    const id = cr.startCall({ operator: op, siteNo: '8888', siteName: 'The Test Arms' });
    cr.recordProgress(id, op.id, { issueKey: 'i1', cat: 'Kitchen equipment', ticketId: t.id, outcome: 'Kitchen' });
    const r = await cr.finalise(id, op.id, { reason: 'another-issue', issueKey: 'i1' });
    assert.deepEqual(r.written, [{ ticketId: t.id, appended: true }]);
    const again = await cr.finalise(id, op.id, { reason: 'another-issue', issueKey: 'i1' });
    assert.equal(again.written.length, 0, 'Raise another issue twice does not duplicate');
});

test('CR-4: idle sweeper finalises only calls idle past the limit; a call with no issue gets a closed record', async () => {
    const now = Date.now();
    const idle = cr.startCall({ operator: op, siteNo: '8888', nowMs: now - 21 * 60000 });
    const busy = cr.startCall({ operator: op, siteNo: '8889', nowMs: now - 5 * 60000 });
    const done = await cr.sweepIdle(now);
    assert.deepEqual(done, [idle]);
    assert.ok(cr._get(busy), 'the active call stays open');
    assert.equal(cr._get(idle), null);
});

test('CR-5: another operator cannot write to or finalise someone else\'s call', async () => {
    const id = cr.startCall({ operator: op, siteNo: '8888' });
    assert.equal(cr.recordProgress(id, 'someone-else', { issueKey: 'i1' }), false);
    const r = await cr.finalise(id, 'someone-else', { reason: 'end-call' });
    assert.equal(r.ok, false);
});

test('CR-6: a contact-history ticket is created already solved', async () => {
    const t = await zd.createOutcomeTicket({ operator: op, siteNo: '8888', subject: 'Call record', outcomeType: 'call-record', detail: 'x', status: 'solved' });
    const v = await zd.ticketView(t.id);
    assert.equal(v.status.raw, 'solved');
    assert.equal(v.status.agent, 'Completed and closed');
});
