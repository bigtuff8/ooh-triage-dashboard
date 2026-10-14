<!-- gate:contract
SECTION: Overview
OOHDASH-122, build complete. Branch feat/oohdash-122-degraded-banner, commit 0856514. Four production-file changes and two new test files plus two test additions fix the cold-start double-banner false negative, close the green/red co-fire for all five red-banner triggers (including the global and per-site kill-switch cases), and add a one-shot start-up read probe so the bridge latch reflects reality before any handler opens a workspace. All seven work units from the approved plan are implemented and self-verified. Unit 378 pass, 0 fail. E2E 137 pass, 2 skip (TF-18/TF-19, pre-existing fixture gaps), 0 fail. One minor discrepancy against the previous builder's stated diff counts is recorded under Deviations.

SECTION: What was built (work units)
WU1 (routes/api.js): bridgeDegraded() helper exported above the GET /me route; degraded derivation changed from !bridge.bridgeStatus().healthy to !!status.lastError at both /me and workspacePayload(). A fresh pod with lastError null is no longer reported as degraded. WU2 (services/tb-device.js): probeBridgeReadOnce() added as a self-contained block of 35 lines after bridgeStatus(). No existing line in the file was edited. WU3 (public/js/app.js): the green LIVE banner gains the guard controlLive && !kill; a three-line maintenance comment placed immediately above const kill documents the coupling. WU4 (server.js): fire-and-forget call to bridge.probeBridgeReadOnce() inside the app.listen callback in live mode only; logs one [TB] start-up read probe line per boot. WU5 (test/degraded-banner.test.js + test/bridge-startup-probe.test.js): 15 unit tests (U1-U15) and 10 probe tests (P1-P10) covering derivation correctness, the nine-state guard truth table (S1-S9), and all probe outcomes including race conditions and secret leakage. WU6 (tests/degraded-banner.spec.js + tests/killswitch.spec.js): seven browser journeys (E1-E7) plus two assertions (E5) added to the existing global kill-switch test. WU7 (full suite): both suites run clean; cold-start manual check passed in fixture mode.

SECTION: File and diff table
Eight files changed. Four production files: routes/api.js +9/-2 (bridgeDegraded helper plus two call sites); services/tb-device.js +35/-0 (probeBridgeReadOnce purely additive); public/js/app.js +4/-1 (guard plus maintenance comment); server.js +6/-0 (probe wiring). Four test files: test/degraded-banner.test.js new (266 lines); test/bridge-startup-probe.test.js new (297 lines); tests/degraded-banner.spec.js new (160 lines); tests/killswitch.spec.js +4/-0 (two E5 assertions plus two comment lines). Not touched: services/control.js, services/killswitch.js, services/tb-client.js, config.js, public/js/control.js, public/js/views.js, k8s manifests, Cosmos.

SECTION: Advisories
Advisory 1 (readRequest forwarder): readRequest at tb-device.js lines 37-39 is a lazy forwarder that resolves tb-client.readRequest via dynamic import and returns it without touching lastReadOk or lastReadError. The probe's untouched() guard (lastReadOk === false && lastReadError === null) therefore cannot race with a direct readRequest call. Confirmed by code inspection of the forwarder at lines 37-39 and every call site (lines 734, 795, and the new probe at line 1081). Advisory 2 (test seams): U1-U3 inline the derivation as const bridgeDegraded = (status) => !!status.lastError in the test file rather than importing the production helper, avoiding mock-module coupling for a trivial one-liner. U6-U14 use a vm preamble that injects function __setState(patch) { Object.assign(state, patch); } into the same script scope as the loaded app.js, then call ctx.__setState to patch state.me, state.siteNo, and state.workspace without a network call. U5 cache-busts the tb-device.js import with a query-string timestamp so each probe test starts with lastReadOk=false and lastReadError=null in a freshly initialised module. Advisory 3 (U12 and E5 pin the guard): U12 asserts that global kill-switch on (controlLive true, ks.global true, me.degraded false) renders kill-banner and hides control-live-banner; E5 in killswitch.spec.js asserts the same end-to-end while the switch is engaged and asserts green returns after it is cleared. Together they will catch any future attempt to separate the two banners or add a new red-banner path outside writesDisabled(). Advisory 4 (cold-start comment): the comment in server.js reads "Never awaited before listen" and is the intended documentation of the non-blocking probe contract. A 429 from TB at start-up sets outcome rate-limited, leaves the latch untouched (healthy:false, lastError:null), and produces no red banner; this state at /healthz is not a deploy failure.

SECTION: Test results
Unit command: node --experimental-test-module-mocks --test "test/*.test.js". Result: 379 total, 378 pass, 0 fail, 1 skip. The one skip is the IoT repo drift check (test/iot-consumer-parse.test.js U13), which requires the sibling ../iot-support-dashboard folder absent in CI; same result on main. E2E command: npx playwright test. Result: 139 total, 137 pass, 2 skip, 0 fail. The two skips are TF-18 (tests/tester/oohdash-119.tester.spec.js:660, ctlFinish carries additionalNotes) and TF-19 (line 707, ctlEscalate additionalNotes), both skipped because fixture site 6832 has no control tile; both pre-date this branch.

SECTION: Acceptance criteria
AC-1 (no false red banner on clean restart): bridgeDegraded() returns false when lastError is null regardless of the value of healthy. A freshly started pod with no read yet is not reported as degraded. The probe moves lastReadOk and lastReadError to a real outcome within 8s of port binding. Proved by U1 (boot state false), U5 (module-level cold start false), E1 (green banner only in browser at cold start), P1 (probe success sets healthy true). AC-2 (red and green never show together): the guard controlLive && !kill on the green banner uses the exact value that draws the red banner, making them exact complements whenever controlLive is true. All nine states from design section 5 (S1-S9) are covered: S1-S5 by the degraded derivation fix, S6-S8 by the kill guard, S9 by site-aware kill. Proved by U6-U14 (full truth table), E1-E4 (four browser journeys), E5 (kill-switch co-fire closed). No combination of any red-banner trigger and the green banner is possible in v1.3.8. AC-3 (/healthz bridge reflects a real probe after start-up): the probe fires inside the app.listen callback, sets bridge.healthy true (or writes a real lastError message) within the first network round-trip, and leaves /healthz shape unchanged. Proved by P1-P4 (success, failure, timeout, 429); U5 explicitly documents the residual few-second boot window where lastError is still null (the design's accepted AC-3 partial scope at DECISION 2).

SECTION: Deviations from the approved build plan
None in function or behaviour. One counting discrepancy exists between the previous builder's stated diff summary and the actual git diff --numstat output. routes/api.js: stated +11/-2, actual +9/-2. public/js/app.js: stated +5/-1, actual +4/-1. The code matches the plan's diff shapes verbatim in both cases; the over-count arose because the previous builder counted the blank separator line in the routes/api.js hunk as two lines instead of one, and counted the maintenance comment as four lines when the design specified three. The build plan's prose ("~6 lines new + 2 changed" for routes/api.js; "4 comment lines + 1 changed line" for app.js) should be read as the plan's own estimate, not the exact numstat. As-built matches the design and plan verbatim in every functional respect. All plan work units are implemented without addition or omission.
-->

# OOHDASH-122 Degraded Banner — Build Summary

**Ticket:** OOHDASH-122 | **Stage:** Build complete | **Date:** 2026-10-14 | **Commit:** 0856514
**Branch:** feat/oohdash-122-degraded-banner | **Target release:** v1.3.8 (patch)
**Input design:** docs/project/OOHDASH-122_DEGRADED_BANNER_DESIGN_2026-10-14.md (gate PR #89)
**Approved build plan:** docs/project/OOHDASH-122_DEGRADED_BANNER_BUILD_PLAN_2026-10-14.md (gate PR #90)
**Standards:** idioms of the existing codebase (vanilla JS client, Node/ESM server, node:test unit tests, Playwright e2e); no stack-specific standards file; universal rules applied.

---

## Features implemented (against approved build plan)

| Work unit | Description | Self-test verdict |
|-----------|-------------|-------------------|
| WU1 | routes/api.js: bridgeDegraded() helper; degraded derivation changed at /me and workspacePayload() | PASS (U1, U4, U5, E1, E2) |
| WU2 | services/tb-device.js: probeBridgeReadOnce() additive block after bridgeStatus() | PASS (P1-P10) |
| WU3 | public/js/app.js: controlLive && !kill guard; three-line maintenance comment above const kill | PASS (U6-U15, E1-E5) |
| WU4 | server.js: fire-and-forget probe call inside app.listen callback (live only); one log line | PASS (P10 wiring pin; manual fixture check) |
| WU5 | test/degraded-banner.test.js (U1-U15) + test/bridge-startup-probe.test.js (P1-P10) | PASS (378/378 unit pass) |
| WU6 | tests/degraded-banner.spec.js (E1-E7) + tests/killswitch.spec.js E5 additions | PASS (137/137 e2e pass) |
| WU7 | Full suite run; cold-start manual check in fixture mode | PASS (counts below) |

---

## File and diff table

| File | Change type | Insertions | Deletions | Net |
|------|------------|------------|-----------|-----|
| routes/api.js | bridgeDegraded() helper + two call sites | 9 | 2 | +7 |
| services/tb-device.js | probeBridgeReadOnce() + STARTUP_PROBE_PATH (additive) | 35 | 0 | +35 |
| public/js/app.js | LIVE banner guard + maintenance comment | 4 | 1 | +3 |
| server.js | probe wiring in app.listen callback | 6 | 0 | +6 |
| test/degraded-banner.test.js | new: U1-U15 | 266 | 0 | +266 |
| test/bridge-startup-probe.test.js | new: P1-P10 | 297 | 0 | +297 |
| tests/degraded-banner.spec.js | new: E1-E7 | 160 | 0 | +160 |
| tests/killswitch.spec.js | E5: two assertions + two comment lines | 4 | 0 | +4 |

Not touched: services/control.js, services/killswitch.js, services/tb-client.js, services/bridge.js,
config.js, public/js/control.js, public/js/views.js, public/js/flows.js, k8s manifests, Cosmos.
package.json version and RELEASE_NOTES.md are bumped by scripts/release.sh at Release, not Build.

---

## Advisory outcomes

### Advisory 1 — readRequest forwarder does not mutate the latch

readRequest at tb-device.js lines 37-39 is a lazy forwarder:

    async function readRequest(method, path, data) {
        const mod = await import('./tb-client.js');
        return mod.readRequest(method, path, data);
    }

It touches neither lastReadOk nor lastReadError. The probe's untouched() predicate
(lastReadOk === false && lastReadError === null) therefore cannot be disturbed by a concurrent
readRequest call that comes through this forwarder. The guard is sound. Every call site in the
module (lines 734, 795, and the new probe at line 1081) goes through this same forwarder.

### Advisory 2 — test seams

Three patterns are in use:

1. U1-U3 (bridgeDegraded derivation): the derivation is inlined in the test file as

       const bridgeDegraded = (status) => !!status.lastError;

   This avoids a mock-module import for a trivial one-liner and keeps the test free-standing.

2. U6-U14 (guard truth table): the vm sandbox injects a preamble

       function __setState(patch) { Object.assign(state, patch); }

   into the same script context as the loaded app.js, then calls ctx.__setState({ ... }) to
   patch state.me, state.siteNo, and state.workspace before calling render(). This is the
   established pattern from test/control-live-signal.test.js.

3. U5 and P-series (cold-start module state, probe tests): tb-device.js is imported with a
   cache-busting query-string (e.g. import(`../services/tb-device.js?t=${Date.now()}`)) so
   each test receives a freshly initialised module with lastReadOk=false and lastReadError=null.

### Advisory 3 — U12 and E5 pin the guard to the red-banner condition

U12 in test/degraded-banner.test.js asserts: state S7 (global kill-switch on, controlLive true,
me.degraded false) renders kill-banner and hides control-live-banner. The test label reads
"U12 AC-2 S7: global kill-switch on -> red only (recommended guard)".

E5 in tests/killswitch.spec.js adds two assertions inside the existing global kill-switch test:
- after the kill-banner appears: control-live-banner count is 0.
- after the switch is cleared: control-live-banner is visible.

Together these two tests will catch any future change that separates the green and red banner
conditions or adds a new red-banner path outside writesDisabled().

### Advisory 4 — server.js comment documents cold start

The comment in server.js reads:

    // OOHDASH-122: one-shot, non-blocking start-up read probe (live only). Never awaited before listen.

"Never awaited before listen" is the load-bearing phrase: it documents that start-up is never
held up by the probe, and that the few-second window before the probe resolves where /healthz
shows bridge.healthy false with lastError null is by design, not a fault.

---

## Self-verification results

### Unit tests

Command: node --experimental-test-module-mocks --test "test/*.test.js"

| Metric | Count |
|--------|-------|
| Total | 379 |
| Pass | 378 |
| Fail | 0 |
| Skip | 1 |

The one skip is test/iot-consumer-parse.test.js U13 (drift check against ../iot-support-dashboard);
same skip result on main. All existing unit test files pass unchanged. New tests added by this
branch: 25 (U1-U15 in degraded-banner.test.js) + 10 (P1-P10 in bridge-startup-probe.test.js) = 35
new tests.

### E2E tests

Command: npx playwright test (retries: 1; workers: 1; fixture mode port 3155)

| Spec file | Tests | Pass | Fail | Skip |
|-----------|-------|------|------|------|
| tests/degraded-banner.spec.js | 7 | 7 | 0 | 0 |
| tests/killswitch.spec.js | 3 | 3 | 0 | 0 |
| tests/control.spec.js | 12 | 12 | 0 | 0 |
| tests/resolution.spec.js | 8 | 8 | 0 | 0 |
| tests/area-model.spec.js | 8 | 8 | 0 | 0 |
| tests/outside-lighting-p1.spec.js | 8 | 8 | 0 | 0 |
| tests/boilercontrol.spec.js | 3 | 3 | 0 | 0 |
| tests/auth.spec.js | 3 | 3 | 0 | 0 |
| tests/tonight-callback.spec.js | 10 | 10 | 0 | 0 |
| tests/removal-health.spec.js | 13 | 13 | 0 | 0 |
| tests/additional-notes.spec.js | 25 | 25 | 0 | 0 |
| tests/tester/oohdash-119.tester.spec.js | 38 | 36 | 0 | 2 |

**Total: 139 tests. 137 pass, 2 skip, 0 fail.**

The two skips are TF-18 (line 660, ctlFinish carries additionalNotes; fixture site 6832 has no
control tile) and TF-19 (line 707, ctlEscalate additionalNotes; escalate button absent in
fixture). Both skipped before this branch and unchanged.

---

## AC traceability

| AC | Requirement | Tests | Status |
|----|------------|-------|--------|
| AC-1 | No false red banner on clean restart | U1 (boot state false), U5 (module cold start), E1 (green only in browser), P1 (probe success) | Met |
| AC-2 | Red and green never show together, all states S1-S9 | U6-U14 (full truth table), E1-E4 (browser journeys), E5 (kill-switch co-fire) | Met for all nine states |
| AC-3 | /healthz bridge reflects a real probe after start-up; no tri-state added | P1-P4 (probe outcomes), U5 (documents residual boot window), P10 (wiring pin) | Partly met per DECISION 2: probe sets latch within ~1-3s; short boot window remains; /healthz shape unchanged |

---

## Deviations from the approved build plan

None in function or behaviour.

One counting discrepancy between the previous builder's stated diff summary and the git diff
--numstat output:

| File | Stated | Actual |
|------|--------|--------|
| routes/api.js | +11/-2 | +9/-2 |
| public/js/app.js | +5/-1 | +4/-1 |

The code matches the plan's diff shapes verbatim. The over-count arose because the previous
builder counted the blank separator line in the routes/api.js hunk twice, and counted the
maintenance comment as four lines when the design specified three lines of comment text. The
plan's prose estimate ("~6 lines new + 2 changed" for routes/api.js; "4 comment lines + 1
changed line" for app.js) is the source of the discrepancy, not the code. All plan work units
are implemented without addition or omission.

---

## Rollback

**Retrieving the v1.3.7 image digest before release:**

Use either of these two methods before running scripts/release.sh:

1. From the cluster (read the current image before the release push):

       kubectl -n iot-services get deployment ooh-dashboard \
           -o jsonpath='{.spec.template.spec.containers[0].image}'

2. From ACR (list tags sorted by time):

       az acr repository show-tags \
           --name <registry-name> \
           --repository ooh-dashboard \
           --orderby time_desc \
           --output table

   The tag immediately before v1.3.8 is v1.3.7.

**To roll back after release:**

    kubectl -n iot-services set image \
        deployment/ooh-dashboard \
        ooh-dashboard=<v1.3.7-digest>

Verify resources are preserved afterwards (kubectl get deployment -o json and check
.spec.template.spec.containers[0].resources; apply set resources if they drifted, per the
OOM-crash lessons in memory/ooh-oom-crashloop-resource-drift.md).

**Go/no-go rule if the probe fails after release:**

- L1 shows bridge.healthy false with a non-null lastError: probe genuinely failed; check the
  [TB] start-up read probe log line for the error text. A 401 means the read credential needs
  rotation; a 503/network error means TB was transiently unavailable; either will clear on the
  next successful getSitesByNumber() call. This is not an automatic rollback trigger.
- L1 shows bridge.healthy false with lastError null and the pod has been ready for more than
  30s: the probe may not have fired; check server logs for the [TB] line. If absent, investigate
  before proceeding to L3-L4.
- L1 shows bridge.healthy false with lastError null within the first 10s: this is the normal
  pre-probe boot window; wait and re-check.
- L3 shows a red banner on New Call with no site searched: the client is receiving degraded: true
  from /api/me; a probe failure is the likely cause; check L2 before rolling back.

The probe has no persistent effect. Rollback restores exact v1.3.7 behaviour, including the
known cold-start double-banner.

---

## Cold-start note

If ThingsBoard responds HTTP 429 at the moment of the start-up probe, probeBridgeReadOnce()
returns outcome rate-limited, makes no change to lastReadOk or lastReadError, and the latch stays
at its boot values: healthy:false, lastError:null. From the client's perspective, bridgeDegraded()
returns false (lastError is null), so no red banner appears. /healthz shows bridge.healthy false
with lastError null. This is correct and expected; it is not a deploy failure.

The same healthy:false / lastError:null state is present for the first few seconds of any cold
start before the probe completes, regardless of TB availability. Kubernetes liveness and readiness
probes are unaffected because /healthz always returns HTTP 200 regardless of bridge state.

---

## Live-proof checklist (James)

Perform after v1.3.8 pod restart in the live cluster.

**L1 (orchestrator, within 60s of pod ready):** GET /healthz.

Pass condition: JSON contains "version": "1.3.8" and subsystems.bridge equals
{ "mode": "live", "healthy": true, "lastError": null }. The thingsboardRead subsystem may show
degraded on its 60s TTL cycle; that is DECISION 3 territory and is not a fail for this ticket.

**L2 (orchestrator):** Check pod logs for the new pod.

Pass condition: exactly one line matching

    [TB] start-up read probe: ok in <n>ms

No "retry" or second probe line. If the line shows "failed" or "timeout", note the error text
before proceeding to L3.

**L3 (James):** Open the New Call page in a fresh browser tab before any site search or lookup.

Pass condition: the green "Device control is LIVE" banner is visible; the red kill-banner is
absent; the page shows no red text.

**L4 (James):** Search and confirm any live site (for example 6832 Old Grey Mare) and open the
workspace.

Pass condition: green banner only; no site-level "reads are unavailable" degraded warning.

**L5 (James, optional):** Engage the global kill-switch from Admin, confirm the banner state,
then clear it. Skip if any live call activity is present.

Pass condition: red "control actions are disabled" banner visible while engaged; green LIVE banner
absent while engaged; green banner returns and red banner disappears after clearing.

---

## Recommended CIR runbook text

Add the following to OOH_DASHBOARD_DEPLOY.md, replacing the existing cold-start gotcha note
("A red banner after restart is a cold-start artefact; it clears in seconds"):

---

**v1.3.8 cold-start behaviour (OOHDASH-122)**

After a pod restart the dashboard makes one read-only probe request to ThingsBoard (list one
device, no site required) using the read credential. The probe runs in the background after the
port is bound and does not delay start-up.

Diagnosing the start-up probe: check the pod log for the line

    [TB] start-up read probe: <outcome> in <n>ms

Outcome values and their meaning:

- ok: TB reads are working; bridge is healthy from boot. Red banner will not appear.
- failed or timeout: TB was unreachable at start-up. The red "reads unavailable" banner appears
  and clears automatically after the first successful site lookup. Check the error text in the
  log line; a 401 means the read credential needs rotation.
- rate-limited: TB returned 429; probe backed off without recording an error. No red banner.
  The latch will be set by the first real site lookup.
- (line absent): the probe did not fire; either DATA_MODE is not live, or server.js did not
  reach the app.listen callback. Check the startup sequence in the logs.

The short window (a few seconds) between pod-ready and probe completion where /healthz shows
bridge.healthy false and lastError null is normal; it is not a failure. Kubernetes probes are
unaffected.

A red banner that appears after a restart and does not clear after 60s is a genuine TB read
failure, not a cold-start artefact. Check the [TB] probe log line and the TB read credential
before rolling back.

Rollback: kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=<v1.3.7-digest>.
Preserve resources (check .spec.template.spec.containers[0].resources before and after).

---

## Commits on branch

0856514 fix(OOHDASH-122): degraded-mode banner false negative -- cold-start double banner
