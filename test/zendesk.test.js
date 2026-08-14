/**
 * OOHDASH-2 (B7) — Zendesk auth header unit tests.
 *
 * This Zendesk account authenticates ONLY with classic `email/token` Basic auth. Verified live
 * 14 Aug 2026 (read-only GET /users/me.json): the classic 40-char API token via Basic → 200; a
 * Bearer call → 401 even with that same good token (this account rejects Bearer entirely). The
 * `scapi_` token in the earlier handover turned out to be for a different system. So the client
 * uses Basic — matching the IoT Support Dash — NOT Bearer.
 *
 * These assert header SHAPE only (pure `buildAuthHeader(cfg)`); the token's live validity is
 * proven separately by the 401→200 read check above. Behaviour-only; runs under `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthHeader } from '../services/zendesk.js';

const cfg = { zendesk: { subdomain: 'theairedalegroup', email: 'ops@example.com', apiToken: 'CLASSICtoken123' } };
const expectedBasic = 'Basic ' + Buffer.from('ops@example.com/token:CLASSICtoken123').toString('base64');

test('authorization uses classic email/token Basic auth', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h.Authorization, expectedBasic);
});

test('authorization does NOT use the Bearer scheme (this account rejects Bearer)', () => {
    const h = buildAuthHeader(cfg);
    assert.ok(!h.Authorization.startsWith('Bearer'), `expected Basic auth, got: ${h.Authorization}`);
});

test('the credential pair is base64-encoded, not sent verbatim', () => {
    const h = buildAuthHeader(cfg);
    assert.ok(!h.Authorization.includes('CLASSICtoken123'), 'raw token must not appear — Basic base64-encodes it');
    assert.ok(h.Authorization.includes(Buffer.from('ops@example.com/token:CLASSICtoken123').toString('base64')));
});

test('the email IS part of the header (Basic uses email/token)', () => {
    const h = buildAuthHeader(cfg);
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString();
    assert.equal(decoded, 'ops@example.com/token:CLASSICtoken123');
});

test('content-type stays application/json', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h['Content-Type'], 'application/json');
});
