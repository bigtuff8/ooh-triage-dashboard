/**
 * OOHDASH-114-F1 — deriveBoilerControl unit tests (BC-1 through BC-9).
 *
 * Tests the pure deriveBoilerControl function exported from services/tb-device.js
 * and the SCOPE_GROUPS level functions in routes/api.js that consume it.
 *
 * These are purely unit tests — no network, no TB reads, no browser sandbox.
 * The boilerControl field is injected directly on fixture-shaped site objects.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Module env setup — fail-closed by default, keep test write-inert.
process.env.WRITES_DISABLED = 'false';
process.env.DATA_MODE = 'fixture';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

const { deriveBoilerControl } = await import('../services/tb-device.js');
const { SCOPE_GROUPS, hasControllableDhw } = await import('../routes/api.js');

// Helper: build a minimal fixture site with a given boilerControl field
function makeSite(boilerControl, extraDevices = []) {
    return {
        siteNo: '9001',
        siteName: 'Test',
        devices: extraDevices,
        boilerControl
    };
}

const V2_BC = { present: true, deviceId: 'gk-9001-boilercontrol-1', isV1: false, isV2: true, heatingControllable: true, dhwControllable: true };
const V1_BC = { present: true, deviceId: 'gk-9002-boilercontrol-1', isV1: true, isV2: false, heatingControllable: true, dhwControllable: true };
const NO_BC = { present: false, isV1: false, isV2: false, heatingControllable: false, dhwControllable: false, deviceId: null };

/* ---- BC-1: V2 site → hotwater scope level is 'ctl' ---- */
test('BC-1: V2 site with dhwControllable=true → hotwater scope level is ctl', () => {
    const site = makeSite(V2_BC);
    const g = SCOPE_GROUPS.find(g => g.key === 'hotwater');
    assert.equal(g.level(site), 'ctl');
});

/* ---- BC-2: V1 site → hotwater scope level is 'ctl' ---- */
test('BC-2: V1 site with dhwControllable=true → hotwater scope level is ctl', () => {
    const site = makeSite(V1_BC);
    const g = SCOPE_GROUPS.find(g => g.key === 'hotwater');
    assert.equal(g.level(site), 'ctl');
});

/* ---- BC-3: no boilerControl → hotwater scope level is 'none' ---- */
test('BC-3: site with no boilerControl and no combi signal → hotwater scope level is none', () => {
    const site = makeSite(NO_BC, []);
    const g = SCOPE_GROUPS.find(g => g.key === 'hotwater');
    assert.equal(g.level(site), 'none');
});

/* ---- BC-4: boilerControl present → heating scope level is 'ctl' ---- */
test('BC-4: site with boilerControl present → heating scope level is ctl', () => {
    const site = makeSite(V2_BC);
    const g = SCOPE_GROUPS.find(g => g.key === 'heating');
    assert.equal(g.level(site), 'ctl');
});

/* ---- BC-5: no boilerControl + heating devices → heating scope level is 'mon' ---- */
test('BC-5: site without boilerControl but with salus-it500 heating devices → heating scope level is mon', () => {
    const site = makeSite(NO_BC, [
        { deviceId: 'it500-1', deviceType: 'salus-it500', kind: 'heating', online: true, telemetry: {} }
    ]);
    const g = SCOPE_GROUPS.find(g => g.key === 'heating');
    assert.equal(g.level(site), 'mon');
});

/* ---- BC-6: deriveBoilerControl unit — V1 mask parsing (SHARED_SCOPE) ---- */
test('BC-6a: V1 mask [false,false,false,true] → dhwControllable=true', () => {
    const r = deriveBoilerControl({ output1OutputMask: [false, false, false, true] }, {}, 'gk-9002-boilercontrol-1');
    assert.equal(r.isV1, true);
    assert.equal(r.isV2, false);
    assert.equal(r.dhwControllable, true);
    assert.equal(r.present, true);
    assert.equal(r.deviceId, 'gk-9002-boilercontrol-1');
});

test('BC-6b: V1 mask [false,false,false,false] → dhwControllable=false', () => {
    const r = deriveBoilerControl({ output1OutputMask: [false, false, false, false] }, {}, null);
    assert.equal(r.isV1, true);
    assert.equal(r.dhwControllable, false);
});

test('BC-6c: V1 mask with only 3 elements → dhwControllable=false (array too short)', () => {
    const r = deriveBoilerControl({ output1OutputMask: [true, true, true] }, {}, null);
    assert.equal(r.isV1, true);
    assert.equal(r.dhwControllable, false);
});

test('BC-6d: V1 mask as JSON string "[false,false,false,true]" → dhwControllable=true (JSON.parse guard)', () => {
    const r = deriveBoilerControl({ output1OutputMask: '[false,false,false,true]' }, {}, null);
    assert.equal(r.isV1, true);
    assert.equal(r.dhwControllable, true);
});

/* ---- BC-7: deriveBoilerControl unit — V2 DHW flag parsing (CLIENT_SCOPE) ---- */
test('BC-7a: V2 DHW.use_boiler=true (boolean) → dhwControllable=true', () => {
    const r = deriveBoilerControl({}, { 'DHW.use_boiler': true }, null);
    assert.equal(r.isV2, true);
    assert.equal(r.isV1, false);
    assert.equal(r.dhwControllable, true);
});

test('BC-7b: V2 DHW.use_boiler=false → dhwControllable=false', () => {
    const r = deriveBoilerControl({}, { 'DHW.use_boiler': false }, null);
    assert.equal(r.isV2, true);
    assert.equal(r.dhwControllable, false);
});

test('BC-7c: V2 DHW.use_boiler="true" (string) → dhwControllable=true (toBool normalisation)', () => {
    const r = deriveBoilerControl({}, { 'DHW.use_boiler': 'true' }, null);
    assert.equal(r.isV2, true);
    assert.equal(r.dhwControllable, true);
});

/* ---- BC-8: neither attribute present → unknown variant, dhwControllable=false ---- */
test('BC-8: neither output1OutputMask nor DHW.use_boiler present → isV1=false, isV2=false, dhwControllable=false, heatingControllable=true', () => {
    const r = deriveBoilerControl({}, { site: '6999' }, null);
    assert.equal(r.isV1, false);
    assert.equal(r.isV2, false);
    assert.equal(r.dhwControllable, false);
    assert.equal(r.heatingControllable, true);
    assert.equal(r.present, true);
});

/* ---- BC-9: null inputs → all-false output ---- */
test('BC-9: null sharedScope and null clientScope → present=false, all-false output', () => {
    const r = deriveBoilerControl(null, null, null);
    assert.deepStrictEqual(r, { present: false, isV1: false, isV2: false, heatingControllable: false, dhwControllable: false, deviceId: null });
});

/* ---- hasControllableDhw delegates to boilerControl.dhwControllable ---- */
test('hasControllableDhw returns true when boilerControl.dhwControllable=true', () => {
    assert.equal(hasControllableDhw(makeSite(V2_BC)), true);
    assert.equal(hasControllableDhw(makeSite(V1_BC)), true);
});

test('hasControllableDhw returns false when boilerControl absent or dhwControllable=false', () => {
    assert.equal(hasControllableDhw(makeSite(NO_BC)), false);
    assert.equal(hasControllableDhw({ devices: [] }), false);
});
