<!--
gate:contract
TICKET: OOHDASH-148
PHASE: release
SECTION: What goes live
Patch release v1.6.5 from main 2ab9486, carrying the OOHDASH-148 build (PR #179) and test evidence (PR #180). Three server-only changes that reduce site load latency: parallel Zendesk and ThingsBoard calls in the workspace payload route, early name resolution in the live-sites lookup, and a JWT probe fix that stops concurrent requests clearing the cached token on probe start. No UI changes and no new dependencies. Operators will see faster site loads; nothing else visible changes.
SECTION: How it was released
The release branch was cut manually in two steps due to an Azure subscription context issue. npm version patch bumped to v1.6.5 (commit 2ab9486, tag v1.6.5 pushed to origin). Then az acr build was run on the Pay-As-You-Go subscription (where the apitechhub registry lives) with image tags 2ab9486, v1.6.5 and latest. Deploy was kubectl set image in the iot-services namespace using KUBECONFIG from ooh.yaml. Set image leaves every env value untouched: writes stay enabled, SMS_PROVIDER stays as log, DATA_MODE stays live.
SECTION: Checks after release
/healthz reports version 1.6.5 and writesDisabled false (writes have been intentionally live since v1.3.0; the false value is correct). All subsystems healthy: bridge, ThingsBoard read, Zendesk and Cosmos. Pod Running 1 of 1, 0 restarts. Rollback image is apitechhub.azurecr.io/ooh-dashboard:c228052 (v1.6.4).
DECISION: Release v1.6.5 approved? | Approve - release v1.6.5 is live and complete | Hold - revert to v1.6.4 now
-->

# OOHDASH-148 Release gate: v1.6.5

**Date:** 2026-10-27 · **Phase:** release · **Release:** R1 · **From:** main 2ab9486 · **Gates:** discovery #163, design #177, build #179, test #180 (all merged)

## 1. What shipped

Three server-side changes — no UI changes, no new dependencies, no env changes:

| Option | File | Change |
|---|---|---|
| A | routes/api.js | ticketsForSite and activeBoostHoldsForSite run in parallel via Promise.all (were sequential) |
| B | services/tb-device.js | resolveSiteName fires early so Zendesk name lookup runs in parallel with TB search and telemetry reads |
| C | services/tb-client.js | activeReadProbe calls axios.post directly; concurrent requests keep cached JWT during probe flight; failed probe leaves token untouched |

## 2. Post-release verification (confirmed 2026-10-27)

| Check | Result |
|---|---|
| /healthz version | 1.6.5 |
| writesDisabled | false (correct — writes live since v1.3.0) |
| Status | ok |
| Pod | 1/1 Running, 0 restarts |
| Bridge | healthy |
| ThingsBoard read | healthy |
| Zendesk | healthy, configured |
| Cosmos store | healthy |

## 3. Release steps taken

1. Confirmed main at 772045a (build PR #179 squash-merge), then pulled to 21ead26 (test gate doc PR #180).
2. Stashed unrelated oohdash-119 PNG changes from working tree.
3. Ran `npm run release` (patch) — bumped to v1.6.5, committed, tagged, pushed main and tag. Azure subscription switched to Pay-As-You-Go before ACR step.
4. Ran `az acr build` on registry apitechhub; image tagged as 2ab9486, v1.6.5 and latest. ACR run ID: db7g.
5. Ran `kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:2ab9486 -n iot-services`.
6. Ran `kubectl rollout status` — rollout complete.
7. Checked /healthz — version 1.6.5, all systems healthy.

## 4. Rollback

`kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:c228052`, then confirm /healthz reports 1.6.4. No data migration; no schema changes.

## 5. No UI regression expected

All three changes are server-only (call ordering and JWT caching). No frontend files were modified. The e2e suite (204 tests, 0 fail) ran against the built server and covers the API paths affected by Option A and B.
