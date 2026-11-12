<!-- gate:contract
TICKET: OOHDASH-164
PHASE: discovery

SECTION: What is actually wrong
Picking a site takes a constant 15.2 to 15.4 seconds on the live dashboard. The ceiling matches the 15 000 ms per-call timeout in tb-client.js exactly. Opening one site fires about 90 ThingsBoard calls at once with no concurrency cap: two inventory text searches (fast, 50 to 90 ms each), then 3 to 4 calls per device (timeseries, SERVER_SCOPE, CLIENT_SCOPE, plus SHARED_SCOPE for boilerControl and PowerPause devices), all in a single unbounded Promise.all. The per-site cache expires every 30 seconds, which equals the workspace refresh interval, so every refresh re-fires the full burst. Spencer Thompson (platform owner) confirmed on 11 November that the cause is the concurrent burst hitting something between the pod and ThingsBoard, not the ThingsBoard service itself or the network path in isolation. Pod logs show 20 to 43 calls per burst failing with ECONNRESET and 12 to 19 hanging to the full 15 000 ms timeout. The same 90-call burst from a laptop outside the cluster produces zero failures in about 1.2 seconds. Something in the AKS-to-ThingsBoard path rejects the high-concurrency burst from the pod. Spencer's recommended fix is to reduce to about 2 calls per site (one POST /api/entitiesQuery/find for the device list with latestValues), cap concurrency on whatever per-device calls remain, and raise the cache TTL above the 30-second refresh window. His claimed outcome is 15 seconds to about 1 second.

SECTION: Why Spencer's diagnosis revises the 10 November draft
The 10 November discovery (commit df14da3, file discovery-oohdash-lookup-speed.md) correctly identified the burst and timed the numbers but attributed the ceiling to a network egress fault (SNAT, DNS, or allowlist) as the primary hypothesis, with the batch fix as the solution regardless. Spencer's 11 November email removes that uncertainty on cause: the burst behaviour itself is the problem. This matters because it changes the risk profile. If the fix were solely a network patch, the dashboard could still suffer on a repeated refresh burst. Because the fix is fewer calls, it sidesteps whatever is rejecting the burst, whatever its precise mechanism. The batch approach is therefore both the right fix and the most robust one. The 10 November draft's options and staged plan remain valid; this document supersedes its diagnosis and adds the svc-read key proof.

SECTION: Data-integrity impact today (live bug, not future risk)
When 20 to 43 calls fail with ECONNRESET per burst, the fetchTelemetry handler catches each failure and forces the affected device to show as offline. This is the fail-safe rule (tb-device.js line 715 area), written to treat a read failure as unknown, but the actual effect in the live code is that failed SERVER_SCOPE reads set active to false and the online derivation then returns false. At every large-site cold resolve today, some devices are showing falsely offline. This is a live data-integrity defect, not a future concern. The batch fix removes most of the per-device calls and therefore removes most of the ECONNRESET failures, which fixes the false-offline problem as a side-effect. Failed devices should show as unknown or stale, not as offline. This requires a design decision (see DECISION on false-offline display) and a specific requirement on what unknown looks like to the handler.

SECTION: Code facts (verified on origin/main commit 828b93c)
tb-client.js line 51: timeout 15000 ms per request, no retry. tb-device.js line 84: LIVE_CACHE_TTL is 30 seconds. tb-device.js around line 1358: fetchTelemetry is an unbounded Promise.all over all devices, each device getting 3 to 4 concurrent calls. views.js line 305: workspace refresh fires every 30 seconds (matches the cache TTL exactly, so the cache is always cold on a refresh). routes/api.js: the confirm route calls resolveSite again, which re-fires the burst if the 30-second cache has lapsed between pick and confirm. CLIENT_SCOPE attributes requested per device: site, salusLocation, DHW.use_boiler, heating_scenario, CHZ1.enabled, CHZ2.enabled. SHARED_SCOPE requested for boilerControl and PowerPause: output1OutputMask, output1Schedule through output4Schedule, CHZ1.schedule, CHZ2.schedule, DHW.schedule, schedules. Timeseries requested via GET /api/plugins/telemetry/DEVICE/{uuid}/values/timeseries with no key filter (all keys returned). SERVER_SCOPE: active, lastActivityTime.

SECTION: Mandatory proof of the svc-read key for the batch path
James's explicit requirement. Three sub-proofs. The svc-read key (thingsboard-read-apikey in Key Vault airedale-kv-prod) is the same key now on the live pod.

Proof a: POST /api/entitiesQuery/find permitted under the svc-read key and returns the same device set. The 10 November session verified the batch endpoint returned 28 to 30 devices from outside the cluster. That test used a key that may have been a personal key; re-confirmation under thingsboard-read-apikey is required. Status: PENDING James running the proof script at C:\Users\james\AppData\Local\Temp\claude\f1edd483a457e4f0\4566307b-bb28-4a7e-b7f5-6ed4335564c4\scratchpad\tb-batch-proof.mjs with TB_API_KEY fetched from Key Vault. James should run this with ! in the session.

Proof b: latestValues returns every key the current code uses across all scopes (timeseries, CLIENT_SCOPE, SERVER_SCOPE, SHARED_SCOPE). The full key list is in the proof script. Status: PENDING same test run.

Proof c: latency and failure rate of the batch call from the pod's network path. Status: DEDUCED. Direct evidence: pod logs show 20 to 43 ECONNRESET failures per 90-call burst from the pod, and zero failures from a laptop running the same 90-call burst. Deduction: the ECONNRESET pattern is proportional to concurrency, not to the network path. A 2-call batch does not approach whatever the concurrent-connection limit is; it is therefore expected to succeed from the pod with the same sub-300 ms latency seen from the laptop. This cannot be directly proved without exec access or a Spencer-run in-cluster test. The design should include a plan for Spencer to confirm in-cluster batch latency before or alongside the build phase.

SECTION: Options and staged plan
Stage 0 (1 day): browser timing marks, performance.mark calls for T-search (last keystroke to results), T-gate (pick to confirm usable), T-site (pick to devices painted), emitted as a [UX] log line per call plus a Server-Timing header on resolve, confirm, and workspace. This ships first or alongside Stage 1 and is the before baseline.

Stage 1 (about one week): Q1 single batch entitiesQuery per site (Spencer's recommended fix, requires svc-read proof); Q2 timeout 3 seconds per call with one retry and a bounded agent; Q3 confirm screen drawn from the search hit instantly, button enabled on slim resolve; Q4 confirm busy state, spinner, server idempotence; Q5 de-duplicate search rows by site number before the 12-row cap; Q6 Zendesk comments for displayed tickets only, in parallel; Q7 confirm reuses the in-flight or recent read; Q8 client-side site index with stale-while-serving for search under 50 ms; Q9 Cosmos holds by SQL filter.

Stage 2 (2 to 3 weeks): progressive site page, folding OOHDASH-156 and 158. Confirm returns token and header immediately; devices, tickets, and holds panels load in parallel, each with loading, empty, error, and ready states; flows locked until devices ready; stale-while-revalidate cache.

SECTION: OOHDASH-156 and 158 duplication
OOHDASH-156 and 158 both describe the same progressive-load work. The 158 design gate PR 185 is still open and nothing has been built. Recommend closing 156 as a duplicate, updating 158 to cover the full Stage 2 scope from this discovery, and folding PR 185 into the design gate for Stage 2. This discovery supersedes the 158 discovery gate artefact.

SECTION: Confirm screen placement
The current confirm screen is a deliberate checkpoint: the handler reads back the site name and confirms before any control actions are possible. Stage 1 (Q3) makes it appear instantly from the search result with the button enabled on slim resolve. Stage 2 adds the option of merging confirm into the site page (read-only until confirmed). That merge is higher risk (data visible before confirmation, changes the journey, affects the F004 safety framing) and needs a design gate. It is not needed to hit the 2-second target. See DECISION below.

SECTION: Failed-device display
When a ThingsBoard read fails today the device shows as offline. The correct behaviour for a read failure is to show the device as unknown or stale (last-known state with an age marker) rather than offline. This is both a data-integrity fix and a handler-experience improvement: a handler should not start a cold-kitchen diagnosis when the thermostat is simply unreadable at this moment. See DECISION below.

SECTION: Cost and silent running
Every option in Stages 0 to 2 uses zero recurring cost: no LLM tokens, no subscriptions, no background daemons or timers. The batch call reduces ThingsBoard load by about 95 percent per site lookup (from about 90 calls to about 2). The workspace refresh becomes 1 to 2 calls instead of about 90 once Stage 1 ships. Stage 2 adds three parallel panel fetches per confirm but each is a lightweight call. No option adds a timer, watcher, or idle background process. The existing 30-second workspace poll is replaced in Stage 2 by stale-while-revalidate, which costs one refresh call per TTL.

SECTION: Risks
Rk1: svc-read key batch proof fails (endpoint refused or key lacks permission). Likelihood: low, since the endpoint worked from outside the cluster with an equivalent key. Mitigation: automatic per-device fallback; proof test before build begins. Rk2: batch query misses a key and changes device classification. Likelihood: medium (key list must be explicit). Mitigation: parity test on 10 or more live sites comparing batch vs per-device outputs for every device field. Rk3: 3-second timeout fires on a legitimately slow device. Likelihood: low (outside max was 1.19 seconds). Mitigation: show unknown rather than offline; tune from UX data. Rk4: false-offline display change surprises handlers used to seeing the current behaviour. Likelihood: medium. Mitigation: design gate includes the display spec; unknown state is clearly labelled. Rk5: in-pod batch latency is higher than laptop. Likelihood: low (fewer connections means less exposure to whatever rejects bursts). Mitigation: Spencer in-cluster confirmation before Stage 1 deploy. Rk6: Stage 2 flow runs on partial state. Likelihood: medium. Mitigation: devices-ready lock is a hard gate on control actions. Rk7: svc-read key expires (~24 h lifetime). Likelihood: high without a secret-backed rotation. Mitigation: OOHDASH-161 tracks this; separate ticket. Rk8: Done claimed again without measured effect. Mitigation: Stage 0 numbers required in every release record.

SECTION: Requirements
R1: T-search under 300 ms (target under 50 ms with client index). R2: T-gate under 500 ms. R3: T-site under 2 seconds for large sites, p95. R4: Confirm fires exactly once regardless of click count. R5: Search shows one row per site; 12-row cap holds real sites. R6: Failed reads show device as unknown or stale, not offline. R7: Control actions locked until devices ready and site confirmed. R8: Every release has measured p95 before and after (Stage 0). R9: Cached data carries an as-of time. R10: TB key risk tracked in its own ticket (OOHDASH-161).

SECTION: Next steps
1. James runs the proof script (a and b) and pastes the results into the gate review. Command: set TB_API_KEY to the value of thingsboard-read-apikey from airedale-kv-prod, then run node with the scratchpad proof script. 2. Spencer to confirm in-cluster batch latency (proof c). James to ask Spencer in a brief email or Teams message. 3. Discovery gate: this artefact is opened as a gate PR, James reviews and approves, then design begins. 4. Design gate covers the batch call with explicit key list and fallback, concurrency cap and timeout, cache TTL, false-offline display, Stage 0 marks, Stage 2 panel states and devices-ready lock, and the confirm placement decision. It resolves OOHDASH-156 and 158. 5. Build begins after design sign-off. The write-path API key fix (fix/tb-write-api-key) is in flight separately; this discovery does not touch it.

DECISION: Should the confirm screen stay separate, or should it merge onto the site page once Stage 2 ships? | A: Keep the separate screen (recommended): Stage 1 makes it instant from the search result; the checkpoint remains visible and the F004 rule is unchanged. Stage 2 and later can revisit. | B: Merge confirm into the site page in Stage 2, with controls locked until the handler taps a Confirm button on the page. Saves one screen transition; needs a design gate on the safety framing. | C: Keep separate now and revisit after Stage 2 is proven in the field.

DECISION: When a ThingsBoard device read fails, what should the UI show? | A: Unknown (recommended): show a device row with a greyed-out state and the label "data unavailable", not online or offline. The handler sees the device exists but cannot assess it. | B: Stale: show the last-known state from the in-memory cache with an age marker, so the handler has some information even if it may be old. Clear if the age exceeds a threshold (design to decide). | C: Keep the current behaviour (offline) until a separate UX decision is made.

DECISION: Should OOHDASH-156 be closed as a duplicate of 158, and PR 185 be superseded by the Stage 2 design gate from this work? | A: Yes (recommended): close 156, update 158 to reflect the Stage 2 scope, supersede PR 185. | B: Keep both and fold this discovery's Stage 2 into a new ticket alongside 158.

DECISION: Should the design gate for Stage 1 begin before Spencer's in-cluster batch proof (proof c)? | A: Yes (recommended): design can proceed; include a stop condition that the batch query falls back to per-device reads automatically if the in-pod call fails. Build begins only after in-cluster confirmation or fallback is proven. | B: Wait for Spencer's in-cluster confirmation before opening the design gate.
-->

# Discovery R2: OOH dashboard site lookup speed

Project ooh-triage-dashboard, repo bigtuff8/ooh-triage-dashboard, base main (v1.7.2, commit 828b93c). Date 2026-11-12. Supersedes the 10 November discovery draft (commit df14da3). Covers the 15-second lookup problem, the data-integrity defect from ECONNRESET failures, the mandatory svc-read key batch proof, and the two side defects (duplicate search rows, confirm needing multiple clicks). Ticket OOHDASH-LOOKUP-SPEED, Jira project OOHDASH, release R1.

## 0. What to read first

Spencer Thompson emailed James Brown on 11 November with a confirmed diagnosis: the problem is not the ThingsBoard service and not the network in isolation. Opening one site fires about 90 ThingsBoard calls simultaneously with no concurrency cap. Something between the pod and ThingsBoard rejects high-concurrency bursts from inside the AKS namespace: pod logs show 20 to 43 ECONNRESET failures per burst and 12 to 19 calls hanging to the 15 000 ms timeout. The same burst from a laptop runs clean in about 1.2 seconds. Spencer's fix: about 2 calls per site (batch query with latestValues), concurrency cap, cache TTL above the 30-second refresh window. His claimed outcome is 15 seconds to about 1 second.

## 1. Why the earlier fixes did not hold

OOHDASH-148 optimised the wrong stage. It parallelised Zendesk and Cosmos reads that run after confirm (saving about 10 ms) and started the site-name lookup earlier (saving about 0 ms, because the directory was already cached). The dominant cost — the ThingsBoard per-device burst before the confirm screen — was untouched. Pod logs show 15.2 to 15.4 seconds on every large cold resolve before and after 148.

The OOHDASH-133 spike (branch spike/oohdash-133-site-lookup-speed, commit f944329, 2026-10-15) had measured the real cause 11 days before 148 merged and recommended the batch fix. It was never merged to main and 148 never referenced it.

OOHDASH-158 (progressive load, design gate PR 185) is ungated. Its discovery artefact (file discovery-oohdash158-progressive-load.md, in this worktree) correctly identifies the per-device burst as the cost and proposes slim resolve with a background read (Option 1) and progressive workspace (Option 2). Those options are incorporated into Stages 1 and 2 of this plan. This discovery supersedes the 158 discovery artefact.

Systemic root cause: Done meant merged and approved, not observed in effect, and the work targeted a stage nobody had measured. Stage 0 (browser timing marks, shipped before Stage 1) closes this gap.

## 2. Current state (verified evidence)

Timings from the live pod (v1.7.2, commit 828b93c) and from outside the cluster. Source: pod logs via kubectl and the 10 November session's direct TB tests.

Pick to confirm screen (GET /resolve): 15.2 to 15.4 seconds on every cold lookup for all large sites (6803, 6762, 6835) since the pod restarted on the svc-read key (4 lookups observed). Same result for small sites (5673, 5203).

Pod log pattern per burst: 20 to 43 calls fail with read ECONNRESET; 12 to 19 hang to the 15 000 ms timeout. These are the per-device telemetry, SERVER_SCOPE, and CLIENT_SCOPE calls from fetchTelemetry.

Outside the cluster (laptop, same key mechanism): 90-call burst, zero failures, about 1.2 seconds wall time.

Confirm click to landing page (POST /confirm): 42 to 65 ms on small sites, 1 to 3 seconds on large sites. The landing page is rendered in one mutation (no progressive display).

Search (GET /api/sites/search): about 200 ms debounce plus 31 to 40 ms server. In-memory filter of the Zendesk directory (364 options, 1-hour cache). Not the bottleneck.

Data-integrity effect today: when a SERVER_SCOPE or telemetry read fails with ECONNRESET, fetchTelemetry catches the error and the device's active state is derived as false. The online rule (deriveFreshnessOnline, tb-device.js around line 702) then sets the device offline. At every large-site cold resolve today, 20 to 43 devices are being shown as falsely offline because of ECONNRESET, not because they are actually offline.

Code facts verified on origin/main commit 828b93c:
- tb-client.js line 51: timeout 15 000 ms, no retry, no concurrency cap.
- tb-device.js line 84: LIVE_CACHE_TTL 30 seconds.
- tb-device.js around line 1358: fetchTelemetry is unbounded Promise.all.
- views.js line 305: workspace refresh every 30 seconds (equals the cache TTL exactly).
- tb-device.js line 1379: CLIENT_SCOPE attributes: site, salusLocation, DHW.use_boiler, heating_scenario, CHZ1.enabled, CHZ2.enabled.
- tb-device.js line 1384: SHARED_SCOPE for boilerControl: output1OutputMask, output1Schedule, output2Schedule, output3Schedule, output4Schedule, CHZ1.schedule, CHZ2.schedule, DHW.schedule.
- tb-device.js line 111: SCHEDULE_KEYS constant lists schedules (for PowerPause).

## 3. Mandatory svc-read key batch proof

James's explicit requirement. Three sub-proofs against the corporate svc-read key (Key Vault airedale-kv-prod, secret thingsboard-read-apikey), which is the key now on the live pod.

Proof a — batch endpoint permitted under svc-read key, same device set:
The 10 November session proved the batch endpoint returns 28 to 30 devices from outside the cluster. That test may have used a personal key. This proof requires re-confirmation under thingsboard-read-apikey. Status: PENDING. James to run the proof script (details in next-steps section) and record the result in the gate review comments.

Proof b — latestValues covers all keys:
The full key list from the code (timeseries: temperature, localTemperature, temperatureC, heatingSetpoint, setPoint, setpoint, setpointC, mode, heatingActive, coolingActive, hotWater, hwBoostHours, roomSensor1Temp, output1State, switch_1, switch, switchOn, DHW.override, output4Override; CLIENT_SCOPE: site, salusLocation, DHW.use_boiler, heating_scenario, CHZ1.enabled, CHZ2.enabled; SERVER_SCOPE: active, lastActivityTime; SHARED_SCOPE: schedules, output1OutputMask, output1Schedule, output2Schedule, output3Schedule, output4Schedule, CHZ1.schedule, CHZ2.schedule, DHW.schedule). The proof test checks which keys come back for each device type on 10 or more devices across the 4 test sites (6803, 6827, 6234, 6811). Status: PENDING. Same proof script.

Proof c — batch call latency from the pod's network path:
Cannot be tested without exec access or a Spencer-run in-cluster job. Status: DEDUCED. The ECONNRESET failures are proportional to concurrency (20 to 43 out of 90 calls). A 2-call batch is far below whatever the threshold is; it is expected to succeed from the pod as it succeeds from the laptop. Direct confirmation requires Spencer to run a one-off in-cluster curl or Job with the svc-read key. James to ask Spencer. This is a stop condition before Stage 1 build: either Spencer confirms, or the design includes automatic fallback to per-device reads if the batch call fails from the pod.

## 4. The two side defects

Duplicate search rows: one row per Zendesk dropdown option, not one per site. Sites with two options (5673, 5203) show two identical rows. The 12-row cap runs before de-duplication, so duplicates crowd out real results. Fix: de-duplicate by site number before the cap. Cost: negligible (in-memory, no extra calls).

Confirm needing multiple clicks: views.js line 271 has onclick confirmSite() with no busy state and no re-entrancy guard. Each extra click fires another POST /confirm and starts another call record. Fix: re-entrancy flag, disabled button with spinner, server idempotence per operator and site for a few seconds.

## 5. Requirements

R1: T-search under 300 ms, ideally under 50 ms with client index. R2: T-gate under 500 ms. R3: T-site under 2 seconds for large sites, p95; tickets and holds may arrive later. R4: confirm fires exactly once regardless of click count; no duplicate call records. R5: search shows one row per site; 12-row cap holds real sites. R6: failed reads show device as unknown or stale, not offline (see DECISION). R7: control actions locked until devices ready and site confirmed; F004 rule preserved. R8: every release has measured p95 before and after; Stage 0 ships first. R9: cached data carries an as-of time. R10: TB key risk tracked separately in OOHDASH-161.
## 6. Stage plan

Stage 0 (1 day, ships first): browser timing marks. performance.mark for T-search, T-gate, T-site, emitted as one [UX] log line per call plus Server-Timing header on resolve, confirm, and workspace. Establishes the before baseline (T-gate today is about 15.2 seconds cold).

Stage 1 (about one week): Q1 single batch entitiesQuery with latestValues; Q2 timeout 3 seconds with one retry and a bounded agent; Q3 confirm screen from the search hit instantly; Q4 confirm busy state, spinner, server idempotence; Q5 search de-duplication; Q6 Zendesk comments parallel; Q7 confirm reuses in-flight read; Q8 client-side site index; Q9 Cosmos SQL filter. Expected T-gate under 500 ms (Q3), T-site about 300 ms (Q1 + Q2).

Stage 2 (2 to 3 weeks, folds OOHDASH-158 and closes 156): progressive site page. Confirm returns token and header immediately. Devices, tickets, and holds panels load in parallel, each with loading, empty, error, and ready states. Flows locked until devices ready. Stale-while-revalidate cache (control dispatch always reads fresh).

## 7. Acceptance criteria (what Done means)

Stage 0 ships and the before baseline is recorded (T-gate about 15.2 seconds). After Stage 1 ships, 20 or more real lookups are timed on the live site and T-gate p95 is under 500 ms and T-site p95 is under 2 seconds. The release record quotes these figures. Each fix is verified with the matching image tag on the live pod before the ticket moves to Done.

## 8. Sources

Pod logs via kubectl logs (KUBECONFIG ooh.yaml) since the svc-read key was loaded (11 November). Code on origin/main 828b93c (tb-client.js, tb-device.js, views.js, routes/api.js). Spencer Thompson email 11 November (diagnosis and fix). 10 November discovery draft commit df14da3. Jira tickets OOHDASH-133, 147, 148, 156, 158, 161. PRs 163, 177, 179, 180, 181, 184, 185.

## Addendum A: Proof test instructions for James

The proof script is at:
C:\Users\james\AppData\Local\Temp\claude\f1edd483a457e4f0\4566307b-bb28-4a7e-b7f5-6ed4335564c4\scratchpad\tb-batch-proof.mjs

To run it in the Claude session, type:
! $env:TB_API_KEY=(az keyvault secret show --vault-name airedale-kv-prod --name thingsboard-read-apikey --query value -o tsv); node "C:\Users\james\AppData\Local\Temp\claude\f1edd483a457e4f0\4566307b-bb28-4a7e-b7f5-6ed4335564c4\scratchpad\tb-batch-proof.mjs"

The script tests POST /api/entitiesQuery/find for sites 6803, 6827, 6234, and 6811. It reports the device count, latency, which keys came back, and whether the device set matches the per-device path. It never prints the key value. Paste the output into the gate review comments and record whether proof a and b passed.
