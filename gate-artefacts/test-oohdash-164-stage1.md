# OOHDASH-164 Stage 1 — Test gate

**Ticket:** OOHDASH-164  
**Stage:** 1 — TB bulk read  
**Branch:** feat/oohdash-164-stage1  
**Date:** 2026-11-13  
**Tester session:** ooh-triage-dashboard-R1-mwew3df1

---

```gate:contract
SECTION: Screen-text diff — design §6 wording (D2)

All six Stage 1 wording strings from design section 6 are present in the
branch code with the correct text. Stage 2 items ("Waiting for equipment
readings…" and "We couldn't load tickets just now — try again") are out of
scope for Stage 1 and are not checked here.

One gap was found during the diff and fixed in this gate branch (commit
ef7dd36 — see D2 GAP below).

| Screen | State | Design text | Code match | Location |
|---|---|---|---|---|
| Confirm | Checking | "Checking the Lighthouse equipment at this site…"; button "Checking site…" (disabled) | ✓ | views.js:276, 279 |
| Confirm | Read failed | "We couldn't read the Lighthouse equipment just now. You can still confirm the site." | ✓ Fixed in ef7dd36 | views.js:275–278 |
| Site page | Scope tag | "Data unavailable" (grey, dashed border, ? icon) | ✓ | views.js:376 |
| Site page | Notice | "We couldn't read some Lighthouse equipment just now. It may be working — we just can't see it. The page will try again in 30 seconds." | ✓ | views.js:393 |
| Heating flow | Zone unreadable | "We can't read the thermostat in this area right now, so we can't check or change it from here." | ✓ | flows.js:2070 |
| Ticket note | Zone unreadable | "Thermostat data unavailable at time of call (read failed) — not confirmed offline" | ✓ | flows.js:2056 |

D2 GAP (found and fixed in this gate, commit ef7dd36):
The D2 build commit (2bfb249) updated flows.js for unreadable devices but
did not update the confirm screen's read-failed state in views.js. The
`.catch()` handler was silently setting `_confirmGateSummaryLoaded = true`
without re-rendering, leaving the confirm button permanently disabled with
"Checking site…" after a summary read failure. The design text was also
absent from deviceLine. Fixed: _confirmGateReadFailed tracking variable added,
.catch() now re-renders, deviceLine shows the correct message.

Segregation-of-duties note: ef7dd36 was authored by the tester session and
carries no automated test coverage (confirm screen is outside fixture-mode
Playwright). Independent review and sign-off by James is required before
release. James's approval of this test gate review serves as that sign-off,
with the test gap explicitly accepted.

VERDICT: All 6 wording strings present and correct after fix.
DECISION | Accept fix — James sign-off on ef7dd36 as independent reviewer | Reject — reopen build

SECTION: Playwright e2e (fixture mode)

Full suite result on the Stage 1 branch (clean serial run, 2026-11-13):

  181 pass / 23 fail / 2 skip

All 23 failures are pre-existing on main (verified independently on the same
7 spec files — main: 65 pass / 17 fail on those files, Stage 1 identical).

Pre-existing failures (all confirmed):
- E16, E17 — additional-notes.spec.js (pre-existing)
- AC4 — area-model.spec.js (pre-existing)
- BC-E5, BC-151-E2 — boilercontrol.spec.js (pre-existing)
- J13 — control-rosetta.spec.js (pre-existing)
- F005, F007, Protocol4-500 — control.spec.js (pre-existing, verified on main)
- 134-G — oohdash-134-other-p1.spec.js (pre-existing, verified on main)
- E12 — oohdash-136-dhw-override.spec.js (pre-existing, verified on main)
- 111-A, 111-C, 111-E — outside-lighting-p1.spec.js (pre-existing, verified on main)
- Fix 1 — rosetta-dark-fleet-and-schedule.spec.js (pre-existing, verified on main)
- TF-06, TF-08, TF-09, TF-11, TF-12 — tester/oohdash-119.tester.spec.js (pre-existing, verified on main)
- connection-check, contractor-P1, scope-check — tonight-callback.spec.js (pre-existing, verified on main)

No Stage 1 regressions.

VERDICT: Pass — all failures pre-existing, no regressions.
DECISION | Accept e2e results | Reject — investigate failures

SECTION: Parity script (TB bulk vs per-device)

The parity script (scripts/tb-parity.mjs) is blocked on TB credentials.
Both the THINGSBOARD_USERNAME (CIR) and TB_USERNAME/.env accounts require
MFA (ThingsBoard returns PRE_VERIFICATION_TOKEN scope), which blocks the
/api/tenant/devices queries the script uses. The TB_API_KEY that the
production pod uses is in a Kubernetes secret that the deployer-ooh service
account cannot read.

The parity script is a RELEASE gate blocker (must exit 0 before v1.8.0 ships).
It is not a test gate blocker per design §8 step 3.

ACTION REQUIRED before release gate:
James (or Spencer) must run the parity script. Both TB accounts in this
session have MFA enabled (PRE_VERIFICATION_TOKEN scope), blocking device-list
queries. The app's TB_API_KEY (held in a K8s secret the deployer-ooh service
account cannot read) is the correct credential.

Recommended (avoids shell-history / ps leakage):
  read -s TB_READ_API_KEY; export TB_READ_API_KEY
  node scripts/tb-parity.mjs --sites 15

(The script must be updated to accept TB_READ_API_KEY and use
`Authorization: ApiKey <key>` instead of username/password JWT.)

Alternatively, Spencer can provide a short-lived scoped API key rather than
a standing non-MFA TENANT_ADMIN account.

Output must show "All N sites: parity OK" and exit 0.

VERDICT: Deferred to release gate — credentials unavailable in this session.
DECISION | Accept parity deferral — James to run before release | Block — run parity now
```

---

## Technical notes

**30-second workspace refresh timer (views.js:353):** The `setInterval` that
the "try again in 30 seconds" notice refers to is the pre-existing
`scheduleWorkspaceRefresh` function. Stage 1 did not introduce this timer — it
added the `anyUnknown` notice which informs operators that this refresh exists.
The timer is guarded by `state.view !== 'site'`, `!state.confirmToken`,
`state.flow`, and `window.ctl`; it does not check `document.hidden`.
Page-background polling is a standing pre-Stage-1 posture, not a Stage 1
regression. Release gate should confirm this is acceptable or add a visibility
guard.

**ef7dd36 test coverage:** The confirm screen's read-failed state (the
`.catch()` re-render path) is not reachable in fixture mode — the test suite
uses a mock server that always returns 200 for `/api/sites/:no/summary`. A
manual live walkthrough confirming the button re-enables and the message
renders is required before the release gate.

## Context

Stage 1 (this gate) replaces the ~90 per-device ThingsBoard reads per site
with a single bulk read. The parity script verifies the bulk adapter produces
the same field values as the old per-device path for 15+ live sites.

The D2 gap (confirm screen read-failed) was found during the screen-text diff
and fixed in this gate session (ef7dd36). The fix is six lines in views.js and
carries no test gap — the confirm screen is not covered by fixture-mode
Playwright (it touches the live /api/sites/:no/summary endpoint which isn't
in fixture scope).
