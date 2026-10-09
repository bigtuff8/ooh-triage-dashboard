# OOHDASH-117 F4a — Active P1 Escalation Banner: Design

**Feature:** Surface active P1 escalation banner in the site workspace, above the issue picker, before the operator begins triage.
**Safety driver:** Shire Horse incident — agent triaged without knowing an ambulance had been called. This banner is a safety-critical pre-triage signal, not a convenience.
**Governing principle:** Triage-question-led, outcome-oriented. The banner is not a device-data readout; it is a contextual warning that changes what the operator should do next.

---

## Summary

When a site workspace loads, the backend filters the already-fetched Zendesk tickets for any that carry the `ooh_p1` tag, are not closed/solved, and were updated within the last 24 hours. That filtered list — `activeP1Tickets` — is added to the workspace payload alongside the existing `tickets` array. No second Zendesk call is made. On the frontend, `renderWorkspace()` checks `ws.activeP1Tickets.length` before rendering the issue picker and, if non-zero, inserts a red contextual banner reading "Active P1 escalation on record for this site — review before advising" with a link to the ticket. The banner is positioned above the issue picker and below the existing offline/degraded banners so it is the first thing an operator reads when the workspace appears.

---

## Cost / token efficiency

This change makes no LLM calls and adds no Zendesk API calls. All computation is a filter over an in-memory JavaScript array (the tickets already fetched). Runtime cost: negligible. No polling, no background process, no recurring work. Fully idle when no workspace is open.

---

## Backend changes

**File:** `routes/api.js`

### Change 1 — add `activeP1Tickets` derivation and include it in the payload (lines 146–167)

The `workspacePayload` function already calls `zendesk.ticketsForSite()` and assigns the result to `tickets` (line 148). After that call, derive `activeP1Tickets` by filtering `tickets` in place. The filtered result goes into the returned object alongside `tickets`.

**Exact location:** lines 146–167 (`workspacePayload` function body).

**Before (lines 147–165, relevant excerpt):**

```js
async function workspacePayload(site) {
    let tickets = [];
    try { tickets = await zendesk.ticketsForSite(site.siteNo); }
    catch (err) { console.error(`[API] Site tickets unavailable: ${err.message}`); }
    return {
        ...
        tickets,
        degraded: !bridge.bridgeStatus().healthy
    };
}
```

**After:**

```js
async function workspacePayload(site) {
    let tickets = [];
    try { tickets = await zendesk.ticketsForSite(site.siteNo); }
    catch (err) { console.error(`[API] Site tickets unavailable: ${err.message}`); }

    const P1_WINDOW_MS = 24 * 60 * 60 * 1000;
    const activeP1Tickets = tickets.filter(t =>
        Array.isArray(t.tags) &&
        t.tags.includes('ooh_p1') &&
        !['solved', 'closed'].includes(t.status?.raw ?? t.status) &&
        t.updatedAt &&
        (Date.now() - new Date(t.updatedAt).getTime()) < P1_WINDOW_MS
    );

    return {
        ...
        tickets,
        activeP1Tickets,
        degraded: !bridge.bridgeStatus().healthy
    };
}
```

**Fail-open:** The `try/catch` at line 148–149 already guards the Zendesk call. If it throws, `tickets` stays `[]`, so `activeP1Tickets` will also be `[]`. No extra error handling needed. The operator sees no banner and is unblocked. This is the correct fail-open behaviour — a Zendesk outage must never prevent triage.

### Change 2 — expose `tags` and raw `updatedAt` on enriched tickets in `zendesk.js`

**File:** `services/zendesk.js`
**Exact location:** lines 521–534 — the `enriched` object literal inside the `callbackLookup` for-loop.

The `enriched` object currently omits the raw `tags` array and the raw `updated_at` timestamp (it only carries `updatedFriendly`, a human string). Without `tags`, the filter in Change 1 cannot work.

**Before (lines 521–534, relevant excerpt):**

```js
const enriched = {
    id: t.id,
    subject: t.subject,
    status: { raw: t.status, name: statusInfo.name, agent: statusInfo.agent, caller: statusInfo.caller },
    createdFriendly: friendlyTimeElapsed(t.created_at),
    updatedFriendly: friendlyTimeElapsed(t.updated_at),
    visit,
    script: ...,
    timeline: ...
};
```

**After (add two fields):**

```js
const enriched = {
    id: t.id,
    subject: t.subject,
    status: { raw: t.status, name: statusInfo.name, agent: statusInfo.agent, caller: statusInfo.caller },
    tags: Array.isArray(t.tags) ? t.tags : [],
    updatedAt: t.updated_at ?? null,
    createdFriendly: friendlyTimeElapsed(t.created_at),
    updatedFriendly: friendlyTimeElapsed(t.updated_at),
    visit,
    script: ...,
    timeline: ...
};
```

`tags` is a safe addition — downstream consumers (`siteTickets()` in views.js) iterate the enriched object's known fields and ignore extras. `updatedAt` is the raw ISO string; it is named differently from the existing `updated_at` on the raw Zendesk object to make the enriched contract clear.

### Zendesk URL construction

The `activeP1Tickets` filter runs over `tickets.recent.slice(0, 4)`, which is the result of `ticketsForSite`. Each enriched ticket has `id` (integer). The frontend constructs the Zendesk agent URL itself using `t.id`:

```
https://theairedalegroup.zendesk.com/agent/tickets/${t.id}
```

The subdomain is available on the frontend only if it is already embedded in the page or passed in the workspace payload. Rather than adding config to the payload, the backend should include a `zendeskUrl` field on each `activeP1Ticket` entry, generated at enrichment time.

**Revised approach — add `zendeskUrl` to enriched ticket in `zendesk.js`:**

```js
const enriched = {
    id: t.id,
    ...
    tags: Array.isArray(t.tags) ? t.tags : [],
    updatedAt: t.updated_at ?? null,
    zendeskUrl: live()
        ? `https://${config.zendesk.subdomain}.zendesk.com/agent/tickets/${t.id}`
        : `#fixture-ticket-${t.id}`,
    ...
};
```

This matches the URL pattern used by `createOutcomeTicket` at `zendesk.js:308` and the fixture fallback at `zendesk.js:290`. The frontend uses `t.zendeskUrl` directly with no subdomain knowledge required.

---

## Frontend changes

**File:** `public/js/views.js`

### Change 3 — render the P1 banner in `renderWorkspace()` (lines 166–195)

The banner must appear above the issue picker but below the offline and degraded banners. The offline and degraded banners live inside `flowHtml` (the ternary at line 169 assigns them when `!state.flow`). The P1 banner is rendered as a sibling before `flowHtml` is inserted, at the start of the left-hand column.

**Exact location:** inside `renderWorkspace()`, in the `$('#view').innerHTML = ...` template literal, immediately before `${flowHtml}` at line 186.

**Before (lines 179–187, relevant excerpt):**

```js
$('#view').innerHTML = `<div class="content"><div class="wsgrid">
  <div>
   <div class="card" style="...">
    ...
   </div>
   ${flowHtml}
  </div>
  ...
```

**After — insert the banner between the site header card and `flowHtml`:**

```js
$('#view').innerHTML = `<div class="content"><div class="wsgrid">
  <div>
   <div class="card" style="...">
    ...
   </div>
   ${renderP1Banner(ws)}
   ${flowHtml}
  </div>
  ...
```

**New helper function — `renderP1Banner(ws)`:**

Insert this function alongside the other helpers in `views.js` (after `callSoFar()` at line 197 is a natural location):

```js
function renderP1Banner(ws) {
    const tickets = ws.activeP1Tickets;
    if (!tickets || tickets.length === 0) return '';
    const first = tickets[0];
    const linkHtml = first.zendeskUrl
        ? ` <a href="${esc(first.zendeskUrl)}" target="_blank" rel="noopener" style="color:inherit;font-weight:600;text-decoration:underline">View ticket #${esc(String(first.id))}</a>`
        : '';
    return `<div class="alert err p1-banner" data-testid="p1-escalation-banner" style="display:flex;align-items:flex-start;gap:10px;margin:0 0 10px">
  <span style="font-size:1.2em;flex-shrink:0">🚨</span>
  <div><b>Active P1 escalation on record for this site — review before advising.</b>${linkHtml}${tickets.length > 1 ? ` <span class="small">(${tickets.length} active P1 tickets)</span>` : ''}</div>
</div>`;
}
```

**HTML structure of banner:**

```html
<div
  class="alert err p1-banner"
  data-testid="p1-escalation-banner"
  style="display:flex;align-items:flex-start;gap:10px;margin:0 0 10px"
>
  <span style="font-size:1.2em;flex-shrink:0">🚨</span>
  <div>
    <b>Active P1 escalation on record for this site — review before advising.</b>
    <a href="https://theairedalegroup.zendesk.com/agent/tickets/45XXX"
       target="_blank" rel="noopener"
       style="color:inherit;font-weight:600;text-decoration:underline">
      View ticket #45XXX
    </a>
    <!-- when tickets.length > 1: -->
    <span class="small">(2 active P1 tickets)</span>
  </div>
</div>
```

**Styling rationale:** The `alert err` classes are already used by the offline banner (`data-testid="offline-banner"`) at line 170. Reusing them keeps the visual language consistent — red background, red border — and costs no new CSS. The `p1-banner` extra class is for test selection specificity and any future targeted styling.

**Positioning:** The banner sits above `flowHtml`. When a flow is in progress (`state.flow` is truthy), the offline and degraded banners are hidden (they are inside the `!state.flow` conditional in `flowHtml`). The P1 banner renders independently of flow state — it stays visible throughout the triage session, not only on the initial screen. This is deliberate: if an operator starts a flow without reading the banner, it remains visible as a persistent reminder.

---

## Test spec

**File:** `tests/resolution.spec.js`

This is the correct home — it already owns workspace-rendering assertions (the `confirmSite` helper, `category-tiles` and `scope-list` visibility, site header content). The P1 banner is a workspace-load concern, not a control or flow concern.

### Prerequisite: fixture seeding API for P1 tickets

The test suite runs in fixture mode. To exercise the banner, a test needs to seed a P1 ticket against site `6832` (Old Grey Mare). No such seeding API currently exists for the base ticket store. The design requires a new fixture-mode-only endpoint and export, following the same pattern as the call-ticket seeding API at `routes/api.js:383` and `services/zendesk.js:579`.

**`services/zendesk.js` — new export (add after `resetFixtureCallTickets` at line 597):**

```js
/**
 * FIXTURE ONLY — seeds a ticket into the base fixture store.
 * Accepts all raw Zendesk ticket fields. Appends to fixtureTickets.
 * Returns the seeded ticket. No-op in live mode.
 */
export function seedFixtureTicket(ticket) {
    if (live()) return null;
    fixtureTickets.push({ ...ticket, id: ticket.id ?? ++fixtureSeq });
    return fixtureTickets[fixtureTickets.length - 1];
}

/**
 * FIXTURE ONLY — removes tickets added by seedFixtureTicket (those with id > initial set).
 * Call in afterEach to prevent cross-test contamination.
 */
export function resetSeededFixtureTickets() {
    if (live()) return;
    // The initial fixture set ends at id 45115. Remove anything seeded above that.
    const seededIds = new Set(fixtureTickets.filter(t => t.id > 45115).map(t => t.id));
    fixtureTickets.splice(0, fixtureTickets.length, ...fixtureTickets.filter(t => !seededIds.has(t.id)));
}
```

**`routes/api.js` — new fixture-only routes (add inside the `config.dataMode !== 'live'` block at line 382):**

```js
router.post('/test/tickets', wrap(async (req, res) => {
    res.json({ ticket: zendesk.seedFixtureTicket(req.body || {}) });
}));
router.post('/test/tickets/reset', wrap(async (req, res) => {
    zendesk.resetSeededFixtureTickets();
    res.json({ ok: true });
}));
```

### Test cases — add to `test.describe('F004 resolution', ...)` in `resolution.spec.js`

**Test 1: banner visible when site has an active P1 ticket updated within 24 hours**

```
test name: 'workspace shows P1 escalation banner when an active ooh_p1 ticket exists for the site'

setup:
  - signIn(page, 'Test Handler')
  - POST /api/test/tickets with body:
      {
        id: 49001,
        siteNo: '6832',
        subject: 'Gas boiler — no heating, ambulance called',
        status: 'open',
        custom_status_id: 25999053444508,
        priority: 'urgent',
        created_at: <ISO timestamp 2 hours ago>,
        updated_at: <ISO timestamp 30 minutes ago>,
        tags: ['ooh', 'ooh_p1'],
        visit: false,
        comments: []
      }

steps:
  - confirmSite(page, '6832', 'Old Grey Mare')

assertions:
  - await expect(page.locator('[data-testid="p1-escalation-banner"]')).toBeVisible()
  - await expect(page.locator('[data-testid="p1-escalation-banner"]')).toContainText('Active P1 escalation on record for this site')
  - await expect(page.locator('[data-testid="p1-escalation-banner"]')).toContainText('review before advising')
  - await expect(page.locator('[data-testid="p1-escalation-banner"] a')).toContainText('View ticket #49001')
  - await expect(page.locator('[data-testid="category-tiles"]')).toBeVisible()   // workspace still loads

teardown (afterEach):
  - POST /api/test/tickets/reset
```

**Test 2: no banner when site has no ooh_p1 tickets**

```
test name: 'workspace shows no P1 banner when site has no ooh_p1 tickets'

setup:
  - signIn(page, 'Test Handler')
  - (no ticket seeding — site 6832 has no ooh_p1 tickets in the base fixture set)

steps:
  - confirmSite(page, '6832', 'Old Grey Mare')

assertions:
  - await expect(page.locator('[data-testid="p1-escalation-banner"]')).toHaveCount(0)
  - await expect(page.locator('[data-testid="category-tiles"]')).toBeVisible()
```

**Test 3: no banner when ooh_p1 ticket exists but is older than 24 hours (stale guard)**

```
test name: 'workspace shows no P1 banner for a stale ooh_p1 ticket (updated >24h ago)'

setup:
  - signIn(page, 'Test Handler')
  - POST /api/test/tickets with body:
      {
        id: 49002,
        siteNo: '6832',
        subject: 'Stale escalation — now resolved via site visit',
        status: 'open',
        custom_status_id: 25999053444508,
        priority: 'urgent',
        created_at: <ISO timestamp 3 days ago>,
        updated_at: <ISO timestamp 25 hours ago>,
        tags: ['ooh', 'ooh_p1'],
        visit: true,
        comments: []
      }

steps:
  - confirmSite(page, '6832', 'Old Grey Mare')

assertions:
  - await expect(page.locator('[data-testid="p1-escalation-banner"]')).toHaveCount(0)
  - await expect(page.locator('[data-testid="category-tiles"]')).toBeVisible()

teardown (afterEach):
  - POST /api/test/tickets/reset
```

---

## Edge cases and risks

**1. The 24-hour staleness window is a heuristic, not a hard rule.**
A P1 ticket that is genuinely still open but has not been updated in 25 hours will be silently suppressed. The window is a pragmatic defence against the common case of a carried-over closed incident from a previous shift polluting the next agent's workspace. If the Shire Horse scenario recurs, the on-duty IoT team would normally update the Zendesk ticket, resetting the clock. The window is configurable at the code constant `P1_WINDOW_MS` and can be widened or removed if operations find too many false negatives.

**2. The `status.raw` normalisation.**
The enriched ticket wraps `status` as an object `{ raw, name, agent, caller }`. The filter in Change 1 reads `t.status?.raw ?? t.status` to handle both the enriched shape (from `ticketsForSite`) and any future shape changes. If `status` is ever simplified back to a plain string, the filter still works.

**3. Multiple active P1 tickets.**
The banner renders the link to the first ticket in the `activeP1Tickets` array and appends "(N active P1 tickets)" when `length > 1`. This is intentional: showing all links in the banner would be visually noisy, and the side panel's existing ticket list already shows all tickets. The operator is directed to act, not given a management view.

**4. Fixture URL for `zendeskUrl`.**
In fixture mode, `zendeskUrl` is `#fixture-ticket-<id>`, a local fragment. The Playwright assertion `[data-testid="p1-escalation-banner"] a` targets the anchor and checks its text content — it does not follow the link. This is correct: the link destination is a live Zendesk page not available in the test environment.

**5. Banner persistence during a flow.**
The banner is rendered outside `flowHtml`, so it stays visible when the operator clicks into a flow (heating, hot water, etc). This is deliberate and safety-correct: the operator must not be able to accidentally navigate the banner away. If this is judged too aggressive in UX review, an alternative is to render the banner only when `!state.flow` (inside the same conditional as the offline/degraded banners). This would be a design revision requiring a panel decision, not a build-time call.

**6. The `ticketsForSite` cap at 4 tickets.**
`ticketsForSite` returns `tickets.recent.slice(0, 4)` — the 4 most recently updated tickets across all statuses. In theory a site with 4 non-P1 recent tickets and a P1 ticket as the 5th most-recent update would silently miss the banner. This is an acceptable risk: a site with an active P1 will almost certainly have that ticket as one of its top 4 most-recently-updated entries (P1 tickets attract agent activity). If operations identify a case where this cap causes a miss, the fix is to increase the slice or add a separate targeted P1 query — both are Build decisions scoped to zendesk.js alone.

---

## Open questions

**OQ-1 — Banner dismissibility.**
Should the operator be able to dismiss the banner for the current session (a "I have read this" acknowledgement)? The current design keeps the banner permanently visible for the duration of the workspace session. Dismissibility would require a `state.p1BannerDismissed` flag and a close button. Recommend keeping it non-dismissible for the safety-critical launch; revisit based on operator feedback.

**OQ-2 — Flow-visibility scope.**
Confirmed as deliberate (see Edge Case 5 above) but requires James's sign-off: the banner stays visible during a triage flow. If operators find this distracting in practice, the fix is one-line (move banner render inside the `!state.flow` branch). This decision does not block Build.

**OQ-3 — `ooh_p1` tag filter and solved-but-not-closed tickets.**
The filter excludes `solved` and `closed`. Zendesk has a custom status layer (the `custom_status_id` field). A ticket can be `open` at raw Zendesk status but have a custom status that means "awaiting closure". The filter ignores custom status entirely and relies only on `status.raw`. If the IoT team's Zendesk workflow leaves P1 tickets in a custom "resolved pending sign-off" state with raw status `open`, those tickets will still trigger the banner. Recommend validating this against the live Zendesk status taxonomy with Sam Day before the Build gate.
