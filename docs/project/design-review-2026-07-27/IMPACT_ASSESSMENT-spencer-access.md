# Impact Assessment — Spencer's access grant (SD-586 go-live)

**Date:** 2026-07-27 · **Trigger:** Spencer Thompson emails 15:56 + 16:02 (thread "can you grant…")
**Question posed:** "does this unblock us?" · **Verdict:** **Partially — access is unblocked; deploy is NOT yet.**

## Source (fully reviewed — no assumptions)
- **15:56 "RE: can you grant…"** (to James, Jonathan, Mukhtaar; cc Jamie, Mateusz) — the grant, with a table of what changed and why, plus the deploy command sequence. Attachment `image001.png` = a render of the *original ask* table (not proof of grant).
- **16:02 "Fw: can you grant…"** (**to James only**) — "And you'll need this.." carrying attachment **`KUBECO~1.YAM`** = the **kubeconfig** (`ooh.yaml`, bearer-token; connector cannot extract binary — download from Outlook).
- Grants were Spencer's to make (Owner on the PAYG subscription); no Owner escalation / Jonathan / Mukhtaar action needed.

## What is now UNBLOCKED (confirmed in writing)
Access to James's Techhub identity `ec79d06a-ae24-4012-80c4-a83eeaca4041`, reshaped least-privilege:
1. **Key Vault Secrets User (read)** on `airedale-kv-uat` + `-prod` — read only (not Officer/write).
2. **ACR Task Runner** (custom role) on `apitechhub` — `az acr build` (server-side) works. *Better than the AcrPush we asked for — AcrPush alone lacks `scheduleRun` and would have failed the build.*
3. **k8s ServiceAccount `deployer-ooh` + namespace-scoped Role** on `iot-services` (via the separate kubeconfig) — can `kubectl set image` the `ooh-dashboard` deployment, watch rollout, read pod logs/events. **Cannot** delete deployments, read secrets, apply new manifests, create SAs, or touch other namespaces. *(No Azure AKS role — the cluster isn't AAD-integrated, so "AKS RBAC Writer" would have granted nothing and "Cluster User" would have handed back cluster-admin.)*
4. **Cosmos DB Built-in Data Contributor** scoped to `/dbs/ooh-dashboard` — granted to *James's user* for **local** runs (app uses `DefaultAzureCredential`). **Data-plane only.**

Deploy commands Spencer endorsed:
```
az login --tenant 002bfc30-c863-4ca6-ab3e-bca265642fab
az acr build --registry apitechhub --image ooh-dashboard:<tag> .
export KUBECONFIG=~/.kube/ooh.yaml
kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<tag>
kubectl rollout status deployment/ooh-dashboard
```

## What STILL BLOCKS the canary (must close before go/no-go #2)

**B1 — Cosmos 4 containers are NOT created. [HARD BLOCKER — and Spencer's grant cannot fix it]**
The role he granted (Cosmos DB **Data** Contributor) is **data-plane only** — by design it **cannot create containers** (CR-01). His "all sorted" did **not** mention creating them, and as of the design phase they did not exist. Until `OohOverrides, OohAuditLog, OohAppConfig, OohSmsLog` (PK `/storePartition`) exist in db `ooh-dashboard`, the canary's **step 4a real-write proof fails** (and, per IM-02, a green `/healthz` will *not* reveal it). **Action: ask Spencer to pre-create the 4 containers (control-plane / portal / Bicep).**

**B2 — Secrets must be loaded into what the pod actually reads. [HARD BLOCKER]**
The pod reads env from the K8s secret `ooh-dashboard-secrets` (`envFrom`), and James's scoped Role **cannot read or write secrets**. So James cannot populate it. **Spencer must load the secrets** (he offered to). James must send him **Jonathan Wilkinson's existing Zendesk creds/API key** (see A1). **Confirm the mechanism:** does an External-Secrets/CSI driver sync KV→the K8s secret, or does Spencer populate the K8s secret directly? (KV read for James alone does not put values into the pod.)

**B3 — Verify the IN-CLUSTER workload identity's grants, not just James's user. [VERIFY]**
The canary pod authenticates to Cosmos/KV as the **workload identity `id-ooh-dashboard-prod`** (federated to SA `sa-ooh-dashboard`), **not** as James's user `ec79d06a`. Spencer's Cosmos Data Contributor + KV grants were to **James's user** (for local runs). **Confirm `id-ooh-dashboard-prod` itself holds Cosmos DB Data Contributor on `/dbs/ooh-dashboard` and can read the secret** — this may already exist from Spencer's prod stand-up, but it must be confirmed, not assumed, or the in-cluster keyless write fails even with containers present.

**B4 — Confirm the existing placeholder deployment's shape. [VERIFY]**
James's Role can only `kubectl set image` (patch), **not** `kubectl apply` a full manifest or create the SA. So the **existing** `ooh-dashboard` deployment must **already** carry `serviceAccountName: sa-ooh-dashboard`, the `azure.workload.identity/use:"true"` label, and `envFrom: ooh-dashboard-secrets`. If the placeholder is a bare image, flipping the tag alone yields a pod with **no workload identity and no secrets** → fail-secure boot fails (missing secrets) / no Cosmos identity. **Confirm with Spencer, or have him apply the full manifest once.**

## James's actions (owed to Spencer)
- **A1 — Send Jonathan's Zendesk creds.** Spencer wrote "your Zendesk **service-account** creds." Correct him: decision F06 is to **reuse Jonathan Wilkinson's existing** creds/API key — **no service account this release.** Provide those values to Spencer (secure channel; never in the 6-person thread, never committed).
- **A2 — Relay the two Section B decisions** Spencer is waiting on: **SMS gateway = Twilio, reusing the IoT Support dashboard's account** (D-1); **P1 deep-link = ingress exemption scoped to exact path `/` + a signed HMAC token** (D-2), **not** basic auth. (See `handover/D-2-ingress-exemption-spec.md`.)
- **A3 — Save the kubeconfig.** Download `KUBECO~1.YAM` from the 16:02 email → `~/.kube/ooh.yaml`, `chmod 600`, **never commit it** (bearer token; Spencer can reissue in ~1 min if leaked).

## Runbook / deployment-request deltas (need updating to match reality)
- **Step 0:** the `az role assignment create` ask is **superseded** — access is granted in reshaped form (record the 4 actual grants). Verify commands: `az keyvault secret list` (read ✓), `az acr show` (✓), **remove `az aks get-credentials`** (non-AAD cluster) → use `export KUBECONFIG=~/.kube/ooh.yaml`.
- **Step 1 (secrets):** owner = **Spencer** (James is read-only). Add "confirm KV→K8s sync vs direct populate."
- **Step 3 (deploy):** drop `kubectl apply -f deployment.yaml` from James's path (Role can't create SA/Service/apply) — first-time full manifest is **Spencer's**; James does `set image` only. Add B4 confirmation as a precondition.
- **RB-3 (containers):** unchanged and **still open** — now the single most important pre-canary control-plane step.

## Bottom line
The **hardest external dependency (Azure access) is cleared** — genuinely major, and in a cleaner security shape than we asked for. But **"unblocked" ≠ "deploy now."** Four items still gate the write-locked canary: **containers (B1)**, **secrets into the pod (B2)**, **the in-cluster WI's own grants (B3)**, and **the placeholder's shape (B4)** — of which **B1 is the one Spencer's grant explicitly cannot resolve** and was not addressed. Close B1–B4 (mostly a short exchange with Spencer + his container-create) and we are genuinely go for go/no-go #2.
