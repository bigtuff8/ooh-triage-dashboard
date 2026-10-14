<!-- gate:contract
SECTION: What is being built
OOHDASH-122, build stage. Four small production-file changes and two new test files plus two test additions fix the cold-start double-banner false negative and add a one-shot start-up read probe. Every design decision is already resolved by James's binding selections at the design gate. No new operator decisions are needed before the build starts.

SECTION: The four production changes in one sentence each
In routes/api.js a new bridgeDegraded() helper replaces the two bare !bridge.bridgeStatus().healthy expressions so that degraded is only true when a real read error has been recorded, never merely because the pod has not read yet. In public/js/app.js the green LIVE banner gains a one-line guard on !kill (the same value that draws the red banner) and a four-line maintenance comment so the coupling is never deleted silently. In services/tb-device.js a new self-contained probeBridgeReadOnce() function is appended after bridgeStatus() with no edit to any existing line. In server.js a fire-and-forget call to bridge.probeBridgeReadOnce() is inserted inside the app.listen callback in live mode only, with one log line.

SECTION: Ordered work units
Seven work units in dependency order, each self-verifiable before the next starts. WU1 routes, WU2 probe function, WU3 client guard, WU4 server wiring, WU5 unit tests, WU6 e2e tests, WU7 full-suite verification. WU1 to WU4 are the production changes; WU5 to WU7 are the test layer. No work unit touches OOHDASH-123 territory: the only shared file is services/tb-device.js where the change is a clean additive block after the last line of bridgeStatus().

SECTION: How existing test suites stay green
The unit suite (npm run test:unit) and the e2e suite (npx playwright test) are both required CI checks. The three existing unit tests that assert on the degraded/health signals (control-live-signal.test.js, healthz-read-tristate.test.js, tb-device.test.js) are unaffected: control-live-signal.test.js stubs /api/me with no kill reason so the LIVE banner renders exactly as before; healthz-read-tristate.test.js does not touch tb-device.js; tb-device.test.js does not touch bridgeStatus() or the new probe. One change to killswitch.spec.js adds two assertions (LIVE banner absent while the global switch is on, back after clear) which are the only updates to existing spec files.

SECTION: Rollback and release
Rollback: redeploy image v1.3.7 (kubectl set image, preserving resources). No data, schema, config or manifest changes. Release target: v1.3.8 via scripts/release.sh (bumps package.json version and RELEASE_NOTES.md). Live proof: orchestrator checks /healthz and the pod log within 60 seconds of pod-ready; James does a click-through on the live New Call page; one optional kill-switch round-trip if a quiet window is available.
-->

# OOHDASH-122 Degraded Banner — Build Plan

**Ticket:** OOHDASH-122 | **Stage:** Build plan | **Date:** 2026-10-14 | **Target release:** v1.3.8 (patch)
**Input:** docs/project/OOHDASH-122_DEGRADED_BANNER_DESIGN_2026-10-14.md (design gate PR #89, merged)
**Branch:** build/oohdash-122-degraded-banner (from main, to be cut at build start)
**Standards:** idioms of the existing codebase (vanilla JS client, Node/ESM server, node:test unit tests, Playwright e2e)

---

## 1. Binding decisions (all resolved; no open DECISIONs)

| Decision | James's selection | Implementation |
|---|---|---|
| LIVE banner guard | Hide whenever kill shows for any reason (recommended form) | `state.me.controlLive && !kill` at app.js:165 |
| AC-3 scope | Start-up probe only; no unknown/tri-state for bridge on /healthz | probeBridgeReadOnce() only; bridgeStatus() shape unchanged |
| thingsboardRead 60s TTL | Leave as-is; new ticket (to be raised) | No edit to tb-client.js; no change to /healthz shape |
| degraded derivation | Option B: bridgeDegraded() helper = !!lastError | bridgeDegraded() in routes/api.js |
| Start-up probe | In scope for this ticket | probeBridgeReadOnce() in tb-device.js, wired in server.js |
| Server-side write-path health check | No; writesDisabled and kill-switch remain the authoritative gates | services/control.js and services/killswitch.js untouched |

---

## 2. Complete change list

| File | Change | Lines affected | OOHDASH-123 overlap |
|---|---|---|---|
| routes/api.js | New bridgeDegraded() helper; update /me degraded (line 65); update workspacePayload() degraded (line 217) | ~6 lines new + 2 changed | None |
| public/js/app.js | LIVE banner guard (line 165, 1 line changed); maintenance comment above line 142 (4 lines added) | 5 lines | None |
| services/tb-device.js | New probeBridgeReadOnce() + STARTUP_PROBE_PATH constant, appended after bridgeStatus() (after line 1063) | ~40 lines additive | Low: additive block after line 1063; 123 edits are elsewhere in the file |
| server.js | Probe wiring inside app.listen callback after the WRITE-LOCK block (after line 166), before closing `});` | ~6 lines | None |
| test/degraded-banner.test.js | New unit test file: U1-U15 | New file | None |
| test/bridge-startup-probe.test.js | New unit test file: P1-P10 | New file | None |
| tests/degraded-banner.spec.js | New Playwright spec: E1-E7 | New file | None |
| tests/killswitch.spec.js | Two added assertions: LIVE banner absent while global kill on (E5), back after clear | +2 assertions into the existing global kill-switch test | None |

Not touched: services/control.js, services/killswitch.js, services/tb-client.js, services/bridge.js, config.js, public/js/control.js, public/js/views.js, public/js/flows.js, k8s manifests, Cosmos. package.json version and RELEASE_NOTES.md are bumped by scripts/release.sh at release, not during build.

---

## 3. Ordered work units

### WU1 — routes/api.js: bridgeDegraded() helper and degraded derivation (0.25 h)

File: `routes/api.js`

Context: bridge is already imported as `import * as bridge from '../services/bridge.js'` (line 10). Two lines currently read `degraded: !bridge.bridgeStatus().healthy` (line 65 inside the /me handler, line 217 inside workspacePayload()).

Changes:

Insert the following block directly above the GET /me route handler. The comment from the design doc is mandatory and must appear verbatim:

    // OOHDASH-122: read-degraded means a REAL read failure has been recorded (lastError set),
    // not "not yet proven". A fresh pod with no read yet is not degraded. Used by /me AND the
    // workspace payload so the two degraded signals can never disagree in meaning.
    export function bridgeDegraded(status = bridge.bridgeStatus()) {
        return !!status.lastError;
    }

Replace at line 65 (inside the /me handler):

    -        degraded: !bridge.bridgeStatus().healthy,
    +        degraded: bridgeDegraded(),

Replace at line 217 (inside workspacePayload()):

    -        degraded: !bridge.bridgeStatus().healthy,
    +        degraded: bridgeDegraded(),

Self-verify: server starts clean with `node server.js` (fixture mode); GET /api/me response contains `"degraded":false`; both changed lines present in output of grep on the file.

---

### WU2 — services/tb-device.js: probeBridgeReadOnce() (0.5 h)

File: `services/tb-device.js`

Context: bridgeStatus() ends at approximately line 1063 (`lastError: lastReadError`). The module-level lazy readRequest wrapper is at line 37; it resolves tb-client.readRequest on first call. The variables lastReadOk (line 84) and lastReadError (line 85) are the latch. No existing line in this file is edited.

Insert the following block directly after the closing `}` of bridgeStatus() (after line 1063). The comment header is mandatory:

    /**
     * OOHDASH-122 (Option A): ONE-SHOT start-up read probe. Proves the TB read path with a single
     * site-independent, read-only request (list one device) so the degraded latch reflects reality
     * before any handler opens a workspace. Never throws, never retries, never blocks start-up.
     * Only writes the latch while it is still in its untouched boot state, so a real read always wins.
     */
    const STARTUP_PROBE_PATH = '/api/tenant/devices?pageSize=1&page=0';
    export async function probeBridgeReadOnce({ timeoutMs = 8000 } = {}) {
        if (config.dataMode !== 'live') return { outcome: 'skipped' };
        const untouched = () => lastReadOk === false && lastReadError === null;
        const started = Date.now();
        let timer;
        try {
            const timeout = new Promise(r => { timer = setTimeout(() => r('timeout'), timeoutMs); timer.unref?.(); });
            const call = readRequest('GET', STARTUP_PROBE_PATH).then(() => 'ok', err => err);
            const result = await Promise.race([call, timeout]);
            const ms = Date.now() - started;
            if (result === 'ok') {
                if (untouched()) { lastReadOk = true; lastReadError = null; }
                return { outcome: 'ok', ms };
            }
            if (result === 'timeout') {
                if (untouched()) lastReadError = `Start-up read probe timed out after ${timeoutMs}ms`;
                return { outcome: 'timeout', ms };
            }
            if (result?.response?.status === 429) return { outcome: 'rate-limited', ms };
            if (untouched()) lastReadError = `Start-up read probe failed: ${result?.message || 'unknown error'}`;
            return { outcome: 'failed', ms, error: result?.message };
        } catch (err) {
            return { outcome: 'failed', error: err?.message };
        } finally {
            clearTimeout(timer);
        }
    }

Implementation notes:
- `readRequest` in scope: it is the lazy module-level wrapper at line 37; calling it from the new function is identical to how it is used at lines 734 and 795.
- `config` in scope: already imported at module level.
- `untouched()` predicate: exactly `lastReadOk === false && lastReadError === null`, which is true only in the untouched boot state (never in fixture mode because lastReadOk starts true there, and never after a real read because lastReadError is always set or lastReadOk is always true).
- The 429 branch returns without writing the latch; the boot state is preserved and no retry is scheduled.
- The catch is belt-and-braces; every plausible throw path is already handled in the try block.
- services/bridge.js is `export * from './tb-device.js'` so probeBridgeReadOnce() is available as `bridge.probeBridgeReadOnce()` immediately with no change to bridge.js.

Self-verify: `npm run test:unit` — all existing tb-device.test.js tests pass unchanged; no syntax error in the file.

---

### WU3 — public/js/app.js: LIVE banner guard and maintenance comment (0.25 h)

File: `public/js/app.js`

Context: line 142 is `const kill = writesDisabled(state.siteNo);` and line 165 is the green LIVE banner render.

Change 1 — insert maintenance comment on the line directly above line 142 (so the comment precedes `const kill`):

    // OOHDASH-122 AC-2 (one banner at a time): `kill` drives the red kill-banner AND suppresses the
    // green LIVE banner below. Every reason control is blocked MUST be returned from writesDisabled()
    // (app.js:47) - never rendered as a separate red banner - or the two banners can co-fire again.

Change 2 — replace line 165 (the green LIVE banner, recommended guard form):

    -  ${state.me.controlLive ? `<div class="banner live" data-testid="control-live-banner">...` : ''}
    +  ${state.me.controlLive && !kill ? `<div class="banner live" data-testid="control-live-banner">...` : ''}

The banner div contents (from the opening backtick to the closing empty string) are preserved exactly; only the ternary condition changes.

CX notes from the design:
- kill is site-aware (writesDisabled takes state.siteNo), so the per-site kill-switch hides the banner only while that site is open (design S8/S9 — correct).
- The first-use "Device control is now LIVE" modal (controlLiveTransition / CTRL_LIVE_SEEN) keys off state.me.controlLive, not the banner, and is unchanged.
- Banner testids `kill-banner` and `control-live-banner` are unchanged.

Self-verify: page loads in fixture mode with no console errors; control-live-signal.test.js unit tests all pass (the ON case has no kill reason, so the banner still renders exactly as before).

---

### WU4 — server.js: probe wiring (0.1 h)

File: `server.js`

Context: the app.listen callback runs from line 152 to line 167. bridge is already imported as `import * as bridge from './services/bridge.js'` (line 20). The WRITE-LOCK console block ends at line 166. The closing `});` is at line 167. The probe wiring goes between lines 166 and 167.

Insert after line 166 (inside the app.listen callback, after the WRITE-LOCK block):

        // OOHDASH-122: one-shot, non-blocking start-up read probe (live only). Never awaited before listen.
        if (config.dataMode === 'live') {
            bridge.probeBridgeReadOnce()
                .then(r => console.log(`[TB] start-up read probe: ${r.outcome}${r.ms !== undefined ? ` in ${r.ms}ms` : ''}${r.error ? ` (${r.error})` : ''}`))
                .catch(() => { /* probeBridgeReadOnce never rejects; guard anyway */ });
        }

The guard on `config.dataMode === 'live'` means fixture-mode test runs never call the function (probeBridgeReadOnce also guards internally, but the outer guard keeps the server log clean in tests).

Self-verify: server starts in fixture mode; no `[TB] start-up read probe` log line appears (guard works); no crash.

---

### WU5 — Unit tests (1.5 h)

Run command: `npm run test:unit` (node --experimental-test-module-mocks --test "test/*.test.js")

#### WU5a — test/degraded-banner.test.js (new)

Pattern: import bridgeDegraded from routes/api.js directly (or inline the derivation logic); use the vm sandbox pattern already established in test/control-live-signal.test.js for the guard truth-table tests (U6-U14). No network. No wall-clock sleeps.

| ID | AC | Case | Method | Expected |
|---|---|---|---|---|
| U1 | AC-1 | Boot state: not degraded | bridgeDegraded({ healthy: false, lastError: null }) | false |
| U2 | AC-2 | After good read: not degraded | bridgeDegraded({ healthy: true, lastError: null }) | false |
| U3 | AC-2 | After failed read: degraded | bridgeDegraded({ healthy: false, lastError: 'Request failed with status code 503' }) | true |
| U4 | AC-1 | Source pin: /me and workspacePayload both use bridgeDegraded() | Grep routes/api.js for `degraded: bridgeDegraded()` (two occurrences); assert `degraded: !bridge.bridgeStatus()` is absent | Pass |
| U5 | AC-1 | Cold-start module state: bridgeDegraded(bridgeStatus()) with no probe and no read | Import tb-device with tb-client mocked; bridgeDegraded(bridgeStatus()) | false; bridgeStatus() = { healthy: false, lastError: null } |
| U6 | AC-2 | S1: cold start (me.degraded now false) | vm sandbox: me.degraded=false, me.controlLive=true, ks all false | control-live-banner in HTML; kill-banner absent |
| U7 | AC-2 | S2: account-level read failure | me.degraded=true, me.controlLive=true, ks all false | kill-banner in HTML; control-live-banner absent |
| U8 | AC-2 | S3: workspace-level failure | me.degraded=false, workspace.degraded=true, me.controlLive=true | kill-banner in HTML; control-live-banner absent |
| U9 | AC-2 | S4: both degraded | me.degraded=true, workspace.degraded=true, me.controlLive=true | kill-banner; control-live-banner absent |
| U10 | AC-2 | S5: fully healthy | me.degraded=false, workspace.degraded=false, me.controlLive=true | control-live-banner; kill-banner absent |
| U11 | AC-2 | S6: deploy lock | me.controlLive=false, ks.writesDisabled=true | kill-banner via writesDisabled; control-live-banner absent |
| U12 | AC-2 | S7: global kill-switch on, writes enabled | me.controlLive=true, ks.global=true, me.degraded=false | kill-banner; control-live-banner absent |
| U13 | AC-2 | S8: site kill-switch on, that site open | me.controlLive=true, ks.sites[siteNo]=set, me.degraded=false | kill-banner; control-live-banner absent |
| U14 | AC-2 | S9: site kill-switch, different site | me.controlLive=true, ks.sites[other]=set, state.siteNo=this | control-live-banner; kill-banner absent |
| U15 | AC-2 | Comment pin | Grep app.js for "OOHDASH-122 AC-2" above `const kill` | Pass (guards the maintenance comment from silent deletion) |

Note: U6-U14 use the vm sandbox pattern from test/control-live-signal.test.js (which mocks the writesDisabled helper and stubs state). For U8/S3: state.workspace is set via vm.runInContext because workspace.degraded feeds into writesDisabled via the ks object.

Verifies no combination of the nine states (S1-S9) renders both banners simultaneously, which is the AC-2 truth table from design section 5.

#### WU5b — test/bridge-startup-probe.test.js (new)

Pattern: DATA_MODE=live env var set before import; mock.module('../services/tb-client.js') exporting a controllable readRequest; mock.module('../services/zendesk.js') exporting siteDirectory (needed for the module to load); cache-bust tb-device.js import between tests using a query-string trick so each test starts in boot state (lastReadOk=false, lastReadError=null). Timeouts capped at 20ms for timeout tests. No network, no wall-clock sleeps.

| ID | AC | Case | Expected |
|---|---|---|---|
| P1 | AC-3 | Success | outcome ok; readRequest called once with ('GET', '/api/tenant/devices?pageSize=1&page=0'); bridgeStatus() = { healthy: true, lastError: null } |
| P2 | AC-3 | Failure (401) | outcome failed; lastError starts "Start-up read probe failed:"; healthy false |
| P3 | AC-3 | Timeout | readRequest never settles; probeBridgeReadOnce({ timeoutMs: 20 }) resolves with outcome timeout; lastError matches /timed out after 20ms/ |
| P4 | AC-3 | 429 back-off | outcome rate-limited; state still { healthy: false, lastError: null }; exactly one call (no retry) |
| P5 | AC-3 | Real read wins over a late probe failure | Start probe with deferred readRequest; run getSitesByNumber() successfully; then reject probe; state stays healthy true |
| P6 | AC-3 | Real failure not overwritten by late probe success | Start probe; force getSitesByNumber() to fail; then resolve probe; lastError still the real error |
| P7 | AC-3 | Never throws | readRequest that throws synchronously; readRequest that rejects with a non-Error; both resolve to outcome failed |
| P8 | AC-3 | Fixture mode | DATA_MODE=fixture: outcome skipped; readRequest never called |
| P9 | AC-3 | No secret leakage | Probe rejection carries err.config with a password field; lastError contains only err.message |
| P10 | AC-3 | Wiring pin | Grep server.js for `bridge.probeBridgeReadOnce()` inside the app.listen callback, guarded by dataMode === 'live', not preceded by await | Pass |

#### WU5c — Existing unit tests (keep green)

The following must remain 100% green with no assertion changes:
- test/control-live-signal.test.js: the ON case (no kill reason) still renders control-live-banner; the deploy-lock ON case still renders kill-banner; the existing OFF-to-ON modal logic is unaffected.
- test/tb-device.test.js: bridgeStatus() latch tests are unchanged (no existing function edited).
- test/healthz-read-tristate.test.js: tb-client.js is untouched.
- All other 34 unit test files: no production file they depend on is changed.

Self-verify: `npm run test:unit` — 100% pass. New test count: all existing tests plus U1-U15 and P1-P10.

---

### WU6 — E2e tests (1.0 h)

Run command: `npx playwright test`

All e2e tests run against the real server in fixture mode (DATA_MODE=fixture, WRITES_DISABLED=false, port 3155). Fixture mode always starts bridge healthy (lastReadOk starts true in fixture mode). Degraded states are produced by Playwright page.route() intercepting the real response and patching only the degraded field, then route.fulfill() with the patched JSON. Everything else is the real server.

Test site: 6832 ("Old Grey Mare"), test identity: "Test Handler". Both already in the fixture set.

#### WU6a — tests/degraded-banner.spec.js (new)

| ID | AC | Journey | Steps | Pass condition |
|---|---|---|---|---|
| E1 | AC-1/AC-2 | Cold start: green only | Sign in as Test Handler; land on New Call page | control-live-banner visible; kill-banner count 0 |
| E2 | AC-2 | Account-level failure: red only | Patch /api/me response degraded: true; sign in | kill-banner contains "degraded mode"; control-live-banner count 0 |
| E3 | AC-2 | Workspace-level failure: red only | /api/me untouched; patch the confirm response workspace.degraded: true; confirmSite(page, '6832', 'Old Grey Mare') | kill-banner visible; control-live-banner count 0; site degraded-banner visible |
| E4 | AC-2 | Recovery | Start as E2; remove the route override; click nav-home (refreshes /api/me) | kill-banner count 0; control-live-banner visible |
| E6 | AC-2 | Control blocked when genuinely degraded | E3 state; tile-heating, area-bar-restaurant, attempt setpoint change | control-blocked modal shows the degraded reason; no dispatch request sent |
| E7 | AC-3 | Healthy after full flow | confirmSite 6832; GET /healthz | subsystems.bridge.healthy true; lastError null |

Note: E5 (global kill-switch) is placed in killswitch.spec.js (WU6b), not this file, to keep the kill-switch test suite coherent. Discovery e2e scope item 7 (start-up probe) cannot run in fixture mode by design; it is covered by P1-P10 and the live proof. Discovery item 8 (dispatch reachable only inside a workspace) is closed by design finding F6 and exercised by E6.

#### WU6b — tests/killswitch.spec.js: two added assertions (E5)

The existing global kill-switch test (`test('global kill-switch blocks writes at runtime...', ...)`) at line 6 already engages and clears the kill-switch. Insert two assertions inside this test:
- After line 21 (where kill-banner is asserted to contain "switched off globally"): assert `control-live-banner` count is 0 (LIVE banner absent while switch is engaged).
- After line 55 (where admin-killswitch is confirmed "Writes enabled"): assert `control-live-banner` is visible (LIVE banner restored after clearing).

These are the only changes to killswitch.spec.js. The per-site kill-switch test (line 62) is not modified but will also pass because the per-site banner case (S8) is covered by the guard.

Self-verify: `npx playwright test tests/degraded-banner.spec.js tests/killswitch.spec.js` — all pass.

---

### WU7 — Full suite verification and cold-start check (0.25 h)

Run `npm run test:unit` — all unit tests must pass (zero failures, zero warnings treated as errors).
Run `npx playwright test` — all e2e tests must pass including the updated killswitch.spec.js.

Cold-start check (fixture mode, manual): start the server in fixture mode, open the New Call page before any site search. Confirm: control-live-banner visible; kill-banner absent. This matches E1 but is done against the real running server, not the Playwright fixture setup.

---

## 4. Probe specification (summary for build reference)

| Property | Specification |
|---|---|
| Endpoint | GET /api/tenant/devices?pageSize=1&page=0 on prod ThingsBoard (portal.lhlive.co.uk) via the same lazy readRequest wrapper used by site inventory reads |
| Read-only | Yes; GET on a listing endpoint using the read credential; write session never touched |
| When | Once, inside the app.listen callback, after port is bound; not awaited; live mode only |
| Timeout | 8s via Promise.race; the underlying axios timeouts are left at their defaults and any late result is discarded |
| Success | If latch untouched: lastReadOk = true, lastReadError = null |
| Failure (any non-429 error) | If untouched: lastReadError = "Start-up read probe failed: <axios message>" |
| Timeout outcome | If untouched: lastReadError = "Start-up read probe timed out after 8000ms" |
| HTTP 429 | Back off fully: state left untouched; no retry; one log line |
| Race with a real read | Probe writes only if lastReadOk === false && lastReadError === null at the moment it completes |
| Crash safety | Entire function body wrapped in try/catch/finally; caller attaches .catch; timer is unref'd and cleared |
| Secrets | lastError carries only axios err.message; never request config, headers or response body |
| Log output | One server log line: "[TB] start-up read probe: ok in 412ms" (or timeout / failed / rate-limited / skipped) |

---

## 5. AC mapping

| AC | How v1.3.8 meets it | Proof |
|---|---|---|
| AC-1: no false red banner on clean restart | bridgeDegraded() ignores the untouched boot state (lastError null); probe moves latch to a real outcome within seconds | U1, U5, E1, P1; live proof L2-L3 |
| AC-2: red and green never show together | Guard `controlLive && !kill`; kill covers all five red-banner triggers; exact complements by construction | U6-U14 (S1-S9), E1-E4, E5 in killswitch.spec.js |
| AC-3: /healthz bridge reflects a real probe after start-up | Probe sets bridge healthy true (or a real lastError) within ~1-3s of listen; no tri-state added; /healthz shape unchanged | P1-P4; U5 documents the residual boot window; live proof L1 |

---

## 6. Existing suites — stay-green summary

| Suite | Risk | Mitigation |
|---|---|---|
| test/control-live-signal.test.js | guard change means ON case must still render | ON case has no kill reason (me.degraded=false, no kill-switch); kill=null; guard !null is true; banner renders — unchanged assertion passes |
| test/tb-device.test.js | bridgeStatus() latch tests | No existing line in tb-device.js edited; only additive block after line 1063 |
| test/healthz-read-tristate.test.js | tb-client.js untouched | No risk |
| tests/killswitch.spec.js | Two new assertions added (E5) | New assertions test the now-fixed S7 state; they were failing before this fix and will pass after |
| All other spec files | No production file they exercise is changed | No risk |

---

## 7. Follow-up items (not OOHDASH-123; new ticket to be raised)

- F11: refrigeration boot latch (refrigWritesLocked) blocks writes server-side but is not reflected in /api/me; green shows while writes are locked.
- F12: the 30s workspace refresh swallows read errors and does not refresh /api/me, so a mid-call TB outage does not raise the red banner until navigation.
- DECISION 3: thingsboardRead 60s TTL cycling on /healthz (showing degraded between cycles); out of scope here.
- CIR runbook: OOH_DASHBOARD_DEPLOY.md cold-start gotcha note to be replaced post-release: "A red banner after restart now means the start-up probe genuinely failed; check the [TB] start-up read probe log line."

---

## 8. Live-proof plan (after v1.3.8 pod restart)

No automation against live. James does the click-through.

| Step | Who | Action | Pass condition |
|---|---|---|---|
| L1 | Orchestrator | Within 60s of new pod ready: GET /healthz | version 1.3.8; subsystems.bridge = { mode: 'live', healthy: true, lastError: null }. thingsboardRead may show degraded on the 60s cycle — that is DECISION 3 territory and is not a fail |
| L2 | Orchestrator | Pod log for the new pod | Exactly one "[TB] start-up read probe: ok in <n>ms" line; no retry lines |
| L3 | James | Open New Call page before any site search or lookup | Green control-live-banner only; no red kill-banner |
| L4 | James | Search and confirm any live site (e.g. 6832) and open the workspace | Green only; no site-level degraded warning |
| L5 | James (optional) | Engage then clear the global kill-switch from Admin during a quiet window | Red only while engaged; green only after clearing. Skip if any live call activity |

If L1 shows healthy false with a non-null lastError, the probe genuinely failed: check L2's error text before treating it as a defect.

---

## 9. Rollback

Redeploy image v1.3.7 via `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=<v1.3.7-digest> --record` and verify resources are preserved (use `kubectl get deployment ooh-dashboard -o json | jq .spec.template.spec.containers[0].resources` before and after). The probe has no persistent effect — it only touches in-memory state, so rollback restores exact v1.3.7 behaviour, including the known cold-start double-banner.

---

## 10. Effort estimate

| Work unit | Estimate |
|---|---|
| WU1 routes/api.js | 0.25 h |
| WU2 services/tb-device.js | 0.50 h |
| WU3 public/js/app.js | 0.25 h |
| WU4 server.js | 0.10 h |
| WU5 Unit tests (U1-U15, P1-P10) | 1.50 h |
| WU6 E2e tests (E1-E7 + killswitch additions) | 1.00 h |
| WU7 Full suite + cold-start check | 0.25 h |
| **Total** | **3.85 h** |

Build branch: `build/oohdash-122-degraded-banner` (from main, cut at build start).

Release target: v1.3.8 via `scripts/release.sh` (bumps package.json and RELEASE_NOTES.md; does not push).

---

## 11. Plan-vs-design deviations

None. The build plan implements sections 3.1-3.4 of the design verbatim. The guard form is the recommended (James's DECISION 1 selection). The comment wording, probe spec, test IDs and test patterns are taken directly from design sections 3.2, 3.3, 4, 7.1, 7.2 and 7.4.
