<!-- gate:contract
SECTION Scope: This design covers R8 / S10 ONLY — the active "control is now live" in-app signal shown to on-shift handlers when device control transitions from OFF (WRITES_DISABLED=true) to ON at the OOHDASH-19 flip. It contains no authz (-67), no confirm-loop timing (R11/C7), no confirm identity (B0/C9), and does NOT absorb the S11 human-comms plan. Carried conditions live in the register.
SECTION Hard gate: R8/S10 is a HARD Design-gate requirement — "treated as HARD Design-gate requirement, not optional" (register S10). The signal MUST reflect the TRUE writesDisabled state and MUST NEVER be hard-coded; it is gated behind the actual OOHDASH-19 flip and reads the live lock state the server already reports.
SECTION Current state: The F005 deploy-time lock state IS already delivered to the client — killSwitchState() emits writesDisabled:config.writesDisabled (killswitch.js:53) and /api/me returns it under killSwitch (api.js:39). BUT the client's writesDisabled() predicate (app.js:42-47) reads only ks.global, ks.sites[siteNo] and me.degraded — it NEVER reads ks.writesDisabled. So the deploy-time write-lock is invisible in the UI today: no banner, no block. All cited to file:line.
SECTION The gap: A handler cannot tell whether control is OFF (canary/pre-flip) or LIVE, and — critically — is not ACTIVELY told the moment it goes live. Being told must not depend on noticing a subtle badge. Contrast tester test 12: the safety-lock currently blocks changes; after the flip it will not, and no one is signalled.
SECTION The design: Two-part ACTIVE signal driven by the true lock state. (1) A persistent "control is LIVE" banner rendered from a new me.controlLive boolean (derived server-side from !writesBlocked-style deploy lock), replacing today's silence. (2) A one-time first-use acknowledgement modal fired on the OFF→ON transition per handler session — the client remembers the last-seen lock state (client-side, per session) and when it sees live-after-not-live it interrupts with an ack the handler must dismiss. Client-side session persistence is sufficient for R1; no new server store.
SECTION S11 boundary: R8/S10 is the IN-APP signal only. S11 (handler-communication plan — how handlers are told out-of-band that they now hold dispatch) is owned by James and NOT designed here. The banner/ack must not be read as the comms plan.
SECTION Tests: OFF shows no live-banner and blocks; ON shows live-banner; OFF→ON within a session fires the first-use ack exactly once; already-ON at load shows banner but NO ack (distinguishes "always been live" from "just went live"); the signal follows the true writesDisabled flag and is never hard-coded; the live-banner must not fight the confirm modal.
DECISION control-live-signal: Add an ACTIVE two-part in-app signal for the OOHDASH-19 flip — a persistent "control is LIVE" banner AND a one-time first-use acknowledgement modal fired on the OFF→ON transition — both driven by the TRUE deploy-time writesDisabled state the server already reports via killSwitch (killswitch.js:53, api.js:39), surfaced through a new derived me.controlLive. Transition detection and ack are client-side per session (sufficient for R1; no server store). NEVER hard-coded. S11 human-comms is out of scope.
-->

# Design — R8 / S10 "control is now live" active in-app signal

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Requirement:** R8 (= S10) · **Date:** 2026-09-15
**Repo state (verified):** `main`, app v1.2.0. Deploy-time write-lock state is emitted by the server (`killswitch.js:53`) and delivered to the client under `me.killSwitch` (`api.js:39`), but the client UI never reads it (`app.js:42-47`).
**Scope:** exactly one thing — the active "control is now live" in-app signal at the OOHDASH-19 flip. **Nothing else.** No dispatch authz (-67), no confirm-loop timing (R11/C7), no confirm-step identity (B0/C9), and this design does **not** absorb the S11 handler-communication plan. Carried conditions live in `RELEASE_CONDITIONS_REGISTER.md`; only R8/S10/S11 are referenced.
**Method:** every code claim verified firsthand against deployed source on `main`, cited to `file:line`.

> **HARD Design-gate requirement.** S10 records this as *"treated as a HARD Design-gate requirement — not optional"* (= R8). The signal is **gated behind the actual OOHDASH-19 flip** and must reflect the **TRUE** `writesDisabled` state — it must **never** be hard-coded to "live".

---

## 1. Verified current state — how the client learns the lock today

There are **three** independent write-blocking sources in this app; the client handles only two of them:

- **F005 deploy-time lock (`WRITES_DISABLED`).** `config.writesDisabled` is set from the env var (`config.js:87`). `writesBlocked()` checks it **first and synchronously** before any Cosmos read, returning *"Device control is disabled at deploy time (WRITES_DISABLED) — safety/canary lock"* (`killswitch.js:29-34`). This is the lock the OOHDASH-19 flip turns **off**.
- **F016 runtime kill-switch** (global / per-site), stored in Cosmos (`killswitch.js:35-43`).
- **TQ-8 degraded reads** (`me.degraded = !bridge.bridgeStatus().healthy`, `api.js:41`).

**The deploy-time lock state IS already on the wire.** `killSwitchState()` explicitly emits `writesDisabled: config.writesDisabled` *"so the banner and canary can prove it is engaged"* (`killswitch.js:53`), and `/api/me` returns the whole object as `killSwitch` (`api.js:39`). So `state.me.killSwitch.writesDisabled` is available to the client at every load.

**But the client ignores it.** The client's blocking predicate `writesDisabled(siteNo)` (`app.js:42-47`) checks only:
- `ks.global` (F016 global),
- `ks.sites[siteNo]` (F016 per-site),
- `state.me.degraded || state.workspace.degraded` (TQ-8).

It **never** reads `ks.writesDisabled`. Consequently the F005 deploy-time lock produces **no banner** (`app.js:97`) and **no control block** (`control.js:17-20`) in the UI — a dispatch attempt is stopped only server-side with a 423 (`control.js:55` via `writesBlocked`). So today:

- while **OFF (canary/pre-flip)** the handler sees a normal, un-annotated UI and only discovers the lock by trying to dispatch and getting a modal error;
- at the **flip to ON** the handler is told **nothing** — the UI is identical before and after. This is exactly the R8/S10 gap: no active signal that dispatch just became real.

**The `/healthz` body** also carries `writesDisabled: config.writesDisabled` (`server.js:76`) for the canary proof, but `/healthz` is an ops/probe surface, not something the handler client renders.

---

## 2. The gap

Per R8: *"add active 'control is now live' notification (banner / first-use prompt) at the flip."* A passive badge is insufficient — S10 is HARD precisely because a handler must be **actively told** the moment writes become real, so no one operates believing the write-lock still holds (contrast tester **test 12**, where the safety-lock blocks changes today; after the flip it will not). The UI must (a) show live-state at all times and (b) **interrupt** on the OFF→ON transition, distinguishing *"just went live"* from *"always been live"*.

---

## 3. The design — active two-part signal driven by the true lock state

### Option chosen: (B) persistent banner **+** first-use acknowledgement, client-side transition detection.

- **Option A (banner only)** — passive; a handler mid-call could miss it. Rejected: fails the "actively told" requirement of S10.
- **Option C (server-persisted per-handler ack)** — durable "has this handler seen the go-live" record in Cosmos. Rejected for R1: over-built. The flip is a one-shot event; a per-session client ack meets the "no handler operates believing the lock holds" goal without a new collection or write path.
- **Option B (chosen)** — persistent live banner for continuous state, plus a one-time first-use modal fired on the detected OFF→ON transition. Active, cheap, and honours the true flag.

### 3.1 Server: surface an unambiguous derived flag

The raw `writesDisabled` is available but negative-sense and easily confused with the F016 kill-switch. Add a single derived boolean to `/api/me` so the client has one clear signal:

- `me.controlLive = !config.writesDisabled` — i.e. the **deploy-time** lock is off. This is **not** the same as "dispatch is allowed right now" (F016 or degraded may still block a specific site); it specifically answers *"has the OOHDASH-19 flip happened"*. Add it in the `/me` handler (`api.js:35-45`) alongside the existing `killSwitch` object. (Equivalently the client can read `me.killSwitch.writesDisabled` directly, but a named `controlLive` keeps the client honest about intent and avoids re-deriving negation in the view.)

Because this is computed from `config.writesDisabled` (`config.js:87`), the signal is **structurally tied to the true flag** and cannot be hard-coded to live without changing the env — satisfying the "must reflect TRUE state" gate condition.

### 3.2 Client: persistent "control is LIVE" banner

In the shell banner region (`app.js:96-98`, beside the existing `kill-banner` and `notice-banner`), render a live-state banner from `state.me.controlLive`:

- when `controlLive` is **false** (OFF / canary): optionally a muted *"Control is in safety-lock (canary) — dispatch disabled"* strip (reinforces today's silent state); this also lets `writesDisabled()` be extended to return the F005 reason so the existing `control.js:17-20` block fires **client-side** instead of only via the 423.
- when `controlLive` is **true** (LIVE): a prominent *"Device control is LIVE — changes you send will reach real equipment"* banner (`data-testid="control-live-banner"`), styled distinctly from the red `kill` banner (this is an *enabled* state, not a block).

Extend `writesDisabled(siteNo)` (`app.js:42-47`) to also consult `ks.writesDisabled` so the F005 lock produces a proper client-side block while OFF — closing the "no UI block for the deploy lock" gap noted in §1.

### 3.3 Client: first-use acknowledgement on the OFF→ON transition

Detect the transition and **distinguish "just went live" from "always been live"** using a client-side last-seen marker, scoped to the session (`sessionStorage`, so it resets on a fresh sign-in but survives a page render):

- On each `refreshMe()` (`app.js:51-53`) / boot, read `sessionStorage['ooh.controlLive.lastSeen']`.
- **Transition (fire ack):** `lastSeen === 'false'` (or a prior recorded OFF) **and** `me.controlLive === true` → open a one-time acknowledgement modal (reuse `openModal`, `app.js`/`control.js` modal plumbing): *"Device control is now LIVE. Changes you send will reach real equipment. Continue with care — confirm the site before every change."* with a single **"I understand"** dismiss. Record the ack in `sessionStorage['ooh.controlLive.acked']` so it does not re-fire on later renders in the same session.
- **Already-ON at first load (no ack):** `lastSeen` unset **and** `me.controlLive === true` → show the banner (§3.2) but do **not** fire the modal — the handler joined an already-live shift and the interrupt would be noise. Record `lastSeen = 'true'`.
- **OFF:** record `lastSeen = 'false'`; clear `acked`.

Acknowledgement is **per-session, client-side** — sufficient for R1 (no server persistence, no new collection, no write path). A handler who signs out and back in during the same live shift may see the banner again but not the modal (they will have `lastSeen='true'` only within a session; a fresh session with no prior marker takes the "already-ON, no ack" path — correct, since they were not mid-transition).

### 3.4 Do not fight the confirm modal (R11/C7, B0/C9 — boundary only)

The first-use ack is a **one-shot at transition**, and the persistent live-banner lives in the shell strip (`app.js:96-98`), not over the workspace — so neither competes with the F004 confirm-dispatch modal (`control.js:95-98`) for attention during a real dispatch. The ack must be dismissed **before** a handler reaches a confirm step in a just-flipped session, but must not stack on top of an open confirm modal. Detailed confirm-loop timing (R11/C7) and confirm identity (B0/C9) are **out of scope** and designed elsewhere.

---

## 4. Code surface

| File | Change |
|------|--------|
| `routes/api.js` | In the `/me` handler (`:35-45`) add derived `controlLive: !config.writesDisabled` alongside the existing `killSwitch` (`:39`). No new store, no new route. |
| `public/js/app.js` | (a) Extend `writesDisabled(siteNo)` (`:42-47`) to also return an F005 reason from `ks.writesDisabled` so the deploy lock blocks client-side while OFF. (b) Render the `control-live-banner` in the shell banner region (`:96-98`) from `state.me.controlLive`. (c) In `boot()`/`refreshMe()` (`:51-63`) add the `sessionStorage` last-seen transition check and fire the first-use ack modal on OFF→ON only. |
| `public/css/styles.css` | Add a `.banner.live` style distinct from `.banner.kill` (enabled state, not a block). |

No server-side persistence, no config knob, no change to `writesBlocked()` (`killswitch.js:29-44`) — the server enforcement path is already correct; this design only makes the client **reflect and actively announce** the state the server already reports.

---

## 5. Proving tests (design)

1. **OFF blocks and shows no live-banner.** `WRITES_DISABLED=true` → `/api/me` `controlLive:false`; assert no `control-live-banner`, and a client-side dispatch attempt is blocked (not only the 423). *(Matches tester test 12 today.)*
2. **ON shows the live-banner.** `WRITES_DISABLED=false` → `controlLive:true`; assert `control-live-banner` present.
3. **OFF→ON fires the first-use ack exactly once.** Load with `controlLive:false` (records `lastSeen='false'`), then a subsequent `refreshMe()` returns `controlLive:true` → the acknowledgement modal opens once; dismissing it and re-rendering does not re-open it (`acked` set).
4. **Already-ON at load → banner, NO ack.** Fresh session, first `/api/me` already `controlLive:true` (no prior `lastSeen`) → banner shown, modal does **not** fire. *(Distinguishes "always been live" from "just went live".)*
5. **Never hard-coded.** Flipping `WRITES_DISABLED` back to `true` returns the UI to OFF (banner gone, block restored) — proving the signal follows the true flag, not a constant.
6. **No modal contention.** With the F004 confirm modal open, the live-banner does not overlay it and the first-use ack does not stack on the confirm modal.

*Stubbing note:* tests drive `me.controlLive` via `config.writesDisabled` (`config.js:87`) exactly as the server derives it; `sessionStorage` is the only client-side state, so the transition tests are deterministic under a controlled `/api/me` sequence.

---

## 6. Conditions referenced (pointers only — see the register)

- **R8 (= S10)** — *add an active "control is now live" notification (banner / first-use prompt) at the flip*; **HARD Design-gate**, owner Design doer (register R8 / S10). **This design satisfies R8** with the two-part active signal above, gated on the true `writesDisabled` flag behind OOHDASH-19.
- **S11 — boundary, NOT absorbed.** S11 is the **human** handler-communication plan (how handlers are told out-of-band that they now hold dispatch), owned by **James** (register S11). R8/S10 here is the **IN-APP** signal only; the banner/ack is **not** the comms plan and does not close S11.
- **R11/C7 (confirm-loop timing), B0/C9 (confirm identity)** — touched only as a non-contention boundary (§3.4); **out of scope**, designed elsewhere.

---

*All line numbers cited against repo `main`, 2026-09-15, verified firsthand for this artefact: `killswitch.js:29-34,35-43,53`, `api.js:35-45,39,41`, `app.js:42-47,51-63,96-98,97`, `control.js:17-20,55,95-98`, `config.js:87`, `server.js:76`. This artefact decides the R8/S10 in-app-signal approach only; it does not invoke gates, open a PR, commit, or flip anything.*
