<!-- gate:contract
SECTION Blockers / decisions first: Two of the four items carry gates Design surfaces but cannot close. Test 11a (auto-P1 on the welfare flows heating/fan/hot-water) needs a James + Sam product call on WHICH flows qualify, plus a new in-flow signal to capture the qualifying condition — Design specifies the mechanism and marks the flow selection as decision D-11a-1, it does not decide it. Test 11b (a real SMS going out) is go/no-go #4 (OOHDASH-73): needs sign-off, a confirmed on-duty number, and provider creds — all external. The two in-repo trust defects, Test 10 (dropped typed words) and Test 11c (false "SMS sent"), have NO external gate and ship now; 11c ships DECOUPLED from 11b so the app is truthful in log-mode even before the gateway is live.
SECTION What this is: The design gate for the four open tester-feedback items (Tests 10, 11a, 11b, 11c) from the Tony Willetts Tier-1 pack, built on the signed-off discovery. It asks you to approve the design so the build can begin — or request changes. WRITES stay LOCKED throughout; no product code is written until this gate is approved.
SECTION What this design delivers: Test 10 — category tiles carry the handler's typed words through to the ticket (routing-only wrapper) plus an echo on the confirmation card. Test 11a — a system-driven auto-P1 mechanism with a reason tag and an audited escape-hatch; welfare-flow selection is your decision. Test 11b — the real SMS gateway made switch-on-when-ready with a startup config-guard; externally gated. Test 11c — the false "SMS sent" claim fixed via an honest first comment plus a corrective second comment; decoupled from 11b.
SECTION Ship-now vs gated: Test 10 and Test 11c build now (in-repo, no external party). Test 11a welfare flows are gated on the James + Sam sign-off; the three existing P1 flows need nothing. Test 11b is gated on OOHDASH-73 go/no-go #4 (creds + on-duty number). Test 10 must land before any write-flip.
SECTION Decisions for this gate: D-10a echo typed words on the card (recommend YES). D-10b optional notes field (recommend NO for R1). D-11a-1 which welfare flows warrant auto-P1 (James + Sam; recommended default carried below). D-11a-2 escape-hatch UX placement and copy. D-11b go/no-go on the real gateway.
DECISION D-10a confirmation-card echo: RECOMMEND YES — echo the handler's typed words on the outcome confirmation card, not only the back-office ticket. Note retention is a trust criterion the handler verifies at their own screen. Low cost (the flow panel already renders the words mid-flow; the card does not).
DECISION D-10b optional notes field: RECOMMEND NO for R1 — an explicit "notes for the IoT team" field is not needed to fix Test 10 and adds surface. Defer unless the gate wants it.
DECISION D-11a-1 welfare-flow selection: JAMES + SAM. Recommended default for the gate to accept or amend — heating = P1 on total-heat-loss plus vulnerable occupants / hard-freeze; fan = P1 on active-cooking / gas-safety only; hot-water = NOT auto-P1; lighting = NOT auto-P1; connectivity/other = NOT auto-P1.
DECISION D-11a-2 escape-hatch UX: A reason-tagged, audited confirm-prompt (NOT a bare "escalate as P1" button) on every non-P1 outcome card, so "no auto-P1 button" never means "no P1 path". Gate to confirm placement and copy.
DECISION D-11b go/no-go: JAMES / SPENCER (OOHDASH-73 #4). Design is switch-on-when-ready; enabling is external. If no-go at build time, 11b defers and 11c ships anyway.
-->

# OOH Dashboard — Tester Feedback Design Gate (Tests 10 / 11a / 11b / 11c)

**Timestamp:** 2026-09-18 · **Stage:** Design gate (pre-build) · **Owner:** James Brown
**Gate ask:** approve the design for the four open Tony Willetts tester-feedback items (Tests 10, 11a, 11b, 11c) so the build can begin, or request changes.

> **Full design:** `OOH_TESTER_FEEDBACK_DESIGN_2026-09-18.md` (per-item design, code-change inventory, edge cases, test plan). **Interactive review:** [`mockups/OOH_TESTER_FEEDBACK_design_review.html`](mockups/OOH_TESTER_FEEDBACK_design_review.html) — the per-test disposition table plus before/after illustrations for Test 10 and Test 11c, embedded as the Live prototype on this PR. Evidence: `OOH_TESTER_FEEDBACK_DISCOVERY_2026-09-18.md` (signed-off discovery, all 13 tests dispositioned with firsthand root causes).

---

## What this design delivers

Four items from Tony's Tier-1 pack, each traced to a code-confirmed root cause and given a build-ready fix. Two are in-repo trust defects that ship now; two carry external gates the design surfaces but cannot close. **WRITES stay LOCKED throughout** (`WRITES_DISABLED=true`); no product code is written until this gate is approved.

### Test 10 — category tiles must carry the handler's typed words

- **Confirmed root cause.** The category tiles call `startFlow` with no free-text argument (`views.js:177`), so the handler's typed smart-entry text is set to empty and reaches the wire as null — no "Caller's words" line ever hits the ticket. The "Sounds like" suggestion chip is the control case that proves the asymmetry: it already carries the text (`flows.js:52`).
- **Fix approach (routing-only).** Add a thin `startTileFlow(k)` wrapper next to the chip's wrapper that reads the typed words from state and passes them into `startFlow`, and point the tile at it. The text is never interpolated into the click attribute (speech contains quotes/apostrophes), so it routes through the same safe state indirection the chip uses. Plus a CX addition: echo the typed words on the handler's confirmation card, not only on the back-office ticket, so the handler can verify capture at their own screen.

### Test 11a — auto-invoke P1 on warranted flows (system-driven)

- **Confirmed root cause.** P1 eligibility is hard-coded in exactly three flow branches (contractor, fridge/stock-at-risk, kitchen-critical) that already work and need no change and no sign-off. The welfare candidates (heating, fan, hot-water) do not today capture the signal that makes them a P1 — occupant vulnerability or an active-safety condition — so they need new in-flow logic, not a routing tweak.
- **Fix approach.** Reuse the existing mechanism: a flow warrants P1 by calling the existing P1 outcome on the qualifying branch. For each signed-off welfare flow, add an in-flow decision step that asks the qualifying question, then routes to P1 only on the qualifying answer. Add a lightweight `p1Reason` tag to the P1 payload (for example `welfare-heat-loss`, `gas-safety`) so the "why was this a P1" set is auditable and greppable. Add an audited, reason-tagged escape-hatch — a confirm-prompt requiring a typed reason, not a bare button — on every non-P1 outcome card, so a genuine P1 on an uncovered flow is never stranded and every override is attributable. **Which welfare flows qualify is pending the James + Sam product call (D-11a-1).**

### Test 11b — enable a real SMS gateway (switch-on-when-ready)

- **Confirmed root cause / state.** The Twilio path is fully implemented (`escalation.js:34-42`); the `log` provider is a deliberate no-op. Turning 11b on is a config/secret operation, not new code: set the provider, populate the creds and the on-duty number.
- **Fix approach.** A small startup config-guard is the only recommended build: if the provider is set to Twilio but any cred or the on-duty number is missing, fail loudly and visibly at deploy (and surface it on the admin SMS-log) rather than silently at the first P1. If go/no-go is a no-go, the provider stays in log mode and the app is still truthful because 11c ships regardless. **External preconditions are the gate (D-11b).**

### Test 11c — dispatchOk must reflect an actual send

- **Confirmed root cause (incl. the sequencing wall).** In log mode the no-op send is recorded as a success, so the card and the ticket both claim a text "has been sent" when nothing was. The sharper nuance: the transcript is built and baked into the ticket's first comment (`routes/api.js:254` then `:256`) BEFORE escalation runs (`:268`), so the dispatch result genuinely does not exist at transcript-build time — a naive conditional on the existing line is impossible.
- **Fix approach (late-sync corrective, honesty).** Reuse the proven late-sync pattern: keep the first comment honest (drop the unconditional "SMS dispatched" claim, replace it with a neutral true-at-build-time "P1 escalation raised" line), then append a SECOND internal comment stating the true dispatch result after escalation returns. Make log-mode NOT count as a send, and gate the card copy on the real result. When nothing was sent the card states the next action — phone the on-duty manager now, the P1 is logged. This is correct in log mode today and stays correct the moment the gateway is enabled, with no further change. **Decoupled from 11b.**

---

## Ship-now vs gated

- **Ship now (in-repo, no external party).** Test 10 (routing wrapper plus card echo) and Test 11c (dispatch honesty). Recommended to build together — both are trust/audit fixes, neither waits on anyone. Test 10 must land before any write-flip, so the latent control-path drop noted in the design never reaches a real control ticket.
- **Gated on James + Sam.** Test 11a welfare flows. The three existing P1 flows (contractor, fridge, kitchen-critical) are ready now and need no sign-off; only the welfare candidates wait on D-11a-1.
- **Gated on OOHDASH-73 go/no-go #4.** Test 11b. Enable when the sign-off, on-duty number, and provider creds land; a no-go defers 11b while 11c still ships.

---

## Open items for your decision (design gate)

- **D-10a — echo typed words on the confirmation card.** Recommend YES. Note retention is a trust criterion the handler must be able to verify at their own screen, not only trust to the back office. Low cost: the flow panel already renders the words mid-flow; the outcome card does not.
- **D-10b — optional "notes for the IoT team" field.** Recommend NO for R1. Not needed to fix Test 10 and adds surface. Defer unless the gate wants it.
- **D-11a-1 — which welfare flows warrant auto-P1 (James + Sam).** Design does not decide this. Recommended default for the gate to accept or amend: heating is P1 on total-heat-loss plus vulnerable occupants or a hard-freeze forecast; fan is P1 on active cooking with a gas-safety / extraction-failure condition only; hot-water is NOT auto-P1 (edge: care setting); lighting is NOT auto-P1; connectivity and other are NOT auto-P1.
- **D-11a-2 — escape-hatch UX placement and copy.** Recommend a confirm-with-mandatory-reason action on every non-P1 outcome card, tagged as an operator override and audited. Not a bare button. Gate to confirm the exact placement and wording.
- **D-11b — go/no-go on the real gateway.** James / Spencer (OOHDASH-73 #4). Confirm the sign-off, that the on-duty number is set, and that provider creds are present. Design is switch-on-when-ready; a no-go defers 11b and 11c ships anyway.

---

## Test plan summary

Five new or extended unit files under `test/`, run with `npm run test:unit`:

- **Test 10** — a tile-started flow sends the typed text through to the ticket; the ticket body emits the "Caller's words" line when present and omits it when absent; speech with quotes/apostrophes survives the round-trip; the card echoes the words when present and nothing when empty.
- **Test 11a** — the three existing P1 flows still escalate (regression guard); a welfare flow escalates only on the qualifying branch; every P1 payload carries a `p1Reason` that reaches the audit entry; the escape-hatch override carries an operator-override reason plus the typed reason.
- **Test 11b** — the Twilio branch is selected with full creds and throws the configured error when creds are missing; the startup config-guard flags a half-configured gateway; log is the default provider.
- **Test 11c** — log-mode does not report a successful dispatch; the transcript no longer contains the unconditional "SMS dispatched" assertion and instead carries the neutral "P1 escalation raised" line; the corrective second comment writes the correct content for each of sent / log-mode / failed; the first comment's outcome-code parse is unchanged (freeze guard); the corrective-comment failure path never fails the outcome.

**Live re-tests** each need a B2C handler login (not doable headlessly): witness Test 10's typed words on card and ticket; exercise each signed-off welfare branch and the escape-hatch for Test 11a; raise a log-mode P1 and confirm the honest card and second comment for Test 11c; and, only after go-live, a real text for Test 11b.

---

## On approval

- **Accept** → build begins on Test 10 and Test 11c together (both in-repo trust fixes). Test 11a's three existing P1 flows are verified as-is; the welfare flows and Test 11b are held until the James + Sam sign-off (D-11a-1) and the OOHDASH-73 go/no-go (D-11b) respectively.
- **Amend** → leave the changes; the design is revised before build.

*Provenance: hand-authored design; no build doer has run. This gate authorises the build, not any live write. Writes remain LOCKED — no write-flip is proposed, and the Test-10 secondary control-path fix is explicitly deferred to the write-enable workstream. This artefact changes no application source, opens no PR and raises no gate — the Orchestrator governs those.*
