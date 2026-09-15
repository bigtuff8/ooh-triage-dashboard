<!-- gate:contract
whatYouApprove: The completed R1 Design stage for the OOH Triage Dashboard live-control release — nine design artefacts (two pre-existing, seven authored this cycle) covering every design-owned row of the conditions register. Approving advances the set to Build-PLAN; it does NOT authorise any code change or the write-flip.
whatItDoes: Locks the design approach for each item — site identity at confirm (B0/R0/C9), fail-closed write default (OOHDASH-12/S4/C5), confirm-token single-use (C2), control-is-live signal (R8/S10), confirm-loop timing (R11/C7), late-sync alert (C6/C1), hot-water scope routing (C8/R10), dispatch authz (OOHDASH-67), and /healthz stale-green (OOHDASH-24). Each cites code to file:line and references the register by ID.
whatItDoesNot: Closes NO register row. Does NOT enable device control — WRITES_DISABLED stays true. Does NOT commit or merge OOHDASH-67 (hard-gated on R4). Does NOT close the external blockers B1–B3, R4, or the R7 hot-water product decision — all remain open and Spencer-owned. Does NOT flip anything or open the door to the flip; the OOHDASH-19 flip remains behind the C5 B0–B3-green checklist and release-preflight.
panel: Independent multi-lens panel run 2026-09-15. Hard-blocking lenses Compliance, Critical-Thinker, Security, Technical — all SHIP. Advisory Customer-Experience, Integration, Product, Transition — all SHIP. 0 blocker-severity findings; every load-bearing code claim verified firsthand against the branch. Findings are build-time refinements (see below), not gate-stoppers.
DECISION design-stage-complete: The Design stage is complete and internally consistent. The panel passed 8/8. Recommend PASS to Build-PLAN, folding the listed findings into the artefacts at build. No register row is closed by this gate.
-->

# Design Gate — OOH Triage Dashboard (R1)

**Stage:** Design · **Date:** 2026-09-15 · **Branch:** `design/split-lean-24` · **Reviewer decision:** HARD operator gate (James)

## What you are approving

The **completed Design stage**: nine design artefacts under `docs/project/releases/` that together cover every design-owned item in `RELEASE_CONDITIONS_REGISTER.md`. Approving advances the set to **Build-PLAN**. It authorises **no code change** and **no write-flip**.

## The design set

| Item | Artefact | Decision (one line) |
|---|---|---|
| B0/R0 · site identity (C9) | `DESIGN_site-identity-confirm.md` | Recognisable site **name** at confirm now via the existing Zendesk lookup; brand/address deferred to B2. Fixes tester tests 1–3. |
| OOHDASH-12 · fail-open (S4/C5) | `DESIGN_fail-open-invert.md` | Invert to **fail-CLOSED**: writes ON only on an exact `WRITES_DISABLED=false`; unset/typo/anything-else = disabled. S4 audit merge-blocking. |
| C2 · confirm-token | `DESIGN_confirm-token-single-use.md` | Atomic consume-before-write. **Not closed** — states the replay/concurrency proof obligation + single-replica caveat. |
| R8/S10 · control-is-live | `DESIGN_control-live-signal.md` | Persistent "LIVE" banner + one-time go-live ack, driven by the true flag. S11 human-comms stays with James. |
| R11/C7 · confirm-loop | `DESIGN_confirm-loop-timing.md` | Keep 90s as justified-provisional (calibrate vs B3); add ~30s mid-wait prompt (hold / escalate / stop). |
| C6/C1 · late-sync | `DESIGN_late-sync-alert.md` | Durable ticket note (cross-shift) + ephemeral in-session banner. C1 restart hole confronted; Cosmos persistence deferred as proof obligation. |
| C8/R10 · hot-water scope | `DESIGN_hot-water-scope.md` | HW out-of-scope by design, front-loaded to capture-and-escalate; tile driven by live device presence so R7 stays open. |
| OOHDASH-67 · dispatch authz | `DESIGN_dispatch-authz.md` | Rank-aware `requireMinRole`. **HARD-gated on R4** — not committed/merged until R4 clears. |
| OOHDASH-24 · /healthz | `DESIGN_healthz-stale-green.md` | Active probe + tri-state so a dead read credential cannot latch green. |

## Panel result — 8/8 SHIP

| Lens | Role | Verdict |
|---|---|---|
| Compliance | hard-blocking | **SHIP** |
| Critical-Thinker | hard-blocking | **SHIP** |
| Security | hard-blocking | **SHIP** |
| Technical | hard-blocking | **SHIP** |
| Customer-Experience | advisory | SHIP |
| Integration | advisory | SHIP |
| Product | advisory | SHIP |
| Transition | advisory | SHIP |

The panel independently confirmed: `config.js:87` is genuinely fail-open; the confirm token is a non-consuming pure read (replay is real); dispatch is `requireAuth`-only; `salus-it500-dhw` is never emitted live; `replicas:1` holds (so C2's single-replica argument stands). No artefact flips writes or closes a Spencer-owned blocker.

## Findings to fold in at Build (none block the gate)

- **major — site-identity:** enrich the Zendesk site-name **lazily at the confirm step** rather than per-site across the whole inventory refresh (raised by Critical-Thinker and Integration).
- **Pin to the C5 pre-flip checklist:** `replicas:1` invariant; the `requireMinRole` dispatch gate must land before/with the OOHDASH-19 flip; env re-disable is a pod-roll (abort SLA = S6); add an ON→OFF "returned to safety-lock" signal.
- **Build-doer detail:** define one interrupt-precedence rule for the three tracker interrupts; decide whether every timeout guarantees a ticket for the durable note; specify client delivery of `midWaitPromptMs`; confirm the Zendesk option carries a human name; add S9 traceability.

## What this gate does NOT do

Closes no register row. Keeps `WRITES_DISABLED=true`. Does not commit/merge OOHDASH-67. Leaves B1–B3, R4 and R7 open and Spencer-owned. Does not flip anything. The OOHDASH-19 flip remains behind the C5 B0–B3-green checklist and release-preflight.
