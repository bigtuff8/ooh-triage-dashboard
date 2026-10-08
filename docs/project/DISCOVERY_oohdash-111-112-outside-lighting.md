<!-- gate:contract
SECTION: What this is.
Two lightweight UI stories raised at the 2026-10-07 standup — both confined to public/js/flows.js, with OOHDASH-111 touching the P1 escalation path in routes/api.js. No new services, no schema changes. Discovery confirmed the Outside Lighting triage outcome currently fires two "capture" outcomes and zero P1 outcomes; the P1 plumbing (tag, SMS, audit) already exists and is correctly gated. Both stories are feasible as described with one open question on 111: which outcome branch (or both) becomes P1.

DECISION: For OOHDASH-111, confirm whether only the "still not working" branch escalates to P1, or whether the override-succeeded branch also escalates. The brief says "outside lighting triage outcome" (singular) — most likely it is the "still not working" path, but this must be confirmed before build.

DECISION: For OOHDASH-112, confirm the exact wording for the three supporting-text points (one-off override, schedule resumes, dusk-till-dawn sensor). The discovery draft wording below is for review; it should not ship verbatim without sign-off.
-->

# Discovery — OOHDASH-111 & OOHDASH-112: Outside Lighting P1 escalation + supporting text

**Date:** 2026-10-08
**Source:** OOH IOT Dash – Catch up standup, 2026-10-07
**Stage:** Discovery (pre-build)
**Artefact owner:** Discovery doer

---

## 0. Recurrence check

Neither story is a repeat-fix. Both are net-new requirements (new escalation behaviour + new copy). No prior "Live" ticket in this area. Recurrence check passed — not applicable.

---

## 1. Orient — what exists today

The OOH Triage Dashboard (v1.3.3, live at https://ooh.airedale-group.io) is a Node/Express app. The guided triage flows are defined entirely in one client-side file: `public/js/flows.js`. Supporting text, script lines, and outcome classification are all authored inline in that file. No separate data/config layer holds outcome definitions — they are code.

The P1 escalation path is a two-stage mechanism:
1. The browser flow calls `outcomeP1(...)` (flows.js) → POSTs `{type:'escalate-p1'}` to `/api/outcomes`
2. `routes/api.js` detects `isP1 = type === 'escalate-p1'` → adds `extraTags: ['ooh_p1']` to the Zendesk ticket, then calls `escalation.escalateP1(...)` with `origin: 'ooh-dashboard'`, which triggers the on-duty-manager SMS

---

## 2. Verified current state by file

### 2.1 Outside Lighting flow definition

**File:** `public/js/flows.js:585–614`
**Key:** `FLOWR.lighting(ws, f)`

The flow has two stages:

**Stage 0 (rendered immediately):**
- Looks up `ws.devices.find(d => d.kind === 'lighting')`
- If no device: renders "not on Lighthouse" scoped message + shortcut
- If device found: renders a `div.zoneread` (if switchable via `canSwitch(lg)`), then a `div.alert.info`, then a `div.script` with the current manual-override guidance, then two chips:
  - "Caller sorted it with the override" → `flowStep({r:'ok'})`
  - "Still not working — capture & escalate" → `flowStep({r:'cap'})`

**Stage 1 outcomes (both current, both `outcomeCaptured`):**

| Branch | `r` value | Current outcome type | Zendesk tag | SMS fired? |
|---|---|---|---|---|
| Override resolved it | `'ok'` | `outcomeCaptured` | `ooh` only | No |
| Still not working | `'cap'` | `outcomeCaptured` | `ooh` only | No |

Neither lighting branch currently calls `outcomeP1`. Outside Lighting is not in the auto-P1 set. Verified by reading lines 597–614: both branches call `outcomeCaptured(...)`.

**Current alert text (stage 0), lines 593–595:**
```
div.alert.info:
  If switchable: "This lighting circuit can be switched on/off directly above — the change only counts once the device confirms."
  If not switchable: "External lighting can't be switched remotely from here yet (on the priority list with our platform team). [+ 'lighting controller not responding' suffix if offline]"

div.script (handler read-aloud):
  "There's a manual override for the outside lights [+ fuse board check if offline]. If you have the Lighthouse lighting switch, flick it to override and they'll come on."
```

**Current `OohCaptureClass` for both branches:** `'lighting'`

### 2.2 Existing confirmed auto-P1 outcomes

All three live P1 outcomes are in `public/js/flows.js`:

| Code | Outcome | Location | P1 trigger condition |
|---|---|---|---|
| K3 | Kitchen equipment off during service | `flows.js:566` | Caller says kitchen is needed for service RIGHT NOW |
| FR1 | Refrigeration temperature alarm — stock at risk | `flows.js:654` | Caller confirms stock is at risk |
| CTR1 | Contractor on site needs IoT support | `flows.js:789` | Always — contractor calls are always urgent |

### 2.3 P1 escalation mechanism — how it works end-to-end

1. **Flow renderer** calls `outcomeP1(f, key, {...})` — `flows.js:242–249`
2. `outcomeP1` calls `finishOutcome(f, key, { type: 'escalate-p1', ... })` — `flows.js:243`
3. `finishOutcome` POSTs to `POST /api/outcomes` with `type: 'escalate-p1'` — `flows.js:206`
4. **API route** (`routes/api.js:253`) detects `isP1 = type === 'escalate-p1'`
5. `createOutcomeTicket(...)` called with `priority: 'urgent'` and `extraTags: ['ooh_p1']` — `routes/api.js:264–268`
6. `escalation.escalateP1(...)` called with `origin: 'ooh-dashboard'` — `routes/api.js:275`
7. `escalation.js:69` validates `origin === OOH_ORIGIN` (fail-closed guard). Verified origin → SMS sent via Twilio or logged
8. `addP1DispatchNote(...)` posts corrective dispatch-result comment on the ticket — `routes/api.js:280`

The `ooh_p1` tag is applied at `routes/api.js:267`:
```js
extraTags: isP1 ? ['ooh_p1'] : []
```
This is the only place `ooh_p1` is set. No config, no array, no separate registry — adding a new P1 outcome requires only calling `outcomeP1(...)` in the flow renderer.

### 2.4 Supporting-text rendering path

**File:** `public/js/flows.js:591–595` (inside `FLOWR.lighting`)

Supporting text is authored as template-literal HTML strings in the renderer function. Two elements carry caller-facing or operator-facing text:

- `div.alert.info` — informational panel for the handler (not read aloud)
- `div.script` — the read-aloud script line the handler speaks to the caller (rendered in a `.script` CSS class — `public/css/styles.css`, verified as a styled block)

**Responsive path:** The `.flowpanel` / `.flowbody` layout uses CSS grid (`@media(max-width:1100px)` collapses to single column — `styles.css:93`). There is no separate mobile rendering path for flow content — the same HTML is served to all viewports. The CSS grid adapts the surrounding chrome; the text within `.flowbody` is identical on desktop and mobile. Source for both: `public/js/flows.js` (no server-side rendering of flow content).

### 2.5 Anti-reinvention check

- No existing service, config, or data layer holds "outcome priority" as a separate field. P1 is hard-coded by calling the right render function in the flow. No parallel mechanism exists; the build extends the same pattern as K3/FR1/CTR1. PASSED.

---

## 3. Delta: current vs target

### OOHDASH-111 — Outside Lighting P1

| Dimension | Current state | Target state |
|---|---|---|
| Outcome type (still not working) | `outcomeCaptured` | `outcomeP1` |
| Zendesk tag | `ooh` | `ooh` + `ooh_p1` |
| Zendesk priority | `normal` | `urgent` |
| SMS to on-duty manager | Not sent | Sent |
| Audit outcome | `'captured'` | `'p1'` |
| `OohCaptureClass` | `'lighting'` | Replaced by `p1Summary` field |
| Override-resolved branch | `outcomeCaptured` (unchanged) | Unchanged (confirmed capture) |

**Open question (must be answered before build):** Does ONLY the "still not working" branch escalate to P1, or does the "resolved with override" branch also become P1? The standup brief says "the Outside Lighting triage outcome" (singular), which points to "still not working" — but the trigger condition is ambiguous. See Section 4.

### OOHDASH-112 — Supporting text

| Dimension | Current state | Target state |
|---|---|---|
| `div.script` content | Generic override instruction, no context about one-off nature or sensor logic | Must convey: (1) override is one-off/disposable, (2) schedules resume from previous day, (3) dusk-till-dawn via light sensor |
| `div.alert.info` content | Either "can switch here" or "not remotely yet" | May need supplementary context for handler |
| File | `flows.js:593–595` | Same file, same location |

---

## 4. Risks and open questions

| # | Item | Likelihood | Impact | Mitigation / action needed |
|---|---|---|---|---|
| R1 | **Which branch becomes P1 is unspecified.** The brief says "the Outside Lighting triage outcome" but there are two. If both become P1 (including override-resolved), operators would be paged even when the caller self-served. Most likely intent: only "still not working" escalates. | Medium | High | **DECISION NEEDED before build** — confirm with the standup caller or product owner. |
| R2 | **Override-resolved outcome + P1 mismatch.** If the "sorted with override" branch is also made P1, the handler card must not claim an SMS was sent when the call is already resolved. The existing card wording for `outcomeP1` includes "someone will call you back shortly" — this would be wrong when the caller has already sorted it. | Low (if only one branch changes) | Medium | If only "still not working" → P1, this risk is moot. |
| R3 | **SMS provider still in log mode.** `config.js:100` shows `SMS_PROVIDER` defaults to `'log'` (no send). If the live environment hasn't had `SMS_PROVIDER=twilio` set and tested, adding Outside Lighting to the P1 set changes visible behaviour for K3/FR1/CTR1 as well — the P1 mechanism is shared. UNVERIFIED (env var not readable from source). | UNVERIFIED | High | Confirm `SMS_PROVIDER` is set to `twilio` in the live `.env` / cluster secret before enabling any new P1 path. Owner: Spencer / IoT ops. |
| R4 | **Outside Lighting is not always actionable.** When the site has no `d.kind==='lighting'` device, the flow returns early with a scoped message — no change needed there. When the device is offline, the existing flow already routes to connectivity. The P1 branch applies only when a device IS present AND the override did not resolve it — this is the right scope. | Low | Low | None; the existing guard structure handles this correctly. |
| R5 | **Supporting text wording (OOHDASH-112) not yet signed off.** The three required points (one-off override, schedule resumes, sensor logic) need subject-matter input to get the exact phrasing right. Draft wording in Section 5 is for review only. | Medium | Low | Review draft wording with IoT/ops before build. |
| R6 | **Two-outcome-branch script divergence.** If OOHDASH-112 requires different handler scripts for "device online" vs "device offline" paths (currently already branched at `flows.js:593`), the update needs to handle both variants of the `div.script` template. | Low | Low | Build must update both branches of the conditional. Confirm whether the sensor/schedule guidance applies in both online and offline states. |

**Cost/token-efficiency assessment:** Both stories are pure client-side JS edits — no LLM usage, no API calls, no new infrastructure. Cost is zero at runtime. No background/polling component introduced. Criteria fully satisfied.

**Silent-running assessment:** No new background component. No polling. Not applicable.

---

## 5. Curatable requirements suite

Each item is independently keepable/cuttable/deferrable.

### OOHDASH-111 requirements

| ID | Requirement | Business outcome | Priority |
|---|---|---|---|
| 111-R1 | The "still not working" branch of the lighting flow calls `outcomeP1(...)` instead of `outcomeCaptured(...)` | On-duty manager is paged when outside lights cannot be resolved remotely | Must have |
| 111-R2 | The Zendesk ticket is created with `priority: 'urgent'` and tag `ooh_p1` | IoT Support dashboard sees lighting failures at P1 priority; SLA tracking fires | Must have |
| 111-R3 | The on-duty manager SMS is dispatched via the existing escalation path (`origin: 'ooh-dashboard'`) | SMS fires on the same path as K3/FR1/CTR1 — no new infrastructure | Must have |
| 111-R4 | The handler outcome card displays the standard P1 confirmation ("text has been sent…") or fallback ("phone the manager now") | Handler knows the escalation status | Must have |
| 111-R5 | The "resolved with override" branch remains `outcomeCaptured` (no P1) | Caller self-served — no need to page the manager | Must have |
| 111-R6 | A `p1Summary` string is added to the `outcomeP1` call describing the escalation (e.g. "External lighting not responding") | SMS body is meaningful to the on-duty manager | Must have |

### OOHDASH-112 requirements

| ID | Requirement | Business outcome | Priority |
|---|---|---|---|
| 112-R1 | The `div.script` conveys that the manual override is a one-off/disposable action (lights go back to schedule automatically) | Caller understands they are not permanently breaking anything | Must have |
| 112-R2 | The `div.script` conveys that schedules resume on the normal schedule from the previous day | Caller knows to expect normal operation at next sunset | Must have |
| 112-R3 | The `div.script` or `div.alert.info` conveys that all units have light sensors and should come on dusk-till-dawn based on light level | Handler can explain expected automatic behaviour to the caller | Must have |
| 112-R4 | The updated text applies in both the "device online" and "device offline" script variants (there are two conditional branches at `flows.js:593`) | Both script paths are consistent | Must have |
| 112-R5 | No existing button labels, flow chips, or outcome classification change (text-only update) | OOHDASH-112 is not a behaviour change | Must have |

---

## 6. Draft acceptance criteria

### OOHDASH-111

1. Given the Outside Lighting flow reaches the "still not working" chip AND the operator clicks it, the outcome card rendered is the P1 card (red `outcome p1` class, "Escalated — P1" heading, dispatch status line) — NOT the blue captured card.
2. The Zendesk ticket created by that path carries tags `['ooh', 'ooh_p1']` and `priority: 'urgent'`.
3. `escalation.escalateP1` is called with `origin: 'ooh-dashboard'` (verified by the existing `p1-dispatch-honesty.test.js` pattern — the test suite's origin-guard assertions cover this path transitively once the flow calls `outcomeP1`).
4. The "Caller sorted it with the override" path still produces a captured outcome (blue card, no SMS, no `ooh_p1` tag).
5. When `SMS_PROVIDER=log`, the handler card shows "Text not sent — phone the on-duty manager now" (existing log-mode behaviour, unchanged, now applied to lighting as well as K3/FR1/CTR1).

### OOHDASH-112

1. The `div.script` in the lighting stage-0 output contains all three required points: (a) the override is one-off/disposable, (b) schedules resume from the previous day's schedule, (c) units have light sensors and should work dusk-till-dawn.
2. Both conditional branches (online device path and offline device path) at `flows.js:593` include the updated guidance.
3. No existing chip labels, step headings, or outcome classifications are altered.
4. The update passes a visual review in the live app — the script text renders correctly inside the `.script` CSS block on both desktop and the `@media(max-width:1100px)` collapsed layout.

---

## 7. Recommended build approach and sizing

### OOHDASH-111 — SIZE: S

Single-file change. In `public/js/flows.js`, stage 1 of `FLOWR.lighting`, replace the `outcomeCaptured` call in the `r:'cap'` branch with an `outcomeP1` call using the same pattern as K3/FR1/CTR1. Add a `p1Summary` string. No server-side changes needed — the `/api/outcomes` route already handles `type:'escalate-p1'` generically.

**Exact change location:** `flows.js:607–613` (the `r:'cap'` else branch of stage 1).

**Prerequisite (must resolve before build starts):** Confirm which branch(es) become P1 (R1 above). Confirm `SMS_PROVIDER=twilio` is active in production (R3 above).

### OOHDASH-112 — SIZE: S

Single-file change. In `public/js/flows.js:593–595`, update the `div.script` template literal in `FLOWR.lighting` stage 0. Update both conditional branches (online and offline). No logic change — text only.

**Draft wording for review (not final):**
```
"There's a manual override for the outside lights [+ fuse-board check if offline]. If you have the Lighthouse lighting switch, flick it to override — this is a temporary, one-off action. The lights will come back onto their normal schedule automatically from tomorrow evening. All units have a built-in light sensor so they should come on at dusk and go off at dawn based on the available light."
```

---

## 8. Customer-experience success criteria (for design doer)

**Persona:** On-duty OOH handler, receiving a caller report that the outside lights are not on. Typically late evening (between 18:00 and 23:00). The caller may be anxious about safety or security on the car park. The handler has limited time and needs a clear, confident script.

**Journey:**
1. Handler identifies "External lighting" issue via tile or keyword
2. Handler reads live device status (online/offline)
3. Handler gives the caller the manual override guidance (current)
4. Caller either resolves or does not
5. If not resolved: handler currently captures — under OOHDASH-111 this becomes a P1 escalation

**Reassurance vs friction calibration:**
- Stage 0 (override guidance): LOW friction — this is routine. The script should be fast and confident.
- Stage 1, override succeeded: LOW friction — captured quickly, call closed.
- Stage 1, override failed (new P1 path): HIGH reassurance. The caller is told something specific is happening ("a text has gone to our on-duty manager"). Handler must not feel uncertain about next steps.

**"Great looks like…":**
The handler reads a script that makes the caller confident the situation is understood and being acted on. If the override worked: caller knows it will be back to automatic tomorrow. If not: caller knows an escalation is in motion — not just "logged for Monday". The P1 outcome card should be as clear and directive as the K3 and fridge cards already are.

---

## 9. End-to-end testing scope (for design doer / tester)

**OOHDASH-111 — paths to prove:**
1. Happy path: lighting device present + online → override guidance → "still not working" → P1 outcome card rendered correctly → Zendesk ticket has `ooh_p1` tag and `urgent` priority → SMS log entry created
2. Override resolved path: same setup → "sorted with override" → captured outcome card (NOT P1) → no `ooh_p1` tag
3. Log-mode P1: as (1) but with `SMS_PROVIDER=log` → handler card shows "phone the manager" fallback, not "text sent"
4. No lighting device on site: flow returns scoped message → no P1 path reachable (regression guard)
5. Device offline: flow currently re-enters connectivity branch → no change expected (regression guard)

**OOHDASH-112 — paths to prove:**
1. Online device path: script contains all three points (one-off, schedule resumes, sensor-based)
2. Offline device path: script contains all three points (one-off, schedule resumes, sensor-based) in addition to fuse-board check
3. Switchable device path: alert text and script text both render without layout issues in `.flowbody`
4. Mobile (≤1100px viewport): script block reads correctly in the collapsed layout

**Unhappy paths that matter:**
- Outcome POST fails mid-P1: existing retry mechanism (`_err_` state in `finishOutcome`) applies; the handler sees an inline error with "Try again" — this already exists and does not change.

---

## 10. Handoff and next steps

**Artefact location:** `C:\repos\ooh-triage-dashboard\docs\project\DISCOVERY_oohdash-111-112-outside-lighting.md`

**Decisions needed before build can start:**
1. (Owner: product / standup) Which lighting branch(es) become P1 — "still not working" only, or also "resolved with override"?
2. (Owner: Spencer / IoT ops) Confirm `SMS_PROVIDER=twilio` is active in production and that adding a new P1 trigger has been considered in the context of live SMS spend.
3. (Owner: IoT / product) Sign off on the `div.script` draft wording for OOHDASH-112 before it ships.

**Blockers requiring external action:**
- None that block discovery or design. Build is blocked on Decision 1 above.

**Recommended first phase:**
Build OOHDASH-112 first (copy-only, zero risk, no decisions outstanding). Then build OOHDASH-111 once Decision 1 is confirmed. Both are S-sized; they can be a single PR if Decision 1 lands quickly.
