<!-- gate:contract
SECTION: What this answers
OOHDASH-131 ThingsBoard layer. For each of the 14 device types in the capability table, this records what can actually be controlled from ThingsBoard, whether schedules can be seen or changed, and by which route: directly in ThingsBoard, or through the vendor bridge and its command gate. Every answer is split into two buckets. Tested means there is a dated record of a command or schedule change landing on that type of device. Theory means there is only a reason to think it could work, such as a contract, a key on the device or a vendor statement.

SECTION: Headline
Three kinds of device have a proven ThingsBoard control round trip in production, not two as first written. First, one Tuya smart socket at the Brackley test site was switched off and on through the vendor bridge on 10 and 12 October, and the socket reported the new state within about a second. No real lighting circuit, fan or kitchen circuit has had a confirmed command through that route. Second, pub boiler control panels are controlled directly in ThingsBoard as routine, estate-wide practice: since 20 September there have been about 2,000 override, schedule and command actions on about 130 panels by six staff logins, and 23 commands reported a failure. Third, PowerPause kitchen supply circuits: on 15 October between about 11:10 and 11:16 a staff administrator login switched four circuits at McDonald's site 1110 off and back on by device command, and each circuit confirmed within a second. PowerPause schedule changes made on 21 and 30 September were also echoed back. Intesis air-con target temperature and mode, including off, were confirmed on 12 June, but only on test or bench units under the old method. Salus thermostats have no confirmed command at all.

SECTION: What Spencer said versus the evidence
The phrase control and schedule visibility over most devices was not found word for word in any source read. The nearest written claims are Spencer's 17 September contract and matrix, which mark Tuya lighting, fans and kitchen switches as proven, and his 10 October message saying prod Tuya control is live and proven. Both are true only in a narrow sense: the September proof was four bench devices on the development system using a route that has since been replaced, and the October proof is one test socket. Spencer can also point to a 40-command run on the new route in the vendor's test system on 10 October (vendor-reported, not visible to us), our own 17 September bench re-proof, and a 24 of 24 bench run on 1 October. None of these is a production lighting, fan or kitchen circuit. Boiler panels and PowerPause circuits are controlled directly, outside his route. Salus control has never been confirmed, and schedules are readable for boiler panels and PowerPause but not for Salus or air-con in any usable form.

SECTION: The strongest gap
Thermostats are the biggest gap. Spencer's contract says Salus setpoint changes work and take a few seconds. In practice no Salus change has ever been confirmed in production or on the bench. His own 17 September contract shows his iT700 bench change left at pending, so his own evidence contradicts a few seconds. The two test changes sent on 24 and 25 September have been stuck at pending for three weeks. A later change on 12 October was sent to a unit already holding that value, so it proves nothing either way. The dashboard has offered Salus temperature changes since 24 September.

SECTION: Also worth knowing
The 7 October note that live control was verified live (OOHDASH-19 and OOHDASH-76) was a check that refrigeration switching is blocked. It was not a check that a command worked. Since 24 September, lighting on-commands to four circuits and several thermostat changes were sent by the old direct route, and none of them can be shown to have worked. The dashboard shares its ThingsBoard login with an automatic remote-access sync job that writes every five minutes. That makes dashboard commands very hard to pick out of the ThingsBoard audit log. The first version of this check sampled devices and so missed control made by other logins; an independent sweep of every user's audit log found the PowerPause and wider boiler-panel activity, and this version is corrected. The 15 October PowerPause commands came from a named staff member's tenant administrator login, not from the dashboard's login and not from any of our own logins, sessions or agents.

SECTION: What happens next
There are 12 new questions for Spencer. They do not repeat SQ-01 to SQ-13, and they refer to those where they overlap. The most useful next step is the J8 live test James already approved, widened from the one test socket to one real lighting circuit and one real thermostat. Until that runs, the table shows thermostat, lighting, fan and kitchen control as theory, not tested.
-->

# OOHDASH-131 - ThingsBoard layer: control and schedule evidence per device type

Discovery doer, 15 October 2026; corrected the same day after independent verification (OOHDASH-131_TB_LAYER_VERIFICATION.md, 18 corrections, all applied). Companion to OOH_DEVICE_CAPABILITY_TABLE.md (same branch). Scope: the 14 device types in that table. Question per type: what can be controlled from ThingsBoard (TB), is schedule information visible or editable, and by which path, direct TB (attribute write or RPC) or TB via the vendor integration bridge and its IoT Command Gate (the Requested keys).

## 1. How to read this

- TESTED / VALIDATED = a dated record that a command or schedule change actually landed on that device type: an audit-logged write followed by the device reporting the commanded state, a logged live test, or a confirmed operator action. Each item cites the device, date and source.
- THEORY / NOT TESTED = only a reason it could work: a key on the device, a contract line, the gate routing, a vendor statement. Each item states the reason and its source. "No basis" means none was found.
- Path labels: DIRECT = written straight to the device's TB attributes or sent as a TB device RPC; the device's own rule chain handles it. VIA BRIDGE = written as a Requested key (SERVER_SCOPE) that the IoT Command Gate rule chain validates, copies to the Desired key and passes to the integration bridge by a doorbell call; the bridge calls the vendor cloud (Tuya, Salus AWS shadow, Intesis AC Cloud).
- "Old contract" = Spencer's 17 September 2026 contract: write a Desired key directly to SHARED_SCOPE, confirm via Reported and SyncStatus telemetry. It was superseded on 10 October 2026 when integration-bridge:prod-sd446-v1 and the IoT Command Gate went live. Evidence gathered under the old contract is shown, but it is labelled as such because it does not prove the current route.

## 2. Method and limits (read before relying on any row)

- Live prod TB (portal.lhlive.co.uk, version 4.3.1.4PE) was read STRICTLY READ-ONLY on 15 October 2026 between about 15:00Z and 15:45Z. The only non-GET call was the login. Calls used: device lookup by name and text search, device profile and rule-chain name, attribute values per scope (SERVER, SHARED, CLIENT), latest telemetry and telemetry key lists, short telemetry histories, persistent-RPC lists, per-device audit logs since 20 September in weekly slices, and the user list (to find the svc-control identity). No attribute save, RPC, POST or delete was made. Rule-chain metadata was NOT re-read (it holds the doorbell secret, see SEC-1); the gate description below is taken from the 14 October research, which read it. One credential-bearing device (gk-st-office-intesis-1) was deliberately not sampled. No secret value was printed or stored.
- Samples: 1 to 3 devices per type, 30 devices in total (list in section 5). These are samples, not a census. The 14 October estate sweep (docs/project/oohdash-123-research/RESEARCH-ESTATE-SWEEP.md) supplies the fleet-wide counts.
- Not reachable: the OOH dashboard's own command audit (Cosmos OohAuditLog, reached by workload identity in the cluster; the CIR Cosmos credential is for a different account). So "the dashboard sent X" below comes from the TB audit log only. A tenant-wide TB audit search for dashboard commands was not feasible: the svc-control identity the dashboard uses is also used by a remote.it sync job that writes about every 5 minutes, so 4,000 audit entries covered only about one hour (finding F7). Bridge source, bridge logs and the UAT/dev TB were not read.
- Jira tickets OOHDASH-131, 123, 125, 114, 76, 72, 70 and 19 were read with their comments.
- LIMIT (added after verification): this pass did NOT run a per-user audit sweep. Sampling devices and reading their own audit logs structurally cannot see actions by other logins on unsampled devices, which is how it missed the PowerPause control, the PowerPause schedule echoes and the scale of boiler-panel control. Those findings come from the independent tester's per-user audit sweep of all 160 tenant users since 20 September except svc-control (15 Oct about 15:35Z to 16:00Z, GET only; docs/project/OOHDASH-131_TB_LAYER_VERIFICATION.md). Any future claim that something was never validated should rest on a per-user sweep, not a sample.
- Sender check for the 15 Oct site-1110 PowerPause commands (added after verification, GET only after login, 15 Oct): the device audit logs of md-1110meridian-ppfryvat-5 and md-1110meridian-ppheatedtable-1, -2 and -3 for 10:00Z to 13:00Z hold exactly 15 entries, all RPC_CALL method override, all SUCCESS, all from one login: a named individual's TENANT_ADMIN account on a non-Airedale company email domain, created July 2025 (the same login that made the 13 Oct V2 schedule edit in 4.13). The sequence per circuit was 0, then 1 about 15 s later, then -1 about 5 s after that, circuit by circuit from 11:10:00Z to 11:15:47Z. In the same minutes that login also changed boiler panels gk-6191 and gk-6135 and edited a ThingsBoard dashboard, which reads as a person working in the ThingsBoard screens. No entry on those devices came from svc-control (the dashboard's login), from the operator's own tenant administrator login used by our research scripts, or from any other login. Our own read sessions that day began at about 15:00Z, four hours later, and made no writes. Conclusion: not us, not the dashboard and not any of our agents.

## 3. Summary matrix

| # | Device type | Tested / validated (path, date) | Theory only (path, basis) | Schedule |
|---|---|---|---|---|
| 1 | Salus iT700 | None. Two direct setpoint writes 24 and 25 Sep stuck at pending; bench refuted 17 Sep | Setpoint and frost via bridge (Spencer contract, gate maps setpoint) | Follows-programme or held: readable. Programme: undecoded blob. Edit: no basis |
| 2 | Salus iT500 | None under current setup. One boost-cancel "synced" 12 Jun under old contract (DIRECT) | Setpoint and hot-water boost via bridge (Spencer contract); fleet dark since 28 Sep | Encoded register copy in TB, last 2 Jun, undecoded |
| 3 | Older Salus (bare) | None | As iT500 (same key shape, vendor id salus-it500); fleet dark since 2 Jun | As iT500 |
| 4 | Air-con | Intesis, DIRECT, old contract only: setpoint and mode (including Off) synced and followed by the device 12 Jun on test or bench units. Modbus: none | Intesis setpoint and mode/on-off via bridge (contract, gate routes them; seen only under the old method). Modbus: no basis | Not visible |
| 5 | Kitchen circuit (Tuya) | None on a kitchen circuit. Same route proven on one test socket (bridge, 10 and 12 Oct) | On/off via bridge (same hardware family and gate route) | Owon: device-reported blob, decode cross-checked. Tongou: stored text, unverified |
| 6 | PowerPause circuit | YES, DIRECT: four site-1110 circuits switched off and on by override RPC 15 Oct, each confirmed within 1 s; schedule edits echoed 21 and 30 Sep | Override value meanings and 15-minute expiry inferred; sched_overrides never seen used. Not via bridge | Readable; circuits echo schedule edits (21 Sep, 30 Sep) |
| 7 | Other switch (unrecognised name) | None | On/off via bridge (same hardware as row 5) | As row 5 |
| 8 | External lighting | None. Dashboard on-commands 7 and 13 Oct (old direct route) unconfirmed | On/off via bridge (same hardware, gate handles both key spellings) | Stored text timetable; one sample contradicts what the light does |
| 9 | Extractor fan | None | On/off via bridge | Owon: device blob matches stored timetable (read check) |
| 10 | Refrigeration | None (never commanded; dashboard blocks) | Tuya-switched units technically switchable via bridge; deliberately not used | Not relevant |
| 11 | Site hub gateway | None | No basis | None |
| 12 | Equipment-group gateway | None | No basis (Modbus registers read-only in TB) | None |
| 13 | Boiler control panel | YES, DIRECT, routine estate-wide: about 2,000 override, schedule and RPC actions on about 130 panels by six logins since 20 Sep (23 RPC failures). Examples: V1 zone override on/off 25 Sep and 7 Oct; V2 zone override by RPC 28 Sep; V2 schedule edit 13 Oct echoed by panel | V1 schedule edits (not echoed); hot-water zone override; per-output setpoints. Not via bridge | Readable JSON. V2 edit confirmed; V1 edit unconfirmed |
| 14 | Monitor-only | None | No basis | None |

## 4. Per device type - evidence detail

### 4.1 Salus iT700 thermostat

- Observed keys (gk-6261-salusit700-1, gk-6791-salusit700-1, 15 Oct): profile salusDevice, rule chain "Salus". CLIENT: vendor_id salus-it700, vendor_device_id, account_id, salusDeviceType IT700TX. SHARED: setpointDesired on 6261 only (19, written 24 Sep). SERVER: no Requested, SyncStatus or LastError keys. Telemetry: heatingSetpoint, localTemperature, systemMode, holdType, scheduleEnable, runningState, setPoint, mode, plus frozen setpointSyncStatus pending and setpointReported 21.5 (6261, 24 Sep), and on 6791 schedule (hex blob, last 10 Nov 2025), heatSchedule1-3, coolSchedule1-3, scheduleType, cloudOverride. Persistent RPC: 0.
- TESTED: none found.
  - Prod, old contract: TB audit shows svc-control (the dashboard) wrote setpointDesired 20.5 then 19 on gk-6261-salusit700-1 at 24 Sep 13:07Z and 13:23Z. setpointSyncStatus went pending and has stayed pending ever since (re-read 15 Oct). The same pattern is recorded for gk-6832 (setpointDesired 19 at 25 Sep 08:19Z, pending since 08:20Z; heatingSetpoint followed its own programme and never reached 19). Verdict for 6261 and 6832: not delivered or never confirmed.
  - gk-1648 (25 Sep 08:26Z, write by samday251): INDETERMINATE, not stuck. It has no setpointSyncStatus at all, so nothing went pending; heatingSetpoint did reach 21 at 16:26Z, eight hours later, together with a setPoint change, which is consistent with local or programme action.
  - gk-6835 (12 Oct 19:16Z, setpointDesired 5 by svc-control): UNINFORMATIVE. The unit had already been on heatingSetpoint 5 with holdType 7 since at least 5 Oct, so a command to a value it already held proves nothing either way.
  - Dev bench 17 Sep: setpointDesired on spencer-home-salusit700 stuck at pending; modeDesired returned failed; hwBoostHoursDesired returned rejected (OOH_TB_DIRECT_VALIDATION_REPORT.md C5).
  - Current bridge: no Salus device in prod carries setpointRequested or setpointSyncStatus (sweep of 1,199 Salus devices, 14 Oct; re-confirmed on the two samples 15 Oct). So no Salus command has ever gone through the gate.
- THEORY:
  - Setpoint (and therefore frost hold at 5 C) VIA BRIDGE. Basis: Spencer's contract 17 Sep (setpoint 5-35 C); the live gate maps setpointRequested and has a salusDevice freshness list; the device carries vendor_device_id so the gate would ring the bridge doorbell (RESEARCH-S2-S3.md, RESEARCH-S1-S8.md). Spencer 10 Oct: "Salus is being measured now and will be minutes, not seconds". Open: SQ-05, SQ-06, SQ-08, SQ-09.
  - Mode, hot-water boost: no basis (Spencer's own bench says mode fails and boost is rejected on IT700).
- SCHEDULE: visibility partial. holdType (0 following programme, 2 held) and scheduleEnable are fresh device telemetry (6261 held, 6791 following, 15 Oct) - readable, not decoded beyond those two flags. The programme itself (heatSchedule1-3, schedule) is an undecoded hex blob, some stale since Nov 2025 (RESEARCH-S13-SCHEDULES.md; SQ-13c). Editing: no basis - no bridge adapter implements schedule commands (SD-446 vendor status, cited in RESEARCH-S13). The dashboard's "hold until next schedule slot" option relies on the thermostat's own reversion, which has not been observed.

### 4.2 Salus iT500 thermostat

- Observed keys (gk-5190-salusit500-r1, gk-5794-salusit500-r1): profile salusDevice, rule chain "Salus". CLIENT: vendor_id salus-it500, vendor_device_id, account_id, site. SERVER: schedule and programs (encoded register strings, written 2 Jun), chMode, hwMode. SHARED: hwBoostHoursDesired 0 on 5794 (12 Jun). Telemetry: setPoint, currentSetpoint, mode, currentTemperature, heatingActive, hotWaterOn, hotWaterBoostHoursRemaining, hotWaterAvailable, plus hwBoostSyncStatus synced and hwBoostReported 0 on 5794 (12 Jun). Last device telemetry 28 Sep on both.
- TESTED: none under the current setup. The only record: on gk-5794-salusit500-r1 a hot-water boost of 0 hours (a cancel) reported synced on 12 Jun 2026 under the old contract and old bridge. Weak: the value was a cancel to a state already at 0, and the old domain's "synced" was shown on 17 Sep to give false success in two cases (validation report C5).
- THEORY: setpoint and hot-water boost VIA BRIDGE (Spencer contract 17 Sep; gate maps both). Blocked in practice: polling deliberately switched off in prod since 2 Oct, both bridge account records disabled, all 373 bridge-carried IT500 "never reported" (SD-373 comment 2 Oct; IoT Hub read 14 Oct, RESEARCH-IOTHUB.md). Hot-water boost key-stem conflict open (SQ-10). Dashboard treats the class as dark and not controllable (registry contract) but does not enforce it (OOHDASH-132).
- SCHEDULE: a copy of the programme exists in TB as SERVER_SCOPE schedule and programs (register strings such as A00..A06), last written 2 Jun, not decoded. This corrects SQ-13, which says no schedule keys exist for IT500 (new question Q9). Editing: no basis.

### 4.3 Older Salus thermostat (bare "salus" naming)

- Observed keys (gk_wingfieldfarm_salus_STA10108576 (5694-r-2)): same shape as iT500, including CLIENT vendor_id salus-it500 and SERVER schedule/programs; last telemetry 2 Jun 2026.
- TESTED: none. No Desired, Requested or status key on any of 384 (estate sweep 14 Oct).
- THEORY: as iT500, VIA BRIDGE, on the basis of the identical key shape and the salus-it500 vendor id only. All units silent since about 2 Jun. What these units are is already asked in SQ-07(c).
- SCHEDULE: as iT500 (encoded copy dated 2 Jun).

### 4.4 Air conditioning (Intesis cloud units and Modbus air-con)

- Two populations (RESEARCH-S12-Q7.md): 12 true Intesis units on profile default with vendor_id intesis (AC Cloud, bridge-carried), and 246 airConditioningProfile units read through R10A Modbus.
- Observed keys: gk-6770-intesis-ed277306 (default profile, root chain): CLIENT vendor_id intesis, vendor_device_id; telemetry mode, setPoint, currentTemperature, heatingActive, coolingActive, isOnline. md-1244-intesis-c7ea6f88 also: SHARED modeDesired Cool and setpointDesired 25 (12 Jun), telemetry setpointSyncStatus synced and setpointReported 25 (12 Jun). gk-birchwoodfarm-ac-1 (Modbus, chain "Intesis Control"): telemetry Temperature, Setpoint, Mode, OnOff, FanSpeed, ErrorCode, AlarmStatus; SERVER setpoint thresholds; no command keys.
- TESTED, DIRECT, old contract only (12 Jun 2026, writes by spencer.thompson):
  - Setpoint: md-1244-intesis-c7ea6f88 setpointDesired 25 at 13:42:08Z, setpointSyncStatus pending then synced at 13:42:10Z, device setPoint telemetry reached 25 at 13:54:06Z. funklet-intesis-29d1f022 setpoint 22 synced at 13:39:57Z, and setPoint followed a later write to 21 at 14:05:27Z.
  - Mode, including Off: on funklet-intesis-29d1f022, modeDesired Cool, Off, Heat, Auto and Off between 14:02:48Z and 14:06:24Z; each reached modeSyncStatus synced and the device's own mode telemetry followed within about 5 to 8 s (Cool 14:02:53, Off 14:04:49, Heat 14:05:02, Auto 14:05:13, Off 14:06:31Z).
  - Both units are test or bench units (unverified): md-1244 carries a real McDonald's site prefix, so whether it is installed at a site is not confirmed. Spencer's 17 Sep contract also claims funklet setpoint 22 synced on the dev bench that day; our same-day validation found the bench adapter dormant (validation report C5, GATED).
  - Not repeated under the current bridge; no Intesis unit carries a Requested or status key. Modbus air-con: none.
- THEORY: Intesis setpoint and mode (on/off is expressed as mode off / anything else) VIA BRIDGE. Basis: Spencer contract 17 Sep; SD-446 command coverage audit (adapter implements setpoint and mode only, no fan speed); the 12 units route to the gate through the root chain and carry vendor_device_id. Bridge acceptance never observed. Dashboard control removed by OOHDASH-82. Modbus air-con: no basis for any write path (no command keys, no adapter; question Q10).
- SCHEDULE: none visible in TB. Intesis schedules live in the vendor cloud calendar (SD-477 design, cited in RESEARCH-S13); already asked in SQ-13(d).

### 4.5 Kitchen appliance circuit (Tuya Owon or Tongou switch)

- Observed keys (gk-6176-fryer-1 Owon, gk-6886-chargrill Tongou): profile tuya Profile, rule chain "Tuya". SERVER: devId, tuyaDeviceType, and on the Tongou unit scheduleHEX (readable text timetable, written 3 Feb 2026). Telemetry: switch_1, relay_status, power and energy keys, countdown_1, cycle_time (empty), and on the Owon unit schedule (base64 blob refreshed daily, last 15 Oct 00:00Z). No Requested, Desired or status keys. Persistent RPC 0. No command-shaped audit entries since 20 Sep.
- TESTED: none on a kitchen circuit. The same route is proven on one Tuya Owon socket at the Brackley test site, ag-brackley-poweroutlet-6 (tuya Profile, same chain): TB audit shows 14 switchRequested writes by svc-control 10-12 Oct with 9 accepted, 4 rejected "vendor: No active Tuya session owns device", 1 rejected "permission deny" (10 Oct 13:52Z, before the prod Tuya project was switched on); Spencer's off/on at 10 Oct 16:41Z accepted in under 1 s with switch_1 confirming (Spencer Teams 10 Oct 17:53Z; audit re-read 15 Oct). VIA BRIDGE. Also dev bench 17 Sep, old contract: four bench switches synced in under 1 s (validation report C5).
- THEORY: on/off VIA BRIDGE for any single-gang unit. Basis: same hardware family, profile and gate route as the proven socket; Spencer's 17 Sep matrix lists kitchen switched loads as controllable. Second socket on two-gang units not addressable (RESEARCH-S9-S11.md). Dashboard does not offer it (table row 5).
- SCHEDULE: Owon units report their on-device timetable daily as a base64 blob. Read-only cross-check on 15 Oct (gk-6781-extractfan-1, same Owon type): decoding the device-reported blob with the 5-byte layout from SD-477 gives records that include exactly the three entries in the stored scheduleHEX (every day 10:15 on; 21:30 off Monday to Saturday pattern; 20:30 off one day), so the layout looks right (DEDUCED, medium-high; byte meanings still to be confirmed in SQ-13b). Tongou units hold a readable stored timetable (scheduleHEX) whose relation to the device is unverified (see 4.8). Editing: no path through the gate; the stored timetables were written by a separate scheduling tool (new question Q5).

### 4.6 PowerPause power circuit

- Observed keys (md-780wigston-ppverticaltoaster-3, profile powerpause-circuit, own chain "powerpause-circuit"; parent rikki-4589-powerpause-1, profile powerpause): SHARED schedules, sched_overrides, idle_pwr_thres, invert, idle_pwr_time_mins. CLIENT: the same schedules and sched_overrides (device echo). Telemetry: power, energy, override. Parent telemetry: override button pressed and activated timestamps (last March 2026). Persistent RPC 0. No audit entries since 20 Sep.
- TESTED / VALIDATED, DIRECT (found by the independent per-user sweep; this pass's 25-circuit sample missed it):
  - On/off by device RPC, McDonald's site 1110, 15 Oct 2026, 11:10:00Z to 11:15:47Z: one staff tenant administrator login (see section 2) sent RPC method override with 0, 1 and -1 to md-1110meridian-ppfryvat-5 and md-1110meridian-ppheatedtable-1, -2 and -3; all 15 calls returned SUCCESS. Each circuit confirmed: on ppfryvat-5 the override telemetry went to a negative expiry with op_state false at 11:10:01Z and to a positive expiry with op_state true at 11:10:16Z, and again at 11:14:10Z and 11:14:25Z; on ppheatedtable-1 op_state was false at 11:14:36Z and true at 11:14:51Z. The override value is an expiry time 15 minutes ahead (for example 2026-10-15T11:25:00Z). Real McDonald's kitchen circuits.
  - Schedule edits echoed: TonyWilletts rewrote SHARED schedules on about 20 ppchickenvat and ppuhc circuits on 21 Sep and the CLIENT copies are identical (for example md-414wrekin-ppchickenvat-1 and md-780wigston-ppchickenvat-1, echoed 25 Sep; md-1110meridian-ppchickenvat-1 and -4, echoed 4 Oct). CsabaJakab cleared schedules on md-319fossepark-ppgrill-1 to -3 on 30 Sep, echoed about 0.1 s later (11:39:51.909Z SHARED, 11:39:52.013Z CLIENT).
  - Schedule visibility: on the sample circuit the reported copy (CLIENT, 29 Sep) is identical to the set timetable (SHARED, written 16 Mar): Thursday on 16:00 off 22:00; Sunday, Friday, Saturday on 11:00 off 22:00.
- THEORY / NOT CONFIRMED: the meaning of override values 1, 0 and -1 and the fixed 15-minute expiry are inferred from data, not documented (question Q4). sched_overrides exists in SHARED and is echoed to CLIENT but has never been seen used (0 of 25 sampled circuits, RESEARCH-S13); the earlier theory that it is the override route is withdrawn. The powerpause profiles do not reach the gate (RESEARCH-S4-S5.md profile routing), so there is no bridge route. Local override button: physical, not TB.
- SCHEDULE: readable JSON; editing DIRECT via the SHARED schedules attribute is confirmed by echo (21 and 30 Sep). Field semantics in SQ-13a.

### 4.7 Other smart switch with an unrecognised name

- Observed keys (gk-6812-supplyfan-1 Tongou, gk-6817-immersion-1 Tongou): as 4.5; the supply fan carries a stored scheduleHEX (Nov 2025). No command keys or audit entries.
- TESTED: none.
- THEORY: on/off VIA BRIDGE, same basis as 4.5 (Spencer's 17 Sep matrix lists over-door heaters as "CONTROL ... PROVEN", but that proof was bench-only, old contract).
- SCHEDULE: as 4.5.

### 4.8 External lighting circuit

- Observed keys (gk-6792-externallighting-1 Tongou, gk-6237-externallighting-1 type default, gk-6815-externallighting-1 Tongou): tuya Profile, "Tuya" chain. 6792 and 6815 report switch_1; 6237 reports bare switch (one of three such lighting units, SQ-11). SHARED switchDesired true on 6237 (7 Oct) and 6815 (13 Oct). 6815 has scheduleHEX: every day on 16:00, off 00:30 (written 3 Nov 2025). No Requested or status keys.
- TESTED: none confirmed.
  - The dashboard (svc-control) wrote switchDesired true directly to gk-6237 on 7 Oct 18:53Z and to gk-6815 on 13 Oct 18:07Z (TB audit, re-read 15 Oct); the 14 Oct sweep found two more lighting circuits holding the same leftover on-command from 13 Oct (four in all). These used the old direct route, which bypasses the gate. gk-6237 sent no telemetry that evening, so the command could not have landed. gk-6815 reported on at 18:19Z, 12 minutes later; a neighbouring light with no command (gk-6792) came on at 18:30Z and both went off at 23:00Z, so the change matches the light's own dusk or timer pattern, not the command (indeterminate).
- THEORY: on/off VIA BRIDGE. Basis: same Tuya route as the proven socket; the gate's freshness and direction logic handles both switch_1 and bare switch (RESEARCH-S9-S11.md). Spencer's 17 Sep matrix marks external lighting "PROVEN" - bench only. The OFF direction can be falsely refused as "device offline" for about 1.6 percent of healthy units (SQ-12).
- SCHEDULE: a stored timetable is readable for some units, but it is not reliable: gk-6815's stored timetable says off at 00:30, while the light actually went off at 23:00 on 13 and 14 Oct. Outside lights also run on dusk sensors (DISCOVERY_oohdash-111-112). Editing: no basis via the gate.

### 4.9 Extractor fan

- Observed keys (gk-7773-extractfan-1 Tongou, gk-6781-extractfan-1 Owon): as 4.5. 6781 has scheduleHEX (hex records, Feb 2026) and the daily device schedule blob.
- TESTED: none. No command-shaped audit entries since 20 Sep on either.
- THEORY: on/off VIA BRIDGE, same basis as 4.5. Spencer's 17 Sep matrix marks extract fans "PROVEN" - bench only.
- SCHEDULE: visibility checked read-only on gk-6781 (see 4.5): the device-reported timetable contains the stored timetable entries. Editing: no basis via the gate.

### 4.10 Refrigeration

- Observed keys (gk-6864-fridge-1 profile "fridge and freezer profile", chain "Fridge/Freezer"; ag-brackley-bottlecooler-1 tuya Profile two-gang; gk-7834-cellar-1 cellar profile): sensors (air_temp, evaporator_temp, doorStatus) and on some a Tuya switch_1 (and switch_2 on the Brackley coolers). No command keys, no audit entries.
- TESTED: none. Never commanded (RESEARCH-S9-S11.md; re-confirmed 15 Oct).
- THEORY: units on the tuya Profile could technically be switched VIA BRIDGE like any Tuya socket (first socket only). Whether the fridge and cellar profiles route to the gate is UNVERIFIED (their own chains were not in the 14 Oct routing table). The dashboard blocks refrigeration on purpose (Stream A deny, signed off 24 Sep), so this is a safety question, not a feature (question Q6).
- SCHEDULE: not relevant (one cellar unit shows an empty schedule blob).

### 4.11 Site hub gateway (LoRaWAN "lwgateway")

- Observed keys (gk-6769-lwgateway, profile remoteItProfile): remote.it status only (remoteItActive, online time). No command keys, no RPC.
- TESTED: none. THEORY: no basis for any control. SCHEDULE: none.

### 4.12 Equipment-group gateway

- Observed keys (gk-6754-maindb-r10a, profile "R10A Modbus Gateway"; gk-6261-salusit700-gateway-1, salusDevice): Modbus register readings (REG20001..) and modbusOK/fail counts; Salus receiver Wi-Fi and cloud status. No command keys, no RPC.
- TESTED: none. THEORY: no basis. SCHEDULE: none.

### 4.13 Boiler control panel (V1 and V2)

- Observed keys: V1 gk-6780-boilercontrol-1 and gk-2933-boilercontrol-1 (profile boilerControl, own chain "boilerControl"): SHARED output1-4Override, output1-4Schedule, output2-4Setpoint, summerMode, masks and thresholds; CLIENT copies of the same; telemetry output1-4State, output1-4Override (expiry timestamp while active), flow temperatures, summerModeActive. V2 gk-6261-boilercontrol-1: SHARED CHZ1.schedule, CHZ2.schedule, DHW.schedule, recirc_pump.schedule; CLIENT copies plus per-zone default override duration (15 minutes); telemetry CHZ1/CHZ2/DHW/accom/recirc_pump .override and .output_state, contractor_override. Persistent RPC list empty (calls were two-way, not persistent).
- SCALE (independent per-user sweep since 20 Sep): this is routine operational control across the estate, not a few events. About 2,000 boiler-panel override, schedule or RPC actions (about 1,360 of them device RPCs) on about 130 distinct panels, by six logins: TonyWilletts (759), samday251 (865 plus more in later pages), CsabaJakab (306), lighthouseteam1 (48), andrew.shaw.network (17) and joncooke (8); plus 16 output overrides by lighthouseteam10 on a V1 panel. 23 RPC calls returned FAILURE (for example gk-6191, gk-6237 and gk-6097), so outcomes are not uniformly successful. Two of the logins are personal email accounts. Whether all six are Spencer's IoT team is unconfirmed (question Q2).
- TESTED / VALIDATED, all DIRECT in TB, by staff logins (TB audit, re-read 15 Oct; outcomes from device telemetry history). Worked examples:
  - V1 zone override, gk-2933-boilercontrol-1, 25 Sep 2026: Sam Day set output4Override 1 at 09:11Z; the panel reported output 4 overridden and output4State on within the same minute; set back to 0 at 09:12Z and output4State went off.
  - V1 zone override, gk-6780-boilercontrol-1, 7 Oct 2026: Tony Willetts and Sam Day wrote output1-4Override values (1, 0, -1) about 12 times between 11:37Z and 15:59Z; the panel's reported override timestamps and output states changed after each write (for example output 4 on at 11:58Z, off at 12:03Z). Cleared to 0 on 8 Oct 15:51Z.
  - V2 zone override by device RPC, gk-6261-boilercontrol-1, 28 Sep 2026: Sam Day sent the RPC method override with "CHZ1 1", "CHZ1 0", "CHZ2 1", "CHZ2 0", "accom_1 1", "accom_1 0", "recirc_pump 1", "recirc_pump 0" between 09:17Z and 09:22Z, all returned SUCCESS; the panel reported CHZ1.override set and CHZ1.output_state 1 at 09:18Z, back to 0 at 09:20Z, and matching override changes for CHZ2, accom_1 and recirc_pump.
  - V2 schedule edit, gk-6261-boilercontrol-1, 13 Oct 2026: Csaba Jakab wrote CHZ1.schedule and CHZ2.schedule (SHARED) at 16:47-16:48Z; the panel's reported copy (CLIENT) is identical and timestamped 16:47Z. Schedule round trip confirmed.
- THEORY / NOT CONFIRMED:
  - V1 schedule edits: Csaba Jakab wrote output2Schedule and output3Schedule on gk-6780 on 10 Oct and 14 Oct, but the panel's reported copy is unchanged since 12 Apr and differs from what was written; same on gk-2933 (SHARED written 21 May, CLIENT from 12 Apr). Whether V1 panels apply or simply do not echo schedule edits is unknown (question Q3).
  - Hot-water zone override (V2 DHW.override exists; V1 hot water is one of the outputs) and per-output setpoints (output2-4Setpoint): keys exist, no observed change.
  - Meaning of override values (1, 0, -1) and the default 15-minute override duration are inferred from data, not documented (question Q2).
  - Not VIA BRIDGE: the boilerControl chain has no route to the gate and the panel has no bridge adapter (RESEARCH-S12-Q7.md). Spencer's 17 Sep matrix marks boiler control "DEFER"; migration LH-INT-BOILER-001 (Jonathan / Rikki).
- SCHEDULE: readable JSON (value, time, day mask) on both versions; V2 edits confirmed by echo, V1 edits not confirmed. The dashboard already decodes the next change (OOHDASH-123 WU13); field semantics are SQ-13a.

### 4.14 Unknown or monitor-only device

- Observed keys (gk-phoenix-meter-bar, meterOnlyProfile): Electrical_Power, Electrical_Energy, applianceOn, thresholds. No command keys, no RPC.
- TESTED: none. THEORY: no basis (sensors and meters have nothing to switch). SCHEDULE: none.

## 5. Sample devices read on 15 October 2026

| Type | Devices |
|---|---|
| Salus iT700 | gk-6261-salusit700-1, gk-6791-salusit700-1 |
| Salus iT500 | gk-5190-salusit500-r1, gk-5794-salusit500-r1 |
| Older Salus | gk_wingfieldfarm_salus_STA10108576 (5694-r-2) |
| Air-con | gk-6770-intesis-ed277306, md-1244-intesis-c7ea6f88, gk-birchwoodfarm-ac-1 |
| Tuya reference | ag-brackley-poweroutlet-6 |
| Kitchen / other switch | gk-6176-fryer-1, gk-6886-chargrill, gk-6812-supplyfan-1, gk-6817-immersion-1 |
| PowerPause | md-780wigston-ppverticaltoaster-3, rikki-4589-powerpause-1 |
| Lighting | gk-6792-externallighting-1, gk-6237-externallighting-1, gk-6815-externallighting-1 |
| Fans | gk-7773-extractfan-1, gk-6781-extractfan-1 |
| Refrigeration | gk-6864-fridge-1, ag-brackley-bottlecooler-1, gk-7834-cellar-1 |
| Gateways | gk-6769-lwgateway, gk-6754-maindb-r10a, gk-6261-salusit700-gateway-1 |
| Boiler panels | gk-6780-boilercontrol-1, gk-2933-boilercontrol-1 (V1), gk-6261-boilercontrol-1 (V2) |
| Monitor-only | gk-phoenix-meter-bar |

## 6. Cross-cutting findings

- F1. Two routes exist, and they serve different devices. The vendor bridge route (Requested key, gate, doorbell) serves only Tuya, Salus and the 12 Intesis cloud units, and only the Tuya branch has a confirmed prod round trip (one device). The direct route (SHARED attribute or device RPC) is how boiler panels and PowerPause are actually driven, and it is the only route with confirmed real-site control: boiler panels routinely and estate-wide (about 2,000 actions on about 130 panels since 20 Sep), and PowerPause circuits (15 Oct).
- F2. "Live" has not meant "a command worked". OOHDASH-19 closed on 7 Oct as "verified live per SIGNOFF_stream-a-observed-live.md", but that signoff checked the refrigeration switch-deny, not a successful command. OOHDASH-76 likewise. The dashboard has had writes on since 24 Sep, yet no dashboard command has a confirmed device change in the evidence (standing doctrine: Live means merged, not in effect).
- F3. The old direct writes did not land. Direct Desired writes are on record for Salus gk-6261 (two, by the dashboard identity, 24 Sep) and gk-6832 (25 Sep), both stuck at pending, and for four lighting circuits (7 and 13 Oct); none can be shown to have worked. Two other Salus writes prove nothing either way: gk-1648 (25 Sep, by a personal account) is indeterminate, and gk-6835 (12 Oct) was set to the value it already held. Since v1.4.0 (14 Oct) the dashboard writes Requested keys; no new Requested key was found on any sampled device on 15 Oct, so no v1.4.x command is evidenced (UNVERIFIED estate-wide, see section 2).
- F4. Stale command remnants sit on devices (Salus setpointDesired from September, Intesis Desired from June, lighting switchDesired from October). They are harmless to the gate but confuse anyone reading the device in TB.
- F5. Schedules: readable in a documented JSON form for boiler panels and PowerPause, and PowerPause schedule edits are echoed by the circuit (21 and 30 Sep); readable as a device blob for Owon (decode cross-checks); stored text for Tongou that can disagree with reality; flags only for iT700; an undecoded register copy for iT500 and older Salus (dated 2 Jun); nothing for Intesis or Modbus air-con.
- F6. TB device RPC (method override) is used in practice for V2 boiler panels and for PowerPause circuits (15 Oct, site 1110). This pass's sample found no other RPC history; the per-user sweep is the better source.
- F7. The dashboard shares the svc-control TB identity with a remote.it sync job writing about every 5 minutes, so dashboard commands cannot be isolated in the TB tenant audit (question Q7).

## 7. What Spencer said vs what we can evidence

| Claim (source, date) | Evidence status |
|---|---|
| "You control every device by writing one of these four Desired keys" (contract, email 17 Sep) | Superseded 10 Oct by the gate. Direct Desired writes in prod: 2 stuck at pending (Sep); gk-6835 on 12 Oct was sent to a unit already holding that value, so it proves nothing; lighting writes unconfirmed. Not true for boilers or PowerPause at all. |
| "Round-trip is typically under 1 s for switches, a few seconds for thermostats" (contract 17 Sep) | Switches: true on one test socket (10 and 12 Oct) and four bench switches (17 Sep). Thermostats: never observed, in prod or on the bench. **Spencer's own 17 Sep proof (contract section 5) shows his IT700 bench write left at pending, contradicting a few seconds from his own evidence.** |
| Four controllable device types: Tuya switch, Salus thermostat, Intesis AC, boiler deferred (asset control matrix 17 Sep) | Tuya: one prod device proven. Salus: unproven. Intesis: setpoint and mode (including Off), old contract, June test or bench units. Boiler: actually controlled directly by staff logins, routinely and estate-wide (not via the bridge). PowerPause (not in the matrix): also controlled directly, by override RPC on 15 Oct. |
| External lighting, extract fans, over-door heaters, kitchen switched loads: "CONTROL ... PROVEN" (matrix 17 Sep) | The 17 Sep proof was four dev-bench switches under the old contract. Since then: our own 17 Sep validation re-proved the bench Tuya round trip in under 1 s (validation report C5); SD-492 on 1 Oct recorded 24 of 24 bench commands at about 510 ms (RESEARCH-S6); and Spencer's 10 Oct Teams message cites a 40-command UAT run under the new gate route (typical 0.5 s, worst 1.6 s; vendor-reported, not visible to us). None is a production circuit: in prod no lighting, fan, heater or kitchen circuit has a confirmed command. |
| Salus IT700 honours setpoint; IT500 honours setpoint and boost (contract 17 Sep) | No confirmed command. IT500 fleet dark since 28 Sep (polling switched off 2 Oct). |
| Intesis setpoint "proven" (contract 17 Sep) | Setpoint, and mode including Off, synced and followed by the device on test or bench units 12 Jun under the old contract; not under the current bridge. Spencer's contract also claims a funklet setpoint sync on the dev bench on 17 Sep, but our same-day validation found the bench adapter dormant. |
| "Prod Tuya control is live and proven" (Teams 10 Oct 17:53Z) | True for ag-brackley-poweroutlet-6 only. 5 of 14 commands on it were rejected by the vendor side between 10 and 12 Oct (SQ-03). |
| "Salus is being measured now and will be minutes, not seconds" (Teams 10 Oct) | No figure published since; no Salus command seen through the gate (SQ-05, SQ-06). |
| "Commands go through ThingsBoard, which is the path proven above" (Teams 10 Oct) | True for Tuya. Boiler and PowerPause control does not use that path; both are driven directly. |
| "Live Shell Hub doesn't contain scheduling yet"; "the uat hub carries the scheduling uat" (Teams 12 Oct) | The UAT "scheduling" is the engineer job scheduler, not device schedules (RESEARCH-IOTHUB.md). Device schedules live in TB attributes or on the device. |
| "Control and schedule visibility over most devices" (as relayed by James, 15 Oct; no written source found) | Confirmed control today: 1 Tuya test socket via bridge, and boiler panels and PowerPause circuits direct. Schedule visibility: boiler panels and PowerPause yes, Owon units decodable, iT700 flags only, Tongou unreliable, iT500/older Salus encoded and stale, air-con none. "Most devices" is not supported for control; it is roughly true for schedule visibility on pub heating and kitchen power, not for thermostats or air-con. |

## 8. Questions to put to Spencer to close the gaps

These are new. Where an existing question already covers a point, it is referenced, not repeated: SQ-01 (Requested vs Desired), SQ-03 (Tuya session rejections), SQ-05 (Salus proof), SQ-06 and SQ-08 (Salus timing), SQ-07 (IT500 dormancy and bare-salus identity), SQ-10 (boost key stem), SQ-11 (bare switch key), SQ-12 (freshness window), SQ-13 (schedule semantics and decoders).

1. Q1 - Which devices did you mean? Please list the device types you consider controllable today and the types whose schedules you consider visible, and for each give one device name and date where you saw it work in production. (Today the evidence is one Tuya test socket via the bridge.)
2. Q2 - Boiler panel control contract. Staff logins override boiler zones directly in ThingsBoard as routine: about 2,000 override, schedule and RPC actions on about 130 panels since 20 Sep, by six logins including Tony Willetts, Sam Day and Csaba Jakab. Are these your IoT team, and are the two personal-email logins intended? Examples: V1 panels by writing output1-4Override (25 Sep gk-2933, 7 Oct gk-6780) and V2 panels by the RPC method override, for example "CHZ1 1" (28 Sep gk-6261). Is this a supported route the dashboard may use? Please confirm what 1, 0 and -1 mean, how long an override lasts (V2 shows 15 minutes by default) and what the panel reports to confirm it. 23 RPC calls returned FAILURE (for example gk-6191, gk-6237 and gk-6097 boiler panels): what does a FAILURE mean for the panel, and can it leave the panel in the wrong state? Relates to LH-INT-BOILER-001; SQ-13 covers schedule fields only.
3. Q3 - V1 boiler schedule edits. On gk-6780 the schedule was rewritten on 10 and 14 Oct and on gk-2933 on 21 May, but the panel's reported copy on both is still the 12 April version. Do V1 panels apply schedule edits, and if so how can we confirm one took effect? (V2 gk-6261 echoed its 13 Oct edit within a minute.)
4. Q4 - PowerPause remote override. A staff login switched four PowerPause circuits at site 1110 off and on with the device RPC override (0, 1, -1) on 15 Oct between 11:10Z and 11:16Z, and each circuit confirmed. Is this command a supported route the dashboard may use? What do 1, 0 and -1 mean, is the 15-minute expiry fixed, and what is the sched_overrides attribute for? The powerpause profiles do not route to the command gate.
5. Q5 - Stored Tuya timetables. Many Tuya units carry a stored timetable (scheduleHEX) written by a separate tool between Nov 2025 and Feb 2026. Which tool writes it, is it kept in step with the device, and which should we trust? Example: gk-6815-externallighting-1 stores off at 00:30 but the light went off at 23:00 on 13 and 14 Oct. (SQ-13b asks for the byte map only.)
6. Q6 - Refrigeration safety. Do the fridge-and-freezer and cellar device profiles route Requested keys to the command gate, and can the gate refuse switching on refrigeration devices (for example the two-gang coolers at Brackley) as a second line of defence behind the dashboard's block?
7. Q7 - Dashboard identity. The dashboard's ThingsBoard login (svc-control) is also used by the remote.it sync job, which writes about every 5 minutes, so dashboard commands are hard to audit. Even your own Brackley socket tests on 10 to 12 Oct ran under svc-control, so the audit log cannot tell a vendor test from a dashboard command. Can the dashboard have its own identity? (Different from the SEC-1 admission note, which is about the gate.)
8. Q8 - Real-device proof for lighting and fans. The only prod Tuya proof is a test socket. Will you allow the J8 test to include one real external-lighting circuit (including a bare-switch unit such as gk-6237) and one real extractor fan, or share a production run on those? (SQ-11 covers the key name, not command acceptance.)
9. Q9 - IT500 programme copy in ThingsBoard. SQ-13 says no schedule keys exist for IT500, but IT500 and bare-salus devices carry SERVER_SCOPE schedule and programs attributes (register strings, last written 2 June). What are they, will they refresh when polling resumes, and is there a decoder? Please treat this as a correction to SQ-13(d).
10. Q10 - Intesis under the current bridge, and Modbus air-con. On 12 June, under the old contract, test or bench units confirmed both setpoint and mode changes, including Off. Has either been accepted through the gate since 10 October? Is md-1244-intesis-c7ea6f88 a real installed unit or a test unit? Separately, can the 246 Modbus air-con units be written at all? (SQ-05 covers Salus only.)
11. Q11 - Salus hold and return to schedule. The dashboard offers "hold until the next schedule slot". Does an IT700 setpoint change made through the bridge become a temporary hold that reverts at the next programme step, or a permanent hold? Can the bridge send "resume programme"? We read holdType 2 on gk-6261 today.
12. Q12 - Clearing stale commands. Stale Desired values sit on devices from June to October (Salus gk-6261, gk-6832, gk-1648; lighting gk-6237, gk-6815; Intesis md-1244). Will they be cleared, and can a stale Desired cause the bridge to re-send an old command after a restart? (SQ-04 covers stuck pending, not stale Desired.)

## 9. Cost and silent-running note

- This evidence pass made about 400 read-only GETs, paced one at a time, run once. No poller, watcher or scheduled job was created, so nothing runs in the background and there is no ongoing cost.
- For anything built later: reading schedules and command status per device when a handler opens a site has no idle cost. Do not sweep the estate on a timer: prod TB returned 429 and 500 errors under parallel scans on 14 Oct. A per-device confirmation watch is only needed while a command is in flight. The cost to watch is the ThingsBoard rate limit, not tokens.

## 10. Sources

- Live prod TB, read-only, 15 Oct 2026 (section 2). Scripts were kept in the session scratchpad, not committed.
- docs/project/OOHDASH-131_TB_LAYER_VERIFICATION.md (independent tester, 15 Oct 2026): per-user audit sweep, 18 corrections, all applied in this version.
- docs/project/oohdash-123-research/RESEARCH-ESTATE-SWEEP.md, RESEARCH-S1-S8.md, RESEARCH-S2-S3.md, RESEARCH-S4-S5.md, RESEARCH-S6.md, RESEARCH-S7.md, RESEARCH-S9-S11.md, RESEARCH-S12-Q7.md, RESEARCH-S13-SCHEDULES.md (all 14 Oct); C:/harness-runs/iot-ooh-dash/research/RESEARCH-IOTHUB.md (14 Oct).
- docs/project/OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md and docs/project/mockups/OOH_ASSET_CONTROL_MATRIX_corrected.html (Spencer, 17 Sep); docs/project/OOH_TB_DIRECT_VALIDATION_REPORT.md (17 Sep); docs/project/releases/SIGNOFF_stream-a-observed-live.md (24 Sep); docs/project/OOH_ROSETTA_STONE_RELEASE_PREFLIGHT_2026-10-14.md and _TEST_RESULTS_ (J8 not executed).
- C:/harness-runs/iot-ooh-dash/SPENCER_TEAMS_2026-10-10_PRIMARY_SOURCE.md; SPENCER-QUESTIONS-OOHDASH-123-2026-10-14.md; ORCHESTRATOR-AUDIT.md (14 Oct v1.4.0 shipped writes enabled, J8 not run).
- CIR OOH_TB_DIRECT_CONTROL_CONTRACT.md (6 Oct) and OOH_BRIDGE_CONTRACT.md (26 Aug).
- services/registry.js (CONTROL_CONTRACT, Salus unproven flag), services/tb-device.js (classification, schedule decode).
- Jira OOHDASH-19, 70, 72, 76 comments (James, 16 Sep to 7 Oct); OOHDASH-123, 125, 114, 131 (no comments).
