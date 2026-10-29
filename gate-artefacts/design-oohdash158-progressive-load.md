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

## Rework addendum — round 2 (design/committee)

### Panel verdicts addressed

**critical-thinker — session stash is a single unkeyed slot; write point never specified; warmCacheIfCold shape unverified**

Three related findings, one root fix. The design introduced `req.session.preliminarySite` across multiple addendums but never specified: (a) where it is written, (b) that it is keyed by siteNo to prevent cross-site overwrite, or (c) that `warmCacheIfCold` needs the raw TB matched-stubs array — not the processed preliminary site object — to re-fire `fetchTelemetry`.

**Fix — two-key session stash, keyed by siteNo, written in `/resolve`:**

The session stash is written once, in the `/resolve` route, immediately before `res.json(...)`:

```js
// routes/api.js — /resolve route, immediately before res.json:
req.session.siteStash = req.session.siteStash || {};
req.session.siteStash[String(siteNo)] = {
    preliminarySite: prelimSiteObject,   // processed site object — same shape as perSiteCache.sites[0]
    tbMatchedStubs:  matched             // raw TB textSearch result array — input to fetchTelemetry
};
```

`prelimSiteObject` is the preliminary site object already being returned by `fetchLiveSitesByNumber` at `/resolve` time. `matched` is the TB textSearch result array, available in the same code path before `fetchTelemetry` is deferred. Both must be serialisable (no circular refs, no Promises).

`/workspace` reads the stash with a siteNo guard before using either field:

```js
const stash = req.session.siteStash?.[String(siteNo)];
if (!stash) return res.status(400).json({ error: 'No prior resolve for this site in session.' });
const site = devicesReady ? cached.sites[0] : stash.preliminarySite;
if (!devicesReady && !inFlightReads.has(siteNo)) {
    warmCacheIfCold(siteNo, stash.tbMatchedStubs);  // raw stubs — not the preliminary site object
}
```

`warmCacheIfCold(siteNo, tbMatchedStubs)` receives `matched` (the raw TB textSearch stubs). The processed `preliminarySite` is passed only to `workspacePayload`. These two shapes are now explicitly separated with field names that make their purpose unambiguous. The Gap-4 addendum incorrectly described `warmCacheIfCold` as receiving `req.session.preliminarySite`; that was wrong — `fetchTelemetry` needs the raw stubs, not the processed object. This addendum corrects that.

Build must confirm that `matched` is captured in a local variable before the deferred Promise IIFE is created in `fetchLiveSitesByNumber`, so it is still accessible at the session-write point in the `/resolve` route.

---

**technical — same session-stash findings; cost note on mid-session re-warm**

The siteNo guard and shape-verification findings are resolved by the two-key stash above.

The cost section stated "zero recurring cost" without acknowledging that the Gap-4 re-warm can trigger a full TB read on TTL expiry. Corrected statement: the only case where a re-warm fires is when `perSiteCache` expires (after SESSION_CACHE_TTL_MS, default 20 minutes) and the handler is still actively polling. In normal use this does not occur — a typical OOH call resolves well under 20 minutes. In the rare case it does, a single re-warm fires at most once per 20-minute window, costing one extra TB read (~15s) — the same as the initial load, not a recurring charge. The cost is bounded and does not scale with usage volume; it scales only with active-session duration beyond 20 minutes. The cost section in the design body is amended accordingly.

---

**security — confirmToken in GET query string; single-slot cross-site**

The single-slot cross-site concern is resolved by the siteNo-keyed stash.

The `confirmToken` query-string concern is addressed as a design change: move `confirmToken` to a request header on every `/workspace` poll call. This removes it from access logs, referer headers, and browser history.

Client change in `views.js` (`scheduleWorkspaceRefresh`):

```js
const { workspace } = await api.get(
    `/api/sites/${encodeURIComponent(state.siteNo)}/workspace`,
    { headers: { 'X-Confirm-Token': state.confirmToken } }
);
```

Server change in `routes/api.js` (`/workspace` route):

```js
const confirmToken = req.headers['x-confirm-token'] ?? req.query.confirmToken;
```

The fallback to `req.query.confirmToken` maintains backward compatibility during deployment. Once the client is live, the query-string variant is removed in a cleanup commit. Build must verify that the `api.get()` helper in `views.js` accepts an options object as a second argument; if it does not, Build must add header-passthrough before implementing the poll call. Existing e2e tests that pass `confirmToken` as a query string must be updated to send the header.

---

**integration — two incompatible shapes in one slot; write point unspecified; session TTL; timeout env var naming**

The two-shape and write-point findings are resolved by the two-key stash above.

*Session store TTL alignment:* The minimum required session lifetime is SESSION_CACHE_TTL_MS (default 20 minutes). If the Express session store has a shorter TTL, the siteStash is lost before `perSiteCache` expires and the `/workspace` re-warm loses its data source. Build must confirm the configured session TTL is at least SESSION_CACHE_TTL_MS before merge, or raise this as a deployment blocker. A startup-time log warning if session TTL < SESSION_CACHE_TTL_MS is recommended.

*TB_DEVICE_READ_TIMEOUT_MS scope:* After the Gap-2 race fix, this env var bounds the full `doAll()` chain — including Zendesk (siteNamePromise) and Tuya reads inside `buildFullResult` — not TB reads alone. Renaming would require a K8s secret update via Spencer, so the name is kept. Build must add a code comment at the read site:

```js
// TB_DEVICE_READ_TIMEOUT_MS: bounds the full background read chain (TB telemetry,
// Zendesk name lookup, and Tuya reads) via doAll(). Named for the dominant path
// but applies to all three services. Tune with care.
const TB_TIMEOUT = Number(process.env.TB_DEVICE_READ_TIMEOUT_MS ?? 30_000);
```

A note in the release checklist must document that tuning this var affects all three services.

---

**compliance — BLOCK flag, no findings**

No findings were raised by the compliance lens. Acknowledged; no actionable change.

---

### Summary of additions

Five specification gaps are closed in this addendum.

**1. Two-key, siteNo-keyed session stash specified.** A single `preliminarySite` slot is replaced by `req.session.siteStash[siteNo]`, holding two explicitly named fields: `preliminarySite` (processed site object, for workspacePayload) and `tbMatchedStubs` (raw TB textSearch array, for warmCacheIfCold). The write occurs once in `/resolve`, immediately before `res.json`. No previous addendum named the write point or field names; this addendum states both as Build gate items.

**2. siteNo validation guard added to `/workspace`.** The route reads `req.session.siteStash?.[siteNo]` and returns 400 if absent. Cross-site cross-wiring (two tabs, same session) is structurally impossible — each site's stash is keyed by its own siteNo.

**3. warmCacheIfCold signature corrected.** The helper takes `(siteNo, tbMatchedStubs)` — the raw TB textSearch array, not the processed preliminary site object. The Gap-4 addendum incorrectly used `req.session.preliminarySite` as the second argument; that would have passed the wrong shape to `fetchTelemetry`. The two shapes now have distinct names and live in distinct session fields.

**4. confirmToken moved to X-Confirm-Token request header.** The token is removed from the `/workspace` GET query string and sent as a header on every poll call, with a query-string fallback for backward compatibility. Build must update the `api.get()` helper and the e2e confirmToken tests.

**5. Session TTL alignment and timeout env var scope documented.** Minimum required session TTL is stated as SESSION_CACHE_TTL_MS (20 min); Build must verify before merge. TB_DEVICE_READ_TIMEOUT_MS receives a code comment listing all three services it bounds; a release checklist note is added.


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

---

## Rework addendum — round 2 (design/draft)

### Panel verdicts addressed

**critical-thinker — flow entry guard uses truthy check; `'error'` string breaks it**

The guard `if (!state.workspace?.devicesReady)` treats any truthy value as "ready". `devicesReady === 'error'` is a non-empty string, so `!state.workspace?.devicesReady` evaluates to `false` — the guard **does not block** flow entry in the error state. Same flaw affects every render branch that tests `devicesReady` as a boolean shorthand.

**Fix — all `devicesReady` reads must use strict `=== true` / `!== true`:**

Flow entry guard (corrected):
```js
if (state.workspace?.devicesReady !== true) {
    const msg = state.workspace?.devicesReady === 'error'
        ? 'Unable to load device data — please refresh'
        : 'Loading device data — available in a moment';
    toast(msg);
    return;
}
```

Render branch conditions (corrected):
```js
// loading state
if (devicesReady !== true && devicesReady !== 'error') { /* tile-loading */ }
// error state
if (devicesReady === 'error') { /* tile-error */ }
// ready
if (devicesReady === true) { /* normal tiles */ }
```

Drop-to-30s check (corrected):
```js
if (workspace.devicesReady === true && fastPoll) {
    scheduleWorkspaceRefresh(false);
}
```

Build must audit every location in `views.js` that reads `devicesReady` and confirm it uses strict equality — no truthy/falsy shorthand anywhere.

---

**critical-thinker — background telemetry Promise has no `.catch()`; rejection is unhandled**

The async IIFE stored in `inFlightReads` has `try/finally`. `finally` deletes the Map entry and then the outer Promise still rejects. In the progressive path nobody awaits this Promise, so the rejection escapes the call stack — an `UnhandledPromiseRejection` log line, or a process crash under `--unhandled-rejections=throw` (Node 15+ default). This is exactly the failure path the timeout was added for.

**Fix — split the stored reference from the swallowing subscriber:**

```js
const bgPromise = (async () => {
    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TB read timeout')), TB_TIMEOUT)
        );
        const full = await Promise.race([fetchTelemetry(matched), timeout]);
        perSiteCache.set(key, { sites: buildFullResult(full, siteNamePromise), at: Date.now() });
    } finally {
        inFlightReads.delete(key);
    }
})();
// Second subscriber — swallows the rejection so Node never sees it as unhandled.
// Does not interfere with any /confirm awaiter on the same bgPromise reference.
bgPromise.catch(err =>
    console.error('[tb-device] background read failed for site', key, err.message)
);
inFlightReads.set(key, bgPromise);
```

The Map stores `bgPromise` — the original reference. Any `/confirm` that was already mid-`await` on this reference receives the rejection first (→ 503 via `wrap()`). The `.catch()` is a separate subscriber; it fires after `finally` and logs then swallows, ensuring Node does not report the rejection as unhandled. The two subscriptions are independent — one does not cancel or shadow the other.

---

**critical-thinker — `/confirm` await contract is contradictory; Phase 1a and 1b disagree**

Phase 1a stated: "When `/confirm` calls `getSitesByNumber(siteNo)`: if `inFlightReads` has an entry, `await inFlightReads.get(key)`." That blocks `/confirm` for up to 15 seconds and kills the progressive feature. Phase 1b stated: "`/confirm` returns immediately." These cannot both be true. Addendum 1 corrected the readiness signal to `perSiteCache.has()` but did not explicitly retire the Phase 1a await description. Build was left holding two contradictory instructions.

**Unambiguous contract — `/confirm` does not await `inFlightReads`. Ever.**

```
/confirm sequence:
  1. confirmSite(siteNo) — writes the session token. Unchanged.
  2. perSiteCache.has(String(siteNo)) — synchronous Map lookup. No await. No yield.
  3. workspacePayload(site, devicesReady) — builds and returns the workspace object.
  4. res.json(...) — responds immediately.

/confirm never touches inFlightReads at execution time.
/confirm never calls getSitesByNumber.
The perSiteCache.has() check is a passive read of a separate Map — not a wait on the in-flight Promise.
```

The Phase 1a description of `/confirm` calling `getSitesByNumber` and awaiting `inFlightReads` is **superseded and deleted**. `getSitesByNumber` is used only by the `/workspace` polling route. The complete unambiguous `/confirm` implementation:

```js
router.post('/sites/:siteNo/confirm', wrap(async (req, res) => {
    const siteNo = String(req.params.siteNo);
    const { token, site } = await resolution.confirmSite(siteNo, req.session.operator);
    const devicesReady = perSiteCache.has(siteNo);   // synchronous — no await
    res.json({ confirmToken: token, workspace: await workspacePayload(site, devicesReady) });
}));
```

If Build sees any form of `await inFlightReads` inside the `/confirm` route handler, that is a build error and must be raised before merge.

---

### Summary of additions

Three correctness fixes are added to the design:

**1. All `devicesReady` checks corrected to strict equality.** Every truthy/falsy guard in `views.js` — the flow entry guard, the render branch conditions, and the drop-to-30s check — is replaced with `=== true`, `!== true`, or `=== 'error'`. The `'error'` tri-state is a truthy string; the previous boolean shorthand evaluated it as "ready", allowing triage flows to open with no device data. Build must audit all `devicesReady` reads in `views.js` and confirm strict equality is used at every point before merge.

**2. Background Promise `.catch()` added as a separate subscriber.** The async IIFE is assigned to `bgPromise` before being stored in the Map. A `.catch()` is chained on `bgPromise` as an independent second subscriber that logs and swallows the error. The Map stores the original `bgPromise` reference, so any `/confirm` awaiter still receives the rejection through the existing `wrap()` 503 path. The two subscribers are independent; neither cancels the other. This closes the unhandled-rejection risk on the timeout and TB-error paths without altering the server error-response behaviour.

**3. `/confirm` await contract stated once, unambiguously, as a Build gate.** The Phase 1a description of `/confirm` awaiting `inFlightReads` is explicitly retired. The complete route implementation is given above. `/confirm` performs one synchronous `perSiteCache.has()` lookup and returns immediately — it never awaits `inFlightReads` and never calls `getSitesByNumber`. Any `await inFlightReads` found in the `/confirm` route during build is a build error and must be raised before merge.

---

## Rework addendum — round 1 (design/committee)

### Panel verdicts addressed

**technical** — *Design sound and well-reworked, but the riskiest async path on a universal route ships untested; three concrete build gaps.*

The panel identifies four concrete gaps. Each is addressed below.

---

**Gap 1 — Phase 1a async coordination has zero automated coverage**

The test plan's claim that `inFlightReads` coordination is "covered by the integration path" is incorrect and is retired. Fixture mode is synchronous; `fetchTelemetry` returns immediately; `inFlightReads` is never populated. No fixture-mode or Playwright test exercises the async coordination paths. Four unit tests over `fetchLiveSitesByNumber` are required before build, using a mocked `fetchTelemetry` and fake timers:

| Unit test | Mock setup | Assertion |
|---|---|---|
| Set-if-absent under concurrency | Two calls to `fetchLiveSitesByNumber(siteNo)` fired before any mock resolves | `inFlightReads` has exactly one entry for the key; `fetchTelemetry` was called exactly once |
| Timeout-reject path | `fetchTelemetry` never resolves; fake timers advance past `TB_TIMEOUT` | `inFlightReads` entry is deleted; `perSiteCache` has no entry for the key |
| Concurrent-resolve: `perSiteCache` write on settlement | `fetchTelemetry` resolves after 100 ms; two concurrent calls in flight | `perSiteCache` is written exactly once; its `sites` field matches `buildFullResult` output |
| Background `.catch()` suppresses unhandled rejection | `fetchTelemetry` rejects immediately | No `UnhandledPromiseRejection` event fires; `console.error` is called with the site key and error message |

These tests run in the unit suite, not in Playwright. The timeout-reject test must also cover a hang inside `buildFullResult` (see Gap 2).

---

**Gap 2 — `Promise.race` bounds only `fetchTelemetry`; Tuya read and `siteNamePromise` are outside the deadline**

The addendum-1 timeout code:

```js
const full = await Promise.race([fetchTelemetry(matched), timeout]);
perSiteCache.set(key, { sites: buildFullResult(full, siteNamePromise), at: Date.now() });
```

`buildFullResult` awaits `siteNamePromise` (Zendesk name lookup) and may perform a Tuya read. Both are outside the race. A hung Tuya or Zendesk call holds the async IIFE open indefinitely: `finally` only fires when the body exits, so `inFlightReads` is never cleared and `perSiteCache` is never written.

**Fix — race must wrap the entire background operation:**

```js
if (!inFlightReads.has(key)) {
    const bgPromise = (async () => {
        try {
            const doAll = async () => {
                const full = await fetchTelemetry(matched);
                return buildFullResult(full, siteNamePromise); // awaits Tuya + ZD name
            };
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TB read timeout')), TB_TIMEOUT)
            );
            const result = await Promise.race([doAll(), timeout]);
            perSiteCache.set(key, { sites: result, at: Date.now() });
        } finally {
            inFlightReads.delete(key);
        }
    })();
    bgPromise.catch(err =>
        console.error('[tb-device] background read failed for site', key, err.message)
    );
    inFlightReads.set(key, bgPromise);
}
```

`doAll()` wraps the full chain. `Promise.race` pits the entire operation against `TB_TIMEOUT`. A hang anywhere inside `doAll()` — including `siteNamePromise` and the Tuya read — now hits the same ceiling. The timeout-reject unit test (Gap 1) must include a variant where `buildFullResult` is the hang point, not `fetchTelemetry`.

---

**Gap 3 — `/workspace` await contract unspecified**

Addendum 2 retired the `/confirm`-awaits-`inFlightReads` description but never stated the equivalent contract for `/workspace`. The route calls `getSitesByNumber` — it is ambiguous whether that blocks on `inFlightReads`. If it does, a 2 s poll call hangs for up to 30 s on the first fire, defeating fast-poll entirely.

**Unambiguous contract — `/workspace` also never awaits `inFlightReads`:**

```js
router.get('/sites/:siteNo/workspace', wrap(async (req, res) => {
    const siteNo = String(req.params.siteNo);
    // ... existing confirmToken validation (unchanged) ...
    const cached = perSiteCache.get(siteNo);
    const devicesReady = !!cached && (Date.now() - cached.at) < SESSION_CACHE_TTL_MS;
    const site = devicesReady ? cached.sites[0] : req.session.preliminarySite;
    res.json({ workspace: await workspacePayload(site, devicesReady) });
}));
```

`/workspace` performs the same synchronous TTL-aware `perSiteCache` check as `/confirm`. It does not call `getSitesByNumber`. It does not touch `inFlightReads`. When `devicesReady` is `false`, the `site` object comes from `req.session.preliminarySite` — the preliminary site object stashed in session at `/resolve` time so that `workspacePayload` can construct Zendesk tickets, Cosmos holds, and `anyOffline` from non-TB sources without re-running the TB textSearch. Build must confirm that `workspacePayload` accepts the preliminary shape with `scope: []` and produces a valid partial workspace object. If it cannot, the session stash is the resolution; there is no other path.

Any `await inFlightReads.get(...)` or `await getSitesByNumber(...)` inside the `/workspace` handler is a build error and must be raised before merge.

---

**Gap 4 — `perSiteCache` TTL unspecified; `devicesReady` mid-session flip has no recovery**

The design never stated `perSiteCache`'s TTL. If the cache expires during an active 30 s polling session, `/workspace` returns `devicesReady: false`, the client re-renders scope tiles as greyed-and-loading, and the poll stays at 30 s with no recovery path and no server-side re-warm.

**Two-part fix:**

*(a) Specify `perSiteCache` TTL.* A `SESSION_CACHE_TTL_MS` env var (default `1_200_000` — 20 minutes) governs the TTL check used in both `/confirm` and `/workspace` (the `(Date.now() - cached.at) < SESSION_CACHE_TTL_MS` expression shown in Gap 3). Twenty minutes exceeds any realistic single-site call-handling session. The threshold is configurable without a deploy.

*(b) Client re-enters fast-poll if `devicesReady` flips false during 30 s polling.* `scheduleWorkspaceRefresh` is amended:

```js
if (workspace.devicesReady !== true && !fastPoll) {
    scheduleWorkspaceRefresh(true);  // re-enter fast-poll; resets the 45 s ceiling
    if (state.view === 'site') render();
    return;
}
```

When re-entering fast-poll, the server must also re-warm the cache. `/workspace` triggers a new background warm when `perSiteCache` is cold and `inFlightReads` has no entry:

```js
if (!devicesReady && !inFlightReads.has(siteNo)) {
    warmCacheIfCold(siteNo, req.session.preliminarySite);
    // warmCacheIfCold: the set-if-absent inFlightReads block from fetchLiveSitesByNumber,
    // extracted into a shared helper callable from both the resolve and workspace paths
}
```

`warmCacheIfCold(siteNo, preliminarySite)` is the `inFlightReads` set-if-absent block from `fetchLiveSitesByNumber` extracted into module scope. `req.session.preliminarySite` carries the TB-matched stubs stashed at `/resolve` time; `fetchTelemetry` can be re-fired from them without repeating the textSearch. Two new tests cover this path:

| Test | Setup | Assertion |
|---|---|---|
| Unit: TTL expiry triggers re-warm | `fetchLiveSitesByNumber` settles, fake timers advance past `SESSION_CACHE_TTL_MS`, then call `/workspace` | `inFlightReads` is populated (re-warm triggered); response returns `devicesReady: false` |
| Playwright e2e: mid-session flip recovery | Stub `/workspace` to return `devicesReady: false` on one 30 s poll cycle after initial unlock | Tiles temporarily re-enter loading state; fast-poll resumes; tiles unlock on subsequent `devicesReady: true` response |

---

### Summary of additions

Four technical gaps are closed in this addendum:

**1. Unit tests specified for all Phase 1a async coordination paths.** The "covered by the integration path" claim is retired. Four unit tests are added: set-if-absent under concurrency, timeout-reject (with `fetchTelemetry` as the hang point and with `buildFullResult` as the hang point), concurrent-resolve cache write, and background `.catch()` suppression. All run in the unit suite with mocked `fetchTelemetry` and fake timers, before build.

**2. `Promise.race` extended to bound the entire background operation.** The previous race covered `fetchTelemetry` only. `buildFullResult` — which awaits `siteNamePromise` (Zendesk) and may perform a Tuya read — was outside the deadline. The race is rewritten as `Promise.race([doAll(), timeout])` where `doAll()` wraps the full chain. A hung Tuya or Zendesk call now hits the same `TB_TIMEOUT` ceiling as a hung TB read.

**3. `/workspace` await contract stated explicitly.** `/workspace` performs a synchronous TTL-aware `perSiteCache` check — no await, no `inFlightReads` touch. The full implementation is given above. When `devicesReady` is `false`, the `site` object comes from `req.session.preliminarySite`, stashed at `/resolve` time. Build must confirm `workspacePayload` accepts the preliminary shape; if it does not, the session stash is the resolution. Any `await inFlightReads.get(...)` in the `/workspace` handler is a build error.

**4. `perSiteCache` TTL specified; mid-session flip recovery designed.** `SESSION_CACHE_TTL_MS` (default 20 minutes, env-configurable) governs the TTL check in both routes. If the cache expires mid-session during 30 s polling, the client re-enters fast-poll mode and `/workspace` triggers a re-warm via `warmCacheIfCold()` — a shared helper extracted from `fetchLiveSitesByNumber` — using the `preliminarySite` stashed in session. Two new tests (one unit, one Playwright) cover the TTL expiry and recovery path.