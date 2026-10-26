---
gate:contract
  SECTION current-behaviour
  SECTION correct-mechanism
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
3. **Writes a corrective Zendesk note** — `addP1DispatchNote()` in `services/zendesk.js:400`, called from `routes/api.js:562`. When provider is `'log'` this writes the comment: `[TRG] ⚠️ P1 SMS NOT SENT — gateway in log mode. #ooh-p1-dispatch` followed by `ACTION NEEDED: phone the on-duty manager now — the escalation text was NOT dispatched`.
4. **Operator script** — `public/js/flows.js` contains seven P1 outcome paths. Each unconditionally tells the operator to say "a text has gone to our on-duty manager" (or equivalent). The `dispatchOk` flag is never read by the frontend to vary the script text.

**Result in prod:** operator reads the "a text has gone" script. The Zendesk ticket carries a "NOT SENT" note. The IoT Support team sees the note, concludes the SMS system broke, and escalates.

**Confirmed affected script lines in flows.js:**

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

## SECTION correct-mechanism — What the correct mechanism is (Approach B)

The P1 escalation SMS is handled by the **IoT Support Dashboard** (a separate product), not the OOH dashboard. The join contract is the `ooh_p1` tag written by the OOH dashboard to the Zendesk ticket. The IoT Support Dashboard polls for that tag and fires an SMS to the on-duty manager.

This mechanism is confirmed working in production. The OOH dashboard's job is done once the Zendesk ticket is raised with the `ooh_p1` tag. The SMS fires independently downstream.

The OOH dashboard was never meant to send SMS directly. Approach A (the Twilio path in `services/escalation.js`) was scaffolded during an earlier design iteration and was never commissioned. The decision to use Approach B (IoT Support Dashboard relay) was confirmed by James. The `SMS_PROVIDER` env var was intentionally left unset in production, keeping `services/escalation.js` in permanent log-mode no-op.

---

## SECTION three-fixes — What needs to change

Three distinct changes are needed, none of them risky.

**Fix 1 — Remove `services/escalation.js`**

The entire file is Approach A scaffolding. In Approach B the OOH dash never sends an SMS; `escalateP1()` is called for every P1 but does nothing useful (log-mode no-op + OohSmsLog store write). Remove the file and its callers:

- `services/escalation.js` — delete
- `routes/api.js:557` — the `escalateP1()` call and surrounding P1 block (OohSmsLog writes, the `p1` variable, the `origin` assertion)
- Any remaining imports of `escalation.js`
- `OohSmsLog` collection usage (store entries for a path that never fires are noise)

Impact: the unit tests in `test/p1-dispatch-honesty.test.js` cover Approach A behaviour explicitly; those tests will be deleted as part of this fix.

**Fix 2 — Fix or remove `addP1DispatchNote`**

`services/zendesk.js:400` (`addP1DispatchNote`) writes the "NOT SENT" note. Two options:

- **Remove it entirely:** the Zendesk ticket already carries the `ooh_p1` tag and the `#ooh-p1-dispatch` tag added by the first comment. No audit note is needed; the ticket itself is the record.
- **Replace with a neutral audit line:** e.g. `[OOH] P1 raised. On-duty manager will be paged via IoT Support Dashboard (ooh_p1 tag set). #ooh-p1-dispatch`. This is accurate, creates no alarm, and preserves the `#ooh-p1-dispatch` anchor the IoT team searches.

James decides which at the design gate (see design questions below).

**Fix 3 — Correct the seven operator script strings in `flows.js`**

All seven strings (lines 1894, 2053, 2131, 2183, 2328, 2411, 2450) claim the OOH dash sent a text. The correct wording should reflect Approach B: the ticket is raised, the IoT Support Dashboard will page the on-duty manager, someone will call back. Exact wording is a design question below.

---

## SECTION design-questions — Questions for the design gate

**D1 — Zendesk note (Fix 2 option):**
Should the `addP1DispatchNote` be removed entirely (no note added beyond the ticket itself), or replaced with a neutral audit line confirming the `ooh_p1` tag was set and the IoT dashboard will page?

**D2 — Revised operator script wording:**
The seven P1 script strings need replacement text that is accurate for Approach B. Candidate options:

- Option A (minimal change): "I've raised this as a P1 — the on-duty manager will be contacted automatically and someone will call you back shortly."
- Option B (more explicit): "I've raised a P1 ticket — our IoT team will be paged automatically and someone will call you back shortly."
- Option C (James supplies preferred wording)

The wording must not claim the OOH dash sent a text, must reassure the customer that a callback is coming, and must be consistent across all seven paths.

**D3 — `OohSmsLog` store collection:**
With `escalation.js` removed, the `OohSmsLog` Cosmos collection has no writer. Should the Admin P1 log tab (which reads this collection) be removed or redirected to a different data source (e.g. Zendesk ticket query by `ooh_p1` tag)?

---

## DECISION approve-discovery

Root cause confirmed. Approach A scaffolding is the sole source of the "NOT SENT" alarm and the misleading operator script. No further investigation is needed before design. Three fixes are well-scoped.

**Approve — proceed to design** to resolve the design questions (D1 wording, D2 script text, D3 log tab) and produce the design gate artefact.

**Block — needs more investigation** if further evidence is required before scoping the fix.
