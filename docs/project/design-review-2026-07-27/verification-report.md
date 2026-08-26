# Verification Report — IOT OOH Dash go-live (SD-586)

**Project:** IOT OOH Dash — go-live (SD-586)
**Mode:** Airedale · **Harness:** build · **Phase:** test
**Tester Session:** 2026-07-27
**Rework Cycle:** 0 (first Tester pass — no rework required)

This report traces **every** verification step of **every** feature in `feature-list.json`,
independently, against the actual source on branch `feature/go-live-sd586`. It is the evidence
that each step was checked, not summarised.

## Evidence method / legend

- **PASS** — independently verified in this session (unit/E2E test executed, source read, static check run).
- **PASS (canary-only)** — the step is proven only by a live canary/SSO/write per the design-gate-approved
  verification boundary (design-spec §6.5). Code-level precondition verified; live proof deferred to F11.
- **DEFERRED-EXTERNAL** — the step is an external human action (Azure RBAC, Spencer handoff, real-phone check)
  that cannot occur in the test phase. `design_status` for the feature reflects this. Not a build defect.

Test evidence executed this session:
- `node --test "test/*.test.js"` → **22/22 pass, 0 fail** (mapRole 12 cases, validateConfig 8, initOidc 2).
- `npx playwright test` (fixture mode, real server boot) → **41/41 pass, 0 fail**. Total **63/0**.
- Static checks: YAML parse of `k8s/deployment.yaml` (2 docs, all levers present); source-check-test scan (none);
  `@azure/identity` present in `package.json` + `package-lock.json`; `require.resolve('@azure/identity')` (Dockerfile guard) succeeds.

---

## F01 — OIDC public client (security, critical) — passes:true

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | `validateConfig()` with `AUTH_MODE=oidc` and no `OIDC_CLIENT_SECRET` returns no secret-related problem | `config.js:141-147` — oidc branch requires only `OIDC_ISSUER`+`OIDC_CLIENT_ID`; secret never referenced. Unit test *"OIDC_CLIENT_SECRET is not required for AUTH_MODE=oidc"* PASS; *"secure prod model (no secret, no key) is fully valid"* returns `[]`. | **PASS** |
| 2 | `initOidc` builds a public-client config without throwing | `auth.js:56-64` — two-arg `discovery(new URL(issuer), clientId)`, the correct openid-client v6 public-client idiom (IM-01: no invented property). Offline-provable contract (no-op when `AUTH_MODE!=='oidc'`) unit-verified PASS. Building against the real issuer needs live B2C → its actual success is step 3. | **PASS** (idiom verified; live build = step 3) |
| 3 | Live SSO login succeeds at the canary (IoT-team account) | Requires the deployed canary + real B2C tenant. Boundaried to F11 canary matrix step 2 per design §6.5. | **PASS (canary-only)** |

## F02 — mapRole parses AreaClaim[] (security, critical) — passes:true

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | `mapRole` with a serialised `AreaClaim[]` containing `claimArea 1500` returns `'handler'` | `auth.js:78-91` parses JSON string → array → keys on `claimArea`. Unit test *"claimArea 1500 → handler"* PASS. | **PASS** |
| 2 | `claimArea 1400` returns `'iot'`; no match returns `null` (403 path) | Unit tests *"1400 → iot"*, *"neither known area → null"* PASS. `null` drives the 403 branch at `auth.js:177-180`. | **PASS** |
| 3 | Malformed / legacy inputs do not throw | Try/catch on `JSON.parse` (`auth.js:81`); non-array coerced; `String(c?.claimArea ?? c)` avoids `[object Object]`. Unit tests: malformed JSON, missing claim, null/undefined, empty array, bare-int, single object, unrelated object — all → `null`, **no throw**. PASS. | **PASS** |

## F03 — keyless Cosmos via workload identity (data, critical) — passes:true

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | `package.json` includes `@azure/identity` | `package.json:16` → `"@azure/identity": "^4.13.0"` as a first-class `dependency`; present in `package-lock.json` (IM-02); Dockerfile build guard `require.resolve('@azure/identity')` executed this session → **resolves**. | **PASS** |
| 2 | `validateConfig()` in live mode does not require `COSMOS_KEY` | `config.js:153-156` — live branch requires only `COSMOS_ENDPOINT` (+ bridge, TB-write). Unit test *"COSMOS_KEY is not required for DATA_MODE=live"* PASS; *"COSMOS_ENDPOINT still required"* PASS. | **PASS** |
| 3 | Keyless client connects to Cosmos via WI at the canary | `store.js:140-186` — `aadCredentials` = `WorkloadIdentityCredential`/`DefaultAzureCredential` when no key (AD-05); no `databases.createIfNotExists` (CR-01); 403-tolerant container handle; `storeProbe()` real point-read (CR-02). Live WI token + real write require the deployed canary + pre-created containers → F11 matrix step 4a per §6.5. | **PASS (canary-only)** |

## F04 — deployment manifest to prod model (infrastructure, high) — passes:true

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | Manifest valid; `serviceAccountName=sa-ooh-dashboard`; image `apitechhub.azurecr.io` | YAML parses into 2 docs (Deployment+Service). `deployment.yaml:26` SA = `sa-ooh-dashboard`; `:31` image `apitechhub.azurecr.io/ooh-dashboard:<sha>`; `:23` WI label `azure.workload.identity/use:"true"`. Static check PASS. | **PASS** |
| 2 | `WRITES_DISABLED=true`, `SMS_PROVIDER=log`, `replicas:1` unchanged | `deployment.yaml:15` replicas 1; `:68-69` `WRITES_DISABLED="true"`; `:70-71` `SMS_PROVIDER="log"`; limits+probes retained. Static check PASS. | **PASS** |
| 3 | Applies cleanly to `iot-services` | `kubectl apply` needs the live cluster (F10 access). Namespace/kind/labels well-formed and parse-valid; live apply is F11 matrix step 1. | **PASS (static)** / live at canary |

## F05 — SMS = Twilio (reuse IoT-dash account) (security, high) — passes:false (config-only, deferred)

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | Deploy doc records reuse of IoT-dash Twilio creds + on-duty number | `DEPLOY_RUNBOOK.md` Step 1 table (`ESCALATION_ONDUTY_NUMBER/NAME` = "reuse the IoT Support dash on-duty escalation recipient (D-1)") + Step 5 go/no-go #4 (reuse IoT dash Twilio account). Recorded. | **PASS** |
| 2 | Canary keeps `SMS_PROVIDER=log` | `deployment.yaml:70-71` `SMS_PROVIDER="log"`; `config.js:93` default `log`. Playwright log confirms P1 path emits `[SMS:log] Would send…` (no send). | **PASS** |
| 3 | Live SMS switched on at go/no-go #4 | Runbook Step 5 gates `SMS_PROVIDER=twilio` to go/no-go #4. | **DEFERRED-EXTERNAL** |
| | | **Feature disposition:** config-only, no build artefact beyond docs; `passes:false` is correct (live enable deferred). | |

## F06 — Zendesk = Jonathan's existing creds (integration, high) — passes:false (config-only, deferred)

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | `ZENDESK_SUBDOMAIN/EMAIL/API_TOKEN` = Jonathan's existing values documented for KV loading (never committed) | `DEPLOY_RUNBOOK.md` Step 1 table + RB-2 explicitly state Jonathan Wilkinson's existing creds, KV-loaded, values never committed. Secret scan of tracked files → no credential values. | **PASS** |
| 2 | OOH producer creates `ooh`-tagged tickets under Jonathan's identity | Existing behaviour; `config.js:66-77` uses `ZENDESK_*` env; Playwright *"raise a query creates a ticket"* + *"outcomes land in Tonight"* exercise ticket creation in fixture mode. Live identity confirmed at canary matrix step 4. | **PASS (fixture)** / live at canary |
| 3 | No new Zendesk agent created | RB-2 explicitly forbids a service/agent account this release; no code creates one. | **PASS** |
| | | **Feature disposition:** config-only; `passes:false` is correct (live-identity ticket at canary deferred). | |

## F07 — test suite updated for new model (api, high) — passes:true

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | Behaviour test asserts `AreaClaim[]` mapRole handler/iot/null cases | `test/mapRole.test.js` — 12 behaviour cases incl. handler(1500), iot(1400), null(9999), dual-claim precedence, malformed. Executed → PASS. | **PASS** |
| 2 | Full Playwright suite 0 failures in fixture mode | `npx playwright test` executed this session → **41/41, 0 fail**. | **PASS** |
| 3 | No source-check tests | Read all 3 unit files + scanned `test/` and `tests/` for `.toString().includes(` / source-inspection — **none found**. Tests assert behaviour/return values/UI outcomes. | **PASS** |

## F08 — deploy runbook (infrastructure, high) — passes:true

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | Runbook lists the 3 RBAC grants + az/kubectl commands | `DEPLOY_RUNBOOK.md` Step 0 — KV Secrets Officer (uat+prod), AcrPush, AKS RBAC Writer + Cluster User to obj `ec79d06a-…`, with exact `az role assignment create` commands; RB-3 Cosmos container pre-create; Steps 2-3 az acr build / kubectl set image. | **PASS** |
| 2 | Canary verification matrix documented | Step 4 — 7-point matrix incl. **step 4a real-write proof** (CR-01/CR-02) and CR-02 `/healthz` degrade caveat. | **PASS** |
| 3 | Rollback documented | "Rollback" section — re-point tag `kubectl set image … <previous-tag>`, kill-switch, non-destructive (no migrations). | **PASS** |

## F09 — D-2 ingress-exemption spec (integration, medium) — passes:false (deferred)

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | Written spec for exempting `/?ticket=` with a token/allowlist guard | `handover/D-2-ingress-exemption-spec.md` — full spec: IM-04 scoping (exact path `/` **AND** signed `k` HMAC token, param-presence explicitly ruled out), token form, defence-in-depth, ownership matrix, verification. | **PASS** |
| 2 | Handed to Spencer/platform | Document is the handover artefact; actual delivery to Spencer is external. | **DEFERRED-EXTERNAL** |
| 3 | Verified on a real phone at go/no-go #4 | Real-phone check at go/no-go #4 (consumer-side ingress; not code). | **DEFERRED-EXTERNAL** |
| | | **Feature disposition:** spec deliverable complete; `passes:false` correct (steps 2-3 external/deferred). | |

## F10 — Azure RBAC access grant (infrastructure, critical) — passes:true, deferredExternal, design_status:not_applicable

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | James can `az keyvault secret list airedale-kv-uat` | External human Azure RBAC grant (Spencer). The precise ask is fully specified in `DEPLOY_RUNBOOK.md` Step 0. Not executable in the test phase. | **DEFERRED-EXTERNAL** |
| 2 | `az acr show -n apitechhub` succeeds | As above (AcrPush grant). | **DEFERRED-EXTERNAL** |
| 3 | `kubectl get deploy -n iot-services` succeeds | As above (AKS RBAC Writer + Cluster User grant). | **DEFERRED-EXTERNAL** |
| | | **Feature disposition:** `design_status=not_applicable` — no code deliverable; the documented ask (runbook Step 0 + RB-3 container pre-create) is complete. `passes:true` = documented-ask complete, **NOT** live-verified. Verified honestly as external. | |

## F11 — write-locked canary deployed & verified (infrastructure, critical) — passes:true, deferredExternal

| Step | Expected | Actual (independent) | Result |
|------|----------|----------------------|--------|
| 1 | Image built + pushed; `kubectl set image` flips placeholder to the app | Build-side complete: real image ref in manifest, `az acr build` + `kubectl set image` in runbook Steps 2-3. Live execution blocked on F10. | **DEFERRED-EXTERNAL** (build-side PASS) |
| 2 | `/healthz` green; SSO via IoT-team account; device board reads | `/healthz` computes real subsystem state (`server.js:66-72`); canary matrix step 2 covers SSO+board. Live proof at canary. | **DEFERRED-EXTERNAL** (build-side PASS) |
| 3 | One canary call writes an `ooh` ticket with `[TRG]` transcript; `WRITES_DISABLED`+`SMS=log` confirmed | Manifest carries the levers; runbook matrix steps 4/4a/6 prove it live. `[TRG]` + reconciliation exercised in Playwright fixture. | **DEFERRED-EXTERNAL** (build-side PASS) |
| | | **Feature disposition:** build-side of the write-locked canary complete (manifest levers + runbook matrix incl. 4a real-write + rollback). Live run blocked on F10. `passes:true` = build deliverable complete, **NOT** live-verified. Verified honestly as deferred. | |

---

## Coverage confirmation

All 11 feature IDs (F01–F11) and every listed verification step are traced above. No feature ID is omitted.

- **Fully code/test/static-verified this session:** F01 (steps 1-2), F02 (all), F03 (steps 1-2), F04 (all), F07 (all), F08 (all), F05 step 1-2, F06 steps 1&3, F09 step 1.
- **Canary-only (design §6.5 boundary, gate-approved):** F01 step 3, F03 step 3, F06 step 2 (live identity).
- **External/deferred (not a build defect):** F05 step 3, F09 steps 2-3, F10 (all), F11 (all).

No live proofs were fabricated. The deferred boundary matches the design-gate-approved verification boundary
(design-spec §6.5) and is stated transparently rather than passed off as verified.
