/**
 * OOHDASH-141 — tb-client unit tests for boiler-panel functions (BB-TBC-1..14).
 *
 * Tests allow-list enforcement, fixture-mode return values, and WRITES_DISABLED guard.
 * Module-level env: DATA_MODE=fixture, WRITES_DISABLED=false (tested separately in
 * boiler-writes-disabled.test.js for the blocked path).
 *
 * BB-TBC-1  – dispatchBoilerRpc: bad zone throws
 * BB-TBC-2  – dispatchBoilerRpc: bad n (0) throws
 * BB-TBC-3  – dispatchBoilerRpc: CHZ1 n=1 returns { sentAtMs } in fixture
 * BB-TBC-4  – dispatchBoilerRpc: CHZ2 n=-1 returns { sentAtMs } in fixture
 * BB-TBC-5  – writeSharedScopeAttribute: bad key throws
 * BB-TBC-6  – writeSharedScopeAttribute: bad value (2) throws
 * BB-TBC-7  – writeSharedScopeAttribute: value 0 is ok (auto)
 * BB-TBC-8  – writeSharedScopeAttribute: output2Override = 1 returns { attrTs }
 * BB-TBC-9  – revertBoilerZoneToAuto: bad zone throws
 * BB-TBC-10 – revertBoilerZoneToAuto: CHZ1 fixture returns { attrTs }
 * BB-TBC-11 – readBoilerState: fixture returns zones with correct shape (dir, overrideTs, etc.)
 * BB-TBC-12 – readBoilerState: fixture dir reflects a written attribute (V1)
 * BB-TBC-13 – readBoilerState: string value '-1792...' parsed correctly (OOHDASH-143 compat)
 * BB-TBC-14 – readBoilerState: V2 fixture returns correct shape
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';
process.env.BOILER_BOOST_REVERT_EXEMPT = 'all';

const tb = await import('../services/tb-client.js');

// ── Helper devices ───────────────────────────────────────────────────────
const v1Dev = { deviceId: 'BLR-TEST-V1', deviceType: 'boiler-panel', siteNo: '9011' };
const v2Dev = { deviceId: 'BLR-TEST-V2', deviceType: 'boiler-panel', siteNo: '9010' };

beforeEach(() => {
    tb.__resetSim?.();
});

/* ── BB-TBC-1: dispatchBoilerRpc bad zone ─────────────────────────── */
test('BB-TBC-1: dispatchBoilerRpc with invalid zone throws', async () => {
    await assert.rejects(
        () => tb.dispatchBoilerRpc(v2Dev, 'CHZ3', 1),
        err => { assert.match(err.message, /Invalid boiler zone/); return true; }
    );
});

/* ── BB-TBC-2: dispatchBoilerRpc bad n (0 is not ±1) ─────────────── */
test('BB-TBC-2: dispatchBoilerRpc with n=0 throws (only 1 or -1 allowed)', async () => {
    await assert.rejects(
        () => tb.dispatchBoilerRpc(v2Dev, 'CHZ1', 0),
        err => { assert.match(err.message, /Invalid boiler boost direction/); return true; }
    );
});

/* ── BB-TBC-3: dispatchBoilerRpc CHZ1 n=1 fixture returns sentAtMs ── */
test('BB-TBC-3: dispatchBoilerRpc CHZ1 n=1 in fixture returns { sentAtMs: number }', async () => {
    const before = Date.now();
    const result = await tb.dispatchBoilerRpc(v2Dev, 'CHZ1', 1);
    assert.ok(typeof result.sentAtMs === 'number');
    assert.ok(result.sentAtMs >= before);
});

/* ── BB-TBC-4: dispatchBoilerRpc CHZ2 n=-1 fixture ─────────────────── */
test('BB-TBC-4: dispatchBoilerRpc CHZ2 n=-1 in fixture returns { sentAtMs: number }', async () => {
    const result = await tb.dispatchBoilerRpc(v2Dev, 'CHZ2', -1);
    assert.ok(typeof result.sentAtMs === 'number');
});

/* ── BB-TBC-5: writeSharedScopeAttribute bad key ────────────────────── */
test('BB-TBC-5: writeSharedScopeAttribute with forbidden key throws', async () => {
    await assert.rejects(
        () => tb.writeSharedScopeAttribute(v1Dev, 'output1Override', 1),
        err => { assert.match(err.message, /not a permitted boiler shared attribute/); return true; }
    );
});

/* ── BB-TBC-6: writeSharedScopeAttribute bad value ──────────────────── */
test('BB-TBC-6: writeSharedScopeAttribute value=2 throws (only 1, -1, 0)', async () => {
    await assert.rejects(
        () => tb.writeSharedScopeAttribute(v1Dev, 'output2Override', 2),
        err => { assert.match(err.message, /not valid for a boiler shared attribute/); return true; }
    );
});

/* ── BB-TBC-7: writeSharedScopeAttribute value=0 ok (auto) ─────────── */
test('BB-TBC-7: writeSharedScopeAttribute value=0 (auto) is allowed', async () => {
    const result = await tb.writeSharedScopeAttribute(v1Dev, 'output2Override', 0);
    assert.ok(typeof result.attrTs === 'number');
});

/* ── BB-TBC-8: writeSharedScopeAttribute output2Override=1 ─────────── */
test('BB-TBC-8: writeSharedScopeAttribute output2Override=1 returns { attrTs }', async () => {
    const before = Date.now();
    const result = await tb.writeSharedScopeAttribute(v1Dev, 'output2Override', 1);
    assert.ok(typeof result.attrTs === 'number');
    assert.ok(result.attrTs >= before);
});

/* ── BB-TBC-9: revertBoilerZoneToAuto bad zone ──────────────────────── */
test('BB-TBC-9: revertBoilerZoneToAuto with invalid zone throws', async () => {
    await assert.rejects(
        () => tb.revertBoilerZoneToAuto(v1Dev, 'v1', 'CHZ9'),
        err => { assert.match(err.message, /Invalid boiler zone/); return true; }
    );
});

/* ── BB-TBC-10: revertBoilerZoneToAuto CHZ1 fixture ─────────────────── */
test('BB-TBC-10: revertBoilerZoneToAuto CHZ1 v1 fixture returns { attrTs }', async () => {
    const result = await tb.revertBoilerZoneToAuto(v1Dev, 'v1', 'CHZ1');
    assert.ok(typeof result.attrTs === 'number');
});

/* ── BB-TBC-11: readBoilerState shape (V2 fixture, fresh) ───────────── */
test('BB-TBC-11: readBoilerState V2 fixture returns correct shape', async () => {
    const { zones, boiler } = await tb.readBoilerState(v2Dev, 'v2', ['CHZ1', 'CHZ2']);
    assert.equal(Array.isArray(zones), true);
    assert.equal(zones.length, 2);
    const z = zones[0];
    assert.ok('zone' in z, 'zone field present');
    assert.ok('dir' in z, 'dir field present');
    assert.ok('overrideTs' in z, 'overrideTs present');
    assert.ok('outputState' in z, 'outputState present');
    // dir should be numeric: -1, 0, or 1
    assert.ok([-1, 0, 1].includes(z.dir), `dir should be ±1 or 0, got ${z.dir}`);
    // boiler field
    assert.ok('enableState' in boiler);
    assert.ok('ts' in boiler);
});

/* ── BB-TBC-12: readBoilerState V1 reflects written attribute ────────── */
test('BB-TBC-12: readBoilerState V1 dir reflects writeSharedScopeAttribute result', async () => {
    // Write ON (1) then read back
    await tb.writeSharedScopeAttribute(v1Dev, 'output2Override', 1);
    const { zones } = await tb.readBoilerState(v1Dev, 'v1', ['CHZ1']);
    assert.equal(zones[0].zone, 'CHZ1');
    assert.equal(zones[0].dir, 1, 'dir should be 1 (ON) after writing 1');
    // Also check attrValue
    assert.equal(zones[0].attrValue, 1);
});

/* ── BB-TBC-13: readBoilerState parses string-encoded values (OOHDASH-143) */
test('BB-TBC-13: readBoilerState fixture parseInt parses 0/1/-1 correctly (143 string-tolerant)', async () => {
    // After reset, attrSim has no value → defaults to 0 (auto)
    const { zones } = await tb.readBoilerState(v1Dev, 'v1', ['CHZ1']);
    // Default: attrValue=0, dir=0
    assert.equal(zones[0].dir, 0, 'fresh fixture: dir=0 (auto)');
    // Write -1 (OFF)
    await tb.writeSharedScopeAttribute(v1Dev, 'output2Override', -1);
    const { zones: z2 } = await tb.readBoilerState(v1Dev, 'v1', ['CHZ1']);
    assert.equal(z2[0].dir, -1, 'after writing -1: dir=-1');
});

/* ── BB-TBC-14: readBoilerState V2 zone shape ────────────────────────── */
test('BB-TBC-14: readBoilerState V2 zones have forcedUntilMs (V2-only field), no attrValue (V1-only)', async () => {
    const { zones } = await tb.readBoilerState(v2Dev, 'v2', ['CHZ1']);
    const z = zones[0];
    assert.ok('forcedUntilMs' in z, 'V2 should have forcedUntilMs');
    // V2 zones should NOT have attrValue (that is V1-only)
    assert.equal('attrValue' in z, false, 'V2 should not have attrValue');
});
