# Discovery Research Log — IOT OOH Dash go-live

**Session:** 2026-07-27 · Build harness (Airedale mode) · Discovery phase
**Objective:** consolidate the OOH Dashboard workstream into its own folder, understand exactly what is built vs required, ingest Spencer's SD-586 handover, identify gaps/blockers, and lay out the go-live path — progressing as far as possible in Spencer's absence.

## Sources read (audit trail)

### Email (Outlook)
- Spencer → James, 2026-07-22 16:19 — *"RE: OOH Dashboard – now blocked"* — the unblock/handover email (SD-586). **Authoritative.**
- Spencer → James, 2026-07-22 13:38 — *"Schedule Hub Application Programming On-Boarding"* — ONBOARDING.md pointer (SD-479, adjacent).
- James → Spencer, 2026-07-14 18:08 — *"OOH Dashboard – now blocked – need stuff please"* — Section A (8 blockers) + Section B + control-path Appendix.
- James → Spencer, 2026-07-11 08:02 — *"OOH Dashboard – action required"* — first deploy ask.

### SharePoint (SD-586 folder)
- `SD-586-implementation-and-deployment.md` (Spencer, draft v0.1, 22 Jul) — **read in full**, copied to `handover/`.
- `SD-586-auth-b2c-handoff.md` (Spencer, draft v0.1, 21 Jul) — **read in full**, copied to `handover/`.
- `jb-reply-email.md` — Spencer's own draft of the reply (matches the sent email).

### Repo (`ooh-triage-dashboard`, v1.1.0, `feature/live-build-v1`)
- `RELEASE_NOTES.md` — v1.0.0→v1.1.0 feature history + known deferrals.
- `config.js` — full config + `validateConfig()` fail-secure rules.
- `services/auth.js` — `initOidc` (confidential-client `discovery(issuer,id,secret)`), `mapRole` (flat-string match), PKCE flow.
- `services/store.js` — Cosmos client built with **key** (`new CosmosClient({endpoint,key})`); containers OohOverrides/OohAuditLog/OohAppConfig/OohSmsLog.
- `k8s/deployment.yaml` — `serviceAccountName: ooh-dashboard`, `REGISTRY_PLACEHOLDER`, `envFrom ooh-dashboard-secrets`, canary levers `WRITES_DISABLED=true`/`SMS_PROVIDER=log`, `replicas:1`, WI label present.
- `Dockerfile` — multi-stage node:24-alpine, non-root, `/healthz`.
- `package.json` — deps: `@azure/cosmos`, `openid-client@6`, `express`; **no `@azure/identity`** yet.
- `docs/RUNBOOK.md` — alert conditions, health, kill-switch, restart behaviour.
- `OOH-INTEGRATION-DISCOVERY-KICKOFF.md` — prior-cycle discovery brief (producer↔consumer conformance).
- Git: on `feature/live-build-v1` @ `6498294` (pushed); stale nested agent worktree (prune blocked by OneDrive lock — cosmetic).

### Design folder (`OOH Dashboard/`)
- `PROJECT_STATUS.md` — producer status (BLOCKED on Spencer as of 14 Jul), design decisions, go-live sequence.

## Key finding — the delta

The app was built to the **original infra model** (K8s Secret, `COSMOS_KEY`, confidential OIDC client with `OIDC_CLIENT_SECRET`, flat-string roles). Spencer stood up prod on a **more secure model**: workload identity, Cosmos AAD RBAC (no key), **public PKCE client** (no secret), `AreaClaim[]` role claims. The gap is a concrete, buildable set of **app-side code changes** — see the shaping proposal.

## Verified current-state facts

| Layer | Prod state (Spencer) | App expects (as built) | Change needed |
|-------|----------------------|------------------------|---------------|
| OIDC client | Public, no secret (Techhub-Production `beb991e8…`) | Confidential (`discovery(issuer,id,secret)`; secret required) | Public client + drop secret req |
| Roles | `extension_Role` = `AreaClaim[]` (1500=handler,1400=iot) | Flat string match vs roleMap | Parse `AreaClaim[]` by `claimArea` |
| Cosmos | AAD RBAC scoped to `/dbs/ooh-dashboard`, no key | `new CosmosClient({endpoint,key})`, `COSMOS_KEY` required | `DefaultAzureCredential` + drop key |
| ServiceAccount | `sa-ooh-dashboard` (WI-annotated) | manifest `ooh-dashboard` | rename in manifest |
| Registry | `apitechhub.azurecr.io` | `REGISTRY_PLACEHOLDER` | set registry |
| TB/Zendesk creds | KV `airedale-kv-*` (email) vs K8s secret (impl doc §6) | K8s `envFrom` secret | **OQ-1: confirm mechanism** |

## Cross-product dependency confirmation (IoT Support Dashboard / SD-330)

Question: does OOH go-live have any dependency/impact on the frozen IoT Support Dashboard consumer?
Verdict: **No consumer code change; cannot break it.** Sources: `iot-support-dashboard/2026-07-11T08-55-41/`
`integration-assessment.md` (both-directions "no BREAKS" conclusion) + `design-spec.md` §1/§6/§9.

Coupling map: (1) OOH→dash deep-link `/?ticket=` — consumer landing already deployed (v1.49.0);
(2) dash reads `ooh`-tagged tickets + `[TRG]` search-description parse — producer conforms;
(3) dash reads OOH `OohOverrides` in Cosmos (failed-revert strip) — needs a **read grant** on
`dbs/ooh-dashboard` (OQ-6, the one real outstanding cross-product infra item);
(4) P1 deep-link vs basic-auth ingress — only a consumer change if D-2 = "exempt at ingress";
(5) P1-claim ack feedback (IM-02) — deferred, not go-live.

**Live verification 2026-07-27 (highest-leverage assumption ③):** created Zendesk test ticket
**#47075** with the producer's exact anchors-first `[TRG]` body (>1700 chars, tags ooh/test/claude-verify),
read it back via the **search API** — `description` returned the FULL body untruncated, anchors first;
the "IoT Dashboard — Push New Tickets" webhook fired (trigger 26455738065052). Ticket **deleted** after.
Caveat: MCP creates a public first comment (real producer uses private) — description mechanics identical;
public comment incidentally fired customer-notification triggers to the internal API service account only.
Conclusion: the frozen-consumer `[TRG]`-in-`description` promise HOLDS against live Zendesk.

## Access check (this session)
- Azure CLI / kubectl: **not available to Claude** (per Work/CLAUDE.md). Image build + deploy are James-executed (Spencer: "you deploy it yourself — infra-group creds").
- Zendesk: MCP available → the Zendesk service account + API token can be created now.
- B2C/Cosmos user-doc claim authoring: platform-side (Spencer), pending handler accounts.
