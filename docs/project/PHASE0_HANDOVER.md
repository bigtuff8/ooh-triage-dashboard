# Phase 0 Handover — OOH Triage Dashboard: Deploy & Smoke

*For a fresh session tasked with completing the Phase 0 items (OOHDASH Sprint 1). Prepared 14 Aug 2026. This doc is self-contained — read it fully before acting.*

---

## Mission

Get OOH Triage Dashboard **v1.2.0** deployed to the live platform (write-locked) and prove it works end-to-end. Phase 0 = **deploy & smoke only** — no live device control, no live SMS. Success = the app is live, a real end-to-end smoke test passes (including a real Cosmos write), and the branch is merged to `main`.

You are the deliverer. Two items are gated on other people (Spencer, Jonathan) — track and chase them; do the rest yourself.

## Current state (context)

- The app is **built, tested (63/63), released as v1.2.0**, on branch `feature/go-live-sd586` (HEAD `73560c6`), pushed to GitHub, **not merged, not deployed**. No CI/CD — deploy is self-serve (`az acr build` → `kubectl set image`).
- The prod platform is **live as a "coming soon" placeholder** at `https://ooh.airedale-group.io`. Spencer's platform ticket **SD-586 is closed/Done**.
- **Release approach:** the formal write-locked canary *gate* was dropped in favour of an operational pilot (roll out to ~2 users, then widen). We keep **one** idea from it: a real-Cosmos-write smoke check (a green `/healthz` can lie).
- **Spencer's 14 Aug reply cleared the deploy gate:** SD-330 Cosmos grant narrowed (done); Jonathan's Zendesk token loaded into `ooh-dashboard-secrets` **but it doesn't authenticate as-is** — it's a `scapi_` OAuth-style token, wrong for the app's classic `email/token` Basic auth. Fix = switch the app to `Authorization: Bearer` **and** confirm the token is valid with Jonathan. Spencer confirmed **this does not block the canary** (writes off, SMS log).

Full background: `OOH_CATCHUP_AND_BACKLOG_2026-08-14.md` (§5 canary explainer, §7 revised plan). Deploy detail: `DEPLOY_RUNBOOK.md`. Safe-testing: `TEST_STRATEGY_live-integrations.md`.

## The Phase 0 tickets (OOHDASH, Sprint 1)

| Ticket | Task | Owner | Gating |
|---|---|---|---|
| **OOHDASH-2** | Switch Zendesk client to `Authorization: Bearer` (B7) | **You** | none — do now |
| **OOHDASH-3** | Confirm B1/B3/B4 infra prereqs with Spencer | Spencer | **blocks deploy** |
| **OOHDASH-4** | Confirm `scapi_` Zendesk token complete/active with Jonathan | Jonathan | blocks live ticketing / clean smoke |
| **OOHDASH-5** | Build image + deploy (`kubectl set image`), quiet hours | **You** | blocked by -3 (and -2) |
| **OOHDASH-6** | Deploy smoke test incl. real-Cosmos-write check | **You** | blocked by -5 |
| **OOHDASH-7** | Merge `feature/go-live-sd586` → `main` | **You** | after -6 passes |

Recommended order: **-2 (code, now)** → chase **-3 / -4 (parallel)** → **-5 → -6 → -7** once -3 confirms.

---

## Task 1 — Zendesk Bearer change (OOHDASH-2)

**Repo:** `C:/Users/james/OneDrive - Airedale Catering Equipment/Projects/Work/IOT OOH Dash/ooh-triage-dashboard` (git repo, branch `feature/go-live-sd586`).

**The single auth point:** `services/zendesk.js`, function `authHeader()` (lines ~18–21). Every Zendesk call routes through the `zd()` helper which uses `authHeader()`; there is no second code path.

Current:
```js
const authHeader = () => ({
  Authorization: `Basic ${Buffer.from(`${config.zendesk.email}/token:${config.zendesk.apiToken}`).toString('base64')}`,
  'Content-Type': 'application/json'
});
```
Change to:
```js
const authHeader = () => ({
  Authorization: `Bearer ${config.zendesk.apiToken}`,
  'Content-Type': 'application/json'
});
```

Notes:
- `config.zendesk.subdomain` and `apiToken` are **still required** (subdomain builds the base URL + agent links). `config.zendesk.email` becomes **unused** after this (its only consumer is the header) — leave the env var wired (harmless) or drop it; your call. `validateConfig()` does **not** check Zendesk fields, so nothing else needs touching.
- **For testability:** `authHeader` is module-private and only fires in live mode. Extract a pure `buildAuthHeader(cfg)` (or export `authHeader`) and add `test/zendesk.test.js` under `node --test` asserting `Authorization === 'Bearer <token>'` and that it does **not** start with `Basic`. There is currently **no** test on the auth header.

**⚠️ The credential-type reconciliation (important — read before calling this "done"):**
- Zendesk `Bearer` expects an **OAuth-style token**, not a classic API token. `DEPLOY_RUNBOOK.md` RB-2 still says "reuse Jonathan's email + API token (Basic)". **That wording is superseded** by Spencer's 14 Aug direction: the token he loaded is a `scapi_` OAuth-style token, so **Bearer is the correct scheme** — *provided the token value is valid and complete*.
- So the header swap is correct, but "done" also requires a **valid `scapi_` token** (OOHDASH-4). The definitive proof is a live `401 → 200` against Zendesk after deploy (Spencer offered to re-run this check), or a real call locally if you have a valid token.
- Note: the token value the pod uses lives in the k8s secret `ooh-dashboard-secrets` (Spencer-loaded); an older classic token may sit in the CIR `credentials/zendesk.env` — **do not** assume that's the right one for Bearer. The unit test only needs to assert header *shape*; the live check validates the *value*.

**Run tests:** unit `npm run test:unit` (= `node --test "test/*.test.js"`); e2e `npm test` (= `npx playwright test`). Run just the new one: `node --test test/zendesk.test.js`.

Commit on `feature/go-live-sd586`. Move OOHDASH-2 → In Progress → Done with a comment referencing the commit; note the live 401→200 verification is pending token confirmation (OOHDASH-4).

## Task 2 — External unblocks (OOHDASH-3 Spencer, OOHDASH-4 Jonathan)

These gate the deploy — chase them in parallel with Task 1.

**OOHDASH-3 (Spencer) — confirm before deploy:**
- **B1:** the 4 Cosmos containers exist in DB `ooh-dashboard` — `OohOverrides`, `OohAuditLog`, `OohAppConfig`, `OohSmsLog`, each partition key `/storePartition`. *(The app's data-plane identity cannot create these; if missing, the smoke step 4a real write throws 404.)*
- **B3:** the in-cluster workload identity `id-ooh-dashboard-prod` holds Cosmos **Data Contributor** on `/dbs/ooh-dashboard` **and** secret read.
- **B4:** the placeholder deployment carries `serviceAccountName: sa-ooh-dashboard` + the WI label + `envFrom: ooh-dashboard-secrets`.

**OOHDASH-4 (Jonathan):** confirm the `scapi_` Zendesk token value loaded into `ooh-dashboard-secrets` is **complete and active** with the right scopes (the Bearer 401 suggests truncation or an un-activated token).

Draft the chase messages, run them past James before sending, and update the tickets with responses. Leave -3/-4 as blocked/waiting until confirmed.

## Task 3 — Build + deploy (OOHDASH-5) — only after OOHDASH-3 confirms

**Kubeconfig:** `export KUBECONFIG=~/.kube/ooh.yaml` — the scoped config Spencer delivered 1:1 (SA `deployer-ooh`; can `set image` + read logs/rollout only). **Do NOT** use `az aks get-credentials` — the cluster is not AAD-integrated. If `~/.kube/ooh.yaml` isn't present, get it from Spencer's handover before proceeding.

From inside the repo, on `feature/go-live-sd586`, **during quiet hours** (`replicas: 1` → the swap briefly drops the only pod and re-SSOs everyone):
```bash
# build (ACR task runner role authorises this)
az acr build --registry apitechhub --image ooh-dashboard:$(git rev-parse --short HEAD) .
# deploy
kubectl -n iot-services set image deployment/ooh-dashboard \
  ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:$(git rev-parse --short HEAD)
# watch
kubectl -n iot-services rollout status deployment/ooh-dashboard
```
- Deployment + container name: `ooh-dashboard`; namespace: `iot-services`; tag: git short sha (never `:latest`).
- The Dockerfile has a build-time guard that fails if `@azure/identity` is missing (keyless Cosmos dep) — expected, leave it.
- Canary safety levers are held in git and stay on: `WRITES_DISABLED=true`, `SMS_PROVIDER=log`.

## Task 4 — Smoke test (OOHDASH-6)

Minimal checklist for the write-locked deploy (from `DEPLOY_RUNBOOK.md` Step 4):
1. `GET /healthz` → 200, subsystems green. *(Necessary but not sufficient — see step 5.)*
2. **SSO with an IoT-team account first** — they carry `claimArea 1400 → iot`, proving the public-PKCE client + `AreaClaim[]` parse before any handler (1500) accounts exist.
3. Device board renders live bridge reads.
4. One **non-P1 canary call** → a real `ooh`-tagged Zendesk ticket (status `new`) with the `[TRG]` transcript; confirm it appears in the SD-330 OOH Review queue. *(This step needs the Bearer token working — if OOHDASH-4 isn't confirmed yet, expect it to 401; treat as known-pending, not a deploy failure.)*
5. **Step 4a — REAL Cosmos write proof — HARD GATE, DO NOT SKIP:** confirm the call actually persisted to a pre-created container (an `OohAuditLog` entry, and/or `OohSmsLog` on the P1 path). A keyless upsert against a missing/mis-permissioned container **throws** (unlike the `/healthz` point-read). If it throws: 404 → a container wasn't pre-created (back to OOHDASH-3/B1); 401/403 → in-cluster WI RBAC wrong (B3). **Stop and resolve.**
6. Confirm **no** device write occurred (`WRITES_DISABLED`) and the P1 path only **logged** (no SMS).
7. Confirm call-ticket reconciliation on a call that has a Zendesk Talk ticket.
8. Clean up canary tickets + any canary store docs.

## Task 5 — Merge (OOHDASH-7)

After the smoke passes, merge `feature/go-live-sd586` → `main` (prove-live-first, then merge to keep `main` honest). Update OOHDASH-7.

---

## Guardrails — do NOT

- **Do not enable device writes or live SMS.** Phase 0 is deploy + smoke only. `WRITES_DISABLED=true` and `SMS_PROVIDER=log` stay as-is. Live device control is deferred to a supervised, man-marked Stage 2 (OOHDASH-14) — sites are open/trading in a heatwave; a stray control write could cause real harm.
- **Do not touch SD-330** (the IoT Support Dashboard). The only agreed cross-product change is the D-2 ingress exemption, which is Phase 2 (OOHDASH-21), not now.
- **Do not waive smoke step 4a** (the real Cosmos write).
- **Do not deploy outside quiet hours** without flagging it (single replica = a live re-SSO for everyone on shift).
- **Do not `az aks get-credentials`** — use the scoped kubeconfig.

## Access & credentials

- **Repo / branch:** as above. **Kubeconfig:** `~/.kube/ooh.yaml` (from Spencer). **Registry:** `apitechhub` (ACR; your ACR Task Runner role authorises `az acr build`). **Key Vault:** read-only — Spencer loads secrets, you can't.
- **CIR** (`…\Central Integration Repository`) documents Jira, Zendesk (subdomain `theairedalegroup`, `credentials/zendesk.env`) and harness plumbing well — but the **OOH Azure deploy surface (kubeconfig, ACR, Key Vault, B2C, OOH Cosmos DB) is NOT in the CIR.** Get those from Spencer / this project's docs.
- **Follow-up task:** once the deploy plumbing is confirmed, **create a new CIR topic doc `OOH_DASHBOARD_DEPLOY.md`** capturing the kubeconfig location, ACR build/deploy commands, namespace, the OOH Cosmos `ooh-dashboard` keyless model, and the "not AAD-integrated → use kubeconfig" gotcha (per James's standing rule to keep the CIR current).

## Jira

- Site `airedale-api.atlassian.net`, cloudId `980108f4-3398-44f5-8fde-336ffe4fa810`, project **OOHDASH** (id 10716, company-managed scrum). Auth token in CIR `credentials/jira.env`; Atlassian MCP tools available.
- As you work: transition each ticket To Do → In Progress → Done and add a short comment (commit sha, smoke evidence, or the external confirmation). Keep -3/-4 blocked until confirmed. Keep the board the single source of truth.

## Definition of done (Phase 0)

- OOHDASH-2 merged (Bearer + test) ✔
- OOHDASH-3 confirmed by Spencer ✔ · OOHDASH-4 confirmed by Jonathan ✔
- OOHDASH-5 deployed (v1.2.0 image live) ✔
- OOHDASH-6 smoke passed incl. real Cosmos write; writes/SMS confirmed off ✔
- OOHDASH-7 merged to `main` ✔
- Tickets updated; a one-line status back to James; Stage-1 pilot (Phase 1) ready to begin.

## Escalation

- **Spencer Thompson** (Spencer.Thompson@airedale-group.co.uk) — platform/infra (OOHDASH-3), deploy access.
- **Jonathan Wilkinson** (jonathan.wilkinson@airedale-group.co.uk) — Zendesk token (OOHDASH-4).
- **James** — decisions, sign-off, and sending any external chase messages.
