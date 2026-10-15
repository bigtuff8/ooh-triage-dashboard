# OOHDASH-131 - Independent verification of the device capability table

Tester (test-stage reviewer), 15 October 2026. Table under test: docs/project/OOH_DEVICE_CAPABILITY_TABLE.md and .html at commit ccc80c9 (code baseline = main, v1.4.1).
Method: every cell was checked against the code (services/tb-device.js, services/registry.js, services/control.js, services/tb-client.js, routes/api.js, public/js/flows.js, public/js/control.js, public/js/views.js, config.js). The classifier was run locally on sample device names with imports stubbed (no network, no prod access). Prod was not called. Jira was read only.

## Overall verdict

PASS-WITH-CORRECTIONS. The table is substantially accurate and AC3 is clean. Four cells need correcting, the "Key gaps" list misses one gap in the opposite direction, and Gap 3 is real but understated.

## Per-row verdicts

| # | Device | Shows | Controls | Limits / notes |
|---|---|---|---|---|
| 1 | Salus iT700 | CONFIRMED (read appears only when the device is online; when offline the flow goes to the connection check) | CONFIRMED (window is 3 degrees either way, capped at 25 C and never below 5 C. A frost-hold pre-selects "until 07:00 tomorrow" as the default hold) | CONFIRMED |
| 2 | Salus iT500 | CONFIRMED (the "not reporting" wording appears only when every unit in the chosen area is an iT500 or older Salus) | CONFIRMED (as of the fleet state, which is unconfirmed) | CONFIRMED. The re-reporting risk is real (see Finding A). Minor: the handler would be told "about 15 minutes", not 5 |
| 3 | Older Salus | CONFIRMED | CONFIRMED | CONFIRMED |
| 4 | Air conditioning | UNDERSTATED: the air-con shortcut only appears when the site also has a heating area. With no heating on Lighthouse the flow stops at "No heating on Lighthouse" and shows no shortcut. Typing a keyword still works | CONFIRMED | CONFIRMED. Recognition is by name only ("ac", "aircon" or "intesis" in the name); the Modbus units named like "...-ac-1" are caught |
| 5 | Kitchen circuit | CONFIRMED | CONFIRMED | OVERSTATED condition: the site panel shows Kitchen equipment as "Controllable from here" whenever ANY device is grouped as kitchen (including meters and unrecognised switches), not only when switchable hardware exists. "Monitored only" can never appear for kitchen |
| 6 | PowerPause | CONFIRMED | CONFIRMED | CONFIRMED |
| 7 | Unrecognised smart switch | CONFIRMED | CONFIRMED | CONFIRMED for joined-up names (for example supplyfan, loftfan, barfan, overdoorheater, immersion, festoon). Nuance: a name containing "light" (for example festoonlights) IS grouped as lighting, and a name with a separate "fan" word (for example cellar-fan) IS grouped as a fan |
| 8 | External lighting | CONFIRMED | CONFIRMED | CONFIRMED. The dusk-sensor script is shown in both cases. The fuse-board advice is only shown when the device is offline. The "first lighting circuit" may be a cellar light, because cellar lights are grouped as lighting |
| 9 | Extractor fan | CONFIRMED | CONFIRMED | WRONG in part: "A cellar fan is allowed to be switched" only holds when "fan" is a separate word in the name (cellar-fan). A joined-up name (cellarfan) is grouped as kitchen and is never offered in the fans flow |
| 10 | Refrigeration | CONFIRMED | CONFIRMED (blocked by the device grouping and again by the server) | CONFIRMED |
| 11 | Site hub | CONFIRMED (shown as offline only after 48 hours of silence) | CONFIRMED | CONFIRMED |
| 12 | Equipment-group gateway | CONFIRMED | CONFIRMED | CONFIRMED. Minor gap: other gateway units (for example Dragino) count as gateways but are neither the hub nor a group, so they never appear in the connection check. They only feed the red banner |
| 13 | Boiler control panel | CONFIRMED | CONFIRMED | CONFIRMED |
| 14 | Unknown / monitor-only | CONFIRMED | CONFIRMED | CONFIRMED |

Completeness (AC1): every device grouping the code actually produces appears exactly once. No row is duplicated. The registry also lists hot-water boost, pub boiler panel and rule-chain types, but the device grouping never produces them, so leaving them out is correct (the boiler panel is covered in row 13).

## Key gaps list

- Gaps 1, 4, 5, 6, 7 and 8 are CONFIRMED.
- Gap 2 is CONFIRMED, but incomplete in two ways. (a) Lighting and Extractor fans are also shown as "Controllable" whenever such a device exists, even when it is offline and the flow says it cannot be switched. (b) MISSING, opposite direction: at a site with an iT700 thermostat but no boiler panel, the panel shows Heating as "Monitored only", and the "Something else" check records "monitored only", while the Heating flow does offer temperature changes (routes/api.js:169). A handler could tell a caller that heating cannot be changed when it can.
- Gap 3 is CONFIRMED and understated. See Finding A.

## Finding A - not-controllable flag is not enforced (Gap 3)

Classification: REAL EXPOSURE (latent). It is not only a gap in the screens. Both the dashboard screens and a crafted request would send a temperature or frost-hold command to an iT500 or older Salus unit that is reporting. Today it is masked only because these units are offline. The confirmed-site token is single-use, but any signed-in handler can get one.

Evidence:
- services/registry.js:20-26 and 41-48 still list setpoint and frost commands for salus-it500 and salus. The not-controllable flag is only data in the contract (registry.js:107-118: controllable false, dark true).
- services/control.js:62-108 is the whole dispatch path. It checks the confirm token, the kill switch, that the device is online, that it has published state, and registry.validateCommand. It never reads contract.controllable or dark. control.js:90 fetches the contract only after validation, for timings.
- services/registry.js:172-192: validateCommand checks only the commands list. Frost does not even need a current setpoint.
- services/tb-client.js:289-298: the write primitive checks only that the attribute is allowed (setpointRequested is allowed) and the deploy write-lock. k8s/deployment.yaml sets WRITES_DISABLED to "false".
- services/tb-device.js:761-798: mapTbDevice discards the grouping's controllable result, so the browser never receives it. tb-device.js:649 folds the iT500 setPoint reading into the heating setpoint, so a target-temperature window is computed (routes/api.js:214).
- public/js/flows.js:124-131 and 185-201: iT500 and older Salus units are heating devices, and the coldest ONLINE unit becomes the area reading. The dark-fleet branch (flows.js:513) runs only when NO unit in the area is online. Otherwise flows.js:572-576 offers Warmer, Cooler and Turn it off, which call openControl (flows.js:601, 621). public/js/control.js:27-47 does no capability check.
- POST /api/control/dispatch (routes/api.js:232-239) passes the request body straight to control.dispatch, so a crafted call naming any reporting device at a confirmed site gets the same treatment.
- Same root cause, wider reach: any device grouped as a switch by its name alone, with no switch reading (for example a lighting device that reports only other values), gets the switch capability (routes/api.js:208). The flows offer Turn ON/OFF for it (flows.js:369-371) and the server accepts it.

Suggested fix scope for the Bug ticket: in control.dispatch, refuse the request when capabilitiesContractFor(deviceType).controllable is false, or when the device's own grouping marked it not controllable. Then carry the flag through mapTbDevice so the flows hide the controls.

## AC3 - plain English

PASS. A scan of the table body, Key gaps and Cost sections found no code, backticks, camel-case key names, file names or API terms. Code names appear only in the Appendix, which is labelled as sources.

## Render (docs/project/oohdash-131-evidence/)

- 390 px, light and dark: no horizontal overflow (page width 375 to 390). The header row is hidden and each row stacks as a labelled card. Body text is about 14.7 px. Dark mode switches correctly (background rgb 22,23,22, text rgb 236,235,230).
- 1280 px, light and dark: the table fits (1233 px wide, no overflow). Legibility issue (minor, cosmetic): the "What it is" column is only about 104 px wide, and the "break anywhere" wrapping splits words mid-word (for example "accommoda-tion", "conditionin-g"). A minimum width on that column of about 160 px would fix it.
- Files: 390-light.png, 390-dark.png, 1280-light.png, 1280-dark.png.

## Required corrections (for the author)

1. Row 5 Limits: the Kitchen "Controllable from here" label appears whenever any kitchen-grouped device exists, not only switchable hardware.
2. Row 9 Limits: a cellar fan is switchable only when "fan" is a separate word in its name. A joined-up name is grouped as kitchen and is not offered.
3. Row 4 Shows: the air-con shortcut appears only when the site has a heating area.
4. Gap 2: add the opposite case (Heating shown as "Monitored only" at iT700 sites with no boiler panel, although the flow can change it) and the Lighting and Fans label case.
5. Gap 3: restate it as a real but latent exposure affecting the screens and a crafted request. Note that it also covers switch devices grouped by name only. Raise it as a Bug with the evidence above.
6. Optional: give the "What it is" column in the HTML a minimum width, and mention in rows 11 and 12 that gateway units which are neither the hub nor a group are not shown.
