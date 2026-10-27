# OOHDASH-151 Test Gate: lift V1 everyDayOnly guard (server + UI)

<!-- gate:contract
SECTION: What is being tested
OOHDASH-151 (PR #174, merged to main b502052) delivers two changes:

Change 1 (server): everyDayOnly parameter removed from zoneTimetable() in services/schedule.js. Both V1 call sites in services/tb-device.js had the true argument removed. V1 day-varying zones now return a real nextOn from the sun-first schedule, where previously they returned null.

Change 2 (UI): All five everyDay guards in public/js/flows.js replaced with a targeted dayText guard: nextOn is only used when dayText is 'today' or 'tomorrow'. This ensures no named weekday (e.g. 'Sunday') is ever shown based on the DEDUCED sun-first day order.

Supporting: TT-2c unit test deleted (tested the removed guard). IOT_EXPECTED_SHA updated to 73100f2 in iot-consumer-parse.test.js.

SECTION: Acceptance criteria
AC-1: npm test passes — 844 tests, 0 fail (U13 was pre-existing fail now fixed), 1 skip.
AC-2: Playwright e2e suite — 204 pass, 0 fail, 2 skipped. No regressions.
AC-3 (live, best-effort): On a live V1 boilerControl site with a day-varying zone (loops != 1111111 in output2/3Schedule), the zone timetable shows a non-null nextOn when the next step-up is today or tomorrow. Prior to this fix nextOn was always null for V1 sites.
AC-4 (live, best-effort): Named weekdays (Monday–Sunday) do not appear in W3/W6/W8 card text for any V1 site. The dayText guard suppresses them; the per-output estate sweep (240 zone-outputs) confirmed zero partial-week zones exist in production, so the named-weekday scenario cannot arise.

SECTION: Out of scope
V2 boilerControl sites are unchanged — the V2 call sites were never guarded.
Day-order proof remains DEDUCED (firmware lineage + schedule-pattern coherence). The targeted dayText guard means the deduction is not load-bearing for any weekday-name display.

SECTION: How to find a V1 day-varying test site
V1 sites use output2Schedule/output3Schedule in CLIENT_SCOPE. The estate sweep (2026-10-27) found 120 V1 boilerControl sites; 118/120 have at least one non-1111111 loops entry. Any such site qualifies for AC-3. The estate sweep result (219 full-week, 21 fully-empty, 0 partial-week) means nextOn.dayText will be 'today' or 'tomorrow' on all day-varying V1 sites.
If no day-varying V1 site can be confirmed live in the test window, AC-3 is MOOT and the gate passes on AC-1 + AC-2 alone.

SECTION: Release
This build ships as patch v1.6.4 (correctness + UI fix, no API changes, no schema changes). Version already bumped and tagged on main (commit c228052). Deploy via: kubectl set image deployment/ooh-triage-dashboard app=<new-image> -n ooh (confirm image tag from CI build output). Pod roll: kubectl rollout status deployment/ooh-triage-dashboard -n ooh.
KUBECONFIG=C:/Users/james/.kube/ooh.yaml for all kubectl commands.

SECTION: Who tests and who approves
The tester session verifies AC-1 through AC-4 and produces evidence. James approves the test gate PR. The release gate follows immediately after approval.
-->

## Test checklist

| AC | Check | Expected |
|---|---|---|
| AC-1 | npm test | 844 pass, 0 fail, 1 skip |
| AC-2 | Playwright e2e | 204 pass, 0 fail, 2 skipped |
| AC-3 | V1 day-varying site live (if found) | Zone timetable shows non-null nextOn for today/tomorrow |
| AC-4 | Named weekdays absent from W3/W6/W8 cards | No Monday–Sunday in any V1 card text |

## Build evidence (inherited from PR #174)

| Check | Result |
|---|---|
| Branch | build/oohdash-151, commit 15b3b20 |
| Merged to main | Yes (PR #174 merged 2026-10-27) |
| Build gate adversarial panel | All lenses SHIP (5th submission, 5 rounds of panel review) |
| Unit tests at build gate | 844 pass, 0 fail, 1 skip |
| e2e at build gate | 204 pass, 0 fail, 2 skipped |
| CI on PR #174 | unit tests + e2e (playwright) both required and passed |
| CI on main (release v1.6.4 push) | unit tests + e2e both passed (run 40498659662) |

## Lineage note

Build gate approved and merged (PR #174). No separate design gate was raised; the guard-removal approach was agreed with James in the build gate session. Raising with --allow-missing-lineage.
