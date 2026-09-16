<!-- gate:contract
whatYouApprove: The R1 Build test-results for the OOH Triage Dashboard live-control release. Approving confirms the eight buildable design-owned items were built, independently reviewed, merged to main, and are covered by a green test suite (115 unit + 41 end-to-end), and advances the release to Release-preflight. It authorises NO further code change and NO write-flip.
whatItDoes: Records what was built and the evidence: every build item's design test-obligation is met by a passing test; the full unit and e2e suites are green on merged main; and three real integration effects the per-item unit tests could not see were caught by running the full e2e suite and resolved (all correct behaviour, test-env/expectation fixes only). It states honestly what remains open.
whatItDoesNot: Closes NO register row. Does NOT flip writes — WRITES_DISABLED stays true; no test enables device control on a live site. Does NOT build or merge OOHDASH-67 (parked behind R4). Does NOT close C1 (a known-gap test documents the pod-restart hole as an expected limit), C2 (single-use proven at replicas:1; cross-replica deferred to C5), or the Spencer-owned externals B1 to B3, R4, R7, and B3 latency calibration. The OOHDASH-19 flip stays behind the C5 preflight checklist.
panel: To be run before this gate is presented — verdicts recorded here.
DECISION test-results-green: All eight buildable items are merged and green (115/115 unit, 41/41 e2e). Every design test-obligation is met; the full-suite run caught and resolved three integration effects. Recommend PASS to Release-preflight, honouring the open items (C1, C2 cross-replica, OOHDASH-67/R4, B2/B3/R7) and the write-lock invariant. No register row is closed.
-->

# Test-results — OOH Triage Dashboard (R1 Build)

**Stage:** Test-results. **Date:** 2026-09-16. **Repo:** main (bigtuff8/ooh-triage-dashboard), app v1.2.0. **Suites:** 115 unit tests (`npm run test:unit`, 14 files) and 41 end-to-end tests (`npx playwright test`, real server in fixture mode) — all green on merged main.

> **Standing invariants (held throughout).** WRITES_DISABLED stays true; no test enables device control on a live site (the e2e fixture server sets WRITES_DISABLED=false only to exercise the dispatch flow against fixture data, never a live pub). No register row is closed. B1 to B3, R4 and R7 remain OPEN and Spencer-owned. OOHDASH-67 is parked behind R4 — not built or merged.

## What was built (all merged to main, each independently reviewed SHIP)

1. **OOHDASH-12** fail-closed write default (PR #12). Proof: boundary matrix (unset/empty/"true"/exact-"false"/"False"/" false "/"0"/typo), boot [WRITE-LOCK] line, /healthz echo, no-Cosmos-read — `test/writesDisabled.test.js`.
2. **C2** confirm-token single-use (PR #13). Proof: replay=>409+one write, concurrency=>exactly one write, retry-after-success denied, wrong-owner/site denied without spending — `test/control-single-use.test.js`.
3. **OOHDASH-24** /healthz active read-probe + tri-state (PR #14). Proof: unexercised-configured=>amber never green, stale-green=>unhealthy after TTL (injected clock), healthy-within-TTL=>green, HTTP 200 invariant — `test/healthz-read-tristate.test.js`.
4. **B0/R0** recognisable site name at confirm (PR #15). Proof: eager enrichment lands the human name, search-by-name via the enriched record, dispatch audit uses the enriched name, non-fatal fallback, graceful brand/address degrade — `test/site-identity.test.js`. Pre-build verified against live Zendesk (house 6261 => "Wheatstone Inn (Gloucester)").
5. **OOHDASH-70 (C8/R10)** hot-water out-of-scope R1 default, presence-driven (PR #16). Proof: live combi reads monitored-not-controllable, no boost/compose reachable from live data, R7-flip via synthetic controllable device with no code change, capture-and-escalate logs a hot-water ticket — `test/hotwater-scope.test.js`.
6. **R11/C7** confirm-loop mid-wait prompt (PR #17). Proof: fires at the horizon, three choices route, early-settle suppression, no-stack-on-confirm-modal, config invariant, server-lifecycle-unchanged — `test/confirm-loop-timing.test.js`.
7. **C6/C1** late-sync alert (PR #18). Proof: durable actionable note + synced-late audit, lazy ticket (benign timeout creates nothing), distinct applied-late banner, and a C1 known-gap test asserting the pod-restart hole as an expected limit — `test/late-sync-alert.test.js`.
8. **R8/S10** control-is-live signal (PR #19). Proof: controlLive derived-not-hardcoded, controlLive === !healthz.writesDisabled (signals cannot diverge), OFF/ON banner + client-side block, OFF->ON ack once (never for already-live), flip-back returns to OFF — `test/control-live-signal.test.js`.

## Full-suite findings (caught by running e2e against the merged build — all resolved)

Running the whole e2e suite against merged main surfaced three real interactions that no single item's unit tests could see. All three are correct behaviour; the fixes were test-env/expectation only, no app code changed (PR #20):

- **Fail-closed vs fixture dispatch:** with WRITES_DISABLED now unset-means-disabled, the fixture dispatch e2e 423'd. Fixed by setting WRITES_DISABLED=false in the Playwright webServer env (the fixture suite exercises the dispatch flow against fixture data).
- **Mid-wait invariant vs compressed e2e timeout:** the default MID_WAIT_PROMPT_MS (30000) exceeded the e2e's compressed SYNC_TIMEOUT_MS (6000), failing config validation so the server would not start. Fixed by setting MID_WAIT_PROMPT_MS=3000 in the e2e env.
- **C2 single-use in a token-reusing test:** F009 reused one confirm token for three raw guardrail probes; single-use spends the token on admission (even a 422-rejected one), so attempts 2 and 3 got 409. Fixed by minting a fresh token per raw attempt — the guided UI never composes an invalid command, so this exercises the server guardrail directly; test intent (capability gating => 422) preserved.

These are exactly the class of integration effect the Test-results gate exists to catch. They validate that the fail-closed default, the mid-wait invariant and single-use are all actually in force.

## What remains open (NOT closed by this gate)

- **C1** — Cosmos persistence of in-flight actions is deferred; the pod-restart hole is documented by a known-gap test (asserts the limit, not a fix). C1 stays OPEN and is a C5 preflight decision.
- **C2** — proven single-use at replicas:1; cross-replica single-use deferred to C5.
- **OOHDASH-67** dispatch authz — specified but PARKED behind R4 (Spencer). Not built or merged.
- **B0/R0** brand + full address — deferred to B2 (Spencer). Name slice shipped.
- **R7** hot-water controllable decision (Spencer) — R1 default is out-of-scope; the tile flips on live presence if R7 lands.
- **B3** 90s decide-now horizon calibration (Spencer) — the horizon stays justified-provisional.
- **B1 to B3, R4** — the external flip blockers remain open and Spencer-owned.

## What this gate does NOT do

Closes no register row. Keeps WRITES_DISABLED true. Does not build/merge OOHDASH-67. Does not flip anything. The OOHDASH-19 flip remains behind the C5 B0-to-B3-green checklist and release-preflight.
