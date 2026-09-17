# OOH Dashboard — ThingsBoard-Direct Discovery: Adversarial Validation Report

**Timestamp:** 2026-09-17 · **Author:** OOH validation session (fresh, adversarial) · **Status:** Validation complete — pre-design gate.
**Mission:** independently re-prove or refute every claim (C1–C8) in the TB-direct discovery against live systems and the codebase, so the re-engineering works first time.

**Method:** four parallel adversarial agents, each briefed to *break* its claim, not confirm it. Live probes ran read-only against production ThingsBoard (`portal.lhlive.co.uk`); all write tests ran on dev-TB bench only (`airedale-dev.iot-private.cloud`). **Zero production writes.** Secrets held in shell variables only — none written to disk, logs, or this doc. No product code written this session.

---

## 0. Verdict at a glance

| # | Claim (abbrev) | Verdict | One-line basis |
|---|---|---|---|
| **C1** | Name query returns a site's full estate | ✅ **CONFIRMED** | 9 sites re-proven live; 6261 = 23/18 reconfirmed; scalable |
| **C2** | Auth: JWT service accounts; ApiKey scheme | ✅ **CONFIRMED** (auth) / ⚠️ **REFUTED** (least-privilege framing) | Both accounts log in via JWT; but both are **TENANT_ADMIN** — read cred *can* write |
| **C3** | `gk-{siteNo}-*` prefix is authoritative | 🔴 **REFUTED** | TB `textSearch` is unanchored **substring** — bleeds across real sites *and* halves split sites |
| **C4** | Names parse cleanly into `{brand}-{site}-{type}-{n}` | 🔴 **REFUTED** | Only 76% conform; 3,086 exceptions; 19 undocumented profiles (~646 devices) |
| **C5** | Control payloads confirm via `<x>SyncStatus=synced` | 🟡 **MIXED** | Tuya CONFIRMED; **Salus REFUTED on bench**; Intesis GATED; two false-success traps found |
| **C6** | Bounded controllable set (Tuya/Salus/Intesis/boiler) | ✅ **CONFIRMED** (structural) | No unexpected controllable type; only Tuya actively proven E2E |
| **C7** | Controllability is per-device, not per-profile | ✅ **CONFIRMED** | Controllable Salus thermostats live on the `default` profile at 18 sites |
| **C8** | Interface-preserving code swap is safe | ✅ **CONFIRMED** (with conditions) | Swap is safe **and corrective**; `deviceId`=TB-name fixes a latent live-control break |

**Overall: GO to design — conditional.** The direction is sound and the two hardest questions (does the read plane work? is the code swap safe?) are YES. But three claims are **refuted as stated**, and the design's naive recipes (`textSearch=gk-<site>`, "SyncStatus==synced means done", profile-based classification, "service account = least privilege") must be replaced before build. The concrete hardened scope is in §3.

---

## 1. Per-claim findings & evidence

### C1 — Read plane returns the full estate · ✅ CONFIRMED
Name-search returns coherent full device sets far beyond the bridge's 1-device view, re-proven across diverse sites and site-key styles:

| Site (anchored query) | devices | style |
|---|---|---|
| `gk-6261-` | **23** (18 active) | numeric — exact reconfirmation of prior claim |
| `gk-6209-` | 21 | numeric |
| `gk-6225-` | 27 | numeric |
| `gk-1648-` | 18 | numeric (mixed-case names in-set) |
| `gk-allertonhallfarm-` | 51 | **alphanumeric** |
| `gk-linwoodfarm-` | 60 | alphanumeric |
| `md-1110meridian-` | 112 | McDonald's brand |
| `md-319fossepark-` | 138 | McDonald's brand |
| `gl-6218-`, `go-6288-` | 1 each | minor-brand partial installs |

Full tenant pulled and parsed: **12,812 devices** (exact match to the dictionary), 39 populated profiles, top-profile counts reproduced exactly — confirming a complete, faithful pull. Per-site `textSearch` is a cheap server-side query returning `totalElements` immediately; **no full-estate pull needed at runtime**; pagination only above 200 devices (largest sampled site = 138). **C1 holds.**

### C2 — Auth scheme · ✅ CONFIRMED (auth) / ⚠️ REFUTED (least-privilege framing)
Both prod service accounts authenticate via `POST /api/auth/login` → JWT, header `X-Authorization: Bearer <token>` — matches `services/tb-client.js:37,49`. Live whoami (`GET /api/auth/user`):

| Account | KV secret | authority (LIVE) | customer scope |
|---|---|---|---|
| read `svc-read@` | `thingsboard-read-*` | **TENANT_ADMIN** | null-UUID sentinel (no scoping) |
| control `svc-control@` | `thingsboard-control-*` | **TENANT_ADMIN** | null-UUID sentinel |

**The least-privilege rationale is REFUTED.** The design (§3, §7-item-2) argued the read *service account* should replace James's personal API key because the key inherits "James=TENANT_ADMIN, too broad." But `svc-read@` is **also TENANT_ADMIN** — on a scope basis it is no more least-privilege than the key. TENANT_ADMIN grants `POST …/attributes/SHARED_SCOPE` — the exact write primitive `tb-client.js:165` uses. So the app's `readSession`/`writeSession` split (`tb-client.js:98-99`) is **nominal, not TB-enforced**: a leak/misuse of the *read* credential can write to any device in the estate.
- What the service account *does* buy: de-personalisation (survives James's offboarding, independently revocable, no personal key sprawl) — an operational-hygiene win, not a scope-reduction win.
- **Decision needed** (see D5): provision a genuinely read-scoped TB role, or accept both creds at TENANT_ADMIN with `WRITES_DISABLED` + kill-switch as the *only* barrier.

### C3 — `gk-{siteNo}-*` is the authoritative site query · 🔴 REFUTED
TB `textSearch` is an **unanchored substring match**, and neither query form is simultaneously complete and non-bleeding.
- **Substring proven:** `gk-626` → **113** devices across **five** sites (6261/6263/6267/6268/6269); `gk-626-` (trailing dash) → 0.
- **Bare-form bleed is a real production hazard — 50 collision pairs, incl. genuine gk numeric sites:** `gk-010102`↔`gk-0101020`, `gk-06873`↔`gk-068730`; md is riddled (`319/319fossepark`, `1110/1110meridian`, `1244/1244battlefield`…). The design's own recipe (`textSearch=gk-6261`, no trailing dash) is the **bleeding** form.
- **Anchored form (`gk-{site}-`) fixes bleed but silently MISSES split sites:** site md-1110 has 118 devices split `md-1110-*` (6) + `md-1110meridian-*` (112) — anchored returns 6, **misses 95% of the site**. Real gk case: `gk-6209-` = 21 but `gk-6209fryer-1` (glued, missing dash) is dropped. Farm sites collide too (`linwood`/`linwoodfarm`, three spellings of `bystander wootton`).
- **In the design's favour:** TB `textSearch` **is case-insensitive server-side** — `gk-`/`Gk-`/`GK-` return identical results; the "queries must be case-insensitive" worry is unfounded (casing matters only for client-side *parsing*).

**Robust approach (see D1):** over-fetch on a broad prefix, then filter client-side with anchored regex `^{brand}-{site}(-|$)` (case-insensitive), **plus** site-token alias resolution (`1110`↔`1110meridian`).

### C4 — Names parse cleanly into `{brand}-{site}-{assetType}-{n}` · 🔴 REFUTED
Only **75.9%** (9,726/12,812) match strict `{brand}-{site}-{assetType}-{n}`; even gk-numeric-only is **82.2%**. **3,086 non-conforming names.**

Exception classes: **873** contain spaces (`Arrow gr3 grill`); **425** contain parentheses — many embedding *other* site numbers (`gk-6360-maindb-r10a (5135)`) → mis-site risk; **416+** missing `-n` (all remote.it R10As, gateways); **437** with <2 dashes (raw devEUIs `a8404120fc584150`, bare numbers); **12** hex-UUID suffixes (`gk-6770-intesis-688ce553`); underscore + doubled-site-code names (`md_11101110meridian_multiplex_1`) that defeat any `-`-split parser; `(old)`/`old` duplicate devices inflating counts; and in-name typos (`extracfan`, `bainmare`) demanding fuzzy classification.

**19 populated profiles (~646 devices) are absent from the data dictionary**, including `gatewayDevice` (306 — carries real kitchen equipment), `powerpause-circuit` (237), and critically `default` (28 — **hosts controllable Salus thermostats**, see C7). The dictionary's "top profiles" silently skipped `gatewayDevice` and `powerpause-circuit`, both of which outrank profiles it listed.

### C5 — Control payloads confirm via `<x>Reported` + `<x>SyncStatus=synced` · 🟡 MIXED
Re-proven per type on the dev bench (all thermostats captured-and-restored; no home/office unit physically actioned):

| Type | Device(s) | Result | Evidence |
|---|---|---|---|
| **Tuya switch** | `bench-owon-1` + all 3 `bench-tongou-*` | ✅ **CONFIRMED** | `switchReported`+`switchSyncStatus=synced` in **<1s** |
| **Salus thermostat** | `spencer-home-salusit700` | 🔴 **REFUTED on bench** | `setpointDesired`→`pending` (stuck indefinitely); `modeDesired`→`failed`; `hwBoostHoursDesired`→`rejected`; never `synced` |
| **Intesis AC** | `funklet-intesis-29d1f022` | 🟡 **GATED** | adapter dormant — fresh `setpointDesired` didn't re-dispatch; **OnOff/FanSpeed literal names UNVERIFIED** |

**Cross-vendor key variance (design-critical):** confirm keys `switchReported`/`switchSyncStatus` are **created lazily by the bridge on first dispatch** (absent/null before). Only `switchOn` is always present. `switch_1` is **stale** on the bench (never trust it). Normalisation rule: trust `switchReported` only when present *and fresh*; fall back to `switchOn`; never `switch`/`switch_1`.

**Two false-success traps (the adversarial core — these are hard design requirements):**
1. **Bad value silently ignored** — `switchDesired:"banana"`/`42` → TB accepts (HTTP 200), bridge ignores, `SyncStatus` **stays at prior `synced`**. A malformed command is undetectable via SyncStatus.
2. **Dormant/offline adapter** → write accepted, no fresh `Reported`, `SyncStatus` **stays stale `synced`**.
3. **Timeout** — `pending` is a **terminal-stuck state**, never auto-transitions to error.

Observed state machine: `pending → {synced | failed | rejected}` + two silent non-transitions leaving a stale `synced`. **The confirm-loop must check `Reported === Desired` AND that the sync timestamp advanced past the write AND carry its own client-side timeout** — `SyncStatus==synced` alone is insufficient (see D3).

### C6 — Bounded controllable set · ✅ CONFIRMED (structural)
Only the expected attribute families exist; no unexpected controllable type appeared across the estate. Holds structurally — caveat: only Tuya was *actively* proven end-to-end this session (Salus/Intesis bench adapters did not complete a round-trip; see C5).

### C7 — Controllability is per-device, not per-profile · ✅ CONFIRMED
Strong independent evidence from the read plane: **controllable Salus thermostats sit on the `default` profile at 18 gk sites** (`gk-2933-salusit700`, `gk-6218-salusit700`), and real kitchen equipment sits on `gatewayDevice` (306 devices). Control-eligibility **must** be derived from telemetry/attribute capability signals, never the profile label. Bench corroboration: `bench-tongou-sy2-1` (no pre-existing `switchDesired`) accepted control and reached `synced` — capability isn't gated on a pre-existing desired attribute. The "monitoring-profile device carrying a Tuya `switch_1`" case still wants a prod-read spot-check but the per-device principle is confirmed.

### C8 — Interface-preserving code swap · ✅ CONFIRMED (with conditions)
The public interface (`getSites/getSitesByNumber/searchSites/getDevice/bridgeStatus`) and canonical device/site shapes **can** be preserved so `control.js`, `routes/api.js`, `public/js/flows.js`, `registry.js` stay untouched by the read swap. No consumer reaches into a bridge-only field — the mapping boundary is clean (top-level device & site shapes are an **exact** match to `mapBridgeDevice`, `services/bridge.js:70-88`).

**Decisive finding — the swap is corrective, not just compatible.** `deviceId` today is the **bridge/vendor id** (`salus-gk-6261-it700tx-025e0726`, `bridge.js:71`), **not** the TB name. Control resolves the UUID by *name* (`tb-client.js:105` → `?deviceName=`). So in live mode the write path would query the wrong name and `tbDeviceUuid` throws — **live control is latently broken today**, masked only by the write-lock. Setting `deviceId = tbDeviceName` in the read-service is **necessary and sufficient** to fix it, and safe (every other consumer treats `deviceId` as opaque). CI never caught this because `tb-client` is mocked in the tests.

**Conditions that must be handled or the swap regresses:**
1. **HIGH — pub-name search breaks.** `searchSites` today matches `siteName.includes(q)` (`bridge.js:186`); TB `textSearch` is a device-name/number query and cannot satisfy pub-name search (a test-asserted, load-bearing feature). The read-service must keep a name-searchable index (warmed enriched set).
2. **HIGH — telemetry-key contract.** Consumers read specific keys; the service must populate them or downstream silently degrades. `heatingSetpoint` is control-blocking (`registry.js:80-81` refuses without it); `switch_1`, `hwBoostHours`, `mode`, `localTemperature`, `hotWater` drive readouts/scopes. Design §4b's `switchReported→switchOn→switch_1` normalisation into `switch_1` is **required, not optional**.
3. **MEDIUM — test migration.** `test/bridge.test.js:61,75` assert `deviceId === 'salus-gk-…'` — they enshrine the old contract and WILL fail once deviceId becomes the TB name. Plan the migration.
4. **MEDIUM — `bridgeStatus()` must be re-implemented**, keeping the boolean `{mode,healthy,lastError}` latch (`bridge.js:201-207`) that the degraded banner + `liveness.producerHealthy()` depend on — not delegated to the tri-state `tbStatus()`.
5. **LOW** — override continuity across cutover (holds keyed by old deviceId won't match), and the ambiguous-resolution guard becomes near-unreachable.

`switchDesired` addition to `ATTRIBUTE_FAMILY` (`tb-client.js:15-19`) is confirmed absent and purely additive — consumption is attribute-generic (`tb-client.js:159,173`). **Note:** activating actual switch *control* (wiring flows.js/registry/SCOPE_GROUPS) is a **separate step** from the read swap — the dormant kitchen/lighting/fan flows render monitor-only today and keep working untouched on `kind` + `telemetry.switch_1` alone.

### Fail-safe (cross-cutting) · ✅ PROVEN
`WRITES_DISABLED` fails **closed**: `config.js:90` enables writes only on exact `"false"` (unset/`""`/`"true"`/typo ⇒ disabled), read from raw `process.env`; `killswitch.writesBlocked()` checks it first and synchronously (`killswitch.js:32-34`), before any Cosmos read; both — and only — write callers guard before writing (`control.js:67`, `overrides.js:149`); no direct `writeSession.request` outside `tb-client.js`. Test-backed (`test/writesDisabled.test.js`). **Hardening item (D6):** the primitive `writeSharedAttribute` (`tb-client.js:158-166`) does not itself consult the flag — a future third caller that forgets the guard would write. Add a belt-and-braces `if (config.writesDisabled) throw` at the primitive. Secret-leakage audit: **clean** (no cred/token logging; error handler returns fixed message; `.env` git-ignored and read-blocked by policy).

---

## 2. Consolidated open-decisions list (for James)

| # | Decision | Why it matters | Recommendation |
|---|---|---|---|
| **D1** | **Site-query strategy** — replace naive `textSearch=gk-<site>`. | Bare form bleeds across real sites; anchored form halves split sites (md-1110 loses 95%). | Over-fetch broad prefix → client-side anchored-regex `^{brand}-{site}(-\|$)` (case-insensitive) **+ site-token alias resolution**. Needs a canonical site→token(s) map. |
| **D2** | **Classification must be capability-based + typo-tolerant + cover 19 extra profiles.** | 24% of names don't fit the pattern; controllable Salus sits on `default`; kitchen gear on `gatewayDevice`. | Derive control-eligibility from telemetry/attribute signals, not profile; fuzzy assetType matching; extend the data dictionary with the 19 missing profiles before build. |
| **D3** | **Confirm-loop semantics** — `SyncStatus==synced` is insufficient. | Bad value & dormant adapter both leave a **stale `synced`** (false success); `pending` sticks forever. | Confirm requires `Reported===Desired` **+** advanced sync timestamp **+** client-side timeout; client-side value-type validation before every write. |
| **D4** | **Salus & Intesis bench round-trips did not complete.** SD-492 claims a shipping Salus path — reconcile. | Two of four controllable types are **not** empirically proven E2E; Intesis OnOff/FanSpeed attr names still unknown. | Ask Spencer: is the bench Salus/Intesis adapter wired? Re-run when awake, or get the bridge's per-profile attribute map. Don't enable Salus/Intesis control on the strength of the *shape* alone. |
| **D5** | **TB read least-privilege** — both service accounts are TENANT_ADMIN. | The read cred can write; read/write split is app-convention only. | Provision a genuinely read-scoped TB role (CUSTOMER_USER or custom), **or** consciously accept TENANT_ADMIN-both + rely on `WRITES_DISABLED`/kill-switch. Flag to Spencer. |
| **D6** | **Push `WRITES_DISABLED` into the write primitive.** | Fail-closed holds today only because both callers remember to guard. | Add `if (config.writesDisabled) throw` inside `writeSharedAttribute` — belt-and-braces. (Small build item, not a blocker.) |
| **D7** | **Multi-gang Tuya channel addressing — unresolved.** | No 2-gang device on the bench; unknown whether `switchDesired` addresses a channel. | Get a real 2-gang device (bench or prod-read inspection) before shipping any multi-gang switch control. Single-gang unaffected. |
| **D8** | **Name-search + `bridgeStatus` + test migration** on the code swap. | Pub-name search and the health latch are load-bearing; shape tests pin the old deviceId. | Bake into the read-service design: warmed name index, boolean status latch, `deviceId=TB-name`, telemetry-key population, migrate `bridge.test.js`. |

---

## 3. Go / No-Go for design

### ✅ GO to design — **conditional on folding D1–D8 into the design brief.**

**Why GO:** the two make-or-break questions are answered YES. (1) The read plane genuinely returns full site estates directly from TB, at scale, across brands and site-key styles — the bridge's 1-of-23 view is decisively beaten. (2) The interface-preserving code swap is safe *and* corrects a latent live-control bug. Tuya switch control — the highest-volume controllable type (kitchen/lighting/fans/heaters) — is proven end-to-end in <1s. The fail-closed write safety is sound and test-backed.

**Why conditional (not an unqualified go):** three claims are refuted *as written*. The design's naive recipes would ship real defects: cross-site device bleed (D1), ~24% of devices misclassified or dropped (D2), false-success control confirmations (D3), and two of four control types unproven (D4). None of these sink the direction — they are **design hardening**, not architecture changes. The architecture (TB-direct read; bridge-behind-TB dispatch; interface-preserving swap) stands.

**This is NOT a no-go, and NOT a blank-cheque go.** Proceed to design; the design must explicitly solve D1–D4 (functional correctness) and note D5–D8 (safety/coverage) before any build.

### Design-kickoff scope (if go — recommended first design increment)
1. **Read-service (`services/tb-device.js`)** preserving the bridge interface, with: `deviceId = tbDeviceName`; a **robust site query** (broad fetch + anchored-regex filter + site-token alias map, D1); a **capability-based, typo-tolerant `classifyDevice()`** covering the 19 extra profiles (D2); telemetry-key population incl. `switch_1` normalisation; a **warmed name-search index** and boolean `bridgeStatus()` latch (D8).
2. **Confirm-loop redesign** (D3): `Reported===Desired` + timestamp-advance + client-side timeout + pre-write value validation. This is a genuine design deliverable, not a config tweak.
3. **Control scope v1 = Tuya switch only** (proven). Salus/Intesis control **held** pending D4 bench re-proof; boiler deferred per prior design. Read/monitor for all types.
4. **Safety**: `switchDesired` → `ATTRIBUTE_FAMILY`; `WRITES_DISABLED` primitive-level guard (D6); `WRITES_DISABLED=true` stays on live until James lifts it. Least-privilege role decision (D5) tracked with Spencer.
5. **Test migration** for the deviceId contract change; unit-test `classifyDevice()` against the real 6261 set + the exception classes in C4.

---

## 4. Provenance
Four adversarial agents, live evidence: read-plane (12,812-device full pull, 9 sites, collision/split analysis), control-plane (6 bench devices write-tested + restored, failure-mode matrix), code-integration (full consumer audit of `bridge.js`/`tb-client.js` with `file:line`), credential/fail-safe (live authority probe + `WRITES_DISABLED` proof). Predecessors: `OOH_TB_DIRECT_INVESTIGATION_2026-09-16.md`, `OOH_TB_DIRECT_DESIGN_2026-09-16.md`, `OOH_DEVICE_DATA_DICTIONARY_2026-09-16.md`. CIR: `THINGSBOARD_ALARM_ACCESS.md` §6.
