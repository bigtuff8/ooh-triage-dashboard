/**
 * OOHDASH-127 — deterministic regression for TF-28 (mobile horizontal overflow).
 *
 * Root cause: the mobile media-query override used `grid-template-columns:1fr` instead of
 * `minmax(0,1fr)`. Without the explicit 0 minimum, the grid track expands to the min-content
 * size of its items (scope-list tags such as "Not on Lighthouse here" push the track beyond
 * 390 px), causing all cards — including "Open tickets" — to be wider than the viewport.
 *
 * Secondary fix: the subject <span> in stepdone ticket rows gained `min-width:0` so it can
 * shrink and ellipsise within the now-correctly-sized card content area.
 *
 * This test uses site 6883 (Water Tower). No other spec creates outcome tickets for that site,
 * so the seeded ticket is always visible in the top-4. The seed POST requires auth, so signIn
 * is called in beforeEach before the seed request.
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe('OOHDASH-127 TF-28 regression — mobile overflow on long status label', () => {
    test.beforeEach(async ({ page }) => {
        // Sign in first — /api/test/tickets sits behind requireAuth.
        await page.setViewportSize({ width: 390, height: 844 });
        await signIn(page, 'Test Handler');
        // Seed a ticket with the longest status label in the mapping:
        // custom_status_id 11404223315612 → "Just received — not yet picked up"
        await page.request.post('/api/test/tickets', {
            data: {
                id: 49900,
                siteNo: '6883',
                subject: 'OOHDASH-127 regression seed — long status label',
                status: 'new',
                custom_status_id: 11404223315612,
                priority: 'normal',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                tags: ['ooh'],
                visit: false,
                comments: []
            }
        });
    });

    test.afterEach(async ({ page }) => {
        await page.request.post('/api/test/tickets/reset');
    });

    test('TF-28 regression: workspace ticket rows do not cause horizontal scroll at 390 px', async ({ page }) => {
        await confirmSite(page, '6883', 'Water Tower');

        // The seeded ticket must be visible — confirms the long-label candidate is rendered.
        const ticketSection = page.locator('.card:has(h3:has-text("Open tickets"))');
        await expect(ticketSection).toBeVisible();
        await expect(ticketSection).toContainText('OOHDASH-127 regression seed');

        // Core assertion: document must not overflow horizontally.
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(390);
    });
});
