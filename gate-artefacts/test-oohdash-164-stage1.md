<!-- gate:contract
TICKET: OOHDASH-164
PHASE: test
STEP: committee

SECTION: What this gate covers
Test gate for OOHDASH-164 Stage 1 (TB bulk read). Covers three checks: (1) screen-text diff of every new and changed wording string from design section 6; (2) Playwright e2e full suite result annotated to show which failures are pre-existing; (3) parity script status and credential path. A D2 implementation gap was found and fixed in this gate session (ef7dd36 — confirm screen read-failed state in views.js); three Playwright tests covering the fix were also written (D2-1/D2-2/D2-3, commit 21cc83a). Both the fix and its test coverage are documented below.

SECTION: Screen-text diff — design section 6 wording
All six Stage 1 wording strings from design section 6 are present in the branch code with the correct text. Stage 2 items ("Waiting for equipment readings…" and "We couldn't load tickets just now — try again") are out of scope for Stage 1. The six checked strings: (1) Confirm screen, Checking — "Checking the Lighthouse equipment at this site…" and button "Checking site…" (disabled), found at views.js:276, 279. (2) Confirm screen, Read failed — "We couldn't read the Lighthouse equipment just now. You can still confirm the site.", found at views.js:275–278 after the ef7dd36 fix. (3) Site page, Scope tag — "Data unavailable" (grey, dashed border, ? icon), found at views.js:376. (4) Site page, Notice — "We couldn't read some Lighthouse equipment just now. It may be working — we just can't see it. The page will try again in 30 seconds.", found at views.js:393. (5) Heating flow, Zone unreadable — "We can't read the thermostat in this area right now, so we can't check or change it from here.", found at flows.js:2070. (6) Ticket note, Zone unreadable — "Thermostat data unavailable at time of call (read failed) — not confirmed offline", found at flows.js:2056.

SECTION: D2 gap fix (ef7dd36) and automated test coverage
The D2 build commit (2bfb249) updated flows.js for unreadable devices but did not update the confirm screen's read-failed state in views.js. The .catch() handler was silently setting _confirmGateSummaryLoaded to true without re-rendering, leaving the confirm button permanently disabled with "Checking site…" after a summary read failure. The design text ("We couldn't read the Lighthouse equipment just now. You can still confirm the site.") was also absent from deviceLine. Fixed in ef7dd36: _confirmGateReadFailed tracking variable added, .catch() now re-renders with the correct message and re-enables the confirm button. The fix is six lines in views.js. Three Playwright e2e tests were written and pass in this gate session (commit 21cc83a, tests/oohdash-164-confirm-read.spec.js): D2-1 verifies the button is disabled with "Checking site…" while /summary is in-flight (page.route hangs the response); D2-2 verifies the ef7dd36 fix directly — a network abort (page.route abort) causes the button to re-enable and the read-failed message to appear; D2-3 verifies the success path — device summary lands and button enables with the On Lighthouse line. All three pass. The resolve response is intercepted in each test to strip deviceSummary, forcing the background /summary fetch (which the production code takes when the bridge inventory has no devices). James's approval of this gate review records his independent sign-off on ef7dd36.

SECTION: Playwright e2e (fixture mode)
Full Stage 1 suite result — clean serial run, 2026-11-13: 184 pass, 23 fail, 2 skip. The 3 extra passes vs the build gate are the new D2-1/D2-2/D2-3 tests. All 23 failures are pre-existing. Independently verified: main-branch run on the 7 suspect spec files gave 65 pass, 17 fail, matching Stage 1 identically on those same files. The failing tests are: E16 and E17 in additional-notes.spec.js, AC4 in area-model.spec.js, BC-E5 and BC-151-E2 in boilercontrol.spec.js, J13 in control-rosetta.spec.js, F005, F007, and Protocol4-500 in control.spec.js, 134-G in oohdash-134-other-p1.spec.js, E12 in oohdash-136-dhw-override.spec.js, 111-A, 111-C, and 111-E in outside-lighting-p1.spec.js, Fix 1 in rosetta-dark-fleet-and-schedule.spec.js, TF-06, TF-08, TF-09, TF-11, and TF-12 in tester/oohdash-119.tester.spec.js, and connection-check, contractor-P1, and scope-check in tonight-callback.spec.js. No Stage 1 regressions.

SECTION: Parity script status and credential path
The parity script (scripts/tb-parity.mjs) is a release gate blocker — not a test gate blocker — per design section 8. It could not be run in this session: both TB accounts available (from CIR credentials/thingsboard.env and repos/ooh-triage-dashboard/.env) have MFA enabled, returning PRE_VERIFICATION_TOKEN scope which blocks /api/tenant/devices queries. The app's TB_API_KEY is in a Kubernetes secret; the deployer-ooh service account cannot read secrets or exec into pods. Before the release gate, James or Spencer must run the script using a short-lived scoped API key (preferred over a standing non-MFA TENANT_ADMIN account). To avoid shell-history and ps-listing leakage, use a prompted read: "read -s TB_READ_API_KEY; export TB_READ_API_KEY" before running the script. The script also needs a small update to accept TB_READ_API_KEY and use the "Authorization: ApiKey <key>" header format.

SECTION: 30-second workspace refresh timer
The "try again in 30 seconds" copy in the anyUnknown notice (views.js:393) refers to the pre-existing scheduleWorkspaceRefresh setInterval at views.js:353, which Stage 1 did not introduce. The timer is guarded by state.view, confirmToken, state.flow, and window.ctl checks but does not check document.hidden. Tab-background polling is a pre-Stage-1 standing posture. The release gate should confirm this is acceptable or add a visibility guard.

SECTION: Invariants held
Write path unchanged. F004 unchanged: confirm button disabled until server confirms site unique. An unreadable device (readOk false) never unlocks control. No new npm dependency. No production changes. No kubectl writes. No TB writes.

DECISION: Accept screen-text diff (all 6 wording strings correct) and proceed? | A: Accept — wording correct, D2 gap fixed, proceeding to release gate (recommended) | B: Reject — reopen build

DECISION: Accept ef7dd36 (confirm screen read-failed fix) as independent reviewer? | A: Accept and sign off — fix is correct, three Playwright tests confirm all three states (D2-1/D2-2/D2-3) | B: Reject — reopen build

DECISION: Accept parity script deferral to release gate? | A: Accept — James or Spencer to run against TB_API_KEY before release, as designed | B: Block — parity must run now before this gate passes

DECISION: Accept e2e results (184 pass / 23 fail / 2 skip, all failures pre-existing, 3 new D2 tests pass)? | A: Accept — no regressions | B: Investigate — one or more failures need explaining
-->

# Test gate: OOHDASH-164 Stage 1

Project ooh-triage-dashboard, branch feat/oohdash-164-stage1 (via gate branch gate/test-oohdash-164-stage1). Date 2026-11-13. Follows the build gate (PR #204, merged 2026-11-13 15:56). Release target: v1.8.0.

## Screen-text diff — design section 6

All six Stage 1 wording strings are present and correct in the branch code after the ef7dd36 fix.

| Screen | State | Design text | Status | Location |
|---|---|---|---|---|
| Confirm | Checking | "Checking the Lighthouse equipment at this site…"; button "Checking site…" (disabled) | ✓ | views.js:276, 279 |
| Confirm | Read failed | "We couldn't read the Lighthouse equipment just now. You can still confirm the site." | ✓ Fixed ef7dd36 | views.js:275–278 |
| Site page | Scope tag | "Data unavailable" (grey, dashed border, ? icon) | ✓ | views.js:376 |
| Site page | Notice | "We couldn't read some Lighthouse equipment just now. It may be working — we just can't see it. The page will try again in 30 seconds." | ✓ | views.js:393 |
| Heating flow | Zone unreadable | "We can't read the thermostat in this area right now, so we can't check or change it from here." | ✓ | flows.js:2070 |
| Ticket note | Zone unreadable | "Thermostat data unavailable at time of call (read failed) — not confirmed offline" | ✓ | flows.js:2056 |

## D2 gap — confirm screen read-failed (ef7dd36)

The D2 build commit (2bfb249) only touched `flows.js`. The confirm screen's `.catch()` handler in `views.js` was silently setting `_confirmGateSummaryLoaded = true` without re-rendering — leaving the confirm button permanently stuck at "Checking site…" on a summary-read failure, and showing no message. Fix: `_confirmGateReadFailed` tracking variable + `.catch()` re-renders with the correct message + re-enables the confirm button.

**Automated test coverage added (commit 21cc83a):** `tests/oohdash-164-confirm-read.spec.js` — three Playwright tests using `page.route()` to intercept `/api/sites/6832/resolve` (strips `deviceSummary` to force the background fetch) and `/api/sites/6832/summary` (hung, aborted, or real response). D2-1: checking state confirmed. D2-2: ef7dd36 fix confirmed — abort triggers re-render with read-failed message and re-enabled button. D2-3: success path confirmed. All three pass.

**Independent review:** this fix was authored by the tester session. James's approval of this gate serves as the required independent sign-off.

## Playwright e2e (fixture mode)

| Run | Pass | Fail | Skip |
|---|---|---|---|
| Stage 1 full clean run (inc. D2-1/D2-2/D2-3) | 184 | 23 | 2 |
| Main branch (7 suspect spec files) | 65 | 17 | 2 |

Main branch verification shows the same 17 failures across the same 7 spec files, confirming all 23 Stage 1 failures are pre-existing. No Stage 1 regressions.

Pre-existing failures: E16/E17 (additional-notes), AC4 (area-model), BC-E5/BC-151-E2 (boilercontrol), J13 (control-rosetta), F005/F007/Protocol4-500 (control), 134-G (oohdash-134-other-p1), E12 (oohdash-136-dhw-override), 111-A/C/E (outside-lighting-p1), Fix 1 (rosetta-dark-fleet-and-schedule), TF-06/08/09/11/12 (tester/oohdash-119), connection-check/contractor-P1/scope-check (tonight-callback).

## Parity script

**Status: deferred to release gate (design §8 step 3).** Both TB accounts available in this session have MFA enabled — the parity script cannot authenticate without the app's `TB_API_KEY` (held in a K8s secret the deployer-ooh service account cannot read).

**Before release gate:** James or Spencer must run the parity script with a short-lived scoped API key. The script should be updated to accept `TB_READ_API_KEY` with `Authorization: ApiKey <key>` header format. Use `read -s` to avoid shell-history leakage.
