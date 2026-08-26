# OOH Capability Analysis — What the Handlers Need to Be Able to Do

**Project:** Zendesk OOH Dashboard
**Date:** 21 March 2026
**Author:** James Brown / Digital Delivery (analysis by Claude Code)
**Sources:** Teams chat (14 Dec 2025 – 17 Mar 2026, ~900 lines), WhatsApp chat (5 Jan – 17 Mar 2026, ~383 messages)

---

## Purpose

The initial findings document (18 Mar 2026) classified OOH contacts by **issue type** (heating too cold, lighting not working, etc.). This document re-analyses the same data from a different angle: **what capability does the OOH handler need** to resolve each contact without escalating to the IoT team?

The goal is to identify and prioritise the discrete system capabilities that, if given safely to the OOH handler, would eliminate the hand-off to the IoT team for that contact.

---

## Methodology

Every incident in both chats was classified by the **minimum capability required** for the OOH handler to have resolved it independently. Where an incident required multiple capabilities, the primary (blocking) capability was counted. Duplicate incidents appearing in both Teams and WhatsApp were counted once.

---

## Capability Classification

### C1: Adjust Heating Setpoint (Up or Down)
**Count: 24 incidents**

The single highest-volume capability. Site calls to say it's too hot or too cold. The IoT team logs in, checks the current temperature vs setpoint, and raises or lowers the setpoint — typically a 30-second job once you're in the system. The OOH handler has no access to do this.

| # | Site | House ID | Issue | Source |
|---|------|----------|-------|--------|
| 1 | Old Grey Mare | 6832 | Flat heating too cold, needed override for hotel room | WA 05/01 |
| 2 | Mill House | 6360 | Heating too high, pub too hot, doors open | T 15/12 |
| 3 | Gosling Bridge Inn | 6804 | Want heating turned back up after engineer turned it down | T 16/12 |
| 4 | Fox Hunters | 6795 | 24°C and radiators still on | T 23/12 |
| 5 | Shuttle & Loom | 7971 | Pub freezing, want heating up (was already at setpoint) | T+WA 06/01 |
| 6 | Robin Hood | 6851 | Customers eating in coats, too cold | T+WA 06/01 |
| 7 | Bull & Anchor | 0220 | Want heating turned up | T+WA 08/01 |
| 8 | Devon | 7714 | No heating, people complaining of cold | T 30/12 |
| 9 | Roundell | 6856 | Too hot, drop to 22 or turn off for a couple hours | T 08/02 |
| 10 | Badger Box | 4631 | Too hot, doors and windows open | T 11/02 |
| 11 | Fox Hunters | 6795 | No heating, pub freezing (2nd incident) | T+WA 10/02 |
| 12 | 6716 (unnamed) | 6716 | No heating, check before they call GK | T 13/02 |
| 13 | Whistling Goose | 6886 | Heating not working in zone 3 | T+WA 18/02 |
| 14 | Harvester Mouse | 6334 | Far too hot, "stood in their pants" (gateway fallback) | WA 24/02 |
| 15 | Angel Inn | 6749 | Evenings getting hotter, wants temp down (1st call) | T 23/02 |
| 16 | Angel Inn | 6749 | Same issue, called again (2nd call) | T+WA 27/02 |
| 17 | Ridgeway Arms | 6849 | Heating won't go off, pub boiling since last night | T+WA 28/02 |
| 18 | Starting Gate | 7043 | Turn heat up a few degrees | WA 06/03 |
| 19 | Robin Hood | 6851 | Heating turned up to 18 degrees (2nd incident) | WA 06/03 |
| 20 | Mill House | 6360 | Accommodation at 5°C, thermostat won't go above 21 | WA 10/03 |
| 21 | Rose & Crown | 6855 | Radiators turned off, guests complaining cold | WA 10/03 |
| 22 | 6835 (unnamed) | 6835 | Half heating not working, only one thermostat active | WA 28/02 |
| 23 | Wheatsheaf | 6885 | No heating in accommodation, children under 5 | T+WA 16/03 |
| 24 | Harrier | 4331 | Want heating off permanently (BDM question) | T+WA 17/03 |

**Resolution pattern:** Check current temp vs setpoint → adjust setpoint up/down → confirm change has taken effect.

**Nuance:** 3 of these (Harvester Mouse, Whistling Goose flow temps, Devon wifi) had underlying technical issues the handler couldn't have resolved with setpoint access alone. But the initial triage — checking the setpoint and current temp — would still have been valuable, letting the handler tell the site "heating is running, the issue may be with the building" rather than "I'll get someone to look at it."

**BDM approval edge case:** Harrier 4331 and Mill House 6360 accommodation both touched on whether BDM approval was needed. Any setpoint capability needs clear guardrails on when it's a handler decision vs a BDM escalation.

---

### C2: Override / Power On Kitchen Equipment
**Count: 16 incidents**

The second highest-volume capability. Sites or contractors call because kitchen equipment (fryers, glasswashers, dishwashers, extractors, Merrychef, coffee machines) hasn't come on when expected, or has turned off during service. The IoT team either triggers a remote override or adjusts the schedule. The OOH handler cannot do either.

| # | Site | House ID | Issue | Source |
|---|------|----------|-------|--------|
| 1 | Donkey Derby | 6786 | Glasswashers needed for hygiene visit | T 17/12 |
| 2 | Bay Horse | 6750 | No power to glass/dishwash, LH box red | T 24/12 |
| 3 | Charnwood Arms | 6293 | Fryers off, innovation site (no schedules?) | T 24/01 |
| 4 | Robin Hood | 6851 | Both grills gone off after schedule change | T+WA 09/02 |
| 5 | Sailmaker | 6600 | Fryers and Merrychef not on, told not to override | T 21/02 |
| 6 | 6851 (Robin Hood) | 6851 | Need fans on for Monday FMC engineer | T 06/02 |
| 7 | Coppice Wood Farm | 5794 | Extractor fans not turning on | T 17/01 |
| 8 | 6720 (unnamed) | 6720 | SCC engineer on site, override not till 10:30 | T 04/03 |
| 9 | Brentwood | 6759 | Kitchen electric not on at 6:45, hotel needs breakfast | T+WA 17/03 |
| 10 | Bay Horse | 6750 | Fans, Merrychef, coffee, fryers not on | T+WA 17/03 |
| 11 | Corner House | 6781 | Extractor fans need extra hour | WA 08/02 |
| 12 | Bowers | 6758 | No power to any equipment (schedule was 7-8) | WA 03/02 |
| 13 | Harrier | 4331 | All gas & electric including washing machine at 7:30am | WA 17/02 |
| 14 | Bridge Inn | 6761 | Fryer/grill turning off earlier than agreed | WA 09/03 |
| 15 | Rodmill | 6852 | Fryers all gone off | WA 13/03 |
| 16 | Corner House | 6782 | No electric kitchen equipment, LH box not on | WA 14/03 |

**Resolution pattern:** Check device status in Tuya/Lighthouse → trigger override → confirm power restored. OR check schedule → see it's wrong → adjust.

**Critical sub-category: "Business critical" equipment during service** — grills, fryers, and extractors going off mid-service (Robin Hood grills, Sailmaker fryers, Rodmill fryers) are time-critical. A 10-minute delay waiting for the IoT team can mean a kitchen shutdown.

**Nuance:** Some of these (Bay Horse red box, Donkey Derby GK wifi issue) had underlying connectivity problems where a remote override wouldn't have worked. But the handler checking "is the device online? Can I override?" would still be the correct first step and would surface the real issue faster.

---

### C3: External Lighting Control (On/Off/Override)
**Count: 9 incidents**

Sites call because outdoor/festoon/car park lights haven't come on. The IoT team checks the Tongou/power pause device status and either triggers it remotely or asks the site to press the manual override button on site.

| # | Site | House ID | Issue | Source |
|---|------|----------|-------|--------|
| 1 | Angel Inn | 6749 | No outside lighting | T+WA 26/01 |
| 2 | Mill House | 6360 | Outdoor lighting, repeat caller | T+WA 27/01 |
| 3 | Hill Top | 6810 | Outside lights and heaters not working | T+WA 05/02 |
| 4 | Brinkburn | 6763 | Car park lights not on | T+WA 11/02 |
| 5 | Ridgeway Arms | 6849 | External lights not turning off | T 10/02 |
| 6 | Starting Gate | 7043 | Outside lights not working, pub looks shut | WA 17/02 |
| 7 | Whitehills | 6888 | Festoon lighting and outdoor heaters | T+WA 03/03 |
| 8 | Mill House | 6360 | Still no outdoor lighting (3rd call) | T 27/01 |
| 9 | Bull | 6764 | LH unit lights flashing, dishwasher cutting off | T 14/02 |

**Resolution pattern:** Check power pause device status → trigger remote switch OR guide site to press manual override button on the Tongou device.

**Nuance:** Several of these turned out to be electrical faults (Brinkburn — no power to Tongou, Hill Top — fuse tripped). The handler having visibility of device status (online/offline/power) would allow them to immediately distinguish "device is offline = electrical fault, tell site to check fuse board" from "device is online but schedule is wrong = I can fix this."

---

### C4: Scope Determination — "Is This Ours?"
**Count: 11 incidents**

The OOH handler receives a call and cannot determine whether the issue falls under Lighthouse scope. They post to the chat, wait for confirmation from the IoT team, and relay the answer. In many cases, the answer is "not ours" — meaning the entire escalation was unnecessary.

| # | Site | House ID | Issue | Outcome | Source |
|---|------|----------|-------|---------|--------|
| 1 | Polite Vicar | 6841 | Merlin 2000S gas interlock panel not on | Not LH — electrical fault | T 08/02 |
| 2 | Rose & Crown | 6855 | Dishwasher leaking after sensor install | Not LH — dishwasher fault | T 15/01 |
| 3 | Water Tower | 6883 | No heating/HW, wifi box red, boiler co blamed LH | Not LH — boiler PCB fault | WA 15/01 |
| 4 | Rovers Tye | 6857 | Bathroom lights tripping | Not LH — electrical/contractor | WA 30/01 |
| 5 | Quakerwood | 6845 | Water too hot, boiler co said "LH job" | Partially LH (setpoint 60°C) but mostly boiler | T+WA 03/03 |
| 6 | Bull | 6764 | Boiler issues, GK told "controlled by LH" | Partially LH (schedule) but boiler fault too | T+WA 27/02 |
| 7 | Hinkley Knight | 6811 | Boiler not working, electric box not working | Not LH — electrical/boiler | T 17/01 |
| 8 | Lamb Inn | 6813 | No hot water, green lights flashing on boiler | Unclear — CJ spoke with site | T+WA 28/02 |
| 9 | Fox & Crown | 6793 | No power to anything | Power cut — not LH | WA 25/02 |
| 10 | Bowman | 6758 | Boiler pilot light blew out | Not LH — boiler fault | WA 12/03 |
| 11 | Starting Gate | 7043 | Signage not working (expected at 4:30) | Pre-existing fault, not LH | WA 17/02 |

**Resolution pattern:** Look up site scope ("what does Lighthouse control here?") → if the reported issue falls outside scope → advise site to contact GK repairs/relevant contractor. If in scope → proceed with normal triage.

**Why this is a capability, not just information:** The OOH handler needs a definitive, per-site reference that says "At site X, Lighthouse controls: heating zones 1-3, external lighting, kitchen power pause for: fryers, glasswashers." Without that, they're guessing — and sites/contractors regularly blame Lighthouse for things it doesn't control.

---

### C5: Contractor On-Site Coordination
**Count: 8 incidents**

A contractor (Bellrock, DPP, Nadach, SCC, or internal) is physically on site and needs the IoT team to do something — usually override a device, provide system access, or explain what Lighthouse controls. The cost of delay is the contractor's time and potentially leaving a job incomplete.

| # | Site | House ID | Contractor | Issue | Source |
|---|------|----------|------------|-------|--------|
| 1 | White Horse | 6997/6887 | DPP | Need BMS access for heating override | T+WA 06/01 |
| 2 | Polite Vicar | 6841 | Nadach | On site, don't know what to do | T+WA 10/02 |
| 3 | Brentwood | 6759 | Bellrock | Emergency hot water, need LH system info | T+WA 18/02 |
| 4 | 6720 (unnamed) | 6720 | SCC | Override not active till 10:30, engineer waiting | T 04/03 |
| 5 | Two Steeples | — | Internal | Contactor installed, firmware not updated, gas cutting off every 15 min | WA 09/02 |
| 6 | Linwood Farm | 5206 | Boiler service | Boiler being serviced, engineer needs IoT support | T+WA 05/03 |
| 7 | Donkey Derby | 6786 | Hygiene visit | Need glasswashers on for contractor | T+WA 28/01 |
| 8 | Bowman | 6758 | Engineer | Boiler repaired, need LH controls re-enabled | WA 12/03 |

**Resolution pattern:** This is the hardest category to fully automate. The handler needs to either: (a) override the relevant device themselves so the contractor can proceed, or (b) immediately connect the contractor to the IoT team if the issue is more complex.

**What would help:** If the handler could perform C2 (equipment override), roughly half of these would be self-service (6720, Donkey Derby, Bowman). The remainder (Nadach not knowing scope, Bellrock needing system discussion, Two Steeples firmware) genuinely require IoT team involvement — but a priority escalation flag would ensure faster response.

---

### C6: Hot Water Override/Control
**Count: 7 incidents**

Distinct from heating setpoint adjustment. Sites report no hot water or water too hot. Resolution usually involves checking the DHW schedule, overriding the domestic hot water valve, or confirming the boiler is the issue.

| # | Site | House ID | Issue | Source |
|---|------|----------|-------|--------|
| 1 | Rosedene | 7949 | No heating or hot water, repeat caller | T 16/12 |
| 2 | Devon | 7714 | No heating (wifi issues underlying) | T 30/12 |
| 3 | Quakerwood | 6845 | Water too hot, boiler company said LH job | T+WA 03/03 |
| 4 | Bull | 6764 | No hot water or heating, flat and kitchen | T+WA 27/02 |
| 5 | Lamb Inn | 6813 | No hot water, boiler lights flashing | T+WA 28/02 |
| 6 | Bent Brook | 7634 | No hot water | WA 09/03 |
| 7 | Polite Vicar | 6841 | No hot water, no heating, chefs can't wash up | WA 11/03 |

**Resolution pattern:** Check DHW status → override if schedule/valve issue → if boiler fault, advise site to call boiler contractor.

**Overlap:** Several of these overlap with C4 (scope determination) because the handler first needs to know whether hot water is even under Lighthouse control at the site.

---

### C7: Schedule Viewing / Verification
**Count: 5 incidents**

The handler or site needs to know what the current schedule is — what time does equipment come on/off? This is currently invisible to the OOH handler. They can't even tell the site "your fryers are set to come on at 8am" without asking the IoT team.

| # | Site | House ID | Issue | Source |
|---|------|----------|-------|--------|
| 1 | Old Grey Mare | 6832 | Pot wash until 11pm, handler mentioned override email | T 23/12 |
| 2 | Sailmaker | 6600 | Site told not to use override, Merrychef set for 8:50 | T 21/02 |
| 3 | Bridge Inn | 6761 | Turning off at 8:30, agreed was 8:45/9:15 | WA 09/03 |
| 4 | Bowers | 6758 | No power — schedules were between 7 and 8 | WA 03/02 |
| 5 | Charnwood Arms | 6293 | Innovation site, claims no timings should apply | T 24/01 |

**Resolution pattern:** Look up current schedule for device/site → confirm with caller → if schedule is wrong, adjust or escalate.

**Why this matters:** If the handler can see "your Merrychef is set to come on at 08:50," they can tell the site immediately instead of posting to the chat and waiting. Many C2 incidents start as schedule queries.

---

### C8: Device/Connectivity Status Visibility
**Count: 5 incidents**

The handler needs to know whether the Lighthouse hardware is actually online and functioning. Red lights, offline gateways, and Tuya devices dropping off the system are invisible to the OOH handler.

| # | Site | House ID | Issue | Source |
|---|------|----------|-------|--------|
| 1 | Bay Horse | 6750 | LH box red, no green light | T 24/12 |
| 2 | Bull | 6764 | LH unit flashing green/amber/red | T 14/02 |
| 3 | White Horse | 6887 | No power to half kitchen, override not working | T 04/02 |
| 4 | Harvester Mouse | 6334 | Dragino gateway down, fallback mode | WA 24/02 |
| 5 | Brinkburn | 6763 | No power to 2/3 Tongou devices — electrical fault | WA 11/02 |

**Resolution pattern:** Check device status (online/offline, last seen, signal strength) → if offline, guide site to check fuse board/power → if online, proceed with override/setpoint change.

**Why this matters:** Connectivity issues cannot be resolved by the handler. But knowing that a device is offline means the handler can immediately tell the site "there's a hardware/power issue — please check your fuse board" or "this needs an engineer visit," rather than waiting for the IoT team to diagnose what the handler could have seen themselves.

---

### C9: Callback/Follow-Up Tracking
**Count: 4 incidents**

The handler promises a callback, but there's no mechanism to track it. The IoT team doesn't know a callback was promised, and the handler can't confirm it happened.

| # | Site | House ID | Issue | Source |
|---|------|----------|-------|--------|
| 1 | Devon | 7714 | Called twice in one evening, 2nd call unanswered | T 02/01 |
| 2 | Ridgeway Arms | 6849 | VM left, Tony picked up next morning by chance | T 10/02 |
| 3 | Coppice Wood Farm | 5794 | CJ couldn't get through, left VM | T 17/01 |
| 4 | Wheatsheaf | 6885 | Kellie promised callback re wifi box | T+WA 16/03 |

**Resolution pattern:** Log callback required → make visible to IoT team and next-shift OOH handler → confirm completed.

---

### C10: New Site/Client Awareness
**Count: 2 incidents**

The OOH handler receives a call from a site type they didn't know existed in the Lighthouse estate. They have no briefing, no context, and no idea what to do.

| # | Site | Issue | Source |
|---|------|-------|--------|
| 1 | Meridian McDonalds | Kelly didn't know McDonalds was on Lighthouse | WA 03/03 |
| 2 | Charnwood Arms | Innovation site, handler didn't know what that meant | T 24/01 |

**Resolution pattern:** Broadcast/notice system where IoT management push site updates before OOH shifts.

---

## Priority Summary — Capabilities Ranked by Volume

| Rank | Capability | Count | % of All Incidents | Self-Service Potential |
|------|-----------|-------|--------------------|-----------------------|
| 1 | **C1: Adjust Heating Setpoint** | 24 | 26% | HIGH — read temp, adjust setpoint within guardrails |
| 2 | **C2: Override/Power On Kitchen Equipment** | 16 | 17% | HIGH — trigger override on known devices |
| 3 | **C4: Scope Determination** | 11 | 12% | HIGH — per-site scope reference eliminates guesswork |
| 4 | **C3: External Lighting Control** | 9 | 10% | HIGH — same override mechanism as C2 |
| 5 | **C5: Contractor On-Site Coordination** | 8 | 9% | MEDIUM — half resolvable via C2, half need IoT team |
| 6 | **C6: Hot Water Override** | 7 | 8% | MEDIUM — DHW override possible, but often boiler fault |
| 7 | **C7: Schedule Viewing** | 5 | 5% | HIGH — read-only, zero risk |
| 8 | **C8: Device Status Visibility** | 5 | 5% | HIGH — read-only, zero risk, enables faster triage |
| 9 | **C9: Callback Tracking** | 4 | 4% | HIGH — workflow feature, no system integration needed |
| 10 | **C10: Site/Client Awareness** | 2 | 2% | HIGH — broadcast/notice feature |

**Total incidents analysed: ~91 unique contacts across both channels.**

---

## Key Insight: The "Self-Service Stack"

If the OOH handler had just four capabilities:

1. **See** the current temperature, setpoint, and device status (read-only)
2. **Adjust** the heating setpoint within pre-set guardrails (e.g. ±3°C, max 24°C)
3. **Trigger** a device override (kitchen equipment, lighting) for a defined duration
4. **Look up** what Lighthouse controls at each site

They could have resolved approximately **60 of 91 incidents (66%)** without any IoT team involvement.

The remaining 34% genuinely need the IoT team — device faults, complex boiler interactions, contractor coordination on non-standard issues, firmware/connectivity problems. But even these would benefit from the handler being able to triage and provide richer information in the escalation rather than "site X called about heating."

---

## Patterns Worth Noting

### Repeat Sites (Chronic Callers)
These sites appear 3+ times across both channels:

| Site | House ID | Incidents | Primary Issues |
|------|----------|-----------|---------------|
| Mill House | 6360 | 4 | Outdoor lighting, accommodation heating |
| Angel Inn | 6749 | 3 | Lighting, heating temperature |
| Robin Hood | 6851 | 3 | Heating, grills off, fans for engineer |
| Fox Hunters | 6795 | 2 | Heating not working |
| Polite Vicar | 6841 | 3 | Gas interlock (not LH), Nadach callout, no HW |
| Brentwood | 6759 | 3 | Hot water, kitchen electric, contractor |
| Bay Horse | 6750 | 2 | LH box red, equipment not on |
| Rosedene | 7949 | 2 | No heating/HW, data quality issues |
| Devon | 7714 | 2 | No heating, wifi issues |
| Bull | 6764 | 3 | LH unit flashing, boiler/HW, equipment |

### Time-of-Day Pattern
- **17:00–19:00** is the peak window — most contacts arrive as the OOH shift starts and the IoT team has finished for the day
- **06:30–08:30** is a secondary peak — hotel/breakfast sites needing equipment on before the IoT team starts
- Weekend contacts are lower volume but higher urgency (no IoT team available at all)

### The "Blame Lighthouse" Pattern
At least 6 incidents involved contractors or site staff blaming Lighthouse for issues that weren't related to the IoT system. This creates unnecessary escalations and reputational damage. A scope lookup tool would let the handler confidently say "this isn't controlled by our system" during the call.

### The Equipment Override Paradox
Some sites have been told **not** to use their local override buttons (Sailmaker 6600 — "had an email telling him off"). This means the site is dependent on the IoT team to do something they could technically do themselves on-site. The dashboard should clarify which sites have local overrides and whether they're approved for use.

---

## What This Means for Solutioning

This analysis doesn't prescribe the solution — that's the next step. But it does tell us:

1. **C1 + C2 + C3 together account for 49 of 91 incidents (54%)** — all three are "check status, then toggle/adjust a value." They likely share a common UX pattern.
2. **C4 (scope) is a force multiplier** — it doesn't resolve incidents on its own, but it prevents unnecessary escalations and enables faster resolution across all other capabilities.
3. **C7 + C8 (schedule view + device status) are read-only and zero-risk** — they could be shipped as a first phase with no write access, giving handlers visibility immediately.
4. **C9 + C10 are workflow features** — no IoT system integration needed, just a clean UI for tracking callbacks and broadcasting notices.

---

## Appendix: Incidents Not Classified Above

A small number of contacts don't fit neatly into a single capability:

- **Two Steeples (WA 09/02):** Installation fault — contactor firmware not updated, gas cutting off every 15 mins. This is an install/engineering issue, not an OOH capability gap.
- **Credential sharing (WA 09/02):** Lighthouse login and WiFi password shared in plain text. This is a security issue flagged in initial-findings.md — credentials should be rotated.
- **CJ's request to copy messages (T 21/02):** Process issue — two channels, no coordination. The dashboard replaces both channels.
- **Power cuts (Fox & Crown 6793):** Not an IoT issue. Handler would benefit from C8 (device status) to confirm "everything looks fine on our end."

---

*Next step: Validate these capability classifications with Sam Day and the OOH team, then prioritise which capabilities to build first based on volume, self-service potential, and implementation complexity.*
