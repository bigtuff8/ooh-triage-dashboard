<!--
gate:contract
TICKET: OOHDASH-139
PHASE: test
QUESTIONS:
Q1: James -- all 176 e2e and 519 of 521 unit tests pass (the 2 failures are pre-existing on main before this branch, both in iot-consumer-parse.test.js, verified on main before any of this work). Both required CI checks pass on PR 133, which is now merged to main at 320575b. Do you approve this build and give the go to cut patch v1.4.7?
SECTION: What was built
The boilerControl panel now appears as a proper heating device for all 213 boilerControl sites. classifyDevice returns boiler-panel for the boilerControl profile (kind heating, controllable false). deriveArea returns Bar/Restaurant for boiler-panel. decodeBoilerHeating is a new pure function that decodes V1 and V2 panel state from the existing telemetry bag: zone on/off, fallback cycle, forced on/off with direction from sign, summer mode, staleness, and next scheduled change. The decoded state is attached to boilerControl.heating on every live and fixture site. The heating flow routes Bar/Restaurant to a new state-first decision tree showing one of nine outcomes (W1 to W9) using the verbatim approved wording (James D1, 2026-10-23). The dead boiler-panel branch from PR 129, whose curly-quote onclick defect killed both buttons in v1.4.6, is replaced.
SECTION: Test evidence
Unit tests pass 519 of 521. The 2 failures are both in iot-consumer-parse.test.js and are pre-existing on main before this branch. New tests: 15 decodeBoilerHeating unit cases covering V1 all on, V2 all on, partial, forced off V1 held and V2 until, forced on agree and disagree, fallback, summer mode, stale, never reported, no discriminator, sentinel temperature dropped, zone not configured. Three classify and area cases. BC-4a and area-derivation.test.js updated. e2e passes 176 of 176, 2 skipped, 0 failed. New e2e: BP-E1 (V2 site, Bar/Restaurant chip, W2 outcome, buttons clickable), BP-E2 (V1 site, partial W3 outcome). Regression: Accommodation Salus flow unchanged, hot-water OOHDASH-136 flow unchanged.
SECTION: CI checks on PR 133
Both required checks passed before merge. Unit tests: pass in 36 seconds. e2e playwright: pass in 12 minutes 55 seconds. PR 133 merged to main; main is now at 320575b.
SECTION: Read-only invariants confirmed
Zero device writes, zero RPC, zero new TB reads beyond the two CLIENT_SCOPE keys CHZ1.enabled and CHZ2.enabled specified in design C4a. No new device control. W1 to W9 wording is verbatim from the approved mockup (James D1, 2026-10-23). OOHDASH-141 timed boost scope is untouched.
DECISION: Approve this build and release as patch v1.4.7? | Yes — go ahead and cut the release (recommended) | No — hold on
-->

# OOHDASH-139 Test Gate: pub boiler panel in the heating flow

**Date:** 2026-10-23 · **Phase:** test · **Build PR:** 133 (merged, main 320575b)

## What was built

The boilerControl panel now appears as a proper heating device for all 213 boilerControl sites.

| Change | File | What it does |
|---|---|---|
| C1 classifyDevice | services/tb-device.js | boilerControl profile returns boiler-panel (kind heating, controllable false) |
| C2 deriveArea | services/tb-device.js | boiler-panel returns Bar/Restaurant |
| C3 decodeBoilerHeating | services/tb-device.js | V1 and V2 zone state, override sign, summer mode, staleness, nextChange |
| C4 attach heating | services/tb-device.js | boilerControl.heating set from decoder; CHZ1.enabled CHZ2.enabled in CLIENT_SCOPE |
| C7 panel branch | public/js/flows.js | W1 to W9 state-first decision tree, verbatim approved wording, curly-quote defect removed |

The live defect from PR 129 (curly quotes in onclick killing both boiler-panel buttons in v1.4.6) is replaced by the new branch. All onclick attributes use plain ASCII single quotes.

## Test evidence

| Suite | Pass | Fail | Notes |
|---|---|---|---|
| Unit (npm test) | 519 | 2 | Both failures in iot-consumer-parse.test.js, pre-existing on main before this branch |
| e2e (playwright) | 176 | 0 | 2 skipped (unrelated to OOHDASH-139) |

New tests added:

| Test file | Cases | What they cover |
|---|---|---|
| test/boilerheating-decode.test.js | BH-1 to BH-15 | V1 all on, V2 all on, partial, forced off V1 held and V2 until, forced on agree and disagree, fallback, summer, stale, never reported, no discriminator, sentinel temp, zone not configured |
| test/boiler-panel-classify.test.js | 3 | boilerControl profile gives boiler-panel; bare name token alone does not; boiler-panel gives Bar/Restaurant |
| tests/boilercontrol.spec.js (additions) | BP-E1 BP-E2 regression | V2 site chip and W2 outcome buttons; V1 site partial W3; Salus flow and DHW flow unchanged |

Updated: test/area-derivation.test.js (boiler-panel now Bar/Restaurant), test/boilercontrol-scope.test.js BC-4a (panel site now has a heating device, scope shows monitored).

## CI checks on PR 133

| Check | Result | Duration |
|---|---|---|
| unit tests | pass | 36 s |
| e2e (playwright) | pass | 12 min 55 s |

PR 133 merged to main. Main is now at 320575b.

## Read-only invariants confirmed

Zero device writes, zero RPC, zero attribute saves. No new device control. No new TB reads beyond CHZ1.enabled and CHZ2.enabled (design C4a). W1 to W9 wording is verbatim from the approved mockup (James D1, 2026-10-23). OOHDASH-141 timed boost scope untouched.

## Release

Patch v1.4.7 is ready to cut from clean main (320575b) using npm run release:patch once James gives the go.
