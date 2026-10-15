<!-- gate:contract
SECTION: What this spike found
The site lookup is not slow because of the amount of work it does. When everything answers, the whole locate step takes under one second for every site we tried (0.16 to 0.66 seconds, including a 32-device site). It becomes 15 to 20 seconds because, before the confirm screen can be shown, the dashboard fires one burst of 30 to 100 separate requests at ThingsBoard (three per device). Often a few of those requests (3 to 6 of about 70 in our tests, more on the live pod) are dropped or simply never answered, and hang until a 15-second timeout. We reproduced this from outside the cluster as well, so it is a ThingsBoard-side behaviour under bursts, not just the cluster network. The confirm screen waits for the slowest one, so the handler waits about 15 seconds plus the normal second or so. The live pod log shows this pattern on every lookup made today. One lookup (site 6238) failed outright after 15 seconds.

SECTION: Why it happens
There are three causes. First, the confirm screen asks for live device state (telemetry, online status, attributes) that it does not need: it only shows the site name and a one-line device summary. Second, that state is fetched as one request per device per data type, all at once, over a connection pool with no limit. ThingsBoard intermittently drops or never answers a few requests in such a burst. We reproduced this from this PC as well as seeing it on the live pod. Each one of those hangs for 15 seconds, and one is enough to hold the whole screen. The exact mechanism on the ThingsBoard side is not yet proven. Third, the same full burst runs again when the handler presses Confirm (the 30-second cache has usually expired by then), and again every 30 seconds while a site is open. Separately, the ThingsBoard health check throws away the login token and logs in again about every 68 seconds (265 logins in 5 hours). This adds a fresh login to many lookups.

SECTION: What I recommend
Split the lookup into two steps. Locate and confirm uses only the site directory we already hold and one quick device-name query (about 0.1 seconds measured). The heavy live-state read moves to after the handler confirms. Replace the 3-per-device burst with ThingsBoard's single batch query, which returned the full state of a 32-device site in 0.08 seconds. Fix the health check so it no longer forces a re-login, and put a sensible limit and shorter timeout on ThingsBoard connections. Target: the confirm screen appears within 1.5 seconds of picking a site (95th percentile), and the workspace loads within 3 seconds after confirming. None of this adds running cost. It cuts ThingsBoard traffic by more than 95 percent, uses no AI tokens and adds no new background process.

SECTION: Follow-on tickets proposed
Three tickets are proposed, drafted in the body below. Ticket A (small): a fast locate-then-confirm path, plus the health-check login fix and a connection limit. This one change removes the wait the handler feels. Ticket B (medium): replace the per-device burst with the batch query, so the workspace after confirm is fast and reliable and devices stop showing falsely offline. Ticket C (small): load only the four tickets the workspace shows, in parallel, instead of twelve one after another.

DECISION: Approve Ticket A as the first build, with B straight after, or ask for the alternative ordering in the options table.
-->

# OOHDASH-133 Spike - Site lookup speed findings

Status: spike findings (investigation only, no production change). Branch: spike/oohdash-133-site-lookup-speed. Date: 2026-10-15. Live version investigated: v1.4.1 (main cdf480e).

## 1. Summary (plain English, for James)

- **Where the 20 seconds goes.** Almost all of it is spent waiting for ThingsBoard requests that fail or hang on the live pod. Before the confirm screen appears, the dashboard sends three requests per device, all at once: 39 requests for a 13-device site, 96 for a 32-device site. When ThingsBoard answers every request, these all finish in under 0.7 seconds. But a few requests in a burst are intermittently never answered and hang to the 15,000 ms axios timeout: we reproduced this off-cluster in 2 of 3 runs of a later test (15.9 s and 15.2 s for 6261). On the live pod, today's log shows every lookup hitting a burst of instant connection resets, followed about 15 seconds later by a batch of timeouts (the 15,000 ms axios timeout). The confirm screen cannot appear until the slowest request settles. So the handler waits about 15 seconds of timeout, plus a login, the device search and the browser round trips: roughly 16 to 20 seconds. One lookup (6238) hit the timeout on the device search itself and failed outright.
- **The confirm screen does not need that data.** It shows the site name (from the Zendesk directory we already cache) and a one-line device summary. Live telemetry, online state and attributes are only needed after confirm.
- **The same burst runs again on Confirm.** The per-site cache lasts 30 seconds. A handler who spends more than 30 seconds on the confirm screen (normal on a call) triggers the whole burst again when they press Confirm. It then runs again every 30 seconds while the workspace is open.
- **Recommendation:** locate and confirm from the site directory plus one device-name query (measured at about 0.05 to 0.1 seconds). Load device state after confirm, using ThingsBoard's single batch query (measured at 0.08 seconds for a 32-device site, against 96 separate requests today). Fix the health-check re-login, and limit and shorten TB connections. **Target: the confirm screen appears within 1.5 s (95th percentile) of picking a site. The workspace appears within 3 s of confirm.**
- **Cost and background running:** every option has zero LLM token cost and zero new GBP cost. The recommended options remove load and add no background process. The only scheduled work is the existing 1-hour Zendesk directory refresh, which is server-side and invisible to the operator.

## 2. Current path and timing breakdown

### 2.1 The path, end to end (verified by reading the deployed v1.4.1 source)

1. The handler types in the search box (public/js/app.js bindSearch). A 180 ms debounce then calls GET /api/sites/search?q=.
2. routes/api.js /sites/search calls tb-device.js searchSites. In live mode this filters the Zendesk site directory (zendesk.js siteDirectory, which wraps loadSiteOptions on a 1-hour cache). **No ThingsBoard call is made.** On a cold cache it makes one Zendesk call: field 11405878329244 options, 364 options in a single page.
3. The handler picks a result. public/js/views.js openSite calls GET /api/sites/{siteNo}/resolve. The handler sees "Looking up site ..." until this returns.
4. resolution.resolveSite calls tb-device.getSitesByNumber, which calls fetchLiveSitesByNumber (30 s per-site cache):
   - a. siteQueryTokens: the site-aliases overlay (data/site-aliases.json, read from local disk once and then memoised).
   - b. **In parallel:** one textSearch page for each token, `GET /api/tenant/devices?textSearch=gk-{siteNo}`, plus the OOHDASH-128 supplementary `textSearch=({siteNo}-`. Each runs pages serially in its own loop, but one page covers any real site.
   - c. Each of these first calls needs the read token. On a cold or nulled token, **each concurrent caller logs in separately** (tb-client getToken has no single-flight), so a cold lookup does 2 logins.
   - d. Filter: siteNameFilter (anchored) OR isLegacySalusForSite.
   - e. **fetchTelemetry fan-out, all devices at once:** per device, the latest timeseries, SERVER_SCOPE active and lastActivityTime, CLIENT_SCOPE site and salusLocation, plus SHARED_SCOPE schedules for boilerControl and PowerPause devices. That is 3N+ requests in one Promise.all, with no concurrency limit, on the default Node keep-alive agent (unbounded sockets) and a 15 s timeout each. Each device uses allSettled, so a failure degrades that device to offline instead of failing the lookup. But the lookup still waits for every request to settle or time out.
   - f. resolveSiteName (the Zendesk directory, cached). No call when warm.
5. /resolve returns the name and deviceSummary(site), which counts heating, hot water and kitchen devices. The **confirm gate** is shown.
6. The handler presses Confirm. POST /api/sites/{siteNo}/confirm runs resolution.confirmSite, which **calls resolveSite again**. If more than 30 s have passed since step 4, the full fan-out (4b to 4f) runs again. Then workspacePayload calls zendesk.ticketsForSite, which does a Zendesk search followed by **up to 12 comment fetches one after another**, of which only 4 are used.
7. While the workspace is open, the browser calls GET /workspace every 30 s. Each call runs the full fan-out again, because the 30 s cache has just expired.

Related mechanisms:
- **Health probe (OOHDASH-24, 60 s TTL).** /healthz calls tbStatus. When the probe result is older than 60 s, it fires activeReadProbe, which **sets the shared read token to null and logs in again**. The live pod logged 265 read logins in 5 h, a median of one every 68 s. Any lookup that starts in the window after this pays for a login, and if the token is nulled mid-burst, every concurrent request logs in separately.
- **Bridge /api/devices inventory:** no longer on the path. services/bridge.js is a re-export shim onto tb-device.js, and BRIDGE_BASE_URL is unused on the read path.
- **Single replica (OOHDASH-121):** k8s replicas is 1, with in-memory sessions, confirm tokens, per-site cache and TB token. That is fine for caches. Section 4 covers the constraint.

### 2.2 Network calls before the confirm screen

| Step | Call(s) | Count (6261, 23 devices) | Serial or parallel | Needed for confirm screen? |
|---|---|---|---|---|
| Search | Zendesk ticket_fields options (only when the 1 h cache is cold) | 0 warm, 1 cold | single | Yes (the name index) |
| Resolve: auth | TB POST /api/auth/login (cold token, or after a health-probe null) | 0 to 2 | parallel, duplicated (no single-flight) | Only to authorise the next call |
| Resolve: device list | TB GET /api/tenant/devices textSearch gk-6261 and (6261- | 2 | parallel | Yes (device count and summary) |
| Resolve: state fan-out | TB timeseries + SERVER_SCOPE + CLIENT_SCOPE per device, plus SHARED_SCOPE for boilerControl and PowerPause | 70 | all parallel, unbounded | **No.** Only needed after confirm |
| Resolve: name | Zendesk directory (cached) | 0 | n/a | Yes |

### 2.3 Measured timings, off-cluster (read-only, this workstation to the live TB and Zendesk)

Method: a scratch harness imported the app's own v1.4.1 live read modules (tb-device.js, zendesk.js) from the spike worktree with DATA_MODE=live and WRITES_DISABLED=true. An axios interceptor timed every call and blocked any non-GET other than TB login. Credentials came from the CIR (TB tenant credential, not the pod's own read user; see the open questions). Times are in ms.

| Site (devices) | Run | Total | TB login | Device search (2 calls) | State fan-out (calls, window) | Zendesk |
|---|---|---|---|---|---|---|
| 6261 Wheatstone Inn (23) | cold process | 658 | 2 x ~225 (parallel, duplicated) | 43 to 51 | 70 calls, 289 to 634 | 0 (directory already warm from search) |
| 6261 (23) | warm token, site cache expired | 263 | 0 | 47 to 58 | 70 calls, 62 to 260 | 0 |
| 6261 (23) | within 30 s cache | 0 | 0 | 0 | 0 | 0 |
| 5204 Bramley Farm (13, incl. 6 older bare-salus) | cold token | 624 | 2 x ~310 | 44 | 39 calls, 363 to 621 | 0 |
| 5198 (10, gateway-less, small) | warm token | 161 | 0 | 47 | 30 calls, 49 to 160 | 0 |
| 6855 Rose and Crown (32) | warm token | 447 | 0 | 64 to 75 | 97 calls, 80 to 425 | 0 |
| 6238 Shoulder of Mutton (29) | warm token | 342 | 0 | 51 to 59 | 88 calls, 63 to 338 | 0 |
| Search "6261" | cold directory | 332 | n/a | n/a | n/a | 1 options call, 326 |
| Search "wheat" | warm directory | 4 | n/a | n/a | n/a | 0 |
| Confirm extra: ticketsForSite 6261 | n/a | 2,895 | n/a | n/a | n/a | search 684, then 12 serial comment fetches ~184 each |

Repeat-run check (6261, same process, run about 10 minutes after the runs above): run 1 cold took **15,908 ms** (6 of 70 fan-out requests hung to the 15,000 ms timeout; the rest averaged ~300 ms). Run 2, after 70 s idle with the site cache expired, took **15,226 ms** (3 requests hung). Run 3, after a further 250 s idle, took 424 ms (no failures). So the 15 s hang **reproduces off-cluster and intermittently**. It is not specific to the AKS pod, and not simply the result of reusing idle keep-alive sockets (run 1 used fresh sockets). Any single hung request out of ~70 is enough to hold the confirm screen for 15 s.

### 2.4 Measured timings, production (live pod log, read-only `kubectl logs --timestamps`, pod ooh-dashboard-8687757f9-tw9jj, 2026-10-15 11:19 to 16:27 UTC)

The pod has no request-timing log, so these timings are reconstructed from the TB failure lines that each lookup leaves behind. A burst of instant ECONNRESET errors at the start of each fan-out is followed by a batch of `timeout of 15000ms exceeded` errors 13 to 15 s later. The lookup cannot return until that second batch has settled.

| Lookup (UTC) | Site | Instant resets at start | Timeouts that landed | Gap from start to last timeout | Outcome |
|---|---|---|---|---|---|
| 11:30:46 | unknown | 21 | 18 (2 waves) | ~15 s and ~23 s | slow, devices degraded to offline |
| 16:18:17 | 6855 | 27 | 13 | 15.3 s | slow, 15 of 32 devices with failed reads |
| 16:19:14 | 6855 | 8 | 26 | 15.2 s | slow |
| 16:20:05 | 6855 / 6238 | 6 | 25 | ~15 s | slow. 6238 resolve FAILED: the device search itself timed out, so the handler got an error after 15 s |
| 16:21:43 | unknown | 8 | 5 | ~14 s | slow |
| 16:23:32 | 7992 | 11 | 17 | ~24 s | slow |
| 16:24:05 | unknown | 9 | 9 | ~14 s | slow |
| 16:25:24 | unknown | 2 | 16 | ~15 s | slow |
| 16:26:24 | 6600 | 10 | 11 | ~13 s | slow |

Reconstructed time to show the confirm gate in production (6855, 32 devices):

| Component | Seconds | Source |
|---|---|---|
| Wait for the hung fan-out requests to hit the 15 s axios timeout | ~15.0 | pod log (pairs of bursts above) |
| TB login (often triggered by the 68 s health-probe token null), device search, and resets/retries before the fan-out | ~0.5 to 2 | off-cluster timings plus the 265 logins in 5 h in the pod log |
| Browser to ingress to pod round trips, debounce, rendering | ~0.3 to 1 | UNVERIFIED (SSO-protected, could not be driven) |
| Health-probe re-login colliding with an in-flight burst (every concurrent request logs in separately) | 0 to several | code path (tb-client getToken has no single-flight). Frequency UNVERIFIED |
| **Total felt by the handler** | **~16 to 20** | consistent with the reported ~20 s |

## 3. Root causes

1. **RC1: The confirm gate waits on data it does not show (design).** /resolve runs the full live-state fan-out (fetchTelemetry) before returning, but the confirm gate only uses the site name and a device-kind count. Source: routes/api.js /sites/:siteNo/resolve; tb-device.js fetchLiveSitesByNumber step "Latest telemetry for the matched set".
2. **RC2: An unbounded per-device fan-out fails on the live pod (mechanism).** Three or more requests per device go out simultaneously, with no concurrency cap, on the default keep-alive agent and a 15 s timeout. On the pod this produces instant ECONNRESET and TLS-handshake drops plus 15 s hangs on every lookup logged today. From the workstation it is intermittent: 7 lookups were clean, then 2 of 3 later lookups had 3 to 6 requests hang to 15 s. Because it reproduces off-cluster, the hang is at least partly **ThingsBoard-side behaviour under a burst** (for example a front-end connection or rate limit, or request queueing on the TB server). The pod sees it worse, probably because it adds the 30 s refresh load and resets on its pooled sockets. The exact mechanism is **UNVERIFIED**. With an all-or-nothing wait over ~70 requests and a 15 s timeout, one dropped request costs the handler 15 s. Either way, the fix is the same: far fewer requests and a bounded pool.
3. **RC3: The same work is repeated on Confirm and on every 30 s refresh.** confirmSite calls resolveSite again, and the 30 s cache has normally expired after a real conversation. The workspace refresh re-runs the full fan-out every 30 s per open workspace, which keeps the TB connection pool under constant load. Source: services/resolution.js confirmSite; public/js/views.js scheduleWorkspaceRefresh.
4. **RC4: The health probe forces a re-login about every 68 s, and logins are not single-flight.** activeReadProbe sets token to null, then logs in. getToken does not dedupe concurrent callers. The result is 265 read logins in 5 h on the pod, and an extra login (225 to 310 ms measured) on many lookups. Source: services/tb-client.js tbSession.activeReadProbe and getToken.
5. **Contributing (post-confirm only): serial comment fetches.** ticketsForSite fetches comments for up to 12 tickets one after another (2.2 s for 6261), then uses only 4. Source: services/zendesk.js callbackLookup.
6. **Not a cause:** the search box itself (0.004 s warm, 0.33 s cold), the site-aliases overlay (local file, memoised), the OOHDASH-128 supplementary "(siteNo-" search (it already runs in parallel, ~45 ms), and the bridge /api/devices call (no longer on the path).

Side observations (outside the speed scope, noted for the backlog):
- When a state read fails, the device is set to hard offline (fail-safe). On the pod that means many devices **wrongly shown offline** after each storm: 15 of 32 at 6855 at 16:18. Fixing RC2 also fixes this data-quality problem.
- Zendesk has a duplicate option for 5204, so search shows two hits and the name resolves as unverified ("gk-5204").
- The search index is only the 364 Zendesk site options. A TB site with no Zendesk option cannot be found by number.

## 4. Options comparison

Every option below has an LLM token cost of zero (no model is involved) and no new GBP subscription. Effort sizes are S (up to 1 day), M (2 to 4 days) and L (a week or more), including tests.

| ID | Option | Expected time to confirm screen (P95, prod) | Effort | Running cost and idle cost | Silent background? | Data staleness at confirm | Key risks |
|---|---|---|---|---|---|---|---|
| O1 | **Locate-then-confirm split.** /resolve returns the Zendesk-directory name plus a device list from the device-name search only (no state fan-out). The confirm gate shows name, number and a device count or name-based summary. /confirm issues the token from that lite resolution. The workspace state loads after confirm. | **~0.5 to 1.5 s** (device search measured at 45 to 75 ms, plus login when cold, plus round trips) | S to M | Removes about 95% of TB calls from the lookup. Idle cost zero. | n/a, nothing added | Name: up to 1 h (existing directory cache). Device list: live | The device summary must come from names, not telemetry (it can differ from the capability-first classification for no-telemetry devices). Mitigation: show "N Lighthouse devices" plus name-based kinds, with full detail in the workspace. The F004 resolution rules (0 / 1 / >1 matches) must be preserved on the lite path. The 2 device-search calls can still hang (6238 did on live), so O1 needs O3's short timeout and retry to hold its P95. |
| O2 | **Batch state read.** Replace the 3N per-device requests with TB POST /api/entitiesQuery/find (one read-only query per site, returning latest attributes and timeseries for every device), plus one entityList query for the OOHDASH-128 older Salus devices. | Alone: ~1 to 2 s (removes the storm, keeps state before confirm). With O1: makes the **workspace after confirm ~1 to 3 s** | M | 2 to 3 TB calls per lookup instead of 30 to 100. Idle cost zero. | n/a | Live | The query needs an explicit timeseries key list (today all keys are read). A missed key changes classification, so tests must pin it. SHARED_SCOPE schedule keys must be included. Measured: 6261 with 23 rows in 98 ms, 6855 with 32 rows in 84 ms. |
| O3 | **Connection hygiene.** A dedicated https.Agent for TB (maxSockets ~8, keep-alive with a short free-socket timeout), a 4 to 5 s per-call timeout, and one retry on ECONNRESET. | Alone: ~3 to 6 s (the storm still happens, but bounded). Best as a safety net under O1 and O2 | S | None | n/a | Live | Treats the symptom. The network root cause is unproven, so the gain is uncertain. |
| O4 | **Health-probe and token fix.** The probe re-proves the credential with a cheap authenticated GET using the current token, and only logs in again on a 401. getToken becomes single-flight. | Saves 0.2 to 0.3 s on most lookups and removes the login stampede | S | Cuts TB logins from ~1 per 68 s to ~1 per 2 h. Idle cost lower than today. | Yes. It stays the existing /healthz-driven check, server-side and invisible to the operator | n/a | Must keep the OOHDASH-24 tri-state semantics: a dead credential must still go red within the TTL. |
| O5 | **Pre-built site index.** An in-memory index of number, name, postcode and brand, warmed at boot and refreshed in the background (stale-while-revalidate) from the Zendesk directory, optionally enriched by a scheduled TB estate scan of device names. | Search is already 4 ms warm and 330 ms cold. The gain is only the first search after each hourly expiry (~0.3 s) | S (warm and refresh existing directory). L (a TB estate scan index) | Zendesk: 1 call per hour (existing). TB estate scan: ~60 page calls per refresh, which scales with the estate | Yes, server-side timer only, no operator-visible process | Up to the refresh interval | **Anti-reinvention:** the index already exists (zendesk.siteDirectory, 1 h cache). Extend it, do not build a parallel one. A TB device-name index would duplicate O1's per-lookup device search for almost no gain. Postcode is not in the Zendesk option, so a new source would be needed. |
| O6 | **Search-as-you-type** | No change | none | none | n/a | n/a | Already exists (180 ms debounce, keyboard navigation). No work needed. |
| O7 | **Stop re-resolving on Confirm and refresh.** Confirm reuses the resolution from /resolve. The 30 s refresh becomes state-only (using O2) instead of re-running the search and the fan-out. | Confirm click drops from about another 15 s to under 1 s | S (part of O1 and O2) | Reduces steady TB load per open workspace | n/a | Live | The F004 duplicate check must still run at confirm. The lite device search is cheap enough to re-run. |
| O8 | **Tickets panel trim.** Fetch comments for only the 4 tickets shown, in parallel. | No change to the confirm screen. Workspace ~2 s faster | S | Fewer Zendesk calls | n/a | Live | None significant |

Single-replica and in-memory constraint (OOHDASH-121): every option keeps state in process memory (the directory cache, per-site cache, TB token). At replicas:1 this is correct. If the deployment is ever scaled out, each pod warms its own caches. That is acceptable, because the caches are performance-only and not correctness state. The confirm-token map in resolution.js stays the real scale-out blocker, and that is already tracked by OOHDASH-121, not here.

## 5. Recommendation and target

Recommended: **O1 + O4 + O3 (as one small ticket), then O2 + O7, then O8.**

- **Target time to confirm:** the confirm gate is visible **at most 1.5 s (P95) after the handler picks a site**, and at most 2 s from typing the last digit. The workspace (live device state) is visible **at most 3 s (P95) after Confirm**. Today these are about 16 to 20 s and about 15 to 20 s.
- **Why this order:** O1 alone takes the TB fan-out off the critical path of the phone call, so the handler stops waiting even before the storm's network cause is understood. O4 and O3 are cheap and remove the login stampede and the 15 s worst case. O2 then fixes the workspace and the false-offline devices at source, by sending about 3 requests instead of about 100.
- **Cost and silent running:** no LLM tokens, no new GBP. TB request volume per lookup drops from 30 to 100 to 3 to 5, and TB logins drop by about 98%. Nothing new runs in the background. The only scheduled work is the existing 1 h Zendesk directory refresh, which is server-side, makes no operator-visible process, window or notification, and costs one HTTPS call per hour.
- **Proving it is in effect (do not repeat "Live means merged"):** each ticket's acceptance includes a measurement taken **on the live pod after deploy**, not just from tests. The proof is a timing log line per lookup (see the tickets below) read from `kubectl logs`, and the absence of the reset/timeout burst pattern across a shift.

## 6. Suggested follow-on tickets (text only, not created)

### Ticket A - [OOHDASH] Fast locate-then-confirm: show the confirm screen without loading live device state

**Problem.** The confirm screen takes about 15 to 20 s on live, because /resolve waits for a 3-per-device ThingsBoard read the screen does not use. The handler is on the phone during this wait.

**Scope.**
- /resolve returns the site from the device-name search and the Zendesk directory only.
- /confirm reuses the same lite resolution, with the F004 0/1/>1 rule intact.
- The live state loads after confirm.
- The health probe stops nulling the token, and getToken becomes single-flight.
- A bounded TB agent with a 5 s timeout and one retry on reset.
- One structured timing log line per lookup (site, devices, ms per step).

**Out of scope.** The batch query (Ticket B). Search UI changes.

**Acceptance criteria.**
- AC1 - Given a handler has picked a site from search on live, when the site exists uniquely, then the confirm screen with site name and number is shown within 1.5 s at the 95th percentile, measured from the pod's lookup timing log over at least 20 live lookups.
- AC2 - Given a house number matching more than one site, when it is looked up, then the ambiguous screen is shown and confirmation is refused, exactly as today.
- AC3 - Given a house number with no devices, when it is looked up, then "No site found" is shown, exactly as today.
- AC4 - Given the handler has confirmed the site, when the workspace loads, then live device state is shown and no device write can be sent until that state has loaded.
- AC5 - Given the dashboard has been running for 1 hour, when the pod log is read, then read logins number no more than 2, and a revoked read credential still turns /healthz read state unhealthy within the health TTL.
- AC6 - Given 10 live lookups after deploy, when the pod log is read, then no lookup shows a 15000 ms timeout on the path to the confirm screen.

**Running cost.** Zero tokens, zero GBP, nothing new in the background.

### Ticket B - [OOHDASH] Read site device state in one ThingsBoard batch query instead of 3 requests per device

**Problem.** The workspace and its 30 s refresh fire 30 to 100 simultaneous TB requests. On live these produce connection resets and 15 s timeouts, so the workspace is slow and devices are wrongly shown offline.

**Scope.**
- Replace fetchTelemetry with POST /api/entitiesQuery/find (read-only query), using explicit server, client and shared attribute keys and the timeseries keys used by mapTelemetry and classifyDevice.
- One entityList query for the OOHDASH-128 older Salus devices.
- The 30 s refresh reuses the confirmed device list.

**Acceptance criteria.**
- AC1 - Given a confirmed site of up to 40 devices on live, when the workspace loads, then it appears within 3 s of Confirm at the 95th percentile, and the pod log shows no more than 5 TB requests for that load.
- AC2 - Given the same site read by the old path and the new path in a parity test, when the outputs are compared, then every device has the same kind, deviceType, online state, area and boilerControl result.
- AC3 - Given a full OOH shift on live after deploy, when the pod log is read, then there are no ECONNRESET or 15000 ms timeout bursts on TB reads, and no device is shown offline because a read failed.
- AC4 - Given the batch query fails, when the workspace loads, then the dashboard shows the degraded banner and capture-and-escalate, as today.

**Running cost.** Zero tokens, zero GBP. TB load drops by about 95%.

### Ticket C - [OOHDASH] Load only the four tickets the workspace shows, in parallel

**Acceptance criteria.**
- AC1 - Given a site with 12 recent tickets, when the workspace loads, then comments are fetched for no more than 4 tickets, in parallel.
- AC2 - Given the same site, when the tickets panel renders, then it shows the same 4 tickets and timelines as today.

## 7. Open questions

1. **Root cause of the dropped and hung TB requests (UNVERIFIED).** The hang reproduced off-cluster, so the prime suspect is a connection or rate limit, or request queueing, at portal.lhlive.co.uk under bursts. The pod's extra ECONNRESETs may also involve AKS outbound or idle-socket drops. Owner: the IoT/TB platform owner (TB rate-limit and proxy configuration). Spencer owns AKS egress. The recommendation does not depend on the answer, but other TB consumers that fan out (iot-hub, integration-bridge) may be affected the same way.
2. **The pod's TB read user.** The pod uses its own TB_USERNAME, held in the k8s secret, which James cannot read. Does that user have a stricter TB rate-limit profile than the tenant credential measured here? Owner: Spencer.
3. **The confirm-screen device summary.** Is a name-based summary ("On Lighthouse: 3 heating zones, kitchen circuits") acceptable before confirm, or should the confirm screen show only name, number and device count? Owner: James / the CX lens at Design.
4. **Browser-side timing (UNVERIFIED).** The live UI is behind B2C SSO and was not driven in this spike. The browser and ingress share is estimated, not measured. Ticket A's timing log closes this gap.
5. **Directory gaps.** The 5204 duplicate Zendesk option, and TB sites with no Zendesk option, cannot be found by number. Is this a separate data-quality ticket? Owner: James.
