<!-- gate:contract
TICKET: OOHDASH-137
PHASE: discovery
DATE: 2026-10-21
QUESTIONS:
Q1: Sam Day - Title format: prefer site-number-first ("[OOH] 6261 Wheatstone Inn - outcome") or outcome-first ("[OOH] outcome - 6261 Wheatstone Inn")? Number-first recommended here because the Zendesk merge picker truncates long subjects and site is then the first thing visible. STATUS: UNRESOLVED
Q2: Sam Day - Does the title need anything beyond siteNo + siteName, such as the area (Bar/Restaurant, Accommodation) or a P1 flag? (P1 tickets already say "- P1" in the outcome text.) STATUS: UNRESOLVED
Q3: Sam Day - Back-fill of existing open OOH tickets: in-scope for this ticket (scripted subject-update via the Zendesk API, one afternoon of work) or out of scope (new format applies to tickets created from ship date)? STATUS: UNRESOLVED
SECTIONS:
- What this ticket is
- All ticket-creation paths, their titles today, and what changes
- Site data availability and name quality
- Downstream consumer analysis
- The problem proven by live data
- Title format options
- Cost and silent-running evaluation
- Open questions and what we still need
-->

# OOHDASH-137 Discovery: OOH ticket titles should include site name and number

**Requested by:** Sam Day (IoT Support lead), Teams 'OOH IOT Dash - Catch up', 2026-10-20 07:29. James thumbs-upped.

**In one line:** Every OOH-created Zendesk ticket gets a generic title that looks identical for different sites. Sam cannot tell which site a ticket is for without opening it, which makes the Zendesk merge workflow painful when the same issue affects multiple calls from one site overnight.

---

## What this ticket is

This is a preference request, not a defect. The dashboard creates Zendesk tickets correctly; the titles are just not informative enough for the merge workflow. Classification: **preference**.

The fix is small and contained. It is one code change in one function (zendesk.js createOutcomeTicket), plus one follow-on cleanup in raiseQuery. No new dependencies, no new external calls, no new services.

---

## All ticket-creation paths, their titles today, and what changes

Every OOH Zendesk ticket goes through one function: createOutcomeTicket in services/zendesk.js. The subject is set at line 350:

    subject: '[OOH] ' + subject

The `subject` value is whatever the caller passed in. Site number and name are available as parameters at this call site (siteNo and siteName are both received by createOutcomeTicket) but are not currently used in the Zendesk title.

There are four distinct callers, all going through createOutcomeTicket:

**Path 1 - Flow outcomes (flows.js, via POST /api/outcome, routes/api.js line 357).**
Source: flows.js sets a static subject string at each outcome node (e.g. line 647: "Pub heating change requested (Bar/Restaurant)", line 838: "External lighting not working - P1"). routes/api.js passes that string to createOutcomeTicket. siteNo and siteName are in the POST body alongside subject (routes/api.js line 358).
Title today: [OOH] External lighting not working - P1
After fix: [OOH] 6261 Wheatstone Inn - External lighting not working - P1
PROVEN: code read + live Zendesk data (see problem section below).

**Path 2 - Control outcomes (control.js, via POST /api/outcome, routes/api.js line 357).**
Source: control.js assembles subject from the device action (e.g. line 270: "Setpoint lower - sent, awaiting device confirmation", line 356: "Setpoint lower - IT700TX-025804FB", line 402: "Setpoint lower - NOT applied, escalated"). Same route handler. siteNo and siteName in POST body (control.js lines 268-269).
Title today: [OOH] Setpoint lower - sent, awaiting device confirmation
After fix: [OOH] 6261 Black Bull - Setpoint lower - sent, awaiting device confirmation
PROVEN: code read + live Zendesk data (see problem section).

**Path 3 - Late device sync ticket (zendesk.js createLateSyncTicket, line 424).**
Source: called when a timed-out control command later confirms. Builds subject as: "Late device confirmation - " + action.deviceId. action.siteNo and action.siteName are available on the action object (line 424 params).
Title today: [OOH] Late device confirmation - IT700TX-025804FB
After fix: [OOH] 6261 Black Bull - Late device confirmation - IT700TX-025804FB
PROVEN: code read.

**Path 4 - "Raise a query" from the Tonight view (zendesk.js raiseQuery, line 611).**
Source: raiseQuery builds its own subject: "OOH query - site " + siteNo, then calls createOutcomeTicket. siteNo is a parameter; siteName is NOT currently passed.
Title today: [OOH] OOH query - site 6261
After fix (if siteName added to raiseQuery call): [OOH] 6261 Wheatstone Inn - OOH query
Note: if the global fix in createOutcomeTicket prepends site, the raiseQuery subject would become "[OOH] 6261 Wheatstone Inn - OOH query - site 6261" (redundant). raiseQuery must be updated to simplify its subject to "OOH query" if the prefix is added centrally. Two-line change.
PROVEN: code read.

**Inbound call / voice ticket reconciliation (mergeTickets path).**
OOH creates the outcome ticket first (subject set as above), then merges the Zendesk Talk call ticket INTO the OOH outcome ticket (OOH is the survivor per the freeze rule). mergeTickets does not alter the OOH ticket's subject (zendesk.js lines 769-795). So the OOH subject is already set before any merge. No separate path to fix.
PROVEN: code read.

**The single fix point** for Paths 1-3 is createOutcomeTicket (zendesk.js line 350). Path 4 (raiseQuery) needs a one-line cleanup alongside. That is the full scope.

---

## Site data availability and name quality

**siteNo** is always available at every call site. It is a required field in the /api/outcome POST body, present on the action object for late-sync, and a named parameter in raiseQuery.
PROVEN: routes/api.js line 346 requires it; createOutcomeTicket signature line 313 receives it.

**siteName** is the cleaned pub name derived from the Zendesk site-field option by humanNameFromOption (zendesk.js lines 90-97). The format is "Pub Name (Location)", with brand prefix stripped and leading house number stripped (e.g. "Wheatstone Inn (Gloucester)"). It can be up to approximately 40 characters. Typical examples: "Wheatstone Inn (Gloucester)", "Black Bull", "Pack Horse".

siteName CAN be null in two cases: (a) the site has no matching entry in the Zendesk site custom-field options, or (b) resolveSiteName returns null on error. In these cases the OOH dashboard currently shows an "unverified site name" warning to the handler. The fix must handle null gracefully.

**Fallback for null siteName:** use "[OOH] {siteNo} - {subject}" rather than failing. This is better than today's bare "[OOH] {subject}" and is still a clear improvement.
DEDUCED: by reading the resolveSiteName null-return contract at zendesk.js lines 118-128.

---

## Downstream consumer analysis

**Zendesk triggers:** 27 triggers inspected (live read). None match on the "[OOH]" subject prefix. The two IoT Dashboard webhook triggers ("IoT Dashboard - Push New Tickets", "IoT Dashboard - Push Ticket Updates") send subject as a plain field but do not condition on it. One trigger ("Combi Oven OOH") matches on a completely different subject string. Changing the OOH subject format affects no trigger logic.
PROVEN: triggers read via Zendesk API.

**Zendesk views:** 42 views inspected (live read). None filter on "[OOH]" or "OOH" in the subject. No view surfaces OOH tickets by subject prefix at all. OOH tickets appear in existing queues by tag.
PROVEN: views read via Zendesk API.

**Zendesk automations:** 4 automations inspected (live read). None reference the subject or OOH tags.
PROVEN: automations read via Zendesk API.

**IoT Support Dashboard (client side, public/js/app.js):** OOH ticket detection is explicitly tag-based. The code comment at line 651 reads: "no reliance on subject prefixes or requester. OOH is a ticket SOURCE, not a separate ticket type." The isOohTicket function at line 653 checks tags.includes('ooh') only. The subject field is displayed as-is and also fed to the full-text search (line 6279) and the inbound-call reconciliation path (line 2245 ff) but no OOH routing logic depends on the subject starting with "[OOH]".
PROVEN: source read.

**IoT Support Dashboard (server side, server.js, services/ooh-escalation.js):** OOH P1 detection uses OOH_P1_TAG = 'ooh_p1' (tag-based, ooh-escalation.js line 21). OOH_BODY_MARKER = 'Out of Hours' is used in the SMS body text and in reconciliation against the [TRG] comment body, NOT against the ticket subject. The auto-categorisation engine at server.js line 2756 pattern-matches ticket subjects for issue keywords (alarm, heating, etc.) but not for OOH routing. None of this logic depends on the "[OOH]" subject prefix.
PROVEN: source read.

**P1 SMS path (escalation.js line 68):** The SMS body is already built independently of the ticket title: "OOH P1 - {siteName} ({siteNo}): {summary}". It does not read back the ticket subject. The P1 SMS path is unaffected.
PROVEN: code read.

**OOH Tonight view / review queue:** routes/api.js line 397 stores the subject in the audit log as the "What happened" column: "detail: subject + (OohCaptureClass ? ' - class: ' + OohCaptureClass : '')". After the fix this would include the site prefix, making the Tonight view MORE informative, not less. No adverse effect.
PROVEN: code read.

**E2e and unit tests:** Three subject string assertions found in the test suite. All three assert body.subject in the HTTP POST payload (the client-to-server request, BEFORE the server prepends "[OOH] "). For example, oohdash-134-other-p1.spec.js line 73: "expect(body.subject).toBe('Something else - urgent, escalated as P1')". These test the client-side subject value, not the Zendesk ticket title. The server-side title assembly in createOutcomeTicket is NOT covered by these assertions. Changing the server-side format does NOT require changing existing tests. New regression tests for the updated title format should be added.
PROVEN: test source read.

**Zendesk subject character limit:** 150 characters. Current longest observed OOH subject: "[OOH] Equipment group gateway offline - main distribution board and heating unreachable" (87 chars). Adding "6261 Wheatstone Inn - " (22 chars) gives 109 chars. Safely within the 150-char limit even for the longest outcome strings.
PROVEN: live Zendesk data + Zendesk API limit (standard/well-known).

---

## The problem proven by live data

The following OOH tickets were created in the 14 days to 2026-10-21. Ticket id and subject are listed (tags confirm all are ooh-tagged, read-only search):

| Ticket | Subject | Site (from tag) |
|--------|---------|-----------------|
| 50706 | [OOH] General issue captured | gk_6225 |
| 50703 | [OOH] General issue captured | gk_6186 |
| 50701 | [OOH] External lighting not working - P1 | gk_7392 |
| 50697 | [OOH] External lighting not working - P1 | gk_6243 |
| 50644 | [OOH] General issue captured | gk_7392 |
| 50642 | [OOH] Setpoint lower - sent, awaiting device confirmation | gk_7971 |
| 50641 | [OOH] Setpoint lower - sent, awaiting device confirmation | gk_7971 |
| 50635 | [OOH] Setpoint raise - sent, awaiting device confirmation | gk_7639 |
| 50634 | [OOH] Setpoint raise - sent, awaiting device confirmation | gk_7639 |
| 50632 | [OOH] Setpoint raise - sent, awaiting device confirmation | gk_7639 |
| 50629 | [OOH] Setpoint raise - sent, awaiting device confirmation | gk_6813 |
| 50628 | [OOH] Setpoint raise - sent, awaiting device confirmation | gk_6813 |

Tickets 50634-50635 (same site gk_7639) and ticket 50633 (manually renamed by IoT team to "7639 Black Bull - Salus Setpoint Change...") illustrate the problem: four identically titled OOH tickets exist for site 7639 from the same evening. Ticket 50633 was renamed manually by the IoT team AFTER the fact, showing they already feel this pain. Similarly, tickets 50625 and 50626 (site gk_6835) show an OOH ticket merged into a manually-renamed follow-up ticket.

Sam mentioned tickets for sites 5199 (Silkwood Farm) and 5217 (Heathfield Farm) in the Zendesk Review chat as examples of duplicates. Those are fridge alarm tickets created by the alarm monitoring system, not by the OOH dashboard. The `ooh` tag is absent from alarm-system tickets. Sam's Teams request (2026-10-20) applies to OOH-dashboard-created tickets specifically; alarm tickets are out of scope for this ticket.
DEDUCED: fridge alarm tickets come from the alarm-monitoring system (no ooh tag); scope confirmed by Sam's own phrasing.

---

## Title format options

Three options are offered for James and Sam to choose from:

**Option A (RECOMMENDED): Site-number first, name if available.**
Format: [OOH] {siteNo} {siteName} - {outcome}
Fallback (null siteName): [OOH] {siteNo} - {outcome}
Examples:
- [OOH] 6261 Wheatstone Inn - Pub heating change requested (Bar/Restaurant)
- [OOH] 6261 Wheatstone Inn - Setpoint raise - sent, awaiting device confirmation
- [OOH] 6261 Wheatstone Inn - External lighting not working - P1
- [OOH] 6261 - General issue captured (fallback, null siteName)

Pros: site info is in the first ~25 characters, visible in the Zendesk merge picker even on mobile; consistent with how the IoT team is ALREADY manually renaming tickets (see ticket 50633: "7639 Black Bull - Salus Setpoint Change..."); siteNo always present so fallback always works.
Cons: outcome text pushed further right; on a very narrow column view, long pub names (e.g. "Wheatstone Inn (Gloucester)") can compress the outcome. Not a functional problem.

**Option B: Outcome first, site appended.**
Format: [OOH] {outcome} - {siteNo} {siteName}
Example: [OOH] Setpoint raise - sent, awaiting device confirmation - 6261 Wheatstone Inn

Pros: preserves current reading order for people used to the existing format.
Cons: Zendesk list and merge-picker truncation means the site info at the end is exactly what gets cut off. Defeats Sam's purpose. NOT recommended.

**Option C: Number only, no site name.**
Format: [OOH] {siteNo} - {outcome}
Example: [OOH] 6261 - Setpoint raise - sent, awaiting device confirmation

Pros: no null-siteName fallback needed; always clean; slightly shorter titles.
Cons: operators use pub names in conversation, not numbers. Number-only is harder to scan in a list. Site name adds meaningful disambiguation.

Implementation code sketch (pseudocode only, not production code):
- In createOutcomeTicket: build prefix as siteNo + (siteName ? ' ' + siteName : '') + ' - '
- Title becomes: '[OOH] ' + prefix + subject
- In createLateSyncTicket: no change needed (already passes siteNo/siteName to createOutcomeTicket)
- In raiseQuery: remove the existing '- site N' suffix from the local subject since the prefix now carries it; pass siteName to createOutcomeTicket

---

## Back-fill

Existing open OOH tickets currently have generic titles. Back-filling them (updating subject on all open ooh-tagged tickets via the Zendesk API) is technically possible via a one-time script using the Zendesk Update Ticket endpoint. Estimated effort: half a day of scripting and verification.

Risk: Zendesk does not hold a subject-update audit trail in the same way as comments. A bulk rename is irreversible without logging the before/after manually.

This is an option for Sam to decide (Q3). The main value is for the merge workflow specifically - back-fill would let Sam merge pending overnight tickets by site even for tickets created before ship day. If Sam's primary use is future nights, back-fill is optional.

---

## Cost and silent-running evaluation

**Token and cost efficiency:** This change adds zero LLM tokens at runtime. siteName is already resolved server-side and passed in the POST body; no new external calls are needed for any path. The Zendesk site-field options cache (1h TTL) already serves the siteName. Zero recurring cost change.

**Silent-running:** Not applicable. There is no polling, watcher, daemon, or scheduled component in this change. It is a synchronous string-format change on a per-request path that already runs.

Both criteria are fully satisfied.

---

## Open questions and what we still need

The following questions drive the gate outcome. Each must be answered before design can proceed. The build is simple enough that design and build can be combined into one phase once the format is decided.

Q1 (UNRESOLVED, Sam): Title format - see option A/B/C above. Recommendation is Option A (site-first). Does Sam agree, or prefer a different ordering?

Q2 (UNRESOLVED, Sam): Does the title need anything beyond siteNo and siteName? For example, should area (Bar/Restaurant, Accommodation) appear in the title for heating tickets? The outcome text already contains the area for heating flows (e.g. "Pub heating change requested (Bar/Restaurant)"). Adding it to the title would be redundant but not harmful.

Q3 (UNRESOLVED, Sam): Back-fill - should existing open OOH tickets be renamed on ship? In or out of scope?

Q4 (PROVEN SAFE): Does the IoT Support Dashboard server or client parse the "[OOH]" subject prefix for routing or detection? Answer: no - fully tag-based at both layers (code read, both client public/js/app.js and server services/ooh-escalation.js). No question remains for Spencer on this point.

---

## Handoff summary

The proposed change is small (2-3 file locations, all in services/zendesk.js and one in raiseQuery), backward-compatible, and carries no cost or downstream risk. The only outstanding items are Sam's format preference (Q1-Q3). Once Q1 is answered, design and build can run as a single short phase with no gate between them given the trivial scope.

Blockers before build: Q1 (Sam, format choice). Q2 and Q3 are scope-shapers, not blockers.

Recommended next step: route Q1-Q3 to Sam (Teams or email). If no strong preference on Q2-Q3, default to Option A with no back-fill and ship.
