<!-- gate:contract
SECTION Purpose: This is the SINGLE carried-conditions register for the OOH live-control release — the source of truth the gates reference. It consolidates, de-duplicated, every open blocker, condition, requirement and shaping condition so ticket designs stop re-pasting them. NONE of these is closed; each is OPEN/TRACKED and gates the stage/ticket that owns it.
SECTION Pre-flip blockers: B0 (site identity at confirm), B1 (TB read cred), B2 (bridge inventory read), B3 (SR-3 write cred) — from DISCOVERY section 0. Each has an owner and a confirming probe; none closes from this repo alone.
SECTION Round-2 conditions: C1 through C9 — from DISCOVERY section 10, the accept-with-conditions register. Each with raised-by, carried-to, owner, resolve-before and a one-line current design response where one exists.
SECTION Requirements and R4: R0 through R11 — from DISCOVERY section 5 — mapped to their owning ticket/stage. R4 is the HARD precondition for OOHDASH-67; it is UNVERIFIED, owned by Spencer.
SECTION Shaping conditions: The 12 accept-with-conditions rows from SHAPING section 10, each mapped to the stage/ticket that owns it.
SECTION Honesty: NONE of these rows is closed. This register is where they live so ticket designs (DESIGN_healthz-stale-green, DESIGN_dispatch-authz, and downstream) can point here instead of re-pasting.
DECISION register-role: This register is the single source of truth for carried conditions across the release. Ticket-level design artefacts reference rows here by ID rather than re-pasting condition text. A condition is not cleared until its named gate records it resolved; nothing here is resolved by the existence of this document.
-->

# Release Conditions Register — OOH IoT-Team Live-Control

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Date:** 2026-09-12
**Sources (verified):** pre-flip blockers B0–B3 from `DISCOVERY_control-plumbing.md` §0; round-2 conditions C1–C9 from `DISCOVERY_control-plumbing.md` §10; requirements R0–R11 (incl. R4) from `DISCOVERY_control-plumbing.md` §5; the 12 shaping conditions from `LIVE_CONTROL_RELEASE_SHAPING.md` §10.
**Status of every row: OPEN / TRACKED — none is closed.** This register is the single place these live; ticket designs reference rows by ID rather than re-pasting. A condition is cleared only when its named gate records it resolved.

---

## 1. Pre-flip blockers (DISCOVERY §0)

None closes from this repo alone. B0 is a pre-flip safety gap; B1/B2/B3 are external-owned probes.

<table>
<thead>
<tr><th>#</th><th>Blocker</th><th>State</th><th>Confirming probe</th><th>Owner</th><th>Resolve before</th><th>Owning stage/ticket</th></tr>
</thead>
<tbody>
<tr><td><strong>B0 / R0</strong></td><td><strong>Site identity at the confirm step.</strong> <code>siteName</code>/brand/address are not on the wire — <code>accountId</code> proxies the site, so the dispatch confirm may show an opaque identifier. A wrong-site dispatch is irreversible.</td><td><strong>KNOWN GAP (verified).</strong> <code>fetchLiveSites()</code> sets <code>siteName = accountId</code>, brand/address <code>undefined</code> (`bridge.js:120-129`, TODO for a real name via registry/Zendesk).</td><td>Supply a recognisable name/brand/address at confirm — via the registry/Zendesk lookup the TODO names, or an extended F025 contract (ties to B2).</td><td>Design (requirement) + Spencer / IoT (data via B2)</td><td>OOHDASH-19 flip</td><td>Design (confirm-dispatch CX) + B2</td></tr>
<tr><td><strong>B1</strong></td><td><strong>TB READ credential validity unproven.</strong> A bad read cred means every write fires but never confirms.</td><td><strong>UNVERIFIED.</strong> <code>read=false</code> in <code>/healthz</code> is a lazy-flag artefact (`tb-client.js:28`), proof of neither a bad nor a good cred.</td><td>Live <code>POST https://portal.lhlive.co.uk/api/auth/login</code> with the secret's <code>TB_USERNAME</code>/<code>TB_PASSWORD</code>. 200+token = valid; 401 = fault.</td><td>Spencer / IoT platform</td><td>OOHDASH-19 flip</td><td>External/ops (OOHDASH-64)</td></tr>
<tr><td><strong>B2</strong></td><td><strong>Bridge inventory read unproven from the pod (OOHDASH-75).</strong> Site search 503s; F025 device contract provisional; no site name/brand/address, no distinct hot-water device.</td><td><strong>UNVERIFIED transport + KNOWN contract gap.</strong> Path is real (`bridge.js:100-132`) but the <code>/api/devices</code> contract is provisional (`bridge.js:9-16,50-67`).</td><td>From the pod: <code>GET {BRIDGE_BASE_URL}/api/devices</code>; confirm 200 + flat device array + the F025 field contract.</td><td>Spencer / IoT platform</td><td>OOHDASH-19 flip</td><td>External/ops (OOHDASH-75)</td></tr>
<tr><td><strong>B3</strong></td><td><strong>SR-3 write credential validity unproven (OOHDASH-18).</strong> The write session has never made a successful call.</td><td><strong>UNVERIFIED.</strong> <code>writeConfigured=true</code> but <code>write=false</code> — same lazy mechanism (`tb-client.js:28,150`).</td><td>Bench-prove per OOHDASH-18: a scoped-cred write to a bench device, then read <code>*SyncStatus</code> echoes.</td><td>Spencer / IoT platform</td><td>OOHDASH-19 flip</td><td>External/ops (OOHDASH-18)</td></tr>
</tbody>
</table>

> **Evidence hygiene (B1/B3):** two things flip `read`/`write` true — a real device call succeeding in the pod, or a standalone auth probe. Neither has run from this repo. Do not treat "the flag is still false" as "the cred is bad" — the flag is lazy.

---

## 2. Round-2 conditions C1–C9 (DISCOVERY §10)

Every row is **OPEN/TRACKED**. The "current design response" is the position taken across the ticket designs; it does not close the condition.

<table>
<thead><tr><th>#</th><th>Condition (abbrev.)</th><th>Raised by</th><th>Carried to</th><th>Owner</th><th>Resolve before</th><th>Current design response</th></tr></thead>
<tbody>
<tr><td>C1</td><td>Late-sync background watch (10-min <code>lateSyncWatchMs</code>) is in-process only; a pod restart in the window silently drops it and leaves the audit uncorrected.</td><td>critical-thinker</td><td>Design gate</td><td>Design doer</td><td>Before any UX is built on the late-sync signal</td><td>Acknowledged limitation; the late-sync UX (C6) must not assume durability. Not addressed by the -24 or -67 designs.</td></tr>
<tr><td>C2</td><td>F004 confirm-token single-use unverified — a network retry can double-dispatch (irreversible write applied twice).</td><td>critical-thinker</td><td>Design (pre-flip safety)</td><td>Design doer / James</td><td>Confirm UX certified safe + OOHDASH-19 flip</td><td>Pre-flip safety property; NOT design-closable. Must be verified (confirm token consumed on first dispatch, `control.js:49`) before the confirm UX is certified.</td></tr>
<tr><td>C3</td><td>Read-token expiry mid-poll is indistinguishable from device non-response — handler told "not applied" when the fault was auth.</td><td>critical-thinker</td><td>Design gate</td><td>Design doer</td><td>Before device-non-responsive / timeout UX finalised</td><td><strong>Partly de-risked by OOHDASH-24.</strong> The tri-state/active probe gives an independent read-auth signal so an auth failure during the poll can be surfaced distinct from device silence. Does not close C3.</td></tr>
<tr><td>C4</td><td>Dispatch-time freshness of <code>getSitesByNumber</code> unstated → <code>device.online</code> (`control.js:63`) may be a stale-cache check.</td><td>critical-thinker</td><td>Design gate</td><td>Design doer / Spencer</td><td>Before R11 timeout calibration / relying on the online-gate</td><td>Flagged for R11 calibration; <code>fetchLiveSites()</code> serves a TTL cache (`bridge.js:101,130`). Online-gate must not be relied on as a live safety check without a dispatch-time re-fetch decision.</td></tr>
<tr><td>C5</td><td>No interlock binding B0–B3 (green) probes to the <code>WRITES_DISABLED</code> flip — process memory is passive assurance.</td><td>critical-thinker</td><td>Release-preflight</td><td>James / release</td><td>OOHDASH-19 flip PR merges</td><td>Release-preflight concern; NOT design-closable. Needs a concrete release gate on the flip PR (explicit B0–B3-green checklist).</td></tr>
<tr><td>C6</td><td>Late-sync active handler alert missing — a device echoing after the 90s timeout gives only a background ticket note.</td><td>customer-experience</td><td>Design gate</td><td>Design doer</td><td>Before late-sync UX finalised</td><td>Design requirement: an active in-session signal on <code>late-synced</code> (`control.js:178,183-185`), constrained by C1's durability caveat.</td></tr>
<tr><td>C7</td><td>The 90s wait needs a mid-wait handler decision prompt (~30–45s): keep the caller on hold or escalate?</td><td>customer-experience</td><td>Design gate</td><td>Design doer</td><td>Before confirm-loop wait UX (R11) finalised</td><td>Design requirement: split the confirm-loop horizon and add a mid-wait prompt on the sync-tracker (`public/js/control.js:106-109`) rather than a silent 90s "Confirming…".</td></tr>
<tr><td>C8</td><td>R10 HW scope clarity must surface at the device-list view BEFORE compose, not as a post-attempt correction.</td><td>customer-experience</td><td>Design gate</td><td>Design doer</td><td>Before compose/HW-scope UX designed</td><td>Design requirement: HW out-of-scope guidance appears before compose. The DHW scope keys off <code>salus-it500-dhw</code> which live data never emits (`bridge.js:57-67`; `api.js:107`); route HW to capture-and-escalate up front.</td></tr>
<tr><td>C9</td><td>Confirm-step visual hierarchy — site name/brand/address must be the most prominent element (reinforces B0/R0).</td><td>customer-experience</td><td>Design gate</td><td>Design doer</td><td>Before confirm-dispatch UX designed</td><td>Design requirement: the confirm modal (`public/js/control.js:95-98`) redesigned so recognisable site identity dominates; an opaque <code>accountId</code> alone is not an acceptable confirm target.</td></tr>
</tbody>
</table>

> **Honesty note.** C2 and C5 are device-write safety properties that additionally gate the pre-flip / Release-preflight path — they must not be lost between stages.

---

## 3. Requirements R0–R11, incl. R4 (DISCOVERY §5)

R4 is the **hard precondition for OOHDASH-67**; it is UNVERIFIED and owned by Spencer.

<table>
<thead><tr><th>ID</th><th>Requirement (abbrev.)</th><th>State</th><th>Owner</th><th>Owning ticket/stage</th></tr></thead>
<tbody>
<tr><td>R0</td><td>Pre-flip: confirm-dispatch step must show a recognisable site (name/brand/address), not an opaque <code>accountId</code>.</td><td>Blocker B0</td><td>Design + Spencer (data via B2)</td><td>Design (confirm CX) — same as B0</td></tr>
<tr><td>R1</td><td>Prove the TB READ cred authenticates against <code>portal.lhlive.co.uk</code> before the flip.</td><td>Blocker B1</td><td>Spencer / IoT platform</td><td>OOHDASH-64 (external/ops)</td></tr>
<tr><td>R2</td><td>Prove bridge <code>/api/devices</code> reachable from the pod + confirm/version the F025 contract.</td><td>Blocker B2</td><td>Spencer / IoT platform</td><td>OOHDASH-75 (external/ops)</td></tr>
<tr><td>R3</td><td>Bench-prove the SR-3 scoped WRITE cred.</td><td>Blocker B3</td><td>Spencer / IoT platform</td><td>OOHDASH-18 (external/ops)</td></tr>
<tr><td><strong>R4</strong></td><td><strong>Verify the sign-in-eligible population (B2C app-assignment / group / OIDC audience) BEFORE Design commits to the authz pattern</strong> — this, not the 1500 count, is the dispatch population (dispatch is <code>requireAuth</code>-only, `api.js:140`). App reads <code>OIDC_ISSUER</code>/<code>OIDC_CLIENT_ID</code> (`config.js:40-41`); assignment policy lives in Entra/B2C.</td><td><strong>HARD precondition; UNVERIFIED</strong></td><td>Spencer / IoT platform</td><td><strong>OOHDASH-67 (Design) — commit gate</strong></td></tr>
<tr><td>R5</td><td>Decide + document dispatch authz policy — prefer an app-level dispatch gate over sign-in restriction alone.</td><td>OPEN</td><td>Design doer</td><td>OOHDASH-67 (Design) — see DESIGN_dispatch-authz.md (A2)</td></tr>
<tr><td>R6</td><td>If iot-only: rework the exact-match role check OR provision iot to all operators (avoid locking out handlers).</td><td>Conditional on R5</td><td>Design doer / ops</td><td>OOHDASH-67 (Design/Build)</td></tr>
<tr><td>R7</td><td>Hot-water control from live data needs a product/data decision (combi split vs re-key DHW off <code>telemetry.hotWater</code>).</td><td>OPEN (F025 decision)</td><td>Spencer / product</td><td>F025 / OOHDASH-75-adjacent</td></tr>
<tr><td>R8</td><td>Add an active "control is now live" notification (banner / first-use prompt) at the flip.</td><td>Design-gate (hard)</td><td>Design doer</td><td>Design (flip CX)</td></tr>
<tr><td>R9</td><td>OOHDASH-24 stale-green <code>/healthz</code> fix so a dead read cannot present as healthy.</td><td>OPEN — designed</td><td>Design doer / Build</td><td>OOHDASH-24 — see DESIGN_healthz-stale-green.md</td></tr>
<tr><td>R10</td><td>In-app hot-water scope clarity: tell handlers in advance to route HW complaints to capture-and-escalate (F025 DHW gap).</td><td>Design-gate (hard); depends on R7</td><td>Design doer</td><td>Design (scope CX) — ties to C8</td></tr>
<tr><td>R11</td><td>Set/justify the confirm-loop timeout (currently 90s) against real echo latency; split the handler "decide now" horizon from the background late-echo watch (`config.js:113-115`).</td><td>Design (tuning)</td><td>Design doer</td><td>Design (confirm-loop) — ties to C4, C7</td></tr>
</tbody>
</table>

---

## 4. Shaping conditions (SHAPING §10) — 12 rows

All **OPEN/TRACKED**, each mapped to its owning stage/ticket.

<table>
<thead><tr><th>#</th><th>Condition (abbrev.)</th><th>Raised by</th><th>Carried to gate</th><th>Owner</th><th>Resolve before</th><th>Owning stage/ticket</th></tr></thead>
<tbody>
<tr><td>S1</td><td>Establish the true count of sign-in-eligible claimArea-1500 accounts (and who) — every one gains dispatch at the flip. Decision 4 cannot be taken until this exists.</td><td>critical-thinker</td><td>Discovery → Design</td><td>James / Spencer</td><td>Design gate (before Decision 4 is put)</td><td>= <strong>R4</strong>; OOHDASH-67</td></tr>
<tr><td>S2</td><td>Supervised shakedown fully specified — named supervisor, isolated/bench device for first actuation, explicit success criteria, re-disable/abort trigger, partial-state-during-roll window acknowledged.</td><td>critical-thinker</td><td>Release-preflight</td><td>James</td><td>OOHDASH-19 flip</td><td>Release-preflight</td></tr>
<tr><td>S3</td><td>Bridge-read gap raised as an owned OOHDASH ticket (site-search 503 / F025 contract) — blocks reaching any device.</td><td>critical-thinker</td><td>Prerequisite (before Discovery)</td><td>Spencer / IoT platform</td><td>Discovery begins</td><td>= <strong>B2</strong> / OOHDASH-75</td></tr>
<tr><td>S4</td><td>OOHDASH-12 environment-config audit (dev/staging/CI + compose/.env templates + k8s manifest) before inverting the fail-open default.</td><td>critical-thinker</td><td>Build-PLAN</td><td>build doer</td><td>OOHDASH-12 merges</td><td>OOHDASH-12 (Build)</td></tr>
<tr><td>S5</td><td>iot-only rework scope characterised — the change to the exact-match role check must be sized, not assumed small.</td><td>critical-thinker</td><td>Discovery / Design (for -67)</td><td>design doer</td><td>Build of -67</td><td>OOHDASH-67 — <strong>SIZED</strong> in DESIGN_dispatch-authz.md §2</td></tr>
<tr><td>S6</td><td>Pod-roll (rolling restart) duration measured and stated as the abort SLA input for the env re-disable backstop.</td><td>critical-thinker</td><td>Release-preflight</td><td>James / ops</td><td>Shakedown spec finalised</td><td>Release-preflight</td></tr>
<tr><td>S7</td><td>Shakedown supervisor confirmed to hold the <code>iot</code> role (the kill-switch admin page is iot-gated, `api.js:346`).</td><td>critical-thinker</td><td>Release-preflight</td><td>James</td><td>Shakedown</td><td>Release-preflight</td></tr>
<tr><td>S8</td><td>Isolated bench/test Salus device confirmed available for the first actuation (not a live trading site).</td><td>critical-thinker</td><td>Prerequisite (alongside bridge-read)</td><td>IoT team</td><td>Release-preflight</td><td>Release-preflight</td></tr>
<tr><td>S9</td><td>Handler live-control UX confirmed present or ticketed (pre-dispatch confirmation, post-dispatch feedback, device-non-responsive state) AND named as a Release-preflight gate condition.</td><td>customer-experience</td><td>Design</td><td>design doer</td><td>Release-preflight</td><td>Design (confirmed present in Discovery §4.3; elevated to hard CX)</td></tr>
<tr><td>S10</td><td>"Control is now live" in-app signal treated as a HARD Design-gate requirement — not optional.</td><td>customer-experience</td><td>Design</td><td>design doer</td><td>Design gate sign-off</td><td>= <strong>R8</strong>; Design (flip CX)</td></tr>
<tr><td>S11</td><td>Handler-communication plan for the chosen -67 authz policy — how handlers are told they now hold dispatch.</td><td>customer-experience</td><td>Design</td><td>James</td><td>Design gate sign-off</td><td>OOHDASH-67 (ties to R8)</td></tr>
<tr><td>S12</td><td>OOHDASH-11 man-marking scenarios explicitly cover handler-UX comprehension — prove the handler understood the UX, not just that the command fired.</td><td>customer-experience</td><td>Writer</td><td>IoT lead</td><td>OOHDASH-11 accept (before shakedown)</td><td>OOHDASH-11 (Writer)</td></tr>
</tbody>
</table>

> **De-duplication note.** S1 ≡ R4 (the sign-in-eligible population); S3 ≡ B2 (the bridge-read gap); S10 ≡ R8 (the flip notification). They are listed once per source table for traceability and cross-referenced here so no design re-pastes them.

---

*Sources: `DISCOVERY_control-plumbing.md` §0/§5/§10 and `LIVE_CONTROL_RELEASE_SHAPING.md` §10, both verified 2026-09-11/12. Code line numbers cited against repo `main`, 2026-09-12. Every row here is OPEN/TRACKED — none is closed by this register's existence. A condition clears only when its named gate records it resolved.*
