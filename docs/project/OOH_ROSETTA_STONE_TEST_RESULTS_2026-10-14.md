<!-- gate:contract
SECTION: Overall verdict
PASS-WITH-NOTES. OOHDASH-123 "Rosetta Stone" was independently re-verified against the merged design and build plan in the build worktree at HEAD 4dd9639. Both required suites are green when run as designed: unit 365 pass / 0 fail / 1 environmental skip; Playwright e2e 137 pass / 0 fail as a single full-suite run (4.2 minutes, inside the known webserver-death horizon). Every one of James's binding selections (DD-RESEND-UX no-resend, DD-J8-TEST capability-not-executed, DD-SCHED-DISPLAY decoded display, DD-WAIT-HANDOFF immediate release) is present in the code and exercised by a real behaviour test. The three enumerated plan-vs-build divergences are sound and faithfully documented. No defects were found. This is a clear pass; the "notes" are three non-blocking observations the gate should carry, not conditions to fix before merge: one cosmetic fail-safe dead branch, the honest e2e infra-fragility handling, and the four go-live preconditions that are carried by design.

SECTION: Unit results
Ran `npm ci` (exit 0) then `npm run test:unit` (node:test, exit 0): 366 tests, 365 pass, 0 fail, 1 skipped. The single skip is U13 in a drift-guard test that only runs when IOT_REPO_PATH points at a sibling checkout; it is environmental (the sibling repo is not present in this worktree), not a product gap. The Rosetta-specific unit coverage was re-run and is green: rosetta-contract.test.js (three-outcome classifier, stale guard, echo-before-accepted, telemetry-match-pending-not-confirmed, per-class limits), schedule-decoder.test.js and powerpause-schedule.test.js (next-change decode, day-order/timezone, safe fallback), dark-fleet-heating.test.js ("device not reporting", no controls), plus the retargeted control-plane.test.js, tb-classify.test.js, confirm-loop-timing.test.js and late-sync-alert.test.js. I checked the new and retargeted test files for the source-check anti-pattern (asserting on function .toString()/source text); none were found - the tests assert return values and observed behaviour.

SECTION: e2e results
Playwright was run both in isolated per-spec batches and, decisively, as one full-suite invocation. Full suite: 137 passed / 0 failed in 4.2 minutes, completing well inside the ~10-minute webserver-fragility window, so no batching was actually required to get a clean whole-suite signal. Per-batch (each its own short-lived fixture server): control-rosetta 7/7; rosetta-dark-fleet-and-schedule 2/2; control 14/14; tonight-callback 10/10; boilercontrol 7/7; outside-lighting-p1 8/8; additional-notes 26/26; area-model 8/8; auth 7/7; killswitch 3/3; resolution 9/9. The only isolated-batch red was removal-health (3/5) on two tests - F022 metrics-from-audit-trail and the P1 text-log acknowledgement - which both assert on state "earlier specs generated" (captures and P1s accumulated in the shared store). Run in isolation the store is empty, so they correctly report zero; run in the full suite (their designed mode) both pass. This is a test-isolation artifact of my batching, not a product failure, and is proven so by the 137/137 full-suite run. The suite exercises the six verification protocols: data fidelity (asserts the actual confirmed reading, e.g. "OFF"), removal assertions (no raw gate:/vendor: string on screen, no Resend control, no boost chip), error-path (vendor rejection renders NOT DELIVERED), state progression and multi-step chains (send -> confirmed -> done -> outcome), and save-and-resume across a simulated pod restart.

SECTION: Binding-decision compliance
DD-RESEND-UX (no resend): MET - ctlRetry and the "keep waiting"/mid-wait prompt are gone from public/js/control.js; the NOT CONFIRMED surface offers only "Capture and escalate" with "please don't treat this as done"; the watcher keeps watching to the late-watch horizon and updates the ticket; e2e J5/J6 asserts zero Resend controls. DD-J8-TEST (built, not executed): MET - the J8 runbook is carried (build plan section 9), I did NOT execute any live command, and the write primitive writeServerScopeAttribute fails closed on WRITES_DISABLED with a 423 before any ThingsBoard POST; no prod writes occurred. DD-SCHED-DISPLAY / D-SCHED-RELEASE: MET - services/schedule.js decodes the next change and tb-device.js wires it for boiler V1 (output1..4Schedule), V2 (CHZ1.schedule/DHW.schedule) AND PowerPause (schedules), labelled "based on the device's stored schedule", decoded display on by default, with a null safe fallback to "following its programme" when absent or unsafe. DD-WAIT-HANDOFF: MET - a slow (Salus) class releases the handler at once with "within about N minutes - you can carry on with the caller", a detached client background watcher toasts the final outcome, and the server watcher writes the result to the ticket; e2e J9 confirms the immediate release. D-DARK-FLEETS: MET - the salus-it500 and bare salus contracts carry dark:true/controllable:false; the UI shows "device not reporting" with no controls (dark-fleet e2e + dark-fleet-heating.test.js). Write re-plumb: MET - validateCommand returns *Requested keys, writeServerScopeAttribute POSTs to SERVER_SCOPE allow-listed against registry.REQUESTED_KEYS, and the old writeSharedAttribute/Desired primitive is removed entirely (no Desired write residue anywhere in the control path). Three-outcome model: MET - classifyOutcome returns CONFIRMED only when status is a fresh accepted AND confirming telemetry matches AND its ts is after dispatchTs; accepted-alone is IN-FLIGHT, never success (the OOHDASH-102 bug is not reintroduced); the stale guard ignores any status/telemetry at or before dispatchTs. Config surface: MET - per-class copy/limits/poll/offline are env-overridable in config.js (Tuya 10s, IT700 5m/45m, IT500 15m/35m, offline 3h, monitor 48h).

SECTION: Plan-vs-build divergence verdicts
Divergence 1 (no WebSocket, bounded poll instead): ACCEPTABLE. There is no WebSocket in the codebase; the build implements the design's own disclosed per-class bounded poll (Tuya ~3s/10s, Salus ~60s during the window) on a single base watcher tick that idles when nothing is in flight. Silent-running is met and cost is below the design's worst case. Building a socket from scratch would be a disproportionate new capability for R1. Divergence 2 (IT500-DHW-6234 fixture kept, capability-stripped rather than deleted): ACCEPTABLE. That device is site 6234's boilerControl deviceId and is load-bearing for control.spec.js and tonight-callback.spec.js; stripping its boost/hot-water-controllable capability while keeping the entity removes the dead boost path without breaking site 6234, and both specs pass. Divergence 3 (telemetry ts retained plus clock-domain spike): ACCEPTABLE. readCommandState now retains series[0].ts (previously discarded) and the code documents that ThingsBoard returns a server-receipt ts on both the status attribute lastUpdateTs and the telemetry sample, so dispatchTs, statusTs and telemetryTs share one clock domain and the cross-clock guard is sound. The minor inferences (dispatch-sanity repurpose of the SQ-09 dedup fallback, new services/schedule.js module, named per-class confirmPollMs) are reasonable and in-intent.

SECTION: Defects found
None. No correctness, data-fidelity or regression defect was found in the re-verification. One cosmetic cleanliness observation (severity: trivial, non-blocking, NOT a defect): registry.validateCommand still has a legacy `hwboost` branch that returns the attribute name `hwBoostHoursDesired`. Because hot-water boost is removed from the client and `hwBoostHoursDesired` is deliberately NOT in registry.REQUESTED_KEYS, the write primitive would reject it ("not a permitted control request attribute") - so this is a dead, fail-safe branch that cannot leak a Desired write past the gate, not a live bypass. It can be tidied in a later pass; it does not affect this gate.

SECTION: Security - no secrets
A scan of the full diff (origin/main...HEAD, 38 files, +2415/-1408) for credential-shaped literals found none. The Twilio and token config entries in config.js are env() reads with no embedded default secret; the only committed default URL (iotDashBaseUrl UAT host) is a public, already-documented endpoint, not a secret. No private keys, API keys, bearer tokens or connection strings are present in the changed files.

SECTION: Go-live preconditions status
All four are carried as configurable/flagged items, NOT hard build blockers, exactly as the plan intends. SQ-05 (Salus path unproven): carried - the salus-it700 contract is flagged unproven:true and ships labelled accordingly. D-SEC-ROTATE (two live credentials rotated with written confirmation by 2026-10-21): carried - a process/ops item that blocks J8, not the build. SQ-13 (schedule field semantics - day order, timezone, authority): carried - dayOrder and tz are single invertible config constants (defaults mon-first, Europe/London), so a correction is a config change, not a rebuild. J8 live admission test: carried - the runbook exists and is read-only until James approves it in person and D-SEC-ROTATE is confirmed; it was NOT executed in this test stage.

SECTION: Recommendation to the gate
Recommend APPROVE for merge of build/oohdash-123-rosetta-stone and progression to Release. The build faithfully implements the approved design and James's four binding selections, both required suites are green in their designed run modes, the three divergences are sound and documented, and there are no defects and no secrets. Release must carry the four go-live preconditions (SQ-05, D-SEC-ROTATE, SQ-13, J8) forward; J8 stays read-only until James approves it. The single cosmetic hwboost dead-branch is a fail-safe tidy-up for a future pass and need not hold this gate.

DECISION: None. This artefact reports results and requires no fork from James. The four go-live preconditions are carried in the Go-live preconditions SECTION above and are not new choices.
-->

# OOHDASH-123 Rosetta Stone - Test Results

**Ticket:** OOHDASH-123 (R1) - "Rosetta Stone": re-plumb device read/control/feedback onto Spencer's ThingsBoard IoT Command Gate contract
**Stage:** Test results (Test-RESULTS HARD gate) - **Date:** 2026-10-14
**Branch:** build/oohdash-123-rosetta-stone - **Verified at:** HEAD 4dd9639 (8 commits off origin/main), clean worktree
**Consumes:** OOH_ROSETTA_STONE_BUILD_PLAN_2026-10-14.md; OOH_ROSETTA_STONE_DESIGN_2026-10-14.md; and the as-built in services/, public/js/, routes/, server.js, config.js and the unit + e2e suites.
**Overall verdict:** PASS-WITH-NOTES
**Reviewer stance:** independently re-run and observed; the build doer's self-assessment was not taken on trust.

---

## 1. How this was verified

The code was read directly and both suites were re-run from a clean install in the build worktree (no reliance on the build summary). `npm ci` was run fresh (exit 0). The unit suite was run once in full. The e2e suite was run both in isolated per-spec batches (to localise any failure) and as a single full-suite invocation (its designed shared-state mode). J8 was NOT executed - no live ThingsBoard command was issued and no prod write occurred.

---

## 2. Unit suite

Command: `npm run test:unit`. Result: 366 tests, 365 pass, 0 fail, 1 skipped, exit 0, ~3.2s.

- The 1 skip is an environmental drift-guard (U13) that only runs when IOT_REPO_PATH points at a sibling checkout; it is not a product gap.
- Rosetta-specific coverage is green: rosetta-contract.test.js (three-outcome classifier, stale guard, echo-before-accepted, match-pending-not-confirmed), schedule-decoder.test.js, powerpause-schedule.test.js, dark-fleet-heating.test.js, plus retargeted control-plane / tb-classify / confirm-loop-timing / late-sync-alert.
- The new and retargeted test files were checked for the source-check anti-pattern (asserting on source text via .toString()); none were found - they assert behaviour and return values.

---

## 3. e2e suite (Playwright)

Full-suite single invocation: **137 passed / 0 failed in 4.2 minutes** (completed inside the known ~10-minute webserver-fragility horizon).

Per-spec isolated batches (each its own short-lived fixture server):

| Spec | Result |
|---|---|
| control-rosetta.spec.js | 7/7 |
| rosetta-dark-fleet-and-schedule.spec.js | 2/2 |
| control.spec.js | 14/14 |
| tonight-callback.spec.js | 10/10 |
| boilercontrol.spec.js | 7/7 |
| outside-lighting-p1.spec.js | 8/8 |
| additional-notes.spec.js | 26/26 |
| area-model.spec.js | 8/8 |
| auth.spec.js | 7/7 |
| killswitch.spec.js | 3/3 |
| resolution.spec.js | 9/9 |
| removal-health.spec.js | 3/5 in isolation; 5/5 in full suite |

**Infra-fragility, noted honestly:** the two isolated removal-health reds (F022 metrics-from-audit-trail; P1 text-log acknowledgement) assert on state that "earlier specs generated" - captures and P1 escalations accumulated in the shared fixture store. Run alone the store is empty so they correctly read zero; run in the full suite (their designed mode) both pass. The 137/137 full-suite run proves these are a test-isolation artifact of batching, not a product failure. No REAL (product) e2e failure was observed.

---

## 4. Binding-decision compliance (one line each)

- **DD-RESEND-UX (no resend):** MET - ctlRetry/mid-wait prompt removed; NOT CONFIRMED surface has no Resend, only capture-and-escalate; watcher keeps watching + updates ticket; e2e asserts zero Resend controls.
- **DD-J8-TEST (built, not executed):** MET - runbook carried; not executed; writeServerScopeAttribute fails closed on WRITES_DISABLED (423) before any POST; no prod writes.
- **DD-SCHED-DISPLAY / D-SCHED-RELEASE:** MET - decoder wired for boiler V1, V2 AND PowerPause; labelled "based on the device's stored schedule"; decoded on by default; safe null fallback.
- **DD-WAIT-HANDOFF:** MET - immediate release with "about N minutes" + "carry on with the caller"; background watcher toast; ticket note; e2e J9 confirms.
- **D-DARK-FLEETS:** MET - IT500 and bare salus are dark/non-controllable; "device not reporting", no controls.
- **Write re-plumb:** MET - *Requested to SERVER_SCOPE, allow-listed; old Desired/writeSharedAttribute primitive removed; no Desired residue.
- **Three-outcome model:** MET - CONFIRMED only on fresh accepted AND telemetry match AND fresh ts; accepted-alone is in-flight; stale guard active.
- **Config surface:** MET - per-class copy/limits/poll/offline env-overridable (Tuya 10s, IT700 5/45m, IT500 15/35m, offline 3h).

---

## 5. Plan-vs-build divergences (section 12 of the build plan)

1. **No WebSocket, bounded poll instead** - ACCEPTABLE. Design's own disclosed per-class poll; idles when nothing in flight; cost below the design worst case.
2. **IT500-DHW-6234 kept and capability-stripped, not deleted** - ACCEPTABLE. Load-bearing fixture for two specs; boost path removed without breaking site 6234; specs pass.
3. **Telemetry ts retained + clock-domain documented** - ACCEPTABLE. series[0].ts retained; server-receipt clock domain documented; cross-clock guard sound.

Minor inferences (dispatch-sanity repurpose, new schedule.js, named confirmPollMs) are reasonable and in-intent.

---

## 6. Defects

None. One trivial, non-blocking cleanliness note: registry.validateCommand retains a dead `hwboost` branch returning `hwBoostHoursDesired`, which the write primitive rejects (not in REQUESTED_KEYS) - a fail-safe dead branch, not a Desired-write leak. Tidy in a later pass.

---

## 7. Security

Full-diff scan (38 files, +2415/-1408) found no credential-shaped literals. Twilio/token config are env() reads with no embedded secret; the only default URL is a public UAT host. No secrets in the diff.

---

## 8. Go-live preconditions (carried, not build blockers)

- **SQ-05 (Salus unproven):** carried - contract flagged unproven, ships labelled.
- **D-SEC-ROTATE:** carried - ops rotation by 2026-10-21; blocks J8, not the build.
- **SQ-13 (schedule semantics):** carried - day-order/timezone are invertible config constants.
- **J8 live admission test:** carried - read-only until James approves; not executed here.

---

## 9. Recommendation

APPROVE for merge and progression to Release. Both suites green in their designed modes; all binding decisions met; divergences sound; no defects; no secrets. Release carries the four go-live preconditions forward; J8 stays read-only until James approves it in person.

---

## 10. Rebase provenance (orchestrator)

After the Stage-1 sign-off the branch was rebased onto origin/main to pick up OOHDASH-127 (CI e2e-green fix: CSS/views/test tweaks, merged PR #94 at f6718e9; still v1.3.7, no OOHDASH-122 code yet). The rebase was clean (no conflicts; OOHDASH-127 is orthogonal to this change). Both suites were re-run on the integrated base: unit 365 pass / 0 fail / 1 skip (366 total); e2e 138 passed / 2 skipped / 0 failed (4.3m, within the webserver-death horizon). The e2e count rose by one versus the Stage-1 run because OOHDASH-127 adds its own spec. Verdict unchanged: PASS-WITH-NOTES.

Second rebase (2026-10-14): origin/main advanced to 123a72f, which merged OOHDASH-122 (degraded-mode banner, PR #92) on top of the OOHDASH-127 base already picked up above. The branch was rebased again onto 123a72f, so it is now integrated on top of BOTH OOHDASH-122 (#92, degraded banner) AND OOHDASH-127 (CI fix). Version on main is still 1.3.7 (OOHDASH-122 carried no version bump). Git auto-merged all ten OOHDASH-123 commits with no textual conflicts; the four overlapping files were then verified by hand for semantic correctness: routes/api.js /me keeps 122's degraded field and 123's removal of the legacy midWait control line; server.js keeps 123's pre-listen resume block and 122's in-listen start-up probe plus healthz; services/tb-device.js keeps 123's read-path edits and 122's appended probeBridgeReadOnce / bridgeStatus latch; public/js/app.js and the test specs keep both sides. Both suites were re-run together on the integrated base: unit 390 pass / 0 fail / 1 skip (391 total, including 122's 25 new unit tests); e2e 144 passed / 2 skipped / 0 failed (4.3m, including 122's 6 degraded-banner e2e tests). 122's degraded-banner behaviour and tests and 123's three-outcome behaviour and tests pass together. No prod ThingsBoard writes; the J8 live test was not run. Verdict unchanged: PASS-WITH-NOTES.

Third rebase (2026-10-14): origin/main advanced again as OOHDASH-122 was RELEASED as v1.3.8 (release commit d65a3f6 plus the v1.3.8 release-preflight doc, PR #96). These commits change only RELEASE_NOTES.md, the preflight doc, package-lock.json and the package.json version (1.3.7 -> 1.3.8) - orthogonal to this change. The branch was rebased cleanly onto that base (no conflicts); it is now built on v1.3.8. Unit re-run on the v1.3.8 base: 390 pass / 0 fail / 1 skip (391 total). The e2e result is unchanged from the second rebase (release commits touch no product or test code). Verdict unchanged: PASS-WITH-NOTES.
