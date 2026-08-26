# Deployment Request: IOT OOH Dash (SD-586 go-live)

**Prepared:** 2026-07-27 · **For:** Spencer (Techhub tenant admin) + Jamie (Azure provisioning) · **Requested by:** James
**Project name (Azure naming):** `ooh-dashboard`
**Repository:** https://github.com/bigtuff8/ooh-triage-dashboard · branch `feature/go-live-sd586` · **v1.2.0** · commit `7d4b5f2`
**Deployment model:** write-locked canary into **AKS `iot-services`** (alongside the IoT Hub), image `apitechhub.azurecr.io/ooh-dashboard:<git-sha>`, URL `https://ooh.airedale-group.io`.

> This is **not** a fresh-infra provisioning request — Spencer's prod already exists (KV, ACR, AKS, Cosmos, B2C,
> ingress+TLS live serving a placeholder). It is an **access grant + container pre-creation** request so the
> already-built, tested app can be deployed as a write-locked canary. Full ordered commands live in `DEPLOY_RUNBOOK.md`.

## THE BLOCKER (F10) — what we need from Spencer

**1. Azure RBAC** to James's Techhub identity — object id `ec79d06a-ae24-4012-80c4-a83eeaca4041` (tenant `002bfc30-c863-4ca6-ab3e-bca265642fab`):

| Role | Scope | Purpose |
|------|-------|---------|
| Key Vault Secrets Officer | `airedale-kv-uat` **and** `airedale-kv-prod` (sub `675378ab-…`, RG `airedalegroup`) | load `ooh-dashboard-secrets` |
| AcrPush | `apitechhub` registry | push the image |
| Azure Kubernetes Service RBAC Writer | `iot-services` AKS cluster | apply/patch the deployment |
| Azure Kubernetes Service Cluster User Role | same cluster | get kubeconfig |

*(Exact `az role assignment create` commands: `DEPLOY_RUNBOOK.md` Step 0.)* **Alternative: Spencer runs the deploy himself** (he already has access) — Steps 2–4 of the runbook.

**2. Cosmos container pre-creation (RB-3) — control-plane step, cannot be done by the app.** The granted data-plane
role ("Cosmos DB Built-in Data Contributor") **cannot create containers**. Create these **4 containers** in database
`ooh-dashboard`, each **partition key `/storePartition`**, before the canary:

`OohOverrides` · `OohAuditLog` · `OohAppConfig` · `OohSmsLog`

> If absent, the app does not crash (it tolerates 404), but the canary's **Step 4a real-write proof will fail** —
> which is the correct, intended hard gate. Containers must exist first.

## Azure resources (all already exist — confirm only)
- [x] AKS `iot-services` (deploy target) · [x] ACR `apitechhub` · [x] Cosmos DB `ooh-dashboard` (containers per above)
- [x] Key Vault `airedale-kv-{uat,prod}` · [x] Workload Identity `id-ooh-dashboard-prod` federated to SA `sa-ooh-dashboard`
- [x] B2C tenant (Techhub-Production, **public PKCE client**) · [x] Ingress + TLS on `ooh.airedale-group.io` (live, placeholder)
- **No new provisioning requested.**

## Config the app expects (key names only — values are KV/secret-loaded, never committed)
Secret `ooh-dashboard-secrets` (`DEPLOY_RUNBOOK.md` Step 1 has the full table):
`APP_ORIGIN, SESSION_SECRET, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_SCOPE, OIDC_ROLE_CLAIM, OIDC_ROLE_MAP, BRIDGE_BASE_URL, TB_URL, TB_USERNAME, TB_PASSWORD, TB_WRITE_USERNAME, TB_WRITE_PASSWORD, ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN, COSMOS_ENDPOINT, COSMOS_DATABASE, IOT_DASH_BASE_URL, ESCALATION_ONDUTY_NUMBER, ESCALATION_ONDUTY_NAME`
- **Deliberately absent:** `OIDC_CLIENT_SECRET` (public client, F01), `COSMOS_KEY` (workload identity, F03).
- **Zendesk (RB-2):** reuse **Jonathan Wilkinson's existing** creds + API key — **no** service account this release.
- Non-secret env in the manifest: `NODE_ENV=production, AUTH_MODE=oidc, DATA_MODE=live, PORT=3001`, **`WRITES_DISABLED=true`, `SMS_PROVIDER=log`** (canary safety levers).

## Dependencies
- integration-bridge read API (cluster-internal, `iot-services`) · ThingsBoard (`portal.lhlive.co.uk`, read + SR-3 scoped write) · Zendesk (Jonathan's identity) · Airedale B2C SSO · consumes/feeds the SD-330 IoT Support Dashboard.

## Packaging
- Dockerfile: **yes** (multi-stage, `@azure/identity` build-resolve guard) · K8s manifests: **yes** (`k8s/deployment.yaml`, resource limits + `/healthz` probes) · Health endpoint: **`/healthz`**.

## Go/no-go sequence (James chairs; SteerCo pre-deployment gate)
1. **F10** granted + **4 containers** pre-created →
2. Secrets loaded (Step 1) → build+push image (Step 2) → `kubectl set image` flips the placeholder (Step 3, **quiet hours** — replicas:1, RB-4) →
3. **go/no-go #2 — canary matrix (Step 4):** `/healthz` green · IoT-team SSO (public client + AreaClaim[]) · device board reads · one `ooh` ticket with `[TRG]` · **Step 4a real Cosmos write (HARD GATE)** · no device write · P1 logs only →
4. Post-canary separate gates: **#3** device writes (`WRITES_DISABLED=false` after SR-3 bench proof; requires the IM-01 store-health fix) · **#4** live SMS (`SMS_PROVIDER=twilio`, reuse IoT-dash account) + D-2 ingress exemption.

## Status
**Ready to deploy the write-locked canary the moment F10 (RBAC + containers) lands.** App is built, tested (63/0),
Tester PASS, Critical Thinker 0-critical. Nothing further is needed from the build side for the canary.
