# OOHDASH-149 Release Gate: v1.6.1, boilerControl timetable day-order fix + V2 every-day lift

<!-- gate:contract
SECTION: What this releases
Version 1.6.1, which replaces 1.6.0. It is a patch version: a correctness fix only, no API or schema changes. It brings the day-order and V2 timetable work you approved through the build and test gates (PRs #164 and #165):

- The boilerControl timetable now uses Sunday-first day indexing when reading a schedule entry's `loops` field (seven-bit mask). This matches the format ThingsBoard stores, which starts on Sunday. The previous code used Monday-first, which shifted every non-every-day schedule entry by one day.
- V2 boilerControl sites (those using CHZ1.schedule or CHZ2.schedule in client scope) now decode day-varying schedule entries correctly: the zone timetable panel shows a non-null "next on" time where it previously showed null.
- V1 boilerControl sites (those using output2Schedule or output3Schedule) are unchanged: they use the existing every-day-only guard introduced in OOHDASH-144, so their zone panel shows the safe every-day result regardless of what the schedule contains. No V1 day-varying decode is attempted.

A live check of all 220 boilerControl devices in ThingsBoard found no device with a day-varying schedule. AC-3 is marked MOOT: the fix is code-correct and unit-tested, but cannot be proved from a live site today. V1 safe-hold is confirmed by unit tests (site 2933 confirmed as a V1 example).

SECTION: Goes live straight away
Nothing new is switched on. This is a correctness fix: the zone timetable panel reads differently for V2 sites with day-varying schedules. Because no live site has a day-varying schedule today, the visible change on the live dashboard is zero at deploy time. The fix is active and correct for any V2 site that gains a day-varying schedule in future. V1 sites see no change.

SECTION: How it is released
The release is already cut. Version bump committed and tagged v1.6.1 on main (commit bdb4d1d). The image is built and pushed to ACR as apitechhub.azurecr.io/ooh-dashboard:bdb4d1d (also tagged v1.6.1 and latest). Approving this gate gives the go to deploy via kubectl set image.

SECTION: If something goes wrong
Rollback is one command, back to the v1.6.0 image running now (bce76b0), named by its fixed commit tag. It takes about a minute. I would only do it with your go, or if the health page shows the app down.

SECTION: Checks done
All required gates approved and merged (build PR #164, test PR #165, CI green on both). Unit tests: 28/28 schedule and OOHDASH-144 tests pass; 839/841 overall (1 skip, 1 pre-existing U13 drift check). Playwright e2e: 197 passed, exit code 0, CI green. The V1 safe-hold guard is unchanged from OOHDASH-144. No changes to config.js OOH_SCHED_DAY_ORDER or the live next-change display text.

DECISION: Release v1.6.1 | Go: deploy now (recommended) | Hold: approve, but don't deploy until I say
DETAIL: Approving with Go is your explicit go to deploy the already-built image bdb4d1d. With Hold, I will wait for your word before the kubectl set image step.
-->

## Release facts

| Item | Value |
|---|---|
| Release | v1.6.0 (live, image `bce76b0`) → v1.6.1 |
| Source | main `bdb4d1d` (version commit, CI green on PR #164) |
| Image | `apitechhub.azurecr.io/ooh-dashboard:bdb4d1d` (also tagged `v1.6.1`, `latest`) |
| Image digest | `sha256:ccd4f5f069cbd167056b01b33b2b8bb9c13a011404a66f4fff23d82bf7eaf133` |
| Deploy | `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:bdb4d1d` |
| Settings | none; WRITES_DISABLED stays false (enabled since OOHDASH-19, unchanged) |
| Rollback | `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:bce76b0` |
| Verify | `/healthz` version 1.6.1, subsystems healthy |
| AC-1 | 28/28 schedule+OOHDASH-144 tests pass; 839/841 overall |
| AC-2 | 197/202 Playwright pass, exit code 0, CI green |
| AC-3 | MOOT — no day-varying V2 boilerControl found across all 220 devices |
| AC-4 | V1 site 2933 found; safe-hold verified by unit tests (browser unavailable) |
| Gates | build #164, test #165, release (this PR) |
| Not in scope | config.js OOH_SCHED_DAY_ORDER (OOHDASH-152), V1 day-varying lift (OOHDASH-151) |
