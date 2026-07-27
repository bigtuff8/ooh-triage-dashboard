# Release Notes — OOH Dashboard

## v1.2.0 — SD-586 go-live build: alignment to Spencer's secure prod model (harness cycle 2026-07-27T12-29-00)

**Date:** 2026-07-27 · **Mode:** Airedale · **Design gate approved:** 2026-07-27 · **Test phase:** PASS (0 rework) · **Critical Thinker:** 0 critical / 3 important / 3 advisory · **Branch:** `feature/go-live-sd586` (commit `7d4b5f2`, **NOT deployed** — gated on F10 Azure RBAC + SteerCo go/no-go)

Change + operational cycle re-pointing the built app from the OLD infra model to Spencer's **secure production model**. **The operator UI is unchanged** — no consumer or UI file was touched. Deploys as a write-locked canary.

### What's New

- **Public PKCE OIDC client (F01):** the shared Techhub-Production B2C client carries **no secret** — `initOidc` uses openid-client v6 two-arg discovery (public-client idiom); `validateConfig` no longer requires `OIDC_CLIENT_SECRET`. PKCE carries the flow.
- **`AreaClaim[]` role mapping (F02):** `extension_Role` is parsed as a serialised array of AreaClaim objects keyed on `claimArea` (1500 → handler, 1400 → iot), deterministic `iot>handler` precedence, malformed/legacy/missing → null (no throw).
- **Keyless Cosmos via workload identity (F03):** `WorkloadIdentityCredential`/`DefaultAzureCredential` when no `COSMOS_KEY`; the app takes a DB handle (no `createIfNotExists`) and tolerates a 403 on container create (CR-01); an **active boot-time store probe** replaces the old false-green `/healthz` (CR-02). `@azure/identity` is now a first-class dependency with a Dockerfile build-resolve guard.
- **Production manifest (F04):** `serviceAccountName: sa-ooh-dashboard`, image `apitechhub.azurecr.io/ooh-dashboard:<sha>`, workload-identity label, `replicas:1`, canary levers `WRITES_DISABLED=true` + `SMS_PROVIDER=log` retained.
- **Unit suite for the new model (F07):** `node:test` suite (22/22) covering mapRole AreaClaim[] + validateConfig relaxations, alongside Playwright 41/41 (total **63/0**).

### Technical Notes

- **Config decisions (F05/F06):** SMS = Twilio reusing the IoT Support dashboard's account (config-only, live at go/no-go #4); Zendesk = Jonathan Wilkinson's existing creds/API key (no service account).
- **D-2 ingress-exemption spec (F09):** the P1 deep-link exemption on the SD-330 ingress is scoped to **exact path `/` + a signed HMAC token** (never query-param-presence, which would be a whole-site auth bypass — IM-04). Handed to Spencer/platform.
- **Critical Thinker (pre-deploy):** verified the build matches spec and CR-01/CR-02 fixes are real in source. 0 critical.

### ⚠️ Known limitations / go-live conditions (NOT closed this cycle)

- **Deploy is blocked on F10** — Azure RBAC grant to obj `ec79d06a-…` (KV/ACR/AKS) **and** pre-creation of the 4 Cosmos containers (control-plane, RB-3). External human step; see `DEPLOYMENT_REQUEST.md`.
- **F01 live SSO + F03 keyless write are canary-only proofs** (design §6.5) — proven at the canary matrix (step 2 + the **hard-gated step 4a real write**), not in fixture.
- **`/healthz` store health is boot-honest but stale at runtime (IM-01):** a Cosmos outage *after* boot does not yet flip it to degraded — a Developer fix is scheduled **before go/no-go #3** (device-write BAU).
- **Boot probe cannot detect a missing container (IM-02):** reads as 404/green; the real backstop is the hard-gated step 4a live write. Runbook wording corrected this cycle.

## v1.1.0 — OOH producer conformance + coordinated go-live prep (harness cycle 2026-07-14T10-30-11)

**Date:** 2026-07-14 · **Mode:** Airedale · **Design gate approved:** 2026-07-14 · **Test phase:** PASS (1 rework cycle) · **Branch:** `feature/live-build-v1` (NOT deployed — go-live gated to Phase C)

Backend/data-contract cycle bringing the OOH producer into exact conformance with the FROZEN IoT Support dashboard consumer (v1.49.1). The operator UI is unchanged. No consumer file was touched.

### What's New

- **Full timestamped `[TRG]` transcript (F001):** every OOH outcome writes an anchors-first `[TRG]` internal comment — `summary → Operator → Caller's words → Outcome (bare code) → Transcript (HH:MM | step)` — assembled from data the producer already holds. Anchors are always emitted before the (unbounded) transcript so they survive Zendesk's description truncation and the frozen consumer's oversight parse still extracts operator/outcome/caller/site.
- **Call-ticket reconciliation (F003):** at outcome time the producer auto-identifies the originating Zendesk Talk call ticket (multi-signal confidence: answered-by + time window + site + caller number) and **merges it into the OOH ticket** — one record, recording attached, no duplicate, no manual merging. Confident match (≥0.80) auto-merges; a probable match (0.50–0.79) or ambiguous (≥2 plausible) posts the recording as an internal link and leaves tickets intact.
- **Ticket Category = "Support Request" (F002)** on every outcome ticket for Zendesk-native reporting.
- **Deploy-time device-write lock (F005):** a synchronous, Cosmos-independent `WRITES_DISABLED` check as the first gate on every device-write path — a first-boot safety guarantee for the canary, independent of the runtime kill-switch.
- **Producer-liveness monitoring (F010):** business-liveness self-check raises `no-overnight-activity` when a healthy producer creates zero tickets against a non-zero baseline (closes the consumer's "empty window reads as all-clear" gap; layer-1 uptime remains Spencer's).
- **Success-criteria instrumentation (F011):** P1-claim SLA + capture/escalation metrics on `/api/admin/metrics`.

### Bug Fixes

- **F004:** corrected the P1 deep-link host default to the live UAT dashboard; `IOT_DASH_BASE_URL` is now required explicitly in production (fail loud).
- **F011:** P1 SLA now reads `OohSmsLog` (dispatch→ack) — fixes a latent lookup that always returned null.

### Technical Notes

- **Rework cycle 1 (Critical-Thinker review):** the first test pass was fixture-mode; a CT review found F003 auto-merge was unreachable in the *default live* config. Fixed: `answered_by_name` is now derived from `answered_by_id` via a Zendesk users lookup (so auto-merge works live without an operator→agent map), the match window was widened 5→45 min (captures are logged after the call), the merge path posts the recording note belt-and-braces, and the added lookup is cached to avoid an N+1 fan-out. CT re-review: all findings CLOSED against the live path.
- Verification: Playwright 41/41, dev-selfverify 25/25, tester-verify 16/16, verify-rework-cr01 10/10.

### ⚠️ Known limitations / go-live conditions (NOT closed this cycle)

- **P1-claim SLA metric is NOT yet live-measurable.** "P1 claimed within 15 min" (metric 2) has no live write path for `OohP1AckAt` — the claim happens on the frozen consumer/Zendesk and is not fed back into the producer's `OohSmsLog`. Until a claim→ack feedback path exists, this metric reports **null** — a null must NOT be read as "target met." (Tracked: IM-02.)
- **Layer-1 producer-uptime monitoring** (detecting a *dead* producer, vs merely idle) is Spencer's (F008) — the in-process self-check cannot detect its own process death. (Tracked: IM-04.)
- **Recommended:** populate `OOH_OPERATOR_AGENT_MAP` for answered-by robustness where a Zendesk display name may differ from the app operator name (AD-07).
- **Device writes and live SMS remain LOCKED** (`WRITES_DISABLED=true`, `SMS_PROVIDER=log`) behind the 7 SteerCo conditions. This release is for merge + a locked/canary deploy only — NOT device-write cutover (F012/F013).

## v1.0.0 → v1.0.2 — Live build (harness cycle 2026-07-10T22-01-41)

**Date:** 2026-07-11 · **Mode:** Airedale · **Design gate approved:** 2026-07-10 · **Test phase:** PASS (1 rework cycle)

### What's New

The read-only prototype is now a full authenticated product for out-of-hours call handlers:

- **Guided call handling (F012):** confirmed-site workspace with live device board, smart issue entry (type the caller's words, the system suggests the right flow), 8 category tiles, system-triggered connection check, multi-issue calls, and a "Tonight" shift view.
- **Real device control (F002/F005/F006/F007):** heating setpoint up/down, Salus frost-hold "off" and Intesis native Off, hot-water boost (0–9h) — all through the single SD-492 ThingsBoard shared-attribute write path. The prototype's direct vendor routes are deleted.
- **Truth-first sync tracking (F008):** "Applied" is shown only when the device echoes the change back; pending/failed/rejected/timeout are first-class states, with IT700 slow-echo handling and a late-sync watch that updates the ticket.
- **Safety rails:** blocking site-confirmation gate with server-enforced confirm tokens (F004); server-side capability + value guardrails, mirrored in the UI steppers (F009); durable timed overrides that survive restarts and revert exactly once (F010); runtime global/per-site write kill-switch with mandatory reason (F016).
- **Everything on a ticket (F011/F013/F015/F017):** every outcome writes an `ooh`-tagged Zendesk ticket carrying the real operator identity; callback lookup translates ticket status to caller-friendly scripts (with chargeable-visit warning); notes ride existing internal comments; uncovered classes capture-and-escalate with honest messaging.
- **P1 escalation (F014):** system-decided P1s dispatch an SMS (pluggable provider; log provider until the gateway decision) with a deep-link straight to the ticket in the IoT Support dashboard, with acknowledgement tracking for the SLA metric.
- **Auth (F001):** B2C OIDC (config-driven, PKCE), fail-secure production startup, server-side role enforcement (handler vs IoT admin), dev identities gated non-production.
- **Ops (F018/F021/F022):** multi-stage Dockerfile + K8s manifests (iot-services, limits, probes), `/healthz` with subsystems + active alerts, alert conditions (write-failure streak, revert failure, SMS failure), service metrics (self-serve rate, control success rate, P1 SLA, capture volume by class), operator runbook.

Companion release: **IoT Support dashboard v1.49.0** (branch `feature/f026-ooh-review-queue`) adds the OOH Review queue (Needs review / P1 log / Captured / All activity, bulk mark-as-reviewed, read-only holds mirror with failed-revert highlight) and the `?ticket=` deep-link landing.

### Fixed during test rework (v1.0.1)
- Smart-entry suggestion chips broke on apostrophes in the caller's words ("won't", "it's") — caller text no longer passes through inline handler source; regression test added.
- Unknown `/api/*` paths now return 404 JSON, never the SPA shell.
- Tonight audit rows show friendly hold-revert times; hold picker shows the explicit revert value; favicon added.

### v1.0.2 (advisories)
- `captureClass` → `OohCaptureClass` (data-dictionary Ooh-prefix rule; done pre-live, no migration).
- Fixture ticket-store id-reset quirk documented; F003 credential doc aligned with the deferral convention.

### Known deferrals (externally gated)
- **F003** SR-3 scoped TB write credential + bench proof (Spencer) — hard gate before any live device write.
- **F014 live SMS** — gateway decision (Q-F) + on-duty number; config-only switch.
- **F018 pipeline** — Spencer repo/pipeline/secrets/hostname (see `DEPLOYMENT_REQUEST.md`).
- **F023** — live-site control assurance gate (D4a), after deployment + credential.
- **F025 send** — Spencer ask email ready, needs sending.
- **F026 deploy** — dashboard branch push = UAT deploy (James's approval), then mobile deep-link verification.

### Technical Notes
- Suite: 41 Playwright tests, 0 failures — real server in fixture mode, all 6 mandatory protocols.
- Quality scores (Airedale): UX 9 · Brand 9 · Craft 7.5 · Functionality 7 · Originality 8 → 8.4 weighted.
- Backlog: styled Popconfirm to replace native prompt/confirm; dynamic hold label after midnight; session store for multi-replica.
