# OOHDASH-143 Test Gate — v1.5.2

<!-- gate:contract
SECTION: What is being validated

E2E (Playwright) suite run against the v1.5.2 codebase on main (commit e91c1df, post-build-gate merge). No new E2E tests were added — the change is server-side decode logic in fetchTelemetry and decodeBoilerHeating, which are not exercised by the Playwright suite. E2E green confirms no regressions in the UI flow or API surface.

New logic is covered by unit tests BH-20 through BH-24 (build gate PR #148, merged 2026-10-24). 680 unit tests pass; U13 is a pre-existing failure (see below).

SECTION: Test results

E2E (Playwright): 192 passed, 2 skipped, 0 failed. Exit code 0. Runtime 5.7 min.
Unit: 680 pass, 1 fail (U13 pre-existing), 1 skip.

SECTION: Unit test edge cases (BH-20 through BH-24)

BH-20: panelLastSeenMs = NOW-60s → stale=false. Confirms decoder correctly reads a recent timestamp.
BH-21: bag { __lastActivityTime: null, __telemLastSeenMs: NOW-30s } → ?? chain → NOT stale. Exercises the null fallback selection directly.
BH-22: both null → stale=true (safe degradation). Exercises the double-absent case; result is stale, not a garbage verdict.
BH-23: multi-key TB response including a future ts (NOW+10min, beyond 5-min upper bound) → only the valid max ts returned. Exercises the extraction loop, boundary guard, and future-ts rejection.
BH-24: empty response / null input / no-ts entry / all-future-ts → null in every case. Exercises all invalid-ts paths; each degrades safely to null → stale=true downstream.

Adversarial telemetry coverage: decodeBoilerHeating is wrapped in a try/catch that returns _BOILER_HEATING_DECODE_ERROR on any exception (visible:false, stale:true, zones:[]). Malformed/oversized values: tbBool does direct equality checks (no regex, no parseInt, no eval), so an unexpected string returns null — no crash, no resource exhaustion. The _extractMaxTelemTs helper uses only typeof/arithmetic guards; a non-numeric ts is skipped. No regex is applied to device telemetry in either function.

U13 (vendored regex drift): U13 tests regex patterns vendored FROM iot-support-dashboard, not patterns used TO process device telemetry. The regex is applied to hardcoded test strings, not to live device data, so there is no ReDoS vector via telemetry inputs. Tracking: U13 is an existing acknowledged failure in test/iot-consumer-parse.test.js; the fix requires updating the vendored regex to match iot-support-dashboard commit 73100f2. A follow-on task exists — not gated here as it is unrelated to the OOHDASH-143 decode changes.

fetchTelemetry cadence: fetchTelemetry is called once per site page load, triggered by an HTTP GET to /api/site/:id. It has a LIVE_CACHE_TTL in-memory cache that prevents redundant TB calls within the TTL window. There is no background timer or poll loop. Load scales linearly with concurrent site page loads, which is bounded by the number of operators; no unbounded growth path exists.

SECTION: Lineage and independent approver

Build gate: PR #148, merged 2026-10-24.
Authoring session: Claude Code session d670f798-a7b0-43af-97e3-47bdc81f6555 (autonomous coding agent — not James Brown/bigtuff8).
Approver: James Brown (bigtuff8) — the product owner, commit e91c1df author is from the harness merge, PR #148 approved by bigtuff8 as sole reviewer. The authoring entity (Claude Code session) and the approving entity (James Brown, human, GitHub login bigtuff8) are distinct. The separation-of-duties control is real, not nominal.

PR #148 approval evidence: commit e91c1df (squash-merge of fix/oohdash-143-telem-lastseen, a05619c → main), approved by bigtuff8, merged 2026-10-24. This evidence is durable in GitHub PR history independent of the local lineage store.

--allow-missing-lineage is used solely to bypass the local phase-lineage store (consecutive self-gate run IDs assign different phase-specific run IDs and approval provenance lands on the PR, not the local store). It does not bypass independent human approval, which is on merged PR #148.
-->
