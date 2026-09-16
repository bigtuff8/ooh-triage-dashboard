// F020 test suite — runs the REAL server in fixture mode (no route mocking):
// full client→server→service round trips; fixture data mirrors the design dataset.
import { defineConfig } from '@playwright/test';

const PORT = 3155;

export default defineConfig({
    testDir: './tests',
    timeout: 90_000,
    expect: { timeout: 10_000 },
    fullyParallel: false, // shared server state (audit log, kill-switch) — run serially
    workers: 1,
    // A few tests assert on device sync-echo landing within a poll-interval window; under machine
    // load that timing can occasionally jitter. One retry absorbs that jitter (the suite is green
    // without it on clean serial runs — this is defense-in-depth for CI, not masking a logic bug).
    // NOTE: this suite binds a fixed port + shared store, so do NOT run two invocations concurrently.
    retries: 1,
    reporter: [['list']],
    use: {
        baseURL: `http://localhost:${PORT}`,
        screenshot: 'only-on-failure'
    },
    webServer: {
        command: 'node server.js',
        url: `http://localhost:${PORT}/healthz`,
        reuseExistingServer: false,
        env: {
            PORT: String(PORT),
            AUTH_MODE: 'dev',
            DATA_MODE: 'fixture',
            APP_ORIGIN: `http://localhost:${PORT}`,
            OOH_STORE_DIR: 'test-results/store-' + PORT,
            SYNC_POLL_INTERVAL_MS: '1000',
            SYNC_TIMEOUT_MS: '6000',
            MID_WAIT_PROMPT_MS: '3000', // R11/C7: must satisfy 0 < it <= SYNC_TIMEOUT_MS (compressed for e2e)
            WRITES_DISABLED: 'false', // OOHDASH-12 default is now fail-closed; fixture e2e exercises the dispatch flow, so enable writes here
            RATE_LIMIT_MAX: '100000' // whole suite shares one IP

        }
    }
});
