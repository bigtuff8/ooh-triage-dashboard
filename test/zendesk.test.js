/**
 * OOHDASH-2 (B7) — Zendesk auth header unit tests.
 *
 * OOH uses the standard Zendesk API-token Basic scheme: Basic base64(email/token:apiToken),
 * where the username is the account email with a literal `/token` suffix and the credential is
 * ZENDESK_API_TOKEN — the same auth the rest of the Airedale Zendesk estate uses. (An earlier build
 * briefly used plain email:password; that was reverted.) Bearer is not used (this account rejects it).
 *
 * These assert header SHAPE only (pure `buildAuthHeader(cfg)`); the credential's live validity is
 * proven separately. Behaviour-only; runs under `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthHeader } from '../services/zendesk.js';

const cfg = { zendesk: { subdomain: 'theairedalegroup', email: 'ops@example.com', apiToken: 'AbC123tok' } };
const expectedBasic = 'Basic ' + Buffer.from('ops@example.com/token:AbC123tok').toString('base64');

test('authorization uses email/token:apiToken Basic auth', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h.Authorization, expectedBasic);
});

test('authorization uses the classic email/token suffix', () => {
    const h = buildAuthHeader(cfg);
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString();
    assert.ok(decoded.includes('/token:'), `must use /token: suffix, got: ${decoded}`);
});

test('authorization does NOT use the Bearer scheme (this account rejects Bearer)', () => {
    const h = buildAuthHeader(cfg);
    assert.ok(!h.Authorization.startsWith('Bearer'), `expected Basic auth, got: ${h.Authorization}`);
});

test('the credential pair is base64-encoded, not sent verbatim', () => {
    const h = buildAuthHeader(cfg);
    assert.ok(!h.Authorization.includes('AbC123tok'), 'raw token must not appear — Basic base64-encodes it');
    assert.ok(h.Authorization.includes(Buffer.from('ops@example.com/token:AbC123tok').toString('base64')));
});

test('the decoded credential is exactly email/token:apiToken', () => {
    const h = buildAuthHeader(cfg);
    const decoded = Buffer.from(h.Authorization.replace('Basic ', ''), 'base64').toString();
    assert.equal(decoded, 'ops@example.com/token:AbC123tok');
});

test('content-type stays application/json', () => {
    const h = buildAuthHeader(cfg);
    assert.equal(h['Content-Type'], 'application/json');
});
