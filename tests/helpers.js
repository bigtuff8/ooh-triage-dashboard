/** Shared test helpers. */
import { expect } from '@playwright/test';

/** Signs in via the dev identity page (AUTH_MODE=dev only). */
export async function signIn(page, who = 'Test Handler') {
    await page.goto('/auth/dev');
    await page.locator(`button:has-text("${who}")`).click();
    await expect(page.locator('[data-testid="operator-name"]')).toHaveText(who);
}

/** Searches for a site with realistic typing and opens it via keyboard. */
export async function openSiteByKeyboard(page, query) {
    await page.locator('[data-testid="site-search"]').pressSequentially(query, { delay: 40 });
    await expect(page.locator('[data-testid="search-results"] .ri').first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
}

/** Full path to a confirmed workspace. */
export async function confirmSite(page, query, siteName) {
    await openSiteByKeyboard(page, query);
    await expect(page.locator('[data-testid="confirm-gate"]')).toContainText(siteName);
    await page.locator('[data-testid="confirm-site"]').click();
    await expect(page.locator('[data-testid="device-board"]')).toBeVisible();
}
