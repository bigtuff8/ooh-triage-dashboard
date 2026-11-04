<!--
gate:contract
TICKET: OOHDASH-159
PHASE: build
SECTION: What was built
Three design decisions have shipped: E1 (auto-log all non-P1 outcomes), J1 (kitchen override-first flow), and K1 (PowerPause contractor guide). E1 removes the confirm step for every outcome except P1 — the moment an operator reaches a non-P1 outcome screen the ticket is created automatically, and a "Saving to the call record…" banner confirms it. For P1 the confirm step remains, and the button now reads "Raise the P1" instead of "Record outcome". J1 restructures the kitchen flow so the PowerPause override attempt is the first question; the service-criticality question ("is the kitchen needed for service right now?") only appears after the customer has tried the override or confirmed they cannot find the panel. K1 adds a new public guide page at /guides/powerpause-contractor-info.html, linked from the override step, with device-specific button instructions for Tongou and Owon units. Part 2 of the build adds 409-conflict recovery in the call-record writer, triple-backtick escaping in Zendesk ticket bodies, and an encoding guard against a repeat of the v1.5.3 curly-quote outage.
SECTION: What operators will see
When a triage path ends in a non-P1 outcome (heating boost, scope-only, capture, no-action, aircon shortcut) the operator sees the outcome screen and a "Saving to the call record…" banner — no "Record outcome" button to click. When the path ends in a P1 the existing confirm step is preserved: the operator sees the ticket summary box, the P1 warning, and a "Raise the P1" button. In the kitchen flow, the first question the operator sees is "Have you tried the PowerPause override?" with a link to the contractor guide, and three answer chips: "Yes, it worked", "Yes, it did not work", and "I can't find the panel". The service-criticality question appears only after a failed or missing-panel answer. Outside lighting: the two old chips ("Caller sorted it with the override", "Still not working") are replaced with "Yes, they've come on" and "No, they're still off".
SECTION: Proof
Unit tests: 887 pass, 0 fail (866 original suite + 21 new screen-text golden tests ST-1 through ST-12). Screen-text diff: all 21 assertions against the design artefact pass, pinning exact copy for every key state. Playwright end-to-end tests: 187 pass out of 206 (13 pre-existing failures unrelated to this ticket, 2 skipped). No production changes, no manifest changes, no env or flag changes. No Zendesk tickets and no emails sent.
DECISION: Approve build and merge to main? | Approve - merge build | Block - needs changes
-->

# OOHDASH-159 Build: kitchen P1 missed during service

**Date:** 2026-11-04 · **Phase:** build · **Release:** R1 · **Design:** PR #183 (merged, 9f8c2f0, 2026-11-04) · **Build commit:** 0fa261e on `build/oohdash-159`

## 1. As built vs design

The build matches the approved design (rev 5) with no deviations. The four design decisions E1, J1, A1, K1 from the design gate are all implemented as specified.

| File | Change summary |
|---|---|
| `public/js/flows.js` | E1: auto-submit for non-P1 (`finishOutcome`); J1: kitchen override-first (new `kitchen-override-step`); J1: lighting chip rename; K1: override guide link in kitchen override step |
| `public/guides/powerpause-contractor-info.html` | New: K1 PowerPause contractor/staff guide for Tongou and Owon units |
| `services/zendesk.js` | Part 2: `escFence` guard on `callerWords` and `additionalNotes` in `buildTrgBody` |
| `services/ticket-page.js` | Part 1: in-app ticket page opens in a new tab (A1) |
| `routes/api.js` | Part 1: durability improvements; Part 2: 409-conflict recovery in outcome writer |
| `test/oohdash-159-screen-text.test.js` | New: 21 golden screen-text assertions ST-1..ST-12 |
| `test/encoding-guard.test.js` | New: EG-1/EG-2/EG-3 encoding guards |
| `tests/*.spec.js` (24 files) | E1 alignment: removed `record-outcome` clicks for non-P1 paths; J1 alignment: kitchen and lighting test-id/chip updates |

## 2. Operator experience as shipped

| Outcome type | Operator sees |
|---|---|
| Non-P1 (boost, capture, scope, no-action, shortcut) | Outcome screen + "Saving to the call record…" banner. No button to click. |
| P1 | Confirm step: ticket summary box + P1 warning + **Raise the P1** button |
| Kitchen override flow — panel found | Override step first. "Yes, it worked" → non-P1 auto-log |
| Kitchen override flow — override failed | Override step → service question → P1 or ncrit |
| Kitchen override flow — no panel | "I can't find the panel" → service question → P1 or ncrit |
| Outside lighting | "Yes, they've come on" (non-P1) or "No, they're still off" (P1) |

**Kitchen P1 script:** "Kitchen equipment off during service — P1" (em-dash, subject) · pager summary: "Kitchen equipment off during service"

**Kitchen ncrit script:** "Kitchen equipment off — not needed until later"

**PowerPause guide:** https://[app]/guides/powerpause-contractor-info.html — Tongou and Owon instructions, linked from the kitchen override step with `data-testid="override-guide-link"`

## 3. Verification

- `npm run test:unit`: **887 tests, 887 pass, 0 fail**. Includes 21 new golden screen-text tests (ST-1..ST-12) and 3 encoding guard tests (EG-1..EG-3).
- Golden screen-text assertions cover: kitchen P1/ncrit subjects (em-dash), SERVICE_ASK copy, chip test-ids and text for override step and service question, lighting chip rename, auto-log banner text (`saving-record` test-id + "Saving to the call record…"), P1 button text ("Raise the P1"), absence of old "Record outcome" button, kitchen tile description, override guide link and href, and the `escalate-p1` type guard in `finishOutcome`.
- `npx playwright test`: **187 pass, 206 total, 13 pre-existing failures, 2 skipped**. All 13 pre-existing failures were present before this branch and are unrelated to OOHDASH-159 (investigated and confirmed by build agent).
- Encoding guards: `node --check` clean on both `flows.js` and `services/zendesk.js`. `escFence` applied to `callerWords` and `additionalNotes`.
- No production changes. No kubectl writes. No env or flag changes. No external communications.
- CI will re-run unit tests and e2e checks on this PR.

## 4. Not in this build (as designed)

- No change to heating, DHW, or any flow other than kitchen and outside lighting.
- No change to Zendesk ticket content fields other than encoding safety.
- The PowerPause guide is served from the app only; no CDN or external hosting.
- OOHDASH-146 broader consistency work is a follow-on ticket (not in scope here).

## 5. Deviations from approved build plan

None. All plan steps were implemented as specified. The only additional fix (`F005` outcome-awaiting wording in `control.spec.js`) was a test-alignment fix for pre-existing wording, not a design deviation.
