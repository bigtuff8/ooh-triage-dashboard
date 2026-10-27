# OOHDASH-149 Build Gate: boilerControl timetable day-order fix + V2 every-day lift

<!-- gate:contract
SECTION: What this builds
Two correctness fixes to services/schedule.js, unblocked by the SQ-13 spike (day order proven sun-first for V2 on 2026-10-26), together with a targeted two-line change to tb-device.js to gate V1 call sites.

Change 1: the default day-order in decodeNextChange() is corrected from mon-first to sun-first. The production call site in tb-device.js passes the config value explicitly and is unaffected by the default change alone.

Change 2 (Option A): the every-day-only guard in zoneTimetable() is lifted for V2 schedule paths only. The function gains an everyDayOnly=false parameter. When false (the default, used by V2 callers CHZ1/CHZ2.schedule) the function decodes day-varying entries using sun-first indexing and returns the correct next on-time. When true (passed explicitly by the two V1 callers output2Schedule and output3Schedule in tb-device.js) the function keeps the OOHDASH-144 safe hold, returning everyDay:false, nextOn:null. This preserves the V1 invariant pending OOHDASH-151 (mechanical survey of V1 schedule day ordering).

SECTION: What it never touches
services/schedule.js and its test files carry the main changes. tb-device.js has exactly two line changes: the V1 call sites at lines 1266 and 1273 each gain a fourth argument (true) to hold day-varying V1 decoding. No other files are changed. flows.js, routes, config.js, Kubernetes config and all other services are untouched. No ThingsBoard writes of any kind. No release or deploy.

SECTION: How it is proven
26 schedule-specific unit tests run and pass (0 fail, 0 skip). These cover: decodeNextChange() sun-first default (SD-7/8/9: Monday=position 1, Friday=position 5, Sunday=position 0), backward-compatible mon-first calls (SD-1/2/4 now pass dayOrder explicitly), the existing day-order inversion test (SD-3), every-day timetable paths (TT-1a/b/c, all unchanged), the V2 day-varying decode path (TT-4a/b/c: day-varying schedule with loops=1000011/0111100 verified on Fri/Mon/Sun reference times), TT-2b updated to assert nextOn non-null for the default (V2) path, and the new TT-2c which verifies the V1 guard path (everyDayOnly=true returns nextOn null). The pre-existing suite failures (TF-122-01 cold-start needs a live server, U13 IoT-dashboard regex drift) are unchanged from main and unrelated to this ticket.

SECTION: Who wrote it and who approves it
The code was written and verified by the orchestrating Claude session. Git records the commit under your GitHub identity. You approve at this gate through the bot pull request.

SECTION: What happens next
After your approval CI must be green on both required checks (unit tests and e2e playwright) before merge. No test gate or release gate is required for this correctness-only build; it ships as part of the next scheduled release. OOHDASH-151 (V1 schedule day-order survey) must complete before V1 paths are lifted from their everyDayOnly=true hold.

SECTION: Follow-on required
config.js line 143 sets OOH_SCHED_DAY_ORDER env default to mon-first. Changing this to sun-first is outside this build gate scope but is needed for the live decoded-schedule display path in tb-device.js (describeNextChange) to see the Change 1 fix. Tracked as a follow-on for James to approve alongside OOHDASH-151 completion. The zoneTimetable() decode path (Change 2) is not affected by config.js because it does not use the dayOrder option.
-->

## Change summary

| Area | Files | Change |
|---|---|---|
| Default day-order | services/schedule.js:112 | dayOrder default mon-first to sun-first in decodeNextChange() |
| V2 every-day guard lifted | services/schedule.js:353+ | everyDayOnly=false param added; non-everyDay entries decoded sun-first for V2 |
| V1 guard preserved | services/tb-device.js:1266+1273 | V1 call sites pass everyDayOnly=true; hold pending OOHDASH-151 |
| Existing tests hardened | test/schedule-decoder.test.js | SD-1/2/4 now pass dayOrder:mon-first explicitly; no behaviour change |
| New sun-first tests | test/schedule-decoder.test.js | SD-7/8/9: verify Mon=pos 1, Fri=pos 5, Sun=pos 0 under sun-first default |
| TT-2b updated | test/oohdash-144.test.js | Assertion updated: nextOn now non-null for V2 day-varying schedule |
| New day-varying tests | test/oohdash-144.test.js | TT-4a/b/c: loops=1000011/0111100 schedule verified on Fri/Mon/Sun times |
| New V1 guard test | test/oohdash-144.test.js | TT-2c: everyDayOnly=true returns nextOn null (V1 safe hold verified) |

## Evidence

| Check | Result |
|---|---|
| Code branch | build/oohdash-149 at 1be36ab, from main bce76b0 (v1.6.0) |
| Schedule unit tests | 26/26 pass (schedule-decoder.test.js and oohdash-144.test.js), 0 fail, 0 skip |
| Pre-existing suite failures | TF-122-01 server cold-start, U13 IoT-dashboard regex drift -- both unchanged from main, unrelated to this ticket |
| CI | unit tests and e2e (playwright) required on this pull request |

## Lineage note

OOHDASH-149 is a correctness fix unblocked by the SQ-13 spike (proven 2026-10-26). There is no formal design gate; the approach was reviewed in the build gate session and the V1/V2 distinction was agreed by James before the panel re-ran. Raising with --allow-missing-lineage.
