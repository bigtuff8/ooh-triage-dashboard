# RESEARCH-S4-S5: how the command gate refuses, and whether it admits the dashboard (OOHDASH-123, 2026-10-14)

Method: read-only prod ThingsBoard GETs only. Credentials were loaded from the CIR env file inside scripts and never printed or stored. I re-read all 61 rule chain metadata documents (redacted on save), the device profile to rule chain mapping, and the audit log for the Brackley outlet. Nothing was written to any system. The doorbell secret was not copied or quoted anywhere; it is referred to only as "the doorbell secret".

## Questions (verbatim from matrix section 6.1)
- S4: How does the command gate refuse a command: rejected plus LastError, or no status at all? What does it check (caller, device, value)?
- S5: Does the gate admit the dashboard's write identity (svc-control)? Is there an allowlist by device or profile?

## Headline
- S4: PROVEN. The gate refuses with SyncStatus = rejected plus LastError prefixed "gate: ", in four cases. In three other situations it refuses with NO status at all (silent drop or stuck pending). It checks value (only non-empty), device freshness and profile. It never checks the caller.
- S5: PROVEN for the gate itself (no caller check, no device allowlist). The only admission rule is an implicit PROFILE allowlist: a profile must route to the gate, and must have a freshness key list (Tuya ON-from-OFF excepted). svc-control already writes through it (audit log).
- Independent verification of the S2/S3 finding: CONFIRMED in full (same chain, same node logic). Nothing in it was wrong. Our code does write the Desired keys directly (services/registry.js lines 114, 118, 133, 141, 149; services/tb-client.js lines 16-19).

## Gate rule chain, node by node (prod "IoT Command Gate", id 19b53ec0-c4b1-11f1-bf95-995fa7662af0)
Source: GET /api/ruleChain/{id}/metadata, 21 nodes (indexes 0 to 20), debug off on all.

Entry: the gate is reached only from four other chains, each through a "Message Type Switch" ATTRIBUTES_UPDATED branch: Root Rule Chain, Salus (Root Rule Chain), Tuya (Root Rule Chain) and Intesis Control. Then node 0 filters message type ATTRIBUTES_UPDATED again.

## S4: every refusal condition (complete list from the chain)

Refusals that write rejected plus LastError (all written to SERVER_SCOPE through the shared "write rejection (SERVER)" node, which also forces updateAttributesOnlyOnValueChange false):

| # | Exact LastError text | Condition | Node |
|---|---|---|---|
| G1 | gate: malformed value | The requested value, after turning it into a string, is empty or the literal text "null". Nothing else about the value is checked (no type, no range, no allowed-values list). | 1 identify capability, 3 build malformed rejection |
| G2 | gate: device offline | Profile has a key list, and none of its keys has a non-empty value in the last 45 minutes of telemetry (fetch limit 2 per key). Skipped entirely by the direction bypass (below). | 4 fetch device telemetry, 16 freshness outcome (stale), 5 build offline rejection |
| G3 | gate: no freshness keys defined for profile X (X is the device profile name) | The device profile name is not one of the six in the key table. Skipped by the direction bypass. | 16 freshness outcome (noProfileKeys), 17 |
| G4 | gate: internal fault | The Failure output of ANY gate node fires: script error, telemetry or attribute fetch error, attribute write error. If the capability was not yet identified, the status key written is gateSyncStatus and gateLastError (cap falls back to the word "gate"). | 11 build gate fault, wired from nodes 0,1,2,3,4,5,6,7,8,9,12,13,14,15,16,17 |

The six profiles with a freshness key list: default, salusDevice, airConditioningProfile, tuya Profile, gatewayDevice, IT700TX. Key lists are in the S2/S3 file and the chain metadata. Any other profile that reaches the gate gets G3 (unless bypassed).

The direction bypass (node 14): applies only to a device with a devId SERVER attribute (the Tuya marker). If the requested value is ON (true, True, TRUE, on, On, ON or 1) and the last known switch_1, switch or applianceOn value (looked back 30 days, node 12) was false, the freshness check is skipped and the command goes straight to pending. Consequence: an offline Tuya outlet that was last OFF accepts a turn-ON request through the gate (pending, Desired written, doorbell rung) and the outcome is left to the bridge and the vendor. OFF requests are never bypassed.

Silent non-refusals (NO status written, the caller sees nothing):

| # | Situation | Why it is silent | Confidence |
|---|---|---|---|
| N1 | Key is not one of the four Requested keys (notARequest) | Node 1 sets gateOutcome notARequest, but the "route on outcome" switch (node 2) has outputs only for malformed and ok. The message is dropped. This also stops loops: the gate's own pending and Desired writes and the bridge's status writes all fall here. | PROVEN (connection list) |
| N2 | Message carries several Requested keys at once | The foreach in node 1 keeps only the LAST matching key; other capabilities in the same write are ignored with no status. Send one Requested key per write. | PROVEN (script text); the key iteration order was not tested |
| N3 | Device whose profile does NOT route through a chain containing the gate | The Requested write fires ATTRIBUTES_UPDATED but nothing listens. No status, ever. See the profile table below. | PROVEN (profile to chain mapping, chain input nodes) |
| N4 | Doorbell fails (bridge down, 10 s timeout, 4xx or 5xx) | Node 20 "ring doorbell" has no outgoing connection of any kind, not even Failure (the connection list has no fromIndex 20). The error is dropped, so SyncStatus stays at pending with no gate-written rejection. Nothing in the gate times pending out. | PROVEN (connection list) |
| N5 | Device has neither vendor_device_id (CLIENT) nor devId (SERVER) | Node 18 "binding-free vendor?" false branch has no connection. Pending and Desired are written, no doorbell is rung, and pending stays. Whether the bridge acts anyway is the open point in the last section. | PROVEN (connection list) |

What the gate does not check (answers the "caller, device, value" part of S4):
- Caller: not checked. No node reads the user, the originator user id, or any message metadata about who wrote.
- Device: no per-device allowlist or denylist. Only the device profile name (G3) and telemetry freshness (G2).
- Value: only empty or "null" (G1). A setpoint of 99, a mode of "banana" or a hwBoost of 50 passes the gate. Range and enum validation is the bridge's job: the bridge writes rejected with a "vendor:" LastError (see the CIR contract: Salus IT700 setpoint 5-35, Intesis 16-32, hwBoost 0-9).
- Scope: the gate does not look at which scope the Requested key was written to; SERVER_SCOPE is only the documented convention. DEDUCED, high confidence.

Profile routing (device profile default rule chain, GET /api/deviceProfiles; gate reachable only via these four chains):

| Reaches the gate | Profiles |
|---|---|
| Via Root Rule Chain (profiles with no own chain) | IT700TX, AMR_profile, trendbms, ovenMonitoringprofile, ambientTempMonitoringProfile, testapp, boiler-control, EnergyMeter, fridgemonitoring, fridgeSimpleTempMonitoringProfile, sparkplugTest_SD423 (and its device profile), unoxDevice, default, gatewayDevice, R10A_Gateway, smart-sensor, hvac, energy-meter, water-meter, gateway |
| Via Salus chain | salusDevice |
| Via Tuya chain | tuya Profile |
| Via Intesis Control chain | airConditioningProfile |
| Does NOT reach the gate (own chain, no gate input node) | powerpause, powerpause-circuit, contactorModule, boilerControl, Commissioning Gateway, door profile, pulseCountingProfile, directLoraMeterProfile, greasePakMonitoringProfile, warewashMonitoringProfile, Supermarket Devices profiles (Chiller, Door Sensor, Liquid Level Sensor, Motion Sensor, Occupancy Sensor, Smart Bin), fryerMonitoringProfile, roof/cellar/fridge-and-freezer/heatingHotWater/ovenMonitoring/iceMachine/gasValve profiles, fryerGatewayProfile, AI, R10A Modbus Gateway, Water Meter, remoteMonitoringProfile, meterOnlyProfile, remoteItProfile, ttsProfile, CJ TEST default, SD Test Profile |

Relevance to OOH: the four profiles OOH controls (tuya Profile, salusDevice, airConditioningProfile, IT700TX) all reach the gate, and all four have a freshness key list. boilerControl and boiler-control: boilerControl does not route to the gate (consistent with the CIR note that boilers are non-standard, monitor-only in OOH v1). Careful: the "boiler-control" profile (hyphen) is on the Root chain and would reach the gate, and would get G3.

Observed-in-the-wild refusals (audit log evidence). Coverage is thin, see Gaps:
- Source: GET /api/audit/logs/entity/DEVICE/34321500-398f-11f1-be0a-ab8c63f251de (ag-brackley-poweroutlet-6), 28 entries, all by svc-control, status pairs only.
- Distribution of the final status writes: 9 accepted with empty LastError; 4 rejected with "vendor: No active Tuya session owns device ..." (quoted with the device id elided); 1 rejected with "vendor: Tuya POST .../commands returned success=false (code 1106): permission deny".
- Zero "gate: ..." refusals appear in that sample. So G1 to G4 are PROVEN from rule chain source, but there is no observed event of any of them. No gate-origin refusal has ever been seen by this research.
- Reminder for Design: a gate rejection has no bridge hop, so it arrives within the same second as the request and the status write is an audit-logged REST-visible rule engine write only if audited; the rule-engine attribute writes (pending, Desired, and gate rejections) are NOT in the audit log. So audit-log evidence of gate refusals cannot exist by construction (rule-engine attribute nodes are not audited, S2/S3 finding). Live device attributes are the only place a gate rejection is observable, and attributes keep only the latest value.

## S5: does the gate admit svc-control? Allowlist?
- Caller admission: PROVEN yes, in the sense that there is no caller test. Evidence: svc-control@airedale-group.co.uk wrote every Requested key in the 28-entry audit sample and each produced a status. The gate sees an ATTRIBUTES_UPDATED message and nothing about the user.
- The real admission control is ThingsBoard's own RBAC on the REST write (the identity must be allowed to write SERVER_SCOPE attributes on that device). The gate cannot add to or remove from it. The "Airedale Read Only" role named in the CIR contract cannot write attributes, so a read-only identity could not use the gate at all. Whether OOH's own identity has that write permission is exactly what James's approved J8 test proves; this research did not test it (no writes allowed).
- Device or profile allowlist: no device allowlist. An implicit profile allowlist exists by routing and by the key table (see the profile table). For the four OOH-controlled profiles nothing blocks.
- Per-capability allowlist: only the four Requested keys are recognised (switch, setpoint, mode, hwBoostHours). The gate does not check that a device supports the capability (a mode write to a heat-only unit passes the gate; refusal comes from the bridge, "vendor:" or rejected capability).
- Deployment caveat: the gate also gives no caller identity in any record it writes, so the dashboard cannot be distinguished from other writers (such as an engineer's manual write) in the rule chain or the status attributes.

## Can a direct Desired write reach the bridge without the gate?
Verdict: UNRESOLVED (not testable read-only, bridge source not found). The evidence points both ways, so I split it into what is proven and what is deduced.

PROVEN:
- Within the rule chains, nothing else consumes any Desired or Requested key. A grep across all 61 prod rule chain metadata documents finds the strings Desired and Requested only in the gate chain. So a direct Desired write triggers no rule-engine path to the doorbell. The doorbell is rung only by node 20, which is downstream of the gate's Desired write.
- The gate itself writes Desired with notifyDevice true (node 9). That makes ThingsBoard push the shared attribute change to any connected device or gateway session. So the shared-attribute push path to the bridge exists today in addition to the doorbell.
- The bridge doorbell is only called for devices with vendor_device_id/vendor_id (CLIENT scope, set by the bridge when it claims a device) or devId (SERVER scope, set by the ThingsBoard Tuya integration): node 18 comment in the chain.
- Pre-gate evidence that a direct Desired write worked: James's 6 Oct message to Spencer says the bench Tuya device flipped in about 3.2 s both ways on a direct Desired write (bench-owon-1, UAT, before the gate existed). Source: C:/harness-runs/iot-ooh-dash/SPENCER_TEAMS_2026-10-10_PRIMARY_SOURCE.md message 1. The CIR contract (OOH_TB_DIRECT_CONTROL_CONTRACT.md) also documents the old edge-triggered direct-Desired contract, with the registration rule "TB only forwards for a device the bridge has already claimed".

DEDUCED:
- Claimed Salus and Intesis devices (bridge publishes vendor_id / vendor_device_id): a direct SHARED_SCOPE Desired REST write very likely still reaches the bridge through ThingsBoard's attribute notification to the bridge's device sessions, bypassing pending and the freshness check. Confidence: medium. Chain: the old contract worked this way, the gate keeps notifyDevice true, and the CIR registration-gate rule only makes sense for a push subscription.
- Tuya devices created by ThingsBoard's own Tuya integration (devId marker, no bridge session): the doorbell may be the ONLY trigger in the new bridge, so a direct Desired write may do nothing. Confidence: low. Chain: node 18 and 19 treat the devId case as "tuya" and send vendorId "tuya" in the doorbell body; there is no evidence the bridge subscribes to those entities.
- The bridge may also ignore or treat differently a Desired value written as a JSON boolean instead of the string the gate writes (the gate always writes a string). Confidence: low.

What this means: even if a direct Desired write still works for some devices, it skips the gate's pending marker, offline check and doorbell, so the dashboard would get no SyncStatus pending and, on Tuya, possibly no dispatch at all. It must not be the production write path.

## What this changes in the matrix and for Design
1. Matrix CONTRADICTION row (from S2/S3) stands and is strengthened: the command must be a Requested write. Add that the gate does not validate value range, so the dashboard keeps its own guardrails (registry.js ranges) as the first line and the bridge's "vendor:" rejection as the second.
2. Add the three silent-failure cases to the delivery model: N3 (profile does not reach the gate), N4 (doorbell failed, pending forever) and N5. They all end as stuck pending, which our settle rule already maps to INDETERMINATE. Design must not treat a long pending as a bridge fault only: it can be a dropped doorbell.
3. Q-S4 residual (does anything time out pending?) is now answered for the gate: nothing in the gate does. The only timeouts are ours. Keep the per-vendor limit then INDETERMINATE.
4. Display: gate refusals are rejected with "gate: ..." (G1 to G4) and vendor refusals with "vendor: ...". Map the prefix to who to blame: "gate: device offline" is a ThingsBoard freshness verdict (no telemetry in 45 min); show it verbatim with retry guidance. "gate: no freshness keys defined for profile X" is a configuration fault, not a device fault, and should be escalated, not retried. "gate: internal fault" is retry once then escalate.
5. Direction bypass means an OFF-last Tuya outlet that is really offline will show pending then (at best) a vendor rejection, not "gate: device offline". The dashboard must not rely on the gate to catch offline Tuya turn-ON.
6. Write one Requested key per request (N2).
7. Value format: send true/false as booleans or strings; the gate stringifies. Empty string or null is refused (G1).

## Security note for James (value deliberately not reproduced)
The "ring doorbell" REST node carries the doorbell secret in an X-Doorbell-Secret header in plain text, readable through the rule chain metadata API by this tenant identity. This is the only rule chain of the 61 with a doorbell. My own working copies were redacted on save; no secret is in this file. Suggest Spencer rotates it and moves it out of the rule chain config. Unchanged from S2/S3.

## UNRESOLVED: residual questions for Spencer (one line each, with our default)
- Q-S4a: Does a direct switchDesired / setpointDesired write via REST still dispatch on prod-sd446-v1 (Salus, Intesis, and especially the Tuya-integration devices), or is the Requested write the only supported path? Default: write Requested only; treat direct Desired as unsupported and never use it. Prove nothing by writing Desired in prod.
- Q-S4b: If the doorbell fails or the bridge is down, is there a sweeper that writes rejected, or does pending stay forever? Default: no sweeper; our own per-vendor timeout then INDETERMINATE.
- Q-S5a: Does the bridge validate and refuse by capability and range (mode on heat-only, setpoint out of range) with a "vendor:" LastError? Default: yes, as in the CIR contract; the dashboard also validates first.
- Q-S5b: Is the profile list that reaches the gate intended (powerpause, contactorModule, boilerControl and the monitoring profiles do not route to it)? Default: yes for OOH scope; no OOH control targets those profiles.

## Coverage gaps (honest record)
- Refusal evidence in the audit log is limited to ONE device (ag-brackley-poweroutlet-6, 28 entries). I tried tenant-wide and per-user audit scans; they hit 429 and 500 responses and were aborted at the coordinator's instruction. The 429s were partly caused by my own scanning on live prod; I stopped all scanning processes. Because gate rejections are not audit-logged anyway (rule-engine writes), a wider scan would not have found gate-origin refusals; it could only have found more vendor refusals.
- The user-wide audit sample for svc-control (3 days, 4000 rows) contained only remote-IT attribute writes (remoteItActive etc.), so svc-control is not a clean "command-only" identity: it is also used for non-command writes. Not an OOH-risk by itself, but it means the audit log cannot be filtered by user to isolate OOH commands.
- Bridge source: not found (no GitHub repo visible to this identity matched the doorbell route or secret header name; the CIR has no bridge-source doc). Jira text search for doorbell, command gate, switchRequested and SyncStatus found no ticket documenting the gate (SD-492 and SD-664 are loose matches). Teams, Outlook and SharePoint were not searched.
- No live attribute state was re-read for any non-Brackley device this pass.

## Sources
- Prod ThingsBoard GETs, 2026-10-14: /api/ruleChains; /api/ruleChain/{id}/metadata for all 61 chains; /api/deviceProfiles; /api/audit/logs/entity/DEVICE/34321500-398f-11f1-be0a-ab8c63f251de; /api/audit/logs/user/{svc-control id} (3-day sample).
- C:/harness-runs/iot-ooh-dash/research/RESEARCH-S2-S3.md; C:/harness-runs/iot-ooh-dash/SPENCER_TEAMS_2026-10-10_PRIMARY_SOURCE.md.
- CIR: OOH_TB_DIRECT_CONTROL_CONTRACT.md, OOH_BRIDGE_CONTRACT.md.
- OOH repo: services/registry.js, services/tb-client.js.
