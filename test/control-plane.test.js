/**
 * Control plane (OOHDASH-123 Rosetta Stone) — the write re-plumb, three-outcome dispatch, registration
 * gate, registry guardrails and the WRITES_DISABLED primitive, driven through the REAL
 * control.dispatch()/watcher over the fixture seam (DATA_MODE=fixture). The pure three-outcome rules
 * (classifyOutcome / telemetryMatches / preDispatchCheck) + SERVER_SCOPE write/read endpoints are
 * unit-tested in rosetta-contract.test.js; this file exercises the end-to-end behaviour.
 *
 * node --test style; runs under `npm run test:unit` (--experimental-test-module-mocks).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.DATA_MODE = 'fixture';
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), 'ooh-cplane-'));
process.env.WRITES_DISABLED = 'false';
// OOHDASH-135 Item 3: Level B gate — control-plane tests dispatch against IT500-BAR-6832
// (salus-it500). Set the flag before any import so config.salusIt500CtlEnabled is true
// when control.js and config.js modules are first loaded. Tests for the DISABLED path
// are in oohdash-135.test.js (T1-4e) which uses a cache-busting import.
process.env.SALUS_IT500_CTL_ENABLED = 'true';
// OOHDASH-123: compress the per-class confirm timings + fixture trajectory so the real watcher settles
// quickly in the test (production defaults are seconds–minutes).
process.env.SYNC_POLL_INTERVAL_MS = '10';
process.env.OOH_SIM_STEP_MS = '30';
process.env.OOH_CONFIRM_POLL_MS_TUYA = '10';
process.env.OOH_CONFIRM_POLL_MS_SALUS = '10';
process.env.OOH_COPY_MIN_IT700 = '0';
process.env.OOH_COPY_MIN_IT500 = '0';
process.env.OOH_CONFIRM_LIMIT_MS_TUYA = '5000';
process.env.OOH_CONFIRM_LIMIT_MS_IT500 = '5000';
process.env.OOH_CONFIRM_LIMIT_MS_IT700 = '5000';
process.env.OOH_LATE_WATCH_MS_TUYA = '8000';
process.env.OOH_LATE_WATCH_MS_IT500 = '8000';
process.env.OOH_LATE_WATCH_MS_IT700 = '8000';

const { config } = await import('../config.js');
const registry = await import('../services/registry.js');
const tb = await import('../services/tb-client.js');
const control = await import('../services/control.js');
const resolution = await import('../services/resolution.js');

/* ============================ registry: ranges + switch + mode-held ============================ */

test('OOHDASH-82 §6 — Intesis aircon control is REMOVED: every setpoint command is refused', () => {
    assert.deepEqual(registry.capabilitiesFor('intesis').commands, [], 'intesis commands must be empty (aircon control removed)');
    const di = { deviceType: 'intesis', telemetry: { heatingSetpoint: 24 } };
    assert.equal(registry.validateCommand(di, 'setpoint', 25).ok, false, 'a previously-valid setpoint is now refused');
    assert.match(registry.validateCommand(di, 'setpoint', 25).reason, /does not support/i);
});

test('range validation — Salus IT500 window boundaries (±3 of current, within 5–35)', () => {
    const ds = { deviceType: 'salus-it500', telemetry: { heatingSetpoint: 20 } };
    assert.equal(registry.validateCommand(ds, 'setpoint', 17).ok, true, 'lower boundary ok');
    assert.equal(registry.validateCommand(ds, 'setpoint', 16.9).ok, false, 'below the ±3 window rejected');
    assert.equal(registry.validateCommand(ds, 'setpoint', 23).ok, true, 'upper boundary ok');
    assert.equal(registry.validateCommand(ds, 'setpoint', 23.1).ok, false, 'above the ±3 window rejected');
});

test('switch validation — strict boolean only; single-gang; non-boolean rejected; writes switchRequested', () => {
    const dt = { deviceType: 'tuya', telemetry: { switch_1: false } };
    assert.deepEqual(registry.validateCommand(dt, 'switch', true), { ok: true, attribute: 'switchRequested', value: true });
    assert.deepEqual(registry.validateCommand(dt, 'switch', false), { ok: true, attribute: 'switchRequested', value: false });
    assert.equal(registry.validateCommand(dt, 'switch', 1).ok, false, 'numeric 1 is not a boolean');
    assert.equal(registry.validateCommand(dt, 'switch', 'true').ok, false, 'string "true" is not a boolean');
});

test('refrigeration type — monitor-only; a switch is REJECTED (empty commands + deviceType backstop) [Stream A]', () => {
    assert.deepEqual(registry.capabilitiesFor('refrigeration').commands, []);
    const dr = { deviceType: 'refrigeration', telemetry: { switch_1: true } };
    assert.equal(registry.validateCommand(dr, 'switch', false).ok, false, 'a refrigeration device can never accept a switch');
    assert.match(registry.validateCommand(dr, 'switch', false).reason, /monitor-only|not permitted|switching/i);
    assert.equal(registry.validateCommand(dr, 'switch', true).ok, false);
});

test('mode rejected in v1 — no deviceType admits modeRequested (mode/on-off HELD)', () => {
    for (const type of ['intesis', 'salus-it500', 'salus-it700', 'tuya']) {
        const d = { deviceType: type, telemetry: { heatingSetpoint: 20, mode: 'heat' } };
        assert.equal(registry.validateCommand(d, 'mode', 'off').ok, false, `${type} must reject mode in v1`);
    }
    assert.equal(registry.capabilitiesFor('intesis').commands.includes('mode'), false, 'intesis has no mode command');
});

test('mode vocabulary is lowercase — no capitalised value could ever be admitted even if re-enabled', () => {
    assert.deepEqual(registry.capabilitiesFor('intesis').modes, ['off', 'heat', 'cool', 'auto', 'fan']);
});

/* ============================ dispatch: three-outcome + registration gate + pre-dispatch ============================ */

const SITE_NO = '6832';
const OPERATOR = { id: 'op-1', name: 'Handler One', email: 'h1@example.com' };
async function token(siteNo = SITE_NO) {
    const { token } = await resolution.confirmSite(siteNo, OPERATOR);
    return token;
}

beforeEach(() => { tb.__resetSim?.(); });

test('happy dispatch — a genuine change writes and settles CONFIRMED on accepted + fresh telemetry match', async () => {
    const action = await control.dispatch({
        operator: OPERATOR, confirmToken: await token(), siteNo: SITE_NO,
        deviceId: 'IT500-BAR-6832', command: 'setpoint', value: 19, direction: 'up'
    });
    assert.equal(action.state, 'in-flight');
    const settled = await waitForState(action.actionId, 'confirmed');
    assert.equal(String(settled.confirmedValue), '19');
});

test('registration gate — an unregistered device is rejected 409 (registration:true) before any write', async () => {
    assert.equal(await tb.hasPublishedState({ deviceId: 'X', deviceType: 'tuya', _demo: 'unregistered', telemetry: {} }), false);
    assert.equal(await tb.hasPublishedState({ deviceId: 'Y', deviceType: 'tuya', telemetry: {} }), true);
    await assert.rejects(
        control.dispatch({
            operator: OPERATOR, confirmToken: await token('6901'), siteNo: '6901',
            deviceId: 'TUYA-UNREG-6901', command: 'switch', value: true
        }),
        err => { assert.equal(err.status, 409); assert.equal(err.registration, true, 'carries registration:true'); return true; }
    );
});

test('dispatch already-satisfied — the device already reads the requested value → terminal already-set, NO write', async () => {
    const sites = await (await import('../services/bridge.js')).getSitesByNumber('6901');
    const dev = sites[0].devices.find(d => d.deviceId === 'TUYA-SW-6901');
    assert.equal(dev.telemetry.switch_1, false, 'fixture reads switch_1=false');
    const action = await control.dispatch({
        operator: OPERATOR, confirmToken: await token('6901'), siteNo: '6901',
        deviceId: 'TUYA-SW-6901', command: 'switch', value: false
    });
    assert.equal(action.state, 'already-set', 'terminal already-set, not in-flight');
    assert.equal(String(action.confirmedValue), 'false');
});

test('no 409 dead-end — a dispatch where the device has not confirmed PROCEEDS (DD-RESEND-UX removed duplicate-pending)', async () => {
    const dev = (await (await import('../services/bridge.js')).getSitesByNumber('6901'))[0].devices.find(d => d.deviceId === 'TUYA-DUP-6901');
    assert.equal(dev.telemetry.switch_1, false);
    const action = await control.dispatch({
        operator: OPERATOR, confirmToken: await token('6901'), siteNo: '6901',
        deviceId: 'TUYA-DUP-6901', command: 'switch', value: true
    });
    assert.equal(action.state, 'in-flight', 'the dispatch proceeds — no 409 dead-end');
});

/* ============================ revert edge-safety (§3.7) ============================ */

test('revert edge-safety — a device already at the revert value reverts truthfully (no false revert-failed)', async () => {
    const overrides = await import('../services/overrides.js');
    const store = await import('../services/store.js');
    // TUYA-SW-6901 reads switch_1=false; a hold whose revert value is false is already satisfied on the
    // device, so the edge-safe revert marks it 'reverted' with no write and raises NO revert-failed.
    const overrideId = await overrides.scheduleOverride({
        actionId: 'act-revert-1',
        operator: { id: 'op-1', name: 'Handler One' },
        siteNo: '6901', siteName: 'Control Bench',
        deviceId: 'TUYA-SW-6901', zone: 'Kitchen — fryers', deviceType: 'tuya',
        attribute: 'switchRequested', value: true, previousValue: false,
        hold: { revertAt: new Date(Date.now() - 1000).toISOString(), label: 'due now' }
    });
    await overrides.runWorkerOnce();
    const col = await store.collection('OohOverrides');
    const doc = await col.get(overrideId);
    assert.equal(doc.status, 'reverted', 'edge-safe revert marks reverted, not revert-failed');
});

/* ============================ WRITES_DISABLED primitive (D6) ============================ */

test('WRITES_DISABLED throws 423 on the LIVE write path; fixture writes are unaffected', async () => {
    const prevMode = config.dataMode, prevWD = config.writesDisabled;
    try {
        config.dataMode = 'live';
        config.writesDisabled = true;
        await assert.rejects(
            tb.writeServerScopeAttribute({ deviceId: 'D', deviceType: 'tuya' }, 'switchRequested', true),
            err => { assert.equal(err.status, 423, 'live write refused with 423 when WRITES_DISABLED'); return true; }
        );
        config.dataMode = 'fixture';
        await assert.doesNotReject(tb.writeServerScopeAttribute({ deviceId: 'FIXT', deviceType: 'tuya' }, 'switchRequested', true));
    } finally {
        config.dataMode = prevMode;
        config.writesDisabled = prevWD;
    }
    // Source-level: the throw sits on the live path, guarded by config.writesDisabled.
    const src = readFileSync(new URL('../services/tb-client.js', import.meta.url), 'utf8');
    assert.match(src, /if\s*\(config\.writesDisabled\)\s*throw[^;]*status:\s*423/);
});

/* ============================ source-level anti-drift ============================ */

test('no path emits a capitalised "Off" — client + registry are lowercase end-to-end', () => {
    const clientSrc = readFileSync(new URL('../public/js/control.js', import.meta.url), 'utf8');
    assert.doesNotMatch(clientSrc, /value:\s*'Off'/, "client must never dispatch value: 'Off'");
    const regSrc = readFileSync(new URL('../services/registry.js', import.meta.url), 'utf8');
    assert.doesNotMatch(regSrc, /modes:\s*\[\s*'Off'/, 'registry mode vocabulary must be lowercase');
});

/* ============================ helpers ============================ */

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForState(actionId, state, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const a = control.getAction(actionId);
        if (a && a.state === state) return a;
        if (Date.now() > deadline) throw new Error(`action ${actionId} did not reach '${state}' (last: ${a?.state})`);
        await sleep(5);
    }
}
