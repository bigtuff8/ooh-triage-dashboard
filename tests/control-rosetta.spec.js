/**
 * OOHDASH-123 Rosetta Stone — operator-facing three-outcome journeys (design §5/§14, build plan §10).
 *
 * Drives the REAL client -> server -> fixture-sim round trip (DATA_MODE=fixture). The remaining plan
 * journeys (echo-before-accepted, cross-clock match-pending, pod-restart save-and-resume, timed-hold
 * revert) are covered at the unit level (rosetta-contract.test.js, late-sync-alert.test.js).
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe('OOHDASH-123 Rosetta three-outcome', () => {
    test.beforeEach(async ({ page }) => { await signIn(page, 'Test Handler'); });

    async function openLighting(page) {
        await page.locator('[data-testid="tile-lighting"]').click();
    }

    test('J1 CONFIRMED — a Tuya lighting switch confirms on the device reading (the only success)', async ({ page }) => {
        await confirmSite(page, '6961', 'Red Lion Rosetta');
        await openLighting(page);
        // reads ON → offer Turn OFF
        await page.locator('[data-testid="lighting-switch-off"]').click();
        await page.locator('[data-testid="control-send"]').click();
        await expect(page.locator('[data-testid="sync-confirmed"]')).toContainText('Confirmed', { timeout: 20000 });
        await expect(page.locator('[data-testid="sync-confirmed"]')).toContainText('OFF');
        await page.locator('[data-testid="sync-done"]').click();
        await expect(page.locator('[data-testid="outcome-applied"]')).toContainText('device confirmed');
    });

    test('J4 NOT DELIVERED — a vendor rejection shows a plain sentence; no raw gate:/vendor: string on screen', async ({ page }) => {
        await confirmSite(page, '6962', 'Angel Rosetta');
        await openLighting(page);
        await page.locator('[data-testid="lighting-switch-on"]').click();
        await page.locator('[data-testid="control-send"]').click();
        const bad = page.locator('[data-testid="sync-notdelivered"]');
        await expect(bad).toContainText('Not delivered', { timeout: 20000 });
        await expect(bad).toContainText('Could not reach the device');       // translated vendor copy
        await expect(bad).not.toContainText('vendor:');
        await expect(bad).not.toContainText('gate:');
        await expect(page.locator('[data-testid="sync-confirmed"]')).toHaveCount(0);
        await page.locator('[data-testid="sync-escalate"]').click();
        await expect(page.locator('[data-testid="outcome-escalated"]')).toContainText('not applied');
    });

    test('J5/J6 NOT CONFIRMED — accepted but no device echo by the limit; no Resend affordance', async ({ page }) => {
        await confirmSite(page, '6963', 'Swan Rosetta');
        await openLighting(page);
        await page.locator('[data-testid="lighting-switch-on"]').click();
        await page.locator('[data-testid="control-send"]').click();
        const ind = page.locator('[data-testid="sync-notconfirmed"]');
        await expect(ind).toContainText('Not confirmed yet', { timeout: 30000 });
        // DD-RESEND-UX: there is NO resend control anywhere on a not-confirmed outcome.
        await expect(page.locator('button:has-text("Resend")')).toHaveCount(0);
        await expect(page.locator('[data-testid="sync-confirmed"]')).toHaveCount(0);
    });

    test('J9 DD-WAIT-HANDOFF — a slow Salus setpoint releases the handler at once ("about N minutes")', async ({ page }) => {
        await confirmSite(page, '6961', 'Red Lion Rosetta');
        await page.locator('[data-testid="tile-heating"]').click();
        await page.locator('[data-testid="area-bar-restaurant"]').click();
        await page.locator('[data-testid="need-warm"]').click();
        await page.locator('[data-testid="control-send"]').click();
        const slow = page.locator('[data-testid="sync-sent-slow"]');
        await expect(slow).toContainText('Sent to the device', { timeout: 20000 });
        await expect(slow).toContainText('carry on');
        // the operator is released at once with a "carry on" action (not blocked on a spinner).
        await expect(page.locator('[data-testid="sync-release"]')).toBeVisible();
    });

    test('J13 Hot water — no boost chip, no "controllable" tag; capture-and-escalate only', async ({ page }) => {
        await confirmSite(page, '6234', 'Ship Inn');
        await page.locator('[data-testid="tile-hotwater"]').click();
        await expect(page.locator('[data-testid="hw-boost-yes"]')).toHaveCount(0);   // boost chip removed
        await expect(page.locator('.tag.green')).toHaveCount(0);                      // no "controllable" tag
        await page.locator('[data-testid="hw-capture"]').click();
        await page.locator('[data-testid="record-outcome"]').click();
        await expect(page.locator('[data-testid="outcome-captured"]')).toContainText('Captured for the IoT team');
    });

    test('J8 device already at the requested value — honest no-write success (API)', async ({ page }) => {
        await confirmSite(page, '6964', 'Falcon Rosetta');
        // 6964 lighting reads switch_1=true; a dispatch of true is already-satisfied (no write).
        const token = await page.evaluate(() => state.confirmToken);
        const res = await page.evaluate(async (confirmToken) => {
            const r = await fetch('/api/control/dispatch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmToken, siteNo: '6964', deviceId: 'gk-6964-externallighting-1', command: 'switch', value: true })
            });
            return { status: r.status, body: await r.json() };
        }, token);
        expect(res.status).toBe(200);
        expect(res.body.action.state).toBe('already-set');
    });

    test('J7 no 409 dead-end — a genuine change dispatches (DD-RESEND-UX removed duplicate-pending) (API)', async ({ page }) => {
        await confirmSite(page, '6964', 'Falcon Rosetta');
        const token = await page.evaluate(() => state.confirmToken);
        const res = await page.evaluate(async (confirmToken) => {
            const r = await fetch('/api/control/dispatch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmToken, siteNo: '6964', deviceId: 'gk-6964-externallighting-2', command: 'switch', value: true })
            });
            return { status: r.status, body: await r.json() };
        }, token);
        expect(res.status).toBe(200);
        expect(res.body.action.state).toBe('in-flight');
    });
});
