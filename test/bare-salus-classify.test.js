/**
 * OOHDASH-108 (design §5, §10.1) — old-convention ("bare-salus") classification + match-bleed closure.
 *
 * Proves:
 *   - a bare-salus name (the `salus` token with no 500/700 qualifier) classifies as deviceType `salus`,
 *     NOT `salus-it700` (the defect: the glued-iT700 contained-by bleed pulled it into the iT700 row);
 *   - a glued `salusit700` name still classifies `salus-it700` (forward/exact match preserved);
 *   - a glued `salusit500` name still classifies `salus-it500`;
 *   - a `...salusit700-gateway...` name still classifies gateway (OOHDASH-82 reorder unchanged);
 *   - closing the contained-by bleed does NOT drop legitimate short-form matches in other families
 *     (fan/light/extractor exact and forward), and the tiny tokens gw/ac/lgt still do not bleed.
 *
 * node --test style; runs under `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';

const { classifyDevice } = await import('../services/tb-device.js');

/* ------------------------------ bare-salus typing ------------------------------ */

test('bare-salus: a real sweep name classifies as deviceType `salus`, not salus-it700', () => {
    // gk_wingfieldfarm_salus_STA10108576 (2026-10-06 sweep). Underscores normalise to hyphens; the
    // bare `salus` token no longer bleeds into the glued iT700 row.
    const c = classifyDevice('gk_wingfieldfarm_salus_STA10108576', 'default', { heatingSetpoint: 20 });
    assert.equal(c.kind, 'heating');
    assert.equal(c.deviceType, 'salus', 'bare-salus must type `salus`, not the iT700 default');
    assert.equal(c.controllable, true, 'a setpoint-bearing bare-salus is still controllable');
});

test('bare-salus with no telemetry still types `salus` from its name', () => {
    const c = classifyDevice('gk_wingfieldfarm_salus_STA10108576', 'default', null);
    assert.equal(c.deviceType, 'salus');
});

/* ------------------------------ glued forms unchanged ------------------------------ */

test('regression: a glued `salusit700` name still classifies salus-it700', () => {
    const c = classifyDevice('gk-6218-salusit700', 'default', { heatingSetpoint: 21 });
    assert.equal(c.deviceType, 'salus-it700');
});

test('regression: a glued `salusit500` name still classifies salus-it500', () => {
    const c = classifyDevice('gk-6218-salusit500-3', 'default', { heatingSetpoint: 20 });
    assert.equal(c.deviceType, 'salus-it500');
});

test('regression: a `salusit700-gateway` name still classifies gateway (OOHDASH-82 reorder)', () => {
    const c = classifyDevice('gk-6218-salusit700-gateway-1', 'default', null);
    assert.equal(c.kind, 'gateway');
    assert.equal(c.deviceType, 'gateway');
});

/* ------------------------------ bleed-closure regression ------------------------------ */

test('bleed closure: short-form matches in other families still resolve (fan/light/extractor)', () => {
    // Exact-token match (fan) and forward glued-form match (extractfan→fan, extractor exact) must all
    // still resolve — the contained-by restriction applies ONLY to the long glued Salus tokens.
    assert.equal(classifyDevice('gk-6261-fan-1', 'gatewayDevice', { switchReported: true }).kind, 'fan', 'exact fan');
    assert.equal(classifyDevice('gk-6261-extractfan-1', 'gatewayDevice', { switchReported: true }).kind, 'fan', 'extractfan forward→fan');
    assert.equal(classifyDevice('gk-6261-extractor-1', 'gatewayDevice', { switchReported: true }).kind, 'fan', 'extractor exact');
    assert.equal(classifyDevice('gk-6261-light-1', 'gatewayDevice', { switchReported: true }).kind, 'lighting', 'light exact');
    assert.equal(classifyDevice('gk-6261-lighting-1', 'gatewayDevice', { switchReported: true }).kind, 'lighting', 'lighting exact');
});

test('bleed closure: the tiny tokens gw/ac/lgt still do not bleed into longer names', () => {
    // gwynedd contains "gw", longer names containing "ac"/"lgt" as a substring must not match the
    // gateway/intesis rows — the ≤3-char exact-only guard is untouched by the OOHDASH-108 change.
    assert.notEqual(classifyDevice('gk-6218-gwynedd-lgt-1', 'gatewayDevice', { switchReported: true }).deviceType, 'gateway', 'gw does not bleed');
    assert.equal(classifyDevice('gk-6218-gwynedd-lgt-1', 'gatewayDevice', { switchReported: true }).kind, 'lighting', 'lgt token resolves lighting, not a bleed');
    // A name containing "ac" inside a longer token must not type intesis.
    assert.notEqual(classifyDevice('gk-6218-backroom-fan-1', 'gatewayDevice', { switchReported: true }).deviceType, 'intesis', 'ac does not bleed');
});
