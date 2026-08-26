# OOH Dashboard -- Cross-Reference Analysis

**Created:** 25 March 2026
**Purpose:** Map diagnostic flows, cheat sheets, and SOPs against the OOH Dashboard triage flows to identify: (1) what can be automated, (2) what needs phone-guided scripts, (3) what requires IoT team handoff.
**Status:** In progress

---

## Source Materials Cross-Referenced

| Source | Content | Location |
|--------|---------|----------|
| OOH Triage Flows (14 flows) | V4 mockup chat-based triage engine | `OOH_FLOW_MOCKUP_V4.html` |
| OOH Capabilities (C1-C10) | 91-incident capability analysis | `OOH_CAPABILITY_ANALYSIS.md` |
| Remote Diagnostic Flows (R1-R9) | Alasdair Monk's Visio decision trees | `OOH Dash Reference Docs/IOT_DIAGNOSTIC_FLOWS_FACTBASE.md` |
| Lighthouse SOP FAQ | Full system troubleshooting guide | `OOH Dash Reference Docs/LighthousevSOP FAQ and Troubleshooting.docx` |
| PowerPause Cheat Sheet | Kitchen equipment quick-reference | `OOH Dash Reference Docs/Lighthouse PowerPause Cheat Sheet.docx` |
| Salus Cheat Sheet | Accommodation thermostat guide | `OOH Dash Reference Docs/Lighthouse Salus Cheat Sheet Smart Thermostat.docx` |
| Pub Heating Cheat Sheet | Pub area heating quick-reference | `OOH Dash Reference Docs/Pub Heating Cheat Sheet.docx` |
| Fire Up/Fire Down Schedules (x10) | Per-site appliance on/off times | `OOH Dash Reference Docs/*.xlsx` |
| GK Ways of Working | Installation handover + contacts | `OOH Dash Reference Docs/Greene King Flaming Grill GK Ways of Working updated 21-11.docx` |
| Parts and Kits | Full equipment inventory by kit type | `OOH Dash Reference Docs/Parts and Kits.pdf` |

---

## Three-Tier Triage Model

The reference documents reveal a natural three-tier structure that should be built into every OOH flow:

| Tier | Name | What Happens | System Access Needed | Skill Level |
|------|------|-------------|---------------------|-------------|
| **T1** | Phone-Guided | Handler walks caller through physical checks (cheat sheet steps) | None -- voice only | Zero (read a script) |
| **T2** | System-Assisted | Handler uses dashboard to check status, schedules, make pocket changes | OOH Dashboard | Low (follow guided flow) |
| **T3** | Handoff | Handler escalates with pre-populated ticket, referencing specific diagnostic flow for IoT team | Zendesk ticket creation | Low (form fill) |

**Key principle:** Every triage flow should exhaust T1 before moving to T2, and T2 before T3. This maximises resolution rate while keeping the handler's skill requirement at zero.

---

## Flow-by-Flow Cross-Reference

### 1. `tooCold` -- It's Too Cold In Here

**Current OOH flow:** Pull Salus heating zones → pick area → assess delta (current vs setpoint) → boost setpoint +3C for 2hrs → or skip → end.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Ask: Is this a pub area or accommodation? | Pub Heating Cheat Sheet / Salus Cheat Sheet | NO -- flow goes straight to Salus zones |
| T1 | Pub area: Confirm winter mode is active (Oct-Apr). Outside Oct-Apr, heating is off by design. | Pub Heating Cheat Sheet | NO |
| T1 | Pub area: Confirm it's within operating hours. Outside hours, 15C setback is expected. | SOP FAQ (heating follows GK Nexus hours) | NO |
| T1 | Accommodation: Ask caller to check Salus thermostat screen -- is it on? Can they see a flame icon? Is it animated (actively heating) or static? | Salus Cheat Sheet | NO |
| T1 | Accommodation: Check Wi-Fi icon present, battery icon not empty, Zigbee icon showing connection | Salus Cheat Sheet | NO |
| T1 | Accommodation: Try increasing temperature using up arrow on thermostat (range 15-22C) | Salus Cheat Sheet | NO |
| T2 | Check current temp vs setpoint in dashboard | Already in flow | YES |
| T2 | If below setpoint and heating not active: boost +3C for 2hrs | Already in flow | YES |
| T3 | If thermostat screen blank/unresponsive: escalate as hardware fault | Salus Cheat Sheet | NO -- flows to `controlsIssue` but no explicit link |

**Diagnostic flow inputs (R1/R2):**
- AC set-point zero/NULL flows are for Intesis AC units, not Salus heating. Not directly applicable to `tooCold` for pub/accommodation heating.
- However, if a site has AC in heating mode, the `acColdWarm` flow applies.

**Gaps to fill:**
1. Add T1 branch: pub vs accommodation at the start
2. Add T1 seasonal check (winter mode Oct-Apr)
3. Add T1 operating hours check (within hours = 21C expected, outside = 15C expected)
4. Add T1 Salus phone-diagnostic script for accommodation
5. Add explicit link to `controlsIssue` if thermostat unresponsive

---

### 2. `tooHot` -- It's Too Hot In Here

**Current OOH flow:** Check Salus zones → zones are normal → capture details → escalate as AC/ventilation issue.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Pub area: Confirm it's within operating hours. If so, 21C is the target -- is the room genuinely above this? | SOP FAQ | NO |
| T1 | Ask: Has the site opened doors/windows? (Common pattern from capability analysis -- Fox Hunters 6795, Badger Box 4631) | Capability Analysis | NO |
| T1 | Ask: Is the AC running? Is it blowing warm air? (Routes to `acWarmCool` if yes) | SOP FAQ (AC section) | Partially -- flow does mention AC escalation |
| T1 | Accommodation: Can the caller turn the Salus thermostat down using the down arrow? | Salus Cheat Sheet | NO |
| T2 | Check setpoint -- is it unusually high? Could be a previous override that wasn't reverted. | OOH flow design | Partially -- checks zones but doesn't flag anomalies |
| T2 | If setpoint is correct and temp is above setpoint: heating should be off. If it's still heating, this is a stuck valve/relay. | SOP FAQ | NO -- this should route to `heatingStuck` |

**Gaps to fill:**
1. Add T1 "is it genuinely above 21C?" reality check
2. Add T1 AC routing question early in the flow
3. Add T1 accommodation self-service (Salus down arrow)
4. Add T2 anomaly detection: if heating is active above setpoint, route to `heatingStuck`

---

### 3. `noHotWater` -- No Hot Water

**Current OOH flow:** Check boiler status → boiler online but no DHW telemetry → capture details → escalate.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Confirm: is the site within operating hours? HW starts 1 hour before opening. If calling before that, HW isn't expected yet. | Pub Heating / SOP FAQ | NO |
| T1 | Ask: Is this pub HW or accommodation HW? Some pubs have accommodation HW served from the pub system. | Pub Heating Cheat Sheet | NO |
| T1 | Ask: Is the boiler pilot light on? Can they see any error codes on the boiler panel? | SOP FAQ | NO |
| T1 | Ask: Can they scan the QR code on the boiler panel for boiler information? | Pub Heating Cheat Sheet | NO |
| T2 | Check boiler status in ThingsBoard (online/offline, DHW active) | Already in flow | YES |
| T3 | If boiler offline or fault code: escalate. Pre-populate ticket with "boiler fault, not Lighthouse issue -- site to contact boiler maintenance contractor" or "DHW schedule/valve issue -- IoT team to investigate" | SOP FAQ escalation path | Partially -- escalates but doesn't distinguish boiler fault vs LH issue |

**Diagnostic flow inputs:** No direct R1-R9 flow for DHW, but R3 (R10A offline) applies if the boiler control panel (ARMxy gateway) is offline.

**Gaps to fill:**
1. Add T1 time check (HW starts 1hr before opening)
2. Add T1 pub vs accommodation HW distinction
3. Add T1 boiler pilot light / error code phone check
4. Add T3 distinction between "boiler fault = not ours" and "DHW schedule/valve = ours"

---

### 4. `kitchenEquip` -- Kitchen Equipment Not Working (Fryers)

**Current OOH flow:** Check Tuya device connectivity → check schedule → branch: early opening / schedule failed / unexpected trip / other → switch on or escalate.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Ask: Which appliance? Is it labelled with a "PowerPause" sticker? If no label, it's not controlled by Lighthouse. | PowerPause Cheat Sheet | NO -- critical for scope determination (C4) |
| T1 | Ask: Can they see the interlock panel? Is the green light on? | PowerPause Cheat Sheet | NO |
| T1 | If green light ON: Press the green button. Listen for a click (contactor engaging). Did the appliance come on? | PowerPause Cheat Sheet | NO |
| T1 | If green light OFF: Check the MCB/fuse for that appliance on the distribution board. | SOP FAQ (PowerPause troubleshooting) | NO |
| T1 | If no green light and MCB is on: This is a hardware/power fault, not a schedule issue. | SOP FAQ | NO |
| T2 | Check fire-up/fire-down schedule: Is the caller within scheduled hours? If calling before fire-up time, equipment isn't expected to be on. | Fire Up/Fire Down schedules | Partially -- checks schedule but doesn't compare to site-specific times |
| T2 | Check Tuya device status: online/offline | Already in flow | YES |
| T2 | If device online and within schedule: trigger remote override | Already in flow | YES |
| T3 | If device offline or interlock panel not responding: escalate with "PowerPause hardware fault at [site], interlock panel green light OFF, MCB checked" | Diagnostic flows / PowerPause Cheat Sheet | NO -- escalates but without structured handoff content |

**Diagnostic flow inputs:** No direct R1-R9 match (those flows cover R10A/LoRaWAN infrastructure, not Tuya PowerPause). However, if the PowerPause uses a WiFi connection, gateway offline (R3-like) troubleshooting principles apply.

**Gaps to fill:**
1. Add T1 PowerPause label check (scope determination)
2. Add T1 interlock panel walk-through (green light → green button → click)
3. Add T1 MCB/fuse check
4. Add T2 fire-up/fire-down time comparison
5. Add T3 structured handoff content when hardware fault detected

---

### 5. `keepsTurningOff` -- Equipment Keeps Turning Off

**Current OOH flow:** Check schedules → ask if schedule matches → if yes, escalate schedule conflict; if random, escalate as intermittent shutdown.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Ask: Is this happening at the same time each day? (If yes, likely schedule issue.) | SOP FAQ | Partially -- asks about schedule match |
| T1 | Ask: Does the green light go off when the equipment turns off? (If yes, contactor is de-energising = schedule or power issue. If light stays on but equipment off = appliance fault, not LH.) | PowerPause Cheat Sheet | NO -- this is a critical diagnostic distinction |
| T1 | Ask: Is it only one appliance or multiple? (Multiple = distribution board / main supply issue, not LH.) | SOP FAQ | NO |
| T2 | Check schedule: does the off time match the reported turn-off time? | Already in flow | YES |
| T2 | Check Tuya device logs: is the device reporting state changes? | Partially in flow | Partially |
| T3 | If schedule mismatch confirmed: escalate as "schedule correction needed" with specific times | Already in flow | Partially |

**Gaps to fill:**
1. Add T1 "does the green light go off?" diagnostic
2. Add T1 "one appliance or multiple?" scope check
3. Improve T3 handoff content with specific schedule details

---

### 6. `heatingStuck` -- Heating Won't Turn Off

**Current OOH flow:** Detect stuck zone (temp > setpoint but still heating) → try remote setpoint reset → if resolved, done; if still stuck, escalate.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Ask: Is this pub area or accommodation? | SOP FAQ | NO |
| T1 | Accommodation: Can the caller press and hold OK for 3 seconds to turn the Salus thermostat to standby/frost protection? | Salus Cheat Sheet | NO -- immediate physical workaround |
| T1 | Pub area: Ask if radiators are hot. If hot despite thermostat showing heating off, this is a stuck valve (not LH). | SOP FAQ | NO |
| T2 | Check zone: temp vs setpoint. Is heating actively calling? | Already in flow | YES |
| T2 | Try remote setpoint reset to minimum (15C) | Already in flow | YES |
| T3 | If physical valve stuck: "Not a Lighthouse issue -- site needs plumber/heating engineer. Zone valve stuck open." | SOP FAQ | NO |

**Gaps to fill:**
1. Add T1 pub/accommodation branch
2. Add T1 Salus standby workaround for accommodation
3. Add T1 "are radiators hot?" physical check for pub areas
4. Add T3 distinction between LH issue (stuck in software) and valve issue (stuck physically)

---

### 7. `acColdWarm` / `acWarmCool` / `acWontOff` -- Air Conditioning Issues

**Current OOH flows:** Pull Intesis AC data → identify units in wrong mode → note agents CANNOT change AC modes → capture details → escalate.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Confirm: AC cooling limit is 20C, heating limit is 22C. If caller says "it's 21C and the AC is blowing cold" -- that's within spec. | SOP FAQ (AC section) | NO |
| T1 | Confirm: AC should auto-shutdown outside trading hours. If it's running outside hours, that's a fault. | SOP FAQ | NO |
| T1 | Ask: Is there a wall controller? Can the caller see the current mode (heat/cool/auto) and temperature? | General AC knowledge | NO |
| T2 | Check Intesis data for mode, setpoint, room temp | Already in flow | YES |
| T3 | Escalate. OOH handlers cannot change AC modes or setpoints (confirmed in current flow). | Current design | YES |

**Diagnostic flow inputs (R1/R2):**
- R1 (AC set-point zero) and R2 (AC set-point NULL) are the IoT team's diagnostic paths for AC issues. These involve SSH to R10A, Modbus checks, and Intesis module inspection -- all T3/IoT team work.
- However, the first decision in R1 ("Check for Modbus timeouts via SSH") could be pre-populated in the handoff: "Handler confirmed AC wall controller has power. IoT team: start with R1 step 2 -- check Modbus timeouts."

**Gaps to fill:**
1. Add T1 reality check against AC limits (20C cool / 22C heat)
2. Add T1 "is it outside trading hours?" check
3. Add T3 structured handoff referencing R1/R2 diagnostic flows
4. Add T1 wall controller power check (mirrors R1 decision 3)

---

### 8. `controlsIssue` -- Display Showing Error / Controls Not Working

**Current OOH flow:** Sub-routes: thermostat blank (try gateway reset), error code (capture + escalate), panel not responding (try gateway reset), other (capture + escalate).

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Salus thermostat blank: Is it plugged in to charge? Try pressing and holding OK for 3 seconds. | Salus Cheat Sheet | NO |
| T1 | Salus thermostat: Check battery icon -- if empty, plug in micro-USB and wait. | Salus Cheat Sheet | NO |
| T1 | Salus thermostat: Check Wi-Fi icon present. If missing, thermostat has lost connection. | Salus Cheat Sheet | NO |
| T1 | Interlock panel: Is the green light on? If not, check MCB. | PowerPause Cheat Sheet | NO |
| T1 | Boiler panel: Any error codes? Can caller scan QR code on panel? | Pub Heating Cheat Sheet | NO |
| T2 | Try gateway reset if applicable | Already in flow | YES |
| T3 | Capture error code, photos if possible, and escalate | Already in flow | YES |

**Gaps to fill:**
1. Add T1 Salus-specific diagnostics (charge, battery, Wi-Fi, OK button)
2. Add T1 interlock panel check for PowerPause controls
3. Add T1 boiler QR code capture

---

### 9. `fridgeIssue` / `wontTurnOnFridge` -- Refrigeration

**Current OOH flows:** Pull ThingsBoard sensor data → show alarm-based monitoring → capture equipment + impact details → escalate (severity based on food safety).

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Confirm: Lighthouse does NOT control fridges/freezers -- monitoring only. PowerPause does NOT apply to refrigeration. | SOP FAQ ("NOT fridges/freezers") | NO -- critical scope clarification |
| T1 | Ask: Is the alarm audible on site? Has the door been left open? | General | NO |
| T1 | Ask: What temperature is the display showing? | General | NO |
| T2 | Check ThingsBoard sensor data (temp history, door open/close) | Already in flow | YES |
| T3 | Escalate with food safety severity. If temp >8C (fridge) or >-15C (freezer) for extended period, flag as food safety risk. | General food safety | Partially |

**Diagnostic flow inputs (R6/R7):**
- R6 (Sensing Element Faulty) applies if the sensor is reporting but values are wrong.
- R7 (Anomalous Sensor Reading) applies for unexpected values.
- Neither is executable by OOH -- both require TTI portal access. But handoff content should reference these.

**Gaps to fill:**
1. Add T1 explicit statement: "Lighthouse monitors but does NOT control refrigeration"
2. Add T1 door check and display temperature capture
3. Add T3 food safety severity thresholds
4. Add T3 handoff reference to R6/R7 if sensor readings suspect

---

### 10. `ovensGrills` -- Ovens / Grills Not Working

**Current OOH flow:** Check ThingsBoard device status → note "not remotely controllable" → capture details → escalate.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Ask: Is there a PowerPause label on the appliance? If yes, this IS remotely controllable via Tuya -- route to `kitchenEquip` flow instead. | PowerPause Cheat Sheet | NO -- ovensGrills currently treats all as non-controllable |
| T1 | If no PowerPause label: This is not Lighthouse-controlled. Advise site to check appliance power, gas supply, and contact their maintenance contractor. | SOP FAQ | NO |
| T2 | If PowerPause-labelled: Follow `kitchenEquip` T2 steps | Redirect | NO |
| T3 | If not LH-controlled: "Not a Lighthouse issue. Site advised to contact [GK Repairs Helpdesk 0345 603 4566 / repairsadmin@greeneking.co.uk]" | GK Ways of Working | NO |

**Gaps to fill:**
1. Add T1 PowerPause label check -- this is a critical routing decision that could turn an escalation into a self-service resolution
2. Add T1 "not ours" routing with GK Repairs contact details
3. Potentially merge `ovensGrills` into `kitchenEquip` with a "is it PowerPause-controlled?" branch

---

### 11. `wontTurnOn` -- Equipment Won't Turn On

**Current OOH flow:** Ask "what type?" → routes to: kitchenEquip, ovensGrills, tooCold, acWontTurnOn, fridgeWontTurnOn, other.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Before routing: Ask if ANY equipment is working. If nothing works, this is likely a site power issue, not LH. | SOP FAQ | NO |
| T1 | Ask: Has the site checked their main distribution board / fuse board? | SOP FAQ | NO |
| T2 | Route to specific equipment flow | Already in flow | YES |

**Gaps to fill:**
1. Add T1 "is anything else working?" total power failure check before routing
2. Add T1 distribution board / fuse board check

---

### 12. `somethingElse` -- General Issue

**Current OOH flow:** Capture free-text description → escalate.

**Cheat sheet/SOP inputs:**

| Tier | Step | Source | Currently in flow? |
|------|------|--------|--------------------|
| T1 | Before capturing: Ask scope question -- "Is this about heating, kitchen equipment, lighting, hot water, or something else entirely?" to try routing to a specific flow. | SOP FAQ | NO |
| T1 | If caller mentions a contractor on site: Route to contractor coordination path (C5). Capture contractor name, company, what they need. | Capability Analysis (C5) | NO |
| T3 | Escalate with structured context | Already in flow | YES |

**Gaps to fill:**
1. Add T1 re-routing attempt before defaulting to free-text
2. Add contractor-on-site detection and routing

---

## External Lighting -- Missing Flow

**No current OOH triage flow exists for external lighting**, despite it being C3 (9 incidents, 10% of volume).

**What we know from reference docs:**
- Controlled via Tongou smart switches (PowerPause 1P dedicated circuit)
- Sites have: car park lighting, festoon lighting, outdoor heaters, outdoor TVs
- Common issue: "outside lights not on, pub looks shut"
- Resolution: Check Tongou device status → trigger remote switch OR guide site to press manual override button

**Cheat sheet/SOP inputs:**
- SOP FAQ doesn't explicitly cover external lighting troubleshooting
- PowerPause Cheat Sheet mentions "look for the PowerPause label" which would apply
- Fire-up/fire-down schedules include "Outside Lights" and "Jumbrella/External Heater" with specific times

**Recommendation:** Create a new `externalLighting` flow:
- T1: Is it dark? (Obvious but establishes whether lights should be on.) Are the lights PowerPause-labelled? Can caller see the Tongou switch? Is it showing power?
- T2: Check Tuya device status. Check schedule (fire-up/fire-down). Override if needed.
- T3: If device offline or no power to Tongou, escalate as electrical fault.

---

## Scope Determination -- Missing Flow

**No current OOH triage flow for scope determination (C4)**, despite it being 12% of volume.

The SOP and cheat sheets consistently define what IS and ISN'T controlled:

**Lighthouse controls:**
- Heating (pub areas via boiler panel, accommodation via Salus)
- Hot water (via boiler panel, 1hr before opening)
- Kitchen equipment with PowerPause labels (fryers, ovens, gantries, extractors, supply fans)
- External lighting (Tongou switches)
- AC (Intesis, limited)
- Monitoring only: fridges, freezers, cellars (temp sensors, door sensors, flow sensors)

**Lighthouse does NOT control:**
- Fridges/freezers (monitoring only)
- Boilers directly (controls schedule/setpoint, not the boiler itself)
- Plumbing / leaks
- Gas supply
- Electrical faults at distribution board level
- Appliances without PowerPause labels
- Signage
- Fire systems
- Security systems

**Recommendation:** Build a scope-check step into the start of every flow, or create a dedicated lookup that shows "At site X, Lighthouse controls: [list]" -- this was already identified as C4 in the capability analysis and designed into the Site Detail Panel.

---

## Summary: Gaps by Priority

### Must-Have (addresses the most common OOH call patterns)

| # | Gap | Flows Affected | Source |
|---|-----|---------------|--------|
| 1 | **T1 PowerPause interlock walk-through** (green light → button → click → MCB check) | `kitchenEquip`, `keepsTurningOff`, `wontTurnOn`, `ovensGrills` | PowerPause Cheat Sheet |
| 2 | **T1 Salus phone-diagnostic** (screen on? flame icon? animated? battery? Wi-Fi? Zigbee? Try up/down arrows) | `tooCold`, `tooHot`, `heatingStuck`, `controlsIssue` | Salus Cheat Sheet |
| 3 | **T1 Schedule time check** (is the caller within fire-up/fire-down hours for their appliance/heating?) | `kitchenEquip`, `tooCold`, `noHotWater`, `keepsTurningOff` | Fire Up/Fire Down schedules, SOP FAQ |
| 4 | **T1 Scope check** ("Is it labelled PowerPause?" / "Is it within Lighthouse control?") | All flows -- especially `ovensGrills`, `fridgeIssue`, `somethingElse` | PowerPause Cheat Sheet, SOP FAQ |
| 5 | **New flow: External Lighting** | Missing entirely | Capability Analysis C3 (9 incidents) |

### Should-Have (improves triage quality and handoff)

| # | Gap | Flows Affected | Source |
|---|-----|---------------|--------|
| 6 | **T1 Pub vs Accommodation branch** at start of heating flows | `tooCold`, `tooHot`, `heatingStuck` | SOP FAQ, Salus Cheat Sheet |
| 7 | **T1 "Is anything else working?" total power failure check** | `wontTurnOn` | SOP FAQ |
| 8 | **T3 Structured handoff referencing diagnostic flow IDs** (R1-R9) with "handler has ruled out X, Y, Z" | All escalation endpoints | IOT Diagnostic Flows Factbase |
| 9 | **T1 Boiler QR code capture** for HW/heating issues | `noHotWater`, `tooCold` | Pub Heating Cheat Sheet |
| 10 | **T3 GK Repairs contact details** for "not ours" outcomes | All flows with scope determination | GK Ways of Working (0345 603 4566) |

### Nice-to-Have (edge cases and refinements)

| # | Gap | Flows Affected | Source |
|---|-----|---------------|--------|
| 11 | **T1 Seasonal check** (winter mode Oct-Apr) | `tooCold`, `tooHot` | Pub Heating Cheat Sheet |
| 12 | **T1 Contractor-on-site detection** | `somethingElse`, `wontTurnOn` | Capability Analysis C5 |
| 13 | **T2 Anomaly detection** (heating active above setpoint → route to `heatingStuck`) | `tooHot` | SOP FAQ |
| 14 | **T3 Food safety severity thresholds** for refrigeration | `fridgeIssue` | General food safety guidance |
| 15 | **T1 Re-routing from `somethingElse`** before defaulting to free-text | `somethingElse` | SOP FAQ |

---

## Equipment Vocabulary -- Standard Reference

From the fire-up/fire-down schedules (21 appliance types across 10 sites):

| Equipment Name (Schedule) | OOH Flow | PowerPause Controlled? | Remotely Controllable? |
|--------------------------|----------|----------------------|----------------------|
| Fryer 1 / Fryer 2 | `kitchenEquip` | Yes (3P interlock) | Yes (Tuya) |
| Griddle 1 / Griddle 2 | `kitchenEquip` | Yes (3P interlock) | Yes (Tuya) |
| Chargrill (Electric) | `kitchenEquip` | Yes (3P interlock) | Yes (Tuya) |
| Chargrill (Gas) | `kitchenEquip` | Yes (3P interlock for ignition) | Yes (Tuya) |
| Heated Gantry | `kitchenEquip` | Yes (3P) | Yes (Tuya) |
| Heated Gantry with Baine Marie | `kitchenEquip` | Yes (3P) | Yes (Tuya) |
| Heat Lamps | `kitchenEquip` | Yes (1P or 3P) | Yes (Tuya) |
| Hot Cabinet | `kitchenEquip` | Yes (3P) | Yes (Tuya) |
| Salamander Grills | `kitchenEquip` | Yes (3P interlock) | Yes (Tuya) |
| Merry Chef | `kitchenEquip` | Yes (1P or 3P) | Yes (Tuya) |
| CoffeeMachine | `kitchenEquip` | Yes (1P) | Yes (Tuya) |
| Water Boiler | `kitchenEquip` | Yes (1P) | Yes (Tuya) |
| Dishwasher-1 | `kitchenEquip` | Yes (3P interlock) | Yes (Tuya) |
| Glasswasher-1 / -2 | `kitchenEquip` | Yes (3P interlock) | Yes (Tuya) |
| Extract Fan | `kitchenEquip` | Yes (3P) | Yes (Tuya) |
| Supply Fan | `kitchenEquip` | Yes (3P) | Yes (Tuya) |
| Outside Lights | **No flow** (needs `externalLighting`) | Yes (1P Tongou) | Yes (Tuya) |
| Jumbrella/External Heater | **No flow** (needs `externalLighting`) | Yes (1P Tongou) | Yes (Tuya) |

---

## Next Steps

1. Design and add T1 phone-guided scripts to existing flows (prioritise #1-4 from Must-Have list)
2. Create new `externalLighting` flow
3. Build scope determination into flow entry points
4. Design T3 handoff ticket template referencing diagnostic flow IDs
5. Validate T1 scripts with IoT team (Sam Day) before implementation

---

*Last updated: 25 March 2026*
