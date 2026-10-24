<!--
gate:contract
TICKET: OOHDASH-140
PHASE: design
QUESTIONS:
Q1: James -- when a site has several kitchen circuits, should the agent first ask "which equipment is the caller asking about?" (one chip per circuit plus "Several / all of it"), or should the dashboard skip the question and only report the circuits that look wrong?
Q2: James -- the five agreed outcomes (A to E) do not cover three real cases: a circuit that is ON with no schedule, a circuit that is ON outside its scheduled hours (someone pressed the override), and a circuit that is OFF but whose schedule could not be read. Do you approve the three extra lines in section 6.2 and the follow-up buttons in section 6.3?
Q3: James -- the Tuya key pair is in kv-airedale-prod, which is in a different Azure tenant from the OOH app. Should it reach the app by Spencer copying the two values into the existing ooh-dashboard-secrets Kubernetes secret? The feature ships switched off and is only switched on with your go.
Q4: James -- today's classifier puts Tuya devices named dhw, supplyfan and barfan into "kitchen". Should this story leave the dhw circuits out of the kitchen outcomes and raise a separate ticket for the classifier fix?
SECTION: What we are building
When a caller says kitchen equipment is not working, the kitchen flow will read each circuit's live state from Tuya (ON or OFF, plus power draw on Tongou) and its real schedule. It then tells the agent which of the five agreed outcomes applies (A to E). It is read-only. Nothing is ever sent to a device, and Tuya control stays out of scope.
SECTION: How the live data is read
The OOH server calls the Tuya EU OpenAPI directly (Option A, your discovery decision). A live check on 2026-10-24 found that one call per site (the site's device list) already returns every circuit's switch state, power and online flag in about half a second. Schedules need one extra call per kitchen circuit, and those are cached for 5 minutes. All Tuya reads run alongside the ThingsBoard reads. They have a hard 3-second budget, so they can never slow the page down by more than that. OOH is capped at 5 Tuya requests per second, and it backs off for 60 seconds at the first rate-limit signal, so it cannot use up the quota the Tuya Scheduler shares. Tuya gives every caller the same project token (checked live), so OOH cannot break the Scheduler's login.
SECTION: If Tuya fails
Your discovery condition was that a Tuya failure must never break the app. In this design it can't. A failure, timeout, missing credentials or unmatched device marks that circuit's live data "unavailable". The kitchen flow then falls back to exactly today's behaviour, with one line saying live circuit state could not be read. After 3 failures in a row the server stops calling Tuya for 60 seconds. The feature ships switched off behind a flag. While it is off the dashboard behaves exactly as it does today.
SECTION: What changes for the agent
The agent picks the equipment the caller means (if there is more than one circuit). The dashboard then shows one of the agreed outcomes with its script, for example "Fryer 1 is OFF but the schedule says it should have come on at 10:30". Follow-up buttons let the agent record whether the override fixed it, or escalate as today (P1 if service-critical, otherwise captured for the IoT team).
SECTION: Security
The OOH server will hold a Tuya key pair that can also change schedules. To keep it read-only in practice, the new Tuya client has no write methods at all. It only allows a fixed list of GET paths, never logs the token or signature, and drops the per-device local_key the moment the device list is parsed. A unit test enforces all of this.
DECISION: Which circuit does the outcome describe? | Ask "which equipment?" with one chip per circuit plus "Several / all of it" (recommended) | No question: summarise only the circuits that look wrong
DECISION: Extra outcome lines and follow-up buttons (sections 6.2 and 6.3) | Approve as written (recommended) | Approve with my wording changes (comment below)
DECISION: How the Tuya credentials reach the app | Spencer copies them into the ooh-dashboard-secrets secret; feature flag off until your go (recommended) | Another route (comment below)
DECISION: dhw / supplyfan / barfan classified as kitchen | Leave dhw circuits out of kitchen outcomes now and raise a separate classifier ticket (recommended) | Leave as-is
-->

# OOHDASH-140 Design: live Tuya circuit state and schedules in the kitchen flow

**Date:** 2026-10-24 · **Phase:** design · **Discovery:** PR #132 (merged 2026-10-23) · **Branch:** design/oohdash-140

## 1. Summary

The kitchen flow only knows whether each circuit is online and has a static ThingsBoard schedule string. It can't tell a caller why the fryer is off. This design adds a read-only Tuya read path to the OOH backend. For each kitchen circuit the dashboard will then know:

1. is the relay ON or OFF right now (`switch_1`), and for Tongou, is it drawing power (`cur_power`);
2. what the real Tuya schedule says it should be doing right now;
3. when the schedule next changes.

The backend turns those facts into one of the five outcomes James agreed in discovery (A to E). The flow then shows the agreed wording. Tuya control (switching, schedule edits) is **out of scope**.

## 2. Decisions already made by James

| # | Decision | Source |
|---|---|---|
| Option A | The OOH backend reads live state directly from the Tuya API on demand | Discovery gate review, PR #132 |
| Fail-safe | "Must ensure that the app fails gracefully if tuya api call fails for any reason" | Discovery gate review comment, PR #132 |
| SA5 | Outcome labels and scripts for branches A to E are final | Discovery SA5, agreed before the gate |
| Scope | Read only; Tuya control is a separate story | Discovery recommendation |

## 3. New evidence from design (read-only, 2026-10-24, site gk-6863)

| Finding | Verdict | Design consequence |
|---|---|---|
| `GET /v1.0/users/{uid}/devices` returns, per device, `id`, `name`, `product_id`, `product_name`, `online` **and a `status` array** with `switch_1`, `cur_power`, `online_state`, etc. 14 devices in 487 ms | PROVEN | Live state for the whole site is **one call**. Per-device status calls are not needed |
| The same listing also returns each device's `local_key` (the device's local encryption key) | PROVEN | Dropped at parse; never stored, logged or sent to the browser (section 9) |
| `GET /v2.0/cloud/thing/{id}/shadow/properties?codes=schedule` filters to the schedule property (93 ms) | PROVEN | OWON schedule read is one small call |
| `GET /v2.0/cloud/timer/device/{id}` returns a plain array; entry keys `time, loops, functions, enable, timezone_id, timer_id, category, date` (86 ms) | PROVEN | Tongou schedule read is one call; `timezone_id` is used when present |
| Two `grant_type=1` token requests 3 s apart returned the **identical** access token (same hash) with `expire_time` counting down (1690 s, then 1687 s). An earlier request had returned 2611 s, not a fresh 7200 | PROVEN | Tuya hands every caller the project's one current token, so OOH taking a token cannot invalidate the Tuya Scheduler's. OOH never calls the refresh-token endpoint, which is the only call that could rotate it |
| Tongou product name at gk-6863 is "Din Rail Wi-Fi Switch with metering" | PROVEN | The relay key is `switch_1`. The Scheduler's `switch` key applies only to the "wifi din rail switch" / "breaker" product names. The read takes `switch_1` and falls back to `switch` |
| `k8s/deployment.yaml` pins `replicas: 1` (session affinity) | PROVEN | Per-process token cache, rate limiter and breaker are the whole-app limits today. If replicas ever go above 1, the limits multiply by the replica count (section 9) |
| `classifyDevice` puts glasswasher, merrychef, coffeemachine, hcupboard, heatedgantry, supplyfan, barfan **and dhw** into `kitchen` once TB reports a switch key. Fridge, freezer and cellar go to refrigeration; extractfan goes to fan; externallighting goes to lighting | PROVEN (unit run of the live classifier) | Kitchen circuit set = existing `kind === 'kitchen'`. The dhw problem is decision Q4 |
| Existing `services/schedule.js` already handles `loops` strings with `dayOrder: 'sun-first'` and Europe/London DST-safe time maths | PROVEN (code) | Reuse its time helpers; no second time library |

## 4. Architecture

### 4.1 Where the read happens

The read runs **inside the live per-site workspace build** (`services/tb-device.js`, live branch of `getSitesByNumber`, around the `fetchTelemetry(matched)` call at line 1492). It runs concurrently with the ThingsBoard reads:

1. A workspace request arrives (30 s browser refresh, 30 s per-site cache).
2. Two reads start at the same time: the existing TB inventory plus `fetchTelemetry(matched)`, which is unchanged, and `tuyaListing(site)`, which is one call.
3. Once both settle, the TB devices are mapped to canonical devices (existing code).
4. `attachTuya(devices, listing)` matches the kitchen devices to Tuya devices by name.
5. Schedules are fetched for the matched kitchen circuits (5-minute cache, concurrency 6).
6. The schedule is evaluated and a verdict computed per circuit, giving `device.tuya`.

The whole Tuya part (listing, schedules, evaluation) runs inside one `Promise.race` with a **3000 ms budget**. If the budget expires, every kitchen circuit still waiting gets `tuya.status = 'unavailable', reason = 'timeout'` and the workspace returns as normal. Schedule calls already in flight still complete and fill the cache, so the next refresh usually has them.

Rejected alternative: a separate `/api/sites/:siteNo/kitchen-live` endpoint fetched when the kitchen tile is opened. It saves Tuya calls for non-kitchen calls, but the flows render synchronously from the workspace. It would need a new loading state and a second failure surface. The cost of doing it in the workspace build is small: one listing call per open site per 30 s, plus cached schedules.

### 4.2 Fixture mode

In fixture mode the Tuya client is **never called**. Fixture kitchen devices may carry a `tuyaFixture` block (raw listing status plus raw schedule, in the same shape the API returns). It goes through the **same** decode, evaluate and verdict code, so e2e tests exercise the real logic. Fixture devices without the block get no `tuya` field and behave exactly as today. Existing e2e specs, such as the `kitchen-notcritical` path in `rosetta-dark-fleet-and-schedule.spec.js`, are therefore unchanged.

### 4.3 Feature flag

`TUYA_READ_ENABLED` (default `false`). When false, or when the credentials are missing, no Tuya call is made and no `tuya` field is attached. The dashboard is then identical to v1.4.7. A missing credential with the flag on logs one warning at startup; the app still starts.

## 5. Backend design

### 5.1 New module `services/tuya-client.js` (GET-only signed client)

- Host `https://openapi.tuyaeu.com`. Credentials `config.tuya.clientId` / `config.tuya.clientSecret` from env `TUYA_CLIENT_ID` / `TUYA_CLIENT_SECRET`.
- Signing is ported from the proven Tuya Scheduler `_sign` / `_encodePath`: HMAC-SHA256 over `client_id + access_token + t + METHOD\nSHA256(body)\n\n + decoded sorted path`, upper-case hex. Headers are `client_id, sign, t, sign_method, access_token`.
- Token: `GET /v1.0/token?grant_type=1`, cached until `expire_time - 60 s`. Single-flight refresh, so concurrent requests share one token request.
- **Exports one function, `tuyaGet(path)`.** There is no POST, PUT, PATCH or DELETE code path in the module. The path must match an allowlist:
  - `^/v1\.0/token\?grant_type=1$`
  - `^/v1\.0/users/[A-Za-z0-9]+/devices\?page_size=100(&last_row_key=[^&]+)?$`
  - `^/v2\.0/cloud/timer/device/[A-Za-z0-9]+(\?last_row_key=[^&]+)?$`
  - `^/v2\.0/cloud/thing/[A-Za-z0-9]+/shadow/properties\?codes=schedule$`
- Per-request timeout of 2500 ms (AbortController). HTTP 429 or body code 1009 are treated as rate-limited. A non-2xx response, or `success !== true`, is a failure (Scheduler rule A05: a failed read is never treated as "empty").
- **Global limiter (per process):** at most 4 Tuya requests in flight and at most 5 requests per second (token bucket). Requests over the limit wait inside the 3-second budget and otherwise fail with `rate-limited`. This caps OOH's load at 5 req/s **however many sites are open at once**.
- Circuit breaker: 3 consecutive failures, or **any** 429/1009 rate-limit response, open the breaker for 60 s. While it is open, calls fail immediately with reason `circuit-open`. OOH backs off first, so the Tuya Scheduler keeps the shared quota.
- Token errors (Tuya codes 1010 / 1011, token invalid or expired): drop the cached token, re-grant once, then fail. If the token changes before the cached expiry, a warning `tuya_token_changed_early` is logged, which would reveal unexpected rotation.
- Counters for calls, failures, rate-limit responses and breaker openings are added to the existing `services/metrics.js`.
- Logging: method, redacted path, status, duration. The token, signature, client id, secret and `local_key` are never logged.

### 5.2 New module `services/tuya-read.js` (site read, decode, evaluate)

- **Site map:** `data/tuya-sites.json` is a snapshot of the Tuya Scheduler's `sites.json` (site key → Tuya user UID; 210 `gk-` entries plus other brands). The key is `${brand}-${siteNo}`. If a site is not in the map, its circuits get `reason: 'no-site-map'`. The refresh procedure (copy the Scheduler file, commit) goes in `docs/RUNBOOK.md`.
- **Listing:** `readSiteListing(brand, siteNo)` pages `users/{uid}/devices`. It keeps only `id, name, product_id, product_name, online, status` and drops `local_key` and the other fields immediately.
- **Model:** `owon` if `product_id` is in `{xr5kjdxfxavku0gb, vnxcwomqkofjhjcc}`, otherwise `tongou`. This is the same rule as Scheduler `detectDeviceType`.
- **Live fields from the listing `status` array:**
  - `switchOn` = `switch_1`, falling back to `switch`; `null` if neither key is present.
  - Tongou `powerW` = `cur_power / 10`.
  - OWON `powerW` = sum of `active_power_a/b/c`. It is carried in the contract but **not used for a verdict**, because branch E is agreed for Tongou only.
  - `online` = the listing `online` flag.
- **Name match:** TB `deviceId` (the TB name) and the Tuya `name` are compared after `normaliseName`. No match gives `not-found`, and two Tuya devices with the same name give `ambiguous`. Either way the circuit is unavailable, never guessed. The known `go-6851-externallighting-1` mis-prefix will simply not match, which is fine because it isn't kitchen anyway.
- **Schedules** (kitchen matches only, concurrency 6):
  - OWON: `shadow/properties?codes=schedule`, base64-decode, 5 bytes per entry `[dayMask(bit0=Sun), hour, minute, on(1)/off(0), enabled]`. `AA==`, `""` and an absent property all mean no entries.
  - Tongou: `cloud/timer/device/{id}` (paged). Each entry has `time`, `loops` (position 0 = Sunday), `functions[0].value` and `enable`.
  - Both are normalised to `{ time:'HH:MM', loops:'<7 chars, Sun first>', on:boolean, enabled:boolean, tz }`. `tz` is the timer's `timezone_id` if present, otherwise `Europe/London`.
  - Cache: per Tuya device id, 5 minutes on success and 30 s on failure (negative cache).

### 5.3 Schedule evaluation: new pure function in `services/schedule.js`

`evaluateSchedule(entries, now, { tz })` reuses the existing `getLocalParts` / `buildCandidateUtc` helpers.

1. **Active entries** are those with `enabled === true` and at least one `1` in `loops`. If there are none, the result is `state: 'none'`. This covers OWON `AA==` and empty blobs, Tongou `[]`, and the gk-6832-hcupboard-1 case where every timer is disabled and its loops are `0000000`.
2. **Last change:** walk back from `now` over today and the previous 7 days to find the most recent firing of an active entry. Its `on` value is the **expected state**. If two entries fire at the same minute with different values, OFF wins, so a conflict can never produce a false "should be on".
3. **Next on / next off:** the first firing strictly after `now` with `on === true` / `on === false`, searched over today plus 7 days.
4. **No ON entries at all** (an OFF-only "safety off" programme) gives `state: 'off-only'`. The flow treats it like "schedule unavailable" (section 6.2, line F3) rather than inventing an ON time.
5. Returns `{ state: 'on'|'off'|'none'|'off-only', lastChange, nextOn, nextOff, entryCount }`, where each time is `{ time:'HH:MM', dayText:'today'|'tomorrow'|'yesterday'|'<Weekday>', atMs }`.

DST is handled the same way the existing decoder handles it: each candidate date is resolved independently through `Intl` in the entry's timezone.

### 5.4 Verdict: new pure function `kitchenCircuitVerdict(tuya)` in `services/tuya-read.js`

Rules are applied in order, and the first match wins:

| # | Condition | Verdict |
|---|---|---|
| 1 | `status !== 'ok'` | `fallback` |
| 2 | `online === false` | `offline` (connectivity divert, as today) |
| 3 | `switchOn === null` | `fallback` |
| 4 | ON, Tongou, `powerW !== null` and `powerW < 1.0` | **E** |
| 5 | ON, schedule `on` | **B** |
| 6 | ON, schedule `off` | `B-outside` (new line F2) |
| 7 | ON, schedule `none` / `off-only` / unavailable | `B-unscheduled` (new line F1) |
| 8 | OFF, schedule `on` | **A** |
| 9 | OFF, schedule `off` | **C** |
| 10 | OFF, schedule `none` | **D** |
| 11 | OFF, schedule `off-only` / unavailable | `off-unknown` (new line F3) |

`ZERO_LOAD_W = 1.0` is a named constant. Tongou `cur_power` is in tenths of a watt, so this means a raw value below 10.

### 5.5 Placement in `tb-device.js`

- In the live branch of `getSitesByNumber`, start `tuyaListing` at the same time as `fetchTelemetry(matched)`. After `devices` are mapped, call `await attachTuya(devices, listing, { budgetMs: 3000 })`.
- `attachTuya` sets `device.tuya` on `kind === 'kitchen'` devices only, excluding dhw-token names if Q4 is approved. Lighting and fan keep using TB `telemetry.switch_1` unchanged.
- **`telemetry.switch_1` is not overwritten.** The control confirm loop and `canSwitch` keep reading TB telemetry exactly as today. Tuya data lives only under `device.tuya`.
- `routes/api.js` `workspacePayload` spreads devices through `stripDemo`, so `tuya` reaches the browser with no route change. `tuyaFixture` is stripped there so raw fixture data never leaks.

## 6. Kitchen flow design (`public/js/flows.js`, `FLOWR.kitchen`, line 1217)

### 6.1 Stages

| Stage | Behaviour |
|---|---|
| 0 | No kitchen circuits: unchanged. **Legacy mode** (no circuit has `tuya`, i.e. flag off or fixture without the block): the existing flow exactly (offline divert, then the business-critical question). **Live mode:** 1 circuit goes straight to its outcome. More than 1 asks "Which equipment is the caller asking about?" with one chip per circuit (`tuya.displayName`, e.g. "Fryer 1", "Glasswasher 2") plus "Several / all of it" (Q1) |
| 1 | The chosen circuit's verdict. `offline` gives the existing connectivity divert. `fallback` gives the line "Live circuit state couldn't be read just now." followed by the existing business-critical question and existing outcomes. A to E and F1 to F3 give an outcome card (label, script, follow-up chips). "Several / all of it" lists one line per circuit, with offline circuits shown as "[Zone] is not reporting". The script and chips come from the highest-priority verdict present, in the order A, D, F3, E, C, F2, F1, B |
| 2 | Follow-up chips (section 6.3) end in the existing `outcomeCaptured` / `outcomeP1` helpers |

`[Zone]` / `[device]` is `tuya.displayName`: the TB label if it is not just the raw name, otherwise a caller-friendly name from the zone token plus its number. The friendly names are fryer: "Fryer", grill: "Grill", glasswasher: "Glass washer", dishwasher: "Dishwasher", potwash: "Pot wash", bainmarie: "Bain-marie", merrychef: "Merrychef oven", hcupboard: "Hot cupboard", heatedgantry: "Heated gantry (pass)", coffeemachine: "Coffee machine", supplyfan: "Kitchen supply fan", barfan: "Bar fan". An unknown token gets title case. The number is dropped when the site has only one of that type, so `gk-6863-glasswasher-2` becomes "Glass washer 2" and `gk-6863-fryer-1` becomes "Fryer". A time shows as `HH:MM`, with a day added when it isn't today ("10:30 tomorrow", "11:00 on Sunday").

### 6.2 Wording

**Agreed (SA5, final, used verbatim):** branches A, B, C, D and E, exactly as written in the discovery doc SA5.

**New lines for gaps not covered by A to E (Q2, for approval):**

| Line | When | Outcome label | Agent script |
|---|---|---|---|
| F1 | ON, no usable schedule | "[Zone] is ON (it has no schedule, so it stays on)." | Same as B |
| F2 | ON outside scheduled hours | "[Zone] is ON outside its scheduled hours — it has probably been switched on at the PowerPause unit. Next scheduled change: OFF at [next off time]." | Same as B |
| F3 | OFF, schedule unreadable or OFF-only | "[Zone] is OFF. Its schedule couldn't be read, so the dashboard can't tell whether that's expected." | "The [device] is showing as off, but I can't see its schedule right now. The PowerPause device has a manual override button on the front — pressing it once should bring the circuit on." |

### 6.3 Follow-up chips and outcomes (Q2, for approval)

| Verdict | Chips | Outcome |
|---|---|---|
| A, C, F3 | "Sorted with the override" | Captured, class `kitchen-powerpause`. A: "Kitchen circuit didn't start on schedule; resolved with the on-site override". C / F3: "Kitchen circuit needed outside its schedule; on-site override used" |
| A, C, F3 | "Override didn't work" | Existing business-critical question, then existing P1 / captured outcomes |
| D | "Fuse board had tripped — reset fixed it" | Captured: "Always-on kitchen circuit had tripped; reset on site" |
| D | "Fuse board is fine / still off" | Existing business-critical question, then existing P1 / captured |
| B, E, F1, F2 | "Site will contact their repairs team" | Captured: "Power reaching [Zone]; appliance fault suspected; site referred to repairs" |
| B, E, F1, F2 | "Caller still says it's our problem" | Existing business-critical question, then existing P1 / captured |

Every captured or P1 ticket detail starts with a fact line, for example: *"Live Tuya read 21:42: Fryer 1 relay OFF; schedule expected ON since 10:30 today."*

## 7. Data contract: `device.tuya` (kitchen devices only, live mode only)

| Field | Type | Meaning / source |
|---|---|---|
| `status` | `'ok' \| 'unavailable'` | `ok` means the listing matched this device |
| `reason` | `null \| 'no-site-map' \| 'not-found' \| 'ambiguous' \| 'timeout' \| 'api-error' \| 'rate-limited' \| 'circuit-open'` | Why it is unavailable |
| `model` | `'tongou' \| 'owon' \| null` | From `product_id` |
| `online` | `boolean \| null` | Listing `online` |
| `switchOn` | `boolean \| null` | `switch_1`, falling back to `switch` |
| `powerW` | `number \| null` | Tongou `cur_power/10`; OWON sum of `active_power_a/b/c` |
| `readAtMs` | `number` | When the listing was read |
| `schedule.state` | `'on' \| 'off' \| 'none' \| 'off-only' \| 'unavailable'` | Section 5.3 |
| `schedule.lastChange` / `nextOn` / `nextOff` | `{ time, dayText, atMs } \| null` | Section 5.3 |
| `schedule.entryCount` | `number` | Active entries |
| `verdict` | `'A'\|'B'\|'C'\|'D'\|'E'\|'B-outside'\|'B-unscheduled'\|'off-unknown'\|'offline'\|'fallback'` | Section 5.4 |
| `displayName` | `string` | Section 6.1 |

The flow reads only `verdict`, `displayName` and the `schedule` times. It never re-derives state. When `tuya` is absent, the flow is in legacy mode.

## 8. Error handling (the James fail-safe condition)

| Failure | Effect |
|---|---|
| Flag off or credentials missing | No calls, no `tuya` field; v1.4.7 behaviour exactly |
| Site not in UID map | `unavailable/no-site-map`; fallback line plus the existing flow |
| Token or listing fails, 429/1009, or non-JSON response | All kitchen circuits `unavailable`; breaker counts it |
| 3-second budget exceeded | Circuits not yet resolved get `unavailable/timeout`; workspace returns on time |
| One schedule call fails | That circuit's `schedule.state = 'unavailable'`, giving F1 or F3. The live state is still shown |
| Device not matched or ambiguous | That circuit is `unavailable`; the others are unaffected |
| Any exception in decode or evaluate | Caught per circuit and recorded as `fallback`; never thrown to the workspace |

No Tuya failure can turn a workspace request into an error response, and none changes the degraded banner. The banner stays tied to ThingsBoard and the bridge.

## 9. Security

- **The key pair can write schedules on every linked device** (CIR `TUYA_OPENAPI_ACCESS.md`, blast radius). Mitigation: section 5.1. The module has no write methods and a GET path allowlist. The unit test asserts that the module source contains no `'POST'|'PUT'|'PATCH'|'DELETE'` method strings and that a non-allowlisted path throws.
- `local_key` is removed at listing parse. A test asserts it is absent from `device.tuya` and from the workspace JSON.
- **Secrets.** `kv-airedale-prod` is in tenant `238e24db`, and the OOH pod's workload identity is in `002bfc30`, so a direct Key Vault read is not available. Recommended (Q3): Spencer adds `TUYA_CLIENT_ID` / `TUYA_CLIENT_SECRET` to the existing `ooh-dashboard-secrets` secret. Nothing goes in code, docs, logs or the manifest. A message to Spencer will be drafted for James to approve first; nothing will be sent without that.
- **Shared quota with the Tuya Scheduler.** Typical load is about 2 listing calls per minute per open site, plus at most one schedule call per kitchen circuit every 5 minutes. Incident storm: 20 sites open at once with 12 kitchen circuits each comes to about 40 listing calls per minute plus 240 schedule calls per 5 minutes, roughly 1.5 req/s. That is below the hard 5 req/s cap. The cap holds at any number of open sites, because extra requests are queued or dropped to the fallback, never sent. Any rate-limit response opens the breaker for 60 s (section 5.1).
- **Token.** Shared by Tuya's design and verified (section 3). OOH only ever uses `grant_type=1`, never the refresh endpoint, so it cannot rotate the token the Scheduler holds.
- **Replicas.** The deployment is pinned to 1 replica. If that ever changes, the per-process limiter becomes N × 5 req/s, and the build must then lower the per-process cap to keep the total at or below 5 req/s.

## 10. Out of scope

- Tuya control (switch, countdown, schedule edits): separate story, via TB and the bridge.
- Lighting and fan flows: they keep using TB `telemetry.switch_1`.
- Showing schedules outside the kitchen flow.
- An OWON zero-load outcome (branch E is agreed for Tongou only; the OWON power figure is carried for later).
- Fixing the classifier for dhw, supplyfan and barfan (Q4 proposes a separate ticket).

## 11. Tests the build must add

| Area | Cases |
|---|---|
| `tuya-client` unit | Signature matches a known vector from the Scheduler algorithm; token single-flight and expiry; allowlist rejects other paths; no write methods (source scan); timeout; 429/1009 rate-limited; `success:false` is a failure; breaker opens after 3 failures and closes after 60 s; nothing secret-shaped in logs |
| OWON decode | `AA==`, `""`, absent property; one entry; 16 entries; disabled entry kept but inactive; bit 0 = Sunday |
| Tongou normalise | `[]`; all disabled with `0000000`; `switch` vs `switch_1`; `timezone_id` honoured |
| `evaluateSchedule` | on / off / none / off-only; previous-day carry-over (e.g. Sunday 09:00 after Saturday 22:30 OFF); same-minute conflict gives OFF; next on tomorrow / on a weekday; DST spring-forward and fall-back days |
| `kitchenCircuitVerdict` | Every row of the section 5.4 table, including E only for Tongou and the `ZERO_LOAD_W` boundary |
| `attachTuya` | Name match after `normaliseName`; not-found; ambiguous; only kitchen kind; `telemetry.switch_1` untouched; `local_key` absent; 3-second budget gives `timeout` and the workspace still resolves |
| Route | Workspace JSON carries `tuya` and never `tuyaFixture` or `local_key`; flag off gives no `tuya` |
| e2e (Playwright) | A fixture site with `tuyaFixture` circuits using time-independent schedules (e.g. ON 00:00 daily with no OFF gives expected ON; OFF 00:00 daily with ON Sunday 00:00 gives expected OFF). Covers the picker, A, B, C, D, E, F3, "Several / all of it", follow-up chips reaching captured / P1, and the fallback line. Existing kitchen specs stay unchanged (legacy mode) |

## 12. Cost, risk and rollout

- **Cost:** no new LLM calls. One Tuya listing call per open site per 30 s and cached schedule calls. Up to 3 s extra on a workspace build only when Tuya is slow; normally about 0.5 s, run in parallel with ThingsBoard.
- **Risk: false E.** An idle appliance (e.g. a bain-marie at temperature) can legitimately draw 0 W. E says "may have tripped", and its action (contact repairs) is the same as B, so a false E gives the agent the same advice. Accepted.
- **Risk: snapshot drift.** `data/tuya-sites.json` can fall behind the Scheduler. A missing site degrades to the fallback, never to a wrong answer. The refresh procedure goes in the runbook.
- **F2 wording and override latching.** The Tongou button holds until the next scheduled timer event (discovery SA2, confirmed). OWON is only assumed to behave the same. F2 therefore states the next scheduled change as a fact and makes no claim about when the override ends.
- **Risk: write-capable key in the OOH pod.** Mitigated by the GET-only client (section 9). A read-only Tuya project key would be better, but none exists today.
- **Rollout:** ships dark behind `TUYA_READ_ENABLED=false` in a minor release (v1.5.0). Production enable needs the secret (Q3) **and** James's explicit go. Rollback is setting the flag to false, with no redeploy of code.
