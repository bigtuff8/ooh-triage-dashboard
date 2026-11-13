/**
 * OOHDASH-164 Stage 1 — latestToBag adapter unit tests (design §4).
 *
 * Proves:
 *   A1  ts===0 keys are dropped (device has never reported that key).
 *   A2  TIME_SERIES values are kept as strings.
 *   A3  Attribute values (SERVER/CLIENT/SHARED) are coerced: "true"→bool, "21"→number,
 *       JSON strings → parsed object.
 *   A4  __active and __lastActivityTime are populated from SERVER_ATTRIBUTE.
 *   A5  __clientScope is populated from CLIENT_ATTRIBUTE.
 *   A6  __sharedScope is populated from SHARED_ATTRIBUTE; null when empty.
 *   A7  __telemLastSeenMs is the max non-zero ts from TIME_SERIES.
 *   A8  Empty latestEntry returns a usable bag with null/empty values.
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

const { latestToBag } = await import('../services/tb-device.js');

// Helper: build a fake bulk entry for one device
function mkEntry(ts, sharedAttrs = {}) {
    return {
        entityId: { entityType: 'DEVICE', id: 'uuid-test' },
        latest: {
            TIME_SERIES: {
                localTemperature:   { ts, value: '19.5' },
                heatingSetpoint:    { ts: ts > 0 ? ts : 0, value: '21.0' }, // same ts as above
                neverReported:      { ts: 0, value: '' },   // A1: should be dropped
                recentKey:          { ts: ts, value: '100' }
            },
            SERVER_ATTRIBUTE: {
                active:            { ts: ts, value: 'true' },   // A3: should become true (bool)
                lastActivityTime:  { ts: ts, value: String(ts) }
            },
            CLIENT_ATTRIBUTE: {
                site:              { ts: ts, value: '(6832-b-1)' },
                heating_scenario:  { ts: ts, value: '{"key":"v"}' }  // A3: JSON → object
            },
            SHARED_ATTRIBUTE: {
                output1OutputMask: { ts: ts, value: '[1,0,0,0]' },   // A3: JSON → array
                ...sharedAttrs
            }
        }
    };
}

const TS = Date.now() - 60_000; // 1 minute ago — within the 5-min future-bound

test('A1: ts===0 keys are dropped', () => {
    const bag = latestToBag(mkEntry(TS));
    assert.ok('localTemperature' in bag, 'localTemperature should be present (ts>0)');
    assert.ok(!('neverReported' in bag), 'neverReported should be dropped (ts===0)');
});

test('A2: TIME_SERIES values are kept as strings', () => {
    const bag = latestToBag(mkEntry(TS));
    assert.equal(typeof bag.localTemperature, 'string', 'TIME_SERIES values must remain strings');
    assert.equal(bag.localTemperature, '19.5');
});

test('A3: attribute strings are coerced — bool, number, JSON', () => {
    const bag = latestToBag(mkEntry(TS));
    // SERVER_ATTRIBUTE active: "true" → true
    assert.equal(bag.__active, true, '__active should be boolean true');
    // CLIENT_ATTRIBUTE heating_scenario: JSON string → object
    assert.deepEqual(bag.__clientScope?.heating_scenario, { key: 'v' }, 'JSON string should parse');
    // SHARED_ATTRIBUTE output1OutputMask: JSON array string → array
    assert.deepEqual(bag.__sharedScope?.output1OutputMask, [1, 0, 0, 0], 'JSON array should parse');
});

test('A4: __active and __lastActivityTime from SERVER_ATTRIBUTE', () => {
    const bag = latestToBag(mkEntry(TS));
    assert.equal(bag.__active, true);
    assert.equal(bag.__lastActivityTime, TS, '__lastActivityTime should equal the ts');
});

test('A5: __clientScope from CLIENT_ATTRIBUTE', () => {
    const bag = latestToBag(mkEntry(TS));
    assert.ok(bag.__clientScope, '__clientScope should be an object');
    assert.equal(bag.__clientScope.site, '(6832-b-1)');
});

test('A6: __sharedScope populated from SHARED_ATTRIBUTE; null when empty', () => {
    const bag = latestToBag(mkEntry(TS));
    assert.ok(bag.__sharedScope !== null, '__sharedScope should be non-null when attrs present');
    assert.ok('output1OutputMask' in bag.__sharedScope);

    // Now with no SHARED_ATTRIBUTE
    const entry2 = mkEntry(TS);
    entry2.latest.SHARED_ATTRIBUTE = {};
    const bag2 = latestToBag(entry2);
    assert.equal(bag2.__sharedScope, null, '__sharedScope should be null when no shared attrs');
});

test('A7: __telemLastSeenMs is max non-zero ts from TIME_SERIES', () => {
    const entry = mkEntry(TS);
    // Set different ts values in TIME_SERIES
    entry.latest.TIME_SERIES.localTemperature.ts = TS - 10000;
    entry.latest.TIME_SERIES.recentKey.ts = TS; // most recent
    const bag = latestToBag(entry);
    assert.equal(bag.__telemLastSeenMs, TS, '__telemLastSeenMs should be the max ts');
});

test('A8: empty / null entry returns usable bag (no crash)', () => {
    const bag = latestToBag(null);
    // __active comes from parseActive({}) which returns false (no active attr)
    assert.equal(bag.__active, false, '__active defaults to false when no SERVER_ATTRIBUTE');
    // __lastActivityTime comes from parseLastActivity({}) which returns null
    assert.equal(bag.__lastActivityTime, null);
    // __clientScope is the CLIENT_ATTRIBUTE object (empty)
    assert.deepEqual(bag.__clientScope, {});
    assert.equal(bag.__sharedScope, null);
    assert.equal(bag.__telemLastSeenMs, null);
});

test('A9: heatingSetpoint with ts=0 is dropped even if other keys have ts>0', () => {
    const entry = mkEntry(TS);
    // Force heatingSetpoint ts to 0
    entry.latest.TIME_SERIES.heatingSetpoint.ts = 0;
    const bag = latestToBag(entry);
    assert.ok(!('heatingSetpoint' in bag), 'heatingSetpoint with ts===0 must be dropped');
    assert.ok('localTemperature' in bag, 'localTemperature with ts>0 must be present');
});
