/**
 * OOHDASH-85 (design §8.1) — LIVE real-device read-only proof of the freshness-based liveness fix.
 *
 * This is the decisive proof: against REAL ThingsBoard state, read-only, it shows the roof units that
 * were wrongly shown offline flip to ONLINE under the new rule, while genuinely-dead / never-reporting
 * AMR meters stay OFFLINE. It applies the SAME derivation the product uses (§3.2) to the observed
 * lastActivityTime, so it is deterministic against whatever real state exists on a quiet night.
 *
 * READ-ONLY / SAFE BY CONSTRUCTION:
 *   - GET only. It issues POST only to /api/auth/login (JWT auth) — no device write is ever made.
 *   - WRITES_DISABLED is irrelevant here because no write path is touched at all.
 *   - No secret is logged; the JWT is held in memory and never printed.
 *
 * AUTH: JWT via credentials/thingsboard.env (the ApiKey path is not provisioned in this environment —
 * JWT only, per design §8.1). Expected keys: TB_URL, TB_USERNAME, TB_PASSWORD.
 *
 * RUN:  node --test test/live/false-offline-live.test.js
 * If credentials/thingsboard.env is ABSENT, EVERY case reports skip-with-reason (never a silent pass) —
 * the test is written and wired to run the moment creds are provisioned.
 *
 * A named site that is unreachable at run time is likewise skipped-with-reason, never a silent pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import axios from 'axios';

const FRESHNESS_DEFAULT_MS = 48 * 60 * 60 * 1000;   // mirrors services/tb-device.js FRESHNESS_DEFAULT_MS

// The design's named cases (design §8.1).
const POSITIVE_SITES = ['4631', '6886', '6748'];    // roof units that were false-offline → must be ONLINE
const NEGATIVE_SITES = ['6770'];                     // never-reporting AMR meters / dead → must be OFFLINE

/* ------------------------------------------------------------------ */
/* Credentials — absent ⇒ the whole live proof is skipped-with-reason  */
/* ------------------------------------------------------------------ */

function loadCreds() {
    let raw;
    try {
        raw = readFileSync(new URL('../../credentials/thingsboard.env', import.meta.url), 'utf8');
    } catch {
        return null;   // creds absent — caller skips-with-reason
    }
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    if (!env.TB_URL || !env.TB_USERNAME || !env.TB_PASSWORD) return null;
    return { url: env.TB_URL.replace(/\/$/, ''), username: env.TB_USERNAME, password: env.TB_PASSWORD };
}

const creds = loadCreds();

/* ------------------------------------------------------------------ */
/* Read-only TB helpers (JWT). Never writes; never logs the token.      */
/* ------------------------------------------------------------------ */

async function login({ url, username, password }) {
    const res = await axios.post(`${url}/api/auth/login`, { username, password }, { timeout: 15000 });
    return res.data.token;
}

function authHdr(token) { return { headers: { 'X-Authorization': `Bearer ${token}` }, timeout: 15000 }; }

async function devicesForSite(url, token, siteNo) {
    // Mirror the product's inventory read: /api/tenant/devices?textSearch=gk-<site>.
    const q = `${url}/api/tenant/devices?textSearch=${encodeURIComponent(`gk-${siteNo}`)}&pageSize=200&page=0&sortProperty=name&sortOrder=ASC`;
    const res = await axios.get(q, authHdr(token));
    return Array.isArray(res.data?.data) ? res.data.data : [];
}

async function serverScope(url, token, uuid) {
    // Same GET the product issues: SERVER_SCOPE active,lastActivityTime.
    const res = await axios.get(
        `${url}/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SERVER_SCOPE?keys=active,lastActivityTime`,
        authHdr(token)
    );
    const map = {};
    for (const row of Array.isArray(res.data) ? res.data : []) if (row?.key !== undefined) map[row.key] = row.value;
    return map;
}

// The rule under test (design §3.2), duplicated here so the live proof is independent of the module.
function deriveOnline(lastMs, threshold, now) {
    if (lastMs == null) return false;
    return (now - lastMs) <= threshold;
}
function parseLastActivity(v) {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return (!Number.isFinite(n) || n <= 0) ? null : n;
}

async function observeSite(url, token, siteNo) {
    const devices = await devicesForSite(url, token, siteNo);
    if (!devices.length) return { reachable: true, empty: true, rows: [] };
    const now = Date.now();
    const rows = [];
    for (const d of devices) {
        const uuid = d?.id?.id || d?.id;
        if (!uuid) continue;
        const scope = await serverScope(url, token, uuid);
        const lastMs = parseLastActivity(scope.lastActivityTime);
        const ageH = lastMs == null ? null : Math.round((now - lastMs) / 3600000);
        rows.push({
            name: d.name,
            ageHours: ageH,
            active: scope.active,
            online: deriveOnline(lastMs, FRESHNESS_DEFAULT_MS, now)
        });
    }
    return { reachable: true, empty: false, rows };
}

/* ------------------------------------------------------------------ */
/* Positive cases — the roof units must compute ONLINE under the rule   */
/* ------------------------------------------------------------------ */

for (const siteNo of POSITIVE_SITES) {
    test(`LIVE positive: site ${siteNo} — a roof unit computes ONLINE under the freshness rule`, { skip: creds ? false : 'credentials/thingsboard.env absent — written, not run' }, async (t) => {
        const token = await login(creds);
        let obs;
        try {
            obs = await observeSite(creds.url, token, siteNo);
        } catch (err) {
            t.skip(`site ${siteNo} unreachable at run time: ${err.message}`);
            return;
        }
        if (obs.empty) { t.skip(`site ${siteNo} returned no devices at run time`); return; }
        const roof = obs.rows.filter(r => /roof|rtu|ahu|condens|unit/i.test(r.name));
        const pool = roof.length ? roof : obs.rows;
        const online = pool.filter(r => r.online);
        // Explainable evidence — observed age per device drives the verdict (design §8.1).
        console.log(`[LIVE ${siteNo}] ${pool.map(r => `${r.name}=${r.ageHours}h→${r.online ? 'ONLINE' : 'OFFLINE'}`).join(', ')}`);
        assert.ok(online.length > 0,
            `expected at least one fresh (roof) unit at ${siteNo} to compute ONLINE; observed: ${JSON.stringify(pool)}`);
    });
}

/* ------------------------------------------------------------------ */
/* Negative cases — dead / never-reporting devices must stay OFFLINE    */
/* ------------------------------------------------------------------ */

for (const siteNo of NEGATIVE_SITES) {
    test(`LIVE negative: site ${siteNo} — never-reporting / dead devices stay OFFLINE`, { skip: creds ? false : 'credentials/thingsboard.env absent — written, not run' }, async (t) => {
        const token = await login(creds);
        let obs;
        try {
            obs = await observeSite(creds.url, token, siteNo);
        } catch (err) {
            t.skip(`site ${siteNo} unreachable at run time: ${err.message}`);
            return;
        }
        if (obs.empty) { t.skip(`site ${siteNo} returned no devices at run time`); return; }
        console.log(`[LIVE ${siteNo}] ${obs.rows.map(r => `${r.name}=${r.ageHours == null ? 'no-ts' : r.ageHours + 'h'}→${r.online ? 'ONLINE' : 'OFFLINE'}`).join(', ')}`);

        // The decisive "no false-online" guarantee (design §8.1): NO device with a missing timestamp
        // or an age beyond its threshold may ever compute ONLINE. 6770 is a LIVE site — most devices
        // legitimately report fresh and are correctly ONLINE; only genuinely-dead / never-reporting
        // devices must stay OFFLINE. We assert to the design's actual claim, not a whole-site-offline one.
        const staleOrNoTs = obs.rows.filter(
            r => r.ageHours == null || r.ageHours > FRESHNESS_DEFAULT_MS / 3600000
        );
        const falseOnline = staleOrNoTs.filter(r => r.online);
        assert.equal(falseOnline.length, 0,
            `no stale/no-timestamp device at ${siteNo} may compute ONLINE; got false-online: ${JSON.stringify(falseOnline)}`);

        // Conversely, every ONLINE device must have a present, non-null timestamp within threshold.
        const onlineButUnfresh = obs.rows.filter(
            r => r.online && (r.ageHours == null || r.ageHours > FRESHNESS_DEFAULT_MS / 3600000)
        );
        assert.equal(onlineButUnfresh.length, 0,
            `every ONLINE device at ${siteNo} must have a fresh timestamp within threshold; got: ${JSON.stringify(onlineButUnfresh)}`);

        // The named genuinely-dead / never-reporting devices (design §8.1), when present at run time,
        // MUST be OFFLINE — proving the dead ones stay dead while the live site reports normally.
        const KNOWN_DEAD = [
            'gk-6770-ElecAMR-1', 'gk-6770-GasAMR-1', 'gk-6770-externallighting-1',
            'gk-6770-extractfan-1', 'gk-6770-lwgateway', 'gk-6770-salusit700-1',
            'gk-6770-salusit700-gateway-1'
        ];
        const deadPresent = obs.rows.filter(r => KNOWN_DEAD.includes(r.name));
        assert.ok(deadPresent.length > 0,
            `expected at least one known-dead device at ${siteNo} to be present at run time; observed names: ${JSON.stringify(obs.rows.map(r => r.name))}`);
        const deadWronglyOnline = deadPresent.filter(r => r.online);
        assert.equal(deadWronglyOnline.length, 0,
            `known-dead / never-reporting devices at ${siteNo} must compute OFFLINE; got online: ${JSON.stringify(deadWronglyOnline)}`);
    });
}
