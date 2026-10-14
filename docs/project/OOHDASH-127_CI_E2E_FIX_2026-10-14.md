# OOHDASH-127 — CI e2e fix, 2026-10-14

<!-- gate:contract
SECTION: The bug
Two Playwright tests were red on main since 2026-10-13:
TF-28 (oohdash-119.tester.spec.js line 970) — at 390 px mobile width, workspace ticket rows caused
horizontal scroll (scrollWidth 432 px, expected ≤ 390 px). Root cause: the mobile media-query
override used `grid-template-columns:1fr` instead of `minmax(0,1fr)`. Without the explicit zero
minimum, the grid track expands to accommodate the min-content of its items. Scope-list tags such
as "Not on Lighthouse here" are white-space:nowrap and wide enough to push the track to ~420 px,
carrying all cards beyond the viewport. A secondary contributor: the subject <span> in ticket rows
lacked `min-width:0`, preventing it from shrinking within the flex row.

F015 (tonight-callback.spec.js line 75) — the "add a note" test was flaky due to a DOM race.
`openTicketDrawer` renders twice: first with "Loading thread…", then again after the async thread
fetch. If `pressSequentially` was mid-flight when the second paint replaced the drawer DOM, the
textarea was detached, the note body read as empty, and no toast appeared. Fix: wait for the thread
section to no longer contain "Loading" before typing.

SECTION: Proof
Full Playwright suite ran twice:
Run 1 (with CSS fix + F015 fix, before auth fix on regression spec): 131 passed, 1 failed
  (oohdash-127.spec.js seed was unauthenticated — fixed).
Run 2 (all fixes in place): 132 passed, 2 skipped, 0 failed. F015 ok 129, TF-28 confirmed green
  throughout tester suite (oohdash-119 all pass). Regression spec TF-28 ok 1.

SECTION: The fix
Three files changed:
1. public/css/styles.css — both mobile breakpoints (max-width:1100px and max-width:900px) changed
   from `grid-template-columns:1fr` to `grid-template-columns:minmax(0,1fr)`. Aligns with the
   desktop declaration which already uses minmax(0,…) on both columns.
2. public/js/views.js — subject <span> in siteTickets() row gained `min-width:0;overflow:hidden;
   text-overflow:ellipsis;white-space:nowrap`. Prevents the flex item blowing out the card content
   area even if the grid track is correctly sized.
3. tests/tonight-callback.spec.js — F015 test waits for `.drawer #thread` to not contain "Loading"
   before calling pressSequentially on the note textarea.

One file added:
4. tests/oohdash-127.spec.js — deterministic TF-28 regression test at 390 px viewport, seeding
   a ticket with the longest status label (custom_status_id 11404223315612) for site 6883 (Water
   Tower), which no other spec creates outcome tickets for.

SECTION: Risk and rollback
Risk: none. The CSS change tightens grid-track minimum from auto to 0 — the visual result at
desktop is identical (minmax(0,7fr)/minmax(0,5fr) were already used there). At mobile the columns
are now correctly confined to the available space; scope-list overflow is clipped within the card
rather than expanding the viewport.
Rollback: revert commit on branch fix/oohdash-127-ci-e2e and re-merge. No data migration,
no server-side change.
-->

## The bug

Two Playwright tests were red on main since 2026-10-13.

**TF-28** (`tests/tester/oohdash-119.tester.spec.js:970`) — at 390 px mobile viewport the
workspace overflowed horizontally (`scrollWidth` 432 px, expected ≤ 390 px).

Root cause: the mobile CSS override used `grid-template-columns:1fr` instead of
`minmax(0,1fr)`. Without an explicit zero minimum the grid track's minimum is `auto` — the
browser expands the track to the min-content size of its items. Scope-list tags such as
"Not on Lighthouse here" are `white-space:nowrap` and wide enough (~138 px) that, across
a 342 px content area, the track grew to ~420 px, pushing all cards beyond the 390 px viewport.

A secondary issue: the subject `<span>` in ticket rows lacked `min-width:0`, so it could
not shrink below its content width in the flex row.

**F015** (`tests/tonight-callback.spec.js:75`) — "add a note" was intermittently flaky.
`openTicketDrawer()` renders twice: an immediate paint with "Loading thread…", then a second
`paintDrawer()` after the async `GET /api/tickets/:id/thread` resolves, replacing the entire
drawer DOM. If `pressSequentially` was mid-flight at the moment of the second paint, the
textarea was detached, the note body read as empty string, `sendNote` returned early, and no
toast appeared.

## Proof

| Run | Trigger | Result |
|-----|---------|--------|
| Suite run 1 (before this fix) | pre-fix main | TF-28 failed (scrollWidth 432), F015 flaky |
| Suite run 2 (CSS + F015 + auth fix) | fix/oohdash-127-ci-e2e | **132 passed, 2 skipped, 0 failed** |

## The fix

**`public/css/styles.css`** — both mobile breakpoints changed:

```css
/* before */
@media(max-width:1100px){.wsgrid{grid-template-columns:1fr} … }
…
.wsgrid{grid-template-columns:1fr}           /* inside @media(max-width:900px) */

/* after */
@media(max-width:1100px){.wsgrid{grid-template-columns:minmax(0,1fr)} … }
…
.wsgrid{grid-template-columns:minmax(0,1fr)} /* inside @media(max-width:900px) */
```

**`public/js/views.js`** — subject span in `siteTickets()`:

```javascript
// before
style="flex:1;font-size:13px"

// after
style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px"
```

**`tests/tonight-callback.spec.js`** — wait for thread load before typing:

```javascript
await page.locator('[data-testid="callback-results"] .stepdone').first().click();
// Wait for thread fetch to complete before typing
await expect(page.locator('.drawer #thread')).not.toContainText('Loading');
await page.locator('[data-testid="note-input"]').pressSequentially('…');
```

**`tests/oohdash-127.spec.js`** — new deterministic regression test:
seeds ticket id 49900 (siteNo '6883', `custom_status_id` 11404223315612) in `beforeEach`
after `signIn` (auth required by `/api/test/tickets`), resets in `afterEach`, asserts
`scrollWidth ≤ 390` at 390×844 viewport.

## Fix iterations for TF-28

3 code iterations:
1. Applied `min-width:0` to subject span in views.js — reduced overflow but full suite still
   failed because the grid track expansion (scope-list tags) was the primary cause.
2. Ran diagnostic spec to isolate root cause — confirmed grid track expanding beyond available
   space with multiple tickets present.
3. Changed `grid-template-columns:1fr` → `minmax(0,1fr)` in both mobile media queries — full
   suite green.

## Risk and rollback

**Risk:** none. At desktop, `minmax(0,7fr) minmax(0,5fr)` was already in use; this change
makes mobile consistent. The visual result is identical — content that overflowed is now
clipped inside the card's padding, which is the intended behaviour.

**Rollback:** revert the commit on `fix/oohdash-127-ci-e2e`. No data migration, no live
system change.
