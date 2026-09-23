/**
 * OOHDASH-82 (design §5, §10.1) — gateway mis-classification fix (ASSET_INTENT reorder + backstop).
 *
 * Proves:
 *   - a paired gateway whose name carries a salus token classifies as gateway (kind gateway, deviceType
 *     gateway) after the reorder — no longer typed heating;
 *   - a GENUINE salus thermostat with setpoint telemetry still classifies salus-it700 heating
 *     (regression guard — the reorder must not re-type a real thermostat);
 *   - deriveArea returns null for the gateway (never an area — the structural backstop);
 *   - the short `gw` token still does not bleed into other names;
 *   - the `r10a` token no longer spuriously matches a numeric device-instance suffix (the latent bleed
 *     the reorder exposed and the fix closed).
 *
 * node --test style; runs under `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';

const { classifyDevice, deriveArea, mapTbDevice } = await import('../services/tb-device.js');

test('gateway: a paired gateway with a salus token in its name classifies as gateway, not heating', () => {
    const c = classifyDevice('gk-6218-salusit700-gateway-1', 'default', null);
    assert.equal(c.kind, 'gateway', 'kind must be gateway (was wrongly heating before the reorder)');
    assert.equal(c.deviceType, 'gateway');
    assert.equal(c.controllable, false);
});

test('gateway: deriveArea returns null for a paired gateway — never a selectable area (structural backstop)', () => {
    const d = mapTbDevice({ name: 'gk-6218-salusit700-gateway-1', type: 'default' }, {}, { site: '6218-s-1' });
    assert.equal(d.deviceType, 'gateway');
    assert.equal(d.area, null, 'a gateway must never derive an area even if a site code is present');
});

test('regression guard: a genuine salus thermostat with setpoint telemetry still classifies salus-it700 heating', () => {
    const c = classifyDevice('gk-6218-salusit700', 'default', { heatingSetpoint: 21 });
    assert.equal(c.kind, 'heating', 'a real thermostat is classified capability-first and stays heating');
    assert.equal(c.deviceType, 'salus-it700');
    assert.equal(c.controllable, true);
});

test('regression guard: an iT500 thermostat with setpoint telemetry still classifies salus-it500 heating', () => {
    const c = classifyDevice('gk-6218-salusit500-2', 'default', { heatingSetpoint: 20 });
    assert.equal(c.kind, 'heating');
    assert.equal(c.deviceType, 'salus-it500');
});

test('gw short token: does not bleed into other names (exact-only)', () => {
    // A device whose name merely contains the letters "gw" as part of a longer token must NOT be typed
    // gateway; only an exact `gw` token (or the longer gateway tokens) matches.
    const c = classifyDevice('gk-6218-gwynedd-lgt-1', 'gatewayDevice', { switchReported: true });
    assert.notEqual(c.deviceType, 'gateway', 'a longer token containing "gw" must not match the gateway row');
    assert.equal(c.kind, 'lighting');
});

test('r10a token: a genuine r10a gateway still types gateway, and a numeric suffix does not spuriously match it', () => {
    // The genuine r10a gateway (no telemetry) is a gateway.
    assert.equal(classifyDevice('gk-6360-maindb-r10a', 'default', null).kind, 'gateway');
    // A switchable circuit whose instance suffix is a bare digit must NOT be pulled to gateway by
    // `r10a`.includes('1') — the latent bleed the reorder exposed (design §5 regression analysis).
    assert.equal(classifyDevice('gk-6261-cellar-fan-1', 'gatewayDevice', { switchReported: true }).kind, 'fan');
});
