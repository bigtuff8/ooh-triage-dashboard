<!-- gate:contract
SECTION: Rev 5 in one paragraph (your decisions of 29 Oct evening)
Rev 5 reworks rev 4 from your mobile review. Agents never log anything any more: every call is saved automatically from the moment the site is confirmed, and published to the IoT Support Dashboard when the agent presses End call or Raise another issue, leaves the screen, or goes quiet for 20 minutes (E1). The override comes first in every journey that can raise a P1: the agent explains where the PowerPause panel is and how to press the override once, and a P1 is raised only if it doesn't work and the kitchen is needed now (J1). P1 and other ticket numbers open a new in-app ticket page instead of Zendesk, and the site's open-tickets panel shows tickets raised from this dashboard with a P1 badge and their status right now (A1). The full PowerPause guide is served by the app and linked from every override step (K1). The rest of your list is done everywhere it occurs, not just where you spotted it.

SECTION: What the agent sees now (the prototype)
Two pages built from the app's own screens: today's release next to the rev 5 working copy, both run on test data. The kitchen click-through covers all four scenarios: override first, "something not on this list", and the timetable request that collects details before the ticket. The all-screens page shows every screen in every journey (206 states), today next to rev 5, with each piece of text tagged by its type. Links are in the body and the PR description. 26 click paths were tested through the prototype with no failures and no page errors.

SECTION: E1: no logging step, the call record is automatic
The server starts a call record when the site is confirmed. After every step the browser sends what we know so far and the notes. Ordinary outcomes create their ticket as soon as they are reached, so the reference can be read out; there is no "Log it" button and no "this logs a ticket" warning anywhere. Every outcome ends with one block: "When you press either button, this conversation is published to the IoT Support Dashboard as the complete record", then Raise another issue and End call. Either button, leaving the screen, or 20 minutes with no activity writes the record: as a comment on the issue's ticket, or as one ticket created already closed if no ticket was raised. It is written once only, however many of those happen. The red warning now appears only before an equipment switch, and the solid red version only before a P1.

SECTION: J1: the override first, everywhere a P1 can be raised
Kitchen (every circuit: smart reachable, smart not reporting, older sites): the agent picks the equipment, then reads the override step. "There's a manual override on the PowerPause panel, usually by the kitchen distribution boards, behind the appliance, or on the ceiling. Every appliance we control has a Lighthouse label. Press the button for the fryer once; please don't hold it down." For fryers and bain-marie or gantries, it adds: "also press the green start button on the interlock panel". Then: "The override is logged and monitored, and our team checks it automatically the next working day." The customer's answers are "Yes, it's come on" (logged, no P1), "No, it hasn't come on" or "They can't find the panel" (then the service question; Yes raises the P1 behind the solid red warning), plus "the fuse board fixed it" where the circuit is meant to stay on, and "we need it at different times" where it is off on its timetable. Outside lighting and Contractor on site follow the same order. Fridges have no override (Lighthouse doesn't control them), and the Donkey Derby site has none that works, so those keep the direct P1.

SECTION: A1: tickets open in the app, never Zendesk
The P1 banner no longer links to Zendesk. It shows "Ticket #45129: Being assessed by the IoT team", and the number opens a new browser tab with the in-app ticket page: subject, P1 badge, status right now, and what is on the ticket. The screen the agent is on never changes. Every other ticket number in the app does the same, including the after-action card, This call so far, Tonight, the timer banner and the admin P1 log. The "Open tickets for this site" panel now lists only tickets raised from this dashboard that are still open. P1s are shown first with a red P1 badge, and each shows its plain current status from the IoT team's ticket.

SECTION: The other changes (b to i), applied everywhere
b: the equipment chooser says "From this site's equipment list" and highlights each name. A new answer, "Something not on this list", tells the customer that it isn't controlled by Lighthouse and to contact their service contractor; it is recorded and closed. c: customer answers have their own teal, rounded buttons under a "Customer's answer" label in every journey; action buttons stay purple. d: "repairs team" is now "service contractor" everywhere. f: the words to say come first and the "What happened" recap sits below them, saying what actually happened. "Call back and we'll escalate" is gone everywhere. g: the connection questions and their outcomes use the new colours. h: "logged as a priority" is replaced everywhere with "It's logged, and our IoT team picks it up the next working day." i: timetable requests (kitchen and fans) collect which equipment, which days and times, and once or every week before the ticket. The script says permanent changes need the pub's management, usually the Area Manager. The next screen is only the confirmation with the ticket number.

SECTION: Cost, running in the background, and risk
No AI or token cost: nothing here calls a language model. Zendesk use rises by at most one extra comment or closed ticket per call, on the existing account. The idle check is a timer inside the existing server: no window, no notification, no network traffic unless a call has actually gone quiet, and a microsecond scan once a minute otherwise. Two things need a hand before go-live: a new Cosmos container for call records (Spencer, five minutes), and agreement from the IoT team that closed contact-history tickets will appear on their dashboard. Risk: every journey's look changes again, so the all-screens dump is re-run and checked line by line before the test gate. P1 paging, control and ticket types are unchanged.

SECTION: Tests
Unit tests on the rev 5 working copy: 854 run, 844 pass and 9 fail. Eight of the failures assert wording or panel rules that rev 4 and rev 5 changed on purpose; the build updates them. The ninth (p1-log) already fails on main. Six new call-record tests pass: idempotent finalise, append rather than duplicate, idle sweep, operator check, and closed-on-create. Three label tests were updated to the rev 5 words. The test scripts and data for the end-to-end run are in the body.

DECISION: Idle time before a call record is published automatically | 20 minutes (recommended) | 10 minutes | 30 minutes
DECISION: Wording for who approves permanent timetable changes | "the pub's management, usually the Area Manager" (as designed) | "the Area Manager" | Something else (say in review)
DECISION: Approve design rev 5 and proceed to build? | Approve, proceed to build | Changes requested
-->

# OOHDASH-159 Design rev 5: override first, automatic call record, in-app tickets

**Kitchen click-through prototype (rev 5):** [OOHDASH-159-mockup.html](../docs/project/mockups/OOHDASH-159-mockup.html) · standalone https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-159-mockup.html
**All screens, today vs rev 5 (206 states):** [OOHDASH-159-rev5-screens.html](../docs/project/mockups/OOHDASH-159-rev5-screens.html) · standalone https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-159-rev5-screens.html
**PowerPause override guide (served by the app at /guides/powerpause-contractor-info.html):** [powerpause-contractor-info.html](../docs/project/guides/powerpause-contractor-info.html)
**Rev 4 for comparison:** [OOHDASH-159-rev4-screens.html](../docs/project/mockups/OOHDASH-159-rev4-screens.html)

Date: 2026-10-29 · Discovery PR #182 · Rev 4 decisions Q1 to Q7 still stand except where rev 5 changes them (below) · Base: main v1.6.5

## Your decisions of 29 Oct (evening)

| # | Your decision | What it supersedes | In this design |
|---|---|---|---|
| E1 | Logging is automatic on the server. A call record starts at site confirm and is finished by End call or Raise another issue, or automatically on leaving the screen or after an idle time. No agent "log" step. | Q2 "warning before any ticket" (rev 4 assumption) | No Log button or "this logs a ticket" warning anywhere. Red only before a switch; solid red only before a P1. Idle time proposed at 20 minutes. |
| J1 | Override first, on all circuits (reachable, not reporting, older sites) and in every flow that can raise a P1. P1 only if it still won't come on. | D1 (no tip on offline P1), D2 (tip on reachable P1), and the rev 4 open decision on re-asking | One override step for every kitchen circuit; lighting and contractor in the same order; the old "In the meantime, press the button" tip on the P1 card is removed |
| A1 | No Zendesk link. Ticket numbers open the in-app ticket view in a new tab. Site panel shows OOH-raised tickets with a P1 badge and plain status. | Rev 4 P1 banner link | New /ticket/:id page; every ticket number links to it; panel filtered to the ooh tag, P1 first |
| K1 | The whole PowerPause Contractor Info guide, converted as-is, served by the app and linked from every override step | none | Copied to public/guides; "Show the override guide" on every override step, opens in a new tab |

Assumption to confirm: permanent timetable changes need approval from "the pub's management (usually the Area Manager)". The guide says "Changes to schedules must be authorised by the Area Manager". It is the second decision in the review.

## The kitchen journey, step by step (rev 5)

| Step | What the agent sees | Customer's answers | Next |
|---|---|---|---|
| 1. Which equipment | Green script "Ask the customer: which piece of kitchen equipment is the problem?" and a blue dashed note: "From this site's equipment list. These are the kitchen circuits Lighthouse controls here; the names come from this site, not a fixed list." Names highlighted. Skipped when the site has one circuit. | each circuit by name · Several / all of it · Something not on this list | 2, 3 or 4 |
| 2. Something not on this list | Blue: "Lighthouse only switches the kitchen equipment on this site's list: Fryer, Glass washer, Dishwasher, Pot wash and Bain-marie. Anything else in the kitchen (for example a grill, hot plate or oven that isn't listed) runs on its own supply." Green: "That isn't controlled by Lighthouse at your site, so I can't see it or switch it from here. Please contact your service contractor through your usual route." Field: "Which equipment is it?" | Continue | Closed record, reference read out |
| 3. Power is on (on as expected, on outside hours, on but no power drawn) | Green: "The glass washer has power and is switched on at our end. If it still isn't working, it's most likely a fault with the appliance itself, so please contact your service contractor." | I'll call our service contractor · I still think it's your equipment | Closed record / step 5 |
| 4. Override first (off, not reporting, older site) | Green: what we can see ("I can see your fryer is switched off", "...aren't connecting to us... The override on the PowerPause panel still works", "I can't see from here whether..."), then where the panel is, the Lighthouse label, press once and don't hold, the interlock green start button for fryers and bain-marie or gantries, and "logged and monitored, checked automatically the next working day". Blue: why it is off, what holding the button does, and the guide link. | Yes, it's come on · No, it hasn't come on · They can't find the panel · The fuse board had tripped; resetting it fixed it (meant-to-stay-on only) · It's fine, but we need it at different times (off on timetable, or older site) | Logged / 5 / logged / 6 |
| 5. Service question | Green: "Sorry it hasn't come on. Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?" | Yes, it's needed now · No, it can wait | P1 confirm / logged for the next working day (not reporting: the connection questions) |
| P1 confirm | Green: "Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team." Ticket box. Solid red "This raises a P1". Red "Raise the P1" button. | none | After-action |
| 6. Timetable request | Blue: what the timetable says now. Green: "I can't change the timetable from here tonight, but I'll pass exactly what you need to our IoT team. Permanent changes to the timetable need approval from the pub's management, usually the Area Manager." Ask: which equipment, which days and times, once or every week. Fields and answer buttons for each. If Continue is pressed with gaps, a red line asks for them. | equipment chips · Just this once · Every week (a permanent change) · Continue | Confirmation only: "That's with our IoT team, reference 45131. They'll contact you the next working day to arrange it." |

## After-action layout (every outcome, every journey)

| Order | Block | Example (override worked) |
|---|---|---|
| 1 | Green "Say to the customer" | "Great, that's it on. The override lasts until the next timetable change. It's logged, reference 45158, and our team checks it automatically the next working day." |
| 2 | Neutral "What happened" card with the ticket number (new tab) | "Ticket created for the IoT team · Ticket #45158. Nothing was switched from here; the customer used the override on site. The IoT team checks it the next working day. On the ticket: Kitchen equipment on with the manual override" |
| 3 | Notes box | "+ Add a note to ticket #45158" |
| 4 | End-of-call block | "When you press either button, this conversation is published to the IoT Support Dashboard as the complete record. If you leave the screen, it is published automatically." · Raise another issue · End call |

Card headings say what actually happened: "Ticket created for the IoT team", "P1 raised", "Recorded and closed (contact history)", "Call recorded, nothing changed", "Not applied: ticket created for the IoT team", "Heating change saved to the ticket".

## Wording fixed across every journey

| Item | Where it was | Rev 5 |
|---|---|---|
| d: repairs | kitchen circuit cards (6 places), kitchen outcome, fridge query, Something else | "service contractor" |
| f: call back and we'll escalate | aircon, Something else, kitchen, contractor, heating "no action" | removed; heating "no action" now says "call us again and we can set it" |
| h: priority for the IoT team | connection outcomes (3), hot water, the ambiguous-site screen, the not-confirmed control outcome | "It's logged, and our IoT team picks it up the next working day." |
| h: first thing | two pub heating scripts (controls not visible) | "the next working day" |
| E1: log wording on buttons | "Log it", "Log it for the IoT team", "Log and escalate to IoT team", "Capture & escalate", "Check and log", "Log for the IoT helpdesk and finish", "Override done: log the call" | "Pass it to the IoT team", customer answers ("Yes, it's working again" / "No, it's still not working"), "Finish this issue", "Continue" |
| c: customer answers | every journey's answer buttons, including heating area and need, pub heating need and zones, fridge, connection, contractor, timetable form | teal rounded buttons under "👤 Customer's answer" |
| g: connection screens | amber, yellow and green alert boxes | blue background, green script, teal answers, neutral after-action card |
| Pub heating "Check and log" screen | its own review-and-submit step with a red warning | removed; the summary is saved automatically and shown as the recap |

## Server-side call record (E1)

| Event | What happens | Idempotency |
|---|---|---|
| Site confirmed | A call record is created (call id returned to the browser). | one per confirm |
| Each step | The browser sends the issue's key, journey, What we know so far and notes (fire and forget). | last write wins; frozen once finalised |
| Outcome ticket created | The ticket is linked to the issue on the call record. | |
| Raise another issue / Cancel issue | That issue is finalised: one "[OOH CALL RECORD]" comment on its ticket, or a closed call-record ticket if none. | issue marked finalised first; a repeat writes nothing |
| End call / opening another site / going home | The whole call is finalised the same way; a call with no issue at all gets one closed record. | call status finalised; a repeat returns "already" |
| Tab closed or navigated away | The browser sends a keepalive finalise ("left the screen"). | same as above |
| 20 minutes with no activity | An in-process timer (once a minute) finalises the call ("no activity for 20 minutes"). | same as above |
| Pod restart | Open calls are reloaded from the store and the timer finishes them. | same as above |

Only the operator who started a call can add to it or finish it. Records are capped (20 issues, 30 lines each).

## Cost and silent running (mandatory criteria)

| Criterion | Assessment |
|---|---|
| Tokens / AI cost | None. No language model is involved anywhere in this change. |
| Recurring cost | Zendesk: at most one extra internal comment per issue, or one closed ticket for a call with no outcome; on the existing licence and API quota. Cosmos: one small document per call (under 5 KB) in a new container; negligible at OOH volumes (tens of calls a night). |
| Unbounded scaling | None: records are capped per call and the idle timer scans an in-memory map. |
| Background component | The idle timer runs inside the existing server process: no window, console, notification or separate service. It is unref'd so it never keeps the process alive. While idle it makes no network call and spends no money; it writes to Zendesk only when a call has genuinely gone quiet. |
| Trade-off to accept | A closed "call record" ticket is created for calls that end with no outcome (for example the agent confirms a site and hangs up). This is contact history, as you asked; it adds a few closed tickets a night to the IoT Support Dashboard. |

## Data dictionary (new and changed names)

| Name | Where | Meaning | Retention / sensitivity |
|---|---|---|---|
| OohCallRecords | Cosmos container (new) | One document per call: callId, siteNo, siteName, operatorId, operatorName, startedAt, lastActivityAt, status (open or finalised), finalisedAt, finalReason, issues | Same as OohAuditLog. Holds the agent's name and the customer's words: internal only. |
| callId | call record, /api/sites/:siteNo/confirm response, /api/outcomes body | "call-" plus a random id; identifies one call | none |
| issueKey | browser flow state, call record, /api/outcomes body | "i1", "i2"... per issue within a call | none |
| finalReason | call record | end-call, another-issue, left-screen, site-change, idle | none |
| OOH_CALL_IDLE_MIN | environment | idle minutes before automatic finalise (default 20) | none |
| ooh_call_record | Zendesk tag | marks a closed contact-history ticket created by the call record | none |
| [OOH CALL RECORD] | Zendesk internal comment prefix | the published conversation | internal |
| closeOnCreate | /api/outcomes body | create the ticket already solved (contact-history outcomes: not controlled here, referred to service contractor) | none |
| isP1 | site tickets payload, /api/tickets/:id/view | ticket carries the ooh_p1 tag | none |
| /ticket/:id | page route (new) | in-app ticket page, opened in a new tab | requires sign-in |
| /api/tickets/:id/view | API (new) | subject, status (plain words), isP1, fromOoh, times, thread; never a Zendesk URL | requires sign-in |
| /api/calls/:id/progress, /api/calls/:id/finalise | API (new) | call record updates; finalise reason must be one of end-call, another-issue, left-screen, site-change | requires sign-in; operator-bound |
| kSel, ov, crit, kOn, kOther | kitchen flow state | chosen equipment, override answer, service answer, power-on answer, "not on the list" words | browser only |
| schEq, schTimes, schKind, schMore | timetable request state (kitchen, fans) | equipment, days and times, once or permanent, anything else | written to the ticket |
| /guides/powerpause-contractor-info.html | static file (new) | the PowerPause guide, as supplied, 9 pages | requires sign-in |

## Test scripts and test data (for the end-to-end run after build)

Test data: fixture sites 8889 (Fryer and Bain-marie not reporting; the build adds it to data/fixtures), 8888 (five smart circuits: Fryer should have come on, Bain-marie off on timetable, Dishwasher meant to stay on, Glass washer on, Pot wash on but no power), 6750 (older site, one circuit not reporting), 6832 (older site, two circuits connecting), 6749 and 6360 (outside lighting online and offline), 6851 (fans), 6771 (wall unit offline), 5198 (no wall unit), 6772 (one equipment group offline). Typed words: "The kitchen is dead". Timetable request: "Saturday, on from 10:00 for a breakfast event", every week.

| ID | Script | Expected |
|---|---|---|
| R5-01 | 8889: Kitchen, Several / all of it | Override step with "aren't connecting to us... The override on the PowerPause panel still works", the interlock line for both, the guide link; no P1 button |
| R5-02 | R5-01, then "Yes, it's come on" | Ticket created at once (no button), green script quotes the reference, "What happened" card below, end-of-call block; no red anywhere |
| R5-03 | R5-01, "No, it hasn't come on", "Yes, it's needed now", Raise the P1 | Solid red P1 warning before; after: P1 raised, ticket ooh_p1, recap below the script; no "press the button in the meantime" tip |
| R5-04 | R5-01, "No, it hasn't come on", "No, it can wait" | Connection questions in the new colours with teal answers |
| R5-05 | 8888: Fryer, "They can't find the panel", "Yes" | P1 confirm step, "we can't use the override" |
| R5-06 | 8888: Bain-marie, "we need it at different times", Continue with nothing filled | Red line asking for days and times and once or every week; no ticket |
| R5-07 | R5-06 filled in, Every week, Continue | Confirmation only, reference, "next working day", "check it with your management first"; ticket detail holds all four answers |
| R5-08 | 8888: Something not on this list, "the grill", Continue | Ticket created solved, "Recorded and closed", service contractor script |
| R5-09 | 8888: Glass washer, "I'll call our service contractor" | Closed record; "service contractor" |
| R5-10 | 6832: R5-02 then Raise another issue; then End call | Ticket gets exactly one [OOH CALL RECORD] comment per issue; a second End call writes nothing |
| R5-11 | 6832: confirm site, start Kitchen, close the tab | One closed call-record ticket with What we know so far and "the agent left the screen" |
| R5-12 | Set OOH_CALL_IDLE_MIN=1, confirm site, wait 2 minutes | Call record published with "no activity" |
| R5-13 | Site with an active P1 (fixture ticket with ooh_p1) | Banner shows ticket number and status, no Zendesk link; clicking opens /ticket/N in a new tab; the site page stays put |
| R5-14 | Open tickets panel at a site with OOH and non-OOH tickets | Only OOH-raised open tickets, P1 first with badge, plain status line |
| R5-15 | Whole-app text scan of the screen dump | None of: "repairs", "call back and", "ring back", "as a priority", "logs a ticket", "Log it", "Capture &", "Add another issue", "manual control button", "zendesk" |
| R5-16 | Every answer set in every journey | Under a "Customer's answer" label, teal style |
| R5-17 | 6749: lights, "No, they're still off" | Override instruction and guide link came first; P1 confirm step after |
| R5-18 | Contractor at 6832: Yes, Tongou, "Yes, it's come on" | Logged, no P1; "No, it hasn't come on" raises the P1 |

Carried from rev 4 and still required: TF-159 kitchen e2e tests (rewritten for the override-first order), the whole-app screen dump diff before the test gate, and the panel's PH-BW-2b and REFRIG-DENY-b checks. The rev 4 panel asked for a pre-build check of the live-read switch: in this codebase it is the TUYA_READ_ENABLED environment variable, not a feature-flag store, and it must be read from the deployment and recorded on the build ticket.

## How the customer-experience aims are met

| Aim (discovery and your reviews) | Where you can see it |
|---|---|
| A P1 is never missed when the kitchen is needed for service | Scenario 1 and 3: override fails, Yes, P1 confirm |
| A P1 is never raised when the customer can fix it themselves | Override step on every circuit; lighting and contractor too |
| The agent always has words to say | Every step and every outcome starts with the green script |
| The agent never has to decide to log | No log button anywhere; end-of-call block |
| The ticket number is always shown | "What happened" card, P1 banner, open-tickets panel, call so far |
| Clear what came from the site | "From this site's equipment list" note and highlighted names |
| The agent knows which buttons are the customer's answers | Teal answers under "Customer's answer" |
| No dead end on "not urgent" | Timetable request collects first; confirmation after |

## Open flags for build

1. A new Cosmos container, OohCallRecords, must exist in production before release (the app role cannot create it). Until it exists the call record still works in memory but is not durable across a restart.
2. The IoT team should confirm they are happy to see closed "call record" tickets (tag ooh_call_record) on their dashboard.
3. Known and not changed here: the "sent, waiting to confirm" control outcome now says plainly when its ticket failed to save, instead of claiming it was logged.
4. Fixture times in the prototype (00:00, 23:59) are test data, not real timetables.

*Design rev 5 by ooh-triage-dashboard-R1-mvu3frog (design doer) · 2026-10-29 · revs 1 to 3 by mvrygaux, rev 4 by mvtv1w9k*
