<!-- gate:contract
SECTION Decisions first: The OOHDASH-108 fix is validated to the limit of what can be checked headlessly on this machine. The unit suite is green and a direct integration probe through the real service chain passes every case, including all regression anchors. One decision: approve the test phase so the fix is marked validated and ready for deploy at James's discretion. Two items are flagged for James below — a pre-existing broken browser-test environment, and the follow-up spike agreed at the design gate — neither blocks this fix.
SECTION What was tested: The classifier and area-derivation change for old-convention bare-salus thermostats, at three levels — the unit suite (pure functions and registry parity), a direct integration probe through the real mapTbDevice → classifyDevice → deriveArea chain (the full server path, including the raw-name threading the parenthetical fallback needs), and an app-boot smoke check.
SECTION Unit results: npm run test:unit is green — 300 pass, 0 fail, 1 pre-existing unrelated skip (301 total). The three OOHDASH-108 test files cover bare-salus classify (new salus type, not iT700), bare-salus area (r and b to Bar/Restaurant, s and f to Accommodation, parenthetical fallback, malformed to null), and registry parity (the salus type exposes the same setpoint and frost commands and 5 to 35 range as the existing Salus types).
SECTION Integration results: A direct probe through the real service chain passed 10 of 10 — bare-salus with CLIENT_SCOPE letter r or b resolves to Bar/Restaurant, f to Accommodation; the name-parenthetical fallback resolves r to Bar/Restaurant and f to Accommodation when CLIENT_SCOPE is absent; a malformed site code resolves to null (the area-not-identified fallback chip); a present CLIENT_SCOPE letter correctly wins over a differing parenthetical; and every regression anchor is unchanged — glued iT700 to Accommodation, glued iT500 letter-resolved, paired gateway to not-an-area. App-boot smoke check: the server starts clean in fixture mode and reports healthy.
SECTION The browser e2e suite — a PRE-EXISTING environmental failure, not an OOHDASH-108 regression: the Playwright suite fails on this machine, but it fails identically on the currently-LIVE v1.3.2 release commit (verified by running the same spec at that commit) — every test fails early at the confirm-site step, before any area assertion runs, because the device board never renders in the harness. The same whole-suite failure shows in CI for unrelated changes too, including a docs-only pull request and the v1.3.2 release push. So the browser suite is environmentally broken independent of this fix. It is flagged for James as a separate problem to fix, not a blocker here.
SECTION Remaining validation (needs a running app with handler login): the live handler re-test from the design — open a real bare-salus Restaurant site and confirm it reads under Bar/Restaurant; a Flats/Staff site still under Accommodation; a no-letter site under the area-not-identified chip. This cannot be done headlessly and is the one check left for a human against the deployed app after deploy.
SECTION Control safety re-confirmed: no control path was exercised or changed. The new salus type shares the exact Salus setpoint and frost contract and range; the registry-parity unit test asserts this. Deploy remains James's decision and must go via release.sh per the project invariants.
DECISION Approve the OOHDASH-108 test phase — unit suite green (300 pass), integration probe green (10 of 10 through the real service chain), regression anchors unchanged, e2e failure proven pre-existing — so the fix is marked validated and ready for deploy at James's discretion? | Approve — fix validated | Request changes
DETAIL Branch test/oohdash-108-salus-area off main at a7ae2ac (the merged build). Unit suite and integration probe run firsthand 2026-10-06. e2e pre-existing-failure confirmed by running tests/area-model.spec.js at both HEAD and the live release commit 91033d7 — identical early confirm-site failures at both. No ThingsBoard writes; no control path touched. The Orchestrator raises the governed gate.
-->

# Test — Old-convention Salus area mis-mapping fix (OOHDASH-108)

**Release:** OOH Triage Dashboard — R1 · **Stage:** Test · **Date:** 2026-10-06 · **Owner:** James Brown
**Ticket:** OOHDASH-108 (Bug, High). **Build (merged):** gate PR #63 → `main` @ `a7ae2ac`. **Design:** gate PR #62.
**Branch:** `test/oohdash-108-salus-area` off `main` @ `a7ae2ac`.

## Results summary

| Level | What | Result |
|---|---|---|
| Unit | `npm run test:unit` | 300 pass, 0 fail, 1 pre-existing unrelated skip |
| Integration | real `mapTbDevice → classifyDevice → deriveArea` chain | 10 of 10 pass |
| Smoke | app boot in fixture mode | healthy (v1.3.2, writes-enabled fixture) |
| Browser e2e | Playwright suite | pre-existing environmental failure (see below) — not an OOHDASH-108 regression |

## Integration probe detail (the full service path)

| Case | CLIENT_SCOPE site | Expected area | Result |
|---|---|---|---|
| bare-salus, letter r | `(5694-r-2)` | Bar/Restaurant | pass |
| bare-salus, letter b | `(1793-b-1)` | Bar/Restaurant | pass |
| bare-salus, letter f | `(5795-f-1)` | Accommodation | pass |
| bare-salus, no CLIENT_SCOPE, parenthetical r | name ends `(5197-r-1)` | Bar/Restaurant | pass |
| bare-salus, no CLIENT_SCOPE, parenthetical f | name ends `(1666-f-2)` | Accommodation | pass |
| bare-salus, malformed | `(?2?2-?-?)` | null (fallback chip) | pass |
| CLIENT_SCOPE wins over differing parenthetical | site r, name paren f | Bar/Restaurant | pass |
| glued iT700 (regression) | — | Accommodation | pass (unchanged) |
| glued iT500 (regression) | `(6261-r-1)` | Bar/Restaurant | pass (unchanged) |
| paired gateway (regression) | `(6218-r-1)` | null | pass (unchanged) |

This covers the one integration point the build added beyond the unit-tested pure functions: `mapTbDevice` threading the raw device name into `deriveArea` so the parenthetical fallback has an un-normalised name to parse.

## The browser e2e failure — pre-existing, evidenced

The Playwright suite fails on this machine, but the failure is not caused by this fix:
- Running `tests/area-model.spec.js` at the merged HEAD and at the **live v1.3.2 release commit** `91033d7` gives the **identical** 8 failures, all at the `confirmSite` step (device board never renders), before any area assertion executes.
- CI reports the same whole-suite failure for unrelated changes — a docs-only pull request (OOHDASH-101) and the v1.3.2 release push both show CI failure.
- The required `unit tests` check passes on the OOHDASH-108 PRs.

Conclusion: the browser harness is environmentally broken independent of OOHDASH-108. Flagged for a separate fix (see below); it does not gate this bug.

## Flagged for James (neither blocks this fix)

1. **Broken browser-test environment** — the Playwright suite does not pass locally or in CI even on the live release. Worth a dedicated ticket so the e2e safety net is restored.
2. **Follow-up spike (design DECISION 2)** — a read-only sweep of the 466 glued-iT700 units against their CLIENT_SCOPE site letters, to validate the "iT700 maps 100% to Accommodation" rule that this build deliberately left unchanged.

## Remaining validation (human, against the deployed app)

The live handler re-test from the design §10.3 — handler login, open a real bare-salus Restaurant site (now Bar/Restaurant), a Flats/Staff site (still Accommodation), and a no-letter site (area-not-identified chip). This needs a running app with handler login and is the one check left after deploy.

---

*Branch `test/oohdash-108-salus-area` off `main` @ `a7ae2ac`. Unit suite and integration probe run firsthand 2026-10-06; e2e pre-existing-failure confirmed at both HEAD and the live release commit. No ThingsBoard writes; no control path touched. Deploy is James's decision via release.sh. This artefact changed no application source and raised no gate itself — the Orchestrator governs those.*
