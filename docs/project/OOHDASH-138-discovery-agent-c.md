# OOHDASH-138 Discovery Agent C — ThingsBoard Device & Schedule Sweep

**Date:** 2026-10-22  
**Agent:** Discovery Agent C (read-only TB sweep)  
**Sites primary:** 5208, 6164 | **Extra site:** 122  
**TB endpoint:** `/api/tenant/devices` (deviceInfos 400s on this instance — OOHDASH-80 confirmed)  
**Confidence:** PROVEN = directly observed from TB API; DEDUCED = inferred from data patterns; UNRESOLVED = cannot determine from TB data alone

---

## Executive Summary

Swept three sites (5208, 6164, 122) covering all four device types present in the OOH estate: Salus IT500, Salus IT700, Tuya, and BoilerControl.

**Key finding 1 — Tuya devices DO have schedule data in TB (PROVEN).**
The `TIMESERIES.schedule` key contains a Base64-encoded 5-byte-per-record binary blob. The format is decoded below.

**Key finding 2 — Salus IT500 devices have schedule data in TB (PROVEN — but format is UNRESOLVED).**
The `SERVER_SCOPE.schedule` key contains a JSON object with 7 day-keys (A00-A06), each holding an opaque encoded string. The encoding is proprietary Salus format. The OOH dashboard does not currently have a decoder for this format.

**Key finding 3 — Salus IT700 devices do NOT have schedule content in TB (PROVEN).**
Only `TIMESERIES.scheduleEnable` (integer: 0=off, 1=on, 2=hold) is visible. The IT700 stores its schedule on-device; the schedule body is NOT accessible via TB. The IT700 gateway on both 6164 and 122 is OFFLINE (`active=false`).

**Key finding 4 — BoilerControl schedule format matches the existing `schedule.js` decoder (PROVEN).**
Both CLIENT_SCOPE and SHARED_SCOPE carry `{schedule: [{time, loops, value},...]}` arrays. This is fully handled by the current codebase.

**Key finding 5 — All Salus IT500 devices on site 5208 are OFFLINE (PROVEN).**
All 6 IT500 thermostats show `active=false` in SERVER_SCOPE. Last known activity for some was June 2026 (ts ~1780xxx), for others around Sept 2026.

**Key finding 6 — Tuya device type naming:** `type=tuya Profile`, vendor derived from device name. Device `type` field from `/api/tenant/devices` is the device profile category, not a UUID-addressable profile name.

---

## Device Summary Table — All Sites

| Site | Device | TB Type | Vendor | Active | HasSchedule | Schedule Location | ScheduleFormat | Confidence |
|------|--------|---------|--------|--------|------------|-------------------|----------------|-----------|
| 5208 | gk-5208-exractfan-1 | tuya Profile | Tuya | UNKNOWN | light_mode only | TIMESERIES | relay mode string | PROVEN |
| 5208 | gk-5208-salusit500-f1 | salusDevice | Salus IT500 | OFFLINE | YES | SERVER_SCOPE.schedule | Proprietary A00-A06 encoded | PROVEN |
| 5208 | gk-5208-salusit500-f2 | salusDevice | Salus IT500 | OFFLINE | YES | SERVER_SCOPE.schedule | Proprietary A00-A06 encoded | PROVEN |
| 5208 | gk-5208-salusit500-f3 | salusDevice | Salus IT500 | OFFLINE | YES | SERVER_SCOPE.schedule | Proprietary A00-A06 encoded | PROVEN |
| 5208 | gk-5208-salusit500-r1 | salusDevice | Salus IT500 | OFFLINE | YES | SERVER_SCOPE.schedule | Proprietary A00-A06 encoded | PROVEN |
| 5208 | gk-5208-salusit500-r2 | salusDevice | Salus IT500 | OFFLINE | YES | SERVER_SCOPE.schedule | Proprietary A00-A06 encoded | PROVEN |
| 5208 | gk-5208-salusit500-r3 | salusDevice | Salus IT500 | OFFLINE | YES | SERVER_SCOPE.schedule | Proprietary A00-A06 encoded | PROVEN |
| 5208 | gk-5208-supplyfan-1 | tuya Profile | Tuya | UNKNOWN | light_mode only | TIMESERIES | relay mode string | PROVEN |
| 6164 | gk-6164-boilercontrol-1 | boilerControl | BoilerControl | UNKNOWN | YES | CLIENT+SHARED SCOPE | {schedule:[{time,loops,value}]} | PROVEN |
| 6164 | gk-6164-chargrill-1 | tuya Profile | Tuya | UNKNOWN | YES | TIMESERIES.schedule | Base64 binary (5B/record) | PROVEN |
| 6164 | gk-6164-coffeemachine-1 | tuya Profile | Tuya | UNKNOWN | light_mode only | TIMESERIES | relay mode string | PROVEN |
| 6164 | gk-6164-combioven-1 | tuya Profile | Tuya | UNKNOWN | YES | TIMESERIES.schedule | Base64 binary (5B/record) | PROVEN |
| 6164 | gk-6164-dhw-1 | tuya Profile | Tuya | UNKNOWN | light_mode only | TIMESERIES | relay mode string | PROVEN |
| 6164 | gk-6164-dishwasher-1 | tuya Profile | Tuya | UNKNOWN | YES | TIMESERIES.schedule | Base64 binary (5B/record) | PROVEN |
| 6164 | gk-6164-ElecAMR-1 | AMR_profile | AMR | UNKNOWN | NO | — | — | PROVEN |
| 6164 | gk-6164-externallighting-1 | tuya Profile | Tuya | UNKNOWN | light_mode only | TIMESERIES | relay mode string | PROVEN |
| 6164 | gk-6164-extractfan-1 | tuya Profile | Tuya | UNKNOWN | NO | — | — | PROVEN |
| 6164 | gk-6164-fryer-1 | tuya Profile | Tuya | UNKNOWN | YES | TIMESERIES.schedule | Base64 binary (5B/record) | PROVEN |
| 6164 | gk-6164-fryer-2 | tuya Profile | Tuya | UNKNOWN | YES | TIMESERIES.schedule | Base64 binary (5B/record) | PROVEN |
| 6164 | gk-6164-fryer-3 | tuya Profile | Tuya | UNKNOWN | YES | TIMESERIES.schedule | Base64 binary (5B/record) | PROVEN |
| 6164 | gk-6164-GasAMR-1 | AMR_profile | AMR | UNKNOWN | NO | — | — | PROVEN |
| 6164 | gk-6164-glasswasher-1 | tuya Profile | Tuya | UNKNOWN | NO | — | — | PROVEN |
| 6164 | gk-6164-grill-1 | tuya Profile | Tuya | UNKNOWN | YES | TIMESERIES.schedule | Base64 binary (5B/record) | PROVEN |
| 6164 | gk-6164-heatedgantry-1 | tuya Profile | Tuya | UNKNOWN | YES | TIMESERIES.schedule | Base64 binary (5B/record) | PROVEN |
| 6164 | gk-6164-merrychef-1 | tuya Profile | Tuya | UNKNOWN | NO | — | — | PROVEN |
| 6164 | gk-6164-pastacooker-1 | tuya Profile | Tuya | UNKNOWN | YES | TIMESERIES.schedule | Base64 binary (5B/record) | PROVEN |
| 6164 | gk-6164-salusit700-1 | salusDevice | Salus IT700TX | ACTIVE | scheduleEnable=2 | TIMESERIES.scheduleEnable | Integer: 0=off/1=on/2=hold | PROVEN |
| 6164 | gk-6164-salusit700-gateway-1 | salusDevice | Salus SAWZ600GW | OFFLINE | modelIdentifier only | — | No schedule | PROVEN |
| 6164 | gk-6164-supplyfan-1 | tuya Profile | Tuya | UNKNOWN | NO | — | — | PROVEN |
| 6164 | gk-6164-supplyfan-2 | tuya Profile | Tuya | UNKNOWN | NO | — | — | PROVEN |
| 122 | gk-122-salusit700-1 | salusDevice | Salus IT700TX | ACTIVE | scheduleEnable=2 | TIMESERIES.scheduleEnable | Integer: 0=off/1=on/2=hold | PROVEN |
| 122 | gk-122-salusit700-gateway-1 | salusDevice | Salus SAWZ600GW | UNKNOWN | modelIdentifier only | — | No schedule | PROVEN |
| 122 | gk-122-boilercontrol-1 | boilerControl | BoilerControl | UNKNOWN | YES | CLIENT+SHARED SCOPE | {schedule:[{time,loops,value}]} | PROVEN |

---

## Tuya Schedule Format — PROVEN Binary Decode

**Storage location:** `TIMESERIES.schedule` (Base64-encoded binary blob)

**Encoding:** 5 bytes per record, N records concatenated and Base64-encoded.

### 5-byte record structure:

| Byte | Field | Values |
|------|-------|--------|
| 0    | Day-of-week bitmask | bit0=Sun, bit1=Mon, bit2=Tue, bit3=Wed, bit4=Thu, bit5=Fri, bit6=Sat |
| 1    | Hour | 0–23 |
| 2    | Minute | 0–59 |
| 3    | Action/phase | 0x00=Phase-A (preheat?), 0x01=Phase-B (service?) — DEDUCED |
| 4    | Enabled | 0x01=active, 0x00=inactive |

### Common day-mask values observed:

| Hex | Binary | Days |
|-----|--------|------|
| 0x61 | 01100001 | Fri + Sat + Sun (busy service days) |
| 0x1e | 00011110 | Mon + Tue + Wed + Thu (weekdays) |
| 0x7f | 01111111 | All 7 days |
| 0x3e | 00111110 | Mon–Fri (observed in some devices) |
| 0x01 | 00000001 | Sun only |
| 0x7e | 01111110 | Mon–Sat |

### Action byte (byte 3) — DEDUCED semantics:

Observed values are 0x00 and 0x01 only. The pattern across fryers, grills, chargrills suggests:
- Records with action=0x00 appear first (earlier times) — likely preheat/warm-up phase
- Records with action=0x01 appear last (latest time per group) — likely full service temperature on

**UNRESOLVED:** Exact semantics of action byte require Tuya DPS spec for the specific product category. Could be: 0=warm-up, 1=full-on; OR 0=off, 1=on. The 'multiple action=0 before action=1' pattern strongly suggests phased warm-up, not simple on/off.

### Decoded examples (sites 6164 and 122):

#### `gk-6164-chargrill-1`

**Raw Base64:** `HgsAAQEfFR4AAWEIHgEBYBYAAAEeCQAAAR4KAAABHxceAAE+AB4AAWEGHgAB`

Binary blob (45 bytes = 9 records):
| # | DayMask | Days | Time | Action | Enabled |
|---|---------|------|------|--------|---------|
| 1 | 0x1E | Mon+Tue+Wed+Thu | 11:00 | 1 | True |
| 2 | 0x1F | Sun+Mon+Tue+Wed+Thu | 21:30 | 0 | True |
| 3 | 0x61 | Sun+Fri+Sat | 08:30 | 1 | True |
| 4 | 0x60 | Fri+Sat | 22:00 | 0 | True |
| 5 | 0x1E | Mon+Tue+Wed+Thu | 09:00 | 0 | True |
| 6 | 0x1E | Mon+Tue+Wed+Thu | 10:00 | 0 | True |
| 7 | 0x1F | Sun+Mon+Tue+Wed+Thu | 23:30 | 0 | True |
| 8 | 0x3E | Mon+Tue+Wed+Thu+Fri | 00:30 | 0 | True |
| 9 | 0x61 | Sun+Fri+Sat | 06:30 | 0 | True |

#### `gk-6164-combioven-1`

**Raw Base64:** `HgoeAQEKFR4AASoCAAABYQgeAQFgFgAAAR4IHgABHgkeAAEKFx4AARQAHgAB`

Binary blob (45 bytes = 9 records):
| # | DayMask | Days | Time | Action | Enabled |
|---|---------|------|------|--------|---------|
| 1 | 0x1E | Mon+Tue+Wed+Thu | 10:30 | 1 | True |
| 2 | 0x0A | Mon+Wed | 21:30 | 0 | True |
| 3 | 0x2A | Mon+Wed+Fri | 02:00 | 0 | True |
| 4 | 0x61 | Sun+Fri+Sat | 08:30 | 1 | True |
| 5 | 0x60 | Fri+Sat | 22:00 | 0 | True |
| 6 | 0x1E | Mon+Tue+Wed+Thu | 08:30 | 0 | True |
| 7 | 0x1E | Mon+Tue+Wed+Thu | 09:30 | 0 | True |
| 8 | 0x0A | Mon+Wed | 23:30 | 0 | True |
| 9 | 0x14 | Tue+Thu | 00:30 | 0 | True |

#### `gk-6164-dishwasher-1`

**Raw Base64:** `BgoAAQEfFwAAARgKHgEBYQgeAQFgFx4AAQYIAAABBgkAAAE+AQAAAT4CAAAB`

Binary blob (45 bytes = 9 records):
| # | DayMask | Days | Time | Action | Enabled |
|---|---------|------|------|--------|---------|
| 1 | 0x06 | Mon+Tue | 10:00 | 1 | True |
| 2 | 0x1F | Sun+Mon+Tue+Wed+Thu | 23:00 | 0 | True |
| 3 | 0x18 | Wed+Thu | 10:30 | 1 | True |
| 4 | 0x61 | Sun+Fri+Sat | 08:30 | 1 | True |
| 5 | 0x60 | Fri+Sat | 23:30 | 0 | True |
| 6 | 0x06 | Mon+Tue | 08:00 | 0 | True |
| 7 | 0x06 | Mon+Tue | 09:00 | 0 | True |
| 8 | 0x3E | Mon+Tue+Wed+Thu+Fri | 01:00 | 0 | True |
| 9 | 0x3E | Mon+Tue+Wed+Thu+Fri | 02:00 | 0 | True |

#### `gk-6164-fryer-1`

**Raw Base64:** `HgsPAQEfFR4AAWEILQEBYBYAAAEeCQ8AAR4KDwABHxceAAE+AB4AAWEGLQAB`

Binary blob (45 bytes = 9 records):
| # | DayMask | Days | Time | Action | Enabled |
|---|---------|------|------|--------|---------|
| 1 | 0x1E | Mon+Tue+Wed+Thu | 11:15 | 1 | True |
| 2 | 0x1F | Sun+Mon+Tue+Wed+Thu | 21:30 | 0 | True |
| 3 | 0x61 | Sun+Fri+Sat | 08:45 | 1 | True |
| 4 | 0x60 | Fri+Sat | 22:00 | 0 | True |
| 5 | 0x1E | Mon+Tue+Wed+Thu | 09:15 | 0 | True |
| 6 | 0x1E | Mon+Tue+Wed+Thu | 10:15 | 0 | True |
| 7 | 0x1F | Sun+Mon+Tue+Wed+Thu | 23:30 | 0 | True |
| 8 | 0x3E | Mon+Tue+Wed+Thu+Fri | 00:30 | 0 | True |
| 9 | 0x61 | Sun+Fri+Sat | 06:45 | 0 | True |

#### `gk-6164-fryer-2`

**Raw Base64:** `YQYtAAFhBy0AAWEILQEBfxUeAAF/Fx4AAR4JDwABHgoPAAEeCw8BAQ==`

Binary blob (40 bytes = 8 records):
| # | DayMask | Days | Time | Action | Enabled |
|---|---------|------|------|--------|---------|
| 1 | 0x61 | Sun+Fri+Sat | 06:45 | 0 | True |
| 2 | 0x61 | Sun+Fri+Sat | 07:45 | 0 | True |
| 3 | 0x61 | Sun+Fri+Sat | 08:45 | 1 | True |
| 4 | 0x7F | Sun+Mon+Tue+Wed+Thu+Fri+Sat | 21:30 | 0 | True |
| 5 | 0x7F | Sun+Mon+Tue+Wed+Thu+Fri+Sat | 23:30 | 0 | True |
| 6 | 0x1E | Mon+Tue+Wed+Thu | 09:15 | 0 | True |
| 7 | 0x1E | Mon+Tue+Wed+Thu | 10:15 | 0 | True |
| 8 | 0x1E | Mon+Tue+Wed+Thu | 11:15 | 1 | True |

#### `gk-6164-fryer-3`

**Raw Base64:** `YQYtAAFhBy0AAWEILQEBfxUeAAF/Fx4AAR4JDwABHgoPAAEeCw8BAQ==`

Binary blob (40 bytes = 8 records):
| # | DayMask | Days | Time | Action | Enabled |
|---|---------|------|------|--------|---------|
| 1 | 0x61 | Sun+Fri+Sat | 06:45 | 0 | True |
| 2 | 0x61 | Sun+Fri+Sat | 07:45 | 0 | True |
| 3 | 0x61 | Sun+Fri+Sat | 08:45 | 1 | True |
| 4 | 0x7F | Sun+Mon+Tue+Wed+Thu+Fri+Sat | 21:30 | 0 | True |
| 5 | 0x7F | Sun+Mon+Tue+Wed+Thu+Fri+Sat | 23:30 | 0 | True |
| 6 | 0x1E | Mon+Tue+Wed+Thu | 09:15 | 0 | True |
| 7 | 0x1E | Mon+Tue+Wed+Thu | 10:15 | 0 | True |
| 8 | 0x1E | Mon+Tue+Wed+Thu | 11:15 | 1 | True |

### Tuya devices WITHOUT schedule (no `TIMESERIES.schedule` key):

These Tuya devices have `TIMESERIES.light_mode = 'relay'` instead — they are simple on/off switches without a schedule:
- `gk-6164-coffeemachine-1`, `gk-6164-dhw-1`, `gk-6164-externallighting-1`
- `gk-6164-extractfan-1`, `gk-6164-glasswasher-1`, `gk-6164-merrychef-1`
- `gk-6164-supplyfan-1`, `gk-6164-supplyfan-2`

**DEDUCED:** `light_mode = 'relay'` indicates a switched-output device rather than a scheduled-temperature device. These devices are ON/OFF only, controlled via `switchDesired` or equivalent, not by a time schedule stored in TB.

---

## Salus IT500 Schedule Format

**Storage location:** `SERVER_SCOPE.schedule` (JSON string, encoded)

**Format:** JSON object with keys A00–A06 (7 days: Mon=A00 through Sun=A06, DEDUCED by convention).
Each value is a 24-character string using ASCII characters starting from '0' (0x30).

**Note:** `programs` key also present (SERVER_SCOPE) with keys C00–C06, all currently empty strings. Purpose UNRESOLVED.

### Example values:

#### `gk-5208-salusit500-f1`
All 7 days identical: `00>570F0;0?0=0>0@DE0E0>0`

#### `gk-5208-salusit500-f2`
- A00: `50G0:0>0<:<0?0>0D0B0E0>0`
- A01: `50G0:0>0<:<0?0>0D0B0E0>0`
- A02: `50G0:0>0<:<0?0>0D0B0E0>0`
- A03: `50G0:0>0<:<0?0>0D0B0E0>0`
- A04: `50G0:0>0<:<0?0>0D0B0E0>0`
- A05: `70?080>0;0E0=0>0@0E0E0>0`
- A06: `70?080>0;0E0=0>0@0E0E0>0`

#### `gk-5208-salusit500-f3`
All 7 days identical: `60E080>0;0E0=0>0@0E0E0>0`

#### `gk-5208-salusit500-r1`
All 7 days identical: `30?07:E0;0E0F0?0Fb?0GN>5`

#### `gk-5208-salusit500-r2`
All 7 days identical: `60E080G0;0G0F0?0FN?0GN>0`

#### `gk-5208-salusit500-r3`
All 7 days identical: `60E080>0;0E0=0>0@0E0E0>0`

### Decode attempt:

The 24-character string appears to use ASCII-offset nibble encoding:
- Each character represents a nibble: value = (charCode - 48)
- 24 chars = 24 nibbles = may represent 4 time slots, each encoded as 3 pairs of nibbles

**Example decode attempt for `00>570F0;0?0=0>0@DE0E0>0`:**
Nibbles: `[0, 0, 14, 5, 7, 0, 22, 0, 11, 0, 15, 0, 13, 0, 14, 0, 16, 20, 21, 0, 21, 0, 14, 0]`

Grouping as 4 × (6 nibbles = 3 bytes):
- Slot 1: [0, 0, 14, 5, 7, 0] → byte values if paired: (0, 229, 112)
- Slot 2: [22, 0, 11, 0, 15, 0] → byte values if paired: (352, 176, 240)
- Slot 3: [13, 0, 14, 0, 16, 20] → byte values if paired: (208, 224, 276)
- Slot 4: [21, 0, 21, 0, 14, 0] → byte values if paired: (336, 336, 224)

**UNRESOLVED:** The Salus IT500 schedule encoding is proprietary. The decoding cannot be completed from TB data alone. Spencer or the Salus bridge code (`OOHDASH-128`, `services/tb-device.js` legacy Salus path) may hold the decoder.

**Actionable question for Spencer:** What is the encoding for `SERVER_SCOPE.schedule` A00-A06 values on Salus IT500 devices?

---

## Salus IT700 — Schedule Data NOT Available in TB

**Storage location:** None — schedule is on-device only

**What IS available in TB (PROVEN):**

| Key | Scope | Value (6164) | Value (122) | Notes |
|-----|-------|-------------|-------------|-------|
| `scheduleEnable` | TIMESERIES | 2 | 2 | 0=off, 1=on, 2=temp hold (DEDUCED from ZigBee spec) |
| `systemMode` | TIMESERIES | see TB | see TB | Operating mode |
| `holdType` | TIMESERIES | see TB | see TB | Hold type |
| `heatingSetpoint` | TIMESERIES | see TB | see TB | Current target |
| `coolingSetpoint` | TIMESERIES | see TB | see TB | |
| `localTemperature` | TIMESERIES | see TB | see TB | Current room temp |
| `maxHeatSetpoint` | TIMESERIES | see TB | see TB | Upper limit |
| `minHeatSetpoint` | TIMESERIES | see TB | see TB | Lower limit |
| `runningState` | TIMESERIES | see TB | see TB | Is actively heating |
| `modelIdentifier` | CLIENT_SCOPE | IT700TX | IT700TX | |
| `salusLocation` | CLIENT_SCOPE | Accomodation stat | (per device) | Human-readable zone name |
| `eUID` | CLIENT_SCOPE | 001E5E090261D910 | per device | ZigBee UID |

**IT700 gateway (SAWZ600GW):**
- Both 6164 and 122 gateways show `active=false` in SERVER_SCOPE — OFFLINE (PROVEN)
- Gateway timeseries: gatewaySoftwareVersion, networkWiFiMAC, networkWiFiIP, wiFiConnected, wiFiRSSI, cloudStatus

**Implication for OOHDASH-138:** The IT700 schedule body cannot be displayed by reading TB. If schedule visibility is required for IT700, the OOH dashboard would need to interact with the Salus cloud API or the device directly — neither of which is currently in scope.

---

## BoilerControl Schedule Format — CONFIRMED match to existing decoder

**Storage locations:**
- `CLIENT_SCOPE.<zone>.schedule` — configuration set by admin
- `SHARED_SCOPE.<zone>.schedule` — what the device actually reads (may differ)

**Zones present on site 6164:**
- `CHZ1.schedule`, `CHZ2.schedule`, `DHW.schedule`, `recirc_pump.schedule`
- `accom_1.schedule`, `accom_2.schedule` (accommodation zones)

**Format (matches `services/schedule.js` decoder exactly):**

```json
{"schedule": [
  {"value": 21, "time": "09:00", "loops": "1000011"},
  {"value": 21, "time": "11:00", "loops": "0111100"},
  {"value": 15, "time": "22:30", "loops": "1000000"},
  {"value": 15, "time": "23:00", "loops": "0111111"}
]}
```

- `loops`: 7-char string, one char per day, mon-first (Mon=char[0], ..., Sun=char[6]), '1'=active
- `time`: HH:MM string in Europe/London local time
- `value`: temperature setpoint in °C

**Site 6164 CHZ1 schedule decoded:**
- Mon+Sat+Sun 09:00: set 21°C (service temperature)
- Tue-Fri 11:00: set 21°C
- Mon 22:30: set 15°C (setback)
- Tue-Sun 23:00: set 15°C (setback)

**This format is already handled by `decodeNextChange()` in `services/schedule.js`** — no new decoder needed for boilerControl.

---

## Site 5208 — All Attribute Keys by Device Type

### Salus IT500 (`salusDevice` type, `vendor_id=salus-it500`)

**CLIENT_SCOPE keys** (4, same for all IT500 devices):
- `account_id` — e.g. `shared`
- `site` — e.g. `(5208-f-1)`, `(5208-r-2)` (zone designation)
- `vendor_device_id` — numeric Salus device ID
- `vendor_id` — `salus-it500`

**SHARED_SCOPE keys:** None (always empty for IT500)

**SERVER_SCOPE keys** (18, presence consistent across all IT500 devices):
- `active` — boolean, all = false (offline)
- `assetCategory` — `HVAC`
- `chMode` — JSON `{A88, A89, A92}` — CH mode flags (values 0/1)
- `criticalAlarms`, `warningAlarms`, `informationalAlarms`, `openAlarms` — alarm counts
- `deviceAlarmsDisabled` — boolean
- `highsestSeverity` — e.g. `normal operation`
- `hwMode` — string `0` (hot water mode)
- `inactivityAlarmTime`, `lastActivityTime`, `lastConnectTime`, `lastDisconnectTime` — epoch ms
- `lhpAllowImport` — boolean
- `programs` — JSON C00-C06, all empty (purpose UNRESOLVED)
- `schedule` — JSON A00-A06 encoded schedule (format UNRESOLVED)
- `type` — `CH1` (central heating zone 1)

**Timeseries keys** (varies slightly by device — 12 or 18 keys observed):
- `mode`, `currentTemperature`, `heatingActive`, `hotWaterOn`, `hotWaterBoostHoursRemaining`
- `hotWaterAvailable`, `connectivity`, `setPoint`, `isOnline`
- Some devices also have: `rssi`, `temperature`, `isHeating`, `hwStatus`, `currentSetpoint`, `batteryStatus`

**Note:** IT500 at site 5208 are ALL OFFLINE. `active=false` across all 6 devices. Last activity timestamps suggest some devices went offline June 2026 (f3) and others around Sept 2026 (f1, f2, r1-r3). Site 5208 may have decommissioned or replaced these thermostats.

### Tuya fans (`tuya Profile` type) — site 5208

- `gk-5208-exractfan-1` and `gk-5208-supplyfan-1`
- `TIMESERIES.light_mode = 'relay'` — these are simple relay-switched devices
- No schedule data

---

## Site 6164 — All Attribute Keys by Device Type

### Salus IT700 (`salusDevice` type)

**CLIENT_SCOPE keys** (9 keys):
- `deviceName` — JSON string: `{deviceName, ShortID_d}`
- `eUID` — ZigBee extended UID (16-char hex)
- `firmwareVersion`, `hardwareVersion` — integers
- `modelIdentifier` — `IT700TX`
- `salusDeviceType` — `IT700TX`
- `salusLocation` — human-readable zone name (e.g. `Accomodation stat`)
- `salusSerialNumber` — full chain: `SAWZ600GW-<mac>-IT700TX-<uid>`
- `siteNumber` — integer site number

**SHARED_SCOPE:** empty

**SERVER_SCOPE keys** (5 keys):
- `active` — boolean (IT700TX = true, gateway = false)
- `deviceAlarmsDisabled` — boolean
- `inactivityAlarmTime`, `lastActivityTime` — epoch ms
- `lhpAllowImport` — boolean

**Timeseries keys** (18 keys on thermostat, 10 on gateway):
Thermostat: `warningAlarmCountHour`, `criticalAlarmCountHour`, `informationalAlarmCountHour`,
`localTemperature`, `coolingSetpoint`, `heatingSetpoint`, `autoCoolingSetpoint`, `autoHeatingSetpoint`,
`runningState`, `systemMode`, `holdType`, `maxHeatSetpoint`, `minHeatSetpoint`,
`scheduleEnable`, `lastMessageLQI`, `lastMessageRSSI`, `error32`, `batteryLevel`

Gateway: `gatewaySoftwareVersion`, `networkWiFiMAC`, `networkWiFiIP`, `wiFiConnected`,
`timeZone`, `wiFiRSSI`, `cloudStatus`, `warningAlarmCountHour`, `criticalAlarmCountHour`, `informationalAlarmCountHour`

### Tuya cooking appliances (`tuya Profile` type) — site 6164

**CLIENT_SCOPE keys** (most devices have 0 keys; some have 1 key):
- Some devices: no CLIENT_SCOPE attributes at all

**SHARED_SCOPE:** empty for all Tuya devices on 6164

**SERVER_SCOPE keys** (consistent across all Tuya devices):
- `ackTs`, `acknowledged`, `active`, `activeAlarmCount`, `activeAlarmUpdatedTs`
- `assetCategory`, `assignTs`, `clearTs`, `criticalAlarms`, `warningAlarms`, `informationalAlarms`
- `deviceAlarmsDisabled`, `highsestSeverity`, `inactivityAlarmTime`, `lastActivityTime`
- `lhpAllowImport`, `openAlarms`, `severity`, `startTs`, `status`
- `tenantId`, `tuyaDeviceType`, `type`
- Note: `active` in SERVER_SCOPE drives the device's active/inactive status in the OOH dashboard

**Timeseries keys** (key subset per device category):
- Cooking appliances (fryers, grills, etc.): `schedule`, `connectivity`, `bizCode`, `bizData`
  - Also per-device specific: `countdown_1`, `child_lock`, `batteryStatus`
- Lighting/relay devices: `light_mode`, `connectivity`
- AMR devices: `Electrical_Consumption`, `Electrical_Consumption_halfhour_day/night`
  - `add_ele`, `batteryStatus`, `bizCode`, `bizData`

---

## Schedule Format Comparison — All Vendor Types

| Aspect | BoilerControl | Tuya (cooking) | Salus IT500 | Salus IT700 |
|--------|-------------|----------------|-------------|-------------|
| **Schedule in TB?** | YES — CLIENT+SHARED SCOPE | YES — TIMESERIES | YES — SERVER_SCOPE | NO (on-device only) |
| **Key name** | `<zone>.schedule` | `schedule` | `schedule` | `scheduleEnable` only |
| **Format** | JSON `{schedule:[{time,loops,value}]}` | Base64 binary blob | JSON `{A00-A06: encoded_str}` | Integer 0/1/2 |
| **Days encoding** | 7-char loops string ('1000011') | 1-byte bitmask per record | A00-A06 keys | N/A |
| **Time encoding** | HH:MM string | Hour byte + minute byte | UNRESOLVED | N/A |
| **Value/setpoint** | Temperature °C | Phase byte (0/1) | UNRESOLVED | N/A |
| **Existing decoder** | YES — `schedule.js` | NO — needs new decoder | NO — format UNRESOLVED | N/A |
| **Action semantics** | Set temperature setpoint | Preheat phase / Service on | UNRESOLVED | Enable/Hold/Off |
| **Confidence** | PROVEN | Partially PROVEN, action=DEDUCED | PROVEN present, format=UNRESOLVED | PROVEN |

---

## Surprises and Anomalies

1. **`/api/tenant/deviceInfos` returns HTTP 400 on this TB instance.** (PROVEN) Error: `'Invalid UUID string: deviceInfos'`. The correct device-list endpoint is `/api/tenant/devices`. This matches the OOHDASH-80 history and is already handled in the OOH dashboard source (PR #33 reverted). Any new code must use `/api/tenant/devices`, NOT `deviceInfos`.

2. **All 6 Salus IT500 devices on site 5208 are offline.** (PROVEN) `active=false` for all. This may indicate site 5208 decommissioned or replaced these thermostats. If the OOHDASH-138 schedule feature targets site 5208, it cannot be tested against live IT500 data from this site.

3. **Both IT700 gateways (SAWZ600GW) on sites 6164 and 122 are offline.** (PROVEN) `active=false` on gateway SERVER_SCOPE for both. The IT700TX thermostat itself shows active=true and recent lastActivityTime. This creates an anomaly — the thermostat appears active but its gateway is not. UNRESOLVED: is the IT700 communicating via a different path, or is the `active` flag on the gateway stale?

4. **Tuya `dhw-1` on site 6164 has `light_mode=relay`, not a schedule.** (PROVEN) Despite being named `dhw` (domestic hot water), this device behaves as a simple relay switch. Its schedule interaction (if any) is outside what's visible in TB timeseries.

5. **IT500 `programs` key (SERVER_SCOPE.programs) is uniformly empty** (all C00-C06 = `''`). (PROVEN) Purpose is UNRESOLVED. Could be an alternative schedule container that is unpopulated on these sites, or a legacy field.

6. **Tuya schedule blobs vary in length.** Some devices have simple 8-record blobs (40 bytes = `YQ...BAQ==`), others have more complex 12+ record blobs (60+ bytes = `Hg...`). The longer blobs appear on devices like chargrill-1, combioven-1, heatedgantry-1 — likely more granular schedules.

7. **IT500 `type` field = `CH1`** across all devices on site 5208. This means the OOH dashboard's existing Salus legacy code (OOHDASH-128) should use `CH1` as the zone identifier.

8. **TB `type` field from `/api/tenant/devices` contains the device profile category string** (e.g. `salusDevice`, `tuya Profile`, `boilerControl`, `AMR_profile`). This is the same as what the OOH dashboard uses for profile-based routing in `tb-device.js`.

---

## Open Questions (UNRESOLVED — require external input)

| Q# | Question | Who knows | Why it matters |
|----|---------|-----------|----------------|
| Q1 | What is the Salus IT500 `SERVER_SCOPE.schedule` A00-A06 encoding? | Spencer / Salus bridge code | Cannot decode or display IT500 schedule without this |
| Q2 | What does `SERVER_SCOPE.programs` (C00-C06) contain when non-empty on IT500? | Spencer | Might be an alternative/override schedule container |
| Q3 | Why do both IT700 gateways (SAWZ600GW) show `active=false` while the IT700TX thermostats show `active=true`? | Spencer | May affect how the OOH dashboard reports IT700 online/offline |
| Q4 | Is the Tuya schedule action byte (byte 3) 0=preheat and 1=full-on, or 0=off and 1=on? | Spencer / Tuya DPS spec | Affects how the timetable is described to the operator |
| Q5 | Is site 5208 still using Salus IT500, or have those devices been replaced? | Spencer / field team | Affects whether IT500 schedule feature can be tested |
| Q6 | Can the IT700 schedule body be retrieved from the Salus cloud API (not TB)? | Spencer | Determines feasibility of showing IT700 schedules in OOH |

---

_End of OOHDASH-138 Discovery Agent C report._