# Support-Desk Man-Marking Scripts — Stage 2 Supervised Live Control

*Companion to `TEST_STRATEGY_live-integrations.md`. For the IoT support-desk staff who can access and correct live assets.*

> **READ THIS FIRST.** These scripts drive **real device control on real, trading-estate assets.** They may only be run in an **agreed safe window (never a hot trading peak)**, on a **nominated low-risk device/site** (ideally closed/non-trading, or a bench device), with a **man-marker watching the physical/asset side who can revert within seconds**. If you are not that person, stop. Do not run these against a busy kitchen mid-service.

---

## A. Before the window opens — one-time setup

| Check | Confirmed? |
|---|---|
| **Stage 1 passed** (stubbed test pass signed off) | ☐ |
| **Safe window agreed** and off-peak (not a hot trading peak); site is closed/non-trading or a bench device is used | ☐ |
| **Man-marker present** with live-asset access (vendor portal / panel / on-site contact) for the specific device | ☐ |
| **SR-3 scoped TB write credential bench-proven** (A9) on a non-trading device before this window | ☐ |
| **`WRITES_DISABLED` fail-open default inverted** (C1) — default is safe | ☐ |
| **`/healthz` runtime store-degrade** (IM-01) landed — a mid-window Cosmos outage is visible | ☐ |
| **Kill-switch** location known to everyone (Admin → Device control kill-switch); everyone knows it is the fastest app-side stop | ☐ |
| **Comms open** (call/Teams) between Driver and Man-marker for the whole window | ☐ |
| **One capability / one device at a time**; smallest safe change first | ☐ |
| **Abort/revert criteria** (below) read aloud and agreed | ☐ |
| **Baseline captured**: current setpoint / mode / HW-boost / telemetry for the target device recorded, so "revert" has a known target | ☐ |

### Universal abort & revert criteria — apply to EVERY script

**Abort, revert, and stop the window if any of:**
- The device moves in a way the script did **not** predict (wrong direction / device / zone).
- UI says `applied` but the man-marker **cannot** confirm it on the asset (or vice-versa).
- A revert does not confirm and the value cannot be restored manually.
- Any real-world impact on a trading area (kitchen temp, hot water, comfort).
- Comms lost between Driver and Man-marker.

**Revert order:** (1) engage the **kill-switch** to stop further writes; (2) **man-marker restores the value on the vendor portal / at the panel** (authoritative fast path); (3) confirm the device reads back to the recorded baseline before continuing or closing.

**Roles:** **Driver** = operates the OOH dashboard. **Man-marker** = watches the real asset, confirms real-world result, reverts on the asset side. **Coordinator** = owns the window + abort call + this sign-off sheet.

---

## Script 1 — Heating setpoint change

**Capability:** setpoint `*Desired` write → device echoes `*Reported`/`*SyncStatus`.

**Preconditions**
- Target site **confirmed** in the OOH workspace (site-confirmation gate passed).
- Target heating device **online** on the device board.
- Baseline setpoint recorded (e.g. current = ___ °C). Choose the **smallest safe nudge** (e.g. +1 °C), staying within guardrail max.
- Man-marker has the device open on the vendor portal / panel.

**Steps**
1. Driver: open the device on the board, start a setpoint control action, set target = baseline **+1 °C**.
2. Driver: confirm the Popconfirm and dispatch.
3. Man-marker: watch the vendor portal / panel for the change.

**Expected UI result**
- Action shows **pending**, then **applied** only once the device echoes back (`*SyncStatus = synced`, `*Reported` = new value). Not on HTTP 200.
- An `OohAuditLog` entry is written (pending → synced).

**Expected real-world / asset result**
- The heating setpoint on the real device moves to baseline **+1 °C**, and nothing else changes.

**Confirm on the asset side**
- Man-marker sees `*Reported` / the panel value equal the new setpoint, and the device board telemetry agrees.

**Safe-abort + revert**
- If the value moves wrongly or UI/asset disagree: **kill-switch**, then set the device back to the recorded baseline (fresh control action or on the panel). Confirm it reads back to baseline.
- **Always revert to baseline at the end of the test**, even on pass.

**Sign-off:** Setpoint change — Driver: ______  Man-marker: ______  Result: **PASS / FAIL** ______  Notes: __________

---

## Script 2 — Frost-hold off (heating mode → off)

**Capability:** `modeDesired` write (frost/heating off).

> **Higher impact than Script 1** — turning heating off in a trading area is exactly the "havoc" case. Run only on a closed/non-trading area or a bench device, with the man-marker ready to turn it straight back on.

**Preconditions**
- Site confirmed; heating device online; baseline **mode** recorded.
- Man-marker confirms the area is safe to have heating off briefly (or it's a bench device).

**Steps**
1. Driver: start the "heating off / frost-hold off" action on the target device.
2. Driver: confirm Popconfirm and dispatch.
3. Man-marker: watch the mode on the vendor portal / panel.

**Expected UI result**
- **pending** → **applied** on device echo (`modeSyncStatus = synced`, `modeReported` = off). Audit entry written.

**Expected real-world / asset result**
- The device's heating mode goes to **off / frost**; no other zone or device affected.

**Confirm on the asset side**
- Man-marker sees the mode = off on the panel/portal; board telemetry agrees.

**Safe-abort + revert**
- Any unexpected behaviour, or heating-off is affecting the area: **kill-switch**, then **man-marker turns heating back on** (portal/panel) to the recorded baseline immediately. Confirm restored.
- **Restore baseline mode at end of test regardless of result.**

**Sign-off:** Frost-hold off — Driver: ______  Man-marker: ______  Result: **PASS / FAIL** ______  Notes: __________

---

## Script 3 — Hot-water boost

**Capability:** `hwBoostHoursDesired` write.

**Preconditions**
- Site confirmed; hot-water-capable device online; baseline HW-boost state recorded.
- Man-marker confirms a short boost won't disrupt trading (or it's a bench device). Use the **smallest boost duration** available.

**Steps**
1. Driver: start the hot-water-boost action; set the smallest duration (e.g. 1 h).
2. Driver: confirm and dispatch.
3. Man-marker: watch the boost state on the portal / panel.

**Expected UI result**
- **pending** → **applied** on echo (`hwBoostSyncStatus = synced`, `hwBoostReported` = requested). Audit entry written.

**Expected real-world / asset result**
- Hot-water boost engages for the requested (short) duration on that device only.

**Confirm on the asset side**
- Man-marker sees the boost active on the portal/panel; board agrees.

**Safe-abort + revert**
- If boost is unwanted/disruptive: **kill-switch**, then **man-marker cancels the boost** on the portal/panel. Confirm boost cleared / back to baseline.
- **Cancel the boost at end of test regardless of result.**

**Sign-off:** Hot-water boost — Driver: ______  Man-marker: ______  Result: **PASS / FAIL** ______  Notes: __________

---

## Script 4 — Override (timed hold) set + auto-revert

**Capability:** hold re-asserts a value then **auto-reverts exactly once** at revert time. Exercises `OohOverrides` (Cosmos) + the revert worker + device confirm.

> Use a **short revert timer** (e.g. a few minutes) so the auto-revert is observed **inside the window**. Do not set a long hold you won't be present to see revert.

**Preconditions**
- Site confirmed; device online; baseline value recorded.
- Choose a small held value (e.g. setpoint +1 °C) and a short hold.
- Man-marker watching the device for both the assert and the revert.

**Steps**
1. Driver: perform a control action **with a hold**, revert time a few minutes out.
2. Driver: confirm and dispatch; wait for **applied**.
3. Man-marker: confirm the held value on the asset.
4. Wait for the revert time. (Optionally, to test durability: coordinator restarts the app during the hold — the hold must survive and still revert.)
5. Observe the auto-revert.

**Expected UI result**
- Action **applied**; an **active hold** appears in Admin → Active timed overrides.
- At revert time the hold moves to **reverting** → **reverted** (revert confirmed by device echo). Audit entries for both assert and revert.
- After restart (if tested): the hold is **still present** and reverts **exactly once** (no double-revert).

**Expected real-world / asset result**
- Device holds the operator's value until revert time, then returns to the **captured original** value once.

**Confirm on the asset side**
- Man-marker sees the held value during the hold, and the **original value restored** after revert — and only once.

**Safe-abort + revert**
- If the hold or revert misbehaves (e.g. `revert-failed` alert, value not restored): **kill-switch**, then **man-marker restores baseline** on the portal/panel, then **Cancel the hold** in Admin so it can't retry. Confirm no active hold remains and the device reads baseline.
- If a `revert-blocked` alert appears (kill-switch on): decide per runbook — lift kill-switch (revert fires next cycle) or set manually then cancel.

**Sign-off:** Override + auto-revert — Driver: ______  Man-marker: ______  Result: **PASS / FAIL** ______  Notes: __________

---

## Script 5 — P1 escalation + real SMS

**Capability:** system-decided P1 → `escalateP1` sends a real SMS with a deep-link to the ticket in the SD-330 IoT Support dashboard; `OohSmsLog` record written.

> **Two-step target.** Dispatch to a **test handset held by the man-marker first**; only after that passes, repeat to the **real on-duty number**. Never send an untested P1 text to the real on-duty manager.

**Preconditions**
- `SMS_PROVIDER=twilio` with the reused IoT-dash Twilio account + from-number loaded.
- **Step-A:** `ESCALATION_ONDUTY_NUMBER` temporarily set to the **man-marker's test handset**.
- A flow outcome that the system classifies **P1** is prepared (contractor-on-site / vulnerable occupants / business-critical / stock-at-risk).
- D-2 deep-link exemption (signed token) available if testing the tap-through on a phone.

**Steps**
1. Driver: run a flow to a **P1** outcome that creates the ticket.
2. System: `escalateP1` dispatches the SMS to the configured number.
3. Man-marker (Step-A): confirm the text arrives on the **test handset**; tap the deep-link.
4. If Step-A passes: swap `ESCALATION_ONDUTY_NUMBER` to the **real on-duty number**, repeat once, and confirm receipt with the on-duty manager by prior arrangement.

**Expected UI result**
- P1 outcome recorded; `OohSmsLog` entry with `dispatchOk = true`, the escalation link, ticket id, dispatched-by. No `sms-dispatch-failed` alert.

**Expected real-world result**
- The SMS arrives: `OOH P1 — <site> (<no>): <summary>. Ticket #<id>: <link>`.
- The deep-link opens the correct ticket in SD-330 (with only the intended light challenge, if the D-2 exemption is live) — an expired/absent token is blocked.

**Confirm**
- Man-marker: text received on the handset; link lands on the right ticket.

**Safe-abort + revert**
- If the SMS misfires (wrong number, wrong content) or the deep-link is wrong: stop, do **not** proceed to the real on-duty number. Fix config; a `sms-dispatch-failed` alert means chase manually per runbook.
- **Reset `ESCALATION_ONDUTY_NUMBER` to the correct real on-duty value** at end of test.
- Clean up / mark the test P1 ticket (see Script 6 cleanup).

**Sign-off:** P1 SMS (test handset) — Driver: ______  Man-marker: ______  Result: **PASS / FAIL** ______
P1 SMS (real on-duty) — Driver: ______  Man-marker: ______  Result: **PASS / FAIL** ______  Notes: __________

---

## Script 6 — Ticket creation / reconciliation

**Capability:** every outcome writes an `ooh`-tagged Zendesk ticket with a `[TRG]` transcript + correct fields/category; a call that has a Zendesk Talk ticket **reconciles/auto-merges**.

**Preconditions**
- Zendesk auth working (B7 Bearer fix landed; token confirmed active).
- For reconciliation: a Zendesk **Talk call ticket** exists for the test call (or a suitable candidate to match against).
- Agree tagging: real outcome tickets in Stage 2, but keep a clear label so they can be found/cleaned if needed.

**Steps**
1. Driver: complete a triage flow to an outcome (non-P1 is fine here).
2. System: creates the `ooh`-tagged ticket with the `[TRG]` transcript, site field, and "Support Request" category.
3. For reconciliation: run a call that has a Talk ticket; let the app score and **auto-merge** (≥0.80) or **link** (0.50–0.79).

**Expected UI result**
- Outcome confirmed; ticket id surfaced; late-sync notes (if any) attach to this ticket.

**Expected real-world result**
- A Zendesk ticket exists, `ooh`-tagged, `[TRG]` transcript present, site + category set correctly.
- It surfaces in the **SD-330 OOH Review queue**.
- The Talk call ticket is **reconciled/auto-merged** (or linked) — not left orphaned.

**Confirm**
- In Zendesk: open the ticket, verify tags, `[TRG]` transcript, site/category, and the merge/link to the call ticket.
- In SD-330: confirm it appears in the OOH Review queue.

**Safe-abort + revert**
- If a ticket is malformed or reconciliation mis-merges: stop; correct config (e.g. `OOH_OPERATOR_AGENT_MAP`, thresholds). Mis-merges must be un-picked in Zendesk.

**Cleanup (end of window):** solve-and-tag or delete every test-induced ticket so the live SD-330 queue is not polluted; confirm none left `new`/`open`.

**Sign-off:** Ticket + reconciliation — Driver: ______  Man-marker: ______  Result: **PASS / FAIL** ______  Notes: __________

---

## Z. Window close-out & sign-off sheet

**Close-out checklist**
| Item | Done? |
|---|---|
| Every tested device **confirmed reverted to baseline** on the asset side | ☐ |
| No **active holds** left from testing (Admin → Active timed overrides clear) | ☐ |
| No outstanding **`revert-failed` / `sms-dispatch-failed` / `revert-blocked`** alerts | ☐ |
| `ESCALATION_ONDUTY_NUMBER` reset to the correct **real** on-duty value | ☐ |
| All **test tickets** cleaned up / correctly tagged; SD-330 queue clean | ☐ |
| Kill-switch left in the intended state (off, unless deliberately held) | ☐ |
| Baseline values re-confirmed on every touched device | ☐ |

**Overall Stage 2 sign-off**

| Capability | PASS/FAIL | Driver | Man-marker | Notes |
|---|---|---|---|---|
| 1. Setpoint change | | | | |
| 2. Frost-hold off | | | | |
| 3. Hot-water boost | | | | |
| 4. Override + auto-revert | | | | |
| 5. P1 SMS (test + real) | | | | |
| 6. Ticket + reconciliation | | | | |

**Window:** date/time ____________  Site/device: ____________  Coordinator: ____________

**Go/no-go outcome:**
- Device writes (go/no-go #3): **GO / NO-GO** — ____________
- Live SMS (go/no-go #4): **GO / NO-GO** — ____________

**Signatures:** Coordinator ____________  IoT lead ____________  Date ____________
