<!--
gate:contract
TICKET: OOHDASH-139
PHASE: design
QUESTIONS:
Q1: James -- how should this ship? It is read-only (no new control), touches tb-device.js and flows.js, and fixes the mis-routing on every boilerControl site (213 registered). Ship it on its own as patch v1.4.7, or hold it and bundle it with the boost ticket OOHDASH-141?
Q2: James -- OOHDASH-135 Track 2 item 5 ("boiler panel readings") was held waiting on Spencer for key names, meaning and push cadence. This design answers all three from live ThingsBoard evidence and delivers those readings. Should item 5 be closed as superseded by OOHDASH-139?
SECTION: What we are building
Pub heating calls at boilerControl sites will finally show the pub's own boiler panel. Today the panel is mis-typed as a gateway and hidden, so the agent sees the accommodation Salus instead. After this change the site shows two chips: Accommodation (Salus) and Bar/Restaurant (the boiler panel). Choosing Bar/Restaurant gives a plain-English outcome based on what the panel is actually doing right now. It is read-only: nothing is sent to any device. Timed boosts are a separate ticket, OOHDASH-141.
SECTION: How the panel is read
The server already fetches every timeseries key for the panel. A new pure function, decodeBoilerHeating, turns the V1 or V2 key set into one common set of facts: is the panel reporting, is the boiler being asked for heat, and for each pub zone whether it is on, on a back-up cycle, or forced on/off at the panel and until when. It also decodes summer mode and the next timetable change. There are no new ThingsBoard reads and no extra round trips. The browser turns those facts into the agreed wording.
SECTION: What the operator sees
The agent asks one question: is the caller too cold, or too hot. They then get one of nine outcomes (W1 to W9), each with what to tell the caller and a ticket sentence. Examples are "Lighthouse is asking the boiler for heat" (call your heating engineer), "Part of the pub heating is off", "switched off on purpose at the panel", "summer mode" and "panel not reporting". The wording was approved by James on 2026-10-23 (D1).
SECTION: What we deliberately leave out
Valve-alarm flags and ThingsBoard alarm records are not used. The V1 flags stopped reporting around Dec-2025 to Feb-2026, and the alarm records are months old and unmanaged (James D2; alarms are a separate workstream). The warm-weather flag is not used either, because it does not stop heating. Accommodation zones on V2 panels and hot water stay with Salus and OOHDASH-136 respectively.
DECISION: How should OOHDASH-139 ship? | Its own patch release v1.4.7 as soon as it is built and tested (recommended) | Hold it and release together with the boost ticket OOHDASH-141
DECISION: OOHDASH-135 Track 2 item 5 (boiler panel readings, waiting on Spencer) | Close it as superseded by OOHDASH-139 (recommended) | Keep it open
-->

# OOHDASH-139 Design: show the pub boiler panel in the heating flow

**Date:** 2026-10-23 · **Phase:** design · **Discovery:** PR #130 (merged, 68695a9) · **Sibling:** OOHDASH-141 (timed boost; discovery running in a separate session)

## 1. Summary

Every boilerControl site (213 registered) has its pub heating controlled by a Lighthouse boiler panel. The dashboard never shows that panel. The classifier types it as a gateway, so a pub heating call lands on the co-located accommodation Salus instead. This design:

1. classifies the panel correctly (by its ThingsBoard profile);
2. places it in the **Bar/Restaurant** area;
3. decodes its live state server-side into one common shape for V1 and V2;
4. replaces the dead "monitored only" branch with a state-first decision tree and the approved wording.

It is **read-only**: no device writes, no new control and no new ThingsBoard reads.

## 2. Decisions already made by James (2026-10-23)

| # | Decision | Answer |
|---|---|---|
| D1 | Operator wording W1 to W9 plus the forced-on extra sentence | Approved |
| D2 | Show valve alarms or panel alarms to the operator | No (alarms are a separate workstream) |
| D3 | The boiler panel is the Bar/Restaurant chip; Accommodation stays on Salus | Yes |
| D4 | Redraft the discovery escalation email to Sam | No, not an action; dropped |
| Split | Timed boost ON/OFF | Separate ticket OOHDASH-141 (route A direct; fixed limited durations; pub heating never runs past 01:00 or starts before 07:00) |

## 3. Live evidence that shaped the design

This is all from read-only ThingsBoard GETs on 2026-10-23: spot checks on 6863, 6261 and 4741, then a 21-day history sweep of 135 V1 and 43 V2 panels (400 days for alarm flags), plus the 60-day audit log.

| Topic | Verdict | Evidence | Design consequence |
|---|---|---|---|
| Override direction | PROVEN | Sign = direction. V1 negative with zone off: 72,520 samples vs 16 on. 7639: negative CHZ1 override turned the zone off within the same second | Decode forced on/off from the sign |
| Override end time | PROVEN | V2 is a signed epoch-seconds end time (e.g. 22:00). V1 is a signed epoch-ms rolling now+15 min heartbeat with no real end | V2 shows "until HH:MM"; V1 shows "held" |
| Warm-weather flag | PROVEN, does not block | tempBasedSummerMode true on 106 of 135 V1 and 35 of 42 V2 in cold weather; zones run regardless | Not used as a cause |
| Summer mode | PROVEN, blocks | summerModeActive / summer_mode true and no override: zones off 99% of the time; an override beats it | Outcome W4 |
| V1 valve-alarm flags | PROVEN, stale | 352 of 384 cleared historically; V1 stopped reporting them around Dec-2025 to Feb-2026 (median age 263 days) | Not used |
| Panel alarm records | Months old, unacknowledged | 6863: 6 open, oldest Nov-2025. 4741: 8 open, oldest Sep-2025 | Not used (D2) |
| Key freshness | PROVEN | State keys report on change (V2 state 4 h old while the panel reported seconds ago) | Liveness uses lastActivityTime only |
| Temperature sentinels | Seen | V2 room_temp -273.15 (no sensor), accom_2.flow_temp 327.7 | Drop values outside -30 to 110 °C |
| V1/V2 discriminator | PROVEN | SERVER_SCOPE tags (boilercontrol / boilercontrol_v2) agrees with the existing code rule | Reuse the decodeDhwOverride rule (heating_scenario means V2; output1OutputMask means V1) |

## 4. Code changes

### C1. Classify the panel by profile (services/tb-device.js, classifyDevice ~:417)

Insert directly after the refrigeration deny (:427-429). When `profile === 'boilerControl'`, return kind `heating`, deviceType `boiler-panel`, label `Pub boiler panel`, `controllable: false`, `control: null`. The profile is authoritative (every panel carries it), so this cannot bleed onto other devices.

We deliberately do **not** add an ASSET_INTENT `boilercontrol` row. The contained-by match in matchAssetIntent (:520) would let a bare `boiler` name token (for example a member of a `boiler` gateway group) match it, which is the same bleed class OOHDASH-108 closed.

Today the panel falls to the default `{ kind: 'unknown', deviceType: 'gateway' }` (:461-462). That is RC1 to RC3.

### C2. Area: panel is Bar/Restaurant (tb-device.js, deriveArea :598)

Add a `boiler-panel` branch returning `Bar/Restaurant`, and update the doc comment at :567. This is supported by the panel's alarm relation `toRestaurant` and the V2 `heating_scenario.restaurant`, while Salus covers accommodation (RC6). A typical site then shows the Accommodation and Bar/Restaurant chips side by side.

### C3. New pure decoder decodeBoilerHeating (tb-device.js, beside decodeDhwOverride ~:937)

Signature: `decodeBoilerHeating(sharedScope, clientScope, panelLastSeenMs, telemBag, now)`. It never throws (wrapped like `_decodeDhwOverrideInner`) and returns:

| Field | Meaning |
|---|---|
| visible | false when there is no V1/V2 discriminator or no zone state at all |
| version | v1 or v2 |
| panelLastSeenMs, stale | stale when the panel last reported more than config.boilerPanelStaleThresholdMinutes (60) ago, or never |
| boilerCalling | boiler relay state (true, false or null) |
| zones | one entry per configured pub zone: n (1 or 2), on, fallback, forced (on, off or null), forcedUntilMs (V2 only), held (V1 only), roomTemp |
| summerMode | the real summer block |
| nextChange | the existing decodeDeviceSchedule text, or null |

Key map, pub zones only (hot water stays with OOHDASH-136; V2 accom_1 and accom_2 are out of scope):

| Fact | V1 key | V2 key |
|---|---|---|
| Boiler asked for heat | output1State | boiler.enable_output_state |
| Pub zone 1 on / back-up / override | output2State, output2FallbackEnabled, output2Override (ms) | CHZ1.output_state, CHZ1.fallback_enabled, CHZ1.override (s) |
| Pub zone 2 | output3State, output3FallbackEnabled, output3Override | CHZ2 equivalents |
| Zone configured | output1OutputMask index 1 and 2 true | CLIENT CHZ1.enabled / CHZ2.enabled (falls back to key present) |
| Room temperature | roomSensor1Temp, roomSensor2Temp (shown as site readings) | CHZ1.room_temp, CHZ2.room_temp |
| Summer block | summerModeActive | summer_mode |

Override rules:

- Forced **off** is reported only when the override is negative AND the zone is off.
- Forced **on** is reported only when the override is positive AND the zone is on.
- When the override and the live state disagree, the override is ignored. Stale and cancelled overrides exist (6225), so the live state always wins.
- A V2 magnitude below 1e12 is seconds; multiply by 1000.

Not read: valve-alarm flags, alarm records, tempBasedSummerMode, contractor_override.

### C4. Attach it to the site (tb-device.js ~:1399-1409, :1481)

- Set `boilerControlField.heating = decodeBoilerHeating(...)` from the same bag already used for dhwOverride.
- Add `heating: null` to the no-panel default (:1409) and the fixture default (:1481).
- Add `CHZ1.enabled` and `CHZ2.enabled` to the existing boilerControl CLIENT_SCOPE key list (:1202). It is the same request, with no extra round trip.

### C5. mapTelemetry: no change

The decoder reads the raw bag, as OOHDASH-136 does. Putting panel-only keys into every device's canonical telemetry would spread V1/V2 branching across all consumers.

### C6. heatingDevices (public/js/flows.js :124-131): comment only

It already admits `boiler-panel`. C1 alone makes the panel visible.

### C7. Heating flow branch (flows.js :728-822)

- When the chosen area's device set contains a `boiler-panel`, route to the new panel branch **before** areaRepresentative and the no-online-device connectivity diversion. A stale panel therefore gets its own outcome (W1), not the generic gateway flow. The panel wins over any iT500 `r`-letter device in the same area.
- The readout line replaces the single-temperature read, for example: Pub zone 1 on · Pub zone 2 off · room 18.7 °C / 19.3 °C · panel reported 2 min ago.
- Question: "What does the caller need?" with two chips, **Too cold / not working** and **Too hot / wants it off**.
- New browser function `boilerHeatingOutcome(heating, need, nowMs)` returns state, headline, explanation, script, ticketSentence and actions. Staleness is re-checked at render time. Wording lives only in the browser, so there is no server twin and no lock-step risk.
- Outcomes go through the existing outcomeCaptured, outcomeScope and outcomeNoAction helpers. Capture class `boiler-panel-heating` is kept, and `boiler-panel-advice` is added for the engineer-advice path.
- **Live defect removed:** flows.js:798 (shipped in v1.4.6, PR #129) has curly quotes inside `onclick`, which is a script error, so both buttons are dead. The branch is unreachable on the live path today; the replacement removes it.

### C8. Scope row and existing tests

- The `liveNote` boiler text (:782-783) is replaced by the readout.
- Expected deltas:
  - test/area-derivation.test.js:69-70: boiler-panel now resolves to Bar/Restaurant.
  - test/boilercontrol-scope.test.js BC-4a: a panel site now has a heating device, so the heating scope becomes monitored.
  - tests/boilercontrol.spec.js BC-E4: recheck.
- Fixture site 6883 has no `heating` field, so it shows W1.

## 5. Decision tree (state-first)

Bar/Restaurant chosen and the area has a boiler panel:

- **W1 Can't check right now:** heating not visible, or the panel is stale (over 60 minutes) or has never reported.
- Otherwise ask: too cold, or too hot.
- **Too cold / not working**, first match wins:
  1. any pub zone on the back-up (fallback) cycle → **W7**
  2. boiler asked for heat and every pub zone on → **W2** boiler-side fault, call the heating engineer
  3. an off zone forced OFF at the panel → **W5** switched off on purpose
  4. some pub zones on, some off → **W3** part of the heating is off
  5. nothing on and summer mode → **W4**
  6. nothing on, otherwise → **W6** off on its timetable (with the next change if known)
- **Too hot / wants it off:** any pub zone on → **W8** on and can't be switched off from here; nothing on → **W9** already off.
- Forced ON add-on sentence, added to any outcome when a zone is forced on and actually on: "Pub zone N has been switched on at the panel (until HH:MM on V2, or being held on for V1)".

V1 and V2 behave identically from this point, because the decoder has already normalised them.

## 6. Approved wording

The full wording for W1 to W9 (headline, operator explanation, script for the caller, ticket sentence and buttons) is in the review mockup committed with this design: docs/project/oohdash-139-design/wording-mockup.html. James approved it on 2026-10-23 (D1). The build must use it verbatim. Bracketed parts are filled from the decoded facts.

## 7. Tests the build must add

| Area | Cases |
|---|---|
| decodeBoilerHeating unit | V1 all on; V2 all on; partial; forced off V1 (held) and V2 (until); forced on agree / disagree (ignored); fallback; summer; stale; never reported; no discriminator; sentinel temperatures dropped; V2 seconds vs V1 ms; zone not configured |
| boilerHeatingOutcome unit | each of W1 to W9 plus the add-on, for both needs; staleness re-check at render |
| classifyDevice / deriveArea | profile boilerControl gives boiler-panel; a `boiler` name token alone does not; boiler-panel gives Bar/Restaurant |
| e2e (Playwright) | V1 fixture site and V2 fixture site: both chips show; Bar/Restaurant reaches the right outcome; buttons work (guards the curly-quote defect) |
| Regression | Accommodation (Salus) flow unchanged; hot-water flow (OOHDASH-136) unchanged |

## 8. Cost, risk and rollout

- No new ThingsBoard reads, polling or LLM calls. Everything rides the existing 30-second workspace refresh.
- Risk: sites whose panel is offline now show W1 where the agent previously saw (wrong) accommodation data. That is the honest outcome.
- Rollback is a straight revert. There are no data migrations and no config flags.
- Release shape is James's decision (see the gate questions).
