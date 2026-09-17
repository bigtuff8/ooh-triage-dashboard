# OOH Dashboard — ThingsBoard-Direct: Design Decisions Gate

**Timestamp:** 2026-09-17 · **Stage:** pre-design decision gate · **Owner:** James Brown
**Gate ask:** review the adversarial validation outcome and record decisions **D1–D10** so the TB-direct re-engineering is scoped correctly before any build.

> **UPDATED 2026-09-17 (post-Spencer).** Spencer (bridge owner) sent the authoritative control contract (`OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md`) + corrected matrix after the first draft of this gate. It **corrects our control-plane findings** and answers the open asks. Full analysis: `OOH_TB_DIRECT_CONTROL_SPEC_IMPACT_2026-09-17.md`. Changes folded in below (see the ⟳ markers).

> **Interactive review:** [`mockups/OOH_TB_DIRECT_DECISIONS_review.html`](mockups/OOH_TB_DIRECT_DECISIONS_review.html) — the verdict board (C1–C8) and decision console (D1–D10). Evidence: `OOH_TB_DIRECT_VALIDATION_REPORT.md` + `OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md`. Spencer's corrected asset matrix: `mockups/OOH_ASSET_CONTROL_MATRIX_corrected.html`.

---

## Go / No-Go

**GO to design — conditional** on folding D1–D10 into the design brief. The two make-or-break questions are YES: the read plane returns full site estates directly from ThingsBoard at scale, and the interface-preserving code swap is safe *and corrective*. With Spencer's spec, the **control plane is now in better shape than our validation implied** — setpoint control is contract-proven for both Salus and Intesis, and two open asks (least-privilege, multi-gang) are resolved. Three concrete pre-build code fixes and two new constraints now apply.

## Claim verdicts (re-proven adversarially; ⟳ = corrected by Spencer's spec)

- **C1 — Read plane returns the full estate · ✅ CONFIRMED.** 9 sites live; 6261 = 23/18; scalable per-site query.
- **C2 — Auth (JWT service accounts) · ✅ CONFIRMED, least-privilege ⚠️ REFUTED but now REMEDIATED.** Both accounts are TENANT_ADMIN today; Spencer is binding a read-scoped role (see D5).
- **C3 — `gk-{site}` prefix authoritative · 🔴 REFUTED.** Substring `textSearch` bleeds and halves split sites. See D1.
- **C4 — Names parse cleanly · 🔴 REFUTED.** 76% conform; 3,086 exceptions; 19 undocumented profiles. See D2.
- **C5 — Control confirms via `SyncStatus=synced` · ⟳ CORRECTED — the bench results were the contract behaving correctly, NOT a refutation.** Tuya switch PROVEN; Salus IT700 setpoint accepted (`pending`, slow-echo) with `modeDesired`→`failed` / `hwBoost`→`rejected` correct-by-design; Intesis setpoint PROVEN synced. Genuinely unproven: **Intesis on/off via `modeDesired`** (bench unit has no mode/power telemetry) and **Salus IT500 hwBoost** (none on bench). Fan speed is not controllable at all.
- **C6 — Bounded controllable set · ✅ CONFIRMED (strengthened).** Spencer's four keys (`switchDesired`, `setpointDesired`, `modeDesired`, `hwBoostHoursDesired`) are the whole contract.
- **C7 — Controllability is per-device · ✅ CONFIRMED.** Reinforced by the "control only if the device carries a switch" rows.
- **C8 — Interface-preserving code swap · ✅ CONFIRMED (with conditions).** Safe + corrective (`deviceId`=TB-name fixes a latent break). See D8. Control-dispatch logic gains new requirements (D3, D9).

## Decisions to record (D1–D10)

**D1 — Site-query strategy · design blocker.** *Recommend:* over-fetch a broad prefix, then filter client-side with an anchored regex (brand + site, bounded by a dash or end-of-name, case-insensitive), plus a site-token alias map. Unchanged by Spencer.

**D2 — Classification model · design blocker.** *Recommend:* capability-based + typo-tolerant; extend the dictionary with the 19 missing profiles. Now also carries concrete value bounds from the spec (setpoint ranges, `modeDesired` enum).

**D3 — Confirm-loop semantics · design blocker · ⟳ EXPANDED.** *Recommend:* (a) read the confirm keys from the **timeseries** endpoint, not attributes (code fix #1); (b) be **edge-aware** — compare the requested value to the current `*Desired` before dispatch and treat "already at value" as a distinct no-dispatch outcome (edge-triggering, spec §3 rule 1); (c) keep the extended `Reported===Desired` guard; (d) keep a client-side timeout (there is **no** server `timeout` state); (e) keep `failed`/`rejected` handling. Pre-write value-type validation stays (the bad-value trap survives).

**D4 — Which control ships in v1 · ask/decide · ⟳ CHANGED.** Setpoint is now contract-proven for Salus **and** Intesis; only **Intesis on/off (`modeDesired`)** and **Salus IT500 hwBoost** remain genuinely unproven. *Recommend:* see the new **D10** — decide whether v1 widens from Tuya-only to Tuya switch + setpoint. Reconcile SD-492 (setpoint is the shipping Salus path).

**D5 — TB read least-privilege · ⟳ RESOLVED pending verification.** Spencer is binding the `Airedale Read Only` role. *Verify before closing:* the role can read devices **and** timeseries telemetry; which Key Vault secret maps to it; and that it genuinely cannot write `SHARED_SCOPE`. Until bound, keep `WRITES_DISABLED` + kill-switch.

**D6 — Push `WRITES_DISABLED` into the write primitive · build item.** *Recommend:* add a fail-closed guard inside `writeSharedAttribute` itself. More important now that setpoint control may enter scope.

**D7 — Multi-gang Tuya · ⟳ RESOLVED (not available).** A single `switchDesired` drives one gang; `switch_2` is not addressable — needs a contract change. *Recommend:* treat multi-gang as read-only for now; raise a contract-change ask with Spencer only if OOH needs second-gang control.

**D8 — Name-search, status latch and test migration on the swap · build item.** *Recommend:* bake into the read-service design (warmed pub-name search index, boolean `bridgeStatus()` latch, `deviceId`=TB name, telemetry-key population, migrate the shape-pinning tests).

**D9 — Registration-gate guard · design blocker (NEW, from spec §3 rule 2).** TB silently drops commands for a device that has never published first state. *Recommend:* before offering/dispatching control, assert the device has published a snapshot (the existing online guard is a partial proxy) so a never-reported device does not silently swallow commands.

**D10 — Control v1 scope · decide (NEW).** *Options:* **(a) Tuya switch only** (most conservative — proven, highest volume); **(b) Tuya switch + setpoint (Salus + Intesis)** — setpoint is contract-proven, needs the D3 confirm-loop + mode-casing safety fix but not mode/on-off; **(c) add mode/on-off** — blocked until Intesis `modeDesired` on/off is proven on a mode-capable unit and the casing bug is fixed. *Recommend:* **(b)** — widen to Tuya + setpoint, hold mode/on-off and IT500 hwBoost.

## Concrete pre-build code fixes surfaced (verified against the codebase)
1. **`services/tb-client.js:177`** — confirm-read uses `/values/attributes`; the spec's `*Reported`/`*SyncStatus` are **telemetry** (use `/values/timeseries`). Latent (masked by the write-lock); **must fix before live control**.
2. **`services/control.js:87`** — dispatch is not edge-aware (always writes the value); add compare-before-dispatch.
3. **`public/js/control.js:64,202` + `registry.js:36`** — mode is sent capitalised (`'Off'`); Intesis treats any non-`off` value as ON, so `'Off'` could switch an AC **on**. Lowercase the vocabulary. **Safety.**
4. Minor: Intesis range `16–30` → `16–32` (`registry.js:35`); confirm the `hwBoost` reported-key name and the IT500 one-device-vs-split-deviceType question with Spencer.

## Recommended first design increment (if GO)
1. **Read-service** (`services/tb-device.js`) preserving the bridge interface: `deviceId`=TB name; robust site query (D1); capability-based, typo-tolerant classifier covering the 19 profiles (D2); telemetry-key population; warmed name-search index; boolean `bridgeStatus()` latch (D8).
2. **Confirm-loop redesign** (D3, expanded): timeseries endpoint + edge-aware compare-before-dispatch + `Reported===Desired` + client-side timeout + `failed`/`rejected` handling + registration-gate guard (D9).
3. **Control scope v1 per D10** (recommend Tuya switch + setpoint); add `switchDesired` to `ATTRIBUTE_FAMILY` + registry; fix mode casing; hold Intesis on/off + IT500 hwBoost; boiler deferred.
4. **Safety**: `WRITES_DISABLED` primitive-level guard (D6); live write-lock stays until James lifts it.
5. **Test migration** for the `deviceId` contract change; unit-test the classifier and the confirm-loop edge cases.

## On approval
- **Accept** → the design increment begins with D1–D10 baked in.
- **Amend** → leave the specific changes; scope is revised before design starts.
- Provenance: hand-authored artefact; no doer produced it. Evidence: `OOH_TB_DIRECT_VALIDATION_REPORT.md`, `OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md`, `OOH_TB_DIRECT_CONTROL_SPEC_IMPACT_2026-09-17.md`.
