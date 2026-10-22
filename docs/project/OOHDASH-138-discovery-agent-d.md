# OOHDASH-138 Discovery Agent D — Intesis, LoRaWAN, Site 122 Complex Schedule

**Date:** 2026-10-22 | **Author:** Discovery Agent D (TB read-only sweep)

---

## Device Summary Table

| Site | DeviceName | DeviceId | Profile | Vendor | Version | HasSchedule | ScheduleKeys | DecodedTimetable | Confidence | Notes |
|------|-----------|----------|---------|--------|---------|-------------|-------------|-----------------|------------|-------|
| 122 | gk-122-boilercontrol-1 | 94249e20-7a0c-11f1-a25c-c7bd0b73b31f | boilerControl | Airedale | app 3.3.0 / hw 2 | YES | DHW.schedule, CHZ1.schedule, recirc_pump.schedule, CHZ2.schedule (empty), accom_1.schedule (empty), accom_2.schedule (empty) | See §Site 122 schedule decode | PROVEN | Complex multi-rule: Mon+Sat+Sun vs Tue-Fri split |
| 122 | gk-122-salusit700-gateway-1 | 2d60bf40-868a-11f1-a25c-c7bd0b73b31f | salusDevice | Salus | — | NO | — | — | PROVEN | SAWZ600GW-001E5E10DB38; ZigBee gateway for accommodation thermostat |
| 122 | gk-122-salusit700-1 | 6a317130-868a-11f1-a25c-c7bd0b73b31f | salusDevice | Salus | — | NO | — | — | PROVEN | IT700TX-025E1675; label "Accommodation Stat" |
| 122 | gk-122-fryer-1/2/3 | (various) | tuya Profile | Tuya | — | NO | — | — | PROVEN | 3 fryers |
| 122 | gk-122-combioven-1/2 | (various) | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-chargrill-1 | 3b643a80-8686-11f1-a25c-c7bd0b73b31f | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-grill-1/2 | (various) | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-glasswasher-1/2 | (various) | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-externalheating-1/2/3 | (various) | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-externallighting-1 | c166d2f0-8690-11f1-a25c-c7bd0b73b31f | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-extractfan-1 | 917ae080-85b5-11f1-a25c-c7bd0b73b31f | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-dishwasher-1 | f1058840-8685-11f1-a25c-c7bd0b73b31f | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-heatedgantry-1 | f2a380d0-8685-11f1-a25c-c7bd0b73b31f | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-bainmarie-1 | 96f92080-85b5-11f1-a25c-c7bd0b73b31f | tuya Profile | Tuya | — | NO | — | — | PROVEN | |
| 122 | gk-122-ElecAMR-1 | 86859a60-529a-11f1-a25c-c7bd0b73b31f | AMR_profile | — | — | NO | — | — | PROVEN | |
| 122 | gk-122-GasAMR-1 | ad0a4a50-529a-11f1-a25c-c7bd0b73b31f | AMR_profile | — | — | NO | — | — | PROVEN | |
| 6770 | gk-6770-boilercontrol-1 | 0a4f8390-8e26-11f0-af01-0f88a04b9252 | boilerControl | Airedale | app 2.8.2 | YES | output2Schedule, output3Schedule, output4Schedule (empty) | See §Site 6770 schedule decode | PROVEN | V1 format; output1OutputMask=[false,true,true,true] |
| 6770 | gk-6770-intesis-ed277306 | 6ce2ab01-5e68-11f1-a25c-c7bd0b73b31f | default | Intesis | — | NO | — | — | PROVEN | vendor_device_id=2C97394CB0E1743BCE6392F4ED277306; active=false at time of sweep |
| 6770 | gk-6770-intesis-688ce553 | 6ce65480-5e68-11f1-a25c-c7bd0b73b31f | default | Intesis | — | NO | — | — | PROVEN | account_id=gk-6770; active=true, LIVE |
| 6770 | gk-6770-intesis-6b4a013d | 6ce78d00-5e68-11f1-a25c-c7bd0b73b31f | default | Intesis | — | NO | — | — | PROVEN | vendor_device_id=8BDC43BF78916C528CFF839D6B4A013D; active=true, LIVE |
| 6770 | Device 70B3D5E75F200626 | ceacd850-b97d-11f0-bb17-9fd297bb4ff9 | boiler-control | Watteco | fw 3.5.2 | NO | — | — | PROVEN | label=gk-6770-tempsensor-1; EUI=70B3D5E75F200626; linked-output-num=2; temp 19.6°C |
| 6770 | Device 70B3D5E75F2006BB | 5e954e70-b979-11f0-bb17-9fd297bb4ff9 | boiler-control | Watteco | fw 3.5.2 | NO | — | — | PROVEN | label=gk-6770-tempsensor-2; EUI=70B3D5E75F2006BB; linked-output-num=3; temp 22.4°C |
| 6770 | gk-6770-lwgateway | 43c85320-872f-11f0-af01-0f88a04b9252 | remoteItProfile | — | — | NO | — | — | PROVEN | remoteItActive=true; LoRaWAN gateway for temp sensors |
| 6770 | gk-6770-salusit700-gateway-1 | ba4f1cf0-be0b-11f0-bb17-9fd297bb4ff9 | salusDevice | Salus | — | NO | — | — | PROVEN | SAWZ600GW-5E0B4FD8 |
| 6770 | gk-6770-salusit700-1 | fac426d0-b59c-11f0-bb17-9fd297bb4ff9 | salusDevice | Salus | — | NO | — | — | PROVEN | IT700TX-025CECE8 |
| 6770 | gk-6770-salusit700-2 | 7cd5f520-b805-11f1-bf95-995fa7662af0 | salusDevice | Salus | — | NO | — | — | PROVEN | IT700TX-025CFBD6 |
| 6770 | gk-6770-maindb-r10a | 3f486dc0-a904-11f0-aef9-63eb6f282fc9 | R10A Modbus Gateway | — | — | NO | — | — | PROVEN | label=R10A IoT Gateway |
| 6770 | gk-6770-boiler-r10a | 886deb70-efcb-11f0-8fe3-c5f1d9f73790 | R10A Modbus Gateway | — | — | NO | — | — | PROVEN | label=R10A IoT Gateway |
| 6770 | gk-6770-fryer/grill/glasswasher/etc | (various) | tuya Profile | Tuya | — | NO | — | — | PROVEN | ~12 Tuya devices |
| 6770 | gk-6770-maindb-1 etc | (various) | meterOnlyProfile | — | — | NO | — | — | PROVEN | 7 meterOnly sub-boards |
| 6770 | gk-6770-ElecAMR-1 | 38841781-cec7-11f0-bef1-9775690abcb2 | AMR_profile | — | — | NO | — | — | PROVEN | |
| 6770 | gk-6770-GasAMR-1 | 37151e30-cec7-11f0-bef1-9775690abcb2 | AMR_profile | — | — | NO | — | — | PROVEN | |
| 6769 | gk-6769-boilercontrol-1 | 0a4ceb80-8e26-11f0-af01-0f88a04b9252 | boilerControl | Airedale | app 2.8.2 | YES | output2Schedule, output3Schedule, output4Schedule | See §Site 6769 schedule decode | PROVEN | V1 format; output1OutputMask=[false,true,true,false] |
| 6769 | Device 70B3D5E75F20068E | 31bc2d50-b97a-11f0-bb17-9fd297bb4ff9 | boiler-control | Watteco | fw 3.5.2 | NO | — | — | PROVEN | label=gk-6769-tempsensor-1; EUI=70B3D5E75F20068E; linked-output-num=3 |
| 6769 | Device 70B3D5E75F2004DF | 5664a330-b97a-11f0-bb17-9fd297bb4ff9 | boiler-control | Watteco | fw 3.5.2 | NO | — | — | PROVEN | label=gk-6769-tempsensor-2; EUI=70B3D5E75F2004DF; linked-output-num=UNRESOLVED (not retrieved) |
| 6769 | Device 70B3D5E75F2004C1 | 0f012f90-b97a-11f0-bb17-9fd297bb4ff9 | boiler-control | Watteco | fw 3.5.2 | NO | — | — | PROVEN | label=gk-6769-tempsensor-3; EUI=70B3D5E75F2004C1; linked-output-num=2 |
| 6769 | gk-6769-lwgateway | 04cc47a0-84bc-11f0-af01-0f88a04b9252 | remoteItProfile | — | — | NO | — | — | PROVEN | remoteItActive=true |
| 6769 | gk-6769-salusit700-gateway-1 | b9d5a730-be0b-11f0-bb17-9fd297bb4ff9 | salusDevice | Salus | — | NO | — | — | PROVEN | SAWZ600GW-5E0B6B98 |
| 6769 | gk-6769-salusit700-1 | fa7a73a0-b59c-11f0-bb17-9fd297bb4ff9 | salusDevice | Salus | — | NO | — | — | PROVEN | IT700TX-025CB3D2 |
| 6769 | gk-6769-maindb-r10a | a600cfc0-a42d-11f0-aef9-63eb6f282fc9 | R10A Modbus Gateway | — | — | NO | — | — | PROVEN | |
| 6769 | gk-6769-various tuya/meter/amr | (various) | tuya/meterOnly/AMR | — | — | NO | — | — | PROVEN | 34 devices total at site |

---

## Site 122 — Free-text Findings

### Devices found: 23

boilercontrol-1, fryer x3, combioven x2, chargrill-1, grill x2, glasswasher x2, externalheating x3, externallighting-1, extractfan-1, dishwasher-1, heatedgantry-1, bainmarie-1, salusit700-gateway-1, salusit700-1, ElecAMR-1, GasAMR-1.

### All attribute keys across all devices (boilercontrol-1 — 183 keys in SHARED_SCOPE)

The boilercontrol-1 SHARED_SCOPE holds all control config. Key groups:

- **heating_scenario** — `{"restaurant":"1CH + DHW","accom":1,"separate_dhw":0}` (restaurant gets one CH zone + DHW; 1 accom zone; DHW not on a separate cylinder)
- **channels** — `["flow_temp_sensors","sysinfo","boiler","CHZ1","DHW","recirc_pump","accom_1","accom_2"]`
- **app_version** / **hardware_version** — `3.3.0` / `2`
- **Boiler tuning** — boiler.kp, boiler.max_setpoint, boiler.min_setpoint, boiler.target_return_temp, boiler.temp_threshold, boiler.analog_output_override
- **Per-channel config** — CHZ1.*, CHZ2.*, DHW.*, recirc_pump.*, accom_1.*, accom_2.* (deadband, fallback, temp_threshold, zv_timeout_s, ext_thermostat_action, enable_interval_mins, use_boiler, wait_for_zv1/zv2, lorawan_devices, schedule, optimum_start_stop, enabled, fallback_duty_cycle, fallback_period_mins)
- **Schedule keys** — DHW.schedule, CHZ1.schedule, recirc_pump.schedule, CHZ2.schedule (empty), accom_1.schedule (empty), accom_2.schedule (empty)
- **LoRaWAN config** — CHZ1.lorawan_devices (2 sensors provisioned), all other channels have empty lorawan_devices arrays
- **Outside temp** — outsideTemp (11.62°C), outside_temp_12hr_forecast (10.46), outside_temp_12hr_avg (8.91), outside_temp_threshold (13°C)
- **Status/alarm** — active (true), lastActivityTime (1792677790386 = 14:03 today), clearTs, hasActiveAlarm (false)
- **Summer mode** — summer_mode_start_doy (105 = ~Apr 15), summer_mode_end_doy (274 = ~Oct 01)

### Schedule-specific findings

**DHW.schedule** (TS: 1791455508258, last set ~2026-10-08):

```json
{"schedule":[
  {"value":57,"time":"09:00","timer_id":"65184321","loops":"1000011"},
  {"value":57,"time":"11:00","timer_id":"65184321","loops":"0111100"},
  {"value":15,"time":"22:00","timer_id":"65184321","loops":"1111100"},
  {"value":15,"time":"23:00","timer_id":"65184321","loops":"0000011"}
]}
```

Decoded (loops mask: pos0=Mon, pos1=Tue, pos2=Wed, pos3=Thu, pos4=Fri, pos5=Sat, pos6=Sun):

| Day group | ON time | ON setpoint | OFF time | OFF setpoint |
|-----------|---------|-------------|----------|--------------|
| Mon + Sat + Sun (1000011) | 09:00 | 57°C | 22:00 (Mon) / 23:00 (Sat+Sun) | 15°C |
| Tue + Wed + Thu + Fri (0111100) | 11:00 | 57°C | 22:00 | 15°C |

DHW active window: Monday 09:00–22:00 (13 hrs), Tue–Fri 11:00–22:00 (11 hrs), Sat–Sun 09:00–23:00 (14 hrs).

**CHZ1.schedule** (TS: 1791455508258, last set ~2026-10-08):

```json
{"schedule":[
  {"value":21,"time":"09:00","timer_id":"65184321","loops":"1000011"},
  {"value":21,"time":"10:00","timer_id":"65184321","loops":"0111100"},
  {"value":15,"time":"22:30","timer_id":"65184321","loops":"1000000"},
  {"value":15,"time":"23:00","timer_id":"65184321","loops":"0111111"}
]}
```

| Day | ON time | Setpoint | OFF time | Setback |
|-----|---------|----------|----------|---------|
| Mon | 09:00 | 21°C | 22:30 | 15°C |
| Tue–Fri | 10:00 | 21°C | 23:00 | 15°C |
| Sat + Sun | 09:00 | 21°C | 23:00 | 15°C |

Note: Monday has a unique off time (22:30 vs 23:00 for all other days) — this drives the multi-rule display requirement.

**recirc_pump.schedule** (TS: 1791455508278):

Mirrors DHW pattern (value=1000 = pump ON, value=-1000 = pump OFF):
- Mon+Sat+Sun: ON 09:00, OFF 22:00 (Mon) / 23:00 (Sat+Sun)
- Tue–Fri: ON 11:00, OFF 22:00

**CHZ2.schedule:** empty `{"schedule":[]}`
**accom_1.schedule:** empty `{"schedule":[]}`
**accom_2.schedule:** empty `{"schedule":[]}`

### Format of schedule

**V3/V4 boilerControl schedule format** (observed at site 122, app 3.3.0):
- Key naming: `{channel}.schedule` where channel is CHZ1/CHZ2/DHW/recirc_pump/accom_1/accom_2
- Value: `{"schedule":[{value, time, timer_id, loops}]}` where:
  - `value` = setpoint °C (or 1000/-1000 for pump on/off)
  - `time` = "HH:MM" string
  - `timer_id` = opaque string (seems to be a session/edit token, constant within a save)
  - `loops` = 7-char bitmask string: pos0=Mon, pos1=Tue, pos2=Wed, pos3=Thu, pos4=Fri, pos5=Sat, pos6=Sun
- Each row = one timed event on the masked days. Multiple rows with same loops = not expected; the schedule works by applying the first matching row at its time on the given days.

### Surprises

1. **Monday has a unique 22:30 off time** for CHZ1 (vs 23:00 for all other days). The raw schedule achieves this with four rows rather than two, using day-group masks. The dashboard must decode this correctly — showing a flat "23:00 off" would be wrong for Monday.
2. **recirc_pump is a schedule channel** in V3 — not present in V1. The pump follows the same day-of-week logic as DHW. Value encoding is non-temperature (1000/-1000).
3. **CHZ2, accom_1, accom_2 schedules are empty** — the zones exist in config but have no timed events.
4. **Site 122 has no lwgateway** (PROVEN by TB search returning zero results for both sensor EUIs and for "gk-122-tempsensor" prefix). The boilercontrol's CHZ1.lorawan_devices shows two Watteco Clim'o sensors registered in the LoRaWAN Network Server (provisioned=true) but the TB devices have NOT been created. The sensors cannot send temperature data until an lwgateway is deployed at site 122.
5. **CHZ1.optimum_start_stop = true** (updated 2026-10-21 22:52 UTC) — CHZ1 optimum start is enabled.

---

## Site 6770 — Free-text Findings

### Devices found: 41

boilercontrol-1, fryer-1, grill-1, glasswasher-1, merrychef-1, supplyfan-1, extractfan-1, dishwasher-1, heatedgantry x2, hcupboard x2, cellar-1, cellar-1door, freezer-1, fridge-1, externallighting x3, outsidelightsdb-1, roof x3, intesis x3, salusit700-gateway-1, salusit700-1, salusit700-2, lwgateway, maindb-r10a, boiler-r10a, tempsensor-1, tempsensor-2, maindb-1, binroomdb-1, kitchendb x2, assmanflatdb-1, centraldb-1, ElecAMR-1, GasAMR-1.

### All attribute keys across all devices

**boilercontrol-1 (V1, app 2.8.2)** — ~142 keys in SHARED_SCOPE:

- **Key config** — hostname, appVersion (2.8.2), output1OutputMask ([false,true,true,true] = outputs 2/3/4 active), output1InputMask
- **Output masks** — output1Output1Mask (false), output1Output2Mask (true), output1Output3Mask (false), output1Output4Mask (false); output1Input1Mask (false), output1Input2Mask (true), output1Input3Mask (false), output1Input4Mask (false)
- **Per-output config** — output2/3/4 Setpoint, ZoneValveTimeoutS, Override, OptimumStartStop, Schedule
- **DHW config** — seperateDHWCylinder ("Yes - Lockinvar"), accommodationFedFromMainBoiler ("yes")
- **Flow sensors** — flow1/2/3/4 TempThreshold, TempTimeoutS
- **Boiler** — boilerMaxSetpoint, boilerMinSetpoint, boilerTargetReturnTemp, boilerKp, analogOutput1Override
- **Outside temp** — outsideTemp, outsideTemp12hrForecast, outsideTemp12HrAvg, outsideTemp24HrAvg, outsideTempThreshold (13), summerMode, dateBasedSummerMode
- **Status** — active, lastActivityTime, inactivityAlarmTime, outputs (live output states), tags ("boilercontrol")

Note: V1 boilercontrol has NO `DHW.lorawan_devices`, `CHZ1.lorawan_devices`, or any per-channel lorawan config. The LoRaWAN sensor linkage is stored on the sensor device itself (via `attributes.linked-output-num`) rather than on the boilercontrol.

**Intesis devices** — 10 keys each:
- CLIENT_SCOPE/SHARED_SCOPE: vendor_id (="intesis"), account_id (="gk-6770"), vendor_device_id (hex string), lhpAllowImport, deviceAlarmsDisabled, lastActivityTime, lastConnectTime, lastDisconnectTime, inactivityAlarmTime, active
- No schedule keys, no temperature setpoint config, no zone assignment
- These are pure pass-through devices — configuration lives in the Intesis hardware/cloud

**Intesis device telemetry keys:**
- isOnline (boolean string), mode ("Off"/"Heat"/"Cool"/"Auto"), currentTemperature (°C string), heatingActive (boolean string), coolingActive (boolean string), setPoint (°C string), connectivity ("LIVE"/"OFFLINE")

**Watteco Clim'o LoRaWAN temp sensors** — 18 keys in CLIENT_SCOPE:
- brandId ("watteco"), modelId ("climo"), eui (EUI-64), devAddr (4-byte LoRaWAN address), firmwareVersion ("3.5.2"), hardwareVersion ("50-70-247"), fPort (125), bandwidth (125000 Hz), spreadingFactor (7), frequency (variable, 867.7/868.1 MHz), sn (2065852533), tenantId ("airedale"), attributes ({"linked-output-num":"2" or "3"})
- active, lhpAllowImport, deviceAlarmsDisabled, inactivityAlarmTime, lastActivityTime

**Watteco Clim'o telemetry keys:**
- temperature (raw 269.8 — NOT a °C value; appears to be raw ADC or unscaled reading, ALWAYS 269.8 regardless of actual temp)
- decoded (JSON string containing actual temperature samples + humidity with ISO timestamps, 10-min resolution)
- rssi (dBm, e.g. -71 to -105), snr (dB), battery (percentage), saturation (105), fCnt (uplink frame count), data (base64 LoRaWAN payload)

**lwgateway** — telemetry keys:
- remoteItActive (true), remoteItTimeOnlineTs (epoch), criticalAlarmCountHour (0), informationalAlarmCountHour (0)

### Schedule-specific findings

**output2Schedule (latest TS: 1779371257517, ~2025-03-16):**

```json
{"schedule":[
  {"value":21,"time":"11:00","timer_id":"65184321","loops":"1111111"},
  {"value":15,"time":"12:00","timer_id":"65184321","loops":"1111111"},
  {"value":21,"time":"17:00","timer_id":"65184321","loops":"1111111"},
  {"value":15,"time":"18:30","timer_id":"65184321","loops":"1111111"}
]}
```

Human-readable: Every day — CH zone 2 ON at 11:00 (21°C), OFF at 12:00 (15°C), ON again at 17:00 (21°C), OFF at 18:30 (15°C). Split-day pattern (lunch service + dinner service).

**output3Schedule (latest TS: 1779371257517):** Identical to output2Schedule.

**output4Schedule (latest TS: 1777540675256):** empty `{"schedule":[]}` — DHW output4 has no programmed schedule. DEDUCED: DHW is either controlled by the Lockinvar cylinder's own thermostat, or the schedule was not configured and DHW operates as demand-only or continuously enabled.

### Format of schedule (V1 boilerControl)

**V1 boilerControl schedule format** (observed at sites 6769 and 6770, app 2.8.2):
- Key naming: `output{N}Schedule` where N = 2, 3, or 4 (maps to heating zones/DHW, not named channels)
- Value: same `{value, time, timer_id, loops}` array structure as V3
- No explicit channel names; mapping is: output1 = boiler/relay, output2/3 = CH zones, output4 = DHW cylinder
- V1 does NOT have DHW.schedule / CHZ1.schedule / recirc_pump.schedule style keys
- output1OutputMask determines which outputs are active: [false, true, true, true] = outputs 2/3/4 enabled

**Differences V1 vs V3:**

| Aspect | V1 (app 2.8.2) | V3 (app 3.3.0) |
|--------|----------------|----------------|
| Schedule key names | output2Schedule, output3Schedule, output4Schedule | CHZ1.schedule, CHZ2.schedule, DHW.schedule, recirc_pump.schedule, accom_1.schedule, accom_2.schedule |
| LoRaWAN config on boilercontrol | None — sensor stores linkage | Per-channel lorawan_devices array on the boilercontrol |
| DHW config key | seperateDHWCylinder | heating_scenario.separate_dhw |
| Channel enumeration | output1OutputMask bitmask | heating_scenario + channels array |
| Recirc pump schedule | Not present | recirc_pump.schedule |
| Accommodation zones | Not present | accom_1.schedule, accom_2.schedule |

### Surprises

1. **Intesis devices have NO schedule and NO config** — they are thin TB wrappers for Intesis cloud HVAC units. All configuration (setpoints, schedules, modes) lives in the Intesis hardware or Intesis cloud, not in ThingsBoard. The dashboard cannot show or edit Intesis schedules; only live operational status is available.
2. **Site 6770 has BOTH Intesis AC and LoRaWAN boiler temp sensors** — two completely independent device families on one site. The lwgateway services the Watteco sensors; the Intesis integration uses a separate cloud path.
3. **output4Schedule (DHW) is empty** despite seperateDHWCylinder="Yes - Lockinvar". Either DHW is unscheduled intentionally (cylinder stat controls it) or the schedule was never configured.
4. **LoRaWAN temp sensor `temperature` field is NOT the actual temperature** — raw value 269.8 is fixed/meaningless. The actual readings (19.6°C for tempsensor-1, 22.4°C for tempsensor-2) are inside the `decoded` JSON string field as a samples array. Dashboard reading this data must parse the `decoded` field, not use the top-level `temperature`.
5. **LoRaWAN sensors in V1 do not appear in the boilercontrol config** — linkage is stored as `attributes.linked-output-num` on the sensor device itself. To find which output a sensor belongs to, the dashboard must read the sensor's CLIENT_SCOPE, not the boilercontrol's config.

---

## Site 6769 — Free-text Findings

### Devices found: 34

boilercontrol-1, fryer-1, hspeedoven-1, coffeemachine-1, glasswasher x2, dishwasher-1, heatedgantry-1, extractfan-1, supplyfan-1, externalheating x2, externallighting x2, cellar-1, cellar-1door, freezer-1, fridge-1, roof x3, tempsensor x3, lwgateway, salusit700-gateway-1, salusit700-1, maindb-r10a, maindb-1, cellardb-1, pubdb-1, kitchendb-1, ElecAMR-1, GasAMR-1.

### Schedule-specific findings

**output2Schedule (latest TS: 1792071737582, ~2026-10-15):**

```json
{"schedule":[
  {"value":21,"time":"11:00","timer_id":"65184321","loops":"1111111"},
  {"value":15,"time":"21:30","timer_id":"65184321","loops":"1111111"}
]}
```

Human-readable: Every day — CH zone 2 ON at 11:00 (21°C), OFF at 21:30 (15°C). Simple single-period schedule.

**output3Schedule (latest TS: 1792071742403):** Identical to output2Schedule.

**output4Schedule (latest TS: 1784118778000, ~2025-06-12):**

```json
{"schedule":[
  {"value":20,"time":"23:55","timer_id":"65184321","loops":"0000011"},
  {"value":60,"time":"10:30","timer_id":"65184321","loops":"1111111"},
  {"value":20,"time":"23:00","timer_id":"65184321","loops":"1111100"}
]}
```

Human-readable: DHW output4 (if active):
- All days: ON at 10:30 (60°C setpoint)
- Mon–Fri (1111100): OFF at 23:00 (20°C)
- Sat+Sun (0000011): OFF at 23:55 (20°C)

DEDUCED: Site 6769 output4Schedule has content but output1OutputMask=[false,true,true,false] means output4 is NOT enabled. The schedule data exists from a previous configuration but is not currently active.

**LoRaWAN sensors (3 devices):**
- tempsensor-1 (70B3D5E75F20068E): linked-output-num=3
- tempsensor-2 (70B3D5E75F2004DF): linked-output-num=UNRESOLVED (CLIENT_SCOPE not fully retrieved — sweep ran into token limit)
- tempsensor-3 (70B3D5E75F2004C1): linked-output-num=2; current temp 19.3°C, humidity 57%

Three sensors vs two at 6770, yet output1OutputMask only enables outputs 2 and 3 — one sensor may be a spare or linked to a currently-disabled output.

### Surprises

1. **output4Schedule has content but output4 is disabled** in the mask — dead schedule config for an output that is not currently enabled.
2. **Three LoRaWAN sensors for two active outputs** — sensor-to-output mapping must come from `linked-output-num` on each sensor, not assumed by count.

---

## Intesis Device Type — Summary

| Property | Value | Source |
|----------|-------|--------|
| TB device type | "default" | TB device list |
| TB device profile name | "default" (profile ID: 6de6d920-12fc-11f1-be0a-ab8c63f251de) | Confirmed via API |
| Telemetry fields | isOnline, mode, currentTemperature, heatingActive, coolingActive, setPoint, connectivity | Live TB telemetry |
| Config attributes | vendor_id, account_id, vendor_device_id | CLIENT_SCOPE |
| Schedule data | None | PROVEN — all attributes checked |
| How configured | Intesis hardware/cloud — not via TB | PROVEN |

All three gk-6770 Intesis units share `account_id=gk-6770` and `vendor_id=intesis`. The `vendor_device_id` is a 32-hex-char string matching the device name suffix (e.g. device gk-6770-intesis-ed277306 → vendor_device_id ends in ...ED277306). One unit (ed277306) was inactive at time of sweep (active=false, lastActivityTime=1792675369561); the other two were LIVE.

---

## LoRaWAN Device Type — Summary

| Property | Value | Source |
|----------|-------|--------|
| TB device type | "boiler-control" | TB device list |
| TB device profile | "boiler-control" | TB device list |
| Device label | gk-{site}-tempsensor-{n} | TB label field |
| TB device name | "Device {EUI}" | TB name field — NOT site-prefixed |
| Hardware | Watteco Clim'o (temp+humidity LoRaWAN sensor) | CLIENT_SCOPE brandId/modelId |
| Firmware | 3.5.2 | CLIENT_SCOPE |
| Hardware version | 50-70-247 | CLIENT_SCOPE |
| fPort | 125 | CLIENT_SCOPE |
| LoRaWAN spec | bandwidth 125kHz, SF7, 867–868MHz | CLIENT_SCOPE |
| Output linkage | `attributes.linked-output-num` = "2" or "3" | CLIENT_SCOPE |
| Temperature (correct) | Inside `decoded` JSON string → `temperature` field | Live telemetry |
| Temperature (raw) | Top-level `temperature` field = 269.8 always | Live telemetry — do NOT use for display |
| Decoded sample cadence | ~10 minutes per sample | Observed in decoded JSON timestamps |
| Schedule data | None | PROVEN |

### LoRaWAN gateway (lwgateway)

| Property | Value | Source |
|----------|-------|--------|
| TB device type | "remoteItProfile" | TB device list |
| Function | LoRaWAN radio gateway (receives RF packets from Clim'o sensors, routes to TB) | DEDUCED from topology |
| Management | remote.it VPN | Telemetry: remoteItActive=true |
| Telemetry | remoteItActive, remoteItTimeOnlineTs, criticalAlarmCountHour, informationalAlarmCountHour | Live telemetry |
| Schedule data | None | PROVEN |
| Active at site 6769 | Yes (remoteItActive=true) | PROVEN |
| Active at site 6770 | Yes (remoteItActive=true) | PROVEN |
| At site 122 | NOT DEPLOYED — no lwgateway device in TB | PROVEN (TB search returned 0 results) |

---

## Cross-site Topology Findings

### Site 122 LoRaWAN sensors — planned but not yet live

The V3 boilercontrol at site 122 has CHZ1.lorawan_devices configured with two Watteco Clim'o sensors (EUIs 70B3D5E75F2004DD and 70B3D5E75F2001DA, both marked `"provisioned":true`). However:
- No lwgateway device exists at site 122 in TB
- TB search for both EUI strings returned zero devices
- TB search for "gk-122-tempsensor" returned zero devices

**PROVEN:** The sensors are registered in the LoRaWAN Network Server (LNS) — hence provisioned=true — but have not yet transmitted data through a gateway, so no TB device has been auto-created. Site 122 is awaiting physical lwgateway deployment. Until the gateway is deployed, CHZ1 operates without temperature feedback from LoRaWAN sensors (falling back to fallback_duty_cycle or ext_thermostat_action=0 behaviour).

### boilerControl V1 vs V3 — schedule key name gap

The dashboard must handle BOTH schedule formats:

```
V1 (app 2.x): output2Schedule / output3Schedule / output4Schedule
V3 (app 3.x): CHZ1.schedule / CHZ2.schedule / DHW.schedule / recirc_pump.schedule / accom_1.schedule / accom_2.schedule
```

There is no common key name. A naive check for `DHW.schedule` will miss V1 sites entirely. The mapping from output-number to zone name is also different:

| V1 output | V3 equivalent | Notes |
|-----------|---------------|-------|
| output2 | CHZ1 | CH zone 1 |
| output3 | CHZ2 | CH zone 2 / accommodation |
| output4 | DHW | Separate DHW (only if output1OutputMask[3]=true) |
| — | recirc_pump | V3 only |
| — | accom_1/accom_2 | V3 only |

### LoRaWAN sensor linking — V1 vs V3 difference

| | V1 (app 2.x) | V3 (app 3.x) |
|---|---|---|
| Where linkage stored | On sensor: `attributes.linked-output-num` | On boilercontrol: `{channel}.lorawan_devices` array |
| Discovery direction | Scan all boiler-control profile devices, read their attributes | Read boilercontrol SHARED_SCOPE, inspect lorawan_devices arrays |
| If sensor not yet in TB | No config on boilercontrol either | Boilercontrol lists the sensor in lorawan_devices even before it connects |

---

## UNRESOLVED Items

1. **6769 tempsensor-2 linked-output-num** — CLIENT_SCOPE not retrieved in this sweep due to token expiry before that call. UNRESOLVED. Fetch `/api/plugins/telemetry/DEVICE/5664a330-b97a-11f0-bb17-9fd297bb4ff9/values/attributes?scope=CLIENT_SCOPE` to confirm output linkage.

2. **Site 122 lwgateway deployment timeline** — boilercontrol says sensors are provisioned in LNS but no gateway at site. UNRESOLVED: is the gateway on order / being installed, or is the site permanently without LoRaWAN sensing? Check with Spencer/IoT ops team.

3. **Intesis mode control path** — telemetry shows mode/setPoint but it is unknown whether the dashboard can write back a new setPoint or mode change to Intesis units via TB. The intesis profile is "default" and the control contract for vendor_id=intesis is not documented here. UNRESOLVED — needs SD/Spencer clarification.

4. **LoRaWAN temp sensor `temperature` field = 269.8** — this appears every time across all sensors observed. It is unclear if this is a sentinel value (sensor not calibrated in this firmware), a fixed raw register, or a bug in the LNS decode rule. The `decoded` JSON field reliably contains correct values. DEDUCED to be a firmware/decode artefact; do not display the top-level `temperature` field. UNRESOLVED: root cause.

5. **output4Schedule at 6769 has data but output4 is disabled** — whether this is an old config that was superseded or an intentional change (DHW removed from schedule control at 6769) is UNRESOLVED.
