<!-- gate:contract
SECTION Blockers / decisions first: Two of the four items carry human/external gates that Design surfaces but cannot close. Test 11a (auto-P1 on the welfare flows heating/fan/hot-water) needs a James + Sam product call on WHICH flows qualify AND a new in-flow signal to capture the qualifying condition — Design specifies the mechanism and marks the flow selection as an explicit DECISION POINT for the gate, it does not decide it. Test 11b (a real SMS text going out) is go/no-go #4 (OOHDASH-73): needs sign-off, a confirmed ESCALATION_ONDUTY_NUMBER, and provider creds — all external. The two in-repo trust defects, Test 10 (dropped typed words) and Test 11c (false "SMS sent"), have NO external gate and ship now; 11c ships DECOUPLED from 11b so the app is truthful in log-mode even before the gateway is live.
SECTION What this is: The build-ready design for the four open tester-feedback items (Tests 10, 11a, 11b, 11c) from the signed-off discovery OOH_TESTER_FEEDBACK_DISCOVERY_2026-09-18.md. It names the exact files/functions to change, the approach, the control/data flow, the edge cases, and the unit tests each item adds — precise enough to build without re-deriving. It changes no product code and proposes no write-flip; writes stay LOCKED (WRITES_DISABLED=true).
SECTION Test 10 — typed words dropped: The category tiles call startFlow('${c.k}') with no free-text argument (views.js:177), so the handler's typed smart-entry text never reaches the ticket. Fix is routing-only — carry state.smartEntryText into the tile's startFlow call exactly as the "Sounds like" chip already does (flows.js:52). PLUS a CX decision: echo the typed words on the handler's confirmation card, not only the back-office ticket (Design recommends yes; the flow already renders them mid-flow, the card does not). A latent control-path detail/holdText drop is noted for the write-flip but NOT actioned now.
SECTION Test 11a — auto-P1 on warranted flows: Three flows already mint P1 correctly (contractor, fridge, kitchen-critical) and need nothing. The NEW welfare candidates (heating total-loss, fan gas-safety, hot-water care-setting) each need a NEW in-flow decision point to capture the qualifying signal (occupant vulnerability / active-safety) the flow does not capture today — this is why it is not a routing tweak. Design gives a declarative mechanism for how a flow declares "this outcome warrants P1" and an audited, reason-tagged escape-hatch so a genuine P1 on an uncovered flow is never stranded. WHICH welfare flows qualify is a James + Sam DECISION POINT.
SECTION Test 11b — real SMS gateway: The Twilio path already exists (escalation.js:34-42); flipping SMS_PROVIDER=twilio with creds present turns it on. Design makes it switch-on-when-ready and confirms 11c is independent of it. External preconditions are the gate.
SECTION Test 11c — dispatchOk must reflect an actual send: The transcript is built (routes/api.js:254) and baked into the ticket (routes/api.js:256) BEFORE escalateP1 runs (routes/api.js:268), so dispatchOk does not exist at transcript-build time — a naive conditional on the existing line is impossible. Design uses the corrective-post-dispatch pattern already proven for late-sync (zendesk.addLateSyncNote): keep the [TRG] first comment honest (drop the unconditional "SMS dispatched" claim), then append a SECOND internal comment stating the true dispatch result after escalateP1 returns. The card (flows.js:153) is gated on res.p1.dispatchOk (already exposed). Log-mode is treated as NOT a send; the copy states the next action (phone the on-duty manager now).
SECTION Test plan + sequencing: Unit tests per item (routing carry, transcript no-longer-unconditional, corrective-comment content, card gating, provider selection), plus the live re-test each needs. Ship-now: Test 10 + Test 11c (both in-repo, no gate). Externally gated: Test 11a (James+Sam sign-off), Test 11b (creds/sign-off). 11c ships decoupled from 11b — confirmed.
DECISION Test 10 confirmation-card echo: RECOMMEND YES — echo the handler's typed words on the outcome confirmation card, not only on the back-office ticket. Note retention is a trust criterion the handler verifies at their own screen. Low cost (the flow panel already renders "Caller's words" mid-flow; the outcome card does not). Gate to confirm.
DECISION Test 10 optional notes field: RECOMMEND NO for R1 — an explicit "notes for the IoT team" outcome-compose field is not required to fix Test 10 and adds surface. Defer unless the gate wants it.
DECISION Test 11a welfare-flow selection: JAMES + SAM. Design does NOT decide which of heating / fan / hot-water warrant auto-P1. Recommended default (carried from discovery, for the gate to accept or amend): heating = P1 on total-heat-loss + vulnerable occupants / hard-freeze; fan = P1 on active cooking / gas-safety only; hot-water = NOT auto-P1 (edge: care setting); lighting = NOT auto-P1; connectivity/other = NOT auto-P1.
DECISION Test 11a escape-hatch UX: A reason-tagged, audited confirm-prompt (NOT a bare "escalate as P1" button) available on every capture outcome, so "no auto-P1 button" never means "no P1 path". Gate to confirm the exact placement + copy.
DECISION Test 11b go/no-go: JAMES / SPENCER (OOHDASH-73 #4). Design is switch-on-when-ready; enabling is external. If no-go at build time, 11b defers and 11c ships anyway.
-->

# Design — Tester Feedback (Tony Willetts Tier-1), open items 10 / 11a / 11b / 11c

**Release:** OOH Triage Dashboard — R1 · **Stage:** Design · **Date:** 2026-09-18 · **Owner:** James Brown
**Input (signed off):** `OOH_TESTER_FEEDBACK_DISCOVERY_2026-09-18.md` (primary), `OOH_TESTER_FEEDBACK_TB_DIRECT_IMPACT_2026-09-18.md`.
**Cross-referenced for consistency:** `OOH_TB_DIRECT_READ_CONTROL_DESIGN.md`, `OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md`, `OOH_TB_DIRECT_STATE_AND_HANDOVER_2026-09-18.md`.
**Ticket:** OOHDASH-72 (Tony Willetts Tier-1). **Supersedes** the paused OOHDASH-77 branch (do not merge — discovery §5).

**Repo state (verified against this design):** `main` (deployed image `dce9ea0`); read cutover LIVE (`thingsboardRead:healthy`); `WRITES_DISABLED=true`; `SMS_PROVIDER=log`; `DATA_MODE=live`. Line numbers below read firsthand 2026-09-18 in the working tree.

> **Line-number note.** Discovery cited some lines against `main` @ `5763776`. This design re-read the current tree: the Test-10 tile is at `views.js:177` (confirmed); the "Sounds like" chip carries free text at `flows.js:52` (confirmed); `startFlow` is `flows.js:56-59`; `callerWords` goes on the wire at `flows.js:124`; the transcript build/bake/escalate ordering is `routes/api.js:254 / :256 / :268` (confirmed); the unconditional "SMS dispatched" line is `routes/api.js:239`; the card claim is `flows.js:153`; `dispatchOk` is set in `services/escalation.js:68/74`; the log-mode no-op is `services/escalation.js:44-46`.

---

## 1. Scope & non-goals

**In scope (design for build):**
- **Test 10** — category tiles carry the handler's typed smart-entry text through to the ticket (routing-only), plus the CX decision to echo those words on the handler's confirmation card.
- **Test 11a** — a declarative, system-driven auto-P1 mechanism; a new in-flow decision point for the welfare candidates; an audited, reason-tagged escape-hatch. (Flow selection is a gate decision.)
- **Test 11b** — make the real SMS gateway switch-on-when-creds-land.
- **Test 11c** — make `dispatchOk` (card + ticket) reflect an *actual* send, via a corrective post-dispatch comment (not a naive conditional).

**Non-goals / invariants (DO NOT violate):**
- **Writes stay LOCKED.** Nothing here requires flipping `WRITES_DISABLED=false`. The Test-10 secondary control-path fix (synthesised `detail`/`holdText`) is **noted as deferred** — it only matters once writes are enabled — and is **not** built in this workstream.
- **ThingsBoard is system of record**; the integration-bridge sits behind it for command dispatch only. No change here.
- **11b is external-gated** (OOHDASH-73 #4). Design carries the preconditions; it does not close them.
- **11c ships DECOUPLED from 11b** — correct, truthful behaviour in log-mode even if the gateway is never enabled.
- **Freeze rule preserved.** No added/reordered transcript line may perturb the `[TRG]` first-comment oversight parse (`/Outcome:\s*([\w-]+)/`, `services/zendesk.js:227`). Corrections go in a **second** internal comment, never by mutating the first.
- **Design only** — no product code changed. Proposed snippets match existing style.

---

## 2. Per-item design

### 2.1 Test 10 — category tiles must carry the handler's typed words

**Symptom (Tony).** Handler types the issue into the smart-entry box, clicks a **category tile** (not the "Sounds like" suggestion chip), completes the outcome — the typed words are absent from the ticket.

**Root cause (code-confirmed).** The tile renders `onclick="startFlow('${c.k}')"` with **no second argument** (`views.js:177`). `startFlow(k, freeText)` then sets `f.data.freeText = freeText || ''` = `''` (`flows.js:56-59`). On outcome the wire carries `callerWords: f.data.freeText || null` = **null** (`flows.js:124`), so `buildTrgBody` never emits a `Caller's words:` line (`zendesk.js:246`). The suggestion chip is the control case that proves the asymmetry: `startSuggestedFlow(k)` calls `startFlow(k, state.smartEntryText || '')` (`flows.js:51-53`).

**Approach — routing-only (primary fix).**

| File / line | Change |
|---|---|
| `public/js/views.js:177` | The tile `onclick` must carry the typed text the same way the chip does. Because natural speech contains quotes/apostrophes that break an inline `onclick` string (the exact reason `issueSearch` holds the text in `state.smartEntryText` rather than interpolating it — see the comment at `flows.js:35-38`), the tile MUST NOT interpolate the text into the attribute. Route it through a thin wrapper that reads from state, mirroring `startSuggestedFlow`. |

Two build-equivalent options (pick at build; **Option A recommended** — it reuses the existing safe indirection and is symmetric with the chip):

- **Option A (recommended).** Add a `startTileFlow(k)` wrapper next to `startSuggestedFlow` in `flows.js`:
  ```js
  /** Starts a category-tile flow, carrying the typed caller words from state (Test 10). */
  function startTileFlow(k) { startFlow(k, state.smartEntryText || ''); }
  ```
  and change the tile to `onclick="startTileFlow('${c.k}')"` (`views.js:177`). `startSuggestedFlow` and `startTileFlow` are then identical one-liners; that is intentional and acceptable — they are distinct call sites with distinct `data-testid`s, and keeping them separate documents that BOTH entry paths carry the text.
- **Option B.** Point the tile directly at `startSuggestedFlow('${c.k}')`. Fewer lines, but overloads a function named for the *suggestion* path onto the *tile* path — mildly misleading. A/B are behaviourally identical.

Note: the two banner call sites that start a flow with **no** free text — the offline-banner "Run connection check" (`views.js:170`) and the in-flow `otherShortcut()` (`flows.js:172`) — are **correct as-is** and out of scope; they are not caller-word entry points.

**CX — echo typed words on the confirmation card (DECISION, recommend YES).**
Today the typed words are shown *inside* the flow panel while the handler works (`flows.js:89`, the "Caller's words:" `stepdone`), but the **final outcome card** (`outcomeCaptured` / `outcomeP1` / `outcomeScope` / `outcomeNoAction`, `flows.js:141-169`) does **not** echo them. Discovery's position (carried CX-3): note retention is a trust criterion the handler must be able to verify at *their own* screen, not only trust to the back office.

- **Design:** add a single caller-words line to the shared outcome-card render, sourced from `f.data.freeText` (already in scope in each `outcome*` helper via `finishOutcome(f, …)`). Cleanest: render it once in `finishOutcome`'s `renderCard(res)` wrapper so all four card types inherit it, e.g. prepend a small muted line `Recorded from the caller: "<freeText>"` when `f.data.freeText` is non-empty. Reuse the existing `esc()` and the `stepdone`/`small` styling for visual consistency with the mid-flow line.
- **Edge:** when `freeText` is empty (handler used a tile *without* typing anything — a legitimate path) render nothing; never show an empty-quote artefact.
- **Cost/benefit:** ~5 lines, one render site; buys the handler direct confirmation that their words were captured (the precise thing Tony found missing). Low risk, no server change.

**Secondary (LATENT — deferred, not built now).** On control-linked outcomes the transcript's action-branch omits the synthesised `detail`/`holdText` line that the else-branch carries (`routes/api.js:226-233` vs `:234-238`). On a control-*failure* ticket this could drop the "treat as not applied" context. This **only matters once writes are enabled**; under the write-lock no control-failure ticket can be produced. **Design decision: note it, do NOT build it here.** It is a pre-write-flip obligation and belongs to the write-enable workstream, tracked so it lands before `WRITES_DISABLED=false`.

**Edge cases (Test 10 primary).**
- Quotes/apostrophes in speech: handled — text never enters the `onclick` attribute (state indirection).
- Handler edits the smart-entry box, then clicks a tile: `state.smartEntryText` is updated on every `oninput` (`flows.js:38`), so the tile always carries the latest text. ✓
- `other` flow: its textarea is pre-seeded from `f.data.freeText` (`flows.js:527`), so the carried text also pre-fills the "Something else" box — a bonus, no regression.

---

### 2.2 Test 11a — auto-invoke P1 on warranted flows (system-driven)

**Decision already made (D1, James).** SYSTEM-DRIVEN. No generic "escalate as P1" button (abuse / mis-fire risk). The system auto-invokes P1 on the flows that warrant it.

**Current state (code-confirmed).** P1 eligibility is hard-coded in exactly three flow branches, each of which already calls `outcomeP1(...)` correctly:
- **contractor** — always P1 (`flows.js:516`).
- **fridge / stock-at-risk** — P1 when the handler answers "stock at risk" (`flows.js:459`).
- **kitchen-critical** — P1 when the handler answers "business critical now" (`flows.js:371`). TB-direct makes kitchen devices visible, so this path is now *reachable* (previously blocked when only Salus was on the bridge).

The server raises P1 for any `type === 'escalate-p1'` (`routes/api.js:249`), so eligibility lives entirely in the front-end flow definitions. **These three flows need NO change and need NO sign-off** — they already work and can be re-tested as-is.

**Why the welfare candidates are not just routing.** The new candidates — **heating** (total-heat-loss), **fan** (gas-safety), **hot-water** (care setting) — do not today capture the signal that makes them a P1 (occupant vulnerability / an active-safety condition). A P1 on "heating" in general would over-page; a P1 only on "total heat loss with vulnerable occupants in a hard freeze" is correct. So each qualifying candidate needs a **new in-flow decision point** that captures the qualifying condition, then routes to `outcomeP1` on the qualifying branch and to the existing capture/scope outcome otherwise. That is new flow logic, not a routing tweak — which is exactly why it is gated on the product call.

**Mechanism — how a flow declares an outcome warrants P1 (declarative, minimal).**
The mechanism already exists and should be *reused*, not replaced: **a flow warrants P1 by calling `outcomeP1(...)` on the qualifying branch.** The design work for each welfare candidate is therefore:
1. Add an in-flow decision step that asks the qualifying question (see per-flow below).
2. On the qualifying answer, call `outcomeP1(f, key, { subject, detail, script, p1Summary })` — identical shape to the three existing P1 calls, so no new plumbing, no server change, and the `p1Summary` field already flows to the SMS body (`escalation.js:55`) and the transcript.
3. On the non-qualifying answer, keep the current capture/scope outcome unchanged.

To make the *intent* auditable and greppable (so the "which flows can mint P1" set is explicit rather than scattered), add a lightweight tag to the P1 payload: extend `outcomeP1(...)`'s payload with an optional `p1Reason` (e.g. `'welfare-heat-loss'`, `'gas-safety'`, `'contractor'`, `'stock-at-risk'`, `'kitchen-service'`). It is passed to the server on the wire, written into the audit entry (`routes/api.js:280-286`) and the SMS log, and lets Explore/reporting answer "why was this a P1". This is additive and does not change the existing three flows' behaviour (they simply gain a constant `p1Reason`).

**Per-flow candidate design (all gated on the James + Sam decision below).**

| Flow | Recommended qualifying test (new in-flow step) | Non-qualifying path (unchanged) |
|---|---|---|
| **heating** | After a "not working" / total-loss reading (device online but no heat, or offline gateway already routes to connectivity), add a step: *"Is anyone vulnerable on site (elderly/child/care) OR is a hard freeze forecast?"* → **Yes = P1** (`p1Reason:'welfare-heat-loss'`); No = existing capture/building-heat guidance. | current heating capture / scope / no-action outcomes. |
| **fan** | Add a step before capture: *"Is the kitchen actively cooking now AND is this a gas-safety / extraction-failure situation?"* → **Yes = P1** (`p1Reason:'gas-safety'`); No = existing schedule capture. | current fan capture. |
| **hot-water** | *Recommended NOT auto-P1* (edge: care setting). If the gate wants it: *"Is this a care/hotel setting with a vulnerable-occupant welfare need tonight?"* → Yes = P1. | current capture / scope. |
| **lighting** | *Recommended NOT auto-P1* (edge: premises-dark safety is a site-electrician matter). | unchanged. |
| **connectivity / other** | **No auto-P1** (recommended). Covered by the escape-hatch below. | unchanged. |

**Escape-hatch — audited, reason-tagged (CX-1, DECISION on exact UX).**
"No auto-P1 button" must never mean "no P1 path." A handler on a genuine P1 that the system did not auto-escalate (e.g. an `other`/`connectivity` outcome that turns out to be an emergency) needs a path — but a bare button invites the mis-fire D1 forbids. Design:
- On every **capture / scope / no-action** outcome card, offer a single **"This is actually an emergency — escalate as P1"** action that opens a **confirm-prompt requiring a typed reason** (free text, mandatory, min length). It does **not** fire on click; it fires on confirm-with-reason.
- On confirm, it re-submits the outcome as `type:'escalate-p1'` carrying `p1Reason:'operator-override'` and the typed reason (persisted to the audit entry + SMS log), so every override is attributable to an operator and a stated reason. Reuse the existing `outcomeP1` path — no new server endpoint.
- **Transparency (CX):** where the system *did not* auto-escalate a flow the handler might have expected to, the outcome card states plainly that the call was **not** auto-escalated and offers the escape-hatch — so the handler is never left assuming a P1 went out when it did not.
- **Guard rails against mis-fire:** mandatory reason + confirm step + audit tag + `operator-override` reason distinguishing it from system-decided P1s in reporting. This is the "not a bare button" requirement satisfied.

**Edge cases.**
- Heating that routes to connectivity (offline gateway, `flows.js:221`) already leaves the heating flow — the welfare step must sit on the *online-but-no-heat* branch, not the offline branch (offline = no command can reach the site anyway).
- Double-escalation: the escape-hatch is only offered on non-P1 outcome cards, so a flow that already auto-P1'd cannot also be manually P1'd for the same outcome (the P1 card shows the P1 result, not the escape-hatch).
- `finishOutcome` de-dupes by flow key (`flows.js:110`), so a re-submitted override needs a distinct key to actually post (build note: key the override submission separately, e.g. `key + '-p1override'`).

---

### 2.3 Test 11b — enable a real SMS gateway (switch-on-when-ready)

**Decision already made (D2, James).** Enable a real gateway this release.

**Current state (code-confirmed).** The Twilio path is fully implemented (`escalation.js:34-42`): if `config.sms.provider === 'twilio'` and `accountSid/authToken/from` are present, it POSTs to the Twilio REST API (no SDK dependency). The `log` provider is a deliberate no-op (`escalation.js:44-46`). Provider is chosen by `SMS_PROVIDER` env (`config.js:100`), on-duty number by `ESCALATION_ONDUTY_NUMBER` (`config.js:106`).

**Approach — no new code needed to *enable*; the wiring already exists.** Turning 11b on is a **config/secret operation**, not a build: set `SMS_PROVIDER=twilio`, populate `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` and `ESCALATION_ONDUTY_NUMBER` in the k8s secret. The design obligation is to make this **safe and switch-on-when-ready**:
- **Config guard (small, recommended build):** at startup, if `SMS_PROVIDER=twilio` but any Twilio cred or `ESCALATION_ONDUTY_NUMBER` is missing, log a loud startup warning (and surface it on `/api/admin/sms-log` alongside the existing `(configured)`/`(not configured)` indicator, `escalation.js:64`) — so a half-configured gateway is visible, not silent. The existing runtime guard already throws `'Twilio provider selected but not configured'` per-send (`escalation.js:36`); the startup check makes it fail *visibly at deploy* rather than at the first P1.
- **No-go fallback:** if go/no-go is a no-go or the number is unconfirmed at build/deploy time, leave `SMS_PROVIDER=log`. The app is still **truthful** because 11c (below) ships regardless. Do **not** block 11c on 11b.

**External preconditions (K2 — Design carries, does NOT close):**

| # | Precondition | State / probe | Owner |
|---|---|---|---|
| 1 | OOHDASH-73 go/no-go #4 sign-off | External decision | Spencer / James |
| 2 | `ESCALATION_ONDUTY_NUMBER` set | UNVERIFIED — probe `/api/admin/sms-log` (`sentToNumber` shows `(configured)`/`(not configured)`) or read the k8s secret | James / Spencer |
| 3 | Provider creds (`TWILIO_*`) in the secret | Not present today (`SMS_PROVIDER=log`) | Spencer / James |

---

### 2.4 Test 11c — `dispatchOk` must reflect an ACTUAL send

**Symptom (Tony, verified on P1 ticket #48663).** The handler card and the ticket both claim a text "has been sent" when nothing was sent (log-mode). Trust + audit-integrity defect.

**Root cause (code-confirmed, incl. the CT-2 sequencing nuance).**
1. `escalateP1` seeds `dispatchOk: false` (`escalation.js:68`), then in log-mode `sendViaProvider` merely `console.warn`s and returns *without throwing* (`escalation.js:44-46`), so control falls through to `entry.dispatchOk = true` (`escalation.js:74`). **A no-op is recorded as a successful dispatch.**
2. The card reads "A text message has been sent…" and only appends a failure tag when `!res.p1.dispatchOk` — never true in log-mode (`flows.js:153`).
3. The transcript pushes `P1 escalation → SMS dispatched to on-duty manager` **unconditionally** (`routes/api.js:239`).
4. **The sequencing wall:** the transcript is built at `routes/api.js:254` and baked into the ticket's `[TRG]` first comment at `:256`, but `escalateP1` — the only thing that sets `dispatchOk` — does not run until `:268`, **after** the ticket exists. So `dispatchOk` **genuinely does not exist at transcript-build time.** A conditional on the existing `:239` line is impossible; the value isn't there yet.

**Approach — three coordinated changes. Keep the `[TRG]` first comment honest, then correct via a second comment (the proven late-sync pattern). No reorder of ticket creation.**

There is an existing, gate-approved precedent for exactly this shape: `addLateSyncNote` (`zendesk.js:320-329`) appends a **second** `[TRG]`-prefixed internal comment *after the fact* when a device confirms late, deliberately leaving the frozen first comment untouched to preserve the oversight parse. 11c reuses that pattern. This is preferred over reordering the send *before* transcript build because (a) it does not disturb the freeze-critical first-comment ordering, (b) it keeps ticket creation and dispatch independently traceable, and (c) it mirrors code the panel already accepted.

**Change 1 — stop the transcript claiming a send it can't yet vouch for (`routes/api.js:239`).**
The unconditional line asserts a dispatch that hasn't happened. Replace the *assertion* with a *neutral, true-at-build-time* line that records the P1 was *raised* (which is true), not that SMS was *sent*:
```
if (type === 'escalate-p1') steps.push({ time: hhmm(outcomeTime), text: 'P1 escalation raised — on-duty manager to be paged' });
```
This is true regardless of provider and does not perturb the `Outcome:` code parse (the freeze anchor is a separate line; QA-3). The *actual* send result is then written by Change 2.

**Change 2 — corrective post-dispatch comment (new `zendesk` helper, called after `escalateP1`).**
Add a helper modelled on `addLateSyncNote`, e.g. `addP1DispatchNote(ticketId, p1)`, and call it in `routes/api.js` immediately after `escalation.escalateP1(...)` returns (`:268`), before the response. It appends a **second** internal comment stating the true result:
- **On a genuine send** (`p1.dispatchOk === true` AND `p1.provider !== 'log'`): `[TRG] P1 SMS SENT to on-duty manager (<name>) at <hh:mm>. #ooh-p1-dispatch`
- **On log-mode** (`p1.provider === 'log'`): `[TRG] ⚠️ P1 SMS NOT SENT — gateway in log mode. ACTION NEEDED: phone the on-duty manager now on <number-status>. #ooh-p1-dispatch` — states the **next action** (CX-2), the P1 stays visibly recorded.
- **On send failure** (`dispatchOk === false`, provider `twilio`): `[TRG] ⚠️ P1 SMS FAILED to send — chase the on-duty manager by phone now. #ooh-p1-dispatch` (mirrors the existing `raiseAlert('sms-dispatch-failed', …)` at `escalation.js:77`).

This comment is the durable, honest record. Like reconciliation and the SMS log (`routes/api.js:290-308`), it must **never block or fail the outcome** — wrap in try/catch, log + alert on failure, return the ticket regardless. Never persist the raw phone number (mirror `escalation.js:64` — use the `(configured)`/`(not configured)` status).

**Change 3 — make log-mode NOT a send + gate the card honestly.**
- **`escalation.js:44-46`:** log-mode must not report success. Cleanest: return `{ provider: 'log', sent: false }` from `sendViaProvider` and set `entry.dispatchOk = (result.sent !== false)` — so `dispatchOk` is true **only** on a genuine transmission (twilio 2xx), false in log-mode. (Alternative: keep `dispatchOk` as pure transmit-success but have the card/comment also read `provider` — either works; the design intent is that **log-mode ⇒ dispatchOk-not-true**, so the card never claims a send.) Keep the existing throw-on-twilio-error path (`escalation.js:36`, `:75-78`) intact.
- **`flows.js:153` (card):** it already reads `res.p1.dispatchOk` for the failure tag; invert the copy so the **positive** "has been sent" claim is *also* gated on `dispatchOk`. When not sent, the card states the next action ("**Text not sent — phone the on-duty manager now.** The P1 is logged as ticket #…") rather than "has been sent". `res.p1.dispatchOk` and `res.p1.provider` are exposed at `routes/api.js:312` (add `provider` to that response object — one field).

**Net effect.** The `[TRG]` first comment is now true when written (P1 raised, no false SMS claim); a second `#ooh-p1-dispatch` comment carries the *actual* dispatch result; the handler card tells the truth and, when nothing was sent, tells the handler what to do instead. **This is correct in log-mode today (11c) and stays correct the moment the gateway is enabled (11b) — no further change needed** when 11b flips.

**Edge cases.**
- P1 ticket created but `escalateP1` throws before returning: `escalateP1` already swallows send errors internally and returns the entry (`escalation.js:72-85`), so `p1` is non-null; the corrective comment runs. If the whole call rejected, the try/catch around Change 2 keeps the outcome intact.
- Freeze rule: neither Change 1 nor the second comment touches the `Outcome:` anchor line — parse preserved (QA-3). Build must assert this in a test.
- `dispatchedAt` for the card timestamp (`flows.js:153`) still comes from `res.p1.dispatchedAt` — unaffected.

---

## 3. Decision points for the design gate

| # | Decision | Owner | Design recommendation |
|---|---|---|---|
| **D-10a** | Echo the handler's typed words on the **confirmation card** (not only the ticket)? | Gate | **YES** — trust criterion verifiable at the handler's screen; low cost. |
| **D-10b** | Add an optional "notes for the IoT team" outcome-compose field? | Gate | **NO for R1** — not needed to fix Test 10; adds surface. Defer. |
| **D-11a-1** | **WHICH welfare flows warrant auto-P1** (heating / fan / hot-water / lighting)? | **James + Sam** | Default: heating (total-loss + vulnerable/hard-freeze) = P1; fan (active-cooking gas-safety) = P1; hot-water = NOT auto-P1; lighting = NOT auto-P1; connectivity/other = NOT auto-P1. Gate accepts or amends. |
| **D-11a-2** | Escape-hatch UX — placement + copy of the reason-tagged confirm-prompt. | Gate | Confirm-with-mandatory-reason on every non-P1 outcome card; `p1Reason:'operator-override'`; audited. Not a bare button. |
| **D-11b** | Go/no-go #4 — enable the real gateway? Is `ESCALATION_ONDUTY_NUMBER` confirmed? Creds present? | **James / Spencer (OOHDASH-73)** | Design is switch-on-when-ready; no-go ⇒ 11b defers, 11c ships anyway. |

---

## 4. Test plan

**Unit tests (`npm run test:unit`, `test/*.test.js`).** New/changed files:

| Item | Test file | Assertions |
|---|---|---|
| **Test 10** | `test/outcome-callerwords.test.js` (new) | (a) A tile-started flow submitting an outcome sends `callerWords` = the typed text (proves the routing carry). (b) `buildTrgBody` emits a `Caller's words: "…"` line when present and omits it when absent (guard `zendesk.js:246`). (c) Speech containing a quote/apostrophe survives round-trip (no attribute-injection). |
| **Test 10 card echo** | same file / DOM-level | If unit-testable at the render layer: `finishOutcome` card HTML contains the caller words when `freeText` present, nothing when empty. Otherwise cover in the Playwright re-test. |
| **Test 11a** | `test/p1-eligibility.test.js` (new) | (a) The three existing P1 flows still submit `type:'escalate-p1'` (regression guard). (b) A welfare flow submits P1 **only** on the qualifying branch and capture/scope otherwise. (c) `p1Reason` is present on every P1 payload and reaches the audit entry (`routes/api.js:280-286`). (d) Escape-hatch: an override submission carries `p1Reason:'operator-override'` + the typed reason and is de-duped under a distinct key. |
| **Test 11b** | `test/config.test.js` (extend existing) + `test/escalation-provider.test.js` (new) | (a) `SMS_PROVIDER=twilio` with full creds selects the twilio branch; missing creds throws the configured error (`escalation.js:36`). (b) Startup config-guard flags a half-configured twilio gateway. (c) `log` provider selected by default. |
| **Test 11c** | `test/p1-dispatch-honesty.test.js` (new) | (a) Log-mode ⇒ `dispatchOk` is **not** true (Change 3). (b) The transcript no longer contains the unconditional "SMS dispatched" assertion; it contains the neutral "P1 escalation raised" line (Change 1). (c) `addP1DispatchNote` writes the correct second comment for each of {sent, log-mode, failed}, and the log-mode/failed variants state the next action (phone the manager). (d) **Freeze guard:** the `[TRG]` first comment still parses `Outcome:\s*([\w-]+)` unchanged after both changes (QA-3). (e) The corrective-comment failure path never fails the outcome (try/catch). |

Model the new tests on existing ones: `test/zendesk.test.js` (fixture-mode ticket + comment assertions), `test/config.test.js` (env → config), `test/late-sync-alert.test.js` (corrective-comment pattern — directly analogous to Change 2).

**Live re-test (Playwright / handler login — cannot be done headlessly, state doc §3):**
- **Test 10:** log in as a B2C handler, type caller words, click a **category tile** (not the chip), complete an outcome → verify the words appear on the confirmation card AND in the ticket's `[TRG]` `Caller's words:` line. Repeat via the chip (regression).
- **Test 11a:** exercise each signed-off welfare flow's qualifying + non-qualifying branch; verify P1 vs capture. Exercise the escape-hatch (reason mandatory; audit entry tagged `operator-override`).
- **Test 11c:** raise a P1 in log-mode → card says "not sent — phone the on-duty manager", ticket has the neutral first-comment line + the `#ooh-p1-dispatch` "NOT SENT" second comment. Re-read Tony's ticket #48663 semantics.
- **Test 11b (only after go-live):** with `SMS_PROVIDER=twilio` + creds, raise a P1 → real text received; card says "has been sent"; second comment says "SMS SENT".

---

## 5. Sequencing & dependencies

| Item | Gate | Ship |
|---|---|---|
| **Test 10** (routing + card echo) | **None** — in-repo, no external party | **SHIP NOW.** Must land before any write-flip (so the latent control-path drop never reaches a real control ticket). |
| **Test 11c** (dispatch honesty) | **None** — in-repo, no external party | **SHIP NOW, DECOUPLED FROM 11b.** Correct in log-mode; auto-correct the moment 11b flips. |
| **Test 11a** (auto-P1) | **James + Sam** sign-off on welfare-flow selection (H1). The three existing P1 flows need no sign-off. | Existing-3 ready now; welfare flows build once the flow set is confirmed. |
| **Test 11b** (real gateway) | **James / Spencer** — OOHDASH-73 #4, on-duty number, creds (K2) | Enable when creds land; no-go ⇒ defer, 11c still ships. |

**Confirmed:** 11c ships **independently** of 11b. 11c makes the app truthful in log-mode; 11b, when enabled, is then automatically reflected as a genuine send by the same 11c machinery — no rework.

**Recommended build order:** (1) Test 10 + Test 11c together (both in-repo trust/audit fixes, both improve integrity, neither waits on anyone). (2) Test 11a existing-3 verification in parallel; welfare flows on James+Sam sign-off. (3) Test 11b config/secret op when OOHDASH-73 lands.

---

## 6. Risk & rollback

| Risk | Likelihood | Mitigation / rollback |
|---|---|---|
| Test 10 routing breaks the chip path (shared indirection) | Low | Chip and tile use separate wrappers/testids; unit test asserts both carry text; chip path unchanged. Rollback = revert the one-line `views.js:177` edit. |
| Quote/apostrophe injection via typed text | Low (guarded by design) | Text never enters the `onclick` attribute (state indirection, `flows.js:35-38`); `esc()` on all render. Unit test (c). |
| 11c second comment perturbs the freeze parse | Low | Correction is a *separate* comment; first comment's `Outcome:` anchor untouched. Freeze-guard unit test (QA-3). |
| 11c corrective-comment write fails and breaks the outcome | Low | try/catch + `raiseAlert`, return ticket regardless (mirrors reconciliation/SMS). |
| 11a over-pages (welfare flow fires P1 too readily) | Medium | Qualifying question gates the P1 branch; James+Sam sign off the exact trigger; `p1Reason` makes over-firing visible in reporting; rollback = disable the welfare branch (existing-3 unaffected). |
| 11a escape-hatch abused as a generic P1 button | Low | Mandatory typed reason + confirm step + `operator-override` audit tag; distinguishable from system P1s. |
| 11b enabled with a wrong/unset on-duty number | Medium | Startup config-guard + `/api/admin/sms-log` `(configured)` indicator; go/no-go #4 verifies the number before flip. |
| 11b live text sent to a UAT/wrong recipient | Low | On-duty number is an env secret verified at go/no-go; deep-link base-url guard already exists (`config.js:111,163`). |

**Rollback posture:** every change is additive and independently revertible. Test 10 = 1–2 line front-end + one card line. Test 11c = one transcript line + one new (fail-safe) comment helper + one escalation-return change + one card copy change. Test 11a existing-3 = no change; welfare flows = self-contained flow branches. Test 11b = config/secret only. No schema change, no write-flip, no migration.

---

*All line numbers read firsthand 2026-09-18 against the current working tree on `main` (deployed image `dce9ea0`). Writes remain LOCKED — no write-flip is proposed; the Test-10 secondary control-path fix is explicitly deferred to the write-enable workstream. This artefact changes no application source, opens no PR and raises no gate — the Orchestrator governs those.*
