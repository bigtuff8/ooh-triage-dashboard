# OOH Dashboard — Deploy Runbook (SD-586)

**Status:** ready to execute once Azure access is granted (see Step 0). Prepared 2026-07-27.
**App:** `bigtuff8/ooh-triage-dashboard`, branch `feature/go-live-sd586` (the SD-586 F01–F04 build, tested).
**Target:** `iot-services` namespace, image `apitechhub.azurecr.io/ooh-dashboard`, URL `https://ooh.airedale-group.io`.
**Safety:** write-locked canary — `WRITES_DISABLED=true`, `SMS_PROVIDER=log` (both in the git manifest).

> **RB-1 (corrected 2026-07-27):** the prod-model alignment (public PKCE client, `AreaClaim[]` roles, keyless Cosmos via workload identity, `sa-ooh-dashboard`, real registry) is **delivered by the F01–F04 build on branch `feature/go-live-sd586`**, cut and tested post-Design-Gate. An earlier note here claimed the code was "already aligned to prod" — that was untrue of the `feature/live-build-v1` baseline (confidential client, flat `mapRole`, keyed Cosmos, `serviceAccountName: ooh-dashboard`, `REGISTRY_PLACEHOLDER`) and the dismissed spike branch `feature/infra-alignment-v1`; deploying either would fail fail-secure boot or run the old auth model. Deploy **only** `feature/go-live-sd586`. The ingress + TLS are already live (placeholder serving). Between here and live: Azure RBAC access + Cosmos container pre-creation (Step 0).

---

## Step 0 — Azure access · **GRANTED 2026-07-27 (Spencer) — reshaped least-privilege**

> **UPDATE 2026-07-27:** Spencer granted access, reshaped for least privilege. The original 3-role
> `az role assignment` ask below is **SUPERSEDED** (kept for the record). **Actual grants** to James's
> object id `ec79d06a-…`:
> | # | Granted | Note |
> |---|---------|------|
> | 1 | **Key Vault Secrets User (read)** on `airedale-kv-{uat,prod}` | read only — **Spencer loads secrets** (James can't write); James supplies Jonathan's Zendesk cred |
> | 2 | **ACR Task Runner** (custom) on `apitechhub` | `az acr build` works (plain AcrPush would have failed) |
> | 3 | **k8s SA `deployer-ooh` + namespace Role** (scoped kubeconfig, sent 1:1) | `kubectl set image` + read logs only — **cannot** apply/create/delete/read-secrets |
> | 4 | **Cosmos DB Data Contributor** on `/dbs/ooh-dashboard` (James's user) | for **local** runs; **data-plane only — cannot create containers** |
>
> **Verify (James):** `az login --tenant 002bfc30-c863-4ca6-ab3e-bca265642fab` · `az keyvault secret list --vault-name airedale-kv-uat` (read) · `az acr show -n apitechhub` · `export KUBECONFIG=~/.kube/ooh.yaml` then `kubectl get deploy -n iot-services ooh-dashboard`. **Do NOT use `az aks get-credentials`** — the cluster isn't AAD-integrated; use the kubeconfig Spencer sent.
>
> **Still outstanding with Spencer (emailed 2026-07-27):** B1 pre-create the 4 containers (RB-3 — his data-plane grant can't) · B2 load `ooh-dashboard-secrets` · B3 confirm the **in-cluster WI `id-ooh-dashboard-prod`** (not James's user) holds Cosmos Data Contributor + secret read · B4 apply `k8s/deployment.yaml` once (SA + WI label + `envFrom`) or confirm the placeholder has them.

### (SUPERSEDED — original ask, for the record) owner: Spencer / Techhub tenant admin

James's identity in the Techhub tenant (`002bfc30-c863-4ca6-ab3e-bca265642fab`) —
**object id `ec79d06a-ae24-4012-80c4-a83eeaca4041`** — had **no RBAC** on the prod infra.
The original ask was these three (admin runs them; `--assignee-object-id` avoids a Graph lookup):

**Key Vault** (confirmed in sub `675378ab-482d-47cf-a7ab-017ecad8f2b5`, RG `airedalegroup`):
```bash
for KV in airedale-kv-uat airedale-kv-prod; do
  az role assignment create \
    --assignee-object-id ec79d06a-ae24-4012-80c4-a83eeaca4041 \
    --assignee-principal-type User \
    --role "Key Vault Secrets Officer" \
    --scope /subscriptions/675378ab-482d-47cf-a7ab-017ecad8f2b5/resourceGroups/airedalegroup/providers/Microsoft.KeyVault/vaults/$KV
done
```

**ACR + AKS** (subscription/RG owned by Spencer — not visible to James, so admin fills the scope):
```bash
# AcrPush on the apitechhub registry
az role assignment create --assignee-object-id ec79d06a-ae24-4012-80c4-a83eeaca4041 \
  --assignee-principal-type User --role "AcrPush" \
  --scope <resourceId of apitechhub registry>

# AKS access on the iot-services cluster
az role assignment create --assignee-object-id ec79d06a-ae24-4012-80c4-a83eeaca4041 \
  --assignee-principal-type User --role "Azure Kubernetes Service RBAC Writer" \
  --scope <resourceId of the AKS cluster>
az role assignment create --assignee-object-id ec79d06a-ae24-4012-80c4-a83eeaca4041 \
  --assignee-principal-type User --role "Azure Kubernetes Service Cluster User Role" \
  --scope <resourceId of the AKS cluster>
```
**Alternative:** Spencer runs Steps 2–4 himself — he already has the access.

### RB-3 — Pre-create the four Cosmos containers (out-of-band) · owner: Spencer / control-plane-privileged identity

**Critical (CR-01):** the granted "Cosmos DB Built-in Data Contributor" role is **data-plane only** — it can CRUD items in an *existing* container but **cannot create** databases or containers (a control-plane operation). The app has been changed accordingly: it takes a handle on the pre-existing DB (no `databases.createIfNotExists`) and tolerates a 403 on container create. Therefore the four containers **must exist before the canary**, created by a control-plane-privileged identity (Spencer, or an ARM/Bicep/portal step), in database `ooh-dashboard`, each with **partition key `/storePartition`**:

| Container | Purpose |
|---|---|
| `OohOverrides` | timed-override / hold documents |
| `OohAuditLog` | app action audit entries |
| `OohAppConfig` | kill-switch, notices, data-quality flags |
| `OohSmsLog` | P1 escalation dispatch / ack records |

If they are absent at canary, the app does **not** fail loudly on read: a point-read against a missing
container returns **404**, which the store layer swallows as "not found → healthy" — so a missing container
reads as a **green** `/healthz`, NOT `degraded` (corrected 2026-07-27, CT IM-02; the earlier "403s → degraded"
claim was wrong). The **only** reliable proof that the containers exist and keyless writes work is **Step 4a
(a real Cosmos write)** — an `upsert` against a missing container *does* throw. Treat a green `/healthz` as
necessary-but-not-sufficient; **Step 4a is the definitive backstop.** This is not fixable by the app's own
identity — the containers must exist before the canary (this access ask).

**Verify access (James):**
```bash
az login --tenant 002bfc30-c863-4ca6-ab3e-bca265642fab
az keyvault secret list --vault-name airedale-kv-uat --query "[].name" -o tsv   # expect names, not Forbidden
az acr show -n apitechhub -o table                                             # expect the registry
az aks get-credentials --resource-group <aks-rg> --name <aks-name>             # writes kubeconfig
kubectl get deploy -n iot-services ooh-dashboard                               # expect the existing deployment
```

---

## Step 1 — Secrets into `ooh-dashboard-secrets` · owner: James (after Step 0) or Spencer

The K8s secret shell exists with `REPLACE_ME` placeholders. Populate (do NOT commit values):

| Key | Value / source |
|---|---|
| `TB_URL` / `TB_USERNAME` / `TB_PASSWORD` | ThingsBoard read cred (`svc-read` in `airedale-kv-*`, `portal.lhlive.co.uk`) |
| `TB_WRITE_USERNAME` / `TB_WRITE_PASSWORD` | **SR-3 scoped write cred** (`svc-control` in KV) — **confirm it exists & is scoped** (writes setpoint/mode/hwBoost/switch Desired; reads *Reported/*SyncStatus only) |
| `ZENDESK_SUBDOMAIN` / `ZENDESK_EMAIL` / `ZENDESK_API_TOKEN` | **RB-2** — **Jonathan Wilkinson's existing** Zendesk credentials + API key (the dashboard already operates on these). **No service account is created this release.** Never commit the values. |
| `SESSION_SECRET`, `APP_ORIGIN`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_SCOPE`, `OIDC_ROLE_CLAIM`, `OIDC_ROLE_MAP`, `BRIDGE_BASE_URL`, `COSMOS_ENDPOINT`, `COSMOS_DATABASE`, `IOT_DASH_BASE_URL` | already set by Spencer (per SD-586 impl §6) |
| `ESCALATION_ONDUTY_NUMBER` / `ESCALATION_ONDUTY_NAME` | reuse the IoT Support dash on-duty escalation recipient (D-1) |

Note: **no** `OIDC_CLIENT_SECRET` (public client) and **no** `COSMOS_KEY` (workload identity) — the F01–F04 code drops both from the live-mode requirement (`validateConfig`).

**Zendesk (RB-2 — corrected):** reuse **Jonathan Wilkinson's existing** Zendesk credentials + API key. OOH continues to create `ooh`-tagged tickets under Jonathan's identity, exactly as today. **Do NOT create a dedicated service/agent account this release.** TB `svc-control` write cred is already in KV.

---

## Step 2 — Build the image · owner: James (or Spencer)

```bash
cd ooh-triage-dashboard   # on branch feature/go-live-sd586 (the tested F01–F04 build)
az acr build --registry apitechhub --image ooh-dashboard:$(git rev-parse --short HEAD) .
# Local alternative (Docker is installed): 
#   az acr login -n apitechhub
#   docker build -t apitechhub.azurecr.io/ooh-dashboard:<tag> .
#   docker push apitechhub.azurecr.io/ooh-dashboard:<tag>
```

---

## Step 3 — Deploy (flip the placeholder) · owner: James (or Spencer)

```bash
# ensure the manifest's SA + registry are applied (first deploy) — already in k8s/deployment.yaml
kubectl -n iot-services apply -f k8s/deployment.yaml            # if the Deployment/SA/Service need (re)applying
kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<tag>
kubectl -n iot-services rollout status deployment/ooh-dashboard
```
Watch `https://ooh.airedale-group.io` flip from "coming soon" to the app. `WRITES_DISABLED=true` + `SMS_PROVIDER=log` remain set in the manifest.

If the ingress resource for the app service isn't applied yet, apply it (points `ooh-dashboard:80` → host `ooh.airedale-group.io`, cert-manager TLS). DNS + cert are already live.

> **RB-4 (replicas:1 constraint, CT AD-04):** the app runs a **single replica** (session state is in-process `express-session`; multi-replica needs a shared session store first). A rolling image swap **or** a liveness restart therefore **drops the only pod** for a few seconds, briefly interrupting service and forcing every signed-in handler back through SSO mid-shift. **Deploy / flip during quiet hours** and expect a short gap. Stands until a shared session store is added.

---

## Step 4 — Canary verification matrix (James go/no-go #2)

1. `GET /healthz` → 200. Read the **body**: `status` should be `ok` and `subsystems` (bridge, thingsboard read+write-auth, zendesk, store) all green. **CR-02 caveat (with two known limits — CT IM-01/IM-02):** `subsystems.store.healthy` is backed by an **active boot-time point-read** (not the old false-green cached flag), and `/healthz` reports `status:"degraded"` in the body while still returning **HTTP 200** if a critical subsystem is down (code kept 200 so a transient Cosmos blip cannot restart/deregister the single replica). **Limits:** (a) the boot probe **cannot detect a missing container** — that reads as 404/green (IM-02); (b) the flag is **boot-honest but stale at runtime** — a Cosmos outage *after* boot does not currently flip it to degraded (IM-01, scheduled for a Developer fix before go/no-go #3). Therefore a green store here is *necessary but not sufficient*; **the definitive F03 proof is step 4a below.**
2. **SSO login with an IoT-team account first** (they carry `claimArea 1400` → role `iot`) — proves the public-client + `AreaClaim[]` parse end-to-end **without** handler accounts existing yet.
3. Device board renders live reads from the bridge.
4. Run one non-P1 canary call → an `ooh`-tagged Zendesk ticket is created (status `new`) with the `[TRG]` transcript; confirm it appears in the IoT Support dash OOH Review queue.
5. **4a — REAL Cosmos write proof (F03, CR-01/CR-02) — HARD GATE, NON-SKIPPABLE:** confirm the canary call actually **persisted** to the pre-created containers (an `OohAuditLog` entry, and/or an `OohSmsLog` doc on the P1 path) — i.e. a keyless write via workload identity succeeded against a pre-created container. **This is the definitive F03 verification; a green `/healthz` is NOT (it cannot see a missing container — IM-02). go/no-go #2 MUST NOT pass without observing this write succeed.** If the write throws (404/NotFound → container missing; 401/403 → WI token/RBAC), STOP: the containers weren't pre-created (RB-3) or the data-plane role isn't granted — resolve before proceeding, do not waive.
6. Confirm **no** device write occurred (`WRITES_DISABLED`) and the P1 path logs (no SMS sent).
7. Confirm call-ticket reconciliation/merge on a call that has a Talk ticket.

Clean up canary tickets (delete/solve+tag `test`) **and any canary store docs**.

---

## Step 5 — Post-canary (separate gates)

- **go/no-go #3 (device writes):** SR-3 bench proof, then set `WRITES_DISABLED=false`.
- **go/no-go #4 (live SMS):** set `SMS_PROVIDER=twilio` + Twilio creds (reuse IoT dash account) + on-duty number.
- **D-2 (P1 deep-link):** exempt the P1 deep-link on the **IoT Support dash** ingress — scoped to **exact path `/` AND a valid signed `k` token** (HMAC over ticket + expiry), **never** "any request carrying `?ticket=`" (that would bypass ingress auth for the whole app — IM-04). Owner: Spencer/platform. Verify on a real phone at go/no-go #4. See the D-2 ingress-exemption spec for the full design.
- **OQ-6:** grant the SD-330 dashboard identity Cosmos read on `dbs/ooh-dashboard` (failed-revert strip).
- **B2C handler accounts + claim authoring** (SR-1): create handler accounts, author `claimArea:1500` on their user docs.

---

## Rollback

- Re-point the tag: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=<previous-tag>` (placeholder or prior image).
- Writes/SMS are already locked; if needed, engage the runtime kill-switch (Admin) with a reason.
- Non-destructive throughout — no DB migrations, no consumer changes for the canary.
