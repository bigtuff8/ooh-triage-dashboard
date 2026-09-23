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
const ASSET_INTENT = [
    { tokens: ['salusit700', 'it700', 'salus700'], kind: 'heating', deviceType: 'salus-it700', label: 'Salus iT700' },
    { tokens: ['salusit500', 'it500', 'salus500'], kind: 'heating', deviceType: 'salus-it500', label: 'Salus iT500' },
    { tokens: ['salus'], kind: 'heating', deviceType: 'salus-it700', label: 'Salus thermostat' },
    { tokens: ['intesis', 'ac', 'aircon'], kind: 'heating', deviceType: 'intesis', label: 'Intesis AC' },
    { tokens: ['fryer', 'grill', 'bainmarie', 'potwash', 'kitchen', 'oven', 'dishwash'], kind: 'kitchen', deviceType: 'tuya', label: 'Kitchen circuit' },
    { tokens: ['powerpause', 'tongou', 'owon', 'contactor', 'switch', 'relay'], kind: 'kitchen', deviceType: 'tuya', label: 'Power circuit' },
    { tokens: ['light', 'lighting', 'lgt'], kind: 'lighting', deviceType: 'tuya', label: 'Lighting circuit' },
    { tokens: ['extractfan', 'fan', 'extractor'], kind: 'fan', deviceType: 'tuya', label: 'Extractor fan' },
    { tokens: ['gateway', 'r10a', 'dragino', 'gw'], kind: 'gateway', deviceType: 'gateway', label: 'Lighthouse gateway' }
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
    return ['switchReported', 'switchOn', 'switch_1', 'switch'].some(k => t[k] !== undefined && t[k] !== null);
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

    // 1) Capability from telemetry signals first (control-eligibility, never profile).
    let intent = null;
    if (hasSwitchSignal(telemetry)) {
        intent = { kind: 'kitchen', deviceType: 'tuya', label: 'Tuya switch', control: { attribute: 'switchDesired', type: 'boolean' } };
    } else if (hasSetpointSignal(telemetry)) {
        // Setpoint present → a thermostat/AC. Refine the deviceType by the name asset token below;
        // default to salus-it700 (the dominant heating controller).
        intent = { kind: 'heating', deviceType: 'salus-it700', label: 'Salus thermostat', control: { attribute: 'setpointDesired', type: 'number' } };
    }

    // 2) Asset-token intent from the (typo-corrected) name — refines/sets deviceType + kind.
    const nameIntent = matchAssetIntent(tokens);
    if (nameIntent) {
        if (intent) {
            // Telemetry says controllable; let the name refine the specific deviceType/label when
            // it agrees on a control family (heating→salus/intesis; switch→tuya).
            if (intent.deviceType === 'tuya' && nameIntent.deviceType === 'tuya') {
                intent = { ...intent, kind: nameIntent.kind, label: nameIntent.label };
            } else if (intent.control?.attribute === 'setpointDesired' && ['salus-it700', 'salus-it500', 'intesis'].includes(nameIntent.deviceType)) {
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
    if (control?.attribute === 'switchDesired') controllable = true;
    else if (control?.attribute === 'setpointDesired') controllable = hasSetpointSignal(telemetry);
    if (!controllable) control = null;

    return {
        kind: intent.kind,
        deviceType: intent.deviceType,
        deviceTypeLabel: intent.label,
        controllable,
        control
    };
}

/** Matches name tokens to an ASSET_INTENT row — exact substring, typo-map, then bounded fuzzy. */
function matchAssetIntent(tokens) {
    const corrected = tokens.map(t => TYPO_MAP[t] || t);
    // Exact / substring pass. Tiny asset tokens (≤3 chars: ac/gw/fan/lgt) only ever match on EXACT
    // token equality — substring-matching them bleeds (`extractfan` contains `ac`, `gw` etc.).
    for (const row of ASSET_INTENT) {
        for (const at of row.tokens) {
            const exactOnly = at.length <= 3;
            if (corrected.some(t => t === at || (!exactOnly && (t.includes(at) || at.includes(t))))) return row;
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
        heatingSetpoint: num(t.heatingSetpoint ?? t.setpoint ?? t.setpointC),
        mode: t.mode,
        heatingActive: t.heatingActive,
        coolingActive: t.coolingActive,
        hotWater: t.hotWater,
        hwBoostHours: num(t.hwBoostHours),
        roomSensor1Temp: num(t.roomSensor1Temp),
        output1State: t.output1State
    };
    // Switch normalisation — trust switchReported first (present ⇒ fresh bridge echo), then
    // switchOn (always present), never a bare stale switch_1 first.
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
    if (t.switchReported !== undefined && t.switchReported !== null) return toBool(t.switchReported);
    if (t.switchOn !== undefined && t.switchOn !== null) return toBool(t.switchOn);
    if (t.switch_1 !== undefined && t.switch_1 !== null) return toBool(t.switch_1);
    return undefined;
}

/* ------------------------------------------------------------------ */
/* TB device → canonical device shape (§2.2)                            */
/* ------------------------------------------------------------------ */

/**
 * Maps one TB device entity (+ its latest telemetry) to the canonical device shape. deviceId is the
 * TB NAME (corrective fix, C8). `zone` is the human location label the device carries (TB `label`
 * or a `zone`/`site` attribute), matching the old per-device zone semantics.
 */
export function mapTbDevice(raw, telemetryBag) {
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
        hotWaterCapable: telemetry.hotWater != null,
        online: raw.isOnline ?? raw.active ?? false,
        telemetry,
        schedule: null,
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

async function fetchTbDevicesForToken(brand, token) {
    const collected = [];
    let page = 0;
    let hasNext = true;
    while (hasNext && page < TB_PAGE_CAP) {
        const { data, hasNext: more } = await fetchTbDevicePage(`${brand}-${token}`, page);
        collected.push(...data);
        hasNext = more;
        page += 1;
    }
    return collected;
}

/** SERVER_SCOPE `active` array → boolean (OOHDASH-80). Any unexpected shape ⇒ false (fail-safe). */
function parseActive(attrs) {
    const v = attrs ? attrs.active : undefined;
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1 || v === '1') return true;
    return false;
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
        // Dispatch both reads concurrently; settle independently so one failing never fails the other.
        const [tsRes, activeRes] = await Promise.allSettled([
            readRequest('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries`),
            readServerScopeAttributes(uuid, 'active,lastActivityTime')
        ]);
        const bag = {};
        if (tsRes.status === 'fulfilled') {
            // TB shape: { key: [{ ts, value }] } → flatten to { key: value }.
            for (const [k, series] of Object.entries(tsRes.value || {})) {
                if (Array.isArray(series) && series.length) bag[k] = series[0].value;
            }
        } else {
            console.error(`[TB] Telemetry read failed for device ${uuid}: ${tsRes.reason?.message}`);
        }
        if (activeRes.status === 'fulfilled') {
            bag.__active = parseActive(activeRes.value);
        } else {
            // Fail-safe: a SERVER_SCOPE read failure degrades this device to offline, never the site.
            console.error(`[TB] SERVER_SCOPE active read failed for device ${uuid}: ${activeRes.reason?.message}`);
            bag.__active = false;
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

    // Over-fetch a broad prefix per token, paginate, dedupe by TB id.
    const byId = new Map();
    for (const token of tokens) {
        const raw = await fetchTbDevicesForToken(brand, token);
        for (const d of raw) {
            const id = d?.id?.id || d?.id || d?.name;
            if (!byId.has(id)) byId.set(id, d);
        }
    }

    // Client-side anchored filter (defeats bleed AND split-loss).
    const matched = [...byId.values()].filter(d => filter.test(normaliseName(d.name)));

    // Latest telemetry for the matched set.
    const telemetryById = await fetchTelemetry(matched);

    const devices = matched.map(d => {
        const uuid = d?.id?.id || d?.id;
        const bag = telemetryById.get(uuid) || {};
        // OOHDASH-80: source `online` from the SERVER_SCOPE `active` read stashed in the bag, then
        // strip the private key so it never leaks into the canonical telemetry{} shape.
        const { __active, ...telemetryBag } = bag;
        return mapTbDevice({ ...d, active: __active ?? false }, telemetryBag);
    });

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
    const accountId = `${brand}-${key}`;
    const site = {
        siteNo: key,
        siteName: humanName || accountId,
        nameUnverified: !humanName,
        accountId,
        brand: undefined,       // not sourced from TB — stays undefined pre-B2 (parity with bridge.js)
        address: undefined,
        callsLast30Days: undefined,
        devices
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

/** Test/ops helper — clears the per-site live cache (test isolation; no bridge.js equivalent used). */
export function _resetCache() {
    perSiteCache.clear();
}
