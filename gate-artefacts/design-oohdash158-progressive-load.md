<!-- gate:contract
TICKET: OOHDASH-158
PHASE: design

SECTION: What this design changes
Option 2 (progressive workspace): a coordinated server + client change that makes the confirm gate appear at ~100ms and the workspace appear immediately after clicking Confirm, with scope tiles in a loading state until the background telemetry read settles (~5–15 seconds). Two server phases and three client-side changes. No new infrastructure, no new dependencies, no new background processes.

SECTION: Phase 1a — Slim resolve (services/tb-device.js)
fetchLiveSitesByNumber (line 1477) is split into a fast phase and a background phase. After the TB textSearch settles (~80–100ms), the function immediately computes preliminary device stubs — name, kind via classifyDevice(name, profile, {}), zone from the TB label field — and stores the full-read Promise in a new module-level Map called inFlightReads, keyed by siteNo. It then returns the preliminary site object to /resolve. The background Promise continues fetchTelemetry(matched) and, on settlement, writes the full result to perSiteCache and deletes the entry from inFlightReads. When /confirm calls getSitesByNumber for the same site: if inFlightReads has an entry, await it; if perSiteCache is warm (telemetry already done), return it directly. The preliminary deviceSummary string ("On Lighthouse: 3 heating zones") is computed from name-classified kinds only — no telemetry required — so /resolve responds with the same field shape as today at ~100ms instead of ~15s.

SECTION: Phase 1b — Progressive workspace (routes/api.js + public/js/views.js)
Server: workspacePayload gains a devicesReady boolean parameter. The /confirm route calls fetchLiveSitesByNumber, checks whether the result came from preliminary stubs (inFlightReads hit) or full cache (perSiteCache hit), and passes devicesReady accordingly. If devicesReady is false, /confirm returns immediately with a partial workspace (scope tiles cannot be evaluated without telemetry, so scope is omitted or returned as a loading placeholder). The /workspace route also returns devicesReady in its response. Client: scheduleWorkspaceRefresh (views.js line 144) starts at a 2-second interval when the /confirm response has devicesReady: false; it drops to the existing 30-second interval when /workspace returns devicesReady: true. Scope tiles are rendered in a "loading" state (greyed, pulsing, pointer-events:none) when devicesReady is false. A flow entry guard blocks opening any triage flow (heating/kitchen/DHW/connectivity) until devicesReady: true, showing "Loading device data — available in a moment" if the handler tries early.

SECTION: Prototype
The hi-fi interactive prototype is at: https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash158-progressive-prototype.html
It shows the Before (legacy 15s spinner) and After (progressive load) scenarios side by side as a click-through simulation. The reviewer can press Play for either scenario and watch the timing difference. After scenario shows: 0.5s spinner → confirm gate → immediate workspace with loading tiles → tiles unlock after ~5s. Before scenario shows: 15s spinner → confirm gate → 8s wait → workspace all at once.

SECTION: Test plan
One existing Playwright e2e test covers the confirm gate render (confirmSite anchor in the e2e suite). That test needs to remain passing — the confirm gate HTML shape is unchanged; only the timing of /resolve changes. New coverage required: (1) mock /resolve to return devicesReady:false and verify scope tiles render with loading state and are not interactive; (2) mock a subsequent /workspace response with devicesReady:true and verify tiles become interactive and the polling interval drops to 30s; (3) verify that clicking a category tile while devicesReady:false shows the "Loading device data" guard message rather than opening a flow. Fixture-mode tests use DATA_MODE=fixture so the live TB path is never reached; the new devicesReady flag should be present in the fixture /confirm response (add devicesReady:true to the fixture payload so existing tests continue passing with full tile interactivity, and add a new fixture variant for devicesReady:false to cover the loading state).

SECTION: Rollback
Server: revert fetchLiveSitesByNumber to the current synchronous shape (remove the inFlightReads Map and the early return). Revert workspacePayload to not accept devicesReady. Revert /confirm and /workspace to not include devicesReady in their responses. Client: revert scheduleWorkspaceRefresh to the fixed 30s interval. Revert scope tile rendering to not check devicesReady. Remove the flow entry guard. No database changes, no config changes, no infrastructure changes. Rollback is a clean revert of this PR, identical in risk profile to the OOHDASH-148 rollback.

SECTION: Cost and token evaluation
Zero recurring token cost. Zero recurring £/$ cost. The inFlightReads Map holds one Promise per open site for the duration of the background telemetry read (≤30s). It is idle and empty between calls — it does not poll, tick, or consume tokens. The 2-second client poll during progressive load is a short-lived burst: at most 7–8 requests per site open (across ~15s until devicesReady:true), then the existing 30s interval resumes. This is well within the current operational envelope. No new service, daemon, or scheduled job is introduced. No unbounded-scaling cost path.

SECTION: Silent-running evaluation
No new background process, daemon, watcher, or scheduled task on the server. The inFlightReads Map is an in-process, in-memory side-effect of an existing request handler — it runs only when a /resolve request fires it and completes when the TB reads settle. It produces no console output, no persistent state, and no idle resource consumption. The 2-second client poll is browser-side and stops as soon as devicesReady:true arrives. Fully compliant with the silent-background-running criterion.

DECISION: Approve design and proceed to build? | Approve — proceed to build | Changes requested
-->

# OOHDASH-158 Design — Progressive Site Load

**Date:** 2026-10-29
**Status:** Design — awaiting gate approval
**Scope:** Server + client. Two server changes (`services/tb-device.js`, `routes/api.js`) and three client changes (`public/js/views.js` scope tile rendering, poll interval, flow entry guard). No new infrastructure, no new dependencies.

---

## The problem

Live pod logs show a 34-device site costs ~15.3 seconds from search click to confirm gate:

```
[SITE] 6819 resolve: tb-search=80ms devices=34 tb-reads=15255ms zd-name=0ms total=15337ms
```

The handler sees "Looking up site…" for the full 15 seconds before they can read the site name back to the caller. The slow path is `/resolve`, which runs the full ThingsBoard per-device telemetry read before responding. The design here moves that read off the critical path.

---

## Design decision: Option 2 (progressive workspace)

James chose Option 2 from the discovery gate. This design specifies both phases as a single PR.

---

## Phase 1a — Slim `/resolve` (`services/tb-device.js`)

### What the split looks like

`fetchLiveSitesByNumber` (line 1477) currently runs: cache check → TB textSearch → `fetchTelemetry` → await Zendesk name → cache write → return. The full `fetchTelemetry` call (~15s) blocks the response.

**New shape:**

```
fetchLiveSitesByNumber(siteNo):
  1. Cache check → if warm, return perSiteCache (unchanged)
  2. Fire siteNamePromise (unchanged — already concurrent with OOHDASH-148)
  3. TB textSearch → matched device stubs (unchanged, ~80–100ms)
  4. Compute preliminary stubs:
       kind via classifyDevice(name, profile, {})    ← no telemetry
       zone from TB label field                       ← already available
       preliminary deviceSummary from kind counts     ← no telemetry
  5. Store background Promise in inFlightReads:
       inFlightReads.set(key, (async () => {
           const full = await fetchTelemetry(matched) + Tuya read + siteNamePromise;
           perSiteCache.set(key, { sites: fullResult, at: Date.now() });
           inFlightReads.delete(key);
       })())
  6. Return preliminary site object immediately ← THIS is what /resolve gets
```

### inFlightReads coordination

New module-level `Map` in `services/tb-device.js`:

```js
const inFlightReads = new Map(); // siteNo → Promise<void>
```

When `/confirm` calls `getSitesByNumber(siteNo)`:
- If `perSiteCache` is warm: return it (unchanged — agent waited ≥ a few seconds before clicking Confirm)
- If `inFlightReads` has an entry: `await inFlightReads.get(key)`, then return `perSiteCache.get(key).sites`
- If neither: run the full path as before (cold miss — no prior `/resolve` call)

### Preliminary deviceSummary

`classifyDevice(name, profile, {})` with empty telemetry gives `kind` (heating / hotwater / kitchen / lighting / fan / gateway / unknown). The preliminary summary is built from kind counts the same way as the current `deviceSummary()` function in `routes/api.js`. No behavioural change to what the confirm gate shows; the string format is identical.

### Error handling

If the background `fetchTelemetry` throws (TB unreachable), the background Promise rejects. The `inFlightReads` entry is deleted in a `finally` block. When `/confirm` awaits a rejected Promise, it re-throws — the existing error-handling in `wrap()` returns a 503, same as today. No silent failure.

---

## Phase 1b — Progressive workspace (`routes/api.js` + `public/js/views.js`)

### Server: `devicesReady` flag

**`/confirm` route (`routes/api.js` line 119):**

```js
router.post('/sites/:siteNo/confirm', wrap(async (req, res) => {
    const siteNo = req.params.siteNo;
    const { token, site } = await resolution.confirmSite(siteNo, req.session.operator);
    const devicesReady = !inFlightReads.has(String(siteNo));  // ← new
    res.json({ confirmToken: token, workspace: await workspacePayload(site, devicesReady) });
}));
```

**`workspacePayload` (`routes/api.js` line 195):** accepts a `devicesReady` boolean. Adds it to the returned workspace object. When `devicesReady` is `false`, the `scope` array is returned as an empty array (the client renders loading tiles; scope cannot be evaluated without telemetry). All other workspace fields (`site`, `anyOffline`, `degraded`, `tickets`, `activeP1Tickets`, `boostAvailable`, `activeBoostHolds`) are included as normal since they come from Zendesk and Cosmos, not TB telemetry.

**`/workspace` route (`routes/api.js` line 124):** adds `devicesReady` to response:

```js
res.json({ workspace: await workspacePayload(sites[0], !inFlightReads.has(String(req.params.siteNo))) });
```

### Client: poll interval (`public/js/views.js` line 144)

`scheduleWorkspaceRefresh` is parameterised:

```js
function scheduleWorkspaceRefresh(fastPoll) {
    clearInterval(wsRefreshTimer);
    const interval = fastPoll ? 2000 : 30000;
    wsRefreshTimer = setInterval(async () => {
        if (state.view !== 'site' || !state.confirmToken || state.flow || window.ctl) return;
        try {
            const { workspace } = await api.get(`/api/sites/${encodeURIComponent(state.siteNo)}/workspace?confirmToken=${state.confirmToken}`);
            state.workspace = workspace;
            if (workspace.devicesReady && fastPoll) {
                scheduleWorkspaceRefresh(false);  // drop to 30s
            }
            if (state.view === 'site') render();
        } catch { /* keep last reads */ }
    }, interval);
}
```

`confirmSite()` calls `scheduleWorkspaceRefresh(!workspace.devicesReady)`.

### Client: loading scope tiles

`renderWorkspace()` checks `state.workspace.devicesReady`:

- `devicesReady: false` → scope tiles render with class `tile-loading` (pointer-events: none, opacity: 0.55, animation: pulse). The issue input is disabled. A notice line reads: "Loading device data — available in a moment". The scope list in the right column shows "Checking…" tags.
- `devicesReady: true` → tiles render normally (unchanged current behaviour).

No changes to tile HTML structure — only CSS classes toggled.

### Client: flow entry guard

`startTileFlow()` and `startFlow()` gain an early-return guard:

```js
if (!state.workspace?.devicesReady) {
    toast('Loading device data — available in a moment');
    return;
}
```

This protects against a handler who clicks a tile in the instant before the loading class is applied (race condition between render and click).

---

## Prototype

The hi-fi interactive prototype is live:

https://home-desktop-jb-new.tail30d2e6.ts.net/review/oohdash158-progressive-prototype.html

It runs on the real app CSS and HTML structure captured from the fixture-mode app. The reviewer can select Before (legacy) or After (progressive) and press Play to watch the simulation. Key moments shown: the 15s vs 0.5s spinner at /resolve; the confirm gate appearing immediately in the After path; the workspace with pulsing loading tiles; and the tiles unlocking when devicesReady flips to true.

---

## Test plan

### Playwright e2e tests to update

| Test | Change required |
|---|---|
| Confirm gate render | Add `devicesReady: true` to fixture `/confirm` response — gate HTML unchanged, test passes |
| Workspace render (category tiles) | Fixture response must include `devicesReady: true` — tiles must be interactive |
| New: loading state | Add fixture variant with `devicesReady: false`; assert tiles have loading class; assert issue input is disabled |
| New: tiles unlock on poll | Simulate `/workspace` returning `devicesReady: true`; assert tiles become interactive and poll interval resets to 30s |
| New: flow entry guard | With `devicesReady: false`, click a tile; assert toast appears; assert no flow renders |

### Unit tests

No new unit tests required for Phase 1a server logic — the `inFlightReads` coordination is covered by the integration path (fixture mode returns synchronously, so `inFlightReads` never holds a pending entry in fixture mode). A manual smoke test on a live pod will verify the timing improvement via the existing `[SITE] resolve:` log lines.

---

## Rollback

One revert of the build PR restores all three layers (tb-device.js, api.js, views.js) to the current behaviour. No database migrations, no config changes, no infrastructure changes. Rollback risk profile is identical to OOHDASH-148.

---

## Cost and token evaluation

Zero recurring token cost. Zero recurring £/$ cost. The `inFlightReads` Map is ephemeral — one Promise per open site for ≤30 seconds. The 2s poll during progressive load adds at most 7–8 extra `/workspace` calls per site open, then reverts to 30s. No new background process, no new service, no idle overhead. Fully compliant with the mandatory cost criterion.

## Silent-running evaluation

No new daemon, watcher, or scheduled task. The `inFlightReads` Map runs inside an existing request handler, completes when TB reads settle, and is empty at idle. The 2s poll is browser-side and terminates within one call after `devicesReady: true`. Fully compliant with the silent-background-running criterion.

---

## CX criteria realised

| Discovery criterion | How the design delivers it |
|---|---|
| Confirm gate at ~100ms (persona: handler can start talking while TB reads) | Phase 1a: /resolve returns after textSearch only; handler sees site name in under a second |
| Workspace visible before telemetry settles | Phase 1b: /confirm returns workspace immediately; loading tiles make the partial state legible |
| Reassurance moment: scope loading is honest, not silent | Loading tiles with pulse animation + "Loading device data" notice; not a blank screen or a frozen spinner |
| No flow entry before device data is ready | Flow entry guard blocks premature flow with a toast; no silent wrong-data entry |
| No new idle overhead | inFlightReads Map is zero-cost at idle; passes cost + silent-running criteria |

---

*Design by ooh-triage-dashboard-R1 · OOHDASH-158 · 2026-10-29*


---

## Rework addendum — round 1 (design/draft)

### Panel verdicts addressed

**critical-thinker — readiness signal conflates done/succeeded/never-started**

The panel is correct. `devicesReady = !inFlightReads.has(key)` is wrong because a rejected background read deletes its own entry in `finally`, leaving the Map empty while `perSiteCache` is never written. The `/workspace` poll then returns `devicesReady: true` against an absent cache entry, unlocking scope tiles with no device data behind them.

**Corrected readiness signal — replaces all instances in the design above:**

```js
// /confirm (routes/api.js line ~119):
const devicesReady = perSiteCache.has(String(siteNo));

// /workspace (routes/api.js line ~124):
const devicesReady = perSiteCache.has(String(req.params.siteNo));
```

`perSiteCache` is only written on a successful `fetchTelemetry` settlement. A failed or timed-out read never writes the cache, so `devicesReady` stays `false` and the client continues polling until either the cache warms or the client reaches its give-up threshold (see Issue 3 below). This closes the false-ready path entirely.

---

**critical-thinker — `classifyDevice(name, profile, {})` kind-equivalence is unverified**

The design asserted, without verification, that calling `classifyDevice` with empty telemetry returns the same `kind` as calling it with full telemetry. If any code path in `classifyDevice` branches on a telemetry field to resolve ambiguous device kinds, the preliminary `deviceSummary` shown on the confirm gate will differ from the settled count the workspace eventually renders. The handler reads one count, watches it silently change, and cannot trust either.

**Design position — Build must verify before implementing the preliminary summary:**

Build must inspect `classifyDevice()` and establish whether any branch condition reads from the telemetry argument. Two outcomes:

| Finding | Design response |
|---|---|
| Telemetry does NOT influence `kind` | Preliminary `deviceSummary` string is safe to show. Confirm gate shows e.g. "On Lighthouse: 3 heating zones" as designed. |
| Telemetry DOES influence `kind` for any device type present on this installation | Preliminary `deviceSummary` must be suppressed. Confirm gate shows "Checking devices…" in its place. The settled workspace renders the real summary after `devicesReady: true`. The confirm gate string is never a count that will later contradict itself. |

The safer default — if Build is uncertain — is to suppress the preliminary summary and show "Checking devices…". A wrong count shown confidently is worse than an honest placeholder. Build may not assume equivalence; it must confirm it.

---

**critical-thinker — no timeout bounds `fetchTelemetry` or the `inFlightReads` entry; client `catch{}` is entirely silent**

The design's "≤30s" claim was asserted with nothing enforcing it. A hung ThingsBoard connection holds the `inFlightReads` entry indefinitely and `perSiteCache` never warms. With `perSiteCache.has()` now as the readiness gate, `devicesReady` stays `false` forever. The client poll's bare `catch{}` swallowed every failure silently, leaving the handler staring at loading tiles with no indication anything is wrong.

**Server-side: fetchTelemetry timeout**

Wrap the background Promise in a `Promise.race` with a configurable deadline:

```js
const TB_TIMEOUT = Number(process.env.TB_DEVICE_READ_TIMEOUT_MS ?? 30_000);

if (!inFlightReads.has(key)) {
    inFlightReads.set(key, (async () => {
        try {
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TB read timeout')), TB_TIMEOUT)
            );
            const full = await Promise.race([fetchTelemetry(matched), timeout]);
            perSiteCache.set(key, { sites: buildFullResult(full, siteNamePromise), at: Date.now() });
        } finally {
            inFlightReads.delete(key);
        }
    })());
}
```

On timeout the Promise rejects, `finally` deletes the entry, `perSiteCache` is not written. Any `/confirm` awaiter that is mid-await on this Promise receives the rejection and the existing `wrap()` handler returns 503 — unchanged behaviour. The 30 s default is chosen to match the existing observed worst-case TB read time; it is configurable without a deploy via the env var.

**Client-side: give-up / escalation state**

The poll loop `catch{}` must count consecutive failures and enforce a wall-clock ceiling. Amended `scheduleWorkspaceRefresh`:

```js
function scheduleWorkspaceRefresh(fastPoll) {
    clearInterval(wsRefreshTimer);
    const interval = fastPoll ? 2000 : 30000;
    let failCount = 0;
    const giveUpAt = fastPoll ? Date.now() + 45_000 : null;  // 45s ceiling on fast poll only

    wsRefreshTimer = setInterval(async () => {
        if (state.view !== 'site' || !state.confirmToken || state.flow || window.ctl) return;
        try {
            const { workspace } = await api.get(
                `/api/sites/${encodeURIComponent(state.siteNo)}/workspace?confirmToken=${state.confirmToken}`
            );
            failCount = 0;
            state.workspace = workspace;
            if (workspace.devicesReady && fastPoll) {
                scheduleWorkspaceRefresh(false);
            }
            if (state.view === 'site') render();
        } catch {
            failCount++;
            if (fastPoll && (failCount >= 5 || Date.now() >= giveUpAt)) {
                clearInterval(wsRefreshTimer);
                state.workspace = { ...state.workspace, devicesReady: 'error' };
                if (state.view === 'site') render();
            }
        }
    }, interval);
}
```

`devicesReady: 'error'` is a new third value (falsy for the `if (devicesReady)` guard but distinguishable from `false`). When `renderWorkspace()` sees `devicesReady === 'error'`, scope tiles render with class `tile-error` instead of `tile-loading`: "Unable to load device data — please refresh" with a Refresh button that calls `location.reload()`. The pulsing animation stops. The flow entry guard shows the same "Unable to load device data" toast but without the "in a moment" qualifier. This is the escalation surface the panel required.

The give-up ceiling is 45 seconds from confirm (≥ the 30s server timeout plus one or two poll cycles for propagation). On the slow 30s poll, no ceiling applies — a transient failure is recovered on the next cycle, consistent with the existing behaviour today.

**Test additions required (amends the test plan in the design above):**

| New test case | Assertion |
|---|---|
| Server TB timeout | Mock `fetchTelemetry` to hang >30s; assert `perSiteCache` is not written; assert `/workspace` returns `devicesReady: false` after the timeout fires |
| Client give-up state | Simulate 5 consecutive `/workspace` poll failures; assert tiles switch to `tile-error` class; assert poll timer is cleared; assert Refresh button is present |
| Client error floor guard | With `devicesReady: 'error'`, click a tile; assert toast shows "Unable to load device data" (not "in a moment" variant) |

---

**critical-thinker — concurrent same-site resolves unconditionally overwrite the `inFlightReads` entry**

If two `/resolve` requests for the same `siteNo` arrive concurrently, the second call's `inFlightReads.set(key, promise2)` overwrites `promise1`. When `promise1`'s `finally` fires it calls `inFlightReads.delete(key)`, clearing `promise2`'s registration. `promise2`'s settlement still writes `perSiteCache`, but the entry is already gone; any `/confirm` that arrived between `promise1.delete` and `promise2.delete` finds `!inFlightReads.has(key)` and (under the old readiness check) would have seen false-ready.

Under the corrected readiness check (`perSiteCache.has()`), the false-ready window is closed — but the orphaned Promise and the spurious `delete` are still a latent hazard if any future logic re-reads `inFlightReads` directly.

**Fix — set-if-absent (replaces the unconditional set in the design above):**

```js
if (!inFlightReads.has(key)) {
    inFlightReads.set(key, (async () => { /* ... */ })());
}
```

The first caller wins. The second `/resolve` call returns its own preliminary stubs from the same textSearch result (identical data, since both went through the same code path), and the first caller's background Promise settles `perSiteCache` as normal. No `delete` from one Promise can clear another's registration.

---

### Summary of additions

Four correctness changes are added to the design:

**1. Readiness signal corrected.** `devicesReady` is now gated on `perSiteCache.has(key)` in both `/confirm` and `/workspace`. This closes the false-ready path where a failed telemetry read deleted its own `inFlightReads` entry and left the Map empty while `perSiteCache` was unwritten — the previous `!inFlightReads.has()` check incorrectly treated that state as ready.

**2. `classifyDevice` kind-equivalence made a Build gate, not an assumption.** Build must verify whether any branch in `classifyDevice()` reads telemetry fields. If telemetry influences `kind` for any device type present on this installation, the preliminary `deviceSummary` is suppressed and the confirm gate shows "Checking devices…" instead. The safer default is suppression; Build may not assume equivalence without inspection.

**3. Server timeout + client give-up state specified.** `fetchTelemetry` is wrapped in a `Promise.race` with a 30s deadline (configurable via `TB_DEVICE_READ_TIMEOUT_MS`). On expiry the Promise rejects, `inFlightReads` entry is deleted, `perSiteCache` is not written. Client-side: after 5 consecutive poll failures or 45 seconds wall-clock (whichever comes first), the fast poll cancels and scope tiles transition to a `tile-error` state showing "Unable to load device data — please refresh" with a Refresh button. The silent `catch{}` is replaced by a failure counter and a ceiling. Three new test cases are added to cover these paths.

**4. Concurrent same-site resolves use set-if-absent.** `inFlightReads.set(key, …)` is guarded by `if (!inFlightReads.has(key))`, so the first caller's Promise registration cannot be overwritten by a concurrent second `/resolve` for the same site. This prevents one Promise's `finally`-delete from orphaning another's registration.