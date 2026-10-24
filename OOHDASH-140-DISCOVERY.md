# OOHDASH-140 Discovery: Tuya device reading — estate sweep, API validation, flow impact

Date: 2026-10-23  
Session: READ-ONLY throughout. No writes, no control, no schedule changes.

---

## Problem statement

The OOH Triage Dashboard kitchen flow surfaces Tuya-controlled equipment (fryers, grills, glasswashers, etc.) but has no awareness of live device state or structured schedule data from the Tuya API. The current flow only shows:

- Whether any kitchen device is `online` (a boolean, sourced from TB fixture data)
- A static schedule string e.g. `"07:00-22:00"` (from ThingsBoard fixture, not from Tuya)

There is no per-circuit ON/OFF state, no structured schedule comparison, and no fault indication. When operators call to say "the fryer isn't on", the agent cannot say why — it cannot tell whether the circuit is off by schedule, off unexpectedly, faulted, or just offline.

This discovery covers six scope areas:
- SA1: What Tuya devices exist in the estate (sites, counts, naming, types)
- SA2: What live state data each device exposes via API
- SA3: How schedules are structured and encoded
- SA4: Where Tuya data does and doesn't surface in the current dashboard flows
- SA5: What the agent should say (DRAFT — requires James sign-off before gate)
- SA6: Recurring team issues that live data would help resolve

---

## SA1 — Estate device sweep

**Method:** Pulled site UIDs from `tuya-scheduler/src/data/sites.json` (229 GK site entries). Swept 23 sites via `GET /v1.0/users/{uid}/devices` against the Tuya EU OpenAPI (`openapi.tuyaeu.com`). Credentials from Azure Key Vault (`kv-airedale-prod`).

**Sites confirmed with Tuya devices (23/23 swept):**
gk-6832, gk-6833, gk-6834, gk-6835, gk-6836, gk-6840, gk-6841, gk-6842, gk-6843, gk-6845, gk-6847, gk-6849, gk-6750, gk-6749, gk-6751, gk-6852, gk-6854, gk-6855, gk-6856, gk-6851, gk-6759, gk-6770, gk-6863

All 23 swept sites returned devices. **342 total devices** across 23 sites (average ~15 per site). The `sites.json` file contains 229 entries, so the Tuya estate is potentially much larger than the 23-site sweep sample.

**Device categories (two types only):**

| Category code | Product name | Model | Product ID(s) | Role |
|---|---|---|---|---|
| `dlq` | Tongou TO-Q-SY1-JWT | — | `jdj6ccklup7btq3a` | Din Rail Wi-Fi switch + energy metering (single phase) |
| `tdq` | OWON PC473-Airedale | — | `xr5kjdxfxavku0gb`, `vnxcwomqkofjhjcc` | 3-phase energy monitor + switch |

All 23 sites contain BOTH Tongou and OWON devices. Tongou devices dominate by count (typically 8–15 Tongou vs 2–6 OWON per site).

**Naming convention:** `gk-{siteNo}-{zone}-{n}`
Examples: `gk-6863-glasswasher-2`, `gk-6832-fryer-1`, `gk-6847-supplyfan-1`

**Zone types observed across estate:** glasswasher, fryer, grill, merrychef, dishwasher, bainmarie, cellar, fridge, freezer, extractfan, supplyfan, barfan, coffeemachine, hcupboard, heatedgantry, externallighting, dhw, aircon

**Naming anomaly:** One device at gk-6851 is named `go-6851-externallighting-1` (prefix `go-` not `gk-`). All others follow the `gk-` convention. This appears to be a one-off provisioning error.

**Online rates:** Vary significantly by site. Site gk-6847 had 21 devices but only 4 online (17 offline) — possible site-wide connectivity issue. Most sites show 80–100% online rates.

---

## SA2 — Live data reading validation and control capability inventory

**Method:** `GET /v1.0/devices/{did}/status` for all devices at sites gk-6863, gk-6832, gk-6750, gk-6851. Also `GET /v2.0/cloud/thing/{did}/shadow/properties` for shadow property reads.

### Tongou (dlq) — status fields

| Field | Type | Meaning |
|---|---|---|
| `switch_1` | bool | Current relay state: `true`=ON, `false`=OFF |
| `countdown_1` | int | Countdown timer (seconds remaining) |
| `add_ele` | int | Cumulative energy (Wh, scaled) |
| `cur_current` | int | Current in mA × 10 (e.g. 0 = no load) |
| `cur_power` | int | Active power in W × 10 (e.g. 461 → 46.1W) |
| `cur_voltage` | int | Voltage × 10 (e.g. 2387 → 238.7V) |
| `fault` | int | 0 = no fault; non-zero = device fault code |
| `relay_status` | string | `"memory"` = restores to pre-power-cut state |
| `light_mode` | string | `"relay"` = LED tracks switch state |
| `child_lock` | bool | Child lock active |
| `online_state` | string | `"online"` / `"offline"` per device |

### OWON (tdq) — status fields

| Field | Type | Meaning |
|---|---|---|
| `switch_1` | bool | Current relay state: `true`=ON, `false`=OFF |
| `fault` | int | 0 = no fault |
| `relay_status` | int | 2 = auto/memory mode |
| `voltage_a/b/c` | int | Phase voltages in V × 100 (e.g. 2339 → 233.9V) |
| `current_a/b/c` | int | Phase currents in mA |
| `active_power_a/b/c` | int | Active power per phase in W |
| `power_factor_a/b/c` | int | Power factor as % |
| `forward_energy_a/b/c` | int | Forward energy per phase in Wh |
| `frequency` | int | Supply frequency (50 Hz) |
| `device_status` | int | 0 = ok (no non-zero values seen in sweep) |
| `schedule` | string | Base64-encoded OWON schedule blob (see SA3) |
| `ov_pwr_val_a/b/c` | int | Over-power threshold in W × 10 (26000 → 2600W) |
| `ov_pwr_en_a/b/c` | bool | Over-power protection enabled (false across estate) |

**Key observation:** Both types expose `switch_1` (bool) as their current circuit state. This is the critical live data field for the dashboard — it tells us whether the relay is closed (equipment powered) or open (equipment unpowered).

**Power metering:** Tongou's `cur_power` gives single-phase live power. OWON's `active_power_a/b/c` gives per-phase power. A Tongou with `switch_1=true` and `cur_power=0` would indicate the circuit is on but the appliance is drawing no load (off by appliance rather than by circuit).

**Online state:** Tongou has an explicit `online_state` field in status. OWON does not; use the device `online` flag from the device listing API.

### Control and override capability inventory

Questions from James: physical/local override, remote on/off, timed on, schedule extension. The following is derived from the Tuya Scheduler source (`tuya-api.js`, `technical-reference-v3.md`) and confirmed live API behaviour. **Note: Tuya WRITE/CONTROL is not the strategic route for OOH — the strategic path goes via ThingsBoard/bridge. This section documents feasibility only.**

**Physical / local override:**

| Device | Physical button? | How it works |
|---|---|---|
| Tongou TO-Q-SY1-JWT | **Yes — confirmed** | Physical button on front of DIN rail unit. Press once → toggles relay (OFF→ON or ON→OFF). Override holds until the next scheduled timer event fires. Works in BOTH directions. |
| OWON PC473-Airedale | **Likely — not independently verified** | The contractor flow in flows.js (`flows.js:1283`) gives the identical "press the override button once" instruction for both Tongou and Owon device types. This implies OWON PC473-Airedale has a physical button with the same behaviour. Not confirmed from a device data sheet or direct observation in this session. |

Both device types receive the same agent script in the contractor flow. The Tongou physical button is established fact; the OWON button is assumed by the dashboard and almost certainly present but should be confirmed empirically.

**Remote on/off (API):**

Both Tongou and OWON support immediate remote on/off via:
```
POST /v1.0/iot-03/devices/{deviceId}/commands
Body: {"commands": [{"code": "switch_1", "value": true/false}]}
```
This is fully implemented in Tuya Scheduler (`tuya-api.js:692`, `sendCommand(deviceId, dp, value)`). Immediate effect. Works for both device types. For the OOH dashboard, this command would be sent via the ThingsBoard bridge, not directly to the Tuya API.

**Timed ON (turn on for a user-defined duration then auto-off):**

| Device | Mechanism | Notes |
|---|---|---|
| Tongou | `countdown_1` DP | Seen in live Tongou status data. Set `switch_1=true` + `countdown_1=N_seconds` — device turns ON and automatically turns OFF after N seconds. Built into the Tongou hardware. |
| OWON | NOT available via DP | `countdown_1` was NOT present in OWON status fields across any sampled device. OWON likely doesn't support a hardware countdown DP. |
| Both (alternative) | Schedule manipulation | Write a temporary OFF timer at `now + duration` via the schedule API (OWON blob rewrite or Tongou timer POST), then remove it after it fires. More complex — requires a round-trip schedule read+write. |

**Schedule extension (keep equipment on until a later time tonight):**

Both device types support schedule modification via the Tuya API — proven by Tuya Scheduler's `uploadSchedule()` implementation. The pattern is: read current schedule → modify the relevant OFF timer's time → push the updated schedule back.
- OWON: full blob replacement (clear → push new encoded blob)
- Tongou: clear all → re-push each timer individually

For the OOH dashboard this would be a write operation routed via ThingsBoard/bridge. The technical mechanism is fully understood from the Tuya Scheduler source; no unknowns remain on the API side. The design question is which layer (bridge, backend, or Tuya direct) handles it.

---

## SA3 — Schedule reading validation

### OWON schedule

**Endpoint:** `GET /v2.0/cloud/thing/{devId}/shadow/properties` → find property with `code=="schedule"` → base64-decode the value.

**Encoding:** 5 bytes per entry:
- Byte 0: Day bitmask (bit 0 = **Sun**, bit 1 = Mon, bit 2 = Tue … bit 6 = Sat)
- Byte 1: Hour (0–23)
- Byte 2: Minute (0–59)
- Byte 3: ON/OFF (`1` = ON, `0` = OFF)
- Byte 4: Enabled (`1` = enabled, `0` = disabled but preserved in blob for re-enable)

**Sun=position0: CONFIRMED** — verified against multiple OWON devices across gk-6863, gk-6832, gk-6750.

**Empty schedule sentinel:** `AA==` (single zero byte) = device has no schedule entries configured. Separate from an empty string (`""`) which means no schedule blob at all.

**Hardware cap:** 16 entries maximum (5 bytes × 16 = 80 bytes).

**Decoded examples from live estate:**

gk-6863-cellar-1:
- ON at 10:15, all days enabled
- OFF at 21:30, all days enabled

gk-6863-bainmarie-1 (weekday split):
- OFF 00:30 Sun only; OFF 01:00 Mon–Sat
- ON 10:40 all days
- OFF 20:30 Sun; OFF 21:30 Mon–Sat

gk-6863-dishwasher-1 (similar weekday split, later ON):
- OFF 00:30 Sun; OFF 01:00 Mon–Sat
- ON 11:00 all days (one hour offset from bainmarie)
- OFF 22:00 Sun; OFF 23:00 Mon–Sat

**Edge cases:**
- `AA==` sentinel: device provisioned but no schedule set (fryer, extractfan, fridge, freezer at gk-6863 — these are always-on circuits, expected to have no schedule)
- Empty string: no blob at all (older provisioned devices with no OWON schedule upload)
- Disabled entries: `byte[4]=0` — entry is stored but not executed; used to preserve timing data while temporarily disabling

### Tongou schedule

**Endpoint:** `GET /v2.0/cloud/timer/device/{devId}` → array of timer objects.

**Timer object structure:**
```json
{
  "time": "10:30",
  "loops": "0111111",
  "functions": [{"code": "switch_1", "value": true}],
  "enable": true,
  "timezone_id": "Europe/London"
}
```

- `loops`: 7-character string, **position 0 = Sun**, position 1 = Mon, …, position 6 = Sat. `"1"` = active that day.
- `functions[0].value`: `true` = ON, `false` = OFF
- `enable`: timer active (`false` = disabled/stale)

**Sun=position0: CONFIRMED** — verified via tuya-api.js source (the Tuya Scheduler implementation) and decoded live timer data.

**Working timer cap:** approximately 23 entries (empirical from Tongou documentation; not directly confirmed in this sweep).

**Decoded example from live estate (gk-6863-glasswasher-2):**
```
OFF 05:00 Mon–Sat (cool-down pre-wake)
OFF 05:30 Sun     (Sunday offset)
OFF 09:00 Mon–Sat (secondary rest)
ON  10:30 Mon–Sat (main service window start)
ON  11:00 Sun     (Sunday start offset)
OFF 22:30 Mon–Sat (service end)
OFF 23:00 Sun     (Sunday close)
```
Pattern: staggered pre-wake OFF entries before the main ON suggest power sequencing to avoid simultaneous startup loads.

**Edge cases:**
- Stale disabled timers: gk-6832-hcupboard-1 had 6 Tongou cloud timers all with `enable=false` and `loops="0000000"` — artifact of previous configuration, effectively empty schedule.
- Devices with no timers at all: returns empty array `[]`.
- Offline devices: schedule data IS returned from cloud even when device is offline (cloud-side storage, not device-side).

---

## SA4 — Dashboard flow impact assessment

### Which flows touch Tuya device data?

**Kitchen flow (flows.js lines 961–997) — PRIMARY GAP:**

- `ws.devices.filter(d => d.kind === 'kitchen')` — selects kitchen devices
- `d.online` — checks if any are offline (diverts to connectivity)
- `ws.devices.find(d => d.kind === 'kitchen')?.schedule || ''` — takes the **first** kitchen device's `schedule` field from ThingsBoard workspace

**The `schedule` field here is the TB fixture field** (`"07:00-22:00"` plain string), **NOT** anything read from the Tuya API. Live switch state (`switch_1`) is **not surfaced** in this flow at all.

If all devices are online: the flow asks "is this business-critical?" and routes to either:
- P1 outcome (if critical): _"Kitchen circuits off during service — remote switching not available"_
- Captured outcome (if not): _"Caller needs equipment outside current schedule window (07:00-22:00)"_

Neither outcome knows which specific circuits are ON or OFF, what the actual Tuya schedule says, or whether the issue is a schedule mismatch vs. a genuine fault.

**Lighting flow (flows.js lines 999–1037) — ALREADY USING LIVE STATE:**

```js
lg.telemetry?.switch_1 ? 'currently ON' : 'currently OFF'
```

The lighting flow already reads `telemetry.switch_1` from device data and surfaces per-circuit ON/OFF state. `canSwitch(lg)` gates whether a remote switch action is offered. This is the implemented target for kitchen devices.

**Fan flow (flows.js lines 1039–1069) — ALREADY USING LIVE STATE:**

Same as lighting: `fan.telemetry?.switch_1 ? 'currently ON' : 'currently OFF'` is already shown per circuit. Remote switching via `canSwitch(fan)`.

**Contractor flow (flows.js lines 1208–1315) — REFERENCES TONGOU/OWON BY NAME:**

The PowerPause override path in the contractor flow explicitly asks the contractor to identify whether their device is "Tongou" or "Owon", then gives device-type-specific override instructions (press the physical button once). This already uses Tuya device type vocabulary in the agent script — confirming the dashboard has established precedent for device-type-specific guidance.

### Summary of SA4 gaps

| Flow | Live switch_1 shown | Structured schedule shown | Gap |
|---|---|---|---|
| Kitchen | No | No (static TB string only) | Critical — primary surface for Tuya estate |
| Lighting | Yes | No | Acceptable for current scope |
| Fan | Yes | No | Acceptable for current scope |
| Contractor | N/A (physical button) | N/A | Tongou/Owon vocabulary already established |
| Fridge | N/A (monitoring only) | N/A | No gap |

**Root cause of kitchen gap:** The kitchen flow was designed when live Tuya telemetry was not yet available via the TB-direct read path. The `schedule` field in `ws.devices` is sourced from the fixture JSON (or equivalent TB attribute), not from a live Tuya API call. Adding live state requires: (a) the OOH backend to read `switch_1` and parse the Tuya schedule for kitchen devices, and (b) the kitchen flow to use those fields instead of the static schedule string.

---

## SA5 — Agent outcome language (DRAFT — requires James approval)

> **GATE HOLD:** The gate PR will not be raised until James explicitly agrees the outcome language in this section. Present it to James and wait for go.

### Current kitchen outcomes (no live data)

**Non-critical (all online):**
> _"Caller needs kitchen equipment outside the current schedule window (07:00-22:00)"_
> Script: "The kitchen equipment has a schedule — it comes on automatically at its set time."

**Critical (business-service hours, all online):**
> _"Kitchen circuits off during service — remote switching not available"_

### Proposed outcomes with live Tuya data

The dashboard would gain three new facts per kitchen circuit:
1. Is the relay currently ON or OFF? (`switch_1`)
2. What does the schedule say it should be doing right now? (parsed schedule)
3. What is the next scheduled change? (next timer event)

**Proposed outcome branch: circuit is OFF but schedule says it should be ON:**
> _"[Zone name] is currently OFF, but the schedule says it should have come on at [time] — it may not have started as expected."_
> Agent script: _"Fryer 1 is off — according to the schedule it should have come on at half ten, so it looks like it hasn't started automatically. The PowerPause device has a manual override button on the front — pressing it once should bring the circuit on immediately."_

**Proposed outcome branch: circuit is ON and schedule confirms it should be ON:**
> _"[Zone name] is ON as expected. Schedule: on from [start] until [end]."_
> Agent script: _"The fryer is on and the schedule confirms it should be — if the caller says the equipment itself isn't working, it's probably a hardware fault with the appliance rather than the power supply. The site should contact their repairs admin team."_

**Proposed outcome branch: circuit is OFF and schedule confirms it is scheduled to be OFF:**
> _"[Zone name] is OFF — the schedule has it off until [next on time]."_
> Agent script: _"It's showing as off, but that's what the schedule says at this time of day — it's due to come on at [time]. If you need it on now, the PowerPause override button on the device will bring it on early. It'll go back to the normal schedule at the next scheduled event."_

**Proposed outcome branch: circuit is OFF and no schedule is configured (always-on circuit):**
> _"[Zone name] is OFF but has no active schedule — this circuit should normally be on."_
> Agent script: _"That circuit has no schedule — it's meant to stay on. This looks like it may have tripped. Check the fuse board first; if that's clear, ring back and we'll escalate to the IoT team."_

**Proposed outcome branch: Tongou power reading shows circuit ON but zero load:**
> _"[Zone name] relay is ON but drawing no power (0W) — the appliance may have tripped internally or been switched off at the unit."_
> Agent script: _"Power is reaching the appliance but it's not drawing any — the circuit is on, so this is probably a hardware fault with the appliance itself. The site should contact their repairs admin team."_

---

## SA6 — Team issue validation

### Teams messages found

**Tony Willetts (IoT Support, 2026-04-17):**
> "tickets/42792 Thomas Carousel 6768 — kitchen equipment always switches off every day at 1pm, it's disruptive to service, been happening for a couple months, half of their appliances are offline on Tuya"

Verdict: A recurring mid-service schedule event triggering unexpected OFF. With live Tuya schedule data, an agent could see: "fryer-1 has a schedule entry OFF at 13:00 Mon–Fri — this is the configured event, not a fault; the schedule needs adjusting." Currently invisible to the dashboard.

**Megan Mcsevney (IoT Support, 2026-02-12):**
> "Leanne from Brentwood 6759 — None of the kitchen equipment has turned on. I went on Tuya app and supply fan on timer for 11am which I'm guessing is why nothing switched on — they were unable to serve."

Verdict: A schedule dependency chain issue. The extract fan has a startup timer at 11am; the kitchen devices may have a dependency or manual process that requires fan-first. With live Tuya data, an agent could surface: "supply fan is currently OFF (scheduled to start 11:00). Kitchen equipment shows schedule on from 10:30 but fan has not yet started." Currently the dashboard cannot explain this at all.

### Recurring issue patterns validated

| Pattern | Teams evidence | Live data would provide |
|---|---|---|
| Mid-service OFF event at a fixed time | Thomas Carousel / 1pm shutdowns | Show the schedule entry that triggered it; confirm it's config not fault |
| Equipment not on at open (fan/kitchen dependency) | Brentwood 6759 / 11am fan timer | Show each circuit's ON/OFF state and schedule at call time |
| Half of appliances offline | Thomas Carousel / "half offline" | Per-device `switch_1` and `online` status for all kitchen circuits |

---

## Open questions and unresolveds

**UNRESOLVED — Backend read path for kitchen schedule:**
The OOH backend reads device data from ThingsBoard. The live Tuya state (`switch_1`, Tuya schedule) is not currently part of the TB workspace payload for kitchen devices. Whether TB stores live Tuya `switch_1` as a timeseries key (and if so, whether the backend already fetches it) needs investigation in a design session. The Tuya API direct-read approach (used by the Tuya Scheduler) is an alternative if TB does not expose this.

**UNRESOLVED — How Tuya state gets into the workspace:**
The dashboard fixture file (`data/fixtures/bridge-devices.json`) has `telemetry: {switch_1: bool}` for Tuya kitchen devices — so the schema is designed for it. Whether the live TB-direct read path populates `switch_1` for Tuya devices (or falls back to TB last-value telemetry) is not confirmed from this read-only session. Requires a code trace in `tb-device.js` at the design stage.

**UNRESOLVED — Schedule storage in ThingsBoard:**
Tuya schedules are stored in Tuya Cloud (not in ThingsBoard). To surface schedule data in the dashboard, either (a) the backend reads Tuya API directly for schedule on-demand, or (b) the Tuya Scheduler writes schedule summaries to ThingsBoard attributes. Which approach is preferred — and whether (b) already happens — is an open design question for Sam/Spencer.

**PROVEN — API access is live and functional:**
Tuya EU OpenAPI credentials are in Azure Key Vault. Auth, device listing, status read, shadow properties, and cloud timer reads all work as of 2026-10-23. The API is production-live.

**PROVEN — Sun=bit0/pos0 across both device types:**
OWON bitmask bit 0 = Sunday; Tongou loops[0] = Sunday. Confirmed via tuya-api.js source and live decoded schedule data.

**PROVEN — OWON empty schedule sentinel:**
`AA==` (single zero byte) = no entries. Empty string `""` = no blob uploaded. Both mean "no schedule" for display purposes.

**PROVEN — Offline devices still return schedule data:**
Schedule queries return cloud-stored data regardless of device online status. A device that is offline still has its schedule readable.

---

## Recommendation

**Build scope (for design gate):** Add live `switch_1` state and parsed schedule data to the kitchen flow. The lighting and fan flows already demonstrate the pattern (`telemetry?.switch_1 ? 'currently ON' : 'currently OFF'`). The kitchen flow should do the same per circuit, plus add a schedule-aware branch: is the device in its expected state for the current time?

**Out of scope (this story):** Tuya CONTROL (writing `switch_1`, pushing schedule changes) — that is a separate story and goes via TB/bridge, not direct Tuya API write.

**Design decision needed:** How does live Tuya `switch_1` state reach the workspace? Option A: backend reads it from Tuya API directly (adds external dependency to the OOH backend). Option B: TB stores last-known Tuya state as a timeseries key and the existing TB-direct read already picks it up. Option C: a new TB attribute populated by the Tuya Scheduler on change. The design gate must resolve this before any build begins.
