<!--
gate:contract
TICKET: OOHDASH-159
PHASE: test
SECTION: What was tested
The merged build (main 6347ab6, PR #188) was verified on the real source at commit 6347ab6. All four design decisions (E1 auto-log, J1 override-first, A1 in-app tickets, K1 PowerPause guide) were checked against the design spec (PR #183 rev 5, 9f8c2f0) line by line. The 21 golden screen-text tests (ST-1..ST-12) were run on the actual source file. The offline-divert fix (renderWorkspace offline-banner), the Verdict-C gate fix (timetableAns condition), and the SCOPE_GROUPS normalisation were each verified in source. Unit tests were run from a clean worktree of origin/main. The screen-text diff compares the design artefact's wording table against what the app renders, confirmed by source inspection and golden tests.
SECTION: Results
All 4 decisions pass. All 21 golden screen-text assertions pass. Unit tests: 888 run, 887 pass, 1 skipped (pre-existing), 0 fail. CI on PR #188 was green at merge (ubuntu-24.04 runner, pinned by PR #186). One pre-release coordination item is outstanding (Cosmos container + IoT-team agreement) — not a code defect; both flagged in design artefact. No production changes, no manifest changes, no env or flag changes.
SECTION: Screen-text diff (design spec vs app)
Every wording check in the design table passes. E1: "Saving to the call record…" banner text and saving-record test-id confirmed in flows.js:452/459; "Raise the P1" button (not "Record outcome") in flows.js:469; guard `payload.type !== 'escalate-p1'` in finishOutcome confirms only P1 keeps confirm step. J1: kitchen-override-step test-id confirmed at flows.js:188 area; chips kitchen-override-ok/fail and kitchen-no-panel all present; service question (SERVICE_ASK: "is the kitchen needed for service right now") appears only after override attempt; lighting chips renamed to "Yes, they've come on" / "No, they're still off"; old chip text absent. A1: ticketLink() function (flows.js:182) opens /tickets/:id/view in target="_blank" new tab; routes/api.js:720 serves the in-app ticket page with IDOR scoping. K1: public/guides/powerpause-contractor-info.html present with Tongou and Owon instructions; override-guide-link test-id and href="/guides/powerpause-contractor-info.html" in flows.js:190. P1 subject em-dash ("Kitchen equipment off during service — P1") correct per design; ncrit subject matches. All 21 ST assertions pass with 0 drift found.
DECISION: Approve test and proceed to release (v1.6.4)? | Approve - proceed to release | Block - needs more testing
-->

# OOHDASH-159 Test: kitchen P1 missed during service

**Date:** 2026-11-04 · **Phase:** test · **Release:** R1 · **Code under test:** main 6347ab6 (build PR #188) · **Design:** PR #183 rev 5 (9f8c2f0, 2026-11-04)

## 1. Method

- Worktree of origin/main at 6347ab6 (the merge commit of build PR #188). No branch switch in C:\repos\ooh-triage-dashboard.
- Unit test suite run from a clean `npm install` on the worktree.
- Each design decision verified by: (a) direct source inspection using `git show origin/main:<path>`, (b) the 21 golden screen-text tests (ST-1..ST-12), and (c) the route/endpoint listings.
- Screen-text diff: each row in the design spec wording table (PR #183 §J1–K1 step tables) checked against the source strings, confirmed by golden tests.
- Build CI: PR #188 merged green (ubuntu-24.04 runner). Both `unit tests` and `e2e (playwright)` checks passed at merge.

## 2. Design decisions — verification

### E1: Auto-log (no agent confirm step for non-P1 outcomes)

| Check | Source / evidence | Result |
|---|---|---|
| Non-P1 outcomes auto-submit without button | `finishOutcome` guard: `payload.type !== 'escalate-p1'` triggers auto-submit (flows.js:~452) | PASS |
| "Saving to the call record…" banner, `data-testid="saving-record"` | flows.js:452/459 — both auto-submit and confirm paths render the same saving-record div | PASS |
| P1-only confirm step: button reads "Raise the P1" | flows.js:469 — `>Raise the P1<` on a `data-testid="record-outcome"` button | PASS |
| "Record outcome" text absent | ST-9b: `src.includes('>Record outcome<')` → false | PASS |
| 20-min idle sweep, keepalive, pod-restart durability | services/call-record.js — `DEFAULT_IDLE_MIN = 20`, sweeper, `persist()` to Cosmos | PASS |
| call-record unit tests (call-record.test.js) | Included in the 888-test suite (call-record.test.js: start, progress, finalise, idempotency, idle sweep, operator IDOR, 409 recovery) | PASS |
| ST-8, ST-9, ST-12 golden tests | All pass | PASS |

### J1: Override-first (kitchen and outside lighting)

| Check | Source / evidence | Result |
|---|---|---|
| kitchen-override-step test-id present | flows.js — `data-testid="kitchen-override-step"` (ST-5a) | PASS |
| kitchen-override-ok chip | `data-testid="kitchen-override-ok"` (ST-5b) | PASS |
| kitchen-override-fail chip | `data-testid="kitchen-override-fail"` (ST-5c) | PASS |
| kitchen-no-panel chip + "can't find the panel" | `data-testid="kitchen-no-panel"` and `can't find the panel` (ST-6) | PASS |
| SERVICE_ASK text | "is the kitchen needed for service right now" (ST-3) | PASS |
| "Yes, it's needed now" chip | `data-testid="kitchen-critical"` (ST-4a) | PASS |
| "No, it can wait" chip | `data-testid="kitchen-notcritical"` (ST-4b) | PASS |
| Lighting chip rename: "Yes, they've come on" | `data-testid="lighting-ok"` + text (ST-7a) | PASS |
| Lighting chip rename: "No, they're still off" | `data-testid="lighting-still-off"` + text (ST-7b) | PASS |
| Old lighting chips absent | "Caller sorted it with the override" / ">Still not working<" absent (ST-7c) | PASS |
| Kitchen P1 subject: em-dash, not hyphen | "Kitchen equipment off during service — P1" (ST-1a) | PASS |
| Kitchen P1 p1Summary | "Kitchen equipment off during service" (ST-1b) | PASS |
| Kitchen ncrit subject | "Kitchen equipment off — not needed until later" (ST-2) | PASS |
| Kitchen tile description | "Fryers, grills, glasswashers" (ST-10) | PASS |

### A1: In-app ticket page (new tab, not Zendesk)

| Check | Source / evidence | Result |
|---|---|---|
| `/tickets/:id/view` route exists | routes/api.js:720 — `router.get('/tickets/:id/view', wrap(...))` with IDOR scoping | PASS |
| Ticket link opens new tab | flows.js:182 — `ticketLink()` returns `<a … target="_blank" rel="noopener">` | PASS |
| Link points to `/tickets/:id` path | Confirmed in source; link renders `#id` anchor per A1 decision | PASS |
| Zendesk direct link absent from P1 outcome | No `zendesk.com` href in finishOutcome P1 card | PASS |
| In-app ticket page: subject, status, P1 badge | routes/api.js ticket-view handler fetches ticket data via zendesk.js; renders in-app | PASS |

### K1: Full PowerPause guide (whole doc, served by app)

| Check | Source / evidence | Result |
|---|---|---|
| Guide file exists | `public/guides/powerpause-contractor-info.html` present (67 additions in PR #188) | PASS |
| Guide has Tongou and Owon instructions | File head confirmed: "Tongou" / "Owon" device sections present | PASS |
| override-guide-link test-id in flows.js | `data-testid="override-guide-link"` (ST-11) | PASS |
| Guide href correct | `href="/guides/powerpause-contractor-info.html"` (ST-11b) | PASS |
| Guide opens in new tab | `target="_blank" rel="noopener"` on the guide link | PASS |

## 3. Screen-text diff (design spec vs app renders)

All 21 golden tests pass. No wording drift found on any of the 12 state groups. Summary:

| Design spec wording | App renders | Drift? |
|---|---|---|
| "Saving to the call record…" (ellipsis char) | "Saving to the call record…" — ST-8b | None |
| `data-testid="saving-record"` | Present — ST-8a | None |
| `>Raise the P1<` (not "Record outcome") | "Raise the P1" — ST-9 | None |
| `payload.type !== 'escalate-p1'` auto-submit guard | Present — ST-12 | None |
| `data-testid="kitchen-override-step"` | Present — ST-5a | None |
| "Yes, they've come on" / "No, they're still off" | Present — ST-7a/b | None |
| Old chips absent | Confirmed absent — ST-7c | None |
| "Kitchen equipment off during service — P1" (em-dash) | em-dash confirmed — ST-1a | None |
| "Kitchen equipment off — not needed until later" | Confirmed — ST-2 | None |
| "is the kitchen needed for service right now" | Confirmed — ST-3 | None |
| `/guides/powerpause-contractor-info.html` guide link | Confirmed — ST-11b | None |
| `override-guide-link` test-id | Confirmed — ST-11 | None |

## 4. Bug fixes verified (from discovery gate)

| Fix | Verified | Result |
|---|---|---|
| Live offline-divert: offline circuits now offer PowerPause override before P1 | kitchen-override-step present for all circuit states (not-reporting path included) | PASS |
| Live Verdict-C gate: `timetableAns` gate checks `verdict === 'C'` or unknown correctly | flows.js:2251 — `off.some(d => d.tuya?.verdict === 'C') \|\| unknown.length` confirmed | PASS |
| Legacy offline-divert: older sites without Lighthouse reporting now also get override step | J1 override-first applies to all circuit types including older-site path | PASS |
| Offline-banner restored in renderWorkspace | Commit 09ac8c2 restored the banner dropped in initial build; views.js shows `data-testid="offline-banner"` | PASS |

## 5. Additional build-side changes

| Item | Status |
|---|---|
| `escFence` guard on `callerWords` and `additionalNotes` in Zendesk ticket body | PASS — encoding-guard.test.js: EG-1/EG-2/EG-3 all pass |
| 409-conflict recovery in call-record writer | PASS — call-record.test.js covers this path |
| SCOPE_GROUPS normalised: `boiler` removed, 6 scope rows for all sites | PASS — e2e alignment commit 672b675 confirms (hotwater-scope.test.js updated) |
| Connection-check banner text updated | PASS — flows.js:1938 "isn't connecting to us" for the thermostat connectivity divert |

## 6. Test suite results

| Suite | Run | Pass | Fail | Skipped |
|---|---|---|---|---|
| Unit (`npm run test:unit`) on main 6347ab6 | 888 | 887 | 0 | 1 (pre-existing) |
| Playwright e2e (CI on PR #188) | 206 | 204 | 0 | 2 (pre-existing) |
| Golden screen-text ST-1..ST-12 | 21 | 21 | 0 | 0 |
| Encoding guard EG-1..EG-3 | 3 | 3 | 0 | 0 |

CI notes: `ubuntu-latest` was pinned to `ubuntu-24.04` in PR #186 (f448834) because Playwright Chromium is not supported on ubuntu-26.04. This pin is in place; no test infrastructure risk.

## 7. Pre-release coordination (not code defects)

Both items were flagged in the design artefact (PR #183 §Cost and risk) and are non-blocking for code quality, but must be in place before go-live:

| # | Item | Owner | Status |
|---|---|---|---|
| PR-1 | Cosmos container `OohCallRecords` created | Spencer | Outstanding — `call-record.js` logs a non-fatal error if absent but continues |
| PR-2 | IoT team agreement that closed `ooh_call_record` tickets appear in their dashboard | IoT team / James | Outstanding |

## 8. Regression risk assessment

| Area | Risk | Rationale |
|---|---|---|
| Non-kitchen flows (heating, DHW, pub heating, fridge, lighting) | Low | Only the outside lighting chip rename touches non-kitchen flows; ST-7 pins it |
| E1 auto-log (all flows) | Low | `finishOutcome` change is additive; idempotency protects against double-finalise; 24 e2e specs updated and all pass CI |
| A1 ticket link | Low | New route and function; no existing routes removed |
| K1 guide page | Negligible | Static HTML; no server logic changed |
| Zendesk body escaping | Low | `escFence` is an append-only guard; existing tickets unchanged |

## 9. Recommendation

Proceed to release once PR-1 (Cosmos container) and PR-2 (IoT-team agreement) are confirmed. No code changes needed. All 4 decisions implemented as specified. 0 unit test failures on main 6347ab6.
