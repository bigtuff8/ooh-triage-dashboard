# Code Audit — IOT OOH Dash go-live (SD-586), dev phase

**Date:** 2026-07-27
**Branch audited:** `feature/go-live-sd586` (diff vs baseline `feature/live-build-v1`)
**Auditor:** Developer agent (self-audit before Tester handoff)
**Mode:** Airedale · **Harness:** build

## Scope — files changed this phase

```
Dockerfile
config.js
k8s/deployment.yaml
package.json
package-lock.json
server.js
services/auth.js
services/store.js
test/config.test.js
test/initOidc.test.js
test/mapRole.test.js
```
(`DEPLOY_RUNBOOK.md` and `handover/D-2-ingress-exemption-spec.md` are project-root/handover
docs outside the git repo — reviewed for accuracy, not code.)

---

## Mandatory checks

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 1 | **Functions defined but never called** | **PASS** | Every new/changed symbol is referenced. `storeProbe` (store.js:213) → called server.js:127. `mapRole` (auth.js:78) → called auth.js:176 + exported for unit tests. `initOidc` (auth.js:56) → called server.js:121. `ROLE_PRECEDENCE` (auth.js:68) → used auth.js:90. Verified with `git grep -w`. |
| 2 | **Dead code** | **PASS** | No dead branches introduced. The keyed-Cosmos path in `initCosmos` is retained deliberately (local/back-compat, per design §4) — not dead. The 403-tolerant container-handle fallback is reachable under data-plane-only RBAC (CR-01). No commented-out code, no unreachable statements. The dismissed spike branch `feature/infra-alignment-v1` is **not** the baseline and contributes nothing to this branch. |
| 3 | **Secrets / credentials in committed files** | **PASS** | `.env` is gitignored and NOT tracked (`git ls-files` confirms). Secret-pattern scan (`AccountKey=`, `api_token`, `password`, `secret` followed by a literal) over all changed tracked files → **no matches**. `OIDC_CLIENT_SECRET`/`COSMOS_KEY` only appear as config *keys*/comments, never values. Runbook documents Jonathan's Zendesk creds + Twilio reuse as **KV/secret keys to load**, never values. No connection strings, keys, or tokens in source. |

---

## Full pre-presentation checklist

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 4 | onclick handlers referencing missing functions | **N/A / PASS** | No operator-UI change this release (design §0/§11). `public/` untouched. Dev sign-in page markup unchanged. |
| 5 | `[object Object]` coercion bugs | **PASS** | `mapRole` coerces claim entries with `String(c?.claimArea ?? c)` — objects resolve to their `claimArea` int, bare ints/strings coerce cleanly; unrelated objects yield a non-matching key → `null`, never a stringified `[object Object]` role. Unit-covered. |
| 6 | Duplicate HTML attributes | **N/A** | No HTML authored this release. |
| 7 | Hardcoded `false`/placeholder values that should be computed | **PASS** | Removed a real instance: `/healthz` previously hardcoded `status:'ok'` and store reported a hardcoded-true cached flag (CR-02 false-green). Now `status` is **computed** from live subsystem state and store health comes from an **active point-read** (`storeProbe`). Manifest `image` placeholder is `<sha>` — an intentional CI substitution token (like the prior `REGISTRY_PLACEHOLDER`), documented in the runbook, not a value that should be computed at runtime. |
| 8 | `fetch()` / API / async calls without error handling | **PASS** | `storeProbe()` wraps the Cosmos point-read in try/catch, logs on failure, flips `storeHealthy`, and never throws. `initCosmos()` catches 403/Forbidden on container create and falls back to a handle; re-throws anything else (surfaced by the eager boot probe). The boot warm-up in `server.js start()` awaits `storeProbe()` (which cannot throw) — a store failure is logged and degrades health but does **not** exit (device board still serves). Existing `authorizationCodeGrant`/`buildAuthorizationUrl` remain wrapped in the router's try/catch → `next(err)` → central error handler (no stack traces to clients). |
| 9 | Async state flags not reset on success/error paths | **PASS** | `storeHealthy` is set to `true` on probe/collection success and `false` on failure — both paths covered. `cosmosReady` retains the existing reset-to-null-on-failure semantics (store.js:169) so a failed init can be retried on the next `collection()` call. No new latch left stuck. |
| 10 | Environment variables referenced but not defined | **PASS** | New env reads: `AZURE_FEDERATED_TOKEN_FILE` + `AZURE_CLIENT_ID` (injected by the Azure Workload Identity webhook when the `azure.workload.identity/use:"true"` pod label + `sa-ooh-dashboard` SA are present — both in the manifest); absence falls back to `DefaultAzureCredential`, so no hard dependency. `validateConfig` still gates the required live-mode vars (endpoint, bridge, TB-write) and no longer requires the now-removed `OIDC_CLIENT_SECRET`/`COSMOS_KEY`. |
| 11 | XSS / user content not escaped | **PASS** | No user-content rendering changed. `mapRole` consumes token claims server-side only; roles are constrained to the enum `{handler, iot, null}` — no claim text reaches the DOM. Dev sign-in page interpolates only the fictitious static `DEV_OPERATORS` (no PII, dev-only, gated off in production). |
| 12 | Dependency integrity | **PASS** | `@azure/identity ^4.13.0` promoted from a transitive dev-only dep to a first-class `dependency` and committed into `package-lock.json` (CT IM-02), so `npm ci --omit=dev` includes it. Dockerfile build-stage `node -e "require.resolve('@azure/identity')"` fails the build loudly if that regresses. `npm audit` at install: 0 vulnerabilities. |
| 13 | Standards compliance (transferable) | **PASS** | Airedale C#/Blazor standards are framework-specific and N/A to this Node app; the transferable security-standards principles were applied: no hardcoded secrets (§7), fail-secure boot preserved (prod refuses dev auth / fixture data), service-side authorisation unchanged (`requireAuth`/`requireRole`, `mapRole` server-only), no `eval`, hardened session cookies unchanged, structured error handling with no client stack traces. |

---

## Findings requiring action

**None.** All checks pass. No fixes outstanding.

## Verification boundary (honest coverage — carried from design §6.5)

The following are **verified in fixture/unit scope** and **proven live only at the canary** (F11, deferred pending F10 Azure RBAC + Cosmos container pre-creation — external steps, not a build defect):

- **F01** public-client token exchange (`token_endpoint_auth_method='none'`) — proven by a live B2C SSO login at canary matrix step 2. Unit scope: public-client discovery idiom + `validateConfig` no longer requires the secret.
- **F03** keyless Cosmos write via workload identity — proven by a **real Cosmos write** at canary matrix step 4a. Unit/boot scope: client construction path, 403-tolerant init, active probe, `validateConfig` no longer requires the key.

This boundary is stated so a green fixture suite is not mistaken for live proof.

## Test evidence

- Unit (`node --test`): **22/22 pass** — `mapRole` (12 cases incl. dual-claim precedence + malformed no-throw), `validateConfig` (secret/key not required; required fields + prod fail-secure intact), `initOidc` no-op contract.
- Playwright E2E (fixture mode, real server): **41/41 pass**, 0 failures.
- Total: **63 pass / 0 fail.**
- Fixture boot smoke: app starts, `/healthz` → `status:ok`, store `{mode:file,healthy:true}`.
