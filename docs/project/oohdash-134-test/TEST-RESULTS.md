<!-- gate:contract
SECTION: Verdict
PASS. The new "P1 Escalation" choice in the 'Something else' flow works as James asked and does not break anything else. All six acceptance criteria and the D4 reason guard passed, both by the automated tests and by driving the app by hand at desktop and phone width. No defects were found. A few small observations are listed below; none of them blocks the release.

SECTION: What was tested and on which code
The code tested is PR #107 head e4cdb27 on branch test/oohdash-134-other-p1. PR #107 has since been merged to main as 036de05, and that merge has exactly the same files as e4cdb27, so these results apply to main. Everything ran against the local app in fixture mode with test data only. Production was not touched: no outcomes were posted, no P1 was raised and nothing was written to live systems. The Stage-1 test-plan committee has no command-line route yet (a known gap), so the test plan and these results are reviewed together in this one document.

SECTION: Automated suites
The unit suite passed 418 of 419 tests with 1 skipped and none failed. The full Playwright end-to-end suite passed 161 of 163 tests with 2 skipped, none failed and none flaky (no retries were used). The two skipped tests are existing tester tests TF-18 and TF-19 that were already skipped before this change. All 11 new OOHDASH-134 end-to-end tests passed, and so did all 33 existing tests that now press "Raise a Normal Priority ticket" after Capture.

SECTION: Hands-on checks at desktop and phone width
The flow was driven by hand-style automation at 1280 pixels and at 390 pixels wide, with 55 checks and 55 passes. Typing was done key by key, not pasted. The first step is unchanged. After Capture the two buttons show the exact labels, and the explanation matches James's wording exactly, with no in-hours, P2 or P3 wording anywhere. The P1 stays blocked when the reason is empty or only spaces and line breaks, even when the button is forced. A 119-character reason gives an 80-character text summary ending in "..." while the ticket keeps the full text. The P1 confirm step, the red P1 card, and the normal-priority path all matched what was expected. A forced 500, 403, 400 and a network timeout each showed a friendly "Couldn't record the outcome" message, and "Try again" then worked. After a P1, starting a new 'Something else' without reloading gave a clean, blocked form. Double-clicking "Record outcome" sent only one request. No console errors appeared and there was no sideways scrolling at 390 pixels.

SECTION: Same P1 signal as the lighting P1
A lighting P1 and a 'Something else' P1 were raised on the same test site, Angel Inn 6749, and the two requests were compared field by field. Both have the same fields, the same type escalate-p1, no capture class and no actionId. Only the subject, detail, text summary and issue label differ, and all four are allowed to. Both tickets came back with identical tags, ooh and ooh_p1, and both triggered the escalation step in the same way. The ticket read-back does not show priority. Priority is set on the server only from the type escalate-p1, the server did not change in this release, and the types are identical, so both tickets are urgent.

SECTION: Build deviations reviewed
Three things Build did beyond the plan were reviewed, and all three are accepted. First, the notes.js debounce fix: clearing the notes draft now also cancels a save that is waiting to run. Without it, a note typed just before submitting could reappear in the next flow. The fix is small and safe, and the existing additional-notes tests cover it and pass. Second, test 134-H checks the phone layout at 375 pixels. It passed, and the hands-on checks confirmed the same at 390 pixels. Third, the parity test cannot see priority directly, as explained in the section above. That is an acceptable limit, not a gap.

SECTION: Defects and observations
There are no defects. There are five observations, none blocking. O1: callerWords is empty for 'Something else' outcomes because the step-0 box is separate from the smart-entry caller words; this was the same in v1.4.1 and also applies to lighting. O2: the build plan's D3 label "Escalate as P1" was overridden by James to "P1 Escalation", and the code uses the override, which is correct. O3: on the normal-priority path the history now shows an extra line, "Raised as a normal priority ticket"; the request and the card are byte-identical to v1.4.1. O4: while the P1 button is disabled it shows grey, not the red outline; this is expected and reads clearly as unavailable. O5: a full suite run overwrites the committed OOHDASH-119 evidence screenshots; they were restored and not committed, and this is a small test-hygiene item for the backlog.
-->

# TEST RESULTS -- OOHDASH-134
## "P1 Escalation" choice in the 'Something else' flow (v1.4.2)

**Ticket:** OOHDASH-134 | **Release:** v1.4.2 (patch) | **Code under test:** e4cdb27 (PR #107 head; merged to main as 036de05, tree-identical) | **Test branch:** test/oohdash-134-other-p1 | **Date:** 2026-10-16 | **Environment:** local, AUTH_MODE=dev, DATA_MODE=fixture (no live Zendesk, no SMS, no production writes)

**Authoritative spec:** operator overrides given to Test (labels "P1 Escalation" and "Raise a Normal Priority ticket"; stage 0 unchanged; two buttons plus inline reason box after Capture; P1 blocked until a non-whitespace reason; exact explanation text; no in-hours or P2/P3 wording; same P1 signal as proven flows via outcomeP1; normal ticket = unchanged capture), then BUILD_PLAN.md, then DESIGN.md.

**Process note:** the Stage-1 test-plan committee has no CLI route (known gap), so the plan (section 1) and the results (sections 2 to 6) are reviewed together.

---

## 1. Test plan

| Area | Method | Protocols applied |
|---|---|---|
| Unit | npm run test:unit (node:test), incl. new test/other-p1-summary.test.js | Return-value assertions only |
| End-to-end | npx playwright test, full suite, one run, serial | Repo suite as built |
| Exploratory | Scripted browser drive of a separate local fixture server (port 3177), desktop 1280x900 and phone 390x844 | Data fidelity, sequential typing, removal assertions, error paths (500/403/400/timeout), state reset without reload, multi-step with intermediate assertions |
| Parity | Lighting "Still not working" P1 then Something else P1 on site 6749; compare POST bodies and ticket read-back | Data fidelity |
| Text | Exact string comparison of labels and explanation against the operator override | Data fidelity |

Source-check scan: no test in the PR asserts on function source (no toString or code-grep tests). The unit test asserts on the HTML returned by otherP1Choice, which is behaviour (a return value), not source.

---

## 2. Acceptance criteria results

| AC | Meaning | Evidence | Result |
|---|---|---|---|
| AC1 | P1 choice offered after Capture, with explanation; stage 0 unchanged | e2e 134-A, 134-A2; exploratory S0, LBL, EXPL, NOWORD (both widths) | PASS |
| AC2 | P1 raised through shared outcomeP1; confirm step; red P1 card | e2e 134-B; exploratory CONF, CARD, PAY1, RM1, DBL | PASS |
| AC3 | Text summary at most 80 characters; full reason kept in detail | unit (5 summary cases); e2e 134-C; exploratory LONG (119-char reason, summary 80 chars ending "...", detail has full text) | PASS |
| AC4 | Check path and normal capture unchanged | e2e 134-E, 134-F, 33 updated existing tests; exploratory NORM, NCARD, NBLK, NBLK2 | PASS |
| AC5 | All existing suites green | unit 418 pass / 1 skip / 0 fail; e2e 161 pass / 2 skip / 0 fail / 0 flaky | PASS |
| AC6 | Same P1 signal as lighting P1 | e2e 134-G; exploratory PAR-REQ, PAR-RES, PAR-TKT | PASS |
| D4 | P1 blocked until a non-whitespace reason | e2e 134-D, 134-D2, 134-D3; exploratory BLK, WS, BYP, EN, RESET | PASS |

---

## 3. Suites

| Suite | Command | Total | Pass | Skip | Fail | Notes |
|---|---|---|---|---|---|---|
| Unit | npm run test:unit | 419 | 418 | 1 | 0 | ~5.9 s |
| End-to-end | npx playwright test | 163 | 161 | 2 | 0 | 5.0 min, 1 worker, no retries triggered |
| OOHDASH-134 e2e subset | tests/oohdash-134-other-p1.spec.js | 11 | 11 | 0 | 0 | 134-A, A2, B, C, D, D2, D3, E, F, G, H |

Skipped e2e (pre-existing, unrelated): tests/tester/oohdash-119.tester.spec.js TF-18 and TF-19.

Existing tests updated by Build: 33 other-capture clicks across tests/additional-notes.spec.js, tests/killswitch.spec.js, tests/tester/oohdash-119-screenshots.spec.js and tests/tester/oohdash-119.tester.spec.js; a re-grep found 33 matching other-normal clicks, so none were missed.

---

## 4. Exploratory results (55 checks, 55 pass)

Each row below was run at both desktop (1280) and phone (390) width unless marked.

| ID | Step | Expected | Actual | Result |
|---|---|---|---|---|
| S0 | Open Something else | Only "Check if it's Lighthouse-controlled" and "Capture & escalate as described" | Exactly those two buttons | PASS |
| LBL | Type caller words, Capture | Labels exactly "P1 Escalation" / "Raise a Normal Priority ticket" | Exact match | PASS |
| EXPL | Read explanation | Three sentences exactly as the override | Exact string match, all three | PASS |
| NOWORD | Scan whole page text | No P2, P3, in-hours, working hours | Absent | PASS |
| NOBOX | Stage-0 text present | No inline reason box; P1 enabled | box=0, enabled | PASS |
| HSCROLL | Choice step layout | No horizontal scroll | 1280<=1280, 390<=390 | PASS |
| RM1 | Press P1 Escalation | Choice buttons removed, confirm step shown | Both buttons gone | PASS |
| CONF | Confirm step | Subject and detail shown, no POST yet | "Something else - urgent, escalated as P1" + "Caller reported: Gas smell near the cellar door. Did not fit a specific tile; handler judged it urgent tonight."; 0 POSTs | PASS |
| DBL | Double-click Record outcome | Exactly one POST | 1 POST | PASS |
| CARD | Outcome card | Escalated - P1, ticket number, pages the on-duty manager, script | All present | PASS |
| PAY1 | POST /api/outcomes body | type escalate-p1, OohCaptureClass null, no actionId, p1Summary "Something else: Gas smell near the cellar door" | As expected | PASS |
| RESET | Add another issue, Something else, Capture, no reload | Caller box empty, reason box empty, P1 disabled | All three true | PASS |
| BLK | Blank stage 0, Capture | P1 disabled, blocked note visible | disabled, note visible | PASS |
| WS | Type spaces then Enter into reason box (sequential) | P1 stays disabled | disabled | PASS |
| BYP | Call raiseOtherP1() directly with whitespace reason | Refused, no confirm step, no POST | 0 confirm steps, no new POST | PASS |
| EN | Type a real reason (sequential) | P1 enabled, note hidden | enabled, hidden | PASS |
| LONG | 119-char reason via inline box, P1, Record | Summary at most 80, ends "...", full reason in detail | 80 chars "Something else: Water is pouring through the ceiling above the main bar and o..."; detail contains full text | PASS |
| ERR0 | Console and page errors over the P1 walk | None | None | PASS |
| NORM | Normal path POST body | type capture, "General issue captured", class general, no p1Summary, v1.4.1 detail text | Exact match | PASS |
| NCARD | Captured card | Next working day wording + script | Present | PASS |
| NBLK | Blank stage 0, normal button | Never blocked | enabled | PASS |
| NBLK2 | Blank stage 0 normal POST | detail "Caller reported: (not specified). ..." as v1.4.1 | Exact match | PASS |
| ERR500 / 403 / 400 | Force P1 POST status, then Try again | Friendly "Couldn't record the outcome" message, no stack trace; retry records the P1 | As expected | PASS |
| ERRTO | Force network timeout on P1 POST, then Try again | Friendly message; retry works | "Cannot reach the OOH Dashboard server - check your connection"; retry worked | PASS |
| PAR-REQ (desktop) | Lighting P1 vs Something else P1 (inline-reason path) | Same key set; differences limited to allowed fields | Same 11 keys; differ only subject, detail, p1Summary, issueLabel | PASS |
| PAR-RES (desktop) | Outcome responses | Both carry an escalation dispatch record | Both present, same provider and status | PASS |
| PAR-TKT (desktop) | /api/callback/6749 read-back | Identical tag sets incl. ooh and ooh_p1 | Both ["ooh","ooh_p1"] | PASS |

Evidence screenshots (docs/project/oohdash-134-test/evidence/):

| File | Shows |
|---|---|
| desktop-01-choice-step-with-text.png, 390-01-choice-step-with-text.png | Choice step with the two buttons and explanation |
| desktop-02-p1-confirm.png, 390-02-p1-confirm.png | P1 confirm step |
| desktop-03-p1-outcome-card.png, 390-03-p1-outcome-card.png | Red P1 outcome card with ticket number |
| desktop-04-blocked-empty-reason.png, 390-04-blocked-empty-reason.png | Blank reason: inline box, prompt, disabled P1 |
| desktop-05-normal-captured-card.png, 390-05-normal-captured-card.png | Normal-priority captured card |
| desktop-06-p1-error-500.png | Forced 500 error state with Try again |

---

## 5. Build deviations reviewed

| Item | What | Assessment |
|---|---|---|
| notes.js debounce fix (e4cdb27) | notesDraftClear now also clears the pending _notesDraftTimer (declared with let at notes.js:94) so a draft typed less than 300 ms before submit is not re-saved and restored into the next flow | Correct and minimal; additional-notes e2e suite passes; accepted |
| 134-H at 375 px | New e2e checks the choice step at 375 px with no horizontal scroll | Passed; exploratory confirmed the same at 390 px; accepted |
| Parity test cannot see priority | /api/callback ticket read-back does not expose priority | Priority is derived server-side only from type === 'escalate-p1' (routes/api.js, isP1 -> 'urgent'); server unchanged; both types identical; accepted as a documented limit |

---

## 6. Defects and observations

Defects: none.

| ID | Type | Observation | Routing |
|---|---|---|---|
| O1 | Pre-existing behaviour | callerWords is null for Something else outcomes; the stage-0 box is not the smart-entry freeText. Same in v1.4.1 and for lighting | None for this release |
| O2 | Spec reconciliation | BUILD_PLAN D3 said "Escalate as P1"; the operator override sets "P1 Escalation"; code follows the override | None, correct |
| O3 | Minor UI difference | Normal path adds a history line "Raised as a normal priority ticket"; POST body and card byte-identical to v1.4.1 | None, acceptable |
| O4 | Design note | Disabled P1 renders grey rather than red outline | None, reads as unavailable |
| O5 | Test hygiene | Full e2e run rewrites tracked docs/project/test-evidence/oohdash-119 screenshots; restored, not committed | Backlog candidate |

Test data: all test tickets were created only in the local fixture store (scratch directory) and the local server was stopped afterwards. Nothing was written to production.
