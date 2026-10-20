/**
 * OOHDASH-123 Rosetta Stone — contract unit tests (design §3-§9, build plan §10, WU15).
 *
 * Focused coverage of the new primitives that the behavioural control-plane suite exercises end-to-end:
 *   - the SERVER_SCOPE Requested write endpoint + allow-list (writeServerScopeAttribute);
 *   - the SERVER_SCOPE+telemetry confirm read keeping the telemetry ts (readCommandState);
 *   - the three-outcome classifier + echo-before-accepted + cross-clock stale guard (classifyOutcome);
 *   - telemetry match rules (numeric +/-0.25, bool normalisation);
 *   - pre-dispatch "already satisfied from telemetry, no 409" (preDispatchCheck);
 *   - humane error translation (never leaks a gate:/vendor: string);
 *   - read-path mapping (bare switch, setPoint) + the per-class contract.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

process.env.DATA_MODE = 'fixture';

const confirm = await import('../services/confirm.js');
const errors = await import('../services/errors.js');
const registry = await import('../services/registry.js');
const tb = await import('../services/tb-client.js');
const device = await import('../services/tb-device.js');

const TUYA = registry.capabilitiesContractFor('tuya');
const IT700 = registry.capabilitiesContractFor('salus-it700');

/* -------------------- per-class contract -------------------- */

test('contract: IT700 confirms on heatingSetpoint ONLY; Tuya on switch_1 then bare switch', () => {
    assert.deepEqual(IT700.confirmKeys, ['heatingSetpoint'], 'never setPoint for IT700 (event-driven, stale)');
    assert.equal(IT700.requestedKey, 'setpointRequested');
    assert.equal(IT700.scope, 'SERVER_SCOPE');
    assert.deepEqual(TUYA.confirmKeys, ['switch_1', 'switch']);
    assert.equal(TUYA.requestedKey, 'switchRequested');
    // OOHDASH-135 Item 3: salus-it500 CONTROL_CONTRACT is now controllable: true (flag gate in
    // routes/api.js + services/control.js keeps it locked until SALUS_IT500_CTL_ENABLED=true).
    // The bare-salus (dark) type remains non-controllable — separate entry, not touched by Item 3.
    assert.equal(registry.capabilitiesContractFor('salus-it500').controllable, true);
    assert.equal(registry.capabilitiesContractFor('salus').controllable, false);
});

/* -------------------- write primitive (SERVER_SCOPE, allow-list) -------------------- */

test('writeServerScopeAttribute: refuses a non-Requested (e.g. a Desired) key', async () => {
    await assert.rejects(tb.writeServerScopeAttribute({ deviceId: 'D', deviceType: 'tuya' }, 'switchDesired', true),
        /not a permitted control request attribute/);
});

test('writeServerScopeAttribute writes SERVER_SCOPE (never Desired/SHARED_SCOPE); readCommandState reads SERVER_SCOPE attrs + telemetry ts', () => {
    const src = readFileSync(new URL('../services/tb-client.js', import.meta.url), 'utf8');
    const wfn = src.slice(src.indexOf('export async function writeServerScopeAttribute'), src.indexOf('export async function readCommandState'));
    assert.match(wfn, /\/attributes\/SERVER_SCOPE/, 'the Requested write targets SERVER_SCOPE');
    assert.doesNotMatch(wfn, /SHARED_SCOPE/, 'the Requested write must not target SHARED_SCOPE (that was the gate-bypassing bug)');
    const rfn = src.slice(src.indexOf('export async function readCommandState'), src.indexOf('export function __resetSim'));
    assert.match(rfn, /values\/attributes\/SERVER_SCOPE/, 'status/error read from SERVER_SCOPE attributes');
    assert.match(rfn, /values\/timeseries/, 'the confirming telemetry is read from timeseries');
    assert.match(rfn, /series\[0\]\.ts/, 'the telemetry ts is retained for the staleness guard');
});

/* -------------------- telemetry match -------------------- */

test('telemetryMatches: numeric +/-0.25 tolerance; bool on/off normalisation', () => {
    assert.equal(confirm.telemetryMatches(19.0, 19.2, IT700), true, 'within 0.25');
    assert.equal(confirm.telemetryMatches(19.0, 19.3, IT700), false, 'outside 0.25');
    assert.equal(confirm.telemetryMatches('on', true, TUYA), true);
    assert.equal(confirm.telemetryMatches('false', false, TUYA), true);
    assert.equal(confirm.telemetryMatches(null, true, TUYA), false);
});

/* -------------------- three-outcome classifier -------------------- */

test('classifyOutcome: CONFIRMED needs accepted AND telemetry match AND ts>dispatchTs (all three)', () => {
    const dts = 1000;
    assert.equal(confirm.classifyOutcome({ status: 'accepted', statusTs: 1100, telemetryValue: true, telemetryTs: 1200 }, true, dts, TUYA), 'CONFIRMED');
    // accepted but telemetry not yet matched → in-flight (never success)
    assert.equal(confirm.classifyOutcome({ status: 'accepted', statusTs: 1100, telemetryValue: false, telemetryTs: 1200 }, true, dts, TUYA), 'IN-FLIGHT');
    // telemetry match but status still pending → NOT confirmed (cross-clock guard)
    assert.equal(confirm.classifyOutcome({ status: 'pending', statusTs: 1100, telemetryValue: true, telemetryTs: 1200 }, true, dts, TUYA), 'IN-FLIGHT');
    // stale telemetry (ts <= dispatchTs) with accepted → not confirmed
    assert.equal(confirm.classifyOutcome({ status: 'accepted', statusTs: 1100, telemetryValue: true, telemetryTs: 900 }, true, dts, TUYA), 'IN-FLIGHT');
    // rejected (fresh) → NON-DELIVERY
    assert.equal(confirm.classifyOutcome({ status: 'rejected', statusTs: 1100, lastError: 'gate: device offline', telemetryValue: null, telemetryTs: null }, true, dts, TUYA), 'NON-DELIVERY');
    // stale rejected (ts <= dispatchTs) ignored → in-flight
    assert.equal(confirm.classifyOutcome({ status: 'rejected', statusTs: 900 }, true, dts, TUYA), 'IN-FLIGHT');
});

test('echo-before-accepted: a fresh telemetry match holds pending until accepted, then CONFIRMS', () => {
    const dts = 1000;
    // telemetry arrived first (fresh), status still pending → not yet confirmed
    assert.equal(confirm.classifyOutcome({ status: 'pending', statusTs: 1050, telemetryValue: true, telemetryTs: 1100 }, true, dts, TUYA), 'IN-FLIGHT');
    // then accepted arrives → confirms (order-independent)
    assert.equal(confirm.classifyOutcome({ status: 'accepted', statusTs: 1200, telemetryValue: true, telemetryTs: 1100 }, true, dts, TUYA), 'CONFIRMED');
});

/* -------------------- pre-dispatch (no 409) -------------------- */

test('preDispatchCheck: already-satisfied when the device telemetry already equals the request; dispatch otherwise; never throws a 409', async () => {
    const already = { readCommandState: async () => ({ status: null, statusTs: null, telemetryValue: true, telemetryTs: Date.now() }) };
    assert.equal((await confirm.preDispatchCheck(already, { deviceId: 'D' }, 'tuya', true, TUYA)).outcome, 'already-satisfied');
    const differs = { readCommandState: async () => ({ status: 'pending', statusTs: null, telemetryValue: false, telemetryTs: Date.now() }) };
    assert.equal((await confirm.preDispatchCheck(differs, { deviceId: 'D' }, 'tuya', true, TUYA)).outcome, 'dispatch');
});

/* -------------------- error translation (never leaks raw) -------------------- */

test('translateLastError: each prefix maps to a plain sentence; a raw string is never returned verbatim', () => {
    assert.match(errors.translateLastError('gate: device offline'), /not responding/i);
    assert.match(errors.translateLastError('gate: malformed value'), /went wrong sending/i);
    assert.match(errors.translateLastError('gate: no freshness keys for profile'), /cannot confirm changes/i);
    assert.match(errors.translateLastError('vendor: No active Tuya session owns device 6237'), /Could not reach the device/i);
    assert.match(errors.translateLastError(''), /hasn't confirmed/i);
    for (const raw of ['gate: device offline', 'vendor: No active Tuya session owns device 6237', 'gate: weird new thing']) {
        const out = errors.translateLastError(raw);
        assert.doesNotMatch(out, /gate:|vendor:/, 'the raw prefix must never leak to the operator');
    }
    assert.ok(errors.safeTicketError('x'.repeat(500)).length <= 301, 'raw ticket text is bounded');
});

/* -------------------- read-path mapping -------------------- */

test('mapTelemetry: maps bare switch when switch_1 absent, prefers switch_1, maps setPoint', () => {
    assert.equal(device.mapTelemetry({ switch: true }).switch_1, true, 'bare switch mapped when switch_1 absent');
    assert.equal(device.mapTelemetry({ switch_1: false, switch: true }).switch_1, false, 'switch_1 preferred over bare switch');
    assert.equal(device.mapTelemetry({ setPoint: 18.5 }).setPoint, 18.5, 'setPoint exposed');
    assert.equal(device.mapTelemetry({ setPoint: 18.5 }).heatingSetpoint, 18.5, 'setPoint folds into heatingSetpoint for display');
    // switchReported is retired — it no longer drives switch_1
    assert.equal(device.mapTelemetry({ switchReported: true }).switch_1, undefined, 'switchReported no longer maps');
});
