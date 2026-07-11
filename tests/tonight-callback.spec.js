/** F011/F013/F015 + Tonight shift view — tickets, translation layer, notes, queries. */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

test.describe('tonight & callback', () => {
    test('F011 outcomes land in Tonight with agent, real detail and outcome chips', async ({ page }) => {
        await signIn(page, 'Test Handler');
        // Produce a distinctive captured outcome first
        await confirmSite(page, '6749', 'Angel Inn');
        await page.locator('[data-testid="tile-lighting"]').click();
        await page.locator('.chip:has-text("Caller sorted it with the override")').click();
        await expect(page.locator('[data-testid="outcome-captured"]')).toContainText(/Ticket #\d+/);

        await page.locator('[data-testid="nav-tonight"]').click();
        const table = page.locator('[data-testid="tonight-table"]');
        await expect(table).toContainText('Angel Inn');
        await expect(table).toContainText('Test Handler');
        await expect(table).toContainText('External lighting — resolved with on-site override · class: lighting');
        await expect(table.locator('.tag:has-text("captured")').first()).toBeVisible();
        await expect(table).not.toContainText('[object');

        // Site filter narrows rows live
        await page.locator('[data-testid="tonight-filter"]').pressSequentially('angel', { delay: 30 });
        await expect(page.locator('[data-testid="tonight-table"]')).toContainText('Angel Inn');
        await page.locator('[data-testid="tonight-filter"]').fill('');
        await page.locator('[data-testid="tonight-filter"]').pressSequentially('zzz-no-such-site', { delay: 20 });
        await expect(page.locator('[data-testid="tonight-empty"]')).toContainText('No activity matching');
    });

    test('raise a query creates a ticket (empty query rejected)', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await page.locator('[data-testid="nav-tonight"]').click();
        await page.locator('[data-testid="raise-query"]').click();
        // negative: empty query
        await page.locator('[data-testid="query-send"]').click();
        await expect(page.locator('.toast').last()).toContainText('Describe the query first');
        await page.locator('[data-testid="query-text"]').pressSequentially('Caller says they rang two nights ago about fryers', { delay: 15 });
        await page.locator('[data-testid="query-send"]').click();
        await expect(page.locator('.toast').last()).toContainText(/Query sent to the IoT team — ticket #\d+/);
    });

    test('F013 callback lookup translates status, shows script + chargeable-visit warning (Ship Inn)', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await page.locator('[data-testid="nav-callback"]').click();
        await page.locator('[data-testid="callback-search"]').pressSequentially('6234', { delay: 40 });
        await expect(page.locator('#cbres .ri').first()).toBeVisible();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        const results = page.locator('[data-testid="callback-results"]');
        await expect(results).toContainText('No hot water — intermittent');
        // translated status, not the raw Zendesk word
        await expect(results).toContainText('Waiting for GK repair contractor to attend');
        await results.locator('.stepdone', { hasText: 'No hot water — intermittent' }).click();
        const drawer = page.locator('.drawer');
        await expect(drawer.locator('[data-testid="caller-script"]')).toContainText('your issue was reported');
        await expect(drawer.locator('[data-testid="caller-script"]')).toContainText('repair contractor');
        await expect(drawer.locator('[data-testid="chargeable-warning"]')).toContainText('may be chargeable');
        // timeline shows translated comments (no internal system names)
        await expect(drawer).not.toContainText('ThingsBoard');
    });

    test('callback empty state points back to a new call', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await page.locator('[data-testid="nav-callback"]').click();
        await page.locator('[data-testid="callback-search"]').pressSequentially('7971', { delay: 40 });
        await expect(page.locator('#cbres .ri').first()).toBeVisible();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        // Shuttle & Loom has no fixture tickets → Active tab empty message
        await expect(page.locator('[data-testid="callback-empty"]')).toContainText('No tickets for this site');
    });

    test('F015 notes: handler adds a note, it appears in the shared thread', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await page.locator('[data-testid="nav-callback"]').click();
        await page.locator('[data-testid="callback-search"]').pressSequentially('6234', { delay: 40 });
        await expect(page.locator('#cbres .ri').first()).toBeVisible();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.locator('[data-testid="callback-results"] .stepdone').first().click();
        await page.locator('[data-testid="note-input"]').pressSequentially('Caller rang back — situation unchanged', { delay: 15 });
        await page.locator('[data-testid="note-send"]').click();
        await expect(page.locator('.toast').last()).toContainText('Note added');
        await expect(page.locator('.drawer #thread')).toContainText('Caller rang back — situation unchanged');
        await expect(page.locator('.drawer #thread')).toContainText('Test Handler');
    });

    test('smart issue entry suggests flows from the caller’s words and carries them into the flow', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await confirmSite(page, '6832', 'Old Grey Mare');
        await page.locator('[data-testid="smart-entry"]').pressSequentially('pub is freezing cold', { delay: 30 });
        await expect(page.locator('[data-testid="suggest-heating"]')).toContainText('Heating');
        await page.locator('[data-testid="suggest-heating"]').click();
        // caller's words pinned to the flow
        await expect(page.locator('[data-testid="flow-panel"]')).toContainText('pub is freezing cold');
        await expect(page.locator('[data-testid="flow-panel"]')).toContainText('Which area is the caller talking about?');
    });

    test('smart issue entry works with quotes/apostrophes in the caller’s words (rework-1 regression)', async ({ page }) => {
        // Tester finding 2026-07-11: apostrophes ("won't", "it's") broke the inline
        // onclick handlers — the chip did nothing and the caller's words were lost.
        const callerWords = `it's freezing and the heating won't come on`;
        await signIn(page, 'Test Handler');
        await confirmSite(page, '6832', 'Old Grey Mare');
        await page.locator('[data-testid="smart-entry"]').pressSequentially(callerWords, { delay: 20 });
        await expect(page.locator('[data-testid="suggest-heating"]')).toContainText('Heating');
        const consoleErrors = [];
        page.on('pageerror', e => consoleErrors.push(e.message));
        await page.locator('[data-testid="suggest-heating"]').click();
        // the flow MUST start and carry the words verbatim (apostrophes intact)
        await expect(page.locator('[data-testid="flow-panel"]')).toContainText('Which area is the caller talking about?');
        await expect(page.locator('[data-testid="flow-panel"]')).toContainText(callerWords);
        expect(consoleErrors).toEqual([]);

        // "Continue with what you typed" must survive the same input (second entry point, same bug class)
        page.once('dialog', d => d.accept());
        await page.locator('[data-testid="flow-panel"] button:has-text("Cancel issue")').click();
        await expect(page.locator('[data-testid="smart-entry"]')).toBeVisible();
        await page.locator('[data-testid="smart-entry"]').pressSequentially(`the voltage optimiser won't reset — is that you?`, { delay: 20 });
        await page.locator('[data-testid="suggest-other"]').click();
        await expect(page.locator('[data-testid="flow-panel"]')).toContainText(`the voltage optimiser won't reset`);
        expect(consoleErrors).toEqual([]);
    });

    test('connection-check banner appears automatically for an offline site (Bay Horse) and flow captures', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await confirmSite(page, '6750', 'Bay Horse');
        const banner = page.locator('[data-testid="offline-banner"]');
        await expect(banner).toContainText('not responding');
        await banner.locator('button:has-text("Run connection check")').click();
        await expect(page.locator('[data-testid="connectivity-alert"]')).toContainText('gateway at this site is offline');
        await page.locator('[data-testid="connectivity-stilldead"]').click();
        await expect(page.locator('[data-testid="outcome-captured"]')).toContainText(/Ticket #\d+/);
    });

    test('contractor flow escalates P1 with contractor details and text-message wording', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await confirmSite(page, '6759', 'Brentwood');
        await page.locator('[data-testid="tile-contractor"]').click();
        await page.locator('[data-testid="contractor-name"]').pressSequentially('Test Contractor, ExampleCo', { delay: 15 });
        await page.locator('[data-testid="contractor-need"]').pressSequentially('needs BMS access to the heating', { delay: 15 });
        await page.locator('[data-testid="contractor-escalate"]').click();
        const p1 = page.locator('[data-testid="outcome-p1"]');
        await expect(p1).toContainText('Escalated — P1');
        await expect(p1).toContainText('text message');
        await expect(p1).toContainText('on-duty escalation manager');
        await expect(p1).toContainText('IoT Support dashboard');
        // the standardised register: the word "paged" is not used
        await expect(p1).not.toContainText('paged');
    });

    test('scope check answers with site-scoped certainty (Something else → boiler)', async ({ page }) => {
        await signIn(page, 'Test Handler');
        await confirmSite(page, '6832', 'Old Grey Mare');
        await page.locator('[data-testid="tile-other"]').click();
        await page.locator('[data-testid="other-text"]').fill('');
        await page.locator('[data-testid="other-text"]').pressSequentially('boiler PCB fault — is that you?', { delay: 15 });
        await page.locator('[data-testid="other-check"]').click();
        await page.locator('[data-testid="scope-boiler"]').click();
        const outcome = page.locator('[data-testid="outcome-scope"]');
        await expect(outcome).toContainText('Not on Lighthouse at this site');
        await expect(outcome).toContainText(/ticket #\d+ \(scope-only\)/);
    });
});
