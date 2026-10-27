# OOHDASH-148 Test Gate: site load speed improvements

<!-- gate:contract
SECTION: What was tested
Build PR #179 (commit 772045a on main), which delivers three server-only performance improvements and one new unit test file.

Option A (routes/api.js): ticketsForSite and activeBoostHoldsForSite now run in parallel via Promise.all instead of sequentially, reducing workspace payload time by the larger of the two calls rather than their sum.

Option B (services/tb-device.js): resolveSiteName is fired early as a promise immediately after the cache check, so the Zendesk name lookup runs in parallel with ThingsBoard text-search and all telemetry reads, rather than after them.

Option C (services/tb-client.js): activeReadProbe calls axios.post directly without clearing the cached token first, so concurrent requests keep using the valid JWT during probe flight. On success the token is refreshed; on failure only the probe state is marked false and the cached JWT is left untouched.

New test file (test/active-read-probe.test.js): two new unit tests cover the concurrent-probe behaviour and the failed-probe token-preservation invariant. A teardown restores Date.now.

No UI was changed. No new dependencies were added. All changes are server-only.

SECTION: Test results
Unit suite: 848 tests total, 847 pass, 0 fail, 1 skip. The skipped test is the existing U13 (needs a sibling repo, skipped in local runs). No regressions.

The three new active-read-probe tests all pass:
- "concurrent probe + getToken fires exactly ONE POST when token is cached"
- "failed activeReadProbe leaves cached token and expiry unchanged"
- "teardown — restore real Date.now"

End-to-end Playwright suite: 206 tests total, 204 pass, 0 fail, 2 skip. The 2 skipped are pre-existing conditional skips unrelated to this change. No regressions.

SECTION: UI evidence
No UI screenshot evidence is required. All three options are server-only changes to parallelism and probe logic. The product surface is identical to the pre-build baseline; only server timing is affected.

SECTION: Lineage
Discovery gate PR #163 merged 2026-10-27.
Design gate PR #177 merged 2026-10-27.
Build gate PR #179 merged 2026-10-27 (squash-merged, all CI green).
-->

## Test run summary

| Check | Result |
|---|---|
| Commit on main | 772045a (squash of build PR #179) |
| New test file | test/active-read-probe.test.js — confirmed present |
| Unit suite total | 848 tests, 847 pass, 0 fail, 1 skip |
| New probe test 1 | concurrent probe fires exactly ONE POST — PASS |
| New probe test 2 | failed probe leaves token and expiry unchanged — PASS |
| New probe test 3 | teardown restore Date.now — PASS |
| e2e Playwright suite | 206 tests, 204 pass, 0 fail, 2 skip |
| UI changes | None — server-only build, no screenshots required |

## Lineage

| Gate | PR | Merged |
|---|---|---|
| Discovery | #163 | 2026-10-27 |
| Design | #177 | 2026-10-27 |
| Build | #179 | 2026-10-27 |
