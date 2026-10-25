<!-- gate:contract
SECTION: What we are building
OOHDASH-144 design, revised 2026-10-25 to take in what the v1.5.3 release was trying to do. Four things for the pub heating boost shipped in OOHDASH-141. 1. An operator can end a boost early. 2. An operator can boost more than one pub zone in one go. 3. The heating answer cards match the buttons they show, so a card never says "we can't change it from here" next to a button that does. 4. The three cards that have been blank since v1.5.0 are fixed. Your discovery choices are built in: cancel appears in both places, and multi-zone ships in this ticket. Cancel uses the existing revert. It sets the zone back to automatic, exactly like a boost that ran out of time. No new kind of write to the panel, no schedule changes. A clickable mockup of every new and changed screen is attached.

SECTION: What changed since discovery: the v1.5.3 release
v1.5.3 (released and rolled back on 2026-10-25) changed this same code. Its goals are now part of this ticket and are redone properly here; it does not ship separately. It did two things. First, it removed broken empty branches that have made three answer cards (summer mode, back-up cycle, already off) show a blank card with no buttons since v1.5.0. That was a real defect, and it is still live on v1.5.2 today. Second, it changed the too-hot card so it no longer says "we can't switch it off" when the Heat OFF button is showing. That was the right idea, but the edit used curly quote marks in the code, which stopped every triage flow loading. That is why it was rolled back. It also fixed only one of the four cards with this problem. The fix is needed and is kept in this design; the method is redone. Main still holds the broken v1.5.3 code, so the build starts from main and replaces it.

SECTION: Discovery re-check: what still holds and what is new
All eight discovery answers (Q1 to Q8) still hold; v1.5.3 touched none of them. The five-part fix plan still holds. The re-check found three new things, now in scope. A. Four cards contradict their own buttons (too cold: part off, switched off on purpose, off on its timetable; too hot: on). The wording you approved on 2026-10-23 was written before boost existed, and OOHDASH-141 added the buttons without changing the words. B. The cards blame the panel for OOH's own boost. If an OOH heat-OFF hold is running and the caller is cold, the card says the zone was "deliberately switched off at the boiler panel" and offers a Heat ON on top. The right answer is "OOH has this on a timed hold; cancel it". C. When the operator logs a call instead of boosting, the ticket copies the screen wording, which tells the operator what to do. Tickets will now use the plain ticket sentence each card already has.

SECTION: Two corrections to discovery, found in the code
1. Who can cancel. Discovery said to lock the new cancel route to the IoT-team role. That would block the OOH handlers, who are the people taking the calls. The boost route itself is open to anyone signed in (handler or IoT team). The existing admin cancel is already IoT-team only, which is the real reason handlers cannot cancel today. This design lets anyone who can start a boost also cancel one, at that site only. Decision 1 below asks you to confirm.
2. The boost result card never shows its end time. The card reads a field called revertAt but the server sends revertAtMs, so the "Override active until" line is silently missing today. The new result card fixes this.

SECTION: How cancel works
The site page asks the server for any boost still running at that site. The server now lists them (zone, ON or OFF, end time, who started it). If there are any, a banner shows above the questions with a "Cancel early" button per zone. A second tap confirms ("Yes, cancel"); there are no pop-up dialogs. The server checks three things before it acts: the site is confirmed for this call, the hold belongs to THAT site, and the hold is still running. Then it runs the same revert a timed boost uses. That revert takes up to about 20 seconds because it waits for the panel to confirm, so the button says "Cancelling, this can take up to 30 seconds".

SECTION: What the operator is told after a cancel
The message depends on what actually happened at the panel, never just on the click. Back to automatic: "Pub zone 1 boost (or hold) cancelled. The zone is back on its normal timetable." The panel was already back on automatic: same message. Someone else changed the zone the other way: "Someone else has changed pub zone 1 since the boost, so we left it alone. Logged for the IoT team." The panel has not confirmed yet: "Cancel sent. The panel has not confirmed yet; we will keep trying for the next few minutes and the IoT team is alerted if it does not take." The hold had already ended: "This has already ended. Refreshing." In every case the boost ticket gets a note saying who cancelled it and when.

SECTION: Heating questions when a boost is running
When the operator picks Bar/Restaurant heating and a boost is still running there, the first screen shows a short card before the usual Too cold / Too hot question. The card says what is running, under the headline "OOH already has the pub heating on a timer", for example "Pub zone 1: heat ON boost until 21:30, started by Kelly", plus "Cancel early" and "The caller needs something else". The card is built from OOH's own boost record, not from the panel reading. So it is right even if the panel reading is wrong, which keeps it clear of the OOHDASH-143 reading bug (fixed in v1.5.2, but this does not depend on that fix).

SECTION: Picking zones for a boost
Today each zone has its own "Heat ON (zone 1)" button that fires straight away. That changes to one button: "Boost heat ON" for too cold, "Hold heat OFF" for too hot. If only one zone is eligible, it goes straight to "How long?" as today. If two zones are eligible, a new step asks the caller which area. It shows a chip for each zone and "All zones / not sure". Continue stays greyed out until at least one zone is picked. The zones are called "Pub zone 1" and "Pub zone 2", because ThingsBoard holds no room names. Script for too cold: "Is it one part of the pub that's cold, or the whole pub?" Script for too hot: "Is it too warm in one part of the pub, or everywhere?"

SECTION: Heating answer cards: one wording rule
Each card now has two versions. The plain version is used when the button is not offered, and is your approved wording unchanged. The boost version is used when the button is offered: it says the operator can switch the heating on (or off) for a set time, that it goes back to its normal timetable afterwards, and that it is logged for the IoT team either way. It never promises the result before it happens; v1.5.3's "I'll do that now" is dropped, because the operator still has to pick the zone and how long. Headlines state the situation only (for example "Pub heating is on"), so they read correctly in the ticket too. Where a zone is under an OOH boost, the card says so ("Pub zone 1 is on a timed OOH boost until 21:30") and offers "Cancel early" instead of a button pushing the opposite way. The same words are used everywhere: heat ON for a set time is a "boost", heat OFF for a set time is a "hold", and every cancel button says "Cancel early". The three blank cards get your approved wording back, unchanged. Every new sentence is in the mockup for you to read.

SECTION: Boost result card
The result lists each zone separately, using what the panel reported back, not just what was picked. Confirmed: "Pub zone 1: heat ON until 21:30." Sent but not yet confirmed: "Pub zone 2: sent, the panel has not confirmed yet. It will still switch back at 21:30." Could not reach the panel: "Pub zone 2: could not reach the panel, NOT boosted." That last case adds a "Capture for the IoT team" button. After any boost the site page refreshes, so the cancel banner shows straight away. If the operator picked the wrong zone, they can undo it at once.

SECTION: Tests the build must add
Server: a cancel works for a running hold; a hold from another site gets a not-found; a hold that has ended gets a not-found; a non-boiler hold gets a not-found; an unconfirmed site is refused; each panel outcome gives the right result; and the workspace lists only running boiler holds for that site. Browser (Playwright): banner shows and cancel works; the second-tap confirm; the stale hold refresh; the hold card at the start of the questions; the zone picker with one zone, two zones and All zones; Continue greyed out with nothing picked; and a two-zone result where one zone fails. The existing BB-E1 to BB-E7 tests are updated for the new single entry button. New card tests: all nine heating cards render a headline and buttons (this guards against the blank-card bug coming back); the plain and boost versions of the four changed cards; and the OOH-hold versions. A syntax check of every browser script runs in the unit tests, so a typo like v1.5.3's fails at once.

SECTION: What does not change
No schedule or optimum-start keys are written. Cancel only ever sets a zone to automatic (0). The boiler output and output1Override are never written. The kill-switch exemption for reverts applies to cancel unchanged. The backend already accepts several zones in one boost, so no new write path is added. Nothing is released or switched on in production without your go.

DECISION: Who can cancel a running boost | Anyone who can start a boost, handler or IoT team, at that site only (recommended) | IoT team only
DETAIL: Discovery said IoT team only, but handlers take the calls and can already start a boost. IoT-team-only would leave the handler who boosted the wrong zone unable to undo it. Either way the server checks the hold belongs to the confirmed site.

DECISION: All zones / not sure when the caller is too hot | Allow it for Heat OFF as well as Heat ON (recommended) | Heat ON only; Heat OFF needs a zone picked
DETAIL: All zones OFF turns off all pub heating for the chosen time. It is safe to allow because cancel now exists, the hold always switches back to the timetable, and the OFF time choices are the existing ones (1 hour, 2 hours, until 07:00). Restricting it means the operator must guess a zone when the caller is unsure.

DECISION: New boost wording for the four heating cards that offer a button | Approve the wording in the mockup (recommended) | Approve with changes noted in your review
DETAIL: This replaces v1.5.3's one-card change with a consistent set across all four cards (part off, switched off on purpose, off on its timetable, and on). Your approved 2026-10-23 wording stays exactly as it is whenever no button is shown, and on the five cards that never offer one. The mockup's "Heating answer cards" scenarios show each card with and without the button, and with an OOH boost running.
-->

# OOHDASH-144 Design: cancel a running pub heating boost + multi-zone boost + consistent heating cards

Date: 2026-10-25 (revised the same day to absorb v1.5.3) · Discovery: PR #146 (merged; D1 = C both surfaces, D2 = bundle) · Base: main `9e9957f` (v1.5.3 in git; **prod rolled back to v1.5.2** image `v1.5.2`)

**Clickable mockup:** [OOHDASH-144 mockup](mockups/OOHDASH-144-mockup.html)

## 1. Summary

Five changes, all on top of the OOHDASH-141 boost machinery:

| # | Where | Change |
|---|-------|--------|
| A | `routes/api.js` `workspacePayload()` | add `activeBoostHolds` |
| B | `routes/api.js` | new `POST /api/sites/:siteNo/booster-holds/:id/cancel` |
| C | `services/overrides.js` | record `revertOutcome` on the hold doc; cancel note on Zendesk |
| D | `public/js/views.js` | boost-hold banner (site page, above the flow) |
| E | `public/js/flows.js` | hold-active intercept, single boost entry, `bp-zones` step, per-zone result card |
| F | `public/js/flows.js` `bpOutcomeCard` | absorbs v1.5.3: replaces the broken W8 block, keeps the W4/W7/W9 branch fix, adds boost-aware and OOH-hold-aware wording for W3/W5/W6/W8 (§7.5–7.7) |
| G | `test/browser-js-syntax.test.js` (new) | every `public/js/*.js` must compile (guards against a repeat of v1.5.3) |

No change to `services/control.js` `dispatchBoilerBoost()` (already takes `zones: [...]`), `tb-client.js`, `registry.js`, `boost-window.js`, or config/flags.

## 2. Corrections to discovery (code-verified)

1. **Route role.** Discovery specified `requireRole('iot')`. In code `requireRole` is exact-match and handlers carry role `handler` (`services/auth.js:219`). The admin router is already `requireRole('iot')` (`routes/api.js:565`), which is why handlers cannot cancel today. `POST /api/boiler-boost` (`routes/api.js:275`) has no role gate, so any signed-in OOH user can start a boost. Design: the cancel route has the **same** gate as boost (signed-in, any OOH role) plus the site checks in §4. Decision 1 asks James to confirm.
2. **Result card end time is broken today.** `flows.js:1037` reads `act.revertAt`; the action returned by `dispatchBoilerBoost` carries `revertAtMs` (`control.js` action object). The "Override active until" line never renders. Fixed in the new result card (§7.4).
3. **Workspace query is polled.** Discovery said the holds read is "not a standing background poll". `scheduleWorkspaceRefresh()` (`views.js:143`) re-fetches the workspace every 30 s while the site page is idle. The extra read is the same in-process partition filter `activeOverrides()` already uses (hundreds of docs). It is acceptable but noted, and it fails soft (§3).
4. **Zendesk note needs no new parameter.** `cancelOverride()` already writes `doc.cancelRequestedBy`; `addBoostRevertNote(ticketId, doc, result)` receives the doc. The note reads it from there, so no `cancelledBy` parameter is added.
5. **A cancel can come back "not yet".** If the revert is not confirmed in 20 s, `revertBoiler()` puts the hold back to `status:'active'` with `OohOverrideRevertAt = now + 5 min` and retries for up to 12 h (`overrides.js:415-428`). The cancel response and the banner handle this "ending" state (§4.3, §6).

6. **v1.5.3 is in main but not in production.** Commit `3cd2e99` (released as v1.5.3, image `9e9957f`) did two things in `bpOutcomeCard`. (a) It removed the empty duplicate `else if (wcode === 'W4') {}` / `'W7'` / `'W9'` branches added by OOHDASH-141 (`f0f8369`, in every release from v1.5.0). Those branches leave `headline`, `operatorText`, `scriptText`, `ticketText` and `buttons` undefined, so summer mode, back-up cycle and too-hot-but-off show a blank card reading "undefined" with **no buttons**. This is live on v1.5.2 today. (b) It made W8 wording conditional on the Heat OFF button. But the W8 block was retyped with curly quotes (‘ ’) as JS string delimiters, so `flows.js` failed to parse (CI red on both commits; deployed anyway; rolled back to image `v1.5.2` on 2026-10-25). The build starts from main and must leave **no** curly-quote delimiters (§7.5, test SYN-1).
7. **Approved wording predates boost.** The W1–W9 wording was approved on 2026-10-23 (OOHDASH-139 D1). OOHDASH-141 added Heat ON/OFF buttons to W3, W5, W6 and W8 on 2026-10-24 without changing the words. So each of those cards says "can't change it from here" next to a button that can. v1.5.3 fixed W8 only, and its new script ("I'll do that now") promises a result before the operator has picked zone or duration.
8. **Cards misattribute OOH's own holds.** `boilerHeatingOutcome()` sees an OOH OFF hold as `forced:'off'`, so a cold call returns W5: "deliberately switched off at the boiler panel", with Heat ON offered on top. An OOH ON boost shows the forced-on sentence "switched on at the panel". If the operator passes the intercept (§7.1), the card blames the panel or an engineer for OOH's action. It also offers a button that stacks an opposite override instead of cancelling the existing one.
9. **Captures copy the operator instructions into the ticket.** `bp-esc` / `bp-advice` call `bpOutcomeCard(wcode, heating, nowMs)` without `boostAvailable` and send `card.operatorText` as the capture detail. That text is written to the operator ("Log it for the IoT team…"), not for the ticket.

## 3. Workspace extension: `activeBoostHolds`

In `workspacePayload(site)`, after `boostAvailable`, call a new `overrides.activeBoostHoldsForSite(site.siteNo)` inside a try/catch. On error, log `[API] Boost holds unavailable: <message>` and set `activeBoostHolds = null`. Add `activeBoostHolds` to the returned payload.

New export `activeBoostHoldsForSite(siteNo)` in `services/overrides.js`. It uses `collection('OohOverrides').query(...)` with the predicate `status === 'active' && deviceType === 'boiler-panel' && String(siteNo) === String(siteNo arg)`. It sorts by `boilerZone` and maps each doc to the fields in the table below. `revertAt` comes from `OohOverrideRevertAt`, and `ending` is `!!(cancelRequestedBy || revertAttempts)`.

Payload field: `activeBoostHolds: Array<Hold> | null`. `null` means the read failed. The client then shows no banner and no intercept, which is today's behaviour. `[]` means none running.

| Field | Type | Notes |
|---|---|---|
| `id` | string | hold doc id, used by the cancel route |
| `deviceId` | string | boiler panel |
| `boilerZone` | `"CHZ1"`/`"CHZ2"` | shown as "Pub zone 1/2" |
| `direction` | `"on"`/`"off"` | |
| `panelVersion` | `"v1"`/`"v2"` | not shown; kept for tests/logs |
| `revertAt` | ISO string | end time, shown HH:MM en-GB |
| `holdLabel` | string or null | not shown (internal wording) |
| `createdBy` | string or null | operator name |
| `ending` | bool | true when a cancel or revert retry is already in flight: show "Returning to timetable…", no Cancel button |

`status:'reverting'` (lease held mid-revert) and `revert-failed` are not listed. Those are IoT-team matters already alerted and noted on the ticket. (`holdLabel`, `createdBy` and `siteNo` are the persisted names, verified in `scheduleOverride()`.)

## 4. Cancel route

### 4.1 Contract

`POST /api/sites/:siteNo/booster-holds/:id/cancel`. It is on the main `router`, behind `requireAuth` and the same-origin guard like every route. There is no `requireRole` (Decision 1). If James picks "IoT team only", add `requireRole('iot')`.

Request body: `{ "confirmToken": "<token from site confirm>" }`

Checks, in order:

| # | Check | Fail → |
|---|---|---|
| 1 | `resolution.isConfirmed(confirmToken, siteNo, operator.id)` (non-consuming, same as the workspace route) | 409 `{ error: 'Site not confirmed', code: 'not-confirmed' }` |
| 2 | `doc = OohOverrides.get(id)` exists, `doc.deviceType === 'boiler-panel'`, `String(doc.siteNo) === String(req.params.siteNo)` | 404 `{ error: 'Hold not found', code: 'hold-not-found' }`. The same 404 for another site's id, so existence is not leaked |
| 3 | `doc.status === 'active'` | 404 `{ error: 'This boost has already ended', code: 'hold-ended' }` |
| 4 | `overrides.cancelOverride(id, operator)` | its own 404 → `hold-ended`; `ConcurrencyError` (worker grabbed it) → 409 `{ code: 'hold-changed' }` |

`cancelOverride` itself accepts `revert-failed` too. The operator route deliberately does not (check 3); that stays an admin action.

Response 200 has two fields. `result` is one of `reverted`, `already-auto`, `superseded`, `left-forced` or `pending`. `hold` is `{ id, boilerZone, direction, status }` from the post-cancel doc.

### 4.2 Audit

After the cancel call: `audit.logAction({ actionType: 'boiler-boost-cancel', operator, siteNo, siteName: doc.siteName, deviceId: doc.deviceId, zone: doc.zone, detail: 'Cancelled early: <zone> <dir> (was due <HH:MM>) → <result>', outcome: result, ticketId: doc.ticketId })`.

### 4.3 Result mapping

`revertBoiler()` gains one line per branch: `doc.revertOutcome = …`. Values: `'written'` on a confirmed write; the existing `revertOutcome` on non-write branches (`already-auto`, `superseded-by-other`, `same-direction-skip`). The route maps the post-cancel doc:

| Post-cancel doc | `result` |
|---|---|
| `status:'reverted'`, `revertOutcome:'written'` | `reverted` |
| `status:'reverted'`, `revertOutcome:'already-auto'` | `already-auto` |
| `status:'superseded-by-other'` | `superseded` |
| `status:'reverted'`, `revertOutcome:'same-direction-skip'` | `left-forced` |
| `status:'active'` or `'reverting'` (not confirmed in 20 s, retry scheduled; or lease held by another replica; or kill-switch bounce when not exempt) | `pending` |

`revertOutcome` is a new optional field. Old docs without it fall back to `reverted` when `status:'reverted'`.

### 4.4 Kill-switch and invariants

Cancel runs `revertBoiler()`, so `BOILER_BOOST_REVERT_EXEMPT` (default `all`) applies unchanged. When not exempt and writes are blocked, the hold bounces to `active` and the route returns `pending`. The only TB write is `tb.revertBoilerZoneToAuto` (zone → 0). There are no schedule, OptimumStartStop, `boiler` or `output1Override` writes.

### 4.5 Zendesk note

In `addBoostRevertNote`, when `doc.cancelRequestedBy` is set, prefix the body with `Cancelled early by <name> at <HH:MM> (due <HH:MM>).`. This applies to every result, so a cancel that later reverts on retry still says who cancelled. The existing result wording is unchanged.

## 5. Client state helpers (`app.js` / `views.js`)

- `refreshWorkspace()`: the body of the 30 s refresh pulled into a function, called after a successful boost and after every cancel response. It ignores the `state.flow` guard; it is explicit.
- `cancelBoostHold(holdId, surface)`: two-tap. The first tap sets `state.boostCancel[holdId] = 'confirm'`. The second tap posts, sets `'cancelling'`, then `{result}` or `{error}`. It renders after each step. Stored per hold id so the banner and the intercept card share state.

## 6. Banner (`renderBoostHoldBanner(ws)`, `views.js`)

Rendered directly under `renderP1Banner(ws)` (above the flow), only when `Array.isArray(ws.activeBoostHolds)` and it is non-empty, or when a cancel result for this site is still being shown. One row per hold. `data-testid="boost-hold-banner"`, rows `boost-hold-row-<zone>`.

| State | Row content | Buttons |
|---|---|---|
| active | "🔥 Pub zone 1: heat **ON** boost until **21:30** · started by Kelly" (OFF: "❄ Pub zone 2: heat held **OFF** until 07:00") | `Cancel early` (`boost-cancel-<zone>`) |
| confirm | "Cancel the [boost or hold] for pub zone 1 now? It goes back to its normal timetable." | `Yes, cancel` (`boost-cancel-yes-<zone>`) · `Keep it` |
| cancelling | "Cancelling… this can take up to 30 seconds while the panel confirms." | none (disabled) |
| ending (`hold.ending` or result `pending`) | "Pub zone 1: cancel sent; the panel hasn't confirmed yet. We'll keep trying, and the IoT team is alerted if it doesn't take." | none |
| done: reverted / already-auto | ✅ "Pub zone 1 boost (or hold) cancelled. The zone is back on its normal timetable." + script line: *"I've cancelled that; the heating's back on its normal timetable."* | `Dismiss` |
| done: superseded / left-forced | ⚠ "Someone else has changed pub zone 1 since the boost, so we left it alone. Logged for the IoT team." | `Dismiss` |
| stale (404 `hold-ended`/`hold-not-found`, 409 `hold-changed`) | "This boost has already ended. Refreshing…" → `refreshWorkspace()` | none |
| error (other) | "Couldn't cancel: <message>." | `Try again` |

Colour: info-blue alert for active/ending; success-green for done; warn-amber for superseded/left-forced. End time is `new Date(revertAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})`. The banner reads nothing from `boilerControl.heating`.

## 7. Flow changes (`flows.js`)

### 7.1 Hold-active intercept (stage 1 of `boilerPanelHeatingBranch`)

Before the stage-1 chips: if `f.stage === 1 && !f.data.holdAck && Array.isArray(ws.activeBoostHolds) && ws.activeBoostHolds.length`, render `data-testid="reco-boost-hold"`:

- Headline: "OOH already has the pub heating on a timer"
- One line per hold (same text as the banner active row) with its own `Cancel early` → shared `cancelBoostHold(id, 'flow')`; the result shows inline using §6 wording.
- Say to caller: *"We've already got the heating on a timed boost. It runs until 21:30, then goes back to its normal timetable."* (OFF: *"…held off until 07:00…"*)
- Buttons: `The caller needs something else` (`bp-hold-continue`) sets `f.data.holdAck = true` and shows the usual Too cold / Too hot chips. `End with no action` → `bp-noact`.

Source: `ws.activeBoostHolds` only. No `tbBool`, `decodeBoilerHeating` or zone `on/forced` field is read, so OOHDASH-143-class decode faults cannot change this card.

### 7.2 Single boost entry on W-code cards (`bpOutcomeCard`)

Each card computes its **candidate zones**, exactly as today's per-zone buttons do:

| W-code | Direction | Candidates (unchanged from 141) |
|---|---|---|
| W3 | on | zones currently off |
| W5 | on | the forced-off zone |
| W6 | on | all zones (fallback `['CHZ1']`) |
| W8 | off | zones currently on (fallback `['CHZ1']`) |

It replaces the per-zone buttons with one button. `Boost heat ON` (`data-testid="bp-boost-on"`, class `boost-on`), or `Hold heat OFF` (`bp-boost-off`). It calls `flowStep({need:'bp-zones', direction, candidates:'CHZ1,CHZ2'})`. Zones under a running OOH hold are removed from the candidates and get a cancel button instead (§7.6). If no candidates remain, no boost button renders and the card uses its plain wording. The server's existing "already forced" warning + acknowledge step still covers zones forced at the panel or by an engineer.

### 7.3 New step `need === 'bp-zones'`

- Parse `f.data.candidates`. If exactly one, set `f.data.selectedZones = [that]` and fall straight through to `bp-boost` (no question, same as today).
- Otherwise render `data-testid="reco-boost-zones"`:
  - doneLine `Boost: Heat ON — choose zones`
  - Say to caller: ON *"Is it one part of the pub that's cold, or the whole pub?"* · OFF *"Is it too warm in one part of the pub, or everywhere?"*
  - Operator hint (small): "If they can say which area, pick that zone. If they're not sure, pick All zones."
  - Toggle chips `Pub zone 1` (`bp-zone-CHZ1`), `Pub zone 2` (`bp-zone-CHZ2`) with `aria-pressed` and the `sel` class when picked; `All zones / not sure` (`bp-zone-all`) selects every candidate. Tapping a picked zone un-picks it.
  - `Continue` (`bp-zones-continue`) is `disabled` while `selectedZones` is empty → `flowStep({need:'bp-boost'})`. `Back` → `flowStep({need: f.data.bpCallDir})`.
- Helpers on the page: `toggleZone(id)` and `selectAllZones(ids)`. Each mutates `state.flow.data.selectedZones` and calls `render()`. There are no API calls.
- `All zones` applies to OFF as well, subject to Decision 2. If James picks "Heat ON only", the `bp-zone-all` chip is omitted when `direction === 'off'`.

### 7.4 Duration + send (`bp-boost`, `bp-boost-send`)

- `bp-boost` title: "Heat ON: pub zone 1 + pub zone 2" (built from `selectedZones`). The durations are unchanged.
- `bp-boost-send`: `zones: f.data.selectedZones`; state key `'boost-' + dir + '-' + selectedZones.join('+')`. The warnings + acknowledge path is unchanged (it lists one line per zone).
- On success: build the result card from `act.zones` (per-zone `outcome`) and `act.overrideIds`. Then `refreshWorkspace()` so the banner shows the new holds.

Result card `data-testid="outcome-boost"`. Header "Heat ON: pub heating" / "Heat OFF: pub heating". Then one row per zone, `boost-zone-result-<zone>`:

| Zone outcome | Row |
|---|---|
| `CONFIRMED` + has overrideId | ✅ "Pub zone 1: heat ON until **21:30**" (+ "(stopped at 01:00)" if `act.clamped`) |
| `IN-FLIGHT-TIMEOUT` + has overrideId | ⏳ "Pub zone 2: sent, the panel hasn't confirmed yet. It will still switch back at 21:30." |
| `NON-DELIVERY` | ❌ "Pub zone 2: couldn't reach the panel, **not boosted**." |
| any outcome, no overrideId (hold save failed) | ⚠ "Pub zone 2: sent, but the switch-back wasn't recorded. The IoT team must check it." |

End time is `act.revertAtMs` (fixes §2.2). Footer: "Ticket #N raised — the IoT team will check the panel after the boost ends." When any row is ❌ or ⚠, add `Capture for the IoT team` (`bp-capture`) above the usual end buttons.

### 7.5 Heating card wording: plain vs boost versions (absorbs v1.5.3)

Rule: a card uses the **boost version** when it renders a boost entry button for at least one candidate zone, and otherwise the **plain version**. The plain version is the 2026-10-23 approved text, verbatim. Headlines state the situation only, so they also read correctly as a ticket subject. UI text keeps the existing typographic apostrophes (’) **inside** strings; every JS string delimiter is a straight single or double quote.

| Card | Plain version (approved, unchanged) | Boost version (new, Decision 3) |
|---|---|---|
| W3 headline | Part of the pub heating is off | (same) |
| W3 operator | …is on, but … is off right now. The panel doesn’t tell us why from here, and we can’t switch zones remotely. Log it for the IoT team. If the caller says the cold area is the part that’s heating, treat it as a boiler or radiator problem and advise their heating engineer. | [On list] is on, but [off list] is off right now. The panel doesn’t tell us why from here. You can switch [off list] on for a set time with Boost heat ON. It goes back to its normal timetable afterwards, and it’s logged for the IoT team either way. If the caller says the cold area is the part that’s heating, treat it as a boiler or radiator problem and advise their heating engineer. |
| W3 script | Part of the heating is on, but one area is switched off at the controls. I can’t change that from here, so I’ve logged it for the team. | Part of the heating is switched off at the controls. I can put it on for a set time from here, and I’ve logged it for the team to look at properly. |
| W5 headline | Pub heating has been switched off on purpose | (same) |
| W5 operator | Pub zone [N] has been deliberately switched off at the boiler panel ([until]). That’s the likely reason it’s cold. We can’t change it from here, so log it for the IoT team if the site needs the heating back on. | Pub zone [N] has been deliberately switched off at the boiler panel ([until]). That’s the likely reason it’s cold. You can switch it back on for a set time with Boost heat ON. Someone may have switched it off for a reason, so it’s logged for the IoT team to check. |
| W5 script | That part of the heating has been switched off on purpose at the controls. I can’t change it from here, but I’ve logged that you need it back on so the team can sort it. | That part of the heating has been switched off on purpose at the controls. I can put it back on for a set time from here, and I’ve logged it so the team can check why it was switched off. |
| W6 headline | Pub heating is off at the controls right now | (same) |
| W6 operator | …so it’s most likely outside its heating times. [Next change.] We can’t switch it on from here. | …so it’s most likely outside its heating times. [Next change.] You can switch it on for a set time with Boost heat ON. It goes back to its normal timetable afterwards. |
| W6 script | The heating is off on its timetable at the moment[ and is due back on at X]. I can’t turn it on from here, so I’ve logged it for the team. | The heating is off on its timetable at the moment[ and is due back on at X]. I can put it on for a set time from here, and I’ve logged it for the team so they can check the timetable. |
| W8 headline | Pub heating is on, and we can’t switch it off from here | Pub heating is on |
| W8 operator | The panel is heating [on list]. Pub heating on this panel can’t be changed remotely. Log it for the IoT team. In the meantime the site can turn the radiator valves down. | The panel is heating [on list]. You can switch it off for a set time with Hold heat OFF. It goes back to its normal timetable afterwards, and it’s logged for the IoT team. |
| W8 script | The heating is on at the controls and I can’t change it from here tonight. Turning the radiator valves down will help in the meantime. I’ve logged it for the team. | The heating is on at the controls. I can switch it off for a set time from here, and I’ve logged it for the team. |

Ticket sentences are unchanged for every card. W1, W2, W4, W7 and W9 never offer a button and keep their approved text. For W4, W7 and W9 that means the text returns after the blank-card defect. v1.5.3's W8 strings ("Pub heating is on — you can switch it off", "I’ll do that now…") are replaced by the boost version above.

### 7.6 OOH-hold-aware cards

`bpOutcomeCard` gains a 5th argument, `holds` (= `ws.activeBoostHolds || []`, excluding `ending`). `holdFor(zoneId)` returns the running OOH hold for that zone, or null. The W-code classification (`boilerHeatingOutcome`) is unchanged; only the card text and buttons react.

| Situation | Card behaviour |
|---|---|
| Zone with OOH **ON** boost, any card that shows the forced-on sentence | The sentence becomes "Pub zone [N] is on a timed OOH boost until [HH:MM] (started by [name])." instead of "switched on at the panel" |
| W5 where the forced-off zone has an OOH **OFF** hold | Headline "Pub heating is on a timed OOH hold". Operator: "Pub zone [N] was switched off from OOH until [HH:MM] (started by [name]). That’s the likely reason it’s cold. You can cancel the hold now and the zone goes back to its normal timetable." Script: "We switched that part of the heating off earlier for a set time. I can cancel that now so it goes back to its normal timetable." Button `Cancel early` (`bp-hold-cancel-<zone>`) → `cancelBoostHold`. No Boost heat ON for that zone. |
| W8 where an on-zone has an OOH **ON** boost | Adds "Pub zone [N] is on a timed OOH boost until [HH:MM]. Cancelling it puts the zone back on its normal timetable." Button `Cancel early` (`bp-hold-cancel-<zone>`). That zone is removed from the Hold heat OFF candidates. |
| W3 / W6 candidate zones | Zones already under an OOH hold in either direction are removed from the Boost heat ON candidates |

The cancel result shows inline on the card using the §6 wording. Hold facts come only from `activeBoostHolds` (Cosmos), never from TB decode.

### 7.7 Capture and advice outcomes

`bp-esc` and `bp-advice` now call `bpOutcomeCard(wcode, heating, nowMs, ws.boostAvailable, holds)`, so the subject matches what the operator saw. The capture `detail` changes from `card.operatorText` to `card.ticketText`. The ticket gets each card's existing plain, operator-neutral state sentence, not instructions written to the operator. The capture subject is the situation-only headline.

### 7.8 Wording glossary (applies to every new and changed string)

| Term | Use | Never |
|---|---|---|
| boost | heat ON for a set time | "override", "force" |
| hold | heat OFF for a set time | "boost OFF" |
| OOH heating timer | a boost or hold, generically (banner title, intercept headline) | "override" |
| Cancel early | every cancel button | "Undo", "Stop" |
| Pub zone 1 / pub zone 2 | sentence start / mid-sentence | "CHZ1", "zone 1" alone |
| normal timetable | where the zone goes after a boost/hold | "schedule", "auto" |
| for a set time | how boost/hold is described to callers | promises like "I'll do that now" |

Apostrophes inside UI text stay typographic (’), matching the approved 139 wording. They never sit in a JS delimiter position (SYN-1).

## 8. Tests the build must add

**Unit (`node --test`)**: new `test/boost-hold-cancel.test.js`, plus extensions:

| ID | Case |
|---|---|
| BHC-1 | `activeBoostHoldsForSite` returns only `active` + `boiler-panel` + matching site, sorted by zone, `ending` set when `cancelRequestedBy`/`revertAttempts` |
| BHC-2 | workspace returns `activeBoostHolds: null` when the store query throws; workspace still 200 |
| BHC-3 | cancel route: happy path → 200 `reverted`, audit `boiler-boost-cancel` logged |
| BHC-4 | hold id from another site → 404 `hold-not-found` (and no revert attempted) |
| BHC-5 | non-boiler hold id → 404 |
| BHC-6 | `status:'reverted'` hold → 404 `hold-ended` |
| BHC-7 | missing/foreign confirmToken → 409 `not-confirmed` |
| BHC-8 | result mapping: already-auto, superseded-by-other, same-direction-skip, not-confirmed (retry → `pending`) |
| BHC-9 | handler-role operator can cancel (or 403 if Decision 1 = IoT only) |
| BHC-10 | `addBoostRevertNote` prefixes "Cancelled early by …" when `cancelRequestedBy` set; unchanged otherwise |
| BHC-11 | `revertOutcome` written on every `revertBoiler` branch (extends `boiler-overrides.test.js`) |
| SYN-1 | new `test/browser-js-syntax.test.js`: each `public/js/*.js` compiles with `new vm.Script(source)`, and no curly quote sits in a JS delimiter position (e.g. `=== ‘`, `(‘`, `‘)`) |

**Playwright** (`tests/boiler-boost.spec.js`; fixture sites 9010 V2 / 9011 V1; seed holds through the existing test-only routes or fixture store):

| ID | Case |
|---|---|
| BB-E1..E7 | updated: single `bp-boost-on` / `bp-boost-off` entry; W3 single-candidate goes straight to durations |
| BB-E8 | W6 two zones → `reco-boost-zones` shown, `bp-zones-continue` disabled until a chip is picked |
| BB-E9 | `bp-zone-all` selects both → dispatch body `zones:['CHZ1','CHZ2']` → two `boost-zone-result-*` rows |
| BB-E10 | toggling a picked zone un-picks it; Continue disables again |
| BB-E11 | after boost success the `boost-hold-banner` appears without leaving the page |
| BB-E12 | banner `Cancel early` → `Keep it` returns to active; → `Yes, cancel` → success wording, banner row cleared after Dismiss |
| BB-E13 | stale: hold ended server-side between load and click → "already ended" + refresh |
| BB-E14 | intercept: active hold → `reco-boost-hold` before need chips; `bp-hold-continue` reveals Too cold / Too hot |
| BB-E15 | intercept renders from `activeBoostHolds` with `boilerControl.heating` zones set to `on:null` (OOHDASH-143 guard) |
| BB-E16 | partial failure fixture (zone 2 `NON-DELIVERY`) → ❌ row + `bp-capture` shown |
| BB-E17 | result card shows the end time (regression for `revertAtMs`) |
| BB-E18 | Heat OFF + Decision 2 behaviour (All chip present or absent) |
| BB-E19 | W4, W7 and W9 each render a non-empty headline, operator text and at least one button (blank-card regression) |
| BB-E20 | W3/W5/W6/W8 with `boostAvailable` on → boost version text (§7.5); with it off → plain approved text |
| BB-E21 | cold call with an OOH OFF hold on the forced-off zone → "timed OOH hold" card with `bp-hold-cancel-<zone>`, no `bp-boost-on` for that zone |
| BB-E22 | hot call with an OOH ON boost → `bp-hold-cancel-<zone>` (Cancel early) shown, zone excluded from Hold heat OFF |
| BB-E23 | capture from W8 with boost available → ticket detail is the ticket sentence, subject "Pub heating is on" |

## 9. Rollout

This release supersedes v1.5.3. It is cut from main (which carries `3cd2e99`), and the release gate must show CI green on the exact released sha before any deploy. Production stays on image `v1.5.2` until then. The ACR `latest` tag still points at the broken v1.5.3 and must not be deployed. No new flag. The feature is live wherever boost is live (`boostAvailable`), and holds only exist where boost ran. The banner and intercept are read-only until the operator taps Cancel. The build, test and release gates follow as normal. No deploy without James's go.

## 10. Out of scope

- Room names for zones (none in TB; needs a site survey data source).
- Cancelling `revert-failed` holds from the operator screen (stays admin).
- DHW (OOHDASH-136) override cancel: different hold type, not touched.
