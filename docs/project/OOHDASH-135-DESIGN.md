<!--
gate:contract
TICKET: OOHDASH-135
PHASE: design
QUESTIONS:
Q1: James -- for the boiler panel feature (item 5): Spencer's spec identifies the boilerControl device profile but does not list the exact ThingsBoard telemetry key names for panel on/off state or hot-water temperature. Should we hold the entire boiler panel feature until Spencer confirms both keys, or ship the hot-water temperature reading only if that key name can be confirmed first and add the on/off state in a follow-up? Note: if you choose the partial (temperature only), the design requires a permanent inline caveat that panel command state is unmonitored — see Track 2 below for the exact wording and why omitting it risks misdiagnosis.
Q2: James -- for the scope label on a pure-heating site (iT700 present, no DHW panel, no iT500 DHW unit): the Hot water scope row currently evaluates to "not available" because there is no hot-water signal device and no DHW capability. Is that the right label, or should it say something like "not on Lighthouse here" to distinguish "we have no hot water data at all" from "hot water exists but is not Lighthouse-controlled"?
Q3: James / IoT -- WRITES_DISABLED current state: before any fleet reconnection event or write-path go-live, the current runtime value of WRITES_DISABLED must be confirmed and recorded. This design does not change it. A future "enable boost" design must begin by confirming this value. Please record the confirmed state and the date it was checked.
SECTION: What We Are Building
This design covers five targeted changes to the OOH Triage Dashboard (v1.4.2) that follow from the OOHDASH-135 discovery of Spencer Thompson's SD-446 ThingsBoard command specification. The changes split into two tracks. Track 1 is a patch of four small, self-contained fixes that ship together in a single release. Track 2 is a new boiler panel read path that ships as a separate minor increment once Spencer confirms the ThingsBoard telemetry key names. No new control commands are added in either track. The hot-water boost write path (salus-it500-dhw device type) is NOT enabled by this design: three independent gates keep it closed — the WRITES_DISABLED kill switch (unchanged), the salus-it500-dhw CONTROL_CONTRACT controllable: false flag (unchanged, a separate entry from salus-it500), and the Spencer bench-test sign-off requirement. Items 2 and 3 do not open any of these gates. Item 2 corrects the attribute name so the boost command will route correctly when boost is eventually enabled by a future, separately-designed change; item 3 makes the heating thermostat (salus-it500) controllable for setpoint commands only and does not touch the DHW device (salus-it500-dhw).
SECTION: Track 1 - Quick Wins (items 1-4)
Items 1 through 4 are each small code changes. All four ship together in one patch release because they are independent of each other and of the boiler panel track. Total estimated build time across all four is roughly 2 days.
SECTION: Track 2 - Boiler Panel Readings (item 5)
Item 5 adds a new device classification for boilerControl profile devices and surfaces their telemetry read-only in the dashboard. It is blocked on Spencer confirming the exact ThingsBoard telemetry key names. The design includes a telemetry staleness guard: if the boilerControl device's last ThingsBoard activity timestamp is more than 5 minutes old at workspace-fetch time, the reading is shown with a stale warning rather than as current fact. Value sanity bounds are enforced before any reading is displayed. If James chooses the Q1 partial (hwTempC only, no boilerOnOff), the temperature display must carry a permanent inline caveat that panel command state is unmonitored — without this, a handler can mistake a healthy temperature for a healthy call and close a still-broken job. It ships as a separate minor increment. Estimated build time is 3 to 5 days once the key names are known.
DECISION: Track 1 -- patch release (items 1-4) and Track 2 -- boiler panel minor increment (item 5) ship separately.
DECISION: salus-it500-dhw controllable flag -- this design does NOT change it. The boost write path stays fully gated. A future, separately-scoped design change enables boost by changing salus-it500-dhw to controllable: true — and that change must begin by confirming WRITES_DISABLED state (Q3) and receiving Spencer's bench-test sign-off.
DECISION: Q1 to James -- hold item 5 until Spencer confirms both telemetry key names, OR ship hot-water temperature only (partial) with the mandatory panel-state-unknown caveat described in Track 2. James to decide.
DECISION: Q2 to James -- Hot water scope label for pure-heating sites. James to confirm whether "not available" or a distinct label is correct.
-->

# OOHDASH-135 Design: SD-446 Command Spec Changes to OOH Dashboard

**Version:** 1.1
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

Reading the four key files before designing revealed five corrections to the discovery brief. These do not change what needs to be done — only where in the code it lives and what the current device-type boundaries are.

**Correction 1: hwBoostHoursDesired bug location.** The discovery brief described the bug as being in "the hwboost command entry" in registry.js. The actual location is line 222 of registry.js, inside the `case 'hwboost':` branch of the `validateCommand` function, in the return statement: `return { ok: true, attribute: 'hwBoostHoursDesired', value: v };`. The REGISTRY struct's entry for salus-it500-dhw lists `commands: ['hwboost']` but does not hold the attribute name. The attribute name is constructed in validateCommand's return. Build must fix line 222, not a struct field.

**Correction 2: iT500 CONTROL_CONTRACT location.** The discovery brief said the iT500 CONTROL_CONTRACT with `controllable: false` is in tb-device.js. It is in registry.js, lines 107-112, in the `CONTROL_CONTRACT` object. Build must edit registry.js for this change, not tb-device.js.

**Correction 3: salus-it500 and salus-it500-dhw are separate CONTROL_CONTRACT entries.** The discovery brief treated the iT500 as a single device type. In registry.js, there are two distinct CONTROL_CONTRACT entries: `'salus-it500'` (the heating thermostat, which receives setpoint commands) and `'salus-it500-dhw'` (the DHW hot-water device, which receives the hwboost command). Both currently have `controllable: false, dark: true`. These entries are independent: making one controllable does not affect the other. Item 3 of this design changes only `salus-it500` (thermostat). The `salus-it500-dhw` entry is not changed by this design and is not intended to be — the boost path stays gated until Spencer's bench test is complete and a future design separately enables it.

**Correction 4: Scope label logic is already partially evidence-based.** The discovery brief described the Controllable label as deriving from "hardware presence" only. In fact, routes/api.js already uses evidence-based logic in the SCOPE_GROUPS for kitchen, lighting, and fan (switchControllable, which checks command list), and for hot water (boilerControl.dhwControllable). The gap is specifically in the heating row: it falls through to "monitored" for Salus iT700 and iT500 sites because those are not boilerControl sites, even though the dashboard genuinely offers setpoint control for iT700. Item 4 targets this remaining gap.

**Correction 5: REGISTRY already has the boiler-panel entry.** The discovery brief did not note that registry.js already has `'boiler-panel': { label: 'Pub boiler panel', commands: [] }` (line 77). No registry change is needed for item 5.

---

## Track 1: Patch Items 1-4

### Item 1: Show All Lighting Circuits and All Fans Individually

**Problem.**
In `public/js/flows.js`, the lighting flow and the fan flow each use `ws.devices.find(d => d.kind === 'lighting')` and `ws.devices.find(d => d.kind === 'fan')`. The `find` method returns only the first matching device. A site with three lighting circuits shows only circuit 1. The workspace payload from routes/api.js sends all devices with no truncation — the truncation is entirely in the flows.js render.

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
The `validateCommand` function in registry.js, `case 'hwboost':`, returns `attribute: 'hwBoostHoursDesired'`. The IoT Command Gate reads `hwBoostHoursRequested` from SERVER_SCOPE (a Requested write), not `hwBoostHoursDesired` (which is a Desired write). A Desired write bypasses the gate entirely; the bridge is never rung. The hot-water boost command would be silently misrouted for iT500 DHW devices.

**Designed behaviour.**
Change the return statement to `attribute: 'hwBoostHoursRequested'`. This ensures that when the boost command is eventually enabled by a future change, it routes through the existing IoT Command Gate path, consistent with every other command in the system.

**File changed.**

| File | Change |
|---|---|
| services/registry.js | Line 222: change `'hwBoostHoursDesired'` to `'hwBoostHoursRequested'` in the hwboost case return statement. One character change in one line. |

**Why this is latent today — two independent gates are closed.**
The boost write path is gated by two conditions that are each independently blocking it today:

1. **The iT500 DHW fleet is offline.** No salus-it500-dhw device is reporting, so no handler can reach a live DHW device.
2. **salus-it500-dhw has `controllable: false` in its own CONTROL_CONTRACT entry.** This is a separate registry entry from `salus-it500` (the thermostat). Because `controllable: false`, the dashboard flows do not offer the boost affordance in the UI, and the control dispatch endpoint will refuse a boost request for a non-controllable device.

This attribute-name fix does not change either of those gates. It is a correctness fix only — the wrong attribute name would cause a silent misroute when boost is eventually activated. Fixing it now prevents a second, harder-to-debug failure when the fleet returns and a future change deliberately enables boost. The boost write path does not become reachable through this design.

**What this design does NOT do.**
This design does NOT change `salus-it500-dhw` to `controllable: true`. That change is deliberately deferred and separately gated on Spencer's bench-test sign-off plus a confirmed WRITES_DISABLED state (see Q3). See "What Does Not Change" below.

**Cost and token impact.** No LLM calls involved. No ongoing cost.

---

### Item 3: Fix iT500 CONTROL_CONTRACT (salus-it500 thermostat only)

**Problem.**
In registry.js, the CONTROL_CONTRACT entry for `'salus-it500'` (the heating thermostat) has `controllable: false, dark: true`. This means that even when the iT500 heating fleet is restored to reporting, the dashboard will not offer temperature control — `capabilitiesContractFor('salus-it500')` returns `controllable: false` and the flows gate the setpoint control affordance on this.

**Designed behaviour.**
Change `controllable: false` to `controllable: true` and `dark: true` to `dark: false` (or remove the `dark` field if it defaults to false) in the `salus-it500` CONTROL_CONTRACT entry only. The iT500 setpoint command path is bench-proven. Once the heating fleet comes back, handlers will be offered setpoint control on iT500-heated sites.

**Scope of this change — thermostat only, not DHW.**
This change touches only the `salus-it500` entry. The `salus-it500-dhw` entry (the DHW device) is a separate CONTROL_CONTRACT entry in registry.js and is NOT changed by this item. The boost affordance for DHW devices stays off. Making the heating thermostat controllable does not open the boost write path in any way — the two device types have separate entries, separate command lists, and separate controllable flags.

**File changed.**

| File | Change |
|---|---|
| services/registry.js | Lines 111-112: change `controllable: false, dark: true` to `controllable: true` in the salus-it500 CONTROL_CONTRACT entry only. The salus-it500-dhw entry is untouched. |

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
2. Any device with `d.kind === 'heating'` and `d.controllable === true`: 'ctl' (iT700 online; iT500 after fleet restoration and item 3 landing).
3. Any device with `d.kind === 'heating'` and `d.controllable !== true`: 'mon' (heating on Lighthouse but not currently controllable — dark-fleet Salus; boiler-panel only before item 5 lands).
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

The existing codebase already handles boilerControl devices in some places. The server's `fetchLiveSitesByNumber` in tb-device.js identifies boilerControl devices by profile and calls `deriveBoilerControl` to set the site-level `boilerControl` field. This field is already used by the scope groups and the hotwater flow. However, the `classifyDevice` function in tb-device.js does not produce `deviceType: 'boiler-panel'` for boilerControl devices — they fall through to unknown and are typed as `gateway`. This means the boiler-panel branch in the heating flow (`z.deviceType === 'boiler-panel'`, flows.js line 633) never fires in production. Item 5 closes this gap.

The registry.js already has `'boiler-panel': { label: 'Pub boiler panel', commands: [] }`. No registry change is needed.

**Blocker.** This item is blocked on Spencer Thompson confirming the exact ThingsBoard telemetry key names for:
- Panel on/off state (which OUTPUT the panel is sending, e.g. `output1State` or a named key — the discovery found `output1State` already in mapTelemetry but it is not confirmed as the right key for "panel commanding the boiler").
- Hot-water temperature (likely `hotWaterTemp` or similar, but the boilerControl profile spec did not list telemetry keys explicitly).

James's Q1 decision governs whether to wait for both keys or ship a partial.

---

**Classifier change (tb-device.js: classifyDevice function).**
Add a profile-based early-return to classifyDevice, before the refrigeration deny and before the capability signal checks. When the raw profile parameter equals `'boilerControl'` (case-insensitive match), return immediately with `{ kind: 'heating', deviceType: 'boiler-panel', deviceTypeLabel: 'Pub boiler panel', controllable: false, control: null }`. Profile-based classification is justified here because boilerControl devices are specifically provisioned devices whose identity is authoritative by profile. The early return gives it highest precedence and prevents any subsequent name-token or telemetry path from reclassifying the device.

---

**Telemetry mapping (tb-device.js: mapTelemetry function).**
Once Spencer confirms the key names, add the boiler panel readings to mapTelemetry's output object. The canonical field names to use in the internal device shape are `boilerOnOff` (boolean) and `hwTempC` (number). The raw TB key names are not yet confirmed. Build will map from the confirmed raw keys to these canonical names.

The existing mapTelemetry output already includes `output1State` (line 646 of tb-device.js). If Spencer confirms this is the panel on/off key, no new raw key is needed — just ensure the field is exposed in the boiler-panel telemetry shape as `boilerOnOff`.

---

**Telemetry staleness guard.**
The dashboard's existing workspace fetch already retrieves `lastActivityTime` per device from the ThingsBoard device list endpoint. Before surfacing boiler panel readings, the server must compare `lastActivityTime` for the boilerControl device against the current fetch timestamp. If the gap exceeds 5 minutes, the boiler panel section carries a staleness warning: "Last reading received [N] minutes ago — may not reflect current state." The temperature and on/off values are shown but visually muted (reduced opacity or a muted colour from the design system). The handler sees the stale value but cannot mistake it for a live reading.

The 5-minute threshold is anchored to the existing 30-second workspace refresh: a device that has not pushed telemetry in 5 minutes has missed 10 refresh cycles. At that point the panel is plausibly disconnected or reporting-failed. A stale reading presented without a warning yields a wrong customer answer ("hot water is fine — temperature shows 62°C") when the panel may have lost connectivity before the system lost heat.

The staleness guard lives server-side: the workspace payload includes a computed field `boilerPanelStaleMinutes` (null if fresh, integer if stale) so the client renders from a fact rather than performing its own time arithmetic.

---

**Value sanity check.**
Before surfacing boiler panel telemetry values, the server validates:

- `hwTempC` must be a finite number in the range [0, 95]. Values outside this range are emitted as `hwTempC: null` with a companion flag `hwTempCOutOfRange: true`. The client renders "reading out of range — contact IoT team" rather than the raw value.
- `boilerOnOff` (when present) must resolve to a recognisable boolean equivalent (true/false, 1/0, "on"/"off"). If the raw value is not one of these, it is emitted as `boilerOnOff: null` with `boilerOnOffUnrecognised: true`. The client renders "panel command state unrecognised — contact IoT team."

The purpose of these checks is defence against a mis-keyed telemetry field (e.g. the wrong key name producing a numeric code rather than a temperature) causing a handler to act on a meaningless value. The staleness guard and the sanity check are independent: a value can be fresh but out-of-range, or stale but within range. Both conditions are shown to the handler.

---

**Q1 partial — hwTempC only, no boilerOnOff — misdiagnosis guard.**
If James opts to ship hot-water temperature without panel on/off state (Q1 partial), the temperature display must carry a permanent inline caveat. Without this caveat, a handler seeing "Hot water temperature: 62°C" may close a call as healthy when the panel is not actually calling for heat — temperature can persist above threshold for some time after the panel has stopped commanding the boiler, and in the partial mode there is no signal to contradict a false-positive conclusion.

The caveat wording: **"Temperature shown. Panel on/off state is not yet monitored here — temperature alone does not confirm the panel is calling for heat. If the customer reports no hot water and this temperature looks normal, ask the IoT team to check the panel command directly."**

The partial mode renders as:
```
Hot water temperature: 62 °C
[CAVEAT TEXT ABOVE — persistent, not dismissible]
```

Full mode (both keys confirmed) renders as:
```
Hot water temperature: 62 °C
Panel commanding boiler: YES / NO
```

Full mode does not carry the caveat because `boilerOnOff` provides the missing signal.

---

**Routes (routes/api.js).**
No change needed to the workspace payload builder for device inclusion. The `devices` array already includes all classified devices including the newly-typed boiler-panel device. Add the computed `boilerPanelStaleMinutes` field to the boilerControl section of the site workspace. The scope groups for heating already handle the boilerControl.heatingControllable path.

**Flows (flows.js).**
The heating flow already has a boiler-panel branch at lines 619 and 633 that fires when `z.deviceType === 'boiler-panel'`. Currently this branch is unreachable in production (the type is never emitted). Once item 5's classifier change lands, the branch becomes live. Update the branch text from "This zone can't be adjusted remotely yet" to "The IoT team controls this panel directly from ThingsBoard." Add the `hwTempC` read row (with staleness and sanity states) and, in full mode only, the `boilerOnOff` read row.

For the hotwater flow, the existing text already says "Hot water here runs on the boiler panel, which this dashboard monitors but can't control." Once telemetry keys are confirmed and mapped, add `hwTempC` and (in full mode) `boilerOnOff` to the hotwater flow's stage 0 display. Apply the same staleness and sanity rendering as in the heating flow.

**Control.** No control commands are added for boiler-panel devices. The existing empty commands list in the REGISTRY backstops any attempted command — `validateCommand` returns a refusal for any device whose type has an empty commands list. This is defence in depth behind the `controllable: false` classifier flag.

---

## Files Changed Summary

| Item | File | Nature of change |
|---|---|---|
| 1 | public/js/flows.js | Replace find with filter-and-loop for lighting and fan flows |
| 2 | services/registry.js | Line 222: hwBoostHoursDesired to hwBoostHoursRequested in validateCommand return |
| 3 | services/registry.js | Lines 111-112: salus-it500 CONTROL_CONTRACT controllable: false to true, dark: true to false. salus-it500-dhw entry unchanged. |
| 4 | routes/api.js | SCOPE_GROUPS heating level: add controllable-device check before mon fallback |
| 5 | services/tb-device.js | Profile-based early-return in classifyDevice for boilerControl; mapTelemetry boiler keys; staleness and sanity computation |
| 5 | routes/api.js | Add boilerPanelStaleMinutes to site workspace payload |
| 5 | public/js/flows.js | Update boiler-panel heating text; add hwTempC / boilerOnOff display with staleness, sanity, and partial-mode caveat |

---

## What Does Not Change

- Intesis AC control (referring to IoT team, James Q1 decision).
- Hot-water boost in the UI — the salus-it500-dhw CONTROL_CONTRACT `controllable: false` flag is unchanged by this design. The boost affordance is not offered in the dashboard. This gate is deliberately held pending Spencer's bench-test sign-off. A future, separately-scoped design change enables boost; that design must begin by confirming WRITES_DISABLED state (Q3) and receiving Spencer's sign-off.
- The `salus-it500-dhw` CONTROL_CONTRACT entry (separate from salus-it500; unchanged; controllable: false).
- The `salus` bare-type CONTROL_CONTRACT (legacy fleet, IoT team dependency).
- The WRITES_DISABLED kill switch — unchanged and authoritative. Its current runtime value is not determined by this design. James and the IoT team must confirm and record the current state before any fleet reconnection event or write-path go-live (Q3 above).
- Intesis mode command (Spencer bench test pending).
- The Tuya switch command path.
- The iT700 setpoint command path.
- The P1 escalation flows.
- The connectivity flow.
- The gate freshness window or bridge configuration.

---

## Data Dictionary

This design introduces new canonical internal field names for boiler panel telemetry and the staleness computation. All other field names in scope (switchRequested, setpointRequested, hwBoostHoursRequested, switch_1, heatingSetpoint, setPoint) already exist in the data dictionary (DATA_DICTIONARY.md). Build uses the canonical names below; the raw ThingsBoard key names are confirmed by Spencer before item 5 build starts.

| Canonical field | Device types | Description | Retention | Sensitivity |
|---|---|---|---|---|
| boilerOnOff | boiler-panel | Whether the boiler control panel is currently commanding the boiler. Boolean. Sourced from the confirmed TB telemetry key for panel output state. Null if unconfirmed key (full-mode only; absent in Q1 partial). | Live workspace only. Not persisted. | Low. |
| hwTempC | boiler-panel | Hot-water temperature as measured by the boiler panel sensor, degrees Celsius. Number. Sourced from the confirmed TB telemetry key for hot-water temperature. Null if value fails sanity check (see hwTempCOutOfRange). | Live workspace only. Not persisted. | Low. |
| hwTempCOutOfRange | boiler-panel | True when the raw hwTempC value was present but outside [0, 95]. Companion to hwTempC: null. Drives "reading out of range" display. | Live workspace only. Not persisted. | Low. |
| boilerOnOffUnrecognised | boiler-panel | True when the raw on/off telemetry value was present but not a recognisable boolean equivalent. Companion to boilerOnOff: null. Drives "panel command state unrecognised" display. | Live workspace only. Not persisted. | Low. |
| boilerPanelStaleMinutes | boiler-panel | Integer minutes since the boilerControl device last pushed telemetry to ThingsBoard (derived from lastActivityTime). Null when the reading is fresh (< 5 minutes). Emitted on the boilerControl section of the site workspace. Drives the staleness warning and muted-value display. | Live workspace only. Not persisted. | Low. |

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

**T1-3: validateCommand returns hwBoostHoursRequested for hwboost.**
Precondition: None. This is a pure unit test of the registry function; no device controllability change is involved or needed.
Steps: Call validateCommand directly with device type 'salus-it500-dhw', command 'hwboost', value 2.
Expected: Returns `{ ok: true, attribute: 'hwBoostHoursRequested', value: 2 }`. The attribute name is NOT 'hwBoostHoursDesired'.
Note: This test confirms the attribute name fix in isolation. The boost affordance is not offered in the UI (salus-it500-dhw controllable: false, unchanged). This test does not constitute an end-to-end dispatch test.

**T1-4: iT500 offers setpoint control when reporting.**
Precondition: fixture device classified as salus-it500 with heatingSetpoint 18 and online.
Steps: Confirm site. Open Heating flow. Select accommodation area.
Expected: Setpoint control is offered (the setpoint window appears). The CONTROL_CONTRACT for the device has controllable: true.

**T1-4b: iT500 DHW device does NOT offer boost affordance.**
Precondition: fixture device classified as salus-it500-dhw, online, in a site confirmed by the handler.
Steps: Confirm site. Open Heating or Hot water flow.
Expected: No boost or control button appears for the DHW device. The salus-it500-dhw CONTROL_CONTRACT controllable: false gates the affordance off.
Note: This test verifies that item 3 did not inadvertently open the boost path.

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

**T2-3: Heating flow shows boiler-panel read-only branch with live data.**
Precondition: fixture site with a classified boiler-panel device, lastActivityTime 2 minutes ago (fresh), hwTempC 55, boilerOnOff true.
Steps: Confirm site. Open Heating flow. Select the area.
Expected: The read row shows 55 °C. The boilerOnOff row shows "YES". The reco card says "The IoT team controls this panel directly from ThingsBoard." No Switch or setpoint button appears. No staleness warning shown.

**T2-4: No control command accepted for boiler-panel device.**
Precondition: As T2-3.
Steps: POST /control/dispatch with deviceId matching the boiler-panel device and command switch true.
Expected: 400 response. validateCommand returns refusal because boiler-panel commands list is empty.

**T2-5: Staleness warning shown for boiler panel with old telemetry.**
Precondition: fixture site with a classified boiler-panel device, lastActivityTime 8 minutes ago, hwTempC 55.
Steps: Confirm site. Open Heating flow.
Expected: boilerPanelStaleMinutes is 8. The panel section shows "Last reading received 8 minutes ago — may not reflect current state." hwTempC 55 is visible but muted. No staleness warning on other device rows.

**T2-6: Out-of-range hwTempC renders as "reading out of range."**
Precondition: fixture telemetry bag with hwTempC raw value 150 (outside [0, 95]).
Steps: Call mapTelemetry with the out-of-range value. Read workspace.
Expected: hwTempC is null. hwTempCOutOfRange is true. The heating flow renders "reading out of range — contact IoT team" not 150.

**T2-7: Unrecognised boilerOnOff value renders as "unrecognised."**
Precondition: fixture telemetry bag with raw on/off value "ACTIVE" (not a recognisable boolean equivalent).
Steps: Call mapTelemetry with the unrecognised value. Read workspace.
Expected: boilerOnOff is null. boilerOnOffUnrecognised is true. The flow renders "panel command state unrecognised — contact IoT team."

**T2-8 (partial mode): hwTempC-only display carries permanent caveat.**
Precondition: fixture site in partial mode (boilerOnOff not mapped, hwTempC present and valid), lastActivityTime fresh.
Steps: Confirm site. Open Hot water flow.
Expected: hwTempC displays. The partial-mode caveat is visible and not dismissible: "Temperature shown. Panel on/off state is not yet monitored here — temperature alone does not confirm the panel is calling for heat. If the customer reports no hot water and this temperature looks normal, ask the IoT team to check the panel command directly." No boilerOnOff row appears.

**T2-9 (full mode): boilerOnOff false with normal temperature surfaces the contradiction.**
Precondition: fixture site in full mode, hwTempC 61, boilerOnOff false, fresh telemetry.
Steps: Confirm site. Open Hot water flow.
Expected: Temperature shows 61 °C. Panel commanding boiler shows "NO." No caveat (full mode has the signal). Handler can see the contradiction and escalate.

---

## Cost and Token Efficiency Evaluation

Track 1 has zero LLM token cost and zero per-operation cost. All four items are pure code changes in a Node.js server and a browser JS file. There is no polling, no background worker, and no new API call added.

Track 2 adds two computed fields (boilerPanelStaleMinutes, sanity flags) to the existing per-site workspace fetch. The `lastActivityTime` field is already retrieved as part of the ThingsBoard device list request. The staleness computation is a subtraction of two integers. The sanity checks are two range/type checks on the mapped telemetry values. The marginal cost is negligible: no extra HTTP round-trips, no LLM calls, and the additional JSON is a handful of scalar fields on an existing response.

No new background or polling work is introduced by either track. The dashboard's existing 30-second workspace refresh already covers boiler panel telemetry on the same schedule as all other device telemetry.

## Silent Running Evaluation

Neither track introduces any background component, daemon, polling job, scheduled task, or watcher. The boiler panel telemetry (including the staleness computation) is evaluated on demand as part of the existing per-site workspace fetch path. Idle cost is zero. Token cost is zero except when a handler actively loads a site workspace. The staleness guard does not add a timer or interval — it reads a timestamp that ThingsBoard already supplies and computes elapsed time at fetch time only.

---

## How the CX Criteria Are Realised

| CX criterion from discovery | Realised by | Where in the product |
|---|---|---|
| Handler can see all lighting circuits, not just the first | Item 1: flows.js filter-and-loop renders every lighting device as its own row with its own switch state and button | Lighting flow, all circuit rows |
| Handler can see all fans | Item 1: same pattern for fan devices | Fan flow, all fan rows |
| Hot-water boost command actually reaches the IoT Command Gate (when eventually enabled) | Item 2: hwBoostHoursRequested fix routes the command to SERVER_SCOPE as the gate expects. Boost remains UI-gated in this release. | Control dispatch path, backend only. Active when a future design enables salus-it500-dhw. |
| iT500 setpoint control offered when heating fleet is restored | Item 3: salus-it500 controllable: true allows the flow to offer the setpoint window. DHW device unaffected. | Heating flow, accommodation area |
| Scope label "Controllable" is honest for iT700 sites | Item 4: scope heating level reads the device's actual controllable flag | "Other" flow scope check; workspace scope payload |
| Handler can read boiler panel state to diagnose no-heat calls | Item 5: boilerControl devices classified as boiler-panel and their telemetry surfaced in the heating and hotwater flows | Heating flow boiler-panel branch; hotwater flow stage 0 |
| Handler is not misled by a stale boiler panel reading | Item 5 staleness guard: lastActivityTime check with visible muted warning when reading is > 5 minutes old | Heating and hotwater flows, boiler panel section |
| Handler is not misled by a mis-keyed or out-of-range value | Item 5 sanity checks: hwTempC range [0, 95], boilerOnOff recognisable boolean; out-of-range/unrecognised renders as an explicit error not a value | Heating and hotwater flows, boiler panel section |
| Handler is not misled by temperature-only reading into closing a no-hot-water call prematurely | Item 5 partial-mode caveat: permanent inline text on the temperature row when boilerOnOff is not available | Hotwater flow, partial-mode hwTempC display |
| Handler knows not to try controlling the boiler panel from the dashboard | Item 5: reco card updated to name the IoT team as the controller; empty commands list and controllable: false backstop any attempted command | Heating flow boiler-panel reco card; control dispatch endpoint |

---

## Open Questions

**Q1 (to James and Spencer): Boiler panel telemetry key names.** The design assumes Spencer can confirm the exact ThingsBoard key names for panel on/off state and hot-water temperature before item 5 build starts. If both keys cannot be confirmed, James decides whether to hold the feature or ship hot-water temperature only (partial). Note: the partial requires the permanent panel-state-unknown caveat described in Track 2 — the partial cannot ship without it.

**Q2 (to James): Hot water scope label for pure-heating sites.** A site with an iT700 and no DHW device shows hot water as 'none' today. If "none" is the right label, no change is needed. If James wants a distinct label for "hot water exists at the site but is not on Lighthouse" versus "no DHW device at all on this Lighthouse estate", the scope level logic needs a fourth state (which has UI implications). James to confirm before build.

**Q3 (to James / IoT): WRITES_DISABLED current state.** Before any fleet reconnection event or before the future "enable boost" design is scoped, James or the IoT team must confirm the current runtime value of WRITES_DISABLED and record the date checked. This design does not read or change it. Record: _[value and date to be filled by James/IoT]_.