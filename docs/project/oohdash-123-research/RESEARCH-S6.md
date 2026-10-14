# RESEARCH-S6: Salus time limit and any accepted-and-confirmed Salus command (OOHDASH-123, 2026-10-14)

Method: read-only prod ThingsBoard GETs (login is the only POST; credentials loaded from the CIR env file inside a script, none printed or stored), Jira (SD-373, SD-492), SharePoint (SD-598 command contract, SD-446 vendor status and bridge build spec), Teams and Outlook search. Sweep kept small: 33 devices (attribute and timeseries key lists), 14 IT500 devices (latest values), 2 deep histories. Paced requests; the tenant answered 429 once on a 19-page audit pull, so no further bulk reads were attempted. No writes of any kind.

## Questions (verbatim, matrix section 6.1, S6)
S6: What is the Salus time limit (IT500 and IT700 separately)? Has a Salus command reached accepted and been confirmed since 10 Oct?

## Headline
- No measured Salus figure exists anywhere we can read. Spencer's "being measured now, minutes" (Teams, 10 Oct 17:53Z) has not been followed by any published number. Verdict on the figure: UNRESOLVED, with a DEDUCED, low-to-medium confidence range per model below.
- No Salus command has been seen to reach accepted, let alone confirmed, since 10 Oct. Verdict: NOT FOUND in everything readable (absence of evidence, not proof of absence; see limits).
- New, important and PROVEN: prod Salus IT500 polling was deliberately switched off on 2 Oct (shared Arrayent login rejected since 28 Sep), and our telemetry sample shows no device-originated IT500 telemetry since 28 Sep. An IT500 command today cannot be confirmed by telemetry at all. IT500 is a harder blocker than a time limit.

## Part 1: what the evidence says about timing

### Salus IT500 (Arrayent cloud, HTTP polling) — DEDUCED, medium confidence on the mechanism, low on the figure
- PROVEN (Jira SD-373, Spencer comment 2 Oct 12:30): the IT500 adapter polls every 15 minutes (SalusIT500Options.PollIntervalSeconds = 900), one call per device, 373 devices. The binding's own PollIntervalSeconds is ignored by the adapter.
- PROVEN (SD-446 vendor status doc, section on the write-back rule): "a Salus IT500 on a 900 s poll is not a failing command, it is a quiet one."
- PROVEN (SD-492 description): IT500 write is Arrayent setMultiDeviceAttributes2; the bridge then does a confirm-read and publishes a snapshot immediately so the UI updates without waiting for the next poll. That confirm-read is "a second read of the same fact from the same cloud", so it only sees the new value once the cloud itself has it. How long the physical thermostat takes to pick up a cloud write and report back is not documented anywhere I could read.
- DEDUCED: a confirming telemetry change arrives at the next poll after the device has applied the change, so worst case is roughly one poll interval (15 min) plus the device-to-cloud lag. Two cycles (30 min) is the defensible outer bound; the typical case is somewhere between a few minutes and 15.
- PROVEN, blocker: prod IT500 polling has been paused since 2 Oct (SD-373 comment: "All Salus IT500 polling is deliberately switched off in prod until Salus support replies"). Live check today (14 Oct 08:49Z) on prod TB: gk-5190-salusit500-r1 last setPoint/hotWaterOn 2026-09-28T08:51Z; gk-5799-salusit500-f1 last device keys 2026-06-02 (its only fresh keys are rule-engine alarm counters, which the contract says never count as liveness). I did not find a Jira or Teams message saying polling was restored. UNVERIFIED whether it has been restored since 2 Oct; the telemetry evidence says it is not, at least for the sampled devices. Note the gate would also reject IT500 commands as "gate: device offline" once telemetry is older than its 45 minute window, so the operator would see an immediate rejection, not a slow one.

### Salus IT700 (AWS IoT shadow, MQTT-backed) — DEDUCED, low confidence on the figure
- PROVEN (SD-492 description, SD-423 reference): IT700 write is AWS IoT HTTPS UpdateThingShadow, followed by the same confirm-read and immediate snapshot. SD-492 notes call IT700 sync "best-effort".
- PROVEN (prod TB, gk-6261-salusit700-1, id 4b3882d0-7b79-11f1-a25c-c7bd0b73b31f): the device's heatingSetpoint and localTemperature arrive as a heartbeat. Over 11-14 Oct, 202 points, median gap 1418 s (23.6 min), p90 1634 s (27 min), maximum 2898 s (48 min). setPoint, by contrast, is change-driven (4 points over the same three days). So if the confirming key is heatingSetpoint and the bridge's immediate snapshot does not carry the new value, confirmation waits for the next heartbeat: typically up to about 27 min, worst seen 48 min.
- PROVEN, the only IT700 command on record: setpointDesired = 19 written 2026-09-24T13:23:31.242Z by the old path; setpointSyncStatus telemetry "pending" at 13:23:31.260Z (18 ms later) and again 13:24:31.597Z; never synced, never accepted (old domain). The device kept reporting 21.5 (setPoint 24 Sep 06:46Z) and later other values, never 19. The earlier command at 13:07:06Z likewise stayed pending. This is the "stuck pending" the CIR calls UNPROVEN. It predates the new contract and the new bridge, so it says nothing about the new accepted state.
- UNRESOLVED: whether the IT700 shadow update reaches the device in seconds or minutes. Spencer's own IT700 units (his home, two on UAT) are the only place that has been measured, and UAT TB is not in the CIR credentials.

### Tuya, for comparison — PROVEN
- Spencer, 10 Oct (primary source): sent to accepted 0.3 s typical / 0.8 s worst; accepted to confirmed 0.2 s / 0.4 s; total 0.5 s / 1.6 s over 40 UAT commands.
- Prod audit (RESEARCH-S2-S3, device ag-brackley-poweroutlet-6): request to accepted 0.27 s to 1.1 s; live attributes 14 Oct showed 600 ms. SD-492 comment 1 Oct: 24 of 24 bench commands at about 510 ms.

## Part 2: has any Salus command reached accepted and been confirmed since 10 Oct?
- Searched, nothing found: Teams (all chats, Salus/IT500/IT700/setpoint after 10 Oct 18:00Z: no hits; Spencer's messages after that time are about Schedule Hub and IoT hub UAT); Outlook (nothing); Jira SD-373/SD-492 (no comment after 2 Oct on Salus control).
- Prod TB sample: of 33 salusDevice IT700/IT500 devices (names containing salusit700 / salusit500, taken in id order), none carries any *Requested, *Desired, *SyncStatus or *LastError key as attribute or timeseries. gk-6261-salusit700-1 still holds setpointDesired 19 from 24 Sep and no status or error attribute. Matches the matrix finding that new keys are created lazily on first command.
- Prod audit pull, 14 Oct 08:12-08:35Z (1900 entries): zero Salus Requested writes; svc-control's entries were all the remote.it enricher keys. The only other writes were RPC override calls by a human operator on a boiler control (gk-6244-boilercontrol-1), which is a different path.
- Limits, stated plainly: I cannot search tenant-wide for "any device with setpointSyncStatus" because that needs an entity query (a POST), and the tenant audit log is about 70 enricher writes per minute, so a 4-day tenant pull is not feasible read-only at a polite pace. So "none since 10 Oct" is proven only for the sample and the 23-minute audit window. The prod bridge image (integration-bridge:prod-sd446-v1) was only recently deployed; SD-446 recorded zero devices with any *SyncStatus attribute in prod at the 7 Oct measurement.
- Spencer's UAT IT700 devices (his home) are where he is measuring; any accepted-plus-confirm there is not visible to us.

## Recommended N per vendor (for the Design copy "sent to the device, should take effect within about N minutes")

All figures are provisional, configurable, and should be replaced by Spencer's measurement. The copy and the machine limit are deliberately separate: N is what we promise the operator; the confirm limit is when we stop calling it "still waiting" and record "not confirmed".

| Vendor / model | Copy: "should take effect within about" | Confirm limit before INDETERMINATE | Late watch | Basis | Confidence |
|---|---|---|---|---|---|
| Tuya | no "minutes" copy; show the live result inline | 10 s | 2 min | Observed worst 1.6 s UAT, ~1.8 s prod; 6x margin | High (PROVEN) |
| Salus IT700 | 5 minutes | 30 minutes | 60 minutes | accepted path is a shadow update, expected quick; confirmation rides telemetry heartbeat (median 23.6 min, p90 27 min, max 48 min observed on gk-6261) unless the bridge's immediate snapshot carries it | Low (DEDUCED); no accepted-and-confirmed ever seen |
| Salus IT500 | 15 minutes | 35 minutes (two 15 minute polls plus margin) | 60 minutes | 900 s poll interval (SD-373); confirm-read only sees what the cloud already holds | Low-medium (DEDUCED mechanism); and BLOCKED today because prod IT500 polling is off |
| Bare salus (385 old-convention devices, model unknown) | Use the IT500 figures (the longer of the two) | 35 minutes | 60 minutes | conservative until the model is known | Low |

Why the 10-minute default in the matrix should change: 10 minutes fits neither model's evidence. It is too long for the copy ("about 10 minutes" over-promises on IT700 if the shadow update is quick) and too short for a confirm limit on either (IT500 needs more than one poll cycle; IT700 heartbeat p90 is 27 minutes). Recommend splitting the copy figure from the confirm limit as in the table.

Design implications:
1. Say what we know: the operator message on accepted should say the vendor took the command, and the device will confirm by its next report. Show the status as "waiting for the thermostat to report", not "failed".
2. The two-stage label also fits Spencer's rule that confirmed means the device's own telemetry matches Desired, and that accepted is not confirmation.
3. For IT500 today, expect an immediate "gate: device offline" rejection rather than a slow command, because the gate's freshness window is 45 minutes and no fresh device telemetry exists. The UI should show that reason verbatim (RESEARCH-S2-S3 point 4) and not offer a "will take minutes" promise it cannot keep.
4. Persisting in-flight actions (J7) matters more with 30-35 minute limits, as already decided.

## What this changes in the matrix
- S6 stays open for the figure; add the two-column split (copy N versus confirm limit) and replace the single "10 minutes" default.
- Row 3.3 (IT500) FEEDBACK: time limit becomes "15 minute copy, 35 minute limit, BLOCKED: prod IT500 polling paused since 2 Oct". Add a new BLOCKER row: IT500 telemetry source is down in prod (SD-373 comment 2 Oct, TB check 14 Oct). This affects reads (stale IT500 data on the dashboard) as well as control.
- Row 3.2 (IT700) time limit: 30 minutes confirm limit; note heartbeat cadence evidence.
- Old "stuck pending" bench evidence (24 Sep, gk-6261) is pre-contract; do not treat it as proof that Salus confirmation is broken.

## UNRESOLVED: residual questions for Spencer (one line each, with our default)
- Q-S6a: What are your measured accepted and confirmed times for IT700 and IT500 (typical and worst)? Default: IT700 copy 5 min / limit 30 min; IT500 copy 15 min / limit 35 min, configurable.
- Q-S6b: Is prod Salus IT500 polling restored (Arrayent shared account fixed, bridge restarted), and when? Default: assume still paused; treat IT500 as unavailable for control until the J8-style test shows a fresh setPoint.
- Q-S6c: For IT700, does the bridge's immediate confirm-read snapshot publish the new heatingSetpoint straight after the shadow update, or does confirmation wait for the 20-30 minute device heartbeat? Default: assume the heartbeat (hence the 30 minute limit).
- Q-S6d: Can we have read access to UAT TB (or a short extract of your Salus runs: Requested timestamp, accepted timestamp, first matching heatingSetpoint timestamp)? Default: proceed with the table above.

## Sources
- Prod TB GETs 14 Oct 2026: /api/audit/logs (14 Oct 08:12-08:35Z), /api/tenant/devices?type=salusDevice and IT700TX, device keys and latest values (33 + 14 devices), timeseries history gk-6261-salusit700-1 (heatingSetpoint, setPoint, setpointSyncStatus, setpointReported), attributes of the same, setPoint history gk-5190-salusit500-r1.
- Jira SD-373 (comment 2 Oct 2026 12:30), SD-492 (description; comments 23 Jul, 30 Sep, 1 Oct).
- SharePoint: SD-598-iot-command-contract.md (contract, keys, retry rules); SD-446-vendor-implementation-status.md (write-back rule, IT500 900 s poll, live numbers); SD-446-bridge-credentials-and-writeback-build-spec.md (confirm-read kept, no bridge retry).
- Teams: Spencer 10 Oct 17:53Z (primary source file C:/harness-runs/iot-ooh-dash/SPENCER_TEAMS_2026-10-10_PRIMARY_SOURCE.md line 66); Teams 1-2 Oct (Salus account problem, Jonathan Wilkinson, Csaba Jakab).
- Our code: services/registry.js:25 and :39 (slowEcho), docs/project/OOH_ROSETTA_STONE_DISCOVERY_2026-10-14.md lines 42-43 (10 minute provisional).
- RESEARCH-S2-S3.md for the gate flow and Tuya audit timings.
