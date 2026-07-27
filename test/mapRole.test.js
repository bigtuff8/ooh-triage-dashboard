/**
 * F02/F07 — mapRole unit tests (SD-586).
 *
 * extension_Role arrives from B2C as a JSON STRING of an AreaClaim[] (array of objects
 * keyed on claimArea int). These tests assert the real shapes plus every malformed/legacy
 * edge, and the deterministic iot>handler precedence for dual-claim users (CT AD-01).
 *
 * Behaviour-only: no source inspection. Runs under `node --test` (no browser, no live systems).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRole } from '../services/auth.js';

// The realistic B2C shape: extension_Role is a serialised array of AreaClaim objects.
const roleClaim = 'extension_Role';
const serialised = (...areas) => ({ [roleClaim]: JSON.stringify(areas.map(a => ({ claimArea: a, claimGroup: 0, claimPermission: 0 }))) });

test('claimArea 1500 (Zendesk/OOH) → handler', () => {
    assert.equal(mapRole(serialised(1500)), 'handler');
});

test('claimArea 1400 (IoT) → iot', () => {
    assert.equal(mapRole(serialised(1400)), 'iot');
});

test('dual claim 1500 + 1400 → iot (deterministic precedence, not array order)', () => {
    assert.equal(mapRole(serialised(1500, 1400)), 'iot');
    assert.equal(mapRole(serialised(1400, 1500)), 'iot', 'order must not change the result');
});

test('claim with neither known area → null (drives the 403 path)', () => {
    assert.equal(mapRole(serialised(9999)), null);
});

test('malformed JSON string → null (must not throw)', () => {
    assert.equal(mapRole({ [roleClaim]: '{not valid json' }), null);
});

test('missing role claim → null (must not throw)', () => {
    assert.equal(mapRole({}), null);
});

test('null / undefined claims object → null (must not throw)', () => {
    assert.equal(mapRole(null), null);
    assert.equal(mapRole(undefined), null);
});

test('empty serialised array → null', () => {
    assert.equal(mapRole({ [roleClaim]: '[]' }), null);
});

test('already-parsed array of AreaClaim objects → mapped', () => {
    assert.equal(mapRole({ [roleClaim]: [{ claimArea: 1400 }] }), 'iot');
});

test('legacy bare-int array → mapped by string coercion (must not throw)', () => {
    assert.equal(mapRole({ [roleClaim]: [1500] }), 'handler');
});

test('single object (not wrapped in an array) → mapped', () => {
    assert.equal(mapRole({ [roleClaim]: { claimArea: 1500 } }), 'handler');
});

test('object with unrelated shape → null (must not throw)', () => {
    assert.equal(mapRole({ [roleClaim]: { foo: 'bar' } }), null);
});
