<!-- gate:contract
SECTION Blockers first: Two external dependencies sit outside this repo (IoT platform / Spencer). K1: Test 5/6 device coverage is blocked because the integration-bridge only ever emits Salus thermostats and is currently unhealthy — coverage stays parked. K2: enabling the real SMS gateway (now IN SCOPE per D2) carries external preconditions Design must land — the OOHDASH-73 go/no-go sign-off, a confirmed on-duty number, and provider credentials. Read these before the per-item detail.
SECTION What this is: A forensic current-state discovery for OOHDASH-77 — Tony Willetts' four outstanding Tier-1 tester-feedback items (Tests 5, 6, 10, 11 from the OOHDASH-72 test pack). It frames each problem; it does not design or build. Every finding is traced to a file:line and/or a live-system observation (live /healthz + the nine real outcome tickets Tony raised on 11 Sep, read back firsthand from Zendesk), or marked UNVERIFIED with the exact probe + owner.
SECTION What we found (plain English): Test 10 is a REAL app defect — but not the one first drafted. After gate-panel challenge (CT-1), the reconciled root cause (§1) is that when a handler types the issue into the search box and then clicks a category tile (rather than the "Sounds like" suggestion), their typed words are silently discarded (`views.js:177`) — reproducible today and an exact match for Tony's complaint. A separate, lower-severity control-path note-drop is real but latent under the write-lock. The fix is routing-only; no new note field is needed. Test 11 splits three ways: the P1 route is system-driven and now being widened to the flows that warrant it; a real SMS gateway is being enabled this release; and the app currently tells the handler and the ticket a text "has been sent" when it has not — a fixable honesty defect that (per CT-2) needs an escalate/ticket reorder, not a one-liner. Tests 5 and 6 are the device-coverage gap: the bridge only carries Salus heating, so everything else honestly shows "not on Lighthouse here" — an IoT-platform data gap, not an app bug, with a copy/scope-honesty polish available now.
SECTION Operator decisions RESOLVED (2026-09-16): James has made the scope calls. D1 (P1 route) = SYSTEM-DRIVEN: no generic "escalate as P1" button; instead audit the flows and auto-invoke P1 on the ones that warrant it — a candidate flow→P1 mapping is in §2a. D2 (SMS) = ENABLE A REAL GATEWAY THIS RELEASE (external preconditions recorded). D3 (Tests 5/6) = PROVISIONAL: ship the in-repo scope-tile copy-honesty pass now, coverage stays parked on the bridge. D4 (Test 10 content) = applied ticket carries the full action trail PLUS the typed note PLUS the hold line.
SECTION Classification of the four (post-decision): Test 10 = IN-REPO DEFECT (fixable this release). Test 11a (P1 route) = IN-SCOPE this release, SYSTEM-DRIVEN — auto-P1 on warranted flows per the §2a mapping (some rows need James/Sam confirmation). Test 11b = IN-SCOPE this release: the false "SMS sent" claim is an in-repo fix that folds into "dispatchOk must reflect an actual send", and a real gateway is enabled (external preconditions carried by Design). Test 5 = EXTERNAL-BLOCKED (Spencer/IoT, bridge coverage). Test 6 = copy-honesty pass IN-SCOPE now (D3 provisional); coverage parked on the bridge.
SECTION Requirements suite: The curatable findings/requirements, each separable so you can keep, cut, or defer item by item, each with its outcome and source.
SECTION Operator decisions (all made): The four decisions James was asked are recorded in §6 — D1 (P1 route) and D2 (SMS) RESOLVED; D3 (Tests 5/6 copy pass) and D4 (applied-ticket content) PROVISIONAL, to re-confirm at the gate.
SECTION Options and risks: The real choices per item with their trade-offs, plus the risk register.
SECTION Scope for design: Which items are ready to hand to Design now versus parked on the bridge/product decisions, plus the CX and test scope handed on.
SECTION Next step: The recommended first move and why.
SECTION Accept-with-conditions register: The independent discovery-gate panel returned PASS-WITH-CONDITIONS. §11 records the nine conditions (CT-1..3, QA-2/3, CX-1..4, D2-risk) as OPEN/TRACKED, each with an owner and the stage it gates. None is closed by acceptance.
DECISION Test 10 fix (RECONCILED, CT-1): The primary, reproducible defect is the smart-entry drop on the category-tile path (`views.js:177` omits `state.smartEntryText`), which matches Tony's symptom; a secondary control-path synthesised-detail drop is latent under the write-lock. Fix is ROUTING-ONLY — no new handler-note field (D4 corrected). The one open Design question: whether to additionally add an explicit outcome-compose notes field (optional).
DECISION P1 route (Test 11a) — RESOLVED (D1): SYSTEM-DRIVEN. No generic operator "escalate as P1" button. Auto-invoke P1 on the flows that warrant it; §2a holds the candidate flow→P1 mapping (contractor/fridge/kitchen already P1; heating/fan/lighting/hotwater welfare-safety candidates need James/Sam confirmation). IN-SCOPE this release.
DECISION SMS (Test 11b/c) — RESOLVED (D2): enable a real gateway THIS release. External preconditions Design carries: OOHDASH-73 go/no-go #4, ESCALATION_ONDUTY_NUMBER confirmed, provider creds. The honesty fix (dispatchOk must reflect an actual send) folds in and ships with it.
DECISION Tests 5/6 (device coverage) — D3 PROVISIONAL: ship the in-repo scope-tile copy-honesty pass now; substantive coverage stays EXTERNAL-BLOCKED on the bridge emitting non-Salus devices (Spencer/IoT, OOHDASH-75/76). Re-confirm at the gate.
-->

# Discovery — Tester Feedback (OOHDASH-77, Tony Willetts Tier-1 items)

**Release:** OOH Triage Dashboard — live-control · **Stage:** Discovery · **Date:** 2026-09-16
**Scope:** the four outstanding Tier-1 items from the OOHDASH-72 test pack — Test 5 (read live device status), Test 6 (Lighthouse scope tiles), Test 10 (record an outcome), Test 11 (escalate a P1). Frame only; no design, no build.
**Repo state (verified):** `main`, app v1.2.0, AKS, `WRITES_DISABLED=true`, `SMS_PROVIDER=log`, `DATA_MODE=live` (live `/healthz` + CIR `OOH_DASHBOARD_DEPLOY.md:51`).
**Method:** verified against deployed source on `main`, the live app `/healthz`, the nine real outcome tickets Tony raised on 2026-09-11 (read back via the Zendesk API), and `docs/BRIDGE_CONTRACT.md`. Anything not confirmable firsthand is marked **UNVERIFIED** with the exact probe + owner.
**Verification legend:** `code` = traced to deployed source; `live` = observed on the running system today; `code+live` = both.

> This artefact does not open a PR or a gate and does not edit application source — the Orchestrator governs those. It references the `RELEASE_CONDITIONS_REGISTER.md` rows (B2, R7, R10, C8) by ID rather than re-pasting them.

---

## 0. Blockers first (each with owner)

Neither closes from this repo. Both are IoT-platform-owned.

<table>
<thead><tr><th>#</th><th>Blocker</th><th>Current state</th><th>Confirming probe</th><th>Owner</th></tr></thead>
<tbody>
<tr><td>K1</td><td><strong>Test 5/6 device coverage — the bridge only carries Salus.</strong> No boiler/tuya/kitchen/lighting/fan device is on the wire, so it can never render; and the bridge is currently unhealthy.</td><td><strong>EXTERNAL data gap + UNVERIFIED transport.</strong> Live <code>/healthz</code> shows <code>bridge.healthy=false</code> with <code>lastError=null</code> — the same lazy-flag pattern as the TB creds (no successful inventory read since boot, `bridge.js:26`), so this is not even proof the transport is down. The contract itself lists only Salus vendors (`docs/BRIDGE_CONTRACT.md:50-65`).</td><td>From the pod: <code>GET {BRIDGE_BASE_URL}/api/devices</code>; confirm 200 + a flat array, and whether any non-Salus <code>vendorId</code> is ever emitted. Same probe as register <strong>B2</strong> / OOHDASH-75; coverage owned by OOHDASH-76.</td><td>Spencer / IoT platform</td></tr>
<tr><td>K2</td><td><strong>Test 11b enable preconditions (SMS now IN SCOPE, D2).</strong> Today <code>SMS_PROVIDER=log</code> records the dispatch but sends nothing; enabling a real gateway needs three external things confirmed before it can go live.</td><td><strong>EXTERNAL preconditions.</strong> <code>sendViaProvider()</code> log-branch only <code>console.warn</code>s (`escalation.js:44-46`); the Twilio path exists (`escalation.js:34-42`); provider default is <code>log</code> (`config.js:100`) and the live manifest sets it (CIR `OOH_DASHBOARD_DEPLOY.md:51`).</td><td>(1) OOHDASH-73 go/no-go #4 sign-off; (2) <code>ESCALATION_ONDUTY_NUMBER</code> confirmed — <strong>UNVERIFIED</strong>, probe admin <code>/api/admin/sms-log</code> shows <code>sentToNumber</code> "(configured)"/"(not configured)" (`escalation.js:64`) or read the secret; (3) provider creds present (`config.js:101-104`).</td><td>Spencer / James</td></tr>
</tbody>
</table>

---

## 1. Test 10 — record an outcome (typed notes dropped)

**Verbatim tester quote:** *"Ticket was raised but it didn't include the actual notes I typed."*

**Classification: `IN-REPO DEFECT (fixable this release)` — reconciled after gate-panel review (CT-1).** The panel correctly challenged my first draft: I had conflated two different fields. This section is the end-to-end reconciliation across **all** front-end outcome paths (`public/js/*`), not just control.

### 1.1 End-to-end trace — every handler-typed field, and where it goes

There are exactly five free-text inputs a handler can type into on an outcome path, plus two non-outcome inputs. Every one was traced to the wire:

<table>
<thead><tr><th>Typed input (src)</th><th>Maps to</th><th>Reaches the ticket?</th></tr></thead>
<tbody>
<tr><td><strong>Smart-entry box</strong> <code>#iq</code> (`views.js:175` → `issueSearch` → <code>state.smartEntryText</code> `flows.js:38`)</td><td><code>freeText</code> → <code>callerWords</code></td><td><strong>DROPPED on the category-tile path</strong> — see §1.2</td></tr>
<tr><td><code>other</code> textarea <code>#otxt</code> (`flows.js:473`)</td><td><code>f.data.q</code> → <code>detail</code></td><td>Yes (non-control else-branch, `api.js:224`)</td></tr>
<tr><td><code>contractor</code> inputs <code>#cn</code>/<code>#cw</code> (`flows.js:457-458`)</td><td>interpolated into <code>detail</code> (`flows.js:464`)</td><td>Yes</td></tr>
<tr><td><code>fan</code> input <code>#fannote</code> (`flows.js:380`)</td><td><code>f.data.note</code> → <code>detail</code></td><td>Yes</td></tr>
<tr><td>Control compose (stepper/hold) — <strong>no free-text field exists</strong> (`control.js` compose, :137-155)</td><td><code>detail</code> is machine-synthesised (`control.js:332` ctlFinish, `:369` ctlEscalate)</td><td>Synthetic detail DROPPED on control outcomes — see §1.3</td></tr>
<tr><td>(non-outcome) ticket feedback note <code>#notebody</code> (`views.js:261` → <code>/tickets/:id/notes</code>)</td><td>forwarded body (`zendesk.js:300-303`)</td><td>Yes — separate feature, works</td></tr>
<tr><td>(non-outcome) Tonight "raise a query" <code>#qtxt</code> (`views.js:388` → <code>/api/query</code>)</td><td>forwarded</td><td>Yes</td></tr>
</tbody>
</table>

### 1.2 The verified defect that MATCHES Tony's symptom (primary — reproducible NOW)

**The category tiles silently discard the handler's typed smart-entry text.** Verification: **code-confirmed, reproducible on current code (non-control path).**

- The smart-entry box stores what the handler types in `state.smartEntryText` (`flows.js:38`).
- The **"Sounds like…" suggestion chip** carries it forward: `startSuggestedFlow` → `startFlow(k, state.smartEntryText)` (`flows.js:51-53`).
- The **category tiles** do **not**: `views.js:177` renders `onclick="startFlow('${c.k}')"` with **no second argument**, so `startFlow(k, undefined)` sets `f.data.freeText = ''` (`flows.js:56-57`). On outcome it then goes out as `callerWords: f.data.freeText || null` = **null** (`flows.js:123`) — the typed text never reaches the server, and the ticket gets **no `Caller's words:` line**. That is exactly *"didn't include the actual notes I typed."*

**This reconciles the nine tickets.** The tickets that *retained* text did so through a **separate in-flow field** (`detail` from `other`/`contractor`/`fan`), not the smart-entry text — e.g. #48658 "General issue captured / Caller reported: Pasta cooker didnt turn on" has a `Caller reported:` detail line (re-typed inside the `other` flow) but **no `Caller's words:` line**, the tell-tale of a tile entry where the original smart-entry text was dropped. Six of the nine (#48664, 48661, 48660, 48658, 48657, 48663) carry no `Caller's words:` line at all. So my earlier "all 9 retained their detail" was true but about the wrong field: `detail` survived; the **smart-entry `callerWords` did not** on the tile path. **Tony's symptom IS reproducible on current code.**

### 1.3 The secondary defect (control-linked — real but lower-severity, latent under the write-lock)

On any outcome carrying an `actionId`, `buildOutcomeTranscript` takes the **action branch** (`api.js:214-221`) which builds the structured trail (Site → Zone → Live read → Dispatched → Sync → Hold) and **never pushes `detail`/`holdText`**; the `/outcomes` handler also never passes `detail` to `createOutcomeTicket` as a fallback (`api.js:244-252`). But — as the panel noted — on the control path **there is no handler-typed note**: `detail` is machine-synthesised (`control.js:332`, `:369`) and largely duplicates the trail. The only material loss is on the **control-FAILURE** path (`ctlEscalate`, `control.js:369`) where the synthesised *"must be treated as not applied"* line is dropped — though the `failed`/`rejected`/`timeout` Sync line still conveys the failure state. Latent today: `WRITES_DISABLED=true` blocks every dispatch (`control.js:52-56`), so no control outcome can be produced.

### 1.4 Re-scope + D4 correction (KEY DESIGN DECISION)

**T10 is a routing-only fix on two fronts, NOT a new handler-note UI field:**
1. **Primary:** category tiles must carry `state.smartEntryText` into `startFlow`, exactly as the suggestion chip does (`views.js:177` ↔ `flows.js:52`). Fixes Tony's reported symptom.
2. **Secondary:** carry the synthesised `detail`+`holdText` line on control-linked outcomes (`api.js:214-221`), material on the control-failure path.

**D4 corrected.** D4 as previously worded ("carry the typed note") presumed a control-path note field that **does not exist**. The accurate D4 is: *applied/failed control tickets carry the full action trail plus the synthesised detail+hold line* — no new input. **Recommendation: routing-only, no new note field.** The KEY Design decision to flag: whether to *additionally* add an explicit "notes for the IoT team" field to the **outcome-compose** step (precedent exists — the post-hoc feedback-note textarea at `views.js:261`). Discovery's recommendation: **not required** to fix Test 10; treat as optional enhancement scope, decided at Design.

**Probes.** Primary is verifiable today: type into smart-entry, click a category tile (not the suggestion), complete any capture outcome, inspect the `[TRG]` — no `Caller's words:` line. Secondary needs `WRITES_DISABLED=false` on a bench device to produce a control outcome.

---

## 2. Test 11 — escalate a P1

**Verbatim tester quote:** *"Can only raise P1 through 'Contractor on site'… does raise a P1 but doesn't send text."*

This splits into three findings with three different classifications.

### 2a. P1 route — `IN-SCOPE this release, SYSTEM-DRIVEN` (D1 RESOLVED)
Verification: **code+live**.

**Decision (D1, James, 2026-09-16): keep P1 system-driven — no generic "escalate as P1" button** (abuse / mis-fire risk). Instead: audit the flows the tool supports, decide which warrant an **automatic** P1, and have P1 auto-invoke when the handler follows such a flow. The task below is the framing for that; the mechanism is Design's.

**Verified current state.**
- P1 is **system-decided in the flows** by design (`services/escalation.js:4-6`). Exactly **three** flow branches mint a P1 (call `outcomeP1`): **contractor** (always, `public/js/flows.js:462`), **fridge / stock-at-risk** (always — not device-gated, `flows.js:395-410`), and **kitchen-critical** (only when kitchen devices exist; returns early with no P1 path when `!ks.length`, `flows.js:314,326`). The server raises P1 for **any** `type === 'escalate-p1'` (`routes/api.js:237,255-257`) — so P1 eligibility lives entirely in the **front-end flow definitions**.
- **Why the tester saw only "Contractor".** In live inventory (Salus-only, K1) there are no kitchen devices, so the kitchen-critical P1 path is unreachable; the fridge P1 path *is* reachable but was evidently not exercised. Live corroboration: of Tony's nine tickets exactly **one** is `escalate-p1` — #48663, the contractor flow.

**Candidate flow → P1 mapping (framing for Design — names + rationale only, not the mechanism).** Every handler flow the tool supports is the category set `CATS` (`flows.js:9-18`) plus the system-triggered `connectivity` check (`flows.js:19`). "P1 today" = mints `outcomeP1` on `main` now; "Candidate auto-P1" = discovery recommendation for the D1 audit; rows marked **CONFIRM** need James/Sam product sign-off (they imply a *new* signal the flow does not capture today, e.g. occupant vulnerability).

<table>
<thead><tr><th>Flow (src)</th><th>What it is</th><th>P1 today?</th><th>Candidate auto-P1?</th><th>Rationale / condition</th><th>Status</th></tr></thead>
<tbody>
<tr><td><strong>contractor</strong> (`flows.js:454-468`)</td><td>Engineer on site now needs Lighthouse/BMS info</td><td><strong>Yes</strong> (`flows.js:462`)</td><td>Keep — always P1</td><td>Engineer physically waiting on site; time-critical</td><td>Already P1</td></tr>
<tr><td><strong>fridge</strong> — stock-at-risk (`flows.js:395-410`)</td><td>Refrigeration alarm / warming, stock at risk</td><td><strong>Yes</strong> (`flows.js:405`)</td><td>Keep — P1 on the "stock at risk" branch only</td><td>Stock loss is imminent and irreversible; "just a query" branch stays non-P1 (`flows.js:412`)</td><td>Already P1</td></tr>
<tr><td><strong>kitchen</strong> — critical-during-service (`flows.js:311-343`)</td><td>Kitchen circuits off while actively serving</td><td><strong>Yes</strong>, when kitchen devices exist (`flows.js:314,326`)</td><td>Keep — P1 on "business critical now" branch</td><td>Business-critical kitchen during service; unreachable live only because no kitchen devices are on the bridge (K1)</td><td>Already P1 (coverage-gated)</td></tr>
<tr><td><strong>heating</strong> (`flows.js:179-264`)</td><td>Too cold/hot, off, not working; can control setpoint/frost</td><td>No</td><td><strong>CONFIRM</strong> — P1 only on a narrow "no heat + vulnerable occupants / freezing" sub-branch</td><td>Total heat loss with vulnerable occupants (care/elderly/hotel guests) or hard-freeze risk is a welfare/safety case; ordinary cold-building is not. Needs a vulnerability/severity signal the flow does not capture today</td><td>CONFIRM (James/Sam)</td></tr>
<tr><td><strong>fan</strong> (`flows.js:374-393`)</td><td>Extractor fans on/off / wrong times</td><td>No</td><td><strong>CONFIRM</strong> — P1 only if fans are needed for active cooking/gas safety right now</td><td>The flow copy already invokes "cooking safety" (`flows.js:388`); an active gas-safety case may warrant P1, a scheduling request does not</td><td>CONFIRM (James/Sam)</td></tr>
<tr><td><strong>lighting</strong> (`flows.js:345-372`)</td><td>External / car-park lights out</td><td>No</td><td><strong>CONFIRM</strong> — likely NOT P1; possible edge for premises-dark safety/security</td><td>Mostly next-day capture; a dark frontage as a lone-worker/security risk is the only P1 argument — low</td><td>CONFIRM (low)</td></tr>
<tr><td><strong>hotwater</strong> (`flows.js:266-309`)</td><td>No / not enough / too-hot water; can boost if controllable DHW</td><td>No</td><td><strong>CONFIRM</strong> — likely NOT P1; possible edge for a care setting</td><td>Generally next-working-day; a vulnerable/care setting with no hot water is the only P1 argument — low</td><td>CONFIRM (low)</td></tr>
<tr><td><strong>connectivity</strong> (`flows.js:421-452`)</td><td>Gateway / equipment offline (system-triggered check)</td><td>No</td><td>No</td><td>Offline gateway means no remote action is possible at all; it is a capture-and-escalate, not itself an emergency, unless it blocks one of the P1 cases above</td><td>Recommend no</td></tr>
<tr><td><strong>other</strong> (`flows.js:470-514`)</td><td>Free-text "something else / not sure"; scope check</td><td>No</td><td>No</td><td>Deliberately generic — auto-P1 here would recreate the generic-escalate button James rejected</td><td>Recommend no</td></tr>
</tbody>
</table>

> **Cross-cutting note for Design.** The three "CONFIRM" welfare/safety candidates (heating, fan, hotwater) all imply a signal the flows do **not** capture today — occupant vulnerability or an active-safety condition. Auto-P1 on those cannot be a pure routing change; it needs a new decision point in the flow. That is Design's to shape; Discovery only names the candidates and the missing signal.

**Root cause of the original complaint.** P1 eligibility is hard-coded in only three flow branches and two of them are unreachable/unexercised in live Salus-only inventory, so the route *looked* contractor-only. The fix is to extend auto-P1 to the warranted flows above (D1), not to add an operator button. Relates to OOHDASH-73.

### 2b. Send a real P1 text — `IN-SCOPE this release` (D2 RESOLVED)
Verification: **code+live**.

**Decision (D2, James, 2026-09-16): enable a real SMS gateway this release.** Live SMS is in scope, not parked. Today `SMS_PROVIDER=log` → `sendViaProvider` sends nothing (`escalation.js:44-46`); the Twilio path already exists (`escalation.js:34-42`) and is selected by config (`config.js:99-108`).

**External preconditions Design must carry (do not close from this repo):**
- **OOHDASH-73 go/no-go #4 sign-off** on the SMS gateway (owner Spencer / James).
- **`ESCALATION_ONDUTY_NUMBER` confirmed set** — UNVERIFIED today; probe: admin `/api/admin/sms-log` shows `sentToNumber` as "(configured)"/"(not configured)" (`escalation.js:64`), or read the k8s secret.
- **Provider credentials** (Twilio `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM`, or the chosen provider) present in the secret (`config.js:101-104`; `escalation.js:35-36` throws "not configured" if absent).

### 2c. `dispatchOk` must reflect an actual send — `IN-REPO DEFECT (fixable this release)`
Verification: **code+live**. Folds into the D2 gateway work (it is the correctness guarantee that makes a real send trustworthy).

- Under log-mode `sendViaProvider` returns without throwing, so `escalateP1` sets `dispatchOk = true` (`escalation.js:72-74`) — a **no-op is recorded as a successful dispatch**.
- The outcome card then tells the handler *"A **text message** has been sent to the **on-duty escalation manager**"* (`public/js/flows.js:153`), and the ticket transcript carries an **unconditional** line `P1 escalation → SMS dispatched to on-duty manager` (`routes/api.js:227`) regardless of provider.
- **Live proof:** Tony's P1 ticket #48663 contains the literal transcript line `09:47 | P1 escalation → SMS dispatched to on-duty manager` — a written record that a text was dispatched **when the provider is `log` and nothing was sent.**

**Root cause.** The success signal (`dispatchOk`) and the operator/ticket copy do not distinguish "recorded in log-mode" from "actually transmitted". **Fix:** `dispatchOk` must be true only on a genuine transmission (log-mode → not a send); gate the card + transcript line (`flows.js:153`, `api.js:227`) on that signal. This must land alongside the gateway enable so a real send is provably reported and a non-send is never claimed.

---

## 3. Test 5 — read live device status (missing boiler/tuya)

**Verbatim tester quote:** *"Only shows Salus/Accommodation Gateway. No boiler or tuya devices found."*

**Classification: `EXTERNAL-BLOCKED (owner: Spencer / IoT)`.** Verification: **code+live**. This matches the ticket's prior read (B2 / OOHDASH-75; coverage OOHDASH-76) — "not an app-code defect."

**Verified current state.**
- The integration-bridge `/api/devices` contract carries **only** `salus-it500` / `salus-it700` vendors (`docs/BRIDGE_CONTRACT.md:50-65`); "Accommodation Gateway" is a per-device **zone label**, not a device type (`BRIDGE_CONTRACT.md:56`; `bridge.js:72`). No boiler or tuya device is on the wire at all.
- `deriveKind()` maps only Salus → `heating`; **everything else → `unknown`** (`services/bridge.js:43-47`). So even if the bridge began emitting boiler/tuya vendors, the app would classify them `unknown` and they would not surface in scope/flows — a **latent app-side gap**, contingent on the bridge change, not the current blocker.
- **Live now:** `/healthz` reports `bridge.healthy=false` (`lastError=null`), so the site workspace cannot even render device status today — Tests 5/6 are **not re-validatable live** until the bridge read is proven (K1 / B2).

**Root cause.** The device population is defined by the bridge, which emits only Salus; the app cannot invent devices it is not sent. Owner: Spencer / IoT (OOHDASH-75 read + OOHDASH-76 coverage).

**Probe:** K1 (§0). **In-repo follow-on** (only once the bridge emits them): extend `deriveKind` + the registry to model boiler/tuya/kitchen/lighting/fan kinds.

---

## 4. Test 6 — Lighthouse scope tiles

**Verbatim tester quote:** *"Says we only control heating, everything else shows 'not on lighthouse here'."*

**Classification: `PARTIAL / product-decision-needed` (substantive fix depends on K1/B2).** Verification: **code+live**.

**Verified current state.**
- The scope tiles are **presence-driven** (`routes/api.js:129-137`). Heating → `ctl`/`mon`/`none` by device presence; hot water → `ctl` if a controllable DHW device exists else `mon` if a combi hot-water signal exists else `none` (`api.js:131`, via `hasControllableDhw`/`hasHotWaterSignal` `api.js:120-127`); kitchen/lighting/fan → `mon` if present else `none`; **electrics and boiler are hard-coded `none`** (`api.js:135-136`).
- Because live inventory is Salus-heating-only (K1), every non-heating tile computes `none` → the "not on Lighthouse here" copy. This is **honest**, not a bug — it reflects what the bridge provides.
- The "partially improved" hot-water tile the tester noted ("monitored — not adjustable from here") is the `mon` state driven by the combi `hotWater` telemetry signal (`hasHotWaterSignal`, `api.js:125-127`) — the F025 DHW mismatch means hot water can be *monitored* but not *controlled* from live data (`bridge.js:57-67`; register R7/R10/C8).

**Root cause.** Tile breadth is a faithful function of bridge device coverage (K1). Blunt-but-accurate copy is the only in-repo lever available now.

**Fix surfaces.** Substantive breadth: **blocked on B2/K1** (bridge coverage) + the R7 hot-water product/data decision. Optional **in-repo now:** softer/clearer scope copy and earlier hot-water scope guidance (ties to register **R10 / C8** — surface HW out-of-scope *before* compose). Operator decision D3.

---

## 5. Curatable findings & requirements suite

Each row is separable — keep, cut, or defer independently. "Src" is the grounding evidence; "Ver" is verification level.

<table>
<thead><tr><th>ID</th><th>Finding / requirement</th><th>Business outcome</th><th>Class</th><th>Src</th><th>Ver</th></tr></thead>
<tbody>
<tr><td>T10a</td><td><strong>Primary (matches Tony):</strong> category tiles must carry the smart-entry text into <code>startFlow</code> (`views.js:177` ↔ `flows.js:52`), so the handler's typed words reach the ticket as <code>callerWords</code></td><td>The ticket includes the notes the handler typed — the reported bug goes away</td><td>IN-REPO DEFECT</td><td>§1.2</td><td>code (reproducible)</td></tr>
<tr><td>T10b</td><td><strong>Secondary:</strong> carry the synthesised <code>detail</code>+<code>holdText</code> line on control-linked outcomes (`api.js:214-221`), material on the control-failure path. Routing-only, no new field</td><td>Control-failure tickets keep the "treat as not applied" line, not just the Sync trail</td><td>IN-REPO DEFECT (latent)</td><td>§1.3</td><td>code</td></tr>
<tr><td>T11a</td><td><strong>Extend system-driven auto-P1</strong> to the warranted flows per the §2a mapping (keep the three current ones; add the CONFIRM candidates once signed off). No generic operator button (D1)</td><td>A handler following a warranted flow auto-raises a P1 without a mis-fireable manual button</td><td>IN-SCOPE (system-driven)</td><td>§2a</td><td>code+live</td></tr>
<tr><td>T11c</td><td><code>dispatchOk</code> must reflect an actual send; stop the card/transcript claiming a text "has been sent" when none was (`flows.js:153`, `api.js:227`, `escalation.js:72-74`)</td><td>The handler and the ticket never assert an escalation SMS that did not happen — trust + audit integrity</td><td>IN-REPO DEFECT (folds into T11b)</td><td>§2c</td><td>code+live</td></tr>
<tr><td>T11b</td><td><strong>Enable a real SMS gateway this release</strong> (Twilio/chosen provider). External preconditions: OOHDASH-73 go/no-go, <code>ESCALATION_ONDUTY_NUMBER</code> confirmed, provider creds</td><td>The on-duty manager is paged within &lt;1 min of a P1 (OOHDASH-73 outcome)</td><td>IN-SCOPE (external preconditions)</td><td>§2b / K2</td><td>code+live</td></tr>
<tr><td>T5</td><td>Bridge to emit non-Salus devices (boiler/tuya/…); then extend <code>deriveKind</code>/registry to model them</td><td>Handlers see the real device estate for a site, not just Salus heating</td><td>EXTERNAL-BLOCKED</td><td>§3 / K1</td><td>code+live</td></tr>
<tr><td>T6a</td><td>Broaden scope tiles as device coverage grows (depends on T5)</td><td>Scope tiles reflect the true controllable/monitored surface per site</td><td>Depends on T5 (parked)</td><td>§4</td><td>code+live</td></tr>
<tr><td>T6b</td><td>In-repo scope-honesty pass NOW: clearer "not on Lighthouse here" copy + earlier hot-water out-of-scope guidance</td><td>Handlers get honest, pre-compose scope guidance instead of a blunt tile</td><td>IN-SCOPE (D3 provisional)</td><td>§4 / R10,C8</td><td>code</td></tr>
</tbody>
</table>

---

## 6. Operator decisions — resolved (2026-09-16)

All four were put to James; his calls are recorded below. D1/D2 are **RESOLVED**; D3/D4 are **PROVISIONAL** (orchestrator best-judgment, to re-confirm at the gate).

<table>
<thead><tr><th>#</th><th>Decision</th><th>James's call</th><th>Status</th></tr></thead>
<tbody>
<tr><td>D1</td><td>How wide should the P1 route be?</td><td><strong>SYSTEM-DRIVEN, not operator-initiated.</strong> No generic "escalate as P1" button (abuse/error risk). Audit the flows, decide which warrant an automatic P1, and auto-invoke P1 when the handler follows such a flow. See the §2a candidate mapping (CONFIRM rows need James/Sam sign-off).</td><td><strong>RESOLVED</strong></td></tr>
<tr><td>D2</td><td>Is real SMS in scope this release?</td><td><strong>YES — enable a real gateway this release.</strong> External preconditions Design carries: OOHDASH-73 go/no-go #4, <code>ESCALATION_ONDUTY_NUMBER</code> confirmed, Twilio/chosen-provider creds. T11c folds into "dispatchOk must reflect an actual send".</td><td><strong>RESOLVED</strong></td></tr>
<tr><td>D3</td><td>Tests 5/6 — park, or UI-honesty pass now?</td><td><strong>Include the in-repo scope-tile copy-honesty pass now (T6b); coverage stays parked on the bridge/B2 (Spencer/IoT).</strong></td><td><strong>PROVISIONAL</strong> — re-confirm at gate</td></tr>
<tr><td>D4</td><td>What should an applied-control ticket carry?</td><td><strong>CORRECTED after panel review (CT-1):</strong> the control path has no handler-typed note field, so "carry the typed note" presumed an input that does not exist. Accurate scope: applied/failed control tickets carry the full action trail PLUS the synthesised detail+hold line (routing-only, §1.3). Tony's actual symptom is the smart-entry drop (§1.2, T10a). Discovery recommends <strong>no new note field</strong>; whether to add an explicit outcome-compose notes field is the key Design decision.</td><td><strong>PROVISIONAL</strong> — re-confirm at gate</td></tr>
</tbody>
</table>

---

## 7. Options with traceability

**Option set A — Test 10 fix (serves T10a primary + T10b secondary).**
<table>
<thead><tr><th>Option</th><th>Entails</th><th>Cost</th><th>When right</th></tr></thead>
<tbody>
<tr><td>A0 — Carry smart-entry text on the tile path (T10a)</td><td>Category tiles pass <code>state.smartEntryText</code> into <code>startFlow</code> like the suggestion chip does (`views.js:177` ↔ `flows.js:52`)</td><td>Low (front-end routing)</td><td><strong>Required</strong> — this is the fix for Tony's actual reported symptom (§1.2)</td></tr>
<tr><td>A1 — Append synthesised detail in the action branch (T10b)</td><td>Add <code>detail</code> (+ <code>holdText</code>) as transcript line(s) in <code>buildOutcomeTranscript</code> action branch (`api.js:214-221`)</td><td>Low</td><td><strong>Recommended for T10b</strong> — keeps the structured trail and preserves the control-failure "not applied" line; no new field</td></tr>
<tr><td>A2 — Pass detail to createOutcomeTicket (alt to A1)</td><td>Forward <code>detail</code> in the <code>/outcomes</code> call so the existing fallback carries it (`api.js:244-252`, `zendesk.js:218-219`)</td><td>Low</td><td>Simpler diff, but the fallback only fires when the transcript is otherwise empty — needs care so the line isn't lost when a trail exists</td></tr>
<tr><td>A3 — Explicit outcome-compose notes field (optional)</td><td>Add a real "notes for the IoT team" input to outcome-compose (precedent `views.js:261`)</td><td>Medium (new UI + wire)</td><td><strong>Not required</strong> for Test 10; the KEY Design decision if a first-class handler note is wanted beyond fixing the bug</td></tr>
</tbody>
</table>

**Option set B — Test 11b/c SMS (serves T11b, T11c).**
<table>
<thead><tr><th>Option</th><th>Entails</th><th>Cost</th><th>When right</th></tr></thead>
<tbody>
<tr><td>B1 — Honesty fix only</td><td>Gate the card/transcript "sent" claim on a real send; log-mode reads "logged, not sent" (`flows.js:153`, `api.js:227`, `escalation.js:72-74`)</td><td>Low</td><td><strong>Do regardless</strong> — decouples truth from the gateway decision</td></tr>
<tr><td>B2 — Honesty fix + enable gateway</td><td>B1 plus flip <code>SMS_PROVIDER</code>→gateway, confirm <code>ESCALATION_ONDUTY_NUMBER</code>, prove a real send (OOHDASH-73)</td><td>Medium; external dependency</td><td>Only after the go/no-go (D2) and the number is confirmed</td></tr>
</tbody>
</table>

---

## 8. Risk register

<table>
<thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr></thead>
<tbody>
<tr><td><strong>False "SMS sent"</strong> — handler/ticket assert an escalation text that never left (log-mode)</td><td>Certain today (verified live, #48663)</td><td>High — a P1 caller believes the manager was paged when they were not; audit is wrong</td><td>T11c / B1 honesty fix, independent of the gateway decision</td></tr>
<tr><td><strong>Dropped smart-entry note</strong> — handler types the issue, clicks a category tile, the words are discarded (no <code>Caller's words:</code> line)</td><td>Certain on the tile path (verified code, reproducible now)</td><td>Medium-High — the IoT team loses the caller's own words; matches Tony's reported bug</td><td>T10a — category tiles carry <code>state.smartEntryText</code> (`views.js:177`)</td></tr>
<tr><td>Synthesised detail dropped on control-failure outcomes once writes are enabled</td><td>Certain when the write-lock lifts (verified code)</td><td>Medium — "treat as not applied" line lost, though the Sync trail still shows failure</td><td>T10b / A1 before the OOHDASH-19 flip</td></tr>
<tr><td><strong>D2 release risk</strong> — OOHDASH-73 go/no-go is a no-go OR <code>ESCALATION_ONDUTY_NUMBER</code> stays unconfirmed at build time</td><td>Medium</td><td>Medium — real SMS cannot ship this release</td><td><strong>No-go fallback:</strong> T11b defers; T11c/B1 (dispatchOk correctness + honest copy) ships decoupled, so the app is truthful in log-mode. Do not block T11c on T11b.</td></tr>
<tr><td><strong>P1 cannot be raised</strong> for an urgent call no flow pre-covers</td><td>Medium</td><td>Medium-High — a genuinely urgent caller is captured, not escalated</td><td>D1 decision → T11a; interim: contractor/fridge flows still reach P1</td></tr>
<tr><td><strong>Tests 5/6 re-tested against an unhealthy bridge</strong> read as app faults</td><td>Medium</td><td>Medium — misattributed defects, wasted cycles</td><td>Gate re-test on K1/B2 green; document the bridge lazy-flag artefact</td></tr>
<tr><td>In-repo T6b copy diverges from eventual device coverage</td><td>Low</td><td>Low</td><td>Keep copy generic; revisit with T5</td></tr>
</tbody>
</table>

---

## 9. Scope for design

**Ready to hand to Design NOW (in scope this release):**
- **T10a (primary)** — category tiles carry the smart-entry text (`views.js:177`), so the handler's typed words reach the ticket (fixes Tony's symptom). **T10b (secondary)** — carry the synthesised detail+hold line on control-linked outcomes. Routing-only; **no new note field required** (§1.4). Key Design decision to settle: whether to add an explicit outcome-compose notes field (optional, precedent `views.js:261`).
- **T11a** — extend **system-driven auto-P1** to the warranted flows per the §2a mapping (D1 resolved: no operator button). Design shapes the new in-flow decision points the CONFIRM rows need **and the CX-1 audited escape-hatch** so "no button" ≠ "no path"; the three current P1 flows stay.
- **T11b + T11c** — enable a real SMS gateway **and** make `dispatchOk` reflect an actual send (they ship together). Design carries the external preconditions (OOHDASH-73 go/no-go, `ESCALATION_ONDUTY_NUMBER`, provider creds).
- **T6b** — in-repo scope-tile copy-honesty pass + earlier hot-water out-of-scope guidance (D3 provisional; ties to register R10 / C8).

**Needs product confirmation before the T11a CONFIRM rows are built:** James/Sam sign-off on which welfare/safety flows warrant auto-P1 (heating no-heat+vulnerable, fan cooking/gas-safety, lighting/hotwater edges — §2a). The three already-P1 flows do not wait on this.

**Parked (external, coverage only):**
- **T5** and **T6a** — parked on **K1 / B2** (bridge device coverage; Spencer/IoT, OOHDASH-75/76). Re-test only when the bridge read is green. (T6b copy pass proceeds independently.)

**CX success criteria handed to Design (for the in-repo items):**
- **Truthful escalation feedback + next action (CX-2):** the handler is never told a text was sent unless one was; in log-mode / on send-failure the card states the **next action** ("not sent — phone the on-duty manager now on …"), not merely "not sent". The P1 stays visibly recorded. "Great looks like…": a handler always knows whether the manager was paged, and exactly what to do if not.
- **The handler's own words survive, visibly (CX-3):** whatever the handler typed appears on the **confirmation card the handler sees**, not only on the back-office ticket — note retention is a trust criterion, verifiable at the handler's screen. "Great looks like…": no handler discovers their note vanished.
- **P1 has a path even off-flow (CX-1):** system-driven auto-P1 must not strand a genuine P1 on an uncovered/`other` flow. Design adds an **audited, reason-tagged escape-hatch / confirm-prompt** (not a bare button) so the handler is told when a call was *not* auto-escalated and can escalate with a recorded reason.
- **Honest scope routes to the alternative (CX-4):** the "not on Lighthouse here" copy must **point the handler to the available action** (manual override, site's own repairs route), not just declare the gap (R10/C8).

**Data scope note:** no new entities. The `detail`/`callerWords`/`holdText` fields already flow from the client (`public/js/control.js:326-335`, `flows.js:120-125`); T10 is a routing fix, not new data. The P1 SMS log entry shape is `OohSmsLog` (`services/escalation.js:56-70`) — note it already avoids persisting the raw number (`escalation.js:64`).

**End-to-end test scope handed to Design:**
- Applied-control outcome with a typed note → the [TRG] transcript contains that note (T10).
- P1 in log-mode → card + ticket say "logged, not sent"; no "dispatched" assertion (T11c).
- P1 with a real gateway (when enabled) → card + ticket say "sent" only on a genuine send; failure path shows "delivery failed — chase by phone" (existing `flows.js:153`).
- Operator-initiated P1 (if D1 widens it) → escalation reachable from the chosen flows and denied where it should not be.
- Scope tiles honest against whatever the bridge returns; hot-water guidance appears pre-compose (T6b, when in scope).

---

## 10. Recommended next step

With all four decisions made, the sequence is:

**First: land the two in-repo, no-external-dependency fixes — T11c/T10.** T11c (`dispatchOk` reflects a real send; no false "sent" claim) and T10 (carry the typed note + hold line onto control outcomes, D4). Both are trust/audit-integrity defects, both code-confirmed. T11c is verifiable today; T10 must land before the OOHDASH-19 write-flip so the note-drop never reaches a real control ticket.

**In parallel, start the two flows that carry an external precondition — T11a and T11b.** T11a (system-driven auto-P1, D1): the three current P1 flows need no product input; the welfare/safety CONFIRM rows (§2a) need James/Sam sign-off before build. T11b (real gateway, D2): Design proceeds while the external preconditions — OOHDASH-73 go/no-go, `ESCALATION_ONDUTY_NUMBER`, provider creds — are confirmed by Spencer/James; T11c is the correctness guarantee it ships on.

**Ship T6b (scope-tile copy-honesty pass) now (D3 provisional); keep T5/T6a coverage parked on the bridge (K1/B2, Spencer/IoT).** Do not re-test 5/6 against the currently-unhealthy bridge and read the result as an app fault.

---

## 11. Accept-with-conditions register

The independent discovery-gate panel returned **PASS-WITH-CONDITIONS** (both hard-blocking lenses verified the citations as accurate). Each condition below is **OPEN/TRACKED** — none is resolved by this acceptance; each names an owner and the stage it gates. These sit alongside the §0 blockers (K1/K2).

<table>
<thead><tr><th>#</th><th>Condition</th><th>Raised by</th><th>Gates</th><th>Owner</th><th>Current response</th></tr></thead>
<tbody>
<tr><td>CT-1</td><td><strong>T10 problem-vs-symptom reconciliation.</strong> The control-path <code>detail</code> is machine-synthesised (no handler note field); Tony's symptom is on a non-control path. Reconcile end-to-end and re-scope.</td><td>critical-thinker</td><td>Design</td><td>Discovery (this doc)</td><td><strong>RESOLVED in §1.</strong> Primary defect = category tiles drop smart-entry text (`views.js:177`), reproducible, matches Tony. Secondary = control synthesised detail. Routing-only; D4 corrected — no new field required. <em>OPEN until Design accepts the re-scope.</em></td></tr>
<tr><td>CT-2 / QA-2</td><td><strong>T11c is not a one-line conditional.</strong> The ticket "SMS dispatched" transcript line (`api.js:227`) is built <em>before</em> <code>escalateP1</code> runs (`api.js:255-257`), so <code>dispatchOk</code> does not exist at ticket-build time. The fix needs an escalate/ticket <strong>reorder</strong> or a corrective post-dispatch write, not a conditional. The card fix is trivial (`flows.js:153` already reads <code>res.p1.dispatchOk</code>).</td><td>critical-thinker / QA</td><td>Design / Build</td><td>Design doer</td><td>Noted for Design: sequence the P1 send before the transcript line, or write the sync line after dispatch. <em>OPEN.</em></td></tr>
<tr><td>CT-3</td><td><strong>Re-confirm the Zendesk evidence.</strong> Ticket IDs 48654–48664 (esp. #48663) must be re-read at the Design/Build gate before being relied on as acceptance evidence (tickets mutate/merge).</td><td>critical-thinker</td><td>Design/Build gate</td><td>Whoever raises the gate</td><td>Re-fetch and spot-check before citing. <em>OPEN.</em></td></tr>
<tr><td>QA-3</td><td><strong>Freeze-rule test for T10.</strong> Add a test asserting the extra T10 transcript line does NOT perturb the <code>[TRG]</code> outcome-code parse / freeze rule (the consumer parses <code>Outcome:\s*([\w-]+)</code>, `zendesk.js:177-181`).</td><td>QA</td><td>Build</td><td>Build doer</td><td>Test obligation recorded. <em>OPEN.</em></td></tr>
<tr><td>CX-1</td><td><strong>Auto-P1 escape-hatch.</strong> System-driven P1 (D1) can strand a genuine P1 on an uncovered/`other` flow, and the handler may not realise it wasn't raised. Design must add an audited, reason-tagged escape-hatch / confirm-prompt (not a bare button) so "no button" ≠ "no path".</td><td>customer-experience</td><td>Design</td><td>Design doer</td><td>Carried into §9 CX-1 + §2a cross-cutting note. <em>OPEN.</em></td></tr>
<tr><td>CX-2</td><td><strong>Escalation copy states the NEXT ACTION.</strong> Log-mode / send-failure copy must say "not sent — phone the on-duty manager now on …", not just "not sent".</td><td>customer-experience</td><td>Design</td><td>Design doer</td><td>Carried into §9 CX-2. <em>OPEN.</em></td></tr>
<tr><td>CX-3</td><td><strong>Handler-visible note retention.</strong> T10 acceptance bar = the typed note is visible on the confirmation card the handler sees, treated as a trust criterion (not just back-office ticket presence).</td><td>customer-experience</td><td>Design</td><td>Design doer</td><td>Carried into §9 CX-3. <em>OPEN.</em></td></tr>
<tr><td>CX-4</td><td><strong>Honesty copy routes to the alternative.</strong> T6b "not on Lighthouse here" copy must route the handler to the available alternative action, not just declare the gap.</td><td>customer-experience</td><td>Design</td><td>Design doer</td><td>Carried into §9 CX-4. <em>OPEN.</em></td></tr>
<tr><td>D2-risk</td><td><strong>SMS no-go fallback.</strong> If OOHDASH-73 go/no-go is a no-go or <code>ESCALATION_ONDUTY_NUMBER</code> is unconfirmed, T11b defers and only T11c/B1 (dispatchOk correctness + honest copy) ships — decoupled.</td><td>orchestrator</td><td>Release-preflight</td><td>James / release</td><td>Recorded in §8 risk register. <em>OPEN.</em></td></tr>
</tbody>
</table>

> **Honesty note.** These conditions are carried, not closed. PASS-WITH-CONDITIONS clears Discovery to the gate; the conditions gate the stage each names. CT-1 is resolved *in this document* (the re-scope) but stays OPEN until Design accepts it.

---

*All line numbers cited against repo `main`, 2026-09-16. Live findings from `/healthz` and Zendesk tickets 48654–48664 (Tony Willetts, 2026-09-11), read firsthand. UNVERIFIED items name the exact probe + owner. Gate outcome: PASS-WITH-CONDITIONS (§11), conditions OPEN/TRACKED. This artefact does not invoke reviewers or the next stage — the Orchestrator governs the gate.*
