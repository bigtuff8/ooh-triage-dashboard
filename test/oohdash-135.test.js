/**
 * OOHDASH-135 Track 1 -- unit tests T1-1 through T1-6b.
 *
 * Covers all five Track 1 items in the build plan:
 *   T1-1/T1-2  Item 1: lighting and fan flows use filter() for multi-device sites.
 *   T1-3       Item 2: validateCommand returns hwBoostHoursRequested for hwboost.
 *   T1-4a-e    Item 3: SALUS_IT500_CTL_ENABLED flag gate (Level A + B).
 *   T1-5/5b/6  Item 4: heating SCOPE_GROUPS is device-controllable-driven.
 *   T1-6b      Item 6: hot water scope 'not-lighthouse' for pure-heating sites.
 *
 * node:test style; runs under `npm run test:unit`.
 * SALUS_IT500_CTL_ENABLED is set to 'false' (Track 1 ships with flag off).
 * SCOPE_GROUPS tests inject effective controllable directly and are flag-agnostic.
 * T1-4e tests the Level B dispatch guardrail with the flag off.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import vm from "node:vm";

// Set ALL env vars before any module import (config.js reads them at import time).
process.env.DATA_MODE = "fixture";
process.env.OOH_STORE_DIR = mkdtempSync(join(tmpdir(), "ooh-135-"));
process.env.WRITES_DISABLED = "false";
process.env.TB_URL = "https://tb.test";
process.env.TB_USERNAME = "svc-read";
process.env.TB_PASSWORD = "x";
// Track 1 ships with flag off. T1-4e tests the Level B guardrail in this state.
// Existing dispatch tests (IT500-BAR-6832) live in control-plane.test.js which sets flag=true.
process.env.SALUS_IT500_CTL_ENABLED = "false";

const { config } = await import("../config.js");
const registry = await import("../services/registry.js");
const { SCOPE_GROUPS } = await import("../routes/api.js");
const control = await import("../services/control.js");
const resolution = await import("../services/resolution.js");

/* ========================== helpers ========================== */

const NO_BC = { present: false, isV1: false, isV2: false, heatingControllable: false, dhwControllable: false, deviceId: null };

function makeSite(devices, boilerControl) {
    return { siteNo: "9001", siteName: "Test", devices, boilerControl: boilerControl || NO_BC };
}

function heatingLevel(devices, boilerControl) {
    return SCOPE_GROUPS.find(g => g.key === "heating").level(makeSite(devices, boilerControl));
}

function hotwaterLevel(devices, boilerControl) {
    return SCOPE_GROUPS.find(g => g.key === "hotwater").level(makeSite(devices, boilerControl));
}

function makeHeatDev(deviceType, online, controllable) {
    return { deviceId: deviceType + "-test", deviceType, kind: "heating", online, controllable, telemetry: { heatingSetpoint: 18 } };
}

// vm sandbox for browser-side flows.js -- mirrors hotwater-scope.test.js pattern.
function loadClient(workspace) {
    const captured = [];
    const state = { flow: null, workspace };
    const sandbox = {
        state,
        $: () => ({ focus() {} }),
        esc: s => String(s),
        openControl: () => {},
        flowStep: () => {},
        render: () => {},
        window: {},
        console
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    const flowsSrc = readFileSync(new URL("../public/js/flows.js", import.meta.url), "utf8") + "\n;globalThis.FLOWR = FLOWR;";
    vm.runInContext(flowsSrc, ctx, { filename: "flows.js" });
    sandbox.finishOutcome = (f, key, desc, render) => { captured.push(desc); return render({ ticket: { id: 900 + captured.length }, p1: null }); };
    return { ctx, state, captured };
}

/* ========================== T1-1 / T1-2: Item 1 -- filter() for multi-device sites ========================== */

test("T1-1/T1-2: flows.js lighting and fan flows use filter() not find() (source-level)", () => {
    const src = readFileSync(new URL("../public/js/flows.js", import.meta.url), "utf8");
    // lighting
    assert.match(src, /const lgs = ws\.devices\.filter\(/, "lighting uses filter");
    assert.doesNotMatch(src, /const lg = ws\.devices\.find\(/, "lighting must not use find");
    assert.match(src, /lgs\.map\(lg =>/, "lighting maps over lgs array for multi-circuit rows");
    // fan
    assert.match(src, /const fans = ws\.devices\.filter\(/, "fan uses filter");
    assert.doesNotMatch(src, /const fan = ws\.devices\.find\(/, "fan must not use find");
    assert.match(src, /fans\.map\(fan =>/, "fan maps over fans array for multi-circuit rows");
});

test("T1-1: lighting flow renders individual rows for all circuits in a multi-device site", () => {
    // lgSwitches only renders rows for devices that pass canSwitch() (online + capabilities:['switch']).
    // Offline or non-switchable devices produce '' and do not appear in the output.
    // The purpose of T1-1 is to confirm that ALL switchable circuits appear, not just the first.
    const ws = {
        site: { siteName: "Test Site" },
        scope: [],
        devices: [
            { deviceId: "light-1", deviceType: "tuya", kind: "lighting", zone: "Carpark", online: true, controllable: true, registered: true, capabilities: ["switch"], telemetry: { switch_1: true } },
            { deviceId: "light-2", deviceType: "tuya", kind: "lighting", zone: "Frontage", online: true, controllable: true, registered: true, capabilities: ["switch"], telemetry: { switch_1: false } },
            { deviceId: "light-3", deviceType: "tuya", kind: "lighting", zone: "Rear access", online: true, controllable: true, registered: true, capabilities: ["switch"], telemetry: { switch_1: false } }
        ]
    };
    const { ctx, state } = loadClient(ws);
    const flow = { stage: 0, done: [], data: {} };
    state.flow = flow;
    const html = ctx.FLOWR.lighting(ws, flow);
    assert.match(html, /Carpark/, "circuit 1 zone (Carpark) appears in output");
    assert.match(html, /Frontage/, "circuit 2 zone (Frontage) appears in output");
    assert.match(html, /Rear access/, "circuit 3 zone (Rear access) appears in output");
    assert.doesNotMatch(html, /isn.t on Lighthouse/, "multi-circuit site does not show not-on-Lighthouse fallback");
});

test("T1-2: fan flow renders individual rows for all circuits in a multi-device site", () => {
    const ws = {
        site: { siteName: "Test Site" },
        scope: [],
        devices: [
            { deviceId: "fan-1", deviceType: "tuya", kind: "fan", zone: "Kitchen extract", online: true, controllable: true, registered: true, capabilities: ["switch"], telemetry: { switch_1: true } },
            { deviceId: "fan-2", deviceType: "tuya", kind: "fan", zone: "Cellar ventilation", online: true, controllable: true, registered: true, capabilities: ["switch"], telemetry: { switch_1: false } }
        ]
    };
    const { ctx, state } = loadClient(ws);
    const flow = { stage: 0, done: [], data: {} };
    state.flow = flow;
    const html = ctx.FLOWR.fan(ws, flow);
    assert.match(html, /Kitchen extract/, "fan circuit 1 zone appears in output");
    assert.match(html, /Cellar ventilation/, "fan circuit 2 zone appears in output");
    assert.doesNotMatch(html, /aren.t on Lighthouse/, "multi-device fan site does not show not-on-Lighthouse fallback");
});

/* ========================== T1-3: Item 2 -- hwBoostHoursRequested ========================== */

test("T1-3: validateCommand hwboost returns hwBoostHoursRequested (not hwBoostHoursDesired)", () => {
    const device = { deviceType: "salus-it500-dhw", telemetry: {} };
    const result = registry.validateCommand(device, "hwboost", 2);
    assert.equal(result.ok, true, "hwboost command is valid for salus-it500-dhw");
    assert.equal(result.attribute, "hwBoostHoursRequested", "attribute is hwBoostHoursRequested (Requested key, routes through IoT Command Gate)");
    assert.notEqual(result.attribute, "hwBoostHoursDesired", "must not be hwBoostHoursDesired (Desired key that bypassed the gate)");
    assert.equal(result.value, 2, "value passes through unchanged");
});

/* ========================== T1-4a-e: Item 3 -- SALUS_IT500_CTL_ENABLED flag gate ========================== */

test("T1-4a: heating scope is mon when salus-it500 has effective controllable=false (flag off -- Level A applied)", () => {
    // When SALUS_IT500_CTL_ENABLED=false, routes/api.js Level A sets controllable:false for iT500.
    // SCOPE_GROUPS heating step 1 requires controllable=true AND online=true to reach ctl.
    const devices = [{ deviceId: "it500-1", deviceType: "salus-it500", kind: "heating", online: true, controllable: false, telemetry: {} }];
    assert.equal(heatingLevel(devices), "mon", "iT500 online but effective controllable=false (flag off) -> mon, not ctl");
});

test("T1-4b: heating scope is ctl when salus-it500 is online and effective controllable=true (flag on)", () => {
    // Represents the post-activation state where SALUS_IT500_CTL_ENABLED=true.
    const devices = [makeHeatDev("salus-it500", true, true)];
    assert.equal(heatingLevel(devices), "ctl", "iT500 online+controllable=true (flag on) -> ctl");
});

test("T1-4c: heating scope is ctl when salus-it500 effective controllable=true regardless of online (scope is capability-driven)", () => {
    // SCOPE_GROUPS heating checks d.controllable only -- NOT d.online.
    // Scope reflects device capability; current connectivity is handled inside the flow.
    // This proves the scope is stable: a briefly-offline controllable device stays 'ctl' scope.
    // (In real traffic the Level A gate sets controllable=false for iT500 when flag=false, making
    // T1-4a the authoritative "flag-off -> mon" test; T1-4c tests the flag-on / post-activation path.)
    const devices = [makeHeatDev("salus-it500", false, true)];
    assert.equal(heatingLevel(devices), "ctl", "iT500 offline but effective controllable=true -> ctl (scope is capability-driven, online state handled in flow)");
});

test("T1-4d: salus-it500-dhw controllable is still false -- Item 3 did not open the DHW boost path", () => {
    const dhwContract = registry.capabilitiesContractFor("salus-it500-dhw");
    assert.equal(dhwContract.controllable, false, "salus-it500-dhw controllable must remain false (DHW boost path stays gated)");
    // Confirm salus-it500 itself was changed to true by Item 3.
    const it500Contract = registry.capabilitiesContractFor("salus-it500");
    assert.equal(it500Contract.controllable, true, "salus-it500 controllable is now true (flag gate controls activation)");
});

test("T1-4e: dispatch refuses salus-it500 setpoint when SALUS_IT500_CTL_ENABLED=false (Level B guardrail)", async () => {
    assert.equal(config.salusIt500CtlEnabled, false, "flag is off for this test suite (Track 1 ships with flag off)");
    const SITE = "6832";
    const OPERATOR = { id: "op-t1", name: "T1 Tester", email: "test@airedale-group.co.uk" };
    const { token } = await resolution.confirmSite(SITE, OPERATOR);
    await assert.rejects(
        control.dispatch({
            operator: OPERATOR,
            confirmToken: token,
            siteNo: SITE,
            deviceId: "IT500-BAR-6832",
            command: "setpoint",
            value: 20,
            direction: "up"
        }),
        err => {
            assert.equal(err.status, 422, "Level B guardrail throws 422");
            assert.match(err.message, /not yet enabled|SALUS_IT500_CTL_ENABLED/i, "error message references the flag");
            assert.equal(err.guardrail, true, "carries guardrail:true flag");
            return true;
        }
    );
});

/* ========================== T1-5 / T1-5b / T1-6: Item 4 -- heating scope is device-driven ========================== */

test("T1-5: heating scope is ctl for online salus-it700 with no boilerControl required", () => {
    const devices = [makeHeatDev("salus-it700", true, true)];
    assert.equal(heatingLevel(devices), "ctl", "iT700 online+controllable -> ctl (Item 4: device-driven, not boilerControl-driven)");
});

test("T1-5b: heating scope is ctl for offline salus-it700 -- scope is capability-driven, not connectivity-driven", () => {
    // Same principle as T1-4c: SCOPE_GROUPS heating only checks d.controllable, not d.online.
    // An offline iT700 with controllable=true still resolves to 'ctl' scope.
    // (The flow renders device-level online/offline status separately inside the heating flow.)
    const devices = [makeHeatDev("salus-it700", false, true)];
    assert.equal(heatingLevel(devices), "ctl", "iT700 offline + controllable=true -> ctl (scope is capability-driven)");
});

test("T1-6: heating scope is mon for bare-salus dark-fleet device (controllable=false, offline)", () => {
    const devices = [makeHeatDev("salus", false, false)];
    assert.equal(heatingLevel(devices), "mon", "bare-salus offline+non-controllable -> mon (device present, step 2)");
});

/* ========================== T1-6b: Item 6 -- hot water 'not-lighthouse' scope level + flows render ========================== */

test("T1-6b-scope: hot water scope is not-lighthouse for iT700 site with no DHW device (no boilerControl, no iT500-dhw)", () => {
    // Step 3 condition: heating device present AND no boilerControl AND no salus-it500-dhw.
    const devices = [makeHeatDev("salus-it700", true, true)];
    assert.equal(hotwaterLevel(devices, NO_BC), "not-lighthouse",
        "iT700 site, no boilerControl, no DHW -> not-lighthouse (hot water exists but not on Lighthouse)");
    // Step 4: no heating devices at all -> none (not not-lighthouse).
    assert.equal(hotwaterLevel([], NO_BC), "none",
        "site with no heating devices at all -> none (step 4), not not-lighthouse");
});

test("T1-6b-flows: hotwater flow renders not-lighthouse branch when scope level is not-lighthouse", () => {
    const ws = {
        site: { siteName: "Test Site" },
        devices: [makeHeatDev("salus-it700", true, true)],
        scope: [{ key: "hotwater", label: "Hot water", level: "not-lighthouse" }]
    };
    const { ctx, state } = loadClient(ws);
    const flow = { stage: 0, done: [], data: {} };
    state.flow = flow;
    const html = ctx.FLOWR.hotwater(ws, flow);
    assert.match(html, /hw-not-lighthouse/, "not-lighthouse branch renders hw-not-lighthouse testid");
    assert.match(html, /hw-nlh-capture/, "not-lighthouse branch renders capture button (hw-nlh-capture)");
    // Normal hw-capture (main boiler path) must NOT appear in the not-lighthouse branch.
    assert.doesNotMatch(html, /data-testid="hw-capture"/, "normal hw-capture button does not appear in not-lighthouse branch");
    // Verify the standard boiler-side message does NOT appear.
    assert.doesNotMatch(html, /boiler panel/, "boiler-panel message does not show in not-lighthouse branch");
});

test("T1-6b-flows: hotwater flow renders standard boiler path when scope level is not not-lighthouse", () => {
    const ws = {
        site: { siteName: "Test Site" },
        devices: [],
        scope: [{ key: "hotwater", label: "Hot water", level: "none" }]
    };
    const { ctx, state } = loadClient(ws);
    const flow = { stage: 0, done: [], data: {} };
    state.flow = flow;
    const html = ctx.FLOWR.hotwater(ws, flow);
    // Standard boiler-side path (no scope override -> existing doneLine fires)
    assert.doesNotMatch(html, /hw-not-lighthouse/, "standard path does not show not-lighthouse div");
    assert.match(html, /hw-capture/, "standard path shows normal hw-capture button");
});
