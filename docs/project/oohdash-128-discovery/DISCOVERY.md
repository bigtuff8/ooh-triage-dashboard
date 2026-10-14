<!-- gate:contract
SECTION: What we are solving
OOHDASH-128. On the live dashboard (v1.4.0), following the heating path for a site whose Bar/Restaurant heating is delivered by bare-salus thermostats shows only "Accommodation" -- or nothing -- even though the site has real Bar/Restaurant heating devices in ThingsBoard. The fix work in OOHDASH-108 (device reclassification) and OOHDASH-123 (Rosetta Stone bare-salus inclusion) is correct but completely inert in production for this population, because the devices never reach the pipeline: they are excluded at the site-loading stage before any classification can run.

SECTION: Root cause (PROVEN)
fetchLiveSitesByNumber searches ThingsBoard using textSearch=gk-{siteNo} then applies an anchored client-side filter ^gk-({siteNo})(?![0-9]) over the NORMALISED device name. normaliseName strips parentheticals before token matching. Bare-salus devices use the old naming convention gk_{sitename}_salus_{serial} ({siteNo}-{letter}-{n}): the site number appears only inside a trailing parenthetical which is stripped during normalisation. The normalised name gk-{sitename}-salus-{serial} does not start with gk-{siteNo}-, so it never matches the anchored filter, and the device is never loaded into the site workspace. OOHDASH-108 and OOHDASH-123 both operate downstream of this load step and have no effect on devices that never arrive.

SECTION: Affected population (live sweep 2026-10-14, read-only, no writes)
385 bare-salus devices total on the estate. 153 are restaurant controllers (letter r or b) across 74 distinct sites. 202 are accommodation (s or f). 30 have an unparseable or absent letter. 9 have no parenthetical at all (edge case, discussed in OQ2/D2). All 15 sampled devices (3.9% of 385) have SERVER_SCOPE active: false; the full-fleet status is unconfirmed, but the sample establishes a strong dark-fleet signal. CLIENT_SCOPE site is populated on confirmed devices (e.g., site: "(5694-r-2)") and is already the primary source for deriveArea. Bare-salus is the only device family using the old underscore-naming convention (no other family affected). OQ1 RESOLVED (second sweep 2026-10-14): 72 of the 74 affected sites have partial failure -- Bar/Restaurant already surfaces from modern gk-{siteNo}-salusit500-r/b devices; bare-salus thermostats for the same zone are additionally absent from the workspace. 2 sites have total failure: site 5791 has a no-paren restaurant thermostat not addressable by Option A alone; site 5191 has only accommodation bare-salus (f-2) and no r/b device in TB.

SECTION: Fix options and recommendation
Three options exist. Option A is recommended. Option A (code change -- parenthetical supplementary fetch): in fetchLiveSitesByNumber, add a supplementary textSearch=(${siteNo}- query (verified to return all bare-salus for a given site, e.g. exactly 6 for site 5694) and extend the client-side filter to accept devices that pass a strict bare-salus parenthetical check (name contains _salus_ AND parenthetical leading digit group equals the target site number). The existing siteNameFilter is unchanged; modern devices continue to load via the existing path. No downstream changes needed. One extra TB request per 30-second cache window per site. Option B (site-aliases.json data entries) is DISPROVED: live sweep confirmed that textSearch on any site-name token does not return old-convention bare-salus devices. Option C (TB device rename) is correct long-term but requires Spencer Thompson approval and a bulk write of 385 devices -- out of scope for this ticket.

SECTION: Accommodation blast-radius -- BLOCKS DESIGN (OQ4)
Option A's supplementary fetch is site-scoped, not area-scoped. Site 5694 (Wingfield Farm) has six bare-salus devices: two Restaurant (r-2, r-1) and four Accommodation/Staff (f-1, f-2, f-3, s-1). The supplementary fetch returns all six. The four s/f devices -- active: false in the sample -- load into the Accommodation health bucket alongside any healthy modern Accommodation devices. On the 72 partial-failure sites, Accommodation changes from an all-healthy view to a mixed-health view (some healthy modern, some dark bare-salus). This is accurate, not a regression, but it is a material overnight change. Design must handle the mixed-health state explicitly: distinguishable card types, copy that explains why older and newer thermostat types co-exist in one area, and an updated handler support guide. OQ4 asks James to accept or reject this blast-radius before Design starts. It blocks design.

SECTION: The 30 no-usable-letter devices -- BLOCKS DESIGN (OQ5)
Thirty bare-salus devices (including 9 with no parenthetical at all) carry no letter that deriveArea can resolve. They pass the supplementary fetch (they share a site number) and pass the cross-site guard (site number matches). But deriveArea returns null for them. Leaving this undefined allows null to leak into the render path and cause display corruption. Recommended: surface them via a lightweight area-not-identified chip (an acknowledged count or footnote at site level, not a full device-detail list) so operators know dark heating devices exist at this site that cannot be placed in an area. The support guide (OOHDASH-113) must note what this chip means. Silent drop is the alternative but means 30 devices vanish with no acknowledgement, which is a trust gap for a health tool. OQ5 asks James to confirm the chip approach or accept silent drop. It blocks design because Design must know whether to lay out the chip.

SECTION: Cost and silent-running evaluation
Option A adds one ThingsBoard GET per site page load per 30-second cache window. The supplementary fetch returns only that site's bare-salus devices -- evidence shows 6 devices for site 5694; fleet mean is approximately 5 per site (385 devices across 74 sites). The payload is a handful of device objects, not the full 385-device fleet. Fleet-scale bound: at most 74 additional GETs spread across all operator sessions visiting those 74 affected sites. No background polling, no idle token spend, no new service or daemon. Silent-running: fully met. Both options impose negligible cost. No criterion vetoes any proposed change.

SECTION: What we still need
OQ1 RESOLVED -- 72 partial / 2 total failure sites. Option A addresses 73 of 74; site 5791 Bar/Restaurant remains a gap unless OQ2/D2 includes a secondary fix path. OQ2: should the 9 no-paren devices (1 restaurant thermostat at site 5791) be included in this ticket? Owner James, D2 decision, does not block design. OQ3: does any non-OOH integration reference bare-salus device names by old name format? Owner Spencer Thompson, relevant only if Option C is a future target. OQ4 (blocks design): do you accept Option A changing the Accommodation health view on 72 sites to mixed-health? If no, Option A2 (area-scoped fetch) is required. OQ5 (blocks design): do you accept that the 30 no-usable-letter devices are surfaced via a lightweight area-not-identified chip? Or do you prefer silent drop (trust gap: these devices vanish with no acknowledgement)? OQ6 (blocks ship, not design): should the cross-site guard be spot-checked on 2 to 3 additional sites before ship?

DECISION: Fix approach (D1) | Option A (parenthetical supplementary fetch -- code change in fetchLiveSitesByNumber) | Option C (TB device rename -- separate ticket, Spencer approval required)
DETAIL: Option B (alias data) is ruled out: live sweep proved TB does not return bare-salus devices when searching by site-name token. Option A fixes 72 of 74 sites fully and resolves site 5191 (accommodation bare-salus loads correctly). Option C is clean long-term but requires external approval and a bulk write.

DECISION: No-paren edge-case devices (OQ2 / D2 -- 9 devices, 1 restaurant thermostat at site 5791) | Defer to a follow-on ticket -- only 1 device affects the heating gap; different fix path needed | Address in this ticket with a secondary fix path keyed on the space-separated site code in the device name
DETAIL: 8 of the 9 no-paren devices are either gateways (irrelevant to heating) or accommodation thermostats. Only 1 -- gk_unknown_salus_STA10108795 5791-r-2 -- is a restaurant thermostat and it is the reason site 5791 remains a gap even after Option A. A secondary path (e.g., also search textSearch={siteNo}- without the opening paren and filter by space-separated site code pattern) would close this 1-device gap.

DECISION: Accommodation blast-radius (OQ4 -- blocks design) | Accept -- Option A with explicit mixed-health UX; Design handles the mixed-health state and operator signposting | Reject -- use Option A2 (area-scoped fetch) to avoid loading Accommodation bare-salus when the Restaurant panel is viewed and vice versa
DETAIL: The mixed-health state is factually correct: these Accommodation areas do contain dark thermostats. The blast-radius is a design obligation, not a technical veto. Option A2 should be chosen only if James decides the blast-radius is unacceptable for the current release.

DECISION: Fate of 30 no-usable-letter devices (OQ5 -- blocks design) | Surface via lightweight area-not-identified chip (acknowledged count or footnote at site level; support guide update required) | Drop silently -- no card, no area, no display corruption; 30 devices permanently invisible (trust gap for a health tool)
DETAIL: Recommended: area-not-identified chip. Silent drop means 30 dark heating devices vanish with no acknowledgement, which undermines operator trust in the health view. The chip must be lightweight per the conversational-outcome principle -- a count or footnote, not a device-detail list. Support guide (OOHDASH-113) must note what it means.

DECISION: Cross-site guard pre-ship spot-check (OQ6 -- blocks ship, not design) | Yes -- spot-check on 2 to 3 additional sites (including at least one with malformed parenthetical) before ship; add to pre-ship gate | No -- trust the single-site verification on site 5694; accept residual cross-site bleed risk
DETAIL: Recommended: yes. Site 5694 had clean, unambiguous parenthetical entries. Sites with malformed or absent parentheticals are the residual risk; a spot-check on 2 to 3 such sites gives much stronger evidence before going live.
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

**Where it breaks (stages 1 and 2):**

normaliseName strips parentheticals before tokenising:

    "gk_wingfieldfarm_salus_STA10108576 (5694-r-2)"
    -> normalised: "gk-wingfieldfarm-salus-sta10108576"

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
| Restaurant controllers (letter r) | 146 |
| Bar controllers (letter b) | 7 |
| r + b subtotal (Bar/Restaurant) | 153 |
| Staff accommodation (letter s) | 21 |
| Flats accommodation (letter f) | 181 |
| s + f subtotal (Accommodation) | 202 |
| Other / no usable letter | 30 |
| No parenthetical at all (edge case) | 9 |
| Distinct site numbers affected | 74 |
| SERVER_SCOPE active: false in sample (15 devices sampled) | 15 |

All 15 sampled devices have active: false. This is a 3.9% sample (15 of 385); it establishes a strong signal for this population but does not prove the entire fleet is dark. If any non-dark bare-salus device surfaces (e.g. during Design testing), the health-status display behaviour must be confirmed against a live device (see Test T8). After the fix, these devices will load and the Bar/Restaurant area will surface; the honest "device not reporting" branch activates per the OOHDASH-123 dark-fleet path (no controllable state shown, no control available -- correct for the sample).

**Site-loading failure type (OQ1 -- RESOLVED, second sweep 2026-10-14, all 74 sites checked):**

| Failure type | Sites | Meaning |
|---|---|---|
| Partial | 72 | Bar/Restaurant already surfaces from modern gk-{siteNo}-salusit500-r/b devices; bare-salus thermostats for the same zone additionally absent from workspace |
| Total | 2 (5191, 5791) | No modern r/b device loads; Bar/Restaurant completely absent |

Site 5791 is the more significant total-failure case: it has a restaurant thermostat in the no-paren format (gk_unknown_salus_STA10108795 5791-r-2) that is not retrievable by Option A. Site 5191 has only accommodation bare-salus in TB (f-2); no restaurant heating device exists there. Option A resolves 73 of 74 sites; site 5791 Bar/Restaurant remains a gap unless D2 includes the secondary no-paren fix path.

**Other device families:**

Sweep of intesis, tuya, boiler, and gk_ prefix devices confirms bare-salus is the only family with the old underscore naming convention and trailing parenthetical. No other family is affected by this gap.

**textSearch=(${siteNo}- confirmation:**

textSearch=(5694- returns exactly 6 devices -- all bare-salus for site 5694 (r-2, r-1, f-1, f-2, f-3, s-1). No false positives. This is the mechanism that makes Option A possible and confirms the per-site payload is a handful of devices, not the full fleet.

**CLIENT_SCOPE confirmation:**

Verified on gk_wingfieldfarm_salus_STA10108576 (5694-r-2):
- CLIENT_SCOPE site = "(5694-r-2)" -- populated, parseable, already used by deriveArea
- vendor_id = "salus-it500" -- CLIENT_SCOPE only, not used by classifyDevice (classifyDevice uses name tokens)

**alias-overlay disproof:**

textSearch=gk-wingfieldfarm (dash), gk_wingfieldfarm (underscore), and wingfieldfarm (bare token) all return 10 modern devices only -- none of the 6 bare-salus for site 5694. ThingsBoard appears to normalise or tokenise device names internally such that the site-name alias approach does not reach old-convention bare-salus devices. Option B (alias data) is ruled out.

---

## Accommodation blast-radius

**This section was absent from the initial artefact. OQ4 must be answered before Design starts.**

### What the blast-radius is

Option A's supplementary fetch is site-scoped, not area-scoped. Site 5694 (Wingfield Farm) has six bare-salus devices: two Restaurant (r-2, r-1) and four Accommodation/Staff (f-1, f-2, f-3, s-1). The supplementary fetch for site 5694 returns all six. The two Restaurant devices go into the Bar/Restaurant health bucket. The four Accommodation/Staff devices go into the Accommodation health bucket.

If those four Accommodation devices are active: false (consistent with the 3.9% sample) and the site also has a healthy modern Salus IT700 thermostat in Accommodation, the Accommodation panel now shows one healthy modern device alongside four dark bare-salus devices. This is the blast-radius: a site whose Accommodation area appeared fully healthy now shows mixed health -- not because anything changed in the modern devices, but because previously invisible bare-salus devices became visible.

### The scale

72 of 74 affected sites have healthy modern Accommodation devices alongside bare-salus Accommodation devices. On all 72, Option A changes the Accommodation panel from a single-health view to a mixed-health view. The 202 s/f devices across 72 sites gives a mean of approximately 2.8 per site; even one dark bare-salus device in a previously-healthy area changes the panel state.

### Design's obligation (if OQ4 is accepted)

Design must explicitly handle the mixed-health state. This is not a regression. The design brief must cover:
- How to visually distinguish dark bare-salus devices from healthy modern devices within the same area panel. A shared card design that shows active: false devices clearly as offline is the minimum.
- What copy explains to an operator why a thermostat type they have not seen before (bare-salus) is showing as offline alongside a healthy thermostat they recognise. Operators must not read this as a new fault introduced by their action.
- Whether the area panel's overall health indicator (the chip colour at the top of each area section) changes to amber or red when any bare-salus in that area is dark, or whether bare-salus darkness is visually separated from the modern-device health indicator.
- An update to the handler support guide (OOHDASH-113) to reflect this change.

These are Design responsibilities. Discovery defines them as obligations that must not be skipped; it does not resolve them.

---

## The 30 no-usable-letter devices

**This section was absent from the initial artefact. OQ5 must be answered before Design starts.**

Thirty bare-salus devices have no site-code letter that deriveArea can resolve. Nine of these have no parenthetical in their name at all (e.g. gk_unknown_salus_STA10109372 5669-S-1 -- the suffix is a space-separated site code rather than a trailing parenthetical). The other twenty-one have a parenthetical whose class-letter position contains a digit, z, or some other non-class character that parseSiteCodeLetter correctly rejects as malformed.

These 30 devices pass the supplementary fetch (they share a site number) and pass the cross-site guard (siteNo matches). The problem arises at deriveArea: it returns null. The subsequent render step has no defined behaviour for a null-area device from a supplementary fetch.

### Fate options

| Fate | Description | Risk |
|---|---|---|
| Area-not-identified chip (RECOMMENDED) | Lightweight acknowledged count or footnote at site level -- not a device-detail list; support guide updated | Design must lay out the chip; copy must explain what it means; lightweight per conversational-outcome principle |
| Drop silently | No card rendered, no area assigned, no error shown | Trust gap: 30 dark heating devices vanish with no acknowledgement; operators cannot know unplaced heating exists |
| Assign to Accommodation as fallback | Revert to pre-108 behaviour for these 30 only | Incorrect placement; reproduces the original OOHDASH-108 bug for this residue |

**Recommended: area-not-identified chip.** Dark devices must not vanish without acknowledgement in a health tool -- silent drop is a trust gap. The chip must be lightweight per the conversational-outcome principle: a count or footnote at site level (e.g. "1 heating device could not be placed in an area"), not a device-detail list. The handler support guide (OOHDASH-113) must note what this chip means and when to escalate. OQ5 asks James to confirm this approach or explicitly accept silent drop. Design cannot proceed until the fate is settled.

Note: parseSiteCodeLetter handles uppercase correctly (lowercases before matching; 5669-S-1 resolves to s). Uppercase is not the failure mode for these devices -- the failure is absent or non-class letter positions.

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

**Residual cases:**

The 9 no-paren devices are not addressed by this path. The 30 no-usable-letter devices pass the fetch but deriveArea returns null for them -- fate per OQ5. Decision D2 determines whether to include a secondary fix for the 1 restaurant thermostat at site 5791.

### Option B -- data/site-aliases.json entries

RULED OUT: live sweep proved textSearch on the site name (with any separator) does not return bare-salus devices from ThingsBoard. The alias mechanism cannot find them.

### Option C -- TB device rename

Rename all 385 bare-salus devices to modern gk-{siteNo}-salus-... convention. Requires Spencer Thompson approval, a bulk write of 385+ devices, and risk assessment for any upstream integrations referencing old device names by name. Correct long-term cleanup but out of scope for this ticket without that approval. Present as a follow-on.

### Options compared

| Criterion | Option A | Option A2 (area-scoped variant) |
|---|---|---|
| ThingsBoard fetch calls per site view | 1 | 2 (one per area panel) |
| Accommodation blast-radius on 72 sites | Yes -- mixed-health view (OQ4) | No |
| Implementation complexity | Lower | Moderate |
| Correctness of area placement (355 letter-bearing devices) | Full | Full |
| 30 no-letter devices | Unrouted -- fate per OQ5 | Unrouted -- fate per OQ5 |
| Cross-site guard required | Yes | Yes |
| Recommended | Yes (with design constraints) | If OQ4 is rejected |

---

## Cross-site guard -- UNVERIFIED at scale

The supplementary fetch retrieves bare-salus devices that share a site number with the target site. To prevent bleed from devices at adjacent sites whose names contain the same digit sequence in a different position, a client-side cross-site guard is required: each device's parsed siteNo must exactly match the target site number before it is accepted into the health bucket.

**Evidence:** the cross-site guard logic was verified on site 5694 only. The six site-5694 devices all carry the site number unambiguously in the (NNNN-x-n) parenthetical, and a guard comparing parsed siteNo to "5694" rejects all non-5694 devices correctly. This gives one confirmed site; it is UNVERIFIED at scale.

**Design of the guard:** the guard must use strict equality on the parsed siteNo and must reject devices where the parser returns null (i.e. malformed parenthetical). It must not fall back on raw substring matching, which could admit a device from a different site whose number appears as a substring.

**OQ6 (blocks ship, not design):** a pre-ship spot-check on 2 to 3 additional sites -- including at least one with malformed-parenthetical bare-salus devices -- must confirm the guard rejects cross-site devices and accepts same-site devices correctly. This is a pre-ship gate item, not a blocker for Design.

---

## Customer experience success criteria (for design)

**Persona.** An OOH handler takes a call overnight from a pub with a heating complaint. They are not technical. They know the dashboard's existing panels (green/amber/red area chips, device cards). They may not know what a "bare-salus thermostat" is or why some thermostats appear offline.

**Journey.** Handler searches for the site -> sees the site health view -> opens the Heating section -> sees device cards. Post-OOHDASH-128: the Heating section may now contain both healthy modern Salus cards and dark bare-salus cards.

**Reassurance vs friction calibration:**

| Step | Want |
|---|---|
| Site health overview | Get out of the way -- handler needs the area health signal fast, not explanation of device types |
| Area panel with mixed health | Checkpoint -- handler needs to distinguish "the main thermostat is fine" from "an older unit is offline"; these have different call-back actions |
| Dark bare-salus card | Reassurance -- handler must understand this is not a new fault introduced by their action; it is a pre-existing state now made visible |

**"Great looks like..."** The handler opens the Accommodation panel at a partial-failure site and immediately sees: (a) the modern thermostat as green and controllable; (b) one or more bare-salus thermostats as clearly offline, with a label that distinguishes them from the modern unit and copy that says "this sensor is not reporting -- it may have been decommissioned; the modern thermostat above is active and can be controlled." The handler is not confused about which thermostat to use, does not try to control the offline bare-salus unit, and understands the difference between a live controllable device and an offline legacy sensor without needing to call the IoT team.

---

## Data scope (for design)

| Entity / field | Origin | Significance | Sensitivity |
|---|---|---|---|
| Bare-salus device name | ThingsBoard entity name | Used to parse siteNo and site-code letter; raw name (before normalisation) needed for parenthetical fallback | Low |
| CLIENT_SCOPE site attribute | ThingsBoard CLIENT_SCOPE | Primary site-letter source for deriveArea; may be absent on some devices | Low |
| SERVER_SCOPE active flag | ThingsBoard entity attribute | Determines whether a bare-salus device is shown as online or offline | Low |
| device.area (computed) | deriveArea output | Determines which health bucket the device appears in; null for the 30 no-letter devices -- fate per OQ5 | Low |
| device.deviceType (computed) | classifyDevice output | Must be "salus" (the OOHDASH-108 type) for supplementary-fetch devices to be handled by the render path | Low |

No personal data is involved. No new fields beyond the above are needed for OOHDASH-128's display scope.

---

## End-to-end testing scope (for design)

The following tests must be provable once the thing is built. Happy path and critical unhappy paths only.

| Test | Scenario | Expected outcome |
|---|---|---|
| T1 | Operator opens a site with bare-salus Restaurant/Bar devices and no modern r/b iT500 devices | Bar/Restaurant panel shows bare-salus device cards with correct area label and honest offline state |
| T2 | Operator opens a site with modern gk-{siteNo}-salusit500-r/b devices | Existing behaviour unchanged; no new devices added or removed |
| T3 | Mixed site: bare-salus and modern devices both present | Workspace contains both sets; area derivation correct for each |
| T4 (anti-bleed) | Site 520 loaded when site 5204 also has bare-salus devices | No devices for site 5204 appear in site 520's workspace; parenthetical exact-match guard holds |
| T5 (no-paren) | Bare-salus device with no trailing parenthetical | Device absent from workspace (not fixed by Option A; honest residual behaviour) |
| T6 (blast-radius) | Site with healthy modern Accommodation devices AND dark bare-salus Accommodation devices | Accommodation panel shows mixed health; both device types visible; operator can distinguish them; area chip reflects mixed health correctly; no regression message |
| T7 (no-letter -- OQ5 outcome required) | Site has a bare-salus device with no usable letter | If chip (recommended): an area-not-identified acknowledged count or footnote appears at site level; no device-detail card, no error, no display corruption. If silent drop: no card, no error, no display corruption, chip absent |
| T8 (conditional -- active sample caveat) | A non-dark bare-salus device surfaces | Device renders correctly as active/online; health display is not hardcoded to show bare-salus as offline |

Tests T6, T7, and T8 are new requirements relative to the initial artefact. T7's expected outcome depends on the OQ5 decision and must be confirmed with James before the test script is written.

---

## Cost and silent-running evaluation

**Token and cost efficiency.** Option A adds one ThingsBoard GET per site page load per 30-second cache window. The supplementary fetch returns only that site's bare-salus devices -- evidence confirms 6 devices for site 5694; the fleet mean is approximately 5 devices per site (385 devices across 74 sites). The payload is a handful of device objects per site, not the full 385-device fleet. Fleet-scale bound: at most 74 additional GETs spread across all operator sessions visiting those 74 affected sites -- negligible. Option A2 (area-scoped variant) adds one GET per area panel open (two GETs per site with two area panels viewed). Both use the existing JWT read path; no new subscription, credential, or per-call cost is introduced. Cost impact: negligible for both options.

**Silent running.** Neither option adds any background process, daemon, scheduled task, webhook listener, or polling component. The supplementary fetch is strictly on-demand -- it fires when an operator opens a site view and never at any other time. No tokens are spent, no machine resources consumed, and no process window is created while the dashboard is idle. This criterion is fully met by both options.

**Neither criterion vetoes any proposed change.** There is no cost or silent-running compromise to disclose.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-site contamination via parenthetical fetch | Medium -- verified on site 5694 only | High -- operator sees wrong site's devices | OQ6: pre-ship spot-check on 2-3 additional sites; guard must use strict parsed-siteNo equality, not substring matching |
| Accommodation blast-radius confuses operators on 72 partial-failure sites | High -- will definitely occur | Medium -- operators may misread Accommodation health as a new fault | Design obligation: explicit mixed-health UX, distinguishable card types, explanatory copy, handler support guide update |
| All bare-salus dark; operators raise tickets about "new" offline devices | Medium -- sample all inactive, but sample is 3.9% only | Medium -- alert volume increase, operator confusion | Explanatory card copy; handler support guide update; monitor alert volume post-release |
| 30 no-letter devices leak null area into render path | High -- guaranteed if fate is undefined | Medium -- display corruption or uncaught exception | OQ5: fate must be decided before design; recommended chip (acknowledged count) prevents both corruption and silent invisibility; T7 verifies the chosen path |
| A non-dark bare-salus device exists and is shown incorrectly | Low -- sample signal is strong | Low -- display renders correctly if T8 passes | T8 (conditional) covers this; hardcoded active: false assumptions must be absent from the render path |
| OOHDASH-108 regression: glued iT700 or iT500 devices reclassified by supplementary fetch | Low -- supplementary fetch is for bare-salus entities only | High -- area misclassification for hundreds of working devices | T3 and T4 regression guards; supplementary path is additive only |
| No-paren restaurant thermostat (site 5791) not loaded by Option A | Certain | Low (1 device, 1 site) | Accept as residual unless D2 scope includes secondary no-paren fix path |
| TB rename (Option C) breaks upstream integrations | UNVERIFIED | High | Blocker for Option C; needs Spencer review (OQ3) before any future rename ticket |

---

## Open questions

| ID | Question | Blocks | Recommended default | Owner | Status |
|---|---|---|---|---|---|
| OQ1 | How many of the 74 sites have total vs partial Bar/Restaurant failure? | -- | -- | Discovery sweep | RESOLVED: 72 partial, 2 total (5191, 5791). Option A fixes 73; site 5791 remains a gap. |
| OQ2 | Should the 9 no-paren devices (1 restaurant thermostat at site 5791) be included in this ticket? | Ship (not design) | Defer to follow-on | James | Open -- D2 decision |
| OQ3 | Does any non-OOH integration reference bare-salus device names by old name format? | Future Option C | -- | Spencer Thompson | Open -- relevant only if Option C becomes a future target |
| OQ4 | Do you accept that Option A changes the Accommodation health view on the 72 partial-failure sites from all-healthy to mixed-health? If no, Option A2 (area-scoped fetch) is required. | Design | Yes -- accept blast-radius; Option A with explicit mixed-health UX | James | Open |
| OQ5 | Should the 30 no-usable-letter devices surface via a lightweight area-not-identified chip (acknowledged count or footnote), or be silently dropped? | Design | Area-not-identified chip (lightweight -- count/footnote, not device list; support guide update required) | James | Open |
| OQ6 | Should the cross-site guard be spot-checked on 2 to 3 additional sites before ship? | Ship (not design) | Yes -- add to pre-ship gate | James | Open |

OQ4 and OQ5 must be answered before Design can define its layout and component requirements. OQ2 and OQ6 are pre-ship gate items that do not block Design.

---

## Next steps

**Immediate (before Design starts):**

1. James answers OQ4 and OQ5 at this gate. Design cannot proceed without both answers on record.
2. If OQ4 is accepted (Option A): Design proceeds against the full brief -- mixed-health UX is a first-class design requirement, not an afterthought; Section 6 (accommodation blast-radius design obligations) is the primary design brief.
3. If OQ4 is rejected (Option A2 selected): Build implements the area-scoped fetch (two call points instead of one) and the blast-radius analysis becomes moot -- but Design still owns the bare-salus card design and the handler support guide update.
4. James records OQ5 fate (drop or chip). Design cannot finalise the area layout without this answer.

**During Design:**

5. Design doer receives the CX success criteria, data scope, and E2E testing scope as the design brief.
6. Active-status caveat (T8) must be surfaced in the design brief: bare-salus devices must not be hardcoded as offline -- active status must be read from the device attribute.

**Pre-ship (OQ6):**

7. A read-only spot-check on 2 to 3 additional sites (including at least one with malformed-parenthetical bare-salus names) confirms the cross-site guard. Owner: James; gate: pre-ship.

**Owner of all external blockers:** James (OQ4, OQ5, OQ6 are internal decisions). Spencer Thompson owns OQ3, which is relevant only for a future Option C ticket and does not block this one.

---

*All population counts are from the read-only ThingsBoard sweep 2026-10-14T18:17:44Z against portal.lhlive.co.uk. Active-status finding (active: false) is attributed to the 15/385 (3.9%) sample -- it does not assert the full fleet is dark. Cross-site guard behaviour is verified on site 5694 only and is UNVERIFIED at scale. No application source was changed and no PR was opened by this artefact.*
