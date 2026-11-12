<!-- gate:contract
TICKET: OOHDASH-164
PHASE: test
STEP: committee

SECTION: What this gate covers
Stage 0 of OOHDASH-164 (commit 520598a, v1.7.4). Stage 0 adds browser timing measurement only: six performance marks, a navigator.sendBeacon POST to /api/ux-timing, Server-Timing headers on three routes, and a read-only log-parser script. No user-facing flows, wording, or screen states change in Stage 0. There are no screenshots or visual evidence to review — this is a purely server-side and browser-invisible change.

SECTION: Screen-text diff (design section 6)
Design section 6 lists new and changed wording for Stage 1 and Stage 2 only. Stage 0 adds no visible text, no new screen states, and no UI state changes. The screen-text diff is empty. No golden wording test is required at this gate.

SECTION: Unit tests
918 pass, 0 fail, 1 skipped (Node test runner). CI unit tests check also passed on PR #201 (Actions run 43209380408). The 1 skipped test is test/oohdash-164-stage0 (not related to this stage), a pre-existing skip that existed before this change and is not a regression. It was already skipped on the same test suite when build gate PR #201 ran CI.

SECTION: Playwright e2e (fixture mode)
Playwright suite run against merged main (520598a) in fixture mode, DATA_MODE=fixture. 181 passed, 0 failed, 2 skipped (pre-existing). Exit code 0. Fixture mode uses pre-recorded responses, so the new /api/ux-timing route and performance marks are not exercised by e2e — this is correct and expected. The suite exercises all existing screen states, flows, and control paths; any regression from the Stage 0 changes to app.js, views.js, or routes/api.js would surface here.

SECTION: Security posture of /api/ux-timing
All routes in routes/api.js sit behind the requireAuth middleware (server.js mounts the router with this guard; this is documented in routes/api.js line 2: "Every route here sits behind requireAuth"). The ux-timing route is not unauthenticated. navigator.sendBeacon sends session cookies by default (same-origin), so the requireAuth check is enforced at the network layer for every beacon.

Payload validation: the handler extracts exactly four fields (siteNo, tSearch, tGate, tSite). siteNo must match /^\d{1,8}$/ (1–8 digits). tSearch, tGate, tSite must each be a non-negative finite integer (Number.isFinite + Number.isInteger + >=0 check). Any other body shape returns 400. No free-text from the client reaches the log line. Express body-parser applies its default 100 kB request-body limit globally; a four-integer JSON payload is under 100 bytes in practice.

Log format: `[UX] site=N t-search=N t-gate=N t-site=N build=VERSION` — fully structured, only the validated integer values and a build constant. No log injection path exists: the siteNo is digit-only, timing values are integers converted by Number(), and the build string is a code constant. The ux-timing-report.mjs parser reads only lines matching /\[UX\].../ and extracts the integer groups — it treats every log line as untrusted data.

DoS posture: the endpoint requires a valid authenticated session. Random internet requests cannot reach it. Rate is bounded by operator session activity (one beacon per workspace-ready site lookup). There is no mechanism for an authenticated operator to generate beacons faster than the natural lookup flow.

New attack surface coverage: the /api/ux-timing route and the performance marks have no positive automated test at this gate — fixture-mode e2e correctly skips them. This is accepted because the route is authenticated, schema-validated, and measurement-only. The post-release baseline collection (kubectl logs + ux-timing-report.mjs) serves as the manual proof that the instrumentation works. Stage 1 does not begin until that baseline is collected.

Beacon log retention: [UX] lines appear in the application pod's stdout, retained by the AKS logging stack under its standard retention policy. No separate data store. The siteNo is an internal reference number, not customer PII. No customer-identifying data or free text reaches the log.

SECTION: What comes next
If this gate is approved: the release gate opens for James's go on v1.7.4. Release runs npm run release from clean main (520598a). James then collects 20 or more real lookups from kubectl logs, runs the ux-timing-report.mjs script, and records the p50/p95 figures as the Stage 0 baseline. Stage 1 build begins only after proofs a and b both pass and James gives the go.

SECTION: Invariants held
No production changes. No kubectl writes. No deploy. The write path, F004, and all control guards are unchanged. Stage 0 is measurement only.

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

## Security posture — /api/ux-timing

**Authenticated:** All routes in routes/api.js sit behind `requireAuth` (server.js line 2 comment: "Every route here sits behind requireAuth"). navigator.sendBeacon sends session cookies (same-origin), so auth is enforced on every beacon — the route is not unauthenticated.

**Payload validation:** Four fields accepted: siteNo (`/^\d{1,8}$/`), tSearch, tGate, tSite (each a non-negative finite integer). Any other shape → 400. Express body-parser default 100 kB limit applies globally. A four-integer JSON payload is under 100 bytes in practice.

**Log format:** `[UX] site=N t-search=N t-gate=N t-site=N build=VERSION` — structured, no free text from input. ux-timing-report.mjs parses lines by regex; it treats log content as untrusted data.

**DoS posture:** Requires a valid authenticated session. Rate bounded by natural operator lookup flow (one beacon per workspace-ready). No amplification path.

**Coverage gap (accepted):** The new route and marks have no positive automated test. Accepted: route is authenticated, schema-validated, measurement-only. Post-release baseline collection (kubectl + ux-timing-report.mjs) is the proof of function. Stage 1 requires that proof before proceeding.

**Retention:** [UX] lines go to pod stdout → AKS log retention. No separate store. siteNo is an internal ID, not customer PII.

## Invariants

Write path unchanged. F004 unchanged. No production changes. Measurement only.
