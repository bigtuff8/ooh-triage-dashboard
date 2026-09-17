# OOH Device Data Dictionary — What We Can READ and CONTROL (ThingsBoard-direct)

**Timestamp:** 2026-09-16 · **Author:** OOH orchestrator session · **Status:** DRAFT for James's validation (pre-build gate). Every row is grounded in a live read against production ThingsBoard (`portal.lhlive.co.uk`) on 2026-09-16, plus a confirmed control round-trip on the dev bench. **Nothing here is inferred without being marked.**

Purpose: give a single, validatable catalogue of (a) every device type the OOH dash can **read** from ThingsBoard, and (b) the **exact control** we can elicit per type — so we can human-gate the surface before building.

---

## 0. Method & evidence
- **Read auth:** prod TB service account `svc-read@airedale-group.co.uk` (from Key Vault `airedale-kv-prod` → `thingsboard-read-*`), validated live: reads all devices + telemetry.
- **Control auth/proof:** dev-TB bench (`airedale-dev.iot-private.cloud`, `thingsboard-dev-*`). Full write→confirm round-trip PROVEN on `bench-owon-1` (Tuya switch): wrote `switchDesired`, saw `switchReported`+`switchSyncStatus=synced` in ~2s, restored.
- **Estate scanned:** all **12,812** devices paged and name-parsed; **58** device profiles; one representative device sampled per OOH-relevant profile for its telemetry vocabulary.

## 1. Estate overview
- **12,801 devices / 58 profiles** in the prod tenant. OOH touches only the slice returned by a site search.
- **373 Greene King sites** (`gk-` prefix) dominate. Minor brands: `md` (9), plus small/case-variant prefixes (`Gk`, `GK`, `gl`, `go`, `hi`, `mcd`…). **Data-quality flag:** brand prefix casing is inconsistent (`gk`/`Gk`/`GK`) → site queries must be case-insensitive.
- **Naming convention:** `{brand}-{siteNo}-{assetType}-{n}` (e.g. `gk-6261-fryer-1`). Some sites use a text token instead of a number (`gk-allertonhallfarm-ac-1`) → the site key is not always numeric.
- **Top profiles by count:** tuya Profile 3095 · meterOnly 2176 · salusDevice 1179 · roof 665 · fridge/freezer 649 · AMR 576 · warewash 497 · fryerMonitoring 486 · R10A gateway 460 · remoteIt 317 · boiler-control 315 · oven 285 · airConditioning 246 · boilerControl 224 · door 213 · cellar 201 …

---

## 2. CONTROL — what we can actively elicit (the bounded set)

Control = write a **SHARED_SCOPE** attribute on the TB device; the integration-bridge dispatches to the vendor cloud, reads back, and writes `<thing>Reported` + `<thing>SyncStatus` to telemetry. **`synced` = success, ~2–4s.** Only device types with a bridge vendor adapter (or TB-native control) are controllable; everything else is monitor-only (§3).

| Type (profile) | Control action | Write attribute (SHARED_SCOPE) | Values | Confirm (telemetry) | Status |
|---|---|---|---|---|---|
| **Tuya switch** (`tuya Profile`, 3095) | On/off a circuit (kitchen equip, lighting, fans, over-door heaters) | `switchDesired` | `true` / `false` | `switchReported` + `switchSyncStatus=synced` | ✅ **PROVEN on bench** |
| **Salus thermostat** (`salusDevice`, 1179) | Setpoint, mode, hot-water boost | `setpointDesired`, `modeDesired`, `hwBoostHoursDesired` | °C · off/heat/cool/auto/fan · 0–9h | `setpointReported`/`modeReported`/`hwBoostReported` + `*SyncStatus` | ✅ shipping path (SD-492); bench-confirmed pattern |
| **Intesis AC** (`airConditioningProfile`, 246) | Setpoint, mode, (on/off, fan speed?) | `setpointDesired`, `modeDesired` (+ `onOffDesired`/`fanSpeedDesired`?) | °C · mode enum · on/off · fan enum | `*Reported` + `*SyncStatus` | ⚠️ pattern confirmed; **OnOff/FanSpeed extras UNVERIFIED** — bench-confirm on `funklet-intesis-29d1f022` before enabling |
| **Boiler** (`boilerControl`, 224, TB-native) | Zone schedules / overrides / setpoints | per-zone SHARED attrs — **two incompatible schemas** (see note) | complex objects | zone state telemetry | 🔴 **DEFER** — heterogeneous, high-risk, not on bench |
| **Unox oven** (`unoxDevice`, 107) | (SHARED `open` only) | — | — | — | 🔴 not controllable for OOH (SD-446: 0 accounts provisioned) |

**Tuya nuances (design-relevant):**
- **Multi-gang:** some Tuya devices expose `switch_1` **and** `switch_2` (2-gang). Control may need per-channel `switchDesired` semantics — confirm whether the bridge keys off channel. (6261's devices were all single-gang.)
- **Cross-vendor state keys:** confirmed on-state must be normalised — prefer `switchReported` → else `switchOn` → else `switch_1` (owon exposes `switchReported`; tongou does not).
- **Control ≠ profile.** Some devices under *monitoring* profiles (`warewashMonitoringProfile` dishwashers, `cellar profile`) actually carry `switch_1` + `switchDesired`-capable Tuya hardware. **Controllability should be derived per-device (does it have a switch/thermostat capability the bridge supports), not from the profile name alone.**

**Boiler heterogeneity note:** the `boilerControl` profile spans ≥2 firmware schemas — site 6261 uses named zones (`CHZ1.schedule`, `DHW.schedule`, `recirc_pump.*`, `accom_*`); another controller uses indexed outputs (`output1-4`, `flowN`, `outputNSchedule/Setpoint/Override`, `summerMode`). Any boiler control must detect the schema per device. Separately, the hyphenated `boiler-control` profile (315) is **not** a boiler controller at all — it's LoRaWAN raw sensor uplinks (`rssi/temperature/battery/snr/fCnt`). Do not conflate the two.

---

## 3. READ — device types we can surface (monitor-only unless in §2)

All readable via TB telemetry/attributes. Representative telemetry vocabulary (live samples):

| Category | Profile(s) | Key telemetry (sample) | OOH use |
|---|---|---|---|
| **Heating – thermostat** | salusDevice | `localTemperature`, `currentTemperature`, `heatingSetpoint`/`setPoint`, `systemMode`/`mode`, `holdType`, `runningState`, `heatingActive`, `isOnline`, min/maxHeatSetpoint | primary triage — read + control |
| **Heating – AC** | airConditioningProfile | `Temperature`, `Setpoint`, `Mode`, `OnOff`, `FanSpeed`, `applianceOn`, `AlarmStatus`, `ErrorCode`, `Electrical_Power` | read + control |
| **Heating – boiler** | boilerControl | `outsideTemp`, per-zone `*.output_state`/`*.flow_temp`/`*.zone_valve_*_alarm`, `summer_mode`, `heating_scenario`, sysinfo | read now; control deferred |
| **Heating/HW monitor** | heatingHotWaterMonitoringProfile | `boilerFlowTemperature`, `boilerReturnTemperature`, `hotWaterTemperature` | read context |
| **Switched load (Tuya)** | tuya Profile | `switch_1`(/`switch_2`), `active_power_total`, per-phase V/I, `Electrical_Consumption`, `relay_status`, `online_state` | read + control (on/off) |
| **Kitchen – warewash** | warewashMonitoringProfile | `consumptionWater`, `waterFlowValue`, `switch_1`, power metering, `device_status` | read (+ control IF switch present) |
| **Kitchen – fryer** | fryerMonitoringProfile | `Electrical_Power`, `applianceOn`, `input1/2`, `Electrical_Consumption_*` | read |
| **Kitchen – oven (monitor)** | ovenMonitoringProfile | `consumptionWater`, `filterUsageLiquidLeft`, `waterFlowValue` | read |
| **Kitchen – oven (Unox)** | unoxDevice | `cooking_*`, `washing_*`, `energy`, `open_door` | read |
| **Refrigeration** | fridge and freezer profile | `air_temp`, `doorStatus`, `door_open_day`, `batteryVoltage` | read (cold-chain alarms) |
| **Cellar** | cellar profile | `air_temp`, `evaporator_temp`, `line_temp`, `doorStatus`(×2), + Tuya switch/power | read (+ control IF switch) |
| **Electricity meter** | meterOnlyProfile | `Electrical_Power`, `Electrical_Energy`, `applianceOn`, `Electrical_Consumption` | read |
| **Utility AMR** | AMR_profile | `consumption_wh`, `consumption_kwh`; SERVER attrs `siteNo`/`siteName`/`Brand`/`customerName`/`Utility` | read + **site header metadata** |
| **Ambient temp/humidity** | ambientTempMonitoringProfile | `temperature`, `humidity`, `ambtemperature` | read context |
| **Gas valve/solenoid** | gasValveMonitoringProfile | `pinStauts`[sic], `valveTotalPulse`, `totalPulse` | read (safety context) |
| **Door** | door profile | `doorStatus`, `TempC1-3`, `Digital_IStatus` | read |
| **Roof** | roof profile | `rssi`, `batteryVoltage` (minimal LoRa) | read (rarely relevant) |
| **Connectivity enricher** | remoteItProfile | `remoteItActive`, `remoteItTimeOnlineTs` | read (device liveness) |

**Freshness / liveness:** each device carries SERVER_SCOPE `active` + `lastActivityTime`. OOH liveness bands (SD-446): LIVE <3h, QUIET 3–12h, OFFLINE >12h. AMR meters and remote.it R10As are frequently stale (no live writer / July data) — surface as "no recent data", not as broken.

---

## 4. Classification rules (how the dash decides category + control)
1. Parse device name `{brand}-{siteNo}-{assetType}-{n}` (case-insensitive brand; siteNo may be alphanumeric).
2. Category from `(assetType token, TB profile)` — assetType is the human intent (fryer, externallighting, extractfan…), profile is the tech class.
3. **Controllable IF** the device has a bridge-supported capability: a Tuya `switch_*` (→ `switchDesired`), OR a salus/intesis thermostat (→ `setpointDesired`/`modeDesired`), OR (deferred) a `boilerControl`. Derive from capability signals, **not** the profile label alone.
4. Monitor-only otherwise → read-only tile with telemetry + liveness.

## 5. Open questions to validate before build
1. **Multi-gang Tuya** — does `switchDesired` address a channel, or is it per-device? (bench-confirm on a `switch_1`+`switch_2` device.)
2. **Intesis** — literal control attrs for OnOff / FanSpeed (bench `funklet-intesis-29d1f022`).
3. **Monitoring-profile devices with `switch_1`** (warewash/cellar) — do we expose control for these, or restrict OOH control to explicitly "controllable-intent" asset types (heating/lighting/fans/kitchen switches)? **Product decision.**
4. **Boiler** — scope for a later dedicated design; which schema generations are in the field.
5. **Site key** — handle alphanumeric site tokens (`allertonhallfarm`) alongside numeric (`6261`) in search/resolution.

## 6. Related
Design: `OOH_TB_DIRECT_DESIGN_2026-09-16.md`. Investigation: `OOH_TB_DIRECT_INVESTIGATION_2026-09-16.md`. CIR: `THINGSBOARD_ALARM_ACCESS.md` §6. Memory: `ooh-tb-read-proven-apikey`.
