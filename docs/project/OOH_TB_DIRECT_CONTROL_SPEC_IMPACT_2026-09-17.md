# Impact Assessment — Spencer's TB-Direct Control Spec vs OOH validation + codebase

**Timestamp:** 2026-09-17 · **Trigger:** Spencer (bridge owner) sent the authoritative control contract `OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md` + corrected matrix (email "Re: Asset Control Matrix", 15:09 BST). **Method:** two assessment agents — one reconciling the spec against our validation (C1–C8 / D1–D8), one auditing code-integration impact against the write/confirm path. Analysis only; no product code written.

---

## 1. Bottom line

Spencer's spec is **control-plane only** — it does not touch the read-plane (C1/C3/C4), classification (D2), or code-swap mechanics (C8/D8), so those validation findings stand. Its force lands on **C5, C6, D3, D4, D5, D7**, and it introduces several **new design-critical constraints** we never had. Net effect: the architecture verdict (**GO to design — conditional**) survives, but the control-plane section of the decision gate (PR #25) is now **materially wrong on C5/D4** and must be amended. Three concrete code issues also surface, one of them a latent confirm-path bug and one a safety-relevant mode-casing bug.

---

## 2. What the spec corrects in our validation

- **C5 was not a refutation.** We marked Salus "REFUTED on bench" and Intesis "GATED". Spencer's §4–§5 show those were **the contract behaving correctly**: Salus IT700 has no mode (`modeDesired`→`failed`) and is not a DHW unit (`hwBoostHoursDesired`→`rejected`); its setpoint write was *accepted* (`pending`, IT700 echoes slowly). Corrected C5 by device type:
  - **Tuya switch — PROVEN** (4 bench switches → `synced`, relays clicking). Unchanged.
  - **Salus IT700 — setpoint PROVEN-lands** (`pending`, slow-echo; full `synced` not yet witnessed). `failed`/`rejected` are correct-by-design, not faults.
  - **Salus IT500 — UNPROVEN** (none on the bench).
  - **Intesis — setpoint PROVEN synced (16–32 °C); on/off via `modeDesired` UNPROVEN** (bench unit reports no mode/power telemetry); **fan speed NOT controllable** (out of contract).
- **Our "dormant adapter → stale synced" false-success trap was actually the edge-triggered no-op.** Re-writing the *same* `setpointDesired` on the Intesis dispatched nothing by design (§3 rule 1) — not a dead adapter. That trap is **refuted**.
- **What survives from D3:** the **bad-value trap** (a type-invalid value the bridge silently ignores while `SyncStatus` stays at a prior `synced`) is NOT addressed by the spec — `Reported===Desired` + pre-write value validation remain required. And with **no server `timeout` state** (§1), a **client-side timeout stays authoritatively necessary**.

## 3. What the spec resolves

- **D5 (read least-privilege) → resolved-pending-verification.** An `Airedale Read Only` role exists and Spencer will bind it (§6). Before marking D5 closed, verify: (1) the role can read devices **and** timeseries telemetry; (2) which Key Vault secret maps to it (the `thingsboard-read-*` cred must resolve to this role, not the old TENANT_ADMIN account); (3) the bound role genuinely cannot `POST …/attributes/SHARED_SCOPE`.
- **D7 (multi-gang) → resolved as "not available today."** A single `switchDesired` drives one gang; `switch_2` is not addressable (§3 rule 4, §4). Multi-gang **control** is off the table (read `switch_2` only); survives as a conditional contract-change ask *if* OOH needs second-gang control.

## 4. New design-critical constraints (not in any prior artefact)

1. **Edge-triggered dispatch (§3 rule 1)** — the bridge acts only when `*Desired` *changes*; re-writing the same value dispatches nothing. Must write-different-or-clear-then-set, and the confirm loop must treat "already at value" as a distinct no-dispatch outcome.
2. **Registration gate (§3 rule 2)** — TB silently drops commands for a device that has never published first state. A new/never-reported device is uncontrollable until it emits one snapshot. **New silent-drop failure mode.**
3. **`setpointDesired` also accepts `{"target":<n>}`** (§1) — alternate payload shape (bare number still fine).
4. **Setpoint ranges:** Salus 5–35 °C, Intesis 16–32 °C (§4) — pre-write validation bounds.
5. **`modeDesired` enum `off|heat|cool|auto|fan`; Intesis on/off = `modeDesired`** (`off`=off, any other=on) — no separate on/off key (§1, §4).
6. **Fan speed uncontrollable** (§4) — `FanSpeed` telemetry is read-only.
7. **SyncStatus set = {pending, synced, failed, rejected}, NO timeout** (§1); confirm keys are lazy (§3 rule 3).

## 5. Code-integration impact (verified against the write/confirm path)

**Ranked required changes:**
1. **`services/tb-client.js:177` — confirm-read hits the WRONG endpoint (significant, verified).** It reads `/values/attributes` and parses the attributes shape; the spec's `*Reported`/`*SyncStatus` are **telemetry** keys read via `/values/timeseries` (different response shape). Under live control this returns nothing → `sync` always `null` → every command times out. Masked today by `WRITES_DISABLED`/fixture mode. **Must fix before any live control.**
2. **`services/control.js:87` — dispatch is not edge-aware (significant).** It always writes the value with no compare to the current `*Desired`. Under edge-triggering, a re-issue of the same value dispatches nothing yet the confirm loop still runs → false success / re-issue-after-timeout makes no progress and hides it. Needs a pre-dispatch compare + "already-satisfied" outcome.
3. **`public/js/control.js:64,202` + `registry.js:36,94` — mode casing is a SAFETY bug (significant).** Modes are sent capitalised (`'Off'`, `'Heat'`); the spec is lowercase and Intesis treats **any non-`off` value as ON** — so a capitalised `'Off'` could be read as **ON**. Turning an AC off could turn it on. Lowercase the vocabulary and collapse Intesis to `off`/any.
4. **`switchDesired` absent (significant, scope).** Not in `tb-client.js` `ATTRIBUTE_FAMILY` (`:15-19`); `registry` `tuya` has `commands:[]`. The Tuya on/off surface — the spec's universal key — is net-new build.
5. **Intesis range `16–30` should be `16–32`** (`registry.js:35`, tiny) and Intesis mode emits no `modeSyncStatus` so mode/off commands always hit the client deadline while the UI claims "confirmed by the unit" (contained — soften the copy or gate mode control).
6. **Confirm `hwBoost` reported-key name** with Spencer (`tb-client.js:18` maps `hwBoostReported`; spec doesn't give the literal) and check whether IT500 is one device with both capabilities vs the code's separate `salus-it500-dhw` deviceType (tiny/confirm).

**Already correct (give the code its due):** the `{pending, synced, failed, rejected}` states are first-class; the client-side timeout does not expect a server `timeout`; a `Reported===Desired` guard already exists (`control.js:187`, `overrides.js:172`) — it needs *extending* for the no-op case, not inventing; the write path (`/attributes/SHARED_SCOPE`, `Bearer`) is spec-correct; the attribute allow-list structurally enforces "one command per key" (no `fanSpeedDesired`/`onOffDesired`); `setpointDesired` as a bare number is accepted.

## 6. Impact on the design-kickoff scope

- **D3 (confirm-loop redesign) grows** — now must also: read from the **timeseries** endpoint (fix #1), be **edge-aware** (compare-before-dispatch, fix #2), keep the extended `Reported===Desired` guard, keep the client-side timeout, and keep `failed`/`rejected` handling.
- **New: a registration-gate guard** — ensure a device has published first state before offering/dispatching control (the online guard at `control.js:76` is a partial proxy).
- **New decision for James: does control v1 widen from "Tuya-only" to "Tuya switch + setpoint (Salus + Intesis)"?** Setpoint is now contract-proven for both; only **Intesis on/off (`modeDesired`)** and **Salus IT500 hwBoost** remain genuinely unproven, plus the mode-casing safety fix. This is a legitimate scope relaxation for the gate to decide.
- **Mode control** needs the casing/semantics fix and an honest "confirmation" story before it ships.

## 7. Net recommendation

**Still GO to design — conditional**, with the control-plane picture now *better* than our validation implied (setpoint proven both vendors; D5/D7 resolved) but carrying **three concrete pre-build code fixes** (confirm endpoint, edge-awareness, mode casing) and **two new constraints** (edge-trigger, registration gate). PR #25's decision artefact is being amended to correct C5/D4, resolve D5/D7, add the registration-gate constraint, and add the "widen control v1?" decision. Hold Intesis on/off + Salus IT500 hwBoost as the only genuinely unproven control paths.
