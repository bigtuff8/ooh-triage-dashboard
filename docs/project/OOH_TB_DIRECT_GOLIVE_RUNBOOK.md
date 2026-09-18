# OOH TB-Direct — Go-Live Runbook (deploy + write-flip)

**Timestamp:** 2026-09-18 · **Stage:** pre-deployment (go/no-go #3) · **Owner:** James Brown
**Scope:** deploy the TB-direct read+control build to the live pod **and** lift `WRITES_DISABLED` so control actuates live devices — approved together as one gate. This is the manifest's anticipated **go/no-go #3** (`k8s/deployment.yaml:66` — "flip `WRITES_DISABLED` off only at James go/no-go #3"). SMS go-live (#4) is **out of scope** — `SMS_PROVIDER=log` stays.

Reference design: `OOH_TB_DIRECT_READ_CONTROL_DESIGN.md`. Deploy plumbing: CIR `OOH_DASHBOARD_DEPLOY.md`.

---

## 1. What ships
- **Read cutover:** the live dashboard changes from the bridge's 1-of-23 device view to the **full site estate by category** (heating, kitchen, lighting, fans, metering) via `services/tb-device.js`.
- **Control (v1):** Tuya `switchDesired` (kitchen/lighting/fans/over-door) + `setpointDesired` (Salus + Intesis). **Held:** Intesis on/off, Salus IT500 hot-water boost, multi-gang, boiler.
- Current live image is the pre-TB-direct build; this deploys a fresh image from `main` HEAD (161 unit tests green; bench control smoke passed).

## 2. Preflight (all must be true before Step 4)
- `main` unit suite green (161) ✓ · bench control smoke passed — Tuya write→confirm proven live through our code, `/values/timeseries` confirm-read proven, edge-aware + registration probe proven ✓
- Read plane proven live (validation: 6261 = 23 devices, multi-site) ✓
- Handler roles provisioned (claimArea 1500: Sam/Meg/CJ/Tony/Jonathan) ✓
- Runtime kill-switch available (global + per-site, Cosmos-persisted, instant, no deploy) ✓
- Quiet hours (replicas:1 → a redeploy re-SSOs anyone logged in) ✓
- **Residual risks accepted (see §6):** least-privilege read role not yet bound; setpoint full round-trip not yet observed through our code against a live-echoing thermostat.

## 3. Deploy (read cutover — writes still locked)
```bash
export KUBECONFIG=~/.kube/ooh.yaml
SHA=$(git rev-parse --short HEAD)          # from a clean checkout of main
STAGE=/tmp/ooh-build-ctx; rm -rf $STAGE; mkdir -p $STAGE; git archive HEAD | tar -x -C $STAGE
( cd $STAGE && az acr build --registry apitechhub --image ooh-dashboard:$SHA . )
az acr repository show-tags -n apitechhub --repository ooh-dashboard   # VERIFY the tag landed
kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:$SHA
kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=120s
kubectl -n iot-services logs deploy/ooh-dashboard --tail=20
```
`set image` preserves the committed resources (512Mi limit) — the OOM-drift lesson. **After deploy, `WRITES_DISABLED` is still `true`** (from the manifest env) — control is wired but inert.

## 4. Verify the read cutover (before any write-flip)
- `/healthz`: `DATA_MODE=live`, `writesDisabled:true`, TB read healthy, no degraded banner.
- Search a real site → confirm the full estate renders across categories; heating control path unchanged (no regression); telemetry populated.
- Pod logs clean (no TB auth errors, no classify crashes).

## 5. Write-flip (go/no-go #3 — the single enable)
Per `k8s/deployment.yaml:69` fail-closed contract, writes enable **only** when `WRITES_DISABLED` is exactly `"false"`.
```bash
# Recommended: arm safety first — engage per-site kill-switches for all but ONE canary site,
# so the first live write is contained. (Global + per-site kill-switch, no deploy.)
kubectl -n iot-services set env deployment/ooh-dashboard WRITES_DISABLED=false
kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=120s
# /healthz → writesDisabled:false
```
**Canary live write:** on the canary site, toggle ONE Tuya switch (off→on) via the dashboard → observe `switchSyncStatus=synced` + the audit row + revert. If clean, release the other per-site kill-switches. Watch a real setpoint round-trip on a live thermostat (the one path not yet observed through our code — §6).

## 6. Residual risks (accept explicitly)
- **Least-privilege read role not bound (D5/O-5).** Both TB service accounts are still TENANT_ADMIN, so a *leaked read credential* could write directly to TB (bypassing the app). Not a functional blocker; the app-layer `WRITES_DISABLED` + kill-switch remain the barrier for the app path, but the credential itself is over-privileged. Bind `Airedale Read Only` (Spencer) to close it.
- **Setpoint full round-trip not yet observed through our code on a live thermostat.** The write path + the `/values/timeseries` confirm-read are proven live; Tuya switch is proven end-to-end; but a live Salus/Intesis `setpoint→synced` through our confirm loop was not observed (the bench Intesis was dormant; the bench IT700 slow-echoes). Spencer's contract asserts it works. Mitigation: watch the first live setpoint round-trip on the canary; the fresh-echo guard fails safe (honest timeout) rather than faking success.
- **Held surfaces render as monitor + escalate:** Intesis on/off, IT500 hwBoost, multi-gang `switch_2`. No live actuation for these.

## 7. Abort / rollback (fastest first)
1. **Instant, no deploy — the runtime kill-switch** (global or per-site, Cosmos-persisted): blocks all/any device writes immediately; reads continue.
2. **Re-lock writes:** `kubectl -n iot-services set env deployment/ooh-dashboard WRITES_DISABLED=true` → rollout. (Absence/typo also disables — fail-closed.)
3. **Roll back the code:** `kubectl -n iot-services rollout undo deployment/ooh-dashboard` (or `set image` to the prior sha) → rollout status. Reverts the read cutover too.

## 8. Out of scope
- SMS go-live (`SMS_PROVIDER=log` stays — go/no-go #4).
- Intesis on/off, IT500 hwBoost, multi-gang, boiler control (held for later increments).
- Least-privilege read-role binding (Spencer; can land independently, before or after).
