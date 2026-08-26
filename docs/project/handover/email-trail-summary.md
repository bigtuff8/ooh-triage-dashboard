# OOH Dashboard — Spencer email trail (the deploy handover)

Captured 2026-07-27 from the Outlook thread *"OOH Dashboard — now blocked / action required"* and *"Schedule Hub Application Programming On-Boarding"*.

## Timeline

| Date | From → To | Subject | Substance |
|------|-----------|---------|-----------|
| 2026-07-11 08:02 | James → Spencer | OOH Dashboard – action required | First deploy ask: dev complete, needs infra. |
| 2026-07-14 18:08 | James → Spencer (cc Sam) | OOH Dashboard – now blocked – need stuff please | The definitive **Section A (8 canary blockers)** + **Section B** (writes/SMS) + **Appendix** (control-path roadmap from 83 OOH incidents). |
| 2026-07-22 13:38 | Spencer → James | Schedule Hub Application Programming On-Boarding | Points at `ONBOARDING.md` in **SD-479 Create Schedule Hub** (adjacent hub-programming onboarding). |
| 2026-07-22 16:19 | Spencer → James (cc Sam) | RE: OOH Dashboard – now blocked | **"You're unblocked."** Prod stood up end-to-end; app-side changes listed; ticket is now **SD-586**. |

## James's 14 Jul ask — Section A (the 8 canary blockers, as originally framed)

1. **SR-2** — Deploy home + pipeline + K8s namespace & Secret.
2. **N-4** — Hostname/ingress + `APP_ORIGIN` (sibling of IoT Hub) (+ Hub tile link).
3. **SR-1** — B2C OIDC (`OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET`), an OOH handler role in `extension_Role`, and B2C accounts for the answering-service handlers.
4. **N-3** — Cosmos key scoped to DB `ooh-dashboard`.
5. **N-1** — Integration-bridge read API (`BRIDGE_BASE_URL`, cluster-internal) + confirm a sibling pod can call it.
6. **SR-3** — Scoped ThingsBoard write credential (`TB_WRITE_USERNAME/PASSWORD`) — needed to *boot* even the write-locked canary (validated at startup).
7. `SESSION_SECRET`.
8. `IOT_DASH_BASE_URL = https://zendesk-uat.airedale-api.co.uk`.

Section B (post-canary): SR-3 bench proof to open device writes; SMS gateway decision (Q-F) + on-duty number; P1 deep-link resolution on mobile behind basic-auth ingress.

## Spencer's 22 Jul reply — what he delivered (and the twist)

**Stood up in prod (every layer green: DNS → ingress → TLS → service → pod → /healthz):**
- URL **https://ooh.airedale-group.io** (cert issued, placeholder "coming soon" live now).
- B2C on the shared **`Techhub-Production`** client, callback registered — **public client (no secret)**.
- `iot-services` namespace, SA **`sa-ooh-dashboard`** + workload identity, **Cosmos DB + AAD RBAC (no keys)**, ingress + TLS.
- TB service creds (`svc-read`/`svc-control`) in `airedale-kv-{uat,prod}`; the app's identity can read them.

**The twist / delta:** Spencer implemented a **more secure model than the app was built for**. Instead of the K8s-Secret + Cosmos-key + confidential-OIDC-client + flat-role-strings model James coded to, prod uses **workload identity + Key Vault + `DefaultAzureCredential` + public PKCE client + `AreaClaim[]` roles**. Hence a required **app-side change list** before the image can be deployed.

**App-side changes Spencer listed:**
- **Public client** — drop `OIDC_CLIENT_SECRET` (PKCE only).
- **mapRole** — parse `extension_Role` as `AreaClaim[]` (claimArea 1500=handler, 1400=IoT), not flat strings.
- **Cosmos** via `DefaultAzureCredential` (no key).
- Read TB/Zendesk secrets from `airedale-kv-{DEPLOYMENT_ENVIRONMENT}` via workload identity — *(see reconciliation note below)* — set `DEPLOYMENT_ENVIRONMENT`, drop the `envFrom` K8s secret.
- `serviceAccountName: sa-ooh-dashboard`.
- **Send Spencer the Zendesk service-account creds** and he loads them into `airedale-kv-{uat,prod}` (TB ones already there).

**Deploy (James does it himself — infra-group creds, no pipeline):**
```
1. Land app-side changes in the repo.
2. az acr build --registry apitechhub --image ooh-dashboard:<tag> .
3. kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<tag>
4. Watch ooh.airedale-group.io flip from "coming soon" to the app.
```
Write-locked canary throughout (`WRITES_DISABLED`).

**Decisions Spencer needs (Section B):** SMS gateway (Twilio/other) + on-duty number; P1 deep-link vs basic-auth (`/?ticket=` exemption at ingress, or accept the SMS text as the artefact).

**Roadmap reframe:** Boiler #1 largely Salus (control already works; SD-491 was an investigation); kitchen/lighting/fans #2–4 collapse into **one** epic (SD-515) over Tuya devices already in TB (not new build); schedules #5 = SD-477 (IoT Hub); non-IT500 hot water #6 undefined; ~7% Tuya devices mislabelled in TB (being fixed via `product_id`).

## ⚠️ Reconciliation note (email vs handover docs)

Spencer's **email** says "read secrets from `airedale-kv` via workload identity … drop the `envFrom` k8s secret." His **implementation doc §2/§6** is more precise: **only Cosmos** moves to WI now (no key); **ThingsBoard + Zendesk creds stay in the K8s secret `ooh-dashboard-secrets`** (Key Vault for those is "follow-up hardening"). The impl doc is the authoritative, later spec. **Open question OQ-1** captures this — confirm the exact secret-delivery mechanism for the first canary deploy before writing the manifest.
