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

const ATTRIBUTE_FAMILY = {
    switchDesired: { reported: 'switchReported', sync: 'switchSyncStatus' },
    setpointDesired: { reported: 'setpointReported', sync: 'setpointSyncStatus' },
    modeDesired: { reported: 'modeReported', sync: 'modeSyncStatus' },
    hwBoostHoursDesired: { reported: 'hwBoostReported', sync: 'hwBoostSyncStatus' }
};

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
 * endpoints are ever passed here; the write primitive stays writeSharedAttribute().
 * No-op-unsafe in fixture mode by design — tb-device.js branches on config.dataMode and
 * never calls this outside live mode (mirroring bridge.js's fixture/live split).
 */
export async function readRequest(method, path, data) {
    return readSession.request(method, path, data);
}

/**
 * Reads SERVER_SCOPE attributes for a device by TB UUID (read plane). Mirrors readDesiredState's
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

// deviceId → { attribute → { desired, desiredTs, reported, reportedTs, sync, syncTs, settleAt, demo } }
const simState = new Map();

function simFor(deviceId) {
    if (!simState.has(deviceId)) simState.set(deviceId, {});
    return simState.get(deviceId);
}

/**
 * Edge-aware fixture write (mirrors Spencer §3 rule 1). Re-writing the SAME desired value does NOT
 * re-arm a pending cycle — the edge-triggered bridge would dispatch nothing. Records desiredTs so
 * the confirm/edge logic can compare freshness. `_demo` steers the settle outcome:
 *   (none)         → settles 'synced' at the desired value after ~2.5s
 *   'fail'         → settles 'failed' after ~2.5s
 *   'slow'         → never settles (IT700 slow-echo timeout path)
 *   'already'      → pre-seeds a fresh synced echo AT the first written value (already-satisfied)
 *   'duplicate'    → stays 'pending' forever after the first write (duplicate-pending on re-write)
 *   'rejected'     → settles 'rejected' after ~2.5s
 *   'stale-synced' → settles 'synced' but at the PREVIOUS reported value (never the new one) with a
 *                    STALE syncTs — the silently-ignored-value trap; the fresh-echo guard must
 *                    reject it so the action times out honestly.
 */
function simWrite(device, attribute, value) {
    const s = simFor(device.deviceId);
    const demo = device._demo || null;
    const prev = s[attribute];
    const now = Date.now();

    // Edge-triggered: an identical desired re-write dispatches nothing — leave the existing cycle
    // (and its timestamps) untouched so the confirm loop still sees the in-flight/settled state.
    if (prev && String(prev.desired) === String(value)) return;

    if (demo === 'stale-synced') {
        // The write is accepted but the device reports a STALE synced echo of the OLD value with an
        // old syncTs — modelling a silently-ignored command. Never a fresh echo of `value`.
        s[attribute] = {
            desired: value, desiredTs: now,
            reported: prev?.reported ?? 'stale', reportedTs: (prev?.reportedTs ?? now - 60000),
            sync: 'synced', syncTs: (prev?.syncTs ?? now - 60000),
            settleAt: Infinity, demo
        };
        return;
    }

    s[attribute] = {
        desired: value, desiredTs: now,
        reported: null, reportedTs: null,
        sync: 'pending', syncTs: null,
        settleAt: (demo === 'slow' || demo === 'duplicate') ? Infinity : now + 2500,
        demo
    };

    // 'already' pre-settles a fresh synced echo immediately so classifyPreDispatch reads
    // already-satisfied on a repeat write of the same value (see simReadDesired seeding below).
    if (demo === 'already') {
        s[attribute] = { ...s[attribute], reported: value, reportedTs: now, sync: 'synced', syncTs: now, settleAt: now };
    }
}

/**
 * Reads the desired (SHARED_SCOPE) attribute for the edge compare. In fixture mode the desired is
 * whatever was last written (undefined if never written).
 */
function simReadDesired(deviceId, attribute) {
    const s = simFor(deviceId)[attribute];
    if (!s) return { desired: undefined, desiredTs: null };
    return { desired: s.desired, desiredTs: s.desiredTs ?? null };
}

function simRead(deviceId, attribute) {
    const s = simFor(deviceId)[attribute];
    if (!s) return { sync: null, syncTs: null, reported: null, reportedTs: null };
    if (s.sync === 'pending' && Date.now() >= s.settleAt) {
        const now = Date.now();
        if (s.demo === 'fail') { s.sync = 'failed'; s.syncTs = now; }
        else if (s.demo === 'rejected') { s.sync = 'rejected'; s.syncTs = now; }
        else { s.sync = 'synced'; s.syncTs = now; s.reported = s.desired; s.reportedTs = now; }
    }
    return { sync: s.sync, syncTs: s.syncTs ?? null, reported: s.reported, reportedTs: s.reportedTs ?? null };
}

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
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Dispatches a shared-attribute write to the device. Throws on transport failure.
 */
export async function writeSharedAttribute(device, attribute, value) {
    if (!ATTRIBUTE_FAMILY[attribute]) throw new Error(`Attribute ${attribute} is not a permitted control attribute`);
    if (config.dataMode === 'fixture') {
        simWrite(device, attribute, value);
        return;
    }
    // D6 — WRITES_DISABLED primitive guard. Belt-and-braces to the killswitch caller-guards: even if
    // a caller reaches the LIVE write path with the deploy-time lock engaged, the write is refused
    // here (423 Locked) BEFORE any TB POST fires. Fixture writes are unaffected (the branch above).
    if (config.writesDisabled) throw Object.assign(new Error('Device writes are disabled at deploy time (WRITES_DISABLED)'), { status: 423 });
    const uuid = await tbDeviceUuid(device.deviceId);
    await writeSession.request('POST', `/api/plugins/telemetry/DEVICE/${uuid}/attributes/SHARED_SCOPE`, { [attribute]: value });
}

/**
 * Reads the write-back state for a control attribute from TELEMETRY (D3 #1 — the *Reported /
 * *SyncStatus keys are TELEMETRY, not attributes; the old /values/attributes read never saw them so
 * every live command timed out). Parses the TB timeseries shape `{ key: [{ ts, value }] }` and
 * returns the freshest sample plus its timestamp: { sync, syncTs, reported, reportedTs }.
 */
export async function readControlState(device, attribute) {
    const fam = ATTRIBUTE_FAMILY[attribute];
    if (config.dataMode === 'fixture') return simRead(device.deviceId, attribute);
    const uuid = await tbDeviceUuid(device.deviceId);
    const keys = `${fam.sync},${fam.reported}`;
    const ts = await readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries?keys=${encodeURIComponent(keys)}`);
    const latest = (key) => {
        const series = ts?.[key];
        return Array.isArray(series) && series.length ? series[0] : null;
    };
    const syncS = latest(fam.sync);
    const repS = latest(fam.reported);
    return {
        sync: syncS ? syncS.value : null,
        syncTs: syncS ? Number(syncS.ts) : null,
        reported: repS ? repS.value : null,
        reportedTs: repS ? Number(repS.ts) : null
    };
}

/**
 * Reads the current SHARED_SCOPE desired attribute for the pre-dispatch edge compare (D3 #2). The
 * bridge is edge-triggered, so we must know the value already sitting in the desired slot before
 * deciding whether a write would move anything. Returns { desired, desiredTs }.
 */
export async function readDesiredState(device, attribute) {
    if (config.dataMode === 'fixture') return simReadDesired(device.deviceId, attribute);
    const uuid = await tbDeviceUuid(device.deviceId);
    const attrs = await readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SHARED_SCOPE?keys=${encodeURIComponent(attribute)}`);
    const row = (attrs || []).find(a => a.key === attribute);
    return { desired: row ? row.value : undefined, desiredTs: row ? Number(row.lastUpdateTs) : null };
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
    simState.clear();
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
