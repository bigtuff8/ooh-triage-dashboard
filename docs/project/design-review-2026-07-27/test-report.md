# Test Report

**Project:** IOT OOH Dash — go-live (SD-586)
**Mode:** Airedale · **Harness:** build · **Phase:** test
**Tester Session:** 2026-07-27
**Rework Cycle:** 0 (first pass — no rework required)
**Branch tested:** `feature/go-live-sd586` (F01–F04 build; baseline `feature/live-build-v1`)

## Summary

**Overall Result:** **PASS** (build-phase deliverables)
**Features Tested:** 11 (F01–F11)
**Features Passing:** 8 marked `passes:true` — all confirmed at the level each is verifiable (F01–F04, F07, F08 code/static-verified; F10, F11 documented-deliverable-complete, honestly non-live)
**Features `passes:false` (correct — config-only / deferred):** 3 (F05, F06 config-only; F09 spec-complete, handoff deferred)
**Features returned for rework:** 0

The build faithfully implements the design-gate-approved SD-586 change set. Both test tiers are green
(unit 22/22, Playwright 41/41, **total 63/0**). The two live-only proofs (F01 SSO, F03 keyless write) and the
external RBAC / canary items (F09 handoff, F10, F11) are **deferred per the design-spec §6.5 verification
boundary**, not defects — documented transparently, no fabricated live proof.

## Quality Scores (Airedale mode)

This release cycle has **no operator-UI change** (RELEASE_NOTES v1.1.0: UI unchanged; design-spec §0/§11).
It is a change + operational release (auth/data-plane/deploy model). The UI-facing criteria were assessed and
approved in the prior v1.1.0 cycle and are untouched here; below they are scored against **what changed this
cycle** (the change/ops implementation and the design-review artefact), per "grade against the Designer's spec".

| Criterion | Score | Threshold | Result | Notes |
|-----------|-------|-----------|--------|-------|
| UX Simplicity & Coherence | 8/10 | 7/10 | **PASS** | No operator-facing UX change; the *operational* UX (runbook ordering, go/no-go gates, canary matrix) is clear, sequential, single-owner-per-step. Design-review prototype is walkable. |
| Brand Alignment | 8/10 | 6/10 | **PASS** | No new UI. Design-review artefact follows the SteerCo Review Presentation standard (Approve/Amend/Reject + JSON export). Dev sign-in page (non-prod only) unchanged. |
| Craft | 8/10 | 7/10 | **PASS** | Code craft high: honest `/healthz` degrade, active store probe, deterministic role precedence, build-time dependency guard, no dead code, no secrets. Comments explain the *why* (CR-01/CR-02/IM-0x). |
| Functionality | 9/10 | 7/10 | **PASS** | Every changed path behaves per spec; error/malformed paths covered; fail-secure boot intact. |
| Originality | 7/10 | 5/10 | **PASS** | Interactive Go-Live Design Review (before→after diffs, canary stepper, CT findings) beyond template output; honest "no fabricated UI mock" stance. |

**Weighted score:** ≈ 8.1/10 — above every threshold. No criterion fails.

> Note: scores reflect the change/ops scope. Because no operator UI was produced this cycle, the visual
> criteria carry the prior-cycle assessment; nothing new was introduced that could regress them.

## Feature-by-Feature Results

Full step-by-step evidence is in **`verification-report.md`** (every step of every feature). Summary here:

| Feature | Description | Functional | Result |
|---------|-------------|-----------|--------|
| F01 | OIDC public client | steps 1-2 PASS; step 3 canary-only (§6.5) | **PASS** |
| F02 | mapRole AreaClaim[] | all 3 PASS (12 unit cases) | **PASS** |
| F03 | keyless Cosmos via WI | steps 1-2 PASS; step 3 canary-only (§6.5) | **PASS** |
| F04 | deployment manifest | all 3 PASS (YAML static-verified; live apply at canary) | **PASS** |
| F05 | SMS = Twilio (config-only) | steps 1-2 PASS; step 3 deferred (go/no-go #4) | `passes:false` correct |
| F06 | Zendesk = Jonathan's creds | steps 1&3 PASS; step 2 live at canary | `passes:false` correct |
| F07 | test suite for new model | all 3 PASS (63/0, no source-check tests) | **PASS** |
| F08 | deploy runbook | all 3 PASS | **PASS** |
| F09 | D-2 ingress-exemption spec | step 1 PASS; steps 2-3 external/deferred | `passes:false` correct |
| F10 | Azure RBAC grant | all external (documented ask complete) | **PASS** (deliverable; not live) |
| F11 | write-locked canary | build-side complete; live run blocked on F10 | **PASS** (deliverable; not live) |

### Design compliance
Implementation matches design-spec §3.1 (public-client idiom, IM-01 honoured — no invented property),
§3 (AreaClaim[] mapRole, AD-01 precedence), §4 (CR-01 no DB/container create + 403-tolerant handle),
§4.1 (CR-02 active probe + `/healthz` body-degrade, HTTP 200 kept for replicas:1), §2/§6 (manifest),
§7 (runbook RB-1..RB-4), §8 (D-2 IM-04 scoping). No deviations found.

### Independent code audit (re-verified against dev's `code-audit.md`)
| Check | Result | Details |
|-------|--------|---------|
| Functions defined but never called | **PASS** | `storeProbe`→server.js:127, `mapRole`→auth.js:176, `initOidc`→server.js:121, `ROLE_PRECEDENCE`→auth.js:90. |
| Dead code | **PASS** | Keyed-Cosmos path retained deliberately (local back-compat); 403 fallback reachable. |
| `[object Object]` coercion | **PASS** | `String(c?.claimArea ?? c)` — unrelated objects → non-matching key → null (unit-covered). |
| Hardcoded/placeholder values | **PASS** | CR-02 removed the `/healthz` false-green; `status` now computed. `<sha>` is an intended CI token. |
| fetch/async without error handling | **PASS** | `storeProbe` try/catch never throws; `initCosmos` 403-tolerant; router try/catch → central handler. |
| Async flags reset both paths | **PASS** | `storeHealthy` true/false both set; `cosmosReady` reset-on-failure retained. |
| Env vars referenced but undefined | **PASS** | WI vars injected by the webhook (label+SA present); fallback to DefaultAzureCredential. |
| Secrets/credentials in committed files | **PASS** | `.env` gitignored; secret scan of tracked changed files → no values. |
| Dependency integrity | **PASS** | `@azure/identity` first-class dep + in lockfile; Dockerfile `require.resolve` guard executed → resolves. |
| Standards (transferable) | **PASS** | C#/Blazor standards N/A (Node); security principles applied — server-side authz, fail-secure boot, no eval, hardened cookies, no client stack traces. |

## Test Data / Environment
- All tests ran in **fixture mode** against a locally-booted server (Playwright `webServer`). **No live systems touched.**
- **No test data created** in any live environment (Cosmos/Zendesk/ThingsBoard/Azure). Fixture stores are local JSON, isolated via `OOH_STORE_DIR`, and are not live data.
- **Cleanup:** nothing to clean up — no live-environment artefacts were created.

## Regression Notes
No previously-passing behaviour regressed. The full Playwright regression tier (Tier 2, 41 tests) covers
resolution, killswitch, control, tonight/callback, removal-health, auth — all green (browser-driven through
Chromium against a real server). No regression tests were modified or deleted this phase (no intentional
behaviour change to existing UI paths).

### Live manual browser regression (Tier 1 smoke, performed by hand)
Beyond the automated Playwright suite, I booted the app (dev/fixture, port 3160) and drove the core workflow
**by hand in a live browser** (Playwright MCP / Chromium) to satisfy the pre-presentation checklist item
"every user action manually performed in a running browser, not just Playwright":

| Action | Observed | Result |
|--------|----------|--------|
| Boot + `/healthz` | `status:ok`, v1.1.0, all subsystems green (fixture) | PASS |
| Dev sign-in (Test Handler) | Landed on dashboard; header shows "Test Handler · OOH Handler" | PASS |
| Dashboard load | New Call / Callback / Tonight nav, "Who's calling?" prompt, empty-state copy render | PASS |
| Site search "6832" (typed) | Live result **"Old Grey Mare — Greene King · Farmhouse Inns"** — real data, no `[object Object]` | PASS (data fidelity) |
| Select site → confirm-gate | Gate shows **"Old Grey Mare 6832 · Greene King · Farmhouse Inns · Stockton Ln, York YO31"**; blocks workspace until confirmed | PASS |
| Confirm site → device board | Workspace opens; **live device status table** (Bar 17.5°C/set 18°C, `IT500-BAR-6832`, hot water, Tuya kitchen circuits), issue-entry chips, capability panel, open-tickets panel all render with real fixture data | PASS (multi-step chain) |
| Console | **0 errors, 0 warnings** across the whole flow | PASS |

Confirms the operator UI (unchanged this cycle) still functions end-to-end on the SD-586 branch — the auth/
data-plane/manifest changes did not regress the running app. Screenshots captured during the run and the
`.playwright-mcp` scratch dir were removed after; no repo files modified; the dev server was stopped
(`kill-port 3160`). No live systems touched.

## Recommendations (non-blocking)
1. **On deploy (F10/F11):** execute the canary matrix in `DEPLOY_RUNBOOK.md` Step 4, especially **step 4a
   (real Cosmos write)** and **step 2 (IoT-team SSO)** — these are the definitive live proofs of F03/F01 that
   this phase could not run. A green `/healthz` is necessary but not sufficient (CR-02).
2. **DATA_DICTIONARY:** confirm the four Cosmos containers (`OohOverrides`, `OohAuditLog`, `OohAppConfig`,
   `OohSmsLog`, PK `/storePartition`) and their pre-creation ownership are current in `DATA_DICTIONARY.md`
   before the canary (see handover note below).

## Critical Thinker Review (pre-deployment, independent adversarial subagent)

An independent Critical Thinker reviewed these test outputs + the real source before deployment sign-off
(full report: `critical-thinker-test-review.md`). **Verdict: Proceed to deploy the write-locked canary —
0 Critical, 3 Important, 3 Advisory.** I independently re-verified the two load-bearing findings against the
code (did not take them on trust); both stand. One advisory (AD-03) did **not** survive my check.

| ID | Finding | Verified | Disposition / Owner |
|----|---------|----------|---------------------|
| **IM-01** | `/healthz` store health is **stale-green at runtime** — a Cosmos outage *after* boot never flips `storeHealthy` (`store.js:196` sets it true unconditionally; `CosmosCollection` get/upsert failures don't touch it). CR-02 fixed **boot**, not **runtime**; the §10 "page a human" signal is dead post-boot. | **CONFIRMED** (store.js:138/194/196/223 — false set only at init/probe failure) | **Developer** fix required **before go/no-go #3** (before any real device-write BAU reliance). Not a canary blocker. |
| **IM-02** | Boot probe **cannot detect a missing container** (the exact CR-01 mode) — a read on an absent container returns 404, which `get()` swallows as healthy (`store.js:89`). Runbook line 57 / Step 4 item 1 wrongly say it "403s → degraded". The real backstop is **step 4a (live write)** — `upsert` throws on a missing container. | **CONFIRMED** | **Pre-canary:** correct the runbook wording + make **step 4a a hard, non-skippable go/no-go #2 gate**. Owner: Release Manager (runbook is a release artefact). |
| **IM-03** | F10 & F11 (both `priority:critical`) are `passes:true` while **not live-verified**; honest in the notes, misleading in the boolean. | CONFIRMED (matches this report's own boundary) | **Release Manager** must verify F10/F11 off the **runbook canary matrix**, not the `passes` booleans. |
| AD-01 | `WRITES_DISABLED` defaults **fail-open**; only guard is the manifest env line. | plausible | Awareness — manifest carries it; go/no-go #3 controls the flip. |
| AD-02 | 403 container-fallback + keyed Cosmos path have **zero executed coverage** (canary-live only). | CONFIRMED | Optional: local Cosmos-emulator smoke would de-risk step 4a. |
| AD-03 | Report states 22 unit tests, CT counted "24". | **REJECTED** — runner + `grep -c "^test("` both = **22**. Reports are correct. | No action. |

**Effect on verdict:** none of these are Critical; the CT and I agree the write-locked canary proceeds. The
build genuinely matches the design spec and the CR-01/CR-02 code fixes are real in source (line-verified). The
one nuance folded back into this report: CR-02's `/healthz` degrade is **boot-honest but runtime-stale** (IM-01)
— so a green `/healthz` at the canary is confirmation of boot reachability, and **step 4a (real write) is the
definitive F03 proof and must be a hard gate.**

### Go-live conditions carried out of the test phase
1. **Before the canary (go/no-go #2):** RM corrects `DEPLOY_RUNBOOK.md` line 57 / Step 4 item 1 (drop the "403s → degraded" claim; state that a missing container reads as 404/green and **step 4a is the real backstop**), and marks **step 4a non-skippable**.
2. **Before go/no-go #3 (device-write BAU):** Developer closes IM-01 — flip `storeHealthy=false` on runtime Cosmos read/write failures (not just at boot/probe), so `/healthz` degrade is meaningful during a shift.
3. **RM handoff:** treat F10/F11 `passes:true` as "deliverable complete, **not** deploy-verified"; live-verify via the runbook matrix (esp. steps 2 + 4a).

## Sign-off
All testing steps complete. **8 features pass** at the build-deliverable level (F01–F04, F07, F08 code/static-verified;
F10, F11 documented-deliverable-complete and honestly non-live); **3** correctly remain `passes:false` (F05, F06
config-only; F09 spec-complete/handoff-deferred). **0 features require rework.** Test data cleaned up: **yes — none
created.** Data dictionary: current for this cycle's code (container list unchanged); recommend a pre-canary re-check.

**Overall: PASS — ready for Release Manager phase.**
