<!-- gate:contract
SECTION: What this build plan delivers
This is the Build-PLAN artefact for OOHDASH-123, the Rosetta Stone. It turns the merged, gate-approved design (OOH_ROSETTA_STONE_DESIGN_2026-10-14.md, PR #91) and James's binding gate selections (PR #91 gate:selected) into a sequenced, file-by-file implementation plan with real, re-verified code anchors. It is a plan only - no product code is written at this stage. The headline re-plumb is to stop writing the Desired key directly and instead write the Requested key to SERVER_SCOPE so Spencer's new IoT Command Gate actually dispatches; everything else (three-outcome confirmation, per-class read/control/feedback map, the bare switch key, humane errors, save-and-resume, boost removal, offline and dark-fleet honesty, next-scheduled-change) follows from that. Eighteen work units are laid out in dependency order, each self-verifiable, each committed on its own. Effort estimate is 38.5 hours. The plan carries no new open DECISIONs - James's selections are made - but it enumerates three material divergences from the design's as-written assumptions that the design could not have known, so the Test gate can verify each one.

SECTION: The headline change Build makes first
To send any command, the dashboard will write a Requested key (switchRequested, setpointRequested, modeRequested) to SERVER_SCOPE and let the gate validate, write pending, rewrite Desired and ring the bridge. Today services/control.js:122 calls tb.writeSharedAttribute which writes *Desired to SHARED_SCOPE and bypasses the gate entirely. Build adds a new writeServerScopeAttribute primitive in tb-client.js, changes the five attribute names in registry.js validateCommand from *Desired to *Requested, and re-points the dispatch. This is WU2 and every later unit depends on it.

SECTION: The three honest outcomes
Every command ends in exactly one of three outcomes, and only the first may ever render as success. CONFIRMED requires all three of: the status attribute reads accepted, the device's own confirming telemetry equals the requested value (normalised), and that telemetry's ThingsBoard server-assigned timestamp is after the dispatch timestamp. NOT DELIVERED is a gate or vendor rejection, shown as a plain sentence with the raw text kept on the ticket. NOT CONFIRMED is accepted-but-unproven at the per-vendor confirm limit - never called failed, never called done; the watcher keeps watching and updates the ticket. Accepted on its own is always in-flight, never success - this is the OOHDASH-102 false-success bug we must not reintroduce. The confirm.js settle logic is rewritten end to end (WU4) and the old synced-plus-Reported model is retired.

SECTION: No resend - James's binding override
DD-RESEND-UX was CHANGED BY JAMES to "neither, dont resend". This plan builds NO resend: a stuck or not-confirmed command is never re-fired, offers no resend button and no auto-resend. The watcher simply keeps watching to the late-watch horizon, updates the ticket note, and reports "not confirmed". This SUPERSEDES the design's section 6 and section 11 "bias to re-fire" steer, the addendum section 6b resend copy, and the existing client ctlRetry resend affordance (public/js/control.js:310-317). Those are explicitly overridden here. The design's Salus dedup-fallback (the 5-second pending-advance check) loses its resend purpose and is repurposed as a one-shot sanity check on the single initial dispatch write, so a swallowed Salus write is still surfaced rather than silent.

SECTION: Next scheduled change - decoded now, James's binding override
DD-SCHED-DISPLAY was selected by James as: show the decoded next scheduled change for boiler (V1 and V2) and PowerPause NOW, labelled "based on the device's stored schedule", with a safe fallback when the parse is unsafe. This SUPERSEDES the design's section 10 recommendation of indicator-only until SQ-13 is confirmed. Build ships the decoder wired to decoded display by default (WU13), with day-order and timezone as single invertible config constants (defaults Monday-first, Europe/London), and falls back to "following its programme / overridden" only when the schedule is absent or the parse is unsafe. SQ-13 field semantics stay a go-live precondition to confirm the day-order and timezone assumptions.

SECTION: Config surface
Every tunable value is named with a default and a home. Per-class values (copyMinutes, confirmLimitMs, lateWatchMs, confirmPollMs, offlineHours, requestedKey, statusKey, errorKey, confirmKeys, valueType, compareRule) live on a new per-class contract object in services/registry.js, the natural home alongside slowEcho. Global defaults and env overrides live in the root config.js alongside the existing syncTimeoutMs block (lines 121-127), which is replaced by per-class lookups. Defaults: Tuya confirm limit 10s, late watch 2m, poll 3s, offline 3h; IT700 copy 5m, confirm limit 45m, late watch 90m, poll 60s, offline 3h; IT500 and bare-salus copy 15m, confirm limit 35m, late watch 60m, poll 60s, offline 3h; boiler/monitor-only offline 48h.

SECTION: Save and resume
Minutes-long Salus results must survive a pod restart. A new Cosmos container OohActionInflight (added to services/store.js COLLECTIONS at line 135, partition /storePartition = "ooh") persists each in-flight action with its dispatch time, confirm key, confirm-limit and late-watch deadlines, and state. On server start a resume hook (server.js near line 144, beside startWorker) reads all in-flight records, does one confirm read each, settles the terminal ones, re-arms the watcher for the live ones, and marks past-late-watch ones INDETERMINATE. It does not depend on the OOHDASH-124 TTL work; records are retired by settle, with a safety sweep as backstop.

SECTION: Three divergences from the design the Test gate must verify
The design made three assumptions this plan corrects against the real codebase, all enumerated in section 12. One: the design's silent-running relies on a ThingsBoard WebSocket subscription "already open for the live dashboard" - there is no WebSocket in this codebase; confirmation today is a server-side poll (control.js:259) and a 2-second client poll. R1 therefore builds the design's own disclosed bounded-poll fallback (per-class interval), not a socket, and this is the honest cost position. Two: the design says remove the fictitious IT500-DHW-6234 boost fixture - that device is load-bearing (it is site 6234's boilerControl deviceId and is exercised by control.spec.js and tonight-callback.spec.js), so Build strips its boost/hot-water-controllable capability and keeps the entity, updating specs, rather than deleting it. Three: telemetry timestamps are currently discarded (tb-device.js:809 keeps only series[0].value); Build must retain series[0].ts for the staleness guard and verify the ts clock domain (server-receipt vs device-sent) as a build spike.

SECTION: Test strategy
The unit suite (npm run test:unit) and the e2e suite (npx playwright test) are both required checks on main and must stay green. Unit tests are retargeted from the old contract (control-plane.test.js, including inverting the anti-drift assertion at control-plane.test.js:323-330 and the header comment at line 12; tb-classify.test.js; late-sync-alert.test.js; confirm-loop-timing.test.js) and new unit tests are added for the write path, the three-outcome settle rule, the cross-clock and stale guards, the bare-switch map, per-class timers, error translation, boost capture-and-escalate, dark-fleet display, the schedule decoder, and save-and-resume. Fourteen Playwright journeys cover the operator-facing outcomes end to end, driven by a rebuilt fixture simulator in tb-client.js that models pending, accepted, rejected-with-error, echo-before-accepted, telemetry-match-pending-only, telemetry-confirm, never-confirms and swallowed-write. Full detail in section 10.

SECTION: Go-live preconditions carried forward
Four items block go-live, not the build. They are built around with configurable defaults and carried into the handoff. SQ-05: no Salus command has been seen reaching accepted-and-confirmed, so Salus control ships labelled unproven. D-SEC-ROTATE: two live credentials must be rotated with written confirmation by 2026-10-21. SQ-13: schedule field semantics (day order, timezone, authority) must be confirmed to trust the decoded next-change times James chose to display. The J8 live admission test (one James-approved live command on ag-brackley-poweroutlet-6) proves the new path end to end in production and is read-only until James explicitly approves it. The J8 runbook is section 9.

SECTION: Cost and silent running
This work spends no new money: no new subscription, no per-call API fee, no new LLM tokens. Commands are on-demand writes and reads over the existing ThingsBoard connection with existing credentials. Because there is no WebSocket in the codebase, confirmation is the design's disclosed bounded poll, tightened per class: Tuya polls every 3s for a 10s window (about 4 reads per command); Salus polls every 60s for its confirm window (about 45 reads over 45 minutes for IT700, far below the design's 900-read worst case) because the Salus telemetry heartbeat is 20-30 minutes and a 3s poll would be pure waste. At most a small number of actions are in flight at once; the watcher arms a timer, polls only during the window, and idles otherwise. The only standing background process is the existing 30-second override revert worker, unchanged in nature (its settle rule is updated in WU14).

SECTION: Coordination with OOHDASH-122
OOHDASH-122 (degraded banner) is in flight to v1.3.8 and touches services/tb-device.js (an additive probeBridgeReadOnce block after line 1063), routes/api.js (bridgeDegraded helper, lines 65 and 217) and server.js (probe wiring in the app.listen callback) and the healthz handler. OOHDASH-123 also edits services/tb-device.js (read path, lines ~347-920), routes/api.js (control routes ~229-345) and server.js (worker/resume hook near line 144). The file-level overlap is real but the line regions differ. Build rebases OOHDASH-123 onto main after v1.3.8 lands, re-checks the three shared files by hand, and must not revert the 122 probe, the bridgeDegraded helper or the LIVE-banner guard. Detail in section 11.

DECISION: None - all gate decisions were made by James at PR #91 (DD-J8-TEST, DD-SCHED-DISPLAY, DD-RESEND-UX, DD-WAIT-HANDOFF) and are implemented as plan facts in this document. No new build-time fork requires James. The three design divergences in section 12 are engineering reconciliations within the approved design intent and James's selections, not new choices for James.
-->

# OOHDASH-123 Rosetta Stone - Build Plan

**Ticket:** OOHDASH-123 (R1) - "Rosetta Stone": re-plumb device read/control/feedback onto Spencer's ThingsBoard IoT Command Gate contract
**Stage:** Build plan - **Date:** 2026-10-14 - **Branch:** docs/oohdash-123-build-plan (off origin/main @ 26698b6)
**Consumes:** OOH_ROSETTA_STONE_DESIGN_2026-10-14.md (PR #91, merged, committee-reworked at 5d6f6b2); OOH_ROSETTA_STONE_ADDENDUM_2026-10-14.md; OOH_ROSETTA_STONE_MATRIX_2026-10-14.md; OOH_ROSETTA_STONE_STATES_MOCKUP_2026-10-14.html
**James's binding selections:** PR #91 gate:selected - DD-J8-TEST, DD-SCHED-DISPLAY, DD-RESEND-UX (changed to no-resend), DD-WAIT-HANDOFF
**Standards:** idioms of the existing codebase - vanilla JS client, Node/ESM server, node:test unit tests, Playwright e2e; the two universal rules (no hardcoded secrets/endpoints/env values; explain-before-code and proper error handling) bind throughout.
**Hands off to:** Tester (e2e required on main), then Release.

---

## 1. Orientation findings (what is actually there)

All anchors below were re-verified against the on-branch code (26698b6) in this build-plan session; they correct several stale anchors carried in the design's section 11. The worktree is clean on branch docs/oohdash-123-build-plan.

**Write path (today, wrong).**
- services/control.js:58 `dispatch(...)` is the command entry. Line 122 `await tb.writeSharedAttribute(device, check.attribute, check.value)` writes *Desired to SHARED_SCOPE - this bypasses the gate.
- control.js:92-94 hard-code the attribute names (switchDesired/setpointDesired/modeDesired) for previousValue capture.
- control.js:97-119 is the pre-dispatch block: classifyPreDispatch at :101, already-satisfied no-write at :104-111, the duplicate-pending 409 throw at :112-119.
- control.js:236-240 `extendWait` hard-codes `+ 30000` at :240 (design said :241 - corrected).
- services/registry.js validateCommand (:101) returns the attribute names: setpoint :114, frost :118, switch :133, mode :141, hwboost :149 - all `*Desired`. The design omitted the mode case at :141. There is NO per-class contract object today; REGISTRY (:11-72) is a flat map; slowEcho is set on salus-it700 (:25) and bare salus (:39) and read at registry.js:169 and control.js:146/196.
- services/tb-client.js: writeSharedAttribute (:284) allow-lists via ATTRIBUTE_FAMILY (:15-20) and POSTs to `/attributes/SHARED_SCOPE` (:295); writesDisabled guard throws 423 at :293. There is NO writeServerScopeAttribute - Build adds one. Reads exist for SERVER_SCOPE (:122-132), CLIENT_SCOPE (:141-151), SHARED_SCOPE (:159-169).

**Confirm path (today, wrong).**
- services/tb-client.js readControlState (:304-322) GETs `/values/timeseries?keys=<sync>,<reported>` at :309 and returns `{sync,syncTs,reported,reportedTs}`; readDesiredState (:329-335) GETs `/values/attributes/SHARED_SCOPE`. A comment at :298-303 wrongly asserts the SyncStatus keys are telemetry.
- services/confirm.js exports exactly four functions: valuesEqual (:27), isSettled (:38-43, `sync==='synced' && valuesEqual(reported,value) && syncTs>dispatchTs`), isFreshTerminal (:50-54, `(sync==='failed'||sync==='rejected') && syncTs>dispatchTs`), classifyPreDispatch (:67-80, compares Desired then controlState).
- control.js:259 `setInterval(pollAll, config.control.syncPollIntervalMs)` is the server-side confirm POLL loop; isSettled at :283, isFreshTerminal at :323. The client polls `GET /api/control/actions/:id` every 2s (public/js/control.js:245-269). There is no WebSocket anywhere.

**Timers.** Root config.js: syncTimeoutMs 90000 (:121), lateSyncWatchMs 600000 (:122), midWaitPromptMs 30000 (:127), validation 0 < midWaitPromptMs <= syncTimeoutMs (:159-160). overrides.js: WORKER_INTERVAL_MS 30s (:26), REVERT_CONFIRM_TIMEOUT_MS 90s (:27), LEASE_MS 3m (:28); startWorker setInterval at :115-118; revert confirm loop :179-186 (hard sleep 3000 at :182, isSettled :184, isFreshTerminal :185); audit outcome :203.

**Read path.** services/tb-device.js: pickSwitch (:606-611, order switchReported/switchOn/switch_1 - does not read bare switch); hasSwitchSignal (:347-350, checks switchReported/switchOn/switch_1/switch); mapTelemetry (:574-596) maps heatingSetpoint via lowercase `setpoint` at :580 but maps neither bare `switch` nor camelCase `setPoint`; pickSwitch output lands at out.switch_1 (:591-592). deriveBoilerControl (:519-541): V2 reads DHW.use_boiler (:528-530), V1 reads output1OutputMask mask[3] (:531-538). Intesis forced non-controllable at :417-423 on deviceType==='intesis'. No schedule attribute is read anywhere; schedule:null is hard-coded at :717; the SHARED_SCOPE read block (:793-804) is gated on boilerControl and reads only output1OutputMask (:801). Telemetry ts is DISCARDED at :809 (keeps only series[0].value). deriveFreshnessOnline (:632), freshnessThresholdFor (:714).

**Client UI.** public/js/flows.js hotwater() (:571-610): boost "controllable" tag :583, boost chip :584, boost dispatch :591, capture path :592-599. Capture helper outcomeCaptured (:305-312); aircon capture (:558-568); kitchen capture (:640); boiler-panel capture (:484-499). public/js/control.js: drawControl step strip :172-174 ("No confirmation" at :174), midwait :181-184, confirmed :185, applied-late :191, failed/rejected :192, timeout :193; poll loop :245-269; ctlSend dispatch :200-243 (POST /api/control/dispatch :213-221); ctlRetry resend :310-317; ctlWaitMore :271-284; boost UI at :48-49,71,119,161,347.

**Routes/server.** routes/api.js: control import :13; POST /control/dispatch :229 (control.dispatch :231); GET /control/actions/:id :238; POST /control/actions/:id/wait :244; outcome ticket getAction :309, attachTicket :345; /me degraded :65, controlLive :73, control.midWaitPromptMs :77; workspace degraded :217; hasControllableDhw/hasHotWaterSignal :141-170. server.js: healthz :52-95; startWorker :144; startLivenessMonitor :145; start() :134-165; store warm-up :140-143; app.listen :152.

**Store.** services/store.js COLLECTIONS (:135) = ['OohOverrides','OohAuditLog','OohAppConfig','OohSmsLog']; container creation with partitionKey /storePartition and indexed paths (:170-179); collection() (:191). Build adds 'OohActionInflight'.

**Tests.** control-plane.test.js (23 tests, ~69 asserts): the anti-drift assertion at :323-330 (line 328 requires /values/timeseries, line 329 forbids /values/attributes) MUST be inverted; the slice depends on readDesiredState following readControlState; header comment at :12 also needs updating. tb-classify.test.js: setpointDesired :31, switchDesired :46. bare-salus-classify.test.js has NO setpointDesired (design's "8 setpointDesired assertions" claim is wrong - they are switchReported signal args). confirm-loop-timing.test.js is client timers; line 244 asserts the server stamps deadline/watchUntil off config. Playwright: playwright.config.js testDir ./tests, PORT 3155, DATA_MODE=fixture, SYNC_POLL_INTERVAL_MS=1000, SYNC_TIMEOUT_MS=6000, MID_WAIT_PROMPT_MS=3000; control.spec.js uses site 6234 "Ship Inn". The "49/49" figure is not asserted anywhere - treat as "all specs green". Fixture sim in tb-client.js (~183-265) supports modes none/fail/slow/already/duplicate/rejected/stale-synced; IT500-DHW-6234 fixture is at bridge-devices.json:355 and is referenced as site 6234's boilerControl.deviceId (:390) and by control.spec.js:187 and tonight-callback.spec.js:47,78.

---

## 2. Per-class contract (the single source of truth Build implements)

This becomes a contract object keyed by deviceType in services/registry.js (its natural home, alongside slowEcho). Every flow reads one object; no key is hard-coded in a flow. Values are the configurable defaults (section 3).

| deviceType | requestedKey | scope | statusKey | errorKey | confirmKeys (order) | valueType | compareRule | copyMinutes | confirmLimitMs | lateWatchMs | confirmPollMs | offlineHours | controllable |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tuya (owon) | switchRequested | SERVER_SCOPE | switchSyncStatus | switchLastError | switch_1 | bool | norm-lower-string | null (inline) | 10000 | 120000 | 3000 | 3 | yes |
| tuya switch-only / external lighting | switchRequested | SERVER_SCOPE | switchSyncStatus | switchLastError | switch_1, switch | bool | norm-lower-string | null (inline) | 10000 | 120000 | 3000 | 3 | yes |
| salus-it700 | setpointRequested | SERVER_SCOPE | setpointSyncStatus | setpointLastError | heatingSetpoint | number | numeric-0.25 | 5 | 2700000 | 5400000 | 60000 | 3 | yes (unproven, SQ-05) |
| salus-it500 | setpointRequested | SERVER_SCOPE | setpointSyncStatus | setpointLastError | setPoint | number | numeric-0.25 | 15 | 2100000 | 3600000 | 60000 | 3 | no (dark) |
| salus (bare) | setpointRequested | SERVER_SCOPE | setpointSyncStatus | setpointLastError | setPoint | number | numeric-0.25 | 15 | 2100000 | 3600000 | 60000 | 3 | no (dark) |
| intesis (both populations) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 48 | no (capture-and-refer) |
| boilerControl V1/V2 | n/a (monitor-only) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 48 | no (schedule display only) |
| hot water (ex-boost) | n/a (removed) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | 48 | no (capture-and-escalate) |

Notes: hot-water boost is removed (no hwBoostHoursRequested row - J5/D-BOOST). IT700 confirms on heatingSetpoint ONLY, never setPoint (event-driven, can be months stale). The bare `switch` fallback is used only when switch_1 is absent on that device (bounds the multi-gang risk).

---

## 3. Config surface (every tunable, its default, its home)

**Per-class values** live on the registry contract object (section 2). **Global defaults and env overrides** live in root config.js, replacing the single syncTimeoutMs block (lines 121-127) with a per-class `control` config built from env with the existing `parseInt(env(NAME, default))` idiom.

| Value | Default | Home | Env override | Replaces |
|---|---|---|---|---|
| Tuya confirm limit | 10000 ms | registry contract + config.js | OOH_CONFIRM_LIMIT_MS_TUYA | syncTimeoutMs 90000 (config.js:121) |
| Tuya late watch | 120000 ms | registry + config.js | OOH_LATE_WATCH_MS_TUYA | lateSyncWatchMs 600000 (config.js:122) |
| Tuya confirm poll | 3000 ms | registry + config.js | OOH_CONFIRM_POLL_MS_TUYA | syncPollIntervalMs (used control.js:259) |
| IT700 copy minutes | 5 | registry contract | OOH_COPY_MIN_IT700 | new |
| IT700 confirm limit | 2700000 ms (45m) | registry + config.js | OOH_CONFIRM_LIMIT_MS_IT700 | syncTimeoutMs |
| IT700 late watch | 5400000 ms (90m) | registry + config.js | OOH_LATE_WATCH_MS_IT700 | lateSyncWatchMs |
| IT700 confirm poll | 60000 ms | registry + config.js | OOH_CONFIRM_POLL_MS_SALUS | syncPollIntervalMs |
| IT500 / bare copy minutes | 15 | registry contract | OOH_COPY_MIN_IT500 | new |
| IT500 / bare confirm limit | 2100000 ms (35m) | registry + config.js | OOH_CONFIRM_LIMIT_MS_IT500 | syncTimeoutMs |
| IT500 / bare late watch | 3600000 ms (60m) | registry + config.js | OOH_LATE_WATCH_MS_IT500 | lateSyncWatchMs |
| Offline threshold (controllable) | 3 h | registry contract per class | OOH_OFFLINE_HOURS_<CLASS> | hard 48h rule |
| Offline threshold (monitor-only) | 48 h | registry contract | OOH_OFFLINE_HOURS_MONITOR | hard 48h rule |
| Salus dispatch sanity window | 5000 ms | config.js | OOH_DISPATCH_SANITY_MS | new (repurposed dedup fallback) |
| Schedule day-order | "mon-first" | config.js (single invertible constant) | OOH_SCHED_DAY_ORDER | new |
| Schedule timezone | "Europe/London" | config.js | OOH_SCHED_TZ | new |
| Schedule decoded display | on | config.js | OOH_SCHED_DECODED | new (James override) |

The config.js validation (:159-160) is replaced by a per-class invariant: for each class, 0 < copyMinutes*60000 <= confirmLimitMs <= lateWatchMs, and confirmPollMs > 0.

---

## 4. Build sequence (eighteen work units, dependency order)

Each unit is implemented to the house idioms, self-verified (builds clean, unit+e2e green for what it touches, no console/runtime errors), then committed on its own referencing OOHDASH-123. No unit is marked done until its self-verification actually passes.

**WU0 - Fixture simulator and contract scaffolding (foundation).** Rebuild the tb-client.js fixture sim (~183-265) to model the new SERVER_SCOPE Requested write and the new confirm read: status attribute (pending/accepted/rejected) plus LastError, plus the confirming telemetry key with a server-assigned ts. Add sim modes: pending, accepted-then-confirm, rejected+gateLastError, rejected+vendorLastError, echo-before-accepted (telemetry arrives before accepted), telemetry-match-pending-only (cross-clock guard), never-confirms, swallowed-write (no new pending after write). Keep the old modes working until the suites are retargeted (WU15). Deps: none. ~3.0 h.

**WU1 - Per-class contract object + config (section 2, 3).** Add the contract object to registry.js keyed by deviceType; add `capabilitiesContractFor(deviceType)`; build the per-class `control` config in config.js from env; replace the config.js:121-127 block and the :159-160 validation. Deps: none (parallel with WU0). ~2.0 h.

**WU2 - Write path re-plumb (the headline).** Add `writeServerScopeAttribute(device, attribute, value)` to tb-client.js (mirror writeSharedAttribute:284 but POST `/attributes/SERVER_SCOPE`, keep the writesDisabled 423 guard, allow-list against the new Requested keys). Change registry.js validateCommand return attributes (:114/:118/:133/:141/:149) from *Desired to *Requested. Re-point control.js:122 to writeServerScopeAttribute; update control.js:92-94 previousValue keys. Record dispatchTs as the server-assigned lastUpdateTs returned by the write. Deps: WU1. ~3.0 h.

**WU3 - Confirm read re-plumb.** Add `readCommandState(device, deviceType)` to tb-client.js returning `{status, statusTs, lastError, telemetryValue, telemetryTs}`: read statusKey+errorKey from SERVER_SCOPE attributes (keep lastUpdateTs as statusTs), read the confirming telemetry key from timeseries keeping series[0].ts as telemetryTs. Retain the telemetry ts that is discarded today at tb-device.js:809. Verify the ts clock domain (build spike: confirm ThingsBoard returns server-receipt ts, not a device clock; if device clock, use a separate attribute lastUpdateTs read). Deps: WU2. ~3.0 h (incl. spike).

**WU4 - Three-outcome settle model.** Rewrite confirm.js: replace isSettled/isFreshTerminal with `classifyOutcome({status, statusTs, lastError, telemetryValue, telemetryTs}, requestedValue, dispatchTs, contract)` returning CONFIRMED / NON-DELIVERY / INDETERMINATE / IN-FLIGHT. CONFIRMED requires status==='accepted' AND normalised telemetry match AND telemetryTs>dispatchTs (all three). Echo-before-accepted holds the match pending until accepted arrives. Stale guard: any status/telemetry at or before dispatchTs is ignored. Update control.js poll loop (:259-:323) to the new classifier and per-class confirmPollMs/confirmLimitMs/lateWatchMs. Deps: WU3, WU1. ~4.0 h.

**WU5 - Pre-dispatch check, no-resend.** Replace classifyPreDispatch (confirm.js:67-80) and the control.js:97-119 409 dead-end: judge "already satisfied" from the confirming telemetry reading (timestamped after any prior dispatch), not from Desired; otherwise dispatch. Remove the duplicate-pending 409 entirely. No resend path is created (DD-RESEND-UX). Add the one-shot dispatch sanity check: after a Salus write, if statusTs does not advance within OOH_DISPATCH_SANITY_MS (5s), surface the humane "may not have reached the device" warning and write raw detail to the ticket. Deps: WU4. ~2.5 h.

**WU6 - Client outcome surfaces + no-resend UX + timers.** Rewrite public/js/control.js drawControl (:160-198) to the three outcomes: in-flight ("Sent to the device... waiting for it to confirm"), CONFIRMED (green, shows the proven reading), NOT DELIVERED (red, plain sentence), NOT CONFIRMED (amber, "sent but not yet confirmed... keep watching", NO resend button). Remove ctlRetry resend affordance (:310-317) and the "No confirmation"/"Try again" wiring at :174/:192/:193. Drive copy from per-class config via /api/me (routes/api.js:77). Respect prefers-reduced-motion. Deps: WU4, WU5. ~3.5 h.

**WU7 - Read path: bare switch, setPoint, drop switchReported.** In tb-device.js mapTelemetry (:574-596) add bare `switch` mapping (used only when switch_1 absent) and camelCase `setPoint` mapping; in pickSwitch (:606-611) drop switchReported from the order; leave hasSwitchSignal (:347-350) checking switch but ensure the mapped output is correct. Drop switchReported from the refrig-guard probe. Deps: none (parallel after WU1). ~2.0 h.

**WU8 - Offline 3h + dark-fleet "device not reporting".** Use the per-class offlineHours contract in deriveFreshnessOnline/freshnessThresholdFor (tb-device.js:632/:714) instead of the hard 48h. Classify IT500 and bare-salus as dark; surface "device not reporting" with no control in flows.js (heating path :461-475 and the device selector :157-173). Deps: WU1, WU7. ~2.5 h.

**WU9 - Boost removal -> capture-and-escalate.** Remove the boost chip and "controllable" tag from flows.js hotwater() (:583-584, :591) and the boost dispatch branch; route to the existing capture pattern (outcomeCaptured :305-312, as kitchen/aircon do) with the boiler guidance. Remove the boost UI from control.js (:48-49,71,119,161,347) and the `boost: 'hwboost'` command map (:205). Deps: WU6. ~2.0 h.

**WU10 - Save-and-resume persistence.** Add 'OohActionInflight' to store.js COLLECTIONS (:135) and its index paths (:170-179, add /OohActionState and /OohActionConfirmLimitAt). Persist each in-flight action on dispatch (control.js) with the section-5 fields. Add a resume hook in server.js near :144 (after store warm-up :140-143, before app.listen :152): read in-flight records, one confirm read each, settle terminal, re-arm live, mark past-late-watch INDETERMINATE; plus a safety sweep. Do not depend on OOHDASH-124 TTL. Deps: WU4. ~4.0 h.

**WU11 - DD-WAIT-HANDOFF immediate release + background watcher.** For slow classes (slowEcho), release the handler immediately with "sent to the device, should take effect within about N minutes" (N = copyMinutes); the persisted watcher (WU10) updates the ticket note and shows a toast when the result lands. Deps: WU10, WU6. ~2.5 h.

**WU12 - Humane error translation.** Implement the design section 9 map (gate:/vendor: prefixes -> plain sentences; raw text to ticket only). Central translator consumed by control.js outcome handling and the ticket writer (routes/api.js:309/:345). Never show a gate:/vendor: string on screen. Deps: WU4, WU6. ~1.5 h.

**WU13 - Next-scheduled-change decoder, decoded display (James override).** Add a pure decoder (new services/schedule.js) that computes the next change from the SHARED_SCOPE schedule JSON plus day-order and timezone config constants (defaults mon-first, Europe/London). Read the schedule attributes for boiler V1 (output1..4Schedule), V2 (CHZ1.schedule/DHW.schedule) and PowerPause (schedules) by widening the tb-device.js:793 SHARED_SCOPE read gate and populating schedule at :717 (currently null). Display decoded "next change HH:MM <day>", labelled "based on the device's stored schedule"; fall back to "following its programme / overridden" when the schedule is absent or the parse is unsafe. Tuya/IT700 blobs stay indicator-only (no verified byte map); IT500/Intesis "schedule not visible from this system". Deps: WU7. ~4.0 h.

**WU14 - Revert worker settle rule.** Update overrides.js revert confirm loop (:179-186) to use the new classifier (status==='accepted' AND telemetry match AND ts>dispatchTs) and per-class confirm limit, eliminating the current false revert-failed alert; a Salus revert now takes minutes. Deps: WU4. ~2.0 h.

**WU15 - Unit tests retarget + new.** Section 10. Deps: WU0-WU14. ~4.0 h (overlaps as each unit lands).

**WU16 - Playwright e2e.** Section 10, fourteen journeys. Deps: WU0-WU14. ~3.5 h.

**WU17 - Full-suite verification + self-audit.** npm run test:unit and npx playwright test both fully green; self-audit the changed files for dead code, handlers wired to removed functions (the removed ctlRetry/boost paths especially), unhandled I/O failures, state flags not reset on error, and any secret in a committed file; smoke-test the app in fixture mode. Deps: all. ~1.5 h.

Parallelisable: WU0+WU1 first; WU7 can run alongside WU2-WU4; WU13 after WU7. Everything else is on the WU2->WU4 spine.

---

## 5. Persistence design (save-and-resume)

New Cosmos container **OohActionInflight**, partition /storePartition = "ooh", AAD/workload identity, added to store.js COLLECTIONS (:135). Fields (all Ooh-prefixed per DATA_DICTIONARY governance):

| Field | Meaning |
|---|---|
| OohActionId | unique action id (partition-safe) |
| OohActionDevice | device entity name (e.g. gk-6261-salusit700-1) |
| OohActionCapability | switch / setpoint / mode |
| OohActionRequestedValue | value written to the Requested key |
| OohActionDispatchAt | dispatchTs (ISO) from the write's server lastUpdateTs |
| OohActionConfirmKey | confirming telemetry key for this class |
| OohActionConfirmLimitAt | dispatchTs + confirmLimitMs |
| OohActionLateWatchUntil | dispatchTs + lateWatchMs |
| OohActionState | in-flight / confirmed / non-delivery / indeterminate |
| OohActionAuditId | link to OohAuditLog entry |
| OohActionTicketId | Zendesk ticket for the outcome note |
| _etag | optimistic concurrency |

Index /OohActionState and /OohActionConfirmLimitAt (store.js:170-179). Resume-on-load (server.js near :144): read all OohActionState='in-flight'; per record do one readCommandState; if terminal, settle (write outcome, update ticket, mark record); if live and before late-watch, re-arm the watcher at confirmPollMs; if past late-watch, mark INDETERMINATE and note the ticket. No personal data stored; LastError trimmed to a safe length before it reaches a ticket. OOHDASH-124 TTL context: records are retired by settle; a safety sweep marks any record past late-watch INDETERMINATE even if its watcher was lost. Build does not depend on OOHDASH-124.

---

## 6. No-resend (DD-RESEND-UX) - explicit supersession

James changed DD-RESEND-UX to "neither, dont resend". This plan builds NO resend affordance and NO auto-resend. Concretely:
- No resend button on the NOT CONFIRMED surface; the watcher keeps watching to late-watch and updates the ticket, then reports "not confirmed".
- The existing client resend path ctlRetry (public/js/control.js:310-317) is removed, along with the "Try again" wiring on the old failed/timeout cards (:192/:193).
- The design's "bias to re-fire and suppress only on a fresh reading" (design section 6, section 11, addendum 6b D-RESEND) is OVERRIDDEN. A single dispatch write happens; it is never re-fired by operator or system.
- The design's Salus dedup fallback (SQ-09, the 5-second pending-advance check) loses its resend rationale. It is repurposed (WU5) as a one-shot sanity check on the single initial dispatch write: if the Salus statusTs does not advance within 5s, surface the humane "may not have reached the device" warning and write raw detail to the ticket. This keeps the swallowed-write signal without introducing a resend.
- NOT DELIVERED (a clear rejection) returns the operator to a fresh compose if they choose to act again; that is a new operator-initiated command, not a resend of a stuck command, and carries no auto-fire.

The four historically stuck-Desired devices (6261, 6832, 1648 IT700; 6237 external lighting) are recovered by the fact that the next genuine operator command now writes Requested (re-firing the gate), not by any resend affordance.

---

## 7. Read / control / feedback behaviour per flow

Shared plumbing changes once (WU2-WU6), each flow then consumes it.

| Flow | Change | Anchors |
|---|---|---|
| Heating (IT700) | Requested write; confirm from heatingSetpoint only when accepted AND telemetry match AND ts>dispatchTs; immediate release with "about 5 minutes"; persisted watcher; Salus labelled unproven; dispatch sanity check | control.js:58-122, confirm.js, flows.js:461-475, WU11 |
| Heating (IT500/bare) | Dark - "device not reporting", no control | tb-device.js:632/714, flows.js:157-173, WU8 |
| Hot water | Boost removed; capture-and-escalate | flows.js:571-610 (:583/:584/:591), control.js boost UI, WU9 |
| External lighting | Bare switch now displays and confirms; Tuya 10s limit; no 409 dead-end | tb-device.js mapTelemetry:574-596, pickSwitch:606-611, WU7 |
| Extractor fan | As lighting | WU7 |
| Kitchen | No change (CTO monitor-only); note only | flows.js:640 |
| Aircon/fridge | No change; relabel both Intesis populations "air conditioning - refer via ticket"; drop switchReported from refrig-guard probe | tb-device.js:417-423, WU7 |
| Timed hold revert | New classifier + per-class limit; no false revert-failed alert | overrides.js:179-186, WU14 |
| Boiler/PowerPause | Decoded next-change display (James override) | schedule.js (new), tb-device.js:717/:793, WU13 |

---

## 8. Error translation (WU12)

Implements design section 9 verbatim: gate: device offline / gate: malformed value / gate: no freshness keys / gate: internal fault / vendor: No active Tuya session / vendor: (other) / (pending past limit, no error) each map to a plain operator sentence, with the raw text written only to the ticket. Rule enforced centrally: never render a gate:/vendor: string on screen.

---

## 9. J8 live admission test runbook (go-live precondition; READ-ONLY until James approves)

Per DD-J8-TEST. Not executed until James explicitly approves the specific command. Blocked until SEC-1 and SEC-2 rotations are confirmed in writing (D-SEC-ROTATE, due 2026-10-21).

- **Device:** ag-brackley-poweroutlet-6 (Spencer's proven 10 Oct Tuya device; lowest blast radius).
- **Command:** write switchRequested=false (OFF), observe, then switchRequested=true (ON) to restore. Nothing else touched.
- **Expected trace per command:** SERVER_SCOPE switchRequested write -> switchSyncStatus=pending (gate) -> gate rewrites switchDesired + doorbell -> switchSyncStatus=accepted, switchLastError="" -> switch_1 telemetry flips with ThingsBoard server-assigned ts > dispatchTs -> dashboard shows CONFIRMED within the 10s limit (accepted AND telemetry match both present).
- **Pass criteria:** both OFF and ON reach CONFIRMED; captured trace shows pending then accepted then telemetry match in the correct clock domain; no Desired write originates from the dashboard; device restored to ON.
- **Capture:** one full attribute/telemetry timeline (log/screenshot) attached to the go-live record, showing lastUpdateTs values, not device-side timestamps, to confirm the clock-domain assumption from WU3.

A Salus live proof is desirable but gated on SQ-05/SQ-06/SQ-07; go live on the proven Tuya path and add a Salus proof when Spencer confirms the Salus path works.

---

## 10. Test strategy (unit + Playwright, mapped to behaviour)

Both suites are required checks on main; all must be green. Run: `npm run test:unit` and `npx playwright test`.

**Unit (node:test) - retarget then add.**
- control-plane.test.js: INVERT the anti-drift assertion (:323-330) so readCommandState reads /values/attributes/SERVER_SCOPE for status and /values/timeseries for the confirming key, and update the header comment (:12). Retarget the ~28 Desired lines to Requested/SERVER_SCOPE.
- tb-classify.test.js: update setpointDesired (:31) and switchDesired (:46) expectations to *Requested where they assert the command attribute.
- late-sync-alert.test.js, confirm-loop-timing.test.js: retarget to per-class timers; confirm-loop-timing line 244 server-lifecycle assertion updated to the new config shape.
- New: writeServerScopeAttribute writes SERVER_SCOPE, never Desired; records dispatchTs. classifyOutcome: CONFIRMED only when accepted AND match AND ts>dispatchTs; echo-before-accepted holds; telemetry-match-pending-only is NOT confirmed; stale guard ignores at-or-before dispatchTs. Pre-dispatch: telemetry-satisfied=no-write success, differs=dispatch, no 409. mapTelemetry maps bare switch (switch_1 absent) and setPoint; pickSwitch no longer reads switchReported. IT700 confirms on heatingSetpoint only. Per-class limits from config. Error translation map. Boost types -> capture-and-escalate (no dead button). Dark-fleet -> "device not reporting". Schedule decoder: next-change from sample JSON, day-order invertible constant, decoded display on by default, safe fallback. Save-and-resume: terminal / live / past-late-watch settle correctly on resume. No-resend: NOT CONFIRMED surface has no resend control; Salus dispatch-sanity warning fires when statusTs does not advance in 5s.

**Playwright e2e - fourteen journeys** (fixture sim from WU0; test site per spec, keep site 6234 working):
1. Tuya OFF then ON: accepted then match -> CONFIRMED within limit.
2. Echo before accepted: telemetry first, holds, confirms on accepted; no flicker.
3. Telemetry match but still pending: NOT confirmed (guard active).
4. Rejected with LastError: NOT DELIVERED plain sentence; raw on ticket.
5. Accepted, no match by limit: NOT CONFIRMED.
6. Pending only by limit: NOT CONFIRMED.
7. Desired already equals request while device differs: operator not dead-ended; dispatch proceeds (no 409).
8. Device already at requested value: honest no-write success.
9. Salus setpoint: handler released at once ("about 5 minutes"); result toast later; late result after limit lands on ticket.
10. Salus swallowed write: statusTs does not advance in 5s -> humane warning; ticket note (no resend).
11. Pod restart mid-watch: result still lands (save-and-resume).
12. Timed hold revert under new rule: success raises no false revert-failed alert.
13. Hot-water flow: no "controllable" tag, no boost chip; capture-and-escalate present.
14. Bare-switch device (gk-6237): state displays and confirms on switch.

**Fixtures.** Rebuild the tb-client.js sim (WU0) to the new contract and modes. Real-shaped names: gk-6237-externallighting-1 (bare switch), ag-brackley-poweroutlet-6 (switch_1), gk-6261-extractfan-1; IT700 gk-6261-salusit700-1 (heatingSetpoint 16.5, stale Desired 19), gk-6832-salusit700-1; dark IT500 gk-5795-salusit500-r1, bare-salus gk-wingfieldfarm-salus-1; boiler V1 gk-6780-boilercontrol-1 (output2Schedule sample), V2 gk-6261-boilercontrol-1. IT500-DHW-6234: do NOT delete (it is site 6234's boilerControl deviceId at bridge-devices.json:390 and is used by control.spec.js:187 and tonight-callback.spec.js:47/78) - strip its boost/hot-water-controllable capability (remove hwBoostHours and the dhw-controllable flag) and update any spec assertion that exercised the boost chip.

---

## 11. OOHDASH-122 coordination

OOHDASH-122 (v1.3.8) touches three files OOHDASH-123 also edits. Build rebases OOHDASH-123 onto main after v1.3.8 lands and preserves all 122 changes:

| Shared file | 122 change (preserve) | 123 change (different region) |
|---|---|---|
| services/tb-device.js | probeBridgeReadOnce + STARTUP_PROBE_PATH appended after :1063 | read path edits ~:347-920 (mapTelemetry, pickSwitch, freshness, schedule read) |
| routes/api.js | bridgeDegraded() helper; /me (:65) and workspace (:217) degraded | control routes ~:229-345; /me control copy :77 |
| server.js | probe wiring inside app.listen callback | worker/resume hook near :144 (before app.listen) |

No logical conflict is expected (disjoint line regions) but Build hand-checks each of the three files after rebase and must not revert the 122 probe, bridgeDegraded helper or LIVE-banner guard. If v1.3.8 has not merged when 123 build starts, branch off main and rebase before the 123 build PR opens.

---

## 12. Divergences from the approved design (for the Test gate)

The operator approved the design and this plan; the as-built is not seen until Test. These are the places the plan diverges from the design's as-written assumptions, each a reconciliation within the approved intent and James's selections - none is a new decision for James. Test must verify each and carry it into the test-results "plan<->build divergence" section, citing this plan.

1. **No WebSocket - bounded poll instead.** Design sections 5, 13 and 16 describe a confirmation watcher driven by "the ThingsBoard WebSocket subscription already open for the live dashboard". There is no WebSocket in this codebase: confirmation is a server-side poll (control.js:259) and a 2s client poll (control.js:245-269). R1 implements the design's own disclosed bounded-poll fallback, tightened per class (Tuya 3s/10s window ~4 reads; Salus 60s during the confirm window ~45 reads for IT700), not a socket. Building a WebSocket subscription from scratch is a disproportionate new capability for R1 and is out of scope. Impact: silent-running is met via the poll (no idle cost; watcher arms a timer); cost is lower than the design's 900-read worst case.

2. **IT500-DHW-6234 fixture kept, not deleted.** Design section 14 says "Remove the fictitious IT500-DHW-6234 boost fixture". That device is load-bearing: it is site 6234's boilerControl.deviceId (bridge-devices.json:390) and is exercised by control.spec.js:187 and tonight-callback.spec.js:47/78. Build strips its boost/hot-water-controllable capability and keeps the entity, updating specs, so the dead boost path is removed without breaking site 6234. Impact: same outcome (no dead boost), no spec breakage.

3. **Telemetry ts retained + clock-domain spike.** Design section 3 requires Build to verify the telemetry ts clock domain; the plan adds that the current code discards the ts entirely (tb-device.js:809 keeps only series[0].value), so WU3 must first retain series[0].ts, then verify server-receipt vs device-sent, falling back to a separate attribute lastUpdateTs read if the ts is a device clock. Impact: the cross-clock guard (design section 5) depends on this and is built in WU3/WU4.

Minor inferences (noted, not divergences): per-class confirmPollMs added as a named config value; the dedup-fallback repurposed as a dispatch-sanity check under no-resend; the schedule decoder placed in a new services/schedule.js.

---

## 13. Effort estimate and sequencing

| WU | Description | Hours |
|---|---|---|
| WU0 | Fixture sim rebuild + scaffolding | 3.0 |
| WU1 | Per-class contract + config | 2.0 |
| WU2 | Write-path re-plumb | 3.0 |
| WU3 | Confirm read + ts retain + clock spike | 3.0 |
| WU4 | Three-outcome settle model | 4.0 |
| WU5 | Pre-dispatch check, no-resend | 2.5 |
| WU6 | Client outcome surfaces + timers | 3.5 |
| WU7 | Read path: bare switch, setPoint | 2.0 |
| WU8 | Offline 3h + dark-fleet display | 2.5 |
| WU9 | Boost removal -> capture-and-escalate | 2.0 |
| WU10 | Save-and-resume persistence | 4.0 |
| WU11 | Immediate release + background watcher | 2.5 |
| WU12 | Humane error translation | 1.5 |
| WU13 | Schedule decoder + decoded display | 4.0 |
| WU14 | Revert worker settle rule | 2.0 |
| WU15 | Unit tests retarget + new | 4.0 |
| WU16 | Playwright e2e | 3.5 |
| WU17 | Full-suite verification + self-audit | 1.5 |
| | **Total** | **38.5** |

Build branch: build/oohdash-123-rosetta-stone (off main, cut after v1.3.8 lands). Spine: WU0/WU1 -> WU2 -> WU3 -> WU4 -> (WU5, WU6, WU10, WU14) -> (WU9, WU11, WU12) -> WU13; WU7 parallel after WU1; WU8 after WU7; WU15/WU16 track each unit; WU17 last.

---

## 14. Go-live preconditions carried forward (NOT build blockers)

Built around with configurable defaults; carried into the Test/Release handoff:
- **SQ-05 (Salus proof):** no Salus command seen reaching accepted-and-confirmed; Salus control ships labelled unproven.
- **D-SEC-ROTATE:** two live credentials rotated with written confirmation by 2026-10-21; blocks J8.
- **SQ-13 (schedule semantics):** day order, timezone and authority must be confirmed to trust the decoded next-change times James chose to display; defaults (mon-first, Europe/London) are invertible single constants, so a correction is a config change, not a rebuild.
- **J8 live admission test:** section 9; read-only until James approves; blocked until D-SEC-ROTATE confirmed.

---

## 15. Cost and silent running

No new money: no new subscription, per-call fee or LLM tokens; commands are on-demand reads/writes over the existing ThingsBoard connection with existing credentials. Confirmation uses the bounded poll (divergence 1): Tuya ~4 reads per command (3s/10s window); IT700 ~45 reads over the 45-minute window (60s poll), far below the design's disclosed 900-read ceiling, because the Salus heartbeat is 20-30 minutes. The watcher arms a timer and polls only during the confirm window; it idles otherwise and spends nothing while idle. Save-and-resume wakes a watcher only for genuinely in-flight actions on restart. The only standing background process is the existing 30-second override revert worker, unchanged in nature (its settle rule is updated in WU14). No console window, notification or CLI line-item is added.

---

## 16. Handoff to Test

- Build to this plan and the design contract; the per-class contract (section 2) and three-outcome rule are load-bearing and must not be flattened.
- All eighteen work units committed incrementally; both suites green; app runnable in fixture mode for the reviewer.
- Build summary to record: features implemented, features passing self-test, SQ-05/D-SEC-ROTATE/SQ-13/J8 still open as go-live preconditions, the three enumerated divergences (section 12) as the authoritative plan<->build divergence source, and that the build was done to the existing-codebase idioms.
- J8 stays read-only until James approves it in person.
