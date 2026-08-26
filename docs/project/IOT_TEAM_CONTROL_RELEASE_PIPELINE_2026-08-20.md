# IoT-Team Live-Control Release — Ticket Pipeline

**Date:** 2026-08-20 · **Author:** discovery/planning session · **Mode:** READ-ONLY (no Jira/code/infra changed)
**Project:** OOHDASH · cloudId `980108f4-3398-44f5-8fde-336ffe4fa810`
**App state:** v1.2.0, git `main`, https://ooh.airedale-group.io, AKS ns `iot-services`, deploy `ooh-dashboard` (1 replica). `WRITES_DISABLED=true`, `SMS_PROVIDER=log`, `DATA_MODE=live`, `AUTH_MODE=oidc`.

---

## 1. Release definition & audience risk-posture

**Deliverable:** live ThingsBoard integration + real device CONTROL to the **internal IoT support team** — Sam Day, Csaba Jakab, Tony Willetts, Megan Mcsevney.

**Why the risk posture changes.** This audience works directly in the ThingsBoard UI and on the hardware. Any wrong actuation the dashboard causes, they can **see and correct at source within seconds**. That removes the public-safety rationale behind the earlier stub-first / bench-only / protect-live-pub-sites gating. So we optimise for the **leanest sound path to real control for this audience**, keeping only the guardrails that still matter:

- **Kept as hard gates:** scoped write credential (least privilege, blast-radius), fail-open→fail-safe default on the deploy lock, kill-switch discipline, credential-hygiene/security rotation, and a lightweight man-marking sign-off (a human on the asset confirming/reverting each capability the first time).
- **Relaxed / dropped:** building a dedicated stub control mode, a formal 2-user "writes-off" pilot, and the elaborate multi-stage supervised-window choreography intended to protect the public. For an audience that IS the man-marker, the stub is largely redundant scaffolding.

---

## 2. End-to-end requirements for real control (verified in code)

Trace: `POST /api/control/dispatch` → `services/control.js dispatch()` → `services/tb-client.js writeSharedAttribute()` → poll loop reads `*SyncStatus`/`*Reported` and only marks **synced** when the device echoes the value back (never on HTTP 200).

Ordered gates in `control.dispatch()` (all server-side):
1. **F004 confirm token** — site must be confirmed for this operator (`resolution.isConfirmed`) else 409.
2. **Kill-switch** — `killswitch.writesBlocked(siteNo)`. This checks **`config.writesDisabled` FIRST, synchronously, before any Cosmos read** (`killswitch.js:32`). **A per-site enable cannot override the global deploy lock.** With the lock on, every dispatch is 423 and the pending→synced lifecycle never runs.
3. **Device online in the resolved site** — 404/409 otherwise.
4. **F009 registry guardrail** — `registry.validateCommand` (422). Salus IT500/IT700 setpoint (device 5–35, app policy ±3 °C of current, cap 25 °C) + frost(5); Intesis setpoint(16–30) + mode; Salus DHW hw-boost(0–9). **Tuya / boiler-panel / lighting / gateway have NO control path** (capture/escalate only).
5. **The write** — `tb.writeSharedAttribute` posts a TB SHARED_SCOPE shared attribute using the **`writeSession` (SR-3 scoped cred: `TB_WRITE_USERNAME`/`TB_WRITE_PASSWORD`)**. The vendor bridge picks it up and writes back `*Reported`/`*SyncStatus`.

**True prerequisites for a real write to land AND be confirmed:**
- **`WRITES_DISABLED=false`** (config.js:87 — currently `true`). Mandatory; the lock is the first gate.
- **SR-3 write cred present AND valid.** `writeConfigured=true` (keys exist) but validity is **unproven** — the write session has never made a successful call (`write=false`). Must be bench-proven (OOHDASH-18).
- **TB READ path healthy** — `readControlState` uses the **read** session (`TB_USERNAME`/`TB_PASSWORD`); the sync-confirmation loop depends on it. Currently `read=false` (lazy flag / suspect read cred in secret). **Without a working read, a write can fire but will never confirm "synced"** — it will sit pending→timeout. So read health is a *functional* prerequisite for trustworthy control, not just cosmetic.
- **Bridge inventory read healthy** — `bridge.getSitesByNumber` resolves the site+device before the write; site search 503s today because the bridge read is unproven. Needed to reach a controllable device at all.
- **A confirmed site + an online device of a controllable type.**

### 2a. CRITICAL ACCESS FINDING (corrects the 2026-08-20 readiness doc)
**Control dispatch is NOT role-gated to `iot`.** `/api` is mounted behind `requireAuth` only (`server.js:96`). In `routes/api.js`, `/control/dispatch` (line 139) has **no `requireRole`**. The **only** `requireRole('iot')` is on the `/admin` sub-router (`api.js:345` — kill-switch/config). Also, `requireRole` is an **exact-match** check (`op.role !== role`, `auth.js:223`), not a rank — so an `iot`-only gate would actually *exclude* a handler.

**Consequences for -8:**
- The 4 testers at **handler (claimArea 1500)** can dispatch real control writes **as-is** once `WRITES_DISABLED=false` — they do **not** need iot(1400) to control.
- They need **iot (1400)** only if a tester must operate the **kill-switch / admin page** themselves. Recommend giving **at least one** tester (or James) iot(1400) so the team holds its own kill-switch without a bottleneck.
- This materially shrinks the -8/-65 access work: direct-provision 4 handler accounts (already the -8 plan); add iot to one.

---

## 3. Ticket-by-ticket disposition

| Ticket | Summary (short) | Disposition | Rationale |
|---|---|---|---|
| **-15** | Rotate compromised Lighthouse/Tuya + WiFi creds | **PREREQ (hard, security)** | Highest. Independent of phasing. Compromised creds must not persist into a live-control release. |
| **-18** | Provision + bench-prove SR-3 scoped write cred | **PREREQ (hard)** | The write literally uses this cred; validity unproven. Bench-prove before any real write. |
| **-12** | Invert `WRITES_DISABLED` fail-open→fail-safe default | **PREREQ (hard)** | Cheap safety fix; makes absent/blank resolve to blocked. Kept even for safe audience — protects against a mis-deploy. |
| **-19** | Enable live writes — go/no-go (`WRITES_DISABLED=false`) | **REQUIRED (the release act)** | The single flip that turns control on. Depends on -18, -12, read/bridge health. Drop its dependency on -14's heavy supervised choreography. |
| **-8** | 4 IoT-support B2C accounts @1500 | **REQUIRED** | Access path. Handler(1500) is sufficient for control (see 2a); add iot(1400) to one for kill-switch. |
| **-11** | Man-marking scripts + sign-off | **REQUIRED (slimmed)** | Keep as the lightweight per-capability first-run sign-off (setpoint/frost/HW-boost/hold+auto-revert). Draft already exists (`TEST_SCRIPTS_support-desk.md`); needs a lead's accept. |
| **-64** | TB read:false lazy health-flag (+ optional active probe) | **REQUIRED (subset)** | Must confirm the **read cred actually authenticates** — control confirmation depends on it. The optional active /healthz probe part can defer. |
| **-24** | IM-01 /healthz stale-green at runtime | **REQUIRED** | Testers must trust the health banner to know control feedback is real. Stale-green could mask a dead read → false "all good". |
| **-9** | Build `CONTROL_WRITE_MODE=stub` | **DROP / DEFER** | Redundant for an audience that is itself the man-marker and can validate on the asset. Not built; building it delays the release for little added safety here. Keep in backlog for a future *external/handler* rollout. |
| **-10** | Stage-1 stubbed test pass | **DROP / DEFER** | Depends on -9. Same reasoning. |
| **-13** | 2-user pilot, writes off | **DROP / DEFER** | The "writes-off" pilot is the thing this release deliberately skips past. A short real-control shakedown with the 4 replaces it. |
| **-14** | Stage-2 supervised live-control window | **RELAX → fold into -11/-19** | Its *value* (a human able to revert on the asset) is inherent to this audience. Don't run it as a separate heavyweight gate; its acceptance collapses into -11 sign-off + -19 go/no-go. |
| **-26** | Service Bus DLQ (~31 dead-lettered) | **OPTIONAL for control; RECOMMENDED soon** | Does not block a control write/confirm (that path is TB shared-attr + poll, not Service Bus). But it affects ingest/reconciliation trust. In-scope only if testers will judge call-ticket reconciliation. |
| **-25** | IM-02 boot probe can't see missing Cosmos container | **OPTIONAL** | Cosmos read+write already proven this session. Lower runtime risk than -24. Defer. |
| **-22** | SD-330 Cosmos read grant (failed-revert strip) | **OPTIONAL** | Nice for the failed-revert UI strip; not required to prove control. Defer unless testing hold/auto-revert failure surfacing. |
| **-31** | Stop plaintext cred-sharing (policy) | **RECOMMENDED (security hygiene)** | Pairs with -15. Policy, low effort; keep in the release's security lane. |
| **-32** | Creds → Key Vault via workload identity | **OPTIONAL / follow-on** | The durable home for TB/Zendesk creds. Not a control-correctness blocker; schedule right after. |
| **-63** | Replace invalid ZENDESK_API_TOKEN in secret | **Done** (temporary env override live) | Durable secret patch still pending secret-write; not a control blocker. |
| **-65** | Delegated self-service user-access admin | **PARALLEL / NON-BLOCKING** | For 4 testers, direct provisioning (-8) is fine. -65 removes the Spencer bottleneck later; run in parallel. |
| -20/-21/-27/-28/-29/-30/-33/-34, -35..-62 | SMS-live, deep-link, roadmap features, minor bugs | **OUT OF SCOPE** | Not on the critical path to internal live control. |

---

## 4. Proposed ordered PIPELINE (with dependencies + critical path)

**Stage A — Security & config prerequisites (parallelisable):**
- **-15** rotate compromised creds *(hard security gate; independent — start now)*
- **-12** invert `WRITES_DISABLED` default to fail-safe *(cheap; land early)*
- **-31** cred-sharing policy *(runs alongside -15)*

**Stage B — Prove the live read/write plumbing:**
- **-64 (subset)** confirm TB **read** cred authenticates → `read` goes true on first device read
- fix **bridge inventory read** (unblocks site search / device resolution) — *gap, see §5*
- **-18** provision + **bench-prove SR-3 write cred**
- **-24** IM-01 stale-green health fix *(so testers trust the banner)*

**Stage C — Access:**
- **-8** provision 4 handler(1500) B2C accounts; add **iot(1400) to one** (kill-switch holder)
- **-65** delegated admin *(parallel, non-blocking)*

**Stage D — Enable & shake down:**
- **-11 (slimmed)** man-marking scripts accepted by IoT lead
- **-19** go/no-go → flip `WRITES_DISABLED=false` *(THE release act)*
- short real-control shakedown with the 4, per-capability sign-off *(absorbs -14)*

**Stage E — Follow-on (post-release):**
- **-32** creds → Key Vault · **-26** DLQ drain · **-25/-22/-27** as needed · **-63** durable secret patch

### Critical path
**-15 → -18 (bench-prove write cred) → -19 (flip WRITES_DISABLED=false) → -11 sign-off / shakedown.**
Gating -19 additionally: **-12** (fail-safe default), **TB read cred healthy (-64 subset)**, **bridge read healthy (gap)**, **-24** (trustworthy health). **-8** must be done before the shakedown but is independent of the plumbing work (run in parallel). Everything in -9/-10/-13 is removed from the path.

---

## 5. Gaps → proposed new tickets (NOT created)

1. **Bridge inventory read connectivity/contract not proven from the pod.** `bridge.getSites()`/`/api/devices` 503s the UI site search; `mapBridgeDevice`/`fetchLiveSites` marked "provisional until Spencer confirms contract (F025)". This blocks reaching a device to control and is not cleanly owned by an existing ticket.
   - *Proposed:* **Bug/Task, High** — "Prove integration-bridge inventory read from ooh-dashboard pod (site search 503) + confirm F025 device contract." Owner: Spencer / IoT platform.
2. **No explicit role gate on `/control/dispatch`.** Control write is available to any authenticated operator (handler or iot). Fine for this trusted audience, but it contradicts the code comment ("privileged routes add requireRole('iot')") and the readiness doc.
   - *Proposed:* **Task, Medium** — "Decide + document control-dispatch authorisation policy (handler may control vs iot-only); align code comment/UI/tests to the decision." (Decision for James — see §7.)
3. **Outcome path hard-fails if Zendesk is unreachable mid-flow** (unlike `callbackLookup` which degrades).
   - *Proposed:* **Bug, Medium** — "Degrade gracefully when Zendesk unreachable during outcome capture."
4. **Durable Zendesk secret patch still pending** (plaintext token in deploy spec; `deployer-ooh` cannot write secrets).
   - Covered by -63 residual; ensure it stays tracked (needs James-priv kubeconfig/Spencer).

---

## 6. Observability / security prerequisites (judgement)

- **-24 (IM-01 stale-green): IN SCOPE.** Testers judge whether control worked partly from the health banner; a stale-green read flag could present a dead read as healthy and make a never-confirming write look fine. Cheap, high trust-value. **Include.**
- **-64 (TB read flag): IN SCOPE (cred-validity part).** The sync-confirmation loop uses the read session; a bad read cred means writes never confirm. Prove the read cred; the *optional active probe* can defer.
- **-26 (Service Bus DLQ): OPTIONAL for control.** The control write/confirm path is TB shared-attribute + poll — it does **not** traverse Service Bus, so the DLQ backlog does not corrupt control feedback. Only pull it in if the testers will also evaluate **call-ticket reconciliation** (which relies on ingest). Recommend scheduling it right after, not gating on it.
- **-25 (boot probe / missing Cosmos container): OPTIONAL.** Cosmos read+write already proven; lower runtime risk. Defer.
- **Security hard gates: -15 (rotate compromised creds) + -18 (scoped write cred).** Non-negotiable even for the safe audience — blast-radius and credential hygiene are about the *estate*, not the testers' competence. **-31/-32** are the hygiene follow-through.

---

## 7. Decisions for James (top 3)

1. **Confirm the stub drop.** Approve removing **-9/-10** (stub build + stubbed pass) and **-13** (writes-off pilot) from this release, folding **-14** into **-11 + -19**, on the basis that the audience validates on the asset. (Reversible: stub stays in backlog for a future external/handler rollout.)
2. **Control authorisation policy.** Given control dispatch is currently open to **handler(1500)**, decide: (a) accept handler-can-control and just document it (fastest — 4 accounts at 1500, add iot to one for kill-switch); or (b) tighten dispatch to iot-only, which then requires provisioning **iot(1400)** to all 4 and reworking the exact-match `requireRole`. Recommendation: (a) for this release.
3. **Who holds the kill-switch, and the -19 flip window.** Assign iot(1400) to at least one tester (or keep James on it), agree the moment to flip `WRITES_DISABLED=false`, and confirm the read+bridge health are green first. Also confirm the bridge-read gap (§5.1) owner and target date, since it currently blocks reaching any device.

---

## Couldn't determine
- **Validity** of `TB_USERNAME/TB_PASSWORD` (read) and `TB_WRITE_USERNAME/TB_WRITE_PASSWORD` (SR-3 write) in the live secret — both are *present/unproven*; needs a live auth test against `portal.lhlive.co.uk` (infra, out of read-only scope).
- **Bridge base URL reachability/contract** from the pod — needs a live probe / Spencer confirmation.
- Whether any tester already holds iot(1400) in B2C — provisioning is Spencer/IoT-team side.
