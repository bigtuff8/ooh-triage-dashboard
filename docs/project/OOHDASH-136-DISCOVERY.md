<!-- gate:contract
TICKET: OOHDASH-136
PHASE: discovery
QUESTIONS:
Q-A: Spencer - V1 output4Override negative values: two panels (gk-4631 and gk-220) produced a single negative value following the same row_ts + 900s pattern as their positive values. What does a negative output4Override mean - is it a forced-off override distinct from 0, or a firmware variant / encoding artifact? (low-priority; only 2 occurrences across all V1 panels sampled)
Q-B: Spencer - V2 separate_dhw=1 sites: the boilerControl panel at these sites has DHW.override telemetry and the field changes (gk-6263 had an active override). Does a DHW override on a panel where separate_dhw=1 actually control the hot water, or is it a separate output that does not affect the hot-water cylinder? This determines whether the dashboard should show DHW override state for those panels.
DECISIONS:
D1: V2 OFF-until display | show "Override OFF until [HH:MM]" (time is proven reliable - same seconds encoding as ON) | show "Override OFF" with no time (simpler) | show "Override OFF until [HH:MM]" with fallback to "Override OFF" if time implausible
D2: V1 display label | "DHW zone: Active/Inactive" (neutral - avoids calling demand-driven signal an override) | "DHW demand: Active/Inactive" (precise but may confuse operators) | "DHW output: ON/OFF" (raw output terminology)
D3: V2 separate_dhw=1 gate | hide DHW override row entirely for separate_dhw=1 sites (DEDUCED: panel output may not be the DHW cylinder) | show with note "DHW on separate system" | show without qualification (may mislead)
D4: V1 output1OutputMask gate | hide DHW zone row when mask bit 3 = false (output 4 is not wired to DHW) | show with note "DHW output not configured" | always show output4Override state regardless of mask
SECTIONS:
- What This Discovery Is For
- What Track 1 Already Shipped
- Cost and Background-Running Posture
- Key Findings: V2 DHW.override Encoding
- Key Findings: V1 output4Override Encoding
- Key Findings: Version Discrimination
- Key Findings: DHW Wiring Gates
- Key Findings: Staleness
- Key Findings: contractor_override
- Revised State Display Spec
- Build Plan Corrections Required
- Residual Third-Party Questions
- Evidence Confidence
-->

# OOHDASH-136 Discovery: DHW Override State Display - V1 and V2 boilerControl Panels

## What This Discovery Is For

This ticket is the second track of OOHDASH-135. Track 1 (v1.4.3, shipped 20 October) added boilerControl panel recognition and the heating scope row for C&B sites. Track 2 adds one piece of read-only information: does the panel currently have a domestic hot water override active, and if so, what does it say? No control command is added. The operator sees this as a status row in the heating or hot water flow — it tells them whether the IoT team has already set an override and what it says, so they can advise the caller or escalate appropriately.

This discovery is unblocked because Spencer Thompson answered the two outstanding questions (Q1 and Q3 from the OOHDASH-136 Jira ticket, comment 41445, 2026-10-21). This document adds live TB evidence on top of Spencer's answers and corrects several assumptions in the OOHDASH-135 Build Plan spec.

## What Track 1 Already Shipped

v1.4.3 is live. It added the boiler-panel deviceType label in classifyDevice, the 'mon' scope entry for boilerControl sites, and the read-only branch in flows.js that shows "The IoT team controls this panel directly from ThingsBoard" with an escalate button. The DHW override row was intentionally left blank pending this discovery. Track 2 fills that blank. Nothing from Track 1 needs to be changed.

## Cost and Background-Running Posture

**Token and cost efficiency.** The DHW override state is decoded from ThingsBoard telemetry on the same per-panel on-demand GET request that fires when an operator opens a panel card. The two additional telemetry keys — DHW.override for V2 panels; output4Override for V1 panels — are appended to the existing keys list in the same HTTP request body. The V1 wiring gate attribute (output1OutputMask) is already present in the SHARED_SCOPE attributes call Track 1 established; reading index 3 adds no new request. The V2 version attribute (heating_scenario) is likewise already fetched from CLIENT_SCOPE for existing heating-scenario display purposes. Net additional ThingsBoard API calls per panel card load: zero. No LLM inference is involved; DHW state is a deterministic decode of a numeric field. Recurring cost introduced by Track 2: none.

**Silent background running.** No new polling loop, daemon, timer, WebSocket subscription, scheduled task, or watcher of any kind is added. DHW state is fetched strictly on demand when the operator views a panel card. The panel card already has a manual refresh action; no automatic background re-poll is proposed. When no operator is viewing a panel, zero tokens, zero API calls, and zero machine resource are consumed. This satisfies the silent-running criterion in full: the feature is invisible across the entire computer while idle, and spends nothing when it has no work to do.

**What this does not change.** These criteria do not preclude the feature. They are met without compromise.

## Key Findings: V2 DHW.override Encoding

The V2 DHW.override encoding is now fully proven from live data. The field in ThingsBoard telemetry is a string containing an integer. The integer has three possible forms.

Zero means "Auto — running on schedule". The panel is not in any override state.

A positive integer is an epoch timestamp in SECONDS representing when the override expires. The override is ON (the IoT team has commanded hot water to run) until that time. The panel self-clears to zero when the time passes. Across 8 sites and 50+ data rows, every positive value decoded to a sensible near-future time (22:00, midnight, next-day boundary), confirming the "until" framing. The units are seconds, not milliseconds.

A negative integer is the same "until" timestamp but negative, meaning the override is OFF (hot water suppressed) until that time. Magnitude = |value|, same seconds encoding. This was seen twice in the live data: once where a panel went from negative to zero within 7 minutes (the operator cancelled the override), and once where a panel went from negative to the same magnitude positive (the operator changed from "OFF until 22:00" to "ON until 22:00" without touching the target time).

Spencer's simplified description of "0=AUTO, 1=ON, -1=OFF" is confirmed by the data at scale: the literal values 1 and -1 were never observed in practice. Real overrides carry a realistic future timestamp, positive or negative depending on the override direction. The raw "1" or "-1" values described in Spencer's answer were shorthand for the sign encoding, not literal values the panel ever writes.

## Key Findings: V1 output4Override Encoding

V1 panels use output4Override differently from how the spec assumed. This is a significant correction.

The field is a continuous demand heartbeat, not an operator-set override. When DHW demand is active, the panel writes a new value every 15 minutes. The value is a millisecond epoch timestamp equal to the row timestamp plus exactly 900,000 milliseconds (15 minutes). In plain language: "DHW demand is ON, and this reading is valid for the next 15 minutes." When demand ends or the panel goes offline, the field reverts to zero.

Spencer's best-guess in his answer was that the magnitude is "the timestamp when it was switched off (ms or s)". The live data shows it is ms and the value is always row_ts plus 900 seconds — it is a rolling "valid until" timestamp, not a one-time write timestamp. The units are confirmed as MILLISECONDS (not seconds; every value is 13 digits and decodes to a realistic current date as ms).

Negative values were observed on two V1 panels (gk-4631 and gk-220), each occurring once. Both negative values followed the same row_ts + 900s pattern as positive values, just negative. The meaning is not confirmed from data alone (see Q-A for Spencer). For the display spec these are treated as "DHW output inactive" since they are extremely rare (2 out of hundreds of rows across all V1 panels).

Corrupted values: some V1 panels produce occasional values with more than 20 digits (e.g. 3206869449881746000000000). These appear to be floating-point encoding artifacts in the bridge telemetry pipeline and cannot be decoded as dates. The digit-count pre-check catches these obvious cases. Shorter corrupted values (13–14 digits that still parse as a number) are caught by the plausibility window in the display spec below — see the Revised State Display Spec for the combined guard.

The important implication: V1 output4Override is not an "override" in the operator sense. It is a real-time demand signal. The display should not say "Override ON" for a V1 panel; it should say "DHW zone: Active" or "DHW zone: Inactive".

## Key Findings: Version Discrimination

**The prior Build-Plan discrimination rule — checking DHW.override telemetry recency — has a critical silent failure mode and must not be used. The correct approach is durable attribute presence.**

The prior spec proposed: "check DHW.override has a non-null value within the last 24 hours; if yes, V2." DHW.override is event-driven — it writes on set, cancel, or expiry only. A healthy V2 panel running on schedule with no recent override will not write to DHW.override for weeks or months. Applying the 24-hour window to such a panel returns no recent row. The panel gets classified as unknown or offline. Its DHW row is hidden. The operator sees nothing — no stale-data warning, no visible failure — because the panel is live, just idle. This is the silent single point of failure the prior spec accepted without examination.

**The correct discrimination uses durable static attributes, which are already fetched.**

V2 panels have heating_scenario in CLIENT_SCOPE attributes. This field is written once at provisioning and does not depend on recent operator activity. It is already fetched by Track 1 for the heating-scenario display row. If heating_scenario is present in CLIENT_SCOPE: the panel is V2. Read DHW.override telemetry for state.

V1 panels have output1OutputMask in SHARED_SCOPE attributes. This field is a static JSON array written at wiring configuration. It is already fetched by the existing SHARED_SCOPE attributes call. If output1OutputMask is present in SHARED_SCOPE and heating_scenario is absent from CLIENT_SCOPE: the panel is V1. Read output4Override telemetry for state.

If neither attribute is present: the panel version cannot be confirmed. Classification is "unknown / offline" and no DHW row is shown. This is the legitimate unknown state — not a misclassification of a healthy idle panel.

| Condition | Classification | DHW data source |
|---|---|---|
| heating_scenario in CLIENT_SCOPE | V2 | DHW.override telemetry |
| output1OutputMask in SHARED_SCOPE, no heating_scenario | V1 | output4Override telemetry |
| Neither attribute present | Unknown / offline | No DHW row shown |

The attribute fetch for both fields is already in-flight for Track 1 features. No new API call is added for discrimination.

## Key Findings: DHW Wiring Gates

Not every boilerControl panel has DHW wired. The display should only show DHW state where DHW is actually connected.

For V2 panels: heating_scenario.separate_dhw = 0 means DHW is on this panel. separate_dhw = 1 means DHW is on a separate system (for example a gas cylinder) and the panel does not control it. The dashboard already reads heating_scenario for other purposes (the field is in CLIENT_SCOPE). Whether to show DHW.override state when separate_dhw = 1 is DECISION D3 for James.

For V1 panels: output1OutputMask is a JSON array [boiler, CH1, CH2, DHW]. Index 3 (DHW) = true means the fourth output is wired as a DHW zone. output4Override tracks the state of output 4 regardless of what it is wired to. If index 3 = false, output4Override should NOT be shown as a DHW state (it is some other output). This is DECISION D4 for James — the recommendation is to gate on index 3 = true.

Panels sampled (V1 wiring): gk-220 has DHW wired (index 3 = true), gk-4331 has DHW wired, gk-1736 has DHW wired, gk-1597 has DHW wired. gk-2933, gk-4631, gk-4741, gk-6769 do NOT have DHW wired (index 3 = false) even though they have output4Override data.

## Key Findings: Staleness

The BUILD-PLAN provisional 5-minute staleness threshold must be changed to 60 minutes. The 5-minute figure was acknowledged as a placeholder pending Spencer confirmation.

For V2 panels: DHW.override is event-driven only (writes on set, cancel, or expiry). A healthy V2 panel will not write DHW.override every few minutes. Staleness cannot be detected from the DHW.override key alone. Use lastActivityTime from the TB device list (already fetched) or another regularly-updating telemetry key.

For V1 panels: The 15-minute heartbeat means output4Override is re-written every 15 minutes while DHW is active. If the latest row for output4Override is older than 20–25 minutes and the value was non-zero, either the demand ended (value would have gone to zero) or the device is offline. lastActivityTime is the reliable signal for offline detection.

The 60-minute threshold is conservative and may include up to 1 false-positive stale reading (a device that reported 59 minutes ago). The 3-hour threshold that cleanly separates live from dead in the estate sweep is too generous for a display context where stale data could mislead the operator. 60 minutes is the recommended value for BOILER_PANEL_STALE_THRESHOLD_MINUTES.

## Key Findings: contractor_override

contractor_override was observed at gk-6261 with value "1" at the same timestamp as a DHW.override change (2026-10-11). It then reverted to 0. The value appears to be a "contractor on site" flag written alongside the DHW override to identify who made the change. It does not alter the DHW state and does not need to appear in the display. The dashboard can safely ignore it.

## Revised State Display Spec

The revised state list for the DHW override row, per panel version. All decoded times use UK local time, HH:MM, with "today" or "tomorrow" if the date differs from now. Raw epoch numbers must never be shown to the operator.

**V2 DHW.override states** (shown only when heating_scenario.separate_dhw = 0, or per DECISION D3):

| DHW.override value | Decoded condition | Display |
|---|---|---|
| 0 | Auto mode | "Running on schedule" |
| Positive integer | value × 1000 within plausibility window AND > Date.now() | "Override ON — hot water running until [HH:MM today/tomorrow]" |
| Positive integer | value × 1000 within plausibility window AND ≤ Date.now() (expired, not yet cleared) | "Override just ended — running on schedule" |
| Negative integer | |value| × 1000 within plausibility window AND > Date.now() | See DECISION D1 |
| Any non-zero value | Decoded time outside plausibility window | "Cannot confirm DHW state — data implausible" |
| Panel stale (60 min) | — | "Stale data — cannot confirm DHW state" |

**V2 plausibility window.** After computing `untilMs = value * 1000`, the decoded time is plausible only if it falls within `[Date.now() − 6 h, Date.now() + 365 d]`. The lower bound (6 h in the past) catches the "Override just ended" case gracefully. The upper bound (365 d ahead) catches any version-misclassification artefact: a V1 millisecond value decoded as V2 seconds produces a year-58000+ epoch and is rejected immediately. Any value outside the window degrades to "Cannot confirm DHW state — data implausible" rather than displaying a confidently wrong override time. This is the defence-in-depth layer; the primary protection is the attribute-based version discrimination above, which prevents the misclassification from reaching this decoder in the first place.

**V1 output4Override states** (shown only when output1OutputMask index 3 = true, per DECISION D4):

| output4Override value | Decoded condition | Display |
|---|---|---|
| 0 | Inactive | See DECISION D2 ("DHW zone: Inactive") |
| Positive integer | Digit count > 20 | Corrupted — treat as inactive |
| Positive integer | value within plausibility window AND > Date.now() | See DECISION D2 ("DHW zone: Active") |
| Positive integer | value outside plausibility window | Implausible — treat as inactive |
| Positive integer | value ≤ Date.now() | Expired — treat as inactive |
| Negative integer | Any | Treat as inactive (see Q-A) |
| Panel stale (60 min) | — | "Stale data — cannot confirm DHW state" |

**V1 plausibility window.** After parsing `valueMs = output4Override` (positive, ≤ 20 digits), the value is plausible only if it falls within `[Date.now() − 20 min, Date.now() + 25 min]`. Valid heartbeats are `row_ts_ms + 900,000` — at fetch time they are at most 15 min + fetch-lag ahead of the current clock, never multiple hours or days forward. This window catches corrupted 13-or-14-digit values that the digit-count pre-check misses: a 14-digit value decoding to a date one month from now (for example) fails the +25-min bound and is treated as inactive rather than active. The dual guard — digit-count pre-check for obviously out-of-range values, plausibility window for the residual — ensures that any encoding artifact degrades to the safe default ("inactive") not to a false "Active" reading.

## Build Plan Corrections Required

Eight items in the OOHDASH-135 BUILD-PLAN need correcting before Track 2 code is written.

**Correction 1 — units bug (line ~249).** The spec reads "boilerDhwOverrideActive = Date.now() less than boilerDhwOverrideUntil". This is wrong: Date.now() is milliseconds, DHW.override is epoch seconds. The correct logic is: multiply DHW.override by 1000 before comparison with Date.now(). boilerDhwOverrideUntil must be stored in MILLISECONDS in the workspace payload.

**Correction 2 — missing OFF state for V2.** The spec only handles positive DHW.override values (ON state). It does not handle negative values (OFF state). The workspace payload needs a second boolean field: boilerDhwOverrideOff (true when DHW.override is negative and |value × 1000| is in the future and within the plausibility window) and boilerDhwOverrideOffUntilMs for the UI to format the time.

**Correction 3 — T2-6 test rewrite.** The test fixture uses "output1OutputMask: 8 (bit 3 set)" to show "Output 1 DHW: ON". This conflates the wiring capability attribute with live telemetry state. The correct V1 live key is output4Override. T2-6 must be rewritten: fixture should set output4Override to a positive ms value within the plausibility window (i.e. Date.now() + 600,000), and the expected result is "DHW zone: Active". A second fixture should set output4Override = 0 and expect "DHW zone: Inactive". A third fixture should set output4Override to a value > Date.now() + 25 min and expect "inactive" (plausibility rejection). The output1OutputMask wiring gate (index 3 = true/false) should be a separate fixture testing the hide-when-unwired case.

**Correction 4 — BOILER_PANEL_STALE_THRESHOLD_MINUTES.** Change from 5 to 60.

**Correction 5 — V1 encoding in W5-B (mapTelemetry).** The field boilerOutputMaskDhwBit is no longer the right thing to compute from output1OutputMask. Instead compute: boilerDhwZoneActive = (output4Override is a positive integer within the plausibility window AND output4Override > Date.now()), AND boilerDhwOutputWired = (output1OutputMask[3] === true). The raw boilerOutputMask field can remain for debugging but is not the display value. The corruption and plausibility checks (digit count and window) must be applied before evaluating boilerDhwZoneActive.

**Correction 6 — discrimination rule in W5-B/W5-C (MAJOR).** The prior spec proposed checking DHW.override telemetry recency (non-null within 24 h) to identify V2 panels. This is wrong: DHW.override is event-driven and a healthy idle V2 panel will have no recent write, causing it to be silently misclassified as unknown. The discrimination must use static attributes: (a) if heating_scenario is present in CLIENT_SCOPE → V2; (b) if output1OutputMask is present in SHARED_SCOPE and heating_scenario is absent → V1; (c) if neither → unknown / no DHW row. Both attribute calls are already in-flight for Track 1 features. No additional API call is needed.

**Correction 7 — staleness signal in W5-C.** boilerPanelStaleMinutes computed from lastActivityTime. This approach remains correct; the threshold constant must be 60, not 5.

**Correction 8 — plausibility guards on both decoders (NEW).** The V2 decoder must apply the `[Date.now() − 6 h, Date.now() + 365 d]` window to `value * 1000` before any display formatting. The V1 decoder must apply the `[Date.now() − 20 min, Date.now() + 25 min]` window to the parsed integer before classifying as active. Values outside the window in either decoder must produce the degraded state ("Cannot confirm" for V2; "Inactive" for V1), never a formatted time or an "Active" label. These guards are the defence-in-depth layer against version misclassification; they are not a substitute for correction 6.

## Residual Third-Party Questions

Two questions remain for Spencer Thompson. Both are low-priority and do not block the display for the most common states.

Q-A concerns V1 negative output4Override values. Only two occurrences were observed across the whole V1 sample. The current spec treats negative as inactive (same as zero). If Spencer confirms negative means "a specific forced-off state distinct from zero", the display may need a third V1 state label. Otherwise the current treatment is safe.

Q-B concerns V2 separate_dhw=1 sites. The boilerControl panels at these sites do have DHW.override telemetry and it does change. If Spencer confirms that the panel's fourth output controls something real on these sites, the display should show it. If not, the display should hide it. The code path already has the heating_scenario field available; implementing either answer is a one-line gate.

Neither question blocks the first implementation. The build should implement with a safe default (hide for separate_dhw=1; treat V1 negative as inactive) and update the gate constant if Spencer changes the answer.

## Evidence Confidence

All V2 findings are PROVEN from live ThingsBoard data (read-only GET requests, 2026-10-21). Eight V2 sites sampled, 8 panels, 80+ data rows across 30 days. The positive encoding (seconds, ON-until), the zero state (AUTO), and the negative encoding (OFF-until, same magnitude) are all confirmed by multiple independent panels. contractor_override co-occurrence is observed but its meaning is DEDUCED. V2 separate_dhw gating is DEDUCED from the heating_scenario field semantics.

V1 findings are PROVEN from live ThingsBoard data (2026-10-21). Eight V1 panels sampled, 200+ rows across 180 days. The 15-minute ms heartbeat pattern is proven with mean diff = exactly 900 seconds across 197 analysed rows. The negative-value meaning is UNVERIFIED (Q-A). The output1OutputMask wiring gate is PROVEN from the attribute data.

Version discrimination via attributes: heating_scenario in CLIENT_SCOPE is PROVEN present for all 8 V2 panels sampled. output1OutputMask in SHARED_SCOPE is PROVEN present for all 8 V1 panels sampled. No panel had both attributes simultaneously. The attribute-based discrimination rule is empirically supported across the full sample.

Plausibility windows: DEDUCED from the proven encoding properties (V1 heartbeat = row_ts + 900 s; V2 overrides are near-term future epochs). The specific bounds (V1 ±20–25 min; V2 −6 h to +365 d) are conservative estimates chosen to pass all observed valid data while rejecting all observed corrupted or cross-version values.

Staleness: 60-minute threshold is PROVEN from the estate sweep (OOHDASH-135 prior investigation). V1 heartbeat frequency is PROVEN as 15-minute.

Spencer's Q1/Q3 answers (Jira comment 41445, 2026-10-21): sign encoding for V2 is CONFIRMED and matches the data. output4Override as the V1 key is CONFIRMED. Unit determination (ms vs s per key) is now PROVEN from data and supersedes Spencer's "best guess" on units.

---

## Evidence Appendix

The table below records the specific data points used to support the findings above. This is the raw evidence layer; the findings sections above are the conclusions drawn from it.

| Device | Ver | Key | Raw value | Decoded | Row ts (UTC) |
|---|---|---|---|---|---|
| gk-7773-boilercontrol-1 | V2 | DHW.override | 1792490400 | ON-until 2026-10-20T10:00:00Z (seconds) | 2026-10-20T09:34:30Z |
| gk-7773-boilercontrol-1 | V2 | DHW.override | 0 | AUTO | 2026-10-20T10:00:00Z |
| gk-7773-boilercontrol-1 | V2 | DHW.override | 1792404000 | ON-until 2026-10-19T10:00:00Z (seconds) | 2026-10-19T09:20:11Z |
| gk-7639-boilercontrol-1 | V2 | DHW.override | -1791583200 | OFF-until 2026-10-09T22:00:00Z (seconds, neg) | 2026-10-09T12:42:16Z |
| gk-7639-boilercontrol-1 | V2 | DHW.override | 1791583200 | ON-until 2026-10-09T22:00:00Z (seconds, pos) | 2026-10-09T15:09:47Z |
| gk-7639-boilercontrol-1 | V2 | DHW.override | 0 | AUTO (override expired) | 2026-10-09T22:00:10Z |
| gk-6263-boilercontrol-1 | V2 | DHW.override | -1791583200 | OFF-until 2026-10-09T22:00:00Z (seconds, neg) | 2026-10-09T09:11:36Z |
| gk-6263-boilercontrol-1 | V2 | DHW.override | 0 | AUTO (cancelled 7 min later) | 2026-10-09T09:18:36Z |
| gk-6261-boilercontrol-1 | V2 | DHW.override | 1792195200 | ON-until 2026-10-17T00:00:00Z (seconds) | 2026-10-16T19:20:02Z |
| gk-6261-boilercontrol-1 | V2 | contractor_override | 1 | contractor flag set | 2026-10-11T07:37:10Z |
| gk-6097-boilercontrol-1 | V2 | DHW.override | 1791583200 | ON-until 2026-10-09T22:00:00Z (seconds) | 2026-10-09T09:40:16Z |
| gk-122-boilercontrol-1 | V2 | DHW.override | 1791925200 | ON-until 2026-10-13T21:00:00Z (seconds) | 2026-10-13T12:10:02Z |
| gk-2933-boilercontrol-1 | V1 | output4Override | 1790328399660 | DHW active, expiry 2026-09-25T09:26:39Z (+900s in ms) | 2026-09-25T09:11:39Z |
| gk-2933-boilercontrol-1 | V1 | output4Override | 0 | DHW inactive | 2026-09-25T09:12:10Z |
| gk-4331-boilercontrol-1 | V1 | output4Override | 1790692786731 | DHW active, expiry 2026-09-29T14:39:46Z (+900s in ms) | 2026-09-29T14:24:46Z |
| gk-6769-boilercontrol-1 | V1 | output4Override | 1790351733387 | DHW active, expiry 2026-09-25T15:55:33Z (+900s in ms) | 2026-09-25T15:40:33Z |
| gk-4631-boilercontrol-1 | V1 | output4Override | -1779115077386 | NEG: |v|=2026-05-18T14:37:57Z (+900s, negative) | 2026-05-18T14:22:57Z |
| gk-220-boilercontrol-1 | V1 | output4Override | -1791810005428 | NEG: |v|=2026-10-12T13:00:05Z (+900s, negative) | 2026-10-12T12:45:05Z |
| gk-4631-boilercontrol-1 | V1 | output4Override | 3206869449881746000000000 | CORRUPTED: >20 digits, treat as inactive | 2026-09-30T12:48:42Z |
| gk-220-boilercontrol-1 | V1 | output1OutputMask | [false,true,false,true] | DHW wired (index 3 = true) | SHARED_SCOPE attr |
| gk-2933-boilercontrol-1 | V1 | output1OutputMask | [false,true,true,false] | DHW NOT wired (index 3 = false) | SHARED_SCOPE attr |
| gk-4331-boilercontrol-1 | V1 | output1OutputMask | [false,true,true,true] | DHW wired (index 3 = true) | SHARED_SCOPE attr |
| gk-5804-boilercontrol-1 | V2 | heating_scenario | {"restaurant":"2CH + DHW","accom":1,"separate_dhw":1} | DHW separate system; V2 confirmed (CLIENT_SCOPE attr) | CLIENT_SCOPE attr |
| gk-6097-boilercontrol-1 | V2 | heating_scenario | {"restaurant":"1CH + DHW","accom":1,"separate_dhw":0} | DHW on panel; V2 confirmed (CLIENT_SCOPE attr) | CLIENT_SCOPE attr |
| gk-2933-boilercontrol-1 | V1 | DHWStatActive | false | demand inactive (event-driven boolean) | 2026-06-03T00:11:31Z |
| gk-4331-boilercontrol-1 | V1 | DHWStatActive | true | demand active | 2026-09-20T02:33:07Z |
| gk-1736-boilercontrol-1 | V1 | DHWStatActive | true | demand active | 2026-07-16T06:43:31Z |