<!-- gate:contract
SECTION Scope: This design covers R11 + C7 ONLY — the confirm-loop timing model: justifying/re-setting the "decide now" horizon and adding a mid-wait handler decision prompt. It contains no /healthz work, no dispatch authz. Late-sync durability (C1/C6), dispatch-time freshness (C4) and echo-latency bench-proof (B3) are BOUNDARIES referenced here, designed elsewhere.
SECTION Verified timing model: Server owns the clock. syncTimeoutMs=90000 (the "decide now"/timeout deadline) and lateSyncWatchMs=600000 (10-min background reconcile watch) are DISTINCT knobs already (config.js:113-115). Server poll = syncPollIntervalMs=3000 (config.js:113, control.js:154); client poll = 2000ms (control.js:147,159). At the 90s deadline a pending action → 'timeout' (control.js:206-208); the background watch keeps polling to late-synced until watchUntil (control.js:108,166-167,177-178). Cited firsthand.
SECTION The gap: The two horizons are cleanly split in the DATA MODEL but the handler-facing UX is a silent 90s spinner — "Waiting… usually under 30 seconds" (control.js:109) with no interruption until timeout fires. The handler stares at "Confirming…" with no active choice for the caller-on-hold decision. That is the C7 gap.
SECTION The 90s is unproven: 90s is NOT calibrated against measured device echo latency — real round-trip is unknown from the repo and depends on the B3/OOHDASH-18 bench-prove which has not run. 90s is a justified-provisional value; the copy already hedges "usually under 30 seconds" (control.js:109) and IT700 is flagged slowEcho (registry.js:25). Calibration is a proof obligation, not closed here.
SECTION The fix: (1) Keep the 90s server timeout as the "decide now" horizon, provisional pending B3 latency data. (2) Add a client-side mid-wait prompt at ~30s (a "decide now" nudge inside the confirm phase) — keep-on-hold / escalate / stop-waiting — so the handler makes an active choice before the full 90s, rather than a passive spinner. Server clock unchanged; UX-only interrupt on control.js:106-109.
SECTION Tests: mid-wait prompt fires at the horizon while still pending; the three choices route correctly (keep waiting resumes poll, escalate opens escalation, stop-waiting exits to timeout treatment); prompt is suppressed if the action already settled; the 90s server timeout and 10-min watch are unchanged.
DECISION decide-now-horizon: Keep syncTimeoutMs=90000 as the server "decide now"/timeout deadline (config.js:114) as a JUSTIFIED-PROVISIONAL value — it is NOT yet calibrated against measured echo latency. Proof obligation: calibrate against B3/OOHDASH-18 bench round-trip data (ties C4 freshness). Split is already real in the model: the 90s decide-now deadline (deadline, control.js:107) is distinct from the 10-min lateSyncWatchMs background reconcile (watchUntil, control.js:108). Do NOT collapse them.
DECISION c7-mid-wait-prompt: Add a client mid-wait decision prompt at ~30s (env-driven midWaitPromptMs, default 30000, ≤ syncTimeoutMs) that interrupts the confirm spinner (control.js:106-109) with an explicit choice — keep caller on hold / escalate / stop waiting — instead of a silent 90s "Confirming…". UX-only; the server clock (90s timeout, 10-min watch) is untouched.
-->

# Design — R11 / C7 confirm-loop timing (decide-now horizon + mid-wait prompt)

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Conditions:** R11, C7 · **Date:** 2026-09-15
**Repo state (verified):** `origin/main`, app v1.2.0. Confirm-loop timing lives in `config.control` (`config.js:113-115`), the server action lifecycle in `services/control.js`, and the handler sync-tracker in `public/js/control.js`.
**Scope:** exactly two linked things — R11 (justify/split the confirm-loop horizons) and C7 (add a mid-wait handler decision prompt). **Nothing else.** No `/healthz`, no dispatch authz. Late-sync durability (C1/C6), dispatch-time online freshness (C4) and the echo-latency bench-proof (B3) are **boundaries** referenced here, not designed here.
**Method:** every code claim verified firsthand against `origin/main`, cited to `file:line`. Where real echo latency is unmeasured, this is stated honestly and made a proof obligation, not a guess dressed as fact.

---

## 1. Verified current timing model

The server owns the authoritative clock; the client is a display poller. Three knobs, all env-overridable (`config.js:113-115`):

| Knob | Value | Role | Cited |
|---|---|---|---|
| `syncTimeoutMs` | **90 000 (90s)** | The **"decide now" / timeout deadline** — a pending action past it flips to `timeout` | `config.js:114`; `deadline = Date.now() + syncTimeoutMs` `control.js:107`; fired at `control.js:206-208` |
| `lateSyncWatchMs` | **600 000 (10 min)** | The **background late-echo reconcile watch** — keeps polling after timeout so a late echo becomes `late-synced` and the audit/ticket is corrected | `config.js:115`; `watchUntil = Date.now() + lateSyncWatchMs` `control.js:108`; prune at `control.js:166-167`; late-synced at `control.js:177-178` |
| `syncPollIntervalMs` | **3 000 (3s)** | Server-side poll cadence over all in-flight actions | `config.js:113`; `setInterval(pollAll, …)` `control.js:154` |

**What happens across the timeline (verified):**

- On dispatch, the action is created `pending` with **both** a `deadline` (now+90s) and a `watchUntil` (now+10min) stamped at once (`control.js:107-108`).
- The server poller (`pollAll`, every 3s) reads `*SyncStatus` for each `pending`/`timeout` action (`control.js:159-161, 187`). On a match it settles `synced`; if it settles **after** the 90s deadline it settles `late-synced` and (if a ticket exists) posts a late-sync note (`control.js:177-178, 183-185`).
- At the **90s deadline** a still-`pending` action flips to `timeout` (`control.js:206-208`) — this is the "decide now" moment surfaced to the handler.
- The action is **kept polling** past timeout until `watchUntil` (10 min), then pruned (`control.js:166-167`). This is the background late-echo watch.
- The **client** polls its own action every **2s** (`control.js:147, 159`) and maps `synced`/`late-synced`→"Applied", `failed`/`rejected`→error, `timeout`→the "no confirmation yet" card (`control.js:150-157`).

**The two horizons already exist distinctly in the data model** — `deadline` (90s, decide-now) and `watchUntil` (10 min, background reconcile) are separate fields, stripped from the public projection together (`control.js:149`). R11's "split" is therefore **already real in the server model**; what is missing is (a) a *justification* of the 90s value, and (b) a handler-facing UX that reflects the split instead of a silent spinner.

---

## 2. The gap

**R11 — the 90s is uncalibrated.** 90s is a plausible default but is **not** derived from measured device echo latency. Real round-trip latency is **unknown from this repo** — it depends on the B3 / OOHDASH-18 bench-prove (a scoped write to a bench device, then read back the `*SyncStatus` echo), which **has not run** (register B3, R3). The code already *hedges* this honestly: the confirm copy says "usually under 30 seconds" (`control.js:109`) and IT700-class units are flagged `slowEcho` (`registry.js:25`, surfaced as `slowEchoDevice`, `control.js:98`), i.e. the system already knows some devices echo slowly. So 90s is a **justified-provisional** value, not a proven one.

**C7 — the wait is a silent 90s spinner.** During `sent`/`confirm` the handler sees only *"Waiting for the device to echo the change back — usually under 30 seconds"* (`control.js:109`) with **no interruption** until the 90s timeout card appears (`control.js:112`). For 90 seconds the handler stares at "Device confirming…" (`control.js:105`) with a live caller on hold and **no prompted decision**. The active choice — keep the caller holding, or escalate — only appears *after* timeout, when 90s have already burned. That is the C7 defect: a passive wait where an active mid-wait decision is needed.

---

## 3. Design decision

### 3a. Decide-now horizon (R11) — keep 90s, provisional, with a calibration obligation

**Decision:** keep `syncTimeoutMs = 90000` (`config.js:114`) as the server **"decide now" deadline**, explicitly marked **justified-provisional**. Do not invent a new "calibrated" number the repo cannot support.

**Justification available today:** the copy's own "usually under 30 seconds" expectation (`control.js:109`) plus `slowEcho` device handling (`registry.js:25`) imply a normal echo well under 30s with a slow tail; 90s ≈ 3× the nominal expectation gives comfortable headroom for the slow tail before forcing a decision. That is a *reasoned* provisional, not a measured one.

**Proof obligation (does not close here):** calibrate 90s against **measured** echo latency from **B3 / OOHDASH-18** bench round-trips (p50/p95 per device class, IT700 separately given `slowEcho`). Set the deadline to a defensible percentile of measured latency. This ties to **C4** — the online-gate (`device.online`) is a TTL-cache read (`bridge.js:101,130`), so calibration must account for dispatch-time freshness, not just echo time. Until B3 data exists, 90s stands as the provisional decide-now horizon. `slowEcho` devices may justify a per-class deadline once measured; out of scope until there is data.

**The split (R11 core) — keep the two horizons clean and never collapse them:**

- **Horizon 1 — decide-now (`deadline`, 90s):** the handler-facing window after which the UI **stops asking the handler to wait** and forces a decision (`timeout` state, `control.js:206-208`). This is the caller-on-hold clock.
- **Horizon 2 — background late-echo watch (`watchUntil`, 10 min):** keeps reconciling the **audit trail / ticket** after the handler has moved on — a late echo becomes `late-synced` with a ticket note (`control.js:177-178, 183-185`). This is a durability/records clock, not a handler clock.

These must stay separate knobs. Collapsing them would either abandon late echoes (if 10min→90s) or trap the handler for 10 minutes (if 90s→10min). **Boundary:** the background watch is **in-process only** and lost on pod restart — this is **C1/C6** durability, designed in a separate artefact; this design must not assume horizon-2 is durable.

### 3b. C7 mid-wait decision prompt

**Decision:** add a **client-side mid-wait prompt** that interrupts the confirm spinner at a configurable horizon (default **~30s**, before the 90s timeout), presenting an explicit choice instead of a passive spinner. **Server clock unchanged.**

- New knob `midWaitPromptMs` (env `MID_WAIT_PROMPT_MS`, default `30000`), invariant `0 < midWaitPromptMs ≤ syncTimeoutMs`, added to `config.control` (`config.js:113-115`). (Client reads it via the existing config-to-client surface; if none is wired, a data attribute / bootstrap constant.)
- When the client enters `confirm` (`ctlSend`, `control.js:135-141`), start a one-shot timer for `midWaitPromptMs`. If the action is **still pending** when it fires, render a **mid-wait decision card** over the sync-tracker (`control.js:106-109`) with three explicit actions:
  1. **Keep caller on hold** — dismiss the prompt, remain in `confirm`, keep polling (no server change; reuses the existing 2s poller, `control.js:147`).
  2. **Escalate** — hand to the existing escalation path (`ctlEscalate()`, wired identically to the timeout card's escalate button, `control.js:112`).
  3. **Stop waiting** — exit the active wait and treat the change as not-yet-confirmed, adopting the existing timeout-card treatment ("Treat the change as NOT applied… we'll keep watching in the background", `control.js:112`) **without** waiting the remaining 60s. The background watch (horizon 2) continues server-side regardless.
- The prompt is **suppressed** if the action has already settled (`done`/`failed`/`rejected`/`timeout`) before the timer fires — it only interrupts a genuine in-flight wait.
- Copy stays honest with the existing tone: the mid-wait card states the device hasn't echoed **yet** and that "Applied" only ever means device-confirmed (mirroring `control.js:109`).

**Why client-side, not a new server state:** the decide-now/timeout semantics and audit are already correct server-side; C7 is purely a *handler-attention* problem during an already-correct wait. A UI interrupt is the minimal change and keeps the authoritative clock untouched. The prompt horizon is intentionally **shorter** than the 90s timeout so the handler chooses *before* the deadline rather than being told after it.

---

## 4. Code surface

| File | Change |
|---|---|
| `config.js` | Add `midWaitPromptMs` (env `MID_WAIT_PROMPT_MS`, default 30000) to `control` (`:113-115`); leave `syncTimeoutMs`/`lateSyncWatchMs` values as-is but treated as the split decide-now vs watch horizons. Comment the 90s as provisional-pending-B3. |
| `public/js/control.js` | In `ctlSend` (`:135-141`) arm a one-shot mid-wait timer on entering `confirm`; add a mid-wait decision card in the sync-tracker render (`:106-109`) with keep-on-hold / escalate (reuse `ctlEscalate`) / stop-waiting (adopt timeout treatment); clear the timer on settle/cancel/finish (alongside the existing `clearInterval(ctlPollTimer)` sites, `:145,182,190`). No change to the 2s poller cadence (`:159`) or server calls. |
| *(no server lifecycle change)* | `services/control.js` timeout (`:206-208`) and watch (`:166-167,177-178`) are unchanged — the split already exists in the model; only the value's *justification* and the client UX change. |

---

## 5. Proving tests (design)

1. **Mid-wait prompt fires at the horizon.** Enter `confirm`, hold the action `pending`, advance to `midWaitPromptMs`; assert the mid-wait decision card renders with three actions and the spinner is interrupted.
2. **Choices route correctly.** *Keep on hold* → card dismissed, still `confirm`, poller running. *Escalate* → escalation path invoked (same as timeout-card escalate). *Stop waiting* → timeout treatment shown immediately without waiting the residual time to 90s.
3. **Suppressed on early settle.** Action settles `synced` (or `failed`/`rejected`) **before** `midWaitPromptMs`; assert the mid-wait card never renders.
4. **Server horizons unchanged.** With no interaction, a `pending` action still flips to `timeout` at exactly `syncTimeoutMs` (`control.js:206-208`) and the background watch still runs to `lateSyncWatchMs` producing `late-synced` on a late echo (`control.js:177-178`).

*Driving note:* tests use the existing fixture seam — the fixture TB client settles `synced` after ~2.5s, `fail` settles failed, and `slow` never settles to exercise the timeout/late-sync path (`tb-client.js:91`) — no live `portal.lhlive.co.uk` call in CI.

---

## 6. Conditions & boundaries (pointers only — see `RELEASE_CONDITIONS_REGISTER.md`)

- **R11 (primary)** — justify/split the confirm-loop horizons. §3a keeps 90s as a *justified-provisional* decide-now deadline with a B3 calibration obligation, and confirms the decide-now (90s) vs late-echo-watch (10 min) split is already real in the model and must stay split.
- **C7 (primary)** — mid-wait handler decision prompt at ~30–45s. §3b adds it as a client interrupt (default 30s) over the sync-tracker (`control.js:106-109`).
- **B3 / R3 / OOHDASH-18 (boundary)** — the echo-latency bench-prove that calibrates the 90s. **Not run; UNVERIFIED.** The horizon stays provisional until it lands. Not closed here.
- **C4 (boundary)** — dispatch-time freshness of the online-gate; the online check reads a TTL cache (`bridge.js:101,130`). Calibration must account for it. Designed elsewhere.
- **C1 / C6 (boundary)** — the background late-echo watch (horizon 2) is **in-process only, lost on pod restart**; the late-sync durability + active handler alert are a **separate artefact**. This design must not assume horizon 2 is durable.

---

*All line numbers cited against repo `origin/main`, 2026-09-15, verified firsthand for this artefact: `config.js:113-115`; `public/js/control.js:106-109,135-141,145,147,150-157,159,182,190`; `services/control.js:107-108,149,154,159-161,166-167,177-178,183-185,206-208`; `registry.js:25`; `bridge.js:101,130`; `tb-client.js:91`. Real device echo latency is UNMEASURED (B3/OOHDASH-18 owner Spencer/IoT) — the 90s decide-now horizon is justified-provisional pending that proof. This artefact decides the R11/C7 timing approach only; it does not invoke gates, open a PR, commit, or flip anything.*
