Looking at the blocking verdicts, I need to fix four specific issues:

1. Options B and C don't touch the green LIVE banner, so AC-2 fails for real failures too — need to add green-banner suppression as a named required element
2. AC-2 proof text maps to no recommended option (only not-recommended Option D) — need reconciliation
3. Option A probe targets a hardcoded known site — need a site-independent check
4. Option B's cold-start safety argument is implicit — need to make it explicit

<!-- gate:contract
SECTION: What we are solving
OOHDASH-122. After the v1.3.7 deploy on 13 October the New Call home page showed two banners at once: a red one saying control actions are disabled, and a green one saying Device control is LIVE and changes will reach real equipment. Both appear from the moment the pod starts until the first full workspace is loaded. A handler seeing both does not know which to trust. This discovery traces every signal driving each banner, confirms the cold-start false negative in the code, explains why the condition persisted even after a site search on 6832, and frames fix options for the operator to choose between.

SECTION: Root cause
The red kill-banner fires when the bridge read-health flag is false. That flag initialises to false in live mode on every pod restart and only flips to true after a full site workspace is loaded — a site search alone does not update it. The green LIVE banner fires from a completely separate, static deploy-time flag that says writes are enabled. The two flags are never compared. So both banners fire simultaneously from pod start until the first workspace load, which can be minutes or longer on a quiet night. This is not a new bug: the same initialisation has been in place since at least v1.3.6 and is documented in the CIR as a known gotcha.

SECTION: Regression verdict
Not a regression. Services/tb-device.js is unchanged between the v1.3.6 and v1.3.7 tags. The routes/api.js changes in v1.3.7 are entirely the Additional Notes feature and do not touch the degraded or controlLive signals. The condition has been present since writes were enabled on 24 September.

SECTION: Options
The fix has two required parts, not one. Part 1 eliminates the false negative that fires the red banner at cold start: either Option B (one-line change to degrade only on real errors) or Option C (tri-state bridge health mirroring the thingsboard pattern). Part 2 — the Mutual-exclusion guard — suppresses the green LIVE banner whenever degraded is genuinely true, completing AC-2 for real-failure states as well as cold-start. Neither Part 1 option satisfies AC-2 on its own: in a genuine unhealthy state with writes enabled, red and green still co-fire unless Part 2 is applied. The Mutual-exclusion guard is therefore a required companion to whichever Part 1 option is chosen. Option A (startup probe) is additive and orthogonal — it proves bridge health before any operator request, recommended for a follow-up ticket. Option B plus Mutual-exclusion guard is the fast minimal fix. Option C plus Mutual-exclusion guard plus Option A is the architecturally complete solution.

SECTION: Questions for James
One factual question before the fix is scoped: when you looked up site 6832 at around 23:05 on 13 October, did you open the full site workspace so the device list loaded, or did you only see 6832 appear in the search results without clicking through? The answer determines whether the CIR note that the condition clears on the first lookup has ever been accurate, or whether it has always required a full workspace load. The rest of the open questions are the decisions below.

DECISION: Which false-negative fix? | Option B (one line, fast) + Mutual-exclusion guard, in this ticket | Option C (tri-state, proper) + Mutual-exclusion guard, in this ticket
DETAIL: Both choices must include the Mutual-exclusion guard to satisfy AC-2. Option B touches two files (routes/api.js and public/js/app.js). Option C is larger but architecturally correct and satisfies AC-3 without a follow-up. Recommend Option B as the fast unblock, Option C as a planned follow-up.

DECISION: Add a startup bridge probe now or in a follow-up ticket? | Follow-up ticket — scope it separately after the banner fix lands | Include it in this ticket alongside whichever banner fix is chosen
DETAIL: The startup probe (a site-independent TB auth check at pod boot) is additive and orthogonal to the banner fix. It matters most if Option C lands without it, because 'unknown' state at boot would otherwise linger until the first workspace load. Recommend a follow-up ticket so this ticket stays small.

DECISION: Should the server-side control dispatch path also gate on bridge health? | No — writesDisabled and the kill-switch are the authoritative server-side gates | Yes — add a server-side check
DETAIL: Today the write path in control.js never checks bridge health. Bridge health reflects the read path; the write path goes directly to ThingsBoard. Recommend leaving server-side gating unchanged and revisiting when Option C lands.
-->

# DISCOVERY — OOHDASH-122
## Red "degraded mode" banner simultaneous with green "Device control is LIVE" banner

**Ticket:** OOHDASH-122 | **Status:** Backlog | **Date:** 2026-10-14
**Reporter:** James Brown | **Discovery:** Claude Code discovery doer

---

## Problem statement

Every time the OOH Dashboard pod restarts, the New Call home page shows two contradictory banners simultaneously: a red "control actions are disabled" kill-banner and the green "Device control is LIVE" banner. The banners are driven by two entirely independent signals that are never compared or reconciled — one from the last device-read outcome (reactive, starts false), and one from the deploy-time write-lock env var (static). Because a fresh pod has never performed a device read, the reactive signal starts in the "failed" position by design, while the static signal correctly reflects that writes are enabled. Both fire at once from first page load until the first workspace is opened.

This is a confusing and alarming experience for handlers: one banner says they cannot make changes; the other says changes will reach real equipment.

**Critical structural point:** fixing only the cold-start false negative is not enough. In a genuine unhealthy state (real TB read failure, `lastError` set, writes still enabled), `controlLive` remains statically `true` — so red and green would still co-fire, just now for a real failure rather than a cold start. AC-2 therefore requires two changes: (1) fix the false negative so `degraded` only fires on real errors, and (2) add a mutual-exclusion guard so the green LIVE banner is suppressed whenever `degraded` is genuinely true.

The condition is pre-existing (present since at least v1.3.6), not a v1.3.7 regression.

---

## Recurrence check

This ticket is new, not a prior-fix recurrence. The condition has been present since at least v1.3.6 and was documented in the CIR as a known gotcha rather than fixed.

---

## Token / cost efficiency evaluation

This is a pure code fix — no background polling, no new service, no LLM calls. Token cost: nil. Running cost impact: nil.

---

## Silent-running evaluation

No proposed fix introduces any background component. Option A (startup probe) adds a single fire-and-forget TB connectivity call at pod boot only, not a recurring loop. Silent-running criterion: fully met.

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

**Cold-start false negative: PROVEN structural.** In live mode, `lastReadOk = false` from first load; there is no mechanism to prove it healthy before an operator opens a workspace.

---

### Q2 — Does degraded actually disable control, or is `writesDisabled` authoritative?

**PROVEN**

The write gate has two layers:

**Client side (UI only):** `writeBlockReason()` in `public/js/app.js:52` returns a blocking string when `state.me?.degraded || state.workspace?.degraded`. This string is assigned to `kill` (`app.js:142`) and renders the red kill-banner (`app.js:164`). The UI treats degraded as a block, showing the banner and implicitly hiding the dispatch button.

**Server side (authoritative):** `control.dispatch()` in `services/control.js:58` checks:
1. Confirmation token validity (line 64)
2. Kill-switch via `killswitch.writesBlocked()` (line 69-70)
3. Device inventory and capability guardrails (lines 72-80+)

`killswitch.writesBlocked()` in `services/killswitch.js:33` checks `config.writesDisabled` (the env var), the refrigeration boot guard, and the Cosmos kill-switch document. It does NOT check `bridge.bridgeStatus().healthy`.

**Conclusion:** `writesDisabled` is the authoritative server-side write gate. Bridge health (`lastReadOk`) is UI-only. A direct `POST /api/control/dispatch` with a valid confirm token would succeed on the server even when `bridge.healthy: false` (provided writes are enabled and no kill-switch). The red banner is a UI warning; it is not backed by a server-side bridge-health guard.

---

### Q3 — Did v1.3.6 exhibit the same dual-banner state after a pod restart?

**PROVEN pre-existing — NOT a v1.3.7 regression**

The `git diff v1.3.6..v1.3.7 --stat` output shows `services/tb-device.js` was not changed between these tags. The `lastReadOk` initialisation (line 84) is identical in both versions.

`routes/api.js` was in the diff (68 lines changed), but `git show v1.3.6:routes/api.js` confirms the same two lines were present in v1.3.6:

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

This is a deploy-time static value. On live, it is `false` (writes enabled), so `controlLive = true` — permanently, regardless of any runtime state.

**Red "control actions are disabled" kill-banner** (`public/js/app.js:164`):

    ${kill ? `<div class="banner kill" ...>⛔ ${kill} — control actions are disabled; capture & escalate still works.` : ''}

Where `kill = writeBlockReason(state.siteNo)` (the client-side function, not the env var). It returns a string when:

    state.me?.degraded || state.workspace?.degraded   (public/js/app.js:52)

`state.me.degraded` ← `GET /api/me` → `routes/api.js:65`: `degraded: !bridge.bridgeStatus().healthy`

`bridge.bridgeStatus().healthy` = `lastReadOk` = `false` on every pod start in live mode.

**The two-layer contradiction:**

The cold-start problem (the presenting symptom) is `lastReadOk` starting false with no real error — a false negative that fires the red banner unwarrantedly. Fixing this (Options B or C) prevents the red banner at cold start.

But there is a second, surviving problem once the false negative is fixed: `controlLive` is derived solely from `config.writesDisabled` (a static env var) and is never gated on bridge health. In a genuine unhealthy state — real TB read failure, `lastError` set, writes still enabled — the fix to `degraded` would correctly show the red banner, but `controlLive` remains `true` and the green LIVE banner continues to fire alongside it. AC-2 is not met by fixing `degraded` alone.

The green banner must be gated: it should only render when `controlLive && !degraded`. This is the mutual-exclusion guard that makes AC-2 structurally sound across all system states, not just cold start.

---

### Q5 — Should the pod probe bridge health at startup?

**DEDUCED (high confidence)**

The startup sequence in `server.js:134-167` already performs an eager Cosmos store probe (`storeProbe()`, line 141) on live mode boot. The TB read-credential session in `tb-client.js` has an `activeReadProbe()` method (line 68) that is fire-and-forget safe.

There is no equivalent for bridge device health (`lastReadOk`). Adding a lightweight startup probe would let `lastReadOk` reflect reality before any operator request arrives. Critically, the probe must be **site-independent** — it must not target a specific device or site by name. A minimal paginated device query (`GET /api/v1/devices?pageSize=1` against the TB API, using live-mode credentials) proves auth and TB connectivity without depending on any specific site, device, or gateway that could be decommissioned. A probe targeting a hardcoded known gateway would permanently set `lastReadOk=false, lastError` on every boot if that gateway were removed from inventory.

However, the startup probe is additive and orthogonal to the banner fix. With Options B or C plus the mutual-exclusion guard already satisfying AC-1 and AC-2, the probe is the cleanest path to AC-3 and is the recommended follow-up scope.

---

## Options

### Required element: Mutual-exclusion guard (required companion to any Part 1 fix)

Regardless of which Part 1 option (B or C) is chosen, the green LIVE banner must be gated to prevent co-firing with a genuine degraded state. In `public/js/app.js:165`, the render condition changes from:

    ${state.me.controlLive ? ... : ''}

to:

    ${state.me.controlLive && !state.me.degraded ? ... : ''}

**This is the mechanism that satisfies AC-2 for real-failure states.** Without it, fixing the false negative only relocates the AC-2 failure from cold start to genuine degraded states — both red and green still co-fire whenever `lastError` is populated. The guard is safe only in combination with a Part 1 fix: if applied to the current code with no false-negative fix, a cold-start pod would suppress the LIVE banner unnecessarily (because `degraded` would still be true at cold start). With Option B or C in place, `degraded` is true only for real failures, making the guard safe and correct in all states.

Cost: nil. Silent running: fully met. Scope: one line in `public/js/app.js`.

---

### Option A — Startup bridge probe (satisfies AC-3; makes AC-1 moot from boot)

Add a `bridgeProbe()` call to `server.js:start()` mirroring the Cosmos `storeProbe()` at line 141. The probe makes a minimal, site-independent TB API call — a single paginated device listing (`GET /api/v1/devices?pageSize=1`) using the live-mode ThingsBoard credentials — to prove auth and connectivity. On success, `lastReadOk` is set to `true`; on failure, `lastReadOk = false` with `lastError` populated (a real error, appropriately surfaced). The pod continues booting either way (same non-exit pattern as `storeProbe()`).

The probe must not target a specific site, device, or gateway by name. A decommissioned target would cause permanent `lastReadOk=false, lastError` on every boot — permanently showing the red banner. A site-independent query has no such fragility.

Pros: structural fix, `lastReadOk` reflects proven reality before any operator request, consistent with how the Cosmos store is treated.
Cons: adds a mandatory TB auth round-trip to every pod start (~1-3 s latency); a TB blip at pod boot causes a real error state (which is correct, not a false negative).

**ACs satisfied:** AC-3 (healthz tri-state), and indirectly AC-1 (cold-start window collapses to seconds). Does not alone satisfy AC-2 — still needs the mutual-exclusion guard.

Cost: nil (one TB API call per pod restart, no tokens). Silent running: fully met (fire-and-forget, no timer).

---

### Option B — Treat "unproven" differently from "unhealthy" in /api/me (satisfies AC-1; with guard, satisfies AC-2)

Change `routes/api.js:65` from:

    degraded: !bridge.bridgeStatus().healthy

to:

    degraded: !!bridge.bridgeStatus().lastError

This means `degraded` is only `true` when there has been a real, observed read failure (`lastError` populated) — not when the pod is merely unproven. An unproven cold-start pod shows `degraded: false`, the red banner is absent, and the green LIVE banner fires alone — an accurate, consistent state.

**Safety argument (explicit):** This change is safe because an unproven cold-start pod cannot reach the control dispatch path without a workspace load first. To dispatch a command, the operator must: search for a site → confirm it → load the workspace (which calls `getSitesByNumber()`) → view devices → initiate dispatch. The workspace load is the step that updates `lastReadOk` via `getSitesByNumber()`. By the time any dispatch attempt is made through the normal UI flow, `lastReadOk` reflects a real, observed read outcome — not the cold-start default. The window in which a pod is unproven and could theoretically dispatch is not reachable through the intended UI path.

Pros: minimal change (one line in `routes/api.js`), directly eliminates the false negative, no latency added to pod start.
Cons: `lastError: null` does NOT distinguish "unproven" from "verified healthy" — an operator looking at `/healthz` still sees `bridge.healthy: false` at cold start even though the dashboard shows no degraded banner. `/healthz` and `/api/me` diverge in meaning. Does not satisfy AC-3.

**With Mutual-exclusion guard: satisfies AC-1 and AC-2. Does NOT satisfy AC-3 without Option C.**

Cost: nil. Silent running: fully met.

---

### Option C — Bridge health tri-state (with guard + Option A, satisfies all three ACs)

Add a `lastReadState: 'unknown' | 'healthy' | 'unhealthy'` tri-state to `bridgeStatus()`, mirroring the `thingsboardRead` tri-state in `tb-client.js`. Update `/api/me` to map `unknown → degraded: false` and `unhealthy → degraded: true`. Update `/healthz` to surface `bridgeRead` alongside `thingsboardRead`.

A startup probe (Option A) populates the tri-state at boot; an 'unknown' state means not-yet-proven rather than failed, and does not trigger the degraded banner. The /api/me vs /healthz divergence introduced by Option B is eliminated: `unknown` is a first-class state in both responses.

Pros: architecturally clean, consistent with the existing thingsboard pattern, removes the /api/me vs /healthz divergence, satisfies all three ACs when combined with the guard and Option A.
Cons: larger change (touches `tb-device.js`, `routes/api.js`, `server.js`, `/healthz` response shape, any consumers of `bridge.healthy`). More surface area for test coverage.

**With Mutual-exclusion guard + Option A: satisfies AC-1, AC-2, and AC-3.**

Cost: nil. Silent running: fully met.

---

### Option D — Mutual-exclusion guard as sole fix (band-aid; does NOT satisfy AC-1 or AC-3)

Applying only the LIVE-banner suppression guard (without fixing the false negative in `/api/me`) removes the visible contradiction but leaves `lastReadOk` initialised false at cold start. The result: at cold start, the red banner is absent (degraded=false with the guard… wait — no, this is backwards). 

Actually: Option D alone means `degraded` stays true at cold start (the false negative is not fixed), so the guard suppresses the green LIVE banner, leaving only the red kill-banner showing at cold start. The user sees a red "control actions are disabled" banner from pod start — with no green LIVE banner to contradict it, but also no accurate indication that writes are enabled. The contradiction is resolved, but by hiding the LIVE signal rather than fixing the degraded signal. In a real failure, the red banner correctly shows with LIVE suppressed — this part is right. But at cold start, showing a red kill-banner when there is no real error remains a false negative.

**Not recommended as the sole fix.** The mechanism is correct and required — but it must be paired with Option B or C to ensure `degraded=true` only fires on real failures.

---

## Recommendation

**Minimum viable fix (this ticket):** Option B + Mutual-exclusion guard.

Two files, two changes:
- `routes/api.js:65` — `degraded: !!bridge.bridgeStatus().lastError` (Option B)
- `public/js/app.js:165` — render condition `state.me.controlLive && !state.me.degraded` (Mutual-exclusion guard)

This eliminates the cold-start false negative (AC-1) and ensures the two banners can never co-fire with contradictory meaning in any system state (AC-2). It does not satisfy AC-3 — the healthz/api/me divergence on 'unknown' state is deferred to the follow-up.

**Recommended follow-up (next ticket):** Option C + Mutual-exclusion guard (already in place) + Option A.

Option C promotes the fix to architecturally consistent tri-state; Option A adds a startup probe so the 'unknown' window collapses to seconds at pod boot. Together these satisfy all three ACs cleanly and remove the /api/me vs /healthz divergence.

---

## Refined acceptance criteria

**AC-1 — No false degraded banner on clean restart**
Given a pod that has just started with `WRITES_DISABLED=false` and no prior ThingsBoard read errors (`lastError: null`),
when the handler loads the New Call home page,
then the red kill-banner is not shown.
Proof: `bridge.bridgeStatus().lastError` is null → `degraded: false` in `/api/me` → `kill` is falsy → red banner absent.

**AC-2 — Contradictory banners are mutually exclusive in all system states**
Given any state of the dashboard — cold start, unproven, genuinely degraded, or healthy,
when the page is rendered,
then the red kill-banner ("control actions are disabled") and the green "Device control is LIVE" banner are never shown simultaneously.
Proof: the green LIVE banner renders only when `controlLive && !degraded` (mutual-exclusion guard in `public/js/app.js:165`); the red kill-banner renders only when `degraded` is true (meaning `lastError` is non-null — a real observed failure). The two conditions are mutually exclusive by construction: `degraded=true` suppresses the LIVE banner; `degraded=false` suppresses the red banner. At cold start: `degraded=false` (no `lastError`) → LIVE banner shows, red banner absent. At real failure: `degraded=true` → red banner shows, LIVE banner suppressed. No combination produces both simultaneously.

**AC-3 — /healthz bridge health reflects a real probe (refined)**
Given a pod that has just started,
when `GET /healthz` is called within 5 seconds of pod-ready,
then `subsystems.bridge` reflects one of: `{ mode:'live', state:'unknown' }` (unproven, not an error), `{ mode:'live', state:'healthy' }` (proven), or `{ mode:'live', state:'unhealthy', lastError:'<message>' }` (real failure) — never `{ healthy: false, lastError: null }` as a false negative.
The 'unknown' state must NOT count against `status:degraded` at `/healthz`.
*(Satisfied by Option C + Option A in the follow-up ticket. Option B alone does not satisfy AC-3.)*

---

## CX success criteria (for design doer)

**Persona–journey map:**
The user is an OOH handler (SCC contractor), on shift at ~22:30-23:00, taking a call from a pub reporting a cold kitchen or failed heating. They open the dashboard under time pressure. The first screen they see is the New Call home page with site search.

Journey at the point of failure:
1. Handler signs in (SSO, automatic)
2. Home page loads — they see two banners, one red, one green
3. Red: "control actions are disabled" — they interpret this as: they cannot do anything useful
4. Green: "Device control is LIVE" — they interpret this as: changes will reach real equipment
5. The contradiction causes confusion and anxiety. They do not know which to trust. They may escalate unnecessarily or abandon the dashboard.

**Reassurance-vs-friction calibration:**

- Cold start / unproven state: handler should see the LIVE banner only (writes are enabled, no known error). Low-friction — no alarm, no contradiction.
- Real degraded state (TB unreachable, real read failure): handler SHOULD see the red banner, LIVE banner suppressed. High-stakes; one clear, unambiguous signal.
- Genuinely healthy (proven by workspace load or startup probe): green LIVE banner only. Positive, clean.

The rule the design doer realises: one banner at a time. The green LIVE banner and the red kill-banner are mutually exclusive. When the system is degraded, only the red shows. When it is not, only the green shows. The handler never decides between two contradictory truths.

**"Great looks like…":**
A handler who opens the dashboard after a pod restart sees either: (a) the green LIVE banner only (system healthy or unproven but no real error), or (b) the red kill-banner only (genuine TB read failure). They never face two banners at once. The signal is always singular and unambiguous. They can immediately trust what they see.

---

## Data scope (for design doer)

No new data entities. The minimum fix touches only:
- The derivation of `degraded` in the `/api/me` response (`routes/api.js:65`)
- The green-banner render condition in `public/js/app.js:165`

Option C additionally affects the `bridgeStatus()` export shape from `services/tb-device.js` and the `/healthz` response structure. No Cosmos writes. No new fields beyond a possible `state` field in the bridge status object (Option C). Existing consumers of `bridge.healthy` must be audited if Option C lands — the field changes from boolean to enum.

---

## End-to-end testing scope (for design doer)

Critical journeys to prove:

1. **Cold start — no false banner; LIVE banner shows.** Start a fresh instance with `WRITES_DISABLED=false`, `lastError: null`. Load the home page. Assert: red kill-banner absent; green LIVE banner present. (Proves AC-1 and confirms AC-2 — no contradiction.)

2. **Real failure — red banner shows; LIVE banner absent.** Start a fresh instance. Trigger a real TB read failure (or stub `lastError` to a non-null string). Load the home page. Assert: red kill-banner present; green LIVE banner absent. (Proves AC-2 for genuine degraded state — the relocated failure case.)

3. **Real failure → recovery.** After a real TB read failure, trigger a successful workspace load (`getSitesByNumber()` succeeds, `lastError` clears). Load the home page. Assert: red kill-banner absent; green LIVE banner present. (Proves recovery path.)

4. **Post-workspace-load — healthy state at /healthz.** Complete a full resolve→confirm→workspace flow. Call `/healthz`. Assert: `bridge` state is 'healthy' (Option C) or `lastReadOk: true` (Option B), no false negative persists.

5. **Mutual exclusion — unit level.** Confirm no combination of `degraded` and `controlLive` state causes both banners to render simultaneously. Unit test the banner render logic with `degraded=true, controlLive=true` (both set) — assert only red banner renders. Unit test with `degraded=false, controlLive=true` — assert only green banner renders.

6. **Startup probe (if Option A included):** Start the pod and call `/healthz` within 5 s of listen. Assert: `subsystems.bridge.state` is 'unknown' or 'healthy', never `{ healthy: false, lastError: null }`. (Proves AC-3.)

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Option B leaves /healthz showing misleading `healthy:false, lastError:null` at cold start | Medium | Low | Document as known limitation; address with Option C in follow-up |
| Startup probe uses a site-specific target that is later decommissioned — permanent red banner | Low (if probe is site-independent) | High | Probe MUST use a site-independent TB API call (e.g. `GET /api/v1/devices?pageSize=1`); never target a named gateway |
| Startup probe adds latency at pod boot | Low | Low | Non-blocking (same pattern as storeProbe — log + continue on failure) |
| A real TB failure at boot sets lastError, red banner shows — handler alarmed | Low | Medium | This is CORRECT behaviour; document as expected in runbook |
| Changing /api/me `degraded` semantics breaks existing tests | Medium | Low | Test suite covers degraded signal — adjust assertions to match new semantics |
| Mutual-exclusion guard applied without Option B/C — suppresses LIVE at cold start incorrectly | Medium (if guard shipped alone) | Medium | Guard must ship alongside Option B or C, never as the sole change |

---

## Open questions for James

1. **[Required for diagnosis]** When you did the "site lookup on 6832" at ~23:05, did you go through the full confirm flow (site resolved, workspace opened, device list loaded) — or just searched for 6832 in the search box and saw the result? This determines whether `getSitesByNumber` was called and whether the CIR note about "clears on first lookup" was ever correct.

2. Did the green LIVE banner and the red kill-banner appear on the initial home page BEFORE any site search, or only after a search? This helps confirm the sequence.

3. **[Decision gate]** Preferred fix path: Option B (one-line `degraded` change in `routes/api.js`) + Mutual-exclusion guard (one-line in `app.js`), fast and minimal — or straight to Option C (tri-state, larger but architecturally complete)? Either must include the mutual-exclusion guard.

4. Should the startup probe (Option A element) be scoped into this ticket or a follow-up? It is additive to the banner-contradiction fix.

---

## Code locations (read-only, all on `main`)

| Location | Role |
|---|---|
| `services/tb-device.js:84` | `lastReadOk` initialisation — `false` in live mode |
| `services/tb-device.js:975-980` | `getSites()` success/failure updates `lastReadOk` |
| `services/tb-device.js:1002-1007` | `getSitesByNumber()` success/failure updates `lastReadOk` |
| `services/tb-device.js:1019-1039` | `searchSites()` — does NOT update `lastReadOk` |
| `services/tb-device.js:1059-1063` | `bridgeStatus()` export |
| `routes/api.js:65` | `/api/me` degraded signal — **change target for Option B** |
| `routes/api.js:73` | `/api/me` controlLive signal: `!config.writesDisabled` |
| `public/js/app.js:39-55` | `writeBlockReason()` — returns block string when `state.me.degraded` |
| `public/js/app.js:164` | Red kill-banner rendered from `kill` string |
| `public/js/app.js:165` | Green LIVE banner — **change target for Mutual-exclusion guard** |
| `services/killswitch.js:30-52` | Server-side `writesBlocked()` — checks writesDisabled + kill-switch only |
| `services/control.js:58-78` | `dispatch()` — no bridge health check on write path |
| `server.js:134-167` | Startup sequence — **insertion point for Option A probe** |
| `services/tb-client.js:68-93` | `activeReadProbe()` for TB read credential (separate from bridge health) |
| `config.js:90` | `writesDisabled` from `WRITES_DISABLED` env var |

---

## Next steps

1. **James confirms** the Q1 open question (search-only vs full workspace load) to finalise the "persisted after lookup" explanation.
2. **James chooses** Option B (fast interim, two-file change) or straight to Option C. Either choice ships with the Mutual-exclusion guard — that element is not optional.
3. **Design doer** takes the CX success criteria above, the AC-2 mutual-exclusion requirement, and the single-banner-at-a-time principle as its brief.
4. **Follow-up ticket** (OOHDASH-123 suggested): Option C (tri-state) + Option A (site-independent startup probe) to satisfy AC-3 and close the /api/me vs /healthz divergence.