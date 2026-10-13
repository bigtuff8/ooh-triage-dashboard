<!-- gate:contract
SECTION: What we are solving
OOHDASH-119. OOH agents frequently have extra context the guided flow does not capture — a caller's specific complaint, a comment from a site engineer, a nuance not covered by any chip. Today that extra context travels by WhatsApp or Teams after the call, invisibly, detached from the ticket. The immediate win is a free-text Additional Notes box that appears at every point in the UI where a ticket is about to be submitted, so the agent can type those words once and they land on the Zendesk ticket and on the IoT Support Dashboard record, not in a side-channel.

SECTION: Where tickets get submitted today
Every guided flow ends at one of four outcome types: P1 escalation, capture-and-refer, scope-only log, or no-action log. All ten guided flows (heating, aircon, hot water, kitchen, lighting, fan, fridge, connectivity, contractor, and other) use a shared helper called finishOutcome, which posts to POST /api/outcomes. The server creates a Zendesk ticket for every call. Six outcome types also push to the IoT Support Dashboard via a Zendesk webhook on the ooh_p1 tag (the P1 paths in kitchen, lighting, fridge, and contractor). Control-confirmed outcomes — setpoint changes, frost-hold, switch, and hot-water boost — are a separate submit path in control.js: two functions, ctlFinish and ctlEscalate, each post to POST /api/outcomes and create a Zendesk ticket. These are genuine submit end points and are in scope. Beyond the guided flows, a separate ambiguous-site capture in views.js and a Tonight-view query button each create their own tickets. The total is 27 distinct submit end points.

SECTION: How notes would reach Zendesk and the IoT dashboard
The Zendesk ticket body is assembled in one place on the server: the buildTrgBody function in services/zendesk.js. It builds the [TRG] internal comment with a fixed structure — summary line, Operator line, optional Caller's words line, Outcome anchor, then the timestamped Transcript block. Additional notes appended after the Transcript block land on the ticket body. The IoT Support Dashboard's ticket detail view renders the full [TRG] comment body, so notes ARE visible there. However, the OOH oversight queue screen in the IoT dashboard (ooh-review.js buildOohQueue) uses parseTrgDescription, which only extracts three regex-matched fields — Operator, Outcome, and Caller's words — from the Zendesk search API description field. Notes appended after the transcript are NOT extracted by that function and do NOT appear in the queue row. To show notes in the oversight queue, either a small change to parseTrgDescription is needed (add a notes regex), or notes must be placed in a position parseTrgDescription already reads.

SECTION: Frozen-consumer conformance
The three regex anchors in parseTrgDescription — Operator, Outcome, and Caller's words — appear before the Transcript block and are unaffected by any text added after it. The P1 SMS built by the IoT side uses only ticket metadata (site name, subject, ticket ID), never the comment body, so notes have no effect on SMS content or trigger. Verdict: no contract change is needed for ticket creation or P1 dispatch. A small optional consumer change to parseTrgDescription would be needed only if the notes must also appear in the OOH oversight queue row; that is a separate decision.

SECTION: Risks and costs
The only token cost is negligible: the notes field adds a line of text to the Zendesk API call already made on every outcome. There is no background process, no new polling, no separate service, and no idle cost. The main risks are PII exposure (agents may type caller names into a free-text box — the field label should caution against it), runaway input (a length cap and server-side trim prevent bloat), and control-path UX complexity (the control submit fires after a device echo, not at a human pause point, so notes for those outcomes must be collected differently — see the decision below). The existing callerWords field demonstrates the safe pattern for free-text input throughout the codebase.

SECTION: Recommended approach
Add a shared Additional Notes textarea that appears in the flow UI just before or at the moment of outcome submit for all guided-flow end points (items 1 to 23). The textarea value travels in the POST /api/outcomes payload as additionalNotes and is appended after the transcript in buildTrgBody as one labelled line. For control-path outcomes (items 26 and 27), a post-submit notes affordance in the outcome card is the realistic option, posting via the existing POST /api/tickets/:id/notes path. The ambiguous-site and Tonight-query paths each get their own modal textarea. The DECISION on IoT oversight queue visibility determines whether a small parseTrgDescription change is also needed.

DECISION: Should Additional Notes be optional or required? | Optional — agent may leave it blank | Required — agent must enter something before submitting
DETAIL: Recommend optional. Requiring a note on every outcome slows the majority of calls where nothing extra needs recording.

DECISION: How should notes reach the ticket body? | Append after transcript in the [TRG] first comment, pre-submit, via one server-side change to buildTrgBody | Post as a second [OOH NOTE] internal comment after ticket creation, via the existing /api/tickets/:id/notes endpoint
DETAIL: Recommend option A (pre-submit append in [TRG]). Notes are present from ticket creation, require no second round-trip, and pass the frozen-consumer conformance check. Option B is simpler server-side but loses notes if the session drops after submit.

DECISION: Should notes appear in the IoT Support Dashboard OOH oversight queue row? | Body-only — notes visible in ticket detail view and Zendesk, not in the queue row (no IoT consumer change) | Queue row — add a notes line to parseTrgDescription in ooh-review.js so notes appear in the manager oversight screen (small consumer change)
DETAIL: Recommend body-only for this stop-gap. Queue-row visibility requires a coordinated change to the frozen IoT consumer repo; it is low risk but out of scope for a same-day delivery. Raise as a follow-up if the IoT team needs morning-review visibility of notes in the queue.

DECISION: How should control-path outcome notes (setpoint, frost-hold, switch, boost) be handled? | Post-submit textarea in the outcome card, posting via the existing /api/tickets/:id/notes endpoint (no change to control.js submit logic) | Defer to a follow-up ticket with an explicit OOHDASH ticket reference
DETAIL: Recommend post-submit textarea. Control outcomes submit automatically on device echo — there is no natural pre-submit pause point. A post-submit notes box in the outcome card (matching the existing ticket drawer pattern) is the honest implementation. Deferral is acceptable only if James agrees; it must not be a silent omission.

DECISION: What is the maximum length for Additional Notes? | 500 characters — enough for three to four sentences, enforced via client maxlength attribute and server-side trim/reject | 1000 characters or no cap
DETAIL: Recommend 500 characters. Keeps notes concise, prevents bloat in the Zendesk ticket body, and stays well within Zendesk's description field rendering.

DECISION: What label should appear on the notes line in the ticket body? | "Additional notes from OOH agent:" | "Agent notes:" | No label — plain text only
DETAIL: Recommend "Additional notes from OOH agent:" — clear authorship, unambiguous to IoT agents reviewing the ticket the next morning.

DECISION: How should the notes value be sanitised before writing to the ticket body? | Use the existing oneLine plus XSS-escape pattern already applied to callerWords throughout the codebase | A separate sanitisation step
DETAIL: Recommend the existing pattern. oneLine collapses whitespace, the XSS-escape prevents injection, and callerWords proves it works in this context. No new library is needed.
-->

# OOHDASH-119 — Additional Notes at Ticket Submit: Discovery

**Date:** 2026-10-13
**Author:** Discovery doer (Claude Code, bigtuff8 session)
**Ticket:** OOHDASH-119
**Repo / branch:** bigtuff8/ooh-triage-dashboard `discovery/oohdash-additional-notes`
**Status:** Discovery complete — awaiting design gate

---

## 1. Problem statement

OOH agents on the phone frequently hold context that no guided-flow chip captures: a note from a site engineer, a caller's specific complaint phrased precisely, a nuance that doesn't map to any step. Today that context travels on WhatsApp or Teams after the call, invisible to the Zendesk ticket and to the IoT Support Dashboard. The requirement is a free-text Additional Notes field at every guided-flow outcome point, before the ticket is submitted, so those words go into the ticket rather than a side-channel.

---

## 2. Submit end-point inventory

### 2a. Outcome types (guided flows)

All ten guided flows (heating, aircon, hot water, kitchen, lighting, fan, fridge, connectivity, contractor, other) call `finishOutcome` in `public/js/flows.js`, which fires `api.post('/api/outcomes', payload)`. The server route is `POST /api/outcomes` in `routes/api.js`; the ticket is created by `createOutcomeTicket` in `services/zendesk.js`.

Four outcome helpers map to four server type values:

- `outcomeCaptured` → type `capture`
- `outcomeP1` → type `escalate-p1`
- `outcomeScope` → type `scope-only`
- `outcomeNoAction` → type `no-action`

### 2b. Control-path outcomes (separate client module)

`public/js/control.js` contains two additional submit paths, both posting to `POST /api/outcomes`:

- `ctlFinish` (line 353): fires when the device confirms the command (synced). Submits with `actionId`, `type` from the action, and the applied subject. Creates a Zendesk ticket.
- `ctlEscalate` (line 390): fires when the operator clicks Escalate after a timeout or write failure. Submits with `type: 'capture'` and `OohCaptureClass: 'control-failure'`. Creates a Zendesk ticket.

These are genuine submit end points. They are in scope. There is no pre-submit pause point in the control flow — the submit fires automatically after the device echo or on an explicit "Escalate" button click, not at a step where a notes textarea can naturally appear before the POST. The realistic notes option for these paths is a post-submit textarea in the outcome card that posts via `POST /api/tickets/:id/notes`. See the DECISION in the contract.

### 2c. Non-flow submit paths (views.js)

- `ambiguousCapture` (views.js line 86): posts directly to `POST /api/outcomes` with `type: 'capture'` when the house ID is ambiguous. Creates a Zendesk ticket.
- `sendQuery` (views.js line 396): posts to `POST /api/query`, which calls `zendesk.raiseQuery` and creates a Zendesk ticket. This is the Tonight-view "Raise a query" button.

### 2d. Full end-point table

| # | Journey / flow | Outcome label | Type | Destination |
|---|---|---|---|---|
| 1 | Heating — boiler panel not remotely controllable | Boiler-panel captured | capture | Zendesk |
| 2 | Heating — frost-hold offered and declined | No action taken | no-action | Zendesk |
| 3 | Heating — system meeting setpoint, building-heat guidance | Scope logged | scope-only | Zendesk |
| 4 | Aircon — not controllable, referred to IoT team | Aircon referral captured | capture | Zendesk |
| 5 | Hot water — boost unavailable or caller declined | Hot-water captured | capture | Zendesk |
| 6 | Hot water — likely boiler fault | Scope logged | scope-only | Zendesk |
| 7 | Kitchen — off during active service | P1 escalation | escalate-p1 | Zendesk + IoT dashboard |
| 8 | Kitchen — needed later, not service-critical | Schedule request captured | capture | Zendesk |
| 9 | Lighting — resolved with on-site override | Override capture logged | capture | Zendesk |
| 10 | Lighting — override failed or not responding | P1 escalation | escalate-p1 | Zendesk + IoT dashboard |
| 11 | Fan — schedule or time request captured | Fan request captured | capture | Zendesk |
| 12 | Fridge — stock at risk | P1 escalation | escalate-p1 | Zendesk + IoT dashboard |
| 13 | Fridge — query only, monitored | Scope logged | scope-only | Zendesk |
| 14 | Connectivity — gateway restored on the call | Restored capture logged | capture | Zendesk |
| 15 | Connectivity — equipment-group gateway offline | Group gateway captured | capture | Zendesk |
| 16 | Connectivity — direct-connection site, equipment unreachable | Direct-site capture | capture | Zendesk |
| 17 | Connectivity — gateway still offline after checks | Gateway offline captured | capture | Zendesk |
| 18 | Contractor — on site, no PowerPause path | P1 escalation | escalate-p1 | Zendesk + IoT dashboard |
| 19 | Contractor — PowerPause, Donkey Derby exception | P1 escalation | escalate-p1 | Zendesk + IoT dashboard |
| 20 | Contractor — PowerPause override given | P1 escalation | escalate-p1 | Zendesk + IoT dashboard |
| 21 | Other — general issue, capture path | General captured | capture | Zendesk |
| 22 | Other — issue monitored only | Scope logged | scope-only | Zendesk |
| 23 | Other — issue not on Lighthouse | Scope logged | scope-only | Zendesk |
| 24 | Ambiguous site — house ID matches more than one site | Ambiguous capture | capture | Zendesk |
| 25 | Tonight view — Raise a query with the IoT team | Query ticket | query | Zendesk |
| 26 | Control path — device confirms command (ctlFinish) | Applied outcome | control type | Zendesk |
| 27 | Control path — timeout or write failure (ctlEscalate) | Control-failure capture | capture | Zendesk |

**Total: 27 distinct submit end points.** Items 7, 10, 12, 18, 19, 20 also trigger the IoT Support Dashboard via the Zendesk webhook on the `ooh_p1` tag.

---

## 3. Where the ticket body is assembled today

All outcome tickets are created by `createOutcomeTicket` in `services/zendesk.js` (line 267), which calls `buildTrgBody` (line 243). The `[TRG]` internal comment is assembled in a frozen order:

Line 1: `[TRG]` followed by the summary, maximum 180 characters.
Line 2: `Operator:` followed by the agent name and "(OOH)".
Line 3 (optional): `Caller's words:` followed by what the caller said, present only when `callerWords` is non-null.
Line 4: `Outcome:` followed by a hyphenated code such as `capture` or `escalate-p1`.
Remaining lines: `Transcript:` header followed by timestamped steps in the form `HH:MM | description`.

The Outcome anchor and the three lines above it must precede the transcript so they survive Zendesk's approximately 1,500-character description truncation (the `description` field on Zendesk search results). Anything appended after the Transcript block is safe and does not disturb the anchors.

A new `additionalNotes` line appended after the transcript would read: `Additional notes from OOH agent: "…"` (when non-empty). This is the proposed server-side change: one conditional `lines.push` at the end of `buildTrgBody`, guarded on the new field being non-null and non-empty.

---

## 4. IoT Support Dashboard visibility — concrete finding

The IoT Support Dashboard touches OOH ticket data in two places:

**Ticket detail view (`public/js/app.js`):** When an IoT agent opens a specific ticket, the full comment body is rendered. The `classifyComment` function at line 218 identifies a comment starting with `[TRG]` as type 'OOH' and renders it in full. Notes appended to the `[TRG]` body after the transcript ARE visible here.

**OOH oversight queue (`services/ooh-review.js:buildOohQueue`):** This is the manager-facing morning-review screen. It searches Zendesk for `tags:ooh` tickets and maps them through `projectRow`, which calls `parseTrgDescription(t.description)`. The `t.description` field is the Zendesk search API's description, which Zendesk truncates to approximately 1,500 characters. `parseTrgDescription` extracts three fields using regex: Operator, Outcome code, and Caller's words. It also takes the first line as the summary. Notes appended after the transcript do NOT match any of these three regexes and do NOT appear in the queue row.

**Verdict:** Notes appended to the `[TRG]` body are visible to IoT agents in the ticket detail view (and in the Zendesk native interface), but are NOT visible in the OOH oversight queue row without a small additional change to `parseTrgDescription`. The DECISION in the contract captures the options.

---

## 5. Frozen-consumer conformance

The three anchors in `parseTrgDescription` (`/Operator:\s*([^\n]+)/`, `/Outcome:\s*([\w-]+)/`, `/Caller'?s words:…/i`) all match lines that appear before the Transcript block. Text after the transcript is invisible to those regexes. The P1 SMS built by the IoT side (`ooh-escalation.js:buildOohWhatsAppAlert`) uses only `siteName`, `subject`, and `ticketId` from ticket metadata — it never reads the comment body. **No contract change is needed for ticket creation or P1 SMS dispatch.** A small optional consumer change to `parseTrgDescription` would be needed only to surface notes in the oversight queue row.

---

## 6. Customer-experience success criteria (for design)

**Persona and journey:** The OOH agent is on the phone to a site caller, navigating the guided flow in real time. They reach the final step that determines the outcome. They may have just heard something from the caller that the flow did not capture. The journey end-to-end is: guided flow → outcome determination → outcome recording → return to issue picker or end call.

**Reassurance vs friction calibration:** The notes field is low-stakes and optional. It must not slow down the majority of calls where nothing extra needs recording. It should appear naturally below the outcome determination and above the "Add another issue / End call" buttons. A placeholder such as "Anything the caller said that isn't captured above…" signals purpose without demanding input. No confirmation step — the agent types what they need and it goes automatically with the outcome.

**"Great looks like…":** An agent finishes a call, types a single sentence in the notes field, and the ticket in Zendesk carries that sentence alongside the full transcript. The agent never opens WhatsApp or Teams to pass on that context. The IoT agent reviewing the ticket the next morning sees the full picture in one place.

---

## 7. Data scope

| Entity | Key fields | Source | Sensitivity |
|---|---|---|---|
| Additional notes text | Free text, max 500 characters | Agent keyboard input | Operational — may contain caller names or site details; label should caution against personal data |
| Ticket body | [TRG] comment body | Zendesk internal comment | Internal only (public: false) |
| Outcome payload | type, siteNo, subject, detail, callerWords, additionalNotes | POST /api/outcomes | Internal |

No new storage entity is introduced. Notes are written once into the Zendesk ticket body and are subject to Zendesk's existing retention. No separate database, cache, or log.

---

## 8. End-to-end testing scope

The test stage must be able to verify:

- Happy path with notes — agent navigates any guided flow to its outcome, enters a notes value, and the created Zendesk ticket carries the notes text after the transcript and before any data-quality footer.
- Happy path without notes — agent submits an outcome without filling in the notes field; the ticket body is identical to a pre-feature ticket (no empty notes line, no regression).
- P1 path with notes — a P1 outcome carries notes in the ticket body; the `ooh_p1` tag, priority, and P1 SMS content are unchanged.
- Notes field character limit — entering more than 500 characters is prevented client-side; the server also rejects or trims oversized input.
- Control path notes — after a control outcome (applied or failed), the post-submit notes textarea appears in the outcome card; a filled note posts to `POST /api/tickets/:id/notes` and appears as an `[OOH NOTE]` comment on the ticket.
- Ambiguous capture with notes — the ambiguous-site modal includes a notes prompt; the resulting ticket carries those notes.
- Tonight query with notes — the query modal includes a notes prompt; the resulting ticket carries those notes.
- No double-fire regression — the existing `_pend_` guard in `finishOutcome` still prevents duplicate posts when the outcome chip is re-rendered.
- Existing tests unchanged — `test/zendesk.test.js`, `test/outcome-callerwords.test.js`, `tests/tonight-callback.spec.js`, and `test/p1-dispatch-honesty.test.js` must all continue to pass.

---

## 9. Existing test coverage relevant to this feature

| Test file | What it covers | Action needed |
|---|---|---|
| `test/zendesk.test.js` | `buildTrgBody`, `createOutcomeTicket` | Extend with `additionalNotes` assertion |
| `test/outcome-callerwords.test.js` | callerWords retention in outcome card | Reference pattern for notes retention |
| `test/p1-dispatch-honesty.test.js` | P1 outcome tags and dispatch note | Verify notes do not affect P1 path |
| `tests/tonight-callback.spec.js` | Playwright e2e for tonight and callback views | Extend for query notes modal |
| No existing test covers a notes UI field | — | New Playwright test needed |

---

## 10. Options

### Option A — Pre-submit append in [TRG] body (recommended for guided flows)

Notes captured in a textarea before `finishOutcome` fires; included in `POST /api/outcomes` as `additionalNotes`; appended after the Transcript block in `buildTrgBody`. One server-side change, one shared client-side change in `finishOutcome`. Notes land in the primary ticket record from creation.

Cost: negligible — one extra field in an already-fired API call. No background component.

### Option B — Post-submit [OOH NOTE] second comment (realistic for control-path outcomes)

Notes captured in a textarea rendered in the outcome card after the ticket is created; posted via `POST /api/tickets/:id/notes`. Notes appear as a `[OOH NOTE]` second comment. Appropriate for `ctlFinish` and `ctlEscalate` where the submit fires automatically and there is no pre-submit pause.

Cost: one extra Zendesk API call per outcome where notes are provided. Notes are decoupled from ticket creation — a dropped session after the outcome but before saving the note means the note is lost.

### Option C — Small consumer change to parseTrgDescription (optional follow-up)

If notes must appear in the IoT Support Dashboard's OOH oversight queue, add a `agentNotes` regex to `parseTrgDescription` in `ooh-review.js`. This is a small, low-risk change to the IoT consumer repo and does not affect the OOH producer. Not required for the stop-gap.

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Agent types PII into notes | Medium | Low-medium (internal comment, not public) | Label the field: "Keep it factual and operational — do not record personal details" |
| Agent pastes a long block of text | Low | Low | 500-character client limit via maxlength attribute; server-side trim and reject |
| Control-path notes lost after session drop | Low | Low | Accepted — post-submit path for control outcomes; the ticket still exists without the note |
| Notes break the frozen [TRG] parse | Very low | High | Verified safe — all three parseTrgDescription regexes match lines before the transcript |
| IoT oversight queue misses notes | Certain (by design) | Low | Accepted as body-only for stop-gap; Option C available as follow-up |

---

## 12. Open questions with recommended defaults

| # | Question | Recommended default |
|---|---|---|
| Q1 | Covered by DECISION: optional vs required | Optional |
| Q2 | Covered by DECISION: character limit | 500 characters |
| Q3 | Covered by DECISION: label in ticket body | "Additional notes from OOH agent:" |
| Q4 | Should notes appear in the P1 SMS? | No — body and ticket detail only |
| Q5 | Covered by DECISION: control-path UX | Post-submit textarea in outcome card |
| Q6 | Covered by DECISION: sanitisation | Existing `oneLine` plus XSS-escape pattern |
| Q7 | Should Option C (IoT oversight queue) be in this ticket's scope? | No — follow-up ticket after stop-gap ships |

---

## 13. Recommended first phase and next steps

**Recommended first phase:** Design and build covering items 1-25 (guided flows, ambiguous capture, Tonight query) with Option A pre-submit notes for items 1-23 and separate modal notes for 24-25. Control-path items 26-27 use Option B post-submit via the existing notes endpoint in the same build.

**Blockers requiring external action before build can start:** None. All investigation is complete within the current codebase. No external dependencies, no contract negotiation required.

**What this unlocks:** Agents record extra context at the point of outcome; IoT agents see it in the ticket detail view the same morning; WhatsApp and Teams side-channels for this purpose are eliminated.
