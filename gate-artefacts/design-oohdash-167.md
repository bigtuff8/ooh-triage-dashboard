<!-- gate:contract
SECTION: What this design delivers
OOHDASH-167 adds a "pick-up" row to the in-app ticket page — the page an OOH agent opens in a new tab from the Tonight view. When a ticket raised through this dashboard has been picked up by someone on the IoT team, the agent can see that immediately. When it has not yet been picked up, they know that too. The row covers all OOH-tagged tickets (D2-B from discovery), not just P1s. No background polling; the status is fetched once per page open alongside the existing ticket data, with one extra Zendesk users-cache lookup per open (cached, negligible cost at OOH volumes).

SECTION: Screen state — ticket page, picked up
Ticket page heading: "Ticket #45097" with optional P1 badge to the right.
Subject line: bold ticket subject text.
Status row (blue gtk box, unchanged): label "ℹ Status right now (from the IoT team)" then the ticket's current status text.
NEW pick-up row (green gtk.ok box): label "✅ Picked up by the IoT team" then the IoT agent's display name (e.g. "Jamie Ashton").
Opened/updated line: small text showing when the ticket was raised and last updated.
Thread section: "What's on the ticket" heading followed by timeline entries.

SECTION: Screen state — ticket page, not yet picked up (P1)
Same structure as above. The pick-up row uses an amber gtk.warn box.
Label: "⏳ Not yet picked up by IoT"
Body text: "Raised [time elapsed]" (e.g. "Raised 23 minutes ago")
This state renders only when the ticket has the ooh_p1 tag (highest urgency — the agent needs to know it has not been picked up yet).

SECTION: Screen state — ticket page, logged (non-P1 ooh ticket)
Same structure. The pick-up row uses the default blue gtk box.
Label: "⏳ Logged — IoT team to review"
No body text (routine tickets don't warrant a countdown-style urgency signal).
This state renders when the ticket has the ooh tag but NOT ooh_p1, and has no assignee yet.

SECTION: Screen state — ticket page, not an OOH ticket
No pick-up row rendered at all. The row is conditional on fromOoh (ticket carries the ooh tag). Tickets opened from other paths show no change.

SECTION: Code changes

services/zendesk.js — ticketView() (around line 911)
After statusInfo(t) resolves, add a resolveAgentName(t.assignee_id) call (function already exists at line 1077, cached). In fixture mode, resolveAgentName calls zd() which throws; add a fixture-mode guard: if assignee_id is a known fixture agent ID (e.g. 21142139507484), return "Jamie Ashton" directly, otherwise return null. Add pickedUpBy: (pickedUpBy ? { name } : null) to the returned object.

services/zendesk.js — fixture tickets (around line 271)
Add assignee_id: 21142139507484 to ticket 45097 (the existing "No hot water" ooh ticket) so the picked-up state is exercisable in fixture mode. This ID is fictional and will not resolve against live Zendesk.

public/css/styles.css
Add two modifier rules after the existing .gtk and .gtk .gtk-label rules:
  .gtk.ok  — green: background #D1FAE5, border-left-color #10B981, color #065F46
  .gtk.ok .gtk-label — green label: color #059669
  .gtk.warn — amber: background #FEF3C7, border-left-color #F59E0B, color #92400E
  .gtk.warn .gtk-label — amber label: color #D97706

public/js/app.js — renderTicketPage() (around line 216)
After the status gtk div, insert the pick-up row: conditional on t.fromOoh; uses gtk.ok / gtk.warn / gtk (default) depending on pickedUpBy and isP1; shows the agent name when picked up, the creation time when P1-and-not-picked-up, and nothing extra for a routine unassigned ticket.

SECTION: Test cases

T1 — Picked up: ticketView() with a ticket that has assignee_id set returns pickedUpBy: { name: "Jamie Ashton" }. UI: pick-up row is green, label "✅ Picked up by the IoT team", body "Jamie Ashton".

T2 — Not assigned: ticketView() with assignee_id null/absent returns pickedUpBy: null. UI for P1 ticket: pick-up row is amber, label "⏳ Not yet picked up by IoT", body shows raised time. UI for non-P1 ooh ticket: pick-up row is default blue, label "⏳ Logged — IoT team to review", no body text.

T3 — Non-OOH ticket: fromOoh is false. No pick-up row rendered at all.

T4 — Zendesk lookup fails: resolveAgentName throws. pickedUpBy degrades to null (error caught, never surfaces to agent). P1 ticket shows amber "not yet picked up" row; non-P1 shows blue "logged" row.

T5 — Fixture mode: ticket 45097 (assignee_id 21142139507484) renders the green picked-up row with "Jamie Ashton". Ticket 45110 (no assignee, non-P1 ooh) renders the blue "Logged" row. A seeded fixture P1 ticket with no assignee renders the amber "Not yet picked up" row.

SECTION: Cost and token efficiency
The design adds one Zendesk users lookup per ticket-page open (GET /users/{id}.json). This is a standard REST call — no LLM tokens consumed. The users cache (agentNameCache Map, already in place) means repeated opens of tickets assigned to the same agent cost zero extra calls per process lifetime. At OOH volumes (a handful of ticket-page opens per night) this is negligible. No background polling; the lookup runs only when an agent opens the ticket page. Cost per open: one HTTP call, cached on first hit. No unbounded scaling risk.

SECTION: Silent running
No background component. The pick-up status is fetched synchronously within ticketView() on demand. Zero idle cost, zero polling, zero console windows or background processes.

DECISION: Wording for picked-up state | A: "✅ Picked up by the IoT team" with the agent name below (plain, recommended — matches the OOH UX principle of plain words and no Zendesk terminology) | B: "✅ IoT team on it — [name]" (more conversational, slightly less clear who "it" means) | C: "✅ Assigned to [name]" (Zendesk terminology — excluded by OOH copy principles)

DECISION: Show pick-up row for which tickets | A: P1 only (ooh_p1 tag) | B: All ooh-tagged tickets — consistent with D2-B from discovery; every escalation gets the signal regardless of severity (recommended) | C: P1 and outcome-type escalation tickets only
-->

# Design gate — OOHDASH-167: pick-up visibility on the ticket page

**Ticket:** OOHDASH-167
**Discovery gate:** PR #215 (approved)
**Decision bindings:** D1-A (enhance ticketView, show on ticket page, one lookup per open, no polling), D2-B (all ooh-tagged tickets)

---

## Problem and goal

OOH agents raise tickets through the dashboard and can open them in a new tab from the Tonight view. At present the ticket page shows only the Zendesk status text. Agents have no way to know whether the IoT team has seen or picked up the ticket — a gap that matters most during active P1 incidents but applies to any escalated ticket.

This design adds a single pick-up status row to the ticket page. It answers one question plainly: has the IoT team picked this up yet, and if so, who has it?

---

## What changes and where

Three files change. The gate artefact describes the design; the code lands in the build phase.

**services/zendesk.js — `ticketView()`**
After the ticket is fetched, resolve the assignee's display name via `resolveAgentName(t.assignee_id)` (already in the file, cached). The returned object gains a `pickedUpBy` field: `{ name: "..." }` when assigned, `null` otherwise. Fixture mode gets a guard so ticket 45097 (assignee_id 21142139507484) returns `{ name: "Jamie Ashton" }` without a live API call.

**public/css/styles.css**
Two new modifier classes on `.gtk`: `.gtk.ok` (green, using existing success palette) and `.gtk.warn` (amber, using existing warning palette). They follow the same pattern as `.alert.ok` and `.alert.warn`.

**public/js/app.js — `renderTicketPage()`**
One new conditional div after the existing status row. Renders only when `t.fromOoh` is true; colour and copy vary by pick-up state and P1 status.

---

## Screen states — ticket page pick-up row

The pick-up row is new. Everything else on the ticket page is unchanged.

### State 1 — Picked up

Ticket has an `assignee_id` that resolves to a name. `pickedUpBy: { name: "Jamie Ashton" }`.

```
[green box]  ✅ Picked up by the IoT team
             Jamie Ashton
```

CSS class: `gtk ok`

### State 2 — Not yet picked up (P1)

Ticket is `ooh_p1`, no assignee. `pickedUpBy: null`, `isP1: true`.

```
[amber box]  ⏳ Not yet picked up by IoT
             Raised 23 minutes ago
```

CSS class: `gtk warn`

The "raised" time reuses `createdFriendly`, already returned by `ticketView()`.

### State 3 — Logged, IoT to review (non-P1 ooh)

Ticket has `ooh` tag, no `ooh_p1`, no assignee. `pickedUpBy: null`, `isP1: false`.

```
[blue box]   ⏳ Logged — IoT team to review
```

CSS class: `gtk` (default, unchanged)

No body text. Routine tickets don't warrant an urgency countdown — the agent has done their job and the IoT team will work through the queue.

### State 4 — Not an OOH ticket

`fromOoh` is false. No pick-up row rendered.

---

## Data dictionary

| Field | Source | Type | Meaning | Sensitivity |
|---|---|---|---|---|
| `pickedUpBy` | `ticketView()` return | Object or null | IoT agent who has the ticket open (`{ name: string }`), or null if unassigned | Display name only; not an email or ID |
| `pickedUpBy.name` | Zendesk GET /users/{id}.json | String | Display name of the assigned IoT agent | Low — first name + surname, internal staff |
| `assignee_id` | Zendesk ticket object | Number or null | Zendesk user ID of the assigned agent | Never exposed to the UI; used only for the lookup |

Existing fields reused unchanged: `isP1`, `fromOoh`, `createdFriendly`, `status.agent`.

---

## Test scripts and test data

### T1 — Picked up state (happy path)

**Precondition:** Fixture ticket 45097 has `assignee_id: 21142139507484`; fixture guard in `resolveAgentName` returns `"Jamie Ashton"` for that ID.

**Steps:**
1. Open the OOH dashboard in fixture mode as Test Handler.
2. Navigate to `/ticket/45097`.
3. Observe the ticket page.

**Expected:** A green row labelled "✅ Picked up by the IoT team" appears below the status row; body text shows "Jamie Ashton".

---

### T2 — Not yet picked up, P1

**Precondition:** A fixture ticket seeded with `tags: ['ooh', 'ooh_p1']`, no `assignee_id`.

**Steps:**
1. Seed the fixture ticket (or use a pre-seeded one).
2. Navigate to that ticket's page.

**Expected:** An amber row labelled "⏳ Not yet picked up by IoT" appears below the status row; body text shows the raised time (e.g. "Raised just now").

---

### T3 — Logged, non-P1

**Precondition:** Fixture ticket 45110 (or 45102): `tags: ['ooh']`, no `ooh_p1`, no `assignee_id`.

**Steps:**
1. Navigate to `/ticket/45110`.

**Expected:** A blue row labelled "⏳ Logged — IoT team to review" appears; no body text.

---

### T4 — Lookup failure degrades gracefully

**Precondition:** Unit test stub: `resolveAgentName` throws for a given ID.

**Steps:**
1. Call `ticketView()` with a ticket that has a non-null `assignee_id`.
2. Assert `pickedUpBy` is null (not a thrown error).

**Expected:** `pickedUpBy: null` returned. P1 ticket degrades to amber "not yet picked up"; non-P1 to blue "logged". No error shown to the agent.

---

### T5 — Non-OOH ticket: no row

**Precondition:** Fixture ticket without `ooh` tag.

**Steps:**
1. Navigate to that ticket's page.

**Expected:** No pick-up row of any kind rendered. Page looks identical to the current production ticket page.

---

## CX criteria — how the design realises them

| Discovery criterion | How it is realised | Where to see it |
|---|---|---|
| Agent sees pick-up status on the ticket page (D1-A) | New gtk row below the existing status box; one Zendesk users lookup per open, cached | Prototype: "Picked up" state |
| Applies to all OOH tickets, not only P1 (D2-B) | Row rendered whenever `fromOoh` is true, regardless of `isP1` | Prototype: "Logged" state (non-P1) |
| No polling or background process (D1-A) | Fetch on page open only; no setInterval, no websocket, no background worker | services/zendesk.js code change description above |
| Plain language, no Zendesk jargon | "Picked up by the IoT team", "IoT team to review" — no "assignee", no "pending", no Zendesk status codes | Prototype labels |
| Reassurance moment: P1 not picked up | Amber box with time elapsed — specific enough to act on (escalate manually if needed) | Prototype: "Not yet picked up" state |
| Friction: routine tickets don't overwhelm | Non-P1 unassigned gets a brief blue confirmation row, not a countdown | Prototype: "Logged" state |

---

## Cost and token efficiency

This design adds no LLM calls and no recurring API cost. The one new network call per ticket-page open (Zendesk GET /users/{id}.json) is a standard REST lookup, cached in-process. At OOH volumes — a small number of ticket-page opens per night — the marginal cost is negligible. No unbounded scaling risk.

## Silent running

No background component. Zero idle cost. The pick-up status is fetched on demand when the agent opens the ticket page, alongside the existing ticket fetch. Nothing runs between opens.

---

## Open flags and assumptions

- The brief uses `getAgentName` as the function name; the existing code uses `resolveAgentName` (line 1077). Build should use `resolveAgentName`.
- The brief states `gtk ok` / `gtk warn` "already exist in the stylesheet". They do not — `.alert.ok` and `.ss.ok` exist but not `.gtk.ok`. Build must add the two new CSS modifier rules.
- Fixture guard for `resolveAgentName` is a build-phase decision: the simplest approach is a small in-function check (`if (!live() && agentId === 21142139507484) return 'Jamie Ashton'`) rather than a full fixture branch. Build to confirm.


---

## Rework addendum — round 1 (design/draft)

### Panel verdicts addressed

**critical-thinker — Assignee ≠ IoT team member (false-fact risk)**

The concern is valid. `assignee_id` proves only that someone has the ticket assigned; it does not prove that person is an IoT team member. Routing automation or non-IoT staff can appear as assignees in Zendesk.

This addendum amends the green-row label from **"✅ Picked up by the IoT team"** to **"✅ Picked up — [name]"** (e.g. "✅ Picked up — Jamie Ashton"). The copy now asserts only what the data actually supports: the ticket has a named assignee. The team-membership claim is removed. If build-phase discovery confirms that OOH ticket assignment is structurally constrained to the IoT Zendesk group (e.g. via a group-scoped assignment rule), the "IoT team" phrasing can be reinstated — but that confirmation is a build-phase item, not a design assumption. The amended copy is correct regardless of how assignment works. The DECISION block is updated accordingly: option A becomes "✅ Picked up — [name]" (recommended); option C remains excluded.

**critical-thinker — Stale amber reads as live status**

The concern is valid. A once-per-open fetch means an amber "Not yet picked up" row can sit on screen for minutes while the ticket is in fact being worked. The agent sees a present-tense statement that is actually historical.

This addendum amends all three row states to carry a point-in-time marker. The amber state renders as:

```
[amber box]  ⏳ Not yet picked up — as of [HH:MM]
             Raised 23 minutes ago
```

The "as of [HH:MM]" timestamp is derived at `ticketView()` call time (no extra API call; `Date.now()` at the moment of the fetch, formatted to local time). Green and blue states receive the same marker for consistency, though the urgency signal matters most for amber. The agent now understands the status is a snapshot and knows they may need to reload if the situation is live. No polling is introduced; this is a copy and data-shape change only. `ticketView()` returns a `fetchedAt` timestamp in its result object; `renderTicketPage()` formats it.

**critical-thinker — Assigned-but-unresolvable renders as "not picked up" (false negative)**

The concern is valid. `resolveAgentName` can return null without throwing — for a deleted or deprovisioned Zendesk user. The current design collapses `pickedUpBy: null` into the "not picked up" branch regardless of whether `assignee_id` is present, so a ticket that IS assigned shows the wrong state.

This addendum amends `ticketView()` to track the two signals separately:

- `isAssigned: boolean` — derived from `assignee_id !== null`, before any network call.
- `pickedUpBy: { name: string } | null` — derived from `resolveAgentName(assignee_id)`; null if the lookup throws or returns null.

A fourth render state is added for `isAssigned: true, pickedUpBy: null`:

```
[green box]  ✅ Picked up — as of [HH:MM]
             (agent name unavailable)
```

CSS class: `gtk ok`. The ticket IS assigned; the green signal is correct. The body text signals that the name lookup failed without hiding the assignment. The P1 amber guard tightens from `pickedUpBy === null` to `isAssigned === false`. An assigned-but-unresolvable P1 ticket now correctly shows green, not amber.

T4 is split into two discrete tests:

- **T4a** — `resolveAgentName` throws for a given `assignee_id`: `pickedUpBy` degrades to null, `isAssigned` remains true; renders green "Picked up — as of [HH:MM] / (agent name unavailable)".
- **T4b** — `resolveAgentName` returns null (deleted user): same outcome as T4a.

The data dictionary gains one new field: `isAssigned` (boolean, derived from `assignee_id !== null`, not exposed to UI directly, used only to control row state).

---

### Summary of additions

Four concrete changes to the existing design, none of which alter the no-polling, single-lookup-per-open architecture:

1. **Copy — picked-up label softened.** "Picked up by the IoT team" → "Picked up — [name]". Removes the unenforceable team-membership assertion; the row now claims only what the assignee_id field proves.

2. **Point-in-time marker on all row states.** Each state gains "as of [HH:MM]" derived at fetch time. The amber row no longer reads as a live signal; it communicates clearly that the agent is seeing a snapshot and may need to reload.

3. **New fourth state — assigned but name unresolvable.** `isAssigned: true, pickedUpBy: null` renders green ("Picked up — as of [HH:MM] / agent name unavailable") rather than collapsing into the "not picked up" branch. This closes the false-negative path the critical-thinker identified. The amber P1 guard now gates on `isAssigned === false`, not `pickedUpBy === null`.

4. **T4 split into T4a and T4b.** Throw and null-return are now tested and specified as distinct paths, both resolving to the fourth state above. The data dictionary gains `isAssigned` as a new field.