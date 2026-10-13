/**
 * OOHDASH-119 — Additional notes e2e tests (E1–E22).
 *
 * Live-proof site: Old Grey Mare (6832) — contains heating (Salus), refrigeration
 * and an outside-lighting fixture, matching operator decision B3.
 *
 * Tests cover: notes textarea visibility, autosave, confirm-step placement,
 * POST payload, outcome echo, post-submit late notes, ambiguous-site path,
 * query path, draft clearing, max-chars, null/empty handling, P1 echo wording,
 * capture-flow note, and post-submit failure-keeps-text.
 */
import { test, expect } from '@playwright/test';
import { signIn, confirmSite } from './helpers.js';

// ─── E1: notes textarea is visible from step one of a guided flow ────────────
test('E1: notes textarea visible from step one of a guided heating flow', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-heating"]').click();
    // Notes box should be visible immediately (before any step is chosen)
    const notes = page.locator('#addnotes');
    await expect(notes).toBeVisible();
    await expect(notes).toHaveAttribute('placeholder', /.+/);
});

// ─── E2: notes are autosaved to sessionStorage as the user types ──────────────
test('E2: typing in notes autosaves to sessionStorage (debounced)', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('#addnotes').fill('E2 autosave test note');
    // Wait for the debounce to flush (notes.js debounces at ~500ms)
    await page.waitForTimeout(700);
    const stored = await page.evaluate(() => {
        try { const raw = sessionStorage.getItem('ooh_note_draft'); return raw ? JSON.parse(raw) : null; } catch { return null; }
    });
    expect(stored).toBeTruthy();
    expect(stored.value).toBe('E2 autosave test note');
});

// ─── E3: notes textarea stays live during the aircon shortcut path ────────────
test('E3: notes field present during aircon shortcut chip flow', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6218', 'Kings Head');
    await page.locator('[data-testid="tile-heating"]').click();
    // Notes field visible BEFORE clicking the shortcut
    await expect(page.locator('#addnotes')).toBeVisible();
    await page.locator('#addnotes').fill('E3 aircon note');
    // Aircon shortcut visible and clickable
    const shortcut = page.locator('[data-testid="aircon-shortcut"]');
    await expect(shortcut).toBeVisible();
    // Clicking shortcut should transition to confirm step (not fire POST directly)
    await shortcut.click();
    const confirmStep = page.locator('[data-testid="confirm-step"]');
    await expect(confirmStep).toBeVisible();
    await expect(confirmStep).toContainText('Record outcome');
});

// ─── E4: confirm step appears on outcome chip click, not the POST ─────────────
test('E4: confirm step shown on chip click; Record outcome fires the POST', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('test confirm step', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();

    // Confirm step must show before any POST
    const confirmStep = page.locator('[data-testid="confirm-step"]');
    await expect(confirmStep).toBeVisible();
    await expect(page.locator('[data-testid="outcome-captured"]')).toHaveCount(0);

    // Clicking Record outcome fires the POST and shows the outcome card
    const postPromise = page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST');
    await page.locator('[data-testid="record-outcome"]').click();
    const req = await postPromise;
    expect(req.postData()).toBeTruthy();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
});

// ─── E5: notes included in POST body on outcome submission ───────────────────
test('E5: additionalNotes carried in the POST body when notes are entered', async ({ page }) => {
    const NOTE = 'E5 specific note text for verification';
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('fryer issue', { delay: 20 });
    await page.locator('#addnotes').fill(NOTE);
    await page.locator('[data-testid="other-capture"]').click();
    await expect(page.locator('[data-testid="confirm-step"]')).toBeVisible();

    const postPromise = page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST');
    await page.locator('[data-testid="record-outcome"]').click();
    const req = await postPromise;
    const body = JSON.parse(req.postData());
    expect(body.additionalNotes).toBe(NOTE);
});

// ─── E6: notes echo on outcome card (addnotes-echo) ──────────────────────────
test('E6: addnotes-echo element present when notes were entered', async ({ page }) => {
    const NOTE = 'E6 echo test note';
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('boiler issue', { delay: 20 });
    await page.locator('#addnotes').fill(NOTE);
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="record-outcome"]').click();

    const echo = page.locator('[data-testid="addnotes-echo"]');
    await expect(echo).toBeVisible();
    await expect(echo).toContainText(NOTE);
});

// ─── E7: no echo when no notes entered ───────────────────────────────────────
test('E7: no addnotes-echo when notes field left empty', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('no notes test', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
    await expect(page.locator('[data-testid="addnotes-echo"]')).toHaveCount(0);
});

// ─── E8: null sent in POST when notes field empty ─────────────────────────────
test('E8: additionalNotes is null in POST when field is empty', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('null notes test', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();
    const postPromise = page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST');
    await page.locator('[data-testid="record-outcome"]').click();
    const req = await postPromise;
    const body = JSON.parse(req.postData());
    expect(body.additionalNotes).toBeNull();
});

// ─── E9: post-submit notes box shows after outcome ───────────────────────────
test('E9: post-submit notes link/box rendered after outcome captured', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('e9 post-submit', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
    // Post-submit notes box (or its link) must appear after the outcome
    const postBox = page.locator('[data-testid="addnotes-post-open"]');
    await expect(postBox).toBeVisible();
});

// ─── E10: post-submit notes fires /api/tickets/:id/notes ─────────────────────
test('E10: post-submit notes box fires POST /api/tickets/:id/notes', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('e10 test', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();

    // Open the post-submit notes box and submit a note
    await page.locator('[data-testid="addnotes-post-open"]').click();
    const noteInput = page.locator('[data-testid="addnotes-post-input"]');
    await expect(noteInput).toBeVisible();
    await noteInput.fill('E10 late note added after submission');

    const notesPostPromise = page.waitForRequest(r =>
        r.url().includes('/api/tickets/') && r.url().includes('/notes') && r.method() === 'POST');
    await page.locator('[data-testid="addnotes-post-save"]').click();
    const req = await notesPostPromise;
    const body = JSON.parse(req.postData());
    expect(body.kind).toBe('additional-notes');
    expect(body.body).toContain('E10 late note added after submission');
});

// ─── E11: notes cleared on cancelFlow ───────────────────────────────────────
test('E11: draft cleared when flow is cancelled', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('#addnotes').fill('E11 should be cleared');
    await page.waitForTimeout(700); // let debounce flush

    // Cancel the flow
    page.once('dialog', d => d.accept()); // Cancel issue triggers confirm dialog
    await page.locator('button:has-text("Cancel issue")').click();

    // Start a new flow — draft should not be restored
    await page.locator('[data-testid="tile-other"]').click();
    const notes = page.locator('#addnotes');
    await expect(notes).toBeVisible();
    const val = await notes.inputValue();
    expect(val).toBe('');
});

// ─── E12: notes cleared after anotherIssue ───────────────────────────────────
test('E12: draft cleared after "Add another issue"', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('first issue', { delay: 20 });
    await page.locator('#addnotes').fill('E12 note that should be gone after another issue');
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();

    // Click "Add another issue"
    await page.locator('[data-testid="add-another-issue"]').click();

    // Start a new flow — draft must be empty
    await page.locator('[data-testid="tile-other"]').click();
    const val = await page.locator('#addnotes').inputValue();
    expect(val).toBe('');
});

// ─── E13: notes on ambiguous site capture ────────────────────────────────────
// Uses house ID 6758 — the known ambiguous fixture (two sites: Bowers and Bowman).
test('E13: notes carried into POST for ambiguous site capture', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await page.locator('[data-testid="site-search"]').pressSequentially('6758', { delay: 40 });
    await expect(page.locator('.ri .tag:has-text("duplicate ID")').first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const ambCard = page.locator('[data-testid="ambiguous-card"]');
    await expect(ambCard).toBeVisible();
    await expect(ambCard).toContainText('House ID 6758 is ambiguous');
    const noteField = page.locator('#addnotes-amb');
    await expect(noteField).toBeVisible();
    const NOTE = 'E13 ambiguous note';
    await noteField.fill(NOTE);
    const postPromise = page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST');
    await page.locator('[data-testid="ambiguous-capture"]').click();
    const req = await postPromise;
    const body = JSON.parse(req.postData());
    expect(body.additionalNotes).toBe(NOTE);
});

// ─── E14: notes on query ────────────────────────────────────────────────────
// Navigates to the Tonight view where raise-query lives.
test('E14: notes carried into POST /api/query when query submitted', async ({ page }) => {
    await signIn(page, 'Test Handler');
    // Tonight view hosts the raise-query button
    await page.locator('[data-testid="nav-tonight"]').click();
    await expect(page.locator('[data-testid="raise-query"]')).toBeVisible();
    const NOTE = 'E14 query note';
    await page.locator('[data-testid="raise-query"]').click();
    const modal = page.locator('[data-testid="query-modal"]');
    await expect(modal).toBeVisible();
    // Fill query text in the first textarea (query-text)
    await page.locator('[data-testid="query-text"]').fill('E14 query text');
    // Fill the additional-notes field inside the modal
    const noteField = page.locator('#addnotes-q');
    await expect(noteField).toBeVisible();
    await noteField.fill(NOTE);
    const postPromise = page.waitForRequest(r => r.url().includes('/api/query') && r.method() === 'POST');
    await page.locator('[data-testid="query-send"]').click();
    const req = await postPromise;
    const body = JSON.parse(req.postData());
    expect(body.additionalNotes).toBe(NOTE);
});

// ─── E15: whitespace-only notes sends null ───────────────────────────────────
test('E15: whitespace-only notes sends null in POST (not empty string)', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('whitespace notes test', { delay: 20 });
    await page.locator('#addnotes').fill('   ');
    await page.locator('[data-testid="other-capture"]').click();
    const postPromise = page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST');
    await page.locator('[data-testid="record-outcome"]').click();
    const req = await postPromise;
    const body = JSON.parse(req.postData());
    // DF-01 fix: client trims before sending; whitespace-only must arrive as null, not '   ' or ''.
    expect(body.additionalNotes).toBeNull();
});

// ─── E16: notes on lighting P1 escalation ────────────────────────────────────
test('E16: notes carried in POST for lighting P1 escalation', async ({ page }) => {
    const NOTE = 'E16 P1 escalation note';
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6749', 'Angel Inn');
    await page.locator('[data-testid="tile-lighting"]').click();
    // The notes field should be visible before the P1 chip
    const notes = page.locator('#addnotes');
    await expect(notes).toBeVisible();
    await notes.fill(NOTE);
    const postPromise = page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST');
    await page.locator('.chip:has-text("Still not working")').click();
    await page.locator('[data-testid="record-outcome"]').click();
    const req = await postPromise;
    const body = JSON.parse(req.postData());
    expect(body.additionalNotes).toBe(NOTE);
    expect(body.type).toBe('escalate-p1');
    // Negative: note must NOT appear in the P1 SMS summary payload sent to escalateP1.
    // p1Summary is what escalateP1 uses as the pager message body.
    expect(body.p1Summary ?? '').not.toContain(NOTE);
    expect(body.subject ?? '').not.toContain(NOTE);
});

// ─── E17: P1 wording — helper text and echo on a P1 outcome ─────────────────
test('E17: P1 wording — helper text includes P1 notice and echo shows morning-review wording', async ({ page }) => {
    const NOTE = 'E17 P1 wording note';
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6749', 'Angel Inn');
    await page.locator('[data-testid="tile-lighting"]').click();

    // Helper text must mention the P1/urgent-text exclusion (visible on any flow)
    const helperText = page.locator('.notes-group .small').first();
    await expect(helperText).toContainText('Not sent in urgent P1 texts');

    await page.locator('#addnotes').fill(NOTE);
    await page.locator('.chip:has-text("Still not working")').click();
    await page.locator('[data-testid="record-outcome"]').click();
    // P1 outcomes render outcome-p1 card (not outcome-captured)
    await expect(page.locator('[data-testid="outcome-p1"]')).toBeVisible({ timeout: 8000 });

    // P1 echo: morning-review wording with "not in the urgent text"
    const echo = page.locator('[data-testid="addnotes-echo"]');
    await expect(echo).toBeVisible();
    await expect(echo).toContainText(NOTE);
    await expect(echo).toContainText('for the morning review');
    await expect(echo).toContainText('not in the urgent text');
});

// ─── E18: notes autosave restored after page reload ──────────────────────────
test('E18: notes draft restored from sessionStorage after page reload', async ({ page }) => {
    const NOTE = 'E18 reload persistence note';
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('#addnotes').fill(NOTE);
    await page.waitForTimeout(700); // debounce flush

    // Reload — sessionStorage persists within the same browser tab session.
    // Server-side site confirmation is in-memory; re-confirm to reach the workspace.
    await page.reload();
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    const notes = page.locator('#addnotes');
    await expect(notes).toBeVisible();
    const val = await notes.inputValue();
    expect(val).toBe(NOTE);
});

// ─── E19: confirm step shows subject above notes field ───────────────────────
test('E19: confirm step shows outcome subject and Record outcome button', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('confirm step ui test', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();

    const confirm = page.locator('[data-testid="confirm-step"]');
    await expect(confirm).toBeVisible();
    // Subject/description must be visible in the confirm step
    await expect(confirm).toContainText(/Other issue|confirm step ui test|Something else/i);
    // Record outcome button is the sole submit action
    await expect(page.locator('[data-testid="record-outcome"]')).toBeVisible();
    // Notes field still live during confirm step
    await expect(page.locator('#addnotes')).toBeVisible();
});

// ─── E20: double-fire guard — clicking Record outcome twice does not double POST ─
test('E20: double-click on Record outcome does not fire two POSTs', async ({ page }) => {
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('double fire guard', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();
    await expect(page.locator('[data-testid="confirm-step"]')).toBeVisible();

    let postCount = 0;
    page.on('request', req => {
        if (req.url().includes('/api/outcomes') && req.method() === 'POST') postCount++;
    });

    // Double-click the Record outcome button rapidly
    const btn = page.locator('[data-testid="record-outcome"]');
    await btn.click();
    // Second click: short timeout so the test does not hang if the button was removed by the first click.
    await btn.click({ timeout: 2000 }).catch(() => {});

    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible();
    expect(postCount).toBe(1);
});

// ─── E21: notes on capture-flow (outside lighting override) ──────────────────
test('E21: notes carried in POST for a capture outcome (lighting override)', async ({ page }) => {
    const NOTE = 'E21 capture outcome note';
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6749', 'Angel Inn');
    await page.locator('[data-testid="tile-lighting"]').click();
    await page.locator('#addnotes').fill(NOTE);
    const postPromise = page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST');
    await page.locator('.chip:has-text("Caller sorted it with the override")').click();
    await page.locator('[data-testid="record-outcome"]').click();
    const req = await postPromise;
    const body = JSON.parse(req.postData());
    expect(body.additionalNotes).toBe(NOTE);
    expect(body.type).toBe('capture');
});

// ─── E22: post-submit failure preserves typed text in textarea ───────────────
test('E22: post-submit save failure keeps typed text in the box for retry', async ({ page }) => {
    const NOTE = 'E22 failure keep text note';
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('e22 test', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible({ timeout: 8000 });

    // Open the post-submit notes box and type text
    await page.locator('[data-testid="addnotes-post-open"]').click();
    const noteInput = page.locator('[data-testid="addnotes-post-input"]');
    await expect(noteInput).toBeVisible();
    await noteInput.fill(NOTE);

    // Intercept the notes POST and make it fail (network error)
    await page.route('**/api/tickets/*/notes', route => route.abort('failed'));

    await page.locator('[data-testid="addnotes-post-save"]').click();

    // Error state: textarea must still be present and contain the typed text
    await expect(page.locator('[data-testid="addnotes-post-error"]')).toBeVisible({ timeout: 6000 });
    const textareaAfterError = page.locator('[data-testid="addnotes-post-error"] [data-testid="addnotes-post-input"]');
    await expect(textareaAfterError).toBeVisible();
    await expect(textareaAfterError).toHaveValue(NOTE);

    // Unintercept so retry can succeed
    await page.unroute('**/api/tickets/*/notes');
});

// ─── E23: XSS — notes payload is escaped at every DOM sink ───────────────────
test('E23: XSS payload in notes field is escaped — no element or script created at any DOM sink', async ({ page }) => {
    // Two canonical XSS probes: tag injection and textarea breakout.
    const XSS_IMG = '<img src=x onerror=alert(1)>';
    const XSS_TA  = '</textarea><script>window.__xss=1<\/script>';
    const XSS = XSS_IMG + XSS_TA;

    let alertFired = false;
    page.on('dialog', d => { alertFired = true; d.dismiss(); });

    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('xss probe', { delay: 20 });

    // Sink 1: FLOW-BOX textarea — direct user input (safe by definition; textarea does not parse HTML)
    await page.locator('#addnotes').fill(XSS);

    // Sink 2: confirm-step echo (payload.subject — not additionalNotes, but verify no bleed-through)
    await page.locator('[data-testid="other-capture"]').click();
    await expect(page.locator('[data-testid="confirm-step"]')).toBeVisible();

    // Proceed to outcome
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible({ timeout: 8000 });

    // No alert dialog (onerror / script) must have fired by now
    expect(alertFired).toBe(false);

    // window.__xss must not have been set (textarea-breakout script did not run)
    const xssRan = await page.evaluate(() => window.__xss === 1);
    expect(xssRan).toBe(false);

    // Sink 3: addnotes-echo div — esc() wraps additionalNotes; no img[onerror] in DOM
    const echo = page.locator('[data-testid="addnotes-echo"]');
    await expect(echo).toBeVisible();
    // The literal '<img' text must appear as plain text (escaped), not as an element
    await expect(echo).toContainText('<img');
    const imgCount = await page.evaluate(() => document.querySelectorAll('img[onerror]').length);
    expect(imgCount).toBe(0);

    // Sink 4: post-submit textarea in saving state — open box, fill XSS, intercept + abort the POST
    await page.locator('[data-testid="addnotes-post-open"]').click();
    await page.locator('[data-testid="addnotes-post-input"]').fill(XSS);
    await page.route('**/api/tickets/*/notes', route => route.abort('failed'));
    await page.locator('[data-testid="addnotes-post-save"]').click();

    // Error state: textarea must show XSS as raw text value, not parsed HTML
    await expect(page.locator('[data-testid="addnotes-post-error"]')).toBeVisible({ timeout: 6000 });
    const errInput = page.locator('[data-testid="addnotes-post-error"] [data-testid="addnotes-post-input"]');
    await expect(errInput).toHaveValue(XSS); // .value is raw text, confirms esc() worked
    const imgAfterError = await page.evaluate(() => document.querySelectorAll('img[onerror]').length);
    expect(imgAfterError).toBe(0);
    expect(alertFired).toBe(false); // still no alert

    await page.unroute('**/api/tickets/*/notes');
});

// ─── E24: second note within 60 s on same ticket gets fresh token (not dropped) ─

test('E24: two different notes saved sequentially on the same ticket — both written (fresh token per save)', async ({ page }) => {
    // E24 verifies that clearing _postNotesToken on success means a second,
    // distinct note within the server 60-second dedup window is NOT dropped.
    const NOTE_A = 'First additional note E24A';
    const NOTE_B = 'Second additional note E24B — should not be deduplicated';

    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');

    // Complete the flow so the post-submit box is available.
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('e24 idempotency test', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('[data-testid="addnotes-post-open"]')).toBeVisible({ timeout: 4000 });

    const tokens = [];
    await page.route('**/api/tickets/*/notes', async route => {
        let body = {};
        try { body = route.request().postDataJSON() ?? {}; } catch { /* ignore */ }
        if (body.idempotencyKey) tokens.push(body.idempotencyKey);
        await route.continue();
    });

    // Save note A.
    await page.locator('[data-testid="addnotes-post-open"]').click();
    await page.locator('[data-testid="addnotes-post-input"]').fill(NOTE_A);
    await page.locator('[data-testid="addnotes-post-save"]').click();
    await expect(page.locator('[data-testid="addnotes-post-saved"]')).toBeVisible({ timeout: 6000 });

    // Click "Add another note" to reset the box with a fresh state.
    await page.locator('[data-testid="addnotes-post-another"]').click();
    await expect(page.locator('[data-testid="addnotes-post-open"]')).toBeVisible({ timeout: 3000 });

    // Save note B (within 60 s of note A — same ticket).
    await page.locator('[data-testid="addnotes-post-input"]').fill(NOTE_B);
    await page.locator('[data-testid="addnotes-post-save"]').click();
    await expect(page.locator('[data-testid="addnotes-post-saved"]')).toBeVisible({ timeout: 6000 });

    // Both POSTs must have fired with DIFFERENT idempotency tokens.
    expect(tokens.length).toBe(2);
    expect(tokens[0]).not.toBe(tokens[1]);

    await page.unroute('**/api/tickets/*/notes');
});

// ─── E25: server 500 on first save → Try again succeeds → note written once ──

test('E25: server 500 on first save does not deduplicate the retry — note is written exactly once', async ({ page }) => {
    const NOTE = 'E25 retry after 500 note';
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');

    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('e25 retry test', { delay: 20 });
    await page.locator('[data-testid="other-capture"]').click();
    await page.locator('[data-testid="record-outcome"]').click();
    await expect(page.locator('[data-testid="outcome-captured"]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('[data-testid="addnotes-post-open"]')).toBeVisible({ timeout: 4000 });

    // Count how many times the route is actually called.
    let callCount = 0;
    let firstDone = false;
    await page.route('**/api/tickets/*/notes', async route => {
        callCount++;
        if (!firstDone) {
            firstDone = true;
            // Return 500 on first attempt.
            await route.fulfill({ status: 500, body: JSON.stringify({ error: 'simulated server error' }), contentType: 'application/json' });
        } else {
            await route.continue();
        }
    });

    await page.locator('[data-testid="addnotes-post-open"]').click();
    await page.locator('[data-testid="addnotes-post-input"]').fill(NOTE);
    await page.locator('[data-testid="addnotes-post-save"]').click();

    // First attempt → error state shown (server returned 500).
    await expect(page.locator('[data-testid="addnotes-post-error"]')).toBeVisible({ timeout: 6000 });

    // Retry — same token — server must NOT deduplicate (token was never committed).
    await page.locator('[data-testid="addnotes-post-save"]').click();

    // Retry succeeds → saved state.
    await expect(page.locator('[data-testid="addnotes-post-saved"]')).toBeVisible({ timeout: 6000 });

    // Route was called exactly twice (first fail + one retry).
    expect(callCount).toBe(2);

    await page.unroute('**/api/tickets/*/notes');
});

// ─── E26: whitespace-only notes → null in POST, no addnotes-echo rendered (DF-01) ──
test('E26: whitespace-only notes sends null (DF-01 trim fix) and no echo is shown', async ({ page }) => {
    // DF-01: '   ' was truthy — passed to server and rendered an empty echo div.
    // After the fix, the client trims before testing; whitespace-only → null in POST, no echo.
    await signIn(page, 'Test Handler');
    await confirmSite(page, '6832', 'Old Grey Mare');
    await page.locator('[data-testid="tile-other"]').click();
    await page.locator('[data-testid="other-text"]').pressSequentially('DF-01 whitespace test', { delay: 20 });
    await page.locator('#addnotes').fill('   ');
    await page.locator('[data-testid="other-capture"]').click();
    const postPromise = page.waitForRequest(r => r.url().includes('/api/outcomes') && r.method() === 'POST');
    await page.locator('[data-testid="record-outcome"]').click();
    const req = await postPromise;
    const body = JSON.parse(req.postData());
    // Client must send null (not '   ')
    expect(body.additionalNotes).toBeNull();
    // No echo element in the outcome confirmation
    await expect(page.locator('[data-testid="addnotes-echo"]')).toHaveCount(0);
});
