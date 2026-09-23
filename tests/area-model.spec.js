/**
 * OOHDASH-82 — heating area-model e2e (design §7, §9 AC1–AC4).
 *
 * Runs the REAL server in fixture mode (no route mocking) against the mixed-estate site 6218
 * (design §10.2): an iT700 (Accommodation), two iT500s (Staff→Accommodation, Restaurant→
 * Bar/Restaurant), an unmapped iT500 (fallback), an Intesis (aircon), and a paired gateway.
 * Every assertion is on observed DOM content / the real POST the app makes — never on source text.
 *
 *   AC1  two area chips render (Accommodation + Bar/Restaurant) and NO device serial/gateway.
 *   AC2  choosing a multi-device area reads the COLDEST online zone (the representative) + note.
 *   AC3  a gateway device is absent from the area chips.
 *   AC4  the aircon shortcut AND a typed keyword each reach an `aircon-referral` capture with
 *        NO warmer/cooler control button anywhere.
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe('OOHDASH-82 heating area model', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    test('AC1: the heating step presents exactly the two present areas — never serials or a gateway', async ({ page }) => {
        await confirmSite(page, '6218', 'Kings Head');
        await page.locator('[data-testid="tile-heating"]').click();

        // Data fidelity: the chips read as caller-meaningful AREA names, not element existence alone.
        const acc = page.locator('[data-testid="area-accommodation"]');
        const bar = page.locator('[data-testid="area-bar-restaurant"]');
        await expect(acc).toHaveText('Accommodation');
        await expect(bar).toHaveText('Bar/Restaurant');
        await expect(acc).toBeVisible();
        await expect(bar).toBeVisible();

        // AC3 (structural, seen here too): no gateway / serial ever surfaces as a chip. The flow panel
        // holds the chip step; the device board (which legitimately lists the gateway) is elsewhere.
        const flow = page.locator('[data-testid="flow-panel"]');
        await expect(flow).not.toContainText('gateway');
        await expect(flow).not.toContainText('salusit700');
        await expect(flow).not.toContainText('salusit500');
        await expect(flow).not.toContainText('intesis');
        // No legacy per-device zone chip remains.
        await expect(page.locator('[data-testid^="zone-"]')).toHaveCount(0);
    });

    test('AC1/§7.2: an unmapped iT500 surfaces a caller-meaningful fallback chip, still never a serial', async ({ page }) => {
        await confirmSite(page, '6218', 'Kings Head');
        await page.locator('[data-testid="tile-heating"]').click();
        const fallback = page.locator('[data-testid="area-unmapped"]');
        await expect(fallback).toHaveText('Heating — area not identified');
        await expect(fallback).not.toContainText('salusit500-4');
    });

    test('AC2: choosing Accommodation reads the COLDEST online zone (representative) with the honest note', async ({ page }) => {
        await confirmSite(page, '6218', 'Kings Head');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('[data-testid="area-accommodation"]').click();

        // Accommodation = { iT700 19.0°C, iT500-2 17.0°C } → the 17°C iT500 is the representative.
        const flow = page.locator('.flowbody');
        await expect(flow).toContainText('Area:');
        await expect(flow).toContainText('Accommodation');
        const read = page.locator('.zoneread');
        await expect(read).toContainText('17°C');
        await expect(read).toContainText('gk-6218-salusit500-2');
        await expect(read).toContainText('coldest of 2 zones in Accommodation');
        // The warmer/cooler affordances are present for a real (write-enabled) heating control.
        await expect(page.locator('[data-testid="need-warm"]')).toBeVisible();
    });

    test('AC2: a single-device area (Bar/Restaurant) degrades cleanly — the one device, no "coldest of N" note', async ({ page }) => {
        await confirmSite(page, '6218', 'Kings Head');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('[data-testid="area-bar-restaurant"]').click();
        const read = page.locator('.zoneread');
        await expect(read).toContainText('21°C');
        await expect(read).toContainText('gk-6218-salusit500-3');
        await expect(page.locator('.flowbody')).not.toContainText('coldest of');
    });

    test('AC3: the paired gateway is absent from the chips AND from the live device set for an area', async ({ page }) => {
        await confirmSite(page, '6218', 'Kings Head');
        // The gateway is present in the raw inventory (device board), but never as an area chip.
        await page.locator('[data-testid="tile-heating"]').click();
        await expect(page.locator('[data-testid="flow-panel"]')).not.toContainText('gateway');
        // Choosing an area never resolves to the gateway (no gateway id appears in the read).
        await page.locator('[data-testid="area-accommodation"]').click();
        await expect(page.locator('.zoneread')).not.toContainText('gateway-1');
    });

    test('AC4: the in-context aircon shortcut reaches an aircon-referral capture with NO control button', async ({ page }) => {
        // 6832 is a mixed site WITH heating areas AND (after this fixture) is used elsewhere; 6218 has
        // heating areas + an Intesis, so the in-context aircon shortcut renders beneath the area chips.
        await confirmSite(page, '6218', 'Kings Head');
        await page.locator('[data-testid="tile-heating"]').click();

        // Capture the exact class the app POSTs — a behavioural assertion, not a source check.
        const postClass = page.waitForRequest(req =>
            req.url().includes('/api/outcomes') && req.method() === 'POST');

        const shortcut = page.locator('[data-testid="aircon-shortcut"]');
        await expect(shortcut).toBeVisible();
        await shortcut.click();

        const req = await postClass;
        expect(JSON.parse(req.postData())).toMatchObject({ type: 'capture', OohCaptureClass: 'aircon-referral' });

        const captured = page.locator('[data-testid="outcome-captured"]');
        await expect(captured).toContainText('Captured for the IoT team');
        await expect(captured).toContainText(/Ticket #\d+/);
        await expect(captured).toContainText('next working day');
        // No control affordance anywhere in the referral (aircon is never actuated).
        await expect(page.locator('[data-testid="control-send"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="need-warm"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="need-cool"]')).toHaveCount(0);
    });

    test('AC4: a typed aircon keyword reaches the same aircon-referral capture with NO control button', async ({ page }) => {
        await confirmSite(page, '6218', 'Kings Head');

        // Realistic input: type the caller's words sequentially so the smart-entry matcher runs.
        await page.locator('[data-testid="smart-entry"]').pressSequentially('the air con is not cooling', { delay: 25 });
        const suggest = page.locator('[data-testid="suggest-aircon"]');
        await expect(suggest).toBeVisible();

        const postClass = page.waitForRequest(req =>
            req.url().includes('/api/outcomes') && req.method() === 'POST');
        await suggest.click();

        const req = await postClass;
        expect(JSON.parse(req.postData())).toMatchObject({ type: 'capture', OohCaptureClass: 'aircon-referral' });

        const captured = page.locator('[data-testid="outcome-captured"]');
        await expect(captured).toContainText('Captured for the IoT team');
        await expect(captured).toContainText(/Ticket #\d+/);
        await expect(page.locator('[data-testid="control-send"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="need-warm"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="need-cool"]')).toHaveCount(0);
    });

    test('AC4/removal: no top-level Air conditioning TILE — aircon is reached only via keyword or shortcut', async ({ page }) => {
        await confirmSite(page, '6218', 'Kings Head');
        // aircon is a HIDDEN category (design §6): it must not appear as a clickable category tile.
        await expect(page.locator('[data-testid="tile-aircon"]')).toHaveCount(0);
    });
});
