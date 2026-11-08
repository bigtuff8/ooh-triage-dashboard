<!-- gate:contract
TICKET: OOHDASH-158
PHASE: discovery

SECTION: What the timing data proves
Live pod logs confirm the problem shape. A site with 34 devices costs roughly 80ms for the ThingsBoard text search and 15,255ms for the per-device telemetry reads. The agent sees "Looking up site…" for the full 15 seconds before the confirm gate renders — before they can even say the site name back to the caller. The wait is at /resolve, not at /confirm: /confirm hits the 30-second in-process cache and returns in tens of milliseconds. The slow path is /resolve, which does the full TB device read before responding.

SECTION: How the server routes are structured
/resolve calls resolveSite() → getSitesByNumber() → fetchLiveSitesByNumber(), which performs the complete textSearch + per-device telemetry read sequence. /confirm calls confirmSite() → resolveSite() → getSitesByNumber() → fetchLiveSitesByNumber() again, but if the agent clicks Confirm within 30 seconds of the /resolve result appearing, the perSiteCache is warm and the second call is free. /workspace (already live) polls the full site object on a 30-second browser timer, bypassing the cache on its own getSitesByNumber() call.

SECTION: What the per-device read costs
fetchTelemetry() fires 3–4 concurrent HTTP calls per device, all devices concurrently: (1) latest-timeseries telemetry, (2) SERVER_SCOPE active+lastActivityTime, (3) CLIENT_SCOPE attributes (area derivation). A fourth call — SHARED_SCOPE schedule attributes — fires only for boilerControl profile devices and PowerPause circuits. A fifth conditional call — V1 DHW override history — fires only for V1 boilerControl panels whose output4Override is non-zero. With 34 devices this is roughly 100+ simultaneous HTTP requests; the wall-clock cost is the slowest device response, not a sum.

SECTION: What textSearch alone gives us
After TB textSearch settles (~80–100ms), we have raw TB device entities: name, profile/type, and label. From those we can derive: device count, device kind (heating/kitchen/lighting/fan/gateway) via classifyDevice called with empty telemetry, and zone labels (TB label field). We cannot derive: telemetry values (temperatures, setpoints, switch states), online status, area (requires CLIENT_SCOPE), boilerControl controllability or DHW state, or schedule next-change. A preliminary deviceSummary string ("On Lighthouse: 2 heating zones · hot water · 3 kitchen circuits") can be computed from name-classified kinds alone — the same categories the current confirm gate shows.

SECTION: Options on the table
Three options in order of client-impact. Option 1 (Slim resolve, server-only): /resolve returns after textSearch only — device stubs (name, kind, zone) plus a preliminary category string. A background Promise (stored in a new inFlightReads Map in tb-device.js) completes the full TB read and populates the perSiteCache when done. /confirm awaits the in-flight Promise if it has not yet settled, then proceeds normally. Confirm gate renders at ~100ms; workspace renders when the agent clicks Confirm (which may need to wait a few seconds if clicked very fast). Client is unchanged. Option 2 (Progressive workspace, server + client): same server split, but /confirm returns a partial workspace payload immediately with devicesReady:false. Client polls /workspace on a 2-second interval until devicesReady:true, then drops to 30s. Scope tiles show a "loading" state; agent can read the site name and start talking while telemetry populates. Client changes are moderate. Option 3 (Cache TTL raise, config-only): raise LIVE_CACHE_TTL from 30s to 2–3 minutes. Second open of the same site within a shift is free. First open still costs 15s. Risk: telemetry can be up to 3 minutes stale. This is a partial mitigation, not a solution.

SECTION: Cost and silent-running evaluation
All three options carry zero recurring £/$ cost and zero token cost. The inFlightReads Map (Options 1 and 2) holds a Promise for the duration of one TB read per open site — it is ephemeral and idle between calls. No new daemon, watcher, background service, or polling loop is introduced on the server. The existing 30s client workspace timer is already in place; Option 2 shortens it temporarily per call, then resets. No console windows, no background processes, no performance overhead while idle. The existing JWT caching fix (OOHDASH-148) remains the baseline; the TB read volume is unchanged by this work.

SECTION: What is NOT in scope
Raising the cache TTL as a primary fix (Option 3 is noted as a complement only). Replacing the per-device TB call structure with a bulk telemetry batch API — TB bulk endpoint availability is unconfirmed and is a separate investigation. A pre-built estate-wide site index (Cosmos background worker) — overengineered until progressive load has been proven insufficient. The Tuya read path (enabled=false in prod by default; its concurrent latency is a separate concern). Any change to the Zendesk name enrichment call (already fires in parallel and costs ~0ms after TB reads).

DECISION: Which option(s) to pursue in the design gate? | Option 1 only — slim /resolve (server-only, agent sees site at ~100ms, confirm still waits for full telemetry) | Option 2 — progressive workspace (server + client, workspace tiles load progressively, agent can start immediately) | Option 1 as phase 1, Option 2 as phase 2 in a single design gate | Option 3 (cache TTL) as a short-term complement to whichever option is chosen
-->

# OOHDASH-158 Discovery — Progressive Site Load

**Date:** 2026-10-28
**Status:** Discovery complete — gate for design decision
**Scope:** Read-only investigation. No production changes made or proposed here.

---

## Problem statement

Live pod logs confirm the symptom. A 34-device site takes ~15.3 seconds from the moment an agent selects a site until the confirm gate renders:

```
[SITE] 6819 resolve: tb-search=80ms devices=34 tb-reads=15255ms zd-name=0ms total=15337ms
```

The agent sees "Looking up site 6819…" for the entire 15 seconds before they can even read the site name back to the caller. This is Option E from the OOHDASH-148 discovery artefact, deferred at the time because it requires coordinated client+server change. OOHDASH-148 shipped Options A/B/C (parallelise calls, fix JWT caching). The timing logs prove the slow path remains and is dominated by per-device telemetry reads.

---

## Findings

### Research question 1 — What do /resolve and /confirm return? (PROVEN)

**`GET /api/sites/:siteNo/resolve`**

Calls `resolution.resolveSite()` → `bridge.getSitesByNumber()` → `fetchLiveSitesByNumber()` — the full slow path. Returns a slimmed site object:
```
{ status: 'resolved', site: { siteNo, siteName, nameUnverified, accountId, brand, address, callsLast30Days, deviceSummary } }
```
The `deviceSummary` field is computed from `site.devices` (the full device list), so the full 15s read is required before `/resolve` can respond.

**`POST /api/sites/:siteNo/confirm`**

Calls `resolution.confirmSite()` which calls `resolveSite()` → `getSitesByNumber()` → `fetchLiveSitesByNumber()` again. If the agent clicks Confirm within 30 seconds of `/resolve` returning, `perSiteCache` is warm and the call costs a few milliseconds. Then `workspacePayload()` adds Zendesk tickets + Cosmos boost-holds in parallel (~200ms). Returns:
```
{ confirmToken, workspace: { site, devices, scope, anyOffline, tickets, activeP1Tickets, degraded, boilerControl, boostAvailable, activeBoostHolds } }
```

**The slow path is `/resolve`, not `/confirm`.** The confirm gate only appears after 15s. The Confirm click is fast.

### Research question 2 — What does fetchLiveSitesByNumber do step by step? (PROVEN)

`fetchLiveSitesByNumber` at `services/tb-device.js:1477`:

1. **Cache check** (instant): if `perSiteCache` has a fresh entry (< 30s old), return immediately.
2. **Fire Zendesk name lookup** (non-blocking): `siteNamePromise` starts but is not awaited yet.
3. **TB textSearch** (~80–100ms): two parallel searches — per-token (`gk-{token}`) and bracket-legacy (`({siteNo}-`). Deduplication and anchored filter applied.
4. **`fetchTelemetry(matched)`** (~15s): fires 3–4 concurrent HTTP calls per device, all devices concurrently. This is the bottleneck.
5. **Await `siteNamePromise`** (near-zero after step 4 — it was in flight during the reads): Zendesk human name arrives.
6. Derive `boilerControl`, decode DHW override, decode boiler heating — all from telemetry already fetched.
7. Cache the full site object. Return.

The log line `[SITE] 6819 resolve: tb-search=80ms devices=34 tb-reads=15255ms zd-name=0ms total=15337ms` maps exactly to steps 3, 4, and 5.

### Research question 3 — TB calls per device and SHARED_SCOPE schedule reads (PROVEN)

`fetchTelemetry` (`services/tb-device.js:1358`) fires per device:

| Call | Endpoint | Condition |
|---|---|---|
| Latest timeseries | `GET /api/plugins/telemetry/DEVICE/{uuid}/values/timeseries` | All devices |
| SERVER_SCOPE active+lastActivityTime | `GET /api/attributes/DEVICE/{uuid}?scope=SERVER_SCOPE` | All devices |
| CLIENT_SCOPE attributes | `GET /api/attributes/DEVICE/{uuid}?scope=CLIENT_SCOPE` | All devices |
| SHARED_SCOPE schedule | `GET /api/attributes/DEVICE/{uuid}?scope=SHARED_SCOPE` | boilerControl + PowerPause only |
| V1 DHW override history | `GET /api/plugins/telemetry/DEVICE/{uuid}/values/timeseries?keys=output4Override&...` | V1 boilerControl with non-zero output4Override only |

All calls per device are concurrent (`Promise.allSettled`). All devices are processed concurrently (`Promise.all`). For 34 devices this is roughly 100+ simultaneous TB requests. Wall-clock cost = slowest device, not sum.

SHARED_SCOPE reads are device-conditional. Separating them from the main fetch would require restructuring `fetchTelemetry`; this is feasible but adds complexity.

### Research question 4 — Does /workspace already exist? (PROVEN)

Yes. `GET /api/sites/:siteNo/workspace` is live at `routes/api.js:124`:

```js
router.get('/sites/:siteNo/workspace', wrap(async (req, res) => {
    if (!resolution.isConfirmed(req.query.confirmToken, ...)) return res.status(409)...;
    const sites = await bridge.getSitesByNumber(req.params.siteNo);
    res.json({ workspace: await workspacePayload(sites[0]) });
}));
```

It calls `getSitesByNumber` (full TB read, or cache hit) and is **already polled by the client every 30 seconds** via `scheduleWorkspaceRefresh()` in `public/js/views.js`. This is the natural polling endpoint for a progressive load; no new route is needed.

### Research question 5 — Client-side confirm flow (PROVEN)

From `public/js/views.js`:

1. `openSite(siteNo)` calls `GET /api/sites/:siteNo/resolve` — the screen shows "Looking up site…" while this blocks.
2. On response: `state.pendingSite = result.site`; `renderConfirmGate()` renders the site name, `deviceSummary` string, and a "✓ This is the right site" button.
3. `confirmSite()` calls `POST /api/sites/:siteNo/confirm` — gets `{ confirmToken, workspace }` back. Stores both. Calls `scheduleWorkspaceRefresh()` which polls `/workspace` every 30s.
4. `renderWorkspace()` runs.

**The client already has a 30s workspace polling loop.** For progressive load it would only need to use a shorter initial interval.

**What changes to render from Phase 1a data:**

Currently `renderConfirmGate()` uses `state.pendingSite.deviceSummary` — a pre-computed string from the server. If `/resolve` returns after textSearch only, this string can still be computed server-side from name-classified device kinds (no telemetry required). No client change is strictly needed for Phase 1a.

### Research question 6 — Loading/spinner state (PROVEN)

The client has a loading state during `/resolve` ("Looking up site 6819…"). The confirm gate has no per-tile spinner. The workspace has no "loading" affordance. For Option 2 (progressive workspace), scope tiles would need a "loading" state during the telemetry gap. This is a client-side addition.

### Research question 7 — Minimum server change for Phase 1a (DEDUCED)

Minimum change to unlock Phase 1a (site name + device list at ~100ms):

1. In `fetchLiveSitesByNumber`, after textSearch settles (step 3), return a **partial site object** immediately with device stubs (name, kind from name classification, zone from TB label). Store the full-read Promise in a new module-level `inFlightReads` Map keyed by siteNo.
2. Compute a preliminary `deviceSummary` from name-classified kinds (no telemetry needed — `classifyDevice(name, profile, {})` gives `kind`).
3. On the next `getSitesByNumber` call (from `/confirm`): if the full read has settled, return the cached result; if still in flight, `await inFlightReads.get(key)`.
4. `/resolve` response shape is unchanged (same field names); `deviceSummary` is computed from preliminary kinds.

The `inFlightReads` Map is ephemeral — holds one Promise per open site during its read, then cleared on settlement. Zero recurring cost, zero idle overhead.

### Research question 8 — Minimum client change for Phase 1a (PROVEN)

None required for Phase 1a. If `/resolve` returns device stubs and a preliminary `deviceSummary`, the confirm gate renders exactly as today. The only server change is returning faster.

For Option 2 (progressive workspace): the client's `scheduleWorkspaceRefresh` interval (currently 30s fixed) needs to start at 2s until a `devicesReady: true` flag appears in the workspace payload, then switch to 30s. Scope tiles need a "loading" visual state.

### Research question 9 — Downstream flows requiring full telemetry (PROVEN)

| Flow | Needs telemetry before start | Notes |
|---|---|---|
| Opening greeting | No | Site name + device categories sufficient |
| Initial triage questions | No | "Is anyone on site?", "What is the problem?" |
| Heating / setpoint flow | Yes | Needs `d.online`, `d.telemetry.heatingSetpoint`, `d.controllable` |
| DHW flow | Yes | Needs `boilerControl.dhwControllable`, `boilerControl.dhwOverride` |
| Kitchen / lighting / fan flow | Yes | Needs `d.telemetry.switch_1`, `d.online` |
| Connectivity flow | Yes | Needs `d.online` for all devices |
| Boiler boost | Yes | Needs `boilerControl.heating.zones`, `boostAvailable` |
| Scope tile evaluation (ctl/mon/none) | Yes | Controllability derived from telemetry signals |

**Progressive load does not break downstream flows** provided the UI blocks scope tile interaction until `devicesReady: true`. The agent can greet the caller and start the first triage question before telemetry arrives. For Option 1 (slim resolve only), the Confirm button press may need to wait a few seconds if clicked very fast — this is acceptable. For Option 2, the workspace renders immediately with loading tiles and becomes interactive when telemetry settles.

### Research question 10 — perSiteCache TTL and coverage (PROVEN)

`perSiteCache` is a module-level `Map<siteNo, { sites, at }>` with TTL `LIVE_CACHE_TTL = 30 * 1000` (30 seconds). It stores the complete site object including all device telemetry, boilerControl, etc. The 30s cache means the Confirm click is free if the agent takes less than 30s to click after `/resolve` returns. The slow path is any first open or re-open more than 30s after the last read.

The current cache does not cover the progressive load case — it stores a complete site object or nothing. Option 1 requires a separate `inFlightReads` Map to hold the in-flight Promise alongside the cache, not instead of it.

---

## Options

### Option 1 — Slim resolve (server-only, recommended first step)

**What it does:** `/resolve` returns after TB textSearch (~100ms), serving device stubs (name, kind from name classification, zone). The full TB telemetry read continues as a background Promise in an `inFlightReads` Map. The confirm gate renders in ~100ms instead of ~15s. Clicking Confirm awaits the in-flight Promise if it has not settled; if the agent waits a few seconds before clicking, the workspace is ready instantly.

**Server changes:** `fetchLiveSitesByNumber` split into a fast textSearch phase + background telemetry phase. `inFlightReads` Map for in-flight coordination.

**Client changes:** None.

**Outcome:** Confirm gate visible at ~100ms. Agent can read site name and start talking. Confirm click costs 0–15s depending on agent speed. Workspace renders normally.

**Complexity:** Medium (server refactor, no client change). Risk: Low.

### Option 2 — Progressive workspace (server + client)

**What it does:** Everything Option 1 does, plus `/confirm` returns a partial workspace immediately with `devicesReady: false`. Scope tiles show "loading" state. Client polls `/workspace` on a 2s interval until `devicesReady: true`, then drops to 30s. Agent can open flows once telemetry arrives (~15s after confirm).

**Server changes:** As Option 1, plus `/confirm` returns partial payload; `workspacePayload` accepts a `devicesReady` flag; `/workspace` serves the progressive payload.

**Client changes:** Parameterised poll interval; "loading" scope tile state; guard on entering flows until `devicesReady`.

**Outcome:** Confirm gate at ~100ms AND workspace visible (with loading tiles) immediately after Confirm. Agent can read scope categories and engage the caller while telemetry populates.

**Complexity:** High (server + client change, Playwright test coverage update). Risk: Medium.

### Option 3 — Cache TTL raise (complementary, not a primary fix)

**What it does:** Raise `LIVE_CACHE_TTL` from 30s to 2–3 minutes. Second opens of the same site within a shift are free. First opens still cost 15s.

**Risk:** Device telemetry (setpoints, switch states, online status) can be up to 3 minutes stale. An agent sees old data for a device that changed state in the last 3 minutes.

**Verdict:** Valid complement to Option 1 or 2 — reduces the repeat-open cost — but does not address the first-open problem James raised.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Agent clicks Confirm very quickly (< 5s) and waits for telemetry | Medium | Low — a few seconds of spinner on Confirm click | Option 2 mitigates by making the workspace visible immediately with loading state |
| `inFlightReads` Promise leaks if /resolve never triggers /confirm | Low | Low — Promise resolves normally; Map entry should be cleared on settlement | Clear from Map on cache write |
| Preliminary `deviceSummary` (from name classification only) differs from current (telemetry-enriched) | Very low | Low — kinds are the same; controllability is not shown in the confirm gate | Verify no confirm-gate test asserts controllability in device summary |
| Client poll frequency increase (2s during progressive load) increases server load briefly per open | Low | Low — one request per open site, settles in < 15s | Already within normal operational envelope |
| Playwright e2e suite: confirm gate + workspace render tests may need updating | Certain if client changes | Medium — test breakage is caught in CI | Cover in design gate test plan |

---

## What is NOT in scope

- Replacing per-device TB call structure with a bulk telemetry batch API (TB bulk endpoint availability unconfirmed, separate investigation)
- Pre-built estate-wide site index in Cosmos (background worker, recurring cost — overengineered until Options 1/2 proven insufficient)
- Changes to the Tuya read path (enabled=false in prod by default; separate concern)
- Changes to Zendesk name enrichment (already concurrent and near-zero cost after TB reads)
- Raising the cache TTL as a primary fix (Option 3 is a complement only)
- Deferred SHARED_SCOPE schedule reads as a first-class goal (the schedule read is a small fraction of per-device cost and already conditional; can be addressed in a follow-on)

---

## Next steps (pending James's decision)

1. **James to select option(s)** via the gate review.
2. Design gate: define the split in `fetchLiveSitesByNumber`, the `inFlightReads` coordination logic, and (for Option 2) the client progressive loading UI.
3. Build: implement server changes, update Playwright tests for the new response shape.
4. Test gate: verify confirm gate latency in fixture mode and live (pod log timing lines).

No external blockers. Spencer, Sam, and CJ do not need to be consulted before design begins.

---

*Investigation by Discovery doer · OOHDASH-158 · 2026-10-28*
