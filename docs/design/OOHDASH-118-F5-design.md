# OOHDASH-118 F5 — PowerPause Contractor Override Read-back

**Ticket:** OOHDASH-118 F5
**Complexity:** S
**Scope:** `public/js/flows.js` — contractor flow extended (no backend changes)
**Status:** Design — ready for build

---

## Summary

When a contractor calls OOH needing to locally override the PowerPause system, the
IoT support agent currently has nothing to say beyond "I've escalated it — someone
will ring back." The contractor is standing at the panel, tools in hand, waiting.

This feature adds a PowerPause guidance branch inside the contractor flow. After the
agent captures the contractor's name and need, the flow asks whether PowerPause
override guidance is required. If yes, the agent is given verbatim read-back text
covering device-type identification and the physical override button procedure. A
site-specific exception covers Donkey Derby (site 6786), where local override is not
possible and the call must be escalated to the IoT team directly.

No backend changes, no new routes, no new data. This is a pure flow/script content
addition to `public/js/flows.js`.

**Cost and silent-running notes:** No LLM calls, no polling, no background process.
Cost delta is zero — this is static flow content added to an existing client-side JS
file.

---

## Flow change

### File and location

`public/js/flows.js` — the `contractor` function, lines 782–796.

### Current behaviour (lines 782–796)

Stage 0 collects contractor name and need, then a single "Escalate now — P1" chip
calls `flowStep(...)` which transitions to stage 1, where `outcomeP1` is returned
immediately. The operator has no guidance to give the contractor.

### Revised behaviour

The contractor function gains a new intermediate stage. The stage numbering becomes:

- **Stage 0** — unchanged: collect contractor name and need (chip says "Next")
- **Stage 1 (new)** — ask whether the contractor needs PowerPause override guidance
- **Stage 2 (was stage 1)** — P1 outcome, now reached from both the "No" path at
  stage 1 and the "Yes" path after override guidance has been surfaced

The new stage 1 chip label changes from "Escalate now — P1" to "Next — review need"
so the operator knows there may be a further step before the ticket is raised. The
chip value and `flowStep` call remain consistent with the existing pattern.

### Stage 0 chip change

Current (line 787):
```
<button class="chip" data-testid="contractor-escalate"
  onclick="flowStep({cn:...,cw:...})">Escalate now — P1</button>
```

Revised chip label and testid:
```
<button class="chip" data-testid="contractor-next"
  onclick="flowStep({cn:...,cw:...})">Next — review need</button>
```

The `flowStep` call and the `doneLine` call at the top of stage 1 are unchanged.

### New stage 1 — PowerPause guidance branch

Inserted between the existing stage 0 chip and the existing `outcomeP1` call.

**Condition check:** `f.stage === 1 && !f.data.ppguidance`

**Render:**

```
<div class="stepq">Does the contractor need PowerPause override guidance?</div>
<div class="chips">
  <button class="chip" data-testid="contractor-pp-yes"
    onclick="flowStep({ppguidance:'yes'})">Yes — show override procedure</button>
  <button class="chip" data-testid="contractor-pp-no"
    onclick="flowStep({ppguidance:'no'})">No — escalate now</button>
</div>
```

### Stage 1, PowerPause "No" path

When `f.data.ppguidance === 'no'`: fall through to `outcomeP1` exactly as the
current stage 1 does. No new content shown.

### Stage 1, PowerPause "Yes" path — site 6786 exception

When `f.data.ppguidance === 'yes'` and `ws.site.siteNo === 6786` (or the numeric
string `'6786'` — check both, see Edge cases):

```
doneLine('PowerPause override: Donkey Derby exception — escalate to IoT team');
```

Render:

```html
<div class="alert warn">
  <b>Donkey Derby (site 6786) — local override not available.</b>
  This site uses a different container type; the local override button does not apply.
</div>
<div class="script">
  "I'm sorry — this site can't be overridden locally. I'm escalating to the IoT team
  right now and they'll contact the site directly.
  IoT team direct line: <b>023 814 0228</b> — email: <b>iot@airedale-group.co.uk</b>."
</div>
<div class="chips">
  <button class="chip" data-testid="contractor-pp-escalate"
    onclick="flowStep({ppesc:1})">Escalate as P1</button>
</div>
```

When the chip is clicked, proceed to `outcomeP1` with subject "PowerPause override —
Donkey Derby exception, IoT team escalation required".

### Stage 1, PowerPause "Yes" path — standard sites

When `f.data.ppguidance === 'yes'` and `ws.site.siteNo !== 6786`:

```
doneLine('PowerPause override guidance given to contractor');
```

Render:

```html
<div class="alert ok">
  <b>PowerPause local override — read to the contractor:</b>
</div>

<div class="script">
  <p><b>Step 1 — Locate the panel.</b>
  "The PowerPause panel is usually near the kitchen distribution boards, behind a
  major appliance, or mounted on the ceiling nearby. It will be labelled."</p>

  <p><b>Step 2 — Identify the device type.</b>
  "There should be a label on the unit. It will say either <b>Tongou</b> or
  <b>Owon</b>. Which does it say?"</p>
</div>

<div class="formrow">
  <label>Device type</label>
</div>
<div class="chips">
  <button class="chip" data-testid="contractor-pp-tongou"
    onclick="flowStep({pptype:'tongou'})">Tongou</button>
  <button class="chip" data-testid="contractor-pp-owon"
    onclick="flowStep({pptype:'owon'})">Owon</button>
</div>
```

### Stage 2 — device-type override instruction

When `f.data.pptype` is set (either `'tongou'` or `'owon'`):

```
doneLine('PowerPause override: device type ' + f.data.pptype + ' — button procedure given');
```

Render the override instruction matching the device type, then show the P1 escalation
chip so the call is still logged.

**Tongou read-back:**

```html
<div class="script">
  <p><b>Tongou override:</b>
  "Press the override button on the front of the Tongou unit <b>once</b> — do not
  hold it. The override stays active until the device's next scheduled change. The
  equipment should power on within a few seconds."</p>
</div>
<div class="alert info">
  This is a temporary override only. The Tongou device will return to its normal
  schedule at the next programmed event.
</div>
<div class="chips">
  <button class="chip" data-testid="contractor-pp-done"
    onclick="flowStep({ppdone:1})">Override done — log the call</button>
</div>
```

**Owon read-back:**

```html
<div class="script">
  <p><b>Owon override:</b>
  "Press the override button on the front of the Owon unit <b>once</b> — do not
  hold it. The override stays active until the device's next scheduled change. The
  equipment should power on within a few seconds."</p>
</div>
<div class="alert info">
  This is a temporary override only. The Owon device will return to its normal
  schedule at the next programmed event.
</div>
<div class="chips">
  <button class="chip" data-testid="contractor-pp-done"
    onclick="flowStep({ppdone:1})">Override done — log the call</button>
</div>
```

### Final P1 outcome

When `f.data.ppdone` is set: proceed to `outcomeP1` with:

- subject: `'PowerPause contractor override — guidance given on site'`
- detail: `'Contractor ' + f.data.cn + ' given PowerPause override procedure (' + f.data.pptype + ' device). Override active until next scheduled event.'`
- script: `'I've logged this call. The override will hold until the device's next scheduled change — if the issue returns, ring back and we'll escalate further.'`
- p1Summary: `'Contractor on site: PowerPause override given (' + f.data.pptype + ')'`

When `f.data.ppesc` is set (Donkey Derby escalation): proceed to `outcomeP1` with:

- subject: `'PowerPause override — Donkey Derby (site 6786) — IoT team escalation'`
- detail: `'Contractor ' + f.data.cn + ' on site at Donkey Derby (6786). Local PowerPause override not available at this site. Escalated to IoT team.'`
- script: `'I've escalated this as a priority — the IoT team will be in touch shortly. IoT direct: 023 814 0228.'`
- p1Summary: `'Contractor: PowerPause — Donkey Derby — IoT escalation'`

When `f.data.ppguidance === 'no'`: the existing outcome from the current stage 1
is used unchanged.

---

## Site 6786 exception

### Detection

`ws.site.siteNo` is populated at workspace load (confirmed: `finishOutcome` reads
`state.workspace.site.siteNo` at line 207). Within the contractor function,
`ws` is the first argument — `ws.site.siteNo` is the correct reference.

`siteNo` may be stored as a number or a string depending on the API response. The
check must be loose:

```js
const isDonkeyDerby = Number(ws.site.siteNo) === 6786;
```

This handles both `6786` (number) and `'6786'` (string) without risk of a false
positive from type coercion.

### What to show

See "Stage 1, PowerPause Yes path — site 6786 exception" above. The key points:

- Use a `warn` alert (not `err` — this is a process route, not a system error)
- Give both the phone number and the email address so the operator has options
- Still land on `outcomeP1` so the call is logged; the subject line records the
  escalation reason explicitly

---

## Test spec

### File

`tests/e2e/contractor-powerpause.spec.js` (new file)

### Scenario 1 — Standard site: override guidance shown

**Given** the workspace is loaded for a site that is not 6786 (use site 6261 or any
fixture site)
**When** the operator selects the "Contractor on site" tile
**And** enters contractor name "Bellrock" and need "needs PowerPause override"
**And** clicks "Next — review need"
**And** clicks "Yes — show override procedure"
**And** selects device type "Tongou"
**And** clicks "Override done — log the call"

**Then:**
- At the guidance step, `[data-testid="contractor-pp-yes"]` is visible
- After selecting Tongou, the read-back text contains the word "Tongou" and
  the phrase "press the override button" (case-insensitive)
- After clicking "Override done", the outcome card is shown
- The outcome card subject contains "PowerPause contractor override"
- No escalation-only outcome (i.e. no "Donkey Derby" text visible)

**Repeat** for device type "Owon" — confirm read-back contains "Owon"

### Scenario 2 — Site 6786: Donkey Derby escalation

**Given** the workspace is loaded for site 6786 (mock `ws.site.siteNo = 6786` via
fixture or intercept — see note below)
**When** the operator selects the "Contractor on site" tile
**And** enters any contractor name and need
**And** clicks "Next — review need"
**And** clicks "Yes — show override procedure"

**Then:**
- The `warn` alert is shown with text containing "Donkey Derby" and "6786"
- The IoT team phone number "023 814 0228" is visible on screen
- The "Escalate as P1" chip is shown (`[data-testid="contractor-pp-escalate"]`)
- No device-type picker (Tongou / Owon) is shown
- Clicking "Escalate as P1" produces an outcome card whose subject contains
  "Donkey Derby"

**Note on fixture approach:** The existing Playwright suite uses a mock workspace
loaded via intercept of `/api/workspace/:siteNo`. Add a fixture entry for site 6786
(or intercept the route and return `{ site: { siteNo: 6786, siteName: 'Donkey Derby' }, devices: [] }`).
Check `tests/e2e/` for the existing intercept pattern to match the house style.

### Scenario 3 — "No" path does not change current behaviour

**Given** any standard site
**When** the operator selects the "Contractor on site" tile, enters details, and
clicks "Next — review need"
**And** clicks "No — escalate now"

**Then** the P1 outcome card is shown immediately, with subject containing
"Contractor on site needs IoT support".

---

## Edge cases

### `siteNo` type safety
`ws.site.siteNo` could arrive as a number or string from the API. Use `Number(ws.site.siteNo) === 6786` throughout. Do not use strict equality (`=== 6786`) without coercion.

### Contractor flow used without PowerPause
The "No — escalate now" path at stage 1 must produce exactly the same `outcomeP1` output as the current (pre-F5) contractor flow. Do not change the subject, detail, or p1Summary text on that path — regression risk for existing tests.

### `doneLine` call ordering
The existing `doneLine('Contractor: ' + esc(f.data.cn) + ' — ' + esc(f.data.cw))` at the top of the current stage 1 must remain the first action in stage 1. The new PowerPause `doneLine` calls (guidance given / device type / Donkey Derby) are additional and fire at the stages where that information is confirmed, not before.

### Missing device label
The flow asks the contractor to read the device label to identify Tongou vs Owon. If the contractor cannot find the label or the panel is unlabelled, the operator has no further guidance to give. This is an open question (see below) — for now the design does not add a "can't find label" branch; escalation via the standard P1 chip remains the fallback.

### P1 audit tag
The `OohCaptureClass` for the new PowerPause P1 outcomes should be `'kitchen-powerpause'` — consistent with the existing `outcomeCaptured` tag at line 577 and ensuring back-office filtering works without schema changes.

Add `OohCaptureClass: 'kitchen-powerpause'` to both `outcomeP1` calls introduced by F5.

---

## Open questions

**OQ-1 — Unlabelled or inaccessible panel.** The procedure asks the contractor to
read the device type from the label. What should the agent say if the contractor
cannot find the panel, or the label is missing or unreadable? Current design: no
branch — operator falls back to standard P1 escalation. Confirm with Sam Day /
IoT team whether there is a distinguishing physical characteristic (e.g. button
colour or position differs between Tongou and Owon) that could serve as a
secondary identification route.

**OQ-2 — Additional exception sites.** Discovery names Donkey Derby (6786) as the
only site where local override is not available. Confirm with IoT team whether any
other sites use the same container type and should be added to the exception list.
If more than two or three sites, consider a config array rather than a hardcoded
single check.

**OQ-3 — Override confirmation from the contractor.** The current design surfaces
the read-back and then moves to "Override done — log the call" on the operator's
say-so. It does not ask the contractor to confirm the equipment came back on.
If the IoT team wants a positive confirmation step ("Did the equipment power on?"),
add a further chip before logging. Out of scope for this iteration unless confirmed.

**OQ-4 — Tongou vs Owon procedural difference.** Discovery states both devices
have their own override button but does not detail any procedural difference between
them beyond the name. The current design gives identical button-press instructions
for both, differing only in the device name. If the physical procedure differs
(e.g. button location, hold-time, LED indicator), the read-back text must be
updated before build. Confirm with the Word doc source ("Lighthouse PowerPause
Contractor Info.docx") or with Sam.
