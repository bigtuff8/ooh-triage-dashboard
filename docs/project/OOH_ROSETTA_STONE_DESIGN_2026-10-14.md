<!-- gate:contract
SECTION: What this design delivers
This is the Design artefact for OOHDASH-123, the Rosetta Stone. On 10 October Spencer put a new ThingsBoard "IoT Command Gate" live. Our dashboard still speaks the old language, so every remote command now ends as "No confirmation" after 90 seconds even when the light actually switched in under two seconds, and a stuck thermostat cannot be re-commanded at all. This design re-plumbs how the dashboard sends a command, how it hears back, and what the operator sees - end to end, device class by device class. It turns the approved discovery and its research addendum into a buildable specification: the new write path, a per-class read/control/feedback map (including the bare switch key for external lighting), an honest three-outcome confirmation model with per-vendor timing, re-send that actually works, save-and-resume so a server restart cannot lose a minutes-long heating result, removal of the hot-water boost button that never worked, honest handling of offline and dark-fleet devices, humane error messages, a data dictionary, and a full test pack. A clickable mockup of every operator-facing state ships alongside as OOH_ROSETTA_STONE_STATES_MOCKUP_2026-10-14.html.

SECTION: The one headline change
To send a command, the dashboard must now write a Requested key (switchRequested, setpointRequested) to SERVER_SCOPE and let the gate do the rest. Today it writes the Desired key directly, which bypasses the gate entirely: no pending marker, no offline check, no doorbell to the bridge, and on Tuya devices probably no dispatch at all. This is the first thing Build changes and everything else follows from it. The gate writes pending then rewrites Desired and rings the bridge; the bridge writes accepted or rejected with a short error. A command counts as confirmed only when the device's own reading matches what we asked for, timestamped after we sent. Nothing else is ever shown as success.

SECTION: The three-outcome confirmation model
Every command ends in exactly one of three honest outcomes, and only the first may ever look like success. CONFIRMED: the device's own reading now matches the request. NOT DELIVERED: the gate or vendor rejected it, and we show the reason in plain English and keep the raw text on the ticket. NOT CONFIRMED: it was accepted but the device has not shown the change by the per-vendor time limit - we never call this "failed" (it may still land) and never "done"; we keep watching and update the ticket, and the operator can resend. "Accepted" on its own is an in-between state, never success - showing accepted as success is exactly the OOHDASH-102 false-success bug we must not reintroduce.

SECTION: Timing the operator actually sees
Tuya switches finish in about half a second, so the operator waits inline and gets the result almost at once (confirm limit 10 seconds). Salus heating takes minutes, so the operator is released immediately with "sent to the device, should take effect within about N minutes", then told the live result when it arrives. The copy figure N and the machine confirm limit are two different numbers, both configurable without a release: IT700 says 5 minutes, limit 45 minutes; IT500 says 15 minutes, limit 35 minutes. Salus control stays offered but labelled "may take a few minutes" and is never shown as confirmed until the device's own setpoint reading proves it.

SECTION: Honest about what cannot be controlled
Three things the dashboard stops pretending it can do. Hot-water boost is removed - the button could never dispatch on a boiler panel; the need is routed to capture-and-escalate with the boiler guidance so the caller still gets help. Dark fleets (about 347 IT500 and 384 bare-salus devices that have not reported for 12 to 134 days) show as "device not reporting" with no control offered, instead of looking live. Any controllable device with no reading for more than 3 hours (configurable per class) shows as offline with no control, because the gate would only reject the command as "device offline".

SECTION: Next scheduled change
James pulled "show the next scheduled change" into this release for boiler panels and PowerPause circuits. Their schedules are readable from ThingsBoard today as plain JSON, so the dashboard can compute and show the next change as read-only context. But the exact field meanings (day order, timezone, which store is authoritative) are not yet confirmed by Spencer - that is open question SQ-13. The design decodes from the shared attributes and flags every assumption; DD-SCHED-DISPLAY asks you whether to show the decoded next-change now with a caveat, or show only a safe "following its programme" indicator until Spencer confirms. Tuya and Salus IT700 schedule blobs are not decoded and show an indicator only; IT500 and Intesis schedules are not visible from ThingsBoard.

SECTION: Security and go-live preconditions (do not block Design)
Three items block go-live, not this Design. The design uses our own figures as configurable defaults and names these three as release-gate preconditions. One: SQ-05, no Salus command has been observed reaching accepted-and-confirmed anywhere we can read, so Salus control stays labelled unproven until one is seen. Two: credential rotation (D-SEC-ROTATE, two live credentials, written confirmation due 2026-10-21). Three: SQ-13 schedule field semantics for the next-change feature. The J8 admission test (one James-approved live command) is the release gate that proves the new path end to end and is blocked until the two credential rotations are confirmed in writing.

SECTION: Cost and silent running
This design spends no new money and adds no always-on background process. Commands are on-demand writes and reads over the existing ThingsBoard connection using existing credentials - no new subscriptions, no per-call API fees, no added LLM tokens. Confirmation watching is event-and-timeout driven, not a poll: a watcher wakes only when a confirmation arrives or its own deadline fires, then sleeps; it burns no tokens, money or machine time while idle, and shows nothing on anyone's screen. The only standing process is the existing 30-second override revert worker, which already runs and is not changed in nature by this work. Neither the cost nor the silent-running criterion is compromised; there is nothing to disclose.

SECTION: The live prototype
A self-contained, clickable mockup ships with this design: docs/project/OOH_ROSETTA_STONE_STATES_MOCKUP_2026-10-14.html. Pick a device (fast Tuya light or minutes-long Salus heating) and a scenario, press the action, and watch the real operator experience: sent / within N minutes, accepted-waiting, confirmed, not-confirmed (keep watching), rejected (humane error), device-not-reporting, and boost-removed. The governed gate embeds it as the Live prototype card.

SECTION: Decisions already made (binding - not reopened)
These were decided by James at PR #86 and #88 and are honoured as written, not reopened here: write the Requested key (direct-Desired contradiction approved); confirmed means the device's own reading matches; accepted-but-unchanged at the limit is "Not confirmed" with keep-watching; Salus stays, labelled "may take a few minutes"; hot-water BOOST is out (route to capture-and-escalate); persist in-flight actions (save-and-resume) in R1; accept the gate's no-per-caller-check model for R1 as a known risk owned by Spencer (per-caller check is R2, OOHDASH-126); offline default 3 hours configurable per class; split Salus copy from confirm limit (IT700 5 min / 45 min, IT500 15 min / 35 min, all configurable); next-scheduled-change for boiler and PowerPause is IN R1, decoded from the shared attributes; the bare switch key mapping is in this main Design and Build; dark fleets show as "device not reporting" with no controls; bias to re-fire and suppress only on a fresh reading timestamped after pending; no server-side pending expiry; normalised string compare; humane error translation.

SECTION: Open questions to Spencer, held - SQ-01 to SQ-06 (verbatim)
These are held until James releases the consolidated list; the design carries a safe default for each. SQ-01: Under the current production bridge (integration-bridge:prod-sd446-v1), is Requested written to SERVER_SCOPE the required and sole supported command path? Does a direct Desired write to SHARED_SCOPE dispatch anything on Tuya, Salus, or Intesis devices, or is its behaviour undefined? SQ-02: Does the bridge ever write SyncStatus = pending itself (for example, to signal a retry or a queued state), or does only the gate write pending? SQ-03: What causes "No active Tuya session owns device" to appear after the production Tuya project was activated? Is it a session timeout, a pod restart, or something else? Is it expected to continue recurring, and if so, should we advise operators to wait a moment and retry? SQ-04: If the bridge is unreachable or the doorbell POST fails, is there any process - on the gate side or the bridge side - that eventually writes SyncStatus = rejected to resolve a stuck pending? If so, after what timeout? SQ-05: Has any Salus IT700 or IT500 setpoint or mode command been sent through the new production gate (or UAT gate if it is the same contract) and reached accepted? If yes: which device, what was the outcome timestamp, and can you share the attribute snapshot or a bridge log excerpt showing the accepted write? SQ-06: What are your measured times for Salus IT700 and IT500 from dispatch to accepted (gate to bridge to vendor), and from accepted to device-confirmed (the device's own telemetry matching the requested value)? Typical and worst case separately for IT700 and IT500, please.

SECTION: Open questions to Spencer, held - SQ-07 to SQ-13 (verbatim)
SQ-07: Is production Salus IT500 polling restored? Has the Arrayent shared account been fixed and the bridge restarted to resume polling? If not, what is the expected restoration date? SQ-08: After a successful IT700 setpoint command, does the bridge's confirm-read publish a fresh heatingSetpoint to ThingsBoard immediately (within a few seconds or minutes of the shadow update), or does heatingSetpoint only update when the physical thermostat pushes its next heartbeat reading (which may be 20-30 minutes later)? SQ-09: On the production Salus bridge, does writing the same setpointRequested value (for example, 21 degrees twice in a row) trigger a new vendor command to the device each time, or is the second write deduplicated and silently ignored? SQ-10: Which key does the bridge write for hot-water boost status: hwBoostHoursSyncStatus (matching what the gate writes for pending) or hwBoostSyncStatus (matching the SD-598 spec table)? SQ-11: Is the bare switch key the intended and stable telemetry key for these external-lighting units and DHW farm devices? Should the dashboard read switch_1 first and fall back to bare switch (when switch_1 is absent) for both displaying state and confirming commands? SQ-12: Can the IoT Command Gate's freshness window for Tuya devices be raised from 45 minutes to 3 hours? Is that a configuration change you can make to the live rule chain, and if so, what is the deployment process? SQ-13: (a) Boiler panels and PowerPause - field semantics. Is time always HH:MM in the site's local timezone (Europe/London)? What is the day order in loops - is character position 0 Monday, or Sunday? Is value always a temperature setpoint in degrees Celsius for heating outputs, and degrees Celsius for hot water? Is the SHARED_SCOPE schedules attribute the authoritative source (what the device is supposed to execute), with CLIENT_SCOPE as an echo from the device? And finally: is an empty or absent schedules attribute the correct way to represent "no schedule set" (device runs unscheduled)? (b) Tuya plugs and fryers - blob decoder. Can you supply the verified byte map for the Owon DP131 schedule blob: specifically the bit order of the day-mask byte, the meaning of the on/off byte (is 1 = on, 0 = off, or reversed?), and the meaning of the enable byte? And equivalently for the Tongou cycle_time blob - record size, byte order, and the unit of the start and end time fields? (c) Salus IT700 - schedule decode. Is there a decode for the heatSchedule1, heatSchedule2, heatSchedule3 hex blobs? If not, is scheduleEnable + holdType the only reliable schedule-state indicator readable from ThingsBoard for IT700, and is holdType the right key to show an operator when asking "is the thermostat following its programme or is it overridden?" (d) Intesis and IT500 - vendor-cloud reach. Is there any schedule readable for Intesis or IT500 devices through the bridge without a direct vendor-cloud API call? Or does reading an Intesis or IT500 schedule require the bridge to log in to the vendor's cloud, which is a separate action outside the ThingsBoard REST path? (e) Schedule Hub clarification. Is the "Schedule Hub" at schedulehub-uat.airedale-group.io an engineer job-scheduling system (planning and rostering engineer visits and jobs) rather than a device schedule store? We want to confirm we are not missing a single system that holds all device schedules in one place.

SECTION: Security confirmations, held - SEC-1 and SEC-2 (verbatim)
SEC-1 - Shared credential in the IoT Command Gate rule chain. We are asking for: 1. Written confirmation that the credential has been rotated by 21 October 2026, naming the credential type and the rotation date. 2. Confirmation that the rotated secret is stored in a secret store rather than in the rule chain configuration metadata. SEC-2 - Vendor access token on gk-st-office-intesis-1. We are asking for: 1. Written confirmation that the attribute has been rotated (the credential invalidated at the vendor's side) by 21 October 2026, naming the credential type and the rotation date. 2. Confirmation that the attribute has been deleted from the device record on the production tenant and (if still present) on the development tenant. 3. Confirmation that the "Intesis Control" rule chain (which references a UAT hostname from the production tenant) is retired or that the legacy entity gk-st-office-intesis-1 is deleted so the chain cannot be inadvertently triggered.

DECISION: DD-J8-TEST: Which single live command is the J8 admission test (read-only until you approve it)? | Recommended: ag-brackley-poweroutlet-6 (Spencer's own 10 Oct proven Tuya device) - write switchRequested OFF then ON, expect pending then accepted then switch_1 confirmed, one full trace captured, nothing else touched | A quieter dedicated Tuya test device you nominate, same OFF/ON trace | Hold J8 until a Salus device can also be bench-tested (adds go-live delay)
DECISION: DD-SCHED-DISPLAY: How should "next scheduled change" show while SQ-13 field semantics are unconfirmed? | Recommended: show the decoded next change for boiler V1/V2 and PowerPause now, labelled "based on the device's stored schedule", and fall back to an indicator if the parse is unsafe | Show only a neutral "following its programme / overridden" indicator for every class until Spencer confirms SQ-13, then switch on decoded times
DECISION: DD-RESEND-UX: How should a stuck or not-confirmed command offer a re-send? | Recommended: operator-initiated only - show "Last command sent [time], not confirmed - tap to resend", never auto-fire | Auto-resend once silently when the site is next opened, then fall back to operator-initiated
DECISION: DD-WAIT-HANDOFF: For a minutes-long Salus command, how is the operator handed off? | Recommended: release the operator at once with an on-screen "sent, result to follow", a background watcher, a later toast, and a ticket note when it lands | Keep a live progress panel the operator can watch or minimise, with the same ticket note
-->

# OOHDASH-123 Rosetta Stone - Design

**Ticket:** OOHDASH-123 (R1) - "Rosetta Stone": re-plumb device read/control/feedback onto Spencer's ThingsBoard IoT Command Gate contract
**Stage:** Design - **Date:** 2026-10-14 - **Branch:** design/oohdash-123-rosetta-stone (off origin/main @ 94e1582)
**Consumes:** OOH_ROSETTA_STONE_DISCOVERY_2026-10-14.md (PR #86, approved), OOH_ROSETTA_STONE_ADDENDUM_2026-10-14.md (PR #88, approved), OOH_ROSETTA_STONE_MATRIX_2026-10-14.md, docs/project/oohdash-123-research/RESEARCH-*.md (nine files)
**Live prototype:** docs/project/OOH_ROSETTA_STONE_STATES_MOCKUP_2026-10-14.html
**Hands off to:** Build (OOHDASH-123 build stage), then Tester (e2e required on main)

---

## 1. Problem and the experience we must deliver

The OOH Triage Dashboard is the tool Airedale's overnight call handlers use to see and fix site problems - cold bars, lights left on, heating stuck. On 10 October Spencer replaced the mechanism behind remote control with a ThingsBoard "IoT Command Gate". The dashboard still listens for the old signals, which no longer exist. The result today:

- Every remote change ends as "No confirmation" after 90 seconds, even when a Tuya light switched in under two seconds. Honest (it never shows false success) but useless, and it trains operators to ignore warnings.
- A genuine rejection also shows as "No confirmation" rather than "Not delivered", and the vendor's reason is thrown away.
- A repeat attempt is blocked: if the stored Desired value already equals the request, the dashboard refuses to send it again. This is live today on the 6261 thermostat (Desired 19 C held since 24 September while the room sits at 16.5 C).

**The customer-experience target (from discovery).** The persona is a lone, time-pressured call handler at 02:00 who has a caller on the line. The journey is: find the site, understand the problem, send a fix, and tell the caller what will happen. The design must deliver three things discovery named as "great looks like":

1. **Honest, fast feedback.** A Tuya switch confirms almost instantly; the handler sees "confirmed" and moves on. No 90-second false wait.
2. **Reassurance on the slow, high-stakes steps.** Heating takes minutes. The handler is released at once with an honest promise ("should take effect within about 5 minutes") and told the real result later - never left watching a spinner, never told "failed" for something that may still land.
3. **No dishonest offers.** Buttons that cannot work (boost), devices that cannot be reached (dark fleets, offline units) are shown as what they are, with a real next step (capture-and-escalate), not a dead end.

Reassurance moments (need confirmation and "here is what happened"): any heating change, any revert, any command on a device the handler cannot physically see. Friction moments (strip the needless step): the fast Tuya switch - no 90-second wait, no blocked re-send, no decision the handler should not have to make.

---

## 2. Design system for the command experience

This work lives inside the existing dashboard, so it adopts the established visual language (confirmed against the live OOHDASH-122 banner mockup) and extends it with one new thing: a coherent set of command-outcome states. The mockup (section 15) is the visual truth of this system.

**Palette (tokens, light and dark).** Primary `#594AE2`; surfaces `#FFFFFF` / `#F1F5F9` (dark `#1E293B` / `#0F172A`); text `#1E293B` / `#64748B`. Outcome colours reuse the existing state tokens: success green (`--success-light` / `--live-text`), danger red (`--danger-light` / `--kill-text`), info blue (`--info-light`) for in-flight/sent, warning amber (`--warning-light` / `--warn-text`) for not-confirmed. Dark mode is defined on `:root` under both `prefers-color-scheme: dark` and `data-theme="dark"`.

**Typography.** Inter / system-ui, 14px base, 1.45 line height; monospace (`ui-monospace, Consolas`) for device names, keys and timestamps so operators can read them to the IoT team verbatim.

**Spacing and shape.** 8px rhythm; `--radius-md` 8px for cards and buttons, `--radius-lg` 12px for frames; 16px side gutter at phone width with no horizontal scroll.

**The four states every command surface owes.**
- **Loading / in-flight:** a spinner with honest copy ("Sent to the device... waiting for it to confirm"), never a frozen button.
- **Empty:** a device with no command in flight shows its current reading and the action, nothing more.
- **Error:** a rejection renders as a plain-English sentence in a red outcome block, with the raw vendor text written only to the ticket.
- **Success:** reserved exclusively for CONFIRMED - the device's own reading matched. Green, with the proven new reading shown.

**Motion intent.** One purpose only: to signal "still working". A single progress bar (Sent, Gate pending, Accepted, Confirmed) and a spinner on the in-flight block. Respect `prefers-reduced-motion` (the spinner animation is disabled under it). No decorative motion.

**Outcome vocabulary (used everywhere, verbatim).** CONFIRMED, NOT DELIVERED, NOT CONFIRMED. Internally these map to the three-outcome model CONFIRMED / NON-DELIVERY / INDETERMINATE. Only CONFIRMED may render green/success.

---

## 3. The re-plumbed write path (end to end)

This is the headline change and the first thing Build does. Every other section depends on it.

**Today (wrong):** the dashboard writes `<cap>Desired` directly to SHARED_SCOPE and polls two time-series keys (`<cap>SyncStatus`, `<cap>Reported`) that no longer exist. This bypasses the gate: no pending, no offline check, no doorbell, probably no dispatch on Tuya.

**New path, step by step:**

1. **Dashboard writes the Requested key to SERVER_SCOPE.** For the capability being changed: `switchRequested` (boolean), `setpointRequested` (number), `modeRequested` (string). Record the write timestamp as `dispatchTs` (read back the Requested key's `lastUpdateTs`, which is the gate's trigger anchor).
2. **The gate validates** (value not empty; device profile is one of the four OOH families; fresh telemetry within 45 minutes, with the ON-direction bypass for a Tuya device last known OFF). On failure it writes `<cap>SyncStatus = rejected` plus `<cap>LastError` beginning "gate: " to SERVER_SCOPE.
3. **On pass, the gate writes `<cap>SyncStatus = pending`** (first write), rewrites `<cap>Desired` to SHARED_SCOPE itself, and POSTs the doorbell to the bridge.
4. **The bridge contacts the vendor** and writes `<cap>SyncStatus = accepted` or `rejected` (second write), with `<cap>LastError` beginning "vendor: " on a rejection.
5. **Confirmation** comes from the device's own telemetry: `switch_1` (or bare `switch`) for Tuya, `heatingSetpoint` for IT700, `setPoint` for IT500. CONFIRMED requires the confirming key to equal the requested value with its own timestamp after `dispatchTs`, and the status not rejected. Order does not matter: the echo may arrive before accepted.

**Key design rules Build must honour:**
- Never write Desired directly. Treat a direct Desired write as unsupported/undefined (SQ-01 default).
- Read `<cap>SyncStatus` and `<cap>LastError` as SERVER_SCOPE **attributes** (not time-series), using `lastUpdateTs` as the freshness stamp. A status whose `lastUpdateTs` is at or before `dispatchTs` is stale (belongs to a prior command); treat as still-in-progress.
- No clear-then-set. Writing an empty/null value is rejected by the gate as "gate: malformed value".
- Compare values normalised: switches as lowercase strings ("true"/"false"); setpoints numerically within 0.25 C.

---

## 4. Per-class READ / CONTROL / FEEDBACK map

This is the contract Build implements against and the tester reads against. One row per controllable or display-relevant class. "Confirming key" is the device's own telemetry that proves the change. All keys are exact.

| Class | READ: state key(s), order | CONTROL: Requested key -> SERVER_SCOPE | FEEDBACK: status / error keys (SERVER_SCOPE attrs) | Confirming telemetry key + compare | Notes |
|---|---|---|---|---|---|
| Tuya owon switch (lighting, fans, kitchen circuits) | switch_1 (string); drop switchReported | switchRequested (boolean) | switchSyncStatus / switchLastError | switch_1, normalised lowercase string, ts > dispatchTs | Live in prod since 10 Oct |
| Tuya switch-only / external lighting (gk-6237, gk-6186, gk-6099) | switch_1 first, then bare switch | switchRequested | switchSyncStatus / switchLastError | switch_1 if present else switch | D-SWITCH-ONLY-LIGHTING: map bare switch in mapTelemetry (this release) |
| Salus IT700 thermostat | heatingSetpoint first, then setPoint (display only) | setpointRequested (number, 5-35 C; app window +/-3 C, cap 25, frost 5) | setpointSyncStatus / setpointLastError | heatingSetpoint only (never setPoint - event-driven, stale for months); numeric +/-0.25 C, ts > dispatchTs | Confirm limit 45 min; label "may take a few minutes"; path unproven (SQ-05) |
| Salus IT500 heating | setPoint (map it; never use currentSetpoint without unit proof) | setpointRequested | setpointSyncStatus / setpointLastError | setPoint (deduced; no live device) | DARK today: show "device not reporting", no control (D-DARK-FLEETS) |
| Bare salus thermostat | same key shape as IT500 | setpointRequested | setpointSyncStatus / setpointLastError | setPoint (deduced) | DARK since ~2 Jun: "device not reporting", no control |
| Salus IT500 hot-water boost | n/a | n/a | n/a | n/a | OUT of scope (D-BOOST / J5): remove button, capture-and-escalate |
| Intesis AC - R10A Modbus (airConditioningProfile, 246) | Temperature, Setpoint, OnOff, Mode, FanSpeed, AlarmStatus (capitalised) | none (non-controllable) | none | none | Read for context only; label "air conditioning - refer via ticket" |
| Intesis AC - vendor-bridged (default profile, 12, vendor_id=intesis) | setPoint, mode, currentTemperature, isOnline | none in R1 (OOHDASH-82) | none observed | none | Capture-and-refer; gate path exists but acceptance unproven |
| boilerControl V1 (148, output1OutputMask) | output1..4 state; output1..4Schedule | none (monitor-only) | none | none | Next-scheduled-change from output1..4Schedule (section 10) |
| boilerControl V2 (74, DHW.use_boiler) | named zones; CHZ1/CHZ2/DHW.override | none (monitor-only) | none | none | Next-scheduled-change from CHZ1.schedule etc. |
| PowerPause circuit | schedules (SHARED_SCOPE JSON) | none in this release | none | none | Next-scheduled-change (section 10) |
| Read-only classes (fridge, cellar, meters, sensors, gateways) | per existing map | denied (three deny layers; CTO cellar directive) | n/a | n/a | No change beyond dropping switchReported from the refrig-guard probe |

**Single source of truth.** This table becomes a per-class contract object in `services/registry.js` (its natural home - `slowEcho` already lives there): each row carries `{ requestedKey, scope: 'SERVER_SCOPE', statusKey, errorKey, confirmKeys[], valueType, compareRule, copyMinutes, confirmLimitMs, lateWatchMs }`. Build reads one object; no key is hard-coded in a flow.

---

## 5. The three-outcome confirmation model (new signals)

Replaces the old `synced` + `*Reported` settle logic (confirm.js) entirely. The single confirm read returns `{ status, statusTs, lastError, telemetryValue, telemetryTs }` for the capability.

**Settle rule (order-independent):**
- **CONFIRMED** = the confirming telemetry key equals the requested value (normalised) AND `telemetryTs > dispatchTs` AND `status !== 'rejected'`. The only success.
- **NON-DELIVERY** = `status === 'rejected'`. Show the translated LastError (section 9); write raw LastError to the ticket.
- **INDETERMINATE (Not confirmed)** = the confirm limit elapsed with neither a confirming reading nor a rejection (status pending/accepted/absent). Keep watching to the late-watch horizon; update the ticket if it lands later.
- **pending / accepted before the limit** = in flight. `accepted` surfaces as "Accepted by the system - waiting for the device", never as success.

**Stale guard.** A status or telemetry value whose own timestamp is at or before `dispatchTs` belongs to a previous command and must be ignored (attribute history is not kept; only latest value + `lastUpdateTs` is visible).

**Per-vendor timing (all configurable without a release):**

| Vendor / model | Operator copy (N) | Confirm limit | Late watch | Basis |
|---|---|---|---|---|
| Tuya (owon and switch-only) | No "minutes" copy; show the live result inline | 10 seconds | 2 minutes | Worst observed ~1.8 s prod |
| Salus IT700 | 5 minutes | 45 minutes | 90 minutes | heatingSetpoint heartbeat median 23.6 min, p90 27 min |
| Salus IT500 | 15 minutes | 35 minutes | 60 minutes | 900 s Arrayent poll; blocked today (dark) |
| Bare salus | 15 minutes | 35 minutes | 60 minutes | Conservative match to IT500 |

The copy figure N feeds the message "sent to the device, should take effect within about N minutes". If a live result arrives before the limit it is shown at once regardless. Replace both hard-coded timers (90 s global, 30 s keep-waiting) with per-class config.

---

## 6. Re-send with the staleness guard (D-RESEND)

The current pre-dispatch 409 compares the Desired value to the request and dead-ends identical requests. Replace it:

- **Judge "already satisfied" from device telemetry, not from Desired.** If the confirming telemetry key already equals the request on a reading timestamped after any prior dispatch, show an honest no-write success ("already at the requested value"). Otherwise, send.
- **Re-fire by writing the Requested key again.** The gate fires on every write (ON_EVERY_MESSAGE, no dedupe) - proven on Tuya, assumed for Salus (SQ-09). Writing the same value again is always safe.
- **Suppress a re-send only on a fresh confirming reading** whose timestamp is at or after the Requested key's `lastUpdateTs` (the pending write). A stale reading (before the Requested write) must never suppress.
- **Never clear-then-set** (empty value = "gate: malformed value").

Per-vendor confirming key for the guard: Tuya switch_1 (or bare switch); IT700 heatingSetpoint (not setPoint); IT500 setPoint. This single change also recovers the four stuck-Desired estate devices (6261, 6832, 1648 IT700; 6237 external lighting): a Requested write re-fires the gate where a Desired write is now ignored.

**Operator surface:** DD-RESEND-UX. A device with an unconfirmed outstanding command shows "Last command sent [time], not confirmed - tap to resend". Recommended operator-initiated only.

---

## 7. Save-and-resume (in-flight persistence, J7)

With Salus now taking tens of minutes, a pod restart can silently drop a result. Persist in-flight actions in Cosmos (reusing the existing action-store design and `OohAuditLog` container pattern).

**Stored action record (container `OohActionInflight`, partition `/storePartition` = "ooh"):**

| Field | Meaning |
|---|---|
| `OohActionId` | unique action id (partition-safe) |
| `OohActionDevice` | device entity name (e.g. gk-6261-salusit700-1) |
| `OohActionCapability` | switch / setpoint / mode |
| `OohActionRequestedValue` | the value written to the Requested key |
| `OohActionDispatchAt` | dispatchTs (ISO) |
| `OohActionConfirmKey` | confirming telemetry key for this class |
| `OohActionConfirmLimitAt` | dispatchTs + confirm limit |
| `OohActionLateWatchUntil` | dispatchTs + late watch |
| `OohActionState` | in-flight / confirmed / non-delivery / indeterminate |
| `OohActionAuditId` | link to OohAuditLog entry |
| `OohActionTicketId` | Zendesk ticket for the outcome note |
| `_etag` | optimistic concurrency |

**Resume-on-load behaviour.** On server start, read all records with `OohActionState = in-flight`. For each, do one confirm read: if terminal, settle it (write the outcome, update the ticket, mark the record); if still in flight and before late-watch, re-arm the watcher; if past late-watch, mark INDETERMINATE and note the ticket. No personal data is stored. LastError text is vendor text; trim to a safe length before it lands on a ticket.

**Silent-running note:** the watcher is event-and-timeout driven, not a poll. It wakes on a confirmation callback or its own deadline, settles, and sleeps. It does no work - and spends no tokens, money or CPU - while idle (see section 13).

---

## 8. Hot-water boost removed -> capture-and-escalate (J5 / D-BOOST)

The boost button posts to the boiler panel, which the server always refuses with 422 (the panel is not on the Desired contract; the only passing test uses a fixture device the real estate never emits). It is a dishonest offer.

**Design:** remove the boost chip and the "controllable" tag from the hot-water flow (flows.js hot-water branch). Replace with a capture-and-escalate card: a short "no hot water" summary, the existing site boiler guidance, and a "Log and escalate to IoT team" action that writes a Zendesk outcome ticket and routes it to the IoT team - the same capture path the kitchen and aircon flows already use. The operator still has a real next step; the caller still gets help. (Mockup: "Hot-water boost (removed)" scenario.)

---

## 9. Error translation (humane copy, J9)

Raw gate/vendor strings never reach the operator on screen; the raw text goes to the ticket. On-screen is a plain sentence. Full map:

| Raw LastError (prefix) | On-screen (operator) | Internal handling |
|---|---|---|
| gate: device offline | "The device is not responding - this may be temporary. Try again in a few minutes, or raise a ticket if it persists." | Shown as NOT DELIVERED; raw text to ticket |
| gate: malformed value | "Something went wrong sending that - we have logged it." | Dashboard bug: log internally, generic failure, no gate string shown |
| gate: no freshness keys for profile | "We cannot confirm changes on this device type right now." | NOT DELIVERED; raw to ticket; flag for IoT |
| gate: internal fault | "Something went wrong on our end - please try again; contact support if it persists." | NOT DELIVERED; raw to ticket |
| vendor: No active Tuya session owns device | "Could not reach the device right now - try again in a moment." | Transient; retry prompt; raw to ticket |
| vendor: (other) | "The device provider could not complete the change - try again, or raise a ticket." | NOT DELIVERED; raw to ticket |
| (pending past limit, no error) | "We sent the command but the device hasn't confirmed it yet. It may still take effect - check again in a few minutes, or raise a ticket if it does not respond." | INDETERMINATE; keep watching |

Rule: never show a "gate:" or "vendor:" string on screen; always keep the raw text on the ticket so the IoT team can diagnose.

---

## 10. Next scheduled change (D-SCHED-RELEASE; SQ-13 assumptions flagged)

In scope for boiler panels and PowerPause circuits, read-only, decoded from SHARED_SCOPE JSON. A pure function of the JSON plus the site's Europe/London timezone computes the next change.

**Shape (observed):** `{"schedule":[{"value":22,"time":"11:00","loops":"1111111","timer_id":"..."}]}`. Keys: V1 boiler `output1..4Schedule`; V2 boiler `CHZ1.schedule`, `DHW.schedule` etc.; PowerPause `schedules`.

**Every assumption is a flagged SQ-13 dependency (do not treat as proven):**
- ASSUMPTION A (SQ-13a): `time` is HH:MM in Europe/London. If Spencer says UTC, one config flip.
- ASSUMPTION B (SQ-13a): `loops` is a 7-char day mask; **day order unconfirmed** (Mon-first vs Sun-first). The decoder is written so the order is a single constant.
- ASSUMPTION C (SQ-13a): `value` is a setpoint in C (heating) / a 0/1/2 state (PowerPause: 0 OFF, 1 ON, 2 IDLE_OFF).
- ASSUMPTION D (SQ-13a): SHARED_SCOPE `schedules` is authoritative; CLIENT_SCOPE is a device echo.
- ASSUMPTION E (SQ-13a): empty/absent `schedules` = "no schedule set".

**Not decoded (indicator only):** Tuya schedule/cycle_time blobs (SQ-13b - no verified byte map) and Salus IT700 heatSchedule hex (SQ-13c - show scheduleEnable + holdType: "following its programme" / "overridden"). **Not visible from ThingsBoard:** IT500 and Intesis (SQ-13d - vendor cloud only) show "schedule not visible from this system".

**DD-SCHED-DISPLAY** asks whether to show decoded next-change now (caveated) or an indicator-only until SQ-13 is confirmed. Recommended: show decoded for boiler/PowerPause now, labelled "based on the device's stored schedule", with a safe fallback when a parse is ambiguous.

---

## 11. Flow-by-flow impact

Shared plumbing changes once (sections 3-6); each flow then consumes it. Current behaviour and the touch points below are drawn from the matrix impact pass and reconciled against the code.

**Shared plumbing (one-time):** replace the Desired-write path with the Requested write to SERVER_SCOPE; replace the two-timeseries confirm read with the one attribute+telemetry read; replace the `synced`+`*Reported` settle with the three-outcome rule; replace the Desired-comparison 409 with a telemetry-based pre-dispatch check; replace hard-coded 90 s / 30 s / 600 s timers with per-class config; drop `switchReported` from `pickSwitch` and `hasSwitchSignal`; map bare `switch` in `mapTelemetry`; rewrite the fixture simulator to model pending / accepted / rejected+LastError / echo-before-accepted / telemetry-confirm.

| Flow | Current behaviour | What the contract now enables / requires | Design touch points |
|---|---|---|---|
| Heating (Salus IT700 / IT500 / bare) | area-first; representative device = coldest online; up/down window +/-3 C cap 25, frost 5; confirm on old setpointSyncStatus+setpointReported, 90 s | Same change, but confirm from heatingSetpoint (IT700); operator released at once ("should take effect within about 5 minutes"); Salus still unproven; minutes-long watch persisted | Salus limit + copy; accepted-phase copy; honest "not yet confirmed" ticket wording; save-and-resume; frost-hold revert under new rule |
| Hot water | boost chip offered when dhwControllable; dispatch always 422 | Boost cannot dispatch; remove it | Remove chip + "controllable" tag; capture-and-escalate card (section 8) |
| External lighting | switch buttons use switch_1; confirm on old switch keys; gk-6237 etc. show no state today | Live and fast; map bare switch so state displays; confirm = switch_1/switch; short limit = near-instant pop-up | Display read order; bare-switch map; 409 dead-end fix; Tuya 10 s limit |
| Extractor fan | same switch plumbing as lighting | As lighting | As lighting |
| Kitchen | reads online only; no control (CTO); ends in P1/capture | No change | None (note only) |
| Connectivity | anchor-based diagnosis; no control | No change; optional anchor pre-warn before a Salus command | Optional anchor pre-check (defer) |
| Aircon / fridge / others | aircon capture-and-refer; fridge monitor-only; refrigeration deny in three layers | No change; relabel both Intesis populations "air conditioning - refer via ticket"; drop switchReported from refrig-guard probe | Label only |
| Timed hold + revert | 30 s worker; revert writes Desired; confirm needs old synced+reported; timeout = revert-failed + alert | Every revert currently false-alerts; must use per-class confirm rule and limit; a Salus revert takes minutes | Revert confirm rule + limit; alert wording; optional operator pop-up |

**Verified current code anchors (where Build changes land):**
- Write: `services/control.js:122` calls `tb.writeSharedAttribute(device, attribute, value)` -> SHARED_SCOPE. The attribute names come from `registry.validateCommand` return values (`registry.js:114` setpoint, `:118` frost, `:133` switch, `:149` hwboost) - all currently `*Desired`; change these to `*Requested` and the write target to SERVER_SCOPE.
- Confirm read: `tb.readControlState` (`tb-client.js:304-322`) reads `*SyncStatus` + `*Reported` from **time-series**; rewrite to read `*SyncStatus` + `*LastError` from SERVER_SCOPE attributes plus the confirming telemetry key. The `ATTRIBUTE_FAMILY` map (`tb-client.js:15-20`) is the old contract and must be replaced.
- Pre-dispatch: `tb.readDesiredState` (`tb-client.js:329-335`) + `confirm.classifyPreDispatch` (`confirm.js:67-80`) + the duplicate-pending 409 (`control.js:112-118`) implement the Desired-comparison dead-end; replace with the telemetry-based check (section 6).
- Settle: `confirm.isSettled` / `isFreshTerminal` (`confirm.js:38-54`) encode `synced` + `*Reported`; replace with the three-outcome rule.
- Switch display: `pickSwitch` (`tb-device.js:606-611`, order switchReported/switchOn/switch_1) and `hasSwitchSignal` (`:347-350`); drop switchReported, and add bare `switch` to `mapTelemetry` (`:574-596`, which today maps neither bare switch nor IT500 setPoint).
- Timers: `config.js` `syncTimeoutMs` 90000 (`:121`), `lateSyncWatchMs` 600000 (`:122`), `midWaitPromptMs` 30000 (`:127`); hard-coded `extendWait` 30000 (`control.js:241`); `overrides.js` `REVERT_CONFIRM_TIMEOUT_MS` 90000 (`:27`), worker 30 s (`:26`). Replace all with per-class config.
- Fixture sim (`tb-client.js:186-353`) models old SHARED_SCOPE edge-triggered behaviour; rebuild for SERVER_SCOPE Requested + the new confirm read.

---

## 12. Data dictionary additions

Extends docs/project/DATA_DICTIONARY.md. All app-owned fields keep the `Ooh` context prefix.

**Per-class control contract (in `services/registry.js`, not a data store):** `requestedKey`, `scope` (always SERVER_SCOPE for writes), `statusKey`, `errorKey`, `confirmKeys[]`, `valueType` (bool/number/string), `compareRule` (normalised-string / numeric-0.25), `copyMinutes`, `confirmLimitMs`, `lateWatchMs`.

**New Cosmos container `OohActionInflight`** - fields as section 7. Durable, partition `/storePartition` = "ooh", AAD/workload identity.

**ThingsBoard keys consumed (not owned), canonical names and scope:**

| Name | Scope | Type | Meaning |
|---|---|---|---|
| switchRequested / setpointRequested / modeRequested | SERVER_SCOPE | attribute | the dashboard's command input to the gate |
| switchSyncStatus / setpointSyncStatus / modeSyncStatus | SERVER_SCOPE | attribute | pending -> accepted / rejected |
| switchLastError / setpointLastError / modeLastError | SERVER_SCOPE | attribute | rejection reason, prefix "gate:" or "vendor:" |
| switchDesired / setpointDesired | SHARED_SCOPE | attribute | written by the gate, not the dashboard (retained for read context only) |
| switch_1 / switch | telemetry | string | Tuya confirming reading (switch_1 preferred; bare switch fallback) |
| heatingSetpoint | telemetry | number | IT700 confirming reading (never setPoint) |
| setPoint | telemetry | number | IT500 confirming reading (deduced) |
| output1..4Schedule / CHZ1.schedule / DHW.schedule / schedules | SHARED_SCOPE | JSON | schedule source for next-change (SQ-13) |

**Retired keys (remove from code):** `switchReported`, `setpointReported`, old `*SyncStatus` time-series, `synced` / `failed` domain values.

---

## 13. Cost and silent-running

**Token and money.** No new subscription, no per-call API fee, no new LLM tokens. Commands are on-demand writes/reads over the existing ThingsBoard connection with existing credentials. The confirm read is a handful of attribute/telemetry GETs per command. Bounded by operator actions (a handful per night), so cost does not scale unbounded with usage. Schedule reads are on-demand per device view.

**Silent running.** No new always-on process. The confirmation watcher is event-and-timeout driven: it arms a single timer at `confirmLimitAt` / `lateWatchUntil`, wakes only when a confirmation arrives or the timer fires, settles, and sleeps. While idle it spends no tokens, no money and no CPU, and shows nothing on any screen - no console window, no notification, no CLI line-item. The only standing process is the existing 30-second override revert worker, which already runs and whose nature is unchanged (this work only swaps its settle rule). The save-and-resume store wakes a watcher only for genuinely in-flight actions on restart, then idles.

**Verdict:** neither criterion is compromised; there is nothing to disclose.

---

## 14. Test strategy, scripts and test data

The e2e (Playwright) suite is a required check on main, alongside unit tests. Run via `npm run test:unit` (`node --experimental-test-module-mocks --test "test/*.test.js"`) and `npm test` (`npx playwright test`). This design hands Build and Tester concrete assets.

**Unit tests (node:test) - rewrite to the new contract.** The old-contract suites carry roughly 60+ assertions on `*Desired`/`*Reported`/`*SyncStatus` names and the SHARED_SCOPE/timeseries endpoints: control-plane.test.js (~29, incl. a source-level anti-drift assertion at control-plane.test.js:323-330 that `readControlState` contains `/values/timeseries` and NOT `/values/attributes` - this assertion must be inverted to the new SERVER_SCOPE confirm read), tb-classify.test.js (~20), bare-salus-classify.test.js (8, setpointDesired), gateway-classify.test.js (2), refrigeration-deny.test.js (1), late-sync-alert.test.js (1), confirm-loop-timing.test.js (0 - config/UX only). Retarget all and add:
- `writeRequested` writes to SERVER_SCOPE, never Desired; records dispatchTs.
- Settle rule: CONFIRMED only when telemetry matches with ts > dispatchTs and status not rejected; echo-before-accepted still confirms.
- Stale guard: status/telemetry at or before dispatchTs ignored.
- Pre-dispatch: telemetry-satisfied = honest no-write success; telemetry-differs = send (no 409 dead-end).
- mapTelemetry maps bare switch when switch_1 absent; prefers switch_1 when both present; pickSwitch no longer reads switchReported.
- IT700 confirms on heatingSetpoint, never setPoint; numeric +/-0.25 C.
- Per-class limits read from config, not hard-coded.
- Error translation map: each raw prefix -> correct on-screen copy + raw-to-ticket.
- Boost device types all refused -> capture-and-escalate (no dead button).
- Dark-fleet classification -> "device not reporting", no control.
- Schedule decoder: next-change from sample JSON; day-order constant; safe fallback on ambiguous parse.
- Save-and-resume: in-flight record settles correctly on resume for terminal / still-in-flight / past-late-watch.

**End-to-end (Playwright) scripts - the twelve critical journeys:**
1. Tuya switch OFF then ON: accepted then telemetry match, confirmed within the Tuya limit.
2. Echo before accepted: still confirmed, no flicker to not-confirmed.
3. Rejected with LastError: NOT DELIVERED with the plain sentence; raw text on the ticket.
4. Accepted, no telemetry match by the limit: NOT CONFIRMED (never success).
5. pending only by the limit: NOT CONFIRMED.
6. Desired already equals request while device differs: operator not dead-ended; resend works.
7. Device already at requested value: honest no-write success.
8. Salus setpoint, minutes-long limit: operator released at once; result pops up later; a late result after the limit lands on the ticket.
9. Pod restart mid-watch: result still lands (save-and-resume).
10. Timed hold revert under the new rule: success does not raise a false revert-failed alert.
11. Hot-water flow: no "controllable" tag, no dead boost chip; capture-and-escalate present.
12. Bare-switch device (gk-6237): state displays and confirms on switch.

**Test data (fixtures).** Realistic, real-shaped names and values - no Lorem/Test. New/updated `data/fixtures` entries:
- Tuya light `gk-6237-externallighting-1` (bare switch), owon `ag-brackley-poweroutlet-6` (switch_1), fan `gk-6261-extractfan-1`.
- IT700 `gk-6261-salusit700-1` (heatingSetpoint 16.5, setpointDesired 19 stuck), IT700 `gk-6832-salusit700-1`.
- Dark IT500 `gk-5795-salusit500-r1` (no telemetry 12+ days), bare-salus `gk-wingfieldfarm-salus-1` (dark ~134 days).
- Boiler V1 `gk-6780-boilercontrol-1` (output2Schedule sample), V2 `gk-6261-boilercontrol-1`.
- Sim modes for each outcome: pending, accepted, rejected+gateLastError, rejected+vendorLastError, echo-before-accepted, telemetry-confirm, never-confirms.
- Remove the fictitious `IT500-DHW-6234` boost fixture that masked the dead boost path.

---

## 15. J8 admission test (go-live precondition; read-only until approved)

Item 12 of the brief and DD-J8-TEST. One James-approved live command proves the full new path in production before the dashboard routes real commands. **Read-only until James explicitly approves the specific command.** Blocked until both SEC-1 and SEC-2 rotations are confirmed in writing (D-SEC-ROTATE).

**Recommended test:**
- **Device:** `ag-brackley-poweroutlet-6` (Spencer's own proven 10 Oct Tuya device; already commanded in prod; lowest blast radius).
- **Command:** write `switchRequested = false` (OFF), observe, then `switchRequested = true` (ON) to restore.
- **Expected trace per command:** SERVER_SCOPE `switchRequested` write -> `switchSyncStatus = pending` -> gate rewrites `switchDesired` + doorbell -> `switchSyncStatus = accepted`, `switchLastError = ""` -> `switch_1` telemetry flips with ts > dispatchTs -> dashboard shows CONFIRMED within the 10 s limit.
- **Pass criteria:** both OFF and ON reach CONFIRMED; the captured trace shows pending then accepted then telemetry match; no Desired write originates from the dashboard; device restored to ON.
- **Capture:** one full attribute/telemetry timeline screenshot/log attached to the go-live record.

A Salus admission test is desirable but gated on SQ-05/SQ-06/SQ-07; the recommendation is to go live on the proven Tuya path and add a Salus live proof when Spencer confirms the Salus path works.

---

## 16. CX mapping - how the design realises the discovery criteria

| Discovery criterion | How this design delivers it | Where to see it |
|---|---|---|
| Persona: lone handler, caller on the line, 02:00 | Fast outcomes inline; slow outcomes release the handler at once with an honest promise and a later result | Mockup: Tuya "Confirmed" vs Salus "Accepted, waiting" + toast |
| Journey: find -> understand -> fix -> tell the caller | Three honest outcomes + ticket note give the handler something true to tell the caller every time | Mockup: ticket-note block on every outcome |
| Reassurance: heating change (high stakes, slow) | "should take effect within about 5 minutes", background watch, later toast + ticket; never "failed", never silent | Section 5; mockup Salus scenarios |
| Reassurance: revert / unseen device | Revert uses the same confirm rule - no false revert-failed alarm; unseen devices confirmed by their own reading | Section 11 timed-hold row |
| Friction: fast Tuya switch | No 90 s wait (10 s limit); no blocked re-send; no needless decision | Section 5-6; mockup Tuya "Confirmed" |
| "Great looks like": honest feedback | Only the device's own reading shows success; accepted never shown as success | Section 5; mockup "Accepted" rationale |
| "Great looks like": no dishonest offers | Boost removed; dark/offline devices show "device not reporting" with capture-and-escalate | Sections 8-9; mockup "boost" and "offline" |
| "Great looks like": humane errors | Plain sentence on screen, raw text on ticket | Section 9; mockup "rejected" |

---

## 17. Handoff to Build

- **This design doc** is the contract for what to build; the per-class map (section 4) and the three-outcome rule (section 5) are load-bearing and must not be flattened.
- **The mockup** (OOH_ROSETTA_STONE_STATES_MOCKUP_2026-10-14.html) is the visual and behavioural reference for every outcome state.
- **The data dictionary additions** (section 12) are the naming standard; a key means one thing everywhere.
- **The test scripts and data** (section 14) are what the tester runs for full e2e verification post-build.
- **Open flags for Build:** write Requested only (SQ-01 default); Salus path unproven until SQ-05; IT500/bare-salus dark; the four SQ-13 schedule assumptions are flagged defaults, not proven; the J8 live test is a go-live gate; D-SEC-ROTATE and D-ADMISSION-MODEL must be on record before J8.
- **Decisions for James at this gate:** DD-J8-TEST, DD-SCHED-DISPLAY, DD-RESEND-UX, DD-WAIT-HANDOFF (header). The orchestrator acts only on James's recorded selections.
