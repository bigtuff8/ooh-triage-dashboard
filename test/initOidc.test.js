/**
 * F01/F07 — initOidc contract test (SD-586).
 *
 * initOidc() discovers the OIDC issuer as a PUBLIC client (two-arg discovery(), no secret).
 * The deterministic, offline-provable contract is that it is a strict no-op when
 * AUTH_MODE!=='oidc' (dev/fixture) — it must not attempt discovery or throw. The actual
 * public-client token exchange (token_endpoint_auth_method='none') requires the real B2C
 * tenant and is proven at the CANARY (§6.5 / verification matrix step 2), not in fixture
 * mode — asserting "builds without throwing" here would not prove the auth method, so we
 * do not fake that assertion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('initOidc is a no-op (no throw) when AUTH_MODE is not oidc', async () => {
    delete process.env.AUTH_MODE;
    process.env.AUTH_MODE = 'dev';
    const { initOidc } = await import('../services/auth.js?v=initoidc1');
    await assert.doesNotReject(() => initOidc());
});

test('initOidc and mapRole are exported as functions', async () => {
    const mod = await import('../services/auth.js?v=initoidc2');
    assert.equal(typeof mod.initOidc, 'function');
    assert.equal(typeof mod.mapRole, 'function');
});
