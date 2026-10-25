<!-- gate:contract
SECTION: What we are building
OOHDASH-144 design, third version (2026-10-25), rebuilt around your review of the prototype. It does two jobs. First, it finishes the pub heating work: an agent can turn the heating on or off for a set time across one or more zones, put it back to normal early, and see clearly what the heating will do afterwards. Second, it sets a new standard for every screen an agent uses: plain words, one unmistakable script to read to the customer, and one clear way of logging each issue with the ticket number always shown. This ticket applies the standard fully to pub heating. A follow-on ticket rolls it out to every other flow (hot water, kitchen, lighting, fans, fridge, contractor, connectivity, other), using the inventory already gathered. Nothing changes the heating timetable itself, and nothing goes live without your go.

SECTION: Your review points, checked across every flow
You asked that every point be checked everywhere, not just where you saw it. The code check found the following. The "tell the operator" label plus a separate script appears in every flow. Pub heating has three look-alike blocks, and the other 35 outcomes print the guidance right above an unlabelled script. The word "caller" is on about 77 screen lines and "customer" on none. Technical words are everywhere: override (about 80 lines), panel (about 40), forced, setpoint, back-up cycle, offline, gateway, and internal codes like W3 shown on screen. There are three different ways tickets get made, and a turned-on heating ticket is invisible to the rest of the flow, so logging afterwards makes a second ticket. Notes typed after turning the heating on are silently lost. "Ticket raised" can show with no ticket. Two of my own prototype labels ("Hold heat OFF", "Done, end this issue") do not exist in the app and are dropped. The full table is in section 2 of the design.

SECTION: The new screen standard
Every answer card has the same three parts, in this order. 1. A short headline in plain words saying what is happening. 2. "Say to the customer": the words to read out, in one clearly marked block with a coloured edge and tinted background, so it is impossible to miss. 3. "Good to know" (for the agent only, never read out): shown only when it genuinely helps, for example "check with the customer before turning it back on, someone may have switched it off on purpose". If there is nothing useful to add, the section is left out. The old "ticket sentence" leaves the card; what gets logged is shown once, at the end, in the check-and-log step. Words follow one glossary: customer (never caller or operator); heating controls (never panel); turn heating on / turn heating off; put back to normal; switched off by hand (never forced); target temperature (never setpoint); no internal codes.

SECTION: One way of logging each issue
Every issue now ends the same way: a "Check and log" step. It lists what the customer said, what we found, and everything we did, with times. It also holds the notes box. One button finishes it. If nothing has been logged yet, the button is "Log for the IoT helpdesk and finish" and it creates the ticket. If we already logged automatically (because we changed the heating), the button is "Add to ticket #48213 and finish" and it adds to that same ticket, never a second one. After finishing, a green banner says "Logged: ticket #48213 is with the IoT helpdesk" and lists what it contains. Then come the existing "Add another issue" and "End call" buttons. "End with no action" is gone. Before anything is done, the choice is "No further action", which still goes through Check and log and still makes a ticket. After an action, Check and log is the only way out.

SECTION: Telling the agent when we logged something automatically
Changing the heating logs a ticket straight away, so the automatic switch-back later can write its result onto it. The screen now says so plainly, with the number: "We've logged this automatically to the IoT helpdesk as ticket #48213, because we changed the heating at the pub." If the heating controls don't respond, it adds the reason: "there may be a problem with the equipment or its internet connection." If the automatic ticket could not be made, the screen never claims it was. It says "We couldn't log this automatically. It will be logged when you finish," and Check and log then creates it and links it to the timer.

SECTION: Explaining zones to the customer
When the pub has more than one heating zone, the agent reads: "Your heating is split into sections, called zones, which were set up with the original pipework. Our system can't see which rooms each zone covers. Do you know which part of the pub each one heats? If you're not sure, I'll turn on all of them." (or "turn off"). The choices are "Zone 1 only", "Zone 2 only" and "All zones (not sure)". Nothing is pre-selected. With only one zone, the question is skipped.

SECTION: Saying what "normal" means
Where the timetable can be read, the screens now say what happens next, instead of just "back to its normal timetable". For example: "then it goes back to its normal timetable, which next comes on at 06:30 and heats the pub to 21°C." The timetable is read from the heating controls for each zone. One fact is still unconfirmed with Spencer: which weekday the stored timetable starts on (question SQ-13). So the time is only shown where that zone's timetable is the same every day, which makes the weekday irrelevant. Otherwise the sentence stays "back to its normal timetable".

SECTION: Turning the heating off until it's next due on
The fixed "Until 07:00" choice becomes "Until 06:30, when it's next due on". Good to know adds: "it heats to 21°C if the room is cooler than that." The server works out the time itself from the timetable, never trusting the screen. It uses the earliest next-on time of the chosen zones, so no zone stays off past its on time. Where the time can't be worked out safely (the timetable isn't the same every day, can't be read, or is more than 11 hours away), the choice falls back to "Until 07:00", as you decided in OOHDASH-141. The 11-hour limit keeps every switch-back inside the system's 12-hour retry window.

SECTION: Putting the heating back to normal early
A banner at the top of the site page shows anything we've changed ("Pub zone 1: heating turned on until 21:30, by Kelly") with "Put back to normal now". The same appears at the start of the heating questions. A second tap confirms. The result is in plain words: "Pub zone 1 is back to normal. Noted on ticket #48213." If the controls haven't confirmed yet: "We've asked the heating to go back to normal. If the heating doesn't switch off in the next few minutes, the IoT helpdesk is alerted automatically on ticket #48213." If someone changed it by hand since: "we've left it as it is, and logged it on ticket #48213 for the IoT helpdesk to check." The server checks the site is confirmed for this call and that the timer belongs to that site.

SECTION: Two live defects fixed separately first
As agreed, a small v1.5.4 hotfix goes out ahead of this work, built and gated separately. It fixes the three blank heating cards (summer setting, room-sensor timer, already off) and the pub heating "End with no action", which fails on every card today. It changes no wording. This design builds on top of it and then replaces those screens with the new standard.

SECTION: Tests the build must add
Server tests: putting the heating back to normal works for that site only, refuses another site's timer, handles every result the heating controls can give, and a finished issue adds to the existing ticket instead of creating a second one, only for the agent and site that made it. Also: the zone timetable is read correctly, including zone 2 on newer controls, and is shown only when it is the same every day. The "until next due on" time is worked out on the server and falls back to 07:00. Browser tests walk every heating screen. They check: one script block per card, no internal codes or banned words on screen, the zone question, both directions, "All zones", the result rows including a failed zone, the automatic-ticket message with its number, and Check and log in both forms (new ticket, add to existing). There is a syntax check of every browser script, and the notes box styling.

SECTION: What does not change
No timetable or optimum-start settings are ever written. Putting back to normal only ever returns a zone to automatic. The boiler output and output1Override are never written. The kill-switch exemption for switch-backs is unchanged. The other flows keep today's screens until the follow-on ticket. Nothing is released or switched on in production without your go.

DECISION: Who can put the heating back to normal early | Anyone who can change the heating, handler or IoT team, at that site only (recommended) | IoT team only
DETAIL: Handlers take the calls and can already turn the heating on or off. Limiting it to the IoT team would leave a handler who picked the wrong zone unable to undo it. Either way the server checks the timer belongs to the confirmed site.

DECISION: "All zones (not sure)" when the customer is too hot | Allow it for turning off as well as on (recommended) | Turning on only; turning off needs a zone picked
DETAIL: All zones off turns off all the pub heating for the chosen time. It is safe to allow because it can be put back to normal at once, and the off time never runs past the next on time or 07:00. Nothing is pre-selected either way.

DECISION: The new screen standard and wording for pub heating | Approve as shown in the prototype (recommended) | Approve with changes noted in your review
DETAIL: This covers the three-part card (headline, Say to the customer, optional Good to know), the glossary, and every pub heating screen's wording. It replaces the 2026-10-23 wording, which predates turning the heating on or off from here. The prototype shows every card. The same standard then goes to the follow-on ticket for the other flows.

DECISION: How each issue is logged | One ticket per issue: anything logged automatically is added to at Check and log (recommended) | A separate ticket for each action and for the final log
DETAIL: One ticket per issue means the IoT helpdesk sees the full story in one place: what the customer said, what we changed, the automatic switch-back result, and the agent's notes. The alternative is today's behaviour, which gives two tickets whenever the agent changes the heating and then logs the call.
-->

# OOHDASH-144 Design (v3): pub heating on/off for a set time, put back to normal, and the new agent-screen standard

Date: 2026-10-25 · Discovery: PR #146 (merged; D1 = C both surfaces, D2 = bundle) · Revised after James's prototype review (2026-10-25) · Base: main `7a55e7f` (v1.5.3 code reverted; prod on image `v1.5.2`) · Depends on: v1.5.4 hotfix (blank W4/W7/W9 cards, pub heating no-action 400)

**Clickable prototype (UI only):** [OOHDASH-144 prototype](mockups/OOHDASH-144-mockup.html)

## 1. Scope (James, 2026-10-25)

| Decision | Choice |
|---|---|
| Scope | 144 **sets** the standard (card layout, glossary, ticket model) and applies it fully to the pub heating (boiler-panel) flow. A follow-on ticket applies it to every other flow. |
| Live defects | Separate v1.5.4 hotfix first: W4/W7/W9 blank cards and `bp-noact` 400. No wording change. |
| "Off until" | Dynamic next-on time where safe (that zone's timetable is the same every day); else 07:00 |

Change list:

| # | Where | Change |
|---|---|---|
| A | `routes/api.js` `workspacePayload()` | `activeBoostHolds` (§4) |
| B | `routes/api.js` | `POST /api/sites/:siteNo/booster-holds/:id/cancel` (§5) |
| C | `services/overrides.js` | `revertOutcome` on hold doc; cancel prefix on Zendesk note (§5) |
| D | `services/tb-device.js`, `services/schedule.js` | read `CHZ2.schedule`; per-zone `timetable` decode (§6) |
| E | `services/boost-window.js`, `services/control.js` | `until-next-on` duration resolved server-side (§7) |
| F | `routes/api.js` `POST /outcomes` | append to an existing auto-created ticket (`appendToHoldId`), link new tickets to holds (§9) |
| G | `public/css/styles.css` | `.say`, `.gtk`, `.autolog`, `.wrapup`, notes-box classes (§8, §11) |
| H | `public/js/flows.js` | heating cards rebuilt on the standard; `bp-zones`; durations; result; **Check and log** (`wrapUpStep`) (§8–§10) |
| I | `public/js/views.js` | banner (§10.1) |
| J | `public/js/notes.js` | notes-box restyle (§11) |
| K | tests | §13 |

## 2. Review findings, cross-referenced across every flow (code-verified)

| James's point | Where it occurs | Evidence | Fixed in |
|---|---|---|---|
| "Tell the operator" label plus a separate script: two look-alike blocks | All flows | Heating: 3 labelled blocks (`flows.js:1065-1074`). The other 35 outcomes print guidance as a plain paragraph above an unlabelled `.script` (`outcomeCaptured/P1/Scope/NoAction`, `flows.js:328-421`; `control.js:285-412`). The confirm step repeats the guidance (`flows.js:263-273`). `.script` has the same background as `.reco` (`styles.css:113-114`). `.k` and `.tkt` have no CSS. | 144: heating. Follow-on: all others. |
| "Caller" instead of "customer" | All flows | About 77 on-screen lines; "customer" is used 0 times | 144: heating. Follow-on. |
| Technical wording | All flows | override (~80 lines), panel (~40), forced (14), setpoint (16), back-up/fallback (11), offline (17), gateway (12), revert, Salus, "W3" shown via `doneLine('Outcome: W3')` (`flows.js:1063`), raw device ids (`flows.js:1198`) | 144: heating. Follow-on. |
| "End with no action" after an action | Heating | It sits beside the turn-on/off buttons (`flows.js:795-872`). It reappears for a 2nd heating issue on the same call. **It fails on every pub heating card** (empty `detail` → 400, `flows.js:958` vs `api.js:376`). | Hotfix (400). 144 (model). |
| Auto vs manual tickets; ticket evidence | All outcomes | 3 models: chip then Record (`/outcomes`); automatic on boost dispatch (`control.js:737`); at control "Done" (`control.js:330`). The boost ticket is never registered in the flow (`flows.js:1045`), so a later capture is a 2nd ticket. Notes after a boost are lost (the `%%NOTESPOST%%` path is not used). "Ticket raised" shows even if the ticket failed (`flows.js:1042`). A silent late-sync ticket (`control.js:394, 420`). | 144: heating + model. Follow-on: control, others. |
| "Normal timetable" not explained; 07:00 fixed | Heating | `nextChange` is one panel-wide string, possibly from a DHW key (`tb-device.js:1307`). `CHZ2.schedule` is never read (`:1380`). 07:00 = OOHDASH-141 James-2. | 144 (§6, §7) |
| Zones not explained | Heating | No zone explanation exists today | 144 (§8.4) |
| Prototype-only labels | Mockup | "Hold heat OFF" and "Done, end this issue" don't exist in code; live is "Heat OFF (zone N)" and "Add another issue" / "End call" | Dropped |

IoT Support Dashboard: every OOH ticket is visible (search `tags:ooh`, `ooh-review.js:199`). Its outcome-chip map has no `boiler-boost` code, so boost tickets show a raw chip. That's out of scope here (other repo), noted for the follow-on.

## 3. Corrections carried from earlier versions (code-verified)

1. Cancel route role: same gate as boost (any signed-in OOH role), not `requireRole('iot')` (`auth.js:219`; `api.js:275`, `:565`). See Decision 1.
2. The result card end time is broken today (`act.revertAt` vs `revertAtMs`). Fixed in §10.3.
3. The workspace holds read is polled every 30 s (`views.js:143`). It is cheap and fails soft (§4).
4. A cancel can come back "not yet" (retry up to 12 h, `overrides.js:415-428`). Handled in §10.1.
5. Per-zone dispatch return shape is verified: `zoneOutcomes` (`control.js:693`), `overrideIds` (`:725`), action `zones/clamped/revertAtMs/overrideIds` (`:780-788`).
6. Cards misattribute OOH's own timers to "the panel". Handled by §8.3.

## 4. Workspace: `activeBoostHolds`

As v2. `overrides.activeBoostHoldsForSite(siteNo)` filters `status === 'active' && deviceType === 'boiler-panel' && String(siteNo)` match, sorted by `boilerZone`. It maps to `{ id, deviceId, boilerZone, direction, panelVersion, revertAt, holdLabel, createdBy, ticketId, ending }`. **`ticketId`** is new in v3 so screens can show evidence. `ending = !!(cancelRequestedBy || revertAttempts)`. On a store error the field is `null` and the client shows no banner or intercept. `reverting` and `revert-failed` are not listed. A hold retrying for up to 12 h stays listed as `ending`.

## 5. Put back to normal (cancel) route

`POST /api/sites/:siteNo/booster-holds/:id/cancel`, body `{ confirmToken }`. Same router and gates as `/boiler-boost` (Decision 1). The checks run in order:
1. `resolution.isConfirmed` → otherwise 409 `not-confirmed`.
2. The doc exists, is `boiler-panel`, and has the same `siteNo`. Otherwise 404 `hold-not-found`, the same for a foreign site.
3. `status === 'active'` → otherwise 404 `hold-ended`.
4. `overrides.cancelOverride(id, operator)`. A `ConcurrencyError` → 409 `hold-changed`.

Response: `{ result, hold: { id, boilerZone, direction, status, ticketId } }`.

`revertBoiler()` records `doc.revertOutcome` on every branch. The mapping is:

| Post-cancel doc | `result` |
|---|---|
| `reverted` + `written` | `reverted` |
| `reverted` + `already-auto` | `already-auto` |
| `superseded-by-other` | `superseded` |
| `reverted` + `same-direction-skip` | `left-forced` |
| `active` or `reverting` | `pending` |

Audit `boiler-boost-cancel`. The Zendesk revert note is prefixed `Put back to normal early by <name> at <HH:MM> (was due <HH:MM>).`. The kill-switch exemption is unchanged. The only write is zone → automatic (0).

## 6. Per-zone timetable (read only)

- **Read:** add `CHZ2.schedule` to the SHARED_SCOPE key list (`tb-device.js:1380`). It is already in the fetched set's family, and adds no new round trip.
- **Source key per zone:**

| Version | Zone 1 | Zone 2 |
|---|---|---|
| V1 | `output2Schedule` | `output3Schedule` |
| V2 | `CHZ1.schedule` | `CHZ2.schedule` |

- **New pure function** `zoneTimetable(raw, nowMs, tz)` in `services/schedule.js`. It reuses `parseInput`, the DST-safe local-time helpers and the entry shape `{ value, time, loops }`. It returns `{ everyDay, currentTempC, nextOn: { atMs, timeText, dayText, tempC } }` or `null`.
  - `everyDay` is true only when every entry has `loops === '1111111'`. Only then are `currentTempC` and `nextOn` computed, so the unconfirmed weekday order (SQ-13) cannot make them wrong.
  - `currentTempC` is the value of the latest entry at or before now (walking back across midnight).
  - `nextOn` is the first future entry, within 24 h, whose `value` is greater than the entry in force just before it (a step up = "comes on").
  - It returns null on any parse failure or empty schedule.
- **Payload:** each `heating.zones[]` gains `zone` (`CHZ1`/`CHZ2`) and `timetable` (above, or null). The panel-wide `nextChange` string stays for compatibility but is no longer shown on heating cards.
- **Wording rule:** say "comes on at HH:MM and heats the pub to N°C" only from `nextOn`. Say "Good to know: it only comes on if the room is cooler than N°C" where it helps. With no `nextOn`, use "goes back to its normal timetable" alone.
- **Day text:** today: "at 06:30"; tomorrow: "tomorrow at 06:30".

## 7. "Turn off until it's next due on"

- New `durationKey: 'until-next-on'` (OFF only). The browser shows it only when every selected zone has `timetable.nextOn` and the earliest `nextOn.atMs` is at least 15 min and at most 11 h away. Otherwise it shows the existing `until-0700`.
- `dispatchBoilerBoost` resolves it **server-side**. It re-reads the zone timetables (same decode) and sets `revertAtMs = min(nextOn.atMs over selected zones)`. If unavailable, it falls back to the `until-0700` boundary and returns `fallback: 'until-0700'`, so the result card says so honestly.
- **11 h cap reason:** the revert retry window is 12 h from creation (`overrides.js:415`). The existing 01:00/07:00 refusal rules are unchanged.
- **Label:** "Until 06:30, when it's next due on" (or "tomorrow at 11:00"). Good to know: "At 06:30 it heats the pub to 21°C if the room is cooler than that."
- ON durations are unchanged (30 min, 1 hour, 2 hours; 01:00 ceiling).

## 8. Pub heating screens on the new standard

### 8.1 Card anatomy (applies to every screen in §8–§10)

| Part | Class | Rule |
|---|---|---|
| Headline | `.reco b.hd` | Plain words, situation only |
| Say to the customer | `.say` (new) | Label "🗣 Say to the customer". Exactly one per card. Background `--primary-light`, 4px `--primary` left border, 14px, not italic, dark text |
| Good to know | `.gtk` (new) | Label "ℹ Good to know (for you, not the customer)". 14px, `--text-secondary`, no box. **Omitted when empty** |
| Buttons | `.outbtns` | The action first, then "Log it for the IoT helpdesk", then "No further action" |

Removed from cards: "What to tell the operator", "Ticket sentence", and `doneLine('Outcome: W…')`. The ticket wording moves to Check and log (§9) as "What we'll log".

### 8.2 Card copy (replaces the 2026-10-23 wording; Decision 3)

"With button" applies where Turn heating on or off is offered. Clauses in [brackets] fill from data or are dropped.

| Card | Headline | Say to the customer | Good to know |
|---|---|---|---|
| W1 can't see | We can't see the pub heating right now | I can't see your heating controls from here at the moment, so I'll log it for our team to check first thing. | The heating controls last reported [ago]. Don't tell the customer whether the heating is on or off. |
| W2 asking for heat | The heating controls are asking the boiler for heat | Our controls are asking your boiler for heat right now, so they're doing their job. The problem is most likely the boiler itself or the radiators, so please call your heating engineer. I'll log tonight's call. | none |
| W3 part off, with button | Part of the pub heating is off | Part of your heating is switched off at the controls right now. I can turn it on from here for a set time, and then it goes back to its normal timetable[, which next comes on at 06:30]. I'll log it for our team to look at properly. | If the customer says the cold area is the part that's already heating, it's more likely the boiler or radiators, so advise their heating engineer instead. |
| W3 without | (same) | Part of your heating is switched off at the controls. I can't change that from here, so I'll log it for our team to sort. | (same) |
| W4 summer setting | The heating is switched off for the summer | Your heating controls are still on their summer setting, which keeps the heating off. I can't change that from here, but I'll log it so our team can switch it back for you. | none |
| W5 switched off by hand, with button | Someone has switched the heating off at the controls | Part of your heating has been switched off by hand at the controls[ until 06:00]. I can turn it back on from here for a set time. I'll log it so our team can check why it was switched off. | Someone at the pub or an engineer may have done this on purpose, so check with the customer before turning it back on. |
| W5 without | (same) | Part of your heating has been switched off by hand at the controls. I can't change it from here, but I'll log that you need it back on so our team can sort it. | none |
| W6 off on timetable, with button | The heating is off on its timetable | Your heating is off on its normal timetable right now[ and is next due on at 06:30]. I can turn it on from here for a set time if you need it. I'll log the call. | [At 06:30 it heats the pub to 21°C, and only comes on if the room is cooler than that.] |
| W6 without | (same) | Your heating is off on its normal timetable right now[ and is next due on at 06:30]. I can't turn it on from here, so I'll log it for our team. | (same) |
| W7 room sensor | The heating is running on a simple timer | Your heating is running, but on a simple timer because one of the room temperature sensors isn't working, so it may feel cooler than normal. I'll log it for our team to fix the sensor. | none |
| W8 on, with button | The heating is on | Your heating is on at the controls right now. I can turn it off from here for a set time, and then it goes back to its normal timetable[, which next comes on at 06:30]. I'll log the call. | none |
| W8 without | (same) | Your heating is on at the controls and I can't change it from here tonight. Turning the radiators down will help in the meantime. I'll log it for our team. | none |
| W9 already off | The pub heating is already off | Our controls show your pub heating is off right now, so the warmth is coming from somewhere else, perhaps a radiator turned up by hand or another heater. I'll log the call. | Ask whether a portable heater or the rooms upstairs have heating on. |

Typographic apostrophes (’) are used inside strings. Every JS string delimiter is straight (test SYN-1).

### 8.3 When OOH changed the heating earlier (timer running)

Hold facts come only from `activeBoostHolds`, never from the TB decode.

| Situation | Card |
|---|---|
| Stage 1, any timer running (intercept, `reco-boost-hold`) | Headline "We've already changed the heating here". One row per timer: "Pub zone 1: heating turned on until 21:30, by Kelly" with `Put back to normal now`. Say: "We've already turned your heating on until 21:30. After that it goes back to its normal timetable[, which next comes on at 06:30]." (Off: "turned your heating off until 06:30 …"). Buttons: `The customer needs something else` (`bp-hold-continue`), `No further action` (→ Check and log). |
| Cold, and the off zone is OOH's off-timer (was W5) | Headline "We turned this heating off earlier". Say: "We turned that part of your heating off earlier, until [time]. I can put it back to normal now, so it follows its usual timetable again." Button `Put back to normal now`. No Turn heating on for that zone. |
| Hot, and an on zone is OOH's on-timer (W8) | Adds to Say: "We turned pub zone 1 on earlier, until 21:30. I can put that back to normal now." Button `Put back to normal now`. That zone is removed from the Turn heating off choices. |
| Any card showing the "switched on by hand" sentence for an OOH timer | Replaced by "Pub zone 1 is on because we turned it on earlier, until 21:30." |

### 8.4 Zone question (`bp-zones`)

Shown only when more than one zone is a candidate (candidates as v2: W3 = off zones, W5 = the off zone, W6 = all, W8 = on zones; minus zones under an OOH timer).
- Headline: "Which part of the pub?"
- Say: "Your heating is split into sections, called zones, which were set up with the original pipework. Our system can't see which rooms each zone covers. Do you know which part of the pub each one heats? If you're not sure, I'll turn on all of them." (Off: "turn off all of them".)
- Chips: `Zone 1 only` (`bp-zone-CHZ1`), `Zone 2 only` (`bp-zone-CHZ2`), `All zones (not sure)` (`bp-zone-all`). Single-select with `aria-pressed`, nothing pre-selected. `Continue` is disabled until one is chosen; `Back` is also offered.
- No Good to know (the script carries it).

### 8.5 How long (`bp-boost`)

- Headline: "Turn the heating on: how long?" (or "off").
- On: 30 minutes, 1 hour, 2 hours. Off: 1 hour, 2 hours, and either "Until 06:30, when it's next due on" (§7) or "Until 07:00".
- Say (on): "I'll turn it on now. After that it goes back to its normal timetable[, which next comes on at 06:30]."
- Good to know (off, dynamic option only): "At 06:30 it heats the pub to 21°C if the room is cooler than that."

## 9. One way of logging each issue: Check and log (`wrapUpStep`)

### 9.1 Behaviour

- **Entry points (heating):** `Log it for the IoT helpdesk`, `Customer will call their heating engineer` (W2), `No further action` on any card, the intercept, or the result card. Each sets `f.data.wrapKind` (`capture`, `advice`, `no-action`) and goes to `need: 'bp-wrap'`. After an action exists in the issue (`f.data.actions.length > 0`), the result card offers only `Finish and add notes` (→ Check and log).
- **`f.data.actions[]`** records each change in this issue: `{ kind: 'turn-on'|'turn-off'|'put-back', zones, untilMs, result, holdIds, ticketId, atMs }`. A boost success pushes one entry, with `ticketId` from the action. Put back to normal, from the intercept or a card, pushes one.
- **Screen** (`data-testid="wrap-up"`), titled "Check and log":

| Section | Content |
|---|---|
| What the customer said | `freeText` (if any) |
| What we found | The card headline |
| What we did | One line per action, e.g. "20:02 Turned the heating on, zones 1 and 2, until 21:30 (logged automatically, ticket #48213)"; "20:14 Put zone 1 back to normal". Or "Nothing changed". |
| What we'll log | The plain ticket wording for this outcome (replaces the old card "Ticket sentence") |
| Your notes | The notes box (§11), live |

- **Button**: if any action has a `ticketId`, it is `Add to ticket #48213 and finish` (`wrap-submit`); otherwise `Log for the IoT helpdesk and finish`. One click. A double-click is guarded by the existing `_pend_` pattern.
- **After success**: a green `.outcome` "✅ Logged: ticket #48213 is with the IoT helpdesk", followed by a bullet list of what it contains (what we did, plus "your notes"). Then `registerIssue(…, ticketId)` (so "This call so far" lists it), `stage = 99`, and the existing `outButtons()` ("Add another issue", "End call").
- **Failure**: "We couldn't log this: [message]" with `Try again`. Nothing is claimed.

### 9.2 Server (`POST /api/outcomes`)

New optional fields:
- `appendToHoldId`. The server loads that `OohOverrides` doc and requires all of `doc.siteNo === siteNo`, `doc.createdById === operator.id` and `doc.ticketId`. When they hold, it **appends** an internal comment `[OOH ISSUE SUMMARY]` (subject, actions, the ticket wording, caller words, notes) to `doc.ticketId` via `zendesk.addInternalComment`. It writes an audit entry and returns `{ ticket: { id: doc.ticketId }, appended: true }`. The Cosmos hold doc is the authority (durable), not the in-memory action map. If the checks fail, it returns 409 `append-refused`, and the client then offers `Log for the IoT helpdesk and finish` (a new ticket).
- `holdIds[]` on the create path. After creating the ticket, it calls `overrides.attachTicketToOverride(holdId, ticketId)` for each hold that has no `ticketId` (the auto-ticket-failed case), so switch-back notes land on it.
- `actions[]`: text lines included in the `[TRG]` first comment (create path) or the summary comment (append path).

The `no-action` type keeps creating a ticket (today's behaviour, now always with a non-empty `detail`). Tags are unchanged (`ooh`, so the IoT Support Dashboard picks it up).

### 9.3 Telling the agent we logged automatically (`.autolog`)

A blue-grey box with "📋" appears on the result card and in Check and log:

| Case | Text |
|---|---|
| Turn on or off succeeded | We've logged this automatically to the IoT helpdesk as ticket #48213, because we changed the heating at the pub. Add any notes when you finish. |
| A zone didn't respond, or not confirmed | We've logged this automatically to the IoT helpdesk as ticket #48213. The heating controls didn't respond, so there may be a problem with the equipment or its internet connection. |
| Auto ticket failed (`ticketId` null) | We couldn't log this automatically. It will be logged when you finish. |
| Put back to normal from the banner (no flow) | Noted on ticket #48213. |

## 10. Results and put-back-to-normal states

### 10.1 Banner (`renderBoostHoldBanner`, `views.js`)

The title is "We've changed the heating at this site". One row per timer.

| State | Row |
|---|---|
| active | 🔥 "Pub zone 1: heating turned on until 21:30, by Kelly" (off: ❄ "heating turned off until 06:30") · `Put back to normal now` |
| confirm | "Put pub zone 1 back to its normal timetable now?" · `Yes, put it back` · `Keep it` |
| working | "Putting it back… this can take up to 30 seconds." |
| done | ✅ "Pub zone 1 is back to normal[ and next comes on at 06:30]. Noted on ticket #48213." Say: "That's done. Your heating is back on its normal timetable." · `Dismiss` |
| pending | ⏳ "We've asked the heating to go back to normal, but the controls haven't confirmed yet. We'll keep trying. If the heating doesn't switch off in the next few minutes (off-timer: doesn't come back on), the IoT helpdesk is alerted automatically on ticket #48213." |
| changed by hand | ⚠ "Someone has changed pub zone 1 at the heating controls since we did, so we've left it as it is. Logged on ticket #48213 for the IoT helpdesk to check." · `Dismiss` |
| already finished | "This had already finished. Refreshing…" |
| error | "Couldn't put it back: [message]." · `Try again` |

### 10.2 Inside a flow

The same states render inline on the intercept or card. The action is pushed to `f.data.actions`. The card's buttons then become `The customer needs something else` and `Finish and add notes` (no "No further action"/"End with no action" after an action).

### 10.3 Turn on/off result (`outcome-boost`)

The header is "Heating turned on" / "Heating turned off". One row per zone (`boost-zone-result-<zone>`):

| Zone outcome | Row |
|---|---|
| CONFIRMED with hold | ✅ "Zone 1: on until 21:30[ (stopped at 01:00, the latest allowed)]" |
| IN-FLIGHT-TIMEOUT with hold | ⏳ "Zone 2: sent, but the heating controls haven't confirmed yet. It will still go back to normal at 21:30. If the heating doesn't come on, the IoT helpdesk will see it on ticket #48213." |
| NON-DELIVERY | ❌ "Zone 2: we couldn't reach the heating controls, so it wasn't turned on." |
| no hold saved | ⚠ "Zone 2: sent, but we couldn't set the automatic switch-back. The IoT helpdesk must check it on ticket #48213." |

- The end time comes from `act.revertAtMs`. With `act.fallback === 'until-0700'`: "(until 07:00, because the timetable couldn't be read)".
- Say: "That's done. Your heating will be on until 21:30, and then it goes back to its normal timetable[, which next comes on at 06:30]." For partial failure, say only the zones that worked plus "I've logged the rest for our team."
- Then the §9.3 auto-log box, then the button `Finish and add notes` → Check and log. Then `refreshWorkspace()` so the banner shows the timer.

## 11. Notes box (FLOW-BOX and POST-LINK), as v2

`.notes-group`: `--surface-variant` background, 1px border, 3px `--notes-accent` (#C7D2FE) left border, radius, padding. `.notes-label` gets 📝. `.notes-input` is 14px / 22px, with a 1.5px border and a primary focus ring. At `max-width: 700px` it is 16px (keeps the OOHDASH-119 iOS no-zoom and E13). All the inline styles in `notes.js` move to classes, and `--text-muted` becomes `--text-secondary`. The counter and autosave are unchanged. The placeholder becomes "Anything the customer told you that isn't captured above, e.g. engineer due at 7am" (glossary). In Check and log the box sits under "What we'll log".

**Flow footer** (`renderFlow`, `flows.js:222`, shared by all flows): "Operator: [name] · Everything here is recorded to the Zendesk ticket automatically" becomes "You: [name] · Each issue is logged to a ticket when you finish it". The old sentence is untrue today, because nothing is recorded until an outcome is logged. The new one is true for every flow, so it changes everywhere in 144.

## 12. Glossary (all new and changed strings)

| Use | Never |
|---|---|
| customer | caller, operator (on screen) |
| heating controls | panel, boiler panel |
| turn the heating on / off (for a set time) | boost, hold, Heat ON/OFF, override, force |
| put back to normal | cancel, revert, undo |
| normal timetable | schedule, auto, automatic mode |
| switched on/off by hand | forced, override |
| target temperature, "heats to N°C" | setpoint |
| summer setting | summer mode |
| simple timer (room sensor not working) | back-up cycle, fallback |
| IoT helpdesk | IoT team queue, TRG |
| zone 1 / zone 2 (explained on first use, §8.4) | CHZ1, output2, W-codes |
| if the heating doesn't switch off / come back on | if it doesn't take |

## 13. Tests the build must add

**Unit**

| ID | Case |
|---|---|
| BHC-1..11 | as v2 (holds read, cancel route checks and mapping, roles per Decision 1, Zendesk prefix, `revertOutcome`) |
| TT-1 | `zoneTimetable`: every-day schedule → `currentTempC`, `nextOn` (step-up only), midnight walk-back, DST day |
| TT-2 | any entry not `1111111` → `everyDay:false`, no `nextOn` |
| TT-3 | malformed/empty → null; V2 `CHZ2.schedule` is read and decoded for zone 2 |
| UN-1 | `until-next-on` → `revertAtMs` = earliest `nextOn` of the selected zones; more than 11 h, under 15 min, or no timetable → 07:00 with `fallback` |
| WR-1 | `/outcomes` with `appendToHoldId` (same site + creator + ticket) → appends, returns the same id, creates no ticket |
| WR-2 | `appendToHoldId` from another operator or site → 409 `append-refused`, nothing written |
| WR-3 | create path with `holdIds` → `attachTicketToOverride` called for holds lacking a ticket |
| WR-4 | `no-action` always has a non-empty `detail` |
| NB-1..3 | notes box (as v2) |
| SYN-1 | every `public/js/*.js` compiles; no curly-quote delimiters |
| LEX-1 | the rendered heating screens (fixture) contain none of: caller, operator, panel, override, setpoint, forced, revert, fallback, W1–W9, CHZ |

**Playwright** (`tests/boiler-boost.spec.js`, fixtures 9010 V2 / 9011 V1)

| ID | Case |
|---|---|
| BB-E1..E7 | updated to `Turn heating on/off` entry and the new copy |
| BB-E8..E10 | zone question: shown for 2 zones, skipped for 1, Continue disabled until chosen, single-select |
| BB-E11 | after turn-on, the banner appears with `Put back to normal now` |
| BB-E12..E13 | banner confirm, Keep it, done (with ticket number), already finished |
| BB-E14..E15 | intercept from `activeBoostHolds`, unaffected by `heating.zones[].on = null` |
| BB-E16 | partial failure row + auto-log reason text + ticket number |
| BB-E17 | end time is shown (`revertAtMs`) |
| BB-E18 | Decision 2 (All zones for off) |
| BB-E19 | every heating card: exactly one `.say`, `.gtk` only where listed in §8.2, no "End with no action" |
| BB-E20 | Check and log after turn-on → button `Add to ticket #N and finish` → append call → green banner with the same #N; "This call so far" lists it |
| BB-E21 | Check and log with no action → `Log for the IoT helpdesk and finish` → new ticket number shown |
| BB-E22 | after any action, no "No further action"/"End with no action" is shown |
| BB-E23 | off duration shows "Until HH:MM, when it's next due on" with an every-day fixture; "Until 07:00" otherwise |
| BB-E24 | timetable sentence present with an every-day fixture, absent otherwise |

## 14. Rollout

- The v1.5.4 hotfix ships first, with its own gates.
- 144 then builds on main, and the release gate requires CI green on the exact sha.
- Production stays on image `v1.5.2` until the hotfix. The ACR `latest` tag is the broken v1.5.3: never deploy it.
- No new flag. No deploy without James's go.

## 15. Follow-on ticket (to be raised after this gate)

"Apply the OOH agent-screen standard to all flows." It covers:
- the card anatomy and glossary for hot water, kitchen, lighting, fans, fridge, contractor, connectivity, other, Salus heating, and the callback/Tonight/ambiguous screens;
- Check and log for every outcome, including generic device control "Done" and the silent late-sync ticket;
- "customer" everywhere;
- the IoT Support Dashboard chip label for `boiler-boost`.

The inventory in §2 is its starting list.

## 16. Out of scope

- Room names for zones (not in TB).
- Putting `revert-failed` timers back to normal from the agent screen (stays admin).
- DHW (OOHDASH-136) timers.
- Writing any timetable.
- Confirming SQ-13 weekday order: needed only to extend §6 and §7 to timetables that vary by day. A question draft for Spencer is available on request.
