<!-- gate:contract
SECTION Blockers first: The four things that stop a real, confirmable, SAFE control write today — each with a named owner. None can be closed from this repo alone. Two need a live probe against systems Spencer/IoT own, one needs a live bridge probe, and one is a pre-flip safety gap (the handler cannot see WHICH site they are dispatching to, because the site name is not on the wire — only an opaque accountId is). Read these before anything else.
SECTION What this is: A forensic current-state discovery for the shared code-lane pass on the OOH live-control release. It answers five questions the accepted shaping plan carried into Discovery: is the ThingsBoard READ credential really valid; is the bridge inventory read working; what exactly must be true for a write to land AND confirm; who actually gains dispatch at the flip; and does the handler UX already cover confirmation, feedback and a device-non-responsive state. Everything here is traced to a file line or a live system, or marked UNVERIFIED with the exact probe that would settle it.
SECTION Key verified findings: Plain-English answers to the five questions. In short: the READ health flag is lazy (starts false, only turns true after a successful call) so read=false is NOT proof of a bad credential — but it also is not proof of a good one; the bridge inventory read has a known device-contract gap (hot water and site names) even if the transport works; the write-confirm loop depends entirely on the READ session, so a bad read means writes fire but never confirm; dispatch is gated by requireAuth ONLY — there is NO role check on it — so the dispatch-capable population is EVERY user who can sign in to the dashboard, not the claimArea-1500 handler count; and the handler live-control UX (confirm, feedback, non-responsive state) is PRESENT in code, but the confirm step may show an opaque accountId rather than a recognisable site.
SECTION Who can dispatch (Decision 4): CORRECTED. Dispatch (POST /control/dispatch) has NO requireRole — it is behind requireAuth only. So the dispatch-capable population is not the claimArea-1500 count; it is anyone who can authenticate to the dashboard. The claimArea-1500 number (five, per the CIR record) bounds who holds the HANDLER claim, not who can dispatch. The real safety question for Decision 4 is therefore: what restricts who can sign in? (B2C app-registration user-assignment, a security group, or an OIDC audience restriction). That is UNVERIFIED. Until confirmed live, treat the dispatch population conservatively as "any authenticated tenant user" — which strengthens the case for an app-level dispatch gate (a dedicated control role/claim, or -67 iot-only) rather than relying on sign-in restriction alone. Do NOT close Decision 4 on the account count.
SECTION iot-only rework scope: If Decision 4 goes iot-only (an app-level dispatch gate), this sizes the change. It is small in surface (one route gains a gate) but has a real trap: requireRole is exact-match, so a naive requireRole('iot') on dispatch would LOCK OUT every handler, which is the opposite of today. Getting iot-only right needs either iot provisioned to all operators OR a rank-aware role check — the register condition is correct that this is not a trivial one-liner.
SECTION Handler UX: Confirmed present in public/js/control.js — a compose+confirm step, a live sync tracker, and separate failed/rejected/timeout states that tell the handler "treat as not applied". No gap to ticket for the three required states. But two safety-shaped items stand for Design: (1) the confirm-dispatch step may show an opaque accountId, not a recognisable site — a wrong-site dispatch is irreversible (pre-flip blocker B0); (2) there is no active signal that control has just gone live at the flip.
SECTION Confirm-loop timing: The poll-loop timeout is verifiable — syncTimeoutMs 90s, syncPollIntervalMs 3s, lateSyncWatchMs 600s (config.js:113-115). 90s is flagged as a Design/tuning question: on a live call the handler is holding a caller while deciding whether to escalate, and 90s of "Confirming…" may be too long to leave that decision open. Not asserted as validated.
SECTION Requirements suite: The curatable findings/requirements, each separable so you can keep, cut or defer item by item, each with its outcome and source.
SECTION Options and risks: The real choices (mainly Decision 4 and how the read cred is proven) with their trade-offs, plus the risk register.
SECTION Scope for design: Data scope, CX success criteria (including the hard site-identity and scope-clarity requirements) and end-to-end test scope handed to the design doer.
SECTION Next step: The recommended first move and why.
SECTION Accept-with-conditions register: The operator ACCEPTED this discovery WITH CONDITIONS after governed-panel review. A second round of panel findings (critical-thinker + customer-experience) is recorded as nine named, owned conditions carried into the Design stage (two also touch Release-preflight). None is claimed as solved — each is OPEN/TRACKED and gates the stage it is carried to. Read this register alongside the blockers.
DECISION gate outcome: ACCEPT-WITH-CONDITIONS. After governed Discovery-gate panel review, the operator accepted this discovery on condition that each round-2 panel finding is recorded as a named, owned condition carried into Design (two also to Release-preflight). The register in §10 holds all nine (5 critical-thinker + 4 customer-experience) as OPEN/TRACKED. Acceptance does NOT mean these are resolved; they gate the Design stage.
DECISION 4 input: The dispatch-capable population is NOT the claimArea-1500 count. Dispatch is behind requireAuth only (no role check, api.js:140), so it equals every user who can sign in to the dashboard. What restricts sign-in (B2C user-assignment / security group / OIDC audience) is UNVERIFIED and is a HARD precondition before Design commits to the authz pattern. Conservative default until proven: "any authenticated tenant user can dispatch". Recommendation: prefer an app-level dispatch gate (a dedicated control role/claim, or iot-only via -67) over relying on sign-in restriction alone; if iot-only, the exact-match role check must be reworked or iot provisioned to all who should dispatch.
DECISION read-cred: read=false in /healthz is a lazy-flag artefact, NOT evidence of a bad credential. Proving the read cred requires a live auth call to portal.lhlive.co.uk with the secret's TB_USERNAME/TB_PASSWORD — owner Spencer/IoT. Do not treat "read went true after a device read in the pod" and "a standalone auth probe" as the same evidence; either proves it, neither has been run from here.
-->

# Discovery — Control-Plumbing (shared code-lane pass)

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Discovery · **Date:** 2026-09-11
**Repo state (verified):** `main`, app v1.2.0, AKS ns `iot-services`, deploy `ooh-dashboard` (1 replica), `WRITES_DISABLED="true"`, `SMS_PROVIDER="log"`, `DATA_MODE="live"`, `AUTH_MODE="oidc"` (`k8s/deployment.yaml:54-71`).
**Scope:** current-state forensics for OOHDASH-64 (TB read cred), OOHDASH-75 (bridge inventory read), the control-confirm loop, and the four carried Discovery-gate conditions from `LIVE_CONTROL_RELEASE_SHAPING.md` §10.
**Method:** verified against deployed source on `main` + the Central Integration Repository. Anything not confirmable firsthand from here is marked **UNVERIFIED** with the exact probe + owner.

> **Gate outcome — ACCEPTED WITH CONDITIONS (2026-09-12).** After governed Discovery-gate panel review, the operator **accepted** this discovery **on condition** that each round-2 panel finding (critical-thinker + customer-experience) is recorded as a named, owned condition carried into **Design**. Those nine conditions are captured in **§10** as OPEN/TRACKED — honest, not resolved. Acceptance clears Discovery to proceed; the conditions **gate the Design stage** (two also gate Release-preflight). Do not read acceptance as "these are solved."

---

## 0. Blockers first (each with owner)

B0 is a pre-flip safety gap (site identity at the confirm step); B1/B2/B3 are external-owned probes. None closes from this repo alone.

<table>
<thead>
<tr><th>#</th><th>Blocker</th><th>Current state</th><th>Confirming probe</th><th>Owner</th></tr>
</thead>
<tbody>
<tr><td>B0</td><td><strong>PRE-FLIP SAFETY: the handler cannot see WHICH site they are dispatching to.</strong> <code>siteName</code>/brand/address are not on the wire — <code>accountId</code> proxies the site — so the dispatch confirmation ("Sending to: …") may show an opaque identifier. A wrong-site dispatch is irreversible at the device. This is a safety requirement, not a data-scope note.</td><td><strong>KNOWN GAP (verified in code).</strong> <code>fetchLiveSites()</code> sets <code>siteName = accountId</code> and leaves brand/address <code>undefined</code> (`bridge.js:120-129`, TODO: real site name needs registry/Zendesk lookup). The confirm line renders whatever the site object carries (`control.js:95-98`).</td><td>Design must specify a recognisable site identity (name/brand/address) at the confirm-dispatch step before the flip — sourced from the registry/Zendesk lookup the TODO names, or the F025 contract must be extended to carry it (ties to B2). Do not flip live control while the confirm shows only an <code>accountId</code>.</td><td>Design doer (requirement) + Spencer / IoT (data source, via B2)</td></tr>
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

**Verified trace.** `POST /api/control/dispatch` (`api.js:140`) is behind `requireAuth` **only** — there is **no `requireRole` on it** (verified: the only `requireRole('iot')` in `routes/api.js` is on the `/admin` sub-router at `api.js:346`; the header comment at `api.js:2-4` describes the intended-but-unapplied "privileged routes add `requireRole('iot')`" pattern). So **any authenticated session can dispatch** — see §4.1 for what this means for Decision 4. From there &rarr; `control.dispatch()` runs five ordered server-side gates (`control.js:47-74`) &rarr; `tb.writeSharedAttribute()` posts a TB `SHARED_SCOPE` attribute with the **write** session (`tb-client.js:118-126`) &rarr; a poll loop (`control.js:158-210`) reads `*SyncStatus`/`*Reported` via the **read** session (`tb-client.js:132-139`) and marks `synced` **only** when `sync === 'synced' && String(reported) === String(value)` (`control.js:174`). HTTP 200 is never treated as "applied".

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

**Confirm-loop timing (verified constants).** The poll loop runs at `config.control.syncPollIntervalMs` = **3000 ms** (`config.js:113`), gives up at `config.control.syncTimeoutMs` = **90000 ms / 90s** (`config.js:114`), and keeps a background late-echo watch for `lateSyncWatchMs` = **600000 ms / 10 min** (`config.js:115`). So the handler is shown "Confirming…" for **up to 90 seconds** before the loop surfaces `timeout` ("treat as not applied"); a device that echoes after 90s but within 10 min produces a `late-synced` ticket note rather than an in-session success.

**Assessment (flagged as a Design/tuning question, not asserted as validated).** 90s is a long time to hold a live caller while a handler decides whether to keep them on the line or escalate. Whether 90s is appropriate for this operational context — a caller waiting on the phone at 2am — is **not something this Discovery can validate**; it depends on real device echo latency (unknown until B1/B2 are green) and on handler call-handling norms. **Design must set/justify this timeout deliberately**, ideally splitting the handler-facing "decide now" horizon from the background late-echo window. Do not treat the device-non-responsive UX (§4.3) as fully validated until this timing is set against real echo latency.

---

## 4. Carried Discovery-gate conditions (shaping §10)

### 4.1 Who can actually dispatch — the real Decision 4 question (CORRECTED)

**The correction.** An earlier reading of this said "five claimArea-1500 accounts gain control." **That framing was wrong and is retracted.** Dispatch is gated by `requireAuth` **only** — there is **no role check on `POST /control/dispatch`** (verified: no `requireRole` at `api.js:140`; the only `requireRole('iot')` in the file is on `/admin` at `api.js:346`). Therefore:

- The **dispatch-capable population = every user who can authenticate to the OOH dashboard.** It is **not** the claimArea-1500 count.
- The claimArea-1500 number bounds **who holds the `handler` claim** (`mapRole()` maps 1500 &rarr; `handler`, `auth.js:185-198`; `config.js:48`) — i.e. who the UI treats as a handler — **not who can dispatch**. A signed-in user with any other role (or none mapped) still passes `requireAuth` and can `POST /control/dispatch`.

**So the real safety question for Decision 4 is: what restricts who can sign in to the dashboard at all?** In this codebase that is set outside the app — by the **B2C app-registration user-assignment** (is the app "assignment required", and to whom), and/or a **security group**, and/or an **OIDC audience/issuer restriction**. The app reads `OIDC_ISSUER`/`OIDC_CLIENT_ID` from env (`config.js:40-41`) but the *assignment policy* lives in Entra/B2C, not here.

**State: UNVERIFIED — this is a HARD precondition before Design commits to the authz pattern.**
Confirming probe (owner: **Spencer** / IoT platform):
1. Inspect the **B2C app registration** for this app: is user-assignment required, and which users/groups are assigned? That set — not the 1500 count — is the true dispatch-capable population.
2. Inspect the **OIDC config in the k8s secret** `ooh-dashboard-secrets` (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_ROLE_MAP`) to confirm the issuer/audience the app trusts and how broad the sign-in surface is.

**Conservative default until proven.** Treat the dispatch population as **"any authenticated tenant user"**. This is a wider, less-controlled surface than "five known handlers", and it **strengthens the case for an app-level dispatch gate** — a dedicated control role/claim, or the -67 iot-only route (§4.2) — **rather than relying on sign-in restriction alone.** Even if sign-in is tightly restricted, an in-app gate is defence-in-depth against the app being assigned more broadly later.

**Do not close Decision 4 on the account count.** The prior "accept handler-can-control on the strength of five accounts" recommendation is withdrawn; Decision 4 must be put on (a) the verified sign-in-eligible population **and** (b) a decision on whether to add an app-level dispatch gate — not on the 1500 enumeration alone.

**On the claimArea-1500 record itself (context, no longer the deciding number).** CIR `OOH_DASHBOARD_DEPLOY.md` (§Authorization, 2026-09-11) records five accounts stamped with claimArea 1500 (Sam Day, Megan Mcsevney, Csaba Jakab, Tony Willetts @sccuk.com; Jonathan Wilkinson @airedale-group.co.uk). That is a point-in-time provisioning record of who holds the handler claim, not a live enumeration and **not** the dispatch population. It remains worth reconfirming live (Cosmos `airedale-knowledgebase` &rarr; `KnowledgeBase` &rarr; `user`, `claims` contains `claimArea:1500`), but it does not settle Decision 4.

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
<tr><td>Pre-dispatch confirmation</td><td><strong>Present, but UNSAFE as-is</strong></td><td>The compose phase renders a "Sending to: &lt;site&gt; &rarr; &lt;deviceId&gt; (&lt;zone&gt;)" line + guardrail text and a deliberate <strong>"Send to device"</strong> action (`control.js:95-98`); blocked-writes get a distinct "Control unavailable — use capture &amp; escalate" modal (`control.js:16-22`). <strong>But &lt;site&gt; is currently the opaque <code>accountId</code></strong> (B0 / §2), so the handler confirms against an identifier they cannot recognise. This is a pre-flip safety blocker, not a passing state.</td></tr>
<tr><td>Post-dispatch feedback</td><td><strong>Yes</strong></td><td>Live sync tracker Sent &rarr; Confirming &rarr; Applied, "'Applied' only means device-confirmed", with `aria-live` announcements (`control.js:104-113`); success card only on `synced`/`late-synced` (`control.js:110,155`).</td></tr>
<tr><td>Device-non-responsive state</td><td><strong>Yes</strong></td><td>Distinct <code>failed</code>/<code>rejected</code> ("device refused… do not tell the caller it's done", `control.js:111`) and <code>timeout</code> ("hasn't confirmed… treat as NOT applied… keep watching", `control.js:112`), each routing to honest capture-and-escalate (`control.js:239-269`).</td></tr>
</tbody>
</table>

**The three device-state transitions exist; the surrounding safety does not yet.** The failed/rejected/timeout wiring is present, but three items are hard requirements for Design (each is a CX success-criterion below, not a Discovery fix):

- **Site identity at confirm (hard, safety).** The confirm step must show a **recognisable site — name/brand/address — not an opaque `accountId`** (B0 / §2). A wrong-site dispatch is irreversible; the handler must be able to read the site back before sending.
- **Hot-water scope clarity in-app (hard).** HW control silently fails from live data (the F025 DHW mismatch, §2): a handler could compose a hot-water change that will never surface. Design must make the **scope explicit in-app** — the handler is told *in advance* to route HW complaints to capture-and-escalate, rather than attempting a control that will not land.
- **Active "control is now live" notification at the flip (hard).** There is **no in-app signal that control has just gone live**. Design must make this an **active notification** — a banner or first-use prompt at the flip — not passive discovery. A handler must not first learn they hold dispatch by stumbling into it.

The confirm-loop **timeout (90s)** is also a Design tuning question (§3) — not a code gap, but the handler-facing "decide now" horizon must be set deliberately against real echo latency.

---

## 5. Curatable findings & requirements suite

Each row is separable — keep, cut, or defer independently. "Src" is the grounding evidence.

<table>
<thead><tr><th>ID</th><th>Finding / requirement</th><th>Business outcome</th><th>Src</th><th>State</th></tr></thead>
<tbody>
<tr><td>R1</td><td>Prove the TB READ cred authenticates against <code>portal.lhlive.co.uk</code> before the flip</td><td>Writes actually confirm; handler feedback is trustworthy, not false-timeout</td><td>§1</td><td>Blocker B1</td></tr>
<tr><td>R2</td><td>Prove bridge <code>/api/devices</code> reachable from the pod + confirm/version the F025 contract</td><td>A device can be reached at all; site search stops 503-ing</td><td>§2</td><td>Blocker B2 (OOHDASH-75)</td></tr>
<tr><td>R3</td><td>Bench-prove the SR-3 scoped WRITE cred</td><td>The write lands with least-privilege blast-radius</td><td>§0 B3</td><td>OOHDASH-18</td></tr>
<tr><td>R0</td><td><strong>Pre-flip: confirm-dispatch step must show a recognisable site (name/brand/address), not an opaque <code>accountId</code></strong></td><td>Handler can read back WHICH site before an irreversible dispatch; no wrong-site sends</td><td>B0/§2</td><td><strong>Blocker B0</strong> (Design + data source via B2)</td></tr>
<tr><td>R4</td><td><strong>Verify the sign-in-eligible population (B2C app-assignment / group / OIDC audience) BEFORE Design commits to the authz pattern</strong> — this, not the 1500 count, is the dispatch population (dispatch is requireAuth-only)</td><td>Authz decision is made on who can actually dispatch, not on a handler-claim count</td><td>§4.1</td><td><strong>Hard precondition; UNVERIFIED</strong> (Spencer)</td></tr>
<tr><td>R5</td><td>Decide + document dispatch authz policy — prefer an <strong>app-level dispatch gate</strong> (dedicated control role/claim, or iot-only) over relying on sign-in restriction alone</td><td>Access policy matches reality; defence-in-depth; code comment/UI/tests align</td><td>§4.1/§4.2</td><td>OOHDASH-67 (Design)</td></tr>
<tr><td>R6</td><td>If iot-only: rework the exact-match role check OR provision iot to all operators</td><td>Tightening does not accidentally lock out every handler</td><td>§4.2</td><td>Conditional on R5</td></tr>
<tr><td>R7</td><td>Hot-water control from live data needs a product/data decision (combi split vs re-key DHW off telemetry.hotWater)</td><td>HW-boost works on real sites, or is knowingly out of scope for this release</td><td>§2</td><td>F025 decision</td></tr>
<tr><td>R8</td><td>Add an <strong>active</strong> "control is now live" notification (banner / first-use prompt) at the flip</td><td>Handlers know they hold dispatch; no silent capability change, no passive discovery</td><td>§4.3</td><td>Design-gate (hard)</td></tr>
<tr><td>R9</td><td>OOHDASH-24 stale-green /healthz fix so a dead read cannot present as healthy</td><td>Testers trust the health banner when judging control</td><td>§1</td><td>OOHDASH-24 (Design)</td></tr>
<tr><td>R10</td><td><strong>In-app hot-water scope clarity</strong>: tell handlers in advance to route HW complaints to capture-and-escalate (HW control silently fails from live data, F025 DHW gap)</td><td>No handler composes a HW control that will never surface; honest routing up front</td><td>§2/§4.3</td><td>Design-gate (hard); depends on R7 decision</td></tr>
<tr><td>R11</td><td><strong>Set/justify the confirm-loop timeout (currently 90s)</strong> deliberately against real echo latency; split handler "decide now" horizon from background late-echo watch</td><td>Handler is not left holding a live caller too long, nor cut off before a real echo</td><td>§3</td><td>Design (tuning)</td></tr>
</tbody>
</table>

---

## 6. Options with traceability

**Option set A — Dispatch authorisation (OOHDASH-67 / Decision 4).** Serves R4, R5, R6.
<table>
<thead><tr><th>Option</th><th>What it entails</th><th>Serves</th><th>Cost</th><th>When it's right</th></tr></thead>
<tbody>
<tr><td>A1 — Accept sign-in-restriction-only (no app gate), document it</td><td>No code change; rely on the B2C app-assignment (R4) to bound who can dispatch; align comment/UI/tests</td><td>R5</td><td>Low</td><td>Only defensible if R4 proves sign-in is tightly and durably restricted to the intended dispatch set — <strong>weaker; no defence-in-depth if the app is later assigned more broadly</strong></td></tr>
<tr><td>A2 — Add an app-level dispatch gate (dedicated control role/claim, or iot-only)</td><td>Gate <code>/control/dispatch</code>; if iot-only, rework the exact-match role check OR provision iot(1400) to all who should dispatch</td><td>R5, R6</td><td>Medium (the role-check trap, §4.2)</td><td><strong>Recommended.</strong> Independent of how broad sign-in is; defence-in-depth. Especially since the dispatch population today is "any authenticated user", not a known five.</td></tr>
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
<tr><td><strong>Dispatch is requireAuth-only, so anyone who can sign in can dispatch</strong> — the population is not the five known handlers</td><td>Certain (verified: no role gate at <code>api.js:140</code>)</td><td>High — an unintended or broadly-assigned account can fire an irreversible device write</td><td>R4 verify B2C app-assignment/audience; R5 add an app-level dispatch gate (A2) for defence-in-depth</td></tr>
<tr><td><strong>Wrong-site dispatch</strong> — handler confirms against an opaque <code>accountId</code> and sends to the wrong site (irreversible)</td><td>Medium (opaque id today)</td><td>High — physical control change on the wrong customer's site</td><td>R0/B0 — recognisable site identity at confirm before the flip</td></tr>
<tr><td><strong>Handler holds a live caller ~90s</strong> on "Confirming…" or acts on a stale timeout</td><td>Medium (unknown echo latency)</td><td>Medium — caller experience / premature escalation</td><td>R11 — set the timeout deliberately against real echo latency (§3)</td></tr>
<tr><td><strong>Silent HW failure</strong> — handler composes a hot-water control that never surfaces (F025 DHW gap)</td><td>Medium</td><td>Medium — caller told nothing happens; no honest routing</td><td>R10 in-app scope clarity; R7 product decision</td></tr>
</tbody>
</table>

---

## 8. Handoffs to Design

**Data scope (design turns into the data dictionary).**
- **Entities:** `site` `{siteNo, siteName, brand, address, callsLast30Days, devices[]}` and `device` `{deviceId, zone, deviceType, kind, online, telemetry{heatingSetpoint, mode, hotWater, ...}, schedule?}` — canonical shape at `bridge.js:13-16, 68-88`. Origin: integration-bridge `/api/devices` (live) — note `siteName/brand/address/callsLast30Days` are **not** on the wire today (§2). **`siteName`/brand/address are a pre-flip safety requirement, not just a data-catalogue item (B0/R0)** — the solution needs a real source for them (registry/Zendesk lookup per the `bridge.js:120-129` TODO, or an extended F025 contract) so the confirm step can name the site.
- **Control attributes** (the only writable fields): `setpointDesired`/`modeDesired`/`hwBoostHoursDesired`, each with a `*Reported`/`*SyncStatus` write-back pair (`tb-client.js:15-19`).
- **Durable docs:** `OohAuditLog`, `OohAppConfig` (kill-switch), `OohOverrides`, `OohSmsLog` in Cosmos (`store.js:135`). Sensitivity: audit + operator identity — retention/PII to be catalogued by design. Operator PII comes from the B2C id_token (`auth.js:325-331`).

**CX success criteria (design realises these).**
- **Persona–journey:** an OOH handler on a live call, time-pressured, acting on a caller's cold/hot-water complaint; journey = search site &rarr; confirm site &rarr; read live state &rarr; compose change &rarr; dispatch &rarr; wait for device echo &rarr; tell the caller the truth. The handler is often the sole point of contact at 2am.
- **Reassurance-vs-friction calibration:** the **dispatch** step is high-stakes and irreversible at the device — it **wants** a deliberate confirmation checkpoint (present, `control.js:98`) **and the checkpoint must show a recognisable site — name/brand/address, not an opaque `accountId`** (hard requirement R0/B0; a handler cannot safely confirm against an id they can't read). The **status polling** step wants to get out of the way (auto, `aria-live`, no clicks — present), but its **wait horizon (90s today) must be tuned deliberately** (R11) so it does not silently hold a live caller. The **failed/timeout** step wants a hard, unmissable checkpoint ("do not tell the caller it's done" — present).
- **Hard CX requirements handed to Design (each is a safety-shaped elevation, not optional polish):**
  - **Site identity at confirm-dispatch (R0/B0):** the confirm step shows a recognisable site name/brand/address — never only an `accountId`. Wrong-site dispatch is irreversible.
  - **In-app hot-water scope clarity (R10):** because HW control silently fails from live data (F025 DHW gap, §2), the handler is told **in advance** — before composing — to route HW complaints to capture-and-escalate, not attempt a control that will not surface.
  - **Active "control is now live" notification (R8):** at the flip the handler gets an **active** banner / first-use prompt, not passive discovery, so they know they now hold dispatch.
- **"Great looks like…":** the handler always knows exactly which site they are about to control and confirms against a recognisable name; they never tell a caller a change is done unless the device confirmed it; a blocked/failed/non-responsive/out-of-scope (incl. hot-water) device always routes to an honest capture-and-escalate; and at the flip the handler is actively told control is now available, rather than discovering it.

**End-to-end test scope (design turns into scripts + data).** Prove, once built:
- Happy: setpoint raise on a Salus &rarr; `synced` &rarr; caller-safe "applied" card + ticket.
- Guardrail: setpoint outside ±3°C/25°C &rarr; 422, no write.
- Kill-switch/deploy-lock: with `WRITES_DISABLED=true` &rarr; 423 "Control unavailable" modal, no write.
- Non-responsive: IT700 slow-echo &rarr; `timeout` &rarr; "treat as not applied" &rarr; escalate; late echo &rarr; `late-synced` ticket note.
- Failed/rejected: device rejects &rarr; honest escalate, never a success card.
- Authz (per Decision 4): dispatch is permitted/denied exactly per the chosen policy — including a non-handler authenticated user being denied if an app-level gate is added; a handler is not locked out if iot-only is chosen; kill-switch admin remains iot-only.
- Wrong-site guard (B0): the confirm-dispatch step shows a recognisable site name/brand/address, and a mismatch is catchable before send.
- Hot-water scope: a HW complaint surfaces in-app scope guidance (route to capture-and-escalate) rather than composing a control that never lands.
- Flip notification (R8): on the flip, an authenticated handler receives the active "control is now live" signal before first dispatch.
- Read-fault simulation: with a broken read, a landed write must not silently show "applied".

---

## 9. Recommended next step

**First move: run the two isolation probes B1 (TB read login) and B2 (bridge `/api/devices` from the pod) — owner Spencer / IoT platform — before any design or build.** They are the two unknowns that gate everything downstream: B2 decides whether a device can be reached at all, and B1 decides whether a write can ever confirm. Both are cheap, both are external-owned, and both are currently **UNVERIFIED** from this repo. Run B1 as the standalone login probe (Option B-i) so the read cred is judged independently of the bridge.

In parallel (Design-lane, but a **hard precondition before Design commits to the authz pattern**): verify the sign-in-eligible population (R4) — the B2C app-registration assignment and the OIDC audience/issuer in the k8s secret — because **that**, not the claimArea-1500 count, is the dispatch-capable population (dispatch is `requireAuth`-only, `api.js:140`). Until that is confirmed, treat the population conservatively as "any authenticated tenant user", which points to Option **A2 (add an app-level dispatch gate)** as the safer default rather than relying on sign-in restriction alone. The claimArea-1500 record (five accounts) is context on who holds the handler claim; it does **not** settle Decision 4.

**Also pre-flip: close B0 (site identity at confirm).** Design must specify a recognisable site name/brand/address at the confirm-dispatch step before live control is flipped — a wrong-site dispatch is irreversible, and today the confirm may show only an `accountId`.

**Handler live-control UX is confirmed present** (pre-dispatch confirmation, post-dispatch feedback, device-non-responsive state), but three safety-shaped items are hard for Design: **site identity at confirm (B0/R0)**, **in-app hot-water scope clarity (R10)**, and an **active "control is now live" notification (R8)** — plus the **90s confirm-timeout (R11)** to tune deliberately.

---

## 10. Conditions Carried Forward to Design (accept-with-conditions register)

The operator **accepted this discovery with conditions** (see top note + contract). The governed Discovery-gate panel raised a further (round-2) set of findings; each is recorded below as a **named, owned condition** carried into the stage shown. **Every row is OPEN/TRACKED — none is resolved by this acceptance.** They gate the **Design** stage unless a different gate is noted; where they touch a device-write safety property they are also called out as pre-flip / Release-preflight items. These sit alongside — and do not replace — the §0 blockers (B0–B3).

<table>
<thead>
<tr><th>#</th><th>Condition</th><th>Raised by</th><th>Carried to</th><th>Owner</th><th>Must be resolved before</th></tr>
</thead>
<tbody>
<tr><td>C1</td><td><strong>Late-sync background watch is in-process only.</strong> The <code>lateSyncWatchMs</code> (10-min) echo watch runs in process; a pod restart inside that window <strong>silently drops the watch</strong> and leaves the audit trail uncorrected (a late-synced device is never reconciled). Design must accept this limitation explicitly or address it (e.g. durable/rehydrated watch) before any UX is built on the late-sync signal. <em>OPEN/TRACKED.</em></td><td>critical-thinker</td><td>Design gate</td><td>Design doer</td><td>Before the late-sync (`late-synced` ticket note / §3, §4.3) UX is designed or built on</td></tr>
<tr><td>C2</td><td><strong>F004 confirm-token single-use property is unverified.</strong> If the confirm token is reusable, a network-retry can <strong>double-dispatch</strong> — an irreversible device write applied twice. Verify the token is genuinely single-use (consumed on first dispatch) and state it before the confirm UX is certified safe. <em>OPEN/TRACKED.</em></td><td>critical-thinker</td><td>Design (pre-flip safety)</td><td>Design doer / James</td><td>Before the confirm/dispatch UX is certified safe and before the OOHDASH-19 flip</td></tr>
<tr><td>C3</td><td><strong>Read-session token lifetime during the 90s poll is unexamined.</strong> A mid-poll read-token expiry produces a <code>timeout</code> <strong>indistinguishable from device non-response</strong> — the handler is told "treat as not applied" when the real fault was auth. Confirm whether the read session auto-refreshes across the poll window, and whether auth failure is distinguished from device silence. <em>OPEN/TRACKED.</em></td><td>critical-thinker</td><td>Design gate</td><td>Design doer</td><td>Before the device-non-responsive / timeout UX (§4.3) is finalised</td></tr>
<tr><td>C4</td><td><strong>Dispatch-time data freshness of <code>bridge.getSitesByNumber</code> is unstated.</strong> If it resolves from a cached site list rather than a live re-fetch at dispatch, the <code>device.online</code> safety check (`control.js:63`) is a <strong>stale-cache check, not a live safety gate</strong>. State the freshness behaviour for R11 calibration. <em>OPEN/TRACKED.</em></td><td>critical-thinker</td><td>Design gate</td><td>Design doer / Spencer</td><td>Before R11 timeout calibration and before relying on the online-gate as a live safety check</td></tr>
<tr><td>C5</td><td><strong>No interlock between probe confirmation and the OOHDASH-19 env-var flip.</strong> Nothing binds the B1/B2/B3 (green) probe results to the <code>WRITES_DISABLED</code> flip — process memory alone is passive assurance. Specify a <strong>concrete release gate</strong> for the flip PR (an explicit checklist/approval that B0–B3 are green before <code>WRITES_DISABLED="false"</code> merges). <em>OPEN/TRACKED.</em></td><td>critical-thinker</td><td>Release-preflight</td><td>James / release</td><td>Before the OOHDASH-19 flip PR merges</td></tr>
<tr><td>C6</td><td><strong>Late-sync active handler alert is missing.</strong> When a device echoes <em>after</em> the 90s timeout (within the 10-min watch), the handler currently gets only a background ticket note. Design must give the handler an <strong>active in-session signal</strong> that a previously-timed-out change has now confirmed. <em>OPEN/TRACKED.</em></td><td>customer-experience</td><td>Design gate</td><td>Design doer</td><td>Before the late-sync UX (§4.3) is finalised</td></tr>
<tr><td>C7</td><td><strong>The 90s wait needs a mid-wait handler decision prompt.</strong> At ~30–45s the handler should be actively prompted: "keep the caller on hold or escalate now?" — rather than staring at "Confirming…" for the full 90s with no decision point. <em>OPEN/TRACKED.</em></td><td>customer-experience</td><td>Design gate</td><td>Design doer</td><td>Before the confirm-loop wait UX (§3 timing / R11) is finalised</td></tr>
<tr><td>C8</td><td><strong>R10 hot-water scope clarity must surface earlier.</strong> The in-app HW out-of-scope guidance must appear at the <strong>device-type / site-device-list view, BEFORE compose</strong> — not as a post-attempt correction after a handler has already composed a HW change. <em>OPEN/TRACKED.</em></td><td>customer-experience</td><td>Design gate</td><td>Design doer</td><td>Before the compose/HW-scope UX (R10 / §4.3) is designed</td></tr>
<tr><td>C9</td><td><strong>Confirm-step visual hierarchy.</strong> At the confirm-dispatch step the <strong>site name / brand / address must be the most visually prominent element</strong> — reinforcing B0/R0 so the handler cannot miss which site they are about to control. <em>OPEN/TRACKED.</em></td><td>customer-experience</td><td>Design gate</td><td>Design doer</td><td>Before the confirm-dispatch UX (B0/R0 / §4.3) is designed</td></tr>
</tbody>
</table>

> **Honesty note.** These nine conditions are **carried, not closed.** Acceptance-with-conditions clears Discovery to proceed to Design; it does **not** assert any condition is solved. C2 and C5 are device-write safety properties and additionally gate the pre-flip / Release-preflight path — they must not be lost between stages.

---

*All line numbers cited against repo `main`, 2026-09-11. Gate outcome ACCEPT-WITH-CONDITIONS recorded 2026-09-12. UNVERIFIED items each name the exact probe + owner that would confirm them. This artefact does not invoke reviewers or the next stage — the Orchestrator governs the Discovery gate.*
