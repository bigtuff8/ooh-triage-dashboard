# OOH Dashboard — ThingsBoard-Direct: Design Decisions Gate

**Timestamp:** 2026-09-17 · **Stage:** pre-design decision gate · **Owner:** James Brown
**Gate ask:** review the adversarial validation outcome and record decisions **D1–D8** so the TB-direct re-engineering is scoped correctly before any build.

> **Interactive review:** [`mockups/OOH_TB_DIRECT_DECISIONS_review.html`](mockups/OOH_TB_DIRECT_DECISIONS_review.html) — the verdict board (C1–C8, tap for evidence) and the decision console (D1–D8 with options, recommendations, and a lean-capture aid) are embedded as the **Live prototype** on this PR. Full evidence in `OOH_TB_DIRECT_VALIDATION_REPORT.md`; Spencer's open questions in `OOH_TB_DIRECT_SPENCER_QUERY_2026-09-17.md`.

---

## Go / No-Go

**GO to design — conditional** on folding D1–D8 into the design brief. The two make-or-break questions are YES: the read plane returns full site estates directly from ThingsBoard at scale, and the interface-preserving code swap is safe *and corrective* (it fixes a latent live-control bug). Tuya switch control — the highest-volume controllable type — is proven end-to-end. This is **not** a no-go and **not** a blank cheque: three claims are refuted as written and must be hardened in design first.

## Claim verdicts (re-proven adversarially, live)

- **C1 — Read plane returns the full estate · ✅ CONFIRMED.** 9 sites re-proven live; site 6261 = 23 devices / 18 active; per-site query is cheap and scalable on the 12,812-device tenant.
- **C2 — Auth (JWT service accounts) · ✅ CONFIRMED, but least-privilege ⚠️ REFUTED.** Both accounts log in as designed, but `svc-read@` and `svc-control@` are both TENANT_ADMIN, so the read credential can write. See D5.
- **C3 — `gk-{site}` prefix is authoritative · 🔴 REFUTED.** ThingsBoard `textSearch` is an unanchored substring match: the bare form bleeds across neighbouring real sites, and the dash-anchored form silently drops split sites (md-1110 loses 95%). See D1.
- **C4 — Names parse cleanly into four parts · 🔴 REFUTED.** Only 76% conform; 3,086 exceptions; 19 populated profiles (~646 devices) are undocumented, including controllable Salus thermostats on the `default` profile. See D2.
- **C5 — Control confirms via `SyncStatus=synced` · 🟡 MIXED.** Tuya switch proven end-to-end (under 1s); Salus refused to confirm on the bench (stuck pending / failed / rejected); Intesis adapter was dormant. Two false-success traps found. See D3 and D4.
- **C6 — Bounded controllable set · ✅ CONFIRMED (structural).** No unexpected controllable type appeared; only Tuya was actively proven end-to-end this session.
- **C7 — Controllability is per-device, not per-profile · ✅ CONFIRMED.** Controllable Salus thermostats sit on the `default` profile at 18 sites; capability must be derived from telemetry signals, not the profile label.
- **C8 — Interface-preserving code swap is safe · ✅ CONFIRMED (with conditions).** Safe *and* corrective: `deviceId` today is the bridge id, not the TB name, so live control is latently broken behind the write-lock — setting `deviceId` to the TB name fixes it. Conditions: keep pub-name search, populate the telemetry keys consumers read, migrate the shape-pinning tests. See D8.

## Decisions to record (D1–D8)

**D1 — Site-query strategy · design blocker.** *Recommend:* over-fetch a broad prefix, then filter client-side with an anchored regex (brand + site, bounded by a dash or end-of-name, case-insensitive), plus a site-token alias map (e.g. `1110` ↔ `1110meridian`). Rejected: anchored-only (drops split sites); bare-only (bleeds neighbours).

**D2 — Classification model · design blocker.** *Recommend:* derive control-eligibility from telemetry/attribute capability signals (never the profile label), make assetType matching typo-tolerant, and extend the data dictionary with the 19 missing profiles before build.

**D3 — Confirm-loop semantics · design blocker.** *Recommend:* treat a command as confirmed only when `Reported` equals `Desired` **and** the sync timestamp advanced past the write, with a client-side timeout; validate value types before every write. `SyncStatus=synced` alone is insufficient (proven false-success traps).

**D4 — Salus/Intesis control unproven on bench · ask Spencer.** *Recommend:* hold thermostat and AC control; ship Tuya-only control v1; send the Spencer query. Reconcile against SD-492's claimed shipping Salus path before enabling.

**D5 — TB read least-privilege · ask Spencer.** *Recommend:* request a genuinely read-scoped TB role for the read path; otherwise consciously accept TENANT_ADMIN-both and rely on the app-layer `WRITES_DISABLED` + kill-switch as the sole barrier.

**D6 — Push `WRITES_DISABLED` into the write primitive · build item.** *Recommend:* add a fail-closed guard inside `writeSharedAttribute` itself, so a future caller cannot write despite the flag. Fail-closed holds today only because both callers remember to guard.

**D7 — Multi-gang Tuya addressing · ask Spencer.** *Recommend:* obtain a genuine 2-gang bench device (or the bridge's per-channel convention) before shipping multi-gang control. Single-gang is fully proven and unaffected.

**D8 — Name-search, status latch and test migration on the swap · build item.** *Recommend:* bake into the read-service design a warmed pub-name search index, a boolean `bridgeStatus()` health latch, `deviceId` set to the TB name, telemetry-key population, and migration of the shape-pinning tests.

## Recommended first design increment (if GO)
1. **Read-service** (`services/tb-device.js`) preserving the bridge interface: `deviceId` set to the TB name; robust site query (D1); capability-based, typo-tolerant classifier covering the 19 profiles (D2); telemetry-key population including `switch_1` normalisation; warmed name-search index; boolean `bridgeStatus()` latch (D8).
2. **Confirm-loop redesign** (D3): `Reported` equals `Desired`, plus timestamp-advance, plus client-side timeout, plus pre-write value validation.
3. **Control scope v1 = Tuya switch only** (proven). Salus/Intesis control **held** pending D4; boiler deferred.
4. **Safety**: add `switchDesired` to `ATTRIBUTE_FAMILY`; add the `WRITES_DISABLED` primitive-level guard (D6); the live write-lock stays until James lifts it.
5. **Test migration** for the `deviceId` contract change; unit-test the classifier against the real 6261 set and the C4 exception classes.

## On approval
- **Accept** → the design increment above begins with D1–D8 baked in.
- **Amend** → leave the specific changes; the scope is revised before design starts.
- Provenance: this gate attaches the hand-authored artefact; no doer produced it. Evidence: `OOH_TB_DIRECT_VALIDATION_REPORT.md`.
