# RESEARCH-S12-Q7: Intesis and boiler panel under the new bridge (OOHDASH-123, 2026-10-14)

Method: read-only prod ThingsBoard GETs only (rule chain list and metadata, device profiles, device lists by profile, attribute keys for all 246 airConditioningProfile and 223 boilerControl devices, attributes and latest timeseries keys for the 13 *-intesis-* entities), plus Jira search/read, Teams and SharePoint search/read. Credentials loaded from the CIR env file inside a script; none printed or stored. Secret-like values (an Intesis token attribute, rule-chain header secrets) were redacted before anything was saved. No writes of any kind.

## Questions (verbatim)
- S12 (matrix 6.x): Does Intesis or the boiler panel write any status under the new bridge?
- Q7 (matrix section 4 / PR #60): "Intesis ack and comms path". Matrix wording: "tbc, LOW (~11 units). No *SyncStatus observed; OnOff/FanSpeed unproven; R10A vs AC Cloud conflict." Source wording (TOPO 7 Q7): "Intesis control-ack + comms path. No *SyncStatus observed; is there any ack beyond telemetry echo? Are OnOff/FanSpeed controllable? New conflict to resolve: Sam says AC control routes via the R10A (Modbus); SD-195 says each unit connects direct to AC Cloud." Owner Spencer, review under OOHDASH-98.

## Headline (read this first)
1. The matrix has conflated TWO different air-con populations. The 246 prod devices on profile airConditioningProfile (including gk-birchwoodfarm-ac-1, our "Intesis" read evidence) are NOT bridge/AC Cloud Intesis units. The real bridge Intesis units are 12 entities named *-intesis-* on profile "default" with vendor_id = intesis (plus one legacy test entity). This resolves the R10A vs AC Cloud conflict: both are true, for different units.
2. Intesis is now inside the new command path: those 12 entities fall on the Root Rule Chain, which forwards ATTRIBUTES_UPDATED into IoT Command Gate, and they carry the vendor_id / vendor_device_id attributes that make the gate ring the bridge doorbell. So the gate WOULD write pending/rejected for them. Whether the bridge then writes accepted is unseen. No Intesis command has ever run under the new contract.
3. The boiler panel is NOT in the gate path at all. No status, ever.
4. Matrix correction on boilers: V1 (output1OutputMask) is the MAJORITY, not absent. Of 223 boilerControl devices, 148 are V1 and 78 are V2 (some carry both marker families; 4 carry neither). The "no V1 in the sample" gap is closed.

## S12 answer

### Intesis: DEDUCED (medium) that the gate will write status, UNRESOLVED whether the bridge writes accepted
What is PROVEN:
- No Intesis entity carries any new-contract status attribute. Across the 12 bridge entities and the legacy one there is no setpointSyncStatus, modeSyncStatus or LastError attribute and no *Requested attribute. (Attribute sweep, 2026-10-14.)
- The only SyncStatus-shaped keys anywhere are legacy TELEMETRY series: setpointSyncStatus and modeSyncStatus on funklet-intesis-29d1f022 (last 2026-06-12 14:05 and 14:06) and setpointSyncStatus on md-1244-intesis-c7ea6f88 (last 2026-06-12 13:42), alongside setpointReported and modeReported. That is the old 09-25-era Desired/Reported/SyncStatus contract, on a test day, and nothing since. So the old contract did once produce Reported plus SyncStatus for Intesis, as telemetry, which is the opposite of the new SERVER_SCOPE attribute design.
- Desired attributes exist on three entities only (modeDesired/setpointDesired on funklet-intesis-29d1f022 and md-1244-intesis-c7ea6f88, setpointDesired 21 on md-1244-intesis-357ae8ad). They are test leftovers; no status follows them under the new contract.
- Routing (prod rule chains, GET metadata): the 12 entities are profile "default", which has no default rule chain, so they run the tenant Root Rule Chain. Root Rule Chain contains an IoT Command Gate rule-chain-input node fed by Message Type Switch on Attributes Updated. The airConditioningProfile profile runs the "Intesis Control" chain, which also forwards Attributes Updated to the gate (see Q7), but that chain governs the legacy entity and the 246 Modbus units.
- Gate logic for these entities (rule chain 19b53ec0, nodes "identify capability", "freshness outcome", "binding-free vendor?", "build doorbell body"): capability keys setpointRequested and modeRequested are recognised; profile "default" has a freshness key list that includes mode, setPoint and currentTemperature (all present and fresh on 9 of the 12); "binding-free vendor?" is true when the CLIENT attribute vendor_device_id is present, which all 12 have; the doorbell body then carries vendorId intesis and the vendorDeviceId.
- Spencer's SD-446 command coverage audit (SharePoint, SD-446-command-coverage-audit.md, 10-12 Oct) says the Intesis adapter implements setpoint and mode only (on/off is expressed through mode; no fan command anywhere, IFanCommands does not exist), and at audit time "doorbell not wired" for Intesis and Salus. The live gate no longer matches that audit's section 4 (it now keys on vendor_device_id, not only the Tuya devId), so the gate was generalised after 11 Oct (matching the "AFTER/BEFORE" gate backups of 11 Oct 08:05 and 08:12 on SharePoint). Gate change is live; the bridge-side handling for intesis is the unseen half.
- The audit's own last-proven table: "Salus / Intesis setpoint or mode: not established".

DEDUCED (medium): a setpointRequested or modeRequested write to an Intesis entity would produce, from the gate, a pending attribute write then a Desired write then a doorbell POST; gate-origin rejections (stale freshness, malformed) arrive instantly. Reasoning: gate code is vendor-generic for any entity with vendor_device_id. The bridge writing accepted/rejected for intesis follows from the doorbell contract being vendor-generic and the adapter having the two methods, but this is UNPROVEN because it has never been exercised.

Value-shape risk (DEDUCED, medium): the gate stringifies the Requested value and writes it as Desired. Legacy Intesis Desired values were mode strings ("Off", "Cool") and numeric setpoints. Whether the bridge accepts on/off for Intesis as modeRequested = "off" (contract text in CIR OOH_TB_DIRECT_CONTROL_CONTRACT.md: off = off, anything else = on) is unproven.

### Boiler panel: PROVEN no
- Prod profile boilerControl runs rule chain "boilerControl" (12 nodes); a separate "boilerControlV2" chain (7 nodes) also exists. Neither contains the IoT Command Gate nor any Requested/SyncStatus logic. Both only save telemetry and CLIENT attributes, relay RPC to the device, set default SHARED attributes, route alarms and forward heating_scenario to site level.
- Attribute sweep of all 223 boilerControl devices: zero Requested, zero SyncStatus, zero LastError, zero *Desired. Keys present are the panel's own: V1 family (output1OutputMask, output1Override to output4Override, analogOutput1Override) and V2 family (zone.use_boiler for DHW, CHZ1, CHZ2, accom_1, accom_2, recirc_pump; default_override_duration_mins; boiler.analog_output_override).
- A switchRequested or hwBoostHoursRequested write to a boiler device would not reach the gate (the profile chain has no route to it), and no adapter exists (the only hwBoost adapter is Salus IT500, with 0 enabled accounts per the audit's gap 2).
- Jira/Teams: Sam/Jonathan describe the panel as TB-native, direct MQTTS, bare keys plus override RPC; migration ticket LH-INT-BOILER-001 is with Jonathan/Rikki (TOPO Q5). IS-303 (Team Handover) is the boiler panel end-to-end test script; IS-322/IS-324 are offline-panel fleet work. Nothing says the panel will adopt the Requested/SyncStatus contract.

S12 matrix default ("No; both stay non-controllable in OOH") stands for the boiler panel (PROVEN). For Intesis the default stands for R1 (control removed by OOHDASH-82, which Jira confirms Done) but the reason changes from "no status exists" to "gate path exists, bridge acceptance unproven".

## Q7 answer

### Comms path (R10A vs AC Cloud): DEDUCED (high) that both are true, for different units
Evidence:
- 246 devices on profile airConditioningProfile (prod). Their attributes carry no vendor_id, no vendor_device_id and no intesisDeviceId. Their telemetry is capitalised Modbus-register style: Temperature, Setpoint, Mode, OnOff, FanSpeed, ErrorCode, AlarmStatus, applianceOn, Electrical_Power and Electrical_Energy (gk-birchwoodfarm-ac-1, fresh 2026-10-14 09:07). The estate also has zone R10A gateways such as ac-r10a (R10A Modbus Gateway profile). This is the R10A Modbus path: Sam's position, and TOPO C4's ACCLOUD type label is wrong for these.
- 12 entities named gk-6770-intesis-*, md-NNN-intesis-*, funklet-intesis-*, profile "default", created 2026-06-02, with vendor_id = intesis and vendor_device_id (SD-195's 32-hex Intesis device id). Their telemetry is the bridge's normalised set: isOnline, connectivity, mode, currentTemperature, setPoint, heatingActive, coolingActive (fresh today for 9; md-413 reports only isOnline and connectivity; md-780 last 13 Oct 19:12; funklet-intesis last 28 Aug). This is the AC Cloud path: SD-195's design (accloud.intesis.com, 15-minute poll, 9 sites, 12 devices discovered; IS-256 account review Done) and Spencer's "11 bindings, 8 accounts".
- Legacy entity gk-st-office-intesis-1 (profile airConditioningProfile, created 2026-04-13, dead since April): the SD-195 prototype, with intesisDeviceId, a non-expiring access-token attribute, control_setpoint/control_mode telemetry and setpoint_reported. This is why the "Intesis Control" rule chain exists on airConditioningProfile: its REST node still points at a UAT host (intesis-uat.airedale-api.co.uk) with control_* keys, which would fire for any airConditioningProfile device that posts control_* attributes. It would never match the 246 Modbus units in practice. See the security note for the credential.

Consequence for OOH: our "~11 live Intesis units" are the 12 *-intesis-* entities, and the entity gk-birchwoodfarm-ac-1 used as Intesis read evidence in matrix 3.5 is an R10A-Modbus air-con, not an Intesis AC Cloud unit. The matrix READ row stays true for those 246 devices (they are readable air-con) but must be labelled R10A Modbus, not Intesis. The 12 true Intesis entities report only mode / currentTemperature / setPoint / isOnline, so there is NO OnOff, FanSpeed, ErrorCode or AlarmStatus for true Intesis units in ThingsBoard.

### Ack beyond telemetry echo
- Intesis (AC Cloud, 12 units): no ack attribute exists today (PROVEN, above). A status-bearing ack would only come from the bridge's accepted/rejected write after the doorbell, UNPROVEN. Telemetry echo available is mode and setPoint with 15-minute cadence (SD-195 polling interval; observed timestamps are on a roughly 15-minute grid, DEDUCED), so confirmation by echo would take up to about 15 minutes. Use the Salus-style generous limit if Intesis is ever reinstated.
- R10A Modbus air-con (246 units): no command path via the new contract at all. TOPO's "AC control routes via the R10A" has no Requested/Desired/status on any of the 246 devices (PROVEN). Its only ack would be register echo (Mode, Setpoint, OnOff, FanSpeed) with unknown latency.

### OnOff / FanSpeed controllable?
- True Intesis: on/off only through mode (adapter: setpoint and mode only); fan speed not controllable anywhere (SD-446 audit Gap 8, "product decision, not a defect"). DEDUCED high, direct from Spencer's audit.
- R10A Modbus: Modbus registers exist for OnOff and FanSpeed as telemetry; write capability unknown (UNRESOLVED, T3/IoT-team knowledge).

### Verdict: DEDUCED for the path conflict (high), PROVEN for no-ack-today, UNRESOLVED for bridge acceptance and Modbus writes. Moot for R1.

## What this changes in the matrix and for Design
1. Matrix 3.5 READ and FEEDBACK rows: re-label the TB evidence. gk-birchwoodfarm-ac-1 is an R10A Modbus air-con (airConditioningProfile), not Intesis. Add the 12 *-intesis-* entities (profile default, vendor_id intesis) as the actual Intesis population, with the keys above. This is a CONTRADICTION row (evidence mislabelled).
2. Matrix Q7: change status to "path conflict RESOLVED (both exist, different populations); ack UNPROVEN; still moot for R1". Our device classifier (tb-device.js:417-421, which forces non-controllable by profile or type) should key true Intesis on vendor_id = intesis, not profile name airConditioningProfile; Design should decide whether the 246 Modbus units are "aircon, refer via ticket" only.
3. Matrix 3.6 READ V1: replace "no V1 panel in the sample" with 148 V1 and 78 V2 of 223. Both branches are load-bearing; the V1 branch is the majority and must be tested. Matrix 3.6 FEEDBACK/CONTROL stands (no status, no gate path).
4. S12 row: both sub-answers recorded above; no change to the default for R1.
5. If Intesis control is ever reinstated (OOHDASH-98): the write is setpointRequested / modeRequested on SERVER_SCOPE (per RESEARCH-S2-S3), the 12 entities are the only candidates, treat any outcome as INDETERMINATE until one accepted status is observed in UAT, and note the entity-level freshness check passes on any of mode, setPoint, currentTemperature (so "stale" is rare).
6. Do not enable boiler control through the gate: not routed, no adapter.

## Security note for James (value deliberately not reproduced)
Entity gk-st-office-intesis-1 still holds a SERVER_SCOPE attribute intesisAccessToken (confirmed present 2026-10-14; the SD-446 audit says non-expiring and duplicated on the dev tenant). Rotate as well as delete the attribute. Separately, the "Intesis Control" chain's REST node targets a UAT hostname from the PROD tenant; harmless for the 246 Modbus devices but inconsistent.

## UNRESOLVED: residual questions for Spencer (one line each, with our default)
- Q-S12a: Does the prod bridge write accepted/rejected for vendor intesis after the doorbell (setpoint and mode), and has any Intesis command ever been run under the new contract? Default: no, treat as unproven; keep Intesis capture-and-refer; any future write is INDETERMINATE until one accepted is observed in UAT.
- Q-7a: Is on/off for Intesis modeRequested with the value off (any other value on), and what exact mode strings does the adapter accept (Off, Cool, Heat, Auto, Fan)? Default: off / cool / heat / auto / fan per CIR contract, unproven.
- Q-7b: Can the 246 R10A Modbus air-con units be written at all (OnOff/Setpoint registers), and is that in scope for any bridge capability? Default: read-only context; aircon stays capture-and-refer.
- Q-7c: Will the legacy gk-st-office-intesis-1 and the "Intesis Control" chain be retired? Default: yes, ignore both in OOH.
- Q-S12b: Will the boiler panel ever move onto the Requested/SyncStatus contract (LH-INT-BOILER-001, Jonathan/Rikki)? Default: no for this release; monitor-only.

## Sources and gaps
- Prod TB GETs 2026-10-14: /api/ruleChains, /api/ruleChain/{id}/metadata for IoT Command Gate (19b53ec0), Intesis Control (b9faa1f0), boilerControl (f6ee7ec0), boilerControlV2 (a214a4f0), airConditioningProfile chain (c400fce0), Root Rule Chain (reference scan); /api/deviceProfiles; /api/tenant/devices by profile and by text search "intesis"; attribute keys (246 AC, 223 boiler); values/attributes and values/timeseries for the 13 intesis entities and gk-birchwoodfarm-ac-1/-3.
- Jira: OOHDASH-98, OOHDASH-82, OOHDASH-101, SD-195, SD-492 (comments), IS-303/322/324 listing.
- SharePoint: SD-446-command-coverage-audit.md (read in full); SD-598-iot-command-contract.md, SD-492 command matrix and gate backups located, not read in full.
- Local: matrix at origin/main (sections 3.5, 3.6, 4, 6); TOPO model and companion on origin/docs/oohdash-101-estate-topology (section 7 Q7); CIR OOH_TB_DIRECT_CONTROL_CONTRACT.md lines 12-13, 39, 44-45.
- Gaps: bridge source and cluster not inspected, so the bridge-side Intesis acceptance is unseen. Telemetry history for the intesis entities was not pulled (latest values only). Teams search returned only boiler-panel operations chatter, no Intesis control evidence. Counts for V1/V2 come from attribute key presence across scopes (a device can show both families).
