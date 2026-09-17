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

// deviceId → { attribute → { desired, reported, sync, settleAt, demo } }
const simState = new Map();

function simFor(deviceId) {
    if (!simState.has(deviceId)) simState.set(deviceId, {});
    return simState.get(deviceId);
}

function simWrite(device, attribute, value) {
    const s = simFor(device.deviceId);
    const demo = device._demo || null;
    s[attribute] = {
        desired: value,
        reported: null,
        sync: 'pending',
        // normal: settles synced after ~2.5s; fail: settles failed; slow: never settles (IT700 timeout path)
        settleAt: demo === 'slow' ? Infinity : Date.now() + 2500,
        demo
    };
}

function simRead(deviceId, attribute) {
    const s = simFor(deviceId)[attribute];
    if (!s) return { sync: null, reported: null };
    if (s.sync === 'pending' && Date.now() >= s.settleAt) {
        if (s.demo === 'fail') {
            s.sync = 'failed';
        } else {
            s.sync = 'synced';
            s.reported = s.desired;
        }
    }
    return { sync: s.sync, reported: s.reported };
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
    const uuid = await tbDeviceUuid(device.deviceId);
    await writeSession.request('POST', `/api/plugins/telemetry/DEVICE/${uuid}/attributes/SHARED_SCOPE`, { [attribute]: value });
}

/**
 * Reads the write-back state for a control attribute:
 * { sync: 'pending'|'synced'|'failed'|'rejected'|null, reported }
 */
export async function readControlState(device, attribute) {
    const fam = ATTRIBUTE_FAMILY[attribute];
    if (config.dataMode === 'fixture') return simRead(device.deviceId, attribute);
    const uuid = await tbDeviceUuid(device.deviceId);
    const keys = `${fam.sync},${fam.reported}`;
    const attrs = await readSession.request('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes?keys=${encodeURIComponent(keys)}`);
    const map = Object.fromEntries((attrs || []).map(a => [a.key, a.value]));
    return { sync: map[fam.sync] ?? null, reported: map[fam.reported] ?? null };
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
