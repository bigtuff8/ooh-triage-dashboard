/**
 * OOHDASH-122 — bridge start-up read probe unit tests (P1-P10).
 *
 * Pattern: DATA_MODE=live set before any import; mock.module('../services/tb-client.js')
 * provides a controllable readRequest; mock.module('../services/zendesk.js') provides
 * siteDirectory (needed for the module to load). Each test cache-busts the tb-device.js
 * import so it starts in boot state (lastReadOk=false, lastReadError=null).
 *
 * No network. No wall-clock sleeps beyond a 20ms timeout in P3.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

// DATA_MODE=live BEFORE any config.js-backed module import.
process.env.DATA_MODE = 'live';

/* ------------------------------------------------------------------ */
/* Controllable mock for config.js dataMode.                            */
/* P8 sets this to 'fixture' so probeBridgeReadOnce() returns 'skipped'. */
/* ------------------------------------------------------------------ */
let mockDataMode = 'live';
mock.module('../config.js', {
    namedExports: {
        config: new Proxy(
            {},
            {
                get: (_, prop) => {
                    if (prop === 'dataMode') return mockDataMode;
                    // Other config values: read the real config lazily via env.
                    // For probe tests only dataMode matters; others are unused.
                    return undefined;
                },
            }
        ),
    }
});

/* ------------------------------------------------------------------ */
/* Controllable mock for tb-client.readRequest.                         */
/* Tests set `mockRq` to control the probe's readRequest behaviour.    */
/* ------------------------------------------------------------------ */
let mockRq = async () => ({ data: { data: [], hasNext: false, totalElements: 0 }, status: 200 });
let mockRqCallCount = 0;

mock.module('../services/tb-client.js', {
    namedExports: {
        readRequest: async (method, path, data) => {
            mockRqCallCount += 1;
            return mockRq(method, path, data);
        },
        readServerScopeAttributes: async () => [],
        readSharedScopeAttributes: async () => null,
        tbStatus: () => ({ healthy: true, lastError: null }),
    }
});

// Zendesk stub (siteDirectory is lazily imported by getSites() in live mode).
let mockSiteDir = async () => [];
mock.module('../services/zendesk.js', {
    namedExports: {
        resolveSiteName: async () => 'Test Site',
        siteDirectory: async () => mockSiteDir(),
    }
});

/* ------------------------------------------------------------------ */
/* Helper: fresh tb-device module instance — boot state per call.      */
/* ------------------------------------------------------------------ */
async function freshTb() {
    // Reset call counter and mock behaviour before each fresh import.
    mockRqCallCount = 0;
    return import(`../services/tb-device.js?v=${Math.random()}`);
}

/* ------------------------------------------------------------------ */
/* P1: success — probe calls readRequest once, latch becomes healthy.  */
/* ------------------------------------------------------------------ */
test('P1 AC-3: success — outcome ok, readRequest called once with probe path, bridgeStatus healthy', async () => {
    const tb = await freshTb();
    mockRq = async () => ({ data: { data: [], hasNext: false, totalElements: 0 }, status: 200 });

    const r = await tb.probeBridgeReadOnce();
    assert.equal(r.outcome, 'ok');
    assert.ok(typeof r.ms === 'number' && r.ms >= 0, 'ms is a non-negative number');
    assert.equal(mockRqCallCount, 1, 'readRequest called exactly once');
    const s = tb.bridgeStatus();
    assert.equal(s.healthy, true, 'latch is healthy after success');
    assert.equal(s.lastError, null, 'lastError is null after success');
});

/* ------------------------------------------------------------------ */
/* P2: failure (401) — outcome failed, lastError set, healthy false.   */
/* ------------------------------------------------------------------ */
test('P2 AC-3: failure (401) — outcome failed, lastError set, healthy false', async () => {
    const tb = await freshTb();
    const err401 = Object.assign(new Error('Request failed with status code 401'), {
        response: { status: 401 }
    });
    mockRq = async () => { throw err401; };

    const r = await tb.probeBridgeReadOnce();
    assert.equal(r.outcome, 'failed');
    const s = tb.bridgeStatus();
    assert.equal(s.healthy, false, 'latch unhealthy after 401');
    assert.ok(s.lastError?.startsWith('Start-up read probe failed:'),
        `lastError must start with "Start-up read probe failed:" — got: ${s.lastError}`);
    assert.equal(mockRqCallCount, 1, 'exactly one call (no retry)');
});

/* ------------------------------------------------------------------ */
/* P3: timeout — probe resolves with outcome timeout; latch records it. */
/* ------------------------------------------------------------------ */
test('P3 AC-3: timeout — outcome timeout, lastError matches /timed out after 20ms/', async () => {
    const tb = await freshTb();
    // readRequest never settles (but we unref the inner timer so it won't keep Node alive).
    mockRq = async () => new Promise(() => {});  // hangs forever

    const r = await tb.probeBridgeReadOnce({ timeoutMs: 20 });
    assert.equal(r.outcome, 'timeout');
    assert.match(tb.bridgeStatus().lastError || '', /timed out after 20ms/,
        'lastError must record the timeout duration');
});

/* ------------------------------------------------------------------ */
/* P4: 429 back-off — outcome rate-limited; state stays untouched.     */
/* ------------------------------------------------------------------ */
test('P4 AC-3: 429 rate-limit — outcome rate-limited, state untouched, no retry', async () => {
    const tb = await freshTb();
    const err429 = Object.assign(new Error('Request failed with status code 429'), {
        response: { status: 429 }
    });
    mockRq = async () => { throw err429; };

    const r = await tb.probeBridgeReadOnce();
    assert.equal(r.outcome, 'rate-limited');
    // State must remain in boot (untouched) — no error, no healthy flip.
    const s = tb.bridgeStatus();
    assert.equal(s.healthy, false, '429: latch stays at healthy:false (untouched boot state)');
    assert.equal(s.lastError, null, '429: lastError stays null (back-off, no error recorded)');
    assert.equal(mockRqCallCount, 1, 'exactly one call (no retry on 429)');
});

/* ------------------------------------------------------------------ */
/* P5: real read wins — probe deferred, getSites() succeeds first,     */
/* then probe rejects; state stays at the real-read result (healthy).  */
/* ------------------------------------------------------------------ */
test('P5 AC-3: real read wins over a late probe failure', async () => {
    const tb = await freshTb();

    // Deferred control for the probe's readRequest.
    let rejectProbe;
    const probeDeferred = new Promise((_, rej) => { rejectProbe = rej; });
    let callCount = 0;
    mockRq = async () => {
        callCount += 1;
        if (callCount === 1) return probeDeferred;  // probe call — deferred
        // Subsequent calls (getSites via siteDirectory) succeed immediately.
        return { data: { data: [], hasNext: false, totalElements: 0 }, status: 200 };
    };
    // getSites() (live mode) calls siteDirectory() then sets lastReadOk=true.
    mockSiteDir = async () => [];

    // Start probe (deferred) — do NOT await.
    const probePromise = tb.probeBridgeReadOnce();

    // Real read: getSites() succeeds → latch becomes healthy.
    await tb.getSites();
    const afterRealRead = tb.bridgeStatus();
    assert.equal(afterRealRead.healthy, true, 'after real getSites(): latch is healthy');
    assert.equal(afterRealRead.lastError, null, 'after real getSites(): lastError is null');

    // Now let the probe's readRequest reject.
    rejectProbe(Object.assign(new Error('probe error after real read'), { response: { status: 503 } }));
    const r = await probePromise;
    assert.equal(r.outcome, 'failed', 'probe resolved as failed');

    // Real read must not have been overwritten.
    const final = tb.bridgeStatus();
    assert.equal(final.healthy, true, 'real-read result not overwritten by late probe failure');
    assert.equal(final.lastError, null, 'lastError stays null — real success wins');
});

/* ------------------------------------------------------------------ */
/* P6: real failure not overwritten by late probe success.             */
/* ------------------------------------------------------------------ */
test('P6 AC-3: real failure not overwritten by late probe success', async () => {
    const tb = await freshTb();

    let resolveProbe;
    const probeDeferred = new Promise(res => { resolveProbe = res; });
    let callCount = 0;
    mockRq = async () => {
        callCount += 1;
        if (callCount === 1) return probeDeferred;  // probe call — deferred
        // getSites() call — fail with a real error.
        throw Object.assign(new Error('real TB outage'), { response: { status: 503 } });
    };
    mockSiteDir = async () => { throw new Error('real TB outage'); };

    // Start probe (deferred).
    const probePromise = tb.probeBridgeReadOnce();

    // Real read: getSites() fails → latch records the real error.
    try { await tb.getSites(); } catch { /* expected */ }
    const afterRealFailure = tb.bridgeStatus();
    assert.equal(afterRealFailure.healthy, false, 'after real getSites() failure: latch is unhealthy');
    assert.ok(afterRealFailure.lastError, 'after real getSites() failure: lastError is set');
    const realError = afterRealFailure.lastError;

    // Now let the probe's readRequest succeed.
    resolveProbe({ data: { data: [], hasNext: false, totalElements: 0 }, status: 200 });
    const r = await probePromise;
    assert.equal(r.outcome, 'ok', 'probe outcome is ok (it resolved successfully)');

    // Real failure must not be overwritten by the late probe success.
    const final = tb.bridgeStatus();
    assert.equal(final.healthy, false, 'real failure not overwritten by late probe success');
    assert.equal(final.lastError, realError, 'lastError is still the real error');
});

/* ------------------------------------------------------------------ */
/* P7: never throws — a synchronous throw and a non-Error reject both  */
/* resolve to outcome failed.                                          */
/* ------------------------------------------------------------------ */
test('P7 AC-3: never throws — synchronous throw and non-Error reject both resolve to outcome failed', async () => {
    // Case A: readRequest throws synchronously (via an async function that throws).
    {
        const tb = await freshTb();
        mockRq = async () => { throw new TypeError('sync-like throw'); };
        const r = await tb.probeBridgeReadOnce();
        assert.equal(r.outcome, 'failed', 'sync-throw case: outcome is failed (never throws)');
    }
    // Case B: readRequest rejects with a plain object (not an Error).
    {
        const tb = await freshTb();
        mockRq = async () => Promise.reject({ message: 'plain object rejection' });
        const r = await tb.probeBridgeReadOnce();
        assert.equal(r.outcome, 'failed', 'non-Error rejection: outcome is failed (never throws)');
    }
});

/* ------------------------------------------------------------------ */
/* P8: fixture mode — outcome skipped, readRequest never called.       */
/* ------------------------------------------------------------------ */
test('P8 AC-3: fixture mode → outcome skipped, readRequest never called', async () => {
    // Switch the config mock to fixture mode so probeBridgeReadOnce() returns 'skipped'.
    // Restore only AFTER calling the probe so config.dataMode is 'fixture' during execution.
    mockDataMode = 'fixture';
    const tb = await freshTb();

    const r = await tb.probeBridgeReadOnce();
    mockDataMode = 'live';  // restore after the probe call

    assert.equal(r.outcome, 'skipped', 'fixture mode: outcome is skipped');
    assert.equal(mockRqCallCount, 0, 'fixture mode: readRequest never called');
});

/* ------------------------------------------------------------------ */
/* P9: no secret leakage — err.config with a password field is not     */
/* stored in lastError (only err.message is stored).                   */
/* ------------------------------------------------------------------ */
test('P9 AC-3: no secret leakage — err.config credentials not in lastError', async () => {
    const tb = await freshTb();
    const errWithCreds = Object.assign(new Error('Request failed with status code 401'), {
        response: { status: 401 },
        config: { url: 'http://example.com', headers: { Authorization: 'Bearer secret-token' },
            password: 'super-secret' }
    });
    mockRq = async () => { throw errWithCreds; };

    await tb.probeBridgeReadOnce();
    const lastErr = tb.bridgeStatus().lastError || '';
    assert.ok(!lastErr.includes('super-secret'), 'lastError must not contain the password field');
    assert.ok(!lastErr.includes('Bearer secret'), 'lastError must not contain the Authorization header');
    assert.ok(lastErr.includes('401'), 'lastError carries the status code from the message');
});

/* ------------------------------------------------------------------ */
/* P10: wiring pin — server.js calls bridge.probeBridgeReadOnce() inside */
/* app.listen callback, guarded by dataMode === 'live', not awaited.    */
/* ------------------------------------------------------------------ */
test('P10 AC-3: wiring pin — server.js wires the probe correctly', () => {
    const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    assert.match(src, /bridge\.probeBridgeReadOnce\(\)/,
        'server.js must call bridge.probeBridgeReadOnce()');
    assert.match(src, /dataMode\s*===\s*['"]live['"]/,
        'the call must be guarded by dataMode === \'live\'');
    // The call must NOT be preceded by `await` (non-blocking requirement).
    const probeIndex = src.indexOf('bridge.probeBridgeReadOnce()');
    // Look at the 50 chars before the call for 'await'.
    const before = src.slice(Math.max(0, probeIndex - 50), probeIndex);
    assert.ok(!before.includes('await'), `probe call must not be awaited — found: ${before}`);
    // The call must be inside the app.listen callback (after 'app.listen').
    const listenIdx = src.indexOf('app.listen');
    assert.ok(listenIdx < probeIndex, 'probe call is inside the app.listen callback');
});
