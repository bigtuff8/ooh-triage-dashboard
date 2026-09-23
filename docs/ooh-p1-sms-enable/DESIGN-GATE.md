<!-- gate:contract
SECTION: What this gate is
This is the Stage 2 (design) sign-off for Stream B of R1 — the build-ready enablement design for turning ON the P1 escalation text message from the OOH Triage Dashboard to the on-duty escalation manager, which today runs in no-send "log" mode. Discovery is signed off and merged. This design does NOT flip anything, provision anything, or send any text. What you are approving is that the enablement is specified precisely enough to execute without guessing: the exact change set, the ordered two-owner runbook with its rollback, the code behaviour in each state, and the one-minute live test that proves it is genuinely in effect. Because the send code is already complete and tested, there is no code build in this stream — enablement is one environment flip plus a secret load.
SECTION: The change set in one paragraph
Two things change. First, five credential values are loaded by Spencer into the managed Kubernetes secret ooh-dashboard-secrets, referred to here by key NAME only: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, ESCALATION_ONDUTY_NUMBER and ESCALATION_ONDUTY_NAME; and IOT_DASH_BASE_URL is confirmed to point at the live IoT Support dashboard host so the deep-link in the text resolves. Second, James flips one environment variable, SMS_PROVIDER, from "log" to "twilio" via kubectl set env, and commits that one manifest line to git so the running cluster and the committed manifest do not drift. The gateway is the existing Airedale Twilio account reused — zero code cost, because the send path already speaks the Twilio REST API. Reusing that account knowingly couples OOH with the IoT Support Dashboard (shared rate limits, shared token rotation, account-level actions hit both); this design names and accepts that coupling as the price of a config-only enablement, with a dedicated OOH subaccount as the decoupling option if it ever bites. The on-duty escalation number and name are owned by IoT Support (Sam Day's team), who rotate them for shift, sickness and holiday via a request to Spencer, and the name loaded must be a real person, never the generic default — because a stale number would otherwise report a successful send to the wrong person silently.
SECTION: The access split and the order that matters
Enablement has two owners. The secret load is Spencer's — James's scoped service account cannot read or write that secret. The provider flip is James self-serve — the scoped account holds the env-patch verb. The order is fail-safe and non-negotiable: Spencer loads the secret FIRST, THEN James flips. James cannot technically verify the secret before the flip (his scoped account cannot read secrets, and the pod only picks up the values when it rolls at the flip), so the pre-flip gate is Spencer confirming the load IN WRITING; the earliest technical proof is the post-flip live test. If the flip happens with the secret absent or wrong, the code does the safe thing — it fails closed, shows the handler the "phone the manager now" card, keeps dispatchOk false, and raises an internal alert; it does not crash and it never dishonestly reports a send. That fail-closed behaviour is a REQUIRED pass criterion of the live test, not an optional extra — it is the primary safety property. Rollback is a single self-serve action: flip SMS_PROVIDER back to "log".
SECTION: How we prove it is really on
The gate does not prove enablement — the live test does. As an OOH handler on the live site, trigger a real system-decided P1 on a stable test site; pass means the on-duty manager's device receives the SMS in under 60 seconds carrying a working deep-link to the correct ticket, the outcome card shows the "sent" variant with dispatchOk true, the OohSmsLog entry reads dispatchOk true / provider twilio with the number shown only as (configured), the Zendesk #ooh-p1-dispatch comment reads SENT, no dispatch-failed alert fires, and the raw recipient number is never persisted. Because the configured recipient is currently also a Tier-1 tester, the test needs an agreed recipient or window so a real text lands sensibly, and the test P1 ticket is closed afterwards.
SECTION: Where this sits in the release
This is canary go/no-go #4 (Q-F). It is fully independent of the device-write flip: enabling SMS sends texts only and enables NO device write. WRITES_DISABLED is untouched and irrelevant to this stream — the one adjacency to remember is that WRITES_DISABLED sits next to SMS_PROVIDER in the same manifest env block, which is a later Stream-B-versus-write-flip merge touch-point, not a blocker here. Tracked as OOHDASH-73.
DECISION: Approve this enablement design to proceed to execution (Spencer loads the six secret values and confirms in writing, then James flips SMS_PROVIDER to twilio, then run the live test with fail-closed and mobile rendering as required pass criteria)? | Approve — proceed to enablement | Request changes
DETAIL: No code build in this stream. The only hard external dependency is Spencer loading the six credentials into the managed secret and confirming in writing before the flip. Open confirmations for James (each proposed, pending your call at this gate): gateway = reuse Airedale Twilio AND accept the named coupling with the IoT Support Dashboard; IoT Support (Sam Day's team) as named owner of the on-duty number/name with the manual rotation runbook and a real name required; the live-test recipient de-confliction; and Spencer's written secret-load commitment. The fail-closed "phone the manager" behaviour and mobile rendering of all three card states are now REQUIRED live-test pass criteria.
-->

# OOH Triage Dashboard — Enable the P1 escalation SMS · Stage 2 design / enablement

**Release:** OOH Triage Dashboard — R1, Stream B · **Stage:** Design · **Ticket:** OOHDASH-73 · **Date:** 2026-09-23
**Repo (verified):** `C:\repos\ooh-triage-dashboard` (owner bigtuff8), app v1.2.4, `SMS_PROVIDER="log"`, `WRITES_DISABLED="true"`.
**Input:** the signed-off, merged discovery gate `docs/ooh-p1-sms-enable/DISCOVERY-GATE.md`, and the cross-stream verdict `docs/project/releases/CROSS-STREAM_cellar-vs-p1-sms.md` (Streams A and B fully independent).
**Method:** every code claim below is traced to a file and line in the working tree. No code, config or secret is changed by this artefact; it specifies enablement, it does not perform it. No secret values appear — credentials are named by key only.
**Mockup:** `docs/ooh-p1-sms-enable/mockups/p1-outcome-card.html` — the P1 outcome card in all three states (log / twilio / fail-closed), built from the live CSS.

> **This is a CONFIG + SECRET enablement, not a code build.** The send path in `services/escalation.js` is complete and tested; the config surface in `config.js:99-108` already maps every value. Nothing in this stream writes application code. This is canary **go/no-go #4 (Q-F)** and enables **no device write** — it sends texts only.

---

## 1. The exact enablement change set

**Gateway decision (proposed — pending James's confirmation at gate): reuse the existing Airedale Twilio account and sender number** that the IoT Support Dashboard already uses in production. Rationale: the send path already targets the Twilio REST API directly via `axios` (`escalation.js:37-41`) with no SDK, so Twilio-reuse is a **zero-code-cost** enablement; any other provider would require a new branch in `sendViaProvider()` (a code change) plus a fresh account, for no operational gain. This is the recommendation unless James rules otherwise (see open decisions, §7).

**Accepted coupling risk (named, not inherited silently).** Reusing the existing Airedale Twilio account **couples OOH with the IoT Support Dashboard**: they share the same account-level rate limits, the same auth-token rotation (rotating the token for one affects both), and any account-level action (suspension, billing hold, sender-number change) hits both products at once. This design **explicitly accepts** that coupling as the cost of a zero-code-cost enablement — it is named here so it is a chosen trade-off, not an unexamined inheritance. **Decoupling option if it ever bites:** provision a dedicated OOH Twilio subaccount or a separate Messaging Service, which isolates rate limits and rotation at the price of a new account to manage (still config-only, no code change). Out of scope for this stream unless James directs otherwise.

**Change 1 — the five secret values loaded into `ooh-dashboard-secrets` (Spencer).** Referred to by key NAME only; no values in this document. The three Twilio credentials the chosen gateway needs:

- `TWILIO_ACCOUNT_SID` — the Twilio account id (read at `config.js:102`).
- `TWILIO_AUTH_TOKEN` — the Twilio auth token (read at `config.js:103`).
- `TWILIO_FROM` — the sender number the text is sent from (read at `config.js:104`).

The two recipient values that make the text correct and deep-linked:

- `ESCALATION_ONDUTY_NUMBER` — the on-duty recipient number (read at `config.js:106`). Single static recipient; there is no rota logic in the code, and a schedule-driven rota is out of scope for this enablement (see §6 for the named owner and the manual rotation runbook that governs this value, and the future-enhancement note).
- `ESCALATION_ONDUTY_NAME` — the recipient display name (read at `config.js:107`; defaults to "On-duty escalation manager" if unset). This name is the only recipient identifier ever shown or persisted, so it **must be set to a real person's name** at load time — never left to the generic "On-duty escalation manager" default, which would make the outcome card, the log and the Zendesk comment unable to tell the handler *who* was actually texted. A real name is a required part of Spencer's secret load, confirmed in writing (see §2 Step 2) and owned/rotated by IoT Support (see §6).

**Change 2 — confirm the deep-link host.** `IOT_DASH_BASE_URL` (read at `config.js:113`) must be set to the **live** IoT Support dashboard host so the deep-link `${base}/?ticket={id}` (`escalation.js:29-31`) resolves to a real ticket. Note the code default is the UAT host (`config.js:113`), so this must be explicitly set in the secret, not left to default. This is a confirm-in-place, not necessarily a new load.

**Change 3 — the provider flip (James self-serve).** `SMS_PROVIDER` from `"log"` to `"twilio"` — one line, `k8s/deployment.yaml:76-77`, applied live via `kubectl set env` and committed to git. This is the single functional switch; everything else is credentials the switched-on code then reads.

**What is NOT changed:** no application code; `WRITES_DISABLED` is untouched (`deployment.yaml:74-75`); no device-write path is enabled; the honesty test suite (`test/p1-dispatch-honesty.test.js`, OOHDASH-72 / Test 11c) must stay green and is not modified.

---

## 2. The ordered rollout runbook — access split explicit, fail-safe sequencing

The two changes have two different owners, and the order is a safety property, not a preference. The memory pod-roll finding governs it: James's scoped account holds the env-patch verb (so `set env` is self-serve) but **cannot read or write secrets** (so the credential load is Spencer's). There is **no CI that applies the manifest**, so a git-committed change alone has zero live effect — only `set env` reaches the cluster, which is why each live change is also committed to git to close the git-versus-cluster drift.

**Step 1 — Spencer loads the secret (hard external dependency, FIRST).** Load the five values (§1 Change 1) into `ooh-dashboard-secrets`, and confirm `IOT_DASH_BASE_URL` points at the live host (§1 Change 2). James's account cannot do this step. Nothing is live yet — the running pod still has `SMS_PROVIDER=log`, so the app is unaffected while the secret is populated.

**Step 2 — Spencer confirms the secret load IN WRITING (communication checkpoint, not a technical verification).** James **cannot** technically verify the secret before the flip: his scoped service account has no secret-read access, and the running pod does not reflect new `envFrom` values until it is rolled — which only happens at the flip. So the pre-flip gate is a **written confirmation from Spencer** that all **six** values are loaded into `ooh-dashboard-secrets`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `ESCALATION_ONDUTY_NUMBER`, `ESCALATION_ONDUTY_NAME` (a **real person's name**, not the default), and `IOT_DASH_BASE_URL` pointing at the **live** IoT Support host. James does not flip until that written confirmation is in hand. Be explicit about the limit of this step: the earliest **technical** confirmation that every value is correct is **post-flip** — the pod roll picks up the secret and the §4 live test proves it end to end. If any value is wrong or missing at that point, the code **fails closed** to the "phone the manager now" card and raises `sms-dispatch-failed` (see §3, State C) — that is the safety net that makes a pre-flip written confirmation, rather than a technical check, an acceptable gate.

**Step 3 — James flips the provider (self-serve, ONLY after Step 1).** `kubectl set env deployment/ooh-dashboard SMS_PROVIDER=twilio` in namespace `iot-services`. Flipping BEFORE the secret is loaded is a **safe, visible failure** (the code fails closed — see §3), not a silent one, but it is not "enabled" and it will raise an alert, so do not do it out of order.

**Step 4 — Commit the manifest line to git as applied.** Change `k8s/deployment.yaml:77` from `value: "log"` to `value: "twilio"` and commit, so the audit trail and the running cluster agree and a future full re-apply cannot silently revert the flip. This is a Stream-B-only edit; note for later that `WRITES_DISABLED` (line 74-75) sits directly above and is the eventual write-flip's line — a Stream-B-versus-write-flip merge touch-point, not a concern for this step.

**Step 5 — Run the live test (§4) before declaring the P1 SMS live.** "Live means in effect, not merely wired" — the flip alone is not proof.

**Abort / rollback (single self-serve action).** If anything is wrong, `kubectl set env deployment/ooh-dashboard SMS_PROVIDER=log` returns the system to today's safe no-send behaviour immediately (a pod-roll; abort SLA equals pod-roll time), and revert the git line to match. No secret needs to be removed to abort — with the provider back on `log`, the loaded credentials are simply unread. Rollback enables nothing and loses nothing.

---

## 3. Code behaviour at each state (build-ready, verified to file:line)

The same code serves all states; only `SMS_PROVIDER` and the presence of credentials differ. The mockup renders all three.

**State A — log mode (today).** `sendViaProvider()` takes the non-twilio branch (`escalation.js:44-47`): it logs a "would send" line and returns `{ provider:'log', sent:false }`. Back in `escalateP1`, `entry.dispatchOk = (result?.sent !== false)` (`escalation.js:77`) therefore stays **false**. The record is upserted to `OohSmsLog` with `provider:'log'`, `dispatchOk:false`, and `sentToNumber` = `(configured)` or `(not configured)` — **never the raw number** (`escalation.js:65`). The outcome card (`flows.js:170-172`) renders the red **"Text not sent — phone the on-duty manager now"** variant, and the Zendesk `#ooh-p1-dispatch` corrective comment says NOT SENT. This honest no-op is locked by Test 11c and must remain true.

**State B — twilio mode (enabled).** With `provider='twilio'` and all three Twilio credentials present, `sendViaProvider()` POSTs to `https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` with HTTP basic auth and a 15-second timeout (`escalation.js:37-41`) and returns `{ provider:'twilio', sent:true }`. `dispatchOk` becomes **true** (`escalation.js:77`). The card (`flows.js:170-171`) renders the **"A text message has been sent to the on-duty escalation manager at HH:MM, with a direct link to ticket #{id}"** variant; `OohSmsLog` shows `dispatchOk:true`, `provider:'twilio'`, number still `(configured)`; and the Zendesk comment reads SENT. The message body is `OOH P1 — {siteName} ({siteNo}): {summary}. Ticket #{id}: {deep-link}` (`escalation.js:56`).

**State C — fail-closed (twilio selected, creds missing or invalid).** This is the safety net and must be verified as part of enablement. If `accountSid || authToken || from` is falsy, `sendViaProvider()` **throws** "Twilio provider selected but not configured" (`escalation.js:36`); if Twilio rejects the request, `axios` throws. Either way the `try/catch` in `escalateP1` (`escalation.js:73-81`) catches it: **no crash**, `dispatchOk` stays **false**, and `raiseAlert('sms-dispatch-failed', …)` fires (`escalation.js:80`). The handler sees the **same "phone the manager now"** card as log mode — the escalation outcome is never blocked by an SMS failure. This is the intended behaviour if Step 3 is ever run before Step 1, which is exactly why the ordering is safe.

**Invariant across all states:** SMS failure never blocks the P1 outcome (the ticket is still raised), and the raw recipient number is never persisted to the log, the artefact, or the Zendesk comment — status only.

---

## 4. End-to-end LIVE test design (defined here, executed after the flip)

Do not execute until Steps 1–4 of §2 are complete.

**Preconditions:**

- The five secret values loaded and `IOT_DASH_BASE_URL` = the live host (§1).
- `SMS_PROVIDER=twilio` on the running pod, pod healthy on `/healthz`.
- An **agreed test recipient or test window** — the configured recipient currently also acts as a Tier-1 tester (recorded in OOHDASH-73), so coordinate so a real out-of-hours-style text does not confuse a real person mid-shift. This de-confliction is a precondition, not an afterthought.
- A **stable, known test device/site** for the trigger, so a concurrent Stream A cellar reclassification cannot muddy the P1 (per the cross-stream hygiene note). `WRITES_DISABLED` state is irrelevant — this test enables no control.

**Steps:**

- Sign in as an OOH handler on the live site.
- Run a flow that yields a **system-decided P1** on the test site — one of the three current auto-P1 outcomes: kitchen equipment-off-during-service, fridge stock-at-risk, or contractor-on-site.
- Complete the outcome; start a stopwatch the moment the P1 is raised.
- Read the P1 outcome card — it should render the **"a text message has been sent"** variant, not "Text not sent".
- Confirm the recipient device receives the SMS, and that it carries a **working deep-link** to the just-created ticket.
- Click the deep-link; confirm it lands on the correct ticket detail in the IoT Support dashboard.
- Check the Zendesk `#ooh-p1-dispatch` corrective comment reads SENT.
- Check the `OohSmsLog` entry for the ticket: `dispatchOk:true`, `provider:'twilio'`, number shown as `(configured)`.

**Required fail-closed scenario (State C) — the primary safety property, NOT optional.** In addition to the happy-path steps above, the live test **must** exercise the fail-closed path and confirm it behaves safely. Trigger it by observing State C on the pre-flip pod, or by a deliberately mis-ordered/mis-configured flip (provider `twilio` with a credential absent or invalid), then raise a system-decided P1 and confirm the safe outcome. This is the property the whole enablement rests on — if it does not hold, the enablement is not safe to ship, regardless of the happy path passing.

**Pass criteria (all must hold):**

- SMS received in **under 60 seconds** of the P1 being raised.
- Message body contains a working deep-link resolving to the **correct** ticket.
- `dispatchOk:true` in the returned outcome, in `OohSmsLog`, and reflected as SENT in the Zendesk comment; card shows the sent variant.
- **No** `sms-dispatch-failed` alert raised on the happy path.
- The **raw recipient number is never persisted** (status only, `(configured)`).
- The `ESCALATION_ONDUTY_NAME` shown on the sent card, in `OohSmsLog` and in the Zendesk comment is the **real on-duty person's name**, not the generic "On-duty escalation manager" default — proving the name was loaded correctly.
- **Fail-closed (REQUIRED):** in the State C scenario above, the handler sees the safe **"phone the on-duty manager now"** card, the app does **not** crash, `dispatchOk` stays **false**, no dishonest SENT is recorded, and an `sms-dispatch-failed` alert **is** raised. This is a required pass criterion — the live test does not pass without it.
- **Responsive/mobile rendering (REQUIRED sign-off):** on a phone-width viewport, confirm all three P1 outcome-card states render cleanly — the sent variant (timestamp + deep-link must both be readable and the deep-link tappable), the log/no-send variant, and the fail-closed variant. The handler journey includes reading this card on a mobile device out of hours, so a broken sent-variant on mobile is a fail.

**Cleanup:** the test raises a real urgent Zendesk P1 ticket — close/delete it afterwards and note it was internal-only, as prior discovery walks did with their test tickets.

---

## 5. Go/no-go position and traceability

- This is **James go/no-go #4 (Q-F)** — the SMS lever. It is **independent of device writes** (go/no-go #3): enabling SMS sends texts only and enables **no** device control. `WRITES_DISABLED` is untouched.
- **One hard external dependency:** Spencer loading the six secret values (five credentials plus the live `IOT_DASH_BASE_URL`) and confirming in writing before the flip (§2 Step 2). Everything else is James self-serve.
- **Later merge touch-point (not a blocker here):** the eventual OOHDASH-19 write-flip edits `WRITES_DISABLED` one line above `SMS_PROVIDER` in the same manifest env block — coordinate that merge when it arrives (Stream B ↔ write-flip), independent of Stream A.
- **Link:** OOHDASH-73 (https://airedale-api.atlassian.net/browse/OOHDASH-73).

---

## 6. On-duty recipient — named owner and rotation runbook (proposed — pending James's confirmation at gate)

`ESCALATION_ONDUTY_NUMBER` and `ESCALATION_ONDUTY_NAME` are a **single static pair** the code reads at send time; there is no rota logic. That makes a stale value a **silent failure mode**: if the number belongs to someone off shift, sick or on holiday, the code still returns `dispatchOk:true` and posts a **SENT** Zendesk comment — the text simply lands with the wrong person and **nothing alerts**. This section closes that gap with a named owner and a manual rotation process. It is **proposed pending James's confirmation at gate.**

**Named owner.** **IoT Support (Sam Day's team) owns `ESCALATION_ONDUTY_NUMBER` and `ESCALATION_ONDUTY_NAME`** — they are accountable for the value being correct and current, and for the name being a **real person**, never the generic "On-duty escalation manager" default.

**Rotation runbook (owned by IoT Support / ops), for shift change, sickness or holiday:**

- IoT Support determines who the on-duty escalation manager is for the period, and their contact number.
- Because secret-write is **Spencer-only** (James's scoped account cannot write it), IoT Support **requests the secret update via Spencer**, giving the new number and the new real name for `ESCALATION_ONDUTY_NUMBER` / `ESCALATION_ONDUTY_NAME`.
- Spencer updates `ooh-dashboard-secrets` and confirms the change back in writing (as in §2 Step 2).
- **Verification step (mandatory):** after the pod picks up the change, IoT Support confirms the **right person is reachable** on the configured number — e.g. a controlled test P1 or an agreed check text — so a mistyped or stale number is caught immediately rather than at the next real P1. The outcome card / log now showing the **correct real name** is the visible confirmation.

**Future enhancement (explicitly out of scope for this config + secret stream):** a schedule-driven rota lookup — the app resolving the current on-duty manager from an IoT Support shift schedule instead of a static secret — would remove the manual request-via-Spencer step and the staleness risk entirely. That is application work (a code change), not config, and is deliberately **not** part of this enablement.

---

## 7. Open decisions for James

- **Gateway confirmation.** Confirm Twilio-reuse (existing Airedale account and from-number) as recommended, and confirm you **accept the named coupling risk** with the IoT Support Dashboard (shared rate limits, token rotation, account-level actions — see §1), rather than a new/dedicated OOH subaccount or a different provider (which would be a code change, not config).
- **On-duty recipient ownership.** Confirm **IoT Support (Sam Day's team) as the named owner** of `ESCALATION_ONDUTY_NUMBER` / `ESCALATION_ONDUTY_NAME` and the manual rotation runbook in §6, with a real name required in the secret.
- **Recipient de-confliction.** Agree the live-test recipient or window given the recipient currently doubles as a Tier-1 tester.
- **Spencer secret-load commitment.** Confirm Spencer will load the **six** values into `ooh-dashboard-secrets` (the five credentials plus `IOT_DASH_BASE_URL` = live host) and **confirm in writing** before the flip — the single hard dependency that must precede it (§2 Step 2).

---

## How to review

Approve to proceed to enablement (Spencer loads the secret; James flips `SMS_PROVIDER` to `twilio` and commits the line; run the live test), or request changes. This gate itself changes nothing, provisions nothing, and sends nothing.

*All line numbers cited against the working tree at v1.2.4, 2026-09-23. Prose + bullets only, no tables, no secrets. Design only — the orchestrator governs any gate, flip, provision, commit or PR.*
