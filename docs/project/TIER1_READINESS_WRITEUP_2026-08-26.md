# OOH Triage Dashboard — Tier-1 Readiness Write-up

**Date:** 2026-08-26
**Author:** James Brown (with Claude Code)
**Scope of this doc:** the "Tier-1 readiness" work completed this session, the single remaining blocker, and the Jira reconciliation that accompanies it.

> **Authoritative current-state doc as of 2026-08-26.** Supersedes the day-to-day status in `PROJECT_STATUS.md` for anything Tier-1. Historical build/deploy record still lives in `PHASE0_RESUME_HANDOVER_2026-08-19.md` and `PROJECT_STATUS.md`.

---

## 1. Executive summary

Tier-1 of the OOH Triage Dashboard is **feature-complete and deployed** on the production platform. Tier-1 scope = **chat / capture / escalate + device READ** (control/writes are a separate, later track).

This session closed out the last functional gap in the Tier-1 read path: the integration-bridge **site-search 503** (OOHDASH-66). It was root-caused as an **F025 contract mismatch** (not a reachability/credential fault), fixed across two builds, deployed as a clean image `5a9fd99`, and **verified live** — a real house number resolves to its device with telemetry.

With that fixed, **Tier-1 has exactly one remaining blocker: writing the OOH role claim** so the four pilot testers can actually sign in. They authenticate fine against B2C but the app correctly 403s them because none carries a `claimArea` role. Provisioning the claim requires a Cosmos write that James is not currently permissioned for (he has Data **Reader** only). This needs a one-off action from Spencer (on annual leave 2026-08-26, ~1-day wait), plus the four testers' confirmed login emails.

Everything else Tier-1 (bridge board read, Zendesk) is confirmed healthy.

---

## 2. Current state

**App / release**
- Version **v1.2.0**.
- Prod image now **`apitechhub.azurecr.io/ooh-dashboard:5a9fd99`** (bridge fix live).
- GitHub **`bigtuff8/ooh-triage-dashboard`**, `main` @ **`a47a2b1`** — **PR #1 (bridge fix)** and **PR #2 (Tier-1 tooling)** both merged.
- Live at **https://ooh.airedale-group.io**, AKS namespace **`iot-services`**.
- **Safety locks ON:** `WRITES_DISABLED=true`, `SMS_PROVIDER=log`, `DATA_MODE=live`, `AUTH_MODE=oidc`.

**Tier-1 read path — proven**
- Bridge inventory read works from the pod: search `6261` → site `gk-6261` → Salus iT700 with telemetry (`heatingSetpoint`). See §4.
- **Zendesk** confirmed healthy.
- **ThingsBoard `read:false`** confirmed a harmless lazy health-flag artifact, **not** a Tier-1 read blocker — board temperatures come from the bridge `/api/devices` payload, not a direct TB read.

**Scope reminder**
- **Tier-1 = chat / capture / escalate + device READ.**
- **Control (write) = separate, later track** (see §6).

---

## 3. What was done this session

### 3.1 OOHDASH-66 — bridge site-search 503 fixed and deployed (DONE)
Root cause was **not** reachability or credentials — it was an **F025 contract mismatch**. The bridge `GET /api/devices` returns a **flat device array with no site objects** (no `res.data.sites`, no `siteNo`/`siteName`/`brand`/`devices[]`). The house/site number is only embedded in `accountId` (e.g. `gk-6261` → house **6261**).

- **Build 1 (diagnostic):** fixed the crash (`searchSites` guarded, bridge errors logged) and captured the **real contract live** from the running pod.
- **Build 2 (mapping):** grouped the flat device array → sites by `accountId`; remapped device fields via `mapBridgeDevice` (notably `setpointC` → `heatingSetpoint`, which is load-bearing — `routes/api.js` reads `telemetry.heatingSetpoint`). Deployed clean image **`5a9fd99`**, **removed the temporary diagnostic raw-body log**, **43/43 unit tests** green.
- **Verified live:** site **6261** resolves to its **Salus iT700** with telemetry (`heatingSetpoint`); `/healthz` bridge `healthy:true` after the first read.
- **Contract recorded** in repo **`docs/BRIDGE_CONTRACT.md`** and CIR **`OOH_BRIDGE_CONTRACT.md`**.

### 3.2 Integration health confirmed
- **Zendesk** healthy.
- **ThingsBoard `read:false`** = lazy health flag only; not a read blocker (see §2).

### 3.3 Provisioning tooling (PR #2, merged)
- **`scripts/provision-ooh-user.mjs`** — dry-run by default, idempotent, takes backups, `--commit` / `--iot` flags.
- **`docs/TIER1_TESTER_GUIDE.md`** — tester onboarding guide.
- Dry-run verified against the confirmed Cosmos coordinates. Once the Contributor grant lands and login emails are confirmed, provisioning the four testers is a single scripted step.

### 3.4 Login diagnosis — testers are authenticated-but-unprovisioned
The testers can't get in because they are **authenticated-but-unprovisioned**, not because of any tenant/identity failure.
- B2C authenticates them fine. Sam Day tested: **two valid tokens under two `sub`s** — his `sam.day@sccuk.com` and `SamDay@airedale-group.co.uk` identities.
- The app 403s **both** with `[AUTH] Sign-in without OOH role` — neither identity carries a `claimArea` 1400/1500 in `extension_Role`.
- **Implication:** this **refutes the SD-586 assumption** that "the IoT team already have 1400" for the SCC-outsourced support desk — **all four testers need explicit provisioning.**

---

## 4. The one remaining Tier-1 blocker — writing the role claim

**What's needed:** upsert an `AreaClaim { claimArea:1500, claimGroup:3500, claimPermission:200 }` onto each of the four testers' user docs.

**Point of truth (verified):**
- Cosmos account **`airedale-knowledgebase`**, DB **`KnowledgeBase`**, container **`user`**.
- Doc key **`id = <lowercase email>`**, partition-key value **`"user"`**, **AAD-only** (`disableLocalAuth:true`).

**Why James can't self-serve (tested):** James holds Cosmos Data **Reader** only. A non-destructive conditional-write test returned **HTTP 403 substatus 5302** (RBAC write denied). No control-plane rights to self-elevate, no app-identity lever, no admin UI — all routes blocked.

**The ask to Spencer:**
- **Recommended (durable):** grant James **account/`KnowledgeBase`-scope Cosmos DB Built-in Data Contributor.** Then James self-serves the four testers now **and all future users** against the confirmed coordinates — this also advances **OOHDASH-65** (delegated admin) and **OOHDASH-69** (admin console).
- **Fallback:** Spencer upserts the four `AreaClaim` docs himself.

**Also still needed:** the four testers' **confirmed LOGIN emails** (SCC `@sccuk.com` vs Airedale `@airedale-group.co.uk`) — the grant/provisioning is keyed by email.

**Timing:** Spencer on annual leave 2026-08-26 → ~1-day wait. Nothing else Tier-1 is outstanding.

**Role decision (already recorded on OOHDASH-8, 2026-08-20):** all four testers (Sam Day, Csaba Jakab, Tony Willetts, Megan Mcsevney) get `claimArea 1500` (handler — sufficient to dispatch control per OOHDASH-67); grant `iot` (1400) to **one** as kill-switch holder — **Sam Day**.

---

## 5. Outstanding items (non-blocking)

- **OOHDASH-70** — combi iT500 hot-water control/scope won't activate from live bridge data (DHW device-model mismatch). Root-caused this session; **control track**, not Tier-1 blocking. See §6.
- **OOHDASH-64** — ThingsBoard `read:false` lazy health-flag; optional cleanup (add an active `/healthz` probe). No Tier-1 impact.
- **Bridge contract stability (F025 ownership)** — needs Spencer confirmation that `/api/devices` is stable/versioned and who owns F025. The only part the OOH team can't self-serve. Recorded in CIR `OOH_BRIDGE_CONTRACT.md`.

---

## 6. Control track (later)

Control/writes are a **separate, later track** — explicitly out of Tier-1 scope. Relevant tickets:

- **OOHDASH-70** — combi iT500 DHW model mismatch. The registry models hot water as a separate `deviceType salus-it500-dhw` (HW `SCOPE_GROUP` + `hwboost` guardrail key off it), but the bridge emits a combi iT500 as a **single `salus-it500`** with a nullable `hotWater` telemetry field. So HW control + the HW scope tile don't light up from live data (the reading is surfaced in `telemetry.hotWater`). Fix = split combi into two logical devices, or re-key the DHW paths off `telemetry.hotWater`.
- **OOHDASH-12 / -18 / -19 / -67** — control-track gates (WRITES_DISABLED default inversion, SR-3 ThingsBoard write credential, live device-write go/no-go, control-dispatch authorisation policy).
- **De-risking decision (James):** because the IoT-support audience **self-marks on ThingsBoard**, control is already de-risked — **no bench/supervised-window gating is required** for this audience. This simplifies the control-track path when it is picked up.

---

## 7. Jira map (OOHDASH)

| Ticket | Summary | State after this session |
|---|---|---|
| **OOHDASH-66** | Bridge inventory read / site-search 503 | **Done** — fixed, deployed `5a9fd99`, verified live; closing comment added (PR #1/#2 + this doc). |
| **OOHDASH-8** | Create B2C accounts + `claimArea:1500` for 4 pilot testers | **Open (blocked)** — on the Contributor grant + four login emails. Detailed investigation comment (2026-08-26) already present; short note added that provisioning script is ready + dry-run verified. |
| **OOHDASH-64** | TB `read:false` lazy health-flag | **To Do** — brief note added confirming it's harmless / not a Tier-1 blocker; optional cleanup. |
| **OOHDASH-65** | Delegated self-service user-access admin | **To Do** — brief note added: near-term step = Cosmos Data Contributor grant to James (see -8). |
| **OOHDASH-69** | In-app admin console (tiered access) | **To Do** — unchanged; longer-term form of self-service admin (referenced from -8/-65). |
| **OOHDASH-70** | Combi iT500 DHW model mismatch | **To Do** — root-caused this session; brief note added; control-track, non-blocking. |
| OOHDASH-12/-18/-19/-67 | Control-track gates | **To Do** — later track (§6). |

Cloud/Jira: project **OOHDASH**, cloudId `980108f4-3398-44f5-8fde-336ffe4fa810`.

---

## 8. Next steps

1. **Spencer (on return ~2026-08-27):** grant James account/`KnowledgeBase`-scope **Cosmos DB Built-in Data Contributor** (preferred), or upsert the four `AreaClaim` docs himself. Also confirm F025 bridge-contract stability/ownership.
2. **Team:** confirm the **exact login email** each of the four testers will use (SCC vs Airedale).
3. **James (once grant + emails land):** run `scripts/provision-ooh-user.mjs --commit` for the four testers (Sam Day also `--iot`), then verify sign-in and Tier-1 read on the live app. Close **OOHDASH-8**.
4. **Later:** pick up the control track (§6) — OOHDASH-70 DHW fix + OOHDASH-12/-18/-19/-67.

---

## 9. Also in flight (separate workstream)

Migrating repos off OneDrive to GitHub/local to fix machine performance — discovery in progress; relates to **HARN-84**. Mentioned here only for continuity; not part of Tier-1.

---

_References: repo `docs/BRIDGE_CONTRACT.md`, `docs/TIER1_TESTER_GUIDE.md`, `scripts/provision-ooh-user.mjs`; CIR `OOH_BRIDGE_CONTRACT.md`, `OOH_DASHBOARD_DEPLOY.md`; `PHASE0_RESUME_HANDOVER_2026-08-19.md`._
