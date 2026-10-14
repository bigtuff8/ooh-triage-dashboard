<!-- gate:contract
SECTION: What this addendum is
James approved the Rosetta Stone discovery gate (PR #86, 2026-10-14) and then directed maximum research before Design starts. Eight Sonnet sub-agents ran read-only ThingsBoard checks and searched Jira, SharePoint and Teams across all thirteen Spencer questions from the matrix (S1 to S12) plus a new question on schedules (S13) and a full estate sweep of 5,140 command-capable devices. All nine research streams are back. This addendum consolidates their findings into the gate artefact, updates the per-question verdicts, records six new findings that were not in the approved gate, and lists the Spencer questions we are holding as a draft until everything is aggregated and confirmed (James's directive: nothing sent to Spencer until fully investigated). It also adds nine decisions that are yours before Design can start.

SECTION: Security exposure — OPEN, rotation unconfirmed, deadline 2026-10-21
Two live credentials were found during research (SQ-SEC-1 and SQ-SEC-2). Spencer was notified by James on 2026-10-14. Notification is not the same as rotation confirmed: both credentials are still live and readable. Status is OPEN. Spencer must confirm rotation of both credentials in writing by 2026-10-21 (five business days from notification). If no written confirmation is received by that date, James escalates to the delivery manager and the J8 admission test is blocked until both rotations are confirmed. This decision is tracked as D-SEC-ROTATE in section 8 below, where it remains open until Spencer's written confirmation is recorded.

SECTION: Gate admission model — separate open decision (D-ADMISSION-MODEL)
Rotating the doorbell credential (SQ-SEC-1) does not fix the admission model. The IoT Command Gate has no per-caller authorisation check: any identity with the RBAC grant on svc-control can write a Requested key to SERVER_SCOPE on an OOH-profiled device and be admitted by the gate, regardless of who is calling. This is a distinct architectural risk and is tracked as its own open decision D-ADMISSION-MODEL in section 8. It must be explicitly accepted or resolved before the dashboard routes real commands, and its status does not change when the credentials are rotated.

SECTION: The headline change the research made
The most important finding is a new contradiction in the write path. To command a device through the production IoT Command Gate, the caller must write a Requested key to SERVER_SCOPE: switchRequested, setpointRequested, modeRequested or hwBoostHoursRequested. The gate then validates the request, writes pending, rewrites Desired, and rings the bridge doorbell. Our current dashboard code writes the Desired key directly, bypassing the gate entirely. That means no pending marker, no offline check, no doorbell ring, and possibly no dispatch at all on Tuya devices. Every CONTRADICTION row in the original gate doc affects a different part of the confirmation logic; this contradiction affects the dispatch itself. It is the first change Build must make.

SECTION: S1 to S13 in one line each
The full table is in the document body below. Nine questions are PROVEN, three are DEDUCED, and one (S6, Salus timing figures) is UNRESOLVED because Spencer has not published a measured number yet.

SECTION: Six findings not in the approved matrix
One: the command write is Requested not Desired (proven from the live rule chain). Two: live external-lighting devices at three Brackley-type sites report state as the bare switch key, not switch_1; our mapTelemetry maps neither, so those units show no on/off state today. Three: there are two different Intesis populations in ThingsBoard: 246 devices on the airConditioningProfile are R10A Modbus air-con (not bridge-controlled Intesis), and 12 vendor-bridged Intesis devices sit on the default profile with vendor identifiers. gk-birchwoodfarm-ac-1, which was used as Intesis read evidence, is R10A Modbus. Four: V1 boiler panels are the majority of the boiler fleet (148 of 222), not absent; the approved matrix used a three-device sample that missed them. Five: both the IT500 fleet (347 devices) and the bare-salus fleet (384 devices) are completely dark in production, with no telemetry since at least 12 October and 2 June respectively. Six: Tuya devices report on a 30 to 44 minute heartbeat cycle, which means the gate's 45-minute freshness window causes roughly 1.6 percent of healthy Tuya devices to be falsely rejected on an off command.

SECTION: Per-vendor timing
The approved gate held one provisional figure (10 minutes for Salus). The research shows this needs to be split into two separate operator-facing numbers per vendor: N (what we promise the operator in copy) and the confirm limit (when we stop calling it still waiting and write not confirmed). This split is the recommendation in the addendum body. Tuya is unchanged at 10 seconds. For Salus IT700 the copy figure is 5 minutes and the confirm limit is 45 minutes (the IT700 heatingSetpoint heartbeat runs at 20 to 30 minutes, so 10 minutes would false-fail most Salus changes). IT500 uses a copy of 15 minutes and a confirm limit of 35 minutes, based on the 15-minute Arrayent poll cycle, but IT500 is also completely dark in production today and would be rejected by the gate as device offline before a timing question arises.

SECTION: A contradiction between research streams on direct Desired writes
S4 and S5 research found that a direct Desired write may still dispatch through the bridge for Salus and Intesis (medium confidence), because the bridge subscribes to shared attribute changes and the CIR contract describes that path. S7 research found that a direct Desired write to a Salus device on 12 October produced no pending at all, suggesting the bridge ignores it under the new regime (medium confidence). These two findings conflict. The safe interpretation is that a direct Desired write is an unsupported path under the new contract for all device types, and Build must write Requested. The unresolved gap (whether Salus and Intesis still partly act on a direct Desired) does not change what the dashboard should do; it changes only what happens to the four existing stuck devices on the estate. That is a Spencer question in the held list.

SECTION: Questions for Spencer (HELD until James releases them)
Twelve operational questions are listed in the document body. The two security items have been removed from this list and escalated separately (section 2). Nothing on this list has been sent to Spencer yet. James's directive is that nothing goes until everything is aggregated, confirmed and fully investigated. The full consolidated list is ready in section 6 of this document.

SECTION: Decisions for you before Design starts
Nine decisions remain. The two security decisions are both open: D-SEC-ROTATE (rotation of the two live credentials, deadline 2026-10-21, owner Spencer, chased by James) and D-ADMISSION-MODEL (acceptance of the implicit no-per-caller-authz gate admission model as its own distinct risk). These are separate: rotating the credentials does not close the admission model question. The decisions that most directly gate Design work: the dashboard offline threshold (3 hours as a configurable default is recommended), the split between the operator-facing copy figure and the confirm limit for Salus, and whether to pull the switch-only mapping fix forward. The dark-fleet and schedule questions are lower priority but Design needs a steer before it lays out the device cards.

DECISION: D-SEC-ROTATE: Are both credentials rotated and is rotation confirmed in writing by 2026-10-21? | Spencer confirms rotation of SQ-SEC-1 and SQ-SEC-2 in writing by 2026-10-21; James records confirmation in the consolidated Spencer set; D-SEC-ROTATE closes | Rotation is not confirmed by 2026-10-21: James escalates to delivery manager; J8 admission test is blocked until both rotations are written-confirmed; status remains OPEN

DECISION: D-ADMISSION-MODEL: Is the implicit gate admission model (profile routing + RBAC on svc-control, no per-caller identity check) explicitly accepted as the R1 control? | Accept the implicit model for R1 on the basis that RBAC controls the svc-control identity and profile routing restricts which devices are reachable; document as an explicit accepted risk with an owner | Require a per-caller identity check in the gate before R1 routes any real commands; scope and cost this as a gate-side change with Spencer

DECISION: What is the dashboard offline threshold for controllable devices? | 3 hours as the configurable default: the estate data shows a cliff between 3 hours and 48 hours; no live Tuya or IT700 device falls in that gap; all thresholds configurable per device class, not hard-coded | Keep the current code rule of 48 hours; revisit when more estate sweep data is available

DECISION: How should the operator-facing copy figure (the N in "should take effect within about N minutes") be set relative to the confirm limit? | Split them: IT700 copy 5 minutes, confirm limit 45 minutes; IT500 copy 15 minutes, confirm limit 35 minutes; all configurable | Use the same single figure for both copy and limit, as the gate doc's 10-minute provisional

DECISION: Does "next scheduled change" for boiler panels and PowerPause circuits enter this release? | A follow-up ticket, because the Design scope is already large | Pull it into this release alongside the control re-plumbing

DECISION: Is the switch-only mapping fix (adding the bare switch key as a fallback in mapTelemetry) pulled forward as a quick fix ahead of Design? | Yes, a quick fix now: it is a one-line change to mapTelemetry and it fixes a live display gap independent of the control re-plumbing | It waits for the main Design and Build phase

DECISION: How should the dashboard display the dark IT500 and bare-salus fleets (347 and 384 devices, none reporting for at least 12 days)? | Show them as offline with a neutral explanation: "device not reporting"; offer no control | Hide them from the device list until they resume reporting
-->

# OOHDASH-123 Rosetta Stone: Discovery Addendum

**Ticket:** OOHDASH-123 · **Stage:** Discovery addendum · **Date:** 2026-10-14
**Base:** main a9e34ec (PR #86 merged, gate approved 2026-10-14)
**Companion:** docs/project/OOH_ROSETTA_STONE_MATRIX_2026-10-14.md (matrix updated in this commit)
**Research inputs:** docs/project/oohdash-123-research/ (nine files, secret-scanned; originals at C:/harness-runs/iot-ooh-dash/research/)

---

## 0. Handling of this document

This document names two locations where live credentials can be read by any identity at our access level. Their values are not reproduced anywhere here. The two locations are described structurally only:

- The IoT Command Gate rule chain metadata, accessible via the ThingsBoard rule chain API (SQ-SEC-1).
- The SERVER_SCOPE attributes of gk-st-office-intesis-1, accessible via the ThingsBoard attributes API (SQ-SEC-2).

This repository is private. The exposure described in this document is time-boxed to completion of the rotation actions in D-SEC-ROTATE. Once rotation is confirmed in writing, this document remains as a historical record of the risk and its resolution.

---

## 2. Security exposure — OPEN (Spencer notified 2026-10-14; rotation unconfirmed)

> **⚠ Status: OPEN. Spencer was notified on 2026-10-14. Notification is not rotation confirmed. Both credentials remain live and readable. Deadline: written confirmation of both rotations by 2026-10-21. No escalation or deadline existed previously; this addendum creates them.**

Two live credentials were found during research, plus a gate-design fact that compounds them. None of the credential values are reproduced in this document. Both items were reported to Spencer (config owner) by James on 2026-10-14. The prior version of this artefact labelled these "resolved by notification." That label was incorrect: a notification that something needs rotating is not a rotation. Both SQ-SEC-1 and SQ-SEC-2 are reclassified as **OPEN** until Spencer provides written confirmation that each credential has been rotated.

**Why this matters now.** Any team-access identity can today: (a) read the SQ-SEC-1 credential from the rule chain API using their existing access level, (b) use their own RBAC grant on svc-control to write a Requested key to SERVER_SCOPE on any OOH-profiled device, and (c) route a real command to a heating or lighting device through the production gate. No human has reported doing this; but the path is open and requires no special privilege beyond what any team member holds.

**Combined blast radius (for the audit record)**

The IoT Command Gate has no per-caller authorisation check (S5, PROVEN — see D-ADMISSION-MODEL, section 8, for that risk as a separate decision). Any identity that can write a Requested key to SERVER_SCOPE on an OOH-profiled device is admitted to the gate; the gate does not verify who is calling. SQ-SEC-1 exposes a credential that controls the gate's dispatch mechanism. Combined, any identity at our access level could read that credential, use their own RBAC grant to write a Requested key, and inject a real command into a heating or lighting device through the production gate. This blast radius is stated and owned by Spencer as gate owner.

**Note:** The admission model (no per-caller check) is a separate risk that persists even after the credentials are rotated. It is tracked independently as D-ADMISSION-MODEL below and must not be conflated with the rotation actions.

**SQ-SEC-1 — Plaintext credential in Command Gate rule chain metadata**

The IoT Command Gate rule chain contains a request-header credential in its metadata configuration readable via the ThingsBoard rule chain API by any identity holding team-level access. Reported to Spencer 2026-10-14. **Status: OPEN — rotation unconfirmed.**

**SQ-SEC-2 — Vendor token on gk-st-office-intesis-1 in SERVER_SCOPE**

A SERVER_SCOPE attribute whose name indicates a vendor access token exists on the legacy Intesis entity gk-st-office-intesis-1, retrievable over a plain GET by our tenant-admin identity. Reported to Spencer 2026-10-14. **Status: OPEN — rotation unconfirmed.**

**Deadline and escalation path**

| Item | Owner | Deadline | Escalation if missed |
|---|---|---|---|
| Rotate SQ-SEC-1 (doorbell credential in rule chain metadata) | Spencer | 2026-10-21 | James escalates to delivery manager; J8 admission test blocked |
| Rotate SQ-SEC-2 (vendor token on gk-st-office-intesis-1) | Spencer | 2026-10-21 | James escalates to delivery manager; J8 admission test blocked |
| Provide written confirmation of both rotations | Spencer | 2026-10-21 | As above; D-SEC-ROTATE remains OPEN |

**What "confirmed" means.** Spencer's written acknowledgement in the consolidated Spencer set that both credentials have been rotated, naming the credential type and the rotation date. A verbal acknowledgement or "on my list" reply does not close D-SEC-ROTATE. The J8 admission test — the gate before the dashboard routes real commands — is conditional on that written confirmation being on record.

**Compliance note.** Spencer's written rotation confirmation in the consolidated Spencer set satisfies the independent-acknowledgement ask once received. Until then, the compliance gate is not met.

---

## 1. The headline: the command write path is wrong

The research found that to send a command through the production IoT Command Gate, the caller writes a Requested key to SERVER_SCOPE, not the Desired key. The gate then writes pending, rewrites Desired to SHARED_SCOPE, and rings the bridge doorbell. Our dashboard code (services/registry.js lines 114, 118, 133, 141, 149; services/tb-client.js lines 16 to 19) writes Desired directly and bypasses the gate.

Consequences of the bypass:

- No pending write happens, so the dashboard never sees a pending-then-accepted sequence.
- The gate's offline check (fresh telemetry in the last 45 minutes) is skipped. An offline device may receive a write.
- The doorbell is not rung. On Tuya devices the bridge likely does not dispatch at all (the doorbell is the only dispatch trigger for Tuya under the new bridge). On Salus and Intesis devices the bridge may still act through its shared-attribute subscription, but that is contested (see section 5).
- The stuck-Desired problem on devices such as gk-6261-salusit700-1 (setpointDesired 19 since 24 September) will persist: a new Desired write of 19 produces no ATTRIBUTES_UPDATED event and re-fires nothing. Writing setpointRequested = 19 re-fires the gate on every attempt regardless of the existing Desired value (PROVEN: the gate uses ON_EVERY_MESSAGE with updateAttributesOnlyOnValueChange false).

**Build must write `<cap>Requested` to SERVER_SCOPE.** The pre-dispatch 409 block (which checks whether Desired equals the request) must also move to comparing the device's own telemetry reading against the requested value, not comparing Desired.

---

## 3. Per-question verdicts S1 to S13

| # | Question (short form) | Verdict | One-line answer |
|---|---|---|---|
| S1 | Salus status/error key names | DEDUCED | Gate writes setpointSyncStatus / setpointLastError / modeSyncStatus / modeLastError as SERVER_SCOPE attributes (PROVEN from rule chain); bridge writing them for Salus is DEDUCED (never observed); boost key is a contradiction (gate stem hwBoostHours* vs SD-598 spec stem hwBoost*, hold boost out of scope per J5). |
| S2 | Is pending a distinct first write? | PROVEN | Yes: gate writes pending, bridge writes the final accepted or rejected; they are two separate REST attribute writes to SERVER_SCOPE; pending is visible for only 0.3 to 1 second on Tuya (RESEARCH-S2-S3.md). |
| S3 | What is switchRequested? | PROVEN | switchRequested (and each cap-prefixed Requested key) is the caller's input to the gate, written to SERVER_SCOPE; the gate reads it and writes Desired and pending; the dashboard should write Requested, not Desired (RESEARCH-S2-S3.md). |
| S4 | How does the gate refuse? | PROVEN | Four rejected-plus-LastError cases (malformed value, device offline, no freshness keys for profile, internal fault) and three silent cases (key not Requested, multiple Requested keys in one write, doorbell failure leaves pending forever) (RESEARCH-S4-S5.md). |
| S5 | Does the gate admit svc-control? | PROVEN — explicit acceptance required | No caller check exists in the chain; admission is implicit via profile routing (4 OOH profiles reach the gate) and the SHARED_SCOPE RBAC on the identity; svc-control already appears in every audit-log entry for switchRequested (RESEARCH-S4-S5.md). **The admission model is a separate open risk tracked as D-ADMISSION-MODEL; rotating the credentials does not resolve it.** |
| S6 | Salus time limit; any Salus accepted since 10 Oct? | UNRESOLVED | No measured figure from Spencer; no Salus setpoint or mode command has reached accepted under the new contract anywhere we can read; the data supports IT700 copy 5 min / limit 45 min and IT500 copy 15 min / limit 35 min (DEDUCED from polling cadences) but the figure is UNRESOLVED (RESEARCH-S6.md). |
| S7 | Re-send when Desired already matches the request | PROVEN | Write the same Requested value again; the gate fires on every write regardless of value equality (proven on Tuya audit: identical switchRequested produces a new vendor result each time); clear-then-set is pointless and partially harmful (empty value rejected as malformed) (RESEARCH-S7.md). |
| S8 | Which telemetry key confirms a Salus setpoint? | DEDUCED | IT700: heatingSetpoint (PROVEN; setPoint is event-driven and can be stale for months; never use for confirmation); IT500: setPoint by deduction (no live IT500 exists in prod, so unproven); boost confirming key: hotWaterBoostHoursRemaining (DEDUCED, hold boost out of scope) (RESEARCH-S1-S8.md). |
| S9 | Do tongou devices report as switch rather than switch_1? | PROVEN | The sampled tongou fleet (44 devices) all use switch_1, not switch; however a separate population of 18 devices (profile tuya Profile, tuyaDeviceType unclear) uses switch including live external-lighting units gk-6237, gk-6186 and gk-6099; mapTelemetry maps neither switch (RESEARCH-S9-S11.md). |
| S10 | Is switch_2 addressable? | PROVEN | The gate capability map has exactly four keys; switch_2Requested is not one of them; four two-gang Brackley refrigeration devices (all denied by OOH policy) carry switch_2; no customer-facing multi-gang lighting device was found (RESEARCH-S9-S11.md). |
| S11 | Does the gate need a string or is a JSON boolean fine? | PROVEN | JSON boolean is fine; the gate TBEL stringifies the value before use; our switch_1 telemetry and Desired attributes are stored as strings so confirmation must compare normalised lowercase strings (RESEARCH-S9-S11.md). |
| S12 | Does Intesis or the boiler panel write any status? | DEDUCED | Boiler panel: PROVEN no (not routed to the gate; no adapter; no status attribute on any of 223 boilerControl devices). Intesis: the gate path exists for the 12 vendor-bridged Intesis entities (profile default, vendor_id intesis) because they route via Root Rule Chain to the gate; whether the bridge writes accepted is DEDUCED (unproven, never commanded under new contract) (RESEARCH-S12-Q7.md). |
| S13 | Can the dashboard read device schedules? | PROVEN | Schedules are not credentials; boiler panel SHARED_SCOPE schedule attributes are readable as JSON today; PowerPause circuit SHARED_SCOPE schedule attributes are readable; Tuya device schedules are telemetry blobs needing a per-product decoder; Salus IT700 schedules are an undecoded hex blob; Salus IT500 and Intesis schedules are vendor-cloud-only and not readable from ThingsBoard (RESEARCH-S13-SCHEDULES.md). |

---

## 4. New findings not in the approved matrix

### 4.1 Command write path: Requested not Desired (PROVEN)

All prior documents assume the write path is Desired to SHARED_SCOPE. It is Requested to SERVER_SCOPE. The gate triggers on any ATTRIBUTES_UPDATED message carrying one of the four Requested keys; it then rewrites Desired itself. See section 1 and the matrix update in section 3.1 of the matrix document.

Source: RESEARCH-S2-S3.md, RESEARCH-S4-S5.md, RESEARCH-S7.md.

### 4.2 Switch-only fleet includes live external-lighting (PROVEN)

The `switch` key (bare, no underscore-1) is not only a tongou variant. A population of 18 tuya-profile devices with no switch_1 key uses `switch`, including the live external-lighting units gk-6237-externallighting-1, gk-6186-externallighting-1 and gk-6099-externallighting-1 (all fresh within 24 hours at sweep time). Our mapTelemetry function does not map `switch`, so these units show no on/off state today. The gate already handles `switch` in its freshness list and direction bypass. The gap is in our read path only.

This is a live display defect for external lighting, independent of the control re-plumbing. A single-line mapTelemetry fix would address it. Decision D-SWITCH-ONLY-LIGHTING below asks whether to pull this forward.

**Multi-gang verification (S9-S11 evidence, sample-bounded):** 30 devices in the 3,097-device sample carry both switch_1 and switch. On those, switch_1 is the current key and switch is stale (some entries thousands of hours old — switch was the legacy attribute). The 4 two-gang Brackley refrigeration devices carry switch_1 and switch_2, not bare switch. No device in the 3,097 sampled carries bare switch as the current confirming key alongside switch_1. **This finding is bounded to the sampled 3,097 of 5,140 devices (60 percent of the estate); the remaining 40 percent has not been individually inspected.** The switch_1-preferred fallback design bounds the residual risk for the unsampled portion: the mapTelemetry logic prefers switch_1 where present and falls through to switch only when switch_1 is absent on that device, so any device that carries switch_1 (the dominant pattern) is unaffected by the fallback even if it also carries a stale switch entry.

Source: RESEARCH-S9-S11.md; hasSwitchSignal tb-device.js:345-348 vs mapTelemetry (no switch entry).

### 4.3 Two Intesis populations (DEDUCED-high)

The 246 devices on profile airConditioningProfile (including gk-birchwoodfarm-ac-1, used as the Intesis read evidence in the approved matrix) are R10A Modbus air-con units. They carry no vendor_id or vendor_device_id and are not bridge-controlled Intesis devices.

The 12 actual vendor-bridged Intesis units are entities named with the pattern gk-NNNN-intesis-* or md-NNNN-intesis-*, on profile default, with vendor_id = intesis. They report setPoint, mode, currentTemperature, isOnline and connectivity. They route to the IoT Command Gate via the Root Rule Chain and would have a gate path (the gate code is vendor-generic for any entity with vendor_device_id). Whether the bridge writes accepted for intesis is unproven.

For R1 the consequence is the same (both populations stay capture-and-refer). The read keys differ (capitalised Modbus registers for airConditioningProfile vs normalised setPoint/mode for default-profile Intesis). The matrix rows must be relabelled.

Source: RESEARCH-S12-Q7.md, RESEARCH-ESTATE-SWEEP.md.

### 4.4 V1 boiler panel is the majority (PROVEN)

The approved matrix noted "no V1 panel in the sample" and treated V1 as uncertain. The full estate sweep (223 boilerControl devices) finds 148 V1 (carrying output1OutputMask) and 74 V2 (carrying DHW.* keys). V1 is the majority. The V1 branch in deriveBoilerControl (tb-device.js:518-541) is load-bearing and must be tested.

Source: RESEARCH-ESTATE-SWEEP.md, RESEARCH-S12-Q7.md.

### 4.5 IT500 and bare-salus fleets are completely dark (PROVEN)

All 347 salusDevice-profile devices identified as IT500-style have no device-originated telemetry since at least 12 October (newest last-seen 11.9 days at sweep time). All 384 bare-salus devices (old OOHDASH-108 convention, profile salusDevice, names like gk_wingfieldfarm_salus_STA...) have been dark since approximately 2 June 2026 (median last-seen 134 days). This appears to be a controlled shutdown, not 731 independent outages.

Consequence: IT500 and bare-salus are not controllable today regardless of the new contract. The gate would reject any command as "gate: device offline" (no fresh telemetry in 45 minutes). The dashboard must show them as offline and offer no control. These fleets are currently shown as though they may be live; the display is misleading.

Source: RESEARCH-ESTATE-SWEEP.md, RESEARCH-S6.md, RESEARCH-S1-S8.md.

### 4.6 Tuya heartbeat cadence and the gate's 45-minute window (PROVEN)

The estate sweep shows Tuya owon devices report on a median 24-minute cycle, p90 44 minutes. The gate's offline threshold is 45 minutes. This means approximately 1.6 percent of healthy Tuya devices (49 of 3,028 live owon) are beyond the threshold at any moment and would be rejected by the gate as "gate: device offline" on an off request (on requests are exempt from the freshness check via the direction bypass when the device was last known off).

The dashboard should not adopt 45 minutes as its own offline threshold. The estate data shows a clean cliff: zero live Tuya devices fall between 3 hours and 48 hours. A 3-hour dashboard threshold separates live from dead correctly without false-positives.

Source: RESEARCH-ESTATE-SWEEP.md.

### 4.7 Stuck-pending has no server-side expiry (PROVEN)

The doorbell-failure case — the bridge is unreachable or the doorbell HTTP call fails — leaves the pending attribute in place permanently. The gate does not set a timeout or clear pending itself. There is no safety net from the gate side.

Build must rely entirely on the per-vendor confirm limit to decide when a command becomes INDETERMINATE. A pending state that persists beyond the confirm limit is classified INDETERMINATE by the dashboard, not by the gate. The gate will never clear it.

Source: RESEARCH-S4-S5.md (silent case N3: doorbell failure leaves pending forever, no expiry).

---

## 5. Per-vendor timing

The approved gate held a single provisional figure of 10 minutes for Salus. The research shows this needs to split into two figures: the operator-facing copy (N in "should take effect within about N minutes") and the machine confirm limit (when the dashboard stops waiting and records not confirmed). These serve different purposes and should be configured separately.

| Vendor / model | Operator copy N | Confirm limit | Late watch | Basis |
|---|---|---|---|---|
| Tuya (owon and switch-only) | No "minutes" copy; show the live result inline | 10 seconds | 2 minutes | Worst observed 1.6 s UAT, about 1.8 s prod (Spencer 10 Oct, RESEARCH-S2-S3.md) |
| Salus IT700 | 5 minutes | 45 minutes | 90 minutes | heatingSetpoint heartbeat: median 23.6 min, p90 27 min, max 48 min on gk-6261 (RESEARCH-S6.md, RESEARCH-S1-S8.md); all figures configurable |
| Salus IT500 | 15 minutes | 35 minutes | 60 minutes | 900-second Arrayent poll (SD-373); two poll cycles plus margin; BLOCKED today (prod polling off) |
| Bare salus (hardware model unknown) | 15 minutes | 35 minutes | 60 minutes | Conservative match to IT500 pending model identification |

Note on the UX-led timing decision James approved (gate decision 1): the copy figure N is what the operator sees in the message "sent to the device, should take effect within about N minutes". If a live result arrives before the confirm limit, it is reported inline regardless. The confirm limit is the backstop for the not-confirmed INDETERMINATE outcome.

---

## 6. The S4/S5 and S7 tension on direct Desired writes

The two research streams give conflicting signals about whether a direct Desired write (bypassing the gate) still dispatches on Salus and Intesis devices.

S4/S5 research concluded (medium confidence): a direct Desired write to a Salus or Intesis device likely still reaches the bridge through ThingsBoard's shared-attribute push notification, because the bridge subscribes to attribute changes and the CIR contract describes that as the original mechanism. Tuya under the new bridge is less certain (low confidence) because the doorbell may be the only dispatch trigger for Tuya.

S7 research found (medium confidence): gk-6835-salusit700-1 had a direct setpointDesired write on 12 October after the new bridge was deployed and produced no pending, no SyncStatus and no observable response. This suggests the bridge ignores direct Desired under the current regime. Contrast: pre-bridge writes on 24 to 25 September on gk-6261 and gk-6832 produced two pending entries each before stalling, which means the old bridge did act on direct Desired.

The tension is honest and both research files document it explicitly. The safe interpretation for Design and Build:

- Write Requested, never Desired.
- Treat a direct Desired write as producing an undefined outcome and never rely on it.
- The four stuck-Desired devices on the estate (gk-6261, gk-6832, gk-1648 IT700; gk-6237 externallighting tongou) cannot be recovered by a new Desired write; a Requested write is required.

The open question for Spencer (held, see section 7) is whether the Salus bridge path from a direct Desired write is still live, and whether the stuck devices can be recovered without an operator-facing re-send.

---

## 6b. Design steers — customer experience (non-blocking)

These are steers for the design doer, not decisions for James. None blocks Design starting. They arise from three gaps in the approved gate that research made concrete.

**Error message translation.** Raw gate error strings must never appear verbatim to an operator. The following translations are required:

- "gate: device offline" should render as something like "Device is not responding — this may be temporary. Try again in a few minutes, or raise a support ticket if it persists."
- "gate: malformed value" indicates a dashboard bug, not an operator error; log it internally, show a generic failure with no operator-visible gate string.
- "vendor: No active Tuya session owns device" should render as a transient failure with a retry prompt: "Couldn't reach the device right now — try again."
- "gate: internal fault" should render as "Something went wrong on our end — please try again; contact support if it persists."

The design doer should produce a full error-to-copy translation table covering every gate: and vendor: prefix found in the research before writing any error UX.

**Stuck-device interim UX.** Four devices on the estate have a Desired value set since September with no confirmed outcome: gk-6261, gk-6832, gk-1648 (IT700) and gk-6237 (external lighting, tongou). The dashboard currently shows no indication that these commands are outstanding. The recommended interim state for such a device: "Last command sent [date], outcome not confirmed — tap to resend." The resend writes the same Requested value again; this is proven safe on Tuya and the gate fires on every write regardless of value equality.

**INDETERMINATE reassurance copy.** When a command reaches the confirm limit without a confirming telemetry reading, the outcome is INDETERMINATE. The recommended operator copy: "We sent the command but the device hasn't confirmed it yet. It may still take effect — check the device status in a few minutes, or raise a ticket if it does not respond." Do not say "failed" (the command may have executed). Do not leave the operator with nothing to do.

---

## 7. Spencer questions (HELD — not yet sent)

These are consolidated and de-duplicated from all research streams. Nothing here has been communicated to Spencer. James's directive: everything is held until aggregated, confirmed and fully investigated, then sent as one consolidated list.

**The two security items have been removed from this list and escalated separately in section 2 above. They must not wait for this consolidated message.**

| # | Question | Our default |
|---|---|---|
| SQ-01 | Do we now write `<cap>Requested` to SERVER_SCOPE (not `<cap>Desired`) to send a command through the gate, and does a direct Desired write still dispatch on Salus, Intesis or Tuya devices under prod-sd446-v1? | Write Requested; treat direct Desired as unsupported; prove in the approved J8 test command. |
| SQ-02 | Does the bridge itself ever write pending, or does only the gate write it? | Gate writes pending; bridge writes accepted or rejected. |
| SQ-03 | What are the intermittent "vendor: No active Tuya session owns device" rejections on ag-brackley-poweroutlet-6 (10 and 12 October) and will they recur? | Show as a rejection with retry guidance; not a dashboard fault. |
| SQ-04 | If the bridge is unreachable or the doorbell times out, does anything expire a stuck pending state, or does it stay forever? | Nothing expires it; our per-vendor limit then INDETERMINATE. |
| SQ-05 | Has any Salus setpoint or mode command reached accepted and been confirmed since 10 October in any environment we can share? | Assume not; Salus control is labelled unproven until one is observed. |
| SQ-06 | What are your measured IT700 and IT500 accepted and confirmed times (typical and worst case)? | IT700 copy 5 min / limit 45 min; IT500 copy 15 min / limit 35 min; all configurable. |
| SQ-07 | Is prod Salus IT500 polling restored (Arrayent shared account fixed, bridge restarted after the 2 October shutdown noted in SD-373)? | Assume still paused; IT500 treated as non-controllable until fresh telemetry exists. |
| SQ-08 | Does sending a Salus IT700 setpoint command trigger an immediate telemetry poll of heatingSetpoint, or does confirmation wait for the normal 20 to 30 minute heartbeat cycle? | Assume heartbeat only; confirm limit 45 minutes. |
| SQ-09 | Does the prod Salus bridge treat a repeated identical Requested value as a new command (re-fires the vendor call), as the Tuya audit log shows for Tuya? | Yes by analogy; prove in the J8 bench Salus test. |
| SQ-10 | For hot-water boost, which key does the bridge write: hwBoostHoursSyncStatus (what the gate writes as pending) or hwBoostSyncStatus (what the SD-598 spec table lists)? | Hold boost out of scope per gate decision J5; read both stems if reinstated. |
| SQ-11 | The live external-lighting units (gk-6237, gk-6186, gk-6099 and the DHW farm devices) report state as the bare `switch` key, not switch_1. Is this by design, and should the dashboard confirm commands on that same key? | Yes, read switch_1 then switch; confirm on whichever is present. |
| SQ-12 | Can the gate's 45-minute freshness window be raised to 3 hours for Tuya, or should we raise it with you as a configuration change? (At 45 minutes roughly 1.6 percent of healthy Tuya devices are falsely rejected on an off request.) | Raise the gate threshold; until then show the gate's rejection verbatim and let the operator retry. |

---

## 8. Decisions for James

### D-SEC-ROTATE: Credential rotation — OPEN (deadline 2026-10-21)

**Status: OPEN. Spencer notified 2026-10-14. Rotation unconfirmed. No closure until written confirmation received.**

Both credentials (SQ-SEC-1 and SQ-SEC-2) were reported to Spencer by James on 2026-10-14. Rotation is Spencer's action, tracked in the consolidated Spencer set. The prior artefact labelled this decision "resolved." That was incorrect: notification is not rotation confirmed. Both exposures remain live today.

**What closes this decision:** Spencer provides written confirmation, recorded in the consolidated Spencer set, naming the credential and rotation date for each of SQ-SEC-1 and SQ-SEC-2. A verbal "done" or a Jira status change does not close it — written confirmation only.

**Deadline:** 2026-10-21 (five business days from notification).

**Escalation if deadline is missed:** James escalates to the delivery manager. The J8 admission test — the gateway before the dashboard routes any real commands through the production gate — is explicitly blocked until both written confirmations are on record. James may not sign off J8 without them.

**Owner-chase path:** James follows up with Spencer at 48-hour intervals (2026-10-16, 2026-10-19) before the deadline. If no response is received by morning 2026-10-21, the escalation fires the same day.

**Note:** D-SEC-ROTATE covers the credential rotation risk only. The admission model risk (no per-caller gate authorisation check) is a separate, distinct risk tracked as D-ADMISSION-MODEL immediately below. Rotating the credentials does not close D-ADMISSION-MODEL.

---

### D-ADMISSION-MODEL: Gate admission model — OPEN (decision required before J8)

**Status: OPEN — explicit acceptance or remediation required before the dashboard routes real commands.**

The IoT Command Gate has no per-caller authorisation check (S5, PROVEN). Any identity that holds the RBAC grant on svc-control — which today means any team-access identity — and can write a Requested key to SERVER_SCOPE on an OOH-profiled device is admitted to the gate. The gate does not verify the identity of the caller; it only verifies that the key name is one of the four Requested keys and that the device's telemetry is fresh enough.

**This risk is independent of D-SEC-ROTATE.** Rotating SQ-SEC-1 removes the ability for an attacker to read the doorbell credential and weaponise it externally. It does not change the gate's admission logic. After SQ-SEC-1 is rotated, the gate still admits any team-access identity with the RBAC grant. The blast radius contracts (an external attacker no longer has a readable credential to use), but the internal admission surface remains the same.

**The two options:**

**Option A — Accept the implicit admission model for R1**
Accept that admission is controlled by: (1) RBAC on the svc-control identity, which gates who can write Requested keys to SERVER_SCOPE; (2) profile routing, which gates which devices are reachable through the gate. Document this as an explicitly accepted architectural risk with Spencer as owner. Record that no per-caller check exists in the chain and that this is a known, accepted posture for R1. Review before R2 if the svc-control RBAC expands.

Conditions for acceptance: svc-control RBAC holders are enumerated; Spencer confirms the current holder set is appropriate; any future addition to that RBAC group triggers a re-review of this decision.

**Option B — Require a per-caller identity check before R1 goes live**
Scope a gate-side change with Spencer: the rule chain would inspect the calling identity (e.g. via ThingsBoard's built-in originator metadata) and compare it against an allowlist of permitted callers. This eliminates the implicit admission surface but requires gate-side development, testing, and a Spencer-owned deployment. Cost and timeline: UNVERIFIED — needs a scoping conversation with Spencer before this option can be sized.

**Recommendation:** Accept Option A for R1, subject to the conditions above. The RBAC on svc-control is already the primary control; the profile routing provides a secondary layer. Document the accepted risk explicitly. Add Option B as a named item on the R2 backlog.

**This decision must be recorded before J8.** James's sign-off on J8 requires both D-SEC-ROTATE (written rotation confirmation) and D-ADMISSION-MODEL (explicit acceptance or option decision on record).

---

### D-OFFLINE: Dashboard offline threshold

**Context:** The current code uses 48 hours (a soft rule). The topology doc claims three bands (live under 3 hours, quiet 3 to 12, offline over 12). The gate uses 45 minutes for its dispatch check. The estate data shows a clean cliff: no live Tuya or IT700 device falls between 3 hours and 48 hours. Adopting 45 minutes would mislabel about 1.6 percent of healthy Tuya devices.

Recommend: 3 hours as the configurable default offline threshold for controllable classes (Tuya, IT700, boilerControl). This must be a named constant per device class, not a hard-coded cliff — it should be re-confirmed across later estate sweeps as Sam's per-type cadence data arrives. Keep 48 hours for monitor-only classes as the current default, also configurable. Ask Spencer to raise the gate's own dispatch threshold separately.

### D-SALUS-N: Split copy figure from confirm limit

**Context:** The gate approval set "UX-led timing": if a command likely takes more than 5 seconds, say "sent to the device, should take effect within about N minutes". The research shows N and the confirm limit cannot be the same number for Salus.

Recommend: use the two-column table in section 5. Config constants for copy N and confirm limit, separate from each other, all adjustable without a release.

### D-SCHED-RELEASE: Next scheduled change in this release or a follow-up

**Context:** Boiler panel and PowerPause schedules are readable today as JSON attributes in ThingsBoard. A pure function of the JSON and the site's Europe/London timezone can compute the next scheduled change. Size is S to M. The Tuya and Salus IT700 schedule blobs are not yet decoded (pending a byte map from Spencer). IT500 and Intesis schedules are not visible from ThingsBoard.

Recommend: a follow-up ticket. The Design scope for the control re-plumbing is already large.

### D-SWITCH-ONLY-LIGHTING: Pull forward the switch mapping fix

**Context:** The live external-lighting units gk-6237, gk-6186 and gk-6099 report only the bare `switch` key. Our mapTelemetry does not map it. Those units show no on/off state in the dashboard today. The fix is a single additional case in mapTelemetry (after switch_1, fall through to switch). It is independent of the full control re-plumbing.

The multi-gang risk is sample-bounded: the estate sweep covered 3,097 of 5,140 devices (60 percent). No multi-gang hazard was found in the sampled population. The switch_1-preferred fallback bounds the residual risk for the unsampled 40 percent: the logic prefers switch_1 where present and only falls through to switch when switch_1 is absent on that specific device. Any device carrying switch_1 is unaffected regardless of whether it also carries a stale switch entry.

Recommend: pull it forward as a quick fix ahead of Design. It is a one-line change with a clear test (mapTelemetry on a device with only switch returns the correct state).

### D-DARK-FLEETS: Display of IT500 and bare-salus in the dashboard

**Context:** 347 IT500 devices have been dark for at least 12 days. 384 bare-salus devices have been dark since approximately 2 June. The scale (347 + 384 = 731 devices, two distinct populations) rules out 731 independent outages — this is a controlled or systemic shutdown. Cause is unresolved.

Recommend the following before Design starts:

- Raise a root-cause investigation ticket for each dark fleet. IT500 owner: Spencer (SD-373 covers the Arrayent shared-account shutdown; whether polling has resumed is SQ-07 in the held list). Bare-salus owner: unknown — needs identification before a ticket can be raised. The dark period (134 days for bare-salus) raises the possibility of a live service outage rather than a controlled decommission.
- Mark all IT500 and bare-salus confirm figures as provisional and untestable while the fleets are dark. No Salus command can reach either population regardless of the confirm limit.
- Display them as offline with "device not reporting"; offer no control; do not hide them (operators need to know their site's thermostat is unreachable).

### D-INTESIS-RECLASSIFY: R10A Modbus vs vendor-bridged Intesis labelling

**Context:** The 246 airConditioningProfile devices are R10A Modbus air-con, not bridge-controlled Intesis. Our classifier already forces them non-controllable by profile (tb-device.js:417-421), so there is no behaviour change for R1. The read keys differ slightly (capitalised Modbus vs normalised bridge keys) but both are displayed as context-only air-con. The 12 true Intesis entities (profile default) are also non-controllable under OOHDASH-82.

No action required for R1 behaviour; confirm the display label update ("air conditioning — refer via ticket" for both) does not need a Design decision.

### D-RESEND: Confirm the pre-dispatch fix approach

**Context:** The current 409 block compares Desired to the requested value. The fix is to compare the device's own telemetry reading to the requested value and to re-fire by writing Requested (not by clearing and resetting Desired). The research proves clear-then-set (writing an empty or null value) is rejected by the gate as "gate: malformed value". The re-fire by writing the same Requested value again is proven safe on Tuya and deduced for Salus.

Confirm the fix, with a staleness guard:

Design must bias to re-fire rather than suppress. Writing the same Requested value again is always safe — the gate fires on every write regardless of value equality (PROVEN on Tuya; deduced for Salus). Suppress only when a FRESH confirming telemetry reading already shows the outcome: a reading whose own timestamp is at or after the Requested key's lastUpdateTs (the timestamp of the pending write). A stale reading (timestamp before the Requested write) must not suppress a re-send.

Per-vendor staleness guard:

- Tuya: confirming key is switch_1 (or switch for switch-only devices); ts of the telemetry entry must be at or after switchRequested lastUpdateTs. Tuya heartbeat is median 24 minutes so readings can be stale within a short confirm window.
- Salus IT700: confirming key is heatingSetpoint (not setPoint); heartbeat median 23.6 minutes, max observed 48 minutes; many readings will be stale relative to a recent Requested write; always compare the key's own ts before suppressing.
- Salus IT500: confirming key is setPoint (DEDUCED; no live device to verify); same staleness rule; untestable while the IT500 fleet is dark.

No clear-then-set step: writing an empty or null value is rejected by the gate as "gate: malformed value" (PROVEN).

---

## 9. Cost and silent-running evaluation

**Token and cost efficiency:** all research was run as read-only ThingsBoard GETs using the existing tenant-admin credentials in the CIR. No new subscriptions, no per-call API costs, and no LLM token spend beyond the sub-agent research calls. The estate sweep was heavier than ideal (about 10,300 GETs in one pass); the coordinator has noted this should not be repeated. All schedule reads are on-demand per device; no poller required.

**Silent running:** the proposed design adds no new background process. The in-flight action persistence (J7, approved at the gate) uses the existing Cosmos action-store design; it wakes only when a confirmation arrives or a timeout fires. No daemon, no timer tick that burns tokens or machine resources while idle. The only standing process is the existing overrides.js revert worker (every 30 seconds), which already exists and is not changed by this addendum.

**Neither criterion vetoes any proposed change.** There is no cost or silent-running compromise to disclose.

---

## 10. Next steps

**Security: two open decisions, both blocking J8.** D-SEC-ROTATE and D-ADMISSION-MODEL must both be resolved before the dashboard routes real commands through the production gate. D-SEC-ROTATE requires Spencer's written confirmation of credential rotation by 2026-10-21; James is chasing at 48-hour intervals. D-ADMISSION-MODEL requires James's explicit decision on the admission model (Option A or B in section 8) before J8 sign-off. These are separate decisions; neither closes the other.

**Second: Design can start** on the items with full answers once the remaining section 8 decisions are recorded: the Requested write path, the Tuya confirmation rule (switch_1 or switch, normalised string comparison, 10-second limit), the three-outcome model on the new signals, the accepted phase copy, the pre-dispatch fix, and the hot-water flow (remove boost, capture-and-escalate). The Salus figures (section 5) are ready as configurable defaults; Spencer's measured numbers will arrive as a one-line config update.

Items that wait for Spencer (held questions): the Salus bridge acceptance proof (SQ-05), the timing figures (SQ-06), IT500 poll status (SQ-07), and the gate threshold raise (SQ-12). None of these blocks Design starting. Each is a Build-time or go-live gate concern.

Items that wait for James: the remaining decisions in section 8, particularly D-ADMISSION-MODEL (required before J8), D-SWITCH-ONLY-LIGHTING (quick fix or wait), and D-OFFLINE (dashboard threshold).

The Spencer questions (minus the security items) are ready to send as a single consolidated message whenever James gives the go-ahead.