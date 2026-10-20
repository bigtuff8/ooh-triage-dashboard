<!-- gate:contract
TICKET: OOHDASH-135
PHASE: test

SECTION: What was tested and how.
All Track 1 items (1-2-3-4-6) are covered by automated tests run against the merged branch build/oohdash-135-sd446-track1 (head cb7334c, merge commit e86da27 into main). Unit suite: 434 tests, 434 pass, 0 fail, 1 pre-existing skip. Playwright e2e suite: 49 tests, 49 pass, 0 fail — run in CI against the PR merge commit. New unit tests T1-1 through T1-6b cover all Track 1 code paths including Level A and Level B flag gate enforcement, boilerControl hard-coded 'mon', multi-device filter+loop, hwBoostHoursRequested attribute name, and 'not-lighthouse' hot-water scope. E2e suite includes salus-it500 command flows (F005 slow-echo and F009 guardrail rejection) with SALUS_IT500_CTL_ENABLED=true in the test server env, confirming the full command path works end-to-end once the flag is activated. Track 2 (Item 5) has no tests — it is intentionally excluded from this patch.

SECTION: Test coverage gaps and open conditions.
No manual smoke test was performed against the live cluster for this patch. The Track 1 changes are all server-side classification and flow-rendering logic; the flag defaults to false in production (no behaviour change until the flag is set). The pre-activation checklist from the build plan applies before SALUS_IT500_CTL_ENABLED is set true: confirm WRITES_DISABLED=false via kubectl and record in Jira — this is an operator step at activation time, not a test step for this patch. Track 2 (Item 5) remains blocked on Spencer's semantic confirmation and is excluded from this patch's test scope.

SECTION: Declared divergences.
D1 (from unit test plan): SCOPE_GROUPS heating uses device.controllable only, not device.online — tests corrected to assert actual behaviour. D2 (from unit test plan): lgSwitches renders only canSwitch() devices; T1-1 fixture uses 3 online+switchable circuits. BC-E4 (boilercontrol.spec.js): the pre-existing Playwright assertion for 'Controllable from here' on a boilerControl site was testing dead code (heatingControllable path that could never be reached in production). Updated to 'Monitored only'. F005/F009 (control.spec.js): four e2e tests using salus-it500 fixtures needed SALUS_IT500_CTL_ENABLED=true in the e2e server env so the command path could proceed past Level B to the validators being tested.

DECISION: Gate — all 434 unit tests pass; all 49 e2e tests pass; coverage declared complete for Track 1; Track 2 exclusion documented; pre-activation checklist is operator process not a test blocker. | Confirmed — ship | Issues found — hold
-->

# Test — OOHDASH-135 Track 1: SD-446 ThingsBoard command mapping

**Date:** 2026-10-20
**Branch:** `build/oohdash-135-sd446-track1`
**Merge commit:** `e86da27` into `main`
**Test head:** `cb7334c` (post e2e-fix commit)

---

## 1. Test scope

Track 1 items covered:

| Item | Description | Test coverage |
|------|-------------|---------------|
| 1 | flows.js filter+loop for lighting/fan | T1-5, T1-5b (unit) + existing e2e lighting/fan flows |
| 2 | hwBoostHoursRequested attribute fix | T1-2 (unit — registry contract) |
| 3 | SALUS_IT500_CTL_ENABLED flag (Level A + B) | T1-1, T1-2, T1-3, T1-4e (unit) + F005/F009 e2e |
| 4 | SCOPE_GROUPS heating boilerControl='mon' | T1-4 (unit) + BC-E4 e2e |
| 6 | 'not-lighthouse' hot-water scope + flows branch | T1-6, T1-6b (unit) |

Track 2 (Item 5): no tests — intentionally excluded.

---

## 2. Unit suite

**434 pass, 0 fail, 1 pre-existing skip** — run in CI against the PR merge commit.

New tests added in this patch:

| Test ID | Covers |
|---------|--------|
| T1-1 | salus-it500 scope = 'ctl' when flag=true, controllable=true, online=true |
| T1-2 | salus-it500 scope = 'mon' when flag=false |
| T1-3 | salus-it500 scope = 'mon' when flag=true but controllable=false |
| T1-4 | boilerControl heating scope = 'mon' (never 'ctl') |
| T1-4e | Level B: salus-it500 dispatch rejected when flag=false |
| T1-5 | flows.js renders all lighting devices on multi-circuit site |
| T1-5b | flows.js renders all fan devices on multi-circuit site |
| T1-6 | hot-water scope = 'not-lighthouse' for heating-only boilerControl site |
| T1-6b | hot-water scope = 'none' for non-boilerControl heating site |

---

## 3. Playwright e2e suite

**49 pass, 0 fail** — run in CI against the PR merge commit.

Key e2e coverage for Track 1:

- BC-E4 (boilercontrol.spec.js): boilerControl site now asserts 'Monitored only' heating scope — confirmed the dead-code path is gone and 'mon' is the actual live behaviour.
- F005 (control.spec.js): salus-it500 slow-echo sync flow ('Sent to the device', 'awaiting the device') confirmed working with flag=true in e2e server env.
- F009 (control.spec.js): salus-it500 guardrail rejection ('outside the allowed', 'not a boostable') confirmed at the registry layer with flag=true.

---

## 4. Test divergences declared

D1: SCOPE_GROUPS uses device.controllable only (not device.online). Tests reflect actual behaviour.

D2: T1-1 fixture uses 3 online+switchable circuits. lgSwitches renders only canSwitch() devices.

BC-E4: Pre-existing assertion for 'Controllable from here' was testing dead code (heatingControllable path unreachable in production). Updated to 'Monitored only'.

F005/F009: Salus-it500 e2e tests needed SALUS_IT500_CTL_ENABLED=true in playwright.config.js e2e server env so commands could reach the validators being tested. Production env is unchanged; the flag defaults to false there.

---

## 5. Open conditions

- Manual smoke against live cluster: not performed. The flag defaults false, so no behaviour changes are live until activation. Smoke is a pre-activation step in the operator checklist.
- Pre-activation checklist: confirm WRITES_DISABLED=false via kubectl + record in Jira before setting SALUS_IT500_CTL_ENABLED=true. Operator step, not a test blocker.
- Track 2 (Item 5): excluded. No test scope for DHW override display in this patch.
