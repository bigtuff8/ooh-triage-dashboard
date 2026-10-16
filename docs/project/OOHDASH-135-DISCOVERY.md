<!-- gate:contract
TICKET: OOHDASH-135
PHASE: discovery
QUESTIONS:
Q1: James - for Intesis AC: should the OOH dashboard now OFFER setpoint control (proven path, bench) or continue to refer to IoT team? The bench evidence is good but no live customer unit has been commanded via the new route.
Q2: James - for boiler panels: should the OOH dashboard READ panel telemetry (status, hot water temp) in future? Control (direct override) would need a separate decision.
Q3: Spencer / IoT team - Salus iT700: 26 entities need relabeling, 9 duplicates need resolution, and 16 sites have no TB entity at all. Until done, commands will be rejected for those sites. What is the timeline for the IoT team to complete this?
Q4: Spencer - Salus iT700: can the OOH dashboard be given the "resume programme" command (SetHoldType=0) in the same bridge update, so we can offer a timed boost that reverts? Currently only manual hold (HoldType=1) is available.
Q5: Spencer - Salus iT500 hot-water boost: the hwBoostHours key-stem bug is fixed (v6/v8 bridge), but the command has never been tested end to end. Can you run a bench test to prove it before it is offered to OOH handlers? Note: the dashboard code (registry.js hwboost case) currently writes hwBoostHoursDesired directly rather than hwBoostHoursRequested - this needs to be corrected to use the Requested key so the IoT Command Gate dispatches it.
Q6: Spencer - Intesis mode: the modeRequested path is BUILT but not tested end to end. Same request as Q5.
Q7: Spencer - prod freshness window: currently 45 min. Tuya switches that are OFF only report every 60-120 min, so the gate sometimes refuses "device offline" for a working device that is simply off. Should the prod window be raised to 3h (matching dev), or should the gate Tuya ON-from-OFF bypass be the fix?
Q8: Spencer - Intesis liveness: a steady Intesis unit publishes nothing between polls, so the gate can refuse "device offline" even when the unit is fine. Can the bridge publish a liveness timestamp each poll cycle to prevent this?
SECTIONS:
- Context and Scope
- How We Write Commands Today
- Code Verification Findings
- Vendor Command Status Summary
- Current vs Target - Key Gaps
- Recommended Changes, Sized and Prioritised
- Salus iT700 Naming Dependency
- Evidence Confidence
- Open Questions for Gate
-->

# OOHDASH-135 Discovery: SD-446 Command Spec vs OOH Dashboard - Current vs Target

## Context and Scope

This spike maps Spencer Thompson's ThingsBoard command specification (SD-446, dated 16 Oct 2026) to the current OOH Triage Dashboard (v1.4.2, released 16 Oct 2026). The scope covers what the spec says is now supported for each device vendor, what the dashboard can read and control today, the gap between the two, and what changes would be needed to close it. The simple before-and-after table (OOHDASH-135-SIMPLE-TABLE.md) is the companion output for colleagues who need a plain-English view.

The spike was triggered by the 16 Oct bridge v8 deployment, which fixed the Salus iT700 MQTT write path and proved the iT500 and Intesis setpoint paths on the bench for the first time. The dashboard and the spec have diverged in several places - some because the spec now enables things the dashboard does not offer, some because the dashboard offers things the spec does not support, and one because the dashboard code writes a command attribute using the wrong key pattern (see Code Verification Findings below).

## How We Write Commands Today

The dashboard writes the {cap}Requested key (for example setpointRequested or switchRequested) to SERVER_SCOPE in ThingsBoard via services/control.js. This is the correct entry point per SD-446. The write happens at line 108 of control.js: "tb.writeServerScopeAttribute(device, check.attribute, check.value)" where check.attribute is the Requested key returned by registry.validateCommand. The gate then sets SyncStatus = pending, writes {cap}Desired to SHARED_SCOPE, and rings the bridge doorbell. The bridge performs the vendor write and sets SyncStatus = accepted or rejected. The telemetry echo key (for example switch_1 or heatingSetpoint) is the confirmation that the device actually changed - "accepted" on its own is always in-flight, never success (this is the OOHDASH-102 false-success principle, explicitly enforced in control.js).

## Code Verification Findings

Three findings from reading the deployed source that differ from or add to the provided inputs:

Finding 1 - hwboost writes hwBoostHoursDesired, not hwBoostHoursRequested. The registry.js validateCommand hwboost case (lines 218-221) returns "attribute: 'hwBoostHoursDesired'". This writes directly to SHARED_SCOPE via the Desired key, bypassing the IoT Command Gate entirely. The spec entry point is the Requested key written to SERVER_SCOPE. This is a code defect that must be fixed before hot-water boost is tested end to end (it is currently unreachable because iT500 DHW units are offline). The fix is a one-line change in registry.js: change the attribute return value to 'hwBoostHoursRequested'. This is flagged in Q5.

Finding 2 - boiler-panel deviceType is in the registry but classifyDevice never produces it. The ASSET_INTENT table in tb-device.js has no row that produces deviceType 'boiler-panel'. The boilerControl profile is read by fetchTelemetry to decide whether to read SHARED_SCOPE schedule attributes, but classifyDevice classifies by name tokens only. A boiler panel device with no matching name token falls through matchAssetIntent as null-intent and is returned as kind 'unknown', deviceType 'gateway'. The boiler-panel registry entry and its commands:[] array exist but are unreachable from the live classification path. This confirms gap 4 (boiler panel not recognised) with greater precision than the provided inputs stated.

Finding 3 - salus-it500 CONTROL_CONTRACT has controllable: false and dark: true. The code marks iT500 as dark, not merely offline. The dashboard does not offer temperature control for iT500 even at sites where units might be reporting (they are not currently, but the code would refuse control regardless). This is consistent with the "dark fleet" note in the provided inputs but was not explicitly called out: restoring iT500 control requires both the fleet coming back online AND the controllable flag being set to true in CONTROL_CONTRACT.

Finding 4 - Intesis is explicitly forced non-controllable in classifyDevice regardless of telemetry (tb-device.js lines 475-478). Even if a setpoint signal is present, the classifier overrides it. Any change to offer Intesis control requires both a registry.js change (add setpoint to commands[]) and a tb-device.js change (remove or condition the Intesis force-non-controllable block). This is a design decision for James (Q1).

Finding 5 - The REQUESTED_KEYS allow-list (registry.js line 146-148) explicitly adds 'modeRequested' even though no deviceType carries a mode command today. This was done deliberately to reserve the key for when Intesis mode ships - confirming the BUILT-not-tested status of Intesis mode.

## Vendor Command Status Summary

The following describes the entry key, gate profile, identity rule, echo key, status, and what the dashboard does today for each vendor. Status ratings are: PROVEN (bench plus prod round-trip seen), PROVEN-BENCH (bench only, prod path deployed, no live customer command yet), BUILT (code present, never tested), NOT-SUPPORTED (no write path exists or has been intentionally blocked).

### Tuya - kitchen switches, external lighting, extractor fans

Entry: switchRequested to SERVER_SCOPE. Gate: tuya Profile, 3,158 prod devices. Identity: SERVER_SCOPE devId, exactly one entity. Echo: switch_1 (fallback: switch). Status: PROVEN - prod confirmed at Brackley test site, bench confirmed 16 Oct (Tongou 0.32-0.86s, Owon 0.52-0.73s, 6 samples each). Dashboard today: switch control IS offered for lighting and fan flows. Kitchen circuits: reachable check only, switching not offered. Gaps: only the first lighting circuit and first extractor fan are shown per site; unrecognised device names (over-door heaters, festoon lights, supply fans, bar fans) are grouped as kitchen and never offered in lighting or fan flows.

### Salus iT700 - heating thermostat

Entry: setpointRequested to SERVER_SCOPE. Gate: salusDevice profile, 451 prod entities. Identity: CLIENT_SCOPE vendor_device_id = AWS thing name (SAWZ600GW-{gw}-IT700TX-{mac}), exactly one entity. Echo: heatingSetpoint (note: code uses heatingSetpoint as confirm key, not setPoint - setPoint can be months stale). Status: PROVEN-BENCH - UAT bench 16 Oct, bridge v8 prod deployed 16 Oct, not yet fired at a live customer stat. Critical bridge fix (v8, 16 Oct): the old write used HTTPS UpdateThingShadow which AWS accepted but the thermostat never applied (false "accepted"). The new write uses MQTT publish to the shadow/update topic - this is how the Salus app works and the thermostat applies it in about 1 second. Before this fix, every iT700 setpoint command was silently ineffective despite showing "accepted". Dashboard today: temperature control (Warmer / Cooler / Turn it off as frost-hold) IS offered where iT700 is reporting, via the setpointRequested write path. The CONTROL_CONTRACT is marked controllable: true but unproven: true (SQ-05 comment). iT700 mode: NOT SUPPORTED by spec this phase. iT700 hwBoost and switch: NOT SUPPORTED. Blocker before live use: IoT team must fix approximately 30 iT700 entity labeling issues (ambiguous identity causes bridge refusals). See Salus iT700 Naming Dependency section.

### Salus iT500 - older heating thermostat, FHI accommodation sites

Entry: setpointRequested to SERVER_SCOPE. Gate: salusDevice profile, 346 prod entities. Identity: CLIENT_SCOPE vendor_device_id = Arrayent device ID (numeric), exactly one entity. Echo: setPoint. Status: PROVEN-BENCH - UAT bench proven 16 Oct, bridge v8 prod live, 9 of 61 accounts have devices. Timing: device confirms in 3-9 seconds. Dashboard today: the entire iT500 fleet stopped reporting around 2 Oct (vendor link switched off). The CONTROL_CONTRACT in code has controllable: false and dark: true - so the dashboard would not offer temperature control even if units came back online, until that flag is changed. If reporting is restored AND the controllable flag is corrected, the command path is now proven. Hot-water boost (hwBoostHoursRequested): BUILT with a code defect (see Code Verification Finding 1 - current code writes hwBoostHoursDesired, not hwBoostHoursRequested). This defect must be fixed and the command bench-tested before offering. iT500 mode: NOT SUPPORTED.

### Intesis air conditioning

Entry: setpointRequested to SERVER_SCOPE. Gate: default profile, 12 prod Intesis entities (vendor_id = intesis in CLIENT_SCOPE). Identity: CLIENT_SCOPE vendor_device_id = Intesis device_id, exactly one entity. Echo: setPoint. Setpoint status: PROVEN-BENCH - vendor accepted in 0.45-0.47s on bench 16 Oct; TB echo waits up to 15-min poll. Mode (modeRequested): BUILT, not tested end to end. Dashboard today: Intesis air con is NOT shown with readings and control is NOT offered - the flow refers to the IoT team. This is deliberate design per OOHDASH-82. Enabling AC control requires changes in both registry.js and tb-device.js (see Code Verification Finding 4). This is a design decision for James (Q1). Modbus air con (246 units on airConditioningProfile): NO write path, read only, not in scope for this spike.

### Boiler control panels - boilerControl profile

Entry: NOT via {cap}Requested. The boilerControl profile does not route to the IoT Command Gate. Controlled by IoT team directly in ThingsBoard (override and schedule commands). About 2,000 actions on 130 panels since 20 Sep by 6 logins, routinely and estate-wide. Dashboard today: the boiler-panel deviceType exists in registry.js but classifyDevice never produces it (Code Verification Finding 2). A panel device classifies as kind 'unknown', deviceType 'gateway'. No readings shown. No control offered. Whether to read panel telemetry in the dashboard is a design decision for James (Q2). Remote override commands by the OOH dashboard would need Spencer to confirm the route (SD-598).

### PowerPause power controllers

Entry: NOT via {cap}Requested. Direct device command "override". Proven at site 1110 on 15 Oct. Dashboard today: treated as a kitchen circuit (reachable or not). Local override button steps are shown in the "Contractor on site" flow. Remote switching is not offered. The newer control contract (SD-598) deprecates direct device commands for new callers - Spencer confirmation needed before routing the dashboard through that path.

### Refrigeration - fridge, freezer, chiller, cold room

Entry: None. Deliberately blocked at two levels: registry.js returns the explicit deny regardless of the commands list, and classifyDevice returns refrigeration type with controllable: false. This must remain blocked at the platform level as well, not only the dashboard UI.

## Current vs Target - Key Gaps

| Gap | Description | Owner | Size |
|---|---|---|---|
| Gap 1 | Device classification by name token misses unrecognised switches (over-door heaters, festoon lights, supply fans, bar fans, immersion heaters) - grouped as kitchen, never shown in lighting/fan flows | OOH dashboard | S-M |
| Gap 2 | First-circuit-only for lighting and fans - only the first lighting circuit and the first extractor fan are shown and switchable per site | OOH dashboard | S |
| Gap 3 | "Not controllable" not enforced server-side for older bare-salus types (OOHDASH-132) - registry lists commands but control.js does not check the flag before dispatching | OOH dashboard | S |
| Gap 4 | Boiler panel not recognised - deviceType 'boiler-panel' exists in registry but classifyDevice never produces it; panels show as unknown | OOH dashboard + James decision | M |
| Gap 5 | Site panel "Controllable" label inconsistent with flows - says Controllable when flows offer nothing (boiler panel heating, hot-water boost) | OOH dashboard | S |
| Gap 6 | Intesis readings not shown - units publish setpoint, mode, and temperature to ThingsBoard but dashboard shows nothing and refers to IoT team | James decision | M |
| Gap 7 | Salus iT500 hot-water boost - BUILT with a code defect (writes Desired not Requested); never bench-tested | Spencer bench + code fix | S |
| Gap 8 | Salus iT700 entity labeling - 26 wrong labels, 9 duplicates, 16 missing entities cause bridge to refuse "ambiguous identity" | Spencer and IoT team | External |
| Gap 9 | Salus iT500 controllable flag - CONTROL_CONTRACT has controllable: false and dark: true; would refuse control even if fleet came back online | OOH dashboard | S |

### Gap Detail: Gap 1 - Unrecognised device names

The ASSET_INTENT token table in tb-device.js classifies by name tokens. Devices whose names carry tokens like 'heater', 'immersion', 'overdoor', 'festoon', 'supply', 'bar' are not in any ASSET_INTENT row. They fall to the capability-first path: if they carry a switch signal they classify as kind 'kitchen' / deviceType 'tuya' (the switch-signal default). They appear in the site panel but never in the lighting or fan flows. Fixing this properly requires classifying from the ThingsBoard device profile plus a provisioning-time category attribute on each device - an IoT team dependency. A short-term fix is to add the missing tokens to ASSET_INTENT with the correct kind (lighting, fan) - but this only works if the names are consistent across the estate.

### Gap Detail: Gap 2 - First-circuit-only

The lighting and fan flows read only the first device of the relevant kind. If a site has three lighting circuits, only circuit 1 is shown with state and a switch. Circuits 2 and 3 are invisible. James specifically asked for all circuits to be shown individually. Fix: loop over all devices of each kind and render each as a separate row with its own state and switch button.

### Gap Detail: Gap 3 - Not-controllable not enforced server-side

The bare 'salus' type (older pre-2025 naming convention, about 380 units) has commands: ['setpoint', 'frost'] in the REGISTRY and controllable: false in the CONTROL_CONTRACT. The validateCommand function checks entry.commands but does not separately check the controllable flag before dispatch. If an older unit came back online, the flow might offer temperature controls, and validateCommand would pass because the command is in the commands list. The fix is to check the controllable flag in validateCommand (or in the capabilitiesContractFor chain) and refuse when false - one server-side check. This is OOHDASH-132.

### Gap Detail: Gap 7 - Hot-water boost code defect

In registry.js line 222, the hwboost case returns "attribute: 'hwBoostHoursDesired'". This attribute is a SHARED_SCOPE Desired key, not a SERVER_SCOPE Requested key. The IoT Command Gate watches for Requested key writes and will not fire from a Desired write. This means even if the command were tested today, it would write to the wrong scope and the bridge would never be rung. The fix is a one-line change to the attribute return value: change 'hwBoostHoursDesired' to 'hwBoostHoursRequested'. This must be done before any bench test makes sense.

## Recommended Changes, Sized and Prioritised

Priority 1 - small, high value, no Spencer dependency, suitable for next patch:
- Fix first-circuit-only for lighting and fans (Gap 2). About 1 day including tests. Show every circuit individually with its own on/off state and switch button. James specifically asked for this.
- Fix "Controllable" label inconsistency (Gap 5). About 0.5 day. Derive the label from the capability evidence (WORKS/PARTLY/BUILT/NOT-SUPPORTED per type and the device live state), not from hardware presence alone.
- Fix hwBoostHoursDesired to hwBoostHoursRequested (Gap 7, code defect). About 0.5 day including test. One-line registry.js change. Must be done before any boost bench test.

Priority 2 - small, closes latent risk:
- Enforce "not controllable" server-side (Gap 3, OOHDASH-132). About 0.5-1 day. One check in validateCommand or capabilitiesContractFor that refuses commands to types with controllable: false in the CONTROL_CONTRACT, regardless of the commands list.
- Correct iT500 CONTROL_CONTRACT controllable flag (Gap 9). About 0.5 day. Change controllable: false to controllable: true in the salus-it500 contract, remove dark: true. Conditional on IoT team restoring fleet reporting and Spencer confirming the bench result is sufficient.

Priority 3 - medium, depends on James decision:
- Surface boiler panel readings (Gap 4, Q2). About 3-5 days. Add a name-token row or profile-based branch to classifyDevice that produces 'boiler-panel' type; map the telemetry; wire readings into the Heating and Hot water flows. Control is a separate decision.
- Surface Intesis readings and optionally offer setpoint (Gap 6, Q1). About 3-5 days. The path is proven on the bench; the question is whether OOH handlers should command air con. Two sub-options: readings-only (remove the referral, show temperature and mode) or full control (add setpoint and mode commands). Enabling control requires registry.js and tb-device.js changes (two files, per Code Verification Finding 4).
- Classify devices from TB device profile (Gap 1, full fix). About 2-4 days plus IoT team provisioning work. Requires category attributes on existing devices at provisioning time - an IoT team dependency.

Priority 4 - depends on Spencer or IoT team:
- Salus iT700 entity labeling (Gap 8). IoT team work, no dashboard code change needed until complete.
- Salus iT500 hot-water boost bench proof (Q5). Spencer bench test needed, after the code defect is fixed.
- Intesis mode bench proof (Q6). Spencer bench test needed.
- Prod freshness window (Q7). Spencer decision.
- Intesis liveness timestamp (Q8). Spencer bridge change.

## Salus iT700 Naming Dependency

Spencer's Salus-IoT-status-and-fixes-2026-10-16-v2.xlsx (addressed to Sam Day) documents the cleanup required before iT700 commands can work reliably in prod. The bridge v8 fix is deployed. But 26 entities have labels that name the wrong thermostat (label does not match the entity's own eUID), which causes the bridge to find 2 or more entities carrying the same vendor_device_id and refuse with "ambiguous identity refusing". Additionally, 9 pairs of sites share one physical thermostat across two entities, and 16 sites have stale bindings with no entity. The IoT team needs to complete three tasks: relabel entities (IT700TX-last-8-of-eUID), resolve duplicates (choose one entity per thermostat), and either remove stale bindings or create new entities. Until done, iT700 commands fail on those sites even though the bridge path is now correct. The OOH dashboard cannot resolve this; it is a Spencer and IoT team dependency (Q3).

## Evidence Confidence

PROVEN - prod or prod plus bench round-trips confirmed:
- Tuya switch control (prod Brackley plus bench 16 Oct)
- Boiler panel control (IoT team direct TB, routine estate-wide since 20 Sep)
- PowerPause circuit switch (IoT team direct TB, site 1110, 15 Oct)

PROVEN-BENCH - bench only, prod path deployed but no live customer command yet:
- Salus iT500 setpoint (bench gk-9999-salusit500-t1, 16 Oct, watched at unit, 5 changes)
- Intesis setpoint (bench funklet-intesis-29d1f022, 16 Oct, 3 changes)
- Salus iT700 setpoint (bench UAT Downstairs + Office + Upstairs, 16 Oct, MQTT fix, watched at unit)

BUILT not tested end to end:
- Salus iT500 hot-water boost (key-stem bridge bug fixed, dashboard code defect found - writes Desired not Requested)
- Intesis mode (BUILT, no bench run)

NOT SUPPORTED by spec this phase:
- iT700 mode, iT700 hwBoost, iT700 switch
- Tuya setpoint / mode / hwBoost
- Modbus AC (any write)
- Refrigeration switch (by design, must remain blocked permanently)

Lesson from OOHDASH-131: a claim that a vendor path "works" without a named device, dated proof, and a telemetry echo confirming the device changed is unproven. All PROVEN and PROVEN-BENCH claims above meet that standard. The iT700 MQTT fix is the key change: before 16 Oct, every iT700 setpoint command silently failed despite showing "accepted".

## Open Questions for Gate

These are the questions the gate panel and James / Spencer need to answer before build can start on the dependent items. They are reproduced here from the gate:contract header for reference.

Q1 (James): Intesis AC - offer setpoint control to OOH handlers, or continue referring to IoT team?

Q2 (James): Boiler panel - surface panel readings (status, hot water temp) in the dashboard?

Q3 (Spencer / IoT team): Salus iT700 entity cleanup - timeline for relabeling, duplicate resolution, stale binding removal?

Q4 (Spencer): iT700 "resume programme" command - available in same bridge update?

Q5 (Spencer): iT500 hot-water boost bench proof, after code defect (writes Desired not Requested) is fixed?

Q6 (Spencer): Intesis mode bench proof?

Q7 (Spencer): Prod freshness window - raise to 3h or rely on Tuya ON-from-OFF gate bypass?

Q8 (Spencer): Intesis liveness timestamp from bridge to prevent false "device offline" gate refusals?
