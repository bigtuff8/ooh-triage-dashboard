# OOH P1 Dispatch-Status Honesty — Test Gate

**Patch:** v1.3.5 fast-follow
**Commit under test:** 70d7bfc (merge of build/oohdash-p1-dispatch-honesty into main)
**Date:** 2026-10-08
**Reviewer:** Tester stage (automated run, merged main)

---

## Suites run

### Unit tests

Command: `npm run test:unit`

Result: 300 pass, 0 fail, 1 skipped.

The single skip is the CR3 profile-populate enforcement test (`REFRIG_PROFILES` data file absent — accepted interim, noted in the test itself).

### End-to-end (Playwright)

Command: `npx playwright test`

Result: 57 pass, 0 fail (2 min 30 sec wall time, 1 worker).

No flakes observed.

---

## Per-check verdicts

### Check 1 — New honest Approach-B line present on lighting P1 (111-C)

Test: `outside-lighting-p1.spec.js` — "111-C dispatch-status honesty: lighting P1 card shows Approach-B honest line — IoT Support Dashboard pages manager"

The `[data-testid="p1-dispatch-status"]` element was asserted to contain "logged as ticket" and "pages the on-duty manager". Both assertions passed. The `outcomeP1` renderer in `public/js/flows.js:246` now reads: "The P1 is logged as ticket #\<id\> in the IoT Support dashboard, which pages the on-duty manager."

Verdict: PASS

### Check 2 — Old false Approach-A strings absent on lighting P1 (111-C)

Same test as Check 1. Three `not.toContainText` assertions:

- "Text not sent" — absent. PASS
- "text message has been sent" — absent. PASS
- "phone the on-duty manager now" — absent. PASS

Verdict: PASS

### Check 3 — New honest line present on fridge P1 path

Test: `control.spec.js` — "outcome-record failure shows inline error with manual retry (Protocol 4: 500 path)"

Exercises `[data-testid="fridge-risk"]` → P1 outcome. The `[data-testid="outcome-p1"]` element was asserted to contain "logged as ticket" and "pages the on-duty manager". Both passed. The absence of "Text not sent" was also asserted and passed.

The SMS log line `[SMS:log] Would send to (no on-duty number configured): OOH P1 — Old Grey Mare (6832): Refrigeration failure — stock at risk. Ticket #45130` confirms the server-side `ooh_p1` tag and SMS log path fired correctly while the client showed only the honest static line.

Verdict: PASS

### Check 4 — New honest line present on contractor P1 path

Test: `tonight-callback.spec.js` — "contractor flow escalates P1 with contractor details and text-message wording"

The `[data-testid="outcome-p1"]` element was asserted to contain "logged as ticket", "IoT Support dashboard", and "pages the on-duty manager". All passed. Absence of "Text not sent" and "text message has been sent" also asserted and passed.

Verdict: PASS

### Check 5 — P1 fires with `type:escalate-p1` in POST body (111-A)

Test: `outside-lighting-p1.spec.js` — "111-A: 'still not working' fires a P1 — outcome card is .outcome.p1, POST carries type:escalate-p1"

The intercepted POST body was asserted: `body.type === 'escalate-p1'`. Passed.

Verdict: PASS

### Check 6 — `ooh_p1` tag applied server-side

Confirmed in `routes/api.js:267`: `extraTags: isP1 ? ['ooh_p1'] : []`. This is the join-contract between OOH and the IoT Support Dashboard. Not a test assertion but a code read corroborating that the server-side side of the Approach-B mechanism is intact.

Verdict: CONFIRMED (code read, consistent with all P1 e2e paths passing and SMS log lines observed)

### Check 7 — Override-doesn't-escalate guard intact (111-B)

Test: `outside-lighting-p1.spec.js` — "111-B regression guard: 'caller sorted it with the override' stays a capture — no P1 escalation"

`[data-testid="outcome-captured"]` visible; `[data-testid="outcome-p1"]` count = 0. Passed.

Verdict: PASS

### Check 8 — `flows.js` contains no remaining SMS_PROVIDER or dispatchOk reference in the dispatch-status path

`grep SMS_PROVIDER public/js/flows.js` returned nothing. The `outcomeP1` function at line 242–248 renders an unconditional static sentence — no conditional SMS branch. The old `dispatchOk` guard is fully absent from the renderer.

Verdict: CONFIRMED

---

## Regression sweep

Searched `tests/` for: "Text not sent", "text message has been sent", "dispatchOk", "phone the on-duty manager now".

- "Text not sent": 3 hits — `control.spec.js:245`, `outside-lighting-p1.spec.js:66`, `tonight-callback.spec.js:154`. All three are inside `not.toContainText()` absence assertions. No stale positive assertion of this string exists.
- "text message has been sent": 2 hits — `outside-lighting-p1.spec.js:67`, `tonight-callback.spec.js:155`. Both are `not.toContainText()` absence assertions. Clean.
- "phone the on-duty manager now": 1 hit — `outside-lighting-p1.spec.js:68`. Inside `not.toContainText()`. Clean.
- "dispatchOk": 0 hits in `tests/`. The string appears only in `test/p1-dispatch-honesty.test.js` (server-side unit tests), where it correctly tests the server dispatch state — not client renderer behaviour. Clean.

Result: No missed stale assertions. Regression sweep CLEAN.

---

## Source-check test scan

No `toString().includes(...)` or similar source-check patterns found in `tests/`. Suite is behaviour-only.

---

## B2C live walkthrough

CARRIED. No B2C / OIDC credentials are present in the CIR credentials directory. This check cannot be performed without a live signed-in session against the production Azure B2C tenant. No fabricated result is offered.

---

## Release note

This artefact covers the test gate for the v1.3.5 fast-follow patch. The release itself is NOT cut here; that is the Orchestrator's action under the governed gate.

---

## Verdict

**PASS**

All 300 unit tests pass (1 accepted skip). All 57 Playwright e2e tests pass. The three P1 paths verified (lighting, fridge, contractor) show the correct Approach-B line and have no trace of the false Approach-A warning. Regression sweep is clean. `ooh_p1` tag and override guard are intact.
