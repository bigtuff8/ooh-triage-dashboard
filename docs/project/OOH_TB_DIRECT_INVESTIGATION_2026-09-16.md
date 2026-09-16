# OOH Dashboard — ThingsBoard-Direct Investigation & Findings

**Timestamp:** 2026-09-16 · **Author:** OOH orchestrator session (James Brown) · **Status:** Investigation complete; direction confirmed with Spencer; Phase 1 gated on TB service-account credentials.

This artefact captures the essence of a multi-thread investigation (live incident + device-visibility root-cause + forensic read of the SD/Jira specs) so future sessions can resume without re-deriving it.

---

## 1. Trigger

James reported the live dashboard (`https://ooh.airedale-group.io`) throwing intermittent 501/502/503, site search returning nothing, and the version stuck at v1.2.0 after an expected release. Investigating that surfaced a deeper question: why does a site show only "heating" in the OOH dash when ThingsBoard shows the full device estate?

## 2. Live incident (resolved)

- **5xx / search-broken = OOM crash-loop.** The live pod ran a **stale 128Mi** memory limit while the committed manifest (`k8s/deployment.yaml`) specifies **512Mi**. Node grew past 128Mi (~2.6h) → `OOMKilled` (exit 137) → crash-loop → ingress 5xx. Fixed with `kubectl set resources` to 512Mi/192Mi (surgical; `WRITES_DISABLED` untouched). Stable at 0 restarts.
- **Version "stuck" = release never cut.** No `v1.3.0` tag/commit ever existed; the "release" was a raw redeploy of image `66ecf0e`. The corrected `scripts/release.sh` (PR #23) was then proven by cutting **v1.2.1** end-to-end (bump → tag → ACR build → rollout → `/healthz` verify). **Live is now v1.2.1.**
- The 512Mi manifest value survives future `kubectl set image` releases (set image preserves resources). Follow-up worth doing: move express-session off the in-memory MemoryStore (prod leak warning) in the next real release.

## 3. Architecture finding (the core of the investigation)

**ThingsBoard is Airedale Group's universal one-stop-shop for the IoT device estate — read AND write. The integration-bridge is a service that sits *behind* ThingsBoard, integrating TB with the vendor device software.** (Confirmed by Spencer, 2026-09-16.)

The integration-bridge (Spencer's "vendor bridge"):
- Is a **fan-in writer**: it polls vendor clouds (Salus→Arrayent, IT700→AWS IoT, Intesis→AC Cloud, Tuya via TuyaCloudClient) and **republishes device state INTO ThingsBoard** (TB Gateway protocol). It does **not** read ThingsBoard.
- Executes the **command/write path**: an operator sets a TB **shared attribute** (`<x>Desired`, e.g. `setpointDesired`, `switchDesired`); the bridge consumes that from TB and dispatches to the owning vendor cloud, writing back `<x>Reported` + `<x>SyncStatus` (SD-492). **The caller writes to ThingsBoard, not to the bridge's API.**
- Exposes a thin, unauthenticated, cluster-internal read API — `GET /api/devices` (flat array, telemetry inline, **no site/vendor/device filter, no environment param**), `/api/vendors` (a hardcoded array — buggy, SD-446), `/api/activity`. `/api/devices` reflects only the bridge's **own vendor-adapter state**, born from Cosmos `iot-device-bindings` (615 enabled bindings) × vendor polling.

**Prod adapter coverage (SD-446, verified vs pods):** Salus IT500 (373) + IT700 (228) + Intesis (11) only. **Tuya = command-only, 0 devices via bridge** (telemetry is TB-native). **remote.it = attributes-only enricher** (stamps TB attributes, never a device). AMR meters = **no adapter of any kind**. Winterhalter/Unox built-but-0-accounts; Rational not written; BoilerControl V2 is TB-native.

**Environment:** one PRODUCTION integration-bridge only (`prod-v3`, ns `iot-services`, → `portal.lhlive.co.uk`). The UAT bridge was decommissioned 2026-06-15 (it had created 458 duplicate devices in dev TB). Environment is a deployment-time property (which Cosmos containers + which TB), **not caller-selectable**. Our dash's `BRIDGE_BASE_URL`/`TB_URL` live in the unreadable secret `ooh-dashboard-secrets`, but all evidence points to production.

## 4. Worked example — site 6261 (Wheatstone Inn, Gloucester; Greene King)

ThingsBoard shows **23 devices, 18 active**. Only **1** comes through the bridge's `/api/devices` — which is exactly why the dash shows only heating as controllable.

| Device (TB name) | TB profile | Active | Via bridge `/api/devices`? | Dashboard category (from naming convention) | Controllable |
|---|---|:--:|:--:|---|:--:|
| `gk-6261-salusit700-1` | salusDevice | Y | **YES** | Heating | Yes (the only one dash sees) |
| `gk-6261-salusit700-gateway-1` | salusDevice | N | maybe (gateway) | Heating infra | n/a |
| `gk-6261-overdoorheater-1/2/3` | tuyaProfile | Y | no (Tuya TB-native) | Heating | switch |
| `gk-6261-merrychef-1/2/3`, `-fryer-1`, `-grill-1`, `-combioven-1`, `-dishwasher-1`, `-bainmarie-1`, `-heatedgantry-1` | tuyaProfile | Y | no | Kitchen equipment | switch |
| `gk-6261-externallighting-1` | tuyaProfile | Y | no | Lighting | switch |
| `gk-6261-extractfan-1`, `-barfans-1/2` | tuyaProfile | Y | no | Fans | switch |
| `gk-6261-boilercontrol-1` | boilerControl | Y | no (TB-native) | Heating/Boiler | native |
| `gk-6261-GasAMR-1`, `-ElecAMR-1` | AMR_profile | N | no (no adapter) | Metering (monitor-only) | No |
| `gk-6261-kitchen-r10a`, `-maindb-r10a` | remoteItProfile | N | no (enricher only) | Electrical/DB monitoring | No |

**Naming convention (James's install spec):** `gk-{siteNo}-{assetType}-{n}`. The asset type is in the device name and is the key the dashboard should parse to group/present devices and drive conversation flows.

## 5. Diagnosis — "code restriction or command gap?"

**It is a data-SOURCE gap first, a code gap second — NOT filtering.** We cannot filter in what the bridge never sends: 22 of 6261's 23 devices are structurally absent from `/api/devices`. All 23 **do** exist in ThingsBoard (system of record). Second, even for what we get, `services/bridge.js mapBridgeDevice` only classifies Salus→`heating` else `unknown`; it does **not** parse the naming convention into kitchen/lighting/fan/meter kinds. The front-end is largely built for this (`public/js/flows.js` kitchen/lighting/fan flows; `routes/api.js` SCOPE_GROUPS; `registry.js`) but dormant — nothing populates those kinds from live data.

## 6. Decision & plan (confirmed with Spencer 2026-09-16)

**Go DIRECT to ThingsBoard for read + (later) write. Drop the OOH dash's direct dependency on the bridge `/api/devices` read API.**

Guardrail: this removes our *read-coupling* to the bridge only. The bridge stays behind TB and still executes vendor commands; our control writes already target TB shared attributes, so control keeps working through it. Head start: `tb-client.js` already authenticates to TB (`/api/auth/login`) and writes shared attributes for the Salus path — the service accounts mostly swap in read-scoped creds.

- **Phase 1 — device data IN (read plane):** authenticate to TB with the new service account; enumerate a site's devices across all profiles (by `gk-<site>-*` name and/or the "Greene King" customer grouping); read latest telemetry + attributes; parse the naming convention → asset type → map to the existing scope groups/flows + **new** categories for metering (AMR gas/elec) and electrical/DB monitoring (R10A). Replace `services/bridge.js`.
- **Phase 2 — control (later):** discovery on TB command interfaces at API level — the explicit shared-attribute write payload **per device profile** — so no erroneous commands are issued. Interrogate against **Spencer's bench** (details sent on Teams), not live trading-site devices. Then map control with the team.

## 7. Open questions for Spencer (Jira is silent on these)

1. Which TB + which read credential/scope for OOH reads (does the SR-3 `ooh-control` cred cover TB device+telemetry reads, or only shared-attribute writes?).
2. Confirm prod TB (not dev TB, which holds 3,322 replicas) and no residual UAT-bridge/dev-container path.
3. Is Tuya telemetry actually forwarding into **prod** TB? (SD-664 flagged a routing gap on dev TB — 32 days no Tuya telemetry.)
4. What writes `AMR_profile` telemetry into TB (there is no vendor-bridge adapter for it)?
5. TB entity organisation for a site (customer "Greene King" / entity groups / pure name-prefix) — decides the cleanest "get this site's devices" query.
6. TB version in prod (dev was TB 4.3.1.1 PE).

## 8. Key ticket index

SD-664 (UAT device fleet register — environment/binding goldmine) · SD-545 (IoT Hub / headless bridge read API; "TB + vendor clouds are the system of record") · SD-446 (fan-in architecture, adapter roster, prod device counts, liveness LIVE<3h/QUIET 3-12h/OFFLINE>12h) · SD-492 (device control / shared-attribute contract, `ooh-control` SR-3 cred) · SD-515 (Tuya Owon/Tongou consolidation) · SD-575 (platform architecture: read-plane vs command-plane, "command ThingsBoard always") · SD-541 (remote.it enricher) · SD-586 (OOH dash, prod, write-locked canary) · SD-330/SD-593 (IoT Support Dashboard, UAT → prod promotion — distinct app, do not conflate).

## 9. Related persistent memory

`ooh-already-on-production-bridge`, `ooh-two-dashboards-and-device-layers`, `ooh-tb-direct-decision`, `ooh-oom-crashloop-resource-drift`, `ooh-release-1.3.0-never-cut`.
