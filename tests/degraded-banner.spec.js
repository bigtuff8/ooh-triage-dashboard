/**
 * OOHDASH-122 — degraded banner e2e journeys (E1-E7).
 *
 * Server runs in fixture mode (DATA_MODE=fixture). In fixture mode the bridge latch starts
 * healthy (lastReadOk=true), so all degraded states are produced by page.route() intercepting
 * the real response and patching only the degraded field. Everything else is the real server.
 *
 * Test site: 6832 ("Old Grey Mare"), test identity: "Test Handler".
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

/* ------------------------------------------------------------------ */
/* E1 AC-1/AC-2: cold start → green only; kill-banner absent          */
/* ------------------------------------------------------------------ */
test('E1 AC-1/AC-2: cold start — green banner only, no kill-banner', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await expect(page.locator('[data-testid="control-live-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="kill-banner"]')).toHaveCount(0);
});

/* ------------------------------------------------------------------ */
/* E2 AC-2: account-level failure (me.degraded: true) → red only      */
/* ------------------------------------------------------------------ */
test('E2 AC-2: account-level failure — red only, green absent', async ({ page }) => {
    // Intercept /api/me and patch degraded: true BEFORE signIn so boot() gets the patched response.
    await page.route('**/api/me', async route => {
        const response = await route.fetch();
        const body = await response.json();
        body.degraded = true;
        await route.fulfill({
            response,
            body: JSON.stringify(body),
            contentType: 'application/json',
        });
    });

    await signIn(page, 'Test Handler');

    await expect(page.locator('[data-testid="kill-banner"]')).toContainText('degraded mode');
    await expect(page.locator('[data-testid="control-live-banner"]')).toHaveCount(0);
});

/* ------------------------------------------------------------------ */
/* E3 AC-2: workspace-level failure (workspace.degraded: true) → red only */
/* ------------------------------------------------------------------ */
test('E3 AC-2: workspace-level failure — red only; site degraded-banner visible; green absent', async ({ page }) => {
    await signIn(page, 'Test Handler');

    // Intercept the confirm POST and patch workspace.degraded: true.
    await page.route('**/api/sites/6832/confirm', async route => {
        const response = await route.fetch();
        const body = await response.json();
        if (body.workspace) body.workspace.degraded = true;
        await route.fulfill({
            response,
            body: JSON.stringify(body),
            contentType: 'application/json',
        });
    });

    await confirmSite(page, '6832', 'Old Grey Mare');

    await expect(page.locator('[data-testid="kill-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="control-live-banner"]')).toHaveCount(0);
    // The site-level degraded-banner renders inside the workspace view when ws.degraded is true.
    await expect(page.locator('[data-testid="degraded-banner"]')).toBeVisible();
});

/* ------------------------------------------------------------------ */
/* E4 AC-2: recovery — remove the patch, click nav-home → green returns */
/* ------------------------------------------------------------------ */
test('E4 AC-2: recovery — removing account-level patch restores green banner', async ({ page }) => {
    // Start as E2 (me.degraded: true).
    await page.route('**/api/me', async route => {
        const response = await route.fetch();
        const body = await response.json();
        body.degraded = true;
        await route.fulfill({
            response,
            body: JSON.stringify(body),
            contentType: 'application/json',
        });
    });

    await signIn(page, 'Test Handler');
    await expect(page.locator('[data-testid="kill-banner"]')).toContainText('degraded mode');
    await expect(page.locator('[data-testid="control-live-banner"]')).toHaveCount(0);

    // Remove the degraded patch — subsequent /api/me calls return the real (healthy) response.
    await page.unroute('**/api/me');

    // nav-home triggers a refreshMe() which re-fetches /api/me.
    await page.locator('[data-testid="nav-home"]').click();

    await expect(page.locator('[data-testid="kill-banner"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="control-live-banner"]')).toBeVisible();
});

/* ------------------------------------------------------------------ */
/* E6 AC-2: control blocked when genuinely degraded (workspace degraded) */
/* ------------------------------------------------------------------ */
test('E6 AC-2: control blocked when degraded — modal shows degraded reason; no dispatch sent', async ({ page }) => {
    await signIn(page, 'Test Handler');

    // Patch the confirm response to have workspace.degraded: true.
    await page.route('**/api/sites/6832/confirm', async route => {
        const response = await route.fetch();
        const body = await response.json();
        if (body.workspace) body.workspace.degraded = true;
        await route.fulfill({
            response,
            body: JSON.stringify(body),
            contentType: 'application/json',
        });
    });

    // Also intercept workspace refresh to keep degraded state.
    await page.route('**/api/sites/6832/workspace', async route => {
        const response = await route.fetch();
        const body = await response.json();
        if (body.workspace) body.workspace.degraded = true;
        await route.fulfill({
            response,
            body: JSON.stringify(body),
            contentType: 'application/json',
        });
    });

    // Guard: assert dispatch is never called.
    let dispatchCalled = 0;
    await page.route('**/api/control/dispatch', async route => {
        dispatchCalled += 1;
        await route.continue();
    });

    await confirmSite(page, '6832', 'Old Grey Mare');
    await expect(page.locator('[data-testid="kill-banner"]')).toBeVisible();

    // Attempt a setpoint change — should be blocked by the degraded kill reason.
    await page.locator('[data-testid="tile-heating"]').click();
    await page.locator('[data-testid="area-bar-restaurant"]').click();
    await page.locator('[data-testid="need-warm"]').click();

    await expect(page.locator('[data-testid="control-blocked"]')).toContainText('degraded mode');
    expect(dispatchCalled).toBe(0);
});

/* ------------------------------------------------------------------ */
/* E7 AC-3: /healthz bridge healthy after a full fixture flow          */
/* ------------------------------------------------------------------ */
test('E7 AC-3: /healthz shows bridge healthy after a confirmed workspace', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');

    const response = await page.request.get('/healthz');
    const body = await response.json();
    expect(body.subsystems.bridge.healthy).toBe(true);
    expect(body.subsystems.bridge.lastError).toBeNull();
});
