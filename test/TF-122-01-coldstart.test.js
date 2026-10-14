/**
 * TF-122-01 — Genuine cold-start integration test (OOHDASH-122 tester-owned).
 *
 * Boots the real server.js as a subprocess in live mode with a network-stubbed TB server.
 * Verifies that probeBridgeReadOnce() fires at start-up and updates the latch before any
 * handler touches a workspace. Cannot run in fixture mode (probe is live-only by design).
 *
 * Two scenarios are driven as separate tests:
 *   CS-A: TB stub returns 200 on device list → bridge.healthy:true, lastError:null after probe.
 *   CS-B: TB stub returns 401 on login → bridge.healthy:false, lastError starts with
 *          "Start-up read probe failed:" after probe.
 *
 * The Cosmos probe (storeProbe) is directed at the same stub server, which returns an
 * immediate HTTP 404 for unrecognised paths — CosmosClient fails fast, store.healthy
 * becomes false (expected and inconsequential for the bridge assertions).
 *
 * /api/me is authenticated and cannot be hit without a session; the test uses /healthz
 * (unauthenticated) which exposes bridge.healthy and bridge.lastError directly.
 * AC-1 premise: bridgeDegraded() = !!lastError; since lastError is null in both boot state
 * and after probe-success, /api/me would return degraded:false in both — verified in the
 * fixture-mode suite by U5/E1 and documented by this test via /healthz.
 *
 * No wall-clock sleep is used for steady-state: the test polls /healthz with retries.
 * Overall timeout per test: 20 seconds (Cosmos probe may add a few seconds at boot).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* Fake TB / Cosmos stub server                                         */
/* ------------------------------------------------------------------ */

/**
 * Create a minimal fake HTTP server that handles the TB auth/device-list
 * calls the start-up probe makes, plus any Cosmos REST API calls (answered
 * with immediate 404 so CosmosClient fails fast and storeProbe() continues).
 *
 * @param {object} opts
 * @param {boolean} opts.tbOk  — if true, device list returns 200; if false, login returns 401.
 * @returns {{ server: http.Server, port: number, close: () => Promise<void> }}
 */
async function createStub({ tbOk }) {
    const server = http.createServer((req, res) => {
        const body = JSON.stringify(
            tbOk && req.url.includes('/api/auth/login')
                ? { token: 'fake-jwt-for-coldstart-test' }
                : tbOk && req.url.includes('/api/tenant/devices')
                    ? { data: [], hasNext: false, totalElements: 0 }
                    : { error: tbOk ? 'not found' : 'Unauthorized', status: tbOk ? 404 : 401 }
        );
        const status = tbOk
            ? (req.url.includes('/api/auth/login') || req.url.includes('/api/tenant/devices') ? 200 : 404)
            : 401;
        res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
    });
    await new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', (err) => { if (err) reject(err); else resolve(); });
    });
    const port = server.address().port;
    return {
        server,
        port,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
}

/* ------------------------------------------------------------------ */
/* Server subprocess management                                         */
/* ------------------------------------------------------------------ */

const SERVER_PORT_A = 31290;
const SERVER_PORT_B = 31291;

/**
 * Spawn server.js in live mode with all required env vars pointing to the stub.
 * Returns: { proc, close }
 */
function spawnServer({ stubPort, appPort }) {
    const env = {
        ...process.env,
        DATA_MODE: 'live',
        AUTH_MODE: 'dev',
        PORT: String(appPort),
        WRITES_DISABLED: 'true',
        TB_URL: `http://127.0.0.1:${stubPort}`,
        TB_USERNAME: 'probe-test@fake.local',
        TB_PASSWORD: 'probe-test-password',
        TB_WRITE_USERNAME: 'fake-write-user',
        TB_WRITE_PASSWORD: 'fake-write-password',
        BRIDGE_BASE_URL: `http://127.0.0.1:${stubPort}`,
        COSMOS_ENDPOINT: `http://127.0.0.1:${stubPort}`,
        APP_ORIGIN: `http://localhost:${appPort}`,
        SESSION_SECRET: 'coldstart-test-secret-do-not-use-in-production',
    };
    const proc = spawn(process.execPath, [join(ROOT, 'server.js')], {
        env,
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', () => {});
    return {
        proc,
        close: () => new Promise((resolve) => {
            proc.kill('SIGTERM');
            proc.on('exit', () => resolve());
            setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 3000).unref?.();
        }),
    };
}

/**
 * Poll /healthz on appPort until it responds or maxMs is exceeded.
 * Returns the parsed JSON body.
 */
async function pollHealthz(appPort, maxMs = 15000) {
    const start = Date.now();
    let lastErr;
    while (Date.now() - start < maxMs) {
        try {
            const result = await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${appPort}/healthz`, res => {
                    let data = '';
                    res.on('data', c => { data += c; });
                    res.on('end', () => {
                        try { resolve(JSON.parse(data)); }
                        catch (e) { reject(e); }
                    });
                });
                req.on('error', reject);
                req.setTimeout(2000, () => { req.destroy(new Error('request timed out')); });
            });
            return result;
        } catch (e) {
            lastErr = e;
            await new Promise(r => setTimeout(r, 300));
        }
    }
    throw new Error(`Server did not respond within ${maxMs}ms: ${lastErr?.message}`);
}

/**
 * Poll /healthz until bridge.healthy matches the expected value, or maxMs elapses.
 */
async function pollBridgeHealthy(appPort, expected, maxMs = 8000) {
    const start = Date.now();
    let last;
    while (Date.now() - start < maxMs) {
        last = await pollHealthz(appPort, 2000).catch(() => null);
        if (last?.subsystems?.bridge?.healthy === expected) return last;
        await new Promise(r => setTimeout(r, 400));
    }
    return last; // return whatever we got, let the assertion fail with context
}

/* ------------------------------------------------------------------ */
/* CS-A: TB stub returns 200 → probe succeeds → bridge.healthy: true  */
/* ------------------------------------------------------------------ */

test('TF-122-01 CS-A: cold-start probe success — /healthz bridge.healthy true after probe', { timeout: 20000 }, async () => {
    const stub = await createStub({ tbOk: true });
    const srv = spawnServer({ stubPort: stub.port, appPort: SERVER_PORT_A });
    let healthz;
    try {
        // Wait for server to come up (storeProbe failure adds a few seconds at boot).
        await pollHealthz(SERVER_PORT_A, 15000);
        // Poll until bridge.healthy:true (probe has settled) or 10s elapses.
        healthz = await pollBridgeHealthy(SERVER_PORT_A, true, 10000);
    } finally {
        await srv.close();
        await stub.close();
    }
    assert.equal(healthz?.subsystems?.bridge?.healthy, true,
        `CS-A: bridge.healthy must be true after a successful probe — got: ${JSON.stringify(healthz?.subsystems?.bridge)}`);
    assert.equal(healthz?.subsystems?.bridge?.lastError, null,
        `CS-A: bridge.lastError must be null after a successful probe — got: ${healthz?.subsystems?.bridge?.lastError}`);
});

/* ------------------------------------------------------------------ */
/* CS-B: TB stub returns 401 → probe fails → bridge.healthy: false,   */
/*        lastError starts with "Start-up read probe failed:"          */
/* ------------------------------------------------------------------ */

test('TF-122-01 CS-B: cold-start probe failure — /healthz bridge.healthy false, lastError set', { timeout: 20000 }, async () => {
    const stub = await createStub({ tbOk: false });
    const srv = spawnServer({ stubPort: stub.port, appPort: SERVER_PORT_B });
    let healthz;
    try {
        // Wait for server to come up.
        await pollHealthz(SERVER_PORT_B, 15000);
        // Poll until bridge.healthy:false with a lastError set, or 10s elapses.
        // (boot state: healthy:false, lastError:null — we wait for the probe to set lastError)
        const start = Date.now();
        while (Date.now() - start < 10000) {
            healthz = await pollHealthz(SERVER_PORT_B, 2000).catch(() => null);
            if (healthz?.subsystems?.bridge?.lastError !== null &&
                healthz?.subsystems?.bridge?.lastError !== undefined) break;
            await new Promise(r => setTimeout(r, 400));
        }
    } finally {
        await srv.close();
        await stub.close();
    }
    assert.equal(healthz?.subsystems?.bridge?.healthy, false,
        `CS-B: bridge.healthy must be false after a failed probe — got: ${JSON.stringify(healthz?.subsystems?.bridge)}`);
    assert.ok(
        typeof healthz?.subsystems?.bridge?.lastError === 'string' &&
        healthz.subsystems.bridge.lastError.startsWith('Start-up read probe failed:'),
        `CS-B: lastError must start with "Start-up read probe failed:" — got: ${healthz?.subsystems?.bridge?.lastError}`
    );
});

/* cleanup on abnormal exit */
after(async () => {
    // Individual test finally-blocks handle cleanup; this is belt-and-braces for abnormal exit.
});
