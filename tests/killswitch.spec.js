/** F016 kill-switch + admin notices — runtime write disable without redeploy. */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe.serial('F016 kill-switch', () => {
    test('global kill-switch blocks writes at runtime, reads continue, capture still works', async ({ browser }) => {
        // IoT admin engages the switch with a reason
        const iotCtx = await browser.newContext();
        const iot = await iotCtx.newPage();
        await signIn(iot, 'Test IoT Admin');
        await iot.locator('[data-testid="nav-admin"]').click();
        iot.on('dialog', d => d.accept('vendor cloud incident'));
        await iot.locator('[data-testid="kill-global"]').click();
        await expect(iot.locator('[data-testid="admin-killswitch"]')).toContainText('Writes DISABLED globally');
        await expect(iot.locator('[data-testid="admin-killswitch"]')).toContainText('vendor cloud incident');

        // Handler sees the banner with the reason + actor, reads still work
        const hCtx = await browser.newContext();
        const h = await hCtx.newPage();
        await signIn(h, 'Test Handler');
        await expect(h.locator('[data-testid="kill-banner"]')).toContainText('switched off globally');
        await expect(h.locator('[data-testid="kill-banner"]')).toContainText('vendor cloud incident');
        await confirmSite(h, '6832', 'Old Grey Mare'); // reads continue (F016 verification)
        await expect(h.locator('[data-testid="device-board"]')).toContainText('17.5°C');

        // Control modal never opens — blocked with explanation; server also rejects (423)
        await h.locator('[data-testid="tile-heating"]').click();
        await h.locator('[data-testid="zone-0"]').click();
        await h.locator('[data-testid="need-warm"]').click();
        await expect(h.locator('[data-testid="control-blocked"]')).toContainText('switched off globally');
        await h.locator('.modal button:has-text("OK")').click();
        const token = await h.evaluate(() => state.confirmToken);
        const res = await h.evaluate(async (confirmToken) => {
            const r = await fetch('/api/control/dispatch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmToken, siteNo: '6832', deviceId: 'IT500-BAR-6832', command: 'setpoint', value: 19 })
            });
            return { status: r.status, body: await r.json() };
        }, token);
        expect(res.status).toBe(423);
        expect(res.body.error).toContain('switched off');

        // Capture-and-escalate remains available
        await h.locator('[data-testid="tile-other"]').click();
        await h.locator('[data-testid="other-text"]').pressSequentially('needs logging during kill switch', { delay: 20 });
        await h.locator('[data-testid="other-capture"]').click();
        await expect(h.locator('[data-testid="outcome-captured"]')).toContainText(/Ticket #\d+/);

        // Re-enable and confirm the banner clears
        await iot.locator('[data-testid="kill-global"]').click();
        await expect(iot.locator('[data-testid="admin-killswitch"]')).toContainText('Writes enabled');
        await h.reload();
        await expect(h.locator('[data-testid="kill-banner"]')).toHaveCount(0);
        await iotCtx.close();
        await hCtx.close();
    });

    test('per-site kill-switch blocks only that site', async ({ browser }) => {
        const iotCtx = await browser.newContext();
        const iot = await iotCtx.newPage();
        await signIn(iot, 'Test IoT Admin');
        await iot.locator('[data-testid="nav-admin"]').click();
        await iot.locator('#kssite').pressSequentially('6832', { delay: 20 });
        iot.on('dialog', d => d.accept('site engineer working'));
        await iot.locator('button:has-text("Disable writes for site")').click();
        await expect(iot.locator('[data-testid="admin-killswitch"]')).toContainText('site engineer working');

        const hCtx = await browser.newContext();
        const h = await hCtx.newPage();
        await signIn(h, 'Test Handler');
        await confirmSite(h, '6832', 'Old Grey Mare');
        await expect(h.locator('[data-testid="kill-banner"]')).toContainText('switched off for this site');
        // Another site is unaffected
        await h.locator('[data-testid="nav-home"]').click();
        await confirmSite(h, '6873', 'Tamar');
        await expect(h.locator('[data-testid="kill-banner"]')).toHaveCount(0);

        await iot.locator('button:has-text("Re-enable")').click();
        await expect(iot.locator('[data-testid="admin-killswitch"]')).toContainText('No per-site switches engaged');
        await iotCtx.close();
        await hCtx.close();
    });

    test('notices publish to the handlers’ New Call banner and retire cleanly', async ({ browser }) => {
        const iotCtx = await browser.newContext();
        const iot = await iotCtx.newPage();
        await signIn(iot, 'Test IoT Admin');
        await iot.locator('[data-testid="nav-admin"]').click();
        await iot.locator('[data-testid="notice-title"]').pressSequentially('New site live: Meridian', { delay: 15 });
        await iot.locator('[data-testid="notice-body"]').fill('Heating only — kitchen queries are not on Lighthouse for this site.');
        await iot.locator('[data-testid="notice-publish"]').click();
        await expect(iot.locator('.toast')).toContainText('Notice published');

        const hCtx = await browser.newContext();
        const h = await hCtx.newPage();
        await signIn(h, 'Test Handler');
        await expect(h.locator('[data-testid="notice-banner"]')).toContainText('New site live: Meridian');
        await expect(h.locator('[data-testid="notice-banner"]')).toContainText('Heating only');

        await iot.locator('[data-testid="admin-notices"] button:has-text("Retire")').first().click();
        await h.reload();
        await expect(h.locator('[data-testid="notice-banner"]')).toHaveCount(0);
        await iotCtx.close();
        await hCtx.close();
    });
});
