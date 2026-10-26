# OOHDASH-149 Test Gate: boilerControl timetable day-order fix + V2 every-day lift

<!-- gate:contract
SECTION: What is being tested
OOHDASH-149 (PR #164, merged to main bce76b0→main) delivers two correctness fixes:

Change 1: decodeNextChange() default day-order changed from mon-first to sun-first. Production calls in tb-device.js pass config.control.schedule.dayOrder explicitly, so the live nextChange display text is not yet affected (awaiting OOHDASH-152 config.js verdict). Unit-path default is now correct.

Change 2 (Option A): zoneTimetable() gains an everyDayOnly=false parameter. V2 callers (CHZ1/CHZ2.schedule) decode day-varying entries using sun-first indexing, returning a real currentTempC and nextOn. V1 callers (output2/3Schedule) pass everyDayOnly=true and keep the OOHDASH-144 safe hold (everyDay:false, nextOn:null).

Both changes are in services/schedule.js and two lines of services/tb-device.js. No other files changed. No write paths touched.

SECTION: Acceptance criteria
AC-1: npm test passes with 26/26 schedule tests, 0 fail, 0 skip (schedule-decoder.test.js + oohdash-144.test.js).
AC-2: Playwright e2e suite passes (all required checks green). No regressions in existing flows.
AC-3 (live, best-effort): On a live V2 boilerControl site that has a day-varying zone schedule (loops != 1111111 in CHZ1.schedule or CHZ2.schedule), the zone timetable panel shows a non-null nextOn value and a plausible currentTempC. Prior to this fix the panel returned everyDay:false with null values for such sites.
AC-4 (live, best-effort): On a live V1 boilerControl site (output2/3Schedule in client scope), the zone timetable panel continues to show safe-hold behaviour (no day-varying decode attempted). This is the existing OOHDASH-144 behaviour — verify no regression.

SECTION: Out of scope
config.js line 143 (OOH_SCHED_DAY_ORDER default) is still mon-first. The live nextChange display text on device cards is not expected to change with this release. That follow-on is tracked in OOHDASH-152.
V1 schedule day-order survey (OOHDASH-151) is in progress but is not a blocker for this test gate — the V1 guard (everyDayOnly=true) is preserved regardless of its verdict.

SECTION: How to find a V2 day-varying test site
Query ThingsBoard (portal.lhlive.co.uk, JWT auth from CIR credentials/thingsboard.env) for devices with CHZ1.schedule in client scope. Extract loops values. Any site with loops != 1111111 on any CHZ1.schedule entry is a candidate. SQ-13 (run mvp8mgc6, 2026-10-26) sampled 11 V2 sites — check the SQ-13 finding for any day-varying examples, or re-query.
If no day-varying V2 site is found in live data, AC-3 is MOOT and the test gate passes on AC-1 + AC-2 alone.

SECTION: Release
This build ships as patch v1.6.1 (correctness-only, no API changes, no schema changes). Release command from clean main: npm run release:patch. Deploy via: kubectl set image deployment/ooh-triage-dashboard app=<new-image> -n ooh (standard pattern — confirm image tag from release output). Pod roll: kubectl rollout status deployment/ooh-triage-dashboard -n ooh.
KUBECONFIG=C:/Users/james/.kube/ooh.yaml for all kubectl commands.

SECTION: Who tests and who approves
The tester session verifies AC-1 through AC-4 and produces evidence. James approves the test gate PR. The release gate follows immediately after approval.
-->

## Test checklist

| AC | Check | Expected |
|---|---|---|
| AC-1 | npm test (schedule tests) | 26/26 pass, 0 fail |
| AC-2 | Playwright e2e | All required checks green |
| AC-3 | V2 day-varying site live (if found) | Zone timetable shows non-null nextOn |
| AC-4 | V1 site live check | Safe-hold behaviour preserved (null nextOn) |

## Build evidence (inherited from PR #164)

| Check | Result |
|---|---|
| Branch | build/oohdash-149, commit 1be36ab |
| Merged to main | Yes (PR #164 merged 2026-10-26) |
| Build gate panel | 7 lenses, all PASS |
| Schedule unit tests at build gate | 26/26 pass |
| CI on PR #164 | unit tests + e2e (playwright) both required and passed |

## Lineage note

Build gate approved and merged (PR #164). No separate design gate was raised; the V1/V2 approach was agreed with James in the build gate session. Raising with --allow-missing-lineage.
