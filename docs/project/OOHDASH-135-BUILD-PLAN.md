<!--
gate:contract
TICKET: OOHDASH-135
PHASE: build
DECISIONS:
DECISION: Q1 (boiler panel keys) | wait for all Spencer confirmations | ship temperature only (partial) | SELECTED: temperature key confirmed absent via Rosetta Stone sweep; DHW.override (V2) and output1OutputMask (V1) are the confirmed keys; Track 2 scope updated to DHW override state display, not temperature; partial-mode temperature option dropped entirely; Spencer confirmation still required for semantic meaning of DHW.override and push cadence only
DECISION: Q2 (hot water scope label) | retain not available for pure-heating sites | add distinct Not on Lighthouse here label | SELECTED: add distinct Not on Lighthouse here label; added as Item 6 in this plan; routes/api.js gains a fourth scope level; flows.js gains a render branch for it
DECISION: Q3 (WRITES_DISABLED ownership) | document as pre-activation checklist | block Track 1 until confirmed | SELECTED: document as pre-activation checklist; WRITES_DISABLED confirmed false as of 2026-09-24; must re-confirm at time of flag flip; not a code change and not a blocker for Track 1 shipping
DECISION: Track 1 vs Track 2 split | ship together | ship separately | SELECTED: ship separately; Track 1 patch ships items 1-2-3-4-6 as one release; Track 2 minor increment ships item 5 separately once Spencer unblocks
DECISION: SALUS_IT500_CTL_ENABLED default | true (active on ship) | false (operator activation required) | SELECTED: false; iT500 setpoint control requires a deliberate two-step operator action after confirming WRITES_DISABLED; fleet reconnection does not trigger activation
DECISION: salus-it500-dhw controllable flag | change to true | leave unchanged at false | SELECTED: leave unchanged; boost write path stays fully gated; a future separately-scoped design enables it
DECISION: staleness threshold | hardcode in application logic | named config constant with provisional value | SELECTED: named config constant; provisional value 5 minutes; must be replaced with Spencer confirmed push cadence before Track 2 ships
SECTION: Build Plan Overview
This plan covers two tracks from the OOHDASH-135 design against Spencer Thompson's SD-446 ThingsBoard command specification. Track 1 is a patch of five items (1, 2, 3, 4, and 6 -- note Item 6 is new, added from the Q2 decision) that ship together in a single patch release. All five items are independent and can be built in any order. Track 2 is Item 5 only: a boiler panel read path that ships as a separate minor increment once Spencer confirms the semantic meaning of DHW.override and the boilerControl push cadence. No new control commands are added in either track. Estimated Track 1 build time: 2 to 2.5 days. Estimated Track 2 build time: 1.5 to 2 days once unblocked (excluding Spencer wait time).
SECTION: Track 1 Items (1-2-3-4-6)
Item 1 (lighting and fan circuits): flows.js only -- replace find with filter-and-loop for both lighting and fan device kinds, each circuit as its own row. Item 2 (hwBoostHoursRequested): services/registry.js line 222 one-identifier fix; pre-ship verification against IoT Command Gate source is mandatory before landing. Item 3 (iT500 CONTROL_CONTRACT and flag): services/registry.js salus-it500 entry changed to controllable: true; new SALUS_IT500_CTL_ENABLED=false config constant; Level A flag gate in routes/api.js controls UI affordance; Level B check in services/control.js enforces server-side; iT500 setpoint control goes live only when operator deliberately flips the flag after confirming WRITES_DISABLED. Item 4 (heating scope level): routes/api.js SCOPE_GROUPS heating -- remove boilerControl.heatingControllable branch, add controllable-AND-online device check as step 1, retain device-presence fallback as step 2. Item 6 (not-lighthouse hot water label): routes/api.js hot water SCOPE_GROUPS gains a fourth level 'not-lighthouse' for pure-heating sites; flows.js gains a render branch showing "Not on Lighthouse here."
SECTION: Track 2 Scope Update (Item 5)
Item 5 is no longer blocked on key names -- the Oct 2026 Rosetta Stone sweep confirmed DHW.override (V2 boilerControl panels) and output1OutputMask (V1 panels). Track 2 scope is updated: show DHW zone override active/inactive state, not temperature. No hot water temperature key exists on boilerControl devices. The design's hwTempC, hwTempCOutOfRange, boilerOnOff, boilerOnOffUnrecognised fields are dropped. New canonical fields: boilerDhwOverrideUntil, boilerDhwOverrideActive (V2); boilerOutputMask, boilerOutputMaskDhwBit (V1); boilerPanelStaleMinutes (both). Remaining blockers: Spencer must confirm the semantic meaning of DHW.override (does override active mean the panel is calling for heat?) and the healthy push cadence for boilerControl devices (sets BOILER_PANEL_STALE_THRESHOLD_MINUTES). W5-A and W5-B can start now; W5-C, W5-D, W5-E require Spencer confirmation.
SECTION: Pre-Activation Checklist (Q3)
Before setting SALUS_IT500_CTL_ENABLED=true and redeploying: (1) run kubectl to confirm current runtime value of WRITES_DISABLED on the AKS pod; (2) record the confirmed value, date, and confirming person in OOHDASH-135 Jira ticket; (3) only then set flag and redeploy. WRITES_DISABLED was confirmed false as of 2026-09-24 -- that cached confirmation is not sufficient; re-confirm at time of activation. This is a gate condition on the flag flip, not a blocker for Track 1 shipping.
-->

# OOHDASH-135 Build Plan: SD-446 Command Spec Changes to OOH Dashboard

**Version:** 1.0
**Date:** 2026-10-19
**Author:** Build doer (Claude Sonnet 4.6)
**Ticket:** OOHDASH-135
**Design gate:** merged (8464cfd)
**Codebase base:** v1.4.2

---

## Summary

This build plan covers two tracks derived from the OOHDASH-135 design for Spencer Thompson's SD-446 ThingsBoard command specification.

**Track 1** ships five items (1, 2, 3, 4, and 6) in one patch release. Item 6 is new relative to the design's original items 1-4; it implements the Q2 decision to add a distinct "Not on Lighthouse here" label for pure-heating sites in the hot water scope row. Estimated total Track 1 build time: 2 to 2.5 days.

**Track 2** is Item 5 only: a boiler panel read path that ships as a separate minor increment. The scope is updated from the design -- there is no hot water temperature key on boilerControl devices. Track 2 shows DHW override active/inactive state instead. Track 2 is still partially blocked; it ships once Spencer confirms the semantic meaning of DHW.override and the healthy push cadence for boilerControl devices.

No new control commands are added in either track. The WRITES_DISABLED kill switch, the bridge configuration, the salus-it500-dhw CONTROL_CONTRACT, and the Tuya switch command path are all unchanged.

---

## Design Gate Decisions Binding Into Build

| Decision | Outcome |
|---|---|
| Q1 (boiler panel keys) | Temperature key confirmed absent via Rosetta Stone. Track 2 scope: show DHW override state (DHW.override for V2; output1OutputMask bit[3] for V1). Partial-mode temperature option dropped. Spencer confirmation still required for semantic meaning and push cadence only. |
| Q2 (hot water scope label) | Add distinct "Not on Lighthouse here" label for pure-heating sites. Added as Item 6. |
| Q3 (WRITES_DISABLED ownership) | Document as pre-activation checklist. WRITES_DISABLED confirmed false 2026-09-24. Must re-confirm before flag flip. Not a code change and not a Track 1 blocker. |
| Track 1 vs Track 2 split | Confirmed: Track 1 patch (items 1-2-3-4-6) ships first; Track 2 minor increment (item 5) ships separately when unblocked. |
| salus-it500-dhw flag | Unchanged: controllable: false. Boost write path stays fully gated. Not in scope here. |
| SALUS_IT500_CTL_ENABLED default | False. iT500 setpoint control does not go live on reconnection or on Track 1 ship. Activation requires a deliberate two-step operator action. |
| Staleness threshold | Named config constant. Provisional value: 5 minutes. Must be replaced with Spencer's confirmed cadence before Track 2 ships. |

---

## Track 1: Patch Items 1, 2, 3, 4, and 6

All five items are independent. They can be built in any order and in parallel. They ship together in one patch release. The recommended build sequence is items 2, 1, 4, 6, 3 (smallest to largest, each committed separately before moving on).

---

### Item 1: Show All Lighting and Fan Circuits Individually

**Problem.** In `public/js/flows.js`, the lighting flow and the fan flow each use `devices.find(d => d.kind === 'lighting')` and `devices.find(d => d.kind === 'fan')`. These return only the first matching device. A site with three lighting circuits shows only circuit 1. The workspace payload from routes/api.js sends all devices with no truncation; the truncation is entirely in the client.

**Files changed.**

| File | Change |
|---|---|
| public/js/flows.js | Replace `devices.find(d => d.kind === 'lighting')` with a filter-and-loop. Replace `devices.find(d => d.kind === 'fan')` with a filter-and-loop. No server change needed. |

**Approach.** Each lighting row shows the device zone name (`d.zone`), online or offline status, current on/off state (`d.telemetry.switch_1`), and a Switch button when `canSwitch(d)` is true. Rows are ordered alphabetically by `d.deviceId`. The flow header summarises the count (e.g. "3 lighting circuits on Lighthouse here") before listing individual rows. The same pattern applies to fans.

**Unhappy paths.** When no lighting devices are present the existing "External lighting at this site isn't on Lighthouse" path remains unchanged. When a site has multiple circuits and one is offline, each circuit shows its own online/offline status independently. The Switch button check (`canSwitch(d)`) is evaluated per device, not per flow, so an offline circuit in a multi-circuit site does not suppress the button for the online circuits.

**Verification steps.** Open a site with three or more lighting circuits. All circuit rows must appear, each with zone name, on/off state, and Switch button. No circuit is missing. Open a site with two fans. Both fan rows appear with independent on/off state and Switch buttons.

---

### Item 2: Fix hwBoostHoursRequested Attribute Name

**Problem.** In `services/registry.js`, the `case 'hwboost':` branch of `validateCommand` returns `attribute: 'hwBoostHoursDesired'`. The IoT Command Gate reads `hwBoostHoursRequested` from SERVER_SCOPE (a Requested write), not `hwBoostHoursDesired` (which is a Desired write). A Desired write bypasses the gate entirely; the bridge is never notified. This is a silent misroute that would affect any future activation of the boost path.

**Files changed.**

| File | Change |
|---|---|
| services/registry.js | Line 222: change `'hwBoostHoursDesired'` to `'hwBoostHoursRequested'` in the hwboost case return statement. One identifier change in one line. |

**Pre-ship check (mandatory before landing).** Read the IoT Command Gate source and confirm `hwBoostHoursRequested` is the exact attribute name it reads from SERVER_SCOPE in production. Do not rely on the SD-446 spec description alone. If the gate uses a different attribute name or scope convention, update both this fix and the T1-3 test to match the gate source.

**Why this is latent today.** The boost write path is blocked by two independent conditions: the iT500 DHW fleet is offline, and `salus-it500-dhw` has `controllable: false`. Neither condition is changed by this fix. This fix prevents a future silent misroute when boost is eventually activated by a separately-scoped change.

**Verification steps.** Call `validateCommand` directly with device type `'salus-it500-dhw'`, command `'hwboost'`, value `2`. Return must be `{ ok: true, attribute: 'hwBoostHoursRequested', value: 2 }`. The attribute name must not be `'hwBoostHoursDesired'`.

---

### Item 3: Fix iT500 CONTROL_CONTRACT and SALUS_IT500_CTL_ENABLED Flag

**Problem.** The `'salus-it500'` CONTROL_CONTRACT entry in `services/registry.js` has `controllable: false, dark: true`. When the iT500 heating fleet is restored to reporting, the dashboard will not offer setpoint control. The prior design coupled activation to fleet reconnection, which is unsafe -- reconnect timing is unpredictable and the only protection was a procedural reminder. This item decouples activation via a default-off configuration flag.

**Part A: CONTROL_CONTRACT change.**

Change `controllable: false, dark: true` to `controllable: true` (remove or set `dark: false`) in the `'salus-it500'` CONTROL_CONTRACT entry only. This records the intended final state for the device type. The `'salus-it500-dhw'` entry is a separate CONTROL_CONTRACT entry and is NOT changed.

Location: `services/registry.js` lines 111-112.

**Part B: SALUS_IT500_CTL_ENABLED flag.**

Add a named server configuration constant `SALUS_IT500_CTL_ENABLED`, defaulting to `false`. First check where other named constants live in the repo (likely `config/config.js` or equivalent). Add the constant there, not buried in application logic.

The effective controllable value for `'salus-it500'` devices is `CONTROL_CONTRACT.controllable AND SALUS_IT500_CTL_ENABLED`. For all other device types, effective controllable is `CONTROL_CONTRACT.controllable` unchanged.

When `SALUS_IT500_CTL_ENABLED=false` (the default after Track 1 ships): all salus-it500 devices in the workspace have `d.controllable = false`. The flow does not offer the setpoint affordance. Fleet reconnection has no effect.

When `SALUS_IT500_CTL_ENABLED=true` (after activation): salus-it500 devices that are also online have `d.controllable = true`. The flow offers the setpoint affordance.

**Two enforcement levels -- defence in depth.**

Level A (UI affordance) -- `routes/api.js`: when building the per-device `d.controllable` field for salus-it500 devices, apply `CONTROL_CONTRACT.controllable AND SALUS_IT500_CTL_ENABLED`. If the flag is false, `d.controllable` is false in the browser payload even though the CONTROL_CONTRACT says true. The setpoint button does not appear.

Level B (dispatch enforcement) -- `services/control.js`: in `validateCommand`, add a check for salus-it500 device type. If `SALUS_IT500_CTL_ENABLED` is false, return error "iT500 control not yet enabled" immediately before any ThingsBoard write. This server-side gate prevents direct-API bypass of the browser. WRITES_DISABLED remains the master kill-switch and operates independently of this flag.

**Files changed.**

| File | Change |
|---|---|
| services/registry.js | Lines 111-112: change `controllable: false, dark: true` to `controllable: true` for salus-it500 entry only. salus-it500-dhw entry is untouched. |
| config (new constant) | Add `SALUS_IT500_CTL_ENABLED = false`. Named constant in the project configuration module (same location as other named constants). |
| routes/api.js | Level A: when computing effective `d.controllable` for salus-it500 devices in the workspace payload, apply `CONTROL_CONTRACT.controllable AND SALUS_IT500_CTL_ENABLED`. Single named source for the payload. |
| services/control.js | Level B: in `validateCommand`, add check: if device type is `'salus-it500'` and `SALUS_IT500_CTL_ENABLED` is false, return "iT500 control not yet enabled" before any ThingsBoard write. |

**Activation sequence (operator action, not automatic).** After Track 1 ships, at a time of James's and the IoT team's choosing:

1. Confirm current runtime value of WRITES_DISABLED and record the result (see Pre-Activation Checklist below).
2. Set `SALUS_IT500_CTL_ENABLED=true` in the server configuration and redeploy.

The redeployment is the controlled moment of go-live. Track 1 itself ships with no dependency on WRITES_DISABLED confirmation, fleet reconnection, or any IoT team action.

**Verification steps (see also Test Plan section).**

- T1-4a: iT500 device, online, flag false. Setpoint control is NOT offered in Heating flow.
- T1-4b: iT500 device, online, flag true. Setpoint control IS offered in Heating flow.
- T1-4c: iT500 device, offline, flag true. Setpoint control is NOT offered (device not online).
- T1-4d: iT500-dhw device, online, any flag value. No boost button appears (DHW entry unchanged).
- T1-4e: POST setpoint to `/control/dispatch` for salus-it500, flag false. HTTP 4xx, body "iT500 control not yet enabled". No ThingsBoard write attempted.

---

### Item 4: Fix Heating Scope Level for Thermostat-Controlled Sites

**Problem.** In `routes/api.js`, the `SCOPE_GROUPS` `key: 'heating'` evaluates to `'ctl'` only when `s.boilerControl?.heatingControllable` is true. This means only boilerControl (pub C&B) sites ever show `'ctl'`. Salus iT700 and iT500 sites fall through to `'mon'` even when the dashboard genuinely offers iT700 setpoint control. The `boilerControl.heatingControllable` branch is also incorrect for boiler-panel sites: OOH has no heating control path for panels, so the branch risks a false `'ctl'` label at pub C&B sites.

**Designed evaluation order (three steps).**

Step 1: `s.devices.some(d => d.kind === 'heating' && d.controllable === true && d.online === true)` -- result is `'ctl'`. Covers iT700 (online) and iT500 (after activation and fleet restoration). Boiler-panel devices always have `controllable: false` by classification and will never fire this step.

Step 2: `s.devices.some(d => d.kind === 'heating')` (present but not currently live-controllable -- offline thermostat, flag-false iT500, bare-salus, or boiler-panel) -- result is `'mon'`.

Step 3: no heating device -- result is `'none'`.

The `boilerControl.heatingControllable` branch is removed. It was the only route to an incorrect `'ctl'` label for boiler-panel sites.

**Scenario verification against the evaluation order.**

- iT700 site, device online: step 1 fires -- `'ctl'`. Correct.
- iT500 site, fleet offline, `SALUS_IT500_CTL_ENABLED=false` (Track 1 shipped, not yet activated): `d.controllable=false` (flag gate), step 1 does not fire -- step 2 fires -- `'mon'`. Correct: iT500 is on Lighthouse but not currently controllable.
- iT500 site, fleet offline, `SALUS_IT500_CTL_ENABLED=true` (activated but fleet still down): `d.controllable=true`, `d.online=false` -- step 1 does not fire -- step 2 fires -- `'mon'`. Correct: configured for control but not reachable.
- iT500 site, fleet online, `SALUS_IT500_CTL_ENABLED=true` (fully activated): step 1 fires -- `'ctl'`. Correct.
- Bare-salus, offline: `d.controllable=false` (CONTROL_CONTRACT unchanged) -- step 2 fires -- `'mon'`. Correct.
- Boiler-panel device: `d.controllable=false` (hard-coded at classification) -- step 1 does not fire -- step 2 fires -- `'mon'`. Correct. OOH has no heating control path for boiler panels.
- No heating device: step 3 -- `'none'`. Correct.

**Files changed.**

| File | Change |
|---|---|
| routes/api.js | SCOPE_GROUPS heating level function: remove the `boilerControl.heatingControllable` branch. Add leading check for `s.devices.some(d => d.kind === 'heating' && d.controllable && d.online)` as step 1. Retain the existing device-presence check as step 2. Evaluation is three steps. |

**Verification steps.** T1-5: iT700 site, online device, no boilerControl device -- `workspace.scope` heating level is `'ctl'`. T1-5b: iT700 site, offline device -- level is `'mon'`. T1-6: bare-salus site, offline -- level is `'mon'`.

---

### Item 6: Hot Water Scope -- "Not on Lighthouse Here" for Pure-Heating Sites

**Problem.** A site with an iT700 and no DHW device (no boilerControl device, no iT500-dhw device) evaluates to hot water scope `'none'` today. This is misleading: it conflates "hot water is not present at this site" with "hot water is present but not on the Lighthouse system." James confirmed (Q2 decision) that a distinct label is required.

**New fourth scope level: `'not-lighthouse'`.**

The current evaluation is `hasControllableDhw(s) ? 'ctl' : hasHotWaterSignal(s) ? 'mon' : 'none'`. A new step is inserted between `'mon'` and `'none'`.

Complete evaluation for hot water (four steps):

Step 1: `hasControllableDhw(s)` is true -- result is `'ctl'` (DHW controllable on Lighthouse).

Step 2: `hasHotWaterSignal(s)` is true -- result is `'mon'` (DHW monitored on Lighthouse).

Step 3: site has at least one classified heating device (`s.devices.some(d => d.kind === 'heating')`) but has no boilerControl profile device and no salus-it500-dhw device -- result is `'not-lighthouse'` (hot water exists at the site but is not on the Lighthouse system).

Step 4: no heating device and no DHW device -- result is `'none'` (no hot water signal at all).

The step 3 check must be specific: heating device present AND no boilerControl device AND no salus-it500-dhw device. The presence of a heating device signals that the site has a heating system (and therefore hot water); the absence of boilerControl and iT500-dhw confirms neither is on Lighthouse.

**UI label.** The `'not-lighthouse'` level renders as "Not on Lighthouse here" -- James's exact wording from the Q2 decision.

**Files changed.**

| File | Change |
|---|---|
| routes/api.js | SCOPE_GROUPS hot water: insert step 3 (`'not-lighthouse'` level) between `'mon'` and `'none'`. Existing steps 1 and 2 are unchanged. |
| public/js/flows.js | Hot water flow: add render branch for `'not-lighthouse'` scope level. Display text: "Not on Lighthouse here." The existing `'none'` render path remains for step 4. |

**Verification steps.** T1-6b: fixture site with iT700 device (kind = 'heating'), no boilerControl device, no iT500-dhw device -- `workspace.scope` hot water level is `'not-lighthouse'` and the hot water flow renders "Not on Lighthouse here." Confirm `'none'` still fires correctly for a site with no heating devices at all.

---

## Track 2: Boiler Panel Readings (Item 5)

**Status: partially blocked.** Key names are confirmed (Rosetta Stone sweep, Oct 2026). Remaining blockers:

1. Spencer must confirm the semantic meaning of `DHW.override`: does "override active" (timestamp in the future) mean "the boiler panel is calling for heat"?
2. Spencer must confirm the healthy push cadence for boilerControl devices: needed to set `BOILER_PANEL_STALE_THRESHOLD_MINUTES`.

Work units W5-A and W5-B can start now. W5-C, W5-D, and W5-E require Spencer's semantic confirmation before they ship.

**Scope update from design.** The design anticipated a hot water temperature key (`hwTempC`) and a panel on/off key (`boilerOnOff`). The Rosetta Stone sweep confirmed neither key exists on boilerControl devices. The confirmed keys are:

- V2 panels (74 of 222 in estate): `DHW.override` -- a timestamp representing when a manual DHW override expires. Override is active when `Date.now() < value`.
- V1 panels (148 of 222 in estate): `output1OutputMask` -- a bitmask. Bit 3 (value 8) set means the DHW zone is active.

The partial-mode temperature caveat from the design is dropped. The temperature sanity check is dropped. Design data-dictionary fields `hwTempC`, `hwTempCOutOfRange`, `boilerOnOff`, and `boilerOnOffUnrecognised` are all dropped from scope.

**Updated canonical fields for Track 2.**

| Canonical field | Type | Description |
|---|---|---|
| boilerDhwOverrideUntil | number (epoch ms) | V2 panels only. Raw `DHW.override` value. Active when `Date.now() < boilerDhwOverrideUntil`. Null if absent or not a number. |
| boilerDhwOverrideActive | boolean | V2 panels only. Server-computed: `boilerDhwOverrideUntil != null AND Date.now() < boilerDhwOverrideUntil`. Emitted on workspace payload. |
| boilerOutputMask | number | V1 panels only. Raw `output1OutputMask` bitmask. Null if absent or not a number. |
| boilerOutputMaskDhwBit | boolean | V1 panels only. Server-computed: bit 3 of `boilerOutputMask` is set. Emitted on workspace payload. |
| boilerPanelStaleMinutes | number or null | Minutes since last telemetry push from the boilerControl device. Null when fresh (below threshold). Drives staleness warning in UI. |
| BOILER_PANEL_STALE_THRESHOLD_MINUTES | config constant | Named constant. Provisional value: 5 minutes. Must be replaced with Spencer's confirmed cadence before Track 2 ships. |

---

### Work Unit W5-A: Classifier Change (tb-device.js -- classifyDevice)

Add a profile-based early-return at the top of `classifyDevice`, before the refrigeration deny and before the capability signal checks. When the raw profile parameter equals `'boilerControl'` (case-insensitive match), return `{ kind: 'heating', deviceType: 'boiler-panel', deviceTypeLabel: 'Pub boiler panel', controllable: false, control: null }`. Profile-based classification is authoritative here because boilerControl devices are specifically provisioned. The early return prevents any subsequent name-token or telemetry path from reclassifying the device.

Note: the registry.js already has `'boiler-panel': { label: 'Pub boiler panel', commands: [] }` at line 77. No registry change is needed.

**Can start now.** No Spencer semantic confirmation required for classification.

---

### Work Unit W5-B: Telemetry Mapping (tb-device.js -- mapTelemetry)

Map `DHW.override` to `boilerDhwOverrideUntil` (number, epoch ms). Map `output1OutputMask` to `boilerOutputMask` (number). Both nil-safe: null if key absent or value is not a finite number. These are raw extractions; the boolean interpretation (active/inactive) happens in W5-C.

**Can start now.** Key names confirmed by Rosetta Stone. Semantic interpretation awaits Spencer's confirmation before the computed booleans ship.

---

### Work Unit W5-C: Workspace Computation (routes/api.js)

Compute `boilerDhwOverrideActive` for V2 panels: `boilerDhwOverrideUntil != null AND Date.now() < boilerDhwOverrideUntil`. Compute `boilerOutputMaskDhwBit` for V1 panels: bit 3 of `boilerOutputMask` is set. Add `boilerPanelStaleMinutes` to the boilerControl section of the site workspace (null if fresh, integer if stale). The `lastActivityTime` field is already retrieved per device from the ThingsBoard device list; this work unit consumes it against `BOILER_PANEL_STALE_THRESHOLD_MINUTES`.

**Blocked on Spencer semantic confirmation before shipping.** W5-C can be stubbed (coded but feature-flagged or excluded from Track 2 PR) while awaiting Spencer's confirmation.

---

### Work Unit W5-D: Flow Update (public/js/flows.js)

Update the boiler-panel heating branch (lines 619 and 633) from "This zone can't be adjusted remotely yet" to "The IoT team controls this panel directly from ThingsBoard." Add display rows for `boilerDhwOverrideActive` (V2, rendered as "DHW zone override: Active / Inactive") and `boilerOutputMaskDhwBit` (V1, rendered as "Output 1 DHW: ON / OFF"). Apply staleness rendering: when `boilerPanelStaleMinutes` is non-null, show the staleness notice and render values muted (reduced opacity or muted colour from the design system). No Switch or setpoint button appears.

For the hotwater flow, add the same override state display to stage 0. The existing text "Hot water here runs on the boiler panel, which this dashboard monitors but can't control" is retained.

**Blocked on Spencer semantic confirmation before shipping.**

---

### Work Unit W5-E: Staleness Threshold Constant (config)

Add `BOILER_PANEL_STALE_THRESHOLD_MINUTES = 5` as a named constant in the project configuration module (same location as `SALUS_IT500_CTL_ENABLED`). Comment inline: "Provisional value -- replace with Spencer's confirmed healthy push cadence before Track 2 ships." The constant is referenced by W5-C. The value 5 is a placeholder.

**Partially blocked.** The constant can be added with the provisional value now. The value must be updated to Spencer's confirmed cadence before Track 2 ships.

---

### Track 2 Blocker Summary

| Blocker | Work units affected | Action required |
|---|---|---|
| Spencer confirms semantic meaning of DHW.override (V2) | W5-C (V2 boolean), W5-D (V2 display), T2-3, T2-5, T2-7, T2-9 | Ask Spencer: does override active mean the panel is calling for heat? |
| Spencer confirms semantic meaning of output1OutputMask bit 3 (V1) | W5-C (V1 boolean), W5-D (V1 display), T2-6 | Ask Spencer: does bit 3 set mean the DHW zone is active? |
| Spencer confirms healthy push cadence for boilerControl devices | W5-E (constant value), T2-5 (staleness fixture) | Ask Spencer: what is the expected push interval for a healthy boilerControl device? |

W5-A and W5-B are unblocked. W5-C, W5-D, and W5-E are blocked until Spencer's confirmations are recorded.

---

## Files Changed Summary

| Item | Track | File | Nature of change |
|---|---|---|---|
| 1 | T1 | public/js/flows.js | Replace find with filter-and-loop for lighting and fan flows |
| 2 | T1 | services/registry.js | Line 222: hwBoostHoursDesired to hwBoostHoursRequested; verify against IoT Command Gate source before landing |
| 3 | T1 | services/registry.js | Lines 111-112: salus-it500 CONTROL_CONTRACT controllable: false to true. salus-it500-dhw entry unchanged. |
| 3 | T1 | config (new constant) | SALUS_IT500_CTL_ENABLED = false. Named configuration constant. |
| 3 | T1 | routes/api.js | Level A: effective d.controllable for salus-it500 = CONTROL_CONTRACT.controllable AND SALUS_IT500_CTL_ENABLED. |
| 3 | T1 | services/control.js | Level B: validateCommand returns "iT500 control not yet enabled" for salus-it500 if flag is false. |
| 4 | T1 | routes/api.js | SCOPE_GROUPS heating: remove boilerControl.heatingControllable branch; add controllable-AND-online check as step 1; retain device-presence fallback as step 2. |
| 6 | T1 | routes/api.js | SCOPE_GROUPS hot water: add 'not-lighthouse' level (step 3) for pure-heating sites with no boilerControl or iT500-dhw device. |
| 6 | T1 | public/js/flows.js | Add render branch for 'not-lighthouse' scope level: display "Not on Lighthouse here." |
| 5 W5-A | T2 | services/tb-device.js | Profile-based early-return in classifyDevice for boilerControl profile. |
| 5 W5-B | T2 | services/tb-device.js | mapTelemetry: map DHW.override to boilerDhwOverrideUntil; map output1OutputMask to boilerOutputMask. Nil-safe. |
| 5 W5-C | T2 | routes/api.js | Compute boilerDhwOverrideActive and boilerOutputMaskDhwBit; add boilerPanelStaleMinutes to workspace payload. |
| 5 W5-D | T2 | public/js/flows.js | Update boiler-panel heating and hotwater flow branches; add override state display with staleness rendering. |
| 5 W5-E | T2 | config (new constant) | BOILER_PANEL_STALE_THRESHOLD_MINUTES = 5 (provisional; replace with Spencer confirmed cadence before Track 2 ships). |

---

## Pre-Activation Checklist for SALUS_IT500_CTL_ENABLED (Q3 -- Process, Not Code)

This checklist applies before setting `SALUS_IT500_CTL_ENABLED=true` and redeploying. It is a gate condition on the flag flip, not a pre-ship requirement for Track 1.

**Step 1: Confirm current runtime value of WRITES_DISABLED.**

Run against the live AKS cluster:

    kubectl -n iot-services get deployment ooh-dashboard \
      -o jsonpath='{.spec.template.spec.containers[0].env}' \
      | jq '.[] | select(.name=="WRITES_DISABLED")'

Expected result: `{ "name": "WRITES_DISABLED", "value": "false" }`. If the value is `"true"`, stop. Do NOT flip `SALUS_IT500_CTL_ENABLED` until WRITES_DISABLED is confirmed false. Escalate to James and the IoT team.

WRITES_DISABLED was confirmed false as of 2026-09-24. That cached value is NOT sufficient. Re-confirm at the time of activation.

**Step 2: Record the confirmed value in OOHDASH-135.**

Record in the OOHDASH-135 Jira ticket: the confirmed value of WRITES_DISABLED, the date and time of confirmation, and the name of the person who confirmed it.

**Step 3: Set flag and redeploy.**

Only after Step 2 is recorded: set `SALUS_IT500_CTL_ENABLED=true` in the server configuration and redeploy. This is the controlled moment of go-live for iT500 setpoint control.

---

## Test Plan

### Track 1 Tests

**T1-1: Multiple lighting circuits shown individually.**
Fixture: site with 3 tuya-lighting devices (e.g. gk-6237-light-carpark, gk-6237-light-frontage, gk-6237-light-rear), all online. Confirm site. Open Lighting flow. All three circuit rows appear, each with zone name, on/off state, and Switch button. No circuit is missing. Test data: extend bridge-devices.json fixture for site 6237 to include three distinct lighting devices.

**T1-2: Multiple fans shown individually.**
Fixture: site with 2 tuya-fan devices. Confirm site. Open Fan flow. Both fan rows appear independently with their own on/off state and Switch buttons.

**T1-3: validateCommand returns hwBoostHoursRequested for hwboost.**
Unit test: call `validateCommand` with device type `'salus-it500-dhw'`, command `'hwboost'`, value `2`. Return is `{ ok: true, attribute: 'hwBoostHoursRequested', value: 2 }`. Attribute name must not be `'hwBoostHoursDesired'`. Pre-ship check: verify against IoT Command Gate source before committing this test to CI.

**T1-4a: iT500 -- no setpoint control when flag is false (default after Track 1 ships).**
Fixture: salus-it500, online, `SALUS_IT500_CTL_ENABLED=false`. Confirm site. Open Heating flow. Select accommodation area. Setpoint control is NOT offered. Device `d.controllable` is false in workspace payload.

**T1-4b: iT500 -- setpoint control offered when online and flag is true.**
Fixture: salus-it500 with `heatingSetpoint: 18`, online, `SALUS_IT500_CTL_ENABLED=true`. Confirm site. Open Heating flow. Setpoint control IS offered (setpoint window appears).

**T1-4c: iT500 -- no setpoint control when offline even if flag is true.**
Fixture: salus-it500, offline (`d.online=false`), `SALUS_IT500_CTL_ENABLED=true`. Confirm site. Open Heating flow. Setpoint control is NOT offered. Guards against inverted-label risk identified in Item 4.

**T1-4d: iT500-dhw -- no boost affordance in any flag state.**
Fixture: salus-it500-dhw, online. Confirm site. Open Heating or Hot water flow. No boost or control button appears. Verifies Item 3 did not inadvertently open the DHW boost path.

**T1-4e: Dispatch endpoint refuses salus-it500 setpoint when flag is false.**
POST a setpoint command for salus-it500 directly to `/control/dispatch`, bypassing the browser UI entirely, with `SALUS_IT500_CTL_ENABLED=false`. Expect HTTP 4xx. Error body contains "iT500 control not yet enabled". No ThingsBoard write attempted. This is a dispatch-level integration test verifying Level B enforcement in services/control.js.

**T1-5: Heating scope is 'ctl' for iT700 site with online device.**
Fixture: online salus-it700 device (`d.controllable=true`, `d.online=true`), no boilerControl device. POST `/sites/:siteNo/confirm`. `workspace.scope` heating level is `'ctl'`, not `'mon'`.

**T1-5b: Heating scope is 'mon' for iT700 site with offline device.**
Fixture: salus-it700, offline (`d.online=false`, `d.controllable=true` by CONTROL_CONTRACT). Level is `'mon'`. Guards against showing `'ctl'` for offline devices.

**T1-6: Heating scope is 'mon' for dark-fleet salus site.**
Fixture: bare-salus device, offline, `controllable: false`. Level is `'mon'`.

**T1-6b: Hot water scope is 'not-lighthouse' for iT700 site with no DHW device.**
Fixture: iT700 device (kind = 'heating'), no boilerControl device, no salus-it500-dhw device. `workspace.scope` hot water level is `'not-lighthouse'`. Hot water flow renders "Not on Lighthouse here." Also confirm `'none'` still fires for a site with no heating devices at all.

---

### Track 2 Tests

**T2-0 (prerequisite gating checklist): All items must be checked before any Track 2 test is committed to CI.**
- Spencer has confirmed the semantic meaning of DHW.override for V2 panels: override active means the panel is calling for heat.
- Spencer has confirmed the semantic meaning of output1OutputMask bit 3 for V1 panels: bit set means the DHW zone is active.
- Spencer has confirmed the healthy push cadence for boilerControl devices.
- `BOILER_PANEL_STALE_THRESHOLD_MINUTES` has been updated from the provisional 5-minute value to the cadence-derived value and committed.

**T2-1: boilerControl profile device classified as boiler-panel.**
Fixture: device with profile `boilerControl`, name `gk-6100-boiler-panel-1`, no telemetry. Call `classifyDevice('gk-6100-boiler-panel-1', 'boilerControl', null)`. Return: `deviceType: 'boiler-panel'`, `kind: 'heating'`, `controllable: false`.

**T2-2: Boiler panel telemetry mapped correctly.**
Fixture: telemetry bag with `DHW.override` set to a future epoch (V2) and `output1OutputMask: 8` (bit 3 set, V1). Call `mapTelemetry`. Output contains `boilerDhwOverrideUntil` (a future number) and `boilerOutputMask: 8`. Nil-safe: missing or non-numeric values produce null.

**T2-3: Heating flow shows boiler-panel read-only branch with override active.**
Fixture: classified boiler-panel device, `lastActivityTime` within `BOILER_PANEL_STALE_THRESHOLD_MINUTES` (fresh), V2 panel with `boilerDhwOverrideActive: true`. Confirm site. Open Heating flow. DHW zone override row shows "Active." No Switch or setpoint button appears. No staleness warning shown. Reco text: "The IoT team controls this panel directly from ThingsBoard."

**T2-4: No control command accepted for boiler-panel device.**
POST `/control/dispatch` with boiler-panel deviceId and command `switch true`. Expect 400. `validateCommand` returns refusal because boiler-panel commands list is empty.

**T2-5: Staleness warning shown for boiler panel with old telemetry.**
Fixture: classified boiler-panel device, `lastActivityTime` exceeding `BOILER_PANEL_STALE_THRESHOLD_MINUTES` by a clear margin (e.g. threshold 5, fixture age 8 minutes). `boilerPanelStaleMinutes` is non-null. Panel section shows staleness notice. Override state value is visible but muted.

**T2-6: V1 bitmask renders override state correctly.**
Fixture A: `output1OutputMask: 8` (bit 3 set). Workspace has `boilerOutputMaskDhwBit: true`. Heating flow shows "Output 1 DHW: ON." Fixture B: `output1OutputMask: 7` (bit 3 not set). `boilerOutputMaskDhwBit: false`. Shows "Output 1 DHW: OFF."

**T2-7: Missing or non-numeric telemetry values handled gracefully.**
Fixture: `DHW.override` set to a non-numeric string. `boilerDhwOverrideUntil` is null. `boilerDhwOverrideActive` is false (null guard). Flow renders a graceful fallback; no raw value is displayed.

**T2-9 (full mode -- V2): override false with fresh telemetry surfaces the inactive state.**
Fixture: V2 panel, `boilerDhwOverrideActive: false`, fresh telemetry. Confirm site. Open Hot water flow. Override row shows "Inactive." No caveat text needed (the state is unambiguous). Handler can see the panel is not calling for heat and escalate to the IoT team if appropriate.

---

## What Does Not Change

- Intesis AC control: no OOH control; handlers refer to the IoT team (James Q1 discovery decision).
- `'salus-it500-dhw'` CONTROL_CONTRACT: `controllable: false` unchanged. Hot-water boost write path stays fully gated. A future, separately-scoped design enables it; that design must begin by confirming WRITES_DISABLED and receiving Spencer's bench-test sign-off.
- `'salus'` bare-type CONTROL_CONTRACT: `controllable: false, dark: true` unchanged. Legacy fleet stays dark.
- WRITES_DISABLED kill switch: unchanged. Master kill-switch for all write operations. Runtime value must be re-confirmed before SALUS_IT500_CTL_ENABLED is flipped.
- Hot-water boost UI affordance: not offered in this design. The affordance does not appear until a future design separately enables it.
- Tuya switch command path: unchanged.
- iT700 setpoint command path: unchanged.
- P1 escalation flows: unchanged.
- Connectivity flow: unchanged.
- Bridge configuration: unchanged.
- Gate freshness window: unchanged.

---

## Build Sequence and Estimated Effort

Recommended Track 1 sequence: items 2, 1, 4, 6, 3. Each committed separately before moving to the next. Track 2 work units can proceed in parallel with Track 1 for W5-A and W5-B.

| Item | Estimated hours | Primary file(s) | Notes |
|---|---|---|---|
| Item 2 | 0.5 h | services/registry.js | One-identifier fix; 30 min pre-ship check against IoT Command Gate source |
| Item 1 | 2 h | public/js/flows.js | Filter-and-loop for lighting and fan; verify against multi-circuit fixture |
| Item 4 | 2 h | routes/api.js | SCOPE_GROUPS heating evaluation order |
| Item 6 | 2 h | routes/api.js, public/js/flows.js | New scope level and render branch |
| Item 3 | 4 h | registry.js, config, routes/api.js, control.js | Two enforcement levels; flag wiring is the main effort |
| Track 1 total | ~10.5 h | | Approximately 2 to 2.5 days |
| W5-A | 1 h | services/tb-device.js | Classifier early-return; unblocked now |
| W5-B | 1.5 h | services/tb-device.js | mapTelemetry additions; unblocked now |
| W5-C | 2 h | routes/api.js | Computed booleans and staleness; blocked on Spencer semantic confirmation |
| W5-D | 3 h | public/js/flows.js | Flow branches with staleness rendering; blocked on Spencer semantic confirmation |
| W5-E | 0.5 h | config | Threshold constant; provisional value available now |
| Track 2 total | ~8 h | | Approximately 1.5 to 2 days of build once unblocked; Spencer wait time not included |
