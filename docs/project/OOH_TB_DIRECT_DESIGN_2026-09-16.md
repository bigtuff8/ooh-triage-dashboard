# OOH Dashboard — ThingsBoard-Direct Read + Control Design

**Timestamp:** 2026-09-16 · **Author:** OOH orchestrator session (James Brown) · **Status:** Design — read plane PROVEN live; control-payload map CONFIRMED (Spencer bench brief); implementation-ready. Bench *exercise* gated on a dev-TB credential.

Successor to `OOH_TB_DIRECT_INVESTIGATION_2026-09-16.md` (read that first for the architecture rationale). This artefact turns the confirmed direction into a concrete, buildable design. Every claim below is backed by a live read against production ThingsBoard (`portal.lhlive.co.uk`) or Spencer's own bench brief — no inference left unmarked.

---

## 1. Evidence base (what we now know for certain)

### 1a. Read plane — PROVEN against production TB (2026-09-16)
Using a ThingsBoard PE **API key** (`Authorization: ApiKey <key>`, TENANT_ADMIN scope), `GET /api/tenant/devices?textSearch=gk-6261` returns **exactly 23 devices, 18 active** — matching the investigation prediction to the number. The bridge's `/api/devices` surfaces only 1 of these (`gk-6261-salusit700-1`). The other 22 are structurally absent from the bridge — the data-SOURCE gap, confirmed empirically.

- **Auth scheme:** the `tb_…` key works ONLY with header `Authorization: ApiKey <key>` (not `Bearer`, not `X-Authorization`). Full scheme table in CIR `THINGSBOARD_ALARM_ACCESS.md` §6.
- **Site query (authoritative):** the **`gk-{siteNo}-*` name prefix** via `textSearch`. Customer grouping ("Greene King" customer) is INCONSISTENT — some site devices sit on TB's null-customer sentinel — so it cannot be the primary key.
- **Site header metadata** lives on the AMR devices' SERVER_SCOPE attributes: `siteNo`, `siteName`, `Brand`, `customerName`, `shortname`. Read `siteName` from the **Elec** AMR (`gk-6261-ElecAMR-1` → "Wheatstone Inn"); the Gas AMR's is a broken `#REF!`.

### 1b. Control plane — CONFIRMED by Spencer's bench brief (2026-08-28, Teams)
> "Write a shared attribute on the ThingsBoard device: `switchDesired` (true/false) for the breakers; `setpointDesired` (number, degC) and `modeDesired` (off/heat/cool/auto/fan) for the thermostats. The bridge picks it up, commands the vendor cloud, reads the device back to confirm, and writes the result to telemetry as `<thing>Reported` and `<thing>SyncStatus`. `synced` is the success signal. Round trip ~4 seconds."

This is identical to the SD-492 contract already implemented in `services/tb-client.js` (`setpointDesired`→`setpointReported`/`setpointSyncStatus`, etc.) **plus one new attribute: `switchDesired` (boolean)** for Tuya breakers, which is NOT yet in the code's `ATTRIBUTE_FAMILY`.

**Bench is on a DIFFERENT ThingsBoard:** dev TB `airedale-dev.iot-private.cloud` (UAT integration-bridge). The production API key does not reach it — an empirical bench write-test needs a dev-TB credential. The payload *map* is confirmed regardless; only live verification is gated.

---

## 2. Device taxonomy — parsing `gk-{siteNo}-{assetType}-{n}`

The device **name** is the key. Parse `gk-<siteNo>-<assetType>-<n>`; classify by `(TB profile × assetType token)`. Live-verified taxonomy for site 6261:

| assetType token(s) | TB profile | Category (dash `kind`) | Control | Write attribute |
|---|---|---|---|---|
| `salusit700` | salusDevice | **heating** (thermostat) | yes | `setpointDesired` (°C), `modeDesired`, `hwBoostHoursDesired` |
| `salusit700-gateway` | salusDevice | heating infra | no (gateway) | — |
| `overdoorheater` | tuya Profile | **heating** (switch) | yes | `switchDesired` (bool) |
| `boilercontrol` | boilerControl | **heating/boiler** (TB-native) | yes* | SHARED_SCOPE schedule/override attrs (see §4c) |
| `merrychef`,`fryer`,`grill`,`combioven`,`dishwasher`,`bainmarie`,`heatedgantry` | tuya Profile | **kitchen** | yes | `switchDesired` (bool) |
| `externallighting` | tuya Profile | **lighting** | yes | `switchDesired` (bool) |
| `extractfan`,`barfans` | tuya Profile | **fans/ventilation** | yes | `switchDesired` (bool) |
| `GasAMR`,`ElecAMR` | AMR_profile | **metering** | no (monitor-only) | — |
| `kitchen-r10a`,`maindb-r10a` | remoteItProfile | **electrical monitoring** | no (enricher/monitor) | — |

\* boilerControl is TB-native (no bridge). Its control surface is real but richer (per-zone schedules/overrides) and is **not** covered by the Salus/Tuya bench; treat boiler control as a distinct, later sub-workstream (§4c). For OOH triage, the boiler is initially **monitor + heating-scenario/override** only.

**Category → telemetry to surface (live-verified keys):**
- Thermostat (salus): `localTemperature`, `heatingSetpoint`/`setPoint`, `systemMode`/`mode`, `holdType`, `runningState`, `heatingActive`, `isOnline`.
- Tuya switch: `switch_1` (bool on/off) + power metering (`active_power_total`, per-phase V/I, `Electrical_Consumption`). Present power draw makes "is it actually on?" answerable even when `switch_1` is stale.
- Boiler: `outsideTemp`, per-zone `*.output_state`/`*.flow_temp`/`*.zone_valve_*_alarm`, `summer_mode`, `heating_scenario`.
- AMR: consumption telemetry (monitor); site metadata attributes for the header.
- remote.it R10A: monitoring only (frequently stale — last activity July for 6261; render as "no recent data").

---

## 3. Read-plane design — a TB-direct inventory service replacing `services/bridge.js`

**Guardrail (keep the blast radius small):** the new service MUST preserve the exact public interface of `services/bridge.js` so `control.js`, `routes/api.js`, `public/js/flows.js`, and `registry.js` are untouched by the read swap:

```
getSites() · getSitesByNumber(siteNo) · searchSites(query) · getDevice(siteNo, deviceId) · bridgeStatus()
```

and the canonical shapes:
```
site   = { siteNo, siteName, nameUnverified, accountId, brand, address, callsLast30Days, devices[] }
device = { deviceId, zone, deviceType, deviceTypeLabel, kind, hotWaterCapable, online, telemetry{}, schedule }
```

**Critical invariant:** `device.deviceId` MUST be the TB **device name** (e.g. `gk-6261-salusit700-1`), because `tb-client.writeSharedAttribute()` resolves the TB UUID via `tbDeviceUuid(device.deviceId)` → `/api/tenant/devices?deviceName=`. Setting `deviceId` to the name keeps the existing control path working with zero change.

**Flow (per site search):**
1. **Query:** `GET /api/tenant/devices?pageSize=200&page=0&textSearch=gk-<siteNo>` → the site's full device set. (Search is by name prefix; a `sortProperty=name` keeps order stable.)
2. **Parse & classify:** for each device, parse the name → `assetType`, `n`; map `(profile, assetType)` → `kind`, `deviceType` (registry key), `deviceTypeLabel`, `controllable` per the §2 table.
3. **Enrich state:** batch-read latest telemetry (`/values/timeseries?keys=…`) and the `active` server attribute (`/values/attributes` or the device's `active` flag) → populate `telemetry{}` and `online`.
4. **Site header:** read AMR SERVER_SCOPE attributes for `siteName`/`Brand` (Elec AMR preferred; fall back to the existing Zendesk `resolveSiteName` if AMR absent). Keep `nameUnverified` semantics.
5. **Cache:** same 30s TTL as today (`LIVE_CACHE_TTL`), keyed per site (or a whole-tenant warm set if we pre-list). Site search should query TB live per term rather than pull the whole estate (thousands of devices) — `textSearch` server-side is the scalable path.

**`kind` map extension** (replaces `deriveKind`): a `classifyDevice(name, profile)` that returns `{ kind, deviceType, deviceTypeLabel, controllable, control:{attribute,type} }` per §2. This is the single place the naming convention is interpreted.

**Config/auth decision:** production live reads should use a **read-scoped TB service account** (username/password → the existing `readSession` JWT path in `tb-client.js`) rather than a personal API key — API keys inherit the generating user (James=TENANT_ADMIN, too broad, and personal). The API-key path is the right tool for *investigation/CI*, the service account for *production runtime*. Add `TB_URL` already exists; the read service reuses `readSession.request()`. (Spencer OQ-1 in the investigation: confirm the read cred scope covers device+telemetry reads, not just shared-attribute writes.)

---

## 4. Control-plane design

### 4a. Thermostats (salusDevice / Intesis) — already built
No code change to the write path. `setpointDesired` / `modeDesired` / `hwBoostHoursDesired` already flow through `writeSharedAttribute` + the `readControlState` confirm loop (`*SyncStatus === 'synced'`). Registry guardrails (setpoint window, frost-hold) already apply. Only the **read** side changes (devices now arrive via TB-direct with `kind: 'heating'`).

### 4b. Tuya switches (kitchen / lighting / fans / overdoor heaters) — ONE new attribute
Add `switchDesired` to `ATTRIBUTE_FAMILY` in `tb-client.js`:
```
switchDesired: { reported: 'switchReported', sync: 'switchSyncStatus' }
```
**CONFIRMED literal names on the dev bench (2026-09-16, read-only):** `bench-owon-1` carries SHARED_SCOPE `switchDesired` and telemetry `switchReported` + `switchSyncStatus` (`synced`). The mapping above is verified correct — the write→confirm attribute names are literal, not placeholders.
- Write `switchDesired: true|false` → bridge dispatches to Tuya cloud → confirms `switchReported` + `switchSyncStatus`.
- The existing `writeSharedAttribute`/`readControlState`/`control.js` dispatch+confirm machinery then works unchanged (it is attribute-generic).
- Registry: add the tuya `deviceType`(s) with a boolean on/off capability; wire the dormant kitchen/lighting/fan flows in `public/js/flows.js` and `SCOPE_GROUPS` in `routes/api.js` to the `switch` control.
- **State-key normalisation (REQUIRED, cross-vendor):** Tuya vendors differ. `owon` exposes `switchReported`/`switchSyncStatus`/`switchOn`/`switch_1`; `tongou` exposes `switch`/`switchOn`/`switch_1` with `switchReported` null. `classifyDevice`/telemetry mapping must derive a single confirmed on/off from: prefer `switchReported` → else `switchOn` → else `switch_1`. Do NOT assume `switchReported` is always present.
- **Verify write→sync on bench** (`bench-owon-1` / `bench-tongou-*`) before enabling live — see §6.

### 4c. Boiler (boilerControl, TB-native) — later sub-workstream
Rich per-zone shared-attribute surface (CHZ1/CHZ2/DHW/recirc/accom schedules, `*.default_override_duration_mins`, `heating_scenario`, summer mode). Not covered by the Salus/Tuya bench and higher-risk (multi-zone heating). **OOH scope v1 = monitor only** (surface outside temp, zone states, alarms). Defer active boiler control to a dedicated design with Spencer once the switch/thermostat plane is live.

### 4d. Monitor-only categories
AMR (metering) and remote.it R10A (electrical monitoring) render as read-only tiles with telemetry + "last seen"; no control affordance. They still enrich the triage picture (e.g. "gas meter last read …", "main DB monitor offline since …").

---

## 5. Code-change inventory (implementation-ready)

| File | Change | Risk |
|---|---|---|
| `services/tb-device.js` (new) | TB-direct inventory service; exports the bridge.js interface; `classifyDevice()` naming-convention parser. | contained |
| `services/bridge.js` | Retire as the live read source (keep fixture path or fold fixtures into the new service). Swap the import in consumers OR keep the filename and replace internals. | medium (touch points: control.js, routes/api.js, resolution) |
| `services/tb-client.js` | Add `switchDesired` to `ATTRIBUTE_FAMILY`. | tiny |
| `services/registry.js` | Add tuya on/off device types + capabilities; keep salus as-is. | contained |
| `public/js/flows.js`, `routes/api.js` (SCOPE_GROUPS) | Activate the dormant kitchen/lighting/fan flows against `kind` + `switch` control. | contained (already built, just unfed) |
| `config.js` | Confirm `TB_URL` + read service-account creds; document API-key path as investigation-only. | tiny |
| fixtures/tests | New fixture reflecting the multi-category TB shape; unit-test `classifyDevice()` against the 23-device 6261 set. | additive |

**Sequencing to keep live healthy:** land the read swap behind fixture parity first (classify → same canonical shape), prove search shows all categories, THEN enable switch control (bench-verified), THEN wire flows. `WRITES_DISABLED=true` stays until James lifts it.

---

## 6. Verification plan

1. **Unit:** `classifyDevice()` over the live 6261 set (fixture snapshot in `scratchpad/site-6261.json`) → every device lands in the right category; 23/23, controllable flags correct.
2. **Read integration (prod, read-only):** point a test at prod TB with a read cred; assert a 6261 search returns 23 devices across 5 categories with populated telemetry. (Already proven manually this session.)
3. **Control (bench, dev-TB — GATED on a dev-TB credential):** using the SD-664 UAT playground (`airedale-dev.iot-private.cloud`), exercise `switchDesired` on `bench-owon-1` / a `bench-tongou-*`, and `setpointDesired`/`modeDesired` on `funklet-intesis-29d1f022` / `spencer-home-salusit700`. Assert `<thing>SyncStatus === 'synced'` within ~4s. Follow the SD-664 runbook guards (capture-and-restore for the office AC / home thermostat; breakers are free to toggle). Runbook: SharePoint `SD-664 IoT UAT Device Fleet Register\SD-664-uat-playground-runbook.md`.
4. **Live smoke:** with control still disabled, confirm a real site search renders all categories + telemetry; no regression in the heating control path.

---

## 7. Open items / asks for Spencer & James

1. **Dev-TB credential** for the bench write-test (`airedale-dev.iot-private.cloud`) — the prod key won't reach it. (James/Spencer.)
2. ~~**Production read service-account** scope confirmation~~ **RESOLVED 2026-09-16.** All creds live in Key Vault `airedale-kv-prod`: `thingsboard-read-*` (prod read = `svc-read@airedale-group.co.uk`, validated: reads all 23 devices + telemetry, TENANT_ADMIN), `thingsboard-control-*` (prod write / SR-3), `thingsboard-dev-*` (dev-TB / bench = `spencer.thompson@…`). Nothing needed from Spencer on credentials.
3. ~~**Tuya `switchReported`/`switchSyncStatus` key names**~~ **RESOLVED 2026-09-16** — confirmed literal on `bench-owon-1` (read-only). Cross-vendor state-key variance captured in §4b.
4. **Boiler control** — defer; agree scope for a later dedicated design.
5. **remote.it R10A staleness** — 6261's R10As stale since July; is that expected, and how should the dash present "monitor offline"?
6. IT700 auto-naming collision (bench gotcha) — dev-only; not a prod concern for distinct `-1`/`-2` names, but note if it recurs in prod.

---

## 8. Related artefacts & memory
Investigation: `docs/project/OOH_TB_DIRECT_INVESTIGATION_2026-09-16.md`. CIR: `THINGSBOARD_ALARM_ACCESS.md` §6 (API-key auth), `OOH_BRIDGE_CONTRACT.md`. Memory: `ooh-tb-read-proven-apikey`, `ooh-tb-direct-decision`, `ooh-two-dashboards-and-device-layers`, `ooh-already-on-production-bridge`. Tickets: SD-492 (control contract), SD-545 (read/command plane), SD-446 (adapter roster), SD-664 (UAT bench register/runbook), SD-586 (OOH dash).
