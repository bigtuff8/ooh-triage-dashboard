<!-- gate:contract
SECTION: What this ticket builds
When a caller says a pub is too cold or too hot, the OOH agent applies a timed boost directly to the boiler-control panel — forcing heating on or off for a fixed period — without touching the schedule. Every boost opens a Zendesk ticket so the IoT team can find the underlying cause next morning. The boost reuses the existing durable-hold and revert-worker machinery and adds two new dispatch primitives: a one-way RPC for V2 panels and a shared-attribute write for V1 panels. The 01:00 and 07:00 Europe/London boundaries are enforced at dispatch. The OOH revert worker is the sole guarantor of the D2 boundary for both V1 and V2 — V2 panels self-revert at the next schedule edge but that edge can be after 01:00 for late-closing pubs. A failed revert on either panel type can leave heating running past 01:00; this risk and the overnight notification policy are open questions James must decide before any site goes live.

DECISION: Heat ON — duration menu | 30 min, 1 h, 2 h | Different options
DETAIL: The 01:00 cutoff clamps any boost that would run past it. A 2-hour boost at 23:30 becomes 30 minutes. A boost requested between 01:00 and 07:00 is refused outright.

DECISION: Heat OFF — duration menu | 1 h, 2 h, Until 07:00 | Different options
DETAIL: The "until 07:00" option handles the overnight too-hot call cleanly — the zone is forced off until morning. James may also want to add or remove options here.

SECTION: Heat OFF time restriction
Forcing heating off does not make heating run, so the 01:00 cutoff does not directly apply. Three choices: no restriction so an operator can force-off at any time; refuse between 01:00 and 07:00 for symmetry; or allow the boost but always set the revert no earlier than 07:00 when inside the nocturnal window.

DECISION: Heat OFF — time restriction | No restriction (Option A) | Refuse between 01:00 and 07:00 (Option B) | Allow but clamp revert to 07:00 if nocturnal (Option C)

SECTION: Existing human override policy
Tony, Sam or CJ sometimes set overrides directly from the TB dashboard. If OOH sends a 30-minute boost over an existing two-hour human override, the OOH revert at 30 minutes will cancel the human override. Two options: read the current zone state before dispatching, surface a warning to the operator, and let them choose whether to proceed; or block the boost entirely if a human override is already active.

DECISION: Existing human override | Warn operator and let them proceed | Block if a human override is already active

SECTION: Overnight revert-failed coverage
A failed V1 revert leaves a zone forced indefinitely. A Heat ON revert failure leaves the pub overheating overnight; a Heat OFF revert failure leaves staff arriving to a cold pub at 07:00. The Zendesk ticket update means the IoT team sees the failure next morning — worst case is roughly six hours if the failure is at 01:00. An SMS or email notification on revert-failed would give an overnight owner for both scenarios but is not in scope for this ticket.

DECISION: Overnight revert-failed — V1 risk | IoT morning ticket is acceptable for now | Require SMS notification before V1 sites go live
-->

# OOHDASH-141 Discovery: Pub Heating Boost

**Date:** 2026-10-23  
**Ticket:** OOHDASH-141 — Pub heating boost: timed ON/OFF override on boilerControl panels  
**Phase:** Discovery  
**Status:** Complete — gate pending

---

## 1. How the timed-hold path works today

Reading `services/control.js`, `services/overrides.js`, `services/tb-client.js`, `services/registry.js`, `services/confirm.js`, `services/killswitch.js`, and `C:\harness-runs\gate139\design\OOHDASH-139-DESIGN-DRAFT.md`.

### 1a. Dispatch flow

`control.dispatch()` is the single write entry point. It validates in this order: the F004 confirmation token (consumed atomically via `resolution.consumeConfirmation`), the F016 kill-switch (`killswitch.writesBlocked`), device online and registration state (`tb.hasPublishedState`), and the F009 registry guardrails (`registry.validateCommand`). It then calls `tb.writeServerScopeAttribute(device, attribute, value)` — the **sole write primitive** — which POSTs the `*Requested` key to `SERVER_SCOPE`. Spencer's IoT Command Gate picks it up, writes `pending`, rewrites `Desired`, and rings the bridge. The server-assigned `lastUpdateTs` comes back as `dispatchTs` for the fresh-echo guard.

After dispatch, if `hold.revertAt` is set, `scheduleOverride(action)` writes a Cosmos document to `OohOverrides` with `{status:'active', OohOverrideRevertAt, heldValue, revertValue}` and starts the revert worker.

### 1b. Confirmation

Every `confirmPollMs` the watcher calls `tb.readCommandState()`, which reads the gate's SERVER_SCOPE status attribute (`*SyncStatus`) and the device's own confirming timeseries (`confirmKeys`). The three-outcome classifier in `confirm.classifyOutcome()` decides: CONFIRMED (accepted-fresh AND telemetry-fresh AND matches), NON-DELIVERY (rejected-fresh), or IN-FLIGHT. A hold is scheduled on CONFIRMED only.

For boiler panels there is **no IoT Command Gate** in the path. The `*SyncStatus` attribute does not exist. Confirmation must come from the panel's own telemetry: `CHZn.override` and `CHZn.output_state` for V2; `outputNOverride` and `outputNState` for V1. A new `readBoilerState()` function is needed.

### 1c. Revert worker

`overrides.runWorkerOnce()` runs every 30 s. For each due hold it claims the Cosmos document with an optimistic-concurrency lease (exactly-once across replicas), checks the kill-switch (bounces back to `active` with a `revert-blocked` alert if blocked), and calls **`tb.writeServerScopeAttribute(device, attribute, doc.revertValue)`** — the only current revert path.

For boiler panels this call is wrong: V2 needs a one-way RPC (method `override`, zone and `0` for auto), and V1 needs a SHARED_SCOPE attribute write of `0`. Both methods are missing from `tb-client.js`. On failure the worker sets `status = 'revert-failed'` and calls `raiseAlert('revert-failed', ...)` which writes an F021 alert to the F026 admin queue.

### 1d. Kill-switch

`killswitch.writesBlocked()` checks three layers in order: deploy-time `WRITES_DISABLED` (synchronous, no Cosmos read), runtime global flag, per-site flag. Both the boost dispatch and the revert check this. No changes needed here.

### 1e. Registry and control contracts

`services/registry.js` declares `'boiler-panel': { label: 'Pub boiler panel', commands: [] }` — monitor-only. The `CONTROL_CONTRACT` has no entry for `boiler-panel`. `validateCommand` therefore rejects every boiler-panel command at the F009 guardrail. The boost path needs new registry entries.

---

## 2. What has to change — exact files and functions

### 2a. services/tb-client.js — three new functions

**`dispatchBoilerRpc(device, zone, direction)`** sends a one-way RPC to the panel. It POSTs to `/api/rpc/oneway/{uuid}` with body `{ method: 'override', params: '<ZONE> <N>' }` where ZONE is one of `CHZ1`, `CHZ2`, `DHW`, `boiler` and N is `1` (force on), `-1` (force off), or `0` (auto). Uses the write session. Returns `Date.now()` as `dispatchTs` since one-way RPC gives no server-assigned timestamp. Confirmation is not from the RPC reply — it comes from polling `readBoilerState()`.

**`writeSharedScopeAttribute(device, attribute, value)`** POSTs `{ [attribute]: value }` to `/api/plugins/telemetry/DEVICE/{uuid}/attributes/SHARED_SCOPE` using the write session. Used for V1 panels only. Must be allow-listed against a new `BOILER_SHARED_KEYS` constant analogous to the existing `REQUESTED_KEYS` guard. The `BOILER_SHARED_KEYS` guard is enforced inside `writeSharedScopeAttribute` itself (not only declared) — it is the sole guard against arbitrary V1 SHARED_SCOPE writes and must reject any key not in the set.

**`readBoilerState(device, version, zones[])`** reads the confirming telemetry for each zone. For V2 it reads timeseries `CHZn.override` (epoch-seconds signed) and `CHZn.output_state`. For V1 it reads `outputNOverride` (epoch-ms signed) and `outputNState`. Returns an array of `{ n, overrideUntilMs, direction, outputState }`. Used by the dispatch confirm loop and by the revert confirm path.

### 2b. services/registry.js — boiler-panel commands and contract

The `REGISTRY['boiler-panel'].commands` array changes from `[]` to `['boost-on', 'boost-off']`. A new `CONTROL_CONTRACT['boiler-panel']` entry is added with `requestedKey: null` (no Requested key — dispatch is direct), `statusKey: null`, `errorKey: null`, `confirmKeys: null` (confirmation is via `readBoilerState()`), `controllable: true`, and `timingClass: 'boiler-panel'`. A new timing class `'boiler-panel'` is added to `config.control.classes` with fast confirm limits (V2 ~3 s, V1 ~2 s). `validateCommand` gains two new cases — `'boost-on'` and `'boost-off'` — that validate the zone is one of `CHZ1` or `CHZ2` (pub zones only) and return `{ ok: true, dispatchMethod, zone, direction }`.

**V1 zone→output mapping (per-site build-verify requirement):** V1 panels use `output2Override` for zone 1 (Bar) and `output3Override` for zone 2 (Restaurant) in the standard Airedale wiring. This mapping is conventional, not confirmed per-device from TB telemetry. Build requirement: the CHZ1→output2Override and CHZ2→output3Override mapping must be verified at first-boost test for every V1 site individually before that site goes live. A single generalised test on one site is not sufficient — a differently-wired site could force the wrong output, a safety hazard. The registry entry must store the per-site mapping if any variation is found. RPC params (`<ZONE> <N>`) and SHARED_SCOPE attribute names are derived solely from allow-listed, validateCommand-returned values — never from raw operator input.

### 2c. services/control.js — new boiler boost dispatch path

A parallel entry point `dispatchBoilerBoost({ operator, confirmToken, siteNo, deviceId, zone, direction, hold })` is added alongside the existing `dispatch()`. The existing Salus/Tuya path stays unchanged. The new path: validates the F004 token and F016 kill-switch; resolves the device and checks online state; reads the current zone state via `tb.readBoilerState()` for the `previousDirection` audit field; applies the 01:00/07:00 clamp (§3) and refuses or truncates as needed; validates via `registry.validateCommand`; dispatches via `tb.dispatchBoilerRpc()` (V2) or `tb.writeSharedScopeAttribute()` (V1); then polls `tb.readBoilerState()` for confirmation.

**Confirm-timeout path (required):** The confirm poll window is 5 s for V2, 2 s for V1, checking that the zone's `overrideUntilMs` changed and the `direction` sign matches. Telemetry is treated as stale if the most recent reading pre-dates the dispatch timestamp; IN-FLIGHT if stale or still matching previous state; CONFIRMED on a fresh match; NON-DELIVERY if a contradicting fresh value is received. If the poll window expires with no CONFIRMED or NON-DELIVERY (i.e., telemetry never turned fresh), the outcome is classified as IN-FLIGHT-TIMEOUT. **In all non-CONFIRMED outcomes the hold must still be scheduled with the original `revertAt`.** Dispatching without a safety revert because confirmation was ambiguous is not acceptable — the zone may be forced and the only safeguard is the revert. Additionally: on IN-FLIGHT-TIMEOUT, an F021 alert is raised and the Zendesk ticket body flags the confirmation as unverified. After writes the audit row is committed and the IoT team Zendesk ticket is created (§5).

### 2d. services/overrides.js — boiler revert dispatch branch

Inside the `revert()` inner function, after the kill-switch check, a new branch is added for `doc.deviceType === 'boiler-panel'`. It reads `doc.panelVersion` ('v1' or 'v2'), `doc.zone` (e.g. 'CHZ1'), `doc.attribute` (e.g. 'output2Override'), and `doc.dispatchFootprint` from the Cosmos record.

**Revert identity check (required — prevents clobbering a later human override):** Before writing the zero, the revert worker calls `tb.readBoilerState()` and compares the live zone override footprint to `doc.dispatchFootprint`. For V2 the footprint is the `CHZn.override` epoch-second value written by OOH's dispatch; for V1 it is the signed `outputNOverride` epoch-ms value. If the live footprint differs from `doc.dispatchFootprint` and the footprint is not `null` — i.e., the zone has been overridden again since OOH dispatched — the revert is skipped (already-satisfied or superseded) and a note is added to the Zendesk ticket. This is analogous to the existing `preDispatchCheck()` already-satisfied guard. The `scheduleOverride()` call in `dispatchBoilerBoost` must store `dispatchFootprint` alongside `panelVersion`, `zone`, and `attribute` in the Cosmos record.

**Footprint under IN-FLIGHT-TIMEOUT (explicit tradeoff — see Q4 note):** When dispatch classification is IN-FLIGHT-TIMEOUT, the post-dispatch telemetry never turned fresh, so the OOH-written footprint was never observed. In this case `doc.dispatchFootprint` is stored as `null`. When the revert worker finds `dispatchFootprint === null`, it reverts unconditionally — this is the conservative safe path since we know a dispatch was sent and cannot verify it did not land.

Acknowledged tradeoff: a human override placed in the window between an IN-FLIGHT-TIMEOUT dispatch and the revert cannot be distinguished from OOH's unconfirmed write. The unconditional revert will clobber it. This tradeoff is unavoidable given the one-way RPC design and is explicitly surfaced in Q4 so James can decide whether unconditional revert or a "skip and alert" policy is preferable. The IN-FLIGHT-TIMEOUT path also raises an F021 alert, so the admin queue records the ambiguity.

After the identity check passes, the worker calls `tb.dispatchBoilerRpc(device, doc.zone, 0)` for V2 or `tb.writeSharedScopeAttribute(device, doc.attribute, 0)` for V1. Confirmation is via `tb.readBoilerState()` checking the zone's `overrideUntilMs` returned to near-zero. On revert-failed, `raiseAlert('revert-failed', ...)` is called and the Zendesk ticket is updated with a manual-check flag.

### 2e. Confirm-poll telemetry freshness and slow-telemetry fallback

The 2–5 s confirm window is the expected round-trip for boiler-panel telemetry. The confirm classifier compares the zone's reported override epoch to `dispatchTs`.

**Timestamp resolution mismatch (V2):** V2 `CHZn.override` is epoch-seconds (integer). `dispatchTs = Date.now()` is epoch-ms. Comparing them directly conflates same-second writes with stale reads. The freshness check for V2 must floor `Date.now()` to epoch-seconds before comparison: `Math.floor(Date.now() / 1000) > storedOverrideEpochSeconds`. The footprint stored in the Cosmos record must also be in epoch-seconds for V2 so the revert identity check uses the same resolution. V1 `outputNOverride` is epoch-ms, so the comparison is direct.

**Freshness threshold:** Treat telemetry as fresh if its timestamp is `>= dispatchTs` (epoch-seconds comparison for V2, epoch-ms for V1). Stale if predating dispatch. If telemetry fails to turn fresh within the poll window, classify as IN-FLIGHT-TIMEOUT (§2c). The poll cap is 5 s for V2 and 2 s for V1. The confirm poll is best-effort; the safety revert is always scheduled regardless of outcome.

**Confirm-window latency must be measured, not assumed:** The 2 s / 5 s windows are estimates based on the 60-day log analysis (not a dedicated latency benchmark). If exceeded routinely, dispatch silently degrades to null-footprint unconditional revert, disabling the human-override identity check at scale. Build requirement: the supervised first-boost test must record the actual telemetry round-trip latency distribution (not just binary "lands within N s") and report the P95. If P95 exceeds the confirm cap, the window must be widened before site rollout.

### 2f. Revert worker posture

The existing 30 s revert worker loop is already in production for Salus/Tuya holds and is bounded (one Cosmos lease claim per device per tick). Each boiler boost adds one Cosmos document and one polling cycle per revert attempt — no unbounded fan-out. The per-boost Zendesk ticket is a single API call at dispatch and a single note at revert — likewise bounded.

### 2g. New helper: clampBoostWindow (inline in control.js or new module)

A pure function `clampBoostWindow(now, durationMs, direction, timezone)` that enforces the 01:00/07:00 rule. See §3.

### 2h. routes/api.js — new POST route

A new `POST /api/boiler-boost` route calls `dispatchBoilerBoost()`. Guarded by the existing auth and site-confirmation middleware. Wired into the operator flow after 139's `boilerHeatingOutcome()` returns a boost-appropriate state (W5 switched-off / W6 off-on-timetable for the ON path; W8 on-but-hot for the OFF path).

---

## 3. The 01:00/07:00 clamp

### James's rule (binding, D2)

Pub heating must never run past 01:00 and never start before 07:00 Europe/London, whatever the operator selects. The clamp holds even if a revert is late or fails.

### Heat ON boost — clamp logic

The `clampBoostWindow()` function converts `now` to Europe/London using the `date-fns-tz` library already in the repo and applies these rules:

**DST handling:** On spring-forward nights (late March), the 01:00 Europe/London hour does not exist (clocks jump 00:59 → 02:00 BST). On those nights the clamp ceiling is 02:00 BST (the next valid moment), which is more permissive but safe — heating cannot run into a non-existent hour. On fall-back nights (late October), 01:00 occurs twice: 01:00 BST and 01:00 GMT. The clamp must use the later occurrence (01:00 GMT / `1:00:00 +00:00`) — the more conservative choice. The implementation must use `date-fns-tz`'s `zonedTimeToUtc` with the `disambiguate: 'later'` option or equivalent to handle the fall-back duplicate. This must be verified with a unit test covering both DST transitions.

When the request arrives between 07:00 and midnight, the boost is allowed. `revertAt` is set to `now + durationMs`. If `revertAt` falls after 01:00 of the same night (e.g. 23:30 + 2h = 01:30), it is clamped to 01:00 and the operator sees a message: *"2-hour boost clamped to 30 min — pub heating must stop at 01:00."*

When the request arrives between midnight and 01:00, the same clamp applies. A 2h ON at 00:15 becomes a 45-minute boost ending at 01:00. If the clamped duration is under 15 minutes, the boost is refused: *"Only X minutes remain before the 01:00 cutoff — boost refused."*

When the request arrives between 01:00 and 06:59, the boost is refused: *"Heating boosts cannot start between 01:00 and 07:00. If the pub is still cold, the IoT team will investigate next morning."*

**Hard stop on late revert — OOH revert worker is the sole D2 guarantor (both V1 and V2):**

V2 zones expire at the next schedule edge (60-day log confirmed). However, the next edge is the next configured schedule slot boundary — which for a late-closing or overnight-off pub can be at 02:00, 06:00, or later. A V2 boost running from 23:30 to "next edge" at 06:00 would hold the zone on past 01:00 if the OOH revert fails. V2 natural expiry is a safety net, not a D2 guarantee.

V1 has no natural expiry at all.

Therefore: for both V1 and V2, the OOH revert worker is the sole D2 guarantor. A failed revert on either panel type can leave heating running past 01:00. The `revertAt` clamp ensures no boost starts past the window, but cannot guarantee it ends on time if the revert worker fails. The risk differential between V1 and V2 is therefore one of urgency (V2 eventually self-reverts; V1 does not) rather than D2 compliance.

Build requirement: revert reliability must be verified in the supervised first-boost test for both V1 and V2, and the overnight revert-failed notification decision (Q5) applies to both panel types before any site goes live.

### Heat OFF boost — clamp (OPTIONS for James)

The 01:00/07:00 rule concerns heating **running**. Forcing heating OFF does not make heating run, so the rule does not directly apply. Three options for James:

**Option A — No window restriction on OFF boost.** The operator can force-off at any time. Duration is bounded by the fixed menu only (§4). Risk: a forced-off at 06:50 ending before 07:00 gives 10 minutes of heat before the revert — disruptive when staff arrive.

**Option B — Symmetry: refuse OFF boost between 01:00 and 07:00.** Simpler to explain and operate. If the pub is too hot after 01:00, it should already be off by then.

**Option C — Allow OFF boost but set revertAt to 07:00 minimum if inside the nocturnal window.** An OFF boost started at 02:00 reverts at 07:00. Cleanest for overnight, but more complex clamp logic.

*James to decide. Recommendation: Option A, with the "until 07:00" duration option (§4) as the natural overnight choice.*

### V2 natural end vs OOH revert

V2 CHZ overrides expire at the next schedule transition. OOH schedules its own revert at the selected duration. Two outcomes: OOH revert fires first (controlled, preferred) or the natural schedule transition fires first (override already gone). In the second case, the revert reads `override = 0`, finds already-satisfied, and exits cleanly — the same pattern as `preDispatchCheck()` in the existing path.

---

## 4. Duration options (OPTIONS for James)

**Heat ON boost — proposed menu**

- 30 min — quick warm-up near closing
- 1 hour
- 2 hours (clamped to 01:00 if needed)

**Heat OFF boost — proposed menu**

- 1 hour
- 2 hours
- Until 07:00 — recommended for "too hot, close it down for the night"

*James to choose the final menu and confirm whether DHW or boiler-level overrides should also appear in the operator UI.*

---

## 5. IoT team note — content

Every boost creates a Zendesk ticket via the existing `createLateSyncTicket` / `addLateSyncNote` infrastructure in `services/zendesk.js`. For a boiler boost the ticket is opened **immediately on dispatch** (not deferred), so the IoT team receives it even if the revert succeeds cleanly.

**Zendesk ticket creation failure handling:** The Zendesk call at dispatch is synchronous and blocking before `scheduleOverride()` is called. If it fails (network error, API error), the dispatch flow must still schedule the hold (the safety revert must not be skipped) but must raise a separate `raiseAlert('zendesk-failed', ...)` to the F026 admin queue so a record of the boost exists even without the ticket. The "IoT morning ticket is acceptable" risk acceptance requires the ticket to exist; the alert provides a fallback when it does not.

**At dispatch the ticket body covers:** site name and number, zone (pub zone 1 or 2), direction (heating forced ON or OFF), operator name, caller's reported issue (from the conversation context), panel version (V1 or V2), boost label and `revertAt` time, whether the duration was clamped and by how much, and the confirmation read-back (zone `overrideUntilMs` and `outputState` at the moment CONFIRMED was classified).

**At revert a ticket note is added:** revert outcome (CONFIRMED or revert-failed), the zone `overrideUntilMs` and `outputState` read-back after the revert, and if revert-failed, a plaintext flag that the zone may still be forced and a manual check is needed.

**Subject line format:** `[OOH Boost] {Site name} — {zone} heating {ON or OFF} until {HH:MM}`

---

## 6. Open questions — researched first

All candidates were chased with source analysis and the read-only 60-day TB audit-log sweep from discovery. Items on this list are genuinely unanswerable without a write.

### Q1 — V2 RPC reply body and one-way timeout (DEDUCED)

TB one-way RPC (`/api/rpc/oneway/{deviceId}`) returns an immediate server ack with no device reply. The 60-second rule-chain relay timeout applies to two-way calls only. A one-way call fires-and-forgets at the TB layer; confirmation comes from telemetry, not the reply body. The supervised first-boost test will verify there are no surprises. The empty "Timer to Reset Boiler Overrides" chain (0 nodes) is unlikely to intercept the RPC, but the test will catch any such interaction. Low residual risk.

### Q2 — Duration token in V2 RPC params (UNRESOLVED)

Does `"CHZ1 1 30"` (a third argument = minutes) tell the V2 panel to self-revert after 30 min? All 1,850 RPC_CALL records in the 60-day log used two-token params only. If it works it is a V2 optimisation that could eliminate the OOH revert for V2. OOH's own revert is the safe path regardless — this is not a dependency. Verify in the supervised test on Sam's site.

### Q3 — Does a zone boost also need boiler.override? (UNRESOLVED, safety-critical)

Forcing `CHZ1 1` opens the zone valve. If the boiler is not already calling for heat (`boiler.enable_output_state` or `output1State`), the zone runs but the boiler may not fire. For a "too cold" call, the pub does not warm up. The V2 panel may propagate a zone-on override to the boiler automatically (the normal case during active schedule), or it may not. The supervised test must record `boiler.enable_output_state` before and after the zone override. If it does not flip, OOH must also send `boiler 1` alongside the zone command and `boiler 0` on revert — a separate RPC call. For V1, the same question applies to `output1State` and `output2Override`.

**Build requirement:** The ON path must not go live on any site — V1 or V2 — until the supervised test confirms or refutes Q3. This applies to the first site regardless of panel version.

**Multi-zone revert (conditional on Q3 outcome):** If Q3 resolves to requiring an explicit `boiler 1` alongside the zone command, the revert at boost end must also send `boiler 0`. However, sending `boiler 0` when a second zone is concurrently boosted or still being heated by an active schedule would starve that zone. The revert worker must check that no other zone is currently active (via `readBoilerState()` covering all pub zones) before sending `boiler 0`. If another zone is active, the `boiler 0` send is skipped and only the triggering zone's override is zeroed. This requirement is conditional on Q3's outcome and must be specced in the design gate if Q3 confirms the boiler override is needed.

### Q4 — Interaction with an existing human override (UNRESOLVED, policy)

Tony, Sam, or CJ sometimes set overrides directly from the TB dashboard. If a human has `CHZ1.override = epoch+2h` and OOH sends a 30-min boost, OOH's revert at 30 min sends `CHZ1 0` (auto), cancelling the human's 2-hour override. Two choices: pre-empt and warn the operator that an override is already active (read `readBoilerState()` before dispatching and surface the existing `overrideUntilMs`), or block the boost and ask the operator to call the engineer. The `contractor_override` field is unreliable (went stale at 6211 for 6 days — DEDUCED). The per-zone `CHZn.override` sign is the reliable source. James to decide the policy.

Note: the post-dispatch window is separately addressed by the revert identity check in §2d — if a human override is placed after OOH's boost is active, the revert worker detects the footprint mismatch and skips the zero-write. Q4 is therefore primarily about what to do at dispatch time.

**Residual tradeoff at revert time:** When a dispatch completes with IN-FLIGHT-TIMEOUT (footprint not observed, stored as `null`), the revert worker cannot perform the identity check and zeroes unconditionally. A human override placed after the IN-FLIGHT-TIMEOUT dispatch and before the revert will be clobbered. James must explicitly accept this tradeoff or specify an alternative policy (e.g., on null-footprint, skip the zero and raise an alert instead of zeroing). This is a policy question that must be resolved before V1 goes live, since V1 has no natural expiry to catch a missed revert.

### Q5 — Overnight revert-failed owner (UNRESOLVED, operational)

`raiseAlert('revert-failed', ...)` writes to the F026 admin queue. Who monitors it at 01:00? The planned Zendesk ticket update (§5) means the IoT team sees the failure first thing next morning — worst case is a zone held for ~6 hours if V1.

Two revert-failed scenarios need covering:

**Heat ON revert-failed:** V1 zone stays forced on past `revertAt`. Pub overheating overnight. Already covered in the gate DECISION below.

**Heat OFF revert-failed (symmetric risk):** V1 zone stays forced off past `revertAt`. Staff arrive to a cold pub at 07:00. This is the symmetric failure and should be subject to the same notification decision — an overnight owner is needed in both cases.

An SMS/email notification on F021 revert-failed would provide overnight coverage for both; this is outside scope for 141. James to decide the notification threshold before any V1 site goes live (both ON and OFF paths).

---

## 7. Scope boundary

In scope for OOHDASH-141: V2 one-way RPC dispatch and revert for CHZ1 and CHZ2 (pub zones), V1 SHARED_SCOPE write and revert for output2Override and output3Override, the 01:00/07:00 clamp enforced server-side at dispatch and at revert scheduling, the durable Cosmos hold record extended with `panelVersion`, `zone`, and `attribute`, the revert worker extended with the boiler branch, the IoT team Zendesk ticket opened at dispatch and updated at revert, and the supervised first-boost test on a Sam-selected site.

Out of scope: DHW override (OOHDASH-136), accommodation zones, SMS/email notification on revert-failed (operational decision), schedule changes (invariant — never).

**Concurrent overlapping boosts on the same zone:** If a second boost request arrives for the same zone while a first boost is active, `readBoilerState()` at dispatch time will return an existing non-zero `overrideUntilMs`. The Q4 policy (warn or block) applies — the same pre-dispatch check that guards against human overrides also guards against a second OOH boost. The footprint identity check at revert time additionally prevents the earlier boost's revert from zeroing a zone that has since been re-boosted. This behaviour is explicit, not emergent.

**Dependency:** OOHDASH-141 builds on OOHDASH-139's `classifyDevice → boiler-panel`, `deriveArea → Bar/Restaurant`, and `decodeBoilerHeating`. The boost UI re-uses 139's zone-state facts. 141 cannot ship before 139 is merged.

---

## 8. Supervised first-boost test

Before any site goes live, a supervised test must run on a site Sam selects with James's explicit go. The test checks: V2 RPC call lands (`CHZn.override` changes within 3 s), `boiler.enable_output_state` before/after (resolves Q3), OOH revert fires at the scheduled time and `CHZn.override` returns to 0, V1 SHARED_SCOPE write lands (`outputNOverride` changes within 1 s), V1 OOH revert fires and `outputNOverride` returns to 0, and optionally the duration-token format (resolves Q2).

This is the first action of the build phase, not a discovery task.
