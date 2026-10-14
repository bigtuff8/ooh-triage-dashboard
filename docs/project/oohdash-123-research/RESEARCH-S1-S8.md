# RESEARCH-S1-S8: Salus status/error keys and confirming telemetry (OOHDASH-123, 2026-10-14)

Method: read-only prod ThingsBoard GETs (rule chain metadata, a sweep of 1,199 salus-named devices for latest telemetry and attributes, per-device timeseries history, audit logs), Jira text search, Teams and SharePoint search. Credentials were loaded from the CIR env file inside a script; none printed or stored. No writes of any kind.

## Questions (verbatim from matrix section 6.1)
- S1: For Salus setpoint, IT500 boost and mode, are the status and error keys setpointSyncStatus / setpointLastError (and the hwBoost and mode equivalents), as SERVER_SCOPE attributes, the same as Tuya?
- S8: Which telemetry key confirms a Salus setpoint (heatingSetpoint, setPoint, or currentSetpoint in hundredths), and which confirms an IT500 boost (hotWaterBoostHoursRemaining)?

## Headline
S1: setpoint and mode PROVEN same as Tuya (gate side). Boost is a CONTRADICTION: the deployed gate writes hwBoostHoursSyncStatus / hwBoostHoursLastError, but Spencer's SD-598 contract table says hwBoostSyncStatus / hwBoostLastError. The bridge's own key for boost is UNRESOLVED.
S8: setpoint PROVEN to be heatingSetpoint on IT700 (and setPoint is NOT safe). IT500 setpoint and boost confirmation are UNRESOLVED on live data, because no live IT500 exists in prod TB telemetry; hotWaterBoostHoursRemaining is the only boost-shaped key that exists (DEDUCED, low-medium).

## S1 verdict
### Setpoint and mode: PROVEN (gate), DEDUCED high (bridge)
Prod rule chain "IoT Command Gate" (id 19b53ec0-c4b1-11f1-bf95-995fa7662af0, GET /api/ruleChain/{id}/metadata) is capability-generic. Node "identify capability" maps setpointRequested to setpoint, modeRequested to mode, hwBoostHoursRequested to hwBoostHours, switchRequested to switch. Every gate write is built as capability + "SyncStatus" / capability + "LastError" with metadata.scope = SERVER_SCOPE ("build pending", "build malformed rejection", "build offline rejection", "build gate fault", "build no-profile-keys rejection"). So for Salus the gate writes setpointSyncStatus and setpointLastError, modeSyncStatus and modeLastError, as SERVER_SCOPE attributes, with identical rules and messages to Tuya (pending; "gate: device offline"; "gate: malformed value"; "gate: no freshness keys defined for profile X"; "gate: internal fault"). Source: prod rule chain metadata, 2026-10-14. SD-598 contract (SharePoint, SD-598 SPA Hub/SD-598-iot-command-contract.md, decided 28 Sep) lists the same names for setpoint and mode, and says the bridge writes accepted/rejected plus LastError to the same keys over REST in SERVER_SCOPE. The bridge half is not observed for Salus (see unproven below).

### Hot-water boost: CONTRADICTION
- Gate code (prod, live): hwBoostHoursRequested -> hwBoostHoursDesired, hwBoostHoursSyncStatus (pending), hwBoostHoursLastError.
- SD-598 key table (Spencer's spec): hwBoostHoursRequested, hwBoostHoursDesired, but hwBoostSyncStatus and hwBoostLastError.
- Old matrix/code used hwBoostSyncStatus + hwBoostReported (DD line 29).
The gate and the spec disagree on the stem for status and error. Since the gate writes pending under hwBoostHours*, and the bridge is supposed to overwrite the same key with accepted or rejected, either the bridge also uses hwBoostHours* (then the spec table is a typo) or the bridge writes hwBoost* (then a boost command would show pending under one key and the outcome under another, and never settle). Nobody can tell without the bridge source or a run. Boost is out of scope for this release per J5, so this only matters if boost comes back; the dashboard should read both stems for boost if it is ever built, or Spencer should confirm one.

### What is not proven for Salus
No Salus command has run through the new gate: no setpoint/mode/boost Requested, SyncStatus or LastError attribute exists on any of 1,199 salus-named devices (attribute sweep, all scopes returned by default plus SHARED_SCOPE on 6261). Tenant audit-log sweep for ATTRIBUTES_UPDATED since 1 Sep: see "Audit sweep" below. The only Salus command evidence is the frozen old-contract bench writes (below). So the Salus bridge writing accepted/rejected has never been observed; key names for Salus are DEDUCED high from the gate and spec for setpoint/mode.

## S8 verdict
### IT700 setpoint: PROVEN heatingSetpoint is the confirming key; setPoint is not
Sweep of 241 IT700 devices named salusit700-N (profile salusDevice): 25 emit fresh telemetry (14 Oct); all 25 carry heatingSetpoint (ts around 08:26-08:30Z), only 24 carry setPoint, and in 12 of the 25 the two values differ.

History for gk-6791-salusit700-1 (13 Oct): heatingSetpoint is a polled reading that repeats about every 20-30 minutes (device-originated, each with holdType). setPoint is event-style: written once when the schedule changes (06:01 value 21, 08:31 value 18, 17:01 value 21, 21:01 value 18), and heatingSetpoint follows 4 to 20 minutes later (06:20 21, 08:39 18, 17:15 21, 21:05 18). setPoint is a bridge-derived event that leads and then goes stale: gk-6233-salusit700-2 setPoint 25 dated 7 Jun while heatingSetpoint is 18 today; gk-6141 setPoint 26 from 12 Oct, heatingSetpoint 26 today, holdType 2.

Consequences:
- Confirm on heatingSetpoint (numeric compare, tolerance 0.25 C, Salus steps are 0.5). Never use setPoint to confirm: it can disagree with the room's real target for hours or months.
- The confirming latency is bounded by the poll cadence, about 20-30 minutes between heatingSetpoint readings in the 13 Oct history (reading spacing seen: 21, 25, 26, 22, 24, 22, 25 minutes). So "minutes" for Salus (Spencer 10 Oct) may be up to about 30 minutes to see telemetry. The provisional 10 minute limit would false-negative often. DEDUCED medium: the cadence is from the existing polling, a command path might also trigger a fresh read; unmeasured.
- Display read keys: heatingSetpoint first. mapTelemetry currently reads heatingSetpoint ?? setpoint ?? setpointC (tb-device.js:580): fine for IT700.
- Do not treat a fresh heatingSetpoint after dispatch as proof of the command alone: schedule steps (06:00/08:30/17:00/21:00 pattern above) change it too. Compare to the requested value and require its timestamp after the pending timestamp, and note that holdType (0 follow schedule, 1, 2 hold, 7 observed) is a device-originated key that moves with a manual override. A scheduled change landing within the window to the same value would be a false confirm; low likelihood, worth noting for Design.

Old-contract bench evidence (frozen series, not the new contract): gk-6832-salusit700-1 on 25 Sep 08:19-08:20Z: setpointSyncStatus pending written twice, setpointReported 21 (the then-current heatingSetpoint), heatingSetpoint stayed 21 then went to 18 at 08:49 (schedule, setPoint 18 at 08:31). gk-6261-salusit700-1 on 24 Sep 13:07-13:24Z: setpointSyncStatus pending four times, setpointReported 21.5 (the then-current value), heatingSetpoint 21.5 for the next hour; setpointDesired 19 (SHARED_SCOPE, written 24 Sep ~13:23Z) never reached the device. So no Salus command has ever demonstrably taken effect in prod TB: setpointReported was an echo of the current reading, not a confirmation.

### IT500 setpoint: UNRESOLVED (no live IT500)
Sweep of 347 salusit500-named devices plus 383 bare "salus" devices (vendor_id salus-it500, profile salusDevice, names like gk_unknown_salus_STA...): none has emitted any device telemetry (other than rule-engine alarm counters) for more than 14 days except five named IT500s whose latest setPoint is 28 Sep or earlier (gk-5206-salusit500-r1 25, gk-6315-salusit500-f1 14, gk-5217-salusit500-r2 24, gk-5215-salusit500-r1 21; gk-5674 Dec 2025) and bare devices have setPoint and currentSetpoint with nothing newer than 30 days. Every IT500-style device in prod is dormant, consistent with the matrix (inactive since 2 Oct) and with the SD-446 note on the old Arrayent path. Keys present on IT500-style devices: setPoint (whole degrees C, e.g. 14, 21, 25), currentSetpoint (a different timestamp, hundredths: 2000 against setPoint 14 on gk-6315, so not tied to setPoint at the same time; in the bare group 343 of 381 equal 100 x setPoint, 28 do not, 10 have no setPoint), mode (Auto/Off), hotWaterOn, hotWaterBoostHoursRemaining (always "0" in the 371 bare devices with it, and "0" on the five named), hwStatus, isOnline. No heatingSetpoint key exists on any IT500-style device (zero of 380).
DEDUCED (medium) from this: IT500 confirmation key is setPoint (degrees C). currentSetpoint is hundredths and its timestamp lags setPoint on the same device (a stale snapshot from 2 Jun on gk-6315 with setPoint from 28 Sep), so do not use it. UNRESOLVED whether a live IT500 would also publish setPoint immediately after a command, or only on its own cadence; nothing live to test.
Matrix S8 default "heatingSetpoint else setPoint" is therefore right in order: IT700 uses heatingSetpoint (present and authoritative), IT500 falls back to setPoint (only key present). Add: never use currentSetpoint.

### IT500 boost: UNRESOLVED, DEDUCED low-medium
hotWaterBoostHoursRemaining is the only boost-shaped key anywhere (all 1,199 salus devices; zero devices carry hwBoost*, hotWater or hwBoostHours telemetry). Values seen: only "0" (371 bare, 5 named, last written 28 Sep or older). Whether it counts down hours remaining while a boost is active and what it shows for a boost of N hours has never been observed (no active boost in any sample). It is also on the gate's freshness list as hotWaterBoostHoursRemaining and hotWaterOn. Confirming rule if boost returns: telemetry hotWaterBoostHoursRemaining equals the requested hours (or hotWaterOn true for boost > 0), with 0 meaning cancelled; unproven and boost is out of scope for this release (J5), so recommend not designing against it now.

## Gate freshness for Salus (per-capability handling)
The gate does not branch by capability for Salus except through the capability prefix. Liveness for Salus devices uses the salusDevice profile allow-list: localTemperature, heatingSetpoint, coolingSetpoint, runningState, batteryLevel, currentTemperature, currentHumidity, setPoint, mode, heatingActive, coolingActive, hotWaterAvailable, hotWaterOn, hotWaterBoostHoursRemaining; any value within the last 45 minutes passes. Profile IT700TX has a shorter list. Issues for Design:
- IT700 poll cadence (about 20-30 min) fits inside the 45 min window, so live IT700s pass.
- The allow-list contains no non-device keys of concern except that SD-492's own prod gate-port note (SharePoint, SD-492-prod-gate-port-change-set.md, 10 Oct) measured that only 28% of sampled salusDevice units would pass (12 of 40 emit no allow-listed key). Our own sweep agrees in direction: 25 of 241 named IT700 fresh today (about 10%), and bare/IT500 devices fail entirely. So a large majority of salus devices will return "gate: device offline" regardless of true state. The dashboard must show the gate's text verbatim and Salus control is only available for the roughly 25 live IT700 thermostats at the moment (by sweep date).
- Spencer's SD-492 note flags the allow-list must exclude computed keys; hotWaterOn and mode on Salus come from the bridge publisher, which the contract says counts as the vendor's genuine readings.

## Other evidence searched
- Jira text search on setpointSyncStatus, setpointRequested, hwBoostHoursRequested, hotWaterBoostHoursRemaining, setpointLastError: only OOHDASH-100/101/102 (our own tickets); no SD ticket carries these keys in indexed text.
- Teams, Spencer, since 15 Sep (query setpoint/boost/Salus/IT500): one hit, 10 Oct 17:53Z, "Salus is being measured now and will be minutes, not seconds. So please use a time limit per vendor". No key names.
- SharePoint: SD-598 contract (above), SD-492 build spec and prod gate port change set (above), gate backups iot-command-gate-20261011-*.json (not read; the live prod chain was read directly), SD-446-uat-bench-plan.md (not read).

## What this changes in the matrix and for Design
1. S1 closes for setpoint and mode (PROVEN gate; DEDUCED high bridge). Keep setpointSyncStatus / setpointLastError / modeSyncStatus / modeLastError, SERVER_SCOPE.
2. New CONTRADICTION row: boost status/error stem hwBoostHours* (gate) vs hwBoost* (SD-598 table). Hold boost out of scope (J5). If it returns, make the per-class table accept both stems and ask Spencer.
3. S8 closes for IT700: confirm on heatingSetpoint only; setPoint is unsafe (event-style, stale for months). Add a rule: require telemetry ts after the pending timestamp.
4. IT500: no live evidence. Treat Salus control as available only for devices that currently carry a fresh heatingSetpoint (IT700). For IT500-style and bare salus, the default (setPoint, never currentSetpoint) is DEDUCED only; label "unproven", and given the gate will mostly say "device offline" for them, the practical effect is that they are not controllable today.
5. Time limit: IT700 telemetry arrives on a 20-30 minute polling cadence, so the provisional 10 minute Salus limit (J1) is likely too short to ever see a confirm. Recommend 45 minutes configurable for IT700 until Spencer's measured figure arrives (matches the gate's own 45-minute freshness window), late watch 2 hours.
6. Matrix 3.3 line 88 note (IT500 carries no heatingSetpoint) is confirmed across 380 devices; mapTelemetry should read setPoint for IT500-style devices.

## UNRESOLVED: residual questions for Spencer (one line each, with our default)
- Q-S1a: For hot-water boost, is the status/error key hwBoostHoursSyncStatus (what the gate writes) or hwBoostSyncStatus (what SD-598 lists), and which does the bridge write? Default: accept both, hold boost out of scope.
- Q-S1b: Has the bridge ever written setpointSyncStatus = accepted for a Salus device through the gate, and if so on which device and when? Default: assume not; label Salus unproven.
- Q-S8a: Does a Salus IT700 command trigger an immediate poll, or does heatingSetpoint only update on the roughly 25 minute cycle? Default: assume the cycle; limit 45 minutes.
- Q-S8b: Is any IT500 live anywhere (all sampled prod IT500s dormant since 28 Sep/2 Oct), and does it report setPoint or heatingSetpoint? Default: setPoint for IT500, heatingSetpoint for IT700.

## Sources and gaps
- TB prod GETs 2026-10-14: /api/ruleChain/19b53ec0-c4b1-11f1-bf95-995fa7662af0/metadata; /api/tenant/devices?textSearch= (salusit500, salusit700, salus: 1,199 unique devices); per-device /values/timeseries (latest) and /values/attributes; timeseries history windows for gk-6791, gk-6782, gk-6832, gk-6261; SHARED_SCOPE and SERVER_SCOPE attributes for gk-6261.
- CIR OOH_TB_DIRECT_CONTROL_CONTRACT.md; SharePoint SD-598 and SD-492 documents; matrix lines 43-44, 77-93, 137, 187, 194 (origin/main).
- Gaps: bridge source and Salus adapter not read; no live IT500; tenant-wide audit sweep may not have finished at the time of writing (see below).
- Sampling caveat: sweep is by name search (salus, salusit500, salusit700), so it covers 1,199 devices of about 1,181 salusDevice-profile devices plus default-profile salus names; it is a census, not a sample.

## Audit sweep (tenant-wide ATTRIBUTES_UPDATED since 1 Sep, looking for setpoint/mode/hwBoost Requested or SyncStatus writes)
Not completed when this file was written (the tenant-wide scan was still running in the background after more than ten minutes). Treat as UNRESOLVED. Substitute evidence: the attribute sweep above found no setpoint/mode/hwBoost Requested, SyncStatus or LastError attribute on any of the 1,199 salus-named devices, which is conclusive for "no Salus command has run through the gate" at 14 Oct (attributes persist; the only way such a key would be absent is if no command was ever written).
