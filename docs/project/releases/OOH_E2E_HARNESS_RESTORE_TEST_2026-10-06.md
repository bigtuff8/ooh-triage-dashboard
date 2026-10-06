<!-- gate:contract
SECTION Decisions first: The broken Playwright e2e suite is fixed and green — 49 of 49 pass on two consecutive clean runs. Every failure was stale test-harness code chasing product that was deliberately changed on earlier tickets; no application source, no fixture contract, and no control path was touched. One decision: approve the test phase so the fix is validated, then e2e becomes a required CI check so the safety net cannot rot again unseen. This was raised as a SPIKE (bug, proof, fix, what-we-still-need), not a discovery ceremony.
SECTION The bug: npm test ran zero green specs. 30 of 49 specs died at the shared confirmSite helper, which waited for a device-board test id that OOHDASH-89/91 deliberately removed (device state is now triage-question-led, surfaced as a Q&A outcome, never a standing board). Two more specs asserted a pre-OOHDASH-72 P1 copy claiming a text message was sent, when log mode honestly shows it was not. One more asserted the gateway-offline branch against a site that OOHDASH-91 G2 correctly reclassified as direct-connection. All three are stale harness, not product defects.
SECTION Proof it is harness rot not a regression: the device-board removal is documented in the product source itself (views.js, the removed Live device status card) and the dead test id exists only in tests and docs, never in public source. The honest P1 copy is blessed by the green, required unit suite (the OOHDASH-72 Test 11c honesty cases). The direct-connection reclassification is the unit-tested OOHDASH-91 G2 anchor rule (a site hub must be an lwgateway-named device; a generic GW device is not one). Each failure matched shipped, signed-off product.
SECTION The fix (harness only): re-anchor confirmSite on the current workspace element (category-tiles), which alone unblocked 30 specs; move the two device-reading and two P1-copy assertions onto the new triage-flow vehicle and the honest log-mode wording; and repoint the connectivity spec at the purpose-built lwgateway-offline fixture (site 6771), which also activates G2 coverage that had been authored but never exercised. Five test files and one comment tidy; plus ci.yml promoting e2e to a required check.
SECTION Results: the full suite is green — 49 pass, 0 fail — on two consecutive clean serial runs. The required unit suite remains green and untouched. The server log confirms log mode is active during the run, which is exactly the condition the corrected P1 assertions now expect. No ThingsBoard writes, no control path exercised beyond the existing kill-switch and dispatch specs that already run in fixture mode.
SECTION Making the net durable: ci.yml promotes the e2e job from not-yet-required to a required check, with the stale 2026-09-24 comment refreshed to record why it had rotted. Branch protection will be flipped to require the e2e check only after the e2e job is confirmed green in CI on this PR, so an unverified check never blocks merges. That ordering was agreed with James.
SECTION What we still need: nothing blocks this fix. One follow-up worth a note — the G2 connectivity fixtures for the reachable, group-offline, and gateway-less branches (sites 6770, 6772, 6773, 5198) are defined but still have no spec exercising them; this fix brings the hub-offline branch (6771) under coverage and leaves the other three branches as a small, separate test-coverage follow-up.
DECISION Approve the OOHDASH-109 test phase — the e2e suite is restored to 49 of 49 green, every failure proven to be stale harness against deliberately-changed product (no source, fixture, or control change), and e2e is promoted to a required CI check? | Approve — e2e restored and gating | Request changes
DETAIL Branch fix/oohdash-109-e2e-harness off main at the v1.3.3 release commit 1f11cfc. Suite run firsthand 2026-10-06, green twice consecutively. Changes are confined to tests and the CI workflow; no application source, no fixture data, no control path. Branch protection for the e2e check is deferred until CI proves it green on this PR. The Orchestrator raises the governed gate.
-->

# Test — Restore the Playwright e2e browser suite (OOHDASH-109)

**Release:** OOH Triage Dashboard — R1 · **Stage:** Test · **Date:** 2026-10-06 · **Owner:** James Brown
**Ticket:** OOHDASH-109 (Bug, High), related to OOHDASH-108. **Branch:** `fix/oohdash-109-e2e-harness` off `main` @ `1f11cfc` (v1.3.3, live).

This is a SPIKE: **bug → proof → fix → what-we-still-need**. It is a test-harness fix only — no application source, no fixture contract, no control path was changed.

## Bug — the suite ran zero green

| Symptom | Count | Where it died |
|---|---|---|
| Specs failing at `confirmSite` | 30 | waiting for the removed `device-board` test id |
| Specs asserting old P1 "text message sent" copy | 2 | log mode honestly says it was *not* sent |
| Spec asserting gateway-offline on a direct-connection site | 1 | 6750 is now a no-hub site |
| Cascade (admin metrics starved by the above) | included | nothing upstream produced outcomes |
| **Baseline** | **30 failed / 17 passed / 2 skipped** | — |

## Proof — stale harness, not a regression

Each failure chases product that an earlier, signed-off ticket deliberately changed:

| Failure | Deliberate change | Evidence it is intended |
|---|---|---|
| `device-board` never renders | OOHDASH-89/91 removed the standing device board | Documented in `views.js`; the test id survives only in `tests/` and docs, never in `public/` source |
| P1 "a text message has been sent" | OOHDASH-72 honesty fix | The green, **required** unit suite asserts log mode ⇒ `dispatchOk` false ⇒ "Text not sent" |
| 6750 "gateway at this site is offline" | OOHDASH-91 G2 anchor rule | Unit-tested rule: a site hub is an `lwgateway`-named device; a generic `GW-` device is not |

## Fix — harness only

| File | Change |
|---|---|
| `tests/helpers.js` | `confirmSite` re-anchored on `category-tiles` (unblocks 30 specs) |
| `tests/resolution.spec.js` | workspace-present assertions moved off `device-board` onto `category-tiles` / `scope-list` |
| `tests/killswitch.spec.js` | reads-continue proof moved onto the triage-flow `.zoneread` (still asserts `17.5°C`) |
| `tests/control.spec.js` | P1 assertion updated to the honest log-mode copy |
| `tests/tonight-callback.spec.js` | P1 copy updated; connectivity spec repointed 6750 → 6771 (lwgateway-offline fixture) |
| `tests/area-model.spec.js` | two stale `device-board` comments tidied (no logic change) |
| `.github/workflows/ci.yml` | e2e promoted to a required check; stale comment refreshed |

## Results

| Run | Outcome |
|---|---|
| Baseline (before fix) | 30 failed, 17 passed, 2 skipped |
| After fix — run 1 | **49 passed, 0 failed** |
| After fix — run 2 (determinism) | **49 passed, 0 failed** |
| Required `unit tests` | green, untouched |

The server log shows `[SMS:log] Would send to (no on-duty number configured)` during the run — confirming log mode is active, exactly the condition the corrected P1 assertions expect.

## What we still need

Nothing blocks this fix. One small follow-up: the OOHDASH-91 G2 connectivity fixtures for the **reachable**, **group-offline**, and **gateway-less** branches (sites 6770, 6772, 6773, 5198) are defined but still have no spec. This fix brings the **hub-offline** branch (6771) under coverage; the other three branches are a separate, minor test-coverage follow-up.

---

*Branch `fix/oohdash-109-e2e-harness` off `main` @ `1f11cfc`. Suite run firsthand 2026-10-06, green on two consecutive clean serial runs. No ThingsBoard writes; no application source, fixture data, or control path changed. Branch protection for the e2e check is deferred until CI proves it green on this PR. This artefact changed no application source and raised no gate itself — the Orchestrator governs those.*
