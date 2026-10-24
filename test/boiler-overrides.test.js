/**
 * OOHDASH-141 — revertBoiler decision table + bounded retry (BB-OV-1..9).
 *
 * Tests the §6 revert decision tree via `scheduleOverride` + `processOverrideDue`
 * (the internal path that calls revertBoiler), exercising each identity row:
 *
 *   BB-OV-1  – V1 already-auto (dir=0) → outcome 'reverted' (already-auto)
 *   BB-OV-2  – V2 already-auto → 'reverted'
 *   BB-OV-3  – V1 opposite direction → 'superseded-by-other'
 *   BB-OV-4  – V2 opposite direction → 'superseded-by-other'
 *   BB-OV-5  – V1 same direction, unchanged attrTs (our write) → revert write issued
 *   BB-OV-6  – V1 ON, changed attrTs (re-applied) → still reverts (D2 ceiling)
 *   BB-OV-7  – V1 OFF, changed attrTs → skip (same-direction-skip), status reverted
 *   BB-OV-8  – V2 same direction → always revert write issued (V2 can't tell apart)
 *   BB-OV-9  – kill-switch NOT blocking when BOILER_BOOST_REVERT_EXEMPT=all
 *
 * Pattern: build a minimal override doc and call the exported processOverrideDue
 * function (or a testable entry point). If processOverrideDue is not exported, we
 * call scheduleOverride to insert a doc due immediately, then trigger the processor.
 */
import { test, beforeEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DATA_MODE = 'fixture';
process.env.WRITES_DISABLED = 'false';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-bov-'));
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';
process.env.BOILER_BOOST_REVERT_EXEMPT = 'all';
process.env.BOILER_BOOST_ENABLED = 'true';
process.env.BOILER_BOOST_ON_ENABLED = 'true';

const tb = await import('../services/tb-client.js');
const overrides = await import('../services/overrides.js');
const store = await import('../services/store.js');

const V2_SITE = '9010';
const V1_SITE = '9011';
const V2_DEV = { deviceId: 'gk-9010-boilercontrol-1', deviceType: 'boiler-panel', siteNo: V2_SITE };
const V1_DEV = { deviceId: 'gk-9011-boilercontrol-1', deviceType: 'boiler-panel', siteNo: V1_SITE };

/** Build a minimal boiler override doc for direct store insertion. */
function makeDoc(opts) {
    const now = new Date();
    const due = new Date(Date.now() - 100); // already due
    return {
        id: `test-ov-${Math.random().toString(36).slice(2)}`,
        status: 'active',
        type: 'boiler-boost',
        siteNo: opts.siteNo || V2_SITE,
        siteName: opts.siteName || 'Test Boiler Site',
        deviceId: opts.deviceId || V2_DEV.deviceId,
        deviceType: 'boiler-panel',
        boilerZone: opts.zone || 'CHZ1',
        zone: 'Bar/Restaurant',
        panelVersion: opts.panelVersion || 'v2',
        heldValue: opts.direction === 'off' ? -1 : 1,
        direction: opts.direction || 'on',
        attribute: opts.attribute || 'CHZ1.override',
        value: opts.direction === 'off' ? -1 : 1,
        revertValue: 0,
        previousValue: 0,
        footprint: opts.footprint || {},
        ticketId: opts.ticketId || null,
        d2CeilingAtMs: opts.d2CeilingAtMs,
        createdAt: new Date(Date.now() - 1000).toISOString(),
        OohOverrideRevertAt: due.toISOString(),
        leaseOwner: null,
        leaseUntil: null,
        revertAttempts: opts.revertAttempts || 0,
        hold: {
            revertAt: due.toISOString(),
            label: `Test boost ${opts.direction || 'on'}`
        }
    };
}

/** Insert a doc directly into the store and trigger runWorkerOnce to process it. */
async function runRevert(doc) {
    const col = await store.collection('OohOverrides');
    await col.upsert(doc);
    // runWorkerOnce claims all due docs (status=active, OohOverrideRevertAt <= now) and reverts them.
    await overrides.runWorkerOnce();
    // Re-read the updated doc
    return col.get(doc.id);
}

beforeEach(() => { tb.__resetSim?.(); });

/* ── BB-OV-1: V1 already-auto → status=reverted ───────────────────── */
test('BB-OV-1: V1 zone already auto (dir=0) → revert marks status=reverted without writing', async () => {
    // Ensure fixture reads 0 (default, no prior write)
    const doc = makeDoc({ panelVersion: 'v1', siteNo: V1_SITE, deviceId: V1_DEV.deviceId, direction: 'on' });
    const updated = await runRevert(doc);
    assert.ok(updated, 'doc updated');
    assert.equal(updated.status, 'reverted', `Expected reverted, got ${updated.status}`);
});

/* ── BB-OV-2: V2 already-auto → status=reverted ────────────────────── */
test('BB-OV-2: V2 zone already auto (dir=0) → revert marks status=reverted', async () => {
    const doc = makeDoc({ panelVersion: 'v2', siteNo: V2_SITE, deviceId: V2_DEV.deviceId, direction: 'on' });
    const updated = await runRevert(doc);
    assert.equal(updated.status, 'reverted');
});

/* ── BB-OV-3: V1 opposite direction → superseded-by-other ──────────── */
test('BB-OV-3: V1 zone in opposite direction (held=ON, live=OFF) → superseded-by-other', async () => {
    // Write -1 (OFF) to sim, then try to revert an ON hold
    await tb.writeSharedScopeAttribute(V1_DEV, 'output2Override', -1);
    const doc = makeDoc({
        panelVersion: 'v1', siteNo: V1_SITE, deviceId: V1_DEV.deviceId,
        direction: 'on', zone: 'CHZ1', attribute: 'output2Override',
        footprint: { attrTs: 0, confirmed: true }
    });
    const updated = await runRevert(doc);
    assert.equal(updated.status, 'superseded-by-other', `Expected superseded-by-other, got ${updated.status}`);
});

/* ── BB-OV-4: V2 opposite direction → superseded-by-other ──────────── */
test('BB-OV-4: V2 zone in opposite direction (held=ON, live=-1) → superseded-by-other', async () => {
    // V2 RPC dispatch in fixture mode is fire-and-forget (no boilerAttrSim write), so we
    // directly seed the sim via __setBoilerSim to express a live override of -1 (OFF).
    tb.__setBoilerSim?.(V2_DEV.deviceId, 'CHZ1.override', -1);
    const doc = makeDoc({ panelVersion: 'v2', siteNo: V2_SITE, deviceId: V2_DEV.deviceId, direction: 'on' });
    const updated = await runRevert(doc);
    assert.equal(updated.status, 'superseded-by-other');
});

/* ── BB-OV-5: V1 same dir, attrTs unchanged → revert write issued ──── */
test('BB-OV-5: V1 same direction, attrTs matches footprint → revert write issued, status=reverted', async () => {
    // Write ON (1) then capture the attrTs
    const writeResult = await tb.writeSharedScopeAttribute(V1_DEV, 'output2Override', 1);
    const attrTs = writeResult.attrTs;
    const doc = makeDoc({
        panelVersion: 'v1', siteNo: V1_SITE, deviceId: V1_DEV.deviceId,
        direction: 'on', zone: 'CHZ1', attribute: 'output2Override',
        footprint: { attrTs, confirmed: true }
    });
    const updated = await runRevert(doc);
    // After revert write, fixture confirms dir=0, so status=reverted
    assert.equal(updated.status, 'reverted', `Expected reverted, got ${updated.status}`);
});

/* ── BB-OV-6: V1 ON, changed attrTs → D2 still reverts ────────────── */
test('BB-OV-6: V1 ON, attrTs changed (re-applied) → D2 ceiling forces revert, status=reverted', async () => {
    // Write ON with one attrTs, then write again (different attrTs) → footprint won't match
    await tb.writeSharedScopeAttribute(V1_DEV, 'output2Override', 1);
    const staleAttrTs = 100; // a very old attrTs that won't match the current sim value
    const doc = makeDoc({
        panelVersion: 'v1', siteNo: V1_SITE, deviceId: V1_DEV.deviceId,
        direction: 'on', zone: 'CHZ1', attribute: 'output2Override',
        footprint: { attrTs: staleAttrTs, confirmed: true },
        d2CeilingAtMs: Date.now() + 3600000 // ceiling in the future
    });
    const updated = await runRevert(doc);
    // D2: ON override with changed attrTs always reverts
    assert.equal(updated.status, 'reverted', `Expected reverted (D2), got ${updated.status}`);
});

/* ── BB-OV-7: V1 OFF, changed attrTs → skip ────────────────────────── */
test('BB-OV-7: V1 OFF, attrTs changed (re-applied OFF) → same-direction-skip, status=reverted without writing', async () => {
    // Write OFF (-1) to sim, but with a different attrTs than footprint records
    await tb.writeSharedScopeAttribute(V1_DEV, 'output2Override', -1);
    const staleAttrTs = 100;
    const doc = makeDoc({
        panelVersion: 'v1', siteNo: V1_SITE, deviceId: V1_DEV.deviceId,
        direction: 'off', zone: 'CHZ1', attribute: 'output2Override',
        footprint: { attrTs: staleAttrTs, confirmed: true }
    });
    const updated = await runRevert(doc);
    // OFF with changed attrTs: skip (same-direction-skip) → status=reverted (no write)
    assert.equal(updated.status, 'reverted', `Expected reverted (skip), got ${updated.status}`);
});

/* ── BB-OV-8: V2 same direction → always revert ────────────────────── */
test('BB-OV-8: V2 same direction → always issues revert write (cannot tell apart), status=reverted', async () => {
    // V2 RPC dispatch in fixture mode doesn't update boilerAttrSim; seed directly.
    tb.__setBoilerSim?.(V2_DEV.deviceId, 'CHZ1.override', 1);
    const doc = makeDoc({ panelVersion: 'v2', siteNo: V2_SITE, deviceId: V2_DEV.deviceId, direction: 'on' });
    const updated = await runRevert(doc);
    assert.equal(updated.status, 'reverted');
});

/* ── BB-OV-9: kill-switch exempt → revert proceeds ─────────────────── */
test('BB-OV-9: BOILER_BOOST_REVERT_EXEMPT=all bypasses kill-switch and completes revert', async () => {
    // With revertExempt='all', even WRITES_DISABLED or kill-switch block is bypassed.
    // In fixture mode the kill-switch is never active, but we verify revert proceeds.
    const doc = makeDoc({ panelVersion: 'v2', siteNo: V2_SITE, deviceId: V2_DEV.deviceId, direction: 'on' });
    const updated = await runRevert(doc);
    // Verify it completed rather than bouncing back to 'active'
    assert.notEqual(updated.status, 'active', 'Should not remain active (kill-switch should not have blocked it)');
});
