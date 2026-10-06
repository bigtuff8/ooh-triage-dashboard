<!-- gate:contract
SECTION Decisions first: This design is build-ready. It fixes a confirmed, estate-dominant bug — old-convention "bare-salus" thermostats (the token `salus` with no 500/700 qualifier) are mis-typed as iT700 and force-mapped to Accommodation, so Bar and Restaurant heating is swallowed. A live read-only ThingsBoard sweep (2026-10-06) sized it: of 385 bare-salus devices, 148 actually sit on Restaurant or Bar zones and are mis-routed today. Two product points are left for James at this gate, both small and both with an evidenced recommendation. Everything else is settled.
SECTION What this is: The build-ready design for OOHDASH-108. It makes bare-salus thermostats resolve their area from the site-code letter (the same signal iT500 already uses) instead of defaulting to Accommodation, by giving old-convention Salus its own device type and closing the name-matching bleed that currently catches it as iT700. It names the exact files, functions and code shapes to change, a classifier-safety analysis, the data sources, acceptance checks and a full test plan. It changes NO product code and touches NO control path — control dispatch, ranges and the write state are all unchanged.
SECTION The bug, root-caused: A device name carrying the bare token `salus` matches the iT700 asset row before the iT500 row because the name-matching test is bidirectional — the long token `salusit700` CONTAINS `salus`, so the bare token is pulled into the iT700 row and typed `salus-it700`. `deriveArea` then returns Accommodation for every iT700 unconditionally, so the site-code letter (r/b for Bar/Restaurant) is never read. The generic `salus` fallback row that should have caught these is dead code, shadowed by the same bleed.
SECTION The fix: Give old-convention Salus its own device type `salus` (same control contract as iT500/iT700, keeping the conservative slow-echo timeout grace because the hardware model is unknown); repurpose the dead `salus` asset row to assign it; close the bidirectional-match bleed so the long glued tokens match forward-only, letting a bare `salus` fall through to that row; and teach `deriveArea` to resolve the generic `salus` type by the site-code letter exactly as it already does for iT500. Net: bare-salus with letter r or b goes to Bar/Restaurant, s or f goes to Accommodation, and an unresolvable one lands in the existing honest "area not identified" fallback chip instead of a wrong Accommodation.
SECTION The site-letter source and a 100 percent-clean fallback: iT500 reads the letter from the CLIENT_SCOPE `site` attribute. For bare-salus, 350 of 385 carry a usable `site` letter; 35 do not. For several of those 35 the letter is present only in the device-NAME parenthetical, e.g. a name ending (5197-r-1), which the name normaliser strips before matching. A read-only cross-check settled whether that parenthetical can be trusted: across 347 devices that carry BOTH sources the letter AGREES in every single case, zero disagreements, and the parenthetical alone recovers 8 more devices (6 of them Restaurant or Bar). DECISION 1 asks James whether to adopt that name-parenthetical fallback (recommended) or stay CLIENT_SCOPE-only.
SECTION Null-site behaviour change, called out honestly: Today all 385 bare-salus show Accommodation by accident. After the fix, the small residue with no resolvable letter (27 with the fallback, 35 without) moves from Accommodation to the clearly-labelled "Heating — area not identified" chip. No device is ever lost from the list; an unknown area is shown as unknown rather than guessed as Accommodation. This is the correct failure mode for an overnight triage call and is the direct consequence of no longer defaulting to Accommodation.
SECTION The iT700 100 percent rule: OOHDASH-82 set "every iT700 maps to Accommodation" as a confirmed rule. The sweep proves old-convention Salus units DO sit on Bar and Restaurant zones, which casts reasonable doubt on whether the 466 modern glued-iT700 units are all genuinely Accommodation. This build does NOT change glued-iT700 (changing it risks regressing 466 working devices with no evidence they are wrong). DECISION 2 asks whether to keep the rule unchanged plus open a follow-up read-only spike to validate it (recommended), or bring that validation into this build's scope.
SECTION Tests and safety: New fixtures drive bare-salus names through classifyDevice and deriveArea for every branch — r and b to Bar/Restaurant, s and f to Accommodation, letter-only-in-parenthetical, and no-letter to the fallback. Regression guards prove glued iT700 and iT500 and paired gateways are unchanged, and that closing the match bleed does not drop any legitimate short-form name match. Control is untouched: the new `salus` type shares the exact setpoint and frost contract and range, so no command path, range or dispatch changes.
DECISION Approve this design for OOHDASH-108 — the new `salus` device type, the repurposed asset row, the forward-only glued-token match, and the letter-resolved area for old-convention Salus — so it can proceed to Build? | Approve — proceed to Build | Request changes
DECISION Adopt the device-NAME parenthetical as a fallback site-letter source when CLIENT_SCOPE `site` is absent (recovers 8 devices incl 6 Bar/Restaurant; proven 100 percent consistent with CLIENT_SCOPE across 347 devices), or stay CLIENT_SCOPE-only? | Adopt parenthetical fallback (recommended) | CLIENT_SCOPE-only
DECISION The iT700 100 percent-to-Accommodation rule: keep it unchanged in this build and open a follow-up read-only spike to validate glued-iT700 against their site letters, or bring that validation into this build now? | Keep rule, follow-up spike (recommended) | Validate glued-iT700 in this build
DETAIL Every current-behaviour claim is traced to a firsthand read of `services/tb-device.js` and `services/registry.js` on branch design/oohdash-108-salus-area off main at 91033d7. Every estate count comes from two read-only live-ThingsBoard sweeps run 2026-10-06 against portal.lhlive.co.uk (1,199 salus-named devices; 385 bare-salus). No product code was changed, no PR opened by this artefact, no control path or write state touched — the Orchestrator raises the governed gate.
-->

# Design — Heating area mis-mapping: old-convention Salus swallowed into Accommodation (OOHDASH-108)

**Release:** OOH Triage Dashboard — R1 · **Stage:** Design · **Date:** 2026-10-06 · **Owner:** James Brown
**Ticket:** OOHDASH-108 (Bug, High) — *Heating area mis-mapping: bare-salus thermostats mapped to Accommodation instead of Bar/Restaurant.*
**Input:** root-cause audit of `main` @ `91033d7` plus two read-only live-ThingsBoard sweeps (2026-10-06). Relates to OOHDASH-82 (two-area model, the design this bug lives inside) and OOHDASH-86 (device naming).

**Repo state (verified):** branch `design/oohdash-108-salus-area` off `main` @ `91033d7` (`git rev-parse`); package version `1.3.2`; live image `91033d7`; **control is LIVE** (`WRITES_DISABLED=false`). ThingsBoard is the system of record; the integration-bridge sits behind it for command dispatch only.

**Method.** Every current-behaviour claim was re-read firsthand on this branch (file:line below). Every estate count is carried from two read-only sweeps run 2026-10-06 against `portal.lhlive.co.uk` (JWT read path, `credentials/thingsboard.env`): a classification sweep over all 1,199 `salus`-named devices, and a parenthetical cross-check over the 385 bare-salus devices. Both are marked `sweep`.

**Verification legend:** `code` = traced to source on this branch · `code(deployed)` = behaviour also present on the live image · `sweep` = carried from the 2026-10-06 read-only live-estate sweeps.

**Invariants honoured.** **No control-path change.** The new `salus` device type carries the identical setpoint/frost command contract and range as the existing Salus types (§4), so no command, range, dispatch or write-state behaviour changes — this is an area-classification fix on the read path. ThingsBoard stays system of record. **Design only — no product code was changed;** code was read solely to specify the change precisely.

---

## 1. Scope and non-goals

**In scope (design for Build):**
- A device type for old-convention ("bare-salus") thermostats so they resolve area by the site-code letter instead of defaulting to Accommodation (§4, §5).
- Closing the bidirectional name-match bleed that currently types bare-salus as iT700 (§5).
- Teaching `deriveArea` to letter-resolve the new type, with an optional name-parenthetical fallback for the site letter (§6, DECISION 1).
- The null-site behaviour change and its honest fallback (§7).
- Data sources (§8), acceptance checks (§9), test scripts and data (§10).

**Non-goals / invariants (do not violate):**
- **No control-path change.** The new type shares the Salus setpoint/frost contract exactly (§4); no command, range, step, dispatch or write-state change.
- **No change to glued-iT700 behaviour.** The OOHDASH-82 "iT700 → Accommodation 100%" rule stays as-is for modern glued-iT700 units; validating it is a follow-up spike, not this build (§11, DECISION 2).
- **No new area concepts.** This reuses the OOHDASH-82 two-area model (`Accommodation`, `Bar/Restaurant`) and the existing "area not identified" fallback chip unchanged.
- **Design only** — proposed code shapes match existing style; no product source is edited in this artefact.

---

## 2. The bug, root-caused (firsthand)

All line numbers read on `main` @ `91033d7`; behaviour also present on the live image.

| # | Current behaviour | Evidence (file:line) | Ver |
|---|---|---|---|
| C1 | `ASSET_INTENT` lists the iT700 row BEFORE the iT500 row; a generic `salus` fallback row sits third. | `services/tb-device.js:246-248` | code(deployed) |
| C2 | `matchAssetIntent` returns the FIRST matching row, and its test is bidirectional — a name token matches when it equals, contains, or IS CONTAINED BY an asset token. | `services/tb-device.js:432` | code(deployed) |
| C3 | So a bare name token `salus` matches the iT700 row first, because the asset token `salusit700` contains `salus` (the contained-by direction). The device is typed `salus-it700`. | `services/tb-device.js:246,432` | code(deployed) |
| C4 | The generic `salus` fallback row is therefore never reached — it is dead code, shadowed by the iT700 bleed. | `services/tb-device.js:248` | code(deployed) |
| C5 | `deriveArea` returns `Accommodation` for every `salus-it700` UNCONDITIONALLY — it never reads a site-code letter for an iT700. | `services/tb-device.js:475` | code(deployed) |
| C6 | Only `salus-it500` reads the CLIENT_SCOPE `site` letter (s/f to Accommodation, r/b to Bar/Restaurant). | `services/tb-device.js:476-480` | code(deployed) |
| C7 | The capability-first path defaults a setpoint-bearing thermostat to `salus-it700` before the name refines it. | `services/tb-device.js:366-369` | code(deployed) |
| C8 | `normaliseName` strips parenthetical groups before tokenising, so a site code that appears only in a name parenthetical is discarded. | `services/tb-device.js:144` | code(deployed) |

**The load-bearing consequence.** C3 plus C5 is the defect: a bare-salus device is typed iT700 and then forced to Accommodation with its real site-code letter never consulted. C4 shows the intended catch (the generic `salus` row) was neutralised by the same bleed.

### 2.1 Estate scale (read-only sweeps, 2026-10-06)

| Name shape | Count | Behaviour today |
|---|---|---|
| glued iT700 | 466 | typed correctly |
| glued iT500 | 347 | typed correctly, letter-resolved |
| bare-salus | 385 | mis-typed iT700, forced Accommodation |

Bare-salus broken down by actual CLIENT_SCOPE `site` letter:

| Site letter | Count | Correct area | Today |
|---|---|---|---|
| r (Restaurant) | 146 | Bar/Restaurant | mis-routed to Accommodation |
| b (Bar) | 2 | Bar/Restaurant | mis-routed to Accommodation |
| s (Staff) | 21 | Accommodation | correct by accident |
| f (Flats) | 181 | Accommodation | correct by accident |
| none/malformed | 35 | unknown | shown as Accommodation (guessed) |

**148 bare-salus devices (146 r + 2 b) are mis-routed into Accommodation today** — the defect, confirmed estate-wide. The bare-salus population (385) is larger than the glued-iT500 population (347) that works, so the bug dominates.

---

## 3. Options considered

| Option | What it does | Verdict |
|---|---|---|
| A — reorder so iT500 is tested before iT700 | Bare `salus` would then contained-by-match the iT500 row first and letter-resolve. | **Rejected as the primary fix.** It works only by pointing the same bidirectional bleed at a different row — accidental, not intentional, and it leaves the generic `salus` row dead and the bleed live for the next token. |
| B — make the glued tokens match forward-only | Stops `salus` being pulled into a glued row, so it falls through to the generic row. | **Adopted** as half the fix — it closes the bleed principledly (§5.2). |
| C — give old-convention Salus its own device type, resolved by the site letter | Makes the intent explicit and lets `deriveArea` letter-resolve it like iT500. | **Adopted** as the other half (§4, §6). |
| D — repurpose the dead generic `salus` row | Turns C4's dead code into the explicit assignment for option C. | **Adopted** (§5.1). |

**Recommended combination: B + C + D.** Close the bleed (B) so a bare `salus` reaches the repurposed generic row (D), which assigns the new explicit type (C) that `deriveArea` letter-resolves. Option A is recorded as the rejected minimal-but-fragile alternative.

---

## 4. A device type for old-convention Salus (task 1)

**Why a new type, not reuse of `salus-it500`.** For AREA, a bare-salus should behave like iT500 (letter-resolved). For CONTROL, reuse is subtly unsafe: `salus-it500` and `salus-it700` carry the identical command contract (`setpoint`, `frost`), range (5–35°C) and step (0.5°C) — the ONLY difference is iT700 sets `slowEcho: true`, the grace that tolerates a slow `*SyncStatus` echo before declaring a timeout (`services/registry.js:12-26`, read firsthand). The old-convention hardware model is unknown, so typing it `salus-it500` would silently remove that grace and could make a genuine command report a premature failure. The conservative, correct choice is a dedicated type that keeps the grace.

**New registry entry** in `services/registry.js`, alongside the existing Salus types:

- key `salus` — label "Salus thermostat", `commands: ['setpoint', 'frost']`, `deviceRange: { min: 5, max: 35 }`, `frostSetpoint: 5`, `stepC: 0.5`, `slowEcho: true` (conservative: assume slow echo, matching iT700, because the hardware model is unknown).

This makes the control contract **identical** to the existing Salus types except for keeping the slow-echo grace, so no command, range or dispatch behaviour changes for these devices — they simply stop being mis-typed. It is a registry key, so the downstream `capabilitiesFor` / `validateCommand` join holds exactly as for the other Salus types.

---

## 5. Classifier change (tasks 2 and 3)

### 5.1 Repurpose the dead generic row (D)

Change the dead `ASSET_INTENT` row at `services/tb-device.js:248` from its current `deviceType: 'salus-it700'` to the new explicit type:

- `{ tokens: ['salus'], kind: 'heating', deviceType: 'salus', label: 'Salus thermostat (area by site code)' }`

It stays positioned AFTER the glued iT700 and iT500 rows, so a glued name still matches its specific row first; it becomes the catch for a bare `salus` token only once the bleed is closed (§5.2).

### 5.2 Close the bidirectional-match bleed (B)

The bleed is the contained-by direction at `services/tb-device.js:432` — a short name token matches a longer asset token that contains it. For the long glued Salus tokens this is exactly what pulls a bare `salus` into the iT700 row.

**Change:** restrict the contained-by direction so it does not fire for the long glued Salus tokens (`salusit700`, `salusit500`). Those tokens then match only by exact equality or by the forward direction (a name token that contains the asset token, e.g. a glued name). A bare `salus` token no longer matches a glued row and falls through to the repurposed generic row (§5.1).

**Why this is safe (regression analysis).** The contained-by direction exists so a name carrying a short truncated form still matches. After this change:
- A glued name token `salusit700` still matches the iT700 row by exact equality; a token `it700` still matches by exact equality; a longer name containing `it700` still matches forward. No glued match is lost.
- Short-form matches in other families still work: a `fan` token matches the fan row by exact equality, an `extractfan` token matches `fan` forward. The contained-by direction was never the only path for these (the fuzzy and typo passes remain as backstops).
- The tiny-token exact-only guard (≤3 chars, `services/tb-device.js:425`) is untouched, so `gw`/`ac`/`lgt` still cannot bleed.

### 5.3 Capability-first default (C7)

The setpoint-bearing default at `services/tb-device.js:369` stays `salus-it700`, but the name refine at `:380-381` must now recognise the new type: add `'salus'` to the deviceType list that the setpoint refine accepts (`['salus-it700', 'salus-it500', 'intesis']` becomes `['salus-it700', 'salus-it500', 'salus', 'intesis']`). A bare-salus thermostat with setpoint telemetry is then refined from the iT700 default to the new `salus` type by its name, so its area letter-resolves. A thermostat whose name carries NO salus/iT token at all keeps the iT700 default (rare; out of scope).

---

## 6. Area derivation and the site-letter source (task 4)

**Letter-resolve the new type.** In `deriveArea` (`services/tb-device.js:474-483`), treat `salus` the same as `salus-it500`: parse the CLIENT_SCOPE `site` letter and return Accommodation for s or f, Bar/Restaurant for r or b, null otherwise. Refactor so both types share the one letter-resolving branch; `salus-it700` is unchanged (still unconditional Accommodation — §11, DECISION 2).

**The site-letter source.** `parseSiteCodeLetter` (`services/tb-device.js:457-461`) already parses the shape `(NNNN-x-n)`. For bare-salus, 350 of 385 carry a usable CLIENT_SCOPE `site` letter (`sweep`).

**The parenthetical fallback (DECISION 1).** For 35 bare-salus devices CLIENT_SCOPE `site` is absent or malformed. For several of them the site code is present only in the device-NAME trailing parenthetical (e.g. a name ending `(5197-r-1)`), which `normaliseName` strips before matching (C8). A read-only cross-check (2026-10-06) tested whether the name parenthetical is a trustworthy fallback:

| Cross-check result | Count |
|---|---|
| Carry BOTH a CLIENT_SCOPE letter and a name-parenthetical letter | 347 |
| …of which the two sources AGREE | 347 |
| …of which the two sources DISAGREE | 0 |
| Recoverable ONLY via the name parenthetical (CLIENT_SCOPE absent) | 8 |
| …of which are r or b (Bar/Restaurant) | 6 |
| Unmappable by either source | 27 |

The parenthetical never contradicts CLIENT_SCOPE across 347 devices and recovers 8 more (6 of them Bar/Restaurant). **Recommended: adopt the fallback.** Design: when `deriveArea` finds no usable CLIENT_SCOPE letter for a `salus`/`salus-it500` device, parse the letter from the RAW device name's trailing parenthetical (the raw name, before `normaliseName`, because normalisation strips it). This needs the raw name passed into `deriveArea` — extend its signature to `deriveArea(deviceType, clientScope, rawName)` and thread the raw name from the one `mapTbDevice` call site. `parseSiteCodeLetter` already returns null for the malformed shapes seen in the sweep (a `z` class letter, a reversed `(NNNN-n-s)`), so the fallback is bleed-safe. If James prefers CLIENT_SCOPE-only, the fallback is simply not wired and those 8 devices land in the §7 fallback chip.

---

## 7. Null-site behaviour change, stated honestly

Today all 385 bare-salus devices show Accommodation, because they are typed iT700 (C5). After the fix, a bare-salus device with NO resolvable letter (27 with the parenthetical fallback adopted, 35 without) derives area null and therefore moves from Accommodation into the existing OOHDASH-82 "Heating — area not identified" fallback chip.

This is a deliberate, correct change, not a regression:
- No device is ever lost from the list — the fallback chip surfaces every null-area controllable heating device (OOHDASH-82 §7.2, unchanged here).
- An unknown area is shown as unknown rather than silently guessed as Accommodation. For an overnight welfare/triage call, guessing the area is the wrong failure mode; the whole point of this ticket is to stop a wrong Accommodation.
- The residue shrinks as site-code coverage improves, and the chip simply stops appearing for a site once all its devices resolve.

---

## 8. Data sources (mandatory)

| Field / entity | Where it lives | Type and allowed values | Context | Sensitivity |
|---|---|---|---|---|
| registry `salus` | `services/registry.js` | commands setpoint and frost, range 5–35, step 0.5, slowEcho true | New device type for old-convention Salus; identical control contract to iT500/iT700 bar the slow-echo grace | Low |
| `ASSET_INTENT` generic salus row | `services/tb-device.js` | tokens salus, kind heating, deviceType salus | Repurposed from dead code to assign the new type | Low |
| `clientScope.site` | TB CLIENT_SCOPE attribute | String site-code e.g. 5694-r-2; class letter is s, f, r or b | Primary site-letter source for iT500 and the new salus type | Low |
| name-parenthetical letter | parsed from the RAW device name trailing group | One of s, f, r, b, or null | Fallback site-letter source when CLIENT_SCOPE site is absent (DECISION 1) | Low |
| `device.area` | canonical device shape from `mapTbDevice` | String Accommodation, string Bar/Restaurant, or null | Unchanged field; now populated correctly for old-convention Salus | Low |

No new personal-data field is introduced.

---

## 9. Acceptance criteria to verification

| AC | Requirement | Concrete testable check | Unit-testable | Needs live re-test |
|---|---|---|---|---|
| AC1 | A bare-salus thermostat on a Restaurant or Bar zone surfaces under Bar/Restaurant, not Accommodation. | `classifyDevice` types a bare-salus name as `salus`; `deriveArea` returns Bar/Restaurant for a site letter r or b. | Yes | Yes — handler login, confirm a known r-site reads under Bar/Restaurant |
| AC2 | A bare-salus thermostat on a Staff or Flats zone still surfaces under Accommodation. | `deriveArea` returns Accommodation for s or f. | Yes | Partial |
| AC3 | A bare-salus with no resolvable letter is shown as "area not identified", never guessed as Accommodation. | `deriveArea` returns null; the fallback chip renders it. | Yes | Yes — spot-check a no-letter site |
| AC4 | Modern glued iT700, glued iT500 and paired gateways are unchanged. | Regression tests: glued iT700 to Accommodation, glued iT500 letter-resolved, gateway typed gateway. | Yes | Partial — spot-check |
| AC5 | No control behaviour changes for these devices. | The `salus` registry contract equals the Salus setpoint/frost contract and range; `validateCommand` accepts the same commands within the same range. | Yes | Yes — if a controllable bare-salus is exercised, confirm setpoint behaves as before |

---

## 10. Test scripts and test data (mandatory)

### 10.1 Unit tests (`npm run test:unit`, `test/*.test.js`)

| Item | Test file | Assertions |
|---|---|---|
| Bare-salus classify | `test/bare-salus-classify.test.js` (new) | A name like `gk_wingfieldfarm_salus_STA10108576` classifies as deviceType `salus` (not `salus-it700`); a glued `salusit700` name still classifies `salus-it700`; a glued `salusit500` name still classifies `salus-it500`; a `salusit700-gateway` name still classifies gateway. |
| Match-bleed closure | same file | Closing the contained-by direction does not drop a legitimate short-form match (fan/light/extractor exact and forward matches still resolve); `gw`/`ac`/`lgt` still do not bleed. |
| Bare-salus area | `test/bare-salus-area.test.js` (new) | `deriveArea('salus', site r)` and `b` return Bar/Restaurant; `s` and `f` return Accommodation; missing/`z`/reversed letter returns null. |
| Parenthetical fallback (if DECISION 1 adopts) | same file | With CLIENT_SCOPE site absent and a raw name ending `(5197-r-1)`, `deriveArea` returns Bar/Restaurant; with a malformed parenthetical it returns null; a present CLIENT_SCOPE letter always wins over the parenthetical. |
| Control-contract parity | `test/salus-registry-parity.test.js` (new) | The `salus` registry entry exposes the same setpoint/frost commands and 5–35 range as `salus-it500`/`salus-it700`; `validateCommand` accepts a setpoint within range and rejects outside, identically. |

Model the new tests on the existing area and client-scope test files (glued names today), extending them with bare-salus names.

### 10.2 Test data (realistic, from the sweep)

Real bare-salus names and site codes observed in the 2026-10-06 sweep:
- `gk_wingfieldfarm_salus_STA10108576`, CLIENT_SCOPE site `(5694-r-2)` — expected Bar/Restaurant.
- `gk_platform5_salus_STA10108870`, CLIENT_SCOPE site `(1793-b-1)` — expected Bar/Restaurant.
- `gk_unknown_salus_STA10108336`, CLIENT_SCOPE site absent, raw name ends `(1666-f-2)` — expected Accommodation only if the parenthetical fallback is adopted, else the fallback chip.
- `gk_elmwoodfarm_salus_STA10108964`, CLIENT_SCOPE site absent, raw name ends `(5197-r-1)` — expected Bar/Restaurant only if the parenthetical fallback is adopted, else the fallback chip.
- `gk_unknown_salus_STA10109030`, raw name ends `(?2?2-?-?)` — expected the fallback chip (no resolvable letter from either source).
- Regression anchors: a glued `gk-6218-salusit700` thermostat — expected Accommodation; a glued `gk-6218-salusit500-3` with site `(6218-r-1)` — expected Bar/Restaurant; a `gk-6218-salusit700-gateway-1` — expected gateway, never an area.

### 10.3 Live re-test (handler login, Playwright)

1. Open a known bare-salus Restaurant site (e.g. 5694 or 5209); in the heating flow confirm the device now reads under Bar/Restaurant, not Accommodation (AC1).
2. Open a bare-salus Flats/Staff site; confirm it still reads under Accommodation (AC2).
3. Open a no-letter bare-salus site; confirm it appears under "Heating — area not identified", never Accommodation (AC3).
4. Spot-check a mixed site with glued iT700/iT500 and a paired gateway; confirm areas and the gateway are unchanged (AC4).
5. If a controllable bare-salus is available, confirm a setpoint change behaves exactly as before (AC5) — control unchanged.

---

## 11. Risks and open items for Build

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Null-site bare-salus moving from Accommodation to the fallback chip surprises a handler | Low | Low | It is the honest state; the chip is clearly labelled; it shrinks with coverage; stated in §7 and the handler support doc. |
| Closing the match bleed drops a legitimate short-form name match | Low | Medium | Regression test asserts fan/light/extractor and glued Salus still match; exact and forward directions and the fuzzy/typo passes remain. |
| Old-convention hardware is genuinely slow-echo and the new type's grace is still wrong | Low | Low | The new type keeps `slowEcho: true` (conservative, matching iT700); no change from today's iT700 typing for timeout behaviour. |
| The parenthetical fallback trusts a source normally discarded | Low | Low | Cross-check proved 100% agreement across 347 devices, 0 disagreements; `parseSiteCodeLetter` rejects malformed shapes; gated behind DECISION 1. |
| The glued-iT700 100% rule is itself partly wrong | Medium | Medium | Out of scope here; DECISION 2 opens a read-only follow-up spike to validate it without risking the 466 working units. |

### Decided (do not reopen)
- **New `salus` device type** with the Salus setpoint/frost contract plus slow-echo grace (§4).
- **B + C + D fix** — forward-only glued-token match, repurposed generic row, explicit type (§3, §5).
- **Letter-resolved area** for the new type, identical to iT500 (§6).
- **Null-site → fallback chip**, not a guessed Accommodation (§7).

### Needs confirm (James, at this gate)
- **DECISION 1** — adopt the name-parenthetical fallback (recommended) or stay CLIENT_SCOPE-only.
- **DECISION 2** — keep the iT700 100% rule unchanged plus a follow-up validation spike (recommended), or validate glued-iT700 in this build now.

---

## 12. Handoff to Build

- **Design doc** — this artefact is the contract for what to build (files, functions, code shapes in §4 to §7).
- **Data sources** — §8 is the naming standard Build implements against and the tester reads against.
- **Test scripts and data** — §10 gives the unit tests, the realistic sweep-derived fixtures, and the live re-test.
- **Open flags** — the two confirm-points are DECISION 1 and DECISION 2 (§11).
- **Control safety** — §4 and AC5 are the load-bearing guarantee that no control path changes.

---

*All line numbers read firsthand 2026-10-06 against branch `design/oohdash-108-salus-area` off `main` @ `91033d7`. Estate counts are carried from two read-only live-ThingsBoard sweeps run 2026-10-06 against `portal.lhlive.co.uk`, marked `sweep`. No control path or write state is touched — this is an area-classification fix on the read path. This artefact changed no application source, opened no PR and raised no gate — the Orchestrator governs those.*
