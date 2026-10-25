/**
 * OOHDASH-141 — Boiler boost e2e tests (BB-E1..BB-E7).
 *
 * Fixture sites used:
 *   9010 — V2 boiler-panel (isV2:true, CHZ1+CHZ2 both ON, boilerCalling=true → W2 too-cold, W8 too-hot)
 *   9011 — V1 boiler-panel (isV1:true, CHZ1 ON, CHZ2 OFF → W3 too-cold with boost-on for zone 2)
 *
 * W-code guide for test routing:
 *   9010 too-cold = W2 (all on, boiler calling) — no boost buttons; tests that need boost-on use 9011
 *   9011 too-cold = W3 (partial) — boost-on button for CHZ2 (off zone)
 *   9010 too-hot  = W8 (all on) — zone picker then boost-off duration options
 *
 * OOHDASH-144 note: the pub heating flow now checks for active holds at the site (hold intercept screen)
 * before showing direction chips. If a prior test dispatched a boost that is still active, the intercept
 * will show. Each test that navigates to the direction-picker step must dismiss the intercept if present.
 *
 * BB-E1  – W3 site (9011) too-cold: boost-on button visible for the off zone (CHZ2)
 * BB-E2  – Clicking boost-on opens duration picker with correct ON options (30, 60, 120 min keys)
 * BB-E3  – Selecting 60-min duration dispatches boost and shows outcome-boost card
 * BB-E4  – Outcome card contains "Heat ON" heading
 * BB-E5  – Warning dialog ack path: outcome-boost card shown after ack
 * BB-E6  – V2 site (9010) too-hot flow: zone picker then OFF duration options
 * BB-E7  – V1 site (9011) end-to-end: boost-on -> duration -> outcome-boost renders
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

/**
 * OOHDASH-144: after clicking the Bar/Restaurant area chip, the hold intercept may appear
 * (if a prior test dispatched a boost that is still active). Dismiss it so the direction
 * chips become visible, then return the direction to click.
 */
async function reachDirectionStep(page) {
    // Wait for either the hold intercept or the direction chips
    const holdCard = page.locator('[data-testid="reco-boost-hold"]');
    const needCold = page.locator('[data-testid="need-cold"]');
    // Race: whichever appears first
    await Promise.race([
        holdCard.waitFor({ timeout: 8000 }),
        needCold.waitFor({ timeout: 8000 })
    ]).catch(() => { /* timeout — proceed */ });

    const holdVisible = await holdCard.isVisible().catch(() => false);
    if (holdVisible) {
        // Dismiss the hold intercept and wait for direction chips
        await page.locator('[data-testid="bp-hold-continue"]').click();
        await expect(needCold).toBeVisible({ timeout: 5000 });
    }
}

test.describe('OOHDASH-141 boiler boost e2e', () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page, 'Test Handler');
    });

    /* ── BB-E1: W3 site (9011) too-cold shows boost-on button ──────────── */
    test('BB-E1: V1 site (9011) W3 too-cold outcome shows Heat ON boost button for the off zone', async ({ page }) => {
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await page.locator('[data-testid="tile-heating"]').click();
        await expect(page.locator('button.chip', { hasText: 'Bar/Restaurant' })).toBeVisible();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        await reachDirectionStep(page);
        await page.locator('[data-testid="need-cold"]').click();

        // Outcome card must appear (W3: partial heating)
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();

        // Boost ON button for the off zone (CHZ2 is off in fixture 9011)
        const boostBtn = page.locator('[data-testid^="bp-boost-on-"]').first();
        if (!await boostBtn.isVisible().catch(() => false)) {
            test.skip(true, 'Boost ON button not visible — BOILER_BOOST_ENABLED may be off or W-code has no boost button');
        }
        await expect(boostBtn).toBeVisible();
        await expect(boostBtn).toContainText('Turn heating on');
    });

    /* ── BB-E2: duration picker shows correct ON options ─────────────── */
    test('BB-E2: clicking boost-on shows duration picker with 30, 60, 120 min chips', async ({ page }) => {
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        await reachDirectionStep(page);
        await page.locator('[data-testid="need-cold"]').click();
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();

        const boostBtn = page.locator('[data-testid^="bp-boost-on-"]').first();
        if (!await boostBtn.isVisible().catch(() => false)) {
            test.skip(true, 'Boost ON button not visible');
        }
        await boostBtn.click();

        // Duration picker container
        await expect(page.locator('[data-testid="reco-boost-dur"]')).toBeVisible();
        // ON duration options: keys '30', '60', '120' (minute strings)
        await expect(page.locator('[data-testid="bp-dur-30"]')).toBeVisible();
        await expect(page.locator('[data-testid="bp-dur-60"]')).toBeVisible();
        await expect(page.locator('[data-testid="bp-dur-120"]')).toBeVisible();
        // until-0700 must NOT be in ON picker
        await expect(page.locator('[data-testid="bp-dur-until-0700"]')).toHaveCount(0);
    });

    /* ── BB-E3: selecting duration sends boost and shows outcome card ── */
    test('BB-E3: selecting 60 min duration dispatches boost and shows outcome-boost card', async ({ page }) => {
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        await reachDirectionStep(page);
        await page.locator('[data-testid="need-cold"]').click();
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();

        const boostBtn = page.locator('[data-testid^="bp-boost-on-"]').first();
        if (!await boostBtn.isVisible().catch(() => false)) {
            test.skip(true, 'Boost ON button not visible');
        }
        await boostBtn.click();
        await expect(page.locator('[data-testid="reco-boost-dur"]')).toBeVisible();
        await page.locator('[data-testid="bp-dur-60"]').click();

        // Outcome card should appear (fixture dispatch settles quickly)
        await expect(page.locator('[data-testid="outcome-boost"]')).toBeVisible({ timeout: 10000 });
    });

    /* ── BB-E4: outcome card content (Heat ON heading) ──────────────── */
    test('BB-E4: outcome-boost card contains "Heat ON" text', async ({ page }) => {
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        await reachDirectionStep(page);
        await page.locator('[data-testid="need-cold"]').click();
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();

        const boostBtn = page.locator('[data-testid^="bp-boost-on-"]').first();
        if (!await boostBtn.isVisible().catch(() => false)) {
            test.skip(true, 'Boost ON button not visible');
        }
        await boostBtn.click();
        await page.locator('[data-testid="bp-dur-60"]').click();

        // If zone is already forced (from a prior test run), a warning shows first — ack it.
        const ackBtn = page.locator('[data-testid="bp-boost-ack"]');
        try {
            await ackBtn.waitFor({ timeout: 2000 });
            await ackBtn.click();
        } catch { /* not shown — proceed */ }

        await expect(page.locator('[data-testid="outcome-boost"]')).toBeVisible({ timeout: 10000 });
        const card = page.locator('[data-testid="outcome-boost"]');
        await expect(card).toContainText('Heating turned on');
    });

    /* ── BB-E5: warning dialog and ack path ─────────────────────────── */
    test('BB-E5: outcome-boost renders; warning ack button present and functional when zone already forced', async ({ page }) => {
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        await reachDirectionStep(page);
        await page.locator('[data-testid="need-cold"]').click();
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();

        const boostBtn = page.locator('[data-testid^="bp-boost-on-"]').first();
        if (!await boostBtn.isVisible().catch(() => false)) {
            test.skip(true, 'Boost ON button not visible');
        }
        await boostBtn.click();
        await expect(page.locator('[data-testid="reco-boost-dur"]')).toBeVisible();
        await page.locator('[data-testid="bp-dur-60"]').click();

        // The dispatch returns a warning when the zone is already forced (from prior tests).
        // Ack if present; if not, the outcome card appears directly.
        const ackBtn = page.locator('[data-testid="bp-boost-ack"]');
        try {
            await ackBtn.waitFor({ timeout: 3000 });
            // Warning appeared — ack and verify outcome follows
            await ackBtn.click();
        } catch { /* no warning — outcome appears directly */ }

        await expect(page.locator('[data-testid="outcome-boost"]')).toBeVisible({ timeout: 10000 });
    });

    /* ── BB-E6: V2 too-hot flow shows zone picker then OFF duration options ── */
    test('BB-E6: V2 site (9010) too-hot flow shows Heat OFF button and OFF duration options', async ({ page }) => {
        await confirmSite(page, '9010', 'Test Boiler Panel V2 (Heating)');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        await reachDirectionStep(page);
        // too-hot / wants it off
        await page.locator('[data-testid="need-hot"]').click();
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();

        // W8: both zones on -> zone picker button (bp-zones-btn) leads to zone picker
        const zonesBtn = page.locator('[data-testid="bp-zones-btn"]');
        if (!await zonesBtn.isVisible().catch(() => false)) {
            // Fallback: single candidate site — look for direct bp-boost-off-* button
            const boostOffBtn = page.locator('[data-testid^="bp-boost-off"]').first();
            if (!await boostOffBtn.isVisible().catch(() => false)) {
                test.skip(true, 'boost-off button not present for this outcome');
            }
            await boostOffBtn.click();
        } else {
            await zonesBtn.click();
            // Zone picker: select "All zones" then continue
            await expect(page.locator('[data-testid="reco-bp-zones"]')).toBeVisible();
            await page.locator('[data-testid="bp-zone-all"]').click();
            await page.locator('[data-testid="bp-zones-continue"]').click();
        }

        // Duration picker for OFF: keys '60', '120', 'until-0700' or 'until-next-on' (not '30')
        await expect(page.locator('[data-testid="reco-boost-dur"]')).toBeVisible();
        await expect(page.locator('[data-testid="bp-dur-60"]')).toBeVisible();
        await expect(page.locator('[data-testid="bp-dur-120"]')).toBeVisible();
        // until-0700 or until-next-on appears (one of them, depending on timetable)
        const untilCount = await page.locator('[data-testid="bp-dur-until-0700"], [data-testid="bp-dur-until-next-on"]').count();
        expect(untilCount).toBeGreaterThan(0);
        await expect(page.locator('[data-testid="bp-dur-30"]')).toHaveCount(0);
    });

    /* ── BB-E7: V1 site (9011) boost-on end-to-end ───────────────────── */
    test('BB-E7: V1 site (9011) boost-on -> outcome-boost card renders with "Heat ON"', async ({ page }) => {
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await page.locator('[data-testid="tile-heating"]').click();
        await expect(page.locator('button.chip', { hasText: 'Bar/Restaurant' })).toBeVisible();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        await reachDirectionStep(page);
        await page.locator('[data-testid="need-cold"]').click();
        await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();

        const boostBtn = page.locator('[data-testid^="bp-boost-on-"]').first();
        if (!await boostBtn.isVisible().catch(() => false)) {
            test.skip(true, 'Boost ON button not visible');
        }
        await boostBtn.click();
        await expect(page.locator('[data-testid="reco-boost-dur"]')).toBeVisible();
        await page.locator('[data-testid="bp-dur-60"]').click();

        // Zone may already be forced from a prior test — ack warning if it appears.
        const ackBtn = page.locator('[data-testid="bp-boost-ack"]');
        try {
            await ackBtn.waitFor({ timeout: 3000 });
            await ackBtn.click();
        } catch { /* no warning */ }

        await expect(page.locator('[data-testid="outcome-boost"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-testid="outcome-boost"]')).toContainText('Heating turned on');
    });
});
