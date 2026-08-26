/**
 * OOHDASH-66 — services/bridge.js live-mapping unit tests.
 *
 * Exercises fetchLiveSites() against the REAL captured /api/devices shape
 * (data/fixtures/bridge-api-devices.raw.json — a FLAT device array, see
 * docs/BRIDGE_CONTRACT.md). Asserts that the flat array is grouped by accountId into
 * sites, that siteNo is derived (gk-6261 → 6261), that non-house accounts are skipped,
 * and that telemetry is mapped (setpointC → heatingSetpoint is load-bearing).
 *
 * No network: axios is intercepted at the adapter layer and returns the fixture as the
 * /api/devices body. config.js reads env at import time, so DATA_MODE=live is set before
 * the dynamic imports. Runs under `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import axios from 'axios';

const rawDevices = JSON.parse(
    readFileSync(new URL('../data/fixtures/bridge-api-devices.raw.json', import.meta.url), 'utf8')
);

// Intercept every axios request and return the captured device array as the response body.
axios.defaults.adapter = async (cfg) => ({
    data: rawDevices, status: 200, statusText: 'OK', headers: {}, config: cfg, request: {}
});

// Put config into live mode BEFORE importing config/bridge (config snapshots env at import).
process.env.DATA_MODE = 'live';
process.env.BRIDGE_BASE_URL = 'http://integration-bridge.test.svc';

const bridge = await import('../services/bridge.js');

test('fetchLiveSites groups the flat device array by accountId into sites', async () => {
    const sites = await bridge.getSites();
    assert.ok(Array.isArray(sites), 'getSites should return an array of sites');
    // gk-6261 (2 devices) + gk-4741 (1 device) = 2 sites; shared + spencer-uat-01 skipped.
    assert.equal(sites.length, 2, `expected 2 house sites, got ${sites.length}: ${sites.map(s => s.siteNo)}`);
});

test('derives siteNo by stripping the alpha prefix (gk-6261 → 6261) and groups its devices', async () => {
    const sites = await bridge.getSites();
    const site = sites.find(s => s.siteNo === '6261');
    assert.ok(site, 'site 6261 should exist');
    assert.equal(site.devices.length, 2, 'both gk-6261 devices should be grouped into the one site');
    // siteName proxied by accountId (no name in payload); zone label is NOT used as the site name.
    assert.equal(site.siteName, 'gk-6261');
    assert.notEqual(site.siteName, 'Accomodation Gateway');
});

test('skips non-numeric / non-house accounts (shared, spencer-uat-01)', async () => {
    const sites = await bridge.getSites();
    assert.ok(!sites.some(s => s.siteNo == null), 'no site should have a null siteNo');
    assert.ok(!sites.some(s => /shared|spencer/i.test(String(s.siteName))), 'shared/spencer accounts must be skipped');
    assert.deepEqual(sites.map(s => s.siteNo).sort(), ['4741', '6261']);
});

test('maps telemetry — setpointC → heatingSetpoint (load-bearing) and the rest of the shape', async () => {
    const sites = await bridge.getSites();
    const site = sites.find(s => s.siteNo === '6261');
    const dev = site.devices.find(d => d.deviceId === 'salus-gk-6261-it700tx-025e0726');
    assert.ok(dev, 'the captured it700 device should be present');
    assert.equal(dev.telemetry.heatingSetpoint, 6.5, 'setpointC (6.5) must map to telemetry.heatingSetpoint');
    assert.equal(dev.telemetry.temperature, 22.5);
    assert.equal(dev.telemetry.localTemperature, 22.5, 'UI reads telemetry.localTemperature for the readout');
    assert.equal(dev.telemetry.mode, 'Heat');
    assert.equal(dev.telemetry.heatingActive, false);
    assert.equal(dev.telemetry.hotWater, null);
    assert.equal(dev.schedule, null);
});

test('maps device identity/type against registry keys (deviceType=vendorId, kind=heating, zone=site)', async () => {
    const sites = await bridge.getSites();
    const site = sites.find(s => s.siteNo === '6261');
    const dev = site.devices.find(d => d.deviceId === 'salus-gk-6261-it700tx-025e0726');
    assert.equal(dev.deviceType, 'salus-it700', 'deviceType must be the vendorId (a services/registry.js key)');
    assert.equal(dev.deviceTypeLabel, 'Salus iT700');
    assert.equal(dev.kind, 'heating');
    assert.equal(dev.zone, 'Accomodation Gateway', 'zone comes from the per-device site/zone label');
    assert.equal(dev.online, true);
});

test('flags combi hot-water capability from a non-null hotWater reading', async () => {
    const sites = await bridge.getSites();
    const site = sites.find(s => s.siteNo === '6261');
    const combi = site.devices.find(d => d.deviceId === 'salus-gk-6261-it500-combi-77aa');
    assert.equal(combi.hotWaterCapable, true, 'hotWater != null should set hotWaterCapable');
    assert.equal(combi.telemetry.hotWater, 1);
    assert.equal(combi.online, false, 'isOnline=false should map to online=false');
});

test('searchSites resolves the captured house 6261 (search path is load-bearing)', async () => {
    const results = await bridge.searchSites('6261');
    assert.equal(results.length, 1);
    assert.equal(results[0].siteNo, '6261');
});
