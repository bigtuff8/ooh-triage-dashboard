# OOHDASH-131 - ThingsBoard layer: independent verification

Tester (test-stage reviewer), 15 October 2026. Subject: commit 049e54d on branch docs/oohdash-131-device-capability-table - docs/project/OOHDASH-131_THINGSBOARD_LAYER_EVIDENCE.md, the two ThingsBoard columns in OOH_DEVICE_CAPABILITY_TABLE.md and .html, the "What Spencer said vs what we can evidence" section and the "Questions to put to Spencer" section. The table and evidence file were NOT edited.

## Verdict

FAIL - corrections required before James uses this to challenge Spencer.

The Salus, OOHDASH-19 and Brackley-socket claims hold up on live data. But a tenant-wide, per-user audit sweep (which the evidence pass did not run) finds production control the document says does not exist: PowerPause circuits were switched off and on by device command on 15 October and confirmed by the circuit, and PowerPause schedule edits were echoed back in September. It also finds that boiler-panel control is routine and estate-wide, not three isolated events, and that Intesis mode (including off) was confirmed on 12 June as well as setpoint. In each case the error makes the document unfair in the "not validated" direction, and Spencer could use it to undermine the whole document.

## Method

- Read: the evidence file, the table (.md and .html), C:/harness-runs/iot-ooh-dash/ORCHESTRATOR-AUDIT.md, SPENCER-QUESTIONS-OOHDASH-123-2026-10-14.md, SPENCER_TEAMS_2026-10-10_PRIMARY_SOURCE.md, docs/project/oohdash-123-research (S1-S8, S2-S3, S4-S5, S6, S7, S9-S11, S12-Q7, S13, estate sweep), OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md (Spencer's contract), OOH_TB_DIRECT_VALIDATION_REPORT.md (17 Sep), mockups/OOH_ASSET_CONTROL_MATRIX_corrected.html, releases/SIGNOFF_stream-a-observed-live.md, and the CIR OOH_TB_DIRECT_CONTROL_CONTRACT.md and OOH_BRIDGE_CONTRACT.md.
- Jira (read only, nothing edited): OOHDASH-19, 70, 72, 76 (comments), 114, 123, 125, 131 (no comments; 131 description read).
- Live prod ThingsBoard, strictly read-only, 15 Oct about 15:35Z to 16:00Z. The only non-GET call was the login. Credentials were loaded from the CIR credentials file inside a script and never printed. Calls: device lookup by name, attribute values (SHARED, SERVER, CLIENT), telemetry histories, per-device audit logs, the tenant user list, and per-user audit logs since 20 Sep for all 160 users except svc-control (too noisy because of the remote.it job). The sweep was paced one request at a time, with no parallel scans. Limits: spencer.thompson's audit (more than 60,000 entries, almost all ATTRIBUTES_UPDATED and LOGIN) was read to 60,000 entries, and no command-shaped entry was found. svc-control was not swept, so commands written by the dashboard identity are covered only by the per-device checks below.
- Render: the HTML was served locally and driven with Playwright at 390px and 1280px. The ThingsBoard cells were compared with the markdown cell by cell.

## The six high-stakes claims

### 1. No Salus thermostat command has ever been confirmed; the iT700 writes from 24-25 Sep are stuck at pending - CONFIRMED (with two detail errors)

- Live re-read: gk-6261-salusit700-1 has setpointDesired 19 (SHARED, 24 Sep 13:23:31Z). Its setpointSyncStatus history is pending at 13:07:06, 13:08:07, 13:23:31 and 13:24:31Z on 24 Sep, and the latest value is still pending. gk-6832-salusit700-1 has setpointDesired 19 (25 Sep 08:19:02Z) and has been pending since 08:20:03Z. Its heatingSetpoint followed its own programme (08:49 to 18, matching setPoint 18 at 08:31) and never reached 19.
- Per-user audit sweep since 20 Sep: the only Salus write by any non-service user is samday251 to gk-1648 (25 Sep). No Salus write that succeeded was found anywhere, and no Salus device carries a Requested key (estate sweep, RESEARCH-S1-S8).
- Detail error A (evidence 4.1 and F3): "the same pattern is recorded for ... gk-1648 (25 Sep)" is WRONG. gk-1648 has no setpointSyncStatus at all, so nothing reacted. Its heatingSetpoint did reach 21 at 16:26Z, eight hours after the 08:26Z write, together with a setPoint change. That timing is consistent with local or programme action. Verdict: indeterminate, not stuck at pending.
- Detail error B (evidence 4.1, F3 and the Spencer table): "A direct change on 12 Oct produced no response at all" (gk-6835) is OVERSTATED as a failure. The write was setpointDesired 5 by svc-control at 12 Oct 19:16:22Z, but the unit had already been on heatingSetpoint 5 with holdType 7 since at least 5 Oct. A command to a value the device already held proves nothing either way. Reword it as uninformative.
- The table row 1 wording ("Two test changes sent on 24 and 25 September are still stuck") holds: 6261 and 6832.

### 2. OOHDASH-19's "verified live" closure only checked that refrigeration is blocked - CONFIRMED

- Jira OOHDASH-19 comment (7 Oct 13:03): "verified live per SIGNOFF_stream-a-observed-live.md (1,389 devices audited, PASS)". The signoff verdict is "the refrigeration switch-deny is present and effective". It checked 43 of 43 switch-capable refrigeration devices classified as non-controllable, plus the boot self-test. It records no command outcome. OOHDASH-76's closing comment says only that the write-flip was "verified live". Its 16 Sep comment shows a Salus reading, not a command.

### 3. Spencer's 17 Sep contract says thermostat changes take "a few seconds"; his "lighting/fans/kitchen proven" rests on four dev bench devices using a superseded method - CONFIRMED, but the framing is UNDERSTATED in one respect

- Contract wording is verbatim in OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md section 2: "Round-trip is typically <1 s for switches, a few seconds for thermostats". The proof in section 5 is bench-owon-1 and bench-tongou-sy1-1, sy1-2 and sy2-1 on dev TB, using the Desired/SyncStatus contract that was replaced on 10 Oct. The matrix marks external lighting, extract fans and over-door heaters PROVEN on the same basis. The same contract shows its own IT700 bench write stuck at pending, which contradicts "a few seconds" from Spencer's own evidence. The document should say this, because it is the strongest point.
- Omitted context that Spencer will raise:
  - (a) His 10 Oct Teams message cites a 40-command UAT Tuya run under the NEW gate route (typical 0.5 s, worst 1.6 s). This is vendor-reported and not visible to us, but it is not the superseded method.
  - (b) Our own 17 Sep adversarial validation independently re-proved the bench Tuya round trip in under 1 s (validation report C5).
  - (c) RESEARCH-S6 cites SD-492 on 1 Oct: 24 of 24 bench commands at about 510 ms.
  - None of these is a production lighting, fan or kitchen circuit, so the conclusion stands. But "rests on four dev test devices using a superseded method" should acknowledge them.

### 4. Boiler-panel overrides were validated directly in ThingsBoard (25 Sep, 28 Sep, 7 Oct), plus a newer-panel schedule echo on 13 Oct - CONFIRMED, but UNDERSTATED

- Live re-read of each event:
  - gk-2933 on 25 Sep: samday251 set output4Override 1 at 09:11:39Z. output4State went true at 09:11:39Z. It was set to 0 at 09:12:09Z and the state went false at 09:12:10Z.
  - gk-6261 V2 on 28 Sep: eight override RPCs by samday251, 09:17:59 to 09:22:02Z, all SUCCESS. CHZ1.override and output_state were set at 09:18:33Z and back to 0 at 09:20:03Z, with CHZ2 and recirc_pump changes to match.
  - gk-6780 on 7 Oct: TonyWilletts and samday251 writes from 11:37Z. output4State was true at 11:58:03Z and false at 12:03:05Z.
  - gk-6261 on 13 Oct: CsabaJakab wrote CHZ1 and CHZ2.schedule at 16:47:59 to 16:48:08Z. The CLIENT copies are identical and timestamped 16:47:59.689Z and 16:48:07.722Z.
  - V1 schedule edits are not echoed: gk-6780 output2 and output3Schedule were written on 14 Oct, and CLIENT is still from 12 Apr and different. Confirmed.
- UNDERSTATED: the per-user sweep shows this is routine operational control across the estate, not a few events. Since 20 Sep there are about 2,000 boiler-panel override, schedule or RPC actions (about 1,360 of them device RPCs) on about 130 distinct panels, by six identities: TonyWilletts (759), samday251 (865 plus more in later pages), CsabaJakab (306), lighthouseteam1 (48), andrew.shaw.network (17) and joncooke (8). There were also 16 output overrides by lighthouseteam10 on a V1 panel named "Hinckley Knight (Hinckley)". 23 RPC calls returned FAILURE (for example gk-6191, gk-6237 and gk-6097), so outcomes are not uniformly successful. Two of the identities are personal Gmail accounts.

### 5. Intesis air-con setpoint worked on 12 Jun (old method, test units only) - UNDERSTATED

- Setpoint is confirmed on both units. md-1244-intesis-c7ea6f88 had setpointDesired 25 written by spencer.thompson at 13:42:08Z. setpointSyncStatus went pending and then synced at 13:42:10Z, and the device's own setPoint telemetry reached 25 at 13:54:06Z. funklet-intesis-29d1f022 had setpoint 22 synced at 13:39:57Z, and setPoint followed to 21 at 14:05:27Z after a later write.
- MISSED: Intesis MODE, including off, was also confirmed on 12 Jun. On funklet-intesis-29d1f022, Spencer wrote modeDesired Cool, Off, Heat, Auto and Off between 14:02:48 and 14:06:24Z. Each reached modeSyncStatus synced, and the device's own mode telemetry followed within about 5 to 8 s (Cool 14:02:53, Off 14:04:49, Heat 14:05:02, Auto 14:05:13, Off 14:06:31Z). The evidence ("Intesis setpoint only"), table row 4 (mode and on/off listed as theory) and evidence Q10 therefore understate what has been seen. It is still old method only, and not repeated through the gate.
- Also unmentioned: Spencer's 17 Sep contract claims funklet setpoint 22 synced on the dev bench that day. Our same-day validation found the bench adapter dormant (C5, "GATED").
- Caveat: the table calls both units "test units". The estate sweep calls them bench relics, but md-1244-intesis-c7ea6f88 carries a real McDonald's site prefix (md-1244). Whether it is a real installed unit is unverified, so say "test or bench units (unverified)".

### 6. The single Brackley test socket is the only production proof of on/off (10 and 12 Oct) - WRONG as worded (the Brackley details are CONFIRMED)

- Brackley re-read (ag-brackley-poweroutlet-6 audit): 14 switchRequested writes between 10 Oct 13:52Z and 12 Oct 10:28Z. 9 were accepted, 4 were rejected with "No active Tuya session owns device" and 1 was rejected with "permission deny" (13:52Z). The 16:41Z off was requested at 16:41:07.952, accepted at 16:41:08.845 (0.89 s) and seen in switch_1 at 16:41:09.034 (1.08 s in total). The on was requested at 16:41:10.073, accepted at 10.343 (0.27 s) and seen in switch_1 at 10.637 (0.56 s). Spencer's message said "about 1.7 s". The evidence's "in under 1 s" is right for acceptance. The table's "within a second" is slightly generous for the off command (1.08 s). All writes are under the svc-control identity, the dashboard's login, even though they were Spencer's tests. That strengthens Q7.
- WRONG: the socket is the only production proof of on/off via the vendor bridge, but not the only production proof of on/off. On 15 Oct between 11:10:00 and 11:15:47Z, CsabaJakab sent the device RPC method "override" (0, 1, -1) to four PowerPause circuits: md-1110meridian-ppfryvat-5 and md-1110meridian-ppheatedtable-1, -2 and -3. All calls returned SUCCESS, and each circuit confirmed. On ppfryvat-5, override went to a negative expiry with op_state false at 11:10:01Z, and to a positive expiry with op_state true at 11:10:16Z, and again at 11:14:10 and 11:14:25Z. On ppheatedtable-1, op_state was false at 11:14:36Z and true at 11:14:51Z. The override value is an expiry time 15 minutes ahead (for example 2026-10-15T11:25:00Z). These are real McDonald's kitchen circuits, controlled DIRECT. This happened about four hours before the evidence pass and was missed because the pass sampled devices instead of sweeping users.

## Other contrary evidence missed

- PowerPause schedule edits are echoed. TonyWilletts rewrote SHARED schedules on about 20 McDonald's ppchickenvat and ppuhc circuits on 21 Sep. The CLIENT copies are identical (for example md-414wrekin-ppchickenvat-1 and md-780wigston-ppchickenvat-1, echoed 25 Sep; md-1110meridian-ppchickenvat-1 and -4, echoed 4 Oct). CsabaJakab cleared schedules on md-319fossepark-ppgrill-1 to -3 on 30 Sep, and the CLIENT echo came about 0.1 s later (11:39:51.909Z SHARED, 11:39:52.013Z CLIENT). This contradicts table row 6 ("no change has been seen landing"), evidence 4.6 and F5.
- F6 ("TB device RPC is used in practice only for V2 boiler panels") is WRONG: PowerPause circuits take the override RPC.
- The PowerPause override mechanism in the evidence is wrong. The evidence theorises a "dated entry in sched_overrides". The observed, working mechanism is the device RPC "override" with 1, 0 or -1. sched_overrides was never seen used.

## Required corrections

Table (.md and .html, which must stay identical):

1. Row 6 PowerPause, tested column. Replace "Control: none found" with: "Yes, direct, by IoT team staff working in ThingsBoard: four McDonald's kitchen circuits were switched off and back on by device command on 15 October, and each circuit reported the change within a second. Schedule: visible, and schedule changes made on 21 and 30 September were echoed back by the circuits."
2. Row 6 PowerPause, theory column. Remove the "dated entry to the override list" theory as the main route and the "no change has been seen landing" sentence. Keep: "Not on the vendor bridge route. What the override values mean and how long they last is inferred (15 minutes), not documented."
3. Row 4 Air-con, tested column. Add a path and mode: "Intesis cloud units, written direct to the device record under the old method: a target temperature change, and mode changes including off, were confirmed by two test or bench units on 12 June. Not repeated since the bridge was replaced on 10 October." Theory column: mode and on/off move from "theory, never seen" to "seen under the old method only, unproven through the current route".
4. Row 13 Boiler panel, tested column. Add that this is routine, estate-wide use: "about 130 panels, about 2,000 override, schedule and command actions by six IoT team logins since 20 September; a small number of commands failed".
5. Row 2 iT500, tested column. Add the path label ("written direct to the device record, old method").
6. Spencer table, row "Four controllable device types". Change "Intesis: target temperature only" to "Intesis: target temperature and mode (including off) on test units, June, old method". In the same row, and in the "most devices" row, add PowerPause to "control confirmed today" (direct, by IoT team).
7. Spencer table, row "Tuya ... control proven". Add one clause: Spencer also reports a 40-command UAT run under the new route on 10 Oct (vendor-reported, not visible to us), which is still not production lighting, fan or kitchen circuits.
8. Spencer table, row "Round trip ... few seconds for thermostats". Add: Spencer's own 17 Sep proof shows the IT700 write left at pending.
9. Spencer table, "You control every device" row and anywhere else gk-6835 is cited. Replace "no reaction" with "sent to a unit already holding that value, so it proves nothing".

Spencer questions:

10. Q4 (PowerPause). Rewrite around the observed mechanism: "Your IoT team switched four PowerPause circuits at site 1110 off and on by the device command 'override' on 15 October, and the circuits confirmed. Is this command a supported route the dashboard may use? What do 1, 0 and -1 mean, is the 15-minute expiry fixed, and what is the sched_overrides attribute for?"
11. Q10 (Intesis). Note that mode, including off, was also confirmed on 12 June, so the question is only whether either works through the current gate.
12. Q2 (Boiler panels). Add the scale (about 130 panels, routine use) and the 23 failed RPCs, and ask what a FAILURE means for the panel. Also confirm whether Tony Willetts, Sam Day and Csaba Jakab are Spencer's team; Q2 currently asserts "your IoT team".

Evidence file (the author's own file, kept in step):

13. 4.1 and F3: fix gk-1648 (no pending, indeterminate) and gk-6835 (already at 5).
14. 4.4: the TESTED line should include mode.
15. 4.6, F5 and F6: as corrections 1, 2 and 10.
16. 4.13 and F1: add the scale finding.
17. Section 2 method: state that no per-user audit sweep was run. The sweep that found the items above should be repeated or cited.
18. Headline: "Only two kinds of device have a proven ThingsBoard control round trip in production" becomes three (Tuya socket via bridge, boiler panels direct, PowerPause direct). Intesis mode is old-method only.

## Other checks

- Table body has no code or key names: PASS. A scan of rows 1-14 for camelCase, underscores, device ids and Desired, Requested, SyncStatus, RPC or attribute found only "ThingsBoard" and "PowerPause". Device ids (for example gk-6815) appear only in the Spencer questions, which is acceptable because those are addressed to Spencer.
- Each cell names the path: PARTIAL. Rows 2 (iT500 tested) and 4 (air-con tested) describe a tested item without a path label. Row 6 needs one once corrected. All theory cells carry a path or "no basis".
- HTML and markdown ThingsBoard cells: identical, with 0 differences across 14 rows. The HTML is ASCII-only and LF.
- Render: no page-level overflow. At 390px, scrollWidth is 375 against a 390 viewport, there are 28 ThingsBoard cells shown as labelled stacked blocks, and no element extends past the viewport. At 1280px, scrollWidth is 1265 against 1280, the table is 1233px wide with no internal scroll, and no element overflows. A full-page capture at 390px failed in the screenshot tool because the page is too tall, so viewport captures were saved instead: docs/project/oohdash-131-evidence/tb-layer-390-tbcells.png, tb-layer-390-row1.png, tb-layer-1280-table.png and tb-layer-1280-spencer.png.
- Spencer questions: specific and answerable, and they do not repeat SQ-01 to SQ-13 or SEC-1 and SEC-2 (checked against SPENCER-QUESTIONS-OOHDASH-123-2026-10-14.md). Q4 rests on a wrong premise and Q10 is incomplete (corrections 10 and 11). Q9's correction to SQ-13(d) is fair.

## Defect classification

- Code bug (to the author): corrections 1 to 18. These are evidence-accuracy defects in the document, not product code.
- Design regression: none. The evidence method (sample devices plus per-device audit) was approved scope. It structurally cannot see actions by other identities on unsampled devices. Any future "nothing was validated" claim should require a per-user audit sweep. This is recommended as a method rule, not a fault of this author.

## Test data

None created. All ThingsBoard access was GET-only after login, and no device, attribute or RPC was written. The probe scripts are in the session scratchpad and were not committed.
