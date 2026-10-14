<!-- gate:contract
SECTION: What we are solving
OOHDASH-128. On the live dashboard (v1.4.0), following the heating path for a site whose Bar/Restaurant heating is delivered by bare-salus thermostats shows only "Accommodation" -- or nothing -- even though the site has real Bar/Restaurant heating devices in ThingsBoard. The fix work in OOHDASH-108 (device reclassification) and OOHDASH-123 (Rosetta Stone bare-salus inclusion) is correct but completely inert in production for this population, because the devices never reach the pipeline: they are excluded at the site-loading stage before any classification can run.

SECTION: Root cause (PROVEN)
fetchLiveSitesByNumber searches ThingsBoard using textSearch=gk-{siteNo} then applies an anchored client-side filter ^gk-({siteNo})(?![0-9]) over the NORMALISED device name. normaliseName strips parentheticals before token matching. Bare-salus devices use the old naming convention gk_{sitename}_salus_{serial} ({siteNo}-{letter}-{n}): the site number appears only inside a trailing parenthetical which is stripped during normalisation. The normalised name gk-{sitename}-salus-{serial} does not start with gk-{siteNo}-, so it never matches the anchored filter, and the device is never loaded into the site workspace. OOHDASH-108 and OOHDASH-123 both operate downstream of this load step and have no effect on devices that never arrive.

SECTION: Affected population (live sweep 2026-10-14, read-only, no writes)
385 bare-salus devices total on the estate. 153 are restaurant controllers (letter r or b) across 74 distinct sites. 202 are accommodation (s or f). 30 have an unparseable or absent letter. 9 have no parenthetical at all (edge case, discussed in D2). Every sampled device has SERVER_SCOPE active: false -- the entire bare-salus fleet is dark (not reporting live telemetry). After the fix, bare-salus devices will load and the Bar/Restaurant area will surface; because all sampled devices are offline, the honest "device not reporting" branch activates per the OOHDASH-123 dark-fleet path. CLIENT_SCOPE site is populated on confirmed devices (e.g., site: "(5694-r-2)") and is already the primary source for deriveArea. The parenthetical fallback coded under OOHDASH-108 is also available. Bare-salus is the only device family using the old underscore-naming convention (no other family affected). OQ1 RESOLVED (second sweep 2026-10-14): 72 of the 74 affected sites have partial failure -- Bar/Restaurant already surfaces from modern gk-{siteNo}-salusit500-r/b devices; bare-salus thermostats for the same zone are additionally absent from the workspace. 2 sites have total failure (Bar/Restaurant completely absent): site 5791 has a no-paren restaurant thermostat (gk_unknown_salus_STA10108795 5791-r-2) that is not addressable by Option A alone; site 5191 has only accommodation bare-salus (f-2) and no r/b device in TB at all, suggesting no restaurant heating at that site. After Option A lands, 72 sites are fully addressed and site 5191 is also resolved (its accommodation bare-salus loads correctly). Site 5791 remains a gap for Bar/Restaurant via Option A alone; the no-paren fix path (see D2) is needed for that one site.

SECTION: Fix options and recommendation
Three options exist. Option A is recommended. Option A (code change -- parenthetical supplementary fetch): in fetchLiveSitesByNumber, add a supplementary textSearch=(${siteNo}- query (verified to return all bare-salus for a given site, e.g. exactly 6 for site 5694) and extend the client-side filter to accept devices that pass a strict bare-salus parenthetical check (name contains _salus_ AND parenthetical leading digit group equals the target site number). The existing siteNameFilter is unchanged; modern devices continue to load via the existing path. No downstream changes needed: classifyDevice already assigns deviceType=salus for these devices (OOHDASH-108), deriveArea already resolves the area from CLIENT_SCOPE.site or the raw name parenthetical (OOHDASH-108), and heatingDevices() and isDarkFleet already include salus type (OOHDASH-123). One extra TB request per 30-second cache window per site -- negligible cost. Option B (site-aliases.json data entries): add 74 entries mapping siteNo to site-name token. DISPROVED as effective: live sweep confirmed that textSearch=gk-wingfieldfarm returns only modern gk-wingfieldfarm-* devices, NOT the old-convention gk_wingfieldfarm_salus_... devices. ThingsBoard normalises underscores to dashes internally, so the alias token does not reach bare-salus names. Option B does not fix the problem. Option C (TB device rename): rename all 385 devices to modern gk-{siteNo}-salus-... convention. Correct long-term but requires Spencer Thompson approval, a bulk write of 385 devices, and risk analysis for any integrations that reference old names. Out of scope for this ticket; viable as a separate cleanup. Recommendation: Option A in this ticket. Option C as a planned follow-on if Spencer confirms no integration dependency on old names.

SECTION: What is already correct
classifyDevice (OOHDASH-108): correctly assigns deviceType=salus for bare-salus tokens via the FORWARD_ONLY_TOKENS guard -- no change needed. deriveArea (OOHDASH-108): correctly resolves r/b to Bar/Restaurant via CLIENT_SCOPE.site and parenthetical fallback -- no change needed. heatingDevices() and isDarkFleet in flows.js (OOHDASH-123): already include salus type and handle honest offline -- no change needed. The fix is entirely confined to fetchLiveSitesByNumber in services/tb-device.js (the fetch and filter extension).

SECTION: Cost and silent-running evaluation
Option A adds one TB HTTP request per site query per 30-second cache window. No background polling, no idle token spend, no new service or daemon. The supplementary request is request-driven only (fires when an operator opens a site) and is bounded by the existing TTL. Cost: negligible. Silent-running: fully met.

SECTION: What we still need
OQ1 RESOLVED -- see population section above. OQ2: the 9 bare-salus devices with no trailing parenthetical use a space-separated site code (e.g., 5669-S-1) or have no site code at all. They are not addressable by Option A. Full breakdown: 3 are Salus r10a gateways (gk-6858/6099/6758-salus-r10a) that classify as gateways by matchAssetIntent and are irrelevant to the heating path. 4 genuine thermostat devices have a space-separated site code (s=1 at site 5669, r=1 at site 5791, f=2 at site 5791). 2 have no parseable site code at all. parseSiteCodeLetter handles uppercase correctly (lowercases before matching; 5669-S-1 resolves to s). The 1 restaurant thermostat (5791-r-2) is the only no-paren device that matters for the Bar/Restaurant gap -- it is at the one total-failure site (5791) that Option A alone does not fix. The decision is whether to include a secondary no-paren fix in this ticket.

DECISION: Fix approach | Option A (parenthetical supplementary fetch -- code change in fetchLiveSitesByNumber) | Option C (TB device rename -- separate ticket, Spencer approval required)
DETAIL: Option B (alias data) is ruled out: live sweep proved TB does not return bare-salus devices when searching by site-name token. Option A fixes 72 of 74 sites fully and site 5191 (accommodation bare-salus loads correctly). Option C is clean long-term but requires external approval and a bulk write.

DECISION: No-paren edge-case devices (9 devices, 1 restaurant thermostat at site 5791) | Defer to a follow-on ticket -- only 1 device affects the heating gap; different fix path needed | Address in this ticket with a secondary fix path keyed on the space-separated site code in the device name
DETAIL: 8 of the 9 no-paren devices are either gateways (irrelevant to heating) or accommodation thermostats. Only 1 -- gk_unknown_salus_STA10108795 5791-r-2 -- is a restaurant thermostat and it is the reason site 5791 remains a gap even after Option A. A secondary path (e.g., also search textSearch={siteNo}- without the opening paren and filter by space-separated site code pattern) would close this 1-device gap. Original D2 claim that all no-paren devices are s-letter (accommodation) was wrong and is corrected here; the evidence file has the full per-device breakdown.
-->

# DISCOVERY -- OOHDASH-128
## Heating path shows only Accommodation for bare-salus restaurant sites

**Ticket:** OOHDASH-128 | **Status:** To Do | **Date:** 2026-10-14
**Reporter:** James Brown | **Discovery:** Claude Code discovery doer

---

## Problem statement

On the live dashboard (v1.4.0), when an operator follows the heating path for a site whose Bar/Restaurant heating is delivered by bare-salus thermostats, the flow surfaces only "Accommodation" (or nothing). This is because the bare-salus devices are never loaded into the site workspace. The downstream classification fixes from OOHDASH-108 and OOHDASH-123 are code-correct but inert in production: they operate after site loading, and these devices never reach that stage.

---

## Recurrence check

This is not a recurrence of a prior fix. The load-step gap predates both OOHDASH-108 and OOHDASH-123. Those tickets fixed the classification and flow logic for bare-salus but did not address the fetch layer, so the symptoms persisted without regression. First identified as a distinct root cause during verification after the v1.4.0 OOHDASH-123 release on 2026-10-14.

---

## Root cause (PROVEN by code audit and live sweep)

**The pipeline has three stages:**

1. Fetch: fetchLiveSitesByNumber queries ThingsBoard with textSearch=gk-{siteNo} and deduplicates results.
2. Filter: the client-side anchored filter ^gk-({siteNo})(?![0-9]) is applied to the NORMALISED device name.
3. Classify and map: classifyDevice, deriveArea, and mapTbDevice run on whatever passed the filter.

**Where it breaks (stage 1 and 2):**

normaliseName strips parentheticals before tokenising:

    "gk_wingfieldfarm_salus_STA10108576 (5694-r-2)"
    --> normalised: "gk-wingfieldfarm-salus-sta10108576"

textSearch=gk-5694 does not match "gk_wingfieldfarm_salus_..." (live sweep confirmed: textSearch on the site number or site name returns zero bare-salus devices). The anchored filter ^gk-5694 does not match "gk-wingfieldfarm-salus-...". Result: devices never enter byId, the filter never sees them, stages 2 and 3 are never reached.

**What is already correct (stages 2 and 3):**

Once loaded, classifyDevice correctly assigns deviceType=salus (OOHDASH-108 FORWARD_ONLY_TOKENS guard prevents the bleed that previously typed bare-salus as salus-it700). deriveArea correctly resolves r/b to Bar/Restaurant from CLIENT_SCOPE.site (verified populated: "(5694-r-2)") and from the raw name parenthetical as fallback. heatingDevices() and isDarkFleet in flows.js already include the salus type and handle honest offline (OOHDASH-123 D-DARK-FLEETS).

The bug is entirely in the fetch and filter layer.

---

## Code anchors

| Function | File | Line approx | Role |
|---|---|---|---|
| normaliseName | services/tb-device.js | 175 | Strips parentheticals, maps _ to - |
| siteQueryTokens | services/tb-device.js | 189 | Builds brand + token list from siteNo |
| siteNameFilter | services/tb-device.js | 204 | Anchored regex ^gk-({siteNo})(?![0-9]) |
| fetchTbDevicesForToken | services/tb-device.js | 775 | textSearch=gk-{token} over TB API |
| fetchLiveSitesByNumber | services/tb-device.js | 915 | Orchestrates fetch + dedup + filter |
| classifyDevice | services/tb-device.js | 388 | Assigns deviceType (already correct) |
| deriveArea | services/tb-device.js | 569 | Letter-resolves area (already correct) |
| heatingDevices | public/js/flows.js | 124 | Includes salus type (already correct) |

---

## Population (live read-only sweep, 2026-10-14)

**Source:** ThingsBoard textSearch=salus, paginated, client-side filtered to bare-salus (name contains "salus" but not "salusit"). No writes performed.

| Category | Count |
|---|---|
| Total bare-salus devices on estate | 385 |
| Restaurant controllers (letter r or b) | 153 |
| Accommodation (letter s or f) | 202 |
| Other / no usable letter | 30 |
| No parenthetical at all (edge case) | 9 |
| Distinct site numbers affected | 74 |
| SERVER_SCOPE active: true in sample (15 devices) | 0 |

All 15 sampled devices have active: false. The bare-salus fleet is entirely dark (not reporting live telemetry). After the fix, these devices will load and the Bar/Restaurant area will surface; the honest "device not reporting" branch activates per the OOHDASH-123 dark-fleet path (no controllable state shown, no control available -- correct).

**Site-loading failure type (OQ1 -- RESOLVED, second sweep 2026-10-14, all 74 sites checked):**

| Failure type | Sites | Meaning |
|---|---|---|
| Partial | 72 | Bar/Restaurant already surfaces from modern gk-{siteNo}-salusit500-r/b devices; bare-salus thermostats for the same zone additionally absent from workspace |
| Total | 2 (5191, 5791) | No modern r/b device loads; Bar/Restaurant completely absent |

Site 5791 is the more significant total-failure case: it has a restaurant thermostat in the no-paren format (gk_unknown_salus_STA10108795 5791-r-2) that is not retrievable by Option A. Site 5191 has only accommodation bare-salus in TB (f-2); no restaurant heating device exists there. Option A resolves 73 of 74 sites; site 5791 Bar/Restaurant remains a gap unless D2 includes the secondary no-paren fix path.

**Other device families:**

Sweep of intesis, tuya, boiler, and gk_ prefix devices confirms bare-salus is the only family with the old underscore naming convention and trailing parenthetical. No other family is affected by this gap.

**textSearch=(${siteNo}- confirmation:**

textSearch=(5694- returns exactly 6 devices -- all bare-salus for site 5694 (r-2, r-1, f-1, f-2, f-3, s-1). No false positives. This is the mechanism that makes Option A possible.

**CLIENT_SCOPE confirmation:**

Verified on gk_wingfieldfarm_salus_STA10108576 (5694-r-2):
- CLIENT_SCOPE site = "(5694-r-2)" -- populated, parseable, already used by deriveArea
- vendor_id = "salus-it500" -- CLIENT_SCOPE only, not used by classifyDevice (classifyDevice uses name tokens)

**alias-overlay disproof:**

textSearch=gk-wingfieldfarm (dash), gk_wingfieldfarm (underscore), and wingfieldfarm (bare token) all return 10 modern devices only -- none of the 6 bare-salus for site 5694. ThingsBoard appears to normalise or tokenise device names internally such that the site-name alias approach does not reach old-convention bare-salus devices. Option B (alias data) is ruled out.

---

## Fix options

### Option A -- Supplementary parenthetical fetch (RECOMMENDED)

In fetchLiveSitesByNumber (services/tb-device.js ~915):

Step 1 -- extra fetch: after the existing per-token loop, add a supplementary textSearch=(${siteNo}- request. This returns all bare-salus devices for the site via their parenthetical, regardless of their normalised name.

Step 2 -- strict client-side filter for the supplementary set: accept a device from this set only if (a) its raw name contains _salus_ and (b) the leading digit group in its parenthetical exactly equals the target site number. This is a tight, two-condition gate.

Step 3 -- extended matched selection: existing siteNameFilter OR membership in the verified bare-salus set. The siteNameFilter is unchanged and continues to govern all modern gk-{siteNo}-* devices.

Step 4 -- downstream unchanged: classifyDevice, deriveArea, mapTbDevice, heatingDevices, isDarkFleet all already handle bare-salus correctly (OOHDASH-108 and OOHDASH-123).

**Anti-regression:**

- The existing siteNameFilter is not modified. Modern devices load via exactly the existing path.
- The new supplementary path is additive only; it cannot remove devices that already load.
- The _salus_ guard prevents non-salus devices from entering via this path.
- The exact-siteNo parenthetical guard prevents cross-site contamination.
- No other device family uses the old underscore naming (confirmed by sweep).

**Cost:**

One extra TB HTTP request per site query per 30-second cache window. Request-driven, not background. No LLM token spend. Silent-running: fully met.

**Residual case:**

9 devices have no trailing parenthetical and are not addressed by this path. Of these, 3 are Salus r10a gateways (classify as gateways, irrelevant to the heating path). The 4 genuine thermostat devices have space-separated site codes: 3 at site 5791 (r-2, f-2, f-1) and 1 at site 5669 (S-1). parseSiteCodeLetter handles uppercase correctly (lowercases before matching; S-1 resolves to s). The 1 restaurant thermostat (5791-r-2) is the only device in this set that affects Bar/Restaurant -- it is at the one total-failure site (5791) not resolved by Option A alone. Decision D2 determines scope. The original D2 claim that all no-paren devices are s-letter (accommodation) was incorrect and is corrected here.

### Option B -- data/site-aliases.json entries

Add 74 entries mapping siteNo to site-name token. RULED OUT: live sweep proved textSearch on the site name (with any separator) does not return bare-salus devices from ThingsBoard. The alias mechanism cannot find them.

### Option C -- TB device rename

Rename all 385 bare-salus devices to modern gk-{siteNo}-salus-... convention. Requires Spencer Thompson approval, a bulk write of 385+ devices, and risk assessment for any upstream integrations referencing old device names by name. Correct long-term cleanup but out of scope for this ticket without that approval. Present as a follow-on.

---

## Customer experience success criteria (for design)

Persona: site operator (heating path, pub or restaurant site).

Journey: operator opens a site, sees heating option, follows heating path, selects an area.

Target: the heating area selector shows "Bar/Restaurant" for sites that have bar or restaurant heating devices, regardless of whether those devices use old or new naming convention. Where a device is present but offline (the expected state for all bare-salus), the "device not reporting" branch activates -- honest, no controls offered, no false state shown.

"Great looks like...": the operator sees both Accommodation and Bar/Restaurant as selectable areas (where both exist), and bar/restaurant shows the correct honest offline state. The operator is not confused by a missing area.

Reassurance vs friction: this is a read path (no action requested yet). The area selector should be friction-free. If a device is not reporting, the message should be direct and calm -- not alarming.

---

## Data scope

Key entity: TB Device. Relevant fields: name (raw, for parenthetical parse), id.id (TB UUID), CLIENT_SCOPE.site (letter source), SERVER_SCOPE.active and lastActivityTime (online state). No new data entities. No retention or sensitivity concerns beyond the existing TB read credentials (already in scope).

---

## End-to-end testing scope

Test 1 (happy path, bare-salus r/b site): given a site with bare-salus restaurant devices and no modern r/b iT500 devices, when the operator opens the heating path, then Bar/Restaurant area is offered and shows "device not reporting" (honest offline). Device name format: gk_{sitename}_salus_{serial} ({siteNo}-r-n).

Test 2 (no regression, modern site): given a site with modern gk-{siteNo}-salusit500-r/b devices, when the operator opens the heating path, then the existing behavior is unchanged -- Bar/Restaurant and Accommodation surface as before, no new devices are added or removed.

Test 3 (mixed site): given a site with both bare-salus and modern devices, when the operator opens the heating path, then the workspace contains both sets of devices and area derivation is correct for each.

Test 4 (numeric neighbour anti-regression): given a site with number 520 and a different site with number 5204, when site 520 is loaded, then no devices for site 5204 appear in the workspace (parenthetical exact-match guard).

Test 5 (no parenthetical edge case): given a bare-salus device with no trailing parenthetical, when the site is loaded, the device is absent from the workspace (not fixed by Option A; honest behavior for the residual case).

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-site contamination via parenthetical fetch | Low | High | Exact-siteNo guard in client filter; sweep shows parenthetical is always the site number |
| No-paren restaurant thermostat (site 5791) not loaded by Option A | Certain | Low (1 device, 1 site) | Accept as residual unless D2 chooses to include secondary fix path |
| Dark-fleet devices surfacing controllable state incorrectly | None | High | isDarkFleet and freshness gates already handle this per OOHDASH-123 |
| Option A regresses modern iT500/iT700 sites | None | High | siteNameFilter is unchanged; supplementary path is purely additive |
| TB rename (Option C) breaks upstream integrations | UNVERIFIED | High | Blocker for Option C; needs Spencer review of any name-referencing integrations |

---

## Open questions

| ID | Question | Owner | Status |
|---|---|---|---|
| OQ1 | How many of the 74 sites have total vs partial Bar/Restaurant failure? | Discovery sweep | RESOLVED: 72 partial, 2 total (5191 and 5791). Option A fixes 73; site 5791 remains a gap (no-paren r-letter device). |
| OQ2 | Should the 9 no-paren devices (1 restaurant thermostat at site 5791) be included in this ticket? | James | Open -- D2 decision |
| OQ3 | Does any non-OOH integration reference bare-salus device names by old name format? | Spencer Thompson | Open -- relevant only if Option C is a future target |

---

## Next steps

Recommended first phase: implement Option A in design, covering the fetchLiveSitesByNumber supplementary fetch and extended client filter only (services/tb-device.js, no other file changes). Add unit tests for the new filter logic (bare-salus parenthetical match, anti-bleed guard). Add an e2e fixture covering a bare-salus restaurant site.

Before design starts: no external blockers for Option A. OQ1 and OQ2 are nice-to-know but do not block design; the fix is the same either way. OQ3 is relevant only for a future Option C ticket.

Evidence file: docs/project/oohdash-128-discovery/tb-sweep-evidence.json (raw sweep output, no secrets).
