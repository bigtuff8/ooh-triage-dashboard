<!-- gate:contract
SECTION Overview: This is a planning gate, not code. It asks James to approve HOW a group of nine tickets should move through the harness stages (discovery, design, build, test, release) to safely turn on live device control for the internal IoT support team. Nothing here changes code or infra. The single most consequential step is OOHDASH-19 — flipping WRITES_DISABLED to false, which lets the dashboard write to real Salus heating kit at live trading sites.
SECTION Release scope: Nine Jira tickets (OOHDASH-8, -11, -12, -15, -18, -19, -24, -64, -67) plus one un-owned gap (the bridge inventory read / site-search 503). All nine are confirmed status "To Do" in Jira today. The release act is OOHDASH-19.
SECTION Stage-entry map: For each ticket, where it first enters the harness lifecycle and why. Some need Discovery (unknowns to prove), some need Design (a decision to make), some go straight to Build, and some sit in an external/ops or writer lane outside the code pipeline.
SECTION Three lanes: Work runs in three parallel streams — a Code lane (the plumbing and app changes), an External/ops lane (credential rotation, write-cred bench-proof, tester accounts — done by Spencer/ops, tracked as release conditions), and a Writer lane (the man-marking sign-off scripts). They converge at the release preflight for OOHDASH-19.
SECTION Operator gates: You will be asked to approve at five points — Discovery, Design, Build-PLAN, Test-results, and Release-preflight. Two other checkpoints are automated committee steps with no human.
SECTION Critical path: The fastest safe order. Security/ops items run throughout; a shared discovery proves the read/bridge health; the cheap safety fix (-12) lands early; design settles -24 and -67; then build/test; then the man-marking accept; then the -19 flip and a supervised shakedown.
SECTION Backlog playback: A one-glance table of every item in delivery order with a one-word stage.
SECTION Safety framing: Why -19 is the point of no return, what you have already accepted (-15, -18), and what still stands between here and the flip (-12, -24, and read/bridge health).
DECISION 1: Approve this shaping and stage-entry plan as the basis for the group release.
DECISION 2: OOHDASH-12 (invert the fail-open default) — fast-track it standalone now as an early safety win, OR batch it into the group Build-PLAN gate.
DECISION 3: The bridge inventory read gap (site-search 503 / F025 contract) has no clean owner — raise it as a new OOHDASH ticket, yes or no.
DECISION 4: Control-dispatch authorisation policy — accept that a handler (claimArea 1500) can already control and just document it, OR tighten dispatch to iot-only (which needs iot roles provisioned to all testers and a rework of the exact-match role check).
-->

# OOH IoT-Team Live-Control Release — Shaping & Stage-Entry Plan

**For:** James (operator) · **Date:** 2026-09-11 · **Type:** Governance / planning gate — *no code or infra changes*
**Project:** OOHDASH (`cloudId 980108f4-3398-44f5-8fde-336ffe4fa810`) · **Repo:** `github.com/bigtuff8/ooh-triage-dashboard`
**Verified against:** live repo `main` + Jira (all nine tickets confirmed **To Do**, 2026-09-11) + source plan `docs/project/IOT_TEAM_CONTROL_RELEASE_PIPELINE_2026-08-20.md`

---

## 1. What you are being asked to approve

This document decides **where each ticket in the group release enters the harness stage lifecycle** (discovery → design → build → test → release) and **the order the work should run in**. It is a planning artefact. Approving it does not change any code, credential, or deployment.

**Release goal (plain English):** let the internal IoT support team send *real* control commands (e.g. heating setpoints) to live devices from the OOH dashboard. Today every device write is locked off at deploy time. Turning it on is a deliberate, gated act.

**The release scope — nine tickets + one gap:**

| Item | Short summary | Jira status (verified) |
|---|---|---|
| OOHDASH-8 | Provision 4 IoT-support B2C tester accounts (handler / claimArea 1500) | To Do |
| OOHDASH-11 | Man-marking scripts + sign-off sheet | To Do |
| OOHDASH-12 | Invert `WRITES_DISABLED` fail-open → fail-safe default | To Do |
| OOHDASH-15 | Rotate compromised Lighthouse/Tuya + IoT WiFi credentials | To Do |
| OOHDASH-18 | Provision + bench-prove SR-3 scoped write credential | To Do |
| OOHDASH-19 | **Flip `WRITES_DISABLED=false` — the release act** | To Do |
| OOHDASH-24 | Fix `/healthz` stale-green health flag | To Do |
| OOHDASH-64 | Confirm ThingsBoard **read** credential actually authenticates | To Do |
| OOHDASH-67 | Decide + document control-dispatch authorisation policy | To Do |
| *(gap)* | **Bridge inventory read** — site-search 503 / F025 device contract | *no ticket — see Decision 3* |

**Terminal act:** OOHDASH-19 flips `WRITES_DISABLED=false`. Verified today: `config.js:87` reads `writesDisabled: env('WRITES_DISABLED') === 'true'` and `k8s/deployment.yaml:68` sets `WRITES_DISABLED="true"` in the live AKS deploy. The kill-switch checks this lock **first and synchronously**, before any database read (`services/killswitch.js:32`), so nothing writes to a device while the lock is on.

---

## 2. Stage-entry map — where each ticket enters the lifecycle

Per ticket: does it need **Discovery** (prove an unknown)? **Design** (make a decision)? **Build**? Which lane, and why.

| Ticket | Discovery | Design | Build | Lane | One-line rationale |
|---|:---:|:---:|:---:|---|---|
| **-64** TB read cred authenticates? | **YES** | cond. | cond. | Code | Current read state is unproven (`read=false`); design/build only if the cred is actually bad. |
| **bridge-read gap** | **YES** | — | cond. | Code + external | Site search 503s; needs Spencer/platform confirm of the F025 device contract. **Blocks reaching any device at all.** |
| **-67** dispatch authz policy | — | **YES** | cond. | Code | Decision gate. Build only if "iot-only" is chosen. See §5 finding. |
| **-24** /healthz stale-green | — | **YES** | **YES** | Code | Design the fix approach, then build. Couples with -64 (both are read-health trust). |
| **-12** invert fail-open default | — | — | **YES** | Code | One-line change. No unknowns, no decision — enters straight at **Build-PLAN**. |
| **-15** rotate compromised creds | — | — | — | External / ops | Security hard gate. Tracked as a release condition, no code pipeline. |
| **-18** bench-prove SR-3 write cred | light | — | — | External / ops + test | Provisioning + a bench verification. Light discovery on least-privilege scope. |
| **-8** provision 4 tester accounts | — | — | — | External / ops | Code fix already landed (commit `d1c177d`). Remainder is B2C provisioning + verify. |
| **-11** man-marking scripts + sign-off | — | — | — | Writer | Draft exists; needs the IoT lead to **accept** before the shakedown. |
| **-19** flip WRITES_DISABLED=false | — | — | — | Release | The release act. Gated on everything above + read/bridge health green. |

**Reading the "cond." cells:** *conditional* means the stage only runs if an earlier stage says it must — e.g. -64 only needs a build if discovery finds the read credential is genuinely broken.

---

## 3. The three parallel lanes

The work is not one queue. It runs as three streams that converge only at the release preflight.

- **Code lane.** A single shared **Discovery** pass across `-64` + `bridge-read` + "does a control command confirm end-to-end". Then a **Design** pass for `-24` and `-67`. Then per-ticket **Build → Test**. `-12` rides in at **Build-PLAN** needing no discovery or design.
- **External / ops lane** (`-15`, `-18`, `-8`). Runs in parallel throughout, owned by Spencer / ops. Tracked as **hard release conditions** rather than harness build tickets.
- **Writer lane** (`-11`). Runs in parallel. The man-marking sign-off must be **accepted by the IoT lead** before the live shakedown.

**Convergence:** all three lanes meet at the **Release-preflight** for `-19`.

---

## 4. The operator gates you will see

Five points ask for **your** decision. Two other checkpoints are automated (committee / no human).

| # | Gate | Human? | What you approve |
|---|---|:---:|---|
| 1 | **Discovery** | **YES — you** | The read/bridge/confirm-loop findings are sound and complete. |
| 2 | **Design** | **YES — you** | The -24 fix approach and the -67 authz decision. |
| 3 | **Build-PLAN** | **YES — you** | The build plan (this is where -12 enters). |
| — | Build-completion | no (committee) | Automated. |
| — | Test Stage-1 | no (committee) | Automated. |
| 4 | **Test-results (Stage-2)** | **YES — you** | The test evidence before release. |
| 5 | **Release-preflight** | **YES — you** | The final go/no-go before the -19 flip. |

---

## 5. Verified finding that changes -67 (read this before deciding §Decision 4)

**Control dispatch is NOT role-gated to `iot`.** Verified in the current repo:

- `routes/api.js:140` — `POST /control/dispatch` has **no `requireRole`**. It sits behind sign-in only.
- `routes/api.js:346` — the **only** `requireRole('iot')` is on the `/admin` sub-router (kill-switch / config).
- `services/auth.js:223` — `requireRole` is an **exact-match** check (`op.role !== role`), **not** a rank. So an `iot`-only gate would actively *exclude* a handler, not include them.

**Consequence:** the 4 testers at **handler (claimArea 1500)** can dispatch real control writes **as-is** once `WRITES_DISABLED=false`. They do **not** need the iot(1400) role to control. They need iot only to operate the kill-switch / admin page. This materially shrinks the -8 access work.

---

## 6. Recommended critical path

Run the ops/security lane throughout; sequence the code lane behind a single discovery.

```
-15  ∥  -18  ∥  -8              (run throughout — release conditions)
        │
        ▼
Discovery(-64 + bridge-read + confirm-loop)      ← Gate 1
        │
        ▼
-12  build + test               (land early — cheap safety win)
        │
        ▼
Design(-24, -67)                                 ← Gate 2
        │
        ▼
-24  build + test   (∥ any -64 / -67 code)       ← Gate 3 Build-PLAN, Gate 4 Test
        │
        ▼
-11  accept  (IoT lead sign-off)
        │
        ▼
Release-preflight                                ← Gate 5
        │
        ▼
-19  flip WRITES_DISABLED=false  →  supervised shakedown
```

**Cost / benefit of this ordering:** front-loading the shared discovery avoids three separate investigation passes (saves effort and calendar time). Landing `-12` early buys a safety win — the deploy lock becomes fail-*safe* — for the cost of one one-line change and a test. The main schedule risk sits in the **bridge-read gap**: it depends on Spencer/platform and, until it clears, no device can be reached to control, so it should start today even though it has no owner.

---

## 7. Backlog playback (delivery order)

| Order | Item | One-word stage |
|---|---|---|
| 1 | OOHDASH-15 rotate compromised creds | Ops |
| 2 | OOHDASH-18 bench-prove write cred | Ops |
| 3 | OOHDASH-8 provision tester accounts | Ops |
| 4 | bridge-read gap | Discovery |
| 5 | OOHDASH-64 TB read cred | Discovery |
| 6 | OOHDASH-12 invert fail-open default | Build |
| 7 | OOHDASH-67 dispatch authz policy | Design |
| 8 | OOHDASH-24 /healthz stale-green | Design |
| 9 | OOHDASH-11 man-marking sign-off | Writer |
| 10 | OOHDASH-19 flip WRITES_DISABLED=false | Release |

---

## 8. Open decisions for James

1. **Approve the shaping** — adopt this stage-entry plan and sequencing as the basis for the group release.
2. **OOHDASH-12 fast-track?** — land it standalone **now** as an early safety win, *or* batch it into the group Build-PLAN gate.
3. **Raise the bridge-read gap as a ticket?** — the site-search 503 / F025 contract gap has no clean owner; create a new OOHDASH ticket (owner: Spencer / IoT platform), yes or no.
4. **Control-dispatch authz policy (-67)** — (a) accept that a handler can already control and just document it (fastest; recommended for this trusted audience), *or* (b) tighten dispatch to iot-only, which needs iot(1400) provisioned to all testers and a rework of the exact-match `requireRole`.

---

## 9. Safety framing

**OOHDASH-19 is the single most consequential act in this release.** Flipping `WRITES_DISABLED=false` turns on **live writes to real Salus / heating kit at trading sites** — a wrong actuation is a physical event at a working restaurant, not a screen error. Everything else in the plan exists to make that one flip safe and reversible (kill-switch, scoped credential, man-marking sign-off, trustworthy health).

You have **already accepted** the two security hard gates — **-15** (rotate compromised creds) and **-18** (bench-prove the scoped write cred). What still stands between here and the flip: **-12** (fail-safe default), **-24** (trustworthy health banner), and **read + bridge health proven green**. The audience itself is the man-marker (they see and correct the hardware at source within seconds), which is why the earlier stub-first choreography was relaxed — but the credential, health, and sign-off guardrails stay.

---

*Line numbers cited are current as of repo `main` on 2026-09-11. All nine ticket statuses re-verified as "To Do" in Jira on the same date.*
