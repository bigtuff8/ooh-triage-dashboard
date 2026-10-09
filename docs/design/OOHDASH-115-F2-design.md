# OOHDASH-115 F2 — Trim Lighthouse controls panel to 5 rows for C&B sites

**Ticket:** OOHDASH-115 F2  
**Complexity:** S-M  
**Scope:** `routes/api.js`, `services/tb-device.js`, `public/js/views.js`, `tests/resolution.spec.js`  
**Status:** Design — ready for build

---

## Summary

The "What Lighthouse controls at this site" panel renders all 7 `SCOPE_GROUPS` rows unconditionally. Two of those rows (`electrics` — Internal lighting / sockets; `boiler` — Boiler internals / PCB) are hardcoded `level: () => 'none'` — they always show "Not on Lighthouse here." Sam Day has confirmed that for Café & Bar (C&B) sites these two rows should not appear at all: "Boiler internals/PCB means nothing to the team, and Lighthouse will never control internal lighting or sockets."

The design cap is **C&B-conditional**, not universal. Non-C&B sites (hotels, accommodation, FHI) continue to show all 7 rows unchanged. C&B identity is determined by the presence of a `boilerControl` device at the site: if `ws.boilerControl.present === true`, the site is C&B and the two rows are suppressed. If no `boilerControl` device is present, all 7 rows render.

**`subBrand` is not used.** Live TB verification (2026-10-09, 7 sites) confirmed that `subBrand` does not exist as a TB attribute on any `boilerControl` device in any scope. The design previously referenced checking `subBrand` against `['chef','brewer','flaming_grill']` — that logic is removed. The `boilerControl.present` flag (already computed by F1's `deriveBoilerControl()`) is the sole C&B discriminator for F2.

**Cost and efficiency:** Zero LLM tokens. The `boilerControl.present` flag is already computed in F1's `deriveBoilerControl()` as part of the site assembly — F2 requires no additional TB reads of its own. The SHARED_SCOPE read for `output1OutputMask` (V1) and the extended CLIENT_SCOPE read for `DHW.use_boiler` (V2) are F1's reads; F2 simply consumes the already-assembled `ws.boilerControl` object. No background polling; no recurring cost.

**Silent running:** Not applicable. This feature involves no background process, daemon, watcher, or timer.

---

## Backend changes

### 1. No new TB reads in F2

F2 does not add any ThingsBoard reads of its own. The `boilerControl.present` flag is already
computed by F1's `deriveBoilerControl()` during site assembly in `tb-device.js`. F2's filter
condition in `routes/api.js` reads `site.boilerControl?.present` directly from the assembled site.

The `readSharedScopeAttributes` helper added to `tb-client.js` and `tb-device.js` by F1 is already
in place for F1's V1 `output1OutputMask` read. F2 does not add or modify it — it is F1's concern.

### 2. Filter `SCOPE_GROUPS` in `workspacePayload` for C&B sites

**File:** `routes/api.js`  
**Function:** `workspacePayload` (line 162)  
**Current scope line:**
```js
scope: SCOPE_GROUPS.map(g => ({ key: g.key, label: g.label, level: g.level(site) })),
```

**Change:** Apply the C&B filter before mapping, using `site.boilerControl?.present`:
```js
const CB_SCOPE_KEYS = ['heating', 'hotwater', 'kitchen', 'lighting', 'fan'];
// C&B sites are identified by the presence of a boilerControl device (live TB verified 2026-10-09:
// all sites with a boilerControl device are C&B; site 5208 had no boilerControl device and is non-C&B).
// subBrand is NOT used — it does not exist in TB (confirmed by live sweep, 7 sites).
const isCandB = !!(site.boilerControl?.present);
const scopeGroups = isCandB
    ? SCOPE_GROUPS.filter(g => CB_SCOPE_KEYS.includes(g.key))
    : SCOPE_GROUPS;
scope: scopeGroups.map(g => ({ key: g.key, label: g.label, level: g.level(site) })),
```

This is the authoritative filter point. The frontend receives a `scope` array that is already the
correct length (5 for C&B, 7 for non-C&B). The frontend rendering at `views.js:190` requires no
change — it iterates `ws.scope` as-is and the reduced array renders correctly.

**Design decision — filter in backend, not frontend:** Keeping the filter server-side means the
frontend stays a pure renderer with no brand logic.

**No `subBrand` field added:** Unlike the previous design, F2 does not add `site.subBrand` or
`ws.site.subBrand`. The `boilerControl` object (added by F1 at `ws.boilerControl`) carries `present`,
`isV1`, `isV2`, and other fields. F2 reads only `present` from it — no new payload fields.

---

## Frontend changes

**File:** `public/js/views.js`  
**Line:** 190

No code change required. The `ws.scope` array received from the backend already contains the correct rows. The existing renderer:
```js
${ws.scope.map(g => `<li>...</li>`).join('')}
```
iterates whatever it receives. A 5-element array for C&B and a 7-element array for non-C&B both render correctly with no conditional logic in the view.

`ws.boilerControl` (added by F1) is available on the client-side workspace object and carries `present`, `isV1`, `isV2`, etc. for any frontend use. The scope panel itself does not inspect it — all filtering is done server-side.

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

F2 adds no new fields to the data model. The `boilerControl` object added by F1 (including
`boilerControl.present`) is the sole new payload field. See the F1 design data dictionary for the
full `boilerControl` field specification.

The following fields referenced in the prior version of this design are **not added** — they do not exist in TB:

| Field (removed) | Reason |
|---|---|
| `site.subBrand` | `subBrand` does not exist as a TB attribute on any `boilerControl` device (live sweep confirmed, 7 sites, 2026-10-09). Not queried, not stored, not exposed. |
| `ws.site.subBrand` | Same — the payload field is not added since the source attribute does not exist. |

---

## Test spec

**File:** `tests/resolution.spec.js`

Two new test scenarios, added to the existing `F004 resolution` describe block. Both use the demo/fixture layer — a C&B fixture site must be added or an existing site fixture modified to carry a `boilerControl` field with `present: true`.

### Existing fixture context

The current fixture site used in `resolution.spec.js` is `6832` (Old Grey Mare, Greene King). This is not a C&B site (no `boilerControl` in fixture, or `boilerControl.present: false`). Use this as the non-C&B control.

A second fixture site must be designated as the C&B site. Build should use site `9001` added by F1's
fixture extension (see F1 design), which carries `boilerControl: { present: true, isV2: true, ... }`.
Alternatively, add a new fixture site (e.g. `6999`) with `boilerControl.present: true` in the
site-level fixture object. Note that fixture mode does not call `fetchTelemetry` — the `boilerControl`
field must be set directly on the site object in the fixture JSON (not on a device's attributes).

The fixture site name should be realistic: e.g. `"The Crafted Tap"` (site `6999`), brand `Greene King · Chef & Brewer`.

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

A site with no `boilerControl` device (hotel, FHI, Salus-only site) has `site.boilerControl.present === false`
(or `site.boilerControl` is the F1-supplied default object with `present: false`). `isCandB` is `false`.
All 7 rows render. This is the correct fallback. Confirmed by live TB sweep: site 5208 had no
boilerControl device and is non-C&B.

### `boilerControl` SHARED_SCOPE read fails (network/auth error) — F1 edge case, affects F2

If F1's SHARED_SCOPE read for `output1OutputMask` fails, `deriveBoilerControl` still produces
`{ present: true, ... }` (the device WAS found — only the attribute read failed). `isCandB` is
`true`. The 5-row filter applies. This is the correct behaviour: the device's presence is known
even if its attribute read failed.

### Fixture / demo mode

`fetchLiveSitesByNumber` is only called in `live` data mode. In `fixture` mode, sites are loaded
from `data/fixtures/bridge-devices.json` via `loadFixture()`. F1's fixture shim in `getSitesByNumber`
ensures every fixture site has a `boilerControl` field (defaulting to `present: false` for legacy
sites). Fixture-mode sites render all 7 rows unless the fixture explicitly sets `boilerControl.present: true`.
The new C&B scenario test requires a fixture extension as described in the test spec section.

### Bridge data path

The bridge path does not go through `deriveBoilerControl`. `site.boilerControl` defaults to the
F1-supplied safe default `{ present: false, ... }`. All 7 rows render on the bridge path — correct,
since the bridge path is the fallback/degraded mode.

---

## Live TB Verification Findings

Verified against 7 production sites on 2026-10-09. Authoritative — supersedes prior design assumptions.

1. **`subBrand` does not exist** on any `boilerControl` device in any scope. Not queried; not stored; not exposed.

2. **C&B identity = boilerControl device presence.** Every site with a `boilerControl` device is a C&B site.
   Site 5208 had no `boilerControl` device and is non-C&B. All other tested sites with a `boilerControl` device are C&B.

3. **V1/V2 split within C&B:** V1 sites have `output1OutputMask` in SHARED_SCOPE; V2 sites have `DHW.use_boiler`
   in CLIENT_SCOPE. This distinction is relevant to F1 (DHW controllability). For F2's filter, only `present`
   matters — the V1/V2 split does not affect which rows are shown.

4. **`heating_scenario` (V2, CLIENT_SCOPE):** Contains `separate_dhw` integer. Sam Day says `DHW.use_boiler`
   is the better signal for F1 DHW detection; F2 does not use either.

---

## Open questions

1. **Fixture site for C&B test:** Build must decide whether to reuse fixture site `9001` (added by F1)
   or add a new site (e.g. `6999`). A dedicated F2 fixture site is cleaner — no risk of breaking
   F1's own E2E test assertions. The fixture must set `boilerControl: { present: true, ... }` directly
   on the site object in the fixture JSON (fixture mode does not call `deriveBoilerControl`).

2. **F1 (OOHDASH-114) interaction:** F1 changes `hasControllableDhw` and the `hotwater` scope group
   logic. F2's `CB_SCOPE_KEYS` list includes `hotwater`. There is no conflict — F2 filters which rows
   appear; F1 determines the `level` value within the `hotwater` row. Both changes are independent
   and can land in any order. F2 depends on F1's `boilerControl` field being present on `site`; if
   both stories are built simultaneously, ensure F1's `deriveBoilerControl` and site-assembly changes
   land first (or in the same PR).

3. **RESOLVED — subBrand:** `subBrand` does not exist in TB and is not used in this design.
   No scope reads for `subBrand` are needed in F2 or F1.
