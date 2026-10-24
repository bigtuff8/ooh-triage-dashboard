/**
 * OOHDASH-139 — decodeBoilerHeating unit tests.
 *
 * Tests the pure decodeBoilerHeating decoder exported from services/tb-device.js.
 * No network, no TB reads, no browser. Injects fake data directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.WRITES_DISABLED = 'false';
process.env.DATA_MODE = 'fixture';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

const { decodeBoilerHeating } = await import('../services/tb-device.js');

const NOW = 1700000000000; // fixed epoch ms for deterministic tests

// V1 shared scope with output1OutputMask (zones 1+2 configured)
const V1_SS = { output1OutputMask: [true, true, true, false] };
// V2 client scope with heating_scenario and zones enabled
const V2_CS = { 'heating_scenario': '{}', 'CHZ1.enabled': 'true', 'CHZ2.enabled': 'true' };

test('BH-1: V1 both zones on', () => {
    const t = {
        output1State: true,
        output2State: true, output2FallbackEnabled: false, output2Override: 0,
        output3State: true, output3FallbackEnabled: false, output3Override: 0,
        roomSensor1Temp: 18.5, roomSensor2Temp: 19.0,
        summerModeActive: false
    };
    const r = decodeBoilerHeating(V1_SS, {}, NOW - 1000, t, NOW);
    assert.equal(r.visible, true, 'should be visible');
    assert.equal(r.version, 'V1');
    assert.equal(r.stale, false);
    assert.equal(r.boilerCalling, true);
    assert.equal(r.zones.length, 2);
    assert.equal(r.zones[0].n, 1);
    assert.equal(r.zones[0].on, true);
    assert.equal(r.zones[0].forced, null);
    assert.equal(r.zones[1].on, true);
    assert.equal(r.summerMode, false);
});

test('BH-2: V2 both zones on', () => {
    const t = {
        'boiler.enable_output_state': true,
        'CHZ1.output_state': true, 'CHZ1.fallback_enabled': false, 'CHZ1.override': 0, 'CHZ1.room_temp': 18.7,
        'CHZ2.output_state': true, 'CHZ2.fallback_enabled': false, 'CHZ2.override': 0, 'CHZ2.room_temp': 19.3,
        'summer_mode': false
    };
    const r = decodeBoilerHeating({}, V2_CS, NOW - 1000, t, NOW);
    assert.equal(r.visible, true, 'should be visible');
    assert.equal(r.version, 'V2');
    assert.equal(r.boilerCalling, true);
    assert.equal(r.zones.length, 2);
    assert.equal(r.zones[0].on, true);
    assert.equal(r.zones[0].roomTemp, 18.7);
    assert.equal(r.zones[1].on, true);
    assert.equal(r.summerMode, false);
});

test('BH-3: V2 partial (zone 1 on, zone 2 off)', () => {
    const t = {
        'boiler.enable_output_state': false,
        'CHZ1.output_state': true, 'CHZ1.fallback_enabled': false, 'CHZ1.override': 0,
        'CHZ2.output_state': false, 'CHZ2.fallback_enabled': false, 'CHZ2.override': 0,
        'summer_mode': false
    };
    const r = decodeBoilerHeating({}, V2_CS, NOW - 1000, t, NOW);
    assert.equal(r.zones[0].on, true);
    assert.equal(r.zones[1].on, false);
    assert.equal(r.boilerCalling, false);
});

test('BH-4: V1 forced off (negative override, zone off) → forced:off, held:true', () => {
    // V1 rolling: negative epoch-ms (rolling now+15min heartbeat)
    const override = -(NOW + 900000);
    const t = {
        output1State: false,
        output2State: false, output2FallbackEnabled: false, output2Override: override,
        output3State: false, output3FallbackEnabled: false, output3Override: 0,
    };
    const r = decodeBoilerHeating(V1_SS, {}, NOW - 1000, t, NOW);
    assert.equal(r.zones[0].forced, 'off', 'zone 1 should be forced off');
    assert.equal(r.zones[0].held, true, 'V1 forced off uses held=true');
    assert.equal(r.zones[0].forcedUntilMs, null, 'V1 has no end time');
});

test('BH-5: V2 forced off (negative epoch-seconds, zone off) → forced:off, forcedUntilMs set', () => {
    const endSec = Math.floor((NOW + 2 * 3600 * 1000) / 1000); // 2 hours in future, seconds
    const t = {
        'boiler.enable_output_state': false,
        'CHZ1.output_state': false, 'CHZ1.fallback_enabled': false, 'CHZ1.override': -endSec,
        'CHZ2.output_state': false, 'CHZ2.fallback_enabled': false, 'CHZ2.override': 0,
        'summer_mode': false
    };
    const r = decodeBoilerHeating({}, V2_CS, NOW - 1000, t, NOW);
    assert.equal(r.zones[0].forced, 'off', 'V2 zone 1 should be forced off');
    assert.ok(r.zones[0].forcedUntilMs > NOW, 'forcedUntilMs should be in the future');
    assert.equal(r.zones[0].held, false, 'V2 uses forcedUntilMs, not held');
});

test('BH-6: V1 forced on (positive override, zone on) → forced:on, held:true', () => {
    const override = NOW + 900000; // positive epoch-ms (V1 rolling now+15min)
    const t = {
        output1State: true,
        output2State: true, output2FallbackEnabled: false, output2Override: override,
        output3State: true, output3FallbackEnabled: false, output3Override: 0,
    };
    const r = decodeBoilerHeating(V1_SS, {}, NOW - 1000, t, NOW);
    assert.equal(r.zones[0].forced, 'on', 'zone 1 should be forced on');
    assert.equal(r.zones[0].held, true, 'V1 forced on uses held=true');
});

test('BH-7: Override disagrees (positive override but zone off) → forced:null (stale override ignored)', () => {
    const t = {
        output1State: false,
        output2State: false, output2FallbackEnabled: false, output2Override: NOW + 900000, // positive but zone off
        output3State: false, output3FallbackEnabled: false, output3Override: 0,
    };
    const r = decodeBoilerHeating(V1_SS, {}, NOW - 1000, t, NOW);
    assert.equal(r.zones[0].forced, null, 'disagreeing override should be ignored');
});

test('BH-8: Fallback active → fallback:true', () => {
    const t = {
        output1State: true,
        output2State: true, output2FallbackEnabled: true, output2Override: 0,
        output3State: false, output3FallbackEnabled: false, output3Override: 0,
    };
    const r = decodeBoilerHeating(V1_SS, {}, NOW - 1000, t, NOW);
    assert.equal(r.zones[0].fallback, true, 'zone 1 should show fallback active');
    assert.equal(r.zones[1].fallback, false, 'zone 2 should not show fallback');
});

test('BH-9: Summer mode active → summerMode:true', () => {
    const t = {
        output2State: false, output2FallbackEnabled: false, output2Override: 0,
        summerModeActive: true
    };
    const r = decodeBoilerHeating(V1_SS, {}, NOW - 1000, t, NOW);
    assert.equal(r.summerMode, true);
});

test('BH-10: Stale (panelLastSeenMs over 60 min ago) → stale:true', () => {
    const t = { output2State: true, output2FallbackEnabled: false, output2Override: 0 };
    const r = decodeBoilerHeating(V1_SS, {}, NOW - (61 * 60 * 1000), t, NOW);
    assert.equal(r.stale, true);
});

test('BH-11: Never reported (null panelLastSeenMs) → stale:true, panelLastSeenMs:null', () => {
    const r = decodeBoilerHeating(V1_SS, {}, null, {}, NOW);
    assert.equal(r.stale, true);
    assert.equal(r.panelLastSeenMs, null);
    assert.equal(r.visible, true, 'visible:true even when stale (version discriminator present)');
});

test('BH-12: No discriminator → visible:false', () => {
    const r = decodeBoilerHeating({}, {}, NOW - 1000, {}, NOW);
    assert.equal(r.visible, false);
});

test('BH-13: V2 sentinel temperature -273.15 → roomTemp:null', () => {
    const t = {
        'boiler.enable_output_state': false,
        'CHZ1.output_state': false, 'CHZ1.fallback_enabled': false, 'CHZ1.override': 0,
        'CHZ1.room_temp': -273.15,
        'CHZ2.output_state': false, 'CHZ2.fallback_enabled': false, 'CHZ2.override': 0,
        'summer_mode': false
    };
    const r = decodeBoilerHeating({}, V2_CS, NOW - 1000, t, NOW);
    assert.equal(r.zones[0].roomTemp, null, 'sentinel -273.15 should be dropped to null');
});

test('BH-14: V1 zone not configured (mask index false) → zone excluded', () => {
    const ss = { output1OutputMask: [true, true, false, false] }; // only zone 1 configured
    const t = {
        output2State: true, output2FallbackEnabled: false, output2Override: 0,
    };
    const r = decodeBoilerHeating(ss, {}, NOW - 1000, t, NOW);
    assert.equal(r.zones.length, 1, 'only zone 1 should be present');
    assert.equal(r.zones[0].n, 1);
});

test('BH-15: V2 seconds vs V1 ms — V2 override end time is epoch seconds (multiplied by 1000)', () => {
    // V2 override: positive epoch seconds ~ 2 hours from now
    const endSec = Math.floor((NOW + 2 * 3600 * 1000) / 1000);
    const t = {
        'boiler.enable_output_state': true,
        'CHZ1.output_state': true, 'CHZ1.fallback_enabled': false, 'CHZ1.override': endSec,
        'CHZ2.output_state': false, 'CHZ2.fallback_enabled': false, 'CHZ2.override': 0,
        'summer_mode': false
    };
    const r = decodeBoilerHeating({}, V2_CS, NOW - 1000, t, NOW);
    assert.equal(r.zones[0].forced, 'on', 'zone 1 should be forced on');
    // forcedUntilMs should be approximately endSec * 1000
    assert.ok(r.zones[0].forcedUntilMs > NOW, 'forcedUntilMs should be in the future');
    assert.ok(Math.abs(r.zones[0].forcedUntilMs - endSec * 1000) < 1000, 'forcedUntilMs should be endSec * 1000');
});

// OOHDASH-143 regression tests — string boolean values + zone-2 schedule fallback

test('BH-16: 6811 regression — string overrides held off both zones, mask[2]=false with active output3Schedule', () => {
    const ss = {
        output1OutputMask: [false, true, false, true],
        output3Schedule: JSON.stringify({ schedule: [{ time: '11:00', value: 22 }, { time: '22:30', value: 15 }] }),
    };
    const t = {
        output1State: 'true',
        output2State: 'false', output2FallbackEnabled: 'false', output2Override: '-1792758151398',
        output3State: 'false', output3Override: '-1792758151398',
    };
    const r = decodeBoilerHeating(ss, {}, NOW - 1000, t, NOW);
    assert.equal(r.zones.length, 2, 'both zones should be present');
    assert.equal(r.zones[0].forced, 'off', 'zone 1 should be forced off');
    assert.equal(r.zones[0].held, true, 'zone 1 should be held');
    assert.equal(r.zones[0].on, false, 'zone 1 should be off');
    assert.equal(r.zones[1].forced, 'off', 'zone 2 should be forced off');
    assert.equal(r.zones[1].held, true, 'zone 2 should be held');
});

test('BH-17: V1 string round-trip — "true"/"false" strings decode identically to booleans', () => {
    const t = {
        output1State: 'true',
        output2State: 'true', output2FallbackEnabled: 'false', output2Override: '0',
        output3State: 'false', output3FallbackEnabled: 'false', output3Override: '0',
        summerModeActive: 'false',
    };
    const r = decodeBoilerHeating(V1_SS, {}, NOW - 1000, t, NOW);
    assert.equal(r.boilerCalling, true);
    assert.equal(r.zones[0].on, true);
    assert.equal(r.zones[1].on, false);
    assert.equal(r.summerMode, false);
});

test('BH-18: V2 string integers — "1"/"0" strings decode correctly', () => {
    const t = {
        'boiler.enable_output_state': '1',
        'CHZ1.output_state': '1', 'CHZ1.fallback_enabled': '0', 'CHZ1.override': '0',
        'CHZ2.output_state': '0', 'CHZ2.fallback_enabled': '0', 'CHZ2.override': '0',
        'summer_mode': '0',
    };
    const r = decodeBoilerHeating({}, V2_CS, NOW - 1000, t, NOW);
    assert.equal(r.zones[0].on, true);
    assert.equal(r.zones[1].on, false);
    assert.equal(r.boilerCalling, true);
    assert.equal(r.summerMode, false);
});

test('BH-19: Zone 2 fallback — mask[2]=false but output3Schedule has entries → zone 2 included', () => {
    const ss = {
        output1OutputMask: [true, true, false, false],
        output3Schedule: JSON.stringify({ schedule: [{ time: '08:00', value: 21 }, { time: '23:00', value: 16 }] }),
    };
    const t = {
        output3State: 'false', output3Override: '-1792758151398',
    };
    const r = decodeBoilerHeating(ss, {}, NOW - 1000, t, NOW);
    assert.equal(r.zones.length, 2, 'zone 2 should be present via schedule fallback');
    assert.equal(r.zones[1].forced, 'off', 'zone 2 should be forced off');
    assert.equal(r.zones[1].held, true, 'zone 2 should be held');
});

test('BH-20: Telemetry-ts staleness fallback — panelLastSeenMs=null but recent telemetry → not stale', () => {
    // Mirrors site 6811: SERVER_SCOPE lastActivityTime absent (null), but TB telemetry
    // is current. decodeBoilerHeating receives __telemLastSeenMs as fallback via the caller.
    const ss = { output1OutputMask: [true, true, false, false] };
    const t = { output1State: 'true', output2State: 'false' };
    // Simulate caller passing telemLastSeenMs when lastActivityTime is null
    const panelLastSeenMs = NOW - 60_000; // 1 minute ago — within threshold
    const r = decodeBoilerHeating(ss, {}, panelLastSeenMs, t, NOW);
    assert.equal(r.stale, false, 'panel should not be stale when telemetry ts is recent');
    assert.equal(r.visible, true);
    assert.equal(r.boilerCalling, true);
});
