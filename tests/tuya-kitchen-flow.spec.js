/**
 * OOHDASH-140: E2E tests for the Tuya kitchen circuit flow using fixture site 8888.
 *
 * Site 8888 — "OOHDASH-140 Tuya Fixture Site" (Greene King)
 * 5 kitchen devices with preloaded Tuya fixture state → no real API calls.
 *
 * Expected verdicts (from tuyaFixture data):
 *   gk-8888-fryer-1     — OFF + always-ON schedule  → A (should have come on)
 *   gk-8888-glasswasher-1 — ON 500 cur_power (50W) + always-ON schedule → B (on as expected)
 *   gk-8888-dishwasher-1  — OFF + empty schedule      → D (no active schedule)
 *   gk-8888-potwash-1   — ON 0W + always-ON schedule → E (on but drawing nothing)
 *   gk-8888-bainmarie-1 — OFF + ON-at-23:59/OFF-at-00:00 schedule → C (off per schedule)
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

    // ── TF-140-02: Fryer → verdict A ──────────────────────────────────────────

    test('TF-140-02: fryer circuit → verdict A (OFF but scheduled on)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        // Click the Fryer chip (displayName = Fryer)
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Fryer' }).click();
        const card = page.locator('[data-testid="kitchen-verdict"]');
        await expect(card).toBeVisible();
        // Verdict A wording: "is OFF but the schedule says it should have come on"
        await expect(card).toContainText('is OFF but the schedule says it should have come on');
        // Override chips present
        await expect(page.locator('[data-testid="kitchen-override-ok"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-override-fail"]')).toBeVisible();
    });

    // ── TF-140-03: Glasswasher → verdict B ────────────────────────────────────

    test('TF-140-03: glasswasher circuit → verdict B (ON as expected)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Glass washer' }).click();
        const card = page.locator('[data-testid="kitchen-verdict"]');
        await expect(card).toBeVisible();
        // Verdict B wording: "is ON as expected"
        await expect(card).toContainText('is ON as expected');
        // Repairs chips
        await expect(page.locator('[data-testid="kitchen-repairs"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-still-ours"]')).toBeVisible();
    });

    // ── TF-140-04: Dishwasher → verdict D ─────────────────────────────────────

    test('TF-140-04: dishwasher circuit → verdict D (OFF, no schedule)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Dishwasher' }).click();
        const card = page.locator('[data-testid="kitchen-verdict"]');
        await expect(card).toBeVisible();
        // Verdict D wording: "no active schedule"
        await expect(card).toContainText('no active schedule');
        // Fuse chips
        await expect(page.locator('[data-testid="kitchen-fuse-fixed"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-fuse-fail"]')).toBeVisible();
    });

    // ── TF-140-05: Potwash → verdict E ────────────────────────────────────────

    test('TF-140-05: pot wash circuit → verdict E (ON but no load)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Pot wash' }).click();
        const card = page.locator('[data-testid="kitchen-verdict"]');
        await expect(card).toBeVisible();
        // Verdict E wording: "drawing no power"
        await expect(card).toContainText('drawing no power');
        // Repairs chips
        await expect(page.locator('[data-testid="kitchen-repairs"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-still-ours"]')).toBeVisible();
    });

    // ── TF-140-06: Bain-marie → verdict C ─────────────────────────────────────

    test('TF-140-06: bain-marie circuit → verdict C (OFF per schedule)', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Bain-marie' }).click();
        const card = page.locator('[data-testid="kitchen-verdict"]');
        await expect(card).toBeVisible();
        // Verdict C wording: "OFF — the schedule has it off until"
        await expect(card).toContainText('OFF');
        await expect(card).toContainText('schedule');
        // Override chips
        await expect(page.locator('[data-testid="kitchen-override-ok"]')).toBeVisible();
        await expect(page.locator('[data-testid="kitchen-override-fail"]')).toBeVisible();
    });

    // ── TF-140-07: kitchen-all summary ────────────────────────────────────────

    test('TF-140-07: kitchen-all shows summary lines and top-priority verdict card', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-all"]').click();
        // Summary section
        await expect(page.locator('[data-testid="kitchen-all-summary"]')).toBeVisible();
        // Top verdict card (priority order: A is highest concern)
        await expect(page.locator('[data-testid="kitchen-verdict"]')).toBeVisible();
    });

    // ── TF-140-08: override-ok follow-up records outcome ──────────────────────

    test('TF-140-08: after verdict A — override-ok records captured outcome', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Fryer' }).click();
        await expect(page.locator('[data-testid="kitchen-verdict"]')).toBeVisible();
        await page.locator('[data-testid="kitchen-override-ok"]').click();
        // Confirm step appears — click Record outcome to submit
        await expect(page.locator('[data-testid="record-outcome"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="record-outcome"]').click();
        await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible({ timeout: 10000 });
    });

    // ── TF-140-09: fuse-fail follow-up on verdict D escalates ─────────────────

    test('TF-140-09: after verdict D — fuse-fail leads to capture step', async ({ page }) => {
        await openKitchen(page);
        await expect(page.locator('[data-testid="kitchen-picker"]')).toBeVisible({ timeout: 5000 });
        await page.locator('[data-testid="kitchen-picker"] button.chip', { hasText: 'Dishwasher' }).click();
        await expect(page.locator('[data-testid="kitchen-verdict"]')).toBeVisible();
        await page.locator('[data-testid="kitchen-fuse-fail"]').click();
        // Should reach a criticality question or outcome (fuse-fail → capture escalation)
        const hasCaptured = await page.locator('[data-testid="outcome-captured"]').isVisible().catch(() => false);
        const hasQuestion = await page.locator('[data-testid="kitchen-critical"]').isVisible().catch(() => false);
        expect(hasCaptured || hasQuestion).toBe(true);
    });
});
