<!-- gate:contract
SECTION Decisions first: The OOHDASH-108 build is complete and self-verified against the approved design. One decision only: approve the build to advance to the Test phase. No product behaviour is open; both design decisions were implemented as approved (parenthetical fallback ON; iT700 100 percent rule untouched). No control path, command range or write state changed.
SECTION What was built: Old-convention "bare-salus" thermostats now resolve their heating area from the site-code letter instead of defaulting to Accommodation. A new `salus` device type carries the identical Salus setpoint and frost control contract (so no control change); the dead generic-salus asset row is repurposed to assign it; the name-match bleed that pulled a bare `salus` token into the glued iT700 row is closed; and deriveArea letter-resolves the new type, with a name-parenthetical fallback for the site letter when the CLIENT_SCOPE attribute is absent.
SECTION Files changed: services/registry.js adds the `salus` type. services/tb-device.js makes four changes — repurpose the dead ASSET_INTENT row, close the contained-by match bleed for the long glued Salus tokens, teach the setpoint refine the new type, and extend deriveArea to letter-resolve it plus the parenthetical fallback (threaded the raw device name from the one mapTbDevice call site). Three new test files cover classify, area and registry parity.
SECTION One build-time finding worth noting: the design named only the two glued tokens salusit700 and salusit500 as the long tokens to make forward-only, but each Salus row also carries an alias token salus700 and salus500, and those re-open the identical bleed because salus700 contains salus. The build correctly widened the forward-only set to all four tokens. The it700 and it500 tokens are deliberately left contained-by-capable because they do not contain salus and so cannot bleed a bare-salus name. This stays within the design intent (the long glued Salus tokens match forward-only) and is the reason the fix actually works end-to-end.
SECTION Verification: npm run test:unit is green — 300 pass, 0 fail, 1 pre-existing unrelated skip (301 total). The three new test files use REAL device names and site codes from the 2026-10-06 live sweep. Regression guards prove glued iT700, glued iT500 and paired gateways are unchanged, that closing the bleed drops no legitimate short-form match, and that the new salus type exposes the same setpoint and frost commands and 5 to 35 range as the existing Salus types. No existing test needed changing — none encoded the old buggy behaviour.
SECTION Control safety: the new salus type is a read-path area-classification change only. Its registry contract is identical to salus-it500 and salus-it700 (setpoint and frost, 5 to 35, step 0.5) bar the retained slow-echo timeout grace, which is conservative because the old-convention hardware model is unknown. No command, range, dispatch or write-state behaviour changes for any device.
SECTION Expected post-merge behaviour change, stated honestly: bare-salus devices with a resolvable r or b letter (148 today, plus up to 6 more via the parenthetical fallback) move from a wrong Accommodation to the correct Bar/Restaurant. The small residue with no resolvable letter from either source (about 27) moves from a guessed Accommodation to the existing "area not identified" fallback chip — no device is ever lost; an unknown area is shown as unknown.
DECISION Approve the OOHDASH-108 build to advance to the Test phase (live handler re-test on real bare-salus Restaurant, Flats and no-letter sites)? | Approve — proceed to Test | Request changes
DETAIL Branch build/oohdash-108-salus-area off main at d48ddc1. Diff reviewed firsthand; unit suite run green locally and in CI (required check unit tests). No ThingsBoard writes performed; no control path or write state touched. The Orchestrator raises the governed gate.
-->

# Build — Old-convention Salus area mis-mapping fix (OOHDASH-108)

**Release:** OOH Triage Dashboard — R1 · **Stage:** Build · **Date:** 2026-10-06 · **Owner:** James Brown
**Ticket:** OOHDASH-108 (Bug, High). **Design (signed off):** `docs/project/OOH_SALUS_AREA_MISMAP_DESIGN_2026-10-06.md` (gate PR #62, merged).
**Branch:** `build/oohdash-108-salus-area` off `main` @ `d48ddc1`.

## What was built

| Area | Change | File |
|---|---|---|
| New device type | `salus` for old-convention thermostats; control contract identical to the Salus types (setpoint/frost, 5–35, step 0.5, slow-echo grace retained). | `services/registry.js` |
| Asset row | Repurposed the dead generic-salus row to assign deviceType `salus` (was `salus-it700`). | `services/tb-device.js` |
| Match bleed | Long glued Salus tokens (`salusit700`, `salusit500`, and the aliases `salus700`, `salus500`) match forward/exact-only, so a bare `salus` token falls through to the generic row. | `services/tb-device.js` |
| Setpoint refine | `classifyDevice` recognises the new `salus` type when refining a setpoint-bearing thermostat off the iT700 default. | `services/tb-device.js` |
| Area derivation | `salus` and `salus-it500` share one letter-resolve branch; parenthetical fallback reads the site letter from the raw name's trailing `(NNNN-x-n)` when CLIENT_SCOPE `site` is absent (CLIENT_SCOPE always wins). `salus-it700` unchanged. | `services/tb-device.js` |
| Tests | `test/bare-salus-classify.test.js`, `test/bare-salus-area.test.js`, `test/salus-registry-parity.test.js`. | `test/` |

## Decisions as implemented

| Decision | Approved option | In the build |
|---|---|---|
| DECISION 1 — parenthetical fallback | Adopt | `deriveArea` falls back to the raw-name trailing parenthetical when CLIENT_SCOPE has no usable letter; a present CLIENT_SCOPE letter always wins. |
| DECISION 2 — iT700 100% rule | Keep unchanged + follow-up spike | `salus-it700` still maps to Accommodation unconditionally; glued-iT700 untouched. |

## Verification

| Check | Result |
|---|---|
| `npm run test:unit` | 300 pass, 0 fail, 1 pre-existing unrelated skip |
| New tests use real sweep data | Names and site codes from the 2026-10-06 live sweep |
| Glued iT700 / iT500 / gateway regression | Unchanged (asserted) |
| Bleed-closure regression | fan/light/extractor short-form matches still resolve; `gw`/`ac`/`lgt` still do not bleed |
| Control-contract parity | `salus` exposes the same setpoint/frost commands and 5–35 range as the existing Salus types |
| Existing tests changed | None — no existing test encoded the old buggy behaviour |

## Handoff to Test

- Live handler re-test on real bare-salus sites: a Restaurant/Bar `r`/`b` site (now under Bar/Restaurant), a Flats/Staff `s`/`f` site (still Accommodation), and a no-letter site (now the "area not identified" chip, never a guessed Accommodation).
- Spot-check a mixed site with glued iT700/iT500 and a paired gateway — areas and the gateway unchanged.
- If a controllable bare-salus is available, confirm a setpoint change behaves exactly as before (control unchanged).

---

*Branch `build/oohdash-108-salus-area` off `main` @ `d48ddc1`. Unit suite green locally and in CI. No ThingsBoard writes; no control path or write state touched. This artefact changed no application source and raised no gate itself — the Orchestrator governs those.*
