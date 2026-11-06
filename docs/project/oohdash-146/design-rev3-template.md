<!-- gate:contract
TICKET: OOHDASH-146
PHASE: design
SECTION: What this design does
It applies one agent-screen standard to every flow in the OOH Dashboard, so a call handler always reads one clear script, asks the customer a plain question, and finishes with a ticket number. Revision 3 rebuilds the prototype so that it IS the live product (version 1.6.6, which already contains the OOHDASH-159 changes) with only the genuine 146 changes applied on top. Every screen you click is the real live screen, captured from the running app, unless this document lists it as changed.
SECTION: What changed in revision 3
The earlier prototype was drawn on version 1.6.4, before 159 shipped, so it showed old behaviour: a Check and log step, a P1 before the override, "came on" raising a P1, no guide link, and the old text style. All of that is gone. The prototype now has {{NSCREENS}} screens: {{NLIVE}} taken straight from live and {{NAUTH}} authored for 146 in the live look. Your drift answers are applied: live 159 behaviour and wording everywhere, the genuine 146 changes kept and restyled, "manual override" kept, the live kitchen answer "I still think it's your equipment" kept, the live fridge P1 kept, customer details made non-blocking, "service contractor" used throughout, and the boiler-panel screens added. The live grammar slips on multi-circuit kitchens are fixed. The PowerPause guide now carries its device pictures.
SECTION: What 146 still changes compared with live
{{NDELTAS}} items, each listed with the screens it touches in section 3. The main ones: a one-off "keep it on longer or switch on earlier" for kitchen equipment (no timetable is ever written); a redesigned "Something else"; hot water ends on one closed note everywhere; equipment that is not on Lighthouse here ends on a closed note instead of a dead end; the connection-check button is removed while the automatic divert stays; the heating questions no longer ask the agent to judge; the device control window uses plain words and never says "I've logged it" without a ticket number; customer name, role and number are asked after the site is confirmed; Tonight shows plain outcome chips; and "caller" becomes "customer" in ticket text.
SECTION: Decisions amended by revision 3
D3 (call it a manual control button) is superseded: live says "manual override" on the PowerPause panel and that stays. D6 is amended for fridges: a fridge is a P1 only when stock is at risk, exactly as live, because 159 is the later decision; this is flagged for your check. D9 stays but never blocks: the customer details are asked after the site is confirmed, and the call record still starts at site confirm. Everything else from D1 to D12 stands.
SECTION: PowerPause guide pictures
The live guide shows no device pictures. The cause is plain: the guide page was published without its picture files, so the pictures could not load, and the page was also rewritten as text only. The revised guide puts eleven pictures in the right places with descriptions for screen readers: the three panel types, the Lighthouse label, both override buttons close up, the interlock panel and start buttons, and the contactor manual switch. One picture (the label) is the original from the Word cheat sheet; the others are cut from the page scans of the contractor guide, because the Word cheat sheet itself contains only the label and the logo. Pictures are shrunk to about 570 KB in total and served from the existing signed-in guide route.
SECTION: How it was checked
The real app was run in fixture mode and a script clicked every button on every flow, saving each screen. The prototype is built from those captures. A second script then read the text of every prototype screen and compared it line by line with the live screen it came from: {{NIDENT}} screens are identical, {{NEXPL}} differ and each difference maps to an item in the list, {{NNEW}} are new in 146 and each maps to an item, and there are {{NUNEXPL}} unexplained differences. A click test pressed {{NCLICKS}} buttons on the {{NSCREENS}} screens with no errors and no dead buttons.
SECTION: Your checks still open
Four things need you before the release gate. Ask Sam Day whether a contractor's "the override worked" should stay a normal ticket (159 decision J1 already says it does for the contractor flow). Confirm the new ticket subject list with the IoT helpdesk lead. Send the handler briefing note. Confirm the fridge stock-at-risk P1 stays. Three small flags came out of the guide work: two documents give different support phone numbers, the guide's "Tongou is single-phase, Owon is three-phase" pairing is read from the original page layout, and the guide's contactor-override page is from the original contractor guide and should be confirmed as wanted.
SECTION: Cost, background running and going back
No AI or per-use costs. The kitchen one-off reuses the dashboard's existing revert timer that already runs silently inside the server; nothing new runs on any computer and no screen, window or notification appears while it waits. It is behind a switch that starts off. The guide pictures add about 570 KB of static files to the container image and no running cost. Rollback is a revert of the release; cancel any booked one-offs first.
DECISION: Approve revision 3 of the design and proceed to build? | Approve - proceed to build | Block - needs changes
DETAIL: Revision 3 changes the prototype and this document only; the live app is untouched. Section 8 lists the open items; none blocks the build.
-->

# OOHDASH-146 Design: the agent-screen standard for every flow (revision 3, rebased on live v1.6.6)

Date: 2026-11-06 · Base: origin/main `916f6e3` (v1.6.6, includes OOHDASH-159) · Discovery: PR #162 (D1 to D4) · Your UI review of PR #178 (D5 to D12) · Your drift review of 2026-11-05 (items A1 to C6b, "implement your recommendations")

**Clickable prototype (the live screens, with the 146 changes applied):** [OOHDASH-146 prototype](mockups/OOHDASH-146-mockup.html) · **Revised PowerPause guide (with pictures):** [guide prototype](oohdash-146/guide/powerpause-contractor-info.html) · **Screen-text diff against live:** [OOHDASH-146-SCREEN-DIFF.md](OOHDASH-146-SCREEN-DIFF.md)

## 1. What changed in revision 3

| Part | What was done |
|---|---|
| A. Rebased on live | The prototype is no longer drawn by hand. It was rebuilt from the real v1.6.6 app (fixture mode, writes enabled, as in production) by clicking every button on every flow and saving the screens. Live 159 behaviour and wording are adopted everywhere: automatic save and the "What happened" card, the live P1 confirm step, override first on every kitchen circuit, "come on" is captured and "hasn't" is its own P1, the full override script with the guide link, the equipment picker with "Something not on this list", the timetable form with the Area Manager line, ticket numbers as links, the open-tickets panel, the P1 banner, and the 159 text key. |
| B. Genuine 146 changes kept | Kitchen one-off (D8), Something else (D5, D11), connection-check button removed with the divert kept (D10), "caller" becomes "customer" (B4), hot water closed note (D7), not-on-Lighthouse closed notes (D6), thermostat heating questions (D12), plain control-window wording (D2), Tonight chips, glossary. Each is restyled to the live look. |
| C. Your decisions | C1 "manual override" kept. C2 "I still think it's your equipment" kept. C3 fridge P1 only for stock at risk, as live, flagged for you. C4 customer details non-blocking. C5 "service contractor" everywhere. C6a boiler-panel screens added. C6b the call-record recovery banner is left as live and is not drawn. |
| D. Grammar | Live says "can't show whether them are on" and "has the kitchen — pot wash and kitchen — fryers come on?" on multi-circuit kitchens. New wording: "can't show whether they are on" and "have the kitchen — pot wash and kitchen — fryers come on?". |
| E. Guide pictures | The PowerPause guide gets its pictures, in the right places, with descriptions (section 5). |

## 2. Decisions

| # | Decision | Status in revision 3 |
|---|---|---|
| D1 | One release for all flows | Unchanged. |
| D2 | Device control: fix the script and glossary only, keep today's ticket model | Unchanged. The window uses plain words and "I've logged it" only when a ticket number came back (section 8). |
| D3 | "Override" becomes "manual control button" | **Superseded by 159 and your answer C1.** Live wording "manual override" on the PowerPause panel stays everywhere. |
| D4 | Fix the repeated "not confirmed yet" pop-up | Unchanged (section 11). Not visible on a screen. |
| D5 | Customer-answerable options only | Unchanged. Live 159 already follows it in the kitchen, lighting, fans and contractor flows; 146 applies it to the remaining agent buttons (hot water, thermostat heating, Something else). |
| D6 | Equipment Lighthouse does not control: own contractor, ticket created solved | Unchanged, with one amendment. **D6 amended: fridges are P1 only for stock at risk, as live** (159 is the later decision). Flagged as a James check item (Q4). Live kitchen "not on this list" and fridge "just a query" already end on a closed ticket; 146 extends that to lighting, fans, heating and air conditioning where the site has none. |
| D7 | Hot water: no control, no temperature reading, never a P1 | Unchanged. All eleven hot water readings end on one closed note. |
| D8 | Kitchen one-off for the next time only | Unchanged in intent, restyled to the live look: the booked card uses the live "What happened" card, the automatic ticket and the ticket link. A permanent change goes to the live timetable form, which keeps its Area Manager line. |
| D9 | Customer name, role and number on every ticket | **Amended: non-blocking.** Asked on the site screen after the site is confirmed; the call record still starts at site confirm (E1); the issue buttons are never held back; "The customer won't give these" records that instead. |
| D10 | Connection check: no standalone entry, keep the divert | Unchanged. Corrected divert wording replaces the false "Everything at this site is online". |
| D11 | Something else: remove the "it is controlled" dead end | Unchanged. |
| D12 | Thermostat heating stays in 146 | Unchanged. The pub boiler-panel screens are shown as live (C6a). |

## 3. What differs from live (the complete list)

Everything not listed here is the live v1.6.6 screen, word for word. The checks in section 4 prove it.

{{DIFFTABLE}}

### Screens that differ, by item

{{SCREENTABLE}}

### Live screens replaced or removed

| Live screens | What happens to them | Item |
|---|---|---|
| Hot water first screen with "Pass it to the IoT team" and "Scope guidance (boiler fault?)" (all eleven readings) | Replaced by one closed note per reading | R3 |
| Something else: "Check if it's Lighthouse-controlled", "Pass it to the IoT team as described", the "controlled, back to the issue picker" dead end | Replaced by the customer question and the unchanged P1 path | R2 |
| Connection check: the all-online screen and the "Everything at this site is online" divert card | Removed (not reachable without the button) and replaced | R5 |
| Lighting, fans and heating with none on Lighthouse: "Continue under Something else" | Replaced by a closed note | R4 |
| Thermostat heating: "Give the radiator advice", "Raise the setpoint anyway", "Adjust the setpoint anyway" | Replaced by the radiator question | R6 |
| Control window labelled "Raise setpoint", "Send to device" | Plain wording | R7 |
| Offline banner "Run connection check" button | Removed | R5 |

Not drawn, left as live: the call-record recovery banner (C6b); the transient "Sending to the heating controls…" screens; the control window left open between crawl steps.

## 4. How the prototype was made and proved

1. **Capture.** `docs/project/oohdash-146/crawl.mjs` runs the real app (origin/main 916f6e3, fixture mode, `WRITES_DISABLED=false`, as in production) and presses every answer button on every flow, saving each screen's html and text. Scenarios cover the sites in the earlier screen dump (6832, 8888, 6749, 6360, 6961, 6851, 7004, 5198, 6771 to 6773, 6218, 7001, 7003, 9001) plus injected states (nine hot water readings, four kitchen verdicts, room temperatures, equipment removed).
2. **Build.** `build-proto.cjs` assembles the prototype: live screens as captured (with example site name, house number and ticket numbers, item N1), the changed and new screens authored in the same markup by `live-helpers.cjs`, and the live stylesheet inlined.
3. **Prove.** `verify-proto.mjs` loads the finished prototype, reads every screen's text and compares it with the live screen it came from, then clicks every button.

{{RESULTS}}

## 5. PowerPause guide: pictures in the right places (new scope, E)

### 5.1 What is wrong today

Live serves `public/guides/powerpause-contractor-info.html`, a text-only page written for 159. The pictures from the original documents never reached it: the nine page scans it was designed around sit in `docs/project/guides/powerpause/` and are not under `public/`, and the container image copies only `public/`. So the contractor flow says "The guide has photos of the panels and both buttons", and the guide has none.

### 5.2 Design

Same text and structure as the live guide, plus pictures, so a contractor can recognise the panel and the right button before touching anything. Pictures sit full width on a phone and two across on a wide screen, on a white card so they read in dark mode, each with a one-line caption and a longer description for screen readers.

| # | Picture | File | Where it sits | Source |
|---|---|---|---|---|
| 1 | A kitchen PowerPause panel on the wall | `kitchen-powerpause-panel.jpg` | Finding the panel | Contractor guide page 4 (cut out) |
| 2 | A ceiling panel (13A sockets still below it) | `ceiling-panel.jpg` | Finding the panel | Contractor guide page 6 |
| 3 | A bar panel with labelled circuits | `bar-panel.jpg` | Finding the panel | Contractor guide page 7 |
| 4 | The blue Lighthouse PowerPause label | `lighthouse-label.jpg` | After "Every appliance has a label" | **Original image from "Lighthouse PowerPause Cheat Sheet.docx"** (the only picture in that document apart from the logo) |
| 5 | Tongou units with the override button marked | `tongou-override-photo.jpg` | Using the override, Tongou | Contractor guide page 2 |
| 6 | Tongou close-up with arrow ("press once, do not hold") | `override-single-phase.jpg` | Using the override, Tongou | Contractor guide page 8 |
| 7 | Owon meter with the override button marked | `owon-override-photo.jpg` | Using the override, Owon | Contractor guide page 2 |
| 8 | Owon close-up with arrow | `override-three-phase.jpg` | Using the override, Owon | Contractor guide page 8 |
| 9 | Interlock panel, ON light and START for gantry and fryers | `interlock-panel.jpg` | Fryers and heated gantries: the start button | Contractor guide page 5 |
| 10 | A second style of interlock panel (ENABLED and ON) | `interlock-start-buttons.jpg` | Same section | Contractor guide page 1 |
| 11 | Contactor with its manual switch marked | `contactor-manual-button.jpg` | If the PowerPause itself is faulty | Contractor guide page 9 |

The Word cheat sheet is the non-contractor version; it holds one picture (the label) and the logo, so ten of the eleven pictures are cut from the contractor guide's page scans (1075 by 1521 pixels), which are the only place those photos exist in the project files. They are re-sized to at most 900 pixels wide and saved as JPEG at 82 percent quality: 13 to 78 KB each, 524 KB in total, against 980 KB for the nine full page scans. The "Tongou is single-phase, Owon is three-phase" pairing is read from page 8 of the contractor guide and is flagged for confirmation (Q6). Added text: a short "If the PowerPause itself is faulty: the contactor" section from page 9 of the contractor guide (flag Q7), and the support email. No phone number is added, because the documents disagree (flag Q5).

Everything else in the guide text is unchanged. The prototype of the revised guide is `docs/project/oohdash-146/guide/powerpause-contractor-info.html` (pictures beside it); the standalone single-file copy for review is `oohdash-146-powerpause-guide.html`.

### 5.3 Build instruction

| # | Do |
|---|---|
| G-1 | Copy `docs/project/oohdash-146/guide/powerpause-contractor-info.html` over `public/guides/powerpause-contractor-info.html`. |
| G-2 | Copy the eleven files in `docs/project/oohdash-146/guide/powerpause/*.jpg` to `public/guides/powerpause/`. Do not copy `images.json`. |
| G-3 | No code change to `server.js`: the picture URLs are `/guides/powerpause/<name>.jpg`, two path segments, so the existing `/guides/:file` route (single `.html` file only) does not match them and they fall through to `express.static(public)`, which is already behind `requireAuth`. The Dockerfile already copies all of `public/`. |
| G-4 | Remove the now-unused `docs/project/guides/powerpause/page-*.jpg` and `docs/project/guides/powerpause-contractor-info.html` (the nine page scans stay as source material under `docs/`; they are never served). Keep them if the team wants the originals. |
| G-5 | Add `test/guide-pictures.test.js` and a Playwright check (section 9): signed in, the guide returns 200 and every `img` has a non-zero natural width; signed out, a picture URL is refused like the page; every `img` has an `alt` of 20 or more characters; no picture over 100 KB. |
| G-6 | Cost: static files only, about 524 KB added to the image, no running cost. Nothing polls, nothing runs in the background. |

## 6. Build plan (file by file, against origin/main 916f6e3)

The line numbers in the retained sections 8 to 14 were taken on 7bd03ba; the build re-finds each on 916f6e3. Where 159 already shipped a behaviour, the build changes nothing.

| # | File | Change |
|---|---|---|
| B1 | `public/js/flows.js` hot water | R3: remove the two agent buttons; the first screen is the closed note for every reading, with the reading line on the ticket. Both twins (`dhwOverrideOutcome` here and in `services/tb-device.js`) change together (parity test). |
| B2 | `public/js/flows.js` Something else | R2: the customer question, routing to that issue's own flow (`startFlow(key, words, {carryNotes:true})`) or the closed note; the P1 path and the 153 sentence unchanged. |
| B3 | `public/js/flows.js` not on Lighthouse | R4: lighting, fans, heating and air conditioning with none at the site use the existing `outcomeScope` with the "Which equipment is it?" box, as live kitchen does; no "Continue under Something else". |
| B4 | `public/js/flows.js` thermostat heating | R6: replace the agent buttons with the radiator question and the closed or logged outcomes. |
| B5 | `public/js/flows.js` kitchen | R1: the first question and the one-off screens (section 9), and the "different times" answer goes to the next-times step. The live equipment picker, override script and P1 flow are untouched. |
| B6 | `public/js/control.js` | R7: plain titles, verbs, hold text and Says (section 10); `ctlRelease` branched on ticket success with the duplicate guard (section 8); D4 latch (section 11). |
| B7 | `public/js/views.js` | R5 and R13: remove the "Run connection check" button and its hint wording; R8: customer details card and the customer line; R9: Tonight chips (section 13); R1: the one-off banner with Cancel. |
| B8 | `public/js/flows.js` KEYWORDS | R5: remove the `connectivity` keyword entry; keep the hidden connectivity flow for the divert. |
| B9 | `public/js/flows.js` connection check | R5: the divert for a single offline device says which device is offline and never "Everything at this site is online". |
| B10 | `public/js/app.js`, `routes/api.js` | R8 customer contact sent on every ticket post, never in the P1 text, Tonight or the audit log; R10 "customer" in `views.js:99`, `zendesk.js:255, 388-389, 588`. |
| B11 | `services/zendesk.js`, `routes/api.js` | Closed-on-create (section 7): only where live does not already close the ticket (lighting, fans, heating, air conditioning, hot water). |
| B12 | `routes/api.js:184` and `views.js` scope tags | Hot water scope level is never `ctl` (D7). |
| B13 | `routes/api.js`, `services/oneoffs.js` (new), `services/overrides.js`, `config.js` | Kitchen one-off server (section 9). |
| B14 | `public/js/flows.js` lighting | R12: "manual override" in place of "on-site switch" in the known-line and ticket text. |
| B15 | `public/js/flows.js` kitchen sentences | G1: the two grammar fixes for several circuits. |
| B16 | `public/guides/` | Section 5.3. |
| B17 | `public/css/styles.css` | `.callerline`, `.oneoff-banner` only. |
| B18 | IoT Support Dashboard (separate repo, own small gate) | `OUTCOME_LABELS`: `'boiler-boost': 'heating changed'`; closed notes stay "advice given". |

Rules for the build: keep every `data-testid` the 159 tests rely on (`after-say`, `after-ticket`, `ticket-box`, `p1-confirm-warning`, `record-outcome`, `known-so-far`, `customer-answers`, `ask-customer`, `override-guide-link`, `sched-*`, `end-block`, `publish-note`). The six OOHDASH-153 sentences stay literal. The ticket body anchors `Operator:`, `Caller's words:` and `Outcome:` are not renamed (the IoT Support Dashboard parses them); only the display wording in R10 changes. Straight quotes as JS delimiters (a curly quote shipped as a SyntaxError in v1.5.3).

## 7. D6: closed tickets (what live already does, what 146 adds)

Live 159 already creates the ticket closed for: kitchen "Something not on this list", kitchen appliance faults ("I'll call our service contractor"), fridge "just a query", and the Something else "not on Lighthouse" answers. 146 adds the same for hot water at every site, and for lighting, fans, heating and air conditioning where the site has none. The mechanism is the live one; no new server capability is needed beyond making those flows use it.

The Say always names who to call: "please contact your service contractor through your usual route" (C5). The ticket records the call for the history only.

## 8. `ctlRelease`: branched on ticket success (D2, kept)

{{S7}}

## 9. D8: kitchen one-off change for the next time only (restyled to the live look)

Screens: K-what, K-when-pick, K-when, K-fine, K-later, K-earlier, K-attend-later, K-attend-earlier, K-confirm-later, K-confirm-earlier, K-booked-later, K-booked-earlier, K-attend-no, K-book-fail, K-cancelled, K-when-unknown and the banner on the site screen (prototype group "Kitchen: one-off change for next time").

{{S8}}

## 10. D9: customer details (non-blocking)

| Item | Design |
|---|---|
| Where | A card at the top of the site screen after the site is confirmed ("Who's calling?"), above the issue buttons. The issue buttons stay available throughout. The call record starts at site confirm as in live (E1); the details are added to it when saved. |
| Fields | Customer's name (required, up to 80 characters); their role (optional, up to 40; suggestions: duty manager, general manager, chef, staff, contractor); best contact number (required, 7 to 20 characters of digits, spaces, plus, brackets and dashes). The contractor flow fills the role as "Contractor". |
| Declined | "The customer won't give these" records `OohCustomerDeclined: true`; the ticket line then reads "Customer contact: declined to give details". The call is never blocked. |
| Held in the browser | `state.caller` in memory only, kept for every issue in the call, cleared at End call. Never in sessionStorage or localStorage. A line "Priya Shah · duty manager · 07700 900123 (Change)" shows above every issue screen once saved. |
| Sent and stored | A `customerContact` object on every ticket-creating post; one labelled line in the ticket's internal `[TRG]` first comment after the Operator line: "Customer contact: Priya Shah (duty manager) · 07700 900123". Not in the ticket subject, the P1 text or SMS, `OohSmsLog`, the OOH audit log, Tonight, the notes box or any OOH database. |
| Why not the Zendesk requester | Making the customer the requester creates a Zendesk user for every caller and lets customer-facing triggers email them. The requester stays the API account. |

## 11. Control window wording (kept)

{{S10}}

## 12. D4: the one-line latch for `startCtlBgWatch` (kept)

{{S11}}

## 13. Tonight chips (kept)

{{S13}}

## 14. Glossary

| Use | Never | Where |
|---|---|---|
| Ask the customer: … (question line inside the green box) | "Scope guidance", "Capture & escalate", "anyway", "Check if…", "Back to the issue picker" | every flow (D5) |
| please contact your service contractor through your usual route | "repairs engineer", "refrigeration engineer", "boiler or service engineer", "boiler company" | closed notes (C5, D6) |
| manual override (on the PowerPause panel) | "manual control button", "on-site switch" | contractor, kitchen, lighting, fans (C1, R12) |
| Recorded and closed (contact history) | "not Lighthouse" | closed notes, Tonight |
| one-off, booked, for the next time only | boost (for kitchen), schedule, override | kitchen (D8) |
| switched on or off at the controls (hot water) | Override ON / OFF, overridden | hot water |
| turn heating off (down to 5°C) | frost-hold | thermostats, control window |
| it goes back to normal at HH:MM | Hold active, reverts at, revert, durable | control window |
| target temperature | setpoint | thermostats, control window |
| customer | caller | everywhere, including ticket text (R10) |
| Lighthouse unit (on the wall) | gateway, hub | connection check |

## 15. Risks and open questions

| # | Item | Handling |
|---|---|---|
| R1 | Ticket subjects change; a helpdesk saved search on old text would miss new tickets. | Types, tags, priority and the `[TRG]` anchors are unchanged. Pre-release: the IoT helpdesk lead confirms the new subject list (owner: James). |
| R2 | Handlers meet a new details step, new kitchen questions and a changed Something else. | Handler briefing note drafted at the release gate; James sends it before go-live (owner: James). |
| R3 | e2e churn: Playwright specs that click the old hot water buttons, the connection banner button, the old thermostat buttons or the old Something else buttons. | Listed in section 16; each updated; new tests proved to fail on the old code. |
| R4 | Hot water wording lives in two twins. | B1 changes both; parity test. |
| R5 | Kitchen one-off switches real equipment later with nobody watching the dashboard. | Attended question, limits, never late, missed reported, failed switch-off pages the on-duty manager, off by default, proven end to end before it is turned on. |
| R6 | The one-off depends on the live kitchen read and the Tuya switch path, both unproven in production. | It does not appear until both are on and proven; time requests go to the live timetable form meanwhile. |
| R7 | Customer name and number are personal data. | Zendesk internal comment only; browser memory only; never in OOH stores, logs, Tonight or SMS. |
| R8 | Rollback. | Revert the release (previous image by digest). Cancel any booked one-offs from the site screen first. |
| Q1 | A contractor's "the override worked" outcome: 159 decision J1 already records it as a normal ticket for the contractor flow. | Ask Sam Day only if you want the other flows to match (owner: James). |
| Q2 | Which solved status should closed notes use. | Live already creates closed tickets; recommended: the same status. IoT helpdesk lead confirms; not blocking. |
| Q3 | Should customer details later move to Zendesk requester or custom fields. | Recommended no for this release. |
| Q4 | **Fridge stock at risk is a P1 (live), reversing the 146 D6 wording that fridges are never a P1.** | Kept as live because 159 is the later decision. James to confirm. |
| Q5 | The support phone number differs between documents: the Word cheat sheet says 023 8144 0228, the contractor guide says 023 814 0228, and the label says +44 (0)23 814 0228. The P1 failure screen uses 023 814 0228 (from the 146 failure-path design). | Confirm the right number before the guide or the failure screen carries one. |
| Q6 | The guide pairs Tongou with single-phase and Owon with three-phase. | Read from page 8 of the contractor guide; Sam Day to confirm. |
| Q7 | The guide's contactor-override section (page 9 of the contractor guide) tells a contractor how to run an appliance when the PowerPause is faulty. | It is in the original; confirm it should be in the signed-in guide. |

## 16. Tests the build must add (and prove they fail on the old code)

| ID | Type | Case |
|---|---|---|
| GOLD-146 | unit, golden | vm-load `flows.js` and `control.js`; render each changed screen listed in section 3 with fixed data and compare with `test/fixtures/oohdash-146-screens.json` (generated from `docs/project/oohdash-146/proto-nodes.json` and the prototype text). Unchanged live screens are covered by the existing 159 tests. |
| LEX-146 | unit | No rendered screen contains: caller, setpoint, frost-hold, "manual control button", "on-site switch", "repairs engineer", "refrigeration engineer", "boiler or service engineer", "Check and log", device-id patterns. |
| D5-146 | unit | No rendered button label is one of the removed agent choices: "Scope guidance", "Give the radiator advice", "Raise the setpoint anyway", "Adjust the setpoint anyway", "Check if it's Lighthouse-controlled", "Pass it to the IoT team as described", "Continue under Something else", "Run connection check". |
| HW-146 | unit + route | Every hot water reading ends on the closed note; hot water scope level is never `ctl`; the twins agree. |
| NLH-146 | e2e | Lighting, fans, heating and air conditioning with none at the site end on a closed note with the "Which equipment is it?" box. |
| CN-146 | e2e | No "Run connection check" button; typing "router" or "offline" suggests nothing; a device offline at an otherwise online site never shows "Everything at this site is showing online". |
| O-146 | e2e | Something else: each answer starts that flow or ends on the closed note; "None of these" then "Yes, it's urgent" raises the 153 P1. |
| HEAT-146 | e2e | Room below target, "Warmer" or "It's not working": the radiator question; warm gives the closed note, cold gives a ticket. |
| CD-146 | e2e + route | Details card after site confirm; issue buttons never blocked; `[TRG]` has "Customer contact: …"; the P1 text, `OohSmsLog`, audit entry, Tonight row and sessionStorage contain no phone number; the declined path. |
| ONE-1..7 | unit, worker, route, e2e | As in section 9: booking refusals, worker steps and lease, offline retry then missed, switch-off failure P1, cancel, no timetable keys written, booked wording only on a 200 with a booking id. |
| REL-1..4 | unit | `ctlRelease` failure and retry, duplicate guard, site match, in-flight map empties. |
| BG-1 | unit | The "Not confirmed yet" toast fires once in 20 ticks. |
| TN-1 | unit | `tonightChip` never returns a raw code, including the one-off outcomes and the boiler-boost key. |
| G1-146 | unit | Multi-circuit kitchen sentences read "whether they are on" and "have the … come on?". |
| R10-146 | unit | Ticket subject, rewrite line, late-change note and status label say "customer". |
| GUIDE-1 | unit + e2e | Section 5.3 G-5. |
| U-upd | existing | Update the specs that click the old hot water, thermostat, Something else or connection-banner buttons. |

## 17. Data dictionary (new and changed names)

{{S17}}

## 18. Test scripts and test data for the test gate

**Screen-text diff (reusable).** `crawl.mjs` with `roots-*.json` captures the live app; `build-proto.cjs` builds; `verify-proto.mjs` compares and click-tests. Run the app: `PORT=3093 AUTH_MODE=dev DATA_MODE=fixture WRITES_DISABLED=false node server.js`, then run the three scripts. The pre-test-gate comparison (screen-text-diff-before-test-gate) is this script pointed at the built release instead of the prototype.

**Test data (fixture sites; injections as noted).**

| Flow | Site | What it gives |
|---|---|---|
| Customer details | 6832 | saved, declined |
| Hot water | 6832 with `boilerControl.dhwOverride` set to each of nine settings, 6360 | every hot water closed note |
| Kitchen, live equipment list | 8888 (fryer, glass washer, dishwasher, pot wash, bain-marie); glass washer verdict injected to B-unscheduled, B-outside, off-unknown, fallback | live screens and the D8 entry |
| Kitchen, older site | 6832 | live two-circuit screens, grammar fixes |
| Kitchen one-off | 8888 with `OOH_KITCHEN_ONEOFF_ENABLED=true`; fake clock in unit tests | on later, on earlier, attended no, cancel, offline at start, switch-off failure (stub) |
| Not on Lighthouse | 6832 with kitchen, lighting, fan or heating devices removed | closed notes |
| Outside lighting, fans, fridges | 6749, 6360, 6961; 6851 | live flows |
| Connection check (divert only) | 7004 with one thermostat offline, 6771, 6772, 6773, 5198 | |
| Contractor | 6832; 6786 via `siteNo` | |
| Something else, air conditioning | 6832, 6218 | |
| Thermostats | 6832 (inject 16 against 20, and 19.5 against 20), 7001, 7003 | |
| Pub boiler panel | 9001 (no reading); 9001 with `boilerControl.heating` injected (zone state, duration choices) | |
| Control window | 6832, 6961 | |
| Callback, Tonight, duplicate number | 6832, 9003, 6758 | |

**Manual test script (any agent, fixture mode).**
1. New call, find 6832, confirm: the "Who's calling?" card shows above the issue buttons; start an issue without saving it (it must work); then save Priya Shah, duty manager, 07700 900123: the customer line shows above every issue screen.
2. Kitchen 8888: "I need it at a different time", Fryer, "On later tonight", "Until midnight", "Yes, someone will be there", check card, Book it: booked card with the ticket link and Cancel; site banner; Tonight shows "one-off booked".
3. Kitchen 8888: "It's not working", Fryer: the live override script with the guide link; "Yes, it's come on" gives the live captured ticket, no P1.
4. Hot water at 6832: straight to the closed note with "service contractor"; the ticket is created closed.
5. Fridges 6851: "Yes, stock is at risk" gives the live P1 (flag Q4); "No, it's just a query" gives the closed note.
6. Something else, "Cellar cooler alarm going off": "Kitchen equipment" starts the kitchen flow; "Outside lighting" at a site without it gives the closed note; "None of these", "Yes, it's urgent" gives the 153 P1.
7. Site 6771: the offline banner has no button; 7004 with a thermostat offline, heating, "the bar thermostat isn't connecting" (never "everything is online").
8. Thermostat 6832 (16 against 20): "It's not working": "Are the radiators in that area warm?"
9. Control window: "Make it warmer", Send: plain wording; block `/api/outcomes` and press "Done, carry on": "Try logging again", never "I've logged it".
10. Block `/api/outcomes` and raise a P1: "The P1 has NOT been raised", no ticket number; allow and retry.
11. Open the guide from the override screen: eleven pictures load, each with its description.
12. Search every screen above for the LEX-146 and D5-146 word lists: none.

## 19. How the customer-experience aims are met (where to see them in the prototype)

| Aim | Where it is delivered | Prototype group |
|---|---|---|
| The agent never has to diagnose | R2, R3, R6 and live 159 | Something else; Hot water; Heating |
| Never a dead end; always clear who to call | R3, R4, live closed notes | Not on Lighthouse here; Hot water |
| Kitchen times sorted on the call, safely | R1 | Kitchen: one-off change |
| Our team can call the customer back | R8 | Customer details |
| One unmistakable script per card | live 159 text key | any screen |
| Never say something false | R5, R7, the P1 failure screen | Connection check; Device control window |
| P1 stays fast and true | live 159 P1 confirm and after card | Kitchen; Outside lighting; Contractor |
| Plain words for non-technical agents | section 14 | any screen |
| A contractor can recognise the panel and button | R-guide (section 5) | the guide |

## 20. What does not change

No timetables, schedules or OptimumStartStop keys are written by this work; the kitchen one-off writes only the switch key the existing Turn on button writes, and a test enforces it. The control window's safety checks, three-outcome tracker and ticket model are unchanged (D2). Ticket types, tags, priority and the `ooh_p1` path are unchanged; all live 159 behaviour not listed in section 3 is unchanged.

## 21. Cost, token use and silent background running

| Part | What runs | Idle cost | Visible to the operator? | Verdict |
|---|---|---|---|---|
| Wording, closed notes, customer details | Browser code and one extra field per ticket post | None | n/a | No new cost |
| Kitchen one-off scheduling | The existing revert worker inside the server process: one store query every 30 seconds (already running since F010), plus one filter for due bookings | No AI tokens, no new subscription, no extra device calls while idle | Nothing: no window, console or notification | Meets both criteria |
| One-off steps when due | 2 to 4 device writes and reads per booking, one ticket, a few comments | Only when there is work | Results appear only in the ticket, Tonight and alerts | Bounded per booking |
| Browser control watcher | Unchanged: one status call every 15 seconds for up to 95 minutes after a slow thermostat change, inside the open tab only | Unchanged; D4 removes its repeated pop-up | Only the single "not confirmed yet" pop-up | Improved |
| Guide pictures | Static files served on request | None | n/a | About 524 KB added to the image |
| Prototype and diff tooling | Run by hand on a developer machine | None | n/a | Nothing in production |
| AI or per-use services | None | None | n/a | n/a |

Build cost is mainly browser code, one small server module for one-offs (with its tests), the guide files, and test updates. What the business gets: agents who never make a technical judgement, no dead ends, honest referrals that do not clog the IoT queue, a contact number for call-backs, a one-off for kitchen equipment without touching timetables, and a guide that shows the contractor what to press.
