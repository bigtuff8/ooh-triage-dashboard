/**
 * OOHDASH-140: E2E tests for the Tuya kitchen circuit flow using fixture site 8888.
 *
 * Site 8888 — "OOHDASH-140 Tuya Fixture Site" (Greene King)
 * 5 kitchen devices with preloaded Tuya fixture state → no real API calls.
 *
 * Expected verdicts (from tuyaFixture data):
 *   gk-8888-fryer-1       — OFF + always-ON schedule  → A (should have come on)
 *   gk-8888-glasswasher-1 — ON 500 cur_power (50W) + always-ON schedule → B (on as expected)
 *   gk-8888-dishwasher-1  — OFF + empty schedule      → D (no active schedule = always-on category)
 *   gk-8888-potwash-1     — ON 0W + always-ON schedule → E (on but drawing nothing)
 *   gk-8888-bainmarie-1   — OFF + ON-at-23:59/OFF-at-00:00 schedule → C (off per schedule)
 *
 * OOHDASH-159 J1 override-first behaviour (rev 5):
 *   OFF devices (A, C, D): kitchen-override-step appears FIRST; no kitchen-verdict card.
 *     - kitchen-override-ok  → outcome-captured (E1 auto-submit — override worked)
 *     - kitchen-override-fail / kitchen-no-panel → kitchen-service-question (kitchen-critical)
 *   ON devices (B, E): kitchen-verdict appears directly; no override step.
 *   Always-on category (verdict D): kitchen-fuse-fixed chip also shown in override step.
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe('OOHDASH-140 Tuya kitchen flow — fixture site 8888', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    async function openKitchen(page) {
        await confirmSite(page, '8888', 'OOHDASH-140');
        await page.locator('[data-testid="tile-kitchen"]').click();
    }

    // ── TF-140-01: Live mode — picker appears ──────────────────────────────────

    test('TF-140-01: multi-circuit kitchen picker appears (live mode)', async ({ page }) => {
        await openKitchen(page);
        // Fixture site has 5 kitchen devices → picker must appear
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        // All 5 circuits listed (index 0-4)
        for (let i = 0; i < 5; i++) {
            await expect(page.locator(`[data-testid="kitchen-circuit-${i}"]`)).toBeVisible();
        }
        // kitchen-all button present
        await expect(page.locator('[data-testid="kitchen-all"]')).toBeVisible();
    });

    // ── TF-140-02: Fryer → J1 override step (OFF, verdict A — should have come on) ──

    test('TF-140-02: fryer circuit → J1 override step appears with verdict A info (OFF but scheduled on)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Fryer' }).click();
        // J1 override-first: override step appears for OFF devices before any verdict card
        const overrideStep = page.locator('[data-testid="kitchen-override-step"]');
        await expect(overrideStep).toBeVisible();
        // Info box contains verdict A reasoning (should have come on per schedule)
        await expect(overrideStep).toContainText('it should have come on');
        await expect(page.locator('[data-testid="kitchen-override-ok"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-override-fail"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-no-panel"]')).toBeVisible();
    });

    // ── TF-140-03: Glasswasher → verdict B (ON device, no override step) ───────

    test('TF-140-03: glasswasher circuit → verdict B (ON as expected, no override step)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Glass washer' }).click();
        // ON device — no override step; kitchen-verdict appears directly
        const card = page.locator('[data-testid="kitchen-verdict"]');
        await expect(card).toBeVisible();
        // Verdict B: device has power and is switched on
        await expect(card).toContainText('has power and is switched on');
        // Service contractor chips
        await expect(page.locator('[data-testid="kitchen-repairs"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-still-ours"]')).toBeVisible();
    });

    // ── TF-140-04: Dishwasher → J1 override step with fuse option (OFF, verdict D) ─

    test('TF-140-04: dishwasher circuit → override step with fuse-fixed option (always-on, no schedule)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Dishwasher' }).click();
        // J1 override-first: override step for OFF device; verdict D shows fuse-fixed chip
        await expect(page.locator('[data-testid="kitchen-override-step"]')).toBeVisible();
        // Always-on category (verdict D) → kitchen-fuse-fixed chip also shown
        await expect(page.locator('[data-testid="kitchen-fuse-fixed"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-override-ok"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-override-fail"]')).toBeVisible();
    });

    // ── TF-140-05: Potwash → verdict E (ON but drawing no power, no override step) ─

    test('TF-140-05: pot wash circuit → verdict E (ON but no load, no override step)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Pot wash' }).click();
        // ON device — no override step; kitchen-verdict appears directly
        const card = page.locator('[data-testid="kitchen-verdict"]');
        await expect(card).toBeVisible();
        // Verdict E: device is on but the appliance is not drawing any power
        await expect(card).toContainText("isn't drawing any");
        await expect(page.locator('[data-testid="kitchen-repairs"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-still-ours"]')).toBeVisible();
    });

    // ── TF-140-06: Bain-marie → J1 override step (OFF per schedule, verdict C) ──

    test('TF-140-06: bain-marie circuit → J1 override step appears (OFF per schedule)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Bain-marie' }).click();
        // J1 override-first: override step for OFF device; verdict C (off per timetable)
        const overrideStep = page.locator('[data-testid="kitchen-override-step"]');
        await expect(overrideStep).toBeVisible();
        // Info box contains verdict C reasoning (timetable has it off until next-on time)
        await expect(overrideStep).toContainText('its timetable has it off until');
        // No fuse-fixed chip for verdict C (not always-on category)
        await expect(page.locator('[data-testid="kitchen-fuse-fixed"]')).toHaveCount(0);
    });

    // ── TF-140-07: kitchen-all → J1 override step (3 circuits OFF, 2 ON) ───────

    test('TF-140-07: kitchen-all shows override step for the OFF circuits', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-all"]').click();
        // 3 circuits are OFF (fryer A, dishwasher D, bain-marie C) → override step appears
        await expect(page.locator('[data-testid="kitchen-override-step"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-override-ok"]')).toBeVisible();
        // Dishwasher (verdict D, always-on) → fuse-fixed chip shown
        await expect(page.locator('[data-testid="kitchen-fuse-fixed"]')).toBeVisible();
    });

    // ── TF-140-08: override-ok follow-up records outcome ──────────────────────

    test('TF-140-08: after verdict A — override-ok records captured outcome', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Fryer' }).click();
        // J1 override-first: override step appears before verdict
        // E1: kitchen-override-ok auto-submits for non-P1 → outcome-captured directly
        await page.locator('[data-testid="kitchen-override-ok"]').click();
        await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible({ timeout: 10000 });
    });

    // ── TF-140-09: fuse-fixed on verdict D records captured outcome (E1) ──────

    test('TF-140-09: after override step — fuse-fixed records captured outcome', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Dishwasher' }).click();
        // J1 override-first: override step appears for OFF device (verdict D)
        await expect(page.locator('[data-testid="kitchen-override-step"]')).toBeVisible();
        // E1: kitchen-fuse-fixed auto-submits for non-P1 → outcome-captured directly
        await page.locator('[data-testid="kitchen-fuse-fixed"]').click();
        await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible({ timeout: 10000 });
    });
});
