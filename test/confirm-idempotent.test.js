/**
 * OOHDASH-164 Stage 1 — Q4 confirm idempotency unit tests (design §4).
 *
 * Proves:
 *   I1  Five rapid confirmSite calls for the same operator+site return the SAME token.
 *   I2  A different operator gets a different token.
 *   I3  A different siteNo for the same operator gets a different token.
 *   I4  The idempotency cache key is operator+site (not just site).
 *
 * Uses fixture mode so bridge.getSitesByNumber resolves from the fixture file (no TB needed).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'fixture';
process.env.THINGSBOARD_URL = 'http://tb.test';
process.env.THINGSBOARD_READ_USERNAME = 'r@test';
process.env.THINGSBOARD_READ_PASSWORD = 'rp';
process.env.THINGSBOARD_WRITE_USERNAME = 'w@test';
process.env.THINGSBOARD_WRITE_PASSWORD = 'wp';
process.env.COSMOS_URL = 'https://cosmos.test/';
process.env.COSMOS_KEY = 'dGVzdGtleQ==';
process.env.COSMOS_DATABASE = 'testdb';

const { confirmSite } = await import('../services/resolution.js');

const OP_A = { id: 'op-alice', name: 'Alice' };
const OP_B = { id: 'op-bob',   name: 'Bob'   };
const SITE = '6832';    // exists in bridge-devices.json fixture
const SITE2 = '6218';   // second fixture site

test('I1: five rapid confirmSite calls return the same token (Q4 idempotency)', async () => {
    const results = await Promise.all([
        confirmSite(SITE, OP_A),
        confirmSite(SITE, OP_A),
        confirmSite(SITE, OP_A),
        confirmSite(SITE, OP_A),
        confirmSite(SITE, OP_A)
    ]);
    const tokens = results.map(r => r.token);
    // All 5 must return the same token
    assert.ok(tokens.every(t => t === tokens[0]),
        `Expected all tokens to be identical, got: ${tokens.join(', ')}`);
    // The token must be a UUID (non-empty)
    assert.match(tokens[0], /^[0-9a-f-]{36}$/, 'Token must be a UUID');
});

test('I2: different operator gets a different token', async () => {
    const rA = await confirmSite(SITE, OP_A);
    const rB = await confirmSite(SITE, OP_B);
    assert.notEqual(rA.token, rB.token, 'Different operators must get different tokens');
});

test('I3: different siteNo for same operator gets a different token', async () => {
    const r1 = await confirmSite(SITE,  OP_A);
    const r2 = await confirmSite(SITE2, OP_A);
    assert.notEqual(r1.token, r2.token, 'Different sites must get different tokens');
});

test('I4: idempotency is per operator+site (not just site)', async () => {
    // Both A and B confirm the same site — they should each get different tokens
    const rA1 = await confirmSite(SITE, OP_A);
    const rB1 = await confirmSite(SITE, OP_B);
    // A confirms again — same token as first A
    const rA2 = await confirmSite(SITE, OP_A);
    assert.equal(rA1.token, rA2.token, 'Same operator+site must return same token within TTL');
    assert.notEqual(rA1.token, rB1.token, 'Different operators must have different tokens');
});
