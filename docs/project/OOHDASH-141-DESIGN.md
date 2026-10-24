<!--
gate:contract
TICKET: OOHDASH-141
PHASE: design
QUESTIONS:
Q1: James -- the design ships the boost dark (three flags, all off) and turns it on one site at a time after the supervised test on that site. The Heat ON path has its own flag that stays off until the supervised test answers Q3 (does the boiler need its own "on" command). Is that the rollout you want?
Q2: James -- discovery said the revert should compare an exact "footprint" value to tell OOH's boost from an engineer's. Live data today shows V1 panels rewrite that value every ~6 minutes, so the exact-value check would wrongly skip almost every V1 revert. The design replaces it with a direction check (section 6). Please confirm you are happy with that change.
SECTION: What we are building
When a caller says the pub is too cold or too hot, the agent can force a pub heating zone ON or OFF at the boiler panel for a fixed time, without touching the schedule. ON choices are 30 min, 1 h and 2 h. OFF choices are 1 h, 2 h and until 07:00. No boost can start between 01:00 and 07:00, and an ON boost is cut short so it ends by 01:00. Every boost opens a Zendesk ticket for the IoT team. When the time is up, OOH puts the zone back to automatic (the panel's own timetable). This uses the existing timed-hold store and revert worker. It adds a direct RPC command for V2 panels and a direct shared-attribute write for V1 panels.
SECTION: What changed since discovery (checked live, read-only)
Four findings change the discovery plan. 1) V1 panels rewrite the zone override value every ~6 minutes as "now + 15 minutes", so an exact-value footprint cannot identify OOH's boost. The design uses the direction (on, off or auto) instead, plus the time the shared attribute was written. 2) The date library discovery named (date-fns-tz) is not in the repo. The clamp uses the built-in Intl time-zone support, like services/schedule.js, so there is no new dependency. 3) On the October clock-change night, discovery picked the second 01:00. That gives an extra hour of heating, so it is not the safe choice. The design stops at the first 01:00. 4) OOHDASH-139 is already built and released (v1.4.7), so the dependency is met.
SECTION: Safety rules built into the code
Three rules always apply. First, the clamp is checked on the server at dispatch for both ON and OFF, so the browser cannot get round it. Second, the revert only ever sets the zone back to automatic. It never restores an earlier forced state and never touches a schedule key. Third, revert to automatic goes through its own narrow path, which can send only "auto" to a pub zone. That is what allows it to run during a kill-switch (decision below). Every boost, revert and skipped revert is written to the audit log and the Zendesk ticket.
SECTION: When someone else has overridden the zone
Before sending, OOH reads the zone. If it is already forced, the operator sees "Pub zone 1 is already forced ON until 22:00 (set at the panel or by an engineer)" and must confirm before OOH proceeds, as you decided. At revert time OOH reads the zone again. If it is back on automatic, there is nothing to do. If someone has forced it the opposite way, OOH leaves it alone and adds a note to the ticket. If it is still forced the way OOH set it, OOH sets it back to automatic. The one judgement call is in the decision below: on V1, if someone else has re-applied the same OFF since OOH did.
SECTION: If OOH is down or the revert fails
The revert worker starts when the server boots, so a hold that fell due while a pod restarted is reverted straight away. A failed boiler revert is retried every 5 minutes for up to 12 hours. Going back to automatic is safe to repeat. If a revert of an ON boost happens after 01:00, the ticket is noted with how late it was, so a missed cutoff is never silent. There is still a gap: on V1, if OOH is down for a long time, nothing at the panel turns the boost off. You accepted the morning IoT ticket as cover for now. The ticket is opened when the boost is sent, so it exists even if every revert fails. V2 panels end a boost themselves at the next timetable change. If the supervised test proves V2 accepts a duration (Q2 from discovery), the design also sends the duration so the panel ends the boost itself.
SECTION: Expected volume
Over the last month there were about 39 OOH heating-related tickets across all device types, and only a handful were pub boiler-panel calls. We expect a few boosts a week, so one ticket per boost stays a useful signal for the IoT team. Boost tickets carry the tag ooh_boost so the team can filter and count them. If boosts become routine at one site, that is the signal that the site needs a proper fix.
DECISION: Kill-switch and safety reverts | Revert-to-auto runs even when the runtime kill-switch or WRITES_DISABLED is on (recommended) | Revert-to-auto ignores the runtime kill-switch but still obeys WRITES_DISABLED | No exemption: a blocked revert waits and raises an alert (today's behaviour)
DETAIL: Today a kill-switch blocks every write, including reverts. If someone pulls the kill-switch at 23:30 during a 2-hour ON boost, the zone would stay forced on past 01:00 on V1. The exemption covers only "set this pub zone back to automatic" for a boost OOH itself started. New boosts are still fully blocked.
DECISION: V1 revert when someone else has re-applied the same OFF | Leave it off and alert the IoT team (recommended) | Set it back to automatic anyway
DETAIL: On V1 OOH can tell that someone else rewrote the override since OOH's boost, even when they set the same value. For an ON boost OOH always reverts, because heating must stop by 01:00. For an OFF boost, someone forcing it off again may mean an engineer wants it off on purpose (for example a leak). Leaving it off is cold but safe. V2 cannot tell this apart, so V2 always reverts.
DECISION: Where to offer the boost | W5 and W6 (Heat ON), W8 (Heat OFF), and W3 for the zone that is off (recommended) | Only W5, W6 and W8 as in discovery
DETAIL: W3 is "part of the pub heating is off". A Heat ON boost on just the off zone is the obvious fix for a cold caller. W2 (boiler asked for heat, all zones on) is a boiler-side fault, so it never offers a boost.
-->

# OOHDASH-141 Design: pub heating boost (timed ON/OFF at the boiler panel)

**Date:** 2026-10-24 · **Phase:** design · **Discovery:** PR #137 (merged 166bd23) · **Depends on:** OOHDASH-139 (built and released, v1.4.7) and OOHDASH-143 (string decode, design merged)

## 1. Summary

The agent gets a **Heat ON** or **Heat OFF** action on the pub boiler panel's Bar/Restaurant outcome. It forces one or both pub zones on or off for a fixed time, then OOH sets the zone back to **auto**. Auto is the panel's own timetable. Nothing ever writes a schedule key.

- **V2 panels** (tag `boilercontrol_v2`): one-way RPC `POST /api/rpc/oneway/{uuid}` with `{ method: 'override', params: 'CHZn <1|-1|0>' }`.
- **V1 panels** (tag `boilercontrol`): SHARED_SCOPE write `output2Override` (zone 1) or `output3Override` (zone 2), with value `1`, `-1` or `0`.
- The **01:00 / 07:00 Europe/London** rule (D2) is enforced on the server at dispatch, and the OOH revert worker is the guarantor of the end time.
- Every boost opens a **Zendesk ticket** (tag `ooh_boost`). Revert outcomes are added to it as notes.
- The feature ships **dark** behind flags and is turned on site by site after the supervised test (§10).

## 2. Decisions already made

| Ref | Decision | Answer (PR #137) |
|---|---|---|
| James-1 | Heat ON durations | 30 min, 1 h, 2 h |
| James-2 | Heat OFF durations | 1 h, 2 h, until 07:00 |
| James-3 | Heat OFF time restriction | Option B: refuse between 01:00 and 07:00 |
| James-4 | Existing engineer override | Warn the operator and let them proceed |
| James-5 | Overnight revert-failed | Morning IoT ticket acceptable for now |
| D1 | Dispatch route | Direct to the panel (RPC for V2, SHARED_SCOPE for V1); no Spencer rule chain |
| D2 | 01:00 / 07:00 | Enforced at dispatch for ON and OFF; the OOH revert worker is the guarantor |
| D3 | Order | 139 (read-only view) ships first. **Met:** 139 is in v1.4.7 |

## 3. New evidence gathered at design (read-only)

| # | Finding | Verdict | Evidence | Design consequence |
|---|---|---|---|---|
| E1 | V1 `outputNOverride` **telemetry** is a rolling heartbeat | **PROVEN** | 6863 on 2026-10-24: a new sample every ~5–6 min, each `now+15 min`, until it was cleared at 08:51. 6811 behaves the same | An exact-value telemetry footprint changes every 6 minutes. Identity uses **direction**, plus the SHARED_SCOPE attribute `lastUpdateTs` (§6) |
| E2 | The TB dashboard writes the V1 override **attributes as a set** | **PROVEN** | 6811: `output1/2/3Override` share one `lastUpdateTs` (10:11:01.455Z). 6863: same (08:50:41.301Z) | An engineer touching zone 2 also bumps the zone 1 attribute's ts. A changed ts alone does not mean "zone 1 re-forced", so value and ts are used together (§6) |
| E3 | `date-fns-tz` is not a dependency | **PROVEN** | `package.json` dependencies: cosmos, identity, axios, dotenv, express, express-rate-limit, express-session, jose | The clamp uses Intl through the existing `getLocalParts`/`buildCandidateUtc` in `services/schedule.js` (exported for reuse). No new dependency |
| E4 | Fall-back night: discovery chose the **later** 01:00 | **Corrected** | Late October: 01:00 BST is 00:00Z, then 01:00 GMT is 01:00Z. The later one allows one extra real hour of heating | The ceiling is the **first instant the local clock reads ≥ 01:00** (§5). That is 00:00Z on fall-back night and 01:00Z (02:00 BST) on spring-forward night |
| E5 | The revert worker starts at boot | **PROVEN** | `server.js:144 startWorker()` | Holds that fell due during an outage revert on the next boot |
| E6 | Alerts are in-memory only | **PROVEN** | `services/metrics.js` `alerts` Map | Alerts are lost on restart. The **durable** records are the Cosmos hold status and the Zendesk ticket, so every safety-relevant event is written to the ticket |
| E7 | Expected volume | DEDUCED | Zendesk `tags:ooh` heating-related tickets 2026-09-24 → 10-24: 39 in total, a handful at boiler panels (e.g. 6811 "Pub heating is off at the controls", 6856 "Heating boost") | A few boosts a week. One ticket per boost stays meaningful |
| E8 | 139 dependency | **PROVEN** | `decodeBoilerHeating` (`tb-device.js:1313`), `boilerHeatingOutcome` (`flows.js:693`), tag `v1.4.7` | D3 is met. 143's string-bool fix must be in the same or an earlier release than 141 (§11) |

## 4. Code changes

### A. `services/tb-client.js`: four functions

| Function | Behaviour |
|---|---|
| `dispatchBoilerRpc(device, zone, n, durationMin = null)` | `zone` must be in `BOILER_RPC_ZONES = ['CHZ1','CHZ2']`, else it throws. `n` must be in `{1,-1}`, else it throws. Builds `params` from those allow-listed values only. Appends ` <durationMin>` only when `config.boilerBoost.v2DurationToken` is true (set only after the supervised test proves Q2). Honours `WRITES_DISABLED` (423 before any POST). Fixture mode simulates it. An HTTP error is thrown with `{ delivery: 'rejected' }` for a 4xx, or `{ delivery: 'unknown' }` for a timeout or 5xx. Returns `{ sentAtMs: Date.now() }`, which is only used for audit. Freshness uses the server-domain sample ts (§C). |
| `writeSharedScopeAttribute(device, attribute, value)` | Rejects any `attribute` not in `BOILER_SHARED_KEYS = ['output2Override','output3Override']` (plus `output1Override` only if Q3 needs it, §8). Rejects any `value` not in `{1,-1,0}`. Both checks run **inside** the function. Honours `WRITES_DISABLED`. After the POST, reads back the attribute's `lastUpdateTs` (server clock), like `writeServerScopeAttribute`, and returns `{ attrTs }`. |
| `revertBoilerZoneToAuto(device, version, zone)` | The **only** write that may run under the kill-switch exemption (decision 1). Value is hard-coded `0`. `zone` must be `CHZ1` or `CHZ2`. V2 sends `CHZn 0`. V1 writes the mapped `outputNOverride = 0`. It does not call the `WRITES_DISABLED` guard when `config.boilerBoost.revertExempt` covers it (decision 1 picks the setting). Every call is logged `[BOILER-REVERT-EXEMPT]`. |
| `readBoilerState(device, version, zones)` | One timeseries GET (latest values plus sample ts) and, for V1, one SHARED_SCOPE GET. Returns one entry per zone: `{ zone, dir: 1\|-1\|0, overrideRaw, overrideTs, outputState, outputStateTs, forcedUntilMs, attrValue, attrTs }`. `dir` is the override sign, parsed with the 143 string-tolerant rules (`'-1792…'` gives -1). `forcedUntilMs` is V2 only (seconds ×1000). `attrValue`/`attrTs` are V1 only. Also returns `boiler: { enableState, ts }` (V2 `boiler.enable_output_state`, V1 `output1State`). |

### B. `services/registry.js`

- `REGISTRY['boiler-panel'].commands` becomes `['boost-on', 'boost-off']`. Add `boostMenu: { on: [30, 60, 120], off: [60, 120, 'until-0700'] }`.
- Remove `'boiler-panel'` from `MONITOR_ONLY`. Add `CONTROL_CONTRACT['boiler-panel']`: `{ requestedKey: null, scope: 'DIRECT', statusKey: null, errorKey: null, confirmKeys: [], controllable: true, direct: true, timingClass: 'boiler-panel' }`. `REQUESTED_KEYS` is unaffected because `requestedKey` is null and filtered out. `writeServerScopeAttribute` can therefore never write to a panel.
- `validateCommand(device, 'boost-on'|'boost-off', { zone, durationKey })`:
  - zone must be `CHZ1` or `CHZ2`;
  - the zone must be configured, read from `device.heating.zones` (139 decoder);
  - `durationKey` must be in the menu for that direction.
  - Returns `{ ok, zone, n: ±1, durationKey, panelVersion, attribute }`. For V1, `attribute` comes from `v1ZoneMap(device)`; for V2 it is `null`.
- `v1ZoneMap(device)`: the default is `{ CHZ1: 'output2Override', CHZ2: 'output3Override' }`. A per-site override comes from `config.boilerBoost.v1ZoneMap[siteNo]`, filled in only after the supervised test proves the wiring.
- `config.control.classes['boiler-panel']`: `{ confirmLimitMs: 5000 (V2) / 2000 (V1) via confirmLimitMsV1, confirmPollMs: 500, lateWatchMs: 180000, copyMinutes: null, offlineHours: 48 }`. All values are env-tunable. The validator rule `copyMinutes*60000 <= confirmLimitMs` passes with `null`.

### C. `services/control.js`: `dispatchBoilerBoost()`

`dispatchBoilerBoost({ operator, confirmToken, siteNo, deviceId, zones, direction, durationKey, acknowledgedWarnings, callerWords })`. `zones` holds one or two values.

1. **F004** consume the token. **F016** `killswitch.writesBlocked(siteNo)`. **Flags:** `boilerBoost.enabled`, `siteNo` in `boilerBoost.sites`, and for ON also `boilerBoost.onEnabled`. Otherwise 423 with a plain reason.
2. Resolve the site and device. It must be `boiler-panel`, online, have `hasPublishedState`, and its 139 `heating` must not be stale.
3. **Clamp** `clampBoostWindow(now, direction, durationKey)` (§5). A refusal returns 422 with the operator text.
4. **F009** `validateCommand` for each zone.
5. **Pre-read** `readBoilerState`. This gives the baseline `overrideTs` and `attrTs` per zone, and `previousDir` for the audit. If any zone has `dir !== 0` and `!acknowledgedWarnings`, return **409 `{ warnings: [...] }`** with no write. The UI shows the warning and resends with `acknowledgedWarnings: true` (James-4).
6. **Dispatch** each zone in turn: V2 with `dispatchBoilerRpc`, V1 with `writeSharedScopeAttribute`. Record the audit row (`actionType: 'boiler-boost-on'|'boiler-boost-off'`).
7. **Confirm poll.** Poll every 500 ms up to the limit (V2 5 s, V1 2 s). All timestamps are **server-domain** TB sample timestamps, compared against the **pre-read baseline**, never against the local clock.
   - V2 CONFIRMED: a new `CHZn.override` sample (`overrideTs > baseline.overrideTs`) with `dir === n`, and the latest `outputState` agrees (on for +1, off for −1).
   - V1 CONFIRMED: an `outputNOverride` sample with `overrideTs > attrTs` (our write) and `dir === n`, and the latest `outputState` agrees.
   - `outputState` is checked on its latest value, not for freshness, because state keys report on change only (139 E-table).
8. **Outcomes** for each zone:
   - **CONFIRMED** schedules the hold.
   - **NON-DELIVERY** means the RPC or write got a 4xx (`delivery: 'rejected'`). No hold is scheduled, because nothing landed. Raise alert `boost-non-delivery`.
   - **IN-FLIGHT-TIMEOUT** covers a timeout, a 5xx, or no confirming sample by the limit. The hold is **still scheduled**. Raise alert `boost-unverified`. The ticket says "not confirmed by the panel".
9. **Ticket.** Call `createBoostTicket(...)` synchronously after the outcomes and before returning (§7). If it fails, raise alert `boost-ticket-failed`. Holds are already scheduled, so the safety revert never depends on Zendesk.
10. Register a **terminal** action in the `actions` map with `ticketId` and `overrideIds`, so the operator's outcome capture adds to this ticket (§7).

`scheduleOverride` is called before the ticket, and it is called on both CONFIRMED and IN-FLIGHT-TIMEOUT.

### D. `services/boost-window.js` (new, pure): `clampBoostWindow`

See §5. It exports `clampBoostWindow(nowMs, direction, durationKey, tz = 'Europe/London')` and returns one of:

- `{ ok: true, revertAtMs, requestedMin, effectiveMin, clamped }`
- `{ ok: false, code, message }`

### E. `services/overrides.js`: boiler branch

The `revert(col, doc)` function branches **first** on `doc.deviceType === 'boiler-panel'` into `revertBoiler(col, doc)`. The Salus/Tuya path is unchanged. See §6.

### F. Cosmos `OohOverrides` record: new fields

`scheduleOverride` copies these when present. Existing fields are unchanged.

| Field | Value |
|---|---|
| `deviceType` | `'boiler-panel'` (already stored) |
| `panelVersion` | `'v1'` or `'v2'` |
| `boilerZone` | `'CHZ1'` or `'CHZ2'`. This is a **new** field because the existing `zone` field holds the area name |
| `attribute` | V1 `output2Override`/`output3Override`. V2 `CHZ1.override`/`CHZ2.override`, which is a label only and gives a supersede key per zone |
| `heldValue` / `revertValue` | `±1` / **always `0`** (auto). It is never inherited from an earlier forced state |
| `direction` | `'on'` or `'off'` |
| `footprint` | `{ attrTs (V1, server ts of OOH's write) \| null, overrideRaw \| null, confirmed: bool }` |
| `d2CeilingAtMs` | for ON, the 01:00 ceiling used. Late-revert notes measure against it |
| `clampedFromMin` | the requested minutes if the boost was clamped, else null |
| `revertAttempts`, `lastRevertAttemptAt` | the bounded retry counter (§6) |

Because `revertValue` is always `0`, the existing "inherit the original" supersede logic in `scheduleOverride` is harmless for boiler holds. A second boost on the same zone supersedes the first, and only one revert is pending.

### G. Route and UI

- **`POST /api/boiler-boost`** in `routes/api.js` uses the existing session auth (router-level), passes the body to `dispatchBoilerBoost`, and returns `{ action }`, or `409 { warnings }` / `422` / `423`. Add **`GET /api/boiler-boost/preview?siteNo&deviceId&direction&durationKey`**, which runs the pure clamp only. The button text can then show "ends 01:00 (cut from 2 h)" before the operator presses it. It makes no TB read and no write.
- **`/outcomes`** gets one change. If `action.ticketId` is already set (a boost), it adds the transcript as an internal note to that ticket with `addBoostOutcomeNote`, instead of creating a second ticket.
- **`public/js/flows.js`**: `boilerHeatingOutcome` actions gain boost buttons, depending on decision 3.
  - W5 and W6 (and W3 for the off zone): **Heat ON** for 30 min, 1 h or 2 h. You choose the zone (zone 1, zone 2, or both, offering only configured zones).
  - W8: **Heat OFF** for 1 h, 2 h or until 07:00.
  - Buttons are shown only when the server flags allow it. `/api/site` exposes `boostAvailable: { on, off }` for each panel.
  - Results:
    - CONFIRMED: "Pub zone 1 heating is ON until 22:30. The IoT team has a ticket to check it tomorrow."
    - Unverified: "Sent, but the panel hasn't confirmed yet. It will be put back to automatic at 22:30 either way."
    - Clamped: "Cut to 30 min: pub heating must stop at 01:00."
    - Refused: the §5 text.
- New copy follows the 139 tone. The build shows it to James in the test-gate mockup.

## 5. The 01:00 / 07:00 clamp

**The ceiling** is computed as follows. For the local night in question, the ceiling `C` is the **earliest UTC instant whose Europe/London wall clock reads ≥ 01:00** on that local date. There are two candidates (`01:00 local − 1 h` and `01:00 local − 0 h`), each checked with `getLocalParts`, and the earliest that passes is chosen:

| Night | C (UTC) | Local reading |
|---|---|---|
| Winter (GMT) | 01:00Z | 01:00 GMT |
| Summer (BST) | 00:00Z | 01:00 BST |
| Spring-forward (late March) | 01:00Z | 02:00 BST, since 01:00 does not exist |
| Fall-back (late October) | **00:00Z** | the **first** 01:00 (BST), the conservative choice (corrects discovery, E4) |

The **morning edge** `M` is the earliest instant whose local clock reads ≥ 07:00. This is never ambiguous.

The rules, with `now` converted to local time:

| Local time now | Heat ON | Heat OFF |
|---|---|---|
| 01:00 ≤ t < 07:00 | **Refuse**: "Heating boosts can't start between 01:00 and 07:00. The IoT team will pick this up in the morning." | **Refuse** (Option B), same text |
| otherwise | `revertAt = min(now + d, next C)`. If clamped and `revertAt − now < 15 min`: **refuse**, "Only N minutes left before the 01:00 cut-off — boost not sent." | `revertAt = now + d`. For `until-0700`, `revertAt = next M` |

- "Next C" is the next ceiling after `now`. Before midnight that is tomorrow's local date; between 00:00 and 01:00 it is today's.
- With Option B an OFF boost never starts inside the window. A 2 h OFF at 23:30 runs to 01:30, which is allowed, because forcing heat off never makes heating run.
- `until-0700` at 22:00 runs to 07:00, about 9 h. That is the explicit overnight choice.
- **Tests** (unit, pure). Every row above, plus:
  - 23:30 ON 2 h is clamped to 30 min;
  - 00:50 ON 30 min is refused (10 min);
  - 00:40 ON 1 h is clamped to 20 min;
  - 06:59 refused, 07:00 allowed;
  - spring-forward 2027-03-28: 00:30 GMT ON 2 h ends at 01:00Z;
  - fall-back 2026-10-25: 00:30 BST ON 2 h ends at 00:00Z, and 01:30 GMT (second pass) is refused;
  - `until-0700` across both transitions.

## 6. Revert (`revertBoiler`)

1. **Kill-switch.** Decision 1 sets this. Under the recommended option the worker does **not** bounce the doc. It writes the audit line "revert executed under kill-switch exemption (reason …)" and uses `revertBoilerZoneToAuto`. Under the "no exemption" option today's bounce-and-alert behaviour is kept.
2. **Read** `readBoilerState(device, doc.panelVersion, [doc.boilerZone])` and decide on the live direction:

| Live state | Action |
|---|---|
| `dir === 0` | **Already on auto.** Mark `reverted` and add the note "already back on automatic (timetable change or panel)". This covers V2 natural expiry |
| `dir === −held` | **Superseded.** Someone forced it the other way. Mark `superseded-by-other` with no write, add a ticket note, raise alert `boost-superseded` |
| `dir === held`, **V1**, `attrTs === doc.footprint.attrTs` (or the footprint is null) | Ours, so **revert** |
| `dir === held`, **V1**, `attrTs` changed and `attrValue === held` | Someone re-applied the same value. **ON: revert** (D2 wins). **OFF:** decision 2, recommended skip plus alert plus note |
| `dir === held`, **V2** | **Revert.** V2 cannot tell a same-direction re-issue apart, and the ticket note says so |

3. **Write:** `revertBoilerZoneToAuto`. **Confirm** with a fresh override sample showing `dir === 0` (V2 `overrideTs > pre-revert overrideTs`, V1 `> new attrTs`), polled up to 15 s. If it is not confirmed, the doc stays `active` and is re-checked on the next 30 s cycle without re-firing (same pattern as `revertDispatchedTs`). The horizon is the class `lateWatchMs` (3 min).
4. **Bounded retry.** If the revert is still not confirmed after the horizon, it becomes `revert-failed`. A note goes on the ticket: "zone may still be forced ON/OFF — manual check needed". Alert `revert-failed`. Unlike Salus/Tuya holds, **boiler `revert-failed` docs are retried every 5 min** (`revertAttempts`, up to 12 h). Each retry re-runs steps 2–3, so a zone that is already on auto stops the retries. Sending "auto" again is idempotent. That is why this does not break the DD-RESEND-UX "no resend" rule, which is about operator commands.
5. **Late-revert note.** If `doc.direction === 'on'` and the confirmed revert time is later than `d2CeilingAtMs` plus 2 min, add the ticket note "heating ran past 01:00 by N min (cause: …)" and raise alert `d2-late-revert`.
6. **Admin cancel** (`cancelOverride`) uses the same path.

**Why not the discovery footprint?** E1 and E2. The V1 telemetry value changes every ~6 min, so it would almost never match. Using it would have skipped nearly every V1 revert, which breaks D2. Direction plus the V1 attribute ts gives the same protection (an opposite engineer override is never clobbered) without that failure mode. It also removes the special "null footprint" case. An IN-FLIGHT-TIMEOUT dispatch still has the V1 `attrTs` from the write read-back. For V2, the direction rule covers it.

## 7. Zendesk

- `createBoostTicket(boost)` in `services/zendesk.js` wraps `createOutcomeTicket`:
  - subject `[OOH Boost] {siteNo} {siteName} — Pub zone {n} heating {ON|OFF} until {HH:MM}`. With two zones it reads "Pub zones 1+2";
  - `outcomeType: 'boiler-boost'`, `extraTags: ['ooh_boost', 'ooh_boost_on'|'ooh_boost_off']`.
- Body: operator, caller's words, panel version, zones, direction, duration requested and effective (with the clamp line), revert time, previous zone state (and the warning text if one was acknowledged), and per-zone outcome (CONFIRMED / NOT CONFIRMED / NOT DELIVERED) with the read-back. It ends with "The IoT team should find out why this site needed a boost."
- `addBoostRevertNote(ticketId, doc, result)` writes each revert outcome, skip, retry, failure and late-revert note.
- The operator's outcome capture adds to this ticket (§4G), so there is **one ticket per boost**.

## 8. Q3: does a zone ON also need the boiler forced on?

This is still UNRESOLVED and safety-critical. The design handles both answers, so the build does not wait on it, but the **ON path stays off** (`boilerBoost.onEnabled = false`) until the supervised test answers it.

- **If the zone ON is enough**, nothing more is needed.
- **If the boiler must also be forced**, `config.boilerBoost.forceBoilerOnBoost = true` switches on an extra step.
  - The dispatch also sends V2 `boiler 1` or V1 `output1Override = 1`. `BOILER_RPC_ZONES` and `BOILER_SHARED_KEYS` gain `boiler` and `output1Override` **only** under this flag.
  - It is recorded on the same hold doc (`boilerForced: true`).
  - At revert, the zone goes back to auto first. Then the boiler goes back to auto (`0`) **unless** another active OOH ON hold on the same panel has `boilerForced`, in which case it is skipped and handed to that hold.
  - Boiler "auto" lets the panel decide, so zones still on their timetable keep heat. The discovery worry about starving another zone only applies to another OOH boost, and that case is covered.

## 9. Outage and stale data (critical-thinking finding 2)

- A pod restart re-runs holds that fell due on boot (E5).
- A failed boiler revert is retried for 12 h (§6.4).
- A late ON revert is noted on the ticket (§6.5).
- The ticket exists from dispatch, so the morning IoT check sees every boost whatever the revert did (James-5).
- **V2 backstop:** the panel ends the boost at the next timetable edge. If the supervised test proves the duration token (discovery Q2), `v2DurationToken = true` sends the clamped minutes so the panel ends the boost itself on time.
- **Residual risk, stated plainly:** if OOH is down past 01:00, a V1 ON boost runs until OOH comes back or someone clears it. This is accepted under James-5 for now. An overnight pager on `revert-failed` / `d2-late-revert` is a separate operational ticket, not part of 141.
- Panel staleness: dispatch is refused when the 139 `heating.stale` is true (panel quiet for over 60 min), because confirmation would be impossible.

## 10. Flags and rollout

| Flag (env) | Default | Purpose |
|---|---|---|
| `BOILER_BOOST_ENABLED` | `false` | Master switch for the route, the buttons and dispatch |
| `BOILER_BOOST_ON_ENABLED` | `false` | Heat ON path. Off until Q3 is answered |
| `BOILER_BOOST_SITES` | empty | Comma list of sites verified at the supervised test (V1 wiring per site) |
| `BOILER_BOOST_V1_ZONE_MAP` | empty | JSON per-site override of CHZ→output, used only if a site differs |
| `BOILER_BOOST_FORCE_BOILER` | `false` | §8 extra step |
| `BOILER_BOOST_V2_DURATION_TOKEN` | `false` | §9 V2 backstop |
| `BOILER_BOOST_REVERT_EXEMPT` | per decision 1 | `all` / `runtime` / `none` |

**Supervised first-boost test.** This is the first action of the build's live phase. It needs James's explicit go, on a site Sam picks, one V1 and one V2:

1. Record the telemetry round trip over at least 5 dispatches and report P95. If P95 is over the cap, widen `confirmLimitMs` before rollout.
2. V2: check that `CHZn.override` and `output_state` change, and that the OOH revert returns the override to 0.
3. V1: check that **zone→output wiring** is correct at **each** V1 site before it joins `BOILER_BOOST_SITES`.
4. Record `boiler.enable_output_state` / `output1State` before and after a zone ON (Q3).
5. Optionally try `CHZ1 1 30` (Q2).
6. Test revert under the kill-switch exemption with the runtime switch engaged.

## 11. Tests the build must add

| Area | Cases |
|---|---|
| `boost-window` unit | every row in §5, including both DST nights |
| `tb-client` unit | allow-list rejections (key, zone, value); `params` built only from allow-listed parts; `WRITES_DISABLED` blocks dispatch but not the exempt revert (decision 1); readBoilerState parses string values (143) |
| `registry` unit | boost-on/off validation, menu, unconfigured zone, V1 map override, boiler-panel not in `REQUESTED_KEYS` |
| `control` unit (sim) | flags off gives 423; ON blocked when `onEnabled=false`; warning gives 409 and the ack proceeds; CONFIRMED / NON-DELIVERY / IN-FLIGHT-TIMEOUT holds; ticket failure still leaves the hold; two zones give one ticket |
| `overrides` unit | each row of the §6 table, for V1 and V2; kill-switch exemption; bounded retry; late-revert note; Salus/Tuya path unchanged (existing tests stay green) |
| e2e (Playwright) | V1 and V2 fixture sites: W6 shows Heat ON (flag on), W8 shows Heat OFF, the clamp text, the warning dialog, and the CONFIRMED copy; buttons hidden when flags are off |

**Release:** a minor release (the first boiler-panel **write**). It must include OOHDASH-143's `tbBool` fix, because `readBoilerState` relies on string-tolerant parsing. It ships with all flags off. Going live is a separate, James-approved flag change after the supervised test.

## 12. Out of scope

DHW override (OOHDASH-136), accommodation zones, schedule edits (never), an overnight pager on revert failure, and boiler-only boosts.
