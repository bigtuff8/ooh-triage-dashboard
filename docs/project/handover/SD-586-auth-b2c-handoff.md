# SD-586 — OOH Dashboard Auth: B2C Handoff

> **Local copy** of Spencer's handover doc, fetched 2026-07-27 from SharePoint:
> `.../Service Transformation Project/Solution Design (SD)/SD-586 Implement OOH Triage Dashboard/SD-586-auth-b2c-handoff.md`

> **Ticket: SD-586** (Implement OOH Triage Dashboard). Note: **SD-330** is the *separate, already-live* IoT Support Dashboard (`iot-support-frontend` at zendesk-uat) that this app **links to** — it is not this app.

**Status:** Draft v0.1 · 2026-07-21
**For:** James Brown (OOH dashboard app-side changes) + platform (claim authoring, ingress)
**Decision:** the OOH/Zendesk dashboard is a **production** app (real 2am handlers, sits beside the prod IoT Hub, reads the prod integration-bridge). The write-locked "canary" is a *safety mode*, not an environment. So it authenticates against the **prod** B2C client, on the prod domain.

---

## 1. B2C provisioning — DONE

The OOH callback has been added to the shared **`Techhub-Production`** B2C client (the same public client every prod hub — IoT Hub, integration-bridge, reporthub, adminhub — already uses; the "shared hub client pattern per SD-545" JB's code references). No dedicated app registration; no client secret.

**JB's OIDC config (prod):**
```
AUTH_MODE=oidc
OIDC_ISSUER=https://airedalegroup.b2clogin.com/airedalegroup.onmicrosoft.com/B2C_1_KnowledgeBaseSignIn/v2.0
OIDC_CLIENT_ID=beb991e8-69d0-4fef-9c8e-e85793ceee75      # Techhub-Production shared client
OIDC_CLIENT_SECRET=                                       # NONE — public client
APP_ORIGIN=https://ooh.airedale-group.io
OIDC_SCOPE=openid profile email
OIDC_ROLE_CLAIM=extension_Role
OIDC_ROLE_MAP={"1500":"handler","1400":"iot"}             # see §3
```
- Registered redirect URI: `https://ooh.airedale-group.io/auth/callback` ✅ (matches his `${APP_ORIGIN}/auth/callback`).
- Issuer = the same `KnowledgeBaseSignIn` user flow the IoT customer frontend uses (which runs the UserEnrichmentService connector that emits `extension_Role`). *Confirm exact prod policy name if it has changed.*
- Tenant: `AiredaleGroup` B2C `9960086d-b085-4b29-93c8-d464687c9492`.

---

## 2. App-side changes JB must make

1. **Run as a public client (drop the secret).** The shared client has no secret. `initOidc` currently calls `discovery(issuer, clientId, clientSecret)` and config validation *requires* `OIDC_CLIENT_SECRET`. Change to a public client (openid-client v6: `discovery(issuer, clientId)` with `token_endpoint_auth_method: 'none'`), and drop the secret from the required-vars check. PKCE (already implemented) carries the flow.
2. **`mapRole` must parse `AreaClaim[]`, not flat strings.** `extension_Role` arrives as a **JSON string of an array of objects** (`{claimArea, claimGroup, claimPermission, modifier, excludeModifiers}` — ints), not simple role tokens. Current `mapRole` matches string values against `roleMap` → will match nothing → **every user 403s**. Fix — key on the `claimArea` int:
   ```js
   function mapRole(claims) {
     let raw = claims[config.oidc.roleClaim];
     if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
     const areas = Array.isArray(raw) ? raw : [raw];
     for (const c of areas) {
       const key = String(c?.claimArea ?? c);   // 1500 = Zendesk/OOH, 1400 = IoT
       if (config.oidc.roleMap[key]) return config.oidc.roleMap[key];
     }
     return null;
   }
   ```
   with `OIDC_ROLE_MAP={"1500":"handler","1400":"iot"}`.
3. **Callback path** `/auth/callback` — already matches the registered URI. No change.

---

## 3. Authorization model (the claim contract)

RBAC is not app-local — it lives in the shared Cosmos `user` doc and flows into the JWT as `extension_Role` (a serialised `AreaClaim[]`), exactly like every .NET hub. OOH consumes the *same* claim rather than inventing a parallel role system (SD-574 scope model).

- **New area added to the enum** (`Common\Utilities\Enums.cs`, append-only): `ClaimArea.Zendesk = 1500`, `ClaimGroup.OohHandler = 3500`. *(Uncommitted source edit — needs a build/deploy of the monolith consumers via the normal process. Note: because `extension_Role` serialises enums as ints, an authored claim already flows end-to-end even before that build — the enum names are for .NET consumers / AdminHub authoring hygiene.)*
- **OOH handler** = an `AreaClaim` on the handler's user doc:
  ```json
  { "claimArea": 1500, "claimGroup": 3500, "claimPermission": 200, "modifier": [], "excludeModifiers": null }
  ```
- **IoT team need nothing new** — they already carry `ClaimArea.IoT` (1400) claims, so `mapRole` gives them `iot` automatically.
- The claim reaches JB's app for free: UserEnrichmentService serialises the whole `claims` array into `extension_Role` on every sign-in. Today JB collapses it to a binary role; the full area/group/permission (and future `modifier[]` site-scoping) is already in the token for when the OOH UI wants granular control.

---

## 4. Claim authoring — PENDING (needs handler accounts to exist)

Can't author claims for users who don't exist yet. Sequence:
1. Create the **B2C accounts for the answering-service handlers** (JB's SR-1 ask).
2. For each, upsert the OOH `AreaClaim` (§3) onto their Cosmos `user` doc (`container=user`, `id=email`) — via an AdminHub-style `UpdateUser…` upsert (pattern: `AdminHubService\Services\EngineerGroups\EngineerGroupService.cs`) or a one-off script. Requires Cosmos write access to the knowledgebase `user` container.
3. Verify: handler signs in → token carries `claimArea:1500` → `mapRole` → `handler`.

---

## 5. Infra dependency (separate from B2C)

`https://ooh.airedale-group.io` must resolve — **DNS + AKS ingress** (JB's N-4 hostname + SR-2 pipeline/namespace/secret). The B2C callback is registered for that host; login can't complete until the host is live behind the ingress.

---

## 6. Status checklist

| Item | State |
|---|---|
| Redirect URI on Techhub-Production | ✅ done |
| OIDC config values for JB | ✅ above |
| `ClaimArea.Zendesk` / `ClaimGroup.OohHandler` in enum | ✅ edited (uncommitted; needs build) |
| JB: public-client + `mapRole` parse `AreaClaim[]` | ⏳ JB |
| B2C handler accounts | ⏳ platform (SR-1) |
| Author OOH claim on handler docs | ⏳ pending accounts |
| `ooh.airedale-group.io` DNS + ingress | ⏳ N-4 / SR-2 |
| Handler-account SMS/escalation, write-enable | out of scope here (Section B) |

---

## 7. Related

- **SD-515** — Tuya command (same IoT control plane); shares the `extension_Role` model.
- **SD-574** — Authorization & scope model (where `ClaimArea.Zendesk` belongs).
- **SD-583** — IoT estate security (public client, least-privilege posture).
- Memory: `airedale-b2c-access` — how to reach the B2C tenant + the shared per-env clients.
