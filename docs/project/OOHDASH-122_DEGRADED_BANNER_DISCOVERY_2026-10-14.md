<!-- gate:contract
SECTION: What we are solving
OOHDASH-122. After the v1.3.7 deploy on 13 October the New Call home page showed two banners at once: a red one saying control actions are disabled, and a green one saying Device control is LIVE and changes will reach real equipment. Both appear from the moment the pod starts until the first full workspace is loaded. A handler seeing both does not know which to trust. This discovery traces every signal driving each banner, confirms the cold-start false negative in the code, explains why the condition persisted even after a site search on 6832, and frames two fix options for the operator to choose between.

SECTION: Root cause
The red kill-banner fires when the bridge read-health flag is false. That flag initialises to false in live mode on every pod restart and only flips to true after a full site workspace is loaded — a site search alone does not update it. The green LIVE banner fires from a completely separate, static deploy-time flag that says writes are enabled. The two flags are never compared. So both banners fire simultaneously from pod start until the first workspace load, which can be minutes or longer on a quiet night. This is not a new bug: the same initialisation has been in place since at least v1.3.6 and is documented in the CIR as a known gotcha.

SECTION: Regression verdict
Not a regression. Services/tb-device.js is unchanged between the v1.3.6 and v1.3.7 tags. The routes/api.js changes in v1.3.7 are entirely the Additional Notes feature and do not touch the degraded or controlLive signals. The condition has been present since writes were enabled on 24 September.

SECTION: Options
Three substantive options. Option B is the fastest fix: change the one line in routes/api.js that derives the degraded flag so it only triggers on a real observed error, not on the absence of a read. The banner disappears at cold start because there is no error yet. Option C is the proper structural fix: add a three-state to the bridge health (unproven, healthy, unhealthy) mirroring the existing ThingsBoard read-credential pattern, and make the degraded flag only fire on the unhealthy state. Option A adds a startup probe so the pod positively proves bridge health before serving traffic. Options B and C address the banner contradiction. Option A addresses the healthz accuracy. They can be combined: Option B now as the fast interim, Option C as the proper follow-up, with Option A added alongside either.

SECTION: Refined acceptance criteria
AC-1: after a clean pod restart with writes enabled and no prior ThingsBoard errors, the red kill-banner must not appear on the home page. AC-2: the red kill-banner and the green LIVE banner must never appear simultaneously with contradictory meaning, in any system state. AC-3: when GET /healthz is called after pod start, the bridge subsystem must distinguish an unproven state from a real failure — it must not report healthy:false with lastError:null as though they mean the same thing.

SECTION: Questions for James
One factual question before the fix is scoped: when you looked up site 6832 at around 23:05 on 13 October, did you open the full site workspace so the device list loaded, or did you only see 6832 appear in the search results without clicking through? The answer determines whether the CIR note that the condition clears on the first lookup has ever been accurate, or whether it has always required a full workspace load. The rest of the open questions are the three decisions below.

DECISION: Which fix approach? | Option B now, then Option C as a follow-up | Option C only, done properly in one go
DETAIL: Option B is a one-line change in routes/api.js and removes the false-negative banner immediately. Option C is the architecturally consistent fix but touches tb-device.js, routes/api.js, server.js, and the healthz response shape. Recommend Option B as the fast unblock, Option C as the follow-up, because the banner contradiction is the user-visible harm and B fixes it today.

DECISION: Add a startup bridge probe now or in a follow-up ticket? | Follow-up ticket — scope it separately after the banner fix lands | Include it in this ticket alongside whichever banner fix is chosen
DETAIL: The startup probe (mirroring the Cosmos store probe already at pod boot) is additive and orthogonal to the banner fix. It matters most if Option C lands without it, because unproven state at boot would otherwise linger until the first workspace load. Recommend a follow-up ticket so this ticket stays small and ships quickly.

DECISION: Should the server-side control dispatch path also gate on bridge health? | No — writesDisabled and the kill-switch are the authoritative server-side gates; bridge health remains UI-only | Yes — add a server-side check so a real degraded state blocks dispatch as well as showing the banner
DETAIL: Today the server never checks bridge health before writing — only the UI does. That is intentional: the bridge health flag reflects read-path state, and the write path goes directly to ThingsBoard. However, if bridge health is ever genuinely unhealthy, the operator seeing the banner is the only protection. Recommend leaving it UI-only for now and revisiting if the tri-state (Option C) makes server-side gating practical.
-->

# DISCOVERY — OOHDASH-122
## Red "degraded mode" banner simultaneous with green "Device control is LIVE" banner

**Ticket:** OOHDASH-122 | **Status:** Backlog | **Date:** 2026-10-14
**Reporter:** James Brown | **Discovery:** Claude Code discovery doer

---

## Problem statement

Every time the OOH Dashboard pod restarts, the New Call home page shows two contradictory banners simultaneously: a red "control actions are disabled" kill-banner and the green "Device control is LIVE" banner. The banners are driven by two entirely independent signals that are never compared or reconciled — one from the last device-read outcome (reactive, starts false), and one from the deploy-time write-lock env var (static). Because a fresh pod has never performed a device read, the reactive signal starts in the "failed" position by design, while the static signal correctly reflects that writes are enabled. Both fire at once from first page load until the first workspace is opened. This is a confusing and alarming experience for handlers: one banner says they cannot make changes; the other says changes will reach real equipment.

The condition is pre-existing (present since at least v1.3.6), not a v1.3.7 regression.

---

## Recurrence check

This ticket is new, not a prior-fix recurrence. The condition has been present since at least v1.3.6 and was documented in the CIR as a known gotcha rather than fixed.

---

## Token / cost efficiency evaluation

This is a pure code fix — no background polling, no new service, no LLM calls. Token cost: nil. Running cost impact: nil.

---

## Silent-running evaluation

No proposed fix introduces any background component. Option C (startup probe) adds a single fire-and-forget TB credential call at pod boot only, not a recurring loop. Silent-running criterion: fully met.

---

## Findings by question

### Q1 — What sets bridge health? Is `healthy: false` after restart a structural false negative? Why did it persist after a lookup?

**PROVEN**

`bridge.bridgeStatus()` in `services/tb-device.js:1059-1063` returns `{ mode, healthy: lastReadOk, lastError: lastReadError }`.

`lastReadOk` is initialised at module load (`services/tb-device.js:84`):

    let lastReadOk = config.dataMode === 'fixture';

In live mode (`dataMode: 'live'`), this evaluates to `false`. `lastReadOk` only flips to `true` inside two functions:

- `getSites()` — lines 975-980: success sets `lastReadOk = true, lastReadError = null`; throw sets `lastReadOk = false, lastReadError = err.message`
- `getSitesByNumber()` — lines 1002-1007: same pattern

There is no startup probe and no timer — only these two reactive paths.

`searchSites()` (lines 1019-1039) calls the Zendesk site directory and does NOT update `lastReadOk` at all. A handler typing "6832" in the search box calls `GET /api/sites/search` → `searchSites()` — `lastReadOk` is never touched.

This explains why degraded persisted "after a live site lookup on 6832": the lookup was a search operation (autocomplete), not a workspace load. A workspace load (`POST /confirm` → `GET /workspace/:siteNo`) calls `getSitesByNumber()` and would update `lastReadOk`. Since `lastError` remained `null` at ~23:05, `getSitesByNumber` was never called — confirming the lookup was search-only.

The `thingsboardRead: 'unknown'` observed at ~23:01 is a separate, independent signal: it is the ThingsBoard read-credential proof state from `tb-client.js:93` (`if (!isFresh()) return 'unknown'`), which becomes `'healthy'` after `activeReadProbe()` completes. It does not affect `lastReadOk`.

**Cold-start false negative: PROVEN structural**. In live mode, `lastReadOk = false` from first load; there is no mechanism to prove it healthy before an operator opens a workspace.

---

### Q2 — Does degraded actually disable control, or is `writesDisabled` authoritative?

**PROVEN**

The write gate has two layers:

**Client side (UI only):** `writeBlockReason()` in `public/js/app.js:52` returns a blocking string when `state.me?.degraded || state.workspace?.degraded`. This string is assigned to `kill` (`app.js:142`) and renders the red kill-banner (`app.js:164`). The UI treats degraded as a block, showing the banner and (implicitly) hiding/disabling the dispatch button.

**Server side (authoritative):** `control.dispatch()` in `services/control.js:58` checks:
1. Confirmation token validity (line 64)
2. Kill-switch via `killswitch.writesBlocked()` (line 69-70)
3. Device inventory and capability guardrails (lines 72-80+)

`killswitch.writesBlocked()` in `services/killswitch.js:33` checks `config.writesDisabled` (the env var), the refrigeration boot guard, and the Cosmos kill-switch document. It does NOT check `bridge.bridgeStatus().healthy`.

**Conclusion:** `writesDisabled` is the authoritative server-side write gate. Bridge health (`lastReadOk`) is UI-only. A direct `POST /api/control/dispatch` with a valid confirm token would succeed on the server even when `bridge.healthy: false` (provided writes are enabled and no kill-switch). The red banner is a UI warning; it is not backed by a server-side control-path guard on bridge health.

---

### Q3 — Did v1.3.6 exhibit the same dual-banner state after a pod restart?

**PROVEN pre-existing — NOT a v1.3.7 regression**

The `git diff v1.3.6..v1.3.7 --stat` output shows `services/tb-device.js` was not changed between these tags. The `lastReadOk` initialisation (line 84) is identical in both versions.

`routes/api.js` was in the diff (68 lines changed), but `git show v1.3.6:routes/api.js` confirms that the same two lines were present in v1.3.6:

- `degraded: !bridge.bridgeStatus().healthy` (line 41 in v1.3.6 — same logic)
- `controlLive: !config.writesDisabled` (line 49 in v1.3.6 — same logic)

The v1.3.7 diff to `routes/api.js` introduced the Additional Notes (OOHDASH-119) routes — unrelated to banner or health logic.

The CIR `OOH_DASHBOARD_DEPLOY.md` explicitly documents the cold-start behaviour as a known gotcha: "bridge.healthy:false with lastError:null on any freshly-restarted pod. This is a cold-start artefact, not a fault."

---

### Q4 — What signals drive each banner, and where is the contradiction?

**PROVEN**

**Green "Device control is LIVE" banner** (`public/js/app.js:165`):

    ${state.me.controlLive ? `<div class="banner live" ...>🟢 <b>Device control is LIVE</b>...` : ''}

Signal source: `state.me.controlLive` ← `GET /api/me` → `routes/api.js:73`: `controlLive: !config.writesDisabled`

`config.writesDisabled` (`config.js:90`): `(process.env.WRITES_DISABLED ?? '').trim().toLowerCase() !== 'false'`

This is a deploy-time static value. On live, it is `false` (writes enabled), so `controlLive = true` — permanently.

**Red "control actions are disabled" kill-banner** (`public/js/app.js:164`):

    ${kill ? `<div class="banner kill" ...>⛔ ${kill} — control actions are disabled; capture & escalate still works.` : ''}

Where `kill = writesDisabled(state.siteNo)` (note: this is the client-side `writeBlockReason()` function, not the env var). It returns a string when:

    state.me?.degraded || state.workspace?.degraded   (public/js/app.js:52)

`state.me.degraded` ← `GET /api/me` → `routes/api.js:65`: `degraded: !bridge.bridgeStatus().healthy`

`bridge.bridgeStatus().healthy` = `lastReadOk` = `false` on every pod start in live mode.

**The contradiction:** `controlLive` (env var: `WRITES_DISABLED=false` → always `true`) and `!bridge.healthy` (`lastReadOk`: initially `false`) are never compared. There is no guard preventing both being simultaneously true. From pod start until the first successful `getSitesByNumber()` call, both banners fire on every page load.

The two signals are architecturally mismatched: `controlLive` is a stable deploy-time configuration fact; `degraded` is a reactive runtime observation that starts pessimistic. They answer different questions (is the system configured for writes? vs has the system proven its reads?) but both surface on the same banner row, with no priority or mutual-exclusion logic.

---

### Q5 — Should the pod probe bridge health at startup?

**DEDUCED (high confidence)**

The startup sequence in `server.js:134-167` already performs an eager Cosmos store probe (`storeProbe()`, line 141) on live mode boot. The TB read-credential session in `tb-client.js` has an `activeReadProbe()` method (line 68) that is fire-and-forget safe.

There is no equivalent for bridge device health (`lastReadOk`). Adding a lightweight startup probe — a single `getSitesByNumber()` call on a known-good site, or a cheap TB API ping — would let `lastReadOk` reflect reality before any operator request arrives. This is the cleanest structural fix and directly satisfies AC-3.

However, a startup probe introduces a risk: if ThingsBoard is transiently slow at pod boot, the probe could take time or fail. A failed probe would set `lastReadOk = false, lastReadError = err.message` — a real error state that IS appropriate to show. This is distinct from the current false negative (no error, but also no proof).

---

## Options

### Option A — Startup probe (satisfies AC-3; indirectly satisfies AC-1 and AC-2)

Add a `bridgeProbe()` call to `server.js:start()` mirroring the Cosmos `storeProbe()` at line 141. The probe calls a cheap TB read (e.g. a single paginated device textSearch for a known gateway, or a minimal `/api/v1/devices?pageSize=1` call) and populates `lastReadOk` before the pod accepts traffic.

Pros: structural fix, `lastReadOk` reflects proven reality from boot, consistent with how the Cosmos store is treated.
Cons: adds a mandatory TB auth round-trip to every pod start (~1-3 s latency); a TB blip at pod boot causes `lastReadOk = false` with `lastError` populated, which is correct (real error) but must not block the pod from serving traffic (same non-exit pattern as `storeProbe()`).

Cost: nil (one TB API call per pod restart, no tokens).
Silent running: fully met (fire-and-forget, no timer).

### Option B — Treat "unproven" differently from "unhealthy" in /api/me (satisfies AC-1 and AC-2 directly)

Change `routes/api.js:65` from:

    degraded: !bridge.bridgeStatus().healthy

to:

    degraded: !!bridge.bridgeStatus().lastError

This means `degraded` is only `true` when there has been a real, observed read failure (and `lastError` is populated) — not when the pod is merely unproven. An unproven pod (cold start, no reads yet) would show `degraded: false`, and neither banner would contradict the other.

This matches the CIR's own guidance: "Don't chase it as an outage — check lastError."

Pros: minimal change, directly eliminates the false negative, no latency added to pod start.
Cons: `lastError: null` does NOT distinguish "unproven" from "verified healthy" — an operator looking at `/healthz` still sees `bridge.healthy: false` even though the app is no longer showing the degraded banner. `/healthz` and `/api/me` would diverge in meaning.

Cost: nil.
Silent running: fully met.

### Option C — Bridge health tri-state (mirrors thingsboard approach; satisfies all three ACs)

Add a `lastReadState: 'unknown' | 'healthy' | 'unhealthy'` tri-state to `bridgeStatus()`, mirroring the `thingsboardRead` tri-state in `tb-client.js`. Update `/api/me` to map `unknown → degraded: false` and `unhealthy → degraded: true`. Update `/healthz` to surface `bridgeRead` alongside `thingsboardRead`.

A startup probe (Option A) populates the tri-state at boot; an 'unknown' state means not-yet-proven rather than failed, and does not trigger the degraded banner.

Pros: architecturally clean, consistent with the existing thingsboard pattern, fully satisfies all three ACs, removes the /api/me vs /healthz divergence.
Cons: larger change (touches `tb-device.js`, `routes/api.js`, `server.js`, `/healthz` response shape, any consumers of `bridge.healthy`). More surface area for test coverage.

Cost: nil.
Silent running: fully met.

### Option D — Client-side mutual-exclusion guard (band-aid, does NOT satisfy AC-3)

In `public/js/app.js`, add a guard so that the green LIVE banner is suppressed when `kill` (degraded) is active, or vice versa. This removes the visible contradiction without fixing the underlying false negative.

Pros: smallest change, immediate user-facing relief.
Cons: does not fix the false negative; `lastReadOk` still starts false; a real degraded state would suppress the LIVE warning when a handler needs it most. Does not satisfy AC-3 (healthz still reports unproven state).

**Not recommended as the sole fix.**

---

## Recommendation

**Option C** is the correct long-term fix — it is architecturally consistent with how thingsboard health is already modelled, satisfies all three ACs, and removes the /api/me vs /healthz meaning gap.

If the operator wants the smallest safe fix first (before the proper tri-state work), **Option B** is the pragmatic interim: changing `degraded` in `/api/me` to `!!bridge.bridgeStatus().lastError` eliminates the visible false-negative banner with a one-line change, and is safe because `lastError` is the CIR-documented authoritative signal.

In either case, a startup probe (the structural part of Option A) should be added alongside: it turns "unproven" into "proven healthy" within seconds of pod start, making both the tri-state and the `lastError` fix behave well from boot rather than waiting for the first operator workspace load.

---

## Refined acceptance criteria

**AC-1 — No false degraded banner on clean restart (refined)**
Given a pod that has just started with `WRITES_DISABLED=false` and no prior ThingsBoard read errors,
when the handler loads the New Call home page,
then the red kill-banner is not shown (either the cold-start state is treated as 'unproven' rather than 'failed', or a startup probe has positively proven bridge health before the page serves).

**AC-2 — Contradictory banners are mutually exclusive (unchanged)**
Given any state of the dashboard,
when the page is rendered,
then the red kill-banner ("control actions are disabled") and the green "Device control is LIVE" banner are never shown simultaneously with contradictory meaning.
Proof: the kill-banner must only fire when `lastError` is non-null (a real failure) or the kill-switch/writesDisabled is active; the LIVE banner must be suppressed whenever a real degraded state (not a false negative) is active.

**AC-3 — /healthz bridge health reflects a real probe (refined)**
Given a pod that has just started,
when `GET /healthz` is called within 5 seconds of pod-ready,
then `subsystems.bridge` reflects one of: `{ mode:'live', state:'unknown' }` (unproven, not an error), `{ mode:'live', state:'healthy' }` (proven), or `{ mode:'live', state:'unhealthy', lastError:'<message>' }` (real failure) — never `{ healthy: false, lastError: null }` as a false negative.
The 'unknown' state must NOT count against `status:degraded` at `/healthz`.

---

## CX success criteria (for design doer)

**Persona–journey map:**
The user is an OOH handler (SCC contractor), on shift at ~22:30-23:00, taking a call from a pub reporting a cold kitchen or failed heating. They open the dashboard under time pressure. The first screen they see is the New Call home page with site search.

Journey at the point of failure:
1. Handler signs in (SSO, automatic)
2. Home page loads — they see two banners, one red, one green
3. Red: "control actions are disabled" — they interpret this as: they cannot do anything useful
4. Green: "Device control is LIVE" — they interpret this as: changes will reach equipment
5. The contradiction causes confusion and anxiety. They do not know which to trust. They may escalate unnecessarily or abandon the dashboard.

**Reassurance-vs-friction calibration:**
- Cold start / unproven state: handler should see NO banner (or a neutral "connecting..." state that resolves quickly). Low-friction. The system is fine; don't alarm the handler.
- Real degraded state (TB unreachable, Cosmos failed): handler SHOULD see the red banner. High-stakes; must be visible and unambiguous.
- LIVE mode (writes enabled): green LIVE banner should be visible only when the system is proven healthy enough to back it up. Must never show alongside a genuine degraded state.

**"Great looks like…":**
A handler who opens the dashboard after a pod restart sees either: (a) no banner at all (system healthy from boot), or (b) a single consistent banner — either the system is fine and says "Device control is LIVE", or it is genuinely degraded and says so clearly without contradicting itself. The handler never has to decide which of two contradictory banners to believe.

---

## Data scope (for design doer)

No new data entities. The fix touches only the derivation of `degraded` in the `/api/me` response and the `bridgeStatus()` export from `services/tb-device.js`. No schema changes. No Cosmos writes. No new fields in the existing client data contract beyond a possible third value in the bridge status shape.

---

## End-to-end testing scope (for design doer)

Critical journeys to prove:

1. **Cold start — no false banner.** Start a fresh instance with `WRITES_DISABLED=false` and no prior reads. Load the home page. Assert: kill-banner absent, LIVE banner present. (Happy path.)

2. **Real failure — red banner shows.** Start a fresh instance. Trigger a real TB read failure (or stub `lastError` to a message). Load the home page. Assert: kill-banner present, LIVE banner absent or consistent.

3. **Post-workspace-load — healthy state.** Complete a full resolve→confirm→workspace flow. Check `/healthz`. Assert: `bridge` state is 'healthy' (or `lastReadOk: true`), no false negative persists.

4. **Startup probe (if Option A or C).** Start the pod and call `/healthz` within 5 s of listen. Assert: `subsystems.bridge.state` is 'unknown' or 'healthy', never `{ healthy: false, lastError: null }`.

5. **Mutual exclusion.** Confirm no combination of `degraded` and `controlLive` state causes both banners to render simultaneously with contradictory meaning. Unit test `writeBlockReason()` + banner render with `degraded=true, controlLive=true`.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Startup probe adds latency at pod boot | Low | Low | Non-blocking (same pattern as storeProbe — log + continue on failure) |
| Option B leaves /healthz showing false healthy=false confusingly | Medium | Low | Address with tri-state (Option C) in follow-up |
| A real TB failure at boot sets lastError, red banner shows — handler alarmed | Low | Medium | This is CORRECT behaviour; document as expected in runbook |
| Changing /api/me `degraded` semantics breaks existing tests | Medium | Low | Test suite covers degraded signal — adjust assertions to match new semantics |

---

## Open questions for James

1. When you did the "site lookup on 6832" at ~23:05, did you go through the full confirm flow (site resolved, workspace opened, device list loaded) — or just searched for 6832 in the search box and saw the result? This determines whether `getSitesByNumber` was called and whether the CIR note about "clears on first lookup" was ever correct.

2. Did the green LIVE banner and the red kill-banner appear on the initial home page BEFORE any site search, or only after a search? This helps confirm the sequence.

3. Preferred fix path: Option B now (one-line interim, fast) followed by Option C (tri-state, proper), or straight to Option C? Option C is a larger but cleaner change.

4. Should the startup probe (Option A element) be scoped into this ticket or a follow-up? It is a separate, additive piece of work from the banner-contradiction fix.

---

## Code locations (read-only, all on `main`)

| Location | Role |
|---|---|
| `services/tb-device.js:84` | `lastReadOk` initialisation — `false` in live mode |
| `services/tb-device.js:975-980` | `getSites()` success/failure updates `lastReadOk` |
| `services/tb-device.js:1002-1007` | `getSitesByNumber()` success/failure updates `lastReadOk` |
| `services/tb-device.js:1019-1039` | `searchSites()` — does NOT update `lastReadOk` |
| `services/tb-device.js:1059-1063` | `bridgeStatus()` export |
| `routes/api.js:65` | `/api/me` degraded signal: `!bridge.bridgeStatus().healthy` |
| `routes/api.js:73` | `/api/me` controlLive signal: `!config.writesDisabled` |
| `public/js/app.js:39-55` | `writeBlockReason()` — returns block string when `state.me.degraded` |
| `public/js/app.js:164` | Red kill-banner rendered from `kill` string |
| `public/js/app.js:165` | Green LIVE banner rendered from `state.me.controlLive` |
| `services/killswitch.js:30-52` | Server-side `writesBlocked()` — checks writesDisabled + kill-switch only |
| `services/control.js:58-78` | `dispatch()` — no bridge health check on write path |
| `server.js:134-167` | Startup sequence — no bridge probe |
| `services/tb-client.js:68-93` | `activeReadProbe()` for TB read credential (separate from bridge health) |
| `config.js:90` | `writesDisabled` from `WRITES_DISABLED` env var |

---

## Next steps

1. **James confirms** the Q1 open question (search-only vs full workspace load) to finalise the "persisted after lookup" explanation.
2. **James chooses** Option B (fast interim) or straight to Option C. If Option B: one-line change to `routes/api.js:65`, covered by existing test harness. If Option C: design doer shapes the tri-state spec.
3. **Design doer** takes the CX success criteria above and the AC-2 mutual-exclusion requirement.
4. **Follow-up ticket** (OOHDASH-123 suggested): add startup bridge probe regardless of which option is chosen for the false-negative fix.
