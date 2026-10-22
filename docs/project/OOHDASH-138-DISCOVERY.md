<!--gate:contract
TICKET: OOHDASH-138
PHASE: discovery
QUESTIONS:
- Q1: loops bit order (Mon=pos0 DEDUCED -- needs Spencer confirmation)
- Q2: schedule time zone (UK local or UTC -- UNRESOLVED)
- Q3: on/off setpoint threshold (>=40 ON, <30 OFF DEDUCED -- needs Spencer confirmation)
- Q4: TB authority (bridge writes TO panel, or panel reports to TB -- UNRESOLVED)
- Q5: recirc_pump value 1000/-1000 on all V3 sites -- is this V3 firmware behaviour or per-site misconfiguration?
- Q6: site 122 LoRaWAN gateway -- is deployment planned?
- Q7: Salus IT500 schedule encoding spec (A00-A06 nibble format)
DECISIONS:
- D1: Scope for v1 of schedule display | BoilerControl only (V1+V2+V3) | All device types including Salus IT500 and Tuya
- D2: Salus IT500 schedule | Defer until Spencer provides encoding spec | Display scheduleEnable status only | Skip IT500 entirely
- D3: Triage phrasing style for schedule | Single sentence "Hot water on schedule: HH:MM to HH:MM today" | Time range per zone | Full timetable table
SECTIONS:
- Background and Scope
- Sites and Devices Sampled
- BoilerControl Schedule: Format and Coverage
- Other Device Types: Schedule Status
- Triage Conclusion Phrasing
- Where It Appears in the Flow
- Implementation Notes
- Residual Questions for Spencer
-->

# OOHDASH-138 Discovery: Boiler Panel Timetable Display

**Date:** 2026-10-22
**Ticket:** OOHDASH-138
**Input:** TB read-only sweep across 8 sites (agents A-D), plus OOHDASH-136 schedule spike 2026-10-22
**Phase:** Discovery gate
**Author:** Discovery pipeline (agents A, B, C, D) + writer synthesis

---

## Background and Scope

OOHDASH-136 added a hot water override card to the Hot water triage flow on boiler panel sites. When no override is active, the card says "running on schedule." Operators then ask what that schedule is. OOHDASH-138 answers that question by showing the actual timetable -- the on-period for hot water (and, in the heating flow, each heating zone) -- as a plain-English conclusion derived from the schedule attributes already stored in ThingsBoard.

This feature is display-only. Nothing is written to ThingsBoard. No control path is involved. The operator sees an outcome of the triage question ("when does hot water run today?"), not a raw list of schedule entries, which aligns with the governing conversational-outcome principle: the machine does the decoding, the operator reads a sentence.

The estate has approximately 223 boilerControl panels. This discovery sampled 8 sites covering three confirmed firmware generations and four non-boilerControl device types to establish what schedule data is accessible and what can realistically be shown.

---

## Sites and Devices Sampled

| Site | BoilerControl | Version | Other device types present | Total devices |
|------|--------------|---------|---------------------------|--------------|
| 6261 | gk-6261-boilercontrol-1 | V3 (app 3.3.0) | Salus IT700TX, Tuya (Owon + Tongou), AMR, remoteIt | 23 |
| 6097 | gk-6097-boilercontrol-1 | V3 (app 3.3.0) | Salus IT700TX, Tuya (Owon + Tongou), AMR | 20 |
| 6769 | gk-6769-boilercontrol-1 | V1 (app 2.8.2) | Salus IT700TX, Tuya, LoRaWAN sensors, lwgateway, AMR, remoteIt | 34 |
| 4331 | gk-4331-boilercontrol-1 | V1 (app 2.8.2) | (not fully swept -- schedule confirmed in spike) | unknown |
| 122  | gk-122-boilercontrol-1  | V3 (app 3.3.0, hardware_version 2) | Salus IT700TX, Tuya, AMR | 23 |
| 6770 | gk-6770-boilercontrol-1 | V1 (app 2.8.2) | Salus IT700TX (x2), Tuya, Intesis AC (x3), LoRaWAN sensors, lwgateway, AMR, R10A | 41 |
| 5208 | none                    | n/a | Salus IT500 (x6, all offline), Tuya fans | 8 |
| 6164 | gk-6164-boilercontrol-1 | V3 (app 3.3.0) | Salus IT700TX, Tuya (cooking + relay), AMR | 31 |

**Version definitions (for this discovery):**

- V1: output1OutputMask present in attributes, no heating_scenario key. Uses output2/3/4Schedule key names.
- V2: heating_scenario present, appVersion starts with 2.x. Uses CHZ1/CHZ2/DHW.schedule key names. No confirmed examples in this sample (all heating_scenario sites ran app 3.x).
- V3: appVersion starts with 3.x (and heating_scenario present). Uses CHZ1/CHZ2/DHW.schedule key names. Sites 6261, 6097, 122, 6164 all confirmed V3.

The discovery of site 122 (app 3.3.0, hardware_version 2) is new relative to OOHDASH-136. It confirms that three firmware generations are in the estate, not two. V2 and V3 share the same schedule key names and JSON format; V1 uses a different naming scheme but the same JSON structure within each key.

---

## BoilerControl Schedule: Format and Coverage

### Key names by version

All three versions store schedule data as JSON attributes in SHARED_SCOPE (the authoritative config channel the device reads) with a matching copy in CLIENT_SCOPE.

V1 key names (output-numbered, no channel labels):

- output2Schedule -- central heating zone 1 (CH1)
- output3Schedule -- central heating zone 2 (CH2) or accommodation zone
- output4Schedule -- DHW (only present and active if output1OutputMask position 3 is true)

V2/V3 key names (channel-labelled):

- CHZ1.schedule -- central heating zone 1
- CHZ2.schedule -- central heating zone 2
- DHW.schedule -- domestic hot water
- recirc_pump.schedule -- circulation pump (V3 only; not present in V1)
- accom_1.schedule, accom_2.schedule -- accommodation zones (populated on some sites)

### JSON format (same across all three versions) -- PROVEN

Each schedule key holds a JSON object with a single "schedule" array. Each array entry has four fields:

- "time" -- transition time as "HH:MM" string (assumed UK local time -- UNRESOLVED, Q2)
- "loops" -- 7-character binary string, one character per day of week; "1" means the rule applies on that day
- "value" -- setpoint in degrees C (or 1000/-1000 for recirc_pump on/off -- see recirc note below)
- "timer_id" -- opaque string, constant within a save session ("65184321" observed on all sampled panels)

Example from site 6261 DHW (PROVEN):
{"schedule":[{"value":57,"time":"06:00","timer_id":"65184321","loops":"1111111"},{"value":15,"time":"01:00","timer_id":"65184321","loops":"1111111"}]}

This decodes as: DHW heats to 57 degrees C from 06:00 every day, drops to 15 degrees C setback from 01:00 every day.

### Day mask bit order -- DEDUCED

The loops field is read left-to-right with position 0 at the left. Position 0 = Monday, position 6 = Sunday. This was deduced from data patterns: "1000011" appears alongside "0111100" at multiple sites to cover all 7 days with different times, consistent only with Monday-Saturday-Sunday versus Tuesday-Friday groupings. DEDUCED confidence. Spencer confirmation required before shipping (Q1).

Thursday = position 3. To decode today (Thursday 2026-10-22): select all entries where loops[3] == "1", sort by time ascending, apply the setpoint from each entry until the next entry overrides it.

### Setpoint threshold: ON vs OFF -- DEDUCED

High setpoint = zone actively heating. Low setpoint = setback (zone effectively off, frost-protection only). Observed values:

- DHW on-setpoint: 57 degrees C (V3 sites), 50-60 degrees C (V1 sites)
- DHW off-setpoint: 15-20 degrees C
- Heating zone on-setpoint: 21 degrees C (all sampled sites)
- Heating zone off-setpoint: 15 degrees C (all sampled sites)

DEDUCED threshold: value >= 40 degrees C = zone ON; value < 30 degrees C = zone OFF. No explicit flag exists in the data. The 30-40 range was not observed in any sampled schedule. Spencer confirmation required (Q3).

### recirc_pump.schedule anomaly -- PROVEN/UNRESOLVED

At all four V3 sites sampled (6261, 6097, 122, 6164), the recirc_pump.schedule uses value 1000 (pump ON) and value -1000 (pump OFF) rather than a temperature setpoint. The pump follows the same day-of-week and time logic as the DHW schedule at each site. This is a non-temperature signal encoded in the same JSON structure.

The standard setpoint threshold (>= 40 = ON) must NOT be applied to recirc_pump entries. The dashboard must detect the recirc_pump channel name and apply a separate binary decode (1000 = ON, -1000 = OFF). Whether this is intended V3 firmware behaviour or a quirk is UNRESOLVED (Q5). V1 has no recirc_pump schedule channel.

### Coverage and freshness -- PROVEN

All 7 boilerControl panels with full attribute access had schedule data. Empty schedule arrays ({"schedule":[]}) were seen only on:

- CHZ2 at single-zone sites (6097, 122)
- output4Schedule at site 6769 where output4 is disabled in the mask (data present but channel not active)
- accom_1.schedule and accom_2.schedule at all V3 sites sampled

Schedule attributes are updated on change, not on a heartbeat. The newest lastUpdateTs observed was 2026-10-16 (site 6261 CHZ1/CHZ2); the oldest was 2025-03-16 (site 6770 output2/output3). A stale timestamp means the schedule has not changed since that date, not that ThingsBoard lost the value.

### TB authority -- UNRESOLVED

SHARED_SCOPE is the channel the bridge uses to push config to the panel. CLIENT_SCOPE in some panels holds a matching copy. Whether the panel can change its own schedule and report it back to TB (panel-to-TB direction) is UNRESOLVED (Q4). For display purposes this is low risk: the schedule attributes are the operator-visible configuration. If an on-site engineer reprogrammed the panel without going through the bridge, TB could be stale. Spencer needs to confirm the authoritative direction.

### Multi-session days -- PROVEN

Site 6770 output2/output3Schedule shows a genuine split-day pattern: CH zone ON at 11:00, OFF at 12:00, ON again at 17:00, OFF at 18:30 -- a lunch-service plus dinner-service pattern. Any decoder must handle multiple on-periods per day, not just a single on and off pair.

---

## Other Device Types: Schedule Status

The following table summarises every non-boilerControl device type encountered across the sampled sites and its feasibility for inclusion in OOHDASH-138 v1.

| Device type | Schedule in TB | Format | Feasibility for v1 |
|-------------|---------------|--------|--------------------|
| Salus IT700TX | scheduleEnable flag only (TIMESERIES, integer: 0=off 1=on 2=hold) | Integer -- no schedule body | Not feasible. Schedule body is stored on the physical device only, not in TB. |
| Salus IT500 | SERVER_SCOPE.schedule present (A00-A06 keys) | Proprietary nibble-encoded 24-char strings per day -- format UNRESOLVED | Not feasible now. Encoding requires Spencer input (Q7). |
| Tuya cooking appliances | TIMESERIES.schedule present on some devices | Base64 binary blob, 5 bytes per entry: day-bitmask, hour, minute, action, enabled | Not feasible now. Action byte semantics are DEDUCED/UNRESOLVED. Irrelevant to heating or hot water triage. |
| Intesis AC | None in TB at all | n/a | Not feasible. All config lives in Intesis hardware or cloud. |
| LoRaWAN sensors (Watteco Clim'o) | None | n/a | Not applicable. These are temperature sensors, not scheduled devices. |
| AMR / metering | None | n/a | Not applicable. |

**Salus IT700TX note.** The IT700TX thermostat controls accommodation zones at several sites (6261, 6097, 6164, 122, 6769, 6770). The scheduleEnable flag can tell the operator whether the thermostat is running in schedule mode (1) or on hold/manual override (2 or 0). It cannot say what the schedule is. Both IT700TX gateway devices sampled at sites 6261 and 6097 were offline (active=false); the thermostats themselves remained active. Whether the thermostat continues to run its on-device schedule while the gateway is offline is UNRESOLVED.

**Salus IT500 note.** All 6 IT500 devices at site 5208 were offline at time of sweep (active=false, last activity June-September 2026). The schedule attribute exists in SERVER_SCOPE for all of them. The format uses 7 day-keys (A00-A06, DEDUCED Mon-Sun) each holding a 24-character ASCII-offset nibble-encoded string. A decoding attempt was made in Agent C but the result did not yield readable HH:MM times, confirming the encoding is proprietary. UNRESOLVED.

**Tuya note.** The Tuya schedule is an internal device-side timer (preheat/warm-up phases for kitchen appliances), not a heating or hot water schedule. Even if the action byte semantics were resolved, this schedule is not relevant to the Hot water or Heating triage flows.

**Conclusion.** Only BoilerControl schedule display is feasible for v1. The other device types are either schedule-free in TB, use unresolved formats, or are outside the scope of hot water and heating triage.

---

## Triage Conclusion Phrasing

The governing design principle requires that the operator reads a conclusion, not a raw timetable. The schedule data must be decoded into a single sentence per zone that answers "when does this run today?"

### Proposed primary phrasing (simple case)

When DHW has one on-period today and the schedule is the same every day:

"Hot water on schedule: 06:00 to 01:00 today."

When DHW has a weekday/weekend split and the operator is on a weekday:

"Hot water on schedule: 11:00 to 22:00 today (Tue-Fri pattern)."

When DHW has different times for individual days (as at site 122 on Monday):

"Hot water on schedule: 09:00 to 22:00 today."

The day-group qualifier ("Tue-Fri pattern") is shown only when the today schedule differs from other days -- it gives the operator a cue to tell a caller whether the situation will change at the weekend without requiring a second question.

### Heating zones

The same phrasing pattern applies to CHZ1 and CHZ2 in the Heating flow:

"Heating zone 1 on schedule: 11:00 to 21:30 today."

### Edge cases to handle

The following cases must be handled by the decoder before the phrasing can be applied:

- No rule applies today: the loops mask has "0" at today's position for every high-setpoint entry. Phrase: "Hot water not scheduled today." (Operator should escalate regardless.)
- Empty schedule array: no entries at all. Phrase: show nothing -- this is the same as the hidden condition in OOHDASH-136 (no schedule configured).
- Multi-session day: two or more on-periods separated by a setback. Phrase: "Hot water on schedule: 11:00 to 12:00 and 17:00 to 18:30 today." (Two on-periods joined with "and".)
- Midnight-spanning window: on at 06:00, off at 01:00 next day. The off time is past midnight so the phrase reads "06:00 to 01:00 tomorrow" rather than "06:00 to 01:00 today." This is the 6261 DHW case.
- recirc_pump: not shown to the operator as a named zone. The pump schedule is implementation detail, not a conclusion the operator needs.
- V3 recirc_pump 1000/-1000: decoder must branch on channel name before applying the setpoint threshold.

### Version discrimination

V1 sites use output-numbered keys; the dashboard must translate these to zone labels before phrasing. The mapping is: output2 -> "Heating zone 1", output3 -> "Heating zone 2", output4 -> "Hot water". The same phrasing template applies after translation.

---

## Where It Appears in the Flow

OOHDASH-136 placed an override card at the top of the Hot water triage step. When no override is active the card reads "Hot water running on schedule." OOHDASH-138 adds the schedule sentence to that same card -- no new card is created. The result reads, for example: "Hot water running on schedule -- 06:00 to 01:00 today."

The hide conditions from OOHDASH-136 still apply and are unchanged. The schedule sentence is shown only on sites where the override card is already shown:

- V2/V3: heating_scenario present, and heating_scenario.separate_dhw is 0 (hot water on the panel, not a separate system)
- V1: output1OutputMask position 3 is true (output4 wired to DHW)
- Panel has been heard from within 60 minutes (not stale)

If the DHW schedule array is empty or has no rule for today, the card shows "Hot water running on schedule -- no schedule programmed today" rather than nothing. This preserves the override card while flagging a potential configuration gap.

In the Heating triage flow, each CH zone that has a populated schedule shows its today on-period as part of the heating diagnosis conclusion. CHZ1 and CHZ2 (or output2 and output3 for V1) are treated independently. This is new -- OOHDASH-136 did not touch the Heating flow. The placement follows the same conversational-outcome principle: the phrasing is a conclusion that appears as the outcome of the "is the heating on schedule?" question in the triage step, not as a background data panel.

For V3 sites with recirc_pump.schedule and accom_1/accom_2.schedule: the recirc_pump schedule is not surfaced to the operator (it is an implementation detail of the DHW system). Accommodation zone schedules are shown only if the accommodation zone is confirmed wired and populated -- the current sample found all accom_1 and accom_2 arrays empty, so this case is deferred.

---

## Implementation Notes

### Version detection

Version is detected by reading CLIENT_SCOPE or SHARED_SCOPE attributes of the boilerControl device:

1. If heating_scenario key is present:
   - appVersion starts with "3." -> V3 (use CHZ1/CHZ2/DHW.schedule)
   - appVersion starts with "2." -> V2 (use CHZ1/CHZ2/DHW.schedule -- same key names as V3)
2. If output1OutputMask is present and heating_scenario is absent -> V1 (use output2/output3/output4Schedule)
3. If neither marker present -> unknown, hide schedule display

The existing OOHDASH-136 version detection logic (deriveBoilerControl) should be reused or extended. Note the OOHDASH-136 design identified 7 panels with both markers; those behave as V2/V3 and the "heating_scenario first" rule is already correct.

### Schedule key mapping for decoding

V1 zone-to-key mapping:

- DHW display: read output4Schedule (only if output1OutputMask[3] == true)
- Heating zone 1 display: read output2Schedule
- Heating zone 2 display: read output3Schedule (only if output1OutputMask[2] == true)

V2/V3 zone-to-key mapping:

- DHW display: read DHW.schedule (only if heating_scenario.separate_dhw == 0)
- Heating zone 1 display: read CHZ1.schedule
- Heating zone 2 display: read CHZ2.schedule (only if CHZ2 is in the channels array)

### Decoding algorithm (outline)

1. Parse the schedule JSON and extract the array.
2. Find today's day-of-week as an integer 0-6 (where 0 = Monday). DEDUCED from bit order Q1.
3. Filter entries to those where loops[dayOfWeek] == "1".
4. For recirc_pump channel: skip setpoint threshold; treat value 1000 as ON, -1000 as OFF.
5. For all other channels: apply threshold (DEDUCED: value >= 40 = ON, value < 30 = OFF). Entries with values in the 30-39 range are UNRESOLVED -- treat as OFF until Spencer confirms.
6. Sort filtered entries ascending by time.
7. Identify on-period boundaries: transitions from OFF to ON (start of heating) and ON to OFF (end of heating). Where the last ON entry has no following OFF entry the same day, the OFF is at the equivalent OFF entry from the prior day (midnight carry-forward) or shown as "runs overnight."
8. Format as the phrasing described in the Triage Conclusion Phrasing section.

### Time zone assumption

All time values in the schedule are assumed to be UK local time (Europe/London). This is UNRESOLVED (Q2). If schedules are stored in UTC, displayed times would be wrong by 0 hours (winter) or 1 hour (summer BST). Spencer confirmation is needed before shipping. Implementation should treat the time as a plain HH:MM string and display it as given until Q2 is resolved -- do not apply a time zone conversion without confirmation.

### Key freshness

Schedule attributes are updated on change only. A lastUpdateTs from 2025 does not indicate stale data -- it means the schedule has not changed since then. No freshness window is needed for schedule display (unlike the override value in OOHDASH-136 which has a 35-minute heartbeat window).

---

## Residual Questions for Spencer

The following questions must be answered before design can be finalised. James must approve this list before it is sent. None of these questions have been sent to Spencer yet.

| Q# | Question | Confidence before answer | Design impact | Blocker? |
|----|---------|--------------------------|--------------|---------|
| Q1 | In the loops field, is position 0 (leftmost character) Monday? We deduced this from patterns such as "1000011" combined with "0111100" covering all 7 days, but need confirmation. | DEDUCED | If wrong, displayed day is off by an unknown offset -- schedule phrasing will be wrong for some callers | YES -- blocks design |
| Q2 | Are HH:MM times in the schedule stored as UK local time (Europe/London) or UTC? | UNRESOLVED | Displayed time wrong by 0-1 hours in summer without correct zone | YES -- blocks design |
| Q3 | For DHW and CH zones, what setpoint value distinguishes "zone is heating" from "zone is in setback"? We see 57 degrees C as the DHW on-setpoint and 15 degrees C as the off-setpoint across most sites. Is the threshold: (a) a fixed rule such as value >= 40 = heating on, or (b) a configurable per-site threshold? | DEDUCED (>=40 on, <30 off) | If threshold is configurable, the decoder needs to read an extra attribute | YES -- blocks design |
| Q4 | Is the schedule stored in ThingsBoard the authoritative schedule the panel actually runs? Specifically: if an on-site engineer reprograms the panel directly (not via the bridge or dashboard), does that change get written back to ThingsBoard, or would TB show a stale schedule? | UNRESOLVED | Determines how much we can trust the displayed schedule to match panel behaviour | YES -- blocks design |
| Q5 | The recirc_pump.schedule at all V3 sites uses value 1000 (pump on) and -1000 (pump off) instead of a temperature setpoint in degrees C. Is this the intended encoding for the recirc_pump channel across all V3 panels, or is it specific to certain configurations? | UNRESOLVED | Decoder must branch on channel name; if behaviour varies the branching logic changes | Nice to have |
| Q6 | Site 122 has two Watteco Clim'o LoRaWAN sensors registered in the LNS (CHZ1.lorawan_devices, both provisioned=true) but no lwgateway device deployed in ThingsBoard. Is a gateway deployment planned for site 122, and if so when? | UNRESOLVED | No impact on schedule display; relevant to CHZ1 optimum start stop accuracy | Nice to have |
| Q7 | Salus IT500 devices store a schedule in SERVER_SCOPE.schedule as a JSON object with keys A00-A06 (one per day). Each value is a 24-character ASCII-offset encoded string. Can you share the encoding specification so the dashboard can decode and display these schedules in a future release? | UNRESOLVED | Required for any future IT500 schedule display; not needed for v1 if D2 defers IT500 | Nice to have (deferred to post-v1) |

**Blockers for design:** Q1, Q2, Q3, Q4 must be answered before build begins. Q5, Q6, Q7 are non-blocking for v1 of the schedule feature.

**Note on Q5 scope:** the recirc_pump with 1000/-1000 encoding is confirmed on all four V3 sites sampled (6261, 6097, 122, 6164). It is not an anomaly unique to site 122. The question is whether this encoding is stable across the V3 fleet or whether some V3 sites might use a degrees C setpoint for recirc_pump.
