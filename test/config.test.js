/**
 * F01/F03/F07 — validateConfig unit tests (SD-586).
 *
 * Asserts the two relaxations that let the app run on Spencer's secure model:
 *   - AUTH_MODE=oidc no longer requires OIDC_CLIENT_SECRET (public PKCE client, F01)
 *   - DATA_MODE=live no longer requires COSMOS_KEY (keyless via workload identity, F03)
 * while confirming the still-mandatory fields and the production fail-secure rules are intact.
 *
 * config.js reads process.env at import time and builds a frozen `config`, so each scenario
 * imports a fresh module instance (cache-busting query) after setting the environment.
 * Behaviour-only; runs under `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Environment keys config.js reads that we must control per scenario.
const MANAGED = [
    'NODE_ENV', 'AUTH_MODE', 'DATA_MODE', 'SESSION_SECRET', 'APP_ORIGIN', 'IOT_DASH_BASE_URL',
    'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET',
    'BRIDGE_BASE_URL', 'TB_WRITE_USERNAME', 'TB_WRITE_PASSWORD', 'COSMOS_ENDPOINT', 'COSMOS_KEY'
];

let importCounter = 0;

/** Loads a fresh config module with exactly the supplied environment, returning validateConfig()'s problems. */
async function problemsFor(overrides) {
    for (const k of MANAGED) delete process.env[k];
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    const mod = await import(`../config.js?v=${++importCounter}`);
    return mod.validateConfig();
}

// A complete, valid production environment on the SECURE model (no client secret, no cosmos key).
const validProdSecureModel = {
    NODE_ENV: 'production', AUTH_MODE: 'oidc', DATA_MODE: 'live',
    SESSION_SECRET: 'x', APP_ORIGIN: 'https://ooh.airedale-group.io',
    IOT_DASH_BASE_URL: 'https://zendesk-uat.airedale-api.co.uk',
    OIDC_ISSUER: 'https://tenant.b2clogin.com/tenant/policy/v2.0', OIDC_CLIENT_ID: 'beb991e8',
    BRIDGE_BASE_URL: 'http://integration-bridge.iot-services.svc.cluster.local',
    TB_WRITE_USERNAME: 'u', TB_WRITE_PASSWORD: 'p', COSMOS_ENDPOINT: 'https://cosmos'
};

test('secure prod model (no OIDC_CLIENT_SECRET, no COSMOS_KEY) is fully valid', async () => {
    const problems = await problemsFor(validProdSecureModel);
    assert.deepEqual(problems, [], `expected no problems, got: ${JSON.stringify(problems)}`);
});

test('OIDC_CLIENT_SECRET is not required for AUTH_MODE=oidc (F01)', async () => {
    const problems = await problemsFor({ AUTH_MODE: 'oidc', OIDC_ISSUER: 'https://i', OIDC_CLIENT_ID: 'c' });
    assert.ok(!problems.some(p => p.includes('OIDC_CLIENT_SECRET')), `secret should not be flagged: ${JSON.stringify(problems)}`);
});

test('OIDC_ISSUER and OIDC_CLIENT_ID are still required for AUTH_MODE=oidc', async () => {
    const problems = await problemsFor({ AUTH_MODE: 'oidc' });
    assert.ok(problems.some(p => p.includes('OIDC_ISSUER') && p.includes('OIDC_CLIENT_ID')));
});

test('COSMOS_KEY is not required for DATA_MODE=live (F03)', async () => {
    const problems = await problemsFor({ DATA_MODE: 'live', COSMOS_ENDPOINT: 'https://c', BRIDGE_BASE_URL: 'http://b', TB_WRITE_USERNAME: 'u', TB_WRITE_PASSWORD: 'p' });
    assert.ok(!problems.some(p => p.includes('COSMOS_KEY')), `COSMOS_KEY should not be flagged: ${JSON.stringify(problems)}`);
});

test('COSMOS_ENDPOINT is still required for DATA_MODE=live', async () => {
    const problems = await problemsFor({ DATA_MODE: 'live', BRIDGE_BASE_URL: 'http://b', TB_WRITE_USERNAME: 'u', TB_WRITE_PASSWORD: 'p' });
    assert.ok(problems.some(p => p.includes('COSMOS_ENDPOINT')));
});

test('TB write credentials are still required for DATA_MODE=live (SR-3, unchanged)', async () => {
    const problems = await problemsFor({ DATA_MODE: 'live', COSMOS_ENDPOINT: 'https://c', BRIDGE_BASE_URL: 'http://b' });
    assert.ok(problems.some(p => p.includes('TB_WRITE_USERNAME')));
});

test('production fail-secure: AUTH_MODE=dev is rejected in production', async () => {
    const problems = await problemsFor({ ...validProdSecureModel, AUTH_MODE: 'dev' });
    assert.ok(problems.some(p => p.includes('AUTH_MODE must be "oidc" in production')));
});

test('production fail-secure: IOT_DASH_BASE_URL must be set explicitly (AD-04, unchanged)', async () => {
    const { IOT_DASH_BASE_URL, ...noHost } = validProdSecureModel;
    const problems = await problemsFor(noHost);
    assert.ok(problems.some(p => p.includes('IOT_DASH_BASE_URL')));
});
