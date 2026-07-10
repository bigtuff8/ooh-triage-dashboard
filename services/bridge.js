/**
 * Device inventory & live-state reads.
 *
 * live mode    → integration-bridge internal read API (/api/devices, /api/activity —
 *                SD-545, cluster-internal in iot-services) + ThingsBoard telemetry for
 *                zone temperatures. The exact bridge response contract is an open item
 *                with Spencer (HUB_INTEGRATION_AUDIT §5.3 / F025 ask); mapBridgeDevice()
 *                is the single adaptation point when it is confirmed.
 * fixture mode → data/fixtures/bridge-devices.json (mirrors the design prototype data).
 *
 * The canonical internal shape consumed by resolution/control/flows:
 *   site:   { siteNo, siteName, brand, address, callsLast30Days, devices[] }
 *   device: { deviceId, zone, deviceType, kind, online, telemetry{}, schedule?, _demo? }
 */

import { readFileSync } from 'fs';
import axios from 'axios';
import { config } from '../config.js';

let fixtureData = null;
let liveCache = { sites: null, at: 0 };
const LIVE_CACHE_TTL = 30 * 1000;
let lastReadOk = config.dataMode === 'fixture';
let lastReadError = null;

function loadFixture() {
    if (!fixtureData) {
        fixtureData = JSON.parse(readFileSync(new URL('../data/fixtures/bridge-devices.json', import.meta.url), 'utf8'));
    }
    return fixtureData;
}

/**
 * Maps one bridge /api/devices entry to the canonical device shape.
 * Field names are provisional until Spencer confirms the contract (F025).
 */
function mapBridgeDevice(raw) {
    return {
        deviceId: raw.deviceId || raw.name || raw.id,
        zone: raw.zone || raw.label || raw.name,
        deviceType: raw.deviceType || raw.type,
        kind: raw.kind || raw.category || 'unknown',
        online: raw.online ?? raw.active ?? false,
        telemetry: raw.telemetry || {},
        schedule: raw.schedule || null
    };
}

async function fetchLiveSites() {
    if (liveCache.sites && Date.now() - liveCache.at < LIVE_CACHE_TTL) return liveCache.sites;
    const res = await axios.get(`${config.bridge.baseUrl}/api/devices`, { timeout: config.bridge.timeoutMs });
    // Provisional: expect a per-site grouping keyed by siteNo; adapt here once confirmed
    const rawSites = res.data.sites || res.data;
    const sites = rawSites.map(s => ({
        siteNo: String(s.siteNo ?? s.houseId ?? s.siteNumber),
        siteName: s.siteName || s.name,
        brand: s.brand || '',
        address: s.address || '',
        callsLast30Days: s.callsLast30Days ?? null,
        devices: (s.devices || []).map(mapBridgeDevice)
    }));
    liveCache = { sites, at: Date.now() };
    return sites;
}

/**
 * Returns all sites with their device inventory. Throws on live-read failure —
 * callers treat that as degraded mode (fail safe to capture-and-escalate, TQ-8).
 */
export async function getSites() {
    try {
        const sites = config.dataMode === 'live' ? await fetchLiveSites() : loadFixture().sites;
        lastReadOk = true;
        lastReadError = null;
        return sites;
    } catch (err) {
        lastReadOk = false;
        lastReadError = err.message;
        console.error(`[BRIDGE] Inventory read failed: ${err.message}`);
        throw err;
    }
}

/**
 * All sites matching a house number exactly (used by resolution — may be 0, 1 or >1).
 */
export async function getSitesByNumber(siteNo) {
    const sites = await getSites();
    return sites.filter(s => s.siteNo === String(siteNo));
}

/**
 * Case-insensitive search across house number prefix and site name.
 */
export async function searchSites(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const sites = await getSites();
    return sites.filter(s => s.siteNo.startsWith(q) || s.siteName.toLowerCase().includes(q)).slice(0, 12);
}

/**
 * Finds one device within a resolved site.
 */
export async function getDevice(siteNo, deviceId) {
    const matches = await getSitesByNumber(siteNo);
    if (matches.length !== 1) return null;
    return matches[0].devices.find(d => d.deviceId === deviceId) || null;
}

/**
 * Health signal for /healthz and degraded-mode detection.
 */
export function bridgeStatus() {
    return {
        mode: config.dataMode,
        healthy: lastReadOk,
        lastError: lastReadError
    };
}
