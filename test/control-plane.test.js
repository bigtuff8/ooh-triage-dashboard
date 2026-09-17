/**
 * Control plane (build increment 2, design §3/§13) — the confirm-loop redesign, edge classification,
 * registration gate, switchDesired wiring, mode-casing safety fix, setpoint ranges, revert
 * edge-safety and the WRITES_DISABLED primitive.
 *
 * Two layers:
 *   - BEHAVIOURAL: drives the REAL control.dispatch()/poll loop and confirm/registry helpers through
 *     the fixture seam (DATA_MODE=fixture). The fixture sim is edge-aware and carries `_demo` variants
 *     (already / duplicate / rejected / stale-synced / unregistered) so the new paths are exercisable
 *     with no live portal call and no real waiting beyond the sim's ~2.5s settle.
 *   - SOURCE-LEVEL (anti-drift): asserts the load-bearing invariants that a behavioural test can't see
 *     directly — the confirm read hits /values/timeseries (NOT /values/attributes), no path emits a
 *     capitalised 'Off', and intesis.commands carries no 'mode'.
 *
 * node --test style; runs under `npm run test:unit` (--experimental-test-module-mocks).
 */
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DATA_MODE = 'fixture';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-cplane-'));
process.env.WRITES_DISABLED = 'false';       // fixture writes don't hit the guard; dispatch tests need it off
// The fixture sim settles ~2.5s after a write; keep the decide-now deadline well beyond that so the
// happy dispatch settles 'synced' (not 'timeout'→'late-synced') and the poll sweep is snappy.
process.env.SYNC_TIMEOUT_MS = '30000';
process.env.SYNC_POLL_INTERVAL_MS = '10';

const { config } = await import('../config.js');
const registry = await import('../services/registry.js');
const confirm = await import('../services/confirm.js');
const tb = await import('../services/tb-client.js');
const control = await import('../services/control.js');
const resolution = await import('../services/resolution.js');

/* ============================ pure helpers: confirm.js ============================ */

test('isSettled requires a FRESH synced echo of the exact value (syncTs > dispatchTs)', () => {
    const dts = 1000;
    assert.equal(confirm.isSettled({ sync: 'synced', reported: 19, syncTs: 1001 }, 19, dts), true);
    // stale synced (syncTs <= dispatchTs) is NOT a settle — the stale-synced trap
    assert.equal(confirm.isSettled({ sync: 'synced', reported: 19, syncTs: 999 }, 19, dts), false);
    // synced but wrong value never settles
    assert.equal(confirm.isSettled({ sync: 'synced', reported: 18, syncTs: 2000 }, 19, dts), false);
    // no syncTs (lazy confirm key absent) never settles
    assert.equal(confirm.isSettled({ sync: 'synced', reported: 19, syncTs: null }, 19, dts), false);
    // number/string coercion tolerated (TB wire shape)
    assert.equal(confirm.isSettled({ sync: 'synced', reported: '19', syncTs: 1001 }, 19, dts), true);
    assert.equal(confirm.isSettled({ sync: 'synced', reported: 'true', syncTs: 1001 }, true, dts), true);
});

test('isFreshTerminal gates failed/rejected on a fresh syncTs too', () => {
    assert.equal(confirm.isFreshTerminal({ sync: 'failed', syncTs: 1001 }, 1000), true);
    assert.equal(confirm.isFreshTerminal({ sync: 'rejected', syncTs: 1001 }, 1000), true);
    assert.equal(confirm.isFreshTerminal({ sync: 'failed', syncTs: 999 }, 1000), false, 'stale failed does not count');
    assert.equal(confirm.isFreshTerminal({ sync: 'pending', syncTs: 2000 }, 1000), false);
});

/* ============================ registry: ranges + switch + mode-held ============================ */

test('range validation — Intesis device range is 16–32 (33 out of range)', () => {
    const r = registry.capabilitiesFor('intesis').deviceRange;
    assert.equal(r.min, 16);
    assert.equal(r.max, 32, 'Intesis corrected to 16–32');
    // The effective window is APP_POLICY (±3 / cap 25) intersected with the device range; 33 is out
    // of the device range and can never be admitted.
    const di = { deviceType: 'intesis', telemetry: { heatingSetpoint: 24 } };
    assert.equal(registry.validateCommand(di, 'setpoint', 33).ok, false, '33 rejected');
    assert.equal(registry.validateCommand(di, 'setpoint', 25).ok, true, '25 within ±3 and the cap');
});

test('range validation — Salus IT500 window boundaries (±3 of current, within 5–35)', () => {
    const ds = { deviceType: 'salus-it500', telemetry: { heatingSetpoint: 20 } };
    // window @20 → 17–23
    assert.equal(registry.validateCommand(ds, 'setpoint', 17).ok, true, 'lower boundary ok');
    assert.equal(registry.validateCommand(ds, 'setpoint', 16.9).ok, false, 'below the ±3 window rejected');
    assert.equal(registry.validateCommand(ds, 'setpoint', 23).ok, true, 'upper boundary ok');
    assert.equal(registry.validateCommand(ds, 'setpoint', 23.1).ok, false, 'above the ±3 window rejected');
});

test('switch validation — strict boolean only; single-gang; non-boolean rejected', () => {
    const dt = { deviceType: 'tuya', telemetry: { switch_1: false } };
    assert.deepEqual(registry.validateCommand(dt, 'switch', true), { ok: true, attribute: 'switchDesired', value: true });
    assert.deepEqual(registry.validateCommand(dt, 'switch', false), { ok: true, attribute: 'switchDesired', value: false });
    assert.equal(registry.validateCommand(dt, 'switch', 1).ok, false, 'numeric 1 is not a boolean');
    assert.equal(registry.validateCommand(dt, 'switch', 'true').ok, false, 'string "true" is not a boolean');
    assert.equal(registry.validateCommand(dt, 'switch', 'on').ok, false, 'string "on" is not a boolean');
});

test('mode rejected in v1 — no deviceType admits modeDesired (mode/on-off HELD)', () => {
    for (const type of ['intesis', 'salus-it500', 'salus-it700', 'tuya']) {
        const d = { deviceType: type, telemetry: { heatingSetpoint: 20, mode: 'heat' } };
        assert.equal(registry.validateCommand(d, 'mode', 'off').ok, false, `${type} must reject mode in v1`);
        assert.equal(registry.validateCommand(d, 'mode', 'heat').ok, false, `${type} must reject mode in v1`);
    }
    // intesis.commands carries no 'mode' (the safety cut)
    assert.equal(registry.capabilitiesFor('intesis').commands.includes('mode'), false, 'intesis has no mode command');
});

test('mode vocabulary is lowercase — no capitalised value could ever be admitted even if re-enabled', () => {
    // The stored vocabulary is lowercase, and validateCommand lower-cases before the membership test,
    // so a capitalised 'Off' can never round-trip to modeDesired: 'Off' (the AC-switches-on hazard).
    assert.deepEqual(registry.capabilitiesFor('intesis').modes, ['off', 'heat', 'cool', 'auto', 'fan']);
});

/* ============================ dispatch: edge classification + registration gate ============================ */

// A fresh confirmed single-use token for the standard fixture target.
const SITE_NO = '6832';
const OPERATOR = { id: 'op-1', name: 'Handler One', email: 'h1@example.com' };
async function token(siteNo = SITE_NO) {
    const { token } = await resolution.confirmSite(siteNo, OPERATOR);
    return token;
}

beforeEach(() => {
    // Isolate the fixture sim between tests so an earlier write doesn't pre-satisfy a later one.
    tb.__resetSim?.();
});

test('happy dispatch — a genuine change writes and settles synced on a fresh echo', async () => {
    // Setpoint on a fixture IT500 at 18 → 19 (within window). Dispatch, then let the sim settle.
    const action = await control.dispatch({
        operator: OPERATOR, confirmToken: await token(), siteNo: SITE_NO,
        deviceId: 'IT500-BAR-6832', command: 'setpoint', value: 19, direction: 'up'
    });
    assert.equal(action.state, 'pending');
    const settled = await waitForState(action.actionId, 'synced');
    assert.equal(String(settled.reported), '19');
});

test('edge-trigger no-op — already-satisfied returns a terminal already-set with NO write', async () => {
    // Pre-seed: write 19 and let it settle synced, so a second identical request is already-satisfied.
    const dev = { deviceId: 'EDGE-1', deviceType: 'salus-it500', telemetry: { heatingSetpoint: 18 }, _demo: 'already' };
    // `already` pre-settles a fresh synced echo at the written value on first write.
    await tb.writeSharedAttribute(dev, 'setpointDesired', 19);
    const edge = await confirm.classifyPreDispatch(tb, dev, 'setpointDesired', 19);
    assert.equal(edge.outcome, 'already-satisfied');
});

test('duplicate-pending — an identical un-confirmed change is a no-op (re-send would not move the edge-triggered bridge)', async () => {
    const dev = { deviceId: 'DUP-1', deviceType: 'salus-it500', telemetry: { heatingSetpoint: 18 }, _demo: 'duplicate' };
    await tb.writeSharedAttribute(dev, 'setpointDesired', 19);   // desired set, stays pending forever
    const edge = await confirm.classifyPreDispatch(tb, dev, 'setpointDesired', 19);
    assert.equal(edge.outcome, 'duplicate-pending');
});

test('registration gate — an unregistered device is rejected 409 (registration:true) before any write', async () => {
    // Direct assert on the gate primitive…
    assert.equal(await tb.hasPublishedState({ deviceId: 'X', deviceType: 'tuya', _demo: 'unregistered', telemetry: {} }), false);
    assert.equal(await tb.hasPublishedState({ deviceId: 'Y', deviceType: 'tuya', telemetry: {} }), true);
    // …and behaviourally through the full dispatch: TUYA-UNREG-6901 is flagged unregistered.
    await assert.rejects(
        control.dispatch({
            operator: OPERATOR, confirmToken: await token('6901'), siteNo: '6901',
            deviceId: 'TUYA-UNREG-6901', command: 'switch', value: true
        }),
        err => { assert.equal(err.status, 409); assert.equal(err.registration, true, 'carries registration:true'); return true; }
    );
});

test('dispatch already-satisfied — a prior command already at the value returns terminal already-set with NO write', async () => {
    // Simulate a prior command already confirmed at switch=true on this device (desired + fresh synced).
    const site = (await import('../services/bridge.js')).getSitesByNumber;
    const sites = await site('6901');
    const dev = sites[0].devices.find(d => d.deviceId === 'TUYA-SW-6901');
    await tb.writeSharedAttribute(dev, 'switchDesired', true);   // desired now true
    await sleep(2700);                                            // let it settle synced (fresh echo)
    const before = await tb.readControlState(dev, 'switchDesired');
    assert.equal(before.sync, 'synced');

    // A dispatch of the SAME value is already-satisfied: terminal already-set, no state change on the sim.
    const action = await control.dispatch({
        operator: OPERATOR, confirmToken: await token('6901'), siteNo: '6901',
        deviceId: 'TUYA-SW-6901', command: 'switch', value: true
    });
    assert.equal(action.state, 'already-set', 'terminal already-set, not pending');
    assert.equal(String(action.reported), 'true');
});

test('dispatch duplicate-pending — an identical in-flight change is rejected 409 (duplicatePending)', async () => {
    const getByNumber = (await import('../services/bridge.js')).getSitesByNumber;
    const dev = (await getByNumber('6901'))[0].devices.find(d => d.deviceId === 'TUYA-DUP-6901');
    // Seed an in-flight (never-confirming) desired=true via a prior write (_demo:'duplicate' stays pending).
    await tb.writeSharedAttribute(dev, 'switchDesired', true);
    const st = await tb.readControlState(dev, 'switchDesired');
    assert.equal(st.sync, 'pending');
    // A dispatch of the same value must surface duplicate-pending, not silently do nothing.
    await assert.rejects(
        control.dispatch({
            operator: OPERATOR, confirmToken: await token('6901'), siteNo: '6901',
            deviceId: 'TUYA-DUP-6901', command: 'switch', value: true
        }),
        err => { assert.equal(err.status, 409); assert.equal(err.duplicatePending, true); return true; }
    );
});

/* ============================ confirm loop: stale-synced trap + fresh terminals ============================ */

test('stale-synced → times out (the trap is closed): a silently-ignored value never lands a fresh echo', async () => {
    const dev = { deviceId: 'STALE-1', deviceType: 'salus-it700', telemetry: { heatingSetpoint: 20 }, _demo: 'stale-synced' };
    const dispatchTs = Date.now();
    await tb.writeSharedAttribute(dev, 'setpointDesired', 22);
    const state = await tb.readControlState(dev, 'setpointDesired');
    // The device reports a stale 'synced' of the OLD value with an old syncTs — NOT a settle.
    assert.equal(state.sync, 'synced');
    assert.equal(confirm.isSettled(state, 22, dispatchTs), false, 'stale synced is rejected → the action times out honestly');
});

test('failed on fresh syncTs settles failed; a stale failed does not', async () => {
    const dev = { deviceId: 'FAIL-1', deviceType: 'salus-it500', telemetry: { heatingSetpoint: 20 }, _demo: 'fail' };
    const dispatchTs = Date.now();
    await tb.writeSharedAttribute(dev, 'setpointDesired', 21);
    await sleep(2700);
    const state = await tb.readControlState(dev, 'setpointDesired');
    assert.equal(state.sync, 'failed');
    assert.equal(confirm.isFreshTerminal(state, dispatchTs), true);
    assert.equal(confirm.isFreshTerminal(state, state.syncTs + 1000), false, 'a stale failed does not count');
});

test('rejected on fresh syncTs is a fresh terminal', async () => {
    const dev = { deviceId: 'REJ-1', deviceType: 'salus-it500', telemetry: { heatingSetpoint: 20 }, _demo: 'rejected' };
    const dispatchTs = Date.now();
    await tb.writeSharedAttribute(dev, 'setpointDesired', 21);
    await sleep(2700);
    const state = await tb.readControlState(dev, 'setpointDesired');
    assert.equal(state.sync, 'rejected');
    assert.equal(confirm.isFreshTerminal(state, dispatchTs), true);
});

test('switch e2e — a switchDesired dispatch settles synced on a fresh boolean echo', async () => {
    const dev = { deviceId: 'SW-1', deviceType: 'tuya', telemetry: { switch_1: false } };
    const dispatchTs = Date.now();
    await tb.writeSharedAttribute(dev, 'switchDesired', true);
    await sleep(2700);
    const state = await tb.readControlState(dev, 'switchDesired');
    assert.equal(state.sync, 'synced');
    assert.equal(String(state.reported), 'true');
    assert.equal(confirm.isSettled(state, true, dispatchTs), true);
});

/* ============================ revert edge-safety (§3.7) ============================ */

test('revert edge-safety — a device already at the revert value reverts truthfully (no false revert-failed)', async () => {
    const overrides = await import('../services/overrides.js');
    const getByNumber = (await import('../services/bridge.js')).getSitesByNumber;
    const dev = (await getByNumber('6901'))[0].devices.find(d => d.deviceId === 'TUYA-SW-6901');

    // The device's own schedule already reclaimed the slot: desired is at the revert value (false) and
    // freshly confirmed. A revert that re-writes the same value would dispatch NOTHING (edge-triggered)
    // and — without the edge-safe classify — would time out into a FALSE revert-failed.
    await tb.writeSharedAttribute(dev, 'switchDesired', false);
    await sleep(2700);
    const at = await tb.readControlState(dev, 'switchDesired');
    assert.equal(at.sync, 'synced');
    assert.equal(String(at.reported), 'false');

    // Schedule a (due-now) hold whose revertValue is exactly that already-present value.
    const overrideId = await overrides.scheduleOverride({
        actionId: 'act-revert-1',
        operator: { id: 'op-1', name: 'Handler One' },
        siteNo: '6901', siteName: 'Control Bench',
        deviceId: 'TUYA-SW-6901', zone: 'Kitchen — fryers', deviceType: 'tuya',
        attribute: 'switchDesired', value: true, previousValue: false,
        hold: { revertAt: new Date(Date.now() - 1000).toISOString(), label: 'due now' }
    });
    await overrides.runWorkerOnce();

    const col = await (await import('../services/store.js')).collection('OohOverrides');
    const doc = await col.get(overrideId);
    assert.equal(doc.status, 'reverted', 'edge-safe revert marks reverted, not revert-failed');
});

/* ============================ WRITES_DISABLED primitive (D6) ============================ */

test('WRITES_DISABLED throws 423 on the LIVE write path; fixture writes are unaffected', async () => {
    // The guard is `if (config.writesDisabled) throw {status:423}` on the LIVE branch of
    // writeSharedAttribute (after the fixture short-circuit). Flip the shared config to the locked
    // live posture for the duration of this one assertion, then restore. (config.js snapshots env at
    // import; the module is already loaded here, so we exercise the guard by toggling the object.)
    const prevMode = config.dataMode, prevWD = config.writesDisabled;
    try {
        config.dataMode = 'live';
        config.writesDisabled = true;
        await assert.rejects(
            tb.writeSharedAttribute({ deviceId: 'D', deviceType: 'tuya' }, 'switchDesired', true),
            err => { assert.equal(err.status, 423, 'live write refused with 423 when WRITES_DISABLED'); return true; }
        );
        // Fixture writes are unaffected by the deploy-time lock (the fixture branch precedes the guard).
        config.dataMode = 'fixture';
        await assert.doesNotReject(tb.writeSharedAttribute({ deviceId: 'FIXT', deviceType: 'tuya' }, 'switchDesired', true));
    } finally {
        config.dataMode = prevMode;
        config.writesDisabled = prevWD;
    }
    // Source-level: the throw sits on the live path, guarded by config.writesDisabled.
    const src = readFileSync(new URL('../services/tb-client.js', import.meta.url), 'utf8');
    assert.match(src, /if\s*\(config\.writesDisabled\)\s*throw[^;]*status:\s*423/);
});

/* ============================ source-level anti-drift (§13) ============================ */

test('wrong-endpoint regression — readControlState reads /values/timeseries, NOT /values/attributes', () => {
    const src = readFileSync(new URL('../services/tb-client.js', import.meta.url), 'utf8');
    // The confirm read must hit the timeseries endpoint (the *Reported/*SyncStatus keys are telemetry).
    const readFn = src.slice(src.indexOf('export async function readControlState'));
    const body = readFn.slice(0, readFn.indexOf('export async function readDesiredState'));
    assert.match(body, /\/values\/timeseries\?keys=/, 'readControlState must GET /values/timeseries');
    assert.doesNotMatch(body, /\/values\/attributes\?keys=/, 'readControlState must NOT read /values/attributes (the confirm-loop bug)');
});

test('no path emits a capitalised "Off" — client + registry are lowercase end-to-end', () => {
    const clientSrc = readFileSync(new URL('../public/js/control.js', import.meta.url), 'utf8');
    // The dispatched value for modeoff must be lowercase 'off'; a bare 'Off' string literal being
    // POSTed would be the AC-switches-on hazard.
    assert.doesNotMatch(clientSrc, /value:\s*'Off'/, "client must never dispatch value: 'Off'");
    assert.doesNotMatch(clientSrc, /modeoff\s*\?\s*'Off'/, "client must not map modeoff to 'Off'");
    const regSrc = readFileSync(new URL('../services/registry.js', import.meta.url), 'utf8');
    assert.doesNotMatch(regSrc, /modes:\s*\[\s*'Off'/, 'registry mode vocabulary must be lowercase');
});

/* ============================ helpers ============================ */

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForState(actionId, state, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const a = control.getAction(actionId);
        if (a && a.state === state) return a;
        if (Date.now() > deadline) throw new Error(`action ${actionId} did not reach '${state}' (last: ${a?.state})`);
        await sleep(5);
    }
}
