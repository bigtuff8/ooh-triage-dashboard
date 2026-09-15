<!-- gate:contract
whatYouApprove: The completed R1 Design stage for the OOH Triage Dashboard live-control release — nine design artefacts (two pre-existing, seven authored this cycle) covering every design-owned row of the conditions register. Approving advances the set to Build-PLAN; it does NOT authorise any code change or the write-flip.
whatItDoes: Locks the design approach for each item — site identity at confirm (B0/R0/C9), fail-closed write default (OOHDASH-12/S4/C5), confirm-token single-use (C2), control-is-live signal (R8/S10), confirm-loop timing (R11/C7), late-sync alert (C6/C1), hot-water scope routing (C8/R10), dispatch authz (OOHDASH-67), and /healthz stale-green (OOHDASH-24). Each cites code to file and line, and references the register by ID.
whatItDoesNot: Closes NO register row. Does NOT enable device control — WRITES_DISABLED stays true. Does NOT commit or merge OOHDASH-67 (hard-gated on R4). Does NOT close the external blockers B1 to B3, R4, or the R7 hot-water product decision — all remain open and Spencer-owned. Does NOT flip anything; the OOHDASH-19 flip remains behind the C5 B0-to-B3-green checklist and release-preflight.
panel: Independent multi-lens panel run 2026-09-15. Hard-blocking lenses Compliance, Critical-Thinker, Security and Technical all returned SHIP. Advisory lenses Customer-Experience, Integration, Product and Transition all returned SHIP. Zero blocker-severity findings; every load-bearing code claim was verified firsthand against the branch. Remaining findings are build-time refinements, not gate-stoppers.
DECISION design-stage-complete: The Design stage is complete and internally consistent. The panel passed eight of eight. Recommend PASS to Build-PLAN, folding the listed findings into the artefacts at build. No register row is closed by this gate.
-->

# Design Gate — OOH Triage Dashboard (R1)

**Stage:** Design. **Date:** 2026-09-15. **Branch:** design/split-lean-24. **Decision:** HARD operator gate (James).

## What you are approving

The completed Design stage: nine design artefacts under docs/project/releases that together cover every design-owned item in the conditions register. Approving advances the set to **Build-PLAN**. It authorises **no code change** and **no write-flip**.

## The design set

Each item below is one lean artefact; the decision it locks is summarised in plain English.

- **Site identity at confirm** (B0/R0, C9) — surface a recognisable site *name* at the confirm step now, via the existing Zendesk lookup; brand and address are deferred to blocker B2. This fixes the tester's "just shows gk-6261" failures on tests 1 to 3.
- **Fail-open write default** (OOHDASH-12, S4/C5) — invert the deploy-time write lock to *fail-closed*: writes are ON only when the flag is explicitly the exact value "false"; unset, misspelled, or any other value means disabled. The environment-config audit (S4) is merge-blocking.
- **Confirm-token single-use** (C2) — make the confirm token atomically consumed before any device write, so a retry or double-click cannot fire twice. Honestly **not closed** here: it states the replay and concurrency proof obligation and the single-replica caveat.
- **Control-is-live signal** (R8/S10) — a persistent "control is LIVE" banner plus a one-time go-live acknowledgement, driven by the true lock flag. The human-comms plan (S11) stays with James.
- **Confirm-loop timing** (R11/C7) — keep the 90-second decide-now horizon as justified-provisional pending the B3 latency bench-prove, and add a roughly 30-second mid-wait prompt (keep caller on hold, escalate, or stop waiting) instead of a silent spinner.
- **Late-sync alert** (C6/C1) — a durable Zendesk ticket note for the cross-shift signal plus an ephemeral in-session banner. The in-memory-watch restart hole (C1) is confronted head-on; the durable Cosmos-persistence fix is deferred as a named proof obligation.
- **Hot-water scope routing** (C8/R10) — hot water is out of scope by design, front-loaded to capture-and-escalate before compose; the scope tile is driven by live device presence, so the R7 product decision stays open.
- **Dispatch authz** (OOHDASH-67) — a rank-aware role gate. **Hard-gated on R4**: not committed or merged until R4 clears.
- **/healthz stale-green** (OOHDASH-24) — an active read-probe with a tri-state so a dead read credential can no longer latch green.

## Panel result — eight of eight SHIP

- Hard-blocking lenses (any one can block): **Compliance — SHIP; Critical-Thinker — SHIP; Security — SHIP; Technical — SHIP.**
- Advisory lenses: **Customer-Experience — SHIP; Integration — SHIP; Product — SHIP; Transition — SHIP.**

The panel independently confirmed the highest-stakes claims against the code: the write lock is genuinely fail-open today; the confirm token is a non-consuming pure read, so replay is real; dispatch is authenticated-only with no role gate; the hot-water device id is never emitted by live data; and the single-replica deployment holds, so the confirm-token atomicity argument stands. No artefact flips writes or closes a Spencer-owned blocker.

## Findings to fold in at Build (none block the gate)

- **Major, site-identity:** enrich the Zendesk site name *lazily at the confirm step* rather than per-site across the whole inventory refresh (raised by both Critical-Thinker and Integration).
- **Pin to the C5 pre-flip checklist:** the single-replica invariant; the requirement that the role-gate lands before or with the OOHDASH-19 flip; that an environment re-disable is a pod-roll (so the abort SLA equals pod-roll time, S6); and an ON-to-OFF "returned to safety-lock" signal to mirror go-live.
- **Build-doer detail:** one interrupt-precedence rule for the three tracker interrupts; a decision on whether every timeout guarantees a ticket for the durable note; a concrete client-delivery path for the mid-wait-prompt timing; confirmation the Zendesk option carries a human name; and an S9 traceability line.

## What this gate does NOT do

It closes no register row. It keeps the write lock engaged. It does not commit or merge the dispatch-authz design. It leaves blockers B1 to B3, R4 and the R7 product decision open and Spencer-owned. It does not flip anything. The OOHDASH-19 flip remains behind the C5 green-checklist and release-preflight.
