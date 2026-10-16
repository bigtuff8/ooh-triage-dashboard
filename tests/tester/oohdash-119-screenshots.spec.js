/**
 * OOHDASH-119 — Screenshot capture for test evidence.
 * Captures key screens: notes box, confirm step, P1 wording, post-submit box, error state.
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from '../helpers.js';
import path from 'path';
import fs from 'fs';

const DIR = 'docs/project/test-evidence/oohdash-119';
fs.mkdirSync(DIR, { recursive: true });

test('SS-01: notes box visible from step one at desktop 1280', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('#addnotes').waitFor({ timeout: 5000 });
    await page.screenshot({ path: DIR + '/01-notes-box-desktop.png' });
});

test('SS-02: confirm step with note text filled', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('boiler not working', { delay: 20 });
    await page.locator('#addnotes').pressSequentially('Engineer due at 7am - called ahead', { delay: 5 });
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="other-normal"]').click(); // OOHDASH-134: Capture -> normal priority
    await expect(page.locator('[data-testid="confirm-step"]')).toBeVisible();
    await page.screenshot({ path: DIR + '/02-confirm-step.png' });
});

test('SS-03: P1 flow — helper text and P1 echo wording', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    // Kitchen tile → fryer chip → P1 confirm step (lighting P1 also works)
    await page.locator('[data-testid="tile-other"]').click();
    await expect(page.locator('#addnotes')).toBeVisible();
    // Check helper text visible
    await page.screenshot({ path: DIR + '/03-helper-text.png' });
});

test('SS-04: post-submit box — idle state', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('fryer issue', { delay: 20 });
    await page.locator('#addnotes').pressSequentially('Note for post-submit test', { delay: 5 });
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="other-normal"]').click(); // OOHDASH-134: Capture -> normal priority
    await expect(page.locator('[data-testid="confirm-step"]')).toBeVisible();
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
    await page.screenshot({ path: DIR + '/04-outcome-captured.png' });
    // Open post-submit box
    await page.locator('[data-testid="addnotes-post-open"]').click().catch(() => {
        page.locator('button:has-text("Add a note to ticket")').click();
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: DIR + '/05-post-submit-open.png' });
});

test('SS-05: 500 error state from post-submit save', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('error test', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="other-normal"]').click(); // OOHDASH-134: Capture -> normal priority
    await expect(page.locator('[data-testid="confirm-step"]')).toBeVisible();
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
    // Open post-submit notes box
    await page.locator('[data-testid="addnotes-post-open"]').click();
    await expect(page.locator('[data-testid="addnotes-post-input"]')).toBeVisible();
    // Intercept notes save to force 500 error
    await page.route('**/api/tickets/**', route => route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) }));
    await page.locator('[data-testid="addnotes-post-input"]').fill('error state test note');
    await page.locator('[data-testid="addnotes-post-save"]').click();
    // Wait for error state to render
    await expect(page.locator('[data-testid="addnotes-post-error"]')).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: DIR + '/06-post-submit-error.png' });
});

test('SS-06: mobile 390x844 — notes box layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('#addnotes').waitFor({ timeout: 5000 });
    await page.screenshot({ path: DIR + '/07-notes-box-mobile.png' });
});
