/**
 * OOHDASH-114-F1 + OOHDASH-115-F2 — boilerControl controllability + C&B scope trim.
 *
 * BC-E1..E5: F1 — V2/V1 boilerControl fixture sites correctly show hotwater/heating as ctl.
 * F2-1..F2-2: F2 — C&B site shows 5 scope rows; non-C&B shows 7 scope rows.
 *
 * Fixture sites used:
 *   9001 — V2 boilerControl (dhwControllable=true, heatingControllable=true)
 *   9002 — V1 boilerControl (dhwControllable=true, heatingControllable=true)
 *   9003 — no boilerControl device (hotwater=none)
 *   6999 — C&B (boilerControl.present=true) for F2 scope-trim test
 *   6832 — non-C&B (Old Grey Mare, Farmhouse Inns) for F2 control
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe('OOHDASH-114-F1 boilerControl controllability', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    test('BC-E1: V2 site (9001) — hotwater scope row shows Controllable from here', async ({ page }) => {
        await confirmSite(page, '9001', 'Test BoilerControl V2 (DHW)');
        await expect(page.locator('[data-testid="scope-list"] li:has-text("Hot water")')).toContainText('Controllable from here');
    });

    test('BC-E2: V1 site (9002) — hotwater scope row shows Controllable from here', async ({ page }) => {
        await confirmSite(page, '9002', 'Test BoilerControl V1 (DHW)');
        await expect(page.locator('[data-testid="scope-list"] li:has-text("Hot water")')).toContainText('Controllable from here');
    });

    test('BC-E3: no boilerControl (9003) — hotwater scope row shows Not controllable here', async ({ page }) => {
        await confirmSite(page, '9003', 'Test No BoilerControl');
        await expect(page.locator('[data-testid="scope-list"] li:has-text("Hot water")')).toContainText('Not controllable here');
    });

    test('BC-E4: V2 site (9001) — heating scope row shows Controllable from here', async ({ page }) => {
        await confirmSite(page, '9001', 'Test BoilerControl V2 (DHW)');
        await expect(page.locator('[data-testid="scope-list"] li:has-text("Heating")')).toContainText('Controllable from here');
    });

    test('BC-E5: V2 site (9001) — hotwater flow stage 0 shows DHW boost chip when dhwControllable=true', async ({ page }) => {
        await confirmSite(page, '9001', 'Test BoilerControl V2 (DHW)');
        await page.locator('[data-testid="tile-hotwater"]').click();
        await expect(page.locator('[data-testid="hw-boost-yes"]')).toBeVisible();
    });
});

test.describe('OOHDASH-115-F2 C&B scope trim', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    test('F2-1: C&B site (6999) shows exactly 5 scope rows — electrics and boiler absent', async ({ page }) => {
        await confirmSite(page, '6999', 'The Crafted Tap');
        const scope = page.locator('[data-testid="scope-list"]');
        await expect(scope.locator('li')).toHaveCount(5);
        await expect(scope).toContainText('Heating');
        await expect(scope).toContainText('Hot water');
        await expect(scope).toContainText('Kitchen equipment');
        await expect(scope).toContainText('External lighting');
        await expect(scope).toContainText('Extractor fans');
        await expect(scope).not.toContainText('Internal lighting');
        await expect(scope).not.toContainText('Boiler internals');
    });

    test('F2-2: non-C&B site (6832) shows all 7 scope rows including electrics and boiler', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        const scope = page.locator('[data-testid="scope-list"]');
        await expect(scope.locator('li')).toHaveCount(7);
        await expect(scope).toContainText('Heating');
        await expect(scope).toContainText('Internal lighting');
        await expect(scope).toContainText('Boiler internals');
    });
});
