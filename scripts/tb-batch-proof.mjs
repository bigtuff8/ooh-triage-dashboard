/**
 * OOHDASH-164 proof script — batch endpoint + full key list (design section 6).
 * Tests POST /api/entitiesQuery/find with latestValues against 4 specific sites.
 * API key read from TB_API_KEY env (populated from Key Vault by the caller — NEVER logged here).
 * Read-only. No writes to ThingsBoard.
 *
 * Usage:
 *   TB_API_KEY=<key> node scripts/tb-batch-proof.mjs
 *
 * Reports:
 *   - Proof a: bulk endpoint accessible under svc-read key (HTTP 200)
 *   - Proof b: all keys from design section 6 present in at least one device
 *   - Attribute value types (typed vs string)
 *   - ts=0 detection (never-reported keys)
 *   - Device count and latency per site
 */
import https from 'https';

const TB_URL = 'https://portal.lhlive.co.uk';
const API_KEY = process.env.TB_API_KEY;

if (!API_KEY || API_KEY.length < 10) {
    console.error('TB_API_KEY not set or too short');
    process.exit(1);
}

// Full key list from design section 6 (OOHDASH-164 design gate, Addendum A)
const TIME_SERIES_KEYS = [
    'temperature', 'localTemperature', 'temperatureC',
    'heatingSetpoint', 'setPoint', 'setpoint', 'setpointC',
    'mode', 'heatingActive', 'coolingActive', 'hotWater', 'hwBoostHours',
    'roomSensor1Temp', 'roomSensor2Temp',
    'output1State', 'output2State', 'output3State',
    'output2Override', 'output3Override',
    'output2FallbackEnabled', 'output3FallbackEnabled',
    'output4Override', 'summerModeActive', 'summer_mode',
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

console.log(`Key list: ${TIME_SERIES_KEYS.length} TIME_SERIES, ${SERVER_ATTRIBUTE_KEYS.length} SERVER_ATTRIBUTE, ${CLIENT_ATTRIBUTE_KEYS.length} CLIENT_ATTRIBUTE, ${SHARED_ATTRIBUTE_KEYS.length} SHARED_ATTRIBUTE`);

async function tbRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, TB_URL);
        const bodyStr = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method,
            headers: {
                'X-Authorization': `ApiKey ${API_KEY}`,
                'Content-Type': 'application/json',
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
            },
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
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function checkAuth() {
    const t0 = Date.now();
    const r = await tbRequest('GET', '/api/auth/user');
    if (r.status !== 200) throw new Error(`Auth check failed: ${r.status}`);
    console.log(`Auth OK (${Date.now() - t0}ms)`);
}

async function runBulkQuery(siteNo) {
    const t0 = Date.now();
    const body = {
        entityFilter: {
            type: 'entityName',
            entityType: 'DEVICE',
            entityNameFilter: `gk-${siteNo}-`,
            resolveMultiple: true,
        },
        latestValues: ALL_LATEST_VALUES,
        pageLink: { pageSize: 200, page: 0 },
    };
    const r = await tbRequest('POST', '/api/entitiesQuery/find', body);
    const ms = Date.now() - t0;
    return { status: r.status, entities: r.body?.data || [], ms, raw: r.body };
}

function analyseKeyCoverage(entities) {
    const found = { TIME_SERIES: new Set(), SERVER_ATTRIBUTE: new Set(), CLIENT_ATTRIBUTE: new Set(), SHARED_ATTRIBUTE: new Set() };
    for (const e of entities) {
        for (const [scope, entries] of Object.entries(e.latest || {})) {
            for (const key of Object.keys(entries || {})) {
                found[scope]?.add(key);
            }
        }
    }

    const check = (label, wanted, foundSet) => {
        const missing = wanted.filter(k => !foundSet.has(k));
        const present = wanted.filter(k => foundSet.has(k));
        const pct = Math.round(100 * present.length / wanted.length);
        if (missing.length) {
            console.log(`    ${label}: ${present.length}/${wanted.length} present (${pct}%) — missing: ${missing.join(', ')}`);
        } else {
            console.log(`    ${label}: all ${wanted.length} present (100%)`);
        }
        return missing.length === 0;
    };

    const tsOk = check('TIME_SERIES', TIME_SERIES_KEYS, found.TIME_SERIES);
    const srvOk = check('SERVER_ATTRIBUTE', SERVER_ATTRIBUTE_KEYS, found.SERVER_ATTRIBUTE);
    const cliOk = check('CLIENT_ATTRIBUTE', CLIENT_ATTRIBUTE_KEYS, found.CLIENT_ATTRIBUTE);
    const shdOk = check('SHARED_ATTRIBUTE', SHARED_ATTRIBUTE_KEYS, found.SHARED_ATTRIBUTE);
    return tsOk && srvOk && cliOk && shdOk;
}

function analyseAttributeTypes(entities) {
    // Check if CLIENT_ATTRIBUTE and SERVER_ATTRIBUTE values come back typed or as strings
    const typeCounts = { boolean: 0, number: 0, string: 0, other: 0 };
    let checked = 0;
    for (const e of entities) {
        for (const scope of ['CLIENT_ATTRIBUTE', 'SERVER_ATTRIBUTE']) {
            for (const [, entry] of Object.entries(e.latest?.[scope] || {})) {
                if (entry && entry.ts > 0) {
                    const v = entry.value;
                    typeCounts[typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : typeof v === 'string' ? 'string' : 'other']++;
                    checked++;
                }
            }
        }
    }
    if (!checked) {
        console.log('    Attribute types: no live attribute values to sample');
        return;
    }
    const typed = typeCounts.boolean + typeCounts.number;
    const verdict = typed > 0 && typeCounts.string === 0 ? 'TYPED' : typed === 0 ? 'ALL STRINGS' : `MIXED (typed=${typed}, string=${typeCounts.string})`;
    console.log(`    Attribute types (CLIENT+SERVER, ts>0): ${verdict} — boolean=${typeCounts.boolean}, number=${typeCounts.number}, string=${typeCounts.string} (${checked} values sampled)`);
}

function analyseNeverReported(entities) {
    // Keys with ts=0 are never-reported keys returned by the bulk query
    let ts0Count = 0, ts0Devices = 0, liveCount = 0;
    for (const e of entities) {
        let deviceHasTs0 = false;
        for (const entries of Object.values(e.latest || {})) {
            for (const entry of Object.values(entries || {})) {
                if (entry && entry.ts === 0) { ts0Count++; deviceHasTs0 = true; }
                else if (entry && entry.ts > 0) liveCount++;
            }
        }
        if (deviceHasTs0) ts0Devices++;
    }
    if (ts0Count > 0) {
        console.log(`    Never-reported keys (ts=0): ${ts0Count} entries across ${ts0Devices}/${entities.length} devices — these will be dropped by the adapter`);
    } else {
        console.log(`    Never-reported keys (ts=0): none found (${liveCount} live entries)`);
    }
}

async function proofSite(siteNo) {
    console.log(`\n=== Site ${siteNo} ===`);
    const result = await runBulkQuery(siteNo);

    // Proof a: endpoint accessible
    if (result.status !== 200) {
        console.log(`  FAIL (proof a): HTTP ${result.status} — bulk endpoint not accessible`);
        return false;
    }
    console.log(`  PASS (proof a): HTTP 200 — ${result.entities.length} devices in ${result.ms}ms`);

    if (!result.entities.length) {
        console.log('  No devices returned — skipping key coverage and type checks');
        return false;
    }

    // Proof b: key coverage
    console.log('  Key coverage (proof b):');
    const keysOk = analyseKeyCoverage(result.entities);
    console.log(`  Proof b: ${keysOk ? 'PASS — all keys present' : 'PARTIAL — some keys missing (see above)'}`);

    // Attribute type analysis
    console.log('  Attribute value types:');
    analyseAttributeTypes(result.entities);

    // Never-reported keys (ts=0)
    console.log('  Never-reported key detection:');
    analyseNeverReported(result.entities);

    return keysOk;
}

async function main() {
    console.log('TB batch proof — OOHDASH-164 — READ ONLY');
    await checkAuth();

    const sites = ['6803', '6827', '6234', '6811'];
    const summary = [];

    for (const siteNo of sites) {
        try {
            const ok = await proofSite(siteNo);
            summary.push({ siteNo, ok });
        } catch (err) {
            console.error(`  ERROR on site ${siteNo}:`, err.message);
            summary.push({ siteNo, ok: false, err: err.message });
        }
    }

    console.log('\n=== Summary ===');
    for (const { siteNo, ok, err } of summary) {
        console.log(`  Site ${siteNo}: ${ok ? 'PASS' : 'FAIL'}${err ? ` (${err})` : ''}`);
    }
    const allOk = summary.every(s => s.ok);
    console.log(`\nProof a+b: ${allOk ? 'PASS' : 'FAIL'}`);
    process.exit(allOk ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
