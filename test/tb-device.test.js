/**
 * TB-direct read-plane unit tests (design §5) — MIGRATED from the old bridge.test.js.
 *
 * The old test pinned the bridge `/api/devices` contract (flat array, deviceId = vendor id). This
 * migrates it to the TB-direct shape: getSitesByNumber() issues TB `textSearch` device queries +
 * per-device latest-telemetry reads (intercepted at the axios adapter, mirroring how the old test
 * intercepted /api/devices), deviceId is now the TB device NAME, and the anchored client-side filter
 * rejects numeric-neighbour bleed. Also covers the pure units the design calls out: classifyDevice()
 * over the exception classes, the site-query filter, telemetry mapping incl. switch normalisation,
 * and the boolean bridgeStatus() latch.
 *
 * config.js snapshots env at import, so DATA_MODE=live is set before the dynamic imports. The TB read
 * session hits POST /api/auth/login, GET /api/tenant/devices, GET .../values/timeseries and GET
 * .../values/attributes/SERVER_SCOPE (the `active` source, OOHDASH-80) — all intercepted here. Runs
 * under `node --test` (see package.json test:unit).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import axios from 'axios';

const tbFixture = JSON.parse(
    readFileSync(new URL('../data/fixtures/tb-devices.raw.json', import.meta.url), 'utf8')
);

// All device entities keyed by TB uuid → telemetry, so the timeseries route can answer per device.
const allDevices = [...tbFixture.devices, ...tbFixture.site4741];
const telemetryByUuid = new Map(allDevices.map(d => [d.id.id, d.telemetry || {}]));
// OOHDASH-80: `active` now comes from the per-device SERVER_SCOPE read, not the device-list entity.
const activeByUuid = new Map(allDevices.map(d => [d.id.id, d.active]));
// OOHDASH-85: `lastActivityTime` comes from the SAME SERVER_SCOPE read and is now AUTHORITATIVE for
// `online`. Fixtures carry a relative `lastActivityAgeMs`; the adapter emits now-age so tests are
// time-independent. Absent ageMs → no lastActivityTime emitted (proves missing-timestamp = offline).
const ageByUuid = new Map(allDevices.map(d => [d.id.id, d.lastActivityAgeMs]));
// Test seam — UUIDs whose SERVER_SCOPE read should THROW, to prove the per-device fail-safe degrades
// that device to offline without failing the whole site query (the prod-outage regression guard).
const serverScopeFailUuids = new Set();

/**
 * TB REST adapter — routes by the request URL, exactly the shape services/tb-client.readRequest
 * expects back. Substring-matches textSearch (as real TB does) so the anchored client-side filter is
 * genuinely exercised: `gk-6261` returns the 6261 devices AND the gk-62611 bleed neighbour.
 */
// Records every device-list request URL the service builds, so the OOHDASH-80 guard test can assert
// the query targets deviceInfos (carries `active`) and can never silently regress to /devices.
const deviceListRequests = [];

function tbAdapter(cfg) {
    const url = cfg.url || '';
    const ok = data => ({ data, status: 200, statusText: 'OK', headers: {}, config: cfg, request: {} });

    if (url.includes('/api/auth/login')) return Promise.resolve(ok({ token: 'test-jwt' }));

    if (url.includes('/api/tenant/devices') && url.includes('textSearch')) {
        deviceListRequests.push(url);
        const m = url.match(/textSearch=([^&]+)/);
        const q = m ? decodeURIComponent(m[1]).toLowerCase() : '';
        // Real TB textSearch is an unanchored substring over the device name. The Device entity does
        // NOT carry `active` (OOHDASH-80) — online status comes from the SERVER_SCOPE route below.
        const data = allDevices
            .filter(d => d.name.toLowerCase().includes(q))
            .map(({ active, telemetry, ...entity }) => entity);
        return Promise.resolve(ok({ data, hasNext: false, totalElements: data.length }));
    }

    if (url.includes('/values/attributes/SERVER_SCOPE')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/attributes\/SERVER_SCOPE/);
        const uuid = um ? um[1] : null;
        if (serverScopeFailUuids.has(uuid)) {
            return Promise.reject(Object.assign(new Error('SERVER_SCOPE read failed'), { response: { status: 500 } }));
        }
        // TB attribute shape: [{ key, value, lastUpdateTs }]. OOHDASH-85: the SERVER_SCOPE read carries
        // BOTH `active` (corroboration) and `lastActivityTime` (authoritative). Emit lastActivityTime
        // only when the fixture defines an age (absent → missing timestamp → offline under the new rule).
        const attrs = [{ key: 'active', value: activeByUuid.get(uuid), lastUpdateTs: Date.now() }];
        const ageMs = ageByUuid.get(uuid);
        if (ageMs != null) attrs.push({ key: 'lastActivityTime', value: Date.now() - ageMs, lastUpdateTs: Date.now() });
        return Promise.resolve(ok(attrs));
    }

    if (url.includes('/values/timeseries')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/timeseries/);
        const uuid = um ? um[1] : null;
        const bag = telemetryByUuid.get(uuid) || {};
        // TB timeseries shape: { key: [{ ts, value }] }.
        const ts = Object.fromEntries(Object.entries(bag).map(([k, v]) => [k, [{ ts: Date.now(), value: v }]]));
        return Promise.resolve(ok(ts));
    }

    return Promise.resolve(ok({}));
}
axios.defaults.adapter = tbAdapter;

process.env.DATA_MODE = 'live';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

const tb = await import('../services/tb-device.js');

/* ------------------------------------------------------------------ */
/* Migrated: TB-direct inventory read (was fetchLiveSites/bridge.test) */
/* ------------------------------------------------------------------ */

test('getSitesByNumber issues a TB query and returns the site with its full device inventory', async () => {
    tb._resetCache();
    const sites = await tb.getSitesByNumber('6261');
    assert.equal(sites.length, 1, 'exactly one 6261 site');
    // 3 devices belong to 6261 (it700, it500-combi, fryer); the gk-62611 bleed neighbour is filtered.
    assert.equal(sites[0].devices.length, 3, `expected 3 devices, got ${sites[0].devices.map(d => d.deviceId)}`);
});

test('anchored client-side filter rejects the numeric-neighbour bleed (gk-62611 is NOT admitted to 6261)', async () => {
    tb._resetCache();
    const [site] = await tb.getSitesByNumber('6261');
    assert.ok(!site.devices.some(d => d.deviceId.startsWith('gk-62611')), 'the gk-62611 neighbour must be filtered out');
});

test('glued-token asset is KEPT (gk-6261fryer-1 belongs to 6261)', async () => {
    tb._resetCache();
    const [site] = await tb.getSitesByNumber('6261');
    assert.ok(site.devices.some(d => d.deviceId === 'gk-6261fryer-1'), 'the glued fryer circuit is the same site');
});

test('deviceId is the TB device NAME (the corrective fix), not a vendor id', async () => {
    tb._resetCache();
    const [site] = await tb.getSitesByNumber('6261');
    const dev = site.devices.find(d => d.deviceId === 'gk-6261-salusit700-1');
    assert.ok(dev, 'device is keyed by its TB name');
    assert.match(dev.deviceId, /^gk-6261-salusit700-1$/, 'deviceId === TB name (name-keyed control path)');
});

test('maps telemetry — heatingSetpoint is load-bearing and the rest of the canonical shape lands', async () => {
    tb._resetCache();
    const [site] = await tb.getSitesByNumber('6261');
    const dev = site.devices.find(d => d.deviceId === 'gk-6261-salusit700-1');
    assert.equal(dev.telemetry.heatingSetpoint, 6.5, 'heatingSetpoint must be populated (registry refuses setpoint without it)');
    assert.equal(dev.telemetry.temperature, 22.5);
    assert.equal(dev.telemetry.localTemperature, 22.5, 'UI reads telemetry.localTemperature for the readout');
    assert.equal(dev.telemetry.mode, 'Heat');
    assert.equal(dev.telemetry.heatingActive, false);
    assert.equal(dev.schedule, null);
});

test('classifies heating device against a registry key (deviceType=salus-it700, kind=heating, zone=label)', async () => {
    tb._resetCache();
    const [site] = await tb.getSitesByNumber('6261');
    const dev = site.devices.find(d => d.deviceId === 'gk-6261-salusit700-1');
    assert.equal(dev.deviceType, 'salus-it700', 'deviceType must be a registry key');
    assert.equal(dev.kind, 'heating');
    assert.equal(dev.zone, 'Accomodation Gateway', 'zone comes from the TB device label');
    assert.equal(dev.online, true, 'OOHDASH-85: fresh lastActivityTime (2h) → online');
});

test('flags combi hot-water capability from a non-null hotWater reading', async () => {
    tb._resetCache();
    const [site] = await tb.getSitesByNumber('6261');
    const combi = site.devices.find(d => d.deviceId === 'gk-6261-salusit500-combi-2');
    assert.equal(combi.hotWaterCapable, true, 'hotWater != null should set hotWaterCapable');
    assert.equal(combi.telemetry.hotWater, 1);
    // OOHDASH-85 debounce (§5): a STALE device is held online on the FIRST poll and only asserted
    // offline on the second consecutive stale poll. Re-poll to observe the settled verdict.
    tb._resetCache();
    await tb.getSitesByNumber('6261');                   // poll 1 — combi held online (first stale)
    tb._expireCache();                                   // simulate the next 30s poll (debounce preserved)
    const [site2] = await tb.getSitesByNumber('6261');   // poll 2 — combi asserted offline
    const combi2 = site2.devices.find(d => d.deviceId === 'gk-6261-salusit500-combi-2');
    assert.equal(combi2.online, false, 'OOHDASH-85: stale lastActivityTime (100h > 48h) → offline after debounce settles');
});

test('getDevice resolves one device within the resolved site by its (name) deviceId', async () => {
    tb._resetCache();
    const dev = await tb.getDevice('6261', 'gk-6261-salusit700-1');
    assert.ok(dev);
    assert.equal(dev.deviceType, 'salus-it700');
    assert.equal(await tb.getDevice('6261', 'no-such-device'), null);
});

/* ------------------------------------------------------------------ */
/* boolean bridgeStatus() latch (§2.6)                                  */
/* ------------------------------------------------------------------ */

test('bridgeStatus() is a BOOLEAN latch — healthy true after a good read, mode reflects dataMode', async () => {
    tb._resetCache();
    await tb.getSitesByNumber('6261');
    const s = tb.bridgeStatus();
    assert.equal(typeof s.healthy, 'boolean', 'healthy is a boolean, not a tri-state string');
    assert.equal(s.healthy, true);
    assert.equal(s.mode, 'live');
    assert.equal(s.lastError, null);
});

/* ------------------------------------------------------------------ */
/* OOHDASH-80: online status resolves from per-device SERVER_SCOPE      */
/* `active` (supersedes the reverted deviceInfos approach, PR #33)      */
/* ------------------------------------------------------------------ */

test('OOHDASH-80: the device-list query targets /api/tenant/devices (NOT deviceInfos — that endpoint does not exist on this TB and 400s)', async () => {
    tb._resetCache();
    deviceListRequests.length = 0;
    await tb.getSitesByNumber('6261');
    assert.ok(deviceListRequests.length > 0, 'the service must have issued at least one device-list request');
    for (const url of deviceListRequests) {
        assert.ok(/\/api\/tenant\/devices(\?|$)/.test(url), `device-list query must hit /api/tenant/devices, got: ${url}`);
        assert.ok(!url.includes('deviceInfos'), `must NEVER hit the non-existent deviceInfos endpoint (the reverted outage), got: ${url}`);
    }
});

test('OOHDASH-85: online:true when the device last reported within threshold (end-to-end, freshness authoritative)', async () => {
    tb._resetCache();
    const [site] = await tb.getSitesByNumber('6261');
    const it700 = site.devices.find(d => d.deviceId === 'gk-6261-salusit700-1'); // fresh (2h) in fixture
    assert.equal(it700.online, true, 'fresh lastActivityTime → online:true');
});

test('OOHDASH-85: online:false when the device is stale beyond threshold (end-to-end, freshness authoritative)', async () => {
    tb._resetCache();
    await tb.getSitesByNumber('6261');                   // poll 1 — stale combi held online (debounce §5)
    tb._expireCache();                                   // simulate the next 30s poll (debounce preserved)
    const [site] = await tb.getSitesByNumber('6261');    // poll 2 — combi asserted offline
    const combi = site.devices.find(d => d.deviceId === 'gk-6261-salusit500-combi-2'); // stale (100h) in fixture
    assert.equal(combi.online, false, 'stale lastActivityTime → online:false (after debounce settles)');
});

test('OOHDASH-80 REGRESSION GUARD: a SERVER_SCOPE read failure for ONE device degrades it to offline but the site still returns ALL devices (no throw)', async () => {
    tb._resetCache();
    serverScopeFailUuids.add('uuid-6261-it700'); // force the it700 attribute read to throw
    try {
        const sites = await tb.getSitesByNumber('6261');
        assert.equal(sites.length, 1, 'the site query must still succeed (the outage was a single-read failure taking down the whole site)');
        assert.equal(sites[0].devices.length, 3, 'ALL 3 devices still returned despite one failing attribute read');
        const it700 = sites[0].devices.find(d => d.deviceId === 'gk-6261-salusit700-1');
        // OOHDASH-85: a FAILED SERVER_SCOPE read → null report time → HARD offline, asserted IMMEDIATELY
        // (not debounced), preserving the fail-safe posture this guard protects.
        assert.equal(it700.online, false, 'the device whose active read failed degrades to offline immediately (hard fail-safe)');
        // The stale combi (valid but 100h-old timestamp) resolves its own state via the debounce — held
        // online on this first stale poll, settled offline on the next. Re-poll to observe the settle.
        tb._expireCache();
        const [site2] = await tb.getSitesByNumber('6261');
        const combi = site2.devices.find(d => d.deviceId === 'gk-6261-salusit500-combi-2');
        assert.equal(combi.online, false, 'stale combi settles offline after the debounce (§5)');
    } finally {
        serverScopeFailUuids.delete('uuid-6261-it700');
    }
});

// OOHDASH-85: when NO last-report time was observed (no `lastActivityTime` key on raw — the fixture-mode
// / legacy caller path), mapTbDevice keeps the pre-85 `active` passthrough. The live path always
// supplies lastActivityTime, so freshness governs there (see the §8.2 freshness suite).
test('OOHDASH-85 fallback: no lastActivityTime key → `active:true` passthrough → online:true', () => {
    const dev = tb.mapTbDevice({ name: 'gk-6261-x', type: 'default', active: true }, {});
    assert.equal(dev.online, true, 'legacy/fixture path with no report time → active passthrough');
});

test('OOHDASH-85 fallback: no lastActivityTime key → `active:false` passthrough → online:false', () => {
    const dev = tb.mapTbDevice({ name: 'gk-6261-x', type: 'default', active: false }, {});
    assert.equal(dev.online, false, 'legacy/fixture path with no report time → active passthrough');
});

test('OOHDASH-85 fallback: no lastActivityTime and no active → online defaults false', () => {
    const dev = tb.mapTbDevice({ name: 'gk-6261-x', type: 'default' }, {});
    assert.equal(dev.online, false, 'no report time, no active → online defaults to false');
});
