/**
 * OOHDASH-148 Option C — activeReadProbe fires exactly ONE POST /api/auth/login even when
 * called concurrently with getToken() (which reuses the valid cached token instead of re-authing).
 *
 * A failed activeReadProbe() must leave the shared token and expiry UNCHANGED so concurrent
 * requests continue uninterrupted on the valid cached credential.
 *
 * Runs under `node --test --experimental-test-module-mocks` (see package.json test:unit).
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_MODE = 'live';
process.env.HEALTH_PROBE_TTL_MS = '60000';
process.env.TB_USERNAME = 'read-user';
process.env.TB_PASSWORD = 'read-pass';
process.env.TB_WRITE_USERNAME = 'write-user';
process.env.TB_WRITE_PASSWORD = 'write-pass';

let now = 3_000_000;
const realNow = Date.now;
Date.now = () => now;

let postCallCount = 0;
let postShouldFail = false;

// Mock axios: the callable form handles request(); .post handles getToken()/activeReadProbe().
const axiosMock = async () => ({ data: {} });
axiosMock.post = async () => {
    postCallCount++;
    if (postShouldFail) {
        const err = new Error('Request failed with status code 401');
        err.response = { status: 401 };
        throw err;
    }
    return { data: { token: 'jwt-cached' } };
};
mock.module('axios', { defaultExport: axiosMock });

const tb = await import('../services/tb-client.js');

test('concurrent probe + getToken fires exactly ONE POST when token is cached', async () => {
    postCallCount = 0;
    postShouldFail = false;

    // Prime the session: one successful probe populates the cached token.
    await tb.probeReadHealth();
    assert.equal(postCallCount, 1, 'priming probe fires one POST');

    // Reset count; token is now cached (expiry = now + 2h >> now).
    postCallCount = 0;

    // Call the probe and a read-request concurrently.
    // Option C: activeReadProbe fires ONE direct axios.post.
    // readRequest calls getToken() which sees a valid cached token and returns immediately.
    await Promise.all([
        tb.probeReadHealth(),
        tb.readRequest('GET', '/api/some/path')
    ]);
    assert.equal(postCallCount, 1, 'only the probe POST fires — concurrent getToken reuses cached token');
});

test('failed activeReadProbe leaves cached token and expiry unchanged', async () => {
    postCallCount = 0;
    postShouldFail = false;

    // Prime a valid token.
    await tb.probeReadHealth();
    assert.equal(tb.tbStatus().read, 'healthy', 'primed healthy');
    postCallCount = 0;

    // Probe fails (e.g. 401 from TB).
    postShouldFail = true;
    await tb.probeReadHealth();
    assert.equal(tb.tbStatus().read, 'unhealthy', 'failed probe marks unhealthy');
    postCallCount = 0;

    // A subsequent getToken() (via readRequest) must reuse the CACHED token — Option C's failed
    // probe does NOT clear token/expiry, so no re-auth POST fires here.
    postShouldFail = false;
    await tb.readRequest('GET', '/api/some/path');
    assert.equal(postCallCount, 0, 'getToken reuses cached token — failed probe did not clear it');
});

test('teardown — restore real Date.now', () => {
    Date.now = realNow;
});
