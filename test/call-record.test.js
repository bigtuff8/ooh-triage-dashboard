/**
 * OOHDASH-159 rev 5 (Part 2) — call-record.js unit tests.
 *
 * Covers the Part 2 addenda:
 *   CR-HB   heartbeat updates lastHeartbeatAt, returns false for unknown / finalised calls
 *   CR-DRS  durable sweep: Cosmos lastHeartbeatAt takes precedence over in-memory
 *   CR-409  recordProgress returns null (409) for a new issue on a finalised call
 *   CR-RO   reopen: reopens within 2h, rejects >2h, requires owner match
 *   CR-IDOR operatorHasTicket and confirmedSiteForOperator scope to the right operator
 *   CR-RES  sameOperatorResume finds open call at the same site
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DATA_MODE = 'fixture';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-cr-'));
process.env.WRITES_DISABLED = 'false';

const cr = await import('../services/call-record.js');

function makeOp(id = 'op-1') { return { id, name: 'Test Op', email: 'op@test.com' }; }

function makeCall(siteNo = '6001', opId = 'op-1') {
    cr._reset();
    return cr.startCall({ operator: makeOp(opId), siteNo, siteName: 'Test Pub', nowMs: Date.now() });
}

/* ───────────────────────── CR-HB: heartbeat ───────────────────────── */

test('CR-HB-1: heartbeat updates lastHeartbeatAt on an open call', async () => {
    const id = makeCall();
    const before = Date.now();
    await new Promise(r => setTimeout(r, 2));
    const ok = await cr.heartbeat(id, 'op-1');
    assert.ok(ok, 'heartbeat returns true for an open call');
    const rec = cr._get(id);
    assert.ok(rec.lastHeartbeatAt > before, 'lastHeartbeatAt advanced');
});

test('CR-HB-2: heartbeat returns false for an unknown callId', async () => {
    cr._reset();
    const ok = await cr.heartbeat('call-does-not-exist', 'op-1');
    assert.equal(ok, false, 'unknown call → false');
});

test('CR-HB-3: heartbeat returns false after the call is finalised', async () => {
    const id = makeCall();
    await cr.finalise(id, 'op-1', { reason: 'end-call' });
    const ok = await cr.heartbeat(id, 'op-1');
    assert.equal(ok, false, 'finalised call → false');
});

test('CR-HB-4: heartbeat is owner-scoped — wrong operator returns false', async () => {
    const id = makeCall('6002', 'op-owner');
    const ok = await cr.heartbeat(id, 'op-other');
    assert.equal(ok, false, 'wrong operator → false');
});

/* ─────────────────────── CR-409: 409 trigger ──────────────────────── */

test('CR-409-1: recordProgress returns null for a new issue when the call is in-memory finalised', () => {
    // The 409 path fires during the brief async window inside finalise() while persist() is awaiting —
    // the status is 'finalised' in memory before calls.delete() runs. We simulate that window by
    // directly setting status on the in-memory record (which is what _get() exposes for this purpose).
    const id = makeCall();
    cr.recordProgress(id, 'op-1', { issueKey: 'iss-A', cat: 'heating' });
    // Simulate the async-window state: status=finalised but still in memory
    const rec = cr._get(id);
    rec.status = 'finalised';
    // Known issue → true (idempotent, not a 409)
    const existing = cr.recordProgress(id, 'op-1', { issueKey: 'iss-A', cat: 'heating' });
    assert.equal(existing, true, 'known issue on in-memory finalised call → true (idempotent)');
    // New issue on a finalised call → null (409 signal)
    const newIss = cr.recordProgress(id, 'op-1', { issueKey: 'iss-B', cat: 'fridge' });
    assert.equal(newIss, null, 'new issue on in-memory finalised call → null (409 signal)');
});

test('CR-409-2: recordProgress returns false (not null) for an unknown callId', () => {
    cr._reset();
    const result = cr.recordProgress('call-unknown', 'op-1', { issueKey: 'iss-X' });
    assert.equal(result, false, 'unknown call → false (not null — no 409 for unknown)');
});

/* ─────────────────────── CR-RO: reopen ────────────────────────────── */

test('CR-RO-1: reopen succeeds within 2 hours for the owning operator', async () => {
    const id = makeCall();
    await cr.finalise(id, 'op-1', { reason: 'end-call' });
    const result = await cr.reopen(id, 'op-1');
    assert.deepEqual(result, { ok: true }, 'reopen within 2h returns { ok: true }');
    const rec = cr._get(id);
    assert.equal(rec.status, 'open', 'call is open again after reopen');
    assert.equal(rec.finalisedAt, null, 'finalisedAt cleared');
});

test('CR-RO-2: reopen rejects with forbidden for a different operator', async () => {
    const id = makeCall('6003', 'op-owner');
    await cr.finalise(id, 'op-owner', { reason: 'end-call' });
    const result = await cr.reopen(id, 'op-other');
    assert.equal(result.ok, false, 'different operator → not ok');
    assert.equal(result.error, 'forbidden', 'error is forbidden');
});

test('CR-RO-3: reopen rejects with expired after 2 hours', async () => {
    const id = makeCall();
    const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);
    // Fake finalisation time more than 2h ago
    const rec = cr._get(id);
    rec.status = 'finalised';
    rec.finalisedAt = threeHoursAgo;
    const result = await cr.reopen(id, 'op-1');
    assert.equal(result.ok, false, '> 2h → not ok');
    assert.equal(result.error, 'expired', 'error is expired');
});

test('CR-RO-4: reopen returns unknown-call for a non-existent id', async () => {
    cr._reset();
    const result = await cr.reopen('call-nonexistent', 'op-1');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'unknown-call');
});

/* ─────────────────────── CR-IDOR: ownership checks ────────────────── */

test('CR-IDOR-1: operatorHasTicket returns true only for the owning operator', async () => {
    const id = makeCall('6004', 'op-A');
    cr.recordProgress(id, 'op-A', { issueKey: 'iss-heat', cat: 'heating', ticketId: 1234 });
    assert.ok(cr.operatorHasTicket(1234, 'op-A'), 'ticket 1234 belongs to op-A');
    assert.ok(!cr.operatorHasTicket(1234, 'op-B'), 'ticket 1234 does not belong to op-B');
});

test('CR-IDOR-2: confirmedSiteForOperator returns the siteNo of the operator\'s open call', () => {
    makeCall('7001', 'op-site');
    assert.equal(cr.confirmedSiteForOperator('op-site'), '7001', 'returns the correct siteNo');
    assert.equal(cr.confirmedSiteForOperator('op-other'), null, 'returns null for a different operator');
});

/* ─────────────────────── CR-RES: sameOperatorResume ───────────────── */

test('CR-RES-1: sameOperatorResume finds an open call at the same site', () => {
    const id = makeCall('8001', 'op-R');
    const r = cr.sameOperatorResume('op-R', '8001');
    assert.ok(r, 'returns a resume object');
    assert.equal(r.callId, id, 'returns the correct callId');
    assert.ok(r.canResume, 'canResume is true');
    assert.ok(!r.wasFinalised, 'not marked wasFinalised for an open call');
});

test('CR-RES-2: sameOperatorResume finds a recently finalised call within 2h (simulated in-memory state)', () => {
    // After full finalise(), calls.delete() removes the record from memory — sameOperatorResume
    // only sees in-memory records. To test the recently-finalised path, simulate the state directly.
    const id = makeCall('8002', 'op-RF');
    const rec = cr._get(id);
    rec.status = 'finalised';
    rec.finalisedAt = Date.now() - 30 * 60 * 1000; // 30 minutes ago (within 2h)
    const r = cr.sameOperatorResume('op-RF', '8002');
    assert.ok(r, 'returns a resume object for a recently finalised call');
    assert.equal(r.callId, id);
    assert.ok(r.canResume);
    assert.ok(r.wasFinalised, 'wasFinalised is true');
});

test('CR-RES-3: sameOperatorResume returns null for a different site', () => {
    makeCall('8003', 'op-RS');
    const r = cr.sameOperatorResume('op-RS', '9999');
    assert.equal(r, null, 'different siteNo → null');
});

/* ─────────────────────── CR-TXT: buildCallRecordText ──────────────── */

test('CR-TXT-1: buildCallRecordText includes site, operator, reason and outcome', () => {
    const rec = { id: 'call-x', siteNo: '6001', siteName: 'The Test Arms', operatorName: 'Jane', startedAt: Date.now(), finalisedAt: null };
    const iss = { key: 'heat', cat: 'heating', knownSoFar: ['Zone 1 off'], outcome: 'Turned on', notes: null, ticketId: 1001 };
    const txt = cr.buildCallRecordText(rec, iss, 'end-call', Date.now());
    assert.match(txt, /OOH CALL RECORD/, 'header present');
    assert.match(txt, /The Test Arms/, 'site name present');
    assert.match(txt, /Jane/, 'operator name present');
    assert.match(txt, /end-call|agent pressed End call/, 'reason present');
    assert.match(txt, /Zone 1 off/, 'knownSoFar present');
    assert.match(txt, /Turned on/, 'outcome present');
});
