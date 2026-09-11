<!-- gate:contract
SECTION Blockers first: The three things that stop a real, confirmable control write today — each with a named owner. None can be closed from this repo alone; two need a live probe against systems Spencer/IoT own, one needs a live bridge probe. Read these before anything else.
SECTION What this is: A forensic current-state discovery for the shared code-lane pass on the OOH live-control release. It answers five questions the accepted shaping plan carried into Discovery: is the ThingsBoard READ credential really valid; is the bridge inventory read working; what exactly must be true for a write to land AND confirm; how many people gain dispatch at the flip; and does the handler UX already cover confirmation, feedback and a device-non-responsive state. Everything here is traced to a file line or a live system, or marked UNVERIFIED with the exact probe that would settle it.
SECTION Key verified findings: Plain-English answers to the five questions. In short: the READ health flag is lazy (starts false, only turns true after a successful call) so read=false is NOT proof of a bad credential — but it also is not proof of a good one; the bridge inventory read has a known device-contract gap (hot water and site names) even if the transport works; the write-confirm loop depends entirely on the READ session, so a bad read means writes fire but never confirm; dispatch is NOT role-gated, so every claimArea-1500 account gains control at the flip; and the CIR records exactly five such accounts stamped on 2026-09-11. The handler live-control UX (confirm, feedback, non-responsive state) is PRESENT in code.
SECTION The claimArea-1500 count: This bounds Decision 4. The CIR deploy doc records that on 2026-09-11 exactly five accounts (Sam, Meg, CJ, Tony @sccuk.com, Jonathan @airedale-group.co.uk) were stamped with claimArea 1500 — so the "handler can control" population is currently the five OOH people, NOT a wide group. That makes "accept and document" reasonable — but the number is a point-in-time count from the provisioning record, not a live enumeration, so it must be reconfirmed live before Decision 4 is put.
SECTION iot-only rework scope: If Decision 4 goes iot-only, this sizes the change. It is small in surface (one route gains a gate) but has a real trap: requireRole is exact-match, so a naive requireRole('iot') on dispatch would LOCK OUT every handler, which is the opposite of today. Getting iot-only right needs either iot provisioned to all operators OR a rank-aware role check — the register condition is correct that this is not a trivial one-liner.
SECTION Handler UX: Confirmed present in public/js/control.js — a compose+confirm step, a live sync tracker, and separate failed/rejected/timeout states that tell the handler "treat as not applied". No gap to ticket for the three required states. One design-gate item stands: there is no in-app signal that control has just gone live at the flip.
SECTION Requirements suite: The curatable findings/requirements, each separable so you can keep, cut or defer item by item, each with its outcome and source.
SECTION Options and risks: The real choices (mainly Decision 4 and how the read cred is proven) with their trade-offs, plus the risk register.
SECTION Scope for design: Data scope, CX success criteria and end-to-end test scope handed to the design doer.
SECTION Next step: The recommended first move and why.
DECISION 4 input: The sign-in-eligible claimArea-1500 population is currently FIVE named OOH accounts (CIR record, 2026-09-11), not a wide unknown group. This is the number the shaping register said Decision 4 waits on. Recommendation once reconfirmed live: (a) accept handler-can-control and document it is proportionate; (b) iot-only is available but needs the exact-match role check reworked or iot provisioned to all five.
DECISION read-cred: read=false in /healthz is a lazy-flag artefact, NOT evidence of a bad credential. Proving the read cred requires a live auth call to portal.lhlive.co.uk with the secret's TB_USERNAME/TB_PASSWORD — owner Spencer/IoT. Do not treat "read went true after a device read in the pod" and "a standalone auth probe" as the same evidence; either proves it, neither has been run from here.
-->

# Discovery — Control-Plumbing (shared code-lane pass)

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Discovery · **Date:** 2026-09-11
**Repo state (verified):** `main`, app v1.2.0, AKS ns `iot-services`, deploy `ooh-dashboard` (1 replica), `WRITES_DISABLED="true"`, `SMS_PROVIDER="log"`, `DATA_MODE="live"`, `AUTH_MODE="oidc"` (`k8s/deployment.yaml:54-71`).
**Scope:** current-state forensics for OOHDASH-64 (TB read cred), OOHDASH-75 (bridge inventory read), the control-confirm loop, and the four carried Discovery-gate conditions from `LIVE_CONTROL_RELEASE_SHAPING.md` §10.
**Method:** verified against deployed source on `main` + the Central Integration Repository. Anything not confirmable firsthand from here is marked **UNVERIFIED** with the exact probe + owner.

---

## 0. Blockers first (each with owner)

<table>
<thead>
<tr><th>#</th><th>Blocker</th><th>Current state</th><th>Confirming probe</th><th>Owner</th></tr>
</thead>
<tbody>
<tr><td>B1</td><td><strong>TB READ credential validity is unproven.</strong> The sync-confirmation loop reads through the READ session; a bad read cred means every write fires but never confirms (sits pending&rarr;timeout).</td><td><strong>UNVERIFIED.</strong> <code>read=false</code> in <code>/healthz</code> is a <em>lazy</em> flag (starts <code>false</code>, `tb-client.js:28`), so it is neither proof of a bad cred nor of a good one. Not testable from this repo.</td><td>Live <code>POST https://portal.lhlive.co.uk/api/auth/login</code> with the secret's <code>TB_USERNAME</code>/<code>TB_PASSWORD</code> (from k8s secret <code>ooh-dashboard-secrets</code>). 200 + a token = valid; 401 = genuine fault. CIR <code>THINGSBOARD_ALARM_ACCESS.md</code> §1 documents the login path.</td><td>Spencer / IoT platform</td></tr>
<tr><td>B2</td><td><strong>Bridge inventory read unproven from the pod (OOHDASH-75).</strong> Site search 503s; without it no site/device resolves, so no write can reach a device at all.</td><td><strong>UNVERIFIED transport + KNOWN contract gap.</strong> Code path is real (`bridge.js:100-132`) but the <code>/api/devices</code> contract is "provisional until Spencer confirms (F025)" and does <em>not</em> emit site name, brand, or a distinct hot-water device.</td><td>From the pod: <code>GET {BRIDGE_BASE_URL}/api/devices</code> (cluster-internal, `bridge.js:102`); confirm 200 + a flat device array, and confirm the F025 field contract. See §3.</td><td>Spencer / IoT platform</td></tr>
<tr><td>B3</td><td><strong>SR-3 write credential validity unproven</strong> (context; owned by OOHDASH-18, not this pass). The write session has never made a successful call.</td><td><strong>UNVERIFIED.</strong> <code>writeConfigured=true</code> (keys present) but <code>write=false</code> — same lazy-flag mechanism as B1 (`tb-client.js:28,150`).</td><td>Bench-prove per OOHDASH-18: a scoped-cred write to a bench device, then read <code>*SyncStatus</code> echoes back.</td><td>Spencer / IoT platform</td></tr>
</tbody>
</table>

> **Note on B1/B3 evidence hygiene:** two different things can flip `read`/`write` to `true` — (i) a real device read/write succeeding in the running pod, or (ii) a standalone auth probe. Neither has been run from here. Do not treat one as the other, and do not treat "the flag is still false" as "the cred is bad" — the flag is simply lazy.

---

## 1. OOHDASH-64 — ThingsBoard READ credential validity

**How read health is derived (verified).** `tbSession()` in `services/tb-client.js` creates a closure with `let healthy = false` (`tb-client.js:28`). `healthy` only becomes `true` after a *successful* `getToken()` or `request()` (`tb-client.js:34,47`), and is set back to `false` on any request error (`tb-client.js:51`). `tbStatus()` reports `read = readSession.isConfigured() && readSession.isHealthy()` (`tb-client.js:149`). Because nothing calls the read session at boot, `isHealthy()` returns its initial `false` until the first real device read runs.

**Verdict.** `read=false` is a **lazy health-flag artefact**, not by itself evidence of a bad credential against `portal.lhlive.co.uk`. It would read `false` even with a perfectly valid cred that simply has not been exercised yet. Equally, it is **not** evidence the cred is *good*. **UNVERIFIED** either way from this repo.

**What is knowable now from code/config:**
- Read cred keys are `TB_USERNAME`/`TB_PASSWORD`, sourced from the Spencer-managed secret `ooh-dashboard-secrets` (config.js:60-61; CIR `OOH_DASHBOARD_DEPLOY.md` §Config).
- TB base URL defaults to `https://portal.lhlive.co.uk` (`config.js:59`).
- The read session is the **only** path that reads `*SyncStatus`/`*Reported` (`tb-client.js:132-139`, used by `control.pollOne` at `control.js:173`). So a bad read cred does **not** block the write — it blocks the *confirmation*, leaving actions stuck `pending`&rarr;`timeout`.

**Exact confirming probe (owner: Spencer / IoT platform):**
1. Read `TB_USERNAME`/`TB_PASSWORD` from `ooh-dashboard-secrets` (or the temporary env override, if one exists per the CIR Zendesk-style pattern).
2. `POST https://portal.lhlive.co.uk/api/auth/login` with `{username, password}`. **200 + `token`** = cred valid (then `read` is genuinely healthy and OOHDASH-64 needs no code change — only the optional stale-green work of OOHDASH-24). **401** = genuine cred fault; rotate/reissue before the flip.
3. Alternatively, in the running pod, resolve one live device and hit `GET /api/control/actions/...` after a dispatch — `read` flips `true` on the first successful `readControlState`. Note: this needs the bridge read (B2) working first, so the standalone login probe is the cleaner isolation.

**Why it matters:** the sync-confirmation loop uses the read session — a bad read cred means writes never confirm, and the handler is shown a `timeout` ("treat as not applied") for a change that may actually have landed. That erodes the trust the whole release depends on.

---

## 2. OOHDASH-75 — bridge inventory read (site+device resolution)

**Current state (verified in code).** `services/bridge.js` reads live inventory from the integration-bridge `/api/devices` (`bridge.js:102`), a **flat device array** with **no site grouping**; `fetchLiveSites()` reconstructs sites by grouping on `accountId` (`bridge.js:100-132`), and `mapBridgeDevice()` adapts each device (`bridge.js:68-88`). `getSites()` throws on live-read failure (`bridge.js:144-149`); `routes/api.js:49-56` catches that and returns **503 "Device inventory unavailable — degraded mode"** on `GET /api/sites/search`. That 503 is the observed symptom.

**What resolves a site+device before a control write (verified path).** `control.dispatch()` calls `bridge.getSitesByNumber(siteNo)` (`control.js:58`) &rarr; must return **exactly one** site (`control.js:59`) &rarr; find the device by `deviceId` in `site.devices` (`control.js:61`) &rarr; device must be `online` (`control.js:63`). All four depend on the bridge read succeeding and the device contract being correct.

**What is broken / unproven (each traced):**

<table>
<thead><tr><th>Item</th><th>State</th><th>Evidence</th></tr></thead>
<tbody>
<tr><td>Transport / reachability of <code>/api/devices</code> from the pod</td><td><strong>UNVERIFIED</strong> — site search 503s; not probed from here</td><td>`bridge.js:102`, `api.js:51-56`; source plan §5.1</td></tr>
<tr><td>F025 device contract provisionality</td><td><strong>Provisional / unconfirmed</strong> by Spencer</td><td>`bridge.js:9-16, 50-67` explicit "unconfirmed/unversioned; F025 ownership pending"</td></tr>
<tr><td>Site name / brand / address / callsLast30Days</td><td><strong>Not in payload</strong> — <code>siteName</code> is proxied by <code>accountId</code>; brand/address/calls are <code>undefined</code></td><td>`bridge.js:120-129` (TODO: real site name needs registry/Zendesk lookup)</td></tr>
<tr><td>Hot-water CONTROL from live data</td><td><strong>Will NOT activate.</strong> Registry keys HW off <code>deviceType === 'salus-it500-dhw'</code>, but the bridge never emits that vendorId — a combi arrives as one <code>salus-it500</code> with a <code>hotWater</code> telemetry field</td><td>`bridge.js:57-67` KNOWN MISMATCH; `registry.js:27-31`; `api.js:107`</td></tr>
<tr><td>Heating (setpoint/frost) control from live data</td><td><strong>Should work</strong> — <code>deviceType</code> is set verbatim from <code>vendorId</code> to match registry keys <code>salus-it500</code>/<code>salus-it700</code></td><td>`bridge.js:50-56, 72`; `registry.js:12-26`</td></tr>
</tbody>
</table>

**Exact confirming probe (owner: Spencer / IoT platform):** from a shell in the `ooh-dashboard` pod, `curl {BRIDGE_BASE_URL}/api/devices` and confirm (a) HTTP 200, (b) a flat JSON array, (c) each element carries `deviceId`, `accountId`, `vendorId`, `isOnline`, `setpointC`, and whether a combi carries `hotWater`. Confirm/version the F025 contract in `docs/BRIDGE_CONTRACT.md`. **Why it matters:** this blocks reaching *any* device — it is the first thing that must be green before OOHDASH-19.

---

## 3. Control-confirm loop — preconditions for a write to land AND confirm

**Verified trace.** `POST /api/control/dispatch` (`api.js:140`, behind `requireAuth` only — `server.js:96`) &rarr; `control.dispatch()` runs five ordered server-side gates (`control.js:47-74`) &rarr; `tb.writeSharedAttribute()` posts a TB `SHARED_SCOPE` attribute with the **write** session (`tb-client.js:118-126`) &rarr; a poll loop (`control.js:158-210`) reads `*SyncStatus`/`*Reported` via the **read** session (`tb-client.js:132-139`) and marks `synced` **only** when `sync === 'synced' && String(reported) === String(value)` (`control.js:174`). HTTP 200 is never treated as "applied".

**Ordered gates (all must pass):**
<table>
<thead><tr><th>#</th><th>Gate</th><th>Source</th><th>Currently met?</th></tr></thead>
<tbody>
<tr><td>1</td><td>F004 confirm token for this site+operator</td><td>`control.js:49`</td><td>Runtime — met when the handler confirms the site</td></tr>
<tr><td>2</td><td>Kill-switch — <code>config.writesDisabled</code> checked FIRST, synchronously, before Cosmos</td><td>`killswitch.js:32`; `control.js:54`</td><td><strong>NOT met</strong> — <code>WRITES_DISABLED="true"</code> today (`deployment.yaml:68`). Every dispatch is 423 until the OOHDASH-19 flip</td></tr>
<tr><td>3</td><td>Site uniquely resolves + device online</td><td>`control.js:58-63`</td><td><strong>Blocked by B2</strong> (bridge read)</td></tr>
<tr><td>4</td><td>F009 registry guardrail (capability + value window)</td><td>`control.js:66`; `registry.js:73`</td><td>Met for Salus/Intesis heating; HW-boost blocked by the combi mismatch (§2)</td></tr>
<tr><td>5</td><td>The write via SR-3 scoped cred</td><td>`tb-client.js:125`</td><td><strong>Blocked by B3</strong> (write cred unproven)</td></tr>
<tr><td>6</td><td><em>Confirmation</em>: read session reads back <code>*SyncStatus=synced</code></td><td>`control.js:173-174`; `tb-client.js:137`</td><td><strong>Blocked by B1</strong> (read cred unproven) — without it, actions sit pending&rarr;timeout even if the write landed</td></tr>
</tbody>
</table>

**Unmet preconditions today (the delta):** #2 (deploy lock on — the release act), #3 (bridge read — B2), #5 (write cred — B3), #6 (read cred — B1). Gates #1 and #4 are code-sound and runtime-satisfiable. So the confirmable-write path has **four** open preconditions, of which three are external-owned probes and one is the deliberate release flip.

---

## 4. Carried Discovery-gate conditions (shaping §10)

### 4.1 True count of sign-in-eligible claimArea-1500 (handler) accounts — bounds Decision 4

**Verified mechanism.** Dispatch is **not** role-gated (§4.2), so at the flip every account whose token carries claimArea 1500 gains control. `mapRole()` maps 1500 &rarr; `handler` (`auth.js:185-198`; `config.js:48`).

**The count (from the authoritative provisioning record).** CIR `OOH_DASHBOARD_DEPLOY.md` (§Authorization, updated 2026-09-11) records that **exactly five** accounts were stamped with claimArea 1500 in the B2C `claims` array on 2026-09-11 and verified live: **Sam Day, Megan Mcsevney, Csaba Jakab, Tony Willetts** (all `@sccuk.com`) and **Jonathan Wilkinson** (`@airedale-group.co.uk`). No wider 1500 population is recorded. This is the number the shaping register said Decision 4 waits on: the "handler can control" group is currently the **five OOH people**, not a broad unknown cohort.

**Confidence + residual probe.** This is a **point-in-time provisioning record**, strong but not a live enumeration. **UNVERIFIED as a live count.** Confirming probe (owner: James / Spencer): enumerate docs in Cosmos account `airedale-knowledgebase` &rarr; DB `KnowledgeBase` &rarr; container `user` where the `claims` array contains `claimArea:1500` (CIR §Authorization documents the exact field/doc-id semantics). Run this immediately before Decision 4 to catch any 1500 grants made outside this OOH work.

**Implication for Decision 4:** with the population at five known OOH staff, **(a) accept handler-can-control and document it** is proportionate. The wide-group risk that would force iot-only does not appear to exist — subject to the live reconfirmation above.

### 4.2 iot-only rework scope for OOHDASH-67

**Verified facts.** `POST /control/dispatch` has **no** `requireRole` (`api.js:140`); the only `requireRole('iot')` is on the `/admin` sub-router (`api.js:346`). `requireRole` is **exact-match**: `op.role !== role` (`auth.js:223`), not a rank.

**Scope if dispatch is tightened to iot-only:**
- **Route surface is small:** exactly **one** route changes — add a gate to `/control/dispatch` (`api.js:140`). The three control sub-routes (`/control/actions/:id`, `/wait`) are status reads/extends; policy choice whether they follow.
- **The trap (why it is not a one-liner):** a naive `requireRole('iot')` would, because of exact-match, **exclude every handler** — the opposite of today, and it would lock out all five current operators unless they are also provisioned iot(1400). To make iot-only *work* you must either (i) provision iot to all operators who should dispatch, **or** (ii) rework the exact-match check into a rank/precedence-aware guard (the codebase already has `ROLE_PRECEDENCE` at `auth.js:175` to build on). The register condition that "the change may touch the role check itself, size it" is correct.
- **Ripple:** the code comment at `api.js:2-4` ("privileged routes add requireRole('iot')") and the UI (which today shows control to handlers) must be aligned to whichever policy lands.

### 4.3 Handler live-control UX — present or gap?

**Confirmed PRESENT (cite `public/js/control.js`):**
<table>
<thead><tr><th>Required state</th><th>Present?</th><th>Evidence</th></tr></thead>
<tbody>
<tr><td>Pre-dispatch confirmation</td><td><strong>Yes</strong></td><td>Compose phase shows an explicit target line "Sending to: &lt;site&gt; &rarr; &lt;deviceId&gt; (&lt;zone&gt;)" + guardrail text, and a deliberate <strong>"Send to device"</strong> action (`control.js:95-98`). Blocked-writes get a distinct "Control unavailable — use capture &amp; escalate" modal (`control.js:16-22`).</td></tr>
<tr><td>Post-dispatch feedback</td><td><strong>Yes</strong></td><td>Live sync tracker Sent &rarr; Confirming &rarr; Applied, "'Applied' only means device-confirmed", with `aria-live` announcements (`control.js:104-113`); success card only on `synced`/`late-synced` (`control.js:110,155`).</td></tr>
<tr><td>Device-non-responsive state</td><td><strong>Yes</strong></td><td>Distinct <code>failed</code>/<code>rejected</code> ("device refused… do not tell the caller it's done", `control.js:111`) and <code>timeout</code> ("hasn't confirmed… treat as NOT applied… keep watching", `control.js:112`), each routing to honest capture-and-escalate (`control.js:239-269`).</td></tr>
</tbody>
</table>

**No gap to ticket for the three required states.** One **design-gate** item remains open (already logged in shaping §10 as a hard Design requirement, not re-raised here): there is **no in-app signal that control has just gone live** at the flip — a handler may not realise they now hold dispatch. That is a Design decision, out of Discovery's remit to resolve.

---

## 5. Curatable findings & requirements suite

Each row is separable — keep, cut, or defer independently. "Src" is the grounding evidence.

<table>
<thead><tr><th>ID</th><th>Finding / requirement</th><th>Business outcome</th><th>Src</th><th>State</th></tr></thead>
<tbody>
<tr><td>R1</td><td>Prove the TB READ cred authenticates against <code>portal.lhlive.co.uk</code> before the flip</td><td>Writes actually confirm; handler feedback is trustworthy, not false-timeout</td><td>§1</td><td>Blocker B1</td></tr>
<tr><td>R2</td><td>Prove bridge <code>/api/devices</code> reachable from the pod + confirm/version the F025 contract</td><td>A device can be reached at all; site search stops 503-ing</td><td>§2</td><td>Blocker B2 (OOHDASH-75)</td></tr>
<tr><td>R3</td><td>Bench-prove the SR-3 scoped WRITE cred</td><td>The write lands with least-privilege blast-radius</td><td>§0 B3</td><td>OOHDASH-18</td></tr>
<tr><td>R4</td><td>Reconfirm the live claimArea-1500 count immediately before Decision 4</td><td>Authz decision is made on a live number, not a stale record</td><td>§4.1</td><td>5 recorded; reconfirm</td></tr>
<tr><td>R5</td><td>Decide + document dispatch authz policy (handler-can-control vs iot-only)</td><td>Access policy matches reality; code comment/UI/tests align</td><td>§4.2</td><td>OOHDASH-67 (Design)</td></tr>
<tr><td>R6</td><td>If iot-only: rework the exact-match role check OR provision iot to all operators</td><td>Tightening does not accidentally lock out every handler</td><td>§4.2</td><td>Conditional on R5</td></tr>
<tr><td>R7</td><td>Hot-water control from live data needs a product/data decision (combi split vs re-key DHW off telemetry.hotWater)</td><td>HW-boost works on real sites, or is knowingly out of scope for this release</td><td>§2</td><td>F025 decision</td></tr>
<tr><td>R8</td><td>Add an in-app "control is now live" signal at the flip</td><td>Handlers know they hold dispatch; no silent capability change</td><td>§4.3</td><td>Design-gate (hard)</td></tr>
<tr><td>R9</td><td>OOHDASH-24 stale-green /healthz fix so a dead read cannot present as healthy</td><td>Testers trust the health banner when judging control</td><td>§1</td><td>OOHDASH-24 (Design)</td></tr>
</tbody>
</table>

---

## 6. Options with traceability

**Option set A — Dispatch authorisation (OOHDASH-67 / Decision 4).** Serves R4, R5, R6.
<table>
<thead><tr><th>Option</th><th>What it entails</th><th>Serves</th><th>Cost</th><th>When it's right</th></tr></thead>
<tbody>
<tr><td>A1 — Accept handler-can-control, document it</td><td>No code change to the gate; align the comment/UI/tests; document that the five 1500 accounts hold dispatch</td><td>R5</td><td>Low</td><td>If the live 1500 count (R4) stays at the five known OOH staff — <strong>recommended</strong></td></tr>
<tr><td>A2 — Tighten to iot-only</td><td>Gate <code>/control/dispatch</code> + rework exact-match role check OR provision iot(1400) to all operators</td><td>R5, R6</td><td>Medium (the role-check trap, §4.2)</td><td>Only if R4 reveals a wide 1500 population beyond OOH</td></tr>
</tbody>
</table>

**Option set B — Proving the READ cred (OOHDASH-64).** Serves R1.
<table>
<thead><tr><th>Option</th><th>What it entails</th><th>Cost</th></tr></thead>
<tbody>
<tr><td>B-i — Standalone login probe</td><td>One <code>POST /api/auth/login</code> with the secret creds; isolates the cred from the bridge dependency — <strong>recommended first</strong></td><td>Very low</td></tr>
<tr><td>B-ii — In-pod end-to-end read</td><td>Resolve a live device and observe <code>read</code> flip true after a real <code>readControlState</code>; needs B2 green first</td><td>Low, but coupled to bridge</td></tr>
</tbody>
</table>

---

## 7. Risk register

<table>
<thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr></thead>
<tbody>
<tr><td>Read cred is actually invalid &rarr; writes fire but never confirm; handler sees false "timeout / not applied"</td><td>Unknown (UNVERIFIED)</td><td>High — erodes trust in the whole feature</td><td>R1 login probe before the flip; OOHDASH-24 so a dead read can't show green</td></tr>
<tr><td>Bridge contract shifts unversioned (F025) &rarr; site/device resolution silently wrong</td><td>Medium</td><td>High — wrong device targeted or none resolves</td><td>R2 confirm + version <code>docs/BRIDGE_CONTRACT.md</code>; site uniqueness gate (`control.js:59`) already fails safe</td></tr>
<tr><td>HW-boost attempted on a combi that never presents as <code>salus-it500-dhw</code></td><td>Low (guardrail blocks it)</td><td>Low-Medium — feature silently absent, not a mis-fire</td><td>R7 product decision; today the registry safely refuses (`registry.js:98`)</td></tr>
<tr><td>iot-only tightening locks out all handlers via exact-match</td><td>Medium if A2 chosen naively</td><td>High — nobody can dispatch</td><td>R6 — rank-aware check or provision iot to all; test both roles</td></tr>
<tr><td>A wide 1500 population exists outside OOH and all gain dispatch at the flip</td><td>Low (record shows five)</td><td>High if true</td><td>R4 live enumeration immediately before Decision 4</td></tr>
</tbody>
</table>

---

## 8. Handoffs to Design

**Data scope (design turns into the data dictionary).**
- **Entities:** `site` `{siteNo, siteName, brand, address, callsLast30Days, devices[]}` and `device` `{deviceId, zone, deviceType, kind, online, telemetry{heatingSetpoint, mode, hotWater, ...}, schedule?}` — canonical shape at `bridge.js:13-16, 68-88`. Origin: integration-bridge `/api/devices` (live) — note `siteName/brand/address/callsLast30Days` are **not** on the wire today (§2).
- **Control attributes** (the only writable fields): `setpointDesired`/`modeDesired`/`hwBoostHoursDesired`, each with a `*Reported`/`*SyncStatus` write-back pair (`tb-client.js:15-19`).
- **Durable docs:** `OohAuditLog`, `OohAppConfig` (kill-switch), `OohOverrides`, `OohSmsLog` in Cosmos (`store.js:135`). Sensitivity: audit + operator identity — retention/PII to be catalogued by design. Operator PII comes from the B2C id_token (`auth.js:325-331`).

**CX success criteria (design realises these).**
- **Persona–journey:** an OOH handler on a live call, time-pressured, acting on a caller's cold/hot-water complaint; journey = search site &rarr; confirm site &rarr; read live state &rarr; compose change &rarr; dispatch &rarr; wait for device echo &rarr; tell the caller the truth. The handler is often the sole point of contact at 2am.
- **Reassurance-vs-friction calibration:** the **dispatch** step is high-stakes and irreversible at the device — it **wants** a deliberate confirmation checkpoint (present today, `control.js:98`). The **status polling** step wants to get out of the way (auto, `aria-live`, no clicks — present). The **failed/timeout** step wants a hard, unmissable checkpoint ("do not tell the caller it's done" — present).
- **"Great looks like…":** the handler never tells a caller a change is done unless the device confirmed it; a blocked/failed/non-responsive device always routes to an honest capture-and-escalate; and — **the one open design item** — at the flip the handler is positively told control is now available (R8), rather than discovering it.

**End-to-end test scope (design turns into scripts + data).** Prove, once built:
- Happy: setpoint raise on a Salus &rarr; `synced` &rarr; caller-safe "applied" card + ticket.
- Guardrail: setpoint outside ±3°C/25°C &rarr; 422, no write.
- Kill-switch/deploy-lock: with `WRITES_DISABLED=true` &rarr; 423 "Control unavailable" modal, no write.
- Non-responsive: IT700 slow-echo &rarr; `timeout` &rarr; "treat as not applied" &rarr; escalate; late echo &rarr; `late-synced` ticket note.
- Failed/rejected: device rejects &rarr; honest escalate, never a success card.
- Authz (per Decision 4): a handler can/cannot dispatch as policy dictates; a handler is not locked out if iot-only is chosen; kill-switch admin remains iot-only.
- Read-fault simulation: with a broken read, a landed write must not silently show "applied".

---

## 9. Recommended next step

**First move: run the two isolation probes B1 (TB read login) and B2 (bridge `/api/devices` from the pod) — owner Spencer / IoT platform — before any design or build.** They are the two unknowns that gate everything downstream: B2 decides whether a device can be reached at all, and B1 decides whether a write can ever confirm. Both are cheap, both are external-owned, and both are currently **UNVERIFIED** from this repo. Run B1 as the standalone login probe (Option B-i) so the read cred is judged independently of the bridge.

In parallel (non-blocking, Design-lane): reconfirm the live claimArea-1500 count (R4) so Decision 4 can be put at the Design gate on a live number — the current record shows **five** known OOH accounts, which points to Option **A1 (accept handler-can-control and document it)** as proportionate.

**Handler live-control UX is confirmed present** (pre-dispatch confirmation, post-dispatch feedback, device-non-responsive state) — no gap to ticket there; the only open UX item is the "control is now live" signal, which is already a hard Design-gate requirement.

---

*All line numbers cited against repo `main`, 2026-09-11. UNVERIFIED items each name the exact probe + owner that would confirm them. This artefact does not invoke reviewers or the next stage — the Orchestrator governs the Discovery gate.*
