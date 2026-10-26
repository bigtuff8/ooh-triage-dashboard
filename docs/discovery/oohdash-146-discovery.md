# OOHDASH-146 Discovery Gate — Apply agent-screen standard to all remaining flows

gate:contract
SECTION: What this discovery covers
OOHDASH-146 applies the agent-screen standard set in OOHDASH-144 to every flow the pub heating build did not touch: hot water, kitchen, lighting, extractor fans, fridges and freezers, contractor, connectivity, something else, aircon, and Salus heating (iT700 and iT500). It also covers the callback drawer, the Tonight view, the ambiguous-site screen, the generic device-control modal (the Salus setpoint and frost controls), and the chip label shown for heating-boost tickets in the Tonight view and the IoT Support Dashboard. The IoT Support Dashboard change is kept as a separate small change with its own gate trail.

SECTION: Universal structural gap — applies to every flow
None of the flows above has been migrated to the v1.6.0 standard. The four shared helpers — outcomeCaptured, outcomeP1, outcomeScope, and outcomeNoAction — were written before OOHDASH-144 and still render a hardcoded h3 headline, a legacy script block (not a .say block labelled "Say to the customer"), and no Check-and-log step: the ticket fires immediately when the outcome is reached. Every terminal outcome in every flow inherits these three gaps. The structural fix is one refactor of those four helpers, which then propagates across all flows simultaneously. The full count is 30 or more outcome renderings and around 25 intermediate script-divs to convert.

SECTION: Contradictions that need fixing first
Six contradictions were found. Two are in the kitchen flow: verdicts B-unscheduled and B-outside both copy a script that says "the schedule confirms it should be" but their own labels describe a device with no schedule or one running outside its schedule — an agent reading either script aloud gives factually wrong information. One is in the fridge flow: outcomeScope hardcodes the headline "Not on Lighthouse at this site" for a "just a query" call, but fridges are monitored by Lighthouse; only control is unavailable, so the headline is wrong. A fourth and fifth are the same outcomeScope mis-routing problem in two other flows: the "something else — scope: monitored" path and the Salus heating buildheat path both render "Not on Lighthouse" for a device that is online and actively reporting. The sixth is in the generic device-control release path: the script in ctlRelease always says "I've logged it" even when the ticket API call failed, meaning the agent reads a false claim to the customer.

SECTION: Glossary violations across all flows
Three types of prohibited word account for the bulk of the violations. "Caller" appears in around 37 agent-visible locations across every flow and the callback drawer, the Tonight query modal, and the app search messages. "Override" (and "overridden") is pervasive in the contractor flow (9-10 locations) and appears in the lighting flow, the kitchen flow, and the hot water DHW headlines. "Setpoint" and "frost-hold" are concentrated in the Salus heating branch and the generic device-control modal: "setpoint" in 9 visible locations, "frost-hold" in 5. The explicitly banned phrase "Hold active: reverts at" appears verbatim in the control tracker. "Boiler panel" appears in every hot-water DHW explanation variant. Device IDs are shown on screen in both the lighting and the fan switchable-circuit cards.

SECTION: Chip gaps in the Tonight view and IoT Support Dashboard
The Tonight view OUTCOME_CHIP map and the IoT Support Dashboard OUTCOME_LABELS map both lack the boiler-boost key. Boost tickets therefore show the raw code "boiler-boost" as the chip label instead of a human-readable phrase. The Tonight-view change (views.js) is part of this ticket. The IoT Support Dashboard change (services/ooh-review.js in the iot-support-dashboard repo) is a separate small change with its own gate trail.

SECTION: Functional defect found during discovery
The background control watcher startCtlBgWatch fires the "not confirmed yet" toast every 15 seconds from roughly 2 minutes onward, without ever latching. For a device that stays in an indeterminate state it can fire around 370 times before the 95-minute timeout. The fix is one boolean flag that suppresses repeat fires after the first notification.

SECTION: Overlap with OOHDASH-147 and 148
OOHDASH-148 may change site-load order and call handling. OOHDASH-146 is kept to screen wording and logging only. Any conflict would surface in the design gate after 148 discovery lands.

SECTION: Questions graded after this discovery
All technical facts were verified against live source (main, bce76b0 = v1.6.0). No third-party questions remain open. Questions needing James answers are the four scope decisions below.

Q1 — Do any non-heating flows already use the v1.6.0 .say or wrapUpStep pattern? PROVEN no — zero non-heating flows have been migrated. Confirmed by reading every FLOWR renderer and the four shared helpers.

Q2 — Are there 37 or more visible "caller" occurrences on screen? PROVEN — 53 total across flows.js, control.js, views.js, and app.js.

Q3 — Is boiler-boost absent from both OUTCOME_CHIP and OUTCOME_LABELS? PROVEN — confirmed by reading views.js lines 491-504 and ooh-review.js lines 117-123.

Q4 — Does ctlRelease always claim "I've logged it" even when the ticket fails? PROVEN — the outcome HTML is assembled outside the try/catch at control.js lines 285-288 before the ticket API returns.

Q5 — Does outcomeScope hardcode "Not on Lighthouse" regardless of monitored vs unmonitored? PROVEN — the headline is hardcoded in the function at flows.js lines 411-414, not passed as a parameter.

Q6 — Is there any OOHDASH-148 overlap that affects 146 scope? DEDUCED no overlap — 148 targets site-load and call handling, 146 targets only screen wording and logging.

Q7 — Would fixing the four shared helpers break any existing test? DEDUCED safe — tests check testid attributes which stay; a change to .script becoming .say would correctly fail old assertions on new code (the lesson from 144).

Q8 — Does the contractor "override button" refer to a labelled physical button on the PowerPause device? UNRESOLVED — see Decision 3.

DECISION: One release or phased by flow | One release for all flows (recommended) | Phased — publish flows in batches
DETAIL: One release keeps wording consistent across all flows on the same night and matches how v1.6.0 shipped. Phasing reduces per-release risk but extends the period where some flows say "customer" and others say "caller" within the same shift.

DECISION: Does generic device control move to Check and log | Apply .say and glossary fixes only, keep immediate ticket (recommended) | Full migration to Check and log like pub heating
DETAIL: The control modal commits to an action before any outcome card is shown, so a wrapUpStep would require storing the action mid-flight. The recommended path fixes the script block, the glossary terms, and the false "I've logged it" claim without restructuring the ticket model.

DECISION: Contractor "override button" wording | Replace with "manual control button" throughout (recommended) | Keep "override" — matches the label on the physical PowerPause device
DETAIL: Using "manual control button" makes the agent's script clear regardless of what is printed on the device. Keeping "override" matches the physical label but ships the word in 9 places in this one flow while removing it everywhere else.

DECISION: ctlBgWatch repeated toast — fix in this build or later | Fix the latch in this build (recommended) | Separate defect ticket
DETAIL: The fix is one boolean flag that prevents repeat fires. The defect is in control.js, which 146 already touches for the glossary sweep. Agents using Salus heating controls today already see up to 370 repeat toasts per indeterminate device.
:gate-contract

---

## Findings

### Universal structural gap (P3 — every flow)

All non-heating flows use the four shared helpers `outcomeCaptured`, `outcomeP1`, `outcomeScope`, `outcomeNoAction`. None has been migrated to the v1.6.0 standard.

| Gap | What is missing | What the standard requires |
|---|---|---|
| Headline | Hardcoded `<h3>` with emoji | `.reco b.hd` — plain words, no emoji |
| Script block | `<div class="script">` — unlabelled | `<div class="say">` — labelled "Say to the customer", coloured left border |
| Ticket model | Ticket fires immediately on outcome | `wrapUpStep` — Check and log, notes always included |

Outcome migration count by flow:

| Flow | Terminal outcomes | Intermediate script-divs |
|---|---|---|
| Hot water | 3 | 8 |
| Kitchen | 5 | 8 |
| Fridges and freezers | 2 | 0 |
| Lighting | 2 | 1 |
| Extractor fans | 1 | 1 |
| Contractor | 4 | 4 |
| Connectivity | 4 | 0 |
| Something else and aircon | 5 | 0 |
| Salus heating | 4 | 4 |
| Control modal | 3 | 2 |

---

### P1 contradictions — 6 found

| # | Where | What the agent sees | Why it is wrong |
|---|---|---|---|
| 1 | Kitchen — verdict B-unscheduled | "the schedule confirms it should be" | Verdict B-unscheduled means the device has no schedule |
| 2 | Kitchen — verdict B-outside | "the schedule confirms it should be" | Verdict B-outside means the device is running outside its scheduled hours |
| 3 | Fridges — "just a query" path (outcomeScope) | "Not on Lighthouse at this site" | Fridges are monitored by Lighthouse; only control is unavailable |
| 4 | Something else — scope: monitored (outcomeScope) | "Not on Lighthouse at this site" | The monitored path is for equipment that IS on Lighthouse |
| 5 | Salus heating — buildheat (outcomeScope) | "Not on Lighthouse at this site" | The thermostat is online and actively reporting its temperature |
| 6 | Control modal — ctlRelease | "I've logged it" in the customer-facing script | HTML built outside try/catch; shown even when ticket POST failed |

Root cause for items 3, 4, 5: `outcomeScope` hardcodes the headline. Fix: make it accept a headline parameter.

---

### Glossary violations by file

| File | Line(s) | Violation | Flow |
|---|---|---|---|
| flows.js | 301 | "Recorded from the caller:" | All flows |
| flows.js | 576-665 | "Don't tell the caller" x4; "boiler panel" x8; "Override ON/OFF" | Hot water DHW |
| flows.js | 629 | "escalate if the caller needs it sooner" | Hot water |
| flows.js | 1697 | "What does the caller need?" | Salus heating |
| flows.js | 1725 | "If the caller still reports cold"; "setpoint" x2 | Salus heating |
| flows.js | 1953-1973 | "if the caller says" x3; "Caller still says" chip x4; "override" x many | Kitchen |
| flows.js | ~2098 | "Caller sorted it with the override" button; device ID shown | Lighting |
| flows.js | ~2151-2156 | "the caller needs" x2; "What does the caller need?" label; device ID shown | Fan |
| flows.js | ~2200-2280 | "override" x9-10 across step, chip, scripts, subjects, summaries | Contractor |
| flows.js | ~2231-2265 | "the caller says it's working again" x3; "After the caller checks:" | Connectivity |
| flows.js | 2417 | "Describe the issue in the caller's words" | Something else |
| control.js | 21 | CTL_TITLES: "Raise setpoint", "Lower setpoint", "Turn heating off (frost-hold)" | Control modal |
| control.js | 22-23 | CTL_WHAT and CTL_VERB: "setpoint" x4, "frost-hold" x2 | Control modal |
| control.js | 125 | "5 degrees frost-hold" (large display text) | Control modal |
| control.js | 152 | "Hold active: reverts at HH:MM" — exact banned phrase | Control modal |
| control.js | 158 | "carry on with the caller" | Control modal slow-send |
| control.js | 169 | "do not tell the caller it's done" | Control modal non-delivery |
| control.js | 261, 335 | "will revert automatically" | Control modal |
| control.js | 341 | "now off on a frost-hold" in script | Control modal Salus frost |
| views.js | 410 | Read to the caller (h3 heading) | Callback drawer |
| views.js | 411-412 | "remind the caller"; "Caller expects an update by" | Callback drawer |
| views.js | 465, 480 | "take the caller's details"; "if the caller insists they rang" | Callback lookup |
| views.js | 545 | Placeholder: "Caller says they rang" | Tonight query modal |
| app.js | 228, 234 | "capture the caller's issue"; "Check the house number with the caller" | Site search |

---

### Chip gaps

| Location | File | What happens today | Fix |
|---|---|---|---|
| Tonight view | views.js line 533 | Missing boiler-boost key — raw text shown | Add boiler-boost to OUTCOME_CHIP map |
| IoT Support Dashboard | ooh-review.js line 117 | Missing boiler-boost key — raw chip in oversight screen | Add boiler-boost to OUTCOME_LABELS — separate gate trail |

---

### Functional defect

`startCtlBgWatch` fires the "not confirmed yet" toast every 15 seconds from 2 minutes onward without latching. For a persistent indeterminate state this fires approximately 370 times before the 95-minute timeout. Fix: a boolean flag that prevents repeat fires after the first notification. One line.

---

### What the design gate must produce

1. A complete wording table — one row per outcome per flow — with the exact new headline, .say text, and optional .gtk text.
2. New outcome headlines for the three outcomeScope P1 paths (fridges, something-else monitored, Salus buildheat).
3. A real-screen prototype: the app in fixture mode captured with Playwright, fictional names.
4. Kitchen verdicts B-unscheduled and B-outside must have new, factually correct scripts.
5. ctlRelease script branched on ticket success: "I've logged it" only when ticketId is not null.

Interactive review: https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-146-discovery.html
