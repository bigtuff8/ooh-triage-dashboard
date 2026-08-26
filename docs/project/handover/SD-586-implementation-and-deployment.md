# SD-586 — OOH Triage Dashboard: Implementation & Deployment

> **Local copy** of Spencer's handover doc, fetched 2026-07-27 from SharePoint:
> `.../Service Transformation Project/Solution Design (SD)/SD-586 Implement OOH Triage Dashboard/SD-586-implementation-and-deployment.md`
> Source of truth = this local copy for the harness. Original on SharePoint is Spencer's.

**Status:** Draft v0.1 · 2026-07-22
**App:** `bigtuff8/ooh-triage-dashboard` (Node.js/Express, image `ooh-dashboard`), v1.1.0 on `feature/live-build-v1` — *finished & tested by JB, blocked on deploy infra*.
**Target:** prod `iot-services` namespace (`apitechhub` cluster), sibling to `iot-hub` + `integration-bridge`.
**Companion:** `SD-586-auth-b2c-handoff.md` (the auth half).
**Not to be confused with SD-330** — that's the *separate, already-live* IoT Support Dashboard at `zendesk-uat` which this app *links to*.

---

## 1. What it is & how it fits

An out-of-hours triage console for the answering-service handlers: guided call handling over Zendesk P1 tickets, a live device board, and (write-locked initially) device control. Data flows:

- **Zendesk** — ticket source (REST, service-account API token).
- **integration-bridge** (in-cluster, `iot-services`) — device read API. OOH being a sibling pod satisfies JB's **N-1** for free.
- **ThingsBoard** — read (status/telemetry) + a **scoped write** credential for `*Desired` shared-attribute control (SD-492 contract; the actual Tuya command path is SD-515).
- **Cosmos** — durable store: holds, audit, config, SMS log. The **SD-330 IoT Support Dashboard reads this same store** for its "failed revert" panel (cross-env by JB's design).
- **P1 deep-link** → `IOT_DASH_BASE_URL` = `https://zendesk-uat.airedale-api.co.uk` (the SD-330 dashboard).

Listens on `:3001`, `/healthz` for probes.

---

## 2. Identity & access — Workload Identity for Cosmos (no keys)

Per the **"no keys"** directive, Cosmos is reached via **AAD / Workload Identity**, not a master key — which aligns with the `azure.workload.identity/use: "true"` label already in JB's manifest. **Provisioned (done):**

- **Identity `id-ooh-dashboard-prod`** — clientId `90fa1ba2-6d26-4646-8969-e548a2b7693b` — federated to `system:serviceaccount:iot-services:sa-ooh-dashboard`.
- **ServiceAccount `sa-ooh-dashboard`** in `iot-services`, annotated `azure.workload.identity/client-id`.
- **Cosmos RBAC** — Built-in Data Contributor **scoped to `/dbs/ooh-dashboard` only** (not the whole account) — data-plane, **no key**, minimal blast radius. Blob (baseline) also granted.

**Still credential-based** (no Azure AAD path exists for these external systems): **ThingsBoard** (username/password) and **Zendesk** (API token). Those creds live in the K8s secret, least-privilege (SR-3 TB write cred is scoped; a dedicated Zendesk service account). Follow-up hardening: move them to Key Vault, read via the same WI.

**JB app-side changes this requires:**
1. **`serviceAccountName: sa-ooh-dashboard`** in `deployment.yaml` (was `ooh-dashboard`).
2. Add **`@azure/identity`**; build the Cosmos client with a credential, not a key: `new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() })`; **drop `COSMOS_KEY`** and its config-validation requirement.
3. Keep the `azure.workload.identity/use: "true"` label — it is now load-bearing.

---

## 3. Deployment pieces (Section A)

| # | Piece | How | Status / owner |
|---|---|---|---|
| a | **Image + registry** | Build `bigtuff8/ooh-triage-dashboard` → `apitechhub.azurecr.io/ooh-dashboard:<sha>`; fix `REGISTRY_PLACEHOLDER`. No CI in repo → manual `podman build`/push (see `CLAUDE.containers.md`) or stand up a pipeline. | ⏳ ours (+ JB repo access) |
| b | **Namespace + SA** | ns `iot-services` exists; **SA `sa-ooh-dashboard`** (WI-annotated, clientId `90fa1ba2…`) created. JB sets `serviceAccountName: sa-ooh-dashboard`. | ✅ done |
| c | **Secret `ooh-dashboard-secrets`** | envFrom source; see §6. Canary levers (`WRITES_DISABLED`, `SMS_PROVIDER`) held **in the manifest**, not the secret. | ◐ shell created; TB + Zendesk creds pending |
| d | **Cosmos** | DB `ooh-dashboard` created on `airedale-knowledgebase-uat` (cross-env); app auto-creates containers. **Access = AAD RBAC scoped to `/dbs/ooh-dashboard` — no key.** `COSMOS_ENDPOINT` set. *(SD-330 dashboard still needs its own read grant on this DB.)* | ✅ DB + RBAC done |
| e | **Bridge access (N-1)** | `BRIDGE_BASE_URL = http://integration-bridge.iot-services.svc.cluster.local`. Free via co-location; confirm the bridge's `/api/devices` read contract + whether it needs auth. | ✅ reachable / ⏳ contract confirm |
| f | **Ingress + DNS** | **DNS `ooh.airedale-group.io` → `20.162.129.214` (prod ingress) — done.** Still need the Ingress resource → svc `ooh-dashboard:80` + cert-manager TLS (once the deployment exists). B2C callback `https://ooh.airedale-group.io/auth/callback` registered. | ◐ DNS done; ingress ⏳ |
| g | **TB scoped write cred (SR-3)** | `TB_WRITE_USERNAME/PASSWORD` scoped to writing `setpointDesired/modeDesired/hwBoostHoursDesired/switchDesired` + reading the `*Reported/*SyncStatus` write-backs — nothing else. JB's F003 go-live gate; needs a bench proof. | ⏳ ours |

---

## 4. Auth — see the companion doc

Full detail in `SD-586-auth-b2c-handoff.md`. Summary: authenticates against the shared **`Techhub-Production`** B2C client (public, no secret) — **redirect URI provisioned**. JB must (1) run as a public client (drop `OIDC_CLIENT_SECRET`) and (2) make `mapRole` parse the `extension_Role` `AreaClaim[]` (key on `claimArea` int). Authorization: `ClaimArea.Zendesk (1500)` / `ClaimGroup.OohHandler (3500)` authored onto handler user docs; IoT-team users auto-map via their existing `ClaimArea.IoT (1400)` claim.

---

## 5. Canary & go-live safety

- **`WRITES_DISABLED=true`** and **`SMS_PROVIDER=log`** are set in the git manifest (auditable). Device writes flip on only at JB's go/no-go #3; live SMS (Twilio, `Q-F`) at #4.
- **`replicas: 1` is mandatory** until a shared session store is added — `express-session` state is in-process (override reverts are already multi-replica-safe via lease claims; sessions are not).
- Producer-liveness self-check raises `no-overnight-activity` if a healthy producer creates zero tickets against a non-zero baseline.

---

## 6. Config surface (the secret)

From JB's `docs/CONFIGURATION.md`. Non-secret operational vars (`NODE_ENV/AUTH_MODE/DATA_MODE/PORT/WRITES_DISABLED/SMS_PROVIDER`) live in the manifest; everything below goes in `ooh-dashboard-secrets`:

| Variable | Source / status |
|---|---|
| `APP_ORIGIN` | ✅ set — `https://ooh.airedale-group.io` |
| `SESSION_SECRET` | ✅ generated + set |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` | ✅ known (public client — **no** `OIDC_CLIENT_SECRET`) |
| `OIDC_SCOPE` / `OIDC_ROLE_CLAIM` / `OIDC_ROLE_MAP` | ✅ `openid profile email` / `extension_Role` / `{"1500":"handler","1400":"iot"}` |
| `BRIDGE_BASE_URL` | ✅ `http://integration-bridge.iot-services.svc.cluster.local` |
| `TB_URL` / `TB_USERNAME` / `TB_PASSWORD` | ⏳ read cred (portal.lhlive.co.uk) |
| `TB_WRITE_USERNAME` / `TB_WRITE_PASSWORD` | ⏳ **SR-3 scoped write cred** (F003 gate) |
| `ZENDESK_SUBDOMAIN` / `ZENDESK_EMAIL` / `ZENDESK_API_TOKEN` | ⏳ from JB (Zendesk service account) |
| `COSMOS_ENDPOINT` / `COSMOS_DATABASE` | ✅ set (`ooh-dashboard`). **No `COSMOS_KEY`** — Cosmos via AAD/WI (needs the §2 app change) |
| `ESCALATION_ONDUTY_NUMBER` / `ESCALATION_ONDUTY_NAME` | ⏳ from ops (no rush — SMS is log-only) |
| `TWILIO_*` | ⏳ only when `SMS_PROVIDER=twilio` (Section B) |
| `IOT_DASH_BASE_URL` | ✅ `https://zendesk-uat.airedale-api.co.uk` |
| `SYNC_POLL_INTERVAL_MS` / `SYNC_TIMEOUT_MS` / `LATE_SYNC_WATCH_MS` | defaults fine (3s / 90s / 10min) |

---

## 7. Operating notes (for JB)

- **Deploy/update:** no CI in the repo today — image build + `kubectl apply` are manual (ours), or we stand up a push-to-deploy pipeline like SD-330's. Until then, a new version = rebuild image + bump the deployment.
- **Env changes:** the secret is Spencer-managed — JB requests changes, we apply. Canary levers he can see in the manifest (git).
- **Health:** `/healthz` (probes), `/api/health` (version).

---

## 8. Status checklist

| Item | State | Owner |
|---|---|---|
| B2C redirect URI (prod client) | ✅ done | us |
| Auth config + claim model spec | ✅ handoff doc | us→JB |
| `Zendesk`/`OohHandler` enum values | ✅ edited (uncommitted → build) | us |
| WI `id-ooh-dashboard-prod` + `sa-ooh-dashboard` (WI-annotated) | ✅ created | us |
| Cosmos `ooh-dashboard` DB + **AAD RBAC scoped to `/dbs` (no key)** | ✅ done | us |
| Secret `ooh-dashboard-secrets` | ◐ shell created — known values + `SESSION_SECRET` set; `REPLACE_ME` on TB creds, Zendesk creds, escalation | us |
| DNS `ooh.airedale-group.io` → prod ingress | ✅ done | us |
| Image build + registry | ⏳ | us + JB repo |
| Ingress resource + cert-manager TLS | ⏳ (after deploy) | us |
| TB scoped write cred + bench (SR-3) | ⏳ | us |
| JB: public client + `mapRole` | ⏳ | JB |
| B2C handler accounts + claim authoring | ⏳ | us (after accounts) |
| WRITES/SMS enable | Section B (post-canary) | JB go/no-go |

---

## 9. Related

- `SD-586-auth-b2c-handoff.md` — the auth half.
- **SD-330** — IoT Support Dashboard (linked-to; the P1 deep-link target). **SD-520** — its B2C-SSO move.
- **SD-515** — Tuya command in the bridge (the device control OOH drives).
- **SD-492** — the `*Desired`/`*Reported`/`*SyncStatus` control contract.
- **SD-545** — IoT Hub architecture (the sibling OOH sits beside).
- **SD-583** — IoT estate security (the no-WI regression note lives here).
- Memory: `airedale-b2c-access`.
