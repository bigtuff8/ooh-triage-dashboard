/**
 * OOHDASH-82 (design §4, §10.1) — CLIENT_SCOPE attribute read (the discovery Q4 gap).
 *
 * Proves:
 *   - readClientScopeAttributes folds the TB array form [{key,value}] to a plain { key: value } map;
 *   - the CLIENT_SCOPE read is wired into the live inventory path so an iT500's `site` code flows to
 *     the derived `area` on the canonical device shape;
 *   - a FAILED client-scope read degrades that ONE device to no client-scope (area falls back to the
 *     §7.2 rule) without failing the whole site (fail-safe posture).
 *
 * Drives the live path with an axios adapter that mimics TB's device/telemetry/attribute endpoints
 * (mirrors test/hotwater-scope.test.js). No network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';

process.env.WRITES_DISABLED = 'true';
process.env.DATA_MODE = 'live';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

// A mixed 6218 site: iT700 (Accommodation), iT500 Staff (Accommodation), iT500 Restaurant (Bar/Rest),
// and an iT500 whose CLIENT_SCOPE read FAILS (must degrade to area null, never fail the site).
const DEVICES = [
    { id: { id: 'u-it700' }, name: 'gk-6218-salusit700', type: 'default', active: true, telemetry: { heatingSetpoint: 21, localTemperature: 19 }, clientScope: [{ key: 'salusLocation', value: 'IT700' }] },
    { id: { id: 'u-it500-s' }, name: 'gk-6218-salusit500-2', type: 'default', active: true, telemetry: { heatingSetpoint: 20, localTemperature: 17 }, clientScope: [{ key: 'site', value: '6218-s-1' }] },
    { id: { id: 'u-it500-r' }, name: 'gk-6218-salusit500-3', type: 'default', active: true, telemetry: { heatingSetpoint: 20, localTemperature: 21 }, clientScope: [{ key: 'site', value: '6218-r-1' }] },
    { id: { id: 'u-it500-fail' }, name: 'gk-6218-salusit500-4', type: 'default', active: true, telemetry: { heatingSetpoint: 20, localTemperature: 18 }, clientScope: '__FAIL__' }
];
const byUuid = new Map(DEVICES.map(d => [d.id.id, d]));

axios.defaults.adapter = (cfg) => {
    const url = cfg.url || '';
    const ok = data => ({ data, status: 200, statusText: 'OK', headers: {}, config: cfg, request: {} });
    if (url.includes('/api/auth/login')) return Promise.resolve(ok({ token: 'test-jwt' }));
    if (url.includes('/api/tenant/devices') && url.includes('textSearch')) {
        const m = url.match(/textSearch=([^&]+)/);
        const q = m ? decodeURIComponent(m[1]).toLowerCase() : '';
        const data = DEVICES.filter(d => d.name.toLowerCase().includes(q)).map(({ active, telemetry, clientScope, ...e }) => e);
        return Promise.resolve(ok({ data, hasNext: false, totalElements: data.length }));
    }
    if (url.includes('/values/attributes/SERVER_SCOPE')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/attributes\/SERVER_SCOPE/);
        const d = byUuid.get(um ? um[1] : null);
        return Promise.resolve(ok([{ key: 'active', value: d ? d.active : false, lastUpdateTs: Date.now() }]));
    }
    if (url.includes('/values/attributes/CLIENT_SCOPE')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/attributes\/CLIENT_SCOPE/);
        const d = byUuid.get(um ? um[1] : null);
        if (d && d.clientScope === '__FAIL__') return Promise.reject(Object.assign(new Error('CLIENT_SCOPE 500'), { response: { status: 500 } }));
        return Promise.resolve(ok(d ? d.clientScope : []));
    }
    if (url.includes('/values/timeseries')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/timeseries/);
        const d = byUuid.get(um ? um[1] : null);
        const bag = d ? d.telemetry : {};
        return Promise.resolve(ok(Object.fromEntries(Object.entries(bag).map(([k, v]) => [k, [{ ts: Date.now(), value: v }]]))));
    }
    return Promise.resolve(ok({}));
};

const tbClient = await import('../services/tb-client.js');
const bridge = await import('../services/bridge.js');

test('readClientScopeAttributes folds the TB array form [{key,value}] to a plain { key: value } map', async () => {
    const map = await tbClient.readClientScopeAttributes('u-it500-s', 'site,salusLocation');
    assert.deepEqual(map, { site: '6218-s-1' });
});

test('the CLIENT_SCOPE `site` code flows through the live inventory read into the derived device.area', async () => {
    bridge._resetCache();
    const [site] = await bridge.getSitesByNumber('6218');
    const byName = Object.fromEntries(site.devices.map(d => [d.deviceId, d]));
    assert.equal(byName['gk-6218-salusit700'].area, 'Accommodation', 'iT700 → Accommodation (no attribute needed)');
    assert.equal(byName['gk-6218-salusit500-2'].area, 'Accommodation', 'iT500 site 6218-s-1 → Accommodation (Staff)');
    assert.equal(byName['gk-6218-salusit500-3'].area, 'Bar/Restaurant', 'iT500 site 6218-r-1 → Bar/Restaurant');
});

test('a failed CLIENT_SCOPE read degrades ONE device to area null without failing the site (fail-safe)', async () => {
    bridge._resetCache();
    const [site] = await bridge.getSitesByNumber('6218');
    assert.equal(site.devices.length, 4, 'every device still returned despite the one failed client-scope read');
    const failed = site.devices.find(d => d.deviceId === 'gk-6218-salusit500-4');
    assert.equal(failed.area, null, 'the device whose CLIENT_SCOPE read failed falls back to area null');
});
