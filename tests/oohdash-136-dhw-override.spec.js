/**
 * OOHDASH-136 — DHW override state display (read-only).
 *
 * E1-E12 cover the browser-twin rendering: tag/headline/explanation correctness,
 * hidden-card sites, clock-advance past end time (E10), and ticket sentence (E12).
 *
 * Fixed browser clock: NOW_MS = 1792608000000 (2026-10-21T18:40:00Z = 19:40 BST)
 * All tests install this clock before signIn so Date.now() is deterministic.
 *
 * Fixture sites used:
 *   9361 — V2 auto (E1, E12)
 *   9362 — V2 on-until 20:20 BST     (E2, E10)
 *   9363 — V2 off-until 06:00 BST tomorrow (E3)
 *   9364 — V2 cant-confirm (bad data) (E4)
 *   9365 — V2 stale (3h15m old)      (E5)
 *   9366 — V1 on-v1                  (E6)
 *   9367 — V1 off-v1                 (E7)
 *   9368 — visible=false, separate-dhw (E8)
 *   9369 — visible=false, dhw-not-wired (E9)
 *   9003 — no boilerControl           (E11)
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

const NOW_MS = 1792608000000; // 2026-10-21T18:40:00Z = 19:40 BST

/** Confirm site and click the Hot water tile to reach stage 0. */
async function openHotWater(page, siteNo, siteName) {
    await confirmSite(page, siteNo, siteName);
    await page.locator('[data-testid="tile-hotwater"]').click();
}

test.describe('OOHDASH-136 DHW override card', () => {
    test.beforeEach(async ({ page }) => {
        await page.clock.install({ time: NOW_MS });
        await signIn(page, 'Test Handler');
    });

    // ---- V2 states --------------------------------------------------------

    test('E1: V2 auto — card shows Auto tag and on-schedule headline', async ({ page }) => {
        await openHotWater(page, '9361', 'The Plough Inn');
        const card = page.locator('[data-testid="hw-dhw-override"]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-testid="hw-dhw-override-tag"]')).toHaveText('Auto');
        await expect(card).toContainText('Hot water override: Auto (on schedule)');
        await expect(card).toContainText("normal timetable");
    });

    test('E2: V2 on-until 20:20 BST — card shows Override ON tag and end time', async ({ page }) => {
        await openHotWater(page, '9362', 'The Golden Lion');
        const card = page.locator('[data-testid="hw-dhw-override"]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-testid="hw-dhw-override-tag"]')).toHaveText('Override ON');
        await expect(card).toContainText('Override ON until 20:20');
        await expect(card).toContainText('20:20');
    });

    test('E3: V2 off-until 06:00 BST tomorrow — card shows Override OFF tag and end time', async ({ page }) => {
        await openHotWater(page, '9363', 'The Kings Arms');
        const card = page.locator('[data-testid="hw-dhw-override"]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-testid="hw-dhw-override-tag"]')).toHaveText('Override OFF');
        await expect(card).toContainText('Override OFF until 06:00 tomorrow');
        await expect(card).toContainText('06:00 tomorrow');
    });

    test("E4: V2 cant-confirm (bad data) — card shows Can't confirm tag and unreadable message", async ({ page }) => {
        await openHotWater(page, '9364', 'The White Hart');
        const card = page.locator('[data-testid="hw-dhw-override"]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-testid="hw-dhw-override-tag"]')).toHaveText("Can't confirm");
        await expect(card).toContainText("doesn't make sense");
    });

    test("E5: V2 stale — browser twin re-applies staleness; shows Can't confirm tag with age", async ({ page }) => {
        await openHotWater(page, '9365', 'The Red Lion');
        const card = page.locator('[data-testid="hw-dhw-override"]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-testid="hw-dhw-override-tag"]')).toHaveText("Can't confirm");
        // _dhwFmtAgo: 3h15m ago rounds to 3 hours → "3 hours ago"
        await expect(card).toContainText('hours ago');
    });

    // ---- V1 states --------------------------------------------------------

    test('E6: V1 on-v1 — card shows Override ON tag and V1 explanation', async ({ page }) => {
        await openHotWater(page, '9366', 'The Fox and Hounds');
        const card = page.locator('[data-testid="hw-dhw-override"]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-testid="hw-dhw-override-tag"]')).toHaveText('Override ON');
        await expect(card).toContainText("doesn't give an end time");
    });

    test('E7: V1 off-v1 — card shows Override OFF tag and V1 explanation', async ({ page }) => {
        await openHotWater(page, '9367', 'The Royal Oak');
        const card = page.locator('[data-testid="hw-dhw-override"]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-testid="hw-dhw-override-tag"]')).toHaveText('Override OFF');
        await expect(card).toContainText("switched off on the boiler panel");
    });

    // ---- hidden card (visible=false) --------------------------------------

    test('E8: separate-dhw (visible=false) — DHW card not present', async ({ page }) => {
        await openHotWater(page, '9368', 'The Bell');
        await expect(page.locator('[data-testid="hw-dhw-override"]')).toHaveCount(0);
    });

    test('E9: dhw-not-wired (visible=false) — DHW card not present', async ({ page }) => {
        await openHotWater(page, '9369', 'The Swan');
        await expect(page.locator('[data-testid="hw-dhw-override"]')).toHaveCount(0);
    });

    // ---- clock-advance past end time (E10) --------------------------------

    test('E10: V2 on-until; clock advanced past end time — auto-ended shows Auto tag', async ({ page }) => {
        // untilMs for site 9362 = 1792610400000 (19:20Z = 20:20 BST).
        // Advance clock to 19:20:30Z (30s past untilMs). The browser twin re-evaluates.
        await page.clock.setFixedTime(1792610430000);
        await openHotWater(page, '9362', 'The Golden Lion');
        const card = page.locator('[data-testid="hw-dhw-override"]');
        await expect(card).toBeVisible();
        await expect(page.locator('[data-testid="hw-dhw-override-tag"]')).toHaveText('Auto');
        await expect(card).toContainText('Auto (on schedule)');
        await expect(card).toContainText('override ended at 20:20');
    });

    // ---- no boilerControl (E11) ------------------------------------------

    test('E11: no boilerControl — DHW card not present on Hot water step', async ({ page }) => {
        await openHotWater(page, '9003', 'Test No BoilerControl');
        await expect(page.locator('[data-testid="hw-dhw-override"]')).toHaveCount(0);
    });

    // ---- ticket sentence (E12) -------------------------------------------

    test('E12: capture path — ticket detail includes DHW override sentence', async ({ page }) => {
        // Site 9361: V2 auto. Card is shown; proceeding to capture should append ticket sentence.
        await openHotWater(page, '9361', 'The Plough Inn');
        await expect(page.locator('[data-testid="hw-dhw-override"]')).toBeVisible();

        await page.locator('[data-testid="hw-capture"]').click();

        // finishOutcome shows a confirm step first — check the ticket sentence in the detail,
        // then click "Record outcome" to fire the POST and reach outcome-captured.
        const confirmStep = page.locator('[data-testid="confirm-step"]');
        await expect(confirmStep).toBeVisible();
        await expect(confirmStep).toContainText('Auto (on schedule)');
        await page.locator('[data-testid="record-outcome"]').click();

        const outcome = page.locator('[data-testid="outcome-captured"]');
        await expect(outcome).toBeVisible();
        await expect(outcome).toContainText(/Ticket #\d+/);
    });
});
