<!-- gate:contract
SECTION: What this gate is
This is the Stage 2 (design) sign-off for Stream B of R1 — the build-ready design for turning ON the P1 escalation text message from the OOH Triage Dashboard to the on-duty escalation manager, which today runs in no-send "log" mode. Discovery is signed off and merged. This design does NOT flip anything, provision anything, or send any text. Two things changed since the last revision, both from James's change-requests at the design gate. First, this is NO LONGER a pure config-plus-secret stream: it now carries ONE small code change — a fail-closed guard so the escalation text fires ONLY for P1s raised from the OOH dashboard and NEVER for a business-as-usual (BAU) alarm. Second, the Spencer dependency has been re-examined against the evidence and largely dissolved: the on-duty recipient values and the deep-link host are already in the managed secret, so the only credential still to provide is the three-value Twilio set — and James may be able to self-serve even that. What you are approving is that the scope guard, the enablement change set, the revised access split with its rollback, and the one-minute live test are specified precisely enough to execute without guessing.
SECTION: The OOH-only scope guard (the new code change)
The P1 escalation text must fire ONLY for a P1 raised from the OOH dashboard, never for a BAU alarm. The good news from the code: this is ALREADY true by construction — the send function escalateP1 has exactly one caller, the OOH dashboard's own outcome endpoint, and it only runs when an OOH handler completes a P1 escalation. BAU P1 alarms are created by ThingsBoard's own rule chain straight into Zendesk and never enter this app at all, so they physically cannot trigger the text. This design HARDENS that guarantee into an explicit, fail-closed code guard so it cannot be broken by a future change: escalateP1 will only send when it is told, by the OOH outcome path, that this P1 carries the OOH categorisation the dashboard stamps on every ticket it creates (the ooh / ooh_p1 tags and the "Support Request" ticket-category, subject prefix [OOH]). If the origin is missing, unknown or anything other than the OOH marker, the guard does NOT send the text — it shows the handler the honest "phone the manager now" card, keeps the record marked not-sent, and raises an internal alert. It errs toward NOT sending. This is a small, additive code change for the build stage, not a config flip — so this stream now needs a short build step before the enablement.
SECTION: The enablement change set in one paragraph
Two things then change to enable sending. First, the Twilio account credentials must be present — but only THREE values are actually outstanding: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (named by key only, no values here). The two recipient values (ESCALATION_ONDUTY_NUMBER, ESCALATION_ONDUTY_NAME) and the deep-link host (IOT_DASH_BASE_URL) are already provisioned in the managed secret ooh-dashboard-secrets per the deployment record, so they are confirm-in-place, not fresh loads. Second, James flips one environment variable, SMS_PROVIDER, from "log" to "twilio" via kubectl set env — that command must set exactly that ONE key and must NOT touch WRITES_DISABLED, which sits next to it in the manifest — and commits that one manifest line to git so cluster and manifest do not drift. The gateway is the existing Airedale Twilio account reused, which knowingly couples OOH with the IoT Support Dashboard (shared rate limits, shared token rotation); this design names and accepts that coupling as the price of a zero-provider-code enablement, with a dedicated OOH subaccount as the decoupling option if it ever bites. The on-duty number and name are owned by IoT Support (Sam Day's team), who rotate them via a request to Spencer, and the name loaded must be a real person, never the generic default — because a stale number would otherwise report a successful send to the wrong person silently.
SECTION: Why Spencer may not be needed, and the access split
The previous revision said Spencer must load six secret values first. The evidence corrects that. The on-duty recipient pair and the deep-link host are ALREADY in the managed secret (deployment record), so they are not a Spencer load — only a confirmation that their VALUES are current (a real on-duty person, and the live host). That leaves only the three Twilio values genuinely outstanding, and there are TWO paths to them. Path A (Spencer, cleaner on secret hygiene): Spencer loads the three TWILIO_ values into ooh-dashboard-secrets, keeping the auth token inside the managed secret. Path B (James self-serve, no Spencer): IF James holds the Twilio account credentials he proved earlier, he can set the three values himself as plain environment variables with kubectl set env — his scoped account has the env-patch verb, and a plain env value overrides the secret for that key — accepting the named tradeoff that the auth token then sits in plaintext in the deployment env and creates a git-versus-cluster drift he must record. So the honest answer to "why do we need Spencer": we do NOT, for capability — the only thing Spencer uniquely buys is keeping the Twilio auth token in the managed secret rather than in plaintext env. The one thing this design cannot verify from the repo or the integration record is whether James still holds those Twilio account credentials; that is the single confirmation that decides Path A versus Path B. The provider flip itself is James self-serve either way. The order is fail-safe: credentials present (Path A confirmed in writing by Spencer, or Path B set by James) FIRST, then the flip. The flip command sets exactly ONE key, SMS_PROVIDER, and never WRITES_DISABLED. Rollback is one self-serve action: flip SMS_PROVIDER back to "log".
SECTION: How we prove it is really on
The gate does not prove enablement — the live test does. As an OOH handler on the live site, trigger a real system-decided P1 on a stable test site; pass means the on-duty manager's device receives the SMS in under 60 seconds carrying a working deep-link that, when tapped, opens the CORRECT real ticket in the live IoT Support dashboard (this deep-link check is the guard against a wrong IOT_DASH_BASE_URL, which does NOT fail closed), the outcome card shows the "sent" variant, the OohSmsLog entry reads dispatchOk true / provider twilio with the number shown only as (configured), the Zendesk #ooh-p1-dispatch comment reads SENT, no dispatch-failed alert fires, and the raw recipient number is never persisted. Two safety properties are proven in the automated test suite, NEVER by misconfiguring the live pod: the credential fail-closed path (provider twilio but creds missing/invalid to an honest "phone the manager" card, dispatchOk false, alert, no crash), and the new OOH-origin guard (a non-OOH / BAU origin is NOT paged, while an OOH-origin P1 is). Because the configured recipient currently doubles as a Tier-1 tester, the live test needs an agreed recipient or window, with James (OOHDASH-73) the named owner; the test P1 ticket is closed afterwards.
SECTION: Where this sits in the release
This is canary go/no-go #4 (Q-F). It is fully independent of the device-write flip: enabling SMS sends texts only and enables NO device write. WRITES_DISABLED is untouched — the one adjacency to remember is that it sits next to SMS_PROVIDER in the same manifest env block, a merge touch-point, not a blocker here. Because this revision adds a small code change (the OOH-origin guard), the stream now has a short build-and-test step before the enablement runbook. Tracked as OOHDASH-73.
DECISION: Approve this design to proceed — build the fail-closed OOH-origin guard and its test, then enable (Twilio credentials present via Spencer OR James self-serve, then James flips ONLY SMS_PROVIDER to twilio, then run the live test with the correct-live-ticket deep-link check, and the credential and origin fail-closed paths proven in the test suite, not on prod)? | Approve — proceed | Request changes
DETAIL: This revision answers two James change-requests. (1) Spencer dependency questioned: the evidence shows only the three TWILIO_ values are outstanding — the recipient pair and deep-link host are already in the secret — and James can self-serve even those via plain env if he holds the Twilio credentials, accepting a plaintext-token tradeoff; the sole open confirmation is whether he still holds those credentials (Path A Spencer vs Path B self-serve). (2) OOH-only scoping: escalateP1 is already OOH-only by construction (single caller, BAU alarms never enter the app); this design hardens it with an explicit fail-closed guard keyed on the OOH ticket categorisation, a small code change for build. Open confirmations for James (each proposed, pending your call): the exact OOH categorisation identifier the guard keys on (proposed: the ooh_p1 tag plus the "Support Request" ticket-category / [OOH] subject the dashboard already stamps); whether you hold the Twilio account credentials (decides Path A vs B); gateway = reuse Airedale Twilio and accept the named IoT-Support coupling; IoT Support (Sam Day's team) as owner of the on-duty number/name with a real name required; a backup secret-writer plus emergency break-glass so Spencer is not a single point of failure; the live-test recipient de-confliction (owner James / OOHDASH-73). Recommended near-term follow-ups (out of scope here): SMS call-to-action line, manager-acknowledgment loop, base-URL validation in the guard.
-->

# OOH Triage Dashboard — Enable the P1 escalation SMS · Stage 2 design / enablement

**Release:** OOH Triage Dashboard — R1, Stream B · **Stage:** Design · **Ticket:** OOHDASH-73 · **Date:** 2026-09-23
**Repo (verified):** `C:\repos\ooh-triage-dashboard` (owner bigtuff8), app v1.2.4, `SMS_PROVIDER="log"`, `WRITES_DISABLED="true"`.
**Input:** the signed-off, merged discovery gate `docs/ooh-p1-sms-enable/DISCOVERY-GATE.md`, and the cross-stream verdict `docs/project/releases/CROSS-STREAM_cellar-vs-p1-sms.md` (Streams A and B fully independent).
**Method:** every code claim below is traced to a file and line in the working tree, and every access claim to the integration record. No code, config or secret is changed by this artefact; it specifies the work, it does not perform it. No secret values appear — credentials are named by key only.
**Mockup:** `docs/ooh-p1-sms-enable/mockups/p1-outcome-card.html` — the P1 outcome card in all three states (log / twilio / fail-closed), built from the live CSS.

> **This revision answers two design-gate change-requests from James.** (1) The Spencer dependency has been re-examined against the evidence and largely dissolved (§1, §2). (2) A new functional constraint — the escalation text must fire ONLY for OOH-dashboard P1s, never for BAU alarms — is designed as a **small, fail-closed code guard** (§1A, §3). Because of (2), **this stream is no longer pure config + secret**: it carries one additive code change that must be built and tested before enablement. It remains canary **go/no-go #4 (Q-F)** and enables **no device write**.

---

## 1A. The OOH-only scope guard — new functional constraint (a code change)

**The requirement.** The P1 escalation text must fire **only** for a P1 **raised from the OOH dashboard**, and **never** for a BAU P1 alarm.

**What the code already guarantees (verified).** This constraint is **already met by construction today**, and the evidence is strong:

- `escalateP1` has **exactly one caller** in application code: `routes/api.js:272`, inside the `POST /outcomes` handler, reached **only** when `isP1 = (type === 'escalate-p1')` is true (`api.js:253`). It fires **only** when an OOH handler completes a P1 escalation **in the OOH dashboard**. (Verified: `git grep escalateP1` returns only this call site, the definition, and comments/tests.)
- The module header states the invariant explicitly: *"only flow outcomes call escalateP1 — dashboard-originated ticket updates never route through this module"* (`escalation.js:14-16`).
- **BAU P1 alarms never enter this app.** Per the integration record (CIR `docs/THINGSBOARD_ZENDESK_INTEGRATION.md`), BAU alarm tickets are created by ThingsBoard's **own rule chain** ("Alarm informing email/sms", Node 56) POSTing **directly** to Zendesk (org `13169808933020`, alarm group `11404229989916`). They do **not** pass through the OOH dashboard, so they **cannot** reach `escalateP1`.

So James's instinct is right, and better than right: there is a defined OOH categorisation, **and** BAU alarms are on a completely separate rail that never touches the send path.

**What this design adds — hardening the guarantee, fail-closed (the code change).** Relying on "there is only one caller" is a **structural** guarantee that a future refactor (e.g. someone later wiring an alarm-driven auto-P1 into the dashboard) could silently break. This design makes the guarantee **explicit and enforced in code**, fail-closed:

- **Marker checked (proposed — pending James's confirmation at gate).** The OOH dashboard stamps a **specific categorisation** on every ticket it creates, which BAU alarm tickets do **not** carry:
  - the `ooh` tag on every OOH ticket and the `ooh_p1` tag on every P1 escalation (`api.js:267`, `zendesk.js:303`);
  - the Ticket **Category** custom field `config.zendesk.categoryFieldId` (`25999250486684`) set to `config.zendesk.categoryValue` = `tcat_support_request` ("Support Request", F002 — `config.js:76-79`, `zendesk.js:279`);
  - the `[OOH]` subject prefix (`zendesk.js:300`).
  The **most OOH-exclusive** of these are the `ooh_p1` tag and the `[OOH]` subject — a BAU alarm ticket carries neither. The **proposed** discriminator is the `ooh_p1` tag (with the "Support Request" category as the durable secondary marker). **James to confirm the exact identifier** that uniquely marks an OOH-dashboard P1, and confirm BAU alarm tickets can never carry it.
- **Where the guard goes.** Thread an explicit `origin` argument from the sole call site (`routes/api.js:272`) into `escalateP1` (`escalation.js:54`). The OOH outcome path sets `origin: 'ooh-dashboard'` **because it has itself just created an OOH-categorised ticket** (tag `ooh`/`ooh_p1`, category `tcat_support_request`, `[OOH]` subject) at `api.js:260-268` — the flag is the in-code proxy for "this P1 carries the OOH categorisation." At the **top of `escalateP1`**, before building the body or calling `sendViaProvider()`, add the guard.
- **Fail-closed behaviour (err toward NOT sending).** If `origin` is **absent, unknown, or anything other than** the confirmed OOH marker, the guard **does not call the provider**. It records the `OohSmsLog` entry with `dispatchOk:false` and a distinct reason, raises an internal alert (proposed name `p1-escalation-origin-unverified`), and returns — so the handler still gets the **honest "phone the on-duty manager now"** card (the same safe surface as log mode). The `origin` parameter **defaults to undefined**, so any future caller that does **not** explicitly assert OOH origin **cannot page** — that is the fail-closed default.

**Scope of the change (for the build stage).** This is a **small, additive code change** in two files — a new `origin` parameter and guard in `services/escalation.js:54`, and passing `origin: 'ooh-dashboard'` at `routes/api.js:272` — plus a new test case (§3, §4). It touches **no** send mechanics and **no** device-write path. It must be built and its test green **before** the enablement runbook (§2) runs.

---

## 1. The exact enablement change set

**Gateway decision (proposed — pending James's confirmation at gate): reuse the existing Airedale Twilio account and sender number** that the IoT Support Dashboard already uses. Rationale: the send path already targets the Twilio REST API directly via `axios` (`escalation.js:37-41`) with no SDK, so Twilio-reuse is a **zero-provider-code** enablement; any other provider would require a new branch in `sendViaProvider()` (a code change) plus a fresh account, for no operational gain.

**Accepted coupling risk (named, not inherited silently).** Reusing the existing Airedale Twilio account **couples OOH with the IoT Support Dashboard**: shared account-level rate limits, shared auth-token rotation (rotating the token for one affects both), and any account-level action (suspension, billing hold, sender-number change) hits both products at once. This design **explicitly accepts** that coupling as the cost of a zero-provider-code enablement. **Decoupling option if it ever bites:** a dedicated OOH Twilio subaccount or a separate Messaging Service, which isolates rate limits and rotation at the price of a new account to manage (still config-only, no code change). Out of scope for this stream unless James directs otherwise.

**What is ALREADY provisioned (evidence-based — this is the correction to the prior "six values" framing).** Per the deployment record (CIR `OOH_DASHBOARD_DEPLOY.md`, which enumerates the contents of `ooh-dashboard-secrets`), the secret **already contains** `ESCALATION_*` (the on-duty recipient pair) and `IOT_DASH_BASE_URL` (the deep-link host). The manifest comment agrees (`deployment.yaml:78-81`). So these are **confirm-in-place**, not fresh loads:

- `ESCALATION_ONDUTY_NUMBER` — the on-duty recipient number (read at `config.js:106`). **Already in the secret**; confirm the **value is a current on-duty person** (see §6 rotation runbook).
- `ESCALATION_ONDUTY_NAME` — the recipient display name (read at `config.js:107`; defaults to "On-duty escalation manager" if unset). **Already in the secret**; confirm it is set to a **real person's name**, never the generic default — that name is the only recipient identifier ever shown or persisted (`escalation.js:64-65`).
- `IOT_DASH_BASE_URL` — the deep-link host (read at `config.js:113`). **Already in the secret** and, per the manifest note (`deployment.yaml:80-81`) and prior memory, already set to the **live** IoT Support host (`https://zendesk-uat.airedale-api.co.uk` — the "uat" in the name is historical; it is the live host). Confirm-in-place.

**Change 1 — the ONLY outstanding credential load: the three Twilio values.** Referred to by key NAME only; no values in this document. These are **not** in the secret today (absent from the CIR secret enumeration) and are the sole genuine outstanding credential:

- `TWILIO_ACCOUNT_SID` — the Twilio account id (read at `config.js:102`).
- `TWILIO_AUTH_TOKEN` — the Twilio auth token (read at `config.js:103`).
- `TWILIO_FROM` — the sender number the text is sent from (read at `config.js:104`).

These three can be provided by **either** path in §2 (Spencer to the managed secret, or James self-serve via plain env). See §2 for the split and the tradeoff.

**A note on the "March proof" (evidence).** James recalls proving the Twilio account credentials and building/testing the text capability "back in March." The **capability** is real and present: `escalation.js` speaks the Twilio REST API directly and is covered by `test/p1-dispatch-honesty.test.js`. But in **this** repo that path first landed on **2026-07-11** (the consolidated app skeleton, `git log`), so the March work predates this codebase — it was an earlier prototype. And the Twilio **account credentials themselves are not evidenced anywhere the design could check**: there is **zero** `twilio` reference across the entire CIR, no Twilio entry in the CIR credential store, and `TWILIO_*` is **absent** from the documented `ooh-dashboard-secrets` contents. **Conclusion:** the capability is proven; the *credentials* are not discoverable from the record. Whether James still **holds** those account credentials is the single confirmation that decides Path A vs Path B in §2. If they are lost or never persisted, a Twilio account + sender number must be (re)obtained regardless of who loads it — that is a provisioning precondition, not a code or design blocker.

**Base-URL correctness is NOT covered by the fail-closed credential guard — this precise distinction stands.** The credential guard at `escalation.js:36` checks **only** `accountSid || authToken || from`; it does **not** inspect `iotDashBaseUrl`, which is consumed unchecked at `escalation.js:30`. So if `IOT_DASH_BASE_URL` were wrong, the text would still send, Twilio would return 2xx, `dispatchOk` would be **true**, and **no** alert would fire — a **silent wrong deep-link**, not a fail-closed. This is why only **credential** failures fail closed; **base-URL** correctness does not. Because `IOT_DASH_BASE_URL` is already provisioned and set to the live host (above), the residual risk is low, but it is still guarded two ways, both required: (a) a written confirmation that it is the **live** host; and (b) the **required** live-test check that the received link opens the **correct** live ticket (§4). **Future hardening (out of scope now — a code change):** extend the guard to validate `iotDashBaseUrl` before enabling twilio.

**Change 2 — the provider flip (James self-serve).** `SMS_PROVIDER` from `"log"` to `"twilio"` — one line, `k8s/deployment.yaml:76-77`, applied live via `kubectl set env` and committed to git. This is the single functional switch; everything else is credentials the switched-on code then reads.

**What is NOT changed by the flip:** `WRITES_DISABLED` is untouched (`deployment.yaml:74-75`); no device-write path is enabled. The honesty test suite (`test/p1-dispatch-honesty.test.js`, OOHDASH-72 / Test 11c) must stay green; §1A adds the OOH-origin guard case to it, and §3/§4 add the missing-credential guard-throw case — both additive, neither alters the existing State C assertions.

---

## 2. The ordered runbook — build first, then enable; access split explicit, fail-safe sequencing

Because §1A adds a code change, the stream now has a **build-and-test step before enablement**. The enablement itself has a two-owner split whose order is a **safety property**. The governing access fact (from the integration record and the pod-roll memory): James's scoped account holds the env-patch verb (so `kubectl set env` is self-serve) but **cannot read or write secrets** (so a managed-secret load is Spencer's). There is **no CI that applies the manifest**, so a git-committed change alone has zero live effect — only `set env` reaches the cluster, which is why each live change is also committed to git to close the drift.

**Step 0 — Build the OOH-origin guard and its test (Build stage, before any enablement).** Implement §1A: the `origin` parameter + fail-closed guard in `escalation.js`, the `origin: 'ooh-dashboard'` argument at `api.js:272`, and the new test case (§3/§4). `npm test` green is the gate to proceed. No secret and no flip happen in this step.

**Step 1 — Ensure the Twilio credentials are present (the ONLY outstanding credential — choose Path A or Path B).** The recipient pair and deep-link host are already in the secret (§1); confirm their values are current. For the three `TWILIO_*` values, choose one path:

- **Path A — Spencer loads the three TWILIO_ values into `ooh-dashboard-secrets` (cleaner on secret hygiene).** The auth token stays inside the managed secret. James's account cannot do this step. Nothing is live yet — the running pod still has `SMS_PROVIDER=log`.
- **Path B — James self-serve via plain env (no Spencer), IF he holds the Twilio credentials.** `kubectl set env deployment/ooh-dashboard TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=...` in `iot-services`. His scoped account holds the env-patch verb, and a plain `env` value **overrides** the `envFrom` secret for that key, so the switched-on code reads them. **Named tradeoff, explicitly accepted if chosen:** the **auth token then sits in plaintext in the deployment env** (visible to anyone with deployment-read, not just secret-read), and it **creates git-versus-cluster drift** that must be recorded. This is the price of not needing Spencer. It is a **last-resort / expedient** path, not the preferred steady state — migrate the values into the managed secret (Path A) when a secret-writer is available.

**Which path, and the honest bottom line on Spencer.** For **capability**, Spencer is **not required** — the recipient pair and host are already provisioned, and the Twilio trio can be self-served via Path B. The **only** thing Spencer uniquely provides is keeping the Twilio auth token in the **managed secret** rather than plaintext env. **The single confirmation that decides the path is whether James still holds the Twilio account credentials** (his earlier proof). If yes and he accepts the plaintext-token tradeoff, Path B needs no Spencer at all. If he prefers secret hygiene, Path A uses Spencer for that one load only.

**Step 2 — Credentials-present confirmation (before the flip).** For **Path A**, the pre-flip gate is a **written confirmation from Spencer** that the three `TWILIO_*` values are loaded, plus that `ESCALATION_ONDUTY_NAME`/`_NUMBER` are a real current person and `IOT_DASH_BASE_URL` = the live host (James's scoped account cannot read the secret to verify, and the pod only reflects new `envFrom` values when it rolls at the flip). For **Path B**, James has set the values himself, so the confirmation is his own record of the `set env` (and he still confirms the recipient/host values are current). The earliest **technical** confirmation either way is **post-flip** — the §4 live test. The credential fail-closed net (§3 State C) is what makes a pre-flip confirmation acceptable for the credentials; the base URL relies on the confirmation plus the deep-link test, not on fail-closed.

**Step 3 — James flips the provider (self-serve, ONLY after Step 1).** `kubectl set env deployment/ooh-dashboard SMS_PROVIDER=twilio` in namespace `iot-services`. Flipping BEFORE credentials are present is a **safe, visible failure** (the code fails closed on missing credentials — §3 State C), not a silent one, but do not do it out of order.

**Guardrail — the flip touches exactly ONE key, and that key is never `WRITES_DISABLED`.** The `kubectl set env` command **must** set **only** `SMS_PROVIDER=twilio` and **must not** include `WRITES_DISABLED` (or any other key) in the same invocation. `WRITES_DISABLED` sits directly adjacent to `SMS_PROVIDER` in the env block (`deployment.yaml:74-77`), so a copy-paste or multi-key `set env` is an **accidental device-enable risk**. **Named risk:** an accidental `WRITES_DISABLED=false` would silently arm the device-write path this stream is independent of. (Note: if Path B is used, the `TWILIO_*` `set env` in Step 1 is a **separate** invocation and likewise must not include `WRITES_DISABLED`.) **Verification (required):** immediately after the flip, confirm the command changed a **single** key — inspect the resulting deployment env and confirm `WRITES_DISABLED` is unchanged (still `"true"`). If more than one key changed, treat it as an incident and roll back.

**Step 4 — Commit the manifest line to git as applied.** Change `k8s/deployment.yaml:77` from `value: "log"` to `value: "twilio"` and commit, so the audit trail and the running cluster agree and a future re-apply cannot silently revert the flip. (If Path B was used, note in the commit/PR that `TWILIO_*` are set as plain env pending migration to the secret, so the drift is recorded, not hidden.)

**Step 5 — Run the live test (§4) before declaring the P1 SMS live.** The flip alone is not proof — "live means in effect, not merely wired."

**Abort / rollback (single self-serve action).** `kubectl set env deployment/ooh-dashboard SMS_PROVIDER=log` returns the system to today's safe no-send behaviour immediately (a pod-roll; abort SLA equals pod-roll time), and revert the git line to match. No secret or env value needs removing to abort — with the provider back on `log`, the credentials are simply unread. Rollback enables nothing and loses nothing.

---

## 3. Code behaviour at each state (build-ready, verified to file:line)

The same code serves all states; only `SMS_PROVIDER`, the presence of credentials, and (new) the P1 **origin** differ. The mockup renders the three send states.

**State 0 — origin guard (NEW, §1A).** Before any send, `escalateP1` checks the `origin` it was passed. If `origin` is not the confirmed OOH marker (absent / unknown / any BAU value), it **does not** call `sendViaProvider()`: it records `OohSmsLog` with `dispatchOk:false` and a distinct reason, raises `p1-escalation-origin-unverified` (proposed), and returns — the handler sees the honest "phone the on-duty manager now" card. The sole live caller (`api.js:272`) passes `origin: 'ooh-dashboard'`, so a genuine OOH P1 proceeds to States A–C below; a BAU or unknown origin never reaches them. Fail-closed by default (undefined origin ⇒ no send).

**State A — log mode (today).** `sendViaProvider()` takes the non-twilio branch (`escalation.js:44-47`): logs a "would send" line and returns `{ provider:'log', sent:false }`. `entry.dispatchOk = (result?.sent !== false)` (`:77`) stays **false**. The record is upserted to `OohSmsLog` with `provider:'log'`, `dispatchOk:false`, `sentToNumber` = `(configured)`/`(not configured)` — **never the raw number** (`:65`). The outcome card renders the red **"Text not sent — phone the on-duty manager now"** variant; the Zendesk `#ooh-p1-dispatch` comment says NOT SENT. Locked by Test 11c.

**State B — twilio mode (enabled, OOH origin).** With `provider='twilio'`, all three Twilio credentials present, and a valid OOH origin, `sendViaProvider()` POSTs to Twilio with HTTP basic auth and a 15s timeout (`:37-41`) and returns `{ provider:'twilio', sent:true }`. `dispatchOk` becomes **true** (`:77`). The card renders the **"a text message has been sent … with a direct link to ticket #{id}"** variant; `OohSmsLog` shows `dispatchOk:true`, `provider:'twilio'`, number still `(configured)`; the Zendesk comment reads SENT. Body: `OOH P1 — {siteName} ({siteNo}): {summary}. Ticket #{id}: {deep-link}` (`:56`).

**State C — credential fail-closed (twilio selected, creds missing or invalid).** The safety net, verified in the **test suite / non-prod**, never by misconfiguring the live pod. If `accountSid || authToken || from` is falsy, `sendViaProvider()` **throws** (`:36`); if Twilio rejects, `axios` throws. Either way the `try/catch` in `escalateP1` (`:73-81`) catches it: **no crash**, `dispatchOk` stays **false** (initialised false at `:69`, only true on a genuine send at `:77`), and `raiseAlert('sms-dispatch-failed', …)` fires (`:80`). The handler sees the **same "phone the manager now"** card — the escalation outcome is never blocked.

**Where States 0 and C are proven — the one, unambiguous mechanism.** Neither can be safely reproduced live: State C's guard (`:36`) is never reached by the pre-flip `log` pod (it takes the log branch at `:44-47`), and forcing it live by mis-ordering the flip is **prohibited** (§2); State 0's non-OOH branch can only be exercised with a synthetic non-OOH caller, which does not exist in the live flow. Both are therefore verified as **automated tests** in `test/p1-dispatch-honesty.test.js` (fixture mode, intercepting axios adapter, no network, no live send). The suite already asserts the invalid-credential/rejected-send half of State C; add: (i) the **missing-credential guard-throw** half of State C, and (ii) the **origin guard** — a non-OOH/unknown origin is **not** sent (dispatchOk false, `p1-escalation-origin-unverified` raised, honest card, no crash) while an `ooh-dashboard` origin **is** sent. `npm test` green is the pass evidence for both.

**Invariant across all states:** SMS failure (or an origin block) never blocks the P1 outcome (the ticket is still raised), and the raw recipient number is never persisted — status only.

---

## 4. End-to-end LIVE test design (defined here, executed after the flip)

Do not execute until Step 0 (build) and Steps 1–4 of §2 are complete.

**Preconditions:**

- The OOH-origin guard (§1A) is built and its test green.
- The three Twilio values present (Path A or B), and the recipient pair + `IOT_DASH_BASE_URL` = live host confirmed current (§1).
- `SMS_PROVIDER=twilio` on the running pod, pod healthy on `/healthz`.
- An **agreed test recipient or test window** — the configured recipient currently also acts as a Tier-1 tester (recorded in OOHDASH-73), so coordinate so a real out-of-hours-style text does not confuse a real person mid-shift. **Named owner: James (OOHDASH-73)** — he agrees and records the recipient/window on the ticket before the test.
- A **stable, known test device/site** for the trigger, so a concurrent Stream A cellar reclassification cannot muddy the P1. `WRITES_DISABLED` state is irrelevant — this test enables no control.

**Steps:**

- Sign in as an OOH handler on the live site.
- Run a flow that yields a **system-decided P1** on the test site — kitchen equipment-off-during-service, fridge stock-at-risk, or contractor-on-site.
- Complete the outcome; start a stopwatch the moment the P1 is raised.
- Read the P1 outcome card — it should render the **"a text message has been sent"** variant.
- Confirm the recipient device receives the SMS carrying a **working deep-link** to the just-created ticket.
- Click the deep-link; confirm it lands on the **correct** ticket detail in the **live** IoT Support dashboard.
- Check the Zendesk `#ooh-p1-dispatch` comment reads SENT.
- Check the `OohSmsLog` entry: `dispatchOk:true`, `provider:'twilio'`, number shown as `(configured)`.

**Required safety scenarios — proven in the test suite, NOT on prod.** Two REQUIRED pass criteria have **one** verification home each — the automated suite (`test/p1-dispatch-honesty.test.js`, fixture mode, intercepting adapter, no live send), optionally re-confirmed in staging. Neither is exercised by misconfiguring the live pod (see §3):

- **Credential fail-closed (State C):** provider twilio with a credential missing/invalid → guard throws (`:36`) or axios rejects → caught at `:73-81` → `dispatchOk:false`, honest "phone the manager" card, `sms-dispatch-failed` alert, no crash.
- **OOH-origin guard (State 0, NEW):** a non-OOH / unknown / BAU origin is **not** paged (`dispatchOk:false`, `p1-escalation-origin-unverified` raised, honest card, no crash), while an `ooh-dashboard` origin **is** paged. This is the code proof that a BAU alarm can never trigger the escalation text.

**Pass criteria (all must hold):**

- SMS received in **under 60 seconds** of the P1 being raised.
- Message body contains a working deep-link resolving to the **correct** ticket.
- `dispatchOk:true` in the returned outcome, in `OohSmsLog`, and reflected as SENT in the Zendesk comment; card shows the sent variant.
- **No** `sms-dispatch-failed` (or origin-unverified) alert on the happy path.
- The **raw recipient number is never persisted** (status only, `(configured)`).
- The `ESCALATION_ONDUTY_NAME` shown on the card, in `OohSmsLog` and in the Zendesk comment is the **real on-duty person's name**, not the generic default.
- **Deep-link resolves to the correct LIVE ticket (REQUIRED):** tap the link and confirm it opens the **correct** ticket in the **live** IoT Support dashboard — the catch for a wrong/UAT `IOT_DASH_BASE_URL`, which does **not** fail closed (§1). A text that "sent" but carries a dead/wrong link is a **fail**.
- **Credential fail-closed AND OOH-origin guard (REQUIRED, proven in the test suite — not on prod):** both are evidenced by `npm test` green over `test/p1-dispatch-honesty.test.js`. If the suite does not hold them, the enablement is not safe to ship regardless of the happy path.
- **Responsive/mobile rendering (REQUIRED sign-off):** on a phone-width viewport, all three P1 outcome-card states render cleanly — the sent variant (timestamp + deep-link both readable and tappable), the log/no-send variant, and the fail-closed variant. The handler reads this card on a mobile out of hours, so a broken sent-variant on mobile is a fail.

**Cleanup:** the test raises a real urgent Zendesk P1 ticket — close/delete it afterwards and note it was internal-only.

---

## 5. Go/no-go position and traceability

- This is **James go/no-go #4 (Q-F)** — the SMS lever. It is **independent of device writes** (go/no-go #3): enabling SMS sends texts only and enables **no** device control. `WRITES_DISABLED` is untouched.
- **Dependencies (revised):** there is now a **build step** (the OOH-origin guard, §1A) before enablement. The credential dependency is reduced to the **three Twilio values** and is **not necessarily on Spencer** — James can self-serve via plain env (Path B) if he holds the credentials, accepting the plaintext-token tradeoff; Spencer (Path A) is needed only to keep the token in the managed secret. Everything else (recipient pair, deep-link host, the flip) is already provisioned or James self-serve.
- **Later merge touch-point AND live-flip guardrail (not a blocker here):** the eventual OOHDASH-19 write-flip edits `WRITES_DISABLED` one line above `SMS_PROVIDER` in the same manifest env block — coordinate that merge when it arrives, independent of Stream A. The adjacency is also a **live-command hazard**: every §2 `kubectl set env` must set only its intended keys and never `WRITES_DISABLED`, with a post-flip single-key verification.
- **Link:** OOHDASH-73 (https://airedale-api.atlassian.net/browse/OOHDASH-73).

---

## 6. On-duty recipient — named owner and rotation runbook (proposed — pending James's confirmation at gate)

`ESCALATION_ONDUTY_NUMBER` and `ESCALATION_ONDUTY_NAME` are a **single static pair** the code reads at send time (already provisioned in the secret, §1); there is no rota logic. That makes a stale value a **silent failure mode**: if the number belongs to someone off shift, sick or on holiday, the code still returns `dispatchOk:true` and posts a **SENT** comment — the text lands with the wrong person and **nothing alerts**. This section closes that gap with a named owner and a manual rotation process. **Proposed pending James's confirmation at gate.**

**Named owner.** **IoT Support (Sam Day's team) owns `ESCALATION_ONDUTY_NUMBER` and `ESCALATION_ONDUTY_NAME`** — accountable for the value being correct and current, and for the name being a **real person**, never the generic default.

**Rotation runbook (owned by IoT Support / ops), for shift change, sickness or holiday:**

- IoT Support determines who the on-duty escalation manager is for the period, and their contact number.
- Because managed-secret write is **Spencer-only**, IoT Support **requests the secret update via Spencer**, giving the new number and real name. (In an emergency, the §6 break-glass env override applies.)
- Spencer updates `ooh-dashboard-secrets` and confirms back in writing.
- **Verification step (mandatory, and timely):** after the pod picks up the change, IoT Support confirms the **right person is reachable** on the configured number — a controlled test P1 or an agreed check text — so a mistyped or stale number is caught immediately. The card/log showing the **correct real name** is the visible confirmation. Because a stale value fails **silently**, run this **at the point of each rotation**, not deferred.

**Backup / break-glass — Spencer is not a single point of failure (proposed — pending James's confirmation at gate).** Rotation depends on Spencer, the only secret-writer, in a **24/7** system. Two paths close that gap:

- **Durable fix — a second secret-writer.** Grant a second named person write access to `ooh-dashboard-secrets` so loads and rotations are never blocked on one individual. This is the same access-decouple ask that also enables Path A above without Spencer specifically, and is the preferred permanent answer.
- **Interim break-glass (emergency only, documented).** In an emergency, James can self-serve an env override with `kubectl set env deployment/ooh-dashboard ESCALATION_ONDUTY_NUMBER=<num> ESCALATION_ONDUTY_NAME="<real name>"` (his scoped account holds the env-patch verb — the same mechanism as Path B in §2). **Last resort:** it **temporarily exposes the raw number in the deployment env** (not the managed secret) and **creates git-versus-cluster drift**. It **must be reverted** — env override removed, value restored to the secret — as soon as a secret-writer can reload it. Same single-key discipline as §2 Step 3: never include `WRITES_DISABLED`.

**Future enhancement (out of scope for this stream):** a schedule-driven rota lookup — the app resolving the current on-duty manager from an IoT Support shift schedule instead of a static secret — would remove the manual request-via-Spencer step and the staleness risk. That is application work, not config, and is deliberately **not** part of this enablement.

**Near-term excellence targets (future, out of scope — noted so they are not lost):**

- **Manager-acknowledgment loop.** Today the P1 SMS is fire-and-forget: `dispatchOk:true` proves *sent*, not *seen and accepted* (`OohP1AckAt`/`OohP1AckBy` exist but are set only from the dashboard/Admin). A near-term target is an ack loop so an unacknowledged P1 can be re-chased. Application work, not this stream.
- **Call-to-action cue in the SMS body.** The current body (`escalation.js:56`) states the incident but not the expected action. A short call-to-action would sharpen the recipient experience. Because the template lives in `escalation.js`, it is a **code change** — a recommended near-term follow-up, not part of this enablement.

---

## 7. Open decisions for James

- **OOH categorisation identifier (for the §1A guard).** Confirm the exact marker the fail-closed guard keys on — **proposed:** the `ooh_p1` tag the dashboard stamps on every P1 escalation (`api.js:267`), with the "Support Request" ticket-category (`tcat_support_request`, `config.js:79`) and `[OOH]` subject as durable secondary markers — and confirm BAU alarm tickets can never carry it.
- **Do you still hold the Twilio account credentials?** This single confirmation decides **Path A** (Spencer loads the three `TWILIO_*` to the secret — token stays managed) versus **Path B** (you self-serve via plain env, no Spencer, accepting the plaintext-token tradeoff). If the credentials are lost, a Twilio account + sender number must be (re)obtained first, by whoever provisions.
- **Gateway confirmation.** Confirm Twilio-reuse (existing Airedale account and from-number) and that you **accept the named coupling risk** with the IoT Support Dashboard (§1), rather than a dedicated OOH subaccount or a different provider (a code change).
- **On-duty recipient ownership.** Confirm **IoT Support (Sam Day's team) as named owner** of `ESCALATION_ONDUTY_NUMBER` / `ESCALATION_ONDUTY_NAME` and the §6 rotation runbook, with a real name required and the current value confirmed.
- **Backup secret-writer / break-glass.** Confirm the §6 answer to Spencer being a single point of failure: a **second secret-writer** (durable, and it also removes Spencer from Path A) plus the documented **emergency break-glass env override** (interim, must be reverted).
- **Recipient de-confliction (owner James / OOHDASH-73).** Agree the live-test recipient or window given the recipient currently doubles as a Tier-1 tester; James owns agreeing and recording it before the test.

---

## How to review

Approve to proceed — **build** the OOH-origin fail-closed guard and its test (§1A), then **enable** (Twilio credentials present via Spencer Path A or James self-serve Path B; James flips `SMS_PROVIDER` to `twilio` and commits the line; run the live test) — or request changes. This gate itself changes nothing, provisions nothing, and sends nothing.

*All line numbers cited against the working tree at v1.2.4, 2026-09-23; access claims cited against the integration record (CIR). Prose + bullets only, no tables, no secrets. Design only — the orchestrator governs any gate, flip, provision, commit or PR.*
