<!-- gate:contract
SECTION: What we are solving
OOHDASH-119. OOH agents frequently have extra context the guided flow does not capture — a caller's specific complaint, a comment from a site engineer, a nuance not covered by any chip. Today that extra context travels by WhatsApp or Teams after the call, invisibly, detached from the ticket. The immediate win is a free-text Additional Notes box that appears at every point in the UI where a ticket is about to be submitted, so the agent can type those words once and they land on the Zendesk ticket and on the IoT Support Dashboard record, not in a side-channel.

SECTION: Where tickets get submitted today
Every guided flow in the app ends at one of four outcome types — P1 escalation, capture-and-refer, scope-only log, or no-action log. All four reach the server via the same single endpoint, POST /api/outcomes. There are ten guided flows (heating, aircon, hot water, kitchen, lighting, fan, fridge, connectivity, contractor, and other/free-text), plus a separate ambiguous-site capture path and a Tonight-view query button, giving 25 distinct outcome call-sites in total. All 25 create a Zendesk ticket. Six of them also push the ticket to the IoT Support Dashboard via a Zendesk webhook (the P1 paths in kitchen, lighting, fridge, and contractor). Control-confirmed outcomes (setpoint changes, frost-hold, switch actions) reach the same POST /api/outcomes endpoint via a separate client path in control.js, also with no current notes field.

SECTION: How notes would reach Zendesk and the IoT dashboard
The Zendesk ticket body is assembled in one place on the server: the buildTrgBody function in services/zendesk.js. It builds the [TRG] internal comment in a fixed order — summary line, Operator line, optional Caller's words line, Outcome anchor, then the timestamped Transcript block. Additional notes appended after the Transcript block would land on the ticket body, be visible to IoT agents in the Zendesk ticket, and appear in the IoT Support Dashboard OOH oversight screen. No existing consumer parse or downstream system reads past the Transcript block. On the client side, the common outcome helper finishOutcome in public/js/flows.js is the single point where all ten guided-flow outcomes are posted; a notes field captured there would need to travel to POST /api/outcomes and from there to buildTrgBody. The ambiguous-site and query paths post directly in views.js and would need separate but minor wiring. Control-path outcomes use a different client module and would need their own wiring; they are lower priority as the operator is mid-control-action and the natural pause point is less clear.

SECTION: Frozen-consumer conformance
The IoT Support Dashboard parses the [TRG] comment body in services/ooh-review.js using three regex matches: Operator, Outcome, and Caller's words. None of these matches anything past the Transcript block. Text appended after the transcript — the proposed notes — does not disturb any of those regexes. The P1 SMS built by the IoT side uses only ticket metadata (site name, subject, ticket ID), never the comment body; notes in the body have no effect on the SMS content or trigger. Verdict: no contract change is needed. The notes can be appended after the transcript in the existing [TRG] body without breaking any consumer, or alternatively posted as a second internal comment using the existing [OOH NOTE] mechanism. Both options keep the frozen [TRG] anchor intact.

SECTION: Risks and costs
The only token cost is negligible: the notes field adds a line of text to the Zendesk API call already made on every outcome. There is no recurring background process, no new polling, no separate service. The main risk is operator behaviour: a free-text field on a live production tool needs a length cap and HTML-escape to prevent runaway input or rendering issues; the existing callerWords field already demonstrates this pattern. A secondary risk is scope creep into control-path outcomes, which are harder to instrument (the submit happens after a device echo, not at a human pause point); those should be deferred to a follow-up ticket. PII caution is warranted — agents may type caller names or phone numbers into a free-text box; the field should carry a brief label reminding them to keep it factual and operational.

SECTION: Recommended approach
Add a single shared Additional Notes textarea that appears in the outcome-pending UI just before the outcome POST fires. The textarea is optional, capped at 500 characters, and its value is included in the POST /api/outcomes payload as a new additionalNotes field. On the server, buildTrgBody appends one line after the transcript — "Additional notes from OOH agent: …" — when the field is non-empty. The ambiguous-site capture and the Tonight query should receive the same treatment in their own UI prompts. Control-path outcomes are out of scope for this ticket.

DECISION: Should Additional Notes be optional or required? | Optional — agent may leave it blank | Required — agent must enter something before submitting
DETAIL: Recommend optional. Requiring a note on every outcome slows down the majority of calls where nothing extra needs recording. The immediate win is making notes possible, not mandatory.

DECISION: How should notes reach the ticket body? | Append after transcript in the [TRG] first comment (pre-submit, one server-side change in buildTrgBody) | Post as a second [OOH NOTE] internal comment after the ticket is created (post-submit, uses the existing /api/tickets/:id/notes endpoint)
DETAIL: Recommend option A (append in [TRG]). The notes appear in the primary ticket record alongside the rest of the outcome, are present from the moment the ticket is created, and require no extra client round-trip. The frozen-consumer conformance check confirms this is safe.

DECISION: Should Additional Notes appear in the P1 SMS sent by the IoT Support Dashboard? | Body only — notes appear in the Zendesk ticket body but not in the SMS text | Include a truncated excerpt in the SMS
DETAIL: Recommend body only. The SMS is a terse page-alert that tells the on-duty manager a P1 exists at a named site. Appending free-text agent notes risks making the SMS unreadable; the manager opens the ticket link to see the full context. No change to the IoT side is needed.
-->

# OOHDASH-119 — Additional Notes at Ticket Submit: Discovery

**Date:** 2026-10-13
**Author:** Discovery doer (Claude Code, bigtuff8 session)
**Ticket:** OOHDASH-119
**Repo / branch:** bigtuff8/ooh-triage-dashboard · `discovery/oohdash-additional-notes`
**Status:** Discovery complete — awaiting design gate

---

## 1. Problem statement

OOH agents on the phone to a customer frequently hold context that no guided-flow chip captures: a note from a site engineer standing nearby, a caller's specific complaint phrased precisely, a nuance that doesn't map to any existing step. Today that context travels on WhatsApp or Teams after the call, invisible to the Zendesk ticket and to the IoT Support Dashboard. The requirement is a free-text Additional Notes field presented at every guided-flow outcome point, before the ticket is submitted, so those words go into the ticket rather than a side-channel.

---

## 2. Submit end-point inventory

Every guided-flow outcome calls `finishOutcome` in `public/js/flows.js`, which posts to `POST /api/outcomes` on the server. The server creates the Zendesk ticket in `services/zendesk.js:createOutcomeTicket`. Two additional code paths in `public/js/views.js` also create tickets directly.

### 2a. Outcome types

| Outcome type | Client function | Server type value |
|---|---|---|
| Capture-and-refer | `outcomeCaptured` | `capture` |
| P1 escalation | `outcomeP1` | `escalate-p1` |
| Scope log | `outcomeScope` | `scope-only` |
| No-action log | `outcomeNoAction` | `no-action` |

All four call `finishOutcome`, which fires `api.post('/api/outcomes', payload)`.

### 2b. Full end-point table

| # | Journey / flow | Outcome label | Type | Destination |
|---|---|---|---|---|
| 1 | Heating — boiler panel not remotely controllable | Boiler-panel captured | capture | Zendesk |
| 2 | Heating — frost-hold offered and declined | No action taken | no-action | Zendesk |
| 3 | Heating — system meeting setpoint, building-heat guidance | Scope logged | scope-only | Zendesk |
| 4 | Aircon — not controllable, referred to IoT team | Aircon referral captured | capture | Zendesk |
| 5 | Hot water — boost unavailable or caller declined | Hot-water captured | capture | Zendesk |
| 6 | Hot water — likely boiler fault | Scope logged | scope-only | Zendesk |
| 7 | Kitchen — off during active service | **P1 escalation** | escalate-p1 | Zendesk + IoT dashboard |
| 8 | Kitchen — needed later / not service-critical | Schedule request captured | capture | Zendesk |
| 9 | Lighting — resolved with on-site override | Override capture logged | capture | Zendesk |
| 10 | Lighting — override failed / not responding | **P1 escalation** | escalate-p1 | Zendesk + IoT dashboard |
| 11 | Fan — schedule / time request captured | Fan request captured | capture | Zendesk |
| 12 | Fridge — stock at risk | **P1 escalation** | escalate-p1 | Zendesk + IoT dashboard |
| 13 | Fridge — query only, monitored | Scope logged | scope-only | Zendesk |
| 14 | Connectivity — gateway restored on the call | Restored capture logged | capture | Zendesk |
| 15 | Connectivity — equipment-group gateway offline | Group gateway captured | capture | Zendesk |
| 16 | Connectivity — direct-connection site, equipment unreachable | Direct-site capture | capture | Zendesk |
| 17 | Connectivity — gateway still offline after checks | Gateway offline captured | capture | Zendesk |
| 18 | Contractor — on site, no PowerPause path | **P1 escalation** | escalate-p1 | Zendesk + IoT dashboard |
| 19 | Contractor — PowerPause, Donkey Derby exception | **P1 escalation** | escalate-p1 | Zendesk + IoT dashboard |
| 20 | Contractor — PowerPause override given | **P1 escalation** | escalate-p1 | Zendesk + IoT dashboard |
| 21 | Other — general issue, capture path | General captured | capture | Zendesk |
| 22 | Other — issue monitored only | Scope logged | scope-only | Zendesk |
| 23 | Other — issue not on Lighthouse | Scope logged | scope-only | Zendesk |
| 24 | Ambiguous site — house ID matches more than one site | Ambiguous capture | capture | Zendesk |
| 25 | Tonight view — "Raise a query with the IoT team" | Query ticket | query | Zendesk |

**Total: 25 distinct submit end points.** 23 use `finishOutcome` / `outcomeCaptured` / `outcomeP1` / `outcomeScope` / `outcomeNoAction` in `public/js/flows.js`; items 24 and 25 post directly in `public/js/views.js:ambiguousCapture` and `views.js:sendQuery`. Items 7, 10, 12, 18, 19, 20 also trigger the IoT Support Dashboard via the Zendesk webhook on the `ooh_p1` tag.

**Out of scope for this ticket:** control-confirmed outcomes (setpoint change, frost-hold, switch) also reach `POST /api/outcomes` via `public/js/control.js` with an `actionId` payload. These happen after a device echo, not at a human pause point, and are lower priority. Recommend a follow-up ticket.

---

## 3. Where the ticket body is assembled today

### Zendesk body assembly

All outcome tickets are built by `createOutcomeTicket` in `services/zendesk.js` (line 267). It delegates to `buildTrgBody` (line 243), which assembles the `[TRG]` internal comment in this frozen order:

```
[TRG] <summary — max 180 chars>
Operator: <name> (OOH)
Caller's words: "<text>"         ← optional, present when callerWords non-null
Outcome: <hyphenated-code>
Transcript:
HH:MM | <step 1>
HH:MM | <step 2>
…
```

The `Outcome:` line and the three lines above it are the frozen anchor that the IoT Support Dashboard consumer parses. Anything appended after the transcript block is safe.

### Client submission path

`finishOutcome` in `public/js/flows.js` (line 196) is the single shared helper all ten guided flows call. It fires `api.post('/api/outcomes', { siteNo, siteName, callerWords, ...payload })` exactly once per flow key (the `_pend_` guard prevents double-fire). The `payload` is built by each outcome function. A new `additionalNotes` field would be added to this payload.

### Simplest shared injection point

One text area added to the UI just before the final outcome chip fires, capturing `additionalNotes` into `state.flow.data.additionalNotes` via the same `flowStep` mechanism used for all other flow data. `finishOutcome` reads it from `f.data.additionalNotes` and includes it in the POST body. On the server, `buildTrgBody` appends one line after the transcript when the field is non-empty.

Items 24 (ambiguous capture) and 25 (query) each need a separate text area in their respective modal UIs (views.js), wired to their own POST calls.

---

## 4. Frozen-consumer conformance

### IoT Support Dashboard — ooh-review.js

The IoT dashboard parses the `[TRG]` comment body in `services/ooh-review.js:parseTrgDescription` (line 129) using three regex matches:

- `/Operator:\s*([^\n]+)/` — extracts the operator name
- `/Outcome:\s*([\w-]+)/` — extracts the outcome code
- `/Caller'?s words:\s*[""']?([^""'\n]+)/i` — extracts caller words (optional)
- The first line after `[TRG]` is taken as the summary

All three anchors appear before the Transcript block. Text appended after the transcript — the proposed notes — is ignored by these regexes. **Conformance verdict: no contract change needed.**

### P1 SMS

The P1 SMS built by the IoT Support Dashboard (`services/ooh-escalation.js:buildOohWhatsAppAlert`, line 149) uses only ticket metadata: `siteName`, `subject`, and `ticketId`. It does not read the `[TRG]` comment body. Notes in the body have zero effect on the SMS content or trigger.

### Alternative: [OOH NOTE] second comment

If the pre-submit approach (appending to `[TRG]`) is not preferred, notes can be posted after ticket creation as a second internal comment using the existing `POST /api/tickets/:id/notes` → `zendesk.addFeedbackNote` path. This requires no change to `buildTrgBody` or the POST /api/outcomes schema. The trade-off is that the notes appear as a second comment (tagged `[OOH NOTE]`) rather than embedded in the primary ticket record; they still appear in Zendesk and in the IoT dashboard thread view. This path is already proven in the ticket drawer (F015).

**Recommendation: pre-submit append to the `[TRG]` body.** The notes are present from ticket creation, require no second round-trip, and the conformance check confirms safety.

---

## 5. Customer-experience success criteria (for design)

**Persona and journey:** The OOH agent is on the phone to a site caller (often a duty manager or staff member), navigating the guided flow in real time. They reach the final chip that determines the outcome. They may have just heard something from the caller that doesn't fit the flow — a specific complaint, an engineer's name, a scheduling nuance. The journey end-to-end is: guided flow → outcome determination → outcome recording → return to issue picker or end call.

**Reassurance vs friction calibration:**
- The notes field is **low-stakes and optional.** It must not slow down the majority of calls. It should appear naturally at the point of outcome, below the outcome determination, above the "Add another issue / End call" buttons.
- The field should not feel like a form to complete. A placeholder like "Anything the caller said that isn't captured above…" signals its purpose without demanding input.
- No confirmation required — agents type what they want and the notes go automatically when the outcome fires or when they click a lightweight "Save notes" affordance.

**"Great looks like…":** An agent finishes a call, sees the outcome card ("Captured for the IoT team"), notices the notes field, types a single sentence, and the ticket in Zendesk carries that sentence alongside the full transcript. They never open WhatsApp or Teams to pass on that context. On the IoT dashboard side, the agent reviewing the ticket the next morning sees the full picture in one place.

---

## 6. Data scope

| Entity | Key fields | Source | Sensitivity |
|---|---|---|---|
| Additional notes text | Free text, max 500 chars | Agent keyboard input | Operational — may contain caller names or site details; label should caution against personal data |
| Ticket body | [TRG] comment body | Zendesk internal comment | Internal only (public:false) |
| Outcome payload | type, siteNo, subject, detail, callerWords, additionalNotes | POST /api/outcomes | Internal |

No new storage entity is introduced. Notes are written once into the Zendesk ticket body and are subject to Zendesk's existing data retention. No separate database, cache, or log.

---

## 7. End-to-end testing scope

The test stage must be able to verify:

- **Happy path — guided flow with notes:** An agent navigates any flow to its outcome, enters a notes value, and the created Zendesk ticket carries the notes text in the expected position (after the transcript, before any data-quality footer).
- **Happy path — empty notes:** An agent submits an outcome without filling in the notes field; the ticket body is identical to a pre-feature ticket (no empty notes line, no regression).
- **P1 path with notes:** A P1 outcome (e.g. kitchen) carries notes in the ticket body; the `ooh_p1` tag and priority are unchanged; the P1 SMS content is unchanged (notes are not in the SMS).
- **Notes field character limit:** Entering more than 500 characters is prevented client-side; the server also rejects or trims oversized input.
- **Ambiguous capture with notes:** The ambiguous-site modal includes its own notes prompt; the resulting ticket carries those notes.
- **Tonight query with notes:** The query modal includes a notes prompt; the resulting ticket carries those notes.
- **No double-fire regression:** The existing `_pend_` guard in `finishOutcome` still prevents duplicate posts when the outcome chip is re-rendered.
- **Existing tests not broken:** `test/zendesk.test.js`, `test/outcome-callerwords.test.js`, `tests/tonight-callback.spec.js`, and `test/p1-dispatch-honesty.test.js` must all continue to pass.

---

## 8. Existing test coverage relevant to this feature

| Test file | What it covers | Action needed |
|---|---|---|
| `test/zendesk.test.js` | `buildTrgBody`, `createOutcomeTicket` | Extend with `additionalNotes` assertion |
| `test/outcome-callerwords.test.js` | callerWords retention in outcome card | Reference pattern for notes retention |
| `test/p1-dispatch-honesty.test.js` | P1 outcome tags and dispatch note | Verify notes don't affect P1 path |
| `tests/tonight-callback.spec.js` | Playwright e2e for tonight and callback views | Extend for query notes modal |
| No existing test covers the notes UI field | — | New Playwright test needed |

---

## 9. Options

### Option A — Pre-submit: notes appended in [TRG] body (recommended)

Notes captured in a textarea before `finishOutcome` fires; included in `POST /api/outcomes` payload as `additionalNotes`; appended after the Transcript block in `buildTrgBody`. One server-side change, one shared client-side change.

- Cost: negligible (one extra field in an already-fired API call)
- Silent running: no background component; nothing runs when idle
- Notes land in the primary ticket record from creation
- No contract change for any consumer

### Option B — Post-submit: notes as [OOH NOTE] second comment

Notes captured in a textarea that appears in the outcome card after the ticket is created; posted separately via `POST /api/tickets/:id/notes`. Uses the existing feedback-note path.

- Cost: one extra Zendesk API call per outcome where notes are provided
- Notes appear as a second comment; not in the [TRG] body
- No change to `buildTrgBody` or POST /api/outcomes schema
- Slightly simpler server-side; slightly more complex client-side (second POST)
- Notes are decoupled from the ticket creation — a dropped session after the outcome but before the note means the note is lost

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Agent types PII (caller name, phone number) into notes | Medium | Low-medium (internal comment, not public) | Label the field with "Keep it factual and operational — do not record personal details" |
| Agent pastes a long block of text, bloating the ticket | Low | Low | 500-char client limit with a `maxlength` attribute; server-side trim/reject |
| Forgotten notes cause a double-fire (reload before outcome clears) | Low | Low | Existing `_pend_` guard prevents double-post; notes are in the flow state and survive a re-render |
| Control-path outcomes missed (setpoint change, frost-hold) | Medium | Low | Accepted deferral; raise as follow-up ticket |
| Notes break the frozen [TRG] parse in ooh-review.js | Very low | High (would break IoT oversight screen) | Verified safe — `parseTrgDescription` only matches lines before the transcript |

---

## 11. Open questions with recommended defaults

| # | Question | Recommended default |
|---|---|---|
| Q1 | Optional or required? | **Optional** — no mandate on every call |
| Q2 | Character limit? | **500 chars** — enough for 3-4 sentences; enforced client-side (`maxlength`) and server-side (trim/reject) |
| Q3 | Label on the ticket body? | **"Additional notes from OOH agent:"** — clear authorship, unambiguous to IoT reviewers |
| Q4 | Should notes appear in the P1 SMS? | **No** — SMS carries site/subject/ticket ID only; notes are in the ticket body for the IoT agent reviewing the ticket |
| Q5 | Cover control-path outcomes (setpoint, frost-hold, switch)? | **Defer** — the natural pause point is before the device echo, which is handled by a separate module (`control.js`); raise as a follow-up ticket |
| Q6 | Sanitisation / escaping? | **Use the existing `oneLine` + XSS-escape pattern** already applied to `callerWords` throughout the codebase |

---

## 12. Recommended first phase and next steps

**Recommended first phase:** Design and build Option A (pre-submit, [TRG] append) covering the 23 guided-flow outcomes (items 1-23), with the ambiguous-site and query paths (items 24-25) in the same build. Control-path outcomes deferred.

**Blockers requiring external action before build can start:** None. All investigation is complete within the current codebase. No external dependencies, no contract negotiation required.

**What this unlocks:** Agents can record extra context at the point of outcome; IoT agents see it on the ticket the same morning; WhatsApp/Teams side-channels for this purpose are eliminated; the IoT Support Dashboard oversight screen shows the full picture without any code change on that side.
