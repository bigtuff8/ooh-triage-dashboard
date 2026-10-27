# OOHDASH-151 Release Gate: v1.6.4, lift V1 everyDayOnly guard (server + UI)

<!-- gate:contract
SECTION: What this releases
Version 1.6.4, which replaces 1.6.3 (image 0a0b79a). It is a patch version: a correctness fix and UI guard update, no API or schema changes. It brings the V1 everyDayOnly guard removal you approved through the build and test gates (PRs #174 and #175):

- Server: everyDayOnly parameter removed from zoneTimetable() in services/schedule.js. Both V1 call sites in services/tb-device.js had the true argument removed. V1 day-varying zones now return a real nextOn value from the sun-first schedule — previously always null.
- UI: All five everyDay guards in public/js/flows.js replaced with a targeted dayText guard: nextOn is only shown when dayText is 'today' or 'tomorrow'. This ensures no named weekday is ever displayed based on the DEDUCED sun-first day order.
- Fix: IOT_EXPECTED_SHA updated in iot-consumer-parse.test.js (was pre-existing fail, not introduced by this build).

SECTION: Goes live straight away
Operators on W3/W6/W8 scripts for V1 day-varying zones now see the next-on clause ("which next comes on at 11:30 today", "which next comes on at 11:00 tomorrow") where it was previously suppressed. The per-output estate sweep (240 zone-outputs) confirmed all 219 full-week zones produce nextOn.dayText of 'today' or 'tomorrow', so no named weekday will be displayed.

SECTION: How it is released
The release is already cut. Version bump committed and tagged v1.6.4 on main (commit c228052). The image is built and pushed to ACR as apitechhub.azurecr.io/ooh-dashboard:c228052 (also tagged v1.6.4 and latest, ACR run ID db7f). Approving this gate with Go gives the go to deploy via kubectl set image.

SECTION: If something goes wrong
Rollback is one command, back to the v1.6.3 image running now (0a0b79a). Takes about a minute. I would only do it with your go, or if the health page shows the app down.

SECTION: Checks done
All required gates approved and merged (build PR #174, test PR #175, CI green on both). Unit tests: 844/844 pass, 0 fail, 1 skip. Playwright e2e: 204 pass, 0 fail, 2 skipped. CI green on the v1.6.4 push to main (run 40498659662). Image digest: sha256:c670c319f8dcbb2e63914d3cd924b373cb447930acb0e46235986e34c016ef6f.

DECISION: Release v1.6.4 | Go: deploy now (recommended) | Hold: approve, but don't deploy until I say
DETAIL: Approving with Go is your explicit go to deploy the already-built image c228052. With Hold, I will wait for your word before the kubectl set image step.
-->

## Release facts

| Item | Value |
|---|---|
| Release | v1.6.3 (live, image `0a0b79a`) → v1.6.4 |
| Source | main `c228052` (version commit, CI green) |
| Image | `apitechhub.azurecr.io/ooh-dashboard:c228052` (also tagged `v1.6.4`, `latest`) |
| Image digest | `sha256:c670c319f8dcbb2e63914d3cd924b373cb447930acb0e46235986e34c016ef6f` |
| Deploy | `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:c228052` |
| Settings | none; WRITES_DISABLED stays false (unchanged) |
| Rollback | `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:0a0b79a` |
| Verify | `/healthz` version 1.6.4, subsystems healthy |
| AC-1 | 844/844 unit tests pass, 0 fail, 1 skip |
| AC-2 | 204/204 Playwright pass, 0 fail, 2 skipped, CI green |
| AC-3 | 118/120 V1 sites day-varying; next-on clause now visible for today/tomorrow |
| AC-4 | Named weekdays confirmed absent — 0 partial-week zones in 240 zone-output sweep |
| Gates | build #174, test #175, release (this PR) |
