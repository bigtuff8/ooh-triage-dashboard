/**
 * OOHDASH-144 §10.3 — turn on/off result card reflects what actually reached the heating controls.
 *
 * Found in orchestrator review before the test gate: the server reports each zone as
 * { zone, outcome } but the card read `zo.state`, so every successful zone rendered
 * "❌ we couldn't reach the heating controls", while a real failure still said "That's done".
 *
 * RC-1  real dispatch on 9011: the zone row is ✅, the script says "That's done"
 * RC-2  every zone NON-DELIVERY (intercepted): no "That's done", plain failure script,
 *       "didn't respond" auto-log wording, Check and log records "Tried to turn ... couldn't be reached"
 * RC-3  partial (zone 1 ok, zone 2 NON-DELIVERY): script speaks for zone 1 only and "logged the rest"
 * RC-4  a change that ends after the next timetable on-time never says "which next comes on at"
 * RC-6  unconfirmed send never says "That's done"; an unknown zone result is treated as failed
 * RC-7  no automatic ticket: the script says "I'll log", never "I've logged"
 * RC-5  putting a timer back to normal keeps its "back to normal, noted on ticket" row on the banner,
 *       and the intercept then offers "Finish and add notes", never "No further action" (§10.1, §10.2)
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

async function cancelActiveHolds(request, siteNo) {
    await request.post(`/api/test/sites/${siteNo}/holds/cancel-all`).catch(() => {});
}

async function reachDirection(page) {
    await page.locator('[data-testid="tile-heating"]').click();
    await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
    const holdCard = page.locator('[data-testid="reco-boost-hold"]');
    const needCold = page.locator('[data-testid="need-cold"]');
    await Promise.race([holdCard.waitFor({ timeout: 8000 }), needCold.waitFor({ timeout: 8000 })]).catch(() => {});
    if (await holdCard.isVisible().catch(() => false)) {
        await page.locator('[data-testid="bp-hold-continue"]').click();
        await expect(needCold).toBeVisible({ timeout: 5000 });
    }
}

async function ackIfWarned(page) {
    try {
        await page.locator('[data-testid="bp-boost-ack"]').waitFor({ timeout: 2000 });
        await page.locator('[data-testid="bp-boost-ack"]').click();
    } catch { /* no warning */ }
}

function fakeBoostResponse(zones, revertAtMs) {
    return {
        action: {
            actionId: 'rc-test', revertAtMs: revertAtMs || Date.now() + 60 * 60 * 1000, ticketId: 47001,
            overrideIds: zones.filter(z => z.outcome !== 'NON-DELIVERY').map(z => ({ zone: z.zone, overrideId: 'rc-' + z.zone })),
            zones: zones.map(z => ({ zone: z.zone, outcome: z.outcome, dispatchError: z.outcome === 'NON-DELIVERY' ? 'rejected' : null, panelVersion: 'v2' }))
        }
    };
}

test.describe('OOHDASH-144 §10.3 result card', () => {
    test.beforeEach(async ({ page, request }) => {
        await cancelActiveHolds(request, '9010');
        await cancelActiveHolds(request, '9011');
        await signIn(page, 'Test Handler');
    });

    test('RC-1: a confirmed zone shows ✅ and "That\'s done"', async ({ page }) => {
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await reachDirection(page);
        await page.locator('[data-testid="need-cold"]').click();
        await page.locator('[data-testid^="bp-boost-on-"]').first().click();
        await page.locator('[data-testid="bp-dur-60"]').click();
        await ackIfWarned(page);
        const card = page.locator('[data-testid="outcome-boost"]');
        await expect(card).toBeVisible({ timeout: 15000 });
        const row = card.locator('[data-testid^="boost-zone-result-"]').first();
        await expect(row).toContainText('✅');
        await expect(row).not.toContainText("couldn't reach");
        await expect(card.locator('[data-testid="say-block"]')).toContainText("That's done");
    });

    test('RC-2: when no zone is reached, the card never says it is done', async ({ page }) => {
        await page.route('**/api/boiler-boost', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(fakeBoostResponse([{ zone: 'CHZ2', outcome: 'NON-DELIVERY' }]))
        }));
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await reachDirection(page);
        await page.locator('[data-testid="need-cold"]').click();
        await page.locator('[data-testid^="bp-boost-on-"]').first().click();
        await page.locator('[data-testid="bp-dur-60"]').click();
        const card = page.locator('[data-testid="outcome-boost"]');
        await expect(card).toBeVisible({ timeout: 15000 });
        await expect(card.locator('h3')).toHaveText("We couldn't change the heating");
        await expect(card).not.toHaveClass(/applied/); // never the green success style
        await expect(card.locator('[data-testid^="boost-zone-result-"]').first()).toContainText('❌');
        const say = card.locator('[data-testid="say-block"]');
        await expect(say).not.toContainText("That's done");
        await expect(say).toContainText("couldn't change your heating");
        await expect(card.locator('[data-testid="autolog-box"]')).toContainText("didn't respond");
        await page.locator('[data-testid="bp-finish-notes"]').click();
        const wrap = page.locator('[data-testid="wrap-up"]');
        await expect(wrap).toContainText('Tried to turn the heating on');
        await expect(wrap).toContainText("couldn't be reached");
        await expect(wrap).not.toContainText('Turned the heating on');
    });

    test('RC-3: partial success speaks only for the zone that worked', async ({ page }) => {
        await page.route('**/api/boiler-boost', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(fakeBoostResponse([{ zone: 'CHZ1', outcome: 'CONFIRMED' }, { zone: 'CHZ2', outcome: 'NON-DELIVERY' }]))
        }));
        await confirmSite(page, '9010', 'Test Boiler Panel V2 (Heating)');
        await reachDirection(page);
        await page.locator('[data-testid="need-hot"]').click();
        await page.locator('[data-testid="bp-zones-btn"], [data-testid^="bp-boost-off-"]').first().click();
        const all = page.locator('[data-testid="bp-zone-all"]');
        if (await all.isVisible().catch(() => false)) {
            await all.click();
            await page.locator('[data-testid="bp-zones-continue"]').click();
        }
        await page.locator('[data-testid="bp-dur-60"]').click();
        const card = page.locator('[data-testid="outcome-boost"]');
        await expect(card).toBeVisible({ timeout: 15000 });
        await expect(card.locator('[data-testid="boost-zone-result-CHZ1"]')).toContainText('✅');
        await expect(card.locator('[data-testid="boost-zone-result-CHZ2"]')).toContainText('❌');
        const say = card.locator('[data-testid="say-block"]');
        await expect(say).toContainText("That's done for zone 1");
        await expect(say).toContainText("I couldn't change zone 2, so I've logged that for our team.");
    });

    test('RC-6: an unconfirmed send never says "That\'s done", and an unknown result counts as failed', async ({ page }) => {
        await page.route('**/api/boiler-boost', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(fakeBoostResponse([{ zone: 'CHZ1', outcome: 'IN-FLIGHT-TIMEOUT' }, { zone: 'CHZ2', outcome: 'SOMETHING-NEW' }]))
        }));
        await confirmSite(page, '9010', 'Test Boiler Panel V2 (Heating)');
        await reachDirection(page);
        await page.locator('[data-testid="need-hot"]').click();
        await page.locator('[data-testid="bp-zones-btn"], [data-testid^="bp-boost-off-"]').first().click();
        const all = page.locator('[data-testid="bp-zone-all"]');
        if (await all.isVisible().catch(() => false)) {
            await all.click();
            await page.locator('[data-testid="bp-zones-continue"]').click();
        }
        await page.locator('[data-testid="bp-dur-60"]').click();
        const card = page.locator('[data-testid="outcome-boost"]');
        await expect(card).toBeVisible({ timeout: 15000 });
        await expect(card.locator('[data-testid="boost-zone-result-CHZ1"]')).toContainText('⏳');
        await expect(card.locator('[data-testid="boost-zone-result-CHZ2"]')).toContainText('❌');
        const say = card.locator('[data-testid="say-block"]');
        await expect(say).not.toContainText("That's done");
        await expect(say).toContainText("I've asked your heating controls to turn zone 1 off.");
        await expect(say).toContainText("I couldn't change zone 2");
    });

    test('RC-7: with no automatic ticket, the script says "I\'ll log", not "I\'ve logged"', async ({ page }) => {
        const body = fakeBoostResponse([{ zone: 'CHZ2', outcome: 'NON-DELIVERY' }]);
        body.action.ticketId = null;
        await page.route('**/api/boiler-boost', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await reachDirection(page);
        await page.locator('[data-testid="need-cold"]').click();
        await page.locator('[data-testid^="bp-boost-on-"]').first().click();
        await page.locator('[data-testid="bp-dur-60"]').click();
        const card = page.locator('[data-testid="outcome-boost"]');
        await expect(card).toBeVisible({ timeout: 15000 });
        await expect(card.locator('[data-testid="say-block"]')).toContainText("I'll log it for our team");
        await expect(card.locator('[data-testid="say-block"]')).not.toContainText("I've logged");
        await expect(card.locator('[data-testid="autolog-box"]')).toContainText("We couldn't log this automatically");
    });

    test('RC-4: a change ending after the next on-time does not promise that on-time', async ({ page }) => {
        // 9010's zones come on at 06:30 every day, always within the next 24 h; end the change 25 h out.
        await page.route('**/api/boiler-boost', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(fakeBoostResponse([{ zone: 'CHZ1', outcome: 'CONFIRMED' }, { zone: 'CHZ2', outcome: 'CONFIRMED' }], Date.now() + 25 * 60 * 60 * 1000))
        }));
        await confirmSite(page, '9010', 'Test Boiler Panel V2 (Heating)');
        await reachDirection(page);
        await page.locator('[data-testid="need-hot"]').click();
        await page.locator('[data-testid="bp-zones-btn"], [data-testid^="bp-boost-off-"]').first().click();
        const all = page.locator('[data-testid="bp-zone-all"]');
        if (await all.isVisible().catch(() => false)) {
            await all.click();
            await page.locator('[data-testid="bp-zones-continue"]').click();
        }
        await page.locator('[data-testid="bp-dur-60"]').click();
        const say = page.locator('[data-testid="outcome-boost"] [data-testid="say-block"]');
        await expect(say).toContainText("That's done");
        await expect(say).not.toContainText('next comes on at');
    });

    test('RC-5: put back to normal shows its result and no "No further action" afterwards', async ({ page }) => {
        await confirmSite(page, '9011', 'Test Boiler Panel V1 (Heating)');
        await reachDirection(page);
        await page.locator('[data-testid="need-cold"]').click();
        await page.locator('[data-testid^="bp-boost-on-"]').first().click();
        await page.locator('[data-testid="bp-dur-60"]').click();
        await ackIfWarned(page);
        await expect(page.locator('[data-testid="outcome-boost"]')).toBeVisible({ timeout: 15000 });
        await page.locator('[data-testid="bp-finish-notes"]').click();
        await page.locator('[data-testid="wrap-submit"]').click();
        await expect(page.locator('[data-testid="wrap-logged"]')).toBeVisible({ timeout: 10000 });
        await page.getByRole('button', { name: /Add another issue/ }).click();
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();
        await expect(page.locator('[data-testid="reco-boost-hold"]')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('[data-testid="bp-hold-noact"]')).toBeVisible();
        await page.locator('[data-testid="boost-hold-banner"] [data-testid^="hb-cancel-"]').first().click();
        await page.locator('[data-testid^="hb-confirm-yes-"]').first().click();
        const banner = page.locator('[data-testid="boost-hold-banner"]');
        await expect(banner).toContainText('is back to normal', { timeout: 30000 });
        await expect(banner).toContainText(/Noted on ticket #\d+/);
        await expect(banner).toContainText("That's done. Your heating is back on its normal timetable.");
        await expect(page.locator('[data-testid="bp-hold-noact"]')).toHaveCount(0);
        // The step trail shows the area once, however many times the screen redraws.
        await expect(page.locator('[data-testid="flow-panel"]').getByText('Bar/Restaurant', { exact: true })).toHaveCount(1);
    });
});
