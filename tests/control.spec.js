/** F002/F005/F006/F007/F008/F009/F010 — control paths, guardrails, sync states, holds. */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

async function startHeatingFlow(page, zoneIndex = 0) {
    await page.locator('[data-testid="tile-heating"]').click();
    await page.locator(`[data-testid="zone-${zoneIndex}"]`).click();
}

test.describe('control & sync', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    test('F005 setpoint raise: full chain — modal, guardrail text, pending → synced, ticket, state reset', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        await startHeatingFlow(page, 0);
        await page.locator('[data-testid="need-warm"]').click();

        // Target confirmation strip (second half of the F004 gate)
        await expect(page.locator('[data-testid="control-target"]')).toContainText('Old Grey Mare');
        await expect(page.locator('[data-testid="control-target"]')).toContainText('IT500-BAR-6832');
        await expect(page.locator('[data-testid="guardrail-text"]')).toContainText('15–21°C');
        await expect(page.locator('[data-testid="stepper-value"]')).toContainText('19°C');

        // Stepper cannot exceed the window: click + repeatedly, button disables at 21
        const up = page.locator('[data-testid="stepper-up"]');
        for (let i = 0; i < 8 && await up.isEnabled(); i++) await up.click();
        await expect(page.locator('[data-testid="stepper-value"]')).toContainText('21°C');
        await expect(up).toBeDisabled();

        await page.locator('[data-testid="control-send"]').click();
        // honest pending state first
        await expect(page.locator('[data-testid="sync-steps"]')).toContainText('Device confirming');
        // then device-confirmed
        await expect(page.locator('[data-testid="sync-applied"]')).toContainText('Applied — device confirmed 21°C', { timeout: 20000 });
        await page.locator('[data-testid="sync-done"]').click();

        const outcome = page.locator('[data-testid="outcome-applied"]');
        await expect(outcome).toContainText('Change applied — device confirmed');
        await expect(outcome).toContainText('IT500-BAR-6832');
        await expect(outcome).toContainText(/Recorded on ticket #\d+/);
        await expect(outcome).not.toContainText('[object');

        // Protocol 5 — state reset: add another issue and reach a fresh control modal without reload
        await page.locator('[data-testid="add-another-issue"]').click();
        await expect(page.locator('[data-testid="category-tiles"]')).toBeVisible();
        await startHeatingFlow(page, 1);
        await page.locator('[data-testid="need-cool"]').click();
        await expect(page.locator('[data-testid="control-target"]')).toContainText('IT500-RST-6832');
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

    test('F009 capability gating: boost rejected on a non-DHW device, mode rejected on Salus', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        const token = await page.evaluate(() => state.confirmToken);
        const results = await page.evaluate(async (confirmToken) => {
            const post = async (body) => {
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
        }, token);
        expect(results.boostOnHeating.status).toBe(422);
        expect(results.boostOnHeating.body.error).toContain('not a boostable');
        expect(results.modeOnSalus.status).toBe(422);
        expect(results.modeOnSalus.body.error).toContain('does not support mode');
        expect(results.writeToTuya.status).toBe(422);
    });

    test('F008 failed write is reported honestly and escalates — never success (Robin Hood restaurant)', async ({ page }) => {
        await confirmSite(page, '6851', 'Robin Hood');
        await startHeatingFlow(page, 1); // Restaurant — fixture _demo: fail
        // 17°C vs setpoint 21 → 'warmer' first shows the building-heat recommendation card
        await page.locator('[data-testid="need-warm"]').click();
        await expect(page.locator('[data-testid="reco-building-heat"]')).toContainText('Raising the setpoint won’t help');
        await page.locator('button:has-text("Adjust the setpoint anyway")').click();
        await page.locator('[data-testid="control-send"]').click();
        const failed = page.locator('[data-testid="sync-failed"]');
        await expect(failed).toContainText('The device refused this command', { timeout: 20000 });
        await expect(failed).toContainText('do not tell the caller it’s done');
        await expect(page.locator('[data-testid="sync-applied"]')).toHaveCount(0);
        await page.locator('[data-testid="sync-escalate"]').click();
        const outcome = page.locator('[data-testid="outcome-escalated"]');
        await expect(outcome).toContainText('must be treated as not applied');
        await expect(outcome).toContainText(/Ticket #\d+/);
    });

    test('F008 IT700 slow echo: timeout state, keep-waiting, escalate (Jolly Scotchman)', async ({ page }) => {
        await confirmSite(page, '4741', 'Jolly Scotchman');
        await startHeatingFlow(page, 0); // IT700 — fixture _demo: slow
        await page.locator('[data-testid="need-cool"]').click();
        await page.locator('[data-testid="control-send"]').click();
        const timeout = page.locator('[data-testid="sync-timeout"]');
        await expect(timeout).toContainText('Treat the change as NOT applied', { timeout: 30000 });
        await expect(timeout).toContainText('IT700');
        // keep waiting returns to a pending tracker
        await page.locator('[data-testid="sync-wait"]').click();
        await expect(page.locator('[data-testid="sync-steps"]')).toContainText('Device confirming');
        // it times out again → escalate honestly
        await expect(page.locator('[data-testid="sync-timeout"]')).toBeVisible({ timeout: 45000 });
        await page.locator('[data-testid="sync-escalate"]').click();
        await expect(page.locator('[data-testid="outcome-escalated"]')).toContainText('no sync confirmation (timeout)');
    });

    test('F005 Salus turn-off: recommendation card offers frost-hold, decline records no-action', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        await startHeatingFlow(page, 0);
        await page.locator('[data-testid="need-off"]').click();
        const reco = page.locator('[data-testid="reco-frost"]');
        await expect(reco).toContainText('no “off” switch');
        await expect(reco).toContainText('frost-hold');
        await page.locator('[data-testid="frost-decline"]').click();
        const outcome = page.locator('[data-testid="outcome-noaction"]');
        await expect(outcome).toContainText('Call logged — no action taken');
        await expect(outcome).toContainText(/Ticket #\d+/);
    });

    test('F005+F010 frost-hold with hold set: applied outcome shows durable revert; hold appears in Admin', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        await startHeatingFlow(page, 2); // Accommodation
        await page.locator('[data-testid="need-off"]').click();
        await page.locator('[data-testid="frost-recommended"]').click();
        // frost defaults to hold until 07:00
        await expect(page.locator('.chip.sel')).toContainText('Until 07:00 tomorrow');
        await expect(page.locator('.modal')).toContainText('revert survives restarts');
        await page.locator('[data-testid="control-send"]').click();
        await expect(page.locator('[data-testid="sync-applied"]')).toContainText('Hold active', { timeout: 20000 });
        await page.locator('[data-testid="sync-done"]').click();
        await expect(page.locator('[data-testid="outcome-applied"]')).toContainText('will revert automatically (durable)');

        // Hold is visible in Admin (IoT role) with held + revert values
        const admin = await page.context().browser().newContext({ baseURL: test.info().project.use.baseURL });
        const apage = await admin.newPage();
        await signIn(apage, 'Test IoT Admin');
        await apage.locator('[data-testid="nav-admin"]').click();
        const holds = apage.locator('[data-testid="admin-holds"]');
        await expect(holds).toContainText('IT500-ACC-6832');
        await expect(holds).toContainText('5'); // frost value held
        await expect(holds).toContainText('Test Handler');
        // cancel the hold → reverts now (fixture confirms quickly)
        apage.on('dialog', d => d.accept());
        await holds.locator('button:has-text("Cancel hold")').first().click();
        await expect(apage.locator('.toast')).toContainText('Hold reverted', { timeout: 30000 });
        await admin.close();
    });

    test('F006 HW boost on IT500 DHW confirms via sync (Ship Inn)', async ({ page }) => {
        await confirmSite(page, '6234', 'Ship Inn');
        await page.locator('[data-testid="tile-hotwater"]').click();
        await page.locator('[data-testid="hw-boost-yes"]').click();
        await expect(page.locator('[data-testid="stepper-value"]')).toContainText('2h');
        // boost range honours 1–9
        const down = page.locator('[data-testid="stepper-down"]');
        await down.click();
        await expect(page.locator('[data-testid="stepper-value"]')).toContainText('1h');
        await expect(down).toBeDisabled();
        await page.locator('[data-testid="control-send"]').click();
        await expect(page.locator('[data-testid="sync-applied"]')).toContainText('Applied — device confirmed 1h boost', { timeout: 20000 });
        await page.locator('[data-testid="sync-done"]').click();
        await expect(page.locator('[data-testid="outcome-applied"]')).toContainText('HW boost');
    });

    test('F007 Intesis turn-off uses native mode Off (Tamar)', async ({ page }) => {
        await confirmSite(page, '6873', 'Tamar');
        await startHeatingFlow(page, 0);
        await page.locator('[data-testid="need-off"]').click();
        // Intesis: straight to the modal with Mode → Off (no frost recommendation card)
        await expect(page.locator('[data-testid="reco-frost"]')).toHaveCount(0);
        await expect(page.locator('.modal')).toContainText('Mode → Off');
        await expect(page.locator('.modal')).toContainText('Intesis native Off');
        await page.locator('[data-testid="control-send"]').click();
        await expect(page.locator('[data-testid="sync-applied"]')).toContainText('Mode Off', { timeout: 20000 });
        await page.locator('[data-testid="sync-done"]').click();
        await expect(page.locator('[data-testid="outcome-applied"]')).toContainText('Heating off (mode)');
    });

    test('outcome-record failure shows inline error with manual retry (Protocol 4: 500 path)', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        // Fail ONLY the outcome-recording call — the control loop itself stays real
        let failNext = true;
        await page.route('**/api/outcomes', route => {
            if (failNext) { failNext = false; return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Zendesk exploded' }) }); }
            return route.continue();
        });
        await page.locator('[data-testid="tile-fridge"]').click();
        await page.locator('[data-testid="fridge-risk"]').click(); // P1 path
        await expect(page.locator('.flowbody')).toContainText('Couldn’t record the outcome: Zendesk exploded');
        await page.locator('button:has-text("Try again")').click();
        await expect(page.locator('[data-testid="outcome-p1"]')).toContainText('text message', { timeout: 15000 });
        await expect(page.locator('[data-testid="outcome-p1"]')).toContainText('on-duty escalation manager');
    });
});
