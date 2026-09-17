# OOH Dashboard — ThingsBoard-Direct Design Gate

**Timestamp:** 2026-09-17 · **Stage:** Design gate (pre-build) · **Owner:** James Brown
**Gate ask:** approve the read + control design for the TB-direct re-engineering (decisions D1–D10, PR #25 merged) so the build can begin, or request changes.

> **Full design:** `OOH_TB_DIRECT_READ_CONTROL_DESIGN.md` (module structure, algorithms, code-change inventory, test plan). **Interactive review:** [`mockups/OOH_TB_DIRECT_design_review.html`](mockups/OOH_TB_DIRECT_design_review.html) — the redesigned operator workspace for site 6261 with the new device categories, control affordances, and the confirm-loop states, embedded as the Live prototype on this PR. Evidence: `OOH_TB_DIRECT_VALIDATION_REPORT.md`, `OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md`.

---

## What this design delivers

Two planes, built to the approved decisions. The read swap gives the dashboard the **full site estate** direct from ThingsBoard (site 6261 = 23 devices vs the bridge's 1-of-23 view) and silently fixes a latent live-control break; the control plane adds the two contract-proven surfaces (Tuya on/off + setpoint) with a hardened confirm loop. No product code is written until this gate is approved. `WRITES_DISABLED` stays on live throughout.

## Read plane — `services/tb-device.js`
- Preserves the exact `bridge.js` public interface and canonical shapes, so `control.js`, `routes/api.js`, `flows.js`, `views.js`, `registry.js`, `resolution.js` are untouched by the swap. Landed behind a one-line `bridge.js` re-export shim first (green with zero consumer edits), then importers repointed.
- **Corrective fix:** `deviceId` becomes the TB device NAME (today it is the bridge vendor id, which breaks the name-keyed control path — masked only by the write-lock).
- **Site query (D1):** over-fetch a broad prefix, then a client-side anchored regex `^{brand}-{site}(?![0-9])` plus a curated site-token alias map — defeats both substring bleed and split-site loss. No runtime full-estate pulls.
- **Classification (D2):** `classifyDevice()` is capability-based (control-eligibility from telemetry signals, never the profile label), typo-tolerant, and covers the 19 undocumented profiles and the C4 exception classes.
- **Telemetry population** incl. the `switchReported → switchOn → switch_1` normalisation; **pub-name search** served from the Zendesk site directory (TB textSearch can't do it); boolean `bridgeStatus()` latch preserved (not the tri-state).

## Control plane — write + confirm loop
- **Confirm-loop redesign (D3):** reads the confirm keys from the **timeseries** endpoint (fixes a real latent bug — the code reads `/values/attributes`), is **edge-aware** (compares before dispatch → `already-satisfied` / `duplicate-pending` / dispatch, so a no-op re-issue is never faked as success), and settles only on a **fresh echo** (`syncTs > dispatchTs` — closes the stale-synced / bad-value trap). Keeps `failed`/`rejected` and the client-side timeout.
- **Registration gate (D9):** assert a device has published first state before offering/dispatching control (else the command is silently dropped); a failing device is presented capture-only.
- **Control v1 (D10):** enable `switchDesired` (Tuya, single-gang) + `setpointDesired` (Salus 5–35 °C, Intesis 16–32 °C); wire the dormant kitchen/lighting/fan flows; **hold** Intesis on/off and Salus IT500 hot-water boost (they render as monitor + escalate).
- **Safety:** the mode-casing bug is fixed now (capitalised `'Off'` could switch an Intesis AC ON) even though mode ships later; `WRITES_DISABLED` is pushed into the write primitive (D6); the revert worker is made edge-safe.

## Decisions carried in
D1 site query, D2 classification, D3 confirm-loop, D6 primitive guard, D8 name-search + status latch + test migration, D9 registration gate, D10 control v1 scope — all reflected above. D4/D5/D7 resolved earlier (setpoint proven; read-role being bound; multi-gang read-only).

## Open items for your decision (design gate)
- **O-1** Salus IT500 combi: the bridge emits one `salus-it500` carrying a `hotWater` field, but the registry models DHW as a separate type — needs Spencer confirmation + a product call. Hot-water boost is held in v1 regardless.
- **O-2** Intesis on/off can't ship until `modeSyncStatus` is proven on a mode-capable bench unit and the confirm copy is softened. Held.
- **O-3** Intesis setpoint cap: the app-policy 25 °C cap clips the 16–32 cooling range — keep conservative, or add a per-device cap?
- **O-4** Clear-then-set for a stuck `duplicate-pending` is deliberately out of v1 (unsafe on live relays/setpoints).
- **O-5 / D5** Verify the `Airedale Read Only` role can read timeseries + shared attributes + key lists and cannot write, and confirm its Key Vault mapping, before the write-lock lifts.
- Read-side: verify the bulk telemetry query at build (per-device fallback is proven); the pub-name search now spans the Zendesk directory (a deliberate improvement); seed the alias map from the 50 known collision pairs.

## On approval
- **Accept** → build begins per the sequencing in the design doc: read-service behind the shim (fixture parity + classifier unit green) → repoint + test migration → deploy read-only → confirm-loop + control wiring → bench-verify. Live control stays disabled until the D5 role is verified and James lifts `WRITES_DISABLED`.
- **Amend** → leave the changes; the design is revised before build.
- Provenance: hand-authored design (two design agents + synthesis); no build doer has run. This gate authorises the build, not any live write.
