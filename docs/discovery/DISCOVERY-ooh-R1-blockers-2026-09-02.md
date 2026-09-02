# Discovery — OOH Triage Dashboard R1 blockers (2026-09-02)

This discovery investigates the two live blockers standing between the OOH Triage Dashboard R1 canary and a Phase-1 pilot. It is scoped deliberately to those two only: Blocker 1, the Zendesk token 401 that stops the Cosmos-write deploy smoke; and Blocker 2, the duplicate Zendesk tickets seen from ThingsBoard. A frequently-mentioned third item — credential rotation — is a hygiene statement, not a blocker to the pilot, and is intentionally out of scope here. The aim is a plain-English, decision-ready read on what each blocker actually is, whether it is real, who owns the fix, and what to do next.

## Blocker 1 — Zendesk token 401 blocks the Cosmos-write smoke

Verdict: REAL — confirmed in code.

### What is actually happening

The OOH outcome-capture endpoint `/api/outcomes` creates a Zendesk ticket FIRST, and the Cosmos audit write then depends on the ticket id that the Zendesk call returns. So if the `ZENDESK_API_TOKEN` is bad, the Zendesk call returns a 401, the request aborts before the audit write, and NO Cosmos audit row is ever written. That is exactly the path the deploy smoke test exercises when it posts a captured outcome and then checks for the audit row — so a bad token presents as a failing Cosmos-write smoke, even though Cosmos itself is healthy.

The evidence sits in a small number of places:

- `routes/api.js` — the `/outcomes` handler at about line 207. It calls `zendesk.createOutcomeTicket(...)` at about line 220 and only afterwards writes the audit entry at about line 244, passing `ticketId: ticket.id`. The audit write therefore cannot run until the ticket-create resolves with an id.
- `routes/api.js` — the `wrap` error wrapper at about line 27 catches the thrown error and returns it to the caller. There is no fallback that lets the outcome proceed without a ticket.
- `services/zendesk.js` — the internal `zd(...)` request helper re-throws on any error (it flips the health flag and then `throw err`), so a 401 from the ticket-create propagates straight back up into the handler and aborts the request.
- Auth is the standard Zendesk API-token Basic scheme: `base64(email/token:ZENDESK_API_TOKEN)`, built in `buildAuthHeader` in `services/zendesk.js`. The `ZENDESK_PASSWORD` variable is deprecated and a no-op — it is retained in `config.js` only for back-compat and is never used to authenticate. This resolves the token-versus-password confusion: the live credential is the API token, not a password, and Bearer is rejected.

There is a "looks like it works" trap worth calling out. Some Zendesk read paths silently swallow a 401 rather than failing. Site-tag resolution (`resolveSiteTag`) returns null on error, and the callback lookup returns a result object with `unresolvedSiteTag: true` under an HTTP 200 rather than surfacing the auth failure. Those are read-only, non-write paths, so a broken token can appear harmless when exercised through callback lookup while still hard-failing the outcome-capture write path. Do not take a green callback lookup as evidence the token is good.

### Options and trade-offs

- Option (d) — Fix or override the token. Pure ops/config change, immediate, unblocks the smoke now. Recommended for the immediate smoke.
- Option (b) — Make the ticket-create non-fatal. A code change so the handler still writes the audit row with a null ticket id plus a data-quality flag when Zendesk fails. This mirrors the existing pattern already used for reconciliation and SMS, both of which are explicitly written to never block or fail the outcome. Recommended as the durable fix.
- Option (a) — Reorder so Cosmos writes first and then back-fills the ticket id via the existing `attachTicket` path. More invasive and less preferred than (b).
- Option (c) — A smoke-only Zendesk stub. Diverges the test from production behaviour and is the least attractive.

### Recommendation

Do (d) now to unblock the smoke. Adopt (b) as the durable code fix so that a future Zendesk outage or bad token never again silently loses the audit trail.

## Blocker 2 — ThingsBoard duplicate Zendesk tickets

Verdict: PARTLY real. The duplicate-ticket problem is real and documented, but it lives ENTIRELY in the ThingsBoard platform rule chain, NOT in this dashboard repo — so it is OUT OF SCOPE for a dashboard PR.

### What is actually happening

ThingsBoard posts alarms directly to Zendesk via a rule chain, independently of this dashboard. The duplicates come from three causes:

- A retry chain that re-POSTs when Zendesk actually creates the ticket but returns a timeout or a 429. This is the main driver of duplicates.
- Multiple alarm-state messages emitted per event.
- Five filter scripts left as placeholder `return msg.temperature > 20`, which means the severity, OOH-suppression, existing-ticket and dedup gates are all non-functional.

Close-timing duplicates rose from roughly 4 per 100 tickets in mid-March to roughly 57 per 100 in late April 2026, so the problem is escalating. A `lighthouse_alarm_id` dedup field was designed but never implemented, and even if implemented it would only address flapping, not the retry double-POST.

This dashboard repo is verified NOT to be in that path:

- The only Zendesk POST in this repo is the human-triggered OOH outcome ticket created from `/api/outcomes`.
- The ThingsBoard client in this repo only reads devices and telemetry and writes setpoint attributes; it does not create alarms or post to Zendesk.
- `lighthouse_alarm_id` appears nowhere in the repo.

### Two adjacent items to clarify

- The "ThingsBoard read-auth down" symptom is a FALSE ALARM. It is a lazy `/healthz` flag that only flips to healthy after the first real device read; before any read it reads as unhealthy. Spencer proved ThingsBoard is reachable from the pod. This is tracked as OOHDASH-64 and should be reframed rather than treated as an outage.
- OOHDASH-26 (Service Bus dead-lettering roughly 31 messages) is a SEPARATE, third Zendesk-writing path — the SD-330 NetService-to-Zendesk sync — and is not this duplicate-ticket bug.

### Options, ownership and scope

- Option (a) — Remove the retry chain and fix the severity filter on the ThingsBoard rule chain. TB-admin owned. Expected to remove roughly 90% of duplicates. A backup and a sub-60-second rollback are already prepared.
- Option (b) — Repair the remaining broken filter scripts. TB-admin owned.
- Option (c) — Implement `lighthouse_alarm_id` dedup (a Zendesk custom field plus a TB payload change). A secondary guard against flapping only.
- Option (d) — Zendesk-side merge automation.
- Option (e) — Route alarms through the dashboard or bridge. High cost and not justified.

Every one of these lives outside this repo except (e).

### Recommendation

Apply (a) plus (b) on the ThingsBoard rule chain (owner: IoT/TB admin — James to action or delegate). Track it as a ThingsBoard-side work item, NOT a dashboard PR. `lighthouse_alarm_id` dedup is a good longer-term guard once the retry and filter issues are fixed.

## Risks and residuals

- The Cosmos-write smoke stays blocked until the token is fixed or overridden.
- There is a CIR documentation inconsistency: the k8s secret key list still names `ZENDESK_PASSWORD` rather than `ZENDESK_API_TOKEN`. This should be corrected so the live credential key is unambiguous.
- The ThingsBoard fix needs a TB-admin change window.
- The duplicate-ticket problem is escalating over time, so it is time-sensitive even though it is out of dashboard scope.

## Recommended next steps

1. Ops: fix or override `ZENDESK_API_TOKEN` in the k8s secret and re-run the Cosmos-write smoke.
2. Open a dashboard code item for the non-fatal ticket-create durable fix (Blocker 1, option b).
3. Raise and route a ThingsBoard-side work item for the rule-chain retry and filter fix (Blocker 2, options a plus b) to the TB-admin owner.
4. Correct the CIR secret-key documentation inconsistency (`ZENDESK_PASSWORD` versus `ZENDESK_API_TOKEN`).

Only item 2 is a dashboard-repo change. Items 1, 3 and 4 are ops, platform and documentation actions respectively.
