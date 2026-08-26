# Callback/Follow-Up Lookup — Design Specification

**Project:** OOH Triage Dashboard
**Feature:** C9 — Callback/Follow-Up Lookup
**Date:** 28 March 2026
**Author:** James Brown / Digital Delivery (design by Claude Code)
**Status:** Design — awaiting review before build
**Predecessor:** OOH_CAPABILITY_ANALYSIS.md (C9: 4 incidents), OOH_DASHBOARD_DESIGN.md (Section 5.1 callback queue)

---

## 1. Purpose

A caller rings back and says something like: "I called earlier about my heating — someone was supposed to look at it but nothing's happened." The OOH agent needs to find out what is happening with the ticket, understand its current state without reading raw Zendesk comments, and give the caller a clear, honest answer — all within 60 seconds.

This feature gives the agent a structured lookup flow that:
1. Finds the site's recent tickets in Zendesk
2. Translates ticket status, assignment, and latest activity into a plain English script
3. Presents the agent with exactly what to say to the caller
4. Offers follow-up actions (add a note, bump priority, re-escalate)

**Design philosophy:** The agent should never need to interpret anything. Every piece of information is pre-digested into caller-friendly language. The system does the thinking; the agent reads the script.

---

## 2. Use Case Analysis

### UC-1: Single Active Ticket Found — In Progress
**Trigger:** Caller says "I called about my heating earlier, what's happening?"
**System finds:** One open/pending ticket for the site, assigned to an IoT team member, last updated 2 hours ago.
**Agent needs:** A script that tells the caller what stage it's at and what happens next.
**Outcome:** Agent reassures caller; optionally adds a follow-up note.

### UC-2: Single Active Ticket Found — Waiting on External Party
**Trigger:** Caller says "You raised it with the repair company but nobody's come."
**System finds:** One ticket in "Sent to Repairs Admin" or "Awaiting GK Repair" status.
**Agent needs:** A script that explains the ticket has been passed to the relevant contractor, and what the expected timeline is.
**Outcome:** Agent reassures caller or re-escalates if overdue.

### UC-3: Single Active Ticket Found — No Updates Since Creation
**Trigger:** Caller says "I called hours ago and nobody's done anything."
**System finds:** One ticket created 3+ hours ago, still in Triage or New status, no comments beyond the initial creation.
**Agent needs:** An honest script that acknowledges the delay, plus a mechanism to bump the priority or add an urgent note.
**Outcome:** Agent apologises, bumps priority, reassures caller it will be picked up.

### UC-4: Multiple Active Tickets for Same Site
**Trigger:** Caller says "We've had a few issues — the heating and the fryers."
**System finds:** Two or more open/pending tickets for the site.
**Agent needs:** A summary of each ticket with enough context to identify which one the caller is asking about, then the detail for the relevant one.
**Outcome:** Agent confirms which issue the caller means, then reads the relevant script.

### UC-5: Ticket Was Resolved — Caller Disagrees
**Trigger:** Caller says "They said it was fixed but it's still not working."
**System finds:** A recently solved/resolved ticket for the site.
**Agent needs:** A script that acknowledges the previous resolution, asks the caller what's still wrong, and the ability to either reopen or create a new linked ticket.
**Outcome:** Agent reopens the ticket (with a note explaining the caller's report) or creates a fresh ticket referencing the old one.

### UC-6: No Tickets Found for Site
**Trigger:** Caller says "I called earlier about my lighting."
**System finds:** No tickets for the site in the relevant timeframe.
**Agent needs:** A script that politely explains nothing was found, asks clarifying questions (different site name? different phone number? when did they call?), and the ability to fall back to the normal triage intake flow.
**Outcome:** Agent either locates the ticket via broader search, or starts a fresh triage flow.

### UC-7: Ticket From a Different Shift/Day
**Trigger:** Caller says "Someone came out yesterday but the problem's back."
**System finds:** A ticket from 1-7 days ago, now resolved.
**Agent needs:** Context from the previous ticket (what was done) and the ability to create a follow-up or reopen.
**Outcome:** Agent creates a new ticket linked to the previous one, flagged as a recurring issue.

### UC-8: Caller Cannot Identify Their Site
**Trigger:** Caller says "I'm at the pub on the high street" but cannot provide a house ID or exact site name.
**Agent needs:** A search mechanism that tolerates partial/fuzzy matches and shows enough detail (address, postcode) to confirm with the caller.
**Outcome:** Agent confirms site identity, then proceeds with normal lookup.

### UC-9: Escalation Was Auto-Routed (Timeout)
**Trigger:** Caller says "Nobody called me back after I was promised a callback."
**System finds:** A ticket where the escalation timed out and was auto-routed.
**Agent needs:** A script that explains the request was forwarded to the relevant team, with the exact timestamp, and an action to re-escalate if no response.
**Outcome:** Agent provides transparency, re-escalates if needed.

### UC-10: OOH Pocket Change Was Made — Caller Reporting It Reverted
**Trigger:** Caller says "You turned my heating up earlier but it's gone cold again."
**System finds:** A ticket with a pocket change that has since auto-reverted (e.g., 4-hour window expired).
**Agent needs:** A script explaining temporary changes and their duration, plus the option to apply another pocket change or escalate for a permanent fix.
**Outcome:** Agent explains the temporary nature, applies another change or escalates.

---

## 3. Flow Design — Step by Step

### 3.1 Entry Point

The Callback Lookup is accessible from two places:

1. **Landing page** — a dedicated "Callback / Follow-Up" card alongside the existing triage flow cards
2. **During any triage flow** — a "Check existing tickets" link in the data sidebar when a site is already selected

### 3.2 Step 1: Site Identification

```
+----------------------------------------------------------+
|  CALLBACK / FOLLOW-UP LOOKUP                             |
|                                                          |
|  "The caller says they've called before about an issue.  |
|   Let's find their site and check what's happening."     |
|                                                          |
|  Search for site:                                        |
|  [________________________] [Search]                     |
|                                                          |
|  Search by house ID (e.g. 6360), site name              |
|  (e.g. Mill House), or postcode                          |
+----------------------------------------------------------+
```

This reuses the existing site search component from the landing page. On match, proceed to Step 2.

If **no match**: show "No site found" message with suggestions:
- "Check the spelling — the caller may know it by a different name"
- "Ask for the house ID — it's a 4-digit number, usually on the Lighthouse box"
- "Ask for the postcode and try again"
- If still no match: "Start a fresh call intake instead" (links to normal triage)

### 3.3 Step 2: Ticket Search Results

Once a site is identified, the system queries Zendesk for recent tickets. The agent sees a **ticket summary panel** — NOT raw ticket data.

```
+----------------------------------------------------------+
|  MILL HOUSE (6360) — Recent Tickets                      |
|  Showing IoT-related tickets from the last 14 days       |
|                                                          |
|  [!] 1 ACTIVE TICKET                                    |
|  +------------------------------------------------------+
|  | #28401 — Heating not working (Zone 3)                |
|  | Status: Being investigated by the IoT team           |
|  | Last activity: 2 hours ago — "Checked ThingsBoard,   |
|  |   zone valve appears stuck. Contractor referral       |
|  |   being arranged."                                    |
|  | [View full details]  [Add follow-up note]            |
|  +------------------------------------------------------+
|                                                          |
|  [i] 1 RECENTLY RESOLVED                                |
|  +------------------------------------------------------+
|  | #28350 — External lighting not coming on             |
|  | Resolved: 3 days ago — schedule was corrected        |
|  | [View details]  [Report issue returned]              |
|  +------------------------------------------------------+
|                                                          |
|  [ ] No other tickets in the last 14 days               |
|                                                          |
|  [Start new triage for this site]                        |
+----------------------------------------------------------+
```

**Key design rules for this panel:**
- Tickets are grouped: **Active** (open/pending) first, then **Recently Resolved** (solved in last 14 days), then **Closed** (older, collapsed by default)
- Each ticket shows a **translated status** (not the Zendesk status name), a **translated last activity summary**, and available actions
- Maximum of 10 tickets shown; if more exist, show "and X more — refine your search"
- If zero tickets found: show UC-6 flow (see Section 3.5)

### 3.4 Step 3: Ticket Detail — The Script Panel

When the agent clicks "View full details" on a ticket, they see the **Script Panel** — the core of this feature. This is NOT a raw ticket view. It is a pre-generated, caller-friendly summary.

```
+----------------------------------------------------------+
|  TICKET #28401 — What to Tell the Caller                 |
|                                                          |
|  SCRIPT:                                                 |
|  "I can see your issue was reported at 4:15pm today.     |
|   Our IoT team has been looking into it and they've      |
|   identified that a valve in the heating system may be    |
|   stuck. They're arranging for a heating contractor to    |
|   attend. I don't have a specific time for the visit     |
|   yet, but it's been flagged as urgent."                  |
|                                                          |
|  WHAT YOU CAN OFFER:                                     |
|  - "I'll add a note to the ticket that you've called     |
|     back so the team knows it's still an issue."          |
|  - "I can mark this as more urgent if the situation      |
|     has got worse — has anything changed?"                |
|                                                          |
|  +---------+  +-------------+  +------------------+     |
|  | Add note |  | Bump priority|  | Re-escalate     |     |
|  +---------+  +-------------+  +------------------+     |
|                                                          |
|  TIMELINE:                                               |
|  16:15  Ticket created — "Heating not working Zone 3"    |
|  16:22  Picked up by Sam Day                             |
|  16:45  Update — valve issue identified                  |
|  18:30  You are here — caller rang back                  |
+----------------------------------------------------------+
```

**The script panel has four sections:**

1. **The Script** — A pre-written paragraph the agent can read verbatim to the caller. Generated from ticket status, assignment, last comment, and elapsed time. (See Section 5 for the translation layer.)

2. **What You Can Offer** — One or two bullet points the agent can proactively say. These are contextual: if the ticket is stale, offer to bump priority; if it's actively being worked, offer reassurance; if it's been escalated externally, offer to chase.

3. **Action Buttons** — The follow-up actions available for this ticket (see Section 3.6).

4. **Timeline** — A simplified, translated timeline of the ticket's life. NOT raw Zendesk comments. Each entry is a single line in plain English. Internal technical notes are summarised, not shown verbatim.

### 3.5 Zero Tickets Found (UC-6)

```
+----------------------------------------------------------+
|  MILL HOUSE (6360) — No Recent Tickets                   |
|                                                          |
|  There are no IoT-related tickets for this site in the   |
|  last 14 days.                                           |
|                                                          |
|  WHAT TO ASK THE CALLER:                                 |
|  - "When did you call? Was it today or a different day?" |
|  - "Do you know the site's four-digit house number?"     |
|  - "Could the call have been about a different site?"    |
|                                                          |
|  [Search wider (last 30 days)]                           |
|  [Search by caller phone number]                         |
|  [Start fresh triage for this site]                      |
+----------------------------------------------------------+
```

### 3.6 Follow-Up Actions

Each action is a single-click operation with a confirmation step. The agent never writes free-form Zendesk comments — the system composes them.

#### Action 1: Add Follow-Up Note
- Agent clicks "Add note"
- System shows a pre-composed comment: "Caller rang back at [time] asking for an update on this issue. Agent: [name]."
- Agent can optionally add context from a dropdown: "Situation has worsened" / "Caller is frustrated" / "Contractor hasn't arrived" / "Issue has partially improved" / "Caller wants a specific callback time"
- System posts the comment to Zendesk as an internal note (not public)
- Comment is prefixed with `[OOH CALLBACK]` for IoT team visibility

#### Action 2: Bump Priority
- Available when ticket is not already urgent priority
- Agent clicks "Bump priority"
- System shows: "This will raise the priority from [current] to [next level]. The IoT team will see this flagged when they next check."
- Agent confirms
- System updates ticket priority in Zendesk and adds internal note: "[OOH CALLBACK] Priority raised from [old] to [new] — caller reported situation unchanged/worsened at [time]."

#### Action 3: Re-Escalate
- Available when ticket is in an escalation or stale state
- Agent clicks "Re-escalate"
- Enters the existing escalation flow (holding script, CTA, modal, submit) — pre-populated with context from the existing ticket
- Existing ticket is updated with a note linking to the new escalation

#### Action 4: Report Issue Returned (for resolved tickets only)
- Agent clicks "Report issue returned"
- System asks: "Is this the same problem coming back, or a new/different issue?"
  - **Same problem:** System reopens the original ticket (changes status back to "Investigating"), adds note: "[OOH CALLBACK] Caller reports issue has returned at [time]. Original resolution: [summary]. Reopening for IoT review."
  - **New/different issue:** System starts a fresh triage flow, pre-populated with the site, and adds a link to the previous ticket in the new ticket's description.

---

## 4. Zendesk API Integration Points

### 4.1 Ticket Search by Site

**Endpoint:** `GET /api/v2/search.json`

**Query construction:**
```
type:ticket custom_field_11405878329244:{site_tag_value} created>{14_days_ago}
```

The Site field (ID `11405878329244`) is a tagger dropdown. Each site has a tag value (typically the house ID or a slug). The search uses this to find all tickets for the site.

**Fallback search** (if site field is not set on older tickets):
```
type:ticket tags:{house_id} created>{14_days_ago}
```

**Wider search** (UC-6 — 30 days):
```
type:ticket custom_field_11405878329244:{site_tag_value} created>{30_days_ago}
```

**Response fields needed:**
- `id`, `subject`, `status`, `custom_status_id`, `priority`, `assignee_id`, `requester_id`, `created_at`, `updated_at`, `custom_fields`

### 4.2 Ticket Comments (for Timeline & Latest Activity)

**Endpoint:** `GET /api/v2/tickets/{id}/comments.json`

Already implemented in `server.js` at line 131.

**Response fields needed:**
- `id`, `body`, `author_id`, `created_at`, `public` (boolean — public vs internal note)

**Processing:**
- Comments are fetched for each active ticket shown in the results panel
- Only the latest 5 comments are loaded initially (pagination parameter: `per_page=5&sort_order=desc`)
- Comments are passed through the translation layer (Section 5) before display

### 4.3 User Lookup (for Assignee Names)

**Endpoint:** `GET /api/v2/users/{id}.json`

Needed to translate `assignee_id` into a human name for the script. The server should cache user lookups in memory (the IoT team is only ~5 people).

**Known IoT team members** (from CLAUDE.md):
| Name | Role |
|------|------|
| Sam Day | Team Lead |
| Csaba Jakab (CJ) | Support Manager/Engineer |
| Tony Willetts | Support Manager/Engineer |
| Meg Mcsevney | Admin Support |

These can be hardcoded as a fallback mapping in `data/team-members.json` so the translation layer works even if the Zendesk user API is slow.

### 4.4 Ticket Update (for Follow-Up Actions)

**Endpoint:** `PUT /api/v2/tickets/{id}.json`

Already implemented in `server.js` at line 101.

**Payloads for each action:**

**Add follow-up note:**
```json
{
  "ticket": {
    "comment": {
      "body": "[OOH CALLBACK] Caller rang back at 18:30 asking for update. Context: Situation has worsened. Agent: Kellie.",
      "public": false
    }
  }
}
```

**Bump priority:**
```json
{
  "ticket": {
    "priority": "high",
    "comment": {
      "body": "[OOH CALLBACK] Priority raised from normal to high — caller reported situation worsened at 18:30.",
      "public": false
    }
  }
}
```

**Reopen resolved ticket:**
```json
{
  "ticket": {
    "status": "open",
    "custom_status_id": 25999053444508,
    "comment": {
      "body": "[OOH CALLBACK] Caller reports issue has returned at 18:30. Original resolution: schedule corrected 3 days ago. Reopening for IoT review.",
      "public": false
    }
  }
}
```

### 4.5 New API Route Needed: Callback Lookup

The server needs one new composite endpoint that orchestrates the search-and-enrich flow:

**`GET /api/zendesk/callback-lookup?site={tag_value}&days=14`**

This endpoint:
1. Searches Zendesk for tickets matching the site within the date range
2. For each ticket found, fetches the latest 3 comments
3. Resolves assignee IDs to names (from cache or API)
4. Returns the enriched result set to the frontend

This avoids multiple sequential API calls from the browser and keeps the translation logic server-side where it belongs.

**Response shape:**
```json
{
  "site": { "name": "Mill House", "houseId": "6360" },
  "tickets": {
    "active": [
      {
        "id": 28401,
        "subject": "Heating not working (Zone 3)",
        "status": { "raw": "open", "customStatusId": 25999053444508, "translated": "Being investigated by the IoT team" },
        "priority": { "raw": "high", "translated": "Flagged as urgent" },
        "assignee": { "id": 12345, "name": "Sam Day", "role": "Team Lead" },
        "created": "2026-03-28T16:15:00Z",
        "updated": "2026-03-28T16:45:00Z",
        "latestActivity": {
          "summary": "Checked ThingsBoard, zone valve appears stuck. Contractor referral being arranged.",
          "translatedSummary": "Our team has identified a valve issue and is arranging a contractor visit.",
          "timestamp": "2026-03-28T16:45:00Z",
          "author": "Sam Day"
        },
        "timeline": [
          { "time": "16:15", "event": "Ticket created", "detail": "Heating not working Zone 3" },
          { "time": "16:22", "event": "Picked up by Sam Day", "detail": null },
          { "time": "16:45", "event": "Investigation update", "detail": "Valve issue identified, contractor being arranged" }
        ],
        "script": "I can see your issue was reported at 4:15pm today. Our IoT team has been looking into it and they've identified that a valve in the heating system may be stuck. They're arranging for a heating contractor to attend. I don't have a specific time for the visit yet, but it's been flagged as urgent.",
        "offers": [
          "I'll add a note to the ticket that you've called back so the team knows it's still an issue.",
          "I can mark this as more urgent if the situation has got worse — has anything changed?"
        ],
        "actions": ["addNote", "bumpPriority", "reEscalate"]
      }
    ],
    "resolved": [],
    "closed": []
  },
  "searchDays": 14
}
```

---

## 5. The Translation Layer

This is the most critical component of the feature. It converts raw Zendesk data into language a non-technical OOH agent can read to a caller.

### 5.1 Status Translation

Every Zendesk custom status maps to a plain English phrase for the agent AND a separate phrase for the caller.

| Custom Status ID | Zendesk Name | Agent Sees | Caller Script Phrase |
|-----------------|--------------|------------|---------------------|
| 11404223315612 | New | Just received — not yet picked up | "Your issue has been logged and our team will be picking it up shortly." |
| 25999053375260 | Triage | Being assessed by the IoT team | "Your issue has been received and our team is working out the best way to resolve it." |
| 25999053444508 | Investigating | Being actively investigated | "Our team is actively looking into this right now." |
| 25999037104284 | Monitoring | Being monitored — waiting to see if it settles | "Our team has made some changes and is monitoring the situation to make sure it's resolved." |
| 25999056203932 | Awaiting Remote Fix | A remote fix is being applied | "Our team is applying a fix remotely — this should take effect shortly." |
| 25999081452188 | Awaiting Customer Action | Waiting for the site to do something | "We're waiting for someone on site to [action]. Has that been done?" |
| 25999056357276 | Follow Up Check | Scheduled for a follow-up check | "This is scheduled for a follow-up check by our team." |
| 25999056432284 | Escalated to EM | Escalated to the engineering manager | "This has been escalated to our senior team for action." |
| 25999081650076 | Sent to Repairs Admin | Passed to the repair contractor | "This has been referred to the maintenance contractor. They should be in touch to arrange a visit." |
| 25999081709724 | Sent to Network | Passed to the network engineering team | "This has been referred to our specialist engineering team for investigation." |
| 25999056633884 | Awaiting GK Repair | Waiting for GK's repair contractor to attend | "A repair contractor has been notified. They should be in touch to arrange a visit." |
| 25999056690332 | Post-Repair LH Check | Repair done — our team needs to re-check | "The contractor has been out and our team just needs to do a final check on our system." |
| 25999067648796 | Escalation Query | Query raised during escalation | "There's a query being resolved before this can proceed — our team is on it." |
| 25999081991196 | Escalation Overdue | Escalation is overdue — being chased | "This escalation is being chased — our team is following up." |
| 25999082641308 | Resolved | Resolved | "This was marked as resolved [time ago]. Is it still causing problems?" |
| 25999068372252 | Done | Completed and closed | "This was completed and closed [time ago]." |
| 25999038553244 | Closed | Closed | "This ticket has been closed." |
| 26381319932188 | Customer Replied | Caller has replied — being reviewed | "Your message has been received and our team will review it." |

**For statuses in the `newdemand` swimlane** (15-22: Scoping through Benefits Monitoring): these are project/install tickets, not reactive issues. If found:
- Agent sees: "This is a planned project, not a reactive issue"
- Caller script: "This is part of a planned installation or upgrade for your site. For updates on this, you'd need to speak to the project team during office hours."

### 5.2 Assignment Translation

| Assignee State | Agent Sees | Caller Script Phrase |
|---------------|------------|---------------------|
| Assigned to known team member | "Assigned to [Name]" | "One of our team, [first name], is handling this." |
| Assigned to unknown user | "Assigned to an IoT team member" | "One of our team is handling this." |
| Unassigned, status is New/Triage | "Not yet assigned" | "Your issue has been logged and will be assigned to someone on the team shortly." |
| Unassigned, status is Investigating+ | "Not currently assigned — may need attention" | "I can see this one doesn't have a specific person assigned at the moment. Let me flag it so someone picks it up." |

### 5.3 Time Elapsed Translation

The script needs to express time in human-friendly terms:

| Elapsed Time | Phrase |
|-------------|--------|
| < 30 minutes | "just now" / "a few minutes ago" |
| 30 min - 2 hours | "[N] minutes ago" / "about an hour ago" |
| 2 - 6 hours | "a couple of hours ago" / "earlier today" |
| 6 - 12 hours | "earlier today" |
| 12 - 24 hours | "last night" / "this morning" (context-dependent) |
| 1 - 2 days | "yesterday" |
| 3 - 7 days | "a few days ago" / "earlier this week" |
| 7 - 14 days | "last week" / "about a week ago" |

### 5.4 Comment Translation Rules

Raw Zendesk comments from the IoT team contain technical language. The translation layer applies these rules:

**Rule 1: Strip technical references.** Replace platform names with generic terms:
- "ThingsBoard" / "TB" -> "our monitoring system"
- "Tuya" / "Lighthouse" / "LH" -> "our control system"
- "Salus" -> "the thermostat system"
- "Dragino" / "gateway" / "R10a" -> "the site's communication box"
- "Tongou" / "power pause" -> "the power control unit"
- "Contactor" -> "the power control unit"

**Rule 2: Summarise, don't echo.** Long technical comments are reduced to one sentence:
- "Checked TB telemetry for zone 3, flow temp showing 22C but setpoint is 24C, zone valve relay not switching. Likely stuck valve — need contractor." -> "A valve issue has been identified and a contractor visit is being arranged."

**Rule 3: Extract the actionable outcome.** Every comment is reduced to: what was found + what happens next.

**Rule 4: Handle automated/system comments.** Zendesk trigger-generated comments (e.g., "This ticket was auto-assigned to...") are translated to timeline events, not shown as activity.

**Rule 5: Pocket change comments.** Comments containing `[OOH POCKET CHANGE]` or `[TRG]` are translated:
- "[OOH POCKET CHANGE] Setpoint raised from 20C to 22C at 18:45" -> "The heating was turned up remotely at 6:45pm."
- "[TRG] Triage completed — site guided to check fuse board" -> "The agent guided the site to check their fuse board."

**Implementation approach:** The translation layer will use pattern matching (regex) for known comment formats and a set of keyword-to-plain-English replacement rules. This is NOT AI/LLM-powered at runtime — it is a deterministic rule engine. Comments that cannot be confidently translated get a fallback: "Our team posted an update — the detail is technical. The key point is: [status translation]."

### 5.5 Script Generation

The caller script is assembled from template fragments based on the ticket state:

```
TEMPLATE: callback_active_assigned_recent
"I can see your issue was reported at {created_time_friendly}.
{assignee_phrase}
{latest_activity_translated}
{next_step_phrase}"
```

**Template selection logic:**

| Condition | Template |
|-----------|----------|
| Active + assigned + updated < 4hrs | `callback_active_assigned_recent` |
| Active + assigned + updated > 4hrs | `callback_active_assigned_stale` |
| Active + unassigned | `callback_active_unassigned` |
| Active + escalated externally | `callback_escalated_external` |
| Active + escalation overdue | `callback_escalation_overdue` |
| Resolved < 7 days ago | `callback_recently_resolved` |
| Resolved > 7 days ago | `callback_old_resolved` |
| No tickets found | `callback_not_found` |
| Pocket change auto-reverted | `callback_pocket_change_reverted` |

### 5.6 "What You Can Offer" Logic

The offers shown to the agent depend on ticket state:

| Ticket State | Offers |
|-------------|--------|
| Active, recently updated | "I'll add a note..." |
| Active, stale (no update > 4hrs during business hours, > 1hr during OOH) | "I'll add a note..." + "I can raise the urgency..." |
| Active, unassigned | "I'll flag this for immediate attention..." + "I can raise the urgency..." |
| Escalated externally | "I'll chase this up..." |
| Escalation overdue | "I'll re-escalate this..." |
| Resolved, caller disagrees | "I can reopen this..." + "Or I can log a new issue..." |
| Pocket change reverted | "I can apply the same change again..." + "Or I can escalate for a permanent fix..." |

---

## 6. Mock Scripts — What the Agent Actually Says

### Script 1: Active ticket, being investigated (UC-1)

> "Hi, I can see your issue was reported at about quarter past four today. One of our team, Sam, has been looking into it and it looks like they've found a problem with a valve in the heating system. They're arranging for a heating contractor to come out. I don't have a specific time for the visit yet, but it's been flagged as urgent. I'll add a note to the ticket now that you've called back, so the team knows you're still waiting."

### Script 2: Ticket sent to external contractor (UC-2)

> "I can see this was reported yesterday and it's been referred to the maintenance contractor for a visit. Our records show that went across yesterday evening. I don't have visibility of the contractor's schedule, but they should be in touch with you to arrange a time. Would you like me to flag this as urgent so our team chases it up first thing tomorrow?"

### Script 3: Stale ticket, no progress (UC-3)

> "I can see your issue was reported at about half six this evening. It looks like it hasn't been picked up by the team yet — I'm sorry about that. Let me raise the urgency on this now so it gets attention. I'll also add a note that you've called back. Is the situation the same as when you first called, or has anything changed?"

### Script 4: Resolved but caller says it's back (UC-5)

> "I can see there was an issue with your external lighting that was resolved a few days ago — it looks like the schedule was corrected. Are you saying the same problem has come back? ... OK, let me reopen that ticket and add a note that the problem has returned. Our team will see this flagged first thing and they'll take another look."

### Script 5: No tickets found (UC-6)

> "I've had a look and I can't find a recent ticket for your site. Can I just check a few things with you — do you know the four-digit house number for your site? It's usually on a sticker on the Lighthouse box. ... And when did you call — was it today? ... OK, let me search a bit wider. [If still nothing:] I can't find a matching record, but what I'll do is log a fresh ticket for you now and we'll get it picked up. Can you tell me what the issue is?"

### Script 6: Pocket change reverted (UC-10)

> "I can see that one of our agents turned your heating up to 22 degrees at about quarter to seven earlier this evening. That was a temporary change that lasts for a few hours to give you immediate relief. It will have switched back to the normal setting now. I can apply the same change again for you right now, or if this is an ongoing problem, I can escalate it to our team to look at a permanent adjustment. What would you prefer?"

### Script 7: Multiple tickets (UC-4)

> "I can see there are two open issues for your site at the moment. One is about the heating in Zone 3, reported today — and the other is about your fryers, reported yesterday. Which one are you calling about? ... The fryers? OK, let me pull up the details on that one."

---

## 7. Edge Cases and How to Handle Them

### E-1: Ticket exists but for a different issue than the caller describes
**Handling:** The ticket summary panel shows the subject line. If the caller describes something different, the agent should confirm: "I can see a ticket about [subject] — is that the one you mean, or is this a different issue?" If different, start fresh triage.

### E-2: Ticket was created by a different caller at the same site
**Handling:** Not a problem — tickets are looked up by site, not by caller. The agent can see who reported it (requester name) and confirm with the current caller.

### E-3: Site has 10+ tickets in the timeframe (chronic site)
**Handling:** Show the first 10 sorted by most recent, with active tickets always on top. Show a "This site has [N] tickets in the last 14 days" warning banner. The agent should focus on active tickets and ask the caller to describe which issue they mean.

### E-4: Ticket is in a "newdemand" swimlane status (project, not reactive)
**Handling:** These are filtered OUT of the callback results by default. They are not OOH-relevant. If the caller specifically asks about a planned installation, the agent sees: "This is part of a planned project — for updates, the caller should contact the project team during office hours."

### E-5: Caller provides a Zendesk ticket number
**Handling:** If the agent has a ticket number, bypass site search entirely. Provide a "Search by ticket number" input on the callback lookup screen. Direct lookup via `GET /api/zendesk/tickets/{id}.json`.

### E-6: Zendesk API is slow or down
**Handling:** Show a loading state with "Searching for tickets..." for up to 15 seconds. If timeout: "I'm having trouble pulling up the records at the moment. Let me take your details and I'll make sure someone calls you back." Fall back to manual note-taking mode.

### E-7: Ticket has no comments (only the initial description)
**Handling:** Latest activity becomes: "No updates yet since the ticket was created." Script adjusts: "Your issue was logged at [time] but I don't have any updates on progress yet. Let me flag this for attention."

### E-8: Caller wants a specific callback time
**Handling:** The "Add note" action includes a dropdown option "Caller wants a specific callback time." If selected, a time picker appears. The note posted to Zendesk includes: "[OOH CALLBACK] Caller requested callback at [time] on [date]." The follow-up date field (ID `26074112194076`) is updated to the requested date.

### E-9: Weekend ticket — IoT team won't see it until Monday
**Handling:** The script template detects if the next business day is > 1 day away. Adjusts language: "Our team will pick this up first thing on Monday morning" instead of "first thing tomorrow."

### E-10: Ticket was auto-closed by Zendesk automation
**Handling:** If ticket is "Closed" (terminal), the reopen action is not available (Zendesk does not allow reopening closed tickets). Instead, "Report issue returned" creates a new ticket with a reference: "Follow-up to #[old_id]."

---

## 8. Data Flow Diagram

```
CALLER
  |
  v
OOH AGENT (browser)
  |
  | 1. Agent enters site name/house ID
  v
FRONTEND (ooh.js)
  |
  | 2. GET /api/zendesk/callback-lookup?site={tag}&days=14
  v
SERVER (server.js)
  |
  | 3a. GET /api/v2/search.json?query=type:ticket+custom_field_11405878329244:{tag}+created>{date}
  | 3b. For each ticket: GET /api/v2/tickets/{id}/comments.json?per_page=5&sort_order=desc
  | 3c. Resolve assignee IDs from cache or GET /api/v2/users/{id}.json
  |
  v
TRANSLATION LAYER (server-side, services/callback-translator.js)
  |
  | 4. Apply status translation
  | 5. Apply comment translation (pattern matching + keyword replacement)
  | 6. Generate script from template
  | 7. Determine available actions and offers
  |
  v
ENRICHED RESPONSE -> FRONTEND
  |
  | 8. Render ticket summary panel
  | 9. Render script panel on ticket selection
  v
AGENT READS SCRIPT TO CALLER
  |
  | 10. Agent takes action (add note / bump priority / re-escalate / reopen)
  v
FRONTEND -> SERVER -> ZENDESK API (PUT /tickets/{id}.json)
```

---

## 9. File Structure (Proposed)

```
ooh-triage-dashboard/
├── services/
│   └── callback-translator.js    <- NEW: translation layer (status, comments, scripts)
├── data/
│   ├── team-members.json         <- NEW: IoT team member names/roles for assignment translation
│   ├── status-translations.json  <- NEW: custom_status_id -> plain English mapping
│   └── script-templates.json     <- NEW: script template fragments
├── public/
│   └── js/
│       └── ooh.js                <- MODIFIED: add callback lookup UI flow
├── server.js                     <- MODIFIED: add /api/zendesk/callback-lookup route
```

---

## 10. Decisions (Confirmed 2026-03-28)

### Must-Answer — All Answered

1. **Comment translation:** Deterministic rule engine for now. LLM-powered summarisation to be explored later as part of broader AI integration initiative (see Section 12).

2. **Reopen vs new ticket:** Always create a **new ticket**, but the flow must include agent selection of the linked/related ticket, and ensure tickets are linked/merged as they push through to the BAU IoT Support Dashboard.

3. **Priority bump levels:** P2+ bumps to P1 with WhatsApp to escalation manager. Already P1 → **automated phone call** to escalation manager (see Section 11: Escalation Manager Alerting).

4. **Callback lookup timeframe:** Default to **7 days**. If 0 results, automatic secondary lookup for **30 days**. Always a new ticket if over 30 days.

5. **Ticket filtering:** Do NOT filter out non-IoT tickets at OOH stage. If unclear or unrelated but there's history, default position = escalate to IoT team (not P1) so they can investigate and merge/cleanse.

6. **Newdemand tickets:** YES — include them. Install/newdemand tickets could be causing disruption. Additional routing layer needed at IoT support level to pass to install team. Need to reference site schedules and engineer contacts (or proxy via scheduling team at greeneking@networkcatering email).

### Nice to Decide — Answered

7. **Caller phone number search:** Defer to later version.

8. **Repeat caller badge:** Mark it up visually, but personalised script/options for repeat caller scenario deferred to later.

9. **Read-only mode:** Read is fine. Do not change/write in prototype mode.

10. **OOH agent name:** Proper EntraID login to be designed when moving to production. Applies to both OOH Triage and IoT Support Dashboard.

---

## 11. Escalation Manager Alerting (New Requirement)

**This applies globally — not just to callback lookup.**

When a ticket is bumped to P1 (or is already P1 and being chased):

### Scenario A: Ticket bumped from P2+ to P1
- WhatsApp message to escalation manager
- Contains: site name, ticket number, brief issue summary, link to IoT Support Dashboard ticket view

### Scenario B: Already P1 and customer is chasing
- **Automated phone call** to escalation manager
  - Voice message: "A customer is chasing a P1 escalation for [site name]. Ticket number [XXXXX]. [Within SLA / SLA breached — X hours since raised]. This needs your urgent attention as there have been no updates on the ticket."
- **Parallel SMS** with same information
- **Follow-up WhatsApp** with hyperlink to the OOH Triage UI / specific escalation ticket

### SLA Context
- P1 SLA: 4 hours
- The automated call should state whether the ticket is within or outside the SLA window
- If outside SLA, the urgency framing should be stronger

### Technical Considerations
- Automated calls: Twilio Voice API or similar
- WhatsApp: Twilio WhatsApp Business API or Meta Cloud API
- SMS: Twilio SMS
- Escalation manager contact details: stored in config/Cosmos DB
- This is a **production requirement** — not for the prototype, but must be designed now

---

## 12. Future: AI/LLM Integration (Strategic Requirement)

**Applies to both OOH Triage Dashboard and IoT Support Dashboard.**

Rather than scripting every flow, wording, and rule to an absolute finite degree, explore incorporating LLM/AI logic (potentially via the Claude SDK) to:

1. **Fill gaps in flow coverage** — where a scenario isn't explicitly defined, the LLM provides contextually appropriate guidance to the agent
2. **Generate dynamic scripts** — rather than rigid templates, the LLM assembles natural scripts from the ticket data, adjusting tone and detail based on context
3. **Translate technical comments** — convert IoT team internal notes into caller-friendly language without needing exhaustive deterministic mappings
4. **Suggest next actions** — based on ticket history, device telemetry, and pattern recognition
5. **Continuous improvement** — the LLM learns from resolved tickets which approaches work, feeding back into flow refinement

### Guardrails
- Robust review process for any AI-generated output before it reaches a caller
- Human approval for any actions (escalations, priority changes)
- Deterministic rules take precedence where they exist — AI fills the gaps
- Continuous monitoring and refinement of AI suggestions

### Where to Apply
- **OOH Triage:** Comment translation, gap-filling in triage flows, dynamic script generation
- **IoT Support Dashboard:** Diagnostic suggestions based on telemetry, automated first-response drafting, pattern detection across sites
- **Both:** Reduce dependency on human resource for routine triage and diagnostic steps, especially when ThingsBoard integrations provide the raw data

### Next Steps
- Evaluate Claude SDK integration patterns for real-time agent assistance
- Design a "confidence threshold" — above X confidence the AI acts autonomously, below it flags for human review
- Prototype with the callback comment translation use case as the first AI feature

---

## 13. Additional Design Notes

### UC-7 (Engineer Visit) — GK Repairs Chargeable Warning
All scripts that reference an engineer visit or GK Repairs must include a warning:
> "Please be aware that any engineer visit may be chargeable, as all our work goes through or is registered with GK Repairs Admin."

This applies across all triage flows, not just the callback lookup.

### Newdemand/Install Ticket Routing
When a callback lookup surfaces a newdemand ticket:
- The OOH agent should be able to identify it as an install/project ticket (visual badge)
- If the caller reports disruption or issues related to a recent install, the routing should go to the install/scheduling team
- Reference needed: site schedules, engineer contact details, or proxy via scheduling team
- This is a cross-team routing requirement that extends beyond the OOH tool

---

## 14. Implementation Estimate (Updated)

| Component | Effort | Dependency |
|-----------|--------|------------|
| `callback-translator.js` — translation layer (deterministic) | Medium (1-2 sessions) | status-translations.json, team-members.json |
| `server.js` — callback-lookup route | Small (1 session) | callback-translator.js |
| `index.html` — callback lookup UI + flow | Medium (1-2 sessions) | API route, translation data |
| `script-templates.json` — script templates | Small (1 session) | Status translations finalised |
| `data/*.json` — reference data files | Small (< 1 session) | None |
| Ticket linking/merge logic | Medium (1 session) | Zendesk API ticket linking |
| Escalation manager alerting (design only) | Medium (1 session) | Twilio evaluation |
| Integration testing | Medium (1 session) | All above |
| **Total** | **~7-9 sessions** | |

**Not in scope for prototype (production only):**
- Twilio voice/SMS/WhatsApp integration
- EntraID authentication
- LLM-powered comment translation
- Newdemand ticket cross-team routing

---

*Design approved with amendments 2026-03-28. Ready for build.*
