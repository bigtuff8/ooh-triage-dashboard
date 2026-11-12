<!-- gate:contract
TICKET: OOHDASH-164
PHASE: test
STEP: committee

SECTION: What this gate covers
Stage 0 of OOHDASH-164 (commit 520598a, v1.7.4). Stage 0 adds browser timing measurement only: six performance marks, a navigator.sendBeacon POST to /api/ux-timing, Server-Timing headers on three routes, and a read-only log-parser script. No user-facing flows, wording, or screen states change in Stage 0.

SECTION: Screen-text diff (design section 6)
Design section 6 lists new and changed wording for Stage 1 and Stage 2: the Confirm Checking state, the Data unavailable tag, the grey notice, the unreadable-thermostat flow line, and the ticket note. None of these appear in Stage 0. Stage 0 adds no visible text, no new screen states, and no UI state changes. The screen-text diff is empty. No golden wording test is required at this gate; the golden tests covering Stage 1 wording will be written and verified as fail-on-old-code before the Stage 1 test gate.

SECTION: Unit tests
918 pass, 0 fail, 1 skipped (Node test runner). CI unit tests check also passed on PR #201 (Actions run 43209380408).

SECTION: Playwright e2e (fixture mode)
Playwright suite run against the merged main (520598a) in fixture mode, DATA_MODE=fixture. Results below. The suite never reaches the new /api/ux-timing route or the performance marks (fixture mode uses pre-recorded responses). It exercises every existing screen state, flow, and control path. Any regression introduced by the Stage 0 changes to app.js, views.js, or routes/api.js would surface here.

SECTION: What comes next
If this gate is approved: the release gate opens for James's go on v1.7.4. Release runs npm run release from clean main (520598a). James then collects 20 or more real lookups from kubectl logs, runs the ux-timing-report.mjs script, and records the p50/p95 figures as the Stage 0 baseline. Stage 1 build begins only after proofs a and b both pass and James gives the go.

SECTION: Invariants held
No production changes. No kubectl writes. No deploy. The write path, F004 and all control guards are unchanged. Stage 0 is measurement only.

DECISION: Approve Stage 0 test gate and proceed to release gate? | A: Approve — Playwright suite passes, proceed to release (recommended) | B: Changes requested
-->

# Test gate: OOHDASH-164 Stage 0

Project ooh-triage-dashboard, main at 520598a (build gate #201 merged 2026-11-12). Follows build gate PR #201. Stage 0 adds timing instrumentation only — no user-visible changes.

## Screen-text diff

Design section 6 wording is for Stage 1 and Stage 2 only. Stage 0 adds no new screen states or wording. Diff is empty. Golden wording tests will be written (and verified to fail on pre-Stage-1 code) before the Stage 1 test gate.

## Unit tests

918 pass / 919 total / 0 fail. CI check passed on PR #201 (Actions run 43209380408).

## Playwright e2e (fixture mode)

| Suite | Pass | Fail | Skip |
|---|---|---|---|
| Playwright (DATA_MODE=fixture) | 181 | 0 | 2 |

Exit code 0. All existing flows pass. Stage 0 changes (app.js, views.js, routes/api.js) introduce no regressions. The 2 skips are pre-existing (same count as before Stage 0).

## Invariants

Write path unchanged. F004 unchanged. No production changes. Measurement only.
