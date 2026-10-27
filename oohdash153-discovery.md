---
gate:contract
  SECTION current-behaviour
  SECTION correct-mechanism
  SECTION incident-evidence
  SECTION three-fixes
  SECTION design-questions
  DECISION approve-discovery | Approve — proceed to design | Block — needs more investigation
---

# OOHDASH-153 — Discovery: Clean up P1 SMS scaffolding

**Ticket:** OOHDASH-153 · **Phase:** Discovery · **Release:** R1
**Triggered by:** Zendesk ticket #51137 — site 6791 Five Bells Finchley (2026-10-26). Operator reported "text not sent"; IoT team saw the Zendesk note and raised a live P1 incident.

---

## SECTION current-behaviour — What the code does today (Approach A path)

When any P1 outcome is raised, the OOH dashboard runs the following sequence:

1. **Raises a Zendesk ticket** — tagged `ooh_p1`, subject prefixed `[OOH]`, category "Support Request".
2. **Calls `escalateP1()`** — in `services/escalation.js`. This module is a full Twilio REST caller (lines 33–48). Because `SMS_PROVIDER` defaults to `'log'` (`config.js:110`) and the env var is unset in production, the call runs in no-op log mode: no text is sent, `dispatchOk` is `false`, `sent` is `false`.
3. **Writes a confusing Zendesk note** — `addP1DispatchNote()` in `services/zendesk.js:400`, called from `routes/api.js:562`. In log mode this writes: `[TRG] ⚠️ P1 SMS NOT SENT — gateway in log mode. #ooh-p1-dispatch` followed by `ACTION NEEDED: phone the on-duty manager now`.
4. **Operator script** — `public/js/flows.js` contains seven P1 outcome paths. Each unconditionally tells the operator to say a text has gone to the on-duty manager. The `dispatchOk` flag is never read by the frontend to vary the script text.

**Result in prod:** operator reads the "a text has gone" script — false. Zendesk ticket carries a "NOT SENT" note — confusing. IoT Support team sees the note, concludes the SMS system broke, and escalates. Both are artefacts of Approach A running in permanent log mode.

**Confirmed script lines in flows.js claiming a text was sent:**

| Line | Script text (excerpt) |
|------|----------------------|
| 1894 | "...a text has gone to our on-duty manager and someone will call you back shortly..." |
| 2053 | "...a text has gone to our on-duty manager and someone will call you back shortly..." |
| 2131 | "...a text has gone to our on-duty manager and someone will call you back shortly..." |
| 2183 | "...a text has gone to our on-duty manager..." |
| 2328 | "...I've sent an urgent text to our on-duty manager..." |
| 2411 | "...I've sent an urgent text to our on-duty manager..." |
| 2450 | "...a text has gone to our on-duty manager and someone will call you back shortly." |

---

## SECTION correct-mechanism — What the intended mechanism is (Approach B)

The intended P1 escalation SMS mechanism is the **IoT Support Dashboard** (a separate product). The join contract is the `ooh_p1` tag written by the OOH dashboard to the Zendesk ticket. The IoT Support Dashboard polls for that tag and is meant to fire an SMS to the on-duty manager.

The OOH dashboard was never meant to send SMS directly. The decision to use Approach B was confirmed by James. `SMS_PROVIDER` was intentionally left unset in production, keeping `services/escalation.js` in permanent log-mode no-op.

**Status: UNRESOLVED end-to-end.** The OOH dashboard's output (ooh_p1 tag set) is confirmed correct (see incident evidence below). Whether the IoT Support Dashboard fires the SMS on receiving that tag — and specifically whether it paged the on-duty manager for ticket #51137 — cannot be determined from this codebase. This is flagged as a design-gate precondition (D4) requiring confirmation from Sam Day before the design gate can close.

**Key framing:** If Approach B is not firing, that is a bug in the IoT Support Dashboard, not the OOH dashboard. The three OOH-side fixes below are correct regardless — they fix false claims in OOH, which must be fixed whether Approach B fires or not.

---

## SECTION incident-evidence — What Zendesk ticket #51137 shows

Zendesk ticket #51137 (site 6791, created 2026-10-26T19:16:47Z) was read directly. Findings:

- Tags present: `gk_6791`, `internal`, `ooh`, `ooh_p1`, `tcat_support_request`. The `ooh_p1` tag is confirmed — OOH dashboard did its part of the Approach B join contract.
- Ticket status: `new`, unassigned. No agent has picked it up. Whether the IoT Support Dashboard paged the on-duty manager is unknown from this data.
- Subject: `[OOH] 6791 Five Bells (Finchley) - Something else - urgent, escalated as P1`.
- First comment includes the neutral audit line: "P1 escalation raised — on-duty manager to be paged".
- A second comment with "NOT SENT" was written by `addP1DispatchNote` — this is the false alarm.

**PROVEN:** OOH side of Approach B (raising ticket with ooh_p1 tag) worked correctly for this incident.
**UNRESOLVED:** Whether the IoT Support Dashboard paged the on-duty manager. Must be confirmed with Sam Day as a design-gate precondition.

---

## SECTION three-fixes — What needs to change (all valid regardless of Approach B status)

The three OOH-side fixes are scope-independent: they remove false claims made by OOH code, which are incorrect whether or not Approach B fires downstream.

**Fix 1 — Remove or gut `services/escalation.js`**

The Twilio caller is dead code — `SMS_PROVIDER` is permanently `'log'` in prod. Remove the file. Its callers in `routes/api.js` (the `escalateP1()` call, surrounding P1 block, the `p1` variable, and import) are removed with it.

The `OohSmsLog` Cosmos collection should not be silently abandoned. Replace the `escalateP1()` call with a lightweight positive audit write: "P1 ticket #X raised with ooh_p1 tag; OOH side complete; IoT Support Dashboard will page on-duty manager." This preserves OOH-side audit visibility without claiming SMS was sent or not sent — and answers the design-gate question D3 in advance (James confirms at design gate).

The `test/p1-dispatch-honesty.test.js` suite tests Approach A behaviour; delete it with the module.

**Fix 2 — Fix or remove `addP1DispatchNote`**

The "NOT SENT" note is the immediate source of the IoT team false alarm. Options decided at design gate (D1):

- **Remove it entirely:** the ticket, ooh_p1 tag, and first neutral comment are the audit record.
- **Replace with a neutral positive note:** e.g. `[OOH] P1 ticket raised. ooh_p1 tag set. IoT Support Dashboard will page on-duty manager. #ooh-p1-dispatch`. Accurate regardless of Approach B status; preserves the tag the IoT team searches.

**Fix 3 — Correct the seven operator script strings in `flows.js`**

All seven strings falsely claim OOH sent a text. Replace with wording that is accurate: the ticket is raised and the customer will be called back. The revised wording must not assert the manager was or will be automatically paged — that has not been confirmed. Safe wording (James confirms exact text at D2): "I've raised an urgent P1 ticket for this site and someone will call you back shortly."

---

## SECTION design-questions — Questions for the design gate

**D1 — Zendesk note (Fix 2):**
Remove `addP1DispatchNote` entirely, or replace with a neutral positive audit note? If replaced, agree the exact note text.

**D2 — Revised operator script wording:**
Exact text for all seven P1 script strings. Must not claim OOH sent a text. Must not promise automatic paging (Approach B end-to-end unconfirmed). Must reassure the customer a callback is coming.

Candidate: "I've raised an urgent P1 ticket for this site and someone will call you back shortly."

James confirms or supplies alternative at design gate.

**D3 — OohSmsLog replacement:**
Fix 1 proposes replacing the OohSmsLog entry with a positive audit write. James confirms whether to keep the Admin P1 log tab (redirected to positive audit entries) or remove it. If kept, the tab gives OOH a record of P1 tickets raised regardless of Approach B outcome.

**D4 — Approach B end-to-end verification (DESIGN-GATE PRECONDITION):**
Before the design gate closes, Sam Day must confirm whether the IoT Support Dashboard paged the on-duty manager for ticket #51137. This is a hard precondition — not optional:

- If YES (IoT Support Dashboard paged correctly): Approach B is confirmed live. Design can assert the relay works, and the Admin log tab note (D3) is a positive audit. Fix 3 wording can acknowledge the relay exists.
- If NO (IoT Support Dashboard did not page): There is an Approach B failure in the IoT Support Dashboard (separate scope, but must be acknowledged). Fix 3 wording stays humble. A design question arises about whether to add a fallback alert in OOH.

This question is for James and Sam Day, not engineering.

---

## DECISION approve-discovery

The OOH-side root cause is confirmed: Approach A scaffolding produces a false "NOT SENT" alarm and a misleading operator script. All three fixes are scoped to OOH code only and are valid regardless of Approach B status. Four design questions are ready; D4 is flagged as a hard design-gate precondition requiring Sam Day to confirm Approach B end-to-end outcome for ticket #51137 before the design gate can close.

**Approve — proceed to design** with D4 as the precondition before the design gate closes.

**Block — needs more investigation** if further scope is in question before the design can start.
