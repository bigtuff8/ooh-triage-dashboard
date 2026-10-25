/** F002/F005/F006/F007/F008/F009/F010 — control paths, guardrails, three-outcome states, holds.
 *
 * OOHDASH-123: the confirm model is now the three honest outcomes (design §5). Heating (Salus) is a
 * SLOW class — the handler is released at once (DD-WAIT-HANDOFF), so heating dispatch tests assert the
 * slow-release card; the synchronous CONFIRMED / NOT DELIVERED / NOT CONFIRMED cards (fast Tuya) and the
 * no-resend / no-409 behaviour are covered in control-rosetta.spec.js. Boost is removed (J5/D-BOOST).
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

async function startHeatingFlow(page, areaSlug = 'bar-restaurant') {
    await page.locator('[data-testid="tile-heating"]').click();
    await page.locator(`[data-testid="area-${areaSlug}"]`).click();
}

test.describe('control & sync', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    test('F005 Salus setpoint: full chain — modal, guardrail text, slow-release handoff, outcome, state reset', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        await startHeatingFlow(page, 'bar-restaurant');   // IT500-BAR-6832 (17.5C)
        await page.locator('[data-testid="need-warm"]').click();

        await expect(page.locator('[data-testid="control-target"]')).toContainText('Old Grey Mare');
        await expect(page.locator('[data-testid="control-target"]')).toContainText('IT500-BAR-6832');
        await expect(page.locator('[data-testid="guardrail-text"]')).toContainText('15–21°C');
        await expect(page.locator('[data-testid="stepper-value"]')).toContainText('19°C');

        const up = page.locator('[data-testid="stepper-up"]');
        for (let i = 0; i < 8 && await up.isEnabled(); i++) await up.click();
        await expect(page.locator('[data-testid="stepper-value"]')).toContainText('21°C');
        await expect(up).toBeDisabled();

        await page.locator('[data-testid="control-send"]').click();
        // Slow (Salus) class: the handler is released at once with the honest "carry on" handoff.
        await expect(page.locator('[data-testid="sync-sent-slow"]')).toContainText('Sent to the device', { timeout: 20000 });
        await page.locator('[data-testid="sync-release"]').click();
        const outcome = page.locator('[data-testid="outcome-awaiting"]');
        await expect(outcome).toContainText('awaiting the device');
        await expect(outcome).toContainText('IT500-BAR-6832');
        await expect(outcome).not.toContainText('[object');

        // Protocol 5 — state reset: add another issue and reach a fresh control modal without reload.
        await page.locator('[data-testid="add-another-issue"]').click();
        await expect(page.locator('[data-testid="category-tiles"]')).toBeVisible();
        await startHeatingFlow(page, 'accommodation');   // coldest of {RST 19.0, ACC 16.0} = IT500-ACC-6832
        await page.locator('[data-testid="need-cool"]').click();
        await expect(page.locator('[data-testid="control-target"]')).toContainText('IT500-ACC-6832');
        await page.locator('button:has-text("Cancel")').last().click();
    });

    test('F009 server rejects an out-of-range setpoint with a clear reason (422)', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        const token = await page.evaluate(() => state.confirmToken);
        const res = await page.evaluate(async (confirmToken) => {
            const r = await fetch('/api/control/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmToken, siteNo: '6832', deviceId: 'IT500-BAR-6832', command: 'setpoint', value: 30 })
            });
            return { status: r.status, body: await r.json() };
        }, token);
        expect(res.status).toBe(422);
        expect(res.body.error).toContain('outside the allowed');
        expect(res.body.guardrail).toBe(true);
    });

    test('F009 capability gating: boost rejected (removed), mode rejected on Salus, setpoint rejected on Tuya', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        const results = await page.evaluate(async () => {
            const freshToken = async () => {
                const r = await fetch('/api/sites/6832/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                return (await r.json()).confirmToken;
            };
            const post = async (body) => {
                const confirmToken = await freshToken();
                const r = await fetch('/api/control/dispatch', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirmToken, siteNo: '6832', ...body })
                });
                return { status: r.status, body: await r.json() };
            };
            return {
                boostOnHeating: await post({ deviceId: 'IT500-BAR-6832', command: 'hwboost', value: 2 }),
                modeOnSalus: await post({ deviceId: 'IT500-BAR-6832', command: 'mode', value: 'Off' }),
                writeToTuya: await post({ deviceId: 'TUYA-K1-6832', command: 'setpoint', value: 20 })
            };
        });
        expect(results.boostOnHeating.status).toBe(422);
        expect(results.boostOnHeating.body.error).toContain('not a boostable');
        expect(results.modeOnSalus.status).toBe(422);
        expect(results.modeOnSalus.body.error).toContain('does not support mode');
        expect(results.writeToTuya.status).toBe(422);
    });

    test('F005 Salus turn-off: recommendation card offers frost-hold, decline records no-action', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        await startHeatingFlow(page, 'bar-restaurant'); // IT500-BAR-6832
        await page.locator('[data-testid="need-off"]').click();
        const reco = page.locator('[data-testid="reco-frost"]');
        await expect(reco).toContainText('no "off" switch');
        await expect(reco).toContainText('frost-hold');
        await page.locator('[data-testid="frost-decline"]').click();
        await page.locator('[data-testid="record-outcome"]').click();
        const outcome = page.locator('[data-testid="outcome-noaction"]');
        await expect(outcome).toContainText('Call logged — no action taken');
        await expect(outcome).toContainText(/Ticket #\d+/);
    });

    test('F005+F010 frost-hold with hold: slow-release handoff, then the hold lands in Admin after the device confirms', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        await startHeatingFlow(page, 'accommodation'); // coldest = IT500-ACC-6832
        await page.locator('[data-testid="need-off"]').click();
        await page.locator('[data-testid="frost-recommended"]').click();
        await expect(page.locator('.chip.sel')).toContainText('Until 07:00 tomorrow');
        await expect(page.locator('.modal')).toContainText('revert survives restarts');
        await page.locator('[data-testid="control-send"]').click();
        // Slow class → released at once; the hold is scheduled server-side once the device confirms.
        await expect(page.locator('[data-testid="sync-sent-slow"]')).toBeVisible({ timeout: 20000 });
        await page.locator('[data-testid="sync-release"]').click();
        await expect(page.locator('[data-testid="outcome-awaiting"]')).toBeVisible();

        // The hold appears in Admin (IoT role) once the background watcher confirms + schedules it. The
        // confirm is async for a slow class, so poll the admin holds view (reload) until it lands.
        const admin = await page.context().browser().newContext({ baseURL: test.info().project.use.baseURL });
        const apage = await admin.newPage();
        await signIn(apage, 'Test IoT Admin');
        await expect(async () => {
            await apage.locator('[data-testid="nav-admin"]').click();
            await expect(apage.locator('[data-testid="admin-holds"]')).toContainText('IT500-ACC-6832', { timeout: 2000 });
        }).toPass({ timeout: 30000 });
        await expect(apage.locator('[data-testid="admin-holds"]')).toContainText('Test Handler');
        await admin.close();
    });

    // OOHDASH-82: Intesis aircon control is REMOVED — captured & referred (unchanged by OOHDASH-123).
    test('F007→OOHDASH-82: Intesis-only site offers NO aircon control; the request is captured & referred (Tamar)', async ({ page }) => {
        await confirmSite(page, '6873', 'Tamar');
        await page.locator('[data-testid="tile-heating"]').click();
        await expect(page.locator('.flowbody')).toContainText('No heating on Lighthouse at this site');
        await expect(page.locator('[data-testid="area-accommodation"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="need-warm"]')).toHaveCount(0);
        page.once('dialog', d => d.accept());
        await page.locator('button:has-text("Cancel issue")').last().click();
        await expect(page.locator('[data-testid="smart-entry"]')).toBeVisible();

        await page.locator('[data-testid="smart-entry"]').pressSequentially('the air con is blowing warm', { delay: 25 });
        await page.locator('[data-testid="suggest-aircon"]').click();
        await page.locator('[data-testid="record-outcome"]').click();
        const captured = page.locator('[data-testid="outcome-captured"]');
        await expect(captured).toContainText('Captured for the IoT team');
        await expect(captured).toContainText(/Ticket #\d+/);
        await expect(page.locator('[data-testid="control-send"]')).toHaveCount(0);
    });

    test('outcome-record failure shows inline error with manual retry (Protocol 4: 500 path)', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        let failNext = true;
        await page.route('**/api/outcomes', route => {
            if (failNext) { failNext = false; return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Zendesk exploded' }) }); }
            return route.continue();
        });
        await page.locator('[data-testid="tile-fridge"]').click();
        await page.locator('[data-testid="fridge-risk"]').click(); // P1 path
        await page.locator('[data-testid="record-outcome"]').click();
        await expect(page.locator('.flowbody')).toContainText("Couldn't record the outcome: Zendesk exploded");
        await page.locator('button:has-text("Try again")').click();
        await page.locator('[data-testid="record-outcome"]').click();
        await expect(page.locator('[data-testid="outcome-p1"]')).toContainText('logged as ticket', { timeout: 15000 });
        await expect(page.locator('[data-testid="outcome-p1"]')).toContainText('pages the on-duty manager');
        await expect(page.locator('[data-testid="outcome-p1"]')).not.toContainText('Text not sent');
    });
});
