<!-- gate:contract
TICKET: OOHDASH-146
PHASE: design
SECTION: What this design does
It applies one agent-screen standard to every flow in the OOH Dashboard, so a call handler always reads one clear script, asks the customer a plain question, and finishes with a ticket number. The prototype IS the live product (version 1.6.6, which already contains the OOHDASH-159 changes) with only the 146 changes applied on top. Every screen you click is the real live screen, captured from the running app, unless this document lists it as changed. You can click through it here: https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-146-mockup.html, read the PowerPause guide here: https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-146-powerpause-guide.html, and see the new start screen and caller banner in a set of labelled frames here: https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-146-addendum-calling-banner.html
SECTION: What changed in revision 4.3
Revision 4.3 applies your review of revision 4.2 ("all the rest is good") with two changes. D15: "Who's calling?" is now the start screen. Clicking New call opens it with the customer name, role and number and the site search on the same screen; the details are optional, the agent can go straight to the site search, and the call record still starts when the site is confirmed. The old landing page stays under Other screens for comparison. D16: a permanent caller banner shows on every in-call screen once the site is confirmed, with the caller's name, number and role if given, and the site. It has four states (full, partial, none taken with an optional Add details, and updated when details are added mid-call), and on a phone it shrinks to one sticky line. Everything from revision 4.2 stands: the 12 month deletion backstop, the accepted failed-switch-off P1, D14 and the build hardening. The prototype now has {{NSCREENS}} screens.
SECTION: The universal risk question
Every flow still asks the same question, word for word: "Is there an immediate risk to trade or to anyone's health and safety?" with Yes and No. Yes goes to the live P1 confirm step, with a box labelled "Why is this urgent? (required, goes on the P1 ticket)"; the red Raise the P1 button stays greyed out until the agent has typed at least ten real characters, and the server refuses a P1 with an empty comment as well. The comment is written into the P1 ticket, never into the subject. No gives the normal ticket for the next working day, in the live wording, or the live closed note where Lighthouse does not control the equipment. A P1 means the ticket is tagged ooh_p1; when it reaches the IoT Support Dashboard, that dashboard texts the IoT team's on-call agent, who deals with it immediately. The OOH Dashboard itself sends no text message (OOHDASH-153).
SECTION: Where the question sits and what it replaces
One rule everywhere. Self-help comes first as in 159 decision J1 (the override, the fuse board, the switch). The question is asked at the point the problem is still not resolved on the call, before the ticket is made. It is not asked where the problem was resolved on the call (for example the override worked). Flows with no self-help ask it once the problem is understood. It also sits before every closed "use your own service contractor" note, because you said every flow; there a Yes raises a P1 so the on-call agent can call back, even though they cannot fix equipment Lighthouse does not control (still your check, Q9). The P1 triggers it replaces: the kitchen service question, the fridge stock-at-risk question, lighting "still off", the contractor "something else" and "override did not work" paths, the Donkey Derby straight-to-P1 and the Something else "is it urgent" question. A P1 now has these ways in only: the question; a P1 offered (not forced) on an urgent fan one-off or an urgent kitchen permanent timetable request; and two automatic exceptions where nobody is on a call to ask, a failed kitchen one-off switch-off and an urgent kitchen one-off the dashboard cannot make.
SECTION: The start screen and the caller banner (D15, D16)
New call opens "Who's calling?": the say line "Can I take your name, your role, and the best number to reach you on?", three optional boxes (name, role, number), and the site search below them, all on one screen. Nothing is required: leaving the boxes empty, or pressing "The customer won't give these", never blocks the search. Once the site is confirmed the call starts and a banner stays at the top of every screen of the call: the caller's name, number and role if given, and the site. If only a name or only a number was taken the banner says what is missing, quietly. If nothing was taken it says "No contact details taken" and offers "Add details", which opens a small screen and brings the agent back to the same place with the banner updated. The banner works the same in every flow (kitchen, heating, boiler panel, lighting, contractor, Something else, the P1 steps, the ticket and end-of-call card). It looks like the rest of the live screens, is neutral rather than alarming, and on a phone becomes one compact sticky line so the say box stays in view. It is display only, inside the signed-in session. Customer contact data is still held only on the Zendesk ticket, with the 12 month automatic deletion and manual removal from PD-1.
SECTION: The urgency window (D14)
Planned requests are filtered by urgency instead of asking the risk question. Business as usual is the IoT support office; I have assumed Monday to Friday 09:00 to 17:00, excluding bank holidays, and the IoT team aims to act within 3 working hours (please confirm the exact hours, Q14). A request is urgent if the change must happen before the IoT team could reasonably do it: tonight, before the office opens, or before 12:00 on the next working day when asked out of hours. One shared helper works it out from the time the agent says it is needed, and the screen shows "Urgent — outside office hours" or "Not urgent — the IoT team can pick this up in time". Extractor fans: the agent first says one-off or every week, then when; only an urgent one-off can be a P1, anything else is a normal ticket with no P1 offered. Kitchen "different times every week": only an urgent request may be a P1, with the permanent request written into the P1 for the IoT team. Air conditioning keeps the risk question and says where to put an ongoing schedule change. Kitchen one-off: the "will someone be there" question is removed, because PowerPause only controls power and safe use stays the site's responsibility; an urgent one-off the dashboard can make is booked and ticketed, one it cannot make raises a P1 automatically, and anything not urgent is a normal ticket.
SECTION: What 146 still changes compared with live
{{NDELTAS}} items, each listed with the screens it touches in section 3. The main ones: the universal risk question (item R14); a one-off "keep it on longer or switch on earlier" for kitchen equipment (no timetable is ever written); a redesigned "Something else"; hot water ends on one closed note everywhere; equipment that is not on Lighthouse here ends on a closed note instead of a dead end; the connection-check button is removed while the automatic divert stays; the heating questions no longer ask the agent to judge; the device control window uses plain words and never says "I've logged it" without a ticket number; customer name, role and number are asked after the site is confirmed; Tonight shows plain outcome chips; and "caller" becomes "customer" in ticket text.
SECTION: Decisions amended in revisions 3 and 4
From revision 3: D3 (call it a manual control button) is superseded, live says "manual override" and that stays; D9 never blocks. From revision 4: D13 changes D6 and D7. The fridge is now a P1 only through the universal question. Hot water was "never a P1" and can now be one if the customer answers Yes. The contractor rule "calls are always treated as urgent" is replaced: the engineer is helped with the override first, and a P1 is raised only when there is an immediate risk. From revision 4.2: D14 is new, Q11 is accepted (the failed switch-off keeps its automatic P1), and Q13 is closed as superseded by D14. From revision 4.3: D15 and D16 are new. D9 is amended again: the customer details are asked on the start screen, together with the site search, instead of after the site is confirmed; they stay optional and never block, and the call record still starts at site confirm (E1). The old caller line is replaced by the permanent banner. Everything else from D1 to D12 stands, and 159 decision J1 (self-help first, then a ticket for the next working day) is kept.
SECTION: PowerPause guide pictures
The live guide showed no device pictures because the page was published without its picture files and rewritten as text only. You said the guide already exists and should simply be copied from the Word document. The source is "Lighthouse PowerPause Contractor Info.docx" (Remote Monitoring, Greene King, Flaming Grills, Phase 2 Sites, Engineer Information). The guide is now that document word for word, in the same order: all 12 pictures (11 in the body and the header logo), the support phone number 023 814 0228, the Tongou and Owon wording, the fire-up and fire-down table and the contactor override section (you asked for that section to stay). Nothing is refined or reworded. The pictures add about 1.2 MB of static files and no running cost. The rights check IP-1 is closed on your confirmation. The contractor-on-site flow improvements (asking override versus something else, choosing the device, reading and emailing the instructions) are the backlog story OOHDASH-163 and are out of scope here.
SECTION: How it was checked
The real app was run in fixture mode and a script clicked every button on every flow, saving each screen. The prototype is built from those captures. A second script then read the text of every prototype screen and compared it line by line with the live screen it came from: {{NIDENT}} screens are identical, {{NEXPL}} differ and each difference maps to an item in the list, {{NNEW}} are new in 146 and each maps to an item, and there are {{NUNEXPL}} unexplained differences (the banner text is compared separately and mapped to item R17). A click test pressed {{NCLICKS}} buttons on the {{NSCREENS}} screens with no errors and no dead buttons. The D13 and D14 checks still pass. The D15 and D16 checks also pass: the prototype starts on "Who's calling?" with the name, role, number and site search on one screen; the banner is on all {{NINCALL}} in-call screens in each of its five states (full, name only, number only, none taken, declined) and on no screen outside a call; a walk from the start screen through the site search, confirmation and a kitchen flow keeps the right banner in all four ways of starting; adding details mid-call updates the banner and returns to the same screen; and at phone width the banner is one compact sticky line.
SECTION: Your checks still open
Still open for you, all marked in section 15: hot water can now be a P1, reversing D7 (Q8); "every flow" includes equipment Lighthouse does not control, where the on-call agent can only call back (Q9); the contractor "always urgent" rule is gone (Q10); the screens say "the on-duty manager" where you said "on-call agent" (Q12); and please confirm the IoT office hours I assumed for D14, Monday to Friday 09:00 to 17:00 excluding bank holidays (Q14). New in this revision, for your eye only (no decision needed unless you disagree): the customer details are now optional on the start screen (revision 3 had them as required for name and number but never blocking), and on a phone the banner hides the role and the site name and shows the caller's name and number, because the site card is directly below it. Also still to do: the IoT helpdesk lead agrees the new ticket subject list (R1), Sam Day on the contractor "override worked" ticket (Q1), the handler briefing note, and, before release, the IoT helpdesk sets up the 12 month automatic deletion in Zendesk (PD-1).
SECTION: Cost, background running and going back
No AI or per-use costs. D13 and D14 are browser code, one shared urgency function and server checks on existing routes, with nothing running in the background. The only cost is a few seconds: one extra click on tickets that were already being raised, and one typed sentence on a P1. The kitchen one-off reuses the dashboard's existing revert timer that already runs silently inside the server; nothing new runs on any computer and no screen, window or notification appears while it waits. The 12 month Zendesk deletion is a setting in the helpdesk tool, not a job we run. The guide pictures add about 1.2 MB of static files to the container image and no running cost. Rollback is a revert of the release; cancel any booked one-offs first.
DECISION: Approve revision 4.3 of the design and proceed to build? | Approve - proceed to build | Block - needs changes
DETAIL: Revision 4.3 changes the prototype, the addendum page and this document only; the live app is untouched. Section 15 lists the open items Q8, Q9, Q10, Q12 and Q14; none blocks the build, but Q9 is your call on scope.
-->

# OOHDASH-146 Design: the agent-screen standard for every flow (revision 4.3: start screen, caller banner, risk question, urgency window and faithful guide, on live v1.6.6)

Date: 2026-11-08 · Base: origin/main `916f6e3` (v1.6.6, includes OOHDASH-159) · Discovery: PR #162 (D1 to D4) · Your UI review of PR #178 (D5 to D12) · Your drift review of 2026-11-05 (items A1 to C6b, "implement your recommendations") · Your decision D13 of 2026-11-07 (the universal risk question) · Your decisions of 2026-11-08 (PD-1, Q11, D14, then D15 and D16 after your review of revision 4.2)

**Review links:** prototype https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-146-mockup.html · PowerPause guide https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-146-powerpause-guide.html · Start screen and caller banner (addendum) https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-146-addendum-calling-banner.html

**Addendum (D15, D16): [labelled frames](mockups/OOHDASH-146-addendum-calling-banner.html)** · **Clickable prototype (the live screens, with the 146 changes applied):** [OOHDASH-146 prototype](mockups/OOHDASH-146-mockup.html) · **Revised PowerPause guide (with pictures):** [guide prototype](oohdash-146/guide/powerpause-contractor-info.html) · **Screen-text diff against live:** [OOHDASH-146-SCREEN-DIFF.md](OOHDASH-146-SCREEN-DIFF.md)

## 1. What changed in revision 4.3

| Part | What was done |
|---|---|
| A. D15: "Who's calling?" is the start | "New call" opens "Who's calling?" with name, role, number and the site search on one screen, exactly as in the earlier demo. Details optional and non-blocking; the call record still starts at site confirm. The old live landing page is under Other screens, labelled as the old version (`HOME-old`). Section 2C. |
| B. D16: a permanent caller banner | On every in-call screen: caller name, number, role if given, and the site. Four states (full; partial; none taken with "Add details"; updated mid-call). Persists across every flow and page structure. Compact and sticky on a phone. Section 2C. |
| C. Prototype | {{NSCREENS}} screens (was 402). Starts on the new screen; the banner control at the top switches state on any screen. Screen-text diff {{NUNEXPL}} unexplained (the banner text is compared separately and mapped to item R17); click test, D13, D14, D15 and D16 checks pass. |
| D. Addendum page | Fifteen labelled frames built from the real prototype screens (section 2C.4), listed in the opening lines of this document. |
| E. Everything from revision 4.2 | Unchanged: PD-1 (12 month backstop), Q11 accepted, D14, build hardening, review links. |

### 1D. Earlier: what changed in revision 4.2 (kept for the record)

| Part | What was done |
|---|---|
| A. PD-1 (fixes the compliance block) | Customer contact data (name, role, phone) in Zendesk gets an automatic deletion backstop of 12 months from ticket close, and an agent can still remove it earlier by hand. Lawful basis: legitimate interests (call-back). How it works and the pre-release item for the IoT helpdesk are in the rework addendum and the data dictionary (section 17). The compliance finding is closed. |
| B. Q11 accepted | A failed kitchen one-off switch-off keeps its automatic P1 (sole exception to "a P1 only through the question" until D14d adds a second). |
| C. D14 urgency window | Fans, kitchen "different times every week", kitchen one-off and air conditioning are filtered by urgency. Section 2B. Q13 is closed as superseded. |
| D. One-off safety question removed | "Will someone be in the kitchen?" is gone; PowerPause only controls power and safe use stays with the site (stated on the screens). |
| E. Build hardening from the review panel | Section 6, rows B27 to B32. |
| F. Prototype | {{NSCREENS}} screens (was 388). Screen-text diff {{NUNEXPL}} unexplained; click test no dead buttons or errors; D13 and D14 checks pass (section 4). |
| G. Review links | The prototype and guide links are at the top of this document (the review is presented through the PR). |

### 1B. Earlier: what changed in revision 4 and 4.1 (kept for the record)

| Part | What was done |
|---|---|
| Revision 4: D13 | The universal risk question (section 2A) with the mandatory P1 comment. |
| Revision 4.1 | IP-1 closed; guide rebuilt as a faithful copy of the Word document (section 5); Q5, Q6, Q7 closed. |

## 1C. Revision 4 table, kept

| Part | What was done |
|---|---|
| A. The question | Every flow asks "Is there an immediate risk to trade or to anyone's health and safety?" (Yes / No), in the live "Ask the customer" box with the live "Customer's answer" chips. Section 2A. |
| B. The only way to a P1 | The kitchen service question, the fridge stock-at-risk question, lighting "still off", the contractor paths, Donkey Derby, Something else "is it urgent" and the one-off switch-off failure no longer raise a P1 on their own. Section 2A.4. |
| C. Mandatory comment | Every P1 confirm screen has "Why is this urgent? (required, goes on the P1 ticket)". The button is disabled until it has at least 10 real characters; the server refuses an empty one. Section 2A.1 and section 6 (B19 to B21). |
| D. Placement | Self-help first (159 J1), question when the problem is still not resolved on the call, none where it was resolved, and before every closed note. Section 2A.3. |
| E. Prototype and checks | {{NSCREENS}} screens (was 298). The screen-text diff still has {{NUNEXPL}} unexplained differences, the click test found no dead buttons or errors, and three new D13 checks pass (section 4). |
| F. Revision 4.1 (your answers of 2026-11-07) | IP-1 closed (rights confirmed), so build step G-2 is unconditional. PD-1 decided: customer contact data stays on the Zendesk ticket until an agent removes it by hand (no fixed period; replaced in revision 4.2 by a 12 month automatic deletion backstop plus manual removal). The PowerPause guide is a faithful copy of the Word document "Lighthouse PowerPause Contractor Info.docx" (section 5). The contactor-override section stays. Q5, Q6 and Q7 are closed. OOHDASH-163 (contractor-on-site flow improvements) is the follow-on story, out of scope. |
| G. Everything else | Unchanged from revision 3, including the rework addendum at the end (now read with the 4.1 notes in it). |

### 1A. Earlier: what changed in revision 3 (kept for the record)

| Part | What was done |
|---|---|
| A. Rebased on live | The prototype is no longer drawn by hand. It was rebuilt from the real v1.6.6 app (fixture mode, writes enabled, as in production) by clicking every button on every flow and saving the screens. Live 159 behaviour and wording are adopted everywhere: automatic save and the "What happened" card, the live P1 confirm step, override first on every kitchen circuit, "come on" is captured and "hasn't" is its own P1, the full override script with the guide link, the equipment picker with "Something not on this list", the timetable form with the Area Manager line, ticket numbers as links, the open-tickets panel, the P1 banner, and the 159 text key. |
| B. Genuine 146 changes kept | Kitchen one-off (D8), Something else (D5, D11), connection-check button removed with the divert kept (D10), "caller" becomes "customer" (B4), hot water closed note (D7), not-on-Lighthouse closed notes (D6), thermostat heating questions (D12), plain control-window wording (D2), Tonight chips, glossary. Each is restyled to the live look. |
| C. Your decisions | C1 "manual override" kept. C2 "I still think it's your equipment" kept. C3 fridge P1 only for stock at risk, as live, flagged for you. C4 customer details non-blocking. C5 "service contractor" everywhere. C6a boiler-panel screens added. C6b the call-record recovery banner is left as live and is not drawn. |
| D. Grammar | Live says "can't show whether them are on" and "has the kitchen — pot wash and kitchen — fryers come on?" on multi-circuit kitchens. New wording: "can't show whether they are on" and "have the kitchen — pot wash and kitchen — fryers come on?". |
| E. Guide pictures | The PowerPause guide gets its pictures (section 5; replaced in revision 4.1 by a faithful copy of the Word document). |

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
| D9 | Customer name, role and number on every ticket | **Amended twice.** Revision 3: non-blocking. Revision 4.3 (D15): asked on the **start screen**, with the site search, instead of after the site is confirmed; optional; the call record still starts at site confirm (E1); "The customer won't give these" records that. The caller banner (D16) replaces the old caller line. |
| D10 | Connection check: no standalone entry, keep the divert | Unchanged. Corrected divert wording replaces the false "Everything at this site is online". |
| D11 | Something else: remove the "it is controlled" dead end | Unchanged. |
| D13 | The universal risk question | **New in revision 4.** Section 2A. |
| D15 | "Who's calling?" is the start screen | **New in revision 4.3.** Section 2C. |
| D16 | A permanent caller banner on every in-call screen | **New in revision 4.3.** Section 2C. |
| D14 | The urgency window | **New in revision 4.2.** Section 2B. Replaces the blanket question on planned requests (Q13). |
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
| Kitchen (every site type, including the glass washer states) | The live "is the kitchen needed for service?" question is replaced in place, after the override did not work, the customer could not find the panel, or "I still think it's your equipment". "Different times every week" and the one-off flow are filtered by urgency instead (section 2B). | The live kitchen P1 confirm, with the comment | The live "not needed until later" ticket, now headed "Kitchen equipment off — no immediate risk" |
| Kitchen: appliance fault ("I'll call our service contractor"), "Something not on this list", no kitchen on Lighthouse | Before the closed note | P1 (equipment Lighthouse does not control), with the comment | The live closed note |
| Outside lighting | After the manual override: on "No, they're still off" | The live lighting P1 confirm, with the comment | A new next-working-day ticket, "External lighting not working — no immediate risk" |
| Extractor fans | Not the risk question: the urgency filter (section 2B): one-off or every week, then when it is needed | A P1 is offered only for an urgent one-off, with the comment | The live ticket (always, for every week or not urgent) |
| Fridges and freezers | The live "is stock at risk?" question is replaced in place | The live fridge P1 confirm, with the comment | The live closed note (Lighthouse does not control fridges) |
| Hot water (all eleven readings) | Before the closed note | Hot water P1 | The closed note |
| Heating, thermostats | After the radiator question ("cold" gives a ticket, "warm" gives a closed note) and before the "Yes, please" log for a thermostat that is not reporting; also before the control-failure tickets ("not delivered", "not confirmed") | Heating P1 | The ticket or the closed note |
| Heating, pub boiler panel | Before the helpdesk ticket when no heating change was made on the call | Heating P1 | The helpdesk ticket |
| Air conditioning | Before the ticket, regardless of Lighthouse not controlling it; the info box says to put an ongoing schedule change in the notes box | Air conditioning P1, with the comment (a long-term part goes in the comment) | The ticket, with the optional notes text |
| Connection check (reached by the automatic divert) | After the customer's checks did not fix it ("No, it's still not working") | Connection P1 | The ticket |
| Contractor on site | After the override did not bring it on, on "No, something else", and at Donkey Derby (where the override does not work) | The live contractor P1 confirm, with the comment | A new next-working-day ticket |
| Something else | "None of these" asks it in place of the live "is it urgent?" question. The other answers start that issue's own flow, which asks it. | The live Something else P1 (its required reason box is now the shared comment) | The live "can wait" ticket |
| Not on Lighthouse here (lighting, fans, heating, air conditioning, kitchen, Something else) | Before the closed note | P1 (equipment Lighthouse does not control), with the comment | The closed note |
| Site could not be identified (house number matches two sites) | Before the "pass it to the IoT team" ticket | P1 (site not identified) | The logged ticket |

Not asked, on purpose (listed so nothing is a silent gap): a kitchen, lighting or heating problem resolved by the override or the fuse board; "the unit's lights are back on"; a kitchen one-off booked or cancelled; "its normal times are fine"; a confirmed control change; a heating boost on the pub boiler panel; "No, leave it" on a thermostat (the customer declined to log it). Not call flows, so not asked: callback lookup, Tonight, and the Tonight query to the IoT helpdesk. The screen-text check proves every other ticket screen is reached only from the question (section 4).

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
| Kitchen one-off: the server raised a P1 if a switch-off failed (design rev 3 section 9) | **Kept (Q11 accepted by you on 2026-11-08)**: still an automatic P1, the sole exception that is not a question until D14d (an urgent one-off the dashboard cannot make, also automatic). See section 2B.3. |

The complete list of ways to a P1 is in section 2B.3: the question; a P1 offered on an urgent fan one-off or an urgent kitchen permanent request; and two automatic exceptions. The server accepts the `escalate-p1` outcome only with a reason (the agent's comment, or a fixed system reason for the two automatic cases), and the device control failure tickets use the normal ticket, as live.

### 2A.5 P1 ticket subjects (the list to confirm with the IoT helpdesk lead)

The subject names the flow and "risk to trade or health and safety". Subjects for the No answer end "no immediate risk". The IoT Support Dashboard keys on the `ooh_p1` tag, not on the subject; the subject change does not break it.

| Flow | P1 subject (Yes) | Normal subject (No) |
|---|---|---|
| Kitchen | Kitchen equipment off — risk to trade or health and safety — P1 | Kitchen equipment off — no immediate risk |
| Kitchen, other (permanent times) | Kitchen equipment — risk to trade or health and safety — P1 (agent confirms, permanent request in the comment) | the live ticket subject |
| Outside lighting | External lighting not working — risk to trade or health and safety — P1 | External lighting not working — no immediate risk |
| Fridges | Refrigeration alarm — risk to trade or health and safety — P1 | live closed note |
| Contractor | Contractor on site — risk to trade or health and safety — P1 | Contractor on site — no immediate risk |
| Contractor, override failed | Contractor on site, PowerPause override failed — risk to trade or health and safety — P1 | Contractor on site, PowerPause override failed — no immediate risk |
| Contractor, Donkey Derby | Contractor on site (Donkey Derby), override unavailable — risk to trade or health and safety — P1 | Contractor on site (Donkey Derby), override unavailable — no immediate risk |
| Something else | Something else — risk to trade or health and safety — P1 | the live "can wait" subject |
| Extractor fans | Extractor fans — urgent one-off — P1 (agent confirms) | the live ticket subject |
| Heating | Heating — risk to trade or health and safety — P1 | the live ticket subject |
| Hot water | Hot water — risk to trade or health and safety — P1 | live closed note |
| Air conditioning | Air conditioning — risk to trade or health and safety — P1 | the live ticket subject |
| Connection | Equipment not connecting — risk to trade or health and safety — P1 | the live ticket subject |
| Not on Lighthouse here | Equipment Lighthouse does not control (kitchen equipment, lighting and so on) — risk to trade or health and safety — P1 | live closed note |
| Kitchen one-off the dashboard cannot make (urgent) | Kitchen one-off could not be set up — urgent request — P1 (automatic) | Kitchen equipment: different times needed (not urgent) |
| Kitchen one-off switch-off failed (overnight) | Kitchen one-off: switch-off failed, equipment may still be on — P1 (automatic) | not applicable |
| Site not identified | Site not identified — risk to trade or health and safety — P1 | the live ticket subject |

### 2A.6 Where D13 meets earlier decisions

| Earlier decision | What D13 does to it |
|---|---|
| 159 J1 (self-help first) | Kept. The question comes after the self-help step, never before it. |
| D5 (customer-answerable options only) | Kept and strengthened: the question is answered by the customer, Yes or No. |
| D6 and D7 (closed "use your service contractor" notes; hot water never a P1) | **Changed, as you directed ("every flow").** The question is asked before every closed note too, and Yes raises a P1 even where Lighthouse cannot fix the equipment, so the on-call agent can call the site back straight away. Hot water was "never a P1" (D7); it can now be one. See Q8 and Q9. |
| OOHDASH-153 | Kept: six sentences literal, `ooh_p1` tag, no OOH text message. The P1 ticket now also carries the agent's comment. |
| Q4 (fridge) | Resolved by D13 (section 2A.4). |

## 2B. D14: the urgency window (new in revision 4.2)

Your decision of 2026-11-08. It replaces the blanket "ask the risk question on planned requests" treatment (old open item Q13). Planned requests (extractor fans, kitchen times, kitchen one-offs, air conditioning schedule changes) are filtered by whether they are really urgent. A P1 is offered only where the change has to happen before the IoT team could reasonably do it.

### 2B.1 The rule

| Term | Meaning |
|---|---|
| Business as usual (BAU) | The IoT support office hours. **Assumed: Monday to Friday 09:00 to 17:00, excluding bank holidays.** This is a guess for you to confirm (open item Q14: exact hours, and whether bank holidays and any weekend cover change it). |
| Response window | The IoT team aims to act within **3 working hours**. Only office hours count: a request made at 19:44 on Tuesday is first actioned from 09:00 on Wednesday, so the earliest it can be done is 12:00 on Wednesday. |
| Urgent | The change is needed **before** the earliest time the IoT team could do it. Examples: needed tonight or before the office opens; an on-time before 12:00 on the next working day (when asked out of hours); a later switch-off or extension asked for after 14:00 on the same working day (14:00 plus 3 working hours is 17:00, closing time). |
| Not urgent | The IoT team can pick it up in time. |

**One shared helper.** The build writes one function, `urgencyOf(neededAt, now)`, used by every flow in this section. It adds three working hours to "now" (skipping evenings, weekends and bank holidays from a small configured list) and compares the result with the time the agent picked as "when it is needed". The screen shows "Urgent — outside office hours" or "Not urgent — the IoT team can pick this up in time". The server runs the same function again; the browser's answer is never trusted. In the prototype "now" is fixed at Tuesday 19:44, and the agent picks the time from four options: tonight (urgent), tomorrow before 12:00 (urgent), tomorrow at 12:00 or later (not urgent), a later day this week (not urgent).

| Raised | Needed | Result |
|---|---|---|
| Tuesday 19:44 | Tonight | Urgent |
| Tuesday 19:44 | Wednesday 11:00 | Urgent (earliest action is Wednesday 12:00) |
| Tuesday 19:44 | Wednesday 12:00 | Not urgent |
| Tuesday 14:30 | Tuesday 23:30 | Urgent (14:30 plus 3 working hours is Wednesday 09:30) |
| Tuesday 13:30 | Tuesday 23:30 | Not urgent (done by 16:30) |
| Friday 18:00 | Monday 11:00 | Urgent (earliest action is Monday 12:00) |
| Friday 18:00 | Monday 12:00 | Not urgent |

Because this dashboard is used out of hours, most requests made on a call arrive when the office is shut and will be urgent when they are needed tonight or early tomorrow; the filter matters for requests about later days.

### 2B.2 What each scenario looks like (state ids are the prototype screen ids)

| Scenario | What the agent sees | Where in the prototype |
|---|---|---|
| **a) Extractor fans** | After the self-help screen, a filter: "Is it just this once, or every week?" Every week goes straight to the normal ticket and no P1 is offered. Just this once asks "When does the customer need this in place?" Urgent shows the "Urgent — outside office hours" banner and the choice Raise a P1 (confirm step with the mandatory comment) or Log a normal ticket. Not urgent shows "Not urgent" and only Log the ticket. | `UK:FAN6851~2` (one-off or every week), `UQ:FAN6851~2` (when), `UU:FAN6851~2` (urgent), `UN:FAN6851~2` (not urgent), `F:fan:Fans` (the P1 confirm); the same four for the controllable-fan path with ids ending `FAN-switch~3` |
| **b) Air conditioning** | Keeps the universal risk question, even though Lighthouse does not control it. The agent decides: Yes raises a P1 with the mandatory comment, and if the request is both urgent and a long-term change, the long-term part goes in that comment and so into the P1 ticket. No (not urgent, not permanent) gives the normal ticket. The agent info box says to write any ongoing schedule change in the notes box, which goes on the ticket. | `RQ:AC6218~1` (question and the note), `F:ac:Air` (P1 confirm with the long-term note), `AC6218~1` (normal ticket) |
| **c) Kitchen "different times every week"** | After the times form, "When does the customer need this in place?" Not urgent gives a normal ticket and no P1 is offered. Urgent shows the banner and lets the agent raise a P1, entering the permanent request in the comment so the IoT team can sort it out; or log a normal ticket. | `UQ:`, `UU:`, `UN:` screens for `K8888~46`, `K8888~51`, `K6832~23`, `K6832~28`, `K6832~33`; P1 confirm `F:kitchen:Kitchen` |
| **d) Kitchen one-off** | The "will someone be in the kitchen?" question is gone. PowerPause only controls the power to the equipment; starting it, stopping it and using it safely stays the site's responsibility, and the agent info box and the Say both say so. If the request is urgent and the dashboard can make the change, the agent books it (the live one-off booking) and a ticket goes to the IoT team for the record and next-day review. If the dashboard cannot make the change and it is urgent, a P1 is raised **automatically** (no question, no comment: nobody typed one). Not urgent gives a normal ticket. | Booked: `K-confirm-later`, `K-confirm-earlier` (banner "Urgent", no safety question), `K-booked-later`, `K-booked-earlier`. Cannot make the change: `K-when-unknown` (older or legacy site, or one-off not available), `K-book-fail` (the equipment did not respond), both ending at `K-auto-p1` when urgent. Not urgent: `K-normal` (reached from `K-when` "needed for a later day" and from `K-when-unknown`) |

### 2B.3 The only ways to a P1

D13 made the universal question the only way to a P1. With D14 and your answer on Q11 the complete list is:

1. **The universal risk question** (section 2A): the agent answers Yes and writes why it is urgent.
2. **D14a and D14c: a P1 is offered, not forced.** It is offered only when the request is an urgent one-off (fans) or an urgent permanent timetable request (kitchen), and the agent still confirms it with the mandatory comment. When it is not urgent, no P1 is offered at all.
3. **Two automatic exceptions**, because nobody is on a call to ask a question: (i) a kitchen one-off whose switch-off fails and the circuit is still on 10 minutes after its end time (Q11, accepted by you on 2026-11-08); (ii) D14d: an urgent kitchen one-off that the dashboard cannot make. Both go through the same `escalate-p1` outcome with the tag `ooh_p1`, a fixed system reason ("Automatic: ..."), and the origin recorded as automatic, so the server check "a P1 needs a reason" is satisfied by the system text and never by an empty field.

### 2B.4 What D14 changes from revision 4

| Revision 4 | Revision 4.2 |
|---|---|
| Fans, kitchen "different times every week" and the "nobody will be there" refusal all asked the risk question (open item Q13) | Replaced by the urgency filter above. Q13 is closed as superseded. |
| A kitchen one-off asked "will someone be in the kitchen?" and refused when the answer was no | The question is removed; responsibility for safe use stays with the site and is stated on the screens. |
| A failed one-off booking logged a normal ticket | Urgent: a P1 is raised automatically. Not urgent: a normal ticket. |
| A failed switch-off raised a normal ticket (open item Q11) | Back to an automatic P1. You accepted this as the sole exception to "a P1 only through the question", now one of two. |

## 2C. D15 and D16: the start screen and the caller banner (new in revision 4.3)

Your decisions of 2026-11-08, after reviewing revision 4.2. The frames are in the addendum page and the same screens are in the prototype (group "Who's calling? and the caller banner").

### 2C.1 D15: "Who's calling?" is the start screen

| Part | Design |
|---|---|
| What opens | Clicking "New call" opens "Who's calling?" (`HOME`). Same look as the live cards. Top: the say line "Can I take your name, your role, and the best number to reach you on?" and three boxes: customer's name, their role, best contact number, all labelled optional. Below: "Which site is it?" with the live site search and the callback link. |
| Optional, never blocking | Nothing is required. The agent can type in the site search with every box empty. "The customer won't give these" records that the customer declined (the ticket line then reads "Customer contact: declined to give details"). The call record still starts when the site is confirmed (E1), so nothing the agent does here can delay or lose the call. |
| Where the details go | In memory for the call (`state.caller`), then on every ticket from the call as the existing internal `[TRG]` line (D9, B31 stripping). Not in the P1 text, Tonight, the audit log or browser storage. PD-1 is unchanged: 12 month automatic deletion after ticket close, or earlier by an agent. |
| Old landing page | Kept under Other screens as `HOME-old`, "the old live landing page (kept for comparison; no longer the start)". It is the live screen, unchanged. |
| Prototype states | `HOME` (empty, the start), `CD-partial` (name and role typed, no number), `CD-results` (all three typed, site search showing the result). |

### 2C.2 D16: the permanent caller banner

| State | What the banner says | Notes |
|---|---|---|
| 1. Full details | "📞 Priya Shah · duty manager · 07700 900123" on the left, "Call in progress · The Wheatsheaf 7412" on the right, and a "Change" button | Role only shown if given |
| 2. Partial | Name only: "Priya Shah · no number taken". Number only: "07700 900123 · no name taken". Role only: "duty manager · no name or number taken". An "Add details" button | The missing part is quiet grey |
| 3. None taken | "No contact details taken" (or "(the customer declined)") in quiet grey, "Call in progress · site", and an "Add details" button | Optional and never blocks |
| 4. Added mid-call | "Add details" or "Change" opens one small screen (`CD-add`) with the three boxes pre-filled with what is known. "Save details" returns the agent to the screen they were on and the banner updates at once; "Back to the call" cancels | A screen-reader message "Customer details saved. The call banner is updated." is spoken once on save |

It appears from the site screen onwards: every flow screen (kitchen, heating and the pub boiler panel, outside lighting, fans, fridges, hot water, air conditioning, contractor, Something else, connection check), the P1 confirm step and its after-card, the ticket link screens, the failed-P1 screen, the device control windows (behind the window) and the end-of-call card. It does not appear before the site is confirmed (start screen, site confirmation, no match, ambiguous site), on Callback Lookup or on Tonight. Colours, type size and spacing are the live card tokens (a light grey surface, a thin border, 13 px text): neutral, not alarming. It never takes colour from P1 or error states.

On a phone (640 px and narrower) it becomes one compact line (about 36 px high): the caller on the left, "Add details" or "Change" on the right, the role and the site name hidden (the site card is directly below, and the number must never be cut off). It is sticky under the top bar, so it stays visible while the agent scrolls, and the say box stays on the first screen of every flow (the prototype check measures how far the banner moves the say box: section 4).

### 2C.3 Build rows, tests and accessibility

| # | File | Change |
|---|---|---|
| B33 | `public/js/views.js` (new `callerBanner(state)` component), `public/js/app.js` | One shared component renders the banner from `state.caller` (`name`, `role`, `phone`, `declined`) and the confirmed site. Called by the shared flow shell, the site screen and the device control window host, so no flow draws its own. States as section 2C.2. Remove the old `callerline` rendering. |
| B34 | `public/js/app.js` | State lives in `state.caller` (memory only, set on the start screen or from "Add details", cleared at End call, never in sessionStorage or localStorage). `setCaller(patch)` updates it and re-renders only the banner element, with no network call. The `customerContact` object on ticket posts is built from `state.caller` (unchanged sending, B10, B31). |
| B35 | `public/js/views.js` | The new-call view becomes "Who's calling?" with the three optional boxes and the site search; the "details after site confirm" card is removed; the site screen no longer asks for details. The callback link and the call-record start (E1) are unchanged. An "Add details" screen (`views.js`) with pre-filled boxes returns to the screen the agent was on. |
| B36 | `public/css/styles.css` | `.callbanner` (sticky under the top bar, neutral surface), `.cb-quiet`, `.cd-grid`, the 640 px compact rule, and a print rule (`position: static`). Replaces `.callerline`. |
| B37 | accessibility | `role="region"` with `aria-label="Call in progress"`; the banner is not a live region, so it is not read out on every screen change; one visually hidden `role="status"` node is written only when details are saved; "Add details" and "Change" are real buttons in the tab order; text contrast meets AA on the grey surface; no animation; print and screenshot safe (no overlay, static on print). |

| ID | Type | Case |
|---|---|---|
| D15-1 | e2e | New call opens "Who's calling?" with the three optional boxes and the site search; the site search works with all boxes empty; "The customer won't give these" records the decline; the call record starts at site confirm. |
| D15-2 | unit | No code path requires a name or a number before the site search or the first issue. |
| D16-1 | e2e | The banner is on every in-call screen listed in section 2C.2 in each of the four states, and not before the site is confirmed. |
| D16-2 | e2e | None taken shows "No contact details taken" and an "Add details" button that never blocks; adding a name then a number updates the banner and returns to the same screen. |
| D16-3 | unit | The banner text for name only, number only and role only; a name with markup or a new line is shown as text on one line (B31). |
| D16-4 | e2e (phone width 390) | The banner is one line, sticky, at most 44 px high, and the say box is still on the first screen of the kitchen override step. |
| D16-5 | e2e | Screen reader: the banner is a labelled region; saving details announces once; no announcement on ordinary screen changes. |
| D16-6 | e2e | No contact data in the banner after End call; the next call starts empty. |

### 2C.4 The addendum page (the frames)

`oohdash-146-addendum-calling-banner.html` is built from the real prototype screens (live look) by `build-addendum.mjs`. Frames: 1 start screen, empty; 2 start screen, partly filled; 3 start screen with site search result; 4 site screen, full details; 5 kitchen override step, full details; 6 heating boiler panel, partial (name only); 7 Something else risk question, none taken with "Add details"; 8 outside lighting, full details; 9 contractor, partial (number only); 10 P1 confirm with the mandatory comment filled; 11 P1 after-card and End call, partial (number only); 12 "Add details" screen opened mid-call; 13 the same kitchen screen after details were added (banner updated); 14 kitchen override step at phone width; 15 Something else risk question at phone width, none taken.

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

## 5. PowerPause guide: a faithful copy of the Word document (revision 4.1)

### 5.1 What is wrong today

Live serves `public/guides/powerpause-contractor-info.html`, a text-only page written for 159. The device pictures from the original Word document never reached it, and the page was reworded rather than copied.

### 5.2 Design: copy the document, change nothing

Your instruction: the guide exists already, just copy the Word document. The source is **"Lighthouse PowerPause Contractor Info.docx"** (in the Remote Monitoring - General library: Customer Sites, Greene King, Flaming Grills, Phase 2 Sites, Engineer Information; file dated 16 April 2026). It was found after the cheat sheet turned out to hold only the label and the logo. The page is built from the document's own XML by `docs/project/oohdash-146/build-guide.mjs`, so nothing is retyped:

- Text, headings, bullets and order are exactly the document's, including its wording ("Tongou & Owon", "Bain Maire", "Power Pause", "Baine Marie") and its own spelling. Nothing is corrected or refined.
- The support line is the document's: E: iot@airedale-group.co.uk, T: 023 814 0228. This closes Q5.
- Tongou and Owon are described exactly as the document does: the two override pictures with their captions, and "Single Phase Appliances" and "Three Phase Appliances" as separate headings under "Manual Override Button". The page adds no statement that pairs one device with one phase. This closes Q6, as per the Word document.
- The fire-up and fire-down table is copied as a real table (21 rows, 6 columns).
- The "Contactor Override" section is kept, as you asked. This closes Q7. Improvements to the contractor flow (ask override or something else, choose the device, read the instructions, email them to the engineer) are story OOHDASH-163 and are out of scope.
- All **12 pictures** in the document are included (the Word file holds image1 to image12), placed by following the document's own picture references. Body pictures, in the document's places: the interlock panel, Tongou, Owon, the Lighthouse label, example kitchen panel, example interlock panel, example ceiling panel, example bar panel, single phase button, three phase button and the contactor. The twelfth is the page-header logo (the header repeats on every Word page, so it is shown once at the top). The contactor picture is stored in the document as a Windows metafile (EMF) that browsers cannot show, so it was converted to PNG without any change to the picture. Pictures are only reduced in file size (largest side 900 pixels); each has a plain description for screen readers.
- Total picture weight about 1.2 MB (one figure everywhere in this document); no running cost.

**Picture provenance and rights (the compliance residual, closed in revision 4.2).** All twelve pictures come from the same Word document, which you confirmed (IP-1, 2026-11-07) as rights-cleared. That confirmation covers the Tongou, Owon and other device pictures: they carry no third-party reproduction restriction. The "Rights basis" column below reads "confirmed (IP-1)" for every row; the build gate does not need to re-check it.

| # | Picture (position in the document) | File | Rights basis |
|---|---|---|---|
| 0 | Lighthouse logo (page header) | `doc-0-header-logo.png` | confirmed (IP-1) |
| 1 | Interlock panel, green light and start button (under "Safety Interlock Appliances") | `doc-1-interlock-panel.jpg` | confirmed (IP-1) |
| 2 | Tongou device with the override button (under "All Devices connected to Power Pause") | `doc-2-tongou.png` | confirmed (IP-1); device picture, no third-party restriction |
| 3 | Owon meter with the override button | `doc-3-owon.png` | confirmed (IP-1); device picture, no third-party restriction |
| 4 | The Lighthouse label ("Look for This Label") | `doc-4-label.png` | confirmed (IP-1) |
| 5 | Example kitchen PowerPause panel | `doc-5-kitchen-panel.jpg` | confirmed (IP-1) |
| 6 | Example interlock panel | `doc-6-interlock-panel.jpg` | confirmed (IP-1) |
| 7 | Example ceiling panel | `doc-7-ceiling-panel.jpg` | confirmed (IP-1) |
| 8 | Example bar panel | `doc-8-bar-panel.jpg` | confirmed (IP-1) |
| 9 | Single phase manual override button | `doc-9-single-phase.png` | confirmed (IP-1); device picture, no third-party restriction |
| 10 | Three phase manual override button | `doc-10-three-phase.png` | confirmed (IP-1); device picture, no third-party restriction |
| 11 | Contactor with manual switch (converted from the document's EMF) | `doc-11-contactor.png` | confirmed (IP-1); device picture, no third-party restriction |

The review copy is `docs/project/mockups/oohdash-146-powerpause-guide.html` (pictures inside the file) and the build copy is `docs/project/oohdash-146/guide/powerpause-contractor-info.html` with its pictures in `guide/powerpause/`.

### 5.3 Build instruction

| # | Do |
|---|---|
| G-1 | Copy `docs/project/oohdash-146/guide/powerpause-contractor-info.html` over `public/guides/powerpause-contractor-info.html`. |
| G-2 | Copy the twelve picture files in `docs/project/oohdash-146/guide/powerpause/` (`doc-*.jpg` and `doc-*.png`) to `public/guides/powerpause/`. **Unconditional: IP-1 is closed (rights confirmed by James, 2026-11-07).** |
| G-3 | No code change to `server.js`: the picture URLs are `/guides/powerpause/<name>.jpg or .png`, two path segments, so the existing `/guides/:file` route (single `.html` file only) does not match them and they fall through to `express.static(public)`, which is already behind `requireAuth`. The Dockerfile already copies all of `public/`. |
| G-4 | Remove the now-unused `docs/project/guides/powerpause/page-*.jpg` and `docs/project/guides/powerpause-contractor-info.html` (the nine page scans stay as source material under `docs/`; they are never served). Keep them if the team wants the originals. |
| G-5 | Add `test/guide-pictures.test.js` and a Playwright check (section 9): signed in, the guide returns 200 and every `img` has a non-zero natural width; signed out, a picture URL is refused like the page; every `img` has an `alt` of 20 or more characters; no picture over 300 KB; the page contains the phone number 023 814 0228 and no other support number. |
| G-6 | Cost: static files only, about 1.2 MB added to the image, no running cost. Nothing polls, nothing runs in the background. |

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
| B17 | `public/css/styles.css` | `.callbanner` family (B36), `.oneoff-banner` only. D13 adds no CSS: the comment box reuses the live `formrow` and `p1-blocked-note` styles (OOHDASH-134). |
| B19 | `public/js/flows.js` (new shared helper) | D13: `riskQuestion(f, {yes, no})` renders the exact question (constant `RISK_ASK`), the grey "for you" note and the Yes / No chips, and records the answer as the known-so-far line "Immediate risk to trade or to anyone's health and safety: yes or no". Every flow calls it at the place listed in section 2A.3 and nowhere else. Remove `SERVICE_ASK` (about line 2112) and its screens (about 2290 to 2303), the fridge stock-at-risk question, and the Something else "is it urgent" step. Straight quotes only. |
| B20 | `public/js/flows.js` (new shared helper) | D13: `p1ReasonBox(f)` and `p1ReasonValid(text)`: label "Why is this urgent? (required, goes on the P1 ticket)", textarea `data-testid="p1-reason"`, up to 500 characters; valid means at least 10 characters after trimming and collapsing spaces. `outcomeP1` and the Something else P1 render the box above `p1WarnBox()`; the "Raise the P1" button is rendered `disabled` and enabled by an input handler (same pattern as the live `otherP1ReasonInput`); the ticket box shows "Why it's urgent (your words)". The comment is sent as `p1Reason` and as `p1Summary` (cut to 80 characters as `otherP1Summary` does today). |
| B21 | `routes/api.js` (/api/outcomes), `services/zendesk.js` | D13: when `type === 'escalate-p1'` the server collapses whitespace in `p1Reason` and returns 400 ("A P1 needs a reason of at least 10 characters") if it is shorter than 10 or longer than 500. The reason is written into the ticket's first internal `[TRG]` comment as a labelled line "Why urgent (agent): …" after the Operator line, never in the subject. The two automatic P1s (switch-off failure, urgent one-off that cannot be made) send `p1Origin: 'automatic'` with a fixed system reason ("Automatic: ..."), and the server accepts `automatic` only from the one-off code path, never from a browser post. `escalate-p1` stays the only outcome type that sets priority urgent and the `ooh_p1` tag. |
| B22 | `public/js/flows.js` subjects | D13: the subject list in section 2A.5, the "no immediate risk" subject for No tickets, the new Say and "what goes on the ticket" texts. The P1 confirm Say becomes: "Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team." |
| B23 | `public/js/flows.js` lighting, contractor | D13: lighting "No, they're still off" and the three contractor paths ask the question first; add the new normal tickets for No (lighting still off; contractor, something else; contractor, override failed; Donkey Derby). Reword the contractor first-screen line (section 2A.4). |
| B24 | `public/js/flows.js` closed notes and hot water, fans, air conditioning, heating, boiler panel, connection | D13: ask the question before the ticket or closed note in each place listed in section 2A.3; Yes uses the P1 family for that flow (section 2A.5). |
| B25 | `services/oneoffs.js` (section 9) | Q11 accepted: a failed switch-off keeps its automatic P1 through `escalate-p1` (new ticket, `ooh_p1`, `p1Origin: 'automatic'`). D14d: when an urgent one-off cannot be made (no one-off for the site or circuit, flag off, times unreadable, equipment not responding at booking) the browser raises the automatic P1; not urgent gives a normal ticket. The `OohOneOffAttended` field and its question are removed. |
| B26 | `public/js/views.js` site not identified | D13: the "pass it to the IoT team" button on the house-number-matches-two-sites screen asks the question first. |
| B27 | `public/js/urgency.js` (new, shared with the server) | D14: `urgencyOf(neededAt, now)`: adds 3 working hours to now using office hours Mon to Fri 09:00 to 17:00 (configurable `OOH_OFFICE_HOURS`) and a bank holiday list (`config/bank-holidays.json`); urgent when neededAt is earlier than that time. Pure function, unit-tested with the table in section 2B.1. The server calls it again on `POST /api/outcomes` (fans, kitchen times) and `POST /api/oneoffs`; the browser result is never trusted. |
| B28 | `public/js/flows.js` fans, kitchen times, kitchen one-off, air conditioning | D14: the one-off or every week filter and the "when is it needed" question for fans; the same "when" question before the kitchen permanent timetable ticket and in the kitchen one-off fallback; an urgent banner with Raise a P1 (confirm with comment) or Log a normal ticket; a not-urgent screen with no P1 path; remove the "will someone be in the kitchen" step; air conditioning keeps the risk question plus the notes hint. |
| B29 | `routes/api.js` `POST /api/oneoffs` | Hardening: bind `siteNo` and `deviceId` to the site confirmed on the current call (the same non-consuming call check the cancel route uses); refuse a device that does not belong to that site; refuse a one-off that `urgencyOf` says is not urgent. |
| B30 | `services/overrides.js`, `services/oneoffs.js` | Hardening: the duplicate-booking guard must not be in memory only. Make it store-backed (a unique key on site, device and start time in `OohOverrides`, written with the booking in one operation) so it holds across restarts and across more than one server copy; also confirm in the deployment manifest how many replicas run today (recorded at release). |
| B31 | `routes/api.js`, `services/zendesk.js`, `public/js/flows.js` | Hardening: before `p1Reason` or the customer contact line is written into the `[TRG]` comment, remove carriage returns and line feeds (collapse to single spaces) and strip any text that looks like a ticket anchor at the start of a line or after the collapsed text (`Operator:`, `Outcome:`, `Caller's words:`, `Customer contact:`, `Why urgent (agent):`, case-insensitive), so a typed value can never forge a line the IoT Support Dashboard reads. When either value is shown back on a screen (the ticket box echo, the call record, Tonight) it is escaped for the place it lands (text content, attribute, or URL), never concatenated into HTML. Tests: a value containing a new line and "Outcome: solved" produces one line and no anchor; a value containing a script tag is shown as text. |
| B32 | `test/` and the prototype checks | Hardening: the disabled-button test covers every P1 confirm screen, including the retry screen shown after a failed raise (pre-filled, so it starts enabled; clearing the comment disables it again; typing enables it). The earlier count of 45 of 46 was this screen. |
| B26 |
| B18 | IoT Support Dashboard (separate repo, own small gate) | `OUTCOME_LABELS`: `'boiler-boost': 'heating changed'`; closed notes stay "advice given". |

Rules for the build: keep every `data-testid` the 159 tests rely on (`after-say`, `after-ticket`, `ticket-box`, `p1-confirm-warning`, `record-outcome`, `known-so-far`, `customer-answers`, `ask-customer`, `override-guide-link`, `sched-*`, `end-block`, `publish-note`). The six OOHDASH-153 sentences stay literal. The ticket body anchors `Operator:`, `Caller's words:` and `Outcome:` are not renamed (the IoT Support Dashboard parses them); only the display wording in R10 changes. Straight quotes as JS delimiters (a curly quote shipped as a SyntaxError in v1.5.3).

## 7. D6: closed tickets (what live already does, what 146 adds)

Live 159 already creates the ticket closed for: kitchen "Something not on this list", kitchen appliance faults ("I'll call our service contractor"), fridge "just a query", and the Something else "not on Lighthouse" answers. 146 adds the same for hot water at every site, and for lighting, fans, heating and air conditioning where the site has none. The mechanism is the live one; no new server capability is needed beyond making those flows use it.

The Say always names who to call: "please contact your service contractor through your usual route" (C5). The ticket records the call for the history only.

## 8. `ctlRelease`: branched on ticket success (D2, kept)

{{S7}}

## 9. D8: kitchen one-off change for the next time only (restyled to the live look)

Screens: K-what, K-when-pick, K-when, K-fine, K-later, K-earlier, K-confirm-later, K-confirm-earlier, K-booked-later, K-booked-earlier, K-normal, K-auto-p1, K-book-fail, K-cancelled, K-when-unknown and the banner on the site screen (prototype group "Kitchen: one-off change for next time").

{{S8}}

## 10. D9: customer details (non-blocking)

| Item | Design |
|---|---|
| Where | **Revision 4.3 (D15): on the start screen "Who's calling?", above the site search, optional.** Not a card on the site screen any more. The call record still starts at site confirm (E1). A permanent caller banner (D16) shows the details on every in-call screen; "Add details" adds or changes them mid-call. |
| Fields | Customer's name (required, up to 80 characters); their role (optional, up to 40; suggestions: duty manager, general manager, chef, staff, contractor); best contact number (required, 7 to 20 characters of digits, spaces, plus, brackets and dashes). The contractor flow fills the role as "Contractor". |
| Declined | "The customer won't give these" records `OohCustomerDeclined: true`; the ticket line then reads "Customer contact: declined to give details". The call is never blocked. |
| Held in the browser | `state.caller` in memory only, kept for every issue in the call, cleared at End call. Never in sessionStorage or localStorage. The permanent banner (D16, section 2C) shows "Priya Shah · duty manager · 07700 900123" and the site on every in-call screen. |
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
| Urgent — outside office hours / Not urgent — the IoT team can pick this up in time (the two banners; nothing else) | "peak", "SLA breach", "out of SLA", "priority" | fans, kitchen times and one-offs (D14) |
| When does the customer need this in place? | "deadline", "ETA" | fans, kitchen times, kitchen one-off fallback (D14) |
| PowerPause only controls the power to the equipment; starting it, stopping it and using it safely stays the site's responsibility | "will someone be in the kitchen", "safe to switch on" | kitchen one-off (D14d) |
| Who's calling? (start screen) · No contact details taken · Add details · Call in progress | "Customer details required", "Caller", "Contact missing" | start screen and caller banner (D15, D16) |
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
| R5 | Kitchen one-off switches real equipment later with nobody watching the dashboard. | Limits, never late, missed reported, a failed switch-off raises the automatic P1 (accepted, Q11), PowerPause only controls power and safe use stays with the site, off by default, proven end to end before it is turned on. |
| R6 | The one-off depends on the live kitchen read and the Tuya switch path, both unproven in production. | It does not appear until both are on and proven; time requests go to the live timetable form meanwhile. |
| R7 | Customer name and number are personal data. | Zendesk internal comment only; browser memory only; never in OOH stores, logs, Tonight or SMS. |
| R8 | Rollback. | Revert the release (previous image by digest). Cancel any booked one-offs from the site screen first. |
| Q1 | A contractor's "the override worked" outcome: 159 decision J1 already records it as a normal ticket for the contractor flow. | Ask Sam Day only if you want the other flows to match (owner: James). |
| Q2 | Which solved status should closed notes use. | Live already creates closed tickets; recommended: the same status. IoT helpdesk lead confirms; not blocking. |
| Q3 | Should customer details later move to Zendesk requester or custom fields. | Recommended no for this release. |
| Q4 | **Fridge stock at risk is a P1 (live), reversing the 146 D6 wording that fridges are never a P1.** | **Resolved by D13 (revision 4):** a fridge is a P1 only through the universal question; "stock at risk" is one kind of immediate risk to trade. |
| Q5 | The support phone number differs between documents: the Word cheat sheet says 023 8144 0228, the contractor guide says 023 814 0228, and the label says +44 (0)23 814 0228. The P1 failure screen uses 023 814 0228 (from the 146 failure-path design). | **Closed (revision 4.1).** As per the Word document: 023 814 0228. The P1 failure screen keeps the same number. |
| Q6 | The guide pairs Tongou with single-phase and Owon with three-phase. | **Closed (revision 4.1).** As per the Word document: no pairing statement is added. |
| Q7 | The guide's contactor-override section (page 9 of the contractor guide) tells a contractor how to run an appliance when the PowerPause is faulty. | **Closed (revision 4.1).** Kept; improvements are story OOHDASH-163, out of scope. |
| IP-1 | Rights to use the guide pictures. | **Closed (2026-11-07):** you confirmed the rights. This includes the Tongou, Owon and other device pictures: they carry no third-party reproduction restriction. Build step G-2 is unconditional. |
| PD-1 | Retention of the customer contact line in Zendesk (compliance finding on revision 4.1). | **Decided by you on 2026-11-08, finding closed:** an automatic deletion backstop of 12 months from ticket close, plus agents can remove the line by hand earlier. Lawful basis: legitimate interests (call-back). How the backstop works and who sets it up: rework addendum and section 17. Pre-release item for the IoT helpdesk. |
| Q8 | **D13 reverses D7: hot water can now be a P1.** D7 said hot water is never a P1 because Lighthouse has no hot water control. You said every flow asks the question, so it does. | Applied as you directed. Check that a hot water P1 is wanted: the on-call agent can only call back and advise. |
| Q9 | **D13 on equipment Lighthouse does not control (D6/D7 closed notes, fridges, hot water, "not on Lighthouse here", radiators and appliance faults).** You said every flow. Yes raises a P1 so the on-call agent can call back immediately, but the on-call team cannot fix that equipment. | Applied as you directed, with the Say telling the customer to contact their own service contractor as well. Please confirm. The alternative is No-only on those paths (closed note, no P1). |
| Q10 | **The contractor rule "calls are always treated as urgent" is gone.** An engineer waiting on site is now a P1 only if the customer answers Yes. | Applied for consistency. Sam Day may want to confirm the rule for contractors. |
| Q11 | **Failed kitchen one-off switch-off keeps its automatic P1.** | **Accepted by you on 2026-11-08.** It is an exception to "a P1 only through the question" because nobody is on a call to ask. D14d adds a second automatic case (section 2B.3). |
| Q12 | You wrote "the on-call agent"; the live screens and the six 153 sentences say "the on-duty manager" (for example "It pages the on-duty manager straight away"). | Left as live. Say if you want them renamed (small wording change, one place). |
| Q13 | Planned requests (kitchen "different times every week", fans, air conditioning, the "nobody will be there" refusal) asking the risk question. | **Closed, superseded by D14 (2026-11-08):** planned requests are filtered by urgency instead (section 2B). |
| Q14 | **Office hours for D14 are assumed:** Monday to Friday 09:00 to 17:00 excluding bank holidays, 3 working hour response. | Please confirm the exact hours (and any weekend or bank holiday cover). The rule is one configurable setting, so a change is a one-line edit; the prototype wording uses these hours. |

## 16. Tests the build must add (and prove they fail on the old code)

| ID | Type | Case |
|---|---|---|
| GOLD-146 | unit, golden | vm-load `flows.js` and `control.js`; render each changed screen listed in section 3 with fixed data and compare with `test/fixtures/oohdash-146-screens.json` (generated from `docs/project/oohdash-146/proto-nodes.json` and the prototype text). Unchanged live screens are covered by the existing 159 tests. |
| LEX-146 | unit | No rendered screen contains: "needed for service", "will someone be in the kitchen", "stock at risk" as a question, "Yes, it's urgent", "No, it can wait", caller, setpoint, frost-hold, "manual control button", "on-site switch", "repairs engineer", "refrigeration engineer", "boiler or service engineer", "Check and log", device-id patterns. |
| D5-146 | unit | No rendered button label is one of the removed agent choices: "Scope guidance", "Give the radiator advice", "Raise the setpoint anyway", "Adjust the setpoint anyway", "Check if it's Lighthouse-controlled", "Pass it to the IoT team as described", "Continue under Something else", "Run connection check". |
| HW-146 | unit + route | Every hot water reading ends on the closed note; hot water scope level is never `ctl`; the twins agree. |
| NLH-146 | e2e | Lighting, fans, heating and air conditioning with none at the site end on a closed note with the "Which equipment is it?" box. |
| CN-146 | e2e | No "Run connection check" button; typing "router" or "offline" suggests nothing; a device offline at an otherwise online site never shows "Everything at this site is showing online". |
| O-146 | e2e | Something else: each answer starts that flow or ends on the closed note; "None of these" asks the universal question; Yes with a comment raises the 153 P1. |
| D13-1 | e2e, every flow | For each flow in section 2A.3, drive to the unresolved point and assert the exact question text "Is there an immediate risk to trade or to anyone's health and safety?" with chips Yes and No; the kitchen, fridge and Something else screens no longer contain the old questions. |
| D13-2 | e2e | Yes opens the P1 confirm step; with an empty, spaces-only or nine-character comment the Raise the P1 button is disabled; with ten real characters it is enabled; the comment is on the ticket. |
| D13-3 | route | `POST /api/outcomes` with `type: escalate-p1` and no, blank, or short `p1Reason` returns 400 and creates no ticket; with a valid reason it creates the ticket with `ooh_p1`, priority urgent and "Why urgent (agent): …" in the first internal comment. |
| D13-4 | e2e | No gives the next-working-day ticket in the live wording (`It's logged, reference N`) or the live closed note; the subject ends "no immediate risk" where listed in section 2A.5. |
| D13-5 | unit | No code path other than the shared question, the two D14 offers and the two automatic exceptions reaches `escalate-p1`: a source check that every `outcomeP1` call is preceded by `riskQuestion` or an urgent screen, and that `services/oneoffs.js` posts `escalate-p1` only with `p1Origin: 'automatic'` in the two named cases. |
| D14-1 | unit | `urgencyOf` gives the results in the table in section 2B.1 (including Friday 18:00 to Monday 11:00 urgent, bank holiday Monday pushes the window to Tuesday, and the 14:00 boundary). |
| D14-2 | e2e | Fans: "Every week" gives the normal ticket with no P1 offered; "Just this once" and not urgent gives the normal ticket with no P1 offered; "Just this once" and urgent shows the banner, offers Raise a P1 (comment mandatory) or a normal ticket. |
| D14-3 | e2e | Kitchen "different times every week": not urgent has no P1 path; urgent offers a P1 with the comment. |
| D14-4 | e2e + route | Kitchen one-off: no "will someone be in the kitchen" step anywhere; urgent and supported books it (ticket for next-day review); urgent and unsupported (flag off, older site, equipment not responding) raises a P1 automatically with the system reason and no comment box; not urgent is a normal ticket; `POST /api/oneoffs` for a site not confirmed on the call, or a device not at that site, is refused. |
| D14-5 | e2e | Air conditioning: the risk question; Yes needs the comment; No gives the normal ticket; the notes hint is shown. |
| HARD-1 | unit | `p1Reason` and the customer contact line with new lines, "Operator:", "Outcome:" or "Caller's words:" produce a single line and no forged anchor; values with markup are shown as text. |
| HARD-2 | unit + route | The one-off duplicate guard holds across a restart (store-backed). |
| D13-6 | e2e | Resolved-on-the-call paths (override worked, fuse board, lights came on, confirmed control change, one-off booked, boiler boost) do not show the question. |
| D13-7 | e2e | The unmanaged paths (closed notes, hot water, fridge) show the question; Yes raises the unmanaged P1 and the Say tells the customer to contact their service contractor too. |
| HEAT-146 | e2e | Room below target, "Warmer" or "It's not working": the radiator question; warm gives the closed note, cold gives a ticket. |
| CD-146 | e2e + route | Start screen as section 2C.1; issue buttons never blocked; `[TRG]` has "Customer contact: …"; the P1 text, `OohSmsLog`, audit entry, Tonight row and sessionStorage contain no phone number; the declined path. |
| ONE-1..7 | unit, worker, route, e2e | As in section 9: booking refusals, worker steps and lease, offline retry then missed, switch-off failure raises the automatic P1 (Q11), cancel, no timetable keys written, booked wording only on a 200 with a booking id. |
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
| Kitchen one-off | 8888 with `OOH_KITCHEN_ONEOFF_ENABLED=true`; fake clock in unit tests | on later, on earlier (urgent, booked), not urgent, one-off unavailable (automatic P1), equipment not responding at booking, cancel, switch-off failure (stub, automatic P1) |
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
1. New call: "Who's calling?" opens with the site search on the same screen. Type the site search with the boxes empty (it must work); the banner after confirming says "No contact details taken" with "Add details". End the call, start again, enter Priya Shah, duty manager, 07700 900123, find 6832, confirm: the banner shows her name, role and number and the site on every screen below. "Add details" mid-call updates the banner and returns you to the same screen. Check one flow at phone width (390 pixels): the banner is one line and the say box is still on screen. Also check the other starts: name only gives "no number taken", number only gives "no name taken".
2. Kitchen 8888: "I need it at a different time", Fryer, "On later tonight", "Until midnight": the check card shows "Urgent — outside office hours" and no "will someone be there" question; Book it: booked card with the ticket link and Cancel; site banner; Tonight shows "one-off booked". Then "Needed for a later day": a normal ticket, no booking, no P1. On the older site 6832 "different times": the "when" question; tonight gives an automatic P1 with no comment box.
3. Kitchen 8888: "It's not working", Fryer: the live override script with the guide link; "Yes, it's come on" gives the live captured ticket, no question and no P1. "No, it hasn't come on" asks the universal question: No gives the "no immediate risk" ticket; Yes shows the P1 confirm with the comment box; Raise the P1 is greyed out until you type at least ten characters.
4. Hot water at 6832: straight to the closed note with "service contractor"; the ticket is created closed.
5. Fridges 6851: the universal question; Yes with a comment gives the live P1; No gives the closed note.
6. Something else, "Cellar cooler alarm going off": "Kitchen equipment" starts the kitchen flow; "Outside lighting" at a site without it gives the closed note; "None of these" asks the universal question; Yes with a comment gives the 153 P1.
7. Site 6771: the offline banner has no button; 7004 with a thermostat offline, heating, "the bar thermostat isn't connecting" (never "everything is online").
8. Thermostat 6832 (16 against 20): "It's not working": "Are the radiators in that area warm?"
9. Control window: "Make it warmer", Send: plain wording; block `/api/outcomes` and press "Done, carry on": "Try logging again", never "I've logged it".
10. Block `/api/outcomes` and raise a P1: "The P1 has NOT been raised", no ticket number; allow and retry.
11. Open the guide from the override screen: twelve pictures load, each with its description; the text matches the Word document, with the phone number 023 814 0228.
12. For every other flow (lighting 6749 "still off", fans, hot water, air conditioning, heating "cold radiators", contractor "something else" and "hasn't come on", a closed note such as "Something not on this list", site not identified): confirm the exact question appears before the ticket, the P1 button is disabled until the comment is filled, and a P1 cannot be raised without it (try with the box empty, with spaces only and with nine characters).
13. Extractor fans: "Just this once", "Tomorrow at 12:00 or later": "Not urgent", only the ticket. Back, "Tomorrow before 12:00": "Urgent", Raise a P1 needs the comment. "Every week": ticket only. Air conditioning: the risk question and the notes hint.
14. Search every screen above for the LEX-146 and D5-146 word lists: none.

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
| Always know who is calling and which site (D15, D16) | "Who's calling?" start screen and the permanent banner on every in-call screen | Who's calling? group; every flow |
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
| Guide pictures | Static files served on request | None | n/a | About 1.2 MB added to the image |
| Prototype and diff tooling | Run by hand on a developer machine | None | n/a | Nothing in production |
| AI or per-use services | None | None | n/a | n/a |

Build cost is mainly browser code, one small server module for one-offs (with its tests), the guide files, and test updates. What the business gets: agents who never make a technical judgement, no dead ends, honest referrals that do not clog the IoT queue, a contact number for call-backs, a one-off for kitchen equipment without touching timetables, and a guide that shows the contractor what to press.
