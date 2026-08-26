# Phase 0 Resume Handover — OOH Triage Dashboard (2026-08-19)

*For a fresh session picking up mid-smoke. Self-contained — read fully before acting. Supersedes the assumptions in `PHASE0_HANDOVER.md` where they conflict (that doc's Zendesk-Bearer and B2C-public-client premises were both proven WRONG live — see §"Corrections").*

---

## TL;DR — where we are right now

**v1.2.0 is DEPLOYED and live** at `https://ooh.airedale-group.io`, write-locked (`WRITES_DISABLED=true`, `SMS_PROVIDER=log`), Cosmos-connected. The deploy (OOHDASH-5) is **done**. We are **mid-smoke (OOHDASH-6)**: machine-side checks pass; the SSO login was blocked by a B2C client-type mismatch which has now been **fixed in code and built**, but **not yet deployed/tested live** because the workstation lost internet (reboot in progress).

**The single next action:** once networking is back, deploy image **`452bf02`** (already built + pushed to ACR — no rebuild needed) and run the login + real-Cosmos-write smoke. See §"Resume steps".

**Currently live pod:** image `b46d374` (a superseded build whose SSO still fails). **Deploy `452bf02` to fix.**

---

## Corrections to the original handover (all verified LIVE — do not regress these)

1. **Zendesk auth is plain account-password Basic — `Basic base64(email:password)`.**
   - NOT the `scapi_`/Bearer token (that token was for a *different system* — dead, 401s both ways).
   - NOT the classic `email/token:apitoken` API-token scheme either.
   - Username = plain `jonathan.wilkinson@airedale-group.co.uk`; password lives in **`airedale-kv-prod` / `ooh-dashboard-zendesk-password`**, must be loaded into the k8s secret `ooh-dashboard-secrets` as **`ZENDESK_PASSWORD`** (Spencer's action — see §Open items). App code already does `email:password` (`services/zendesk.js` `buildAuthHeader`).
   - **Not yet tested live** (prod-KV value reads hang from the workstation, and the password isn't wired into the secret yet). Zendesk is **non-blocking** for Phase 0.

2. **B2C is secret-less IMPLICIT `id_token` sign-in — NOT public-PKCE, NOT confidential+secret.**
   - Live token-exchange (auth-code) was rejected: `AADB2C90079: Clients must send a client_secret when redeeming a confidential grant`.
   - Per Spencer: the shared `Techhub-Production` client (`beb991e8-69d0-4fef-9c8e-e85793ceee75`) is used by every .NET hub as **sign-in only, `response_type=id_token` (implicit)** — there is **NO client secret by design**.
   - The app was rewritten to the implicit flow (`response_type=id_token`, `response_mode=form_post`, id_token validated in-app via `jose`: signature/iss/aud/exp/nonce/state, with a `SameSite=None` signed correlation cookie for the cross-site POST). This needs **no client secret and no new env var** — so **SSO is fully self-serve**.
   - ⚠️ **Watch at first live login:** if `B2C_1_KnowledgeBaseSignIn` has id_token issuance disabled on the app registration, login fails at the *authorize* step. Spencer says the hubs use exactly this, so it should be enabled — but that's the first thing to check if authorize errors.

3. **Cosmos lives on the PROD account `airedale-knowledgebase`, not `-uat`.**
   - Endpoint `https://airedale-knowledgebase.documents.azure.com:443/`, DB `ooh-dashboard`, `disableLocalAuth:true` (AAD only). B1 containers (`OohOverrides`, `OohAuditLog`, `OohAppConfig`, `OohSmsLog`, PK `/storePartition`) **verified live present**. `COSMOS_ENDPOINT` in the secret already points here.

4. **Deploy is NOT just `kubectl set image`.** The original placeholder had SA + WI label but **no app env and no `envFrom`**. We applied env (`NODE_ENV/AUTH_MODE/DATA_MODE/PORT/WRITES_DISABLED/SMS_PROVIDER`) + `envFrom: ooh-dashboard-secrets` via **one `kubectl patch`** at first deploy. The live deployment now carries them, so **subsequent deploys ARE just `set image`**.

5. **`az acr build` build-context gotcha.** Building from the repo dir fails on a stray `.claude/worktrees/**` Windows long-path (`WinError 3`). **Build from a clean `git archive` export** (see §Resume). A `.dockerignore` alone does NOT fix it (the failure is during the tar walk, before ignores apply).

---

## Resume steps (fresh session)

Prereq: workstation online again — verify `curl -s https://api.ipify.org`.

```bash
export KUBECONFIG=~/.kube/ooh.yaml           # ctx 'ooh', ns iot-services, SA deployer-ooh

# 1) Deploy the implicit-flow build (ALREADY built + pushed — do NOT rebuild)
kubectl -n iot-services set image deployment/ooh-dashboard \
  ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:452bf02
kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=120s

# 2) Confirm implicit flow + safety locks
POD=$(kubectl -n iot-services get pod -l app=ooh-dashboard --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}')
kubectl -n iot-services logs "$POD" | grep -iE 'implicit id_token|v1.2.0|auth:|data:'
kubectl -n iot-services get pod "$POD" -o jsonpath='{range .spec.containers[0].env[*]}{.name}={.value}{"\n"}{end}' | grep -iE 'WRITES_DISABLED|SMS_PROVIDER|DATA_MODE'
curl -s https://ooh.airedale-group.io/healthz            # expect 200; store:cosmos healthy=true
```

**3) SSO + UI smoke via Playwright (James completes the B2C login):**
- `browser_navigate https://ooh.airedale-group.io` → redirects to Airedale B2C.
- James signs in with an **IoT-team account (claimArea 1400 → iot)**, completes MFA.
- Should land on the dashboard (no `AADB2C90079`). If it errors, read the pod log — the `/auth/callback` handler now logs provider error detail.
- Confirm the **device board renders** live bridge reads (bridge/TB show `healthy=false` on `/healthz` until first authenticated load — exercise them here; if still failing after login, that's a real bridge/TB cred/network item to chase, but NOT the Cosmos hard gate).

**4) HARD GATE — real Cosmos write (do NOT skip):** trigger one **non-P1 canary action** in the UI, then verify it persisted:
```bash
# from the repo (needs @azure/cosmos + @azure/identity in node_modules) — probe script at
# scratchpad/cosmos_probe.mjs lists containers; adapt to read newest OohAuditLog / OohSmsLog docs.
# James's user has Cosmos Data Contributor on /dbs/ooh-dashboard for local reads.
# Endpoint: https://airedale-knowledgebase.documents.azure.com:443/  DB: ooh-dashboard
```
A missing container → 404, mis-permissioned WI → 401/403 (would also surface as an app error on the action). Confirm the doc landed.

**5) Confirm no device write occurred and the P1 path only logged** (pod logs; `WRITES_DISABLED=true`), then **clean up** any canary Cosmos docs (and tickets if Zendesk is wired).

**6) OOHDASH-7 — merge `feature/go-live-sd586` → `main`** once smoke passes.

---

## Open items

| Item | Owner | Blocking? | Notes |
|---|---|---|---|
| Deploy `452bf02` + finish smoke | fresh session | — | the only remaining Phase-0 work; steps above |
| Load `ZENDESK_PASSWORD` into `ooh-dashboard-secrets` (from `airedale-kv-prod/ooh-dashboard-zendesk-password`) | **Spencer** | No (Zendesk non-blocking) | then test `email:password` live 200 |
| Prod-KV data-plane read + AKS API reachable from workstation | infra/network | Yes (transiently) | value reads on `airedale-kv-prod` and the AKS API were timing out pre-reboot; likely IP-allowlist/VPN. If they persist post-reboot, may need Spencer to confirm AKS authorized-IP-ranges / KV firewall for the current egress IP |
| Follow-up: require `OIDC_CLIENT_SECRET`? **No** — implicit needs none. But add a live-mode Zendesk cred guard in `validateConfig` (optional) | fresh session | No | noted in commit `452bf02` |

---

## Access / coordinates

- **Repo:** `C:\Users\james\OneDrive - Airedale Catering Equipment\Projects\Work\IOT OOH Dash\ooh-triage-dashboard`, branch **`feature/go-live-sd586`**, HEAD **`452bf02`**. Tests: `npm run test:unit` → 36/36.
- **Kubeconfig:** `~/.kube/ooh.yaml` (= `C:\Users\james\.kube\ooh.yaml`; recovered from Spencer's 27 Jul 16:02 email attachment `KUBECO~1.YAM`). ctx `ooh`, cluster `apitechhub` (`apitechhub-dns-wgms8mzu.hcp.uksouth.azmk8s.io`), ns `iot-services`, deployment `ooh-dashboard`, SA `deployer-ooh`. **Do NOT `az aks get-credentials`** (cluster not AAD-integrated).
- **`deployer-ooh` can:** get/patch `deploy`, get `pods` + `pods/log`. **Cannot:** `update`/`create deploy`, `get secret`. (So env changes go via `kubectl patch`; secret contents are Spencer-managed and unreadable to us.)
- **ACR:** `apitechhub` (your ACR Task Runner role authorises `az acr build`). Build from a clean `git archive` context (§Corrections #5).
- **Cosmos:** account `airedale-knowledgebase` (PROD), endpoint above, DB `ooh-dashboard`. James's user has Data Contributor on `/dbs/ooh-dashboard` (local reads/writes for verification).
- **Jira:** site `airedale-api.atlassian.net`, cloudId `980108f4-3398-44f5-8fde-336ffe4fa810`, project **OOHDASH**. Transitions: In Progress `21`, Done `31`.
- **Guardrails (unchanged):** Phase 0 = deploy + smoke only. Keep `WRITES_DISABLED=true`, `SMS_PROVIDER=log`. No live device control / SMS. Don't touch SD-330. Single replica → a redeploy re-SSOs anyone logged in (first flip was harmless — placeholder had no sessions).

---

## Jira / ticket state (at handover)

- **OOHDASH-2** (Zendesk auth) — **Done**. Evolved Bearer→Basic(email/token)→**Basic(email:password)** as live tests corrected each assumption.
- **OOHDASH-3** (B1/B3/B4) — B1 verified live, B3 confirmed, B4 proven by the successful patched rollout. (Move to **Done** if not already.)
- **OOHDASH-4** (scapi_ token) — **Done (moot)** — wrong system.
- **OOHDASH-5** (deploy) — **Done**.
- **OOHDASH-6** (smoke) — **In Progress**; paused for reboot. Resume per §Resume steps.
- **OOHDASH-7** (merge to main) — **To Do**; after smoke passes.

## Commit trail on `feature/go-live-sd586` (baseline `73560c6` = v1.2.0)

`601fc44` Zendesk Bearer *(superseded)* · `699afcd` Zendesk Basic email/token *(superseded)* · `068914e` .dockerignore/build-context fix · `567745b` /auth/callback error logging · `b46d374` confidential-client secret support *(superseded)* · `c924d23` **implicit id_token flow** · `452bf02` **Zendesk email:password** (HEAD). The superseded commits are harmless in history; final code state is correct (tests green). Optionally note in the merge that the auth approach converged via live testing.

---

## Resume session update (2026-08-19, post-reboot) — READ THIS FIRST on next pickup

**Deploy is now genuinely done; smoke is blocked on account provisioning, not tech.**

1. **452bf02 was NOT in ACR** despite this doc's earlier claim (kubelet NotFound). Rebuilt from a clean `git archive HEAD` export and pushed (digest `sha256:19ed973c01cf44bbbf23144fec63cb05ff7e4b30685c8054773d8aa10f264fc1`). Repo HEAD confirmed `452bf02`. **The tag now exists in ACR** — a fresh session should NOT need to rebuild (verify with `az acr repository show-tags -n apitechhub --repository ooh-dashboard`).
2. **Rolled to 452bf02, clean.** Old `b46d374` pod gone; one new pod. Machine smoke PASS (implicit id_token in logs; WRITES_DISABLED=true / SMS_PROVIDER=log / DATA_MODE=live; `/healthz` store:cosmos healthy=true).
3. **SSO verified LIVE end-to-end at the protocol level.** App redirects to B2C `response_type=id_token`; sign-in page renders (no AADB2C90079 — the id_token-issuance watch item is CLEARED); id_token validates in-app (sig/iss/aud/nonce/state).
4. **App authz gate works as designed.** A no-role login is correctly 403'd. Log: `[AUTH] Sign-in without OOH role: sub=<b2c-oid>`.

### THE ONE BLOCKER — role provisioning
The dashboard admits only tokens whose **`extension_Role`** claim carries **`claimArea 1400` (→ iot)** or **`1500` (→ handler)** — see `services/auth.js` `mapRole()` + `config.oidc.roleMap` (`{"1500":"handler","1400":"iot"}`). James's own account (`sub=9bf90d02-2b64-4a55-81fa-00340efc65ba`) has neither, so it cannot drive the real-Cosmos-write hard gate.
**To finish smoke you need ONE of:**
- (a) a login from an account **already provisioned** with claimArea 1400 or 1500, **or**
- (b) the **IoT team / Spencer** to add claimArea 1400 (or 1500) to that sub in B2C.

### Remaining Phase-0 steps (unchanged, gated on the above)
device board render check → **real Cosmos-write hard gate** → confirm no device write (P1 path logged only, WRITES_DISABLED=true) → cleanup canary docs → **OOHDASH-7 merge `feature/go-live-sd586` → main**.

### Still open, non-blocking
Spencer to load `ZENDESK_PASSWORD` into `ooh-dashboard-secrets` (new pod reports zendesk `configured:false`). Zendesk remains non-blocking for Phase 0.

---

## Resume session update #2 (2026-08-19, post-Spencer-grant) — READ THIS FIRST on next pickup

**Role gate CLEARED; but the Cosmos-write hard gate is now blocked by Zendesk (and the capture feature is broken in prod because of it).**

### ✅ Role gate resolved
Spencer granted James's B2C account **`claimArea 1500` (→ handler)** on `extension_Role`. Verified LIVE, server-side (not just UI): `GET /api/me` → **200** with `operator: { name:"James Brown", role:"handler", roleLabel:"OOH Handler" }`, `dataMode:"live"`, `writesDisabled:true`. The dashboard renders as OOH Handler via SSO. Nav produced no new `/auth/callback` log line because the app logs nothing on a *successful* sign-in — the earlier `[AUTH] Sign-in without OOH role: sub=9bf90d02...` lines (12:21–12:23Z) were **pre-grant** attempts.
- Spencer's context: the enum-based claim system is deprecated; the new permissions weren't in the admin site's built version so couldn't be added through its UI. He granted access directly and *temporarily patched the admin UI* to expose the new claims. (Future: the new "shell hub" mints hub/areas as GUIDs read from config — the enum problem goes away.)

### ⛔ NEW BLOCKER — Cosmos-write hard gate is unreachable while Zendesk is unconfigured
Every handler-reachable Cosmos write funnels through Zendesk **first**:
- `POST /api/outcomes` (the capture/escalate path) calls `zendesk.createOutcomeTicket()` (`routes/api.js:219`) **before** the `audit.logAction` Cosmos write (`:243`). In live mode `createOutcomeTicket` does an **unwrapped** `POST /tickets.json` (`services/zendesk.js:197` via `zd()`:34–43, which rethrows on error). Zendesk is `configured:false` (no `ZENDESK_PASSWORD`), so it sends `Basic base64(email:)` → **401 → throws → outcome fails → NO Cosmos write.**
- `POST /api/query` shares the same `createOutcomeTicket` (also Zendesk-first).
- `POST /api/control/dispatch` writes `OohOverrides` but needs **iot** role + a **confirmed site** (device inventory is degraded) + writes enabled — triply blocked for a handler.
- **No admin/killswitch/notices write route is mounted** — `server.js` mounts only `/auth` + `/api`; the 9 `/api` POSTs are all of the above.

**Therefore:** (1) the real-Cosmos-write hard gate can't be exercised through the app right now, and (2) **the core capture-outcome feature is broken in prod** — a handler hitting "capture" gets a 500. So **`ZENDESK_PASSWORD` is effectively BLOCKING**, not the "non-blocking" this doc previously assumed.

Boot `storeProbe()` only does a **read** (`services/store.js:220` point-read of `__ooh_health_probe__`). So `store healthy=true` proves WI **token + read**, **NOT write** — the write gate is genuinely still unproven.

### ⚠️ Second, independent degradation — ThingsBoard read auth down
`/healthz`: `thingsboard.read:false` / `write:false` (bridge is now `healthy:true` — it warmed on the authenticated load, as expected). `GET /api/sites/search` → **503 "Device inventory unavailable — degraded mode"**, so a real handler can't resolve a site through the UI. Per this doc's earlier note, TB-read failing *after* login is "a real bridge/TB cred/network item to chase." A canary can bypass it via a direct authed `POST /api/outcomes` with a literal `siteNo`.

### How to finish the hard gate (options put to James 2026-08-19; he was away — decision pending)
- **(A, recommended)** Spencer loads `ZENDESK_PASSWORD` into `ooh-dashboard-secrets` (from `airedale-kv-prod/ooh-dashboard-zendesk-password`). Then drive a real end-to-end capture canary via authed `POST /api/outcomes` (works even with TB read down) → verify the doc landed in `OohAuditLog` → confirm no device write (P1 path logged only) → cleanup canary docs → OOHDASH-7 merge. This also fixes the broken capture feature.
- **(B)** Add a WI write-probe (extend `storeProbe` to upsert+delete a canary doc, or a tiny authed admin route) + rebuild/redeploy. Proves WI **write** independent of Zendesk/TB and hardens the boot probe — but expands Phase-0 scope and leaves the capture feature broken.
- **(C)** Accept the read-probe as sufficient + confirm the WI's Cosmos role is Data **Contributor** (not just Reader) via Azure RBAC. Weakest; never exercises a real write. NB: app WI client id **`90fa1ba2-6d26-4646-8969-e548a2b7693b`** (SA `sa-ooh-dashboard`). Couldn't verify its role this session — James's account lacks Entra/Graph rights and the local `az` login is an unrelated PAYG sub (`675378ab-…`); needs someone with prod-subscription rights.

### Follow-up bug to file (not Phase-0-blocking beyond the password)
`POST /api/outcomes` hard-fails if Zendesk is unreachable **mid-shift** — no graceful degrade, unlike `callbackLookup` (which returns a 503 "take the caller's details and capture the issue"). During a live OOH outage this would stop handlers recording ANY outcome. Consider: write the audit entry first / queue the ticket, so capture survives a Zendesk blip.
