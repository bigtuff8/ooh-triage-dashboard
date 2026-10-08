<!-- gate:contract
SECTION: What this build delivers.
Two client-side changes to public/js/flows.js, one new Playwright e2e spec, and this artefact. OOHDASH-112 replaces the single-ternary mid-sentence script at line 594 with two fully-written sentences — one per device state — so the handler reads aloud words that explain the dusk sensor, the one-off nature of the override, and the automatic next-day reset. OOHDASH-111 changes the "still not working" outcome branch from a next-working-day capture to a live P1 escalation, reusing the same outcomeP1 helper, /api/outcomes route, and on-duty-manager SMS path that already powers the Kitchen, Fridge and Contractor P1 outcomes. The "caller sorted it with the override" branch is unchanged. No server code was edited.

SECTION: Test results.
Unit suite run locally: 300 pass, 0 fail, 1 skip (same counts as before this change — no unit tests broken). Playwright e2e suite: 57 pass, 0 fail. The 8 new tests in tests/outside-lighting-p1.spec.js all pass, covering both tickets across the P1 happy path, the regression guard, log-mode honesty, the no-device guard, p1Summary propagation, both script states, and responsive render at 1100px.

SECTION: Release and open conditions.
ONE patch release covers both 112 and 111, planned as v1.3.4. Because 111 is bundled in, the release is held until D2 is confirmed (SMS_PROVIDER=twilio active in production — Spencer to confirm). D3 (Sam Day's wording sign-off on the 112 copy) and B2C (live-walkthrough validation) remain open. No version was bumped and no release was cut in this build phase.

DECISION: D2 — Confirm SMS_PROVIDER=twilio is active in production before v1.3.4 ships. | Spencer confirmed — ship | Still in log mode — hold | Not yet checked
DECISION: D3 — Sam Day signs off the OOHDASH-112 wording (three questions in the design doc). | Approved as written | Changes requested
DECISION: B2C — Live-walkthrough validation on the deployed app behind Azure B2C auth. | Validated — clear | Still open — carry to test gate
-->

# Build — OOHDASH-111 & OOHDASH-112: Outside Lighting P1 escalation + supporting text

**Date:** 2026-10-08
**Branch:** `build/oohdash-111-112`
**Built against:** Design gate-approved at commit `5079806` (merged to main 2026-10-08)
**Standards:** repo house style — client-side ES2022 template literals, UTF-8 file encoding, curly typographic punctuation in read-aloud strings

---

## 1. Files changed

| File | Change |
|---|---|
| `public/js/flows.js` | Two edits (see §2 and §3). No other files. |
| `tests/outside-lighting-p1.spec.js` | New Playwright e2e spec (8 tests). |
| `docs/project/OOH_OUTSIDE_LIGHTING_BUILD_2026-10-08.md` | This artefact. |

No server files (`routes/api.js`, `services/`, `config.js`) were edited. The existing P1 plumbing was reused without modification.

---

## 2. OOHDASH-112 — Script text replacement (exact before → after)

### 2.1 Location

`public/js/flows.js` line 594 (pre-edit), inside the `lighting(ws, f)` function's stage-0 return template literal.

### 2.2 Before

One line, mid-sentence ternary inside the `div.script` template literal. The ternary inserts a fuse-board clause (or empty string) into a fixed sentence:

`<div class="script">"There's a manual override for the outside lights${lg.online ? '' : ' — but first it's worth checking your fuse board, because the lighting controller isn't responding'}. If you have the Lighthouse lighting switch, flick it to override and they'll come on."</div>`

(Characters: curly apostrophes U+2019 on contractions; em dash U+2014 on `—`; curly double quotes U+201C/U+201D as read-aloud wrappers; ASCII double quotes on the HTML attribute `class="script"`.)

### 2.3 After

The ternary now selects the whole sentence per state, three lines in the source, using the same typographic conventions:

- Line 1: `<div class="script">"${lg.online`
- Line 2: `   ? 'The outside lights have a sensor that brings them on automatically at dusk — so they should usually look after themselves. If tonight's an exception, flip the Lighthouse lighting switch to override and they'll come on. That only affects tonight; the sensor picks everything back up automatically from tomorrow, so there's nothing to reset.'`
- Line 3: `   : 'The outside lights have a sensor that brings them on automatically at dusk, so they should usually look after themselves. The lighting controller isn't responding at the moment — it's worth checking your fuse board first, as a tripped breaker is the usual cause. If everything looks clear, flip the Lighthouse lighting switch to override — that only covers tonight, and the sensor picks everything back up automatically from tomorrow.'}"</div>`

JS string delimiters are ASCII `'` (U+0027). Curly apostrophes U+2019 appear only within the text content. The edit was applied via a Node.js script to guarantee the correct codepoints rather than relying on the editor's auto-correction behaviour.

### 2.4 Coverage (design §2.4, requirements 112-R1 through 112-R5)

| Requirement | Online | Offline |
|---|---|---|
| 112-R1 override is a one-off | "That only affects tonight… nothing to reset" | "that only covers tonight" |
| 112-R2 schedule resumes automatically | "picks everything back up automatically from tomorrow" | "picks everything back up automatically from tomorrow" |
| 112-R3 dusk sensor explained | "a sensor that brings them on automatically at dusk" | "a sensor that brings them on automatically at dusk" |
| 112-R4 applies in both variants | yes | yes — fuse-board check retained in offline |
| 112-R5 text-only, no behaviour change | no chips, headings, or class names touched | same |

---

## 3. OOHDASH-111 — P1 escalation (exact before → after)

### 3.1 Location

`public/js/flows.js`, the `r:'cap'` branch inside `lighting(ws, f)` at stage 1. The `r:'ok'` branch (lines 600–607) was not touched.

### 3.2 Before (6 lines)

- `return outcomeCaptured(f, 'cap', {`
- `    subject: 'External lighting not working',`
- `    detail: 'Manual override did not resolve; possible tripped supply or failed controller. Needs IoT/electrical follow-up.',`
- `    script: 'I've logged this for the IoT team to investigate first thing. If the pub frontage being dark is a safety concern tonight, your own electrician or duty manager procedure applies — this may be an electrical supply issue rather than the lighting control.',`
- `    OohCaptureClass: 'lighting'`
- `});`

### 3.3 After (7 lines — one added for doneLine)

- `doneLine('Override did not resolve — P1');`
- `return outcomeP1(f, 'cap', {`
- `    subject: 'External lighting not working — P1',`
- `    detail: 'Manual override did not resolve the outside lights; possible tripped supply or failed controller. Remote switching not available — needs immediate IoT/electrical follow-up.',`
- `    script: 'I've escalated this as urgent — a text has gone to our on-duty manager and someone will call you back shortly. If the dark frontage is a safety concern right now, your site's duty-manager procedure for calling out an electrician still applies, as this may be an electrical supply issue rather than the lighting control.',`
- `    p1Summary: 'External lighting not responding'`
- `});`

### 3.4 Change-by-change

- `outcomeCaptured` → `outcomeP1`: the single functional switch. `outcomeP1` posts `type:'escalate-p1'` which `routes/api.js:253` detects, adding `priority:'urgent'` and `extraTags:['ooh_p1']`, and calling `escalation.escalateP1`. No server code edited.
- `subject` gains `— P1` suffix, matching K3/CTR1 house convention.
- `detail` reworded to reflect urgency; "tripped supply or failed controller" diagnosis retained.
- `script` reframed from "logged for first thing" to "escalated as urgent"; safety caveat about the site's own electrician/duty-manager route retained.
- `OohCaptureClass:'lighting'` dropped (not used by `outcomeP1`).
- `p1Summary:'External lighting not responding'` added — becomes the SMS body the on-duty manager reads.
- `doneLine('Override did not resolve — P1')` added for flow-trail consistency with K3/FR1.

### 3.5 Unchanged: the `r:'ok'` override-resolved branch

The `r:'ok'` branch (lines 600–607) remains `outcomeCaptured` exactly as before — blue card, no `ooh_p1` tag, no SMS. This is D1 (design §4): escalating the resolved path would page the on-duty manager about a problem the caller just solved.

---

## 4. E2e tests added

File: `tests/outside-lighting-p1.spec.js`

Eight tests, all passing. Test names and what each asserts:

- `111-A`: "still not working" fires a P1 — outcome card is `.outcome.p1`, POST carries `type:'escalate-p1'`.
- `111-B regression guard`: "caller sorted it with the override" stays a capture — `outcome-captured` visible, no `outcome-p1`.
- `111-C log-mode honesty`: lighting P1 card shows "Text not sent — phone the on-duty manager now" fallback via `data-testid="p1-dispatch-status"`.
- `111-D no-device guard`: site with no `kind:'lighting'` device shows the scope alert; "Still not working" chip absent, P1 path unreachable.
- `111-E p1Summary propagation`: POST body carries `p1Summary:'External lighting not responding'` exactly.
- `112-A online script`: `.script` contains the dusk sensor, "only affects tonight", and "picks everything back up automatically from tomorrow"; does NOT contain "fuse board".
- `112-B offline script`: `.script` contains all three 112-A points PLUS "fuse board" and "tripped breaker".
- `112-C responsive`: at 1100px viewport `scrollWidth <= clientWidth` on the `.script` block — no overflow.

Fixtures used: 6749 Angel Inn (online lighting device), 6360 Mill House (offline), 6832 Old Grey Mare (no lighting). Assertion for the no-device guard's curly apostrophe in `isn't` uses surrounding text (`"External lighting at this site"`, `"on Lighthouse"`) rather than the apostrophe character directly, avoiding a U+2019 vs U+0027 mismatch.

---

## 5. Local test results

| Suite | Command | Pass | Fail | Skip |
|---|---|---|---|---|
| Unit | `npm run test:unit` | 300 | 0 | 1 |
| Playwright e2e | `npx playwright test` | 57 | 0 | 0 |

These are the real counts from runs observed during this build session. The 8 new e2e tests are included in the 57 total.

---

## 6. Open conditions (carried from design, unchanged)

| # | Condition | Owner | Status |
|---|---|---|---|
| D2 | Confirm `SMS_PROVIDER=twilio` active in production before v1.3.4 ships | Spencer / IoT ops | Open — carry to ops |
| D3 | Sam Day signs off OOHDASH-112 wording (three questions in the design doc §5) | Sam Day | Open — carry to review |
| B2C | Live-walkthrough validation on the deployed app behind Azure B2C auth | Build / Tester | Open — carry to test gate |

---

## 7. Release

**OPERATOR DIRECTIVE:** ONE patch release covers both 112 and 111. The planned single release is **v1.3.4**. Because 111 is bundled in, that single release is held until **D2** is confirmed. No version was bumped and no release was cut in this build phase — that is the release phase.

---

## 8. Plan ↔ build divergence

**None — as-built matches the approved build plan exactly.**

- Edit scope: client-side only, two edits in `public/js/flows.js`, exactly as specified.
- `r:'ok'` branch: untouched, exactly as specified.
- No server edit: confirmed.
- `doneLine` addition: specified in design §3.2 and implemented as specified.
- Single release v1.3.4: stated as directed.
- Test coverage: 8 tests added as directed by design §8, all assertions implemented. One test assertion (111-D) uses surrounding text rather than the curly-apostrophe word `isn't` to avoid a Unicode-mismatch false failure — this is an implementation detail within the required assertion, not a change in what is being tested.
