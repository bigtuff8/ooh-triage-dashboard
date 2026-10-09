# OOHDASH-114 F1 — Fix Heating and Hot-Water Controllability

Design artefact. Author: Design doer. Date: 2026-10-09.

---

## Summary

The hot-water controllability tile (`hotwater`) and the heating controllability tile (`heating`) both
return the wrong scope level for every production site. The root cause is a broken predicate:
`hasControllableDhw()` tests for a device type (`salus-it500-dhw`) that the live bridge never emits,
so `hotwater` is always `none`. The heating level function tests for a device type that does not
exist in the live device inventory (`boiler-panel`), but more critically neither `heating` nor
`hotwater` uses the authoritative TB source for controllability — the `boilerControl` device's shared
attributes — which Sam Day has specified as the correct check for approximately 209 sites.

This design replaces both predicates with Sam's authoritative V1/V2 logic: detect the `boilerControl`
device via its `toRestaurant` relation, read `subBrand`, `output1OutputMask`, and `DHW.use_boiler`
from its TB shared attributes, and expose a `boilerControl` summary object on the workspace payload
that both server-side scope functions and the frontend DHW flow consume.

**Cost/token-efficiency:** All changes are request-time reads on an already-open TB read session (one
additional `SHARED_SCOPE` read per workspace fetch for the `boilerControl` device). No polling, no
background work, no new processes. Token spend: zero (no LLM calls involved). Marginal cost: one
extra HTTP GET to ThingsBoard per site confirm/refresh, which is negligible alongside the existing
per-device telemetry fan-out.

**Silent running:** Nothing in this change is continuous or background. The workspace refresh already
runs on a 30-second browser pull; this adds one synchronous read within that path. No console
windows, no background processes, no idle token consumption.

---

## Root Cause (Confirmed)

**File:** `routes/api.js`, lines 120–121.

```js
// Current — BROKEN
export function hasControllableDhw(site) {
    return site.devices.some(d => (registry.capabilitiesFor(d.deviceType)?.commands || []).includes('hwboost'));
}
```

`registry.capabilitiesFor('salus-it500-dhw')` returns `hwboost`. But `services/bridge.js` (now a
re-export shim of `services/tb-device.js`) never emits a device with `deviceType === 'salus-it500-dhw'`
from live ThingsBoard inventory. `tb-device.js` classifies devices by name-token and telemetry
signal; no device name in the live estate produces the `salus-it500-dhw` device type. Therefore
`hasControllableDhw()` returns `false` for every live site, and the `hotwater` scope level is always
`none`.

Additionally, the `heating` scope level function (line 137) tests for `deviceType !== 'boiler-panel'`,
which is not emitted by the live classifier either. The intent of the `boiler-panel` exception is to
exclude sites whose only "heating" device is a boiler panel (read-only), but this check is
unreachable in production because `boiler-panel` is never produced.

Sam Day's authoritative spec replaces both of these with a single unified check based on the
`boilerControl` device found via its `toRestaurant` relation to the site asset.

---

## How the `boilerControl` Device Is Identified

### ThingsBoard relation query

ThingsBoard exposes a REST endpoint to fetch incoming relations for an entity:

```
GET /api/relations?fromId={entityId}&fromType=ASSET&relationType=toRestaurant&relationTypeGroup=COMMON
```

Where `{entityId}` is the TB UUID of the site asset (not a device). This returns an array of
relation objects. Each object carries `to.id` (the UUID of the related entity) and `to.entityType`.

Alternatively, the inverse: fetch relations TO the device (incoming relations where the site asset is
the source):

```
GET /api/relations?toId={deviceUuid}&toType=DEVICE&relationType=toRestaurant&relationTypeGroup=COMMON
```

However, the correct approach for this use case is to query from the site asset outward and filter
for devices with profile `boilerControl`. This requires knowing the site asset UUID.

**Practical approach:** The TB device inventory query (`/api/tenant/devices?textSearch=gk-{siteNo}`)
already returns all devices for the site. The `boilerControl` device is one of these — its name
follows the pattern `gk-{siteNo}-boilercontrol-{n}` and its TB `type` (profile) is `boilerControl`.
Rather than a separate relation API call, we identify the `boilerControl` device by profile from the
already-fetched device list, then verify it has a `toRestaurant` inbound relation from the site
asset as a secondary check.

**Design decision:** Identify the `boilerControl` device by TB `type === 'boilerControl'` from the
existing `matched` device set in `fetchLiveSitesByNumber` (tb-device.js line 818). This avoids a
separate relation-query round trip. The relation check is deferred to the shared-attribute read step:
if the device is present and classifies correctly, it is the `boilerControl` device. This is
consistent with how site 6123 is described (device `gk-6123-boilercontrol-1`, profile `boilerControl`).

**Open question OQ-1:** Sam's spec says "inbound `toRestaurant` relation from site asset." If
multiple sites could share a `boilerControl` device (unlikely but architecturally possible), the
relation check would disambiguate. For now, profile-match on `boilerControl` within the site's
device set is the primary identifier. Spencer should confirm whether a relation check is strictly
needed or whether profile is sufficient (see Build prerequisite below).

---

## How Shared Attributes Are Fetched

### Current pattern

`fetchTelemetry()` in `tb-device.js` (lines 751–796) runs three concurrent reads per device:

1. Latest timeseries (`/api/plugins/telemetry/DEVICE/{uuid}/values/timeseries`)
2. SERVER_SCOPE attributes (`active`, `lastActivityTime`)
3. CLIENT_SCOPE attributes (`site`, `salusLocation`)

Each is read via the existing `readServerScopeAttributes` and `readClientScopeAttributes` functions
in `tb-client.js`. These fold the TB array response `[{ key, value, lastUpdateTs }]` into a plain
`{ key: value }` map.

### What is needed: SHARED_SCOPE

`subBrand`, `output1OutputMask`, and `DHW.use_boiler` live in ThingsBoard **SHARED_SCOPE** (shared
attributes). These are distinct from SERVER_SCOPE (server-set) and CLIENT_SCOPE (device-set). The
existing `readDesiredState` in `tb-client.js` (line 312) already reads SHARED_SCOPE for a single
key; it uses:

```
GET /api/plugins/telemetry/DEVICE/{uuid}/values/attributes/SHARED_SCOPE?keys={key}
```

### New function: `readSharedScopeAttributes`

A new exported function must be added to `tb-client.js`, parallel in structure to the existing
`readServerScopeAttributes` and `readClientScopeAttributes`:

```js
export async function readSharedScopeAttributes(uuid, keys) {
    const attrs = await readSession.request(
        'GET',
        `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SHARED_SCOPE?keys=${encodeURIComponent(keys)}`
    );
    const out = {};
    for (const row of Array.isArray(attrs) ? attrs : []) {
        if (row && row.key !== undefined) out[row.key] = row.value;
    }
    return out;
}
```

### Where it is called

In `tb-device.js`, the `fetchTelemetry` function runs a `Promise.allSettled` fan-out per device.
For the `boilerControl` device specifically, a fourth concurrent read is added to this fan-out:

```js
readSharedScopeAttributes(uuid, 'subBrand,output1OutputMask,DHW.use_boiler')
```

This is gated: the extra read fires ONLY when the device's TB `type` (profile) is `boilerControl`,
so no extra round trip is added for any of the other 20+ devices at a site. The result is stashed
under `__sharedScope` in the bag alongside `__active`, `__clientScope`, etc., and stripped before
passing to `mapTbDevice`.

**Alternative considered:** Do the boilerControl shared-attribute read inside `workspacePayload`
(routes/api.js) rather than in the tb-device fetch fan-out. This is simpler but breaks the
established pattern (tb-device.js owns all TB reads; api.js consumes already-assembled site shapes).
The fan-out approach is architecturally consistent and adds no serial latency.

---

## Backend Changes

### 1. `services/tb-client.js` — new exported function

**After line 151** (after `readClientScopeAttributes`), add:

```js
/**
 * Reads SHARED_SCOPE attributes for a device by TB UUID (read plane, OOHDASH-114-F1).
 * Used by tb-device.js to source boilerControl controllability attributes:
 * `subBrand`, `output1OutputMask`, and `DHW.use_boiler`.
 * Read-only by contract; no write session touched.
 */
export async function readSharedScopeAttributes(uuid, keys) {
    const attrs = await readSession.request(
        'GET',
        `/api/plugins/telemetry/DEVICE/${uuid}/values/attributes/SHARED_SCOPE?keys=${encodeURIComponent(keys)}`
    );
    const out = {};
    for (const row of Array.isArray(attrs) ? attrs : []) {
        if (row && row.key !== undefined) out[row.key] = row.value;
    }
    return out;
}
```

No other changes to `tb-client.js`.

---

### 2. `services/tb-device.js` — lazy import + fan-out + site assembly

#### 2a. New lazy import (after line 60, alongside `readClientScopeAttributes`)

```js
async function readSharedScopeAttributes(uuid, keys) {
    const mod = await import('./tb-client.js');
    return mod.readSharedScopeAttributes(uuid, keys);
}
```

#### 2b. `fetchTelemetry` — add conditional fourth read for boilerControl devices

**Current** (line 760):
```js
const [tsRes, activeRes, clientScopeRes] = await Promise.allSettled([
    readRequest('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries`),
    readServerScopeAttributes(uuid, 'active,lastActivityTime'),
    readClientScopeAttributes(uuid, 'site,salusLocation')
]);
```

**Replace with:**
```js
const isBoilerControl = (d.type ?? d.profile) === 'boilerControl';
const reads = [
    readRequest('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries`),
    readServerScopeAttributes(uuid, 'active,lastActivityTime'),
    readClientScopeAttributes(uuid, 'site,salusLocation'),
    isBoilerControl
        ? readSharedScopeAttributes(uuid, 'subBrand,output1OutputMask,DHW.use_boiler')
        : Promise.resolve(null)
];
const [tsRes, activeRes, clientScopeRes, sharedScopeRes] = await Promise.allSettled(reads);
```

Then after the `clientScopeRes` handling block (around line 792):
```js
// OOHDASH-114-F1: stash boilerControl shared attributes for the workspace payload.
// Only populated when the device is a boilerControl; null/empty for all others.
if (isBoilerControl) {
    if (sharedScopeRes.status === 'fulfilled' && sharedScopeRes.value !== null) {
        bag.__sharedScope = sharedScopeRes.value || {};
    } else {
        console.error(`[TB] SHARED_SCOPE read failed for boilerControl ${uuid}: ${sharedScopeRes.reason?.message}`);
        bag.__sharedScope = {};
    }
} else {
    bag.__sharedScope = null;   // non-boilerControl: explicitly null, never undefined
}
```

#### 2c. `fetchLiveSitesByNumber` — strip `__sharedScope` and pass it to site assembly

**Current destructuring** (line 833):
```js
const { __active, __clientScope, __lastActivityTime, ...telemetryBag } = bag;
```

**Replace with:**
```js
const { __active, __clientScope, __lastActivityTime, __sharedScope, ...telemetryBag } = bag;
```

The `__sharedScope` value (or `null` for non-boilerControl devices) is collected into a separate
parallel structure in `fetchLiveSitesByNumber`. After the `devices` array is assembled, compute the
`boilerControl` site-level field:

```js
// OOHDASH-114-F1: assemble the boilerControl site field from the boilerControl device's shared attrs.
// The boilerControl device is identified by TB profile 'boilerControl' within this site's device set.
// One such device is expected per site; if multiple or zero are found, behaviour degrades gracefully.
const boilerControlEntry = matched
    .map((d, i) => {
        const uuid = d?.id?.id || d?.id;
        const bag = telemetryById.get(uuid) || {};
        return { d, sharedScope: bag.__sharedScope };
    })
    .find(({ d }) => (d.type ?? d.profile) === 'boilerControl');

const boilerControlField = deriveBoilerControl(boilerControlEntry?.sharedScope ?? null);
```

And the `site` object gains `boilerControl: boilerControlField`.

#### 2d. New pure function `deriveBoilerControl` (add near `deriveArea`)

```js
/**
 * Derives the boilerControl workspace field from the boilerControl device's SHARED_SCOPE attributes.
 * Called once per site assembly; returns a plain object consumed by routes/api.js scope functions
 * and workspacePayload. Pure and side-effect-free.
 *
 * Sam Day spec (2026-10, OOHDASH-114-F1):
 *   subBrand 'flaming_grill'     → V1 (~137 Flaming Grill sites)
 *   subBrand 'chef'|'brewer'    → V2 (~72 Café & Bar sites)
 *   heatingControllable (both)  → boilerControl device present (implied by being called with non-null)
 *   dhwControllable V2          → DHW.use_boiler === true
 *   dhwControllable V1          → output1OutputMask[3] === true (4-element array, index 3 = DHW relay)
 *
 * @param {object|null} shared  the SHARED_SCOPE { key: value } map for the boilerControl device,
 *                              or null when no boilerControl device is present at this site.
 * @returns {{ present: boolean, subBrand: string|null, heatingControllable: boolean, dhwControllable: boolean }}
 */
export function deriveBoilerControl(shared) {
    if (!shared) {
        return { present: false, subBrand: null, heatingControllable: false, dhwControllable: false };
    }
    const subBrand = shared.subBrand ?? null;
    const isV2 = subBrand === 'chef' || subBrand === 'brewer';
    const isV1 = subBrand === 'flaming_grill';

    let dhwControllable = false;
    if (isV2) {
        // V2: DHW.use_boiler shared attribute must be truthy
        const dhwAttr = shared['DHW.use_boiler'];
        dhwControllable = dhwAttr === true || dhwAttr === 'true' || dhwAttr === 1 || dhwAttr === '1';
    } else if (isV1) {
        // V1: output1OutputMask[3] must be truthy (4-element array, index 3 = DHW relay)
        const mask = shared.output1OutputMask;
        if (Array.isArray(mask) && mask.length >= 4) {
            dhwControllable = !!mask[3];
        }
    }
    // Unknown subBrand: heatingControllable remains true (boilerControl device IS present),
    // dhwControllable defaults false (safest: don't offer a control we can't verify).

    return {
        present: true,
        subBrand,
        heatingControllable: true,   // presence of the boilerControl device implies heating is controllable
        dhwControllable
    };
}
```

#### 2e. Expose `boilerControl` on the canonical `site` shape

In `fetchLiveSitesByNumber`, after assembling the `site` object, add:

```js
site.boilerControl = boilerControlField;
```

The fixture path (`loadFixture()`) must also set `boilerControl` on each fixture site. Fixture sites
that have a boilerControl device (new fixture entries, see Test Spec below) set it explicitly;
existing fixture sites without a boilerControl device default to the `present: false` shape. The
fixture serving path in `getSitesByNumber` returns fixture sites verbatim, so the field must be
pre-computed in the fixture JSON or added in a shim when serving — the simplest approach is a shim
in `getSitesByNumber` for fixture mode:

```js
// Fixture: ensure every site has the boilerControl field (absent from legacy fixture JSON)
sites = sites.map(s => ({
    ...s,
    boilerControl: s.boilerControl ?? { present: false, subBrand: null, heatingControllable: false, dhwControllable: false }
}));
```

---

### 3. `routes/api.js` — replace `hasControllableDhw` and update `SCOPE_GROUPS`

#### 3a. Replace `hasControllableDhw` (lines 115–122)

**Before:**
```js
// A DHW device is CONTROLLABLE only if live inventory carries a device whose
// registry contract actually exposes a hot-water control command (`hwboost`) — ...
export function hasControllableDhw(site) {
    return site.devices.some(d => (registry.capabilitiesFor(d.deviceType)?.commands || []).includes('hwboost'));
}
```

**After:**
```js
// OOHDASH-114-F1: DHW controllability is now derived from the boilerControl device's shared
// attributes (Sam Day spec). The old registry-capability path tested for 'salus-it500-dhw'
// which live TB never emits (bridge.js:57-67 / tb-device.js classifier). The new path reads
// the authoritative TB attributes: V2 = DHW.use_boiler; V1 = output1OutputMask[3].
export function hasControllableDhw(site) {
    return !!(site.boilerControl?.dhwControllable);
}
```

The existing `hasHotWaterSignal(site)` function (lines 123–127) is unchanged — it continues to
provide the `mon` fallback for sites with a combi boiler signal.

#### 3b. Update `SCOPE_GROUPS` heating level function (line 137)

**Before:**
```js
{ key: 'heating', label: 'Heating', level: s => s.devices.some(d => d.kind === 'heating' && d.deviceType !== 'boiler-panel') ? 'ctl' : s.devices.some(d => d.kind === 'heating') ? 'mon' : 'none' },
```

**After:**
```js
// OOHDASH-114-F1: heating is controllable when the site has a boilerControl device present
// (as identified by the toRestaurant relation and boilerControl TB profile). The old 'boiler-panel'
// exclusion was unreachable in production (that deviceType is never emitted by the live classifier).
// Falls back to device-presence for sites without a boilerControl device (mon if any heating device,
// none if none).
{ key: 'heating', label: 'Heating', level: s => s.boilerControl?.heatingControllable ? 'ctl' : s.devices.some(d => d.kind === 'heating') ? 'mon' : 'none' },
```

#### 3c. `hotwater` level function (line 138) — unchanged structurally

The hotwater level function already calls `hasControllableDhw(s)`, which is replaced above. No
change to line 138 itself.

#### 3d. `workspacePayload` — add `boilerControl` to the returned object (lines 146–167)

**After the `scope` line**, add:

```js
boilerControl: site.boilerControl ?? { present: false, subBrand: null, heatingControllable: false, dhwControllable: false },
```

The `workspacePayload` return object becomes:

```js
return {
    site: { ... },
    devices: site.devices.map(d => ({ ... })),
    scope: SCOPE_GROUPS.map(g => ({ key: g.key, label: g.label, level: g.level(site) })),
    anyOffline: ...,
    tickets,
    degraded: ...,
    boilerControl: site.boilerControl ?? { present: false, subBrand: null, heatingControllable: false, dhwControllable: false }
};
```

---

## Frontend Changes

### `public/js/flows.js` — hotwater flow, stage 0 (lines 507–517)

The `hotwater` flow's stage-0 branch uses `ws.devices.find(d => ...)` to locate a controllable DHW
device. With the new design, the workspace carries `ws.boilerControl.dhwControllable` directly.

**Before (line 507):**
```js
const dhw = ws.devices.find(d => (d.capabilities || []).includes('hwboost'));
```

**After:**
```js
// OOHDASH-114-F1: DHW controllability is now determined by the boilerControl workspace field
// (Sam Day spec — V1/V2 shared-attribute check). The old devices.find was testing for a device
// type that live inventory never emits. ws.boilerControl is always present (defaulted server-side).
const dhw = ws.boilerControl?.dhwControllable ? ws.boilerControl : null;
```

The remainder of the `hotwater` stage-0 branch (lines 508–517) tests `if (!dhw)` and `if (!dhw.online)`.
The second check (`dhw.online`) is not applicable to the `boilerControl` object — the boilerControl
device's online status is not directly surfaced in the workspace field. **Design decision:** remove
the `dhw.online` offline branch from the DHW flow, because:

1. The `scope.hotwater.level` is already set to `ctl` or `none`/`mon` server-side; if the boilerControl
   device is offline the operator has already been routed through the connectivity flow.
2. The `boilerControl` object does not carry an `online` flag (it is a controllability summary, not
   a device record).

The stage-0 offline branch (line 513: `if (!dhw.online) { f.cat = 'connectivity'; ... }`) is removed.

**Revised stage-0 block:**
```js
hotwater(ws, f) {
    // OOHDASH-114-F1: controllability from boilerControl workspace field, not device capabilities.
    const dhw = ws.boilerControl?.dhwControllable ? ws.boilerControl : null;
    if (f.stage === 0) {
        if (!dhw) {
            doneLine('Hot water not controllable here — capture & escalate');
            return `<div class="alert info">Hot water is not controllable from here — it's boiler-side, not on a boostable Lighthouse device. Capture the details and escalate.</div><div class="chips"><button class="chip" onclick="flowStep({cap:1})">Capture &amp; escalate</button><button class="chip" onclick="flowStep({sc:1})">Scope guidance (boiler fault?)</button></div>`;
        }
        doneLine('Live read: boiler DHW controllable via Lighthouse');
        return `<div class="zoneread"><span style="font-size:22px">🚿</span><div><div><b>Hot water control</b> — DHW boost available</div><div class="small">${dhw.subBrand === 'flaming_grill' ? 'V1 — Flaming Grill boiler panel' : 'V2 — Café &amp; Bar boiler panel'}</div></div><span class="tag green">controllable</span></div>
<div class="stepq">Boost the hot water now?</div><div class="chips"><button class="chip" data-testid="hw-boost-yes" onclick="flowStep({boost:1})">Yes — set a boost</button><button class="chip" onclick="flowStep({cap:1})">No — capture &amp; escalate</button></div>`;
    }
    // stage 1 — boost dispatch or capture
```

**Stage-1 block** (lines 519–541): the `dhwDev` lookup on line 520 also uses the old capabilities
search. Replace:

```js
// Before (line 520):
const dhwDev = ws.devices.find(d => (d.capabilities || []).includes('hwboost'));
```

```js
// After:
const dhwDev = ws.boilerControl?.dhwControllable ? ws.boilerControl : null;
```

Note: `openControl(dhwDev, 'boost')` at line 524 currently expects a device object with `deviceId`.
Since `ws.boilerControl` is a summary object (not a canonical device), the boost dispatch path must
be reconsidered. **Design decision:** the `boilerControl` field should include the `deviceId` (the
TB device name, e.g. `gk-6123-boilercontrol-1`) so the control path can resolve it. Add `deviceId`
to the `boilerControl` workspace field (see schema below).

---

## New `workspacePayload.boilerControl` Field Specification

```
boilerControl: {
    present:             boolean    — true when a boilerControl-profile device was found for this site
    deviceId:            string     — the TB device name (e.g. "gk-6123-boilercontrol-1"), or null when present=false
    subBrand:            string     — "flaming_grill" | "chef" | "brewer" | null (null = unknown/absent)
    heatingControllable: boolean    — true when present=true (presence implies heating control)
    dhwControllable:     boolean    — true when V2 DHW.use_boiler=true, OR V1 output1OutputMask[3]=true
}
```

The `deviceId` field allows the frontend to call `openControl` with the boilerControl device if the
boost path is ever wired up. It is also useful for diagnostics and future extension.

### `deriveBoilerControl` updated signature

`deriveBoilerControl(shared, deviceName)` — add `deviceName` as the second parameter (the raw TB
device `name` field, from the matched device entry). This is the same name already in scope during
`fetchLiveSitesByNumber` assembly.

---

## Build Prerequisite — Spencer TB Verification

**Before any build work begins**, Spencer Thompson must verify that the following shared attributes
exist and are populated on the `boilerControl` device at the four reference sites:

| Site | Expected subBrand | Attributes to verify |
|------|------------------|----------------------|
| 6097 | tbc              | `subBrand`, `output1OutputMask` (if V1) or `DHW.use_boiler` (if V2) |
| 6769 | tbc              | `subBrand`, `output1OutputMask` (if V1) or `DHW.use_boiler` (if V2) |
| 5208 | tbc              | `subBrand`, `output1OutputMask` (if V1) or `DHW.use_boiler` (if V2) |
| 6164 | tbc              | `subBrand`, `output1OutputMask` (if V1) or `DHW.use_boiler` (if V2) |

Spencer should also confirm:
1. The attribute key spelling `output1OutputMask` is exactly as written (not camelCase variations).
2. `DHW.use_boiler` with a dot in the key name is correct — ThingsBoard supports dots in attribute
   keys but the URL-encoded form must be `DHW.use_boiler` (not `DHW_use_boiler` or similar).
3. Whether the `toRestaurant` relation check is necessary to uniquely identify the `boilerControl`
   device, or whether `type === 'boilerControl'` within the site's device set is sufficient.
4. The `output1OutputMask` value format: is it stored as a JSON array (`[false, false, false, true]`)
   or as a comma-separated string (`"false,false,false,true"`)? The parse logic must match.

**Build is blocked on this verification.** Do not implement the shared-attribute read until Spencer
confirms the attribute names and formats are live on at least one of the four sites.

---

## Test Spec

### Unit tests (add to `test/hotwater-scope.test.js` or new `test/boilercontrol-scope.test.js`)

These use the same vm-sandbox and bridge-intercept pattern as the existing hotwater-scope tests.

**Test BC-1: V2 site with DHW.use_boiler = true → hotwater scope level is 'ctl'**

Setup: inject a fixture site that carries a `boilerControl` field with
`{ present: true, deviceId: 'gk-9001-boilercontrol-1', subBrand: 'chef', heatingControllable: true, dhwControllable: true }`.
Assert: `SCOPE_GROUPS.find(g => g.key === 'hotwater').level(site) === 'ctl'`.

**Test BC-2: V1 site with output1OutputMask[3] = true → hotwater scope level is 'ctl'**

Setup: inject a fixture site with `boilerControl: { present: true, deviceId: 'gk-9002-boilercontrol-1', subBrand: 'flaming_grill', heatingControllable: true, dhwControllable: true }`.
Assert: `SCOPE_GROUPS.find(g => g.key === 'hotwater').level(site) === 'ctl'`.

**Test BC-3: site with no boilerControl device → hotwater scope level is 'none' (or 'mon' if combi)**

Setup: fixture site with `boilerControl: { present: false, subBrand: null, heatingControllable: false, dhwControllable: false }` and no `hotWaterCapable` devices.
Assert: `level === 'none'`.

**Test BC-4: site with boilerControl present → heating scope level is 'ctl'**

Setup: same V2 fixture as BC-1.
Assert: `SCOPE_GROUPS.find(g => g.key === 'heating').level(site) === 'ctl'`.

**Test BC-5: site without boilerControl → heating scope level is 'mon' when heating devices present**

Setup: fixture site with no `boilerControl` but with salus-it500 heating devices.
Assert: `level === 'mon'`.

**Test BC-6: `deriveBoilerControl` unit — V1 mask parsing**

Direct unit test of `deriveBoilerControl`. Input: `{ subBrand: 'flaming_grill', output1OutputMask: [false, false, false, true] }`. Assert: `dhwControllable === true`.
Input: `{ subBrand: 'flaming_grill', output1OutputMask: [false, false, false, false] }`. Assert: `dhwControllable === false`.
Input: `{ subBrand: 'flaming_grill', output1OutputMask: [true, true, true] }` (only 3 elements). Assert: `dhwControllable === false` (array too short).

**Test BC-7: `deriveBoilerControl` unit — V2 DHW flag parsing**

Input: `{ subBrand: 'chef', 'DHW.use_boiler': true }`. Assert: `dhwControllable === true`.
Input: `{ subBrand: 'brewer', 'DHW.use_boiler': false }`. Assert: `dhwControllable === false`.
Input: `{ subBrand: 'chef', 'DHW.use_boiler': 'true' }` (string). Assert: `dhwControllable === true` (toBool normalisation).

**Test BC-8: `deriveBoilerControl` unit — unknown subBrand defaults to dhwControllable=false**

Input: `{ subBrand: 'unknown_brand' }`. Assert: `dhwControllable === false`, `heatingControllable === true`, `present === true`.

**Test BC-9: null input → all-false output**

Input: `null`. Assert: `{ present: false, subBrand: null, heatingControllable: false, dhwControllable: false }`.

### Playwright e2e tests (new `tests/boilercontrol.spec.js`)

Three fixture sites are needed (add to `data/fixtures/bridge-devices.json`):

**Fixture site 9001** — V2 site (Chef & Brewer), DHW controllable:
```json
{
  "siteNo": "9001",
  "siteName": "Test Chef Brewer (V2 DHW)",
  "brand": "Greene King · Chef & Brewer",
  "address": "Test fixture",
  "callsLast30Days": 0,
  "boilerControl": {
    "present": true,
    "deviceId": "gk-9001-boilercontrol-1",
    "subBrand": "chef",
    "heatingControllable": true,
    "dhwControllable": true
  },
  "devices": [
    { "deviceId": "gk-9001-boilercontrol-1", "zone": "Boiler panel", "deviceType": "boilerControl", "kind": "heating", "online": true, "telemetry": {} },
    { "deviceId": "gk-9001-salusit700", "zone": "Accommodation", "deviceType": "salus-it700", "kind": "heating", "area": "Accommodation", "online": true, "telemetry": { "localTemperature": 18.0, "heatingSetpoint": 20 } }
  ]
}
```

**Fixture site 9002** — V1 site (Flaming Grill), DHW controllable:
```json
{
  "siteNo": "9002",
  "siteName": "Test Flaming Grill (V1 DHW)",
  "brand": "Greene King · Flaming Grill",
  "address": "Test fixture",
  "callsLast30Days": 0,
  "boilerControl": {
    "present": true,
    "deviceId": "gk-9002-boilercontrol-1",
    "subBrand": "flaming_grill",
    "heatingControllable": true,
    "dhwControllable": true
  },
  "devices": [
    { "deviceId": "gk-9002-boilercontrol-1", "zone": "Boiler panel", "deviceType": "boilerControl", "kind": "heating", "online": true, "telemetry": {} },
    { "deviceId": "gk-9002-salusit700", "zone": "Accommodation", "deviceType": "salus-it700", "kind": "heating", "area": "Accommodation", "online": true, "telemetry": { "localTemperature": 18.0, "heatingSetpoint": 20 } }
  ]
}
```

**Fixture site 9003** — no boilerControl device:
```json
{
  "siteNo": "9003",
  "siteName": "Test No BoilerControl",
  "brand": "Greene King · Farmhouse Inns",
  "address": "Test fixture",
  "callsLast30Days": 0,
  "boilerControl": {
    "present": false,
    "deviceId": null,
    "subBrand": null,
    "heatingControllable": false,
    "dhwControllable": false
  },
  "devices": [
    { "deviceId": "gk-9003-salusit500-1", "zone": "Bar", "deviceType": "salus-it500", "kind": "heating", "area": "Bar/Restaurant", "online": true, "telemetry": { "localTemperature": 18.0, "heatingSetpoint": 20 } }
  ]
}
```

**E2E test BC-E1: V2 site (9001) — hotwater tile shows 'ctl'**

```js
test('BC-E1: V2 site with DHW.use_boiler=true shows hotwater as ctl', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '9001', 'Test Chef Brewer (V2 DHW)');
    await expect(page.locator('[data-testid="tile-hotwater"]')).toContainText('Controllable from here');
});
```

**E2E test BC-E2: V1 site (9002) — hotwater tile shows 'ctl'**

```js
test('BC-E2: V1 site with output1OutputMask[3]=true shows hotwater as ctl', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '9002', 'Test Flaming Grill (V1 DHW)');
    await expect(page.locator('[data-testid="tile-hotwater"]')).toContainText('Controllable from here');
});
```

**E2E test BC-E3: no boilerControl (9003) — hotwater tile shows 'none'**

```js
test('BC-E3: site with no boilerControl shows hotwater as none', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '9003', 'Test No BoilerControl');
    await expect(page.locator('[data-testid="tile-hotwater"]')).toContainText('not controllable here');
});
```

**E2E test BC-E4: V2 site (9001) — heating tile shows 'ctl'**

```js
test('BC-E4: V2 site with boilerControl present shows heating as ctl', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '9001', 'Test Chef Brewer (V2 DHW)');
    await expect(page.locator('[data-testid="tile-heating"]')).toContainText('Controllable from here');
});
```

**E2E test BC-E5: V2 site (9001) — hotwater flow stage 0 shows boost chip**

```js
test('BC-E5: hotwater flow shows DHW boost chip when dhwControllable=true', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '9001', 'Test Chef Brewer (V2 DHW)');
    await page.locator('[data-testid="tile-hotwater"]').click();
    await expect(page.locator('[data-testid="hw-boost-yes"]')).toBeVisible();
});
```

---

## Edge Cases

### No boilerControl device at the site

`deriveBoilerControl(null)` returns `{ present: false, subBrand: null, heatingControllable: false, dhwControllable: false }`.
`hasControllableDhw` returns `false`. `hotwater` scope falls back to `hasHotWaterSignal` (combi
signal path) → `mon`, or `none` if no signal.

### Unknown or absent `subBrand`

`subBrand` is `null`, an empty string, or an unrecognised value (not `flaming_grill`, `chef`, or
`brewer`). In this case: `heatingControllable` remains `true` (the device IS present, so heating IS
controllable), `dhwControllable` is `false` (cannot determine V1 vs V2, so fail-closed — do not
offer DHW boost when variant is unknown). Log a warning: `[TB] boilerControl at site {siteNo} has unknown subBrand: {subBrand}`.

### `output1OutputMask` as a string rather than array

If TB returns the value as a JSON-encoded string (e.g. `"[false,false,false,true]"`), `JSON.parse`
it before array-indexing. Guard with try/catch: a malformed string → `dhwControllable = false`.
Alternatively, if Spencer confirms it is always stored as a native JSON array, this guard is not
needed — confirm with Spencer as part of the build prerequisite.

### `DHW.use_boiler` as a string `"true"` / `"false"`

The `toBool` normalisation pattern already in `tb-device.js` handles this. Apply the same
normalisation in `deriveBoilerControl` for `DHW.use_boiler`.

### Multiple `boilerControl` devices at one site

Unexpected but possible. Use the first matched (by sorted device name, for determinism). Log a
warning: `[TB] Multiple boilerControl devices found for site {siteNo}; using {deviceId}`.

### `boilerControl` device offline

The `boilerControl` object does not carry an `online` flag. The scope levels (`ctl` vs `mon`) reflect
controllability of the system, not liveness of the device at query time. An offline boilerControl
device does not change `dhwControllable` — the operator's connectivity flow already handles offline
states. This is consistent with the existing heating scope level design.

### `SHARED_SCOPE` read fails for boilerControl device

Degrade to `{ present: true, deviceId: '...', subBrand: null, heatingControllable: true, dhwControllable: false }`.
The device IS present (we found it), so heating remains controllable; DHW defaults false (fail-closed).
Log the error (already in the error branch of `fetchTelemetry`).

### Fixture mode

Fixture sites carry the `boilerControl` field pre-computed in the JSON. The `fetchTelemetry` fan-out
is only called in live mode; fixture mode serves devices verbatim. The `boilerControl` field shim in
`getSitesByNumber` (fixture branch) ensures the field is always present with a safe default for
legacy fixture sites that pre-date this design.

---

## Data Dictionary

| Field | Location | Type | Description | Retention | Sensitivity |
|-------|----------|------|-------------|-----------|-------------|
| `boilerControl` | `site` (server-side) and `workspacePayload` (client-facing) | object | Derived controllability summary for the site's boiler control panel device. Always present; `present: false` when no boilerControl device found. | In-memory, per workspace fetch. Not persisted. | None — no PII |
| `boilerControl.present` | `workspacePayload.boilerControl` | boolean | True when a `boilerControl`-profile TB device exists for this site. | — | — |
| `boilerControl.deviceId` | `workspacePayload.boilerControl` | string or null | TB device name (e.g. `gk-6123-boilercontrol-1`). Null when `present=false`. | — | — |
| `boilerControl.subBrand` | `workspacePayload.boilerControl` | `"flaming_grill"` or `"chef"` or `"brewer"` or null | Brand variant read from TB SHARED_SCOPE `subBrand`. Null when absent or unrecognised. | — | — |
| `boilerControl.heatingControllable` | `workspacePayload.boilerControl` | boolean | True when `present=true`. Drives the `heating` scope level function. | — | — |
| `boilerControl.dhwControllable` | `workspacePayload.boilerControl` | boolean | True when V2 `DHW.use_boiler=true` or V1 `output1OutputMask[3]=true`. Drives `hotwater` scope level and the DHW flow stage 0. | — | — |
| `subBrand` | TB SHARED_SCOPE on `boilerControl` device | string | Brand variant set by IoT team in ThingsBoard. Read-only from dashboard's perspective. | TB attribute (persistent in TB). | None |
| `output1OutputMask` | TB SHARED_SCOPE on `boilerControl` device | JSON array (4 boolean elements) | V1 relay output mask. Index 3 = DHW relay. Read-only. | TB attribute. | None |
| `DHW.use_boiler` | TB SHARED_SCOPE on `boilerControl` device | boolean | V2 flag — true when DHW is served via the boiler (boost controllable). Read-only. | TB attribute. | None |

---

## Open Questions

**OQ-1 (Spencer, pre-build):** Is profile-match (`type === 'boilerControl'`) within the site's device
set sufficient to uniquely identify the boilerControl device, or is the `toRestaurant` relation check
also required? If a site could have a `boilerControl`-profile device that is NOT the restaurant boiler
panel, the relation check is necessary.

**OQ-2 (Spencer, pre-build):** What is the exact stored format of `output1OutputMask` in TB SHARED_SCOPE?
Native JSON array, or a serialised string? Are the values booleans, integers (0/1), or strings?

**OQ-3 (Spencer, pre-build):** Is `DHW.use_boiler` stored as a boolean, string, or integer in TB?
(The `toBool` normalisation covers boolean, string, and integer forms; confirming the actual type
narrows the test surface.)

**OQ-4 (design):** The existing `hotwater` flow stage-1 dispatches `openControl(dhwDev, 'boost')` where
`dhwDev` is expected to be a full device object with a `deviceId` for the control path. With the new
design, `dhwDev` is the `boilerControl` summary object, which carries `deviceId`. Build must verify
that the control dispatch path (`control.js` → `tb-client.writeSharedAttribute`) accepts a device
with `deviceId: 'gk-{siteNo}-boilercontrol-1'` and that `hwBoostHoursDesired` is a valid attribute
on the boilerControl device. This is likely a separate story (DHW boost dispatch); the present design
only fixes the controllability DETECTION, not the boost write itself.

**OQ-5 (Sam Day):** The existing `hotwater` flow stage 0 showed the Salus IT500 device ID and a live
`hwBoostHours` telemetry read. With the new design there is no IT500 DHW device; the UI shows a
boiler-panel identity instead. Is the V2 panel's `hwBoostHours` telemetry available? Should the UI
show any current-state telemetry for the DHW, or simply offer the boost choice?

---

## Files Modified by This Design

| File | Type of change |
|------|---------------|
| `services/tb-client.js` | New export: `readSharedScopeAttributes` |
| `services/tb-device.js` | New lazy import; `fetchTelemetry` fan-out extended; new `deriveBoilerControl` function; `site` shape gains `boilerControl`; fixture shim |
| `routes/api.js` | `hasControllableDhw` replaced; `SCOPE_GROUPS` heating level replaced; `workspacePayload` gains `boilerControl` field |
| `public/js/flows.js` | `hotwater` stage 0 and stage 1 `dhw` lookup replaced |
| `data/fixtures/bridge-devices.json` | Three new fixture sites (9001, 9002, 9003) |
| `test/boilercontrol-scope.test.js` | New unit test file (BC-1 through BC-9) |
| `tests/boilercontrol.spec.js` | New Playwright e2e test file (BC-E1 through BC-E5) |
