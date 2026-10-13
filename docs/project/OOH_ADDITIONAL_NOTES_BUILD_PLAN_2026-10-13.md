<!-- gate:contract
SECTION: What is being built
OOHDASH-119 adds a free-text Additional Notes box to every ticket-creation point in the OOH Dashboard. The agent can type extra context before clicking Record outcome; those words land on the Zendesk ticket and appear as the final timed step in the IoT Support Dashboard ticket detail view. Leaving the box empty changes nothing. The limit is 1000 characters (held in one shared setting). No AI, no background service, no idle cost.

SECTION: How the operator decision E2 changes the flow
Every one of the 25 guided-flow outcomes now shows a confirm step instead of auto-submitting the moment the final choice chip is clicked. The confirm step shows a summary of what is about to be recorded, the notes box (which has been visible and editable throughout the flow from step one), and a Record outcome button. The agent clicks Record outcome to create the ticket. Notes typed at any point in the flow are autosaved: each keystroke is debounced 300 ms and written to sessionStorage keyed by siteNo plus flow type, so the draft survives a browser Back button or page reload within the same call. Critically, startFlow itself does NOT clear the draft; it only restores one if the siteNo and flow type match. The draft is cleared from sessionStorage only at explicit end-of-call points: when the ticket is recorded, the issue is cancelled, Add another issue is clicked, or the call is ended. This means a reload followed by returning to the same site and flow type restores the note (E18 passes), while starting a fresh flow after recording finds no draft because the record already cleared it (E20 passes). No note ever carries forward to the next ticket. The two device-control outcomes (setpoint change, timeout escalation) are unchanged: they auto-submit as today and show an Add a note to ticket link on the result card. The ambiguous-site card and the Tonight query window each get a notes box above their existing send button; those buttons are not changed.

SECTION: What changes and in what order
Nine small work units, each independently verifiable, are built in dependency order. First, the server gains the notes constant, a normaliser function (including delimiter and field-marker injection defences), the IoT-safe ticket-body format, and the updated route handlers. Second, a new shared client file provides the notes field, the sessionStorage autosave helpers, and the post-submit box components. Third, the guided flow is updated so the final chip renders a confirm step instead of firing the API; startFlow restores any matching sessionStorage draft but does not clear it; the four explicit end-of-call functions each call clear. Fourth, the device-control paths carry the note on their existing auto-submit and show the post-submit link. Fifth, the ambiguous-site card and Tonight query window get their notes boxes. Sixth and seventh, four new test files and a suite of browser tests cover every submit path, the character-limit edge cases, adversarial injection inputs, the IoT parser regression, the no-carry-over rule, and three sessionStorage-specific cases (restore after reload, cleared after record, no carry to next call). A pre-release step verifies the IoT dashboard is at the pinned commit b217f34 before running the parser-regression tests. Eighth, the browser-cache version markers in the dashboard's main HTML file are bumped. Total estimated effort: seven hours.

SECTION: Testing and live proof
Unit tests run with npm run test:unit and must all pass before browser tests start. Browser tests run with npx playwright test and cover one journey of each outcome family, the ambiguous site, the Tonight query, both control results, focus survival during a live re-render, character-limit enforcement, adversarial injection inputs, the no-carry-over rule, and the sessionStorage lifecycle. A pre-release check verifies that the deployed iot-support-dashboard git HEAD equals b217f34 (the pinned commit the parser-regression tests were written against). After release, a real ticket is raised on ooh.airedale-group.io at a site agreed by the operator pre-release, then checked in Zendesk and in the IoT dashboard ticket detail view on both desktop and phone. This live-proof step is a hard gate before the release is considered complete. No live P1 or live device-change is used for proof; those are covered in fixture mode.

SECTION: Rollback and risks
Rollback command (from DEPLOY_RUNBOOK.md): kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:080ccab. Tickets already carrying notes remain valid plain text after a rollback. The highest-probability risk is a stale browser cache (mitigated by bumping the cache marker in WU9 and confirmed by the live-proof step). The IoT parser pin (b217f34) is an accepted risk recorded explicitly in this document: if the iot-support-dashboard is updated, the vendored test regexes in U6/U12 may go stale. Mitigated by U13 drift check and a first-build verification step; owner James Brown (OOH owner). Security: the notes textarea is pre-filled from sessionStorage via a DOM-escaping call (esc()); all sinks escape at render time; the notes endpoint is authenticated and shares the existing IDOR exposure of the ticket-notes endpoint, which is recorded as a pre-existing residual out of scope for this feature. Compliance: note content is retained solely in Zendesk and inherits its retention policy; excluding the note text from the audit log is a conscious decision (the audit records only "note added" not the note value, matching the existing drawer-notes pattern).

DECISION: Should the notes box visible throughout the guided flow also appear on the confirm step, or should the confirm step render a fresh notes-only box? | One continuous box: the FLOW-BOX renders from step one and is the same box the agent sees at the confirm step | Fresh box on confirm step only: the notes box first appears when the agent reaches the confirm step
DETAIL: Recommend one continuous box. The autosave requirement (note survives back navigation) is only meaningful if the box is present during earlier steps; a fresh box would reset any note typed before the final chip. The continuous approach matches the FLOW-BOX wiring in the design spec and requires no extra state management.

DECISION: Should the confirm step show the outcome description text (subject and detail from the payload) so the agent can verify what they are about to record? | Show the outcome description above the notes box and Record outcome button | Show only the notes box and Record outcome button with no outcome preview
DETAIL: Recommend showing the outcome description. The agent needs to confirm they clicked the right chip before committing; omitting it means a mis-click is only discovered from the Zendesk ticket. This is low-effort to implement (the payload's subject and detail are already in scope).

DECISION: Which real site should be used for the live-proof run on ooh.airedale-group.io? | Old Grey Mare (6832), the standard fixture site used in all e2e tests — confirm it is accessible on the live instance | Operator to name a different agreed test site before release
DETAIL: Recommend operator confirms pre-release. The fixture site 6832 is suitable if it exists in the live Lighthouse dataset; otherwise the operator names an alternative. Live-proof test tickets are solved immediately with a "test, OOHDASH-119 live proof" internal note.
-->

# OOHDASH-119 Additional Notes — Build Plan

**Date:** 2026-10-13
**Ticket:** OOHDASH-119
**Branch:** build/oohdash-119-additional-notes (from main 58366fd, live v1.3.6)
**Build-plan branch:** build-plan/oohdash-119-additional-notes
**Input:** signed-off discovery OOH_ADDITIONAL_NOTES_DISCOVERY_2026-10-13.md, signed-off design OOH_ADDITIONAL_NOTES_DESIGN_2026-10-13.md, design-gate PR #80 operator decisions E1-E5, D5-D7; coordinator amendments 2026-10-13 (sessionStorage, blocking fixes).
**Standards:** idioms of the existing codebase (vanilla JS client, Node/Express server, Jest-compatible node:test unit tests, Playwright e2e).

---

## 1. Operator decisions binding this build

| ID | Decision | This plan's implementation |
|----|----------|-----------------------------|
| E1 | Notes land as the last timed step in [TRG] action list | TRG-STEP line appended in buildTrgBody after the transcript loop |
| E2 | Record outcome button on all 25 guided-flow outcomes; autosave within call; no carry-over | finishOutcome renders a confirm step (see WU4); autosave via debounced sessionStorage (see section 3); cleared on record/cancel/endCall/anotherIssue only |
| E3 | Line breaks become " / " | normaliseAdditionalNotes replaces newlines before oneLine |
| E4 | Over 1000 chars server-side: keep first 1000 (surrogate-safe) plus ellipsis, still create ticket | normaliseAdditionalNotes cap logic |
| E5 | P1 box kept, wording says not in urgent text | FLOW-BOX present on P1 flows; helper text from design section 6 |
| D5 | Cap = 1000, one constant | config.notes.maxChars = 1000; no literal elsewhere |
| D6 | Label "Additional notes from OOH agent:" | Used verbatim in TRG-STEP and OOH-NOTE |
| D7 | Sanitise like callerWords | normaliseAdditionalNotes follows the same oneLine + render-time escape pattern, with additional delimiter-injection defences (section 5.1) |

---

## 2. E2 impact: guided flows confirm step

### 2a. How E2 is implemented (one change, not 25)

`finishOutcome` in `public/js/flows.js` is the single shared function called by all 25 outcome helpers (`outcomeCaptured`, `outcomeP1`, `outcomeScope`, `outcomeNoAction`). Instead of setting `_pend_` and firing the POST immediately, `finishOutcome` will:

1. Store the payload idempotently in `f.data['_conf_' + key]`.
2. If `_pend_` is not set: return a confirm-step HTML block containing the outcome description (payload.subject + payload.detail), the FLOW-BOX (pre-filled from `state.flow.data.additionalNotes`), and a `<button data-testid="record-outcome" onclick="submitPendingOutcome('key')">Record outcome</button>`.
3. If `_pend_` is set: return the existing loading div `Recording the outcome...`.

A new global `window.submitPendingOutcome(key)` sets `_pend_`, calls `render()`, then fires `api.post('/api/outcomes', {...stored payload, additionalNotes: state.flow.data.additionalNotes || null})` and handles success/error exactly as today.

No `outcomeCaptured`, `outcomeP1`, `outcomeScope`, or `outcomeNoAction` call sites are edited. The existing `_pend_` double-fire guard and the Try-again error path are preserved.

### 2b. FLOW-BOX placement

`renderFlow()` in `flows.js` injects `notesField({ bind: 'flow', value: f.data.additionalNotes })` inside `.flowbody` after the step body content when `f.stage !== 99`. At `f.stage === 99` the confirm step is gone; `%%NOTESPOST%%` in `f.data._outcomeHtml` is replaced by `notesPostBox(ticketId)`.

### 2c. E2e tests that assume auto-submit — full list and fix strategy

Under E2 the chip click renders the confirm step; the POST does not fire until Record outcome is clicked. All 10 Playwright spec files were audited; 4 contain tests that expect the POST immediately after a chip click or that assert an outcome card without a Record outcome button click. resolution.spec.js (ambiguous capture path) is unaffected because the ambiguous path uses its existing Capture button with no confirm step. boilercontrol.spec.js, auth.spec.js, removal-health.spec.js, and control.spec.js are unaffected (control paths do not go through finishOutcome's confirm step).

| File | Lines | Current pattern | Fix needed |
|------|-------|-----------------|------------|
| tests/area-model.spec.js | 94-106 (aircon shortcut test) | Promise.all([waitForRequest('/api/outcomes'), shortcut.click()]) then outcome-captured | Remove Promise.all; click shortcut, await confirm step visible, click [data-testid="record-outcome"], then await outcome-captured |
| tests/area-model.spec.js | 123-131 (suggest flow test) | Promise.all([waitForRequest('/api/outcomes'), suggest.click()]) then outcome-captured | Same fix |
| tests/outside-lighting-p1.spec.js | 30-33 (111-A lighting P1 test) | Promise.all([waitForRequest, chipClick]) | Click chip, click Record outcome, then assert P1 outcome card and captured request |
| tests/outside-lighting-p1.spec.js | 85-88 (second lighting P1 variant) | Same Promise.all pattern | Same fix |
| tests/killswitch.spec.js | 46-49 (other-capture kill-switch path) | Click other-capture chip, expect outcome-captured | Add click [data-testid="record-outcome"] before outcome assertion |
| tests/tonight-callback.spec.js | 9-12 (F011 outcomes in Tonight) | Click "Caller sorted it" chip, expect outcome-captured | Add click [data-testid="record-outcome"] before outcome assertion |

Control spec is unaffected (control paths do not go through finishOutcome's confirm step). Control outcome cards gain a new post-submit notes link; existing `toContainText` assertions on the outcome cards remain valid because they check substrings, not exact text.

---

## 3. Autosave mechanism — corrected design (resolves E18 vs E20 contradiction)

### 3a. Exact sequence

1. `notesInput(el)` fires on every keystroke: writes `el.value` to `state.flow.data.additionalNotes` directly (no render, no network); schedules a debounced (300 ms) call to `notesDraftSave` with the current siteNo and flowKey.
2. `notesDraftSave(siteNo, flowKey, value)`: `try { sessionStorage.setItem('ooh_note_draft', JSON.stringify({ siteNo, flowKey, value })) } catch {}`. Any storage error is silently swallowed; the page never crashes.
3. `notesDraftRestore(siteNo, flowKey)`: `try { const e = JSON.parse(sessionStorage.getItem('ooh_note_draft')); return (e?.siteNo === siteNo && e?.flowKey === flowKey) ? (e.value || null) : null } catch { return null }`.
4. `notesDraftClear()`: `try { sessionStorage.removeItem('ooh_note_draft') } catch {}`.
5. `startFlow(k, freeText, opts)`: creates the new flow object; if NOT `opts.carryNotes`, calls `notesDraftRestore(state.workspace.site.siteNo, k)` and, if a non-null value is returned, sets `state.flow.data.additionalNotes = restoredValue`. **startFlow does NOT call notesDraftClear — it only restores.** The carryNotes path (two in-flow shortcuts) skips the restore and carries the in-memory value instead.
6. `notesDraftClear()` is called at (and only at): `submitPendingOutcome` success, `cancelFlow`, `anotherIssue`, `endCall`.

### 3b. Why this resolves E18 vs E20

**E18 (restore after reload):**
Agent on site 6832, starts Other flow, types N1 → sessionStorage entry: `{ siteNo: '6832', flowKey: 'other', value: N1 }`. Page reloads — state is cleared, sessionStorage persists. Agent returns to site 6832, starts Other flow again. `startFlow('other', ...)` calls `notesDraftRestore('6832', 'other')` — the entry matches — N1 is restored into `state.flow.data.additionalNotes` and pre-fills the FLOW-BOX. ✓

**E20 (no carry-over after record):**
Agent records the ticket. `submitPendingOutcome` success calls `notesDraftClear()` — sessionStorage entry removed. Agent starts any new flow. `startFlow` calls `notesDraftRestore` — no entry found — notes box starts empty. Second ticket body has no notes line. ✓

There is no contradiction because `startFlow` never clears the draft (so reload works) and `submitPendingOutcome` always clears it (so carry-over is blocked).

### 3c. Full autosave table

| Aspect | Detail |
|--------|--------|
| Primary storage | `state.flow.data.additionalNotes` (in-memory; survives step navigation within the page session) |
| Durable storage | sessionStorage key `ooh_note_draft`; JSON value `{ siteNo, flowKey, value }`; tab-scoped (cleared automatically when the tab is closed) |
| Write path — in-memory | `notesInput(el)`: direct write to `state.flow.data.additionalNotes`; counter DOM node updated directly; no `render()` call, no focus loss |
| Write path — sessionStorage | Debounced 300 ms after each keystroke; try/catch; no network |
| Key scoping | siteNo + flowKey. A draft for site 6832 heating does not restore on site 6832 fridge or site 9001 heating |
| Restore | `startFlow(k)`: reads and matches draft; sets `additionalNotes` if match found; does NOT clear |
| Focus restore | `render()` in `app.js` captures `document.activeElement` id + selection before innerHTML swap; restores after; try/catch |
| Clear points | `submitPendingOutcome` success, `cancelFlow`, `anotherIssue`, `endCall` |
| NOT a clear point | `startFlow`, `openSite` — clearing at openSite would destroy a draft mid-reload |
| Carry-over guard | carryNotes shortcuts skip restore and use in-memory value; once `_ticketId` is set, carry is refused; tests E15, E16, E19, E20 verify no carry-over |

---

## 4. Coverage: all 29 end points under E2

| # | End point | Submit mechanism | Notes path |
|---|-----------|-----------------|------------|
| 1 | Heating: boiler panel captured | FLOW-BOX + confirm step + Record outcome | TRG-STEP + POST-LINK |
| 1a | Heating: pub heating no action (found in design) | As above | TRG-STEP + POST-LINK |
| 2 | Heating: frost-hold declined | As above | TRG-STEP + POST-LINK |
| 3 | Heating: scope logged | As above | TRG-STEP + POST-LINK |
| 4 | Aircon: referred | As above | TRG-STEP + POST-LINK |
| 5 | Hot water: boost unavailable/declined | As above | TRG-STEP + POST-LINK |
| 6 | Hot water: scope logged | As above | TRG-STEP + POST-LINK |
| 7 | Kitchen: P1 (off during service) | As above | TRG-STEP in body only; not in P1 summary or SMS |
| 8 | Kitchen: schedule request | As above | TRG-STEP + POST-LINK |
| 9 | Lighting: resolved with override | As above | TRG-STEP + POST-LINK |
| 10 | Lighting: P1 (override failed) | As above | TRG-STEP in body only |
| 11 | Fan: request captured | As above | TRG-STEP + POST-LINK |
| 12 | Fridge: P1 (stock at risk) | As above | TRG-STEP in body only |
| 13 | Fridge: query only | As above | TRG-STEP + POST-LINK |
| 14 | Connectivity: restored | As above | TRG-STEP + POST-LINK |
| 15 | Connectivity: group gateway | As above | TRG-STEP + POST-LINK |
| 16 | Connectivity: direct site | As above | TRG-STEP + POST-LINK |
| 17 | Connectivity: still offline | As above | TRG-STEP + POST-LINK |
| 18 | Contractor: no PowerPause P1 | As above | TRG-STEP in body only |
| 18a | Contractor: fallback P1 (found in design) | As above | TRG-STEP in body only |
| 19 | Contractor: Donkey Derby P1 | As above | TRG-STEP in body only |
| 20 | Contractor: override given P1 | As above | TRG-STEP in body only |
| 21 | Other: general capture | As above | TRG-STEP + POST-LINK |
| 22 | Other: monitored | As above | TRG-STEP + POST-LINK |
| 23 | Other: not on Lighthouse | As above | TRG-STEP + POST-LINK |
| 24 | Ambiguous site | Existing Capture button with notesField above it (no confirm step) | TRG-STEP (no post-link, screen returns home) |
| 25 | Tonight: Raise a query | Existing Send button with notesField above it (no confirm step) | TRG-STEP via raiseQuery |
| 26 | Control: ctlFinish (device confirmed) | Auto-submit unchanged; FLOW-BOX value carried if typed | TRG-STEP if pre-typed; POST-LINK to OOH-NOTE |
| 27 | Control: ctlEscalate (timeout/failure) | Auto-submit unchanged | TRG-STEP if pre-typed; POST-LINK (expanded default) |

Coverage guard (U11) — see section 5.7 for the robust implementation.

---

## 5. Ordered work units

### WU1 — Server config and normaliser (0.5 h)

Files: `config.js`, `services/zendesk.js`

- `config.js`: add `notes: { maxChars: 1000 }` block.
- `services/zendesk.js`: export `normaliseAdditionalNotes(raw, config)` with the following steps in order:
  1. non-string or null: return null (never a 400; an optional field must not block a ticket).
  2. replace each run of line breaks (`/[\r\n]+/g`) with " / "; then `oneLine` (trim + collapse whitespace).
  3. Delimiter-injection defences — applied in this order to the now-single-line string:
     a. Replace `/\bOperator:\s*/gi` with `Operator - ` (prevents forging the Operator: IoT field).
     b. Replace `/\bOutcome:\s*/gi` with `Outcome - ` (prevents forging the Outcome: IoT field).
     c. Replace `/Caller'?s words\s*:/gi` with `caller's words -` (existing rule, retains it).
     d. Replace `/(\b\d{1,2}:\d{2}\s*)[|–—]/g` with `$1-` (neutralises HH:MM| step-lookalikes; the pipe becomes a hyphen so no line matches the step regex).
  4. empty after the above: return null.
  5. longer than `config.notes.maxChars` UTF-16 code units: `s.slice(0, max)`; if last code unit is a high surrogate (`/[\uD800-\uDBFF]$/`), drop it; append "…"; console.warn with ticket context (U4b). Result is always well-formed Unicode.
- `buildTrgBody`: add `additionalNotes` parameter; after the transcript loop and before the data-quality footer, `if (additionalNotes) lines.push(defaultTime + ' | Additional notes from OOH agent: "' + additionalNotes + '"')`.
- `createOutcomeTicket`: accept `additionalNotes`, call `normaliseAdditionalNotes` once, pass result to `buildTrgBody`.
- `raiseQuery(operator, siteNo, text, additionalNotes)`: accept and pass through.

Self-verify: `npm run test:unit` (zendesk.test.js subset); server starts clean.

### WU2 — Server routes (0.25 h)

File: `routes/api.js`

- `/api/me` response: add `notes: { maxChars: config.notes.maxChars }` beside existing fields.
- `POST /api/outcomes` handler: destructure `additionalNotes` from `req.body`; pass to `createOutcomeTicket`. Not passed to `escalateP1`, not written to the audit log.
- `POST /api/query` handler: pass `req.body.additionalNotes` to `raiseQuery`.
- `POST /api/tickets/:id/notes` handler: when `req.body.kind === 'additional-notes'`, normalise body with `normaliseAdditionalNotes`; return 400 `{ error: 'Note is empty' }` if null; call `addFeedbackNote` with the labelled string. Without `kind`, existing behaviour is byte-for-byte unchanged (drawer notes are unaffected).

Self-verify: server starts; curl /api/me response contains notes.maxChars; unit tests still 316/316 pass.

### WU3 — Client notes component (0.75 h)

Files: new `public/js/notes.js`, `public/index.html`

`notes.js` exports (attached to window):

- `notesField({ id = 'addnotes', bind = null, value = '' })` returns the HTML string for: label, textarea (`id`, `data-testid` = id, `maxlength` from `state.me.notes.maxChars`, `rows=2`, `oninput="notesInput(this)"`, `data-bind` when bind = 'flow', pre-filled with `esc(value)` in the attribute to prevent XSS breakout from sessionStorage-restored values, `font-size:16px` for iOS), helper text, counter span.
- `notesInput(el)`: updates counter DOM node directly (getElementById, no render). When `el.dataset.bind === 'flow'` and `state.flow?.data`, writes `el.value` to `state.flow.data.additionalNotes`. Schedules debounced (300 ms) call to `notesDraftSave(state.workspace?.site?.siteNo, state.flow?.data?._flowKey, el.value)`. No render call.
- `notesValue(id)`: returns `document.getElementById(id)?.value?.trim() || null`. Used by ambiguous and query paths.
- `notesDraftSave(siteNo, flowKey, value)`: sessionStorage write described in section 3a, step 2.
- `notesDraftRestore(siteNo, flowKey)`: sessionStorage read described in section 3a, step 3.
- `notesDraftClear()`: sessionStorage remove described in section 3a, step 4.
- `notesPostBox(ticketId, { expanded = false })`: returns the post-submit HTML block reading `state.flow.data._postNotes` state (`idle`, `open`, `saving`, `saved`, `error`) so re-renders do not reset a saved note. Testids: `addnotes-post-open`, `addnotes-post-input`, `addnotes-post-save`, `addnotes-post-saved`, `addnotes-post-error`.
- `saveNotesPost(ticketId)`: reads the post-input textarea, posts `{ body: value, kind: 'additional-notes' }` to `/api/tickets/${ticketId}/notes`, sets `_postNotes` state, calls `render()`.
- `public/index.html`: add `<script src="/js/notes.js?v=1.3.7"></script>` immediately before the `flows.js` script tag.

Self-verify: page loads with no console errors; counter updates on input; type a note and pause — DevTools Application sessionStorage shows `ooh_note_draft` entry within 400 ms.

### WU4 — Guided flows confirm step (1 h)

Files: `public/js/flows.js`, `public/js/app.js`

`flows.js`:

- Each flow object created by `startFlow` stores `f.data._flowKey = k` so `notesInput` can read it for the sessionStorage key.
- `renderFlow()`: inject `notesField({ bind: 'flow', value: f.data.additionalNotes || '' })` inside `.flowbody` when `f.stage !== 99`. At `f.stage === 99`, replace `%%NOTESPOST%%` with `notesPostBox(f.data._ticketId)`.
- `finishOutcome(f, key, payload, renderCard)`:
  1. Return cached `_out_` HTML if succeeded.
  2. Return error HTML with Try again if `_err_` set (Try again resets `_pend_` and `_conf_`).
  3. If `_conf_` not yet set: store `{ ...payload }` in `f.data['_conf_' + key]`.
  4. If `_pend_` not set: return confirm-step HTML — outcome description (payload.subject + payload.detail), the FLOW-BOX (already in panel, pre-filled from state), `<button data-testid="record-outcome" class="btn primary" onclick="submitPendingOutcome('${key}')">Record outcome</button>`.
  5. If `_pend_` set: return loading div.
- New `window.submitPendingOutcome(key)`: reads payload from `f.data['_conf_' + key]`; sets `_pend_`; calls `render()`; fires `api.post('/api/outcomes', { siteNo, siteName, callerWords: f.data.freeText || null, additionalNotes: f.data.additionalNotes || null, ...payload })`. On success: calls `notesDraftClear()`, builds notes echo (`data-testid="addnotes-echo"`) if notes were sent, builds outcome card via `renderCard(res)`, appends `%%NOTESPOST%%` before `outButtons()`, stores `f.data._ticketId = res.ticket.id`, sets `f.stage = 99`, calls `render()`. On error: stores `_err_`, nulls `_pend_`, calls `render()`.
- `startFlow(k, freeText, opts)`: stores `_flowKey = k`; if NOT `opts.carryNotes`, calls `notesDraftRestore(siteNo, k)` and populates if found. Does NOT call `notesDraftClear`. Wire `opts.carryNotes` at the two shortcut callers (`flows.js:265`, `flows.js:381`).
- `cancelFlow`, `anotherIssue`, `endCall`: each calls `notesDraftClear()`.

`app.js`:

- `render()`: focus/caret save-and-restore for any textarea whose id starts with `addnotes`. Guard with try/catch.

Self-verify: navigate to confirm step, type a note, reload page, return to same site and flow — note pre-filled. Record outcome — sessionStorage entry absent.

### WU5 — Control paths (0.5 h)

File: `public/js/control.js`

- `ctlFinish` (line 353 area): add `additionalNotes: state.flow?.data?.additionalNotes || null` to the POST payload. On success: call `notesDraftClear()`; store `_ticketId`; append notes echo if notes were sent; insert `%%NOTESPOST%%`; set `notesPostBox` expanded default to `!notes`.
- `ctlEscalate` (line 390 area): same. On error branches (no ticket id): no post box shown.
- No change to submit timing.

Self-verify: run existing control.spec.js; all tests pass; post-submit notes link visible on outcome-applied card.

### WU6 — Ambiguous site and Tonight query (0.25 h)

File: `public/js/views.js`

- `renderAmbiguous()` (line 80 area): add `notesField({ id: 'addnotes-amb' })` above the Capture button.
- `ambiguousCapture()` (line 86 area): add `additionalNotes: notesValue('addnotes-amb')` to POST payload.
- Query modal render (line 390 area): add `notesField({ id: 'addnotes-q' })` below the Your query textarea.
- `sendQuery()` (line 396 area): add `additionalNotes: notesValue('addnotes-q')` to POST payload.
- `openSite`: does NOT call `notesDraftClear()` (clearing here would destroy a draft mid-reload).

Self-verify: Tonight query modal shows notes field above Send; ambiguous card shows notes field above Capture.

### WU7 — Unit tests (1.5 h)

Pre-build step: if `IOT_REPO_PATH` (default `../iot-support-dashboard`) is present, run `git -C $IOT_REPO_PATH rev-parse HEAD` and assert it equals `b217f34`. If the SHA differs, fail the build with a message naming the new SHA and directing the developer to update the vendored regexes in `test/iot-consumer-parse.test.js` and re-pin. This check runs before any test file is executed.

Run command: `npm run test:unit`

All existing 316 tests must stay green. New tests:

`test/zendesk.test.js` — extend existing file:

| ID | Asserts |
|----|---------|
| U1 | With N1, last non-footer line of buildTrgBody output is the TRG-STEP line including "Additional notes from OOH agent:" |
| U2 | null, '', whitespace-only, a number, and an object all give a body byte-identical to the no-notes call |
| U3 | N2 (multiline) produces " / " separator and is one line |
| U4 | N4 (1100 chars) gives exactly 1000 code units plus "…" |
| U4b | Surrogate-boundary: 999 "a" + "🔥" + "more" → result is 999 "a" + "…", no lone surrogate, survives UTF-8 round-trip. Control: 998 "a" + "🔥" keeps the emoji whole |
| U5 | N3 ("Caller's words: turn everything off") with callerWords null: neutralised text present; no line begins "Caller's words:" |
| U7 | P1 with N1: tags, priority, escalateP1 summary and dispatch note unchanged; notes only in [TRG] body |

`test/iot-consumer-parse.test.js` — new file, vendored regexes pinned to iot-support-dashboard b217f34:

| ID | Asserts |
|----|---------|
| U6 | parseTrgDescription and parseOohTrgComment applied to bodies with and without notes (N1, N3, N7, plus adversarial N-adv1 = "Operator: injected", N-adv2 = "Outcome: escalate-p1", N-adv3 = "12:34 | fake step"): operator, outcome, callerWords and summary are byte-identical to a no-notes body for all inputs; detail steps equal the original steps plus exactly one notes step as the final entry (no injected extra step, no injected Operator:/Outcome: match) |
| U12 | classifyComment applied to the exact body addFeedbackNote writes with kind: additional-notes and N1: classify returns null (not 'OOH'); isRedactedComment returns false. Negative: same body prefixed [TRG] gives a parse result not containing N1 (proves the prefix must stay [OOH NOTE]) |
| U13 | Drift check: when IOT_REPO_PATH exists, assert vendored regex sources and comment-classification prefixes appear verbatim in the real source files. Skipped with a visible notice when absent (CI). Failure message names the new SHA and directs re-pinning |

Accepted risk record: the IoT parser pin to b217f34 is documented here as an accepted risk, owner James Brown (OOH owner). If iot-support-dashboard is updated after this release, U6, U12 and U13 must be re-evaluated. The IoT team handoff note (design section 12) asks them to notify the OOH owner before changing parseOohTrgComment or classifyComment.

`test/additional-notes-routes.test.js` — new file:

| ID | Asserts |
|----|---------|
| U8 | POST /api/query with additionalNotes: N1 writes TRG-STEP line in the first comment; audit detail unchanged |
| U9 | POST /api/tickets/:id/notes with kind: additional-notes and N1 writes the labelled OOH-NOTE and caps at 1000; without kind the existing body is written unchanged |
| U10 | GET /api/me response contains notes.maxChars equal to config.notes.maxChars (1000) |

`test/notes-coverage-guard.test.js` — new file:

| ID | Asserts |
|----|---------|
| U11 | Reads `public/js/flows.js`, `public/js/views.js`, `public/js/control.js` as text. For each match of the regex `/api\.(post)\s*\(\s*['"`][^'"`]*\/(outcomes|query)/g` (handles any quote style and whitespace), extracts the surrounding call context (up to 500 characters following the opening parenthesis) and asserts the string `additionalNotes` appears within it. Asserts the total number of matched calls is exactly 5 (submitPendingOutcome in flows.js, ambiguous in views.js, query in views.js, ctlFinish in control.js, ctlEscalate in control.js). A count mismatch or a missing additionalNotes fails the build. Runtime confirmation is also provided by E1-E9 (see WU8) where each intercepted POST body is asserted to contain the additionalNotes key |

### WU8 — E2e tests (1.75 h)

Run command: `npx playwright test`

New file `tests/additional-notes.spec.js`:

| ID | Journey | Pass when |
|----|---------|-----------|
| E1 | Other flow, type N1 (include N6 in the same run to verify XSS), click Record outcome | Echo visible (data-testid addnotes-echo); thread first comment contains TRG-STEP; N6 appears verbatim (escaped) in echo — no alert fires; intercepted POST body contains additionalNotes key |
| E2 | Kitchen crit P1 with N1, click Record outcome | Echo visible with morning-review wording; outcome-p1 card unchanged; POST body contains additionalNotes |
| E3 | Fridge query, type N2 (multiline), Record outcome | Thread line contains " / " separator |
| E4 | Heating offnoact, no notes, Record outcome | No "Additional notes" text in ticket; no echo; post link shown; POST body contains additionalNotes: null |
| E5 | Any capture, Record outcome, then click post link, type N1, Save note | Saved state; thread has OOH-NOTE; re-render keeps saved state; save button absent (no duplicate) |
| E6 | Ambiguous site with N1, click Capture | Ticket contains TRG-STEP; POST body contains additionalNotes |
| E7 | Tonight query with N1, click Send | Ticket contains TRG-STEP; existing query assertions still pass; POST body contains additionalNotes |
| E8 | Control applied (ctlFinish), pre-type N1, device confirms | TRG-STEP and OOH-NOTE both in thread; POST body contains additionalNotes |
| E9 | Control timeout (ctlEscalate), no pre-typed notes | Post box expanded; save writes OOH-NOTE; POST body contains additionalNotes: null |
| E10 | Paste N4 (1100 chars) into notes box | Field value length stops at 1000; counter shows "1000 / 1000, limit reached" |
| E11 | Type N1, trigger page re-render (async polling response), continue typing | Text continuous; no characters lost; focus retained |
| E12 | Heating flow, type N1, take aircon shortcut | Notes carried into aircon confirm step; ticket carries note |
| E13 | Phone viewport 390 x 844, E1 journey | Box visible; no horizontal scroll; textarea computed font-size >= 16px |
| E14 | Double-fire: click Record outcome twice rapidly | Exactly one ticket created (existing _pend_ guard) |
| E15 | Type N1, Record outcome (capture), then Add another issue, reach any outcome, Record outcome | Second flow's notes box empty; second ticket body has no notes line; sessionStorage cleared after Add another issue |
| E16 | Carry rule: type N1, take aircon shortcut — notes carried; after outcome, start new flow — notes gone | Two tickets: first has note, second does not |
| E17 | Kitchen P1 with notes | Helper text includes "Not sent in urgent P1 texts"; echo shows morning-review wording |
| E18 | Draft restored after reload: type N1 in Other flow on site 6832, reload page, navigate back to site 6832, start Other flow | Notes box pre-filled with N1; sessionStorage entry matches siteNo+flowKey; proceed to Record outcome — ticket carries note |
| E19 | Draft cleared after record: type N1, click Record outcome | `page.evaluate(() => sessionStorage.getItem('ooh_note_draft'))` returns null after the outcome card renders |
| E20 | No carry-over via sessionStorage: type N1, record a capture — draft cleared (verified as in E19) — start any new flow | Notes box is empty; second ticket body has no notes line |

Updated existing files:

| File | Change |
|------|--------|
| tests/area-model.spec.js | Lines 94-106 and 123-131: replace Promise.all([waitForRequest, chipClick]) with: click chip, await confirm-step visible, click [data-testid="record-outcome"], then assert outcome and request |
| tests/outside-lighting-p1.spec.js | Lines 30-33 and 85-88: same restructure; click chip, click Record outcome, then assert P1 outcome card |
| tests/killswitch.spec.js | Line 48: add click [data-testid="record-outcome"] after clicking [data-testid="other-capture"], before expecting outcome-captured |
| tests/tonight-callback.spec.js | Line 11: add click [data-testid="record-outcome"] after clicking the chip, before expecting outcome-captured |
| tests/control.spec.js | No submit-flow changes needed (control paths unchanged). Verify existing toContainText assertions still match. Add checks for the post-notes link on outcome-applied and outcome-escalated cards (E8, E9) |

Remaining 5 spec files (resolution.spec.js, auth.spec.js, boilercontrol.spec.js, removal-health.spec.js, area-model.spec.js tests not on chip→outcome paths): audited, no Record outcome button needed. Ambiguous path in resolution.spec.js uses the existing Capture button (no confirm step under E2); confirmed unaffected.

### WU9 — Cache busters (0.1 h)

File: `public/index.html`

Bump all five `?v=1.0.2` occurrences (styles.css, api.js, flows.js, control.js, views.js, app.js) and the new notes.js marker to `?v=1.3.7`. If the release script bumps to a different patch, update to match before the release commit.

Self-verify: hard-refresh in browser; Network tab shows all assets at 200 (not 304) with the new version string.

---

## 6. Full test plan

### Pre-build step

If `IOT_REPO_PATH` is set and the path exists, assert `git -C $IOT_REPO_PATH rev-parse HEAD` equals `b217f34`. Failure message: "iot-support-dashboard has moved to {sha} — update vendored regexes in test/iot-consumer-parse.test.js and re-pin before proceeding."

### Run sequence

1. Pre-build IoT pin check (above).
2. `npm run test:unit` — all unit tests (316 existing + new U1-U13). Must be 100% green.
3. `npx playwright test tests/additional-notes.spec.js` — new e2e suite.
4. `npx playwright test` — full suite including updated existing specs. All must be green.

No live Zendesk tickets raised during unit or Playwright runs. Tests use the fixture server and mock responses.

### Test data

| Id | Value | Purpose |
|----|-------|---------|
| N1 | Duty manager says the cellar cooler alarm has also been going since 6pm | Happy path |
| N2 | Engineer booked for 7am (newline) Side door left unlocked | Line-break rule |
| N3 | Caller's words: turn everything off | Consumer regex neutraliser |
| N4 | "Fryer 2 tripped again and was reset at 21:40 by the chef. " repeated to 1100 chars | Cap and truncation marker |
| N5 | Three spaces, newline, two spaces | Whitespace-only = blank |
| N6 | `<script>alert(1)</script> & "quotes" </textarea>` | XSS sink test at all render points |
| N7 | Fryer 2 tripped 🔥 reset at 21:40 | Unicode and embedded time |
| N-adv1 | Operator: Bob Bloggs | Forged Operator field neutraliser |
| N-adv2 | Outcome: escalate-p1 | Forged Outcome field neutraliser |
| N-adv3 | 12:34 | fake timed step | Forged HH:MM pipe neutraliser |

---

## 7. Live proof plan — HARD pre-release gate

Live proof is a hard gate before the release is considered complete (not an afterthought). It runs against the deployed image on https://ooh.airedale-group.io after release. The test site is confirmed by the operator pre-release (see DECISION 3 in contract block).

| ID | Platform | Steps | Pass when |
|----|----------|-------|-----------|
| L1-HARD | Desktop | Agreed test site, Other flow, capture with N1 plus N2 multiline | Zendesk ticket shows TRG-STEP as last transcript line; IoT dashboard ticket detail shows it as the last numbered step; queue row shows same operator, outcome and summary as a no-notes ticket |
| L2 | Phone (390 px) | Tonight, Raise a query with N1 | Ticket carries notes; layout matches E13; no horizontal scroll |
| L3 | Desktop | On the L1 ticket, use the post link to save a late note | OOH-NOTE visible in Zendesk and the IoT detail view |
| L4 | Desktop | Blank-notes capture | Ticket body has no notes line |

Live P1 and live device-control proofs are deliberately not run. Covered by U7, E2, E8, E9 in fixture mode; first real occurrence checked in morning review.

Test tickets are solved with a "test, OOHDASH-119 live proof" internal note.

Sam Day copy sign-off on the screen copy in design section 6 is a gate before release.

---

## 8. Security, compliance and transition

### Security

| Sink | Input source | Mitigation |
|------|-------------|------------|
| notesField textarea value attribute | sessionStorage restore or state | `esc(value)` escapes `<`, `>`, `"`, `&` before injection into HTML attribute; `</textarea>` breakout requires an unescaped `>` which esc() prevents. Tested by N6 in E1 |
| addnotes-echo inner HTML | state.flow.data.additionalNotes | `esc()` applied at render time; existing callerWords echo uses the same pattern |
| OOH-NOTE comment body in Zendesk | normalised note string | Server normalises; IoT renders via sanitizeHtml(htmlBody) (`app.js:11023`, iot-support-dashboard b217f34) and renderCommentBody(`app.js:11024`); both escape HTML |
| notesField textarea .value (DOM property) | sessionStorage restore | Setting `.value` on a DOM element is safe regardless of content — no HTML parsing occurs |
| TRG-STEP line in Zendesk ticket body | normalised note string | Field-marker and HH:MM-pipe neutralisers applied before writing; IoT step regex matches outer timestamp, not the quoted note content |

IDOR residual: `POST /api/tickets/:id/notes` allows an authenticated agent to add a note to any ticket ID they know. This is pre-existing behaviour shared by the ticket-drawer notes endpoint and is out of scope for this feature. Recorded here as a known accepted residual.

### Compliance

Notes content is retained solely in Zendesk under its existing retention policy; no additional retention surface is introduced. Excluding the note text from the audit log is a conscious, intentional decision: the audit records `actionType: 'note'` with `detail: 'Note added to ticket #N'`, matching the pre-existing drawer-notes pattern. Note text may inadvertently include operational detail but is never public-facing (internal comment, not public ticket).

### Transition: failure runbook

If notes are missing from tickets after release:

1. Hard-refresh the agent's browser and confirm the notes box appears (cache issue — verify ?v= markers were bumped; check DevTools Network for notes.js returning 200 with the new version string).
2. Open DevTools Network, record a test outcome, inspect the POST /api/outcomes request body — confirm additionalNotes key is present (null or string value). If absent, the coverage guard (U11) has a gap; raise immediately.
3. Check the Zendesk ticket body for the TRG-STEP line. If POST body contains additionalNotes but the ticket body does not, the server normaliser returned null (e.g., whitespace-only input) or buildTrgBody was not updated — check server logs for errors.
4. Check the IoT dashboard ticket detail view renders the final step. If Zendesk shows the TRG-STEP but the IoT view does not, the iot-support-dashboard step regex has changed — run U13 locally and check for drift from b217f34.

Rollback command (concrete, from DEPLOY_RUNBOOK.md in this repo):

kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:080ccab

Tickets already carrying notes remain valid plain text after rollback; no data migration required.

---

## 9. Estimates and branch

| Work unit | Files | Estimate |
|-----------|-------|----------|
| WU1 Server config and normaliser | config.js, services/zendesk.js | 0.5 h |
| WU2 Server routes | routes/api.js | 0.25 h |
| WU3 Client notes component + sessionStorage helpers | public/js/notes.js (new), public/index.html | 0.75 h |
| WU4 Guided flows confirm step + draft restore/clear | public/js/flows.js, public/js/app.js | 1.0 h |
| WU5 Control paths | public/js/control.js | 0.5 h |
| WU6 Ambiguous and Tonight | public/js/views.js | 0.25 h |
| WU7 Unit tests (incl. adversarial U6/U12, IoT pin pre-check) | 4 test files (3 new, 1 extended) | 1.5 h |
| WU8 E2e tests (E1-E20 incl. XSS, sessionStorage, runtime guard) | tests/additional-notes.spec.js (new), 4 updated specs | 1.75 h |
| WU9 Cache busters | public/index.html | 0.1 h |
| **Total** | | **6.6 h** |

Build branch: `build/oohdash-119-additional-notes` (from main, separate from this build-plan branch).

Rollback ref: v1.3.6, image `080ccab` (see section 8 for the exact kubectl command).

---

## 10. Residual open questions (DECISIONs)

All three DECISIONs are in the gate:contract block at the top of this document.

- DECISION 1 (FLOW-BOX continuity): recommend one continuous box. The sessionStorage restore writes into `state.flow.data.additionalNotes` which the FLOW-BOX reads on re-render; a fresh-on-confirm-step box would lose any note typed during earlier steps.
- DECISION 2 (confirm step preview): recommend showing the outcome description so the agent can verify they clicked the right chip before the ticket is created.
- DECISION 3 (live-proof test site): operator confirms pre-release. The fixture site 6832 (Old Grey Mare) is the preferred candidate; confirm it exists in the live Lighthouse dataset.

The data-testid on the Record outcome button is not a decision — `data-testid="record-outcome"` will be added as a matter of practice; no operator choice is needed.

No other genuine open questions remain.
