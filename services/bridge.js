/**
 * Device inventory & live-state reads.
 *
 * live mode    → integration-bridge internal read API (/api/devices — SD-545,
 *                cluster-internal in iot-services). The response contract was captured
 *                live 2026-08-26 and is documented in docs/BRIDGE_CONTRACT.md (also
 *                CIR OOH_BRIDGE_CONTRACT.md). It is a FLAT array of device objects with
 *                NO site grouping — fetchLiveSites() reconstructs sites by grouping on
 *                accountId, and mapBridgeDevice() adapts each device. (Contract is still
 *                unconfirmed/unversioned; F025 ownership is a pending Spencer question.)
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
 * Derives the canonical `kind` from the bridge vendorId (see docs/BRIDGE_CONTRACT.md).
 * The bridge only emits Salus thermostats today (`salus-it500` / `salus-it700`), both of
 * which are heating controllers. Hot water is NOT a distinct device on the wire — it is a
 * `hotWater` telemetry field on the same combi device (see mapBridgeDevice / the mismatch
 * note below). Extend this map if the bridge starts emitting kitchen/lighting/fan vendors.
 */
function deriveKind(vendorId) {
    const v = String(vendorId || '').toLowerCase();
    if (v === 'salus-it500' || v === 'salus-it700') return 'heating';
    return 'unknown';
}

/**
 * Maps one bridge /api/devices entry to the canonical device shape.
 * Field names per the captured contract (docs/BRIDGE_CONTRACT.md, 2026-08-26).
 *
 * REGISTRY RECONCILIATION (services/registry.js): `deviceType` is set VERBATIM from
 * `vendorId` so it matches the registry keys `salus-it500` / `salus-it700` — that keeps
 * capabilitiesFor()/setpointWindow()/validateCommand() (setpoint + frost guardrails) and
 * the `deviceType !== 'boiler-panel'` heating-control gate all working on live data.
 *
 * KNOWN MISMATCH (flagged for James / F025): the registry models hot water as a SEPARATE
 * device type `salus-it500-dhw` (kind `hotwater`), and both the hot-water SCOPE_GROUP and
 * the `hwboost` guardrail key off `deviceType === 'salus-it500-dhw'`. The bridge never
 * emits that vendorId — a combi iT500 arrives as ONE `salus-it500` device carrying a
 * `hotWater` telemetry field. So hot-water CONTROL and the hot-water scope tile will NOT
 * activate from live bridge data under the current registry model. The `hotWater` reading
 * is still surfaced in telemetry; wiring up control needs a product decision (split the
 * combi into two logical devices, or re-key the DHW paths off telemetry.hotWater) plus the
 * F025 contract confirmation from Spencer. Not resolved here to avoid breaking heating
 * control or mis-firing a hot-water boost against an unverified deviceId.
 */
function mapBridgeDevice(raw) {
    return {
        deviceId: raw.deviceId,
        zone: raw.site,                       // per-device ZONE label ("Accomodation Gateway"), NOT the site name
        deviceType: raw.vendorId,             // registry key: salus-it500 / salus-it700
        deviceTypeLabel: raw.vendorDisplay,   // human display, e.g. "Salus iT700"
        kind: deriveKind(raw.vendorId),
        hotWaterCapable: raw.hotWater != null, // combi DHW signal (see mismatch note above)
        online: raw.isOnline ?? false,
        telemetry: {
            temperature: raw.temperatureC,        // per contract doc
            localTemperature: raw.temperatureC,   // alias: public/js/views.js & flows.js read telemetry.localTemperature for the readout
            heatingSetpoint: raw.setpointC,        // LOAD-BEARING: routes/api.js + registry read telemetry.heatingSetpoint (setpointC → heatingSetpoint)
            mode: raw.mode,
            heatingActive: raw.heatingActive,
            coolingActive: raw.coolingActive,
            hotWater: raw.hotWater
        },
        schedule: null                        // not sent by the bridge
    };
}

/**
 * Strips the alpha prefix from an accountId to yield the numeric house/site number.
 * `gk-6261` → `6261`. Returns null for non-house accounts (`shared`, `spencer-uat-01`, …)
 * — anything that is not exactly `<alpha-prefix>-<digits>`.
 */
function siteNoFromAccountId(accountId) {
    const m = String(accountId || '').match(/^[a-z]+-(\d+)$/i);
    return m ? m[1] : null;
}

async function fetchLiveSites() {
    if (liveCache.sites && Date.now() - liveCache.at < LIVE_CACHE_TTL) return liveCache.sites;
    const res = await axios.get(`${config.bridge.baseUrl}/api/devices`, { timeout: config.bridge.timeoutMs });
    // The contract is a FLAT device array (docs/BRIDGE_CONTRACT.md) — res.data IS the devices,
    // there is no res.data.sites. Reconstruct sites by grouping on accountId.
    const devices = Array.isArray(res.data) ? res.data : [];
    const groups = new Map();   // siteNo -> { accountId, devices[] }
    const skipped = [];         // non-house accounts, surfaced as a data-quality signal
    for (const raw of devices) {
        const siteNo = siteNoFromAccountId(raw.accountId);
        if (!siteNo) {
            if (raw.accountId != null) skipped.push(raw.accountId);
            continue;
        }
        if (!groups.has(siteNo)) groups.set(siteNo, { accountId: raw.accountId, devices: [] });
        groups.get(siteNo).devices.push(mapBridgeDevice(raw));
    }
    if (skipped.length) {
        console.warn(`[BRIDGE] Skipped ${skipped.length} non-house account(s) (no numeric site): ${[...new Set(skipped)].join(', ')}`);
    }
    const sites = [...groups.entries()].map(([siteNo, g]) => ({
        siteNo,
        // TODO: siteName is not in the /api/devices payload — proxied by accountId for now.
        //       A real site name needs a registry/Zendesk lookup (F025 follow-up).
        siteName: g.accountId,
        brand: undefined,           // not in payload — registry/Zendesk-sourced (guarded downstream)
        address: undefined,         // not in payload
        callsLast30Days: undefined, // not in payload
        devices: g.devices
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
    return sites.filter(s => String(s.siteNo ?? '').startsWith(q) || String(s.siteName ?? '').toLowerCase().includes(q)).slice(0, 12);
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
