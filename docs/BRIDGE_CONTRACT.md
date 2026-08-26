# Integration-Bridge `/api/devices` Contract

**Captured live 2026-08-26** from the running `ooh-dashboard` pod (diagnostic build `ffcb9bc-diag`),
resolving the long-standing F025 "unconfirmed contract" unknown behind the site-search 503 (OOHDASH-66).
`services/bridge.js` (`fetchLiveSites` / `mapBridgeDevice`) is the single adaptation point for this contract.

> **Status: UNCONFIRMED / UNVERSIONED.** This shape was observed, not guaranteed. There is no version
> header and no schema contract. Whether it is stable, and **who owns F025**, is a pending question for
> Spencer (platform/infra owner). Treat a shape change as possible until that is confirmed.

## Endpoint

- `GET {BRIDGE_BASE_URL}/api/devices`
- **Unauthenticated, cluster-internal** (SD-545 shared-hub pattern). No auth header, no credentials.
  `BRIDGE_BASE_URL` lives in the k8s secret `ooh-dashboard-secrets` (namespace `iot-services`).
- Called via `axios.get(baseUrl + '/api/devices', { timeout: config.bridge.timeoutMs })`.

## Shape — FLAT device array, NO site wrapper

`res.data` **is** a flat JSON array of device objects. There is **no** `res.data.sites` and **no**
site-level object anywhere — no `siteNo`, `siteName`, `brand`, `address`, `callsLast30Days`, or
`devices[]`. The house/site number is only *embedded* in `accountId` (and `tbDeviceName`).

### Representative device object

```json
{
  "deviceId": "salus-gk-6261-it700tx-025e0726",
  "vendorId": "salus-it700",
  "vendorDisplay": "Salus iT700",
  "accountId": "gk-6261",
  "site": "Accomodation Gateway",
  "state": "live",
  "isOnline": true,
  "lastVendorReportUtc": "2026-08-26T08:30:38Z",
  "lastSeenUtc": "2026-08-26T08:30:38.8166548Z",
  "lastVendorChangeUtc": "2026-08-26T08:26:18Z",
  "tbDeviceName": "gk-6261-salusit700-1",
  "temperatureC": 22.5,
  "setpointC": 6.5,
  "mode": "Heat",
  "heatingActive": false,
  "coolingActive": false,
  "hotWater": null
}
```

### Field list

| Field | Type | Notes |
|---|---|---|
| `deviceId` | string | Stable device id. |
| `vendorId` | string | `salus-it500` / `salus-it700`. **Matches the `services/registry.js` keys** — used as `deviceType`. |
| `vendorDisplay` | string | Human label, e.g. `Salus iT700`. |
| `accountId` | string | Carries the house number with an alpha prefix, e.g. `gk-6261` → house **6261**. **Group by this to reconstruct a site.** Non-house values exist: `shared`, `spencer-uat-01`. |
| `site` | string | Per-device **zone label** ("Accomodation Gateway"), **NOT** a site name. Do not use as the site name. |
| `state` | string | `live` / `nodata`. |
| `isOnline` | bool | Online flag → `online`. |
| `lastVendorReportUtc` / `lastSeenUtc` / `lastVendorChangeUtc` | string (ISO) | Freshness timestamps. |
| `tbDeviceName` | string | ThingsBoard device name (also embeds the house number). |
| `temperatureC` | number | Current temperature. |
| `setpointC` | number | Heating setpoint → `telemetry.heatingSetpoint` (**load-bearing**). |
| `mode` | string | `Heat` / `Off` / … |
| `heatingActive` / `coolingActive` | bool | Demand flags. |
| `hotWater` | number\|null | Hot-water reading; `null` on pure thermostats. |

No `schedule` field is sent.

## Site reconstruction (derived by grouping on `accountId`)

| OOH site field | Source |
|---|---|
| `siteNo` | strip the alpha prefix from `accountId` (`gk-6261` → `6261`); skip anything not `^[a-z]+-\d+$` (`shared`, `spencer-uat-01`, …) |
| `siteName` | **not in payload** — proxied by `accountId` for now (TODO: real name via registry/Zendesk lookup) |
| `brand` / `address` / `callsLast30Days` | **not in payload** — left `undefined` (guarded downstream); registry/Zendesk-sourced |
| `devices` | the mapped devices in the group |

Skipped non-house accounts are logged as a data-quality signal, not emitted as sites.

## Device mapping (bridge field → OOH field) — `mapBridgeDevice`

| OOH device field | Source |
|---|---|
| `deviceId` | `deviceId` |
| `zone` | `site` (the per-device zone label) |
| `deviceType` | `vendorId` (verbatim — a `services/registry.js` key) |
| `deviceTypeLabel` | `vendorDisplay` (display only) |
| `kind` | derived: `salus-it500`/`salus-it700` ⇒ `heating`; else `unknown` |
| `hotWaterCapable` | `hotWater != null` (combi DHW signal — see mismatch note) |
| `online` | `isOnline` |
| `telemetry.temperature` | `temperatureC` |
| `telemetry.localTemperature` | `temperatureC` (alias — `public/js/views.js`/`flows.js` read `localTemperature`) |
| `telemetry.heatingSetpoint` | `setpointC` — **load-bearing** (`routes/api.js` + `registry.validateCommand`/`setpointWindow` read `telemetry.heatingSetpoint`) |
| `telemetry.mode` | `mode` |
| `telemetry.heatingActive` / `coolingActive` | `heatingActive` / `coolingActive` |
| `telemetry.hotWater` | `hotWater` |
| `schedule` | `null` (not sent) |

## Registry reconciliation & the known hot-water mismatch

- `deviceType ← vendorId` lines up 1:1 with the `salus-it500` / `salus-it700` registry keys, so the
  setpoint/frost guardrails (`capabilitiesFor`, `setpointWindow`, `validateCommand`) and the heating
  `SCOPE_GROUP`/`deviceSummary` logic in `routes/api.js` keep working on live data.
- **Hot water is a mismatch (flagged for F025).** The registry models hot water as a *separate* device
  type `salus-it500-dhw` (kind `hotwater`); the hot-water `SCOPE_GROUP` and the `hwboost` guardrail both
  key off `deviceType === 'salus-it500-dhw'`. The bridge never emits that vendorId — a combi iT500 arrives
  as one `salus-it500` device with a `hotWater` telemetry field. So hot-water **control** and the hot-water
  scope tile will not activate from live bridge data under the current model. The reading is still surfaced
  in `telemetry.hotWater` / `hotWaterCapable`. Wiring control needs a product decision (split the combi into
  two logical devices, or re-key the DHW paths off `telemetry.hotWater`) plus F025 confirmation. Left
  unresolved deliberately to avoid breaking heating control or mis-firing a boost against an unverified id.

## Open / pending (non-blocking)

- **Confirm with Spencer**: is this `/api/devices` contract **stable/versioned**, and **who owns F025**?
  A stability guarantee is the only part the OOH team can't self-serve.
- The prior `services/bridge.js` comment cited a `HUB_INTEGRATION_AUDIT §5.3` doc that **does not exist** —
  this file supersedes that reference.

_Related: CIR `OOH_BRIDGE_CONTRACT.md`, `OOH_DASHBOARD_DEPLOY.md`. Ticket: OOHDASH-66._
