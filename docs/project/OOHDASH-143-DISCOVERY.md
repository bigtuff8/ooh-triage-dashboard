<!-- gate:contract
SECTION: What we are fixing
OOHDASH-143. On 23 Oct, Tony Willetts set output2Override and output3Override to -1 on site 6811 (Hinckley Knight) directly in ThingsBoard at 13:07. The schedule ON events were immediately knocked back off, leaving pub heating held off for ~20 hours until CJ cleared the overrides at 09:17 on 24 Oct, when it was 6-10 C outside. The dashboard could not surface the "switched off on purpose at the panel" outcome for either zone. This spike finds two bugs responsible.

SECTION: Bug 1 -- tbBool rejects all live TB string values (PROVEN)
The TB REST timeseries API returns every value as a JSON string: "true", "false", "1", "0", "-1792758151398". The helper tbBool (services/tb-device.js:1235) accepts only real booleans and integers (true, false, 1, 0); it returns null for any string input. Every call site in _decodeBoilerHeatingInner uses tbBool: boilerCalling, summerMode, zone on, and zone fallback are all null in live for every boilercontrol site, V1 and V2. parseOverride requires zoneOn === false to return forced:'off', so the "W" outcome (switched off on purpose at the panel) can never fire on any live boilercontrol site.

Live proof (portal.lhlive.co.uk, 2026-10-24, read-only):

| Site | Panel | output1State type | output2State value | output2Override value | tbBool("true") |
|------|-------|-------------------|--------------------|-----------------------|----------------|
| 6811 | V1 | string | "true" | "1792834033562" | null |
| 2933 | V1 | string | "true" | "0" | null |
| 4631 | V1 | string | "false" | "0" | null |
| 4741 | V1 | string | "true" | "0" | null |
| 1597 | V1 | string | "true" | "0" | null |
| 220  | V1 | string | "false" | "0" | null |
| 4331 | V1 | string | "false" | "0" | null |
| 1736 | V1 | string | "false" | "-1784187905186" | null |
| 5804 | V2 | n/a | CHZ1.output_state="1" | CHZ1.override="0" | null |
| 6263 | V2 | n/a | CHZ1.output_state="1" | CHZ1.override="0" | null |
| 7773 | V2 | n/a | CHZ1.output_state="1" | CHZ1.override="0" | null |
| 7639 | V2 | n/a | CHZ1.output_state="0" | summer_mode="1" | null |
| 6261 | V2 | n/a | CHZ1.output_state="0" | CHZ1.override="0" | null |

All 9 V1 and all 5 V2 sites return string values. tbBool("true") = null on every site. The unit tests pass only because their fixtures use real JS booleans. The decodeDhwOverride function (OOHDASH-136) is NOT affected -- it uses Number(raw) throughout and handles strings correctly.

SECTION: Bug 2 -- mask[2]=false does not mean zone 2 is absent (DEDUCED, counter-examples found)
The V1 zone2 detection gate: z2Configured = Array.isArray(mask) ? !!mask[2] : key-presence fallback. At 6811 the mask is [false,true,false,true] so mask[2]=false and zone 2 is not decoded, even though output3Override was -1 (forced off), output3State was active, and output3Schedule has 2 entries. The forced-off state on zone 2 is invisible even if Bug 1 is fixed.

Counter-examples from the live sweep:

| Site | Mask | mask[2] | output3Sched entries | output3State in telem | Zone 2 shown by current code |
|------|------|---------|----------------------|-----------------------|------------------------------|
| 6811 | [F,T,F,T] | false | 2 | yes | No (WRONG) |
| 220  | [F,T,F,T] | false | 1 | yes | No (WRONG?) |
| 4631 | [F,T,F,T] | false | 0 | yes | No (probably OK) |
| 2933 | [F,T,T,F] | true  | 4 | yes | Yes |
| 4741 | [F,T,T,F] | true  | 2 | yes | Yes |
| 1597 | [F,T,T,T] | true  | 4 | yes | Yes |

mask[2]=true always correlates with active schedule and telemetry. mask[2]=false correlates with no schedule at site 4631, but with active schedule and state at 6811 and 220. The current code's use of mask[2] as a hard gate is wrong for at least sites 6811 and 220. The semantic meaning of mask[2]=false when output3 is active is UNRESOLVED -- it may mean "output3 does not call the boiler relay" rather than "output3 is unconfigured." Spencer clarification is needed before a definitive fix can be stated.

SECTION: Deployment status
v1.4.7 (commit c1c96d4, the "release v1.4.7" tag) is the live image on cluster apitechhub, namespace iot-services, as of 2026-10-24 (confirmed via kubectl -n iot-services get deployment). OOHDASH-139 (which introduced tbBool) shipped in v1.4.7. Bug 1 is therefore a live regression on v1.4.7 affecting every boilercontrol site.

SECTION: Proposed fix -- Bug 1
Extend tbBool to accept the string forms TB actually emits. Replace the two-branch helper with a four-branch one: "true"/"1" map to true; "false"/"0" map to false. The existing real-boolean and integer branches remain for safety. No other change to the decode logic. Unit test fixtures must be updated to use string-valued telemetry bags matching the live shape ("true"/"false" for V1 booleans, "1"/"0" for V2 integers). Add a named regression fixture for the 6811 forced-off case with string values.

SECTION: Proposed fix -- Bug 2
Two candidate rules are ready for James to choose at this gate. Option A (schedule-presence fallback): z2Configured = mask[2] OR output3Schedule has at least one entry. Catches 6811 and 220; ignores 4631 which has no schedule. Option B (telem-presence fallback): z2Configured = mask[2] OR output3State key is present in telemetry. Catches all three sites but may show a zone2 for output3 circuits that are not heating zones. Spencer input is needed to confirm which criterion correctly identifies a heating zone -- if mask[2]=false means "output3 is not the zone2 valve" then neither option is definitive. Option A is the safer default.

SECTION: What we still need
One open question blocks a definitive Bug 2 fix. Q-B2: What does mask[2]=false mean when output3State and output3Schedule are both active (as at sites 6811 and 220)? Is output3 wired as a second heating zone that the mask misclassifies, or is output3 serving a different role (e.g., a secondary circuit that does not call the boiler relay directly)? Spencer Thompson is the right person to answer this -- the TB schema and the physical wiring design are his domain.

DECISION: Proceed to design? | Yes -- fix Bug 1 now, hold Bug 2 pending Spencer answer | Yes -- fix Bug 1 now, apply Option A fallback for Bug 2 without waiting | No -- hold both pending Spencer
DETAIL: Bug 1 is proven and the fix is safe. Bug 2 Option A (schedule-presence fallback) is conservative: it adds zone visibility only where a schedule exists, which is a strong signal of intent. Spencer's answer may sharpen it later. Recommend fixing Bug 1 now; James decides whether to include Bug 2 Option A in the same patch or hold it.

DECISION: Draft Spencer question now? | Yes -- draft for James review before sending | No -- James will reach out directly
DETAIL: Q-B2 is a single factual question about output1OutputMask semantics. A short draft can be ready for James to review and send. The question is read-only: no device changes are needed to answer it.
-->

# SPIKE — OOHDASH-143
## boilerControl string-decode bug: zone forced-off invisible in live

**Ticket:** OOHDASH-143 | **Status:** Discovery | **Date:** 2026-10-24
**Reporter:** James Brown | **Priority:** P1 (live regression, pub heating held off 20 h)

---

## The live failure

Site 6811, Hinckley Knight. Tony Willetts set output2Override and output3Override to -1 in ThingsBoard at 13:07 on 23 Oct. The schedule ON events were immediately knocked back off. Heating was held off for ~20 h until CJ cleared the overrides at 09:17 on 24 Oct; outside temperature was 6-10 C throughout.

The dashboard outcome for zone 1 should have been: "Switched off on purpose at the panel." It showed nothing meaningful. Two bugs are responsible.

---

## Bug 1 — tbBool rejects live TB string values (PROVEN)

**Bug:** The TB REST timeseries API returns every value as a JSON string. The helper `tbBool` at `services/tb-device.js:1235` accepts only real booleans/integers (`true`, `false`, `1`, `0`). Every string input returns `null`.

**Proof:** Nine V1 sites and five V2 sites were queried live today (2026-10-24, read-only). Every telemetry value that tbBool reads came back as a string.

| Site | Panel | Key | Live value | Type |
|------|-------|-----|------------|------|
| 6811 | V1 | output1State | "true" | string |
| 6811 | V1 | output2State | "true" | string |
| 6811 | V1 | output2Override | "1792834033562" | string |
| 2933 | V1 | output1State | "true" | string |
| 4631 | V1 | output1State | "false" | string |
| 1736 | V1 | output2Override | "-1784187905186" | string |
| 1736 | V1 | summerModeActive | "true" | string |
| 5804 | V2 | CHZ1.output_state | "1" | string |
| 7639 | V2 | summer_mode | "1" | string |
| 6263 | V2 | boiler.enable_output_state | "1" | string |

`tbBool("true") = null`. Every `on`, `boilerCalling`, and `summerMode` field is `null` in live for every boilercontrol site, V1 and V2. `parseOverride` requires `zoneOn === false` to return `forced:'off'`, so the "W" outcome (panel override forcing heat off) can never fire on any live site.

**Why tests passed:** Unit test fixtures use real JS booleans (`true`/`false`), not strings. The live shape was never tested.

**Scope:** Only `_decodeBoilerHeatingInner`. `decodeDhwOverride` uses `Number(raw)` throughout and is string-safe — not affected.

---

## Bug 2 — mask[2]=false gates out zone 2 even when output3 is active (DEDUCED)

**Bug:** Zone 2 is configured only if `output1OutputMask[2] === true`. At 6811 the mask is `[false,true,false,true]`, so output3 is treated as absent — but output3Override was set to -1 (forced off), output3State was reporting live, and output3Schedule has 2 entries.

**Counter-examples from live sweep:**

| Site | Mask | mask[2] | output3Sched entries | output3 active in telem | Zone 2 shown |
|------|------|---------|----------------------|-------------------------|--------------|
| 6811 | [F,T,F,T] | false | 2 | yes | No — WRONG |
| 220  | [F,T,F,T] | false | 1 | yes | No — WRONG? |
| 4631 | [F,T,F,T] | false | 0 | yes | No — possibly OK |

Sites with `mask[2]=true` all have active schedules and state (2933, 4741, 1597, 4331, 1620).

**Status:** DEDUCED. The semantic meaning of `mask[2]=false` when output3 has schedule entries is unknown. It may mean "output3 does not call the boiler relay" rather than "output3 is not configured as a zone." Spencer clarification needed.

**Live impact without a Bug 2 fix:** Zone 1 forced-off at 6811 becomes visible after Bug 1 is fixed. Zone 2 forced-off at 6811 remains hidden.

---

## Deployment

v1.4.7 is the live image (kubectl confirmed: `apitechhub.azurecr.io/ooh-dashboard:c1c96d4`, tag = `v1.4.7`). OOHDASH-139 (which introduced `tbBool`) shipped in v1.4.7. Bug 1 is a live regression.

---

## Fix

**Bug 1 (clear):** Extend `tbBool` to accept `"true"`, `"false"`, `"1"`, `"0"`. Update unit test fixtures to use string-valued telemetry bags matching the live TB shape. Add a named 6811 regression fixture (string values, output2Override="-1792758151398", output2State="false").

**Bug 2 (two options):**

Option A — schedule-presence fallback: `z2Configured = mask[2] || output3Schedule has entries`. Catches 6811 and 220; conservative.

Option B — telem-presence fallback: `z2Configured = mask[2] || 'output3State' in telemetry`. Catches all three sites including 4631, but may expose output3 circuits that are not heating zones.

Spencer's answer on mask semantics resolves which option is correct.

---

## What we still need

Q-B2 (Spencer): What does `output1OutputMask[2] = false` mean when `output3State` and `output3Schedule` are both active (sites 6811 and 220)? Is output3 a second heating zone that the mask misclassifies, or is it wired for a different function (e.g., a circuit that does not call the boiler relay)?

| Item | Status |
|------|--------|
| Bug 1 fix (tbBool) | Unblocked — ready for design |
| Bug 2 fix rule | Blocked on Spencer Q-B2 |
| Test fixtures (string-shaped) | Unblocked — 6811 values known |
| Regression test (6811 forced-off) | Unblocked |
