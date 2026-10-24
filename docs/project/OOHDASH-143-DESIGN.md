<!-- gate:contract
SECTION: What this design covers
Two-change patch to services/tb-device.js that fixes both bugs found in the OOHDASH-143 spike. Bug 1: extend tbBool to accept string-valued TB telemetry. Bug 2: add a schedule-presence fallback so zone 2 is detected even when output1OutputMask[2] is false but output3 has active schedule entries. The two changes are independent; they touch only the one function each. No config changes, no API surface changes, no new dependencies, no other files touched.

SECTION: Bug 1 design -- string-tolerant tbBool
Location: services/tb-device.js line 1235, function tbBool, inside _decodeBoilerHeatingInner.

Current code accepts only real JS booleans (true/false) and integers (1/0). TB REST timeseries returns every value as a JSON string. The fix adds two string branches -- one per truth value -- making the function accept "true"/"1" (true) and "false"/"0" (false) in addition to the existing boolean/integer forms. The null return for unrecognised values is unchanged. This is a 2-line addition to an 8-line function.

Before:
function tbBool(v) {
    if (v === true  || v === 1) return true;
    if (v === false || v === 0) return false;
    return null;
}

After:
function tbBool(v) {
    if (v === true  || v === 1 || v === 'true'  || v === '1') return true;
    if (v === false || v === 0 || v === 'false' || v === '0') return false;
    return null;
}

Scope: tbBool is local to _decodeBoilerHeatingInner. It is not exported, not called anywhere else. No change to parseOverride, decodeDeviceSchedule, or decodeDhwOverride. V2 zone detection (isZoneEnabled, which reads CLIENT_SCOPE keys) already handles strings; that code is unchanged.

SECTION: Bug 2 design -- schedule-presence fallback for V1 zone 2
Location: services/tb-device.js ~line 1251, V1 branch of _decodeBoilerHeatingInner, z2Configured calculation.

Current code: z2Configured = Array.isArray(mask) ? !!mask[2] : key-presence fallback. Sites 6811 and 220 have mask[2]=false but active output3Schedule entries (2 and 1 respectively); zone 2 is not decoded for them.

The fix adds a schedule-entry count as a secondary test. A private helper countO3ScheduleEntries reads sc.output3Schedule (SHARED_SCOPE, already in scope as sc), parses the JSON if needed, and returns the entry count. Zero entries or parse failure returns 0. z2Configured becomes: mask[2] OR (countO3ScheduleEntries() > 0). The fallback for when mask is absent (key-presence check) is unchanged.

Helper (4 lines, inlined before z2Configured):
function countO3ScheduleEntries() {
    const raw = sc.output3Schedule;
    if (raw == null) return 0;
    try {
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(s) ? s.length : (Array.isArray(s?.schedule) ? s.schedule.length : 0);
    } catch { return 0; }
}

Revised z2Configured line:
const z2Configured = Array.isArray(mask) ? (!!mask[2] || countO3ScheduleEntries() > 0) : Object.prototype.hasOwnProperty.call(t, 'output3State');

Scope: only the z2Configured line and the 4-line helper. z1Configured is unchanged (mask[1] is always true in the estate sweep; no fallback needed there). No change to zone-loop logic below.

SECTION: Test design
File: test/boilerheating-decode.test.js. Four new tests added; no existing test changed.

BH-16 (6811 regression, string values, zone 1 forced off):
Input: V1 sharedScope with mask [false,true,false,true] (6811 mask) and output3Schedule with 2 entries. Telemetry: all values as strings. output2State="false", output2Override="-1792758151398" (Tony's override, as a string). Expected: zone 1 on=false, forced='off', held=true. This is the exact 6811 failure case that triggered OOHDASH-143.

BH-17 (V1 string booleans round-trip):
Input: V1, telemetry values "true"/"false" as strings. Expected: on=true/false, boilerCalling=true, summerMode=false (same as BH-1 but with string inputs).

BH-18 (V2 string integers):
Input: V2, CHZ1.output_state="1", CHZ2.output_state="0", summer_mode="0", boiler.enable_output_state="1". Expected: zone 1 on=true, zone 2 on=false, boilerCalling=true, summerMode=false.

BH-19 (zone 2 schedule-presence fallback):
Input: V1, mask=[false,true,false,true] (mask[2]=false), sc includes output3Schedule with 2 entries, output3State="false", output3Override="-1792758151398". Expected: zones.length=2 (zone 2 is included), zone 2 forced='off', held=true.

No existing tests are changed. BH-14 (mask[2]=false, no schedule → zone excluded) still passes because the test sharedScope has no output3Schedule key.

SECTION: Spencer question draft
For James to review and send. Proposed text:

Hi Spencer -- quick question about the V1 boilerControl output mask. We see that output1OutputMask[2]=false at some sites (e.g. 6811, 220) even though output3 has active schedule entries, a reporting output3State, and at 6811 had an active override set. Does mask[2]=false mean output3 is not a heating zone at all, or does it mean something about how output3 is wired relative to the boiler relay circuit? The current dashboard code uses mask[2] to decide whether output3 (zone 2) should be decoded and shown -- if the mask does not reliably indicate zone presence, we will need to use a different signal (e.g. schedule entry presence). Thanks.

SECTION: Scope boundary
Files changed: services/tb-device.js only (tbBool + z2Configured). Files changed in test: test/boilerheating-decode.test.js only (4 new test cases). No changes to: flows.js, routes/api.js, public/js/, config.js, any other service, any migration, any schema. The fix is self-contained within the decode function. decodeDhwOverride is NOT changed -- it is already string-safe.

DECISION: Is the schedule-presence fallback for zone 2 the right interim approach? | Yes -- it is conservative and safe (adds visibility only when a schedule exists) | No -- hold Bug 2 until Spencer answers
DETAIL: Schedule presence is a strong proxy for "this output is configured as a zone." The only risk is sites where output3 is scheduled for a non-heating purpose, which would show a spurious zone 2. From the estate sweep (9 V1 sites), this pattern has not appeared. Recommend proceeding.
-->

# DESIGN — OOHDASH-143
## String-decode fix: tbBool + V1 zone 2 schedule fallback

**Ticket:** OOHDASH-143 | **Phase:** Design | **Date:** 2026-10-24
**Patch target:** v1.4.8 (next patch after v1.4.7)

---

## Overview

Two targeted changes to `services/tb-device.js`, confined to the `_decodeBoilerHeatingInner` function. No other files are touched in production code.

| Change | Location | Lines affected |
|--------|----------|----------------|
| Bug 1: tbBool accepts string "true"/"false"/"1"/"0" | tb-device.js:1235 | 2 |
| Bug 2: z2Configured adds schedule-presence fallback | tb-device.js:~1251 | 5 |

---

## Bug 1 — string-tolerant tbBool

`tbBool` is a 4-line helper used 12 times inside `_decodeBoilerHeatingInner` to interpret boolean-like TB telemetry values. TB REST returns all values as JSON strings. The fix adds string branches for each truth value.

Current:

    function tbBool(v) {
        if (v === true  || v === 1) return true;
        if (v === false || v === 0) return false;
        return null;
    }

After fix:

    function tbBool(v) {
        if (v === true  || v === 1 || v === 'true'  || v === '1') return true;
        if (v === false || v === 0 || v === 'false' || v === '0') return false;
        return null;
    }

Result: `on`, `boilerCalling`, `summerMode`, and `fallback` fields are correctly decoded for all V1 and V2 sites. The "forced off" outcome is unblocked because `parseOverride` can now receive `zoneOn === false` instead of `null`.

---

## Bug 2 — V1 zone 2 schedule-presence fallback

Current z2Configured calculation (V1 branch only):

    const z2Configured = Array.isArray(mask) ? !!mask[2] : Object.prototype.hasOwnProperty.call(t, 'output3State');

After fix — adds an inline helper and ORs in schedule-entry count:

    function countO3ScheduleEntries() {
        const raw = sc.output3Schedule;
        if (raw == null) return 0;
        try {
            const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(s) ? s.length : (Array.isArray(s?.schedule) ? s.schedule.length : 0);
        } catch { return 0; }
    }
    const z2Configured = Array.isArray(mask)
        ? (!!mask[2] || countO3ScheduleEntries() > 0)
        : Object.prototype.hasOwnProperty.call(t, 'output3State');

Effect on the estate:

| Site | mask[2] | output3Sched | z2Configured (before) | z2Configured (after) |
|------|---------|--------------|----------------------|----------------------|
| 6811 | false | 2 entries | false | true |
| 220  | false | 1 entry  | false | true |
| 4631 | false | 0 entries | false | false (unchanged) |
| All mask[2]=true sites | true | any | true | true (unchanged) |

---

## Test additions

File: `test/boilerheating-decode.test.js` — four new tests, no existing tests changed.

| Test | Fixture values | What it proves |
|------|---------------|----------------|
| BH-16 (6811 regression) | mask=[F,T,F,T], output3Schedule 2 entries; output2State="false", output2Override="-1792758151398" (strings) | Zone 1 forced='off', held=true; zone 2 shown |
| BH-17 (V1 string round-trip) | All booleans as strings "true"/"false" | on=true/false, boilerCalling=true, summerMode=false |
| BH-18 (V2 string integers) | CHZ1.output_state="1", boiler.enable_output_state="1", summer_mode="0" | on=true, boilerCalling=true, summerMode=false |
| BH-19 (zone 2 fallback) | mask[2]=false, output3Schedule 2 entries, output3Override="-1792758151398" | zones.length=2, zone 2 forced='off' |

BH-14 ("mask[2]=false, no schedule → excluded") continues to pass because its sharedScope has no `output3Schedule`.

---

## Spencer question (draft for James to send)

Hi Spencer — quick question about the V1 boilerControl output mask. We see that `output1OutputMask[2]=false` at some sites (e.g. 6811, 220) even though `output3` has active schedule entries, a reporting `output3State`, and at 6811 had an active override set. Does `mask[2]=false` mean output3 is not a heating zone at all, or does it mean something about how output3 is wired relative to the boiler relay circuit? The current dashboard code uses `mask[2]` to decide whether output3 (zone 2) should be decoded and shown — if the mask does not reliably indicate zone presence, we will need to use a different signal (e.g. schedule entry presence). Thanks.
