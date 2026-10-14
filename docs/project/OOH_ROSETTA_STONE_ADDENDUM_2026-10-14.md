<!-- gate:contract
SECTION: What this addendum is
James approved the Rosetta Stone discovery gate (PR #86, 2026-10-14) and then directed maximum research before Design starts. Eight Sonnet sub-agents ran read-only ThingsBoard checks and searched Jira, SharePoint and Teams across all thirteen Spencer questions from the matrix (S1 to S12) plus a new question on schedules (S13) and a full estate sweep of 5,140 command-capable devices. All nine research streams are back. This addendum consolidates their findings into the gate artefact, updates the per-question verdicts, records six new findings that were not in the approved gate, and lists the Spencer questions we are holding as a draft until everything is aggregated and confirmed (James's directive: nothing sent to Spencer until fully investigated). It also adds eight decisions that are yours before Design can start.

SECTION: Two security items escalated immediately — decoupled from the Spencer hold
Two live exploitable credentials were found during research. They are NOT in the Spencer held queue. They require your decision now, ahead of any other action. SQ-SEC-1: the IoT Command Gate rule chain metadata contains a credential readable in plain text by any identity at our access level. SQ-SEC-2: a vendor token on gk-st-office-intesis-1 is retrievable over a plain GET by our tenant-admin identity. Both are described in section 2 of this document. The default recommendation is immediate out-of-band rotation before the Spencer message goes and before any dashboard commands route through the gate. If you choose to hold, that is an explicit risk you own — section 2 sets out exactly what you are accepting. This is not a Spencer question; it is a decision for you, today.

SECTION: Gate admission for svc-control requires explicit confirmation
The S5 research found that the IoT Command Gate has no per-caller authorisation check. Any identity that can write a Requested key to SERVER_SCOPE on an OOH-profiled device is admitted. Admission today is implicit: controlled by profile routing and the RBAC grant on the shared identity. Before the dashboard begins routing real commands through the gate, you need to confirm this is acceptable. Section 7 sets out the options. This is also a decision for you, today.

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
Eight decisions are yours. Two are immediate: the security rotation choice (section 2) and the S5 gate admission confirmation (decision D-S5-GATE-ADMISSION). The ones that most directly gate Design work: the dashboard offline threshold (3 hours is recommended; the current code uses 48 hours and the gate uses 45 minutes, each for different reasons), the split between the operator-facing copy figure and the confirm limit for Salus, and whether to pull the switch-only mapping fix forward as a quick pre-Design change so external-lighting units display a state. The schedule question and the dark-fleet display question are lower priority but Design needs your steer before it lays out the device cards.

DECISION: Do you rotate SQ-SEC-1 and SQ-SEC-2 credentials now, out of band, before the Spencer message goes? | Rotate now: both credentials are live and readable by any identity at our access level; rotation is the only safe default | Accept the risk: hold rotation until the consolidated Spencer message, with James as the named risk owner and a written deadline

DECISION: Is the implicit gate admission for svc-control (no per-caller authz check; admission via profile routing + RBAC) explicitly confirmed as acceptable before the dashboard routes real commands? | Confirm acceptable as-is: profile routing and RBAC together are sufficient for R1 | Require an explicit per-caller check be added to the gate before the dashboard routes commands

DECISION: What is the dashboard offline threshold for controllable devices? | 3 hours: the estate data shows a cliff between 3 hours and 48 hours; no live Tuya or IT700 device falls in that gap | Keep the current code rule of 48 hours

DECISION: How should the operator-facing copy figure (the N in "should take effect within about N minutes") be set relative to the confirm limit? | Split them: IT700 copy 5 minutes, confirm limit 45 minutes; IT500 copy 15 minutes, confirm limit 35 minutes; all configurable | Use the same single figure for both copy and limit, as the gate doc's 10-minute provisional

DECISION: Does "next scheduled change" for boiler panels and PowerPause circuits enter this release? Schedules are readable today as JSON attributes and need only a pure function of the JSON and site timezone to compute next change. Size S to M. | A follow-up ticket, because the Design scope is already large | Pull it into this release alongside the control re-plumbing

DECISION: Is the switch-only mapping fix (adding the bare switch key as a fallback in mapTelemetry) pulled forward as a quick fix ahead of Design, so live external-lighting units show a state now? | Yes, a quick fix now: it is a one-line change to mapTelemetry and it fixes a live display gap independent of the control re-plumbing | It waits for the main Design and Build phase

DECISION: How should the dashboard display the dark IT500 and bare-salus fleets (347 and 384 devices, none reporting for at least 12 days)? | Show them as offline with a neutral explanation: "device not reporting"; offer no control | Hide them from the device list until they resume reporting
-->

# OOHDASH-123 Rosetta Stone: Discovery Addendum

**Ticket:** OOHDASH-123 · **Stage:** Discovery addendum · **Date:** 2026-10-14
**Base:** main a9e34ec (PR #86 merged, gate approved 2026-10-14)
**Companion:** docs/project/OOH_ROSETTA_STONE_MATRIX_2026-10-14.md (matrix updated in this commit)
**Research inputs:** C:/harness-runs/iot-ooh-dash/research/ (RESEARCH-S1-S8.md, RESEARCH-S2-S3.md, RESEARCH-S4-S5.md, RESEARCH-S6.md, RESEARCH-S7.md, RESEARCH-S9-S11.md, RESEARCH-S12-Q7.md, RESEARCH-S13-SCHEDULES.md, RESEARCH-ESTATE-SWEEP.md)

---

## ⚠ 2. Security escalations — immediate action required, decoupled from Spencer hold

> **These two items are not Spencer questions. They are not in the held list. They require your decision now — before the Spencer message goes and before any dashboard command routes through the gate.**

Two live exploitable credentials were found during research. Their values are not reproduced anywhere in this document. They are described structurally only.

**SQ-SEC-1 — Plaintext credential in Command Gate rule chain metadata**

The IoT Command Gate rule chain contains a request-header credential in its metadata configuration. That metadata is readable via a standard ThingsBoard API call by any identity holding team-level access — including svc-control and any identity that shares our RBAC grant. The credential is live and in use; it is not a test value.

**SQ-SEC-2 — Vendor token on gk-st-office-intesis-1 in SERVER_SCOPE**

A SERVER_SCOPE attribute whose name indicates a vendor access token exists on the legacy Intesis entity gk-st-office-intesis-1. It is retrievable over a plain GET /api/plugins/telemetry/DEVICE/{id}/values/attributes/SERVER_SCOPE by our tenant-admin identity. It is not encrypted at rest at the attribute level.

### The choice you are making — stated plainly

**Option A — Rotate now (recommended).** Both credentials are escalated out of band today. You (James) name the rotation owner for each item — the person who holds the gate config access and the person who holds the Intesis bridge config — and set a rotation deadline (recommended: by end of business today). Neither item waits for the consolidated Spencer message. Rotation is complete before the dashboard begins routing real commands through the gate. This is the only option that closes the exposure before new command traffic creates a wider blast radius.

**Option B — Hold until Spencer message (risk acceptance).** You choose to hold both items in the Spencer consolidated message alongside the operational questions. By choosing this option you are explicitly accepting: (a) that both credentials remain readable by any team-level identity until Spencer acts; (b) that any new command traffic from the dashboard will flow through a gate whose doorbell credential is rotatable by an adversary with our access level; (c) that James Brown is the named risk owner, with a written acknowledgement in this document, until rotation is complete. This option does not lower the risk — it defers it, with James as the accountable owner.

**If you choose Option B, the following line must be added to this document before it is approved:**
> *Risk accepted by: James Brown, jamesbrown@airedale-group.co.uk, 2026-10-14. Rotation deadline: [date]. Rotation owner for SQ-SEC-1: [name]. Rotation owner for SQ-SEC-2: [name]. Interim mitigations in place: [none / list].*

The default is Option A. No further investigation is required to act. The values are not needed here — the rotation owners already have access to retrieve them through the correct secure channel.

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
| S5 | Does the gate admit svc-control? | PROVEN — confirmation required | No caller check exists in the chain; admission is implicit via profile routing (4 OOH profiles reach the gate) and the SHARED_SCOPE RBAC on the identity; svc-control already appears in every audit-log entry for switchRequested (RESEARCH-S4-S5.md). **This admission model must be explicitly confirmed as acceptable before the dashboard routes real commands — see D-S5-GATE-ADMISSION in section 7.** |
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

### D-SEC-ROTATE: Security credential rotation — immediate decision (BLOCKED on security)

See section 2 for the full framing. This is not a Spencer question and is not deferred by the aggregation hold. The two live credentials (SQ-SEC-1 and SQ-SEC-2) are readable by any identity at our access level now.

**Option A (recommended):** Rotate both credentials out of band, today. Name the rotation owner for SQ-SEC-1 (gate rule chain config access) and the rotation owner for SQ-SEC-2 (Intesis bridge config access). Set a deadline of end of business today. Do not wait for the Spencer message.

**Option B (risk acceptance — requires written sign-off):** Hold both until the Spencer message. If you choose this option, add the following line to this document, signed with your name, email and today's date, before this artefact is re-submitted for approval:

> *Risk accepted by: James Brown, jamesbrown@airedale-group.co.uk, 2026-10-14. Rotation deadline: [date you commit to]. Rotation owner for SQ-SEC-1: [name]. Rotation owner for SQ-SEC-2: [name]. Interim mitigations: [none confirmed / list any].*

The absence of that line means Option A is in effect and rotation proceeds immediately.

### D-S5-GATE-ADMISSION: Confirm implicit gate admission is acceptable

**Context:** The S5 research (RESEARCH-S4-S5.md) found that the IoT Command Gate performs no per-caller authorisation check. Any identity that can write a Requested key to SERVER_SCOPE on an OOH-profiled device is admitted to the gate. Today that is controlled by two guards: (1) profile routing — only devices on the four OOH profiles reach the gate rule chain; and (2) the RBAC grant on the svc-control identity — SHARED_SCOPE write access is required to write a SERVER_SCOPE Requested attribute. svc-control's audit trail is clean. No other identity has been observed writing Requested keys in the audit logs available to us.

This is structurally an implicit admission model: any identity that holds the right RBAC grant and can reach a profiled device is a valid caller, without the gate itself checking caller identity. That may be acceptable by design — it is how ThingsBoard's trust model works — but it must be explicitly confirmed rather than assumed before the dashboard begins routing real commands.

**Option A (confirm acceptable):** Profile routing + RBAC is sufficient for R1. The gate does not need a per-caller check. Confirm in writing and Design proceeds.

**Option B (require explicit check):** A per-caller identity check must be added to the gate rule chain before the dashboard routes commands. This is a Spencer engineering ask; add to SQ list and block Design on the answer.

Recommend Option A with confirmation on record: the RBAC model is the standard ThingsBoard pattern, and the audit trail shows svc-control is the sole caller. The risk is low and is already lower than the two security items above. But the choice must be recorded, not assumed.

### D-OFFLINE: Dashboard offline threshold

**Context:** The current code uses 48 hours (a soft rule). The topology doc claims three bands (live under 3 hours, quiet 3 to 12, offline over 12). The gate uses 45 minutes for its dispatch check. The estate data shows a clean cliff: no live Tuya or IT700 device falls between 3 hours and 48 hours. Adopting 45 minutes would mislabel about 1.6 percent of healthy Tuya devices.

Recommend: 3 hours as the dashboard's offline threshold for controllable classes (Tuya, IT700, boilerControl). Keep 48 hours for monitor-only classes pending Sam's per-type cadence figures. Ask Spencer to raise the gate's dispatch threshold as a separate action.

### D-SALUS-N: Split copy figure from confirm limit

**Context:** The gate approval set "UX-led timing": if a command likely takes more than 5 seconds, say "sent to the device, should take effect within about N minutes". The research shows N and the confirm limit cannot be the same number for Salus.

Recommend: use the two-column table in section 5. Config constants for copy N and confirm limit, separate from each other, all adjustable without a release.

### D-SCHED-RELEASE: Next scheduled change in this release or a follow-up

**Context:** Boiler panel and PowerPause schedules are readable today as JSON attributes in ThingsBoard. A pure function of the JSON and the site's Europe/London timezone can compute the next scheduled change. Size is S to M. The Tuya and Salus IT700 schedule blobs are not yet decoded (pending a byte map from Spencer). IT500 and Intesis schedules are not visible from ThingsBoard.

Recommend: a follow-up ticket. The Design scope for the control re-plumbing is already large.

### D-SWITCH-ONLY-LIGHTING: Pull forward the switch mapping fix

**Context:** The live external-lighting units gk-6237, gk-6186 and gk-6099 report only the bare `switch` key. Our mapTelemetry does not map it. Those units show no on/off state in the dashboard today. The fix is a single additional case in mapTelemetry (after switch_1, fall through to switch). It is independent of the full control re-plumbing.

Recommend: pull it forward as a quick fix ahead of Design. It is a one-line change with a clear test (mapTelemetry on a device with only switch returns the correct state).

### D-DARK-FLEETS: Display of IT500 and bare-salus in the dashboard

**Context:** 347 IT500 devices have been dark for at least 12 days. 384 bare-salus devices have been dark since approximately 2 June. Cause is unresolved (Spencer question SQ-07 covers IT500; bare-salus has no ticket). Today the dashboard may show these as quiet rather than truly offline.

Recommend: show them as offline with "device not reporting"; offer no control; do not hide them (operators need to know their site's thermostat is unreachable).

### D-INTESIS-RECLASSIFY: R10A Modbus vs vendor-bridged Intesis labelling

**Context:** The 246 airConditioningProfile devices are R10A Modbus air-con, not bridge-controlled Intesis. Our classifier already forces them non-controllable by profile (tb-device.js:417-421), so there is no behaviour change for R1. The read keys differ slightly (capitalised Modbus vs normalised bridge keys) but both are displayed as context-only air-con. The 12 true Intesis entities (profile default) are also non-controllable under OOHDASH-82.

No action required for R1 behaviour; confirm the display label update ("air conditioning — refer via ticket" for both) does not need a Design decision.

### D-RESEND: Confirm the pre-dispatch fix approach

**Context:** The current 409 block compares Desired to the requested value. The fix is to compare the device's own telemetry reading to the requested value and to re-fire by writing Requested (not by clearing and resetting Desired). The research proves clear-then-set (writing an empty or null value) is rejected by the gate as "gate: malformed value". The re-fire by writing the same Requested value again is proven safe on Tuya and deduced for Salus.

Confirm the fix: judge "already satisfied" from device telemetry; re-send by writing Requested; no clear step.

---

## 9. Cost and silent-running evaluation

**Token and cost efficiency:** all research was run as read-only ThingsBoard GETs using the existing tenant-admin credentials in the CIR. No new subscriptions, no per-call API costs, and no LLM token spend beyond the sub-agent research calls. The estate sweep was heavier than ideal (about 10,300 GETs in one pass); the coordinator has noted this should not be repeated. All schedule reads are on-demand per device; no poller required.

**Silent running:** the proposed design adds no new background process. The in-flight action persistence (J7, approved at the gate) uses the existing Cosmos action-store design; it wakes only when a confirmation arrives or a timeout fires. No daemon, no timer tick that burns tokens or machine resources while idle. The only standing process is the existing overrides.js revert worker (every 30 seconds), which already exists and is not changed by this addendum.

**Neither criterion vetoes any proposed change.** There is no cost or silent-running compromise to disclose.

---

## 10. Next steps

**First: two immediate actions before anything else.** The security rotation decision (D-SEC-ROTATE) and the gate admission confirmation (D-S5-GATE-ADMISSION) must both be settled today. Neither waits for the Spencer message, and neither waits for Design to start. Both are decisions for James alone.

**Second: Design can start** on the items with full answers once those two decisions are recorded: the Requested write path, the Tuya confirmation rule (switch_1 or switch, normalised string comparison, 10-second limit), the three-outcome model on the new signals, the accepted phase copy, the pre-dispatch fix, and the hot-water flow (remove boost, capture-and-escalate). The Salus figures (section 5) are ready as configurable defaults; Spencer's measured numbers will arrive as a one-line config update.

Items that wait for Spencer (held questions): the Salus bridge acceptance proof (SQ-05), the timing figures (SQ-06), IT500 poll status (SQ-07), and the gate threshold raise (SQ-12). None of these blocks Design starting. Each is a Build-time or go-live gate concern.

Items that wait for James: the remaining decisions in section 8, particularly D-SWITCH-ONLY-LIGHTING (quick fix or wait) and D-OFFLINE (dashboard threshold).

The Spencer questions (minus the security items) are ready to send as a single consolidated message whenever James gives the go-ahead.