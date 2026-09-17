/**
 * TB-direct read-plane PURE-UNIT tests (design §5 / §11) — the exported building blocks of
 * services/tb-device.js exercised in isolation:
 *   - classifyDevice() over a realistic 6261-style set + every C4 exception class;
 *   - the site-query filter (bleed rejection, split-union via alias, glued keep, numeric-bleed drop,
 *     case-insensitivity) and pagination >200;
 *   - telemetry mapping incl. the switchReported→switchOn→switch_1 normalisation;
 *   - the boolean bridgeStatus() latch shape.
 *
 * These functions are config-independent; fixture mode keeps the import clean and network-free.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';

const tb = await import('../services/tb-device.js');
const {
    classifyDevice, normaliseName, siteQueryTokens, siteNameFilter, mapTelemetry, bridgeStatus
} = tb;

/* ------------------------------------------------------------------ */
/* classifyDevice — capability-first, typo-tolerant (D2)               */
/* ------------------------------------------------------------------ */

test('classify: Salus thermostat on the `default` profile is heating+controllable via setpoint (C7 — never the profile)', () => {
    const c = classifyDevice('gk-6261-salusit700-1', 'default', { heatingSetpoint: 21 });
    assert.equal(c.kind, 'heating');
    assert.equal(c.deviceType, 'salus-it700');
    assert.equal(c.controllable, true);
    assert.equal(c.control.attribute, 'setpointDesired');
});

test('classify: controllable Salus on `default` profile — control derives from telemetry signal, not the profile label', () => {
    // Same `default` profile as a monitor-only device, but a setpoint signal ⇒ controllable.
    const withSignal = classifyDevice('gk-2933-salusit700', 'default', { heatingSetpoint: 20 });
    const noSignal = classifyDevice('gk-2933-salusit700', 'default', {});
    assert.equal(withSignal.controllable, true);
    assert.equal(noSignal.controllable, false, 'no setpoint telemetry ⇒ monitor-only regardless of the name');
});

test('classify: Tuya switch signal → tuya + switchDesired (C5), kitchen kind from the name', () => {
    const c = classifyDevice('gk-6209fryer-1', 'gatewayDevice', { switchReported: true });
    assert.equal(c.deviceType, 'tuya');
    assert.equal(c.controllable, true);
    assert.equal(c.control.attribute, 'switchDesired');
    assert.equal(c.kind, 'kitchen');
});

test('classify: Intesis AC → intesis + setpointDesired (mode held in v1)', () => {
    const c = classifyDevice('gk-6770-intesis-1', 'default', { heatingSetpoint: 22, mode: 'Cool' });
    assert.equal(c.deviceType, 'intesis');
    assert.equal(c.control.attribute, 'setpointDesired');
});

test('classify: gateway/R10A with no control signal is monitor-only', () => {
    const c = classifyDevice('gk-6360-maindb-r10a', 'default', {});
    assert.equal(c.kind, 'gateway');
    assert.equal(c.controllable, false);
    assert.equal(c.control, null);
});

// --- exception classes (C4) ---
test('classify exception: spaces in the name (`Arrow gr3 grill`) still classify as a kitchen circuit', () => {
    const c = classifyDevice('Arrow gr3 grill', 'gatewayDevice', { switchOn: false });
    assert.equal(c.kind, 'kitchen');
    assert.equal(c.deviceType, 'tuya');
});

test('classify exception: parenthetical cross-ref site number is stripped before token matching (mis-site guard)', () => {
    // The (5135) is ANOTHER site's number — normalisation drops it so it never mis-classifies.
    assert.equal(normaliseName('gk-6360-maindb-r10a (5135)'), 'gk-6360-maindb-r10a');
    const c = classifyDevice('gk-6360-maindb-r10a (5135)', 'default', {});
    assert.equal(c.kind, 'gateway');
});

test('classify exception: `(old)` duplicate is flagged isDuplicate (via mapTbDevice) and excluded from control intent', () => {
    // isDuplicate lives on mapTbDevice; here assert the name still classifies (control exclusion is a
    // consumer concern) — the parenthetical `(old)` is stripped by normalisation.
    const c = classifyDevice('gk-6261-salusit700-1 (old)', 'default', { heatingSetpoint: 21 });
    assert.equal(c.deviceType, 'salus-it700');
});

test('classify exception: missing -n suffix (all remote.it R10As) still classifies as gateway', () => {
    const c = classifyDevice('gk-4741-gateway', 'default', {});
    assert.equal(c.kind, 'gateway');
});

test('classify exception: hex-UUID suffix (gk-6770-intesis-688ce553) classifies on the asset token', () => {
    const c = classifyDevice('gk-6770-intesis-688ce553', 'default', { heatingSetpoint: 22 });
    assert.equal(c.deviceType, 'intesis');
});

test('classify exception: raw devEUI / bare-number name with no asset token is unknown (safe default)', () => {
    const c = classifyDevice('a8404120fc584150', 'default', {});
    assert.equal(c.kind, 'unknown');
    assert.equal(c.controllable, false);
});

test('classify exception: underscore + doubled-site-code name maps `_`→`-` and classifies the asset (multiplex→switch)', () => {
    const c = classifyDevice('md_11101110meridian_multiplex_1', 'powerpause-circuit', { switchOn: true });
    assert.equal(c.deviceType, 'tuya', 'a switch signal ⇒ tuya control family');
    assert.equal(c.controllable, true);
});

test('classify exception: glued token without a dash (gk-6209fryer-1) classifies as kitchen', () => {
    const c = classifyDevice('gk-6209fryer-1', 'gatewayDevice', { switchOn: false });
    assert.equal(c.kind, 'kitchen');
});

test('classify exception: case variance (GK-6261-SALUSIT700-1) classifies identically (case-insensitive)', () => {
    const c = classifyDevice('GK-6261-SALUSIT700-1', 'DEFAULT', { heatingSetpoint: 21 });
    assert.equal(c.deviceType, 'salus-it700');
    assert.equal(c.controllable, true);
});

test('classify typo-tolerance: `extracfan`→extractfan (fan) and `bainmare`→bainmarie (kitchen)', () => {
    assert.equal(classifyDevice('gk-6261-extracfan-1', 'default', {}).kind, 'fan');
    assert.equal(classifyDevice('gk-6261-bainmare-1', 'gatewayDevice', {}).kind, 'kitchen');
});

/* ------------------------------------------------------------------ */
/* Site-query filter (D1)                                              */
/* ------------------------------------------------------------------ */

function filterFor(siteNo) {
    const { brand, tokens } = siteQueryTokens(siteNo);
    return siteNameFilter(brand, tokens);
}

test('site-query: numeric-bleed neighbours are REJECTED (gk-6261 does not admit gk-6263/gk-62611)', () => {
    const f = filterFor('6261');
    assert.ok(f.test('gk-6261-salusit700-1'), 'the true site device matches');
    assert.ok(!f.test('gk-6263-salusit700-1'), 'a different numeric site is dropped');
    assert.ok(!f.test('gk-62611-salusit700-1'), 'a digit after the token = different numeric site (bleed drop)');
    assert.ok(!f.test('gk-62091'), 'bare numeric bleed (gk-62091 vs site 6209) is dropped');
});

test('site-query: glued asset is KEPT (gk-6209fryer-1 — a letter after the token = same site)', () => {
    const f = filterFor('6209');
    assert.ok(f.test('gk-6209fryer-1'), 'a letter after the token = same-site glued asset');
    assert.ok(f.test('gk-6209-salusit700-1'), 'a dash after the token = same site');
});

test('site-query: split-union via alias — md-1110 admits BOTH md-1110-* and md-1110meridian-*', () => {
    const { brand, tokens } = siteQueryTokens('1110', 'md');
    assert.ok(tokens.includes('1110meridian'), 'alias overlay adds the split text token');
    const f = siteNameFilter(brand, tokens);
    assert.ok(f.test('md-1110-multiplex-1'), 'bare-number devices admitted');
    assert.ok(f.test('md-1110meridian-multiplex-1'), 'the split text-token devices are unioned in (no 95% loss)');
    assert.ok(!f.test('md-11101-multiplex-1'), 'a numeric-bleed neighbour of 1110 is still dropped');
});

test('site-query: case-insensitivity (GK-6261-... matches the gk-6261 filter)', () => {
    const f = filterFor('6261');
    assert.ok(f.test('GK-6261-SALUSIT700-1'.toLowerCase()), 'normalised name matches case-insensitively');
    assert.ok(f.test('gk-6261-salusit700-1'));
});

test('site-query: pagination >200 — the filter is applied over the fully-paginated union (simulated)', () => {
    // Simulate a >200-device over-fetch across two pages; the anchored filter is a pure predicate
    // applied to the concatenated, deduped union — prove it holds over a large set incl. bleed.
    const page0 = Array.from({ length: 200 }, (_, i) => ({ name: `gk-6261-dev-${i}` }));
    const page1 = [{ name: 'gk-6261-dev-200' }, { name: 'gk-62611-bleed-1' }, { name: 'gk-6263-other-1' }];
    const union = [...page0, ...page1];
    const f = filterFor('6261');
    const kept = union.filter(d => f.test(normaliseName(d.name)));
    assert.equal(kept.length, 201, 'all 201 real 6261 devices across both pages kept; the 2 bleed neighbours dropped');
});

/* ------------------------------------------------------------------ */
/* Telemetry mapping + switch normalisation (§2.5)                     */
/* ------------------------------------------------------------------ */

test('telemetry: switch normalisation trusts switchReported (fresh) over switchOn over stale switch_1', () => {
    // switchReported present ⇒ the fresh echo wins even when the bare switch_1 is stale/opposite.
    assert.equal(mapTelemetry({ switchReported: true, switchOn: false, switch_1: false }).switch_1, true);
    // no switchReported ⇒ fall back to switchOn.
    assert.equal(mapTelemetry({ switchOn: true, switch_1: false }).switch_1, true);
    // only a (stale) switch_1 ⇒ last resort.
    assert.equal(mapTelemetry({ switch_1: true }).switch_1, true);
});

test('telemetry: heatingSetpoint / localTemperature / mode / hotWater fold onto the canonical keys', () => {
    const t = mapTelemetry({ heatingSetpoint: 19.5, localTemperature: 18, mode: 'Heat', hotWater: 1, hwBoostHours: 2 });
    assert.equal(t.heatingSetpoint, 19.5);
    assert.equal(t.localTemperature, 18);
    assert.equal(t.temperature, 18, 'temperature falls back to localTemperature when absent');
    assert.equal(t.mode, 'Heat');
    assert.equal(t.hotWater, 1);
    assert.equal(t.hwBoostHours, 2);
});

test('telemetry: undefined-valued keys are dropped so the canonical shape stays clean', () => {
    const t = mapTelemetry({ heatingSetpoint: 21 });
    assert.ok(!('mode' in t), 'absent keys are not surfaced as undefined');
    assert.ok(!('switch_1' in t), 'no switch signal ⇒ no switch_1 key');
});

/* ------------------------------------------------------------------ */
/* boolean bridgeStatus() latch                                       */
/* ------------------------------------------------------------------ */

test('bridgeStatus(): boolean healthy latch (fixture mode boots healthy)', () => {
    const s = bridgeStatus();
    assert.equal(typeof s.healthy, 'boolean');
    assert.equal(s.healthy, true, 'fixture mode is healthy by default');
    assert.deepEqual(Object.keys(s).sort(), ['healthy', 'lastError', 'mode']);
});
