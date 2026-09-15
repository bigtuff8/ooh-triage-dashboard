<!-- gate:contract
whatYouApprove: The R1 Build-PLAN for the OOH Triage Dashboard live-control release — a single sequenced, buildable plan covering every design-owned item, so a set of Build-doers can execute it. Approving advances the design set to Build; it authorises NO code change, NO commit/merge, and NO write-flip. It selects a build order (yours to confirm) and pins the merge gates and parked items.
whatItDoes: For each of the nine design-owned items it states concrete build scope (files and functions), buildability (buildable-now vs blocked-with-named-owner), the test obligation that makes the item done, and any merge gate. It folds the Design-gate panel's build-time findings into named line-items. It sequences write-safety first (OOHDASH-12 then C2), then OOHDASH-24, then the site-identity handler fix (B0/R0), then C8/R10, R11/C7, C6/C1, R8/S10 — with OOHDASH-67 PARKED behind R4.
whatItDoesNot: Closes NO register row. Does NOT flip writes — WRITES_DISABLED stays true and no build enables device control. Does NOT commit or merge OOHDASH-67 (hard-gated on R4). Does NOT close external blockers B1 to B3, R4, or the R7 hot-water product decision — all remain OPEN and Spencer-owned. Does NOT author a gate verdict, convene a panel, or open a PR. The OOHDASH-19 flip stays behind the C5 B0-to-B3-green preflight checklist.
panel: To be run before this gate is presented — verdicts recorded here.
DECISION build-plan-ready: The plan is internally consistent with the nine merged design artefacts and the conditions register, every load-bearing code claim re-verified against main. Recommend PASS to Build, building in the stated order, honouring the two merge gates (OOHDASH-12/S4; OOHDASH-67/R4) and the write-safety invariant. Ordering is James's to confirm at the gate. No register row is closed by this plan.
-->

# Build-PLAN — OOH Triage Dashboard (R1 live-control)

**Stage:** Build-PLAN. **Date:** 2026-09-16. **Repo:** main (bigtuff8/ooh-triage-dashboard), app v1.2.0. **Basis:** the nine merged DESIGN artefacts + the conditions register under docs/project/releases.

**Method.** Every code touch-point below is drawn from the design artefacts' code-surface sections and re-verified firsthand against main for this plan: the fail-open predicate at config.js:87; killswitch.writesBlocked() consuming it first at killswitch.js:31-34; isConfirmed() as a pure non-consuming read at resolution.js:65-68; the dispatch gate at control.js:49 and the irreversible write at control.js:74; dispatch as authenticated-only at api.js:140; ROLE_PRECEDENCE at auth.js:175; the /me handler at api.js:35-45.

> **Standing invariants (every item honours these).** WRITES_DISABLED stays true; NOTHING in this plan flips writes and no build enables device control. No register row is closed by building. External blockers B1 to B3, R4 and the R7 product decision remain OPEN and Spencer-owned. OOHDASH-67 must not be committed or merged until R4 clears. Every item references register rows by ID and cites code to file and line.

## Ordering (recommended — James's to confirm at the gate)

Build write-safety before anything a handler could dispatch through, then observability, then the high-value UX handler fix, then the remaining scope/timing/signal items; park the R4-blocked item.

1. **OOHDASH-12** — fail-closed write default (S4 audit is merge-blocking).
2. **C2** — confirm-token single-use (consume-before-write).
3. **OOHDASH-24** — /healthz active read-probe + tri-state.
4. **B0/R0** — site identity at confirm (buildable name-slice; clears tester tests 1 to 3).
5. **C8/R10 (OOHDASH-70)** — hot-water out-of-scope R1 default, presence-driven.
6. **R11/C7** — confirm-loop timing (mid-wait prompt; 90s stays provisional).
7. **C6/C1** — late-sync alert (durable ticket + ephemeral banner; Cosmos persist deferred).
8. **R8/S10** — control-is-live signal.
9. **OOHDASH-67** — dispatch authz — **PARKED** pending R4; plan only, do not build or merge.

**Rationale.** Items 1 and 2 harden the irreversible write path before any downstream handler UX is built on top of it (a fail-open default or a replayable token is the worst thing to leave live while other work lands). Item 3 makes the write-lock and read-auth states observable, which items 1 and 8 both rely on for their boot/banner signals. Item 4 is the highest tester-visible value (tests 1 to 3) and is independent of 1 to 3. Items 5 to 8 are UX/signal layers with no write-enable. Item 9 cannot be built until R4 clears.

**Hard dependencies to flag.** (a) Items 1 and 8 both read the same config.writesDisabled truth — build 1 first so 8's controlLive derives from the corrected contract. (b) Item 8's client-side block extension is cleaner once item 1 has landed the loud boot signal, but is not strictly blocked by it. (c) Item 9's role gate is pinned to land before or with the OOHDASH-19 flip (C5 preflight), independent of build order.

## 1. OOHDASH-12 — fail-closed write default (S4/C5) — MERGE-GATED on S4

**Build scope.**
- config.js:87 — replace the fail-open predicate with the fail-closed explicit-enable contract (writes enabled only when the raw WRITES_DISABLED, trimmed and lower-cased, is exactly "false"). Read raw, not via env() whose empty-to-fallback collapse must not be inherited. Update the misleading "fail-safe by design" comment at config.js:83-86.
- server.js — add a loud [WRITE-LOCK] boot line after validateConfig() (near the listen callback :132-134): DISABLED reports engaged; ENABLED emits a distinct warn banner, unmissable in production. No change to the /healthz body (already echoes writesDisabled at server.js:76).
- services/killswitch.js — no change; writesBlocked() (:31-34) inherits the safer default automatically.

**Buildability.** Buildable now. No external blocker.

**Test obligation (done = green).** Unset means disabled; empty means disabled; "true" means disabled; exact "false" means enabled; the normalisation-boundary set each resolves per the trim-plus-lower exact-"false" contract; the [WRITE-LOCK] boot line asserted in both states; /healthz writesDisabled echoes config.writesDisabled; kill-switch inheritance returns the deploy-time reason with no Cosmos read.

**Merge gate (S4 — MERGE-BLOCKING).** Not mergeable until the S4 environment-config audit is reconciled to the new contract: k8s/deployment.yaml (:68-69, sets "true" — safe, but its VALUE is now load-bearing; comment must say so); .env.example (currently has NO WRITES_DISABLED line — ADD one documenting "enabled only on exact false"); Dockerfile (confirm no stray image-level default; leave the flag out of the image); dev/staging/CI paths (document non-live modes are write-inert; any live-mode staging must set the flag explicitly); docker-compose and CI workflow env recorded as absent in-repo. C5 note: this build preserves the property C5 relies on (the flip must be a positive greppable WRITES_DISABLED=false diff, never mere absence) but does NOT create the C5 preflight checklist — that is a Release-preflight artefact on OOHDASH-19.

## 2. C2 — confirm-token single-use (consume-before-write)

**Build scope.**
- services/resolution.js — add consumeConfirmation(token, siteNo, operatorId): the current isConfirmed body (:65-68) plus a synchronous confirmations.delete(token) on the matched path, returning true only after deletion. Update the aspirational module comment (:16) to state dispatch consumes the token. Retain isConfirmed (pure read) ONLY if a verified non-dispatch caller needs it; otherwise remove it so no second replayable path survives — verify callers first.
- services/control.js — replace resolution.isConfirmed(...) at :49 with resolution.consumeConfirmation(...), keeping it the first gate and ensuring it runs before the first pre-write await and before tb.writeSharedAttribute (:74). On false, throw the existing 409. No change to actionId/audit minting. Token is spent on admission, not on write success. **Atomicity note:** the confirmations.delete(token) MUST run synchronously in the same event-loop tick as the get(), with NO await between check and delete — that is what guarantees exactly-one at replicas:1 under two interleaved dispatches; an intervening await would reopen the double-fire window the concurrency test guards.

**Buildability.** Buildable now. No external blocker.

**Test obligation.** Replay rejected (second dispatch with used token means 409, exactly one write); concurrency (two interleaved same-token dispatches mean exactly one write, one 409); retry-after-success denied; happy path dispatches once; wrong-owner/wrong-site denied and does NOT spend the legitimate owner's token. Drive via the fixture seam; stub the write to count calls — no live portal write in CI.

**Merge gate.** None beyond the test obligation. State honestly: C2 is NOT closed by building — it clears only when the replay-plus-concurrency proof passes and the named gate records it, pre-OOHDASH-19. Single-replica atomicity is the proof baseline and is sufficient at replicas:1; cross-replica single-use is a KNOWN limitation flagged to C5 preflight, not built here. A pod restart drops in-flight tokens — fail-safe (denies, never double-fires).

## 3. OOHDASH-24 — /healthz active read-probe + tri-state

**Build scope.**
- services/tb-client.js — replace the boolean healthy latch (:28) with a probe-result record plus freshness TTL; add an active read probe reusing getToken() (:29-37); have tbStatus() (:145-153) emit the read tri-state.
- server.js — update the degraded predicate (:66-70) to map the read tri-state: amber unknown is not green, unhealthy is degraded, unknown surfaced distinctly from unhealthy. Keep HTTP 200 (:63-65). **Pin the concrete consumer edit:** server.js:70's current `thingsboard.read === false` boolean predicate MUST be widened so amber/unknown counts as not-green (a Build-doer adding a new tri-state value without updating this consumer would leave amber reading as green).
- config.js — add healthProbeTtlMs (env-overridable, default ~60000) alongside the existing control timers (:112-116).

**Buildability.** Buildable now. The unblocked ticket. No external blocker.

**Test obligation.** Unexercised-configured means unknown/amber, never green; stale-green (prime healthy, then 401 with no intervening read, advance past TTL) means unhealthy/red; genuinely healthy within TTL means green; all states return HTTP 200. Drive via the fixture/live seam — no live portal call in CI.

**Merge gate.** None beyond the test obligation. Partially de-risks C3; does not close it.

## 4. B0/R0 — site identity at confirm (C9) — SPLIT: name-now, brand/address-later

**Build scope (buildable slice — name now).**
- services/bridge.js — in fetchLiveSites() (:100-133) replace siteName: g.accountId (:124) with a best-effort name resolved for siteNo via the existing Zendesk site-field option lookup (zendesk.js:53-73), falling back to accountId on miss/error. Enrichment MUST be non-fatal. **Enrich EAGERLY in fetchLiveSites** so the name lands in the site record BEFORE search and dispatch read it — this is a deliberate correction of the Design-gate "lazy at confirm" MAJOR, which the Build-PLAN panel found contradicts this item's own test obligation: searchSites filters on siteName (bridge.js:167, so lazy-at-confirm would fail tester test 2 — search by name) and control.dispatch re-fetches via getSitesByNumber (control.js:58) and writes site.siteName into the audit record (control.js:81, so lazy would log the opaque accountId into an irreversible-action audit). The lazy rationale was mis-costed: resolveSiteTag pages the Zendesk options ONCE PER HOUR then serves an in-memory cache (zendesk.js:56), so "eager per-site" is a per-site in-memory filter, not N external calls. If cost is still a concern, memoise per siteNo off that hourly options cache — do NOT defer to confirm. Keep brand/address undefined (:125-126) and the site shape (:13-14) intact so B2 lights them up with no further change.
- services/zendesk.js — surface the matched option's human name (not just its tag value at :69) from the site-field option lookup (:66-68). No new external call. **HARD pre-build verification (not just a test):** inspect the live Zendesk site-field options and confirm option.name is genuinely human-readable — the entire name-now slice (and clearing tests 1-3 pre-B2) depends on it; if the options are not human-named this slice collapses to still showing an id and must be re-scoped. Ensure the value-only match branch (o.value.includes(siteNo)) still resolves a name from option.name, not the tag value. Keep the exactly-one-match safety (a bad/ambiguous match must fall through to the unverified warning, not guess).
- public/js/control.js — redesign the confirm-modal target (:96) so site identity is the most prominent element (C9): name largest, house number secondary, device/zone demoted. Add the unverified-name warning and de-emphasised accountId when no name resolves. Mirror identity emphasis in the sync-tracker header (:113).
- public/js/views.js — guard the resolve/confirm script and site header so missing brand/address renders name-only (no literal "undefined") until B2 (:88-91); same graceful degrade on recents/audit (:145).

**Buildability.** Name slice buildable NOW via Zendesk (no B2). Deferred slice (blocked on B2, owner Spencer/IoT): brand plus full postal address at confirm. Confirm target until B2 is name plus house number, which already ends the gk-6261 defect.

**Test obligation.** Name enrichment lands in live mode (confirm modal shows the pub name, not gk-6261); search-by-name works via the enriched record (searchSites matches on the enriched siteName, bridge.js:167 — Tony's test 2); the dispatch audit logs the enriched siteName, not the accountId (control.js:81); unverified-identity guard fires on Zendesk miss and fetchLiveSites() still succeeds; graceful brand/address degrade pre-B2; B2-ready (a record carrying brand/address surfaces them with no code change); fixture mode unchanged.

**Data-protection note.** The Zendesk-sourced site name (and later brand/address) is operational site identity for dispatch safety, not personal data; its appearance in the confirm modal, recents and audit trail is within the existing data-retention scope. No new external sharing is introduced (the lookup already runs in-app).

**Merge gate.** None. Clears tester tests 1 to 3.

## 5. C8/R10 (OOHDASH-70) — hot-water out-of-scope R1 default (presence-driven)

**Build scope.**
- routes/api.js — replace the hotwater scope-group level fn (:107): swap the hard-coded salus-it500-dhw match for a live-presence-driven level — controllable only if a genuinely controllable DHW device is present; out-of-scope-with-context where hotWaterCapable/telemetry.hotWater is observed but not controllable; else none. Same scope payload shape (:126).
- public/js/flows.js — make the out-of-scope path the deterministic default for the hotwater flow (:266-277): the boost/compose chip (:277) renders ONLY when the presence predicate says controllable; otherwise route straight to capture-and-escalate (:283-289). Front-load "not controllable here — capture and escalate" before compose.
- public/js/views.js — render the presence-driven tile state at the scope-list view (:154) so an out-of-scope-with-context level reads as "hot water monitored / not adjustable from here" rather than a bare "Not on Lighthouse here"; keep device-board fallback (:168) consistent.

**Buildability.** R1 out-of-scope default buildable NOW (presence-driven, no constant to unpick). R7 (owner Spencer, product/data, UNVERIFIED) stays OPEN: the R7 flip to controllable is deferred — the presence predicate must NOT admit salus-it500-dhw as controllable on the name alone until R7 clears.

**Test obligation.** Before-compose out-of-scope surfaces at scope-list before any compose affordance; the boost/compose chip never renders from live-shaped inventory; a synthetic controllable-DHW device flips the tile to controllable with no code change (R7-ready proof); capture-and-escalate logs a hot-water class ticket.

**Merge gate.** None. Adds no control capability.

## 6. R11/C7 — confirm-loop timing (mid-wait prompt; 90s provisional)

**Build scope.**
- config.js — add midWaitPromptMs (env MID_WAIT_PROMPT_MS, default 30000, invariant greater than 0 and at most syncTimeoutMs) to control (:113-115). Comment the 90s syncTimeoutMs as provisional-pending-B3. Leave syncTimeoutMs/lateSyncWatchMs values as-is (the decide-now vs late-echo-watch split is already real in the model — do NOT collapse it).
- public/js/control.js — in ctlSend (:135-141) arm a one-shot mid-wait timer on entering confirm; render a mid-wait decision card in the sync-tracker (:106-109) with three choices: keep caller on hold (dismiss, keep polling), escalate (reuse ctlEscalate), stop waiting (adopt the existing timeout treatment immediately). Suppress the prompt if the action already settled. Clear the timer at the existing clearInterval sites (:145,182,190). No change to the 2s client poll or the server clock.
- No server lifecycle change: services/control.js timeout (:206-208) and watch (:166-167,177-178) unchanged.

**Panel detail folded in.** Deliver midWaitPromptMs via /api/me (alongside the R8 controlLive addition) rather than a bespoke bootstrap constant, so both client knobs arrive on one surface.

**Buildability.** Mid-wait prompt buildable now. The 90s decide-now horizon stays a justified-provisional value; calibration against measured echo latency is a proof obligation on B3/OOHDASH-18 (owner Spencer/IoT, not run) — not built or closed here.

**Test obligation.** Mid-wait prompt fires at the horizon while still pending; the three choices route correctly; prompt suppressed on early settle; server 90s timeout and 10-min watch unchanged.

**Merge gate.** None.

## 7. C6/C1 — late-sync alert (durable ticket + ephemeral banner)

**Build scope (buildable slice).**
- services/zendesk.js — reword addLateSyncNote (:206-209) from a background footnote to an actionable operator update: previously-reported-not-applied, now applied late, name site/device/value/time, instruct next handler to verify with the caller. Optionally add a filterable marker for the OOH view.
- services/control.js — ensure a timed-out action has a ticketId so the late note (:183-185) has a durable target; keep the audit correction (:181) and the late-synced set (:180) unchanged.
- public/js/control.js — split the late-synced render from normal synced (branch at :154,157): a distinct done-late phase/banner ("applied LATE — reported not-applied, device has now confirmed; check nothing was actioned twice") for a handler still on the tracker. Ephemeral by design.

**Deferred slice (C1 proof obligation, DEFERRED).** Cosmos persistence of in-flight actions (persist the minimal watch fields on dispatch near control.js:110; rehydrate non-settled actions inside watchUntil on startup near :152-157; re-arm the poller). This is the only true fix for the restart hole; NOT built here — C1 stays OPEN until it lands.

**Buildability.** Durable-ticket plus ephemeral-banner slice buildable now. Cosmos persistence deferred.

**Test obligation.** In-session late banner (tracker open) shows the distinct applied-LATE banner; cross-shift durable note posts after escalate even with no session watching; audit corrected to synced-late; note target guaranteed at timeout; C1 known-gap test asserts the LIMIT (simulate pod restart mid-window means no note, no correction, no alert) as a documented expected gap — do NOT mark it passing; it flips only when the Cosmos fix lands.

**Panel detail folded in — durable-note write cost.** Decide whether EVERY timeout guarantees a Zendesk ticket for the durable late-note; weigh the write cost and prefer lazy creation (create the ticket at timeout only when needed to carry a late note).

**Merge gate.** None on the buildable slice.

## 8. R8/S10 — control-is-live signal

**Build scope.**
- routes/api.js — in the /me handler (:35-45) add derived controlLive: not config.writesDisabled alongside the existing killSwitch (:39). No new store, no new route. (This is also the surface carrying midWaitPromptMs per item 6.)
- public/js/app.js — (a) extend writesDisabled(siteNo) (:42-47) to also consult ks.writesDisabled so the deploy lock produces a proper client-side block while OFF; (b) render a control-live-banner in the shell banner region (:96-98) from state.me.controlLive, styled distinctly from the red kill-banner; (c) in boot()/refreshMe() (:51-63) add a sessionStorage last-seen transition check and fire a one-time first-use ack modal on OFF-to-ON only (not for already-ON-at-load).
- public/css/styles.css — add a banner.live style distinct from banner.kill (enabled state, not a block).

**Buildability.** Buildable now — the signal is structurally derived from config.writesDisabled and can never be hard-coded to live. Depends on item 1 for the corrected writesDisabled truth. Gated behind the actual OOHDASH-19 flip at runtime (it reflects the true flag; it does not flip it).

**Test obligation.** OFF shows no live-banner and blocks client-side (not only the 423); ON shows the live-banner; OFF-to-ON within a session fires the first-use ack exactly once; already-ON at load shows the banner but NO ack; flipping the flag back to true returns the UI to OFF (proves never-hard-coded); live-banner and first-use ack do not fight/stack on the confirm modal.

**Merge gate.** None. The S11 human-comms plan is OUT OF SCOPE (owned by James) — the banner/ack is the in-app signal only.

**Panel C5-preflight pin (plan output, not built now).** Add an ON-to-OFF "returned to safety-lock" signal to mirror go-live, so a re-disable is announced the same way. Pinned to the C5 preflight, not built in this item.

## 9. OOHDASH-67 — dispatch authz — PARKED pending R4 (plan only)

**Build scope (specified, NOT to be built/committed/merged until R4 clears).**
- services/auth.js — add a rank-aware requireMinRole(minRole) guard built on ROLE_PRECEDENCE (:175): admit any operator whose role ranks at least as high as minRole, deny unknown/null. Leave the exact-match requireRole (:223) intact for /admin.
- routes/api.js — gate the dispatch route (:140) with requireMinRole('handler') (admits handler plus iot, denies role-less authenticated users — closes the any-authenticated-user hole). Policy knob: requireMinRole('iot') if Decision 4 goes iot-only (needs iot provisioned to every intended dispatcher — an ops action). Decide whether the status/wait routes (:149,155) inherit the same gate (recommended). Note: the exact-match requireRole guard is at auth.js:219 (the plan's earlier :223 reference is the surrounding function body — use :219 for the definition).

**Buildability.** BLOCKED — hard-gated on R4 (the true sign-in-eligible population, owner Spencer, UNVERIFIED). Exact-match trap: a naive requireRole('iot') would lock out every handler — the rank-aware guard is mandatory.

**Test obligation (runs behind the R4 gate before commit).** Handler permitted; iot permitted; role-less authenticated user denied 403; /admin stays iot-only; iot-only toggle proves handler-denied / iot-permitted.

**Merge gate (HARD — R4).** Must NOT be committed or merged until R4 clears. R4 is not closed and must not be treated as closed.

**Panel C5-preflight pin.** The requireMinRole('handler') dispatch gate MUST land before or with the OOHDASH-19 flip — pinned to the C5 preflight checklist.

## Merge gates and parked items (summary)

- OOHDASH-12 — merge-blocked on the S4 environment-config audit (.env.example line added, k8s comment made load-bearing, Dockerfile confirmed clean, non-live paths documented).
- OOHDASH-67 — HARD-gated on R4; specified but PARKED, not built/committed/merged.
- C2 — not closed by building; clears only when replay-plus-concurrency proof is green and the named gate records it (pre-flip). Cross-replica single-use flagged to C5.
- C1 — Cosmos persistence of in-flight actions DEFERRED; C1 stays OPEN. The restart-hole (a pod roll mid-window silently drops the late-sync watch — fail-safe but the audit stays uncorrected) MUST be surfaced on the C5 pre-flip preflight as a conscious go-live decision, not an inherited gap; item 7's known-gap test documents it.
- B0/R0 brand+address, R7 hot-water control, B3 90s calibration — deferred slices behind Spencer-owned B2/R7/B3; buildable slices proceed now.

## Panel findings folded in (line-item map)

- MAJOR (site-identity) — CORRECTED by the Build-PLAN panel: the Design-gate "enrich lazily at confirm" MAJOR was found to contradict item 4's test obligation (search-by-name and the dispatch audit both read siteName off the eagerly-populated record) and was mis-costed (resolveSiteTag is hourly-cached). Item 4 now specifies EAGER enrichment in fetchLiveSites off the cached options (memoise per siteNo if cost matters), never lazy-at-confirm.
- C5 preflight pins (plan outputs, not built now): replicas:1 invariant (C2/C1 baseline); requireMinRole('handler') lands before/with OOHDASH-19 (item 9); env re-disable is a pod-roll so abort-SLA equals pod-roll time (S6, C5 preflight note); at replicas:1 that abort pod-roll is a hard cutover with a brief unavailability gap and in-flight-action loss (fail-safe: denies) — confirm the maxUnavailable/surge posture is acceptable for abort timing; ON-to-OFF "returned to safety-lock" signal (item 8), built so item 8's sessionStorage transition scaffold makes it a pure additive follow-on with no rework; assert /healthz.writesDisabled and /me.controlLive derive from the same config truth and cannot diverge across the flip.
- Build-doer details: ONE interrupt-precedence rule across the three tracker interrupts (control-live ack, then mid-wait prompt, then late-sync banner) — the first-use ack must clear before a confirm step, must not stack on an open confirm modal, and the late-sync banner supersedes a stale mid-wait card (state this single rule at build); durable-note-per-timeout decided lazy (item 7); midWaitPromptMs delivered via /api/me (item 6); Zendesk option human-name plus exactly-one-match safety confirmed (item 4).
- S9 traceability: each item carries its register IDs and file/line citations so a Build-doer's PR can be traced back to the condition it discharges.

## S9 traceability line

OOHDASH-12 to S4/C5; C2 to C2/C5(cross-replica); OOHDASH-24 to C3; B0/R0 to B0/R0/C9/B2; OOHDASH-70 to C8/R10/R7; R11/C7 to R11/C7/B3; C6/C1 to C6/C1; R8/S10 to R8/S10/S11; OOHDASH-67 to R4. No row closed by this plan.

**Tester-feedback traceability.** Tony's tests 1 to 3 (site identity) are discharged by item 4 (B0/R0). Test 6 (Lighthouse scope tiles — "not on lighthouse here") is improved by item 5's presence-driven scope tile (monitored-not-adjustable context). Test 5 (device coverage — "no boiler or tuya devices found") is tied to B2 (bridge inventory contract, Spencer-owned) and is NOT closed by any build item here — it is named so it does not silently fall through the split. Tests 10 and 11 (dropped outcome notes; P1/SMS) are separate defects, out of this design/build scope (owned by James's post-design feedback pass).

---

*All line numbers cited against main, 2026-09-16, re-verified firsthand for this plan. This plan authors a Build-PLAN only; it does not invoke gates, convene a panel, write application code, open a PR, commit, or flip anything.*
