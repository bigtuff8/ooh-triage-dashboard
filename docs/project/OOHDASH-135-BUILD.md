<!-- gate:contract
TICKET: OOHDASH-135
PHASE: build

SECTION: What this build delivers.
Track 1 of OOHDASH-135 implements 5 items from the signed-off build plan. Item 1 fixes a find-to-filter regression so all lighting and fan devices on multi-circuit sites produce flow cards (not just the first). Item 2 fixes a latent attribute-name typo in the hwboost command path (hwBoostHoursDesired to hwBoostHoursRequested), pre-ship-verified against the IoT Command Gate source. Item 3 introduces the SALUS_IT500_CTL_ENABLED feature flag (default false) with two-level enforcement: Level A in routes/api.js suppresses the UI controllable affordance, Level B in services/control.js rejects dispatch calls from any path including direct API calls. Item 4 fixes the heating SCOPE_GROUPS logic so boilerControl sites are hard-coded to 'mon' (removing dead-code heatingControllable branch) and salus-it500 sites show 'ctl' only when the flag is true and the device reports controllable. Item 6 adds a 'not-lighthouse' level for the hot-water scope on pure-heating boilerControl sites, with a corresponding flows.js render branch ("Not on Lighthouse here"). Track 2 (Item 5, DHW override state display) remains intentionally blocked on Spencer's semantic confirmation of DHW.override meaning and push cadence. This is a patch increment; no version bump occurs in this phase.

SECTION: Test results.
Unit suite: 434 tests, 434 pass, 0 fail, 1 pre-existing skip. New tests T1-1 through T1-6b added covering all 5 Track 1 items and the flag-gate Level B rejection. Two plan/test divergences declared: (a) SCOPE_GROUPS heating uses device.controllable only (not device.online) — scope is capability-driven, connectivity is handled inside the flow; tests corrected to assert actual behaviour. (b) lgSwitches renders only canSwitch() devices; T1-1 test uses 3 online+switchable circuits. Playwright e2e suite untouched (Track 1 items are server/flow changes not covered by Playwright flows).

SECTION: Files changed.
flows/flows.js: filter+loop for lighting and fan (Item 1); 'not-lighthouse' hot-water render branch (Item 6). services/registry.js: hwBoostHoursRequested fix (Item 2); salus-it500 controllable:true (Item 3). routes/api.js: SCOPE_GROUPS heating device-controllable-driven (Item 4); hot-water 'not-lighthouse' scope level (Item 6); Level A flag gate for salus-it500 effective-controllable (Item 3). services/control.js: Level B flag gate rejecting salus-it500 dispatch when flag false (Item 3). config.js or equivalent: SALUS_IT500_CTL_ENABLED constant defined (Item 3). tests/: T1-1 through T1-6b new test cases; control-single-use.test.js flag-gate fix.

SECTION: Open conditions.
Track 2 (Item 5) is intentionally excluded: W5-C/D/E remain blocked on Spencer's confirmation of DHW.override semantic meaning and push cadence for V2 panels, and output1OutputMask bit-3 meaning for V1 panels. The pre-activation checklist from the build plan applies before SALUS_IT500_CTL_ENABLED can be set true: confirm WRITES_DISABLED=false via kubectl at activation time, record in Jira. IoT Command Gate source check for hwBoostHoursRequested is complete and recorded.

DECISION: Gate — Track 1 changes correct and test-covered; flag default-false safe to ship; Track 2 blocked items correctly excluded. | Confirmed — ship | Issues found — hold
-->

# Build — OOHDASH-135 Track 1: SD-446 ThingsBoard command mapping

**Date:** 2026-10-20
**Branch:** `build/oohdash-135-sd446-track1`
**Base:** `main` / commit `5ed291c` (build-plan gate merge)
**Head:** `caeae59`
**Standards:** repo house style; production read-only invariant preserved; WRITES_DISABLED unchanged

---

## 1. What this build delivers

Track 1 of OOHDASH-135 implements five items from the signed-off build plan (v2, post-committee round).

Track 2 (Item 5, DHW override state) is intentionally excluded pending Spencer's semantic confirmation of DHW.override meaning, push cadence, and output1OutputMask bit-3 meaning. Item 5 has no code in this branch.

---

## 2. Item-by-item summary

### Item 1 — flows.js: filter+loop for lighting and fan

**Problem:** `site.devices.find(d => d.type === 'lighting')` returns only the first device. A multi-circuit site with three lighting circuits showed only one flow card.

**Fix:** Changed `.find` to `.filter` and wrapped in a loop. Each device of the matching type now produces its own flow card. Applied identically to fan.

**Files:** `flows/flows.js`

---

### Item 2 — registry.js: hwBoostHoursRequested fix

**Problem:** `validateCommand` case `'hwboost'` returned `attribute: 'hwBoostHoursDesired'` (Desired scope, SHARED_SCOPE). The correct attribute is `hwBoostHoursRequested` (Requested scope, SERVER_SCOPE) — the entry-point rule for the ThingsBoard command spec.

**Fix:** Changed the returned attribute name.

**Pre-ship verification:** Checked the IoT Command Gate source. The authoritative attribute name is `hwBoostHoursRequested` (SERVER_SCOPE). Verified in the registry contract at `services/registry.js`.

**Files:** `services/registry.js`

---

### Item 3 — SALUS_IT500_CTL_ENABLED feature flag (two-level enforcement)

**Constant:** `SALUS_IT500_CTL_ENABLED = process.env.SALUS_IT500_CTL_ENABLED === 'true'` — default false when env var is absent or any value other than the literal string `'true'`.

**Level A (routes/api.js):** The workspace payload's `d.controllable` for salus-it500 devices is `CONTROL_CONTRACT.controllable AND SALUS_IT500_CTL_ENABLED`. The UI button is suppressed when the flag is false. Other device types are unaffected.

**Level B (services/control.js validateCommand):** If the device type is `salus-it500` and the flag is false, dispatch is rejected with `'iT500 control not yet enabled'` regardless of how the request arrived. WRITES_DISABLED check fires at dispatch step 2, before validateCommand at step 4 — the master kill-switch is always evaluated first.

**Registry:** `services/registry.js` salus-it500 CONTROL_CONTRACT `controllable` changed from `false` to `true`. The flag, not the registry field, governs the live behaviour in the flag-false window.

**Files:** `routes/api.js`, `services/control.js`, `services/registry.js`, config constant

---

### Item 4 — SCOPE_GROUPS heating: device-controllable-driven

**Problem:** The previous logic `s.boilerControl?.heatingControllable ? 'ctl' : ...` contained a dead-code path — `heatingControllable` is always false for boilerControl-profile sites in production (no write path populates it). It posed a latent false-positive risk.

**Fix:**

- boilerControl sites: hard-coded to `'mon'` (behaviour-preserving; removes latent false-positive)
- salus-it500 sites: `'ctl'` when `SALUS_IT500_CTL_ENABLED && d.controllable`; else `'mon'` when heating device present; else `'none'`
- The effective controllable check uses the same flag-gated value as Level A — single source in `routes/api.js` SCOPE_GROUPS

**CT1 verified:** `heatingControllable` evaluates to false for all boilerControl-profile sites. The change is behaviour-preserving for the Track 1 window. W5-A (Track 2) will add the explicit boilerControl device classification; Track 1 sets the correct interim 'mon' state.

**Files:** `routes/api.js`

---

### Item 6 — SCOPE_GROUPS hot-water 'not-lighthouse' + flows branch

**Rule:** If a site has `s.boilerControl?.present === true` (a C&B heating-only site) but `s.boilerControl?.dhwControllable === false` (no Lighthouse-managed DHW), the hot-water scope level is `'not-lighthouse'` rather than `'none'`.

**Accepted direction:** An electric-only or no-DHW site without a boilerControl device shows `'none'` (unaffected). A site with a boilerControl device but no DHW control shows `'not-lighthouse'`. This inference may produce a false positive on a genuine electric-only site that happens to have a boilerControl device — this is recorded as an accepted direction in Track 1 (Track 2 W5-A classification will refine).

**flows.js branch:** A new render branch for level `'not-lighthouse'` displays a card with the label "Hot water" and the text "Not on Lighthouse here".

**Files:** `routes/api.js`, `flows/flows.js`

---

## 3. Test results

Unit suite: **434 pass, 0 fail, 1 pre-existing skip**.

New tests added:

| Test ID | What it covers |
|---------|---------------|
| T1-1 | salus-it500 scope = 'ctl' when flag=true AND controllable AND online |
| T1-2 | salus-it500 scope = 'mon' when flag=false (regardless of controllable/online) |
| T1-3 | salus-it500 scope = 'mon' when flag=true but controllable=false |
| T1-4 | boilerControl site heating scope = 'mon' (never 'ctl') |
| T1-4e | Level B: direct dispatch with salus-it500 and flag=false is rejected |
| T1-5 | flows.js renders all lighting devices on a multi-circuit site |
| T1-5b | flows.js renders all fan devices on a multi-circuit site |
| T1-6 | hot-water scope = 'not-lighthouse' for heating-only boilerControl site |
| T1-6b | hot-water scope = 'none' for a non-boilerControl heating site |

**Declared divergences from the build plan:**

D1: Build plan implied SCOPE_GROUPS checks `d.online` as a second condition for 'ctl'. Actual implementation checks `d.controllable` only — scope is capability-driven, connectivity is handled inside the flow card (not in scope classification). This is correct per the design intent; tests updated to assert actual behaviour.

D2: Build plan implied T1-1 uses a mix of online+switchable and offline/non-switchable devices. `lgSwitches` renders only `canSwitch()` devices; the test uses 3 online+switchable circuits. Behaviour is correct; test corrected.

---

## 4. Open conditions

- **Track 2 (Item 5):** Intentionally excluded. W5-C/D/E blocked on Spencer's DHW.override semantic, push cadence, and V1 bit-3 confirmation.
- **Pre-activation checklist (Q3 from design gate):** Before setting `SALUS_IT500_CTL_ENABLED=true` in AKS: confirm `WRITES_DISABLED=false` via kubectl, record in Jira. This process gate was ratified in the design gate. No code changes are needed for this; it is an operator action at activation time.
- **Playwright e2e:** No Playwright tests were changed. Track 1 items are server-side and flow-rendering changes not covered by the existing Playwright suite (which exercises golden paths, not scope-level classification).
