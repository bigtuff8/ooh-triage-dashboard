/** Protocol 3 removal assertions (F019/F002 retirements) + /healthz + metrics (F021/F022). */
import { test, expect } from '@playwright/test';
import { signIn } from './helpers.js';

test.describe('removals & health', () => {
    test('F002: direct vendor write routes are gone', async ({ page }) => {
        await signIn(page, 'Test Handler');
        const statuses = await page.evaluate(async () => {
            const probe = async (url, method = 'POST') => (await fetch(url, { method })).status;
            return {
                salus: await probe('/api/salus/setpoint'),
                tuya: await probe('/api/tuya/command'),
                intesis: await probe('/api/intesis/setpoint'),
                pocket: await probe('/api/pocket-changes')
            };
        });
        for (const s of Object.values(statuses)) expect(s).toBe(404);
    });

    test('F019: prototype leftovers are gone — no role-swap preview, no Review Queue nav', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await expect(page.locator('.roleswap')).toHaveCount(0);
        await expect(page.locator('select')).toHaveCount(0);
        await expect(page.locator('.nav button:has-text("Review Queue")')).toHaveCount(0);
        // orphaned frontend files no longer served
        const statuses = await page.evaluate(async () => ({
            ooh: (await fetch('/js/ooh.js')).status,
            triage: (await fetch('/js/triage-flows.js')).status
        }));
        // SPA fallback returns index.html (200) only for authenticated HTML paths; direct js misses should 404 via static
        expect(statuses.ooh).not.toBe(200);
        expect(statuses.triage).not.toBe(200);
    });

    test('F018/F021: /healthz reports subsystems and alerts without auth', async ({ request }) => {
        const res = await request.get('/healthz');
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('ok');
        expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(body.subsystems.bridge).toBeDefined();
        expect(body.subsystems.thingsboard).toBeDefined();
        expect(body.subsystems.zendesk).toBeDefined();
        expect(body.subsystems.store).toBeDefined();
        expect(Array.isArray(body.activeAlerts)).toBe(true);
    });

    test('F022: metrics compute from the audit trail (IoT admin)', async ({ page }) => {
        await signIn(page, 'Test IoT Admin');
        await page.locator('[data-testid="nav-admin"]').click();
        const metrics = page.locator('[data-testid="admin-metrics"]');
        await expect(metrics).toContainText('Self-serve rate');
        await expect(metrics).toContainText('Control success rate');
        await expect(metrics).toContainText('P1 escalations');
        // earlier specs generated real outcomes — totals must not be the empty placeholder everywhere
        await expect(metrics).not.toContainText('NaN');
        // earlier specs raised captures — the count is a real number ≥ 1
        const captured = await page.locator('[data-testid="admin-metrics"] tr', { hasText: 'Captured for next day' }).locator('b').textContent();
        expect(Number(captured)).toBeGreaterThan(0);
    });

    test('P1 text log records dispatch with deep-link and supports acknowledgement (F014 SLA hook)', async ({ page }) => {
        await signIn(page, 'Test IoT Admin');
        await page.locator('[data-testid="nav-admin"]').click();
        const smsCard = page.locator('.card:has(h3:has-text("P1 text-message log"))');
        // earlier specs raised P1s (fridge stock-risk, contractor)
        await expect(smsCard).toContainText('On-duty escalation manager');
        await expect(smsCard).toContainText(/#\d+/);
        const ackBtn = smsCard.locator('button:has-text("Mark acknowledged")').first();
        await ackBtn.click();
        await expect(smsCard.locator('.tag.green:has-text("ack")').first()).toBeVisible();
    });
});
