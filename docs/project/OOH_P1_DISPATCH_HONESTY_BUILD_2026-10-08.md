<!-- gate:contract
SECTION: What this build delivers.
A single targeted fix to public/js/flows.js correcting a misleading P1 dispatch-status warning on every P1 outcome card (Kitchen, Fridge, Contractor, outside Lighting). The OOH dashboard operates under Approach B: it tags the Zendesk ticket `ooh_p1` and the IoT Support Dashboard detects that tag and pages the on-duty manager. The OOH app never sends an SMS itself — SMS_PROVIDER=log is correct by design. But the shared `outcomeP1` renderer contained an Approach-A conditional that evaluated `res.p1.dispatchOk` and in log mode (dispatchOk false) showed a red warning "Text not sent — phone the on-duty manager now", which is false. The fix replaces the entire conditional with one honest sentence: "The P1 is logged as ticket #NNN in the IoT Support dashboard, which pages the on-duty manager." Three Playwright specs that were asserting the old false warning are updated to assert the new honest line. No server code was changed. This ships as patch v1.3.5.

SECTION: Test results.
Unit suite: 301 tests, 300 pass, 1 skip (unchanged from pre-fix — no unit tests were asserting the removed conditional). Playwright e2e suite: 57/57 pass. All three updated specs (control.spec.js, outside-lighting-p1.spec.js test 111-C, tonight-callback.spec.js contractor P1 test) pass with the new assertions. No other tests were affected.

SECTION: Scope and open conditions.
The change is confined to the shared `outcomeP1` renderer in flows.js — one line replacing three. All four P1 entry points (kitchen K3, fridge FR1, contractor CTR1, outside lighting) are corrected in a single edit. The read-aloud `script` strings ("a text has gone to our on-duty manager") were not touched — those remain accurate under Approach B. No version bump in this phase; the Orchestrator cuts v1.3.5 post-gate.

DECISION: Gate — confirm flows.js change is the only product code edit, no server files touched, read-aloud strings untouched. | Confirmed — ship | Issues found — hold
-->

# Build — P1 dispatch-status honesty fix (v1.3.5 patch)

**Date:** 2026-10-08
**Branch:** `build/oohdash-p1-dispatch-honesty`
**Base:** v1.3.4 / commit `68997cb`
**Standards:** repo house style — client-side ES2022 template literals, no hardcoded strings, errors surfaced honestly to the operator

---

## 1. The bug

### 1.1 Architecture (Approach B)

The OOH dashboard uses Approach B for P1 escalation. When a P1 is raised the app:

- Creates a Zendesk ticket at priority `urgent`
- Tags it `ooh_p1`
- Returns `{ dispatchOk: false }` because it never sends an SMS itself

The IoT Support Dashboard separately monitors for the `ooh_p1` tag and fires the SMS to the on-duty manager from there. `SMS_PROVIDER=log` on the OOH side is intentional and correct.

### 1.2 The false warning

`public/js/flows.js` at the `outcomeP1` function (around line 246 before this fix) contained a `<p data-testid="p1-dispatch-status">` whose body was a ternary on `res.p1.dispatchOk`: the true branch claimed "A text message has been sent …"; the false branch (always hit under log mode) showed `<span class="tag red">Text not sent — phone the on-duty manager now.</span>` followed by the ticket link.

Because `dispatchOk` is always false under Approach B, every P1 card on every call — Kitchen (K3), Fridge (FR1), Contractor (CTR1), Outside Lighting — showed the red alarm: **"Text not sent — phone the on-duty manager now."** That instruction is wrong: the manager IS being paged, via IoT Support Dashboard, and the handler calling them manually creates a duplicate alert.

The `true` branch was equally false — it claimed OOH had sent a text message, which it never does.

---

## 2. The fix

### 2.1 File and location

- `public/js/flows.js` — the `outcomeP1` function, dispatch-status `<p>` element

### 2.2 Before → after (exact)

**Before** (3 lines, conditional):

- `<p style="margin-top:4px" data-testid="p1-dispatch-status">${res.p1 && res.p1.dispatchOk`
- `? \`A <b>text message</b> has been sent … ticket <b>#${res.ticket.id}</b> …\``
- `: \`<span class="tag red">Text not sent — phone the on-duty manager now.</span> The P1 is logged as ticket <b>#${res.ticket.id}</b> in the IoT Support dashboard.\`}</p>`

**After** (1 line, unconditional):

- `<p style="margin-top:4px" data-testid="p1-dispatch-status">The P1 is logged as ticket <b>#${res.ticket.id}</b> in the IoT Support dashboard, which pages the on-duty manager.</p>`

The `data-testid="p1-dispatch-status"` wrapper and `style` attribute are unchanged so existing test locators continue to work.

### 2.3 What was NOT changed

- `routes/api.js` — untouched
- Any file under `services/`, `config.js`, `server.js` — untouched
- Read-aloud `script` strings inside `outcomeP1` callers — e.g. "a text has gone to our on-duty manager" — those are accurate under Approach B and were left as-is
- The `outcomeP1` function signature and all other callers

---

## 3. Tests updated

Three Playwright specs were asserting the now-removed false warning. Each was re-pointed to the new honest line. Genuine coverage (P1 fires, `ooh_p1` tag, override-doesn't-escalate guard) was kept intact.

### 3.1 `tests/control.spec.js` — retry-path P1 honesty (fridge P1 after Zendesk error)

Old assertions removed:

- `toContainText('Text not sent')` — was asserting the false red alarm
- `toContainText('phone the on-duty manager')` — implied caller should ring manually

New assertions:

- `toContainText('logged as ticket')` — confirms Zendesk ticket ID is shown
- `toContainText('pages the on-duty manager')` — confirms Approach B wording
- `not.toContainText('Text not sent')` — negative guard: old alarm must be gone

### 3.2 `tests/outside-lighting-p1.spec.js` — test 111-C (dispatch-status honesty, lighting P1)

Test name updated from `"log-mode honesty: lighting P1 card shows 'Text not sent' fallback"` to `"dispatch-status honesty: lighting P1 card shows Approach-B honest line"`. File header comment updated to reflect Approach B (removed reference to `dispatchOk:false` branch).

Old assertions removed:

- `toContainText('Text not sent')`
- `toContainText('phone the on-duty manager')`
- `not.toContainText('text message has been sent')`

New assertions:

- `toContainText('logged as ticket')`
- `toContainText('pages the on-duty manager')`
- `not.toContainText('Text not sent')` — negative guard
- `not.toContainText('text message has been sent')` — negative guard
- `not.toContainText('phone the on-duty manager now')` — negative guard

### 3.3 `tests/tonight-callback.spec.js` — contractor P1 honesty

Old assertions removed:

- `toContainText('Text not sent')`
- `toContainText('phone the on-duty manager')`
- `not.toContainText('paged')` — that guard was for the old wording; redundant now

New assertions:

- `toContainText('logged as ticket')`
- `toContainText('IoT Support dashboard')` — kept from before
- `toContainText('pages the on-duty manager')`
- `not.toContainText('Text not sent')` — negative guard
- `not.toContainText('text message has been sent')` — negative guard

---

## 4. Test results (real observed counts)

**Unit suite** (`npm run test:unit`): 301 tests — 300 pass, 1 skip, 0 fail

**Playwright e2e** (`npx playwright test`): 57 tests — 57 pass, 0 fail

No tests were broken by this change. The unit suite had no assertions on the removed conditional (the conditional lived in a client-side template literal, not tested at unit level). All three updated e2e specs passed on first run.

---

## 5. Scope note

The `outcomeP1` function is the shared renderer for all four P1 entry points in the app — Kitchen (K3), Fridge (FR1), Contractor (CTR1), and Outside Lighting. A single edit to that function corrects the dispatch-status on every P1 card with no further changes needed.

---

## 6. Plan vs as-built

None — as-built matches the approved plan exactly. Only `public/js/flows.js` was changed in product code; three test files were updated to reflect the new wording; this artefact was added. No version was bumped.
