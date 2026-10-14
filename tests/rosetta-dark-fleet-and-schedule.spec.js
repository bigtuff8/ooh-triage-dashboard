/**
 * OOHDASH-123 focused rework - e2e for the two targeted fixes.
 *
 * Fix 2 (D-DARK-FLEETS): a dark (offline, not reporting) iT500 heating device surfaces the explicit
 *   "device not reporting" copy with NO controls, not the generic gateway "not responding" divert.
 * Fix 1 (DD-SCHED-DISPLAY): a PowerPause circuit's decoded next-scheduled-change is surfaced, labelled
 *   "based on the device's stored schedule".
 *
 * Runs the REAL server in fixture mode (no route mocking). Sites 7001 (dark fleet) and 7002 (PowerPause)
 * are dedicated fixtures.
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe('OOHDASH-123 dark-fleet copy + PowerPause schedule', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    test('Fix 2: a dark iT500 area says "device not reporting" with no controls (not the gateway branch)', async ({ page }) => {
        await confirmSite(page, '7001', 'Dark Fleet Arms');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('[data-testid="area-accommodation"]').click();

        const reco = page.locator('[data-testid="reco-dark-fleet"]');
        await expect(reco).toBeVisible();
        await expect(reco).toContainText('not reporting');

        // The explicit live-read line the operator sees.
        await expect(page.locator('.flowbody')).toContainText('device not reporting');

        // No controls are offered, and it is NOT the generic gateway connectivity branch.
        await expect(page.locator('[data-testid="need-warm"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="need-cool"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="need-off"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="connectivity-alert"]')).toHaveCount(0);

        // Capture routes to a normal IoT-team capture (offline, no controls - the unchanged outcome).
        await page.locator('[data-testid="dark-capture"]').click();
        await page.locator('[data-testid="record-outcome"]').click();
        await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
        await expect(page.locator('[data-testid="outcome-captured"]')).toContainText('not reporting');
    });

    test('Fix 1: a PowerPause kitchen circuit surfaces its decoded, labelled next scheduled change', async ({ page }) => {
        await confirmSite(page, '7002', 'Power Pause Inn');
        await page.locator('[data-testid="tile-kitchen"]').click();

        // Circuit is online, so the flow proceeds to the deciding question (not the connectivity divert).
        await page.locator('[data-testid="kitchen-notcritical"]').click();

        // The decoded schedule is already visible on the confirm step; record the outcome to finish.
        await expect(page.locator('[data-testid="confirm-step"]')).toContainText("based on the device's stored schedule");
        await page.locator('[data-testid="record-outcome"]').click();

        const outcome = page.locator('[data-testid="outcome-captured"]');
        await expect(outcome).toBeVisible();
        // The decoded next-scheduled-change surfaces, labelled per DD-SCHED-DISPLAY.
        await expect(outcome).toContainText("based on the device's stored schedule");
        await expect(outcome).toContainText('next change to on at 06:30 tomorrow');
    });
});
