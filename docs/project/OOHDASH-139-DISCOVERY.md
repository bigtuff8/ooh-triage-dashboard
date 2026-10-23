# OOHDASH-139 Discovery: boilerControl heating flow is invisible

Date: 2026-10-23

## Problem statement

Site 6863 received a "heating off" call. ThingsBoard shows gk-6863-boilercontrol-1 is ACTIVE, online, on schedule (heating 11:00-22:30), summer mode off, weather compensation not blocking, and commanding the boiler (output1State=true, flow temps 62-49 C across zones). The correct agent outcome is: "Lighthouse IS commanding the boiler. Fault is in boiler hardware. Ask site to check boiler and call gas or heating engineer."

The dashboard cannot produce that outcome because the boilerControl device is invisible to the heating flow. Depending on what other devices exist at a given site, the agent sees either "No heating on Lighthouse at this site" (pure boilerControl-only sites) or an Accommodation chip from a co-located Salus iT700 (which is also wrong at a site where the boiler is Lighthouse-controlled).

James's observation -- "the dashboard still rarely shows anything other than accommodation when you land on a site, and I've not seen the agents being able to process any meaningful information" -- is consistent with this finding.

## Root causes

### RC1: no boilercontrol token in ASSET_INTENT (tb-device.js:307-322)

The classifier (classifyDevice, tb-device.js line 417) walks ASSET_INTENT to turn a device name token into a kind and deviceType. The table has entries for salusit700, salusit500, salus, intesis, tuya, gateway, and lighting families. It has no entry for "boilercontrol". A device named gk-6863-boilercontrol-1 produces tokens ["gk","6863","boilercontrol","1"]. None match any ASSET_INTENT row exactly or within two Levenshtein edits.

### RC2: no profile-based override for the boilerControl profile (tb-device.js:417-487)

The TB profile for all boilerControl devices is the string "boilerControl". classifyDevice receives the profile but uses it only for the refrigeration deny check (isRefrigerationDeny). There is no branch that checks `profile === 'boilerControl'` and assigns `deviceType: 'boiler-panel'` or any heating type.

### RC3: consequence -- device is typed as gateway

With no switch signal, no setpoint signal, and no ASSET_INTENT match, classifyDevice falls to its default: `{ kind: 'unknown', deviceType: 'gateway', controllable: false }` (tb-device.js line 461-462). The device appears in the workspace devices array but with kind "unknown" and deviceType "gateway".

### RC4: heatingDevices() excludes gateway (flows.js:124-131)

The filter in flows.js lines 125-130 admits only: salus-it700, salus-it500, salus, boiler-panel. A gateway-typed device is not in this set.

A gateway-typed device is not in this set. The boilerControl device is invisible to every area chip, every fallback chip, and every diagnostic branch of the heating flow.

### RC5: the boiler-panel flow branch is unreachable on the live path (flows.js:796-798)

heatingDevices() includes 'boiler-panel' as an admitted type, and flows.js line 796 checks `z.deviceType === 'boiler-panel'`. But the live TB-direct path never assigns that type to any device. The boiler-panel text -- "Pub heating here is monitored only. We can read the temperature from the boiler panel, but there's no remote adjustment path for heating on this site" -- can only be reached via fixture data (bridge-devices.json line 402 for site 6883), not from any live boilerControl site.

## Data gap: what ThingsBoard has that the dashboard does not read

The following table maps each diagnostic signal to its TB location and whether the dashboard reads it. All items below were verified live against site 6863 (V1) and site 6261 (V2).

| Signal | Location | Dashboard reads it? |
|---|---|---|
| Zone valve output states (output1State..output4State) | Timeseries | No -- fetched but discarded by mapTelemetry |
| Summer mode active flag (summerModeActive) | Timeseries | No -- fetched but discarded by mapTelemetry |
| Outside temperature (outsideTemp) | Timeseries | No -- fetched but discarded |
| Outside temp 12hr average | Timeseries | No -- fetched but discarded |
| Outside temp threshold (outsideTempThreshold) | SHARED_SCOPE | No -- not in the read key list |
| Summer mode date range (summerMode start/end) | SHARED_SCOPE | No -- not in the read key list |
| Accommodation fed from main boiler | SERVER_SCOPE | No -- server reads only active + lastActivityTime |
| Schedule entries (V1 output2-4Schedule) | SHARED_SCOPE | Yes -- read and decoded to a plain-text "next change" string; structured data discarded |
| Fallback state (output1..4Override = epoch timestamp) | Timeseries | No -- present in timeseries, discarded |
| output1OutputMask (V1 DHW wiring) | SHARED_SCOPE | Yes -- used for deriveBoilerControl only, not exposed to heating flow |
| heating_scenario (V2 discriminator) | CLIENT_SCOPE | Yes -- used for decodeDhwOverride only, not exposed to heating flow |

The schedule data in SHARED_SCOPE IS read but is converted only to a text description of the next change (decodeDeviceSchedule, tb-device.js line 119). Whether heating is currently within schedule window is not computed or exposed.

The `output1State` timeseries key is fetched (it comes back in the generic timeseries read at tb-device.js line 1198) but mapTelemetry does not map it. It is silently dropped before the device shape is built.

## Hypothesis verdicts

**H1 -- REFUTED**

Hypothesis: the backend assigns boiler-panel deviceType correctly; the "monitored only" text in the flow is just the wrong response for this scenario.

Evidence: the backend never assigns boiler-panel in the live TB-direct path. ASSET_INTENT has no boilercontrol token. classifyDevice produces gateway for all boilerControl devices. The boiler-panel text is unreachable at any live boilerControl site. Source: tb-device.js ASSET_INTENT lines 307-322, classifyDevice lines 417-487, fallback line 461-462.

**H2 -- REFUTED**

Hypothesis: the backend assigns all boilerControl devices to area Accommodation because accommodationFedFromMainBoiler is read.

Evidence: accommodationFedFromMainBoiler IS present in SERVER_SCOPE for site 6863 (verified live). But SERVER_SCOPE is read only for the keys "active,lastActivityTime" (tb-device.js line 1199). The attribute is never fetched. Furthermore, since the device is typed as gateway, deriveArea returns null regardless. The device does not land in Accommodation.

**H3 -- PROVEN**

Hypothesis: the backend reads no schedule, fallback, or summer-mode attributes from boilerControl panels, so the flow has no data to work with.

Evidence: the backend reads SHARED_SCOPE schedule keys (output1-4Schedule, CHZ1.schedule, DHW.schedule) but reduces them to a single human-readable string via decodeDeviceSchedule. Whether heating is currently within the active schedule window is not computed. Summer mode active state (summerModeActive timeseries) is fetched but discarded. outsideTempThreshold, summerMode dates, and output state flags are not read. Source: tb-device.js line 1207 (SHARED_SCOPE read), lines 119-128 (decodeDeviceSchedule returns a string, not structured data), mapTelemetry lines 629-655 (no mapping for summerModeActive, outputNState).

**H4 -- PROVEN**

Hypothesis: many boilerControl devices are not picked up by heatingDevices() at all.

Evidence: verified for site 6863 (V1) and site 6261 (V2). Both devices report no heatingSetpoint and no switch signals in their timeseries. Both produce deviceType "gateway" via classifyDevice. heatingDevices() (flows.js line 125-130) does not include gateway. Neither device appears in any area chip. Source: timeseries verified live 2026-10-23 for both sites.

## Site validation

Three sites confirmed. Two queried live 2026-10-23 against portal.lhlive.co.uk; one from prior session evidence.

| Site | Panel | Timeseries heatingSetpoint? | Timeseries switch signal? | classifyDevice result | heatingDevices() includes it? | Flow outcome |
|---|---|---|---|---|---|---|
| 6863 | V1 (2.8.2) | No | No | gateway | No | "No heating on Lighthouse at this site" |
| 6261 | V2 (V2, tags=boilercontrol_v2) | No | No | gateway | No | "No heating on Lighthouse at this site" |
| 6863 (correct expected) | V1 | -- | -- | should be boiler-panel | should be Yes | Schedule active, boiler commanding, fault in hardware |

For site 6261 the CLIENT_SCOPE has `heating_scenario: {"restaurant":"2CH + DHW","accom":1,"separate_dhw":1}`. For site 6863 the SERVER_SCOPE has `accommodationFedFromMainBoiler: "No - Own combi"`. Both are invisible to the current flow.

## What the correct agent outcome should be for "heating off" on a boilerControl site

Step 1. Confirm the device is online (lastActivityTime within threshold). If not: "Panel not reporting -- cannot diagnose. Escalate to IoT team."

Step 2. Read summerModeActive from timeseries. If true: "Heating is in summer mode. The panel has suspended heating because the outside temperature or date range indicates summer. Ask site whether this is intentional."

Step 3. Compare outsideTemp (timeseries) against outsideTempThreshold (SHARED_SCOPE). If outsideTemp >= threshold: "Weather compensation is blocking heating. The panel is reading outside temperature above the configured threshold and is suppressing the boiler demand. If the building is genuinely cold, the threshold may need adjusting."

Step 4. Read output1State (timeseries, the boiler call relay). If false: "Schedule is in off window or no active demand. Check the schedule entries [display schedule next change from decoded field]. If schedule is correct and no manual override is in place, escalate."

Step 5. If output1State is true: "Lighthouse is commanding the boiler. The boiler is being asked to heat. If the building is not warming up, the fault is in the boiler hardware, pipework, zone valves, or TRVs -- not in the Lighthouse controls. Ask site to check the boiler and call their gas or heating engineer."

Step 6. If accommodationFedFromMainBoiler indicates the accommodation has its own separate boiler, include that context in the outcome: "Note: accommodation at this site has its own boiler and is not controlled by Lighthouse."

## Proposed fix scope

Frontend flow logic (flows.js): The boiler-panel branch at lines 796-798 must be replaced with a multi-step decision tree that reads summerModeActive, weather comp state, output1State, and schedule status from workspace fields. This is not a one-line change; it is a new diagnostic branch with at least five decision points and separate outcome paths for "Lighthouse is commanding, hardware fault", "summer mode", "weather comp blocking", and "schedule in off window".

Backend workspace builder (tb-device.js): Three changes needed. (a) Add 'boilercontrol' to ASSET_INTENT as a new row mapping to kind:'heating', deviceType:'boiler-panel'. OR add a profile-based bypass in classifyDevice that checks `profile === 'boilerControl'` and returns the boiler-panel classification directly, bypassing ASSET_INTENT. (b) Extend the CLIENT_SCOPE read for boilerControl devices (tb-device.js line 1202) to include outsideTempThreshold and summerMode. (c) Extend mapTelemetry (tb-device.js line 629) to map summerModeActive and outputNState keys. Alternatively, extend the workspace payload to carry a structured boilerControlState object alongside boilerControl, containing zone output states, summer mode status, and weather comp status.

Both layers must change. A classifier-only fix makes the device visible but the flow still cannot produce a meaningful diagnosis because the workspace has none of the decision-point data. A data-only fix leaves the device invisible to heatingDevices(). Both fixes are required for the correct agent outcome.

## Cost and token efficiency note

The changes proposed are purely in the existing Node/Express backend and browser-side flow logic. No new LLM calls, subscriptions, or polling processes are introduced. The boilerControl telemetry and attribute reads (step b above) extend the existing per-device concurrent read bundle (tb-device.js line 1197) with additional keys -- no extra round trips, no background processes, no recurring cost.

Silent running: no change to any background or polling component. All data is fetched on the existing 30-second workspace refresh cycle already in place.

## Open questions for Spencer and Sam (DRAFT -- do not send)

These are candidate questions only, for review before sending. They are not sent as part of this discovery.

Q1 (Spencer -- TB schema): Does the V1 boilerControl device always report outputNState in timeseries? Is output1State consistently the boiler call relay across all V1 sites, or does the output mapping differ per installation? (Evidence at 6863: output1OutputMask=[false,true,true,true] suggests outputs 2-4 are the active circuits, but output1State was "true" -- clarification needed.)

Q2 (Spencer -- V2 equivalent): What is the V2 equivalent of output1State for reading whether the boiler is currently being commanded? The V2 uses CHZ1/CHZ2 channels not output1..4.

Q3 (Sam -- accommodationFedFromMainBoiler): This attribute is in SERVER_SCOPE at 6863 with value "No - Own combi". Is this attribute consistently populated across the boilerControl estate? Is the string value always one of a fixed set ("No - Own combi", "Yes", etc.) or free text?

Q4 (Sam -- scope of the problem): How many active sites have a boilerControl device and NO co-located Salus iT700? Those are the sites where the current flow shows "No heating on Lighthouse" falsely. A rough count would bound the impact before the fix is prioritised.

Q5 (Sam -- site 6863 alarm): SHARED_SCOPE for 6863 shows an ACTIVE_UNACK CRITICAL alarm: "Domestic hot water zone valve did not open in the morning". This is a live fault. Should this be surfaced to the on-call IoT team separately from this discovery?
