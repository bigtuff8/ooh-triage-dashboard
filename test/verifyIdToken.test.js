/**
 * F01/F07 — id_token validation unit tests (implicit sign-in, SD-586).
 *
 * The implicit id_token flow's security boundary is verifyIdToken(): it must accept a correctly
 * signed token whose iss/aud/exp/nbf, state (CSRF) and nonce (replay) all match, and reject every
 * failure of those. We sign tokens locally with a throwaway RS256 key and inject the public key as
 * the verification key set, so the happy path AND the tamper/replay paths are provable fully offline
 * (no B2C tenant, no network). Runs under `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyIdToken } from '../services/auth.js';

const ISSUER = 'https://tenant.b2clogin.com/tenant/policy/v2.0';
const CLIENT_ID = 'beb991e8-69d0-4fef-9c8e-e85793ceee75';
const STATE = 'the-expected-state';
const NONCE = 'the-expected-nonce';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const { privateKey: otherPrivateKey } = await generateKeyPair('RS256'); // an attacker's key

async function signToken({ signer = privateKey, iss = ISSUER, aud = CLIENT_ID, nonce = NONCE, exp = '5m', extra = {} } = {}) {
    return new SignJWT({ nonce, sub: 'user-123', name: 'Test Operator', ...extra })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(iss)
        .setAudience(aud)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(signer);
}

const base = { expectedState: STATE, actualState: STATE, expectedNonce: NONCE, keySet: publicKey, issuer: ISSUER, clientId: CLIENT_ID };

test('happy path: valid signature + iss/aud/exp + state + nonce → ok with claims', async () => {
    const token = await signToken();
    const r = await verifyIdToken(token, base);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.claims.sub, 'user-123');
    assert.equal(r.claims.nonce, NONCE);
});

test('replayed/forged nonce (token nonce != expected) → rejected', async () => {
    const token = await signToken({ nonce: 'a-different-nonce' });
    const r = await verifyIdToken(token, base);
    assert.equal(r.ok, false);
    assert.match(r.reason, /nonce/);
});

test('state mismatch (CSRF) → rejected before signature is even trusted', async () => {
    const token = await signToken();
    const r = await verifyIdToken(token, { ...base, actualState: 'attacker-state' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /state/);
});

test('bad signature (signed by a different key) → rejected', async () => {
    const token = await signToken({ signer: otherPrivateKey });
    const r = await verifyIdToken(token, base);
    assert.equal(r.ok, false);
    assert.match(r.reason, /jwt verification failed/);
});

test('wrong audience → rejected', async () => {
    const token = await signToken({ aud: 'some-other-client' });
    const r = await verifyIdToken(token, base);
    assert.equal(r.ok, false);
    assert.match(r.reason, /jwt verification failed/);
});

test('wrong issuer → rejected', async () => {
    const token = await signToken({ iss: 'https://evil.example.com/v2.0' });
    const r = await verifyIdToken(token, base);
    assert.equal(r.ok, false);
    assert.match(r.reason, /jwt verification failed/);
});

test('expired token → rejected', async () => {
    const token = await signToken({ exp: '-1m' });
    const r = await verifyIdToken(token, base);
    assert.equal(r.ok, false);
    assert.match(r.reason, /jwt verification failed/);
});

test('missing id_token → rejected without throwing', async () => {
    const r = await verifyIdToken(undefined, base);
    assert.equal(r.ok, false);
    assert.match(r.reason, /missing id_token/);
});
