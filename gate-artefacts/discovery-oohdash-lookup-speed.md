<!-- gate:contract
TICKET: OOHDASH-LOOKUP-SPEED
PHASE: discovery

SECTION: What is actually wrong
Picking a site takes about 15 seconds on the live dashboard, and it does so on every site, big or small, the first time you look it up. A repeat lookup within about 30 seconds takes under 50 milliseconds. That pattern, a fixed 15 second ceiling that does not depend on site size, matches the 15 second timeout on our ThingsBoard calls. It means some calls from the dashboard's pod to ThingsBoard hang until the timeout fires. The same calls made from a laptop outside the cluster all finish in 0.1 to 1.2 seconds with nothing hanging. So ThingsBoard itself is not slow. The likely culprit is the network path from our Kubernetes cluster out to portal.lhlive.co.uk. Spencer is already looking at that. The exact cause (port exhaustion, DNS or an allowlist) is not yet proven.

SECTION: Why the earlier fix (OOHDASH-148) did not help
OOHDASH-148 tidied the Zendesk and Cosmos steps that run after you confirm a site. Those steps cost one to three seconds. It never touched the 15 second ThingsBoard wait that comes before the confirm screen, so you rightly saw no difference. It was marked Done on the strength of a merge and approval, and nobody timed it in a browser. An earlier spike (OOHDASH-133) had already measured the real cause eleven days before and was never built. 148 did not read it. This artefact says what will prove the next fix works, so that Done means seen working.

SECTION: The route to a two second site page
Three steps. First, Spencer fixes or explains the cluster egress problem, which may remove most of the delay by itself. Second, a week of quick wins that work whatever the network does: read the whole site from ThingsBoard in one batch query instead of about 90 separate calls, cap each call at 3 seconds with one retry, show the confirm screen straight from the search result, stop the confirm button being clickable twice, and fetch Zendesk comments in parallel. Third, a staged site page that appears immediately and fills in devices, tickets and holds as each arrives, with a cache that shows slightly old data while refreshing. Staggered loading is accepted.

SECTION: The two side defects
Duplicate sites in search happen because the search lists one row per Zendesk dropdown option, not one per site, so two options sharing a site number show twice and also crowd out other results from the 12 row cap. The fix is to merge by site number before the cap. The confirm button needing two or three clicks happens because it gives no sign of working while the confirm call runs for one to three seconds, so people click again and each click starts another call record. The fix is a busy state and a server that ignores repeats.

SECTION: Things to know and decide
A side effect of this investigation: live timing created about 12 call records under James's user for sites 6803, 6762, 6835, 5673 and 5203, and one call is still open for 6835. They may need tidying. Also, the ThingsBoard API key sits as a plain value on the deployment, not as a secret, and lasts about 24 hours, which is an operational risk worth its own ticket. Two choices are left open below: whether the confirm step moves onto the site page itself, and whether the batch query works under the dashboard's own key.

DECISION: Should the confirm step stay a separate screen, or move onto the site page itself (read-only until confirmed)? | Keep the separate screen but show it instantly from the search result (safe, saves most of the time) | Merge confirm into the site page, with controls locked until confirmed (saves one screen change, needs a design and safety decision) | Keep it separate now and revisit merging after the staged page ships
DECISION: Should the batch query be built before we know it works under the dashboard's own ThingsBoard key? | Run a 10 minute read-only check with the dashboard key first, then build | Build the batch query and fall back to per-device reads automatically if it is refused
DECISION: Should OOHDASH-156 and OOHDASH-158 be merged into one ticket and the open 158 design gate PR #185 be folded into this work? | Yes, close 156 as duplicate and fold 158 into the progressive page ticket | No, keep 158 as is and run this work separately
-->

# Discovery: OOH dashboard site lookup speed, route to a landing page in 2 seconds or less

Project ooh-triage-dashboard, repo bigtuff8/ooh-triage-dashboard, base main (v1.7.2, commit 828b93c), Jira project OOHDASH, release R1. Date 2026-11-10. This covers the lookup speed problem and two related defects (duplicate search rows, confirm button needing 2 to 3 clicks).

## 0. Blockers and external actions (read first)

- B1. In-cluster egress to ThingsBoard (portal.lhlive.co.uk) hangs. Telemetry calls time out at 15 s from inside the pod and answer in under 140 ms from outside. Owner: Spencer (investigating). Cause UNVERIFIED (SNAT port exhaustion, DNS and allowlist are all candidates). Evidence it is egress and not ThingsBoard: see section 2.
- B2. TB_API_KEY is a plain environment variable on the deployment spec (not a Kubernetes secret) with roughly 24 hour ThingsBoard lifetime. Operational risk: expiry silently breaks all live reads; plain-text exposure to anyone with get-deploy RBAC. Owner: James and Spencer to decide on a secret reference plus a rotation approach. Separate ticket recommended, out of scope to fix here.
- B3. Cosmos container OohActionInflight is missing (OOHDASH-147, To Do, waiting on Spencer). Unrelated to speed, listed only so it is not confused with the speed work.
- B4. Whether the batch endpoint (POST /api/entitiesQuery/find) is permitted under the dashboard's own API key is UNVERIFIED in the dashboard's role (it worked from outside with the same key read from the deployment env; the pod's own network path is the open question). Owner: build doer, a 10 minute read-only check.
- B5. Process: nobody has an end-to-end browser-side timing. Stage 0 below fixes this and is a precondition for calling anything Done.

## 1. Why the prior fix did not hold (MANDATORY)

Question asked: OOHDASH-148 is Done and live. Why does lookup still feel exactly as slow?

Findings:
- 148 is in production and running as coded. It is an ancestor of the running image apitechhub.azurecr.io/ooh-dashboard:828b93c (pod 1/1 Running, healthz v1.7.2). It is not behind a flag. So this is not a runtime-differs-from-repo case: the code is live. The failure is that the code was live and did nothing visible. Source: 01-tickets-audit.md section 2, Kubernetes read-only get and logs.
- 148 optimised the wrong stage. It ran Zendesk ticket and Cosmos hold reads in parallel (saves about 10 ms, because Cosmos is about 10 ms), started the Zendesk site-name lookup earlier (saves about 0 ms, because the log shows zd-name=0ms, the directory is already cached), and stopped the health probe nulling the JWT (now moot: prod runs API-key auth and logs zero login lines).
- The dominant cost, the ThingsBoard per-device fan-out, was untouched. Pod logs show tb-reads of about 15.0 to 15.5 s on every large-site cold resolve (6803: 15221, 15180, 15253, 15300 ms; 6762: 15295, 15219, 15169; 6835: 15509). Workspace-phase Zendesk time (1.0 to 2.5 s, from a serial comment loop) was also untouched.
- 148 was written when no per-stage timers existed ("UNRESOLVED" in its own discovery). Its premise (two serial Zendesk calls plus re-auth) was a guess.
- The OOHDASH-133 spike (2026-10-15, branch spike/oohdash-133-site-lookup-speed, f944329) had measured the real cause 11 days earlier and recommended slim resolve, a single batch query, bounded concurrency with a shorter timeout, and parallel comment fetch. It was never merged to main and 148 never referenced it. Its proposed tickets A, B and C were apparently never raised.
- 'Done' was claimed on merge plus approval (build PR 179, release PR 181 as v1.6.5). The release record has no browser-side before and after figure. Nobody timed pick to confirm screen from a browser.
- Duplicate tickets compound it: OOHDASH-156 and OOHDASH-158 describe the same progressive-load work; 158 design gate PR 185 is still open and nothing is built.

Systemic cause: Done meant merged and approved, not observed in effect, and the work was aimed at a stage nobody had measured, while the evidence that located the real stage sat in an unmerged branch.

What will prove the next fix is in effect (acceptance, all measured, none by test pass alone):
- Stage 0 ships first: browser-side timing marks (performance.mark) for last keystroke to results painted (T-search), pick to confirm gate usable (T-gate) and pick to site page with devices painted (T-site), emitted as one [UX] log line per call, plus a Server-Timing header on resolve, confirm and workspace.
- Acceptance is the p95 of those numbers from at least 20 real lookups on the live site after release, quoted in the release record, with a before baseline taken the same way (today: T-gate about 15.2 s cold, per 02-timings.md).
- Each fix is observed on the running pod (image tag matched to the merge commit, then a live lookup timed) before the ticket moves to Done.
- Targets: T-search under 300 ms, T-gate under 500 ms, T-site under 2 s (tickets and holds may arrive after).

## 2. Current state (verified evidence)

Timings from James's signed-in live session (v1.7.2), client-observed. Source: 02-timings.md.
- Search: about 196 ms debounce plus 31 to 40 ms server (601 ms the very first call). Server search is an in-memory filter of the Zendesk site directory (364 options, 1 hour cache), no ThingsBoard call. Not the bottleneck. Verified in code: services/tb-device.js searchSites.
- Pick to confirm screen (GET /resolve): 15.2 to 15.3 s on every cold lookup for all five sites tried (6803, 6762, 6835, 5673, 5203), including the 5 to 6 device sites. 31 to 44 ms when warm. 6803 was not warm on repeat after more than 30 s. Never a value in between.
- Confirm click to landing page (POST /confirm): 42 to 65 ms on small sites, 0.96 to 3.0 s on big sites (6803, 6762, 6835). Response 11 KB, page rendered in one mutation (no progressive render). A heartbeat call follows about 7 s later.
- Outside-cluster ThingsBoard direct, same API key (header X-Authorization: ApiKey, key valid, auth check 139 ms): device list for a site 0.13 to 0.18 s; batch entitiesQuery with four latest values per device 0.14 to 0.29 s for 28 to 30 devices; about 90 parallel per-device reads about 1.2 s wall time with 100 threads, zero hangs, all 200; sequential single reads about 0.11 to 0.17 s (one 1.17 s outlier). No cold-warm difference.
- Pod-side: tb-search 41 to 92 ms, tb-reads about 15.0 to 15.5 s on large cold resolves, with per-device log lines "timeout of 15000ms exceeded" for Telemetry, SERVER_SCOPE and CLIENT_SCOPE reads. The same site flips between 0.2 s and 15 s (5203: 15035 ms, then 212 ms), which looks like a hung-request lottery and not a work-volume problem.
- Auth: JWT path is dead (MFA returns PRE_VERIFICATION_TOKEN). The read path now uses API-key mode (tb-client.js apiKey branch), so the 133 re-login problem no longer exists, and the 15 s hang persists regardless, which rules authentication out.

Code facts spot-verified on origin/main 828b93c:
- tb-client.js:51 sets timeout 15000 per request.
- tb-device.js:84 LIVE_CACHE_TTL = 30 * 1000.
- services/zendesk.js:717 slices to 12 tickets then fetches comments in a serial loop (a later trim keeps about 6).
- tb-device.js:1784 and 1799 apply slice(0, 12) in searchSites before any de-duplication.
- public/js/views.js:271 confirm button has onclick confirmSite() and no busy state.

Request path (from 01-tickets-audit.md section 3): search, then resolve (two textSearch calls, then fetchTelemetry fires 3 to 4 requests per device for all devices at once, about 70 to 100 for a 29-device site, with no concurrency cap), then confirm which calls resolve again (full burst repeated if the 30 s cache lapsed), then workspacePayload (Zendesk search plus serial comments, Cosmos holds in parallel), then a workspace refresh every 30 s that re-runs the full burst. The confirm screen displays only the site name, number and a one-line device-kind summary, so the 15 s wait is for data it does not show.

Interpretation (labelled): the hang is in the AKS to ThingsBoard path. Evidence for: bimodal 15 s versus 30 ms, constant ceiling independent of site size, exact match to the 15000 ms timeout, clean outside-in results. Not proven: SNAT versus DNS versus allowlist (needs an in-pod test, which James's RBAC does not permit). UNVERIFIED.

Side effect of the investigation (recorded honestly): one confirm click per timed lookup created call records under James Brown for sites 6803, 6762, 6835, 5673 and 5203, about 12 in total. New Call finalised most (POST finalise returned 200); one call remains open for 6835. No outcomes, tickets, SMS, escalations or device-control writes were made. These may need tidying in Cosmos and the Tonight view.

## 3. Recurrence-style gap list (current versus target)

- G1. Confirm gate waits for the full telemetry fan-out it does not display. Current: blocked on slowest request. Target: gate ready on the textSearch (about 80 ms) or straight from the search hit.
- G2. 3 to 4 requests per device. Target: one batch query (about 0.2 s measured outside).
- G3. No concurrency limit, 15 s timeout. Target: about 3 s timeout with one retry, bounded sockets.
- G4. Confirm repeats the read after the 30 s cache lapses. Target: reuse the in-flight or recent read.
- G5. 30 s workspace refresh re-runs the burst. Target: cheap refresh, stale-while-revalidate.
- G6. Zendesk comments fetched serially, 12 fetched, up to 6 used (1.0 to 2.5 s live). Target: fetch only displayed tickets, in parallel.
- G7. SHARED_SCOPE schedule reads fire at resolve for every boiler and power-pause device. Target: defer until a flow needs them.
- G8. No browser-side measurement. Target: Stage 0.
- G9. Failed reads force devices to show offline, so every hang also shows devices falsely offline. Fixed as a side effect of G1 to G3.
- G10. Hygiene: 156 and 158 duplicate each other; 133 evidence not on main; 147 is a Cosmos spike and not a speed ticket.

## 4. The two side defects

### Defect A: duplicate site rows in search
- Live evidence: GET /api/sites/search?q=5673 and q=5203 each return two byte-identical rows (siteNo, name, brand, duplicate:true). Large sites return one row. Source: 02-timings.md.
- Root cause (mechanism read in code, HIGH confidence): search lists one row per Zendesk dropdown option, not one per site. siteNo is the first 3-plus digit run of the option, so any number appearing in two options gives two rows. The server only tags them duplicate (routes/api.js:99-104). Both rows resolve to the same URL, so the choice is meaningless. The 12-row cap runs before any dedupe, so duplicates crowd real sites out. Which Zendesk options hold the second record in live data is UNVERIFIED (confirm by grouping the site field options by site number).
- Side effect: shared numbers make name matching return null, so the confirm gate shows "Site name unverified".
- Fix (cost: negligible, in-memory on the cached directory): collapse by site number before the cap, pick a deterministic name, reserve the duplicate tag for genuine ambiguity, raise one data-quality notice for the Zendesk admin, prefer an exact site-number match in name resolution, add a test with two options sharing a number.

### Defect B: confirm needs 2 to 3 clicks
- Live evidence: the button stays enabled with the same label and no spinner at 110, 610, 1210 and 2011 ms after the click on 6835, while the screen swaps only at about 2.2 to 3 s. A single click always advanced; no console errors. Deliberate double-clicks were not tested (would create call records).
- Root cause (HIGH confidence in mechanism): no in-flight guard, no busy state (views.js:271, confirmSite at 276). Each extra click fires another POST /confirm; the server starts a call record per confirm; the last response to land overwrites the token and call id. Click count is simply how long the handler waits. The error-then-silent-retry variant is UNVERIFIED.
- Fix: re-entrancy flag, disabled button with spinner and "Confirming", inline errors instead of a 4 s toast, server confirm idempotent per operator and site for a few seconds, and an e2e test that double-clicks against a delayed confirm and asserts one POST.
- Interaction: same slowness; fixed at source by the stages below.

## 5. Requirements (curatable: keep, cut, defer or re-prioritise each)

- R1. Search results appear near-instantly (target T-search under 300 ms, ideally under 50 ms). Outcome: handler is not waiting while a caller is on the line. Grounded: 02-timings.md search figures.
- R2. Confirm gate usable (button enabled) within 500 ms of picking a site (T-gate). Outcome: read-back script can start straight away. Grounded: 15.2 s measured today.
- R3. Site landing page with devices painted within 2 s of pick, excluding the handler's own read-back time (T-site, p95). Tickets and holds may arrive later (staggered loading accepted by James).
- R4. Confirm cannot be double-fired: busy state, single request, idempotent server. Outcome: no duplicate call records.
- R5. Search shows one row per site. Outcome: no phantom choices; 12-row cap holds real sites.
- R6. No device shown offline because a read failed; failed reads are shown as unknown or stale, not offline. Outcome: trustworthy board. (Needs design decision on the display.)
- R7. Control actions and flows stay locked until the device panel is ready and the site is confirmed (existing F004 safety rule preserved).
- R8. Every release states measured p95 from the browser, before and after (Stage 0). Outcome: Done means observed.
- R9. Data on screen carries an "as of" time when served from cache.
- R10. TB credential risk (B2) tracked in its own ticket.
- R11. No new background or timer-driven component (see section 7).

## 6. Options

Savings below are reasoned from measured numbers; none re-measured on a change. Effort: S up to 2 days, M 3 to 5 days, L over a week.

Option 1: Fix the network only (Spencer, B1). Outcome: removes the 15 s hang for every ThingsBoard consumer (dashboard, iot-hub, integration bridge), probably restoring about 0.3 to 1.2 s fan-out. Cost: zero code; owner time. Risk: cause unproven and timing unknown, and the dashboard still makes about 90 calls per site and still has the other defects. Serves R2, R3 (partly).

Option 2: Quick wins, independent of the network (recommended Stage 1, about a week). Items:
- Q1 Single batch entitiesQuery per site instead of per-device reads (S to M; measured 0.14 to 0.29 s outside; needs an explicit key list and a parity test on 10 or more real sites). Serves R2, R3, R6.
- Q2 Per-call timeout of 3 s with one retry, bounded sockets, keepalive agent (S). Caps worst case at about 3 to 6 s versus 15 s. Check 3 s sits above real latency (outside max was 1.19 s).
- Q3 Confirm screen drawn instantly from the search hit (name, number, duplicate flag), button enabled when slim resolve returns (S, client only). Serves R2.
- Q4 Confirm busy guard, spinner, server idempotence (S). Serves R4.
- Q5 De-duplicate by site number before the 12-row cap (S). Serves R5.
- Q6 Zendesk: fetch comments for displayed tickets only, in parallel (S). Saves about 2 s of the 2.9 s on confirm.
- Q7 Confirm reuses the in-flight or recent read (S). Removes the repeat burst after 30 s.
- Q8 Client-side site index plus directory refresh that serves the old copy while refreshing (S). Search under 50 ms.
- Q9 Cosmos holds by SQL filter (S). Prevents growth in cost.

Option 3: Staged, progressive site page (Stage 2, about 2 to 3 weeks; folds OOHDASH-156 and 158, which duplicate each other). Items: confirm returns token and header at once; devices, tickets and holds panels load in parallel each with loading, empty, error and ready states; flows locked until devices ready; stale-while-revalidate site cache replacing the 30 s hard expiry (control dispatch always reads the target device fresh); prefetch on highlight or hover (only safe after Q1); hedged retry on the batch call. Serves R3, R6, R7, R9.

Option 4: Merge the confirm step onto the site page (read-only until confirmed). Saves one screen change. Higher risk: data visible before confirmation, changes the journey and the F004 safety framing. Needs a design gate. See DECISION. Not needed to hit the target.

Option 5 (not recommended): timer-warmed cache of likely sites. Spends ThingsBoard, Zendesk and Cosmos calls while idle and gives almost nothing once the batch read is about 0.2 s. Fails the idle-cost criterion. Also not recommended: estate-wide ThingsBoard device index (no speed gain, recurring idle load) and an SSE panel stream (no gain over parallel fetches for three panels). Raising the cache TTL alone is a complement at best (stale state, first open still slow).

Staged plan:
- Stage 0 (1 day, ships first or with Stage 1): browser timing marks and Server-Timing. Defines T-search, T-gate, T-site and the before baseline.
- Stage 1: Option 2 plus Spencer's investigation in parallel. Expected: search under 300 ms, gate under 0.5 s, site page about Confirm plus 1 s typically, worst case about 3 to 6 s while the network fault remains.
- Stage 2: Option 3. Expected: gate ready on the click, devices at Confirm plus under 0.5 s p95, tickets and holds about a second later.
- Stage 3 (optional): Option 4 and live updates by ThingsBoard WebSocket, only if a design and safety decision supports them.

Critical path: Stage 0, then Q1 plus Q2 plus Q3 plus Q7, then Option 3. Parallel tracks: Spencer's egress investigation, Q4 to Q6, Q8 and Q9.

## 7. Mandatory evaluation: cost and silent running

Token and cost efficiency:
- Every option uses zero LLM tokens and adds zero recurring subscription, API or compute cost. All work is deterministic code. Model-tiering is not relevant.
- ThingsBoard load falls by about 95 percent per lookup (about 1 to 3 requests instead of about 90). Zendesk calls per confirm fall (parallel, displayed tickets only). Nothing scales unbounded with usage; the per-site cache and in-flight map are bounded by sites opened.
- Option 3 adds a few extra client requests per confirm (three panel fetches); negligible.

Silent running of background components:
- No option adds a daemon, scheduled task, listener or timer. Refresh and prefetch are triggered by the operator's own actions (opening a site, highlighting a result) and the existing visible-tab 30 s refresh, which becomes 1 to 2 calls instead of about 90. Nothing is visible outside the browser tab: no windows, no notifications. Idle cost is nil.
- Shortfalls surfaced (not buried): (a) Option 5 would break the idle criterion and is therefore not recommended. (b) Prefetch on highlight can fire speculative reads for sites never picked; negligible after Q1, but before Q1 it would worsen the burst, so it is sequenced after Q1. (c) The existing 30 s workspace poll remains until Stage 2 reduces its cost; it is operator-visible only inside the browser tab. (d) Stale-while-revalidate trades freshness for speed, so cached data is labelled with its time and control actions always read fresh.

## 8. Risks register

- Rk1. Egress fault is not fixed or recurs. Likelihood medium, impact high. Mitigation: Q1 and Q2 cap exposure (one or two calls with a 3 s timeout); hedged retry later. Owner Spencer.
- Rk2. Batch query changes device classification through a missed key. Likelihood medium, impact high. Mitigation: old-versus-new parity test on 10 or more live sites, keep the per-device path as fallback behind a switch.
- Rk3. Batch endpoint refused or rate-limited under the dashboard's key or from the pod. Likelihood low to medium, impact medium. Mitigation: 10 minute read-only check first (see DECISION); automatic fallback.
- Rk4. 3 s timeout too tight in a real slow case. Likelihood low, impact medium (devices look offline). Mitigation: outside max was 1.19 s; show unknown instead of offline; tune from [UX] data.
- Rk5. Flow runs on partial state after the staged page. Likelihood medium, impact high. Mitigation: hard lock on devices-ready and confirmation token.
- Rk6. Stale state on screen. Likelihood medium, impact medium. Mitigation: "as of" time, control path reads fresh.
- Rk7. TB_API_KEY expires (about 24 h lifetime), taking all live reads down. Likelihood high over time, impact high. Mitigation: separate ticket; secret reference and rotation. Owner James and Spencer.
- Rk8. Declared Done again without effect. Likelihood medium, impact high. Mitigation: Stage 0 numbers in every release record; verify image tag then timed live lookup.
- Rk9. Merged confirm (Option 4) weakens the confirm-before-control rule. Likelihood medium if chosen, impact high. Mitigation: design gate; token-locked controls.
- Rk10. Test records left behind (about 12 call records, one open for 6835). Impact low. Mitigation: tidy in Cosmos; owner James.
- Rk11. Ambiguity rule: live mode returns 0 or 1 site from ThingsBoard, so duplicates are detected only at search. Redesign must keep the duplicate warning visible on the gate (Q3 carries the flag).

## 9. Anti-reinvention check

- The batch query, slim resolve and progressive load are already specified in OOHDASH-133 (spike branch) and OOHDASH-158 (discovery on main, design gate PR 185 open). This proposal extends those, it does not create a parallel design. Recommend folding 158 into the progressive page ticket and closing 156 as its duplicate.
- Existing timing logs ([SITE] lines) are extended by Stage 0, not replaced.
- The existing confirm token and call-record idempotence logic (sameOperatorResume) is extended, not rebuilt.
- The Zendesk directory cache already exists; the client index and refresh-while-serving build on it.

## 10. Customer-experience success criteria (handed to design)

Persona and journey. The customer is a handler on an out-of-hours call, often at night, with a caller (a pub or restaurant manager, possibly stressed with a kitchen or heating failure) on the phone and only a site name or number. They search, pick the site, read it back to the caller ("can I just confirm you're calling from..."), confirm, then see the device board and recent tickets and act. Pressure: dead air on the call; every second of silence is felt. Their journey continues past this page (diagnose, act, log outcome), so the landing page must not hold them up.

Reassurance versus friction, by step:
- Search typing: get out of the way. Results must feel instant, one row per site.
- Pick site, confirm screen: this is the one deliberate checkpoint (high stakes, irreversible control follows). Keep it, but make it instant: name and read-back script appear immediately; the Confirm button is enabled as soon as the site is validated. The duplicate warning stays visible.
- Confirm click: needs unmistakable feedback (busy state "Confirming"), and must be safe to tap twice.
- Site landing page: get out of the way. Shell first, panels filling progressively, each with a clear loading, empty, error or ready state; skeleton placeholders rather than a blank page; "as of" time on cached data.
- Control actions: reassurance returns; locked until devices are ready, with a clear reason shown.
- Device with unreadable state: show unknown or stale, never "offline" by default.

Great looks like: type three characters and the site is in the list before you finish the next; click it and the site name and read-back line are on screen at once; confirm and you are on the site page before the caller finishes saying yes, with the devices already there and tickets landing a moment later. Nothing ever looks frozen, and a nervous second tap does nothing harmful.

## 11. Data scope (handed to design)

- Site directory entry (Zendesk site field option): siteNo (derived), siteName, brand, duplicate flag. Source Zendesk, 1 hour cache, 364 options. Sensitivity: low. Needs a merge rule for shared numbers.
- Device (ThingsBoard): name, profile or type, label (zone), latest timeseries, SERVER_SCOPE active and lastActivityTime, CLIENT_SCOPE site, salusLocation, DHW and heating attributes, SHARED_SCOPE schedules. The batch query needs an explicit key list covering everything mapTelemetry and classifyDevice use. Retention: cache only, in-memory.
- Site state cache: per site, device list, timestamp, in-flight read promise. In-memory, single replica, not correctness state.
- Tickets (Zendesk): open OOH tickets for the site, up to 6, with comments. Contains caller data; not cached beyond about 60 s.
- Holds (Cosmos overrides): active boost holds by site.
- Call record (Cosmos): one per confirm; confirm token. Needs idempotence key (operator, siteNo). Contains operator identity.
- Timing events: [UX] and [SITE] lines, no personal data beyond call id. Retention per existing log policy.
- Credentials: TB API key (see B2). Not to be put in artefacts.

## 12. End-to-end testing scope (handed to design)

Critical journeys that must be provable, with the browser-side timings recorded:
- Happy path: search, pick, confirm, landing, on a large site (6803 class), a small site (5673 class) and a cold cache; assert T-search, T-gate, T-site against targets.
- Cache variants: warm, cold, expired between pick and confirm; confirm reuses the in-flight read.
- Duplicate numbers: site with two Zendesk options shows one row; 12-row cap holds; genuine ambiguity still flagged.
- Double or triple click on confirm against a delayed confirm: exactly one POST, visible busy state, one call record.
- ThingsBoard unhappy paths: hung call (3 s timeout then retry), refused batch (fallback), partial results, all down. Devices show unknown, not offline; controls stay locked.
- Zendesk slow or failing: site page still appears; tickets panel shows error state.
- Safety: no control action possible before confirm and before devices ready.
- Parity: batch read versus per-device read on 10 or more real sites gives the same device kinds and states.
- Credential: expired or revoked key turns health red within the existing window.
- Clean-up: tests that create call records must finalise or delete them.

## 13. Next steps

1. Spencer investigates AKS outbound to portal.lhlive.co.uk (SNAT ports or NAT gateway, DNS, allowlist), with an in-pod curl timing test. Start now; parallel to everything.
2. Stage 0: browser timing marks and Server-Timing, with a before baseline taken the same way. First build phase.
3. Stage 1 quick wins (Option 2) in one or two small PRs, in this order: Q3 and Q4 (instant gate, busy guard), Q1 and Q2 (batch read, 3 s timeout and retry) after the 10 minute key check, Q7, Q5, Q6, Q8, Q9.
4. Stage 2 progressive page, folding OOHDASH-156 and 158; the design gate decides panel states and the devices-ready lock; resolve the confirm-placement DECISION there.
5. Housekeeping: raise a TB key secret and rotation ticket; tidy the test call records; close 156 as a duplicate; merge the 133 findings document into docs so the evidence is discoverable.

Why first: Stage 0 plus the network investigation cost almost nothing and tell us how much of the 15 s each fix really removes, and the quick wins cap the damage whatever the network does.

## 14. Unverified items

- Cause of the in-cluster hang (SNAT, DNS or allowlist). Confirm with an in-pod timing test.
- Whether the batch endpoint works from the pod and under the dashboard's role.
- Which Zendesk options produce the live duplicate rows for 5673 and 5203.
- Whether error-then-retry contributes to the multi-click symptom (server logs would show).
- Whether Tuya read is enabled in production (believed off by default).
- Every saving figure for options is reasoned, not measured on a change.
- Browser and ingress share of time beyond the client-observed figures.

## Sources

01-tickets-audit.md, 02-timings.md, 03-bugs.md, 04-options.md (session scratchpad evidence); origin/main 828b93c code (spot-verified lines above); gate-artefacts/discovery-oohdash-148-site-load-speed.md and gate-artefacts/discovery-oohdash158-progressive-load.md; Jira OOHDASH-133, 147, 148, 156, 158, 161; PRs 163, 177, 179, 180, 181, 184, 185, 196, 197.
