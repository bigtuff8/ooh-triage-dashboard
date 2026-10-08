<!-- gate:contract
SECTION: What this test covers.
Independent test-stage verification of the combined OOHDASH-111 (Outside Lighting P1 escalation) and OOHDASH-112 (supporting text rewrite) change set, merged to main as commit 27d4830. The review drives the full automated suite and cross-checks every assertion in design §8 against real observed output — not source inspection. One planned release, v1.3.4, covers both stories. The release is held until conditions D2 and D3 are resolved.

SECTION: Suite results.
Unit suite (npm run test:unit): 300 pass, 0 fail, 1 skip — identical to the pre-change baseline. No unit regressions. Playwright e2e (npx playwright test, full suite): 57 pass, 0 fail. All 8 new tests in tests/outside-lighting-p1.spec.js passed. No pre-existing test broken.

SECTION: Design §8 assertions.
All 8 assertions verified pass. Regression guard (override-resolved does not escalate) confirmed. Log-mode honesty confirmed for the lighting path. B2C live-walkthrough carried — no credentials available in the CIR.

SECTION: Open conditions and release gate.
D2 (SMS_PROVIDER=twilio active in production — Spencer / IoT ops) remains open; the release is held on this. D3 (Sam Day wording sign-off on OOHDASH-112 copy) remains open. B2C live-app walkthrough carried — no sign-in credentials found in the CIR. All three conditions are carried unchanged from the design gate. The planned release is v1.3.4; no release was cut.

DECISION: D2 — Confirm SMS_PROVIDER=twilio active in production before v1.3.4 ships. | Spencer confirmed — ship | Still in log mode — hold | Not yet checked
DECISION: D3 — Sam Day signs off the OOHDASH-112 wording (three questions in the design doc §5). | Approved as written | Changes requested
DECISION: B2C — Live-walkthrough validation on the deployed app behind Azure B2C auth. | Validated — clear | Still open — carry
-->

# Test — OOHDASH-111 & OOHDASH-112: Outside Lighting P1 escalation + supporting text

**Date:** 2026-10-08
**Branch verified:** `main` at commit `27d4830` (build/oohdash-111-112 merged)
**Test branch:** `gate/oohdash-111-112-test`
**Design §8 contract:** `docs/project/OOH_OUTSIDE_LIGHTING_DESIGN_2026-10-08.md`
**Tester:** Independent test-stage reviewer

> **Presentation note.** No fenced code blocks appear in this artefact — the gate renders into a `<details class=ctx>` card that fails closed on any `<pre>`. Code is shown as inline `code` chips, pipe tables, or bulleted prose, mirroring the design artefact convention.

---

## 1. Suites run — real observed counts

Both suites were run on the merged `main` (commit `27d4830`) with no pre-run source modification.

| Suite | Command | Pass | Fail | Skip |
|---|---|---|---|---|
| Unit | `npm run test:unit` | 300 | 0 | 1 |
| Playwright e2e (full) | `npx playwright test` | 57 | 0 | 0 |

The 8 new tests in `tests/outside-lighting-p1.spec.js` are included in the 57 e2e total. The 1 unit skip is the pre-existing CR3 profile-populate enforcement skip (the `cr3-cellar-profile.json` probe artefact is not yet present — this is the accepted interim condition, unchanged from before this change).

No test was modified to make the suite pass. No pre-existing test was broken.

---

## 2. New test observations — outside-lighting-p1.spec.js

The following was observed during the suite run. Server-side `[SMS:log]` lines confirm the P1 path is wired through to the escalation layer:

- Tests `111-A`, `111-C`, `111-E` each generated a server log line of the form `[SMS:log] Would send to (no on-duty number configured): OOH P1 — Angel Inn (6749): External lighting not responding. Ticket #…`. This confirms `outcomeP1` is routing the lighting P1 through the existing escalation path with the correct `p1Summary`.
- Test `111-B` generated no `[SMS:log]` line — the override-resolved branch remains a capture with no escalation.
- Test `111-D` confirmed the scope-alert text is present for a no-lighting site and the "Still not working" chip is absent.

---

## 3. Design §8 assertions — pass/fail

### OOHDASH-111

**111-1 — P1 fires on "still not working" (design §8 assertion 1)**

- Verdict: PASS
- Method: test `111-A` clicked the "Still not working" chip for site 6749 (Angel Inn, online lighting device). The POST to `/api/outcomes` was intercepted; `body.type === 'escalate-p1'` was asserted and observed true. The rendered card was `[data-testid="outcome-p1"]` containing text "Escalated — P1". No `[data-testid="outcome-captured"]` was present.

**111-2 — Regression guard: override-resolved does NOT escalate (design §8 assertion 2)**

- Verdict: PASS
- Method: test `111-B` clicked "Caller sorted it with the override" for the same site. The rendered card was `[data-testid="outcome-captured"]`. No `[data-testid="outcome-p1"]` was present (count = 0). No `[SMS:log]` line was emitted. The `r:'ok'` branch is demonstrably unchanged.

**111-3 — Log-mode honesty: lighting P1 card shows fallback, not false send claim (design §8 assertion 3)**

- Verdict: PASS
- Method: test `111-C` clicked "Still not working" and asserted `[data-testid="p1-dispatch-status"]`. The element contained "Text not sent" and "phone the on-duty manager". It did not contain "text message has been sent". The server `SMS_PROVIDER` defaults to `log`; the suite confirmed the fallback branch renders on the lighting path, extending the pre-existing log-mode honesty coverage to this new outcome.

**111-4 — No-device guard: site with no lighting device shows scope message; P1 path unreachable (design §8 assertion 4)**

- Verdict: PASS
- Method: test `111-D` navigated to site 6832 (Old Grey Mare, no `kind:'lighting'` device). The `.alert.info` element contained "External lighting at this site" and "on Lighthouse". The `.chip:has-text("Still not working")` count was 0 — the P1 path is unreachable.

**111-5 — `p1Summary` propagation: POST body carries `'External lighting not responding'` (design §8 assertion 5)**

- Verdict: PASS
- Method: test `111-E` intercepted the POST to `/api/outcomes`; `body.p1Summary === 'External lighting not responding'` was asserted and observed true. The server `[SMS:log]` line confirms the same string became the SMS body: "External lighting not responding".

### OOHDASH-112

**112-1 — Online script text present (design §8 assertion 6)**

- Verdict: PASS
- Method: test `112-A` navigated to site 6749 (online lighting device). The `.script` element was asserted to contain "sensor that brings them on automatically at dusk", "only affects tonight", and "picks everything back up automatically from tomorrow". It did not contain "fuse board" — the fuse-board check is correctly absent from the online branch.

**112-2 — Offline script text present including fuse-board check (design §8 assertion 7)**

- Verdict: PASS
- Method: test `112-B` navigated to site 6360 (Mill House, offline lighting device). The `.script` element contained all three 112-A points plus "fuse board" and "tripped breaker". All five required phrases observed present.

**112-3 — Responsive render at ≤1100px, no overflow (design §8 assertion 8)**

- Verdict: PASS
- Method: test `112-C` set viewport to 1100×800, navigated to the lighting flow, and evaluated `scrollWidth` vs `clientWidth` on the `.script` element. `scrollWidth <= clientWidth + 1` was observed true — the block does not overflow at the breakpoint.

### Unhappy path (unchanged — regression check)

**Unhappy path — outcome POST failure surfaces inline error, no silent drop (design §8, final assertion)**

- Verdict: PASS
- Method: pre-existing test `control.spec.js:229` ("outcome-record failure shows inline error with manual retry (Protocol 4: 500 path)") ran as test 25 in the suite and passed. This is the `_err_` path in `finishOutcome`. It was not modified by this change set and continues to pass, confirming the error path is unbroken.

---

## 4. Summary pass/fail table

| Assertion | Design ref | Verdict |
|---|---|---|
| P1 fires on "still not working"; `type:'escalate-p1'`; `outcome-p1` card | §8-111-1 | PASS |
| Regression guard: `r:'ok'` stays capture; no `ooh_p1`; no SMS | §8-111-2 | PASS |
| Log-mode honesty: "Text not sent" fallback on lighting path | §8-111-3 | PASS |
| No-device guard: scope message; P1 chip absent | §8-111-4 | PASS |
| `p1Summary` propagates as `'External lighting not responding'` | §8-111-5 | PASS |
| Online script: dusk sensor + one-off override + auto-reset; no fuse-board | §8-112-1 | PASS |
| Offline script: all online points plus fuse-board + tripped-breaker | §8-112-2 | PASS |
| ≤1100px: `.script` no overflow | §8-112-3 | PASS |
| Unhappy path: POST failure → inline error; no silent drop | §8 final | PASS |

All 9 assertions: **9/9 PASS**.

---

## 5. Live / B2C walkthrough (B2C condition)

**Status: CARRIED — no credentials available.**

The CIR (`C:\Users\james\OneDrive - Airedale Catering Equipment\Projects\Work\Central Integration Repository`) was searched for B2C sign-in credentials (handler `@sccuk.com` or IoT `@airedale-group.co.uk` accounts). No `credentials/` directory or `.env` files were found on disk. The `OOH_DASHBOARD_DEPLOY.md` confirms that handler access is provisioned to SCC-outsourced staff (`@sccuk.com`) via Cosmos claims — no shared service-account or test-user password is stored in the CIR.

The automated suite covers all 8 design §8 assertions via the local dev-auth harness (the test server runs `AUTH_MODE=dev`, which the app's `services/auth.js` exposes for testing; this is the same path every other e2e test uses). The B2C condition is a live-app walkthrough to confirm the UI renders correctly end-to-end behind the OIDC gate, not a behavioural test — the behaviour is fully covered by the suite.

**What the B2C condition requires:** a tester with a provisioned handler login (claimArea 1500 in `claims`) to open `https://ooh.airedale-group.io`, sign in, navigate to a site with a `kind:'lighting'` device, and confirm: (a) the online/offline script texts match the design, (b) the "Still not working" path renders a red P1 outcome card, and (c) the override-resolved path renders a blue capture card. This is a human sign-off moment, not an automated assertion.

B2C carried — route to James / IoT team for a manual walk-through using an existing handler login.

---

## 6. Open conditions carried from design

| # | Condition | Owner | Status |
|---|---|---|---|
| D2 | Confirm `SMS_PROVIDER=twilio` active in production before v1.3.4 ships | Spencer / IoT ops | Open — release held on this |
| D3 | Sam Day signs off OOHDASH-112 wording (three questions in design §5) | Sam Day (IoT Support lead) | Open — blocks 112 going fully live |
| B2C | Live-app walkthrough validation on deployed app behind Azure B2C | James / IoT team | Open — no credentials available; carried |

---

## 7. Release

**Planned release: v1.3.4.** ONE patch release covers both OOHDASH-112 (text) and OOHDASH-111 (P1 escalation). Because 111 is bundled in, v1.3.4 is held until D2 is confirmed (SMS_PROVIDER=twilio active in production — Spencer to confirm). No version was bumped and no release was cut in this test phase.

---

## 8. Source verification — implementation matches design

The following was read directly from `public/js/flows.js` at lines 594–616 (post-merge) and confirms the build matches the design contract exactly. Shown as inline chips (not fenced blocks).

**Script text (line 594):** The ternary selects the whole sentence per state — `lg.online ? '…dusk sensor…only affects tonight…picks everything back up automatically from tomorrow…' : '…dusk sensor…fuse board first…tripped breaker…that only covers tonight…picks everything back up automatically from tomorrow…'`. Both required sentences are present with all design-specified phrases.

**P1 branch (lines 609–615):** `doneLine('Override did not resolve — P1')` followed by `outcomeP1(f, 'cap', { subject:'External lighting not working — P1', p1Summary:'External lighting not responding', … })`. `outcomeCaptured` is gone from this branch. `OohCaptureClass:'lighting'` is absent (correct — `outcomeP1` does not use it).

**Override-resolved branch (lines 600–607):** `outcomeCaptured(f, 'ok', { … OohCaptureClass:'lighting' })` — unchanged, no `ooh_p1` tag, no `p1Summary`, no `doneLine` change. Regression guard source verified.

No server files were modified (`routes/api.js`, `services/`, `config.js` all unchanged from pre-change baseline). The P1 plumbing is reused without modification.
