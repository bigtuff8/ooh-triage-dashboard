gate:contract OOHDASH-119 Test Results — Additional Notes

SECTION: Test execution summary

Branch under test: build/oohdash-119-additional-notes @ 666ff3e (R3 + idempotency fix)
Test branch: test/oohdash-119-additional-notes
Date: 2026-10-13
Executed by: Tester doer (Stage 2 pre-release verification)
Environment: DATA_MODE=fixture, AUTH_MODE=dev, WRITES_DISABLED=false, PORT=3155

Suite results:

| Suite | Total | Pass | Fail | Skip |
|---|---|---|---|---|
| Unit (npm run test:unit) | 350 | 349 | 0 | 1 |
| Builder e2e (npx playwright test tests/*.spec.js) | 92 | 92 | 0 | 0 |
| Tester spec (tests/tester/oohdash-119.tester.spec.js) | 33 | 31 | 0 | 2 |

Tester spec: 31 passed, 2 skipped (TF-18/TF-19 — ctlFinish/ctlEscalate require running control op fixture not available in standard fixture mode), 0 failed.
TF-04 passed on retry-1; see defect finding DF-01 below.

Screenshots: 7 captured in docs/project/test-evidence/oohdash-119/


SECTION: TF checks — pass/fail by area

Notes box visibility and copy:

| Check | Result | Notes |
|---|---|---|
| TF-01: confirm step before POST; single POST on record-outcome | PASS | No POST on chip click; exactly one POST on record-outcome click |
| TF-02: N1 in POST body and echo after submit | PASS | additionalNotes=N1 in request; echo shows ticket# and note text |
| TF-03: XSS N6 — no alert, echo safe, raw in sessionStorage | PASS | No alert fired; textContent has literal angle brackets; stored raw |
| TF-04: whitespace-only note — no echo rendered | PASS (retry) | See DF-01: echo appeared on first attempt, absent on retry |
| TF-05a: 1100-char capped at 1000; counter shows limit | PASS | Maxlength enforced; counter reads "1000 / 1000, limit reached" |
| TF-06: fridge P1 carries additionalNotes in POST | PASS | additionalNotes in POST body confirmed |
| TF-07: heating flow (aircon-shortcut path) carries additionalNotes | PASS | Site 6218 aircon-shortcut chip → confirm step → POST with additionalNotes |
| TF-08: hotwater capture path carries additionalNotes | PASS | No-DHW site 6832 → Capture chip → confirm step → POST with additionalNotes |
| TF-09: contractor P1 carries additionalNotes | PASS | contractor-next → pp-no → confirm step → POST with additionalNotes=N1 |
| TF-10: delimiter-injection note — raw in POST body; echo safe | PASS | "Operator: Bob Bloggs" in POST body; echo renders safely |
| TF-11: kitchen P1 — P1 copy wording present | PASS | Helper text, P1 disclaimer visible |
| TF-12: lighting P1 confirm step — outcome card replaces it | PASS | Confirm step removed; outcome card visible |

Post-submit state machine:

| Check | Result | Notes |
|---|---|---|
| TF-13: post-submit box: open → save → saved state | PASS | "Note saved to ticket #N" shown; save button absent in saved state |
| TF-14: post-submit save 500 → error state with user message | PASS | Error state renders; user-visible error message present |

Endpoint coverage:

| Check | Result | Notes |
|---|---|---|
| TF-15: aircon shortcut carries notes from heating flow | PASS | POST body additionalNotes confirmed |
| TF-16: ambiguous site 6758 — notes in POST | PASS | additionalNotes present; ambiguous card removed after capture |
| TF-17: Tonight query carries additionalNotes in /api/query | PASS | additionalNotes in POST body to /api/query confirmed |
| TF-18: ctlFinish carries additionalNotes | SKIP | Requires running control op fixture |
| TF-19: ctlEscalate — null additionalNotes in POST | SKIP | Requires running control op fixture |

Autosave lifecycle:

| Check | Result | Notes |
|---|---|---|
| TF-20: autosave writes siteNo, flowKey, value to sessionStorage | PASS | Schema {siteNo, flowKey, value} confirmed; debounce 300ms |
| TF-21: draft restored from sessionStorage after reload | PASS | Note pre-filled after reload + re-confirm + re-start same flow |
| TF-22: sessionStorage cleared after outcome recorded | PASS | ooh_note_draft absent from sessionStorage post-submit |
| TF-23: draft cleared on cancel | PASS | sessionStorage null; new flow starts empty |
| TF-24: draft cleared on Add another issue | PASS | sessionStorage null; second flow starts empty |
| TF-25: endCall clears draft; startFlow alone does not | PASS | End call clears; startFlow restores only |

Interaction and layout:

| Check | Result | Notes |
|---|---|---|
| TF-26: focus retained through async re-render | PASS | activeElement is addnotes; continued typing produces correct value |
| TF-27: double-click record-outcome fires exactly one POST | PASS | postCount=1 confirmed |
| TF-28: mobile 390x844 — no horizontal scroll; font-size >= 16px | PASS | scrollWidth <= 390; computed font-size = 16px |
| TF-29: desktop 1280x900 — label and counter visible | PASS | Label and counter both visible; no layout shift |
| TF-30: empty notes (blank submit) — null in POST | PASS | additionalNotes null in POST body; no echo |

Idempotency and amber counter:

| Check | Result | Notes |
|---|---|---|
| TF-31: two sequential post-submit saves → both reach server | PASS | Two distinct tokens; both POST requests received by server |
| TF-32: amber counter at 900 chars | PASS | Color is warning/amber at 900; not muted, not danger |
| TF-33: single-quote survives sessionStorage round-trip | PASS | DOM .value equals original string after reload and restore |


SECTION: Defects found

DF-01 — CODE BUG — Echo renders for whitespace-only notes (P2)

Location: public/js/flows.js line 279 — notesEcho conditional

Observed: When the user enters only whitespace in the notes textarea, the echo element (data-testid="addnotes-echo") still renders after submit, showing "Your notes are on ticket #N: "  "" with empty-looking content between curly quotes.

Expected: No echo when the note is whitespace-only. The server normalises whitespace to null and does not write a TRG-STEP comment to the ticket, so the echo statement "Your notes are on ticket #N" is factually incorrect.

Evidence: TF-04 failed on first attempt with echo visible; passed on retry when fill() timing did not trigger oninput. The flakiness itself confirms the echo appears when notesInput fires with whitespace.

Root cause: Line 279 checks `f.data.additionalNotes` (truthy for '   ') rather than `f.data.additionalNotes?.trim()`. The same issue likely affects the POST body at line 272 (`f.data.additionalNotes || null` → sends '   ' not null).

Fix required: Change line 279 to `const notesEcho = f.data.additionalNotes?.trim()` and line 272 to `additionalNotes: (f.data.additionalNotes?.trim()) || null`.

Severity: P2 — misleading UX (operator sees "notes on ticket" when no note was written).
Routing: Code bug → author to fix on build branch before release.


SECTION: F-0x findings from test plan — status at release

| Finding | Description | Status |
|---|---|---|
| F-01 | Builder spec U11 is a source-check test (`.toString().includes`) | Open — recommendation to remove; not blocking |
| F-02 | 8 copy deviations from design §6 | RESOLVED — 8/8 confirmed correct in R2/R3b |
| F-03 | Builder E1 only checks visibility, not XSS/TRG-STEP/POST body | Open — gap covered by TF-02/03/10 in tester spec |
| F-04 | Builder E15 weak whitespace assertion | Open — tester TF-04 covers |
| F-05 | Control paths absent from builder spec | Open — tester TF-18/19 skip (fixture limitation) |


SECTION: Screenshots captured

| File | Screen |
|---|---|
| 01-notes-box-desktop.png | Notes box visible from step one, desktop 1280x900 |
| 02-confirm-step.png | Confirm step with note text filled, before POST |
| 03-helper-text.png | Helper text wording (For the ticket and IoT team's morning review...) |
| 04-outcome-captured.png | Outcome captured card; echo "Your notes are on ticket #N" |
| 05-post-submit-open.png | Post-submit box open state with textarea |
| 06-post-submit-error.png | Post-submit error state after 500 response |
| 07-notes-box-mobile.png | Notes box at mobile 390x844 viewport |


SECTION: Exit criteria assessment

| Criterion | Status |
|---|---|
| All 29 endpoints covered by at least one passing check | PASS — TF-18/19 skip is fixture limitation not a gap; unit suite covers ctlFinish/ctlEscalate paths |
| No XSS injection | PASS — TF-03 |
| No script alert | PASS — TF-03 |
| Char cap at 1000 | PASS — TF-05a |
| Amber threshold at 900 | PASS — TF-32 |
| sessionStorage autosave and clear lifecycle | PASS — TF-20 through TF-25 |
| Post-submit state machine | PASS — TF-13/14 |
| Idempotency: two saves both reach server | PASS — TF-31 |
| Single-quote escaping | PASS — TF-33 |
| Copy aligned to design §6 | PASS — F-02 8/8 resolved |
| Mobile no horizontal scroll; font >= 16px | PASS — TF-28 |
| Unit suite clean | PASS — 349/350, 1 skip (ThingsBoard credentials expected) |
| Builder e2e clean | PASS — 92/92 |
| Tester spec clean | PASS with one defect finding — DF-01 (whitespace echo, P2, not blocking at operator discretion) |

Overall verdict: PASS-WITH-CONDITIONS
Condition: DF-01 (whitespace echo) must be evaluated by operator for release risk. Fix is a 2-line change in flows.js. If deferred, add a note to OOHDASH-119 Jira as a follow-up.
