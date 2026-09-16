<!-- gate:contract
whatYouApprove: This is the Release-preflight go/no-go checklist for the OOH Triage Dashboard live-control release (R1) — the FINAL hard gate before the eventual OOHDASH-19 write-flip. Reading it approves an honest, complete picture of what is app-side READY (merged this release) and every precondition still standing between "here" and turning WRITES_DISABLED=false, each with an owner and a confirming probe. Approving this artefact authorises NO code change and does NOT flip writes.
whatItDoes: Records, grouped by owner and status (READY / DEFERRED / BLOCKED-EXTERNAL / OWNED-BY-JAMES), the app-side work that is DONE and merged (OOHDASH-12 fail-closed default, C2 single-use, OOHDASH-24 /healthz tri-state, B0/R0 site name, OOHDASH-70 HW scope, R11/C7, C6/C1, R8/S10 — full suite green 115 unit + 41 e2e), and enumerates the HARD flip blockers (B1/R1, B2/R2, B3/R3, R4/S1), the C5 interlock that must ride on the flip PR, the deferred durability/observability decisions, and the James-owned shakedown conditions (S2, S6, S7, S8, S11, S12). Every load-bearing code claim is re-verified against main.
whatItDoesNot: Closes NO register row. Does NOT flip writes — WRITES_DISABLED stays exactly "true" (k8s/deployment.yaml). Does NOT prove any external blocker; B1, B2, B3, R4 remain UNVERIFIED and Spencer/IoT-owned. Does NOT build or merge OOHDASH-67 (the requireMinRole dispatch gate, still PARKED). Does NOT specify the shakedown itself — it names what the shakedown spec must contain.
panel: To be run before this gate is presented — verdicts recorded here.
DECISION preflight-not-yet-go: NOT-YET-GO. App-side R1 is READY and merged; the write-flip is HELD. Four HARD blockers are still RED and Spencer/IoT-owned (B1/R1 TB read cred, B2/R2 bridge inventory read, B3/R3 SR-3 write cred + echo-latency, R4/S1 sign-in-eligible population). Ordered path to GO: (1) Spencer turns B1, B2, B3 GREEN with the actual probes (a verbal "happy to switch it on" does NOT clear them); (2) R4 population verified AND OOHDASH-67 requireMinRole('handler') lands with/before the flip; (3) the deferred durability/observability items (C1, C2 cross-replica, ON->OFF signal, signal-consistency) are DECIDED — built or consciously accepted; (4) James finalises the S2 shakedown spec (S6/S7/S8 inputs) and the S11 handler-comms plan, S12 comprehension proven; (5) OOHDASH-19 — a reviewed PR setting WRITES_DISABLED=false WITH the C5 B0-B3-green checklist AND OOHDASH-67 — is merged, then the supervised shakedown runs on the isolated bench device. Nothing in R1 flips anything; WRITES_DISABLED stays true until every line above is green.
-->

# Release-preflight — go/no-go for the OOHDASH-19 write-flip

**Release:** OOH Triage Dashboard — internal IoT-team live-control (R1). **Stage:** Release-preflight (final hard gate before the flip). **Date:** 2026-09-16.
**Repo (read-only):** main, app v1.2.0.
**Verdict:** **NOT-YET-GO.** App-side R1 is ready and merged; the flip is held behind four RED external blockers and the James-owned shakedown. Every code claim below is verified against main.

This artefact does not flip writes. WRITES_DISABLED stays exactly "true" in k8s/deployment.yaml (verified, line 75). The flip is a separate reviewed PR (OOHDASH-19) that cannot proceed while any HARD blocker is red.

## 1. App-side readiness — READY (DONE and merged this release)

All eight buildable items are merged to main, each independently reviewed SHIP, covered by a green suite (115 unit + 41 e2e). Cited against the Test-results gate and re-verified in code:

- **OOHDASH-12 — fail-closed write default (PR #12).** Writes are enabled ONLY when WRITES_DISABLED is exactly "false" (trim + lower-case) — config.js:90. Unset, empty, "true", "0", a typo, or REMOVING the line all resolve to writes DISABLED. This makes the flip a positive, greppable diff ("true" -> "false" in k8s/deployment.yaml:74-75), never mere absence — this is what preserves C5.
- **C2 — confirm-token single-use, consume-before-write (PR #13).** The token is atomically CONSUMED before any write: services/control.js:57-63 (consumeConfirmation -> 409 on replay). Proven at replicas:1.
- **OOHDASH-24 — /healthz tri-state (PR #14).** thingsboard.read is now unconfigured/unknown/unhealthy/healthy; only healthy is green, so a dead/stale read cred cannot latch green (server.js:67-72). Surfaces read-auth honestly — but does NOT prove the cred (see B1).
- **B0/R0 — recognisable site name at confirm (PR #15).** Eager enrichment lands a human site name at confirm (clears tester tests 1-3); pre-build verified live against Zendesk (house 6261 => "Wheatstone Inn (Gloucester)"). Brand + full address DEFERRED to B2. C9 confirm hierarchy + unverified-site warning shipped alongside.
- **OOHDASH-70 (C8/R10) — hot-water out-of-scope R1 default (PR #16).** Presence-driven: live combi reads monitored-not-controllable; HW routes to capture-and-escalate up front. R7-open: the tile flips on live controllable presence with no code change if R7 lands.
- **R11/C7 — confirm-loop mid-wait decision prompt (PR #17).** Fires at the mid-wait horizon with three routed choices; server clock untouched.
- **C6/C1 — late-sync alert (PR #18).** Durable actionable ticket note + synced-late audit, plus a distinct applied-late banner. Ships WITH a C1 known-gap test that asserts the pod-restart hole as an expected limit (see section 4).
- **R8/S10 — control-is-live signal (PR #19).** controlLive is DERIVED, never hardcoded: routes/api.js:49 — controlLive: !config.writesDisabled — structurally tied to the same deploy-time truth /healthz echoes, so operator-facing and probe-facing signals cannot diverge. OFF/ON banner + client-side block + OFF->ON one-time ack.

**Suite:** full 115/115 unit + 41/41 e2e green on merged main. **Invariant held throughout:** no test enables device control on a live site.

## 2. HARD flip blockers — BLOCKED-EXTERNAL, owner Spencer / IoT platform (must be GREEN before the flip)

These are UNVERIFIED and have been since roughly 20 Aug. State plainly: **Sam Day saying he is happy for control to be switched on does NOT clear these** — they need the actual probes green. The /healthz tri-state now surfaces read-auth honestly but proves no credential.

- **B1 / R1 (OOHDASH-64) — TB READ credential validity — RED.** Prove the ThingsBoard read cred authenticates against the live portal: a live POST to the portal login with the secret's TB_USERNAME/TB_PASSWORD returning 200 + token. A bad read cred means every write fires but never confirms. read=false today is a lazy-flag artefact, not proof of a bad cred.
- **B2 / R2 (OOHDASH-75) — bridge device-inventory read from the pod — RED.** From the pod: GET {BRIDGE_BASE_URL}/api/devices returning 200 + a flat device array; confirm AND version the F025 field contract (currently provisional). This ALSO gates B0/R0 brand + full address (the deferred site-identity slice).
- **B3 / R3 (OOHDASH-18) — SR-3 scoped WRITE credential — RED.** The write session has never made a successful call. Bench-prove a scoped-cred write to a bench device, then read the *SyncStatus echoes. This probe ALSO yields the measured echo latency needed to calibrate the 90s decide-now horizon (R11), which stays justified-provisional until then.
- **R4 / S1 (gates OOHDASH-67) — true sign-in-eligible population — RED.** Verify the B2C app-assignment / OIDC audience — the real dispatch population, not the 1500 count. This is load-bearing for authz: the dispatch route is requireAuth-only today (routes/api.js:164, POST /control/dispatch — no role guard; only /admin carries requireRole('iot') at routes/api.js:370). So at the flip, EVERY authenticated user gains dispatch UNLESS the requireMinRole('handler') gate (OOHDASH-67) lands with/before the flip. OOHDASH-67 is designed and PARKED — it exists in BUILD_PLAN.md section 9 only, NOT in code (verified: no requireMinRole on main).

**Four HARD blockers RED, all Spencer/IoT-owned.**

## 3. C5 interlock — must ride ON the flip PR

The flip PR (OOHDASH-19) MUST carry an explicit **B0-B3-green checklist** bound to the WRITES_DISABLED=false diff, so the flip cannot proceed while any blocker is red — process memory is not an interlock (C5). Because the fail-closed default makes the flip a positive greppable one-line diff (config.js:90 + k8s/deployment.yaml:75), the checklist has a concrete, auditable target to bind to.

The flip PR MUST ALSO land **OOHDASH-67** (requireMinRole('handler') on the dispatch route, per BUILD_PLAN.md:152-153) so dispatch is not left any-authenticated-user once writes are live. Landing the flip without OOHDASH-67 is not acceptable while R4 stands.

## 4. Deferred durability / observability — DEFERRED, must be DECIDED before the flip

Each must be a conscious call — built, or explicitly accepted as a named go-live risk:

- **C1 — late-sync watch is in-memory.** lateSyncWatchMs runs in-process; a pod restart mid-window silently drops it and leaves the audit uncorrected (a known-gap test documents this on main). DECIDE: build the deferred Cosmos persistence, or accept it as a stated go-live risk.
- **C2 cross-replica.** Single-use holds only at replicas:1. k8s/deployment.yaml already pins replicas: 1 with a "MUST stay at 1 until session affinity / shared store" note — **pin replicas:1 as an explicit flip invariant**, or add a shared single-use store before any scale-out.
- **ON->OFF "returned to safety-lock" signal.** The R8/S10 signal covers OFF->ON; the reverse (re-disable / abort) is scaffolded and additive. Build it so an abort is as visible as go-live.
- **Signal consistency across the cutover.** Confirm /healthz.writesDisabled and /api/me.controlLive stay consistent through the flip. They are structurally tied (controlLive: !config.writesDisabled, routes/api.js:49) — confirm this holds across the actual pod-roll.

## 5. Shakedown / release-preflight — OWNED-BY-JAMES

- **S2 — supervised shakedown spec.** Named supervisor, isolated/bench device for first actuation, explicit success criteria, an explicit re-disable/abort trigger, and the partial-state-during-roll window acknowledged.
- **S6 — pod-roll duration = abort SLA.** Measure the rolling-restart duration and state it as the abort SLA. An env re-disable is a pod-roll (boot-read flag, config.js:90), NOT instant — the iot-gated kill-switch admin page (routes/api.js:370, requireRole('iot')) is the instant lever.
- **S7 — supervisor holds iot.** Confirm the shakedown supervisor holds the iot role (the kill-switch admin surface is iot-gated).
- **S8 — isolated bench Salus device.** Confirm an isolated bench Salus device (NOT a live trading site) for the first actuation.
- **S11 — handler-communication plan.** For the chosen dispatch-authz policy + go-live. The in-app R8/S10 signal covers handlers live through the transition; join-after-flip awareness leans on S11.
- **S12 — OOHDASH-11 man-marking scenarios.** Prove handler comprehension of the UX, not merely that a command fired.

## 6. Product decision — track, does NOT block the flip

- **R7 — hot-water controllable (Spencer / product).** R1 ships HW out-of-scope; the tile flips on live controllable presence if R7 lands (OOHDASH-70 is presence-driven, no code change needed). Track it; it is not a flip gate.

## 7. Flip mechanics — stated precisely

**OOHDASH-19** = a reviewed PR that sets WRITES_DISABLED=false in k8s/deployment.yaml (a positive, greppable one-line diff from "true" -> "false") WITH the **C5 B0-B3-green checklist** AND the **OOHDASH-67 requireMinRole('handler')** dispatch gate — executed ONLY after all HARD blockers (section 2) are green AND the shakedown (section 5) is specified. Nothing in R1 so far flips anything; WRITES_DISABLED stays exactly "true".

## 8. Ordered path to GO

1. **Spencer/IoT turn B1, B2, B3 GREEN** with the actual probes (live login 200+token; pod /api/devices 200 + F025 confirmed; bench write + echo latency). A verbal "happy to switch it on" does not clear them.
2. **R4 population verified** AND **OOHDASH-67** built to land with/before the flip.
3. **Deferred items DECIDED** (section 4): C1 persistence-or-accept, replicas:1 pinned as invariant, ON->OFF signal built, signal-consistency confirmed.
4. **James finalises S2 shakedown spec** (with S6/S7/S8 inputs) and the **S11** handler-comms plan; **S12** comprehension proven.
5. **Merge OOHDASH-19** (flip diff + C5 checklist + OOHDASH-67), then run the supervised shakedown on the isolated bench device with the abort lever confirmed.

Until every line above is green, **WRITES_DISABLED stays true.**
