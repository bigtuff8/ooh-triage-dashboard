# OOH Estate Device-Class Topology Model — FIRST DRAFT

**Ticket:** OOHDASH-101 (epic OOHDASH-100) · **Date:** 2026-09-25 · **Author:** OOH design session
**Status:** FIRST DRAFT + 2026-09-25 Sam/Spencer validation round folded in. Working position, not signed-off fact. Every capability claim is either (a) grounded in a cited live read / SD ticket / repo doc / the validation round, or (b) explicitly flagged as inferred/unverified. The topology and comms picture is now largely confirmed (Q1/Q2/Q3/Q6 resolved); control-execution and confirmation remain under verification (Q4/Q7/Q8). Do not build against the still-flagged rows until §7 clears them.

**Changelog:**
- 2026-09-25 — updated with Sam/Spencer validation-round answers (Q1/Q2/Q3/Q6 resolved). Corrected Salus `-gateway` to **receiver → boiler** (schedules thermostat-local); made the on-site gateway dependencies authoritative (LoRaWAN pass-through, R10A Modbus metering + AC, Tuya direct); reclassified **AMR as an external-API data source** (not an on-site device); split the two boiler profiles into **two distinct classes** (`boilerControl` panel vs `boiler-control` Watteco room-temp sensors) and added the boiler-panel → Salus accommodation-heating cross-class dependency. All validation-round changes cited inline as "(Sam/Spencer validation round, 2026-09-25)".
- 2026-09-25 — updated with the SD-446 companion (estate-side TB device audit): corrected Tuya (3,089/2,719 active), warewash (497/419 active) and oven (285 combined) records, enriched the Unox record (107, absorb-not-build), reinforced the naming spec. All companion-driven changes cited inline as "(SD-446 companion)".

**What changed vs the 2026-09-16 pair:** the data dictionary and TB-direct design catalogue devices *per site*. This model turns that inside-out: it is organised **by device class**, and a site is resolved *against* the model at call time (§5). It also introduces the read-vs-control split (§4) and the three-outcome delivery model (§4) that the earlier docs did not carry — those two additions are the point of this document.

---

## 1. Purpose & how to use

**What this is.** A single reference describing every device *class* in the Greene King IoT estate that the OOH triage dashboard can encounter, and for each class: how it connects, what the dashboard can **read**, what it can **control**, how it confirms (or fails to confirm) a control action, and which "gateway" (if any) sits in its path.

**How it is referenced.** The model is **class-level, resolved site-by-site**. There is no per-site record in here. When an operator opens site 6261, the dashboard does a live TB read of `gk-6261-*`, maps each returned device onto its class in this model, and *from the class* derives the read-reachability, control-reachability and allowed actions for that specific device. The per-site resolution algorithm is §5.

**Why class-first.** There are ~373 Greene King sites and ~12,800 devices across 58 profiles (research-tb-sweep §1 counted 12,821 on 2026-09-25; the SD-446 companion audit counted **12,789** on 2026-09-11 — minor churn, 58 profiles in both). Maintaining per-site records would be unbounded and always stale. Classes are stable; the estate churns. Resolve, don't enumerate.

**Status and confidence.** This is a first draft for James, now carrying the 2026-09-25 Sam/Spencer validation round. It is honest about confidence: the **topology and comms picture is now largely confirmed** (Sam/Spencer validation round, 2026-09-25 — the gateway dependencies, the Salus receiver identity, the AMR external-API reclassification, and the two-boiler split are settled); the read plane is largely proven (live sweep 2026-09-25 + prod reads 2026-09-16); but the **control-execution and confirmation plane remains under verification** — in one important case, Tuya, command is a confirmed no-op in production today (research-sd-core §5.4), and both Tuya (Q4) and the Salus `synced` echo (Q8) are under bench verification because we may not yet be sending the correct command and/or reading the confirming telemetry. Treat every "control" claim as provisional until §7 closes.

**Companion doc now incorporated (2026-09-25).** `SD-446-tb-device-audit-unfinished-vendors.md` (the estate-side SD-446 audit — a full `/api/tenant/devices` sweep run 2026-09-11 08:27–08:37 UTC by Spencer Thompson as TENANT_ADMIN against prod TB `portal.lhlive.co.uk`) has been read and folded into this draft. It settles the warewash (497), Unox (107) and Tuya-native (3,089) counts, confirms the unfinished-vendor edges (Winterhalter / Classeq / Rational / Fagor / AltoShaam are **genuinely zero across the whole estate**, not just the bridge), and spoke to the boiler-profile question (Q6). **Note:** the SD-446 audit's "boiler twins" reading of Q6 has since been **superseded** — the 2026-09-25 Sam/Spencer validation round confirmed `boilerControl` and `boiler-control` are **two distinct classes, not twins** (Q6 RESOLVED; see §3.1 C5 / §3.2 M13). Changes SD-446 drove are cited inline as "(SD-446 companion)" below.

---

## 2. Comms architecture overview

### 2.1 The fan-in picture — telemetry arrives at ThingsBoard by FIVE paths, not one

ThingsBoard (prod `portal.lhlive.co.uk`) is the aggregation surface, but it is **not** the sole producer. Telemetry fans in via at least five independent ingest paths (research-sd-core §1). A `0` in the integration-bridge's device table means "the bridge is not carrying it", **never** "it does not exist" (research-sd-core §4). This is why the bridge's `/api/devices` showed only 1 of site 6261's 23 devices while TB-direct showed all 23 (OOH_TB_DIRECT_DESIGN §1a).

```
                          TELEMETRY IN (fan-in)                          COMMAND OUT (one plane, TB-first)
                          ==================                             =================================

  Salus IT500 ─(Arrayent cloud)─┐
  Salus IT700 ─(AWS IoT)────────┼─► integration-bridge ──(TB Gateway ──┐
  Intesis     ─(AC Cloud)───────┘    (MQTT gateway API)   MQTT API)     │
                                                                        ▼
  Tuya  ──(Tuya Cloud → Pulsar)──────► TB-native Tuya PE ─────────►  ┌─────────────────────────┐
                                       (never touches bridge)        │      ThingsBoard        │
                                                                     │  (single command plane, │
  Unox  ──(legacy)──────────────────► TB rule-node DataLoader ────► │      SD-575)            │
                                                                     │                         │
  LoRaWAN sensors ──(TTI / The       ► TB-native TTI/LoRaWAN PE ───► │  operator writes        │
   Things Stack, 13 TTI* integ.)      (roof, some meters)           │  {prop}Desired  ────────┼──► bridge subscribes
                                                                     │  (SHARED_SCOPE)         │    (TB WebSocket) ──► vendor
  R10A / remote.it ─(R3 GraphQL)────► remote.it enricher ─────────► │                         │    cloud ──► device
                                       (SERVER_SCOPE attrs only)     └─────────────────────────┘         │
                                                                          ▲                              │
  Boiler ──(native MQTTS, DIRECT to TB, no bridge hop)─────────────────────┘   Boiler command = bare keys +
                                                                                `override` RPC, DIRECT to TB
                                                                                (NOT {prop}Desired — see §3)
```

**On-site gateway dependency is real — only Tuya is truly direct (Sam/Spencer validation round, 2026-09-25).** The earlier "no site gateway / everything direct-to-cloud" framing is now corrected. Authoritatively:
- **The LoRaWAN Dragino gateway (`-lwgateway`) is a pass-through** for the site's LoRaWAN devices — dishwasher, glasswasher, fryers, cellars, fridge/freezers, and the heating & hot-water monitoring devices all route THROUGH it. If it is down, those LoRaWAN uplinks stop.
- **The R10A is the Modbus metering gateway** — on-site meters push their readings to the R10A (they do not reach the cloud independently), **and AC control also routes through the R10A** (Sam's position — in tension with SD-195, see §7 Q7).
- **Tuya is the only truly direct class** — Tuya control hardware talks straight to the Tuya cloud with no on-site gateway hop.
- **PowerPause devices are independent** (no shared-gateway dependency).
- **Dual representation is the norm, not the exception:** a single appliance often has BOTH a LoRaWAN monitoring device AND a Tuya control switch (the warewash pattern, §3.2 M7) — the monitoring half depends on the LoRaWAN gateway while the control half is direct Tuya. Read each half against its own path.

**Command is a single plane, TB-first (SD-575).** The operator (via the OOH dashboard, acting with staff TB identity) writes a `{prop}Desired` shared attribute on the TB device and "stops caring". The bridge, subscribed to TB's shared-attribute changes over the tenant WebSocket, dispatches to the owning vendor adapter, which commands the vendor cloud, confirm-reads, and writes back `{prop}Reported` + `{prop}SyncStatus` (research-sd-core §2). **The bridge is never a command front door** — do not add a write endpoint to the bridge's read API (SD-575). Boiler is the exception: it is TB-native and commanded directly, but on a **non-standard contract** (§3, §4).

### 2.2 The three senses of "gateway" — keep them distinct

The word "gateway" appears in three unrelated meanings across the estate. Conflating them is the root of the "gateway offline → is the device dead?" confusion (research-sd-vendor headline; MEMORY: `ooh-gateway-naming-estate-verified`).

| Sense | What it physically/logically is | Which classes route THROUGH it (as data) | TB signal |
|---|---|---|---|
| **A — Comms / 4G uplink** | BLIIOT **R10A** 4G router: the site's internet uplink + WiFi AP ("Lighthouse2"). Every IP device needs it *for connectivity*, but vendor data does **not** flow through it as data — it is not a data-plane hop (research-sd-vendor §A, SD-514) | Nothing routes through it *as data*. Every IP device depends on it for raw internet, invisibly | `remoteItProfile` device `remoteItActive`; and the `R10A Modbus Gateway` profile device `active` |
| **B — Protocol / data coordinator** | Aggregates a local protocol onto IP: **R10A Modbus metering gateway** (profile "R10A Modbus Gateway", SD-541 §6) and **LoRaWAN Dragino gateway** (`-lwgateway` / "Lighthouse gateway", SD-541 §10) | **Authoritative (Sam/Spencer validation round, 2026-09-25):** the LoRaWAN Dragino gateway is a pass-through for **dishwasher, glasswasher, fryers, cellars, fridge/freezers, and heating & hot-water devices**; the R10A Modbus gateway carries **on-site meters** (which push to it, not to the cloud) **and AC control** (Sam's position — conflicts with SD-195, §7 Q7). These classes genuinely depend on an on-site gateway | `R10A Modbus Gateway` REG##### refresh; `ttsProfile` uplink/downlink counters |
| **C — TB logical "gateway device"** | A software construct inside TB. Tuya Pulsar fan-in creates sub-devices "under a Tuya gateway device"; the bridge uses a TB-Gateway MQTT connection (`v1/gateway/connect` = the "claim"). **Not a physical box** (research-sd-vendor §C, research-sd-core §1) | Tuya telemetry (logically); any bridge-carried device (logically) | `gatewayDevice` profile (306); `v1/gateway/connect` claim |

**The load-bearing consequence** (proven empirically, research-tb-sweep §4): a device's reachability must **not** be inferred from a gateway device's `active` flag.
- Salus `-gateway` — now confirmed to be the Salus **receiver** (it wires into the boiler and actuates it; NOT a comms coordinator — Sam/Spencer validation round, 2026-09-25) — reads `active=False` on 6261 & 6267 while the child thermostat is LIVE and fresh, because it emits telemetry only on version change, so its `active` goes stale. **Do not gate child READ reachability on the Salus receiver.** (Note the actuation nuance: on/off actuation of the boiler *does* depend on the receiver, but the thermostat's **schedules are stored locally in the thermostat** and do not — §3.1 C2/C3, §7 Q1.)
- Both R10A `-r10a` devices on 6261 are offline (MAJOR alarm) while every Tuya appliance is active and reporting — because Tuya reads traverse Tuya cloud (path 2), not the on-site R10A. **R10A offline degrades on-site/SSH control dispatch, not cloud read telemetry.**

---

## 3. The device-class model (the heart)

One record per class. Duplicate profiles are merged and flagged. **Legend for "Control status TODAY":** 🟢 live = write path believed working in prod · 🟡 dormant = adapter exists but not switched on / no-op in prod · ⚪ monitor-only = no control by design · 🔵 native-nonstandard = controllable but off the standard contract.

> Read the table together with §4 (what the read/control signals *mean*) and §7 (which rows are still unproven). Where a control claim is unverified, it says so in the row and carries an OOHDASH validation reference.

### 3.1 Controllable classes

| # | TB profile(s) — merged dups | Plain-English type | Naming token(s) | Vendor / integration | Comms path & gateway-sense | Read-reachability signal | Control-reachability signal | Control surface + safe actions | Control status TODAY | Welfare domain |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | `tuya Profile` (**3,089; 2,719 active** — SD-446 companion §2, corrects the 3103 sweep figure) | Tuya smart switch / relay (kitchen equip, lighting, fans, over-door heaters) | `fryer`,`grill`,`combioven`,`merrychef`,`bainmarie`,`heatedgantry`,`externallighting`,`extractfan`,`barfans`,`overdoorheater`, etc. | Tuya (Tongou / OWON) cloud | Path 2 (TB-native Pulsar). Sense C only (logical). Needs Sense A (R10A) for site internet but NOT as data hop | `active`; telemetry `bizCode`=online/offline; `device_status`; `signalStrength`; fresh `switch_1`/power (research-tb-sweep §3) | `switchDesired` → `switchReported` + `switchSyncStatus`. NB Tuya `switchReported`/`switchSyncStatus` are **written but currently unread estate-wide** — OOH would be the first reader (research-sd-core §5.7) | `switchDesired: true/false`. Normalise on-state: `switchReported` → `switchOn` → `switch_1` (cross-vendor variance, OOH_TB_DIRECT_DESIGN §4b) | 🟡 **dormant — NO-OP in prod today.** Prod image predates the Tuya fix; bridge carries 0 Tuya (research-sd-core §5.4, §6). Do NOT present as controllable until SD-545/rebuild. NB **read/telemetry is native & correct** via the Tuya PE integration (3,089 devices, SD-446 companion §2, §6) — it is only *command* that is dormant | Kitchen / lighting / ventilation |
| C2 | `salusDevice` (thermostat share of 1181) | Salus **IT700** thermostat (heat-only, e.g. Flaming Grill CH1) | `salusit700` | Salus IT700 via **AWS IoT** (Device Shadow) → bridge | Path 1 (bridge). On-site **receiver** (`-gateway`, §3.3 G4) wires to the boiler and actuates it — usually simple on/off; the thermostat sends its instructions to the receiver. **Schedules are stored LOCALLY in the thermostat** (Sam/Spencer validation round, 2026-09-25). Consequence: on/off actuation depends on the receiver, but schedules do not | `isOnline`=true, `connectivity`=LIVE, fresh `localTemperature`, `lastMessageRSSI` | **`setpointSyncStatus`** (`synced` vs `pending`/`failed`); chain `setpointDesired`→`heatingSetpoint`→`setpointReported` | `setpointDesired`(°C), `modeDesired`(heat only). Boost = single setpoint write | 🟢 live (SD-446 🟢228) — but see 6261 `pending` anomaly (control-confirmation under bench verification, §7 Q8) | Heating |
| C3 | `salusDevice` + IT500 profiles (`lighthouse-thermostat-heating`, hot-water) | Salus **IT500** thermostat (Farmhouse; CH1/CH2 + HW) | `salusit700` token observed; IT500 keyed separately — see note | Salus IT500 via **Arrayent** cloud (60s poll) → bridge | Path 1 (bridge). On-site **receiver** (`-gateway`, §3.3 G4) wires to the boiler and actuates it (on/off); the thermostat sends instructions to the receiver. **Schedules stored LOCALLY in the thermostat** (Sam/Spencer validation round, 2026-09-25). On/off actuation depends on the receiver; schedules do not | `isOnline`/`connectivity`; fresh `localTemperature`/`currentRoomTemp`. FLAG: CH2 can read HW-cylinder sensor >50°C — anomaly, not room temp (research-sd-vendor §Salus IT500) | `setpointSyncStatus`; plus HW boost `hwBoostHoursDesired`→`hwBoostReported`+`hwBoostSyncStatus` | `setpointDesired`, `modeDesired`, `hwBoostHoursDesired`(0–9h). 1 IT500 → up to 3 TB devices (CH1/CH2/HW) | 🟢 live (SD-446 🟢373) | Heating + hot water |
| C4 | `airConditioningProfile` (246); TB type **ACCLOUD** | Intesis-bridged A/C (LG VRF) | `ac`, `accloud` | Intesis via **AC Cloud** REST v2 (OAuth2, 15-min poll) → bridge | **CONFLICT (§7 Q7, LOW priority):** SD-195 says each unit connects **direct to AC Cloud** via its own Intesis WiFi adapter (Sense B per-unit); **Sam says AC control routes via the R10A Modbus gateway** (Sam/Spencer validation round, 2026-09-25). Unresolved — flagged for Spencer under OOHDASH-98 | `active`; telemetry `OnOff`,`Mode`,`Setpoint`,`FanSpeed`,`Temperature`,`AlarmStatus`,`ErrorCode` | `setpointDesired`/`modeDesired`(mode Intesis-only). **NO `*SyncStatus` key observed on the one AC probed** — confirmation is telemetry echo only (research-tb-sweep §3, §gaps a). This is an **indeterminate-by-default** class until an ack signal is confirmed | `setpointDesired`(16–30, step 0.5), `modeDesired`. OnOff/FanSpeed control **UNVERIFIED** — flagged OOHDASH-98 | 🟢 live per SD-446 (🟢11) **but controllability of OnOff/FanSpeed + ack signal + comms path FLAGGED (OOHDASH-98, LOW priority — low-penetration product, ~11 live Intesis units estate-wide)** | Cooling / comfort |
| C5 | `boilerControl` (222) **[distinct class — Q6 resolved; NOT the same as `boiler-control`, which is M13]** | Boiler control **panel** (controllable, TB-native) | `boilercontrol` | None — **direct MQTTS to TB**, no vendor cloud, no bridge hop | Boiler direct-to-TB. No on-site coordinator. Has its own on-board Remote.IT (`remoteItActive`) | `active`; `connected`; telemetry `boiler.*`,`CHZ1/2.*`,`DHW.*`,`recirc_pump.*`; `outsideTemp` (100+ keys) | State echoes on `*.override`,`*.output_state`,`boiler.enable_output_state` — **NO explicit SyncStatus** (research-tb-sweep §3). ≥2 firmware schemas in field (named-zone vs indexed-output) | Zone override / setpoint / summer-mode via **bare keys + `override` RPC** — NOT the `{prop}Desired` family. **Cross-class heating dependency (Sam/Spencer validation round, 2026-09-25):** on single-boiler sites shared with accommodation (an accommodation zone valve splits the plumbing; both a Salus receiver and this boiler panel are fitted and controlled independently), **if this boiler panel is not enabled, a downstream Salus (C2/C3) calling for heat for the accommodation cannot circulate/pull heat** | 🔵 native-nonstandard; migration LH-INT-BOILER-001 pending (now owned by **Jonathan/Rikki**, §7 Q5). **OOH v1 = monitor + heating-scenario/override only**; full control deferred | Heating |

**C5 vs the hyphen profile — RESOLVED (Sam/Spencer validation round, 2026-09-25; Q6 closed):** they are **TWO SEPARATE CLASSES, not twins**. The earlier "duplicate / format-variant twin" framing (from research-tb-sweep §1 and the SD-446 companion §5.1) is now **withdrawn** — the repo data dictionary (OOH_DEVICE_DATA_DICTIONARY §2 boiler note) was correct all along:
- **`boilerControl` (camelCase, 222) = the boiler control panel** — controllable, TB-native. This is C5.
- **`boiler-control` (hyphen, 315) = Watteco room-temperature sensors** — **monitor-only, LoRaWAN**. This is a distinct monitor-only class, catalogued as **M13** in §3.2. It carries the LoRaWAN sensor keys the repo dict described, NOT boiler-control keys.

**Do NOT merge these profiles and do NOT key one onto the other.** Classify strictly on the exact profile string: camelCase `boilerControl` → controllable panel (C5); hyphen `boiler-control` → Watteco room-temp sensor (M13, monitor-only). A device on the wrong class gets the wrong capability model, which for the hyphen profile would falsely expose a room-temp sensor as a controllable boiler panel.

### 3.2 Monitor-only classes (no control by design)

| # | TB profile(s) — merged dups | Plain-English type | Naming token(s) | Vendor / path | Gateway-sense in path | Read-reachability signal | Welfare / triage use |
|---|---|---|---|---|---|---|---|
| M1 | `AMR_profile` (576) | Automated meter reads (Elec / Gas) — **an external-API data source, NOT a physical on-site device** (Sam/Spencer validation round, 2026-09-25) | `ElecAMR`,`GasAMR` | **External API (UK utility services)** — a ThingsBoard profile populated by an API that pulls utility-provider meter readings. There is no on-site device and no site-comms path | **None — no site-comms path.** The model and triage must NEVER treat AMR as a reachable on-site device | `consumption_wh`/`consumption_kwh` freshness (30-min/daily). **Inactive/quiet is NORMAL and HEALTHY** — `active=False` is expected; never render as broken or "site down" | Metering + **site header metadata** (SERVER_SCOPE `siteNo`/`siteName`/`Brand`/`Utility`; read `siteName` from Elec AMR — Gas AMR often `#REF!`) |
| M2 | `fridge and freezer profile` (649); `fridgeSimpleTempMonitoringProfile` (14) | Fridge / freezer temp + door | `fridge`,`freezer`,`chiller` | LoRaWAN | **Sense B (LoRaWAN Dragino pass-through)** — Sam/Spencer validation round, 2026-09-25 | `air_temp`,`evaporator_temp`,`doorStatus`,`rssi`,`batteryVoltage`; `active` | Cold-chain / food-safety alarms |
| M3 | `cellar profile` (201) | Cellar cooling temp + door (dual-door) | `cellar`,`cellar-1door` | LoRaWAN monitoring; **may carry a Tuya switch (direct)** | **Sense B (LoRaWAN Dragino)** for the monitoring half; the Tuya switch half (if present) is **direct to Tuya cloud, no gateway** (Sam/Spencer validation round, 2026-09-25) | `air_temp`,`evaporator_temp`,`line_temp`,`doorStatus`(×2). Can have `deviceAlarmsDisabled=True` | Cellar cooling. NB per-device controllability: a cellar device carrying a Tuya `switch_1` is controllable *as Tuya* (§4.4) — but see CTO directive (MEMORY: `ooh-cellar-switch-remove-directive`) |
| M4 | `door profile` (213) | Door contact sensor | `-1door` suffix; door tokens | LoRaWAN / bridge | Sense B (LoRaWAN) likely | `doorStatus`,`TempC1-3`,`Digital_IStatus` | Security / cold-chain context |
| M5 | `unoxDevice` (**107; live telemetry today** — SD-446 companion §2–3) | Unox combi oven (event-based) | serial `Z#######` (e.g. `gk-6466-Z0128184-1`); **9 of 107 are non-conforming hand-made names** (leading/trailing spaces, shared labels — clean before automated binding, SD-446 companion §3, §5) | **Legacy TB DataLoaderRuleNode + scheduler event — NOT the bridge, NOT a PE integration** (SD-446 companion §3). Absorption via the SD-471 Salus playbook, not a new build | None (cloud legacy) | Event telemetry (`cooking_*`,`washing_*`,`open_door`) freshness. **`active=False` on ALL 107 is NORMAL** — the loader writes attrs+telemetry without a device connect, so TB activity tracking never fired; read freshness from telemetry `ts`, never `active` (SD-446 companion §3, §5) | Kitchen equipment status. NB two vendor account groups present — `group_id` 39388 (2025-04 trial) + 48983 (GK rollout) — which is why "0 accounts" in the bridge config misled |
| M6 | `ovenMonitoringProfile` (**285; 247 active** — this is the COMBINED total across the `ovenMonitoringProfile`/`ovenMonitoringprofile` case-twins; the split is unverified — SD-446 companion §4, §5.1) | Combi / convection oven — **LoRaWAN sensor monitoring only** (no cloud cycle data) | `combioven`,`convectionoven`,`presteamer`,`cookandhold` | LoRaWAN — **disjoint from the Unox cloud pipeline** (SD-446 companion §4) | Sense B (LoRaWAN) | `consumptionWater`,`filterUsageLiquidLeft`,`waterFlowValue`,`totalPulse`; attrs `isDetergentPresent`,`isRinseAidPresent`,`filterCapacity` (SD-446 companion §4) | Kitchen equipment status. NB **two parallel oven pipelines exist** — Unox cloud (M5, 107) and this LoRa set (285) — and **nothing joins them** |
| M7 | `warewashMonitoringProfile` (**497; 419 active**, telemetry today — SD-446 companion §4) | Dishwasher / glasswasher — **NOT machine-cycle monitoring**: each is a **LoRaWAN water sensor + a 3-phase Tuya energy meter bolted to the machine** (no programme, no tank/boiler temp, no dosing confirmation — SD-446 companion §4) | `dishwasher`,`glasswasher` | **LoRaWAN (`TTIWareWashMonitoring`) + Tuya Integration** (SD-446 companion §4) | Sense B (LoRa) + Sense C (Tuya) | LoRa: `consumptionWater`,`waterFlowValue`,`totalPulse`,`rssi`,`batteryVoltage`, attr `dev_eui`. Tuya: `switch_1`,`relay_status`,`voltage_*`,`current_*`,`active_power_*`,`forward_energy_*`. Asset attrs `assetMake`/`assetModel`/`assetSerialNumber` | Kitchen equipment; controllable *as Tuya* only where `switch_1`/`switchDesired` present (§4.4). NB Winterhalter/Classeq "Connected Wash" is **additive** (the per-cycle record these 497 sensors cannot produce), not a duplicate of them (SD-446 companion §4, §6) |
| M8 | `roof profile` (665) | Rooftop / HVAC plant monitor (minimal LoRa) | `roof` | LoRaWAN/TTI (path 4) | Sense B (LoRaWAN) | `rssi`,`batteryVoltage` (minimal) | Rarely triage-relevant |
| M9 | `ambientTempMonitoringProfile` (104) | Kitchen ambient temp/humidity | `kitchen-temp` | Bridge / LoRaWAN | Varies | `temperature`,`humidity`,`ambtemperature` | Comfort / context |
| M10 | `meterOnlyProfile` (2176) | CT-clamp power meter (monitoring) | various circuit tokens | Bridge / TB-native | Varies | Power telemetry freshness; `active` | Electrical load context (largest monitoring class) |
| M11 | `gasValveMonitoringProfile` (15) | Gas valve / solenoid monitor | gas valve tokens | Bridge / LoRaWAN | Varies | `pinStauts`[sic], `valveTotalPulse`, `totalPulse` | **Safety context** (surface prominently) |
| M12 | `fryerMonitoringProfile` (486); `heatingHotWaterMonitoringProfile` (155) | Fryer monitor / HHW monitor | `fryer`,`pastacooker`; `hhw` | LoRaWAN | **Sense B (LoRaWAN Dragino pass-through)** — fryers and heating & hot-water devices route through the LoRaWAN gateway (Sam/Spencer validation round, 2026-09-25) | Fryer: `Electrical_Power`,`applianceOn`,`input1/2`. HHW: `boilerFlowTemperature`,`boilerReturnTemperature`,`hotWaterTemperature` | Kitchen / heating context |
| M13 | `boiler-control` (hyphen, 315) — **a DISTINCT class, NOT a twin of C5 `boilerControl`** (Sam/Spencer validation round, 2026-09-25; Q6 resolved) | **Watteco room-temperature sensors** — monitor-only | `boiler-control` (hyphen) | LoRaWAN (Watteco) | **Sense B (LoRaWAN)** | LoRaWAN sensor keys (`rssi`/`temperature`/`battery`/`snr`/`fCnt` per the repo data dictionary) — **NOT boiler-panel control keys** | Room-temperature context. **Classify strictly on the exact profile string** — a hyphen `boiler-control` device must NEVER be treated as a controllable boiler panel |

### 3.3 Gateway / infrastructure classes

| # | TB profile(s) | Plain-English type | Naming token(s) | Gateway sense | Read-reachability signal | Role in control path |
|---|---|---|---|---|---|---|
| G1 | `remoteItProfile` (317) | R10A comms gateway liveness (via remote.it enricher) | `kitchen-r10a`,`maindb-r10a`,`ac-r10a`,`cellar-r10a`,`carvery-r10a` (zone-prefixed, NO numeric index) | **A** (comms/4G uplink) — enriched by remote.it | `remoteItActive`; `remoteItTimeOnlineTs`; `active`; alarm "Remote.IT \| Gateway Offline" | IS the SSH/on-site control-dispatch access path. Offline = on-site control impaired, NOT reads down. **Trust `active`+alarm over stale `remoteItActive` last-value** (research-tb-sweep §3, §4.3) |
| G2 | `R10A Modbus Gateway` (461) | R10A acting as Modbus-RTU protocol coordinator | `-r10a` (SAME token as G1 — **key on PROFILE not name**) | **B** (protocol coordinator) | `active`; `lastConnectTime`/`lastDisconnectTime`; `REG#####` refresh; `remoteItActive` | Modbus register writes = control transport for Modbus-wired AC/metering. `gk-birchwoodfarm-kitchen-r10a` active=True |
| G3 | `ttsProfile` (98) | LoRaWAN / The Things Stack gateway | `lwgateway` | **B** (LoRaWAN coordinator) | `ttsUplinkCount`/`ttsDownlinkCount`/`ttsTxAcknowledgmentCount`; `active` | LoRaWAN transport for roof/door/some meters. Often stale `active` (birchwoodfarm lwgateway False since Jul) |
| G4 | `salusDevice` (`-gateway` share of 1181) | **Salus RECEIVER** — wires into the boiler and actuates it (usually simple on/off); the thermostat sends its instructions to this receiver (same profile as the thermostat) | `salusit700-gateway` | **Not a comms "gateway" — it is the boiler receiver** (Q1 resolved, Sam/Spencer validation round, 2026-09-25) | `wiFiConnected`=1, `cloudStatus`=1, `wiFiRSSI`. **`active` UNRELIABLE** (stale by design) | On/off actuation of the boiler **depends on this receiver**; the thermostat's **schedules do NOT** (stored locally in the thermostat). Still **do NOT gate child thermostat READ reachability on this device's `active`.** |
| G5 | `gatewayDevice` (306); `R10A_Gateway` (0) | Generic / logical TB gateway device (Sense C container) | — | **C** (TB logical) | `active` | Bridge/Tuya logical fan-in container; not a physical hop |

**Duplicate/variant profiles to merge or you will double-count** (research-tb-sweep §1; SD-446 companion §5.1): **`boilerControl` vs `boiler-control` are NOT twins — do NOT merge them** (Sam/Spencer validation round, 2026-09-25; Q6 resolved). They are two distinct classes: camelCase `boilerControl` (222) = the controllable boiler panel (C5); hyphen `boiler-control` (315) = Watteco room-temperature sensors, monitor-only (M13). Classify strictly on the exact profile string. `R10A Modbus Gateway` vs `remoteItProfile` vs `R10A_Gateway`(0) — **these are distinct roles of the same box, key on profile**; `ovenMonitoringProfile` vs `ovenMonitoringprofile` — **NOT (0): the 285 oven count is the COMBINED total across both twins and the split is unverified** (SD-446 companion §4, §5.1); empty dup meters (`EnergyMeter`/`energy-meter`/`water-meter`/`Water Meter`).

---

## 4. Reachability & delivery semantics

This section is the reason the model exists. It fixes the OOHDASH-102 false-success bug by forbidding "no bad news" from ever rendering as success.

### 4.1 Read-reachability ≠ control-reachability

They diverge routinely. A device can be perfectly readable while being uncontrollable — and (rarely) the reverse.

**Read-reachable** = the device exists in TB with telemetry via **any** of the five ingest paths, and its liveness is fresh. Signal: SERVER_SCOPE `active` + `lastActivityTime` (research-sd-core §2). The repo's liveness bands — **LIVE < 3h, QUIET 3–12h, OFFLINE > 12h** — are a *repo convention*, not an SD-446 rule (research-sd-core §5.6). The one SD-446 freshness rule is IT500 `DeadDeviceFloorDays=30`.

> **Trap:** `active` is misleading for infrequent reporters. AMR (M1), Unox (M5), and every gateway class (G1–G5) legitimately read `active=False` while perfectly healthy. For these, judge freshness on the domain payload (`consumption_wh`, event telemetry, uplink counters), not on `active`. Render stale as "no recent data", never "broken".

**Control-reachable** requires ALL THREE (research-sd-core §2), and is derived **per device from capability, not from the profile name** (research-sd-core §4, OOH_DEVICE_DATA_DICTIONARY §4):
1. An adapter capability interface (`IThermostatCommands` / `IHotWaterCommands` / `ISwitchCommands`) **or** TB-native firmware (boiler).
2. The device is claimed/bound (`v1/gateway/connect`) so TB routes the write, with **DeviceId = the EXACT prod TB device name**. A wrong/typo'd binding resolves to nothing and the device is **silently skipped** ("the symptom of a bad binding is silence").
3. A live vendor account.

The positive signal that a device is control-reachable is empirical: writing `{prop}Desired` produces `{prop}SyncStatus` advancing to `synced`. Read-only devices have no Desired/Reported/SyncStatus family at all.

### 4.2 The THREE delivery outcomes (never two)

When a control write is attempted, there are **three** possible outcomes. Modelling only "worked / failed" is exactly the OOHDASH-102 bug.

| Outcome | Signal | What the operator must be told |
|---|---|---|
| **CONFIRMED** | `{prop}SyncStatus = synced` — device echo matches request within SLA (~2–4s) | "Delivered and confirmed." This is the ONLY positive signal. |
| **EXPLICIT NON-DELIVERY** | `{prop}SyncStatus = failed` (vendor rejected the write) **or** `= rejected` (capability/validation rejected *before* any write — e.g. mode on a heat-only unit, unparseable value) | "Not delivered — [rejected/failed]." Honest, actionable. |
| **INDETERMINATE** | Any of: no `SyncStatus` key at all; `pending` that never advances; no reader consumes the reported key; a bad binding silently skips the device | "**Sent, but NOT confirmed.** We cannot verify this reached the device." **MUST NOT render as success.** |

**Central rule (OOHDASH-102 fix):** `synced` requires an actual echo. **The absence of a bad status is NOT success.** Silence, a missing reader, a stuck `pending`, and a silent skip are all **indeterminate** — a distinct, first-class state that the UI must show as unverified, not green.

**Confirmation UX — asynchronous, non-blocking (Spencer, Sam/Spencer validation round, 2026-09-25 — §7 Q8):** the `pending`→`synced`/`failed` transition can take time, so confirmation must be handled as an **asynchronous background task that surfaces (pops up) when the confirmation is read** — the operator must **not** be made to wait on a blocking spinner. The write is acknowledged as "sent" immediately, the operator moves on, and the confirmed/failed outcome is delivered when it arrives.

Estate command-outcome keys already in use — **adopt these, do not invent `lastCommand*`** (research-sd-core §2, §5): `commandStatus` / `commandError` / `commandAtUtc`.

### 4.3 Which classes fall into indeterminate by default (today)

- **C1 Tuya** — `switchReported`/`switchSyncStatus` are written but **no reader consumes them estate-wide**; OOH would be the first. Combined with the prod no-op (§3, research-sd-core §5.4), Tuya control is **indeterminate/dormant today** and must not present as controllable until SD-545/rebuild.
- **C4 Intesis** — **no `*SyncStatus` observed**; confirmation is telemetry echo only. Until an ack signal is confirmed (OOHDASH-98), every Intesis write is indeterminate.
- **C5 Boiler** — state echoes but **no explicit SyncStatus**; non-standard contract. Indeterminate for confirmation purposes until LH-INT-BOILER-001.
- **C2/C3 Salus** — the healthiest case: `setpointSyncStatus` is a real ack. **But** IT700 sync is best-effort — a slow echo can read `pending` although the write applied (cosmetically indeterminate). Site 6261's `salusit700-1` shows `setpointSyncStatus=pending` (desired 19 / reported 21.5) right now → read-OK, control-NOT-confirmed (research-tb-sweep §3). This is the exact worked case for the indeterminate state. **Cross-cutting risk under bench verification (Sam/Spencer validation round, 2026-09-25 — §7 Q4/Q8):** the stuck `pending` may be a **command-formation problem** — we may not be sending the correct command, and/or not reading the correct confirming telemetry — **not only** an offline-gateway/receiver problem. Confirm on the bench which of these it is before relying on the `pending`→`synced` transition.

### 4.4 Capability-over-profile (control derives from hardware, not label)

A device under a *monitoring* profile can carry controllable Tuya hardware — `warewashMonitoringProfile` dishwashers and `cellar profile` devices sometimes expose `switch_1` + `switchDesired` (OOH_DEVICE_DATA_DICTIONARY §2, research-sd-core §4). Controllability is therefore derived per device from the presence of a bridge-supported capability (`switch_*`, thermostat, boiler), **never** from the profile name. Whether OOH *exposes* control for such incidental switches is a product decision (§7-adjacent; OOH_DEVICE_DATA_DICTIONARY §5 Q3) — and note the CTO directive to remove Cellar switch control (MEMORY: `ooh-cellar-switch-remove-directive`).

### 4.5 Exact attribute keys per class (control families)

| Class | Desired (write, SHARED_SCOPE) | Reported | SyncStatus / ack | Notes |
|---|---|---|---|---|
| C1 Tuya | `switchDesired` (bool) | `switchReported` → `switchOn` → `switch_1` | `switchSyncStatus` | ack unread today; prod no-op |
| C2/C3 Salus | `setpointDesired`(°C), `modeDesired`, `hwBoostHoursDesired`(int) | `setpointReported`, `modeReported`, `hwBoostReported` | `setpointSyncStatus`, `modeSyncStatus`, `hwBoostSyncStatus` | real ack; IT700 echo can lag |
| C4 Intesis | `setpointDesired`, `modeDesired` (+ `onOffDesired`/`fanSpeedDesired`? UNVERIFIED) | echo via `OnOff`/`Mode`/`Setpoint`/`FanSpeed` telemetry | **none observed** | indeterminate until OOHDASH-98 |
| C5 Boiler | bare keys + `override` RPC (e.g. `*.override`, `boiler.enable_output_state`) | `*.output_state` echo | **none** | non-standard; ≥2 schemas |
| `scheduleDesired` (all) | `scheduleDesired` (planned SD-477) | — | — | **unwired for EVERY vendor** — do not offer schedule control |

---

## 5. Per-site resolution method

Given a live TB read of a site, produce: (a) the classes present, (b) per-device read + control reachability, (c) the allowed triage actions. The model is referenced, never enumerated per site.

### 5.1 Algorithm

1. **Query** `GET /api/tenant/devices?pageSize=200&page=0&textSearch=gk-{site}&sortProperty=name` (auth `Authorization: ApiKey <key>` for investigation, or the read service-account JWT for runtime — OOH_TB_DIRECT_DESIGN §3). The `gk-{site}-*` **name prefix** is the authoritative site key; the "Greene King" customer grouping is inconsistent and must not be the primary key (OOH_TB_DIRECT_DESIGN §1a).
2. **Parse the name** `{brand}-{site}-{assetType}-{n}` — **case-insensitive**, **trim leading whitespace**, `{site}` may be alphanumeric slug, `{n}` may be alphanumeric (§6).
3. **Classify by `(TB profile × assetType token)`** onto a class C1–C5 / M1–M12 / G1–G5. **Key on profile first** (two `-r10a` devices are different classes by profile alone — G1 vs G2).
4. **Read-reachability per device:** compute liveness from the class's read signal (§3), applying the "infrequent reporter" caveat (§4.1). For gateway/AMR/Unox, judge on domain payload, not `active`.
5. **Control-reachability per device:** start from the class's control status (§3.1). Then **verify the three conditions per device** (§4.1): capability present, bound with exact-name DeviceId, live account. Downgrade to indeterminate/none if any is missing. Apply the prod-reality overrides: Tuya = dormant no-op; Intesis = no-ack; boiler = monitor-only v1.
6. **Allowed triage actions:** intersect (control-reachable) × (safe action set for the class, §3.1) × (product policy — e.g. no schedule control, capability-switch policy §4.4).
7. **Site header metadata:** read SERVER_SCOPE `siteName`/`Brand`/`siteNo` from the **Elec** AMR (Gas AMR often `#REF!`); fall back to Zendesk `resolveSiteName`. Mark `nameUnverified` when derived.

### 5.2 Worked example — site 6261 (Wheatstone Inn)

Live read returns **23 devices, 18 active** (OOH_TB_DIRECT_DESIGN §1a; reachability facts from research-tb-sweep §3–4).

| Device (name) | Class | Read-reachability | Control-reachability | Allowed action |
|---|---|---|---|---|
| `gk-6261-salusit700-1` | C2 (Salus IT700 thermostat) | LIVE — `active=True`, `connectivity`=LIVE, fresh temp | **Control-reachable but currently INDETERMINATE** — `setpointSyncStatus=pending` (desired 19 / reported 21.5) | Offer setpoint/mode; surface last write as "sent, not yet confirmed" — **not** success |
| `gk-6261-salusit700-gateway-1` | G4 (Salus **receiver** — wires to boiler, actuates on/off) | `active=False` — **ignore for READ, expected** (stale by design); infer health from child, `wiFiConnected`/`cloudStatus` | Actuation (on/off) depends on it; schedules are thermostat-local so do not | Monitor only in v1; do NOT gate the thermostat's READ on this. If actuation fails, the receiver is a suspect — but schedules run regardless |
| `gk-6261-boilercontrol-1` | C5 (boiler, TB-native) | LIVE — `active=True`, fresh, 100+ keys | Native-nonstandard; **v1 = monitor only** | Surface zone states / outside temp / alarms; no active control in v1 |
| `gk-6261-fryer-1` (+ other Tuya appliances) | C1 (Tuya switch) | LIVE — `active=True`, online, reporting power | **Dormant — control is a NO-OP in prod today** | Read on/off + power; **do NOT present a working switch** until rebuild |
| `gk-6261-ElecAMR-1`, `gk-6261-GasAMR-1` | M1 (AMR — **external-API data source, not an on-site device**) | `active=False` is **normal and healthy** (external API, no on-site comms path); consumption freshness is the only signal | none (monitor-only; nothing on-site to reach) | Read consumption; source site header from Elec AMR. Never treat as a reachable on-site device |
| `gk-6261-kitchen-r10a`, `gk-6261-maindb-r10a` | G1 (R10A comms, remote.it) | **Offline — `active=False` + MAJOR "Gateway Offline" alarm.** Ignore stale `remoteItActive=true` (Jul last-value) | n/a | Surface "on-site gateway offline" as *on-site/SSH control impairment context*, NOT as "site dead" — Tuya/Salus reads are unaffected |

**The 6261 story in one line:** the site is *readable* and healthy on the cloud paths, its on-site R10A gateways are offline (which does **not** knock out cloud reads), its one real thermostat write is **unconfirmed (pending)**, its Tuya switches **cannot actually be commanded in prod today**, and its Salus `-gateway` `active=False` is a red herring. A naive dashboard would show green switches, a "gateway down = site down" panic, and a "setpoint changed ✓" it never confirmed. This model produces the honest picture instead.

---

## 6. Naming convention spec

Base pattern: **`{brand}-{site}-{assetType}-{n}`** (e.g. `gk-6261-fryer-1`). The device **name is the key** (research-sd-core §4). Documented exceptions — a parser that ignores these will mis-resolve sites (research-tb-sweep §2, OOH_DEVICE_DATA_DICTIONARY §1):

| Element | Rule | Exceptions / examples |
|---|---|---|
| `{brand}` | case-insensitive | `gk` / `Gk` / `GK`; minor brands `md`(9), `gl`,`go`,`hi`,`mcd` |
| `{site}` | NOT always numeric | numeric `gk-6261-`; **name-slug** `gk-birchwoodfarm-`, `gk-manorfarm-`, `gk-twogreens-`, `gk-allertonhallfarm-`. A `\d+` parser MISSES slug sites |
| casing | match case-insensitively throughout | `GK-FHKWORSLEY-UNOX-2` |
| leading whitespace | **trim** | `" gk-merrygoround-combioven-2"` |
| `{assetType}` | usually a word token; can be a vendor serial | Unox by serial: `gk-6466-Z0128184-1` (`{assetType}` = `Z#######`) |
| `-gateway` suffix | Salus hub | `gk-{site}-salusit700-gateway-1` |
| `-r10a` / `-lwgateway` | drop the trailing index; r10a is **zone-prefixed**, not numbered | `kitchen-r10a`, `maindb-r10a`, `ac-r10a`, `cellar-r10a`, `carvery-r10a`; `lwgateway` |
| `{n}` index | can be **alphanumeric** | `-1a`, `-2a`, `-1door` (`gk-birchwoodfarm-cellar-1door`) |

**Observed assetType tokens → meaning** (research-tb-sweep §2): fryer/pastacooker; combioven/convectionoven/presteamer/cookandhold; merrychef; grill/chargrill/rfgrill; bainmarie/heatedgantry/hotcupboard/boilingtop/hlamps/hmat (hot-hold); dishwasher/glasswasher; fridge/freezer/chiller; cellar/cellar-1door; ac (air-con); salusit700 (thermostat); salusit700-gateway (Salus hub); boilercontrol; hhw; ElecAMR/GasAMR; extractfan/supplyfan/barfans/externallighting/overdoorheater; kitchen-r10a/maindb-r10a/ac-r10a/cellar-r10a/carvery-r10a (zone gateway); lwgateway (LoRaWAN); roof; kitchen-temp; Z####### (Unox by serial).

**Binding caution for control:** for a write to land, the control binding's DeviceId must **equal the exact prod TB device name** — wrong name → silently skipped (research-sd-core §2, §4). The June 2026 incident (458 duplicate prod devices fanned into dev TB via a misconfigured UAT bridge) is the cautionary tale. The SD-446 companion (§3, §5) adds live proof of the hazard on Unox: **9 of 107** Unox devices carry hand-made names that will not survive automated binding (`2`, `Cheftop`, `Tandem`, `Green king`, a trailing-space `Whitehorse-small unox `, and a **leading-space** `' gk-merrygoround-combioven-2'`), and **two devices share label `53178`** so a label-based lookup resolves to whichever is first. Clean these before pointing any adapter at prod.

---

## 7. Queries to validate (working position + open questions)

Per James's steer: state the **working position**, then list each open item. After the 2026-09-25 Sam/Spencer validation round, **Q1, Q2, Q3 and Q6 are RESOLVED** and their answers have been folded into the fact sections (§2, §3, §5); **Q4 and Q8 are now under bench verification**; **Q5 has moved to Jonathan/Rikki (James picking up directly)**; **Q7 remains tbc (low priority)**.

| # | Open question | Working position (this draft) | For whom |
|---|---|---|---|
| **Q1 — RESOLVED** (Sam/Spencer validation round, 2026-09-25) | **Salus `-gateway` identity.** Is that device a real coordinator, a proxy, or a stale record? Does control depend on it? | **RESOLVED:** it is the Salus **receiver** — it wires directly into the boiler; the thermostat sends its instructions to the receiver, which actuates the boiler (usually simple on/off). **Schedules are stored LOCALLY in the thermostat.** Consequence: on/off actuation depends on the receiver, but schedules (thermostat-local) do not. Do NOT gate child thermostat READ reachability on the receiver's `active`. Folded into §2.2, §3.1 C2/C3, §3.3 G4. | — (closed) |
| **Q2 — RESOLVED** (Sam/Spencer validation round, 2026-09-25) | **Estate gateway → class dependency.** Which classes genuinely route data through an on-site gateway vs only need the site uplink? | **RESOLVED (authoritative):** the **LoRaWAN Dragino gateway (`-lwgateway`)** is a pass-through for dishwasher, glasswasher, fryers, cellars, fridge/freezers and heating & hot-water devices; the **R10A is the Modbus metering gateway** — on-site meters push to it, and **AC control also routes through the R10A** (SD-195 conflict, see Q7); **Tuya is direct** to the Tuya cloud (no gateway); **PowerPause devices are independent.** Dual representation is normal — one appliance often has BOTH a LoRaWAN monitoring device AND a Tuya control switch (warewash). Only Tuya is direct; LoRaWAN devices, Modbus meters and AC depend on an on-site gateway. Folded into §2.1, §2.2, §3. | — (closed) |
| **Q3 — RESOLVED** (Sam/Spencer validation round, 2026-09-25) | **AMR / metering path.** Is AMR LoRaWAN, Modbus, or mixed? | **RESOLVED:** AMR is **NOT a physical on-site device.** It is a ThingsBoard profile populated by an API that pulls utility-provider meter readings (UK utility services). No site-comms path; nothing on-site to reach. Inactive/quiet is normal and healthy. The model and triage must never treat AMR as a reachable on-site device. Folded into §3.2 M1, §5.2. | — (closed) |
| **Q4 — UNDER BENCH VERIFICATION** (in progress, 2026-09-25) | **Tuya prod-enablement.** Adapter is built but not switched on; prod *command* is a no-op (SD-545 / rebuild pending). When does prod carry Tuya command? **Read side settled:** Tuya telemetry is native & correct via the Tuya PE integration (3,089 devices, 2,719 active — SD-446 companion §2, §6); only command is dormant. | Present Tuya as **read + on/off state, control DISABLED** until confirmed live. Do not ship a working switch on a no-op. **Cross-cutting risk (with Q8):** we may not be sending the correct command and/or not reading the confirming telemetry — bench-verify command formation, not just the enablement flag. | Bench / Spencer |
| **Q5** | **Boiler contract migration (LH-INT-BOILER-001).** When does boiler move from bare-keys + `override` RPC onto (or off) a standard contract? | Model boiler as its OWN class; **OOH v1 = monitor only**; revisit control post-migration. | **Jonathan / Rikki** (Spencer out of scope). **James is picking this up directly.** |
| **Q6 — RESOLVED** (Sam/Spencer validation round, 2026-09-25) | **The two boiler profiles.** Are `boilerControl`(222) vs `boiler-control`(315) distinct classes or duplicate twins? | **RESOLVED:** they are **TWO SEPARATE CLASSES, not twins.** `boilerControl` (camelCase, 222) = the boiler control panel (controllable, TB-native, C5); `boiler-control` (hyphen, 315) = **Watteco room-temperature sensors** (monitor-only, LoRaWAN, M13). The repo data dictionary was correct; the "twins/duplicate/format-variant" framing is **withdrawn — do NOT merge.** Added: the boiler-panel → Salus accommodation-heating cross-class dependency (§3.1 C5). R10A pair remains distinct *roles* of one box, key on profile. Folded into §3.1 C5, §3.2 M13, §3.3. | — (closed) |
| **Q7 (LOW priority)** | **Intesis control-ack + comms path.** No `*SyncStatus` observed; is there any ack beyond telemetry echo? Are OnOff/FanSpeed controllable? **New conflict to resolve:** Sam says AC control routes via the R10A (Modbus); SD-195 says each unit connects direct to AC Cloud. | Every Intesis write is **indeterminate** until an ack is confirmed. Resolve the R10A-vs-AC-Cloud conflict. **LOW priority — low-penetration product, ~11 live Intesis units estate-wide.** OnOff/FanSpeed controllability FLAGGED — not baked in. | **Spencer** (review as part of **OOHDASH-98**) — still **tbc** |
| **Q8 — UNDER BENCH VERIFICATION** (in progress, 2026-09-25) | **`setpointSyncStatus` value domain.** Only `pending` observed live; `synced`/`failed`/`rejected` inferred from SD-492, not seen. | Confirm the `synced` echo on a live/bench write before relying on it as the success gate. **UX steer (Spencer):** confirmation must be an **asynchronous background task that pops up when the confirmation is read — not a blocking wait** for the operator. **Cross-cutting risk (with Q4):** we may not be sending the correct command and/or not reading the confirming telemetry, so the 6261 stuck-`pending` may be **command-formation, not only** gateway/receiver offline. | Bench / Spencer |

**Companion doc incorporated (2026-09-25):** `SD-446-tb-device-audit-unfinished-vendors.md` (the estate-side SD-446 audit) has been folded in — it settled warewash (497/419), Unox (107, "absorb, don't build"), Tuya-native (3,089/2,719) and the unfinished-vendor edges (Winterhalter / Classeq / Rational / Fagor / AltoShaam all zero estate-wide). Its earlier "boiler twins" reading of Q6 has since been **superseded** by the 2026-09-25 Sam/Spencer validation round (Q6 RESOLVED — two distinct classes). See the inline "(SD-446 companion)" and "(Sam/Spencer validation round, 2026-09-25)" citations throughout §§1, 2, 3, 5, 7.

---

## 8. Machine-spec conversion note (appendix)

Each class record in §3 maps 1:1 onto a JSON/YAML schema entry the build can load directly. The dashboard would ship a `device-classes.json` keyed by an internal `classId`, and §5's resolver would map each live device onto one entry. One worked example — the Salus thermostat class (C2/C3):

```json
{
  "classId": "salus-thermostat",
  "displayName": "Salus thermostat (IT500 / IT700)",
  "welfareDomain": "heating",
  "tbProfiles": ["salusDevice", "lighthouse-thermostat-heating"],
  "assetTypeTokens": ["salusit700"],
  "vendor": "Salus (IT500=Arrayent, IT700=AWS IoT)",
  "ingestPath": "integration-bridge",
  "gatewayDependency": { "sense": "receiver", "coordinatorVerified": true, "note": "on-site Salus RECEIVER wires to boiler and actuates on/off (Q1 resolved 2026-09-25); schedules stored locally in thermostat, so schedules do not depend on the receiver" },
  "read": {
    "livenessSignal": ["active", "isOnline", "connectivity", "lastActivityTime"],
    "livenessBands": { "live": "<3h", "quiet": "3-12h", "offline": ">12h", "source": "repo-convention-not-SD446" },
    "telemetryKeys": ["localTemperature", "heatingSetpoint", "setPoint", "systemMode", "mode", "holdType", "runningState", "heatingActive", "lastMessageRSSI"]
  },
  "control": {
    "reachabilityConditions": ["adapterCapability:IThermostatCommands", "boundExactName", "liveVendorAccount"],
    "actions": [
      { "action": "setpoint", "desired": "setpointDesired", "unit": "degC", "reported": "setpointReported", "syncStatus": "setpointSyncStatus" },
      { "action": "mode", "desired": "modeDesired", "values": ["off","heat","cool","auto","fan"], "reported": "modeReported", "syncStatus": "modeSyncStatus", "note": "IT700 heat-only" },
      { "action": "hwBoost", "desired": "hwBoostHoursDesired", "range": [0,9], "reported": "hwBoostReported", "syncStatus": "hwBoostSyncStatus", "note": "IT500 only" }
    ],
    "deliveryModel": {
      "confirmed": "syncStatus == 'synced'",
      "explicitNonDelivery": ["syncStatus == 'failed'", "syncStatus == 'rejected'"],
      "indeterminate": ["no syncStatus key", "pending never advances", "no reader", "silent skip"],
      "rule": "indeterminate MUST NOT render as success"
    },
    "outcomeKeys": ["commandStatus", "commandError", "commandAtUtc"],
    "statusToday": "live",
    "caveats": ["IT700 sync best-effort — pending can be cosmetic", "6261 currently pending/unconfirmed"]
  },
  "confidence": "read=proven; control=SD-492-contract, live-echo-domain unconfirmed (Q8)"
}
```

The same shape applies to every class: `read` and `control` are separate objects (§4.1), `control.deliveryModel` carries the three-outcome rule (§4.2) on every controllable class, and `statusToday` carries the prod-reality override (`dormant` for Tuya, `native-nonstandard` for boiler). Monitor-only classes simply omit the `control` object — their absence of a Desired/Reported/SyncStatus family is the schema-level statement that they cannot be commanded.

---

*End of draft, updated 2026-09-25 with the Sam/Spencer validation round. Confidence summary: the **topology and comms picture is now largely confirmed** (Q1 Salus receiver, Q2 gateway dependencies, Q3 AMR-as-external-API, Q6 two distinct boiler classes all resolved); the **read plane is largely proven**; but **control-execution and confirmation remain under verification** — Tuya command is a prod no-op and under bench verification (Q4), the Salus `synced` echo is under bench verification (Q8, with a command-formation risk), Intesis has no observed ack and an unresolved comms-path conflict (Q7, low priority), and the boiler is non-standard with its migration now owned by Jonathan/Rikki (Q5). Sections 4 (delivery semantics) and 5 (resolution) remain the load-bearing behavioural additions. Validate the remaining open items in §7 before building against them.*
