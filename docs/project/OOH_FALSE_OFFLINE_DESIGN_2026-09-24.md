<!-- gate:contract
SECTION: The design
Decide whether a device is "offline" from FRESHNESS — how long since it last reported — instead of from ThingsBoard's `active` flag. The code already fetches the last-report time (`lastActivityTime`) alongside `active` on every device read and then throws it away; this change consumes it. The rule: if the device reported within the threshold it is ONLINE; if the last-report time is missing or cannot be read it is OFFLINE; the `active` flag is demoted to a supporting hint that can only strengthen a genuinely-stale "this is dead" case — it can NEVER turn a freshly-reporting device offline. The whole change lands at ONE line where `online` is computed today, so every downstream flow that reads `online` keeps working untouched.
SECTION: Anti-flicker and threshold
The threshold starts at 48 hours — deliberately conservative until IoT confirms how often each device type should report. It is a global default with a per-device-type override hook, so when Sam's cadence answer arrives a slower-reporting type gets its own threshold with no redesign. Flicker is removed at the root: freshness is derived from the last-report time, which only ever moves forward, so it cannot flip-flop between the 30-second refreshes the way the raw `active` flag does today. A light debounce backs this up — a device is only asserted offline once it has stayed stale across a couple of polls — but given the wide clean gap in the live data (live devices reported within ~11 hours, dead ones silent 99+ hours, nothing in between) it will almost never need to engage.
SECTION: How the operator sees it
Nothing new appears on screen and no raw status light is added. The corrected liveness is a truthful conclusion that flows into the triage answers the operator already sees — the "is this device reachable?" connection-check, the heating/hot-water/kitchen reads, and the "some equipment is not responding" banner. Those all read one opaque online/offline value today; making that value truthful makes the triage outcome truthful. A device that is alive stops being sent down the connection-check dead-end; a genuinely dead one still is. This respects the theme-G boundary — we fix the shared liveness signal, not the device-health screen.
SECTION: How we prove it
We prove it against REAL devices, read-only. A test reads live ThingsBoard state (GET only, writes stay locked) for the roof units that were wrongly shown offline at sites 4631, 6886 and 6748 and confirms the new rule flips them to ONLINE, while genuinely-dead devices and never-reporting AMR meters (e.g. site 6770) stay OFFLINE. A fast unit test pins the exact rule — fresh online, stale offline, missing-timestamp offline, active-never-overrides-fresh — so the logic is locked even when live sites are quiet.
SECTION: What we still need
One confirmation from IoT before the threshold is locked: the expected reporting cadence per device type — roof units, gateways, and the AMR meters especially. Today's data shows a clean 48-hour cut, but if any type legitimately reports less often it needs its own threshold via the per-type hook. Owner: Sam Day / IoT. Until then 48 hours is the safe provisional default and does not block the build.
DECISION: Approve this freshness-based liveness design as the basis for the build stage? | Yes, approve | Request changes
-->

# OOHDASH-85 Design — truthful device liveness from report freshness

**Type:** Design (basis for build). **Date:** 2026-09-24. **Ticket:** OOHDASH-85 (theme A — false-offline / live device-status accuracy).
**Basis:** the approved spike `docs/project/OOH_FALSE_OFFLINE_SPIKE_2026-09-24.md`, signed off by James. This design does not reopen that decision; it specifies exactly how to build it.

This document specifies how the out-of-hours triage dashboard should decide whether a device is online, so that a device which is alive and reporting is never told to the operator as "offline". It changes one derivation at a single existing seam, consumes data the code already fetches, and is proven working against real devices read-only. No product code is changed by this document — the only artefact is this specification.

---

## 1. The problem in one paragraph

The dashboard decides "online" from ThingsBoard's per-device `active` flag, which is a session / inactivity-timeout signal, not a measure of "did this device just report". It reads false for devices that are still delivering telemetry, so live roof units, cellar sensors and some gateways are shown offline to the operator, and the picture visibly changes every 30-second refresh. The truthful signal — the device's last-report time — is already fetched on the same read and then discarded. This design consumes that signal and makes it authoritative.

---

## 2. The exact code seam (verified against the branch)

Everything below cites real `file:line` read on this branch (`design/oohdash-85-false-offline`).

### 2.1 What is already fetched — and where it is lost

- `services/tb-device.js:549-553` — `fetchTelemetry` fires three concurrent settled reads per device. The middle one is:
  `readServerScopeAttributes(uuid, 'active,lastActivityTime')` (line 551). **Both** `active` and `lastActivityTime` are requested from ThingsBoard.
- `services/tb-device.js:563-569` — only `active` is consumed: `bag.__active = parseActive(activeRes.value)`. The `lastActivityTime` value in the very same `activeRes.value` object is never read. **This is where the truthful signal is thrown away.**
- `services/tb-device.js:523-528` — `parseActive(attrs)` reads `attrs.active` only.
- `services/tb-client.js:122-132` — `readServerScopeAttributes` returns a plain `{ key: value }` map folded from ThingsBoard's `[{ key, value }]` array. So `activeRes.value` already contains **both** `active` and `lastActivityTime` as keys — `lastActivityTime` is a millisecond epoch number (ThingsBoard convention). No new network call is needed.
- `services/tb-device.js:614-615` — the private `__active` is destructured out of the bag and passed as `active` into `mapTbDevice({ ...d, active: __active ?? false }, ...)`.
- `services/tb-device.js:485` — `mapTbDevice` computes the field this whole ticket is about:
  `online: raw.isOnline ?? raw.active ?? false`. **This is the single line where `online` is decided.** Nothing anywhere compares the last-report time against now.

### 2.2 Who consumes `online` (why one seam is enough)

Every consumer treats `online` as an opaque boolean, so correcting it at the derivation fixes them all with no further change:

- `routes/api.js:163` — `anyOffline: site.devices.some(d => !d.online)` → the workspace "some equipment not responding" banner (`public/js/views.js:170`).
- `public/js/flows.js:147-148` — `areaRepresentative` filters to `d.online` (coldest-online heating read).
- `public/js/flows.js:342, 451, 487-489` — heating / hot-water / kitchen flows branch to the `connectivity` flow when `!online`.
- `public/js/flows.js:277-279` — `canSwitch` requires `d.online`.
- `public/js/flows.js:606-620` — the `connectivity` flow narrates the offline conclusion to the operator.
- `services/control.js:78` — dispatch refuses an offline device.

Because they are all opaque reads, **no consumer changes**. This is the "change a derivation that already runs" the spike promised.

---

## 3. The corrected derivation (build contract)

The last-report time and the freshness decision are computed inside `fetchTelemetry` (where the SERVER_SCOPE read already lands), then carried to `mapTbDevice` exactly as `__active` is today. `mapTbDevice` becomes the single place `online` is decided from freshness.

### 3.1 Parse the last-report time

Add a sibling to `parseActive` (`tb-device.js:523-528`) that reads `lastActivityTime` from the same `activeRes.value` map:

- Read `attrs.lastActivityTime`.
- Coerce to a number (ThingsBoard sends epoch-ms; accept numeric string too).
- If absent, non-numeric, `<= 0`, or `NaN` → return `null` (treated as offline downstream). This is the fail-safe: **missing/unparseable timestamp = offline.**

Carry it in the bag next to `__active` (e.g. `bag.__lastActivityTime`), and destructure it out at `tb-device.js:614` alongside `__active`/`__clientScope`, passing it into `mapTbDevice`.

### 3.2 The freshness + active combination rule (authoritative spec)

At `mapTbDevice` (`tb-device.js:485`), replace the passthrough with, in plain terms:

- Let `lastMs` = the parsed last-report time (may be `null`).
- Let `ageMs` = `now - lastMs` (only defined when `lastMs` is a valid number).
- Let `threshold` = the per-type threshold for this device's `deviceType`, defaulting to the 48-hour global (§4).
- Decision:
  1. **`lastMs` is `null` (missing / unparseable) → OFFLINE.** Full stop — `active` cannot rescue it.
  2. **`ageMs <= threshold` → ONLINE.** The device is fresh. `active` is IGNORED here — it must never turn a fresh device offline. This is the whole point of the fix.
  3. **`ageMs > threshold` → the device is stale.** Now, and ONLY now, `active` corroborates: default the stale case to OFFLINE; `active === true` may keep it marginally in-scope only if a future rule wants a grace band, but the shipped rule is simply **stale → OFFLINE**, with `active` recorded as the corroborating reason ("stale AND active=false" is the strongest dead signal). `active` can strengthen "dead"; it can never manufacture "alive" against a stale timestamp, and it can never flip a fresh device.

So `active` is pure corroboration: it only has any effect in case 3, and even there it only ever agrees with "dead". The `isOnline` short-circuit at the head of the old expression is dropped — freshness is the source of truth.

### 3.3 Where the value ends up

`mapTbDevice` still returns the same `online: boolean`. The canonical device shape (`tb-device.js:16-19`) is unchanged. The `active` boolean may additionally be retained internally as the corroboration reason for the connection-check narration (§5), but `online` remains the single opaque field consumers read.

---

## 4. Threshold: 48-hour default with a per-type hook

- **Global default: 48 hours.** Provisional, conservative, pending IoT cadence confirmation (§7). Held as one named constant, e.g. `FRESHNESS_DEFAULT_MS = 48 * 60 * 60 * 1000`.
- **Per-type override hook.** A small lookup keyed by the same `deviceType` values the registry already uses (`cls.deviceType` at `tb-device.js:473`), e.g. `FRESHNESS_BY_TYPE = { /* deviceType: ms */ }`. The resolver is: threshold for a type = `FRESHNESS_BY_TYPE[deviceType] ?? FRESHNESS_DEFAULT_MS`.
- **Why this shape.** When Sam confirms that (say) AMR meters legitimately report every 24 hours but roof units every 15 minutes, the answer is a one-line entry per type in `FRESHNESS_BY_TYPE` — no change to the derivation, the seam, or any consumer. The design is complete without the answer; the answer only tunes numbers.

---

## 5. Anti-flicker debounce

**Why flicker exists today:** the raw `active` flag flips between polls, and the workspace re-polls every 30 seconds (`public/js/views.js:138-147`), so the offline picture visibly changes refresh to refresh — exactly Tony's "worse two minutes later".

**Primary defence — freshness is monotonic.** `lastActivityTime` only ever moves forward. A device that is fresh at one poll is still fresh 30 seconds later (it is 30 seconds older but nowhere near a 48-hour threshold). So the derivation itself does not flip-flop; the root cause of the flicker is removed by construction. Given the live gap (fresh ≈ within 11h, dead ≈ 99h+), a device is never sitting on the threshold boundary where jitter could occur.

**Backstop — a debounce for the boundary case.** For the rare device genuinely hovering near its threshold, offline is only ASSERTED after the device has read stale across two consecutive polls, not on the first stale read.

- **Where the state lives:** server-side, in the same per-site read layer that already holds `perSiteCache` (`tb-device.js:585`, `LIVE_CACHE_TTL`). Keep a small `Map<deviceUuid, { firstStaleAtPoll }>` (or last-seen-fresh timestamp) alongside it. State must live server-side, not in the browser, because the 30s browser refresh (`views.js`) re-fetches `/workspace` and would otherwise lose any client-side memory on every poll and on view changes.
- **How it interacts with the 30s poll:** each workspace read is one "poll". First time a device crosses to stale, record it and still report the previous (online) value for that one read; on the next read, if it is still stale, assert offline. Because freshness only moves forward, a device that recovers (reports again) resets naturally — its age drops back under threshold and the entry clears.
- **Why it rarely engages:** the clean wide gap in real data means devices are decisively fresh or decisively stale; the debounce is insurance for a boundary that today's data does not populate. It is specified so the build has a defined behaviour, not because the data demands it.

---

## 6. How corrected liveness feeds triage (conversational-outcome, not a pill)

This obeys the governing steer: the machine assesses in the backend and surfaces a conclusion; it does not add a raw status light for the operator to interpret. Concretely:

- **No new UI surface.** No new status pill, no device-health list, no cadence numbers on screen. The corrected `online` value simply flows into the triage outcomes the operator already reads.
- **The connection-check flow tells the truth.** `flows.js:606-620` narrates "some equipment offline / gateway offline / all online" from `!d.online`. With the derivation corrected, a live-but-previously-false-offline device stops being counted as offline, so the operator is not sent down the "check the fuse board" dead-end for a device that is actually reporting. A genuinely dead device still produces the offline conclusion and script.
- **Heating / hot-water / kitchen reads become truthful.** The coldest-online representative (`flows.js:146-160`) and the per-flow `!online → connectivity` branches (`flows.js:342, 451, 489`) now reflect real liveness, so an alive device is read and acted on rather than short-circuited to connectivity.
- **The workspace banner becomes truthful.** `anyOffline` (`api.js:163`) stops firing for devices that are actually alive.
- **Theme-G boundary respected.** We change only the shared liveness signal and how the existing triage flow consumes it. Device-health UX (the broader G experience) is out of scope and untouched.

---

## 7. What we still need (does not block build)

One IoT confirmation: the expected reporting cadence per device type — roof units, gateways, and AMR meters especially. Owner: **Sam Day / IoT**. Today's live data shows a clean 48-hour cut, but any type that legitimately reports less often needs its own entry in the per-type hook (§4). Until then, 48 hours is the safe provisional default. Because the hook exists, the answer slots in as data with no redesign, so the build proceeds now.

---

## 8. How we prove it — end-to-end against real devices (read-only)

The proof must show a REAL currently-false-offline device flip to online while genuinely-dead and never-reporting devices stay offline, observed against live state, not fixtures alone.

### 8.1 Live real-device test (the decisive proof)

- **Access:** read-only. GET only to ThingsBoard, JWT auth via `credentials/thingsboard.env` (the ApiKey path is not provisioned in this environment — JWT only). Writes stay locked (`WRITES_DISABLED=true`). No secret is committed or logged.
- **Positive cases (must flip to ONLINE):** the roof units that were false-offline at sites **4631, 6886, 6748**. For each, the test performs the exact reads the app performs — the per-site device query then the SERVER_SCOPE `active,lastActivityTime` read — computes `now - lastActivityTime`, and asserts the new rule yields ONLINE (fresh) where the old `active`-only rule yielded offline.
- **Negative cases (must stay OFFLINE):** genuinely-dead devices and never-reporting AMR meters, e.g. site **6770**. The test asserts these are stale beyond threshold (or have a missing timestamp) and remain OFFLINE under the new rule — proving the fix does not manufacture false-online.
- **How it observes real state read-only:** the test calls the same read functions the product uses (`readRequest` / `readServerScopeAttributes`) or issues the equivalent GETs directly, and reads `lastActivityTime`; it never issues a write and never depends on being able to change device state. It records the observed age per device so the pass/fail is explainable ("device X last reported 4h ago → online").
- **Quiet-night resilience:** because live sites can be quiet, the live test asserts on the *derivation applied to observed timestamps* rather than requiring a device to be actively toggling, so it is deterministic against whatever real state exists at run time. If a named site is unreachable at run time the test reports it as skipped-with-reason, never a silent pass.

### 8.2 Unit test (locks the rule regardless of live conditions)

A fast, fixture-based unit test pins the combination rule so it can never regress:

- fresh timestamp (age < threshold) → ONLINE, even with `active=false` (the core false-offline fix).
- stale timestamp (age > threshold) → OFFLINE.
- missing / unparseable / `<=0` timestamp → OFFLINE.
- `active=true` never turns a fresh device offline and never rescues a stale/missing one.
- per-type threshold applied when the device's `deviceType` has an override; default 48h otherwise.
- debounce: a device stale for the first time still reports its prior value; stale on the second consecutive poll asserts offline; a device that reports again resets.

### 8.3 What "proven" means at the gate

Green unit test (rule locked) PLUS the live read showing the named roof units online and the named dead/never-reporting devices offline. Both together are the definition of done for this fix — the same standard the spike set.

---

## 9. Handoff to build

- **Contract:** §2 (seam), §3 (derivation + combination rule), §4 (threshold hook), §5 (debounce), §6 (triage consumption).
- **Load-bearing invariants build must not flatten:** freshness is authoritative; `active` is corroboration only and can never flip a fresh device offline; missing timestamp = offline; the change lands at the single `online` derivation; no new UI surface (conversational-outcome); theme-G device-health UX stays out.
- **Tests build must deliver:** §8.1 live read-only proof + §8.2 unit test, both green.
- **Open item:** §7 IoT per-type cadence (Sam Day) — provisional 48h until then; slots into the §4 hook as data.
