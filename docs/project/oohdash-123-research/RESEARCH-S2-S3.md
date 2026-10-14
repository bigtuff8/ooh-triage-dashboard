# RESEARCH-S2-S3: the pending write and switchRequested (OOHDASH-123, 2026-10-14)

Method: read-only prod ThingsBoard GETs (device attributes, audit logs per entity, rule chain list and metadata). Credentials were loaded from the CIR env file inside a script; none printed or stored here. No writes of any kind.

## Questions (verbatim from matrix section 6.1)
- S2: Is pending written as its own attribute write before accepted? Attributes keep no history, so we only ever see the latest status and its lastUpdateTs.
- S3: What is switchRequested (SERVER_SCOPE)? Is it the gate's record of what passed? Should the dashboard read it?

## Headline
S2 is answered yes. S3 is answered no, and the answer reverses our write-path model: switchRequested is the command gate's INPUT, written by the caller, not its record.

## S2 verdict: PROVEN (rule chain source, plus audit timing)
pending is its own attribute write, made by the command gate. The vendor outcome (accepted or rejected) is a second write made later by the bridge. That is Spencer's "written twice".

Evidence: prod rule chain "IoT Command Gate", id 19b53ec0-c4b1-11f1-bf95-995fa7662af0 (GET /api/ruleChain/{id}/metadata). Happy path:
1. Filter on message type ATTRIBUTES_UPDATED.
2. "identify capability" (TBEL) maps switchRequested to switch, setpointRequested to setpoint, modeRequested to mode, hwBoostHoursRequested to hwBoostHours. Empty or "null" value = malformed. No such key = not a request, ignored.
3. malformed: writes <cap>SyncStatus = rejected and <cap>LastError = "gate: malformed value" (SERVER_SCOPE). One write, ends.
4. ok: fetch device profile, last known switch state, devId / vendor attributes, then a "direction bypass" check.
5. Direction bypass: for a vendor/Tuya device, if the request is ON and the last known switch state is OFF, freshness is skipped. Otherwise it fetches 45 minutes of telemetry and checks a per-profile key list (tuya Profile: switch_1, switch, cur_power...; salusDevice: localTemperature, heatingSetpoint...). Stale = rejected with "gate: device offline". A profile with no key list = rejected with "gate: no freshness keys defined for profile X".
6. Fresh or bypassed: "write pending (SERVER)" writes <cap>SyncStatus = pending. This is write number 1.
7. "write desired (SHARED)" then writes <cap>Desired = requested value to SHARED_SCOPE with notifyDevice true.
8. For bridge-claimed or Tuya devices it then POSTs to the bridge "doorbell" endpoint (iot-bridge.airedale-group.io/api/command/doorbell) with tbEntityId, vendorId, vendorDeviceId.
9. Any node failure: "gate: internal fault" rejection.
The bridge then writes accepted or rejected plus LastError (write number 2). The gate never writes accepted.

Audit evidence (GET /api/audit/logs/entity/DEVICE/34321500-398f-11f1-be0a-ab8c63f251de, 9 to 14 Oct): 28 ATTRIBUTES_UPDATED entries, all by user svc-control@airedale-group.co.uk, SERVER_SCOPE, always in pairs: {switchRequested} then 0.1 to 1.1 s later {switchSyncStatus, switchLastError}. Example, Spencer's test: 16:41:07.952 switchRequested false; 16:41:08.845 accepted (0.89 s); 16:41:10.073 switchRequested true; 16:41:10.343 accepted (0.27 s). The pending and Desired writes do not appear in the audit log because rule-engine attribute nodes are not audited; only the REST writes (Requested, and the final status) are. Live attributes on 14 Oct: switchRequested true 10:28:27.793Z; switchDesired "true" 10:28:27.866Z (73 ms later, the gate hop, with pending written in between); switchSyncStatus accepted and switchLastError "" 10:28:28.393Z (600 ms after the request).

Why pending is invisible now: attributes keep only the latest value and accepted overwrote it. Pending is only observable for about 0.3 to 1 s (Tuya) or minutes (Salus).

Failures seen in the audit log, confirming rejected plus LastError is real: "vendor: Tuya POST .../commands returned success=false (code 1106): permission deny" (10 Oct 13:52Z, before prod used the production Tuya project); "vendor: No active Tuya session owns device ..." (10 Oct 17:31 and 17:39; 12 Oct 07:27 and 09:40), each followed by an accepted command minutes later. So vendor errors are prefixed "vendor:" and gate errors "gate:".

## S3 verdict: PROVEN
switchRequested is the request key the caller writes to SERVER_SCOPE. The chain triggers on an ATTRIBUTES_UPDATED message containing it. In the audit log the writer is svc-control, the command identity. The gate then validates and itself writes the Desired key. It is not "the gate's record of what passed" (pending/Desired are that).

Consequences:
- To command through the gate, the caller writes <cap>Requested (SERVER_SCOPE), not <cap>Desired (SHARED_SCOPE). Our code (services/tb-client.js:16-19, registry.js:132-133) writes switchDesired, setpointDesired, modeDesired, hwBoostHoursDesired. A direct Desired write bypasses the gate (no pending, no offline check, and the doorbell is inside the gate chain). Whether the bridge still acts on a direct Desired write is UNPROVEN and was not tested (no writes allowed).
- No caller allowlist exists in the chain: it filters on message type only, not on originator. svc-control already wrote every Requested key in the audit log, so it is evidently admitted. This largely answers S5 (the residual is TB RBAC for the OOH identity, which James's J8 test command proves).
- Dashboard should read switchRequested only as a freshness anchor: its lastUpdateTs is when the request was raised (a cleaner dispatchTs than our own clock). A SyncStatus with lastUpdateTs at or after it belongs to this request; older is stale.
- Value type (partly answers S11): the gate stringifies the value, so a JSON boolean on Requested is fine. Desired is written by the gate as a string, which is why brackley holds "true". The direction-bypass test accepts true/True/TRUE/on/On/ON/1 as ON.
- Gate freshness key lists exist only for profiles default, salusDevice, airConditioningProfile, tuya Profile, gatewayDevice, IT700TX. Other profiles are rejected "gate: no freshness keys defined" unless the ON bypass applies.

## What this changes for the matrix and Design
1. New CONTRADICTION row: command write is <cap>Requested on SERVER_SCOPE, not <cap>Desired on SHARED_SCOPE. High impact for Build and the dispatch design.
2. S2 closes: pending (gate) then accepted or rejected (bridge). Settle rule stands: pending is never final. Gate-origin rejections ("gate: ...") arrive instantly with no bridge hop.
3. S7 (re-send when Desired already equals the value) is probably resolved: the gate rewrites Desired and rings the doorbell on every Requested write (updateAttributesOnlyOnValueChange false, ON_EVERY_MESSAGE), so re-writing Requested re-fires. DEDUCED, medium confidence; the bridge side is unseen.
4. Offline is decided by the gate (no fresh telemetry in 45 min, except ON when last known OFF). The dashboard can show the gate's reason verbatim instead of duplicating the check.
5. Salus key names are DEDUCED, high confidence: setpointRequested, setpointSyncStatus, setpointLastError (same for mode and hwBoostHours, all in the gate's capability map).
6. Matrix S3 default "ignore it" should become "write it; read only its timestamp".

## Security note for James (value deliberately not reproduced)
The "ring doorbell" REST node in the IoT Command Gate carries a shared secret in an X-Doorbell-Secret header, readable in plain text through the rule chain metadata API by a tenant-admin identity. Suggest Spencer rotates it and moves it out of the rule chain config.

## UNRESOLVED: residual questions for Spencer (one line each, with our default)
- Q-S3a: Do we now write switchRequested (SERVER_SCOPE, true/false) instead of switchDesired, and does a direct switchDesired write still dispatch? Default: write Requested; treat direct Desired as unsupported. Prove in the approved J8 test.
- Q-S2a: Does the bridge ever write pending itself, or only the gate? Default: gate writes pending, bridge writes the final state.
- Q-S2b: What are the intermittent "No active Tuya session owns device" rejections on ag-brackley-poweroutlet-6 (10 and 12 Oct), and will they recur? Default: show as a rejection with retry guidance.
- Q-S4 residual: if the bridge never answers, does anything time out the pending state? Default: our own per-vendor limit, then INDETERMINATE.
- Minor: Spencer quotes switch_1 confirming 0.06 s after accepted; telemetry here shows about 0.19 s and 0.29 s. Not a defect; use per-vendor limits, not point figures.

## Sources and gaps
- TB prod GETs on 2026-10-14: /api/tenant/devices?deviceName=ag-brackley-poweroutlet-6; .../values/attributes; /api/audit/logs/entity/DEVICE/{id}; /api/ruleChains; /api/ruleChain/19b53ec0-c4b1-11f1-bf95-995fa7662af0/metadata.
- C:/harness-runs/iot-ooh-dash/SPENCER_TEAMS_2026-10-10_PRIMARY_SOURCE.md; matrix lines 41, 51, 66, 70, 149, 188-191 (origin/main).
- Jira text search for "command gate" and switchRequested found no specific ticket (SD-492 and SD-664 only as loose matches). Teams, SharePoint and bridge source not searched, as the rule chain source was conclusive.
