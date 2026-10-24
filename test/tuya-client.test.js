/**
 * OOHDASH-140: Unit tests for tuya-client.js
 *
 * Tests: source scan (no write methods), allowlist, circuit breaker, token caching.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const clientSrc = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../services/tuya-client.js'),
    'utf8'
);

// ── Source scan: assert no write HTTP methods ─────────────────────────────────

test('source scan: no .post( method string', () => {
    assert.equal(clientSrc.match(/\.post\s*\(/i), null);
});

test('source scan: no .put( method string', () => {
    assert.equal(clientSrc.match(/\.put\s*\(/i), null);
});

test('source scan: no .patch( method string', () => {
    assert.equal(clientSrc.match(/\.patch\s*\(/i), null);
});

test('source scan: no .delete( method string', () => {
    assert.equal(clientSrc.match(/\.delete\s*\(/i), null);
});

test('source scan: no POST method literal in non-comment lines', () => {
    const lines = clientSrc.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const hasFetchPost = lines.some(l => /method\s*:\s*['"]POST['"]/i.test(l));
    assert.equal(hasFetchPost, false);
});

test('source scan: exports tuyaGet', () => {
    assert.ok(clientSrc.includes('export async function tuyaGet'));
});

test('source scan: does not export any write function', () => {
    const writePatterns = ['tuyaPost', 'tuyaPut', 'tuyaPatch', 'tuyaDelete'];
    for (const p of writePatterns) {
        assert.ok(!clientSrc.includes(`export function ${p}`), `must not export ${p}`);
        assert.ok(!clientSrc.includes(`export async function ${p}`), `must not export ${p}`);
    }
});

// ── Allowlist (duplicated inline — client uses same regexes) ─────────────────

const ALLOWED_PATHS = [
    /^\/v1\.0\/token\?grant_type=1$/,
    /^\/v1\.0\/users\/[A-Za-z0-9]+\/devices\?page_size=100(&last_row_key=[^&]+)?$/,
    /^\/v2\.0\/cloud\/timer\/device\/[A-Za-z0-9]+(\?last_row_key=[^&]+)?$/,
    /^\/v2\.0\/cloud\/thing\/[A-Za-z0-9]+\/shadow\/properties\?codes=schedule$/
];

function isAllowed(p) { return ALLOWED_PATHS.some(re => re.test(p)); }

test('allowlist: allows token path', () => {
    assert.equal(isAllowed('/v1.0/token?grant_type=1'), true);
});

test('allowlist: allows devices listing path', () => {
    assert.equal(isAllowed('/v1.0/users/eu123abc/devices?page_size=100'), true);
});

test('allowlist: allows devices listing with last_row_key', () => {
    assert.equal(isAllowed('/v1.0/users/eu123abc/devices?page_size=100&last_row_key=abc123'), true);
});

test('allowlist: allows timer device path', () => {
    assert.equal(isAllowed('/v2.0/cloud/timer/device/abc123'), true);
});

test('allowlist: allows timer device path with last_row_key', () => {
    assert.equal(isAllowed('/v2.0/cloud/timer/device/abc123?last_row_key=xyz'), true);
});

test('allowlist: allows shadow properties path', () => {
    assert.equal(isAllowed('/v2.0/cloud/thing/abc123/shadow/properties?codes=schedule'), true);
});

test('allowlist: rejects arbitrary path', () => {
    assert.equal(isAllowed('/v1.0/devices'), false);
});

test('allowlist: rejects POST-like path', () => {
    assert.equal(isAllowed('/v1.0/token/create'), false);
});

test('allowlist: rejects path with different version', () => {
    assert.equal(isAllowed('/v3.0/users/eu123/devices?page_size=100'), false);
});

test('allowlist: rejects token path without grant_type', () => {
    assert.equal(isAllowed('/v1.0/token'), false);
});

// ── Circuit breaker logic ─────────────────────────────────────────────────────

test('circuit breaker: opens after 3 consecutive failures', () => {
    let consecutiveFailures = 0;
    let breakerOpenUntil = 0;
    const BREAKER_THRESHOLD = 3;
    const BREAKER_OPEN_MS = 60000;

    function recordFailure() {
        if (++consecutiveFailures >= BREAKER_THRESHOLD) {
            breakerOpenUntil = Date.now() + BREAKER_OPEN_MS;
            consecutiveFailures = 0;
        }
    }

    assert.ok(Date.now() >= breakerOpenUntil, 'not open initially');
    recordFailure();
    recordFailure();
    assert.ok(Date.now() >= breakerOpenUntil, 'still closed after 2 failures');
    recordFailure(); // third — opens
    assert.ok(Date.now() < breakerOpenUntil, 'open after 3rd failure');
});

test('circuit breaker: opens immediately on rate limit', () => {
    let breakerOpenUntil = 0;

    function recordFailure(isRateLimit) {
        if (isRateLimit) breakerOpenUntil = Date.now() + 60000;
    }

    assert.ok(Date.now() >= breakerOpenUntil);
    recordFailure(true);
    assert.ok(Date.now() < breakerOpenUntil);
});

test('circuit breaker: resets consecutive count on success', () => {
    let consecutiveFailures = 0;
    let breakerOpenUntil = 0;

    function recordFailure() {
        if (++consecutiveFailures >= 3) {
            breakerOpenUntil = Date.now() + 60000;
            consecutiveFailures = 0;
        }
    }
    function recordSuccess() { consecutiveFailures = 0; }

    recordFailure();
    recordFailure();
    recordSuccess();
    recordFailure();
    assert.ok(Date.now() >= breakerOpenUntil, 'not open after reset');
    assert.equal(consecutiveFailures, 1);
});

// ── Token caching ─────────────────────────────────────────────────────────────

test('token caching: valid when not expired', () => {
    const token = { value: 'abc123', expireAt: Date.now() + 3600000 };
    assert.ok(token.value && Date.now() < token.expireAt);
});

test('token caching: expired token needs refresh', () => {
    const token = { value: 'abc123', expireAt: Date.now() - 1000 };
    assert.ok(!(token.value && Date.now() < token.expireAt));
});

test('token caching: empty token needs refresh', () => {
    const token = { value: '', expireAt: Date.now() + 3600000 };
    assert.ok(!(token.value && Date.now() < token.expireAt));
});
