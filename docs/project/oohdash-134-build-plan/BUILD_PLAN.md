<!-- gate:contract
SECTION: What will be built
OOHDASH-134, patch release v1.4.2. In the 'Something else' flow the first step does not change: the handler still types the caller's words and picks "Check if it's Lighthouse-controlled" or "Capture & escalate as described". Choosing Capture now opens one new step with two buttons: "Escalate as P1" and "Raise a Normal Priority ticket". Under them is a short explanation of what a P1 is and when to use it, in James's wording. The normal button behaves exactly as Capture does today. The P1 button raises the same P1 that the lighting, kitchen and contractor flows already raise. Nothing on the server changes.

SECTION: James's approved changes to the design
James approved the design with four changes, and they replace the design wherever the two differ. D1 is a patch release v1.4.2. D2 is the new two-button step after Capture, with the P1 explanation under it. D3 is the plain label "Escalate as P1", with "Raise a Normal Priority ticket" for the other button. D4 is that the P1 is blocked until the handler has typed a reason. The exact words are quoted in the body of this plan. This means the third button on the first step, the red-outline-under-the-chips layout, the long label, and the "allow an empty box" fallback from the design are all dropped.

SECTION: Work units and order
Five work units, built in order and each self-checked. WU1 adds the new choice step and the reason guard in public/js/flows.js. WU2 adds the P1 button style and explanation style in public/css/styles.css. WU3 adds the new tests, including the parity test against the lighting P1 and the empty-reason block test. WU4 updates every existing test that clicked Capture and expected the "General issue captured" outcome so that it also clicks the new normal-priority button. WU5 writes the v1.4.2 release notes and the tester guide line. The test updates are the biggest part of the work because about thirty existing clicks are affected.

SECTION: Same P1 signal as the proven flows
The new P1 goes through the shared outcomeP1 helper and the single POST /api/outcomes request, so the outcome type escalate-p1, the urgent priority, the ooh and ooh_p1 tags, the Ticket Category field, the [OOH] subject prefix and the escalation call are all identical to the lighting P1. Only subject, detail and the text-message summary differ. The new choice sends no capture class, matching lighting. A parity test raises a lighting P1 and a Something else P1 on the same site and compares the two requests and the two tickets. The text message sent to the escalation manager comes from the IoT Support dashboard reading the ooh_p1 ticket, which James confirmed works today.

SECTION: Testing
A new Playwright spec tests/oohdash-134-other-p1.spec.js covers all six acceptance criteria, the parity check and the empty-reason block. A new unit test covers the summary helper. Every existing test that reached the capture outcome through Capture is updated to press the normal-priority button as well, and the full Playwright and unit suites must pass. The body of this plan maps every acceptance criterion to a test and lists each affected existing test.

SECTION: Rollback and release
Rollback is to redeploy the v1.4.1 image built from cdf480e. There is no data, setting or migration to undo. The release is a patch bump to v1.4.2 using the existing release script, with a release-notes entry and one line in the tester guide.

SECTION: Open questions (non-blocking)
Three of the writer's questions are still open and do not block Build. They can be answered after release.

Q-W1: Who covers P1-type issues during working hours, and should the signposting mention that route at all?
Q-W2: Is there a priority matrix (P2 or P3) that this button should sit within? This is still open (docs/bau-support/DISCOVERY-GATE.md:16).
Q-W6: Is "kitchen, stock, external lighting, contractor" the right set of examples, or are there other urgent cases (for example, a safety issue) that the on-duty manager wants handlers to escalate?
-->

# BUILD PLAN -- OOHDASH-134
## "Escalate as P1" in the 'Something else' flow (Capture step)

**Ticket:** OOHDASH-134 | **Release:** v1.4.2 (patch) | **Base:** origin/main f0ffcfe (v1.4.1 code, image cdf480e) | **Design:** docs/project/oohdash-134-design/DESIGN.md | **Standards:** house idioms of this repo (plain JS, Playwright, node:test); no separate standards file applies. Universal rules: no secrets or environment values added; errors are handled by the existing shared confirm/retry path.

---

## 1. Authoritative design delta (James, Design gate, approved with changes)

These supersede DESIGN.md wherever they differ. Quoted verbatim.

- D1 release version: "Patch release v1.4.2."
- D2 placement (James's words): "user has two choices - Check if its lighthouse controlled, or Capture and Escalate. that stays as is. when capture or escalate is selected, thats when there are two buttons - 'P1 Escalation' or 'Raise a Normal Priority ticket'. under there can be some explanation of what a P1 is, which is; anything that is immediately health and safety or business trading affecting. Please only use this option after you've attempted to follow through one of the circumstance tiles. P1 escalation will send a text to the escalation manager on the IOT Support team immediately upon submission."
- D3 label: plain "Escalate as P1" for the P1 button; "Raise a Normal Priority ticket" for the other.
- D4: block the P1 until the handler types a reason (P1 button disabled and refused with a clear prompt while the caller text or reason is empty or whitespace).

What this replaces in DESIGN.md: section 2.1 (third chip on step 0, signposting under chips, .chip.p1 outline) is replaced by the new step below; section 2.3 empty-box fallback "Something else - see ticket" is removed (the P1 can no longer be sent with an empty reason); the long label option A is dropped; tests 134-A and 134-D are rewritten. Kept from DESIGN.md: section 2.2 subject and detail wording, section 2.5 parity requirement and AC6, the 80-character summary cut, rollback.

Note on the label: James's quote says 'P1 Escalation' in passing; the later D3 decision fixes the P1 button text as exactly "Escalate as P1". Build uses D3.

---

## 2. Resulting flow

| Step | What the handler sees | Change |
|---|---|---|
| Stage 0 | Caller-words box, chips other-check and other-capture | None |
| Stage 1, path check | Scope question | None |
| Stage 1, path cap (new) | Choice step: buttons "Escalate as P1" (testid other-p1) and "Raise a Normal Priority ticket" (testid other-normal), explanation block (testid other-p1-explainer) | New |
| Stage 2, path normal | outcomeCaptured, "General issue captured", exactly as today | Moved from stage 1 to stage 2, behaviour identical |
| Stage 2, path p1 | outcomeP1, then the shared confirm step and red P1 card | New |

Explanation text under the buttons (ASCII here; flows.js may use house typography):

- "P1 = anything that is immediately health and safety or business trading affecting."
- "Please only use this option after you have attempted to follow through one of the circumstance tiles."
- "P1 escalation will send a text to the escalation manager on the IOT Support team immediately upon submission."

---

## 3. Work units

### WU1 -- Choice step and guard (public/js/flows.js)

Satisfies: D2, D3, D4, AC1, AC2, AC3, AC4, AC6. Lines refer to origin/main f0ffcfe.

1. Stage 0 (lines 1032-1040): no change. Capture keeps sending path 'cap' with q from the textarea. Note q becomes '(not specified)' when the box is empty; the guard below uses a separate emptiness test, not the placeholder.
2. Stage 1 (lines 1042-1051): split on path.
   - path 'cap' now renders the choice step instead of calling outcomeCaptured. Render the history line once (the existing _oline guard), then the two buttons and the explainer. Normal button: flowStep({path:'normal'}). P1 button: calls a new global function raiseOtherP1().
   - path 'check': unchanged.
3. Add stage 2 handling:
   - path 'normal': the existing outcomeCaptured call, copied unchanged (subject "General issue captured", the same detail and script text, OohCaptureClass 'general').
   - path 'p1': outcomeP1(f, 'p1', {subject: 'Something else - urgent, escalated as P1', detail: 'Caller reported: ' + full reason + '. Did not fit a specific tile; handler judged it urgent tonight.', script: the existing standard P1 script text used at flows.js lines 753 and 800, p1Summary: otherP1Summary(reason)}). No OohCaptureClass (null, same as lighting). No actionId.
4. New named helper otherP1Summary(text): trim, collapse whitespace runs (including line breaks) to one space, return 'Something else: ' + text; if longer than 80 characters keep the first 77 and add '...' (exactly 80). Input is guaranteed non-empty by the guard; for defence, an empty input returns 'Something else - see ticket' but this branch is unreachable from the UI. Exposed at top level so the vm-sandbox unit test can call it.
5. Reason guard (D4). Define reasonText = the textarea text trimmed of whitespace; blank if empty or whitespace only (the '(not specified)' placeholder never counts as a reason).
   - If the handler typed text at stage 0, the P1 button is enabled and the typed text is the reason.
   - If it was blank, the P1 button renders disabled (disabled attribute and aria-disabled), with a visible prompt (testid other-p1-blocked-note): "Type the reason this is a P1 before escalating." and an inline reason textarea (testid other-p1-reason). An oninput handler enables the button only when the trimmed value is non-empty. The typed value becomes the reason used for the detail and summary.
   - raiseOtherP1() re-checks the guard and refuses (shows the prompt, sends nothing) if the reason is blank, so a script or double click cannot bypass the disabled attribute.
   - The normal-priority button is never blocked.
   Minor design inference (flag for Test): the inline reason box exists only because the flow has no Back step, so a blank stage 0 would otherwise leave the handler stuck. Wording of the prompt is Build's choice within D4.
6. Do not touch outcomeP1, finishOutcome, the confirm step, the P1 card, routes/api.js, services/*, or any other flow.

### WU2 -- Styles (public/css/styles.css, next to lines 102-104)

- Add .chip.p1 (red outline, danger token border, dark red text, surface background) and .chip.p1:hover (danger-light background), using only existing tokens; the DESIGN.md text colour #991B1B is kept for contrast.
- Add .chip:disabled (reduced opacity, not-allowed cursor, no hover change) so the blocked P1 button reads as disabled.
- Add a small rule for the explainer block (testid other-p1-explainer): small text, 3px red left border, spacing under the buttons.
- "Raise a Normal Priority ticket" uses the plain .chip style.
- No new tokens. Check at 375px width: both buttons and the explainer visible without horizontal scroll.

### WU3 -- New tests

New Playwright spec tests/oohdash-134-other-p1.spec.js (pattern from tests/outside-lighting-p1.spec.js; site 6749 Angel Inn, signIn as Test Handler, helpers confirmSite):

| ID | Steps | Expected | AC |
|---|---|---|---|
| 134-A | Open Something else, type text, click other-capture | other-p1 and other-normal visible, in that order, labelled exactly "Escalate as P1" and "Raise a Normal Priority ticket"; other-p1-explainer visible and contains "health and safety", "business trading affecting", "attempted to follow through one of the circumstance tiles", "text to the escalation manager" | 1 |
| 134-A2 | Stage 0 | Only other-check and other-capture present; other-p1 not present at stage 0 | 1 |
| 134-B | Type "Gas smell near the cellar door, staff evacuating the kitchen", capture, other-p1, record-outcome | POST /api/outcomes: type escalate-p1; subject "Something else - urgent, escalated as P1"; p1Summary starts "Something else: Gas smell"; outcome-p1 card with ticket number | 2 |
| 134-C | 140-character text (fixture from DESIGN.md 134-C), P1, record | p1Summary length 80 or fewer and ends "..."; detail contains the full text | 3 |
| 134-D | Leave box empty, capture | other-p1 is disabled and other-p1-blocked-note visible; click attempt sends no POST | D4 |
| 134-D2 | Same, then type whitespace only into other-p1-reason | still disabled | D4 |
| 134-D3 | Same, then type a real reason | enabled; P1, record; POST has that reason in detail and p1Summary | D4 |
| 134-E | Type text, capture, other-normal, record | POST type capture, subject "General issue captured", OohCaptureClass general; outcome-captured card; no outcome-p1 | 4 |
| 134-F | Type text, other-check | Scope question shown as today | 4 |
| 134-G parity | On 6749 raise lighting "Still not working" P1 and record; add another issue, raise the Something else P1 and record. Capture both POST bodies and read back both tickets | Same sorted key set; both type escalate-p1; both OohCaptureClass null; no actionId in either; only subject, detail, p1Summary and callerWords differ. Both tickets priority urgent with identical tag sets containing ooh and ooh_p1 (read from the fixture ticket store; if the workspace does not expose priority, assert via a node route test calling zendesk.ticketsForSite) | 6 |

New unit test test/other-p1-summary.test.js (sandbox pattern from test/legacy-salus-flow.test.js), cases for otherP1Summary: short text; text exactly 80 characters with prefix (not cut); 140 characters with line breaks and double spaces (80 characters, ends "..."); leading and trailing whitespace trimmed; empty string defence fallback. AC3.

### WU4 -- Existing tests that must click the new button

Every test that clicks other-capture and then expects the capture outcome (confirm step, outcome-captured, additional-notes on the capture outcome) must add a click on [data-testid="other-normal"] straight after the other-capture click. Assertions stay unchanged. Add a one-line shared helper in tests/helpers.js (captureNormalPriority(page)) if it reduces repetition. Affected, by file and line of the other-capture click on origin/main:

| File | Lines |
|---|---|
| tests/additional-notes.spec.js | 65, 88, 106, 120, 132, 146, 160, 206, 272, 355, 373, 414, 458, 511, 555, 602 (16 tests) |
| tests/killswitch.spec.js | 50 |
| tests/tester/oohdash-119-screenshots.spec.js | 29, 52, 71 |
| tests/tester/oohdash-119.tester.spec.js | 62, 98, 153, 178, 375, 487, 534, 817, 863, 950 |

Build must re-grep for other-capture across tests/ before finishing, run the tester specs if playwright.config.js includes them, and list any file not in this table that needed the same change. Tests that go through the lighting, kitchen, heating or other flows are unaffected.

### WU5 -- Release notes and docs

- RELEASE_NOTES.md: new v1.4.2 entry above v1.4.1 in the existing format: OOHDASH-134 (feature), what changed (new two-button step after Capture, reason required for P1, same P1 signal as lighting, no server change), accepted behaviours (P1 button blocked until reason typed; Check path unchanged), rollback to v1.4.1 (cdf480e). Date TBD, cut with npm run release (patch).
- docs/TIER1_TESTER_GUIDE.md: one line near line 49 saying that in Something else, Capture now offers "Escalate as P1" (needs a reason; texts the escalation manager) or "Raise a Normal Priority ticket".
- docs/bau-support/mockups/bau-support-guide.html is a mockup of the support guide; Build notes for the Writer whether it needs a matching line and does not change it unless it describes the Capture outcome.
- No version bump in package.json by Build; the release script does it.

---

## 4. Acceptance criteria map

| AC | Meaning | Tests |
|---|---|---|
| AC1 | P1 choice offered in Something else, with explanation | 134-A, 134-A2 |
| AC2 | P1 raised through the shared outcome, red P1 card | 134-B |
| AC3 | Text-message summary at most 80 characters, full text kept | 134-C, unit test |
| AC4 | Check path and normal capture unchanged | 134-E, 134-F, all WU4 updated tests |
| AC5 | All existing suites green | npm test, npm run test:unit |
| AC6 | Same P1 signal as lighting | 134-G |
| D4 | P1 blocked without a reason | 134-D, 134-D2, 134-D3 |

---

## 5. Verification (Build runs before handoff)

- npm run test:unit (all unit tests including the new summary test).
- npx playwright test tests/oohdash-134-other-p1.spec.js
- npx playwright test tests/additional-notes.spec.js tests/killswitch.spec.js tests/outside-lighting-p1.spec.js
- npm test (full Playwright run, includes tester specs if configured).
- Manual check at 375px width: choice step, blocked P1 state, enabled P1 state.
- Self-audit: no console errors, no function wired but undefined (raiseOtherP1, otherP1Summary), blocked state clears when a reason is typed, no secrets or environment values added.

Playwright runs use the repo's test configuration only; no live Zendesk or SMS is contacted.

## 6. Rollback

Redeploy the v1.4.1 image built from cdf480e. No data, migration or configuration to undo.

## 7. Divergences and open flags for the Test doer

- Intentional divergence from DESIGN.md: everything listed in section 1 (James's approved changes).
- OohCaptureClass is null for the P1 (parity with lighting); audit metrics show it as unclassified.
- The inline reason box (WU1 item 5) is a minor inference; Test should confirm a blank-box handler is never stuck.
- Open, non-blocking: Q-W1, Q-W2, Q-W6 (see header).
