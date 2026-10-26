/**
 * TB-direct device inventory & live-state reads (design §2, read plane).
 *
 * REPLACES services/bridge.js's integration-bridge `/api/devices` read with a direct
 * ThingsBoard query, preserving the EXACT public interface and canonical site/device shapes
 * so every consumer (control.js, routes/api.js, resolution.js, liveness.js, overrides.js,
 * server.js, public/js/*) is untouched by the swap (C8). services/bridge.js is now a one-line
 * re-export shim onto this module.
 *
 * live mode    → ThingsBoard REST via the read-scoped session (tb-client.readRequest):
 *                per-site device inventory by `textSearch` (over-fetch → paginate → anchored
 *                client-side filter → alias map, defeating substring-bleed AND split-loss, D1),
 *                plus a bulk latest-telemetry read. NEVER a full-estate pull at runtime.
 * fixture mode → data/fixtures/bridge-devices.json (unchanged — fixture parity with bridge.js).
 *
 * Canonical internal shape (VERBATIM from bridge.js:13-16; additive fields isDuplicate/hasReported):
 *   site:   { siteNo, siteName, nameUnverified?, accountId?, brand, address, callsLast30Days, devices[] }
 *   device: { deviceId, zone, deviceType, deviceTypeLabel, kind, hotWaterCapable, online,
 *             telemetry{}, schedule?, isDuplicate?, hasReported?, _demo? }
 *
 * CORRECTIVE FIX (C8): deviceId = the TB device NAME (raw.name), not the old bridge vendor id.
 * The control path resolves the TB UUID by name (tb-client tbDeviceUuid → ?deviceName=), so the
 * old vendor-id deviceId made live control latently broken (masked by the write-lock). Setting
 * deviceId=name at this single mapping boundary is necessary and sufficient — every other
 * consumer treats deviceId as opaque.
 */

import { readFileSync } from 'fs';
import { config } from '../config.js';
import { resolveSiteName } from './zendesk.js';
import * as registry from './registry.js';
import { describeNextChange, zoneTimetable } from './schedule.js';

/**
 * Lazily resolves tb-client.readRequest ONLY on the live read path. A static import would force
 * every test that mock.module()'s tb-client.js to re-export readRequest even in fixture mode (where
 * it is never called) — a brittle cross-test coupling. This defers the binding to first live use.
 */
async function readRequest(method, path, data) {
    const mod = await import('./tb-client.js');
    return mod.readRequest(method, path, data);
}

/**
 * Lazily resolves tb-client.readServerScopeAttributes (same defer rationale as readRequest — a static
 * import forces every fixture-mode test that mock.module()'s tb-client.js to re-export it). Only ever
 * reached on the live inventory read.
 */
async function readServerScopeAttributes(uuid, keys) {
    const mod = await import('./tb-client.js');
    return mod.readServerScopeAttributes(uuid, keys);
}

/**
 * Lazily resolves tb-client.readClientScopeAttributes (same defer rationale as readServerScopeAttributes
 * — a static import forces every fixture-mode test that mock.module()'s tb-client.js to re-export it).
 * Only ever reached on the live inventory read (OOHDASH-82 design §4).
 */
async function readClientScopeAttributes(uuid, keys) {
    const mod = await import('./tb-client.js');
    return mod.readClientScopeAttributes(uuid, keys);
}

/**
 * Lazily resolves tb-client.readSharedScopeAttributes (OOHDASH-114-F1).
 * Used to read V1 boilerControl output1OutputMask from SHARED_SCOPE.
 */
async function readSharedScopeAttributes(uuid, keys) {
    const mod = await import('./tb-client.js');
    return mod.readSharedScopeAttributes(uuid, keys);
}

/**
 * Lazily resolves zendesk.siteDirectory ONLY on the live search/directory path (same rationale as
 * readRequest above — it is a NEW export, so a static import would break every fixture-mode test
 * that mock.module()'s zendesk.js without re-declaring it). Never called in fixture mode.
 */
async function siteDirectory() {
    const mod = await import('./zendesk.js');
    return mod.siteDirectory();
}

let fixtureData = null;
const LIVE_CACHE_TTL = 30 * 1000;
const perSiteCache = new Map();     // siteNo -> { sites, at }
let lastReadOk = config.dataMode === 'fixture';
let lastReadError = null;

/* ------------------------------------------------------------------ */
/* OOHDASH-85 (design §4): freshness threshold — how recently a device */
/* must have reported to count as ONLINE.                              */
/* ------------------------------------------------------------------ */

// Global default: 48h (monitor-only / unknown classes report infrequently).
const FRESHNESS_DEFAULT_MS = 48 * 60 * 60 * 1000;

// Explicit per-deviceType override hook (ms). Still empty — the per-class offlineHours contract below
// is the primary source; this stays as a last-resort hard override if a single type ever needs one.
const FRESHNESS_BY_TYPE = { /* deviceType: ms */ };

// Resolver (OOHDASH-123 WU8, design §4/§5): a type's offline threshold comes from the per-class
// contract (controllable classes 3h, monitor-only/unknown 48h), env-tunable per class. An explicit
// FRESHNESS_BY_TYPE override, if ever set, wins. This replaces the hard global 48h for every type.
function freshnessThresholdFor(deviceType) {
    if (FRESHNESS_BY_TYPE[deviceType] != null) return FRESHNESS_BY_TYPE[deviceType];
    const hours = registry.capabilitiesContractFor(deviceType)?.offlineHours;
    return (hours != null ? hours : 48) * 60 * 60 * 1000;
}

// Schedule attribute keys we decode a next-change from (V1 output1..4Schedule, V2 CHZ1/DHW, PowerPause).
const SCHEDULE_KEYS = ['schedules', 'CHZ1.schedule', 'DHW.schedule', 'output1Schedule', 'output2Schedule', 'output3Schedule', 'output4Schedule'];

/**
 * OOHDASH-123 (WU13): decode the next scheduled change for a boiler panel / PowerPause device from its
 * SHARED_SCOPE schedule JSON. Returns a labelled operator string ("based on the device's stored
 * schedule, next change to ...") or null (safe fallback → the UI shows "following its programme"). Only
 * active when decoded display is on (config, James override). Never throws (describeNextChange is safe).
 */
function decodeDeviceSchedule(deviceType, sharedScope, now = Date.now()) {
    if (!config.control.schedule.decoded) return null;
    if (!sharedScope || typeof sharedScope !== 'object') return null;
    for (const key of SCHEDULE_KEYS) {
        if (sharedScope[key] != null) {
            const txt = describeNextChange(sharedScope[key], new Date(now), config.control.schedule);
            if (txt) return txt;
        }
    }
    return null;
}

// OOHDASH-85 (design §5): server-side anti-flicker debounce state. Map<deviceUuid, { staleSince }>.
// A device is only ASSERTED offline once it has read stale across two consecutive polls; the first
// stale read still reports the prior (online) value. Because freshness only ever moves forward, a
// device that reports again drops back under threshold and its entry clears naturally. State MUST
// live here (server-side), never the browser, because the 30s workspace refresh re-fetches
// /workspace and would lose any client-side memory on every poll (design §5).
const freshnessDebounce = new Map();    // deviceUuid -> { staleSince: epochMs }

const TB_PAGE_SIZE = 200;
const TB_PAGE_CAP = 50;             // safety valve — a single site never spans 50 pages (>200 devices max sampled = 138)

function loadFixture() {
    if (!fixtureData) {
        fixtureData = JSON.parse(readFileSync(new URL('../data/fixtures/bridge-devices.json', import.meta.url), 'utf8'));
    }
    return fixtureData;
}

let aliasData = null;
function loadAliases() {
    // The alias overlay is OPTIONAL (most sites need no entry) — a missing/unreadable file must
    // degrade to no-overlay, never abort the whole site query (OOHDASH-79). Memoise the resolved
    // map (incl. the {} fallback) so a missing file doesn't retry-spam on every query.
    if (!aliasData) {
        try {
            const json = JSON.parse(readFileSync(new URL('../data/site-aliases.json', import.meta.url), 'utf8'));
            aliasData = json.aliases || {};
        } catch (err) {
            console.warn(`[TB] Site-alias overlay unavailable — proceeding with no overlay: ${err.message}`);
            aliasData = {};
        }
    }
    return aliasData;
}

/* ------------------------------------------------------------------ */
/* Name normalisation + site-query filter (D1)                         */
/* ------------------------------------------------------------------ */

/**
 * Normalises a TB device name for the anchored site filter and classification: lower-cases,
 * strips parenthetical cross-refs (`gk-6360-maindb-r10a (5135)` → the (5135) is ANOTHER site's
 * number — a mis-site guard, C4), collapses whitespace, maps `_`→`-`. Returns '' for nullish.
 */
export function normaliseName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')   // drop parenthetical cross-refs BEFORE token matching
        .replace(/_/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Resolves the brand prefix + site tokens for a site query. Brand defaults to `gk`; the alias
 * overlay (data/site-aliases.json) supplies any EXTRA text tokens a split site's devices carry
 * besides the bare siteNo (md-1110 ↔ 1110meridian). The bare siteNo is always the first token.
 */
export function siteQueryTokens(siteNo, brand = 'gk') {
    const key = String(siteNo);
    const extra = loadAliases()[key] || [];
    const tokens = [key, ...extra];
    // De-dupe while preserving order.
    return { brand, tokens: [...new Set(tokens.map(t => String(t).toLowerCase()))] };
}

/**
 * The load-bearing anchored filter (D1). `^{brand}-({tokens})(?![0-9])`, case-insensitive over the
 * NORMALISED name. `(?![0-9])` is the boundary that separates a numeric-neighbour bleed (gk-62091,
 * gk-626 → 6261/6263/… — DROP) from the same site's glued asset (gk-6209fryer-1 — KEEP) or an alt
 * token (md-1110meridian — KEEP via alias). A letter/dash/end after the token = same site; a digit
 * = a different numeric site.
 */
export function siteNameFilter(brand, tokens) {
    const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const alt = tokens.map(esc).join('|');
    return new RegExp(`^${esc(brand)}-(${alt})(?![0-9])`, 'i');
}

/**
 * OOHDASH-128: Extracts the site number from an older-convention bare-salus device's raw name, or
 * null. Guards against glued tokens (salusit500/salusit700) by requiring `_salus_` (not `_salusit`).
 * Finds the LAST parenthetical group (same trailing-group rule as deriveArea :580), then extracts
 * the leading digit run before the first hyphen. Always returns a string, never a number, so
 * string-equality cross-site checks are exact. Returns null for: no _salus_ in name, no bracket,
 * empty bracket, no digit-hyphen sequence, non-digit leading char.
 */
export function legacySalusSiteNo(rawName) {
    const s = String(rawName == null ? '' : rawName);
    if (!/[_]salus[_]/i.test(s)) return null;
    const m = s.match(/\(([^)]*)\)\s*$/);
    if (!m) return null;
    const inner = m[1];
    const dm = inner.match(/^\s*(\d+)\s*-/);
    if (!dm) return null;
    return dm[1];
}

/**
 * OOHDASH-128: True when a device's raw name belongs to siteNo under the older Salus naming
 * convention. Uses strict string equality: "520" never matches "5204". siteNo may be a number
 * (String(5204) === "5204").
 */
export function isLegacySalusForSite(rawName, siteNo) {
    const parsed = legacySalusSiteNo(rawName);
    return parsed !== null && parsed === String(siteNo);
}

/* ------------------------------------------------------------------ */
/* Site connectivity anchor + equipment-group label (OOHDASH-91 G2)     */
/* ------------------------------------------------------------------ */
// Pure, read-only selection rule consumed by the connectivity flow. This is the CANONICAL, unit-tested
// expression of the rule; public/js/flows.js carries a textually-identical browser copy only because
// public/js is served as plain global scripts and cannot import this ESM module. Neither touches
// liveness (deriveFreshnessOnline / the `online:` assignment) — G2 CONSUMES the corrected `d.online`.

const ANCHOR_SEGMENT = 'lwgateway';                          // the LoRaWAN site hub token — segment-equality only
const GATEWAY_GROUP_TOKENS = ['r10a', 'gw', 'gateway'];      // a non-anchor gateway fronts a group via one of these
const GROUP_LABELS = { boiler: 'boiler', maindb: 'main distribution board', kitchen: 'kitchen', salusit700: 'heating' };

// Split a device's normalised NAME into segments (client devices carry the name on `deviceId`).
function deviceNameSegments(d) {
    return normaliseName(d && (d.name != null ? d.name : d.deviceId)).split(/[-\s]+/).filter(Boolean);
}

/**
 * siteConnectivityAnchor(devices) -> device | null. Pure, read-only. The site connectivity anchor is the
 * LoRaWAN hub: the device whose normalised name has a segment EXACTLY equal to `lwgateway` (segment-
 * equality, NOT substring, so no -r10a/Salus gateway can pose as it). 0 candidates → null (gateway-less
 * site). Exactly 1 → it. >1 (pathological, not in the swept estate) → the first by sorted normalised name
 * (deterministic tie-break). Reads only the device name; derives no liveness; mutates nothing.
 */
export function siteConnectivityAnchor(devices) {
    const candidates = (devices || []).filter(d => deviceNameSegments(d).includes(ANCHOR_SEGMENT));
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const nm = d => normaliseName(d && (d.name != null ? d.name : d.deviceId));
    return [...candidates].sort((a, b) => { const na = nm(a), nb = nm(b); return na < nb ? -1 : na > nb ? 1 : 0; })[0];
}

/**
 * equipmentGroupLabel(device) -> string | null. Pure, read-only. Resolves a non-anchor gateway's
 * equipment group to its natural-English operator label on the SAME split-segment basis as the anchor
 * rule: find the gateway token (r10a/gw/gateway) segment, take the segment IMMEDIATELY preceding it, map
 * via GROUP_LABELS. Unknown token → the safe generic 'the equipment group' (NEVER the raw namespace
 * token). Returns null when no gateway token segment exists (fronts no group — e.g. a spare lwgateway),
 * so such a device is excluded from the group-offline enumeration.
 */
export function equipmentGroupLabel(device) {
    const segs = deviceNameSegments(device);
    const i = segs.findIndex(s => GATEWAY_GROUP_TOKENS.includes(s));
    if (i <= 0) return null;
    return GROUP_LABELS[segs[i - 1]] || 'the equipment group';
}

/* ------------------------------------------------------------------ */
/* Device classification (D2) — capability-first, typo-tolerant        */
/* ------------------------------------------------------------------ */

// Known in-name typos → canonical asset token (C4). Applied before fuzzy matching.
const TYPO_MAP = {
    extracfan: 'extractfan',
    bainmare: 'bainmarie',
    bainmarie: 'bainmarie'
};

// Asset token → { kind, deviceType (a registry.js key) }. deviceType MUST be a registry key so
// capabilitiesFor/setpointWindow/validateCommand join cleanly (the hard registry join, §2.4).
// OOHDASH-82 (design §5): the gateway row is tested BEFORE the Salus rows so a paired gateway whose
// name carries a salus token (e.g. `gk-6218-salusit700-gateway-1`) matches the gateway row FIRST and
// is typed gateway everywhere, not just hidden from the chip list. Regression-safe because the
// name-token path is only reached for no-telemetry devices (genuine thermostats classify capability-
// first from their setpoint signal), and no genuine Salus name carries the longer gateway tokens; the
// short `gw` token is exact-only (matchAssetIntent :exactOnly), so it cannot bleed.
// OOHDASH-82 (design §6): Intesis is re-kinded to `aircon` (deviceType stays `intesis`) so it leaves
// the heating candidate set; it is additionally forced non-controllable in classifyDevice.
const ASSET_INTENT = [
    { tokens: ['gateway', 'r10a', 'dragino', 'gw'], kind: 'gateway', deviceType: 'gateway', label: 'Lighthouse gateway' },
    { tokens: ['salusit700', 'it700', 'salus700'], kind: 'heating', deviceType: 'salus-it700', label: 'Salus iT700' },
    { tokens: ['salusit500', 'it500', 'salus500'], kind: 'heating', deviceType: 'salus-it500', label: 'Salus iT500' },
    // OOHDASH-108: repurposed from the dead generic-salus row (was deviceType 'salus-it700', shadowed
    // by the glued-iT700 contained-by bleed). It now assigns the explicit old-convention `salus` type so
    // deriveArea resolves its area by the site-code letter instead of defaulting to Accommodation. Stays
    // positioned AFTER the glued iT700/iT500 rows so a glued name still matches its specific row first;
    // this catches a BARE `salus` token only once the contained-by bleed is closed in matchAssetIntent.
    { tokens: ['salus'], kind: 'heating', deviceType: 'salus', label: 'Salus thermostat (area by site code)' },
    { tokens: ['intesis', 'ac', 'aircon'], kind: 'aircon', deviceType: 'intesis', label: 'Intesis AC' },
    { tokens: ['fryer', 'grill', 'bainmarie', 'potwash', 'kitchen', 'oven', 'dishwash'], kind: 'kitchen', deviceType: 'tuya', label: 'Kitchen circuit' },
    { tokens: ['powerpause', 'tongou', 'owon', 'contactor', 'switch', 'relay'], kind: 'kitchen', deviceType: 'tuya', label: 'Power circuit' },
    { tokens: ['light', 'lighting', 'lgt'], kind: 'lighting', deviceType: 'tuya', label: 'Lighting circuit' },
    { tokens: ['extractfan', 'fan', 'extractor'], kind: 'fan', deviceType: 'tuya', label: 'Extractor fan' }
];

/* ------------------------------------------------------------------ */
/* Refrigeration switch-deny (Stream A / OOHDASH-19) — design §3        */
/* ------------------------------------------------------------------ */

// Refrigeration APPLIANCE nouns — ALWAYS monitor-only, with NO override consulted. Each is matched
// with `norm.includes(...)` over the REAL normaliser (lower-case, strip parens, `_`→`-`, collapse
// whitespace). Because normaliseName maps `_`→`-` but NOT `-`→space, both "cold-room" and "cold_room"
// normalise to `cold-room`; all three literal shapes of "cold room" are listed so EVERY written form
// is caught (`cold_room` is covered by `cold-room` after normalisation). Every token is ≥5 chars or an
// unambiguous hyphenated/spaced pair, so substring matching is bleed-safe.
export const REFRIG_APPLIANCE = ['fridge', 'freezer', 'chiller', 'coldroom', 'cold-room', 'cold room', 'refrigeration', 'refrig'];

// LOCATION class — monitor-only UNLESS an explicit controllable-appliance token is also present
// (a cellar LIGHT or FAN is a real switchable circuit that merely sits in the cellar).
export const REFRIG_LOCATION = ['cellar'];

// Device PROFILE deny signal — additive, deny-only, overridable like the location class.
// FIXME(CR3): held EMPTY until the read-only ThingsBoard probe (CR3, the first build input) confirms
// the live cellar/refrigeration profile string(s); populate from data/cr3-cellar-profile.json. An
// empty list is fail-closed (the profile signal is inert; the name-token deny + registry backstop
// still protect every recognised device). An empty/incomplete list ONCE CR3 has landed is a defect,
// not a valid state — test/refrigeration-deny.test.js FAILS if the CR3 artefact exists but this list
// is still empty/incomplete.
export const REFRIG_PROFILES = [];

// Controllable-appliance OVERRIDE tokens — an explicit one of these in the name WINS over the
// location word `cellar` and the profile (but NEVER over an appliance noun). Matched as a SUBSTRING
// of the normalised name INCLUDING the short tokens (`fan`, `lgt`) so GLUED forms (`cellarfan-1`,
// `cellarlgt-1`, `cellarlight-1`) are recognised as controllable. Safe: the override is only ever
// consulted for a location/profile device carrying NO appliance noun, and no cooling/location word
// contains any override token as a substring. Bare generic power words (`switch`, `relay`,
// `contactor`, `powerpause`) are DELIBERATELY excluded — a cellar device carrying only such a word is
// ambiguous (could be the cooling relay), so fail-closed keeps it monitor-only (design §3.2).
export const CTRL_OVERRIDE = ['light', 'lighting', 'lgt', 'fan', 'extractfan', 'extractor', 'socket', 'fryer', 'grill', 'bainmarie', 'potwash', 'oven', 'dishwash'];

/**
 * isRefrigerationDeny(norm, profile) — true when the device is refrigeration and must be forced
 * monitor-only EVEN IF it carries a switch signal (design §3.3). `norm` is the already-normalised
 * name; `profile` is the raw TB profile/type string. Fail-closed.
 */
export function isRefrigerationDeny(norm, profile) {
    const n = String(norm || '');
    const p = String(profile || '').toLowerCase();
    const hasAppliance = REFRIG_APPLIANCE.some(t => n.includes(t));
    const hasLocation = REFRIG_LOCATION.some(t => n.includes(t));
    const hasProfile = REFRIG_PROFILES.some(t => p.includes(t));
    if (!hasAppliance && !hasLocation && !hasProfile) return false;   // not refrigeration
    // ASSUMPTION (verify at CR3, §9): no controllable circuit in the estate carries a refrigeration
    // appliance noun in its name. An appliance noun therefore returns the deny with NO override
    // consulted — e.g. "fridge-light-circuit" is monitor-only despite the `light` token. Fail-closed.
    if (hasAppliance) return true;
    // Location- or profile-only → yield to an explicit controllable-appliance token. Substring-match
    // EVERY override token (incl. short `fan`/`lgt`) so glued forms are recognised as controllable.
    const override = CTRL_OVERRIDE.some(t => n.includes(t));
    return !override;
}

/** Bounded Levenshtein distance (early-exit at > max) — for near-miss asset tokens only. */
function levWithin(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = dp[0];
        dp[0] = i;
        let rowMin = dp[0];
        for (let j = 1; j <= b.length; j++) {
            const tmp = dp[j];
            dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = tmp;
            if (dp[j] < rowMin) rowMin = dp[j];
        }
        if (rowMin > max) return max + 1;   // no cell in this row can lead to <= max
    }
    return dp[b.length];
}

/** True when any control-signalling switch key is present in telemetry (never the profile label, C7). */
function hasSwitchSignal(t) {
    if (!t) return false;
    // OOHDASH-123 (WU7): switchReported retired; the bare `switch` key now counts as a switch signal.
    return ['switchOn', 'switch_1', 'switch'].some(k => t[k] !== undefined && t[k] !== null);
}
function hasSetpointSignal(t) {
    return !!t && (t.heatingSetpoint !== undefined && t.heatingSetpoint !== null);
}

/**
 * classifyDevice(name, profile, telemetry) — capability-first, typo-tolerant (D2).
 * Returns { kind, deviceType, deviceTypeLabel, controllable, control } where control describes the
 * dispatch attribute. CONTROLLABILITY IS DERIVED FROM TELEMETRY/ATTRIBUTE SIGNALS, NEVER THE PROFILE
 * LABEL (C7 — controllable Salus sit on the `default` profile; kitchen gear on `gatewayDevice`).
 * `deviceType` is always a registry.js key so the downstream capability join holds.
 */
export function classifyDevice(name, profile, telemetry) {
    const norm = normaliseName(name);
    const tokens = norm.split(/[-\s]+/).filter(Boolean);

    // 0) Refrigeration switch-deny (Stream A / OOHDASH-19) — the FIRST branch, highest precedence.
    // A refrigeration asset (fridge/freezer/chiller/cold room/refrigeration, a cellar unit with no
    // controllable-override token, or — once CR3 lands — a confirmed cellar profile) is ALWAYS
    // monitor-only, EVEN when it carries a switch signal. Returning early gives this deny precedence
    // over BOTH the capability-first switch intent AND matchAssetIntent: the switch telemetry never
    // reaches hasSwitchSignal and no fuzzy name pass can pull a fridge into `kitchen`.
    if (isRefrigerationDeny(norm, profile)) {
        return { kind: 'fridge', deviceType: 'refrigeration', deviceTypeLabel: 'Refrigeration (monitor-only)', controllable: false, control: null };
    }

    // OOHDASH-139: boilerControl profile → pub boiler panel (read-only heating device).
    // Profile is authoritative; no ASSET_INTENT row added (avoids bare-name bleed — OOHDASH-108).
    if (profile === 'boilerControl') {
        return { kind: 'heating', deviceType: 'boiler-panel', deviceTypeLabel: 'Pub boiler panel', controllable: false, control: null };
    }

    // 1) Capability from telemetry signals first (control-eligibility, never profile).
    let intent = null;
    if (hasSwitchSignal(telemetry)) {
        intent = { kind: 'kitchen', deviceType: 'tuya', label: 'Tuya switch', control: { attribute: 'switchRequested', type: 'boolean' } };
    } else if (hasSetpointSignal(telemetry)) {
        // Setpoint present → a thermostat/AC. Refine the deviceType by the name asset token below;
        // default to salus-it700 (the dominant heating controller).
        intent = { kind: 'heating', deviceType: 'salus-it700', label: 'Salus thermostat', control: { attribute: 'setpointRequested', type: 'number' } };
    }

    // 2) Asset-token intent from the (typo-corrected) name — refines/sets deviceType + kind.
    const nameIntent = matchAssetIntent(tokens);
    if (nameIntent) {
        if (intent) {
            // Telemetry says controllable; let the name refine the specific deviceType/label when
            // it agrees on a control family (heating→salus/intesis; switch→tuya).
            if (intent.deviceType === 'tuya' && nameIntent.deviceType === 'tuya') {
                intent = { ...intent, kind: nameIntent.kind, label: nameIntent.label };
            } else if (intent.control?.attribute === 'setpointRequested' && ['salus-it700', 'salus-it500', 'salus', 'intesis'].includes(nameIntent.deviceType)) {
                // OOHDASH-108: a setpoint-bearing bare-salus thermostat is refined from the iT700
                // default to the new `salus` type by its name, so its area letter-resolves.
                intent = { ...intent, deviceType: nameIntent.deviceType, kind: nameIntent.kind, label: nameIntent.label };
                if (nameIntent.deviceType === 'intesis') intent.label = 'Intesis AC';
            }
        } else {
            // No telemetry control signal — monitor-only, but still typed/kinded from the name.
            intent = { kind: nameIntent.kind, deviceType: nameIntent.deviceType, label: nameIntent.label, control: null };
        }
    }

    if (!intent) {
        return { kind: 'unknown', deviceType: 'gateway', deviceTypeLabel: 'Unknown device', controllable: false, control: null };
    }

    // Setpoint controllability requires heatingSetpoint present (registry.js:80-81 refuses without it).
    let controllable = false;
    let control = intent.control || null;
    if (control?.attribute === 'switchRequested') controllable = true;
    else if (control?.attribute === 'setpointRequested') controllable = hasSetpointSignal(telemetry);
    if (!controllable) control = null;

    // OOHDASH-82 (design §6, A2): Intesis aircon is NEVER controllable from the dashboard — force it
    // non-controllable with no control descriptor even when a setpoint signal is present. Aircon
    // requests are captured and referred to the IoT team (flows.js aircon flow), never actuated.
    if (intent.deviceType === 'intesis') {
        controllable = false;
        control = null;
    }

    return {
        kind: intent.kind,
        deviceType: intent.deviceType,
        deviceTypeLabel: intent.label,
        controllable,
        control
    };
}

// OOHDASH-108: the long glued Salus asset tokens must match FORWARD-ONLY (or by exact equality).
// The contained-by direction (asset token CONTAINS the name token) is the bleed that pulled a bare
// `salus` name token into the glued iT700/iT500 rows (`salusit700`.includes(`salus`)), typing the
// device iT700 and force-mapping it to Accommodation. Excluding these tokens from the contained-by
// direction lets a bare `salus` fall through to the repurposed generic row (deviceType 'salus').
// Safe: a GLUED name token (`salusit700`) still matches by exact equality, and a longer name that
// CONTAINS the asset token still matches by the forward `t.includes(at)` direction — no glued match
// is lost. Only these specific long tokens are restricted; every other row keeps the contained-by
// direction intact (so e.g. `extractfan`→`fan` forward and short-form matches are unaffected).
// NOTE: this covers EVERY long iT700/iT500 token that CONTAINS `salus` as a prefix — both the glued
// `salusit700`/`salusit500` AND the alias forms `salus700`/`salus500` — otherwise `salus700`.includes
// (`salus`) re-opens the identical bleed via the alias token.
const FORWARD_ONLY_TOKENS = new Set(['salusit700', 'salusit500', 'salus700', 'salus500']);

/** Matches name tokens to an ASSET_INTENT row — exact substring, typo-map, then bounded fuzzy. */
function matchAssetIntent(tokens) {
    const corrected = tokens.map(t => TYPO_MAP[t] || t);
    // Exact / substring pass. Tiny asset tokens (≤3 chars: ac/gw/fan/lgt) only ever match on EXACT
    // token equality — substring-matching them bleeds (`extractfan` contains `ac`, `gw` etc.).
    for (const row of ASSET_INTENT) {
        for (const at of row.tokens) {
            const exactOnly = at.length <= 3;
            // OOHDASH-108: the long glued Salus tokens match forward/exact-only (no contained-by) —
            // see FORWARD_ONLY_TOKENS above. This closes the bare-`salus` bleed.
            const forwardOnly = FORWARD_ONLY_TOKENS.has(at);
            // OOHDASH-82: the `at.includes(t)` direction (asset token CONTAINS the name token) is
            // guarded to name tokens of ≥3 chars. Without this, a 1-2 char device-instance suffix
            // (e.g. the `1` in `gk-6261-cellar-fan-1`) spuriously matches an asset token that merely
            // contains that digit (`r10a`.includes(`1`)). This surfaced once the gateway row — which
            // carries `r10a` — was reordered to the front (design §5); it is a latent bleed the fix
            // closes without weakening the glued-form `t.includes(at)` direction.
            if (corrected.some(t => t === at || (!exactOnly && (t.includes(at) || (!forwardOnly && t.length >= 3 && at.includes(t)))))) return row;
        }
    }
    // Bounded fuzzy pass (Levenshtein ≤2), never across a control boundary (each row is one family).
    for (const row of ASSET_INTENT) {
        for (const at of row.tokens) {
            if (at.length < 4) continue;   // don't fuzzy-match tiny tokens (ac/gw/fan)
            if (corrected.some(t => t.length >= 4 && levWithin(t, at, 2) <= 2)) return row;
        }
    }
    return null;
}

/* ------------------------------------------------------------------ */
/* Device → area derivation (OOHDASH-82, design §3)                      */
/* ------------------------------------------------------------------ */

/**
 * parseSiteCodeLetter(siteCode) — extracts the single iT500 class letter from the CLIENT_SCOPE `site`
 * value (design §3). Observed shapes are like `(1771-f-1)` and `5670-s-1`: a site number, a hyphen,
 * the class letter, a hyphen, an instance number, optionally wrapped in parentheses. Lower-cases the
 * value and matches the anchored pattern `^\(?\s*\d+\s*-\s*([sfrb])\s*-` (first capture is the letter).
 * Returns one of `s`/`f`/`r`/`b`, or null (empty, malformed, or a non-sfrb letter). Bleed-safe: it
 * anchors on the leading site-number-then-hyphen and only accepts the four known class letters.
 */
export function parseSiteCodeLetter(siteCode) {
    const s = String(siteCode || '').toLowerCase().trim();
    const m = s.match(/^\(?\s*\d+\s*-\s*([sfrb])\s*-/);
    return m ? m[1] : null;
}

/**
 * deriveArea(deviceType, clientScope, rawName) — the caller-meaningful heating area for a device
 * (design §3; OOHDASH-108 extended). Returns the string `Accommodation`, the string `Bar/Restaurant`,
 * or null ("not an area device" — gateways, temp sensors, aircon, and any unmapped case; null is the
 * safe default).
 *
 *   - salus-it700 → Accommodation unconditionally (the one-per-site accommodation controller maps
 *     100%; no attribute needed, so the default `IT700` salusLocation label is handled correctly).
 *     OOHDASH-108: the glued-iT700 100% rule is DELIBERATELY unchanged (DECISION 2 kept).
 *   - salus-it500 AND salus (old-convention / "bare-salus", OOHDASH-108) → letter-resolved: parse
 *     the CLIENT_SCOPE `site` letter: s (Staff)/f (Flats) → Accommodation; r (Restaurant)/b (Bar) →
 *     Bar/Restaurant; any other/missing letter → null (fallback chip, §7.2). When no usable
 *     CLIENT_SCOPE letter is present, fall back to the site-code letter parsed from the RAW device
 *     name's trailing parenthetical (OOHDASH-108 DECISION 1, parenthetical fallback — the raw name
 *     is required because normaliseName strips parentheticals before tokenising). A present
 *     CLIENT_SCOPE letter ALWAYS wins over the parenthetical.
 *   - boiler-panel → Bar/Restaurant.
 *   - every other deviceType (intesis, gateway, tuya, refrigeration, unknown) → null.
 *
 * @param {string}      deviceType  a registry.js key from classifyDevice
 * @param {object|null} clientScope the CLIENT_SCOPE attribute map (carries `site`)
 * @param {string}      [rawName]   the RAW device name (before normaliseName) — OOHDASH-108
 *                                  parenthetical fallback source; optional/back-compatible
 */
export function deriveBoilerControl(sharedScope, clientScope, deviceName) {
    if (!sharedScope && !clientScope) {
        return { present: false, isV1: false, isV2: false, heatingControllable: false, dhwControllable: false, deviceId: null };
    }
    const hasOutputMask = sharedScope != null && 'output1OutputMask' in sharedScope;
    const hasDhwUseBoiler = clientScope != null && 'DHW.use_boiler' in clientScope;
    const isV1 = hasOutputMask && !hasDhwUseBoiler;
    const isV2 = hasDhwUseBoiler && !hasOutputMask;
    let dhwControllable = false;
    if (isV2) {
        const dhwAttr = clientScope['DHW.use_boiler'];
        dhwControllable = dhwAttr === true || dhwAttr === 'true' || dhwAttr === 1 || dhwAttr === '1';
    } else if (isV1) {
        let mask = sharedScope.output1OutputMask;
        if (typeof mask === 'string') {
            try { mask = JSON.parse(mask); } catch { mask = null; }
        }
        if (Array.isArray(mask) && mask.length >= 4) {
            dhwControllable = !!mask[3];
        }
    }
    return { present: true, isV1, isV2, deviceId: deviceName ?? null, heatingControllable: true, dhwControllable };
}

export function deriveArea(deviceType, clientScope, rawName) {
    if (deviceType === 'salus-it700') return 'Accommodation';
    // OOHDASH-108: salus-it500 and the new old-convention `salus` type share ONE letter-resolve branch.
    if (deviceType === 'salus-it500' || deviceType === 'salus') {
        // Primary source: CLIENT_SCOPE `site` letter. A present letter ALWAYS wins over the parenthetical.
        let letter = parseSiteCodeLetter(clientScope && clientScope.site);
        // OOHDASH-108 (DECISION 1): parenthetical fallback — when CLIENT_SCOPE has no usable letter,
        // parse it from the RAW device name's trailing parenthetical group (e.g. a name ending
        // `(5197-r-1)`). parseSiteCodeLetter rejects malformed/non-sfrb/reversed shapes → null, so this
        // is bleed-safe.
        if (!letter && rawName) {
            const m = String(rawName).match(/\(([^)]*)\)\s*$/);   // trailing parenthetical group
            if (m) letter = parseSiteCodeLetter(m[1]);
        }
        if (letter === 's' || letter === 'f') return 'Accommodation';
        if (letter === 'r' || letter === 'b') return 'Bar/Restaurant';
        return null;
    }
    // OOHDASH-139: the boiler panel is the Bar/Restaurant device.
    if (deviceType === 'boiler-panel') return 'Bar/Restaurant';
    return null;
}

/* ------------------------------------------------------------------ */
/* Telemetry mapping (§2.5) — TB latest telemetry → canonical keys      */
/* ------------------------------------------------------------------ */

/**
 * Folds a TB latest-telemetry bag into the canonical telemetry{} keys consumers read. Applies the
 * REQUIRED switch normalisation `switchReported(fresh) → switchOn → switch_1` into canonical
 * `switch_1` (never trust a stale `switch_1` first, C5). `heatingSetpoint` is LOAD-BEARING
 * (registry.js refuses a setpoint change without it).
 */
export function mapTelemetry(tb) {
    const t = tb || {};
    const num = v => (v === undefined || v === null || v === '' ? undefined : (Number.isFinite(Number(v)) ? Number(v) : v));
    const out = {
        temperature: num(t.temperature ?? t.localTemperature ?? t.temperatureC),
        localTemperature: num(t.localTemperature ?? t.temperature ?? t.temperatureC),
        // OOHDASH-123 (WU7): IT500 reports its setpoint on camelCase `setPoint`; fold it into the
        // load-bearing heatingSetpoint and also expose it raw so the IT500 confirming key resolves.
        heatingSetpoint: num(t.heatingSetpoint ?? t.setPoint ?? t.setpoint ?? t.setpointC),
        setPoint: num(t.setPoint),
        mode: t.mode,
        heatingActive: t.heatingActive,
        coolingActive: t.coolingActive,
        hotWater: t.hotWater,
        hwBoostHours: num(t.hwBoostHours),
        roomSensor1Temp: num(t.roomSensor1Temp),
        output1State: t.output1State
    };
    // Switch normalisation (OOHDASH-123 WU7): canonical switch_1, then the bare `switch` fallback for
    // switch-only lighting, then legacy switchOn. switchReported is retired.
    const sw = pickSwitch(t);
    if (sw !== undefined) out.switch_1 = sw;
    // Drop keys that came out undefined so the canonical shape stays clean (parity with bridge.js
    // which only set the keys the contract carried).
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
}

function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1 || v === '1' || v === 'on' || v === 'ON') return true;
    if (v === 'false' || v === 0 || v === '0' || v === 'off' || v === 'OFF') return false;
    return undefined;
}

function pickSwitch(t) {
    // OOHDASH-123 (WU7): switchReported is retired (design §12). The device's own confirming reading is
    // switch_1 (canonical), with the bare `switch` key as the fallback for switch-only lighting devices
    // (gk-6237 etc.); switchOn is kept last for legacy bridge echoes.
    if (t.switch_1 !== undefined && t.switch_1 !== null) return toBool(t.switch_1);
    if (t.switch !== undefined && t.switch !== null) return toBool(t.switch);
    if (t.switchOn !== undefined && t.switchOn !== null) return toBool(t.switchOn);
    return undefined;
}

/* ------------------------------------------------------------------ */
/* OOHDASH-85 (design §3.2): freshness-authoritative online derivation. */
/* ------------------------------------------------------------------ */

/**
 * The authoritative online rule (design §3.2). Freshness is the source of truth; `active` is pure
 * corroboration that can only STRENGTHEN a genuinely-stale "dead" case — it can never turn a fresh
 * device offline and can never rescue a stale/missing one.
 *
 *   1. lastMs null (missing/unparseable) → OFFLINE. Full stop — active cannot rescue it.
 *   2. age <= threshold                  → ONLINE. Fresh; `active` is IGNORED (the core false-offline fix).
 *   3. age > threshold                   → OFFLINE (stale). `active` only corroborates "dead" here.
 *
 * @param {number|null} lastMs   parsed last-report epoch-ms (null when missing/unparseable)
 * @param {boolean}     active   SERVER_SCOPE `active` — corroboration only
 * @param {number}      threshold freshness window in ms for this device's type
 * @param {number}      now      current epoch-ms (injectable for deterministic tests)
 * @returns {boolean}   truthful online
 */
export function deriveFreshnessOnline(lastMs, active, threshold, now = Date.now()) {
    if (lastMs == null) return false;                 // (1) missing/unparseable timestamp = offline
    const ageMs = now - lastMs;
    if (ageMs <= threshold) return true;              // (2) fresh → online (active ignored)
    return false;                                     // (3) stale → offline (active corroborates "dead")
}

/**
 * Anti-flicker debounce for the boundary case (design §5). Given the RAW freshness verdict for a
 * device on this poll, returns the value to actually report:
 *   - rawOnline true  → clear any stale record and report ONLINE (recovery resets naturally, because
 *                       freshness only moves forward and age has dropped back under threshold).
 *   - rawOnline false + hardOffline → assert OFFLINE immediately (no hold). A missing/unparseable
 *                       report time (or a failed SERVER_SCOPE read) is a hard fail-safe offline, NOT a
 *                       boundary flicker — debouncing it would mask a genuinely-unknown device.
 *   - rawOnline false + stale (had a valid, but old, timestamp), first such read → record it and report
 *                       the PRIOR value (ONLINE) for this one poll — offline is not asserted yet.
 *   - rawOnline false + stale, already recorded on a previous poll → assert OFFLINE.
 * Because a workspace read is one "poll" (LIVE_CACHE_TTL ≈ the 30s browser refresh), "two consecutive
 * polls" == two consecutive reads that both computed stale. State is server-side (module Map), so it
 * survives the browser's re-fetch on every 30s refresh.
 */
export function applyFreshnessDebounce(uuid, rawOnline, now = Date.now(), hardOffline = false) {
    if (!uuid) return rawOnline;                      // no identity to debounce against — pass through
    if (rawOnline) {
        freshnessDebounce.delete(uuid);               // fresh again → reset
        return true;
    }
    if (hardOffline) {
        freshnessDebounce.delete(uuid);               // missing ts / failed read → assert offline now
        return false;
    }
    const prior = freshnessDebounce.get(uuid);
    if (!prior) {
        freshnessDebounce.set(uuid, { staleSince: now });   // first stale read — hold online one poll
        return true;
    }
    return false;                                     // second consecutive stale read — assert offline
}

/* ------------------------------------------------------------------ */
/* TB device → canonical device shape (§2.2)                            */
/* ------------------------------------------------------------------ */

/**
 * Maps one TB device entity (+ its latest telemetry) to the canonical device shape. deviceId is the
 * TB NAME (corrective fix, C8). `zone` is the human location label the device carries (TB `label`
 * or a `zone`/`site` attribute), matching the old per-device zone semantics.
 *
 * OOHDASH-85 (design §3): `online` is now derived FROM report freshness at this single seam. The
 * caller passes the parsed last-report time on `raw.lastActivityTime` (epoch-ms or null); `raw.active`
 * is demoted to corroboration only. When `raw.lastActivityTime` is undefined (the pure fixture-mode
 * path / entities with no telemetry read), we fall back to the pre-85 `active` passthrough so the
 * fixture data path and non-live callers are unchanged — the freshness rule engages whenever a
 * last-report time was actually read (the live path always supplies it, even as null).
 */
export function mapTbDevice(raw, telemetryBag, clientScope, sharedScope = null) {
    const name = raw.name ?? raw.deviceId ?? '';
    const profile = raw.type ?? raw.profile ?? null;
    const telemetry = mapTelemetry(telemetryBag || raw.telemetry);
    const cls = classifyDevice(name, profile, telemetry);
    const lower = String(name).toLowerCase();
    return {
        deviceId: name,                         // CORRECTIVE: TB device NAME (name-keyed control path)
        zone: raw.label || raw.zone || raw.site || name,
        deviceType: cls.deviceType,             // a registry.js key
        deviceTypeLabel: cls.deviceTypeLabel,
        kind: cls.kind,
        // OOHDASH-82 (design §3/§4): the caller-meaningful heating area, derived once server-side from
        // deviceType + the CLIENT_SCOPE attributes and consumed opaquely by the flow (never re-derived).
        // OOHDASH-108: the RAW name is threaded in as the parenthetical-fallback site-letter source
        // (DECISION 1) — normaliseName strips parentheticals, so deriveArea needs the unnormalised name.
        area: deriveArea(cls.deviceType, clientScope, name),
        hotWaterCapable: telemetry.hotWater != null,
        // OOHDASH-85 (design §3.2): freshness-authoritative online. The live path always supplies
        // `lastActivityTime` (epoch-ms, or null when the SERVER_SCOPE read had no/unparseable value),
        // so the freshness rule is the source of truth there. `active` is corroboration only and can
        // never flip a fresh device. The `isOnline` short-circuit is intentionally dropped.
        // Fixture-mode / legacy callers that never read a last-report time (no `lastActivityTime` key
        // on `raw`) keep the pre-85 `active` passthrough — the freshness rule only engages when a
        // report time was actually observed.
        online: ('lastActivityTime' in raw)
            ? deriveFreshnessOnline(raw.lastActivityTime, raw.active ?? false, freshnessThresholdFor(cls.deviceType))
            : (raw.isOnline ?? raw.active ?? false),
        telemetry,
        // OOHDASH-123 (WU13, DD-SCHED-DISPLAY): decoded next-scheduled-change for boiler panels /
        // PowerPause (from the SHARED_SCOPE schedule JSON), labelled and with a safe fallback to null
        // (UI then shows "following its programme / overridden"). Decoded display is ON by default
        // (James override); SQ-13 day-order/timezone are invertible config constants.
        schedule: decodeDeviceSchedule(cls.deviceType, sharedScope ?? (raw.scheduleJson || null)),
        // additive (design-permitted):
        isDuplicate: /\(?\bold\b\)?/.test(lower),   // (old)/old duplicate devices — excluded from control
        hasReported: telemetryBag ? Object.keys(telemetryBag).length > 0 : false
    };
}

/* ------------------------------------------------------------------ */
/* Live TB fetch (§2.3 site query + §2.5 telemetry)                     */
/* ------------------------------------------------------------------ */

async function fetchTbDevicePage(textSearch, page) {
    // OOHDASH-80 (corrected): query /api/tenant/devices. The earlier deviceInfos swap (PR #33) was
    // WRONG — that endpoint does NOT exist on this TB instance (returns HTTP 400 "Invalid UUID
    // string: deviceInfos") and broke all site inventory in prod. The Device entity has no `active`
    // field, so online status is sourced per-device from SERVER_SCOPE `active` in fetchTelemetry().
    const q = `/api/tenant/devices?textSearch=${encodeURIComponent(textSearch)}&pageSize=${TB_PAGE_SIZE}&page=${page}&sortProperty=name&sortOrder=ASC`;
    const res = await readRequest('GET', q);
    // TB PageData: { data:[...], hasNext, totalElements }
    return { data: Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []), hasNext: !!res?.hasNext };
}

// OOHDASH-128 (WU2): extracted pagination body so the bracket-text search can share the same
// TB_PAGE_CAP guard and fetchTbDevicePage call. Behaviour is byte-identical for all existing callers.
async function fetchTbDevicesForText(textSearch) {
    const collected = [];
    let page = 0;
    let hasNext = true;
    while (hasNext && page < TB_PAGE_CAP) {
        const { data, hasNext: more } = await fetchTbDevicePage(textSearch, page);
        collected.push(...data);
        hasNext = more;
        page += 1;
    }
    return collected;
}

async function fetchTbDevicesForToken(brand, token) {
    return fetchTbDevicesForText(`${brand}-${token}`);
}

/** SERVER_SCOPE `active` array → boolean (OOHDASH-80). Any unexpected shape ⇒ false (fail-safe). */
function parseActive(attrs) {
    const v = attrs ? attrs.active : undefined;
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1 || v === '1') return true;
    return false;
}

/**
 * SERVER_SCOPE `lastActivityTime` → epoch-ms number, or null (OOHDASH-85 design §3.1). Read from the
 * SAME `activeRes.value` map that carries `active` — ThingsBoard returns it as a millisecond epoch.
 * Accepts a numeric string too. Absent, non-numeric, NaN, or <= 0 ⇒ null. null is the fail-safe:
 * downstream, a null last-report time is treated as OFFLINE (missing timestamp = offline).
 */
function parseLastActivity(attrs) {
    const v = attrs ? attrs.lastActivityTime : undefined;
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

/**
 * OOHDASH-123 (WU13, DD-SCHED-DISPLAY): true when a device is a PowerPause circuit. PowerPause devices
 * classify to deviceType `tuya` (the `powerpause` name token, ASSET_INTENT), so unlike the boiler panels
 * they carry no distinguishing profile at the registry join. Their stored programme lives in SHARED_SCOPE
 * `schedules`, so the fetch must identify them to read that attribute and decode a next-scheduled-change
 * (boiler V1/V2 are identified by the `boilerControl` profile; this is the matching identifier for
 * PowerPause). Checks the normalised name OR the raw profile/type for the `powerpause` token (a long,
 * specific token - bleed-safe). Fail-safe: any unexpected shape returns false (no extra read).
 */
export function isPowerPauseDevice(d) {
    if (!d) return false;
    const name = normaliseName(d.name);
    const profile = String(d.type ?? d.profile ?? '').toLowerCase();
    return name.includes('powerpause') || profile.includes('powerpause');
}

/* ------------------------------------------------------------------ */
/* OOHDASH-136: DHW override decode + outcome helpers                   */
/* ------------------------------------------------------------------ */
// decodeDhwOverride lives here (server-side decode, pure, unit tested).
// dhwOverrideOutcome lives here AND in public/js/flows.js (textually identical
// behaviour). The twin pattern follows siteConnectivityAnchor above.

/** Safe default for any decodeDhwOverride throw. */
const _DHW_DECODE_ERROR = Object.freeze({
    visible: false, hiddenReason: 'decode-error', panelVersion: null, panelLastSeenMs: null,
    mode: 'cant-confirm', untilMs: null, confirmedAtMs: null, decodedAtMs: null, unreadableReason: 'decode-error'
});

/**
 * Format a DHW override end time in UK local time for the operator.
 *   Later today      → HH:MM (or 'midnight' if 00:00)
 *   Tomorrow         → 'HH:MM tomorrow' (or 'midnight' if 00:00)
 *   Any later day    → 'on Ddd D Mmm at HH:MM' (or 'at midnight' if 00:00)
 *   Earlier today    → HH:MM (override-ended case, same calendar day)
 */
function _dhwFmtTime(ms, nowMs) {
    const tz = 'Europe/London';
    const d = new Date(ms);
    const timeStr = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    const timeDisp = timeStr === '00:00' ? 'midnight' : timeStr;
    const fmtDate = dt => new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
    const todayStr = fmtDate(new Date(nowMs));
    const tomorrowStr = fmtDate(new Date(nowMs + 86400000));
    const targetStr = fmtDate(d);
    if (targetStr === todayStr) return timeDisp;
    if (targetStr === tomorrowStr) return timeDisp === 'midnight' ? 'midnight' : `${timeDisp} tomorrow`;
    const dayName = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(d);
    const dayNum = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric' }).format(d);
    const monthName = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short' }).format(d);
    return `on ${dayName} ${dayNum} ${monthName} at ${timeDisp}`;
}

/** Format a staleness "last heard from X" string for the operator. */
function _dhwFmtAgo(panelLastSeenMs, nowMs) {
    if (panelLastSeenMs == null) return null;
    const ageMs = nowMs - panelLastSeenMs;
    const ageMins = Math.round(ageMs / 60000);
    if (ageMins < 120) return `${ageMins} minute${ageMins !== 1 ? 's' : ''} ago`;
    const ageHrs = Math.round(ageMs / 3600000);
    if (ageHrs < 48) return `${ageHrs} hour${ageHrs !== 1 ? 's' : ''} ago`;
    const tz = 'Europe/London';
    const d = new Date(panelLastSeenMs);
    const dayName = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(d);
    const dayNum = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric' }).format(d);
    const monthName = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short' }).format(d);
    const timeStr = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return `on ${dayName} ${dayNum} ${monthName} at ${timeStr}`;
}

/**
 * decodeDhwOverride(sharedScope, clientScope, panelLastSeenMs, telemBag, historyRows, now)
 *
 * Pure function (no network). Returns the 9-field dhwOverride payload object.
 * Wrapped in try/catch: any throw returns _DHW_DECODE_ERROR.
 *
 * @param {object|null} sharedScope     TB SHARED_SCOPE attrs (output1OutputMask for V1)
 * @param {object|null} clientScope     TB CLIENT_SCOPE attrs (heating_scenario for V2)
 * @param {number|null} panelLastSeenMs lastActivityTime in ms; null when absent
 * @param {object}      telemBag        flat telemetry bag (DHW.override, output4Override)
 * @param {Array|null}  historyRows     V1 history rows [{ts, value}], or null (read failed)
 * @param {number}      now             current epoch ms (injectable for tests)
 * @returns {{ visible, hiddenReason, panelVersion, panelLastSeenMs, mode, untilMs, confirmedAtMs, decodedAtMs, unreadableReason }}
 */
export function decodeDhwOverride(sharedScope, clientScope, panelLastSeenMs, telemBag, historyRows, now) {
    try {
        return _decodeDhwOverrideInner(sharedScope, clientScope, panelLastSeenMs, telemBag, historyRows, now);
    } catch (_e) {
        return { ..._DHW_DECODE_ERROR };
    }
}

function _decodeDhwOverrideInner(sharedScope, clientScope, panelLastSeenMs, telemBag, historyRows, now) {
    const sc = sharedScope || {};
    const cc = clientScope || {};
    const t = telemBag || {};
    const decodedAtMs = now;
    const lastSeenMs = panelLastSeenMs ?? null;

    // Version discrimination: heating_scenario in CLIENT → V2 (wins even when output1OutputMask also
    // present — the dual-marker rule that correctly handles the 7 known dual-marker estate sites).
    const hasHeatScen = Object.prototype.hasOwnProperty.call(cc, 'heating_scenario');
    const hasMask = Object.prototype.hasOwnProperty.call(sc, 'output1OutputMask');
    if (!hasHeatScen && !hasMask) {
        return { visible: false, hiddenReason: 'version-unknown', panelVersion: null, panelLastSeenMs: lastSeenMs, mode: null, untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: null };
    }
    const panelVersion = hasHeatScen ? 'V2' : 'V1';

    // V2 hide (D3): heating_scenario.separate_dhw !== 0 → hidden (hot water on a separate system)
    if (panelVersion === 'V2') {
        let hs = cc['heating_scenario'];
        if (typeof hs === 'string') { try { hs = JSON.parse(hs); } catch (_e2) { hs = null; } }
        const sepDhw = (hs != null && typeof hs === 'object') ? hs.separate_dhw : undefined;
        if (sepDhw !== 0) {
            return { visible: false, hiddenReason: 'separate-dhw', panelVersion: 'V2', panelLastSeenMs: lastSeenMs, mode: null, untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: null };
        }
    }

    // V1 hide (D4): output1OutputMask[3] !== true → hidden (output 4 not wired for hot water)
    if (panelVersion === 'V1') {
        let mask = sc.output1OutputMask;
        if (typeof mask === 'string') { try { mask = JSON.parse(mask); } catch (_e2) { mask = null; } }
        if (!Array.isArray(mask) || mask[3] !== true) {
            return { visible: false, hiddenReason: 'dhw-not-wired', panelVersion: 'V1', panelLastSeenMs: lastSeenMs, mode: null, untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: null };
        }
    }

    // No reading: key absent from telemetry → hidden (nothing to conclude)
    if (panelVersion === 'V2' && !Object.prototype.hasOwnProperty.call(t, 'DHW.override')) {
        return { visible: false, hiddenReason: 'no-reading', panelVersion: 'V2', panelLastSeenMs: lastSeenMs, mode: null, untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: null };
    }
    if (panelVersion === 'V1' && !Object.prototype.hasOwnProperty.call(t, 'output4Override')) {
        return { visible: false, hiddenReason: 'no-reading', panelVersion: 'V1', panelLastSeenMs: lastSeenMs, mode: null, untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: null };
    }

    // Staleness: panel last report > 60 min ago (or absent) → can't confirm
    const staleMs = config.boilerPanelStaleThresholdMinutes * 60 * 1000;
    if (lastSeenMs === null || (now - lastSeenMs) > staleMs) {
        return { visible: true, hiddenReason: null, panelVersion, panelLastSeenMs: lastSeenMs, mode: 'cant-confirm', untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: 'stale' };
    }

    // V2 decode (DHW.override is epoch SECONDS — multiply by 1000 for ms)
    if (panelVersion === 'V2') {
        const raw = t['DHW.override'];
        const n = Number(raw);
        if (raw === null || raw === undefined || String(raw).trim() === '' || !Number.isFinite(n) || !Number.isInteger(n)) {
            return { visible: true, hiddenReason: null, panelVersion: 'V2', panelLastSeenMs: lastSeenMs, mode: 'cant-confirm', untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: 'not-a-number' };
        }
        if (n === 0) {
            return { visible: true, hiddenReason: null, panelVersion: 'V2', panelLastSeenMs: lastSeenMs, mode: 'auto', untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: null };
        }
        // Plausibility: abs(n)*1000 ms must be within [now-6h, now+365d]. Catches sentinel values 1/-1.
        const endMs = Math.abs(n) * 1000;
        const pastWindowMs = config.boilerV2OverridePastWindowHours * 60 * 60 * 1000;
        const futureWindowMs = config.boilerV2OverrideFutureWindowDays * 24 * 60 * 60 * 1000;
        if (endMs < (now - pastWindowMs) || endMs > (now + futureWindowMs)) {
            return { visible: true, hiddenReason: null, panelVersion: 'V2', panelLastSeenMs: lastSeenMs, mode: 'cant-confirm', untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: 'implausible' };
        }
        if (endMs <= now) {
            // End time in the past but within 6 h → auto-ended (panel hasn't cleared it yet)
            return { visible: true, hiddenReason: null, panelVersion: 'V2', panelLastSeenMs: lastSeenMs, mode: 'auto-ended', untilMs: endMs, confirmedAtMs: null, decodedAtMs, unreadableReason: null };
        }
        // End time in the future: on-until (positive) or off-until (negative)
        return { visible: true, hiddenReason: null, panelVersion: 'V2', panelLastSeenMs: lastSeenMs, mode: n > 0 ? 'on-until' : 'off-until', untilMs: endMs, confirmedAtMs: null, decodedAtMs, unreadableReason: null };
    }

    // V1 decode (output4Override is epoch MILLISECONDS)
    {
        const raw = t['output4Override'];
        const latestN = (raw !== null && raw !== undefined && String(raw).trim() !== '') ? Number(raw) : 0;
        if (Number.isFinite(latestN) && latestN === 0) {
            return { visible: true, hiddenReason: null, panelVersion: 'V1', panelLastSeenMs: lastSeenMs, mode: 'auto', untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: null };
        }
        // Non-zero (or corrupt): use history rows.
        // Valid row: integer with abs in [1.0e12, 2.1e12] (approximately 2001–2036), or exactly 0.
        // 25-digit corrupt copies (like 3213428566365480600000000) have abs > 2.1e12 → rejected.
        const confirmWindowMs = config.boilerV1OverrideConfirmMinutes * 60 * 1000;
        const rows = Array.isArray(historyRows) ? historyRows : [];
        const validRows = rows.filter(row => {
            const v = Number(row.value);
            if (!Number.isFinite(v) || !Number.isInteger(v)) return false;
            if (v === 0) return true;
            return Math.abs(v) >= 1.0e12 && Math.abs(v) <= 2.1e12;
        });
        if (!validRows.length) {
            return { visible: true, hiddenReason: null, panelVersion: 'V1', panelLastSeenMs: lastSeenMs, mode: 'cant-confirm', untilMs: null, confirmedAtMs: null, decodedAtMs, unreadableReason: 'not-reconfirmed' };
        }
        // Sort newest first (TB returns DESC but sort to be safe).
        const sorted = [...validRows].sort((a, b) => Number(b.ts) - Number(a.ts));
        const newest = sorted[0];
        const newestTs = Number(newest.ts);
        const newestVal = Number(newest.value);
        if ((now - newestTs) > confirmWindowMs) {
            return { visible: true, hiddenReason: null, panelVersion: 'V1', panelLastSeenMs: lastSeenMs, mode: 'cant-confirm', untilMs: null, confirmedAtMs: newestTs, decodedAtMs, unreadableReason: 'not-reconfirmed' };
        }
        if (newestVal === 0) {
            return { visible: true, hiddenReason: null, panelVersion: 'V1', panelLastSeenMs: lastSeenMs, mode: 'auto', untilMs: null, confirmedAtMs: newestTs, decodedAtMs, unreadableReason: null };
        }
        return { visible: true, hiddenReason: null, panelVersion: 'V1', panelLastSeenMs: lastSeenMs, mode: newestVal > 0 ? 'on-v1' : 'off-v1', untilMs: null, confirmedAtMs: newestTs, decodedAtMs, unreadableReason: null };
    }
}

/**
 * dhwOverrideOutcome(dhwOverride, nowMs) -> {state, headline, explanation, script, ticketSentence} | null
 *
 * Server twin of the public/js/flows.js function (same algorithm; keep both in lock-step).
 * Takes the dhwOverride payload object and re-applies time-based checks at the given nowMs.
 * Handles: V2 on-until/off-until → auto-ended when untilMs passes; V1 on-v1/off-v1 → cant-confirm
 * when confirmedAtMs expires; staleness re-check. Exposed here for unit testing U17, U18, U20.
 * Returns null when dhwOverride is absent or visible is false.
 */
export function dhwOverrideOutcome(dhwOverride, nowMs) {
    if (!dhwOverride || !dhwOverride.visible) return null;
    const { mode, panelLastSeenMs, untilMs, confirmedAtMs, unreadableReason } = dhwOverride;
    const staleMs = config.boilerPanelStaleThresholdMinutes * 60 * 1000;
    const v1ConfirmMs = config.boilerV1OverrideConfirmMinutes * 60 * 1000;

    // Re-apply staleness
    if (panelLastSeenMs == null || (nowMs - panelLastSeenMs) > staleMs) {
        const ago = _dhwFmtAgo(panelLastSeenMs, nowMs);
        const reason = ago ? `last reported ${ago}` : "isn't reporting";
        return {
            state: 'cant-confirm',
            headline: "Hot water override: can't confirm",
            explanation: ago
                ? `The boiler panel last reported ${ago}, so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal.`
                : "The boiler panel isn't reporting, so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal.",
            script: "I can't see the current hot water setting from here right now, so I'll log it for the team to check.",
            ticketSentence: `Hot water override at time of call: could not be confirmed (${reason}).`
        };
    }

    // V2 end-time transition: on-until / off-until → auto-ended when untilMs passes
    let effectiveMode = mode;
    let effectiveReason = unreadableReason;
    if ((mode === 'on-until' || mode === 'off-until') && untilMs != null && untilMs <= nowMs) {
        effectiveMode = 'auto-ended';
    }
    // V1 confirmation expiry: on-v1 / off-v1 → cant-confirm when confirmedAtMs is too old
    if ((mode === 'on-v1' || mode === 'off-v1') && (confirmedAtMs == null || (nowMs - confirmedAtMs) > v1ConfirmMs)) {
        effectiveMode = 'cant-confirm';
        effectiveReason = 'not-reconfirmed';
    }

    if (effectiveMode === 'auto') {
        return {
            state: 'auto',
            headline: 'Hot water override: Auto (on schedule)',
            explanation: 'Nobody has overridden the hot water on the boiler panel. It is following its normal timetable, so an override is not the reason for the problem.',
            script: "The hot water controls haven't been overridden - they're running on the normal timetable.",
            ticketSentence: 'Hot water override at time of call: Auto (on schedule).'
        };
    }
    if (effectiveMode === 'auto-ended') {
        const endedAt = untilMs != null ? _dhwFmtTime(untilMs, nowMs) : '';
        return {
            state: 'auto-ended',
            headline: 'Hot water override: Auto (on schedule)',
            explanation: `An override ended at ${endedAt} and the panel has gone back to its normal timetable, so an override is not the reason for the problem now.`,
            script: "The hot water controls are back on the normal timetable.",
            ticketSentence: `Hot water override at time of call: Auto (on schedule, override ended at ${endedAt}).`
        };
    }
    if (effectiveMode === 'on-until') {
        const timeStr = _dhwFmtTime(untilMs, nowMs);
        return {
            state: 'on-until',
            headline: `Hot water override: Override ON until ${timeStr}`,
            explanation: `Hot water has already been set to run from the boiler panel and stays on until ${timeStr}. The controls are asking for hot water, so if there is still none, the likely cause is the boiler or the cylinder.`,
            script: `The hot water has already been switched on from the controls and will stay on until ${timeStr}. If it's still not coming through, it's likely the boiler itself, so I'll log it for the team.`,
            ticketSentence: `Hot water override at time of call: Override ON until ${timeStr}.`
        };
    }
    if (effectiveMode === 'off-until') {
        const timeStr = _dhwFmtTime(untilMs, nowMs);
        return {
            state: 'off-until',
            headline: `Hot water override: Override OFF until ${timeStr}`,
            explanation: `Hot water has been deliberately switched off from the boiler panel until ${timeStr}. That is the likely reason there is no hot water. It goes back to its normal timetable at ${timeStr}. We can't change it from here, so escalate if the caller needs it sooner.`,
            script: `The hot water has been switched off on purpose at the controls until ${timeStr}, then it goes back to normal. I'll log that you need it back sooner so the team can look at it.`,
            ticketSentence: `Hot water override at time of call: Override OFF until ${timeStr}.`
        };
    }
    if (effectiveMode === 'on-v1') {
        return {
            state: 'on-v1',
            headline: 'Hot water override: Override ON',
            explanation: "Hot water has been set to run from the boiler panel. This type of panel doesn't give an end time. The controls are asking for hot water, so if there is still none, the likely cause is the boiler or the cylinder.",
            script: "The hot water has been switched on from the controls. If it's still not coming through, it's likely the boiler itself, so I'll log it for the team.",
            ticketSentence: 'Hot water override at time of call: Override ON.'
        };
    }
    if (effectiveMode === 'off-v1') {
        return {
            state: 'off-v1',
            headline: 'Hot water override: Override OFF',
            explanation: "Hot water has been deliberately switched off on the boiler panel. That is the likely reason there is no hot water. This type of panel doesn't say when it ends, and we can't change it from here, so escalate it.",
            script: "The hot water has been switched off on purpose at the controls. I'll log it so the team can switch it back on for you.",
            ticketSentence: 'Hot water override at time of call: Override OFF.'
        };
    }
    // cant-confirm: stale, implausible, not-reconfirmed, decode-error, or unknown
    let explanation, ticketSentence;
    if (effectiveReason === 'stale') {
        const ago = _dhwFmtAgo(panelLastSeenMs, nowMs);
        const reason = ago ? `last reported ${ago}` : "isn't reporting";
        explanation = ago
            ? `The boiler panel last reported ${ago}, so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal.`
            : "The boiler panel isn't reporting, so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal.";
        ticketSentence = `Hot water override at time of call: could not be confirmed (${reason}).`;
    } else if (effectiveReason === 'not-reconfirmed') {
        explanation = "The boiler panel hasn't re-confirmed its hot water override recently, so we can't tell whether it is still in place. Don't tell the caller it is on or off; log it and escalate as normal.";
        ticketSentence = "Hot water override at time of call: could not be confirmed (panel hasn't re-confirmed recently).";
    } else {
        // not-a-number, implausible, decode-error, or unspecified
        explanation = "The boiler panel's hot water override reading doesn't make sense right now, so we can't tell whether it is overridden. Don't tell the caller it is on or off; log it and escalate as normal.";
        ticketSentence = "Hot water override at time of call: could not be confirmed (reading doesn't make sense).";
    }
    return {
        state: 'cant-confirm',
        headline: "Hot water override: can't confirm",
        explanation,
        script: "I can't see the current hot water setting from here right now, so I'll log it for the team to check.",
        ticketSentence
    };
}

/* ------------------------------------------------------------------ */
/* OOHDASH-139: decodeBoilerHeating — pub zone heating state (V1/V2)   */
/* ------------------------------------------------------------------ */

const _BOILER_HEATING_DECODE_ERROR = { visible: false, version: null, panelLastSeenMs: null, stale: true, boilerCalling: null, zones: [], summerMode: null, nextChange: null };

function _decodeBoilerHeatingInner(sharedScope, clientScope, panelLastSeenMs, telemBag, now) {
    const sc = sharedScope || {};
    const cc = clientScope || {};
    const t = telemBag || {};

    // Version discrimination: heating_scenario in CLIENT → V2; output1OutputMask in SHARED → V1.
    // V2 wins if both present (dual-marker rule, same as _decodeDhwOverrideInner).
    const hasHeatScen = Object.prototype.hasOwnProperty.call(cc, 'heating_scenario');
    const hasMask = Object.prototype.hasOwnProperty.call(sc, 'output1OutputMask');
    if (!hasHeatScen && !hasMask) {
        return { visible: false, version: null, panelLastSeenMs: panelLastSeenMs ?? null, stale: true, boilerCalling: null, zones: [], summerMode: null, nextChange: null };
    }
    const version = hasHeatScen ? 'V2' : 'V1';

    // Staleness: panel last report > boilerPanelStaleThresholdMinutes ago (or absent).
    const staleMs = config.boilerPanelStaleThresholdMinutes * 60 * 1000;
    const lastSeenMs = panelLastSeenMs ?? null;
    const stale = lastSeenMs === null || (now - lastSeenMs) > staleMs;

    // Helper: drop temperature sentinel values outside [-30, 110] → null.
    function safeTemp(v) {
        const n = Number(v);
        if (!Number.isFinite(n) || n < -30 || n > 110) return null;
        return n;
    }

    // Parse override for a zone: returns { forced, forcedUntilMs, held }
    function parseOverride(rawOverride, zoneOn, ver, nowMs) {
        if (rawOverride === null || rawOverride === undefined) return { forced: null, forcedUntilMs: null, held: false };
        const n = Number(rawOverride);
        if (!Number.isFinite(n) || n === 0) return { forced: null, forcedUntilMs: null, held: false };

        if (ver === 'V1') {
            // V1: negative = forced off, positive = forced on; rolling now+15min heartbeat (no real end time).
            if (n < 0 && zoneOn === false) return { forced: 'off', forcedUntilMs: null, held: true };
            if (n > 0 && zoneOn === true) return { forced: 'on', forcedUntilMs: null, held: true };
            return { forced: null, forcedUntilMs: null, held: false };
        } else {
            // V2: epoch-seconds end time, signed. negative = forced off, positive = forced on.
            const endMs = Math.abs(n) * 1000;
            const inFuture = endMs > nowMs;
            if (n < 0 && zoneOn === false) return { forced: 'off', forcedUntilMs: inFuture ? endMs : null, held: false };
            if (n > 0 && zoneOn === true) return { forced: 'on', forcedUntilMs: inFuture ? endMs : null, held: false };
            return { forced: null, forcedUntilMs: null, held: false };
        }
    }

    // Decode a boolean-like TB attribute (true/1 → true, false/0 → false, else null).
    function tbBool(v) {
        if (v === true || v === 1 || v === 'true' || v === '1') return true;
        if (v === false || v === 0 || v === 'false' || v === '0') return false;
        return null;
    }

    let boilerCalling, zones, summerMode;

    if (version === 'V1') {
        boilerCalling = tbBool(t.output1State);
        summerMode = tbBool(t.summerModeActive);

        // Zone configured: output1OutputMask index 1 = z1, index 2 = z2.
        let mask = sc.output1OutputMask;
        if (typeof mask === 'string') { try { mask = JSON.parse(mask); } catch { mask = null; } }
        const z1Configured = Array.isArray(mask) ? !!mask[1] : Object.prototype.hasOwnProperty.call(t, 'output2State');
        function countO3ScheduleEntries() {
            const raw = sc.output3Schedule;
            if (raw == null) return 0;
            try {
                const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return Array.isArray(s) ? s.length : (Array.isArray(s?.schedule) ? s.schedule.length : 0);
            } catch { return 0; }
        }
        const z2Configured = Array.isArray(mask) ? (!!mask[2] || countO3ScheduleEntries() > 0) : Object.prototype.hasOwnProperty.call(t, 'output3State');

        zones = [];
        if (z1Configured) {
            const on = tbBool(t.output2State);
            const fallback = tbBool(t.output2FallbackEnabled);
            const { forced, forcedUntilMs, held } = parseOverride(t.output2Override ?? null, on, 'V1', now);
            const timetable = zoneTimetable(sc.output2Schedule ?? null, now, config.control?.schedule?.tz ?? 'Europe/London');
            zones.push({ n: 1, zone: 'CHZ1', on, fallback, forced, forcedUntilMs, held, roomTemp: safeTemp(t.roomSensor1Temp), timetable: timetable ?? null });
        }
        if (z2Configured) {
            const on = tbBool(t.output3State);
            const fallback = tbBool(t.output3FallbackEnabled);
            const { forced, forcedUntilMs, held } = parseOverride(t.output3Override ?? null, on, 'V1', now);
            const timetable = zoneTimetable(sc.output3Schedule ?? null, now, config.control?.schedule?.tz ?? 'Europe/London');
            zones.push({ n: 2, zone: 'CHZ2', on, fallback, forced, forcedUntilMs, held, roomTemp: safeTemp(t.roomSensor2Temp), timetable: timetable ?? null });
        }
    } else {
        // V2
        boilerCalling = tbBool(t['boiler.enable_output_state']);
        summerMode = tbBool(t['summer_mode']);

        // Zone configured: clientScope CHZ1.enabled / CHZ2.enabled (bool or string 'true'/'false').
        // Fallback: telemetry key presence.
        function isZoneEnabled(ccKey, telemKey) {
            const v = cc[ccKey];
            if (v === true || v === 'true' || v === 1) return true;
            if (v === false || v === 'false' || v === 0) return false;
            return Object.prototype.hasOwnProperty.call(t, telemKey);
        }
        const z1Configured = isZoneEnabled('CHZ1.enabled', 'CHZ1.output_state');
        const z2Configured = isZoneEnabled('CHZ2.enabled', 'CHZ2.output_state');

        zones = [];
        if (z1Configured) {
            const on = tbBool(t['CHZ1.output_state']);
            const fallback = tbBool(t['CHZ1.fallback_enabled']);
            const { forced, forcedUntilMs, held } = parseOverride(t['CHZ1.override'] ?? null, on, 'V2', now);
            const timetable = zoneTimetable(sc['CHZ1.schedule'] ?? null, now, config.control?.schedule?.tz ?? 'Europe/London');
            zones.push({ n: 1, zone: 'CHZ1', on, fallback, forced, forcedUntilMs, held, roomTemp: safeTemp(t['CHZ1.room_temp']), timetable: timetable ?? null });
        }
        if (z2Configured) {
            const on = tbBool(t['CHZ2.output_state']);
            const fallback = tbBool(t['CHZ2.fallback_enabled']);
            const { forced, forcedUntilMs, held } = parseOverride(t['CHZ2.override'] ?? null, on, 'V2', now);
            const timetable = zoneTimetable(sc['CHZ2.schedule'] ?? null, now, config.control?.schedule?.tz ?? 'Europe/London');
            zones.push({ n: 2, zone: 'CHZ2', on, fallback, forced, forcedUntilMs, held, roomTemp: safeTemp(t['CHZ2.room_temp']), timetable: timetable ?? null });
        }
    }

    // nextChange: use decodeDeviceSchedule (internal function, same file).
    // Pass a deviceType string so the function routes to the right schedule key family.
    const nextChange = decodeDeviceSchedule('boiler-panel', sc, now) ?? null;

    return {
        visible: true,
        version,
        panelLastSeenMs: lastSeenMs,
        stale,
        boilerCalling,
        zones,
        summerMode,
        nextChange,
    };
}

export function decodeBoilerHeating(sharedScope, clientScope, panelLastSeenMs, telemBag, now) {
    try {
        return _decodeBoilerHeatingInner(sharedScope, clientScope, panelLastSeenMs, telemBag, now);
    } catch (_e) {
        return { ..._BOILER_HEATING_DECODE_ERROR };
    }
}

// OOHDASH-143: extract max valid ts from a TB timeseries response (exported for unit tests).
// Upper-bound guard (now + 5 min) rejects forward-skewed device clocks so they cannot pin freshness.
// All timeseries keys come from the TB device API and are device-reported; server-side attributes
// (active, lastActivityTime) arrive via SERVER_SCOPE, not this endpoint.
export function _extractMaxTelemTs(tsData, now) {
    const upperBound = now + 300_000;
    let maxTs = null;
    for (const series of Object.values(tsData || {})) {
        if (!Array.isArray(series) || !series.length) continue;
        const ts = series[0].ts;
        if (typeof ts === 'number' && ts > 0 && ts <= upperBound && (maxTs === null || ts > maxTs)) maxTs = ts;
    }
    return maxTs;
}

/**
 * Bulk latest telemetry for a set of TB devices, PLUS the per-device online state (OOHDASH-80). Uses
 * per-device latest-timeseries reads over the read session AND a per-device SERVER_SCOPE `active`
 * read (the Device entity from /api/tenant/devices has no `active`/`lastActivityTime`; SERVER_SCOPE
 * carries the TB UI Active state). Both reads for a device run concurrently, and every device is
 * fetched concurrently — no extra serial round-trip. Returns Map<tbId, telemetryBag> where the bag
 * additionally carries a private `__active` boolean. Never throws for a single-device miss: a failed
 * telemetry OR active read degrades THAT device (empty bag / offline) and the site query still
 * returns every device — the regression guard for the prod outage this ticket supersedes.
 */
async function fetchTelemetry(devices) {
    const out = new Map();
    await Promise.all(devices.map(async d => {
        const uuid = d?.id?.id || d?.id;
        if (!uuid) return;
        // Dispatch all three reads concurrently; settle independently so one failing never fails the
        // others. OOHDASH-82 (design §4): the CLIENT_SCOPE read is added as a THIRD concurrent settled
        // read (no extra serial round-trip) to source the iT500 `site` code / iT700 `salusLocation`
        // for area derivation.
        const isBoilerControl = (d.type ?? d.profile) === 'boilerControl';
        // OOHDASH-123 (WU13 rework): PowerPause circuits also carry a decodable programme, in SHARED_SCOPE
        // `schedules`. They have no boilerControl profile, so identify them by name/profile token and read
        // just that one attribute. needsSharedScope drives both the read and the stash below.
        const isPowerPause = isPowerPauseDevice(d);
        const needsSharedScope = isBoilerControl || isPowerPause;
        const reads = [
            readRequest('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries`),
            readServerScopeAttributes(uuid, 'active,lastActivityTime'),
            isBoilerControl
                // OOHDASH-136: heating_scenario added to identify V2 panels for DHW override decode.
                // OOHDASH-139: CHZ1.enabled,CHZ2.enabled added for zone-configured decode in decodeBoilerHeating.
                ? readClientScopeAttributes(uuid, 'site,salusLocation,DHW.use_boiler,heating_scenario,CHZ1.enabled,CHZ2.enabled')
                : readClientScopeAttributes(uuid, 'site,salusLocation'),
            isBoilerControl
                // OOHDASH-123 (WU13): also read the schedule attributes (V1 output1..4Schedule,
                // V2 CHZ1/DHW schedule) for the next-scheduled-change decode (design §10, decoded display).
                ? readSharedScopeAttributes(uuid, 'output1OutputMask,output1Schedule,output2Schedule,output3Schedule,output4Schedule,CHZ1.schedule,CHZ2.schedule,DHW.schedule,schedules')
                : isPowerPause
                    // PowerPause stores its programme under SHARED_SCOPE `schedules` only.
                    ? readSharedScopeAttributes(uuid, 'schedules')
                    : Promise.resolve(null)
        ];
        const [tsRes, activeRes, clientScopeRes, sharedScopeRes] = await Promise.allSettled(reads);
        const bag = {};
        if (tsRes.status === 'fulfilled') {
            // TB shape: { key: [{ ts, value }] } → flatten to { key: value }.
            // __telemLastSeenMs = max valid ts across all keys — fallback for panelLastSeenMs
            // when SERVER_SCOPE lastActivityTime is absent (OOHDASH-143 6811 class).
            const nowMs = Date.now();
            const telemTs = _extractMaxTelemTs(tsRes.value, nowMs);
            for (const [k, series] of Object.entries(tsRes.value || {})) {
                if (Array.isArray(series) && series.length) bag[k] = series[0].value;
            }
            bag.__telemLastSeenMs = telemTs;
        } else {
            console.error(`[TB] Telemetry read failed for device ${uuid}: ${tsRes.reason?.message}`);
        }
        if (activeRes.status === 'fulfilled') {
            bag.__active = parseActive(activeRes.value);
            // OOHDASH-85 (design §3.1): read `lastActivityTime` from the SAME SERVER_SCOPE map. This is
            // the truthful liveness signal the code already fetched (`active,lastActivityTime`) and
            // previously discarded. null when absent/unparseable → treated as offline downstream.
            bag.__lastActivityTime = parseLastActivity(activeRes.value);
        } else {
            // Fail-safe: a SERVER_SCOPE read failure degrades this device to offline, never the site.
            console.error(`[TB] SERVER_SCOPE active read failed for device ${uuid}: ${activeRes.reason?.message}`);
            bag.__active = false;
            bag.__lastActivityTime = null;      // OOHDASH-85: no report time → offline (fail-safe)
        }
        // OOHDASH-82 (design §4): stash the CLIENT_SCOPE map under a private key. A failed read degrades
        // THIS device to no client-scope (area falls back to the §7.2 rule), never the whole site.
        if (clientScopeRes.status === 'fulfilled') {
            bag.__clientScope = clientScopeRes.value || {};
        } else {
            console.error(`[TB] CLIENT_SCOPE read failed for device ${uuid}: ${clientScopeRes.reason?.message}`);
            bag.__clientScope = {};
        }
        // OOHDASH-114-F1: stash boilerControl SHARED_SCOPE.
        // OOHDASH-123 (WU13 rework): also stash it for PowerPause so decodeDeviceSchedule can read its
        // `schedules` programme. A failed read degrades THIS device to no schedule (safe fallback), never
        // the whole site.
        if (needsSharedScope) {
            if (sharedScopeRes.status === 'fulfilled' && sharedScopeRes.value !== null) {
                bag.__sharedScope = sharedScopeRes.value || {};
            } else {
                console.error(`[TB] SHARED_SCOPE read failed for ${isPowerPause ? 'PowerPause' : 'boilerControl'} ${uuid}: ${sharedScopeRes.reason?.message}`);
                bag.__sharedScope = {};
            }
        } else {
            bag.__sharedScope = null;
        }
        // OOHDASH-136: conditional V1 output4Override history read.
        // Fires only for V1 boilerControl panels (output1OutputMask in SHARED, no heating_scenario in
        // CLIENT) whose latest output4Override is non-zero. One extra read, at most 35 min of rows,
        // at most 20 rows, newest first. Failure degrades only this panel to cant-confirm (unreadableReason
        // 'not-reconfirmed'); it never fails the site. __v1OverrideHistory=null → decodeDhwOverride
        // returns cant-confirm, as decodeDhwOverride treats a missing/empty history as unconfirmed.
        if (isBoilerControl) {
            const ss = bag.__sharedScope ?? {};
            const cs = bag.__clientScope ?? {};
            const isV1panel = Object.prototype.hasOwnProperty.call(ss, 'output1OutputMask')
                && !Object.prototype.hasOwnProperty.call(cs, 'heating_scenario');
            if (isV1panel) {
                const latestRaw = bag['output4Override'];
                const latestN = (latestRaw !== undefined && latestRaw !== null && latestRaw !== '')
                    ? Number(latestRaw) : 0;
                if (Number.isFinite(latestN) && latestN !== 0) {
                    const nowMs = Date.now();
                    const v1ConfirmMs = config.boilerV1OverrideConfirmMinutes * 60 * 1000;
                    const histPath = `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries` +
                        `?keys=output4Override&startTs=${nowMs - v1ConfirmMs}&endTs=${nowMs}&limit=20&agg=NONE&orderBy=DESC`;
                    try {
                        const hist = await readRequest('GET', histPath);
                        bag.__v1OverrideHistory = (hist && Array.isArray(hist['output4Override']))
                            ? hist['output4Override'] : [];
                    } catch (err) {
                        console.warn(`[TB] V1 DHW override history read failed for ${uuid}: ${err.message}`);
                        bag.__v1OverrideHistory = null;
                    }
                } else {
                    bag.__v1OverrideHistory = [];
                }
            }
        }
        out.set(uuid, bag);
    }));
    return out;
}

async function fetchLiveSitesByNumber(siteNo) {
    const key = String(siteNo);
    const cached = perSiteCache.get(key);
    if (cached && Date.now() - cached.at < LIVE_CACHE_TTL) return cached.sites;

    const { brand, tokens } = siteQueryTokens(key);
    const filter = siteNameFilter(brand, tokens);

    // OOHDASH-128 (WU3): Step 1 — existing per-token fetches (token results have dedup priority).
    const tokenPromises = tokens.map(token => fetchTbDevicesForToken(brand, token));

    // Step 2 — supplementary bracket lookup. "(5694-" returns all bare-salus for site 5694.
    // Fail-soft: a failure returns [] and logs a warning; the token fetch still throws on failure
    // (degraded mode unchanged). encodeURIComponent in fetchTbDevicePage handles the "(" safely.
    const legacyPromise = fetchTbDevicesForText(`(${key}-`)
        .catch(err => {
            console.warn(`[TB] Older-Salus lookup failed for site ${key} - continuing without it: ${err.message}`);
            return [];
        });

    // Step 3 — await both in parallel. Wall-clock cost = max(token fetch, legacy fetch), not sum.
    const [tokenResults, legacyRaw] = await Promise.all([
        Promise.all(tokenPromises),
        legacyPromise
    ]);

    // Step 4 — deduplicate by TB id. Token results are added first (priority); legacy results
    // skip any id already seen.
    const byId = new Map();
    for (const raw of tokenResults) {
        for (const d of raw) {
            const id = d?.id?.id || d?.id || d?.name;
            if (!byId.has(id)) byId.set(id, d);
        }
    }
    for (const d of legacyRaw) {
        const id = d?.id?.id || d?.id || d?.name;
        if (!byId.has(id)) byId.set(id, d);
    }

    // Step 5 — keep device if it passes the existing anchored siteNameFilter (UNCHANGED) OR the
    // strict bare-salus check. The OR is additive only: cannot remove devices the existing path kept.
    const matched = [...byId.values()].filter(d =>
        filter.test(normaliseName(d.name)) || isLegacySalusForSite(d.name, key)
    );

    // OOHDASH-140: lazy helpers for Tuya (dynamic import to avoid coupling to fixture-mode tests)
    async function _readSiteListing(br, k) {
        const { readSiteListing } = await import('./tuya-read.js');
        return readSiteListing(br, k);
    }
    async function _attachTuya(devs, listing, tuyaOpts) {
        const { attachTuya } = await import('./tuya-read.js');
        return attachTuya(devs, listing, tuyaOpts);
    }
    async function _tuyaReadOff() {
        const { tuyaReadOff } = await import('./killswitch.js');
        return tuyaReadOff();
    }

    const tuyaEnabled = config.tuya?.readEnabled && config.tuya?.clientId && !await _tuyaReadOff().catch(() => true);

    // Latest telemetry + Tuya listing run concurrently
    const [telemetryById, tuyaListing] = await Promise.all([
        fetchTelemetry(matched),
        tuyaEnabled ? _readSiteListing(brand, key).catch(err => {
            console.warn(`[TUYA] Listing failed for site ${key}: ${err.message}`);
            return null;
        }) : Promise.resolve(null)
    ]);

    const now = Date.now();
    const devices = matched.map(d => {
        const uuid = d?.id?.id || d?.id;
        const bag = telemetryById.get(uuid) || {};
        // OOHDASH-80: source liveness from the SERVER_SCOPE read stashed in the bag, then strip the
        // private keys so they never leak into the canonical telemetry{} shape.
        // OOHDASH-82 (design §4): strip the private `__clientScope` map the same way and pass it into
        // mapTbDevice so deriveArea can consume the iT500 `site` code / iT700 `salusLocation`.
        // OOHDASH-85 (design §3): strip `__lastActivityTime` and pass it as `lastActivityTime` so the
        // freshness rule at mapTbDevice becomes the source of truth for `online`.
        const { __active, __clientScope, __lastActivityTime, __sharedScope, ...telemetryBag } = bag;
        const dev = mapTbDevice(
            { ...d, active: __active ?? false, lastActivityTime: __lastActivityTime ?? null },
            telemetryBag,
            __clientScope || {},
            __sharedScope || null
        );
        // OOHDASH-85 (design §5): server-side anti-flicker debounce. `dev.online` is the raw freshness
        // verdict; the debounce holds a device online for one extra poll on its FIRST *stale* read, so
        // offline is only asserted after two consecutive stale polls. A missing/unparseable report time
        // (or a failed SERVER_SCOPE read) is a HARD offline — asserted immediately, never debounced.
        const hardOffline = (__lastActivityTime ?? null) == null;
        dev.online = applyFreshnessDebounce(uuid, dev.online, now, hardOffline);
        return dev;
    });

    // OOHDASH-140: attach Tuya live state to kitchen devices
    if (tuyaListing) {
        await _attachTuya(devices, tuyaListing, { budgetMs: 3000 }).catch(err => {
            console.warn(`[TUYA] attachTuya failed for site ${key}: ${err.message}`);
        });
    }

    if (!devices.length) {
        const sites = [];
        perSiteCache.set(key, { sites, at: Date.now() });
        return sites;
    }

    // Zendesk human-name enrichment (non-fatal, mirrors bridge.js — searchSites/audit read siteName).
    let humanName = null;
    try {
        humanName = await resolveSiteName(key);
    } catch (err) {
        console.error(`[TB] Site name enrichment failed for ${key}: ${err.message}`);
    }
    // OOHDASH-114-F1: derive boilerControl field.
    // OOHDASH-136: also decode the DHW override state and attach as boilerControl.dhwOverride.
    const boilerControlRaw = matched
        .filter(d => (d.type ?? d.profile) === 'boilerControl')
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))[0] ?? null;
    let boilerControlField;
    if (boilerControlRaw) {
        if (matched.filter(d => (d.type ?? d.profile) === 'boilerControl').length > 1) {
            console.warn(`[TB] Multiple boilerControl devices for site ${key}; using ${boilerControlRaw.name}`);
        }
        const bcUuid = boilerControlRaw?.id?.id || boilerControlRaw?.id;
        const bcBag = telemetryById.get(bcUuid) || {};
        boilerControlField = deriveBoilerControl(bcBag.__sharedScope ?? null, bcBag.__clientScope ?? null, boilerControlRaw.name ?? null);
        if (!boilerControlField.isV1 && !boilerControlField.isV2) {
            console.warn(`[TB] boilerControl at site ${key} has no V1/V2 discriminator — dhwControllable=false`);
        }
        // OOHDASH-136: decode DHW override state and attach to the boilerControl object.
        boilerControlField.dhwOverride = decodeDhwOverride(
            bcBag.__sharedScope ?? null,
            bcBag.__clientScope ?? null,
            bcBag.__lastActivityTime ?? null,
            bcBag,
            bcBag.__v1OverrideHistory ?? null,
            Date.now()
        );
        // OOHDASH-139: decode live heating state and attach.
        boilerControlField.heating = decodeBoilerHeating(
            bcBag.__sharedScope ?? null,
            bcBag.__clientScope ?? null,
            bcBag.__lastActivityTime ?? bcBag.__telemLastSeenMs ?? null,
            bcBag,
            Date.now()
        );
    } else {
        boilerControlField = { present: false, isV1: false, isV2: false, heatingControllable: false, dhwControllable: false, deviceId: null, heating: null };
    }
    const accountId = `${brand}-${key}`;
    const site = {
        siteNo: key,
        siteName: humanName || accountId,
        nameUnverified: !humanName,
        accountId,
        brand: undefined,       // not sourced from TB — stays undefined pre-B2 (parity with bridge.js)
        address: undefined,
        callsLast30Days: undefined,
        devices,
        boilerControl: boilerControlField
    };
    const sites = [site];
    perSiteCache.set(key, { sites, at: Date.now() });
    return sites;
}

/* ------------------------------------------------------------------ */
/* Public API (EXACT bridge.js surface)                                 */
/* ------------------------------------------------------------------ */

/**
 * All sites (fixture mode) OR a directory-level stub set (live mode — never a full-estate pull;
 * §2.7). In live mode getSites() sources the search directory from Zendesk so search/liveness have
 * a cheap, name-searchable set without a 12k-device TB read. Throws on hard read failure — callers
 * treat that as degraded mode (fail safe to capture-and-escalate).
 */
export async function getSites() {
    try {
        let sites;
        if (config.dataMode === 'live') {
            const dir = await siteDirectory();
            sites = dir.map(d => ({
                siteNo: d.siteNo,
                siteName: d.siteName || `gk-${d.siteNo}`,
                nameUnverified: !d.siteName,
                accountId: `gk-${d.siteNo}`,
                brand: d.brand,
                address: undefined,
                callsLast30Days: undefined,
                devices: []                 // stub — full inventory is a per-site query (getSitesByNumber)
            }));
        } else {
            sites = loadFixture().sites;
        }
        lastReadOk = true;
        lastReadError = null;
        return sites;
    } catch (err) {
        lastReadOk = false;
        lastReadError = err.message;
        console.error(`[TB] Inventory read failed: ${err.message}`);
        throw err;
    }
}

/**
 * All sites matching a house number exactly (0, 1 or >1 — ambiguity preserved for resolution.js).
 * In live mode this is the per-site TB query (the real inventory read); in fixture mode it filters
 * the loaded fixture. Throws on live-read failure (degraded mode).
 */
export async function getSitesByNumber(siteNo) {
    try {
        let sites;
        if (config.dataMode === 'live') {
            sites = await fetchLiveSitesByNumber(siteNo);
        } else {
            sites = loadFixture().sites.filter(s => s.siteNo === String(siteNo));
            // OOHDASH-114-F1: ensure every fixture site has the boilerControl field.
            const defaultBc = { present: false, isV1: false, isV2: false, heatingControllable: false, dhwControllable: false, deviceId: null, heating: null };
            sites = sites.map(s => ({ ...s, boilerControl: s.boilerControl ?? defaultBc }));
            // OOHDASH-140: attach fixture Tuya data for kitchen devices that have tuyaFixture blocks
            const { attachTuya: _fixAttachTuya } = await import('./tuya-read.js').catch(() => ({ attachTuya: null }));
            if (_fixAttachTuya) {
                const OWON_FIX_IDS = new Set(['xr5kjdxfxavku0gb', 'vnxcwomqkofjhjcc']);
                for (const site of sites) {
                    const fixtureListing = (site.devices || [])
                        .filter(d => d.kind === 'kitchen' && d.tuyaFixture)
                        .map(d => {
                            const tf = d.tuyaFixture;
                            const statusArr = Array.isArray(tf.status) ? tf.status : [];
                            const getVal = code => (statusArr.find(s => s.code === code) || {}).value;
                            const pid = (tf.product_id || '').toLowerCase();
                            const model = OWON_FIX_IDS.has(pid) ? 'owon' : 'tongou';
                            const sw1 = getVal('switch_1');
                            const sw = getVal('switch');
                            let switchOn = sw1 !== undefined ? (sw1 === true || sw1 === 'true') : sw !== undefined ? (sw === true || sw === 'true') : null;
                            const cp = getVal('cur_power');
                            const powerW = model === 'tongou' && cp !== undefined ? Number(cp) / 10 : null;
                            return {
                                ...tf,
                                model,
                                switchOn,
                                powerW,
                                online: tf.online !== false,
                                readAtMs: Date.now(),
                                _preloadedSchedule: tf.schedule
                            };
                        });
                    if (fixtureListing.length > 0) {
                        await _fixAttachTuya(site.devices, fixtureListing, { budgetMs: 3000 }).catch(() => {});
                    }
                }
            }
            // OOHDASH-144 C1 fix: enrich fixture boilerControl zones with timetable so the
            // control path (dispatchBoilerBoost until-next-on) sees the same shape as the live
            // path (decodeBoilerHeating already calls zoneTimetable and attaches timetable on
            // each zone). Fixture schedules are stored under boilerControl.heating.schedules[zoneId].
            for (const site of sites) {
                const bc = site.boilerControl;
                if (bc?.heating?.zones && bc.heating.schedules) {
                    const tz = config.control?.schedule?.tz ?? 'Europe/London';
                    const now = Date.now();
                    const schedules = bc.heating.schedules;
                    const enrichedZones = bc.heating.zones.map(z => {
                        if (z.timetable != null) return z; // already set
                        const sched = z.zone ? schedules[z.zone] : null;
                        const timetable = sched ? (zoneTimetable(sched, now, tz) ?? null) : null;
                        return { ...z, timetable };
                    });
                    site.boilerControl = { ...bc, heating: { ...bc.heating, zones: enrichedZones } };
                }
            }
        }
        lastReadOk = true;
        lastReadError = null;
        return sites;
    } catch (err) {
        lastReadOk = false;
        lastReadError = err.message;
        console.error(`[TB] Site inventory read failed for ${siteNo}: ${err.message}`);
        throw err;
    }
}

/**
 * Case-insensitive search across house-number prefix and pub name. In live mode the index is the
 * Zendesk site directory (D8) — NO TB call on the search path (TB textSearch cannot do pub-name
 * search). In fixture mode it searches the loaded fixture sites. Returns the same shape/limit as
 * the old bridge.searchSites (≤12 site stubs).
 */
export async function searchSites(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    if (config.dataMode === 'live') {
        const dir = await siteDirectory();
        return dir
            .filter(d => String(d.siteNo ?? '').startsWith(q) || String(d.siteName ?? '').toLowerCase().includes(q))
            .slice(0, 12)
            .map(d => ({
                siteNo: d.siteNo,
                siteName: d.siteName || `gk-${d.siteNo}`,
                nameUnverified: !d.siteName,
                accountId: `gk-${d.siteNo}`,
                brand: d.brand,
                address: undefined,
                callsLast30Days: undefined,
                devices: []
            }));
    }
    const sites = loadFixture().sites;
    return sites
        .filter(s => String(s.siteNo ?? '').startsWith(q) || String(s.siteName ?? '').toLowerCase().includes(q))
        .slice(0, 12);
}

/**
 * Finds one device within a resolved site (opaque deviceId match — now the TB name).
 */
export async function getDevice(siteNo, deviceId) {
    const matches = await getSitesByNumber(siteNo);
    if (matches.length !== 1) return null;
    return matches[0].devices.find(d => d.deviceId === deviceId) || null;
}

/**
 * BOOLEAN health latch (§2.6) — { mode, healthy, lastError }. This is the boolean latch the degraded
 * banner (api.js), liveness.producerHealthy() and server.js consume — deliberately NOT the tri-state
 * tbStatus(). A live-read failure flips healthy:false; the getSites/getDevice reads still throw so
 * callers fail safe to capture-and-escalate.
 */
export function bridgeStatus() {
    return {
        mode: config.dataMode,
        healthy: lastReadOk,
        lastError: lastReadError
    };
}

/**
 * OOHDASH-122 (Option A): ONE-SHOT start-up read probe. Proves the TB read path with a single
 * site-independent, read-only request (list one device) so the degraded latch reflects reality
 * before any handler opens a workspace. Never throws, never retries, never blocks start-up.
 * Only writes the latch while it is still in its untouched boot state, so a real read always wins.
 */
const STARTUP_PROBE_PATH = '/api/tenant/devices?pageSize=1&page=0';
export async function probeBridgeReadOnce({ timeoutMs = 8000 } = {}) {
    if (config.dataMode !== 'live') return { outcome: 'skipped' };
    const untouched = () => lastReadOk === false && lastReadError === null;
    const started = Date.now();
    let timer;
    try {
        const timeout = new Promise(r => { timer = setTimeout(() => r('timeout'), timeoutMs); timer.unref?.(); });
        const call = readRequest('GET', STARTUP_PROBE_PATH).then(() => 'ok', err => err);
        const result = await Promise.race([call, timeout]);
        const ms = Date.now() - started;
        if (result === 'ok') {
            if (untouched()) { lastReadOk = true; lastReadError = null; }
            return { outcome: 'ok', ms };
        }
        if (result === 'timeout') {
            if (untouched()) lastReadError = `Start-up read probe timed out after ${timeoutMs}ms`;
            return { outcome: 'timeout', ms };
        }
        if (result?.response?.status === 429) return { outcome: 'rate-limited', ms };  // back off: no retry, no error
        if (untouched()) lastReadError = `Start-up read probe failed: ${result?.message || 'unknown error'}`;
        return { outcome: 'failed', ms, error: result?.message };
    } catch (err) {
        return { outcome: 'failed', error: err?.message };   // belt and braces: never throw
    } finally {
        clearTimeout(timer);
    }
}

/** Test/ops helper — clears the per-site live cache (test isolation; no bridge.js equivalent used).
 *  OOHDASH-85: also clears the freshness debounce state so poll-sequence tests start clean. */
export function _resetCache() {
    perSiteCache.clear();
    freshnessDebounce.clear();
}

/** Test helper (OOHDASH-85) — expires ONLY the per-site live cache, PRESERVING freshness-debounce
 *  state, so a test can simulate a subsequent 30s poll (fresh read) across which the debounce carries. */
export function _expireCache() {
    perSiteCache.clear();
}

/**
 * Test/introspection helper (OOHDASH-85 design §4): the resolved freshness threshold for a deviceType
 * and the default, so the unit test can pin the per-type resolution without reaching into module
 * internals. FRESHNESS_BY_TYPE stays private (empty until IoT cadence lands, design §7).
 */
export function _freshness() {
    return { defaultMs: FRESHNESS_DEFAULT_MS, thresholdFor: freshnessThresholdFor };
}
