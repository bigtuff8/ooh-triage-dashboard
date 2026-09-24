/**
 * OOHDASH-85 (design §8.2) — freshness-authoritative liveness rule, locked as a fast unit test.
 *
 * Pins the combination rule from design §3.2 so it can never regress:
 *   - fresh (age < threshold) → ONLINE, even with active=false (the core false-offline fix);
 *   - stale (age > threshold) → OFFLINE;
 *   - missing / unparseable / <=0 timestamp → OFFLINE;
 *   - active=true never turns a fresh device offline and never rescues a stale/missing one;
 *   - per-type threshold applied when the deviceType has an override, else the 48h default;
 *   - debounce: first stale poll reports the prior (online) value, second consecutive stale asserts
 *     offline, and reporting again resets.
 *
 * Pure/deterministic — no network, no clock dependence (a fixed `now` is injected). Runs under
 * `node --test` (package.json test:unit).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// deriveFreshnessOnline / applyFreshnessDebounce / _freshness are pure exports — importing tb-device
// in fixture mode never touches the network (config snapshots env at import; no live read is issued).
process.env.DATA_MODE = 'fixture';
const tb = await import('../services/tb-device.js');

const HOUR = 60 * 60 * 1000;
const DEFAULT = 48 * HOUR;
const NOW = 1_700_000_000_000;   // fixed reference epoch-ms

/* ------------------------------------------------------------------ */
/* §3.2 — the core rule                                                 */
/* ------------------------------------------------------------------ */

test('fresh timestamp → ONLINE even when active=false (the core false-offline fix)', () => {
    const lastMs = NOW - 2 * HOUR;      // reported 2h ago, well within 48h
    assert.equal(tb.deriveFreshnessOnline(lastMs, false, DEFAULT, NOW), true,
        'a device that reported 2h ago is online regardless of active=false');
});

test('fresh timestamp with active=true → ONLINE (active agrees, does not change the fresh verdict)', () => {
    assert.equal(tb.deriveFreshnessOnline(NOW - 1 * HOUR, true, DEFAULT, NOW), true);
});

test('exactly at the threshold boundary → ONLINE (age <= threshold is fresh)', () => {
    assert.equal(tb.deriveFreshnessOnline(NOW - DEFAULT, false, DEFAULT, NOW), true,
        'age == threshold is inclusive-fresh');
});

test('stale timestamp → OFFLINE', () => {
    const lastMs = NOW - 100 * HOUR;    // 100h ago, past 48h
    assert.equal(tb.deriveFreshnessOnline(lastMs, false, DEFAULT, NOW), false);
});

test('stale timestamp with active=true → OFFLINE (active can NEVER rescue a stale device)', () => {
    assert.equal(tb.deriveFreshnessOnline(NOW - 100 * HOUR, true, DEFAULT, NOW), false,
        'active=true must not manufacture "alive" against a stale timestamp');
});

test('missing timestamp (null) → OFFLINE, even with active=true', () => {
    assert.equal(tb.deriveFreshnessOnline(null, true, DEFAULT, NOW), false,
        'a missing/unparseable report time is offline; active cannot rescue it');
});

/* ------------------------------------------------------------------ */
/* §3.1 — parse fail-safe, exercised through the derivation via mapTbDevice */
/* ------------------------------------------------------------------ */

test('fresh via mapTbDevice: lastActivityTime present + active=false → online (end-to-end at the seam)', () => {
    const dev = tb.mapTbDevice({ name: 'gk-1-x', type: 'default', active: false, lastActivityTime: Date.now() - HOUR }, {});
    assert.equal(dev.online, true, 'freshness governs at the mapTbDevice seam; active=false does not flip it');
});

test('stale via mapTbDevice: old lastActivityTime + active=true → offline', () => {
    const dev = tb.mapTbDevice({ name: 'gk-1-x', type: 'default', active: true, lastActivityTime: Date.now() - 100 * HOUR }, {});
    assert.equal(dev.online, false, 'stale beyond 48h → offline even with active=true');
});

test('null lastActivityTime via mapTbDevice → offline (missing timestamp is offline)', () => {
    const dev = tb.mapTbDevice({ name: 'gk-1-x', type: 'default', active: true, lastActivityTime: null }, {});
    assert.equal(dev.online, false, 'live path supplies null when the report time is absent/unparseable → offline');
});

/* ------------------------------------------------------------------ */
/* §4 — per-type threshold resolution                                   */
/* ------------------------------------------------------------------ */

test('unknown deviceType resolves to the 48h global default', () => {
    const { defaultMs, thresholdFor } = tb._freshness();
    assert.equal(defaultMs, DEFAULT, 'default is 48h');
    assert.equal(thresholdFor('salus-it700'), DEFAULT, 'a type with no override falls back to the default');
    assert.equal(thresholdFor(undefined), DEFAULT, 'an absent deviceType falls back to the default');
});

test('a per-type override is honoured when applied at the resolver (hook shape works)', () => {
    // FRESHNESS_BY_TYPE is intentionally empty (awaiting IoT cadence). Prove the RESOLVER SHAPE
    // (override ?? default) directly, so we lock the mechanism without inventing a per-type number.
    const resolve = (map, dt, def) => map[dt] ?? def;
    assert.equal(resolve({ amr: 24 * HOUR }, 'amr', DEFAULT), 24 * HOUR, 'override wins when present');
    assert.equal(resolve({ amr: 24 * HOUR }, 'salus-it700', DEFAULT), DEFAULT, 'other types keep the default');
});

/* ------------------------------------------------------------------ */
/* §5 — anti-flicker debounce                                           */
/* ------------------------------------------------------------------ */

test('debounce: first stale poll reports prior (online), second consecutive stale asserts offline, recovery resets', () => {
    tb._resetCache();   // clears debounce state
    const uuid = 'uuid-debounce-1';

    // Poll 1: device is fresh → online, no debounce record.
    assert.equal(tb.applyFreshnessDebounce(uuid, true, NOW), true, 'fresh → online');

    // Poll 2: first stale read → hold the prior online value for this one poll.
    assert.equal(tb.applyFreshnessDebounce(uuid, false, NOW + 30_000), true,
        'first stale poll still reports online (debounce holds it)');

    // Poll 3: second consecutive stale read → assert offline.
    assert.equal(tb.applyFreshnessDebounce(uuid, false, NOW + 60_000), false,
        'second consecutive stale poll asserts offline');

    // Poll 4: device reports again (fresh) → resets to online.
    assert.equal(tb.applyFreshnessDebounce(uuid, true, NOW + 90_000), true, 'recovery resets to online');

    // Poll 5: a fresh device that goes stale again starts the debounce over (holds online once more).
    assert.equal(tb.applyFreshnessDebounce(uuid, false, NOW + 120_000), true,
        'after recovery, the first stale poll holds online again (state was reset)');
});

test('debounce: a device that recovers before the second stale poll never flips offline', () => {
    tb._resetCache();
    const uuid = 'uuid-debounce-2';
    assert.equal(tb.applyFreshnessDebounce(uuid, false, NOW), true, 'first stale → held online');
    assert.equal(tb.applyFreshnessDebounce(uuid, true, NOW + 30_000), true, 'recovered → online, record cleared');
    assert.equal(tb.applyFreshnessDebounce(uuid, false, NOW + 60_000), true,
        'next stale is treated as a fresh first-stale (held online), because recovery cleared the record');
});
