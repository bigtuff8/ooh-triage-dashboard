# OOHDASH-136 Test Results

gate:contract
TICKET OOHDASH-136
PHASE test
QUESTIONS none
DECISIONS none

## Summary

DHW override state display for V1 and V2 boilerControl panels. Read-only display only. No control path. Tests run against merged main commit 9080e8c (PR #126, squash-merged 2026-10-22).

## Build Under Test

- Commit: 9080e8c (feat(OOHDASH-136): DHW override state display for V1/V2 boilerControl panels)
- PR: #126 merged to main 2026-10-22T17:27:27Z
- Version base: v1.4.4 (patch release to follow)

## CI Evidence

CI run: https://github.com/bigtuff8/ooh-triage-dashboard/actions/runs/39821690623

- unit tests: PASS (33s)
- e2e (playwright): PASS (4m 38s)

## Unit Test Results

29 new tests added (U1-U20, with U20 as parity test). Full suite:

- New tests (OOHDASH-136): 29 pass, 0 fail
- Full suite: 441 pass, 9 pre-existing fail (unrelated to this build), 1 pre-existing skip

Pre-existing failures are in unrelated test files and were present before this build.

## Unit Test Coverage (U1-U20)

- U1: V2 auto state (DHW.override = 0)
- U2: V2 on-until (positive epoch seconds in future)
- U3: V2 off-until (negative epoch seconds in future)
- U4: V2 cant-confirm (not-a-number value)
- U5: V2 cant-confirm (implausible value outside plausibility window)
- U6: V2 auto-ended (positive epoch seconds in past, within 6h window)
- U7: V1 on-v1 (valid output4Override epoch ms confirmed within 35 min)
- U8: V1 off-v1 (valid negative output4Override epoch ms)
- U9: V1 cant-confirm (corrupt 25-digit value filtered, no valid row)
- U10: V1 cant-confirm (value below lower plausibility bound 1.0e12)
- U11: V1 cant-confirm (value above upper plausibility bound 2.1e12)
- U12: V2 stale panel (lastActivityTime more than 60 min ago)
- U13: V1 stale panel (lastActivityTime more than 60 min ago)
- U14: D3 hide (separate_dhw != 0, V2)
- U15: D4 hide (output1OutputMask[3] not true, V1)
- U16: hidden (neither heating_scenario nor output1OutputMask present)
- U17: browser twin on-until to auto-ended transition (nowMs past untilMs)
- U18: decode-error safe default (decodeDhwOverride wrapped in try/catch)
- U19: dual-marker site treated as V2 (heating_scenario takes precedence)
- U20: parity test (tb-device.js twin behaviorally identical to flows.js twin for all U1-U19 inputs)

## E2e Test Results

12 new tests added (E1-E12). 175 total tests in suite.

- New tests (OOHDASH-136): 12 pass, 0 fail
- Full suite: 173 pass, 2 skip (pre-existing), 0 fail

E2e fixture sites: 9361-9369 (The Plough Inn through The Swan).

## E2e Test Coverage (E1-E12)

- E1: V2 auto — card shows Auto tag and on-schedule headline
- E2: V2 on-until 20:20 BST — card shows Override ON tag and end time
- E3: V2 off-until 06:00 BST tomorrow — card shows Override OFF tag and end time
- E4: V2 cant-confirm (bad data) — card shows Can't confirm tag and unreadable message
- E5: V2 stale — browser twin re-applies staleness; shows Can't confirm tag with age
- E6: V1 on-v1 — card shows Override ON tag and V1 explanation
- E7: V1 off-v1 — card shows Override OFF tag and V1 explanation
- E8: separate-dhw (visible=false) — DHW card not present
- E9: dhw-not-wired (visible=false) — DHW card not present
- E10: V2 on-until; clock advanced past end time — auto-ended shows Auto tag
- E11: no boilerControl — DHW card not present on Hot water step
- E12: capture path — ticket detail includes DHW override sentence

## Invariants Verified

- DISPLAY ONLY: no control or write path introduced. No ThingsBoard writes in any test path.
- Heating flow unchanged: all 5 pre-existing boilercontrol.spec.js tests pass unchanged.
- Additive payload only: no existing fields removed or renamed.
- flows.js line 635 untouched (Open Flag 2, separate ticket).

## Recommendation

SHIP. All 29 unit tests and 12 e2e tests pass. No regressions in the full suite. Invariants confirmed.
