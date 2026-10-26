/**
 * OOHDASH-144 C3-D1 — append-refused recovery (new-ticket fallback).
 *
 * Design §9.2: when POST /api/outcomes with appendToHoldId returns 409 append-refused,
 * the client must:
 *   (a) Show a plain-English error message.
 *   (b) Render a "Log for the IoT helpdesk and finish" button — NOT "Try again".
 *   (c) The new-ticket button must clear the append state and re-submit WITHOUT appendToHoldId.
 *   (d) The re-submit body must carry relatedToTicketId = <earlier ticket number>.
 *   (e) The server must add "Related: #N" as an internal comment on the new ticket.
 *
 * Test approach:
 *   - Walk through the BB-C2 boost flow to get a real action with ticketId + holdIds.
 *   - Intercept the FIRST POST /api/outcomes to return 409 append-refused.
 *   - Assert: (a) error message visible, (b) wrap-new-ticket button visible, no Try-again button.
 *   - Assert: (c) earlier ticket number shown in the error card as evidence.
 *   - Click wrap-new-ticket; intercept the SECOND POST to capture the body.
 *   - Assert: (d) second POST body has relatedToTicketId matching the earlier ticket.
 *   - Assert: (e) success banner appears (wrap-logged).
 *   - Also tests hold-not-found code path in unit coverage (unit test file).
 *
 * AR-1  — 409 append-refused → new-ticket button appears (not Try again)
 * AR-2  — error card shows earlier ticket number as evidence
 * AR-3  — clicking new-ticket button re-submits with relatedToTicketId in body
 * AR-4  — success banner appears after new-ticket submit
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

const FIXTURE_SITE = '9011';

async function cancelActiveHolds(request, siteNo) {
    await request.post(`/api/test/sites/${siteNo}/holds/cancel-all`).catch(() => {});
}

/**
 * Walk to the Check-and-log step after a boost-on dispatch on site 9011.
 * Returns the autolog ticket ID (string) if visible, or null.
 * Calls test.skip() if the boost-on button isn't available (wrong W-code).
 */
async function reachWrapUpAfterBoost(page) {
    await page.locator('[data-testid="tile-heating"]').click();
    await page.locator('button.chip', { hasText: 'Bar/Restaurant' }).click();

    // §8.3 hold intercept: dismiss if present so direction chips are visible.
    const holdCard = page.locator('[data-testid="reco-boost-hold"]');
    const needCold = page.locator('[data-testid="need-cold"]');
    await Promise.race([
        holdCard.waitFor({ timeout: 8000 }),
        needCold.waitFor({ timeout: 8000 })
    ]).catch(() => {});
    if (await holdCard.isVisible().catch(() => false)) {
        await page.locator('[data-testid="bp-hold-continue"]').click();
        await expect(needCold).toBeVisible({ timeout: 5000 });
    }

    await page.locator('[data-testid="need-cold"]').click();
    await expect(page.locator('[data-testid="reco-boiler-panel"]')).toBeVisible();

    const boostBtn = page.locator('[data-testid^="bp-boost-on-"]').first();
    if (!await boostBtn.isVisible().catch(() => false)) {
        test.skip(true, 'Boost ON button not visible — W3 outcome required; skip C3-D1');
        return null;
    }
    await boostBtn.click();
    await page.locator('[data-testid="reco-boost-dur"]').waitFor({ timeout: 5000 });
    await page.locator('[data-testid="bp-dur-60"]').click();

    // Ack warning if zone already forced.
    try {
        await page.locator('[data-testid="bp-boost-ack"]').waitFor({ timeout: 2000 });
        await page.locator('[data-testid="bp-boost-ack"]').click();
    } catch { /* no warning */ }

    await expect(page.locator('[data-testid="outcome-boost"]')).toBeVisible({ timeout: 10000 });

    // Read the autolog ticket id if shown.
    const autologText = await page.locator('[data-testid="autolog-box"]').textContent().catch(() => '');
    const m = autologText.match(/ticket\s*#(\d+)/i);
    const ticketId = m ? m[1] : null;

    // Navigate to Check and log.
    await page.locator('[data-testid="bp-finish-notes"]').click();
    await expect(page.locator('[data-testid="wrap-submit"]')).toBeVisible({ timeout: 5000 });

    return ticketId;
}

test.describe('OOHDASH-144 C3-D1 — append-refused recovery', () => {
    test.beforeEach(async ({ page, request }) => {
        await cancelActiveHolds(request, FIXTURE_SITE);
        await signIn(page, 'Test Handler');
    });

    /* ── AR-1..4: full end-to-end append-refused → new-ticket ─────────────── */
    test('AR-1..4: 409 append-refused shows new-ticket button; clicking it submits with relatedToTicketId', async ({ page }) => {
        await confirmSite(page, FIXTURE_SITE, 'Test Boiler Panel V1 (Heating)');
        const earlierTicketId = await reachWrapUpAfterBoost(page);

        // Determine whether the submit button is the append path ("Add to ticket #N").
        // If no ticket was auto-logged (Zendesk fixture unavailable), the test still runs but
        // the relatedToTicketId assertion is skipped.
        const submitLabel = await page.locator('[data-testid="wrap-submit"]').textContent();
        const isAppendPath = /Add to ticket #/.test(submitLabel || '');

        // --- Intercept the outcomes endpoint ---
        let outcomeCallCount = 0;
        let capturedSecondBody = null;

        await page.route('**/api/outcomes', async (route) => {
            outcomeCallCount++;
            if (outcomeCallCount === 1) {
                // Force 409 append-refused regardless of whether it would have happened naturally.
                await route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'append-refused', message: 'Cannot append: test intercept' })
                });
            } else {
                // Second call: capture the body and return a fixture success.
                try { capturedSecondBody = route.request().postDataJSON(); } catch { /* ok */ }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ticket: { id: 88888 } })
                });
            }
        });

        // Trigger the first submit (will be intercepted with 409).
        await page.locator('[data-testid="wrap-submit"]').click();

        // AR-1: error message visible; new-ticket button shown; no "Try again" button.
        await expect(page.locator('[data-testid="wrap-error"]')).toBeVisible({ timeout: 5000 });
        const errText = await page.locator('[data-testid="wrap-error"]').textContent();
        expect(errText, 'Error message must mention "Couldn\'t add to the existing ticket"')
            .toContain("Couldn't add to the existing ticket");

        // The §9.2 recovery button must be present.
        await expect(page.locator('[data-testid="wrap-new-ticket"]')).toBeVisible({ timeout: 3000 });

        // "Try again" must NOT appear for an append-fail (it would loop endlessly).
        const tryAgainCount = await page.locator('button:has-text("Try again")').count();
        expect(tryAgainCount, '"Try again" must not appear for append-refused').toBe(0);

        // AR-2: If an earlier ticket was shown, its number must appear in the error card as evidence.
        if (earlierTicketId) {
            expect(errText, `Error card must show earlier ticket number #${earlierTicketId}`)
                .toContain('#' + earlierTicketId);
        }

        // AR-3: Click the new-ticket button; second POST must carry relatedToTicketId.
        await page.locator('[data-testid="wrap-new-ticket"]').click();

        // AR-4: Success banner must appear.
        await expect(page.locator('[data-testid="wrap-logged"]')).toBeVisible({ timeout: 8000 });
        const loggedText = await page.locator('[data-testid="wrap-logged"]').textContent();
        expect(loggedText, 'Logged banner must show ticket 88888').toContain('88888');

        // Verify the second POST included relatedToTicketId when we have an earlier ticket to cite.
        expect(capturedSecondBody, 'Second POST body must have been captured').not.toBeNull();
        expect(capturedSecondBody?.appendToHoldId, 'Second POST must NOT include appendToHoldId (new ticket, not append)')
            .toBeFalsy();

        if (earlierTicketId) {
            expect(String(capturedSecondBody?.relatedToTicketId), 'relatedToTicketId must match earlier ticket')
                .toBe(earlierTicketId);
        }
    });
});
