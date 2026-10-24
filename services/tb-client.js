/**
 * ThingsBoard client — the ONLY write mechanism in the app (F002/D2a):
 * TB shared attributes (setpointDesired / modeDesired / hwBoostHoursDesired),
 * dispatched with the SR-3 scoped WRITE credential. The vendor bridge picks the
 * attribute up and writes back *Reported / *SyncStatus (SD-492 contract).
 *
 * live mode    → real TB REST calls (separate read/write JWT sessions).
 * fixture mode → in-memory simulation honouring the fixture _demo flags so the
 *                pending/synced/failed/timeout paths are all exercisable locally.
 */

import axios from 'axios';
import { config } from '../config.js';
import * as registry from './registry.js';

/* ------------------------------------------------------------------ */
/* Live TB sessions (read + scoped write)                              */
/* ------------------------------------------------------------------ */

function tbSession(username, password, label) {
    let token = null;
    let expiry = 0;
    // OOHDASH-24: an ACTIVE probe-result record replaces the old lazy boolean `healthy` latch.
    // `checkedAt` is 0 until a probe/read actually runs, so an unexercised-but-configured session
    // is stale/never-run (amber), never green. `ok` records the LAST outcome (auth/read success vs
    // 401/transport failure). Any successful auth or request refreshes the record; any failure marks
    // it not-ok. Freshness is judged against config.control.healthProbeTtlMs at read time.
    let probe = { ok: false, checkedAt: 0 };
    function markProbe(ok) { probe = { ok, checkedAt: Date.now() }; }
    async function getToken() {
        if (token && Date.now() < expiry) return token;
        const res = await axios.post(`${config.thingsboard.url}/api/auth/login`, { username, password }, { timeout: 10000 });
        token = res.data.token;
        expiry = Date.now() + 2 * 60 * 60 * 1000;
        markProbe(true);
        console.log(`[TB] Authenticated (${label})`);
        return token;
    }
    async function request(method, path, data) {
        try {
            const res = await axios({
                method,
                url: `${config.thingsboard.url}${path}`,
                headers: { 'X-Authorization': `Bearer ${await getToken()}` },
                data,
                timeout: 15000
            });
            markProbe(true);
            return res.data;
        } catch (err) {
            if (err.response?.status === 401) { token = null; }
            markProbe(false);
            throw err;
        }
    }
    /**
     * OOHDASH-24 — active read probe. A cheap authenticated call (the existing getToken() login)
     * that positively re-proves the read credential is still live, so a once-good-now-dead cred is
     * caught on the healthcheck path WITHOUT needing a device read to trigger it. Records outcome +
     * timestamp; never throws (health must not take down /healthz). No-op when unconfigured.
     */
    async function activeReadProbe() {
        if (!(username && password)) return probe;
        // Force a FRESH authentication rather than trusting a cached JWT: a cred that has been
        // revoked server-side still has a locally-cached (unexpired) token, so reusing it would
        // never detect the death — the stale-green defect this ticket exists to kill. Clearing the
        // token makes getToken() re-hit /api/auth/login and surfaces a 401 on a dead cred.
        token = null;
        expiry = 0;
        try {
            await getToken(); // re-authenticates; marks ok + fresh on success
        } catch {
            markProbe(false); // 401 / transport ⇒ not-ok + fresh
        }
        return probe;
    }
    const isConfigured = () => !!(username && password);
    const isFresh = () => (Date.now() - probe.checkedAt) < config.control.healthProbeTtlMs;
    return {
        request,
        activeReadProbe,
        isConfigured,
        // Read tri-state derived from freshness + last outcome. Callers map this to /healthz colours.
        // Never green off a stale/never-run probe (checkedAt 0 is always stale).
        readState() {
            if (!isConfigured()) return 'unconfigured';
            if (!isFresh()) return 'unknown';      // configured but not proven within the TTL (amber)
            return probe.ok ? 'healthy' : 'unhealthy';
        }
    };
}

const readSession = tbSession(config.thingsboard.readUsername, config.thingsboard.readPassword, 'read');
const writeSession = tbSession(config.thingsboard.writeUsername, config.thingsboard.writePassword, 'write/SR-3');

/**
 * Thin read-plane request wrapper (read plane / D5). Lets services/tb-device.js issue
 * arbitrary read-only TB REST calls (device inventory `textSearch`, telemetry) over the
 * SAME single read credential/session/JWT/health-probe used by the confirm reads — one
 * credential, one probe, no second login. Read-only by contract: only GET/POST query
 * endpoints are ever passed here; the write primitive stays writeServerScopeAttribute().
 * No-op-unsafe in fixture mode by design — tb-device.js branches on config.dataMode and
 * never calls this outside live mode (mirroring bridge.js's fixture/live split).
 */
export async function readRequest(method, path, data) {
    return readSession.request(method, path, data);
}

/**
 * Reads SERVER_SCOPE attributes for a device by TB UUID (read plane). Mirrors the SHARED_SCOPE
 * SHARED_SCOPE read style — TB returns the array form `[{ key, value, lastUpdateTs }]` which we fold
 * to a plain `{ key: value }` map. Used by tb-device.js to source `active`/`lastActivityTime` per
 * device (OOHDASH-80: /api/tenant/devices omits `active`; SERVER_SCOPE carries the TB UI Active state).
 * Read-only by contract; no write session touched.
 */
export async function readServerScopeAttributes(uuid, keys) {
    const attrs = await readSession.request(
        'GET',
        `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SERVER_SCOPE?keys=${encodeURIComponent(keys)}`
    );
    const out = {};
    for (const row of Array.isArray(attrs) ? attrs : []) {
        if (row && row.key !== undefined) out[row.key] = row.value;
    }
    return out;
}

/**
 * Reads CLIENT_SCOPE attributes for a device by TB UUID (read plane, OOHDASH-82 design §4). Mirrors
 * readServerScopeAttributes exactly, but against the CLIENT_SCOPE attributes endpoint — TB returns the
 * array form `[{ key, value, lastUpdateTs }]` which we fold to a plain `{ key: value }` map. Used by
 * tb-device.js to source the iT500 `site` code (and the iT700 `salusLocation`) for area derivation.
 * Read-only by contract; no write session touched.
 */
export async function readClientScopeAttributes(uuid, keys) {
    const attrs = await readSession.request(
        'GET',
        `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/CLIENT_SCOPE?keys=${encodeURIComponent(keys)}`
    );
    const out = {};
    for (const row of Array.isArray(attrs) ? attrs : []) {
        if (row && row.key !== undefined) out[row.key] = row.value;
    }
    return out;
}


/**
 * Reads SHARED_SCOPE attributes for a device by TB UUID (read plane, OOHDASH-114-F1).
 * Used by tb-device.js to source V1 boilerControl output1OutputMask from SHARED_SCOPE.
 * Read-only by contract; no write session touched.
 */
export async function readSharedScopeAttributes(uuid, keys) {
    const attrs = await readSession.request(
        "GET",
        `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SHARED_SCOPE?keys=${encodeURIComponent(keys)}`
    );
    const out = {};
    for (const row of Array.isArray(attrs) ? attrs : []) {
        if (row && row.key !== undefined) out[row.key] = row.value;
    }
    return out;
}

const deviceUuidCache = new Map();

async function tbDeviceUuid(deviceName) {
    if (deviceUuidCache.has(deviceName)) return deviceUuidCache.get(deviceName);
    const res = await readSession.request('GET', `/api/tenant/devices?deviceName=${encodeURIComponent(deviceName)}`);
    const uuid = res?.id?.id;
    if (!uuid) throw new Error(`TB device "${deviceName}" not found`);
    deviceUuidCache.set(deviceName, uuid);
    return uuid;
}

/* ------------------------------------------------------------------ */
/* Fixture simulation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Registration gate in fixture mode (Spencer §3 rule 2). Fixture devices are considered REGISTERED
 * by default (they carry live telemetry in the fixture inventory) — the gate only fails for a device
 * explicitly flagged `_demo: 'unregistered'`, so the never-reported drop path stays exercisable
 * without breaking every happy-path dispatch.
 */
function simHasPublished(device) {
    return device?._demo !== 'unregistered';
}

/* ------------------------------------------------------------------ */
/* OOHDASH-123 Rosetta Stone — fixture sim for the SERVER_SCOPE Requested write +          */
/* the three-outcome confirm read (status + LastError attrs, confirming telemetry).        */
/* ------------------------------------------------------------------ */

// deviceId -> { requested, requestedTs, demo, baseTs, prevTel, prevTelTs, swallowed }
const cmdSim = new Map();
// Trajectory step (ms). Small by default so unit/e2e exercise all phases quickly; env-overridable.
function simStepMs() { return parseInt(process.env.OOH_SIM_STEP_MS || '700', 10); }
function telemetryOf(device, contract) {
    const t = device?.telemetry || {};
    for (const k of (contract.confirmKeys || [])) { if (t[k] !== undefined) return t[k]; }
    return null;
}

/**
 * Fixture write of a *Requested key. The `_demo` flag steers the confirm trajectory simReadCommand
 * then plays out. Returns the server-assigned dispatchTs (here: the write time).
 */
function simWriteRequested(device, value) {
    const demo = device._demo || null;
    const now = Date.now();
    const contract = registry.capabilitiesContractFor(device.deviceType);
    const prev = cmdSim.get(device.deviceId);
    const prevTel = prev ? prev.prevTel : telemetryOf(device, contract);
    const prevTelTs = now - 60000;
    const swallowed = demo === 'swallowed';
    cmdSim.set(device.deviceId, { requested: value, requestedTs: now, demo, baseTs: now, prevTel, prevTelTs, swallowed });
    return now;
}

/**
 * Fixture confirm read → { status, statusTs, lastError, telemetryValue, telemetryTs }. Models every
 * design §5 scenario via `_demo`: (default) confirm, pending, rejected(-gate/-vendor), noecho,
 * match-pending (cross-clock guard), echo-first (echo-before-accepted), swallowed (no pending advance).
 */
function simReadCommand(device, contract) {
    const c = cmdSim.get(device.deviceId);
    if (!c) {
        // No command in flight — the device's current confirming telemetry (pre-dispatch read).
        const tv = telemetryOf(device, contract);
        return { status: null, statusTs: null, lastError: null, telemetryValue: tv, telemetryTs: tv == null ? null : Date.now() - 60000 };
    }
    // Swallowed write: the Requested write landed but the gate wrote NO new pending — statusTs never
    // advances past dispatchTs, which the dispatch-sanity check (WU5) must catch.
    if (c.swallowed) {
        return { status: 'pending', statusTs: c.baseTs - 60000, lastError: null, telemetryValue: c.prevTel, telemetryTs: c.prevTelTs };
    }
    const step = simStepMs();
    const base = c.baseTs;
    const el = Date.now() - base;
    const matchVal = c.requested;
    let status = 'pending', statusTs = base + 1, lastError = null;
    let telemetryValue = c.prevTel, telemetryTs = c.prevTelTs;
    const setTel = (off) => { if (el >= off) { telemetryValue = matchVal; telemetryTs = base + off; } };
    const setAccepted = (off) => { if (el >= off) { status = 'accepted'; statusTs = base + off; } };

    switch (c.demo) {
        case 'pending':
            break; // stays pending forever
        case 'rejected':
        case 'rejected-gate':
            if (el >= 2 * step) { status = 'rejected'; statusTs = base + 2 * step; lastError = 'gate: device offline'; }
            break;
        case 'rejected-vendor':
            if (el >= 2 * step) { status = 'rejected'; statusTs = base + 2 * step; lastError = `vendor: No active Tuya session owns device ${device.deviceId}`; }
            break;
        case 'fail': // legacy alias → gate internal fault rejection
            if (el >= 2 * step) { status = 'rejected'; statusTs = base + 2 * step; lastError = 'gate: internal fault'; }
            break;
        case 'noecho':
        case 'accepted-noecho':
        case 'slow': // legacy IT700 slow-echo → accepted, telemetry never matches within window
            setAccepted(2 * step);
            break;
        case 'match-pending':
            setTel(1 * step); // telemetry matches but status stays pending → NOT confirmed (guard)
            break;
        case 'echo-first': // echo-before-accepted: telemetry first, accepted later → confirms on accepted
            setTel(1 * step);
            setAccepted(3 * step);
            break;
        default: // 'confirm' happy path
            setAccepted(2 * step);
            setTel(3 * step);
    }
    return { status, statusTs, lastError, telemetryValue, telemetryTs };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * OOHDASH-123 Rosetta Stone (WU2) — the ONLY control write. Writes a *Requested key to SERVER_SCOPE so
 * Spencer's IoT Command Gate validates it, writes `pending`, rewrites Desired and rings the bridge.
 * Returns the server-assigned dispatchTs (the Requested key's lastUpdateTs) for the fresh-echo guard.
 * Allow-listed against registry.REQUESTED_KEYS; honours the WRITES_DISABLED deploy-time lock.
 */
export async function writeServerScopeAttribute(device, attribute, value) {
    if (!registry.REQUESTED_KEYS.includes(attribute)) {
        throw new Error(`Attribute ${attribute} is not a permitted control request attribute`);
    }
    if (config.dataMode === 'fixture') return simWriteRequested(device, value);
    // D6 — WRITES_DISABLED primitive guard (belt-and-braces to the killswitch): refuse the LIVE write
    // with 423 before any TB POST fires. Prod ThingsBoard is READ-ONLY for this release (no prod writes).
    if (config.writesDisabled) throw Object.assign(new Error('Device writes are disabled at deploy time (WRITES_DISABLED)'), { status: 423 });
    const uuid = await tbDeviceUuid(device.deviceId);
    await writeSession.request('POST', `/api/plugins/telemetry/DEVICE/${uuid}/attributes/SERVER_SCOPE`, { [attribute]: value });
    // Record the server-assigned lastUpdateTs as dispatchTs (ThingsBoard server clock domain — the
    // same domain the confirm read's statusTs/telemetryTs are in, so the fresh-echo guard is apples-to-apples).
    try {
        const attrs = await readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SERVER_SCOPE?keys=${encodeURIComponent(attribute)}`);
        const row = (attrs || []).find(a => a.key === attribute);
        if (row && row.lastUpdateTs != null) return Number(row.lastUpdateTs);
    } catch (err) {
        console.error(`[TB] dispatchTs read-back failed for ${device.deviceId}: ${err.message}`);
    }
    return Date.now();
}

/**
 * OOHDASH-123 Rosetta Stone (WU3) — the NEW confirm read. Returns
 * { status, statusTs, lastError, telemetryValue, telemetryTs } for the device's class:
 *   - status + lastError from the gate's SERVER_SCOPE attributes (statusTs = the attr lastUpdateTs);
 *   - the confirming telemetry (first present confirmKey) from timeseries, KEEPING series[0].ts as
 *     telemetryTs (the ts that was discarded at tb-device.js:809 is retained here for the staleness guard).
 * Clock-domain note (build-plan divergence 3): ThingsBoard returns a server-RECEIPT ts on both the
 * attribute lastUpdateTs and the telemetry sample, so statusTs/telemetryTs and the dispatchTs recorded
 * by writeServerScopeAttribute are all in the server clock domain — the cross-clock guard is sound.
 */
export async function readCommandState(device, deviceType) {
    const contract = registry.capabilitiesContractFor(deviceType);
    if (config.dataMode === 'fixture') return simReadCommand(device, contract);
    const uuid = await tbDeviceUuid(device.deviceId);
    const attrKeys = [contract.statusKey, contract.errorKey].filter(Boolean);
    let attrs = [];
    if (attrKeys.length) {
        attrs = await readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SERVER_SCOPE?keys=${encodeURIComponent(attrKeys.join(','))}`);
    }
    const row = (k) => (Array.isArray(attrs) ? attrs : []).find(a => a.key === k);
    const sRow = contract.statusKey ? row(contract.statusKey) : null;
    const eRow = contract.errorKey ? row(contract.errorKey) : null;
    let telemetryValue = null, telemetryTs = null;
    if (contract.confirmKeys && contract.confirmKeys.length) {
        const ts = await readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries?keys=${encodeURIComponent(contract.confirmKeys.join(','))}`);
        for (const key of contract.confirmKeys) {
            const series = ts?.[key];
            if (Array.isArray(series) && series.length) {
                telemetryValue = series[0].value;
                telemetryTs = Number(series[0].ts);
                break;
            }
        }
    }
    return {
        status: sRow ? sRow.value : null,
        statusTs: sRow && sRow.lastUpdateTs != null ? Number(sRow.lastUpdateTs) : null,
        lastError: eRow ? eRow.value : null,
        telemetryValue,
        telemetryTs
    };
}


/**
 * Registration gate (D9 / Spencer §3 rule 2): TB only forwards commands for a device it has already
 * claimed via a first state publish. A device with NO published timeseries has its command silently
 * dropped — so we assert ≥1 published timeseries key before offering/dispatching control. Read-only.
 */
export async function hasPublishedState(device) {
    if (config.dataMode === 'fixture') return simHasPublished(device);
    const uuid = await tbDeviceUuid(device.deviceId);
    const keys = await readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/keys/timeseries`);
    return Array.isArray(keys) && keys.length > 0;
}

/** TEST-ONLY seam — clears the fixture sim state so edge/settle tests don't leak across each other. */
export function __resetSim() {
    cmdSim.clear();
    boilerAttrSim.clear();
}

/**
 * Test-only: directly write a value into boilerAttrSim for a given device+key.
 * This is the only way to pre-seed V2 fixture state for zone overrides (V2 RPC dispatch
 * is fire-and-forget and does not update boilerAttrSim). Only available in fixture mode.
 */
export function __setBoilerSim(deviceId, key, value, ts = Date.now()) {
    boilerAttrSim.set(boilerSimKey(deviceId, key), { value, ts });
}

/* ------------------------------------------------------------------ */
/* OOHDASH-141 — boiler-panel direct dispatch (V2 RPC + V1 SHARED)    */
/* ------------------------------------------------------------------ */

const BOILER_RPC_ZONES = Object.freeze(['CHZ1', 'CHZ2']);
const BOILER_SHARED_KEYS = Object.freeze(['output2Override', 'output3Override']);

// Fixture-mode attribute simulation store: deviceId+key → { value, ts }
const boilerAttrSim = new Map();

function boilerSimKey(deviceId, key) { return `${deviceId}::${key}`; }

/**
 * OOHDASH-141 — V2 boiler RPC dispatch. Sends `{ method: 'override', params: 'CHZn ±1' }` via
 * one-way RPC. Only `BOILER_RPC_ZONES` and values `{1,-1}` are accepted (allow-list). Honours
 * WRITES_DISABLED. Returns `{ sentAtMs }` on success; throws with `{ delivery }` tag on failure.
 */
export async function dispatchBoilerRpc(device, zone, n, durationMin = null) {
    if (!BOILER_RPC_ZONES.includes(zone)) throw new Error(`Invalid boiler zone: ${zone}`);
    if (n !== 1 && n !== -1) throw new Error(`Invalid boiler boost direction: ${n}`);
    if (config.dataMode === 'fixture') {
        // Write to boilerAttrSim so readBoilerState/confirm polling sees the dispatched state.
        const now = Date.now();
        boilerAttrSim.set(boilerSimKey(device.deviceId, `${zone}.override`), { value: n, ts: now });
        return { sentAtMs: now };
    }
    if (config.writesDisabled) throw Object.assign(new Error('Device writes are disabled at deploy time (WRITES_DISABLED)'), { status: 423 });
    const params = `${zone} ${n > 0 ? '1' : '-1'}${(durationMin != null && config.boilerBoost?.v2DurationToken) ? ` ${durationMin}` : ''}`;
    const uuid = await tbDeviceUuid(device.deviceId);
    try {
        await writeSession.request('POST', `/api/rpc/oneway/${uuid}`, { method: 'override', params });
    } catch (err) {
        const status = err.response?.status;
        if (status && status >= 400 && status < 500) {
            throw Object.assign(new Error(`Boiler RPC rejected (${status}): ${err.response?.data?.message || err.message}`), { delivery: 'rejected', status });
        }
        throw Object.assign(new Error(`Boiler RPC failed: ${err.message}`), { delivery: 'unknown' });
    }
    return { sentAtMs: Date.now() };
}

/**
 * OOHDASH-141 — V1 SHARED_SCOPE attribute write for boiler zone override.
 * Only `BOILER_SHARED_KEYS` and values `{1,-1,0}` are accepted (allow-list). Honours WRITES_DISABLED.
 * Returns `{ attrTs }` (server-assigned lastUpdateTs) on success.
 */
export async function writeSharedScopeAttribute(device, attribute, value) {
    if (!BOILER_SHARED_KEYS.includes(attribute)) throw new Error(`Attribute ${attribute} is not a permitted boiler shared attribute`);
    if (![1, -1, 0].includes(value)) throw new Error(`Value ${value} is not valid for a boiler shared attribute (must be 1, -1 or 0)`);
    if (config.dataMode === 'fixture') {
        const now = Date.now();
        boilerAttrSim.set(boilerSimKey(device.deviceId, attribute), { value, ts: now });
        return { attrTs: now };
    }
    if (config.writesDisabled) throw Object.assign(new Error('Device writes are disabled at deploy time (WRITES_DISABLED)'), { status: 423 });
    const uuid = await tbDeviceUuid(device.deviceId);
    await writeSession.request('POST', `/api/plugins/telemetry/DEVICE/${uuid}/attributes/SHARED_SCOPE`, { [attribute]: value });
    // Read back the server-assigned lastUpdateTs so confirm can compare apples-to-apples.
    try {
        const attrs = await readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SHARED_SCOPE?keys=${encodeURIComponent(attribute)}`);
        const row = (Array.isArray(attrs) ? attrs : []).find(a => a.key === attribute);
        if (row && row.lastUpdateTs != null) return { attrTs: Number(row.lastUpdateTs) };
    } catch (err) {
        console.error(`[TB] boiler SHARED_SCOPE attrTs read-back failed for ${device.deviceId}: ${err.message}`);
    }
    return { attrTs: Date.now() };
}

/**
 * OOHDASH-141 — revert a boiler zone to auto (override = 0). This is the ONLY path allowed
 * under the BOILER_BOOST_REVERT_EXEMPT kill-switch exemption — it does NOT call the WRITES_DISABLED
 * guard when the exemption is 'all'. Value is hard-coded 0. Zone must be CHZ1 or CHZ2.
 */
export async function revertBoilerZoneToAuto(device, version, zone) {
    if (!BOILER_RPC_ZONES.includes(zone)) throw new Error(`Invalid boiler zone: ${zone}`);
    const exempt = config.boilerBoost?.revertExempt === 'all';
    if (config.dataMode === 'fixture') {
        const key = version === 'v1'
            ? (zone === 'CHZ1' ? 'output2Override' : 'output3Override')
            : `${zone}.override`;
        // +1 ensures ts strictly advances even when called in the same millisecond
        // as the __setBoilerSim setup in tests (ts > preTs confirm check would fail otherwise).
        const now = Date.now() + 1;
        boilerAttrSim.set(boilerSimKey(device.deviceId, key), { value: 0, ts: now });
        console.log(`[BOILER-REVERT-EXEMPT] fixture: reverting ${device.deviceId} ${zone} to auto`);
        return { attrTs: now };
    }
    console.log(`[BOILER-REVERT-EXEMPT] reverting ${device.deviceId} ${zone} to auto (exempt=${exempt}, version=${version})`);
    // Bypass WRITES_DISABLED when exempt; use writeSession directly.
    if (!exempt && config.writesDisabled) {
        throw Object.assign(new Error('Device writes are disabled at deploy time (WRITES_DISABLED)'), { status: 423 });
    }
    const uuid = await tbDeviceUuid(device.deviceId);
    if (version === 'v2') {
        await writeSession.request('POST', `/api/rpc/oneway/${uuid}`, { method: 'override', params: `${zone} 0` });
    } else {
        const attribute = zone === 'CHZ1' ? 'output2Override' : 'output3Override';
        await writeSession.request('POST', `/api/plugins/telemetry/DEVICE/${uuid}/attributes/SHARED_SCOPE`, { [attribute]: 0 });
    }
    return { attrTs: Date.now() };
}

/**
 * OOHDASH-141 — reads the current boiler zone state(s). Returns one entry per zone plus
 * `boiler: { enableState, ts }`.
 *
 * V2: reads timeseries keys CHZ1.override, CHZ2.override, boiler.enable_output_state,
 *     CHZ1.output_state, CHZ2.output_state. `dir` is Math.sign of the latest override value
 *     (string-tolerant per OOHDASH-143 fix).
 * V1: reads timeseries keys output2State, output3State, output1State, and SHARED_SCOPE attrs
 *     output2Override, output3Override for attrValue/attrTs.
 */
export async function readBoilerState(device, version, zones) {
    function parseDir(raw) {
        const n = parseInt(String(raw ?? '0'), 10);
        return isNaN(n) ? 0 : Math.sign(n);
    }

    if (config.dataMode === 'fixture') {
        const results = zones.map(zone => {
            const simKey = version === 'v1'
                ? (zone === 'CHZ1' ? 'output2Override' : 'output3Override')
                : `${zone}.override`;
            const sim = boilerAttrSim.get(boilerSimKey(device.deviceId, simKey));
            const attrValue = sim?.value ?? 0;
            const attrTs = sim?.ts ?? (Date.now() - 60000);
            const dir = parseDir(attrValue);
            return version === 'v1'
                ? { zone, dir, overrideRaw: attrValue, overrideTs: attrTs, outputState: dir !== 0, outputStateTs: attrTs - 1000, attrValue, attrTs }
                : { zone, dir, overrideRaw: attrValue, overrideTs: attrTs, outputState: dir !== 0, outputStateTs: attrTs - 1000, forcedUntilMs: null };
        });
        return { zones: results, boiler: { enableState: results.some(z => z.dir !== 0), ts: Date.now() - 5000 } };
    }

    const uuid = await tbDeviceUuid(device.deviceId);
    if (version === 'v2') {
        const keys = [
            ...zones.flatMap(z => [`${z}.override`, `${z}.output_state`]),
            'boiler.enable_output_state'
        ];
        const ts = await readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries?keys=${encodeURIComponent(keys.join(','))}`);
        const latest = (k) => { const s = ts?.[k]; return (Array.isArray(s) && s.length) ? s[0] : null; };
        const zoneResults = zones.map(zone => {
            const ov = latest(`${zone}.override`);
            const st = latest(`${zone}.output_state`);
            const dir = parseDir(ov?.value);
            const fSeconds = typeof ov?.value === 'string' ? null : null; // V2 panel may embed seconds; not available from simple latest read
            return { zone, dir, overrideRaw: ov?.value ?? null, overrideTs: ov?.ts ? Number(ov.ts) : null, outputState: st?.value, outputStateTs: st?.ts ? Number(st.ts) : null, forcedUntilMs: null };
        });
        const bv = latest('boiler.enable_output_state');
        return { zones: zoneResults, boiler: { enableState: bv?.value, ts: bv?.ts ? Number(bv.ts) : null } };
    } else {
        // V1: timeseries for output2State, output3State, output1State
        const tsKeys = ['output2State', 'output3State', 'output1State'];
        const attrKeys = ['output2Override', 'output3Override'];
        const [tsData, attrData] = await Promise.all([
            readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries?keys=${encodeURIComponent(tsKeys.join(','))}`),
            readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SHARED_SCOPE?keys=${encodeURIComponent(attrKeys.join(','))}`)
        ]);
        const latestTs = (k) => { const s = tsData?.[k]; return (Array.isArray(s) && s.length) ? s[0] : null; };
        const attrMap = {};
        for (const row of (Array.isArray(attrData) ? attrData : [])) {
            if (row?.key) attrMap[row.key] = row;
        }
        const zoneResults = zones.map(zone => {
            const tsKey = zone === 'CHZ1' ? 'output2State' : 'output3State';
            const attrKey = zone === 'CHZ1' ? 'output2Override' : 'output3Override';
            const st = latestTs(tsKey);
            const attr = attrMap[attrKey];
            const attrValue = attr?.value ?? null;
            const attrTs = attr?.lastUpdateTs != null ? Number(attr.lastUpdateTs) : null;
            const dir = parseDir(attrValue);
            return { zone, dir, overrideRaw: attrValue, overrideTs: attrTs, outputState: st?.value, outputStateTs: st?.ts ? Number(st.ts) : null, attrValue, attrTs };
        });
        const boilerSt = latestTs('output1State');
        return { zones: zoneResults, boiler: { enableState: boilerSt?.value, ts: boilerSt?.ts ? Number(boilerSt.ts) : null } };
    }
}

/**
 * Health signal for /healthz.
 *
 * OOHDASH-24: `read` is now a TRI-STATE string (unconfigured / unknown / healthy / unhealthy),
 * NOT a boolean. `unknown` (amber) means configured-but-not-proven-this-cycle and MUST NOT be
 * treated as green by any consumer (see server.js degraded predicate). A lazy active probe is
 * kicked off when the cached read-probe result is stale so a quiet pod still re-proves the cred;
 * it is fire-and-forget (never throws, never blocks the healthcheck response), so the state
 * reported here reflects the probe as of the LAST completed cycle — the following probe past the
 * TTL is what flips a dead-but-once-good cred to `unhealthy`.
 */
export function tbStatus() {
    if (config.dataMode === 'fixture') return { mode: 'fixture', read: 'healthy', write: true };
    const read = readSession.readState();
    // Lazily re-arm the probe when stale/never-run so the NEXT /healthz reflects a fresh outcome.
    // Fire-and-forget: activeReadProbe swallows its own errors, so this cannot reject unhandled.
    if (read === 'unknown') readSession.activeReadProbe();
    return {
        mode: 'live',
        read,
        write: writeSession.isConfigured() && writeSession.readState() === 'healthy',
        writeConfigured: writeSession.isConfigured()
    };
}

/**
 * OOHDASH-24 — run the active read probe and AWAIT its completion, returning the resulting
 * read tri-state. This is the deterministic (awaitable) counterpart to the fire-and-forget probe
 * kicked off inside tbStatus(); a boot warm-up or background timer can call it to positively
 * re-prove the read credential. No-op-safe in fixture mode.
 */
export async function probeReadHealth() {
    if (config.dataMode === 'fixture') return 'healthy';
    await readSession.activeReadProbe();
    return readSession.readState();
}
