/** F004 — deterministic site resolution: keyboard search, 0-match, ambiguous, confirm gate. */
import { test, expect } from '@playwright/test';
import { signIn, openSiteByKeyboard, confirmSite } from './helpers.js';

test.describe('F004 resolution', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    test('search shows real site data and keyboard navigation selects', async ({ page }) => {
        await page.locator('[data-testid="site-search"]').pressSequentially('old grey', { delay: 40 });
        const first = page.locator('[data-testid="search-results"] .ri').first();
        await expect(first).toContainText('Old Grey Mare');
        await expect(first).toContainText('6832');
        await expect(first).toContainText('Greene King');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-testid="confirm-gate"]')).toContainText('Old Grey Mare');
    });

    test('no-match search shows explicit guidance, never a fuzzy match', async ({ page }) => {
        await page.locator('[data-testid="site-search"]').pressSequentially('7244', { delay: 40 });
        await expect(page.locator('[data-testid="search-empty"]')).toContainText('No site matches “7244”');
        await expect(page.locator('[data-testid="search-empty"]')).toContainText('may not be on Lighthouse');
        await expect(page.locator('[data-testid="search-results"] .ri')).toHaveCount(0);
    });

    test('ambiguous house ID 6758 is rejected with escalate-only path', async ({ page }) => {
        await page.locator('[data-testid="site-search"]').pressSequentially('6758', { delay: 40 });
        await expect(page.locator('.ri .tag:has-text("duplicate ID")').first()).toBeVisible();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        const card = page.locator('[data-testid="ambiguous-card"]');
        await expect(card).toContainText('House ID 6758 is ambiguous');
        await expect(card).toContainText('Bowers');
        await expect(card).toContainText('Bowman');
        // no confirm button, no workspace
        await expect(page.locator('[data-testid="confirm-site"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="device-board"]')).toHaveCount(0);
        // capture path produces a ticket
        await page.locator('[data-testid="ambiguous-capture"]').click();
        await expect(page.locator('.toast')).toContainText('Captured as ticket');
    });

    test('confirmation gate blocks the workspace until confirmed', async ({ page }) => {
        await openSiteByKeyboard(page, '6832');
        // gate visible, workspace data NOT loaded
        await expect(page.locator('[data-testid="confirm-gate"]')).toContainText('site number 6832');
        await expect(page.locator('[data-testid="device-board"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="category-tiles"]')).toHaveCount(0);
        await page.locator('[data-testid="confirm-site"]').click();
        await expect(page.locator('[data-testid="device-board"]')).toContainText('Bar area');
        await expect(page.locator('[data-testid="device-board"]')).toContainText('17.5°C');
    });

    test('server refuses a dispatch without a valid confirmation token (409)', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        const res = await page.evaluate(async () => {
            const r = await fetch('/api/control/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmToken: 'forged-token', siteNo: '6832', deviceId: 'IT500-BAR-6832', command: 'setpoint', value: 19 })
            });
            return { status: r.status, body: await r.json() };
        });
        expect(res.status).toBe(409);
        expect(res.body.error).toContain('confirm');
    });

    test('workspace shows site-scoped scope wording and repeat-contact flag', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        const scope = page.locator('[data-testid="scope-list"]');
        await expect(scope).toContainText('Heating');
        await expect(scope).toContainText('Controllable from here');
        await expect(scope).toContainText('Not on Lighthouse here');
        await expect(page.locator('.tag.amber:has-text("calls this month")')).toContainText('2 calls');
    });
});
