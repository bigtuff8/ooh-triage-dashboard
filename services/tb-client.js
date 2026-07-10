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
    let healthy = false;
    async function getToken() {
        if (token && Date.now() < expiry) return token;
        const res = await axios.post(`${config.thingsboard.url}/api/auth/login`, { username, password }, { timeout: 10000 });
        token = res.data.token;
        expiry = Date.now() + 2 * 60 * 60 * 1000;
        healthy = true;
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
            healthy = true;
            return res.data;
        } catch (err) {
            if (err.response?.status === 401) { token = null; }
            healthy = false;
            throw err;
        }
    }
    return { request, isHealthy: () => healthy, isConfigured: () => !!(username && password) };
}

const readSession = tbSession(config.thingsboard.readUsername, config.thingsboard.readPassword, 'read');
const writeSession = tbSession(config.thingsboard.writeUsername, config.thingsboard.writePassword, 'write/SR-3');

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
 */
export function tbStatus() {
    if (config.dataMode === 'fixture') return { mode: 'fixture', read: true, write: true };
    return {
        mode: 'live',
        read: readSession.isConfigured() && readSession.isHealthy(),
        write: writeSession.isConfigured() && writeSession.isHealthy(),
        writeConfigured: writeSession.isConfigured()
    };
}
