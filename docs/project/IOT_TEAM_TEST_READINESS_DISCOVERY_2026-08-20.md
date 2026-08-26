# IoT-Team Test Readiness — Discovery & Assessment

**Goal:** make the OOH Triage Dashboard available to the IoT support team (Sam Day, Csaba, Tony, Meg) to test, end-to-end: (1) the call/chat → capture/escalate → Zendesk flow, (2) live ThingsBoard READ data on the device board, and (3) ThingsBoard CONTROL/WRITE (setpoints, holds, HW-boost) — safely, without disrupting live trading pub sites.

**Author:** discovery session, 2026-08-20 · read-only. No code/infra/Jira changed.
**App state:** v1.2.0, git `main` @ `0c63c0a`, https://ooh.airedale-group.io, AKS ns `iot-services`, deploy `ooh-dashboard`, 1 replica.

---

## 1. Current State (verified this session)

### 1.1 Live health (`GET /healthz`, 2026-08-20)
```
status: degraded  · version 1.2.0 · authMode oidc · dataMode live · writesDisabled true
bridge      : mode live, healthy=false, lastError=null
thingsboard : mode live, read=false, write=false, writeConfigured=true
zendesk     : mode live, healthy=true, configured=true
store       : mode cosmos, healthy=true
```
- **Safety locks ON:** `WRITES_DISABLED=true`, `SMS_PROVIDER=log`, `DATA_MODE=live`, `AUTH_MODE=oidc`. Confirmed in the live deploy spec.
- **Pod:** `ooh-dashboard-fcf4f8f76-q4nsf`, Running, single replica. Boot log clean: OIDC issuer discovered, Cosmos warm-up healthy. No TB/bridge auth attempt in boot log (those are lazy — they only fire on the first authenticated request).

### 1.2 Zendesk — working, but via a TEMPORARY override (OOHDASH-63)
- `zendesk.healthy=true` **only** because the valid API token is currently injected as **explicit deploy env** (`ZENDESK_SUBDOMAIN/EMAIL/API_TOKEN` visible in the deployment spec, plaintext, overriding the `envFrom` secret). The token in the k8s secret `ooh-dashboard-secrets` is still INVALID.
- Auth scheme is standard estate **API-token Basic** `base64(email/token:apiToken)` (corrected in `0c63c0a`; the `password`/`ZENDESK_PASSWORD` path is deprecated/no-op). Do not regress this.
- **Residual:** the durable fix (patch the secret) needs secret-write — `deployer-ooh` **cannot** write secrets (`auth can-i get/update/patch secret` = no). Needs James's privileged kubeconfig or Spencer. Until then the plaintext token sits in the deploy spec (readable by anyone with deploy-read).

### 1.3 ThingsBoard READ — `read=false`
- **TB portal is UP and reachable and the admin credential authenticates:** from the workstation, `POST https://portal.lhlive.co.uk/api/auth/login` with James's CIR admin cred → **HTTP 200**. TB is on a public endpoint the pod reaches the same way. So this is **not** a TB-down or egress problem — it points at the **read credential in the secret** (`TB_USERNAME`/`TB_PASSWORD`) being invalid/stale/unset. This is the same failure class as the Zendesk-token-in-secret issue (OOHDASH-63) and OOHDASH-64 tracks it.
- **Important ambiguity to resolve:** the UI site-search blocker (`GET /api/sites/search` → 503 "Device inventory unavailable") is thrown by **`bridge.getSites()`** (the integration-bridge `/api/devices` read), **not** by the TB telemetry read. `bridge.healthy=false / lastError=null` means the bridge inventory read has simply **not yet been exercised** since this pod booted (`lastReadOk` starts false in live mode; `lastError` stays null until the first actual failure). So we currently have **two separate reads to prove**: (a) bridge inventory read (renders the device list + resolves sites), (b) TB telemetry/echo read (renders live temps and drives control sync). `read=false` proves TB is unproven; the 503 that actually blocks a handler is the **bridge** read. Both must be green for the device board to be usable. Owner: Spencer (secret loads) / IoT platform (bridge connectivity).

### 1.4 ThingsBoard CONTROL/WRITE — blocked by design, several gates
- `writeConfigured=true` (the SR-3 scoped write cred *keys* are present in the secret) but `write=false` (the write session has not made a successful call — expected while writes are locked).
- The dispatch path (`services/control.js` → `tb.writeSharedAttribute`) is gated, in order: **(1)** confirmed-site token (F004), **(2)** kill-switch, **(3)** device online in resolved site, **(4)** capability/value guardrail (registry), **(5)** the shared-attribute write.
- **`WRITES_DISABLED=true` is the hard, first, synchronous gate** in `killswitch.writesBlocked()` — checked before any Cosmos read and before any per-site logic. **Consequence: a per-site kill-switch enable CANNOT override the global deploy lock.** With the lock on, every dispatch returns 423 and the control UI never enters the pending→synced lifecycle at all. Flipping `WRITES_DISABLED=false` is therefore mandatory to test control — and doing so removes the estate-wide safety net.
- **Control is `iot`-role only** (`routes/api.js` admin routes + control dispatch require role context; handler role gets the guardrail path, and every admin/killswitch route is `requireRole('iot')`).
- Registry (`services/registry.js`) already constrains what can be sent: Salus IT500/IT700 setpoint (5–35 device range, app policy ±3 °C of current, cap 25 °C) + frost(5); Intesis setpoint(16–30) + mode; Salus DHW hw-boost(0–9). Tuya/boiler-panel/lighting/gateway = **no control path** (capture/escalate only). Guardrails are enforced server-side.

### 1.5 Cosmos — proven
Cosmos read AND write proven this session (WI `id-ooh-dashboard-prod` has Data Contributor on `/dbs/ooh-dashboard`); a canary `POST /api/outcomes` created a real ticket + a real `OohAuditLog` doc, then cleaned up. `store.healthy=true` alone only proves read; the canary proved write.

### 1.6 Identity/access
- B2C implicit `id_token` SSO works. App admits ONLY tokens whose `extension_Role` carries `claimArea` **1500 → handler** or **1400 → iot** (`services/auth.js mapRole`, precedence `[iot, handler]`). Any other/missing → 403.
- James's account has 1500 (handler). **He does not currently have `iot` (1400) — so James himself cannot dispatch control today.** Roles are provisioned per-account in B2C by Spencer/IoT team.

### 1.7 A pre-existing, directly-relevant plan
`…\IOT OOH Dash\TEST_STRATEGY_live-integrations.md` (14 Aug) already lays out a two-stage strategy that **names these exact four people** as the Stage-2 "man-markers," and specifies a **`CONTROL_WRITE_MODE=stub`** mode for safe Stage-1 testing. **That mode does NOT exist in the code yet** (grep of the app source: no `CONTROL_WRITE_MODE`/`controlWriteMode`/stub-divert — only an unrelated worktree test file matches). This is the single most important building block that is designed but unbuilt.

---

## 2. Problem Framing

"Available for the IoT team to test all three flows" is really **three different readiness problems with very different risk**:

- **Chat/capture (I5) + READ (I3/I4)** are low/no asset-risk. The blockers are pure connectivity/credential (Zendesk secret, bridge read, TB read) + provisioning four B2C accounts. These can go live on prod safely with the write-lock ON.
- **CONTROL/WRITE (I1/I2)** is the dangerous one: it moves real HVAC/HW plant in trading pub sites. It cannot be tested on prod with the write-lock on (423 wall), and cannot be tested with the lock off on real sites without unacceptable risk. This needs either a **stub mode** (test the full UX with no real device reachable) and/or a **supervised, man-marked live window on a bench/non-trading device**.

So the recommendation splits into: **unblock chat+read fast on prod (write-locked)**, then **build the stub mode for full-UX control testing**, then **a tightly-supervised live-control window** as the final gate.

---

## 3. Gap Analysis (per the three test dimensions)

### 3.1 Chat / call flow
| Item | State | Gap / action |
|---|---|---|
| Zendesk connectivity | Working via temporary deploy-env override | Durable fix: patch `ooh-dashboard-secrets` with valid token, remove plaintext env (OOHDASH-63). Needs secret-write (James-priv/Spencer). |
| Capture → ticket → Cosmos | Proven end-to-end (canary) | None functional. Testers just need a valid Zendesk path (63). |
| Inbound calls | Not required | Handlers **drive the flow manually** — search site, confirm, pick an outcome (capture / scope-only / no-action / escalate-P1). No real inbound call needed. Call-ticket *reconciliation* (F003) can be exercised but needs a Zendesk Talk call ticket to match; optional for basic testing. |
| P1 SMS | `SMS_PROVIDER=log` | Keep on `log` for testing — dispatch is recorded, nothing sent. Real SMS is a separate later gate. |
| Test-site / data | Site search 503 today (bridge read) | Chat/capture can be done against a **literal known siteNo** even if search is down, but for a realistic tester experience the bridge read must work (see 3.2). Recommend a known-good test siteNo (e.g. 6234 used in canaries) documented for testers. |
| **Residual after OOHDASH-63** | — | Chat/capture is essentially ready once 63 lands + accounts exist. One resilience gap noted: the outcome path hard-fails if Zendesk is unreachable mid-flow (unlike `callbackLookup` which degrades) — worth a backlog ticket, not a blocker. |

### 3.2 ThingsBoard READ (device board)
| Item | State | Gap / action |
|---|---|---|
| Bridge inventory read (`/api/devices`) | Unproven (healthy=false, not exercised); UI search 503s | **This is the real board blocker.** Confirm the bridge is reachable from the pod and returning the expected shape; `mapBridgeDevice`/`fetchLiveSites` are still "provisional until Spencer confirms the contract (F025)". Owner: Spencer / IoT platform. |
| TB telemetry read (temps, `*Reported`, `*SyncStatus`) | `read=false` | TB is up + reachable + admin login works from workstation → **credential in secret** (`TB_USERNAME`/`TB_PASSWORD`) is the prime suspect, not network. OOHDASH-64. Owner: Spencer (secret) / verify cred validity against portal. |
| Board renders live data | Blocked until both above green | Both (a) bridge read and (b) TB read must be healthy for the board to show real device state. |

**Fix path:** verify the read credential (does `TB_USERNAME`/`TB_PASSWORD` in the secret still authenticate against portal.lhlive.co.uk?) and the bridge base URL/connectivity. Because it's almost certainly a secret value, it needs Spencer/privileged-kubeconfig to load — same channel as OOHDASH-63.

### 3.3 ThingsBoard CONTROL / WRITE (the hardest)
Full dispatch→write trace: `POST /api/control/dispatch` → `control.dispatch()` → **[1]** `resolution.isConfirmed` (409 if site not confirmed) → **[2]** `killswitch.writesBlocked(siteNo)` (checks `config.writesDisabled` FIRST, synchronously → 423; then global, then per-site) → **[3]** device resolved + `device.online` (404/409) → **[4]** `registry.validateCommand` (422 guardrail) → **[5]** `tb.writeSharedAttribute` (SR-3 write session → TB shared attribute). Then a poll loop reads `*SyncStatus`/`*Reported` and only marks **synced** when the device echoes the value back.

Everything that must be true to let the team execute control safely:
1. **`WRITES_DISABLED=false`** — mandatory; per-site enable cannot bypass it. Removing it drops the estate-wide net, so it must be paired with either stub-mode isolation or a supervised window + per-site kill-switch discipline.
2. **`TB_WRITE_USERNAME/PASSWORD` (SR-3 scoped write cred)** present AND valid. `writeConfigured=true` says the keys exist; validity is **unproven** (never exercised). Must be bench-proven before any real write.
3. **A confirmed site** (F004 token) and an **online device** of a **controllable type** (Salus/Intesis; not Tuya/boiler/lighting).
4. **`iot` role (1400)** on the tester's account.
5. **`tb write=false` today** just means no successful write yet — expected under the lock.

**Critical safety question — how to test control WITHOUT disrupting live venues:** see §5.

---

## 4. Recommended Phased Roadmap + Ticket Order

### Roadmap headline (phases + what gates what)
- **Phase A — Unblock the safe flows on prod (write-locked).** Chat/capture + device-board READ. Gate to enter: nothing. Gate to exit: Zendesk secret fixed, bridge+TB reads green, 4 B2C handler accounts provisioned. **This is the fast win — the team can test flows (1) and (2) here with zero device risk.**
- **Phase B — Full control UX with zero device risk (stub mode).** Build `CONTROL_WRITE_MODE=stub`, run it write-unlocked but code-path-isolated from real TB. Gate to enter: Phase A green + stub mode built + `iot` accounts. Gate to exit: every control UI state proven (pending/synced/failed/rejected/timeout/late-sync/override-revert) with no real write. **The team tests flow (3)'s UX here, safely.**
- **Phase C — Supervised live control on a bench/non-trading device.** Real SR-3 write to a safe device, man-marked, off-peak. Gate to enter: Phase B exit + SR-3 bench-proven + fail-open default inverted + safe window + man-marker present. Gate to exit: each capability signed PASS, every change reverted. **Only after this may control be enabled for real trading sites.**

Chat/read (A) and control (B/C) are independent tracks after A — A can ship while B is being built.

### Proposed ticket order (existing + NEW — specify only; do NOT create)
**Existing:**
1. **OOHDASH-63** (High) — replace invalid Zendesk token in `ooh-dashboard-secrets`, remove plaintext deploy-env override. *Blocks Phase A chat testing (durably).*
2. **OOHDASH-64** (Medium) — restore ThingsBoard READ auth (verify `TB_USERNAME/PASSWORD` in secret against portal). *Blocks Phase A board data.*

**New (proposed):**
3. **NEW — Restore integration-bridge device READ / confirm contract** · Bug/Task · High · blocks Phase A board + site search (the actual 503). Depends on: bridge connectivity from pod + F025 contract confirmation (Spencer). *Note: distinct from OOHDASH-64 — the 503 is the bridge read, not TB.*
4. **NEW — Provision B2C accounts + claimArea for Sam Day, Csaba, Tony, Meg** · Task · High · Owner Spencer/IoT. handler(1500) for chat/read; iot(1400) for those who will test control. Mirrors James's grant. Blocks all hands-on testing.
5. **NEW — Grant James `iot` (1400)** · Task · Medium · so an internal driver can exercise control paths. (James is handler-only today.)
6. **NEW — Build `CONTROL_WRITE_MODE=stub`** · Feature · High · the Stage-1 control-writes-stubbed mode per TEST_STRATEGY §4 (route `writeSharedAttribute`/`readControlState` to the in-memory simulator regardless of `DATA_MODE`; fatal-config assertion refusing stub+prod and stub+real-write-cred). Blocks Phase B. Depends on 3/4.
7. **NEW — Invert `WRITES_DISABLED` fail-open default (C1)** · Task/Bug · Medium · make the default "blocked unless explicitly 'false'". Safety pre-req for any write-unlock. Blocks Phase C.
8. **NEW — Runtime store-health degrade (IM-01)** · Task · Medium · `/healthz` store flips degraded at runtime (a mid-window Cosmos outage must be visible). Phase C entry gate.
9. **NEW — Bench-prove SR-3 write credential (A9)** · Task · High · controlled write to a non-trading/bench device confirms `TB_WRITE_*` before any pilot asset. Blocks Phase C.
10. **NEW — Stage-2 supervised live-control window** · Task · High · execute the man-marking scripts (`TEST_SCRIPTS_support-desk.md`) off-peak on a bench/non-trading device. Depends on 6–9 + secured window + man-marker.
11. **NEW (backlog) — Graceful degrade when Zendesk unreachable mid-outcome** · Bug · Medium · outcome path currently hard-fails; a resilience gap for live OOH. Not a testing blocker.

**Ordered sequence today → team testing all three:**
63 + (64 & #3) + #4 → **Phase A live (test chat + read)** → #5, #6 → **Phase B live (test control UX, stubbed)** → #7, #8, #9 + window/man-marker → **Phase C (supervised live control)**.

---

## 5. Safe Control-Testing Strategy (the single hardest problem)

**Recommended approach: two stages, don't pick one — sequence them.**

**Stage 1 (Phase B) — build and use `CONTROL_WRITE_MODE=stub`.** This is the safest viable way for the four testers to exercise the *entire* control experience (setpoint, frost, HW-boost, holds/auto-revert, timeout/late-sync, guardrails, kill-switch) with a **hard, un-bypassable code-path divert** so no real device is ever reachable. The "no asset moves" guarantee rests on **four layers** (per TEST_STRATEGY §4.2): code-path isolation (primary), no SR-3 cred wired, no network route to TB write, and a fatal-config assertion (refuse stub+prod, refuse stub+real-write-cred). This lets writes be "unlocked" for the UX to run, with zero irreversible risk. **This is where the team does the bulk of control testing.**

**Stage 2 (Phase C) — supervised, man-marked live control on a bench/non-trading device, off-peak.** Real SR-3 write, one capability at a time, smallest change first, a qualified IoT engineer watching the physical asset able to revert within seconds, kill-switch armed, pre-agreed abort/revert criteria, bounded to a single named device. Prefer a **bench/spare device or a closed/non-trading site** over any trading venue. Use the **per-site kill-switch** to keep the blast radius to exactly one site once the global lock is off. This is the final gate before control is ever enabled on trading sites.

**On the options considered:**
- *A dedicated UAT ThingsBoard* — cleanest but there's no evidence one exists for Lighthouse/lhlive; standing one up is heavy. **Not recommended now**; stub mode gives the same "no real asset" guarantee far cheaper.
- *Per-site write-enable alone* — **insufficient**: `WRITES_DISABLED` is checked first, so per-site can't override the global lock; and even per-site-only still writes to a real device. Useful only *within* Stage 2 to bound blast radius.
- *Dry-run / stub mode* — **yes, this is the primary recommendation for Stage 1.**
- *Designated test sites/devices + controlled window* — **yes, for Stage 2** (bench/non-trading preferred).

---

## 6. Identity / Access — what to request from Spencer

Provision (or confirm) B2C `extension_Role`/`claimArea` per person, mirroring James's 1500 grant:

| Person | Chat + Read only | Will also test Control |
|---|---|---|
| Sam Day | 1500 (handler) | **1400 (iot)** |
| Csaba | 1500 (handler) | **1400 (iot)** |
| Tony | 1500 (handler) | **1400 (iot)** |
| Meg | 1500 (handler) | **1400 (iot)** |
| James | has 1500 | **needs 1400 added** to drive control |

**Recommendation:** since all four are named man-markers for control, request **1400 (iot)** for all four (iot precedence means they still get full handler capability too). Request 1400 added to James. Note Spencer's caveat that the enum claim system is deprecated and he grants directly + temporarily patches the admin UI — so expect a manual, per-account grant.

---

## 7. Environment — prod vs UAT

- **Chat + Read (Phase A):** **test on prod, write-locked.** Zero device risk with `WRITES_DISABLED=true`; real B2C/Cosmos/Zendesk are exactly what we want to validate. Only caution: real `ooh`-tagged tickets surface to the live SD-330 queue — use `test`+`ooh-test` tags and clean up (per TEST_STRATEGY §4.4), and coordinate the window.
- **Control UX (Phase B):** **stub mode**, run locally or in an isolated pilot namespace with **no network route to real TB write** and no SR-3 cred loaded. Not the live write-locked prod (the stub needs writes "on" to run the lifecycle, so it must be isolated).
- **Control live (Phase C):** production/real assets, but **bench/non-trading device**, supervised.
- **UAT viability:** a Cosmos UAT account (`airedale-knowledgebase-uat`) and `zendesk-uat`/`IOT_DASH_BASE_URL` UAT default exist, but **prod Cosmos is what's actually wired** and there is **no evidence of a UAT ThingsBoard**. A full UAT stack is not warranted for this — stub mode + write-locked prod cover the need at far lower cost. (If a Zendesk *sandbox* is easily available, prefer it for Phase A ticket testing to avoid the live-queue pollution entirely.)

---

## 8. Risks, Unknowns & Decisions for James

### Top 3 decisions James must make
1. **Safe control-testing route:** approve building `CONTROL_WRITE_MODE=stub` (Stage 1) as the primary control-test vehicle, with a later supervised bench window (Stage 2) — vs any attempt to test control on prod/real sites. **Recommend: yes to stub-first, bench-only for live.**
2. **Environment for control:** confirm control is tested in an **isolated stub environment** then a **bench/non-trading device**, explicitly **never a trading site** until Phase C passes. (Chat/read stay on prod write-locked.)
3. **Role assignment per person:** decide whether all four get **1400 (iot)** now (recommended, since all are man-markers) or start with **1500 (handler)** for chat/read and add 1400 only for control testers — and whether to add 1400 to James.

### Also decide
- **Keep the write-lock ON during early chat/read testing?** **Recommend yes** — it costs nothing for flows (1)/(2) and removes all device risk while accounts/reads are being validated.
- **Who owns the secret fixes (63/64/bridge)?** `deployer-ooh` can't write secrets — needs James's privileged kubeconfig or Spencer. Decide the channel now so Phase A isn't stalled.

### Unknowns / could NOT determine (and why)
- **Exact cause of TB `read=false` and bridge `healthy=false`** — could not read the secret values (`deployer-ooh` lacks `get secret`), so I couldn't confirm whether `TB_USERNAME/PASSWORD` and `BRIDGE_BASE_URL` are wrong vs unset. Strong inference (TB is up + admin login works from workstation) points to a **credential** issue, not network — but the specific bad value needs a privileged read or a Spencer check.
- **Bridge read never exercised this pod-life** — `lastError=null` means I have no live error string; the 503 on site-search is the only evidence the bridge read fails. Needs a driven authenticated request (blocked because headless B2C login wasn't performed this read-only session) or the bridge team's confirmation of the F025 contract.
- **SR-3 write credential validity** — `writeConfigured=true` proves keys present, not that they authenticate; unprovable without a bench write (Phase C item A9).
- **Whether a UAT ThingsBoard exists** — no evidence found in CIR/docs; assumed not, hence the stub-mode recommendation.

---

*Sources: app source (auth.js, control.js, killswitch.js, tb-client.js, config.js, registry.js, bridge.js, resolution.js, routes/api.js); live `/healthz` + kubectl (pod, deploy env, RBAC); workstation TB login probe; CIR `OOH_DASHBOARD_DEPLOY.md`, `docs/THINGSBOARD_ZENDESK_INTEGRATION.md`, `credentials/thingsboard.env`; `IOT OOH Dash\TEST_STRATEGY_live-integrations.md`, `PHASE0_RESUME_HANDOVER_2026-08-19.md`; project MEMORY.*

---

## 9. Critical Review (CX + critical-thinker) — added 2026-08-20

**Reviewer stance:** adversarial stress-test before this goes to James. Read-only. Verified the load-bearing claims against source (`killswitch.js`, `control.js`, `tb-client.js`, `config.js`, `routes/api.js`).

### 9.0 What checks out (so we're building on solid ground)
- **Kill-switch gate order is exactly as claimed.** `writesBlocked()` checks `config.writesDisabled` first and synchronously, before any Cosmos read — so a per-site enable genuinely cannot override the global lock. Correct and load-bearing.
- **Control dispatch chain is exactly as claimed** (F004 confirm → kill-switch → device online → registry guardrail → `writeSharedAttribute`). Correct.
- **Control routes are `iot`-gated** (`admin.use(requireRole('iot'))`; dispatch requires role context). Correct.
- **Stub mode does not exist yet.** Correct — only a worktree test file matches.

### 9.1 Verdict: **Sound in its safety analysis, but MIS-PRIORITISED against James's actual goal. Needs changes before it goes to him.**
The roadmap is a competent *safety* plan. But James's goal #3 is explicitly *"the control work the dashboard calls on ThingsBoard to EXECUTE."* **Stub mode does not test that at all** — by design it proves nothing ever reaches TB. Under this plan, the *only* place real execution is proven is Phase C, on **a single bench device, once**. So the headline deliverable (build stub) consumes the schedule while the thing James most wants — testers seeing a real TB write land, tied to a conversation — is deferred to the very last, narrowest phase. That is the central inversion to fix.

### 9.2 The 3–5 corrections that matter

**1. The effort premise is wrong — stub mode is NOT "the biggest unbuilt building block; real engineering." The simulator already exists.** `tb-client.js` already contains `simState`/`simWrite`/`simRead` and already diverts `writeSharedAttribute()`/`readControlState()` to them when `config.dataMode === 'fixture'` (lines 120, 134). Building `CONTROL_WRITE_MODE=stub` = widen those two existing conditions to also fire on the new flag (keeping reads/Cosmos/Zendesk live) + add the fatal-config assertion. That is hours, not a feature epic. **This cuts both ways:** it removes the "stub is too expensive" objection, but it also removes the doc's own justification for treating stub as the centrepiece. Stub is cheap; it just doesn't serve goal #3.

**2. Bring real execution forward. The bench device should be procured/identified in PARALLEL with Phase A, not gated behind Phase B.** The genuinely scarce, long-lead item is *a safe device to write to* — a bench/spare/non-trading Salus or Intesis. That has zero code dependency and can be sourced today. Building stub (cheap) then waiting to source a bench device (slow) at Phase C is backwards. Flip it: start sourcing the bench device now, so Phase C can run the moment its code gates land. The critical path to goal #3 is *hardware + a validated SR-3 write cred*, not stub code.

**3. `WRITES_DISABLED` is fail-OPEN today, and this is worse than the doc states — promote C1 out of "Phase C entry."** Verified: `writesDisabled: env('WRITES_DISABLED') === 'true'`. Anything that is not the exact string `'true'` — unset, empty, `"false"`, `"1"`, `"TRUE"`, a YAML typo — evaluates to **false = writes ENABLED**. The doc lists C1 (invert to blocked-unless-`'false'`) as a Phase C entry gate. But the *single most likely way a tester accidentally actuates a real device* is: someone provisions the Phase B stub environment, fat-fingers or omits `WRITES_DISABLED`, and if SR-3 cred + network route are also present the write goes live. **C1 is cheap and should land FIRST, before any write-unlocked environment (stub or bench) is ever stood up.** It is currently sequenced last among the safety fixes; it should be first.

**4. The "four independent safety layers" are asserted, not verified — and in a stub environment they are not all independent.** The doc inherits the four layers from TEST_STRATEGY §4.2 verbatim. Only layer 1 (code-path divert) was verified in source this session. Layers 2 (no SR-3 cred) and 3 (no network route) are *environment provisioning claims* about a Phase B environment that doesn't exist yet — they are only as real as the person who wires that namespace. Layer 4 (fatal-config assertion refusing stub+prod / stub+real-cred) **does not exist in code yet** (`validateConfig` has no such check). So of four "independent" layers: one verified, one unbuilt, two are provisioning promises. This should be stated honestly, and the fatal-config assertion should be part of the stub ticket's definition-of-done, not assumed.

**5. CX: the three-mode seam (prod-read + stub-control + bench-control) breaks "control where relevant to the conversation."** James wants testers to have a real call/site conversation and then exercise the control that conversation implies. In Phase B the site/telemetry on screen is **real prod data** but the control action is a **simulator echo** — so a tester confirms a real site, sees real temps, sends a setpoint, and gets a fabricated "synced." They cannot tell real from stubbed, and the one thing the conversation was *for* (moving the plant) didn't happen. That is a confusing and arguably misleading tester experience for four support engineers whose instinct is to trust what the board shows. **Mitigation to add:** a loud, unmissable UI mode banner ("CONTROL SIMULATED — no device will move") whenever `CONTROL_WRITE_MODE=stub`, and script Phase B explicitly as "UX/lifecycle drill," not "control testing." Better still, get them onto the bench device (real execution against a *known test siteNo*) as the primary control exercise, and use stub only for the failure/timeout/late-sync states that are hard to reproduce on real hardware.

### 9.3 Refined phase plan + ticket order (changed)

The phases stay, but **(a) C1 moves to the very front, (b) bench-device sourcing starts in parallel with Phase A, (c) stub is reframed as a cheap lifecycle-drill, not the centrepiece, and (d) the real-execution path (bench) is treated as the true goal-#3 deliverable and pulled as early as its gates allow.**

**Do-first (parallel, no code-order dependency):**
- **C1 — invert `WRITES_DISABLED` fail-open default** (was #7). Cheap, and a prerequisite for *any* write-unlocked environment. **Land before stub env exists.**
- **Source/identify the bench or non-trading Salus/Intesis device** (long-lead, zero code dep). Start now.
- **OOHDASH-63** (Zendesk secret durable fix) + **OOHDASH-64** (TB read cred) + **NEW bridge-read fix** — but see 9.4: the bridge fix is gated on a diagnosis that hasn't happened.
- **Provision B2C accounts** — parallelisable; only *needed* before hands-on Phase A, not before the fixes.

**Then:**
- **Phase A (chat + read on prod, write-locked)** — unchanged, the fast real-value win. Ship it.
- **Phase B (stub lifecycle drill)** — build `CONTROL_WRITE_MODE=stub` *including the §4.2 layer-4 fatal-config assertion as definition-of-done* + the loud SIMULATED banner. Small effort. Purpose: exercise failure/timeout/late-sync/override states, **not** to stand in for real control.
- **Phase C (supervised bench execution)** — real SR-3 write to the bench device, man-marked, off-peak. Requires SR-3 bench-proof (A9) + IM-01. This is where goal #3 is actually met; prioritise getting here, don't treat it as an afterthought.

**Net change to the doc's ordering:** C1 first (not last-among-safety); bench-device sourcing starts at t0; stub demoted from "centrepiece / big build" to "cheap drill"; fatal-config assertion added to stub DoD; add a stub-mode UI banner.

### 9.4 Sequencing / hidden-prerequisite flags
- **Phase A is gated on a diagnosis that has not happened.** The bridge-read 503 root cause is *unknown* (`lastError=null`, never exercised this pod-life). The doc lists "NEW — restore bridge read" as a Phase-A exit gate but cannot say whether it's a bad secret, a wrong base URL, an F025 contract mismatch, or bridge-side downtime. **Phase A therefore cannot be scheduled until a driven authenticated bridge read is captured** (needs a real B2C login, which the read-only session skipped). This diagnosis is the true first action for the read track — call it out as such, don't bury it in "unknowns."
- **TB read (OOHDASH-64) vs bridge read are correctly separated** — good catch in the doc; both must be green for the board.
- **"Provision 4 accounts before Phase A" is over-stated as a hard pre-req.** It's needed before *testers touch* Phase A, but account provisioning (Spencer, manual) can run in parallel with the secret fixes. Don't let it serialise the critical path.

### 9.5 Role decision
- The doc recommends **1400 (iot) for all four**. Least-privilege argues the opposite for Phase A: **1400 unlocks the control dispatch + all admin/killswitch routes** (`requireRole('iot')`). During Phase A (chat/read only, write-locked) no tester needs 1400, and handing four people iot before the write path is proven-safe widens the accidental-actuation surface — especially given the fail-open default (9.2#3). **Recommend: 1500 (handler) for all four for Phase A; add 1400 only when a tester enters Phase B/C control testing.** Add 1400 to James now so there's one internal driver. This is a cheap, reversible least-privilege win the doc gives away.

### 9.6 Where the discovery over-/under-reached
- **Over-reached:** framed stub as "the single most important building block that is designed but unbuilt" and "real engineering" — the simulator it depends on already exists and the divert is two conditions. The build is minor; the framing inflates it.
- **Under-delivered:** did not verify the four safety layers (only layer 1 is real in code today; layer 4 doesn't exist), did not flag that goal #3 is only ever met on one bench device once, and did not catch that C1's fail-open is *string-exact* (worse than "make the default safe" implies). Also under-weighted that the bridge-read diagnosis is a blocking unknown *on the critical path*, not just an "unknown."
- **Fair and correct:** the safety analysis, gate-order proof, role-gate mechanics, TB-up-so-it's-a-cred-issue inference, and the two-reads distinction are all sound.

### 9.7 Decisions James must make (sharpened)
1. **Is stub-UX good enough for goal #3, or is real execution the point?** If the latter (his words suggest it is), **reprioritise toward the bench device now** and treat stub as a cheap add, not the deliverable.
2. **Source a bench / non-trading Salus/Intesis device — who, and by when?** This is the real long-lead item.
3. **Least-privilege roles:** 1500-for-all in Phase A, add 1400 per-tester at control time? (Recommended) vs 1400-for-all now.
4. **Own the secret-write channel** (James-priv kubeconfig vs Spencer) for 63/64/bridge — decide now so Phase A isn't stalled.
5. **Approve C1 (fail-open invert) as a do-first**, before any write-unlocked environment exists.

### 9.8 The ONE question that most needs James's answer first
**"For goal #3, do you need the four testers to see a *real* ThingsBoard write land during a conversation — or is exercising the control UI/lifecycle safely enough for now?"**
His answer decides everything: if real execution is required, the bench device becomes the critical path and stub is a cheap side-drill (reprioritise now); if UI-lifecycle is enough, the doc's stub-first plan is broadly right (just move C1 first and dial back the roles).
