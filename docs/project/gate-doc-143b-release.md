<!-- gate:contract
DECISION: Overall verdict — OOHDASH-143 release v1.5.2 | GO — cut and deploy v1.5.2 now | CONDITIONAL GO — hold for specific investigation below | BLOCK — do not release; requires a fix
DETAIL: Companion staleness fix to v1.5.1. Root cause: SERVER_SCOPE lastActivityTime absent for some boilercontrol devices (confirmed at 6811), causing stale=true regardless of live telemetry. Fix: _extractMaxTelemTs captures max ts from TB timeseries response (with upper-bound future-ts guard), stored as __telemLastSeenMs; decodeBoilerHeating call site falls back to it when lastActivityTime is null. Build gate PR #148 (a05619c), test gate PR #149 (2201a3e). All 192 E2E and 680 unit tests pass. v1.5.2 tag pushed (bf4aae2).
DECISION: Post-deploy verification | Smoke-test site 6811 — open Hinckley Knight, confirm boiler panel shows a non-W1 outcome within 5 minutes | Manual /healthz only | Skip
DETAIL: If still W1 after 5 min, rollback: kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:v1.5.1
-->

# OOHDASH-143 Release Gate — v1.5.2 Telemetry Staleness Fix

**Ticket:** OOHDASH-143 · **Date:** 2026-10-24 · **Stage:** Release (gate 5 of 5)
**Branch:** main @ bf4aae2 · **Release:** v1.5.1 → v1.5.2

## What this gate approves

Cutting and deploying release v1.5.2. Image built in ACR, rolled out via `kubectl set image`. WRITES_DISABLED and all other env vars untouched.

---

## What ships in v1.5.2

| Fix | Change | Criticality |
|---|---|---|
| C — `_extractMaxTelemTs` helper | Exported pure function: max ts from TB timeseries response, upper-bound guard rejecting ts > now+5min. | Display fix |
| D — `fetchTelemetry` bag | Stores `__telemLastSeenMs` from `_extractMaxTelemTs`; discards no more timestamps. | Display fix |
| E — `decodeBoilerHeating` call site | Falls back to `__telemLastSeenMs` when `__lastActivityTime` is null (site 6811 class). | P1 |

**Net effect:** Sites where `lastActivityTime` is absent in SERVER_SCOPE (confirmed at 6811) will now show the correct heating outcome (W6 or similar) instead of W1 "can't check right now".

**Fix is display-only and read-path only.** Cannot write to devices. Rollback: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:v1.5.1`

---

## Pre-release checks

| Check | Status |
|---|---|
| Unit tests | PASS — 680 pass, U13 pre-existing |
| E2E (Playwright) | PASS — 192 pass, 2 skip, 0 fail |
| Build gate | MERGED — PR #148 (a05619c) 2026-10-24, approved by bigtuff8 |
| Test gate | MERGED — PR #149 (2201a3e) 2026-10-24 |
| Branch on main | YES — bf4aae2 (release v1.5.2 commit) |
| v1.5.2 tag pushed | YES — pushed to origin 2026-10-24 |
| WRITES_DISABLED policy | Unchanged — deploy uses kubectl set image only |

---

## Risk assessment

Change is smaller and more isolated than v1.5.1: three lines in `fetchTelemetry` plus one `??` expression in the call site. The `_extractMaxTelemTs` helper is pure and fully tested by BH-23/24. Rollback is one kubectl command (<60s), same as v1.5.1.

---

## Rollback reference

Fast rollback:
```
kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:v1.5.1
```
