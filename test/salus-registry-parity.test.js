/**
 * OOHDASH-108 (design §4, §10.1) — control-contract parity for the new `salus` device type.
 *
 * The new old-convention `salus` type MUST carry the identical control contract to the existing Salus
 * types (setpoint/frost commands, 5–35°C range) so NO control path changes — this is an area fix only.
 * Proves:
 *   - capabilitiesFor('salus') exposes the same commands and deviceRange as salus-it500/salus-it700;
 *   - validateCommand accepts an in-range setpoint and rejects an out-of-range one, identically across
 *     the three Salus types;
 *   - frost resolves to the same 5°C setpoint.
 *
 * node --test style; runs under `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';

const { capabilitiesFor, validateCommand } = await import('../services/registry.js');

const SALUS_TYPES = ['salus', 'salus-it500', 'salus-it700'];

test('registry parity: `salus` exposes the same setpoint/frost commands as salus-it500/salus-it700', () => {
    const entry = capabilitiesFor('salus');
    assert.ok(entry, '`salus` is a registry key');
    assert.deepEqual(entry.commands, ['setpoint', 'frost']);
    assert.deepEqual(capabilitiesFor('salus-it500').commands, entry.commands, 'commands match iT500');
    assert.deepEqual(capabilitiesFor('salus-it700').commands, entry.commands, 'commands match iT700');
    assert.equal(entry.frostSetpoint, 5, 'frost setpoint is 5°C');
});

test('registry parity: `salus` deviceRange is 5–35, identical to the other Salus types', () => {
    const r = capabilitiesFor('salus').deviceRange;
    assert.deepEqual(r, { min: 5, max: 35 });
    assert.deepEqual(capabilitiesFor('salus-it500').deviceRange, r);
    assert.deepEqual(capabilitiesFor('salus-it700').deviceRange, r);
});

test('validateCommand: in-range setpoint accepted identically across all three Salus types', () => {
    for (const deviceType of SALUS_TYPES) {
        // Current 20°C; +1°C → 21 is inside the ±3°C window and the 5–35 range.
        const dev = { deviceType, telemetry: { heatingSetpoint: 20 } };
        const res = validateCommand(dev, 'setpoint', 21);
        assert.equal(res.ok, true, `${deviceType}: 21°C accepted`);
        assert.equal(res.attribute, 'setpointDesired', `${deviceType}: dispatches setpointDesired`);
        assert.equal(res.value, 21, `${deviceType}: value preserved`);
    }
});

test('validateCommand: out-of-range setpoint rejected identically across all three Salus types', () => {
    for (const deviceType of SALUS_TYPES) {
        // +10°C from current 20 → 30 is outside the ±3°C window → rejected for every Salus type.
        const dev = { deviceType, telemetry: { heatingSetpoint: 20 } };
        const res = validateCommand(dev, 'setpoint', 30);
        assert.equal(res.ok, false, `${deviceType}: 30°C rejected (outside ±3°C window)`);
    }
});

test('validateCommand: frost resolves to the 5°C setpoint identically across all three Salus types', () => {
    for (const deviceType of SALUS_TYPES) {
        const dev = { deviceType, telemetry: { heatingSetpoint: 20 } };
        const res = validateCommand(dev, 'frost');
        assert.equal(res.ok, true, `${deviceType}: frost accepted`);
        assert.equal(res.attribute, 'setpointDesired');
        assert.equal(res.value, 5, `${deviceType}: frost → 5°C`);
    }
});
