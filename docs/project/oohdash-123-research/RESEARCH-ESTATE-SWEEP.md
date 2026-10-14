# RESEARCH-ESTATE-SWEEP: key-name reality check, stuck requested values, last-seen gaps (OOHDASH-123, 2026-10-14)

Method: read-only prod ThingsBoard GETs plus the login POST. Credentials loaded from the CIR env file inside a script; none printed or stored here. Per device: one GET of all attributes and one GET of latest telemetry (all keys). No writes, no RPC, no Desired writes. Snapshot taken 2026-10-14 about 09:25Z, so every age below is relative to that moment.

## Coverage and politeness (read first)
- Estate size is 12,909 devices (GET /api/tenant/devices, paged), not about 1,000. 38 device profiles.
- FULL pass (every device) on the command-capable profiles: tuya Profile 3,157, salusDevice 1,181, airConditioningProfile 246, boilerControl 223, gatewayDevice 306, default 28, IT700TX 1. About 5,140 devices, 10,300 GETs. Only 1 tuya device was not reached.
- SAMPLE pass (30 per profile, evenly spaced through the name-ordered list, so spread across sites) on the 25 read-only profiles. These sample sizes are small, so read-only percentages are indicative only.
- Pacing: this ran at 8 requests in flight with a 40 ms gap (3 in flight in the first minutes). No non-2xx responses were recorded on the data calls (0 errors in the output file). Login hit a 429 once and backed off. The coordinator then asked for ONE request in flight and sampling-over-exhaustive. That message arrived when the scan was 99% finished (5,827 of 5,810 planned rows including a few duplicates); I stopped all scanner processes immediately and issued no further requests. Honest caveat: the scan was heavier than the coordinator wants; do not repeat the full pass. Everything needed is now in this file.
- Class labels are mine: tuya owon = has switch_1; tuya tongou = has switch but no switch_1; IT700/IT500 from the device name; boilerControl V1 = has output1OutputMask attribute, V2 = DHW.* keys. The scope of an attribute (SHARED or SERVER) was not distinguished in the all-scope read.
- "Online" below means lastActivityTime within 48 h (the code rule).

## Part 1: do real key names match the matrix?

Verdict per class (PROVEN for the devices read; sample sizes in the table).

| Class | Devices (online 48h) | Matrix match | What reality shows |
|---|---|---|---|
| Tuya owon (switch_1) | 3,028 (2,620) | MATCHES | switch_1 telemetry on 100% of online devices. No switchReported anywhere. Also relay_status 85%, cur_power 59%, cur_voltage 60%, cur_current 59%, countdown_1 50%, plus Electrical_Consumption* (rule chain). Attributes devId, tuyaDeviceType, lastActivityTime, active 100%. Examples: gk-6792-externallighting-1, gk-6812-supplyfan-1, gk-6886-chargrill. |
| Tuya tongou (switch) | 18 (13) | MATCHES, but tiny and odd | key is switch (100%), no switch_1. Only 18 devices estate-wide, and the examples are named like DHW devices (gk-6186-dhw-1, gk-hawthornefarm-dhw-1, gk-6237-externallighting-1), so tongou is a rare class, not common. Extra keys: phase_a, total_forward_energy, balance_energy, switch_prepayment, online_state (31%). 5 of the 18 are dead over 7 days. |
| Tuya, other (no switch key) | 110 (78) | not in matrix | Tuya Profile devices with no switch at all (power meters: Electrical_Consumption, forward_energy_a/b/c, voltage_a/b/c, active_power_*). Read-only. Some carry Electrical_Power and applianceOn. 14 pct share is small; never controllable by capability. |
| Salus IT700 | 241 (188) | MATCHES | heatingSetpoint 94%, coolingSetpoint 94%, localTemperature 94%, systemMode 94%, runningState 94%, holdType, scheduleEnable, batteryLevel 94%; setPoint 89%, mode 89% (string "Heat"), currentTemperature 89%, heatingActive 89%, isOnline 89%, connectivity 89%. Attributes: devId-style vendor_id, vendor_device_id, account_id (89%), salusDeviceType, siteNumber, lastConnectTime, lastDisconnectTime. systemMode is numeric (4 = heat) while mode is the string. |
| Salus IT700 -gateway receiver | 225 (126) | MATCHES (G4 "unreliable") | Telemetry is only gatewaySoftwareVersion, wiFiRSSI, cloudStatus, wiFiConnected. Attributes connectedThermostats, thermostatCount. Active but telemetry is bursty: 90 of 225 last reported 12-48 h ago. Never use for online judgement. |
| Salus IT500 | 347 (0 online) | KEYS MATCH THE FLAGGED RISK; fleet is dark | Keys on the 176 devices seen within 30 days: setPoint, currentSetpoint, currentTemperature, mode, heatingActive, hotWaterOn, hotWaterBoostHoursRemaining, hotWaterAvailable, hwStatus, isHeating, isOnline, connectivity, rssi, batteryStatus. NO heatingSetpoint, NO hotWater, NO hwBoostHours. Attributes include hwMode, chMode, programs, schedule, site. So mapTelemetry (heatingSetpoint, setpoint, setpointC) finds no setpoint, and hasSetpointSignal is false: IT500 shows no setpoint and cannot be controlled. Newest lastActivityTime in the whole IT500 fleet is 11.9 days ago, median 24 days. ZERO of 347 active in 48 h or even 7 days. |
| Bare salus (OOHDASH-108 old convention) | 384 (0 online) | MATCHES key shape (same as IT500) but the fleet is dark | Names like gk_wingfieldfarm_salus_STA10108576 (5694-r-2), device profile salusDevice. Keys: setPoint, currentSetpoint, mode, currentTemperature, heatingActive, hotWaterOn, hotWaterBoostHoursRemaining, hwStatus, isOnline, connectivity. Same shape as IT500. All 382 sampled share one lastActivityTime around 134 days ago (about 2026-06-02), median 134 d, none in the last 30 days. A single-event stop, not 385 independent outages. |
| Intesis, profile airConditioningProfile | 246 (212) | MATCHES | Setpoint 98%, OnOff 98%, Mode 98%, Temperature 98%, FanSpeed 98%, AlarmStatus 98%, ErrorCode 98%, applianceOn 98%, Electrical_Power/Energy. Attributes SetpointTresholdHigh/Low, applianceState. 34 are dead over 48 h. Example: gk-birchwoodfarm-ac-1. |
| Intesis, vendor-bridged (profile default, name md-NNNN-intesis-xxxxxxxx) | 12 | NOT IN MATRIX | A second Intesis class: keys setPoint, mode, currentTemperature, isOnline, connectivity, heatingActive, coolingActive; attributes vendor_id, vendor_device_id, account_id, lastConnectTime. Carries setpointDesired and modeDesired attributes (never refreshed since about 12 June). Keys differ from the airConditioningProfile Intesis. Examples: md-1244-intesis-c7ea6f88, md-413-intesis-cbfd7548, gk-6770-intesis-ed277306. |
| boilerControl V2 | 74 (66) | MATCHES | DHW.*, CHZ1.*, CHZ2.*, boiler.*, recirc_pump.*, contractor_override, summer_mode, sysinfo.*; DHW.use_boiler as attribute. Examples: gk-6261-boilercontrol-1, gk-5804-boilercontrol-1, gk-7773-boilercontrol-1. |
| boilerControl V1 | 148 (132) | MATCHES, and V1 EXISTS (the earlier 3-device sample missed it) | Attributes output1OutputMask, output1InputMask, output1Output1..4Mask, output1..4Override, tempSensorTimeoutMins, summerMode, output1..4Schedule. Telemetry output1..4State, output1..4Override, flow1..5Temp, input1..4State, DHWStatActive, CHZ1V2State, outsideTemp, remoteItActive. V1 is twice as common as V2 (148 vs 74). Examples: gk-2933-boilercontrol-1, gk-4741-boilercontrol-1. 4 more boilerControl devices are test or old names with no data. |
| gatewayDevice (306) | 303 | NOT IN MATRIX as such | Despite the name these are mostly appliance power meters named like kitchen assets (gk-fhkworsley-grill-1): Electrical_Energy, Electrical_Power, applianceOn. 3 carry switch_1 (a gatewayDevice with a switch is capability-controllable in the code). 11 are named -ac and carry Intesis-style keys. |

Read-only classes (30-device samples, indicative). Keys present match TOPO descriptions.

| Class | Sampled (online 48h) | Core keys seen |
|---|---|---|
| fridge and freezer profile | 30 (25) | air_temp 92%, evaporator_temp 92%, line_temp 88%, doorStatus 100%, door_open_day, delta, batteryVoltage, rssi, Electrical_Consumption 92% |
| cellar profile | 30 (27) | air_temp, evaporator_temp, line_temp, doorStatus 96%, delta, Electrical_Consumption 78% |
| fridgeSimpleTempMonitoringProfile | 14 (8) | temperature, humidity, rssi, batteryVoltage |
| warewashMonitoringProfile | 30 (23) | consumptionWater, totalPulse, waterFlowValue, Electrical_Consumption* |
| fryerMonitoringProfile / ovenMonitoringProfile | 30 / 30 (22 / 26) | input1/2, Electrical_Power, applianceOn; oven adds consumptionWater, filterUsageLiquidLeft |
| meterOnlyProfile / AMR_profile | 30 (27) / 11 (0) | Electrical_Power, Electrical_Energy; AMR_profile 11 of 11 silent over 3 days (median 3.4 d, expected for an AMR API) |
| ambientTempMonitoringProfile / roof profile / door profile | 30 each (22 / 24 / 23) | ambtemperature, humidity; roof only rssi, batteryVoltage; door doorStatus, TempC1-3, Work_mode |
| gasValveMonitoringProfile / heatingHotWaterMonitoringProfile | 15 (12) / 30 (24) | pinStauts, valveTotalPulse; boilerFlowTemperature, boilerReturnTemperature, hotWaterTemperature |
| boiler-control (hyphen, Watteco) | 30 (25) | temperature, battery, snr, data, decoded, fCnt (a LoRa uplink, not the camelCase panel) |
| powerpause / powerpause-circuit | 30 / 30 (25 / 22) | a_v/b_v/c_v, freq, wifi_*; circuit: energy, power, pf, op_state, override |
| R10A Modbus Gateway | 30 (25) | REG20128..REG20148 (register numbers), remoteItActive |
| remoteItProfile, ttsProfile, unoxDevice | 30 each (0 online) | no telemetry keys in the sample; all dormant (median 83 d, 83 d, 239 d) |

What this changes in the matrix:
1. IT500 hot-water keys: confirmed hotWaterOn, hotWaterBoostHoursRemaining, hotWaterAvailable, hwStatus (not hotWater / hwBoostHours). Confirmed setPoint (capital P) is the setpoint key and currentSetpoint is also present. Re-key in Build.
2. Both IT500 (347) and bare salus (384) are dark in prod today: no device in either class has reported in the last 12 days (IT500) or 134 days (bare salus). That is about 730 of the 1,181 salusDevice-profile devices. The matrix and TOPO treat bare salus as about 385 live devices; this is a prod fact the dashboard design must handle (show them as offline, do not offer control). Cause is UNRESOLVED (see residual questions).
3. boilerControl V1 is the majority (148 of 222). The V1 read branch is not dead code.
4. Intesis exists in two key families (airConditioningProfile and default-profile vendor-bridged). The latter holds stale Desired attributes.
5. Tongou is only 18 devices estate-wide. Mapping `switch` is still right but low volume.

## Part 2: stuck requested values (Desired or Requested differs from the reading and older than 24 h)

Scope: all 5,140 devices of the command-capable profiles. Comparison pairs: switchDesired vs switch_1 (or switch); setpointDesired vs heatingSetpoint, else setPoint (tolerance 0.25); modeDesired vs mode; hwBoostHoursDesired vs hotWaterBoostHoursRemaining.

Headline: the estate barely uses the Desired family at all. Only 18 devices carry any Desired or Requested attribute, out of about 5,140 scanned. Stuck (differs AND older than 24 h): 9 device rows across 8 devices, by class.

| Class | Devices with any Desired/Requested | Differs from reading | Stuck over 24 h | Notes |
|---|---|---|---|---|
| Tuya owon (3,028) | 4 (+ brackley) | 3 | 0 now | Three externallighting devices hold switchDesired true, 15 h old, while switch_1 is false (10 h old). They are not yet over 24 h, so they will become stuck about 9 h from the snapshot. gk-brackley is consistent (accepted, last written 47 h ago). |
| Tuya tongou (18) | 1 | 1 | 1 | gk-6237-externallighting-1: switchDesired true, 158 h old; switch reads false (11 h ago). |
| Tuya other (110) | 2 | 0 | 0 | brackley-style test devices, in agreement. |
| Salus IT700 (241) | 5 | 3 | 3 | gk-6261-salusit700-1 setpointDesired 19, 476 h old, device 16.5 (fresh); gk-6832-salusit700-1 setpointDesired 19, 457 h old, device 18; gk-1648-salusit700-1 setpointDesired 21, 457 h old, device 22.5. gk-6835-salusit700-1 has setpointDesired 5 (frost), agrees. The three stuck rows date from the same bench-test week (late September) and all have a fresh device reading, so the device was changed locally (or never took the write). |
| Salus IT500 (347) | 2 | 0 | 0 | gk-5794-salusit500-r1 hwBoostHoursDesired 0, matches; gk-9999-salusit500-t1 setpointDesired 18, matches. |
| Bare salus (384, all dark) | 0 | n/a | 0 | No Desired key on any. |
| Salus-like in profile default / Intesis vendor-bridged (12) | 5 | 3 | 3 | md-1244-intesis-c7ea6f88 modeDesired Cool (about 2,970 h old) vs mode Off, and setpointDesired 25 vs setPoint 24; funklet-intesis-29d1f022 setpointDesired 21 vs 23 (device silent for 1,126 h). These are bench relics from about 12 June. |
| SD-492 bench | 1 | 1 | 1 | SD-492-IT500-bench setpointDesired 23 vs setpoint 18, setpointSyncStatus "drift" (the old domain), 3,000 h old. Test device, not an operator problem. |
| Intesis (airConditioningProfile, 246), boilerControl (223), gatewayDevice (306) | 0 | n/a | 0 | No Desired or Requested keys. |

Reading of this: the 6261 pattern is real but rare, and it is a test-artefact pattern rather than a growing fault. Real operator-visible stuck rows today: 4 (the three IT700 plus gk-6237). Roughly half of all stuck rows are bench relics in the default profile or SD-492. What matters for Design is not the count but the rule: the current pre-dispatch (identical change in flight, 409) would refuse a legitimate command on each of these 4 devices. Judge "already set" from the device reading, not from the Desired slot. Also note the externallighting devices at three Brackley-type sites: a Desired of true is periodically left behind when a local scheduler turns the light off, so that pattern will recur on Tuya lights. Estimate: devices that were once commanded then changed locally.

Only one device (ag-brackley-poweroutlet-6) in the estate carries the new gate attributes (switchRequested, switchSyncStatus accepted, switchLastError). No Salus device carries a setpointRequested or setpointSyncStatus attribute, so the Salus gate key names remain DEDUCED, not seen. The old-domain setpointSyncStatus telemetry remains frozen on one default-profile device.

## Part 3: real last-seen gaps and the offline threshold

Distribution of the latest telemetry timestamp age (ignoring rule-engine keys RuleNodeState and *CountHour, which tick without device activity). This is the age of the newest device-originated key, and lastActivityTime tracks it within a few minutes (median difference about 0 h; IT700 about 0.15 h).

| Class (n) | under 15 min | 15-45 min | 45 min to 3 h | 3-12 h | 12-48 h | 2-7 d | over 7 d |
|---|---|---|---|---|---|---|---|
| Tuya owon (3,028) | 94 | 2,775 | 49 | 0 | 0 | 4 | 106 |
| Tuya tongou (18) | 1 | 12 | 0 | 0 | 1 | 0 | 4 |
| Salus IT700 (224) | 12 | 149 | 7 | 1 | 5 | 2 | 48 |
| Salus IT700 -gateway (225) | 0 | 2 | 9 | 25 | 90 | 53 | 46 |
| Intesis airConditioningProfile (246) | 206 | 2 | 0 | 4 | 0 | 4 | 30 |
| boilerControl V1 (148) / V2 (74) | 143 / 68 | 1 / 0 | 0 / 0 | 0 / 0 | 0 / 1 | 0 | 4 / 5 |
| gatewayDevice (306) | 227 | 0 | 0 | 0 | 0 | 0 | 79 |
| Warewash, fryer, oven monitors (90) | 65 | 5 | 0 | 0 | 0 | 0 | 20 |
| Fridge (30) / meter, AMR (41) | 24 / 26 | 0 | 1 / 0 | 0 | 0 / 1 | 0 / 11 | 5 / 3 |
| IT500 (347), bare salus (384) | 0 | 0 | 0 | 0 | 0 | 0 | all |

Key observations:
1. Tuya owon devices report on a roughly 30 to 44 minute cycle: of the live ones (2,918 reporting within 48 h) the median gap is 0.40 h, p90 0.73 h (44 min), p95 0.73 h, p99 0.93 h. The 45-minute gate sits one minute above the normal p90 to p95. 49 of 3,028 live owon devices (1.6%) are in the 45 min to 3 h band right now, and each of them would be rejected by the gate as "gate: device offline" on an OFF request (ON-from-OFF bypasses the check). That is a false-offline risk for the gate, not only a display matter.
2. There is a clean cliff: for Tuya owon there are ZERO devices between 3 h and 48 h. A device is either on its normal cycle or it has been silent for days (106 over 7 d). The same holds for boilerControl, gatewayDevice and the monitors. Any threshold from 3 h to 24 h separates live from dead identically; the choice is about wording, not about misclassification.
3. IT700 thermostats: 161 of 174 live ones are within 45 min (median 0.43 h, p90 0.49 h), but 7 are 45 min to 3 h and 6 more are 3 to 48 h. A 3 h line catches the slow cases without losing real outages.
4. Salus receivers (-gateway) have no telemetry rhythm (most 12-48 h); judge on the thermostat payload only, as the topology doc says.
5. The code rule "lastActivityTime within 48 h" and the TOPO three-band rule (LIVE under 3 h, QUIET 3-12 h, OFFLINE over 12 h) both fit the data; the gap between 3 h and 48 h is nearly empty for the controllable classes, so neither misclassifies. The 48 h figure is the more forgiving; 3 h is the tighter and still safe for the controllable Tuya, Salus thermostat and boiler panel classes.
6. Tuya heartbeat cadence cannot be seen from attribute data alone. UNVERIFIED: whether the 30 to 44 min cycle is a device heartbeat or a bridge poll interval; only the bridge owner can say.

Recommendation (DEDUCED, high confidence for Tuya and IT700; evidence above):
- Dashboard offline threshold for controllable classes (Tuya owon/tongou, IT700, boilerControl): no device-originated telemetry for more than 3 hours. Display "quiet" between 45 min and 3 h with no offline wording.
- Do NOT adopt 45 minutes as the dashboard definition; it would mislabel about 1.6% of healthy Tuya devices.
- Keep reading the gate's own "gate: device offline" rejection verbatim, but tell Spencer 45 min is a false-reject risk for OFF requests on Tuya (see residual Q-E1).
- Keep 48 h for the monitor-only classes and as the coarse "dead" rule; per-type values need the cadence table that Sam owns.
- IT500 and bare salus: show as offline and refuse control; they are dark, not slow.

## Evidence and sources
- GET /api/tenant/devices (paged, 12,909 rows), /api/plugins/telemetry/DEVICE/{id}/values/attributes and .../values/timeseries per device, on 2026-10-14 between about 07:30Z and 09:25Z.
- Working data (scratchpad, not committed): sweep.jsonl, analysis.json, stuck.json. The session token file was deleted at the end.
- Matrix section 3 read from origin/main (docs/project/OOH_ROSETTA_STONE_MATRIX_2026-10-14.md); RESEARCH-S2-S3.md for the gate chain and the 45-minute rule.

## Residual questions (UNRESOLVED)
- Q-E1 (Spencer): "Can the gate's 45-minute offline limit be raised to 3 hours for Tuya OFF commands, given owon devices normally report every 30 to 44 minutes?" Recommended default: ask for 3 hours; until then, show the gate's rejection verbatim and let the operator retry.
- Q-E2 (Spencer or Sam): "Why have all IT500 devices (last seen 12 days ago or earlier) and all bare-salus devices (last seen about 134 days ago, around 2 June) stopped reporting: was the Arrayent poll turned off, are they retired, or is it a fault?" Recommended default: treat as offline and non-controllable; do not design Salus IT500/bare control into R1 beyond showing status.
- Q-E3 (Spencer): "Is the 30 to 44 minute Tuya telemetry cycle a device heartbeat or a bridge poll interval?" Default: assume a bridge poll and use 3 h.
- Q-E4 (Spencer): "Should the stale default-profile Desired attributes (md-1244-intesis, funklet-intesis, spencer-home-salusit700, SD-492-IT500-bench) be cleared?" Default: ignore (they never match a live device).
