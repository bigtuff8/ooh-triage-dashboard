/**
 * OOHDASH-164 Stage 1 — bulk key-list guard (design §4).
 *
 * Proves:
 *   G1  BULK_LATEST_KEYS has exactly the expected number of keys across all scopes.
 *   G2  Every scope is present and non-empty.
 *   G3  No duplicate keys across scopes.
 *   G4  Known critical decoder keys (output masks, CHZ, DHW, schedules) are present.
 *
 * Purpose: changing the key list in future must cause this test to fail so the parity
 * script is re-run before releasing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';
process.env.THINGSBOARD_URL = 'http://tb.test';
process.env.THINGSBOARD_READ_USERNAME = 'r@test';
process.env.THINGSBOARD_READ_PASSWORD = 'rp';
process.env.THINGSBOARD_WRITE_USERNAME = 'w@test';
process.env.THINGSBOARD_WRITE_PASSWORD = 'wp';
process.env.COSMOS_URL = 'https://cosmos.test/';
process.env.COSMOS_KEY = 'dGVzdGtleQ==';
process.env.COSMOS_DATABASE = 'testdb';

const { BULK_LATEST_KEYS } = await import('../services/tb-device.js');

const EXPECTED_COUNTS = {
    TIME_SERIES: 37,
    SERVER_ATTRIBUTE: 2,
    CLIENT_ATTRIBUTE: 6,
    SHARED_ATTRIBUTE: 9
};
const EXPECTED_TOTAL = Object.values(EXPECTED_COUNTS).reduce((a, b) => a + b, 0); // 54

test('G1: total key count is 54', () => {
    const all = Object.values(BULK_LATEST_KEYS).flat();
    assert.equal(all.length, EXPECTED_TOTAL,
        `Expected ${EXPECTED_TOTAL} total keys, got ${all.length}. Counts: ${JSON.stringify(Object.fromEntries(Object.entries(BULK_LATEST_KEYS).map(([k, v]) => [k, v.length])))}`);
});

test('G2: each scope is present and has the expected count', () => {
    for (const [scope, expected] of Object.entries(EXPECTED_COUNTS)) {
        assert.ok(Array.isArray(BULK_LATEST_KEYS[scope]), `${scope} must be an array`);
        assert.equal(BULK_LATEST_KEYS[scope].length, expected,
            `${scope}: expected ${expected} keys, got ${BULK_LATEST_KEYS[scope].length}`);
    }
});

test('G3: no duplicate keys across scopes', () => {
    const all = Object.values(BULK_LATEST_KEYS).flat();
    const unique = new Set(all);
    assert.equal(unique.size, all.length, 'Duplicate keys found in BULK_LATEST_KEYS');
});

test('G4: critical decoder keys are present', () => {
    const all = new Set(Object.values(BULK_LATEST_KEYS).flat());
    const required = [
        // V1/V2 boiler control
        'output1State', 'output2State', 'output3State',
        'output1OutputMask', 'output1Schedule', 'output2Schedule', 'output3Schedule',
        // V2 CHZ zones
        'CHZ1.output_state', 'CHZ2.output_state', 'CHZ1.schedule', 'CHZ2.schedule',
        'CHZ1.enabled', 'CHZ2.enabled',
        // DHW
        'DHW.override', 'DHW.schedule', 'DHW.use_boiler',
        // Heating
        'localTemperature', 'heatingSetpoint', 'mode',
        // Liveness
        'active', 'lastActivityTime',
        // Switches
        'switch_1',
        // Schedules
        'schedules', 'heating_scenario'
    ];
    for (const key of required) {
        assert.ok(all.has(key), `Required key "${key}" is missing from BULK_LATEST_KEYS`);
    }
});
