# OOH TB-Direct Control — Contract, How-To & Proof

**For:** James Brown / OOH Triage Dashboard · **From:** Spencer (bridge owner) · **2026-09-17**
**Purpose:** the exact homogenised keys you write to control devices through ThingsBoard, how to write and confirm them, and live proof they work. This is everything you need to build control.

> **Provenance:** received verbatim from Spencer Thompson (Group Head of Business Technology) by email "Re: Asset Control Matrix", 2026-09-17 15:09 BST. Authoritative bridge-owner control contract. Companion: `mockups/OOH_ASSET_CONTROL_MATRIX_corrected.html` (Spencer's corrected read/control matrix).

---

## 1. The control surface — four keys

You control **every** device by writing one of these four **`*Desired`** attributes to the device's **`SHARED_SCOPE`** in ThingsBoard. There are no other control keys — this is the whole contract.

- `switchDesired` — `true` / `false` — On/off (Tuya switches)
- `setpointDesired` — number, °C (also accepts `{"target": <n>}`) — Set temperature (Salus / Intesis)
- `modeDesired` — `off` | `heat` | `cool` | `auto` | `fan` — Mode. For Intesis AC this is also on/off: `off` = off, **any other value = on**
- `hwBoostHoursDesired` — integer `0`–`9` (0 cancels) — Hot-water boost (Salus IT500 only)

The bridge writes back two **telemetry** keys per command so you can confirm:
- `<thing>Reported` — the value the device actually reports (e.g. `switchReported`, `setpointReported`)
- `<thing>SyncStatus` — `pending` → `synced` (success). Also `failed` or `rejected`

`SyncStatus` values — the complete set: **`pending`** (accepted, awaiting confirm), **`synced`** (confirmed on device), **`failed`** (device/vendor rejected or offline), **`rejected`** (that device doesn't support this command). There is **no `timeout`**.

---

## 2. How to write and confirm (TB REST)

**Write a command** (JWT in `X-Authorization: Bearer …`):
```
POST /api/plugins/telemetry/DEVICE/{deviceId}/attributes/SHARED_SCOPE
Body: {"switchDesired": false}
```

**Confirm it** — poll the two telemetry keys until `SyncStatus` settles:
```
GET /api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries?keys=switchReported,switchSyncStatus
```

Round-trip is typically <1 s for switches, a few seconds for thermostats.

---

## 3. Four rules that make it work (or silently no-op)

1. **Edge-triggered.** The bridge only acts when the `*Desired` value *changes*. **Writing the same value again dispatches nothing.** Always write a value different from the current one (or clear then set).
2. **Registration gate.** TB only forwards commands for a device the bridge has already claimed via its first state publish. A brand-new/never-reported device has its command **silently dropped** — make sure it's emitted at least one snapshot first.
3. **Confirm keys are lazy.** `*Reported`/`*SyncStatus` don't exist until the device's first command — they materialise on first dispatch. Absence ≠ error.
4. **One command per key.** Don't expect `onOffDesired`, `fanSpeedDesired`, or per-gang keys — they aren't in the contract (see §4). On/off is `switchDesired` (switches) or `modeDesired` (AC).

---

## 4. Which keys each device type honours

- **Tuya switch** — honours `switchDesired`. Single relay only. Multi-gang: a single `switchDesired` drives one gang; `switch_2` is **not addressable** today.
- **Salus IT700** (thermostat) — honours `setpointDesired` (5–35 °C). `modeDesired` → `failed` (not implemented), `hwBoostHoursDesired` → `rejected` (not a DHW unit).
- **Salus IT500** — honours `setpointDesired` (5–35 °C), `hwBoostHoursDesired` (0–9). Mode is heat-only (no `modeDesired`).
- **Intesis AC** — honours `setpointDesired` (16–32 °C), `modeDesired`. On/off via `modeDesired` (`off`/any) — key is correct but **unproven on the bench unit** (funklet reports no mode/power telemetry, no `modeSyncStatus`). Setpoint is proven and does **not** change power. **Fan speed is not in the contract** — can't be set today.

So: **`switchDesired` and `setpointDesired` are the universal ones; `modeDesired` adds AC mode + on/off; `hwBoostHoursDesired` is IT500-only.** Anything not listed (Intesis fan speed, Salus mode, Tuya 2nd gang) needs a contract change — flag it if OOH needs it.

---

## 5. Proof — live bench matrix (dev TB `airedale-dev.iot-private.cloud`, 2026-09-17)

Every key written against the real bench devices, confirmed via `SyncStatus`, then restored to baseline. Switch relays were **audibly clicking**.

- `bench-owon-1` · `switchDesired` = false → **synced** ✅
- `bench-tongou-sy1-1` · `switchDesired` = false → **synced** ✅
- `bench-tongou-sy1-2` · `switchDesired` = false → **synced** ✅
- `bench-tongou-sy2-1` · `switchDesired` = false → **synced** ✅
- `funklet-intesis-29d1f022` · `setpointDesired` = 22 → **synced** ✅
- `spencer-home-salusit700` · `setpointDesired` = 20 → **pending** (accepted; IT700 confirms slowly — echoes on next poll)
- `spencer-home-salusit700` · `modeDesired` = heat → **failed** (by design — no IT700 mode)
- `spencer-home-salusit700` · `hwBoostHoursDesired` = 0 → **rejected** (by design — IT500 only)

**Two nuances proven separately (2026-09-17):**
- **Intesis on/off (`modeDesired`) is unproven.** A full `off→fan→off→fan→off` cycle on the bench Intesis returned **no `modeSyncStatus`** — that unit reports no mode/power telemetry. `setpointDesired` on the same unit synced fine, so the adapter's alive; the mode/power channel just doesn't confirm here. Needs a mode-capable Intesis unit to prove.
- **A setpoint change does NOT power the unit on.** `setpointDesired` synced with `OnOff`/`applianceOn` unchanged — setpoint and power are independent. (The physical toggle you may recall was a Tuya *switch*, not a temperature change.)

**Bottom line:** `switchDesired` = proven live on all four switches; `setpointDesired` = proven (synced on Intesis; accepted/`pending` on the IT700 — the write lands, the unit just echoes slowly). Intesis on/off via `modeDesired` = key correct, not yet proven on the bench. The `failed`/`rejected` rows are the contract behaving correctly, not faults. Build against the §1 keys with the §3 rules and you're good.

---

## 6. Read-path auth (your Q5)

A read-scoped TB role (**`Airedale Read Only`**) exists — the dashboard's read path can use least-privilege instead of `TENANT_ADMIN`. I'll bind that for you; no action needed on your side.
