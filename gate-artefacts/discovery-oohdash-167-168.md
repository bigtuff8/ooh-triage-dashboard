<!-- gate:contract
SECTION: 167 — The gap: OOH team can't tell if IoT picked it up
When an OOH agent raises a P1, the OOH dashboard shows "P1 escalation raised" in the ticket thread and in the Tonight tab. After that, silence — until the IoT team replies in WhatsApp. The OOH agent can't tell the pub whether help is coming, and can't spot an escalation nobody has taken. Sam Day raised this on 17 Nov 2026; James noted the same need on 6 Nov 2026. It applies to P1 tickets (ooh_p1 tag) as a minimum; whether it also applies to non-P1 escalated tickets (ooh tag, no ooh_p1) is an open decision (D1).

SECTION: 167 — Pick-up signal: assignee_id in Zendesk (DEDUCED)
Live Zendesk evidence from three ooh_p1 tickets: ticket 52824 (created today, unresolved) has assignee_id=null; ticket 52541 (resolved) has assignee_id=21142139507484; ticket 52403 (closed, group_id=11404229989916) has assignee_id=23821185788700. The pattern is DEDUCED: when IoT picks up an escalation, they assign the ticket to themselves in Zendesk and move the custom status forward. The Zendesk Audits API (GET /api/v2/tickets/{id}/audits.json — confirmed working in CIR IOTD doc) records this change with the timestamp and actor. This is the signal the OOH dash can read without any new IoT-side work.

SECTION: 167 — Tonight tab and ticket view: what already exists
The /tonight route reads from the Cosmos OohAuditLog collection (audit.entriesTonight()) — it does NOT read from Zendesk live. Each entry has: OohActionType, operator, siteNo, ticketId, outcome, OohActionAt. There is no field for pick-up status. The ticketView() function (services/zendesk.js:801) makes one GET /tickets/{id}.json call and returns: id, subject, status, isP1, createdFriendly, updatedFriendly, thread. It does NOT return assignee_id or assignee name. Both gaps are small to fix: add assignee to ticketView() and decide how to surface pick-up in the Tonight tab.

SECTION: 167 — Tonight tab pick-up options
Option A (lazy fetch, recommended): When the OOH agent opens a ticket from the Tonight tab, the existing ticketView() call is enhanced to also return the assignee name and pick-up timestamp (from the ticket's assignee_id + a Zendesk users lookup or audit). The Tonight tab entry gets an "IoT picked up — Sam Day, 18:34" badge that is fetched on ticket open. No background polling. Simple, low-latency only when needed.
Option B (server-side background poll): A server-side timer (e.g. every 5 minutes) scans Cosmos for recent ooh_p1 audit entries that have ticketId set, queries Zendesk for each to check if assignee_id has changed from null, and writes a new audit entry (OohActionType: "iot-pickup") to OohAuditLog. The Tonight tab shows pick-up inline without the agent having to open the ticket. More complex, but pick-up appears in the history without interaction.
Option C (IoT-to-OOH notification): IoT Support Dashboard posts back to OOH when a ticket is picked up. This is a new integration contract. Spencer + IoT shop would need to build it. Out of scope for this discovery gate.

SECTION: 167 — Questions for Sam Day
Q1 (OWNER: Sam Day): When you pick up an OOH escalation, do you do it by assigning the Zendesk ticket to yourself in Zendesk — or through an action in the IoT Support Dashboard, a WhatsApp reply, or something else entirely? The answer determines whether Zendesk assignment is a reliable signal.
Q2 (OWNER: Sam Day): When is a ticket "picked up" for the purpose of this feature — the moment someone opens it, or only when active work has started (a comment, a status change)?
Q3 (OWNER: Sam Day): Should the OOH team see a pick-up timeout alert — i.e. a flag if a P1 is still unassigned after N minutes? If yes, what threshold (15 min? 30 min?)?

SECTION: 167 — Questions for James Brown
Q4 (OWNER: James Brown): P1 only (ooh_p1 tag), or every escalated ticket (all tickets with the ooh tag)? The ooh tag is on every OOH ticket; non-P1 escalations also have it, as do scope-only outcomes and captures.
Q5 (OWNER: James Brown): If pick-up is shown in the Tonight tab history, is it enough to show it only when the ticket is opened (Option A), or does it need to appear inline in the history list without the agent having to click (Option B)?

DECISION: 167 Pick-up signal implementation | A: Enhance ticketView() to return assignee name and pick-up time; show on the ticket page when the OOH agent opens it from the Tonight tab (recommended — simple, no background polling, one Zendesk call already in flight) | B: Add a 5-minute server-side background poll that writes iot-pickup audit entries to Cosmos; show pick-up inline in the Tonight tab history without requiring the agent to open the ticket (timelier UX, but adds background poll complexity and audit noise)

DECISION: 167 P1 scope | A: Show pick-up for P1 tickets only (ooh_p1 tag) — the most urgent case and matches the existing Approach-B join contract (recommended) | B: Show pick-up for all escalated OOH tickets (ooh tag, any outcome type including scope-only and capture)

SECTION: 168 — The gap: diverted OOH calls arrive without the caller number
When a call to the OOH line is diverted, the OOH agent's phone shows no caller number. The agent cannot call back and cannot identify the site. James's three ideas: (A) take the number from Zendesk emails, (B) add a voicemail view in the app, (C) link to the call recording. This spike investigates whether any route is technically feasible and what it would cost.

SECTION: 168 — Zendesk Talk: NOT active (PROVEN)
GET /api/v2/calls/stats returns HTTP 404 — Zendesk Talk is not enabled on this instance. All 47 live ooh_p1 tickets have via.channel="api" with no via.phone or via.voice data. No missed-call or voicemail tickets exist. The phone call that is diverted to the OOH agent is NOT going through Zendesk Talk.

SECTION: 168 — The reconciliation module is built but dormant (DEDUCED)
services/reconciliation.js (shipped in v1.7.x) is fully built to handle Zendesk Talk call tickets. Its opening comment: "OOH calls arrive through Zendesk Talk, which auto-creates a call ticket carrying a native VoiceComment (recording_url, answered_by, started_at, caller number)." The scoring logic, merge path, and audit hooks are production-ready. If Zendesk Talk were active on the OOH number, this module would already surface the caller number and recording URL into the OOH ticket. The module is dormant because Talk is not active, not because Talk is incompatible with the codebase.

SECTION: 168 — Route A assessment: caller number from Zendesk emails (UNRESOLVED)
Zendesk Talk, when active, generates a "missed call" or "voicemail" ticket containing the caller's number. Those tickets arrive via email from Zendesk's own notification system. James's idea of "take the number from the Zendesk emails" may refer to these Talk-generated emails, not plain emails from the caller. If Talk were enabled on the OOH number, missed calls would create Talk tickets automatically, and the existing reconciliation module would already merge caller number and recording URL into the OOH ticket. Feasibility depends entirely on whether Talk can be licensed and the OOH number assigned to it. Effort: low for OOH dash (reconciliation code is built); Spencer would need to configure Talk and assign the OOH number.

SECTION: 168 — Route B assessment: voicemail view in the app (UNRESOLVED)
Requires: (1) the OOH phone system has voicemail capability, and (2) voicemail audio or transcripts can be retrieved via an API. No phone system information is known — not in the CIR. If the divert is on a hosted VOIP system (e.g. Gamma, 8x8, RingCentral), voicemail API access may be available. If it is a plain PSTN forward to a mobile, there is no voicemail API. Effort: medium-to-high, and entirely dependent on the phone system. No work is possible until the phone system is identified.

SECTION: 168 — Route C assessment: link to call recording (UNRESOLVED)
Requires: (1) the phone system records calls, and (2) recording URLs can be shared with authenticated OOH agents. Same dependency on the phone system identity as Route B. If Zendesk Talk were active, recordings are part of the VoiceComment on the call ticket (recording_url field) and the reconciliation module already handles them. The existing code at services/zendesk.js:1041 shows: on merge, the call recording URL is appended to the OOH ticket as an internal note. No new code needed beyond enabling Talk.

SECTION: 168 — Recommended path: Zendesk Talk first (DEDUCED)
The highest-leverage action is to establish whether Zendesk Talk can be licensed and the OOH number assigned to it. If yes: Routes A and C are both solved with existing code (reconciliation module), and no new integration is needed. If no: a phone system integration must be scoped from scratch, which requires identifying the phone system owner first. All three routes converge on the same two questions: (Q6) is Talk available, and (Q7) which phone system handles the OOH number.

SECTION: 168 — Questions for Spencer Thompson
Q6 (OWNER: Spencer Thompson): Is Zendesk Talk licensed on our Zendesk instance? The Talk stats API returns 404. If it is licensed, can the OOH number be assigned to a Talk line? If not licensed, can it be added?

SECTION: 168 — Questions for Sam Day / James Brown
Q7 (OWNER: Sam Day or James Brown, to identify owner): Which phone system or provider handles the OOH line and the divert? Who is the account owner? This is needed regardless of the Talk question.
Q8 (OWNER: James Brown): If call recordings can be surfaced (via Talk or via the phone system), who in the OOH team should be able to access them? Data protection consideration — recordings are personal data (voice).
Q9 (OWNER: James Brown): Is caller number (to call back) the most valuable piece of data, or is voicemail/recording equally important? This sets the priority order for the three routes.

DECISION: 168 Route to pursue | A: Zendesk Talk enablement first — confirm licensing with Spencer; if feasible, the existing reconciliation module already handles caller number and recording; scope Talk setup as a small infrastructure task separate from an OOH dash story (recommended) | B: Phone system integration — identify the phone system owner first, then assess voicemail/recording API; more work but phone-system-agnostic | C: Close spike as UNRESOLVED pending Spencer + phone owner identification; no follow-on stories until Q6 and Q7 are answered
-->

# Discovery gate — OOHDASH-167 and OOHDASH-168

**Date:** 2026-11-25
**Run:** ooh-triage-dashboard-R1-mwwja07s
**Status:** Research complete — gate for decisions and questions to Sam/Spencer/James

One gate, two parts. Both share the same Zendesk infrastructure question, the same stakeholders, and the same discovery session. 167 (pick-up visibility) is actionable as soon as Sam Day confirms how IoT signals pick-up. 168 (diverted call number/voicemail) is blocked on two external questions (Zendesk Talk licensing, phone system owner).

---

## Part 1 — OOHDASH-167: Show when IoT picked up an escalated ticket

### The gap

When an OOH agent raises a P1, the OOH dash writes "P1 escalation raised" to the ticket thread and to the Tonight tab history. After that, the OOH team can only find out if IoT have picked it up by checking WhatsApp. Sam Day confirmed this on 17 Nov 2026; James noted the same gap on 6 Nov 2026.

### How the signal works today

Three live P1 tickets examined (52824, 52541, 52403):

| Ticket | Status | assignee_id | group_id |
|--------|--------|-------------|----------|
| 52824 (today) | new | null | null |
| 52541 (19 Nov) | solved | 21142139507484 | 23136444387996 |
| 52403 (16 Nov) | closed | 23821185788700 | 11404229989916 |

**DEDUCED:** When IoT picks up an escalation, they assign the Zendesk ticket to themselves (assignee_id moves from null to their user ID) and change the custom status (e.g. from "New" / 11404223315612 to "Investigating" / 25999053444508). The Zendesk Audits API (GET /api/v2/tickets/{id}/audits.json) records this change with actor and timestamp. Confirmed in CIR IOTD doc. This needs Sam Day to confirm it is the standard IoT pick-up workflow.

### What the OOH dash currently shows

The ticketView() call (services/zendesk.js:801) makes one GET /tickets/{id}.json and returns: subject, status (translated), isP1, createdFriendly, updatedFriendly, thread (OOH/TRG comments). It does NOT return assignee or pick-up timestamp.

The /tonight route (routes/api.js:954) reads from the Cosmos OohAuditLog collection. It never reads from Zendesk. There is no "pick-up" entry in the audit log — OOH never writes one because it cannot know.

### The two implementation options

**Option A (recommended) — enhance ticketView, fetch on open:** Add assignee name and pick-up time to the ticketView() response. The OOH agent opens a ticket from the Tonight tab; the ticket page shows "IoT picked up: Sam Day, 18:34" (or "Not yet picked up — raised 47 min ago"). One extra Zendesk users cache lookup per ticket open. No background polling; no audit noise.

**Option B — server-side background poll:** A timer scans for recent ooh_p1 audit entries with a ticketId, queries Zendesk for each, and writes an `iot-pickup` entry to OohAuditLog when assignee_id changes from null. The Tonight tab shows pick-up inline without the agent opening the ticket. More timely; significantly more complex.

### Questions — answers needed before design gate

| # | Question | Owner |
|---|----------|-------|
| Q1 | When you pick up an OOH escalation, do you assign the Zendesk ticket to yourself, or is pick-up signalled a different way (IoT dashboard action, WhatsApp reply)? | Sam Day |
| Q2 | When is a ticket "picked up" — the moment someone opens it, or when active work starts (first comment, status change)? | Sam Day |
| Q3 | Should OOH see a pick-up timeout flag if a P1 is still unassigned after N minutes? If yes, what threshold? | Sam Day / James |
| Q4 | Should pick-up visibility apply to P1 tickets only (ooh_p1 tag), or to every OOH escalation (all ooh-tagged tickets)? | James |
| Q5 | Is it enough to show pick-up when the agent opens the ticket, or does it need to appear inline in the Tonight history list without clicking? | James |

---

## Part 2 — OOHDASH-168: Options for caller number and voicemail on diverted OOH calls

### The gap

When a call to the OOH line is diverted, the OOH agent's phone shows no caller number. The agent cannot call back and cannot identify the site. James raised three possible routes in the Teams chat on 24 Nov 2026: take the number from Zendesk emails, add a voicemail view in the app, link to the call recording.

### Zendesk Talk: not active (PROVEN)

GET /api/v2/calls/stats returns HTTP 404. Zendesk Talk is not enabled on this instance. All 47 live ooh_p1 tickets have via.channel="api" with no via.phone or voice data. No missed-call tickets exist. The OOH line divert does not go through Zendesk Talk.

### Existing code: reconciliation module is built and dormant (DEDUCED)

services/reconciliation.js (shipped in v1.7.x, production code) is fully built to handle Zendesk Talk call tickets. Its comment: "OOH calls arrive through Zendesk Talk, which auto-creates a call ticket carrying a native VoiceComment (recording_url, answered_by, started_at, caller number)." The scoring, merge, and audit logic are complete. If Talk were active and the OOH number were assigned to a Talk line, the reconciliation module would already be merging caller number and recording URL into OOH tickets automatically.

### Route assessment

| Route | Feasibility | Effort if feasible | Key blocker |
|-------|-------------|-------------------|-------------|
| A — caller number via Zendesk Talk missed-call ticket | UNRESOLVED | Low (reconciliation module already built) | Q6: Is Talk licensed? Can OOH number be assigned? |
| B — voicemail audio/transcript in app | UNRESOLVED | Medium–High | Q7: Which phone system? Does it have a voicemail API? |
| C — link to call recording | UNRESOLVED | Low if Talk; Medium otherwise | Q6 (Talk path); Q7 (phone system path) |

All three routes share the same two blocking questions. Routes A and C are likely solved together if Zendesk Talk can be enabled. Route B requires a separate phone system integration regardless.

### Recommended path

Establish whether Zendesk Talk can be licensed and the OOH number assigned (Q6). If yes, enable Talk — Routes A and C are both solved with existing code. If no, identify the phone system owner (Q7) and scope a separate integration. No design gate for 168 is possible until Q6 and Q7 are answered.

### Data protection note

Call recordings are personal data (voice). Before surfacing recordings or caller numbers in the OOH app, a decision is needed on access control (which OOH users can see them, retention period, audit trail). James owns this question (Q8).

### Questions — answers needed before any design gate

| # | Question | Owner |
|---|----------|-------|
| Q6 | Is Zendesk Talk licensed on our instance? Can the OOH number be assigned to a Talk line? | Spencer Thompson |
| Q7 | Which phone system or provider handles the OOH line and the divert? Who is the account owner? | Sam Day / James Brown (to identify) |
| Q8 | If call recordings become accessible, who in OOH should be able to see them? Data protection consideration. | James Brown |
| Q9 | Is caller number (call-back) the top priority, or is voicemail/recording equally valuable? This sets the route priority. | James Brown |

---

## Related

OOHDASH-153 (closed): P1 SMS cleanup. Established that Approach B (ooh_p1 tag → IoT Support Dashboard SMS) is live and confirmed end-to-end. OOHDASH-167 builds on the same tag contract.

The Zendesk webhook (triggers 26455738065052 and 26455778093852, no tag/channel scoping) already pushes every ticket update to the IoT Support Dashboard at zendesk-uat.airedale-api.co.uk. The pick-up event is already reaching IoT; the OOH dash just never reads it back.
