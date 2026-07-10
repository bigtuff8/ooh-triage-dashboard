# OOH Dashboard — Operator Runbook (F021)

**Audience:** IoT team (Sam, CJ, Tony, Meg) + Spencer (platform).
**App:** OOH Dashboard, AKS `iot-services`, `/healthz` probed by K8s.
**Monitoring surfaces:** `/healthz` (subsystems + active alerts), Admin → Active alerts, IoT Support dashboard OOH Review Queue top strip (F026).

## Alert conditions and responses

| Alert code | Meaning | Response |
|---|---|---|
| `write-failure-streak` | ≥3 device writes failed/rejected/timed out within 30 min | Check `/healthz` subsystems (ThingsBoard write auth? bridge down?). If a vendor cloud is down, engage the **global kill-switch** with a reason so handlers get honest capture-and-escalate instead of failing writes. Check ThingsBoard vendor-bridge status with Spencer. |
| `revert-failed` | A timed-override revert dispatched but was never device-confirmed (or failed to dispatch) | The device may still hold the operator's value. Find the hold in Admin → Active timed overrides (danger-highlighted) or the Review Queue top strip. Manually set the device back via a fresh control action, or on the vendor portal. Then Cancel the hold. |
| `revert-blocked` | A revert is due but the kill-switch is blocking writes | Decide: lift the kill-switch (revert fires on the next 30s cycle) or set the device manually. The revert retries automatically while blocked. |
| `sms-dispatch-failed` | A P1 text could not be sent | The P1 ticket exists but nobody was texted. Ring the on-duty escalation manager directly. Check SMS provider credentials/balance. |
| `DriftDetected` (overnight) | Device value differs from desired after sync — manual change at the panel | Reconcile in the morning: site staff likely adjusted the panel. No overnight action unless tied to an open complaint. |

## Health checks

- `GET /healthz` returns `subsystems`: `bridge` (inventory reads), `thingsboard` (read + SR-3 write auth), `zendesk`, `store` (Cosmos/file), plus `controlQueue` (in-flight writes) and `activeAlerts`.
- **Degraded reads** (`bridge.healthy=false`): the app fails safe — flows switch to capture-and-escalate, control modal refuses to open. No action needed for handler safety; restore the bridge/TB read path.
- **Store unhealthy**: holds/audit cannot persist. Treat as urgent — engage the kill-switch (writes without a durable revert trail violate OOH-4).

## Kill-switch

Admin → Device control kill-switch. Global or per-site; a reason is mandatory and is shown to handlers in the banner. Reads and ticket capture continue. Reverts retry while engaged (see `revert-blocked`).

## Restart behaviour

- Active holds and their revert times live in the durable store — restarts do not lose reverts (worker rescans every 30s).
- In-flight sync watches (pending control actions) are per-replica in-memory: if the app restarts mid-write, the handler's modal shows a poll error; the write itself either landed or not — check the device board reading, and treat unconfirmed as NOT applied (the audit entry stays `pending`).
- Sessions are in-process: a restart signs operators out (they sign back in via SSO).

## Escalation

Platform-side failures (bridge, AKS, Workload Identity, K8s Secrets, pipeline): Spencer. Zendesk-side: IoT team admin. Never force-delete pods on rollout issues — check `kubectl logs` on the NEW pod first (see deployment-failure lessons in the IoT Support dashboard runbook).
