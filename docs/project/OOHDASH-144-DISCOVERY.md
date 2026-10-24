<!-- gate:contract
SECTION: What this ticket covers
OOHDASH-144. Two related gaps found during live acceptance test on site 7639 (Black Bull, Corbridge) on 2026-10-24.

Gap 1 -- Operator cannot cancel a boost hold mid-session. When a V2 boilerControl boost is active, an operator who phones in to say "the heating is too hot now, stop it" has no way to end the hold early. The admin cancel route exists but is not accessible to iot-role operators, and the guided flow shows no cancel affordance on any W-code card.

Gap 2 -- Zone selection is single-commit. As soon as an operator taps a zone button, the boost fires for that one zone. When a caller is not sure which zone to pick, the operator has no way to select multiple zones or "all zones" -- they must guess and cancel/restart. Also: ThingsBoard holds no zone location data so zones cannot be labelled by room name; the operator must ask the caller which area is affected.

SECTION: Q1 -- Where does the server read TB telemetry to determine heating state?
Function _decodeBoilerHeatingInner() in services/tb-device.js at line 1187, exported via decodeBoilerHeating() at line 1313.

V2 panels: keys CHZ1.override and CHZ2.override carry the revert-at time as a signed Unix-second integer (lines 1286, 1292). Positive = forced ON, negative = forced OFF.

V1 panels: keys output2Override and output3Override carry a rolling +1/-1 heartbeat (lines 1257, 1263). No timestamp is echoed.

The helper tbBool() at line 1235 is applied to zone output-state keys (CHZ1.output_state, output2State etc.) to get a true/false/null. It currently returns null for string values "true" and "false" -- the OOHDASH-143 defect. When zoneOn is null, parseOverride (line 1214) cannot satisfy zoneOn === true or zoneOn === false, so it returns forced: null and the zone appears indeterminate.

parseOverride (line 1214) branches on V2 vs V1. For V2 it converts the large integer to an epoch-ms end time. For V1 it checks the +/-1 sign against zoneOn to determine held: true. Both paths silently return null if the tbBool bug causes zoneOn to be null instead of a real boolean.

SECTION: Q2 -- Does V1 also echo a timestamp?
No. V1 panels receive a SHARED_SCOPE write of +1 or -1. They do not compute or echo a revert-at time. The OOH hold watcher re-asserts the +/-1 every 30 seconds until OohOverrideRevertAt passes.

V2 panels DO echo a timestamp. The OOH server sends a one-way RPC with a duration in minutes. The V2 panel computes its own revert time and writes it back as CHZ1.override (signed Unix seconds) in telemetry.

| Panel | Attribute key | What OOH writes | What TB echoes | End-time in telemetry? |
|-------|--------------|-----------------|----------------|------------------------|
| V1 | output2Override / output3Override | +/-1 via SHARED_SCOPE | Same +/-1 | No -- watcher re-asserts every 30 s |
| V2 | CHZ1.override / CHZ2.override | RPC with duration (min) | Revert-at Unix seconds (signed) | Yes -- panel computes and echoes it |

Both panel versions are governed by the Cosmos OohOverrides durable hold and will be reverted by the hold watcher at OohOverrideRevertAt.

SECTION: Q3 -- OohOverrides document schema for an active boiler boost hold
From services/overrides.js:62-89 (scheduleOverride). Fields for a boiler-panel hold:

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Document ID |
| siteNo | string | e.g. "7639" |
| deviceId | string | TB device name of the boiler-panel |
| deviceType | string | "boiler-panel" |
| attribute | string | V2: "CHZ1.override"; V1: "output2Override" |
| heldValue | number | +/-1 -- the direction that was applied |
| revertValue | number | Always 0 (auto) for boiler-panel holds |
| OohOverrideRevertAt | ISO string | When the watcher will fire the revert |
| holdLabel | string | e.g. "Boiler boost ON CHZ1 for 60 min" |
| status | string | "active", "reverting", "reverted", "revert-failed", or "superseded" |
| ticketId | string optional | Zendesk ticket ID attached post-creation |
| createdBy / createdById | string | Operator name and ID |
| panelVersion | string | "v1" or "v2" |
| boilerZone | string | "CHZ1" or "CHZ2" |
| direction | string | "on" or "off" |
| d2CeilingAtMs | number optional | 01:00 ON-boost ceiling in ms |
| leaseOwner / leaseUntil | string optional | Optimistic-concurrency revert lease (null when not reverting) |

Query for active holds: status === "active" AND siteNo === site.siteNo AND deviceType === "boiler-panel". At most one active hold per device + zone (scheduleOverride supersedes earlier holds on the same device + attribute). Multiple zones (CHZ1 and CHZ2) can have simultaneous holds; the query returns both.

SECTION: Q4 -- Earliest point to surface an active hold in the guided flow
The site workspace is built in workspacePayload() (routes/api.js:194) when the operator confirms a site. It currently includes boilerControl.heating (live zone states from TB) and boostAvailable (feature-flag booleans) but no active-holds data.

Two candidate surfaces exist, earliest first:

1. Site card scope row (before guided flow starts). A banner on the Heating scope tile can say "Active boost hold -- expires HH:MM" and offer a Cancel button. This is the earliest possible surface and requires the workspace payload to include activeBoostHolds before any question is asked.

2. Inside boilerPanelHeatingBranch (stage 1 or outcome card). The flow at public/js/flows.js:896 renders stage 1 ("Too cold / Too hot?") and could be intercepted to show a hold-active outcome instead when an active hold exists.

Server-side change required in both cases: workspacePayload must query OohOverrides and include activeBoostHolds: [...]. This is a Cosmos read -- no TB write, no kill-switch involved.

SECTION: Q5 -- Is the revert path reusable for an early/manual cancel?
Yes, fully reusable. cancelOverride(overrideId, operator) at services/overrides.js:106-118 already does exactly what is needed. It sets OohOverrideRevertAt to now, records cancelRequestedBy, runs runWorkerOnce() immediately (does not wait for the 30 s tick), and returns the post-cancel document. The boiler-specific revertBoiler() path (line 280) runs the same direction-checked zone-to-auto (0) write as a timed revert.

What is missing is an operator-facing (non-admin) API route. The existing route (admin.post('/overrides/:id/cancel')) is admin-only (requires iot-admin role). A new route POST /api/sites/:siteNo/booster-holds/:id/cancel is needed, gated by requireRole('iot') plus a siteNo ownership check so operators cannot cancel holds belonging to other sites.

Invariants preserved: cancel sets zone to auto (0) -- same as a timed revert. No schedule keys, no OptimumStartStop keys, no output1Override are touched. The BOILER_BOOST_REVERT_EXEMPT kill-switch exemption is already in place and will honour the cancel. No new TB write path is needed.

SECTION: Q6 -- Cancellation UX options
Three viable approaches, assessed against the governing principle (triage-led; machine conclusions first; no raw device data on cards):

Option A: Site card banner. When an active boost hold exists, show a persistent banner on the Heating scope tile before the operator enters any question: hold label, expiry time, and a "Cancel early" button per zone. Minimum change to the guided flow.

Option B: Guided-flow intercept. When the operator enters the boiler-panel heating branch and an active hold is detected, bypass the "Too cold / Too hot" chips and show a hold-active outcome card: state summary, "Cancel early" button, and "Leave it / capture" options. No site-card change.

Option C: Both A and B. Banner for operators who see the site card and want to cancel proactively; guided-flow intercept for operators who enter through normal triage. Both paths use the same activeBoostHolds payload field; A is roughly 30 lines extra, B is roughly 50 lines. Closes both gaps without redundant backend work.

Recommendation is C: A alone leaves no cancel affordance in the guided flow; B alone requires entering the flow even for a simple proactive cancel.

SECTION: Q7 -- Zone location data in ThingsBoard
No zone location data exists in ThingsBoard. Every CLIENT_SCOPE, SHARED_SCOPE, and telemetry key read by the OOH server for boiler-panel devices was checked.

| Panel | Zone identifiers available | Location or label data? |
|-------|---------------------------|-------------------------|
| V2 | CHZ1, CHZ2 | None. CLIENT_SCOPE: CHZ1.enabled, CHZ2.enabled are booleans (presence only). |
| V1 | output2 (zone 1), output3 (zone 2) | None. SHARED_SCOPE: output1OutputMask is wiring config only. |
| Both | heating_scenario (V2 CLIENT_SCOPE) | Contains separate_dhw only. No zone names. |

The ThingsBoard device label holds the device name (e.g. gk-7639-boiler1), not a per-zone location. There is no CHZ1.name, CHZ1.room, zone_label, or equivalent field anywhere. Zone location is known only to the site engineer who configured the panel.

Consequence: the operator cannot be told "Zone 1 = Bar, Zone 2 = Restaurant" from system data. The conversation must ask the caller which area feels cold or too hot. Zones in the UI and operator script must be labelled "Pub zone 1" and "Pub zone 2" (numbered only) for this release.

SECTION: Q8 -- Changes required for multi-zone selection
Backend: no change needed. dispatchBoilerBoost (services/control.js:550) already accepts zones: [...] as an array and dispatches each zone independently. The current UI passes zones: ['CHZ1'] (single element). Passing both zones in one call is already supported.

Client: three changes to public/js/flows.js.

Change 1 -- W-code outcome cards. Replace the per-zone immediate-commit buttons ("Heat ON (zone 1)" etc.) with a single "Boost pub heating ON" (or OFF) entry point. Zone selection becomes its own step, not a one-click commit.

Change 2 -- New zone-selection step (need === 'bp-zones'). Shows the operator-script prompt asking which area the caller means. Toggleable chip per available zone ("Pub zone 1", "Pub zone 2") plus an "All zones / not sure" shortcut that selects all. The Continue button is disabled until at least one zone is selected.

Operator script wording baked into the UI (not a decision for James):
- Heat ON: "Do you know which part of the pub feels cold -- for example, is it a particular room, or is it the whole pub? If they can say, select that zone. If they're not sure, select all zones."
- Heat OFF: "Is it too warm in a specific area, or is the whole pub too hot? Same logic."

Change 3 -- Dispatch step. Replace zones: [bsZone] with zones: f.data.selectedZones. Outcome card lists all boosted zones by name. Two small helpers needed on the page state: toggleZone(id) (add or remove a zone id from state.flow.data.selectedZones, then render) and selectAllZones(ids) (set all ids, then render). Both are pure client-side state mutations with no API calls.

SECTION: Confirmed fix approach
Five-part change. Each edge case below is specified explicitly.

1. Server -- extend workspacePayload. Query OohOverrides for status="active" AND siteNo AND deviceType="boiler-panel". Include as activeBoostHolds: [{id, boilerZone, direction, OohOverrideRevertAt, holdLabel, createdBy}]. This is one additional Cosmos read per site-confirm. The collection is small and the query is indexed by siteNo; cost is bounded by operator frequency (low) and is not a standing background poll. Add POST /api/sites/:siteNo/booster-holds/:id/cancel gated by requireRole('iot'). Authorization: the route first fetches the hold document from OohOverrides and asserts hold.siteNo === req.params.siteNo -- both the URL parameter AND the stored hold document must agree on the site. This prevents an operator from cancelling another site's hold by supplying an id they found or guessed. Then calls overrides.cancelOverride(id, operator).

2. Client -- site card banner (Option A). When ws.activeBoostHolds.length > 0, render a compact banner on the Heating scope tile: hold label, expiry time, and a "Cancel early" button per zone. On cancel API success, show an explicit confirmation message: "Pub zone [N] heating boost cancelled -- zone returned to scheduled control. Heating will resume on its normal schedule." This gives the operator words to reassure the caller on the line. On cancel API 404 (hold already ended between load and click), show: "Hold has already ended -- refreshing." and re-fetch the workspace.

3. Client -- guided-flow hold intercept (Option B). At stage 1 of boilerPanelHeatingBranch, check ws.activeBoostHolds. If any active holds exist, render a hold-active outcome card. The card content is drawn from the Cosmos hold document (direction, holdLabel, OohOverrideRevertAt, boilerZone) -- NOT from the TB zone state decode. This means the card is unaffected by the OOHDASH-143 tbBool bug: the hold document knows what was dispatched regardless of what TB currently reports. Same cancel flow and feedback wording as the banner path.

4. Client -- multi-zone boost flow. Replace per-zone immediate-commit buttons in W-code cards with a single "Boost pub heating [ON/OFF]" entry point. Add need === 'bp-zones' step: caller-facing script, zone selection chips (Pub zone 1, Pub zone 2, All zones / not sure), continue to duration picker. Update bp-boost-send to dispatch zones: f.data.selectedZones. Add toggleZone() and selectAllZones() helpers.

Multi-zone partial failure: dispatchBoilerBoost already dispatches each zone independently in a loop. If CHZ1 succeeds and CHZ2 fails, one hold is created for CHZ1 and CHZ2 has no hold. The confirmation outcome card must list which zones were actually boosted (based on the hold documents returned, not the zone selection input). The operator sees "Pub zone 1 boosted -- Pub zone 2 could not be reached" and is prompted to log/escalate for zone 2.

"All zones / not sure" blast radius for Heat OFF: selecting all zones when the caller is unsure turns off all pub heating. This is accepted for this release, mitigated by two factors: (a) the new cancel feature means the operator can undo it immediately if wrong; (b) the Heat OFF boost has a maximum duration and always reverts to schedule. If design gate determines the blast radius is unacceptable, the fallback is to restrict "All zones" to Heat ON only and require explicit zone selection for Heat OFF.

5. Zendesk note. Pass cancelledBy: operator.name to the existing addBoostRevertNote() so the ticket records operator-initiated early cancel vs timed revert.

Invariants check: no schedule or OptimumStartStop keys written; cancel sets zone to auto (0); boiler and output1Override never touched; BOILER_BOOST_REVERT_EXEMPT kill-switch applies automatically; cancel route gated by requireRole('iot') plus dual siteNo check (URL param AND hold document); multi-zone dispatch uses existing backend array support with no new TB write path.

DECISION: UX approach for boost-hold cancel | C -- both banner and guided-flow (recommended) | A or B -- one surface only
DETAIL: Three options were assessed. A: site card banner only (no cancel inside the guided flow). B: guided-flow intercept only (operator must enter the flow to cancel proactively). C: both. Recommendation is C -- banner covers operators who see the site card before entering the flow; guided-flow intercept covers operators who come in via the standard triage question. Both use the same activeBoostHolds payload field. Banner is roughly 30 extra lines; guided-flow intercept is roughly 50 extra lines. Can be split into sub-tasks if preferred. If James selects A or B, state the preference in review notes.

DECISION: Scope boundary for multi-zone boost | A -- include in OOHDASH-144 with the cancel-hold change (recommended) | B -- cancel hold first (urgent fix), multi-zone in a new OOHDASH-145
DETAIL: Both features share the same workspacePayload extension (step 1 of the fix plan) and the same boilerPanelHeatingBranch. Bundling avoids two rounds of Playwright test changes. If the cancel fix is urgent and the zone-selection flow change is considered a larger scope add, option B ships the urgent fix first and follows with multi-zone separately.
-->

# OOHDASH-144 Discovery: Pub heating boost -- cancel active hold + multi-zone selection

Date: 2026-10-24

## Problem statement

Two gaps found during live acceptance testing on site 7639 (Black Bull, Corbridge).

**Gap 1:** When a V2 boilerControl boost hold is active, operators have no way to cancel it early. The guided flow shows no cancel affordance on any W-code card. The only cancel route is admin-only.

**Gap 2:** Zone selection in the boost flow is a single immediate commit. An operator cannot select multiple zones or "all zones" before committing, and ThingsBoard holds no zone location data (no room labels), so operators cannot inform callers which zone covers which area without asking.

## Discovery reference

See the interactive discovery gate artefact for full Q1-Q8 research, the five-part fix plan, and the two James decisions: https://claude.ai/artifact/LoxzafiCNmuB9AGgwsa9bj
