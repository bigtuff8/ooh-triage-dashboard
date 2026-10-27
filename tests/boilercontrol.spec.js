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

/**
 * OOHDASH-144 (section 8.3): the pub heating flow now shows a hold-intercept screen
 * when an active boost hold exists at the site, before showing direction chips.
 * Any test that navigates through the Bar/Restaurant chip to need-cold/need-hot must
 * dismiss the intercept if present.
 */
async function reachDirectionStep(page) {
    const holdCard = page.locator('[data-testid="reco-boost-hold"]');
    const needCold = page.locator('[data-testid="need-cold"]');
    await Promise.race([
        holdCard.waitFor({ timeout: 5000 }),
        needCold.waitFor({ timeout: 5000 })
    ]).catch(() => {});
    if (await holdCard.isVisible().catch(() => false)) {
        await page.locator('[data-testid="bp-hold-continue"]').click();
        await expect(needCold).toBeVisible({ timeout: 5000 });
    }
}

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

    test('BC-E4: V2 site (9001) — heating scope row shows Monitored only (boilerControl heating hard-coded to mon, OOHDASH-135 Item 4)', async ({ page }) => {
        await confirmSite(page, '9001', 'Test BoilerControl V2 (DHW)');
        await expect(page.locator('[data-testid="scope-list"] li:has-text("Heating")')).toContainText('Monitored only');
    });

    test('BC-E5: V2 site (9001) — OOHDASH-123 boost removed: hotwater flow shows capture-and-escalate, NO boost chip', async ({ page }) => {
        await confirmSite(page, '9001', 'Test BoilerControl V2 (DHW)');
        await page.locator('[data-testid="tile-hotwater"]').click();
        // J5/D-BOOST: the dishonest boost chip is gone even on a dhwControllable V2 site.
        await expect(page.locator('[data-testid="hw-boost-yes"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="hw-capture"]')).toBeVisible();
    });
});

test.describe('OOHDASH-139 boiler panel heating flow', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    test('BP-E1: V2 boiler-panel site (9010) — Bar/Restaurant chip shows, outcome renders, buttons work', async ({ page }) => {
        await confirmSite(page, '9010', 'Test Boiler Panel V2 (Heating)');
        await page.locator('[data-testid="tile-heating"]').click();
        // Bar/Restaurant chip should appear (boiler panel area)
        await expect(page.locator('button.chip', { hasText: 'Bar/Restaurant' })).toBeVisible();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        // OOHDASH-144 §8.3: dismiss hold intercept if an active boost hold exists at this site
        await reachDirectionStep(page);
        // Stage 1: two chips for need (not 4 — boiler panel only has cold/hot)
        await expect(page.locator('[data-testid="need-cold"]')).toBeVisible();
        await expect(page.locator('[data-testid="need-hot"]')).toBeVisible();
        // Click Too cold — should get W2 (all on, boiler calling) for site 9010
        await page.locator('[data-testid="need-cold"]').click();
        // Outcome card must render
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();
        // Capture/advice button must be present and clickable (guards curly-quote defect)
        const actionBtn = page.locator('[data-testid="reco-boiler-panel"] button').first();
        await expect(actionBtn).toBeVisible();
        // Click the first action button — must not crash
        await actionBtn.click();
    });

    test('BP-E2: V1 boiler-panel site (9011) — Bar/Restaurant chip shows, partial outcome W3 renders', async ({ page }) => {
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await page.locator('[data-testid="tile-heating"]').click();
        await expect(page.locator('button.chip', { hasText: 'Bar/Restaurant' })).toBeVisible();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        // OOHDASH-144 §8.3: dismiss hold intercept if an active boost hold exists at this site
        await reachDirectionStep(page);
        await page.locator('[data-testid="need-cold"]').click();
        // W3: partial (zone 1 on, zone 2 off)
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toContainText('Part of the pub heating is off');
    });

    test('Regression: Accommodation Salus flow unchanged (site 6832)', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        await page.locator('[data-testid="tile-heating"]').click();
        await expect(page.locator('button.chip', { hasText: 'Accommodation' })).toBeVisible();
        await page.locator('button.chip', { hasText: 'Accommodation' }).click();
        // Normal Salus flow — 4 need chips present (not 2 like boiler panel)
        await expect(page.locator('[data-testid="need-warm"]')).toBeVisible();
        await expect(page.locator('[data-testid="need-cool"]')).toBeVisible();
    });
});

test.describe('OOHDASH-151: V1 day-varying schedule (guard lifted)', () => {
    // Site 9011 CHZ1: every-day (loops=1111111), CHZ2: day-varying (loops=1111100 = Sun-Thu, sun-first).
    // Before OOHDASH-151: everyDayOnly guard made CHZ2 timetable.nextOn null.
    // After OOHDASH-151: guard removed; CHZ2 timetable.nextOn is computed from the sun-first schedule.
    test('BC-151-E1: V1 site (9011) CHZ2 day-varying timetable — nextOn is non-null and falls on an active sun-first day', async ({ page }) => {
        await signIn(page, 'Test Handler');
        // Confirm via API (returns workspace inline — no second round-trip needed).
        const resp = await page.request.post('/api/sites/9011/confirm');
        expect(resp.ok()).toBe(true);
        const { workspace } = await resp.json();
        const zones = workspace.boilerControl?.heating?.zones ?? [];
        const chz2 = zones.find(z => z.zone === 'CHZ2');
        expect(chz2, 'CHZ2 zone must be present in V1 fixture 9011').toBeTruthy();
        // Core assertion: nextOn must be non-null (was null with the everyDayOnly guard).
        expect(chz2.timetable, 'CHZ2 timetable must be non-null').not.toBeNull();
        expect(chz2.timetable.everyDay, 'CHZ2 everyDay must be false (day-varying schedule)').toBe(false);
        expect(chz2.timetable.nextOn, 'CHZ2 nextOn must be non-null after OOHDASH-151 guard removal').not.toBeNull();
        // Sun-first sanity check: loops=1111100 → active jsDay [0,1,2,3,4] (Sun-Thu).
        // nextOn atMs must land on one of those days under correct (sun-first) decoding.
        // Definitive sun-first day assertions live in TT-4a/b/c (unit tests, fixed reference time).
        const nextOnJsDay = new Date(chz2.timetable.nextOn.atMs).getDay();
        expect([0, 1, 2, 3, 4], 'nextOn must fall on a sun-first active day (Sun–Thu, jsDay 0–4) for loops=1111100').toContain(nextOnJsDay);
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
