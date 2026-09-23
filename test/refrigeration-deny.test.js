/**
 * Refrigeration switch-deny INTEGRATION tests (Stream A / OOHDASH-19, design §8.3).
 *
 * classify → map → capabilities/scope, end to end through the real service functions:
 *   - mapTbDevice serialises a cellar+switch device as refrigeration/fridge with capabilities:[];
 *   - the Kitchen scope tile does NOT light up (ctl) on a cellar-only site;
 *   - precision at the payload: a real fryer + cellar cooling + cellar light coexist correctly;
 *   - the CR3 profile-populate enforcement (fails once the probe artefact lands but REFRIG_PROFILES
 *     is left empty/incomplete);
 *   - the tightening-safety fixture (every known controllable cellar circuit still classifies
 *     controllable under the tightened override set);
 *   - the appliance-absolutism assumption is intentional and frozen.
 *
 * node --test style; runs under `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

process.env.DATA_MODE = 'fixture';

const { mapTbDevice, classifyDevice, REFRIG_PROFILES } = await import('../services/tb-device.js');
const registry = await import('../services/registry.js');
const { SCOPE_GROUPS } = await import('../routes/api.js');

const capsFor = deviceType => registry.capabilitiesFor(deviceType)?.commands || [];
const kitchenTile = site => SCOPE_GROUPS.find(g => g.key === 'kitchen').level(site);
const lightingTile = site => SCOPE_GROUPS.find(g => g.key === 'lighting').level(site);

/* ------------------------------------------------------------------ */
/* Serialisation: classify → map → capabilities                        */
/* ------------------------------------------------------------------ */

test('serialisation: mapTbDevice on a cellar+switch raw device → refrigeration/fridge, capabilities:[]', () => {
    const d = mapTbDevice({ name: 'gk-6261-cellar-1', type: 'default', telemetry: { switch_1: true, temperature: 6.4 } });
    assert.equal(d.deviceType, 'refrigeration');
    assert.equal(d.kind, 'fridge');
    assert.equal(d.deviceTypeLabel, 'Refrigeration (monitor-only)');
    // The workspace payload derives capabilities purely from the type (routes/api.js:154).
    assert.deepEqual(capsFor(d.deviceType), [], 'capabilities must be empty ⇒ no Turn OFF button, write guard rejects');
});

/* ------------------------------------------------------------------ */
/* Scope tiles do not light up for a cellar cooling unit               */
/* ------------------------------------------------------------------ */

test('scope: a cellar-only site (only switch-bearing device is a cellar cooling unit) keeps the Kitchen tile off ctl', () => {
    const cellar = mapTbDevice({ name: 'gk-6261-cellar-1', type: 'default', telemetry: { switch_1: true } });
    const site = { devices: [cellar] };
    assert.notEqual(kitchenTile(site), 'ctl', 'the cellar cooling unit must not flip the Kitchen tile to controllable');
    // fridge kind is in no control group at all → Kitchen tile is 'none' (no kitchen kind present).
    assert.equal(kitchenTile(site), 'none');
});

test('precision at the payload: fryer + cellar cooling + cellar light coexist correctly', () => {
    const fryer = mapTbDevice({ name: 'gk-6209fryer-1', type: 'gatewayDevice', telemetry: { switch_1: true } });
    const cellarCooling = mapTbDevice({ name: 'gk-6261-cellar-1', type: 'default', telemetry: { switch_1: true } });
    const cellarLight = mapTbDevice({ name: 'gk-6261-cellar-light-1', type: 'gatewayDevice', telemetry: { switch_1: true } });
    const site = { devices: [fryer, cellarCooling, cellarLight] };

    assert.equal(kitchenTile(site), 'ctl', 'the genuine fryer keeps the Kitchen tile controllable');
    assert.equal(lightingTile(site), 'ctl', 'the cellar light keeps the Lighting tile controllable');
    assert.equal(cellarCooling.deviceType, 'refrigeration');
    assert.deepEqual(capsFor(cellarCooling.deviceType), [], 'the cellar cooling unit exposes no capabilities');
    assert.equal(fryer.deviceType, 'tuya');
    assert.equal(cellarLight.deviceType, 'tuya');
});

/* ------------------------------------------------------------------ */
/* CR3 profile-populate enforcement (blocking-finding-4)               */
/* ------------------------------------------------------------------ */

const CR3_URL = new URL('../data/cr3-cellar-profile.json', import.meta.url);
const cr3Exists = existsSync(CR3_URL);

test('CR3 profile-populate enforcement: REFRIG_PROFILES is populated & complete once the probe artefact lands',
    { skip: cr3Exists ? false : 'CR3 probe artefact (data/cr3-cellar-profile.json) not present — fail-closed name-only cover is the accepted interim (REFRIG_PROFILES stays empty)' },
    () => {
        const artefact = JSON.parse(readFileSync(CR3_URL, 'utf8'));
        const confirmed = artefact.profiles || artefact.REFRIG_PROFILES || [];
        assert.ok(REFRIG_PROFILES.length > 0, 'CR3 probe artefact exists but REFRIG_PROFILES is still empty — populate it (FIXME(CR3), design §3.3)');
        const have = REFRIG_PROFILES.map(p => String(p).toLowerCase());
        for (const p of confirmed) {
            assert.ok(have.includes(String(p).toLowerCase()), `REFRIG_PROFILES is missing the confirmed cellar profile "${p}" from the CR3 probe`);
        }
    });

/* ------------------------------------------------------------------ */
/* Tightening-safety fixture (blocking-finding-3 / §3.2, §8.1)          */
/* ------------------------------------------------------------------ */

test('tightening-safety: every KNOWN controllable cellar circuit still classifies controllable under the tightened override set', () => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/known-cellar-switch-names.json', import.meta.url), 'utf8'));
    assert.ok(Array.isArray(fixture.names) && fixture.names.length > 0, 'fixture must enumerate at least the seeded controllable cellar names');
    for (const { name, profile, telemetry } of fixture.names) {
        const c = classifyDevice(name, profile, telemetry);
        assert.equal(c.controllable, true, `${name} must remain CONTROLLABLE (tightening must not over-block a real controllable cellar circuit)`);
        assert.notEqual(c.deviceType, 'refrigeration', `${name} must not be denied to refrigeration`);
    }
});

/* ------------------------------------------------------------------ */
/* Appliance-absolutism assumption is intentional & load-bearing       */
/* ------------------------------------------------------------------ */

test('appliance-absolutism: a controllable token AFTER an appliance noun is deliberately over-blocked (fail-closed §3.2)', () => {
    // DELIBERATE: an appliance noun returns the deny with NO override consulted. This freezes the
    // behaviour as intended (not an accidental bug) and rests on the §3.2 assumption verified at CR3:
    // "no controllable circuit in the estate carries a refrigeration appliance noun in its name."
    for (const name of ['gk-6261-fridge-light-circuit', 'gk-6261-refrigeration-floor-socket']) {
        const c = classifyDevice(name, 'default', { switchReported: true });
        assert.equal(c.deviceType, 'refrigeration', `${name} is intentionally monitor-only despite the controllable token`);
        assert.equal(c.controllable, false);
    }
});
