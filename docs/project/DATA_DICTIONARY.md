# DATA_DICTIONARY — IOT OOH Dash

Data model for the OOH Triage Dashboard. All app-owned document fields use the **`Ooh` context prefix**
(per the root CLAUDE.md unique-naming rule). This dictionary is a governance-gate checkpoint — keep current.

## Cosmos containers (durable store — DB `ooh-dashboard`)

Source of truth for app operational state. Partitioned on `/storePartition` (single logical partition `ooh`).
Accessed via **AAD / workload identity** in prod (no key — post app-side change).

| Container | Purpose | Key fields |
|-----------|---------|-----------|
| `OohOverrides` | Timed device-override / hold docs (F010) | `OohOverrideRevertAt`, `storePartition`, `_etag` |
| `OohAuditLog` | App action audit trail (F011/F021/F022) | `OohActionAt`, `status` |
| `OohAppConfig` | Kill-switch, notices, data-quality flags (F016) | `storePartition` |
| `OohSmsLog` | P1 escalation dispatch/ack records (F014) | `OohP1AckAt` (SLA; not yet live-fed — IM-02) |

Cross-consumer note: the **SD-330 IoT Support Dashboard reads this store** for its "failed revert" panel (needs its own read grant on `/dbs/ooh-dashboard`).

## Zendesk field references (consumed, not owned)

| Field | ID | Use |
|-------|----|----|
| Site field | `11405878329244` | Site on outcome ticket |
| Follow-up field | `26074112194076` | Callback linkage |
| Ticket Category | `25999250486684` → `tcat_support_request` | "Support Request" tag (F002; Explore reporting) |
| OOH tag | `ooh` | Marks every OOH outcome ticket |

## Config / secret surface (env vars)

Non-secret operational (manifest): `NODE_ENV`, `AUTH_MODE`, `DATA_MODE`, `PORT`, `WRITES_DISABLED`, `SMS_PROVIDER`.
Secret (`ooh-dashboard-secrets` / Key Vault — see OQ-1): `APP_ORIGIN`, `SESSION_SECRET`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_SCOPE`, `OIDC_ROLE_CLAIM`, `OIDC_ROLE_MAP`, `BRIDGE_BASE_URL`, `TB_URL/USERNAME/PASSWORD`, `TB_WRITE_USERNAME/PASSWORD`, `ZENDESK_SUBDOMAIN/EMAIL/API_TOKEN`, `COSMOS_ENDPOINT`, `COSMOS_DATABASE`, `ESCALATION_ONDUTY_NUMBER/NAME`, `TWILIO_*`, `IOT_DASH_BASE_URL`, `SYNC_*_MS`.
**Removed in the new model:** `OIDC_CLIENT_SECRET` (public client), `COSMOS_KEY` (AAD/WI).

## Auth claim contract (`extension_Role`)

Serialised `AreaClaim[]` of `{claimArea, claimGroup, claimPermission, modifier[], excludeModifiers}` (ints).
- `claimArea 1500` = `ClaimGroup.OohHandler 3500` → app role **handler**.
- `claimArea 1400` = `ClaimArea.IoT` → app role **iot** (IoT team already carry this).
- `OIDC_ROLE_MAP = {"1500":"handler","1400":"iot"}`.

## Solution-Design cross-references

| SD | Meaning |
|----|---------|
| SD-586 | Implement OOH Triage Dashboard (this deploy) |
| SD-330 | IoT Support Dashboard (consumer / P1 deep-link target) · SD-520 its B2C move |
| SD-492 | `*Desired`/`*Reported`/`*SyncStatus` control contract |
| SD-515 | Tuya command path in the integration bridge (kitchen/lighting/fans control) |
| SD-491 / SD-559 | Boiler-panel control investigation / IoTisan source |
| SD-477 | Canonical persistent schedules (IoT Hub) |
| SD-545 | IoT Hub architecture (sibling) · SD-574 authorization/scope · SD-583 estate security |

## Derived device fields (OOHDASH-128)

Fields and predicates introduced by the legacy bare-salus load fix. None are stored; all are computed per request from the ThingsBoard entity name.

| Name | Kind | Meaning | Source | Retention/sensitivity |
|---|---|---|---|---|
| legacySalusSiteNo(rawName) | Pure function (server) | Site number from an older Salus name's trailing bracket, or null | services/tb-device.js | Not stored. Low. |
| isLegacySalusForSite(rawName, siteNo) | Pure function (server) | Cross-site guard: strict string equality of parsed siteNo | services/tb-device.js | Not stored. Low. |
| Legacy Salus site code | TB naming convention | Trailing "(NNNN-L-n)" on gk_{sitename}_salus_{serial} names. L is s/f/r/b. | ThingsBoard entity name and CLIENT_SCOPE site attribute | Read-only. Low. |
| device.deviceType = "salus" | Existing derived field | Older-convention Salus thermostat (classifyDevice) | classifyDevice in tb-device.js | Per request. Low. |
| device.area | Existing derived field | Accommodation, Bar/Restaurant or null | deriveArea in tb-device.js | Per request. Low. |
| isUnplacedLegacySalus(d) | Client predicate | deviceType "salus" with area null | public/js/flows.js | Not stored. Low. |
| area-not-reporting-note | UI test id | Silent-units note under an area reading | flows.js | n/a |
| heating-unplaced-note | UI test id | Site-level footnote for unplaced older units | flows.js | n/a |
