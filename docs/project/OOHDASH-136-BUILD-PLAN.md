<!--
gate:contract
TICKET: OOHDASH-136
PHASE: build
QUESTIONS: none
DECISIONS: none
SECTIONS:
- Summary
- Design Gate
- Live Version and Base
- What This Build Does
- Files Changed
- Config Constants
- Test Plan
- Rollback
- What Does Not Change
- Build Sequence
- Open Flags
- Effort Estimate
-->

# OOHDASH-136 Build Plan: DHW Override State Display (V1 and V2 boilerControl Panels)

**Version:** 1.0
**Date:** 2026-10-22
**Author:** Build doer (Claude Sonnet 4.6)
**Ticket:** OOHDASH-136
**Design gate:** PR #123 merged main at b1be401 (2026-10-22)
**Codebase base:** v1.4.4
**Target release:** patch v1.4.5

---

## Summary

This build plan implements read-only DHW (hot water) override state display for V1 and V2
boilerControl panels. It is display only: no control path, no ThingsBoard writes, no new
buttons.

It replaces the OOHDASH-135 Track 2 items (W5-A through W5-E), which are superseded by the
OOHDASH-136 design. Spencer's answers (received 2026-10-21) are fully incorporated. There are
no blockers. The T2-0 prerequisite gating checklist from OOHDASH-135 is satisfied.

A single additive object `boilerControl.dhwOverride` (9 fields) is added to the workspace
payload. A card is rendered at Hot water flow stage 0 on boiler-panel sites. The Heating flow
is not changed. No control path is touched. Existing payload fields are unchanged.

Base version: v1.4.4, main at b1be401. Ships as patch v1.4.5 via `npm run release`.

---

## Design Gate

Design gate PR #123 merged main at b1be401 (2026-10-22). The build spec is
`docs/project/OOHDASH-136-DESIGN.md`. All design decisions are binding. No further decisions
are needed in this plan.

---

## Live Version and Base

Live version is v1.4.4. Main is at b1be401. This work ships as patch v1.4.5 via `npm run
release`. No database migration is needed. No ThingsBoard schema changes are needed.

---

## What This Build Does

A single additive object `boilerControl.dhwOverride` is added to the workspace payload. It
carries 9 fields:

    visible, hiddenReason, panelVersion, panelLastSeenMs, mode,
    untilMs, confirmedAtMs, decodedAtMs, unreadableReason

A card is rendered at Hot water flow stage 0 on boiler-panel sites when `dhwOverride.visible`
is true. The card shows a headline, a coloured state tag, an explanation sentence, and a script
line. State tag colours follow existing CSS class conventions.

The Heating flow is not changed. No control path is touched. No ThingsBoard writes are made.
No new environment variables are added. Existing payload fields, escalation chips, and scope
rows are unchanged.

Version discrimination uses the CLIENT attribute `heating_scenario` for V2 and the SHARED
attribute `output1OutputMask` for V1. When neither is present the card is hidden with
`hiddenReason: 'version-unknown'`. When both are present, `heating_scenario` takes precedence
and the panel is treated as V2 -- this correctly handles the 7 known dual-marker sites.

### Browser recompute trigger

dhwOverrideOutcome is called once on each render of Hot water stage 0 using the flow's existing
render cycle. There is no standalone setInterval or background timer. The card reflects state at
the moment the user navigates to Hot water stage 0; if the user leaves the card open past an
untilMs boundary, the displayed state does not self-update until next navigation. U17/E10
simulate time passage with page.clock.tick() then trigger a flow re-navigation to force
re-render. Idle cost is zero; no teardown is needed.

---

## Files Changed

Seven files change. Four are source files, two are new test files, one is a fixture file.

**1. `config.js`**

Add 4 new named constants inside the exported `config` object. These sit alongside the
existing `control` block. All values are final; none are provisional. Each constant is
env-overridable using the same `parseInt(env(...), 10)` pattern used throughout the file.

The 4 constants are:

- `boilerPanelStaleThresholdMinutes`: staleness window for the panel's `lastActivityTime` in
  ThingsBoard. Value: 60. A panel last seen more than 60 minutes ago produces state
  `unreadable` rather than a decoded override.

- `boilerV1OverrideConfirmMinutes`: the re-confirmation window for V1 output4Override history
  rows. Value: 35. This covers two 15-minute heartbeats plus margin. Rows older than 35 minutes
  are discarded when computing the V1 state.

- `boilerV2OverridePastWindowHours`: how far in the past a V2 `DHW.override` end time may be
  and still be treated as "just ended" rather than implausible. Value: 6. A value outside the
  window -6h to +365d is rejected as implausible, including Spencer's shorthand sentinel values
  1 and -1.

- `boilerV2OverrideFutureWindowDays`: furthest future V2 end time accepted as real. Value: 365.

**2. `services/tb-device.js`**

Note: dhwOverrideOutcome must be kept textually identical in both files; U20 enforces this. A
change to one must touch the other.

Four changes within this file:

  a. In the existing client-attribute fetch for boilerControl panels, add `heating_scenario` to
     the list of attributes requested. Currently the fetch requests `site`, `salusLocation`,
     and `DHW.use_boiler`. The change adds `heating_scenario` to the same call -- no extra
     ThingsBoard round trip.

  b. New pure function `decodeDhwOverride(attrs, telemetry, historyRows, now)`. Returns the
     9-field `dhwOverride` object. Logic applied in order:

     Version discrimination: if `heating_scenario` is present in CLIENT attrs, treat as V2. If
     `output1OutputMask` is present in SHARED attrs, treat as V1. If neither, return
     `{ visible: false, hiddenReason: 'version-unknown' }`.

     V2 hide check: if `separate_dhw` is not 0 (absent counts as not-0), return
     `{ visible: false, hiddenReason: 'separate-dhw' }`.

     V1 hide check: if `output1OutputMask` index 3 is not true, return
     `{ visible: false, hiddenReason: 'dhw-not-wired' }`.

     No reading -- V2 if `DHW.override` absent, V1 if `output4Override` absent: return
     `{ visible: false, hiddenReason: 'no-reading' }`.

     Staleness: if `panelLastSeenMs` is missing or more than
     `BOILER_PANEL_STALE_THRESHOLD_MINUTES * 60000` milliseconds before `now`, return
     `{ visible: true, mode: 'unreadable', unreadableReason: <staleness description> }`.

     V2 decode: `DHW.override` is epoch seconds. Multiply by 1000. Plausibility check: reject
     if outside the window 6 hours past to 365 days future (including Spencer's shorthand
     sentinels 1 and -1). Value 0 = auto. Positive = on until `untilMs`. Negative = off
     until `abs(value) * 1000`. Value whose positive epoch is in the past but within 6 hours =
     auto with "An override ended at [time]" in the explanation.

     V1 decode: take the latest `output4Override` telemetry reading. If 0, return auto. If
     non-zero, use `historyRows` (newest-first, up to 35 minutes old). Filter out corrupt rows
     where `abs(value) > row timestamp + 20 minutes in ms`. From the remaining rows, take the
     newest valid row: 0 = auto, positive = on (`mode: 'on-v1'`), negative = off
     (`mode: 'off-v1'`). If no valid row remains or none is recent enough, return
     `{ visible: true, mode: 'cant-confirm', unreadableReason: <confirmation expired> }`.

     V1 output4Override values are epoch milliseconds (not epoch seconds). This differs from V2
     DHW.override which is epoch seconds. The V1 corruption check detects 25-digit values by
     comparing abs(value) against a plausible upper bound in milliseconds.

  c. V1 history read: when the function is processing a V1 panel and the latest
     `output4Override` reading is non-zero, make one extra ThingsBoard read of
     `output4Override` for the last 35 minutes (at most 20 rows, newest first). Failure of this
     read degrades only that panel to `unreadable` via `unreadableReason`; it does not fail the
     site.

  d. Twin pure function `dhwOverrideOutcome(dhwOverride, nowMs)` -- same logic as the
     `flows.js` twin (see below), exposed here for unit testing the server-side decode path
     without importing from the browser bundle.

**3. `routes/api.js`**

One change: in the `defaultBc` object (the safe default returned for sites without a
boilerControl panel), add:

    dhwOverride: { visible: false, hiddenReason: 'no-panel' }

This ensures the payload is always structurally complete; `flows.js` need not guard for a
missing `dhwOverride` key on any site.

**4. `public/js/flows.js`**

Note: dhwOverrideOutcome must be kept textually identical in both files; U20 enforces this. A
change to one must touch the other.

Two changes:

  a. New pure function `dhwOverrideOutcome(dhwOverride, nowMs)`. Takes the `dhwOverride`
     payload object and current time in milliseconds. Re-applies the time-based checks (60-
     minute staleness from `panelLastSeenMs`, V2 end-time-passed check, V1 35-minute
     confirmation check from `confirmedAtMs`). Returns an object with fields:
     `{ state, headline, explanation, script, ticketSentence }`.

     State values: `'auto'`, `'auto-ended'`, `'on-until'`, `'off-until'`, `'on-v1'`,
     `'off-v1'`, `'cant-confirm'`.

     Exact wording follows the design section "Exact Wording".

  b. In `FLOWR.hotwater` at stage 0: before the existing blue note ("Hot water here runs on
     the boiler panel..."), check if `boilerControl.dhwOverride.visible` is true. If so, call
     `dhwOverrideOutcome(dhwOverride, Date.now())` and render the card (headline, coloured tag,
     explanation, script line). Use existing CSS: `reco` class for the card, existing tag
     classes for colour. Test ids: `hw-dhw-override` for the card, `hw-dhw-override-tag` for
     the tag. Append `ticketSentence` to the captured outcome when "Log and escalate to IoT
     team" is tapped. No change to the Heating flow.

**5. `test/oohdash-136-dhw-override.test.js`**

New unit test file. Fixed clock: `2026-10-21T18:40:00Z` (epoch seconds 1792608000). Uses
Jest. Covers tests U1 through U19 as specified in the design's Test Scripts section. Tests
both `decodeDhwOverride` (server decode) and `dhwOverrideOutcome` (browser recompute, including
U17 and U18 time formatting).

**6. `tests/oohdash-136-dhw-override.spec.js`**

New Playwright e2e spec. Fixed clock via `page.clock`. Covers tests E1 through E12 as
specified in the design. Fixture sites 9361 through 9369 are consumed from
`data/fixtures/bridge-devices.json`.

**7. `data/fixtures/bridge-devices.json`**

Add 9 fixture sites (9361 The Plough Inn through 9369 The Swan). Each is a C&B site with one
boilerControl panel. The `boilerControl.dhwOverride` object is given directly; no ThingsBoard
call is made in the test fixture path. Site 9362 is shared by tests E2 and E10 (same fixture
entry).

---

## Config Constants

All four constants are final values. None are provisional. Each is a named integer constant
inside the `config` export object in `config.js`, following the same pattern as the existing
`control.classes` numeric entries.

    boilerPanelStaleThresholdMinutes = 60
    boilerV1OverrideConfirmMinutes   = 35
    boilerV2OverridePastWindowHours  = 6
    boilerV2OverrideFutureWindowDays = 365

---

## Test Plan

### Unit tests (Jest) -- U1 through U19

- U1: V2 auto state (DHW.override = 0)
- U2: V2 on-until state (positive epoch, in future)
- U3: V2 off-until state (negative epoch, abs in future)
- U4: V2 non-numeric DHW.override -- implausible, returns no-reading
- U5: V2 implausible value (sentinel 1 or -1) -- rejected, returns no-reading
- U6: V2 override ended within 6 hours -- returns auto-ended with "ended at" explanation
- U7: V2 boundary at exactly 6 hours past -- last accepted as auto-ended, one second later
  returns no-reading
- U8: V1 auto state (output4Override latest = 0)
- U9: V1 corrupt history with valid row -- corrupt rows (abs value too large) discarded, valid
  row determines state
- U10: V1 off state (latest non-zero, history row negative)
- U11: V1 not reconfirmed -- latest non-zero, history rows all older than 35 minutes, returns
  cant-confirm
- U12: V1 not wired (output1OutputMask index 3 false) -- returns dhw-not-wired hidden
- U13: dual-marker site (both heating_scenario and output1OutputMask present) -- treated as V2
- U14: all hidden cases (no-panel, version-unknown, separate-dhw, dhw-not-wired, no-reading)
  each return visible: false with the correct hiddenReason
- U15: staleness -- panelLastSeenMs more than 60 minutes before now, returns unreadable
- U16: staleness boundary -- exactly at 60-minute threshold
- U17: browser recompute (dhwOverrideOutcome) -- end time passes while card is on screen;
  state transitions from on-until to auto-ended without refetch
- U18: time formatting -- midnight, tomorrow, named day, BST/GMT clock change produce correct
  human-readable strings
- U19: V1 history read failure -- ThingsBoard call throws, panel degrades to unreadable,
  site-level result is still returned
- U20: parity -- import the tb-device.js twin and execute dhwOverrideOutcome for every input
  combination in the U1-U19 fixture table; assert each output matches the equivalent flows.js
  test case. Any divergence fails. This enforces that the two copies cannot silently drift.

### E2e tests (Playwright) -- E1 through E12

- E1: V2 auto state card visible on Hot water stage 0
- E2: V2 on-until card shows correct headline and end time
- E3: V2 off-until card shows correct headline and end time
- E4: V2 auto-ended card shows "ended at" explanation
- E5: V2 cant-confirm (unreadable) card shown with correct wording
- E6: V1 on state card shown
- E7: V1 off state card shown
- E8: V1 cant-confirm card shown
- E9: hidden card -- dhwOverride.visible false, no card rendered in Hot water flow
- E10: browser recompute without refetch -- end time passes, card state updates in-page
- E11: Heating flow shows no DHW override card (no card rendered on heating stage)
- E12: no raw epoch or key values visible in any card state

### Regression

Existing `tests/boilercontrol.spec.js` tests BC-E1 through BC-E5 must still pass. These cover
the existing boilerControl heating-scope row, isV1/isV2, and dhwControllable rendering. This
build adds the `dhwOverride` default to `routes/api.js` but does not change any of the fields
those tests assert against.

---

## Rollback

If `dhwOverride` causes a production incident the rollback is:

1. Remove the 4 new config constants from `config.js`.
2. Remove `dhwOverride: { visible: false, hiddenReason: 'no-panel' }` from the `defaultBc`
   object in `routes/api.js`.
3. Revert `services/tb-device.js`: remove `decodeDhwOverride`, the V1 history read, the
   `dhwOverrideOutcome` twin, and the `heating_scenario` attribute from the client attribute
   fetch.
4. Revert `public/js/flows.js`: remove the `dhwOverrideOutcome` function and the card render
   block from Hot water stage 0.
5. Remove `test/oohdash-136-dhw-override.test.js`.
6. Remove `tests/oohdash-136-dhw-override.spec.js`.
7. Remove the 9 fixture entries (9361-9369) from `data/fixtures/bridge-devices.json`.

No database migration is needed. No ThingsBoard schema changes are needed. No Kubernetes
environment variable changes are needed. Estimated rollback time: under 1 hour.

---

## What Does Not Change

The following are explicitly out of scope for this build:

- Heating flow (including the existing line 635 wording "This zone can't be adjusted remotely
  yet"; see Open Flags below)
- `WRITES_DISABLED`, `SALUS_IT500_CTL_ENABLED`, and all control paths
- `deriveBoilerControl`, `dhwControllable`, `isV1`, `isV2`
- Hot water scope row label
- Any ThingsBoard write path
- Escalation chips
- The 7 dual-marker sites' scope row display (heating_scenario-first rule corrects their
  dhwOverride decode but fixing the scope row is a separate ticket; see Open Flags)

---

## Build Sequence

Recommended order -- each step should be self-verifying before moving to the next:

1. Config constants (`config.js`) -- the 4 new entries. Verify `npm test` still passes.

2. `decodeDhwOverride` pure function in `services/tb-device.js` -- decode logic only, no
   ThingsBoard calls yet. Write unit tests U1 through U16 first; red-green-refactor.

3. Attribute fetch and V1 history read in `services/tb-device.js` -- wire `heating_scenario`
   into the existing fetch and add the conditional V1 history call. Verify U19.

4. Unit tests U17 and U18 -- these test `dhwOverrideOutcome` from `flows.js`, but write them
   first as a spec to drive the implementation.

5. `routes/api.js` defaultBc update -- one-line change; verify BC-E1 through BC-E5 still pass.

6. `public/js/flows.js` -- `dhwOverrideOutcome` function first, then the card render block at
   Hot water stage 0. Confirm U17 and U18 pass.

7. Fixture entries in `data/fixtures/bridge-devices.json` and e2e tests E1 through E12.

8. Full test run (`npm test` + `npm run test:e2e`). All U1-U19, E1-E12, and BC-E1 through BC-E5
   must pass before the build is handed to review.

---

## Open Flags

**Flag 1 -- dual-marker scope row (separate ticket recommended)**

Seven boilerControl panels carry both V2 and V1 markers:

    gk-6250, gk-6195, gk-6220, gk-6239, gk-6186, gk-4019, gk-6135

The shipped `deriveBoilerControl` treats them as neither V1 nor V2; their hot water scope row
shows incorrectly today. This design handles them correctly for the `dhwOverride` decode via
the `heating_scenario`-first rule, but fixing `deriveBoilerControl` for the scope row is not in
scope. A separate ticket is worth raising. Design confirmed not in scope for OOHDASH-136.

**Flag 2 -- Heating flow wording (separate ticket recommended)**

`flows.js` line 635 still reads "This zone can't be adjusted remotely yet" in the Heating
boiler-panel branch. The OOHDASH-135 build plan's W5-D wording change to "The IoT team
controls this panel directly from ThingsBoard" never landed because Track 2 was superseded by
OOHDASH-136. This design explicitly does not touch the Heating flow. The current wording is
noted here for James's decision: should a separate ticket be raised to update the Heating
branch wording? No action is taken in this build.

**AR-1 -- Client clock skew (accepted risk)**

Browser recompute uses client Date.now(). A skewed device clock will display incorrect DHW
override state. No guard is added; this is an accepted risk (same exposure as every other
time-based display in the dashboard).

**Flag 3 -- mockup reviewer-aid label**

The mockup at `docs/project/mockups/OOHDASH-136_DHW_STATES_MOCKUP_2026-10-21.html` includes an
"All states at a glance (clock 19:40)" panel that shows all card states on one page. This is a
reviewer aid only; operators never see it. The panel should be labelled clearly as "Reviewer
aid: shows all states on one page for review only, not shown to operators". The real product
shows one card, only on Hot water stage 0, only at boiler-panel sites with DHW on the panel.
The single-card view in the mockup is the reference. No code change is needed for the product
itself; this is a note for the reviewer.

---

## Effort Estimate

Approximate build time: 1.5 to 2 days.

- Config constants: 0.5 hours
- `decodeDhwOverride` function + attribute fetch + V1 history read: 3 hours
- Unit tests U1-U19: 2.5 hours
- `routes/api.js` defaultBc: 0.25 hours
- `flows.js` card and `dhwOverrideOutcome`: 2 hours
- E2e tests E1-E12 and fixtures: 2 hours
- Total: approximately 10 to 11 hours
