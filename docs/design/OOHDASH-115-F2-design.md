# OOHDASH-115 F2 — Trim Lighthouse controls panel to 5 rows for C&B sites

**Ticket:** OOHDASH-115 F2  
**Complexity:** S-M  
**Scope:** `routes/api.js`, `services/tb-device.js`, `public/js/views.js`, `tests/resolution.spec.js`  
**Status:** Design — ready for build

---

## Summary

The "What Lighthouse controls at this site" panel renders all 7 `SCOPE_GROUPS` rows unconditionally. Two of those rows (`electrics` — Internal lighting / sockets; `boiler` — Boiler internals / PCB) are hardcoded `level: () => 'none'` — they always show "Not on Lighthouse here." Sam Day has confirmed that for Café & Bar (C&B) sites these two rows should not appear at all: "Boiler internals/PCB means nothing to the team, and Lighthouse will never control internal lighting or sockets."

The design cap is **C&B-conditional**, not universal. Non-C&B sites (hotels, accommodation, FHI) continue to show all 7 rows unchanged. C&B identity is derived from the `subBrand` attribute on the `boilerControl` device in ThingsBoard, which is already fetched as part of the site inventory read. The three C&B `subBrand` values are `chef` (C&B V2), `brewer` (C&B V2), and `flaming_grill` (FG V1). Any other value, or the absence of a `boilerControl` device, is treated as non-C&B.

**Cost and efficiency:** Zero LLM tokens. The `subBrand` read is a single additional ThingsBoard SHARED_SCOPE attribute fetch per `boilerControl` device per site query, reusing the existing concurrent-settled read pattern already used for SERVER_SCOPE and CLIENT_SCOPE. One extra HTTP round-trip only when a `boilerControl` device is present. No background polling; no recurring cost.

**Silent running:** Not applicable. This feature involves no background process, daemon, watcher, or timer.

---

## Backend changes

### 1. Read `subBrand` from the `boilerControl` device in ThingsBoard

**File:** `services/tb-device.js`  
**Function:** `fetchTelemetry` (line 751)  
**Current concurrent reads per device (line 760–763):**
```js
const [tsRes, activeRes, clientScopeRes] = await Promise.allSettled([
    readRequest('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries`),
    readServerScopeAttributes(uuid, 'active,lastActivityTime'),
    readClientScopeAttributes(uuid, 'site,salusLocation')
]);
```

**Change:** Add a fourth concurrent settled read for the SHARED_SCOPE `subBrand` attribute, but only for devices whose TB profile is `boilerControl`. Non-boilerControl devices skip the read entirely (null result, no extra HTTP call).

The `boilerControl` TB profile is accessible as `d.type` on the raw device object from the `/api/tenant/devices` response. At the point of `fetchTelemetry`, the raw device array is passed in and each device's profile is available as `d.type ?? d.profile`.

**Pseudo-code for the change:**
```
// Inside fetchTelemetry, inside the Promise.allSettled per-device block:
const isBoilerControl = (d.type ?? d.profile ?? '').toLowerCase() === 'boilercontrol';

const [tsRes, activeRes, clientScopeRes, sharedSubBrandRes] = await Promise.allSettled([
    readRequest('GET', `/api/plugins/telemetry/DEVICE/${uuid}/values/timeseries`),
    readServerScopeAttributes(uuid, 'active,lastActivityTime'),
    readClientScopeAttributes(uuid, 'site,salusLocation'),
    isBoilerControl
        ? readSharedScopeAttributes(uuid, 'subBrand')
        : Promise.resolve(null)
]);

// After the existing clientScopeRes handling block, add:
if (isBoilerControl) {
    bag.__subBrand = (sharedSubBrandRes.status === 'fulfilled' && sharedSubBrandRes.value?.subBrand)
        ? String(sharedSubBrandRes.value.subBrand).toLowerCase()
        : null;
    // Fail-safe: a failed or absent read produces null, which the site-level collector treats as non-C&B.
}
```

This requires a `readSharedScopeAttributes` helper (same lazy-import pattern as `readServerScopeAttributes` and `readClientScopeAttributes`). The ThingsBoard API endpoint for SHARED_SCOPE attributes is:
```
GET /api/plugins/telemetry/DEVICE/{entityId}/values/attributes/SHARED_SCOPE?keys=subBrand
```

**New helper to add in `services/tb-device.js`** (alongside the existing `readServerScopeAttributes` and `readClientScopeAttributes` helpers, around line 47–60):
```js
/**
 * Lazily resolves tb-client.readSharedScopeAttributes (same defer rationale as the other scope readers).
 */
async function readSharedScopeAttributes(uuid, keys) {
    const mod = await import('./tb-client.js');
    return mod.readSharedScopeAttributes(uuid, keys);
}
```

This also requires `readSharedScopeAttributes` to be exported from `services/tb-client.js`, mirroring the existing `readServerScopeAttributes` / `readClientScopeAttributes` exports there. Build should inspect `tb-client.js` for the existing scope-reader pattern and replicate it for `SHARED_SCOPE`.

### 2. Surface `subBrand` from the device bag to the site level

**File:** `services/tb-device.js`  
**Function:** `fetchLiveSitesByNumber` (line 799)  
**Current bag-destructure at line 833:**
```js
const { __active, __clientScope, __lastActivityTime, ...telemetryBag } = bag;
```

**Change:** Also destructure `__subBrand` and discard it from `telemetryBag` (so it does not leak into the device's canonical `telemetry` shape):
```js
const { __active, __clientScope, __lastActivityTime, __subBrand, ...telemetryBag } = bag;
```

After the `devices` array is assembled (currently ending around line 846), collect `subBrand` from the first `boilerControl` device found:
```js
// Find the boilerControl device and extract its subBrand for the site.
// Iterates the matched raw devices (not the mapped ones) to access the private bag.
const CB_SUB_BRANDS = ['chef', 'brewer', 'flaming_grill'];
let siteSubBrand = null;
for (const d of matched) {
    const uuid = d?.id?.id || d?.id;
    const b = telemetryById.get(uuid) || {};
    if (b.__subBrand) { siteSubBrand = b.__subBrand; break; }
}
const isCandB = CB_SUB_BRANDS.includes(siteSubBrand);
```

Then set `subBrand` on the site object (line 862–871, the `site = { ... }` literal):
```js
const site = {
    siteNo: key,
    siteName: humanName || accountId,
    nameUnverified: !humanName,
    accountId,
    brand: undefined,
    address: undefined,
    callsLast30Days: undefined,
    subBrand: siteSubBrand,   // <-- NEW: null when no boilerControl device or subBrand absent
    devices
};
```

### 3. Include `subBrand` in `workspacePayload`

**File:** `routes/api.js`  
**Function:** `workspacePayload` (line 146)  
**Current `site` object in the payload (line 151):**
```js
site: { siteNo: site.siteNo, siteName: site.siteName, nameUnverified: site.nameUnverified, accountId: site.accountId, brand: site.brand, address: site.address, callsLast30Days: site.callsLast30Days },
```

**Change:** Add `subBrand`:
```js
site: { siteNo: site.siteNo, siteName: site.siteName, nameUnverified: site.nameUnverified, accountId: site.accountId, brand: site.brand, address: site.address, callsLast30Days: site.callsLast30Days, subBrand: site.subBrand ?? null },
```

`site.subBrand` is `null` for non-C&B and for all demo/fixture sites (where `boilerControl` devices are absent from the fixture data). The `?? null` coerces any `undefined` from the bridge path to `null`, giving the frontend a consistent, JSON-clean value.

### 4. Filter `SCOPE_GROUPS` in `workspacePayload` for C&B sites

**File:** `routes/api.js`  
**Function:** `workspacePayload` (line 162)  
**Current scope line:**
```js
scope: SCOPE_GROUPS.map(g => ({ key: g.key, label: g.label, level: g.level(site) })),
```

**Change:** Apply the C&B filter before mapping:
```js
const CB_SUB_BRANDS = ['chef', 'brewer', 'flaming_grill'];
const CB_SCOPE_KEYS = ['heating', 'hotwater', 'kitchen', 'lighting', 'fan'];
const isCandB = CB_SUB_BRANDS.includes(site.subBrand);
const scopeGroups = isCandB
    ? SCOPE_GROUPS.filter(g => CB_SCOPE_KEYS.includes(g.key))
    : SCOPE_GROUPS;
scope: scopeGroups.map(g => ({ key: g.key, label: g.label, level: g.level(site) })),
```

This is the authoritative filter point. The frontend receives a `scope` array that is already the correct length (5 for C&B, 7 for non-C&B). The frontend rendering at `views.js:190` requires no change — it iterates `ws.scope` as-is and the reduced array renders correctly.

**Design decision — filter in backend, not frontend:** Keeping the filter server-side means the frontend stays a pure renderer with no brand-logic. The `ws.site.subBrand` value is still sent to the frontend (in case flows.js or other downstream code ever needs it), but the frontend does not re-derive the filter from it. This avoids duplicating the `CB_SUB_BRANDS` constant.

**Define `CB_SUB_BRANDS` once:** The constant should be defined once at module scope in `routes/api.js` (alongside `SCOPE_GROUPS` around line 136) to avoid duplication between the site-level and scope-level uses if both end up in the same file. If Build prefers to centralise it in `tb-device.js` and export it, that is equally valid — the constraint is that the list appears in exactly one place.

---

## Frontend changes

**File:** `public/js/views.js`  
**Line:** 190

No code change required. The `ws.scope` array received from the backend already contains the correct rows. The existing renderer:
```js
${ws.scope.map(g => `<li>...</li>`).join('')}
```
iterates whatever it receives. A 5-element array for C&B and a 7-element array for non-C&B both render correctly with no conditional logic in the view.

`ws.site.subBrand` is available on the client-side workspace object in case it is needed by future features, but the scope panel itself does not inspect it.

---

## SCOPE_GROUPS key mapping

| Key | Label | Included for C&B |
|---|---|---|
| `heating` | Heating | Yes |
| `hotwater` | Hot water | Yes |
| `kitchen` | Kitchen equipment | Yes |
| `lighting` | External lighting | Yes |
| `fan` | Extractor fans | Yes |
| `electrics` | Internal lighting / sockets | **No — removed** |
| `boiler` | Boiler internals / PCB | **No — removed** |

The two removed rows are hardcoded `level: () => 'none'` in `SCOPE_GROUPS` (lines 142–143). They add no triage value for C&B operators and Sam has confirmed they should not appear.

---

## Data dictionary additions

| Field | Owner entity | Type | Description | Retention / sensitivity |
|---|---|---|---|---|
| `site.subBrand` | Site (TB-sourced) | `string \| null` | The `subBrand` SHARED_SCOPE attribute from the site's `boilerControl` device. Known C&B values: `chef`, `brewer`, `flaming_grill`. `null` when no boilerControl device is present or `subBrand` is absent from its attributes. | No PII. Retained in per-site cache (TTL matches existing `LIVE_CACHE_TTL`). |
| `ws.site.subBrand` | Workspace payload | `string \| null` | Passed through from `site.subBrand` in `workspacePayload`. Available on the client-side workspace object. | No PII. |

---

## Test spec

**File:** `tests/resolution.spec.js`

Two new test scenarios, added to the existing `F004 resolution` describe block. Both use the demo/fixture layer — a C&B fixture site must be added or an existing site fixture modified to carry a `boilerControl` device with `subBrand: 'chef'`.

### Existing fixture context

The current fixture site used in `resolution.spec.js` is `6832` (Old Grey Mare, Greene King). This is not a C&B site (no `boilerControl` in fixture). Use this as the non-C&B control.

A second fixture site must be designated as the C&B site. Build should either:
- Add a new fixture site (e.g. `6999`) with a `boilerControl` device carrying `subBrand: 'chef'` in its telemetry/attributes, **or**
- Amend an existing fixture site to carry this device.

The fixture site name should be realistic: e.g. `"The Crafted Tap"` (site `6999`), brand `chef`.

### Scenario 1 — C&B site shows exactly 5 rows (electrics and boiler absent)

```
test('C&B site scope panel shows 5 rows — no electrics or boiler rows', async ({ page }) => {
    await confirmSite(page, '6999', 'The Crafted Tap');
    const scope = page.locator('[data-testid="scope-list"]');
    await expect(scope.locator('li')).toHaveCount(5);
    await expect(scope).toContainText('Heating');
    await expect(scope).toContainText('Hot water');
    await expect(scope).toContainText('Kitchen equipment');
    await expect(scope).toContainText('External lighting');
    await expect(scope).toContainText('Extractor fans');
    await expect(scope).not.toContainText('Internal lighting');
    await expect(scope).not.toContainText('Boiler internals');
});
```

### Scenario 2 — Non-C&B site shows all 7 rows (unchanged behaviour)

```
test('non-C&B site scope panel shows all 7 rows including electrics and boiler', async ({ page }) => {
    await confirmSite(page, '6832', 'Old Grey Mare');
    const scope = page.locator('[data-testid="scope-list"]');
    await expect(scope.locator('li')).toHaveCount(7);
    await expect(scope).toContainText('Heating');
    await expect(scope).toContainText('Internal lighting');
    await expect(scope).toContainText('Boiler internals');
});
```

**Note on the existing passing test (line 73–77):** The existing test `'workspace shows site-scoped scope wording and repeat-contact flag'` uses site `6832` and asserts `scope.toContainText('Not on Lighthouse here')`. This passes because the 7-row version includes the hardcoded-none rows. After this change, that test continues to pass for `6832` (non-C&B → still 7 rows). No change to existing tests is required.

---

## Edge cases

### No `boilerControl` device at the site

A site with no `boilerControl` device (hotel, FHI, Salus-only site) produces no `__subBrand` in the telemetry bag. `siteSubBrand` is `null`. `isCandB` is `false`. All 7 rows render. This is the correct fallback — absence of the signal is treated as non-C&B.

### `boilerControl` device present but `subBrand` attribute absent

The SHARED_SCOPE read returns an empty map or the key is not present. `sharedSubBrandRes.value?.subBrand` is `undefined`. `bag.__subBrand` is set to `null`. `siteSubBrand` is `null`. All 7 rows render. Correct fallback.

### `boilerControl` device present, SHARED_SCOPE read fails (network/auth error)

`sharedSubBrandRes.status === 'rejected'`. The settled Promise pattern ensures the failure does not propagate to other concurrent reads. `bag.__subBrand` defaults to `null`. All 7 rows render. Correct fail-safe.

### `subBrand` is an unknown value (not in `CB_SUB_BRANDS`)

For example, `subBrand: 'hotel'` or a value from a new brand not yet in the list. `isCandB` is `false`. All 7 rows render. This is the safe default — new brands are not accidentally capped without an explicit list addition.

### Fixture / demo mode

`fetchLiveSitesByNumber` is only called in `live` data mode. In `fixture` mode, sites are loaded from `data/fixtures/bridge-devices.json` via `loadFixture()`. `site.subBrand` will be `undefined` on those site objects unless the fixture is explicitly extended. The `?? null` coercion in `workspacePayload` (§3 above) ensures `ws.site.subBrand` is always `null` (not `undefined`) in the payload, which is JSON-safe and renders as `null` on the client. Fixture-mode sites render all 7 rows unless the fixture is extended — which is the right behaviour for the existing suite. The new C&B scenario test (Scenario 1) requires a fixture extension as described in the test spec section.

### Bridge data path

`site.brand` is `undefined` in the TB-direct path (line 867). The existing `workspacePayload` already passes `brand: site.brand` (which is `undefined` / becomes `null` in JSON). `subBrand` follows the same pattern. The bridge path never sets `subBrand`, so `site.subBrand` is `undefined` there, coerced to `null` by the `?? null` in the payload. All 7 rows render on the bridge path — correct, since the bridge path is the fallback/degraded mode.

---

## Open questions

1. **SHARED_SCOPE vs CLIENT_SCOPE for `subBrand`:** This design assumes `subBrand` lives in the ThingsBoard SHARED_SCOPE attribute scope on the `boilerControl` device, consistent with the discovery brief and with the general pattern that per-site configuration attributes sit in SHARED_SCOPE. If Spencer confirms it is in CLIENT_SCOPE or as a timeseries value, the read function changes but the surrounding logic does not.

2. **`tb-client.js` SHARED_SCOPE export:** `readSharedScopeAttributes` may not yet exist in `services/tb-client.js`. Build should verify — if `readServerScopeAttributes` and `readClientScopeAttributes` are already there, adding SHARED_SCOPE is a one-function addition replicating the same pattern with the scope path segment changed to `SHARED_SCOPE`.

3. **Fixture site for C&B test:** Build must decide whether to add a new fixture site (`6999` or similar) or amend an existing one. A new site is cleaner (no risk of breaking existing tests that assert row counts on other sites). The fixture device must have `subBrand: 'chef'` visible in the fixture layer — since fixture mode does not go through `fetchTelemetry`, the fixture extension must set `subBrand` directly on the `site` object in `loadFixture()`'s output, or the test must stub the API response.

4. **F1 (OOHDASH-114) interaction:** F1 changes `hasControllableDhw` and the `hotwater` scope group logic. F2's `CB_SCOPE_KEYS` list includes `hotwater`. There is no conflict — F2 filters which rows appear; F1 determines the `level` value within the `hotwater` row. Both changes are independent and can land in any order.
