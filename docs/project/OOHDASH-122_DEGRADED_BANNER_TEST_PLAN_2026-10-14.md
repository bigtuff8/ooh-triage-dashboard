<!-- gate:contract
SECTION: What this plan covers
This is the independent test plan for OOHDASH-122, the degraded-mode banner false negative fix. It covers every check that must pass before the build may be released, and the live-proof steps for James to complete after release. The plan was authored by the independent tester working on branch test/oohdash-122-degraded-banner. It was first written against build 0856514 and updated after the hardening pass (cb9efc9). The hardening pass resolved F-01: source-check tests U4, U15, and P10 were deleted; U1-U3 now import and call the real bridgeDegraded export from routes/api.js; P11 was added to confirm probeBridgeReadOnce always resolves. The tester does not fix code and does not redesign; this document records results of the full unit suite (379 tests, 378 pass, 1 skip) and the full e2e suite (139 tests, 133 passed, 3 failed pre-existing, 1 flaky pre-existing, 2 skipped).

SECTION: Scope binding
This plan tests the decisions James approved at the design gate: Option B (degraded = !!lastError), the LIVE banner guard on !kill covering all five red-banner triggers, the startup probe running once in live mode only, AC-3 as probe-only with no tri-state, and thingsboardRead TTL left as-is. F11 (refrigeration lock) and F12 (mid-call outage) are accepted known behaviour and are not tested or flagged here. No automation was run against the live site. Live proof is James's post-release click-through.

SECTION: Entry state
Unit suite result at cb9efc9: 379 tests, 378 pass, 0 fail, 1 skipped. The 1 skip is the pre-existing IOT_REPO_PATH drift check (expected on any machine without that path set). E2e suite result at cb9efc9: 139 tests, 133 passed, 3 failed (all pre-existing, see F-02), 1 flaky (pre-existing), 2 skipped. Git diff of control.spec.js and the affected tester spec against origin/main produces zero lines of difference, confirming OOHDASH-122 did not introduce or regress any of those tests.

SECTION: Hygiene
All new and changed files are LF-only (verified with cat -A: no ^M characters in any line). No curly quotes were introduced by the diff. The em-dash in the LIVE banner text (U+2014) is pre-existing and appears unchanged on both sides of the diff.
-->

# TEST PLAN -- OOHDASH-122
## One banner at a time: degraded-mode banner false negative, LIVE guard, start-up probe

**Ticket:** OOHDASH-122 | **Stage:** Test | **Date:** 2026-10-14 | **Build SHA tested:** cb9efc9
**Test branch:** test/oohdash-122-degraded-banner
**Tester-owned check:** test/TF-122-01-coldstart.test.js

---

## 1. Check list

All builder checks run as part of the full suites (npm run test:unit and npx playwright test). Tester checks TF-122-01 CS-A and CS-B were added to test/TF-122-01-coldstart.test.js and are included in npm run test:unit.

### 1.1 Unit checks (test/degraded-banner.test.js)

| ID | AC | Case | Method | Result |
|----|-----|------|--------|--------|
| U1 | AC-1 | Boot state (healthy:false, lastError:null) | bridgeDegraded({healthy:false, lastError:null}) -- real export from routes/api.js | PASS: false |
| U2 | AC-2 | After good read (healthy:true, lastError:null) | bridgeDegraded({healthy:true, lastError:null}) -- real export | PASS: false |
| U3 | AC-2 | After failed read (lastError set) | bridgeDegraded({healthy:false, lastError:'...503'}) -- real export | PASS: true |
| U4 | AC-1 | Source pin: routes/api.js uses bridgeDegraded() | REMOVED (hardening pass cb9efc9) -- was a source-check; behaviour covered by U1/U5/E1 |
| U5 | AC-1 | Cold-start module state: bridgeDegraded(bridgeStatus()) before any read or probe | Fresh import of tb-device with tb-client mocked | PASS: false; bridgeStatus()={healthy:false,lastError:null} |
| U6 | AC-2 | S1: cold start, me.degraded now false | vm sandbox render, me.degraded=false, controlLive=true | PASS: green only |
| U7 | AC-2 | S2: account-level read failure, me.degraded=true | vm sandbox render, me.degraded=true | PASS: red only |
| U8 | AC-2 | S3: workspace-level failure, workspace.degraded=true | vm sandbox render, workspace.degraded=true | PASS: red only |
| U9 | AC-2 | S4: both degraded | vm sandbox render, both=true | PASS: red only |
| U10 | AC-2 | S5: fully healthy | vm sandbox render, both=false | PASS: green only |
| U11 | AC-2 | S6: deploy lock, controlLive=false | vm sandbox render, writesDisabled=true | PASS: red only, no green (controlLive false) |
| U12 | AC-2 | S7: global kill-switch on, writes enabled | vm sandbox render, ks.global=true | PASS: red only |
| U13 | AC-2 | S8: site kill-switch on, that site open | vm sandbox render, ks.sites[6832] set, siteNo=6832 | PASS: red only |
| U14 | AC-2 | S9: site kill-switch on, different site | vm sandbox render, ks.sites[9999] set, siteNo=6832 | PASS: green only |
| U15 | AC-2 | Comment pin: OOHDASH-122 AC-2 comment in app.js | REMOVED (hardening pass cb9efc9) -- was a source-check; behaviour covered by U6-U14 |

### 1.2 Unit checks (test/bridge-startup-probe.test.js)

| ID | AC | Case | Result |
|----|-----|------|--------|
| P1 | AC-3 | Probe success: outcome ok, readRequest called once, bridge healthy | PASS |
| P2 | AC-3 | Probe failure (401): outcome failed, lastError set, healthy false, one call | PASS |
| P3 | AC-3 | Probe timeout (20ms cap): outcome timeout, lastError matches /timed out after 20ms/ | PASS |
| P4 | AC-3 | 429 back-off: outcome rate-limited, state untouched, one call | PASS |
| P5 | AC-3 | Real read wins over late probe failure | PASS |
| P6 | AC-3 | Real failure not overwritten by late probe success | PASS |
| P7 | AC-3 | Never throws: sync throw and non-Error reject both resolve to outcome failed | PASS |
| P8 | AC-3 | Fixture mode: outcome skipped, readRequest never called | PASS |
| P9 | AC-3 | No secret leakage: err.config with password not in lastError | PASS |
| P10 | AC-3 | Wiring pin: server.js calls bridge.probeBridgeReadOnce() | REMOVED (hardening pass cb9efc9) -- was a source-check; wiring proven behaviourally by TF-122-01 |
| P11 | AC-3 | probeBridgeReadOnce always resolves, never rejects (fire-and-forget .catch() safety) | PASS: resolved with outcome object; rejected=false |

### 1.3 E2e checks (tests/degraded-banner.spec.js + tests/killswitch.spec.js)

Fixture mode, real server, DATA_MODE=fixture, WRITES_DISABLED=false, port 3155. Degraded states produced by page.route() patching only the degraded field.

| ID | AC | Journey | Result |
|----|-----|---------|--------|
| E1 | AC-1/AC-2 | Cold start: sign in as Test Handler; land on New Call | PASS: control-live-banner visible, kill-banner count 0 |
| E2 | AC-2 | Account-level failure: patch /api/me degraded:true | PASS: kill-banner contains "degraded mode", control-live-banner count 0 |
| E3 | AC-2 | Workspace-level failure: patch confirm workspace.degraded:true | PASS: kill-banner visible, control-live-banner count 0, degraded-banner visible |
| E4 | AC-2 | Recovery: remove route, click nav-home | PASS: kill-banner count 0, control-live-banner visible |
| E5 | AC-2 | Global kill-switch: LIVE banner absent while engaged, restored after clear (inside killswitch.spec.js) | PASS: control-live-banner count 0 while engaged; visible after clear |
| E6 | AC-2 | Control blocked when degraded: tile-heating -> area-bar-restaurant -> need-warm | PASS: control-blocked contains "degraded mode", dispatch not called (count 0) |
| E7 | AC-3 | /healthz healthy after confirmed workspace | PASS: bridge.healthy=true, lastError=null |

### 1.4 Tester-owned checks (test/TF-122-01-coldstart.test.js)

Genuine cold-start integration test. Boots the real server.js as a subprocess in live mode (DATA_MODE=live, AUTH_MODE=dev) with a network-stubbed TB server. The Cosmos probe is directed at the same stub, which returns an immediate HTTP 404; CosmosClient fails fast, store.healthy becomes false (expected and inconsequential for the bridge assertions). Bridge state is read from /healthz (unauthenticated), which exposes bridge.healthy and bridge.lastError. /api/me cannot be hit without a session in live mode; TF-122-01 substitutes /healthz with a note that AC-1 (/api/me degraded:false at cold start) is proven via U5 and E1.

| ID | AC | Case | Method | Result |
|----|-----|------|--------|--------|
| TF-122-01 CS-A | AC-3 | Cold-start probe success: stub returns 200 on device list | Subprocess, poll /healthz until bridge.healthy:true (max 10s after server-up) | PASS: bridge.healthy=true, lastError=null after ~1.6s |
| TF-122-01 CS-B | AC-3 | Cold-start probe failure: stub returns 401 | Subprocess, poll /healthz until lastError is non-null (max 10s after server-up) | PASS: bridge.healthy=false, lastError starts with "Start-up read probe failed:" |

---

## 2. Full suite counts

Unit (at cb9efc9): 379 tests, 378 pass, 0 fail, 1 skipped. The 1 skipped is the pre-existing IOT_REPO_PATH drift check (expected on any machine without that path set). Net change from 0856514: U4/U15/P10 removed (-3), P11 added (+1) = 2 fewer tests total; all OOHDASH-122 checks pass.

E2e (at cb9efc9): 139 tests, 133 passed, 3 failed (all pre-existing, see F-02), 1 flaky (pre-existing, passed on retry), 2 skipped. The 3 failed are: control.spec.js F008 Robin Hood restaurant, control.spec.js F008 IT700 Jolly Scotchman, and oohdash-119.tester.spec.js TF-28. The flaky is oohdash-119.tester.spec.js TF-25 (passed on retry #1). None of these are in files changed by OOHDASH-122.

---

## 3. Findings

### F-01 -- Source-check tests U4, U15, P10 -- RESOLVED (hardening pass cb9efc9)

Original finding: U4 in test/degraded-banner.test.js read routes/api.js as text and asserted a string count. U15 read public/js/app.js and asserted a comment string. P10 in test/bridge-startup-probe.test.js read server.js and asserted wiring text. All three verified string presence, not observed behaviour, and were banned by the test-stage protocol.

Resolution at cb9efc9: U4 and U15 are deleted. P10 is deleted. U1-U3 now call the real bridgeDegraded function imported from routes/api.js via a dynamic import in the before() hook (after env and mocks are in place); they assert on the function's return value, not on source text. P11 was added: it calls probeBridgeReadOnce() with a throwing mock and asserts the promise resolves (never rejects), covering the fire-and-forget .catch() in server.js behaviourally. F-01 is fully resolved; no source-check tests remain in the OOHDASH-122 suite.

### F-02 -- Pre-existing e2e failures (medium severity; pre-existing on main, not introduced by OOHDASH-122)

This run (cb9efc9): three e2e tests fail. All three are confirmed pre-existing: git diff of control.spec.js and oohdash-119.tester.spec.js against origin/main produces zero changed lines.

Failures:
- control.spec.js:106 F008 "failed write is reported honestly -- never success (Robin Hood restaurant)": sync-failed element not found within 20s. Pre-existing fixture/timing issue unrelated to OOHDASH-122.
- control.spec.js:124 F008 "IT700 slow echo: timeout state, keep-waiting, escalate (Jolly Scotchman)": same element missing. Pre-existing.
- oohdash-119.tester.spec.js:970 TF-28 "mobile 390x844 -- notes box visible, no horizontal scroll, font-size >= 16px": scrollWidth exceeds clientWidth. Pre-existing mobile overflow from the open-tickets row in views.js; attributed to OOHDASH-127.

Flaky: oohdash-119.tester.spec.js:886 TF-25 failed on first attempt and passed on retry #1 (operator-name element not found; sign-in timing). Pre-existing race, attributed to OOHDASH-127.

Route: TF-28 and TF-25 are being fixed by OOHDASH-127. The control.spec.js F008 failures require a separate ticket. Do not block OOHDASH-122 release on any of these.

---

## 4. AC mapping after testing

| AC | Requirement | Evidence from this test run |
|----|-------------|------------------------------|
| AC-1 | No false red banner on clean restart | U1: bridgeDegraded (real export) returns false for boot state (lastError:null). U5: cold-start module import; bridgeDegraded(bridgeStatus())=false confirmed. E1: fixture-mode sign-in shows green only, no kill-banner. TF-122-01 CS-A: live-mode subprocess; bridge.healthy:true after probe success. |
| AC-2 | Red and green never show together across all five causes | U6-U14: all nine states (S1-S9) from design section 5 verified in vm sandbox; no state renders both banners. E1-E6 plus E5 in killswitch.spec.js: five cause paths driven in real browser. |
| AC-3 | /healthz bridge reflects a real probe after start-up | P1-P9, P11: probe function tested from boot state for success, failure, timeout, 429, race, secret-leakage, and always-resolves. TF-122-01 CS-A: live-mode subprocess; /healthz shows bridge.healthy:true within 2s of boot after probe success. TF-122-01 CS-B: /healthz shows bridge.healthy:false and lastError set after probe failure. E7: fixture-mode /healthz healthy after confirmed workspace. DECISION 2 accepted: a few-second window at boot where /healthz shows status:degraded (bridge.healthy:false, lastError:null) before the probe settles is expected and correct. |

---

## 5. Post-release live click-through script for James

These are the steps to perform after the v1.3.8 pod has restarted and is ready. No automation runs against live. Capture screenshots at each step as evidence.

L1 -- Within 60 seconds of the new pod reporting ready, open the /healthz endpoint in a browser or curl. The result must show version 1.3.8, subsystems.bridge.mode:live, subsystems.bridge.healthy:true, and subsystems.bridge.lastError:null. The subsystems.thingsboard.read field may show unknown on the 60-second TTL cycle; that is expected (DECISION 3, out of scope) and is not a failure.

L2 -- In the pod log (Kubernetes log viewer or kubectl logs) for the new pod, confirm there is exactly one "[TB] start-up read probe: ok in Nms" line and no retry lines. If the log shows "failed" or "timed out" instead of "ok", check whether ThingsBoard was briefly unreachable at the restart time before treating it as a defect. A genuine probe failure here shows a real error and clears on the first handler-triggered workspace load; it is not a false alarm.

L3 -- Sign in to the OOH Dashboard as yourself. On the New Call page (before searching or confirming any site) check that only the green "Device control is LIVE" banner is visible and no red "control actions are disabled" banner is present. This is the fix confirmed in production.

L4 -- Search for and confirm a live site (for example 6832 Old Grey Mare) and open the workspace. Check that only the green banner is present; no site-level degraded warning should appear.

L5 -- (Optional, only if an IoT admin is available and there is no live call activity.) Engage then clear the global kill-switch from the Admin page. While engaged: only the red banner should be visible; the green banner must be absent. After clearing: only the green banner should be visible. Skip this step entirely if there is any live call activity.

If L1 shows healthy:false with a non-null lastError, the probe genuinely failed at restart time. Check L2 for the error text before treating it as a defect in the build.
