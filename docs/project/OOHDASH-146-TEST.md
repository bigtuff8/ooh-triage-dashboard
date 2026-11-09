<!-- gate:contract
TICKET: OOHDASH-146
PHASE: test
SECTION: Playwright suite result
182 tests passed, 2 skipped, 0 failed. Exit code 0. Run against main at 545659e (the OOHDASH-146 build merged via PR #192 + CI cleanup PR #193). The 2 skips are pre-existing: tests\tester\oohdash-119-screenshots.spec.js screenshots that require a headed browser (always skipped in headless runs). No new skips introduced by this release.
SECTION: OOHDASH-146 B-row test coverage
B2/B19/B20/B22/B26 (riskQuestion + p1ReasonBox + Something else redesign): tests\oohdash-134-other-p1.spec.js — 8 tests (134-A through 134-H), all pass. Covers: riskQuestion chips visible after scope-none-of-these; risk-yes → p1-reason box shown + record-outcome disabled until 10+ chars; p1Summary cut to ≤80 chars in POST; p1Reason kept full; risk-no → non-P1 capture with correct subject; scope chips at stage 1; phone-width layout. B23/B24 (riskQuestion across lighting, A/C, heating dark-fleet, contractor): tests\outside-lighting-p1.spec.js (111-A, C, E with risk-yes added); tests\area-model.spec.js (risk-no after aircon-shortcut); tests\oohdash-128-legacy-salus.spec.js E3 (risk-no after dark-capture); tests\rosetta-dark-fleet-and-schedule.spec.js (risk-no after dark-capture); tests\resolution.spec.js (risk-no after ambiguous-capture) — all pass. B38 (P1 wording "on-call agent"/"text message"): 111-C asserts dispatch status contains "on-call agent" and "text message" and does not contain old wording — pass. Additional notes regression (B10/B33/B34): tests\additional-notes.spec.js — full suite passes including updated E3–E26 flows with riskQuestion gates inserted. Tester suite (TF-07, TF-12, TF-15, TF-16 updated): tests\tester\oohdash-119.tester.spec.js — all pass.
SECTION: Regression coverage
Full suite of 182 tests covers all flows present before OOHDASH-146. No existing tests removed. Control, connectivity, heating, DHW override, kitchen, boiler, aircon, lighting, fridge, tonight-callback, scope, killswitch, area-model, legacy-salus, and tester-screen suites all pass. The 10 boiler-boost-control unit tests are time-gated (01:00–07:00 service window); the Playwright suite does not include these and passes unconditionally.
SECTION: CI governance change
Per James's direction (2026-11-09), the e2e job has been removed from GitHub Actions CI (PR #193, commit bdee47c). The harness test gate is now the sole owner of Playwright evidence. GitHub CI carries unit tests only (the WRITES_DISABLED interlock). Branch protection updated accordingly.
DECISION: Approve — proceed to release | Approve - proceed to release | Block - needs changes
DETAIL: main at 545659e. 182 Playwright tests pass, 0 fail, 2 pre-existing skips. All OOHDASH-146 B-row tests verified. Regression suite clean.
-->

# OOHDASH-146 Test Gate

**Main tip:** `545659e` (PR #192 + #193 merged)  
**Suite:** Playwright e2e — run locally against `main` at `545659e`

## Result

| Suite | Pass | Fail | Skip | Exit |
|---|---|---|---|---|
| Playwright e2e (182 unique tests) | **182** | **0** | 2 | **0** |

The 2 skips are pre-existing: `tests\tester\oohdash-119-screenshots.spec.js` screenshot tests that require a headed browser. No new skips.

## OOHDASH-146 B-row test coverage

| Rows | Test file | Tests | Result |
|---|---|---|---|
| B2/B19/B20/B22/B26 — riskQuestion + p1ReasonBox + Something else | `oohdash-134-other-p1.spec.js` | 134-A through 134-H | ✓ all pass |
| B23 — lighting riskQuestion | `outside-lighting-p1.spec.js` | 111-A, 111-C, 111-E | ✓ all pass |
| B24 — A/C riskQuestion | `area-model.spec.js` | risk-no after aircon-shortcut | ✓ pass |
| B24 — heating dark-fleet riskQuestion | `oohdash-128-legacy-salus.spec.js` E3 | risk-no after dark-capture | ✓ pass |
| B24 — dark-fleet (Rosetta) | `rosetta-dark-fleet-and-schedule.spec.js` | risk-no after dark-capture | ✓ pass |
| B26 — ambiguous site riskQuestion | `resolution.spec.js` | risk-no after ambiguous-capture | ✓ pass |
| B38 — P1 wording | `outside-lighting-p1.spec.js` | 111-C dispatch-status text | ✓ "on-call agent" / "text message" |
| B10/B33/B34 — additional notes + caller banner | `additional-notes.spec.js` | E3–E26 (riskQuestion gates inserted) | ✓ all pass |
| Tester suite | `tester/oohdash-119.tester.spec.js` | TF-07, TF-12, TF-15, TF-16 updated | ✓ all pass |

## Regressions

Full suite covers all flows predating OOHDASH-146. No existing tests removed. Control, connectivity, heating, DHW override, kitchen, boiler, aircon, lighting, fridge, tonight-callback, scope, killswitch, area-model, legacy-salus, and tester suites all pass.

## CI governance change (included in this release)

The Playwright e2e job has been removed from GitHub Actions CI (PR #193). The harness test gate is now the authoritative e2e check. GitHub CI carries unit tests only (the WRITES_DISABLED interlock, 44s). Branch protection updated to require only `unit tests`.
