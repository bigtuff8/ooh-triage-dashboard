<!-- gate:contract
SECTION: What we timed
No per-request timing instrumentation exists in the app today — the prod logs carry no `[TB] site ... Nms` or `[ZD] ... Nms` lines. Real durations are unresolvable without adding timers. The call structure is fully mapped from source code and the critical path is PROVEN; the per-stage numbers are UNRESOLVED until timers are added.

SECTION: The cold-path call map
Site load fires two sequential phases before the agent sees anything. Phase 1 (confirmSite): ThingsBoard textSearch for gk-{site}-* devices (two searches in parallel), then for every matched device, four TB attribute/telemetry calls in parallel. After all device reads settle, Zendesk name enrichment runs sequentially. Phase 2 (workspacePayload): Zendesk ticket search then Cosmos boost-hold query run sequentially, one after the other. The wall-clock cost is: max(TB textSearch) + max-per-device(4 TB calls) + 1 ZD name call + 1 ZD ticket search + 1 Cosmos query. Timeouts: Zendesk calls are each capped at 15 s; TB per-request timeout is UNRESOLVED (none found in source).

SECTION: What the agent needs before speaking
Only the site name and a device count — both available as soon as TB textSearch returns (end of Phase 1 step A). Everything that follows (individual device telemetry, open tickets, boost holds) feeds triage questions that start after the opening greeting. The current design blocks the entire agent response until all of Phase 1 and Phase 2 have settled, including two sequential Zendesk calls.

SECTION: Hidden cost to investigate first
The prod logs show more than 50 TB authentication events in 500 lines. DEDUCED: the TB read client may be re-authenticating once per request rather than caching the JWT for its lifetime. If true, every cold site load pays an extra sequential HTTP round-trip before any device read begins. Source: services/tb-client.js (not yet read). This is the highest-suspicion latency item and takes 10 minutes to confirm.

SECTION: Options and costs
Five options in three tiers. Tier 1 — quick wins, server-only, low risk: (A) parallelise Zendesk ticket search and Cosmos boost-hold query in workspacePayload (2-line change); (B) start Zendesk name enrichment concurrently with TB device reads in fetchLiveSitesByNumber; (C) read tb-client.js and fix JWT caching if the client re-auths per request. Tier 2 — client-coordinated, medium complexity: (D) fire /resolve on search-result selection to warm the 30 s cache before /confirm is clicked; (E) progressive response — /confirm returns site name and device count immediately, workspace loads via a background poll (/workspace already exists). Tier 3 — infrastructure, high complexity: (F) raise site-cache TTL from 30 s to 2–3 min (medium staleness risk); (G) investigate TB bulk telemetry batch API; (H) pre-built estate-wide site index in Cosmos (background worker, recurring RU cost). Money cost for Tier 1–2: zero. Tier 3 (H): recurring Cosmos RU cost proportional to estate size and refresh cadence — must be bounded before adoption.

SECTION: Recommendation
Do A, B, and C in that order, shipped as one small PR. They are server-only, zero-cost, and carry low risk. Together they remove two sequential I/O calls from the critical path and may eliminate a hidden serial re-auth per load. If post-deployment timers show the load is still too slow, Option E (progressive response) gives the largest user-facing win — the agent can greet the caller within about one second — but requires a client change and a design gate of its own.

DECISION: Which scope for the site-load design phase? | A + B + C — parallelise calls and investigate TB JWT caching (recommended) | A + B only — defer C until JWT caching confirmed in a separate spike | A + B + C + E — include progressive response in the same design gate | Need more information before deciding
-->

# OOHDASH-148 Discovery — Site Load Speed

**Date:** 2026-10-26  
**Status:** Discovery complete — gate for design decision  
**Scope:** Read-only investigation. No production changes made or proposed here.

---

## Problem statement

When an out-of-hours agent opens a site, the dashboard takes long enough that the agent is waiting before they can greet the customer. James has flagged this as too slow. The question is: where does the time go, what does the agent actually need before they can speak, and what are the options?

---

## What we measured

### Timing data from production logs

No timing instrumentation exists in the application today. The production logs carry no per-stage timing lines for the site-load path (`[TB] site ... Nms`, `[ZD] ... Nms` etc.). All timings below are **UNRESOLVED** (structure proven, durations unknown until timers are added).

### Cold-path call structure (PROVEN from source)

Site confirmation and workspace load fire in two sequential phases:

**Phase 1 — confirmSite → getSitesByNumber → fetchLiveSitesByNumber**

| Step | What | Parallel? | Timeout |
|---|---|---|---|
| TB textSearch (alias tokens) | `GET /api/tenant/devices?textSearch=gk-{token}` | Parallel across tokens | UNRESOLVED |
| TB textSearch (bracket) | `GET /api/tenant/devices?textSearch=({siteNo}-` | Parallel with above | UNRESOLVED |
| Per-device: latest timeseries | `GET /api/plugins/telemetry/DEVICE/{uuid}/values/timeseries` | All devices concurrent | UNRESOLVED |
| Per-device: SERVER_SCOPE active/lastActivity | `GET /api/attributes/DEVICE/{uuid}?scope=SERVER_SCOPE` | All devices concurrent | UNRESOLVED |
| Per-device: CLIENT_SCOPE attrs | `GET /api/attributes/DEVICE/{uuid}?scope=CLIENT_SCOPE` | All devices concurrent | UNRESOLVED |
| Per-device: SHARED_SCOPE schedule | `GET /api/attributes/DEVICE/{uuid}?scope=SHARED_SCOPE` | Boiler/PowerPause only | UNRESOLVED |
| **ZD name enrichment** | ZD search for site name | **Sequential AFTER all TB reads** | 15 000 ms |

Phase 1 wall-clock = `max(TB textSearch)` + `max per device(4 calls)` + `1 ZD call`

**Phase 2 — workspacePayload**

| Step | What | Sequential? | Timeout |
|---|---|---|---|
| Zendesk ticket search | `callbackLookup` — ZD search API | **Sequential, first** | 15 000 ms |
| Cosmos boost-hold query | `activeBoostHoldsForSite` — Cosmos query | **Sequential, after ZD** | None (SDK default) |

Phase 2 adds: `1 ZD ticket call` + `1 Cosmos query`, both sequential.

**Total critical path = Phase 1 + Phase 2 = TB reads + ZD name + ZD tickets + Cosmos boost.**

### 30-second in-process cache

`perSiteCache` in `tb-device.js` caches the full site object for 30 s. If an agent resolves a site and confirms within 30 s, Phase 1 is free on `/confirm`. The slow path is: first opens, and any re-open more than 30 s after the last `/resolve`.

---

## Suspected hidden cost: TB re-authentication

The production logs show **more than 50 TB authentication events** (`[TB] Authenticated (read)`) in the last 500 log lines. This is anomalous if the JWT should last minutes. **DEDUCED**: `services/tb-client.js` may be re-authenticating once per request batch rather than caching the JWT for its TTL. If true, every cold site load pays an extra sequential HTTP round-trip (`POST /api/auth/login`) before any device data can be read. `services/tb-client.js` was not read during this investigation; this must be confirmed.

---

## What the agent needs before speaking

The agent only needs to say: *"I can see your site — how can I help?"*

For that, they need: the site name (already returned by `/resolve`) and a device count (available as soon as the TB textSearch settles). They do not need individual device telemetry, open Zendesk tickets, or boost-hold state for the opening greeting. Those are needed for triage questions, which start after the greeting.

**The current design blocks the entire response until all of Phase 1 and Phase 2 have settled — including two sequential Zendesk calls neither of which is needed for the opening.**

---

## Options

### Tier 1: Server-only, low risk, zero cost

**Option A — Parallelise Zendesk + Cosmos in workspacePayload**  
Replace two sequential `await` calls in `workspacePayload` with `Promise.all([ticketsForSite, activeBoostHoldsForSite])`. Saves whichever of the two takes longer — they are independent.  
Complexity: Low (2-line change). Risk: Low. Money: zero.

**Option B — Run ZD name enrichment concurrent with TB reads**  
In `fetchLiveSitesByNumber`, start the Zendesk name enrichment at the same time as `fetchTelemetry` instead of awaiting it after. Saves up to 1 Zendesk call from the critical path on cold loads.  
Complexity: Low (restructure one function). Risk: Low. Money: zero.

**Option C — Investigate and fix TB JWT caching**  
Read `services/tb-client.js`. If it re-authenticates per request, fix it to cache the JWT for its TTL. This is the highest-suspicion hidden cost — if confirmed, it eliminates a full HTTP login round-trip from every cold site load.  
Complexity: Low–Medium (read first, then fix). Risk: Low. Money: zero.

### Tier 2: Client-coordinated, medium complexity

**Option D — Pre-warm cache on search selection**  
When the agent selects a site from search results, the client fires `/resolve` immediately (before the Confirm click). If the agent takes more than a few seconds to click Confirm, the 30 s cache is warm and `/confirm` responds instantly.  
Complexity: Medium (client change). Risk: Low. Money: zero.

**Option E — Progressive response**  
`/confirm` returns `{confirmToken, site: {name, deviceCount}}` immediately (after TB textSearch only), without waiting for device telemetry. A `/workspace` poll delivers the full payload when it's ready. The `/workspace` route already exists.  
Complexity: High (client + server change). Risk: Medium. Money: zero.

### Tier 3: Infrastructure, higher complexity or cost

**Option F — Raise site-cache TTL**  
Increase `LIVE_CACHE_TTL` from 30 s to 2–3 min. Second opens within a shift are free. Risk: device setpoint state can become stale for up to 3 min.  
Complexity: Low (config change). Risk: Medium.

**Option G — TB bulk telemetry batch API**  
Replace N×4 per-device calls with a multi-device batch endpoint if TB exposes one (unconfirmed).  
Complexity: Medium. Risk: Medium. UNRESOLVED.

**Option H — Pre-built estate-wide site index**  
Background Kubernetes CronJob pre-fetches all sites' device inventories on a schedule; `/confirm` reads from the cache.  
Complexity: High. Risk: High. Money: recurring Cosmos RU cost proportional to estate size and refresh cadence (must be bounded before adoption).

---

## Recommendation

**Options A + B + C in a single small PR.**

A and B are trivial server changes with no client impact, no new infrastructure, and no recurring cost. Together they remove the two unnecessary sequential I/O calls from the critical path. C — reading `tb-client.js` and fixing JWT caching if needed — is the single highest-suspicion latency source; it also costs nothing and carries low risk.

If post-deployment timing logs (which should be added alongside A/B/C) show the load is still unacceptable, Option E (progressive response) gives the largest user-facing improvement — the agent can greet the caller within roughly one second — but requires a coordinated client and server change and a separate design gate.

Options D, F, G, H are noted for the roadmap but are not the right first move: D is a client change for a benefit A+B may already address; F carries staleness risk; G depends on unconfirmed TB API research; H is overengineered until A/B/C have been proven insufficient.

---

## Open questions for design

None require external contact (Spencer / Sam / CJ). All are resolvable by reading the source.

1. What is the actual TB per-request timeout? (Read `services/tb-client.js`)
2. Does tb-client.js re-auth per request or cache the JWT? (Same read — confirms or refutes Option C priority)
3. What is the Cosmos SDK timeout for boost-hold queries? (Check `overrides.js` for explicit timeout config)

These should be answered during the design phase before committing to the PR scope.

---

*Investigation by ooh-triage-dashboard-R1-mvp9hmit · 2026-10-26*
