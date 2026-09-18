<!-- gate:contract
SECTION Blockers first: Nothing in-repo is hard-blocked, but two external dependencies gate parts of this workstream. K2 (SMS gateway, Test 11b): enabling a real P1 text needs the OOHDASH-73 go/no-go sign-off, a confirmed ESCALATION_ONDUTY_NUMBER, and provider credentials — all external, none closable from this repo. Human sign-off (Test 11a): the welfare/safety auto-P1 candidates (heating/fan/hot-water) imply a signal the flows do not capture today and need James + Sam to confirm before build. Read these before the per-test detail.
SECTION What this is: The formalised discovery for the Tony Willetts tester-feedback workstream, produced AFTER the TB-direct read cutover went live. It supersedes the paused OOHDASH-77 discovery, whose central blocker (the bridge only carries Salus) is now DISSOLVED because we read the full estate direct from ThingsBoard. It re-dispositions all 13 of Tony's Tier-1 tests against the deployed build, code-confirms the remaining defects firsthand, and hands Design a crisp brief for the four still-open items.
SECTION What we found (plain English): Six of Tony's seven fails are now resolved by other work already deployed — the TB-direct read cutover surfaces the full device estate (Test 5), makes non-heating scope tiles honest (Test 6), and adds a pub-name search index (Test 2), which also fixes the missing site name/location (Tests 1, 3). These need a LIVE RE-TEST to close, not new build — the resolving code is confirmed deployed, but the rendered result needs a handler login to witness. Three genuine app defects remain, all code-confirmed by this discovery: Test 10 (category tiles silently discard the handler's typed words — views.js line 177), Test 11c (the app records and displays "SMS sent" when nothing was sent — escalation.js line 74 plus api.js line 239), and the reachability half of Test 11a (auto-P1 flows). Test 11b (real SMS gateway) is buildable but externally gated.
SECTION Per-test disposition: All 13 of Tony's tests mapped to Close-after-retest / Design-needed / Leave-alone, each with the firsthand evidence for that call and whether it is code-verified or needs a live re-test.
SECTION Still-open items: The four items that need Design — Test 10, 11a, 11b, 11c — each with a crisp problem statement, the code-confirmed root cause, and the open questions Design must answer (including the human sign-offs).
SECTION OOHDASH-77 re-scope: What survives from the paused branch (the Test-10 root cause, the flow-to-P1 mapping) and what is obsolete (the bridge-only premise). Verdict: do not merge as-is.
SECTION Design vs build-ready: An explicit split of what still needs Design versus what is build-ready once designed.
DECISION OOHDASH-77 disposition: SUPERSEDE, do not merge. Its K1 blocker (bridge-only-Salus) is dissolved by TB-direct. Keep its Test-10 root cause (views.js:177) and its flow-to-P1 candidate mapping (both still valid and re-confirmed here); discard its Tests 5/6 "external-blocked/parked" framing (now resolved) and its bridge-transport probes.
DECISION Tests 1/2/3/5/6 disposition: CLOSE-AFTER-RETEST. The resolving code is confirmed deployed (tb-device.js searchSites/classifyDevice, api.js capability-driven SCOPE_GROUPS); the outstanding step is a live handler re-test to witness the rendered result, then close the tickets. No new build required.
DECISION Still-open build set: Test 10 (routing-only), Test 11c (folds into the gateway work; needs a transcript-ordering fix per CT-2, not a one-liner), Test 11a (system-driven auto-P1; three flows already P1, welfare candidates need James/Sam), Test 11b (real gateway; external preconditions). Writes stay LOCKED — none of this proposes flipping writes on.
-->

# Discovery — Tester Feedback (Tony Willetts Tier-1), post-TB-direct

**Release:** OOH Triage Dashboard — R1 · **Stage:** Discovery · **Date:** 2026-09-18 · **Owner:** James Brown
**Ticket:** OOHDASH-72 (Tony Willetts, "OOh Dashboard testing", 2026-09-11 — Tier-1: 6 pass / 7 fail).
**Supersedes:** the paused `discovery/tester-feedback` branch (OOHDASH-77, 2026-09-16) — see §5.
**Formalises:** `OOH_TESTER_FEEDBACK_TB_DIRECT_IMPACT_2026-09-18.md` (the initial impact assessment).

**Repo state (verified):** `main` @ `5763776` (= deployed HEAD, `git rev-parse`); read cutover LIVE (`thingsboardRead:healthy`); `WRITES_DISABLED=true`; `SMS_PROVIDER=log`; `DATA_MODE=live`. Full current state: `OOH_TB_DIRECT_STATE_AND_HANDOVER_2026-09-18.md`.

**Method.** Verified against deployed source on `main` @ `5763776` and the two 2026-09-18 handover artefacts. The three still-open defect root causes (Test 10, Test 11c, and the Test-11c transcript-ordering nuance) were **code-confirmed firsthand in this discovery** (file:line below). The six "resolved" items' resolving code was confirmed to exist and be deployed, but their rendered output needs a **live handler re-test** (a B2C handler login, not doable headlessly — state doc §3) before the tickets close; each is marked accordingly. Anything not confirmable firsthand is marked **UNVERIFIED** with the probe + owner.

**Verification legend:** `code` = traced to deployed source in this discovery; `code(deployed)` = resolving code confirmed present on the deployed HEAD, rendered result needs a live re-test; `doc` = carried from a verified handover artefact.

**Invariants honoured.** Writes to ThingsBoard stay LOCKED (`WRITES_DISABLED=true`) — nothing here proposes flipping them on. ThingsBoard is system of record; the integration-bridge sits behind it for command dispatch only. Discovery only — no product code was changed; code was read to confirm root causes.

---

## 0. Blockers first (each with owner)

Nothing in-repo is hard-blocked. Two external dependencies gate parts of the workstream; neither closes from this repo.

<table>
<thead><tr><th>#</th><th>Blocker</th><th>Current state</th><th>What confirms / closes it</th><th>Owner</th></tr></thead>
<tbody>
<tr><td>K2</td><td><strong>Test 11b — real SMS gateway preconditions.</strong> Today <code>SMS_PROVIDER=log</code> records a dispatch but sends nothing; a real P1 text cannot go live until three external things are confirmed.</td><td><strong>EXTERNAL preconditions.</strong> Twilio path exists (<code>escalation.js:34-42</code>); log branch only <code>console.warn</code>s (<code>escalation.js:45-46</code>); provider default is <code>log</code> (<code>config.js</code>) and the live manifest sets it (state doc §7).</td><td>(1) OOHDASH-73 go/no-go #4 sign-off; (2) <code>ESCALATION_ONDUTY_NUMBER</code> confirmed set — <strong>UNVERIFIED</strong>, probe admin <code>/api/admin/sms-log</code> (<code>sentToNumber</code> "(configured)"/"(not configured)", <code>escalation.js:64</code>) or read the k8s secret; (3) provider creds present in the secret.</td><td>Spencer / James</td></tr>
<tr><td>H1</td><td><strong>Test 11a — welfare/safety auto-P1 sign-off.</strong> Adding auto-P1 to the heating/fan/hot-water flows needs a product call, because those flows do not capture the required signal (occupant vulnerability / active-safety condition) today.</td><td><strong>HUMAN sign-off, not a blocker to starting.</strong> The three flows already minting P1 (contractor, fridge, kitchen-critical) need no sign-off and can proceed; only the new welfare candidates wait.</td><td>James + Sam confirm which welfare/safety flows warrant auto-P1 (§4, Test 11a). Design shapes the new in-flow decision point once confirmed.</td><td>James / Sam</td></tr>
</tbody>
</table>

> **Note — TB-direct dissolved the original blocker.** OOHDASH-77's central blocker K1 ("the integration-bridge only carries Salus, so non-heating devices can never render — external-blocked on Spencer/IoT") is **GONE**. We no longer read from the bridge; we read the full estate direct from ThingsBoard (`services/tb-device.js`, `thingsboardRead:healthy`). Everything OOHDASH-77 parked on the bridge (Tests 5, 6, and the kitchen-P1 reachability under 11a) is unparked.

---

## 1. Problem framing

Tony Willetts ran the Tier-1 test pack on 2026-09-11 (OOHDASH-72): **6 pass, 7 fail**. James paused acting on the fails, suspecting the parallel TB-direct re-engineering would make some moot. That instinct was correct. The TB-direct read cutover — a separate, already-gated-and-deployed workstream — changed the ground under this feedback:

- It replaced the integration-bridge `/api/devices` read (which only ever surfaced Salus heating, ~1 of a site's ~23 devices) with a **direct ThingsBoard read of the full estate** (`services/tb-device.js`).
- It added a **capability-based device classifier** (`classifyDevice()`, `tb-device.js:181`) and made the Lighthouse scope tiles **capability-driven** rather than hard-coded (`SCOPE_GROUPS`, `routes/api.js:135-140`).
- It added a **pub-name search index** sourced from the Zendesk site directory (`zendesk.siteDirectory()` → `searchSites()`, `tb-device.js:512`), because TB `textSearch` cannot do pub-name search.

The consequence: **six of Tony's seven fails are addressed by work already on the live build** and need only a re-test to close. The genuinely app-internal defects — the dropped typed note, the false "SMS sent" claim, and the narrow auto-P1 route — are **untouched by TB-direct and remain the real work of this workstream**. This discovery formalises that split and hands Design a build-informing brief for the still-open items.

This workstream does **not** touch the write-flip. Test 6 tiles now show control *capability* (a read concern); live *actuation* remains held behind `WRITES_DISABLED=true` — James's decision, out of scope here.

---

## 2. Per-test disposition (all 13)

Statuses: **Close-after-retest** (resolved by deployed work; needs a live re-test then close the ticket) · **Design-needed** (real remaining work) · **Leave-alone** (passed; no regression).

<table>
<thead><tr><th>Test</th><th>Tony's item</th><th>Result</th><th>Disposition</th><th>Evidence (firsthand where possible)</th><th>Ver</th></tr></thead>
<tbody>
<tr><td>1</td><td>Search a site by number — "only shows House ID and gk-number", no name</td><td>FAIL</td><td><strong>Close-after-retest</strong></td><td>Read plane now populates <code>siteName</code>/<code>brand</code> from the Zendesk directory; search results carry <code>{siteNo, siteName, brand}</code> (<code>tb-device.js</code> siteName enrichment :420, <code>searchSites</code> :512). Rendered result needs a live re-test; residual (if any) is a display-only fix.</td><td>code(deployed)</td></tr>
<tr><td>2</td><td>Search a site by name — "no sites found when typing name"</td><td>FAIL</td><td><strong>Close-after-retest</strong></td><td>Known TB limitation (no pub-name <code>textSearch</code>) explicitly addressed by design D8: warmed pub-name index from the Zendesk directory; <code>searchSites()</code> matches on name-includes over it (<code>tb-device.js:512-516</code>, <code>zendesk.siteDirectory()</code> :160). Directly built. Re-test.</td><td>code(deployed)</td></tr>
<tr><td>3</td><td>Confirm the correct site — "doesn't show house name or location, just gk-6261"</td><td>FAIL</td><td><strong>Close-after-retest</strong></td><td>Same root as Test 1 — <code>siteName</code> now populated. Re-test; residual display-only.</td><td>code(deployed)</td></tr>
<tr><td>4</td><td>Ambiguous entry correctly rejected</td><td>PASS</td><td><strong>Leave-alone</strong></td><td>Passed. Re-confirm given the read/search changes (low risk).</td><td>doc</td></tr>
<tr><td>5</td><td>Read live device status — "only Salus/Accommodation Gateway; no boiler or tuya devices"</td><td>FAIL</td><td><strong>Close-after-retest</strong></td><td><strong>The single largest resolution.</strong> OOHDASH-77 classed this external-blocked (K1, bridge-only). TB-direct reads the full estate direct from TB (site 6261 = 23 devices incl. boiler/tuya/kitchen/lighting/fans/metering). Read cutover deployed (<code>thingsboardRead:healthy</code>). Re-test — expect the full estate.</td><td>code(deployed)</td></tr>
<tr><td>6</td><td>Lighthouse scope tiles — "says we only control heating; everything else 'not on lighthouse here'"</td><td>FAIL</td><td><strong>Close-after-retest</strong></td><td>Root cause fixed: <code>SCOPE_GROUPS</code> is now capability-driven — kitchen/lighting/fan render <code>ctl</code> when a device exposes the <code>switch</code> command, else honest <code>mon</code>/<code>none</code> (<code>api.js:135-140</code>, firsthand-read). "Not on Lighthouse here" is largely moot. Note: tiles show control *capability* (read); live *actuation* stays behind the write-flip. Re-test.</td><td>code</td></tr>
<tr><td>7</td><td>Recent tickets view</td><td>PASS</td><td><strong>Leave-alone</strong></td><td>Passed; TB-direct doesn't touch it.</td><td>doc</td></tr>
<tr><td>8</td><td>Callback lookup</td><td>PASS</td><td><strong>Leave-alone</strong></td><td>Passed.</td><td>doc</td></tr>
<tr><td>9</td><td>Tonight view</td><td>PASS</td><td><strong>Leave-alone</strong></td><td>Passed.</td><td>doc</td></tr>
<tr><td>10</td><td>Record an outcome — "ticket raised but didn't include the notes I typed"</td><td>FAIL</td><td><strong>Design-needed</strong></td><td><strong>Code-confirmed firsthand.</strong> Category tiles call <code>startFlow('${c.k}')</code> with no 2nd arg (<code>views.js:177</code>), so <code>freeText=''</code> (<code>flows.js:57</code>) → <code>callerWords: null</code> on the wire (<code>flows.js:123</code>) → no "Caller's words:" line. The "Sounds like" chip DOES carry it: <code>startFlow(k, state.smartEntryText \|\| '')</code> (<code>flows.js:52</code>). TB-direct doesn't touch this path. Routing-only fix. See §4.</td><td>code</td></tr>
<tr><td>11a</td><td>Escalate a P1 — "can only raise P1 through Contractor on site; kitchen appliances dropping off should be P1"</td><td>FAIL</td><td><strong>Design-needed</strong></td><td>Reachability half now unblocked: kitchen devices are visible via TB-direct, so kitchen-critical P1 is reachable. Route stays system-driven (D1). Welfare candidates (heating/fan/hot-water) need James/Sam (H1). See §4.</td><td>code+doc</td></tr>
<tr><td>11b</td><td>Escalate a P1 — "P1 doesn't send a text"</td><td>FAIL</td><td><strong>Design-needed</strong></td><td>Externally gated (K2). Twilio path exists (<code>escalation.js:34-42</code>); log-mode sends nothing. See §4.</td><td>code</td></tr>
<tr><td>11c</td><td>(within Test 11) the app claims a text was sent when it was not</td><td>FAIL</td><td><strong>Design-needed</strong></td><td><strong>Code-confirmed firsthand.</strong> Log-mode <code>sendViaProvider</code> returns without throwing → <code>dispatchOk=true</code> (<code>escalation.js:73-74</code>); card says "A text message has been sent" (<code>flows.js:153</code>); transcript pushes "P1 escalation → SMS dispatched" <em>unconditionally</em> (<code>api.js:239</code>). Not a one-liner — see §4 (CT-2). Folds into 11b.</td><td>code</td></tr>
<tr><td>12</td><td>Safety-lock negative test</td><td>PASS</td><td><strong>Leave-alone</strong></td><td>Passed. Re-confirm given control changes (low risk).</td><td>doc</td></tr>
<tr><td>13</td><td>Add a follow-up note</td><td>PASS</td><td><strong>Leave-alone</strong></td><td>Passed; separate feature (<code>views.js:261</code> → <code>/tickets/:id/notes</code>), works.</td><td>doc</td></tr>
</tbody>
</table>

**Summary:** 5 Close-after-retest (1, 2, 3, 5, 6) · 4 Design-needed (10, 11a, 11b, 11c) · 6 Leave-alone (4, 7, 8, 9, 12, 13). Tony's 7 fails resolve to 6 close-after-retest + 3 design items (Test 11 splits three ways; the sixth close-after-retest is Test 1/3's shared root).

> **Re-test caveat (carried from OOHDASH-77 CT-3).** Close-after-retest items must be witnessed on the deployed build with a handler login, and Tony's Zendesk ticket IDs (48654–48664) re-read before being cited as acceptance evidence (tickets mutate/merge). Do NOT re-test 5/6 by inspecting the bridge — that premise is gone; re-test against the live TB-direct workspace.

---

## 3. Confirmed root causes (the three defects, firsthand)

All three were read on `main` @ `5763776` during this discovery.

**Test 10 — typed words dropped on the tile path.** `views.js:177` renders each category tile as `onclick="startFlow('${c.k}')"` — no second argument. `startFlow(k, freeText)` (`flows.js:56-57`) then sets `f.data.freeText = freeText || ''` = `''`. On outcome the wire carries `callerWords: f.data.freeText || null` = **null** (`flows.js:123`), so the ticket gets no "Caller's words:" line. The suggestion chip is the control case that proves the asymmetry: `startSuggestedFlow` calls `startFlow(k, state.smartEntryText || '')` (`flows.js:52`). **Fix is routing-only:** pass `state.smartEntryText` into the tile's `startFlow` call, exactly as the chip does. No new UI field is required.

**Test 11c — false "SMS sent".** `escalateP1` seeds `dispatchOk: false` (`escalation.js:68`), then in log-mode `sendViaProvider` merely `console.warn`s and returns (`escalation.js:44-46`) — it does not throw — so control falls through to `entry.dispatchOk = true` (`escalation.js:74`). A no-op is recorded as a successful dispatch. The handler card then reads "A **text message** has been sent to the **on-duty escalation manager**" (`flows.js:153`), only appending a failure tag when `!dispatchOk` (never true in log-mode). And the ticket transcript pushes `P1 escalation → SMS dispatched to on-duty manager` **unconditionally** (`api.js:239`).

**Test 11c — the CT-2 sequencing nuance (confirmed sharper than OOHDASH-77 recorded).** The transcript is built at `api.js:254` (`buildOutcomeTranscript`, which contains the unconditional line at :239) and baked into the ticket's first `[TRG]` comment when the ticket is created at `api.js:256`. But `escalateP1` — the only thing that sets `dispatchOk` — does not run until `api.js:268`, **after** the ticket already exists. So `dispatchOk` genuinely does not exist at transcript-build time; the fix **cannot** be a conditional on the existing line. It needs either a reorder (send the P1 before building the transcript) or a corrective post-dispatch comment. This is a real Design/Build decision, not a one-liner. (The card fix at `flows.js:153` is trivial — it already reads `res.p1.dispatchOk`, exposed at `api.js:312`.)

---

## 4. Still-open items — problem, root cause, open questions

### Test 10 — record an outcome (typed notes dropped)
- **Problem.** Handler types the issue into the smart-entry box, clicks a category tile (not the suggestion chip), completes the outcome — the typed words never reach the ticket. Exactly Tony's symptom.
- **Root cause (confirmed §3).** `views.js:177` omits the second `startFlow` argument; `callerWords` goes out null.
- **Open questions for Design.**
  1. Confirm the routing-only fix (tiles carry `state.smartEntryText` into `startFlow`) — recommended; no new field.
  2. **CX (carried CT/CX-3):** should the typed words be echoed on the **confirmation card the handler sees**, not only the back-office ticket? Discovery's view: yes — note retention is a trust criterion verifiable at the handler's screen.
  3. Optional: add an explicit "notes for the IoT team" field to outcome-compose (precedent `views.js:261`). **Not required** to fix Test 10 — decide at Design.
  4. **Secondary (latent under the write-lock):** carry the synthesised `detail`+`holdText` line on control-linked outcomes (`api.js:234-238` else-branch vs the action-branch at :226-233 which omits `detail`), material on the control-failure path. Land before any write-flip so a control-failure ticket never silently drops the "treat as not applied" line.

### Test 11a — auto-invoke P1 on warranted flows (system-driven, D1)
- **Problem.** P1 looked contractor-only to Tony. In live Salus-only inventory the kitchen-critical P1 path was unreachable (no kitchen devices) and the fridge P1 path was reachable but unexercised.
- **Root cause / current state.** P1 eligibility is hard-coded in exactly three flow branches — contractor (always), fridge/stock-at-risk (always), kitchen-critical (when kitchen devices exist). The server raises P1 for any `type==='escalate-p1'`, so eligibility lives entirely in the front-end flow definitions. TB-direct makes kitchen devices visible → kitchen-critical is now reachable.
- **Decision already made (D1, James).** SYSTEM-DRIVEN — no generic "escalate as P1" button (abuse/mis-fire risk). Audit the flows and auto-invoke P1 on the ones that warrant it.
- **Candidate flow → P1 mapping (carried from OOHDASH-77 §2a, re-confirmed valid).** Keep the three current flows. Welfare/safety candidates needing product sign-off: **heating** (P1 only on total-heat-loss + vulnerable occupants / hard-freeze), **fan** (P1 only on active cooking/gas-safety, not scheduling), **lighting** (likely NOT P1; edge for premises-dark safety), **hot-water** (likely NOT P1; edge for a care setting). `connectivity` and `other` — recommend NO auto-P1.
- **Open questions for Design.**
  1. **Human sign-off (H1): James + Sam confirm which welfare/safety flows warrant auto-P1.** Each "CONFIRM" row implies a signal the flow does not capture today (occupant vulnerability / active-safety), so it needs a **new in-flow decision point**, not a routing tweak.
  2. **CX escape-hatch (carried CX-1):** system-driven P1 must not strand a genuine P1 on an uncovered/`other` flow. Design an **audited, reason-tagged escape-hatch / confirm-prompt** (not a bare button) so "no button" ≠ "no path", and the handler is told when a call was *not* auto-escalated.

### Test 11b — send a real P1 text
- **Problem.** `SMS_PROVIDER=log` sends nothing; the on-duty manager is never actually paged.
- **Root cause / current state.** Twilio path exists (`escalation.js:34-42`); log-mode is a no-op (`escalation.js:44-46`); provider selected by config.
- **Decision already made (D2, James).** Enable a real gateway this release.
- **Open questions / external preconditions (K2 — Design carries, does not close).**
  1. OOHDASH-73 go/no-go #4 sign-off (Spencer/James).
  2. `ESCALATION_ONDUTY_NUMBER` confirmed set — UNVERIFIED; probe admin `/api/admin/sms-log` or read the secret.
  3. Provider credentials present in the k8s secret.
  4. **No-go fallback (carried D2-risk):** if go/no-go is a no-go or the number is unconfirmed at build time, T11b defers and **11c ships decoupled** so the app is at least truthful in log-mode. Do not block 11c on 11b.

### Test 11c — `dispatchOk` must reflect an actual send
- **Problem.** The handler and the ticket are told a text "has been sent" when nothing was (log-mode). Trust + audit-integrity defect; verified live on Tony's P1 ticket #48663.
- **Root cause (confirmed §3, incl. CT-2 sequencing).** `dispatchOk` set true after a log-mode no-op; card + transcript claim a send unconditionally; and the transcript line is built **before** dispatch runs, so it cannot simply be made conditional.
- **Open questions for Design.**
  1. **Sequencing:** send the P1 before building the transcript, OR write a corrective sync line after dispatch. (Not a one-liner — CT-2.)
  2. `dispatchOk` true only on a genuine transmission (log-mode → not a send); gate the card (`flows.js:153`) and transcript (`api.js:239`) on it.
  3. **CX next-action (carried CX-2):** log-mode / send-failure copy states the **next action** ("not sent — phone the on-duty manager now on …"), not merely "not sent". The P1 stays visibly recorded.
  4. **QA freeze-rule (carried QA-3):** any added/reordered transcript line must not perturb the `[TRG]` outcome-code parse (`Outcome:\s*([\w-]+)`, `zendesk.js` freeze rule) — Build test obligation.

---

## 5. OOHDASH-77 re-scoped verdict

**Verdict: SUPERSEDE — do not merge `discovery/tester-feedback` as-is.** It was written on the old bridge-only premise, which TB-direct has dissolved.

<table>
<thead><tr><th>From OOHDASH-77</th><th>Verdict</th><th>Why</th></tr></thead>
<tbody>
<tr><td>Test-10 root cause: category tiles drop smart-entry text (<code>views.js:177</code>), routing-only fix</td><td><strong>SURVIVES — re-confirmed firsthand (§3)</strong></td><td>Independent of TB-direct; still the exact match for Tony's symptom.</td></tr>
<tr><td>Test-11a candidate flow → P1 mapping (§2a)</td><td><strong>SURVIVES — carried into §4</strong></td><td>Flow definitions unchanged; kitchen-critical now reachable, strengthening the mapping.</td></tr>
<tr><td>Test-11c false "SMS sent" + CT-2 sequencing nuance</td><td><strong>SURVIVES — re-confirmed + sharpened (§3)</strong></td><td>Escalation/transcript code unchanged by TB-direct.</td></tr>
<tr><td>K1: "bridge only carries Salus, non-heating can never render — external-blocked"</td><td><strong>OBSOLETE</strong></td><td>We no longer read the bridge; full estate reads direct from TB.</td></tr>
<tr><td>Test 5 "EXTERNAL-BLOCKED (Spencer/IoT)" + Test 6 "coverage parked on bridge"</td><td><strong>OBSOLETE — now Close-after-retest</strong></td><td>Resolved in-app by the read cutover + capability-driven tiles.</td></tr>
<tr><td>Bridge-transport probes (<code>GET {BRIDGE_BASE_URL}/api/devices</code>), <code>deriveKind</code>/registry extension follow-on</td><td><strong>OBSOLETE</strong></td><td><code>bridge.js</code> is now a re-export shim; classification is <code>classifyDevice()</code> in <code>tb-device.js</code>.</td></tr>
<tr><td>D3 "Test 6 copy-honesty pass now, coverage parked"</td><td><strong>MOSTLY OBSOLETE</strong></td><td>The substantive fix already shipped (capability-driven tiles). Any residual copy polish is a small optional item, not a parked-coverage item.</td></tr>
<tr><td>Accept-with-conditions register (CT-1/2/3, QA-2/3, CX-1..4, D2-risk)</td><td><strong>SURVIVES — carried into §4/§6</strong></td><td>The CX/QA conditions still gate Design/Build; re-attached to the still-open items.</td></tr>
</tbody>
</table>

**Action:** do not merge the branch. This document is its replacement. If desired, delete or archive the branch; its two live findings (Test-10 root cause, flow→P1 mapping) are preserved here.

---

## 6. Design vs build-ready

**Needs DESIGN before build:**
- **Test 11a** — the system-driven auto-P1 mechanism and the **new in-flow decision point** for the welfare/safety candidates; the **audited escape-hatch** (CX-1). Gated on the **James + Sam sign-off (H1)** for which flows qualify.
- **Test 11c** — the **escalate/transcript sequencing** (CT-2): reorder the send before transcript build, or a corrective post-dispatch comment. Plus the CX next-action copy (CX-2).
- **Test 10 (CX choice)** — whether to echo the typed words on the handler's confirmation card (CX-3) and whether to add an optional outcome-compose notes field. The core routing fix itself is trivial.
- **Test 11b** — the gateway wiring is small, but the **external preconditions (K2)** and the no-go fallback are a Design/release concern.

**Build-ready once designed (low complexity, code paths identified):**
- **Test 10 primary** — tiles carry `state.smartEntryText` into `startFlow` (`views.js:177` ↔ `flows.js:52`). Routing-only. **Land before any write-flip** (so the secondary control-path drop never reaches a real control ticket).
- **Test 10 secondary** — carry synthesised `detail`+`holdText` on control-linked outcomes (`api.js:226-233`). Latent under the write-lock.
- **Test 11c card fix** — gate `flows.js:153` on `res.p1.dispatchOk` (already exposed). Trivial; the *transcript* half needs the §4/CT-2 design decision first.

**No build — re-test then close (needs a live handler login):**
- **Tests 1, 2, 3, 5, 6** — resolving code confirmed deployed; witness on the live workspace, re-read Tony's tickets, close.

**Leave alone:** Tests 4, 7, 8, 9, 12, 13 (re-confirm 4/12 opportunistically given read/control changes).

---

## 7. Recommended first step

1. **Live re-test the six resolved items (1, 2, 3, 5, 6)** on the deployed build with a handler login, re-reading Tony's Zendesk tickets first — the cheapest, highest-confidence progress; closes the majority of Tony's fails with no build.
2. **In parallel, land the two in-repo trust/audit defects — Test 10 (routing) and Test 11c (card + the CT-2 transcript sequencing).** Both are code-confirmed, both improve integrity, neither depends on any external party. Test 10 must land before any write-flip.
3. **Start the two externally-gated flows now** so they're ready when the humans respond: **Test 11a** (three current P1 flows need nothing; welfare candidates wait on James + Sam, H1) and **Test 11b** (real gateway — Design proceeds while Spencer/James confirm OOHDASH-73 go/no-go, the on-duty number, and provider creds, K2). 11c is the correctness guarantee 11b ships on.

---

*All line numbers cited against repo `main` @ `5763776` (deployed HEAD), read firsthand 2026-09-18. Resolved-item resolving code confirmed deployed; rendered results and Tony's tickets (48654–48664) need a live re-test before close. Writes remain LOCKED — no write-flip is proposed. This artefact does not open a PR or a gate and did not edit application source — the Orchestrator governs those.*
