<!-- gate:contract
TICKET: OOHDASH-136
PHASE: design
QUESTIONS: none
DECISIONS: none
SECTIONS:
- What This Design Is For
- What Changed Since Discovery
- Cost and Background-Running Posture
- Where It Appears in the Call
- The States the Operator Can See
- Exact Wording
- Time Formatting
- How the Dashboard Works It Out
- Payload Fields and Compatibility
- Corrections to the OOHDASH-135 Build Plan
- Non-Goals
- Data Dictionary
- Test Scripts and Test Data
- How the Customer-Experience Criteria Are Realised
- Mockup
- Open Flags for Build
- Cost and Benefit
-->

# OOHDASH-136 Design: Hot Water Override State on the Boiler Panel (Display Only)

**Date:** 2026-10-21
**Ticket:** OOHDASH-136 (Track 2 of OOHDASH-135)
**Input:** docs/project/OOHDASH-136-DISCOVERY.md (signed off, gate PR #122)
**Codebase read:** main at 6c3c459 (package version 1.4.4)
**Mockup:** docs/project/mockups/OOHDASH-136_DHW_STATES_MOCKUP_2026-10-21.html

## What This Design Is For

When a pub on a boiler control panel rings to say they have no hot water, the operator currently has nothing to tell them except "we will log it". The boiler panel already knows something useful: whether the IoT team (or someone on site) has overridden the hot water, which way, and until when. This design turns that into a single plain-English conclusion that appears inside the existing Hot water question flow, for example "Hot water override: Override OFF until 06:00 tomorrow", followed by one sentence on what that means for the caller and one line the operator can read out.

It is display only. Nothing is switched, nothing is written to ThingsBoard, no new buttons are added, and the existing "Log and escalate to IoT team" path is unchanged. The operator still escalates exactly as today; they just escalate knowing the answer, and the ticket the IoT team receives records what the panel said at the time of the call.

James's four discovery decisions are applied as signed off: V2 negative shows "Override OFF until [time]" (D1); V1 uses the same labels with no time (D2); the row is hidden on V2 panels where the hot water is on a separate system (D3); and hidden on V1 panels where output 4 is not wired to hot water (D4).

## What Changed Since Discovery

Before designing, I ran a read-only sweep of all 223 boilerControl panels in live ThingsBoard (GET requests only, 2026-10-21 about 18:25 UK time). It confirmed most of discovery and turned up four things the design has to handle. None of them reopen a decision James made.

**1. Seven panels carry both version markers.** Discovery's sample found no panel with both the V2 marker (heating_scenario) and the V1 marker (output1OutputMask). The full estate has seven (for example gk-6195, gk-6220, gk-4019). All seven behave as V2: they have heating_scenario and a DHW.override reading, and no output4Override reading. So the version rule is applied in discovery's order: heating_scenario present means V2, whatever else is there. This matters because the shipped helper that decides hot water controllability (deriveBoilerControl) treats "both present" as "neither", so those seven sites would silently get no row if Build reused it. This design does not change that helper (out of scope); it is raised as an open flag.

**2. heating_scenario is not currently read.** Discovery said it was already fetched. It is not: the boiler panel's client attribute read asks only for site, salusLocation and DHW.use_boiler. Build adds heating_scenario to that same request. No extra call.

**3. Most V1 changes are written twice, and the second copy is corrupt.** On V1 panels, when the override changes, the panel writes a valid value and then, a few milliseconds later, a 25-digit corrupt value (it is the valid value squared). The corrupt copy is therefore usually the "latest" reading. Example, gk-6819 at 17:15:50: valid 1792603850924, then 3213428566365480600000000 seventeen milliseconds later. If the dashboard only looked at the latest reading, V1 "Override ON" would almost never show. So for a V1 panel whose latest reading is not zero, the server makes one extra small read of that one key's last 35 minutes and uses the newest valid row.

**4. V1 re-confirms both ON and OFF every 15 minutes, but not reliably.** gk-6761 is currently held OFF and re-sends its OFF value every 15 minutes, but it skipped the 16:00 slot (a 30 minute gap) and had not re-sent by 17:25. gk-6820 wrote one ON value in July and nothing since, with no return to zero. Discovery proposed a 20 to 25 minute freshness window for ON only. This design uses 35 minutes (two heartbeats plus margin) for both ON and OFF, and if a V1 override has not been re-confirmed inside that window the operator sees "can't confirm" rather than a guess.

Estate snapshot at the time of the sweep, for scale: V2 panels 71 (47 with hot water on the panel, 24 with separate hot water and therefore hidden), all at Auto except one ON. V1 panels 141 (113 wired for hot water, 28 not wired and therefore hidden), 129 at Auto, 9 with no reading, 3 non-zero. 24 of 223 panels had not reported for over 60 minutes.

## Cost and Background-Running Posture

**Token and cost efficiency.** There is no AI in this feature; the state is worked out by a few lines of ordinary code. ThingsBoard calls: zero extra for every V2 panel and for every V1 panel at Auto (the reading is already in the existing telemetry request, and heating_scenario is added to an existing attribute request). One extra small read (one key, at most 35 minutes of rows, capped at 20 rows) happens only when a V1 panel's latest reading is non-zero, which was 3 of 141 V1 panels at the time of the sweep, and only when an operator opens that site. Recurring cost: none. Nothing scales with time; the cost scales only with operators opening sites, and is a fraction of a request per site load.

**Silent background running.** Nothing new runs in the background. No timer, poll, watcher, listener or scheduled task is added. The state is fetched only when an operator confirms a site, exactly like the rest of the workspace. The final "is it still in force" check is done by the operator's own browser at the moment the card is drawn, using the times already in the payload, so it does not need any re-polling either. When nobody is using the dashboard, this feature uses no calls, no compute and no money.

**Compromise.** None. Both criteria are met in full. The one honest qualification to discovery's "zero additional calls" claim is the extra V1 read described above; it is bounded, rare and on demand.

## Where It Appears in the Call

The conclusion appears in one place: the first step of the **Hot water** flow, on sites that have a boiler control panel. That is the point in the conversation where the caller has just said the problem is hot water, so the answer arrives as the outcome of their question, not as a static device panel (the governing conversational-outcome principle).

The operator's path is unchanged apart from the new card:

1. Operator confirms the site and taps the Hot water tile (as today).
2. **New:** a conclusion card appears at the top of the step: a headline with a coloured status tag, one sentence on what it means, and a "You can tell the caller" line in the existing script style.
3. The existing blue note ("Hot water here runs on the boiler panel...") and the existing two chips, "Log and escalate to IoT team" and "Scope guidance (boiler fault?)", appear below it exactly as now.
4. If the operator logs and escalates, the Zendesk ticket detail gains one sentence: "Hot water override at time of call: [headline]". Nothing else about the ticket, its class, its priority or its routing changes.

The card does not appear on the "not on Lighthouse" hot water path, on sites without a boiler panel, or anywhere in the Heating flow. Hot water override state is not relevant to a heating complaint, and adding it there would be static detail the operator does not need.

When the row is hidden (see the next section), the operator sees today's Hot water step exactly as it is now. Hidden never shows a placeholder or "not available" line, because that would invite a question the operator cannot answer.

## The States the Operator Can See

The dashboard works through the checks below in order and stops at the first one that applies. "Now" is the moment the card is drawn in the operator's browser.

**Checks that hide the card (both panel versions).**

| Order | Check | Result |
|---|---|---|
| 1 | Site has no boilerControl panel | Hidden (today's flow) |
| 2 | Panel has heating_scenario in client attributes | Treat as V2 (even if output1OutputMask is also present) |
| 3 | Otherwise, panel has output1OutputMask in shared attributes | Treat as V1 |
| 4 | Neither marker present | Hidden (version unknown) |
| 5 | V2 and heating_scenario.separate_dhw is not exactly 0 (1, missing, or unreadable) | Hidden (D3: hot water on a separate system, or cannot be sure it is on the panel) |
| 6 | V1 and output1OutputMask position 4 (index 3) is not true (false, missing, or mask unreadable) | Hidden (D4: output 4 is not hot water) |
| 7 | The override reading key has never been written (V2 DHW.override absent; V1 output4Override absent) | Hidden (nothing to conclude) |

**Check that overrides everything else.**

| Order | Check | Result |
|---|---|---|
| 8 | Panel's last report (lastActivityTime) is missing, or more than 60 minutes before now | Stale: "can't confirm", panel last heard from X ago |

Staleness is judged from the panel's general last-report time, not from the override key, because the override key is only written when something changes and a healthy panel can go weeks without writing it.

**V2 panels (DHW.override, epoch seconds).** The reading is multiplied by 1000 to give milliseconds before comparing with now.

| Reading | Condition | Operator sees |
|---|---|---|
| Not a whole number (text, decimal, empty) | - | Can't confirm (reading doesn't make sense) |
| 0 | - | Auto (on schedule) |
| Any non-zero | time outside the window from 6 hours ago to 365 days ahead (this catches Spencer's shorthand 1 and -1, and any millisecond value read by mistake) | Can't confirm (reading doesn't make sense) |
| Positive | time is after now | Override ON until [time] |
| Negative | time is after now | Override OFF until [time] (D1) |
| Positive or negative | time has passed but within the last 6 hours (panel has not cleared it yet) | Auto (on schedule), with "An override ended at [time]" |

**V1 panels (output4Override, epoch milliseconds).**

| Latest reading | Condition | Operator sees |
|---|---|---|
| 0 | - | Auto (on schedule) |
| Anything else | server looks at this key's rows from the last 35 minutes and takes the newest valid one (a valid row is a whole number whose size, ignoring the sign, is between 0 and 20 minutes after that row's own timestamp; corrupt 25-digit copies fail this) | see below |
| - | newest valid row is 0 | Auto (on schedule) |
| - | newest valid row is positive, confirmed within 35 minutes of now | Override ON (no time, D2) |
| - | newest valid row is negative, confirmed within 35 minutes of now | Override OFF (no time, D2) |
| - | no valid row in the last 35 minutes, or the confirming row is now older than 35 minutes | Can't confirm (panel hasn't re-confirmed recently) |

**Deliberate calls against a silent or loose brief.** Discovery said corrupt or implausible V1 values should "treat as inactive". Showing "Auto (on schedule)" for a panel whose true state we cannot read would tell the operator there is no override when there might be one, so this design shows "can't confirm" instead. Both lead to the same escalation; only the honest one is relayed to the caller. Expired V2 overrides that the panel has not yet cleared show Auto, as the brief asked, because the end time itself tells us the override is over.

## Exact Wording

Every card has the same structure: a headline using James's D1 and D2 labels, a coloured tag, one plain sentence, and a line to read out. Text in square brackets is filled in by the time formatter.

| State | Tag (colour) | Headline | Explanation | You can tell the caller |
|---|---|---|---|---|
| Auto | Auto (green) | Hot water override: Auto (on schedule) | Nobody has overridden the hot water on the boiler panel. It is following its normal timetable, so an override is not the reason for the problem. | The hot water controls haven't been overridden - they're running on the normal timetable. |
| Auto, override just ended (V2) | Auto (green) | Hot water override: Auto (on schedule) | An override ended at [time] and the panel has gone back to its normal timetable, so an override is not the reason for the problem now. | The hot water controls are back on the normal timetable. |
| ON until (V2) | Override ON (blue) | Hot water override: Override ON until [time] | Hot water has already been set to run from the boiler panel and stays on until [time]. The controls are asking for hot water, so if there is still none, the likely cause is the boiler or the cylinder. | The hot water has already been switched on from the controls and will stay on until [time]. If it's still not coming through, it's likely the boiler itself, so I'll log it for the team. |
| OFF until (V2) | Override OFF (amber) | Hot water override: Override OFF until [time] | Hot water has been deliberately switched off from the boiler panel until [time]. That is the likely reason there is no hot water. It goes back to its normal timetable at [time]. We can't change it from here, so escalate if the caller needs it sooner. | The hot water has been switched off on purpose at the controls until [time], then it goes back to normal. I'll log that you need it back sooner so the team can look at it. |
| ON (V1) | Override ON (blue) | Hot water override: Override ON | Hot water has been set to run from the boiler panel. This type of panel doesn't give an end time. The controls are asking for hot water, so if there is still none, the likely cause is the boiler or the cylinder. | The hot water has been switched on from the controls. If it's still not coming through, it's likely the boiler itself, so I'll log it for the team. |
| OFF (V1) | Override OFF (amber) | Hot water override: Override OFF | Hot water has been deliberately switched off on the boiler panel. That is the likely reason there is no hot water. This type of panel doesn't say when it ends, and we can't change it from here, so escalate it. | The hot water has been switched off on purpose at the controls. I'll log it so the team can switch it back on for you. |
| Stale | Can't confirm (grey) | Hot water override: can't confirm | The boiler panel last reported [ago], so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal. | I can't see the current hot water setting from here right now, so I'll log it for the team to check. |
| Stale, never reported | Can't confirm (grey) | Hot water override: can't confirm | The boiler panel isn't reporting, so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal. | (same as Stale) |
| Reading doesn't make sense | Can't confirm (grey) | Hot water override: can't confirm | The boiler panel's hot water override reading doesn't make sense right now, so we can't tell whether it is overridden. Don't tell the caller it is on or off; log it and escalate as normal. | (same as Stale) |
| V1 not re-confirmed | Can't confirm (grey) | Hot water override: can't confirm | The boiler panel hasn't re-confirmed its hot water override recently, so we can't tell whether it is still in place. Don't tell the caller it is on or off; log it and escalate as normal. | (same as Stale) |

**Ticket sentence** (added to the end of the existing "Log and escalate" and "Scope guidance" ticket detail, only when a card was shown): "Hot water override at time of call: [headline without the 'Hot water override:' prefix]." For the can't-confirm states it reads "Hot water override at time of call: could not be confirmed ([reason in a few words])", for example "(panel last reported 3 hours ago)".

Build should use straight or typographic apostrophes consistently with the surrounding flows.js copy; the wording above is the contract.

## Time Formatting

All times are UK local time (Europe/London), so they are correct across the clock change on Sunday 25 October 2026 without any special handling. Times use the 24-hour clock, HH:MM.

| When the time falls | Shown as | Example (now = Wed 21 Oct, 19:40) |
|---|---|---|
| Later today | HH:MM | 22:00 |
| Exactly 00:00 tonight | midnight | Override ON until midnight |
| Tomorrow | HH:MM tomorrow | 06:00 tomorrow |
| Any later day | on Ddd D Mmm at HH:MM | on Sat 24 Oct at 23:00 |
| Earlier today (override ended) | HH:MM | An override ended at 18:00 |

"Last heard from" (staleness) is shown as "X minutes ago" under 2 hours, "X hours ago" under 48 hours, and "on Ddd D Mmm at HH:MM" beyond that. Raw numbers, epoch values, bitmasks and key names are never shown to the operator.

## How the Dashboard Works It Out

All reads are GET requests the dashboard already makes when a site is confirmed. Nothing is written.

| Step | Module | What it does |
|---|---|---|
| 1 | services/tb-device.js, fetchTelemetry | For boilerControl panels, add heating_scenario to the existing client attribute request (now site, salusLocation, DHW.use_boiler, heating_scenario). The existing latest-telemetry request already returns DHW.override and output4Override; also keep the row timestamp for output4Override. The existing shared attribute request already returns output1OutputMask. |
| 2 | services/tb-device.js, fetchTelemetry | Only for a V1 panel whose latest output4Override is non-zero: one extra read of output4Override for the last 35 minutes, newest first, at most 20 rows. A failure of this read degrades that panel to "can't confirm", never the site. |
| 3 | services/tb-device.js, new pure function decodeDhwOverride | Applies checks 2 to 7 and the per-version decode, using the build time as "now", and returns the dhwOverride object described in the next section. Pure, no network, unit tested. |
| 4 | services/tb-device.js, fetchLiveSitesByNumber | Attaches the result to the existing site.boilerControl object as boilerControl.dhwOverride, for the same single panel the site already uses (first by name). |
| 5 | routes/api.js, workspacePayload | No code change needed: boilerControl is already passed through to the payload. The safe default for sites without a panel (defaultBc) gains dhwOverride with visible false. |
| 6 | public/js/flows.js, new pure function dhwOverrideOutcome | Takes the dhwOverride object and the browser's current time, re-applies the time-based checks (60 minute staleness, V2 end time passed, V1 35 minute confirmation) and returns the state, headline, explanation, script and ticket sentence. A textually identical copy lives in tb-device.js for unit testing, the same twin pattern the connectivity anchor rule already uses. |
| 7 | public/js/flows.js, FLOWR.hotwater stage 0 | Renders the card above the existing note and chips when visible is true, using existing CSS only (reco, tag, script). Appends the ticket sentence to the existing capture and scope outcomes. |

The final time checks run in the browser because a confirmed workspace can stay on screen for a long time. An override that ends at 22:00 must stop saying "ON until 22:00" at 22:00, without the dashboard polling ThingsBoard again.

## Payload Fields and Compatibility

One new nested object is added inside the existing boilerControl object of the workspace payload. Nothing existing is renamed, removed or changed in type, so every current reader of the payload keeps working.

| Field | Type | Meaning |
|---|---|---|
| boilerControl.dhwOverride.visible | boolean | true when the card should be shown; false for every hidden case |
| boilerControl.dhwOverride.hiddenReason | text or null | no-panel, version-unknown, separate-dhw, dhw-not-wired, no-reading; null when visible |
| boilerControl.dhwOverride.panelVersion | text or null | V1 or V2 (by the heating_scenario-first rule); null when unknown |
| boilerControl.dhwOverride.mode | text or null | auto, on, off or unreadable, as decoded at build time before time checks |
| boilerControl.dhwOverride.untilMs | number or null | V2 only: override end time in milliseconds (reading x 1000, sign removed) |
| boilerControl.dhwOverride.confirmedAtMs | number or null | V1 only: timestamp of the newest valid row used for on or off |
| boilerControl.dhwOverride.unreadableReason | text or null | not-a-number, implausible, not-reconfirmed; null otherwise |
| boilerControl.dhwOverride.panelLastSeenMs | number or null | the panel's lastActivityTime in milliseconds |
| boilerControl.dhwOverride.decodedAtMs | number | server time when decoded, for audit and tests |

**Sibling IoT Support Dashboard (SD-330).** SD-330 reads the OOH Cosmos store for its failed-revert panel and receives P1 deep links; it does not read this workspace payload. The ticket sentence is added to the Zendesk ticket body text only, which SD-330 already displays as free text. No Cosmos record shape changes. The change is additive and non-breaking for any consumer.

**Existing fields untouched.** present, isV1, isV2, heatingControllable, dhwControllable and deviceId keep their current values and meaning; the hot water scope row is unchanged.

## Corrections to the OOHDASH-135 Build Plan

The Track 2 items in docs/project/OOHDASH-135-BUILD-PLAN.md and the Track 2 part of OOHDASH-135-DESIGN.md are superseded by this design. Build works from this document, not from those items. The specific corrections are:

| Item | Was | Now |
|---|---|---|
| Field names (Track 2 scope update) | boilerDhwOverrideUntil, boilerDhwOverrideActive, boilerOutputMask, boilerOutputMaskDhwBit | Replaced by the single boilerControl.dhwOverride object above |
| W5-A classifier | profile early-return to deviceType boiler-panel as a prerequisite | Not needed for this feature; the card keys off site.boilerControl, which is already derived from the boilerControl profile |
| W5-B units | DHW.override compared directly with Date.now() | DHW.override is seconds: multiply by 1000 first; untilMs is stored in milliseconds |
| W5-B / W5-C V1 meaning | output1OutputMask bit 3 is the live DHW state | output1OutputMask index 3 is wiring only (the D4 hide gate); the live V1 state is output4Override |
| W5-C V2 OFF | only positive values handled | negative values are Override OFF until [time] (D1) |
| W5-C discrimination (I1) | version from recent DHW.override telemetry; both present prefers V2 | version from durable attributes: heating_scenario first means V2, else output1OutputMask means V1, else hidden |
| W5-C V1 corruption | not handled | newest valid row from a 35 minute history read; corrupt 25-digit rows ignored |
| W5-C staleness and CT4 | computed once at payload build | time checks recomputed in the browser at render (CT4 option 2) |
| W5-D wording | "DHW zone override: Active / Inactive" and "Output 1 DHW: ON / OFF" | D1 and D2 labels with explanation and script, see Exact Wording |
| W5-D placement | heating boiler-panel branch | Hot water flow stage 0 only; heating branch unchanged |
| W5-E threshold | BOILER_PANEL_STALE_THRESHOLD_MINUTES = 5, provisional | 60, final; plus new BOILER_V1_OVERRIDE_CONFIRM_MINUTES = 35 |
| T2-0 prerequisites | waiting on Spencer for meaning and cadence | satisfied: Spencer answered 2026-10-21; units and cadence proven from live data |
| T2-2 fixture | output1OutputMask: 8 as V1 state | rewritten; see U1 to U14 below |
| T2-3 / T2-9 | "Active" / "Inactive" in the heating flow | rewritten as E1 to E3 in the hot water flow |
| T2-5 staleness fixture | threshold 5, age 8 minutes | threshold 60, age 3 hours 15 minutes (E5) |
| T2-6 | output1OutputMask 8 shows "Output 1 DHW: ON" | rewritten to output4Override ON, OFF, Auto and not-wired (U8 to U12, E6, E7) |
| T2-7 | non-numeric gives a "graceful fallback" | non-numeric gives "can't confirm" with the exact wording (U4, E4) |

## Non-Goals

- No control of any kind. No override, boost, on, off or schedule command is added, and no button that implies one.
- No ThingsBoard writes, no attribute changes, no telemetry writes.
- No flag flips. WRITES_DISABLED, SALUS_IT500_CTL_ENABLED and the salus-it500-dhw controllable flag are untouched.
- No change to deriveBoilerControl, dhwControllable, isV1 or isV2, or to the hot water scope row.
- No change to the Heating flow, including its boiler-panel branch wording.
- No display of contractor_override (ignored, as discovery concluded).
- No raw values, epochs, bitmasks, key names or device names on screen.
- No new polling, refresh timer or background job.

## Data Dictionary

New and touched names only; everything else follows docs/project/DATA_DICTIONARY.md. All are read-only telemetry or attributes with no personal data. Retention: nothing is stored by the dashboard beyond the existing short per-site cache (30 seconds); the ticket sentence lives in Zendesk with the ticket under its existing retention.

| Name | Where it lives | Type and units | Meaning |
|---|---|---|---|
| DHW.override | TB telemetry, V2 panel | text holding a whole number, epoch seconds | 0 auto; positive ON until; negative OFF until (magnitude is the end time) |
| output4Override | TB telemetry, V1 panel | text holding a whole number, epoch milliseconds | 0 auto; positive ON; negative OFF; magnitude is row time plus about 15 minutes; corrupt 25-digit twin rows occur |
| heating_scenario | TB client attribute, V2 panel | object (may arrive as JSON text) | V2 marker; its separate_dhw field is the D3 gate (0 shown, anything else hidden) |
| output1OutputMask | TB shared attribute, V1 panel | list of 4 true/false (may arrive as JSON text) | V1 marker; index 3 true means output 4 is hot water (D4 gate) |
| lastActivityTime | TB server attribute, any device | epoch milliseconds | the panel's last report; drives the 60 minute stale check |
| boilerControl.dhwOverride | OOH workspace payload | object | the nine fields listed under Payload Fields |
| BOILER_PANEL_STALE_THRESHOLD_MINUTES | config.js | number, minutes, value 60 | stale cut-off for the hot water override card |
| BOILER_V1_OVERRIDE_CONFIRM_MINUTES | config.js | number, minutes, value 35 | how recently a V1 ON or OFF must have been re-confirmed |
| BOILER_V2_OVERRIDE_PAST_WINDOW_HOURS | config.js | number, hours, value 6 | how far in the past a V2 end time can be and still count as a just-ended override |
| BOILER_V2_OVERRIDE_FUTURE_WINDOW_DAYS | config.js | number, days, value 365 | furthest future V2 end time accepted as real |
| decodeDhwOverride | services/tb-device.js | pure function | attributes and readings in, dhwOverride object out |
| dhwOverrideOutcome | public/js/flows.js, twin in services/tb-device.js | pure function | dhwOverride object and current time in, state and wording out |
| dhw-override card | flows.js markup | test id hw-dhw-override, tag test id hw-dhw-override-tag | the card on the hot water step |

## Test Scripts and Test Data

**Fixed clock.** Unless stated, now is Wed 21 Oct 2026 19:40 UK time (2026-10-21T18:40:00Z, epoch seconds 1792608000). Unit tests pass now in; e2e tests fix the browser clock with Playwright page.clock and use fixture sites whose boilerControl.dhwOverride is given directly.

**Unit tests (test/oohdash-136-dhw-override.test.js), decodeDhwOverride and dhwOverrideOutcome.**

| Id | Input | Expected |
|---|---|---|
| U1 | V2, separate_dhw 0, DHW.override "0", last seen 3 min ago | Auto (on schedule) |
| U2 | V2, DHW.override "1792616400" | Override ON until 22:00 |
| U3 | V2, DHW.override "-1792645200" | Override OFF until 06:00 tomorrow |
| U4 | V2, DHW.override "abc", then "1.5", then "" | can't confirm, not-a-number |
| U5 | V2, DHW.override "1" and "-1" | can't confirm, implausible |
| U6 | V2, DHW.override "1792602000" (ended 18:00) | Auto with "An override ended at 18:00" |
| U7 | V2, DHW.override "1792586400" (ended 13:40, exactly 6 h ago) and "1792580000" (ended 11:53, nearly 8 h ago) | first: Auto with "An override ended at 13:40" (boundary inclusive); second: can't confirm, implausible |
| U8 | V1, mask [false,true,false,true], latest output4Override "0" | Auto (on schedule) |
| U9 | V1, latest corrupt "3213428566365480600000000", history has valid "1792608660000" at row time 18:36:00Z | Override ON, confirmedAtMs 18:36:00Z |
| U10 | V1, latest "-1792608540000" at row 18:34:00Z | Override OFF |
| U11 | V1, latest positive, newest valid row at 17:50:00Z (50 min ago) | can't confirm, not-reconfirmed |
| U12 | V1, mask [false,true,true,false] with any reading | hidden, dhw-not-wired |
| U13 | both heating_scenario (separate_dhw 0) and output1OutputMask present, DHW.override "0" | treated as V2, Auto |
| U14 | V2 separate_dhw 1; V2 heating_scenario without separate_dhw; neither marker; V2 with no DHW.override key | hidden: separate-dhw, separate-dhw, version-unknown, no-reading |
| U15 | any visible state with last seen at 15:25:00Z (3 h 15 min ago) | can't confirm, "last reported 3 hours ago" |
| U16 | last seen null | can't confirm, "isn't reporting" |
| U17 | ON until 22:00, then re-evaluated with now 22:00:01 | Auto with "An override ended at 22:00" (browser recompute, no refetch) |
| U18 | time formatting: until 2026-10-21T23:00:00Z | "midnight"; until 2026-10-24T22:00:00Z gives "on Sat 24 Oct at 23:00"; with now 2026-10-27T18:40:00Z (GMT) and until 2026-10-28T00:00:00Z gives "midnight" |
| U19 | V1 history read fails | can't confirm, site still loads |

For U7 the two values sit either side of the 6 hour line on purpose. Build should keep the boundary inclusive and name it in the test.

**End-to-end tests (tests/oohdash-136-dhw-override.spec.js), fixture sites added to data/fixtures/bridge-devices.json.** Each is a C&B site with one boilerControl panel, online, at the fixed clock.

| Id | Fixture site | dhwOverride given | Steps | Expected on screen |
|---|---|---|---|---|
| E1 | 9361 The Plough Inn | V2, mode auto | Confirm site, tap Hot water | Card "Hot water override: Auto (on schedule)", green tag; existing note and both chips below |
| E2 | 9362 The Golden Lion | V2, mode on, untilMs 1792616400000 | as E1 | "Override ON until 22:00", blue tag, script mentions 22:00 |
| E3 | 9363 The Kings Arms | V2, mode off, untilMs 1792645200000 | as E1, then "Log and escalate to IoT team" | "Override OFF until 06:00 tomorrow", amber tag; captured ticket detail ends "Hot water override at time of call: Override OFF until 06:00 tomorrow." |
| E4 | 9364 The White Hart | V2, mode unreadable, not-a-number | as E1 | "can't confirm", grey tag, "doesn't make sense" |
| E5 | 9365 The Red Lion | V2, mode auto, panelLastSeenMs 15:25:00Z | as E1 | "can't confirm", "last reported 3 hours ago"; no Auto shown |
| E6 | 9366 The Fox and Hounds | V1, mode on, confirmedAtMs 18:36:00Z | as E1 | "Override ON", no time shown |
| E7 | 9367 The Royal Oak | V1, mode off, confirmedAtMs 18:34:00Z | as E1 | "Override OFF", no time shown |
| E8 | 9368 The Bell | visible false, separate-dhw | as E1 | No card; step identical to today (note and chips only) |
| E9 | 9369 The Swan | visible false, dhw-not-wired | as E1 | No card |
| E10 | 9362 | as E2 | Advance browser clock to 22:00:30 and re-render the step | Card changes to Auto with "An override ended at 22:00" without any new network request |
| E11 | 9361 | as E1 | Open the Heating flow | No hot water override card anywhere in the Heating flow |
| E12 | 9363 | as E3 | Inspect the page text | No digits longer than 4, no key names (DHW, output4, epoch) visible |

Regression: the existing tests/boilercontrol.spec.js (BC-E1 to BC-E5) and all hot water flow tests must still pass unchanged, which proves the scope row and escalate path did not move.

**Read-only live check after deploy.** Open site 6097 (V2, separate_dhw 0, currently Auto) and expect the Auto card; open 5804 (separate_dhw 1) and expect no card; open 2933 (V1, not wired) and expect no card; open 220 (V1, wired, Auto) and expect the Auto card.

## How the Customer-Experience Criteria Are Realised

| Discovery criterion | How the design delivers it | Where to see it in the mockup |
|---|---|---|
| Operator can tell the caller whether the IoT team has already set an override | One headline in D1/D2 wording, at the exact moment the caller raises hot water | States 1 to 5 |
| Advise or escalate appropriately | Every card says what it means for the caller and keeps both existing escalate chips directly beneath | Every state |
| Reassurance: never a confidently wrong answer | Stale, implausible, corrupt and not-re-confirmed readings all become "can't confirm" with a reason; expired overrides stop showing as ON at the end time without a refresh | States 6 and 7, and the "jump to 22:00" button |
| Friction: no extra step for the operator | No new question, no new click; the card is read-only and the existing chips are unchanged | All states |
| Raw epoch values must never be shown | Times are formatted HH:MM, tomorrow, or a day name; no numbers beyond a time | All states |
| Only show where hot water is really on the panel (D3, D4) | Hidden cases show today's step untouched, with no placeholder | Hidden examples |
| IoT team gets the context | One sentence added to the ticket detail | "Log and escalate" in any state |

## Mockup

The hi-fi interactive mockup is docs/project/mockups/OOHDASH-136_DHW_STATES_MOCKUP_2026-10-21.html. It is a single self-contained file (no external scripts or fonts) that uses the dashboard's real stylesheet, copied in, so the colours, cards, tags and chips are the ones operators see today.

It shows the Hot water step for each state on a fixed clock of 19:40 on Wed 21 Oct: Auto, Auto after an override ended, Override ON until 22:00, Override OFF until 06:00 tomorrow, V1 Override ON, V1 Override OFF, can't confirm (stale), can't confirm (reading doesn't make sense), and two hidden examples (separate hot water, output 4 not wired). The chips work: "Log and escalate to IoT team" shows the captured outcome with the added ticket sentence. A "Jump to 22:00" button on the ON state shows the card changing to Auto by itself.

## Open Flags for Build

1. **Seven panels carry both version markers** (gk-6250, gk-6195, gk-6220, gk-6239, gk-6186, gk-4019, gk-6135). The shipped deriveBoilerControl treats them as neither V1 nor V2, so their hot water scope row is "not controllable" today. This design deliberately does not touch that, but it is a real defect worth its own small ticket, using the same heating_scenario-first rule.
2. **DHW.use_boiler disagrees with separate_dhw on 9 V2 panels** (for example gk-6187, gk-6194, gk-6214: separate_dhw 0 but DHW.use_boiler false). D3 is keyed on separate_dhw as signed off, so these panels show the card. If the IoT team says DHW.use_boiler is the better signal, the hide rule is a one-line change.
3. **The heating boiler-panel branch wording.** The task brief said v1.4.3 shipped "The IoT team controls this panel directly from ThingsBoard". The code on main still reads "This zone can't be adjusted remotely yet" (flows.js line 635); the W5-D wording change never landed. This design leaves the heating branch alone as a non-goal; whoever owns that copy should decide separately.
4. **V1 confirmation window is 35 minutes, not discovery's 20 to 25,** based on gk-6761 skipping a heartbeat. Named config constant, so it can be tuned without code changes.
5. **V1 corrupt and lapsed readings show "can't confirm", not Auto,** a deliberate change from discovery's "treat as inactive", explained under The States the Operator Can See.
6. **W5-A (boiler-panel device type) is not on main.** This feature does not depend on it.

## Cost and Benefit

**What it buys.** On every boiler-panel hot water call (about 160 sites are eligible today: 47 V2 and 113 V1), the operator can tell the caller in one sentence whether the hot water has been deliberately switched off, is already forced on, or is on its normal timetable. The "OFF until" case is the big one: it turns a mystery fault into "it has been switched off on purpose until 06:00", which can avoid a wasted chargeable boiler engineer visit and gives the IoT team a ticket that already says what the panel was doing.

**What it costs to build.** About 1.5 to 2 days: one pure decode function and its browser twin, one extra attribute key, one rare extra read, one card in the hot water step, a ticket sentence, 19 unit tests and 12 e2e tests. No new infrastructure, no recurring cost, no new ThingsBoard permission (read only, already granted).

**What it risks.** The main risk is showing a confident but wrong state. That is contained by the hide gates, the 60 minute staleness rule, the plausibility windows, the corrupt-row filter, and the browser recheck at render, all of which fall back to "can't confirm" rather than guessing.
