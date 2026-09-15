<!-- gate:contract
SECTION Scope: This design covers ONE thing — the active late-sync handler alert (C6) under the in-memory durability constraint (C1). It is the "device echoed AFTER the 90s timeout" signal. It contains no confirm-loop timing redesign (R11/C7), no freshness re-fetch (C4), no authz and no /healthz — those live in their own artefacts and in the shared register.
SECTION The gap: When a timed-out action later echoes, pollOne sets state 'late-synced' (control.js:180) and — if a ticket is attached — writes ONE Zendesk internal note (control.js:183-185; zendesk.js:206-209) and corrects the audit (control.js:181). There is NO active in-session signal. By the time the late echo lands the handler has usually clicked Escalate/Done/Cancel, which clears the client poll timer and nulls window.ctl (public/js/control.js:176,183,190,197) — so nobody is actively told the change DID apply. The next shift sees it only if they happen to reopen the ticket.
SECTION The constraint (C1): The late-sync watch is in-process, in-memory ONLY — the actions Map (control.js:41) and the setInterval pollTimer (control.js:154), pruned at watchUntil (control.js:166-167). A pod restart inside the ~10-min lateSyncWatchMs window (config.js:115) silently drops the watch, leaves the audit uncorrected, and no late alert EVER fires. The design must not assume durability.
SECTION The decision: Lean on the DURABLE record that already survives — the Zendesk ticket. Make the late-sync ticket note the source of truth for cross-shift (it is already written, control.js:184), strengthen it from a background footnote to an actionable operator-visible update, and add a best-effort in-session surface for a handler still on the tracker (the client already polls its own action every 2s and already handles 'late-synced', public/js/control.js:154,157). Explicitly DO NOT claim the in-memory watch is reliable; specify Cosmos persistence of in-flight actions as the durable proof obligation and DEFER it.
SECTION Durability honesty: In-session alert = ephemeral (best-effort, lost on restart or after the handler closes). Ticket note = durable (survives restart IF the echo is still observed; but the watch that OBSERVES the echo is itself in-memory, so a restart mid-window means no note is ever written). This asymmetry is stated plainly; the only true fix is persisting in-flight actions so the watch resumes — deferred with a proof obligation.
SECTION Tests: late echo with tracker still open flips it to an applied/late banner; late echo after the handler escalated still writes the strengthened ticket note; audit corrected to synced with late marker; restart-drops-watch is asserted as a KNOWN gap test (no note fires) not a passing behaviour.
SECTION Conditions: C6 (primary — active alert), C1 (primary — durability limit). Boundaries only: R11/C7 (90s/10min horizons), C4 (freshness). Relationship to the audit-trail-correctness invariant noted.
DECISION late-sync-alert-approach: Surface the 'late-synced' transition on TWO channels with honestly-different durability. (1) DURABLE / cross-shift: the Zendesk ticket note (control.js:184), promoted from a background footnote to an actionable "change DID apply late — verify with caller / next shift" update; the ticket is the source of truth because it is the only artefact that survives a pod restart. (2) EPHEMERAL / in-session: the client already polls its own action every 2s and already renders 'late-synced' as done (public/js/control.js:154,157) — extend it to show a distinct "applied LATE (after we said not-applied)" banner, but only for a handler still on the tracker; this is best-effort and is lost on restart or once the tracker is closed.
DECISION c1-durability: State plainly that the late-sync watch is in-memory only (actions Map control.js:41 + setInterval control.js:154, pruned at watchUntil control.js:166-167) and a pod restart in the ~10-min window silently drops it — no note, no correction, no alert. The alert design leans on the durable ticket AS FAR AS the in-memory watch lets it, and does NOT claim durability the code lacks. The true fix — persist in-flight actions to Cosmos so the watch resumes after restart — is specified as the proof obligation for C1 and DEFERRED (out of this artefact's build scope; owned at Design→Build).
-->

# Design — late-sync active handler alert (C6) under the in-memory watch constraint (C1)

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Conditions:** C6 (primary), C1 (hard constraint) · **Date:** 2026-09-15
**Repo state (verified):** `origin/main`. The `late-synced` transition and its ticket note live in `services/control.js`; the client self-poll in `public/js/control.js`.
**Scope:** exactly one thing — an active in-session (and cross-shift) signal for a device that echoes its change AFTER the 90s confirm timeout. **Nothing else.** The 90s / 10-min horizons (R11/C7) and dispatch-time freshness (C4) are BOUNDARIES referenced here, not redesigned; they own their own artefacts. Carried conditions live in `RELEASE_CONDITIONS_REGISTER.md`; this design references rows by ID.
**Method:** every code claim verified firsthand against `origin/main`, cited to `file:line`.

---

## 1. The current late-sync path (verified)

An action starts `pending` with two in-memory horizons stamped at dispatch:

- `deadline = Date.now() + config.control.syncTimeoutMs` (`control.js:109`) — the 90s handler-decision horizon (`syncTimeoutMs` default 90000, `config.js:114`).
- `watchUntil = Date.now() + config.control.lateSyncWatchMs` (`control.js:110`) — the ~10-min late-echo watch (`lateSyncWatchMs` default 600000, `config.js:115`).

The action record is put into a **module-level `Map`** — `const actions = new Map()` with the comment "per-replica in-memory; durable trail lives in OohAuditLog" (`control.js:41`). A single **`setInterval`** poller, `pollTimer = setInterval(pollAll, ...)` (`control.js:154`), sweeps every `syncPollIntervalMs` (3s, `config.js:113`) and calls `pollOne` for each `pending`/`timeout` action (`control.js:160-164`).

`pollOne` is where `late-synced` is set. When a device that had already gone to `timeout` finally echoes (`sync === 'synced'` and the reported value matches):

```
const wasTimeout = a.state === 'timeout';
a.state = wasTimeout ? 'late-synced' : 'synced';          // control.js:180
a.settledAt = ...; a.reported = reported;
await audit.updateOutcome(a.auditId, 'synced', wasTimeout ? `late device confirmation at ...` : null);  // control.js:181
recordControlEvent('synced');
if (wasTimeout && a.ticketId) {
    await addLateSyncNote(a.ticketId, a).catch(...);       // control.js:183-185
}
```

So the **only two outputs** of a late sync today are:

1. **The audit correction** — `audit.updateOutcome(...'synced', 'late device confirmation at ...')` (`control.js:181`). Durable (Cosmos `OohAuditLog`). This is the audit-trail-correctness invariant: a timed-out action that later applied MUST be corrected from `timeout` to `synced`, else the trail lies.
2. **A Zendesk ticket internal note** — `addLateSyncNote(a.ticketId, a)` (`control.js:184`), but **only if `a.ticketId` is set**. The note body is a background footnote: `"[TRG] Late device confirmation: … synced at … (was reported as timed out). Treat the change as applied."` (`zendesk.js:206-209`). `ticketId` is attached via `control.attachTicket(actionId, ticket.id)` (`control.js:142-145`, wired at `api.js:238`) — i.e. only if the handler created an outcome/escalation ticket for that action. No ticket → no note.

**There is no active in-session signal.** The client self-poll DOES already handle the transition — `startCtlPolling` GETs `/api/control/actions/:id` every 2s and, on `['synced','late-synced']`, sets phase `done` and stops (`public/js/control.js:154,157`). **But** that timer only runs while the tracker modal is live. On the `timeout` screen the handler's realistic actions are **Escalate**, **Done**, or **Cancel** — every one of them calls `clearInterval(ctlPollTimer)` and most null `window.ctl` (`public/js/control.js:176` retry, `183` cancel, `190`/`197` finish; escalate closes the tracker likewise). Once that happens, a `late-synced` that lands 3 minutes later reaches **nobody in-session** — only the ticket note (if any) records it, and only the next handler who happens to reopen the ticket ever sees it.

**Gap (C6):** the handler was told "not applied — we'll keep watching in the background" (the `sync-timeout` copy, `public/js/control.js:118`), the device then DID apply it, and nobody is *actively* told. Cross-shift, the next handler on that site/ticket has no push either.

---

## 2. The C1 durability limit — stated plainly

The watch that produces the late alert is **in-process, in-memory, single-replica, and non-durable**:

- the in-flight action set is the module `Map` at `control.js:41` — lost on process exit;
- the watcher is the `setInterval` at `control.js:154` — lost on process exit;
- settled/expired actions are pruned at `watchUntil` inside `pollAll` (`control.js:166-167`), and when the Map empties the interval is cleared (`control.js:169`).

**Therefore: a pod restart at any point in the ~10-min `lateSyncWatchMs` window silently drops the watch.** The action record is gone, the poller is gone, so the late echo is never observed, `late-synced` is never set, **the audit is never corrected, and no ticket note and no alert ever fire.** At `replicas: 1` (the deployment posture referenced by the /healthz design) there is no second replica still holding the Map either. This is a real correctness hole in the audit trail, not merely a missed nicety.

**No part of this design can pretend otherwise.** What survives a restart is only what was **already written to a durable store before the restart**: the audit entry (as `timeout`, uncorrected) and any Zendesk note already posted. What does not survive: the in-flight `actions` Map and the poller that would have posted the note. So the durable ticket can only carry the late-sync truth *if the in-memory watch lived long enough to write it*.

---

## 3. Design decision — two channels, honestly-different durability

Surface the `late-synced` transition on two channels, and be explicit about which is durable.

### 3a. DURABLE / cross-shift — the Zendesk ticket note (source of truth)

The ticket note (`control.js:184`; `zendesk.js:206-209`) is the **only artefact that survives a pod restart**, so it is the source of truth for the cross-shift signal. Two changes, both small:

- **Promote the note from footnote to actionable update.** Reword `addLateSyncNote` (`zendesk.js:206-209`) so it reads as an operator action item, not a log line: it must say the change *was previously reported NOT applied to the caller*, that it *has now applied late*, name the site/device/value/time, and instruct the next handler to **verify with the caller / confirm the site is now correct**. This is what the next shift keys off. Also raise its visibility if the note channel supports it (public-to-agents internal comment already; consider a tag/marker the OOH view can filter on — a follow-up, not required for this artefact).
- **Widen when a note is written.** Today a note fires only if `a.ticketId` is set (`control.js:183`), i.e. only if a ticket was already created for that action. A timed-out action that the handler *escalated* will have one (via `api.js:238`); but a timed-out action the handler simply closed may not. Design position: the late-sync ticket note is the durable backbone of C6, so **every action that reaches `timeout` should have a ticket to receive the late note.** Confirm whether the timeout/escalate path already guarantees a ticket; if not, ensuring a ticket exists at `timeout` (so the late note has somewhere durable to land) is the recommended change. This keeps the cross-shift signal durable rather than dependent on whether the handler happened to escalate.

### 3b. EPHEMERAL / in-session — extend the existing self-poll

The client **already** polls its own action every 2s and already treats `late-synced` as `done` (`public/js/control.js:147-159`). For a handler **still on the tracker**, extend the render so `late-synced` shows a **distinct banner** — not the same "✅ Applied" as a normal sync, but "⚠️→✅ **Applied LATE** — this change was reported as *not applied*, but the device has now confirmed it. Tell the caller it is now done, and check nothing was actioned twice." (Ties to the C2 double-dispatch caution, referenced only.) This reuses the `['synced','late-synced']` branch at `public/js/control.js:154`; it needs a phase distinct from `done` (e.g. `done-late`) so the copy differs.

**This channel is best-effort and ephemeral by construction.** It only reaches a handler whose tracker is still open and whose page/pod has not restarted. The moment the handler clicks Escalate/Done/Cancel (`public/js/control.js:176,183,190,197`) the timer is gone and this channel is dead. It is a courtesy for the common "handler still watching when the slow IT700 finally echoes" case — **it is not, and must not be presented as, a guarantee.** The durable guarantee is 3a's ticket note, within the C1 limit below.

### 3c. C1 — the durable mechanism, specified and DEFERRED

Both 3a and 3b still sit on top of the in-memory watch: if the pod restarts mid-window the echo is never observed and **neither** channel fires. The only true fix is to make the in-flight action set durable so the watch can resume after a restart:

- **Persist in-flight actions to Cosmos.** On dispatch, write the action record (or the minimal watch fields: `actionId`, `_device` identity, `attribute`, `value`, `auditId`, `ticketId`, `deadline`, `watchUntil`, `state`) to a durable collection. On startup, **rehydrate** any non-settled actions still inside `watchUntil` back into the `actions` Map and re-arm the poller. Prune on settle/expiry. This makes the late-sync watch survive a pod roll, so the audit gets corrected and the ticket note fires even across a restart.
- This is **out of scope for this artefact's build** and is the **proof obligation for C1**: it is owned at Design→Build, and until it lands the register row for C1 stays OPEN. Until then, the honest statement to operators is: *"the background late-sync watch is best-effort and can be lost if the service restarts; the ticket is updated only if the watch was still running when the device echoed."*

**Boundary:** the 90s decision horizon and the 10-min watch horizon themselves (`syncTimeoutMs` / `lateSyncWatchMs`, `config.js:114-115`) are tuned/justified under **R11/C7** in the confirm-loop artefact — not here. Dispatch-time freshness of the resolved site (**C4**) is likewise a boundary. This design only decides how the `late-synced` *transition is surfaced*, and how honest we are about its durability.

---

## 4. Code surface

<table>
<thead><tr><th>File</th><th>Change</th></tr></thead>
<tbody>
<tr><td><code>services/zendesk.js</code></td><td>Reword <code>addLateSyncNote</code> (`:206-209`) from a background footnote to an actionable operator update (previously-reported-not-applied → now applied late → verify with caller). Optionally add a filterable marker/tag for the OOH view.</td></tr>
<tr><td><code>services/control.js</code></td><td>Ensure a timed-out action has a ticket so the late note (`:183-185`) has a durable target; keep the audit correction (`:181`). No change to the `late-synced` set (`:180`) itself. Add the durable-persistence hooks ONLY when C1's Cosmos fix is scheduled (dispatch-time write near `:110`, startup rehydrate near `ensurePolling`/`:152-157`) — DEFERRED, not built here.</td></tr>
<tr><td><code>public/js/control.js</code></td><td>Split the <code>late-synced</code> render from normal <code>synced</code>: a distinct <code>done-late</code> phase/banner at the existing branch (`:154,157`) so a handler still on the tracker sees "applied LATE (after we said not-applied)". Ephemeral by design.</td></tr>
<tr><td><em>(deferred)</em> Cosmos in-flight actions store</td><td>The durable watch-resume mechanism for C1 — proof obligation, not built in this artefact.</td></tr>
</tbody>
</table>

---

## 5. Proving tests (design)

1. **In-session late banner (ephemeral, happy path).** Dispatch → `timeout` with the tracker still open → device echoes late → poll returns `late-synced` → client shows the distinct **applied-LATE** banner (not a plain "Applied"), phase `done-late`. (`public/js/control.js:154,157`.)
2. **Cross-shift durable note after escalate.** Dispatch → `timeout` → handler **escalates** (ticket created, `api.js:238`) and closes the tracker → device echoes late → assert the **reworded, actionable** ticket note is posted to `a.ticketId` (`control.js:184`; `zendesk.js:206-209`) even though no session is watching.
3. **Audit corrected.** After a late echo, assert `audit.updateOutcome(auditId,'synced','late device confirmation …')` ran (`control.js:181`) — the timeout row is corrected to synced-late. (Audit-trail-correctness invariant.)
4. **Note target guaranteed at timeout.** Assert an action that reaches `timeout` has (or is given) a `ticketId`, so the late note is never silently dropped for lack of a target.
5. **C1 known-gap test (asserts the LIMIT, not a fix).** Dispatch → `timeout` → **simulate pod restart** (drop the `actions` Map and `pollTimer`) → device echoes late → assert **no note, no audit correction, no alert** fires. This test documents the durability hole as a KNOWN, expected gap under the current in-memory design; it flips to the opposite assertion only once the C1 Cosmos-persistence fix lands. Do not mark this behaviour as "passing" — it is the proof that C1 is still open.

---

## 6. Conditions referenced

- **C6 (primary)** — active late-sync handler alert. This design provides it on two channels: a durable, actionable cross-shift ticket note (source of truth) and a best-effort in-session banner. Does not close C6 until built and until C1's durability is addressed.
- **C1 (primary constraint)** — the in-memory, non-durable watch. Confronted head-on in §2 and §3c: the design leans on the durable ticket as far as the in-memory watch allows, states the restart hole plainly, and specifies Cosmos persistence of in-flight actions as the **DEFERRED proof obligation**. C1 stays OPEN until that lands.
- **R11 / C7 (boundary)** — the 90s decision horizon and 10-min watch horizon are tuned in the confirm-loop artefact; referenced, not redesigned.
- **C4 (boundary)** — dispatch-time site freshness; referenced, not redesigned.
- **C2 (touched only)** — the in-session late banner reminds the handler to check nothing was actioned twice; C2 is a pre-flip write-safety property tracked in the register, not closed here.
- **Audit-trail-correctness invariant** — a timed-out-then-applied action must be corrected to synced (`control.js:181`); C1's restart hole breaks this invariant, which is precisely why C1 is a correctness concern and not cosmetic.

---

*All line numbers cited against `origin/main`, 2026-09-15, verified firsthand for this artefact: `services/control.js:41,109-110,142-145,152-157,160-169,180-185`; `services/zendesk.js:206-209`; `public/js/control.js:147-159,176,183,190,197`; `config.js:113-115`; `routes/api.js:238`. This artefact decides the late-sync alert approach and states the C1 durability limit honestly; it does not invoke gates, open a PR, commit, or flip anything.*
