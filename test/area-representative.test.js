/**
 * OOHDASH-82 (design §7.3, §10.1) — the read fan-out: coldest online representative.
 *
 * Proves areaRepresentative(devices) (public/js/flows.js):
 *   - with three online Accommodation thermostats, returns the COLDEST;
 *   - ties break by deviceId ascending (determinism);
 *   - all offline returns null (drives the connectivity branch);
 *   - a single-device area returns that device (clean degrade to today's single-device read);
 *   - falls back to roomSensor1Temp when localTemperature is absent;
 *   - when no online device has a numeric temperature, returns the first online by deviceId.
 *
 * flows.js is a browser global (no ESM), so it is evaluated in a vm sandbox with stub globals and its
 * internal helpers exposed onto globalThis (mirrors test/hotwater-scope.test.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'node:vm';

process.env.DATA_MODE = 'fixture';

function loadFlows() {
    const sandbox = { state: { workspace: { devices: [] } }, $: () => ({}), esc: s => String(s), openControl: () => {}, flowStep: () => {}, render: () => {}, startFlow: () => {}, console };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    const src = readFileSync(new URL('../public/js/flows.js', import.meta.url), 'utf8')
        + '\n;globalThis.areaRepresentative = areaRepresentative;';
    vm.runInContext(src, ctx, { filename: 'flows.js' });
    return ctx;
}
const ctx = loadFlows();
const dev = (id, online, temp, room) => ({ deviceId: id, online, telemetry: { ...(temp != null ? { localTemperature: temp } : {}), ...(room != null ? { roomSensor1Temp: room } : {}) } });

test('coldest: three online Accommodation thermostats → the coldest is the representative', () => {
    const set = [dev('gk-a-1', true, 21), dev('gk-a-2', true, 17), dev('gk-a-3', true, 19)];
    assert.equal(ctx.areaRepresentative(set).deviceId, 'gk-a-2', '17°C is the coldest');
});

test('tie-break: equal temperatures break by deviceId ascending', () => {
    const set = [dev('gk-a-3', true, 18), dev('gk-a-1', true, 18), dev('gk-a-2', true, 18)];
    assert.equal(ctx.areaRepresentative(set).deviceId, 'gk-a-1', 'lowest deviceId wins the tie');
});

test('offline devices are excluded; the coldest ONLINE device is chosen', () => {
    const set = [dev('gk-a-1', false, 5), dev('gk-a-2', true, 20), dev('gk-a-3', true, 22)];
    assert.equal(ctx.areaRepresentative(set).deviceId, 'gk-a-2', 'the 5°C device is offline and ignored');
});

test('all offline → null (drives the connectivity branch)', () => {
    const set = [dev('gk-a-1', false, 18), dev('gk-a-2', false, 19)];
    assert.equal(ctx.areaRepresentative(set), null);
});

test('single-device area → that device (clean degrade to today’s single-device read)', () => {
    const set = [dev('gk-solo-1', true, 20)];
    assert.equal(ctx.areaRepresentative(set).deviceId, 'gk-solo-1');
});

test('falls back to roomSensor1Temp when localTemperature is absent', () => {
    const set = [dev('gk-a-1', true, null, 22), dev('gk-a-2', true, null, 16)];
    assert.equal(ctx.areaRepresentative(set).deviceId, 'gk-a-2', '16°C via roomSensor1Temp is coldest');
});

test('no numeric temperature on any online device → first online by deviceId', () => {
    const set = [dev('gk-a-3', true, null), dev('gk-a-1', true, null), dev('gk-a-2', true, null)];
    assert.equal(ctx.areaRepresentative(set).deviceId, 'gk-a-1');
});
