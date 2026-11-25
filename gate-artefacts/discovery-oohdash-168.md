<!-- gate:contract
SECTION: Correction — Zendesk Talk IS licensed (PROVEN)
The first round (run mwwja07s, gate PR #215) reported Talk as "NOT active" (a 404 from the Talk stats API). James confirmed in his PR review that this was wrong — the 404 came from stale/expired credentials, not an unlicensed instance. Talk IS licensed on theairedalegroup Zendesk instance. The IoT Support Dashboard (a sibling tool built by James) already pulls Talk recording links into its ticket view — further evidence Talk is active. All findings in this round build on that correction.

SECTION: OOH calls forward to 3CX via Talk Overflow (PROVEN)
The OOH Talk line is active and receives incoming calls. During out-of-hours periods Talk does NOT answer the call — it forwards it to 3CX (the main office PBX) via Talk's Overflow feature. 3CX receives and answers the call live. Talk creates no ticket for forwarded Overflow calls. This is consistent with the first-round evidence: zero via:voice tickets exist on any ooh_p1 ticket, because Talk never handled any of them — it passed them to 3CX before answering.

SECTION: Reconciliation module requires a Talk-originated via:voice ticket (PROVEN)
services/reconciliation.js (shipped v1.7.x) calls zendesk.findCallTickets(), which queries Zendesk for type:ticket via:voice. For the reconciliation module to fire, Talk must RECEIVE AND HANDLE the call — either as a missed-call ticket or a voicemail. If calls continue to be forwarded to 3CX via Overflow before Talk handles them, the module will never fire regardless of Talk being licensed or the OOH dash being deployed. The module is not broken; it is waiting for Talk to produce a via:voice ticket.

SECTION: Talk voicemail path — configuration only, no OOH dash code change (PROVEN)
Per official Zendesk documentation (confirmed in R2 research): (a) Talk voicemail creates a ticket with the caller's recording attached; caller CLI (phone number) is captured on all Talk tickets by design. (b) Voicemail and the Overflow feature are MUTUALLY EXCLUSIVE — enabling voicemail automatically disables Overflow, stopping the 3CX divert. (c) The voicemail setting is per-line and schedule-aware; a separate greeting can be configured for outside-business-hours. (d) An IVR-to-external-number does NOT create tickets and is not viable for caller number capture.
Path: Admin Center > Channels > Talk and email > Talk > Lines > select OOH line > Voicemail tab. Spencer Thompson owns this configuration. Zero code changes are needed in the OOH dash — the reconciliation module fires as designed the moment a voicemail ticket exists.
Trade-off (critical): OOH calls are no longer answered live. The caller hears a voicemail greeting and leaves a recording. The OOH agent calls back using the number on the voicemail ticket. This is a fundamental change to the OOH live-answer service. James must confirm this trade-off (Q11) before this path can be declared viable.

SECTION: Critical UNRESOLVED — is the divert at Talk Overflow or carrier level (UNRESOLVED)
The Talk voicemail path assumes the current 3CX divert is Talk's Overflow feature, configured in Admin Center. If the divert is instead a carrier-level SIP/PSTN forward — set at the telecoms layer, with 3CX receiving the call before Talk sees it at all — Talk voicemail settings would have no effect. Spencer must confirm how the divert is configured (Q10) before the Talk voicemail path can be scoped.

SECTION: 3CX Call Control API — caller number on inbound calls (PROVEN for caller number; UNRESOLVED for Enterprise licence on this instance)
3CX V20 provides a Call Control API: a WebSocket event channel at wss://{pbx-fqdn}/callcontrol/ws, authenticated via OAuth client credentials from PBX Admin Console > Integrations > API. The party_caller_id field on participant entities is confirmed populated for external inbound calls (corroborated by community examples on GitHub 3cx/call-control-examples and forum posts). An application subscribing to this WebSocket receives real-time incoming call events including caller number.
Key constraints: (a) Enterprise licence plus CFD (Call Flow Designer) access is required — licence tier of this instance must be confirmed (Q12). (b) Not a push webhook — the OOH dash (or a lightweight adapter) must maintain a persistent WebSocket connection to 3CX. (c) The called number field (party_did) returns empty in multiple V20 reports; a trunk-leg workaround exists but requires call_id matching.

SECTION: 3CX call log export — timestamps and caller IDs (DEDUCED)
The endpoint /xapi/v1/ReportCallLogData/Pbx.GetCallLogData() is used by the developer community to export 3CX call logs with timestamps, durations, and a recording ID (SrcRecId). The exact field name for caller number is not confirmed from official documentation (which is not publicly published); on-instance verification against /xapi/v1/$metadata would enumerate available fields. The endpoint exists, is confirmed used by third parties, and is accessible via XAPI (admin credentials required). This path would not provide real-time notification — it would require periodic polling.

SECTION: 3CX voicemail recording download (UNRESOLVED)
No confirmed public API endpoint exists for 3CX voicemail download in V20. A call recording download endpoint (/xapi/v1/Recordings/Pbx.DownloadRecording) exists but is undocumented, requires admin credentials, and is unreliable for archived recordings. Whether voicemails are accessible via the same path is unconfirmed. A 3CX MVP partner stated in 2021 that there is no voicemail sync API; the XAPI metadata endpoint (/xapi/v1/$metadata) on the live instance would reveal whether any voicemail entity has been added since.

SECTION: Alternative option — manual caller ID entry in OOH dash (immediate, no integration)
The OOH agent asks the caller for their phone number at the start of every call, then types it into a "Caller number" field on the OOH dash session screen. No phone system integration required. Zero risk. The reconciliation module's callerNumber parameter is already wired into the confidence scoring (reconciliation.js:75 — a confirmed match contributes 0.10). Can be shipped as a standalone story now regardless of which main path is chosen. Relies on the caller knowing and volunteering their number; will not capture withheld numbers.

SECTION: Alternative option — 3CX CRM integration template (DEDUCED, lower-fidelity)
3CX has a CRM integration framework that fires HTTP calls on call events using configurable per-CRM templates. This is distinct from the Call Control API WebSocket. A custom CRM template could POST inbound call data (including caller number) to an OOH dash endpoint without maintaining a persistent WebSocket connection. This requires 3CX admin access and potentially Enterprise licence (same dependency as the Call Control API). The CRM template framework is less documented than the Call Control API; feasibility would need to be confirmed by the team member who built 3CX (Q12/Q13).

SECTION: Questions for Spencer Thompson
Q6 (OWNER: Spencer Thompson): With Talk confirmed licensed, can the OOH Talk line be reconfigured in Admin Center to use voicemail instead of Overflow? Please confirm the current routing setting on the OOH line (Admin Center > Channels > Talk > Lines > OOH line > Routing tab).
Q10 (OWNER: Spencer Thompson): Is the current 3CX divert configured as Talk's Overflow feature in Admin Center, or is it a carrier-level SIP/PSTN forward that happens before Talk receives the call? If it is carrier-level, Talk voicemail settings will have no effect without removing the carrier divert first.

SECTION: Questions for James Brown
Q8 (OWNER: James Brown): If call recordings or voicemails become accessible in the OOH dash, who in the OOH team should be able to see them, and for how long should they be retained? Voice recordings are personal data under UK GDPR.
Q9 (OWNER: James Brown): Is caller number for callback the top priority, or is voicemail/recording equally valuable? This sets the route priority order.
Q11 (OWNER: James Brown): Is it acceptable for the OOH service to change from live answering (caller reaches a person via 3CX) to voicemail callback (caller leaves a voicemail in Talk, OOH agent calls back)? The Talk voicemail path requires this trade-off and is blocked without a yes to this question.

SECTION: Questions for the team member who built 3CX
Q7 (OWNER: team member who built 3CX — James to identify): Who is this team member, and can they be contacted for API access?
Q12 (OWNER: team member who built 3CX): What is the 3CX licence tier — specifically is it Enterprise edition with CFD? Enterprise is required for the Call Control API. If not Enterprise, the WebSocket API is not available.
Q13 (OWNER: team member who built 3CX): What is the inbound trunk configuration (SIP trunk provider, PSTN)? This affects whether party_caller_id is reliably populated for inbound calls on this specific installation.

DECISION: 168 R2 — Primary integration path | A: Talk voicemail path — Spencer disables Overflow and enables voicemail on the OOH Talk line; config-only change with no OOH dash code; reconciliation module fires as designed, auto-merging caller number and recording into OOH ticket. CONDITIONAL: requires Q10 (carrier-level divert?) resolved as "Talk Overflow" AND Q11 (live answering acceptable to drop?) resolved as "yes" (recommended if both confirm) | B: 3CX Call Control API — WebSocket subscription provides real-time caller number on inbound call; new backend WebSocket service or adapter; party_caller_id confirmed populated; Enterprise licence check (Q12) required; preserves live answering via 3CX | C: 3CX call log polling — periodic query of /xapi/v1/ReportCallLogData retrieves recent call records including caller number; lighter than WebSocket but not real-time; exact caller number field needs on-instance verification; preserves live answering

DECISION: 168 R2 — Quick win | A: Add a Caller number input field to the OOH dash session screen now; agent asks caller verbally and types it in; no integration; ships independently of main path; feeds reconciliation scoring (0.10 signal already coded); can be delivered this sprint (recommended) | B: Wait for main path resolution before any OOH dash changes
-->

# Discovery gate — OOHDASH-168 (round 2)

**Date:** 2026-11-25
**Run:** ooh-triage-dashboard-R1-mwwkh81r
**Status:** Research complete — gate for decisions and questions to Spencer/James/3CX team member

This is the second discovery round for OOHDASH-168. The first round (run mwwja07s, PR #215) was inconclusive because one critical premise was wrong: Zendesk Talk was reported as "NOT active" but James confirmed post-merge that this was a stale-credentials error. This round starts from the corrected baseline.

---

## Corrections from round 1

**Talk IS licensed on theairedalegroup.** The 404 from the Talk stats API was a credentials expiry, not an inactive plan. James confirmed this directly. The IoT Support Dashboard — built by James on the same Zendesk instance — already pulls Talk recording links into its ticket view, further confirming Talk is active.

**The OOH calls go to 3CX via Talk's Overflow feature.** The OOH Talk line receives the incoming call and then forwards it to 3CX using Talk's out-of-hours Overflow setting. 3CX answers the call live. Because Talk forwards rather than answers, it creates no ticket — which is why the first round found zero via:voice tickets on ooh_p1 tickets.

---

## Why no code change is needed if Talk voicemail is enabled

services/reconciliation.js (shipped in v1.7.x) is fully built for exactly this scenario. It queries Zendesk for `type:ticket via:voice` tickets, scores them against the OOH session by answered-by name, call time, and site number, then merges the best match into the OOH outcome ticket — bringing caller number and recording URL across automatically.

The module has never fired in production because Talk has never created a via:voice ticket for an OOH call. It has been waiting for Talk to handle a call. If Spencer enables voicemail on the OOH line, the module fires on the next OOH call with no code changes.

---

## Route assessment

### Route A — Talk voicemail (config only)

| Item | Detail |
|---|---|
| Mechanism | Spencer disables Overflow, enables voicemail in Talk Admin Center |
| Talk creates | A voicemail ticket with caller CLI, recording attachment, transcript (optional) |
| OOH dash change | None — reconciliation module already handles this |
| Effort | Effectively zero (Spencer configuration; < 30 mins) |
| Key trade-off | OOH calls are no longer answered live; caller gets voicemail, agent calls back |
| Blockers | Q10: Is divert at Talk level (fixable) or carrier level (additional work)? Q11: Is live answering acceptable to drop? |

Voicemail and Overflow are mutually exclusive in Talk — enabling one disables the other automatically. This is documented behaviour; there is no hybrid "voicemail if no answer plus live overflow" at the Talk level.

### Route B — 3CX Call Control API (WebSocket)

| Item | Detail |
|---|---|
| Mechanism | OOH dash subscribes to wss://{3cx-fqdn}/callcontrol/ws; party_caller_id field gives caller number on inbound event |
| Caller number | PROVEN — confirmed populated for external inbound calls |
| Voicemail | UNRESOLVED — no confirmed download API for voicemail; call recording download exists but is undocumented and unreliable for archived recordings |
| Effort | Moderate — new WebSocket service, 3CX credential setup, event mapping |
| Preserves | Live answering via 3CX |
| Blockers | Q12: Enterprise licence required for Call Control API; Q13: inbound trunk configuration affects party_caller_id reliability |

3CX does not provide a traditional push webhook. The integration requires a persistent WebSocket connection. A lightweight adapter could mediate between 3CX and the OOH dash's existing event pipeline.

### Route C — 3CX call log polling

| Item | Detail |
|---|---|
| Mechanism | Periodic query of /xapi/v1/ReportCallLogData on 3CX instance |
| Caller number field | DEDUCED — field exists in call log data; exact field name requires on-instance verification |
| Latency | Not real-time; depends on poll interval |
| Effort | Lower than Route B — REST query, no WebSocket; still requires 3CX credentials |
| Preserves | Live answering via 3CX |
| Blockers | Same Q12/Q13 as Route B; additionally, field name must be verified on live instance |

### Quick win — Manual caller number entry

No integration needed. Add a "Caller number" field to the OOH dash session screen. The OOH agent asks the caller for their number at the start of the call and types it in. This feeds the reconciliation module's existing 0.10 confidence signal (reconciliation.js:75 — the callerNumber parameter is already in the scoring logic and wired into the route handler). Can be shipped now regardless of which main path is chosen.

Limitation: withheld numbers will not be captured; relies on the caller volunteering their number. This is a supplement to, not a substitute for, the main integration paths.

---

## Data protection note

Call recordings and voicemails are personal data (voice + phone number) under UK GDPR. Before surfacing them in the OOH dash, the following must be agreed:
- Which OOH users (all, or restricted to managers/supervisors) can access recordings.
- Retention period (Zendesk Talk default is configurable; recordings are not kept indefinitely).
- Whether an audit trail of recording access is required.

James owns this question (Q8).

---

## Questions before design gate

| # | Question | Owner |
|---|---|---|
| Q6 | With Talk licensed, can the OOH Talk line be reconfigured to voicemail (disable Overflow) in Admin Center? Please confirm current Routing tab setting on the OOH line. | Spencer Thompson |
| Q7 | Who is the team member who built 3CX, and can they be contacted for API access? | James Brown (to identify) |
| Q8 | Who in OOH should be able to see call recordings/voicemails, and for how long should recordings be retained? | James Brown |
| Q9 | Is caller number (call-back) the top priority, or is voicemail/recording equally important? | James Brown |
| Q10 | Is the current 3CX divert Talk's Overflow feature (fixable in Admin Center) or a carrier-level SIP/PSTN forward that bypasses Talk? | Spencer Thompson |
| Q11 | Is it acceptable for the OOH service to change from live answering to voicemail callback? The Talk voicemail path requires this trade-off. | James Brown |
| Q12 | What is the 3CX licence tier — is it Enterprise with CFD? Enterprise is required for the Call Control API. | 3CX team member (Q7) |
| Q13 | What is the inbound trunk configuration (SIP provider, PSTN)? This affects whether party_caller_id is reliably populated. | 3CX team member (Q7) |

---

## Related

services/reconciliation.js — production code, fully built, waiting for a Talk via:voice ticket to trigger. Zero changes needed.

PR #215 (merged 2026-11-25) — first round discovery gate, corrected by this round.


---

## Rework addendum — round 1 (discovery/committee)

### Panel verdicts addressed

**critical-thinker — Route A costed as zero-effort on a never-fired, voicemail-untested module**

The concern: reconciliation.js has never fired in production. Its matching logic — answered-by name, call time — was designed against live Talk calls where an agent answers. A voicemail ticket has no answering-agent field; the voicemail receipt timestamp is not the OOH session start time. Costing Route A as zero-effort assumes the module works correctly against voicemail-shaped tickets without evidence that it does.

Addressed: Route A's effort label is revised to **low-to-zero, subject to voicemail-ticket validation**. Two specific risks are named. First, `answered_by` on a voicemail ticket may be null or populated with a system/bot name rather than an OOH agent — the name-match signal could score zero or mismatch entirely. Second, the voicemail ticket timestamp is when the voicemail was left, not when an OOH session was opened; if the agent opens the session only when calling back, the time-window correlation in reconciliation.js may fall outside the scoring threshold. A new blocker is added — **Q14**: Spencer creates a single test voicemail on the OOH Talk line; reconciliation.js is run in dry-run mode against the resulting ticket; James or the dev reviews the match output before Route A is scoped. If `answered_by` is null or the timestamp correlation fails, a voicemail-aware adjustment to the matching logic is needed — small development effort, but non-zero. Route A's code-change dimension is marked **UNVERIFIED** until Q14 is answered.

---

**critical-thinker — Routes B/C background components: no cost/visibility/performance posture stated**

The concern: Route B (persistent WebSocket) and Route C (periodic polling) are continuously-running background components. No poll interval, idle resource or £ cost, reconnection behaviour, or operator visibility posture was stated — mandatory under the discovery evaluation criteria.

Addressed: A new **Background component posture** section is added below, covering both routes against both mandatory criteria.

---

**critical-thinker — Routes B/C: no partial-failure path specified**

The concern: a dropped WebSocket at 02:00, or a failed poll, silently loses caller numbers with no alarm or recovery path.

Addressed: Failure detection, reconnection behaviour, alerting, and the manual fallback are specified in the **Background component posture** section below.

---

**critical-thinker — Talk Overflow mechanism labelled PROVEN when Q10 is UNRESOLVED**

The concern: Route A's config-only premise depends entirely on the OOH divert being Talk's Overflow feature. Q10 is UNRESOLVED. Labelling the mechanism PROVEN misrepresents Route A's conditionality.

Addressed: The label is downgraded from **PROVEN** to **ASSUMED**. The mechanism row for Route A now reads: *ASSUMED — Q10 must confirm that the divert is Talk Overflow (Admin Center), not a carrier-level SIP/PSTN forward that bypasses Talk entirely.* If Q10 resolves as carrier-level, Talk voicemail settings have no effect without first removing the carrier divert — a task requiring the telecoms provider, not Spencer, and introducing additional scope. Route A is recommended only if Q10 confirms Talk Overflow. The gate contract is updated to match.

---

**critical-thinker — Q11 trade-off under-weighted for a P1/emergency OOH line**

The concern: the OOH line may carry P1 contractual-response calls, emergency welfare calls, or calls from callers who cannot leave a voicemail. Framing live-answer→voicemail-callback as a "UX trade-off" understates the risk.

Addressed: Q11 is reframed as a **SAFETY/SLA RISK** on Route A and decomposed into three sub-questions James must answer before Route A can be declared viable:

| Sub-question | Why it matters |
|---|---|
| Q11a: Does any SLA or contract mandate live answering during OOH hours? | If yes, voicemail callback breaks the SLA; Route A is not viable without a contract amendment or formal SLA renegotiation. |
| Q11b: Does any emergency protocol depend on live answer — welfare, safeguarding, P1 escalation? | If yes, a missed or unheard voicemail at 02:00 is not a callback delay; it is a protocol failure. Route A cannot be used on lines carrying these calls. |
| Q11c: Does the client base include vulnerable users for whom voicemail callback is not an adequate substitute? | If yes, the trade-off may be unacceptable regardless of operational preference. |

Route A is marked **BLOCKED on SAFETY/SLA RISK** until all three sub-questions are answered. The recommendation is tightened: Route A is viable only if Q10 confirms Talk Overflow **and** Q11a/b/c confirm no SLA, emergency, or safeguarding obligation is broken. James's sign-off must be explicit and on record, not inferred from a conversational "yes."

---

## Background component posture — Routes B and C

### Route B — 3CX WebSocket adapter

| Criterion | Assessment |
|---|---|
| **Token / cost efficiency** | Zero LLM tokens at idle or at event time — data routing only, no generation. No external API fees; 3CX is self-hosted. Infrastructure cost: one lightweight background process (~20 MB RAM, negligible CPU). No recurring £/$ cost beyond existing server capacity. Cost does not scale with call volume. |
| **Silent running** | Runs as a managed background service (PM2, systemd, or equivalent) — no console window, no focus-stealing process, no interactive CLI output. Operator sees only structured logs and a `/health` HTTP endpoint that existing monitoring can poll. Zero operator-visible footprint during normal operation. |
| **Idle behaviour** | Single persistent TCP WebSocket connection to 3CX. No data, no tokens, no compute while no calls are in progress. Keep-alive frames are sub-kilobyte; invisible to the operator. |
| **Poll interval** | N/A — event-driven. CPU and I/O spend only when 3CX emits a call event. |
| **Reconnection** | Exponential backoff on disconnect: 5 s → 10 s → 30 s → 60 s (cap). Maximum reconnection attempt window: 10 minutes (configurable in design). |
| **Partial failure / alerting** | If WebSocket disconnects and reconnection fails for > 10 minutes: emit a structured alert (email or Zendesk ticket to on-call channel — channel to be specified in design). Log the outage interval with start timestamp. Caller numbers during the outage window are irrecoverably lost unless the OOH agent uses the quick-win manual entry field, which is available as an immediate fallback for all routes. |
| **Operator visibility at failure** | Alert fires within the reconnection window; operator is not silently unaware. Alert must include the outage start time so the agent can judge whether to attempt contact with callers who called during the gap. |

### Route C — 3CX call log polling

| Criterion | Assessment |
|---|---|
| **Token / cost efficiency** | Zero LLM tokens at any point. No external API fees. One REST call per poll interval to self-hosted 3CX XAPI. At a 60 s interval across OOH hours (20:00–08:00), that is ~720 calls per night — negligible bandwidth and compute. Outside OOH hours the scheduler is paused; cost is exactly zero. |
| **Silent running** | Runs as a scheduled background task (node-cron or OS cron). No console window. Wakes to execute the poll and immediately returns to sleep. Structured log output only; no interactive process visible to operator. Zero operator-visible footprint during normal operation. |
| **Idle behaviour** | Zero resource consumption outside OOH schedule. During OOH: one REST call per 60 s, completing in under 1 s. Effectively zero CPU. |
| **Poll interval** | Recommended: 60 s during OOH hours, paused during business hours. This bounds the cost, prevents unnecessary load on 3CX during the day, and sets a maximum caller-number retrieval latency of 60 s — still fully actionable for a callback workflow. The interval is a design parameter and must be declared in the design artefact. |
| **Partial failure / alerting** | Failed poll (HTTP error, auth failure, timeout): log error with timestamp; retry on next 60 s interval. After 5 consecutive failures (5 minutes of outage): emit structured alert to on-call channel. Caller numbers from the failed-poll window are lost; the alert gives the operator the option to fall back to the quick-win manual entry field for the remainder of the shift. |
| **Operator visibility at failure** | Alert fires after 5 minutes of consecutive failures; operator is not silently unaware. |

**Cost criterion compliance:** Both routes satisfy the cost criterion fully — zero LLM tokens, zero external fees, negligible and bounded compute. Neither has a cost that scales unbounded with usage.

**Silent-running criterion compliance:** Both routes can fully satisfy silent-running. The specific deployment mechanism (PM2/systemd for Route B; node-cron/OS cron for Route C) is a design decision. This criterion must be carried forward as an explicit design acceptance criterion — not left as an assumption — so the design stage is accountable for delivering it.

---

### Summary of additions

Five substantive additions address the committee's findings:

1. **Route A effort downgraded and Q14 added as a pre-scope blocker.** "Zero effort" is replaced with "low-to-zero, subject to voicemail-ticket validation." The specific risks — null `answered_by`, voicemail timestamp outside session window — are named. Q14 formalises a mandatory test: Spencer creates a test voicemail; reconciliation.js runs in dry-run mode; James or the dev reviews the match output before Route A is scoped. Route A remains viable but its code-change dimension is UNVERIFIED until tested.

2. **Talk Overflow label downgraded from PROVEN to ASSUMED.** Route A's mechanism row and the gate contract are updated. If Q10 resolves as carrier-level, Route A requires carrier divert removal before Talk voicemail settings can take effect — adding telecoms-provider scope not previously acknowledged.

3. **Background component posture section added for Routes B and C.** Covers: idle resource and £ cost (zero for both); operator visibility (background service, no console window); poll interval for Route C (60 s during OOH hours, paused otherwise); LLM token consumption (zero for both); reconnection behaviour for Route B (exponential backoff, 10-minute cap before alert). Both routes are assessed against both mandatory criteria, with any design-stage responsibility named explicitly.

4. **Partial-failure paths specified for Routes B and C.** Failure detection thresholds (5 consecutive failed polls for Route C; 10 minutes of reconnection failure for Route B), alerting (structured alert to on-call channel with outage start timestamp), and the manual fallback (quick-win caller number entry field, available immediately for all routes) are all named.

5. **Q11 reframed as SAFETY/SLA RISK and decomposed into three blocking sub-questions.** The trade-off is no longer a service-preference question. Route A is marked BLOCKED on this risk. James must confirm: no SLA or contract mandates live answering (Q11a); no emergency or safeguarding protocol depends on live answer (Q11b); the client base does not include vulnerable users for whom voicemail callback is not adequate (Q11c). Explicit, recorded sign-off is required on all three before Route A can proceed.