<!-- gate:contract
SECTION: What this gate is
This is the Stage 1 (discovery) sign-off for Stream B of R1: turning ON the P1 escalation text message from the OOH Triage Dashboard to the on-duty escalation manager. Right now that text is deliberately held in "log" mode — the dashboard writes a would-send record but sends nothing, so a P1 outcome card reads "Text not sent, phone the manager now." Discovery has established that enabling this is a CONFIG and SECRET change, not a code build: the escalation code is complete and tested. This gate does not flip anything and does not send any text. What you are approving is that the discovery is accurate and that we may proceed to enablement (the config flip plus loading the gateway credentials).

SECTION: What discovery found in the running system
The send path in services/escalation.js is complete and already targets the Twilio REST API directly (no third-party SDK). It is inert only because the deployment sets SMS_PROVIDER to "log". In log mode the code returns sent:false on purpose, so the dispatch is never dishonestly recorded as sent (this honesty is locked in by the OOHDASH-72 / Test 11c test suite). When the provider is "twilio" and the credentials are present, the same code posts the text and records dispatchOk true. So the only thing standing between today and a real text is one environment flip and a set of credentials in the Spencer-managed secret. This is canary go/no-go number 4 (Q-F), and it is fully independent of the device-write flip — enabling SMS sends texts only and enables no device control.

SECTION: The gateway decision to close (Q-F)
The open question was Twilio versus another SMS provider. The recommendation is to stay with Twilio and reuse the existing Airedale Twilio account and sender number that the IoT Support Dashboard already uses in production (it has been sending real escalation texts since April 2026). Two reasons: the OOH dashboard code already speaks the Twilio REST API, so there is zero code cost to using Twilio; and switching to any other provider would require a code change to the send path plus a fresh account, for no operational gain. The credentials the chosen provider needs are three named secret keys — the Twilio account id, the auth token, and the from-number — plus the on-duty recipient number and display name. None of their values appear in this document.

SECTION: The access split you need to know
Enabling has two moving parts with two different owners. The provider flip itself (SMS_PROVIDER from "log" to "twilio") is an environment variable, and James's scoped service account can set it directly with no external help. But the gateway credentials and the on-duty number live in the Spencer-managed Kubernetes secret, and James's account cannot read or write that secret — so provisioning those needs Spencer. The order matters: the secret must be loaded FIRST, then the flip, otherwise the code correctly refuses to send and raises an alert.

SECTION: Decision — open questions to confirm
First: confirm Twilio-reuse as the gateway (the recommendation above) rather than standing up a new provider. Second: confirm Spencer will load the five secret values (three Twilio keys plus on-duty number and name) into the ooh-dashboard-secrets secret — this is the one hard external dependency. Third: de-conflict the recipient — the configured escalation recipient is currently also a Tier-1 tester, so the live test needs an agreed recipient or test window so a real text lands somewhere sensible. None of these blocks approving the discovery; they are the inputs the enablement step consumes.

SECTION: Recommendation and sign-off
The recommendation is to proceed: adopt Twilio-reuse, have Spencer load the secret values, then James flips SMS_PROVIDER and we run the one-minute live test defined in the body. Approve this gate to proceed to enablement, or request changes if the discovery needs more work first.
DECISION: Proceed to enable the P1 escalation SMS (Twilio-reuse, secret load by Spencer, then the env flip)? | Approve — proceed to enablement | Request changes
DETAIL: The send code is complete and tested; enabling is a secret load (Spencer) plus one env flip (James self-serve), independent of device writes. The only hard dependency is Spencer loading the credentials into the managed secret.
-->

# OOH Triage Dashboard — Enable the P1 escalation SMS · Stage 1 discovery gate

Stream B of R1. Tracked as OOHDASH-73. This is the discovery sign-off for enabling the P1 escalation text message from the OOH Triage Dashboard to the on-duty escalation manager, which is currently held in no-send "log" mode. Discovery only — this gate flips nothing, provisions nothing, and sends nothing. It is canary go/no-go number 4 (Q-F) and is independent of the device-write flip.

## Verified current state (what actually runs today)

- The send path is complete and deployed. `services/escalation.js` `escalateP1()` builds the text body (site, ticket, and a deep-link to the ticket in the IoT Support dashboard) and calls `sendViaProvider()`. When `config.sms.provider` is `twilio` it posts directly to the Twilio REST API using `axios` — there is no Twilio SDK dependency. Verified in `services/escalation.js` lines 33-48.
- It is inert only because of one env value. `k8s/deployment.yaml` sets `SMS_PROVIDER` to `"log"` (verified line 77), and `config.js` defaults the provider to `log` (verified line 100). In log mode the code logs a "would send" line and returns `sent:false`.
- The no-send state is honest by design. Because log mode returns `sent:false`, `dispatchOk` is never set true for a no-op (verified `escalation.js` line 77). The P1 outcome card therefore renders "Text not sent — phone the on-duty manager now" (verified `public/js/flows.js` lines 170-172), and a corrective `#ooh-p1-dispatch` comment on the Zendesk ticket says NOT SENT (verified `services/zendesk.js` `addP1DispatchNote`, lines 344-357). This honesty is locked by the OOHDASH-72 / Test 11c suite (`test/p1-dispatch-honesty.test.js`) — enabling must keep that suite green.
- The raw recipient number is never persisted. `escalation.js` stores only `(configured)` / `(not configured)` as `sentToNumber` (verified line 65) — the artefact and the logs follow the same rule.
- The config surface already exists. `config.sms` maps the env vars to the send path (verified `config.js` lines 99-108): the provider, the three Twilio credentials, and the on-duty number and name.

## Why this was believed to already work (systemic note)

There was a genuine prior belief that OOH P1 texts were being sent, because real escalation texts were received in April 2026. Discovery (and the OOHDASH-73 issue history) confirms those came from a DIFFERENT system — the IoT Support Dashboard's own Twilio notifier, fired by a manager escalating inside that dashboard — not from the OOH dashboard, whose escalation module did not exist until July 2026. The lesson mirrors the standing "Live means merged, not in-effect" doctrine: an OOH P1 SMS has never actually been observed sending in production, because the OOH path has always run in log mode. The live test below is what would prove it is genuinely in effect, not merely wired.

## Scope note: this is Approach A (the interim quick-win)

OOHDASH-73 records two candidate approaches. This Stream B task is Approach A — switch on the OOH dashboard's OWN Twilio send (config plus secret). Approach B — routing OOH-origin P1 tickets INTO the IoT Support Dashboard so its richer notifier fires and the escalation lands in the manager review → NetService job chain — is the preferred longer-term target architecture in the issue, but it requires development in the IoT Support Dashboard repository (a watcher/trigger for OOH-origin P1 tickets plus a near-real-time trigger), which is out of scope for this repo and this stream. Recommendation: ship Approach A now for a fast, real, deep-linked text; treat Approach B as a separate follow-on decision. This is flagged as an open architectural decision, not silently folded in.

## 1. Gateway decision (closes Q-F)

Options considered:

- Twilio, reusing the existing Airedale Twilio account and sender number already used by the IoT Support Dashboard in production. Zero code change (the send path already targets the Twilio REST API). Proven account. Recommended.
- Twilio, new dedicated account/number for the OOH dashboard. Still zero code change, but adds account setup and cost with no operational gain over reuse.
- A different provider (for example a generic HTTP SMS gateway, or a cloud provider's SMS service). Rejected for now: it requires a code change to add a new branch in `sendViaProvider()` plus new credentials and testing, for no benefit while Twilio is already integrated and proven.

Recommendation: Twilio, reuse the existing account and from-number.

Exact secret key names the chosen provider needs (names only, no values):

- `TWILIO_ACCOUNT_SID` — the Twilio account id.
- `TWILIO_AUTH_TOKEN` — the Twilio auth token.
- `TWILIO_FROM` — the sender number the text is sent from.

Related keys that must also be present for a correct, deep-linked text:

- `ESCALATION_ONDUTY_NUMBER` — the on-duty recipient number (see section 2).
- `ESCALATION_ONDUTY_NAME` — the recipient display name (defaults to "On-duty escalation manager" if unset).
- `IOT_DASH_BASE_URL` — the live IoT Support dashboard host, so the deep-link in the text resolves. This is required explicitly in production (config validation fails loud if unset). Confirm it is set to the live host, not the UAT fallback.

Cost/effort of switching providers later: because the send path is Twilio-specific, any non-Twilio provider is a code change (a new branch in `sendViaProvider()`), not a config change — so the provider choice is effectively a code decision, and staying on Twilio keeps it config-only.

## 2. On-duty recipient — model and ownership

- Model today: a single static recipient. `config.sms.onDutyNumber` reads `ESCALATION_ONDUTY_NUMBER` and `config.sms.onDutyName` reads `ESCALATION_ONDUTY_NAME` (verified `config.js` lines 106-107). There is no rota logic in the code — one number, one name.
- Rota later: a future enhancement. Rotating the recipient by shift/date would need new resolution logic (a rota source and a lookup at send time) and is out of scope for this enablement. The single-number model is sufficient for go/no-go 4.
- Where it lives: the number and name are held in the Spencer-managed secret (`ooh-dashboard-secrets`), per the `envFrom` secretRef and the env comment in `k8s/deployment.yaml` (lines 78-84). The raw number is never written to the artefact, the SMS log, or the Zendesk comment — status only.
- Ownership / de-confliction: the recipient is owned/provided by IoT Support. Note the recipient currently coincides with a Tier-1 tester (recorded in OOHDASH-73), so the live test must use an agreed recipient or test window to avoid confusing a real person mid-test.

## 3. Enablement steps (with the access split)

Discovery establishes the sequence; it does NOT perform it.

1. Provision the secret (Spencer — hard external dependency). Load the five values into `ooh-dashboard-secrets`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `ESCALATION_ONDUTY_NUMBER`, `ESCALATION_ONDUTY_NAME`. Also confirm `IOT_DASH_BASE_URL` points at the live dashboard host. James's scoped service account cannot read or write secrets, so this step is Spencer's (or the insecure temporary plaintext-env override, which is not recommended for real credentials).
2. Flip the provider (James — self-serve). Set `SMS_PROVIDER` from `log` to `twilio`. This is an environment variable and the scoped service account holds the patch verb, so `kubectl set env` reaches the cluster with no external help (same mechanism proven for the Zendesk-override and OOM fixes). Do this ONLY after step 1 — flipping first, with the secret absent, makes the code correctly throw "Twilio provider selected but not configured", leave `dispatchOk` false, and raise an `sms-dispatch-failed` alert.
3. Keep git and cluster aligned. `set env` creates drift between the running cluster and the committed manifest (there is no CI that applies the manifest, so a committed change alone has no live effect). Commit the `SMS_PROVIDER` change to `k8s/deployment.yaml` alongside the live flip so the audit trail and the runtime agree.
4. Verify with the live test (section 4) before declaring the P1 SMS live.

Order dependency to flag: secret load (Spencer) is a blocker on the flip (James). The flip without the secret is a visible, safe failure, not a silent one — but it is not "enabled".

Link: OOHDASH-73 (https://airedale-api.atlassian.net/browse/OOHDASH-73).

## 4. End-to-end LIVE test definition (defined, not executed)

Do not execute until the secret is provisioned and the flip is done — writes/secrets are not in place yet.

Preconditions:

- Secret provisioned (the five keys in section 3) and `IOT_DASH_BASE_URL` set to the live host.
- `SMS_PROVIDER` = `twilio` on the running pod.
- An agreed test recipient / window so the real text does not confuse the Tier-1 tester who shares the recipient number.
- No dependency on device writes — `WRITES_DISABLED` state is irrelevant to this test; enabling SMS enables no control.

Steps:

- Sign in as an OOH handler on the live site.
- Run a flow that yields a system-decided P1 on a test site — one of kitchen-off-during-service, fridge stock-at-risk, or contractor-on-site (these are the current auto-P1 outcomes).
- Complete the outcome and start a stopwatch at the moment the P1 is raised.
- Observe the P1 outcome card: it should render the "a text message has been sent to the on-duty escalation manager" variant (not "Text not sent").
- Confirm the recipient device receives the SMS, and that the message carries a working deep-link to the just-created ticket in the IoT Support dashboard.
- Click the deep-link and confirm it lands on the correct ticket detail.
- Check the Zendesk ticket's `#ooh-p1-dispatch` corrective comment reads "SMS SENT".
- Check the `OohSmsLog` entry for the ticket has `dispatchOk` true and `provider` twilio, with the number shown only as `(configured)`.

Pass criteria:

- The SMS is received in under one minute of the P1 being raised.
- The message body contains a working deep-link resolving to the correct ticket.
- `dispatchOk` is true in the returned outcome, in `OohSmsLog`, and reflected as SENT in the Zendesk corrective comment; the outcome card shows the sent variant.
- No `sms-dispatch-failed` alert is raised.
- The raw recipient number is never persisted (status only).

Cleanup: the test raises a real urgent Zendesk P1 ticket — close/delete it afterwards (as the earlier discovery walk did with its test tickets), and note it was internal-only.

## 5. OOHDASH-73 — confirmed, and what to add

Confirmed live: OOHDASH-73, "Enable fast (<1 min) P1 escalation SMS from OOH Triage Dash to the escalation manager", type Task, priority High, status To Do, reporter James Brown, labels escalation / integration / ooh-dashboard / sms, no assignee, no component. It already carries the problem statement, the A/B approaches, the recommendation, constraints, and acceptance criteria that this discovery corroborates.

Suggested additions to the issue:

- Pointer to this discovery gate as the Stage 1 artefact, and that discovery confirms enablement is config + secret, not a build.
- Record the scope decision: this Stream B task is Approach A (interim quick-win); Approach B is a separate IoT-dash follow-on.
- Record the access-split finding: the `SMS_PROVIDER` flip is James self-serve (env patch), but the credentials/number load into `ooh-dashboard-secrets` needs Spencer — the one hard dependency — and must precede the flip.
- Record the de-confliction note for the live test (shared recipient/tester).
- Set an assignee and, if used, a component, so ownership is explicit.

## How to review

Approve to proceed to enablement (Twilio-reuse; Spencer loads the secret; James flips the provider; run the live test), or request changes. This gate itself changes nothing.
