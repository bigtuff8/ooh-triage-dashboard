# Design Specification: IOT OOH Dash — Go-Live (SD-586)

**Mode:** Airedale
**Direction:** Change + Operational Design (no new end-user UI)
**Created:** 2026-07-27
**Designer Agent Session ("OOH design")**
**Contract for:** the Developer phase (implements F01–F08 post-gate) and the deploy operator (James/Spencer).

---

## 0. What this design is (and is not)

This cycle takes the **already-built, already-tested OOH Triage Dashboard (v1.1.0)** to **go-live** on the production platform Spencer stood up (SD-586). Per RELEASE_NOTES v1.1.0 and the discovery handoff, **the operator UI is unchanged**. There is therefore **no new visual/UX design** to produce.

What *does* need designing — and what this spec is the contract for — is the **change design** (the app-side code delta from the old infra model to Spencer's secure model), the **deployment/canary design**, the **monitoring design**, and the **one cross-product ingress change (D-2)**. This is a legitimate "design" deliverable under the build harness: the Designer sets the precise, unambiguous target state that the Developer implements and the Tester grades against.

**UI-change verdict (handoff item 5):** **NONE.** No operator-facing screen, flow, component, or copy changes in this release. The interactive artefact at the Design Gate is therefore a **Go-Live Design Review** (change + ops), *not* a UI prototype — a UI prototype would be fabrication, which the handoff explicitly forbids. See §11.

**Source-of-truth alignment:** every change below is traced to Spencer's authoritative handover docs (`handover/SD-586-implementation-and-deployment.md`, `handover/SD-586-auth-b2c-handoff.md`) and verified against the **actual current code** on branch `feature/live-build-v1` (the clean v1.1.0 baseline). The earlier out-of-process spike branch `feature/infra-alignment-v1` is **dismissed** — the Developer implements cleanly from this spec.

---

## 1. Current-state audit (the delta to close)

Verified by reading the live source on `feature/live-build-v1`:

| File | Current state (old model) | Target state (Spencer's secure model) | Feature |
|------|---------------------------|----------------------------------------|---------|
| `services/auth.js` `initOidc()` | `discovery(issuer, clientId, clientSecret)` — confidential client | public client: `discovery(issuer, clientId)` + `ClientSecretPost`→none / `token_endpoint_auth_method:'none'` | F01 |
| `services/auth.js` `mapRole()` | flat-string match against `roleMap` values | parse `extension_Role` as serialised `AreaClaim[]`, key on `claimArea` int | F02 |
| `config.js` `oidc.roleMap` default | `{"OOH.Handler":"handler","OOH.IoTAdmin":"iot","ClaimArea.IoT":"iot"}` | `{"1500":"handler","1400":"iot"}` | F02 |
| `config.js` `validateConfig()` | requires `OIDC_CLIENT_SECRET` (line ~140) and `COSMOS_KEY` (line ~149) in live mode | requires **neither** — public client + keyless Cosmos | F01/F03 |
| `services/store.js` `initCosmos()` | `new CosmosClient({ endpoint, key, … })` | `new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() })` when no key | F03 |
| `package.json` deps | `@azure/cosmos` only | add `@azure/identity` | F03 |
| `k8s/deployment.yaml` | `serviceAccountName: ooh-dashboard`; `image: REGISTRY_PLACEHOLDER/ooh-dashboard:latest` | `serviceAccountName: sa-ooh-dashboard`; `image: apitechhub.azurecr.io/ooh-dashboard:<sha>` | F04 |

**Already correct (do not change):** the `azure.workload.identity/use: "true"` pod label (now load-bearing), `replicas: 1`, `WRITES_DISABLED=true`, `SMS_PROVIDER=log`, the `envFrom: ooh-dashboard-secrets` source, resource limits, `/healthz` probes, and the `AD-04` guard that requires `IOT_DASH_BASE_URL` explicitly in production.

---

## 2. Design System

**N/A for UI** — the operator UI (colour, typography, spacing, Ant-equivalent components, states) is the approved v1.1.0 system and is untouched this release. Its existing loading/empty/error/success states (device board, call flow, ticketing, P1 escalation) are unchanged and already tested (41 Playwright, 0 fail).

The **only** thing this design changes visually is **invisible to operators**: they authenticate through the same B2C sign-in, land on the same dashboard. The change is in *how* they are authenticated (public PKCE client) and *how* their role is derived (`AreaClaim[]`), not in what they see.

The Design-Gate review artefact (§11) uses the project's established review palette for consistency with the discovery shaping proposal: primary green `#19895b`/`#0f6a45`, accent purple `#6d3fd4`, ink `#16202e`, slate `#334155`, line `#e2e8f0`, semantic good/warn/bad.

---

## 3. App-side change design — Auth (F01, F02)

### 3.1 F01 — Public OIDC client (drop the secret)

**File:** `services/auth.js`, `initOidc()`.

The shared `Techhub-Production` B2C client (`beb991e8-…`) is a **public** client with **no secret**; PKCE (already implemented in `authRouter`) carries the flow. `openid-client` v6 supports a public client by discovering **without** a secret and declaring the token-endpoint auth method as `none`.

**Target design (corrected per CT IM-01 — verified against the installed `openid-client@6.8.4` type surface):**
```js
export async function initOidc() {
    if (config.authMode !== 'oidc') return;
    oidcLib = await import('openid-client');
    // Public client: openid-client v6 `discovery(server, clientId, metadata?, clientAuth?)`
    // DEFAULTS clientAuth to None() when no client_secret is supplied. Two-arg form is the
    // correct public-client idiom; PKCE (already in authRouter) carries the flow.
    oidcConfig = await oidcLib.discovery(
        new URL(config.oidc.issuer),
        config.oidc.clientId
        // equivalently explicit: (url, clientId, undefined, oidcLib.None())
    );
    console.log('[AUTH] OIDC issuer discovered (public client, PKCE)');
}
```
**Developer note (implementation fidelity):** confirmed correct for `openid-client@6.8.4` — `discovery(server, clientId, metadata?, clientAuthentication?, options?)` defaults `clientAuthentication` to `None()` when no secret is present. Do **not** invent a `tokenEndpointAuthMethod` property (it does not exist on the `Configuration` object). The **contract**: discovery succeeds with only issuer + clientId; `buildAuthorizationUrl`/`authorizationCodeGrant` (already present, PKCE-based) work unchanged; the token exchange sends no client secret. **CI boundary:** a unit test asserts a public-client config is built without throwing (F01 verification step 2), but note that "builds without throwing" does **not** prove the token-endpoint auth method — that is only exercised at the real token exchange, proven at the **canary**, not in fixture mode.

**Config change (`config.js`):** **remove `OIDC_CLIENT_SECRET` from the live-mode requirement** in `validateConfig()`. `oidc.clientSecret` may stay readable in the config object, but note (CT AD-02) this is **cosmetic back-compat only** — the two-arg `discovery()` never hands a secret to the client, so a "confidential" env would still authenticate as a public/`None` client. Do not claim confidential-client support; the Techhub client is public, full stop.
```js
if (config.authMode === 'oidc') {
    if (!config.oidc.issuer || !config.oidc.clientId) {
        problems.push('OIDC_ISSUER and OIDC_CLIENT_ID are required when AUTH_MODE=oidc');
    }
    // OIDC_CLIENT_SECRET intentionally NOT required — Techhub-Production is a public PKCE client
}
```

### 3.2 F02 — `mapRole` parses `AreaClaim[]`

**File:** `services/auth.js`, `mapRole()`; **default in** `config.js`.

`extension_Role` arrives as a **JSON string of an array of objects** `{claimArea, claimGroup, claimPermission, modifier, excludeModifiers}` (ints). The current flat-string match returns `null` for every real user → **every user 403s**. Key on the `claimArea` int.

**Target design (per handoff §2.2, hardened for malformed input; deterministic precedence per CT AD-01):**
```js
// Fixed precedence: a user carrying BOTH an IoT (1400) and a handler (1500) claim
// resolves to the higher-privilege role deterministically, not by claim array order.
const ROLE_PRECEDENCE = ['iot', 'handler'];

function mapRole(claims) {
    let raw = claims[config.oidc.roleClaim];
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = []; }
    }
    const areas = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
    const matched = new Set();
    for (const c of areas) {
        const key = String(c?.claimArea ?? c);   // 1500 = Zendesk/OOH → handler, 1400 = IoT → iot
        if (config.oidc.roleMap[key]) matched.add(config.oidc.roleMap[key]);
    }
    return ROLE_PRECEDENCE.find(r => matched.has(r)) ?? null;
}
```
- `claimArea 1500` → `handler`; `claimArea 1400` → `iot`; both → `iot` (higher privilege, deterministic); no match → `null` (drives the existing 403 path in `/callback`, unchanged).
- Malformed / legacy / missing input must **not throw** (F02 verification step 3) — the `try/catch` and null-guards above guarantee it. Add a unit case for the **dual-claim** input (both 1400 and 1500 → `iot`).
- **Config default:** change `config.oidc.roleMap` default to `{"1500":"handler","1400":"iot"}` so a missing `OIDC_ROLE_MAP` env is still correct. Prod sets it explicitly anyway.

**Back-compat note (dev mode):** dev sign-in (`DEV_OPERATORS`) does not go through `mapRole` — it assigns `role` directly — so dev/fixture behaviour is unaffected. Existing auth tests that exercised the old flat-string map must be updated (F07).

**Forward-compat note:** the full `AreaClaim` object (group/permission/`modifier[]` site-scoping) is present in the token. This release collapses to a binary role, as today. No granular authorisation is designed in this release — flagged as a future opportunity, not scope.

---

## 4. App-side change design — Data / Cosmos (F03)

**File:** `services/store.js`, `initCosmos()`; **dep in** `package.json`; **validation in** `config.js`.

Prod reaches Cosmos via **AAD / Workload Identity** (Cosmos built-in Data Contributor scoped to `/dbs/ooh-dashboard`), **no master key**. The pod already carries the `azure.workload.identity/use: "true"` label and runs as `sa-ooh-dashboard` (federated to identity `id-ooh-dashboard-prod`, clientId `90fa1ba2-…`).

**Target design (client construction — verified valid on `@azure/cosmos@4.9.3`, `aadCredentials?: TokenCredential`):**
```js
async function initCosmos() {
    const { CosmosClient } = await import('@azure/cosmos');
    const clientOptions = {
        endpoint: config.cosmos.endpoint,
        connectionPolicy: { requestTimeout: 10000, enableEndpointDiscovery: true }
    };
    if (config.cosmos.key) {
        clientOptions.key = config.cosmos.key;               // local/keyed back-compat path
    } else {
        // Prod: keyless via Workload Identity. Prefer the explicit credential for a
        // faster, clearer failure than DefaultAzureCredential's full-chain walk (CT AD-05).
        const { WorkloadIdentityCredential, DefaultAzureCredential } = await import('@azure/identity');
        clientOptions.aadCredentials =
            (process.env.AZURE_FEDERATED_TOKEN_FILE && process.env.AZURE_CLIENT_ID)
                ? new WorkloadIdentityCredential()
                : new DefaultAzureCredential();
    }
    const client = new CosmosClient(clientOptions);
    const database = client.database(config.cosmos.database);   // DB pre-exists (Spencer) — do NOT create
    for (const name of COLLECTIONS) {
        // Containers are PRE-CREATED out-of-band (see CR-01). Attempt create for local/keyed
        // envs, but tolerate a 403 (data-plane role cannot create) by falling back to a handle.
        let container;
        try {
            ({ container } = await database.containers.createIfNotExists({
                id: name,
                partitionKey: { paths: ['/storePartition'] },
                indexingPolicy: { /* unchanged */ }
            }));
        } catch (err) {
            if (err.code === 403 || err.code === 'Forbidden') container = database.container(name);
            else throw err;
        }
        collections.set(name, new CosmosCollection(container));
    }
}
```
- **Keep the keyed path** for local dev / back-compat (fixture mode never reaches Cosmos; a keyed live env still works).
- **`package.json` (CT IM-02 — MANDATORY, not hygiene):** `@azure/identity` is currently present **only** as a transitive *devDependency* of `@azure/cosmos` and is **absent from both `package.json` and `package-lock.json`**. The `Dockerfile` runtime install (`npm ci --omit=dev`) therefore **omits it**, and `import('@azure/identity')` throws `ERR_MODULE_NOT_FOUND` in the image. Add `"@azure/identity": "^4.13.0"` (match the installed 4.13.x) to `dependencies`, re-run `npm install`, and **commit the regenerated `package-lock.json`** (or `npm ci` fails the build loudly on lock mismatch). Add a build-time smoke check that the runtime image can `require.resolve('@azure/identity')`.
- **`config.js` `validateConfig()`:** drop `COSMOS_KEY` from the live-mode requirement. `COSMOS_DATABASE` defaults to `'ooh-dashboard'` (config.js:87) so it cannot be missing (CT AD-03) — require only `COSMOS_ENDPOINT`:
```js
if (config.dataMode === 'live') {
    if (!config.bridge.baseUrl) problems.push('BRIDGE_BASE_URL is required when DATA_MODE=live');
    if (!config.thingsboard.writeUsername || !config.thingsboard.writePassword)
        problems.push('TB_WRITE_USERNAME / TB_WRITE_PASSWORD (SR-3 scoped credential) are required when DATA_MODE=live');
    if (!config.cosmos.endpoint) problems.push('COSMOS_ENDPOINT is required when DATA_MODE=live');
    // COSMOS_KEY intentionally NOT required — keyless via workload identity
}
```

**CR-01 (RESOLVED — containers pre-created out-of-band, primary plan):** container `createIfNotExists` is a **control-plane** operation and is **NOT** authorised by the granted **data-plane** "Cosmos DB Built-in Data Contributor" role (item CRUD on an *existing* container is data-plane; container *creation* is not). Impl doc §3d says "DB + RBAC done" and "app auto-creates containers" — but the four containers (`OohOverrides`, `OohAuditLog`, `OohAppConfig`, `OohSmsLog`) do **not** exist yet, so the app's create path *would* be taken and *would* 403, bricking the store on first access. **Design decision:** Spencer (or a control-plane-privileged one-off) **pre-creates the four containers** (partition key `/storePartition`) alongside the DB **before** the canary — this is now the **primary** plan, added to the runbook (§7) and the RBAC ask (F10). The app no longer calls `databases.createIfNotExists` (uses `client.database()` on the pre-existing DB) and tolerates a 403 on container create by falling back to a container handle, so a missing-DDL-permission never bricks boot.

---

### 4.1 Active store-health probe (F03 verification — CR-02, RESOLVED)

**The design must not rely on the current `/healthz` store signal, which is a false-green.** Verified in `server.js:51–69` + `store.js:138,168–172,181–183`: `/healthz` hardcodes `status:'ok'` and calls `storeStatus()`, which returns the module-level `storeHealthy` flag (initialised `true`, flipped `false` only *after* a failed **lazy** `initCosmos()`). `/healthz` never calls `collection()`, so `initCosmos()` never runs on the health path — **store reports `healthy:true` without ever contacting Cosmos.** This is exactly the check the design leaned on to verify F03 and catch CR-01; it cannot.

**Target design (Developer implements; small, contained):**
1. **Eager store init at boot:** in `server.js start()`, after `initOidc()`, `await` a store warm-up in live mode — one `collection('OohAppConfig')` call (forces `initCosmos()`) followed by a cheap point-read / `database.read()`. A failure sets `storeHealthy=false` (already the behaviour) and is logged; it must **not** `process.exit` (the app can still serve the device board), but it **must** be visible.
2. **Make `/healthz` reflect real store reachability:** `store.js` exposes an `async storeProbe()` that does a real point-read and updates `storeHealthy`; `/healthz` degrades `status` to `'degraded'` (or returns 503 for readiness) when any critical subsystem — including `store` — is unhealthy, rather than always `'ok'`. Minimum acceptable if a live probe is deferred: **correct §7 step 1 and §10 to state explicitly that `/healthz` store-green is NOT proof of Cosmos connectivity**, and rely on the forced-write canary step (§7 step 4a) as the real F03 proof.
3. This also surfaces a `DefaultAzureCredential`/WI token failure (CT AD-05) at boot with a clear log line, instead of silently at first store write.

**Contract:** F03 is only "verified" when a **real Cosmos write succeeds at the canary** (§7 step 4a) — not when `/healthz` shows green.

## 5. Deployment manifest design (F04)

**File:** `k8s/deployment.yaml`. Two edits only; everything else stays.

```yaml
    spec:
      serviceAccountName: sa-ooh-dashboard        # was: ooh-dashboard
      containers:
        - name: ooh-dashboard
          image: apitechhub.azurecr.io/ooh-dashboard:<sha>   # was: REGISTRY_PLACEHOLDER/ooh-dashboard:latest
```
- **Keep** the WI pod label, `replicas: 1`, both canary levers (`WRITES_DISABLED=true`, `SMS_PROVIDER=log`) in-manifest (auditable in git), `envFrom: ooh-dashboard-secrets` (TB + Zendesk creds stay in the K8s secret this release per impl §6 / OQ-1; Key-Vault-CSI is deferred hardening), resource limits, `/healthz` readiness+liveness probes, and the `Service` (`:80 → :3001`).
- **Image tag:** use the immutable git short-sha, never `:latest`, so rollback is deterministic (runbook Step 3 / Rollback).
- **Ingress:** the `Ingress` resource + cert-manager TLS is Spencer-owned and applied after the Deployment exists (DNS + TLS already live at `ooh.airedale-group.io`). Not an app-repo artefact this release.

---

## 6. Test-suite design (F07)

The Tester grades against this. Target: **fixture/dev mode, 0 failures**, no source-inspection tests (behaviour only).

1. **Unit — `mapRole` (F02):** table-driven over: serialised `AreaClaim[]` containing `claimArea:1500` → `handler`; `claimArea:1400` → `iot`; an array with neither → `null`; a **string** payload (the real B2C shape) parsed correctly; malformed JSON → `null` (no throw); `null`/`undefined`/`{}` → `null` (no throw); an array of bare ints/legacy tokens → no throw.
2. **Unit/behaviour — `validateConfig` (F01/F03):** with `AUTH_MODE=oidc` and **no** `OIDC_CLIENT_SECRET` → no secret-related problem; live mode with **no** `COSMOS_KEY` → no key-related problem; issuer/clientId still required; TB write creds still required in live mode (unchanged).
3. **Unit — `initOidc` (F01):** builds a public-client config from issuer+clientId without throwing (mock discovery).
4. **Playwright E2E (fixture mode):** the full existing suite (auth, control, killswitch, removal-health, resolution, tonight-callback) stays green — regression guard that the auth/store refactor didn't break the operator flows. Update `tests/auth.spec.js` where it assumed the old flat-string map or the confidential client.
5. **No live-system tests** — Cosmos-keyless and the public-client token exchange are proven at the **canary** (§7), not in CI (they need real WI + B2C). The test report must state this boundary explicitly (honest coverage — do not fake a live assertion in fixture mode).

Follows the 6 mandatory testing protocols (data fidelity, realistic input via `pressSequentially`, removal assertions, error paths, state reset, multi-step verification).

---

## 7. Canary & go-live design (F08, F11) — ratifies `DEPLOY_RUNBOOK.md`

**Reviewed `DEPLOY_RUNBOOK.md` — confirmed accurate**, with two corrections folded in below. The canary is a **safety mode, not an environment**: prod B2C, prod domain, prod Cosmos — but **write-locked** (`WRITES_DISABLED=true`) and **SMS log-only** (`SMS_PROVIDER=log`).

**Runbook corrections (Developer/operator must apply):**
- **RB-1 (expanded per CT IM-03):** the runbook references the **dismissed** branch `feature/infra-alignment-v1` at **lines 4, 8, and 78**, and — worse — line 8 falsely asserts *"the app-side code is aligned to prod (public client, AreaClaim[] roles, keyless Cosmos, sa-ooh-dashboard, real registry)."* That is **untrue of the actual `feature/live-build-v1` baseline** (still confidential client, flat `mapRole`, keyed Cosmos, `serviceAccountName: ooh-dashboard`, `REGISTRY_PLACEHOLDER`). An operator could read that and deploy the un-aligned baseline, which would fail fail-secure boot (missing secret/key it no longer expects) or run the old auth model. **Fix:** strike the "already aligned" confirmation entirely; replace with "alignment is delivered by the F01–F04 build on the release branch cut post-gate," and correct all three branch references to the Developer's release branch (e.g. `feature/go-live-sd586`).
- **RB-2:** Step 1 lists `ZENDESK_*` as "the OOH Zendesk service account (create + token)". **Superseded by the locked decision:** reuse **Jonathan Wilkinson's existing** Zendesk credentials + API key (§9). **No service account is created.** The runbook Step 1 table + the P1-07 note must be corrected to reflect this.
- **RB-3 (new, per CR-01):** add a Step 0/1 item — **pre-create the four Cosmos containers** (`OohOverrides`, `OohAuditLog`, `OohAppConfig`, `OohSmsLog`, partition key `/storePartition`) out-of-band, alongside the existing DB, using a control-plane-privileged identity. The app's data-plane role cannot create them.
- **RB-4 (new, per CT AD-04):** note the `replicas: 1` constraint — a rolling image swap or a liveness restart **drops the only pod**, briefly interrupting service and forcing every signed-in handler back through SSO mid-shift (in-process `express-session`). **Deploy/flip during quiet hours;** expect a short gap. Stands until a shared session store is added.

**Canary verification matrix (James go/no-go #2):**
1. `GET /healthz` → subsystems (bridge, ThingsBoard read + write-auth, Zendesk, store). **Caveat (CR-02):** store-green here is **NOT** proof of Cosmos connectivity unless the §4.1 active probe is implemented — treat step 4a as the real store proof.
2. **SSO login with an IoT-team account first** (they carry `ClaimArea.IoT` 1400 → `iot`) — proves public-client + `AreaClaim[]` parse **end-to-end without** handler accounts existing yet.
3. Device board renders live reads from the integration-bridge.
4. One **non-P1** canary call → an `ooh`-tagged Zendesk ticket (status `new`) with the `[TRG]` transcript; confirm it surfaces in the IoT Support dash OOH Review queue.
5. **4a — REAL Cosmos write proof (F03, per CR-01/CR-02):** confirm the canary call actually **persisted** to the pre-created containers (an `OohAuditLog` entry, and/or the P1 path's `OohSmsLog` doc) — i.e. a keyless write via WI succeeded against pre-created containers. This is the definitive F03 verification; a green `/healthz` is not.
6. Confirm **no** device write occurred (`WRITES_DISABLED`) and the P1 path **logs** (no SMS sent).
7. Confirm call-ticket reconciliation/merge on a call that has a Talk ticket.
8. Clean up canary tickets (solve + tag `test`, or delete) and any canary store docs.

**Go/no-go gate ladder (each a separate, later decision — NOT this gate):**
| Gate | Flips | Precondition |
|------|-------|--------------|
| #2 canary | deploy the app (write-locked) | F10 RBAC grant; matrix above green |
| #3 device writes | `WRITES_DISABLED=false` | SR-3 scoped TB write cred bench-proven |
| #4 live SMS | `SMS_PROVIDER=twilio` + creds | Twilio creds (reuse IoT dash acct) + on-duty number loaded |
| D-2 | P1 deep-link exemption live | §8 handed to Spencer/platform; phone-verified |

**Rollback:** re-point the image tag to the previous sha (or the placeholder); writes/SMS already locked; runtime kill-switch available; non-destructive throughout (no DB migrations, no consumer changes).

**External blocker (deploy-time, not design/build):** Azure RBAC grant on the Techhub tenant to James's object id `ec79d06a-…` (Key Vault Secrets Officer on `airedale-kv-{uat,prod}`, AcrPush on `apitechhub`, AKS RBAC Writer + Cluster User on `iot-services`) — or Spencer runs Steps 2–4. Does not gate design or build. **Add to this ask (CR-01):** pre-creation of the four Cosmos containers (`OohOverrides`, `OohAuditLog`, `OohAppConfig`, `OohSmsLog`, partition key `/storePartition`) by a control-plane-privileged identity, since James's data-plane grant cannot create them.

---

## 8. D-2 — P1 deep-link ingress exemption design (F09)

**The one deliberate cross-product change.** Handed to Spencer/platform; **no code change to either app.**

**Problem:** the P1 escalation SMS contains a deep-link `${IOT_DASH_BASE_URL}/?ticket={id}` → `https://zendesk-uat.airedale-api.co.uk/?ticket={id}` (the SD-330 IoT Support Dashboard). That dashboard's ingress sits behind an auth guard; an on-call handler opening the link on a phone at 2am must reach the ticket **without** hitting a basic-auth/SSO wall first (or with the lightest possible challenge).

**Design (token-guarded path exemption on the *consumer* ingress):**
- **CT IM-04 — scope it correctly.** An nginx-ingress auth exemption matches on **path**; here the path is just `/` and `ticket` is a *query arg*. A naive "exempt any request carrying `?ticket=`" would let an attacker append `?ticket=x` to **any** path and bypass the ingress auth for the **whole app**. The exemption MUST therefore be scoped to **exact path `/` AND presence of a valid signed `k` token** (via an nginx `map`/`if ($arg_ticket)` + token check), never merely "query param present".
- **Guard it** so the exemption is not an open door:
  - **Required form:** a short, rotating **signed token** appended by the OOH app when it builds the SMS link (`/?ticket={id}&k={hmac}`), validated at the ingress/edge (HMAC over `ticket` + expiry, shared secret on the SD-330 side). Expires (e.g. 24h) so a leaked SMS link doesn't grant indefinite access.
  - The **presence-of-query-param** form (allow-list on `?ticket=` alone) is **not acceptable** — explicitly ruled out per IM-04.
- **Downstream authorisation is unchanged:** the SD-330 app still authorises the *viewer* for that ticket; the exemption only removes the *ingress-level* wall, not app-level authz. This downstream authz is the backstop, but is not a licence to loosen the ingress scope.
- **Owner:** Spencer / platform (SD-330 ingress). **OOH app change:** only if the signed-token option is chosen (OOH appends `&k=` when composing the P1 SMS) — that is a **small, optional** OOH change gated to go/no-go #4, not this release's canary.
- **Verification:** on a **real phone**, at go/no-go #4: tap a P1 SMS link → lands on the correct ticket without an auth wall (or with only the intended light challenge); an expired/absent token → blocked.

**Data-dictionary touch:** none new. Uses the existing `IOT_DASH_BASE_URL` and Zendesk ticket id. If the signed-token option is chosen, add `IOT_DASH_LINK_SIGNING_SECRET` to the secret surface (flag to Initialiser/Developer) — **not** required for this canary.

---

## 9. Zendesk auth (F06) & SMS (F05) — config-only, locked decisions

**F06 — Zendesk:** load **Jonathan Wilkinson's existing** `ZENDESK_SUBDOMAIN` / `ZENDESK_EMAIL` / `ZENDESK_API_TOKEN` into `ooh-dashboard-secrets` (the dashboard already operates on these). **No machine/service account created this release.** OOH continues to create `ooh`-tagged tickets under Jonathan's identity, exactly as today. Values are documented for KV/secret loading and **never committed**.

**F05 — SMS:** `SMS_PROVIDER=twilio` is already supported in code (`services/escalation.js` / config `sms.twilio`). **Reuse the IoT Support dashboard's existing Twilio account** + from-number `+447458901522` + its on-duty escalation recipient. **Config-only, no build.** Canary stays `SMS_PROVIDER=log`; live SMS flips at go/no-go #4. Load `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` + `ESCALATION_ONDUTY_NUMBER` / `ESCALATION_ONDUTY_NAME` at #4.

---

## 10. Monitoring design (harness-mandatory deliverable)

**Definition of healthy** and how James/BAU sees it:

| Signal | Source | Healthy | Unhealthy → action |
|--------|--------|---------|--------------------|
| Liveness/readiness | `/healthz` (K8s probes) | subsystems `{bridge, thingsboard(read+write-auth), zendesk, store}` all green; `status` degrades to non-ok when any critical subsystem is down (per §4.1) | probe fail → pod restart (liveness) / removed from service (readiness) |
| Version/build | `/api/version` | reports `appVersion` from package.json | mismatch after deploy → wrong image rolled |
| Store | `store.js` **active** `storeProbe()` (per §4.1 — NOT the current cached flag) | real point-read succeeds → `{mode:'cosmos', healthy:true}` | `healthy:false` → Cosmos auth/WI failure, missing-container (CR-01), or scope failure. **Note:** the *current* `storeStatus()` is a false-green (CR-02) until §4.1 lands — do not trust it as-is |
| Producer liveness | `services/liveness.js` | overnight tickets created against a non-zero baseline | `no-overnight-activity` raised → OOH producer silently not creating tickets |
| Device-write lock | manifest `WRITES_DISABLED` | `true` during canary | any device write while `true` → contract breach (must be impossible; `killswitch.writesBlocked()` checks it first) |
| P1 SLA | `OohSmsLog` `OohP1AckAt` | ack recorded within SLA | **IM-02 caveat:** not yet live-fed until SMS goes live (#4); SLA reporting is dark until then — **document, don't alarm** |

**Success criteria for go-live (SteerCo-visible):**
- **Canary success:** verification matrix §7 all green; zero device writes; P1 path logs correctly.
- **Steady-state success:** self-serve handling rate (OOH calls resolved without escalation), P1 escalation SLA (once #4 live), zero `no-overnight-activity` false-alarms tuned against the real baseline.
- **Alerting approach:** `/healthz` drives K8s restart/deregister automatically; `no-overnight-activity` and `store.healthy:false` are the two signals that warrant a human page. Portfolio-level aggregation is a future project (per SteerCo operating model) — this release delivers the per-project signals, not a dashboard.

---

## 11. UI check & the Design-Gate artefact

**UI-change verdict: NONE** (restated from §0). No operator screen changes. A UI prototype would be fabrication.

**What the Gate artefact IS:** an interactive **Go-Live Design Review** at `prototype/index.html` (self-contained, opens in a browser). It is *interactive* — not a static page — and doubles as the SteerCo-standard review document (per root CLAUDE.md "SteerCo Review Presentation Standard"):
- **Sections:** current-state delta (§1); the four app-side changes (F01–F04) with **read-only before→after code diffs**; config-validation change; test design; an **interactive canary/deploy stepper** (§7 matrix as walkable steps); the go/no-go gate ladder; monitoring panel (a mocked `/healthz` subsystems view + success criteria); the D-2 ingress-exemption spec; the Zendesk/SMS config decisions; and the **Critical Thinker findings summary**.
- **Controls:** per-section **Approve / Amend / Reject** + a comment field; a **JSON export** copied to clipboard on submit; auto-opens in the browser.
- **Honesty:** the artefact states at the top that it is a *change/ops design review*, not a UI mock, because the operator UI is unchanged.

This satisfies both the harness's "interactive artefact at the gate" requirement and the checkpoint's `prototype/index.html` path — without pretending a UI changed.

---

## 12. Critical Thinker review (independent, run 2026-07-27)

The Critical Thinker read this spec **and the actual source** (`config.js`, `auth.js`, `store.js`, `server.js`, `escalation.js`, `deployment.yaml`, `package.json`, `Dockerfile`, `package-lock.json`, `tests/auth.spec.js`, `DEPLOY_RUNBOOK.md`) and the installed SDK type surfaces. Verdict: **Proceed after addressing critical.** All findings dispositioned below; **both criticals resolved in-spec**.

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| CR-01 | Container `createIfNotExists` will 403 — data-plane RBAC can't create containers, yet impl §3d expects the app to | **Critical** | **RESOLVED** §4 — pre-create containers out-of-band as the **primary** plan (added to F10 ask + runbook RB-3); app tolerates 403 with a handle fallback |
| CR-02 | `/healthz` store-green is a false-green (cached flag, never probes Cosmos; `status` always `'ok'`) — can't verify F03 | **Critical** | **RESOLVED** §4.1 — active `storeProbe()` + eager boot warm-up + `/healthz` degrade; F03 proven by a **real canary write** (§7 step 4a), not health-green |
| IM-01 | §3.1 public-client code invented a no-op `tokenEndpointAuthMethod`; correct v6 idiom is `discovery(url, clientId)` (defaults to `None`) | Important | **FOLDED IN** §3.1 |
| IM-02 | `@azure/identity` absent from package.json + lockfile → `npm ci --omit=dev` omits it from the image | Important | **FOLDED IN** §4 (mandatory dep + smoke check) |
| IM-03 | Runbook falsely says code is "already aligned to prod" (dismissed spike); 3 stale branch refs | Important | **FOLDED IN** §7 RB-1 (expanded) |
| IM-04 | D-2 query-string exemption is path-matched in reality; naive form = whole-site auth bypass | Important | **FOLDED IN** §8 (exact-path `/` + signed token; presence-of-param ruled out) |
| AD-01 | `mapRole` resolution is array-order-dependent for dual-claim users | Advisory | **FOLDED IN** §3.2 (fixed precedence iot > handler) |
| AD-02 | Confidential-client back-compat is illusory (secret never passed to `discovery`) | Advisory | **NOTED** §3.1 |
| AD-03 | §4 prose/code mismatch on `COSMOS_DATABASE` requirement | Advisory | **FOLDED IN** §4 (defaulted; require endpoint only) |
| AD-04 | `replicas:1` = brief outage + full re-SSO on every deploy/restart | Advisory | **NOTED** §7 RB-4 (deploy in quiet hours) |
| AD-05 | `DefaultAzureCredential` failure is opaque, deferred to first store access | Advisory | **FOLDED IN** §4 (`WorkloadIdentityCredential` preferred) + §4.1 (boot-time surfacing) |

**CT-acknowledged strengths:** the `mapRole` hardening is genuinely robust; the keyless-Cosmos `aadCredentials` shape is valid on the installed SDK; the test-boundary honesty (§6.5) is the right posture; RB-2 (Zendesk = Jonathan's creds) is a correct catch; canary defence-in-depth is preserved.

---

## 13. Data-dictionary alignment

No new app-owned data points. Confirmed against `DATA_DICTIONARY.md`:
- Removed from the config surface: `OIDC_CLIENT_SECRET` (public client), `COSMOS_KEY` (WI). Dictionary already reflects this.
- Auth claim contract (`extension_Role` → `AreaClaim[]`, `1500→handler`/`1400→iot`) already documented.
- D-2 signed-token option *would* add `IOT_DASH_LINK_SIGNING_SECRET` — flagged, not yet added (not in this canary).
- Cosmos containers (`OohOverrides`, `OohAuditLog`, `OohAppConfig`, `OohSmsLog`) unchanged; access method changes to AAD/WI (already noted in the dictionary).

---

## 14. Accessibility & security

- **Accessibility:** operator UI unchanged (already-tested v1.1.0). The Gate artefact meets contrast on the established palette and is keyboard-operable.
- **Security posture (improves this release):** public PKCE client (no secret to leak), keyless Cosmos via WI (no master key in-cluster, blast radius scoped to `/dbs/ooh-dashboard`), least-privilege TB write cred (SR-3), same-origin guard + hardened session cookies unchanged, fail-secure boot (`NODE_ENV=production` refuses `AUTH_MODE=dev`/`DATA_MODE=fixture`) unchanged, canary write-lock + SMS-log defence-in-depth. TB/Zendesk creds remain in the K8s secret this release (KV-CSI is deferred hardening, impl §2 follow-up).

---

## 15. Feature coverage map

| Feature | Design status | Where designed |
|---------|---------------|----------------|
| F01 public OIDC client | ratified | §3.1 |
| F02 `AreaClaim[]` mapRole | ratified | §3.2 |
| F03 keyless Cosmos | ratified | §4 |
| F04 deployment manifest | ratified | §5 |
| F05 SMS = Twilio (reuse) | ratified | §9 |
| F06 Zendesk = Jonathan's creds | ratified | §9 |
| F07 test suite | designed | §6 |
| F08 deploy runbook | ratified + 2 corrections | §7 |
| F09 D-2 ingress exemption | **newly designed** | §8 |
| F10 Azure RBAC grant | n/a (external human step) | §7 (blocker note) |
| F11 write-locked canary | designed (execution deferred) | §7 |
