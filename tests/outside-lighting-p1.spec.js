/**
 * OOHDASH-111 & OOHDASH-112 — Outside Lighting P1 escalation + supporting text
 *
 * 8 assertions per design §8.
 *
 * Fixtures used:
 *   6749 Angel Inn  — lighting device ONLINE  (LGT-6749, tb-rulechain, no switch capability)
 *   6360 Mill House — lighting device OFFLINE (LGT-6360, tb-rulechain, no switch capability)
 *   6832 Old Grey Mare — no lighting device
 *
 * The server runs SMS_PROVIDER=log (default) so every P1 outcome in this suite produces
 * dispatchOk:false and the "Text not sent — phone the on-duty manager now" fallback.
 * Server-side tag/priority behaviour (ooh_p1 tag, priority:urgent) is covered by the
 * unit suite (p1-dispatch-honesty.test.js). This suite exercises the client↔server join.
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe('OOHDASH-111 & 112 — outside lighting P1 + script text', () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page, 'Test Handler');
    });

    /* ── OOHDASH-111 ────────────────────────────────────────────────────────── */

    test('111-A: "still not working" fires a P1 — outcome card is .outcome.p1, POST carries type:escalate-p1', async ({ page }) => {
        await confirmSite(page, '6749', 'Angel Inn');
        await page.locator('[data-testid="tile-lighting"]').click();

        // Capture the POST before the outcome card renders
        const [request] = await Promise.all([
            page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST'),
            page.locator('.chip:has-text("Still not working")').click()
        ]);

        // POST body must carry type:'escalate-p1'
        const body = JSON.parse(request.postData());
        expect(body.type).toBe('escalate-p1');

        // Outcome card must be P1, NOT captured
        const p1 = page.locator('[data-testid="outcome-p1"]');
        await expect(p1).toBeVisible();
        await expect(p1).toContainText('Escalated — P1');
        await expect(page.locator('[data-testid="outcome-captured"]')).toHaveCount(0);
    });

    test('111-B regression guard: "caller sorted it with the override" stays a capture — no P1 escalation', async ({ page }) => {
        await confirmSite(page, '6749', 'Angel Inn');
        await page.locator('[data-testid="tile-lighting"]').click();
        await page.locator('.chip:has-text("Caller sorted it with the override")').click();

        // Must be a captured outcome — NOT a P1
        await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
        await expect(page.locator('[data-testid="outcome-p1"]')).toHaveCount(0);
    });

    test('111-C log-mode honesty: lighting P1 card shows "Text not sent" fallback (not false send claim)', async ({ page }) => {
        await confirmSite(page, '6749', 'Angel Inn');
        await page.locator('[data-testid="tile-lighting"]').click();
        await page.locator('.chip:has-text("Still not working")').click();

        const status = page.locator('[data-testid="p1-dispatch-status"]');
        await expect(status).toContainText('Text not sent');
        await expect(status).toContainText('phone the on-duty manager');
        // Must NOT falsely claim a text was sent
        await expect(status).not.toContainText('text message has been sent');
    });

    test('111-D no-device guard: site with no lighting device shows scope message; P1 path unreachable', async ({ page }) => {
        await confirmSite(page, '6832', 'Old Grey Mare');
        await page.locator('[data-testid="tile-lighting"]').click();

        // Guard message visible (apostrophe in DOM is U+2019, so match on the surrounding text)
        await expect(page.locator('.alert.info')).toContainText("External lighting at this site");
        await expect(page.locator('.alert.info')).toContainText("on Lighthouse");
        // P1 chip must not exist — path is unreachable
        await expect(page.locator('.chip:has-text("Still not working")')).toHaveCount(0);
    });

    test('111-E p1Summary propagation: POST body carries "External lighting not responding"', async ({ page }) => {
        await confirmSite(page, '6749', 'Angel Inn');
        await page.locator('[data-testid="tile-lighting"]').click();

        const [request] = await Promise.all([
            page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST'),
            page.locator('.chip:has-text("Still not working")').click()
        ]);

        const body = JSON.parse(request.postData());
        expect(body.p1Summary).toBe('External lighting not responding');
    });

    /* ── OOHDASH-112 ────────────────────────────────────────────────────────── */

    test('112-A online script: dusk sensor + one-off override + automatic reset — no fuse-board check', async ({ page }) => {
        await confirmSite(page, '6749', 'Angel Inn'); // online lighting device
        await page.locator('[data-testid="tile-lighting"]').click();

        const script = page.locator('.script').first();
        await expect(script).toContainText('sensor that brings them on automatically at dusk');
        await expect(script).toContainText('only affects tonight');
        await expect(script).toContainText('picks everything back up automatically from tomorrow');
        // Fuse-board check is an OFFLINE-only point
        await expect(script).not.toContainText('fuse board');
    });

    test('112-B offline script: dusk sensor + fuse-board check + automatic reset all present', async ({ page }) => {
        await confirmSite(page, '6360', 'Mill House'); // offline lighting device
        await page.locator('[data-testid="tile-lighting"]').click();

        const script = page.locator('.script').first();
        await expect(script).toContainText('sensor that brings them on automatically at dusk');
        await expect(script).toContainText('fuse board');
        await expect(script).toContainText('tripped breaker');
        await expect(script).toContainText('picks everything back up automatically from tomorrow');
    });

    test('112-C at 1100px viewport the .script block renders inside .flowbody with no overflow', async ({ page }) => {
        await page.setViewportSize({ width: 1100, height: 800 });
        await confirmSite(page, '6749', 'Angel Inn');
        await page.locator('[data-testid="tile-lighting"]').click();

        const flowbody = page.locator('.flowbody');
        await expect(flowbody).toBeVisible();

        const scriptEl = page.locator('.script').first();
        await expect(scriptEl).toBeVisible();

        // Script must not overflow its container (scrollWidth <= clientWidth + 1px rounding tolerance)
        const overflow = await scriptEl.evaluate(el => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
});
