/**
 * OOHDASH-24 — /healthz active read-probe + tri-state.
 *
 * Proves the read-health signal is no longer a stale-green lazy latch:
 *   - a configured-but-unexercised read reports 'unknown' (amber), NEVER green;
 *   - a once-good-now-dead read (401, no intervening read) flips to 'unhealthy' after the TTL
 *     — the core -24 defect (a dead cred must NOT stay green);
 *   - a genuinely healthy read within the TTL is 'healthy' (green);
 *   - /healthz returns HTTP 200 in EVERY tri-state (K8s probe policy, server.js:63-65);
 *   - server.js's degraded predicate treats amber 'unknown' as NOT green (the widened consumer).
 *
 * Determinism: we control the clock (a mockable Date.now via config.control.healthProbeTtlMs +
 * injected time) and the probe outcome (axios.post stubbed to succeed / 401) — NO wall-clock
 * sleeps and NO live portal.lhlive.co.uk call. tb-client is driven in LIVE mode so the real
 * probe/tri-state code runs (fixture mode short-circuits to healthy).
 *
 * Runs under `node --test --experimental-test-module-mocks` (see package.json test:unit).
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Live data-mode so the real readState()/activeReadProbe() path runs (fixture short-circuits).
// A short TTL keeps the freshness maths obvious; the probe outcome is what we drive.
process.env.DATA_MODE = 'live';
process.env.HEALTH_PROBE_TTL_MS = '60000';
process.env.TB_USERNAME = 'read-user';
process.env.TB_PASSWORD = 'read-pass';
process.env.TB_WRITE_USERNAME = 'write-user';
process.env.TB_WRITE_PASSWORD = 'write-pass';

// Controllable clock: tb-client reads Date.now() for probe timestamps + freshness. We drive it
// so "advance past the TTL" is deterministic with no sleeps.
let now = 1_000_000;
const realNow = Date.now;
Date.now = () => now;

// Stub axios so activeReadProbe()'s getToken() login is fully controlled — success or 401,
// with NO network call. `loginBehaviour` is swapped per test.
let loginBehaviour = async () => ({ data: { token: 'jwt-ok' } });
mock.module('axios', {
    defaultExport: {
        post: async (...args) => loginBehaviour(...args),
        // axios(...) callable form (request()) — unused by these tests but present for safety.
        get: async () => ({ data: {} })
    }
});

const tb = await import('../services/tb-client.js');

/** A fresh healthz-like read of the tri-state (mirrors server.js pulling tbStatus().read). */
function readState() {
    return tb.tbStatus().read;
}

test('unexercised-configured ⇒ amber "unknown", never green', async () => {
    // No probe has run yet (checkedAt 0). Configured read cred present.
    const status = tb.tbStatus();
    assert.equal(status.mode, 'live');
    assert.equal(status.read, 'unknown', 'a configured-but-unproven read is amber');
    assert.notEqual(status.read, 'healthy', 'MUST NOT present green before any successful probe');
});

test('genuinely healthy within TTL ⇒ green "healthy"', async () => {
    loginBehaviour = async () => ({ data: { token: 'jwt-ok' } });
    // Run an explicit successful probe, then read within the TTL window.
    await tb.probeReadHealth();
    assert.equal(readState(), 'healthy', 'a fresh successful probe is green');
});

test('HTTP 200 invariant — /healthz returns 200 in every tri-state', async () => {
    // Assert at the predicate level that no tri-state changes the status code: server.js always
    // res.json(...) with an implicit 200 and never sets a non-2xx. We assert the source contract
    // plus that degraded (which maps amber/red) does not touch res.status.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    // The /healthz handler must not set a non-200 status anywhere in its body.
    const handler = src.slice(src.indexOf("app.get('/healthz'"), src.indexOf("app.get('/api/version'"));
    assert.ok(handler.length > 0, 'located the /healthz handler');
    assert.doesNotMatch(handler, /res\.status\(/, '/healthz must never set a non-200 status — HTTP 200 in every tri-state');
    // And the degraded roll-up only changes the BODY status string, not the HTTP code.
    assert.match(handler, /status:\s*degraded\s*\?\s*'degraded'\s*:\s*'ok'/);
});

test('stale-green ⇒ unhealthy (the core -24 defect: a dead cred must NOT stay green)', async () => {
    // 1. Prime a healthy probe.
    loginBehaviour = async () => ({ data: { token: 'jwt-ok' } });
    await tb.probeReadHealth();
    assert.equal(readState(), 'healthy', 'primed green');

    // 2. The cred dies (401) — but NO read is attempted in between. Under the old lazy latch the
    //    state would stay green forever on a quiet pod. Now, advancing past the TTL makes it amber,
    //    and the probe kicked off by tbStatus() (or an explicit probe) re-proves against the dead
    //    cred and flips it to red.
    loginBehaviour = async () => {
        const err = new Error('Request failed with status code 401');
        err.response = { status: 401 };
        throw err;
    };

    // 3. Advance the clock past the freshness TTL with NO intervening successful read.
    now += 60_001;

    // First observation: stale ⇒ amber (definitely not stale-green).
    assert.equal(readState(), 'unknown', 'past the TTL the once-green probe is no longer green (amber)');

    // Re-prove against the now-dead cred: the active probe flips it to red.
    await tb.probeReadHealth();
    assert.equal(readState(), 'unhealthy', 'a dead-but-once-good cred flips to unhealthy, not stale-green');
});

test('server.js degraded predicate treats amber "unknown" as NOT green (widened consumer)', async () => {
    // Source-level pin: the consumer at server.js must count 'unknown' as degraded, not just
    // 'unhealthy' — a Build-doer adding the tri-state without this would leave amber reading green.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    assert.match(src, /===\s*'unknown'/, "degraded predicate must test read state === 'unknown'");
    assert.match(src, /===\s*'unhealthy'/, "degraded predicate must test read state === 'unhealthy'");
    assert.doesNotMatch(src, /thingsboard\?\.read === false/, 'the old boolean read===false consumer must be gone');
});

// Restore the real clock at the end of the file's tests (belt-and-braces beyond afterEach).
test('teardown — restore real Date.now', () => {
    Date.now = realNow;
    assert.ok(true);
});
