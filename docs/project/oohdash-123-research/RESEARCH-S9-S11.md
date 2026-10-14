# RESEARCH-S9-S11: tongou key, second gang, string vs boolean (OOHDASH-123, 2026-10-14)

Method: read-only prod ThingsBoard GETs (portal.lhlive.co.uk). Only POST /api/auth/login was a non-GET. Credentials were loaded from the CIR env file inside a script; none printed or stored here. No writes, RPC or deletes. Read after: S2/S3 research file (gate flow), matrix section 6 and rows 61-67, repo docs (registry.js, D7 docs).

Survey scope: all 12,909 prod devices listed; 3,157 are on profile "tuya Profile". Timeseries KEYS were read for 3,097 of them (60 failed after retries because the portal rate-limited (429/500) our own scan; treat counts as about 98% complete). The tuyaDeviceType server attribute was read for only 77 devices (44 tongou, 33 owon) before rate limiting stopped that pass, plus the 53 devices that had a `switch` or `switch_N` key. So "all tongou in prod" is NOT enumerated; the tongou findings are for 44 sampled plus every tongou with a `switch` or `switch_2` key.

## Questions (verbatim from matrix section 6.1)
- S9: Do prod tongou devices report state as `switch` rather than switch_1?
- S10: Is switch_2 (second gang) still not addressable?
- S11: Brackley holds switchDesired as the string "true". Does the gate need a string, or is our JSON boolean fine?

## Headlines
- S9: PROVEN no for the sampled tongou fleet. Tongou devices report switch_1. A bare `switch` key is a separate, smaller population: mostly "default"-type and DHW farm devices, which includes live external-lighting units. Design must read both keys.
- S10: PROVEN that the gate cannot address switch_2 (rule chain source); DEDUCED (high) that the bridge cannot either. PROVEN that real two-gang tongou devices exist in prod (4, all at Brackley, all fridges or coolers).
- S11: PROVEN that a JSON boolean is fine through the gate (it stringifies). Do not send a string deliberately; the gate makes the string for us.

## S9 verdict: PROVEN (live key survey) for tongou; the `switch` finding is new and matters

Evidence, all 2026-10-14:

Key census over 3,097 tuya Profile devices (timeseries keys matching switch, relay, onoff):
- switch_1 present on about 3,058 devices (the normal case).
- `switch` present on 49 devices: 19 have `switch` and NO switch_1; 30 have both.
- switch_2 present on 4 devices (see S10).

tuyaDeviceType, per the 44 sampled tongou devices: all 44 have switch_1 (35 with relay_status, 8 without, 1 with no switch-like key at all). None of the 44 has `switch`. Owon sample (33): all have switch_1, none have `switch`. Example owon: ag-brackley-poweroutlet-6 (tuyaDeviceType owon, server attribute) reports switch_1.

Where `switch` does appear, by tuyaDeviceType (the 53 devices with `switch` or `switch_N`, N 2 or more):
- tongou, switch_1 AND switch: 18 devices (examples gk-6293-merrychef-1, gk-6123-merrychef-2, gk-6191-merrychef-2, gk-5818-heatedgantry-1, gk-5818-toaster-1, GK-6786-Glasswasher-1, gk-whitehorseshotel-extractfan1). On several (GK-6786 group, gk-lymewoodfarm-dhw-1, gk-whitehorseshotel units) the `switch` value is about 10,700 hours old (mid 2025) while switch_1 is fresh: `switch` is a historic key on those. On others both keys are fresh and equal (merrychef-2 pair, toaster, gantry, hcupboards), so both are currently reported.
- tongou, `switch` only: 2 devices, both test sites (gk-pptestsite-externallighting, 4,890 h stale; gk-0000-samtest-1, 9,718 h stale). Not live.
- "default" type, `switch` only and FRESH: gk-6237-externallighting-1 (11 h), gk-6186-externallighting-1 (9 h), gk-6099-externallighting-1 (24 h), plus Nando's - Huntingdon (9 h), Hatfield (stale 1,560 h), gk-6186-dhw-1. These look like smart-meter-style Tuya units (keys phase_a, supply_frequency, temp_a, forward_energy_total, online_state), not switch_1 devices.
- no tuyaDeviceType attribute at all, `switch` (and often switch_prepayment, switch_inching): about 22 DHW farm devices (names gk-*farm-dhw-1, GK-... dhw). Most are fresh.

So the matrix's tongou assumption ("tongou DP is `switch`") is wrong for the current fleet: tongou reports switch_1. But the real problem is bigger than tongou. Live OOH external-lighting devices (gk-6237, gk-6186, gk-6099 externallighting) report only `switch`. External lighting is an OOH flow (flows.js switchButtons use switch_1). Today OOH's mapTelemetry does not map `switch`, so those units would show no on/off state.

The gate already handles both keys: "fetch last known state" reads switch_1, switch and applianceOn, the direction-bypass reads switch_1 then switch, and the tuya Profile freshness list contains both (S2/S3 file; rule chain 19b53ec0-c4b1-11f1-bf95-995fa7662af0). So command acceptance is not the gap; our read mapping is.

Caution on staleness: switch_1 timeseries only updates on change or heartbeat, so an old ts can still be current (brackley-poweroutlet-6 switch_1 ts is 9 Oct while the command that set it true was 12 Oct). The confirmation rule must compare the value and a ts at or after dispatch only when a change is expected, which is the existing matrix rule; do not use age alone as offline.

## S10 verdict: gate PROVEN no; bridge DEDUCED no (high); two-gang devices PROVEN to exist

1. Gate: the capability map in "identify capability" is exactly setpointRequested, modeRequested, hwBoostHoursRequested, switchRequested. A key such as switch_2Requested matches nothing and gets gateOutcome notARequest (ignored). The doorbell body carries only tbEntityId, vendorId, vendorDeviceId, with no channel field. So the gate and doorbell have no way to name a second channel.
2. Bridge: source not seen (no repo access tried; no write test allowed). A single switchRequested yields a single switchDesired and one doorbell call per device; with no channel in the payload the bridge cannot know which gang. Confidence high, not proven.
3. Real multi-gang devices in prod (key survey): four devices have switch_1 AND switch_2, all tuyaDeviceType tongou, all at Brackley, all fresh (1 h): ag-brackley-bottlecooler-1, ag-brackley-bottlecooler-2, ag-brackley-bottlecooler-3, ag-brackley-undercounterfridge-1. They also carry countdown_1 and countdown_2. Values 14 Oct: switch_1 true and switch_2 true. These are refrigeration assets, which OOH denies control on anyway (isRefrigerationDeny, registry.js). No customer-facing multi-gang lighting or heating device was found among 3,097.
4. None of the four has any switch* command attribute (server/shared scope read for bottlecooler-1 and undercounterfridge-1: no switchRequested, switchDesired or status keys), so they have never been commanded.

## S11 verdict: PROVEN (rule chain TBEL + live attribute types)

- Gate input: the TBEL line is var s = msg[hit] + "". Any JSON type becomes a string, then metadata.requestedValue is that string. "malformed" is only an empty string or the text "null". A JSON boolean true gives "true"; false gives "false" (not empty, so valid). The direction-bypass test compares the string to true, True, TRUE, on, On, ON, 1.
- Gate output: "build desired" writes out[cap + "Desired"] = metadata.requestedValue, a string, to SHARED_SCOPE. That is why brackley holds switchDesired "true" (a string). The gate always writes a string whatever the caller sent.
- Live attribute typing, as stored today:
  - ag-brackley-poweroutlet-6: switchRequested = boolean true (SERVER_SCOPE); switchDesired = string "true" (SHARED_SCOPE, written by the gate).
  - gk-6237-externallighting-1 (default type): switchDesired = boolean true (SHARED_SCOPE, ts 7 Oct 2026, so a direct write from before the gate, no Requested key and no status keys exist). This is the only case found of a boolean Desired value, and the only recently commanded switch besides brackley and gk-6815 in the 14-day audit scan.
  - gk-6815-externallighting-1: audit shows svc-control wrote switchDesired as the string "true" to SHARED_SCOPE directly (a REST write; tenant audit scan, 14 days, 40,000 ATTRIBUTES_UPDATED entries). Matches the bridge/dev tooling writing strings.
- Audit-log oddity: the per-entity audit for brackley shows all 14 switchRequested writes by svc-control as the string "true"/"false", yet the live attribute value reads back as boolean true. So the audit view and the attribute store type the value differently, or TB coerces on store. Either way the gate stringifies, so it does not matter for the gate.
- Unknown: whether the bridge, if given a boolean in a direct Desired write, tolerates it. Not tested (no writes). Irrelevant if we write Requested.

Answer: our JSON boolean on switchRequested is fine. Compare confirmation as strings ("true" vs "true"), never as raw boolean equality, because the Desired we read back is a string and the telemetry is a string (switch_1 "true"). Normalise both sides to lowercase text.

## What this changes in the matrix and for Design
1. Matrix row 62 (tongou `switch`) becomes: tongou reports switch_1; a separate `switch`-only population exists and includes live external-lighting units (gk-6237, gk-6186, gk-6099). Read order switch_1, then switch, is right, but mapTelemetry must actually map `switch` (today it does not). This is more urgent than the matrix implied because it hits a core OOH flow.
2. Matrix row 67 and S10: switch_2 stays read-only. Add the four Brackley two-gang devices as the known real instances; all refrigeration, so already denied. Optional: show switch_2 state read-only; do not offer a second-gang button.
3. S11 closes: write boolean (or string) on Requested; confirm by comparing normalised strings. Downgrade the "Build (minor)" item to a unit-test assertion for string normalisation.
4. DHW farm devices (gk-*farm-dhw-1) and Nando's units report only `switch`; they are out of the current OOH control scope but will appear in device lists as switchable via hasSwitchSignal. Confirm they are filtered or classified before Design.
5. Add `switch_prepayment` and `switch_inching` to the "never treat as on/off" list: they are different datapoints on a few DHW units and a naive /switch/ match would mistake them for state.

## UNRESOLVED (residual questions, one line each, with our default)
- Q-S10a: Does the bridge ever address a channel for a two-gang device (any switch_2Requested or per-channel convention)? Default: no; switch_2 read-only.
- Q-S9a: What is tuyaDeviceType "default" and are those externallighting units (switch only) intended to be commandable through the gate and bridge? Default: yes, treat `switch` as the confirming key; prove on one in the J8 test window.
- Q-S11a: Does the bridge accept a boolean in a direct Desired write? Default: irrelevant; we write Requested.
- Not enumerated: the full tongou population (type attribute read for 77 devices only because the portal rate-limited) and the 60 devices whose key read failed. Default: acceptable; the rule "read switch_1, then switch" covers both.

## Sources and gaps
- Prod TB GETs 2026-10-14: /api/tenant/devices (paged, all 12,909); /api/plugins/telemetry/DEVICE/{id}/keys/timeseries (3,097); .../values/timeseries (switch keys, 130 devices); .../values/attributes (SERVER and SHARED scope, 130 devices); /api/audit/logs (tenant, ATTRIBUTES_UPDATED, 40,000 entries from 30 Sep, only one Requested/Desired entry matched, so this tenant listing looks incomplete and was not used for counts); /api/audit/logs/entity/DEVICE/34321500-398f-11f1-be0a-ab8c63f251de (28 entries, 9 to 14 Oct); /api/ruleChain/19b53ec0-c4b1-11f1-bf95-995fa7662af0/metadata.
- Repo: services/registry.js:62-63 (origin/main), docs OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md section 4, OOH_TB_DIRECT_DESIGN_DECISIONS.md D7, matrix lines 61-67, 195-197.
- Not searched: Jira, Teams, bridge source (not needed for S9; the bridge is the open item on S10).
- Operational note: the portal rate-limited (429) and returned 500 database errors during the survey, partly from our own concurrency. Future sweeps should run at concurrency 2 or less.
