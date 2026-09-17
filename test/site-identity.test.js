/**
 * B0/R0 — site identity at confirm (the NAME slice) unit tests — MIGRATED to the TB-direct read.
 *
 * Proves the eager Zendesk-name enrichment now in services/tb-device.js fetchLiveSitesByNumber():
 *   - a human site name lands on the live site record (not the opaque gk-XXXX accountId);
 *   - the DISPATCH AUDIT logs the enriched siteName (control.js writes site.siteName into the audit);
 *   - on a Zendesk miss/error the record falls back to the accountId, flags nameUnverified, and the
 *     read STILL SUCCEEDS (non-fatal);
 *   - brand/address stay undefined pre-B2 with no literal "undefined" surfacing.
 *
 * Migration note: the read is now TB-direct — getSitesByNumber() issues TB `textSearch` device
 * queries + per-device telemetry reads (intercepted at the axios adapter, as the old test intercepted
 * /api/devices), and deviceId is the TB device NAME. The search-by-NAME assertion moved to the
 * directory-backed searchSites path in tb-device.test.js / tb-classify.test.js (searchSites no longer
 * reads live inventory — it reads the Zendesk directory, D8), so it is not re-asserted here.
 *
 * No live Zendesk / TB: zendesk.resolveSiteName is stubbed via mock.module; the TB read session is
 * intercepted at the axios adapter. config.js snapshots env at import, so DATA_MODE=live is set before
 * the dynamic imports. Requires `node --test --experimental-test-module-mocks`.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import axios from 'axios';

const tbFixture = JSON.parse(
    readFileSync(new URL('../data/fixtures/tb-devices.raw.json', import.meta.url), 'utf8')
);
const allDevices = [...tbFixture.devices, ...tbFixture.site4741];
const telemetryByUuid = new Map(allDevices.map(d => [d.id.id, d.telemetry || {}]));

// Intercept the TB read session (login + textSearch device query + per-device timeseries).
axios.defaults.adapter = (cfg) => {
    const url = cfg.url || '';
    const ok = data => ({ data, status: 200, statusText: 'OK', headers: {}, config: cfg, request: {} });
    if (url.includes('/api/auth/login')) return Promise.resolve(ok({ token: 'test-jwt' }));
    if (url.includes('/api/tenant/devices')) {
        const m = url.match(/textSearch=([^&]+)/);
        const q = m ? decodeURIComponent(m[1]).toLowerCase() : '';
        const data = allDevices.filter(d => d.name.toLowerCase().includes(q));
        return Promise.resolve(ok({ data, hasNext: false, totalElements: data.length }));
    }
    if (url.includes('/values/timeseries')) {
        const um = url.match(/DEVICE\/([^/]+)\/values\/timeseries/);
        const bag = telemetryByUuid.get(um ? um[1] : null) || {};
        return Promise.resolve(ok(Object.fromEntries(Object.entries(bag).map(([k, v]) => [k, [{ ts: Date.now(), value: v }]]))));
    }
    return Promise.resolve(ok({}));
};

// Live mode + read creds BEFORE importing config/tb-device (config snapshots env at import).
// Writes enabled so the dispatch-audit test isn't 423'd by the fail-closed default (OOHDASH-12).
process.env.DATA_MODE = 'live';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';
process.env.WRITES_DISABLED = 'false';

// 6261 resolves to a human name; 4741 is made to THROW — proving enrichment is non-fatal AND that a
// failed lookup degrades to the accountId + the unverified-name warning, exactly like a clean miss.
const NAME_BY_SITE = { '6261': 'Wheatstone Inn (Gloucester)' };

mock.module('../services/zendesk.js', {
    namedExports: {
        resolveSiteName: async (siteNo) => {
            if (String(siteNo) === '4741') throw new Error('zendesk down');
            return NAME_BY_SITE[String(siteNo)] || null;
        },
        // tb-device.searchSites/getSites reach the directory in live mode; keep it inert here.
        siteDirectory: async () => [],
        // control.js imports these from zendesk; keep them inert.
        addLateSyncNote: async () => ({ ok: true }),
        createLateSyncTicket: async () => ({ id: 99999, url: '#lazy' })
    }
});

// Count device writes and capture the audit siteName without a live portal call. readRequest MUST be
// present on the mock now — tb-device.js resolves it lazily on the live read path.
let writeCount = 0;
let lastAuditSiteName = null;
mock.module('../services/tb-client.js', {
    namedExports: {
        writeSharedAttribute: async () => { writeCount += 1; },
        // Edge-aware confirm plane (D3): no current desired ⇒ dispatch; registration gate passes.
        readDesiredState: async () => ({ desired: undefined, desiredTs: null }),
        readControlState: async () => ({ sync: 'pending', syncTs: null, reported: null, reportedTs: null }),
        hasPublishedState: async () => true,
        // tb-device.js resolves readRequest lazily on the live read path; delegate to axios so the
        // adapter above serves the TB device/telemetry responses (the real readSession is bypassed).
        readRequest: async (method, path, data) => (await axios({ method, url: `https://tb.test${path}`, data })).data,
        tbStatus: () => ({ mode: 'live', read: true, write: true })
    }
});
mock.module('../services/audit.js', {
    namedExports: {
        logAction: async (entry) => { lastAuditSiteName = entry.siteName; return { id: 'audit-1' }; },
        updateOutcome: async () => ({ ok: true })
    }
});
mock.module('../services/killswitch.js', {
    namedExports: { writesBlocked: async () => false }
});

const bridge = await import('../services/bridge.js');
const resolution = await import('../services/resolution.js');
const control = await import('../services/control.js');

test('name enrichment lands in live mode — siteName is the human name, not the accountId', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    assert.ok(site, 'site 6261 should exist');
    assert.equal(site.siteName, 'Wheatstone Inn (Gloucester)', 'enriched human name, not gk-6261');
    assert.notEqual(site.siteName, 'gk-6261');
    assert.equal(site.nameUnverified, false, 'a resolved name is verified');
});

test('dispatch audit uses the enriched name, not the accountId (control.js)', async () => {
    lastAuditSiteName = null;
    writeCount = 0;
    const OPERATOR = { id: 'op-1', name: 'Handler One', email: 'h1@example.com' };
    const { token } = await resolution.confirmSite('6261', OPERATOR);
    await control.dispatch({
        operator: OPERATOR,
        confirmToken: token,
        siteNo: '6261',
        deviceId: 'gk-6261-salusit700-1', // the online it700 in the TB fixture (setpoint 6.5)
        command: 'setpoint',
        value: 8,          // within ±3°C of 6.5
        direction: 'up'
    });
    assert.equal(writeCount, 1, 'exactly one device write on the happy path');
    assert.equal(lastAuditSiteName, 'Wheatstone Inn (Gloucester)',
        'the audit must log the enriched human name, not gk-6261');
});

test('unverified-identity guard — Zendesk error falls back to accountId, flags nameUnverified, read still succeeds (non-fatal)', async () => {
    const [site] = await bridge.getSitesByNumber('4741'); // must NOT throw despite 4741's lookup rejecting
    assert.ok(site, 'the read still returns the site when its name lookup errors (non-fatal)');
    assert.equal(site.siteName, 'gk-4741', 'falls back to the accountId on error/miss');
    assert.equal(site.nameUnverified, true, 'the unverified-name warning path is flagged');
    assert.equal(site.accountId, 'gk-4741', 'accountId retained for the de-emphasised fallback display');
});

test('graceful brand/address degrade pre-B2 — no literal "undefined" surfaces', async () => {
    const [site] = await bridge.getSitesByNumber('6261');
    assert.equal(site.brand, undefined, 'brand stays undefined until B2');
    assert.equal(site.address, undefined, 'address stays undefined until B2');
    assert.ok(!Object.values(site).includes('undefined'), 'no literal "undefined" value on the record');
});
