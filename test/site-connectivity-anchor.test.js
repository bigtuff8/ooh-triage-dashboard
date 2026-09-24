/**
 * OOHDASH-91 G2 — site-reachability anchor selection + equipment-group label extraction.
 *
 * Proves the two pure, read-only helpers that the connectivity flow consumes:
 *   - siteConnectivityAnchor(devices): segment-EQUALITY on the `lwgateway` token (NOT substring), so the
 *     LoRaWAN hub is the anchor and none of the -r10a / Salus-hub gateways can pose as it; null when no
 *     lwgateway is present (gateway-less site); deterministic first-by-sorted-name for the pathological
 *     >1-lwgateway case; the loser lwgateway fronts no equipment group (excluded from enumeration).
 *   - equipmentGroupLabel(device): the exact segment-immediately-before-the-gateway-token rule mapped via
 *     the lookup (boiler→"boiler", maindb→"main distribution board", kitchen→"kitchen", salusit700→
 *     "heating"); unknown token → the safe generic "the equipment group"; NEVER the raw namespace token.
 *
 * node --test style; runs under `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';

const { siteConnectivityAnchor, equipmentGroupLabel } = await import('../services/tb-device.js');

// A 6770-shaped multi-gateway site: one LoRaWAN hub + three equipment-group gateways.
const multiGatewaySite = () => [
    { name: 'gk-6770-lwgateway-1', kind: 'gateway', online: true },
    { name: 'gk-6770-boiler-r10a-1', kind: 'gateway', online: true },
    { name: 'gk-6770-maindb-r10a-1', kind: 'gateway', online: true },
    { name: 'gk-6770-salusit700-gateway-1', kind: 'gateway', online: true },
    { name: 'gk-6770-fryer-1', kind: 'kitchen', online: true }
];

/* ---------------- siteConnectivityAnchor ---------------- */

test('anchor: returns exactly the lwgateway device from a multi-gateway site (segment-equality)', () => {
    const anchor = siteConnectivityAnchor(multiGatewaySite());
    assert.ok(anchor, 'an anchor must be selected');
    assert.equal(anchor.name, 'gk-6770-lwgateway-1');
});

test('anchor: the -r10a and Salus-hub gateways are NOT the anchor (segment-equality, not substring)', () => {
    const anchor = siteConnectivityAnchor(multiGatewaySite());
    assert.notEqual(anchor.name, 'gk-6770-boiler-r10a-1');
    assert.notEqual(anchor.name, 'gk-6770-maindb-r10a-1');
    assert.notEqual(anchor.name, 'gk-6770-salusit700-gateway-1');
});

test('anchor: substring containing "lwgateway" inside a larger segment does NOT match (segment-equality)', () => {
    // `xlwgatewayx` contains the token as a substring but is not a standalone segment → not an anchor.
    const anchor = siteConnectivityAnchor([
        { name: 'gk-6770-xlwgatewayx-1', kind: 'gateway', online: true },
        { name: 'gk-6770-boiler-r10a-1', kind: 'gateway', online: true }
    ]);
    assert.equal(anchor, null, 'a substring-only match must not be treated as the lwgateway anchor');
});

test('anchor: returns null when no lwgateway device is present (gateway-less site, e.g. 5198)', () => {
    const gatewayLess = [
        { name: 'gk-5198-salusit500-1', kind: 'heating', online: true },
        { name: 'gk-5198-salusit500-2', kind: 'heating', online: true }
    ];
    assert.equal(siteConnectivityAnchor(gatewayLess), null);
});

test('anchor: null-safe on empty / undefined input', () => {
    assert.equal(siteConnectivityAnchor([]), null);
    assert.equal(siteConnectivityAnchor(undefined), null);
});

test('anchor: two lwgateway devices → deterministic first by sorted normalised name', () => {
    const twoHubs = [
        { name: 'gk-6770-lwgateway-2', kind: 'gateway', online: false },
        { name: 'gk-6770-lwgateway-1', kind: 'gateway', online: true },
        { name: 'gk-6770-boiler-r10a-1', kind: 'gateway', online: true }
    ];
    // sorted normalised names: ...lwgateway-1 sorts before ...lwgateway-2 → the -1 device is the anchor.
    assert.equal(siteConnectivityAnchor(twoHubs).name, 'gk-6770-lwgateway-1');
    // Order-independent: shuffling the input yields the same deterministic choice.
    const shuffled = [twoHubs[1], twoHubs[2], twoHubs[0]];
    assert.equal(siteConnectivityAnchor(shuffled).name, 'gk-6770-lwgateway-1');
});

test('anchor: reads the name off `deviceId` when there is no `name` (client-shaped device model)', () => {
    // Client devices carry the TB name on `deviceId` (mapTbDevice returns deviceId:name).
    const clientShaped = [
        { deviceId: 'gk-6770-lwgateway-1', kind: 'gateway', online: true },
        { deviceId: 'gk-6770-boiler-r10a-1', kind: 'gateway', online: true }
    ];
    assert.equal(siteConnectivityAnchor(clientShaped).deviceId, 'gk-6770-lwgateway-1');
});

test('anchor >1 loser: the non-chosen lwgateway fronts no equipment group (excluded from enumeration)', () => {
    // A spare lwgateway must contribute to neither the anchor claim nor any group-offline outcome.
    assert.equal(equipmentGroupLabel({ name: 'gk-6770-lwgateway-2' }), null);
});

/* ---------------- equipmentGroupLabel (segment-extraction rule) ---------------- */

test('group label: boiler-r10a → "boiler" (segment immediately before the r10a token)', () => {
    assert.equal(equipmentGroupLabel({ name: 'gk-6770-boiler-r10a-1' }), 'boiler');
});

test('group label: maindb-r10a → "main distribution board"', () => {
    assert.equal(equipmentGroupLabel({ name: 'gk-6770-maindb-r10a-1' }), 'main distribution board');
});

test('group label: kitchen-r10a → "kitchen"', () => {
    assert.equal(equipmentGroupLabel({ name: 'gk-6770-kitchen-r10a-1' }), 'kitchen');
});

test('group label: Salus hub salusit700-gateway → "heating" (segment before the literal gateway token)', () => {
    assert.equal(equipmentGroupLabel({ name: 'gk-6770-salusit700-gateway-1' }), 'heating');
});

test('group label: unknown equipment token → safe generic "the equipment group", NEVER the raw token', () => {
    const label = equipmentGroupLabel({ name: 'gk-6770-voltopt-r10a-1' });
    assert.equal(label, 'the equipment group');
    assert.ok(!/voltopt|r10a|gk-/.test(label), 'the raw namespace token must never be rendered');
});

test('group label: a device with NO gateway token segment returns null (fronts no equipment group)', () => {
    assert.equal(equipmentGroupLabel({ name: 'gk-6770-fryer-1' }), null);
    assert.equal(equipmentGroupLabel({ name: 'gk-5198-salusit500-1' }), null);
});

test('group label: reads the name off `deviceId` too (client-shaped device model)', () => {
    assert.equal(equipmentGroupLabel({ deviceId: 'gk-6770-boiler-r10a-1' }), 'boiler');
});
