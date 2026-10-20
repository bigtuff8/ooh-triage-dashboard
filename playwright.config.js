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
            SYNC_POLL_INTERVAL_MS: '300',            // base watcher tick
            // OOHDASH-123: compress the per-class confirm timings + the fixture trajectory so the real
            // three-outcome watcher settles within the e2e timeout. Tuya confirms ~0.9s; IT700 (slow
            // class) is released at once and confirms shortly after in the background.
            OOH_SIM_STEP_MS: '300',
            OOH_CONFIRM_POLL_MS_TUYA: '300',
            OOH_CONFIRM_LIMIT_MS_TUYA: '6000',
            OOH_LATE_WATCH_MS_TUYA: '20000',
            OOH_CONFIRM_POLL_MS_SALUS: '300',
            OOH_COPY_MIN_IT700: '1',
            OOH_CONFIRM_LIMIT_MS_IT700: '60000',
            OOH_LATE_WATCH_MS_IT700: '120000',
            OOH_COPY_MIN_IT500: '1',
            OOH_CONFIRM_LIMIT_MS_IT500: '60000',
            OOH_LATE_WATCH_MS_IT500: '120000',
            WRITES_DISABLED: 'false', // OOHDASH-12 default is now fail-closed; fixture e2e exercises the dispatch flow, so enable writes here
            // OOHDASH-135 Item 3: enable iT500 control in the e2e fixture environment so F005/F009
            // tests can exercise the full Salus dispatch path and registry guardrails (Level B check
            // would otherwise intercept before validateCommand reaches the expected error messages).
            SALUS_IT500_CTL_ENABLED: 'true',
            RATE_LIMIT_MAX: '100000' // whole suite shares one IP

        }
    }
});
