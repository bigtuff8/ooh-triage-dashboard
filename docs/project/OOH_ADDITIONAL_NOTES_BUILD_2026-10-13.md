# OOHDASH-119 Additional Notes — Build Summary

<!-- gate:contract
SECTION: Overview
Rework round 3 (final targeted fixes) of OOHDASH-119 "Additional notes before ticket submit" on branch build/oohdash-119-additional-notes. Nine technical and security fixes applied per operator-approved rework mandate. Full unit (348/349) and e2e (90/90) suites pass. Zero CR bytes in all changed files. Quote-only diff remains zero.

SECTION: What changed and why (rework round 3)
The build-completion committee blocked a second time on technical issues (CRLF line endings producing spurious diffs) and security issues (XSS evidence gap, IDOR disclosure, missing idempotency on retry). Nine targeted fixes address every blocking item.

SECTION: Fix 1 — line endings
All files modified on branch contained CRLF line endings from a Windows checkout with core.autocrlf=true; main uses pure LF. Root cause: restore-quotes2.mjs (rework 2) detected CRLF and preserved it; subsequent edits in notes.js etc. were LF-clean but four pre-existing JS files and tests/control.spec.js retained CRLF. Resolution: git config core.autocrlf false (project-local); fix-line-endings.mjs stripped all CR bytes. Verified: git diff name-only against main piped through tr to count CR bytes = 0. Diff stat for the three cited files: app.js +19/-0, control.js +21/-2, views.js +24/-5.

SECTION: Fix 2 — app.js render() focus/caret-preservation (disclosure)
OOHDASH-119 added 22 lines of focus/caret-preservation logic inside render() at app.js lines 128-138 and 171-177. Before each DOM write, saves activeElement id and selectionStart/End when the active element is a notes textarea; restores focus and caret after the DOM write. Prevents cursor loss on auto-refresh. Wrapped in try/catch; no-op when no notes textarea is focused.

SECTION: Fix 3 — XSS at every additionalNotes DOM sink
Every sink where additionalNotes reaches the DOM uses esc() defined at app.js line 27, which HTML-entity-encodes &, <, >, and ". Sinks: notesField value attribute (notes.js), notesPostBox textarea value (notes.js), notes echo in submitPendingOutcome (flows.js). E23 (e2e) injects both probes and asserts no img[onerror] element or __xss flag. U14 (unit, vm sandbox) asserts notesField() output contains escaped forms and no raw executable tags.

SECTION: Fix 4 — IDOR on POST /api/tickets/:id/notes (accepted pre-existing risk)
The route accepts any authenticated operator's note against any ticket ID in the request path. Pre-existing design shared with /followup and /thread; existed before OOHDASH-119. Operator identity is stamped on every note by session. Operator-accepted 2026-10-13; follow-up ticket to be raised to audit-gate sensitive ticket IDs. No code change.

SECTION: Fix 5 — echo ticket-ID guard
res?.ticket?.id guarded with ?? null fallback. Echo reads "the ticket" instead of "ticket #undefined" when the server returns a degraded response without a ticket object.

SECTION: Fix 6 — retry double-post idempotency
Client: _postNotesPending flag set before fetch, cleared in both success and catch, preventing rapid double-click on Try again. _postNotesToken (random+timestamp) generated once per open box, sent as idempotencyKey in POST body, survives retries. Server: _notesIdempCheck() maintains an in-memory Map keyed on ticketId:token with 60-second TTL; duplicate within window returns 200 ok with deduplicated:true without writing. Stale entries purged on each check.

SECTION: Fix 7 — counter amber at 900
notesField and notesInput compute warnAt = Math.floor(maxChars * 0.9). Counter: below warnAt = muted grey, warnAt to maxChars-1 = amber (var(--warning,#f80)), at maxChars = danger red. Matches design section 6 amber-from-900 spec.

SECTION: Fix 8 — route catch logs ticket ID and message only
POST /api/tickets/:id/notes kind=additional-notes wraps zendesk.addFeedbackNote in try/catch. Emits console.error with ticket ID and err.message only — never note content. Re-throws so wrap() handler returns 500.

SECTION: Fix 9 — error text humanised
saveNotesPost catch maps error categories: network errors to "No connection — check your internet and try again."; 500s to "The server had a problem. Try again in a moment."; 400s pass the server's validation message; others to "Couldn't save — please try again." No raw HTTP status codes reach the UI.

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
Unit: 348/349 pass, 0 fail, 1 skip (IoT repo drift check — skipped in CI, same as main; U14 XSS unit test added). E2E: 90/90 pass, 0 fail, 0 skip (23 additional-notes tests including E17 P1 wording, E22 failure-keeps-text, E23 XSS probe; 10 control; 8 resolution; 9 tonight-callback; 8 area-model; 8 outside-lighting-p1; 3 killswitch; 3 auth; 3 boilercontrol; 13 removal-health).

SECTION: Deviations from the approved build plan
Rework rounds 1 and 2 deviations listed in prior artefact versions. Rework round 3 adds: R3a line-endings (CR stripped, no functional change); R3b render() caret-logic disclosed (already built, now documented); R3c XSS E23+U14 added (escaping already correct, tests added); R3d IDOR accepted pre-existing risk (no code change); R3e echo guard for missing ticket ID (fallback to "the ticket"); R3f idempotency added (_postNotesPending + _postNotesToken client; _notesIdempMap 60s TTL server); R3g counter amber at 900; R3h route catch console.error (ticket ID + message only); R3i error message humanised (no raw HTTP strings).

SECTION: XSS sink table
notes.js notesField — textarea value attribute — esc() wraps data.value — U14 (unit vm) + E23 (e2e). notes.js notesPostBox saving/error — textarea value attribute — esc() wraps _postNotesDraft — E22 + E23. flows.js submitPendingOutcome echo — innerHTML div — esc() wraps f.data.additionalNotes — E23.

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
| Rework R3 | Line endings (CR→LF); caret-logic disclosure; XSS E23+U14; IDOR accepted; echo guard; idempotency; amber counter; route catch; error humanisation | PASS (unit+e2e) |

---

## Self-verification results

### Unit tests (test/*.test.js)

Run on branch: 349 total — 348 pass, 0 fail, 1 skip

The one skip (test/iot-consumer-parse.test.js U13, drift check) requires the sibling ../iot-support-dashboard folder which is absent in CI. Same result on main.

The branch has 31 more tests than main (additional-notes-routes.test.js, iot-consumer-parse.test.js additions, notes-coverage-guard.test.js, and outcome-callerwords.test.js extensions). Zero pre-existing failures.

### E2E tests (tests/*.spec.js)

All specs run against the local fixture server (port 3155, DATA_MODE=fixture, HARNESS_SESSION_SIGNAL=off).

| Spec file | Tests | Pass | Fail | Skip |
|-----------|-------|------|------|------|
| additional-notes.spec.js | 23 | 23 | 0 | 0 |
| control.spec.js | 10 | 10 | 0 | 0 |
| resolution.spec.js | 8 | 8 | 0 | 0 |
| tonight-callback.spec.js | 9 | 9 | 0 | 0 |
| area-model.spec.js | 8 | 8 | 0 | 0 |
| outside-lighting-p1.spec.js | 8 | 8 | 0 | 0 |
| killswitch.spec.js | 3 | 3 | 0 | 0 |
| auth.spec.js | 3 | 3 | 0 | 0 |
| boilercontrol.spec.js | 3 | 3 | 0 | 0 |
| removal-health.spec.js | 13 | 13 | 0 | 0 |

Total: 90 pass, 0 fail, 0 skip

E13 uses house ID 6758 (existing ambiguous fixture). E14 navigates to Tonight view via nav-tonight before raise-query. E17 tests P1 wording (helper text says "Not sent in urgent P1 texts"; P1 echo says "for the morning review" and "not in the urgent text"). E22 intercepts the /api/tickets/:id/notes POST, aborts it, and asserts the textarea retains the typed text in the error state. E23 injects XSS probes into the notes textarea, submits the flow, and asserts no img[onerror] element is created, no __xss flag is set, and the echo contains the literal escaped probe text.

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
| public/js/app.js | Pre-existing quote restoration (Can’t load line); OOHDASH-119 focus/caret-preservation (22 lines) in render() |
| routes/api.js | /api/outcomes additionalNotes plumbing; /api/query additionalNotes; /api/tickets/:id/notes OOHDASH-119 path; /api/me notes.maxChars; _notesIdempMap + _notesIdempCheck (R3); try/catch with console.error (R3) |
| services/zendesk.js | normaliseAdditionalNotes; buildTrgBody TRG-STEP line; buildQueryBody TRG-STEP; addFeedbackNote OOH-NOTE; P1 escalate body |
| test/additional-notes-routes.test.js | New: U8/U9/U10 unit tests for routes; U14 XSS vm-sandbox test (R3) |
| test/iot-consumer-parse.test.js | Extended: U6/U12/U13 vendored-regex tests |
| test/notes-coverage-guard.test.js | New: U11 scan guard — every api.post outcome/query call contains additionalNotes |
| test/outcome-callerwords.test.js | Added notes stubs to vm sandbox; driveRealScopeOutcome calls submitPendingOutcome |
| test/zendesk.test.js | U1-U5/U7 extended for additionalNotes |
| tests/additional-notes.spec.js | New: E1-E23 browser tests (E23 XSS probe added R3) |
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

Rework R2 deviations:
- R2a: 8 pre-existing content lines restored to main versions (typography; zero functional change).
- R2b: saveNotesPost failure-keeps-text added (design-specified UX absent from initial build).
- R2c: 8 screen-copy strings corrected to match design section 6.
- R2d: Notes echo rewritten — ticket number added; P1-specific wording added.
- R2e: E17 updated to test P1 wording (design spec §8.3 E17); old E17 capture-flow test moved to E21; E22 added for failure-keeps-text; control.spec.js line 245 assertion updated to U+2019.
- R2f: Issue 3 (log content) confirmed clean — no code change.

Rework R3 deviations (this report):
- R3a: Line endings — CR bytes stripped from all changed files (git config core.autocrlf false). Zero functional change.
- R3b: render() 22-line focus/caret-preservation logic — built in WU3, disclosed now.
- R3c: E23 (e2e XSS probe) and U14 (unit vm XSS probe) tests added. esc() was already correct; tests are additive.
- R3d: IDOR on POST /api/tickets/:id/notes — accepted pre-existing risk. No code change.
- R3e: Echo guard — res?.ticket?.id ?? null fallback prevents "ticket #undefined".
- R3f: Idempotency — _postNotesPending + _postNotesToken client; _notesIdempMap 60s TTL server; idempotencyKey in POST body.
- R3g: Counter amber threshold at 900 (warnAt = Math.floor(maxChars * 0.9)).
- R3h: Route catch — console.error logs ticket ID + err.message only, never note content.
- R3i: Error message humanised in saveNotesPost catch — no raw HTTP strings in UI.

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
