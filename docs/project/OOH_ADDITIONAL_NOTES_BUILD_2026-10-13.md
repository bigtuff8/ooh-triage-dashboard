# OOHDASH-119 Additional Notes — Build Summary
**Date:** 2026-10-13
**Branch:** `build/oohdash-119-additional-notes`
**Standards file:** none (vanilla JS/Node stack, universal rules applied)

---

## Features implemented (against approved build plan)

| Work unit | Description | Self-test verdict |
|-----------|-------------|-------------------|
| WU1 | Server config: ADDITIONAL_NOTES_MAX_CHARS, ENABLE_ADDITIONAL_NOTES env vars; server.js wiring | PASS (unit) |
| WU2 | Server route /api/outcomes body field additionalNotes; normaliser normaliseAdditionalNotes (N1-N5); post-submit route /api/tickets/:id/notes | PASS (unit) |
| WU3 | public/js/notes.js client component: notesField(), notesDraftSave/Restore/Clear(), notesPostBox(), saveNotesPost() | PASS (unit) |
| WU4 | Guided flows confirm step: finishOutcome() + submitPendingOutcome() in flows.js; FLOW-BOX injection into all active flow steps | PASS (e2e) |
| WU5 | Control paths carry additionalNotes; control timeout/escalation outcome cards include post-submit box | PASS (e2e) |
| WU6 | Ambiguous site card notes field; Tonight query modal notes field | PASS (e2e) |
| WU7 | Bug fixes: JSDoc closer, normaliser N5 (whitespace trim), curly-quote delimiter regression (app.js U+2018/U+2019 as string delimiters), U11 window.submitPendingOutcome global | PASS (unit) |
| WU8 | E2E test suite tests/additional-notes.spec.js (E1-E20); curly-quote content-assertion fixes; confirm-step regression fixes across existing specs | PASS (e2e) |
| Rework | Pre-committee corrections: over-broad quote revert surgical fix; E13/E14 activated (6758 fixture + Tonight nav); unit test sandbox stubs; test assertion quote restoration | PASS (unit+e2e) |

---

## Self-verification results

### Unit tests (test/*.test.js)

Run on branch: 348 total — 347 pass, 0 fail, 1 skip
Run on main baseline (c6690fc): 317 total — 316 pass, 0 fail, 1 skip

The branch has 31 more tests than main: additional-notes-routes.test.js (new OOHDASH-119 unit file). Zero pre-existing failures.

The one skip on both main and branch is the liveness freshness test that requires credentials/thingsboard.env which is absent.

### E2E tests (tests/*.spec.js)

All specs run against the live fixture server (port 3155, DATA_MODE=fixture, HARNESS_SESSION_SIGNAL=off).

| Spec file | Tests | Pass | Fail | Skip |
|-----------|-------|------|------|------|
| additional-notes.spec.js | 20 | 20 | 0 | 0 |
| control.spec.js | 12 | 12 | 0 | 0 |
| resolution.spec.js | 8 | 8 | 0 | 0 |
| tonight-callback.spec.js | 9 | 9 | 0 | 0 |
| area-model.spec.js | 8 | 8 | 0 | 0 |
| outside-lighting-p1.spec.js | 8 | 8 | 0 | 0 |
| killswitch.spec.js | 3 | 3 | 0 | 0 |
| auth.spec.js | 3 | 3 | 0 | 0 |
| boilercontrol.spec.js | 3 | 3 | 0 | 0 |
| removal-health.spec.js | 13 | 13 | 0 | 0 |

Total: 87 pass, 0 fail, 0 skip

E13 (ambiguous site capture) uses house ID 6758 (the existing ambiguous fixture with Bowers/Bowman sites). E14 (Tonight query with notes) navigates to the Tonight view via nav-tonight before accessing raise-query. Both run and pass unconditionally.

---

## Curly-quote incident (honest account)

WU4 introduced new HTML template literals in flows.js, views.js, control.js, and app.js using U+201C/U+201D (curly double quotes) as HTML attribute delimiters — for example `class=“confirm-step”` instead of `class="confirm-step"`. This broke Playwright selectors such as `[data-testid="flow-panel"]` because the browser parsed the attribute values with curly-quote delimiters that CSS attribute selectors with ASCII quotes could not match.

WU8 fixed these delimiters with a global replacement of all U+201C/U+201D in the four JS files. This was over-broad: main legitimately contains curly quotes in content positions (display text such as `no “off” switch`, script display divs with `“${script}”`, search result labels). My replacement changed 18 pre-existing lines that were not part of the OOHDASH-119 feature and should have been byte-identical to main.

The rework commit restores those 18 lines exactly: unchanged lines in the 4 client JS files now have curly-quote counts matching main on unchanged lines (verified: flows.js OK, views.js OK, control.js OK, app.js OK). Two test assertions in control.spec.js and resolution.spec.js that asserted the display text were also incorrectly changed to ASCII and have been restored to their main versions. The OOHDASH-119 additions keep ASCII attribute delimiters throughout, which is correct.

One OOHDASH-119-introduced content line (`Recorded from the caller:` echo in submitPendingOutcome) was also over-broadly changed: the callerwords display uses U+201C/U+201D typographic quotation marks in main's equivalent code and the test regex in outcome-callerwords.test.js asserted for them. The content quote was restored to match the existing test expectation.

---

## Deviations from the approved build plan

1. WU8 over-broad quote replacement (corrected in rework): The global curly-quote replacement in WU8 changed 18 pre-existing unchanged lines in the 4 client JS files and 2 test assertion lines. Corrected in the rework commit by selective revert. Impact: zero functional change; the attribute delimiter fixes (the correct part) are preserved throughout.

2. E4-E12/E15/E19/E20 test path: Tests were initially written using other-check (scope-check path) expecting an immediate confirm-step. Corrected to use other-capture (direct capture path). Feature under test is correctly exercised.

3. E2 sessionStorage key: Test initially looked for ooh-notes- prefix; actual key is ooh_note_draft. Corrected in WU8.

4. E9/E10 testids: post-notes-toggle/input/save corrected to addnotes-post-open/input/save to match the notes.js implementation.

5. E18 reload path: After page.reload() the server-side site session is cleared; test updated to re-confirm the site. The sessionStorage draft persists correctly through reload.

6. E20 double-click timeout: Second btn.click() given a 2000ms timeout to prevent consuming the full 90s test timeout when the button is removed by the first click.

7. E13 fixture: Test initially searched for site 9999 (no fixture). Changed to use house ID 6758 (existing ambiguous fixture: Bowers and Bowman sites). This is a test-only fix; the feature code already handled ambiguous sites correctly.

8. E14 navigation: Test initially called confirmSite() putting the user in the workspace view where raise-query is absent. Fixed to navigate to the Tonight view where the button lives. Added data-testid="query-modal" to the raiseQuery() modal wrapper in views.js to make the modal locatable. This is an OOHDASH-119 addition to a function that already received OOHDASH-119 changes (the notesField addition).

9. Unit test sandbox (outcome-callerwords.test.js): OOHDASH-119 introduced calls to notesDraftRestore, notesDraftClear, notesField, notesPostBox, and notesValue from flows.js. The test's vm sandbox did not include stubs for these browser globals. Added no-op stubs. Also updated driveRealScopeOutcome to call submitPendingOutcome after the confirm step (OOHDASH-119 made finishOutcome show a confirm step rather than immediately POSTing).

---

## Commits on branch

97ecb78 test(OOHDASH-119) WU8: e2e specs + curly-quote regression fixes
cd2cbba fix(OOHDASH-119) WU7: fix JSDoc asterisk closer, normaliser N5, curly-quote delimiters and U11 window
64ec555 feat(OOHDASH-119) WU6: notes box on ambiguous site card and Tonight query
6d461bf feat(OOHDASH-119) WU5: control paths carry additionalNotes + post-submit box
4bed7c6 feat(OOHDASH-119) WU4: guided flows confirm step + autosave wiring
dbb4c68 feat(OOHDASH-119) WU3+WU9: notes.js client component and cache busters
596f441 feat(OOHDASH-119) WU1+WU2: server config, normaliser and route wiring
(rework commit adds to HEAD after push)

---

## Handoff to reviewer / test

Branch build/oohdash-119-additional-notes is pushed with all work committed.
Server starts cleanly: node server.js on port 3155, DATA_MODE=fixture.
Unit suite: 347/348 pass (1 skip for missing thingsboard credentials — same on main).
E2E suite: 87/87 pass (0 skip, 0 fail). E13 and E14 run and pass.
No secrets, hardcoded endpoints, or dev scratch artefacts in committed files.
No version bump or scripts/release.sh was run (per build plan rules).
Cache-buster query strings in public/index.html were bumped in WU3 (per plan requirement).
