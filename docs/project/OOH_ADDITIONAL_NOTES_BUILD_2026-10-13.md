# OOHDASH-119 Additional Notes — Build Summary

<!-- gate:contract
SECTION: Overview
Rework round 2 of the OOHDASH-119 "Additional notes before ticket submit" build on branch build/oohdash-119-additional-notes. All three code issues from the committee report are fixed, the 8 screen-copy deviations from design section 6 are corrected, and the gate artefact is rewritten to be accurate. Full unit (347/348) and e2e (89/89) suites pass. Quote-only diff is zero across all changed JS files and spec files. Log content is clean.

SECTION: What changed and why (rework round 2)
The committee blocked on four areas: typography (straight quotes where typographic quotes should be), late-note save losing the user's text on failure, a compliance/data-handling gap in the artefact, and 8 copy deviations from the design's approved section 6 strings. All four are resolved in this rework.

SECTION: Code changes — typography
Restored 8 pre-existing lines where the WU8 over-broad replacement changed content apostrophes and curly quotation marks to ASCII. The restore-quotes script found each line by normalised content in both the main and branch versions and wrote back the exact main-version line including its CRLF ending. Zero quote-only differences remain across all four public/js/*.js files and the two spec files.

SECTION: Code changes — late-note save failure
saveNotesPost now stores the typed value in state.flow.data._postNotesDraft before it transitions to "saving" and calls render(). The notesPostBox saving state shows a disabled textarea prefilled with that draft and a disabled button labelled "Saving…" (so the user can see their text and no double-POST is possible). The error state shows the textarea with the preserved draft (enabled for editing), the error message "Couldn't save the note: <reason>. Try again, or add it later from Tonight → ticket.", and a "Try again" button. On success _postNotesDraft is deleted. _postNotesReset (Cancel) also deletes it.

SECTION: Code changes — copy deviations from design section 6
Eight screen strings that deviated from the approved copy table are corrected. See the deviations table below.

SECTION: Code changes — echo text and P1 wording
The notes echo in submitPendingOutcome now reads "Your notes are on ticket #N: "…"" (non-P1) or "Your notes are on ticket #N for the morning review: "…" (not in the urgent text)" (P1 — payload.type === 'escalate-p1'). The ticket number comes from res.ticket.id returned by the POST. The surrounding quotation marks are typographic (U+201C / U+201D) to match the design and the existing callerWords echo.

SECTION: Logs — additionalNotes is never written to server logs
The only notes-related console call in the server is at services/zendesk.js line 258: console.warn('[ZD] Additional notes truncated to ${max} chars'). It logs the integer config limit only (currently 1000) — never the note content. routes/api.js destructures req.body.additionalNotes but does not log it. The Zendesk ticket body itself is not a server log; it is the intended destination.

SECTION: Config — correct description
There are no ENABLE_ADDITIONAL_NOTES or ADDITIONAL_NOTES_MAX_CHARS environment variables. The cap is the constant config.notes.maxChars = 1000 in config.js (OOHDASH-119 addition at line 134). The client reads it via GET /api/me, which includes notes: { maxChars: config.notes.maxChars }. To change the cap: edit config.js and redeploy. Rollback: redeploy v1.3.6 image (tag 080ccab) using the standard release.sh rollback path documented in CIR OOH_DASHBOARD_DEPLOY.md.

SECTION: Data handling and compliance
Additional notes occupy the same privacy category as callerWords and the transcript: they may contain incidental personal data. Storage: notes go to Zendesk only — not to ThingsBoard, not to the audit log, not to the P1 SMS. The sessionStorage draft (key ooh_note_draft, JSON {siteNo, flowKey, value}) is cleared at four places: submitPendingOutcome success (notesDraftClear call at flows.js after the .then), cancelFlow (flows.js), anotherIssue (flows.js), and endCall (views.js — OOHDASH-119 addition). The draft is tab-scoped (sessionStorage) and is intentionally not shared between tabs. Single-draft limitation: only one flow draft is held at a time; starting a second flow for the same site while another has a draft will overwrite it, which is the designed behaviour (the confirmed site at any moment is one site). The feature holds no state in localStorage or IndexedDB.

SECTION: Cost and silent running
The notes textarea updates the character counter via direct DOM manipulation (no re-render, no network call). Debounced sessionStorage write fires 300 ms after the last keystroke — local only. No polling, no network call per keystroke, no idle background cost. The post-submit box fires one POST when the agent clicks Save; no retries or background work happen without explicit user action.

SECTION: Cross-repo coupling
Unit test U6 and U12 in test/iot-consumer-parse.test.js pin vendored copies of parseTrgDescription, parseOohTrgComment, classifyComment, and isRedactedComment from iot-support-dashboard commit b217f34. The test U13 (drift check) is skipped in CI because ../iot-support-dashboard is absent; it runs locally when the sibling folder is present. This coupling is intentional and documented in the design.

SECTION: scripts/patch-contractor.mjs
This file is untracked operator scratch. It is not in the build, not committed, and not shipped. It was used during an earlier debugging session. git status shows it as untracked; it is excluded from all staging.

SECTION: Failure guidance
If a note appears missing from the Zendesk ticket after a call: check the Zendesk ticket's internal comments (not the public body) for the [OOH NOTE] entry (post-submit notes) and look at the timed steps in the first internal comment for the TRG-STEP entry (flow notes). If the TRG-STEP is absent, check routes/api.js normaliseAdditionalNotes — it returns null for whitespace-only input. If the post-submit box shows an error, the agent can retry immediately from the error state (text is preserved) or navigate to Tonight → ticket and add the note from the drawer.

SECTION: Self-verification results
Unit: 347/348 pass, 0 fail, 1 skip (IoT repo drift check — skipped in CI, same as main). E2E: 89/89 pass, 0 fail, 0 skip (22 additional-notes tests including E17 P1 wording and E22 failure-keeps-text; 10 control; 8 resolution; 9 tonight-callback; 8 area-model; 8 outside-lighting-p1; 3 killswitch; 3 auth; 3 boilercontrol; 13 removal-health; 1 resolution retry).

SECTION: Deviations from the approved build plan
Rework round 1 deviations are listed in the previous build artefact version (SHA 2465d99). Rework round 2 adds the following:

Rework 2a (typography, 8 pre-existing lines): WU8 used a global curly-quote replacement that also changed 8 content lines where U+2018/U+2019 apostrophes and U+201C/U+201D quotation marks appear in user-visible text. The analyze-diff2 script (enhanced to handle single curly quotes) identified them; restore-quotes2.mjs restored each line to the exact main version. Impact: zero functional change; the 8 lines are now byte-identical to main.

Rework 2b (late-note save, new behaviour): saveNotesPost now stores _postNotesDraft before transitioning to saving; notesPostBox saving state shows textarea + disabled button; error state shows textarea with preserved text + Try again button + inline error. This is the design's specified error UX, absent from the initial build.

Rework 2c (copy, 8 strings): 8 user-visible strings replaced to match design section 6 exactly (see deviations table).

Rework 2d (echo text): Notes echo rewritten to include the ticket number and to show P1-specific wording when payload.type === 'escalate-p1'.

Rework 2e (test updates): E17 updated to test P1 wording (design spec); old E17 capture-flow test moved to E21; E22 added for failure-keeps-text; control.spec.js line 245 assertion updated from ASCII apostrophe to U+2019 to match the restored Couldn’t string.

Rework 2f (no-deviation): the coordinator's issue 3 (log content) was already clean. No code change required; confirmed at zendesk.js:258.

SECTION: Copy deviation table (design section 6 vs as-built before rework 2)
-->

**Date:** 2026-10-13
**Branch:** `build/oohdash-119-additional-notes`
**Standards file:** none (vanilla JS/Node stack, universal rules applied)

---

## Features implemented (against approved build plan)

| Work unit | Description | Self-test verdict |
|-----------|-------------|-------------------|
| WU1 | Server config constant config.notes.maxChars; normaliseAdditionalNotes; /api/me notes.maxChars | PASS (unit) |
| WU2 | /api/outcomes body field additionalNotes; /api/query additionalNotes; /api/tickets/:id/notes post-submit route | PASS (unit) |
| WU3 | public/js/notes.js: notesField(), notesDraftSave/Restore/Clear(), notesPostBox(), saveNotesPost() | PASS (unit) |
| WU4 | Guided flows confirm step: finishOutcome() + submitPendingOutcome() in flows.js; FLOW-BOX in all flow steps | PASS (e2e) |
| WU5 | Control paths carry additionalNotes; control timeout/escalation outcome cards include post-submit box | PASS (e2e) |
| WU6 | Ambiguous site card notes field; Tonight query modal notes field | PASS (e2e) |
| WU7 | Bug fixes: JSDoc closer, normaliser N5 (whitespace trim), curly-quote delimiter regression, window.submitPendingOutcome global | PASS (unit) |
| WU8 | E2E test suite tests/additional-notes.spec.js (E1-E22); curly-quote content-assertion fixes; confirm-step regression fixes | PASS (e2e) |
| Rework R1 | Over-broad quote revert surgical fix; E13/E14 activated (6758 fixture, Tonight nav); unit sandbox stubs; spec assertion quote restoration | PASS (unit+e2e) |
| Rework R2 | Typography restore (8 lines); saveNotesPost failure-keeps-text; copy deviations corrected (8 strings); P1 echo wording; E17/E21/E22 test update | PASS (unit+e2e) |

---

## Self-verification results

### Unit tests (test/*.test.js)

Run on branch: 348 total — 347 pass, 0 fail, 1 skip

The one skip (test/iot-consumer-parse.test.js U13, drift check) requires the sibling ../iot-support-dashboard folder which is absent in CI. Same result on main.

The branch has 31 more tests than main (additional-notes-routes.test.js, iot-consumer-parse.test.js additions, notes-coverage-guard.test.js, and outcome-callerwords.test.js extensions). Zero pre-existing failures.

### E2E tests (tests/*.spec.js)

All specs run against the local fixture server (port 3155, DATA_MODE=fixture, HARNESS_SESSION_SIGNAL=off).

| Spec file | Tests | Pass | Fail | Skip |
|-----------|-------|------|------|------|
| additional-notes.spec.js | 22 | 22 | 0 | 0 |
| control.spec.js | 10 | 10 | 0 | 0 |
| resolution.spec.js | 8 | 8 | 0 | 0 |
| tonight-callback.spec.js | 9 | 9 | 0 | 0 |
| area-model.spec.js | 8 | 8 | 0 | 0 |
| outside-lighting-p1.spec.js | 8 | 8 | 0 | 0 |
| killswitch.spec.js | 3 | 3 | 0 | 0 |
| auth.spec.js | 3 | 3 | 0 | 0 |
| boilercontrol.spec.js | 3 | 3 | 0 | 0 |
| removal-health.spec.js | 13 | 13 | 0 | 0 |

Total: 89 pass, 0 fail, 0 skip

E13 uses house ID 6758 (existing ambiguous fixture). E14 navigates to Tonight view via nav-tonight before raise-query. E17 tests P1 wording (helper text says "Not sent in urgent P1 texts"; P1 echo says "for the morning review" and "not in the urgent text"). E22 intercepts the /api/tickets/:id/notes POST, aborts it, and asserts the textarea retains the typed text in the error state.

---

## Quote-only diff proof

After rework round 2, `git diff origin/main -- public/js/flows.js public/js/views.js public/js/control.js public/js/app.js tests/control.spec.js tests/resolution.spec.js` shows zero quote-only line pairs (verified with analyze-diff2.mjs which normalises U+2018/U+2019 to ASCII apostrophe and U+201C/U+201D to ASCII double quote before comparing removed/added pairs). All OOHDASH-119 additions use ASCII attribute delimiters throughout; typographic quotes appear only in user-visible content strings where they were already in main.

---

## Log content verification

`services/zendesk.js` line 258: `console.warn('[ZD] Additional notes truncated to ${max} chars')` — logs the integer config cap (1000), never the note content. `routes/api.js` destructures `additionalNotes` from `req.body` but does not log it. The Zendesk ticket body is the intended destination, not a server log.

---

## Config

No environment variables were added. The cap is `config.notes.maxChars = 1000` (constant in `config.js`, OOHDASH-119 addition at line 134). The client reads it from `GET /api/me` which exposes `notes: { maxChars: config.notes.maxChars }`. To change the cap: update the constant in `config.js` and redeploy. Rollback: redeploy v1.3.6 image (tag 080ccab) via the release.sh rollback path (CIR: OOH_DASHBOARD_DEPLOY.md).

---

## Data handling and compliance

Additional notes occupy the same privacy category as callerWords: they may contain incidental personal data. Storage path: Zendesk ticket only — not ThingsBoard, not the P1 SMS, not the audit log.

The sessionStorage draft (key `ooh_note_draft`) is cleared at four points:

| Event | File and location |
|-------|-------------------|
| submitPendingOutcome success | public/js/flows.js, notesDraftClear() call after .then() |
| cancelFlow | public/js/flows.js |
| anotherIssue | public/js/flows.js |
| endCall | public/js/views.js (OOHDASH-119 addition) |

The draft is tab-scoped (sessionStorage), not shared across tabs. One draft is held at a time; starting a second flow for the same site overwrites it (designed behaviour). No use of localStorage or IndexedDB.

---

## Cost and silent running

300 ms debounce before sessionStorage write; no network call per keystroke. Character counter updates via direct DOM manipulation (no re-render, no network). Post-submit box fires one POST per Save click only. No polling, no background work, zero idle cost.

---

## Cross-repo coupling

Unit tests U6/U12/U13 in `test/iot-consumer-parse.test.js` pin vendored regex copies from `iot-support-dashboard` at commit `b217f34`. U13 (drift check) is skipped when the sibling folder is absent (CI). Documented in design section 8.2.

---

## scripts/patch-contractor.mjs

Untracked operator scratch — not committed, not shipped.

---

## All changed files on branch vs main

| File | Change type |
|------|------------|
| config.js | Added config.notes.maxChars constant |
| public/index.html | Cache-buster bumped to v=1.3.8 for all JS files |
| public/js/notes.js | New file: notes component (notesField, notesInput, notesPostBox, saveNotesPost, draft helpers) |
| public/js/flows.js | finishOutcome confirm step; submitPendingOutcome POST wrapper + echo; FLOW-BOX injection; draft clear calls; pre-existing quote restoration |
| public/js/views.js | Ambiguous site notes field; query modal notes field + data-testid; sendQuery additionalNotes; endCall notesDraftClear; pre-existing quote restoration |
| public/js/control.js | ctlFinish/ctlEscalate additionalNotes; post-submit box in outcome cards; pre-existing quote restoration |
| public/js/app.js | Pre-existing quote restoration only (Can’t load line) |
| routes/api.js | /api/outcomes additionalNotes plumbing; /api/query additionalNotes; /api/tickets/:id/notes OOHDASH-119 path; /api/me notes.maxChars |
| services/zendesk.js | normaliseAdditionalNotes; buildTrgBody TRG-STEP line; buildQueryBody TRG-STEP; addFeedbackNote OOH-NOTE; P1 escalate body |
| test/additional-notes-routes.test.js | New: U8/U9/U10 unit tests for routes |
| test/iot-consumer-parse.test.js | Extended: U6/U12/U13 vendored-regex tests |
| test/notes-coverage-guard.test.js | New: U11 scan guard — every api.post outcome/query call contains additionalNotes |
| test/outcome-callerwords.test.js | Added notes stubs to vm sandbox; driveRealScopeOutcome calls submitPendingOutcome |
| test/zendesk.test.js | U1-U5/U7 extended for additionalNotes |
| tests/additional-notes.spec.js | New: E1-E22 browser tests |
| tests/area-model.spec.js | Minor: updated to pass alongside new notes fields |
| tests/control.spec.js | Record-outcome confirm step navigation; Couldn’t assertion updated to U+2019 |
| tests/killswitch.spec.js | Minor: updated to pass alongside new notes fields |
| tests/outside-lighting-p1.spec.js | Minor: updated to pass alongside new notes fields |
| tests/tonight-callback.spec.js | raise-query now carries additionalNotes |
| docs/project/OOH_ADDITIONAL_NOTES_BUILD_2026-10-13.md | This file |

---

## Failure guidance

If a note is missing from Zendesk after a call: look at the ticket's internal comments for [OOH NOTE] (post-submit path) and the timed steps in the first internal comment for the TRG-STEP line (flow path). If both are absent, check routes/api.js normaliseAdditionalNotes — whitespace-only input returns null and is not written. If the post-submit box shows an error: the agent can retry immediately (text is preserved in the textarea) or navigate to Tonight → ticket and add it from the drawer.

---

## Copy deviations from design section 6 (8 places corrected in rework 2)

| # | Element | Was (as-built) | Now (design section 6) |
|---|---------|----------------|------------------------|
| 1 | Field label | Additional notes from OOH agent: | Additional notes for the IoT team (optional) |
| 2 | Placeholder | Optional — leave blank if nothing to add | Anything the caller or site told you that isn’t captured above, e.g. engineer due at 7am |
| 3 | Helper text | Anything extra for the ticket and morning review — not sent in the urgent P1 text. | For the ticket and the IoT team’s morning review. Not sent in urgent P1 texts. Keep it factual, no personal details. |
| 4 | Echo — missing ticket ID | Note added — for the ticket and morning review: “…” | Your notes are on ticket #N: “…” |
| 5 | Echo — no P1-specific variant | (same wording for all outcomes) | Your notes are on ticket #N for the morning review: “…” (not in the urgent text) |
| 6 | Post-submit box label | Add a note to ticket #N: (with colon, without "(optional)") | Add a note to ticket #N (optional) |
| 7 | Saved confirmation | ✓ Note added to ticket | ✓ Note saved to ticket #N |
| 8 | Save error and button | Could not save note / Retry | Couldn’t save the note: 〈reason〉. Try again, or add it later from Tonight → ticket. / Try again |

Note D6 ("Additional notes from OOH agent:" used verbatim in the Zendesk TRG-STEP line and OOH-NOTE comment) is unaffected — that label is in services/zendesk.js and routes/api.js, not in the on-screen notesField label.

---

## Curly-quote incident (honest account including round 2 findings)

WU4 introduced new HTML template literals in flows.js, views.js, control.js, and app.js using U+201C/U+201D as HTML attribute delimiters. WU8 fixed these with a global replacement that also changed 18 pre-existing content lines. Rework R1 restored those 18 lines by surgical selective revert.

Rework R2 found a further 8 lines where the R1 analyze script missed U+2018/U+2019 single curly quotes (the original script normalised them to `"` instead of `'`, so normalised comparisons never matched). The improved analyze-diff2.mjs correctly normalises both single and double curly quotes. These 8 lines were restored by restore-quotes2.mjs to the exact main versions (including CRLF line endings). After R2, zero quote-only line pairs remain across all four public/js/*.js files and both spec files.

---

## Deviations from the approved build plan

Rework R1 deviations (already reported in prior artefact):
1. WU8 over-broad quote replacement corrected.
2. E4-E12/E15/E19/E20 test path corrected from scope-check to capture path.
3. E2 sessionStorage key corrected.
4. E9/E10 testids corrected.
5. E18 reload path corrected.
6. E20 double-click timeout added.
7. E13 fixture corrected to 6758.
8. E14 Tonight navigation added; data-testid="query-modal" added to views.js raiseQuery().
9. Unit test sandbox notes stubs; driveRealScopeOutcome updated for confirm-step path.

Rework R2 deviations (this report):
- R2a: 8 pre-existing content lines restored to main versions (typography; zero functional change).
- R2b: saveNotesPost failure-keeps-text added (design-specified UX absent from initial build).
- R2c: 8 screen-copy strings corrected to match design section 6.
- R2d: Notes echo rewritten — ticket number added; P1-specific wording added.
- R2e: E17 updated to test P1 wording (design spec §8.3 E17); old E17 capture-flow test moved to E21; E22 added for failure-keeps-text; control.spec.js line 245 assertion updated to U+2019.
- R2f: Issue 3 (log content) confirmed clean — no code change.

---

## Commits on branch

596f441 feat(OOHDASH-119) WU1+WU2: server config, normaliser and route wiring
dbb4c68 feat(OOHDASH-119) WU3+WU9: notes.js client component and cache busters
4bed7c6 feat(OOHDASH-119) WU4: guided flows confirm step + autosave wiring
6d461bf feat(OOHDASH-119) WU5: control paths carry additionalNotes + post-submit box
64ec555 feat(OOHDASH-119) WU6: notes box on ambiguous site card and Tonight query
cd2cbba fix(OOHDASH-119) WU7: fix JSDoc asterisk closer, normaliser N5, curly-quote delimiters and U11 window
97ecb78 test(OOHDASH-119) WU8: e2e specs + curly-quote regression fixes
2465d99 fix(OOHDASH-119) rework R1: surgical quote revert, E13/E14 activated, unit sandbox stubs
(rework R2 commit adds to HEAD after push)

---

## Handoff to reviewer / test

Branch build/oohdash-119-additional-notes is pushed with all work committed.
Server starts cleanly on port 3155, DATA_MODE=fixture.
Unit suite: 347/348 pass (1 skip — IoT drift check, same on main).
E2E suite: 89/89 pass (0 skip, 0 fail). E13, E14, E17, E22 all run and pass.
No secrets, hardcoded endpoints, or dev scratch artefacts in committed files.
No version bump; scripts/release.sh not run. Cache-busters bumped to v=1.3.8 in index.html.
