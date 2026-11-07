<!-- gate:contract
TICKET: OOHDASH-146
PHASE: design
SECTION: What this design does
It applies one agent-screen standard to every flow in the OOH Dashboard, so a call handler always reads one clear script, asks the customer a plain question, and finishes with a ticket number. The prototype IS the live product (version 1.6.6, which already contains the OOHDASH-159 changes) with only the 146 changes applied on top. Every screen you click is the real live screen, captured from the running app, unless this document lists it as changed. Revision 4 adds your decision D13, the universal risk question.
SECTION: What changed in revision 4
Your decision D13 is built in. Every flow now asks the same question, word for word: "Is there an immediate risk to trade or to anyone's health and safety?" with Yes and No answers. It replaces the kitchen "is the kitchen needed for service" question, the fridge "is stock at risk" question and the Something else "is it urgent" question, and it is now the only way to a P1 (an urgent ticket that texts the IoT team's on-call agent straight away). The prototype grew from 298 to {{NSCREENS}} screens: {{NQ}} screens now show the question, {{NCONF}} P1 confirm screens carry the new mandatory comment box, and the rest are unchanged from revision 3. Nothing else about the design changed.
SECTION: The universal risk question
Yes goes to the live P1 confirm step, with one new thing: a box labelled "Why is this urgent? (required, goes on the P1 ticket)". The red Raise the P1 button stays greyed out until the agent has typed at least ten real characters, and the server refuses a P1 with an empty comment as well. The comment is written into the P1 ticket, never into the subject. No gives the normal ticket for the next working day, in the live wording ("It's logged, reference N, and our IoT team picks it up the next working day"), or the live closed note where Lighthouse does not control the equipment. A P1 means the ticket is tagged ooh_p1; when it reaches the IoT Support Dashboard, that dashboard texts the IoT team's on-call agent, who deals with it immediately. The OOH Dashboard itself sends no text message (OOHDASH-153).
SECTION: Where the question sits and what it replaces
One rule everywhere. Self-help comes first as in 159 decision J1 (the override, the fuse board, the switch). The question is asked at the point the problem is still not resolved on the call, before the ticket is made. It is not asked where the problem was resolved on the call (for example the override worked). Flows with no self-help ask it once the problem is understood. It also sits before every closed "use your own service contractor" note, because you said every flow; there a Yes raises a P1 so the on-call agent can call back, even though they cannot fix equipment Lighthouse does not control (please check this, see Your checks). The P1 triggers it replaces: the kitchen service question, the fridge stock-at-risk question, lighting "still off", the contractor "something else" and "override did not work" paths, the Donkey Derby straight-to-P1, the Something else "is it urgent" question, and the automatic P1 for a failed kitchen one-off switch-off. This also settles the open fridge item (Q4).
SECTION: What 146 still changes compared with live
{{NDELTAS}} items, each listed with the screens it touches in section 3. The main ones: the universal risk question (item R14); a one-off "keep it on longer or switch on earlier" for kitchen equipment (no timetable is ever written); a redesigned "Something else"; hot water ends on one closed note everywhere; equipment that is not on Lighthouse here ends on a closed note instead of a dead end; the connection-check button is removed while the automatic divert stays; the heating questions no longer ask the agent to judge; the device control window uses plain words and never says "I've logged it" without a ticket number; customer name, role and number are asked after the site is confirmed; Tonight shows plain outcome chips; and "caller" becomes "customer" in ticket text.
SECTION: Decisions amended in revisions 3 and 4
From revision 3: D3 (call it a manual control button) is superseded, live says "manual override" and that stays; D9 never blocks, the customer details are asked after the site is confirmed. From revision 4: D13 changes D6 and D7. The fridge is now a P1 only through the universal question, not by its own stock-at-risk rule. Hot water was "never a P1" and can now be one if the customer answers Yes. The contractor rule "calls are always treated as urgent" is replaced: the engineer is helped with the override first, and a P1 is raised only when there is an immediate risk. Everything else from D1 to D12 stands, and 159 decision J1 (self-help first, then a ticket for the next working day) is kept.
SECTION: PowerPause guide pictures
The live guide shows no device pictures because the page was published without its picture files. The revised guide puts eleven pictures in the right places with descriptions for screen readers: the three panel types, the Lighthouse label, both override buttons close up, the interlock panel and start buttons, and the contactor manual switch. One picture (the label) is the original from the Word cheat sheet; the others are cut from the page scans of the contractor guide. Pictures are about 570 KB in total and served from the existing signed-in guide route. Their use is held until the rights check IP-1 is signed off, as recorded in the rework addendum at the end.
SECTION: How it was checked
The real app was run in fixture mode and a script clicked every button on every flow, saving each screen. The prototype is built from those captures. A second script then read the text of every prototype screen and compared it line by line with the live screen it came from: {{NIDENT}} screens are identical, {{NEXPL}} differ and each difference maps to an item in the list, {{NNEW}} are new in 146 and each maps to an item, and there are {{NUNEXPL}} unexplained differences. A click test pressed {{NCLICKS}} buttons on the {{NSCREENS}} screens with no errors and no dead buttons. For D13 the script proved three more things: every ticket screen is reached only from the question or is on the list of problems resolved on the call (none left over); every P1 confirm screen is reached only from the question; and on all {{NP1}} P1 confirm screens the Raise the P1 button stays disabled for an empty comment, spaces only, nine characters or a cleared box, and enables only for real content.
SECTION: Your checks still open
Revision 4 adds seven things for you to look at, all marked in section 15. First, hot water can now be a P1, which reverses D7 (Q8). Second, "every flow" includes the equipment Lighthouse does not control; the on-call agent cannot fix that, only call back (Q9). Third, the contractor "always urgent" rule is gone (Q10). Fourth, a failed kitchen one-off switch-off no longer raises a P1 by itself, because nobody is on a call to ask the question; this is a safety trade-off for you to decide (Q11). Fifth, the screens say "the on-duty manager" where you said "on-call agent" (Q12). Sixth, planned timetable requests and fan requests now ask the question too, which adds one click (Q13). Seventh, the new ticket subject list needs the IoT helpdesk lead's agreement (R1). The earlier open items stand: Sam Day on the contractor "override worked" ticket, the handler briefing note, the guide's phone number, and the guide rights check IP-1 and the retention check PD-1 from the rework addendum.
SECTION: Cost, background running and going back
No AI or per-use costs. D13 is browser code and one server check, with nothing running in the background. The only cost is a few seconds: one extra click on tickets that were already being raised, and one typed sentence on a P1. The kitchen one-off reuses the dashboard's existing revert timer that already runs silently inside the server; nothing new runs on any computer and no screen, window or notification appears while it waits. It is behind a switch that starts off. The guide pictures add about 570 KB of static files to the container image and no running cost. Rollback is a revert of the release; cancel any booked one-offs first.
DECISION: Approve revision 4 of the design and proceed to build? | Approve - proceed to build | Block - needs changes
DETAIL: Revision 4 changes the prototype and this document only; the live app is untouched. Section 15 lists the open items Q8 to Q13; none blocks the build, but Q9 and Q11 are your calls on safety and scope.
-->

# OOHDASH-146 Design: the agent-screen standard for every flow (revision 4: universal risk question, on live v1.6.6)

Date: 2026-11-07 · Base: origin/main `916f6e3` (v1.6.6, includes OOHDASH-159) · Discovery: PR #162 (D1 to D4) · Your UI review of PR #178 (D5 to D12) · Your drift review of 2026-11-05 (items A1 to C6b, "implement your recommendations") · Your decision D13 of 2026-11-07 (the universal risk question)

**Clickable prototype (the live screens, with the 146 changes applied):** [OOHDASH-146 prototype](mockups/OOHDASH-146-mockup.html) · **Revised PowerPause guide (with pictures):** [guide prototype](oohdash-146/guide/powerpause-contractor-info.html) · **Screen-text diff against live:** [OOHDASH-146-SCREEN-DIFF.md](OOHDASH-146-SCREEN-DIFF.md)

## 1. What changed in revision 4

| Part | What was done |
|---|---|
| A. The question | Every flow asks "Is there an immediate risk to trade or to anyone's health and safety?" (Yes / No), in the live "Ask the customer" box with the live "Customer's answer" chips. Section 2A. |
| B. The only way to a P1 | The kitchen service question, the fridge stock-at-risk question, lighting "still off", the contractor paths, Donkey Derby, Something else "is it urgent" and the one-off switch-off failure no longer raise a P1 on their own. Section 2A.4. |
| C. Mandatory comment | Every P1 confirm screen has "Why is this urgent? (required, goes on the P1 ticket)". The button is disabled until it has at least 10 real characters; the server refuses an empty one. Section 2A.1 and section 6 (B19 to B21). |
| D. Placement | Self-help first (159 J1), question when the problem is still not resolved on the call, none where it was resolved, and before every closed note. Section 2A.3. |
| E. Prototype and checks | {{NSCREENS}} screens (was 298). The screen-text diff still has {{NUNEXPL}} unexplained differences, the click test found no dead buttons or errors, and three new D13 checks pass (section 4). |
| F. Everything else | Unchanged from revision 3, including the rework addendum at the end. |

### 1A. Earlier: what changed in revision 3 (kept for the record)

| Part | What was done |
|---|---|
| A. Rebased on live | The prototype is no longer drawn by hand. It was rebuilt from the real v1.6.6 app (fixture mode, writes enabled, as in production) by clicking every button on every flow and saving the screens. Live 159 behaviour and wording are adopted everywhere: automatic save and the "What happened" card, the live P1 confirm step, override first on every kitchen circuit, "come on" is captured and "hasn't" is its own P1, the full override script with the guide link, the equipment picker with "Something not on this list", the timetable form with the Area Manager line, ticket numbers as links, the open-tickets panel, the P1 banner, and the 159 text key. |
| B. Genuine 146 changes kept | Kitchen one-off (D8), Something else (D5, D11), connection-check button removed with the divert kept (D10), "caller" becomes "customer" (B4), hot water closed note (D7), not-on-Lighthouse closed notes (D6), thermostat heating questions (D12), plain control-window wording (D2), Tonight chips, glossary. Each is restyled to the live look. |
| C. Your decisions | C1 "manual override" kept. C2 "I still think it's your equipment" kept. C3 fridge P1 only for stock at risk, as live, flagged for you. C4 customer details non-blocking. C5 "service contractor" everywhere. C6a boiler-panel screens added. C6b the call-record recovery banner is left as live and is not drawn. |
| D. Grammar | Live says "can't show whether them are on" and "has the kitchen — pot wash and kitchen — fryers come on?" on multi-circuit kitchens. New wording: "can't show whether they are on" and "have the kitchen — pot wash and kitchen — fryers come on?". |
| E. Guide pictures | The PowerPause guide gets its pictures, in the right places, with descriptions (section 5). |

## 2. Decisions

| # | Decision | Status (revisions 3 and 4) |
|---|---|---|
| D1 | One release for all flows | Unchanged. |
| D2 | Device control: fix the script and glossary only, keep today's ticket model | Unchanged. The window uses plain words and "I've logged it" only when a ticket number came back (section 8). |
| D3 | "Override" becomes "manual control button" | **Superseded by 159 and your answer C1.** Live wording "manual override" on the PowerPause panel stays everywhere. |
| D4 | Fix the repeated "not confirmed yet" pop-up | Unchanged (section 11). Not visible on a screen. |
| D5 | Customer-answerable options only | Unchanged. Live 159 already follows it in the kitchen, lighting, fans and contractor flows; 146 applies it to the remaining agent buttons (hot water, thermostat heating, Something else). |
| D6 | Equipment Lighthouse does not control: own contractor, ticket created solved | **D6 amended twice.** Revision 3: fridges are a P1 only for stock at risk, as live. Revision 4 (D13): a fridge is a P1 only through the universal question, so Q4 is resolved. The closed "use your service contractor" notes now ask the question first (Q9). Live kitchen "not on this list" and fridge "just a query" already end on a closed ticket; 146 extends that to lighting, fans, heating and air conditioning where the site has none. |
| D7 | Hot water: no control, no temperature reading, never a P1 | **Amended by D13 (Q8).** No control and no temperature reading stay. All eleven readings still end on one closed note, but the universal question comes first, and Yes now raises a P1 so the on-call agent can call back. |
| D8 | Kitchen one-off for the next time only | Unchanged in intent, restyled to the live look: the booked card uses the live "What happened" card, the automatic ticket and the ticket link. A permanent change goes to the live timetable form, which keeps its Area Manager line. |
| D9 | Customer name, role and number on every ticket | **Amended: non-blocking.** Asked on the site screen after the site is confirmed; the call record still starts at site confirm (E1); the issue buttons are never held back; "The customer won't give these" records that instead. |
| D10 | Connection check: no standalone entry, keep the divert | Unchanged. Corrected divert wording replaces the false "Everything at this site is online". |
| D11 | Something else: remove the "it is controlled" dead end | Unchanged. |
| D13 | The universal risk question | **New in revision 4.** Section 2A. |
| D12 | Thermostat heating stays in 146 | Unchanged. The pub boiler-panel screens are shown as live (C6a). |

## 2A. D13: the universal risk question (new in revision 4)

Your decision of 2026-11-07. Every conversation flow asks the same question, word for word, and it is the only way to a P1.

> **Is there an immediate risk to trade or to anyone's health and safety?**

It is a customer-answerable question, shown in the live "Ask the customer" box with the live "Customer's answer" chips **Yes** and **No**. A short grey "for you" note under it says what the words mean (trade means the site cannot serve customers or cannot open; health and safety means anything that could hurt someone) and what each answer does. The note is background, not read out.

### 2A.1 What Yes and No do

| Answer | What happens | Where to see it |
|---|---|---|
| **Yes** | The live P1 confirm step from 159: the "Say", the ticket box, the red "This raises a P1" warning and the red "Raise the P1" button. New: a mandatory comment box above the warning, "Why is this urgent? (required, goes on the P1 ticket)". **Raise the P1 stays disabled until the comment has real content**: after trimming and collapsing spaces, at least 10 characters (up to 500). The comment is shown back inside the ticket box as "Why it's urgent (your words)", and it is written into the P1 ticket. | Any `Risk: Yes, confirm the P1` screen, for example the kitchen confirm in "Kitchen: site with its own equipment list" |
| **No** | A normal ticket for the next working day, in the live wording: "It's logged, reference N, and our IoT team picks it up the next working day." Where Lighthouse does not control the equipment, No is the live closed note. The answer is kept as a "what we know so far" line, "Immediate risk to trade or to anyone's health and safety: no". | Any screen headed "Ticket created for the IoT team" or "Recorded and closed" that follows a question |

### 2A.2 What "a P1" means (stated once, here)

A P1 is a ticket raised with the existing `escalate-p1` outcome: priority urgent and the `ooh_p1` tag. The OOH Dashboard sends no text message itself (OOHDASH-153, Approach B). When the ticket reaches the IoT Support Dashboard, that dashboard sends a text message to the IoT team's on-call agent, who deals with it immediately. The live screens call that person "the on-duty manager" (the six OOHDASH-153 sentences). The words are kept as live; see Q12 for you to decide whether to rename them.

### 2A.3 Where the question sits (one rule, applied everywhere)

1. **Self-help first, as in 159 decision J1.** Where a flow has a self-help step (the manual override, the fuse board, the switch, the radiator question, the customer's own power check), it comes first and is unchanged.
2. **Ask the question at the point the problem is still not resolved on the call, before the ticket is made.** That is the moment the agent is about to create a ticket for a problem that is still there.
3. **Do not ask it when the problem is resolved on the call** (the override worked, the fuse board fix worked, the lights came on, a control change was confirmed, a one-off was booked). No question is asked there, because nothing is being raised for follow-up.
4. **A flow with no self-help asks it once the problem is understood** (air conditioning, hot water, extractor fans, "not on Lighthouse here").
5. **The question is never asked twice in one issue.** A second issue on the same call asks it again for that issue.

| Flow | Where the question sits | Yes goes to | No goes to |
|---|---|---|---|
| Kitchen (every site type, including the glass washer states) | The live "is the kitchen needed for service?" question is replaced in place, after the override did not work, the customer could not find the panel, or "I still think it's your equipment". It is also asked before the "different times every week" request ticket and before the "nobody will be there" ticket. | The live kitchen P1 confirm, with the comment | The live "not needed until later" ticket, now headed "Kitchen equipment off — no immediate risk" |
| Kitchen: appliance fault ("I'll call our service contractor"), "Something not on this list", no kitchen on Lighthouse | Before the closed note | P1 (equipment Lighthouse does not control), with the comment | The live closed note |
| Outside lighting | After the manual override: on "No, they're still off" | The live lighting P1 confirm, with the comment | A new next-working-day ticket, "External lighting not working — no immediate risk" |
| Extractor fans | After the self-help screen, before the timetable request ticket | Fans P1 | The live ticket |
| Fridges and freezers | The live "is stock at risk?" question is replaced in place | The live fridge P1 confirm, with the comment | The live closed note (Lighthouse does not control fridges) |
| Hot water (all eleven readings) | Before the closed note | Hot water P1 | The closed note |
| Heating, thermostats | After the radiator question ("cold" gives a ticket, "warm" gives a closed note) and before the "Yes, please" log for a thermostat that is not reporting; also before the control-failure tickets ("not delivered", "not confirmed") | Heating P1 | The ticket or the closed note |
| Heating, pub boiler panel | Before the helpdesk ticket when no heating change was made on the call | Heating P1 | The helpdesk ticket |
| Air conditioning | Before the ticket | Air conditioning P1 | The ticket |
| Connection check (reached by the automatic divert) | After the customer's checks did not fix it ("No, it's still not working") | Connection P1 | The ticket |
| Contractor on site | After the override did not bring it on, on "No, something else", and at Donkey Derby (where the override does not work) | The live contractor P1 confirm, with the comment | A new next-working-day ticket |
| Something else | "None of these" asks it in place of the live "is it urgent?" question. The other answers start that issue's own flow, which asks it. | The live Something else P1 (its required reason box is now the shared comment) | The live "can wait" ticket |
| Not on Lighthouse here (lighting, fans, heating, air conditioning, kitchen, Something else) | Before the closed note | P1 (equipment Lighthouse does not control), with the comment | The closed note |
| Site could not be identified (house number matches two sites) | Before the "pass it to the IoT team" ticket | P1 (site not identified) | The logged ticket |

Not asked, on purpose (listed so nothing is a silent gap): a kitchen, lighting, fan or heating problem resolved by the override or the fuse board; "the unit's lights are back on"; a kitchen one-off booked or cancelled; "its normal times are fine"; a confirmed control change; a heating boost on the pub boiler panel; "No, leave it" on a thermostat (the customer declined to log it). Not call flows, so not asked: callback lookup, Tonight, and the Tonight query to the IoT helpdesk. The screen-text check proves every other ticket screen is reached only from the question (section 4).

### 2A.4 The P1 triggers this replaces

| P1 trigger in live v1.6.6 | Now |
|---|---|
| Kitchen "is the kitchen needed for service right now, with food being served or breakfast on?" (22 screens, all site types) | The universal question |
| Fridge "is stock at risk right now?" | The universal question. This resolves open item Q4: a fridge is a P1 only through the question, so "stock at risk" is one kind of immediate risk to trade. |
| Lighting: "No, they're still off" went straight to the P1 | The universal question, then P1 or a normal ticket |
| Contractor: "No, something else" went straight to the P1 | The universal question |
| Contractor: the override "hasn't come on" went straight to the P1 | The universal question |
| Contractor at Donkey Derby: "this is the one case where you go straight to a P1" | The universal question |
| Contractor: "calls are always treated as urgent" (guide line on the first screen) | Reworded: help with the override first; a P1 only if there is an immediate risk |
| Something else: "is this stopping the site trading, or is it a safety risk, right now?" and the live separate required reason box | The universal question and the shared comment |
| Kitchen one-off: the server raised a P1 if a switch-off failed (design rev 3 section 9) | A normal ticket marked "one-off not switched off" (no agent is on a call to ask). See Q11 for your decision. |

Nothing else raises a P1: the server accepts the `escalate-p1` outcome only with a comment (section 6, B19), and the device control failure tickets use the normal ticket, as live.

### 2A.5 P1 ticket subjects (the list to confirm with the IoT helpdesk lead)

The subject names the flow and "risk to trade or health and safety". Subjects for the No answer end "no immediate risk". The IoT Support Dashboard keys on the `ooh_p1` tag, not on the subject; the subject change does not break it.

| Flow | P1 subject (Yes) | Normal subject (No) |
|---|---|---|
| Kitchen | Kitchen equipment off — risk to trade or health and safety — P1 | Kitchen equipment off — no immediate risk |
| Kitchen, other (times, nobody there) | Kitchen equipment — risk to trade or health and safety — P1 | the live ticket subject |
| Outside lighting | External lighting not working — risk to trade or health and safety — P1 | External lighting not working — no immediate risk |
| Fridges | Refrigeration alarm — risk to trade or health and safety — P1 | live closed note |
| Contractor | Contractor on site — risk to trade or health and safety — P1 | Contractor on site — no immediate risk |
| Contractor, override failed | Contractor on site, PowerPause override failed — risk to trade or health and safety — P1 | Contractor on site, PowerPause override failed — no immediate risk |
| Contractor, Donkey Derby | Contractor on site (Donkey Derby), override unavailable — risk to trade or health and safety — P1 | Contractor on site (Donkey Derby), override unavailable — no immediate risk |
| Something else | Something else — risk to trade or health and safety — P1 | the live "can wait" subject |
| Extractor fans | Extractor fans — risk to trade or health and safety — P1 | the live ticket subject |
| Heating | Heating — risk to trade or health and safety — P1 | the live ticket subject |
| Hot water | Hot water — risk to trade or health and safety — P1 | live closed note |
| Air conditioning | Air conditioning — risk to trade or health and safety — P1 | the live ticket subject |
| Connection | Equipment not connecting — risk to trade or health and safety — P1 | the live ticket subject |
| Not on Lighthouse here | Equipment Lighthouse does not control (kitchen equipment, lighting and so on) — risk to trade or health and safety — P1 | live closed note |
| Site not identified | Site not identified — risk to trade or health and safety — P1 | the live ticket subject |

### 2A.6 Where D13 meets earlier decisions

| Earlier decision | What D13 does to it |
|---|---|
| 159 J1 (self-help first) | Kept. The question comes after the self-help step, never before it. |
| D5 (customer-answerable options only) | Kept and strengthened: the question is answered by the customer, Yes or No. |
| D6 and D7 (closed "use your service contractor" notes; hot water never a P1) | **Changed, as you directed ("every flow").** The question is asked before every closed note too, and Yes raises a P1 even where Lighthouse cannot fix the equipment, so the on-call agent can call the site back straight away. Hot water was "never a P1" (D7); it can now be one. See Q8 and Q9. |
| OOHDASH-153 | Kept: six sentences literal, `ooh_p1` tag, no OOH text message. The P1 ticket now also carries the agent's comment. |
| Q4 (fridge) | Resolved by D13 (section 2A.4). |

## 3. What differs from live (the complete list)

Everything not listed here is the live v1.6.6 screen, word for word. The checks in section 4 prove it.

{{DIFFTABLE}}

### Screens that differ, by item

{{SCREENTABLE}}

### Live screens replaced or removed

| Live screens | What happens to them | Item |
|---|---|---|
| Hot water first screen with "Pass it to the IoT team" and "Scope guidance (boiler fault?)" (all eleven readings) | Replaced by one closed note per reading | R3 |
| Something else: "Check if it's Lighthouse-controlled", "Pass it to the IoT team as described", the "controlled, back to the issue picker" dead end | Replaced by the customer question and the universal risk question | R2, R14 |
| Kitchen "is the kitchen needed for service right now, with food being served or breakfast on?" with "Yes, it's needed now" / "No, it can wait" (22 screens) | The universal question with Yes / No | R14 |
| Fridge "is stock at risk right now?" with "Yes, stock is at risk" / "No, it's just a query" | The universal question with Yes / No | R14 |
| Something else "is this stopping the site trading, or is it a safety risk, right now?", "Yes, it's urgent" and the separate "Reason for a P1" box | The universal question and the shared mandatory comment | R14 |
| Lighting, contractor and Donkey Derby paths that went straight to the P1 confirm step | The universal question first | R14 |
| Connection check: the all-online screen and the "Everything at this site is online" divert card | Removed (not reachable without the button) and replaced | R5 |
| Lighting, fans and heating with none on Lighthouse: "Continue under Something else" | Replaced by a closed note | R4 |
| Thermostat heating: "Give the radiator advice", "Raise the setpoint anyway", "Adjust the setpoint anyway" | Replaced by the radiator question | R6 |
| Control window labelled "Raise setpoint", "Send to device" | Plain wording | R7 |
| Offline banner "Run connection check" button | Removed | R5 |

Not drawn, left as live: the call-record recovery banner (C6b); the transient "Sending to the heating controls…" screens; the control window left open between crawl steps.

## 4. How the prototype was made and proved

1. **Capture.** `docs/project/oohdash-146/crawl.mjs` runs the real app (origin/main 916f6e3, fixture mode, `WRITES_DISABLED=false`, as in production) and presses every answer button on every flow, saving each screen's html and text. Scenarios cover the sites in the earlier screen dump (6832, 8888, 6749, 6360, 6961, 6851, 7004, 5198, 6771 to 6773, 6218, 7001, 7003, 9001) plus injected states (nine hot water readings, four kitchen verdicts, room temperatures, equipment removed).
2. **Build.** `build-proto.cjs` assembles the prototype: live screens as captured (with example site name, house number and ticket numbers, item N1), the changed and new screens authored in the same markup by `live-helpers.cjs`, and the live stylesheet inlined.
3. **Prove.** `verify-proto.mjs` loads the finished prototype, reads every screen's text and compares it with the live screen it came from, then clicks every button. Revision 4 adds three D13 checks: every ticket screen is reached only from the question or is on the resolved-on-the-call list; every P1 confirm screen is reached only from the question; and the Raise the P1 button is disabled until the comment has real content (empty, spaces only, nine characters and a cleared box all stay disabled).

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
| B2 | `public/js/flows.js` Something else | R2: the customer question, routing to that issue's own flow (`startFlow(key, words, {carryNotes:true})`) or the closed note; the P1 path goes through the shared question (B19) and the 153 sentence is unchanged. The live reason box (OOHDASH-134) is replaced by the shared comment. |
| B3 | `public/js/flows.js` not on Lighthouse | R4: lighting, fans, heating and air conditioning with none at the site use the existing `outcomeScope` with the "Which equipment is it?" box, as live kitchen does; no "Continue under Something else". |
| B4 | `public/js/flows.js` thermostat heating | R6: replace the agent buttons with the radiator question and the closed or logged outcomes. |
| B5 | `public/js/flows.js` kitchen | R1: the first question and the one-off screens (section 9), and the "different times" answer goes to the next-times step. The live equipment picker and override script are untouched; the service question becomes the shared question (B19). |
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
| B17 | `public/css/styles.css` | `.callerline`, `.oneoff-banner` only. D13 adds no CSS: the comment box reuses the live `formrow` and `p1-blocked-note` styles (OOHDASH-134). |
| B19 | `public/js/flows.js` (new shared helper) | D13: `riskQuestion(f, {yes, no})` renders the exact question (constant `RISK_ASK`), the grey "for you" note and the Yes / No chips, and records the answer as the known-so-far line "Immediate risk to trade or to anyone's health and safety: yes or no". Every flow calls it at the place listed in section 2A.3 and nowhere else. Remove `SERVICE_ASK` (about line 2112) and its screens (about 2290 to 2303), the fridge stock-at-risk question, and the Something else "is it urgent" step. Straight quotes only. |
| B20 | `public/js/flows.js` (new shared helper) | D13: `p1ReasonBox(f)` and `p1ReasonValid(text)`: label "Why is this urgent? (required, goes on the P1 ticket)", textarea `data-testid="p1-reason"`, up to 500 characters; valid means at least 10 characters after trimming and collapsing spaces. `outcomeP1` and the Something else P1 render the box above `p1WarnBox()`; the "Raise the P1" button is rendered `disabled` and enabled by an input handler (same pattern as the live `otherP1ReasonInput`); the ticket box shows "Why it's urgent (your words)". The comment is sent as `p1Reason` and as `p1Summary` (cut to 80 characters as `otherP1Summary` does today). |
| B21 | `routes/api.js` (/api/outcomes), `services/zendesk.js` | D13: when `type === 'escalate-p1'` the server collapses whitespace in `p1Reason` and returns 400 ("A P1 needs a reason of at least 10 characters") if it is shorter than 10 or longer than 500 after trimming. The reason is written into the ticket's first internal `[TRG]` comment as a labelled line "Why urgent (agent): …" after the Operator line, never in the subject. `escalate-p1` stays the only outcome type that sets priority urgent and the `ooh_p1` tag, so the question is the only route to a P1. |
| B22 | `public/js/flows.js` subjects | D13: the subject list in section 2A.5, the "no immediate risk" subject for No tickets, the new Say and "what goes on the ticket" texts. The P1 confirm Say becomes: "Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team." |
| B23 | `public/js/flows.js` lighting, contractor | D13: lighting "No, they're still off" and the three contractor paths ask the question first; add the new normal tickets for No (lighting still off; contractor, something else; contractor, override failed; Donkey Derby). Reword the contractor first-screen line (section 2A.4). |
| B24 | `public/js/flows.js` closed notes and hot water, fans, air conditioning, heating, boiler panel, connection | D13: ask the question before the ticket or closed note in each place listed in section 2A.3; Yes uses the P1 family for that flow (section 2A.5). |
| B25 | `services/oneoffs.js` (section 9) | D13: a failed switch-off no longer calls `escalate-p1`. It creates a normal ticket "Kitchen one-off: switch-off failed, check the equipment" and keeps the existing danger alert. Final decision at Q11. |
| B26 | `public/js/views.js` site not identified | D13: the "pass it to the IoT team" button on the house-number-matches-two-sites screen asks the question first. |
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
| Is there an immediate risk to trade or to anyone's health and safety? with the chips Yes and No (exactly this question, in every flow) | "Is the kitchen needed for service", "is stock at risk", "is it urgent", "Yes, it's needed now", "No, it can wait", "Yes, it's urgent", "Yes, stock is at risk", "No, it's just a query" | every flow (D13) |
| Why is this urgent? (required, goes on the P1 ticket) | "Reason for a P1" | every P1 confirm screen (D13) |
| Immediate risk to trade or to anyone's health and safety: yes / no (what we know so far) | "Kitchen needed for service now: yes" | every screen after the question (D13) |
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
| R5 | Kitchen one-off switches real equipment later with nobody watching the dashboard. | Attended question, limits, never late, missed reported, failed switch-off raises a normal ticket (D13, Q11), off by default, proven end to end before it is turned on. |
| R6 | The one-off depends on the live kitchen read and the Tuya switch path, both unproven in production. | It does not appear until both are on and proven; time requests go to the live timetable form meanwhile. |
| R7 | Customer name and number are personal data. | Zendesk internal comment only; browser memory only; never in OOH stores, logs, Tonight or SMS. |
| R8 | Rollback. | Revert the release (previous image by digest). Cancel any booked one-offs from the site screen first. |
| Q1 | A contractor's "the override worked" outcome: 159 decision J1 already records it as a normal ticket for the contractor flow. | Ask Sam Day only if you want the other flows to match (owner: James). |
| Q2 | Which solved status should closed notes use. | Live already creates closed tickets; recommended: the same status. IoT helpdesk lead confirms; not blocking. |
| Q3 | Should customer details later move to Zendesk requester or custom fields. | Recommended no for this release. |
| Q4 | **Fridge stock at risk is a P1 (live), reversing the 146 D6 wording that fridges are never a P1.** | **Resolved by D13 (revision 4):** a fridge is a P1 only through the universal question; "stock at risk" is one kind of immediate risk to trade. |
| Q5 | The support phone number differs between documents: the Word cheat sheet says 023 8144 0228, the contractor guide says 023 814 0228, and the label says +44 (0)23 814 0228. The P1 failure screen uses 023 814 0228 (from the 146 failure-path design). | Confirm the right number before the guide or the failure screen carries one. |
| Q6 | The guide pairs Tongou with single-phase and Owon with three-phase. | Read from page 8 of the contractor guide; Sam Day to confirm. |
| Q7 | The guide's contactor-override section (page 9 of the contractor guide) tells a contractor how to run an appliance when the PowerPause is faulty. | It is in the original; confirm it should be in the signed-in guide. |
| Q8 | **D13 reverses D7: hot water can now be a P1.** D7 said hot water is never a P1 because Lighthouse has no hot water control. You said every flow asks the question, so it does. | Applied as you directed. Check that a hot water P1 is wanted: the on-call agent can only call back and advise. |
| Q9 | **D13 on equipment Lighthouse does not control (D6/D7 closed notes, fridges, hot water, "not on Lighthouse here", radiators and appliance faults).** You said every flow. Yes raises a P1 so the on-call agent can call back immediately, but the on-call team cannot fix that equipment. | Applied as you directed, with the Say telling the customer to contact their own service contractor as well. Please confirm. The alternative is No-only on those paths (closed note, no P1). |
| Q10 | **The contractor rule "calls are always treated as urgent" is gone.** An engineer waiting on site is now a P1 only if the customer answers Yes. | Applied for consistency. Sam Day may want to confirm the rule for contractors. |
| Q11 | **Failed kitchen one-off switch-off no longer raises a P1.** Rev 3 raised one after 10 minutes because kitchen equipment left powered overnight is a safety risk. D13 says the question is the only way to a P1, and no agent is on a call to ask it. | Default (as you directed): a normal ticket and the existing alert. **Safety trade-off:** nobody is texted overnight if a switch-off fails. Alternative: keep this one automatic P1 as the only exception. Your call. |
| Q12 | You wrote "the on-call agent"; the live screens and the six 153 sentences say "the on-duty manager" (for example "It pages the on-duty manager straight away"). | Left as live. Say if you want them renamed (small wording change, one place). |
| Q13 | Planned requests (kitchen "different times every week", fans on late, air conditioning, the "nobody will be there" refusal) now ask the question too. It adds one click to flows that never had a P1. | Applied because you said every flow. Easy to drop for planned requests if agents find it odd. |

## 16. Tests the build must add (and prove they fail on the old code)

| ID | Type | Case |
|---|---|---|
| GOLD-146 | unit, golden | vm-load `flows.js` and `control.js`; render each changed screen listed in section 3 with fixed data and compare with `test/fixtures/oohdash-146-screens.json` (generated from `docs/project/oohdash-146/proto-nodes.json` and the prototype text). Unchanged live screens are covered by the existing 159 tests. |
| LEX-146 | unit | No rendered screen contains: "needed for service", "stock at risk" as a question, "Yes, it's urgent", "No, it can wait", caller, setpoint, frost-hold, "manual control button", "on-site switch", "repairs engineer", "refrigeration engineer", "boiler or service engineer", "Check and log", device-id patterns. |
| D5-146 | unit | No rendered button label is one of the removed agent choices: "Scope guidance", "Give the radiator advice", "Raise the setpoint anyway", "Adjust the setpoint anyway", "Check if it's Lighthouse-controlled", "Pass it to the IoT team as described", "Continue under Something else", "Run connection check". |
| HW-146 | unit + route | Every hot water reading ends on the closed note; hot water scope level is never `ctl`; the twins agree. |
| NLH-146 | e2e | Lighting, fans, heating and air conditioning with none at the site end on a closed note with the "Which equipment is it?" box. |
| CN-146 | e2e | No "Run connection check" button; typing "router" or "offline" suggests nothing; a device offline at an otherwise online site never shows "Everything at this site is showing online". |
| O-146 | e2e | Something else: each answer starts that flow or ends on the closed note; "None of these" asks the universal question; Yes with a comment raises the 153 P1. |
| D13-1 | e2e, every flow | For each flow in section 2A.3, drive to the unresolved point and assert the exact question text "Is there an immediate risk to trade or to anyone's health and safety?" with chips Yes and No; the kitchen, fridge and Something else screens no longer contain the old questions. |
| D13-2 | e2e | Yes opens the P1 confirm step; with an empty, spaces-only or nine-character comment the Raise the P1 button is disabled; with ten real characters it is enabled; the comment is on the ticket. |
| D13-3 | route | `POST /api/outcomes` with `type: escalate-p1` and no, blank, or short `p1Reason` returns 400 and creates no ticket; with a valid reason it creates the ticket with `ooh_p1`, priority urgent and "Why urgent (agent): …" in the first internal comment. |
| D13-4 | e2e | No gives the next-working-day ticket in the live wording (`It's logged, reference N`) or the live closed note; the subject ends "no immediate risk" where listed in section 2A.5. |
| D13-5 | unit | No code path other than the shared question reaches `escalate-p1`: a source check that every `outcomeP1` call is preceded by `riskQuestion` and that `services/oneoffs.js` never posts `escalate-p1`. |
| D13-6 | e2e | Resolved-on-the-call paths (override worked, fuse board, lights came on, confirmed control change, one-off booked, boiler boost) do not show the question. |
| D13-7 | e2e | The unmanaged paths (closed notes, hot water, fridge) show the question; Yes raises the unmanaged P1 and the Say tells the customer to contact their service contractor too. |
| HEAT-146 | e2e | Room below target, "Warmer" or "It's not working": the radiator question; warm gives the closed note, cold gives a ticket. |
| CD-146 | e2e + route | Details card after site confirm; issue buttons never blocked; `[TRG]` has "Customer contact: …"; the P1 text, `OohSmsLog`, audit entry, Tonight row and sessionStorage contain no phone number; the declined path. |
| ONE-1..7 | unit, worker, route, e2e | As in section 9: booking refusals, worker steps and lease, offline retry then missed, switch-off failure raises a normal ticket and no P1, cancel, no timetable keys written, booked wording only on a 200 with a booking id. |
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
| Kitchen one-off | 8888 with `OOH_KITCHEN_ONEOFF_ENABLED=true`; fake clock in unit tests | on later, on earlier, attended no, cancel, offline at start, switch-off failure (stub, normal ticket) |
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
3. Kitchen 8888: "It's not working", Fryer: the live override script with the guide link; "Yes, it's come on" gives the live captured ticket, no question and no P1. "No, it hasn't come on" asks the universal question: No gives the "no immediate risk" ticket; Yes shows the P1 confirm with the comment box; Raise the P1 is greyed out until you type at least ten characters.
4. Hot water at 6832: straight to the closed note with "service contractor"; the ticket is created closed.
5. Fridges 6851: the universal question; Yes with a comment gives the live P1; No gives the closed note.
6. Something else, "Cellar cooler alarm going off": "Kitchen equipment" starts the kitchen flow; "Outside lighting" at a site without it gives the closed note; "None of these" asks the universal question; Yes with a comment gives the 153 P1.
7. Site 6771: the offline banner has no button; 7004 with a thermostat offline, heating, "the bar thermostat isn't connecting" (never "everything is online").
8. Thermostat 6832 (16 against 20): "It's not working": "Are the radiators in that area warm?"
9. Control window: "Make it warmer", Send: plain wording; block `/api/outcomes` and press "Done, carry on": "Try logging again", never "I've logged it".
10. Block `/api/outcomes` and raise a P1: "The P1 has NOT been raised", no ticket number; allow and retry.
11. Open the guide from the override screen: eleven pictures load, each with its description.
12. For every other flow (lighting 6749 "still off", fans, hot water, air conditioning, heating "cold radiators", contractor "something else" and "hasn't come on", a closed note such as "Something not on this list", site not identified): confirm the exact question appears before the ticket, the P1 button is disabled until the comment is filled, and a P1 cannot be raised without it (try with the box empty, with spaces only and with nine characters).
13. Search every screen above for the LEX-146 and D5-146 word lists: none.

## 19. How the customer-experience aims are met (where to see them in the prototype)

| Aim | Where it is delivered | Prototype group |
|---|---|---|
| The agent never has to diagnose | R2, R3, R6 and live 159 | Something else; Hot water; Heating |
| Never a dead end; always clear who to call | R3, R4, live closed notes | Not on Lighthouse here; Hot water |
| Kitchen times sorted on the call, safely | R1 | Kitchen: one-off change |
| Our team can call the customer back | R8 | Customer details |
| One unmistakable script per card | live 159 text key | any screen |
| Never say something false | R5, R7, the P1 failure screen | Connection check; Device control window |
| P1 stays fast and true | live 159 P1 confirm and after card, now one question in every flow and a short written reason | Every flow; Kitchen; Outside lighting; Contractor |
| One question, one route to a P1 (D13) | Section 2A; the question screens in every flow group | Every flow group |
| Plain words for non-technical agents | section 14 | any screen |
| A contractor can recognise the panel and button | R-guide (section 5) | the guide |

## 20. What does not change

No timetables, schedules or OptimumStartStop keys are written by this work; the kitchen one-off writes only the switch key the existing Turn on button writes, and a test enforces it. The control window's safety checks, three-outcome tracker and ticket model are unchanged (D2). Ticket types, tags, priority and the `ooh_p1` path are unchanged (the P1 now also needs the agent's comment, B21); all live 159 behaviour not listed in section 3 is unchanged.

## 21. Cost, token use and silent background running

| Part | What runs | Idle cost | Visible to the operator? | Verdict |
|---|---|---|---|---|
| Wording, closed notes, customer details | Browser code and one extra field per ticket post | None | n/a | No new cost |
| Kitchen one-off scheduling | The existing revert worker inside the server process: one store query every 30 seconds (already running since F010), plus one filter for due bookings | No AI tokens, no new subscription, no extra device calls while idle | Nothing: no window, console or notification | Meets both criteria |
| One-off steps when due | 2 to 4 device writes and reads per booking, one ticket, a few comments | Only when there is work | Results appear only in the ticket, Tonight and alerts | Bounded per booking |
| Browser control watcher | Unchanged: one status call every 15 seconds for up to 95 minutes after a slow thermostat change, inside the open tab only | Unchanged; D4 removes its repeated pop-up | Only the single "not confirmed yet" pop-up | Improved |
| Universal risk question and P1 comment (D13) | Browser code, one shared helper and one server check on the existing outcome route | None | n/a | No AI or per-use cost. Adds one click to tickets that were already raised and one typed sentence to a P1 (a few seconds). Not a poll or a background job. |
| Guide pictures | Static files served on request | None | n/a | About 524 KB added to the image |
| Prototype and diff tooling | Run by hand on a developer machine | None | n/a | Nothing in production |
| AI or per-use services | None | None | n/a | n/a |

Build cost is mainly browser code, one small server module for one-offs (with its tests), the guide files, and test updates. What the business gets: agents who never make a technical judgement, no dead ends, honest referrals that do not clog the IoT queue, a contact number for call-backs, a one-off for kitchen equipment without touching timetables, and a guide that shows the contractor what to press.
