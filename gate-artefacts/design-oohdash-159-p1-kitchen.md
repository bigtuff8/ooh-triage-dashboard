<!-- gate:contract
SECTION: Rev 4 in one paragraph (your decisions of 29 Oct)
OOHDASH-159 now delivers two things in one release. First, the missed-P1 kitchen fix from revs 1 to 3: the "Is the kitchen needed for service right now?" question is asked before any route that has no P1. Second, an app-wide text key that you approved on 29 Oct, applied to every screen in every journey. The key: script in a green "Say to the customer" box; agent background in blue, with values from the site highlighted; a red warning directly above every button that logs a ticket or switches equipment, with a stronger P1 version; ticket text in its own dashed box; and one neutral after-action card for every outcome. The ticked lines become "What we know so far", which is also written onto the ticket. The connection-check banner is removed completely. The "What Lighthouse controls at this site" panel is kept and made accurate. OOHDASH-146 is paused; the decisions are recorded on its ticket so it rebases onto this key.

SECTION: Interactive prototype and the all-screens comparison
Two linked pages, both built from the app's own rendered screens: today's release (v1.6.5) and a working copy of this design, each run locally in test-data mode. Page 1 is the all-screens comparison: every screen in every journey (158 states), today next to rev 4, each piece of text tagged by its type in the key, with problems flagged. Page 2 is the click-through kitchen prototype for the four 159 scenarios. Links are in the body of this document and in the PR description.

SECTION: The text key (applies to every screen)
Script: a green box headed "🗣 Say to the customer", exactly one per step, read out word for word. Where the step asks the customer something, the question is the last line of the box, headed "Ask the customer:", and the answer buttons sit directly under it in the customer's words. Agent background: a blue box headed "ℹ For you (background, not to read out)". It is short and plain, never offers a choice, and is left out when it adds nothing. Any value taken from the site (equipment names, times, temperatures, ticket numbers) is highlighted wherever it appears. Ticket text: a dashed, uncoloured box headed "📄 What goes on the ticket (for the IoT team)". Warning: see the next section. After-action summary: one neutral white card with a dark header that says what happened and shows the ticket number, the same for a P1, a logged ticket or a closed note. The script carries on inside it in the green box. Red is used for nothing else except "this did NOT happen" failure messages. Site status banners (an active P1 on record, a heating timer running) become amber status strips.

SECTION: When the red warning appears (your answer to Q2)
A red warning sits directly above every button that logs a ticket and every button that switches equipment from here. It never appears after the action. The logging buttons are the record-outcome step on every journey and pub heating's Check and log. The switching buttons are the device control window's Send, pub heating's turn-on and turn-off durations, and the lighting and fan switches, which open the control window. Ordinary warning text: "Before you press: this logs a ticket for the IoT team." or "Before you press: this switches the [equipment] [on/off] at the site straight away." A P1 is one of these, and gets the stronger version within the same theme. The box is solid red with a white heading, "🚨 This raises a P1", followed by "It pages the on-duty manager straight away." The button itself is red and reads "Raise the P1". Every other logging button reads "Log it" or keeps its current journey label.

SECTION: What we know so far (replaces the ticked lines)
The list at the top of each issue is renamed "What we know so far". It holds only two kinds of line, each with its own icon: 👤 what the customer told us (their answers), and 🔎 what the dashboard checked by itself. It is written in plain words with no codes or jargon. It never shows an outcome, action or decision before it has happened: lines such as "Business-critical during service — P1" and "Outcome: captured" are removed, because the after-action card shows the real outcome. The list is sent with the outcome and written onto the ticket as its own section, so the IoT team can see how the conclusion was reached. This is a small server addition: a new knownSoFar list on the outcome request, written as lines in the ticket transcript. It is not added to the P1 text message. All 52 existing lines are rewritten to this rule; the full table is in the body.

SECTION: Connection-check banner removed (Q4)
The red "Some Lighthouse equipment at this site is not responding / Run connection check / This step is optional" banner is removed from the site page completely. So are the "offline" and "router" search words that suggested a connection check. Heating and kitchen still divert to the connection questions automatically when their own equipment is offline, so no journey loses the check. This supersedes OOHDASH-146 D10, which kept a text-only banner.

SECTION: "What Lighthouse controls at this site" kept and fixed (Q5)
The panel stays, with the same rows and tags, but each row now tells the truth. "Controllable from here" means a screen in this dashboard actually offers control of it AND the equipment can be reached now. Kitchen therefore shows "Monitored only", because no kitchen screen switches circuits. If the Lighthouse wall unit is offline, nothing at the site shows "Controllable from here"; the panel says "Can't be reached right now", the same for every row. A row whose equipment is all offline says "Not responding right now". Heating classes marked unproven, or switched off by a setting, are never "Controllable from here". Fridges and freezers are added ("Monitored only" where present). The two fixed rows that never change ("Internal lighting / sockets", "Boiler internals / PCB") are removed. The footnote changes from "Live from the device inventory" to "From this site's equipment list and its connection right now." The same corrected rule feeds the Something else question, so it stays consistent.

SECTION: The kitchen P1 fix (revs 1 to 3, unchanged in behaviour)
Fix 1, smart circuits not reporting: the service question is asked before the connection divert. Yes raises a P1, with no manual-button tip (D1). No goes to the connection questions as today. Fix 2, smart circuit reachable but off (verdicts A, C, D, off-unknown, including "Several / all of it"): the service question is asked before the circuit card. Yes raises a P1 that includes the manual-button tip (D2). No shows the circuit card as today. Fix 3, older sites with a circuit not reporting: the service question moves above the offline check. Yes raises a P1 with no manual-button tip, and No diverts to the connection questions. Same ooh_p1 path and paging (D4). Note: the smart-kitchen live read appears to be switched off in production today, so Fix 3 is the part that changes what agents see now. Fixes 1 and 2 take effect when the live read is enabled.

SECTION: Kitchen scripts that flow from step to step
Every kitchen step now has words to say that pick up from the last answer and lead into the next question. Service question, circuits not reporting: "I can see your [fryer and bain-marie] aren't connecting to us at the moment, so I can't see or switch them from here. Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?" Answers: "Yes, it's needed now" / "No, it can wait". P1 step, before pressing: "Thanks. As you need the kitchen now, I'm going to raise this as urgent with our on-call team." P1 after-action: "That's raised as urgent, reference [45129]. Someone from our on-call team will call you back shortly." For the reachable-but-off version, the after-action script adds: "In the meantime, you can press the manual control button on the front of the PowerPause unit once; it should bring the [bain-marie] on." The circuit cards keep rev 3's split, with "override" changed to "manual control button" (your D3 from 146). The full wording table is in the body.

SECTION: What is not in this release (left for OOHDASH-146)
146's wording rewrite of the other journeys stays with 146. That covers the D5 customer-answerable options, D6 closed notes, D8 kitchen one-off bookings and D9 customer details. In this release every screen gets the key's presentation and structure: the green script box, the "Ask the customer:" question line, blue info, the warnings, ticket text, the after-action card and What we know so far. Each journey's existing words move into the right box, with only these wording fixes: "caller" becomes "customer", and the ticked lines are rewritten. Scripts on non-kitchen screens are not rewritten to flow step to step; that is 146's job, now recorded on its ticket.

SECTION: Tests
Kept from revs 1 to 3: TF-159-01, 01b, 02, 02b and 03, plus one extra "No" click on TF-140-02, 04, 06, 07, 08 and 09. New for the key, as e2e checks on real screens: every confirm step shows the ticket box and a red warning directly above the button. A P1 confirm shows the P1 warning and a "Raise the P1" button. After recording, the neutral after-action card shows the ticket number and a green script box. No grey quote style remains anywhere (a whole-app check over the screen-dump states). No "What we know so far" line contains P1, Outcome or a ticket before recording. The site page has no connection-check banner. Scope panel unit tests: kitchen is "Monitored only" at site 8888, nothing is "Controllable from here" at site 6771 (wall unit offline), and fridges appear where present. Server unit test: knownSoFar lines appear in the ticket transcript and not in the P1 text. The prototype working copy ran the unit suite: 836 pass, 11 fail. Ten failures are tests asserting the old wording or the old panel rule, which the build updates on purpose: dark-fleet-heating (3), OOHDASH-144 card wording CW-1 and CW-2, outcome-callerwords D-10a (the separate "Recorded from the caller" line is dropped because the customer's words are now the first line of What we know so far), pub heating banned words PH-BW-2, OOHDASH-135 T1-4c and T1-5b, and refrigeration-deny. The eleventh, p1-log, already fails on main. Before the test gate, the orchestrator re-runs the all-screens dump and checks it line by line against this design.

SECTION: Risk
It touches every journey's look, so the screen-dump comparison is the main safety net. Every state is re-captured and diffed before the test gate. The control logic, P1 paging and ticket types do not change. The server change is additive: a new optional field. Rollback is the usual image rollback. Straight quotes only in flows.js (v1.5.3 lesson).

DECISION: Follow-up after "No", if the manual control button didn't work or the fuse board is fine | Skip the repeat question and log it for the morning (recommended) | Ask the service question again
DECISION: Approve design and proceed to build? | Approve — proceed to build | Changes requested
-->

# OOHDASH-159 Design rev 4: kitchen P1 fix + app-wide text key

**All-screens comparison (today vs rev 4, every journey):** [OOHDASH-159-rev4-screens.html](../docs/project/mockups/OOHDASH-159-rev4-screens.html) · standalone https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-159-rev4-screens.html
**Kitchen click-through prototype:** [OOHDASH-159-mockup.html](../docs/project/mockups/OOHDASH-159-mockup.html) · standalone https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-159-mockup.html
**Analysis that led here (your questions a to h):** https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash-159-text-key.html

Date: 2026-10-29 · Discovery PR #182 (D1–D5) · Decisions of 29 Oct (Q1–Q7) below · Base: main 2ab9486 (v1.6.5)

## Decisions of 29 Oct

| # | Question | Your answer | In this design |
|---|---|---|---|
| Q1 | Colour key | Approved; neutral after-action card | Script green, info blue, warning red, after-action neutral |
| Q2 | When red appears | Before any ticket or switch of equipment; P1 a stronger subset | Warning above every log and switch button; solid-red P1 version with a red "Raise the P1" button |
| Q3 | Ticked lines | "What we know so far" | 👤 customer answers and 🔎 dashboard checks only; written onto the ticket |
| Q4 | Connection-check banner | Remove completely | Banner, button, hint and search words removed; automatic divert kept |
| Q5 | Controls panel | Keep and fix | Truthful rule (see below) |
| Q6 | Where the key lives | Deliver now in 159; record on 146 | App-wide in this release; 146 ticket updated (comment 41638) |
| Q7 | P1 step | As Q6 | One P1 pattern, set here |

## The key, component by component

| Type | Look | Rules |
|---|---|---|
| Script | Green box, "🗣 Say to the customer" | One per step. Read out word for word. A question to the customer is its last line, "Ask the customer: …", with answer buttons directly under it in the customer's words. Values from the site are highlighted. |
| Agent background | Blue box, "ℹ For you (background, not to read out)" | Short, plain, never offers a choice. Left out when it adds nothing. Values from the site are highlighted. |
| Ticket text | Dashed uncoloured box, "📄 What goes on the ticket (for the IoT team)" | Shown on every confirm step and in Check and log. Never styled as info or script. |
| Warning | Red box directly above the button | Before every log and every switch. Never after the action. |
| P1 warning | Solid red heading "🚨 This raises a P1" + red "Raise the P1" button | The only place a red button is used. |
| After-action summary | White card, dark header "✔ [what happened]" with the ticket number | Same for every outcome type. The green script box carries on inside it. Then "Add another issue" / "End call". |
| What we know so far | Small list, 👤 and 🔎 icons | Facts only, never an outcome before it happens. Sent to the ticket. |
| Site status | Amber strip | Active P1 on record, timer running. No longer red. |
| Failure | Red box | Only for "this did NOT happen" messages (couldn't log, couldn't switch). |

Implementation is shared code, so every journey changes together:

- styles.css gets the new classes. The old grey italic `.script` quote is retired; all 18 uses become the green script box.
- `finishOutcome` (the confirm step every journey uses) renders the ticket box, the warning and the button.
- The `outcome*` helpers render the after-action card.
- `renderFlow` and `doneLine` render What we know so far.
- The P1 banner moves to amber.
- views.js:187 (the offline banner) and the connectivity search keyword are removed.
- control.js gets a warning above "Send to device".
- Pub heating's duration buttons and Check and log submit get warnings.
- routes/api.js gets the corrected panel rule, and the outcome route accepts `knownSoFar`.

## What we know so far: every line rewritten

| Today (where) | Rev 4 |
|---|---|
| Area: Bar/Restaurant (heating) | 👤 Area: Bar/Restaurant |
| Need: Too cold / not working | 👤 The customer says: too cold or not working |
| Choosing which zone / Turning heating on — Zone 2 — choose duration | removed (an action in progress, not a fact) |
| Live read: device not reporting / no thermostat online / device offline | 🔎 The thermostat in this area isn't connecting to us |
| Requested: warmer / cooler / turn heating off; Reported: heating not working | 👤 The customer wants it warmer / cooler / off; 👤 The customer says the heating isn't working |
| Requested: warmer · system already calling for heat | 👤 The customer wants it warmer · 🔎 the heating is already asking for heat |
| No action taken; Outcome: building-heat guidance; Outcome: captured (…) | removed (outcomes) |
| Air conditioning — not controllable from the dashboard | 🔎 Air conditioning can't be changed from here |
| Hot water - not on Lighthouse / boiler-side, not controllable | 🔎 Hot water isn't on Lighthouse here / 🔎 Hot water can't be changed from here |
| The kitchen circuits are reachable. / (159) Some kitchen circuits aren't reporting. | 🔎 The kitchen equipment is connecting to us / 🔎 [Fryer and Bain-marie] aren't connecting to us |
| Business-critical during service — P1; Not service-critical tonight | 👤 Kitchen needed for service now: yes / 👤 Kitchen needed for service now: no, it can wait |
| Resolved with on-site override; Fuse board tripped — reset fixed it | 👤 It came on with the manual control button / 👤 The fuse board had tripped and resetting it fixed it |
| Override did not work — business critical question; Fuse board fine — escalating | 👤 It didn't come on with the manual control button / 👤 The fuse board is fine and it's still off |
| Site contacting repairs team; Caller still says it's our problem — … | 👤 The customer will call their repairs team / 👤 The customer still thinks it's our equipment |
| Live read: external lighting device online / NOT responding / not on Lighthouse | 🔎 The outside lighting controller is connecting to us / isn't connecting to us / isn't on Lighthouse here |
| Resolved via on-site override; Override did not resolve — P1 | 👤 The lights came on with the on-site switch / 👤 The lights are still off after the on-site switch |
| Live read: extractor fans …; Captured: [note] | 🔎 The fan controller is connecting / isn't connecting to us; 👤 The customer needs: [note] |
| Refrigeration is monitored-only on Lighthouse; Stock at risk — P1 | 🔎 Lighthouse watches fridge temperatures but doesn't control the fridges / 👤 Stock is at risk right now |
| Connection check: [result]; Site restored power/connection | 🔎 [result in plain words] / 👤 The customer says it's back on |
| Contractor: [name] — [need]; PowerPause override … guidance / procedure given / Donkey Derby exception | 👤 Contractor: [name], needs [need]; guidance lines removed (actions); 🔎 This site's manual control button doesn't work (Donkey Derby) |
| Issue: "[words]"; Checked: [group] → …; Raised as a normal priority ticket; P1 Escalation chosen | 👤 The customer says: "[words]"; 🔎 [group]: controlled / monitored only / not on Lighthouse here; the last two are removed (outcomes) |

## Kitchen wording (159 screens)

| Screen | What we know so far | Say to the customer | For you | Buttons |
|---|---|---|---|---|
| Service question, circuits not reporting (Fix 1, Fix 3) | 🔎 [Fryer and Bain-marie] aren't connecting to us | "I can see your [fryer and bain-marie] aren't connecting to us at the moment, so I can't see or switch them from here. Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?" | (none) | Yes, it's needed now / No, it can wait |
| Service question, circuit reachable but off (Fix 2) | 🔎 [Bain-marie] is off | "I can see your [bain-marie] is switched off at the moment. Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?" | It's off because [its timetable has it off until 17:00 / it should have come on at 11:30 / it's meant to stay on]. | Yes, it's needed now / No, it can wait |
| Service question, older site, all reachable | 🔎 The kitchen equipment is connecting to us | "Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?" | (none) | same |
| P1, not reporting (before pressing) | + 👤 Kitchen needed for service now: yes | "Thanks. As you need the kitchen now, I'm going to raise this as urgent with our on-call team." | We can't see or switch [Fryer and Bain-marie] from here, so the on-call manager needs to call the site back. | Ticket box: "Kitchen equipment off during service — P1. Not reporting while the site is serving: Fryer, Bain-marie. No remote view or control possible; needs immediate IoT action." · P1 warning · [Raise the P1] |
| P1, not reporting (after) | (same) | "That's raised as urgent, reference [45129]. Someone from our on-call team will call you back shortly." | (none) | After-action card "✔ P1 raised #45129 · The on-duty manager has been paged." · Add another issue / End call |
| P1, reachable but off (before) | + 👤 Kitchen needed for service now: yes | as above | [Bain-marie] can be reached but is off; the on-call manager will call the site back. | Ticket box carries the plain-words reading ("Checked at 18:23: the bain-marie is off; its timetable has it off until 17:00") · P1 warning · [Raise the P1] |
| P1, reachable but off (after) | (same) | "That's raised as urgent, reference [45130]. Someone from our on-call team will call you back shortly. In the meantime, you can press the manual control button on the front of the PowerPause unit once; it should bring the [bain-marie] on." | (none) | After-action card |
| "No" (reachable but off) | + 👤 Kitchen needed for service now: no, it can wait | the circuit card's own script (rev 3 wording, "manual control button") | rev 3 "good to know" text, as blue info | rev 3 buttons |
| "No" (not reporting) | + 👤 … no, it can wait | the connection questions, in the key | | |
| Follow-up after "No" (recommended: no repeat) | + 👤 It didn't come on with the manual control button | "I've logged it for our IoT team to sort out first thing tomorrow." (after-action) | | Ticket box "Kitchen circuit off — not needed until later…" · ordinary warning · [Log it] |

## Controls panel: corrected rule

| Row | Controllable from here | Monitored only | Not responding right now | Not on Lighthouse here |
|---|---|---|---|---|
| Heating | A heating device is controllable from a screen (pub heating boost, or a thermostat class that is proven and switched on by its setting) and it is online | Heating device present but not controllable | Every heating device offline | None |
| Hot water | Boiler panel can change hot water and is online | Hot water signal present | Panel offline | As today |
| Kitchen equipment | Never (no kitchen screen switches circuits) | Kitchen circuits present | Every circuit offline | None |
| Outside lighting / Extractor fans | A switch-capable circuit that is online and registered (the same test the switch button uses) | Present, not switchable | All offline | None |
| Fridges and freezers (new) | Never | Present | All offline | None |
| Whole site, wall unit offline | (every row) "Can't be reached right now" | | | |

Removed rows: "Internal lighting / sockets", "Boiler internals / PCB" (they never change).

## Tests

Listed in the contract above. Unchanged from rev 3: TF-159-01, 01b, 02, 02b, 03 (site 8889 added to fixtures), TF-140 "No" clicks.

## Risk

Listed in the contract above.

*Design by ooh-triage-dashboard-R1-mvtv1w9k · 2026-10-29 (revs 1 to 3 by mvrygaux)*


---

## Rework addendum — round 1 (design/committee)

### Panel verdicts addressed

**Critical-thinker — five concerns raised within a single verdict**

**Concern 1: "Appears to be switched off" is not confirmed.**
The phrase "appears to be switched off" was drawn from the orchestrator's screen dump, not a direct flag-store query. The design now imposes a hard pre-build gate: before build begins, the tech lead must query the project's feature-flag store for `kitchen_live_read` and record the exact value (enabled/disabled, and the scope — global, per-environment, per-site) on the build ticket. Build cannot start until that record exists on the ticket. The contract section on the kitchen P1 fix is amended accordingly: "Fix 3 is the part that changes what agents see *if the live read is confirmed disabled in production today*."

**Concern 2: Fixes 1 and 2 ship dormant with no re-validation trigger.**
The design now requires a linked blocking sub-ticket, **OOHDASH-159-LR-ENABLE**, to be created at build time. That ticket carries the activation checklist: (a) enable `kitchen_live_read` in a staging environment, (b) re-run TF-159-01 and TF-159-02 against staging, (c) tech lead signs off both passing. The flag must not be enabled in production until OOHDASH-159-LR-ENABLE is closed. The test-scripts deliverable is updated to include these two tests explicitly under the "activation" label, so the tester knows they are deferred, not dropped.

**Concern 3: The 158-state comparison rests on a single manual diff.**
The test-scripts deliverable now includes a **mechanical snapshot-diff step** as the first gate before the human review. The step: replay all fixture-driven test journeys against the build branch, capture the rendered text content of each of the 158 states, hash each, and diff against a committed baseline. Any hash that changes outside the intended-change list (the ten deliberate failures plus the banner removal) fails the CI step and blocks the test gate. The human screen-dump review runs second, against whatever the script did not catch. This makes the human pass a second check, not the sole check.

**Concern 4: PH-BW-2 and refrigeration-deny are listed as intentionally failing without per-test guard verification.**
Both are behavioural guards, not cosmetic renames, so closing them as "intentionally failing" is not sufficient. The design adds two new mandatory assertions that must **pass** before the test gate:

- **PH-BW-2b**: run the banned-word regex over the new pub-heating wording strings (duration screen and Check-and-log screen). Assert zero matches. This verifies the new wording is clean before PH-BW-2 is retired as a wording-only failure.
- **REFRIG-DENY-b**: on the refrigeration deny screen, assert that a P1 warning element and a red "Raise the P1" button are present. This confirms the deny/escalation path is intact under the new wording before refrigeration-deny is retired.

Neither PH-BW-2 nor refrigeration-deny may be marked done until their -b sibling passes.

**Concern 5: Controls panel per-render read cost and flaky-read behaviour not stated.**
The "reachable right now" rule adds one live device-API read per row per page load. Design decisions, stated explicitly:

- **Read count and parallelism**: typically 4 rows per site; all reads are issued in parallel (`Promise.all`), so wall-clock cost is a single request round-trip (~30 ms on a healthy connection), not 4 × 30 ms in series.
- **Timeout and failure behaviour**: each read carries a 3-second timeout. A row whose read does not resolve within 3 seconds shows "Can't be reached right now" — the same string as a confirmed offline device. The agent sees the conservative result (unreachable assumed) rather than a stale optimistic one. This is by design.
- **Loading state**: the panel renders immediately; each row shows a small spinner while its read is in flight and updates in place when it resolves. The page is not blocked.
- **LLM/token cost**: nil — these are device-API reads, not LLM calls.
- **Named trade-off**: at sites where the Lighthouse device API is itself unreliable (not the equipment — the API), rows will persistently show "Can't be reached right now" even when the equipment is functional. The panel will understate controllability at those sites. This is the deliberate conservative default; the operator should know it means panel accuracy tracks device-API reliability, not just equipment state.

---

### Summary of additions

Five additions, one per concern:

1. **Pre-build flag-confirmation gate.** Build cannot start until the tech lead has queried `kitchen_live_read` from the flag store and recorded the exact value on the build ticket. "Appears to be" is removed from the design contract.

2. **Activation/validation plan for Fixes 1 and 2.** A blocking sub-ticket (OOHDASH-159-LR-ENABLE) is required at build time. TF-159-01 and TF-159-02 must pass in staging with the flag enabled before the sub-ticket closes and before the flag goes live in production. The test-scripts deliverable names these tests under the "activation" label.

3. **Mechanical snapshot-diff step added to the test gate.** A fixture-replay script captures all 158 rendered states, hashes each, and diffs against a committed baseline in CI. Any unexpected hash change fails the step and blocks the test gate. The human screen-dump review runs second.

4. **PH-BW-2b and REFRIG-DENY-b added as mandatory passing assertions.** PH-BW-2b runs the banned-word regex over the new pub-heating wording and asserts zero matches. REFRIG-DENY-b asserts the deny screen still contains a P1 warning and a red "Raise the P1" button. Both must pass before the corresponding intentional failures are closed.

5. **Controls panel read cost and failure behaviour stated in the design.** Four parallel reads, 3-second timeout, conservative "Can't be reached right now" fallback, no LLM cost, ~30 ms wall-clock added. The trade-off — panel understates controllability at sites with unreliable device APIs — is named for the operator to accept.