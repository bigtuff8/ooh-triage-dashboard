/**
 * OOHDASH-2 (B7) — Zendesk auth header unit tests.
 *
 * The token Spencer loaded into `ooh-dashboard-secrets` is a `scapi_` OAuth-style token,
 * so the client authenticates with `Authorization: Bearer <token>` rather than the classic
 * `email/token` Basic scheme (DEPLOY_RUNBOOK RB-2's "Basic/API token" wording is superseded).
 *
 * These assert header SHAPE only (pure `buildAuthHeader(cfg)`); the token's live validity/scopes
 * are proven separately by a 401→200 check against Zendesk post-deploy (OOHDASH-4).
 * Behaviour-only; runs under `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthHeader } from '../services/zendesk.js';

const cfg = { zendesk: { subdomain: 'theairedalegroup', email: 'ops@example.com', apiToken: 'scapi_TESTTOKEN123' } };

test('authorization uses the Bearer scheme with the raw token', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h.Authorization, 'Bearer scapi_TESTTOKEN123');
});

test('authorization does NOT use the classic Basic scheme', () => {
    const h = buildAuthHeader(cfg);
    assert.ok(!h.Authorization.startsWith('Basic'), `expected non-Basic auth, got: ${h.Authorization}`);
});

test('the token is sent verbatim — not base64-encoded (Bearer ≠ Basic)', () => {
    const h = buildAuthHeader(cfg);
    // A Basic header would base64 the email/token pair; Bearer carries the token as-is.
    assert.ok(h.Authorization.includes('scapi_TESTTOKEN123'));
    assert.ok(!h.Authorization.includes(Buffer.from('ops@example.com/token:scapi_TESTTOKEN123').toString('base64')));
});

test('the email is not consumed by the header (Basic-only field)', () => {
    const h = buildAuthHeader({ zendesk: { apiToken: 'scapi_XYZ' } }); // no email present
    assert.equal(h.Authorization, 'Bearer scapi_XYZ');
});

test('content-type stays application/json', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h['Content-Type'], 'application/json');
});
