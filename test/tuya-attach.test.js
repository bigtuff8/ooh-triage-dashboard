/**
 * OOHDASH-140: Unit tests for attachTuya and parseOwonSchedule/parseTongouSchedule
 * in services/tuya-read.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOwonSchedule, parseTongouSchedule, attachTuya } from '../services/tuya-read.js';

// ── parseOwonSchedule ──────────────────────────────────────────────────────────

test('parseOwonSchedule: returns empty for null', () => {
    assert.deepEqual(parseOwonSchedule(null), []);
});

test('parseOwonSchedule: returns empty for empty string', () => {
    assert.deepEqual(parseOwonSchedule(''), []);
});

test('parseOwonSchedule: returns empty for AA== (OWON null blob)', () => {
    assert.deepEqual(parseOwonSchedule('AA=='), []);
});

test('parseOwonSchedule: decodes a single always-on entry', () => {
    // dayMask=0x7F (all days), hour=8, min=0, on=1, enabled=1
    const buf = Buffer.alloc(5);
    buf[0] = 0x7F; buf[1] = 8; buf[2] = 0; buf[3] = 1; buf[4] = 1;
    const result = parseOwonSchedule(buf.toString('base64'));
    assert.equal(result.length, 1);
    assert.equal(result[0].time, '08:00');
    assert.equal(result[0].loops, '1111111');
    assert.equal(result[0].on, true);
    assert.equal(result[0].enabled, true);
});

test('parseOwonSchedule: on byte=0 means false', () => {
    const buf = Buffer.alloc(5);
    buf[0] = 0x7F; buf[1] = 22; buf[2] = 0; buf[3] = 0; buf[4] = 1;
    const result = parseOwonSchedule(buf.toString('base64'));
    assert.equal(result[0].on, false);
});

test('parseOwonSchedule: enabled byte=0 means disabled', () => {
    const buf = Buffer.alloc(5);
    buf[0] = 0x7F; buf[1] = 8; buf[2] = 0; buf[3] = 1; buf[4] = 0;
    const result = parseOwonSchedule(buf.toString('base64'));
    assert.equal(result[0].enabled, false);
});

test('parseOwonSchedule: Sunday-only dayMask (bit0=Sun) → loops=1000000', () => {
    const buf = Buffer.alloc(5);
    buf[0] = 0x01; buf[1] = 6; buf[2] = 0; buf[3] = 1; buf[4] = 1;
    const result = parseOwonSchedule(buf.toString('base64'));
    assert.equal(result[0].loops, '1000000');
});

test('parseOwonSchedule: Saturday-only dayMask (bit6=Sat) → loops=0000001', () => {
    const buf = Buffer.alloc(5);
    buf[0] = 0x40; buf[1] = 6; buf[2] = 0; buf[3] = 1; buf[4] = 1;
    const result = parseOwonSchedule(buf.toString('base64'));
    assert.equal(result[0].loops, '0000001');
});

test('parseOwonSchedule: decodes two entries', () => {
    const buf = Buffer.alloc(10);
    buf[0] = 0x7F; buf[1] = 8;  buf[2] = 0;  buf[3] = 1; buf[4] = 1;
    buf[5] = 0x7F; buf[6] = 22; buf[7] = 30; buf[8] = 0; buf[9] = 1;
    const result = parseOwonSchedule(buf.toString('base64'));
    assert.equal(result.length, 2);
    assert.equal(result[1].time, '22:30');
    assert.equal(result[1].on, false);
});

// ── parseTongouSchedule ────────────────────────────────────────────────────────

test('parseTongouSchedule: returns empty for null', () => {
    assert.deepEqual(parseTongouSchedule(null), []);
});

test('parseTongouSchedule: returns empty for empty array', () => {
    assert.deepEqual(parseTongouSchedule([]), []);
});

test('parseTongouSchedule: normalises a simple on entry', () => {
    const result = parseTongouSchedule([{
        time: '08:00', loops: '1111111',
        functions: [{ code: 'switch_1', value: true }],
        enable: true, timezone_id: 'Europe/London'
    }]);
    assert.ok(Array.isArray(result));
    assert.equal(result[0].time, '08:00');
    assert.equal(result[0].on, true);
    assert.equal(result[0].enabled, true);
});

test('parseTongouSchedule: skips disabled entries', () => {
    const result = parseTongouSchedule([{
        time: '08:00', loops: '1111111',
        functions: [{ value: true }], enable: false, timezone_id: 'Europe/London'
    }]);
    assert.deepEqual(result, []);
});

test('parseTongouSchedule: returns _tzError for non-London timezone', () => {
    const result = parseTongouSchedule([{
        time: '08:00', loops: '1111111',
        functions: [{ value: true }], enable: true, timezone_id: 'America/New_York'
    }]);
    assert.deepEqual(result, { _tzError: true });
});

test('parseTongouSchedule: functions[0].value=false → on=false', () => {
    const result = parseTongouSchedule([{
        time: '22:00', loops: '1111111',
        functions: [{ code: 'switch_1', value: false }],
        enable: true, timezone_id: 'Europe/London'
    }]);
    assert.equal(result[0].on, false);
});

test('parseTongouSchedule: defaults loops to 0000000 when missing', () => {
    const result = parseTongouSchedule([{
        time: '08:00', functions: [{ value: true }], enable: true
    }]);
    assert.equal(result[0].loops, '0000000');
});

// ── attachTuya ─────────────────────────────────────────────────────────────────

function makeDevice(deviceId, kind = 'kitchen') {
    return { deviceId, kind, telemetry: {} };
}

function makeListing(name, overrides = {}) {
    return {
        id: 'dev-' + name, name,
        product_id: 'jdj6ccklup7btq3a',
        product_name: 'Din Rail Switch',
        online: true, model: 'tongou', switchOn: true, powerW: 50,
        readAtMs: Date.now(),
        _preloadedSchedule: [{
            time: '08:00', loops: '1111111',
            functions: [{ value: true }], enable: true, timezone_id: 'Europe/London'
        }],
        ...overrides
    };
}

test('attachTuya: does nothing when listing is null', async () => {
    const device = makeDevice('gk-8888-fryer-1');
    await attachTuya([device], null);
    assert.equal(device.tuya, undefined);
});

test('attachTuya: does nothing when listing is empty', async () => {
    const device = makeDevice('gk-8888-fryer-1');
    await attachTuya([device], []);
    assert.equal(device.tuya, undefined);
});

test('attachTuya: sets tuya=unavailable for devices not in listing', async () => {
    const device = makeDevice('gk-8888-fryer-1');
    await attachTuya([device], [makeListing('gk-8888-glasswasher-1')]);
    assert.ok(device.tuya);
    assert.equal(device.tuya.status, 'unavailable');
    assert.equal(device.tuya.reason, 'not-found');
});

test('attachTuya: sets tuya.status=ok for matched device', async () => {
    const device = makeDevice('gk-8888-fryer-1');
    await attachTuya([device], [makeListing('gk-8888-fryer-1')]);
    assert.ok(device.tuya);
    assert.equal(device.tuya.status, 'ok');
    assert.equal(device.tuya.switchOn, true);
});

test('attachTuya: does not attach tuya to non-kitchen devices', async () => {
    const device = makeDevice('gk-8888-fryer-1', 'heating');
    await attachTuya([device], [makeListing('gk-8888-fryer-1')]);
    assert.equal(device.tuya, undefined);
});

test('attachTuya: does not overwrite telemetry.switch_1', async () => {
    const device = makeDevice('gk-8888-fryer-1');
    device.telemetry = { switch_1: false };
    await attachTuya([device], [makeListing('gk-8888-fryer-1')]);
    assert.equal(device.telemetry.switch_1, false); // must not be changed
    assert.equal(device.tuya.status, 'ok');
});

test('attachTuya: verdict=A for OFF device with always-on preloaded schedule', async () => {
    const device = makeDevice('gk-8888-fryer-1');
    // switchOn=false, schedule has always-on → state=on → verdict=A
    await attachTuya([device], [makeListing('gk-8888-fryer-1', {
        switchOn: false,
        _preloadedSchedule: [{
            time: '00:00', loops: '1111111',
            functions: [{ value: true }], enable: true, timezone_id: 'Europe/London'
        }]
    })]);
    assert.equal(device.tuya.verdict, 'A');
});

test('attachTuya: resolves within time budget (fast fixture path)', async () => {
    const device = makeDevice('gk-8888-fryer-1');
    const start = Date.now();
    await attachTuya([device], [makeListing('gk-8888-fryer-1')], { budgetMs: 3000 });
    assert.ok(Date.now() - start < 1000, 'should be fast in fixture mode');
});
