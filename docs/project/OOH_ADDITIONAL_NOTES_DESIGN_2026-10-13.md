<!-- gate:contract
SECTION: What this delivers
Every place in the OOH Dashboard where an agent creates a ticket gets the same small, optional Additional notes box. Whatever the agent types is saved onto the Zendesk ticket under the heading "Additional notes from OOH agent:", so the extra context stops travelling by WhatsApp or Teams. Leaving the box empty changes nothing: the ticket is exactly what it is today. The limit is 1000 characters (operator decision, now confirmed), held in one setting so it can be changed in one place. Nothing runs in the background, no AI is used, and there is no idle cost: the notes simply ride along on the ticket call the dashboard already makes.

SECTION: Where the box appears
All 27 submit points from discovery are covered, plus two more the code inspection found (a second heating no-action outcome and a contractor fallback outcome), which come for free because they share the same code. For the 25 guided-flow outcomes the box sits at the bottom of the guided flow from the first step, because the dashboard records the outcome the moment the agent clicks the final choice; there is no pause before recording to put a box in. Whatever is in the box at that moment goes onto the ticket when it is created. After the outcome, a small "Add a note to ticket" link lets the agent add anything they remember late. The ambiguous-site card and the Tonight "Raise a query" window each get the same box above their send button. The two device-control outcomes carry anything typed before the change, and also show an "Add a note" box on the result card, as the operator decided.

SECTION: What the IoT team will see
In Zendesk the notes are on the ticket from the moment it is created. The design found one thing discovery got wrong: the IoT Support Dashboard ticket view does not show the raw ticket text. It rebuilds an OOH ticket from four recognised pieces (operator, caller's words, the timed steps, outcome) and silently drops anything else. A plain notes line would therefore be invisible there. The fix needs no change to the IoT dashboard: the notes are written as the final timed step, for example a step timed 21:42 reading "Additional notes from OOH agent: ...", so they show as the last line of the action list the IoT team already reads. The morning queue row is unchanged, as agreed. P1 texts to the on-duty manager are unchanged: they never read the ticket text.

SECTION: How it will be proven
Unit tests check the ticket text with and without notes, the 1000-character limit, line breaks, and that the IoT dashboard's own recognition rules still read the operator, outcome and caller's words exactly as before. A guard test fails the build if any ticket-creating call in the code forgets to send the notes, which is what keeps coverage at every submit point. Browser tests walk one of each outcome kind, the ambiguous site, the Tonight query and both control results, on desktop and phone size. The live proof is a real ticket on ooh.airedale-group.io, checked in Zendesk and in the IoT dashboard ticket view, on desktop and on a phone. We will not raise a live P1 or send a live device change just to prove this; those two are proven in the test environment.

SECTION: Risks, cost and rollback
Cost is effectively nil: no new service, no polling, no AI tokens, and one extra Zendesk call only when an agent chooses to add a late note. The main risks are agents typing personal details (the helper text warns against it), and notes typed before the final click being the only ones sent at creation (the "Add a note" link covers late thoughts). The browser cache markers on the dashboard's script files must be bumped in the release, or agents could keep running the old screens. Rollback is the standard one: put the live image back to v1.3.6 (image 080ccab). Tickets already carrying notes stay readable after a rollback because the notes are ordinary ticket text.

DECISION: How should the notes appear in the IoT dashboard ticket view? | As the last timed step of the action list, visible with no IoT change | As a separate line after the steps, visible in Zendesk only
DETAIL: Recommend the timed-step format. It is the only way to meet "visible in the IoT ticket detail view" without touching the frozen IoT dashboard.

DECISION: Guided flows record the outcome the instant the final choice is clicked. Where should the box go? | Visible throughout the flow, plus an Add a note link after the outcome | Add a Record outcome button to every one of the 25 outcomes so notes are typed at the end
DETAIL: Recommend the always-visible box. The alternative adds a click to every call and risks outcomes never being recorded if the agent hangs up before pressing the button.

DECISION: What happens to line breaks the agent types? | Turn each line break into a slash so it stays one line | Collapse line breaks into spaces, exactly as caller's words are handled today
DETAIL: Recommend the slash. Notes must stay on one line to show in the IoT view, and the slash keeps separate points readable. Safety escaping stays where it is today, at display time.

DECISION: If more than 1000 characters reach the server, what should it do? | Keep the first 1000 characters, mark it as cut, and still create the ticket | Refuse the whole submit with an error
DETAIL: Recommend keep-and-mark. The screen already stops typing at 1000, and a ticket must never fail to be created because of an optional note.
-->

# OOHDASH-119 Additional Notes before ticket submit: Design

**Date:** 2026-10-13
**Ticket:** OOHDASH-119
**Repo / branch:** bigtuff8/ooh-triage-dashboard, `design/oohdash-119-additional-notes` (from main `2d9718c`, live v1.3.6)
**Input:** signed-off discovery `docs/project/OOH_ADDITIONAL_NOTES_DISCOVERY_2026-10-13.md`, operator decisions D1 to D7 from gate PR #79
**Scope:** stop-gap, same-day release. Lean by design.

---

## 1. Binding decisions and how this design honours them

| ID | Decision | How the design meets it |
|---|---|---|
| D1 | Optional; blank changes nothing | Server normaliser returns null for blank, whitespace-only or non-string input; `buildTrgBody` then emits a byte-identical body (unit test U2) |
| D2 | Standard flows send notes in the creation call, after the transcript | `additionalNotes` added to `POST /api/outcomes` and `POST /api/query`; one append in `buildTrgBody` after the transcript loop, before the data-quality footer |
| D3 | Body-only, no IoT repo change, visible in IoT detail view | Achieved only by writing notes as a transcript-format step line (section 4, DECISION 1); parser regression test U6 |
| D4 | Control paths: post-submit box via `POST /api/tickets/:id/notes` | Post-submit box on both control outcome cards; endpoint behaviour confirmed in section 5.4 |
| D5 | 1000 characters, one shared constant | **Decided: 1000.** `config.notes.maxChars` on the server, delivered to the client through `/api/me`; no literal 1000 anywhere in client code |
| D6 | Label "Additional notes from OOH agent:" | Used verbatim in the [TRG] line and in the post-submit [OOH NOTE] comment |
| D7 | Sanitise like callerWords | Same `oneLine` collapse, line breaks become " / " first (DECISION 3); escaping stays at render time, see 5.5 |

---

## 2. Findings from code inspection that change the discovery picture

**F1. The IoT ticket detail view does not render the raw [TRG] body.** In iot-support-dashboard (`b217f34`), `public/js/app.js` classifies a `[TRG]` comment as OOH and then renders `renderOohTranscript(parseOohTrgComment(body))` instead of the body. `parseOohTrgComment` (line 713) keeps only: the first `Operator:` match, the first `Caller's words:` match, the first `Outcome:` match, and every line matching `^\s*(\d{1,2}:\d{2})\s*[|–—-]\s*(.+?)\s*$`. Any other line is dropped. A plain `Additional notes from OOH agent: "..."` line would be invisible in the IoT detail view. Discovery section 4 stated the opposite. Resolution: write the notes as a step line (section 4).

**F2. Guided flows have no pre-submit pause.** `finishOutcome` (`public/js/flows.js:196`) fires `api.post('/api/outcomes')` the first time the outcome step renders, which happens as a direct result of the agent clicking the last chip. There is no "about to submit" screen. Resolution: the notes box lives in the flow panel from the first step (DECISION 2), and an "Add a note" link follows the outcome.

**F3. There are 25 guided outcome call sites, not 23.** Discovery missed `outcomeNoAction(f, 'noact')` at `flows.js:432` (pub heating query, no action possible) and the fallback `outcomeP1(f, 'p1')` at `flows.js:879` (contractor, normally unreachable). Both route through `finishOutcome`, so the shared injection covers them with no extra work. They appear as rows 1a and 18a in the coverage table.

**F4. The server-side late-sync ticket** (`services/zendesk.js:375`) is created automatically by the server with no agent at a screen. It is not a submit end point and is out of scope.

**F5. Static assets carry a hard-coded cache marker** (`public/index.html` lines 15 to 19, `?v=1.0.2`). The release must bump these, otherwise agents' browsers may run the old `flows.js` with no notes box (risk R4).

---

## 3. Coverage: every submit end point

Shared injection points referenced below:

- **FLOW-BOX**: `notesField()` rendered by `renderFlow()` (`flows.js:164`) between `.flowbody` and `.flowfoot` while `f.stage !== 99`; bound to `state.flow.data.additionalNotes`.
- **FO-PAYLOAD**: `finishOutcome()` adds `additionalNotes: f.data.additionalNotes || null` to its `POST /api/outcomes` body (next to the existing `callerWords`).
- **POST-LINK**: `notesPostBox(ticketId)` rendered in place of a `%%NOTESPOST%%` marker in the cached outcome HTML (collapsed link for guided flows).
- **TRG-STEP**: server appends `HH:MM | Additional notes from OOH agent: "<notes>"` as the final transcript line of the [TRG] first comment.
- **OOH-NOTE**: server writes a second internal comment `[OOH NOTE] Additional notes from OOH agent: "<notes>"` plus the existing Operator footer.

| # | End point | Code | Pre-submit injection | Transport | Lands in |
|---|---|---|---|---|---|
| 1 | Heating: boiler panel not remotely controllable | `flows.js:424` outcomeCaptured `bp` | FLOW-BOX | FO-PAYLOAD to `POST /api/outcomes` | TRG-STEP, plus POST-LINK to OOH-NOTE |
| 1a | Heating: pub heating query, no action possible (found in design) | `flows.js:432` outcomeNoAction `noact` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 2 | Heating: frost-hold offered and declined | `flows.js:467` outcomeNoAction `offnoact` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 3 | Heating: meeting setpoint, building-heat guidance | `flows.js:476` outcomeScope `bh` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 4 | Aircon: referred to IoT team | `flows.js:492` outcomeCaptured `aircon` | FLOW-BOX (carried across the aircon shortcut, see 5.1) | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 5 | Hot water: boost unavailable or declined | `flows.js:523` outcomeCaptured `cap` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 6 | Hot water: likely boiler fault | `flows.js:531` outcomeScope `sc` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 7 | Kitchen: off during service (P1) | `flows.js:560` outcomeP1 `crit` | FLOW-BOX | FO-PAYLOAD | TRG-STEP only in body; not in P1 summary or SMS |
| 8 | Kitchen: needed later | `flows.js:569` outcomeCaptured `ncrit` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 9 | Lighting: resolved with override | `flows.js:596` outcomeCaptured `ok` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 10 | Lighting: override failed (P1) | `flows.js:604` outcomeP1 `cap` | FLOW-BOX | FO-PAYLOAD | TRG-STEP body only |
| 11 | Fan: request captured | `flows.js:631` outcomeCaptured `cap` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 12 | Fridge: stock at risk (P1) | `flows.js:651` outcomeP1 `risk` | FLOW-BOX | FO-PAYLOAD | TRG-STEP body only |
| 13 | Fridge: query only | `flows.js:658` outcomeScope `q` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 14 | Connectivity: restored on the call | `flows.js:742` outcomeCaptured `back` | FLOW-BOX (survives the heating-to-connectivity hand-off, same `f.data`) | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 15 | Connectivity: group gateway offline | `flows.js:754` outcomeCaptured `gcap` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 16 | Connectivity: direct site unreachable | `flows.js:763` outcomeCaptured `dcap` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 17 | Connectivity: still offline after checks | `flows.js:770` outcomeCaptured `cap` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 18 | Contractor: no PowerPause path (P1) | `flows.js:796` outcomeP1 `p1` | FLOW-BOX | FO-PAYLOAD | TRG-STEP body only |
| 18a | Contractor: fallback P1 (found in design) | `flows.js:879` outcomeP1 `p1` | FLOW-BOX | FO-PAYLOAD | TRG-STEP body only |
| 19 | Contractor: Donkey Derby exception (P1) | `flows.js:807` outcomeP1 `ppesc` | FLOW-BOX | FO-PAYLOAD | TRG-STEP body only |
| 20 | Contractor: override given (P1) | `flows.js:869` outcomeP1 `ppdone` | FLOW-BOX | FO-PAYLOAD | TRG-STEP body only |
| 21 | Other: general capture | `flows.js:898` outcomeCaptured `cap` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 22 | Other: monitored only | `flows.js:917` outcomeScope `mon` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 23 | Other: not on Lighthouse | `flows.js:923` outcomeScope `none` | FLOW-BOX | FO-PAYLOAD | TRG-STEP, plus POST-LINK |
| 24 | Ambiguous site capture | `views.js:86` `ambiguousCapture` | `notesField({id:'addnotes-amb'})` in the ambiguous card above the Capture button (`views.js:80`) | `additionalNotes` in its `POST /api/outcomes` body | TRG-STEP (no post-link: the screen returns home with a toast) |
| 25 | Tonight: Raise a query | `views.js:396` `sendQuery` | `notesField({id:'addnotes-q'})` in the query modal below "Your query" (`views.js:390`) | `additionalNotes` in `POST /api/query` body | TRG-STEP via `raiseQuery` to `createOutcomeTicket` |
| 26 | Control: device confirmed (`ctlFinish`) | `control.js:332` | FLOW-BOX value carried in its POST (control always starts inside a flow: every `openControl` caller is in `flows.js`) | `additionalNotes` in `POST /api/outcomes`; then post-submit box | TRG-STEP (if typed before) and/or OOH-NOTE via `POST /api/tickets/:id/notes` |
| 27 | Control: timeout or write failure (`ctlEscalate`) | `control.js:379` | As 26 | As 26 | As 26 |

**Count: 27 discovery end points covered, plus 2 additional call sites (1a, 18a): 29 of 29.** The structural guard test (U11) fails the build if any `api.post('/api/outcomes'` or `api.post('/api/query'` call in `public/js` lacks `additionalNotes`.

---

## 4. The ticket body (exact format)

Current frozen order is unchanged: summary, `Operator:`, optional `Caller's words:`, `Outcome:`, `Transcript:` with `HH:MM | text` steps, optional blank line plus data-quality footer.

The one new line is pushed after the last transcript step and before the data-quality footer:

`21:42 | Additional notes from OOH agent: "Duty manager says the cellar cooler alarm has also been going since 6pm / engineer booked for 7am"`

- The time is the same `defaultTime` (Europe/London HH:MM at ticket creation) the transcript already uses.
- When notes are null, nothing is pushed. When the transcript is empty, the line is still pushed (it matches the step regex on its own).
- Effect on the IoT consumer, checked against `b217f34`:

| Consumer rule | Where | Effect of the notes line |
|---|---|---|
| `Operator:\s*([^\n]+)` first match | queue `parseTrgDescription`, detail `parseOohTrgComment` | None: real Operator line always precedes |
| `Outcome:\s*([\w-]+)` / `([^\n]+)` first match | queue / detail | None: real Outcome line always precedes |
| `Caller'?s words:` first match, case-insensitive, not line-anchored | queue / detail | Risk only when callerWords is absent and notes contain that phrase. Neutralised by the normaliser (5.2) |
| Summary = first line | queue | None |
| Step regex per line | detail | Notes appear as the final numbered step. This is the intended visibility |
| P1 SMS (`buildOohWhatsAppAlert`) | IoT escalation | None: uses site, subject and ticket id only |
| Description truncation (about 1500 characters) | queue search | Notes sit after the transcript; queue does not show them either way (D3) |

---

## 5. Build specification

### 5.1 Client: one shared component, new file `public/js/notes.js`

Loaded by a new script tag placed before `flows.js` in `public/index.html`. Exposes:

- `notesField({ id = 'addnotes', bind = null, value = '' })` returns the HTML for: label, textarea (`id`, `data-testid` equal to id, `maxlength` equal to `state.me.notes.maxChars`, `rows=2`, `oninput="notesInput(this)"`, `data-bind` when bind is `'flow'`), helper line, and counter (`data-testid` `<id>-counter`).
- `notesInput(el)` updates the counter text and, when `data-bind="flow"`, writes `el.value` to `state.flow.data.additionalNotes`. No render call (no focus loss).
- `notesValue(id)` getter: trimmed value or null. Used by `ambiguousCapture` and `sendQuery`.
- `notesPostBox(ticketId, { expanded })` returns the post-submit block; state is read from `state.flow.data._postNotes` (`idle`, `open`, `saving`, `saved` with text, `error` with message) so a later `render()` never resets a saved note to an empty box (prevents duplicate saves).
- `saveNotesPost(ticketId)` posts `{ body, kind: 'additional-notes' }` to `/api/tickets/:id/notes`, sets state, calls `render()`.

Wiring:

- `renderFlow()`: append `notesField({ bind: 'flow', value: f.data.additionalNotes })` inside `.flowbody` after the step body when `f.stage !== 99`. At `stage === 99`, replace the `%%NOTESPOST%%` marker in `f.data._outcomeHtml` with `notesPostBox(f.data._ticketId, ...)`.
- `finishOutcome()`: add `additionalNotes` to the payload; on success store `f.data._ticketId = res.ticket.id`; add a notes echo (`data-testid="addnotes-echo"`) below the existing callerWords echo when notes were sent; insert `%%NOTESPOST%%` before `outButtons()`. The `_pend_` double-fire guard is untouched.
- `ctlFinish()` / `ctlEscalate()`: add `additionalNotes: state.flow?.data?.additionalNotes || null` beside the existing `callerWords`; on success set `_ticketId`, add the echo, insert the marker before `outButtons()`. Post box is expanded by default here when no notes were sent at creation (D4 primary capture), collapsed otherwise. On the error branches (no ticket id) no box is shown.
- `startFlow(k, freeText)`: carry `state.flow?.data?.additionalNotes` into the new flow so the aircon and "Something else" shortcuts do not lose typed notes. `anotherIssue()` and `cancelFlow()` still clear them (notes belong to one ticket).
- `render()` in `app.js`: if `document.activeElement` is a notes textarea, capture its id and selection before replacing `innerHTML` and restore focus and caret after. This protects typing against async re-renders.
- `renderAmbiguous()` and `raiseQuery()`: insert `notesField` above the action button; `ambiguousCapture()` and `sendQuery()` send `additionalNotes: notesValue(...)`.
- Bump every `?v=` marker in `index.html` to the release version.

### 5.2 Server

- `config.js`: `notes: { maxChars: 1000 }`. This is the single constant (D5).
- `routes/api.js` `/me`: add `notes: { maxChars: config.notes.maxChars }` (the established client-knob channel per the R11/C7 comment).
- `services/zendesk.js`, new exported `normaliseAdditionalNotes(raw)`:
  1. not a string: return null (never a 400; an optional field must not block a ticket);
  2. replace each run of line breaks with " / ", then `oneLine` (collapse whitespace, trim);
  3. replace `/caller'?s words\s*:/gi` with `caller's words -` (protects the consumer's unanchored regex);
  4. empty: return null;
  5. longer than `config.notes.maxChars`: keep the first maxChars characters plus "…" and `console.warn` with ticket context (DECISION 4).
- `buildTrgBody`: new `additionalNotes` argument; after the transcript loop and before the data-quality footer, `if (additionalNotes)` push the TRG-STEP line (section 4).
- `createOutcomeTicket`: accept `additionalNotes`, normalise once, pass to `buildBody`. Fixture and live branches both use it.
- `raiseQuery(operator, siteNo, text, additionalNotes)`: pass through.
- `POST /api/outcomes`: destructure `additionalNotes`, pass to `createOutcomeTicket` only. **Not** passed to `escalation.escalateP1` (summary stays `p1Summary || subject`), **not** written to the audit log, **not** in `addP1DispatchNote`.
- `POST /api/query`: pass `req.body.additionalNotes` to `raiseQuery`.
- `POST /api/tickets/:id/notes`: when `req.body.kind === 'additional-notes'`, normalise the body with the same function, return 400 "Note is empty" if null, and call `addFeedbackNote` with `Additional notes from OOH agent: "<notes>"`. Without `kind`, behaviour is byte-for-byte as today (ticket drawer notes are unaffected).

### 5.3 What each endpoint writes to Zendesk

| Endpoint | Zendesk write | Comment type |
|---|---|---|
| `POST /api/outcomes` | `POST /tickets.json`, one call (unchanged count) | [TRG] first internal comment with TRG-STEP line |
| `POST /api/query` | Same as above via `createOutcomeTicket` | [TRG] first internal comment |
| `POST /api/tickets/:id/notes` | `addInternalComment` (one PUT on the ticket) | Internal comment `[OOH NOTE] Additional notes from OOH agent: "..."` then blank line then `Operator: <name> (<email>)`. In the IoT detail view it is an unclassified internal comment rendered as plain text; in the OOH drawer the prefix shows as "OOH note:" |

### 5.4 Confirmed behaviour of the existing notes endpoint (D4)

`routes/api.js:379`: requires a non-blank `body`, trims it, calls `zendesk.addFeedbackNote(id, operator, body)`, which writes the internal (non-public) comment shown above, then writes an audit entry `actionType: 'note'`, `detail: Note added to ticket #<id>` (the note text itself is not audited). It has no length cap today; the cap applies only to the new `kind` (no regression to drawer notes).

### 5.5 Sanitisation position (D7)

The callerWords pattern in practice is: `oneLine` on the server, and HTML escaping at display time (`esc()` in the OOH dashboard, `escapeHtml()` in the IoT transcript renderer at `app.js:744`). There is no server-side HTML escape, and adding one would show `&amp;` literally in Zendesk. Notes follow the same pattern exactly. The only additions are the " / " line-break rule and the caller's-words neutraliser, both explained above.

---

## 6. Screen copy (for Sam Day sign-off) and states

| Element | Copy |
|---|---|
| Label | Additional notes for the IoT team (optional) |
| Placeholder | Anything the caller or site told you that isn't captured above, e.g. engineer due at 7am |
| Helper text | Goes on the ticket with this outcome. Keep it factual and operational, no personal details. |
| Counter | `0 / 1000`; amber from 900; at the limit `1000 / 1000, limit reached` and typing stops |
| Echo after creation | 📝 Your notes are on ticket #N: "…" |
| Post-submit link (collapsed) | + Add a note to ticket #N |
| Post-submit box label | Add a note to ticket #N (optional) |
| Save button | Save note |
| Saving | Saving… (button disabled) |
| Saved | ✓ Note saved to ticket #N (box becomes read-only echo) |
| Save error | Couldn't save the note: <reason>. Try again, or add it later from Tonight → ticket. (Try again button) |

State coverage for the box: **empty** (placeholder, counter 0), **typing** (counter live), **limit** (amber then capped), **submitting** (existing "Recording the outcome…"; box hidden as stage moves), **success** (echo), **error** (existing outcome error with Try again; box remains visible and editable with its value so the retry re-sends it).

Mobile (390 px wide): textarea is full width; `font-size: 16px` on the notes textarea to stop iOS zooming on focus; it grows from 2 to 5 rows (`field-sizing: content` with a `max-height`, falling back to a fixed 3 rows); the counter sits right-aligned under the box; no horizontal scroll. In the flow panel the box sits below the step choices, so the primary choice buttons stay above it and are not pushed down by an empty box.

Design intent: the box is quiet (secondary border, small label) so routine calls ignore it at zero cost, which is the friction-moment calibration from discovery; the echo after creation is the reassurance moment ("it is on ticket #N").

---

## 7. Data dictionary

| Name | Where | Type and rule | Sensitivity and retention |
|---|---|---|---|
| `additionalNotes` | Request field on `POST /api/outcomes` and `POST /api/query` | string or null; normalised server-side; max `config.notes.maxChars` | May inadvertently contain personal data; stored only in Zendesk (ticket retention); not in audit log, SMS or browser storage |
| `kind` | Request field on `POST /api/tickets/:id/notes` | literal `additional-notes` or absent | n/a |
| `config.notes.maxChars` | Server config, exposed as `/api/me` `notes.maxChars` | integer, 1000 | n/a |
| `state.flow.data.additionalNotes` | Client in-memory flow state | string; cleared with the flow | Memory only, lost on reload |
| `state.flow.data._ticketId` | Client in-memory | ticket id of the recorded outcome | Memory only |
| `state.flow.data._postNotes` | Client in-memory | post-submit state object | Memory only |
| TRG-STEP line | [TRG] first comment | time (HH:MM), a vertical bar, then `Additional notes from OOH agent: "<notes>"` | Internal comment (public: false) |
| OOH-NOTE comment | Second internal comment | `[OOH NOTE] Additional notes from OOH agent: "<notes>"` plus Operator footer | Internal comment |
| Test ids | DOM | `addnotes`, `addnotes-counter`, `addnotes-echo`, `addnotes-amb`, `addnotes-q`, `addnotes-post-open`, `addnotes-post-input`, `addnotes-post-save`, `addnotes-post-saved`, `addnotes-post-error` | n/a |

---

## 8. Test plan

### 8.1 Test data

| Id | Notes value | Purpose |
|---|---|---|
| N1 | Duty manager says the cellar cooler alarm has also been going since 6pm | Plain happy path |
| N2 | Engineer booked for 7am (line break) Side door left unlocked for access | Line-break rule, expect " / " |
| N3 | Caller's words: turn everything off | Consumer regex neutraliser |
| N4 | The sentence "Fryer 2 tripped again and was reset at 21:40 by the chef. " repeated to 1,100 characters | Cap and truncation marker |
| N5 | Three spaces, a line break, two spaces | Whitespace-only equals blank |
| N6 | `<script>alert(1)</script> & "quotes"` | Stored verbatim, displayed escaped in both dashboards |
| N7 | Fryer 2 tripped 🔥 reset at 21:40 | Unicode and an embedded time |

Fixture sites as already used by `tests/helpers.js`; the ambiguous house ID fixture as used by the existing ambiguous tests.

### 8.2 Unit tests (`npm run test:unit`)

| Id | File | Asserts |
|---|---|---|
| U1 | `test/zendesk.test.js` | With N1, last line before the footer is the TRG-STEP line; with a data-quality note, notes precede the blank line and footer |
| U2 | `test/zendesk.test.js` | null, '', N5, a number and an object all give a body identical to the no-argument call |
| U3 | `test/zendesk.test.js` | N2 produces " / " and a single line |
| U4 | `test/zendesk.test.js` | N4 gives exactly 1000 characters plus "…" |
| U5 | `test/zendesk.test.js` | N3 with callerWords null: neutralised text present, no line containing `Caller's words:` from the notes |
| U6 | new `test/iot-consumer-parse.test.js` | Vendored copies of `parseTrgDescription` and `parseOohTrgComment` regexes (pinned to iot-support-dashboard `b217f34`): for bodies with and without notes (and with N3, N7), operator, outcome, callerWords and summary are identical; detail steps equal the old steps plus exactly one notes step |
| U7 | `test/p1-dispatch-honesty.test.js` | P1 with notes: tags, priority, `escalateP1` summary and dispatch note unchanged; notes only in the [TRG] body |
| U8 | new `test/additional-notes-routes.test.js` | `/api/query` with notes writes TRG-STEP; audit detail unchanged |
| U9 | same | `/api/tickets/:id/notes` with `kind` writes the labelled OOH-NOTE and caps; without `kind` the existing body is written unchanged |
| U10 | same | `/api/me` returns `notes.maxChars` equal to `config.notes.maxChars` |
| U11 | new `test/notes-coverage-guard.test.js` | Scans `public/js/*.js`: every `api.post('/api/outcomes'` and `api.post('/api/query'` call object contains `additionalNotes`; expected count of such calls is 5 (flows, ambiguous, query, ctlFinish, ctlEscalate) so a new unguarded call fails the build |

### 8.3 Browser tests (`npx playwright test`, new `tests/additional-notes.spec.js`, extend `tests/tonight-callback.spec.js` and `tests/control.spec.js`)

| Id | Journey | Asserts |
|---|---|---|
| E1 | Capture family: Other flow, type N1, reach outcome | Echo shows; `/api/tickets/:id/thread` first comment contains TRG-STEP |
| E2 | P1 family: Kitchen crit with N1 | As E1; `outcome-p1` card unchanged |
| E3 | Scope family: Fridge query with N2 | " / " in ticket line |
| E4 | No-action family: Heating offnoact with notes blank | No "Additional notes" text in the ticket; no echo; post link shown |
| E5 | Late note: any capture, then post link, save N1 | Saved state; thread has OOH-NOTE; re-render keeps saved state; save button gone (no duplicate) |
| E6 | Ambiguous site with N1 | Ticket carries TRG-STEP |
| E7 | Tonight query with N1 | Ticket carries TRG-STEP; existing query tests still pass |
| E8 | Control applied (`ctlFinish`) with pre-typed N1, then post-submit note | TRG-STEP and OOH-NOTE both present |
| E9 | Control timeout (`ctlEscalate`), no pre-typed notes | Post box expanded; save writes OOH-NOTE |
| E10 | Limit: paste N4 | Field value length 1000; counter shows limit |
| E11 | Focus: type, trigger `render()` from the page, keep typing | Text continuous, focus retained |
| E12 | Aircon shortcut from Heating after typing N1 | Notes carried into the aircon outcome |
| E13 | Phone viewport 390 x 844, E1 journey | Box visible, no horizontal scroll, textarea computed font-size at least 16px |
| E14 | Double-fire | Exactly one ticket per outcome with notes |

All existing unit and Playwright suites must stay green (`zendesk`, `outcome-callerwords`, `p1-dispatch-honesty`, `tonight-callback`, `control`).

### 8.4 Live proof on https://ooh.airedale-group.io (after release)

| Id | Where | Steps | Pass when |
|---|---|---|---|
| L1 | Desktop | Agreed test site, Other flow, capture with N1 plus N2 line break | Zendesk ticket shows TRG-STEP as last transcript line; IoT dashboard ticket detail shows it as the last numbered step; IoT queue row shows the same operator, outcome and summary as a no-notes ticket |
| L2 | Phone | Tonight, Raise a query with N1 | Ticket carries notes; layout as E13 |
| L3 | Desktop | On the L1 ticket, use the post link to save a late note | OOH-NOTE visible in Zendesk and the IoT detail view |
| L4 | Desktop | Blank-notes capture | Ticket body has no notes line |

Live P1 and live device-control proofs are deliberately not run (they page the on-duty manager or change real equipment); they are covered by U7, E2, E8, E9 in fixture mode, and the first real occurrence is checked in the morning review. Test tickets are solved with a "test, OOHDASH-119 live proof" note.

---

## 9. CX criteria from discovery and where they are met

| Discovery criterion | Delivered by |
|---|---|
| Persona on a live call, must not be slowed | Box is optional, quiet, already on screen; zero extra clicks (DECISION 2) |
| Friction moment: routine outcomes | Blank box has no effect and no prompt; no confirmation step |
| Reassurance moment: "it went on the ticket" | Echo "Your notes are on ticket #N" and the saved state on post-submit |
| Great looks like: one sentence typed, on the ticket with the transcript, IoT sees it next morning | TRG-STEP in Zendesk and as the final step in the IoT detail view (F1 fix) |
| Unhappy path | Outcome error keeps notes for retry; post-save error with retry and fallback route |

---

## 10. Cost, silent running and build effort

| Criterion | Assessment |
|---|---|
| Token cost | Zero. No LLM involvement anywhere in the feature |
| Recurring £ cost | None. Notes ride the existing ticket call; one extra Zendesk API call only when a late note is saved (well inside existing rate limits) |
| Background or polling component | None. Nothing runs while idle; no windows, notifications or timers |
| Build effort | About half a day: one new 80-line client file, small edits in four client files and three server files, four new test files |

---

## 11. Risks and rollback

| Id | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Notes invisible in IoT detail view (discovery assumption wrong) | Certain if not handled | TRG-STEP format; U6 and L1 prove it |
| R2 | Agent remembers something only after the auto-recorded outcome | Medium | Post link on every outcome card (OOH-NOTE) |
| R3 | Personal data typed into notes | Medium | Helper text; internal comments only; not audited or texted |
| R4 | Stale cached `flows.js` keeps the old screen | High if the `?v=` markers are not bumped | Bump in release; L1 confirms the box is present |
| R5 | Re-render steals focus mid-typing | Low to medium | Focus and caret restore in `render()`; E11 |
| R6 | Notes containing "Caller's words:" pollute the IoT queue | Low | Neutraliser; U5, U6 |
| R7 | Late notes lost if the page reloads before saving | Low | Accepted for the stop-gap (ticket still exists) |
| R8 | Hi-fi interactive mockup (DF-09) not included in this artefact, per the same-day, single-file instruction | n/a | Copy and states are fully specified in section 6; Build's fixture-mode screens serve as the clickable reference at the Test gate |

Rollback: the change is additive and needs no data migration. `scripts/release.sh` prints the rollback command; the target is v1.3.6, image `080ccab` (`kubectl -n <ns> set image deployment/<deploy> <deploy>=<registry>/...:080ccab`). Tickets already carrying notes remain valid plain text under v1.3.6 and in the IoT dashboard.

---

## 12. Handoff to Build

- Contract: sections 3 to 7. Load-bearing CX moments: the always-visible box (do not move it into the outcome card), the echo, and the TRG-STEP line format (do not change it to a plain line).
- Do not touch `C:\repos\iot-support-dashboard` (D3).
- Open flags: DECISIONS 1 to 4 above (recommended defaults assumed); F3 extra call sites; R8 mockup.
