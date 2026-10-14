<!-- gate:contract
SECTION: What this test gate covers
OOHDASH-128 (Bug, v1.4.0 -> v1.4.1). This is the Test-RESULTS artefact for the merged build (PR #102, merge 06c330e, branch build/oohdash-128-legacy-salus-load). It records an independent review of the as-built code against the Build Plan (PR #101) and Design (PR #100), the full unit and Playwright e2e suite results, an exploratory fixture-mode run at desktop and 390px mobile, and the OQ6 live read-only spot-check against prod ThingsBoard on five sites. No product code was written or modified during testing.

SECTION: Verdict
PASS. All 20 OOHDASH-128 unit tests (U1-U12, C1-C8) pass. All 6 OOHDASH-128 Playwright e2e tests (E1-E6) pass. Full unit suite: 411 pass, 1 skip (pre-existing IOT_REPO_PATH skip in notes-coverage-guard.test.js -- not related to this ticket), 0 fail (412 total). Full Playwright suite: 150 pass, 2 skip (pre-existing TF-18 and TF-19 in oohdash-119.tester.spec.js -- those tests skip at runtime when the fixture site has no control tile, not a new skip), 0 fail. OQ6 live spot-check: 5 of 5 sites pass (zero foreign devices, all expected older units found, no no-bracket units in 5791). No defects found. Ready for release-preflight.

SECTION: Code review vs plan (independent, as-built only)
legacySalusSiteNo (WU1): implemented exactly per spec. Regex /[_]salus[_]/i correctly guards against glued salusit500/salusit700 tokens. LAST parenthetical group rule matches deriveArea:580. Leading digit-then-hyphen pattern returns string, never number. All null cases match spec: no _salus_, no bracket, empty bracket, no digit-hyphen, placeholder. PASS.

isLegacySalusForSite (WU1): strict string equality, String(siteNo) conversion, never Number(). "520" !== "5204" confirmed by U2. PASS.

fetchTbDevicesForText / fetchTbDevicesForToken (WU2): extraction is byte-identical for existing callers. fetchTbDevicePage already encodes textSearch with encodeURIComponent, so "(5694-" becomes textSearch=%285694-. PASS.

fetchLiveSitesByNumber (WU3): ONE implementation deviation from the plan. The plan described a sequential async IIFE for token fetches. The build uses tokens.map(token => fetchTbDevicesForToken(...)) so all token fetches also run in parallel. This is an improvement (lower wall-clock time) and non-regressive -- the plan's stated goal was to put the legacy fetch in parallel with the token work, which is achieved. The dedup order (token results first) is preserved. The fail-soft catch on the legacy lookup only is correct. The OR filter is additive only. The empty-site path (total-failure 5191 fix) is intact. PASS.

flows.js (WU4, WU5): isUnplacedLegacySalus is defined on line 174 but called from hasUnmappedHeating on line 162. Function declarations are hoisted in browser JS -- no ordering defect. hasUnmappedHeating exclusion of unplaced salus (D3) is correct. devicesForArea(null) exclusion matches. Footnote only shown when n > 0. Area-not-reporting note only shown when nOff > 0. Reading line nOn/nOff logic correct: all-online path unchanged (existing AC2/C8 green). Reassurance sentence "Nothing done on this call caused this." always present when nOff > 0. Dark-fleet plural activated when set.length > 1. PASS.

Support guide G1-G4 (WU6): all four edits verified by grep. "Some heating units are not reporting" (G1), "If nothing in the area is reporting" (G2), four occurrences of "not reporting" confirming G3 table row landed, "older Salus unit could not be matched" (G4). PASS.

DATA_DICTIONARY (WU10): all 7 new rows present in "Derived device fields" section. PASS.

RELEASE_NOTES (WU12): v1.4.1 entry present at top of file with all five required points (74 sites, 5191 resolved, 5791 pending OOHDASH-129, mixed-health Accommodation accurate, guide G1-G4 added). PASS.

SECTION: Unit test suite
Full command: npm run test:unit (node:test runner). Result: 411 pass, 1 skip, 0 fail (412 total, duration 5.5s).

Pre-existing skip: "[U13 SKIP] IOT_REPO_PATH '../iot-support-dashboard' not present -- vendored regex drift check skipped." This skip is in notes-coverage-guard.test.js and predates this ticket. The OOHDASH-128 tests are unaffected.

OOHDASH-128 unit results (all pass):
U1: legacySalusSiteNo table (10 sub-cases including case-insensitive, glued-token null, empty bracket null)
U2: isLegacySalusForSite strict equality ("520" false, "5204" true, "52040" false, number 5204 true, leading-zero "05204" false)
U3: site 5204 full workspace (8 devices: m1+m2 from token path, b1-b6 from bracket path; b1-b3 Accommodation, b4-b5 Bar/Restaurant, b6 area null)
U4: anti-bleed -- hostile TB returning all cross-site devices; site 5204 gets exactly b1-b6, site 520 gets zero, x5 (non-salus bracket) never accepted
U5: duplicate returned by both searches appears exactly once
U6: site 6261 device list unchanged; exactly one extra bracket request issued
U7: bracket fetch 500 -- site loads via token path, console.warn called once, no throw
U8: token fetch throws -- getSitesByNumber rejects (degraded mode unchanged)
U9: second call within 30s makes 0 TB requests; after __resetLiveCache both searches re-run
U10: bare-salus with fresh lastActivityTime (10 min) is online=true; area still Bar/Restaurant; control refused
U11: site 5191 with only bracket-returned device now resolves (was empty [])
U12: site 5791 -- z-1 (with bracket) present; x4 (no bracket) absent (D2 deferred)
C1: step 0 mixed workspace -- two area chips, NO area-unmapped (D3), heating-unplaced-note for z-1
C2: Accommodation -- "the only reporting zone in Accommodation", "3 other heating units in Accommodation are not reporting", reassurance present, need-warm present
C3: Bar/Restaurant -- plural dark-fleet heading "The heating units in this area are not reporting", no need-* buttons
C4: unmapped iT500 + unplaced salus -- area-unmapped chip present (iT500 kept), footnote present
C5: only unplaced salus -- "No heating area can be checked on Lighthouse at this site.", footnote present, no area chips
C6: no heating devices -- "No heating on Lighthouse at this site.", footnote absent
C7: 2 unplaced salus (1 online) -- "They are not used in this check." (not "not reporting")
C8: area of 2 online units -- "coldest of 2 zones in Accommodation" unchanged, area-not-reporting-note absent

SECTION: Playwright e2e suite
Full command: npx playwright test. Result: 150 pass, 2 skip, 0 fail (duration 4.4 min).

Pre-existing skips: TF-18 and TF-19 in tests/tester/oohdash-119.tester.spec.js skip at runtime via test.skip(true, 'No control tile on this fixture site') -- this fixture site has no boilerControl tile. Both skips predate OOHDASH-128 and are unaffected by it.

OOHDASH-128 e2e results (all pass):
E1: site 7003 heating step 0 -- two area chips, D3 guards area-unmapped (count 0), unplaced footnote shown
E2: site 7003 Accommodation -- reading from only online zone, three offline units noted
E3: site 7003 Bar/Restaurant -- plural dark-fleet heading, capture reaches outcome-captured
E4: site 7004 heating step 0 -- no area chips, reworded no-area alert, unplaced footnote visible
E5: regression -- existing site 6218 heating areas intact; no legacy-salus noise introduced
E6: 390x844 phone layout -- E1+E2 steps render without horizontal scroll

SECTION: Exploratory fixture-mode run (desktop 1280x900 and mobile 390x844)
Server started in DATA_MODE=fixture on port 3128. signIn and confirmSite helpers used exactly as in the Playwright suite.

E1 assertions observed directly:
- heating-unplaced-note count: 1 PASS
- area-accommodation count: 1 PASS
- area-bar-restaurant count: 1 PASS
- area-unmapped count: 0 (D3 confirmed) PASS
- footnote text: "Also at this site: 1 older Salus heating unit that could not be matched to an area. It is not reporting and is not used in this check." PASS

E2 (Accommodation after E1):
- area-not-reporting-note count: 1 PASS
- "the only reporting zone in Accommodation": true PASS
- "3 other heating units in Accommodation are not reporting": true PASS
- "Nothing done on this call caused this.": true PASS

E3 (Bar/Restaurant):
- reco-dark-fleet count: 1 PASS
- "The heating units in this area are not reporting.": true (plural heading) PASS

E4 (site 7004):
- alert text: "No heating area can be checked on Lighthouse at this site." PASS
- heating-unplaced-note count: 1 PASS

E5 regression (site 6218, existing fixture with unmapped iT500):
- area-accommodation: 1 PASS
- area-unmapped: 1 (iT500 keeps fallback chip) PASS
- heating-unplaced-note: 0 (no false positive from this fixture) PASS

E6 mobile 390x844:
- step 0: scrollWidth=390, innerWidth=390, no horizontal scroll PASS
- step 0: heating-unplaced-note visible: true PASS
- Accommodation: scrollWidth=390, innerWidth=390, no horizontal scroll PASS
- Accommodation: area-not-reporting-note visible: true PASS

Screenshots saved to docs/project/test-evidence/oohdash-128/ (6 PNGs: e1-e4 desktop, e6 step0+accommodation mobile).

SECTION: OQ6 live read-only spot-check (blocks release)
Command: node --test test/live/legacy-salus-sitecheck.test.js against portal.lhlive.co.uk (JWT auth, read-only, no writes). Result: 5 pass, 0 fail, 0 skip. Full output saved to docs/project/test-evidence/oohdash-128/oq6-spot-check-output.txt.

Site 5694 (discovery baseline): 14 total devices, 6 older units (r-2, f-1, f-3, r-1, s-1, f-2 -- all guard-checked: siteNo "5694"), 8 modern. No foreign devices. PASS.

Site 5204 (malformed letter z + well-formed codes): 13 total devices, 6 older units (f-3, r-2, r-3, z-1, f-1, f-2 -- all guard-checked: siteNo "5204"), 7 modern. No "520" or "52040" devices. PASS.

Site 5788 (swapped 1-s code): 11 total devices, 6 older units (f-1, f-3, r-2, r-1, f-2, 1-s -- all guard-checked: siteNo "5788"), 5 modern. No foreign devices. PASS.

Site 5191 (was described as total-failure): 2 total devices. 1 older unit (f-2, Accommodation, guard-checked: siteNo "5191") found. Also 1 modern gk-5191-salusit500-f2 device (not present during discovery; TB has evolved since 2026-10-14 sweep). Patch loads older f-2 correctly alongside the modern device. No foreign devices. PASS. Note: site 5191 is no longer a "total failure" site -- it has a modern device. The older unit f-2 is additive and correct.

Site 5791 (z-1 present; D2 deferred no-bracket units): 2 total devices. 1 older unit (z-1, area null, guard-checked: siteNo "5791") found. Also 1 modern gk-5791-salusit500-z1 device. No no-bracket units (gk_unknown_salus_STA10108795 5791-r-2 and others) present -- D2 deferred to OOHDASH-129 confirmed. PASS.

Cross-site guard: zero foreign devices across all five sites. Anti-bleed for "520" vs "5204" confirmed (no 520/52040 devices in 5204 workspace).

OQ6 verdict: PASS. Five of five sites clean. Release-preflight may proceed.

SECTION: 429 and rate-limit assessment
The build changed token fetches from sequential (plan's IIFE for-loop) to parallel (Promise.all over all tokens). Typical site has 1 token (bare siteNo); 5 sites in data/site-aliases.json have 1 extra alias token (max 2 tokens). So maximum concurrent requests at any site load is 3 (2 token + 1 legacy). The 30-second perSiteCache means at most 3 requests per site per 30s per open session. With ~11 live users across the estate, and only 74 sites affected, the realistic concurrency increase is negligible. No 429 risk.

SECTION: Defects found
None. All spec requirements are implemented as specified. The parallel token fetch (vs the plan's sequential IIFE) is a non-regressive improvement, not a defect. The site 5191 live data evolution (a modern iT500 now present in TB) is an informational observation, not a code defect.

SECTION: Residual risks
OQ7 (non-blocking): 18 older-unit devices whose bracket contains no parseable site number (placeholder codes, JWTEST-R1, empty bracket) cannot be loaded by Option A or any subsequent code change without data fixes. Owner: James. Does not block release.

OQ8 (non-blocking): whether a printed or PDF copy of the OOHDASH-113 handler guide has been issued and needs regenerating after G1-G4 edits. Owner: James. Does not block release.

Post-deploy smoke (out of scope for this gate, required at release): open site 5204 in the live dashboard, navigate to Heating, and confirm sections 5.1-5.3 render (reading line, area-not-reporting note, heating-unplaced-note for the z-1 unit). This is the release-preflight step specified in WU11.

DECISION: None - all gate decisions (D1, D2, D3, D4, OQ4, OQ5, OQ6) were settled at prior gates. OQ7 owner James (non-blocking: 18 older units with no parseable site number in bracket -- add to OOHDASH-129 or separate data clean-up?). OQ8 owner James (non-blocking: has a printed or PDF copy of the OOHDASH-113 handler guide been issued that must be regenerated?). No new test-stage fork requires James before release-preflight.
-->

# OOHDASH-128 -- Test Results

**Ticket:** OOHDASH-128 (Bug) | **Live:** v1.4.0 | **Target:** v1.4.1 (patch)
**Stage:** Test | **Date:** 2026-10-14 | **Branch:** test/oohdash-128-legacy-salus (worktree C:\harness-runs\gate128\test\ooh-triage-dashboard)
**Consumes:** Build plan PR #101; Build PR #102 (merge 06c330e, branch build/oohdash-128-legacy-salus-load onto main)
**Verdict: PASS -- ready for release-preflight**

---

## 1. Suite totals

| Suite | Pass | Skip | Fail | Notes |
|---|---|---|---|---|
| Unit (npm run test:unit) | 411 | 1 | 0 | Skip is pre-existing IOT_REPO_PATH guard in notes-coverage-guard.test.js |
| Playwright e2e (npx playwright test) | 150 | 2 | 0 | 2 pre-existing TF-18/TF-19 runtime skips in oohdash-119.tester.spec.js (no control tile in fixture) |
| OQ6 live spot-check | 5 | 0 | 0 | Five sites, read-only, against prod ThingsBoard |
| **Total** | **566** | **3** | **0** | |

OOHDASH-128 specific: U1-U12 (12 unit), C1-C8 (8 unit), E1-E6 (6 Playwright) -- all 26 PASS.

---

## 2. Code review (as-built vs plan)

### Conforms (all work units)

- WU1 legacySalusSiteNo and isLegacySalusForSite: exact spec match. Raw-name guard, trailing-bracket rule, string return, all null cases.
- WU2 fetchTbDevicesForText extraction: byte-identical for existing callers. encodeURIComponent confirmed in fetchTbDevicePage.
- WU3 fetchLiveSitesByNumber: fail-soft on legacy lookup only. Dedup preserves token-result priority. OR filter is additive only. Empty-site path (5191 fix) intact.
- WU4/WU5 flows.js: all four changes (isUnplacedLegacySalus, hasUnmappedHeating exclusion, devicesForArea exclusion, footnote + area-not-reporting note + dark-fleet plural) correct. Function hoisting handles the forward reference. D3 confirmed.
- WU6 support guide: G1, G2, G3, G4 all verified by grep.
- WU7 tests: implemented to spec; all pass.
- WU8 fixtures: sites 7003 (7 devices) and 7004 (2 devices) confirmed.
- WU9 Playwright spec: 6 tests, all pass.
- WU10 DATA_DICTIONARY: 7 rows confirmed.
- WU11 OQ6 live test: passes on all five sites.
- WU12 RELEASE_NOTES: v1.4.1 entry with all five required points.

### Implementation deviation (non-regressive)

The plan described token fetches inside a sequential async IIFE. The build runs token fetches via Promise.all (all tokens in parallel). This improves wall-clock time and does not affect correctness or the dedup order (token results still take priority over legacy results). Not a defect.

---

## 3. Exploratory run (fixture mode, desktop + mobile)

| Step | Key assertion | Result |
|---|---|---|
| E1 site 7003 step 0 | unplaced-note=1, accomm=1, bar=1, unmapped=0 (D3) | PASS |
| E1 footnote text | "Also at this site: 1 older Salus heating unit..." | PASS |
| E2 Accommodation | "the only reporting zone in Accommodation" | PASS |
| E2 Accommodation | "3 other heating units in Accommodation are not reporting" | PASS |
| E2 Accommodation | "Nothing done on this call caused this." | PASS |
| E3 Bar/Restaurant | "The heating units in this area are not reporting." (plural) | PASS |
| E4 site 7004 | "No heating area can be checked on Lighthouse at this site." | PASS |
| E4 site 7004 | heating-unplaced-note visible | PASS |
| E5 regression 6218 | accomm=1, unmapped=1 (iT500 kept), unplaced-note=0 | PASS |
| E6 mobile 390px step 0 | scrollWidth=innerWidth=390, unplaced-note visible | PASS |
| E6 mobile 390px Accommodation | no horizontal scroll, area-not-reporting-note visible | PASS |

---

## 4. OQ6 live spot-check results

| Site | Expected older units | Found | Foreign devices | Result |
|---|---|---|---|---|
| 5694 | 6 (r-1, r-2, f-1, f-2, f-3, s-1) | 6 | 0 | PASS |
| 5204 | 6 (r-2, r-3, f-1, f-2, f-3, z-1) | 6 | 0 | PASS |
| 5788 | 6 (r-1, r-2, f-1, f-2, f-3, 1-s) | 6 | 0 | PASS |
| 5191 | 1 (f-2) | 1 | 0 | PASS (note below) |
| 5791 | 1 (z-1); r-2, f-1, f-2 absent (D2) | 1; absent confirmed | 0 | PASS |

Note on 5191: the site now also has a modern gk-5191-salusit500-f2 device in TB (not present at discovery time). The older unit f-2 is correctly loaded alongside it. Accommodation at 5191 will show a mixed-health view: modern device online, f-2 offline. This is accurate and covered by the existing mixed-health UX.

Full output: docs/project/test-evidence/oohdash-128/oq6-spot-check-output.txt.

---

## 5. 429 / rate-limit assessment

Negligible risk. Site-aliases.json has 5 entries (max 1 extra token each). Typical site has 1 token. Worst-case concurrent requests at site load: 3 (2 token + 1 legacy). 30-second cache means no repeat. No 429 concern at realistic operator load.

---

## 6. Defects

None.

---

## 7. Open questions (non-blocking)

OQ7 (owner James): 18 older-unit devices whose bracket holds no parseable site number (placeholder codes like "?7?4-?-?", "(JWTEST-R1)", empty bracket) can never be loaded by this code path. Should they be added to OOHDASH-129 or handled by a separate IoT-team data clean-up?

OQ8 (owner James): has a printed or PDF copy of the OOHDASH-113 handler guide been issued? If so it must be regenerated to include G1-G4.

---

## 8. Recommendation

Ready for release-preflight (v1.4.1). OQ6 is satisfied. Post-deploy smoke (site 5204 heating, confirm reading line + area-not-reporting note + unplaced footnote render) is required at the release stage as specified in WU11.

---

*Test run: 2026-10-14. Worktree: C:\harness-runs\gate128\test\ooh-triage-dashboard (branch test/oohdash-128-legacy-salus, off main 06c330e). No product code written. No writes to any system. Test credentials used for read-only JWT auth against portal.lhlive.co.uk; not committed.*
