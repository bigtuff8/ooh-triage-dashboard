# OOH Dashboard — ThingsBoard-Direct Read + Control Design (implementation-ready)

**Timestamp:** 2026-09-17 · **Stage:** Design (pre-build) · **Owner:** James Brown
**Predecessors:** decisions gate `OOH_TB_DIRECT_DESIGN_DECISIONS.md` (PR #25, **approved + merged**, D1–D10); evidence `OOH_TB_DIRECT_VALIDATION_REPORT.md`; contract `OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md`; impact `OOH_TB_DIRECT_CONTROL_SPEC_IMPACT_2026-09-17.md`.
**Interactive review:** `mockups/OOH_TB_DIRECT_design_review.html`.

This design turns the approved decisions into a buildable spec across two planes — the **read plane** (a TB-direct inventory service replacing the bridge `/api/devices` read) and the **control plane** (the write/confirm loop honouring Spencer's contract). **Control v1 = Tuya `switch` + `setpoint` (Salus + Intesis); mode/on-off + Salus IT500 hwBoost HELD.** No product code is written until this design gate is approved.

---

## 1. Architecture in one picture

- **Read:** dashboard → `services/tb-device.js` → TB REST (`/api/tenant/devices?textSearch=…`, telemetry) using the read-scoped `Airedale Read Only` role → canonical site/device shapes (unchanged) → existing consumers untouched.
- **Control:** operator action → `services/control.js` (validate → **edge-classify** → dispatch) → `tb-client.writeSharedAttribute` (SHARED_SCOPE `*Desired`, control account) → the integration-bridge dispatches to the vendor → writes back `*Reported`/`*SyncStatus` **telemetry** → confirm loop reads **timeseries** and settles on a *fresh* echo.
- **Invariant:** ThingsBoard is the system of record; the bridge stays behind TB for command dispatch. `WRITES_DISABLED=true` stays on live until James lifts it. No product code this stage.

---

## 2. Read plane — `services/tb-device.js`

### 2.1 Interface preservation (C8)
The new module exports the exact `services/bridge.js` surface so `control.js`, `routes/api.js`, `public/js/flows.js`, `public/js/views.js`, `registry.js`, `resolution.js`, `liveness.js` are untouched by the read swap:
`getSites()`, `getSitesByNumber(siteNo)`, `searchSites(query)`, `getDevice(siteNo, deviceId)`, `bridgeStatus()`. Canonical shapes preserved verbatim (`bridge.js:14-16`, `mapBridgeDevice` `bridge.js:69-89`); additive fields only (`isDuplicate`, `hasReported`).

**Swap tactic (de-risked, two-step):** build `tb-device.js`; reduce `services/bridge.js` to a one-line re-export shim (`export * from './tb-device.js'`) so the swap lands green with zero consumer edits; then repoint the 6 importers (`routes/api.js:10`, `resolution.js:14`, `control.js:18`, `overrides.js`, `liveness.js:23`, `server.js:54`) and delete the shim. Keeps the corrective `deviceId` change and the read rewrite independently bisectable.

### 2.2 `deviceId` = TB device NAME (corrective — C8)
Today `mapBridgeDevice` sets `deviceId: raw.deviceId` = the bridge vendor id (`salus-gk-6261-it700tx-025e0726`), but the control path resolves the TB UUID **by name** (`tb-client.js:105` `?deviceName=`), so live control is latently broken (masked by the write-lock; CI mocks tb-client). Fix: `deviceId: raw.name` at the single mapping boundary — necessary (all of `tbDeviceUuid`/write/read are name-keyed) and sufficient (every other consumer treats `deviceId` as opaque). Cutover note: in-flight holds keyed on the old id won't match — acceptable (write-lock on, no live holds); flag in the release runbook.

### 2.3 Site query (D1) — over-fetch → anchored-filter → alias map
Defeats both TB `textSearch` failure modes: bare-form bleed (`gk-626` → 113 devices across 5 sites) and anchored-form split-loss (`md-1110` loses 95%).
1. Resolve `{brand, tokens}` from a curated `data/site-aliases.json` overlay (default `tokens=[siteNo]`); most sites need no entry.
2. One broad `textSearch=${brand}-${tok}` fetch per token, paginated (`pageSize=200&page=N` until `hasNext=false`), deduped by TB id.
3. Client-side **anchored filter**, case-insensitive: `^${brand}-(${tokens.join('|')})(?![0-9])` over a normalised name. The load-bearing boundary is `(?![0-9])` — a digit after the token = a different numeric site (drop the bleed); a letter/dash/end = the same site's glued asset (`gk-6209fryer-1` kept) or an alt token (`md-1110meridian` kept via alias).
4. Group → canonical site(s); return `[] | [site] | [site,site]` (ambiguity preserved for `resolution.js:36`).

**Alias map** = a small in-repo exceptions overlay seeded from the estate-scan's 50 collision pairs + known text-token sites; refreshed by a documented **offline** job (never a runtime full-estate pull on the ~12,801-device tenant). Name normalisation strips parentheticals (`(5135)` cross-refs — mis-site guard), collapses spaces, maps `_`→`-`.

### 2.4 `classifyDevice(name, profile, telemetry)` (D2)
Capability-first, typo-tolerant, covers the 19 undocumented profiles (~646 devices). Returns `{kind, deviceType, deviceTypeLabel, controllable, control:{attribute,type}}`.
- **Controllability derived from telemetry/attribute signals, never the profile label** (C7 — controllable Salus sit on the `default` profile at 18 sites; kitchen gear on `gatewayDevice`): a normalised Tuya switch signal → `tuya`/`switchDesired`; setpoint+salus → `salus-it700`/`salus-it500`/`setpointDesired`; AC → `intesis`/`setpointDesired` (mode held).
- **`kind`** ∈ `heating|hotwater|kitchen|lighting|fan|gateway|unknown` mapped from `(assetType, profile)` intent for the SCOPE_GROUPS/flows.
- **`deviceType`** must be a `registry.js:11-44` key (the hard join for `capabilitiesFor`/`setpointWindow`/`validateCommand`).
- **Typo tolerance:** known-typo map (`extracfan→extractfan`, `bainmare→bainmarie`) then bounded fuzzy (Levenshtein ≤2), never across a control boundary.
- **Exceptions handled:** spaces, parenthetical cross-ref site numbers, `(old)` duplicates (`isDuplicate`, excluded from control), missing `-n`, hex-UUID/id suffixes, raw devEUI/bare-number/underscore-doubled names, case variance.
- Read plane exposes *capability* only; whether the UI offers control is the separate control-plane wiring — dormant flows stay monitor-only until D10 lands.

### 2.5 Telemetry population (required, not optional)
Map TB telemetry → the canonical `telemetry{}` keys consumers read: `heatingSetpoint` (LOAD-BEARING — `registry.js:80-81` refuses setpoint without it), `localTemperature`/`temperature`, `mode`, `heatingActive`, `hotWater`→`hotWaterCapable`, `hwBoostHours`, `roomSensor1Temp`, `output1State`, and the **switch normalisation** `switchReported(fresh) → switchOn → switch_1` folded into canonical `switch_1` (never trust stale `switch_1` first). Bulk latest telemetry via `POST /api/entitiesQuery/find` (one round-trip/site page; per-device `values/timeseries` fallback — verify at build, open item).

### 2.6 Search index (D8) + `bridgeStatus()` latch (D8)
- **Pub-name search:** TB `textSearch` can't do it. Source the search index from the **Zendesk site directory** (`{siteNo, siteName, brand}`, cached hourly — `zendesk.siteDirectory()` new additive export). `searchSites(q)` filters the directory (siteNo prefix OR name-includes), returns the same shape/limit as `bridge.js:186`, with **no TB call** on the search path. Behaviour delta: search now spans the directory, not just live-inventory sites (an improvement; flagged).
- **`bridgeStatus()`** re-implements the boolean `{mode, healthy, lastError}` latch (`bridge.js:201-207`) that the degraded banner (`api.js:41,153`), `liveness.producerHealthy()` (`liveness.js:100`) and `server.js:54` consume — **not** delegated to the tri-state `tbStatus()`. Live-read failure flips `healthy:false`; `getSites*` still throw so callers fail safe to capture-and-escalate.

### 2.7 Caching + auth
- Keep `LIVE_CACHE_TTL=30s`, re-keyed **per site** (`perSiteCache: Map<siteNo,{sites,at}>`). Per-site Zendesk name enrichment preserved (`nameUnverified` fallback intact). `getSites()` in live mode returns directory-level stubs only — never a 12k-device pull.
- Reads reuse `tb-client`'s `readSession` (one credential, one JWT, one health probe) via a new thin `readRequest(method,path)` export; the `Airedale Read Only` role (D5).

---

## 3. Control plane — write + confirm loop

### 3.1 Contract (Spencer §1/§4)
Four keys only, written to SHARED_SCOPE; confirm via **telemetry** `*Reported`/`*SyncStatus`; states `{pending, synced, failed, rejected}` — **no server timeout**; confirm keys lazy.
- `switchDesired` (bool) — Tuya single-gang — **v1 NEW**.
- `setpointDesired` (num °C; also `{target:n}`) — Salus 5–35, Intesis 16–32 — **v1**.
- `modeDesired` (`off|heat|cool|auto|fan`; Intesis `off`=off/any=on) — **HELD**.
- `hwBoostHoursDesired` (0–9) — Salus IT500 only — **HELD**.

### 3.2 Confirm-loop redesign (D3) — the core
1. **Read fix:** `readControlState` (`tb-client.js:177`) moves `/values/attributes` → `/values/timeseries` and parses the `{key:[{ts,value}]}` shape, returning `{sync, syncTs, reported, reportedTs}`. (Today it reads the wrong endpoint → every live command would time out. Latent, masked by the write-lock.)
2. **Pre-dispatch edge classification** (fixes `control.js:87` "always writes"): read the current `*Desired` (new `readDesiredState`, SHARED_SCOPE attrs) and branch —
   - `desired===requested` ∧ `synced` ∧ `reported===requested` → **`already-satisfied`** (no write; honest success-equivalent; audit `already-set`).
   - `desired===requested` but not confirmed → **`duplicate-pending`** (no write; "an identical change is in flight / didn't confirm — re-sending won't move it"; Keep waiting / Escalate). Closes the "re-issue after timeout makes no progress" hole. **No clear-then-set in v1** (unsafe on live relays/setpoints — open item O-4).
   - else → dispatch (`dispatchTs = now`).
3. **Post-dispatch settle** requires a **fresh** echo: `sync==='synced' ∧ reported===value ∧ syncTs > dispatchTs`. The `syncTs>dispatchTs` guard defeats the stale-synced / bad-value trap (a silently-ignored value never lands a fresh echo → times out honestly). `failed`/`rejected` likewise gated on fresh `syncTs`.
4. The timestamp guard and the no-dispatch outcome live on **different code paths** (classification is before any write; the guard applies only to the dispatch path), so a legitimate no-op is never asked to clear a timestamp gate.
5. **Client-side timeout retained** (`config.control.syncTimeoutMs`; no server timeout; IT700 slow-echo → decide-now/late-sync-watch split unchanged). **Pre-write validation** (`registry.validateCommand`) enforces the §4 ranges/enums (bad-value trap survives).

### 3.3 Registration-gate guard (D9 / Spencer §3 rule 2)
Before offering/dispatching control, assert the device has published first state — defined as `GET …/keys/timeseries` returning ≥1 key (`hasPublishedState`, read session). Inserted after the online check (`control.js:76`); a failing device is presented **capture-only**. Carry a derived `device.registered` on the inventory record so the dispatch-time call is a cheap re-assert.

### 3.4 `switchDesired` + wiring (D10)
- `tb-client.js:15-19` add `switchDesired:{reported:'switchReported',sync:'switchSyncStatus'}`; `registry.js` tuya `commands:['switch']` + a `switch` validate case (strict boolean; single-gang only per D7); `control.js` `previousValue` capture from `switch_1`; `COMMAND_ACTION_TYPE.switch`.
- `routes/api.js:132-134` flip kitchen/lighting/fan SCOPE_GROUPS from hard-`mon` to capability-driven `ctl` (`capabilities.includes('switch')`).
- `public/js/control.js` add `switchon`/`switchoff` modes (plain confirm, no stepper); `public/js/flows.js:311-393` wire per-circuit **Turn ON/OFF** when the device is switch-capable + online + registered, keeping capture fallback otherwise.

### 3.5 Mode-casing SAFETY fix + on/off held (D10)
Modes are sent capitalised (`'Off'`); Intesis treats any non-`off` as ON, so `'Off'` could switch an AC **on**. Fix now (even though mode ships later): lowercase the vocabulary end-to-end (`registry.js:36`, `public/js/control.js:64,202`); display copy may stay human-cased. **Gate on/off OFF cleanly for v1:** set `intesis.commands:['setpoint']` (drop `mode`) so `validateCommand` rejects mode everywhere; redirect the Intesis "turn off" flow trigger (`flows.js:232`) to capture-and-escalate. Re-enabling later = add `mode` back + prove Intesis `modeSyncStatus` on a mode-capable unit + soften the confirm copy (open item O-2).

### 3.6 Setpoint v1 (D10)
Enable `setpointDesired` for `salus-it500`, `salus-it700`, `intesis`. Fix Intesis range `16–30`→`16–32` (`registry.js:35`). Keep APP_POLICY ±3 °C / cap 25 °C intersected with device range (safe for heating; for Intesis cooling the 25 °C cap is conservative — a per-deviceType cap is open item O-3). IT500 one-device-vs-`salus-it500-dhw` split is open item O-1 (hwBoost held anyway; no HW control in v1).

### 3.7 Revert edge-safety + `WRITES_DISABLED` primitive (D6)
- `overrides.js:160-174`: classify before writing the revert value — if already at `revertValue` (schedule reclaimed it) → `reverted` truthfully, no dispatch, no false `revert-failed` alert; add the `syncTs>dispatchTs` guard to its confirm poll.
- `tb-client.js` `writeSharedAttribute`: add `if(config.writesDisabled) throw {status:423}` on the live path (after the fixture branch) — belt-and-braces to the existing killswitch caller-guards.
- **Shared `services/confirm.js`** extracts `classifyPreDispatch` + `isSettled` so `control.pollOne` and `overrides.revert` share one implementation of the edge/stale rules.

### 3.8 Auth
Writes → `writeSession` (control account `thingsboard-control-*`). All confirm reads (`readControlState`, `readDesiredState`, `hasPublishedState`, `tbDeviceUuid`) → `readSession` (read-only role). **D5 verification before the lock lifts:** the role can read timeseries, SHARED_SCOPE attrs (needed for the edge compare) and `keys/timeseries`, and **cannot** POST SHARED_SCOPE.

---

## 4. Merged code-change inventory (file:line)

Read plane: `services/tb-device.js` (new — service, `mapTbDevice`, site query + alias, classifier, telemetry map, cache, latch); `services/bridge.js` → shim then delete; `services/tb-client.js` (+`readRequest`); `services/zendesk.js` (+`siteDirectory()`); `data/site-aliases.json` (new); repoint 6 importers.
Control plane: `services/tb-client.js:172-180` (timeseries + `readDesiredState`/`hasPublishedState`), `:15-19` (switchDesired family), `:158-166` (WRITES_DISABLED throw), fixture sim edge-aware; `services/control.js:76,82-84,87,90,187,225,33` (registration gate, capture, edge-classify, settle guard, action type); `services/registry.js:35,36,32-40,73` (ranges, lowercase modes, intesis drops mode, tuya switch, validate); `services/overrides.js:160-174` (edge-safe revert); `routes/api.js:132-134` (SCOPE_GROUPS ctl); `public/js/control.js` + `public/js/flows.js` (switch modes, lowercase, wire flows, redirect Intesis off); `services/confirm.js` (new shared helpers).

## 5. Test plan (highlights)
- **Read:** `classifyDevice()` over the real 6261 set + every C4 exception class; site-query bleed-rejection + split-union + glued-keep + numeric-bleed-drop + case-insensitivity + pagination; telemetry mapping incl. switch normalisation; boolean `bridgeStatus()` latch. Migrate `bridge.test.js`/`site-identity.test.js`/`hotwater-scope.test.js` (they pin the old vendor-id `deviceId` + `/api/devices`).
- **Control:** edge-trigger no-op (`already-satisfied`, no write), duplicate-pending, happy dispatch, **stale-synced → times out** (trap closed), failed/rejected on fresh `syncTs`, timeout + late-synced, wrong-endpoint regression (asserts `/values/timeseries`), range validation, switch non-boolean rejected, mode rejected in v1 + no path emits `'Off'`, registration-gate 409, revert edge-safety (no false `revert-failed`), `WRITES_DISABLED` throws on live path, switch e2e.

## 6. Consolidated open items for the design gate
- **O-1** IT500 combi one-device-vs-`salus-it500-dhw` split (bridge emits `salus-it500` + `hotWater`); hwBoost held; needs Spencer + product decision.
- **O-2** Intesis mode/on-off confirmation story — no `modeSyncStatus` on the bench unit; mode can't ship until proven + copy softened. Held.
- **O-3** Intesis setpoint cap — APP_POLICY 25 °C clips the 16–32 cooling range; decide a per-deviceType cap.
- **O-4** Clear-then-set for `duplicate-pending` — deliberately out of v1 (unsafe); revisit if common in the field.
- **O-5 / D5** Read-role grant — verify it can read timeseries + SHARED_SCOPE attrs + `keys/timeseries` and cannot write; confirm the Key Vault secret mapping. Until bound, `WRITES_DISABLED` + kill-switch remain the barrier.
- **Read-side flags:** bulk Entity Data Query for telemetry (verify `POST /api/entitiesQuery/find` at build; per-device fallback proven); search behaviour delta (spans the Zendesk directory); alias-map coverage (seed from the 50 collision pairs; document the offline refresh).

## 7. Build sequencing (if approved)
1. `tb-device.js` behind the bridge shim → prove fixture parity + `classifyDevice` unit green (no consumer edits).
2. Repoint importers; migrate the shape-pinning tests; deploy read-only (control still disabled) → confirm all categories render live, no heating-path regression.
3. Confirm-loop redesign + `switchDesired`/registry/flows + mode-casing fix + setpoint ranges + registration gate + revert edge-safety + WRITES_DISABLED primitive.
4. Bench-verify control against the SD-664 playground; **live control stays disabled until James lifts `WRITES_DISABLED`** after D5 role verification.
