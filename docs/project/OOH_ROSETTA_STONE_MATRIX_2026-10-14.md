# OOHDASH-123 Rosetta Stone: detailed reconciliation matrix, impact pass and question list

**Ticket:** OOHDASH-123 · **Stage:** Discovery (R1) · **Date:** 2026-10-14 · **Base:** main e6d98bd (live v1.3.7)
**Updated:** 2026-10-14 (research addendum — RESEARCH-S1-S8.md, RESEARCH-S2-S3.md, RESEARCH-S4-S5.md, RESEARCH-S6.md, RESEARCH-S7.md, RESEARCH-S9-S11.md, RESEARCH-S12-Q7.md, RESEARCH-S13-SCHEDULES.md, RESEARCH-ESTATE-SWEEP.md)
**Companion gate artefact:** docs/project/OOH_ROSETTA_STONE_DISCOVERY_2026-10-14.md
**Addendum gate artefact:** docs/project/OOH_ROSETTA_STONE_ADDENDUM_2026-10-14.md
**Audience:** the Design team. This is the working reference. The gate artefact is the short, decision-oriented version for James.

## 0. Sources and how to read this

| Tag | Source | Status |
|---|---|---|
| SP | Spencer Thompson, Teams 1:1, 2026-10-10T17:53Z (verbatim copy: C:/harness-runs/iot-ooh-dash/SPENCER_TEAMS_2026-10-10_PRIMARY_SOURCE.md) | PRIMARY. Newest contract statement. |
| SPEC | docs/project/OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md (Spencer's 09-17 contract) | Superseded in part by SP |
| MATRIX | docs/project/mockups/OOH_ASSET_CONTROL_MATRIX_corrected.html (Spencer's 09-17 corrected matrix) | Superseded in part by SP |
| DD | docs/project/OOH_DEVICE_DATA_DICTIONARY_2026-09-16.md | Draft, partly superseded |
| TOPO | PR #60 OOH_ESTATE_TOPOLOGY_MODEL_2026-09-25.md (branch docs/oohdash-101-estate-topology, tip ee7c540; no later edits on any ref) | Held; Q4/Q8 now stale |
| CIR | CIR OOH_TB_DIRECT_CONTROL_CONTRACT.md (2026-10-06) and OOH_DASHBOARD_DEPLOY.md (2026-09-24) | Superseded in part by SP |
| CODE | repo at e6d98bd, cited file:line | Verified by reading, plus local (no-network) execution of classifyDevice / mapTelemetry / validateCommand |
| TB | read-only prod ThingsBoard check, 2026-10-13/14, GET only, run by a sub-agent under James's approval | See §2 |
| RES | Research files in C:/harness-runs/iot-ooh-dash/research/ (S1-S8, S2-S3, S4-S5, S6, S7, S9-S11, S12-Q7, S13-SCHEDULES, ESTATE-SWEEP), 2026-10-14 | Research addendum — read-only TB GETs, Jira, SharePoint, Teams |

**Verdicts.** CONFIRMED = our docs and SP agree. GAP NOW FILLED = our docs had a hole that SP (or the TB check) fills. CONTRADICTION = our docs or code say something SP's contract retires or overrides. STILL A GAP = nobody has settled it; a recommended default is given.

**What SP's message says, in full, about the contract.** SyncStatus goes pending (gate passed), then accepted or rejected (vendor); LastError is written on a rejection. Confirmed means the device's own telemetry matches Desired; there is no Reported key any more. SyncStatus is written twice, so only accepted or rejected is final. The device echo can arrive before accepted. switchReported and the old switchSyncStatus time series are retired (frozen 25 Sep). Tuya UAT timings over 40 commands: sent to accepted 0.3 s typical / 0.8 s worst; accepted to confirmed 0.2 s / 0.4 s; total 0.5 s / 1.6 s. Salus is being measured and will be minutes. Use a per-vendor time limit. Prod runs integration-bridge:prod-sd446-v1 plus a ThingsBoard command gate since 10 Oct; ag-brackley-poweroutlet-6 was switched off and on at 16:41Z, accepted in about 1.7 s, switch_1 confirmed about 0.06 s later. Prod uses the production Tuya project; UAT and prod use separate Tuya projects. device-command-service (SD-492) is parked; commands go through ThingsBoard.

**What SP's message is silent on.** The literal names of the new status and error keys, and whether they are telemetry or attributes. Whether the Desired keys and SHARED_SCOPE are unchanged. Anything about Salus beyond "minutes", IT500 hot-water boost, Intesis, boilerControl, multi-gang, tongou, the read-side keys and online rules, and whether the command gate filters by caller identity.

## 1. Headline findings

1. **The live dashboard cannot recognise a confirmation under the new contract.** services/confirm.js:38-43 settles only on sync === 'synced' plus a matching *Reported value. Neither exists any more. Every live command now ends as "No confirmation" (timeout) at 90 s, even when the device switched in under 2 s. That is honest (never false success), but it is useless, and it invites repeat attempts. The read-only TB check (§2) shows why at the root: readControlState (tb-client.js:304-325) reads switchSyncStatus as a TIMESERIES, but the new status and LastError are SERVER_SCOPE ATTRIBUTES, so the code sees nothing at all. A genuine rejection would also surface as timeout (INDETERMINATE), not as NON-DELIVERY, and its LastError would be lost.
2. **Repeat attempts are then blocked.** classifyPreDispatch (services/confirm.js:67-80) can never return already-satisfied (it needs 'synced'), so any request whose value already sits in the Desired slot returns 409 "identical change in flight" (services/control.js:112-118). Example: a light switched OFF from the dashboard, then turned back on locally, cannot be switched OFF again from the dashboard, because switchDesired is still false.
3. **The on/off display trusts a retired key first.** services/tb-device.js:600-604 pickSwitch reads switchReported before switch_1. Local execution: mapTelemetry({switch_1:'false', switchReported:'true'}) returns switch_1 true. Any device still carrying a frozen switchReported shows the wrong state. The tongou key `switch` is not mapped at all: mapTelemetry({switch:true}) returns no switch_1, while hasSwitchSignal (tb-device.js:345-348) still counts it as switchable.
4. **[NEW — RES] The command write path is wrong.** To dispatch through the IoT Command Gate the caller must write `<cap>Requested` to SERVER_SCOPE. Our code writes `<cap>Desired` to SHARED_SCOPE, bypassing the gate (no pending, no offline check, no doorbell ring). On Tuya devices this likely means no dispatch at all under the new bridge. Re-send by writing the same Requested value again; no clear-then-set needed or safe (RESEARCH-S2-S3.md, RESEARCH-S4-S5.md, RESEARCH-S7.md).
5. **[NEW — RES] Live external-lighting units use the bare `switch` key.** gk-6237, gk-6186 and gk-6099 externallighting devices report state as `switch`, not switch_1. mapTelemetry does not map `switch`, so these units show no on/off state. The gate handles both keys already; the gap is our read path (RESEARCH-S9-S11.md).
6. **[NEW — RES] IT500 and bare-salus fleets are completely dark.** 347 IT500 devices have been silent for at least 12 days; 384 bare-salus devices for approximately 134 days. The gate would reject any command on these as "device offline". They must show as offline with no control offered (RESEARCH-ESTATE-SWEEP.md, RESEARCH-S6.md).
7. **[NEW — RES] V1 boiler panel is the majority.** 148 of 222 boilerControl devices are V1 (output1OutputMask). The V1 read branch is load-bearing and must be tested (RESEARCH-ESTATE-SWEEP.md, RESEARCH-S12-Q7.md).
8. **[NEW — RES] Two Intesis populations exist.** The 246 airConditioningProfile devices are R10A Modbus air-con, not vendor-bridged Intesis. The 12 actual vendor-bridged Intesis entities are on profile default with vendor_id = intesis. gk-birchwoodfarm-ac-1 is R10A Modbus (RESEARCH-S12-Q7.md).
4. **Hot-water boost has never been able to dispatch live (UNVERIFIED claim now VERIFIED).** public/js/flows.js:591 opens the control with ws.boilerControl, so ctlSend (public/js/control.js:216) posts deviceId = the boilerControl device name. services/control.js:76 finds that device in site.devices, but classifyDevice types it 'gateway' (no matching name token, no switch/setpoint telemetry), or 'salus-it700' if it carries heatingSetpoint. Both are refused at services/registry.js:144 with 422 "... is not a boostable hot-water device". Local execution confirmed all three telemetry shapes are refused. The Playwright test tests/control.spec.js:186-200 passes only because the fixture's Ship Inn boilerControl.deviceId is "IT500-DHW-6234", a salus-it500-dhw device that live inventory never emits (data/fixtures/bridge-devices.json:355, :384-390). And even if it dispatched, hwBoostHoursDesired is a Salus IT500 bridge key; the boiler panel is commanded by bare keys plus an override RPC (TOPO §4.5).
5. **Q4 is resolved: Tuya control is live in prod** (SP §1, TB §2). Salus, Intesis and boiler confirmation remain unproven.
6. **Dispatch still does not gate on the site anchor (OOHDASH-102).** services/control.js:69-86 checks kill-switch, site, device online and registration only. Anchor logic (tb-device.js:193-218, flows.js:370-420) is display-only; the connectivity flow narrates "no remote command can reach the site" (flows.js:779) but canSwitch (flows.js:346) and dispatch ignore it. Under the new contract this matters less for Tuya (direct to cloud, no on-site hop) and more for Salus (receiver dependency).

## 2. Read-only ThingsBoard evidence (2026-10-13/14)

Run by a Sonnet sub-agent under James's approval (2026-10-13/14). Prod ThingsBoard, GET only plus one login. No writes, no RPC, no bridge calls. 9 devices sampled. No credentials or tokens recorded. Attribute writes keep no history in ThingsBoard, so only the latest value and its lastUpdateTs are visible.

| Device (profile) | What exists, with kind and scope | Latest values |
|---|---|---|
| ag-brackley-poweroutlet-6 (tuya Profile), Spencer's 10 Oct test device | switchDesired = attribute, SHARED_SCOPE. **switchSyncStatus = attribute, SERVER_SCOPE.** **switchLastError = attribute, SERVER_SCOPE.** **switchRequested = attribute, SERVER_SCOPE (new, undocumented).** switch_1 = telemetry. No switchReported anywhere. No switchSyncStatus timeseries. | switchDesired "true" 2026-10-12T10:28:27.866Z; switchRequested true 10:28:27.793Z; switchSyncStatus "accepted" and switchLastError "" both 10:28:28.393Z; switch_1 "true" (string). 10 Oct window: switch_1 "false" 16:41:09.034Z then "true" 16:41:10.637Z. |
| gk-6261-overdoorheater-1, gk-6261-extractfan-1 (tuya Profile) | switch_1 telemetry only. No Desired, status, error or Requested keys (never commanded under either contract; keys are lazy). | switch_1 "false" on both, fresh 13 Oct. |
| gk-6261-salusit700-1 (salusDevice) | setpointDesired = attribute, SHARED_SCOPE. Telemetry heatingSetpoint, coolingSetpoint, setPoint. Old setpointReported / setpointSyncStatus telemetry frozen. No new status or error attributes. | setpointDesired 19 (written 2026-09-24T13:23Z, stale). heatingSetpoint 16.5 (13 Oct). Frozen series: setpointSyncStatus "pending", setpointReported 21.5, both 2026-09-24T13:24Z. |
| gk-5795-salusit500-r1 (salusDevice, IT500) | No Desired, status or error keys. Telemetry setPoint, currentSetpoint, hotWaterOn, hotWaterBoostHoursRemaining, hwStatus. No heatingSetpoint seen. | setPoint 22 and hotWaterOn true (2026-09-28); currentSetpoint 2200 (appears to be hundredths of a degree; inferred). Device inactive since 2026-10-02, so a weak sample. |
| gk-6261-boilercontrol-1, gk-5804-boilercontrol-1, gk-6263-boilercontrol-1 (boilerControl) | All three are V2 (CLIENT_SCOPE DHW.use_boiler). Override telemetry: DHW.override, CHZ1.override, CHZ2.override, boiler.override, accom_1/2.override, recirc_pump.override, contractor_override. No Desired, status or error keys. No V1 (output1OutputMask) found in the sample. | 6261 DHW.override = 1791936000, which decodes to 2026-10-14T00:00Z, so it looks like an "override until" time (inferred). Others 0. |
| gk-birchwoodfarm-ac-1 (airConditioningProfile) | Telemetry Setpoint, OnOff, Mode, AlarmStatus, ErrorCode. No Desired, status or error keys. | Setpoint 25, fresh 13 Oct. |

Not found within the 10-device cap: a tongou device using the key `switch`, a V1 boiler panel, a bare `salus` thermostat (the `-salus-` name search returned only R10A gateways such as gk-6858-salus-r10a), and a live IT500.

**What this settles.** (a) The status and error keys are named switchSyncStatus and switchLastError. They are **SERVER_SCOPE attributes, not telemetry**. (b) The status value string is "accepted". (c) There is no Reported key. (d) The Desired key and SHARED_SCOPE are unchanged. (e) The device's own switch_1 telemetry is the confirmation, and it arrives as a string.
**What it does not settle.** Whether pending is written as a separate step. Attribute history is not kept, so the dashboard will only ever see the latest status plus its lastUpdateTs. The names for the Salus, boost and mode families are unproven, because no such command has run since the change; by analogy they would be setpointSyncStatus / setpointLastError / setpointRequested.

**Full estate sweep (2026-10-14, RESEARCH-ESTATE-SWEEP.md).** A full pass of all 5,140 command-capable devices (tuya Profile 3,157; salusDevice 1,181; airConditioningProfile 246; boilerControl 223; gatewayDevice 306; default 28; IT700TX 1) plus 30-device samples of 25 read-only profiles. Key additions to the §2 table above:

| Finding | Detail |
|---|---|
| Tuya owon heartbeat | Median gap 24 min, p90 44 min; zero devices between 3 h and 48 h (clean cliff); 49 of 3,028 live owon in the 45-90 min band = gate false-offline risk for OFF requests |
| Tuya tongou fleet size | 18 devices estate-wide; all use switch not switch_1; includes gk-6237, gk-6186, gk-6099 externallighting and DHW farm units |
| Salus IT700 | 241 named IT700 devices; 188 online (48 h); heatingSetpoint on 94%; heartbeat median 23.6 min, p90 27 min, max 48 min on gk-6261 |
| Salus IT500 | 347 devices; 0 online (48 h); newest last-seen 11.9 d; zero have heatingSetpoint; setPoint is the setpoint key |
| Bare salus | 384 devices; 0 online; all last-seen approximately 2026-06-02 (134 d); same key shape as IT500 |
| boilerControl V1 | 148 of 222; output1OutputMask, output1..4Override, output1..4Schedule; V1 is the majority |
| boilerControl V2 | 74 of 222; DHW.*, CHZ1.*, CHZ2.*, recirc_pump.*, contractor_override |
| Intesis (airConditioningProfile) | 246 devices; R10A Modbus (no vendor_id); Temperature/Setpoint/OnOff/Mode/FanSpeed/AlarmStatus/ErrorCode; 212 online |
| Intesis (default profile, vendor-bridged) | 12 devices; vendor_id = intesis; setPoint/mode/currentTemperature/isOnline/connectivity; 9 of 12 online |
| Stuck Desired values | 4 live device rows: 3 Salus IT700 (6261/6832/1648, setpointDesired 19 or 21 from late Sep) and 1 tongou externallighting (6237, switchDesired true 158 h); 3 more bench relics (default-profile Intesis test devices, SD-492 bench IT500) |

## 3. Reconciliation matrix

Columns: Row · Our docs said (source) · SP 10 Oct · Code today · Verdict · Recommended default where open.

### 3.1 Tuya switch (C1) — owon (switch_1 DP) and tongou (switch DP); single-gang; also Tuya hardware under warewash/cellar monitoring profiles

| Row | Our docs said | SP 10 Oct | Code today / TB evidence | Verdict | Default |
|---|---|---|---|---|---|
| READ: state, owon (switch_1) | On-state = switchReported, then switchOn, then switch_1; "owon exposes switchReported" (DD lines 35-36; TOPO C1, §4.5) | switchReported retired; the device's own telemetry is the truth | pickSwitch prefers switchReported (tb-device.js:600-604). TB: switch_1 telemetry (string), no switchReported on brackley, 6261 overdoorheater or extractfan. | CONTRADICTION | Read switch_1 first. Drop switchReported from pickSwitch and hasSwitchSignal. |
| READ: state, tongou (switch) and switch-only population | Tongou DP is `switch`; the bridge abstracts it on control (TOPO Q4) | Silent | hasSwitchSignal counts `switch` (tb-device.js:345-348) but mapTelemetry does not map it to switch_1. TB: no tongou device found in the original sample. RES (RESEARCH-S9-S11.md): 18 prod devices use `switch` with no switch_1 (all tuya Profile); includes live external-lighting gk-6237, gk-6186, gk-6099 and DHW farm units. Sampled tongou (44 devices) all use switch_1, not `switch`. The gate freshness list includes both keys. | CONTRADICTION (read path — live display gap on external-lighting; mapTelemetry must map `switch`; RESEARCH-S9-S11.md) | Map `switch` as the fallback after switch_1 in mapTelemetry; confirm on the present key |
| READ: online | Online = lastActivityTime within 48 h (OOH_FALSE_OFFLINE docs; tb-device.js:626-660) | Silent | TB: lastActivityTime and active present on all Tuya samples | CONFIRMED (unchanged) | none |
| CONTROL: key, scope, values | switchDesired true/false on SHARED_SCOPE (SPEC §1; CIR; DD line 28) | "matching Desired" implies the Desired family is unchanged | TB: switchDesired SHARED_SCOPE on brackley. Code writes a strict boolean (registry.js:132-133; tb-client.js:289-297). Brackley holds the string "true". | CONFIRMED (read-only TB check 2026-10-13/14) | Keep the boolean write; ask Spencer whether the gate cares about boolean vs string (S11) |
| CONTROL: prod enablement | Prod DORMANT on prod-v3; present as read-only (TOPO Q4, §4.3; CIR "Prod status") | Live on prod-sd446-v1 plus TB command gate since 10 Oct; proven on ag-brackley-poweroutlet-6 | TB: brackley shows switchSyncStatus "accepted" and switch_1 transitions at 16:41:09Z and 16:41:10Z | GAP NOW FILLED | Treat Tuya control as live in prod |
| CONTROL: command gate and switchRequested | Not in any doc | "ThingsBoard command gate"; pending = "gate passed" | TB: new SERVER_SCOPE attribute switchRequested, written about 70 ms before switchDesired. RES: switchRequested is the CALLER'S INPUT to the gate, not its record. Caller writes switchRequested; gate writes pending then switchDesired. Our code writes switchDesired directly — BYPASSES the gate. No caller allowlist; svc-control already admitted (audit log). | CONTRADICTION (write path — high impact; RES RESEARCH-S2-S3.md, RESEARCH-S4-S5.md) | Write switchRequested to SERVER_SCOPE; never write switchDesired directly; prove TB RBAC with J8 |
| CONTROL: multi-gang and monitoring-profile switches | One relay only; switch_2 not addressable (SPEC §4; registry.js:62-63). Warewash/cellar switch_1 controllable by capability (TOPO §4.4); cellar denied (CTO). | Silent | as docs | STILL A GAP (switch_2); CONFIRMED (deny rules, our own policy) | switch_2 read-only; keep the deny layers |
| FEEDBACK: status and error keys | switchSyncStatus is TELEMETRY with pending / synced / failed / rejected (SPEC §1-2; CIR; TOPO §4.2 Q8). No error key. | pending, then accepted or rejected; LastError on a rejection. Names and scope not stated. | Code reads the switchSyncStatus and switchReported TIMESERIES (tb-client.js:15-20, :304-325). TB: switchSyncStatus and switchLastError are SERVER_SCOPE ATTRIBUTES; the value is "accepted". | CONTRADICTION (code) and GAP NOW FILLED (names and scope, read-only TB check 2026-10-13/14) | Read status and LastError from SERVER_SCOPE attributes, with lastUpdateTs as the freshness stamp |
| FEEDBACK: what "confirmed" means | Fresh 'synced' AND switchReported equals the value AND syncTs > dispatchTs (confirm.js:38-43; CIR) | Device's own telemetry matching Desired. Only accepted or rejected is final. Echo may precede accepted. | TB: on 10 Oct switch_1 moved 16:41:09Z / 16:41:10Z (string values) | CONTRADICTION (code) and GAP NOW FILLED (rule) | Confirmed = switch_1 (or switch) equals Desired with telemetry ts > dispatchTs, and status not rejected. Order-independent. |
| FEEDBACK: written twice and ordering | Not in docs | Status written twice (pending then final); echo can arrive first | TB: attribute history is not kept; only the latest status and lastUpdateTs are visible | STILL A GAP (cannot observe the pending step) | Treat a status with lastUpdateTs <= dispatchTs as stale; pending or absent = in progress |
| FEEDBACK: time limit | 90 s global (config.js:121), "<1 s for switches" (SPEC §2), 10 min late watch | Tuya total 0.5 s typical, 1.6 s worst (UAT, 40 commands); prod ~1.8 s | as docs | GAP NOW FILLED | Tuya limit 10 s (about 6x the worst observed), then INDETERMINATE; keep a short late watch |

### 3.2 Salus IT700 (C2) — Flaming Grill / Accommodation heating

| Row | Our docs said | SP 10 Oct | Code today / TB evidence | Verdict | Default |
|---|---|---|---|---|---|
| READ | localTemperature, heatingSetpoint / setPoint, systemMode, runningState, heatingActive (DD line 49; MATRIX). Receiver (-gateway) active is unreliable; do not gate reads on it (TOPO G4). | Silent | mapTelemetry reads heatingSetpoint ?? setpoint ?? setpointC (tb-device.js:580). TB: heatingSetpoint 16.5 and setPoint 16.5 present on gk-6261-salusit700-1. | CONFIRMED (read-only TB check 2026-10-13/14) | none |
| CONTROL | setpointDesired on SHARED_SCOPE, 5-35 °C; mode fails, boost rejected (SPEC §4); app window ±3 °C, cap 25, frost 5 (registry.js:19-26, :74-77) | Silent on Salus keys; "commands go through ThingsBoard" | TB: setpointDesired SHARED_SCOPE = 19, last written 2026-09-24, while the device sits at 16.5 | CONFIRMED (key and scope). STILL A GAP (whether the Salus command path now works at all; the 09-25 bench write was never consumed) | Keep the key. Label Salus control "unproven" until one accepted plus confirm is seen. |
| CONTROL: stale Desired dead-end and re-send | Edge-triggered; same value dispatches nothing (SPEC §3 rule 1) | Silent | A request for 19 °C at 6261 would be refused 409 by our pre-dispatch logic. RES (RESEARCH-S7.md): the gate fires on EVERY Requested write (ON_EVERY_MESSAGE, no dedupe); re-send by writing setpointRequested = 19 again. Clear-then-set is rejected by the gate as malformed. 6261's root cause: OOH wrote setpointDesired directly (24 Sep, old path), bridge stalled at pending, and the direct Desired write is now likely ignored under the new regime. 4 live stuck-Desired devices on estate: 6261, 6832, 1648 (IT700) and gk-6237 externallighting (tongou). | CONTRADICTION (pre-dispatch logic; write path fix also resolves this; RESEARCH-S7.md) | Write setpointRequested to re-fire; remove the Desired-comparison 409; judge from device telemetry |
| FEEDBACK: keys | setpointSyncStatus + setpointReported as TELEMETRY (DD line 29; TOPO §4.5; tb-client.js:17) | Domain pending, then accepted or rejected + LastError; no Reported | TB: old series frozen at 2026-09-24T13:24Z (pending / 21.5). No new attribute keys yet (no command since; keys are lazy). RES (RESEARCH-S1-S8.md): gate writes setpointSyncStatus and setpointLastError as SERVER_SCOPE attributes; PROVEN from rule chain; bridge writing them for Salus is DEDUCED (never observed). | CONTRADICTION (code) and DEDUCED (bridge half; RESEARCH-S1-S8.md) | Read setpointSyncStatus and setpointLastError from SERVER_SCOPE attributes; same pattern as Tuya |
| FEEDBACK: confirming telemetry key and compare | setpointReported equals the value (confirm.js:38-43) | "device's own telemetry matching Desired" | TB: heatingSetpoint and setPoint both carry the setpoint on IT700. RES (RESEARCH-S1-S8.md): heatingSetpoint PROVEN as the confirming key on 25 live IT700 devices; setPoint is event-driven and can be stale for months; 12 of 25 devices had heatingSetpoint and setPoint diverged. | PROVEN for IT700: heatingSetpoint only; CONTRADICTION (setPoint unsafe as confirm; RESEARCH-S1-S8.md) | heatingSetpoint, numeric compare within 0.25 °C, ts after pending ts |
| FEEDBACK: time limit | 90 s + 600 s late watch; slowEcho is wording only (registry.js:25) | "Salus is being measured now and will be minutes, not seconds" | as docs. RES (RESEARCH-S6.md): IT700 heatingSetpoint heartbeat median 23.6 min / p90 27 min / max 48 min on gk-6261; provisional 10-min limit would false-fail most commands; no Salus command accepted anywhere we can read. | GAP NOW FILLED (split copy N from confirm limit); UNRESOLVED (Spencer's measured figure; RESEARCH-S6.md) | IT700 copy 5 min / confirm limit 45 min / late watch 90 min; all configurable |

### 3.3 Salus IT500 (C3) — Farmhouse CH1/CH2, plus the IT500 DHW channel

| Row | Our docs said | SP 10 Oct | Code today / TB evidence | Verdict | Default |
|---|---|---|---|---|---|
| READ: heating | Same keys as IT700; Arrayent 60 s poll; CH2 may read the cylinder (TOPO C3); area from the CLIENT_SCOPE site letter (tb-device.js:543-560) | Silent | TB sample gk-5795-salusit500-r1 carries setPoint (capital P) and currentSetpoint (2200, apparently hundredths), but no heatingSetpoint. mapTelemetry maps only heatingSetpoint, setpoint (lower case) and setpointC (tb-device.js:580). If live IT500s look like this sample, they show no setpoint and are not controllable (hasSetpointSignal false). The sample has been inactive since 2 Oct. | STILL A GAP (needs a read-only TB check on a live IT500). Flagged risk. | Map setPoint as well; never use currentSetpoint without confirming its unit |
| READ: hot water | hotWater and hwBoostHours (tb-device.js:584-585) | Silent | TB sample carries hotWaterOn, hotWaterBoostHoursRemaining and hwStatus; neither hotWater nor hwBoostHours | CONTRADICTION (our key names vs the sample device) | Re-key after a live IT500 check |
| CONTROL: heating | setpointDesired, heat-only (SPEC §4); registry salus-it500 setpoint + frost | Silent | TB: no Desired keys on the sample (never commanded) | STILL A GAP (unproven under the new contract) | Unchanged key; label unproven |
| CONTROL: hot-water boost | hwBoostHoursDesired 0-9, IT500 only (SPEC §1, §4). OOH models it as salus-it500-dhw, which the bridge never emits: dead path (CIR; OOHDASH-87). | Silent | No live IT500 DHW device type exists in OOH. | STILL A GAP | Out of scope for this release (see DECISION) |
| FEEDBACK: heating | setpointSyncStatus + setpointReported | New domain; Salus minutes | as IT700 | CONTRADICTION (code) / STILL A GAP (names, limit) | As IT700 |
| FEEDBACK: boost | hwBoostSyncStatus + hwBoostReported (DD line 29) | Reported retired | Confirming key would presumably be hotWaterBoostHoursRemaining (inferred from the sample) | CONTRADICTION (Reported) / STILL A GAP (confirming key) | Decide only if boost comes back into scope |

### 3.4 Bare `salus` (OOHDASH-108 old-convention, about 385 devices)

| Row | Our docs said | SP 10 Oct | Code today | Verdict | Default |
|---|---|---|---|---|---|
| READ | Own deviceType 'salus'; area from CLIENT_SCOPE site letter, else the raw-name parenthetical (OOHDASH-108 docs; tb-device.js:543-560). Same telemetry keys as IT500/IT700. | Silent | registry.js:33-40 | CONFIRMED (our own design, not a vendor matter) | none |
| CONTROL | Identical to IT500/IT700: setpointDesired, frost = 5 °C, 5-35 °C (registry.js:33-40). Hardware model unknown. | Silent beyond "Desired" | as docs | STILL A GAP (whether each unit is IT500 or IT700, hence which latency applies) | Treat as Salus; same contract and limit as IT700 |
| FEEDBACK | slowEcho true (registry.js:39), 90 s global | "Salus ... minutes", per-vendor limit | confirm.js old domain | CONTRADICTION (domain and limit) | Same as IT700 |

### 3.5 Intesis AC (C4) — two populations; control removed from the dashboard by OOHDASH-82

**[NEW — RES] Two Intesis populations (RESEARCH-S12-Q7.md, RESEARCH-ESTATE-SWEEP.md):**
- 246 devices on profile airConditioningProfile (including gk-birchwoodfarm-ac-1): R10A Modbus air-con, NOT bridge-controlled Intesis. No vendor_id. Keys: Temperature, Setpoint, OnOff, Mode, FanSpeed, AlarmStatus, ErrorCode, applianceOn (capitalised Modbus-register style). Do not route commands through the gate.
- 12 entities named gk-NNNN-intesis-* or md-NNNN-intesis-*, profile default, vendor_id = intesis: actual vendor-bridged Intesis (AC Cloud). Keys: setPoint, mode, currentTemperature, isOnline, connectivity, heatingActive, coolingActive. Route via Root Rule Chain to the IoT Command Gate. Adapter supports setpoint and mode only (no fan command). 9 of 12 online.

gk-birchwoodfarm-ac-1 is R10A Modbus (CONTRADICTION to its use as "Intesis read evidence" in the approved gate matrix — reading still correct for R10A keys, but label is wrong).

| Row | Our docs said | SP 10 Oct | Code today / RES | Verdict | Default |
|---|---|---|---|---|---|
| READ (airConditioningProfile / R10A Modbus) | Temperature, Setpoint, Mode, OnOff, FanSpeed, applianceOn, AlarmStatus, ErrorCode (DD line 50) | Silent | classifyDevice forces non-controllable (tb-device.js:417-421). RES: 246 devices, 212 online, keys CONFIRMED. gk-birchwoodfarm-ac-1 is R10A Modbus not Intesis. | CONFIRMED (keys for R10A Modbus); RELABELLED — these are R10A Modbus, not Intesis | Read for context only; label R10A Modbus air-con |
| READ (default-profile, vendor-bridged Intesis) | Not documented | Silent | RES (RESEARCH-S12-Q7.md): 12 entities, vendor_id = intesis; keys setPoint, mode, currentTemperature, isOnline, connectivity; 9 of 12 online; route via Root Rule Chain to gate | GAP NOW FILLED (RESEARCH-S12-Q7.md) | Read for context only; label Intesis AC |
| CONTROL | setpointDesired 16-32 °C. On/off via modeDesired (unproven). R10A vs AC Cloud conflict (TOPO Q7). | Silent | registry.js:54 commands [] (refused). RES: gate path EXISTS for the 12 vendor-bridged entities; bridge acceptance UNPROVEN; Q7 path conflict RESOLVED (both paths exist for different units). | STILL A GAP for bridge acceptance; Q7 DEDUCED-high resolved (RESEARCH-S12-Q7.md); moot while OOHDASH-82 holds | Keep aircon capture-and-refer; treat both populations the same way for R1 |
| FEEDBACK | No *SyncStatus observed (TOPO §4.3). Indeterminate. | General contract only | n/a (no control). RES: no status attribute on any of 246 R10A Modbus or 12 bridge Intesis entities. | STILL A GAP (bridge acceptance unproven for vendor-bridged Intesis; RESEARCH-S12-Q7.md) | Indeterminate if ever reinstated |

### 3.6 boilerControl panel (C5) — V1 (SHARED_SCOPE output1OutputMask) and V2 (CLIENT_SCOPE DHW.use_boiler)

| Row | Our docs said | SP 10 Oct | Code today / TB evidence | Verdict | Default |
|---|---|---|---|---|---|
| READ: V2 | Named zones; CLIENT_SCOPE DHW.use_boiler (DD line 39; deriveBoilerControl tb-device.js:518-541) | Silent | TB: 6261, 5804 and 6263 are all V2 with DHW.use_boiler; override telemetry DHW.override, CHZ1/CHZ2.override, boiler.override, accom_1/2.override, contractor_override | CONFIRMED (read-only TB check 2026-10-13/14) | none |
| READ: V1 | Indexed outputs; SHARED_SCOPE output1OutputMask, mask[3] = DHW (OOHDASH-114-F1; tb-device.js:528-537) | Silent | TB: no V1 panel in the original 3-device sample. RES (RESEARCH-ESTATE-SWEEP.md, RESEARCH-S12-Q7.md): 148 of 222 boilerControl devices are V1 — the majority. Keys confirmed: output1OutputMask, output1..4Override, output1..4Schedule. V1 branch is load-bearing. | GAP NOW FILLED — V1 is confirmed the majority (RESEARCH-ESTATE-SWEEP.md) | Keep V1 branch; test both schemas |
| CONTROL | Bare keys plus an override RPC, not the Desired family; OOH v1 monitor-only; migration LH-INT-BOILER-001 (TOPO C5, §4.5, Q5; CIR) | Silent | The hot-water flow nevertheless shows "controllable" and a boost button (flows.js:583-584). Dispatch is always refused with 422 (§1 finding 4). CIR OOH_DASHBOARD_DEPLOY.md lists HW boost as a live scope. | CONTRADICTION (UI and CIR claim a control that cannot happen) | Remove the boost offer for this release (see DECISION) |
| FEEDBACK | No SyncStatus; state echoes on *.override / *.output_state (TOPO §4.5) | Silent | TB: no status or error keys. DHW.override at 6261 = 1791936000, which decodes to 2026-10-14T00:00Z, so the override value looks like an "until" time (inferred). | STILL A GAP | No confirmation claimed; monitor-only |

### 3.7 Read-only classes (grouped; CONTROL and FEEDBACK are n/a)

| Group | Read keys and signal (our docs) | SP 10 Oct | Verdict | Note |
|---|---|---|---|---|
| Fridge/freezer, cellar (M2, M3) | air_temp, evaporator_temp, line_temp, doorStatus (DD; TOPO M2/M3). Control denied: isRefrigerationDeny (tb-device.js:366-374), registry.js:68 and :125, refrig-guard boot probe (refrig-guard.js:29), CTO cellar directive. | Silent | CONFIRMED (unchanged; our own policy) | refrig-guard.js:29 probes with {switchReported:true}. It still works because hasSwitchSignal accepts that key, but the probe should also use switch_1 once switchReported is dropped from hasSwitchSignal. |
| Warewash, fryer monitor, oven monitor, Unox (M5-M7, M12) | LoRaWAN water/energy, Tuya power meter on warewash; Unox event telemetry, active=False normal (TOPO M5) | Silent | CONFIRMED for structure; STILL A GAP for Unox cadence | A warewash/cellar device carrying switch_1 is controllable as Tuya by capability (TOPO §4.4); cellar is denied. |
| Meters and AMR (M1, M10) | consumption keys; AMR is an external API, quiet is healthy (TOPO M1) | Silent | CONFIRMED; cadence STILL A GAP | Never show AMR as an offline device. |
| Ambient, door, gas valve, roof, hhw, Watteco boiler-control hyphen (M4, M8, M9, M11, M12, M13) | per TOPO §3.2 | Silent | CONFIRMED (unchanged) | Hyphen boiler-control must never be typed as the camelCase panel. |
| Gateways: remoteItProfile, R10A Modbus, ttsProfile lwgateway, Salus -gateway receiver (G1-G5) | active unreliable for these; judge on payload (TOPO §2.2, §4.1). Site anchor = lwgateway (tb-device.js:193-218). | Silent | CONFIRMED (unchanged) | The anchor is display-only today (see §1 finding 6). |
| Online rule (all classes) | Code: online = lastActivityTime within 48 h, active ignored when fresh, one-poll anti-flicker debounce (tb-device.js:93-104, :626-660, :714-716); FRESHNESS_BY_TYPE empty. TOPO §4.1: LIVE < 3 h, QUIET 3-12 h, OFFLINE > 12 h ("repo convention, not SD-446"). | Silent | CONTRADICTION inside our own docs (48 h binary in code vs three bands in TOPO). Not a Spencer issue. | Keep 48 h in code; amend TOPO; per-type values when Sam supplies cadence. |

## 4. PR #60 open questions Q4, Q7, Q8

| Q | 09-25 answer (TOPO §7, unchanged on every ref) | New evidence | Status now | Recommended default |
|---|---|---|---|---|
| Q4 Tuya mechanism and prod enablement | Mechanism proven on bench (switchDesired, pending then synced, ~2.5 s, same key for owon and tongou). Prod DORMANT on prod-v3; redeploy needed. Present Tuya as read-only in prod. | SP §1: prod-sd446-v1 plus the TB command gate went live 10 Oct; ag-brackley-poweroutlet-6 off/on accepted in ~1.7 s, switch_1 confirmed ~0.06 s later. SP §2: separate Tuya projects for UAT and prod. TB check: switchSyncStatus "accepted" on brackley; switch_1 off 16:41:09Z, on 16:41:10Z. | RESOLVED for owon-style switch_1 devices. Tongou in prod not separately evidenced. | Present Tuya control as live in prod. Treat "control DISABLED" text in TOPO §3.1 C1, §4.3, §5.2 and CIR "Prod status" as stale. Update the CIR. |
| Q7 Intesis ack and comms path | tbc, LOW (~11 units). No *SyncStatus observed; OnOff/FanSpeed unproven; R10A vs AC Cloud conflict. | SP silent on Intesis. TB check: gk-birchwoodfarm-ac-1 has no Desired, status or error keys. | UNRESOLVED, and moot for R1 because OOHDASH-82 removed aircon control | Leave parked under OOHDASH-98. Any future Intesis write is INDETERMINATE until an accepted status is observed. |
| Q8 SyncStatus domain and a real Salus confirmation | Domain "confirmed" as pending / synced / failed / rejected; Salus never confirmed (bench write stuck pending since 09-17). UX: async pop-up, never a blocking wait. | SP §3: domain is now pending, then accepted or rejected, plus LastError; confirmed = device telemetry matches Desired; no Reported; written twice; echo may precede accepted. Salus "minutes", being measured. TB check: the new status and error are SERVER_SCOPE attributes (switchSyncStatus "accepted", switchLastError); the old Salus series are frozen at 24 Sep. | PARTLY RESOLVED. The domain is replaced (our 09-25 "confirmed" domain is now a CONTRADICTION). Salus confirmation is still unproven. The UX steer stands. | Build on the new domain. Salus control stays labelled unproven, with a generous configurable limit, until Spencer publishes the Salus figure and one Salus accepted plus confirm is observed. |

## 5. Impact pass (per flow)

The common change sits in shared plumbing, so it is listed first.

### 5.1 Shared plumbing changes Design must specify

| Area | Today (file:line) | Contract now requires or enables | Design must decide |
|---|---|---|---|
| Status family map | tb-client.js:15-20 ATTRIBUTE_FAMILY maps each Desired to *Reported and *SyncStatus | No Reported key. A status key and a LastError key per family (names per §2). A per-class "confirming telemetry key" (switch_1 or switch for Tuya; the setpoint telemetry key for Salus). | A per-class contract table (Desired key, status key, error key, confirming telemetry key, value compare rule, time limit). registry.js is the natural home (registry.js:25 slowEcho already sits there). |
| Confirm read | tb-client.js:304-325 readControlState reads two timeseries | Read status + LastError (from the scope §2 establishes) and the confirming telemetry key with its ts | One read returning { status, statusTs, lastError, telemetryValue, telemetryTs } |
| Settle rule | confirm.js:38-54 isSettled / isFreshTerminal (synced + reported + syncTs > dispatchTs) | CONFIRMED = fresh confirming telemetry equals Desired (ts > dispatchTs) and the status is not rejected; accepted is the vendor's acceptance; rejected + LastError = NON-DELIVERY; pending is never final; echo may precede accepted, so order must not matter | The three-outcome rule restated on the new signals (see DECISION on accepted-but-unconfirmed). Remove 'failed' and 'synced'. |
| Pre-dispatch edge check | confirm.js:67-80 classifyPreDispatch; control.js:104-119 | already-satisfied must be judged from device telemetry, not 'synced'. A desired that equals the request while the device shows otherwise must not dead-end in 409. | Whether to clear-then-set (SPEC §3 rule 1 allows it) or ask Spencer for a re-fire mechanism through the gate. |
| Time limits | config.js:121 SYNC_TIMEOUT_MS 90 s global; :122 LATE_SYNC_WATCH_MS 600 s; control.js:240 keep-waiting +30 s hard-coded; overrides.js:27 REVERT_CONFIRM_TIMEOUT_MS 90 s hard-coded | Per-vendor limits (SP §3) | Values per class (see DECISION). Replace both hard-coded figures. |
| Client tracker | public/js/control.js:26 settled phases; :169-195 phase copy; :247-268 2 s poll; :257-267 state mapping; mid-wait :30-32, :181-183 | Add an "accepted, waiting for the device" phase; show LastError text on rejection; non-blocking "pops up when confirmed" | Copy and layout of the accepted phase and the pop-up; whether the operator can leave the modal and get a toast later |
| Copy that asserts confirmation | control.js:5, :160, :184-185, :341-349, :372-376; routes/api.js:251-258 SYNC_STEP_TEXT ("device confirmed (synced)") | Wording must follow the new states | New transcript lines for accepted / confirmed / rejected (with LastError) / not confirmed |
| Action store and restart | control.js:42-53 in-memory Map + timer (C1 known gap); overrides.js revert worker | A minutes-long Salus limit stretches the window a pod restart can drop | Whether to persist in-flight actions (Cosmos design exists in DESIGN_confirm-loop-timing §3c) in this release (see DECISION) |
| Switch display | tb-device.js:589-604 pickSwitch: switchReported, switchOn, switch_1; hasSwitchSignal :345-348 | switchReported retired; tongou uses `switch` | Read order switch_1, then switch (then switchOn if Spencer confirms it is a device key); drop switchReported |
| Fixture simulator | tb-client.js:186-264 sim (pending, synced, failed, rejected); data/fixtures/tb-devices.raw.json:29 switchReported | Must model pending, accepted, rejected + LastError, echo-before-accepted, telemetry confirm | Sim modes needed for each new path |
| Tests asserting the old contract | test/control-plane.test.js (13 'synced', 3 'failed'), test/late-sync-alert.test.js, test/confirm-loop-timing.test.js, test/tb-classify.test.js (17 switchReported), test/bare-salus-classify.test.js (8), test/gateway-classify.test.js (2), test/refrigeration-deny.test.js (1), test/fixtures/known-cellar-switch-names.json (6), tests/control.spec.js:186-200 (boost), :73-100 | All need rewriting to the new contract | Test plan in Design (see §7) |

### 5.2 Per flow

| Flow | Current behaviour (file:line) | What the contract now enables or requires | Design touch points |
|---|---|---|---|
| Heating (Salus IT500 / IT700 / bare salus) | flows.js:436 area-first; representative device = coldest online (flows.js:160-170). openControl up/down (flows.js:515, :544; window registry.js:89-95, ±3 °C cap 25) and frost = 5 °C (flows.js:535). Confirm on setpointSyncStatus + setpointReported, 90 s, then 600 s late watch. | Same Desired key (unchanged by SP). Confirmation must come from the setpoint telemetry key matching Desired. Salus takes minutes, so the operator must not wait: "sent, we will tell you when the thermostat confirms". Salus confirmation is still unproven in any environment. | Salus limit; accepted phase copy; honest "not yet confirmed" ticket wording; persistence of minutes-long watches; whether frost-hold (with its 07:00 revert) stays offered while Salus is unproven. |
| Hot water | flows.js:571-610: offered when ws.boilerControl.dhwControllable; boost opens control on the boiler summary (flows.js:591). Live dispatch always 422 (see §1 finding 4). | Nothing in SP. The boiler panel is not on the Desired contract. An IT500 DHW channel would use hwBoostHoursDesired, but OOH has no live device type for it. | Decide scope (DECISION). If out: replace the boost chip with capture-and-escalate plus the existing scope guidance, and stop showing "controllable" (flows.js:583). If in: needs Spencer/Sam on the IT500 DHW device identity and a boiler override contract. |
| External lighting | flows.js:650-684; switchButtons (flows.js:355-361) use switch_1 for the ON/OFF choice; startSwitch (flows.js:364); confirm on switchSyncStatus + switchReported | Tuya is live in prod and fast (worst 1.6 s total). Confirmation = switch_1 (or switch) matching. A short limit makes the async pop-up arrive almost immediately. | Tuya limit; display read order; 409 dead-end fix; tongou mapping |
| Extractor fan | flows.js:685-711; same switch plumbing as lighting | As lighting | As lighting |
| Kitchen | flows.js:612-649; reads online only; no control (CTO directive); ends in P1/capture | No change required. The contract would allow kitchen switching, but policy forbids it. | None (note only) |
| Connectivity | flows.js:738-790; anchor-based diagnosis; no control | No change required. Optional: use the anchor to warn before a Salus command (receiver dependency). | Optional anchor pre-check (OOHDASH-102 adjacency) |
| Aircon, fridge, others | aircon capture-and-refer (flows.js:561-570); fridge monitor-only (flows.js:712); refrigeration deny in three layers | No change | None |
| Timed hold and revert | overrides.js:123 worker every 30 s (:26); revert() :149 writes the revert value to the same Desired, polls :181-186 with isSettled (needs 'synced' + reported), 90 s hard-coded (:27); timeout or terminal = revert-failed + alert (:189, :203-207); success audits the literal 'synced' (:203) | Every revert will currently report revert-failed and alert, even when it worked. Must use the per-class confirm rule and limit. A Salus revert takes minutes. | Revert confirm rule, limit, alert wording; whether a revert also pops up for the operator on shift |

### 5.3 Honesty rules Design must carry (unchanged in principle, new signals)

- Three outcomes, never two: CONFIRMED, NON-DELIVERY, INDETERMINATE. Only CONFIRMED may render as success. Source: TOPO §4.2; CIR "Three-outcome delivery model".
- pending is never final (SP: "written twice").
- Order-independence: the echo may arrive before accepted (SP). The settle rule must not require accepted first.
- LastError is shown on a rejection, in plain words, and written to the ticket (it is never shown today; control.js:192 shows only the phase word, :394 builds "write rejected (vendor rejected)").
- The confirmation is asynchronous: the operator is told "sent" at once and the result pops up when read (TOPO §4.2, Spencer's 09-25 steer, restated in the brief).
- A 90 s "No confirmation" for a Tuya switch that worked in 2 s is an honesty failure in the other direction: it trains operators to ignore warnings.

## 6. Questions

### 6.1 For Spencer

Research verdicts added 2026-10-14 (RES column). All Spencer questions are HELD pending James's release of the consolidated list (see addendum section 6).

| # | Question | Research verdict | Updated default | Blocks |
|---|---|---|---|---|
| S1 | Salus status/error key names and boost key | DEDUCED (gate PROVEN; bridge never observed for Salus; boost key = CONTRADICTION: gate writes hwBoostHoursSyncStatus, SD-598 spec says hwBoostSyncStatus) | setpointSyncStatus / setpointLastError / modeSyncStatus / modeLastError (gate-proven); boost hold out of scope (J5); read both stems if boost returns | Build (not Design) |
| S2 | Is pending a distinct first write? | PROVEN — pending is the gate's first write; accepted or rejected is the bridge's second write, separate REST calls | Treat a status with lastUpdateTs before dispatchTs as stale; pending or absent = still in progress | Nothing |
| S3 | What is switchRequested? | PROVEN — Requested is the caller's input to the gate, not the gate's record; the dashboard must write Requested not Desired | Write cap-Requested to SERVER_SCOPE; read its lastUpdateTs as the dispatch anchor | CONTRADICTION (write path, high impact) |
| S4 | How does the gate refuse? | PROVEN — four rejected+LastError cases (malformed, offline 45 min, no freshness keys, internal fault) plus three silent cases (key not Requested, multiple keys one write, doorbell failure leaves pending forever) | Show gate-prefixed LastError verbatim; INDETERMINATE if pending stuck past limit | Design (wording) |
| S5 | Does the gate admit svc-control? | PROVEN — no caller check; implicit profile allowlist (4 OOH profiles); svc-control already in audit log | Prove TB RBAC with J8 test command; gate itself has no allowlist | Build go-live |
| S6 | Salus time limit; any Salus accepted since 10 Oct? | UNRESOLVED — no measured figure; no Salus command accepted anywhere we can read; IT700 heatingSetpoint heartbeat 20-30 min (p90 27 min) suggests 10-min limit would false-fail; IT500 polling paused since 2 Oct | Split copy N from confirm limit: IT700 copy 5 min / limit 45 min; IT500 copy 15 min / limit 35 min; all configurable | Design copy only; Build uses configurable default |
| S7 | Re-send when Desired already matches the request | PROVEN — write the same Requested value again; gate fires on every write (ON_EVERY_MESSAGE, no dedupe); clear-then-set is rejected as malformed by the gate | Re-send by writing Requested; no clear; remove the 409 Desired-comparison | Design (pre-dispatch fix) |
| S8 | Which key confirms a Salus setpoint? | DEDUCED — IT700: heatingSetpoint PROVEN (setPoint is event-driven, can be stale months; never use for confirm); IT500: setPoint by deduction (no live IT500); boost: hotWaterBoostHoursRemaining (DEDUCED, hold boost) | heatingSetpoint for IT700; setPoint for IT500; never currentSetpoint; compare ts after pending ts | Build |
| S9 | Do tongou devices use switch rather than switch_1? | PROVEN — sampled tongou fleet (44 devices) all use switch_1; the bare-switch population is a separate type including live external-lighting (gk-6237, gk-6186, gk-6099) | Read switch_1, then switch; confirm on whichever is present; mapTelemetry must map both | mapTelemetry fix (quick fix or Design) |
| S10 | Is switch_2 addressable? | PROVEN — gate capability map has exactly 4 keys (switch, setpoint, mode, hwBoostHours Requested); switch_2Requested is unrecognised; 4 two-gang Brackley refrigeration devices exist (all denied) | switch_2 read-only | Nothing |
| S11 | Boolean or string on Requested? | PROVEN — JSON boolean fine; gate TBEL stringifies; Desired is written as a string by the gate; confirm must compare normalised lowercase strings | Send boolean; compare strings normalised to lowercase | Build (unit test) |
| S12 | Does Intesis or boiler panel write status? | DEDUCED / PROVEN — boiler panel PROVEN no (not routed to gate; no status on any of 223 devices); Intesis DEDUCED: 12 vendor-bridged entities (profile default, vendor_id intesis) route via Root Rule Chain to gate; bridge acceptance unproven; 246 airConditioningProfile devices are R10A Modbus (not Intesis); both stay capture-and-refer for R1 | No; both non-controllable in R1 | Nothing |
| S13 (NEW) | Are device schedules readable from ThingsBoard? | PROVEN (schedules not credentials) — boiler SHARED_SCOPE JSON readable; PowerPause SHARED_SCOPE JSON readable; Tuya telemetry blob (needs per-product decoder); IT700 hex blob (undecoded); IT500 and Intesis vendor-cloud-only (not readable from TB) | Boiler and PowerPause: readable, next-change is new build; Tuya and IT700: show indicator only; IT500 and Intesis: not visible | Follow-up ticket (not R1) |

### 6.2 For James

J1 to J9 were decided at the gate (PR #86, 2026-10-14). New decisions J10 to J14 arise from the research addendum; see addendum section 7 for detail.

| # | Question | Decision / Status | Blocks |
|---|---|---|---|
| J1 | Per-vendor time limits | DECIDED — UX-led: if command likely takes more than 5 s, say "sent, should take effect within about N minutes"; report live result if it arrives; split copy N from confirm limit (see addendum section 4 and D-SALUS-N) | Design |
| J2 | What "confirmed" means for the operator | DECIDED — device reading matches what was asked for | Design |
| J3 | Accepted-but-not-yet-confirmed at the limit | DECIDED — "Not confirmed"; keep watching; update ticket if device catches up | Design |
| J4 | Salus interim stance | DECIDED — keep offered, labelled "may take a few minutes", result sent later | Design |
| J5 | Hot-water boost scope | DECIDED — out of this release; remove dead button; route to capture-and-escalate | Design |
| J6 | More read-only TB checks before Design? | DECIDED — hold Design until sweep complete; all research now returned | Design may start |
| J7 | Persist in-flight actions | DECIDED — yes, in this release using existing save-and-resume design | Design |
| J8 | Controlled live test command | DECIDED — yes, at the release gate (single Tuya switch, agreed device) | Build go-live |
| J9 | Show LastError word for word or plain sentence? | DECIDED — plain sentence on screen; vendor text on the ticket | Design |
| J10 (NEW) | Dashboard offline threshold (D-OFFLINE) | OPEN — recommend 3 hours (estate cliff data); current code uses 48 h; gate uses 45 min; decision needed before Design specifies device state labels | Design |
| J11 (NEW) | Split operator copy N from confirm limit (D-SALUS-N) | OPEN — recommend two-column table in addendum section 4; IT700 copy 5 min / limit 45 min; IT500 copy 15 min / limit 35 min | Design |
| J12 (NEW) | Next scheduled change in this release or follow-up (D-SCHED-RELEASE) | OPEN — recommend follow-up; boiler and PowerPause schedules are readable; Tuya and IT700 need decoders | Design scope |
| J13 (NEW) | Pull switch-only mapping fix ahead of Design (D-SWITCH-ONLY-LIGHTING) | OPEN — recommend yes; one-line mapTelemetry fix; live display defect on external-lighting units | Quick fix or Design |
| J14 (NEW) | Display of dark IT500 and bare-salus fleets (D-DARK-FLEETS) | OPEN — recommend show as offline with no control offered; 347 IT500 + 384 bare-salus devices all dark in prod | Design |

## 6.3 Schedule visibility (S13, new — RESEARCH-S13-SCHEDULES.md)

James asked whether device schedules are readable from ThingsBoard and whether they are "held as credentials". Answer: PROVEN not credentials. Readable formats vary by class.

| Device class | Where schedules live | Readable from TB today | Shape / note |
|---|---|---|---|
| Boiler panels (223 devices) | SHARED_SCOPE attributes (output1..4Schedule for V1; CHZ1.schedule, DHW.schedule etc. for V2) | YES | JSON: {"schedule":[{"value":21,"time":"11:00","loops":"1111111","timer_id":"..."}]}; time is HH:MM local; loops is Sun..Sat bitmask |
| PowerPause circuits (241 devices) | SHARED_SCOPE attributes (schedules and sched_overrides) | YES | Same JSON shape; 14 of 25 sampled have non-empty weekly schedule |
| Tuya plugs / fryers (tuya Profile) | TELEMETRY (schedule, cycle_time, countdown_1) | Blob only | Base64 or hex; Owon DP131 = 5-byte records (day mask, hour, minute, on/off, enable); Tongou cycle_time = 10 records (minutes, big-endian u16); no verified byte map in prod |
| Salus IT700 (salusDevice) | TELEMETRY (heatSchedule1/2/3, coolSchedule1/2/3) | Hex blob; undecoded | scheduleEnable (1 = following schedule) and holdType (0 follow, 2 hold) are decoded and useful |
| Salus IT500 | Arrayent vendor cloud (device registers) | NOT from TB | Needs bridge vendor login |
| Intesis AC | AC Cloud calendar | NOT from TB | Needs bridge vendor login |
| Site opening hours | 284 "Property Schedule" assets, SERVER_SCOPE weekDayWorkingHours | YES | Per weekday operation1/serving/operation2 windows; not a device schedule but useful as context |

"Schedule Hub" (schedulehub-uat.airedale-group.io) is engineer job scheduling (Timefold/Aeromark) and has nothing to do with device schedules. SD-477 (device schedule design) is design-only, nothing built. "Next scheduled change" for any class is new build; not a bug fix.

## 7. Scope handed to Design

**Data scope.** Per class: Desired key, status key, error key, confirming telemetry key, value type and compare rule, scope (attribute or telemetry), per-vendor time limit. Plus the action record fields if persistence is chosen (actionId, device name, attribute, value, dispatchTs, auditId, ticketId, deadline, watchUntil, state). No personal data is added. LastError text is vendor text and may need trimming before it lands on a ticket.

**End-to-end test scope.** Design must turn these into scripts:
1. Tuya switch OFF and ON: accepted then telemetry match, shown as confirmed within the Tuya limit.
2. Echo before accepted: still confirmed, no flicker to "not confirmed".
3. Rejected with LastError: shown as not delivered with the vendor reason, written to the ticket.
4. Accepted, no telemetry match by the limit: shown as not confirmed (INDETERMINATE), never success.
5. pending only, by the limit: INDETERMINATE.
6. Desired already equals the request while the device differs: the operator is not dead-ended by a 409.
7. Already at the requested value (device telemetry agrees): honest no-write success.
8. Salus setpoint with a minutes-long limit: operator released immediately, result pops up later; a late result after the limit is recorded on the ticket.
9. Pod restart mid-watch (if persistence is in scope): result still lands.
10. Timed hold revert under the new rule: success does not raise a false revert-failed alert.
11. Hot-water flow: matches the scope decision (no "controllable" tag and no dead boost chip if out of scope).
12. Tongou device: state displays and confirms on `switch`.

## 8. Adjacent items noted, not in scope

- CIR OOH_TB_DIRECT_CONTROL_CONTRACT.md and OOH_DASHBOARD_DEPLOY.md are stale against SP (Tuya "DORMANT", the old domain). Update the CIR after the gate.
- Spencer asked James to sign in to the prod IoT Hub (https://iothub.airedale-group.io) and report whether Vendors, Devices and Activity are visible. Not part of this ticket.
- k8s/deployment.yaml still says WRITES_DISABLED "true" (CIR deploy doc), so a manifest apply would re-lock writes. Known risk, separate ticket.
- svc-control is TENANT_ADMIN (open Spencer action). Relevant to the command gate question.
