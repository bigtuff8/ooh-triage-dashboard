<!-- gate:contract
SECTION Overview: This is a planning gate, not code. It asks James to approve HOW a group of nine tickets should move through the harness stages (discovery, design, build, test, release) to safely turn on live device control for the internal IoT support team. Nothing here changes code or infra. The single most consequential step is OOHDASH-19 — flipping WRITES_DISABLED to false, which lets the dashboard write to real Salus heating kit at live trading sites.
SECTION Release scope: Nine Jira tickets (OOHDASH-8, -11, -12, -15, -18, -19, -24, -64, -67) plus one un-owned gap (the bridge inventory read / site-search 503). All nine are confirmed status "To Do" in Jira today. The release act is OOHDASH-19. The bridge-read gap is now a PREREQUISITE of approving this plan: it must be raised as a new OOHDASH ticket with a named owner (Spencer / IoT platform) before Discovery begins — it is not an open yes/no decision.
SECTION Stage-entry map: For each ticket, where it first enters the harness lifecycle and why. Some need Discovery (unknowns to prove), some need Design (a decision to make), some go straight to Build, and some sit in an external/ops or writer lane outside the code pipeline.
SECTION Three lanes: Work runs in three parallel streams — a Code lane (the plumbing and app changes), an External/ops lane (credential rotation, write-cred bench-proof, tester accounts — done by Spencer/ops, tracked as release conditions), and a Writer lane (the man-marking sign-off scripts). They converge at the release preflight for OOHDASH-19.
SECTION Operator gates: You will be asked to approve at five points — Discovery, Design, Build-PLAN, Test-results, and Release-preflight. Two other checkpoints are automated committee steps with no human.
SECTION Critical path: The fastest safe order. Security/ops items run throughout; a shared discovery proves the read/bridge health AND establishes the true count of sign-in-eligible claimArea-1500 accounts; the cheap safety fix (-12, gated on an environment-config audit) lands early; design settles -24 and -67; then build/test; then the man-marking accept; then the -19 flip and a pre-specified supervised shakedown.
SECTION Backlog playback: A one-glance table of every item in delivery order with a one-word stage.
SECTION Safety framing: Why -19 is the point of no return, what you have already accepted (-15, -18), and what still stands between here and the flip (-12, -24, and read/bridge health). Also states a verified fact: WRITES_DISABLED is read once at pod startup and cached, so both the flip AND any emergency re-disable require a manifest edit plus a rolling pod restart — neither is instantaneous.
DECISION 1: Approve this shaping and stage-entry plan as the basis for the group release.
DECISION 2: OOHDASH-12 (invert the fail-open default) — fast-track it standalone now as an early safety win, OR batch it into the group Build-PLAN gate. Either way it is gated on an environment-config audit (it is not a "no unknowns" one-liner).
DECISION 4: Control-dispatch authorisation policy — OPEN, not pre-recommended. It cannot be put to James until Discovery establishes the actual count of sign-in-eligible claimArea-1500 accounts (potentially far more than the 4 testers; every one gains dispatch at the flip). Only then choose: accept handler-can-control and document it, OR tighten dispatch to iot-only (needs iot roles provisioned to all testers and a rework of the exact-match role check).
NOTE on prerequisites: The bridge inventory read gap is no longer a decision — it is a prerequisite (must be ticketed + owned before Discovery). The supervised shakedown must be fully specified before Release-preflight (named supervisor, isolated/bench test device for first actuation, explicit success criteria, and a re-disable/abort trigger) — not improvised on the day.
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

<table>
<thead>
<tr><th>Item</th><th>Short summary</th><th>Jira status (verified)</th></tr>
</thead>
<tbody>
<tr><td>OOHDASH-8</td><td>Provision 4 IoT-support B2C tester accounts (handler / claimArea 1500)</td><td>To Do</td></tr>
<tr><td>OOHDASH-11</td><td>Man-marking scripts + sign-off sheet</td><td>To Do</td></tr>
<tr><td>OOHDASH-12</td><td>Invert <code>WRITES_DISABLED</code> fail-open &rarr; fail-safe default</td><td>To Do</td></tr>
<tr><td>OOHDASH-15</td><td>Rotate compromised Lighthouse/Tuya + IoT WiFi credentials</td><td>To Do</td></tr>
<tr><td>OOHDASH-18</td><td>Provision + bench-prove SR-3 scoped write credential</td><td>To Do</td></tr>
<tr><td>OOHDASH-19</td><td><strong>Flip <code>WRITES_DISABLED=false</code> — the release act</strong></td><td>To Do</td></tr>
<tr><td>OOHDASH-24</td><td>Fix <code>/healthz</code> stale-green health flag</td><td>To Do</td></tr>
<tr><td>OOHDASH-64</td><td>Confirm ThingsBoard <strong>read</strong> credential actually authenticates</td><td>To Do</td></tr>
<tr><td>OOHDASH-67</td><td>Decide + document control-dispatch authorisation policy</td><td>To Do</td></tr>
<tr><td><em>(gap)</em></td><td><strong>Bridge inventory read</strong> — site-search 503 / F025 device contract</td><td><em>no ticket — see Decision 3</em></td></tr>
</tbody>
</table>

**Terminal act:** OOHDASH-19 flips `WRITES_DISABLED=false`. Verified today: `config.js:87` reads `writesDisabled: env('WRITES_DISABLED') === 'true'` and `k8s/deployment.yaml:68` sets `WRITES_DISABLED="true"` in the live AKS deploy. The kill-switch checks this lock **first and synchronously**, before any database read (`services/killswitch.js:32`), so nothing writes to a device while the lock is on.

**Verified read-timing (matters for how fast the flip — and any rollback — takes effect):** `config.js` builds `export const config = {...}` **once at module import**, evaluating `writesDisabled: env('WRITES_DISABLED') === 'true'` a **single time at process start**. The value is therefore **cached at pod startup, not read per request**. Consequence, stated plainly: the OOHDASH-19 flip requires **editing the manifest env AND performing a rolling pod restart** to take effect — it is **not instantaneous**. The exact same is true in reverse: an **emergency re-disable is not instant either** — rollback speed equals the time to roll the pods. This shapes what the Release-preflight and the shakedown abort trigger must expect (see §9).

---

## 2. Stage-entry map — where each ticket enters the lifecycle

Per ticket: does it need **Discovery** (prove an unknown)? **Design** (make a decision)? **Build**? Which lane, and why.

<table>
<thead>
<tr><th>Ticket</th><th>Discovery</th><th>Design</th><th>Build</th><th>Lane</th><th>One-line rationale</th></tr>
</thead>
<tbody>
<tr><td><strong>-64</strong> TB read cred authenticates?</td><td><strong>YES</strong></td><td>cond.</td><td>cond.</td><td>Code</td><td>Current read state is unproven (<code>read=false</code>); design/build only if the cred is actually bad.</td></tr>
<tr><td><strong>bridge-read gap</strong> <em>(PREREQUISITE)</em></td><td><strong>YES</strong></td><td>—</td><td>cond.</td><td>Code + external</td><td>Site search 503s; needs Spencer/platform confirm of the F025 device contract. <strong>Blocks reaching any device at all.</strong> <strong>Must be ticketed + owned (Spencer / IoT platform) BEFORE Discovery begins — a prerequisite of approving this plan, not an open decision.</strong></td></tr>
<tr><td><strong>-67</strong> dispatch authz policy</td><td><strong>YES</strong></td><td><strong>YES</strong></td><td>cond.</td><td>Code</td><td>Discovery must first establish the true count of sign-in-eligible claimArea-1500 accounts (see §5); the authz decision is <strong>open</strong> until that number exists. Build only if "iot-only" is chosen.</td></tr>
<tr><td><strong>-24</strong> /healthz stale-green</td><td>—</td><td><strong>YES</strong></td><td><strong>YES</strong></td><td>Code</td><td>Design the fix approach, then build. Couples with -64 (both are read-health trust).</td></tr>
<tr><td><strong>-12</strong> invert fail-open default</td><td>light</td><td>—</td><td><strong>YES</strong></td><td>Code</td><td>Small change, but <strong>NOT "no unknowns"</strong>: inverting the fail-open default silently changes behaviour in any environment that omits <code>WRITES_DISABLED</code>. Gated on an <strong>environment-config audit</strong> (dev / staging / CI + any compose or local <code>.env</code> templates + the k8s manifest) before it lands.</td></tr>
<tr><td><strong>-15</strong> rotate compromised creds</td><td>—</td><td>—</td><td>—</td><td>External / ops</td><td>Security hard gate. Tracked as a release condition, no code pipeline.</td></tr>
<tr><td><strong>-18</strong> bench-prove SR-3 write cred</td><td>light</td><td>—</td><td>—</td><td>External / ops + test</td><td>Provisioning + a bench verification. Light discovery on least-privilege scope.</td></tr>
<tr><td><strong>-8</strong> provision 4 tester accounts</td><td>—</td><td>—</td><td>—</td><td>External / ops</td><td>Code fix already landed (commit <code>d1c177d</code>). Remainder is B2C provisioning + verify.</td></tr>
<tr><td><strong>-11</strong> man-marking scripts + sign-off</td><td>—</td><td>—</td><td>—</td><td>Writer</td><td>Draft exists; needs <strong>defined scenario coverage + explicit pass criteria</strong>, then IoT-lead <strong>accept</strong> — not just a bare sign-off — before the shakedown.</td></tr>
<tr><td><strong>-19</strong> flip WRITES_DISABLED=false</td><td>—</td><td>—</td><td>—</td><td>Release</td><td>The release act. Gated on everything above + read/bridge health green.</td></tr>
</tbody>
</table>

**Reading the "cond." cells:** *conditional* means the stage only runs if an earlier stage says it must — e.g. -64 only needs a build if discovery finds the read credential is genuinely broken.

---

## 3. The three parallel lanes

The work is not one queue. It runs as three streams that converge only at the release preflight.

- **Code lane.** A single shared **Discovery** pass across `-64` + `bridge-read` + "does a control command confirm end-to-end" + **the true count of sign-in-eligible claimArea-1500 accounts** (the -67 authz input, see §5) + **a check that handler-facing live-control UX exists** (see below). Then a **Design** pass for `-24` and `-67`. Then per-ticket **Build → Test**. `-12` rides in at **Build-PLAN** but carries a **light environment-config audit** first (it is not a no-unknowns one-liner).
- **External / ops lane** (`-15`, `-18`, `-8`). Runs in parallel throughout, owned by Spencer / ops. Tracked as **hard release conditions** rather than harness build tickets.
- **Writer lane** (`-11`). Runs in parallel. The man-marking scripts must carry **defined scenario coverage + pass criteria** and then be **accepted by the IoT lead** before the live shakedown.

**Prerequisite before this lane starts:** the **bridge-read gap must already be a ticketed, owned OOHDASH item** (Spencer / IoT platform). It is a condition of approving the plan, not work to be scheduled inside the lane.

**Handler live-control UX (Discovery / Design check).** Because control dispatch is high-stakes and **irreversible** at the device, Discovery/Design must confirm the handler-facing UX already exists — a **pre-dispatch confirmation**, **post-dispatch feedback**, and a **device-non-responsive state** — or capture the gap as a ticket. Related design consideration for `-67` / `-24`: a handler may not realise they hold device-control access once the flag flips, because there is **no in-app signal** that control is now live; whether to add one is a design call, not a silent assumption.

**Convergence:** all three lanes meet at the **Release-preflight** for `-19`.

---

## 4. The operator gates you will see

Five points ask for **your** decision. Two other checkpoints are automated (committee / no human).

<table>
<thead>
<tr><th>#</th><th>Gate</th><th>Human?</th><th>What you approve</th></tr>
</thead>
<tbody>
<tr><td>1</td><td><strong>Discovery</strong></td><td><strong>YES — you</strong></td><td>The read/bridge/confirm-loop findings are sound and complete.</td></tr>
<tr><td>2</td><td><strong>Design</strong></td><td><strong>YES — you</strong></td><td>The -24 fix approach and the -67 authz decision.</td></tr>
<tr><td>3</td><td><strong>Build-PLAN</strong></td><td><strong>YES — you</strong></td><td>The build plan (this is where -12 enters).</td></tr>
<tr><td>—</td><td>Build-completion</td><td>no (committee)</td><td>Automated.</td></tr>
<tr><td>—</td><td>Test Stage-1</td><td>no (committee)</td><td>Automated.</td></tr>
<tr><td>4</td><td><strong>Test-results (Stage-2)</strong></td><td><strong>YES — you</strong></td><td>The test evidence before release.</td></tr>
<tr><td>5</td><td><strong>Release-preflight</strong></td><td><strong>YES — you</strong></td><td>The final go/no-go before the -19 flip.</td></tr>
</tbody>
</table>

---

## 5. Verified finding on -67 — plus the Discovery task it makes mandatory

**Control dispatch is NOT role-gated to `iot`.** Verified in the current repo:

- `routes/api.js:140` — `POST /control/dispatch` has **no `requireRole`**. It sits behind sign-in only.
- `routes/api.js:346` — the **only** `requireRole('iot')` is on the `/admin` sub-router (kill-switch / config).
- `services/auth.js:223` — `requireRole` is an **exact-match** check (`op.role !== role`), **not** a rank. So an `iot`-only gate would actively *exclude* a handler, not include them.

**Consequence:** anyone signed in at **handler (claimArea 1500)** can dispatch real control writes **as-is** once `WRITES_DISABLED=false`. They do **not** need the iot(1400) role to control. They need iot only to operate the kill-switch / admin page.

**Open question this raises — a required Discovery task before Decision 4.** The plan has been treating "handler can control" as if it only touches the 4 named testers. That is **not established**. claimArea 1500 may contain **far more than 4 sign-in-eligible accounts**, and at the flip **every one of them gains dispatch**. Before the -67 authz policy (Decision 4) can be put to James, Discovery **must establish the actual count of sign-in-eligible claimArea-1500 accounts** and who they are. Until that number exists, Decision 4 is **genuinely open** — it is not safe to pre-recommend "accept and document". If the population turns out to be just the testers, "accept" becomes reasonable; if it is a wide group, the iot-only tightening may be required. The finding above only tells us *how* the role check behaves — not *how many people* it currently lets through.

---

## 6. Recommended critical path

Run the ops/security lane throughout; sequence the code lane behind a single discovery.

The sequence, top to bottom, is:

0. **Prerequisite (before anything starts):** the **bridge-read gap is raised as a new OOHDASH ticket with a named owner** (Spencer / IoT platform). The plan is not approved without this.
1. **Throughout (release conditions, running in parallel):** `-15`, `-18` and `-8` — the ops/security lane runs the whole time, not as a blocking first step.
2. **Discovery** of `-64` + bridge-read + the confirm-loop + **the sign-in-eligible claimArea-1500 account count** (the -67 input) + **the handler live-control UX check** — this is **Gate 1** (operator).
3. **`-12` environment-config audit, then build + test** — land early as the cheap safety win, but only after the audit confirms no environment silently loses the lock.
4. **Design** of `-24` and `-67` — this is **Gate 2** (operator). Decision 4 is only put to James here, once the 1500 count from Discovery is in hand.
5. **`-24` build + test**, running in parallel with any `-64` / `-67` code — this passes through **Gate 3** (Build-PLAN) and **Gate 4** (Test-results).
6. **`-11` accept** — the IoT lead accepts the man-marking scripts against **defined scenario coverage + pass criteria**.
7. **Supervised shakedown specified** — the shakedown plan is written and agreed **before** Release-preflight (see §9 for the required contents).
8. **Release-preflight** — this is **Gate 5** (operator). Confirms the shakedown spec exists and that the flip's manifest-edit-plus-pod-roll steps (and the matching re-disable/abort path) are understood.
9. **`-19` flip `WRITES_DISABLED=false`** (manifest edit + rolling pod restart) — followed by the **pre-specified** supervised shakedown.

**Cost / benefit of this ordering:** front-loading the shared discovery avoids separate investigation passes (saves effort and calendar time) and, critically, surfaces the 1500 account count before the authz decision is forced. Landing `-12` early buys a safety win — the deploy lock becomes fail-*safe* — for the cost of a small change plus a light environment-config audit and a test; skipping the audit risks silently disabling the lock in a non-prod environment, which is why it is not treated as a free one-liner. The main schedule risk sits in the **bridge-read gap**: it depends on Spencer/platform and, until it clears, no device can be reached to control — which is exactly why it is now a **ticketed, owned prerequisite** rather than an open question.

---

## 7. Backlog playback (delivery order)

<table>
<thead>
<tr><th>Order</th><th>Item</th><th>One-word stage</th></tr>
</thead>
<tbody>
<tr><td>1</td><td>OOHDASH-15 rotate compromised creds</td><td>Ops</td></tr>
<tr><td>2</td><td>OOHDASH-18 bench-prove write cred</td><td>Ops</td></tr>
<tr><td>3</td><td>OOHDASH-8 provision tester accounts</td><td>Ops</td></tr>
<tr><td>0</td><td>bridge-read gap — raise + own the ticket</td><td>Prereq</td></tr>
<tr><td>4</td><td>bridge-read gap + claimArea-1500 account count + handler UX check</td><td>Discovery</td></tr>
<tr><td>5</td><td>OOHDASH-64 TB read cred</td><td>Discovery</td></tr>
<tr><td>6</td><td>OOHDASH-12 invert fail-open default</td><td>Build</td></tr>
<tr><td>7</td><td>OOHDASH-67 dispatch authz policy</td><td>Design</td></tr>
<tr><td>8</td><td>OOHDASH-24 /healthz stale-green</td><td>Design</td></tr>
<tr><td>9</td><td>OOHDASH-11 man-marking sign-off</td><td>Writer</td></tr>
<tr><td>10</td><td>OOHDASH-19 flip WRITES_DISABLED=false</td><td>Release</td></tr>
</tbody>
</table>

---

## 8. Open decisions for James

1. **Approve the shaping** — adopt this stage-entry plan and sequencing as the basis for the group release. Approval is conditional on the two **prerequisites** below being in place.
2. **OOHDASH-12 fast-track?** — land it standalone **now** as an early safety win, *or* batch it into the group Build-PLAN gate. Either way it is **gated on the environment-config audit** — it is a small change, but **not** a "no unknowns" one-liner (see §2).
3. **Control-dispatch authz policy (-67) — this decision is OPEN and cannot be taken yet.** It is presented **at Gate 2 (Design)**, not here, because it **depends on a Discovery output**: the actual count of sign-in-eligible claimArea-1500 accounts. Every such account gains dispatch at the flip, and that count is currently unproven. Once it exists, the choice is (a) accept that handlers can already control and document it, *or* (b) tighten dispatch to iot-only, which needs iot(1400) provisioned to all testers and a rework of the exact-match `requireRole`. **Neither option is pre-recommended.**

**Prerequisites (not decisions — these must be true for Decision 1 to hold):**

- **Bridge-read gap must be ticketed + owned.** The site-search 503 / F025 contract gap must be raised as a new OOHDASH ticket with a named owner (Spencer / IoT platform) **before Discovery begins**. It is a condition of approval, not a yes/no question.
- **Supervised shakedown must be specified before Release-preflight** (see §9) — named supervisor, isolated/bench test device for the first actuation, explicit success criteria, and a re-disable/abort trigger.

---

## 9. Safety framing

**OOHDASH-19 is the single most consequential act in this release.** Flipping `WRITES_DISABLED=false` turns on **live writes to real Salus / heating kit at trading sites** — a wrong actuation is a physical event at a working restaurant, not a screen error. Everything else in the plan exists to make that one flip safe and reversible (kill-switch, scoped credential, man-marking sign-off, trustworthy health).

You have **already accepted** the two security hard gates — **-15** (rotate compromised creds) and **-18** (bench-prove the scoped write cred). What still stands between here and the flip: **-12** (fail-safe default), **-24** (trustworthy health banner), and **read + bridge health proven green**. The audience itself is the man-marker (they see and correct the hardware at source within seconds), which is why the earlier stub-first choreography was relaxed — but the credential, health, and sign-off guardrails stay.

**Rollback is not instantaneous — plan for it.** As established in §1, `WRITES_DISABLED` is read **once at pod startup and cached**. So the flip takes effect only after a **manifest edit plus a rolling pod restart**, and — critically — an **emergency re-disable is equally slow**: to re-lock writes you must edit the manifest back and roll the pods again. There is **no instant off switch at the env level**. Your fast in-incident lever is the **kill-switch admin page** (checked first and synchronously per §1), not the env flag; the env re-disable is the durable backstop that lands at pod-roll speed. Release-preflight must confirm both paths are understood before go.

**The supervised shakedown — must be specified before Release-preflight, not improvised on the day.** The first actuation after the flip is a controlled test, and its plan is a **Release-lane requirement** that must be written and agreed **before** the Release-preflight gate. The spec must name:

- **A supervisor** — a named person who owns the shakedown and can call the abort.
- **The test device** — an **isolated / bench device for the first actuation, NOT a live trading site**. Only after the bench actuation confirms clean does a live-site test follow.
- **Explicit success criteria** — what a passing actuation looks like (command dispatched, device confirms, health stays green), written down in advance.
- **A re-disable / abort trigger** — the named condition that halts the shakedown and the agreed re-disable path, understood to run at **pod-roll speed** (kill-switch first for immediate stop, env re-disable as the durable backstop).

---

*Line numbers cited are current as of repo `main` on 2026-09-11. All nine ticket statuses re-verified as "To Do" in Jira on the same date.*
