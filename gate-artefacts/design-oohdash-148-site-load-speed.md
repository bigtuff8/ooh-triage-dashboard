<!-- gate:contract
SECTION: What this design changes
Three server-only changes to the site-load path (Options A, B, C from the discovery gate), plus timing logs in the same PR. No client changes, no infrastructure, no new dependencies.

SECTION: Option A — parallelise workspacePayload
In routes/api.js, `workspacePayload` (line 195) awaits `ticketsForSite` and then `activeBoostHoldsForSite` sequentially. They are independent calls. Replace with `Promise.all` with per-call error isolation: ticketsForSite gets a `.catch(() => [])` inline (preserving the existing fail-soft behaviour), activeBoostHoldsForSite already returns null on failure. The two awaits collapse to one parallel await. The rest of workspacePayload is unchanged — `tickets` and `activeBoostHolds` bind to the same names so no downstream code changes.

SECTION: Option B — run ZD name enrichment concurrently with TB reads
In services/tb-device.js, `fetchLiveSitesByNumber` (line 1477) awaits `resolveSiteName(key)` sequentially AFTER `fetchTelemetry` resolves (line 1590). Since `resolveSiteName` only needs `key` (known at function entry), fire it alongside the TB text searches (line 1486). At the point where `humanName` is set (line 1590), replace the try/catch block with `await siteNamePromise` — the promise is already in flight. No semantic change to the result; the site name is still nil-safe.

SECTION: Option C — fix TB JWT token eviction in activeReadProbe
In services/tb-client.js, `activeReadProbe` (line 62) intentionally forces a fresh POST /api/auth/login to detect revoked credentials. The problem: it sets `token = null; expiry = 0` BEFORE the request, which evicts the valid cached token from the shared closure. Any concurrent site load request that calls `getToken()` while the probe is in flight finds `token = null` and fires a duplicate re-auth. Fix: remove the two eviction lines. The probe calls `axios.post` directly (bypassing `getToken`), and on success writes the new token back to the shared `token`/`expiry`. On failure it marks the probe failed without touching the shared token. Concurrent requests continue using the valid cached token during the probe flight.

SECTION: Timing logs
Add `Date.now()` diffs at four points in `fetchLiveSitesByNumber` (tb-search, tb-reads, zd-name, total) and two points in `workspacePayload` (zd-tickets, cosmos-boost, total). Log format: `[SITE] <siteNo> resolve: tb-search=Nms devices=N tb-reads=Nms zd-name=Nms total=Nms` and `[SITE] <siteNo> workspace: zd-tickets=Nms cosmos-boost=Nms total=Nms`. Only fires on cache miss (cold loads); warm-cache returns skip logging.

SECTION: Test impact
No unit tests directly test activeReadProbe, workspacePayload call order, or resolveSiteName concurrency. The Playwright e2e suite uses fixture mode for all data reads and never reaches the live TB/ZD paths. No test changes required. The timing log lines are new console.log output — no test asserts on console output so no test is broken.

SECTION: Risk assessment
Option A (parallel await): ticketsForSite and activeBoostHoldsForSite are independent; no ordering dependency. Option B (concurrent ZD name): resolveSiteName result is nil-safe; device enumeration unaffected. Option C (probe eviction fix): fresh POST /api/auth/login still runs on every health cycle; revoked-credential detection preserved. Concurrent requests that happen to use a revoked token during the probe flight will receive a 401 and clear `token = null` in the existing catch branch — same recovery path as before, one request later. Timing logs: read-only console output, no behavioural change.

DECISION: Approve design and proceed to build? | Approve — proceed to build | Changes requested
-->

# OOHDASH-148 Design — Site Load Speed

**Date:** 2026-10-27
**Status:** Design — awaiting gate approval
**Scope:** Server-only. No client changes, no infra, no new dependencies. Three code changes plus timing logs in one PR.

---

## Option A — Parallelise `workspacePayload` (`routes/api.js`)

`workspacePayload` (line 195) currently awaits `zendesk.ticketsForSite` and then, sixty lines later, awaits `overrides.activeBoostHoldsForSite`. These are independent: one is a Zendesk search, the other a Cosmos query. The sequential pattern means the workspace phase costs the sum of both round-trips.

The change: replace the two sequential `await` calls with a single `Promise.all`. `ticketsForSite` gets an inline `.catch` returning `[]` to preserve the existing fail-soft behaviour. `activeBoostHoldsForSite` already returns `null` on failure. The result destructures into the same `tickets` and `activeBoostHolds` names, so no downstream code in `workspacePayload` changes. Wall-clock cost drops from sum(ZD, Cosmos) to max(ZD, Cosmos).

The sixty lines of synchronous work currently between the two awaits (scope group filtering, `effectiveDevices` mapping, boost availability flags) move above the `Promise.all` — they don't depend on either call and can run first.

---

## Option B — Run ZD name enrichment concurrently with TB reads (`services/tb-device.js`)

In `fetchLiveSitesByNumber` (line 1477), `resolveSiteName(key)` is currently awaited sequentially at line 1590, after `fetchTelemetry` fully settles. `resolveSiteName` only needs `key`, which is known at function entry.

The change: at the top of `fetchLiveSitesByNumber` (after the cache check, before `siteQueryTokens`), fire `resolveSiteName(key)` with a `.catch` that logs and returns `null`, storing the result as `siteNamePromise`. Remove the existing try/catch block at lines 1587–1593 and replace it with `const humanName = await siteNamePromise`. The promise is already in flight by the time TB reads complete — in the common case it has resolved and the `await` returns immediately.

---

## Option C — Fix JWT token eviction in `activeReadProbe` (`services/tb-client.js`)

The `tbSession` closure (line 20) holds `token` and `expiry` in its scope. `getToken()` (line 30) returns the cached token when `token && Date.now() < expiry`, authenticating fresh only when it has expired. The 2-hour expiry is correct.

The problem is in `activeReadProbe` (line 62), which exists to force a live credential check on each health probe cycle. It currently sets `token = null` and `expiry = 0` before calling `getToken()`. This evicts the cached token from the shared closure. Any concurrent call to `request()` that runs while the probe is in flight calls `getToken()`, finds no token, and fires its own POST `/api/auth/login`. In production, with k8s calling `/healthz` every ~10 seconds, this explains the 50+ `[TB] Authenticated (read)` log events in 500 lines.

The fix: remove the eviction lines. `activeReadProbe` calls `axios.post` directly against `/api/auth/login` with the configured username and password, without going through `getToken()`. On success, it writes the new token and a fresh 2-hour expiry back to the shared closure and calls `markProbe(true)`. On failure, it calls `markProbe(false)` without touching the shared token.

This preserves revoked-credential detection — a fresh POST `/api/auth/login` still runs on every probe cycle — while keeping concurrent site load requests on the valid cached token during the ~100–200 ms probe flight.

---

## Timing logs

Four fields are captured in `fetchLiveSitesByNumber`:

- `tb-search` — duration of the TB textSearch + legacy bracket lookup (`Promise.all` that returns `matched`)
- `devices` — count of matched devices (useful for correlating read time with estate size)
- `tb-reads` — duration of `fetchTelemetry` (the per-device parallel reads)
- `zd-name` — duration from when `siteNamePromise` was fired to when it settled
- `total` — full function duration from entry to cache write

Two fields are captured in `workspacePayload`:

- `zd-tickets` — duration of `ticketsForSite`
- `cosmos-boost` — duration of `activeBoostHoldsForSite`
- `total` — full `workspacePayload` duration from entry to return

Log lines fire on cold loads (cache miss) only. A warm-cache load returns at line 1480 before any I/O and produces no log line.

---

## Risk

Option A: `ticketsForSite` and `activeBoostHoldsForSite` are independent reads with independent failure handling. No ordering risk.

Option B: `resolveSiteName` is already wrapped in a catch-returning-null. Starting it earlier cannot affect device enumeration or telemetry reads.

Option C: A request that happens to hold a revoked token during the probe flight will receive a 401 from ThingsBoard. The existing `catch` branch in `request()` already handles this — it sets `token = null` so the next call re-authenticates. The net effect is one request returns an error and retries, exactly the same as the pre-fix behaviour on a hard revocation.

No Playwright e2e tests touch the live TB or ZD paths. No unit tests assert on probe call order or workspace call sequencing. No test changes needed.

---

*Design by ooh-triage-dashboard-R1-mvp9hmit · 2026-10-27*
