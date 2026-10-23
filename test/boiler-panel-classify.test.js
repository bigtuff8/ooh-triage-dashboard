/**
 * OOHDASH-139 — boiler-panel classification + area derivation unit tests.
 *
 * Tests that classifyDevice(profile='boilerControl') → boiler-panel and
 * deriveArea('boiler-panel') → Bar/Restaurant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.WRITES_DISABLED = 'false';
process.env.DATA_MODE = 'fixture';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

const { classifyDevice, deriveArea } = await import('../services/tb-device.js');

test('classifyDevice: profile=boilerControl → boiler-panel', () => {
    const r = classifyDevice('gk-6863-boilercontrol-1', 'boilerControl', {});
    assert.equal(r.deviceType, 'boiler-panel');
    assert.equal(r.kind, 'heating');
    assert.equal(r.controllable, false);
    assert.equal(r.control, null);
    assert.equal(r.deviceTypeLabel, 'Pub boiler panel');
});

test('classifyDevice: bare name "boiler" with no telemetry signal and default profile → NOT boiler-panel', () => {
    const r = classifyDevice('boiler', 'default', {});
    assert.notEqual(r.deviceType, 'boiler-panel', 'a bare name with default profile should not become boiler-panel');
});

test('deriveArea: boiler-panel → Bar/Restaurant', () => {
    assert.equal(deriveArea('boiler-panel', null), 'Bar/Restaurant');
});

test('deriveArea: boiler-panel with any client scope → still Bar/Restaurant', () => {
    assert.equal(deriveArea('boiler-panel', { site: '6218-s-1' }), 'Bar/Restaurant');
    assert.equal(deriveArea('boiler-panel', {}), 'Bar/Restaurant');
});
