<!-- gate:contract
SECTION: What this change does
OOHDASH-134. Today the 'Something else' flow can only check whether an item is on Lighthouse, or log the call for the next working day. It can never page anyone. Handlers asked for a way to raise a genuine emergency that does not fit any other tile. This design adds a third choice, "Escalate as P1 - urgent, pages on-duty manager", to the first step of that flow. It reuses the existing P1 outcome exactly as the kitchen, fridge, lighting and contractor flows already use it, so the ticket, the ooh_p1 tag, the urgent priority and the outcome card are all unchanged. Nothing on the server changes.

SECTION: What the handler will see
The first step keeps the caller-words box and the two existing buttons in the same order. A third button is added last, outlined in red so it stands out from the two routine choices but is never the obvious default. Directly under the buttons, two short lines explain when to use it: "P1 = urgent tonight and it can't wait until morning" with the four known examples (kitchen off during service, stock at risk, external lighting out after the override failed, contractor on site), and "Not a P1: anything that can wait until the next working day - use Capture and escalate instead; it is logged, not lost." Pressing the P1 button goes to the existing confirm step, which shows what will be recorded and needs a second press of "Record outcome". Only then is the P1 raised, and the standard red P1 card appears with the ticket number and a script to read to the caller.

SECTION: Code change in one paragraph
Build changes public/js/flows.js, adds one small style rule to public/css/styles.css for the red-outlined button, and adds tests. In the 'other' flow, stage 0 gains a third button that records path 'p1'. Stage 1 then calls the shared outcomeP1 helper with: subject "Something else - urgent, escalated as P1"; detail "Caller reported: (full caller text). Did not fit a specific tile; handler judged it urgent tonight."; and a P1 summary for the text message built as "Something else: " plus the trimmed caller text, with runs of spaces collapsed and cut to at most 80 characters (ending in three dots when cut). If the box is empty the summary is "Something else - see ticket" and the P1 still goes ahead, because an emergency must never be blocked by a missing description. The full caller text always stays in the ticket detail. The two existing buttons and their paths are not touched. The shared outcomeP1 helper, the P1 card and the existing P1 script wording are reused unchanged.

SECTION: Hard requirement: the same P1 signal as the proven flows
The new P1 must reach the IoT Support dashboard exactly as the existing proven P1s do (lighting and kitchen used as reference). Tracing routes/api.js lines 314 to 344, the P1 signal is decided by one thing the browser sends, the outcome type escalate-p1. From that, the server sets the ticket priority to urgent, adds the ooh_p1 tag next to the standard ooh tag, sets the same Ticket Category field and the "[OOH]" subject prefix, and calls the escalation step with the OOH origin. The new choice goes through the same outcomeP1 helper and the same request, so all of that is identical. Only three things are allowed to differ: subject, summary and detail. To keep the request truly identical in shape, the new choice sends no capture class, just like the lighting P1. A new parity test, AC6, raises a lighting P1 and a "Something else" P1 on the same test site and checks that the two requests have the same fields and type, and that the two tickets have the same priority and tags.

SECTION: Cost and silent running
No new requests, no new screens that fetch data, no background process, no timer and no AI spend. The P1 uses the same single outcome request that every other P1 already makes. The only running cost is the on-duty manager's text message, which is sent per genuine P1 by the IoT Support Dashboard, not by this app. Nothing runs while the dashboard is idle. Both criteria are fully met.

SECTION: Testing
One new Playwright spec, tests/other-p1.spec.js, copied from the outside-lighting P1 pattern. It covers: the third button and its signposting are shown (AC1); choosing it, confirming, and seeing type escalate-p1 in the request and the red P1 card (AC2); a 140-character caller text gives a summary of 80 characters or fewer while the detail keeps the full text (AC3); and the empty-box fallback summary. AC4 is covered by the existing tests in tests/additional-notes.spec.js, which use the capture path and must pass unchanged, plus one new assertion that capture still sends type capture. A small unit test, test/other-p1-summary.test.js, checks the 80-character rule using the same sandbox pattern as test/legacy-salus-flow.test.js. AC5 is all existing unit and Playwright suites green. A new AC6 (signal parity) is covered by a parity test that raises the proven lighting P1 and the new P1 on the same test site and checks that both requests carry the same fields and type, and both tickets have priority urgent and the same tags, including ooh_p1.

SECTION: Risk and rollback
Q-W4 is answered. This dashboard's own P1 text sending is log-only by design: config.js line 100 defaults SMS_PROVIDER to 'log', escalation.js line 34 only uses Twilio when it is set to 'twilio', and the live deployment (ooh-dashboard, namespace iot-services, image cdf480e) has it set to 'log'. Paging goes through the IoT Support dashboard: when it receives a ticket marked P1 it recognises the priority and texts the escalation manager. James confirmed on 16 Oct 2026 that this route is proven and works today. So the existing P1 script and card wording are accurate and are kept. The one real risk this creates is a P1 from the new choice that does not look exactly like the proven ones and so is not recognised. That is closed by the hard signal-parity requirement and the AC6 parity test. The second risk is extra pages from casual use. Four things keep it down: the button is last and outlined rather than filled; the label says it pages someone; the signposting gives the test and the alternative; and the existing confirm step needs a second deliberate press. Rollback is to redeploy the v1.4.1 image built from cdf480e. There is no data or setting to undo.

SECTION: Decisions and open questions
Four decisions for James: D1 the version number, D2 how the button is placed and styled, D3 the button label (this answers writer question Q-W7), and D4 what happens if the caller box is empty (this answers Q-W5 for this release). The writer's seven questions are listed below exactly as written. Q-W4 is ANSWERED (James, 16 Oct 2026: paging goes through the IoT Support dashboard and works today; see Risk). Q-W3, Q-W5 and Q-W7 are settled for this release by D2, D4 and D3. Q-W1, Q-W2 and Q-W6 stay open and can be answered after release without blocking Build.

Q-W1: Who covers P1-type issues during working hours, and should the signposting mention that route at all?
Q-W2: Is there a priority matrix (P2 or P3) that this button should sit within? This is still open (docs/bau-support/DISCOVERY-GATE.md:16).
Q-W3: Should the P1 button appear only after "Check if it's Lighthouse-controlled", so that handlers try the matching tile first, or straight away at step 0?
Q-W4: Is the P1 text live in production yet? If it is not, should every P1 script say "I've escalated this as urgent and our on-duty manager will call you back" until it is?
Q-W5: Should the P1 require a short reason ("why it can't wait until morning") so the on-duty manager can see why the handler judged it urgent?
Q-W6: Is "kitchen, stock, external lighting, contractor" the right set of examples, or are there other urgent cases (for example, a safety issue) that the on-duty manager wants handlers to escalate?
Q-W7: Do you accept label option A, or would you rather reuse the existing "Escalate as P1" label exactly (option B)?

DECISION: Release version (D1) | Patch release v1.4.2 (one new choice on an existing step, reusing the existing P1 outcome; ticket asks for a patch) | Minor release v1.5.0 (to flag a new handler capability)
DETAIL: Patch is recommended. No new screen, endpoint or server behaviour. The ticket targets a same-day patch and the release notes carry the communication.

DECISION: Button placement and style (D2, answers Q-W3 for this release) | Third button on step 0, last in order, red outline, signposting directly underneath | Show the P1 button only after "Check if it's Lighthouse-controlled" has been run (fewer accidental pages, but slower in a real emergency and outside the ticket's AC1)
DETAIL: The ticket's first acceptance criterion places the button at the first step. Putting it last and outlined, not filled, keeps the routine "Capture" path the natural choice, while the confirm step still guards the page.

DECISION: Button label (D3, answers Q-W7) | Option A "Escalate as P1 - urgent, pages on-duty manager" | Option B plain "Escalate as P1" (matches the existing contractor button exactly)
DETAIL: Option A states the consequence on the button itself, which is the main defence against casual use. It wraps to two lines on a phone, which is acceptable.

DECISION: Empty caller box (D4, answers Q-W5 for this release) | Allow the P1 with the fallback summary "Something else - see ticket" | Block the P1 until the handler types a short reason
DETAIL: Recommended to allow it, so a genuine emergency is never held up by typing. The fallback tells the on-duty manager to open the ticket. A required reason can follow later if Q-W5 is answered yes.
-->

# DESIGN -- OOHDASH-134
## "Escalate as P1" choice in the 'Something else' flow

**Ticket:** OOHDASH-134 (Story) | **Live:** v1.4.1 | **Base:** origin/main cdf480e | **Date:** 2026-10-16 | **Target:** release before 17:00 today
**Input:** OOHDASH-134 scope and 5 ACs; read-only discovery 2026-10-16 (no separate artefact, Discovery gate skipped by James); writer draft C:\harness-runs\iot-ooh-dash\DRAFT-oohdash-other-p1-wording-2026-10-16.md
**Prototype:** docs/project/oohdash-134-design/other-p1-mockup.html (self-contained, clickable, phone width, light and dark)

---

## 1. What the code does today (verified on cdf480e)

| Item | Where | Today |
|---|---|---|
| 'other' stage 0 | public/js/flows.js:1032-1040 | Textarea `otxt` (testid other-text), chips `other-check` (path check) and `other-capture` (path cap). Empty text becomes "(not specified)". |
| 'other' stage 1, path cap | flows.js:1044-1051 | `outcomeCaptured`, subject "General issue captured", OohCaptureClass general. Never pages. |
| Shared P1 outcome | flows.js:336-342 `outcomeP1` | Calls `finishOutcome` with type escalate-p1, issueCls red; card testid outcome-p1 and p1-dispatch-status. |
| Confirm step | flows.js:247-273 `finishOutcome` | Every outcome first shows a confirm step (testid confirm-step) with subject and detail and a "Record outcome" button (testid record-outcome). Error and retry path included. |
| Server | routes/api.js:316-344 | escalate-p1 creates the ooh_p1 tagged, urgent ticket and calls `escalateP1` with `summary: p1Summary or subject`, origin ooh-dashboard. |
| SMS body | services/escalation.js:66 | "OOH P1 - {siteName} ({siteNo}): {summary}. Ticket #{id}: {link}". No change. |
| SMS mode in this app | config.js:100 | `SMS_PROVIDER` defaults to 'log'. The text that actually pages is sent by the IoT Support Dashboard from the ooh_p1 ticket (handoff doc, Approach B). |

---

## 2. Surface specification

### 2.1 Stage 0 (changed)

Order top to bottom:

1. Question "Describe the issue in the caller's words" (unchanged).
2. Textarea `otxt` (unchanged).
3. Chip row: "Check if it's Lighthouse-controlled" (unchanged), "Capture & escalate as described" (unchanged), then the new chip "Escalate as P1 - urgent, pages on-duty manager", testid `other-p1`, class `chip p1`.
4. New signposting block, testid `other-p1-signpost`, small text, with a 3px red left border:
   - **P1 = urgent tonight and it can't wait until morning.** For example: kitchen off during service, stock at risk in a fridge or freezer, external lighting out after the override failed, or a contractor on site who needs IoT support now.
   - **Not a P1:** anything that can wait until the next working day. Use "Capture & escalate as described" instead. It is logged, not lost.

Signposting placement: the writer suggested above the button. This design puts it directly under the chip row so the routine path (type, then Capture) is not pushed down the screen. It is visible without scrolling at 375px width. On the button, the text reads beside the P1 chip, so the intent is the same.

New style rule (styles.css, next to line 104), using existing tokens only: `.chip.p1{border-color:var(--danger);color:#991B1B;background:var(--surface)}` and `.chip.p1:hover{background:var(--danger-light);color:#991B1B;border-color:var(--danger)}`. Not filled red, so it does not out-shout the routine choices. #991B1B on white passes WCAG AA contrast (about 8:1). The app has no dark theme today; the mockup shows dark only to prove the tokens would carry.

### 2.2 Stage 1, path p1 (new)

Stage-1 history line as today: "Issue: (caller text)". Then `outcomeP1(f, 'p1', {...})`:

| Field | Value |
|---|---|
| subject | Something else - urgent, escalated as P1 |
| detail | Caller reported: (full trimmed caller text, or "(not specified)"). Did not fit a specific tile; handler judged it urgent tonight. |
| p1Summary | See 2.3 |
| OohCaptureClass | not sent (null), exactly as the lighting P1, so the request matches the reference P1 field for field (section 2.5) |
| script | I've escalated this as urgent - a text has gone to our on-duty manager and someone will call you back shortly. (Existing standard P1 script, flows.js:753 and 800; accurate per James 16 Oct.) |
| card dispatch line | Unchanged shared line at flows.js:340. |

Build may use the house curly apostrophes and dashes in flows.js as the other flows do; this document is ASCII only.

The confirm step, loading state, error and retry state and P1 card are the shared ones and are not changed. The confirm step shows the subject in bold, so the handler sees "urgent, escalated as P1" before the second press.

### 2.3 p1Summary rule

1. Take the raw textarea value, trim it and collapse any run of whitespace (including line breaks) to one space.
2. If the result is empty, the summary is "Something else - see ticket".
3. Otherwise the summary is "Something else: " followed by the text. If that is longer than 80 characters, keep the first 77 and add "..." (exactly 80).
4. The detail always carries the full text, so nothing is lost.

Write this as a small named function (for example `otherP1Summary(text)`) inside flows.js so the unit test can call it through the vm sandbox.

### 2.4 Four states

| State | Behaviour |
|---|---|
| Loading | Existing "Recording the outcome..." alert after Record outcome |
| Empty | Empty caller box still allowed (D4); fallback summary |
| Error | Existing "Couldn't record the outcome" alert with Try again |
| Success | Existing red P1 card (outcome-p1) with ticket number and script |

### 2.5 P1 signal parity (hard requirement, AC6)

Trace of POST /api/outcomes for an escalate-p1 (routes/api.js:314-344, services/zendesk.js:318-358). Reference flow: lighting "Still not working" P1 (flows.js:751-756).

| Signal | Set where | Driven by | Lighting P1 | Something else P1 |
|---|---|---|---|---|
| Outcome type | browser payload | outcomeP1 | escalate-p1 | escalate-p1 (must match) |
| Ticket priority | api.js:333 | type | urgent | urgent (must match) |
| Ticket tags | api.js:334, zendesk.js:335/353 | type | ooh, ooh_p1 | ooh, ooh_p1 (must match) |
| Ticket Category field | zendesk.js:329 | always | Support Request | same (must match) |
| Subject prefix "[OOH]" | zendesk.js:350 | always | yes | yes (must match) |
| Escalation call, origin ooh-dashboard | api.js:344 | type | yes | yes (must match) |
| Payload field set | browser payload | outcomeP1 + submitPendingOutcome | siteNo, siteName, callerWords, additionalNotes, type, subject, detail, p1Summary, OohCaptureClass (null), issueLabel, issueCls | identical set (must match) |
| subject | browser | flow | External lighting not working - P1 | Something else - urgent, escalated as P1 (allowed to differ) |
| p1Summary | browser | flow | External lighting not responding | per 2.3 (allowed to differ) |
| detail | browser | flow | lighting text | per 2.2 (allowed to differ) |

The new flow must not add, rename or drop any payload field, must not send an actionId, and must not call any route other than POST /api/outcomes.

---

## 3. CX mapping

| Moment | Type | How the design handles it | Where in mockup |
|---|---|---|---|
| Caller has a real emergency that fits no tile | Great looks like | One press plus confirm, no dead end to next working day | Step 0, red chip |
| Routine "something else" call | Friction | Existing two chips unchanged and first; P1 last and outlined | Step 0 |
| About to page someone | Reassurance | Label names the consequence; confirm step repeats it | Confirm screen |
| After the P1 | Reassurance | Standard P1 card with ticket number and script | Outcome screen |

---

## 4. Data dictionary delta

No new entities or fields. Values only:

| Field | New value | Notes |
|---|---|---|
| outcome.type | escalate-p1 (existing value, new source) | From 'other' flow path p1 |
| outcome.subject | Something else - urgent, escalated as P1 | Distinguishes from "General issue captured" in reporting |
| outcome.p1Summary | "Something else: ..." up to 80 chars, or "Something else - see ticket" | Goes into the SMS body. Caller words may hold personal names; same sensitivity as existing callerWords |
| outcome.OohCaptureClass | general | Existing value |

---

## 5. Test scripts and test data

Fixture site: 6749 Angel Inn (as used by tests/outside-lighting-p1.spec.js), signed in as "Test Handler".

| ID | Steps | Expected | AC |
|---|---|---|---|
| 134-A | Open site, tile Something else | Chips other-check, other-capture, other-p1 visible in that order; other-p1-signpost visible and contains "can't wait until morning" | 1 |
| 134-B | Type "Gas smell near the cellar door, staff evacuating the kitchen", press other-p1, press record-outcome | POST /api/outcomes body type escalate-p1, subject as 2.2, p1Summary starts "Something else: Gas smell"; outcome-p1 card shown with ticket number | 2 |
| 134-C | Type a 140-character text (fixture: "Main walk-in cold room door will not close since the delivery at 18:30 and the chef says the seal has come away from the frame on the hinge side") then P1 and record | p1Summary length 80 or fewer and ends "..."; detail contains the full 140-character text | 3 |
| 134-D | Leave box empty, press P1 and record | p1Summary is "Something else - see ticket"; P1 card shown | D4 |
| 134-E | Type text, press other-capture, record | type capture, subject "General issue captured", outcome-captured card, no outcome-p1 | 4 |
| 134-F | Type text, press other-check | Scope question shown as today | 4 |
| 134-G parity | On 6749 raise the lighting "Still not working" P1 and record; start another issue, raise the Something else P1 with text and record. Capture both POST /api/outcomes bodies and both ticket ids | Same sorted key set; both type escalate-p1; both OohCaptureClass null; no actionId in either; only subject, detail, p1Summary (and the caller-dependent callerWords) differ. Both tickets: priority urgent and identical tag sets containing ooh and ooh_p1, read back from the fixture ticket store (via the site workspace tickets, or a node route test calling zendesk.ticketsForSite if the workspace does not expose priority) | 6 |
| U1-U5 | Unit: `otherP1Summary` with empty, whitespace only, short, exactly-fits, 140 chars with line breaks | Fallback; fallback; full; full; 80 chars ending "..." | 3 |
| Regression | npm test and full Playwright run | All existing suites pass, including additional-notes.spec.js unchanged | 5 |

---

## 6. Risk and rollback

| Risk | Mitigation |
|---|---|
| Casual P1s page the on-duty manager | Last position, outline style, consequence in label, signposting with "Not a P1" line, existing confirm step |
| Q-W4 (ANSWERED): who sends the text | This app's own text is log-only by design (config.js:100 default 'log'; escalation.js:34 Twilio only when 'twilio'; live deployment ooh-dashboard, namespace iot-services, image cdf480e, set to 'log'). Paging goes through the IoT Support dashboard, which recognises a P1 ticket and texts the escalation manager; confirmed proven and working by James on 2026-10-16. Existing script and card wording kept |
| New P1 not recognised by IoT Support | Hard parity requirement (2.5) and test 134-G (AC6) |
| SMS too long | Summary capped at 80 characters |
| Existing paths broken | Paths cap and check untouched; existing specs must pass |

Rollback: redeploy the v1.4.1 image built from cdf480e. No data, migration or configuration to undo.

---

## 7. Cost and benefit

Build is about 2 hours (one flow branch, one style rule, one spec, one unit test). Benefit: handlers can raise a real emergency from the catch-all tile instead of being able only to log it for the morning. Running cost: one text per genuine P1, sent by the existing IoT Support notifier. No new requests, background work or AI use.

---

## 8. Open flags for Build

- Signposting sits under the chips rather than above (section 2.1), a deliberate change from the writer's draft.
- The confirm step is shared by every flow and is not given P1-specific styling in this ticket.
- AC6 (signal parity) is added by this design on James's instruction of 2026-10-16; it should be added to the ticket's acceptance criteria.
- OohCaptureClass is deliberately null for this P1 (parity with lighting), so audit metrics will show it as unclassified rather than general.
