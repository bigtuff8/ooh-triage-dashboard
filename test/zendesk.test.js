/**
 * OOHDASH-2 (B7) — Zendesk auth header unit tests.
 *
 * The platform switched OOH to plain account-password Basic auth: Basic base64(email:password),
 * where the username is the plain account email (NO `/token` suffix) and the password is
 * ZENDESK_PASSWORD. This supersedes the earlier classic `email/token` API-token scheme. Bearer is
 * still not used (this account rejects it).
 *
 * These assert header SHAPE only (pure `buildAuthHeader(cfg)`); the credential's live validity is
 * proven separately. Behaviour-only; runs under `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthHeader } from '../services/zendesk.js';

const cfg = { zendesk: { subdomain: 'theairedalegroup', email: 'ops@example.com', password: 'S3cretPass!' } };
const expectedBasic = 'Basic ' + Buffer.from('ops@example.com:S3cretPass!').toString('base64');

test('authorization uses plain email:password Basic auth', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h.Authorization, expectedBasic);
});

test('authorization does NOT use the classic email/token suffix', () => {
    const h = buildAuthHeader(cfg);
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString();
    assert.ok(!decoded.includes('/token'), `must not use /token suffix, got: ${decoded}`);
});

test('authorization does NOT use the Bearer scheme (this account rejects Bearer)', () => {
    const h = buildAuthHeader(cfg);
    assert.ok(!h.Authorization.startsWith('Bearer'), `expected Basic auth, got: ${h.Authorization}`);
});

test('the credential pair is base64-encoded, not sent verbatim', () => {
    const h = buildAuthHeader(cfg);
    assert.ok(!h.Authorization.includes('S3cretPass!'), 'raw password must not appear — Basic base64-encodes it');
    assert.ok(h.Authorization.includes(Buffer.from('ops@example.com:S3cretPass!').toString('base64')));
});

test('the decoded credential is exactly email:password', () => {
    const h = buildAuthHeader(cfg);
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString();
    assert.equal(decoded, 'ops@example.com:S3cretPass!');
});

test('content-type stays application/json', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h['Content-Type'], 'application/json');
});
