/**
 * OOHDASH-134 — "P1 Escalation" choice in the 'Something else' flow (v1.4.2).
 *
 * Stage 0 is unchanged (Check if Lighthouse-controlled | Capture & escalate as described).
 * Capture opens a choice step: "P1 Escalation" (red, blocked until a reason exists) or
 * "Raise a Normal Priority ticket" (exactly the pre-v1.4.2 "General issue captured" outcome).
 * The P1 goes through the shared outcomeP1 helper, so it carries the same signal as the lighting P1.
 *
 * Fixture site: 6749 Angel Inn (lighting device online, so the lighting P1 is reachable for parity).
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

const isOutcomePost = r => r.url().includes('/api/outcomes') && r.method() === 'POST';

async function openOther(page, text) {
    await confirmSite(page, '6749', 'Angel Inn');
    await page.locator('[data-testid="tile-other"]').click();
    if (text) await page.locator('[data-testid="other-text"]').fill(text);
}

test.describe('OOHDASH-134 — P1 Escalation in Something else', () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page, 'Test Handler');
    });

    test('134-A: Capture opens the two-button choice with the P1 explanation (AC1)', async ({ page }) => {
        await openOther(page, 'Something odd at the bar');
        await page.locator('[data-testid="other-capture"]').click();

        const p1 = page.locator('[data-testid="other-p1"]');
        const normal = page.locator('[data-testid="other-normal"]');
        await expect(p1).toBeVisible();
        await expect(normal).toBeVisible();
        await expect(p1).toHaveText('P1 Escalation');
        await expect(normal).toHaveText('Raise a Normal Priority ticket');
        await expect(p1).toBeEnabled();
        // Order: P1 first, then normal
        const ids = await page.locator('.chips button').evaluateAll(els => els.map(e => e.dataset.testid));
        expect(ids.indexOf('other-p1')).toBeLessThan(ids.indexOf('other-normal'));
        // P1 styling
        await expect(p1).toHaveClass(/\bp1\b/);

        const ex = page.locator('[data-testid="other-p1-explainer"]');
        await expect(ex).toBeVisible();
        await expect(ex).toContainText('immediately health and safety or business trading affecting');
        await expect(ex).toContainText('attempted to follow through one of the circumstance tiles');
        await expect(ex).toContainText('send a text to the escalation manager on the IoT Support team immediately upon submission');
        // No in-hours signposting or priority-matrix references
        await expect(ex).not.toContainText(/P2|P3|working hours|daytime/i);
        // No POST yet
        await expect(page.locator('[data-testid="confirm-step"]')).toHaveCount(0);
    });

    test('134-A2: stage 0 is unchanged — only Check and Capture, no P1 button (AC1)', async ({ page }) => {
        await openOther(page);
        await expect(page.locator('[data-testid="other-check"]')).toBeVisible();
        await expect(page.locator('[data-testid="other-capture"]')).toBeVisible();
        await expect(page.locator('[data-testid="other-p1"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="other-normal"]')).toHaveCount(0);
    });

    test('134-B: P1 Escalation raises the shared escalate-p1 outcome with a red P1 card (AC2)', async ({ page }) => {
        await openOther(page, 'Gas smell near the cellar door, staff evacuating the kitchen');
        await page.locator('[data-testid="other-capture"]').click();
        await page.locator('[data-testid="other-p1"]').click();
        await expect(page.locator('[data-testid="confirm-step"]')).toBeVisible();

        const reqP = page.waitForRequest(isOutcomePost);
        await page.locator('[data-testid="record-outcome"]').click();
        const body = JSON.parse((await reqP).postData());
        expect(body.type).toBe('escalate-p1');
        expect(body.subject).toBe('Something else - urgent, escalated as P1');
        expect(body.p1Summary.startsWith('Something else: Gas smell')).toBe(true);
        expect(body.detail).toContain('Gas smell near the cellar door, staff evacuating the kitchen');

        const card = page.locator('[data-testid="outcome-p1"]');
        await expect(card).toBeVisible();
        await expect(card).toContainText('Escalated — P1');
        await expect(card).toContainText(/Ticket #\d+/);
        await expect(page.locator('[data-testid="outcome-captured"]')).toHaveCount(0);
    });

    test('134-C: long text — p1Summary cut to 80 characters, full text kept in detail (AC3)', async ({ page }) => {
        const LONG = 'Customer reports a strong burning smell coming from the plant room behind the kitchen and the extractor has gone silent mid-service tonight';
        expect(LONG.length).toBeGreaterThanOrEqual(130);
        await openOther(page, LONG);
        await page.locator('[data-testid="other-capture"]').click();
        await page.locator('[data-testid="other-p1"]').click();
        const reqP = page.waitForRequest(isOutcomePost);
        await page.locator('[data-testid="record-outcome"]').click();
        const body = JSON.parse((await reqP).postData());
        expect(body.p1Summary.length).toBeLessThanOrEqual(80);
        expect(body.p1Summary.endsWith('...')).toBe(true);
        expect(body.detail).toContain(LONG);
        await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible();
    });

    test('134-D: blank caller text — P1 is disabled with a clear prompt and sends nothing (D4)', async ({ page }) => {
        let posts = 0;
        page.on('request', r => { if (isOutcomePost(r)) posts++; });
        await openOther(page);
        await page.locator('[data-testid="other-capture"]').click();

        const p1 = page.locator('[data-testid="other-p1"]');
        await expect(p1).toBeDisabled();
        await expect(p1).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('[data-testid="other-p1-blocked-note"]')).toBeVisible();
        await expect(page.locator('[data-testid="other-p1-blocked-note"]')).toContainText('Type the reason this is a P1 before escalating.');
        await expect(page.locator('[data-testid="other-p1-reason"]')).toBeVisible();

        // Forced click on the disabled button and a direct call both refuse (guard re-check)
        await p1.click({ force: true });
        await page.evaluate(() => window.raiseOtherP1());
        await expect(page.locator('[data-testid="confirm-step"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="other-p1-blocked-note"]')).toBeVisible();
        expect(posts).toBe(0);
        // The normal-priority button is never blocked
        await expect(page.locator('[data-testid="other-normal"]')).toBeEnabled();
    });

    test('134-D2: whitespace-only reason keeps the P1 blocked (D4)', async ({ page }) => {
        await openOther(page, '   ');
        await page.locator('[data-testid="other-capture"]').click();
        await page.locator('[data-testid="other-p1-reason"]').fill('   \n  ');
        await expect(page.locator('[data-testid="other-p1"]')).toBeDisabled();
        await expect(page.locator('[data-testid="other-p1-blocked-note"]')).toBeVisible();
    });

    test('134-D3: typing a real reason enables the P1 and the reason is sent (D4)', async ({ page }) => {
        await openOther(page);
        await page.locator('[data-testid="other-capture"]').click();
        const p1 = page.locator('[data-testid="other-p1"]');
        await expect(p1).toBeDisabled();
        await page.locator('[data-testid="other-p1-reason"]').pressSequentially('Water pouring through the bar ceiling', { delay: 10 });
        await expect(p1).toBeEnabled();
        await expect(page.locator('[data-testid="other-p1-blocked-note"]')).toBeHidden();
        await p1.click();
        const reqP = page.waitForRequest(isOutcomePost);
        await page.locator('[data-testid="record-outcome"]').click();
        const body = JSON.parse((await reqP).postData());
        expect(body.type).toBe('escalate-p1');
        expect(body.detail).toContain('Water pouring through the bar ceiling');
        expect(body.p1Summary).toBe('Something else: Water pouring through the bar ceiling');
        await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible();
    });

    test('134-E: Raise a Normal Priority ticket is exactly today\'s capture (AC4)', async ({ page }) => {
        await openOther(page, 'Voltage optimiser needs a reset');
        await page.locator('[data-testid="other-capture"]').click();
        await page.locator('[data-testid="other-normal"]').click();
        const reqP = page.waitForRequest(isOutcomePost);
        await page.locator('[data-testid="record-outcome"]').click();
        const body = JSON.parse((await reqP).postData());
        expect(body.type).toBe('capture');
        expect(body.subject).toBe('General issue captured');
        expect(body.OohCaptureClass).toBe('general');
        expect(body.detail).toBe('Caller reported: Voltage optimiser needs a reset. Captured verbatim for the IoT team.');
        expect(body.p1Summary).toBeUndefined();
        await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
        await expect(page.locator('[data-testid="outcome-p1"]')).toHaveCount(0);
    });

    test('134-F: Check if Lighthouse-controlled path is unchanged (AC4)', async ({ page }) => {
        await openOther(page, 'is the boiler yours?');
        await page.locator('[data-testid="other-check"]').click();
        await expect(page.locator('.stepq')).toContainText('Which of these is it closest to?');
        await expect(page.locator('[data-testid^="scope-"]').first()).toBeVisible();
        await expect(page.locator('[data-testid="other-p1"]')).toHaveCount(0);
    });

    test('134-G parity: Something else P1 carries the same P1 signal as the lighting P1 (AC6)', async ({ page }) => {
        await confirmSite(page, '6749', 'Angel Inn');

        // 1) Lighting P1 (proven flow)
        await page.locator('[data-testid="tile-lighting"]').click();
        await page.locator('.chip:has-text("Still not working")').click();
        let reqP = page.waitForRequest(isOutcomePost);
        let resP = page.waitForResponse(r => isOutcomePost(r.request()));
        await page.locator('[data-testid="record-outcome"]').click();
        const lightReq = JSON.parse((await reqP).postData());
        const lightRes = await (await resP).json();
        await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible();

        // 2) Something else P1 on the same site
        await page.locator('[data-testid="add-another-issue"]').click();
        await page.locator('[data-testid="tile-other"]').click();
        await page.locator('[data-testid="other-text"]').fill('Flooding in the cellar near the main fuse board');
        await page.locator('[data-testid="other-capture"]').click();
        await page.locator('[data-testid="other-p1"]').click();
        reqP = page.waitForRequest(isOutcomePost);
        resP = page.waitForResponse(r => isOutcomePost(r.request()));
        await page.locator('[data-testid="record-outcome"]').click();
        const otherReq = JSON.parse((await reqP).postData());
        const otherRes = await (await resP).json();
        await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible();

        // Request parity: same key set, same type, no capture class, no actionId
        expect(Object.keys(otherReq).sort()).toEqual(Object.keys(lightReq).sort());
        expect(lightReq.type).toBe('escalate-p1');
        expect(otherReq.type).toBe('escalate-p1');
        expect(lightReq.OohCaptureClass).toBeNull();
        expect(otherReq.OohCaptureClass).toBeNull();
        expect('actionId' in lightReq).toBe(false);
        expect('actionId' in otherReq).toBe(false);
        const differing = Object.keys(lightReq).filter(k => JSON.stringify(lightReq[k]) !== JSON.stringify(otherReq[k])).sort();
        const allowed = ['callerWords', 'detail', 'issueLabel', 'p1Summary', 'subject'];
        for (const k of differing) expect(allowed).toContain(k);

        // Ticket parity: both read back with identical tag sets incl. ooh + ooh_p1 (priority is
        // derived server-side purely from type === 'escalate-p1', so identical type => urgent for both)
        const lookup = await (await page.request.get('/api/callback/6749')).json();
        const byId = id => lookup.tickets.recent.find(t => t.id === id);
        const lt = byId(lightRes.ticket.id);
        const ot = byId(otherRes.ticket.id);
        expect(lt).toBeTruthy();
        expect(ot).toBeTruthy();
        expect([...ot.tags].sort()).toEqual([...lt.tags].sort());
        expect(ot.tags).toContain('ooh');
        expect(ot.tags).toContain('ooh_p1');
        // Both dispatched an escalation
        expect(lightRes.p1).toBeTruthy();
        expect(otherRes.p1).toBeTruthy();
    });

    test('134-H: choice step fits a 375px phone width without horizontal scroll', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await openOther(page);
        await page.locator('[data-testid="other-capture"]').click();
        await expect(page.locator('[data-testid="other-p1"]')).toBeVisible();
        await expect(page.locator('[data-testid="other-p1-explainer"]')).toBeVisible();
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(o.sw).toBeLessThanOrEqual(o.cw + 1);
    });
});
