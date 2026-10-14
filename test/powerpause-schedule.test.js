/**
 * OOHDASH-123 (WU13 rework, DD-SCHED-DISPLAY) - PowerPause next-scheduled-change wiring.
 *
 * Fix 1: PowerPause device IDENTIFICATION is now wired into the read/fetch path, so a PowerPause
 * circuit's SHARED_SCOPE `schedules` programme is decoded and surfaced (matching the boiler V1/V2
 * pattern), with the SAME safe fallback to null ("following its programme") when the parse is unsafe.
 *
 * These are pure unit tests - no network, no TB reads, no browser sandbox:
 *   - isPowerPauseDevice identifies by name token or profile token (bleed-safe, fail-safe);
 *   - mapTbDevice decodes a PowerPause `schedules` blob into the labelled operator string;
 *   - the safe fallback (null) is intact for an unsafe/absent schedule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Module env setup - keep config happy and write-inert (mirrors boilercontrol-scope.test.js).
process.env.WRITES_DISABLED = 'false';
process.env.DATA_MODE = 'fixture';
process.env.TB_URL = 'https://tb.test';
process.env.TB_USERNAME = 'svc-read';
process.env.TB_PASSWORD = 'x';

const { isPowerPauseDevice, mapTbDevice } = await import('../services/tb-device.js');

/* ------------------------------ identification ------------------------------ */

test('isPowerPauseDevice: identifies by the `powerpause` name token', () => {
    assert.equal(isPowerPauseDevice({ name: 'gk-6261-powerpause-1' }), true);
    assert.equal(isPowerPauseDevice({ name: 'GK-6261-PowerPause-2', type: 'default' }), true, 'case-insensitive');
});

test('isPowerPauseDevice: identifies by the profile/type token', () => {
    assert.equal(isPowerPauseDevice({ name: 'md-1110-multiplex-1', type: 'powerpause-circuit' }), true);
    assert.equal(isPowerPauseDevice({ name: 'md-1110-multiplex-1', profile: 'powerpause' }), true);
});

test('isPowerPauseDevice: a non-PowerPause Tuya / other device is NOT identified (no extra read)', () => {
    assert.equal(isPowerPauseDevice({ name: 'gk-6261-fryer-1', type: 'default' }), false);
    assert.equal(isPowerPauseDevice({ name: 'gk-6237-externallighting-1', type: 'default' }), false);
    assert.equal(isPowerPauseDevice({ name: 'gk-6261-salusit700-1', type: 'default' }), false);
});

test('isPowerPauseDevice: nullish / malformed input is fail-safe false', () => {
    assert.equal(isPowerPauseDevice(null), false);
    assert.equal(isPowerPauseDevice(undefined), false);
    assert.equal(isPowerPauseDevice({}), false);
});

/* ------------------------------ decode + surface (via mapTbDevice) ------------------------------ */

// loops '1111111' = active every day, so a single time always has a next occurrence within 7 days -
// the decode result is deterministic (non-null) regardless of when the suite runs.
const DAILY_SCHEDULE = [{ time: '06:30', loops: '1111111', value: 'on' }];

test('mapTbDevice: a PowerPause device decodes its SHARED_SCOPE `schedules` into the labelled string', () => {
    const dev = mapTbDevice(
        { name: 'gk-6261-powerpause-1', type: 'default' },
        {},                                   // telemetry
        {},                                   // clientScope
        { schedules: DAILY_SCHEDULE }         // sharedScope (as the fetch now stashes for PowerPause)
    );
    assert.equal(typeof dev.schedule, 'string', 'the next scheduled change is decoded and surfaced');
    assert.match(dev.schedule, /based on the device's stored schedule/, 'DD-SCHED-DISPLAY label present');
    assert.match(dev.schedule, /next change to on at 06:30/, 'the decoded value/time is surfaced');
});

test('mapTbDevice: unsafe schedule JSON -> safe fallback (schedule === null)', () => {
    const dev = mapTbDevice(
        { name: 'gk-6261-powerpause-1', type: 'default' },
        {},
        {},
        { schedules: 'this is not json {' }
    );
    assert.equal(dev.schedule, null, 'an unsafe parse falls back to null (UI: "following its programme")');
});

test('mapTbDevice: absent schedule -> null (no decoded string invented)', () => {
    const dev = mapTbDevice({ name: 'gk-6261-powerpause-1', type: 'default' }, {}, {}, { schedules: [] });
    assert.equal(dev.schedule, null, 'an empty schedule is not a change to display');
});

test('mapTbDevice: a non-schedule-bearing device with no shared scope stays null (unchanged)', () => {
    const dev = mapTbDevice({ name: 'gk-6237-externallighting-1', type: 'default' }, { switch_1: true }, {}, null);
    assert.equal(dev.schedule, null, 'ordinary Tuya/lighting devices stay indicator-only (no decoded schedule)');
});
