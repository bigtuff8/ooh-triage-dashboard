<!--
gate:contract
TICKET: OOHDASH-135
PHASE: design
QUESTIONS:
Q1: James -- for the boiler panel feature (item 5): Spencer's spec identifies the boilerControl device profile but does not list the exact ThingsBoard telemetry key names for panel on/off state or hot-water temperature. Should we hold the entire boiler panel feature until Spencer confirms both keys, or ship the hot-water temperature reading only if that key name can be confirmed first and add the on/off state in a follow-up?
Q2: James -- for the scope label on a pure-heating site (iT700 present, no DHW panel, no iT500 DHW unit): the Hot water scope row currently evaluates to "not available" because there is no hot-water signal device and no DHW capability. Is that the right label, or should it say something like "not on Lighthouse here" to distinguish "we have no hot water data at all" from "hot water exists but is not Lighthouse-controlled"?
SECTION: What We Are Building
This design covers five targeted changes to the OOH Triage Dashboard (v1.4.2) that follow from the OOHDASH-135 discovery of Spencer Thompson's SD-446 ThingsBoard command specification. The changes split into two tracks. Track 1 is a patch of four small, self-contained fixes that can ship together in a single release. Track 2 is a new boiler panel read path that is larger and ships as a separate minor increment once Spencer confirms the ThingsBoard telemetry key names. No new control commands are added in either track; the Intesis AC and hot-water boost paths remain as-is pending Spencer's bench tests and James's confirmed decisions from the discovery gate.
SECTION: Track 1 - Quick Wins (items 1-4)
Items 1 through 4 are each small code changes. All four ship together in one patch release because they are independent of each other and of the boiler panel track. Total estimated build time across all four is roughly 2 days.
SECTION: Track 2 - Boiler Panel Readings (item 5)
Item 5 adds a new device classification for boilerControl profile devices and surfaces their telemetry read-only in the dashboard. It is blocked on Spencer confirming the exact ThingsBoard telemetry key names for the panel on/off state and the hot-water temperature. It ships as a separate minor increment. Estimated build time is 3 to 5 days once the key names are known.
DECISION: Track 1 -- patch release (items 1-4) and Track 2 -- boiler panel minor increment (item 5) ship separately.
DECISION: Q1 to James -- hold item 5 until Spencer confirms both telemetry key names, OR ship hot-water temperature only if one key is confirmed. James to decide.
DECISION: Q2 to James -- Hot water scope label for pure-heating sites. James to confirm whether "not available" or a distinct label is correct for a site that has no DHW device at all.
-->

# OOHDASH-135 Design: SD-446 Command Spec Changes to OOH Dashboard

**Version:** 1.0
**Date:** 2026-10-19
**Author:** Design doer (Claude Sonnet 4.6)
**Ticket:** OOHDASH-135
**Codebase:** v1.4.2, head d000bb3

---

## Context and Scope

The OOHDASH-135 discovery mapped Spencer Thompson's SD-446 ThingsBoard command specification to the OOH dashboard. The discovery found five gaps between what the spec enables and what the dashboard currently does. James signed off the design scope on 19 October 2026.

James's gate decisions from discovery:

- Q1 (Intesis AC): do not add AC control. Keep referring handlers to the IoT team. No change to the dashboard's aircon referral path.
- Q2 (Boiler panels): yes, surface boiler panel readings in the dashboard. Read-only; no OOH control of panels.

The two tracks below implement that scope. Nothing in this design changes the WRITES_DISABLED kill switch, the bridge configuration, the Tuya switch command path, the iT700 setpoint command path, or the escalation flows.

---

## Code Reading: Corrections to the Discovery Brief

Reading the four key files before designing revealed three corrections to the stated file locations in the discovery brief. These do not change what needs to be done -- only where in the code it lives.

**Correction 1: hwBoostHoursDesired bug location.** The discovery brief described the bug as being in "the hwboost command entry" in registry.js. The actual location is line 222 of registry.js, inside the `case 'hwboost':` branch of the `validateCommand` function, in the return statement: `return { ok: true, attribute: 'hwBoostHoursDesired', value: v };`. The REGISTRY struct's entry for salus-it500-dhw lists `commands: ['hwboost']` but does not hold the attribute name. The attribute name is constructed in validateCommand's return. Build must fix line 222, not a struct field.

**Correction 2: iT500 CONTROL_CONTRACT location.** The discovery brief said the iT500 CONTROL_CONTRACT with `controllable: false` is in tb-device.js. It is in registry.js, lines 107-112, in the `CONTROL_CONTRACT` object. The iT500 entry reads `controllable: false, dark: true`. Build must edit registry.js for this change, not tb-device.js.

**Correction 3: Scope label logic is already partially evidence-based.** The discovery brief described the Controllable label as deriving from "hardware presence" only. In fact, routes/api.js already uses evidence-based logic in the SCOPE_GROUPS for kitchen, lighting, and fan (switchControllable, which checks command list), and for hot water (boilerControl.dhwControllable). The gap is specifically in the heating row: it falls through to "monitored" for Salus iT700 and iT500 sites because those are not boilerControl sites, even though the dashboard genuinely offers setpoint control for iT700. Item 4 targets this remaining gap.

**Correction 4: REGISTRY already has the boiler-panel entry.** The discovery brief did not note that registry.js already has `'boiler-panel': { label: 'Pub boiler panel', commands: [] }` (line 77). No registry change is needed for item 5.

---

## Track 1: Patch Items 1-4

### Item 1: Show All Lighting Circuits and All Fans Individually

**Problem.**
In `public/js/flows.js`, the lighting flow and the fan flow each use `ws.devices.find(d => d.kind === 'lighting')` and `ws.devices.find(d => d.kind === 'fan')`. The `find` method returns only the first matching device. A site with three lighting circuits shows only circuit 1. The workspace payload from routes/api.js sends all devices with no truncation -- the truncation is entirely in the flows.js render.

**Designed behaviour.**
The lighting flow renders every device with `d.kind === 'lighting'`, each as its own row. Each row shows the device name (from `d.zone`), online or offline status, current on/off state (`d.telemetry.switch_1`), and a Switch button when `canSwitch(d)` is true. Rows are ordered alphabetically by `d.deviceId`. The same pattern applies to fans. The flow header summarises the count ("3 lighting circuits on Lighthouse here") before listing individual rows.

**Files changed.**

| File | Change |
|---|---|
| public/js/flows.js | Replace `devices.find(d => d.kind === 'lighting')` with a filter and loop. Replace `devices.find(d => d.kind === 'fan')` with a filter and loop. |
| routes/api.js | No change. Server already sends all devices. |

**No server change needed.** The workspace payload at routes/api.js line 206 maps `site.devices` without any truncation. Build only needs to touch flows.js.

**Unhappy path.** When no lighting devices are present the existing "External lighting at this site isn't on Lighthouse" path remains. When a site has multiple circuits and one is offline, each circuit shows its own online/offline status. The flow does not require all circuits to be online before offering the switch button; individual canSwitch checks per device gate the button as before.

**Cost and token impact.** No LLM calls involved. No polling or background work. Zero ongoing cost.

---

### Item 2: Fix hwBoostHoursRequested Attribute Name

**Problem.**
The `validateCommand` function in registry.js, `case 'hwboost':`, returns `attribute: 'hwBoostHoursDesired'`. The IoT Command Gate reads `hwBoostHoursRequested` from SERVER_SCOPE (a Requested write), not `hwBoostHoursDesired` (which is a Desired write). A Desired write bypasses the gate entirely; the bridge is never rung. The hot-water boost command is silently broken for iT500 DHW devices.

**Designed behaviour.**
Change the return statement to `attribute: 'hwBoostHoursRequested'`. This routes the boost command through the existing IoT Command Gate path, consistent with every other command in the system.

**File changed.**

| File | Change |
|---|---|
| services/registry.js | Line 222: change `'hwBoostHoursDesired'` to `'hwBoostHoursRequested'` in the hwboost case return statement. One character change in one line. |

**Why latent today.** The iT500 fleet is offline. No handler can successfully invoke hwboost via the UI because the iT500 devices are dark (controllable: false, see item 3). This bug therefore has no production impact today, but fixing it now is the right time -- before the fleet comes back and before Spencer bench-tests the boost command.

**Cost and token impact.** No LLM calls involved. No ongoing cost.

---

### Item 3: Fix iT500 CONTROL_CONTRACT (controllable: false to true)

**Problem.**
In registry.js, the CONTROL_CONTRACT entry for `'salus-it500'` has `controllable: false, dark: true`. This means that even when the iT500 fleet is restored to reporting, the dashboard will not offer temperature control -- `capabilitiesContractFor('salus-it500')` returns `controllable: false` and the flows gate the control affordance on this.

**Designed behaviour.**
Change `controllable: false` to `controllable: true` and `dark: true` to `dark: false` (or remove the `dark` field if it defaults to false). The iT500 setpoint command path is bench-proven. Combined with item 2, once the fleet comes back, handlers will be offered temperature control and any boost command will route correctly through the gate.

**File changed.**

| File | Change |
|---|---|
| services/registry.js | Lines 111-112: change `controllable: false, dark: true` to `controllable: true` in the salus-it500 CONTROL_CONTRACT entry. |

**Note on the salus bare-type entry.** The `salus` (old-convention, bare) entry at lines 113-118 also has `controllable: false, dark: true`. The discovery brief did not include this in scope. These devices have stopped reporting and the fix for them depends on IoT team action on the legacy fleet; this design does not change the `salus` entry.

**Cost and token impact.** No LLM calls involved. No ongoing cost.

---

### Item 4: Fix the Heating Scope Level for Thermostat-Controlled Sites

**Problem.**
The SCOPE_GROUPS in routes/api.js, `key: 'heating'`, evaluates to 'ctl' only when `s.boilerControl?.heatingControllable` is true. boilerControl is set only when a site has a boilerControl profile device (pub C&B sites). Salus iT700 and iT500 sites have no boilerControl device, so the heating level falls through to 'mon' (monitored, because `s.devices.some(d => d.kind === 'heating')` is true). This means the "other" flow's scope check tells a handler "Heating is monitored only at this site" even at a site where the dashboard genuinely offers iT700 setpoint control.

**Designed behaviour.**
The heating scope level must be 'ctl' when the site has any classified heating device with `controllable: true` in the devices array. Add a check for this before the existing device-presence fallback. The three-way result remains 'ctl', 'mon', or 'none'.

The full evaluation order for heating:

1. boilerControl.heatingControllable true: 'ctl' (pub C&B site, boiler panel).
2. Any device with `d.kind === 'heating'` and `d.controllable === true`: 'ctl' (iT700 online, iT500 after fleet restoration).
3. Any device with `d.kind === 'heating'` and `d.controllable !== true`: 'mon' (heating on Lighthouse but not currently controllable -- dark-fleet Salus, boiler-panel only before item 5 lands).
4. No heating device: 'none'.

**File changed.**

| File | Change |
|---|---|
| routes/api.js | SCOPE_GROUPS heating level function: add a check for `s.devices.some(d => d.kind === 'heating' && d.controllable)` between the boilerControl check and the device-presence fallback. |

**Hot water scope.** The existing hot water logic (`hasControllableDhw(s) ? 'ctl' : hasHotWaterSignal(s) ? 'mon' : 'none'`) is accurate for the current product. No change needed here unless James answers Q2 with a different label requirement for sites that have no hot water device at all.

**Cost and token impact.** No LLM calls involved. No ongoing cost.

---

## Track 2: Boiler Panel Readings (Item 5)

### Item 5: Classify boilerControl Profile Devices and Surface Their Telemetry

**Context.**
Approximately 130 boiler control panels exist in ThingsBoard on the `boilerControl` device profile. The IoT team controls these directly (override commands, schedule writes). OOH handlers need to read panel state to diagnose "no heating" and "no hot water" calls. James confirmed (19 October) that surfacing panel readings is in scope.

The existing codebase already handles boilerControl devices in some places. The server's `fetchLiveSitesByNumber` in tb-device.js identifies boilerControl devices by profile and calls `deriveBoilerControl` to set the site-level `boilerControl` field. This field is already used by the scope groups and the hotwater flow. However, the `classifyDevice` function in tb-device.js does not produce `deviceType: 'boiler-panel'` for boilerControl devices -- they fall through to unknown and are typed as `gateway`. This means the boiler-panel branch in the heating flow (`z.deviceType === 'boiler-panel'`, flows.js line 633) never fires in production, because no device ever gets that type from the classifier. Item 5 closes this gap.

The registry.js already has `'boiler-panel': { label: 'Pub boiler panel', commands: [] }`. No registry change is needed.

**Blocker.** This item is blocked on Spencer Thompson confirming the exact ThingsBoard telemetry key names for:
- Panel on/off state (which OUTPUT the panel is sending, e.g. `output1State` or a named key -- the discovery found `output1State` already in mapTelemetry but it is not confirmed as the right key for "panel commanding the boiler").
- Hot-water temperature (likely `hotWaterTemp` or similar, but the boilerControl profile spec did not list telemetry keys explicitly).

James's Q1 decision governs whether to wait for both keys or ship a partial.

**Classifier change (tb-device.js: classifyDevice function).**
Add a profile-based early-return to classifyDevice, before the refrigeration deny and before the capability signal checks. When the raw profile parameter equals `'boilerControl'` (case-insensitive match), return immediately with `{ kind: 'heating', deviceType: 'boiler-panel', deviceTypeLabel: 'Pub boiler panel', controllable: false, control: null }`. Profile-based classification is justified here because boilerControl devices are specifically provisioned devices whose identity is authoritative by profile, not by name tokens or telemetry signals. The early return gives it highest precedence and prevents any subsequent name-token or telemetry path from reclassifying the device.

**Telemetry mapping (tb-device.js: mapTelemetry function).**
Once Spencer confirms the key names, add the boiler panel readings to mapTelemetry's output object. The canonical field names to use in the internal device shape are `boilerOnOff` (boolean) and `hwTempC` (number). The raw TB key names are not yet confirmed. Build will map from the confirmed raw keys to these canonical names.

The existing mapTelemetry output already includes `output1State` (line 646 of tb-device.js). If Spencer confirms this is the panel on/off key, no new key is needed -- just ensure the field is exposed in the boiler-panel telemetry shape.

**Routes (routes/api.js).**
No change needed to the workspace payload builder. The `devices` array already includes all classified devices including the newly-typed boiler-panel device. The scope groups for heating already handle the boilerControl.heatingControllable path. Once classifyDevice returns 'boiler-panel' type, the device will appear in the heating device list in the flows.

**Flows (flows.js).**
The heating flow already has a boiler-panel branch at lines 619 and 633 that fires when `z.deviceType === 'boiler-panel'`. Currently this branch is unreachable in production (the type is never emitted). Once item 5's classifier change lands, the branch becomes live. The existing text ("This zone can't be adjusted remotely yet") should be updated to "The IoT team controls this panel directly from ThingsBoard" to be accurate (it is not about future capability, it is by design). The read row should show `hwTempC` if present.

For the hotwater flow, the existing text already says "Hot water here runs on the boiler panel, which this dashboard monitors but can't control." Once telemetry keys are confirmed and mapped, add the `hwTempC` reading to the hotwater flow's stage 0 display so handlers can see whether there is hot water at the reported temperature.

**Control.** No control commands are added for boiler-panel devices. The existing empty commands list in the REGISTRY backstops any attempted command -- `validateCommand` returns a refusal for any device whose type has an empty commands list. This is defence in depth behind the non-controllable classifier flag.

---

## Files Changed Summary

| Item | File | Nature of change |
|---|---|---|
| 1 | public/js/flows.js | Replace find with filter-and-loop for lighting and fan flows |
| 2 | services/registry.js | Line 222: hwBoostHoursDesired to hwBoostHoursRequested in validateCommand return |
| 3 | services/registry.js | Lines 111-112: iT500 CONTROL_CONTRACT controllable: false to true, dark: true to false |
| 4 | routes/api.js | SCOPE_GROUPS heating level: add controllable-device check before mon fallback |
| 5 | services/tb-device.js | Profile-based early-return in classifyDevice for boilerControl; mapTelemetry boiler keys |
| 5 | public/js/flows.js | Update boiler-panel heating text; add hwTempC to hotwater flow display |

---

## What Does Not Change

- Intesis AC control (referring to IoT team, James Q1 decision).
- Hot-water boost in the UI (Spencer bench test pending; iT500 fleet offline).
- The `salus` bare-type CONTROL_CONTRACT (legacy fleet, IoT team dependency).
- Intesis mode command (Spencer bench test pending).
- The WRITES_DISABLED kill switch (unchanged and authoritative).
- The Tuya switch command path.
- The iT700 setpoint command path.
- The P1 escalation flows.
- The connectivity flow.
- The gate freshness window or bridge configuration.

---

## Data Dictionary

This design introduces two new canonical internal field names for boiler panel telemetry. All other field names in scope (switchRequested, setpointRequested, hwBoostHoursRequested, switch_1, heatingSetpoint, setPoint) already exist in the data dictionary (DATA_DICTIONARY.md). Build uses the canonical names below; the raw ThingsBoard key names are confirmed by Spencer before item 5 build starts.

| Canonical field | Device types | Description | Retention | Sensitivity |
|---|---|---|---|---|
| boilerOnOff | boiler-panel | Whether the boiler control panel is currently commanding the boiler. Boolean. Sourced from the confirmed TB telemetry key for panel output state. | Live workspace only. Not persisted. | Low. |
| hwTempC | boiler-panel | Hot-water temperature as measured by the boiler panel sensor, in degrees Celsius. Number. Sourced from the confirmed TB telemetry key for hot-water temperature. | Live workspace only. Not persisted. | Low. |

---

## Test Scripts and Test Data

These are the concrete test assets for end-to-end verification post-build. They extend the existing Playwright suite where noted.

### Track 1 tests (items 1-4)

**T1-1: Multiple lighting circuits shown individually.**
Precondition: fixture site with 3 tuya-lighting devices (e.g. gk-6237-light-carpark, gk-6237-light-frontage, gk-6237-light-rear). All three online.
Steps: Confirm site 6237. Open Lighting flow.
Expected: All three circuit rows appear, each with zone name, on/off state, and Switch button. No circuit is missing.
Test data: Extend bridge-devices.json fixture for site 6237 to include three distinct lighting devices.

**T1-2: Multiple fans shown individually.**
Precondition: fixture site with 2 tuya-fan devices.
Steps: Confirm site. Open Fan flow.
Expected: Both fan rows appear independently with their own on/off and Switch buttons.

**T1-3: hwBoostHoursRequested dispatches to SERVER_SCOPE.**
Precondition: fixture site with a salus-it500-dhw device reporting (after controllable flag is fixed).
Steps: Use control dispatch endpoint directly with command hwboost, value 2.
Expected: The dispatched attribute is hwBoostHoursRequested, not hwBoostHoursDesired. Verify via the control action record.

**T1-4: iT500 offers control when reporting.**
Precondition: fixture device classified as salus-it500 with heatingSetpoint 18 and online.
Steps: Confirm site. Open Heating flow. Select accommodation area.
Expected: Setpoint control is offered (the setpoint window appears). The CONTROL_CONTRACT for the device has controllable: true.

**T1-5: Heating scope level is ctl for iT700 site.**
Precondition: fixture site with an online salus-it700 device and no boilerControl device.
Steps: POST /sites/:siteNo/confirm. Read workspace.scope for key heating.
Expected: level is ctl, not mon.

**T1-6: Heating scope level is mon for dark-fleet salus site.**
Precondition: fixture site with a salus (bare-type) device, offline, controllable: false.
Steps: As T1-5.
Expected: level is mon.

### Track 2 tests (item 5, once telemetry keys confirmed)

**T2-1: boilerControl profile device classified as boiler-panel.**
Precondition: fixture device with profile boilerControl, name gk-6100-boiler-panel-1, no telemetry.
Steps: Call classifyDevice('gk-6100-boiler-panel-1', 'boilerControl', null).
Expected: Returns deviceType boiler-panel, kind heating, controllable false.

**T2-2: Boiler panel telemetry mapped from confirmed TB keys.**
Precondition: fixture telemetry bag with the confirmed TB on/off key and temperature key.
Steps: Call mapTelemetry with the confirmed raw keys present.
Expected: Output contains boilerOnOff (boolean) and hwTempC (number).

**T2-3: Heating flow shows boiler-panel read-only branch.**
Precondition: fixture site with a classified boiler-panel device, online, hwTempC 55.
Steps: Confirm site. Open Heating flow. Select the area.
Expected: The read row shows 55 degrees C. The reco card says "The IoT team controls this panel directly from ThingsBoard." No Switch or setpoint button appears.

**T2-4: No control command accepted for boiler-panel device.**
Precondition: As T2-3.
Steps: POST /control/dispatch with deviceId matching the boiler-panel device and command switch true.
Expected: 400 response. validateCommand returns refusal because boiler-panel commands list is empty.

---

## Cost and Token Efficiency Evaluation

Track 1 has zero LLM token cost and zero per-operation cost. All four items are pure code changes in a Node.js server and a browser JS file. There is no polling, no background worker, and no new API call added.

Track 2 adds one new ThingsBoard telemetry read per boilerControl device per site workspace fetch. The existing site workspace fetch already reads all devices' telemetry concurrently. Adding the boiler panel telemetry fields (boilerOnOff and hwTempC) to the existing concurrent telemetry batch for the boilerControl device means zero extra HTTP round-trips. The marginal cost is two additional JSON keys in one existing request. This is negligible.

No new background or polling work is introduced by either track. The dashboard's existing 30-second workspace refresh already covers boiler panel telemetry on the same schedule as all other device telemetry.

## Silent Running Evaluation

Neither track introduces any background component, daemon, polling job, scheduled task, or watcher. The boiler panel telemetry is fetched on demand as part of the existing per-site workspace fetch path. Idle cost is zero. Token cost is zero except when a handler actively loads a site workspace.

---

## How the CX Criteria Are Realised

| CX criterion from discovery | Realised by | Where in the product |
|---|---|---|
| Handler can see all lighting circuits, not just the first | Item 1: flows.js filter-and-loop renders every lighting device as its own row with its own switch state and button | Lighting flow, all circuit rows |
| Handler can see all fans | Item 1: same pattern for fan devices | Fan flow, all fan rows |
| Hot-water boost command actually reaches the IoT Command Gate | Item 2: hwBoostHoursRequested fix routes the command to SERVER_SCOPE as the gate expects | Control dispatch path, backend only |
| iT500 setpoint control offered when fleet is restored | Item 3: controllable: true allows the flow to offer the setpoint window | Heating flow, accommodation area |
| Scope label "Controllable" is honest for iT700 sites | Item 4: scope heating level reads the device's actual controllable flag | "Other" flow scope check; workspace scope payload |
| Handler can read boiler panel state to diagnose no-heat calls | Item 5: boilerControl devices classified as boiler-panel and their telemetry surfaced in the heating flow | Heating flow, boiler-panel read branch (lines 619, 633 of flows.js) |
| Handler knows not to try controlling the boiler panel from the dashboard | Item 5: existing reco card text updated to name the IoT team as the controller | Heating flow, boiler-panel reco card |

---

## Open Questions

These are reproduced from the gate:contract header.

Q1 (to James and Spencer): Boiler panel telemetry key names. The design assumes Spencer can confirm the exact ThingsBoard key names for panel on/off state and hot-water temperature before item 5 build starts. If both keys cannot be confirmed, James decides whether to hold the feature or ship hot-water temperature only as a partial.

Q2 (to James): Hot water scope label for pure-heating sites. A site with an iT700 and no DHW device shows hot water as 'none' today. If "none" is the right label, no change is needed. If James wants a distinct label for "hot water exists at the site but is not on Lighthouse" versus "no DHW device at all on this Lighthouse estate", the scope level logic needs a fourth state (which has UI implications). James to confirm before build.
