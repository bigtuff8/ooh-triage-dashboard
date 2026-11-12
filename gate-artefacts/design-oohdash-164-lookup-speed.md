<!-- gate:contract
TICKET: OOHDASH-164
PHASE: design

SECTION: What this design does
Picking a site on the live dashboard (v1.7.3) takes 15.2 to 15.4 seconds before the confirm screen appears, and on every cold lookup 20 to 43 devices are wrongly shown as offline. Both come from one cause: opening a site fires about 90 ThingsBoard reads at once, and something between the AKS pod and ThingsBoard drops or stalls a burst that size (Spencer Thompson, 11 November). This design replaces the burst with one bulk read per site, shows the confirm screen the moment the handler picks a search result, and shows an unreadable device as "Data unavailable" instead of offline. It ships in three stages. Stage 0 adds timing measurement and lands first as its own commit. Stage 1 is nine fixes (Q1 to Q9) shipped as one release. Stage 2 is the progressive site page; it is designed here and built later. The discovery gate decisions D1 to D4 (PR 198) are applied as written and are not reopened.

SECTION: Targets this design must hit (from discovery R1 to R10)
Time from picking a search result to a usable confirm screen: under 500 ms at p95 (today about 15.2 s). Time from picking to devices painted on the site page: under 2 s at p95 for large sites. Search: under 300 ms, and under 50 ms once the client-side index (Q8) is in. Confirm fires exactly once however many times it is clicked. One search row per site. A failed device read shows "Data unavailable" and never "offline". Control stays locked until the site is confirmed and its devices are read. Every release records measured before and after p95 figures from Stage 0.

SECTION: Stage 0 — measure first (separate commit, lands before Stage 1)
Browser marks with performance.mark and performance.measure at six points: search-submit, search-result, confirm-screen-paint, device-read-start, device-read-complete, and workspace-ready. These give three measures: T-search (search-submit to search-result), T-gate (pick to confirm-screen-paint with the button enabled) and T-site (pick to workspace-ready). The browser posts each finished lookup's measures once to a new authenticated route, POST /api/ux-timing, using navigator.sendBeacon. The route only writes one log line, for example [UX] site=6803 t-search=41 t-gate=15230 t-site=16410 build=v1.7.4, and it accepts numbers only (no free text, no customer data). The server adds a Server-Timing response header on /resolve, /confirm and /workspace, with one entry per stage (tb-inventory, tb-read, zendesk, cosmos and total). The existing [SITE] log lines stay. A small read-only script in scripts/ parses the [UX] lines from kubectl logs and prints p50 and p95 per measure. That script produces the numbers quoted in every release record.

SECTION: Q1 — one bulk ThingsBoard read per site, with automatic fallback (D4)
Inventory is unchanged: the two text searches (about 50 to 90 ms each) still find the site's devices, and the existing name filter still picks which ones belong. The roughly 90 per-device reads are replaced by one POST /api/entitiesQuery/find for each 100 devices (every live site so far is under 50, so this is one call). Its entityFilter is an entityList of the matched device ids. Its latestValues list is fixed and written out in the code: TIME_SERIES keys, SERVER_ATTRIBUTE active and lastActivityTime, the CLIENT_ATTRIBUTE keys and the SHARED_ATTRIBUTE schedule keys (the full list is in its own section). The call goes through the existing read session, so it uses the same svc-read credential and auth header the pod uses today: X-Authorization: ApiKey. The brief described the header as a Bearer JWT; the session decides this, not this code. A new adapter, latestToBag, turns each returned row into exactly the per-device shape fetchTelemetry builds today: flat telemetry keys plus __active, __lastActivityTime, __telemLastSeenMs, __clientScope, and __sharedScope (only for boilerControl and PowerPause, otherwise null). Everything after the read is unchanged: mapTbDevice, the freshness rule, the area rules and the boiler decoders. The rare V1 output4Override history read stays per device, because it needs a time range.

SECTION: Q1 — how the adapter keeps today's behaviour exactly
Three differences between the bulk response and the per-device responses must be absorbed by the adapter. Each one is covered by a parity unit test. First, a key the device has never reported comes back as ts 0 with an empty value. The adapter drops these, because several decoders test whether a key is present, not what its value is (V1 zone-configured falls back to the presence of output2State and output3State, and V2 checks the CHZ telemetry keys). Second, the bulk query returns values as strings. The adapter restores the per-device types: "true" and "false" for attributes become booleans, numeric attribute strings become numbers, and schedule and mask values starting with a bracket or brace are JSON-parsed. Telemetry stays as strings, as the per-device timeseries call already returns them. Proof b confirms this string behaviour on live devices before build; if proof b shows typed values, the coercion becomes a no-op. Third, today's timeseries call asks for all keys, so __telemLastSeenMs and hasReported are worked out over every key a device has. The bulk read only returns the listed keys. A device that only reports a key outside the list would get an older last-seen time, or hasReported false. The live parity run (below) measures whether this happens on 10 or more real sites. If it does, the missing keys are added to the list before build.

SECTION: Q1 — when the fallback runs
The design does not wait for Spencer's in-cluster proof (D4). Any of these sends the read down today's per-device path, now with the Q2 limits applied. One: the bulk call errors or times out after its retries; every device falls back. Two: the bulk call succeeds but returns no rows while devices were matched; every device falls back. Three: some matched devices are missing from the rows; only those devices fall back. Four: the bulk call returns 403 or 404, meaning the endpoint or key is refused; every device falls back, and the bulk path is switched off for 10 minutes, so each lookup does not pay for a refused call first. Every fallback logs one line naming the reason and device count, for example [TB] bulk read fallback site=6803 reason=error devices=31. A new admin switch, "Bulk device read off", sits beside the existing "Tuya read off" in killswitch.js (Cosmos flag OohTbBatchReadOff). It forces the per-device path without a redeploy or an environment change, so turning it off never depends on Spencer.

SECTION: Q2 — shorter timeout, retry, and a cap on calls in flight
These limits apply to the read session only (inventory, bulk read, fallback per-device reads). The write session stays exactly as it is today: 15 s timeout and no retry, because repeating a control write is not safe. Read timeout: 3 s per attempt, down from 15 s. Retry: up to 2 retries, after about 200 ms and then about 400 ms with random jitter. Retries happen only on connection reset, timeout, 429, 502, 503 or 504, never on other 4xx. The bulk POST is a read-only query, so retrying it is safe. Concurrency: at most 10 read calls in flight across the whole pod, enforced by a small queue inside tb-client.js. This is about 20 lines, so no new dependency is needed. Because the cap is shared, two handlers opening sites at the same moment also stay under it. Site deadline: a site's device read stops waiting after 5 s. Any device without a result by then shows "Data unavailable". Without this deadline, a run of worst-case retries could take about 9.6 s.

SECTION: Q3 — the confirm screen appears straight from the search hit
When the handler picks a result, the browser draws the confirm screen at once from what the search row already holds: site name, site number and brand. The device line reads "Checking the Lighthouse equipment at this site…" and the main button is disabled, reading "Checking site…". At the same moment the browser calls GET /resolve. On the server, resolve becomes a slim step: it runs only the inventory search (about 100 ms), answers resolved, none or ambiguous, and starts the full device read in the background without waiting for it. When resolve answers resolved, the button changes to "✓ This is the right site". F004 is unchanged: the button can never be pressed before the server has confirmed the site is unique. None and ambiguous behave exactly as today. The browser then calls a new GET /sites/:siteNo/summary, which waits on the background read already in flight (no new ThingsBoard calls) and fills in the device line, for example "On Lighthouse: 2 heating zones · hot water · 3 kitchen circuits". If every device read fails, the line reads "We couldn't read the Lighthouse equipment just now. You can still confirm the site." D1 is applied: the confirm screen stays a separate screen.

SECTION: Q4 — confirm busy state and one confirm only
In the browser, the first click on "✓ This is the right site" disables both buttons, and the main button shows a spinner reading "Opening site…" until the confirm request settles. Later clicks do nothing. On the server, resolution.confirmSite keeps a 10-second record keyed on operator and site number. A repeat POST /confirm inside that window, whether in flight or finished, gets the same confirm token and call id, so no second call record is created. This sits alongside the existing sameOperatorResume check and does not replace it.

SECTION: Q5 — one search row per site
searchSites groups directory entries by site number before applying the 12-row cap, so a duplicate can no longer push a real site off the list. When every entry for a number has the same name, the result is one plain row. When the names differ, the site number is genuinely ambiguous, so the row keeps the existing amber "duplicate ID" tag and the resolution gate handles it as today. The route keeps working out duplicate, but from the number of distinct names, not the number of rows.

SECTION: Q6 — Zendesk and Cosmos run alongside the device read
Today confirm reads the devices, then starts the Zendesk tickets and Cosmos holds. The fixed version starts tickets and holds in the background from slim resolve, at the same moment as the device read. Confirm then waits on all three, which are already in flight. Inside zendesk.callbackLookup, the per-ticket comment fetch is currently a serial await in a loop over up to 12 tickets. It becomes parallel, capped at 4 at a time. This speeds up both the site page and the Callback view, and changes neither output.

SECTION: Q7 — confirm reuses the read already running
tb-device.js keeps an in-flight map from site number to the promise of its read, alongside the existing per-site cache. resolve, summary, confirm and workspace all ask for a site the same way: from the cache if fresh, otherwise by joining the in-flight read, and only otherwise by starting a new one. A pick followed by a confirm therefore costs one device read, not two. The in-flight entry is removed when the read settles. A failed read is never cached, so the next request retries. Control dispatch keeps its own fresh read and does not use this map, so control never acts on cached state.

SECTION: Q8 — site search runs in the browser
A new GET /api/sites/index returns the de-duplicated site directory as site number, name and brand: about 360 sites and a few kilobytes. It is served from the existing 1-hour Zendesk directory cache, with no new calls. The browser fetches it once when the page loads. Search then filters in memory, with the same rules as the server (number starts-with, name contains, 12-row cap), so it typically completes in under 50 ms. The 180 ms keystroke debounce stays. If the index fetch fails, search uses the server route as today. This also covers the Callback search box.

SECTION: Q9 — Cosmos returns only this site's holds
overrides.activeBoostHoldsForSite currently reads the whole ooh partition and filters it in JavaScript. A new store.querySql(sql, params) runs SELECT * FROM c WHERE c.storePartition = @p AND c.status = 'active' AND c.deviceType = 'boiler-panel' AND (c.siteNo = @s OR c.siteNo = @n). The site number is passed both as a string and as a number, because older documents store it either way and the current JavaScript filter treats both as equal. The in-memory store used by fixtures and tests gets a matching querySql that filters with the same predicate, so tests are unaffected. The output and sort order do not change.

SECTION: Unreadable devices show "Data unavailable" (D2)
The failure rule changes. Today a failed SERVER_SCOPE read sets active false and last-activity null, and the freshness rule then forces the device offline straight away. In the fixed version, a device whose liveness read fails (bulk row missing and fallback failed, or the 5 s deadline passed) gets readOk false. Its debounce record is left untouched. online stays false, so every control gate (control.js, oneoffs.js, the switch and scope checks) still refuses to act on it: unknown never unlocks control. What changes is what the handler is told. The workspace gains anyUnknown, alongside anyOffline. anyOffline now counts only devices that were read and found offline. The scope level for a group whose devices are all unreadable becomes 'unknown', shown as a grey "Data unavailable" tag. A grey notice reads: "We couldn't read some Lighthouse equipment just now. It may be working — we just can't see it. The page will try again in 30 seconds." The red offline banner still shows separately when a device is genuinely offline. In the flows, every place that today reads !d.online as "not connecting" checks readOk first (the full list is in the body table). For an unreadable heating zone the line reads "We can't read the thermostat in this area right now, so we can't check or change it from here." The flow then takes the same log-it-for-IoT path as offline, and the ticket note reads "Thermostat data unavailable at time of call (read failed) — not confirmed offline", so the IoT team do not chase a comms fault that does not exist.

SECTION: Cache time
The site cache stays at 30 s, the same as the browser's 30-second workspace refresh. Spencer suggested raising it, because at 30 s every refresh re-fired the 90-call burst. With Q1 a refresh costs about 3 calls, so that reason is gone. Raising it would also change the timing of the offline anti-flicker rule, which assumes one read per refresh. See DECISION on cache time.

SECTION: Option A for cache time — keep 30 s (recommended)
Each 30-second refresh does one cheap bulk read (about 3 calls), so the handler always sees data at most about 30 s old. The anti-flicker rule (offline only after two consecutive stale reads) keeps its current meaning. No change.

SECTION: Option B for cache time — raise to 60 s, as Spencer suggested
Half as many ThingsBoard calls from refreshes. Every other refresh shows cached data up to 60 s old, and the anti-flicker rule then takes up to two minutes to assert offline, not one. The rule's comment and its test would need rewriting.

SECTION: Stage 2 — progressive site page (design now, build later)
D1 holds: the confirm screen stays separate. After confirm, POST /confirm returns the token, call id and site header straight away. Three panels then load in parallel from GET /sites/:siteNo/panel/devices, /panel/tickets and /panel/holds. Each panel has four states: loading (skeleton), ready, empty ("No open tickets for this site"), and failed ("We couldn't load tickets just now — try again", with a retry link). Flows and control buttons stay locked until the devices panel is ready (R7). Locked buttons say "Waiting for equipment readings…". The 30-second refresh becomes stale-while-revalidate: the page shows the last reading with its as-of time (R9) while one bulk read runs. Control dispatch always reads fresh. Stage 2 closes OOHDASH-156 as a duplicate and makes OOHDASH-158 the Stage 2 build ticket, superseding PR 185 (D3). The tickets are closed and the PR is superseded only after this design gate merges, not before. Stage 2 gets its own build gate.

SECTION: Proofs still open before the build gate
Proof a (the bulk endpoint is allowed under the svc-read key) and proof b (every key comes back) are still pending; James deferred them to before the build gate. Two changes come out of this design. First, the key list in the discovery proof script is incomplete: the boiler heating decoders also read about 20 telemetry keys it does not request (listed in the next section). The proof script must be re-run with the full list. Second, the proof must record whether attribute values come back typed or as strings, and confirm that keys a device has never reported come back with ts 0. Proof c (the bulk call from inside the cluster) stays deduced. The D4 fallback covers it: if the bulk call fails from the pod, the dashboard behaves as today but with Q2 limits, which alone ends the 15 s hangs. Before Stage 1 goes live, a read-only parity script runs on 10 or more live sites from outside the cluster. It compares bulk and per-device output for every mapped device field, and any difference blocks the release.

SECTION: Full key list for the bulk read
TIME_SERIES: temperature, localTemperature, temperatureC, heatingSetpoint, setPoint, setpoint, setpointC, mode, heatingActive, coolingActive, hotWater, hwBoostHours, roomSensor1Temp, roomSensor2Temp, output1State, output2State, output3State, output2Override, output3Override, output2FallbackEnabled, output3FallbackEnabled, output4Override, summerModeActive, summer_mode, switch_1, switch, switchOn, DHW.override, boiler.enable_output_state, CHZ1.output_state, CHZ2.output_state, CHZ1.override, CHZ2.override, CHZ1.room_temp, CHZ2.room_temp, CHZ1.fallback_enabled, CHZ2.fallback_enabled. SERVER_ATTRIBUTE: active, lastActivityTime. CLIENT_ATTRIBUTE: site, salusLocation, DHW.use_boiler, heating_scenario, CHZ1.enabled, CHZ2.enabled. SHARED_ATTRIBUTE: output1OutputMask, output1Schedule, output2Schedule, output3Schedule, output4Schedule, CHZ1.schedule, CHZ2.schedule, DHW.schedule, schedules. The list lives in one constant in tb-device.js. A unit test scans tb-device.js for every telemetry key the decoders read and fails if one is missing from the constant. That stops a future decoder change from silently breaking the bulk read.

SECTION: Tests that prove it
Unit tests, written to fail on today's code first. Bulk adapter parity: canned per-device responses and the matching bulk response give deep-equal mapTbDevice output and boiler decode for V1, V2, PowerPause, Salus and switch devices. Fallback: error, empty, partial and 403 each take the right path, and 403 holds the bulk path off for 10 minutes. Limiter: never more than 10 read calls in flight. Retry: retries only on the listed errors, and writes are never retried and keep 15 s. Unknown state: a failed read gives readOk false, leaves the debounce record untouched, keeps the device out of anyOffline and puts it in anyUnknown, shows the grey tag, and still refuses control. Confirm: five rapid POSTs create one call record and one token. Search: one row per site, duplicate ID only when names differ. Cosmos: the SQL query matches a site number stored as a string and as a number. Key-list guard: as described above. A golden screen-text test pins every new line of wording. The Playwright e2e suite runs in fixture mode, so it never reaches the bulk path and needs no change beyond the new wording. Live checks after release: 20 or more real lookups from Stage 0 logs, p95 T-gate under 500 ms and T-site under 2 s, quoted in the release record with the image tag on the pod.

SECTION: Risks
The bulk read misses a key and changes a device's class, area or zone state: covered by the full key list, the key-list guard test, and the live parity run that blocks release. The bulk call is refused or slow inside the cluster: covered by the D4 fallback, the 403 hold-off and the admin switch. The 3 s timeout cuts off a slow but healthy device: the slowest reading seen from outside was 1.19 s, there are two retries, and a miss shows "Data unavailable", not offline. Handlers misread "Data unavailable": it is grey, plain-worded, sits apart from the red offline banner, and the flow wording says what it means. Too many handlers at once: the pod-wide cap of 10 queues them rather than bursting. Stage 0 timing route abuse: authenticated, numbers only, and covered by the existing rate limiter. The 24-hour key-lifetime risk stays with OOHDASH-161.

SECTION: Stage 0 release — Option A, ship it alone first (recommended)
Stage 0 ships as its own patch release (v1.7.4) and collects 20 or more real lookups from the live pod. That gives a true browser-side before baseline for T-gate and T-site. Stage 1 then ships as v1.8.0 against that baseline. This costs one extra small release and a day or two of waiting for real lookups.

SECTION: Stage 0 release — Option B, ship Stage 0 and Stage 1 together
One release. The before figure comes from the existing server-side [SITE] log lines (resolve total 15.2 to 15.4 s), not from browser marks. This is faster, but the before and after numbers are measured differently, which is the gap discovery said let OOHDASH-148 be called done without a real effect.

SECTION: What James is asked to approve
The Stage 1 design (Q1 to Q9) with fallback, "Data unavailable" display, Stage 0 measurement and the Stage 2 outline. Two choices: cache time, and whether Stage 0 ships alone. The prototype showing every new screen state is linked in the body (Prototype section). After approval: James runs proofs a and b with the corrected key list before the build gate. The build then goes to a fresh harness session.

DECISION: How long should the site cache hold device readings? | A: Keep 30 s, the same as the refresh (recommended) | B: Raise to 60 s, as Spencer suggested

DECISION: Should Stage 0 (measurement) ship as its own release before Stage 1? | A: Yes, ship it alone first and collect a real browser baseline (recommended) | B: No, ship Stage 0 and Stage 1 together, using the server log baseline

DECISION: Approve this design and move to build planning? | A: Approve — proceed to build plan once proofs a and b pass (recommended) | B: Changes requested
-->

# Design: OOH dashboard site lookup speed (OOHDASH-164)

Project ooh-triage-dashboard, repo bigtuff8/ooh-triage-dashboard, base main at 5f35545 (live v1.7.3). Date 2026-11-12. Follows the discovery gate, PR 198 (artefact discovery-oohdash-lookup-speed-r2.md), and applies its decisions D1 to D4 as binding. When this gate merges, it supersedes the OOHDASH-158 design PR 185. OOHDASH-156 and OOHDASH-158 close as subsumed only after this gate merges.

## Prototype

Real-screen prototype of every new screen state (search rows, confirm screen while checking, ready, opening and read-failed, the "Data unavailable" tag and notice, and the unreadable-thermostat flow line). It was built on the app's own rendered pages in fixture mode:

PROTOTYPE_LINK

## 1. Decisions carried in from discovery

| Ref | Decision (James, PR 198) | Where this design applies it |
|---|---|---|
| D1 | Keep the confirm screen separate | Q3 makes it instant; Stage 2 keeps it as its own screen |
| D2 | Failed reads show as "Data unavailable", greyed | readOk flag, grey tag and notice, flow wording (section 5) |
| D3 | Close 156 as a duplicate of 158; supersede PR 185 | Stage 2 outline; closures happen after this gate merges |
| D4 | Design before the in-cluster proof, with automatic fallback | Q1 fallback rules, 403 hold-off, admin switch |

## 2. Corrections to the brief and the discovery

| Item | Brief or discovery said | Code shows (main 5f35545) | Effect on design |
|---|---|---|---|
| Live version | v1.7.2, image 828b93c | v1.7.3 (write path moved to API key, PR 199) | None on the read path; base is 5f35545 |
| Bulk read auth | X-Authorization: Bearer JWT | The read session sends X-Authorization: ApiKey (svc-read key) | The bulk call goes through readSession.request, so it inherits whatever auth the session uses |
| Proof b key list | 19 telemetry keys | Boiler heating decoders also read output2State, output3State, output2Override, output3Override, output2FallbackEnabled, output3FallbackEnabled, roomSensor2Temp, summerModeActive, summer_mode, boiler.enable_output_state and eight CHZ1 and CHZ2 telemetry keys | Full list in the header; proof script must be re-run with it |
| Key presence | Not covered | V1 and V2 zone-configured checks test whether a key is present | The adapter drops never-reported keys (ts 0) |
| Zendesk comments | "Run in parallel with device read" | callbackLookup also fetches comments serially, one ticket at a time | Q6 also parallelises the per-ticket comments (cap 4) |
| Search duplicates | "De-duplicate by site number" | The route deliberately surfaces duplicate site numbers for the resolution gate | De-duplicate same-name rows only; different names keep the "duplicate ID" tag |

## 3. Where each change lands

| Fix | Files | Change |
|---|---|---|
| Stage 0 | public/js/app.js, public/js/views.js, routes/api.js, scripts/ux-timing-report.mjs | Six marks, beacon to POST /api/ux-timing, Server-Timing on resolve, confirm and workspace, log parser |
| Q1 | services/tb-device.js, services/tb-client.js, services/killswitch.js | fetchLatestBulk, latestToBag adapter, BULK_LATEST_KEYS constant, fallback rules, 403 hold-off, OohTbBatchReadOff switch |
| Q2 | services/tb-client.js | Read session only: 3 s timeout, 2 retries with jitter, pod-wide cap of 10, 5 s site deadline in tb-device.js |
| Q3 | routes/api.js, services/resolution.js, public/js/views.js | Slim resolve, background read, GET /sites/:siteNo/summary, confirm screen drawn from the search hit |
| Q4 | public/js/views.js, services/resolution.js | Busy button, re-entry guard, 10 s idempotent confirm |
| Q5 | services/tb-device.js (searchSites), routes/api.js | Group by site number before the 12 cap; duplicate means distinct names |
| Q6 | routes/api.js, services/zendesk.js | Tickets and holds start at resolve; per-ticket comments in parallel, cap 4 |
| Q7 | services/tb-device.js | In-flight map beside perSiteCache; failed reads never cached |
| Q8 | routes/api.js, public/js/app.js | GET /api/sites/index; in-memory search with server fallback |
| Q9 | services/store.js, services/overrides.js | querySql in Cosmos and memory stores; SQL filter on site number as string or number |
| D2 | services/tb-device.js, routes/api.js, public/js/views.js, public/js/flows.js | readOk flag, anyUnknown, 'unknown' scope level, grey tag and notice, flow wording |

## 4. Call count per site lookup

| Step | Today | After Stage 1 |
|---|---|---|
| Inventory text searches | 2 | 2 |
| Per-device latest reads | about 90 (3 to 4 per device) | 1 bulk call per 100 devices |
| V1 override history (only when overridden) | 0 to 1 | 0 to 1 |
| Repeat read on confirm | about 90 if the cache had lapsed | 0 (reuses in-flight or cached read) |
| Each 30 s refresh | about 90 | about 3 |
| Fallback path (bulk refused) | not applicable | about 90, but at most 10 in flight, 3 s timeout, 5 s site deadline |

## 5. Every place "offline" is shown, and what an unreadable device does there

| Location | Today on a failed read | After (readOk false) |
|---|---|---|
| tb-device.js fetchTelemetry fail-safe | active false, last-activity null, hard offline | readOk false, debounce record untouched, online false |
| routes/api.js canSwitchDevice and the heating, hot water and boost scope checks | not controllable | not controllable (unchanged, fail-closed) |
| routes/api.js scopeLevelFor | 'offline' or 'unreachable' | 'unknown' when every device in the group is unreadable; the anchor unit unreadable gives 'unknown', not 'unreachable' |
| routes/api.js anyOffline | true | false for unreadable devices; new anyUnknown true |
| views.js scope tag | amber "Not responding right now" | grey "Data unavailable" |
| views.js banner | red "Some Lighthouse equipment at this site is not responding." | grey notice (header wording); the red banner only for devices actually offline |
| flows.js about line 2063, heating zone | "The thermostat in this area isn't connecting to us", then the connectivity path | "We can't read the thermostat in this area right now, so we can't check or change it from here.", then the same log-it path, with the ticket note "Thermostat data unavailable at time of call (read failed) — not confirmed offline" |
| flows.js about line 2347, device state | 'offline' | 'unknown' |
| flows.js about lines 2594 and 2660, lighting and fans | treated as not online | unchanged control refusal; the wording says the equipment can't be read right now |
| flows.js about lines 2783 to 2813, wall unit | "The Lighthouse wall unit at this site isn't connecting to us" | "We can't read the Lighthouse wall unit right now" |
| control.js, oneoffs.js dispatch guards | refuse | refuse (unchanged) |

The build must re-check every !d.online and d.online consumer in public/js and routes/api.js. The table lists the ones found at main 5f35545. The orchestrator's screen-text diff checks the full wording before the test gate.

## 6. New and changed wording

| Screen | State | Text |
|---|---|---|
| Confirm | Checking | "Checking the Lighthouse equipment at this site…"; button "Checking site…" (disabled) |
| Confirm | Ready | Device summary as today; button "✓ This is the right site" |
| Confirm | Opening | Button "Opening site…" with spinner; both buttons disabled |
| Confirm | Read failed | "We couldn't read the Lighthouse equipment just now. You can still confirm the site." |
| Site page | Scope tag | "Data unavailable" (grey) |
| Site page | Notice | "We couldn't read some Lighthouse equipment just now. It may be working — we just can't see it. The page will try again in 30 seconds." |
| Heating flow | Zone unreadable | "We can't read the thermostat in this area right now, so we can't check or change it from here." |
| Ticket note | Zone unreadable | "Thermostat data unavailable at time of call (read failed) — not confirmed offline" |
| Stage 2 | Locked controls | "Waiting for equipment readings…" |
| Stage 2 | Panel failed | "We couldn't load tickets just now — try again" |

## 7. Rules this design keeps

- No change to the write path. Writes keep their own session, 15 s timeout and no retry.
- F004: control needs a resolved, unique, confirmed site. The confirm button stays disabled until the server says the site is unique.
- An unreadable device never unlocks control.
- No new timers, daemons or recurring costs. The bulk read lowers ThingsBoard load per lookup by about 95 percent.
- No new npm dependency.

## 8. Order of work for the build session

1. Stage 0 commit, then release it if Option A is chosen, and collect 20 or more lookups.
2. James runs proofs a and b with the corrected key list. Build gate after that.
3. Stage 1 behind the admin switch (bulk read on by default, switch available). Run the parity script on 10 or more live sites, and fix any differences.
4. Release Stage 1. Record before and after p95 with the image tag in the release record.
5. Stage 2 gets its own build gate later, under OOHDASH-158.
