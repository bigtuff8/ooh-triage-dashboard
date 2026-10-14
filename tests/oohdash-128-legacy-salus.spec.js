/**
 * OOHDASH-128 — legacy bare-salus load e2e (design §3-§8, §12).
 *
 * Covers the six journeys specified in the build plan (E1-E6). All tests run in fixture mode
 * against sites 7003 (Bramley Farm Inn — mixed-health with unplaced unit) and 7004 (Pine Tree
 * Farm — unplaced only, no area chips). Site 6218 (existing fixture) used for regression (E5).
 *
 *   E1  site 7003 heating step 0: area chips render, no area-unmapped, unplaced footnote visible.
 *   E2  site 7003 Accommodation: mixed-health reading line, area-not-reporting note, need-warm present.
 *   E3  site 7003 Bar/Restaurant: plural dark-fleet heading, capture path reaches outcome-captured.
 *   E4  site 7004 heating step 0: no-area alert, unplaced footnote, no area chips.
 *   E5  regression: existing site 6218 heating areas unchanged; no unplaced footnote; area-unmapped still present.
 *   E6  phone viewport (390x844): E1+E2 steps render without horizontal scroll; notes visible.
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe('OOHDASH-128 legacy bare-salus load', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    // ── E1: site 7003 step 0 — area chips, no area-unmapped, unplaced footnote ──────────────────
    test('E1: site 7003 heating step 0 — two area chips, D3 guards area-unmapped, unplaced footnote shown', async ({ page }) => {
        await confirmSite(page, '7003', 'Bramley Farm Inn');
        await page.locator('[data-testid="tile-heating"]').click();

        // Two area chips visible.
        await expect(page.locator('[data-testid="area-accommodation"]')).toBeVisible();
        await expect(page.locator('[data-testid="area-accommodation"]')).toHaveText('Accommodation');
        await expect(page.locator('[data-testid="area-bar-restaurant"]')).toBeVisible();
        await expect(page.locator('[data-testid="area-bar-restaurant"]')).toHaveText('Bar/Restaurant');

        // D3: the one unplaced bare-salus (7003-z-1, area=null) is excluded from the fallback chip.
        await expect(page.locator('[data-testid="area-unmapped"]')).toHaveCount(0);

        // Unplaced footnote surfaces the unit without exposing device IDs or serials.
        const note = page.locator('[data-testid="heating-unplaced-note"]');
        await expect(note).toBeVisible();
        await expect(note).toContainText('1 older Salus heating unit that could not be matched to an area');

        // No raw device serial on screen.
        const flow = page.locator('[data-testid="flow-panel"]');
        await expect(flow).not.toContainText('STA101');
    });

    // ── E2: site 7003 Accommodation — mixed-health reading, area-not-reporting note ──────────────
    test('E2: site 7003 Accommodation — reading from only online zone, three offline units noted', async ({ page }) => {
        await confirmSite(page, '7003', 'Bramley Farm Inn');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('[data-testid="area-accommodation"]').click();

        // The one online device (salusit700) reading is shown.
        const body = page.locator('.flowbody');
        await expect(body).toContainText('19.5');

        // Mixed-health reading line: "the only reporting zone in Accommodation".
        await expect(body).toContainText('the only reporting zone in Accommodation');

        // Area-not-reporting note: 3 offline units (f-1, f-2, f-3).
        const notReporting = page.locator('[data-testid="area-not-reporting-note"]');
        await expect(notReporting).toBeVisible();
        await expect(notReporting).toContainText('3 other heating units in Accommodation are not reporting');
        await expect(notReporting).toContainText('Nothing done on this call caused this');

        // Controls are still available for the reporting unit.
        await expect(page.locator('[data-testid="need-warm"]')).toBeVisible();
    });

    // ── E3: site 7003 Bar/Restaurant — plural dark-fleet, capture path ───────────────────────────
    test('E3: site 7003 Bar/Restaurant — plural dark-fleet heading, capture reaches outcome-captured', async ({ page }) => {
        await confirmSite(page, '7003', 'Bramley Farm Inn');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('[data-testid="area-bar-restaurant"]').click();

        // Both Bar/Restaurant devices are bare-salus, all offline → plural dark-fleet.
        const reco = page.locator('[data-testid="reco-dark-fleet"]');
        await expect(reco).toBeVisible();
        await expect(reco).toContainText('The heating units in this area are not reporting.');

        // No control buttons present.
        await expect(page.locator('[data-testid="need-warm"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="need-cool"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="need-off"]')).toHaveCount(0);

        // Capture and record outcome.
        await page.locator('[data-testid="dark-capture"]').click();
        await page.locator('[data-testid="record-outcome"]').click();

        const outcome = page.locator('[data-testid="outcome-captured"]');
        await expect(outcome).toBeVisible();
        await expect(outcome).toContainText('not reporting');
    });

    // ── E4: site 7004 — no-area alert, unplaced footnote, no area chips ──────────────────────────
    test('E4: site 7004 heating step 0 — no area chips, rewarded no-area alert, unplaced footnote visible', async ({ page }) => {
        await confirmSite(page, '7004', 'Pine Tree Farm');
        await page.locator('[data-testid="tile-heating"]').click();

        // C5: reworded no-area alert when only unplaced bare-salus present.
        await expect(page.locator('.alert.warn')).toContainText('No heating area can be checked on Lighthouse at this site.');

        // Unplaced footnote explains the unit.
        await expect(page.locator('[data-testid="heating-unplaced-note"]')).toBeVisible();

        // No area chips.
        await expect(page.locator('[data-testid="area-accommodation"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="area-bar-restaurant"]')).toHaveCount(0);
    });

    // ── E5: regression — existing site 6218 unchanged ────────────────────────────────────────────
    test('E5: regression — existing site 6218 heating areas intact; no legacy-salus noise introduced', async ({ page }) => {
        await confirmSite(page, '6218', 'Kings Head');
        await page.locator('[data-testid="tile-heating"]').click();

        // Both area chips still present.
        await expect(page.locator('[data-testid="area-accommodation"]')).toBeVisible();
        await expect(page.locator('[data-testid="area-bar-restaurant"]')).toBeVisible();

        // Unmapped fallback chip still present (unmapped iT500 in 6218 fixture — no bare-salus).
        await expect(page.locator('[data-testid="area-unmapped"]')).toBeVisible();

        // No unplaced footnote: 6218 has no bare-salus devices.
        await expect(page.locator('[data-testid="heating-unplaced-note"]')).toHaveCount(0);
    });

    // ── E6: phone viewport 390x844 — no horizontal scroll, notes visible ─────────────────────────
    test('E6: 390x844 phone layout — E1+E2 steps render without horizontal scroll', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });

        // E1 portion: area chips and unplaced footnote visible without scroll.
        await confirmSite(page, '7003', 'Bramley Farm Inn');
        await page.locator('[data-testid="tile-heating"]').click();
        await expect(page.locator('[data-testid="area-accommodation"]')).toBeVisible();
        await expect(page.locator('[data-testid="heating-unplaced-note"]')).toBeVisible();

        // No horizontal page scroll.
        const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        expect(noHScroll).toBe(true);

        // E2 portion: area-not-reporting note visible after choosing Accommodation.
        await page.locator('[data-testid="area-accommodation"]').click();
        await expect(page.locator('[data-testid="area-not-reporting-note"]')).toBeVisible();

        // Still no horizontal scroll after rendering the reading.
        const noHScrollAfter = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        expect(noHScrollAfter).toBe(true);
    });
});
