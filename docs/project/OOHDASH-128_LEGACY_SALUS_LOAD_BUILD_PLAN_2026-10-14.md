<!-- gate:contract
SECTION: What this build plan delivers
This is the Build-PLAN artefact for OOHDASH-128 (Bug, live v1.4.0). It turns the merged, gate-approved design (DESIGN.md, gate PR #100) and James's binding gate selections into a sequenced, file-by-file implementation plan with verified code anchors. It is a plan only -- no product code is written at this stage. The headline fix is a supplementary ThingsBoard bracket-text lookup added to fetchLiveSitesByNumber in services/tb-device.js so that older-convention bare-salus thermostats (named gk_{sitename}_salus_{serial} (NNNN-L-n)) are loaded into the site workspace alongside modern devices. Thirteen work units are laid out in dependency order. Twenty unit tests (12 server-side, 8 client-side flows) and 6 Playwright e2e tests are specified. All gate decisions are settled -- no new forks require James before build starts. Open questions OQ7 and OQ8 are non-blocking and are enumerated below.

SECTION: The headline fix in one paragraph
In services/tb-device.js fetchLiveSitesByNumber (~:915), a supplementary textSearch=(${siteNo}- request runs in parallel with the existing token fetch. Results from both are deduplicated by device ID (first-seen wins; token results first). A device is kept if it passes the existing anchored siteNameFilter (unchanged) OR passes a strict two-condition bare-salus check: the raw name contains _salus_ (case-insensitive) AND the leading digit group in its trailing bracket exactly equals the target site number (string equality, not numeric, so "520" never matches "5204"). If the supplementary fetch fails, the site loads exactly as it does today and a warning is logged -- fail-soft only on the new lookup. The existing per-site 30-second cache is unchanged and simply holds the larger device list. No downstream code changes are needed: classifyDevice, deriveArea, mapTbDevice, heatingDevices and isDarkFleet already handle bare-salus correctly.

SECTION: James's binding selections and how this plan honours them
D1 (Option A: supplementary bracket fetch) is settled -- the plan implements it in WU1 through WU3. D2 (defer the 9 no-bracket devices to OOHDASH-129) is settled -- those devices are not addressed here, and the OQ6 spot-check on site 5791 explicitly confirms they remain absent. OQ4 (accept mixed-health Accommodation) is settled -- the mixed-health UX (reading line change and area-not-reporting note) is designed in flows.js WU4 and WU5 and tested in C2, E2. OQ5 (footnote for the 30 no-usable-letter devices) is settled -- they are surfaced as a one-line site-level footnote with data-testid="heating-unplaced-note" and kept out of the fallback area-unmapped button. D3 (footnote under the heating area question only, kept out of the "Heating - area not identified" button) is James's selection -- WU4 implements the recommended form (hasUnmappedHeating and devicesForArea(null) each exclude isUnplacedLegacySalus devices). D4 (patch release v1.4.1) is James's selection -- the release doer cuts it using npm run release:patch; Build does not cut the release. OQ6 (cross-site spot-check on five sites before ship) is settled -- the opt-in live test file is WU11, and the exact expected results per site are in section 9.

SECTION: Open questions OQ7 and OQ8 (non-blocking)
OQ7: 18 bare-salus devices whose trailing bracket holds no site number (placeholder codes like "?7?4-?-?", "(JWTEST-R1)", an empty bracket) can never be tied to a site by code. Should they be added to OOHDASH-129 alongside the 9 no-bracket devices, or handled by a separate data clean-up with the IoT team? Owner: James. Does not block Build or release. OQ8: Has a printed or PDF copy of the OOHDASH-113 handler guide been issued that must be regenerated after the G1-G4 support-guide edits? Owner: James. Does not block Build or release. The support guide file itself is edited in WU6 regardless.

SECTION: Test counts and coverage summary
Unit tests: 12 server-side cases (U1-U12 in test/legacy-salus-site-load.test.js) covering legacySalusSiteNo, isLegacySalusForSite, the full fetch+dedup+filter path, anti-bleed (520 vs 5204), duplicate suppression, no-regression for modern devices, fail-soft on the bracket fetch, token-fetch degraded mode, cache behaviour, a fresh live bare-salus device (T8), the 5191 total-failure site, and the D2 deferred no-bracket case. 8 client-side cases (C1-C8 in test/legacy-salus-flow.test.js) covering the reading line with mixed health, the area-not-reporting note singular and plural, the dark-fleet plural outcome, the unplaced-salus footnote, the no-area reworded alert, the empty-heating case, the mixed online/offline footnote text, and the case where all devices in an area are online (no note). 6 Playwright e2e journeys (E1-E6 in tests/oohdash-128-legacy-salus.spec.js) covering the mixed-health area, the area-not-reporting note, the Bar/Restaurant dark-fleet outcome, the total-failure site (footnote only), existing suite regression, and the 390x844 phone viewport. The required CI checks "unit tests" and "e2e (playwright)" must stay green throughout.

SECTION: OQ6 pre-ship spot-check (blocks release, not build)
A read-only live check runs against five real sites using the built getSitesByNumber in DATA_MODE=live before release. For each site the check asserts: only that site's older units appear (no cross-site devices); every older unit's legacySalusSiteNo equals the site number; the modern device IDs are identical to the v1.4.0 output. Site 5694 (Wingfield Farm) is the discovery baseline -- 6 older units expected (r-1, r-2 Bar/Restaurant; f-1, f-2, f-3, s-1 Accommodation). Site 5204 (Bramley Farm Inn) has a z-1 unit (area null, footnote) alongside well-formed codes -- 6 older units expected. Site 5788 has a swapped "(5788-1-s)" code alongside well-formed codes -- 6 older units expected (1-s is area null). Site 5191 is the total-failure site -- exactly 1 older unit expected (f-2, Accommodation). Site 5791 has 1 area-null older unit (z-1) plus the deferred no-bracket units which must be ABSENT. Any foreign device on any site is a hard stop.

SECTION: Rollback and release
Rollback: redeploy the v1.4.0 image (kubectl set image). There are no data, schema or configuration changes to undo. Remember to verify resources are preserved after any image change (known drift issue). Release: patch v1.4.1 via npm run release:patch (scripts/release.sh patch). RELEASE_NOTES.md gets a v1.4.1 entry stating: older Salus thermostats now load on 74 sites; Bar/Restaurant appears at site 5191; site 5791 Bar/Restaurant is still pending OOHDASH-129; new handler copy explains the mixed-health state.

DECISION: None. All gate decisions (D1, D2, D3, D4, OQ4, OQ5, OQ6) are settled at prior gates and are implemented as plan facts in this document. OQ7 and OQ8 are open but non-blocking. No new build-time fork requires James.
-->

# OOHDASH-128 -- Legacy Salus Load -- Build Plan

**Ticket:** OOHDASH-128 (Bug) | **Live:** v1.4.0 | **Target:** v1.4.1 (patch)
**Stage:** Build plan | **Date:** 2026-10-14 | **Branch:** docs/oohdash-128-build-plan (off origin/main 6cced28)
**Consumes:** docs/project/oohdash-128-discovery/DISCOVERY.md (gate PR #99, merged); docs/project/oohdash-128-design/DESIGN.md + heating-legacy-salus-mockup.html (gate PR #100, merged)
**James's binding selections:** D1 Option A; D2 defer no-bracket to OOHDASH-129; OQ4 accept mixed-health; OQ5 footnote; D3 footnote under heating area question only, out of the "Heating - area not identified" button; D4 patch v1.4.1; OQ6 five-site spot-check blocks release
**Open questions (non-blocking):** OQ7 (owner: James -- 18 units with no site number in bracket); OQ8 (owner: James -- printed/PDF guide reissue)
**Standards:** idioms of the existing codebase -- vanilla JS client, Node/ESM server, node:test unit tests, Playwright e2e; the two universal rules (no hardcoded secrets/endpoints/env values; explain-before-code and proper error handling) bind throughout.

---

## 1. Orientation findings (what is actually there)

All anchors below were verified against the on-branch code (6cced28) for this plan. The worktree is clean on branch docs/oohdash-128-build-plan.

**The broken fetch path (today).**

services/tb-device.js:

- normaliseName (:175) strips parentheticals before tokenising: "(5694-r-2)" is removed, so "gk_wingfieldfarm_salus_STA10108576 (5694-r-2)" becomes "gk-wingfieldfarm-salus-sta10108576".
- siteQueryTokens (:189) builds tokens from siteNo and alias entries only. Bare-salus site numbers appear only inside the stripped parenthetical, so they never appear in the token list.
- fetchTbDevicesForToken (:775) issues textSearch=gk-{token}. Because the TB entity name begins "gk_wingfieldfarm_salus..." (underscore, no leading "gk-5694"), the search returns zero bare-salus devices.
- siteNameFilter (:204) anchors ^gk-({siteNo})(?![0-9]) against the normalised name. The normalised name does not begin with the site number, so even if a device were returned it would be filtered out.
- fetchLiveSitesByNumber (:915-1011) orchestrates fetch + dedup + filter + telemetry + map + cache. No bare-salus device ever reaches the byId map.

**What already works once a device is loaded (no change needed in Build).**

- classifyDevice (:388) reaches deviceType "salus" via the name-token path. FORWARD_ONLY_TOKENS (:472) prevents the old salus-it700 bleed.
- deriveArea (:569-586) reads CLIENT_SCOPE site letter first (:571-574), then the raw-name trailing bracket (:579-581), using parseSiteCodeLetter (:516). Letters r/b give Bar/Restaurant; s/f give Accommodation; anything else gives null.
- mapTbDevice (:720) sets online from lastActivityTime freshness (:745), not hardcoded. isDuplicate (:755) is not triggered by older names (no "old" substring).
- heatingDevices (flows.js:124) includes deviceType "salus". isDarkFleet (:139) is true for "salus". hasUnmappedHeating (:158) currently includes any device with area null.
- registry.js:113-118 sets the "salus" control contract to controllable false and dark true. Control is refused at the server whatever the screen shows.

**Key function signatures Build adds or wraps.**

fetchTbDevicesForText(textSearch) -- body of today's fetchTbDevicesForToken loop extracted so the bracket search can share pagination and the TB_PAGE_CAP (50) guard. fetchTbDevicesForToken(brand, token) becomes a thin wrapper calling fetchTbDevicesForText. legacySalusSiteNo(rawName) and isLegacySalusForSite(rawName, siteNo) are new pure exports placed directly after siteNameFilter (:204-208). isUnplacedLegacySalus(d) and unplacedLegacySalus() are new pure helpers placed directly after hasUnmappedHeating (flows.js:158-160).

**Fixture mode and e2e.**

Fixture mode (:1063) does not call fetchLiveSitesByNumber. The e2e suite drives the screen through data/fixtures/bridge-devices.json device lists. Unit tests exercise fetchLiveSitesByNumber through the axios adapter interceptor pattern established in test/tb-device.test.js. The existing `e2e (playwright)` and `unit tests` CI checks are both required and must stay green throughout.

---

## 2. Files to touch (complete list)

| File | Change type | Work unit |
|---|---|---|
| services/tb-device.js | Add two pure exports + refactor fetch + extend filter | WU1, WU2, WU3 |
| public/js/flows.js | Add two helpers + update hasUnmappedHeating + update devicesForArea + heading step 0 alert + reading line + area-not-reporting note + dark-fleet plural | WU4, WU5 |
| docs/bau-support/mockups/bau-support-guide.html | Four text-only edits G1-G4 | WU6 |
| test/legacy-salus-site-load.test.js | New -- U1-U12 | WU7 |
| test/legacy-salus-flow.test.js | New -- C1-C8 | WU7 |
| data/fixtures/bridge-devices.json | Add sites 7003 and 7004 | WU8 |
| tests/oohdash-128-legacy-salus.spec.js | New -- E1-E6 | WU9 |
| docs/project/DATA_DICTIONARY.md | Add 7 rows in "Derived device fields" | WU10 |
| test/live/legacy-salus-sitecheck.test.js | New -- OQ6 live read-only spot-check | WU11 |
| RELEASE_NOTES.md | Add v1.4.1 entry | WU12 |

Not touched: data/site-aliases.json, services/registry.js, routes/api.js, services/control.js, public/js/views.js, public/js/app.js, public/js/control.js, services/store.js, any CSS file, k8s manifests, Cosmos. package.json version and RELEASE_NOTES.md version field are bumped by scripts/release.sh at release, not during build -- WU12 adds only the narrative entry.

---

## 3. Build sequence (thirteen work units, dependency order)

Each unit is implemented to the house idioms, self-verified (builds clean, CI checks green for what it touches, no console or runtime errors), then committed on its own referencing OOHDASH-128. No unit is marked done until its self-verification actually passes.

**WU1 -- New pure helpers in services/tb-device.js (0.5 h)**

File: services/tb-device.js. Place the two functions directly after the closing line of siteNameFilter (:204-208). Both are exported so unit tests can import them directly.

Function legacySalusSiteNo(rawName): accepts any value, coerces to string. Returns null if the string does not contain "_salus_" (case-insensitive) -- this guards against the glued "_salusit500_" and "_salusit700_" tokens and against non-salus devices. Finds the LAST bracket group via the same trailing-group rule that deriveArea uses at :580 (regex /\(([^)]*)\)\s*$/). Returns null if no bracket, empty bracket, bracket with no hyphen after the digits, or a bracket whose first non-whitespace characters are not a digit run. Extracts the leading digit run before the first hyphen using /^\s*(\d+)\s*-/ and returns it as a string, never a number.

Function isLegacySalusForSite(rawName, siteNo): calls legacySalusSiteNo(rawName) and compares the result to String(siteNo) using strict string equality. Returns true only when both are non-null and exactly equal. "520" must not match "5204"; 5204 (number) must match "5204" (String(5204) === "5204").

Notes for Build: apply the check to the RAW name, not the normalised name (normaliseName removes the bracket). The hyphen requirement matches the confirmed live naming pattern and also rejects modern cross-reference brackets such as "(5135)" (no hyphen after digits) and "(JWTEST-R1)" (no leading digit run).

Self-verify: node --input-type=module <<'EOF' import { legacySalusSiteNo, isLegacySalusForSite } from './services/tb-device.js'; console.assert(legacySalusSiteNo('gk_x_salus_y (5204-f-1)') === '5204'); console.assert(legacySalusSiteNo('gk-5204-salusit500-r1 (1666-r-1)') === null); console.assert(isLegacySalusForSite('gk_x_salus_y (5204-f-1)', '5204')); console.assert(!isLegacySalusForSite('gk_x_salus_y (5204-f-1)', '520')); EOF

---

**WU2 -- Generalise fetchTbDevicesForToken into fetchTbDevicesForText (0.5 h)**

File: services/tb-device.js. At :775 today, fetchTbDevicesForToken(brand, token) issues textSearch=gk-{token} by calling fetchTbDevicePage in a pagination loop up to TB_PAGE_CAP. Extract the pagination body into a new unexported function fetchTbDevicesForText(textSearch) that accepts an already-constructed textSearch string and calls fetchTbDevicePage(textSearch, page) in the same loop. Wrap the existing callers: fetchTbDevicesForToken(brand, token) becomes return fetchTbDevicesForText(`${brand}-${token}`). Behaviour is byte-identical for all existing callers. fetchTbDevicePage (:769) already runs encodeURIComponent on textSearch, so "(5204-" will be sent as textSearch=%285204-.

Self-verify: npm run test:unit -- all existing tests pass unchanged (no behaviour change). Spot-check the request URL in test output to confirm the encoding.

---

**WU3 -- fetchLiveSitesByNumber: add parallel bracket lookup and extended filter (1.5 h)**

File: services/tb-device.js. Inside fetchLiveSitesByNumber (:915-1011), replace the single token-fetch block (:923-934 roughly -- from byId build through matched filter) with the following structure:

Step 1: the existing per-token loop runs as before, collected into tokenRaw.

Step 2: a supplementary bracket lookup runs in PARALLEL using fetchTbDevicesForText(`(${key}-`) where key is the siteNo string. This is the mechanism that textSearch=(5694- returns all 6 bare-salus for site 5694. The call is wrapped in .catch(err => ...) so a failure returns [] and logs one console.warn line: "[TB] Older-Salus lookup failed for site {key} - continuing without it: {err.message}". Only the supplementary lookup is fail-soft; the token fetch still throws on failure (degraded mode unchanged).

Step 3: await Promise.all([tokenFetch, legacyFetch]) to run both in parallel. Wall-clock time is the slower of the two, not the sum.

Step 4: deduplicate by device ID across both result sets. Use a Map keyed by d?.id?.id || d?.id || d?.name (following the existing dedup idiom). Token results are added first; the supplementary results skip any ID already present.

Step 5: keep a device if filter.test(normaliseName(d.name)) (the existing anchored siteNameFilter, UNCHANGED) OR isLegacySalusForSite(d.name, key) (the new strict guard). The OR is additive -- it can only add devices that pass the strict check; it cannot remove any device that the existing filter would have kept.

Everything from the matched array onward (:936 onwards) is unchanged: fetchTelemetry(matched), mapTbDevice per device, freshness debounce, boilerControl derivation (older units are not on the boilerControl profile so nothing changes there), Zendesk enrichment, cache write.

Properties this preserves:

- The existing siteNameFilter is not modified. Modern devices load via exactly the existing path.
- The new supplementary path is additive only. It cannot remove devices that already load.
- The _salus_ guard in legacySalusSiteNo prevents non-salus devices from entering via the bracket path.
- The exact-siteNo string equality in isLegacySalusForSite prevents cross-site contamination.
- The empty-site path (:964-968): a site whose only devices are older units now returns a site object where today it returns []. This is intended -- it is the 5191 total-failure fix.
- The 30-second perSiteCache (keyed by siteNo, LIVE_CACHE_TTL 30s) now simply stores the larger device list. No new cache. The cache-reset helpers (:1171, :1178) still clear everything.
- Fixture mode (:1063) does not call fetchLiveSitesByNumber. E2e coverage of the screen comes from fixture sites (WU8, WU9).

Self-verify: npm run test:unit -- U3 through U12 (WU7) pass. Manual smoke: DATA_MODE=live node -e "import('./services/tb-device.js').then(m => m.getSitesByNumber('5694').then(r => console.log(r[0].devices.length)))" should return 6 older units plus modern devices (requires CIR credentials).

---

**WU4 -- public/js/flows.js: new helpers and fallback-button exclusion (0.75 h)**

File: public/js/flows.js. Design section 4.1 and 4.2.

4.1 New helpers: place directly after hasUnmappedHeating (:158-160).

    function isUnplacedLegacySalus(d) { return !!d && d.deviceType === 'salus' && !d.area; }
    function unplacedLegacySalus() { return heatingDevices().filter(isUnplacedLegacySalus); }

4.2 Keep unplaced older units out of the fallback button (D3, James's selection):

- hasUnmappedHeating (:158): change the predicate to heatingDevices().some(d => !d.area && !isUnplacedLegacySalus(d)). Unmapped iT500 and boiler-panel devices keep today's "Heating - area not identified" button exactly as it is.
- devicesForArea(null) (:165): change to heatingDevices().filter(d => !d.area && !isUnplacedLegacySalus(d)). The existing AC1/7.2 e2e test on fixture 6218 stays green (that fixture has no bare-salus devices).

Self-verify: npm run test:unit -- existing tests pass. C4 and C5 (WU7) pass to confirm the exclusion logic.

---

**WU5 -- public/js/flows.js: screen copy additions (1.0 h)**

File: public/js/flows.js. Design sections 4.3, 4.4, 5.1-5.4.

4.3 Heating step 0 (:455-468):

- Footnote: append the unplaced-unit footnote HTML (data-testid="heating-unplaced-note", class "small", 10px top margin) after the area-button row in the returned HTML. Also append it in the no-area branch. Show it only when unplacedLegacySalus().length > 0.
- No-area branch (:457): when unplacedLegacySalus().length > 0, the alert text becomes "No heating area can be checked on Lighthouse at this site." followed by the footnote and then otherShortcut(). When it is 0, the text stays exactly "No heating on Lighthouse at this site." -- the control.spec.js:140 assertion is unchanged.

Footnote copy (section 5.3 of design):
- n=1, all offline: "Also at this site: 1 older Salus heating unit that could not be matched to an area. It is not reporting and is not used in this check."
- n>1, all offline: "Also at this site: {n} older Salus heating units that could not be matched to an area. They are not reporting and are not used in this check."
- any online: same first sentence, then "It is not used in this check." or "They are not used in this check." (not "not reporting").

4.4 Heating step 1 reading line (:517-520) and dark-fleet outcome (:483-501):

- Compute nOn = set.filter(d => d.online).length and nOff = set.length - nOn.
- Reading line (liveNote, non-boiler branch): when nInArea > 1 and nOff === 0, unchanged ("coldest of N zones in Area"). When nInArea > 1 and nOff > 0 and nOn === 1, use "the only reporting zone in {Area}". When nInArea > 1 and nOff > 0 and nOn >= 2, use "coldest of {nOn} reporting zones in {Area}". This keeps the existing AC2 e2e green (that scenario has all devices online).
- Area-not-reporting note (data-testid="area-not-reporting-note", class "small"): when nOff > 0, add one line between the zoneread block and the "What does the caller need?" question. Singular: "1 other heating unit in {Area} is not reporting, so it is not part of this reading. Nothing done on this call caused this." Plural: "{n} other heating units in {Area} are not reporting, so they are not part of this reading. Nothing done on this call caused this." Do not show when nOff === 0.
- Dark-fleet outcome plural (when set.length > 1): Heading: "The heating units in this area are not reporting." Body: "They are Salus units that have stopped sending live data to Lighthouse, so there is no live reading and they cannot be switched or adjusted from here. This usually means the devices have lost power or their connection." The single-device copy is unchanged (OOHDASH-123 e2e stays green).

No change to views.js, control.js, routes, registry or CSS. Existing classes (.small, .alert.warn, .reco) are reused.

Self-verify: npm run test:unit -- C1-C8 (WU7) pass. npx playwright test tests/oohdash-128-legacy-salus.spec.js -- E1-E4 pass.

---

**WU6 -- docs/bau-support/mockups/bau-support-guide.html: four text edits (0.5 h)**

File: docs/bau-support/mockups/bau-support-guide.html. This 5.4 MB self-contained page is the OOHDASH-113 handler guide. Edit text only -- no screenshot retakes needed because the area-question screenshot is still accurate. Use targeted sed or text-safe edit, not a full file read into context.

G1: At id="issue-heating", after the "If the heater isn't responding" block, insert a new paragraph with heading "Some heating units are not reporting": "Some pubs have older Salus thermostats that stopped sending data to Lighthouse in June 2026. From v1.4.1 the dashboard counts them, so you may see a line such as '3 other heating units in Accommodation are not reporting'. This is not a new fault and nothing you did caused it. The reading shown comes from the unit that is reporting, and you can carry on with the caller as normal."

G2: At id="issue-heating", same place, insert a new paragraph with heading "If nothing in the area is reporting": "You will see 'This heating device is not reporting' (or 'The heating units in this area are not reporting'). There is no live reading and nothing can be changed from here. Use Capture and escalate so the IoT team can check the device, or end with no action if the caller does not want a follow-up."

G3: At id="screen-words", in the table "Is the equipment reachable?", add a new row. On screen column: "not reporting". Meaning column: "The device has stopped sending data to Lighthouse altogether, usually lost power or connection. It cannot be read or changed here. Capture it for the IoT team."

G4: At id="faq", add a new question: "The heating step says an older Salus unit could not be matched to an area. What do I do?" Answer: "Nothing extra on the call. That unit's label does not say which part of the pub it heats, so the dashboard leaves it out of the check and tells you it exists. Answer the caller about the area they mean. The IoT team is fixing these labels separately."

Self-verify: grep the file for the G1 heading text after edit to confirm insertion landed. File must remain valid HTML (check with node -e "require('fs').readFileSync(...).toString().includes('Some heating units are not reporting')" or equivalent).

---

**WU7 -- Unit tests: legacy-salus-site-load and legacy-salus-flow (2.0 h)**

**test/legacy-salus-site-load.test.js (new, U1-U12)**

Pattern: node:test with an axios adapter interceptor, copied from test/tb-device.test.js. DATA_MODE=live is set before the dynamic import. Use __resetLiveCache between cases. Test data is inline; real live names are used verbatim.

TB device fixture data (id, name, type, lastActivityAgeMs, clientScope.site):

    m1  gk-5204-salusit700                                default  600000   -
    m2  gk-5204-lwgateway-1                               default  600000   -
    b1  gk_bramleyfarm_salus_STA10109321 (5204-f-1)       default  none     (5204-f-1)
    b2  gk_bramleyfarm_salus_STA10109322 (5204-f-2)       default  none     (5204-f-2)
    b3  gk_bramleyfarm_salus_STA10109323 (5204-f-3)       default  none     (5204-f-3)
    b4  gk_bramleyfarm_salus_STA10109324 (5204-r-2)       default  none     (5204-r-2)
    b5  gk_bramleyfarm_salus_STA10109325 (5204-r-3)       default  none     (5204-r-3)
    b6  gk_bramleyfarm_salus_STA10109369 (5204-z-1)       default  none     (5204-z-1)
    x1  gk_wingfieldfarm_salus_STA10108576 (5694-r-2)     default  none     (5694-r-2)
    x2  gk_unknown_salus_STA10108639 (5788-1-s)           default  none     (5788-1-s)
    x3  gk_unknown_salus_STA10108419 (?7?4-?-?)           default  none     (?7?4-?-?)
    x4  gk_unknown_salus_STA10108795 5791-r-2             default  none     -
    x5  gk-6360-maindb-r10a (5204-a-1)                    default  600000   -

Serials b1-b5 are test-data stand-ins in the real 5204 naming pattern; b6, x1-x4 are verbatim live names. x5 is a synthetic hostile name (non-_salus_ bracket carrying 5204).

| ID | Case | Expected |
|---|---|---|
| U1 | legacySalusSiteNo table: b1 gives "5204"; b6 gives "5204"; x2 gives "5788"; x3 gives null; "(JWTEST-R1)" gives null; "()" gives null; x4 (no bracket) gives null; x5 gives null (no _salus_); "gk_x_SALUS_y (5204-r-1)" gives "5204" (case-insensitive); "gk-1666-salusit500-r1 (1666-r-1)" gives null (glued _salusit500_) | Exact values as listed |
| U2 | isLegacySalusForSite: b4 vs "520" false; vs "5204" true; vs "52040" false; vs 5204 (number) true (String(5204)==="5204"); "gk_x_salus_y (05204-r-1)" vs "5204" false (leading zero) | Strict string equality |
| U3 | Site 5204. Token search returns m1, m2. Bracket search returns b1-b6. | Workspace = m1, m2, b1-b6 (8 devices). b1-b3 Accommodation. b4-b5 Bar/Restaurant. b6 area null. All b* deviceType "salus", online false. |
| U4 (T4 anti-bleed hostile TB) | Adapter answers ANY "(" search with every older-unit fixture (b1-b6, x1-x4) plus x5 | Site 5204 gets exactly b1-b6. Site 520 gets zero older units. x5 never accepted (no _salus_ in name). x1 rejected (siteNo "5694" !== "520" and !== "5204" for site 5204 check). |
| U5 | Duplicate: adapter returns b1 from BOTH searches (same id) | b1 appears exactly once in workspace |
| U6 (T2 no regression) | Existing fixture site 6261 (tb-devices.raw.json); bracket search returns [] | deviceIds deep-equal the pre-change list. Exactly one extra request URL containing textSearch=%286261- in the trace. |
| U7 | Bracket search throws a 500 | Site still returns m1, m2. console.warn called once with "Older-Salus lookup failed for site 5204". No throw from getSitesByNumber. |
| U8 | Token search throws | getSitesByNumber still rejects (degraded mode unchanged) |
| U9 | Cache: two calls to getSitesByNumber('5204') within 30s | Second call makes 0 TB requests. After __resetLiveCache, both searches run again on the third call. |
| U10 (T8 active device) | b4 with fresh lastActivityTime (age 10 min) | b4 is online true. Area is still Bar/Restaurant. control is still null; registry still refuses it (controllable false for "salus"). |
| U11 (T1 total failure 5191) | Token search returns []. Bracket search returns "gk_cherrytreefarm_salus_STA10108309 (5191-f-2)". | Returns 1 site holding 1 device with Accommodation area. Today this path returns []. |
| U12 (T5 D2 deferred no-bracket) | Site 5791: bracket search returns "gk_pinetreefarm_salus_STA10109673 (5791-z-1)". x4 (no bracket) exists but contains no "(5791-". | Workspace holds the z-1 unit only. x4 is absent. |

**test/legacy-salus-flow.test.js (new, C1-C8)**

Pattern: vm-sandbox style (as in test/aircon-removal.test.js). Workspace is injected as state.workspace.devices. All cases check DOM output from flows.js heating step.

| ID | Case | Expected |
|---|---|---|
| C1 | ws = 5204 set: 1 online iT700 Accommodation 19.5 C, 3 offline salus Accommodation, 2 offline salus Bar/Restaurant, 1 offline salus area null | Step 0 HTML has area-accommodation and area-bar-restaurant buttons. NO area-unmapped button (D3). heating-unplaced-note present containing "1 older Salus heating unit". |
| C2 | Choose Accommodation | Contains "the only reporting zone in Accommodation" and "3 other heating units in Accommodation are not reporting". "Nothing done on this call caused this." present. need-warm button present. |
| C3 | Choose Bar/Restaurant | Contains reco-dark-fleet with "The heating units in this area are not reporting." No need-warm or need-cool button. |
| C4 | ws = 1 unmapped online iT500 plus 1 unplaced salus | area-unmapped button present (iT500 kept). Fallback device set excludes the salus unit. heating-unplaced-note present. |
| C5 | ws = only 1 unplaced salus | Alert text "No heating area can be checked on Lighthouse at this site." plus heating-unplaced-note. No area-chip buttons. |
| C6 | ws = no heating devices at all | Exactly "No heating on Lighthouse at this site." heating-unplaced-note absent. |
| C7 | 2 unplaced salus, 1 of them online | Footnote ends "They are not used in this check." (not "They are not reporting"). |
| C8 | Area of 2 online iT700 units | Reading line still "coldest of 2 zones in Accommodation". area-not-reporting-note absent (nOff === 0). |

Self-verify: npm run test:unit -- U1-U12 and C1-C8 all pass, plus all existing tests unchanged.

---

**WU8 -- data/fixtures/bridge-devices.json: add sites 7003 and 7004 (0.5 h)**

File: data/fixtures/bridge-devices.json. Fixture devices are served as-is by fixture mode, so they carry a pre-derived `area` field exactly as mapTbDevice would set it. Unique site numbers 7003 and 7004 are chosen so no existing spec counts fixture sites or references them (confirmed by grep).

Site 7003 "Bramley Farm Inn" address "Test Row, Leeds LS3":

    gk-7003-salusit700                            salus-it700  heating  Accommodation   online true   telemetry { localTemperature:19.5, heatingSetpoint:21, mode:"Heat" }
    gk_bramleyfarm_salus_STA10109321 (7003-f-1)   salus        heating  Accommodation   online false  telemetry {}
    gk_bramleyfarm_salus_STA10109322 (7003-f-2)   salus        heating  Accommodation   online false  telemetry {}
    gk_bramleyfarm_salus_STA10109323 (7003-f-3)   salus        heating  Accommodation   online false  telemetry {}
    gk_bramleyfarm_salus_STA10109324 (7003-r-2)   salus        heating  Bar/Restaurant  online false  telemetry {}
    gk_bramleyfarm_salus_STA10109325 (7003-r-3)   salus        heating  Bar/Restaurant  online false  telemetry {}
    gk_bramleyfarm_salus_STA10109369 (7003-z-1)   salus        heating  null            online false  telemetry {}

Site 7004 "Pine Tree Farm" address "Test Row, Leeds LS4":

    gk_pinetreefarm_salus_STA10109673 (7004-z-1)  salus        heating  null            online false  telemetry {}
    gk-7004-lwgateway-1                           gateway      gateway  null            online true

Self-verify: node -e "const f = JSON.parse(require('fs').readFileSync('data/fixtures/bridge-devices.json','utf8')); console.assert(f.find(s=>s.siteNo==='7003').devices.length===7); console.assert(f.find(s=>s.siteNo==='7004').devices.length===2);"

---

**WU9 -- tests/oohdash-128-legacy-salus.spec.js: Playwright e2e (1.0 h)**

File: tests/oohdash-128-legacy-salus.spec.js. Uses signIn and confirmSite helpers from tests/helpers.js. Test sites 7003 and 7004. All assertions check the DOM via data-testid selectors.

| ID | Steps | Expected (DOM) |
|---|---|---|
| E1 | signIn, confirmSite(7003, "Bramley Farm Inn"), tile-heating | area-accommodation and area-bar-restaurant visible. area-unmapped count 0 (D3 confirmed). heating-unplaced-note contains "1 older Salus heating unit that could not be matched to an area". flow-panel does not contain "STA101" (no device names on screen). |
| E2 (T6 blast-radius) | 7003 then click area-accommodation | .flowbody contains "19.5". Reading line contains "the only reporting zone in Accommodation". area-not-reporting-note contains "3 other heating units in Accommodation are not reporting" and "Nothing done on this call caused this". need-warm visible. |
| E3 (T1 dark-fleet Bar/Restaurant) | 7003, click area-bar-restaurant | reco-dark-fleet contains "The heating units in this area are not reporting." need-warm count 0. dark-capture then record-outcome gives outcome-captured containing "not reporting". |
| E4 (T7 footnote-only total failure) | signIn, confirmSite(7004, "Pine Tree Farm"), tile-heating | .alert.warn contains "No heating area can be checked on Lighthouse at this site.". heating-unplaced-note visible. No area-accommodation or area-bar-restaurant chips. |
| E5 (T2 regression) | Run the full existing suite: area-model, rosetta-dark-fleet-and-schedule, control, and every other spec | All pass unchanged. No new devices in 7003/7004 appear in unrelated tests. |
| E6 (phone layout) | E1 and E2 steps at viewport 390 x 844 | No horizontal scroll (page.evaluate document.scrollWidth <= innerWidth). area-not-reporting-note and heating-unplaced-note visible without scroll. |

Self-verify: npx playwright test tests/oohdash-128-legacy-salus.spec.js -- all 6 pass. npx playwright test -- full suite green.

---

**WU10 -- docs/project/DATA_DICTIONARY.md: seven new rows (0.25 h)**

File: docs/project/DATA_DICTIONARY.md. In the section "Derived device fields", add:

| Name | Kind | Meaning | Source | Retention/sensitivity |
|---|---|---|---|---|
| legacySalusSiteNo(rawName) | Pure function (server) | Site number from an older Salus name's trailing bracket, or null | services/tb-device.js | Not stored. Low. |
| isLegacySalusForSite(rawName, siteNo) | Pure function (server) | Cross-site guard: strict string equality of parsed siteNo | services/tb-device.js | Not stored. Low. |
| Legacy Salus site code | TB naming convention | Trailing "(NNNN-L-n)" on gk_{sitename}_salus_{serial} names. L is s/f/r/b. | ThingsBoard entity name and CLIENT_SCOPE site attribute | Read-only. Low. |
| device.deviceType = "salus" | Existing derived field | Older-convention Salus thermostat (classifyDevice) | classifyDevice in tb-device.js | Per request. Low. |
| device.area | Existing derived field | Accommodation, Bar/Restaurant or null | deriveArea in tb-device.js | Per request. Low. |
| isUnplacedLegacySalus(d) | Client predicate | deviceType "salus" with area null | public/js/flows.js | Not stored. Low. |
| area-not-reporting-note | UI test id | Silent-units note under an area reading | flows.js | n/a |
| heating-unplaced-note | UI test id | Site-level footnote for unplaced older units | flows.js | n/a |

No personal data. No new stored fields. No Cosmos or Zendesk change.

Self-verify: file saves cleanly; no duplicate rows.

---

**WU11 -- test/live/legacy-salus-sitecheck.test.js: OQ6 opt-in live spot-check (0.5 h)**

File: test/live/legacy-salus-sitecheck.test.js (new). Pattern follows test/live/false-offline-live.test.js: JWT from CIR credentials/thingsboard.env. Reports skip-with-reason (never a silent pass) when credentials are missing. Calls the built getSitesByNumber in DATA_MODE=live. This test is read-only and opt-in; it is NOT run as part of the CI "unit tests" check. It is run manually by the orchestrator or tester as the OQ6 pre-ship gate item and its result is recorded in the release preflight doc.

For every site in the table below, the test asserts:

- The modern (non-older-unit) device IDs equal the v1.4.0 output. A baseline capture run against main must be performed first.
- Every older unit returned has legacySalusSiteNo(rawName) === String(siteNo).
- No device ID appears twice in the workspace (dedup confirmed).
- No device whose parenthetical siteNo does not equal the target site number is present (strict cross-site guard).

| Site | Why chosen | Older units expected | Must NOT appear |
|---|---|---|---|
| 5694 | Discovery baseline | 6: r-1, r-2 (Bar/Restaurant); f-1, f-2, f-3, s-1 (Accommodation) | Any device whose bracket is not "(5694-..." |
| 5204 | Malformed letter (z) alongside well-formed codes | 6: r-2, r-3 (Bar/Restaurant); f-1, f-2, f-3 (Accommodation); z-1 (area null) | Anything from site 520 or 52040; anything whose siteNo is not "5204" |
| 5788 | Swapped code "(5788-1-s)" alongside well-formed codes | r-1, r-2 (Bar/Restaurant); f-1, f-2, f-3 (Accommodation); 1-s (area null) | Anything not 5788 |
| 5191 | Total-failure site, only older units in TB | 1: f-2 (Accommodation) | Anything not 5191 |
| 5791 | No-area older unit plus the deferred no-bracket units | 1: z-1 (area null). No-bracket units (r-2, f-1, f-2) ABSENT. | Anything not 5791; the no-bracket units |

Pass rule: all five sites green; any foreign device is a hard stop; any expected device absent is a hard stop. Result recorded in the release preflight doc before release.

Post-deploy smoke (after live deployment): open site 5204, then Heating in the live dashboard, and confirm sections 5.1-5.3 render: the reading line, the area-not-reporting note, and the heating-unplaced-note for the z-1 unit.

Self-verify: node test/live/legacy-salus-sitecheck.test.js with valid CIR credentials. All five sites must report green. Log the output in the release preflight doc.

---

**WU12 -- RELEASE_NOTES.md: v1.4.1 entry (0.25 h)**

File: RELEASE_NOTES.md. Add a v1.4.1 entry (the release doer will set the exact date and bump package.json using npm run release:patch). The entry must state: (1) older-convention Salus thermostats now load into the site workspace on all 74 affected sites; (2) Bar/Restaurant now appears at site 5191 (total-failure site now resolved); (3) site 5791 Bar/Restaurant remains pending OOHDASH-129 (the deferred no-bracket device); (4) the mixed-health Accommodation state on 72 sites is accurate and expected -- the reading comes from the modern thermostat, and older units show honestly as not reporting; (5) four new paragraphs have been added to the handler support guide (OOHDASH-113).

Self-verify: file saves cleanly; entry appears at the top of the release notes above v1.4.0.

---

**WU13 -- Full suite verification and self-audit (0.5 h)**

Run npm run test:unit -- zero failures, warnings treated as errors.
Run npx playwright test -- full suite green including oohdash-128-legacy-salus.spec.js and all existing specs.

Self-audit the changed files for: dead code or functions defined but never called; handlers wired to missing functions; unhandled failure paths on I/O and API calls; state flags not reset on error; any secret or credential in a committed file. Specifically check: the fail-soft catch on the bracket fetch emits the console.warn and does not swallow the error silently; isUnplacedLegacySalus is consumed by hasUnmappedHeating, devicesForArea, and unplacedLegacySalus; the footnote is shown only when n > 0; the area-not-reporting note is shown only when nOff > 0; the reading-line change does not affect the nOff === 0 path (existing e2e AC2 stays green).

Smoke-test in fixture mode: confirm site 7003 renders the mixed-health Accommodation reading and the footnote; confirm site 7004 renders the no-area alert and footnote; confirm site 6261 (existing) renders exactly as before v1.4.1.

---

## 4. Unit test map (20 tests, 2 files)

| File | Tests | Count |
|---|---|---|
| test/legacy-salus-site-load.test.js | U1 (legacySalusSiteNo table), U2 (isLegacySalusForSite strict equality), U3 (site 5204 full workspace), U4 (anti-bleed hostile TB), U5 (duplicate dedup), U6 (site 6261 no regression), U7 (bracket fetch 500 fail-soft), U8 (token fetch throws), U9 (cache behaviour), U10 (active device T8), U11 (5191 total failure T1), U12 (5791 no-bracket D2) | 12 |
| test/legacy-salus-flow.test.js | C1 (step 0 mixed ws), C2 (Accommodation reading line + note), C3 (Bar/Restaurant dark-fleet plural), C4 (iT500 unmapped plus unplaced salus), C5 (only unplaced salus no-area alert), C6 (no heating at all), C7 (unplaced with one online), C8 (two online units no note) | 8 |
| **Total** | | **20** |

---

## 5. E2e test map (6 journeys, 1 new spec file)

| ID | Design test | Journey |
|---|---|---|
| E1 | T6 + T7 | 7003 step 0: mixed health step, footnote, no device names, no area-unmapped button |
| E2 | T6 | 7003 Accommodation: reading line, area-not-reporting note, reassurance sentence, need-warm |
| E3 | T1 | 7003 Bar/Restaurant: dark-fleet plural heading, capture-and-record path |
| E4 | T7 | 7004: no-area alert reworded, footnote visible, no area chips |
| E5 | T2 | Full existing suite regression |
| E6 | -- | E1 + E2 at 390x844 viewport: no horizontal scroll, notes visible |

---

## 6. Discovery test coverage map

| Discovery test | Unit | E2e |
|---|---|---|
| T1 (Bar/Restaurant total failure) | U11 | E3 |
| T2 (modern devices no regression) | U6, C8 | E5 |
| T3 (mixed site, both sets) | U3 | E1 |
| T4 (anti-bleed 520 vs 5204) | U2, U4 | -- |
| T5 (no-paren deferred D2) | U12 | -- |
| T6 (blast-radius mixed health) | C2 | E2 |
| T7 (no-letter footnote OQ5) | C5 | E1, E4 |
| T8 (active bare-salus device) | U10, C7 | -- |

---

## 7. Existing test suites -- stay-green summary

| Suite | Risk | Mitigation |
|---|---|---|
| test/tb-device.test.js | URL guard at :198-207 asserts /api/tenant/devices path | New bracket URL is also /api/tenant/devices -- guard still holds. Adapter substring-matches names and returns [] for "(NNNN-" searches. |
| test/aircon-removal.test.js, test/control-live-signal.test.js | flows.js changes | isUnplacedLegacySalus only removes items from the null-area set when deviceType === "salus". No existing fixture has bare-salus devices. hasUnmappedHeating still true for iT500/boiler null-area devices. |
| tests/control.spec.js, tests/tonight-callback.spec.js | bridge-devices.json | Sites 7003/7004 are new unique IDs. No spec counts fixture sites by index or references 7003/7004. |
| tests/area-model.spec.js, tests/rosetta-dark-fleet-and-schedule.spec.js | flows.js changes | These specs use fixture sites with no bare-salus devices. All assertions are about existing device types. |
| All other unit test files | No production file they depend on is edited | No risk. |

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-site contamination | Low | High | Search text ends in a hyphen; strict string equality guard; _salus_ name check; U2, U4, and five-site live check (WU11) |
| Modern-device regression | Very low | High | Anchored siteNameFilter is byte-identical; OR is additive only; U6, E5, and the WU11 modern-list equality check |
| Handlers read the not-reporting note as a new fault | Medium | Medium | Reassurance sentence ("Nothing done on this call caused this."), guide G1/G4, release notes |
| Accommodation blast-radius on 72 sites | Certain | Medium | Mixed-health UX (5.1, 5.2) designed explicitly; C2, E2 verify it; guide G1 explains it |
| 30 no-letter devices leak null area into render path | Low (guarded) | Medium | isUnplacedLegacySalus guard keeps them out of the fallback button; footnote handles them; C1, C4, E1 verify |
| An older unit comes back to life (T8) | Low | Low | Freshness rule unchanged (U10). Registry refuses control because the "salus" contract is dark. |
| A new fixture site disturbs other e2e tests | Low | Low | Unique numbers 7003/7004; no spec counts fixture sites |
| Existing unit-test TB adapters see an extra "(NNNN-" search | Certain | None | Confirmed: adapters substring-match names and return [] for bracket-text searches; no existing assertion breaks |
| bau-support-guide.html edit corrupts the large file | Low | Low | Text-safe targeted edit only; verified by grep for inserted heading text |

---

## 9. OQ6 pre-ship spot-check (blocks release)

Full specification is in WU11 and section 1 above. Summary of pass/fail criteria per site:

| Site | Older units (exact count) | Cross-site guard | D2 deferred units |
|---|---|---|---|
| 5694 | 6 (r-1, r-2, f-1, f-2, f-3, s-1) | No non-5694 device | -- |
| 5204 | 6 (r-2, r-3, f-1, f-2, f-3, z-1) | Nothing from 520 or 52040 | -- |
| 5788 | 6 (r-1, r-2, f-1, f-2, f-3, 1-s) | No non-5788 device | -- |
| 5191 | 1 (f-2) | No non-5191 device | -- |
| 5791 | 1 (z-1) | No non-5791 device | r-2, f-1, f-2 must be absent |

Any foreign device on any site is a hard stop. The result is recorded verbatim in the release preflight doc. The test runner is the orchestrator or tester, not the CI suite.

---

## 10. Plan-vs-design deviations

None anticipated. This plan implements the design's sections 3 through 8 and 12 verbatim. The fixture site numbers 7003/7004 were chosen by the plan (the design specifies the device shapes, not the numbers) -- this is a minor inference, not a deviation.

---

## 11. Effort estimate and sequencing

| WU | Description | Hours |
|---|---|---|
| WU1 | Pure helpers legacySalusSiteNo + isLegacySalusForSite | 0.5 |
| WU2 | Generalise fetchTbDevicesForText | 0.5 |
| WU3 | fetchLiveSitesByNumber bracket lookup + extended filter | 1.5 |
| WU4 | flows.js helpers + fallback button exclusion | 0.75 |
| WU5 | flows.js screen copy | 1.0 |
| WU6 | Support guide G1-G4 | 0.5 |
| WU7 | Unit tests U1-U12 + C1-C8 | 2.0 |
| WU8 | Fixture sites 7003 + 7004 | 0.5 |
| WU9 | Playwright e2e E1-E6 | 1.0 |
| WU10 | DATA_DICTIONARY.md | 0.25 |
| WU11 | OQ6 live spot-check test | 0.5 |
| WU12 | RELEASE_NOTES.md entry | 0.25 |
| WU13 | Full suite verification + self-audit | 0.5 |
| | Total | 9.75 |

Build branch: build/oohdash-128-legacy-salus-load (off main, cut at build start). Spine: WU1 -> WU2 -> WU3 (server path). WU4 -> WU5 (flows path, parallel with WU2/WU3). WU6 parallel with WU4/WU5. WU7 after WU3 and WU5 (tests verify both). WU8 -> WU9 (fixtures then e2e). WU10, WU11, WU12 parallel after WU7. WU13 last.

---

## 12. Handoff to Test and Release

Build to this plan and the design contract. The load-bearing moments from the design must not be flattened: the fail-soft on the bracket lookup only (token fetch degraded mode unchanged); unplaced units kept out of the fallback button (D3 James selection); the reassurance sentence in the area-not-reporting note.

All 13 work units committed incrementally. Both CI suites green. App runnable in fixture mode for the reviewer. Build summary to record: features implemented; features passing self-test; OQ7 and OQ8 still open as non-blocking questions; zero plan-vs-build divergences (or enumerate any that arose); standards file: idioms of the existing codebase (vanilla JS, Node/ESM, node:test, Playwright).

The release doer cuts v1.4.1 via npm run release:patch after the OQ6 live spot-check (WU11) records a clean five-site pass in the preflight doc. Rollback: redeploy the v1.4.0 image; check resources are preserved.
