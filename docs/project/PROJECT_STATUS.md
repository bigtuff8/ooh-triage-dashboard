# IOT OOH Dash

> **▶ CURRENT STATUS (2026-08-26) — TIER-1 READ PATH COMPLETE & LIVE; one blocker remains: provisioning the tester role claim.**
> Tier-1 scope = chat/capture/escalate + device READ (control/writes are a separate later track). This session closed the last read-path gap: the bridge **site-search 503** (OOHDASH-66) is fixed, deployed as image **`5a9fd99`** and **verified live** (site 6261 → Salus iT700 with telemetry). Zendesk healthy; ThingsBoard `read:false` confirmed a harmless lazy flag (not a read blocker). GitHub `main` @ `a47a2b1` (PR #1 + PR #2 merged). Safety locks still ON (`WRITES_DISABLED=true`, `SMS_PROVIDER=log`, `DATA_MODE=live`, `AUTH_MODE=oidc`).
> **The one remaining Tier-1 blocker:** writing the OOH role claim. Testers authenticate fine but the app correctly 403s them (no `claimArea`). The claim lives in Cosmos account `airedale-knowledgebase` / DB `KnowledgeBase` / container `user`; James has Data **Reader** only (write test → 403 substatus 5302). Needs Spencer to grant James account/DB-scope **Cosmos Data Contributor** (then self-serve all future users via `scripts/provision-ooh-user.mjs`) or upsert the four `AreaClaim{1500}` docs — plus the four testers' confirmed login emails. Spencer on annual leave 2026-08-26 (~1-day wait).
> **➡ Authoritative Tier-1 current-state doc: `TIER1_READINESS_WRITEUP_2026-08-26.md` — read that first.** The 2026-08-19 banner + body below are retained as historical Phase-0 build/deploy record.
>
> **⏸ (2026-08-19) — DEPLOYED & LIVE; Phase-0 smoke BLOCKED on one Spencer action (he's on annual leave ~2 days, back ~2026-08-21).**
> v1.2.0 is **deployed and running** at https://ooh.airedale-group.io (image `452bf02` on branch `feature/go-live-sd586`), write-locked (`WRITES_DISABLED=true`, `SMS_PROVIDER=log`), Cosmos-connected. Machine smoke + SSO (implicit `id_token`) + token validation are all **verified live**. The app's authz gate works as designed. **The one remaining blocker:** the real-Cosmos-write hard gate needs a login whose B2C `extension_Role` carries `claimArea 1400` (→iot) or `1500` (→handler). James's own account has neither, so he can't drive the write path. **James emailed Spencer 2026-08-19 to provision it; Spencer is on AL ~2 days → resolution likely ~2026-08-21.** Until then Phase-0 smoke is parked.
> **Several build-time premises in the body below were CORRECTED by live testing** (B2C is secret-less **implicit `id_token`**, not public-PKCE; Zendesk is **Basic `email:password`**, not API-token; Cosmos is on the **PROD** account `airedale-knowledgebase`). **The authoritative current-state doc is `PHASE0_RESUME_HANDOVER_2026-08-19.md`** — read that first; treat the sections below as historical build-harness record.

**Status:** Build harness **COMPLETE — all four gates passed (design → dev → test → release)** on branch `feature/go-live-sd586` @ **v1.2.0** (HEAD `73560c6`; **branch pushed to GitHub** `github.com/bigtuff8/ooh-triage-dashboard` as backup/source-of-truth — **NOT merged to `main`, NOT deployed**; repo has no CI/CD so push ≠ deploy). Tested 63/0, Tester **PASS**, Critical Thinker pre-deploy **0-critical**. **Azure access GRANTED** by Spencer 2026-07-27 (reshaped least-privilege). **Next phase = deployment (post-harness, operational)** — awaits four Spencer actions (B1–B4) then the write-locked canary (go/no-go #2). Plan: **prove live via the canary FIRST, then merge to `main`** (keep `main` honest).
**Last Active:** 2026-08-19 *(deploy + smoke resume session; see banner above)*
**Quick Context:** Take the built-and-tested OOH Triage Dashboard live on the prod platform Spencer stood up (SD-586). The app was re-aligned to his secure model (public PKCE client, `AreaClaim[]` roles, keyless Cosmos via workload identity, `sa-ooh-dashboard`, real registry).

## Current State

- **Build complete + tested** on `feature/go-live-sd586` (cut from `feature/live-build-v1`; the earlier `feature/infra-alignment-v1` spike was **dismissed**, not used). **v1.2.0.** Features: F01 public OIDC client, F02 `AreaClaim[]` mapRole, F03 keyless Cosmos via WI + active boot store probe, F04 prod manifest, F07 tests. **Unit 22/22 + Playwright 41/41 = 63/0.** Tester PASS (0 rework); live manual browser regression clean; independent Critical Thinker (pre-deploy) 0-critical / 3-important (IM-01/02/03, all with owners) / 3-advisory.
- **Prod platform live (placeholder)** at **https://ooh.airedale-group.io** (DNS/TLS/ingress, B2C public client, `iot-services`, `sa-ooh-dashboard` + workload identity, Cosmos DB + AAD RBAC).
- **Azure access GRANTED (Spencer, 2026-07-27) — reshaped least-privilege:** KV **Secrets User (read)** on `airedale-kv-{uat,prod}`; **ACR Task Runner** (custom) on `apitechhub` (enables `az acr build`); **k8s SA `deployer-ooh` + namespace Role** via a scoped kubeconfig (can `kubectl set image` + read logs, not apply/create/read-secrets); **Cosmos DB Data Contributor** on `/dbs/ooh-dashboard` (James's user, for local runs). Kubeconfig sent 1:1.
- **Decisions locked:** SMS = Twilio (reuse IoT Support dash account); **Zendesk = Jonathan Wilkinson's existing creds** (subdomain `theairedalegroup`, email `jonathan.wilkinson@airedale-group.co.uk`, API token — **sent to Spencer 2026-07-27**; no service account); D-2 P1 deep-link = ingress exemption scoped to exact path `/` + signed HMAC token.

## Next Steps (go-live path)

**Awaiting Spencer (emailed 2026-07-27 — B1–B4):**
1. **B1 — pre-create 4 Cosmos containers** in db `ooh-dashboard`, PK `/storePartition`: `OohOverrides`, `OohAuditLog`, `OohAppConfig`, `OohSmsLog` (data-plane role can't create them; app no longer self-creates — CR-01).
2. **B2 — load `ooh-dashboard-secrets`** (incl. Jonathan's Zendesk creds now sent); James is read-only on the vault.
3. **B3 — confirm the in-cluster WI `id-ooh-dashboard-prod`** holds Cosmos Data Contributor on `/dbs/ooh-dashboard` + can read the secret (grants so far were to James's user).
4. **B4 — apply `k8s/deployment.yaml` once** (SA + WI label + `envFrom` secret) or confirm the placeholder already has all three (James's Role can only `set image`).
   - Also: read on `/dbs/ooh-dashboard` for the SD-330 dashboard identity (failed-revert panel).

**James:** save the kubeconfig → `~/.kube/ooh.yaml` (`chmod 600`, never commit).

**Then — the write-locked canary (go/no-go #2):** `az acr build` → `kubectl set image` → canary matrix incl. **step 4a real Cosmos write (HARD GATE)**; `WRITES_DISABLED=true` + `SMS=log` hold throughout.

**Post-canary gates:** go/no-go #3 (device writes — needs the **IM-01** store-health dev fix + SR-3 bench proof) · go/no-go #4 (live SMS Twilio + D-2 ingress exemption).

**Remaining dev (off critical path):** IM-01 — `/healthz` store health is boot-honest but stale at runtime; small Developer fix before go/no-go #3.

## How to Resume

1. Read this file, then the harness artefacts in `2026-07-27T12-29-00/`: `test-report.md`, `verification-report.md`, `critical-thinker-test-review.md`, `IMPACT_ASSESSMENT-spencer-access.md`.
2. `DEPLOY_RUNBOOK.md` (ordered deploy + canary matrix; Step 0 updated for Spencer's actual grants) + `DEPLOYMENT_REQUEST.md`.
3. App: `ooh-triage-dashboard/` on `feature/go-live-sd586` (`npm start` = fixture/dev). `handover/` = SD-586 specs + D-2 spec.
4. **Branch discipline for the next phase:** keep all go-live development on `feature/go-live-sd586` (push the branch to GitHub as you go). **Do NOT merge to `main` until the write-locked canary is proven live at go/no-go #2** — prove-live-first, then merge, then continue the staged unlock (go/no-go #3 device writes, #4 live SMS + D-2). Deployment is a deliberate ops sequence via `DEPLOY_RUNBOOK.md` (build image → `kubectl set image` → matrix), gated on Spencer B1–B4 + James go/no-go — confirm with James before any live action.

## Session Log

| Date | Summary |
|------|---------|
| 2026-07-27 | New workstream. Migrated OOH app + design out of Zendesk Integration. Read full Spencer trail + both SD-586 handover docs. Discovery: mapped built-vs-required delta; interactive shaping proposal. |
| 2026-07-27 | Discovery approved (SMS=Twilio reuse, P1 deep-link=exempt, Zendesk=Jonathan's creds). Confirmed deploy blocker = Techhub RBAC. (An out-of-process `feature/infra-alignment-v1` spike was **dismissed**.) |
| 2026-07-27 | **Design** gate: `design-spec.md` (change+ops, no UI change) + interactive Go-Live review; Critical Thinker 2-critical (CR-01 container pre-create, CR-02 /healthz false-green) both resolved in-spec. |
| 2026-07-27 | **Dev:** built F01–F04 + F07 on `feature/go-live-sd586` (6 commits). CR-01/CR-02/IM-01…04 addressed. 63/0. code-audit all PASS. Not pushed (deploy gate). |
| 2026-07-27 | **Test:** PASS (0 rework). Every feature ID + step traced (`verification-report.md`); live manual browser regression clean. Independent Critical Thinker pre-deploy review: 0-critical, 3-important (IM-01 runtime store-health, IM-02 runbook wording→fixed + step-4a hard-gated, IM-03 F10/F11 booleans). |
| 2026-07-27 | **Release (RM):** v1.2.0 committed `7d4b5f2` (local, not pushed); RELEASE_NOTES + DEPLOYMENT_REQUEST written; runbook IM-02 wording fixed. **Spencer GRANTED access** (reshaped least-privilege) + sent kubeconfig. Impact assessment produced. James sent Spencer the Zendesk creds + the B1–B4 asks. Build/design unaffected — deploy awaits Spencer's B1–B4 then the canary. |
| 2026-07-27 | **Release finalisation:** cleared a harness feature-clearance gate deadlock (F05/F06 needed `status:"deferred"` — James added it manually); re-ran unit 22/22; committed the previously-uncommitted v1.2.0 RELEASE_NOTES.md locally (`73560c6`). Checkpoint refreshed. Build harness cycle **COMPLETE**. Still not pushed — deploy gated on Spencer B1–B4 + go/no-go #2. |
| ~2026-08-13/14 | Deploy phase progressed against Spencer's live platform; live testing **corrected three build-time premises** — B2C = secret-less implicit `id_token` (not public-PKCE), Zendesk = Basic `email:password` (not API-token), Cosmos on PROD account `airedale-knowledgebase`. v1.2.0 deployed write-locked. See `PHASE0_RESUME_HANDOVER_2026-08-19.md` + `STATUS_2026-08-13_awaiting-spencer.md`. |
| 2026-08-19 | **Resume after workstation reboot (networking restored).** Found image `452bf02` was **not actually in ACR** despite prior handover note — rebuilt from clean `git archive` + pushed (digest `sha256:19ed973…`). Rolled `ooh-dashboard` to `452bf02` (old `b46d374` pod gone). **Machine smoke PASS** (implicit `id_token` in logs; `WRITES_DISABLED=true`/`SMS_PROVIDER=log`/`DATA_MODE=live`; `/healthz` cosmos healthy). **SSO verified live** — redirect `response_type=id_token`, sign-in renders, token validates (the AADB2C90079/id_token-disabled risk is CLEARED). **App authz gate confirmed working** — a no-role login is correctly 403'd. **BLOCKER:** real-Cosmos-write hard gate needs an account with `extension_Role` `claimArea 1400`/`1500`; James's account has neither. James emailed Spencer (on AL ~2 days, back ~2026-08-21) to provision it → **smoke parked**. Recorded on OOHDASH-6, CIR `OOH_DASHBOARD_DEPLOY.md`, and the resume handover. Non-blocking: `ZENDESK_PASSWORD` still not in `ooh-dashboard-secrets` (pod reports zendesk `configured:false`). |
