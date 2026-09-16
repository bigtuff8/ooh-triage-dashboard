/**
 * B0/R0 — site identity at confirm (the buildable NAME slice) unit tests.
 *
 * Proves the eager Zendesk-name enrichment in services/bridge.js fetchLiveSites():
 *   - a human site name lands on the live site record (not the opaque gk-XXXX accountId);
 *   - SEARCH-BY-NAME works via the enriched record (searchSites matches on the enriched
 *     siteName — the consumer that proves eager enrichment was required, Tony's test 2);
 *   - the DISPATCH AUDIT logs the enriched siteName, not the accountId (control.js writes
 *     site.siteName into the irreversible-action audit);
 *   - on a Zendesk miss the record falls back to the accountId, flags nameUnverified (the
 *     "unverified name" warning path), and fetchLiveSites() STILL SUCCEEDS (non-fatal);
 *   - brand/address stay undefined pre-B2 with no literal "undefined" surfacing.
 *
 * No live Zendesk: services/zendesk.js resolveSiteName is stubbed via mock.module. The bridge
 * /api/devices read is intercepted at the axios adapter layer. config.js snapshots env at import,
 * so DATA_MODE=live is set before the dynamic imports. Requires
 * `node --test --experimental-test-module-mocks` (see package.json test:unit).
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import axios from 'axios';

const rawDevices = JSON.parse(
    readFileSync(new URL('../data/fixtures/bridge-api-devices.raw.json', import.meta.url), 'utf8')
);

// Intercept every axios request and return the captured device array as the /api/devices body.
axios.defaults.adapter = async (cfg) => ({
    data: rawDevices, status: 200, statusText: 'OK', headers: {}, config: cfg, request: {}
});

// Live mode + a bridge base URL BEFORE importing config/bridge (config snapshots env at import).
// Writes enabled so the dispatch-audit test isn't 423'd by the fail-closed default (OOHDASH-12).
process.env.DATA_MODE = 'live';
process.env.BRIDGE_BASE_URL = 'http://integration-bridge.test.svc';
process.env.WRITES_DISABLED = 'false';

// Control which house numbers resolve to a human name. 6261 resolves to a pub name; 4741 is
// made to THROW — proving the bridge's enrichment is non-fatal (a Zendesk fault must not break
// fetchLiveSites, which callers treat as degraded mode) AND that a failed lookup degrades to the
// accountId + the unverified-name warning, exactly like a clean miss.
const NAME_BY_SITE = { '6261': 'Wheatstone Inn (Gloucester)' };

// Stub the Zendesk name lookup — NO live Zendesk call.
mock.module('../services/zendesk.js', {
    namedExports: {
        resolveSiteName: async (siteNo) => {
            if (String(siteNo) === '4741') throw new Error('zendesk down');
            return NAME_BY_SITE[String(siteNo)] || null;
        },
        // control.js imports addLateSyncNote from zendesk; keep it inert for the dispatch test.
        addLateSyncNote: async () => ({ ok: true })
    }
});

// Count device writes and capture the audit siteName without a live portal call.
let writeCount = 0;
let lastAuditSiteName = null;
mock.module('../services/tb-client.js', {
    namedExports: {
        writeSharedAttribute: async () => { writeCount += 1; },
        readControlState: async () => ({ sync: 'pending', reported: null }),
        tbStatus: () => ({ mode: 'live', read: true, write: true })
    }
});
mock.module('../services/audit.js', {
    namedExports: {
        logAction: async (entry) => { lastAuditSiteName = entry.siteName; return { id: 'audit-1' }; },
        updateOutcome: async () => ({ ok: true })
    }
});
// No Cosmos in CI: the kill-switch read hits Cosmos in live mode. Stub it to "not blocked" so the
// dispatch reaches the audit step (the write-lock/kill-switch behaviour is covered by its own suite).
mock.module('../services/killswitch.js', {
    namedExports: {
        writesBlocked: async () => false
    }
});

const bridge = await import('../services/bridge.js');
const resolution = await import('../services/resolution.js');
const control = await import('../services/control.js');

test('name enrichment lands in live mode — siteName is the human name, not the accountId', async () => {
    const sites = await bridge.getSites();
    const site = sites.find(s => s.siteNo === '6261');
    assert.ok(site, 'site 6261 should exist');
    assert.equal(site.siteName, 'Wheatstone Inn (Gloucester)', 'enriched human name, not gk-6261');
    assert.notEqual(site.siteName, 'gk-6261');
    assert.equal(site.nameUnverified, false, 'a resolved name is verified');
});

test('search-by-name works via the enriched record (Tony test 2 — proves eager was required)', async () => {
    const results = await bridge.searchSites('wheatstone');
    assert.equal(results.length, 1, 'search by pub name should hit the enriched siteName');
    assert.equal(results[0].siteNo, '6261');
});

test('dispatch audit uses the enriched name, not the accountId (control.js:81)', async () => {
    lastAuditSiteName = null;
    writeCount = 0;
    const OPERATOR = { id: 'op-1', name: 'Handler One', email: 'h1@example.com' };
    const { token } = await resolution.confirmSite('6261', OPERATOR);
    await control.dispatch({
        operator: OPERATOR,
        confirmToken: token,
        siteNo: '6261',
        deviceId: 'salus-gk-6261-it700tx-025e0726', // the online it700 in the fixture (setpoint 6.5)
        command: 'setpoint',
        value: 8,          // within ±3°C of 6.5
        direction: 'up'
    });
    assert.equal(writeCount, 1, 'exactly one device write on the happy path');
    assert.equal(lastAuditSiteName, 'Wheatstone Inn (Gloucester)',
        'the audit must log the enriched human name, not gk-6261');
});

test('unverified-identity guard — Zendesk error falls back to accountId, flags nameUnverified, fetchLiveSites still succeeds (non-fatal)', async () => {
    const sites = await bridge.getSites(); // must NOT throw despite 4741's lookup rejecting
    const site = sites.find(s => s.siteNo === '4741');
    assert.ok(site, 'fetchLiveSites still returns the site when its name lookup errors (non-fatal)');
    assert.equal(site.siteName, 'gk-4741', 'falls back to the accountId on error/miss');
    assert.equal(site.nameUnverified, true, 'the unverified-name warning path is flagged');
    assert.equal(site.accountId, 'gk-4741', 'accountId retained for the de-emphasised fallback display');
});

test('graceful brand/address degrade pre-B2 — no literal "undefined" surfaces', async () => {
    const sites = await bridge.getSites();
    const site = sites.find(s => s.siteNo === '6261');
    assert.equal(site.brand, undefined, 'brand stays undefined until B2');
    assert.equal(site.address, undefined, 'address stays undefined until B2');
    // The record carries no stringified "undefined" — the UI helper renders name-only from this.
    assert.ok(!Object.values(site).includes('undefined'), 'no literal "undefined" value on the record');
});
