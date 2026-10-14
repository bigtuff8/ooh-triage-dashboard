<!-- gate:contract
SECTION: What we are changing
OOHDASH-122, design stage. After every pod restart the New Call page shows a red "control actions are disabled" banner and a green "Device control is LIVE" banner at the same time. You chose the fix at the discovery gate: stop treating "not checked yet" as "broken", stop the green banner ever showing next to the red one, and add a one-off check at start-up so the dashboard knows within seconds whether ThingsBoard reads work. This design turns those decisions into an exact change list: four product files, each change small, plus new tests. No new screens, no new data, no change to how device control is actually allowed or blocked on the server. It ships as patch v1.3.8.

SECTION: How the banner fix works
Two small changes. First, the dashboard will only say reads are degraded when a real read has actually failed and left an error message behind. A freshly started pod that has not tried a read yet is no longer reported as broken. Second, the green LIVE banner gets a guard: it only shows when the red banner is not showing. While checking the code I found the red banner has more triggers than the two degraded flags discussed at discovery: it also fires when an admin switches control off globally or for one site. Today, with writes enabled, switching the global kill-switch on shows both banners together, which is the same contradiction. So I recommend the guard uses the exact value that draws the red banner, which closes every case at once and is the same one-line size. That is the first decision below.

SECTION: How the startup probe works
Once the server is up and listening, it makes one read-only request to ThingsBoard: list one device, not tied to any site, using the same read login the dashboard already uses for site lookups. It does not hold up start-up and it can never crash the pod. If it succeeds, the dashboard marks reads as healthy straight away. If it fails or takes longer than 8 seconds, it records the error, so the red banner shows for a genuine reason and clears on the next successful site lookup. If ThingsBoard says "too many requests", the probe backs off completely: no retry, no error recorded. It only ever updates the status if no real site lookup has happened in the meantime, so a real result always wins. Cost: one ThingsBoard login and one tiny read per pod restart, nothing while idle, no LLM tokens, no timer, nothing visible on screen.

SECTION: What we are NOT changing
The server-side rules that actually allow or block a device change stay exactly as they are: the deploy-time write lock (WRITES_DISABLED) and the kill-switch remain the only gates, and no read-health check is added to the control path. The banner wording, the per-site "live reads are unavailable" warning, the first-use "control is now LIVE" pop-up and the ThingsBoard read-login 60-second health cycle are all untouched unless you choose otherwise below. The control code is left alone so the parallel OOHDASH-123 work is not disturbed; the only shared file is services/tb-device.js, where we add one new self-contained function at the end and edit nothing that already exists.

SECTION: Tests
New unit tests prove three things. The degraded flag is false on a fresh pod, false after a good read and true after a failed one. The two banners never show together across every combination of the degraded flags, the kill-switches and the deploy lock. The start-up probe behaves correctly when it succeeds, fails, times out, is rate-limited or loses a race with a real site lookup, and never throws. New browser tests open the real app and check: the green banner alone after start-up; only the red banner when reads fail at the account level or the site level; recovery back to green; and, if you take my recommendation, only the red banner while the global kill-switch is on. After release, you do the final click-through on live; nothing automated is run against production.

SECTION: AC mapping
AC-1 (no false red banner on a clean restart) is met by the degraded-flag change and backed up by the probe. AC-2 (the two banners never show together) is met by the guard; fully so if you choose the recommended guard, and for the degraded cases only if you keep the discovery wording. AC-3 (the health page reflects a real check after start-up) is met in part: the probe means the health page shows bridge reads as healthy within a few seconds of start-up, but it does not add the separate "unknown" state the discovery described. How far to take AC-3 is the second decision below.

SECTION: Risks
Low overall. The change is small, has no data migration and rolls back by redeploying v1.3.7. The main risk is that a ThingsBoard blip at the exact moment of start-up shows a red banner until the first site lookup succeeds; that is correct behaviour (there really was a failed read), not a false alarm. The probe adds one ThingsBoard request per restart and is protected against retry storms. Two things already wrong today are recorded but left out of this ticket: the refrigeration safety latch can lock writes while the green banner still shows, and a ThingsBoard outage in the middle of a call is not shown as a red banner until the handler moves to another page. Both are suggested as a new ticket (to be raised).

DECISION: Which guard should hide the green LIVE banner? | Hide it whenever the red banner shows for any reason (recommended) | Hide it only when one of the two degraded flags is set, as worded at discovery
DETAIL: Recommend the first. The red banner is drawn from one value that covers the deploy lock, the global kill-switch, a per-site kill-switch and the two degraded flags. Guarding on that same value makes it impossible for the two banners to show together, now or after future changes, and it is the same one-line size. The discovery wording leaves the global and per-site kill-switch cases showing both banners, which happens today when an admin switches control off globally with writes enabled. Choosing the first is a strict widening of your discovery decision, not a reversal.

DECISION: How much of AC-3 should this ticket deliver? | Partly, through the start-up probe only, no new unknown state (recommended) | Also add a small unknown state for bridge reads to the health page | Defer AC-3 entirely to a new ticket (to be raised)
DETAIL: Recommend the first. With the probe in place the health page shows bridge reads as healthy within a few seconds of start-up, which removes the misleading reading that prompted the concern. A new unknown state would change the health page shape and every consumer of it, which is the larger Option C you did not pick. The remaining gap is a few seconds after each restart where the health page still shows not healthy with no error; the Kubernetes probes ignore this because the health page always answers 200.

DECISION: What should we do about the ThingsBoard read-login check that drops back to unknown every 60 seconds and makes the health page say degraded? | Leave it as it is and raise a new ticket (to be raised) (recommended) | Treat unknown as not degraded on the health page only | Re-run the read-login check on a timer before it expires
DETAIL: Recommend the first. This does not affect either banner, which is what handlers see. Treating unknown as fine would undo the OOHDASH-24 rule that an unproven login must never show green. A timer would add a ThingsBoard login roughly every minute forever, a background cost this design avoids. A new ticket can look at it properly, for example by having the health page tell a scheduled recheck apart from a real failure.
-->

# DESIGN - OOHDASH-122
## One banner at a time: degraded-mode false negative, LIVE banner guard and start-up read probe

**Ticket:** OOHDASH-122 | **Stage:** Design | **Date:** 2026-10-14 | **Target release:** v1.3.8 (patch)
**Input:** docs/project/OOHDASH-122_DEGRADED_BANNER_DISCOVERY_2026-10-14.md (discovery gate PR #87, merged at 7ac89b4)
**Mockup:** docs/project/OOHDASH-122_BANNER_STATES_MOCKUP_2026-10-14.html (self-contained; switch between system states and between the v1.3.7 and v1.3.8 behaviour)

---

## 1. Brief restated

A handler on a late shift opens the New Call page and, after any pod restart, sees a red "control actions are disabled" banner and a green "Device control is LIVE" banner together. The red one comes from a read-health latch that starts in the failed position on every live boot (services/tb-device.js:84); the green one comes from the static deploy-time write lock. They are never compared.

Binding decisions from James at the discovery gate:

1. Option B: degraded is driven by a real recorded read error (lastError), not by "not yet proven healthy". Plus a mutual-exclusion guard on the green LIVE banner. Keep it minimal.
2. Option A, a start-up bridge probe, is in this ticket.
3. No server-side read-health check on the write path. writesDisabled and the kill-switch stay the authoritative server gates.

CX target from discovery: one banner at a time. Cold start with no real error shows green only; a genuine failure shows red only; a handler never has to choose between two contradictory truths.

---

## 2. Audit findings that shape the design

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| F1 | The client function discovery called writeBlockReason() is actually named writesDisabled(siteNo) | public/js/app.js:47-55 | All references below use the real name |
| F2 | writesDisabled() has exactly two callers: the red kill-banner and the control modal | app.js:142 (kill = writesDisabled(state.siteNo)), public/js/control.js:52 (openControl) | Changing what feeds it affects only the banner and the client-side control block |
| F3 | writesDisabled() has FIVE red-banner triggers, not two: ks.writesDisabled (deploy lock), ks.global (global kill-switch), ks.sites[siteNo] (per-site kill-switch), state.me.degraded, state.workspace.degraded | app.js:49-52 | A guard on the two degraded flags alone leaves the global and per-site kill-switch cases co-firing with green. ks.writesDisabled is already exclusive with green because both derive from config.writesDisabled |
| F4 | Co-firing on the global kill-switch is real today | tests/killswitch.spec.js:6-22 engages the global switch in an e2e run with WRITES_DISABLED=false; the LIVE banner is not asserted absent and does render | Raised as DECISION 1; recommended guard closes it |
| F5 | workspace.degraded comes from the same latch: degraded: !bridge.bridgeStatus().healthy in workspacePayload() | routes/api.js:217, used by POST /sites/:siteNo/confirm (api.js:115-117) and GET /sites/:siteNo/workspace (api.js:120-126) | Both payloads are built straight after a getSitesByNumber() call that sets or clears the latch, so workspace.degraded is a snapshot of the same signal. It must change to the same derivation as /api/me or the two will disagree |
| F6 | Control is only reachable inside a confirmed workspace | openControl() callers are all in public/js/flows.js (367, 515, 535, 544, 591); flows render only inside renderWorkspace(); dispatch also needs a server-validated confirmToken | Closes the discovery's UNVERIFIED Option B caveat: with degraded false at cold start, no control is reachable before a workspace load has run a real read |
| F7 | /healthz already re-proves the TB read login lazily: tbStatus() fires activeReadProbe() whenever the 60s TTL has lapsed | services/tb-client.js:365-375; K8s readiness hits /healthz every 10s (k8s manifest) | The 60s "unknown" cycle is by design (OOHDASH-24). Raised as DECISION 3 |
| F8 | tb-client.js already exports a function named probeReadHealth() | services/tb-client.js:384-388 | The new bridge probe must have a different name: probeBridgeReadOnce() |
| F9 | bridge.js is export * from tb-device.js | services/bridge.js:12 | A new tb-device export is available as bridge.probeBridgeReadOnce() with no shim change |
| F10 | liveness.producerHealthy() reads bridgeStatus().healthy | services/liveness.js:99-101 | A successful probe makes the hourly liveness check see a healthy producer from boot. Intended and correct |
| F11 | The refrigeration boot latch (refrigWritesLocked) blocks writes server-side but is not reflected in /api/me, so green shows while writes are locked | services/killswitch.js:38-40 vs killSwitchState() | Pre-existing, out of scope; new ticket (to be raised) |
| F12 | The 30s workspace refresh swallows read errors and does not refresh /api/me, so a mid-call TB outage does not raise the red banner until navigation | public/js/views.js:146-153 | Pre-existing, out of scope; new ticket (to be raised) |

---

## 3. Change list (exact files and functions)

| File | Function / location | Change | Size | OOHDASH-123 overlap |
|---|---|---|---|---|
| routes/api.js | new exported helper bridgeDegraded(), placed just above the /me route | Single derivation: true only when a real read error is recorded | ~6 lines | None expected |
| routes/api.js | GET /me, line 65 | degraded: bridgeDegraded() | 1 line | None expected |
| routes/api.js | workspacePayload(), line 217 | degraded: bridgeDegraded() | 1 line | Low (workspace payload, not control) |
| public/js/app.js | render(), line 165 (LIVE banner) | Add guard plus maintenance comment | 1 line + 4 comment lines | None |
| services/tb-device.js | new export probeBridgeReadOnce(), inserted directly after bridgeStatus() (line 1063) | New self-contained function and one constant. Reads and writes the existing module variables lastReadOk / lastReadError. No existing function, variable or import is edited | ~40 lines, additive | Low: additive block only; OOHDASH-123 edits elsewhere in the file merge cleanly unless it also edits the bridgeStatus() block |
| server.js | start(), inside the app.listen callback | Fire-and-forget call to bridge.probeBridgeReadOnce() in live mode, one log line | ~6 lines | None |
| test/degraded-banner.test.js | new | Unit: derivation + guard truth table | new file | None |
| test/bridge-startup-probe.test.js | new | Unit: probe behaviour | new file | None |
| tests/degraded-banner.spec.js | new | Playwright e2e journeys | new file | None |
| tests/killswitch.spec.js | two added assertions (only if DECISION 1 = recommended) | LIVE banner absent while global kill-switch on; back after clear | +2 lines | None |

Not touched: services/control.js, services/killswitch.js, services/tb-client.js, config.js, public/js/control.js, public/js/views.js, k8s manifests, Cosmos. package.json version and RELEASE_NOTES.md are bumped by the release script at Release, not by Build.

### 3.1 routes/api.js - diff shape

    // OOHDASH-122: read-degraded means a REAL read failure has been recorded (lastError set),
    // not "not yet proven". A fresh pod with no read yet is not degraded. Used by /me AND the
    // workspace payload so the two degraded signals can never disagree in meaning.
    export function bridgeDegraded(status = bridge.bridgeStatus()) {
        return !!status.lastError;
    }

    // GET /me (line 65)
    -        degraded: !bridge.bridgeStatus().healthy,
    +        degraded: bridgeDegraded(),

    // workspacePayload() (line 217)
    -        degraded: !bridge.bridgeStatus().healthy,
    +        degraded: bridgeDegraded(),

Truth of the derivation: lastReadOk and lastReadError are only ever written together (success sets true/null, failure sets false/message), so the only state where healthy is false and lastError is null is the untouched boot state. bridgeDegraded() therefore differs from the old !healthy in exactly that one state, which is the false negative.

### 3.2 public/js/app.js - guard diff shape (recommended form, DECISION 1 option 1)

    -  ${state.me.controlLive ? `<div class="banner live" ...` : ''}
    +  ${state.me.controlLive && !kill ? `<div class="banner live" ...` : ''}

Required code comment, placed on the line directly above const kill = writesDisabled(state.siteNo) at app.js:142:

    // OOHDASH-122 AC-2 (one banner at a time): `kill` drives the red kill-banner AND suppresses the
    // green LIVE banner below. Every reason control is blocked MUST be returned from writesDisabled()
    // (app.js:47) - never rendered as a separate red banner - or the two banners can co-fire again.

Fallback form if James picks DECISION 1 option 2 (discovery wording):

    ${state.me.controlLive && !(state.me?.degraded || state.workspace?.degraded) ? ... : ''}

with the comment instead reading: "must mirror the degraded line in writesDisabled() at app.js:52; the kill-switch reasons are deliberately NOT mirrored (accepted co-fire, DECISION 1)". This form carries a named maintenance coupling; the recommended form removes it because it reuses the same value.

Behaviour notes:
- kill is site-aware, so with a per-site kill-switch the green banner is hidden only while that site's workspace is open, which is exactly when control is off for the handler.
- The first-use "Device control is now LIVE" modal (maybeControlLiveAck) keys off controlLive, not the banner, and is unchanged. It fires only on an OFF to ON flip of the deploy lock, which is unrelated to this ticket.
- No change to banner copy, colours, order or test ids (kill-banner, control-live-banner).

### 3.3 services/tb-device.js - probe diff shape (additive, after bridgeStatus())

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
            if (result?.response?.status === 429) return { outcome: 'rate-limited', ms };  // back off: no retry, no error
            if (untouched()) lastReadError = `Start-up read probe failed: ${result?.message || 'unknown error'}`;
            return { outcome: 'failed', ms, error: result?.message };
        } catch (err) {
            return { outcome: 'failed', error: err?.message };   // belt and braces: never throw
        } finally {
            clearTimeout(timer);
        }
    }

### 3.4 server.js - wiring diff shape (inside the app.listen callback, after the WRITE-LOCK lines)

    // OOHDASH-122: one-shot, non-blocking start-up read probe (live only). Never awaited before listen.
    if (config.dataMode === 'live') {
        bridge.probeBridgeReadOnce()
            .then(r => console.log(`[TB] start-up read probe: ${r.outcome}${r.ms !== undefined ? ` in ${r.ms}ms` : ''}${r.error ? ` (${r.error})` : ''}`))
            .catch(() => { /* probeBridgeReadOnce never rejects; guard anyway */ });
    }

---

## 4. Start-up probe specification

| Property | Specification |
|---|---|
| What it calls | GET /api/tenant/devices?pageSize=1&page=0 on prod ThingsBoard (portal.lhlive.co.uk) via tb-client readRequest(), the same read-scoped session and endpoint the per-site inventory read uses (tb-device.js:733). Site-independent: no textSearch, no named device or gateway, so decommissioning anything can never make it fail permanently |
| Read-only | Yes. A GET on a listing endpoint with the read credential. The write session is never touched |
| When | Once, inside the app.listen callback, after the port is bound. Not awaited. Live mode only; fixture mode returns skipped (fixture latch already starts healthy) |
| Requests made | At most one TB login (only if the read session has no token, which is always true at boot) plus one GET. No retry on any outcome |
| Timeout | Overall cap of 8 seconds via Promise.race. The underlying axios call keeps its own 10s login / 15s request timeouts and its late result is discarded |
| Success | If the latch is untouched: lastReadOk = true, lastError = null. Red banner absent; /healthz bridge.healthy true |
| Failure (401, 403, 5xx, network) | If untouched: lastError = "Start-up read probe failed: <axios message>". Genuine red banner until the next successful getSitesByNumber() clears it |
| Timeout | If untouched: lastError = "Start-up read probe timed out after 8000ms". Same as failure |
| HTTP 429 | Back off fully: state left untouched (no red banner, behaves as Option B cold start), no retry, one log line |
| Race with a real read | Probe writes only if lastReadOk === false and lastError === null at the moment it completes. Any real getSites/getSitesByNumber result in the meantime wins |
| Crash safety | Function body is wrapped in try/catch/finally and returns an outcome object; the caller also attaches .catch. The timer is unref'd and cleared. Start-up never waits on it |
| Secrets | lastError carries only the axios error message (for example "Request failed with status code 401"), never request config, headers or response body. /healthz is unauthenticated, so this matters |
| Side effects | The read session's probe record is refreshed, so /healthz thingsboardRead reads healthy for the first 60s. liveness.producerHealthy() sees a healthy bridge from boot (F10) |
| Logging | One server-log line per boot: "[TB] start-up read probe: ok in 412ms" (or timeout / failed / rate-limited) |

### 4.1 Cost and silent-running evaluation (mandatory)

| Criterion | Evaluation |
|---|---|
| LLM tokens | Nil. No model calls anywhere in this change |
| Recurring cost | One TB login plus one single-row read per pod restart. Restarts are rare (deploys, OOM, node moves), so a handful of requests a month. No subscription, storage or compute change |
| Scaling | Bounded: scales with restarts, not with users or sites. replicas: 1 |
| Background component | None that runs continuously. The probe is a one-shot at boot with no timer, no polling and no listener. It produces no console window, notification or UI element; its only output is one server-log line |
| Idle cost | Zero. Nothing runs after the probe completes |
| Compromise | None. DECISION 3 option 3 (timer refresh) would introduce a recurring TB login about once a minute; that is why it is not recommended |

---

## 5. State model and truth table (AC-2)

Red banner = kill is non-null. Green banner (recommended guard) = controlLive && !kill. They are exact complements whenever controlLive is true, and green never shows when controlLive is false.

| # | State | controlLive | ks.writesDisabled | ks.global | ks.sites[site] | me.degraded | workspace.degraded | v1.3.7 shows | v1.3.8 (recommended guard) | v1.3.8 (discovery guard) |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Cold start, no read yet | true | false | false | - | true (bug) | absent | RED + GREEN | GREEN only (me.degraded now false) | GREEN only |
| S2 | Real account-level read failure | true | false | false | - | true | false | RED + GREEN | RED only | RED only |
| S3 | Workspace-level failure only | true | false | false | - | false | true | RED + GREEN | RED only | RED only |
| S4 | Both degraded | true | false | false | - | true | true | RED + GREEN | RED only | RED only |
| S5 | Healthy | true | false | false | - | false | false | GREEN only | GREEN only | GREEN only |
| S6 | Deploy lock on | false | true | false | - | any | any | RED only | RED only | RED only |
| S7 | Global kill-switch on, writes enabled | true | false | true | - | false | false | RED + GREEN | RED only | RED + GREEN (residual) |
| S8 | Site kill-switch on, that site open | true | false | false | set | false | false | RED + GREEN | RED only | RED + GREEN (residual) |
| S9 | Site kill-switch on, different site or home page | true | false | false | not this site | false | false | GREEN only | GREEN only | GREEN only |

S1 to S5 are the five AC-2 states from discovery. S6 to S9 come from the audit (F3).

---

## 6. Data dictionary (fields touched; no new entities)

| Name | Where | Type | Meaning after v1.3.8 | Change | Sensitivity / retention |
|---|---|---|---|---|---|
| me.degraded | GET /api/me response | boolean | True only when a real TB read failure is recorded (bridgeStatus().lastError non-null) | Semantics narrowed (was !healthy) | Not sensitive; per-request, not stored |
| workspace.degraded | POST /api/sites/:siteNo/confirm and GET /api/sites/:siteNo/workspace responses | boolean | Same derivation as me.degraded, snapshot at payload build | Semantics narrowed (was !healthy) | Not sensitive; not stored |
| me.controlLive | GET /api/me | boolean | !config.writesDisabled | Unchanged | Not sensitive |
| subsystems.bridge.healthy | GET /healthz (unauthenticated) | boolean | Last read outcome, now also set by the start-up probe | New writer, same shape | Not sensitive |
| subsystems.bridge.lastError | GET /healthz (unauthenticated) | string or null | Last read error message, now possibly "Start-up read probe failed: ..." or "... timed out after 8000ms" | New values, same shape | Must never contain credentials or response bodies (axios message only); in-memory, cleared on next good read or restart |
| bridgeDegraded() | routes/api.js | function | Single derivation helper | New | n/a |
| probeBridgeReadOnce() | services/tb-device.js (via services/bridge.js) | async function returning outcome object | One-shot start-up probe | New. Distinct from tb-client probeReadHealth() | n/a |
| probe outcome | log line "[TB] start-up read probe: ..." | ok, timeout, failed, rate-limited, skipped | Boot diagnostics | New | Server log, standard pod log retention |

---

## 7. Test plan

All unit tests run under npm run test:unit (node --test with module mocks). All e2e tests run under the existing Playwright config (real server, fixture mode, WRITES_DISABLED=false, port 3155). Test data: fixture site 6832 "Old Grey Mare", dev identities "Test Handler" and "Test IoT Admin", already in the fixture set.

### 7.1 Unit - test/degraded-banner.test.js (new)

| ID | Case | Method | Expected |
|---|---|---|---|
| U1 | Derivation, boot state | bridgeDegraded({ healthy: false, lastError: null }) | false (AC-1) |
| U2 | Derivation, after good read | bridgeDegraded({ healthy: true, lastError: null }) | false |
| U3 | Derivation, after failed read | bridgeDegraded({ healthy: false, lastError: 'Request failed with status code 503' }) | true |
| U4 | Source pin | routes/api.js contains degraded: bridgeDegraded() at both /me and workspacePayload, and no remaining degraded: !bridge.bridgeStatus().healthy | Pass |
| U5 | Cold-start end to end (module level) | Fresh live-mode import of tb-device with tb-client mocked and NO probe run; bridgeDegraded(bridgeStatus()) | false; bridgeStatus() is still { healthy: false, lastError: null } (documents the residual /healthz window, DECISION 2) |
| U6-U14 | Guard truth table S1-S9 | Load public/js/app.js in the vm sandbox used by test/control-live-signal.test.js; set the /api/me stub per row; for S3/S8 set state.siteNo and state.workspace via vm.runInContext, then render() | For every row: never both kill-banner and control-live-banner in the rendered HTML; each row matches the v1.3.8 column of section 5 |
| U15 | Comment pin | app.js contains "OOHDASH-122 AC-2" above const kill | Pass (keeps the coupling note from being deleted silently) |

### 7.2 Unit - test/bridge-startup-probe.test.js (new)

Pattern: DATA_MODE=live, mock.module('../services/tb-client.js') exporting a controllable readRequest (and zendesk.js exporting siteDirectory), cache-busting import of tb-device per test so each starts in boot state. No network, no wall-clock sleeps beyond a 20ms timeout.

| ID | Case | Expected |
|---|---|---|
| P1 | Success | Outcome ok; readRequest called exactly once with ('GET', '/api/tenant/devices?pageSize=1&page=0'); bridgeStatus() = { healthy: true, lastError: null } |
| P2 | Failure (401) | Outcome failed; lastError starts "Start-up read probe failed:"; healthy false; one call |
| P3 | Timeout | readRequest never settles; probeBridgeReadOnce({ timeoutMs: 20 }) resolves with outcome timeout; lastError matches /timed out after 20ms/ |
| P4 | 429 back-off | Outcome rate-limited; state still { healthy: false, lastError: null }; exactly one call (no retry) |
| P5 | Real read wins over a late probe failure | Start probe with a deferred readRequest; run getSites() successfully; then reject the probe; state stays healthy true |
| P6 | Real failure not overwritten by a late probe success | Start probe; force getSitesByNumber() to fail; then resolve the probe; lastError still the real error |
| P7 | Never throws | A readRequest that throws synchronously, and one that rejects with a non-Error, both resolve to outcome failed |
| P8 | Fixture mode | DATA_MODE=fixture: outcome skipped, readRequest never called |
| P9 | No secret leakage | Probe rejection carries a fake err.config with a password field; lastError contains only err.message |
| P10 | Wiring pin | server.js calls bridge.probeBridgeReadOnce() inside the app.listen callback, guarded by dataMode === 'live', not awaited |

### 7.3 Existing tests to keep green

- test/control-live-signal.test.js: unchanged expectations; the ON case has no kill reason so the banner still renders.
- test/tb-device.test.js bridgeStatus() latch tests: unchanged (no existing function edited).
- test/healthz-read-tristate.test.js: unchanged (tb-client untouched).
- tests/killswitch.spec.js: still passes; add the two assertions in 7.4 E5 if DECISION 1 = recommended.
- Full suites: npm run test:unit and npx playwright test must both be green; both are required CI checks on main.

### 7.4 End-to-end - tests/degraded-banner.spec.js (new)

Fixture mode always starts healthy, so degraded states are produced by Playwright page.route() fetching the real response and patching only the degraded field (route.fetch then route.fulfill with the modified JSON). Everything else is the real server.

| ID | Journey (discovery e2e scope ref) | Steps | Expected |
|---|---|---|---|
| E1 | Cold start: green only (1) | Sign in as Test Handler; land on New Call | control-live-banner visible; kill-banner count 0 |
| E2 | Account-level failure: red only (2) | Patch /api/me degraded: true; sign in | kill-banner contains "degraded mode"; control-live-banner count 0 |
| E3 | Workspace-level failure: red only (3) | /api/me untouched; patch the confirm response's workspace.degraded: true; confirmSite(page, '6832', 'Old Grey Mare') | kill-banner visible; control-live-banner count 0; site degraded-banner visible |
| E4 | Recovery (4) | Start as E2; remove the route; click nav-home (go('home') refreshes /api/me) | kill-banner count 0; control-live-banner visible |
| E5 | Global kill-switch: red only (audit F4; only if DECISION 1 = recommended) | In killswitch.spec.js after the existing kill-banner assertion | control-live-banner count 0 while engaged; visible again after the switch is cleared |
| E6 | Control still blocked when genuinely degraded (6, journey level) | E3 state; tile-heating, area-bar-restaurant, attempt a setpoint change | control-blocked modal shows the degraded reason; no dispatch request sent |
| E7 | Healthy after a full flow (5) | confirmSite 6832; GET /healthz | subsystems.bridge.healthy true, lastError null |

The start-up probe (discovery scope item 7) cannot run in fixture mode by design; it is covered by P1-P10 and by the live proof below. Discovery item 8 (dispatch reachable only inside a workspace) is closed by code audit F6 and exercised by E6.

---

## 8. AC mapping

| AC | Requirement | How v1.3.8 meets it | Proof | Status |
|---|---|---|---|---|
| AC-1 | No false red banner on a clean restart | bridgeDegraded() ignores the untouched boot state; the probe moves the latch to a real outcome within seconds | U1, U5, E1, P1; live proof L2 | Met |
| AC-2 | Red and green never show together, all states | Guard controlLive && !kill (recommended) | U6-U14 (S1-S9), E1-E5 | Met for S1-S9 with recommended guard; S7/S8 residual with discovery guard |
| AC-3 | /healthz bridge reflects a real probe after start-up; unknown not counted as degraded | Probe sets bridge healthy true (or a real lastError) within about 1-3s of listen; no tri-state added | P1-P4, U5; live proof L1 | Partly met (DECISION 2): no false bridge reading after the probe completes; a few-second boot window remains; no unknown state |

## 9. CX realisation

| CX moment from discovery | Realised by | Where to see it in the mockup |
|---|---|---|
| Cold start / unproven: green only, no alarm | bridgeDegraded() + probe | State "Cold start (just restarted)", toggle v1.3.7 vs v1.3.8 |
| Real failure: one clear red signal, green suppressed | Guard on !kill | States "TB reads failing" and "Site reads failing" |
| Healthy: green only | Unchanged behaviour, now reached immediately at boot | State "Healthy after lookup" |
| Admin switched control off: red only (audit addition) | Guard on !kill | States "Global kill-switch" and "Site kill-switch" |
| One banner at a time | Complementary conditions by construction | Every state; the mockup shows a "banners showing" counter that never reads 2 in v1.3.8 mode |

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TB blip at the moment of boot shows a genuine red banner until the first good site lookup | Low | Low-Medium | Correct behaviour; next getSitesByNumber() clears it. Runbook note in CIR OOH_DASHBOARD_DEPLOY.md: replace the "cold-start artefact" gotcha with "a red banner after restart now means the start-up probe genuinely failed; check the [TB] start-up read probe log line" |
| Probe hits a rate limit | Low | Low | 429 backs off fully, leaves state untouched |
| Probe error text leaks via unauthenticated /healthz | Low | Medium | Only axios err.message stored; P9 test |
| A future change adds a separate red banner outside writesDisabled() | Low | High (AC-2 regresses) | Comment at the guard (3.2) and comment pin test U15 |
| Merge conflict with OOHDASH-123 in services/tb-device.js | Low | Low | Additive block after bridgeStatus(); no existing lines edited. Whichever lands second rebases a clean insert |
| Option B lets the client show control affordances at cold start | Very low | Medium | F6: control only reachable inside a confirmed workspace, which always performs a real read first; server gates unchanged |
| Pre-existing F11 (refrigeration latch not shown) and F12 (mid-call outage not shown) | Existing | Medium | Out of scope; new ticket (to be raised) |

## 11. Out of scope (explicit)

- Any server-side read-health check on the control write path (services/control.js, services/killswitch.js). writesDisabled and the kill-switch remain the authoritative server gates (binding decision 3).
- A tri-state bridge state on /healthz (Option C), unless DECISION 2 option 2 is chosen.
- The thingsboardRead 60-second TTL cycle on /healthz (DECISION 3).
- Banner copy changes, including the accepted "control actions are disabled" wording noted at discovery.
- F11 and F12 above. Any follow-up is a new ticket (to be raised). OOHDASH-123 is a different epic (TB command-gate remap) and must not be used for this.

## 12. Rollback

No data, schema, config or manifest changes. Roll back by setting the deployment image back to v1.3.7 (kubectl set image, preserving resources) or by reverting the merge commit and re-releasing. The probe has no persistent effect: it only touches in-memory state, so a rollback restores exact v1.3.7 behaviour, including the known cold-start double banner.

## 13. Live-proof plan (after the v1.3.8 release and pod restart)

No automation against live (B2C SSO is flaky; prod TB must not be load-tested). James does the click-through.

| Step | Who | Action | Pass condition |
|---|---|---|---|
| L1 | Orchestrator | Within 60s of the new pod reporting ready: GET https://<live host>/healthz | version 1.3.8; subsystems.bridge = { mode: 'live', healthy: true, lastError: null }. thingsboardRead may read healthy or unknown and status may read degraded on the 60s cycle; that is DECISION 3 territory and is not a fail |
| L2 | Orchestrator | Pod log for the new pod | Exactly one "[TB] start-up read probe: ok in <n>ms" line; no retry lines |
| L3 | James | Open the New Call page before any site search or lookup | Green "Device control is LIVE" banner only; no red banner |
| L4 | James | Search and confirm any live site (for example 6832) and open the workspace | Green only; no site-level degraded warning |
| L5 | James (optional, only if DECISION 1 = recommended and an IoT admin is happy to) | Engage then clear the global kill-switch from Admin during a quiet window | Red only while engaged; green only after clearing. Skip if there is any live call activity |

If L1 shows healthy false with a non-null lastError, the probe genuinely failed: check L2's error text before treating it as a defect.

## 14. Handoff notes for Build

- Implement sections 3.1 to 3.4 verbatim in shape; exact wording of comments as given in 3.2.
- Use the guard form chosen at DECISION 1; the fallback form and comment are in 3.2.
- Do not edit any existing function in services/tb-device.js.
- Load-bearing CX moments that must not be flattened: S1 (green only at cold start), S2/S3 (red only on genuine failure) and, if chosen, S7/S8.
- Open flags: DECISIONS 2 and 3; F11 and F12 for a new ticket (to be raised); CIR runbook note in section 10.
