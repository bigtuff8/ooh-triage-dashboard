# Query for Spencer — OOH TB-direct control validation: two bench round-trips didn't complete

**From:** James Brown (OOH Triage Dashboard) · **Date:** 2026-09-17 · **Re:** SD-664 UAT bench / SD-492 control contract
**TL;DR:** We adversarially re-validated the ThingsBoard-direct plan before building. **Read plane and Tuya switch control are solid.** But on the dev bench, the **Salus and Intesis** write→confirm round-trips did **not** complete, and we couldn't verify the Intesis on/off + fan-speed attribute names. Before we wire thermostat/AC control we need you to confirm whether that's a bench wiring gap or a real adapter behaviour, and hand us three specifics. Nothing below touched production.

---

## 1. What we were trying to prove

The OOH dashboard is moving to read **and** control devices directly against ThingsBoard (shared-attribute writes; the integration-bridge stays behind TB for vendor dispatch). Before we build, we wanted to **independently re-prove the control contract on every controllable device type** — not just the Tuya switch the earlier session proved. Specifically, for each type: write `<thing>Desired` → the bridge dispatches → we see `<thing>Reported` + `<thing>SyncStatus=synced` within ~2–4s.

## 2. What we did (and the instructions we followed)

- **Environment:** dev TB **`airedale-dev.iot-private.cloud`** only (the SD-664 UAT playground). **Zero writes to production** (`portal.lhlive.co.uk`).
- **Auth:** logged in with the `thingsboard-dev-*` service account (from Key Vault `airedale-kv-prod`) via `POST /api/auth/login` → JWT.
- **Method per device:** capture current state → `POST /api/plugins/telemetry/DEVICE/<uuid>/attributes/SHARED_SCOPE` with `{"<thing>Desired": <value>}` → poll `values/timeseries` + `values/attributes/SHARED_SCOPE` for `<thing>Reported`/`<thing>SyncStatus` for several seconds → **restore original state**.
- **Devices used (from the runbook `SD-664-uat-playground-runbook.md`):** Tuya switches `bench-owon-1`, `bench-tongou-sy1-1/-sy1-2`, `bench-tongou-sy2-1`; thermostats `spencer-home-salusit700` (Salus) and `funklet-intesis-29d1f022` (Intesis). We followed the runbook's capture-and-restore guard on both thermostats and kept within 19–23 °C.

## 3. What worked ✅

**Tuya switches — all four confirmed.** `switchDesired: true/false` → `switchReported` + `switchSyncStatus=synced`, round-trip **<1s**. Cross-vendor note we'll design around (no action needed from you): the confirm keys are created **lazily on first dispatch** (absent until then), and only `switchOn` is reliably present — `switch_1` reads stale on the bench, so we won't trust it as the on/off source.

## 4. What did NOT complete — where we need you 🔴

### 4a. Salus thermostat (`spencer-home-salusit700`) — writes accepted, never confirmed
Captured baseline `setPoint=20`, `mode=Heat`. Then:

| We wrote | Result |
|---|---|
| `setpointDesired=21` | `setpointSyncStatus=pending` and **stuck at `pending` indefinitely** (>6s); `setpointReported` stayed `null`; `setPoint` never moved off 20 |
| `modeDesired="heat"` | `modeSyncStatus=failed` |
| `hwBoostHoursDesired=0` | `hwBoostSyncStatus=rejected` |

The attribute **names** are accepted by TB, but the round-trip never reaches `synced`. Your home unit was **not** physically actioned (setpoint held at 20 throughout); we restored SHARED_SCOPE empty, `setPoint=20`, `mode=Heat`.

**What we need:** Is the bench Salus adapter currently **wired to a live vendor account** on the UAT bridge? SD-492 describes a *shipping* Salus control path, so we want to reconcile: is this a **dev-bench gap** (adapter not connected in UAT) or a **real behaviour** we must design around? If it's expected on the bench, is there a Salus device on the UAT bridge that **does** complete a round-trip we can prove against?

### 4b. Intesis AC (`funklet-intesis-29d1f022`) — adapter looked dormant + attribute names unproven
Baseline had a **weeks-old** `setpointReported=23`/`setpointSyncStatus=synced` (historical). Our fresh `setpointDesired=22` did **not** re-dispatch inside the window (no new `Reported`; sync timestamp never advanced), which reads like a **dormant/asleep adapter**. Separately, we tried to confirm the on/off and fan-speed controls: we wrote `onOffDesired`, `fanSpeedDesired`, `modeDesired` — TB accepted them but the bridge created **no** `*Reported`/`*SyncStatus` keys, so we **cannot confirm those are the real attribute names**. Restored to baseline (`setpointDesired=23`), probe attrs deleted.

**What we need (two things):**
1. Is the bench Intesis adapter **awake/connected**? If it sleeps, when's a good window to re-run, or can you wake `funklet-intesis-29d1f022`?
2. **The literal shared-attribute names for Intesis on/off and fan speed** — i.e. the exact keys the bridge listens for (is it `onOffDesired`/`fanSpeedDesired`, or something else?), and their accepted value sets (on/off; fan-speed enum). This is the one piece of the control map we could not derive empirically.

### 4c. Multi-gang Tuya — no test device on the bench
We need to know how a **2-gang** switch is addressed: does a single `switchDesired` target a channel, or are there per-channel keys (`switch_1Desired`/`switch_2Desired`)? **None of the bench Tuya units expose a real `switch_2`.**

**What we need:** a genuine **2-gang** Tuya device on the bench (or the bridge's per-channel attribute convention) so we can prove multi-gang control before we ship it. Single-gang is fully proven and unaffected.

## 5. One separate, non-bench question (TB access model)

Both OOH service accounts (`svc-read@`, `svc-control@`) resolve as **TENANT_ADMIN** in prod. That means the *read* account can technically write. We fail-close this at the app layer (`WRITES_DISABLED` + kill-switch), so it's not a live risk — but for cleaner least-privilege, **is a genuinely read-scoped TB role available** (or provisionable) for the dashboard's read path, or should we consciously accept TENANT_ADMIN-both and rely on the app-layer guard?

## 6. What we are NOT blocked on

Read plane (multi-site, 12.8k-device tenant) and **Tuya switch control** are proven — we can proceed to design the read service and Tuya-only control now. Items 4a/4b/4c and 5 gate **thermostat/AC control** and **multi-gang**, which we're happy to hold until you can confirm. No production changes are pending.

**Best way back to us:** a quick note on 4a (bench Salus wiring), 4b (Intesis awake-window + the on/off & fan-speed attribute names), 4c (a 2-gang bench device or the convention), and 5 (read-scoped role) — in whatever order is easy. Thanks!
