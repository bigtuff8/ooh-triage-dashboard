/**
 * OOHDASH-164 Stage 1 — TB bulk vs per-device parity script (design §6, R&R check).
 *
 * Runs OUTSIDE the cluster from a machine with network access to TB. Read-only.
 * Compares bulk read (fetchLatestBulk → latestToBag) output against per-device reads
 * for every mapped device field on 10+ live sites. Any difference blocks the release.
 *
 * Usage:
 *   TB_READ_USERNAME=<user> TB_READ_PASSWORD=<pass> node scripts/tb-parity.mjs [--sites 10]
 *
 * NEVER prints TB_READ_USERNAME, TB_READ_PASSWORD or any JWT token.
 *
 * Exit code: 0 = all sites parity OK, 1 = differences found or error.
 */
import https from 'https';

const TB_URL = 'https://portal.lhlive.co.uk';
const TB_USERNAME = process.env.TB_READ_USERNAME;
const TB_PASSWORD = process.env.TB_READ_PASSWORD;
const SITE_LIMIT = Number(process.argv.find((_, i, a) => a[i - 1] === '--sites') || 10);

if (!TB_USERNAME || !TB_PASSWORD) {
    console.error('[parity] TB_READ_USERNAME and TB_READ_PASSWORD are required');
    process.exit(1);
}

// Key list (matches BULK_LATEST_KEYS in tb-device.js — must be kept in sync)
const TIME_SERIES_KEYS = [
    'temperature', 'localTemperature', 'temperatureC',
    'heatingSetpoint', 'setPoint', 'setpoint', 'setpointC',
    'mode', 'heatingActive', 'coolingActive', 'hotWater', 'hwBoostHours',
    'roomSensor1Temp', 'roomSensor2Temp',
    'output1State', 'output2State', 'output3State',
    'output2Override', 'output3Override', 'output2FallbackEnabled', 'output3FallbackEnabled',
    'output4Override',
    'summerModeActive', 'summer_mode',
    'switch_1', 'switch', 'switchOn',
    'DHW.override',
    'boiler.enable_output_state',
    'CHZ1.output_state', 'CHZ2.output_state',
    'CHZ1.override', 'CHZ2.override',
    'CHZ1.room_temp', 'CHZ2.room_temp',
    'CHZ1.fallback_enabled', 'CHZ2.fallback_enabled',
];
const SERVER_ATTRIBUTE_KEYS = ['active', 'lastActivityTime'];
const CLIENT_ATTRIBUTE_KEYS = ['site', 'salusLocation', 'DHW.use_boiler', 'heating_scenario', 'CHZ1.enabled', 'CHZ2.enabled'];
const SHARED_ATTRIBUTE_KEYS = ['output1OutputMask', 'output1Schedule', 'output2Schedule', 'output3Schedule', 'output4Schedule', 'CHZ1.schedule', 'CHZ2.schedule', 'DHW.schedule', 'schedules'];

const ALL_LATEST_VALUES = [
    ...TIME_SERIES_KEYS.map(k => ({ type: 'TIME_SERIES', key: k })),
    ...SERVER_ATTRIBUTE_KEYS.map(k => ({ type: 'SERVER_ATTRIBUTE', key: k })),
    ...CLIENT_ATTRIBUTE_KEYS.map(k => ({ type: 'CLIENT_ATTRIBUTE', key: k })),
    ...SHARED_ATTRIBUTE_KEYS.map(k => ({ type: 'SHARED_ATTRIBUTE', key: k })),
];

// ── HTTP helpers ─────────────────────────────────────────────────────────────

let _jwt = null;

async function tbRequest(method, path, body, { auth = true } = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, TB_URL);
        const bodyStr = body ? JSON.stringify(body) : null;
        const headers = {
            'Content-Type': 'application/json',
            ...(auth && _jwt ? { 'X-Authorization': `Bearer ${_jwt}` } : {}),
            ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        };
        const opts = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method,
            headers,
            timeout: 20000,
        };
        const req = https.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function authenticate() {
    // NEVER print the username or password
    const r = await tbRequest('POST', '/api/auth/login', {
        username: TB_USERNAME, password: TB_PASSWORD
    }, { auth: false });
    if (r.status !== 200 || !r.body?.token) throw new Error(`Auth failed: HTTP ${r.status}`);
    _jwt = r.body.token;
    console.log('[parity] Auth OK');
}

// ── Site/device discovery ─────────────────────────────────────────────────────

async function discoverSites(limit) {
    // Use the gk- prefix search to find live sites (same query as the dashboard)
    const r = await tbRequest('GET', `/api/tenant/devices?pageSize=1000&page=0&sortProperty=name&sortOrder=ASC`);
    if (r.status !== 200) throw new Error(`Device list failed: ${r.status}`);
    const all = r.body?.data || [];
    // Extract site numbers from device names
    const siteNos = new Set();
    for (const d of all) {
        const m = /^gk-(\d{4})-/.exec(d.name);
        if (m) siteNos.add(m[1]);
    }
    const sorted = [...siteNos].sort(() => Math.random() - 0.5); // shuffle for variety
    return sorted.slice(0, limit);
}

async function getDevicesForSite(siteNo) {
    const r = await tbRequest('GET', `/api/tenant/devices?pageSize=200&page=0&textSearch=gk-${siteNo}-&sortProperty=name&sortOrder=ASC`);
    if (r.status !== 200) return [];
    return (r.body?.data || []).filter(d => /^gk-\d{4}-/.test(d.name));
}

// ── Bulk read ─────────────────────────────────────────────────────────────────

async function bulkRead(deviceIds) {
    const r = await tbRequest('POST', '/api/entitiesQuery/find', {
        entityFilter: {
            type: 'entityList',
            entityType: 'DEVICE',
            entityList: deviceIds.map(id => ({ entityType: 'DEVICE', id })),
        },
        latestValues: ALL_LATEST_VALUES,
        pageLink: { pageSize: 1000, page: 0 },
    });
    if (r.status !== 200) throw new Error(`Bulk read failed: ${r.status}`);
    return r.body?.data || [];
}

// ── Per-device read ───────────────────────────────────────────────────────────

async function perDeviceRead(deviceId) {
    const tsBag = {};
    // TIME_SERIES
    const tsKeys = TIME_SERIES_KEYS.join(',');
    const tsR = await tbRequest('GET', `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${encodeURIComponent(tsKeys)}&limit=1&orderBy=DESC`);
    if (tsR.status === 200) {
        for (const [key, arr] of Object.entries(tsR.body || {})) {
            if (arr && arr[0]) tsBag[key] = { value: arr[0].value, ts: arr[0].ts };
        }
    }
    // SERVER_ATTRIBUTE
    const saR = await tbRequest('GET', `/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes/SERVER_SCOPE?keys=${encodeURIComponent(SERVER_ATTRIBUTE_KEYS.join(','))}`);
    const serverAttrs = {};
    if (saR.status === 200) {
        for (const a of saR.body || []) serverAttrs[a.key] = { value: a.value, ts: a.lastUpdateTs };
    }
    // CLIENT_ATTRIBUTE
    const caR = await tbRequest('GET', `/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes/CLIENT_SCOPE?keys=${encodeURIComponent(CLIENT_ATTRIBUTE_KEYS.join(','))}`);
    const clientAttrs = {};
    if (caR.status === 200) {
        for (const a of caR.body || []) clientAttrs[a.key] = { value: a.value, ts: a.lastUpdateTs };
    }
    // SHARED_ATTRIBUTE
    const shaR = await tbRequest('GET', `/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes/SHARED_SCOPE?keys=${encodeURIComponent(SHARED_ATTRIBUTE_KEYS.join(','))}`);
    const sharedAttrs = {};
    if (shaR.status === 200) {
        for (const a of shaR.body || []) sharedAttrs[a.key] = { value: a.value, ts: a.lastUpdateTs };
    }
    return { TIME_SERIES: tsBag, SERVER_ATTRIBUTE: serverAttrs, CLIENT_ATTRIBUTE: clientAttrs, SHARED_ATTRIBUTE: sharedAttrs };
}

// ── latestToBag (inlined from tb-device.js to avoid config.js dep in this standalone script) ──

function coerceAttrValue(v) {
    if (typeof v !== 'string') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v.startsWith('{') || v.startsWith('[')) {
        try { return JSON.parse(v); } catch { return v; }
    }
    const n = Number(v);
    if (v !== '' && Number.isFinite(n)) return n;
    return v;
}

function latestToBag(latestEntry) {
    const latest = latestEntry?.latest ?? {};
    const bag = {};
    for (const [key, entry] of Object.entries(latest.TIME_SERIES ?? {})) {
        if (entry && entry.ts !== 0) bag[key] = entry.value;
    }
    const serverAttrs = {};
    for (const [key, entry] of Object.entries(latest.SERVER_ATTRIBUTE ?? {})) {
        if (entry && entry.ts !== 0) serverAttrs[key] = coerceAttrValue(entry.value);
    }
    bag.__active = serverAttrs.active ?? false;
    bag.__lastActivityTime = serverAttrs.lastActivityTime != null
        ? (typeof serverAttrs.lastActivityTime === 'number'
            ? serverAttrs.lastActivityTime
            : Number(serverAttrs.lastActivityTime) || null)
        : null;
    const clientAttrs = {};
    for (const [key, entry] of Object.entries(latest.CLIENT_ATTRIBUTE ?? {})) {
        if (entry && entry.ts !== 0) clientAttrs[key] = coerceAttrValue(entry.value);
    }
    bag.__clientScope = clientAttrs;
    const sharedAttrs = {};
    for (const [key, entry] of Object.entries(latest.SHARED_ATTRIBUTE ?? {})) {
        if (entry && entry.ts !== 0) sharedAttrs[key] = coerceAttrValue(entry.value);
    }
    bag.__sharedScope = Object.keys(sharedAttrs).length > 0 ? sharedAttrs : null;
    return bag;
}

function perDeviceToBag(pd) {
    const bag = {};
    for (const [key, entry] of Object.entries(pd.TIME_SERIES ?? {})) {
        if (entry && entry.ts !== 0) bag[key] = String(entry.value);
    }
    const serverAttrs = {};
    for (const [key, entry] of Object.entries(pd.SERVER_ATTRIBUTE ?? {})) {
        if (entry && entry.ts !== 0) serverAttrs[key] = coerceAttrValue(entry.value);
    }
    bag.__active = serverAttrs.active ?? false;
    bag.__lastActivityTime = serverAttrs.lastActivityTime != null
        ? (typeof serverAttrs.lastActivityTime === 'number'
            ? serverAttrs.lastActivityTime
            : Number(serverAttrs.lastActivityTime) || null)
        : null;
    const clientAttrs = {};
    for (const [key, entry] of Object.entries(pd.CLIENT_ATTRIBUTE ?? {})) {
        if (entry && entry.ts !== 0) clientAttrs[key] = coerceAttrValue(entry.value);
    }
    bag.__clientScope = clientAttrs;
    const sharedAttrs = {};
    for (const [key, entry] of Object.entries(pd.SHARED_ATTRIBUTE ?? {})) {
        if (entry && entry.ts !== 0) sharedAttrs[key] = coerceAttrValue(entry.value);
    }
    bag.__sharedScope = Object.keys(sharedAttrs).length > 0 ? sharedAttrs : null;
    return bag;
}

// ── Comparison ────────────────────────────────────────────────────────────────

function compareBags(deviceId, bulkBag, perBag) {
    const diffs = [];
    // Check all keys present in either bag
    const allKeys = new Set([...Object.keys(bulkBag), ...Object.keys(perBag)]);
    for (const key of allKeys) {
        if (key === '__telemLastSeenMs') continue; // expected to differ (key list scope)
        const bv = bulkBag[key];
        const pv = perBag[key];
        if (JSON.stringify(bv) !== JSON.stringify(pv)) {
            diffs.push({ key, bulk: bv, perDevice: pv });
        }
    }
    return diffs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`[parity] TB parity script — comparing bulk vs per-device on ${SITE_LIMIT} sites`);
    console.log(`[parity] Target: ${TB_URL}`);
    await authenticate();

    console.log('[parity] Discovering sites…');
    const siteNos = await discoverSites(SITE_LIMIT);
    console.log(`[parity] Sites to check: ${siteNos.join(', ')}`);

    let totalDevices = 0;
    let totalDiffs = 0;
    let sitesWithDiffs = 0;

    for (const siteNo of siteNos) {
        const devices = await getDevicesForSite(siteNo);
        if (!devices.length) {
            console.log(`  site ${siteNo}: no devices found, skipping`);
            continue;
        }
        const deviceIds = devices.map(d => d.id.id);
        console.log(`  site ${siteNo}: ${devices.length} device(s)`);

        // Bulk read
        let bulkEntities;
        try {
            bulkEntities = await bulkRead(deviceIds);
        } catch (err) {
            console.warn(`  site ${siteNo}: bulk read failed — ${err.message}`);
            continue;
        }

        // Per-device reads (sequential to avoid rate limiting)
        const siteDiffs = [];
        for (const device of devices) {
            const uuid = device.id.id;
            const bulkEntry = bulkEntities.find(e => e.entityId?.id === uuid);
            if (!bulkEntry) {
                console.warn(`  site ${siteNo}: ${device.name} — missing from bulk response`);
                continue;
            }
            let perDevice;
            try {
                perDevice = await perDeviceRead(uuid);
            } catch (err) {
                console.warn(`  site ${siteNo}: ${device.name} per-device read failed — ${err.message}`);
                continue;
            }
            const bulkBag = latestToBag(bulkEntry);
            const perBag = perDeviceToBag(perDevice);
            const diffs = compareBags(uuid, bulkBag, perBag);
            if (diffs.length) {
                console.error(`  DIFF ${device.name}:`);
                for (const d of diffs) {
                    console.error(`    ${d.key}: bulk=${JSON.stringify(d.bulk)} per=${JSON.stringify(d.perDevice)}`);
                }
                siteDiffs.push(...diffs);
            }
            totalDevices++;
        }
        if (siteDiffs.length) {
            sitesWithDiffs++;
            totalDiffs += siteDiffs.length;
        } else {
            console.log(`  site ${siteNo}: OK (all ${devices.length} devices match)`);
        }
    }

    console.log('');
    console.log('=== PARITY SUMMARY ===');
    console.log(`Sites checked:    ${siteNos.length}`);
    console.log(`Devices checked:  ${totalDevices}`);
    console.log(`Sites with diffs: ${sitesWithDiffs}`);
    console.log(`Total diffs:      ${totalDiffs}`);
    if (totalDiffs > 0) {
        console.error('[parity] FAIL — differences found. Release is BLOCKED until all diffs are explained or keys are added.');
        process.exit(1);
    } else {
        console.log('[parity] PASS — bulk and per-device output match across all checked sites.');
        process.exit(0);
    }
}

main().catch(err => {
    // Never print TB credentials — the error might contain URL/auth context
    const msg = String(err.message || err).replace(TB_PASSWORD || '', '[REDACTED]');
    console.error(`[parity] Fatal: ${msg}`);
    process.exit(1);
});
