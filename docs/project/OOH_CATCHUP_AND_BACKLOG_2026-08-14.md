# OOH Triage Dashboard — Catch-Up & Backlog Paper
*Prepared for James Brown · 14 Aug 2026 · single reference before seeding the Jira project*
> **Jira:** OOHDASH board seeded 14 Aug — 62 issues across 4 epics: OOHDASH-1 (Deploy & Pilot), OOHDASH-16 (Full Rollout & Hardening / Phase 2 → Sprint 3), OOHDASH-23 (Bugs & Security → backlog), OOHDASH-35 (Product Roadmap → backlog). Ticket keys annotated against each item below.

---

## 0. TL;DR — read this first

- **The app is done.** OOH Triage Dashboard **v1.2.0** is built, tested (**63/63 pass**), independently pre-deploy reviewed (**0 critical**), on branch `feature/go-live-sd586` (HEAD `73560c6`). **Not merged to `main`, not deployed** — there's no CI/CD, so the GitHub push is a backup, not a release.
- **The platform is live** as a "coming soon" placeholder at **https://ooh.airedale-group.io**. Spencer's platform ticket **SD-586 is closed/Done**.
- **Spencer's 14 Aug 07:33 reply cleared the gate to deploy.** Both your asks are addressed: SD-330 Cosmos grant narrowed to `OohOverrides` only (**done**); Jonathan's Zendesk token loaded — **but it doesn't authenticate** (wrong token type — see §7).
- **Release approach revised (14 Aug):** the formal write-locked **canary gate is dropped** — risk is managed **operationally by rolling out to ~2 pilot handlers first, then widening**. Fastest path to working is the priority. See the revised phased plan in §7.
- **The single next action (Phase 0):** confirm Spencer's infra prereqs (B1/B3/B4), fix the Zendesk Bearer auth, build + `set image`, smoke-test (incl. a 30-sec real-Cosmos-write check), merge to `main`.
- **Separate live bug** to clear at rollout: the Service Bus listener is dead-lettering every message (~31 in DLQ); Spencer wants your handler error logs.

---

## 1. What the project is

An authenticated operations console for the **answering-service call handlers who take equipment-fault calls at 2am**, when the IoT support team is off. It turns a phone call into a guided, safe, fully-recorded triage session.

**What it does (delivered v1.0.0 → v1.2.0):**
- **Guided call handling** — confirmed-site workspace, live device board, smart issue entry, 8 category tiles, a "Tonight" shift view.
- **Real device control** (currently write-locked) — heating setpoint, frost-hold off, hot-water boost — all through the single **SD-492 ThingsBoard `*Desired` shared-attribute write path**. "Applied" shows only when the device echoes back; pending/failed/rejected/timeout are first-class states.
- **Everything lands on a ticket** — every outcome writes an `ooh`-tagged Zendesk ticket with a timestamped `[TRG]` transcript, and reconciles the originating Zendesk Talk call ticket.
- **P1 escalation** — dispatches an SMS (log-only until the gateway is live) with a deep-link into the SD-330 IoT Support dashboard.
- **Safety rails** — blocking site-confirmation gate, server-side guardrails, durable timed overrides that survive restarts and revert exactly once, and a runtime write kill-switch with mandatory reason.

**How it fits the estate:**
- **SD-330 IoT Support Dashboard** — the separate, already-live daytime dashboard. It's the **frozen consumer**; OOH is the **producer**. SD-330 reads OOH's `ooh`-tagged tickets and its Cosmos `OohOverrides` store (failed-revert panel); OOH's P1 SMS deep-links into SD-330. **Do not change SD-330** — the one agreed cross-product change is the D-2 ingress exemption.
- **integration-bridge** (in-cluster) — the device read API; OOH reaches it as a sibling pod.
- **ThingsBoard / IoT bridge** — the device control plane OOH drives (read via `svc-read`, write via the scoped SR-3 `svc-control` credential).

**Users:** OOH handlers (role `handler`) and the IoT team (role `iot`).

---

## 2. Roadmap & how we got here

| Version | Date | Cycle | Delivered |
|---|---|---|---|
| **v1.0.0–1.0.2** | 2026-07-11 | Live build | Read-only prototype → full authenticated product: guided handling, real device control (SD-492 path), truth-first sync tracking, safety rails, ticketing, P1 escalation, B2C OIDC auth, ops (Dockerfile, K8s, `/healthz`). 41 Playwright, 0 fail. |
| **v1.1.0** | 2026-07-14 | Producer conformance | Exact conformance to the frozen SD-330 consumer contract: full `[TRG]` transcript, call-ticket reconciliation/auto-merge, "Support Request" category, deploy-time write-lock, producer-liveness monitoring. UI unchanged. |
| **v1.2.0** | 2026-07-27 | **SD-586 go-live build** | Re-pointed the app from the old infra model to Spencer's secure prod model. F01 public PKCE OIDC client (no secret), F02 `AreaClaim[]` role mapping, F03 keyless Cosmos via workload identity, F04 prod manifest, F07 unit suite. UI untouched. |

**The SD-586 harness cycle (all 27 Jul):** Discovery (found the app was built to the *old* infra model; Spencer stood prod up on a more secure one) → Design (2 criticals resolved in-spec: containers must be pre-created; `/healthz` was false-green) → Dev (F01–F04+F07, 63/0) → Test (**PASS, 0 rework**; independent pre-deploy review 0 critical / 3 important / 3 advisory) → Release (v1.2.0 committed, Spencer granted Azure access + sent kubeconfig, branch pushed). Deployment left as a post-harness operational step gated on Spencer + your go/no-go.

Since 27 Jul the deploy gate narrowed: the original four asks (B1–B4) were reduced by your **10 Aug email** to just two, which is what Spencer's 14 Aug reply answers.

---

## 3. What's completed

**Build & tests (v1.2.0):** Unit 22/22 + Playwright 41/41 = **63/0**. Tester **PASS (0 rework)**. Independent pre-deploy review **0 critical** (3 important IM-01/02/03, 3 advisory). Live manual UI regression clean.

**Security / auth model (the v1.2.0 realignment is a security *improvement*):**
- **F01 Public PKCE OIDC client** — shared `Techhub-Production` B2C client, no secret; redirect `https://ooh.airedale-group.io/auth/callback` registered.
- **F02 `AreaClaim[]` roles** — `mapRole` keys on `claimArea` int (**1500 → handler, 1400 → iot**), `iot > handler` precedence, malformed → null. IoT team already carry `1400`, so map automatically.
- **F03 Keyless Cosmos** — workload identity; pod runs as `sa-ooh-dashboard` federated to `id-ooh-dashboard-prod`, Cosmos Data Contributor scoped to `/dbs/ooh-dashboard`.
- **F04 Prod manifest** — `sa-ooh-dashboard`, WI label, `replicas:1`, canary levers `WRITES_DISABLED=true` + `SMS_PROVIDER=log` held **in git**.

**Platform (Spencer, live):** URL/DNS/TLS/ingress at `ooh.airedale-group.io`; `iot-services` namespace; `sa-ooh-dashboard` + WI; Cosmos DB `ooh-dashboard` + AAD RBAC (keyless); B2C public client + callback.

**Your Azure access (granted 27 Jul, least-privilege):** Key Vault Secrets User (read-only — Spencer loads secrets, you can't); custom ACR Task Runner on `apitechhub` (so `az acr build` works); k8s SA `deployer-ooh` via scoped kubeconfig (you can `set image` + read logs/rollout, but can't apply/create/delete/read-secrets); Cosmos Data Contributor on `/dbs/ooh-dashboard` (your user, local runs only).

**Locked config decisions:** SMS = Twilio reusing the IoT-dash account; Zendesk = Jonathan Wilkinson's existing creds (no service account this release); D-2 deep-link = ingress exemption scoped to exact path `/` + signed HMAC token.

---

## 4. Where we got stuck — the deployment gate

You can't "just deploy" because it's a **self-serve model on infrastructure you don't fully control**:

- **Spencer owns Azure / AKS / Key Vault / Cosmos control-plane / B2C.** He handed *deployment* to you as a self-serve act (`az acr build` → `kubectl set image`). **No CI/CD** — pushing the branch does nothing.
- **Data-plane vs control-plane is the crux.** Your Cosmos "Data Contributor" role can CRUD *items* in an *existing* container but **cannot create** containers (control-plane). So the four containers (`OohOverrides`, `OohAuditLog`, `OohAppConfig`, `OohSmsLog`, PK `/storePartition`) **had to be pre-created by Spencer**. The app tolerates a 403 so a missing DDL permission never bricks boot.
- **You also can't load the secret or reshape the deployment** — your k8s Role can only `set image`. Spencer must load `ooh-dashboard-secrets` and ensure the placeholder deployment carries `sa-ooh-dashboard`, the WI label, and `envFrom: ooh-dashboard-secrets`.

**The reduced two-ask gate (your 10 Aug email):** (1) load Jonathan's Zendesk token into `ooh-dashboard-secrets`; (2) narrow `id-iot-support-frontend-uat`'s Cosmos Data Reader to `OohOverrides` only. Your gating line: *"I'll flip the image once you confirm Jonathan's token is loaded and the SD-330 grant is narrowed."* Spencer's 14 Aug reply is that answer (§7).

> ⚠️ **Pre-flight check (doc ambiguity):** the local docs record the *reduced* two-ask gate but don't explicitly log when **B1** (4 containers created), **B3** (in-cluster WI holds Cosmos Data Contributor + secret read), and **B4** (placeholder carries SA/WI-label/`envFrom`) were closed. You presumably confirmed these when you narrowed the gate — but since canary step-4a and fail-secure boot depend on them, **re-confirm B1/B3/B4 with Spencer before the canary** if you want certainty.

---

## 5. The canary — explained plainly *(retained as background; superseded as a gate)*

> **Superseded 14 Aug.** James has dropped the formal write-locked canary + go/no-go ladder as a release gate — risk is now managed operationally by limited-audience pilot (§7). This section is kept only because it explains the platform mechanics and the **one idea we retained**: a green `/healthz` doesn't prove keyless Cosmos writes work, so a quick real-write check survives as a *smoke step* in Phase 0. Skip to §7 for the live plan.

**What "canary" means generally:** a cautious release — roll the new version out in a limited, closely-watched way, prove it behaves, then let it take full responsibility. Named for the coal-mine canary: a safe early-warning probe. If it shows a problem, you back out before anything real is harmed.

**This canary is a safety *mode*, not a separate environment.** When you flip the image the app goes live on the real prod platform (real B2C sign-in, real domain, real prod Cosmos, real bridge reads) but with two hard levers set **in the git manifest** so it can't do anything irreversible:
- **`WRITES_DISABLED=true`** — no device writes; every write path hits a synchronous block first.
- **`SMS_PROVIDER=log`** — P1 escalations are logged, not sent.

So it proves the whole chain — sign-in, roles, board reads, ticket creation, Cosmos persistence — with **zero risk of a real device change, a real text, or an unwanted real ticket** at 2am.

**The canary matrix (your go/no-go #2)** — walk `DEPLOY_RUNBOOK.md` Step 4 in order:
1. `GET /healthz` → 200, subsystems green *(see caveat)*.
2. **SSO with an IoT-team account first** (they carry `1400 → iot`) — proves public-client + `AreaClaim[]` parse without needing handler accounts yet.
3. Device board renders live bridge reads.
4. One non-P1 canary call → an `ooh`-tagged Zendesk ticket with `[TRG]` transcript, visible in the SD-330 OOH Review queue.
5. **Step 4a — REAL Cosmos write proof — HARD GATE, NON-SKIPPABLE.**
6. Confirm no device write occurred (`WRITES_DISABLED`) and P1 only logged (no SMS).
7. Confirm call-ticket reconciliation.
8. Clean up canary tickets + store docs.

**Why step 4a is a hard gate (the key point):** a green `/healthz` is necessary but *not* proof that keyless Cosmos writes work. Two known limits: a **missing container reads as green** (a point-read 404s → swallowed as "not found → healthy" — IM-02), and the **health flag is boot-honest but stale at runtime** (IM-01). The only reliable proof is a **real write** — an `upsert` against a missing/mis-permissioned container throws. So an observed real Cosmos write must succeed before #2 passes. If it throws: 404 → a container wasn't created; 401/403 → the in-cluster WI token/RBAC is wrong. Stop and fix.

**The go/no-go ladder:**

| Gate | Flips | Precondition |
|---|---|---|
| **#2 — canary** | Deploy app (write-locked) | Spencer's asks closed; matrix green **incl. step 4a real write** |
| **#3 — device writes** | `WRITES_DISABLED=false` | SR-3 scoped TB write cred bench-proven **+ IM-01 fix** |
| **#4 — live SMS** | `SMS_PROVIDER=twilio` + creds | Twilio creds + on-duty number **+ D-2 ingress exemption**, phone-verified |

You're at **#2**.

---

## 6. What Spencer's 14 Aug email unlocks

Replied **Fri 14 Aug 07:33** on the deployment thread (CC Sam Day):

- **ASK 2 — SD-330 Cosmos grant narrowed to `OohOverrides` only: DONE.** The other three containers are now invisible to that identity. Closed (this was OQ-6).
- **ASK 1 — Zendesk token loaded, but does NOT authenticate.** It's a **`scapi_` OAuth-style token** — wrong shape for the app's classic `email/token` basic-auth flow. Fails as basic auth (`401 "Couldn't authenticate you"`) and as Bearer (`401 invalid_token`). His fix: **change the app to `Authorization: Bearer <token>`**, AND **confirm with Jonathan the token is complete/active** (the Bearer 401 suggests truncation or an un-activated token).
- **Canary is GO regardless:** *"None of this blocks the canary — you're running WRITES_DISABLED + SMS=log, so nothing calls Zendesk yet — you can flip the image and run the write-locked canary now."*

**Distinguish clearly:**
- **Canary (#2) = GO now.** Nothing in the Zendesk problem blocks it.
- **Full go-live (lifting the write-lock / real ticketing) = still blocked** on the Zendesk auth fix (Bearer switch + valid token), then Spencer re-runs his 401→200 check.

> **Decision to make:** canary matrix **step 4** creates a *real* `ooh` Zendesk ticket, so with the broken token that one step will fail even though the rest passes. Either **fix the Bearer auth first** so step 4 passes too, or **run the canary now** and treat the Zendesk-ticket step as expected-to-fail-until-fixed. My recommendation: do the small Bearer change first (it's low-risk and lets you run a clean, fully-green canary once), unless you want the platform proof today.

---

## 7. Revised release plan (14 Aug — operational pilot, not canary gate)

**Rationale.** The old plan gated go-live behind a formal write-locked canary matrix and a three-rung go/no-go ladder — ceremony to manage risk via feature-flags before any real user touched it. New steer: **risk is managed by audience size** — deploy the real app, put it in front of **~2 pilot handlers**, then widen. Fastest path to working wins. The only thing kept from the canary is a **30-second "does a real Cosmos write persist" smoke check** (a green `/healthz` can lie — a missing container reads as healthy), done during deploy, *not* as a gate.

**Honest split — real prerequisite vs removed ceremony:**
- *Real functional prerequisites (cannot skip):* containers exist + in-cluster WI holds the Cosmos grant + secret read (B1/B3/B4); Zendesk Bearer fix (else ticketing silently 401s); pilot handler B2C accounts + `claimArea:1500` (handlers can't sign in otherwise); SR-3 write cred **only if** live device control is wanted; Twilio + on-duty number **only if** live P1 SMS is wanted.
- *Removed ceremony:* the write-locked canary gate, the go/no-go ladder, canary-matrix ordering + ticket-cleanup choreography, and monitoring hardening a 2-user pilot doesn't need yet (producer-uptime, P1-SLA metric).

### Phase 0 — Deploy & smoke *(shortest path to live + provably working)*
1. **Re-confirm infra prereqs with Spencer** — B1 (4 Cosmos containers), B3 (in-cluster WI holds Cosmos Data Contributor + secret read), B4 (placeholder carries `sa-ooh-dashboard` + WI label + `envFrom`). *Never explicitly logged as done — biggest chase-now item.* **[Spencer]**
2. **Fix Zendesk auth** — switch client to `Authorization: Bearer <token>` **[James]**; Jonathan confirms the `scapi_` token is complete/active **[Jonathan]**. Without this every ticket write 401s.
3. **Build + set image** — `az acr build` → `kubectl set image`, quiet hours (`replicas:1`, brief pod drop + re-SSO). **[James]**
4. **Lightweight smoke** — sign in, board renders live reads, one non-P1 call creates a real `ooh` ticket, and **confirm a real Cosmos write persisted** (404 → missing container; 401/403 → WI RBAC wrong). **[James]**
5. **Merge `feature/go-live-sd586` → `main`** once smoke passes. **[James]**

### Phase 1 — Pilot (2 users)
- **Create 2 B2C handler accounts + `claimArea:1500`** for just those users. **[Spencer/James]**
- **Device writes:** default **OFF** (`WRITES_DISABLED=true`). ON only if you want live control in the pilot — requires **SR-3 scoped TB write cred, bench-proven** first. **[James]**
- **P1 SMS:** default **OFF** (`SMS_PROVIDER=log`). ON only if you want live texts — requires **Twilio config + on-duty number**. **[James]**
- **Recommended minimal first pilot: writes OFF, SMS log-only** — proves sign-in, roles, board, ticketing + reconciliation with real handlers at zero irreversible-action risk; needs neither SR-3 nor Twilio.
- Cheap safety fix before any real write is ever enabled: **C1 (AD-01 `WRITES_DISABLED` fail-open default)** — invert to blocked-unless-`'false'`. **[James]**

### Phase 2 — Widen to full rollout
- Onboard **all** handler accounts + `1500` claims (rest of A11).
- Turn on deferred capabilities: device writes (SR-3 proven + **IM-01 health fix** so post-boot Cosmos outage flips to degraded); live SMS (Twilio + on-duty number).
- **D-2 ingress exemption** for the P1 deep-link — exact path `/` + valid signed HMAC token (C7/E3), never "any `?ticket=`". **[Spencer]**
- **A6** — SD-330 read grant on `dbs/ooh-dashboard` (failed-revert strip).
- Health/monitoring hardening: IM-01 (B1), Service Bus DLQ bug + send Spencer the handler logs (A12/B3), producer-uptime (B5), P1-SLA write path (B4).

### Phase 3+ — Roadmap & hardening
- Product roadmap (all D-items) — read-only quick wins (D6/D7/D10/D11), high-value flows (D1/D5/D9/D14/D15), AI/automation (D4/D19/D20), alerting (D3). **Reconcile D4/D14/D19 against IOTD-43/44/45/46 before creating.**
- Remaining bug/security backlog (B2/B6, C2/C4/C5/C6/C8) + open decisions (E-items; E1 before finalising the manifest).
- **C3 (rotate compromised Lighthouse/Tuya login + IoT WiFi password)** — High-priority security but **independent of the OOH deploy; action now** regardless of pilot timing. Don't let phasing bury it.

### Phase → backlog mapping
| Item | Phase | Note under new approach |
|---|---|---|
| A1, A3, A4 (infra prereqs) **[OOHDASH-3]** | 0 | Real prereqs — re-confirm with Spencer |
| A2 (secret loaded) | 0 | Done mechanically; token broken → B7 |
| B7 (Zendesk Bearer) **[OOHDASH-2]** | 0 | Real prereq for ticketing |
| A7 (deploy + merge) **[OOHDASH-5 + OOHDASH-7]** | 0 | Was "run canary"; now build/set-image/smoke/merge |
| A5 (SD-330 narrow) | — | **DONE 14 Aug** |
| A11 (2 users) **[OOHDASH-8]** | 1 | Real prereq — pilot can't sign in otherwise |
| C1 (fail-open default) **[OOHDASH-12]** | 1 | Cheap safety fix before any real write |
| A9 (SR-3 cred), A8 (writes on), A10 (SMS on), E2 (on-duty number) | 1 *(if that capability ON)* / else 2 | Was go/no-go #3/#4 → now capability toggles |
| A11 (all handlers), A6, B1 (IM-01), A12, B3, C7/E3, B4 | 2 | Widen + hardening |
| B5 **[OOHDASH-28]** | 2 | **De-prioritised** — 2-user pilot doesn't need it |
| B2 (IM-02) **[OOHDASH-25]** | 3+ | **De-prioritised** — real-write smoke covers it |
| B6, C2, C4, C5, C6, C8, D1–D27, E1/E4–E10 | 3+ | Roadmap / hardening / decisions |
| C3 **[OOHDASH-15]** | **Now, independent** | Security — action regardless of OOH phasing |
| F (existing SD/IOTD IDs) | all | **Link, don't clone** |

**Removed / made unnecessary:** the canary matrix + go/no-go ladder ceremony; B2 (real-write smoke replaces it); B4/B5 monitoring at pilot scale; C6 single-replica outage mitigation (acceptable blip at pilot scale).

---

## 8. Candidate backlog for the new Jira project

Mined from **every** project doc (root, `ooh-triage-dashboard/`, the older `OOH Dashboard/` design folder, `discovery/`, `handover/`, the 27 Jul harness folder, and the SD-330 remediation worktree). De-duplicated. **Section F already have Jira IDs — link, don't recreate.** Priorities are suggestions.

### (A) Deploy / go-live critical path

| # | Title | Type | Pri | Owner | Why |
|---|-------|------|-----|-------|-----|
| A1 | Pre-create 4 Cosmos containers (verify) **[OOHDASH-3]** | Ops/Spike | High | Spencer | Canary step-4a fails without them |
| A2 | Load `ooh-dashboard-secrets` incl. Zendesk token **[OOHDASH-4 / OOHDASH-2]** (Spencer-loaded) | Ops | High | Spencer | Done mechanically; token broken (see B7) |
| A3 | Verify in-cluster WI holds Cosmos Data Contributor + secret read **[OOHDASH-3]** | Spike | High | Spencer | Pod authenticates as WI, not your user |
| A4 | Confirm placeholder deployment carries SA + WI label + `envFrom` **[OOHDASH-3]** | Ops | High | Spencer | Bare placeholder would boot with no WI/secrets |
| A5 | Narrow SD-330 identity Cosmos read to `OohOverrides` **[DONE 14 Aug — no ticket]** | Security | Med | Spencer | **DONE 14 Aug** |
| A6 | SD-330 read grant on `dbs/ooh-dashboard` (failed-revert strip) — OQ-6 **[OOHDASH-22]** | Feature | Med | Spencer | The one real cross-product infra item |
| A7 | Run canary (go/no-go #2) + merge to `main` **[OOHDASH-5 + OOHDASH-7]** | Spike | High | James | Definitive live proof of F01 SSO + F03 keyless write |
| A8 | go/no-go #3 — open device writes **[OOHDASH-19]** | Decision | High | James | After SR-3 + IM-01 |
| A9 | SR-3 scoped ThingsBoard write cred + bench proof **[OOHDASH-18]** | Security/Spike | High | James | Hard gate before any live device write |
| A10 | go/no-go #4 — live SMS + on-duty number **[OOHDASH-20]** | Decision | Med | James | Flip to real Twilio |
| A11 | Create B2C handler accounts + author `claimArea:1500` claims **[OOHDASH-8 (2 users) + OOHDASH-17 (all)]** | Feature | High | Spencer/James | Handlers can't sign in until this exists |
| A12 | Send Spencer the Service Bus listener error logs **[OOHDASH-26]** | Task | High | James | Unblocks the DLQ investigation (B3) |

### (B) Known bugs / issues

| # | Title | Type | Pri | Why |
|---|-------|------|-----|-----|
| B1 | IM-01 — `/healthz` store health stale-green at runtime **[OOHDASH-24]** | Bug | High | Post-boot Cosmos outage never flips to degraded; fix before go/no-go #3 |
| B2 | IM-02 — boot probe can't detect a missing container (404/green) **[OOHDASH-25]** | Bug | Med | Optional hardening: inspect 404 substatus or throwaway write |
| B3 | Service Bus listener dead-lettering every message (31 in DLQ) **[OOHDASH-26]** | Bug | High | NS→Zendesk sync listener; root-cause the handler catch |
| B4 | P1-claim SLA metric not live-measurable (`OohP1AckAt` no write path) **[OOHDASH-27]** | Bug/Tech-debt | Med | "P1 claimed within 15 min" reports null; null must not read as "met" |
| B5 | Layer-1 producer-uptime monitoring (dead vs idle producer) **[OOHDASH-28]** | Tech-debt | Med | In-process self-check can't detect its own death |
| B6 | Unit-count drift in reports (22 vs 24 breakdown) **[OOHDASH-29]** | Doc | Low | Trivial wording only |
| B7 | **Zendesk `scapi_` Bearer-auth mismatch** **[OOHDASH-2]** | Bug | High | **CONFIRMED from Spencer's 14 Aug email** — switch app to Bearer; blocks write-lock lift |

### (C) Security & audit findings

| # | Title | Type | Pri | Why |
|---|-------|------|-----|-----|
| C1 | AD-01 — `WRITES_DISABLED` defaults fail-open **[OOHDASH-12]** | Security/Tech-debt | Med | Invert default to blocked-unless-`'false'`; fix misleading "fail-safe" comment |
| C2 | AD-02 — no local integration coverage for `initCosmos` **[OOHDASH-30]** | Test | Low | Cosmos-emulator smoke to de-risk step 4a |
| C3 | **Rotate compromised Lighthouse/Tuya login + IoT WiFi password** **[OOHDASH-15]** | Security | High | Shared in plaintext in WhatsApp 9 Feb 2026 — treat as compromised |
| C4 | Secure role-gated credential lookup + policy **[OOHDASH-31]** | Security/Feature | Med | Stop plaintext WhatsApp/Teams cred sharing (root cause of C3) |
| C5 | Move TB + Zendesk creds to Key Vault via WI **[OOHDASH-32]** | Security/Tech-debt | Med | Only Cosmos went keyless this release |
| C6 | Shared session store (remove `replicas:1` / brief outage on deploy) **[OOHDASH-33]** | Tech-debt | Med | In-process `express-session` forces single replica |
| C7 | `IOT_DASH_LINK_SIGNING_SECRET` + append `&k={hmac}` to P1 SMS link **[OOHDASH-21]** | Security/Feature | Med | D-2 signed-token option; gated to go/no-go #4 |
| C8 | AD-07 — populate `OOH_OPERATOR_AGENT_MAP` **[OOHDASH-34]** | Tech-debt | Low | Reconciliation robustness where Zendesk name ≠ app name |

### (D) Deferred / phase-2 features (the product roadmap — richest source of tickets)

| # | Title | Pri | Why / source |
|---|-------|-----|--------------|
| D1 | Callback / follow-up lookup flow (C9) **[OOHDASH-36]** | High | Full spec exists (`CALLBACK_LOOKUP_DESIGN.md`), not built; ~7–9 sessions |
| D2 | Deterministic comment/status translation layer **[OOHDASH-37]** | Med | Zendesk technical notes → caller-friendly scripts; prereq of D1 |
| D3 | Escalation alerting: WhatsApp + automated phone call for P1 chase **[OOHDASH-38]** | Med | Twilio Voice; production requirement |
| D4 | AI/LLM integration (Claude SDK) — gap-fill, dynamic scripts, translation, suggestions **[OOHDASH-39]** (links IOTD-43/45) | Med | Strategic; reduce triage load; human approval for actions |
| D5 | Per-site scope-determination ("what Lighthouse controls here") (C4) **[OOHDASH-40]** | High | 12% of volume; kills "is this ours?" escalations |
| D6 | Schedule viewing/verification + export (C7) **[OOHDASH-41]** | Med | Read-only, zero-risk |
| D7 | Device/connectivity status visibility (online/offline/last-seen) (C8) **[OOHDASH-42]** | Med | Read-only; "offline = check fuse board" |
| D8 | Shift notices / broadcast panel (C10) **[OOHDASH-43]** | Med | Pre-shift heads-up from IoT mgmt |
| D9 | Contractor-on-site flag + directory (C5) **[OOHDASH-44]** | High | Highest-stakes calls; immediate IoT notification |
| D10 | Repeat-caller / chronic-site indicator **[OOHDASH-45]** | Med | Surfaces chronic sites masked as fresh incidents |
| D11 | IoT-team availability status **[OOHDASH-46]** | Low | Reduces status-chasing |
| D12 | BDM approval-threshold guidance + contact per site **[OOHDASH-47]** | Med | Threshold currently undocumented & inconsistent |
| D13 | Reporting dashboard (volume/repeat/resolution) **[OOHDASH-48]** | Low | Build once structured data exists |
| D14 | Live device-control expansion (external lighting/fans/PowerPause ~27% vol) **[OOHDASH-49]** (links IOTD-46) | High | Collapses into SD-515 (Tuya) |
| D15 | `externalLighting` triage flow (missing, ~10% vol) **[OOHDASH-50]** | Med | No flow exists despite volume |
| D16 | T1 phone-guided scripts across flows **[OOHDASH-51]** | Med | Exhaust phone checks before escalation |
| D17 | Structured T3 handoff (R1–R9 flow IDs + ruled-out list) **[OOHDASH-52]** | Med | Additive ticket fields |
| D18 | Source + embed visual aids (device photos/stickers) **[OOHDASH-53]** | Low | Request from IoT team |
| D19 | False-alarm / anomaly auto-detection **[OOHDASH-54]** (links IOTD-44) | Med | System-determined, removes agent interpretation |
| D20 | Auto soft-pushback driven by live data **[OOHDASH-55]** | Med | System states what IS, not agent judgement |
| D21 | Per-site guardrail config (max setpoint/duration/BDM thresholds) **[OOHDASH-56]** | Med | Confirm values with Sam Day/Jonathan |
| D22 | Granular `AreaClaim` site-scoping beyond binary role **[OOHDASH-57]** | Low | Full claim object already in token |
| D23 | Newdemand/install-ticket cross-team routing **[OOHDASH-58]** | Low | Route via scheduling team |
| D24 | Telephony auto-pop ticket on inbound call **[OOHDASH-59]** | Med | Investigate Zendesk auto-pop vs middleware |
| D25 | Portfolio-level monitoring aggregation **[OOHDASH-60]** | Low | Future project per SteerCo |
| D26 | Styled Popconfirm + dynamic hold label after midnight **[OOHDASH-61]** | Low | Small UX carry-over from v1.0.2 |
| D27 | GK Repairs chargeable-visit warning across scripts *(needs confirmation)* **[OOHDASH-62]** | Low | May be partly built |

### (E) Open decisions

*Decisions are tracked here (or a Confluence page), not as delivery tickets.*

| # | Title | Pri | Note |
|---|-------|-----|------|
| E1 | OQ-1 — secret-delivery mechanism (KV sync vs Spencer direct-populate) | High | Email vs impl-doc disagree; settle before finalising manifest **[decision — not ticketed]** |
| E2 | D-1 SMS gateway = Twilio — **LOCKED**; on-duty number still owed | Med | Residual = load number at go/no-go #4 |
| E3 | D-2 deep-link = ingress exemption (path `/` + HMAC) — **LOCKED**; Spencer implements | Med | — |
| E4 | Dedicated Zendesk service account (future) vs reuse Jonathan's — **reuse LOCKED** | Low | Jonathan's is a personal identity |
| E5 | Triage-flow authoring: who owns/maintains flows + storage format | Med | Meant to be IoT-team-maintainable without code |
| E6 | GK Repairs Admin / SCC / Flowrite routing contacts | Med | Marked TBC |
| E7 | Do OOH agents see Manager/Operative views or OOH-only | Low | Role scope |
| E8 | How is per-site BDM-approval rule flagged in ThingsBoard | Spike | Underpins D12 |
| E9 | Confirm integration-bridge `/api/devices` read contract + auth | Spike | Marked "contract confirm" outstanding |
| E10 | Long-term: is Zendesk still the ticket system | Low | Influences telephony (D24) |

### (F) Existing Jira/SD dependencies — do NOT recreate, link them

`SD-586` (this go-live, closed Done) · `SD-330` (consumer dashboard) · `SD-520` (SD-330 B2C move) · `SD-492` (device-control contract) · `SD-515` (Tuya command path) · `SD-491`/`SD-559` (boiler-panel) · `SD-477` (persistent schedules) · `SD-545` (IoT Hub architecture) · `SD-574` (authorization/scope model) · `SD-583` (estate security) · `SD-479` (Schedule Hub) · `IOTD-59` (IoT-dash feedback bundle).

> **From the earlier Jira sweep (not in the docs):** `IOTD-43/44/45/46` (LLM integration, false-alarm auto-detection, AI troubleshooting, ThingsBoard live-device integration — Backlog), `IOTD-47` (OOH team UI expansion — Done), `IOTD-62` (snag queue visibility — Backlog), `SD-593` (promote IoT Support Dashboard to prod). Several of these overlap the D-items above (esp. D4/D14/D19) — **reconcile before creating duplicates.**

*Existing IDs are cross-referenced from the roadmap tickets (e.g. OOHDASH-39↔IOTD-43/45, OOHDASH-54↔IOTD-44, OOHDASH-49↔IOTD-46) — linked, not recreated.*

---

## 9. OOHDASH scrum board — epics + Sprint 1

**Epics (4):**
1. **EPIC A — Deploy & Pilot** (Phase 0 + Phase 1). The "make it work asap" epic.
2. **EPIC B — Full Rollout & Hardening** (Phase 2): all handlers, capabilities on, D-2/health/DLQ.
3. **EPIC C — Bugs & Security** (sections B + C residue; C3 flagged to action now).
4. **EPIC D — Product Roadmap (Phase 2 features)** (section D), sub-grouped: read-only quick wins (D6/D7/D10/D11), high-value flows (D1/D5/D9/D14/D15), AI/automation (D4/D19/D20), alerting (D3).

**Sprint 1 — tight, commit immediately (Phase 0 + minimal Phase 1):**
| Story | Owner | Blocks |
|---|---|---|
| Confirm B1/B3/B4 infra prereqs closed **[OOHDASH-3]** | Spencer | everything |
| Switch Zendesk client to `Authorization: Bearer` **[OOHDASH-2]** | James | ticketing |
| Confirm `scapi_` token complete/active **[OOHDASH-4]** | Jonathan | ticketing |
| Build image + `kubectl set image` (quiet hours) **[OOHDASH-5]** | James | live |
| Smoke test incl. **real-Cosmos-write persistence check** **[OOHDASH-6]** | James | go-live confidence |
| Merge `feature/go-live-sd586` → `main` **[OOHDASH-7]** | James | — |
| Create **2 pilot** B2C handler accounts + `claimArea:1500` **[OOHDASH-8]** | Spencer/James | pilot |
| Run pilot **writes OFF / SMS log-only** (recommended minimal) **[OOHDASH-13]** | James | — |
| C1 — invert `WRITES_DISABLED` fail-open default **[OOHDASH-12]** | James | later writes |

Keep SR-3, Twilio/on-duty-number, and all-handler onboarding **out of Sprint 1** — only needed when you widen capability or audience.

**Critical-path blockers (whose court):**
- **Spencer** — confirm B1/B3/B4 (unlogged; biggest chase-now item) + create 2 pilot accounts.
- **Jonathan** — confirm the `scapi_` token is complete/active.
- **James** — Bearer change, build/set-image/smoke/merge, author the 2 pilot claims, choose pilot capability posture.
- *Later-phase (not on Phase 0/1 path):* SR-3 cred [James] before live writes; Twilio number [James] before live SMS; D-2 HMAC ingress [Spencer] before the P1 deep-link at rollout.

**Bottom line:** Sprint 1's only external dependencies are Spencer (B1/B3/B4 + 2 accounts) and Jonathan (token). The minimal pilot needs neither SR-3 nor Twilio — nothing blocks a functional deployment in real handlers' hands this sprint.

---

*Sources: full project doc set + email threads (10/11/14 Aug) + Jira SD-586 and related. Ambiguities flagged inline (B1/B3/B4 closure not logged; OQ-1 secret mechanism; B7/D27 needing confirmation).*
