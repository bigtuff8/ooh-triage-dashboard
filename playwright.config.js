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
            RATE_LIMIT_MAX: '100000' // whole suite shares one IP

        }
    }
});
