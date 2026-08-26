# Test Strategy — OOH Triage Dashboard Live Integrations

*Prepared for James Brown · 14 Aug 2026 · feeds the OOHDASH Jira Phase 1 ticket set*

---

## 0. TL;DR

- The covered sites are **open, trading, and it is the middle of a very hot day**. If a device-control write through the ThingsBoard `*Desired` path misbehaves, we could turn heating on/off (or trigger an unwanted hot-water boost) in a **busy kitchen mid-service**. That is unacceptable, so **live device-control testing is deferred and tightly managed**.
- We test in **two stages**:
  - **Stage 1 — Stubbed / safe:** device **WRITES are stubbed** by a purpose-built control-simulator that echoes realistic `*Reported`/`*SyncStatus` responses, so the full pending → applied → failed/rejected/timeout → late-sync → override-revert UI lifecycle is exercised **without any real device ever being touched**. Everything *else* runs live: real B2C sign-in, real integration-bridge **reads**, real Cosmos persistence, and real Zendesk ticket creation into a **test/sandbox context**. Stage 1 = the **Phase 1 pilot** posture (writes stubbed).
  - **Stage 2 — Supervised "man-marked" live testing:** handed to the IoT support-desk staff **who can access and correct live assets**. Each live-control test is watched by a human on the real device, runs in a **safe managed window (never a hot trading peak)**, and has explicit abort/revert criteria. Stage 2 is the gate that must pass **before general go-live / Phase 2 "device writes ON"**.
- **The core safety principle:** in Stage 1 the guarantee that *no real asset moves* comes from the **code path being physically unable to reach real ThingsBoard**, not from a runtime flag alone. In Stage 2 the guarantee comes from a **qualified human watching the physical asset who can revert within seconds**.

---

## 1. Scope — the integrations under test

| # | Integration | What it does | Danger class |
|---|---|---|---|
| I1 | **ThingsBoard device control (WRITE)** — heating setpoint, frost-hold off, hot-water boost, via the single SD-492 `*Desired` shared-attribute write path (SR-3 `svc-control` credential) | Changes a physical device in a trading site | **DANGEROUS — stub in Stage 1; live only in supervised Stage 2** |
| I2 | **Timed override (hold) + auto-revert** — durable hold re-asserts a value then reverts once at revert time | Two device writes (assert + revert) with a delay | **DANGEROUS — stub in Stage 1; live only in supervised Stage 2** |
| I3 | **Integration-bridge device READS** — inventory, telemetry, online/offline | Read-only; renders the device board | **SAFE — live in both stages** |
| I4 | **ThingsBoard READ (`*Reported`/`*SyncStatus`, telemetry)** | Read-only status/echo reads | **SAFE — live in both stages** (writes are the danger, not reads) |
| I5 | **Zendesk ticket creation + `[TRG]` transcript/tags + call-ticket reconciliation** | Creates/merges tickets; SD-330 consumes `ooh`-tagged tickets | **MANAGED — live into a test/sandbox context in Stage 1** |
| I6 | **IoT Support Desk (SD-330) deep-link / OOH Review queue** | OOH is producer; SD-330 reads the `ooh` tickets + `OohOverrides`; P1 SMS deep-links in | **SAFE-ish — read/consume path; test-tag + coordinate to avoid polluting the live queue** |
| I7 | **P1 escalation SMS** (Twilio / `log` provider) | Texts the on-duty manager a deep-link | **MANAGED — `log` provider in Stage 1; real SMS only in supervised Stage 2** |
| I8 | **Cosmos durable store** (holds, audit, config, SMS log) via workload identity | Persists app state | **SAFE — live in both stages** (this is the F03 real-write proof) |

---

## 2. Why `WRITES_DISABLED` alone is not a test mode (the design gap Stage 1 closes)

`WRITES_DISABLED=true` is the **deploy-time safety lock**. It is checked **first and synchronously** in `killswitch.writesBlocked()`, *before* `control.dispatch()` ever calls `tb.writeSharedAttribute()`. So with the lock on, every control attempt returns a **423 "writes disabled" block** and the operator sees the guardrail banner — the app **never enters the pending → applied → failed/timeout sync lifecycle at all**. It proves the lock works; it does **not** exercise the control UI, the sync loop, the override worker, or the late-sync ticket note.

The existing `DATA_MODE=fixture` mode *does* simulate that lifecycle (the `simState` map in `tb-client.js`, with `_demo` flags: `normal` → settles `synced`, `fail` → settles `failed`, `slow` → never settles → `timeout` → late-sync). **But `fixture` stubs *everything*** — bridge reads, Cosmos, Zendesk and B2C all go in-memory — so it can't validate the *live* connectivity we care about in Stage 1 (real Zendesk ticket, real Cosmos write, real bridge read, real SSO).

**Stage 1 therefore requires a new, narrow mode** that keeps every integration live **except** the TB control write/echo, which is routed to the simulator. See §4.

---

## 3. The two stages at a glance

| Aspect | **Stage 1 — Stubbed / safe** | **Stage 2 — Supervised live** |
|---|---|---|
| **Goal** | Prove the whole chain works — sign-in, roles, board reads, ticketing + reconciliation, Cosmos persistence, and **every control UI state** — with **zero possibility of a real device change** | Prove that a **real** setpoint / frost-off / HW-boost / override-revert / P1-SMS actually lands on the real asset, safely and reversibly |
| **Device WRITES (I1/I2)** | **STUBBED** — control-simulator echoes `*Reported`/`*SyncStatus`; no route to real TB | **LIVE** — one capability at a time, human-watched, in a safe window |
| **Bridge READS (I3/I4)** | **LIVE** | **LIVE** |
| **Cosmos (I8)** | **LIVE** (this is the real keyless-write proof) | **LIVE** |
| **Zendesk (I5)** | **LIVE into a test/sandbox context**, `test` + `ooh-test` tagged, cleaned up | **LIVE** (real outcome tickets) |
| **SD-330 queue (I6)** | Verify the test ticket surfaces; coordinate + clean up so the live queue isn't polluted | Verify real ticket + deep-link |
| **P1 SMS (I7)** | `SMS_PROVIDER=log` (dispatch recorded, nothing sent) | Real Twilio SMS to a **test handset held by the supervising engineer**, then to the real on-duty number |
| **Who runs it** | James / dev + one pilot handler | **IoT support-desk staff who can access & correct live assets** ("man-markers") |
| **When** | Any time, non-prod / pilot | **Safe managed window only** — agreed off-peak, never a hot trading peak |
| **Environment** | Local or an isolated pilot namespace **with no network route to real ThingsBoard write** | Production, real assets |
| **Maps to phase** | **Phase 1 pilot (writes stubbed)** | **Gate before Phase 2 "device writes ON"** (go/no-go #3) and before live SMS (#4) |

---

## 4. Stage 1 design — the control-writes-stubbed mode

### 4.1 The mode flag

Add a narrow, explicit flag — proposed **`CONTROL_WRITE_MODE`** (`live` default | `stub`) — honoured only when set:

- In **`stub`** mode, `tb-client.writeSharedAttribute()` and `readControlState()` route to the **in-memory simulator** (reuse the existing `simState`/`simRead`/`simWrite` logic) **regardless of `DATA_MODE`**. Everything else on `DATA_MODE=live` stays live: bridge reads, Cosmos, Zendesk, B2C.
- The simulator must reproduce **all** sync outcomes on demand (driven by a per-device/per-test selector, mirroring today's `_demo` `normal|fail|slow`):
  - `normal` → settles **synced** (~2.5 s) → UI **applied**
  - `fail` → settles **failed** → UI **failed** state
  - `reject` → settles **rejected** → UI **rejected** state
  - `slow` → never settles → UI **timeout** at `SYNC_TIMEOUT_MS`, then **"keep waiting"** extend path, then optional **late-sync** → **late-synced** + late-sync ticket note
  - override path: assert → synced → hold persisted in `OohOverrides` (real Cosmos) → at revert time the worker dispatches the revert **through the same simulator**, confirming `reverted` (or, on a forced non-confirm, `revert-failed` + the `revert-failed` alert)

### 4.2 The safety guarantee for Stage 1 (defense in depth — all four)

Because Stage 1 must run with `WRITES_DISABLED=false` (otherwise the write path 423s before the lifecycle runs), the "no real asset moves" guarantee **cannot** rest on that flag. It rests on **four independent layers, all required**:

1. **Code-path isolation (primary):** in `stub` mode the write functions have **no code path to real ThingsBoard** — they return before any `axios` call. This is the load-bearing control.
2. **No credential wired:** the Stage 1 environment has **no SR-3 `svc-control` write credential** loaded (`TB_WRITE_USERNAME/PASSWORD` unset or pointed at a mock). Even a mis-set flag has nothing to authenticate with.
3. **Network isolation:** Stage 1 runs where there is **no network route to the real ThingsBoard write endpoint** (local, or an isolated pilot namespace / egress-denied). A stray write attempt fails at the socket, not the asset.
4. **Fatal-config assertion:** `validateConfig()` must **refuse to start** if `CONTROL_WRITE_MODE=stub` is combined with `NODE_ENV=production`, **or** if a real SR-3 write credential is present alongside `stub` (belt-and-braces — makes "stub + real writes" an impossible state, auditable in logs).

> The same discipline that makes the deploy-time lock trustworthy (checked first, synchronous, Cosmos-independent) is applied here: the stub is a **hard, early, un-bypassable divert**, not a runtime toggle a stray request can slip past.

### 4.3 What is genuinely LIVE vs STUBBED in Stage 1 — be explicit

**LIVE in Stage 1 (safe or managed):**
- **B2C sign-in / public PKCE client / `AreaClaim[]` role mapping** — real, no asset risk.
- **Integration-bridge device reads (I3) + ThingsBoard *reads* (I4)** — read-only, no asset risk. The device board shows real state.
- **Cosmos writes (I8)** — real keyless writes (holds, audit, config, SMS log). This is the **definitive F03 proof** a green `/healthz` cannot give (a missing container reads green; a real `upsert` throws 404/403). Kept live deliberately.
- **Zendesk ticket creation + `[TRG]` transcript + tags + reconciliation (I5)** — live, but into a **test/sandbox context** (see §4.4). This validates I5 end-to-end (the risky part is a wrong *device*, not a wrong *ticket* — a stray test ticket is cheap and reversible).

**STUBBED in Stage 1 (dangerous or not-safe-yet):**
- **ThingsBoard device WRITES (I1) + override revert writes (I2)** — the simulator, never real TB.
- **P1 SMS (I7)** — `SMS_PROVIDER=log`; dispatch recorded, nothing sent (no real person paged at 2am for a test).

### 4.4 Zendesk safety in Stage 1 — don't pollute the live SD-330 queue

SD-330 reads **`ooh`-tagged** tickets into its live OOH Review queue, so a real `ooh` test ticket would surface to the daytime IoT team. Mitigations, in order of preference:

1. **Preferred: a Zendesk sandbox subdomain** — full I5 validation with zero live-queue impact.
2. **If no sandbox: real Zendesk, quarantined** — every Stage 1 ticket additionally carries a **`test` + `ooh-test`** tag; the SD-330 owners are told the window in advance; the review query excludes `ooh-test`; and **every test ticket is solved-and-tagged or deleted at the end of the run** (mirrors the canary matrix "clean up canary tickets" step). Never leave a `test` ticket `new`/`open` in the live queue.
3. **Blocker to note:** Zendesk auth is currently broken (**B7** — the `scapi_` token fails classic basic-auth *and* Bearer; the fix is the Bearer switch + Jonathan confirming the token is complete/active). **Stage 1's live-Zendesk step cannot pass until B7 is fixed.** If B7 slips, run Stage 1 with Zendesk *also* stubbed (fixture Zendesk) to validate UI/flow, and treat live-Zendesk connectivity as an explicitly-deferred sub-item until B7 lands.

### 4.5 What Stage 1 proves (exit evidence)

- SSO + role mapping (handler and iot) work against real B2C.
- Device board renders real bridge/TB reads.
- Every **control UI state** is reachable and correct: pending, applied(synced), failed, rejected, timeout, keep-waiting/extend, late-synced + late-sync ticket note.
- **Guardrails** fire correctly: unconfirmed-site 409, kill-switch 423, offline-device 409, capability/value guardrail 422 (e.g. setpoint over max).
- **Override lifecycle:** hold persists to real Cosmos, survives a restart (durable), reverts **exactly once** at revert time, and a forced non-confirm becomes `revert-failed` + raises the alert (visible in Admin + the F026 strip).
- **Kill-switch** engages with a mandatory reason, blocks writes, and reverts retry while engaged.
- **Zendesk:** an outcome writes a correctly `ooh`-tagged (+`test`) ticket with a full `[TRG]` transcript and the right fields/category; a call-with-Talk-ticket **reconciles/auto-merges**.
- **SD-330:** the test ticket surfaces in the (test-filtered) queue; the P1 deep-link format is correct.
- **Cosmos:** a real keyless write persisted (404 → missing container; 401/403 → WI RBAC wrong).
- **P1 path:** logs correctly (no SMS sent); no device write occurred anywhere in the run.

---

## 5. Stage 2 design — supervised "man-marked" live control

### 5.1 Principle

Live control is only ever exercised by **IoT support-desk staff who can see and correct the real asset**, with a **human watching the physical/asset side** for each test, ready to **revert within seconds** on the vendor portal or at the panel. The OOH handler UI is driven by the tester; the **man-marker** owns the real-world safety.

### 5.2 Roles (Stage 2)

| Role | Who | Responsibility |
|---|---|---|
| **Driver** | James / a pilot handler | Operates the OOH dashboard, follows the script, calls each step |
| **Man-marker (asset watcher)** | IoT support-desk engineer with live-asset access (Sam / CJ / Tony / Meg) | Watches the real device (vendor portal / on-site contact / panel), confirms the real-world result, and **reverts immediately** if anything is wrong |
| **Coordinator** | James (or IoT lead) | Owns the window, the abort call, and the sign-off sheet |
| **Site contact (if used)** | Site staff / on-call | Eyes/hands on the physical asset where the vendor portal isn't enough |

### 5.3 The safe managed window — policy

- **Never during a hot trading peak.** Given the current heatwave, avoid kitchen-service hours entirely. Prefer a genuinely quiet window (e.g. late evening after close, or a pre-agreed low-risk slot) at a **nominated low-risk pilot site** — ideally one that is **closed or non-trading** during the window, or a spare/bench device.
- **One capability at a time**, smallest safe change first (e.g. a 1 °C setpoint nudge before a frost-off).
- **A qualified man-marker is watching the specific device before the write is sent.** No unwatched writes.
- **Pre-agreed abort + revert criteria** (§5.4) written down before the window opens.
- **Kill-switch armed and understood** by everyone present — the fastest app-side stop.
- **Bounded blast radius:** a single named device/site per test; not estate-wide.
- **Comms open** (call/Teams) between Driver and Man-marker for the whole window.

### 5.4 Universal abort & revert criteria (apply to every Stage 2 test)

Abort immediately, revert, and stop the window if **any** of:

- The real device moves in a way the script did **not** predict (wrong direction, wrong device, wrong zone).
- The UI shows `applied` but the man-marker **cannot** confirm the change on the asset (or vice-versa) — a truth-mismatch.
- A revert does not confirm within its window (`revert-failed`) and the man-marker cannot restore the value manually.
- Any sign of real-world impact on a trading area (kitchen temperature, hot-water demand, comfort).
- Loss of comms between Driver and Man-marker.

**Revert order of preference:** (1) app kill-switch to stop further writes, then a fresh corrective control action; (2) **man-marker reverts on the vendor portal / at the panel** — the authoritative fast path; (3) confirm the device reads back to the original value before continuing or closing.

### 5.5 Stage 2 capabilities & sequence

Run in this order (least → most impactful), each as a separate signed-off script (see `TEST_SCRIPTS_support-desk.md`):

1. **Heating setpoint change** (smallest nudge first)
2. **Frost-hold off** (mode → off)
3. **Hot-water boost**
4. **Override set + auto-revert** (short revert timer so revert is observed in-window)
5. **P1 escalation + real SMS** (to the man-marker's test handset first, then real on-duty number)
6. **Ticket creation / reconciliation** (real outcome ticket, real merge)

Only after **all** relevant Stage 2 scripts pass in the safe window is the corresponding capability cleared to enable in production (go/no-go #3 writes, #4 SMS).

---

## 6. Entry / exit criteria

### Stage 1 — entry
- App deployed (or run locally) with `CONTROL_WRITE_MODE=stub`, `DATA_MODE=live`, `WRITES_DISABLED=false`, `SMS_PROVIDER=log`, **no SR-3 write credential**, no route to real TB write.
- Real bridge read access, real Cosmos (4 containers pre-created — B1), real B2C (at least one `iot` and one `handler` test account).
- Zendesk sandbox available **or** B7 (Bearer fix) landed + a test/quarantine tagging + cleanup plan agreed with SD-330 owners.
- The four §4.2 safety layers verified present (esp. the fatal-config assertion).

### Stage 1 — exit (all must pass)
- Every item in §4.5 evidenced, with screenshots/audit IDs.
- **Zero real device writes** confirmed (TB write endpoint shows no OOH-origin writes; or network-isolation proves it).
- All Stage 1 test tickets cleaned up (no `test`/`ooh-test` left in the live queue).
- Any defects triaged; no open Critical/High against the tested paths.

### Stage 2 — entry (gate)
- **Stage 1 exit passed.**
- **SR-3 scoped TB write credential bench-proven** (A9) — a controlled write to a **non-trading / bench device** confirmed before touching any pilot asset.
- **C1 landed** — `WRITES_DISABLED` fail-open default inverted (blocked-unless-`'false'`) so the default is safe.
- **IM-01 landed** (B1) — `/healthz` store health flips to degraded at runtime, so a mid-window Cosmos outage is visible.
- A **safe window agreed** (§5.3), a **man-marker with live-asset access confirmed present**, abort/revert criteria signed, kill-switch understood.
- For the SMS script: a **test handset** for first dispatch; on-duty number loaded (E2) only for the final real-target step.

### Stage 2 — exit
- Each capability script signed **PASS** by both Driver and Man-marker in the sign-off sheet.
- Every test-induced change **confirmed reverted** on the asset side.
- No abort/revert left unresolved; no `revert-failed` outstanding.
- Go/no-go recorded per capability (#3 writes, #4 SMS).

---

## 7. Risk controls summary

| Risk | Control |
|---|---|
| Stray real device write during Stage 1 | 4-layer isolation (§4.2): code-path divert + no credential + no network route + fatal-config assertion |
| Test tickets pollute the live SD-330 queue | Sandbox subdomain preferred; else `test`+`ooh-test` quarantine tags, SD-330 owners notified, mandatory cleanup |
| Live write misbehaves in Stage 2 | Man-marker watching the specific asset, one capability/one device at a time, smallest change first, kill-switch armed, pre-agreed abort/revert, off-peak window |
| Testing during the heatwave/peak | Safe-window policy: never a hot trading peak; prefer closed/non-trading site or bench device |
| `WRITES_DISABLED` fail-open (AD-01) before any real write | C1 (invert default) is a Stage 2 entry gate |
| Green `/healthz` hides a Cosmos problem | Stage 1 forces a **real** Cosmos write; IM-01 (runtime degrade) is a Stage 2 entry gate |
| SR-3 credential misconfigured turns writes on wrongly | Bench-proof SR-3 (A9) on a non-trading device before any pilot-asset write |
| P1 SMS pages a real person during a test | `log` provider in Stage 1; test handset first in Stage 2 |

---

## 8. How this maps to the revised Phase 0/1/2 plan

| Plan phase | This strategy |
|---|---|
| **Phase 0 — Deploy & smoke** | Unchanged. Adds the note that the real-Cosmos-write smoke step is the same evidence Stage 1 formalises. Build the stub mode here or early Phase 1. B7 (Bearer) is a shared prerequisite for Stage 1's live-Zendesk step. |
| **Phase 1 — Pilot (writes stubbed)** | **This is Stage 1.** The recommended minimal pilot ("writes OFF, SMS log-only") becomes "writes **stubbed** (simulated echo), SMS log-only" so the pilot handlers exercise the **full** control UX safely — not just a 423 wall. Deliverables: build the stub mode, run the Stage 1 pass, author the man-marking scripts (this doc + `TEST_SCRIPTS_support-desk.md`). C1 (fail-open invert) lands here as the cheap safety fix before any real write is ever contemplated. |
| **Phase 2 — Widen + capabilities ON** | **Stage 2 is the gate** in front of "turn on deferred capabilities." Live device writes (A8/A9 + IM-01) and live SMS (A10/E2) may only flip **after** the supervised Stage 2 scripts pass in a safe window. Schedule + execute Stage 2 here; it stays **deferred/blocked** until Stage 1 passes and a safe window + man-marker are secured. |

**Bottom line:** Stage 1 lets the pilot go live and prove *everything* except a physical device movement, at zero irreversible-action risk. Stage 2 is a small, tightly-supervised, off-peak set of live-control confirmations — man-marked by staff who can instantly revert — that must pass before any handler is allowed to move a real device in a trading site.

---

*Companion: `TEST_SCRIPTS_support-desk.md` (the man-marking scripts + sign-off sheet). Source: OOH_CATCHUP_AND_BACKLOG_2026-08-14.md, RUNBOOK.md, CONFIGURATION.md, design-spec.md, DATA_DICTIONARY.md, and the app source (tb-client.js, control.js, overrides.js, escalation.js, killswitch.js, config.js).*
