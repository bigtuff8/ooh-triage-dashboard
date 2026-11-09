/**
 * OOHDASH-134 — P1 Escalation choice in the 'Something else' flow (v1.6.x riskQuestion design).
 *
 * Stage 0: other-text textarea + other-continue button (single button).
 * Stage 1: scope chips + scope-none-of-these button.
 * riskQuestion: risk-yes / risk-no chips.
 * risk-yes → p1-reason textarea (10+ chars) + record-outcome button (disabled until valid).
 * risk-no  → auto-submits non-P1 outcome → outcome-captured visible.
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

async function openOtherToRisk(page, text) {
    await openOther(page, text);
    await page.locator('[data-testid="other-continue"]').click();
    await page.locator('[data-testid="scope-none-of-these"]').click();
}

test.describe('OOHDASH-134 — P1 Escalation in Something else', () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page, 'Test Handler');
    });

    test('134-A: scope-none-of-these shows riskQuestion with risk-yes and risk-no chips (AC1)', async ({ page }) => {
        await openOtherToRisk(page, 'Something odd at the bar');
        await expect(page.locator('[data-testid="risk-yes"]')).toBeVisible();
        await expect(page.locator('[data-testid="risk-no"]')).toBeVisible();
        await expect(page.locator('[data-testid="confirm-step"]')).toHaveCount(0);
    });

    test('134-A2: stage 0 shows only other-text and other-continue — old buttons absent (AC1)', async ({ page }) => {
        await openOther(page);
        await expect(page.locator('[data-testid="other-text"]')).toBeVisible();
        await expect(page.locator('[data-testid="other-continue"]')).toBeVisible();
        await expect(page.locator('[data-testid="other-p1"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="other-normal"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="other-capture"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="other-check"]')).toHaveCount(0);
    });

    test('134-B: risk-yes path raises escalate-p1 outcome after typing reason in p1-reason box (AC2)', async ({ page }) => {
        await openOtherToRisk(page, 'Gas smell near the cellar door, staff evacuating the kitchen');
        await page.locator('[data-testid="risk-yes"]').click();
        // p1-reason box visible; record-outcome disabled until 10+ chars
        await expect(page.locator('[data-testid="p1-reason"]')).toBeVisible();
        await expect(page.locator('[data-testid="record-outcome"]')).toBeDisabled();
        await page.locator('[data-testid="p1-reason"]').fill('Gas smell near cellar door — staff evacuating');
        await expect(page.locator('[data-testid="record-outcome"]')).toBeEnabled();
        const reqP = page.waitForRequest(isOutcomePost);
        await page.locator('[data-testid="record-outcome"]').click();
        const body = JSON.parse((await reqP).postData());
        expect(body.type).toBe('escalate-p1');
        expect(body.subject).toBe('Something else — risk to trade or health and safety — P1');
        expect(body.p1Reason).toBeTruthy();
        await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible();
        await expect(page.locator('[data-testid="outcome-captured"]')).toHaveCount(0);
    });

    test('134-C: long reason text — p1Summary cut to 80 chars, p1Reason kept full in POST (AC3)', async ({ page }) => {
        const LONG_REASON = 'Customer reports a strong burning smell coming from the plant room behind the kitchen and extractor silent';
        expect(LONG_REASON.length).toBeGreaterThanOrEqual(80);
        await openOtherToRisk(page, 'burning smell');
        await page.locator('[data-testid="risk-yes"]').click();
        await page.locator('[data-testid="p1-reason"]').fill(LONG_REASON);
        const reqP = page.waitForRequest(isOutcomePost);
        await page.locator('[data-testid="record-outcome"]').click();
        const body = JSON.parse((await reqP).postData());
        expect(body.p1Summary.length).toBeLessThanOrEqual(80);
        expect(body.p1Reason).toBe(LONG_REASON);
        await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible();
    });

    test('134-D: risk-yes shows p1-reason box; record-outcome disabled until 10+ chars typed (D4)', async ({ page }) => {
        let posts = 0;
        page.on('request', r => { if (isOutcomePost(r)) posts++; });
        await openOtherToRisk(page, '');
        await page.locator('[data-testid="risk-yes"]').click();
        const recordBtn = page.locator('[data-testid="record-outcome"]');
        await expect(page.locator('[data-testid="p1-reason"]')).toBeVisible();
        await expect(recordBtn).toBeDisabled();
        // Forced click on the disabled button sends nothing
        await recordBtn.click({ force: true });
        await expect(page.locator('[data-testid="outcome-p1"]')).toHaveCount(0);
        expect(posts).toBe(0);
    });

    test('134-D2: whitespace-only reason keeps record-outcome disabled (D4)', async ({ page }) => {
        await openOtherToRisk(page, '');
        await page.locator('[data-testid="risk-yes"]').click();
        await page.locator('[data-testid="p1-reason"]').fill('   \n  ');
        await expect(page.locator('[data-testid="record-outcome"]')).toBeDisabled();
    });

    test('134-D3: typing 10+ char reason enables record-outcome and reason sent in POST (D4)', async ({ page }) => {
        await openOtherToRisk(page, '');
        await page.locator('[data-testid="risk-yes"]').click();
        const recordBtn = page.locator('[data-testid="record-outcome"]');
        await expect(recordBtn).toBeDisabled();
        await page.locator('[data-testid="p1-reason"]').pressSequentially('Water pouring through the bar ceiling', { delay: 10 });
        await expect(recordBtn).toBeEnabled();
        const reqP = page.waitForRequest(isOutcomePost);
        await recordBtn.click();
        const body = JSON.parse((await reqP).postData());
        expect(body.type).toBe('escalate-p1');
        expect(body.p1Reason).toContain('Water pouring through the bar ceiling');
        await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible();
    });

    test('134-E: risk-no path captures non-P1 outcome with correct subject (AC4)', async ({ page }) => {
        await openOtherToRisk(page, 'Voltage optimiser needs a reset');
        const reqP = page.waitForRequest(isOutcomePost);
        await page.locator('[data-testid="risk-no"]').click();
        const body = JSON.parse((await reqP).postData());
        expect(body.type).toBe('capture');
        expect(body.subject).toBe('Something else — no immediate risk');
        expect(body.OohCaptureClass).toBe('general');
        expect(body.detail).toContain('Voltage optimiser needs a reset');
        await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
        await expect(page.locator('[data-testid="outcome-p1"]')).toHaveCount(0);
    });

    test('134-F: other-continue shows scope chips at stage 1 (AC4)', async ({ page }) => {
        await openOther(page, 'is the boiler yours?');
        await page.locator('[data-testid="other-continue"]').click();
        await expect(page.locator('.stepq')).toContainText('Which of these is it closest to?');
        await expect(page.locator('[data-testid^="scope-"]').first()).toBeVisible();
        await expect(page.locator('[data-testid="scope-none-of-these"]')).toBeVisible();
        await expect(page.locator('[data-testid="other-p1"]')).toHaveCount(0);
    });

    test('134-G parity: Something else P1 carries the same P1 signal as the lighting P1 (AC6)', async ({ page }) => {
        await confirmSite(page, '6749', 'Angel Inn');

        // 1) Lighting P1
        await page.locator('[data-testid="tile-lighting"]').click();
        let reqP = page.waitForRequest(isOutcomePost);
        let resP = page.waitForResponse(r => isOutcomePost(r.request()));
        await page.locator('[data-testid="lighting-still-off"]').click();
        await page.locator('[data-testid="risk-yes"]').click();
        await page.locator('[data-testid="record-outcome"]').click();
        const lightReq = JSON.parse((await reqP).postData());
        const lightRes = await (await resP).json();
        await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible();

        // 2) Something else P1 on the same site
        await page.locator('[data-testid="add-another-issue"]').click();
        await page.locator('[data-testid="tile-other"]').click();
        await page.locator('[data-testid="other-text"]').fill('Flooding in the cellar near the main fuse board');
        await page.locator('[data-testid="other-continue"]').click();
        await page.locator('[data-testid="scope-none-of-these"]').click();
        await page.locator('[data-testid="risk-yes"]').click();
        await page.locator('[data-testid="p1-reason"]').fill('Flooding near fuse board — immediate risk');
        reqP = page.waitForRequest(isOutcomePost);
        resP = page.waitForResponse(r => isOutcomePost(r.request()));
        await page.locator('[data-testid="record-outcome"]').click();
        const otherReq = JSON.parse((await reqP).postData());
        const otherRes = await (await resP).json();
        await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible();

        // Both must be escalate-p1 type, with ooh_p1 tag
        expect(lightReq.type).toBe('escalate-p1');
        expect(otherReq.type).toBe('escalate-p1');
        expect(lightReq.OohCaptureClass).toBeNull();
        expect(otherReq.OohCaptureClass).toBeNull();
        expect('actionId' in lightReq).toBe(false);
        expect('actionId' in otherReq).toBe(false);

        // Key-set parity (allowing p1Reason/p1Origin as extra fields in Something Else P1)
        const lightKeys = new Set(Object.keys(lightReq));
        const otherKeys = new Set(Object.keys(otherReq));
        const extraInOther = [...otherKeys].filter(k => !lightKeys.has(k));
        const allowedExtra = ['p1Reason', 'p1Origin'];
        for (const k of extraInOther) expect(allowedExtra).toContain(k);

        // Both dispatched an escalation
        expect(lightRes.p1).toBeTruthy();
        expect(otherRes.p1).toBeTruthy();

        const lookup = await (await page.request.get('/api/callback/6749')).json();
        const byId = id => lookup.tickets.recent.find(t => t.id === id);
        const lt = byId(lightRes.ticket.id);
        const ot = byId(otherRes.ticket.id);
        expect(lt).toBeTruthy();
        expect(ot).toBeTruthy();
        expect(ot.tags).toContain('ooh');
        expect(ot.tags).toContain('ooh_p1');
    });

    test('134-H: risk question fits a 375px phone width without horizontal scroll', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await openOtherToRisk(page);
        await expect(page.locator('[data-testid="risk-yes"]')).toBeVisible();
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(o.sw).toBeLessThanOrEqual(o.cw + 1);
    });
});
