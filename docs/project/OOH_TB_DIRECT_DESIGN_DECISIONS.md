# OOH Dashboard — ThingsBoard-Direct: Design Decisions Gate

**Timestamp:** 2026-09-17 · **Stage:** pre-design decision gate · **Owner:** James Brown
**Gate ask:** review the adversarial validation outcome and record decisions **D1–D8** so the TB-direct re-engineering is scoped correctly before any build.

> **Interactive review:** [`mockups/OOH_TB_DIRECT_DECISIONS_review.html`](mockups/OOH_TB_DIRECT_DECISIONS_review.html) — the verdict board (C1–C8, tap for evidence) and the decision console (D1–D8 with options, recommendations, and a lean-capture aid) are embedded as the **Live prototype** on this PR. Full evidence in `OOH_TB_DIRECT_VALIDATION_REPORT.md`; Spencer's open questions in `OOH_TB_DIRECT_SPENCER_QUERY_2026-09-17.md`.

---

## Go / No-Go

**GO to design — conditional** on folding D1–D8 into the design brief. The two make-or-break questions are YES: the read plane returns full site estates directly from TB at scale, and the interface-preserving code swap is safe *and corrective* (it fixes a latent live-control bug). Tuya switch control — the highest-volume controllable type — is proven end-to-end. This is **not** a no-go and **not** a blank cheque: three claims are refuted as written and must be hardened in design first.

## Claim verdicts (re-proven adversarially, live)

| Claim | Verdict | Basis |
|---|---|---|
| C1 Read plane returns full estate | ✅ CONFIRMED | 9 sites live; 6261 = 23/18; scalable per-site query |
| C2 Auth (JWT service accounts) | ✅ CONFIRMED auth / ⚠️ least-privilege REFUTED | both accounts are TENANT_ADMIN — read cred can write |
| C3 `gk-{site}-*` prefix authoritative | 🔴 REFUTED | TB `textSearch` is unanchored substring — bleeds AND halves split sites |
| C4 Names parse cleanly | 🔴 REFUTED | 76% conform; 3,086 exceptions; 19 undocumented profiles |
| C5 Control confirms via `SyncStatus=synced` | 🟡 MIXED | Tuya CONFIRMED; Salus REFUTED on bench; Intesis GATED; false-success traps |
| C6 Bounded controllable set | ✅ CONFIRMED (structural) | no unexpected type; only Tuya proven E2E |
| C7 Controllability per-device | ✅ CONFIRMED | controllable Salus on the `default` profile at 18 sites |
| C8 Interface-preserving swap safe | ✅ CONFIRMED (w/ conditions) | safe + corrective; `deviceId`=TB-name fixes latent break |

## Decisions to record (D1–D8)

| # | Decision | Type | Recommendation |
|---|---|---|---|
| **D1** | Site-query strategy | Design blocker | Broad fetch + anchored-regex `^{brand}-{site}(-\|$)` + site-token alias map |
| **D2** | Classification model | Design blocker | Capability-based + typo-tolerant; extend dictionary with the 19 profiles |
| **D3** | Confirm-loop semantics | Design blocker | `Reported===Desired` + timestamp-advance + client timeout + value validation |
| **D4** | Salus/Intesis control unproven on bench | Ask Spencer | Hold thermostat/AC control; ship Tuya v1; send the Spencer query |
| **D5** | TB read least-privilege | Ask Spencer | Request a read-scoped TB role, else accept TENANT_ADMIN-both + app guard |
| **D6** | Push `WRITES_DISABLED` into the write primitive | Build item | Add `if(config.writesDisabled) throw` in `writeSharedAttribute` |
| **D7** | Multi-gang Tuya addressing | Ask Spencer | Get a 2-gang bench device before shipping multi-gang; single-gang unaffected |
| **D8** | Name-search + status latch + test migration | Build item | Bake into the read-service design |

## Recommended first design increment (if GO)
1. **Read-service** (`services/tb-device.js`) preserving the bridge interface: `deviceId = TB name`; robust site query (D1); capability-based, typo-tolerant classifier covering the 19 profiles (D2); telemetry-key population incl. `switch_1` normalisation; warmed name-search index; boolean `bridgeStatus()` latch (D8).
2. **Confirm-loop redesign** (D3): `Reported===Desired` + timestamp-advance + client-side timeout + pre-write value validation.
3. **Control scope v1 = Tuya switch only** (proven). Salus/Intesis control **held** pending D4; boiler deferred.
4. **Safety**: `switchDesired` → `ATTRIBUTE_FAMILY`; `WRITES_DISABLED` primitive-level guard (D6); live write-lock stays until James lifts it.
5. **Test migration** for the `deviceId` contract change; unit-test the classifier against the real 6261 set + the C4 exception classes.

## On approval
- **Accept** → the design increment above begins with D1–D8 baked in.
- **Amend** → leave the specific changes; the scope is revised before design starts.
- Provenance: this gate attaches the hand-authored artefact; no doer produced it. Evidence: `OOH_TB_DIRECT_VALIDATION_REPORT.md`.
