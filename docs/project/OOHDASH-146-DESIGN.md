<!-- gate:contract
TICKET: OOHDASH-146
PHASE: design
SECTION: What this design does
It applies one agent-screen standard to every flow in the OOH Dashboard, so a call handler always reads one clear script, asks the customer a plain question, and finishes with a ticket number. Revision 3 rebuilds the prototype so that it IS the live product (version 1.6.6, which already contains the OOHDASH-159 changes) with only the genuine 146 changes applied on top. Every screen you click is the real live screen, captured from the running app, unless this document lists it as changed.
SECTION: What changed in revision 3
The earlier prototype was drawn on version 1.6.4, before 159 shipped, so it showed old behaviour: a Check and log step, a P1 before the override, "came on" raising a P1, no guide link, and the old text style. All of that is gone. The prototype now has 298 screens: 211 taken straight from live and 87 authored for 146 in the live look. Your drift answers are applied: live 159 behaviour and wording everywhere, the genuine 146 changes kept and restyled, "manual override" kept, the live kitchen answer "I still think it's your equipment" kept, the live fridge P1 kept, customer details made non-blocking, "service contractor" used throughout, and the boiler-panel screens added. The live grammar slips on multi-circuit kitchens are fixed. The PowerPause guide now carries its device pictures.
SECTION: What 146 still changes compared with live
13 items, each listed with the screens it touches in section 3. The main ones: a one-off "keep it on longer or switch on earlier" for kitchen equipment (no timetable is ever written); a redesigned "Something else"; hot water ends on one closed note everywhere; equipment that is not on Lighthouse here ends on a closed note instead of a dead end; the connection-check button is removed while the automatic divert stays; the heating questions no longer ask the agent to judge; the device control window uses plain words and never says "I've logged it" without a ticket number; customer name, role and number are asked after the site is confirmed; Tonight shows plain outcome chips; and "caller" becomes "customer" in ticket text.
SECTION: Decisions amended by revision 3
D3 (call it a manual control button) is superseded: live says "manual override" on the PowerPause panel and that stays. D6 is amended for fridges: a fridge is a P1 only when stock is at risk, exactly as live, because 159 is the later decision; this is flagged for your check. D9 stays but never blocks: the customer details are asked after the site is confirmed, and the call record still starts at site confirm. Everything else from D1 to D12 stands.
SECTION: PowerPause guide pictures
The live guide shows no device pictures. The cause is plain: the guide page was published without its picture files, so the pictures could not load, and the page was also rewritten as text only. The revised guide puts eleven pictures in the right places with descriptions for screen readers: the three panel types, the Lighthouse label, both override buttons close up, the interlock panel and start buttons, and the contactor manual switch. One picture (the label) is the original from the Word cheat sheet; the others are cut from the page scans of the contractor guide, because the Word cheat sheet itself contains only the label and the logo. Pictures are shrunk to about 570 KB in total and served from the existing signed-in guide route.
SECTION: How it was checked
The real app was run in fixture mode and a script clicked every button on every flow, saving each screen. The prototype is built from those captures. A second script then read the text of every prototype screen and compared it line by line with the live screen it came from: 195 screens are identical, 22 differ and each difference maps to an item in the list, 81 are new in 146 and each maps to an item, and there are 0 unexplained differences. A click test pressed 2579 buttons on the 298 screens with no errors and no dead buttons.
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

| Item | What changes |
|---|---|
| R1 | **Kitchen: a one-off change for the next time (D8).** New first question when the customer needs a different time, the equipment's next times, the safety question, a check step, a booked card, a cancel path and a site banner. The live answer "It's fine, but we need it at different times" goes to this step instead of straight to the timetable form. "Different times every week" still goes to the live form. |
| R2 | **Something else, redesigned (D5, D11).** The customer picks what it is about and the dashboard starts that issue's questions; the two agent-judgement buttons and the "it is controlled, go back" dead end are gone. The urgent-or-not question and the P1 are as live. |
| R3 | **Hot water: one closed note everywhere (D5, D7).** No hot water control and no temperature reading at any site, so the two agent buttons ("Pass it to the IoT team", "Scope guidance") are removed and the screen goes straight to a closed note telling the customer to use their service contractor. The hot water state at the time of the call is added to the ticket. |
| R4 | **Not on Lighthouse here: closed note, no dead end (D6, D11).** Outside lighting, extractor fans, heating and air conditioning that are not on Lighthouse at the site now end on a closed note (with "Which equipment is it?" as in live kitchen), instead of "Continue under Something else". Live air conditioning is the same at every site; it now says so honestly where there is none. |
| R5 | **Connection check: no button, divert corrected (D10).** The "Run connection check" button on the site screen and the typed keywords are removed (the automatic divert stays). The divert no longer says "Everything at this site is online" when the customer's own thermostat is the thing that is offline. The all-online screen is no longer reachable. |
| R6 | **Heating (thermostats): customer questions, no agent buttons (D5, D12).** The agent buttons "Give the radiator advice", "Raise the setpoint anyway" and "Adjust the setpoint anyway" are replaced by plain questions to the customer (for example "Are the radiators in that area warm?"); the turn-it-off card asks the customer. The area picker and readings are live. |
| R7 | **Device control window: plain wording and an honest ticket line (D2, D4).** Window titles and buttons in plain words ("Make it warmer", "Send"), no raw device codes, and "I've logged it" only when a ticket number came back (a failed ticket shows "Try logging again"). Results use the live after-card. The repeated "not confirmed yet" pop-up shows once (not visible on a screen). |
| R8 | **Customer details: name, role and number (D9, non-blocking).** Asked on the site screen after the site is confirmed. The call record still starts at site confirm (live E1), so the issue buttons are never blocked. "The customer won't give these" records that instead. Once saved, a customer line appears above every issue screen. |
| R9 | **Tonight: plain outcome chips and "What happened".** Raw codes replaced by plain chips (including the boiler-boost key, closed note and the kitchen one-off chips). |
| R10 | **"Caller" becomes "customer" in ticket text (B4).** The words "caller" and "Caller" in ticket subjects, ticket notes and the ticket status label (views.js:99, zendesk.js:255, 388-389, 588). Shown on the "Ticket wording" screen and on the callback ticket drawer. |
| R11 | **Boiler-panel (pub heating) screens added to the prototype (C6a).** These screens are live and unchanged apart from the shared text key; they were missing from the earlier prototype. The two duration results ("Heating turned on/off") are captured from live; the transient "Sending…" screens are not shown. |
| R12 | **Outside lighting wording: "on-site switch" becomes "manual override".** Live uses "the on-site switch" in the lighting known-lines and the ticket text but "manual override" everywhere else (C1). Made consistent. |
| R13 | **Site screen "Sending nothing": offline banner hint.** The offline banner no longer offers the connection check button; its hint now reads "The questions check the equipment for you if your issue involves it." |
| G1 | **Grammar fixes on multi-circuit kitchen sites (D).** "can't show whether them are on" becomes "can't show whether they are on", and "has the kitchen — pot wash and kitchen — fryers come on?" becomes "have the kitchen — pot wash and kitchen — fryers come on?". |
| N1 | **Example data.** Site name, house number, ticket numbers and the times shown are fixed examples so every screen reads the same; the live screens use the site's own data. |

### Screens that differ, by item

| Item | Screens | Count |
|---|---|---|
| R1 | `K8888~6`, `K8888~7`, `K6832~2`, `K6832~3`, `K6832~4`, `K-what`, `K-when-pick`, `K-when`, `K-fine`, `K-later`, `K-earlier`, `K-attend-later`, `K-confirm-later`, `K-booked-later`, `K-attend-earlier`, `K-confirm-earlier`, `K-booked-earlier`, `K-attend-no`, `K-book-fail`, `K-cancelled`, `K-when-unknown`, `K-banner` | 22 |
| R2 | `O-0`, `O-choice`, `O-normal`, `O-p1`, `O-p1-after`, `O-none` | 6 |
| R3 | `HW:HW-nodhw`, `HW:HW-auto`, `HW:HW-auto-ended`, `HW:HW-on-until`, `HW:HW-off-until`, `HW:HW-on-v1`, `HW:HW-off-v1`, `HW:HW-cc-stale`, `HW:HW-cc-notreconf`, `HW:HW-cc-decode`, `HW:HW-nlh` | 11 |
| R4 | `L-none-0`, `L-none-1`, `FAN-none-0`, `FAN-none-1`, `H-none-0`, `H-none-1`, `AC-none-0`, `AC-none-1`, `O-none` | 9 |
| R5 | `CN-devoff`, `WS-offline` | 2 |
| R6 | `S6832-cold~2`, `S6832-cold~3`, `S6832-near~3`, `S-warm-buildheat`, `S-buildheat`, `S-coldrads`, `S-broken-under`, `S-broken-keepingup`, `S-off-frost`, `S-offnoact` | 10 |
| R7 | `CTL:compose-up`, `CTL:compose-up-hold`, `CTL:compose-down`, `CTL:compose-frost`, `CTL:compose-switch`, `CTL:inflight`, `CTL:slow`, `CTL:confirmed`, `CTL:confirmed-late`, `CTL:already`, `CTL:nondelivery`, `CTL:indeterminate`, `CTL:finish-up`, `CTL:finish-frost`, `CTL:finish-switch`, `CTL:finish-fail`, `CTL:release-ok`, `CTL:release-fail`, `CTL:escalate-indet`, `CTL:escalate-nondel`, `SH:p1fail` | 21 |
| R8 | `CD-ws`, `CD-saved`, `CD-declined` | 3 |
| R9 | `TONIGHT`, `TONIGHT-query` | 2 |
| R10 | `CB-list`, `CB-drawer`, `TICKET-TEXT`, `SITE-ambiguous-logged` | 4 |
| R11 | `BP9001~1`, `BP9001~2`, `BP9001~3`, `BP9001~4`, `BP9001~5`, `BP9001~6`, `BP9001-read~1`, `BP9001-read~2`, `BP9001-read~3`, `BP9001-read~4`, `BP9001-read~5`, `BP9001-read~6`, `BP9001-read~7`, `BP9001-read~8`, `BPdone-on`, `BPdone-off` | 16 |
| R12 | `L6749~2`, `L6749~3`, `L6749~4`, `L6360~2`, `L6360~3`, `L6360~4`, `L6961~3`, `L6961~4`, `L6961~6`, `L6961~7` | 10 |
| R13 | `WS-offline` | 1 |
| G1 | `K6832~4`, `K6832~14`, `K6832~15`, `K6832~16`, `K6832~17`, `K6832~29`, `K6832~30`, `K6832~31`, `K6832~32`, `K6832~33`, `K6832~38`, `K6832~39` | 12 |
| N1 | none | 0 |

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

| Check | Result |
|---|---|
| Prototype screens | 298 (211 live, 87 authored or live pages) |
| Identical to live after example-data normalisation | 195 |
| Differ from live, every difference mapped to an item | 22 |
| New in 146 (no live screen), each mapped to an item | 81 |
| **Unexplained differences** | **0** |
| Buttons clicked | 2579 |
| Dead buttons / JS errors | 0 / 0 |
| Failed P1 simulated | lands on SH:p1fail |
| Scenario-only screens (reached by the Screen picker, not by clicking from the first call screen) | 166 |

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

Today the card is built after the try/catch with "I've logged it" whatever happened (control.js:285-288), and on failure it shows "+ Add a note to ticket #undefined".

| Ticket result | Body | Say to the customer | Extra |
|---|---|---|---|
| `ticketId` not null | "…has been sent. It should take effect within about 4 minutes. We're watching it and will add the result to ticket #48216." | "That's gone to the thermostat now. It can take a few minutes to take effect. I've logged it, and we'll keep an eye on it. If it doesn't respond, we'll follow it up." | Ticket number and notes post-box |
| `ticketId` null | "…has been sent. It should take effect within about 4 minutes." | "That's gone to the thermostat now. It can take a few minutes to take effect. We'll keep an eye on it, and I'll make sure it's logged for our team." | Red alert with **Try logging again** (`ctl-release-retry`), re-sending the same body; no notes post-box without a ticket |

**Retry safety (no duplicate tickets).** Every `ctlRelease` post carries the control `actionId`, and the server already stores the ticket on that action (`control.attachTicket`, kept as `OohActionTicketId`). A guard in `routes/api.js` before `createOutcomeTicket`, for posts with `actionId` and class `control-awaiting-confirm` only: if the action already has a ticket, return it (`deduped: true`) and create nothing; if a post for the same `actionId` is in progress, wait for it (one in-memory promise per `actionId`, deleted as soon as it settles); return an existing ticket only when the action's own site matches the posted `siteNo`. "Try logging again" is disabled while sending. The one uncovered case is the server stopping between Zendesk creating the ticket and it being attached (a split second); both tickets then carry the same `[TRG]` trail, so the helpdesk can merge them. The same guard pattern, keyed by the booking id, protects the kitchen one-off ticket (section 9).

## 9. D8: kitchen one-off change for the next time only (restyled to the live look)

Screens: K-what, K-when-pick, K-when, K-fine, K-later, K-earlier, K-attend-later, K-attend-earlier, K-confirm-later, K-confirm-earlier, K-booked-later, K-booked-earlier, K-attend-no, K-book-fail, K-cancelled, K-when-unknown and the banner on the site screen (prototype group "Kitchen: one-off change for next time").

### 9.1 What the agent sees (rows K-what to K-perm)

1. A new first kitchen question when we can read the kitchen: "Ask the customer: is the equipment not working, or do you need it on at a different time?"
2. "At a different time" shows the real next times (K-when): "Your fryer's timetable switches it off at 23:00 tonight and back on at 07:00 tomorrow. Do those times work for you…?" Answers: Those times are fine (closed note), On later tonight, On earlier tomorrow, Different times every week (a permanent change), which goes to the live timetable form with its Area Manager line (timetables are never changed from here). The bain-marie "off until 17:00" card offers the same choice before its next on time.
3. How much: on later, until 30 minutes, 1 hour or 2 hours past the next off time; on earlier, from 30 minutes, 1 hour or 2 hours before the next on time.
4. Safety question: "Ask the customer: will someone be in the kitchen while it's on?" No → nothing is booked; the request is logged for the IoT team (K-attend-no).
5. Check before booking: the site and equipment name (as the control window shows them), exactly what will happen and when, and "The timetable itself isn't changed." Buttons: Book it, Change the time.
6. Booked (K-booked-later, K-booked-earlier): "Booked" means the server has stored it. The card says what will happen and when, says nothing has been switched yet, shows the ticket number, and has Cancel this booking. The Say for on later includes "Please still switch the fryer off at the fryer itself when you've finished with it."
7. While it is booked or running, the site screen shows "⏱ Fryer: booked to stay on until midnight tonight (ticket #48219). [Cancel]" for anyone who takes a call from that site (K-banner).

### 9.2 Where the times come from, and the fallback

| Source | When it is used | One-off offered? |
|---|---|---|
| Live kitchen read (`tuya.schedule.nextOn` / `nextOff`, flows.js:1932-1934; `services/tuya-read.js:416-419`) | `TUYA_READ_ENABLED=true` and the read succeeded for that circuit | Yes, if `OOH_KITCHEN_ONEOFF_ENABLED=true` |
| No live read (flag off, read failed, or the circuit isn't in `tuya-sites.json`) | Today's legacy kitchen screen; "No, it can wait" goes to K-when-unknown | No. The screen says we can't see its timetable, offers the manual override for tonight, and logs exactly what the customer needs for the IoT team. |

The server never trusts times sent by the browser: at booking it reads the circuit's next times itself from the same live read and refuses the booking if they can't be read or differ from what the screen showed by more than 5 minutes. The stored PowerPause timetable decoded from ThingsBoard is not used for bookings until it has been proven against a live device (follow-up, not in 146), because a wrong "next off" time would switch real equipment at the wrong time.

`TUYA_READ_ENABLED` may still be false in production (OOHDASH-140 shipped it dark; turning it on needs the credentials secret and your go). Until it is on, the one-off will not appear in production and every kitchen time request is logged instead. This is a stated trade-off, not a defect.

### 9.3 How it works (server)

| Part | Design |
|---|---|
| Booking call | New `POST /api/oneoffs` `{ confirmToken, siteNo, deviceId, OohOneOffKind: 'extend' or 'earlier', OohOneOffMinutes: 30, 60 or 120, OohOneOffAttended: true, customerContact, callerWords, additionalNotes }`. Checks in order: one-off switch on; site confirmation consumed (C2, as every change); kill-switch; device found at the site, online, a Tuya switch with the `switch` command (`registry.js:71`), registered (`hasPublishedState`); live times read now; limits (below). Then stores the booking and creates the ticket. |
| Limits | Up to 120 minutes. On later: start is the next off time, end is next off plus the minutes, and end must be before the next on time. On earlier: start is next on minus the minutes, must be in the future and after the next off time; there is no end step, because the timetable switches it on at its normal time anyway. Start within the next 24 hours. One booking per circuit at a time (a second is refused: "There's already a one-off booked for the fryer. Cancel it first."). |
| Where it is held | A document in the existing durable hold store `OohOverrides` (`services/overrides.js`), so it survives restarts and multiple copies of the server, with the existing lease so each step runs exactly once. New fields in section 17. Status: `booked` → `active` (on later, waiting to switch off) → `done`; on earlier: `booked` → `handed-back`; or `missed`, `cancelled`, `off-failed`. |
| Who runs it | The existing revert worker (`runWorkerOnce`, every 30 seconds, started at server start, `server.js:172`), with one new query branch for due `booked` documents. No new timer, process or service. |
| Start step, on later | From the start time, each pass reads the switch. Once the timetable has switched it off, it switches it on using the existing control dispatch internals (writes only `switchRequested`, the same key the Turn on button writes; confirms on `switch_1`), and the document becomes `active`. If the switch is still on 10 minutes after the start time (for example someone pressed the manual override), it is left on and the document becomes `active`, so the end step still switches it off at the agreed time. |
| Start step, on earlier | At the start time it switches on and confirms; the document becomes `handed-back` (the timetable carries on at its normal on time). If it is already on, nothing is sent. |
| End step (on later) | At the end time it switches off and confirms; `done`. |
| Not responding at the time | The start step retries each pass for 10 minutes after the start time, then gives up: `missed`, a ticket comment ("The one-off for the fryer did not happen: the fryer wasn't responding at 23:00. Nothing was switched."), an F021 alert `oneoff-missed`, and a red "not carried out" row in Tonight. It never switches anything more than 10 minutes late, so nobody on site is surprised hours later. A kill-switch block is handled the same way. |
| Switching off fails | The end step keeps retrying every pass and raises the existing danger alert. If the circuit is still on 10 minutes after the end time, the server raises a P1 by the existing `escalate-p1` path (a new ticket, ooh_p1 tag, OohSmsLog entry with operator "OOH automatic") so the on-duty manager is paged: kitchen equipment left powered overnight is a safety risk. This P1 is raised by the server, so the flows.js sentence count is not affected. |
| Cancel | `POST /api/oneoffs/:id/cancel`, allowed for any agent whose current call has confirmed that site (non-consuming check, as the pub heating append). `booked` → `cancelled`, nothing sent. `active` → switch off now, shown as off only when confirmed, then `cancelled`. Done or handed-back one-offs can't be cancelled (the button is hidden). A comment is added to the ticket. |
| Ticket | Created with the booking: type `capture`, class `kitchen-oneoff`, normal priority, subject "Kitchen one-off booked: fryer on until 00:00", detail stating the times, that the timetable wasn't changed, and "Please review whether the customer needs a permanent timetable change." Each later step adds an `[OOH]` comment. The ticket call uses the section 8 duplicate guard keyed by the booking id. |
| Audit and Tonight | `audit.logAction` with action type `kitchen-oneoff` and outcomes `booked`, `on`, `done`, `handed-back`, `missed`, `cancelled`, `off-failed`; Tonight chips in section 13. |
| OOHDASH-155 hook | Each one-off document carries `OohCountsAsBoost: true` and the audit action type `kitchen-oneoff`, so the boost count in OOHDASH-155 can include them without another change here. |
| Never the timetable | The one-off code may only write `switchRequested`. A source test fails the build if it references any timetable or OptimumStartStop key (`schedules`, `output1Schedule`…`output4Schedule`, `CHZ1.schedule`, `DHW.schedule`, `OptimumStartStop`). |

### 9.4 Safety notes

- It only switches power to the circuit; the appliance's own controls still decide whether it heats. The Say asks the customer to switch the appliance off at the appliance when they've finished.
- Nothing is booked unless the customer says someone will be in the kitchen.
- Limits of two hours either way, the next occasion only, within 24 hours.
- It never runs more than 10 minutes late; a missed step is reported, not retried later.
- A failed switch-off pages the on-duty manager after 10 minutes.
- It sits behind `OOH_KITCHEN_ONEOFF_ENABLED` (off by default) and the existing kill-switch. Before it is turned on, the build gate proves one booked on-later and one on-earlier one-off end to end on a fixture circuit, and one switch on and off on a live kitchen circuit with your go (the Tuya switch path in production must be proven first; earlier work found it could time out).

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

| Item | Code | Today | New |
|---|---|---|---|
| `CTL_TITLES` | 21 | Raise setpoint · Lower setpoint · Turn heating off (frost-hold) · Turn off (mode) · Turn ON · Turn OFF | Make it warmer · Make it cooler · Turn heating off · Turn off · Turn on · Turn off |
| `CTL_WHAT` (also ticket subjects) | 22 | Setpoint raise · Setpoint lower · Heating off (frost-hold) · Heating off (mode) · Switch ON · Switch OFF | Target temperature raised · Target temperature lowered · Heating turned off (5°C) · Turned off · Turned on · Turned off |
| `CTL_VERB` | 23 | raise the setpoint · lower the setpoint · set a frost-hold · turn off · switch on · switch off | raise the target temperature · lower the target temperature · turn the heating off · turn off · turn on · turn off |
| Frost compose | 125 | "5°C frost-hold" / "Heating stays off unless the building risks freezing." | "Heating off (5°C)" / "The heating stays off unless the building gets close to freezing." |
| Switch compose | 127 | "Switch → ON" / "…(single relay). Shown as done only when the device confirms." | "Turn on" / "This turns the X circuit on. We only show it as done when the switch confirms it." |
| Guardrail line | 123 | "Currently 18°C · you can set 15–21°C (±3°C of current, max 25°C). The server enforces the same limits." | "Target temperature now 18°C. You can set 15–21°C (up to 3°C either way, never above 25°C)." |
| Hold picker | 72-77 | "Hold this change?" · Until next schedule slot (default) · … | "How long should this last?" · Until its next timetable change (default) · Until 07:00 tomorrow · For 4 hours · plain explanation |
| `holdSuffix` / `holdTxt` | 152, 261, 335 | "Hold active: reverts at…" / "…will revert automatically (durable)" | "It goes back to normal at Wed 07:00." / "Goes back to normal at Wed 07:00 (automatic)" |
| Tracker and results | 146-172 | "Accepted by the gate", "Device confirming…", "Capture & escalate" | "Accepted", "Waiting for the thermostat…", "Log it for the IoT helpdesk"; result texts per the control window rows in the prototype |
| `ctlFinish` Say | 338-345 | "It'll hold until the morning schedule" (also for 4 hours) | Uses the real end time from `holdRevertText` |
| `ctlEscalate` Say | 412 | One script for both failures | Branched: not confirmed / not delivered |
| Card bodies | 286, 346, 411 | Device id | Zone name |

Not changed (safety): the confirm-window target block still shows `site → device id · zone` (OOHDASH-123 C9 wrong-site guard).

## 12. D4: the one-line latch for `startCtlBgWatch` (kept)

| Line (control.js) | Before | After |
|---|---|---|
| 299 | `let elapsed = 0;` | `let elapsed = 0; let warned = false; // OOHDASH-146 D4: warn once` |
| 311 | `} else if (action.state === 'indeterminate' && elapsed > 2 * 60000) {` | `} else if (action.state === 'indeterminate' && elapsed > 2 * 60000 && !warned) { warned = true;` |

## 13. Tonight chips (kept)

A small display function, `tonightChip(a)` and `tonightWhat(a)`; no stored data changes.

| Row | Chip today | New chip | "What happened" |
|---|---|---|---|
| `boiler-boost-on` / `-off` (not non-delivery) | in-flight / IN-FLIGHT-TIMEOUT | heating turned on / heating turned off (blue) | Heating turned on (zone 1) |
| `boiler-boost-*` with `NON-DELIVERY` | NON-DELIVERY | not delivered (red) | Tried to turn the heating on (zone 1) |
| `boiler-boost-cancel` | reverted / already-auto / superseded / left-forced / pending | back to normal (green) / changed on site (grey) / left as found (amber) / confirming… (amber) | Heating put back to normal (zone 1) |
| `boiler-revert` | confirmed / revert-failed | back to normal (green) / did not go back (red) | Heating went back to normal by itself (zone 1) |
| outcome append | appended | added to ticket (blue) | the subject |
| control confirmed and similar | raw | applied ✓ (green) | the subject |
| control `indeterminate` | raw | not confirmed (amber) | the subject |
| `scope` (closed note) | not Lighthouse | closed note (grey) | the subject |
| `kitchen-oneoff` booked / on / done / handed-back | (new) | one-off booked (blue) / one-off on (blue) / one-off done (green) / one-off done (green) | e.g. "Fryer one-off: on until midnight" |
| `kitchen-oneoff` missed / off-failed / cancelled | (new) | not carried out (red) / didn't switch off (red) / cancelled (grey) | e.g. "Glass washer one-off: not carried out (not responding at 06:00)" |
| anything unknown | the raw code | logged (grey) | the subject |
| all capture rows | "… · class: control-failure" | unchanged | the subject without " · class: …" |

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

| Name | Where | Type | Meaning | Retention / sensitivity |
|---|---|---|---|---|
| `closeOnCreate` (live) | `/api/outcomes` body | boolean | The ticket is created already solved (closed note). Live since 159; 146 reuses it, no new name. | none |
| `customerContact.OohCustomerName` | API body (all ticket posts) | string 1–80 | Customer's name | **Personal data.** Zendesk internal comment only; never in OOH stores, audit, Tonight, SMS or browser storage |
| `customerContact.OohCustomerRole` | API body | string ≤ 40, optional | Customer's role (e.g. duty manager, contractor) | Low sensitivity; as above |
| `customerContact.OohCustomerPhone` | API body | string 7–20 (digits, spaces, + ( ) -) | Best contact number for a call back | **Personal data**; as the name |
| `customerContact.OohCustomerDeclined` | API body | boolean | The customer refused to give details | none |
| `[TRG]` line "Customer contact: …" | Zendesk internal first comment | text, fixed label | The customer contact, after the Operator line | Personal data; Zendesk retention set by the IoT helpdesk |
| `state.caller` | browser memory | `{ name, role, phone, declined }` | The customer for the whole call; cleared at End call | memory only, never stored |
| `OohOneOffKind` | `OohOverrides` document | `extend` or `earlier` | Which kind of one-off | as `OohOverrides` (existing durable store) |
| `OohOneOffMinutes` | `OohOverrides` | 30, 60 or 120 | How long past the off time, or before the on time | as above |
| `OohOneOffStartAt` | `OohOverrides` | ISO time | When the start step runs | as above |
| `OohOverrideRevertAt` (reused) | `OohOverrides` | ISO time or null | End step time (on later only) | as above |
| `OohOneOffTimesSeen` | `OohOverrides` | `{ nextOff, nextOn, readAt }` | The live times the booking was based on | as above |
| `OohOneOffAttended` | `OohOverrides` | true | The customer said someone will be in the kitchen | as above |
| `OohCountsAsBoost` | `OohOverrides` | true | Hook for the OOHDASH-155 boost count | as above |
| `status` new values | `OohOverrides` | `booked`, `handed-back`, `done`, `missed`, `cancelled`, `off-failed` (plus the existing `active`) | One-off lifecycle | as above |
| `OohCaptureClass: 'kitchen-oneoff'` | ticket, audit | enum value | Booking ticket class | as today |
| audit `actionType: 'kitchen-oneoff'` | audit log | enum value | Outcomes `booked`, `on`, `done`, `handed-back`, `missed`, `cancelled`, `off-failed` | as the audit log |
| alerts `oneoff-missed`, `oneoff-off-failed` | metrics alerts (F021) | code | Shown in the IoT Support queue | as today |
| `OOH_KITCHEN_ONEOFF_ENABLED` | environment | boolean, default false | Turns the kitchen one-off on | none |
| `/api/oneoffs`, `/api/oneoffs/:id/cancel` | API | routes | Book and cancel a one-off | none |
| `OUTCOME_LABELS['boiler-boost']`, `['scope-only']` | IoT Support Dashboard | label | "heating changed", "advice given" | none |

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


---

## Rework addendum — round 1 (design/committee)

### Panel verdicts addressed

**Compliance — IP provenance of guide images**

The compliance lens correctly identifies that the design ships eleven images into the container image (G-2) without a recorded rights basis. The design document names the sources (the contractor guide page scans and the Word cheat sheet) but does not state whether Airedale or Lighthouse owns those documents and their contents, or whether any manufacturer photographs (Tongou/Owon device photos) carry separate rights.

This addendum adds the following to the design:

1. **New pre-release check item IP-1** (see below): the IoT helpdesk lead or equivalent Airedale rights-holder must confirm, in writing before the build gate, that the contractor guide and the Lighthouse PowerPause Cheat Sheet are Airedale- or Lighthouse-authored works (not third-party documents reproduced under a licence that excludes redistribution), and that no image in the eleven was supplied to Airedale by a manufacturer under terms that restrict its use in a customer-facing or contractor-facing web application. If any image cannot be confirmed as own-content, it must be replaced with an alternative (a photograph taken by Airedale staff or a diagram drawn for this purpose) before G-2 enters the build.

2. **Build step G-2 is now conditional**: G-2 may only proceed once IP-1 is signed off. The build plan already requires the release gate to clear the open items in section 15; IP-1 is now added to that gate, in writing, before the images are copied to `public/guides/powerpause/`.

3. **Image provenance table** added in section 5.2 below: each of the eleven images now carries an explicit "Rights basis" column recording the source document and the confirmation state; it starts as "pending IP-1" and must read "confirmed – [name, date]" before the build gate clears it.

No change is needed to the prototype, the build plan or any other section. If the confirmation cannot be obtained for one or more images, the affected pictures are replaced with drawn diagrams or staff photographs before the guide ships; the guide still ships, with the confirmed images, rather than the whole guide being held.

**Compliance — customer personal data: retention period and deletion basis**

The design recorded that the customer contact line (name, role, phone) lives in the Zendesk internal first comment on each ticket, and that retention is "set by the IoT helpdesk". The compliance lens is right that this is insufficient: a stated period and a deletion basis are required before the data enters production.

This addendum adds the following:

1. **New pre-release check item PD-1** (see below): the IoT helpdesk lead must confirm and record, before the release gate, the Zendesk ticket retention period that applies to OOH tickets. The recommended maximum is **12 months from ticket close**, which covers all reasonable follow-up windows for a support call. If the helpdesk's existing policy is shorter, that shorter period applies. If it is longer, a maximum of 12 months must be set for the ticket type or tag `ooh_p1` / `[TRG]` tickets, or the design must be amended so the customer contact line is stored on a separate record with its own deletion policy rather than in the ticket body.

2. **Legal basis**: the lawful basis for collecting and storing the name, role and phone number is **legitimate interests** — specifically the ability to call the customer back if the OOH session is interrupted or if a follow-up is needed within a reasonable window. This is proportionate: the data is the minimum needed for a call-back (no address, no account number, no payment data), it is in an internal comment visible only to helpdesk staff, and the customer is told why it is asked and can decline without consequence.

3. **Deletion path**: at the end of the Zendesk retention period (as confirmed by PD-1), the ticket and its internal comments are deleted by Zendesk's standard ticket purge. No separate deletion step is needed in the OOH application, because the data is not held in any OOH store, the browser, audit log, Tonight, SMS or sessionStorage (the design already enforces this). The deletion path is therefore: ticket purge by Zendesk, on the period confirmed by PD-1.

4. **Data dictionary updated** (section 17): the `[TRG]` line "Customer contact: …" row now reads: "Personal data. Zendesk internal comment only. Retention: as confirmed by PD-1 (recommended max 12 months from ticket close). Deletion: Zendesk ticket purge. Legal basis: legitimate interests (call-back within the support window)."

---

### Summary of additions

Two changes are made to the design, one for each blocking verdict.

For IP provenance: build step G-2 is made conditional on a new signed pre-release check (IP-1) confirming that the contractor guide and cheat sheet are Airedale- or Lighthouse-owned works and that no image is subject to manufacturer or third-party reproduction restrictions. Section 5.2 gains a "Rights basis" column, initially "pending IP-1", which must read "confirmed" before the build gate. Images that cannot be confirmed are replaced before the guide ships; the guide is not held on that account alone.

For personal data retention: the design now states the recommended maximum retention period (12 months from ticket close, or the helpdesk's existing shorter period if one exists), the lawful basis (legitimate interests, call-back window), and the deletion path (Zendesk ticket purge at the end of that period, with no separate OOH deletion step needed). A new pre-release check (PD-1) requires the IoT helpdesk lead to confirm and record the actual period before the release gate, and the data dictionary entry for the `[TRG]` customer contact line is updated to include all three. No other part of the design changes: the data minimisation is already correct, and the storage and in-call handling are already as narrow as they can be.