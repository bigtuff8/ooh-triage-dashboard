# Critical Thinker Review: IOT OOH Dash — Go-Live (SD-586), TEST phase / pre-deploy

**Date:** 2026-07-27
**Invoked at:** non-standard point — after TEST, immediately before the Release Manager / deployment.
**Artefacts reviewed:** `test-report.md`, `verification-report.md`, `code-audit.md`, `feature-list.json`, `progress.txt`, `.harness/checkpoint-test.json`, `design-spec.md`
**Source read (branch `feature/go-live-sd586`):** `config.js`, `services/auth.js`, `services/store.js`, `server.js`, `k8s/deployment.yaml`, `Dockerfile`, `package.json`, `test/mapRole.test.js`, `test/config.test.js`, `test/initOidc.test.js`
**Deploy docs read:** `DEPLOY_RUNBOOK.md`

## Summary

The build is genuinely faithful to the design-gate-approved spec, and the test phase is unusually honest: the deferred live boundary (F01 SSO, F03 keyless write) is stated plainly rather than faked, the unit tests assert behaviour (not source), and the CR-01/CR-02 code fixes from the design phase are actually present in the source — not just claimed. There are **no Critical blockers to the write-locked canary**: the one path that could carry unproven risk to production (device writes / live SMS) is held behind `WRITES_DISABLED=true` + `SMS_PROVIDER=log` in the git manifest and separate go/no-go gates, and deployment is physically gated by an external Azure RBAC grant that cannot be skipped.

The real weaknesses are in the **store-health monitoring signal**, not the app's functional behaviour. The CR-02 "false-green" fix is only correct **at boot** — I traced two ways the store still reports `healthy:true` when it is not: (a) at runtime a live Cosmos outage never flips the flag, and (b) the boot probe cannot detect the exact CR-01 failure mode (a missing container) it was sold as catching. Both are caught by the mandatory step-4a real-write canary check *if it is executed*, so they don't block the canary, but they mean the runbook's stated safety net and the §10 BAU paging signal are weaker than the reports claim. One reporting-integrity issue (two `priority:critical` features marked `passes:true` while not live-verified) is contained by the external gate but should not be read as deploy-proof.

**Rollout Readiness lens decision:** **Does not formally apply.** The RR lens (per my spec) targets harness infrastructure / Command Centre / agent tooling built for non-technical *operators of the harness*. This release is an application go-live; the non-technical OOH handlers are end-users of the app, not operators of the build/deploy process, and no harness-infra behaviour is being changed. I have therefore run the standard technical/operational review only. One RR-adjacent observation (the `passes:true` boolean being misreadable/game-able by a hurried gate) is folded into IM-03 rather than raised as an `RR-` finding.

---

## Critical Findings

**None.** No finding rises to "must fix before the write-locked canary can proceed." The device-write and live-SMS blast radius is held behind manifest levers + separate gates, and the deploy itself is externally gated (F10 RBAC). The Important findings below should be addressed on the timeline noted in each, but none blocks the canary.

---

## Important Findings

### [IM-01] `/healthz` store health is stale-green at runtime — a live Cosmos outage never flips it (CR-02 fix is boot-only)

**Dimension:** Operational Reality / Failure Modes
**What (`services/store.js:191-201`, `:213-227`, `:234-236`; `server.js:66-72`, `:126-129`):** The CR-02 remediation makes the store signal honest **only at boot**. `storeProbe()` runs once, from `server.js start()`. After that, `storeHealthy` is mutated in exactly two places: `initCosmos()`'s `.catch` (which runs at most once — `cosmosReady` is memoised) and, in `collection()`, an **unconditional** `storeHealthy = true` executed on *every* call after `cosmosReady` has resolved (`store.js:196`). The actual per-operation methods that touch Cosmos at runtime — `CosmosCollection.get/upsert/delete/query` (`store.js:85-128`) — do **not** update `storeHealthy` on failure. So if Cosmos (or the WI token path) goes down *after* a successful boot, every `collection()` call still sets `storeHealthy = true`, real reads/writes throw 5xx to the handler, and `/healthz` continues to report `subsystems.store.healthy: true`, `status: 'ok'`.
**Why it matters:** design-spec §10 names `store.healthy:false` as **one of only two signals that warrant a human page**. That signal is effectively dead for the most likely real-world incident: a runtime Cosmos/AAD outage at 2am. The pod stays "ok", no page fires, and OOH audit/SMS-log writes fail silently while a handler is mid-call. This is the same class of false-green CR-02 set out to kill — it was closed at boot and left open in steady state. (It does **not** endanger the short, observed canary, where writes are watched directly, which is why this is Important not Critical — but it must be fixed before BAU reliance.)
**Recommendation:** Before go/no-go #3 (BAU steady-state), either (a) run `storeProbe()` on a light interval (e.g. every 30–60s via a timer, mirroring `startLivenessMonitor()`), or (b) flip `storeHealthy = false` in the `catch` of the real `CosmosCollection` operations (on non-404 errors) so a runtime failure is reflected. Option (b) is cheaper and catches the real path. Do not rely on the current signal for paging until one is in place.

### [IM-02] The boot store-probe cannot detect a missing container — the exact CR-01 failure mode it was sold to catch reports `healthy`

**Dimension:** Implementation Fidelity / Failure Modes
**What (`services/store.js:85-92`, `:213-227`; `DEPLOY_RUNBOOK.md:57` and Step 4 item 1; `design-spec.md:190-191`):** `storeProbe()` proves reachability with `c.get('__ooh_health_probe__')`. `CosmosCollection.get()` catches `err.code === 404` and returns `null`, which the probe explicitly treats as **success** ("404 → null (still healthy)"). But a read against a **container that does not exist** also surfaces as a 404 in `@azure/cosmos` (collection-not-found, substatus 1003) — indistinguishable, by `err.code` alone, from "container exists, probe doc absent". So if Spencer's out-of-band container pre-creation (RB-3) is missed, the boot probe returns **healthy**, and `/healthz` shows green. Yet `DEPLOY_RUNBOOK.md:57` asserts "If they are absent at canary, first store access **403s** and the store reports **degraded** (see the active boot probe)", and design §4.1 lists "missing-container (CR-01)" among what the probe surfaces. A missing container **404s, it does not 403**, and the probe swallows it.
**Why it matters:** The runbook and design present the active boot probe as the automated safety net for CR-01. It is not — it is blind to precisely that case. The real (and only) backstop is the manual **step 4a real-write** in the canary matrix, where an `upsert` to a non-existent container will fail. If an operator trusts a green `/healthz` at Step 4 item 1 and treats 4a as optional confirmation, a missing-container deploy passes health and only fails when the first genuine OOH call tries to persist. The canary is safe **only if 4a is executed and gating**.
**Recommendation:** (1) Fix the wording in `DEPLOY_RUNBOOK.md` (Step 4 item 1 and line 57) and design §4.1 to state that a missing container reports **404/healthy** on the read probe and is caught **only** by step 4a's real write — do not claim the boot probe catches it. (2) Make step 4a a **hard, non-skippable go/no-go #2 line item**. (3) Optional hardening: have `storeProbe()` inspect the 404 substatus (collection-not-found ⇒ unhealthy) or perform a tiny throwaway write/read against one container so missing-container fails the probe honestly.

### [IM-03] Two `priority:critical` features carry `passes:true` while explicitly not live-verified — defensible in the fields, misleading in the boolean

**Dimension:** Cross-System Consistency / process integrity
**What (`feature-list.json` F10 `:158`, F11 `:175`; `test-report.md:57-58`; `checkpoint-test.json:26-29`):** F10 (Azure RBAC grant) and F11 (write-locked canary deployed & verified) are both `priority:critical` and both `passes:true`. F10 is `design_status:not_applicable` (an external human step) and F11's own note says "passes=true reflects 'build-phase deliverable complete'; it is **NOT** live-verified (canary not yet run)." The nuance *is* honestly captured — `status:deferred`, `deferredExternal:true`, and explicit notes — but the top-line boolean overloads two very different meanings ("deliverable authored" vs "verified working") onto the same `true` that F01–F04 use for code-verified passes. F11 is literally "canary deployed and verified end-to-end" marked passing before any deployment has occurred.
**Why it matters:** A Release Manager (or an automated gate) that reads "all critical features pass" can mistake this for "ready and proven to deploy." The practical blast radius is limited — deployment cannot physically proceed without the F10 RBAC grant, which is a hard external gate — so this will not cause an *accidental* unproven deploy. But it is a reporting-integrity gap: the green is louder than the evidence, and it is the kind of signal that gets waved through under time pressure.
**Recommendation:** The Release Manager phase must treat F10/F11 `passes:true` as "deliverable complete, **not** deploy-verified" and drive live verification off the runbook go/no-go #2 canary matrix, not off the feature-list booleans. Longer term, the harness would benefit from a distinct disposition (e.g. `deliverableComplete` vs `liveVerified`) so a `priority:critical` item cannot show a bare green while unproven. No code change; a gate-reading discipline + a one-line RM checklist item.

---

## Advisory Findings

### [AD-01] `WRITES_DISABLED` defaults fail-**open**, despite the "fail-safe by design" comment

**Dimension:** Failure Modes / Tech Debt
**What (`config.js:83`):** `writesDisabled: env('WRITES_DISABLED') === 'true'` — an unset/misspelled env resolves to `false` (writes **allowed**). The adjacent comment calls this "Fail-safe by design." It is fail-safe only because the manifest hardcodes `"true"` and reaching a live device write also requires full live credentials; the *default* itself is permissive.
**Why it matters:** The single control protecting "no device writes during canary" is the manifest env line (`deployment.yaml:68-69`). If that env is ever dropped/renamed during a manifest edit, writes silently re-enable with no boot-time complaint. Low likelihood, high consequence.
**Recommendation:** Leave the canary behaviour as-is (manifest sets it), but consider inverting the default to blocked-unless-explicitly-`'false'`, or add a boot log line asserting the effective write-lock state so an accidental drop is visible. Also correct the comment — the current default is fail-open, not fail-safe.

### [AD-02] The only real proofs of the changed data/auth paths are canary-live; no local integration coverage exists for `initCosmos`

**Dimension:** Failure Modes / test coverage
**What:** `initCosmos()` (WI credential selection, the `client.database()` handle, the 403-tolerant container fallback) and the public-client token exchange are exercised **only** at the canary — correct per §6.5, but it means the container-fallback branch (`store.js:177-183`) and the keyed-vs-keyless selection have **zero** executed coverage before live. Combined with IM-02, the first time any of this runs for real is against prod Cosmos.
**Why it matters:** Not a defect (WI/AAD genuinely can't be faked in fixture mode), but it concentrates all risk into step 4a. A local **Cosmos emulator** run could exercise the keyed path, the container handle, and the missing-container behaviour (validating the IM-02 fix) before touching prod.
**Recommendation:** Optional pre-deploy hardening: a one-off emulator smoke of `initCosmos()` + a real read/write, to de-risk step 4a. Not a blocker; the WI/B2C legs still prove out only at the canary.

### [AD-03] Minor unit-count drift in the reports

**Dimension:** Cross-System Consistency
**What:** `verification-report.md:22` and `test-report.md` state "22/22 (mapRole 12, validateConfig 8, initOidc 2)". The actual files hold 13 `mapRole` cases (`test/mapRole.test.js`), 9 `validateConfig` cases (`test/config.test.js`), 2 `initOidc` — 24 blocks. The totals green regardless; only the breakdown is off.
**Why it matters:** Trivial, but in an otherwise scrupulously-traced report it's the kind of drift worth a 10-second correction so the evidence stays trustworthy.
**Recommendation:** Re-run `node --test` and paste the actual counts; correct the breakdown.

---

## Design Strengths

- **The `/healthz` degraded-but-200 inference is sound for `replicas:1`** (`server.js:62-72`). The Developer correctly reasoned that, since both liveness and readiness hit `/healthz` and there is a single replica, a non-2xx on a transient Cosmos blip would restart/deregister the only pod — a full outage plus forced re-SSO — worse than serving a degraded app whose device board still reads from the bridge. Body-level degrade keeps the state visible without weaponising the probe. This is the right call. (Its value depends on `storeHealthy` being accurate — see IM-01 — but the probe design itself is correct.)
- **The CR-01 code fix is real and correctly shaped:** no `databases.createIfNotExists`, a plain `client.database()` handle, and a 403/Forbidden-tolerant container fallback (`store.js:162-183`) — matching the data-plane-only RBAC reality.
- **`mapRole` hardening is genuinely robust** (`auth.js:78-91`): `try/catch` on `JSON.parse`, array coercion, `String(c?.claimArea ?? c)` avoiding `[object Object]`, deterministic `iot > handler` precedence, and 13 unit cases covering the real B2C string shape plus every malformed/legacy edge — all resolving to `null` (the 403 path) without throwing.
- **Honest verification boundary.** The test/verification reports and the checkpoint distinguish code-verified from canary-only from external-deferred and refuse to fabricate a live proof — exactly the posture that makes a pre-deploy review tractable.
- **The `@azure/identity` supply-chain fix is enforced, not just documented:** first-class dependency + lockfile + a Dockerfile `require.resolve` build guard (`Dockerfile:11`) that fails the image loudly if it regresses.
- **Defence-in-depth preserved end-to-end:** fail-secure boot (`config.js:132-140`), server-side authz unchanged, same-origin guard, hardened cookies, and the canary write-lock + SMS-log levers held auditably in git.

---

## Recommendation

**Proceed to deploy the write-locked canary — no Critical blockers.** Before the canary: correct the runbook/design wording that overstates the boot probe (IM-02) and confirm step 4a (real Cosmos write) is a hard, non-skippable go/no-go #2 gate. Before go/no-go #3 (BAU steady-state): close the runtime store-health staleness (IM-01) so the §10 paging signal actually fires. Have the Release Manager treat F10/F11 `passes:true` as "deliverable complete, not deploy-verified" (IM-03) and verify live off the runbook matrix, not the feature-list booleans.
