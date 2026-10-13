<!-- gate:contract
SECTION: What this plan covers
This is the independent test plan for OOHDASH-119 Additional Notes. It covers every check that must pass before the branch may be released, and the live-proof steps that must complete after release before the ticket is closed. It does not approve the branch; that is the reviewer's verdict. Tests are authored independently against the build plan spec, not derived from the builder's self-verification. The plan is structured in two stages: A (pre-release, on the build branch at a local fixture server) and B (post-release, on ooh.airedale-group.io at Old Grey Mare, site 6832). No live Zendesk tickets or device commands are raised during Stage A. No live P1 is triggered at any point.

SECTION: Entry criteria for Stage A
All of the following must be true before Stage A begins. The build branch build/oohdash-119-additional-notes must be the HEAD that the unit suite ran against. Unit suite must show 347 pass 0 fail (not counting the 1 thingsboard-credentials skip, which is expected on any machine without that secrets file). E2e suite (tests/*.spec.js) must show 87 pass 0 fail. The fixture server (DATA_MODE=fixture) must start cleanly on port 3155 with no console errors. The IoT pin check (section 3 of the build plan) must not block; if IOT_REPO_PATH is set it must resolve to b217f34.

SECTION: Pre-release verification plan (Stage A)
Stage A has four parts that run in order. Part 1 is a full re-run of the unit suite (npm run test:unit) against the build branch. Every test that passed in the builder's self-verification must still pass; any new failure stops Stage A and blocks release. Part 2 is a full re-run of all e2e specs (npx playwright test) at desktop 1280x900. All 87 must pass. Part 3 is the tester-authored Playwright suite at tests/tester/oohdash-119.tester.spec.js run at both desktop 1280x900 and mobile 390x844 viewports; every check in that file must pass before Stage A is marked complete. Part 4 is the typography check: a human review of the rendered helper text, label, placeholder, echo and post-submit box against the design section 6 copy table to identify deviations; deviations are recorded in the findings section, not treated as blocking unless the design says so (Sam Day sign-off is a blocking gate). The tester-authored suite covers the 29 end points, the XSS sink, the character-cap counter, the delimiter-injection neutralisation, the P1 copy wording, the autosave lifecycle including all four clear points, the post-submit state machine, the control paths, focus retention during re-render, and the U11 source-check finding (see findings). The full endpoint-to-script mapping is in the endpoint table below.

SECTION: Endpoint coverage and script mapping
All 29 end points are covered by either a direct tester-authored check or by structural evidence plus a representative check from the same submit mechanism. The 25 guided-flow outcomes (endpoints 1 through 23 plus 1a and 18a) all submit via the single submitPendingOutcome path in public/js/flows.js; TF-01 drives that path end-to-end and verifies the POST body and ticket response. Representative samples cover each logical family: TF-07 (heating family, boiler captured), TF-11 (kitchen P1), TF-12 (lighting P1), TF-06 (fridge query), TF-08 (connectivity restored), TF-09 (contractor P1), TF-01 and TF-02 (other capture). The aircon shortcut carry test (TF-15) exercises endpoint 4. Endpoint 24 (ambiguous site) is driven directly by TF-16. Endpoint 25 (Tonight query) is driven directly by TF-17. Endpoint 26 (ctlFinish device confirmed) is driven directly by TF-18. Endpoint 27 (ctlEscalate timeout) is driven directly by TF-19. Every guided-flow outcome has the structural coverage of U11 (which proves additionalNotes appears in every api.post call to /outcomes), though U11 itself is a source-check and must be replaced (see findings). The tester suite directly exercises the POST body assertion for each of the 5 distinct API call sites.

SECTION: Post-release live proof (Stage B)
Stage B is a hard gate before the release ticket is closed. It runs only after the release has been deployed and the cache-buster confirms new JS is being served. Step L0 confirms site 6832 (Old Grey Mare) exists in the live Lighthouse dataset; if it does not exist James Brown names an alternative before any further step. Step L1 is a desktop guided-flow ticket at site 6832: Other flow, type N1 ("Duty manager says the cellar cooler alarm has also been going since 6pm") plus a newline and a second line to verify line-break handling, then Record outcome. Evidence: screenshot of the notes box before submission, screenshot of the Zendesk ticket body showing the TRG-STEP line as the final step, screenshot of the IoT Support Dashboard ticket detail view showing the same step as the last numbered entry, screenshot of the queue row confirming operator, outcome and summary are unchanged. Step L2 is a mobile check (390px wide browser or real device) of the same flow; evidence: screenshot confirming no horizontal scroll and notes box visible. Step L3 drives the post-submit late note: on the L1 ticket click the post-submit link, type a note, Save. Evidence: screenshot of the Zendesk internal comment with the OOH-NOTE prefix and the IoT Support Dashboard ticket detail showing that comment. Step L4 is a blank-notes ticket: site 6832 Other flow, no notes typed, Record outcome. Evidence: screenshot confirming no "Additional notes" line in the Zendesk body. Step L5 is the cache-buster check: open DevTools Network tab on a hard refresh of ooh.airedale-group.io; confirm notes.js is returned with the v=1.3.7 query string and status 200. The Sam Day copy sign-off must be obtained before Step L1 runs. Each test ticket is solved with an internal note reading "test, OOHDASH-119 live proof".

SECTION: Pass/fail criteria and exit criteria
A check passes only when it produces observable evidence matching the expected outcome. Saying "it looked fine" is not evidence. For Stage A each check must reach its exact expected outcome; any single failure is a blocker unless the finding routes to design-regression (in which case it is logged and escalated to the design stage, not to the author). For Stage B each live step must produce the named screenshots before the release is declared complete. Stage A exit: all unit tests green, all 87 builder e2e tests green, all tester-authored checks green at both viewports, typography deviations recorded and routed. Stage B exit: L0 through L5 all evidenced with screenshots, Sam Day copy sign-off obtained, test tickets solved. Any blocker from Stage A or Stage B that is a code bug routes to the author for fix before the release. A design regression routes to the design stage.
-->

# OOHDASH-119 Additional Notes — Independent Test Plan

**Date:** 2026-10-13
**Ticket:** OOHDASH-119
**Tester:** Independent (test-stage, not the builder)
**Branch under test:** build/oohdash-119-additional-notes @ b726b69 (rework R3b)
**Test branch:** test/oohdash-119-additional-notes
**Script:** tests/tester/oohdash-119.tester.spec.js

---

## 1. Findings from plan and build review (pre-run)

These findings are raised before any test is executed, from reading the build plan, build summary, source files, and builder's spec.

### F-01 — SOURCE-CHECK TEST (code bug, routes to author, flag for removal)

U11 in `test/notes-coverage-guard.test.js` is a source-check test. It reads `public/js/flows.js`, `public/js/views.js` and `public/js/control.js` as text and asserts the string `"additionalNotes"` appears in each `api.post` call context. This proves string presence in source code, not runtime behaviour. It passes even if the value is always `undefined` or if the call is dead code. It breaks on any refactor that renames the key. This class of test is explicitly prohibited by the test-stage protocol.

The U11 test must be removed from the suite. It must not be used as evidence of endpoint coverage. Replacement coverage is provided by TF-01 through TF-19 which assert the actual POST body value and the ticket response content.

Note: the build plan itself specified U11 in this form. The design regression is in the plan (plan asked for a source-check); the code bug is that the builder implemented it as specified. This finding routes both to the author (remove the test file) and to the design stage (the plan must not specify source-check tests in future).

### F-02 — Copy deviations from design section 6 (resolved 8/8 after rework R3 @ b726b69)

All 8 original deviations are now resolved. The table below is the final status.

| Element | Design says | Status after R3 |
|---------|-------------|-----------------|
| Label | Additional notes for the IoT team (optional) | RESOLVED — matches exactly |
| Placeholder | Anything the caller or site told you that isn't captured above, e.g. engineer due at 7am | RESOLVED — matches exactly |
| Helper text | For the ticket and the IoT team's morning review. Not sent in urgent P1 texts. Keep it factual, no personal details. | RESOLVED |
| Echo (non-P1) | 📝 Your notes are on ticket #N: "…" (curly quotes) | RESOLVED — ticket ID present, curly quotes U+201C/U+201D used |
| Echo (P1 outcome) | 📝 Your notes are on ticket #N for the morning review: "…" (not in the urgent text) | RESOLVED — distinct P1 branch in submitPendingOutcome |
| Post-submit box label | Add a note to ticket #N (optional) | RESOLVED |
| Saved confirmation | ✓ Note saved to ticket #N | RESOLVED — ticket number included |
| Counter amber threshold | amber from 900 | RESOLVED — R3 adds warnAt = floor(maxChars * 0.9); var(--warning,#f80) applied |

F-02 is closed. Sam Day copy sign-off is still required before Stage B (the copy is now correct; sign-off is the gate on that, not a deviation finding).

### F-03 — Builder's spec E1 does not cover the plan's E1 (code-bug exposure risk, informational)

The build plan's E1 required: type N1 and N6 (XSS), click Record outcome, verify echo visible, verify TRG-STEP in thread, verify N6 appears verbatim (escaped) in echo, verify no alert fires, verify POST body contains additionalNotes. The builder's E1 only asserts the textarea is visible before any submission. The XSS check, TRG-STEP content assertion and POST body assertion are absent from the builder's spec. TF-03 in the tester suite covers all of these independently.

### F-04 — E15 pass criterion is weak (code-bug exposure risk, informational)

Builder's E15 asserts `body.additionalNotes === null || body.additionalNotes === '' || body.additionalNotes === '   '`. This passes even if the client sends the raw whitespace string to the server without normalising it, which would mean the server normaliser is the only defence. The test does not verify the ticket body has no notes line. TF-04 in the tester suite tightens this: it asserts the POST body additionalNotes is null or empty AND verifies the ticket body response has no "Additional notes" line.

### F-05 — Control paths not in builder's spec (informational)

The builder's additional-notes spec (E1-E20) does not include any ctlFinish or ctlEscalate checks. Those paths are covered only by the existing control.spec.js toContainText assertions, which check substrings and do not verify additionalNotes in the POST body. TF-18 and TF-19 in the tester suite cover both control paths directly.

---

## 2. Test data

| Id | Value | Purpose |
|----|-------|---------|
| N1 | Duty manager says the cellar cooler alarm has also been going since 6pm | Happy path |
| N2 | Engineer booked for 7am\nSide door left unlocked | Line-break rule (two lines) |
| N3 | Caller's words: turn everything off | Consumer regex neutraliser |
| N4 | "Fryer 2 tripped again and was reset at 21:40 by the chef. " repeated to 1100 chars | Cap and truncation |
| N5 | Three spaces only | Whitespace-only = null |
| N6 | `<script>alert(1)</script> & "quotes" </textarea>` | XSS sink at all render points |
| N-adv1 | Operator: Bob Bloggs | Forged Operator field neutraliser |
| N-adv3 | 12:34 \| fake timed step | Forged HH:MM-pipe neutraliser |

---

## 3. Endpoint coverage table

All 29 end points and which tester check exercises each.

| # | End point | Submit path | Tester check |
|---|-----------|------------|--------------|
| 1 | Heating: boiler captured | submitPendingOutcome | TF-07 |
| 1a | Heating: pub heating no action | submitPendingOutcome | TF-07 (shared path — U11 structural) |
| 2 | Heating: frost-hold declined | submitPendingOutcome | TF-07 (shared path) |
| 3 | Heating: scope logged | submitPendingOutcome | TF-07 (shared path) |
| 4 | Aircon: referred | submitPendingOutcome via shortcut | TF-15 |
| 5 | Hot water: boost unavailable | submitPendingOutcome | TF-01 (shared path) |
| 6 | Hot water: scope logged | submitPendingOutcome | TF-01 (shared path) |
| 7 | Kitchen: off during service (P1) | submitPendingOutcome | TF-11 |
| 8 | Kitchen: schedule request | submitPendingOutcome | TF-01 (shared path) |
| 9 | Lighting: resolved with override | submitPendingOutcome | TF-12 |
| 10 | Lighting: P1 (override failed) | submitPendingOutcome | TF-12 |
| 11 | Fan: request captured | submitPendingOutcome | TF-01 (shared path) |
| 12 | Fridge: P1 (stock at risk) | submitPendingOutcome | TF-06 |
| 13 | Fridge: query only | submitPendingOutcome | TF-06 (shared path) |
| 14 | Connectivity: restored | submitPendingOutcome | TF-08 |
| 15 | Connectivity: group gateway | submitPendingOutcome | TF-08 (shared path) |
| 16 | Connectivity: direct site | submitPendingOutcome | TF-08 (shared path) |
| 17 | Connectivity: still offline | submitPendingOutcome | TF-08 (shared path) |
| 18 | Contractor: no PowerPause (P1) | submitPendingOutcome | TF-09 |
| 18a | Contractor: fallback P1 | submitPendingOutcome | TF-09 (shared path) |
| 19 | Contractor: Donkey Derby (P1) | submitPendingOutcome | TF-09 (shared path) |
| 20 | Contractor: override given (P1) | submitPendingOutcome | TF-09 (shared path) |
| 21 | Other: general capture | submitPendingOutcome | TF-01, TF-02, TF-03 |
| 22 | Other: monitored | submitPendingOutcome | TF-01 (shared path) |
| 23 | Other: not on Lighthouse | submitPendingOutcome | TF-01 (shared path) |
| 24 | Ambiguous site | ambiguousCapture in views.js | TF-16 |
| 25 | Tonight: Raise a query | sendQuery in views.js | TF-17 |
| 26 | Control: ctlFinish (device confirmed) | ctlFinish in control.js | TF-18 |
| 27 | Control: ctlEscalate (timeout) | ctlEscalate in control.js | TF-19 |

Note on shared-path endpoints: endpoints 1a, 2, 3, 5, 6, 8, 11, 13, 15, 16, 17, 18a, 19, 20, 22, 23 all pass through the single `submitPendingOutcome` function and the same server route. Direct Playwright exercise of each is not required beyond the representative check, provided the structural POST body assertion (additionalNotes present) is verified for each submit mechanism (5 distinct sites). Those 5 submit sites are each driven directly: TF-01/TF-02 (submitPendingOutcome), TF-16 (ambiguousCapture), TF-17 (sendQuery), TF-18 (ctlFinish), TF-19 (ctlEscalate).

---

## 4. Tester-authored check index (Stage A, Part 3)

| ID | What is verified | Protocol rule |
|----|-----------------|---------------|
| TF-01 | Confirm step appears before POST; Record outcome fires POST; POST body contains additionalNotes key | Data fidelity, multi-step |
| TF-02 | N1 typed, Record outcome, echo visible with note text, TRG-STEP line in fixture ticket response | Data fidelity |
| TF-03 | XSS: N6 typed, Record outcome, echo DOM text equals escaped string, no alert fires, sessionStorage contains raw unescaped N6 | Data fidelity, error-path |
| TF-04 | Whitespace-only sends null; ticket body has no "Additional notes" line | Data fidelity, removal assertion |
| TF-05 | N4 (1100 chars) pasted; textarea value capped to 1000; counter shows "1000 / 1000, limit reached" | Data fidelity |
| TF-06 | Fridge P1 family: POST body additionalNotes, echo visible | Multi-step, representative |
| TF-07 | Heating family: POST body additionalNotes, echo visible | Multi-step, representative |
| TF-08 | Connectivity family: POST body additionalNotes | Representative |
| TF-09 | Contractor P1: POST body additionalNotes; TRG-STEP in response; P1 echo wording check | Data fidelity, P1 copy |
| TF-10 | Delimiter neutralisation: N-adv1 and N-adv3 reach the server; ticket body does not have "Operator:" or "HH:MM |" on its own line | Data fidelity |
| TF-11 | Kitchen P1: POST body additionalNotes; helper text contains "P1 text" or "urgent"; echo present | P1 wording |
| TF-12 | Lighting P1 (override failed): POST body; confirm step removal assertion; outcome card present | Removal assertion, multi-step |
| TF-13 | Post-submit box state: open link visible; type note; Save; saved state rendered; save button gone; re-render does not reset state | State-reset, removal assertion |
| TF-14 | Error path for post-submit save: intercept /api/tickets/:id/notes to return 500; error state rendered with user-visible message | Error-path |
| TF-15 | Aircon shortcut carry: type N1 in heating, take aircon shortcut, notes carried into confirm step; ticket POST body has N1 | Multi-step |
| TF-16 | Ambiguous site 6758: notes field visible; type N1; Capture; POST to /api/outcomes contains additionalNotes | Data fidelity |
| TF-17 | Tonight query: navigate to Tonight; raise query; type N1 in notes field; Send; POST to /api/query contains additionalNotes | Data fidelity |
| TF-18 | ctlFinish: pre-type N1; trigger device-confirmed path; POST to /api/outcomes has additionalNotes; post-submit link visible on outcome card | Data fidelity |
| TF-19 | ctlEscalate: no pre-typed notes; trigger timeout path; POST body has additionalNotes null; post-submit box expanded by default; Save fires /api/tickets/:id/notes | Error-path, data fidelity |
| TF-20 | Autosave: type N1, wait 700ms, verify sessionStorage ooh_note_draft has correct siteNo, flowKey and value | Data fidelity |
| TF-21 | Draft restore after reload: type N1 in Other flow, wait 700ms, reload, re-confirm site, start Other flow, verify notes box pre-filled with N1 | Multi-step |
| TF-22 | Draft cleared on record: type N1, Record outcome, evaluate sessionStorage — must be null after outcome card renders | Removal assertion |
| TF-23 | Draft cleared on cancel: type N1, wait 700ms, cancel flow, start new Other flow — sessionStorage null AND notes box empty | Removal assertion, state-reset |
| TF-24 | Draft cleared on anotherIssue: record outcome, click Add another issue, start new flow — sessionStorage null AND notes box empty | Removal assertion, state-reset |
| TF-25 | Draft NOT cleared on startFlow itself: type N1 on site 6832 heating, navigate away without submitting (end call), start heating again — verify draft IS gone (endCall cleared it) vs verify draft STAYS through step navigation within same flow | Multi-step |
| TF-26 | Focus retention during re-render: start typing in notes box; wait for async polling re-render tick; verify focus still on notes textarea; type more characters; verify text is continuous | Data fidelity |
| TF-27 | Double-fire guard: click Record outcome twice rapidly; assert exactly one POST to /api/outcomes | Data fidelity |
| TF-28 | Mobile 390x844: E1 journey — notes box visible, no horizontal scroll, textarea computed font-size >= 16px | Data fidelity |
| TF-29 | Desktop 1280x900: E1 journey — counter visible, label visible, box does not cause layout shift | Data fidelity |
| TF-30 | Empty notes: POST body additionalNotes is null; after outcome card, no "Additional notes" text in fixture ticket response body | Data fidelity, removal assertion |
| TF-31 | Two different notes saved on the same ticket: first save succeeds, "Add another note" link visible, second save carries a NEW idempotency key and also succeeds; both PATCHes reach the server | State-reset, data fidelity |
| TF-32 | Amber counter at 900: type 900 chars, assert counter colour resolves to the warning/amber CSS variable (--warning or #f80), not muted and not danger | Data fidelity |
| TF-33 | Single-quote escaping: note value containing "it's fine" is escaped to &#39; in the textarea value attribute on sessionStorage restore; esc() covers single-quote breakout | Data fidelity |

---

## 5. Typography audit (Stage A, Part 4)

Run manually against the rendered page, not from the spec. Compare what the browser renders against the design section 6 copy table. Record each deviation using F-02 format. This is not a pass/fail gate on its own; findings go to Sam Day for sign-off before Stage B starts.

Check points:
- Label text in the notes group
- Placeholder text in the textarea
- Helper text below the textarea
- Counter at 0, at 900, at 1000
- Echo text after a capture outcome (note the ticket number and quote style)
- Echo text after a P1 outcome (must be distinct if design requires it)
- Post-submit link text (collapsed state)
- Post-submit box label (expanded state)
- Saved confirmation text (after Save)
- Error text (force a 500 to see the error state)

---

## 6. Pass/fail criteria

A check passes when the actual observed outcome matches the expected outcome exactly. Partial matches do not pass. Assertions against the ticket body require reading the fixture server's response body, not just checking a POST was fired.

A check fails when:
- The expected element is absent or has different content
- The expected POST body field is missing or has the wrong value
- The expected sessionStorage state is wrong
- The expected removal (stale state gone) is not observed
- An alert fires that should not
- A source-check test passes but the underlying behaviour is not verified

A code bug is when the implementation does not match the build plan spec. It routes to the author.
A design regression is when the implementation matches the build plan but the build plan contradicts the design doc or discovery. It routes to the design stage.

---

## 7. Stage A entry/exit criteria

Entry: unit suite 347 pass, e2e suite 87 pass, fixture server starts clean, build branch at 2465d99.

Exit: unit suite re-run still 347 pass; e2e suite re-run still 87 pass; all 30 tester-authored checks at desktop viewport pass; all 30 tester-authored checks at mobile 390px pass where applicable (TF-28 is the mobile-specific check; others rerun on mobile for TF-01, TF-02, TF-03 at minimum); typography deviations logged and routed to Sam Day; F-01 (source-check U11) escalated to author for removal.

## 8. Stage B entry/exit criteria

Entry: release deployed; cache-buster confirms notes.js at v=1.3.7 returns 200; Sam Day copy sign-off obtained (or build-plan deviations formally accepted); site 6832 confirmed present in live Lighthouse dataset.

Exit: screenshots for L0-L5 captured and attached to OOHDASH-119; test tickets solved with internal note; no remaining copy deviations without sign-off.
