/**
 * F01/F07 — initOidc contract test (SD-586).
 *
 * initOidc() fetches the issuer's `.well-known/openid-configuration` anonymously (no secret) to
 * obtain authorization_endpoint / jwks_uri / issuer for the implicit id_token sign-in flow.
 * The deterministic, offline-provable contract is that it is a strict no-op when
 * AUTH_MODE!=='oidc' (dev/fixture) — it must not attempt discovery or throw. The live discovery +
 * id_token round trip requires the real B2C tenant and is proven at the CANARY (§6.5 / verification
 * matrix step 2), not in fixture mode; the id_token *validation* itself is covered offline in
 * verifyIdToken.test.js.
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
