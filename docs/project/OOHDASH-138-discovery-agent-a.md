# OOHDASH-138 Discovery Agent A — ThingsBoard Device & Schedule Map

**Sites:** 6261 (The Wheatsone Inn, Chef & Brewer) and 6097  
**Run date:** 2026-10-22 (Thursday)  
**Scope:** READ-ONLY. All data observed directly from live ThingsBoard at portal.lhlive.co.uk.  
**Method:** JWT auth → `/api/tenant/devices` device list → per-device CLIENT_SCOPE, SHARED_SCOPE, SERVER_SCOPE, and timeseries keys.

---

## Summary Tables

### Site 6261 — 23 devices (PROVEN: totalElements=23)

| DeviceName | DeviceId | Profile | TuyaVendor | Active | HasScheduleAttrs | ScheduleKeys | Confidence | Notes |
|---|---|---|---|---|---|---|---|---|
| gk-6261-bainmarie-1 | 569c0e90-7b64-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon smart switch; schedule is Tuya device internal timer telemetry, not a TB attribute |
| gk-6261-barfans-1 | eff180c0-7abf-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou smart switch; no schedule telemetry key |
| gk-6261-barfans-2 | d4f675a0-7abf-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou smart switch |
| gk-6261-boilercontrol-1 | 08954210-6f12-11f1-a25c-c7bd0b73b31f | boilerControl | — | true | **YES** | CHZ1.schedule, CHZ2.schedule, DHW.schedule, recirc_pump.schedule, accom_1.schedule, accom_2.schedule | PROVEN | V2 hardware; 2CH+DHW; app v3.3.0; see detailed decode below |
| gk-6261-combioven-1 | 4d13dae0-7b6b-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon; schedule is raw Tuya device telemetry |
| gk-6261-dishwasher-1 | e2aad681-7b6b-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6261-ElecAMR-1 | a5025230-529a-11f1-a25c-c7bd0b73b31f | AMR_profile | — | UNRESOLVED | No | — | PROVEN (no schedule); UNRESOLVED (active) | SERVER_SCOPE returned empty array; active status indeterminate |
| gk-6261-externallighting-1 | 96057650-7b70-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou; no schedule TS key |
| gk-6261-extractfan-1 | 37d8cc50-7b6e-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6261-fryer-1 | c1e312b0-7b6a-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6261-GasAMR-1 | cbe54ec0-529a-11f1-a25c-c7bd0b73b31f | AMR_profile | — | false | No | — | PROVEN | siteName="#REF!" in SERVER — provisioning data error; Utility=Gas |
| gk-6261-grill-1 | 86ada8f0-7b64-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou; no schedule TS key |
| gk-6261-heatedgantry-1 | a6ea1220-7b64-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6261-kitchen-r10a | da8c60a0-7ba1-11f1-a25c-c7bd0b73b31f | remoteItProfile | — | false | No | — | PROVEN | remoteIt; inactive |
| gk-6261-maindb-r10a | b2b65c50-7621-11f1-a25c-c7bd0b73b31f | remoteItProfile | — | false | No | — | PROVEN | remoteIt; inactive |
| gk-6261-merrychef-1 | f5083930-7b6b-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou; no schedule TS key |
| gk-6261-merrychef-2 | a58187d0-7b6c-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6261-merrychef-3 | 9573db20-7b64-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6261-overdoorheater-1 | 48f58c30-7abf-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou; 1 active alarm at time of read |
| gk-6261-overdoorheater-2 | 79d28ce0-7abf-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6261-overdoorheater-3 | a6f39700-7abf-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6261-salusit700-1 | 4b3882d0-7b79-11f1-a25c-c7bd0b73b31f | salusDevice | — | true | No (scheduleEnable TS only) | scheduleEnable (TS), setpointDesired (SHARED) | PROVEN | IT700TX thermostat; internal schedule mode flag reported as telemetry; no schedule stored in TB attrs |
| gk-6261-salusit700-gateway-1 | 0b3cf6c0-7b79-11f1-a25c-c7bd0b73b31f | salusDevice | — | **false** | No | — | PROVEN | SAWZ600GW gateway; currently offline |

### Site 6097 — 20 devices (PROVEN: totalElements=20)

| DeviceName | DeviceId | Profile | TuyaVendor | Active | HasScheduleAttrs | ScheduleKeys | Confidence | Notes |
|---|---|---|---|---|---|---|---|---|
| gk-6097-bainmarie-1 | d8b860d0-5ffe-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6097-barfans-1 | 3fa9dd90-5ff1-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6097-boilercontrol-1 | 148fd140-5520-11f1-a25c-c7bd0b73b31f | boilerControl | — | true | **YES** | CHZ1.schedule, DHW.schedule, recirc_pump.schedule, accom_1.schedule, accom_2.schedule (CHZ2.schedule present but empty) | PROVEN | V2 hardware; 1CH+DHW; app v3.3.0; cellular modem; see detailed decode below |
| gk-6097-coffeemachine-1 | 81514710-6000-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6097-combioven-2 | 0a4b7c01-6008-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6097-dishwasher-1 | b35716b0-6008-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6097-ElecAMR-1 | 58a5d420-529a-11f1-a25c-c7bd0b73b31f | AMR_profile | — | false | No | — | PROVEN | Inactive |
| gk-6097-externallighting-1 | c9d2f9c0-5ff1-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6097-extractfan-1 | 37c5ea60-6000-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou (no schedule TS key — differs from 6261 owon extractfan) |
| gk-6097-fryer-1 | 9e16ca40-6006-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6097-fryer-2 | 3985acb0-6009-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6097-GasAMR-1 | a8537900-529a-11f1-a25c-c7bd0b73b31f | AMR_profile | — | false | No | — | PROVEN | Inactive |
| gk-6097-glasswasher-1 | b98feb90-5ff1-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6097-grill-1 | e69ae8c0-6009-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6097-hcuboard-1 | 4e253830-5ffe-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6097-heatedgantry-1 | 2e5db0e1-5ffe-11f1-a25c-c7bd0b73b31f | tuya Profile | owon | true | No | schedule (TS only) | PROVEN | Owon |
| gk-6097-merrychef-1 | 3322e3a0-600a-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6097-merrychef-2 | 390abae0-600a-11f1-a25c-c7bd0b73b31f | tuya Profile | tongou | true | No | — | PROVEN | Tongou |
| gk-6097-salusit700-1 | 46460eb0-6007-11f1-a25c-c7bd0b73b31f | salusDevice | — | true | No (scheduleEnable TS only) | scheduleEnable (TS) | PROVEN | IT700TX thermostat; salusLocation="axe and cleaver"; no stored schedule in TB attrs |
| gk-6097-salusit700-gateway-1 | 0264bcf0-6007-11f1-a25c-c7bd0b73b31f | salusDevice | — | **false** | No | — | PROVEN | SAWZ600GW-5E10D800 gateway; currently offline |

---

## Schedule Attribute Decode

### Decode methodology

Schedule format (V2 boilerControl): SHARED_SCOPE key `{channel}.schedule` contains `{"schedule":[{entries}]}` where each entry has:
- `value` — setpoint in °C (or 1000/-1000 for recirc_pump on/off)
- `time` — HH:MM when the setpoint takes effect
- `loops` — 7-character day mask, left-to-right = Mon(0) Tue(1) Wed(2) **Thu(3)** Fri(4) Sat(5) Sun(6); '1' = active on that day
- `timer_id` — internal reference (65184321 at both sites, same value)

Thursday = position 3. To determine today's schedule: select entries where `loops[3] == '1'`, sort ascending by time; the setpoint is in effect from that time until the next entry.

---

### gk-6261-boilercontrol-1 — Schedule Decode

**Configuration (PROVEN):**
- Type: boilerControl V2 (`tags: boilercontrol_v2`, `hardware_version: 2`)
- App version: 3.3.0
- Heating scenario: `{"restaurant":"2CH + DHW","accom":1,"separate_dhw":1}` — 2 central heating zones, separate DHW circuit
- Channels: flow_temp_sensors, sysinfo, boiler, CHZ1, CHZ2, DHW, recirc_pump, accom_1, accom_2
- Outside temp threshold: 13°C
- optimum_start_stop: CHZ1=true, CHZ2=true (SERVER and SHARED confirmed)
- LoRaWAN sensors: CHZ1 → gk-6261-tempsensor-1 (devEui 70B3D5E75F2003D9); CHZ2 → gk-6261-tempsensor-2 (devEui 70B3D5E75F2003A2)

**Source of truth for schedules:** SHARED_SCOPE (authoritative config store). CLIENT_SCOPE contains matching copies — when the two differ in entry order, SHARED_SCOPE is definitive.

#### DHW.schedule (SHARED_SCOPE, lastUpdateTs 1784276698978 ≈ 2025-05-15)

Raw: `{"schedule":[{"value":57,"time":"06:00","timer_id":"65184321","loops":"1111111"},{"value":15,"time":"01:00","timer_id":"65184321","loops":"1111111"}]}`

| Time | Value (°C) | loops | Days active |
|---|---|---|---|
| 01:00 | 15 | 1111111 | Every day |
| 06:00 | 57 | 1111111 | Every day |

**Thursday today:** Dormant/legionella setback (15°C) applies from 01:00. Heating active (57°C) from 06:00. No further entry until 01:00 next day.

Human-readable: DHW heats to 57°C from 06:00 daily, drops to 15°C setback at 01:00. Active on Thursdays from 06:00–01:00 (next day).

#### CHZ1.schedule (SHARED_SCOPE, lastUpdateTs 1792178735273 ≈ 2026-10-16)

Raw: `{"schedule":[{"value":21,"time":"09:00","timer_id":"65184321","loops":"1111111"},{"value":15,"time":"23:00","timer_id":"65184321","loops":"1111111"}]}`

| Time | Value (°C) | loops | Days active |
|---|---|---|---|
| 09:00 | 21 | 1111111 | Every day |
| 23:00 | 15 | 1111111 | Every day |

**Thursday today:** Heating (21°C) from 09:00, setback (15°C) from 23:00.

#### CHZ2.schedule (SHARED_SCOPE, lastUpdateTs 1792178722697 ≈ 2026-10-16)

Identical to CHZ1.schedule.

**Thursday today:** Same — 21°C from 09:00, 15°C from 23:00.

Note: CHZ1 and CHZ2 share the same schedule with optimum_start_stop enabled on both.

#### recirc_pump.schedule (SHARED_SCOPE, lastUpdateTs 1784276716301 ≈ 2025-05-15)

Raw: `{"schedule":[{"value":1000,"time":"06:00","timer_id":"65184321","loops":"1111111"},{"value":-1000,"time":"01:00","timer_id":"65184321","loops":"1111111"}]}`

| Time | Value | Meaning | loops | Days active |
|---|---|---|---|---|
| 01:00 | -1000 | OFF | 1111111 | Every day |
| 06:00 | 1000 | ON | 1111111 | Every day |

**Thursday today:** Pump OFF from 01:00. Pump ON from 06:00.

#### accom_1.schedule and accom_2.schedule (CLIENT_SCOPE)

Raw: `{"schedule":[]}` — both empty. Accommodation channels have no programmed schedule entries.

---

### gk-6097-boilercontrol-1 — Schedule Decode

**Configuration (PROVEN):**
- Type: boilerControl V2 (`tags: boilercontrol_v2`, `hardware_version: 2`)
- App version: 3.3.0
- Heating scenario: `{"restaurant":"1CH + DHW","accom":1,"separate_dhw":0}` — 1 central heating zone only, DHW is not on a separate circuit
- Channels: flow_temp_sensors, sysinfo, boiler, CHZ1, DHW, recirc_pump, accom_1, accom_2 (no CHZ2)
- Outside temp threshold: 15°C (higher than 6261's 13°C)
- optimum_start_stop: CHZ1=true, CHZ2=false (SERVER confirmed)
- LoRaWAN sensors: CHZ1 → gk-6097-tempsensor-1 (devEui 70B3D5E75F2008D7) + gk-6097-tempsensor-2 (devEui 70B3D5E75F2001DC)
- Connectivity: cellular modem (telemetry keys: modem.iccid, modem.operator, modem.rssi, modem.rsrp, modem.snr, modem.rsrq)

#### CHZ1.schedule (SHARED_SCOPE, lastUpdateTs 1791538899154 ≈ 2026-10-09)

Raw: `{"schedule":[{"value":21,"time":"11:00","loops":"0111100"},{"value":15,"time":"22:00","loops":"1111100"},{"value":15,"time":"23:00","loops":"0000011"},{"value":21,"time":"09:00","loops":"1000011"}]}`

| Time | Value (°C) | loops | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|---|---|---|
| 09:00 | 21 | 1000011 | Y | — | — | — | — | Y | Y |
| 11:00 | 21 | 0111100 | — | Y | Y | **Y** | Y | — | — |
| 22:00 | 15 | 1111100 | Y | Y | Y | **Y** | Y | — | — |
| 23:00 | 15 | 0000011 | — | — | — | — | — | Y | Y |

**Thursday (pos 3) active entries:** loops[3]=1 for entries at 11:00 (0111100) and 22:00 (1111100). Entry at 09:00 (1000011) and 23:00 (0000011) do NOT apply Thursday.

**Thursday today decoded:**
- 00:00–10:59: Last prior active entry carried from Wednesday. Wednesday's last entry is 22:00 at 15°C (loops "1111100" → Wed applies). So entering Thursday at 15°C setback.
- 11:00: → 21°C (heating on)
- 22:00: → 15°C (setback / heating off)

Human-readable Thursday: Cold start (15°C setback) until 11:00, heating active 11:00–22:00 at 21°C, setback from 22:00.

Contrast with weekends: heating on from 09:00 (Sat/Sun), off at 23:00 (Sat/Sun). Monday: on at 09:00, off at 22:00.

#### DHW.schedule (SHARED_SCOPE, lastUpdateTs 1787321067367 ≈ 2026-07-29)

Raw: `{"schedule":[{"value":57,"time":"06:00","timer_id":"65184321","loops":"1111111"},{"value":15,"time":"23:00","timer_id":"65184321","loops":"1111111"}]}`

| Time | Value (°C) | loops | Days active |
|---|---|---|---|
| 06:00 | 57 | 1111111 | Every day |
| 23:00 | 15 | 1111111 | Every day |

**Thursday today:** DHW heating (57°C) from 06:00, setback (15°C) from 23:00.

Note: 6261 DHW drops at 01:00; 6097 DHW drops at 23:00. Different sites, different operating hours.

#### recirc_pump.schedule (SHARED_SCOPE, lastUpdateTs 1786136621959 ≈ 2026-06-23)

Raw: `{"schedule":[{"value":1000,"time":"06:00","timer_id":"65184321","loops":"1111111"},{"value":-1000,"time":"23:55","timer_id":"65184321","loops":"1111111"}]}`

| Time | Value | Meaning | loops | Days active |
|---|---|---|---|---|
| 06:00 | 1000 | ON | 1111111 | Every day |
| 23:55 | -1000 | OFF | 1111111 | Every day |

**Thursday today:** Pump ON from 06:00, OFF from 23:55.

Note: 6261 pump off at 01:00; 6097 pump off at 23:55. Slightly different patterns.

#### CHZ2.schedule (CLIENT_SCOPE only)

Raw: `{"schedule":[]}` — empty. CHZ2 is not in channels at this site; the key exists in CLIENT config but has no entries and is not operational.

#### accom_1.schedule and accom_2.schedule

Raw: `{"schedule":[]}` — both empty at 6097, same as 6261.

---

## Per-Site Findings

### Site 6261 — Detailed Findings

**Device count:** 23 (PROVEN)

**Device type breakdown:**
- tuya Profile (owon): 7 — bainmarie-1, combioven-1, dishwasher-1, extractfan-1, fryer-1, heatedgantry-1 + (also the tongou below for total count)
- tuya Profile (tongou): 9 — barfans-1/2, externallighting-1, grill-1, merrychef-1/2/3, overdoorheater-1/2/3
- boilerControl: 1 — boilercontrol-1
- salusDevice: 2 — salusit700-1 (thermostat), salusit700-gateway-1 (gateway)
- AMR_profile: 2 — ElecAMR-1, GasAMR-1
- remoteItProfile: 2 — kitchen-r10a, maindb-r10a

**Active devices:** 18 active, 3 inactive (GasAMR-1, kitchen-r10a, maindb-r10a, salusit700-gateway-1), 1 UNRESOLVED (ElecAMR-1 — empty SERVER_SCOPE)

**All unique attribute keys found — CLIENT_SCOPE:**

boilerControl (62 keys): `accom_1.deadband`, `accom_1.default_override_duration_mins`, `accom_1.enable_interval_mins`, `accom_1.enabled`, `accom_1.ext_thermostat_action`, `accom_1.fallback_duty_cycle`, `accom_1.fallback_period_mins`, `accom_1.lorawan_devices`, `accom_1.optimum_start_stop`, `accom_1.room_temp_timeout_mins`, `accom_1.schedule`, `accom_1.temp_threshold`, `accom_1.temp_timeout_s`, `accom_1.use_boiler`, `accom_1.wait_for_zv1`, `accom_1.wait_for_zv2`, `accom_1.zv_timeout_s`, `accom_2.*` (mirror of accom_1), `CHZ1.*` (full set — deadband, default_override_duration_mins, enable_interval_mins, enabled, ext_thermostat_action, fallback_duty_cycle, fallback_period_mins, lorawan_devices, optimum_start_stop, room_temp_timeout_mins, **schedule**, temp_threshold, temp_timeout_s, use_boiler, wait_for_zv1, wait_for_zv2, zv_timeout_s), `CHZ2.*` (mirror of CHZ1), `DHW.*` (deadband, default_override_duration_mins, enable_interval_mins, enabled, ext_thermostat_action, fallback_duty_cycle, fallback_period_mins, lorawan_devices, optimum_start_stop, room_temp_timeout_mins, **schedule**, temp_threshold, temp_timeout_s, use_boiler, wait_for_zv1, wait_for_zv2, zv_timeout_s), `recirc_pump.*` (mirror), `boiler.analog_output_override`, `boiler.default_override_duration_mins`, `boiler.kp`, `boiler.max_setpoint`, `boiler.min_setpoint`, `boiler.shunt_pump_off_delay_mins`, `boiler.target_return_temp`, `boiler.temp_threshold`, `boiler.temp_timeout_s`, `app_version`, `channels`, `default_override_duration_mins`, `hardware_version`, `heating_scenario`, `keys`, `max_forecast_age_m`, `outside_temp_12hr_avg`, `outside_temp_12hr_forecast`, `outside_temp_12hr_forecast_ts`, `outside_temp_threshold`, `summer_mode_end_doy`, `summer_mode_start_doy`, `tti_polling_interval_mins`

salusDevice (thermostat only): `account_id`, `deviceName`, `eUID`, `firmwareVersion`, `hardwareVersion`, `modelIdentifier`, `salusDeviceType`, `salusLocation`, `salusSerialNumber`, `siteNumber`, `vendor_device_id`, `vendor_id`

salusDevice (gateway only): `connectedThermostats`, `deviceName`, `gatewayHardwareVersion`, `gatewayMacAddress`, `modelIdentifier`, `salusSerialNumber`, `salusDeviceType`, `siteNumber`, `thermostatCount`

tuya devices: CLIENT_SCOPE was empty for all tuya devices observed.

AMR devices: CLIENT_SCOPE was empty for all AMR devices observed.

**All unique attribute keys found — SHARED_SCOPE:**

boilerControl: `CHZ1.lorawan_devices`, `CHZ1.optimum_start_stop`, `CHZ1.schedule`, `CHZ1.wait_for_zv2`, `CHZ2.lorawan_devices`, `CHZ2.optimum_start_stop`, `CHZ2.schedule`, `CHZ2.wait_for_zv2`, `DHW.schedule`, `accom_1.wait_for_zv1`, `accom_1.wait_for_zv2`, `outsideTemp`, `outsideTemp12HrAvg`, `outsideTemp12hrForecast`, `outsideTemp24HrAvg`, `outside_temp_12hr_avg`, `outside_temp_12hr_forecast`, `recirc_pump.schedule`

salusDevice (thermostat only): `setpointDesired`

All other device types (tuya, AMR, remoteIt): SHARED_SCOPE was empty array `[]`.

**All unique attribute keys found — SERVER_SCOPE (across all devices):**

`Brand`, `CHZ1.optimum_start_stop`, `CHZ2.optimum_start_stop`, `Utility`, `ackTs`, `acknowledged`, `active`, `activeAlarmCount`, `activeAlarmUpdatedTs`, `assignTs`, `clearTs`, `cleared`, `createdTime`, `criticalAlarms`, `customerId`, `customerName`, `details`, `devId`, `deviceAlarmsDisabled`, `endTs`, `hasActiveAlarm`, `highsestSeverity`, `id`, `inactivityAlarmTime`, `informationalAlarms`, `isRemovedFromRemoteIt`, `lastActivityTime`, `lastConnectTime`, `lastDisconnectTime`, `lhpAllowImport`, `name`, `openAlarms`, `originator`, `originatorDisplayName`, `originatorLabel`, `originatorName`, `propagate`, `propagateRelationTypes`, `propagateToOwner`, `propagateToOwnerHierarchy`, `propagateToTenant`, `provisionState`, `severity`, `shortname`, `siteName`, `siteNo`, `startTs`, `status`, `tags`, `tenantId`, `tuyaDeviceType`, `type`, `warningAlarms`

Key SERVER_SCOPE values observed:
- `tags`: `boilercontrol_v2` (boilerControl device only)
- `tuyaDeviceType`: `owon` (energy monitors) or `tongou` (smart switches) per device
- `siteName`, `shortname`, `Brand`, `Utility`, `siteNo`, `customerName`: present on GasAMR-1 only (provisioning data); `siteName` = "#REF!" (data error — PROVEN anomaly)

**All unique timeseries keys — site 6261 (82 distinct keys):**

Boiler-only: `CHZ1.*` (12 channels), `CHZ2.*` (12 channels), `DHW.*` (10 channels), `recirc_pump.*` (11 channels), `accom_1.*` (10 channels), `accom_2.*` (12 channels), `boiler.*` (9 channels), `sysinfo.*` (8 channels), `connected`, `contractor_override`, `outsideTemp*` (5), `summer_mode`, `t`, `tempBasedSummerMode`, `remoteItActive`, `remoteItTimeOnlineTs`

Tuya (owon): `Electrical_Consumption`, `Electrical_Consumption_halfhour_day`, `Electrical_Consumption_halfhour_night`, `Electrical_Consumption_without_nightShift_Whole_Day`, `active_power_a/b/c/total`, `bizCode`, `bizData`, `cur_current/power/voltage`, `current_a/b/c/total`, `device_status`, `electric_coe`, `electricity_coe`, `forward_energy_a/b/c/total`, `frequency`, `ov_pwr_en_a/b/c`, `ov_pwr_val_a/b/c`, `power_coe`, `power_factor_a/b/c`, `productKey`, `relay_status`, `reverse_energy_a/b/c/total`, `schedule` (raw Tuya device timer), `signalStrength`, `switch_1`, `ts`, `uuid`, `voltage_a/b/c`, `voltage_coe`

Tuya (tongou): Subset of above; notably does NOT include `schedule`. Tongou keys: `add_ele`, `bizCode`, `bizData`, `child_lock`, `cloudStatus`, `countdown_1`, `cur_current`, `cur_power`, `cur_voltage`, `cycle_time`, `device_status`, `electric_coe`, `electricity_coe`, `fault`, `light_mode`, `networkWiFiIP`, `networkWiFiMAC`, `online_state`, `power_coe`, `productKey`, `relay_status`, `signalStrength`, `switch_1`, `test_bit`, `timeZone`, `ts`, `uuid`, `voltage_coe`, `wiFiConnected`, `wiFiRSSI`

Salus (IT700TX): `autoCoolingSetpoint`, `autoHeatingSetpoint`, `batteryLevel`, `connectivity`, `coolingSetpoint`, `currentTemperature`, `error32`, `heatingActive`, `heatingSetpoint`, `holdType`, `isOnline`, `lastMessageLQI`, `lastMessageRSSI`, `localTemperature`, `maxHeatSetpoint`, `minHeatSetpoint`, `mode`, `runningState`, `scheduleEnable`, `setPoint`, `setpointReported`, `setpointSyncStatus`, `systemMode`

Salus (gateway): `gatewaySoftwareVersion`

AMR: `consumption_wh`

remoteIt: `remoteItActive`, `remoteItTimeOnlineTs`

**Schedule-specific findings — site 6261:**
- 1 device has schedule attributes stored in ThingsBoard: `gk-6261-boilercontrol-1`
- 4 schedule channels active (CHZ1, CHZ2, DHW, recirc_pump); 2 empty (accom_1, accom_2)
- All 4 active schedules use `loops: "1111111"` — uniform daily schedule, no weekday/weekend split
- DHW and recirc_pump schedules unchanged since May 2025; CHZ1/CHZ2 schedules last updated 2026-10-16 (recent)
- Tuya `schedule` key is a raw Tuya telemetry data point (device's own internal timer, if configured on device); it is NOT a configurable attribute in TB and has no stored value in CLIENT/SHARED/SERVER attributes

---

### Site 6097 — Detailed Findings

**Device count:** 20 (PROVEN)

**Device type breakdown:**
- tuya Profile (owon): 6 — bainmarie-1, combioven-2, dishwasher-1, fryer-1, fryer-2, heatedgantry-1
- tuya Profile (tongou): 9 — barfans-1, coffeemachine-1, externallighting-1, extractfan-1, glasswasher-1, grill-1, hcuboard-1, merrychef-1, merrychef-2
- boilerControl: 1 — boilercontrol-1
- salusDevice: 2 — salusit700-1 (thermostat), salusit700-gateway-1 (gateway)
- AMR_profile: 2 — ElecAMR-1, GasAMR-1

No remoteIt devices at 6097 (unlike 6261 which has 2).

**Active devices:** 16 active, 4 inactive (ElecAMR-1, GasAMR-1, salusit700-gateway-1, and — note — Salus gateway offline same as 6261)

**Unique SERVER_SCOPE keys vs 6261:** 6097 adds `latestNote` (not present at 6261) — DEDUCED to be a support note field.

**Schedule-specific findings — site 6097:**
- 1 device has schedule attributes: `gk-6097-boilercontrol-1`
- 3 schedule channels active (CHZ1, DHW, recirc_pump); 3 empty (CHZ2, accom_1, accom_2)
- CHZ1 uses a complex **weekday/weekend split** schedule with 4 entries across different day masks — notably different from 6261's uniform daily schedule
- CHZ2 channel exists in CLIENT config but with empty schedule and is NOT in the operational channels list
- DHW and recirc_pump use uniform daily schedules (loops 1111111)
- CHZ1.schedule last updated 2026-10-09; DHW.schedule last updated 2026-07-29; recirc_pump.schedule 2026-06-23
- 6097 has a different DHW switch-off time (23:00 vs 6261's 01:00) and recirc_pump off at 23:55 vs 6261's 01:00
- 6097 boilercontrol has cellular modem telemetry; 6261 does not. DEDUCED: 6097 uses a 4G SIM for connectivity, 6261 uses on-site WiFi or LAN.

---

## Anomalies and Surprises

1. **GasAMR-1 at 6261 has siteName="#REF!" in SERVER_SCOPE** (PROVEN). This is a spreadsheet formula reference that was presumably cut/pasted verbatim during provisioning. Utility=Gas, Brand=Chef & Brewer, shortname=wheatstoneinn are correct. siteName is broken. Action required: correct SERVER_SCOPE attribute.

2. **Both Salus gateways offline at both sites** (PROVEN). gk-6261-salusit700-gateway-1 active=false; gk-6097-salusit700-gateway-1 active=false. Both IT700TX thermostats are active. UNRESOLVED: whether the thermostat continues to operate autonomously when the gateway is offline, or whether this is a known / expected state.

3. **remoteIt devices at 6261 both inactive** (PROVEN). kitchen-r10a and maindb-r10a both active=false. These are remoteItProfile devices with very limited telemetry (only 3 TS keys: remoteItActive, remoteItTimeOnlineTs plus informationalAlarmCountHour). DEDUCED: Remote access via remote.it is not available at 6261 currently.

4. **Both AMR devices at 6097 inactive** (PROVEN). ElecAMR-1 and GasAMR-1 both active=false. At 6261 only GasAMR-1 is inactive (ElecAMR-1 status UNRESOLVED due to empty SERVER_SCOPE). DEDUCED: AMR metering may not be operational at 6097.

5. **6097 boilercontrol has weekday/weekend schedule split; 6261 does not** (PROVEN). 6261 CHZ1/CHZ2 run a flat 7-day schedule (09:00–23:00). 6097 CHZ1 runs Tue–Fri from 11:00, but Mon/Sat/Sun from 09:00. This reflects different trading patterns between the two sites.

6. **6097 CHZ2.schedule key exists in CLIENT_SCOPE but has no entries and CHZ2 is not in operational channels** (PROVEN). This is a residual config artefact — the V2 firmware always writes CHZ2 config keys even on a 1CH site. The heating_scenario "1CH + DHW" correctly describes the live configuration.

7. **Tuya `schedule` telemetry key appears only on owon devices, not tongou** (PROVEN). Of the 16 Tuya devices across both sites, only owon-type devices report a `schedule` timeseries key. This is a raw Tuya data point from the physical smart switch's internal timer programming — not a schedule attribute stored in or controlled by ThingsBoard.

8. **6097 boilercontrol has an additional `latestNote` SERVER_SCOPE key** not present at 6261. DEDUCED: a support note has been written against this device (confirmed by `noteHistory` timeseries key also unique to 6097).

9. **6097 CHZ1 has 2 LoRaWAN temp sensors** (devEui 70B3D5E75F2008D7 and 70B3D5E75F2001DC); 6261 CHZ1 has 1 and CHZ2 has 1. PROVEN from lorawan_devices attributes.

10. **CHZ2.zone_valve* and CHZ2.flow_temp timeseries keys exist at 6097 despite CHZ2 not being in operational channels** (PROVEN from TS keys list). DEDUCED: wiring/firmware reports these even when the channel is unconfigured. They would not carry meaningful current values.

---

## Comprehensive Attribute Key Reference

### boilerControl CLIENT_SCOPE — full key taxonomy

Prefix pattern `{channel}.{key}` where channels = CHZ1, CHZ2, DHW, recirc_pump, accom_1, accom_2:

Per-channel config keys: `deadband`, `default_override_duration_mins`, `enable_interval_mins`, `enabled`, `ext_thermostat_action`, `fallback_duty_cycle`, `fallback_period_mins`, `lorawan_devices`, `optimum_start_stop`, `room_temp_timeout_mins`, `schedule`, `temp_threshold`, `temp_timeout_s`, `use_boiler`, `wait_for_zv1`, `wait_for_zv2`, `zv_timeout_s`

Boiler-level: `boiler.analog_output_override`, `boiler.default_override_duration_mins`, `boiler.kp`, `boiler.max_setpoint`, `boiler.min_setpoint`, `boiler.shunt_pump_off_delay_mins`, `boiler.target_return_temp`, `boiler.temp_threshold`, `boiler.temp_timeout_s`

System: `app_version`, `channels`, `default_override_duration_mins`, `hardware_version`, `heating_scenario`, `keys`, `max_forecast_age_m`, `outside_temp_12hr_avg`, `outside_temp_12hr_forecast`, `outside_temp_12hr_forecast_ts`, `outside_temp_threshold`, `summer_mode_end_doy`, `summer_mode_start_doy`, `tti_polling_interval_mins`

### boilerControl SHARED_SCOPE — live operational keys

`CHZ1.lorawan_devices`, `CHZ1.optimum_start_stop`, `CHZ1.schedule`, `CHZ1.wait_for_zv2`, `CHZ2.lorawan_devices` (6261 only), `CHZ2.optimum_start_stop` (6261), `CHZ2.schedule` (6261), `CHZ2.wait_for_zv2` (6261), `DHW.schedule`, `DHW.wait_for_zv2` (6097), `accom_1.wait_for_zv1`, `accom_1.wait_for_zv2`, `outsideTemp`, `outsideTemp12HrAvg`, `outsideTemp12hrForecast`, `outsideTemp24HrAvg`, `outside_temp_12hr_avg`, `outside_temp_12hr_forecast`, `recirc_pump.schedule`, `remoteItDeviceID` (6097 only), `outside_temp_threshold` (6097 only — overrides CLIENT value)

Note: 6097 has `outside_temp_threshold: 15` in SHARED_SCOPE overriding the CLIENT value; 6261 does not have this in SHARED (uses CLIENT value of 13). This is significant — a higher threshold means summer mode activates at a higher temperature at 6097.

### boilerControl SERVER_SCOPE — derived/alarm keys

`CHZ1.optimum_start_stop`, `CHZ2.optimum_start_stop` (reflects current state), `active`, `activeAlarmCount`, `activeAlarmUpdatedTs`, `ackTs`, `acknowledged`, `assignTs`, `clearTs`, `cleared`, `createdTime`, `criticalAlarms`, `customerId`, `details`, `deviceAlarmsDisabled`, `endTs`, `hasActiveAlarm`, `highsestSeverity`, `id`, `informationalAlarms`, `inactivityAlarmTime`, `isRemovedFromRemoteIt`, `lastActivityTime`, `lastConnectTime`, `lastDisconnectTime`, `lhpAllowImport`, `name`, `openAlarms`, `originator`, `originatorDisplayName`, `originatorLabel`, `originatorName`, `propagate`, `propagateRelationTypes`, `propagateToOwner`, `propagateToOwnerHierarchy`, `propagateToTenant`, `provisionState`, `severity`, `startTs`, `status`, `tags`, `tenantId`, `type`, `warningAlarms`

---

## UNRESOLVED Items

1. **gk-6261-ElecAMR-1 active status** — SERVER_SCOPE returned an empty array `[]`. Cannot determine if the device is provisioned/active. Action: verify via direct ThingsBoard UI or check if the deviceId is correct.

2. **Salus IT700TX internal schedule state** — `scheduleEnable` is a timeseries key but its current value was not fetched as part of this sweep (only keys/names fetched, not latest values). UNRESOLVED: whether the IT700TX thermostat at either site is running in schedule mode or manual override mode. To resolve: fetch `/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries?keys=scheduleEnable`.

3. **Tuya `schedule` telemetry content** — the `schedule` timeseries key exists for owon devices but its current value was not fetched. It represents the device's own internal timer. UNRESOLVED: whether any owon device has an active internal schedule loaded, and if so, what it is. To resolve: fetch latest telemetry value for this key.

4. **Salus gateway offline reason** — both SAWZ600GW gateways at 6261 and 6097 show active=false. UNRESOLVED whether this is a persistent fault, a known state, or intermittent. The IT700TX thermostats remain active independently.

---

*All data collected 2026-10-22 from ThingsBoard portal.lhlive.co.uk. Authentication: tenant user jamesbrown@airedale-group.co.uk. Raw data files retained in scratchpad C:/Users/james/AppData/Local/Temp/claude/C--harness-runs-ooh-triage-dashboard/6334be4e-07c3-438b-9b7c-12d3b1ed6095/scratchpad/6261/ and .../6097/.*
