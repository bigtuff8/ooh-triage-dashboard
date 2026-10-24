<!-- gate:contract
DECISION: Overall verdict — OOHDASH-143 release v1.5.1 | GO — cut and deploy v1.5.1 now | CONDITIONAL GO — hold for specific investigation below | BLOCK — do not release; requires a fix
DETAIL: P1 bug at Hinckley Knight site 6811 (and 220). Two fixes to services/tb-device.js: (A) tbBool now accepts TB REST string-valued telemetry, fixing null zone states at all V1+V2 sites; (B) z2Configured falls back to output3Schedule presence when mask[2]=false, fixing zone 2 silently excluded at sites 6811 and 220. Build gate merged PR #144 (b4a028d), test gate merged PR #145 (bf779a4). All unit tests and e2e (playwright) checks green. v1.5.1 tag pushed. Release uses kubectl set image — WRITES_DISABLED env is untouched.
DECISION: Post-deploy verification method | Smoke-test — open site 6811 workspace and confirm zone 2 appears with a valid state | Manual /healthz check only | Skip — deploy only, verify next working day
DETAIL: Tony's override was cleared by CJ on 2026-10-24 09:17. Zone 2 should now appear in the boiler heating panel at site 6811 with a valid decoded state (forced/held correctly decoded from string telemetry). A live open of the 6811 workspace is the definitive smoke-test.
-->

# OOHDASH-143 Release Gate — P1 String-Bool Decode + Zone 2 Fix

**Ticket:** OOHDASH-143 · **Date:** 2026-10-24 · **Stage:** Release (gate 5 of 5)
**Branch:** main @ 11057e3 · **Release:** v1.5.0 → v1.5.1

## What this gate approves

Cutting and deploying release v1.5.1 of the OOH Triage Dashboard. Image will be built in ACR and rolled out via `kubectl set image`. WRITES_DISABLED is untouched by the release.

---

## What ships in v1.5.1

| Fix | Change | Criticality |
|---|---|---|
| A — tbBool string decode | Accepts "true"/"1" and "false"/"0" from TB REST telemetry — fixes null zone states at ALL V1+V2 sites | P1 |
| B — z2Configured schedule fallback | Falls back to output3Schedule presence when mask[2]=false — fixes zone 2 silent exclusion at sites 6811 and 220 | P1 |

---

## Pre-release checks

| Check | Status |
|---|---|
| Unit tests | PASS — PR #144 CI green |
| E2E (playwright) | PASS — PR #144 CI green |
| Build gate | MERGED — PR #144 (b4a028d) 2026-10-24 |
| Test gate | MERGED — PR #145 (bf779a4) 2026-10-24 |
| Branch: on main | YES — 11057e3 (release v1.5.1 commit) |
| v1.5.1 tag pushed | YES — pushed to origin 2026-10-24 |
| WRITES_DISABLED policy | Unchanged — deploy uses kubectl set image only |
| Spencer Q-B2 (mask[2] semantics) | Outstanding — NOT a release blocker; fix B is a safe conservative interim |

---

## Regression scope

Fix A is additive (two new branches in tbBool — existing boolean/integer paths unchanged). Fix B is additive (new schedule-count fallback — mask[2]=true path unchanged; mask[2]=false with no schedule still excluded via BH-14). No other code touched. No API, config, or dependency changes.

---

## Smoke-test post-deploy

Open site 6811 workspace. Confirm:
- Zone 2 appears in the boiler heating panel (was silently excluded before)
- Zone states show forced/held correctly (were null before Fix A)

Tony's override was cleared by CJ at 09:17 2026-10-24, so zone 2 should show its natural schedule-driven state.
