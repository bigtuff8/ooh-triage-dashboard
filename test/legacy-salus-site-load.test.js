/**
 * OOHDASH-128 — legacy bare-salus site-load unit tests (U1-U12).
 *
 * Proves:
 *   U1  legacySalusSiteNo: returns the site-number string from a bare-salus raw name, or null.
 *   U2  isLegacySalusForSite: strict string equality; "520" never matches "5204".
 *   U3  site 5204: full workspace with modern + bare-salus devices.
 *   U4  anti-bleed: hostile TB returning cross-site devices — each site gets only its own.
 *   U5  duplicate dedup: a device returned by both searches appears exactly once.
 *   U6  no regression: existing site 6261 produces the same device list; bracket search runs.
 *   U7  bracket fetch 500: site still loads via token path; warn logged once.
 *   U8  token fetch throws: getSitesByNumber rejects (degraded mode unchanged).
 *   U9  cache: second call in 30s makes 0 TB requests; after __resetLiveCache both searches re-run.
 *   U10 active bare-salus device (T8): b4 with fresh lastActivityTime is online=true.
 *   U11 total-failure site 5191 (T1): only bracket returns a device; site now resolves (was []).
 *   U12 deferred no-bracket device (D2): x4 (no bracket) is absent; z-1 with bracket is present.
 *
 * Pattern: axios adapter interceptor (same as test/tb-device.test.js). DATA_MODE=live set before
 * dynamic import. __resetLiveCache between cases.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';

// ── Fixture data ─────────────────────────────────────────────────────────────
// Modern devices for site 5204
const m1 = { id: { id: 'uuid-m1' }, name: 'gk-5204-salusit700',   type: 'default', label: 'Accommodation', lastActivityAgeMs: 600000,  telemetry: { localTemperature: 19.5, heatingSetpoint: 21, mode: 'Heat' } };
const m2 = { id: { id: 'uuid-m2' }, name: 'gk-5204-lwgateway-1',  type: 'default', label: 'Gateway',       lastActivityAgeMs: 600000,  telemetry: {} };

// Bare-salus for site 5204 (Bramley Farm Inn test stand-ins)
const b1 = { id: { id: 'uuid-b1' }, name: 'gk_bramleyfarm_salus_STA10109321 (5204-f-1)', type: 'default', label: '', lastActivityAgeMs: null, telemetry: {}, clientScope: { site: '(5204-f-1)' } };
const b2 = { id: { id: 'uuid-b2' }, name: 'gk_bramleyfarm_salus_STA10109322 (5204-f-2)', type: 'default', label: '', lastActivityAgeMs: null, telemetry: {}, clientScope: { site: '(5204-f-2)' } };
const b3 = { id: { id: 'uuid-b3' }, name: 'gk_bramleyfarm_salus_STA10109323 (5204-f-3)', type: 'default', label: '', lastActivityAgeMs: null, telemetry: {}, clientScope: { site: '(5204-f-3)' } };
const b4 = { id: { id: 'uuid-b4' }, name: 'gk_bramleyfarm_salus_STA10109324 (5204-r-2)', type: 'default', label: '', lastActivityAgeMs: null, telemetry: {}, clientScope: { site: '(5204-r-2)' } };
const b5 = { id: { id: 'uuid-b5' }, name: 'gk_bramleyfarm_salus_STA10109325 (5204-r-3)', type: 'default', label: '', lastActivityAgeMs: null, telemetry: {}, clientScope: { site: '(5204-r-3)' } };
const b6 = { id: { id: 'uuid-b6' }, name: 'gk_bramleyfarm_salus_STA10109369 (5204-z-1)', type: 'default', label: '', lastActivityAgeMs: null, telemetry: {}, clientScope: { site: '(5204-z-1)' } };
// b4 active (for U10)
const b4Active = { ...b4, id: { id: 'uuid-b4' }, lastActivityAgeMs: 600000 };

// Cross-site (foreign) bare-salus devices
const x1 = { id: { id: 'uuid-x1' }, name: 'gk_wingfieldfarm_salus_STA10108576 (5694-r-2)', type: 'default', label: '', lastActivityAgeMs: null, telemetry: {} };
const x2 = { id: { id: 'uuid-x2' }, name: 'gk_unknown_salus_STA10108639 (5788-1-s)',        type: 'default', label: '', lastActivityAgeMs: null, telemetry: {} };
const x3 = { id: { id: 'uuid-x3' }, name: 'gk_unknown_salus_STA10108419 (?7?4-?-?)',        type: 'default', label: '', lastActivityAgeMs: null, telemetry: {} };
const x4 = { id: { id: 'uuid-x4' }, name: 'gk_unknown_salus_STA10108795 5791-r-2',          type: 'default', label: '', lastActivityAgeMs: null, telemetry: {} };
const x5 = { id: { id: 'uuid-x5' }, name: 'gk-6360-maindb-r10a (5204-a-1)',                 type: 'default', label: '', lastActivityAgeMs: 600000, telemetry: {} };

// 5191 total-failure bare-salus
const s5191f2 = { id: { id: 'uuid-5191-f2' }, name: 'gk_cherrytreefarm_salus_STA10108309 (5191-f-2)', type: 'default', label: '', lastActivityAgeMs: null, telemetry: {}, clientScope: { site: '(5191-f-2)' } };

// 5791 devices
const z5791z1 = { id: { id: 'uuid-5791-z1' }, name: 'gk_pinetreefarm_salus_STA10109673 (5791-z-1)', type: 'default', label: '', lastActivityAgeMs: null, telemetry: {}, clientScope: { site: '(5791-z-1)' } };
// x4 is also 5791 but has no bracket — must remain absent

// 6261 fixture (from tb-devices.raw.json, just representative IDs for regression)
import { readFileSync } from 'fs';
const tbFixture = JSON.parse(readFileSync(new URL('../data/fixtures/tb-devices.raw.json', import.meta.url), 'utf8'));
const raw6261 = [...tbFixture.devices, ...tbFixture.site4741];

// ── Request tracking ─────────────────────────────────────────────────────────
let deviceListRequests = [];
let consolWarnArgs = [];

// ── Build the adapter ─────────────────────────────────────────────────────────
// Controls: maps siteNo → { token: [], bracket: [] }
let adapterMode = {};

function allAgesById(list) {
    return new Map(list.map(d => [d.id.id, d.lastActivityAgeMs]));
}

function tbAdapter(cfg) {
    const url = cfg.url || '';
    const ok = data => ({ data, status: 200, statusText: 'OK', headers: {}, config: cfg, request: {} });
    const err = (status, msg) => {
        const e = Object.assign(new Error(msg), { response: { status } });
        return Promise.reject(e);
    };

    if (url.includes('/api/auth/login')) return Promise.resolve(ok({ token: 'test-jwt' }));

    if (url.includes('/api/tenant/devices') && url.includes('textSearch')) {
        deviceListRequests.push(url);
        const m = url.match(/textSearch=([^&]+)/);
        const q = m ? decodeURIComponent(m[1]).toLowerCase() : '';

        // Check if the adapter should throw for bracket searches
        if (adapterMode.throwBracket && q.startsWith('(')) {
            return err(500, 'Bracket fetch 500');
        }
        if (adapterMode.throwToken && !q.startsWith('(')) {
            return err(503, 'Token fetch 503');
        }

        let pool = [];
        if (adapterMode.pool) pool = adapterMode.pool;
        else if (adapterMode.site) {
            pool = [m1, m2, b1, b2, b3, b4, b5, b6, x1, x2, x3, x4, x5, s5191f2, z5791z1];
        } else {
            pool = raw6261;
        }

        const data = pool
            .filter(d => d.name.toLowerCase().includes(q))
            .map(({ active, telemetry, clientScope, lastActivityAgeMs, ...entity }) => entity);
        return Promise.resolve(ok({ data, hasNext: false, totalElements: data.length }));
    }

    if (url.includes('/values/attributes/SERVER_SCOPE')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/attributes\/SERVER_SCOPE/);
        const uuid = um ? um[1] : null;
        // Find ageMs from the current pool
        let ageMs = null;
        let allItems = [];
        if (adapterMode.pool) allItems = adapterMode.pool;
        else if (adapterMode.site) allItems = [m1, m2, b1, b2, b3, b4, b5, b6, x1, x2, x3, x4, x5, s5191f2, z5791z1];
        else allItems = raw6261;

        const device = allItems.find(d => (d.id?.id || d.id) === uuid);
        ageMs = device ? device.lastActivityAgeMs : null;
        const attrs = [{ key: 'active', value: ageMs != null && ageMs < 172800000, lastUpdateTs: Date.now() }];
        if (ageMs != null) attrs.push({ key: 'lastActivityTime', value: Date.now() - ageMs, lastUpdateTs: Date.now() });
        return Promise.resolve(ok(attrs));
    }

    if (url.includes('/values/attributes/CLIENT_SCOPE')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/attributes\/CLIENT_SCOPE/);
        const uuid = um ? um[1] : null;
        let allItems = [];
        if (adapterMode.pool) allItems = adapterMode.pool;
        else if (adapterMode.site) allItems = [m1, m2, b1, b2, b3, b4, b5, b6, x1, x2, x3, x4, x5, s5191f2, z5791z1];
        else allItems = [];
        const device = allItems.find(d => (d.id?.id || d.id) === uuid);
        const cs = device?.clientScope || {};
        const attrs = Object.entries(cs).map(([key, value]) => ({ key, value, lastUpdateTs: Date.now() }));
        return Promise.resolve(ok(attrs));
    }

    if (url.includes('/values/timeseries')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/timeseries/);
        const uuid = um ? um[1] : null;
        let allItems = [];
        if (adapterMode.pool) allItems = adapterMode.pool;
        else if (adapterMode.site) allItems = [m1, m2, b1, b2, b3, b4, b5, b6, x1, x2, x3, x4, x5, s5191f2, z5791z1];
        else allItems = raw6261;
        const device = allItems.find(d => (d.id?.id || d.id) === uuid);
        const bag = device?.telemetry || {};
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
process.env.ZENDESK_SUBDOMAIN = '';  // suppress Zendesk enrichment

const tb = await import('../services/tb-device.js');
const { legacySalusSiteNo, isLegacySalusForSite } = tb;

// ── U1: legacySalusSiteNo table ───────────────────────────────────────────────
test('U1: legacySalusSiteNo extracts the site number or returns null (full table)', () => {
    assert.equal(legacySalusSiteNo('gk_bramleyfarm_salus_STA10109324 (5204-r-2)'), '5204', 'b4');
    assert.equal(legacySalusSiteNo('gk_bramleyfarm_salus_STA10109369 (5204-z-1)'), '5204', 'b6');
    assert.equal(legacySalusSiteNo('gk_unknown_salus_STA10108639 (5788-1-s)'), '5788', 'x2');
    assert.equal(legacySalusSiteNo('gk_unknown_salus_STA10108419 (?7?4-?-?)'), null, 'x3 no digit');
    assert.equal(legacySalusSiteNo('(JWTEST-R1)'), null, 'JWTEST no digit');
    assert.equal(legacySalusSiteNo('()'), null, 'empty bracket');
    assert.equal(legacySalusSiteNo('gk_unknown_salus_STA10108795 5791-r-2'), null, 'x4 no bracket');
    assert.equal(legacySalusSiteNo('gk-6360-maindb-r10a (5204-a-1)'), null, 'x5 no _salus_');
    assert.equal(legacySalusSiteNo('gk_x_SALUS_y (5204-r-1)'), '5204', 'case-insensitive SALUS');
    assert.equal(legacySalusSiteNo('gk-1666-salusit500-r1 (1666-r-1)'), null, 'salusit500 glued token guard');
    assert.equal(legacySalusSiteNo('gk_cherrytreefarm_salus_STA10108309 (5191-f-2)'), '5191', '5191-f-2');
    assert.equal(legacySalusSiteNo('gk_pinetreefarm_salus_STA10109673 (5791-z-1)'), '5791', '5791-z-1');
});

// ── U2: isLegacySalusForSite strict equality ──────────────────────────────────
test('U2: isLegacySalusForSite strict string equality — "520" never matches "5204"', () => {
    const name5204 = 'gk_bramleyfarm_salus_STA10109324 (5204-r-2)';
    assert.ok(!isLegacySalusForSite(name5204, '520'), 'b4 vs "520" must be false');
    assert.ok(isLegacySalusForSite(name5204, '5204'), 'b4 vs "5204" must be true');
    assert.ok(!isLegacySalusForSite(name5204, '52040'), 'b4 vs "52040" must be false');
    assert.ok(isLegacySalusForSite(name5204, 5204), 'b4 vs 5204 (number) must be true — String(5204)==="5204"');
    assert.ok(!isLegacySalusForSite('gk_x_salus_y (05204-r-1)', '5204'), 'leading zero — "05204" !== "5204"');
});

// ── U3: site 5204 full workspace ──────────────────────────────────────────────
test('U3: site 5204 loads modern devices (token path) + bare-salus (bracket path) — 8 devices total', async () => {
    tb._resetCache();
    deviceListRequests = [];
    adapterMode = { site: '5204' };
    const sites = await tb.getSitesByNumber('5204');
    assert.equal(sites.length, 1, 'exactly one site');
    const devs = sites[0].devices;
    assert.equal(devs.length, 8, `expected 8 devices, got ${devs.map(d => d.deviceId)}`);

    const salusDevs = devs.filter(d => d.deviceType === 'salus');
    assert.equal(salusDevs.length, 6, '6 bare-salus devices');

    const accDevs = salusDevs.filter(d => d.area === 'Accommodation');
    assert.equal(accDevs.length, 3, '3 Accommodation bare-salus');

    const barDevs = salusDevs.filter(d => d.area === 'Bar/Restaurant');
    assert.equal(barDevs.length, 2, '2 Bar/Restaurant bare-salus');

    const nullAreaDevs = salusDevs.filter(d => !d.area);
    assert.equal(nullAreaDevs.length, 1, '1 bare-salus with null area (z-1)');

    // All bare-salus are offline (no lastActivityTime)
    salusDevs.forEach(d => assert.equal(d.online, false, `${d.deviceId} must be offline`));

    // Bracket search URL ran
    const bracketReqs = deviceListRequests.filter(u => u.includes('(5204-'));
    assert.ok(bracketReqs.length > 0, 'bracket textSearch=(5204- request was issued');
});

// ── U4: anti-bleed (hostile TB) ───────────────────────────────────────────────
test('U4: anti-bleed — hostile TB returning all cross-site devices; site 5204 gets only its own bare-salus', async () => {
    tb._resetCache();
    // Pool contains b1-b6 (5204), x1 (5694), x2 (5788), x3 (invalid), x4 (no-bracket), x5 (no _salus_)
    adapterMode = { pool: [m1, m2, b1, b2, b3, b4, b5, b6, x1, x2, x3, x4, x5] };
    const sites = await tb.getSitesByNumber('5204');
    assert.equal(sites.length, 1);
    const ids = sites[0].devices.map(d => d.deviceId);
    // Only m1, m2 (modern) and b1-b6 (bare-salus 5204)
    assert.equal(ids.length, 8, `expected 8, got ${ids}`);
    assert.ok(!ids.includes('gk_wingfieldfarm_salus_STA10108576 (5694-r-2)'), 'x1 (5694) must not appear');
    assert.ok(!ids.includes('gk_unknown_salus_STA10108639 (5788-1-s)'), 'x2 (5788) must not appear');
    assert.ok(!ids.includes('gk_unknown_salus_STA10108795 5791-r-2'), 'x4 (no bracket) must not appear');
    assert.ok(!ids.includes('gk-6360-maindb-r10a (5204-a-1)'), 'x5 (no _salus_) must not appear');
});

test('U4b: anti-bleed — site "520" gets zero bare-salus even when hostile TB returns 5204 devices', async () => {
    tb._resetCache();
    adapterMode = { pool: [b1, b2, b3, b4, b5, b6] };
    const sites = await tb.getSitesByNumber('520');
    // No token matches (no gk-520-...) AND bracket "(520-" doesn't match 5204 devices
    assert.equal(sites.length, 0, 'site 520 must have zero devices');
});

// ── U5: duplicate dedup ───────────────────────────────────────────────────────
test('U5: a device returned by both token and bracket searches appears exactly once', async () => {
    tb._resetCache();
    // b1 appears in both: name contains "5204" (passes token gk-5204) AND bracket "(5204-"
    adapterMode = { pool: [m1, b1] };
    const sites = await tb.getSitesByNumber('5204');
    assert.equal(sites.length, 1);
    const b1Devs = sites[0].devices.filter(d => d.deviceId === 'gk_bramleyfarm_salus_STA10109321 (5204-f-1)');
    assert.equal(b1Devs.length, 1, 'b1 appears exactly once (dedup)');
});

// ── U6: no regression for site 6261 ──────────────────────────────────────────
test('U6: site 6261 produces the same device list as before; one extra bracket request is issued', async () => {
    tb._resetCache();
    deviceListRequests = [];
    adapterMode = {};  // uses raw6261 pool
    const sites = await tb.getSitesByNumber('6261');
    assert.equal(sites.length, 1, 'exactly one 6261 site');
    // 3 devices (same as pre-change test/tb-device.test.js)
    assert.equal(sites[0].devices.length, 3, `expected 3 devices, got ${sites[0].devices.map(d => d.deviceId)}`);
    // Bracket search ran
    const bracketReqs = deviceListRequests.filter(u => u.includes('(6261-'));
    assert.ok(bracketReqs.length > 0, 'bracket textSearch=(6261- request was issued');
});

// ── U7: bracket fetch 500 — fail-soft ─────────────────────────────────────────
test('U7: bracket fetch 500 — site still loads from token path; warn logged; no throw', async () => {
    tb._resetCache();
    adapterMode = { site: '5204', throwBracket: true };
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    try {
        const sites = await tb.getSitesByNumber('5204');
        assert.equal(sites.length, 1, 'site still returned');
        // Only m1 and m2 (modern) — bare-salus don't load because bracket failed
        const devs = sites[0].devices;
        assert.ok(devs.some(d => d.deviceId === 'gk-5204-salusit700'), 'm1 still loaded');
        assert.ok(devs.some(d => d.deviceId === 'gk-5204-lwgateway-1'), 'm2 still loaded');
        assert.equal(warns.filter(w => w.includes('Older-Salus lookup failed for site 5204')).length, 1, 'exactly one warn');
    } finally {
        console.warn = origWarn;
    }
});

// ── U8: token fetch throws — degraded mode unchanged ─────────────────────────
test('U8: token fetch throws — getSitesByNumber rejects (degraded mode unchanged)', async () => {
    tb._resetCache();
    adapterMode = { site: '5204', throwToken: true };
    await assert.rejects(
        () => tb.getSitesByNumber('5204'),
        { message: /Token fetch 503/ },
        'getSitesByNumber must reject when the token fetch throws'
    );
});

// ── U9: cache behaviour ───────────────────────────────────────────────────────
test('U9: second call within 30s makes 0 TB requests; after __resetLiveCache both searches re-run', async () => {
    tb._resetCache();
    deviceListRequests = [];
    adapterMode = { site: '5204' };
    await tb.getSitesByNumber('5204');
    const firstCount = deviceListRequests.length;
    assert.ok(firstCount > 0, 'first call made some requests');

    // Second call — should hit cache
    deviceListRequests = [];
    await tb.getSitesByNumber('5204');
    assert.equal(deviceListRequests.length, 0, 'second call within 30s made 0 TB requests (cached)');

    // After reset, should re-run
    tb._resetCache();
    deviceListRequests = [];
    await tb.getSitesByNumber('5204');
    assert.ok(deviceListRequests.length > 0, 'after __resetLiveCache, requests run again');
    // Bracket search runs again
    assert.ok(deviceListRequests.some(u => u.includes('(5204-')), 'bracket search re-runs after cache reset');
});

// ── U10: active bare-salus device (T8) ───────────────────────────────────────
test('U10: bare-salus with fresh lastActivityTime (10 min) is online=true; area still Bar/Restaurant', async () => {
    tb._resetCache();
    adapterMode = { pool: [b4Active] };
    const sites = await tb.getSitesByNumber('5204');
    assert.equal(sites.length, 1);
    const dev = sites[0].devices.find(d => d.deviceId === b4Active.name);
    assert.ok(dev, 'b4Active must be in workspace');
    assert.equal(dev.online, true, 'b4Active with fresh lastActivityTime must be online');
    assert.equal(dev.area, 'Bar/Restaurant', 'area must be Bar/Restaurant from bracket (5204-r-2)');
    assert.equal(dev.deviceType, 'salus', 'deviceType must be bare salus');
    // Registry refuses control for dark salus
    const { validateCommand } = await import('../services/registry.js');
    const r = validateCommand(dev, 'setpoint', 20);
    assert.equal(r.ok, false, 'registry refuses control for bare-salus');
});

// ── U11: total-failure site 5191 (T1) ────────────────────────────────────────
test('U11: site 5191 with only a bare-salus device now returns a site (was empty [])', async () => {
    tb._resetCache();
    adapterMode = { pool: [s5191f2] };
    const sites = await tb.getSitesByNumber('5191');
    assert.equal(sites.length, 1, 'site 5191 must resolve (not []) when bracket returns f-2');
    assert.equal(sites[0].devices.length, 1, 'exactly 1 device');
    const dev = sites[0].devices[0];
    assert.equal(dev.area, 'Accommodation', 'f-2 → Accommodation area');
    assert.equal(dev.deviceType, 'salus', 'deviceType salus');
});

// ── U12: D2 deferred no-bracket device ───────────────────────────────────────
test('U12: site 5791 — z-1 (with bracket) present; x4 (no bracket) absent (D2 deferred)', async () => {
    tb._resetCache();
    adapterMode = { pool: [z5791z1, x4] };
    const sites = await tb.getSitesByNumber('5791');
    assert.equal(sites.length, 1);
    const ids = sites[0].devices.map(d => d.deviceId);
    assert.ok(ids.includes('gk_pinetreefarm_salus_STA10109673 (5791-z-1)'), 'z-1 must be present');
    assert.ok(!ids.includes('gk_unknown_salus_STA10108795 5791-r-2'), 'x4 (no bracket) must be absent');
});
