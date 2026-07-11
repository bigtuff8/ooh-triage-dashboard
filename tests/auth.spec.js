/** F001 — authentication, authorisation, origin protection. */
import { test, expect } from '@playwright/test';
import { signIn } from './helpers.js';

test.describe('F001 auth', () => {
    test('unauthenticated API request is rejected with 401 JSON', async ({ request }) => {
        const res = await request.get('/api/me');
        expect(res.status()).toBe(401);
        const body = await res.json();
        expect(body.error).toContain('Not signed in');
    });

    test('unauthenticated page load redirects to sign-in', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/\/auth\/dev/);
        await expect(page.locator('body')).toContainText('Development sign-in');
    });

    test('signed-in operator identity is shown in the UI', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await expect(page.locator('.opchip')).toContainText('OOH Handler');
        await expect(page.locator('.opchip')).toContainText('signed in via SSO');
    });

    test('handler role cannot reach admin APIs (server-side 403)', async ({ page }) => {
        await signIn(page, 'Test Handler');
        const status = await page.evaluate(async () => (await fetch('/api/admin/killswitch')).status);
        expect(status).toBe(403);
        // and the nav does not offer Admin
        await expect(page.locator('[data-testid="nav-admin"]')).toHaveCount(0);
    });

    test('IoT role sees Admin nav and can load admin data', async ({ page }) => {
        await signIn(page, 'Test IoT Admin');
        await page.locator('[data-testid="nav-admin"]').click();
        await expect(page.locator('[data-testid="admin-killswitch"]')).toContainText('Device control kill-switch');
        await expect(page.locator('[data-testid="admin-registry"]')).toContainText('Salus IT500');
    });

    test('server rejects mutating request carrying a foreign Origin header', async ({ page, request }) => {
        await signIn(page, 'Test Handler');
        const cookies = await page.context().cookies();
        const sid = cookies.find(c => c.name === 'ooh.sid');
        const res = await request.post('/api/query', {
            headers: { Origin: 'https://evil.example.com', Cookie: `${sid.name}=${sid.value}` },
            data: { text: 'cross-origin probe' }
        });
        expect(res.status()).toBe(403);
        expect((await res.json()).error).toContain('Cross-origin');
    });

    test('sign out ends the session', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await page.locator('button:has-text("Sign out")').click();
        await expect(page).toHaveURL(/\/auth\/dev/);
        const status = await page.evaluate(async () => (await fetch('/api/me')).status);
        expect(status).toBe(401);
    });
});
