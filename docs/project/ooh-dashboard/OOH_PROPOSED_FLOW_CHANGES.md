# OOH Dashboard -- Proposed Flow Changes (v2)

**Created:** 25 March 2026
**Status:** Awaiting review
**Principle:** The OOH agent is NOT there to challenge the customer. They capture the reason, action the request within guardrails, and the IoT team sweeps it up on the next working day.

---

## Design Principles (confirmed by JB review)

1. **No hard "no" from OOH agents.** If the customer insists, the agent actions it, captures the reason, and the IoT team reviews next day.
2. **Soft pushback is OK.** "It's unlikely to impact in the next 15-30 minutes as the system heats up -- are you sure you want me to boost?" But if they say yes, do it.
3. **Escalation terminology must be 100% consistent across all flows.** Define once, use everywhere.
4. **Visual aids where possible.** Show images of PowerPause stickers, Salus thermostat screens, interlock panels in the triage UI so the handler can describe what to look for.
5. **Every ticket raised to the IoT support team must include structured handoff content** -- this is additive to the existing ticket spec, not replacing it.

---

## Escalation Model -- Single Route, Automatic Workflow

**All escalations route to IoT Support.** The OOH agent does not make routing decisions.

| What happens | How |
|-------------|-----|
| Ticket created | Automatically, with structured content from triage flow |
| Priority determined | Automatically, based on issue type and flow path taken |
| Workflow triggered | Automatically, based on priority |
| P1: SMS to escalation manager | Automatic |
| IoT team decides next step | They determine whether it's a site visit, GK Repairs referral, remote fix, etc. |

**The OOH agent's job ends at:** capture the information, action what they can within guardrails, escalate the rest. They never need to decide who it goes to or what priority it is.

**Where GK Repairs contact is mentioned in flows:** The agent can ADVISE the caller to also contact GK Repairs (0345 603 4566 / repairsadmin@greeneking.co.uk) for non-Lighthouse issues (e.g. appliance faults, boiler faults), but the ticket still goes to IoT Support regardless -- they sweep up and confirm.

---

## Available Visual Assets

| Image | Source | Shows | Use In Flow |
|-------|--------|-------|-------------|
| PowerPause info card/sticker | PowerPause Cheat Sheet (image1.png) | Blue card with Lighthouse/GK branding, QR code | `kitchenEquip`, `keepsTurningOff`, `ovensGrills` -- "Look for a sticker like this on the appliance" |
| Salus IT700 thermostat display | Salus Cheat Sheet (image1.png) | Thermostat screen showing 22.0C, Wi-Fi, battery, buttons | `tooCold`, `heatingStuck`, `controlsIssue` -- "Can you see a thermostat like this on the wall?" |
| Salus status icons (Wi-Fi, battery, flame, power) | Salus Cheat Sheet (images 2-9) | Individual icons for each indicator | `tooCold`, `controlsIssue` -- "Can you see these icons on the screen?" |
| IoT architecture diagram | Cloud Accounts email (image001.png) | Full stack: Support UI → ThingsBoard → Salus/Tuya/Boiler/Intesis | Internal reference only |
| **MISSING: Interlock panel photo** | Not in docs -- need from IoT team | Green light, green button, contactor | `kitchenEquip`, `keepsTurningOff` -- critical visual |
| **MISSING: Tongou switch photo** | Not in docs -- need from IoT team | Physical switch box for external lighting | `externalLighting` -- critical visual |
| **MISSING: Boiler panel / QR code** | Not in docs -- need from IoT team | Boiler panel with QR code sticker | `noHotWater` |

> **Action:** Request photos of interlock panel, Tongou switch, and boiler panel from IoT team (Sam Day or installation engineers). Check iAuditor reports for existing photos.

---

## Proposed Changes

### Change 1: `kitchenEquip` -- Add T1 phone-guided steps

**Add before current system checks:**

1. **[Show PowerPause sticker image]** "Is the appliance labelled with a PowerPause sticker like this?"
   - If NO → "This appliance isn't controlled by Lighthouse." → **Refer to GK Repairs** (0345 603 4566) → End
   - If YES or UNSURE → Continue

2. **[Show interlock panel image -- MISSING, request from IoT team]** "Can you see the interlock panel near the appliance? Is the green light on?"
   - If green light ON → "Press the green button. Did you hear a click? Did the appliance come on?"
     - Click + appliance on → Resolved → End
     - Click + appliance still off → "The power is reaching the appliance but it's not responding. This is an appliance fault." → **Refer to GK Repairs** → End
     - No click → "The contactor isn't engaging." → **Escalate to IoT Support** (contactor/wiring fault) → End
   - If green light OFF → "Check the MCB/fuse for that appliance on the distribution board."
     - MCB tripped → "Reset it and see if the green light comes on." → If yes, retry from step 2
     - MCB is on but no green light → **Escalate to IoT Support** (PowerPause hardware fault, green light off despite MCB on) → End
   - If no interlock panel visible / caller unsure → Proceed to T2 system checks

3. **T2: Current flow** (Tuya device status, schedule check, remote override)

---

### Change 2: `tooCold` -- Add T1 with soft pushback, no hard no

**Add at the start:**

1. "Is this for a pub area or accommodation?"
   - Routes to pub or accommodation branch

2. **Pub area branch:**
   - Proceed to T2: Pull live zone data (current temp vs setpoint)
   - If temp is at or close to setpoint: "The heating is working and the temperature is [X]C against a target of [Y]C. It may take 15-30 minutes to feel the impact -- are you sure you'd like me to boost it?"
   - If customer says yes: Boost +3C for 2hrs. Capture reason. Create review ticket.
   - If temp is significantly below setpoint and heating active: "The heating is running but hasn't reached target yet. I can boost the setpoint if you'd like?"
   - If temp is below setpoint and heating NOT active: Boost. Capture reason. Create review ticket.

3. **Accommodation branch:**
   - **[Show Salus thermostat image]** "Can you see a thermostat like this on the wall? Is the screen on?"
   - "Can you see a flame icon? Is it animated (moving)?" → Animated = actively heating
   - "What temperature is it showing? What's the target?" → If caller can read it, compare to live data
   - "Try pressing the up arrow. The maximum is 22C."
   - If self-service resolves → End
   - If not → T2 system checks
   - **Background rule:** If the setpoint in the system deviates from the standard template (22C for accommodation), flag this in the review ticket for the IoT support team: "Note: setpoint at this site is [X]C, which differs from the standard 22C template. Review required."

---

### Change 3: `noHotWater` -- Soft pushback, capture reason, action it

**Add at the start:**

1. "What time does the site open today?" → System checks expected HW start time (1hr before opening)
   - If calling before expected HW time: "Hot water is scheduled to start at [time]. You're calling a bit ahead of that. Can I ask why you need it earlier?" → Capture reason → Action the boost/switch-on → Create review ticket noting early request + reason
   - If calling after expected HW time: Proceed to T2

2. "Is this for the pub or accommodation?" → Note in ticket (accommodation HW may come from pub system)

3. "Can you see the boiler? Is there a pilot light on? Any error codes on the display?"
   - If boiler visibly faulty (no pilot, error code): "This looks like a boiler issue rather than the Lighthouse system. I'll log this and refer it to the right team." → Capture error code → **Refer to GK Repairs** for boiler + **Escalate to IoT Support** if there's a Lighthouse angle
   - If boiler looks fine or caller can't check → T2 system checks (ThingsBoard boiler status)

---

### Change 4: `keepsTurningOff` -- Add T1

**Add before current flow:**

1. "When the equipment turns off, does the green light on the interlock panel go off too?"
   - Green light goes off → Schedule or PowerPause issue → Proceed to T2 schedule check
   - Green light stays on but equipment off → "The power is still being delivered by Lighthouse, but the appliance itself isn't running. This is an appliance fault." → **Refer to GK Repairs** → End

2. "Is it just one appliance or are multiple things turning off?"
   - Multiple → "This could be a site power issue at the distribution board level rather than Lighthouse." → **Refer to site** to check DB → If persists, **Escalate to IoT Support**

3. "Is it happening at roughly the same time each day?"
   - Yes → Likely schedule issue → T2 schedule check
   - Random → T2 device status check → likely intermittent fault → **Escalate to IoT Support**

---

### Change 5: `ovensGrills` -- Add scope check, route correctly

**Replace "not remotely controllable" with:**

1. **[Show PowerPause sticker image]** "Is the appliance labelled with a PowerPause sticker?"
   - YES → Route to `kitchenEquip` flow (it IS remotely controllable)
   - NO → "This appliance isn't controlled by Lighthouse. Advise site to check power/gas and contact GK Repairs." → **Refer to GK Repairs** (0345 603 4566) → End
   - UNSURE → "Can you see any small switch boxes or panels near the appliance with a green light?" → If yes, route to `kitchenEquip`. If no → **Refer to GK Repairs** → End

---

### Change 6: `heatingStuck` -- Add T1

**Add at the start:**

1. "Is this a pub area or accommodation?"

2. **Accommodation:**
   - **[Show Salus thermostat image]** "Can you press and hold the OK button on the thermostat for 3 seconds? This puts it into standby mode and should stop the heating."
   - If resolved → End (still create review ticket for IoT team)
   - If not → T2 system checks

3. **Pub area:**
   - "Are the radiators hot to the touch even though it should be off?"
   - If hot but system shows heating off → "This is likely a stuck zone valve -- a physical issue rather than the Lighthouse system. I'll log this for the IoT team to review, but the site may also want to contact their heating maintenance contractor." → **Escalate to IoT Support** + **Refer to GK Repairs** → End
   - If system shows heating still actively calling → T2 remote setpoint reset

---

### Change 7: `controlsIssue` -- Add T1

**Add at the start, branching by control type:**

1. **Salus thermostat blank/unresponsive:**
   - **[Show Salus thermostat image]** "Is there a micro-USB port on the side? Try plugging in a phone charger cable."
   - "Press and hold OK for 3 seconds."
   - If screen comes on → walk through status icons (Wi-Fi, battery, flame) → Resolved or continue
   - If still blank → **Escalate to IoT Support** (Salus hardware fault)

2. **Interlock panel not responding:**
   - Same as `kitchenEquip` T1 steps (green light check, MCB check)

3. **Boiler panel error code:**
   - "Can you read the error code to me?"
   - "Is there a QR code on the boiler panel? Can you scan it?" → Capture info
   - **Escalate to IoT Support** with captured details

---

### Change 8: `fridgeIssue` -- Add scope clarification

**Add at the very start:**

1. "Lighthouse monitors fridge and freezer temperatures but doesn't control them -- we can see the temperature readings but can't turn anything on or off remotely."
2. "Has a door been left open? Can you check?"
3. "What temperature is the display on the unit showing?"
4. T2: Check ThingsBoard sensor data to confirm readings, show trend
5. T3: **Escalate to IoT Support** with temperature data. If temp >8C (fridge) or >-15C (freezer) for extended period, flag as food safety concern in ticket.

---

### Change 9: New flow -- `externalLighting`

**New flow for outside lights, festoon lighting, outdoor heaters:**

1. T1: "Can you see a small switch box near the lighting circuit?" **[Show Tongou image -- MISSING]**
2. T1: "Is there a manual override button? Try pressing it." → If lights come on → Resolved → End
3. T1: "Check the MCB/fuse for the lighting circuit on the distribution board."
4. T2: Check Tuya device status (online/offline). Check schedule for "Outside Lights" at this site.
   - Device online + within schedule → Override → Resolved
   - Device online + outside schedule → Override → Create review ticket
   - Device offline → **Escalate to IoT Support** (connectivity or hardware fault)
5. T3: If no power to switch despite MCB on → **Refer to GK Repairs** (electrical fault) + notify IoT Support

---

### Change 10: `wontTurnOn` -- Add total power failure check

**Add before "what type?" routing:**

1. "Is ANYTHING else working in the building -- lights, tills, other equipment?"
   - Nothing working → "This sounds like a site power issue rather than Lighthouse. Can you check the main fuse board?" → **Refer to site** → If unresolved, **Refer to GK Repairs** (electrician) → End
2. Then proceed to "what type?" routing as current

---

### Change 11: Structured handoff -- ADDITIVE to existing ticket spec

**This does NOT replace the current escalation ticket content. It ADDS the following fields to whatever the flow already captures:**

| Field | Content | Source |
|-------|---------|--------|
| T1 Checks Completed | List of phone-guided steps the handler completed with the caller | Auto-populated from flow steps completed |
| T1 Findings | What the handler observed/was told (e.g. "green light off, MCB on", "Salus showing no Wi-Fi icon") | Handler input during T1 |
| Suggested Diagnostic Flow | Reference to the specific R1-R9 flow the IoT team should start from (e.g. "R3 -- R10A gateway offline") | Auto-suggested based on flow path taken |
| What's Been Ruled Out | Summary of what the handler has already checked (e.g. "MCB checked and on, interlock panel has no green light") | Auto-populated from T1/T2 steps |
| Non-LH Referral Made | Whether the handler also referred the site to GK Repairs or their own contractor, and for what | Handler input if applicable |

> This is appended to the existing ticket fields (caller details, site, issue category, priority, agent notes, pocket change details, etc.)

---

### Change 12: `somethingElse` -- Add re-routing and contractor detection

**Before defaulting to free-text:**

1. "Is there a contractor currently on site who needs something from us?"
   - YES → Capture: contractor name, company, what they need, their phone number → **Escalate to IoT Support** as priority (contractor waiting on site) → End
2. "Can you tell me a bit more? Is it related to heating, kitchen equipment, lighting, hot water, or something else?"
   - If matches a known category → "Let me take you through our [heating/kitchen/etc.] checks" → Route to that flow
   - If genuinely doesn't match → Free-text capture → **Escalate to IoT Support** → End

---

## Changes NOT being made (confirmed)

| Flow | Reason |
|------|--------|
| `tooHot` | Adequate as-is. Will inherit pub/accommodation branch from `tooCold` logic. No hard "no" needed -- if someone says it's too hot and temp is normal, we still capture and action. |
| `acColdWarm` / `acWarmCool` / `acWontOff` | Handlers genuinely cannot change AC modes/setpoints. Capture and escalate is correct. Will add T3 handoff referencing R1/R2. |
| `wontTurnOnFridge` | Monitoring only. Current escalation is correct. Inherits scope clarification from Change 8. |

---

*Awaiting JB review before implementation.*
