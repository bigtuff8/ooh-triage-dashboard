/**
 * OOHDASH-164 Stage 1 — confirm gate background read states (D2).
 *
 * When the bridge inventory has no devices for a site, /resolve returns
 * deviceSummary: null and the client starts a background /summary fetch.
 * Three states arise: (1) checking — button disabled while fetch is pending;
 * (2) read-failed — fetch fails, read-failed message shown, button re-enables
 *     (ef7dd36 fix); (3) success — fetch returns device summary, button enables.
 *
 * All three states are exercised by page.route() intercepting /resolve
 * (to strip deviceSummary) and /summary (to control the outcome).
 * Everything else is the real server in fixture mode.
 *
 * Test site: 6832 ("Old Grey Mare"), identity: "Test Handler".
 */
import { test, expect } from '@playwright/test';
import { signIn, openSiteByKeyboard } from './helpers.js';

/** Intercept resolve and strip deviceSummary so the client triggers /summary fetch. */
async function forceNoInventorySummary(page) {
    await page.route('**/api/sites/6832/resolve', async route => {
        const response = await route.fetch();
        const body = await response.json();
        if (body.site) body.site.deviceSummary = null;
        await route.fulfill({ response, body: JSON.stringify(body), contentType: 'application/json' });
    });
}

/* ------------------------------------------------------------------ */
/* D2-1: Checking state — button disabled while /summary is in-flight  */
/* ------------------------------------------------------------------ */
test('D2-1: confirm gate shows checking state while summary is pending', async ({ page }) => {
    await signIn(page, 'Test Handler');

    // Strip inventory summary from resolve response.
    await forceNoInventorySummary(page);

    // Block /summary indefinitely so we can observe the checking state.
    await page.route('**/api/sites/6832/summary', route => {
        // Never respond — the pending state stays until the test ends.
        // Don't call route.continue() or route.fulfill() — Playwright will
        // abort the pending request when the page closes.
    });

    await openSiteByKeyboard(page, '6832');
    await expect(page.locator('[data-testid="confirm-gate"]')).toContainText('Old Grey Mare');

    // Button must be disabled with 'Checking site…' label.
    const btn = page.locator('[data-testid="confirm-site"]');
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveText('Checking site…');

    // Device line must show the checking copy (not the read-failed copy).
    await expect(page.locator('[data-testid="confirm-device-line"]')).toContainText(
        'Checking the Lighthouse equipment at this site…'
    );
});

/* ------------------------------------------------------------------ */
/* D2-2 (ef7dd36): Read-failed — network error re-enables the button  */
/* ------------------------------------------------------------------ */
test('D2-2 (ef7dd36): confirm gate re-enables button and shows read-failed message on /summary network error', async ({ page }) => {
    await signIn(page, 'Test Handler');

    // Strip inventory summary from resolve response.
    await forceNoInventorySummary(page);

    // Make /summary fail with a network error (abort = no response body, triggers .catch()).
    await page.route('**/api/sites/6832/summary', route => route.abort('failed'));

    await openSiteByKeyboard(page, '6832');
    await expect(page.locator('[data-testid="confirm-gate"]')).toContainText('Old Grey Mare');

    // Button must re-enable (not 'Checking site…') after the fetch fails.
    const btn = page.locator('[data-testid="confirm-site"]');
    await expect(btn).not.toBeDisabled({ timeout: 10000 });
    await expect(btn).toHaveText('✓ This is the right site');

    // Device line must show the ef7dd36 read-failed message, not the checking copy.
    await expect(page.locator('[data-testid="confirm-device-line"]')).toContainText(
        "We couldn't read the Lighthouse equipment just now. You can still confirm the site."
    );
});

/* ------------------------------------------------------------------ */
/* D2-3: Success path — /summary arrives, button enables with summary  */
/* ------------------------------------------------------------------ */
test('D2-3: confirm gate enables button and shows device summary on /summary success', async ({ page }) => {
    await signIn(page, 'Test Handler');

    // Strip inventory summary from resolve response.
    await forceNoInventorySummary(page);

    // Let /summary return the real server response (no intercept for it here —
    // the real server in fixture mode will respond correctly).

    await openSiteByKeyboard(page, '6832');
    await expect(page.locator('[data-testid="confirm-gate"]')).toContainText('Old Grey Mare');

    // Button must enable once the summary lands.
    const btn = page.locator('[data-testid="confirm-site"]');
    await expect(btn).not.toBeDisabled({ timeout: 10000 });
    await expect(btn).toHaveText('✓ This is the right site');

    // Device line must show real Lighthouse content (not checking or read-failed copy).
    await expect(page.locator('[data-testid="confirm-device-line"]')).toContainText('On Lighthouse:');
    await expect(page.locator('[data-testid="confirm-device-line"]')).not.toContainText(
        "We couldn't read"
    );
    await expect(page.locator('[data-testid="confirm-device-line"]')).not.toContainText(
        'Checking the Lighthouse equipment'
    );
});
