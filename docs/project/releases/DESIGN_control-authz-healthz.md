<!-- gate:contract
SECTION Open preconditions first: What this Design does NOT close, each with a named owner. The authz DECISION is designed but cannot be committed until R4 (the true sign-in-eligible population — B2C app-assignment / OIDC audience) is verified by Spencer. The four pre-flip blockers (B0 site-identity, B1 read-cred, B2 bridge-read, B3 write-cred) stay open. Two carried conditions (C2 confirm-token single-use, C5 flip-interlock) are pre-flip / Release-preflight safety and are NOT Design-closable. Read this before the design.
SECTION OOHDASH-24 /healthz fix design: The concrete approach to the stale-green read flag. The read health is a lazy latch (starts false, flips true on first success, and stays true if the cred later dies without a call — tb-client.js:28,47). Design: replace the lazy latch with a tri-state (configured / unknown / healthy / unhealthy) driven by an active read probe on the healthcheck path, so a dead-but-once-good read cannot present green. Names the code surface and the proving test.
SECTION OOHDASH-67 dispatch authz design: The recommendation is Option A2 — an app-level dispatch gate on POST /control/dispatch (api.js:140), which today is requireAuth-only (no role check). Because requireRole is exact-match (auth.js:223), a naive iot-only gate locks out every handler; the design is a rank-aware guard built on ROLE_PRECEDENCE (auth.js:175). This design is presented but HARD-GATED on R4 — committing it is blocked until Spencer verifies the sign-in-eligible population.
SECTION C1-C9 carry table: Each round-2 Discovery condition mapped to how this Design addresses or defers it, with status and resolve-before. None is claimed closed by this artefact.
SECTION Hard CX design requirements: Site identity at confirm (B0/R0) with the site name/brand/address as the most prominent element (C9), hot-water scope clarity surfaced before compose (R10/C8), an active control-is-now-live notification at the flip (R8), and the confirm-loop timing split (R11/C7) with a mid-wait decision prompt.
SECTION Test scope: The tests that prove each design — the /healthz tri-state, the rank-aware authz matrix, and the CX safety requirements.
SECTION Next step: The recommended move — take the /healthz design to Build now (unblocked), hold the authz commit on R4.
DECISION healthz-approach: Replace the lazy read-health latch with an ACTIVE probe + tri-state (configured/unknown/healthy/unhealthy). A configured-but-unexercised read reports unknown (amber), not green; a read that authenticated once but whose cred has since died reports unhealthy on the next probe. Never present a dead/unexercised read cred as healthy/green. Surface in /healthz body; keep HTTP 200 (K8s probe policy, server.js:63-65).
DECISION authz-recommendation: Option A2 — add an app-level dispatch gate to POST /control/dispatch via a rank-aware role guard (requireMinRole) built on ROLE_PRECEDENCE (auth.js:175), NOT a naive exact-match requireRole('iot') which would lock out all handlers (auth.js:223). Handler is the minimum dispatch rank; iot outranks it. Defence-in-depth independent of how broad sign-in is.
DECISION R4-gating: The authz decision is HARD-GATED on R4 — verifying the B2C app-assignment / OIDC audience (the true sign-in-eligible population), owner Spencer, UNVERIFIED. This Design specifies the pattern but committing/merging it is BLOCKED until R4 is confirmed. R4 is not closed and must not be treated as closed.
-->

# Design — Control Authz + /healthz stale-green (dispatch gate & health trust)

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Date:** 2026-09-12
**Repo state (verified):** `main`, app v1.2.0; `POST /control/dispatch` is `requireAuth`-only (no role gate) at `routes/api.js:140`; the only `requireRole('iot')` is the `/admin` sub-router at `routes/api.js:346`.
**Scope:** exactly two design decisions — **OOHDASH-24** (`/healthz` stale-green read-health fix approach) and **OOHDASH-67 / Decision 4** (dispatch authz decision, Option A2, rank-aware) — plus the carried round-2 conditions (C1–C9) and pre-flip blockers (B0–B3). This artefact **decides an approach**; it does not build, invoke gates, or flip anything.
**Method:** every code claim verified against deployed source on `main`; anything not confirmable firsthand is marked **UNVERIFIED** with the exact probe + owner.

> **Honesty banner.** This Design carries — does not close — the nine round-2 conditions from `DISCOVERY_control-plumbing.md` §10 and the pre-flip blockers B0–B3. The **authz decision (A2) is designed but HARD-GATED on R4** (the true sign-in-eligible population), which is **UNVERIFIED** and owned by Spencer. Presenting the pattern is not committing it. R4 is **not** closed here.

---

## 0. Open preconditions & what this Design does NOT close

Blockers and open preconditions come first, each with a named owner. None closes from this repo/stage alone.

<table>
<thead>
<tr><th>#</th><th>Precondition</th><th>State</th><th>Design's relationship to it</th><th>Owner</th><th>Resolve before</th></tr>
</thead>
<tbody>
<tr><td><strong>R4</strong></td><td><strong>Sign-in-eligible population unverified</strong> — dispatch is <code>requireAuth</code>-only (`api.js:140`), so the dispatch population = everyone who can sign in, NOT the claimArea-1500 count. What restricts sign-in (B2C app-assignment / security group / OIDC audience) is unknown. The app only reads <code>OIDC_ISSUER</code>/<code>OIDC_CLIENT_ID</code> (`config.js:40-41`); the assignment policy lives in Entra/B2C.</td><td><strong>UNVERIFIED — HARD gate on §2.</strong></td><td>The §2 authz design (A2, rank-aware) is fully specified but <strong>cannot be committed/merged until R4 is confirmed</strong>. The design is safe to review; it is not safe to land blind.</td><td>Spencer / IoT platform</td><td>Committing the OOHDASH-67 authz change</td></tr>
<tr><td><strong>B0/R0</strong></td><td><strong>Site identity at the confirm step.</strong> The dispatch confirm line renders <code>Sending to: &lt;siteName&gt;</code> (`public/js/control.js:96`) but <code>siteName</code> is the opaque <code>accountId</code> (`bridge.js:124`, TODO at `bridge.js:122-123`); brand/address are <code>undefined</code> (`bridge.js:125-127`). A wrong-site dispatch is irreversible.</td><td><strong>KNOWN GAP (verified).</strong></td><td>§4 specifies the recognisable-site requirement + visual hierarchy (C9). The <em>data source</em> for a real name/brand/address is still owed via B2 (registry/Zendesk lookup or extended F025 contract) — Design states the requirement but cannot supply the data.</td><td>Design (requirement) + Spencer/IoT (data via B2)</td><td>OOHDASH-19 flip</td></tr>
<tr><td><strong>B1</strong></td><td><strong>TB READ credential validity unproven.</strong> <code>read=false</code> in <code>/healthz</code> is a lazy-flag artefact (`tb-client.js:28`), neither proof of a bad nor a good cred.</td><td><strong>UNVERIFIED.</strong></td><td>§1 (OOHDASH-24) makes a dead/unexercised read <em>show</em> honestly, but proving the cred still needs the live login probe — Design cannot run it.</td><td>Spencer / IoT platform</td><td>OOHDASH-19 flip</td></tr>
<tr><td><strong>B2</strong></td><td><strong>Bridge inventory read unproven from the pod (OOHDASH-75)</strong>; F025 device contract provisional; no site name/brand/address, no distinct hot-water device (`bridge.js:57-67,120-129`).</td><td><strong>UNVERIFIED transport + KNOWN contract gap.</strong></td><td>B0/R0 (§4) and R10 HW-scope (§4) depend on this; Design specifies the requirements but the contract confirm is Spencer's.</td><td>Spencer / IoT platform</td><td>OOHDASH-19 flip</td></tr>
<tr><td><strong>B3</strong></td><td><strong>SR-3 write credential validity unproven</strong> (OOHDASH-18); <code>writeConfigured=true</code> but <code>write=false</code> — same lazy mechanism (`tb-client.js:28,150-151`).</td><td><strong>UNVERIFIED.</strong></td><td>Out of this Design's two decisions; carried as a pre-flip blocker. The §1 tri-state applies to the write flag too (bonus), but proving the cred is bench work.</td><td>Spencer / IoT platform</td><td>OOHDASH-19 flip</td></tr>
<tr><td><strong>C2</strong></td><td><strong>F004 confirm-token single-use unverified</strong> — if reusable, a network retry can double-dispatch (irreversible write applied twice).</td><td><strong>OPEN — NOT Design-closable.</strong></td><td>Pre-flip safety property; recorded in §3 as carried to Release-preflight. Design flags it and requires it verified before the confirm UX is certified safe, but cannot close it here.</td><td>Design doer / James</td><td>Confirm UX certified safe + OOHDASH-19 flip</td></tr>
<tr><td><strong>C5</strong></td><td><strong>No interlock between B0–B3 (green) probes and the <code>WRITES_DISABLED</code> flip</strong> — process memory is passive assurance.</td><td><strong>OPEN — NOT Design-closable.</strong></td><td>Release-preflight concern; §3 carries it. Design cannot author the flip PR's release gate.</td><td>James / release</td><td>OOHDASH-19 flip PR merges</td></tr>
</tbody>
</table>

> **What this Design explicitly does NOT do:** it does not verify R4, does not run the B1/B2/B3 probes, does not close the F004 single-use question (C2) or the flip interlock (C5), does not supply the real site name/brand/address data (owed via B2), and does not flip `WRITES_DISABLED`. It decides the **/healthz fix approach** and the **authz pattern**, and specifies the hard CX requirements — nothing more.

---

## 1. OOHDASH-24 — `/healthz` stale-green read-health fix (design + test)

**The defect (verified).** Read/write health is a **lazy latch**. `tbSession()` holds `let healthy = false` (`tb-client.js:28`); it flips to `true` only after a successful `getToken()`/`request()` (`tb-client.js:34,47`) and back to `false` only on a request error (`tb-client.js:51`). `tbStatus()` reports `read = readSession.isConfigured() && readSession.isHealthy()` (`tb-client.js:149`). `/healthz` marks the pod degraded when `thingsboard.mode==='live' && thingsboard.read===false` (`server.js:70`).

**Two failure shapes this produces:**
- **False amber (today, benign-ish):** a *configured, valid, but unexercised* read cred reports `read=false` → `/healthz` says `degraded` even though the cred is fine. Confusing but fail-safe.
- **Stale green (the real risk, the OOHDASH-24 target):** once the read session succeeds **once**, `healthy` latches `true`. If the cred is later revoked/expires and **no read runs** (e.g. a quiet overnight with no dispatch → no `readControlState`, `tb-client.js:132`), `read` stays `true` — a **dead read cred presents as healthy/green**. `healthy` only drops on an *attempted* request that errors (`tb-client.js:51`); with no attempt, it never re-evaluates. A tester judging control-readiness off a green banner is misled.

**Design — active probe + tri-state (recommended).** Replace the binary lazy latch with a **tri-state health** driven by an **active probe on the healthcheck path**:

<table>
<thead><tr><th>State</th><th>Meaning</th><th>How derived</th></tr></thead>
<tbody>
<tr><td><code>unconfigured</code></td><td>No read creds present</td><td><code>!isConfigured()</code> (username/password absent, `tb-client.js:55`)</td></tr>
<tr><td><code>unknown</code> (amber)</td><td>Configured but not yet actively proven this cycle</td><td>Configured, and the last active probe is stale/never-run — <strong>never reported as green</strong></td></tr>
<tr><td><code>healthy</code> (green)</td><td>An auth/read succeeded within the freshness window</td><td>Last active probe (or a real read) returned OK inside <code>healthProbeTtlMs</code></td></tr>
<tr><td><code>unhealthy</code> (red)</td><td>The last active probe failed (401 / transport)</td><td>Active probe error — distinguishes a genuinely dead cred from merely-unexercised</td></tr>
</tbody>
</table>

**Concrete mechanism.** Add a lightweight **active read probe** — a cheap authenticated call on the read session (e.g. `POST /api/auth/login` via the existing `getToken()`, or a minimal tenant read) — invoked (a) lazily from `tbStatus()` when the cached probe result is older than a TTL, or (b) on a low-frequency background timer (mirroring the existing store warm-up probe pattern at `server.js:126-128`). Record `{ ok, checkedAt }`; derive the tri-state from freshness + outcome so that:
- a **configured-but-unexercised** read is `unknown`/amber, never green;
- a **once-good-now-dead** read flips to `unhealthy` on the next probe rather than latching green;
- HTTP status stays **200** regardless (K8s liveness/readiness policy, `server.js:63-65`) — the truth lives in the body's `status`/`subsystems`, and the degraded predicate at `server.js:66-70` is updated to treat `read` states `unknown`/`unhealthy` as not-green (with `unknown` surfaced distinctly from `unhealthy`).

**Code surface it touches:**
<table>
<thead><tr><th>File</th><th>Change</th></tr></thead>
<tbody>
<tr><td><code>services/tb-client.js</code></td><td>Replace the boolean <code>healthy</code> latch (`:28`) with a probe-result record + freshness TTL; add an <code>activeReadProbe()</code> reusing <code>getToken()</code>/a minimal read; have <code>tbStatus()</code> (`:145-153`) emit the tri-state for <code>read</code> (and, as a bonus, <code>write</code>/B3).</td></tr>
<tr><td><code>server.js</code></td><td>Update the <code>degraded</code> predicate (`:66-70`) to map the read tri-state (amber <code>unknown</code> ≠ green; <code>unhealthy</code> = degraded); keep HTTP 200.</td></tr>
<tr><td><code>config.js</code></td><td>Add <code>control</code>/<code>thingsboard</code> knob <code>healthProbeTtlMs</code> (env-overridable, default e.g. 60000) alongside the existing control timers (`:112-116`).</td></tr>
</tbody>
</table>

**Test that proves it (design):**
1. **Unexercised-configured → amber, never green.** Boot live-mode with valid read creds, run no read; assert `/healthz` `subsystems.thingsboard.read` is `unknown` (amber) and NOT `healthy`. *(Proves the false-green-at-boot direction cannot present green.)*
2. **Stale-green cannot persist (the OOHDASH-24 core).** Prime the read session healthy (one successful probe), then make the cred fail (stub the read session to 401) with **no dispatch/read in between**; advance past `healthProbeTtlMs`; assert the next `/healthz` reports `unhealthy` (red), not stale `healthy`. *(Proves a dead-but-once-good cred is caught without needing a device read to trigger it.)*
3. **Genuinely healthy stays green.** Valid cred, probe succeeds within TTL → `read: healthy`, `/healthz.status: ok`.
4. **HTTP 200 invariant.** All three states return HTTP 200 (K8s probe safety, `server.js:63-65`).

*Stubbing note:* tests drive the read session via the existing fixture/live seam (`config.dataMode`, `tb-client.js:120,134`) — no live `portal.lhlive.co.uk` call in CI.

---

## 2. OOHDASH-67 / Decision 4 — dispatch authz design (Option A2, rank-aware) — **HARD-GATED ON R4**

**Verified current state.** `POST /control/dispatch` (`api.js:140`) sits behind `requireAuth` **only** — there is **no `requireRole`** on it; the sole `requireRole('iot')` is the `/admin` sub-router (`api.js:346`, `admin.use(requireRole('iot'))`). `requireRole` is **exact-match**: `if (op.role !== role) return 403` (`auth.js:223`). Role precedence already exists: `const ROLE_PRECEDENCE = ['iot', 'handler']` (`auth.js:175`), used by `mapRole()` to resolve the higher-privilege role when a user holds both claims (`auth.js:197`).

**Consequence (from Discovery, re-confirmed).** The dispatch-capable population = **every authenticated user**, not the claimArea-1500 handler set. Conservative default until R4 proves otherwise: *"any authenticated tenant user can dispatch."* This strengthens the case for an **app-level dispatch gate** (defence-in-depth) over relying on sign-in restriction alone.

**Recommendation: Option A2 — add an app-level dispatch gate, rank-aware.**

**The trap (why not a one-liner).** A naive `requireRole('iot')` on dispatch would, because of exact-match (`auth.js:223`), **exclude every handler** — the exact opposite of today, locking out all five current operators unless each is also provisioned iot(1400). So iot-only via the existing guard is wrong.

**The design — a rank-aware `requireMinRole` guard built on `ROLE_PRECEDENCE`:**
- Add a new guard, e.g. `requireMinRole(minRole)`, alongside `requireRole` in `services/auth.js`, that admits any operator whose role **ranks at least as high as** `minRole` per `ROLE_PRECEDENCE` (`auth.js:175`). Because precedence is `['iot','handler']` (index 0 = highest), "rank at least as high as `minRole`" = `indexOf(op.role) <= indexOf(minRole)` (with unknown/`null` role denied).
- Gate `/control/dispatch` (`api.js:140`) with `requireMinRole('handler')` — this **admits handlers and iot**, denies any authenticated user with no OOH role (which `mapRole` already resolves to `null`, `auth.js:197`, and `/callback` already 403s, `auth.js:321-324`). This is the **minimum-viable dispatch gate** that does not lock out handlers.
- **Policy knob for tightening:** if Decision 4 later goes *iot-only*, the same guard becomes `requireMinRole('iot')` **without** the exact-match trap — but that still requires iot provisioned to everyone who should dispatch (an ops action), so it is a policy toggle, not the default. Default recommendation: gate at `handler` (admits today's handlers) — this closes the "any authenticated user" hole while preserving handler dispatch.
- **Align the ripple:** the header comment "privileged routes add `requireRole('iot')`" (`api.js:2-4`) and any UI affordance must be updated to the landed policy; the `/control/actions/:id` + `/wait` status routes (`api.js:149,155`) are reads/extends — policy choice whether they inherit the same `requireMinRole('handler')` (recommended, for consistency).

**Why A2 over A1 (accept sign-in-restriction-only).** A1 relies entirely on R4 proving sign-in is tightly and durably restricted, with **no in-app defence** if the app is later assigned more broadly. A2 is independent of sign-in breadth and is defence-in-depth. Given the conservative "any authenticated user" default, A2 is the safer commit.

> **HARD GATE — R4.** This design is **presented for review, not for commit.** The *final* authz decision is hard-gated on **R4** — verifying the B2C app-assignment / OIDC audience (the true sign-in-eligible population), **UNVERIFIED**, owned by **Spencer**. Until R4 is confirmed:
> - the **minimum** at flip is the `requireMinRole('handler')` gate (closes the "any authenticated user" hole regardless of R4);
> - the **choice between `handler`-min and `iot`-min** depends on who R4 says can sign in and whether the intent is handler-can-control or iot-only.
> **Do not merge the authz change, and do not treat R4 as closed.** R4 remains open and owned by Spencer.

**iot-only rework scope (carried from SHAPING C-"iot-only rework"): SIZED.** One route gains a gate (`api.js:140`); the change is a new `requireMinRole` guard in `auth.js` (no rework of the exact-match `requireRole`, which stays for `/admin`). If iot-only is chosen, the extra cost is **ops provisioning of iot(1400)** to all intended dispatchers, plus a two-role test matrix (§5). Small code surface, real ops dependency.

---

## 3. Carried round-2 conditions C1–C9 — addressed or deferred

Every row is **OPEN/TRACKED** — this Design does not close any of them; it records how the design responds and where each resolves.

<table>
<thead><tr><th>#</th><th>Condition (abbrev.)</th><th>Design response</th><th>Status</th><th>Resolve before</th></tr></thead>
<tbody>
<tr><td>C1</td><td>Late-sync watch is in-process only; a pod restart in the 10-min window silently drops it (audit uncorrected).</td><td><strong>Acknowledged as a limitation.</strong> The §1 /healthz work does not touch it. Design records it explicitly: the late-sync UX (C6) must not assume durability; either accept the loss on restart or make the watch durable/rehydrated (`control.js:158-169` in-memory `actions` map is the surface). Not built here.</td><td>OPEN/TRACKED</td><td>Before any UX is built on the late-sync signal</td></tr>
<tr><td>C2</td><td>F004 confirm-token single-use unverified → retry can double-dispatch.</td><td><strong>Pre-flip safety — NOT Design-closable.</strong> Recorded in §0. Design requires it verified (probe: confirm <code>resolution.isConfirmed</code>/<code>confirmSite</code> consumes the token on first dispatch, `control.js:49`) before the confirm UX is certified safe.</td><td>OPEN/TRACKED</td><td>Confirm UX certified + OOHDASH-19 flip</td></tr>
<tr><td>C3</td><td>Read-token expiry mid-poll is indistinguishable from device non-response (handler told "not applied" when the fault was auth).</td><td><strong>Partly addressed by §1.</strong> The tri-state/active probe gives an independent read-auth signal, so an auth failure during the 90s poll can be surfaced as "health/auth degraded" distinct from device silence. Design requires the poll path (`control.js:172-209`) to distinguish a read-session auth error from a genuine non-echo before the timeout UX is finalised.</td><td>OPEN/TRACKED</td><td>Before device-non-responsive / timeout UX finalised</td></tr>
<tr><td>C4</td><td>Dispatch-time freshness of <code>getSitesByNumber</code> unstated → <code>device.online</code> may be a stale-cache check.</td><td><strong>Flagged for R11 calibration.</strong> Verified: <code>fetchLiveSites()</code> serves a TTL cache (<code>LIVE_CACHE_TTL</code>, `bridge.js:101,130`), so the <code>device.online</code> gate (`control.js:63`) is only as fresh as that TTL. Design states the freshness behaviour and requires the online-gate not be relied on as a live safety check without a dispatch-time re-fetch decision.</td><td>OPEN/TRACKED</td><td>Before R11 timeout calibration / relying on online-gate</td></tr>
<tr><td>C5</td><td>No interlock binding B0–B3 (green) to the <code>WRITES_DISABLED</code> flip.</td><td><strong>Release-preflight — NOT Design-closable.</strong> Recorded in §0. Design cannot author the flip PR's release gate.</td><td>OPEN/TRACKED</td><td>OOHDASH-19 flip PR merges</td></tr>
<tr><td>C6</td><td>Late-sync active handler alert missing (only a background ticket note).</td><td><strong>Design requirement (§4).</strong> Specify an active in-session signal when a previously-timed-out action later confirms (`control.js:178,183-185` produce <code>late-synced</code> + a ticket note today; the in-session surfacing is the design add). Constrained by C1's durability caveat.</td><td>OPEN/TRACKED</td><td>Before late-sync UX finalised</td></tr>
<tr><td>C7</td><td>90s wait needs a mid-wait handler decision prompt (~30–45s).</td><td><strong>Design requirement (§4).</strong> Split the confirm-loop horizon (R11) and add a mid-wait "keep the caller on hold or escalate?" prompt rather than a silent 90s "Confirming…". Surfaces on the existing sync-tracker (`public/js/control.js:106-109`).</td><td>OPEN/TRACKED</td><td>Before confirm-loop wait UX (R11) finalised</td></tr>
<tr><td>C8</td><td>R10 HW scope clarity must surface at the device-list view BEFORE compose, not as a post-attempt correction.</td><td><strong>Design requirement (§4).</strong> The HW out-of-scope guidance appears at the device/scope view before compose. Verified surface: the hot-water SCOPE_GROUP already computes a level (`routes/api.js:107-108`, keyed on <code>salus-it500-dhw</code> which live data never emits, `bridge.js:57-67`) — design routes HW to capture-and-escalate up front.</td><td>OPEN/TRACKED</td><td>Before compose/HW-scope UX designed</td></tr>
<tr><td>C9</td><td>Confirm-step visual hierarchy: site name/brand/address must be the most prominent element (reinforces B0/R0).</td><td><strong>Design requirement (§4).</strong> The confirm modal (`public/js/control.js:95-98`) is redesigned so the recognisable site identity dominates; the opaque <code>accountId</code> alone is not an acceptable confirm target.</td><td>OPEN/TRACKED</td><td>Before confirm-dispatch UX designed</td></tr>
</tbody>
</table>

**SHAPING §10 conditions touched by this Design (referenced, not owned here):** "true count of sign-in-eligible claimArea-1500 accounts" = **R4** (§0/§2, HARD gate); "iot-only rework scope characterised" = **§2** (sized); "'Control is now live' in-app signal as a HARD Design-gate requirement" = **R8 (§4)**; "Handler live-control UX confirmed present" = confirmed present in Discovery, elevated to the hard CX items in **§4**; "handler-communication plan for the chosen -67 policy" = tied to §2 + R8, owner James. The remaining SHAPING conditions (shakedown spec, pod-roll SLA, bench device, `-12` env audit, supervisor iot-role, `-11` scenarios) are **Release-preflight / Build-PLAN / Writer-lane** and are **not** Design-closable — referenced, not resolved here.

---

## 4. Hard CX design requirements (safety-shaped, not polish)

Each is a hard requirement handed to Build; the code surface is cited so Build has a concrete target.

<table>
<thead><tr><th>Req</th><th>Requirement</th><th>Design specification</th><th>Code surface</th><th>Depends on</th></tr></thead>
<tbody>
<tr><td><strong>B0/R0 + C9</strong></td><td><strong>Recognisable site identity at confirm, as the dominant element.</strong></td><td>The confirm-dispatch step shows a <strong>recognisable site name / brand / address</strong> — never an opaque <code>accountId</code> alone — and that identity is the <strong>most visually prominent element</strong> of the confirm modal (C9). A dispatch confirmed against only an <code>accountId</code> is not an acceptable state.</td><td>`public/js/control.js:95-98` (confirm modal renders <code>Sending to: &lt;siteName&gt;</code>); <code>siteName</code> currently = <code>accountId</code> (`bridge.js:124`).</td><td><strong>B2</strong> data source (registry/Zendesk lookup or extended F025 contract) — Spencer/IoT</td></tr>
<tr><td><strong>R10 + C8</strong></td><td><strong>Hot-water scope clarity, before compose.</strong></td><td>Because HW control silently fails from live data (the F025 DHW mismatch — bridge never emits <code>salus-it500-dhw</code>, `bridge.js:57-67`; scope + guardrail key off it, `api.js:107`), the handler is told <strong>at the device/scope view, before composing</strong>, to route HW complaints to capture-and-escalate — not after a wasted compose.</td><td>`routes/api.js:105-113` (SCOPE_GROUPS, hot-water level); device-list / scope view in `public/js/`.</td><td><strong>R7</strong> product decision on HW (combi split vs re-key off <code>telemetry.hotWater</code>)</td></tr>
<tr><td><strong>R8</strong></td><td><strong>Active "control is now live" notification at the flip.</strong></td><td>At the flip the handler gets an <strong>active</strong> banner / first-use prompt (not passive discovery) that control is now available. Elevated to a HARD Design-gate requirement per SHAPING §10.</td><td>Notices surface already exists (`routes/api.js:381-389` admin notices; `notices.activeNotices()` consumed at `api.js:41`) — design can drive the flip signal through it or a dedicated first-use prompt.</td><td>Tied to the §2 authz policy (who is told)</td></tr>
<tr><td><strong>R11 + C7</strong></td><td><strong>Confirm-loop timing: split horizon + mid-wait decision prompt.</strong></td><td>Split the handler-facing "decide now" horizon from the background late-echo watch; add a mid-wait (~30–45s) prompt — "keep the caller on hold or escalate now?" — rather than a silent 90s "Confirming…". The current constants are <code>syncTimeoutMs</code> 90000, <code>syncPollIntervalMs</code> 3000, <code>lateSyncWatchMs</code> 600000 (`config.js:113-115`); Design must set/justify these against real echo latency (unknown until B1/B2 green).</td><td>`config.js:112-116`; poll loop `services/control.js:158-209`; sync-tracker UI `public/js/control.js:104-112`.</td><td><strong>C4</strong> dispatch-time freshness; real echo latency (B1/B2)</td></tr>
<tr><td><strong>C6</strong></td><td><strong>Active late-sync in-session signal.</strong></td><td>When a timed-out action later confirms (<code>late-synced</code>), give the handler an active in-session signal, not only a background ticket note — subject to C1's in-process-durability caveat.</td><td>`services/control.js:178,183-185` (late-synced + ticket note today).</td><td><strong>C1</strong> durability limitation</td></tr>
</tbody>
</table>

---

## 5. Test scope for these designs

Prove, once built:

**OOHDASH-24 /healthz (§1):**
- Configured-but-unexercised read → `subsystems.thingsboard.read: unknown` (amber), never green.
- **Stale-green regression:** once-healthy read, cred then fails with no intervening read, TTL elapsed → next `/healthz` `read: unhealthy` (red), not stale green.
- Genuinely healthy read within TTL → `read: healthy`, `status: ok`.
- All states → HTTP 200 (K8s probe invariant).

**OOHDASH-67 authz (§2) — rank-aware matrix (runs behind the R4 gate before commit):**
- `handler`-role user → `POST /control/dispatch` **permitted** (not locked out — the exact-match trap is avoided).
- `iot`-role user → dispatch **permitted** (outranks handler).
- authenticated user with **no OOH role** (`mapRole → null`) → dispatch **denied 403**.
- `/admin` kill-switch stays **iot-only** (unchanged, `api.js:346`).
- If iot-only policy is toggled: handler → **denied**, iot → **permitted** (proves the policy knob, and confirms iot provisioning is required).

**Hard CX (§4):**
- Confirm step shows a recognisable site name/brand/address as the dominant element (B0/R0/C9); an `accountId`-only confirm is catchable/blocked.
- A HW complaint surfaces in-app scope guidance **before compose** (R10/C8), not after.
- On the flip, an authenticated handler receives the active "control is now live" signal before first dispatch (R8).
- Mid-wait decision prompt fires within the split horizon (R11/C7); a late echo produces an active in-session signal (C6).
- Read-fault simulation: a landed write during a read-auth outage does **not** silently show "applied", and an auth-caused timeout is distinguished from device silence (C3).

---

## 6. Recommended next step

**Take the OOHDASH-24 /healthz tri-state design to Build now — it is unblocked.** It depends on no external probe: it makes the health banner honest (a dead/unexercised read cannot show green), which is exactly the trust property testers need before the flip, and it partially de-risks C3 (read-auth vs device-silence).

**Hold the OOHDASH-67 authz commit on R4.** The rank-aware `requireMinRole('handler')` gate is designed and ready to review, but **must not be merged until Spencer confirms R4** (the B2C app-assignment / OIDC audience — the true sign-in-eligible population). The minimum-viable position at the flip is the `handler`-min gate (closes the "any authenticated user" hole regardless of R4); the `handler`-vs-`iot` policy choice waits on R4. **R4 is not closed.**

**In parallel (owners named, not Design-closable):** B0/R0 site-identity data source via B2 (Spencer), B1 read-cred and B3 write-cred probes (Spencer), C2 confirm-token single-use verification (Design doer/James, pre-flip), and C5 flip-interlock (James, Release-preflight).

---

*All line numbers cited against repo `main`, 2026-09-12, and verified firsthand for this artefact: `api.js:140,346`, `auth.js:175,197,223`, `tb-client.js:28,47,149-151`, `server.js:63-70`, `config.js:40-41,113-115`, `bridge.js:57-67,101,120-129`, `control.js:49,54,58-63,66,74,158-209`, `public/js/control.js:95-98,104-112`. UNVERIFIED items (R4, B0–B3, C2) each name the exact probe + owner. This artefact does not invoke reviewers, open a PR, or flip anything — the Orchestrator governs the Design gate.*
