<!--
gate:contract
TICKET: OOHDASH-153
PHASE: design
SECTION: What we are changing
The dashboard still carries the old "OOH sends the text itself" code (Approach A). It has never sent a text in production because it runs in log mode. But it still writes a "P1 SMS NOT SENT, phone the manager now" note on every P1 ticket, and the operator scripts tell callers "a text has gone". That note caused the false P1 alarm on ticket 51137. This design removes the old SMS code and the note, and corrects the operator scripts. The real paging route (Approach B: the ooh_p1 tag, then the IoT Support Dashboard pages the on-duty manager) is not touched.
SECTION: Change 1 - remove the old SMS module
Delete services/escalation.js and its test. The P1 branch in routes/api.js stops calling escalateP1. Instead it writes a short positive record to the existing P1 log store: "P1 ticket raised with ooh_p1 tag; OOH side complete; IoT Support Dashboard will page the on-duty manager." A small new module, services/p1-log.js, owns that write plus the existing log read and "Mark acknowledged" functions, so the Admin P1 log card and the P1 SLA metric keep working (D3). The Twilio and on-duty-number settings are removed from config.js and .env.example.
SECTION: Change 2 - remove the confusing Zendesk note
Delete addP1DispatchNote from services/zendesk.js and remove its call and try/catch from routes/api.js. No replacement note (D1). The ticket keeps its ooh_p1 tag, urgent priority and the existing transcript line "P1 escalation raised - on-duty manager to be paged", which is true under Approach B.
SECTION: Change 3 - correct the seven operator scripts
Seven P1 scripts in public/js/flows.js claim "a text has gone" or "I've sent an urgent text". Each false claim is replaced with the agreed D2 sentence: "I've raised an urgent P1 ticket for this site and someone will call you back shortly." Five of the seven scripts also carry safety advice after the claim (override switch is safe, electrician procedure, appliance repair route, ask the engineer to hold on). This design keeps that advice and swaps only the false part. See the decision below.
DECISION: Scope of the script fix | Swap only the false text claim and keep each script's safety advice (recommended) | Replace each whole script with the D2 sentence only
DETAIL: The brief said "replace all seven with D2". Taken literally that deletes safety advice operators read to callers (for example "the on-site override switch is safe to use" and "ask the engineer to hold on"). Keeping the advice is the smaller, safer change. The exact before and after for all seven is in section 5 of the document.
SECTION: Panel questions answered
The IoT Support Dashboard pages the manager by SMS. The OOH-to-IoT contract (docs/project/HANDOFF_OOH-to-IoT-Support_p1-sms-contract.md) says it fires its own SMS notifier on ooh_p1 tickets, the same one that has sent real escalation texts since April 2026. So the two lines that say the IoT team sends a text (flows.js 309 and 381) are true and stay. The P1 SLA metric and the new Admin card never read the dropped fields: the metric reads only dispatchedAt and OohP1AckAt. If the log write fails, the Zendesk ticket with the ooh_p1 tag already exists and the page still happens. Only the Admin row is lost, and a new p1-log-write-failed alert makes that visible. Details are in section 6a.
SECTION: Decisions already settled
D1: remove addP1DispatchNote entirely with no replacement. D2: script wording "I've raised an urgent P1 ticket for this site and someone will call you back shortly." D3: keep the Admin P1 log card, fed by positive entries instead of SMS dispatch records. D4: Approach B is confirmed live end to end (the manager was paged for ticket 51137). No third-party blocker remains.
DECISION: Approve design and proceed to build? | Approve - proceed to build | Block - needs changes
-->

# OOHDASH-153 Design: clean up P1 SMS scaffolding

**Date:** 2026-10-26 · **Phase:** design · **Release:** R1 · **Discovery:** PR #169 (merged)
**Repo:** ooh-triage-dashboard · **Base:** main (v1.6.2)

## 1. Summary

The P1 outcome still runs the old Approach A code: `services/escalation.js` "sends" a Twilio text in permanent log mode, so it never sends anything. Then `addP1DispatchNote` writes a `P1 SMS NOT SENT … ACTION NEEDED: phone the on-duty manager now` note to the Zendesk ticket. Separately, the operator scripts say a text has gone. On ticket #51137 (site 6791) the note made the IoT team think paging was broken, and they raised a live P1 incident.

The real mechanism is Approach B: OOH tags the ticket `ooh_p1`, and the IoT Support Dashboard pages the on-duty manager. James confirmed this is live end to end (D4). This design removes the Approach A code and the false claims. **Approach B is not touched.** The `ooh_p1` tag, urgent priority, `[OOH]` subject and Support Request category all stay exactly as they are.

## 2. Decisions already made (settled at discovery gate, PR #169)

| # | Decision | Answer |
|---|---|---|
| D1 | `addP1DispatchNote` | Remove entirely, no replacement note |
| D2 | Operator script wording | "I've raised an urgent P1 ticket for this site and someone will call you back shortly." |
| D3 | Admin P1 log tab | Keep it, fed by positive audit entries, not SMS dispatch records |
| D4 | Approach B live? | Yes, confirmed end to end. No Sam Day blocker |

## 3. Change 1: remove the Approach A SMS module

### 3.1 Files deleted

- `services/escalation.js` (148 lines: Twilio caller, log-mode no-op, origin guard, `OohSmsLog` write, `acknowledgeP1`, `smsLog`)
- `test/p1-dispatch-honesty.test.js` (tests Approach A behaviour only: log-mode `dispatchOk`, Twilio send/fail, origin guard, the three note variants)

### 3.2 New file: `services/p1-log.js`

`escalation.js` also holds the two functions behind the Admin P1 log card (`smsLog`, `acknowledgeP1`), and the P1 SLA metric reads the same `OohSmsLog` collection. To keep D3 working, a small module replaces them. It has no provider, no Twilio and no on-duty number.

| Function | Behaviour |
|---|---|
| `recordP1Raised({ operator, siteNo, siteName, ticketId, summary })` | Upserts one entry to the existing `OohSmsLog` collection and returns it. Fail-safe: a store error is logged, raises a `p1-log-write-failed` alert, and never blocks the outcome. |
| `p1Log(limit = 50)` | Same as today's `smsLog`: newest first. |
| `acknowledgeP1(id, actorName)` | Unchanged behaviour (moved as-is). |
| `buildEscalationLink(ticketId)` | Moved as-is (`config.iotDashBaseUrl` + `/?ticket=`). |

**Entry shape:** `id`, `ticketId`, `siteNo`, `siteName`, `summary`, `raisedBy`, `dispatchedAt` (kept under this name so `services/metrics.js` SLA maths and old entries still work), `OohP1EscalationLink`, `status`, `OohP1AckAt`, `OohP1AckBy`. Fields dropped: `sentTo`, `sentToNumber`, `provider`, `origin`, `dispatchReason`, `dispatchOk`.

**`status` text (D3, positive audit entry):**
> P1 ticket raised with ooh_p1 tag; OOH side complete; IoT Support Dashboard will page the on-duty manager.

The collection name `OohSmsLog` is kept. Renaming it would need a Cosmos container change and a data move, and would add no value to operators. A comment in `services/store.js` will say it now holds P1 raised records.

### 3.3 `routes/api.js` edits

| Where | Before | After |
|---|---|---|
| line 18 | `import * as escalation from '../services/escalation.js';` | `import * as p1Log from '../services/p1-log.js';` |
| lines 552–567 (P1 block) | `p1 = await escalation.escalateP1({ …, origin: 'ooh-dashboard' })` followed by the `addP1DispatchNote` try/catch | `p1 = await p1Log.recordP1Raised({ operator: op, siteNo, siteName, ticketId: ticket.id, summary: p1Summary \|\| subject })` |
| line 610 (response) | `p1: { dispatchedAt, sentTo, link, dispatchOk, provider }` | `p1: { raisedAt: p1.dispatchedAt, link: p1.OohP1EscalationLink }` (no front-end code reads `res.p1` today; checked) |
| lines 473–475 (comment) | refers to `escalateP1` / `addP1DispatchNote` | rewritten to describe Approach B; the step text itself is unchanged |
| lines 770–772 (admin routes) | `escalation.smsLog()` / `escalation.acknowledgeP1(…)` | `p1Log.p1Log()` / `p1Log.acknowledgeP1(…)`; URL paths `/api/admin/sms-log` kept to limit churn |

The origin guard (`OOH_ORIGIN`) goes with the module. It existed only to stop a non-OOH caller from sending a text. With no text being sent there is nothing left to guard.

### 3.4 Admin P1 log card (`public/js/views.js` ~line 622)

| Item | Before | After |
|---|---|---|
| Card heading | P1 text-message log | P1 escalation log |
| Row, third column | `sentTo` + red **send failed** tag when `dispatchOk` is false | "Raised with ooh_p1 tag · IoT Support Dashboard pages the manager" (static, the same for old and new entries) |
| Empty state | No P1 texts sent yet. | No P1 escalations raised yet. |
| Ticket link, Mark acknowledged | unchanged | unchanged |

Old entries already in the store (all `dispatchOk: false`) will no longer show a false **send failed** tag.

### 3.5 Config and metrics

- `config.js`: remove the `sms` block (`SMS_PROVIDER`, `TWILIO_*`, `ESCALATION_ONDUTY_*`). `iotDashBaseUrl` is kept (used by the ticket deep link).
- `.env.example`: remove the P1 SMS lines (44–50).
- `services/metrics.js`: no logic change (still reads `OohSmsLog` for the ack SLA). Update the header comment that says "SMS dispatch failure (raised by escalation.js)".
- `k8s/deployment.yaml` `SMS_PROVIDER` env and the `scripts/release.sh` grep for it: **left as they are.** Once config stops reading the variable it does nothing. The manifest is applied by the platform team, not by this release, so editing it here would create git-to-cluster drift. They can be removed at the next manifest change.

## 4. Change 2: remove the confusing Zendesk note

- `services/zendesk.js`: delete `addP1DispatchNote` (line 400) and its export.
- `routes/api.js` lines 559–566: delete the call and its try/catch, including the `p1-dispatch-note-failed` alert.
- `test/degraded-banner.test.js` line 68: remove the `addP1DispatchNote: _noop` mock stub.

**After:** a P1 ticket carries only the `[TRG]` first comment (transcript, which still says "P1 escalation raised - on-duty manager to be paged") and any notes or related comments. It no longer carries any "NOT SENT" or "ACTION NEEDED" line.

## 5. Change 3: correct the seven operator scripts (`public/js/flows.js`)

The rule is to replace only the false "text has gone / sent an urgent text" claim with the D2 sentence and keep the safety advice that follows it (see the decision on the review card).

| Line | Before | After |
|---|---|---|
| 1894 | This is urgent so I've escalated it right now — a text has gone to our on-duty manager and someone will call you back shortly. In the meantime the on-site override switch, if you have one, is safe to use. | I've raised an urgent P1 ticket for this site and someone will call you back shortly. In the meantime the on-site override switch, if you have one, is safe to use. |
| 2053 | (same as 1894) | (same as 1894 after) |
| 2131 | I've escalated this as urgent — a text has gone to our on-duty manager and someone will call you back shortly. If the dark frontage is a safety concern right now, your site's duty-manager procedure for calling out an electrician still applies, … | I've raised an urgent P1 ticket for this site and someone will call you back shortly. If the dark frontage is a safety concern right now, your site's duty-manager procedure for calling out an electrician still applies, … (rest unchanged) |
| 2183 | I've escalated this as urgent — a text has gone to our on-duty manager. The fridge itself isn't controlled by Lighthouse, so alongside our callback you should follow your normal appliance repair route — but someone will ring you shortly. | I've raised an urgent P1 ticket for this site and someone will call you back shortly. The fridge itself isn't controlled by Lighthouse, so alongside our callback you should follow your normal appliance repair route. |
| 2328 | I've sent an urgent text to our on-duty manager and they'll ring the site straight back — usually within a few minutes. Please ask the engineer to hold on. | I've raised an urgent P1 ticket for this site and someone will call you back shortly. Please ask the engineer to hold on. |
| 2411 | (same as 2328) | (same as 2328 after) |
| 2450 | I've escalated this as urgent — a text has gone to our on-duty manager and someone will call you back shortly. | I've raised an urgent P1 ticket for this site and someone will call you back shortly. |

Notes:
- 2183 drops the trailing "but someone will ring you shortly" because the D2 sentence already says it.
- 2328/2411 drop "usually within a few minutes". OOH cannot promise the IoT team's response time.
- Line numbers are as of main v1.6.2. Build finds strings by content, not by line number.

**Checked and left unchanged:**
- `flows.js:341`: the P1 outcome card already says "logged as ticket #N in the IoT Support dashboard, which pages the on-duty manager". This is true under Approach B.
- `flows.js:381`: the "Something else" P1 explainer says "will send a text to the escalation manager on the IoT Support team". The IoT team's system does send that text, so the line is accurate.
- `flows.js:309`: "(not in the urgent text)" in the notes echo refers to the IoT team's page. Unchanged, and asserted by two e2e specs.

## 6a. Panel questions answered (round 1)

**Is the IoT page really a text (SMS)?** Yes. The evidence is in the repo, not assumed:
- `docs/project/HANDOFF_OOH-to-IoT-Support_p1-sms-contract.md` line 17 says the IoT Support Dashboard "fires its own already-built SMS notifier (the same one that has sent real escalation texts since ~April 2026)".
- Lines 43–44 and 48 say that on an `ooh_p1` ticket it invokes the existing SMS notifier, once per ticket.
- Line 73 sets the acceptance test: the on-duty manager's device receives one SMS within 60 s.

So `flows.js:381` ("will send a text to the escalation manager on the IoT Support team") and `flows.js:309` ("not in the urgent text") describe the IoT team's text truthfully and stay unchanged. The seven scripts were false for a different reason: they said *the operator* had sent a text.

**Does anything branch on the dropped fields?** No.
- `services/metrics.js` lines 101–112 read only `dispatchedAt` and `OohP1AckAt` from `OohSmsLog`. `p1Escalations` counts audit entries (`OohActionType === 'escalate-p1'`, line 92), not the log.
- The only reader of `dispatchOk` and `sentTo` is the Admin card row (`views.js:624`), and section 3.4 replaces that row.
- Nothing else in `routes/`, `services/` or `public/` reads `dispatchOk`, `provider` or `sentTo` (checked with grep). The build's source-guard test adds a check that `dispatchOk` no longer appears in `public/js/views.js`.

**What if `recordP1Raised` fails to write?** This is an accepted compromise, and here is what happens:
- By the time the write runs, the Zendesk ticket with the `ooh_p1` tag already exists. That ticket is what triggers the page, so the manager is still paged and what the caller was told is still true.
- What is lost is that P1's row in the Admin log, plus its ack SLA sample.
- To make this visible, `recordP1Raised` raises a `p1-log-write-failed` alert (same `raiseAlert` pattern as today) alongside the console error.
- The outcome is never blocked, which is today's behaviour.

**Was the page for #51137 automatic?** This is settled by James (D4, discovery gate PR #169): Approach B was verified end to end live, and the manager was paged for #51137. This design does not depend on that one incident. The Approach B contract and acceptance test above are the standing basis, and removing the false note cannot stop a page, because the watcher keys on the `ooh_p1` tag, which is unchanged.

**Follow-ups noted (not in this build):**
- Naming debt: `OohSmsLog`, `dispatchedAt` and `/api/admin/sms-log` still say SMS. Raise a cleanup ticket.
- `SMS_PROVIDER` in `k8s/deployment.yaml` and the `release.sh` grep: queue for removal at the next manifest change.
- Check whether any `TWILIO_*` values exist in the Spencer-managed secret. If they do, ask for their removal and revocation (needs James's go to contact Spencer).
- Legacy `OohSmsLog` rows hold no phone numbers. `sentToNumber` was only ever the text "(configured)" or "(not configured)" (`escalation.js:76`), so no retention action is needed.

## 6. Tests (build must deliver)

| Test | Action |
|---|---|
| `test/p1-dispatch-honesty.test.js` | Delete (Approach A only). Keep its two transcript tests ("neutral P1 line", "Outcome: anchor freeze guard") by moving them into a new `test/p1-log.test.js` |
| `test/p1-log.test.js` (new) | `recordP1Raised` writes the positive `status` text and no SMS fields; store failure never throws; `acknowledgeP1` sets ack fields; `p1Log` sorts newest first |
| new source guard (in `p1-log.test.js`) | No `a text has gone` / `sent an urgent text` in `flows.js`; the D2 sentence appears exactly 7 times; no `escalation.js` import and no `addP1DispatchNote` anywhere in `routes/` or `services/` |
| `test/degraded-banner.test.js` | Remove the `addP1DispatchNote` stub |
| `tests/removal-health.spec.js` (e2e) | Card selector becomes "P1 escalation log"; replace the `On-duty escalation manager` assertion with the new row text; ack flow assertion unchanged |
| Full suites | `npm test` and Playwright e2e both green (both are required checks on main) |

## 7. What does not change

- The `ooh_p1` tag, urgent priority, `[OOH]` subject and Support Request category (the Approach B join contract)
- The F4a P1 banner (reads `ooh_p1` tickets from Zendesk, not the SMS log)
- `metrics.js` P1 counts and SLA maths
- The transcript step text and the `[TRG]` Outcome anchor
- No device writes and no new external calls. Removing the Twilio path removes the only outbound SMS code.

## 8. Risk and rollback

Low risk. The change only removes code that has never sent a text in production, plus wording and audit-shape updates. The one behaviour change Zendesk users will see is that the "NOT SENT" note no longer appears. Rollback is the standard image rollback to v1.6.2. Old `OohSmsLog` entries stay readable by both versions.

## 9. Release

Patch release (v1.6.3) after build and test gates. No env or secret changes are needed.
