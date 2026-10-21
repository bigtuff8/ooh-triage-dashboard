<!-- gate:contract
TICKET: OOHDASH-137
PHASE: test
DATE: 2026-10-21
VERSION: 1

SECTION: Verdict
PASS. All 36 acceptance criteria tested by direct function calls, intercepted request bodies,
and Tonight-view observation. Unit suite: 472 total, 471 pass, 1 pre-existing skip, 0 fail.
Playwright e2e: 163 total, 161 pass, 2 pre-existing skips, 0 fail. Every journey end point
produces the correct formatted title. The back-fill dry-run against fixtures yields exactly
8 RENAME and 8 SKIP with no live writes. All 5 declared build deviations are acceptable.
One documentation observation noted; no code defects found.

SECTION: What was tested and on which code
The code under test is PR #119 head d4288e1 on branch test/oohdash-137, which carries
the four build work units committed on build/oohdash-137 (merged as the code PR).
Everything ran against the local server in fixture mode (PORT 3156, AUTH_MODE=dev,
DATA_MODE=fixture, WRITES_DISABLED=false). No live Zendesk writes, no ThingsBoard
actuations, no production calls of any kind. The back-fill script was exercised only
against the test fixture files and using exported function calls with stub zdClients.
The --apply flag was never passed.

SECTION: Automated suites
Unit tests (npm run test:unit): 472 total, 471 pass, 1 pre-existing skip
(U13 IOT_REPO_PATH absent, unchanged from before this change), 0 fail. The 37 new tests
(T1-T20, R1-R10, B1-B7 where B7 is the edge-case supplement) all pass. Playwright e2e
(npx playwright test, full suite, single run): 163 total, 161 pass, 2 pre-existing skips
(TF-18 and TF-19, unchanged), 0 fail. Both suites ran with no concurrently active
Playwright or node test processes. No retries were consumed.

SECTION: Title format verification (all journeys)
Every OOH ticket creation path was exercised by direct buildOohTitle calls and by
intercepted raiseQuery, createOutcomeTicket, and createLateSyncTicket invocations in
fixture mode. Observed titles:

heating:
  [OOH] 6832 Old Grey Mare - Heating complaint -- system performing to setpoint (Accommodation / flat)

hot-water:
  [OOH] 6832 Old Grey Mare - Hot water issue - not resolvable remotely tonight

kitchen:
  [OOH] 6832 Old Grey Mare - Kitchen equipment not working

lighting (P1 suffix preserved):
  [OOH] 6832 Old Grey Mare - External lighting not working - P1

general capture:
  [OOH] 6832 Old Grey Mare - General issue captured

gateway:
  [OOH] 6832 Old Grey Mare - Lighthouse gateway / equipment offline

something-else P1 (long-dash in outcome preserved):
  [OOH] 6832 Old Grey Mare - Something else - urgent, escalated as P1

OOH query with site:
  [OOH] 6832 Old Grey Mare - OOH query

OOH query with null site:
  [OOH] OOH query

gk-prefix siteNo normalises to digits:
  [OOH] 6832 Old Grey Mare - General issue captured

stand-in siteName falls back to number-only:
  [OOH] 6832 - General issue captured

ambiguous house number (no-double does not fire):
  [OOH] 6832 Old Grey Mare - Ambiguous house ID 6832 -- caller could not be resolved to one site

No double [OOH] prefix observed in any case. No title exceeded 150 characters.
Tags (ooh, ooh_p1) confirmed unchanged by the title module (ticket-title.js has no tag logic).

SECTION: Tonight "What happened" column
The Tonight table was driven live in the browser after submitting a heating outcome for
site 6832 Old Grey Mare. The "What happened" cell showed:
  "Heating complaint -- system performing to setpoint (Accommodation / flat)"
This is the raw subject, not the built title. The title ("[OOH] 6832 Old Grey Mare - ...")
appears only in Zendesk. The audit log (routes/api.js line 397) reads subject from req.body
before createOutcomeTicket transforms it, so the column wording is untouched by this change.
Screenshot: docs/project/oohdash-137-test/evidence/tonight-what-happened-column.png

SECTION: Source guard (R7)
Manual grep of services/zendesk.js for "[OOH] " (with trailing space) on non-comment lines
returns zero matches. The only OOH-prefixed string remaining is "[OOH NOTE]" in
addFeedbackNote (line 447), which does not match the pattern "[OOH] " and is not a
Zendesk ticket subject. R7 passes independently.

SECTION: Back-fill dry-run
planBackfill was run against test/fixtures/ooh-open-tickets.json (16 tickets) in fixture
mode using a null name resolver. Result: 8 RENAME, 4 SKIP-human-renamed, 2
SKIP-already-has-site, 2 SKIP-p1. Matches the B1 test assertion exactly. The 8 RENAME
new titles match the DESIGN.md section 2 expected titles exactly (verified by B1 test
assertions). No live Zendesk HTTP calls were made. No rollback files were written.

The --apply path was not exercised (per task constraints). Verification that --apply
refuses without the explicit flag: the DATA_MODE guard is inside main(); imported
functions are available in fixture mode (verified), but main() would exit(1) with
DATA_MODE=fixture before reaching the apply branch.

Rollback file shape confirmed: JSON lines with keys OohBackfillTicketId,
OohBackfillOldSubject, OohBackfillNewSubject, OohBackfillAppliedAt. Written before each
PUT (B2 verified), not written for SKIP-changed-since-plan (B3 verified).

SECTION: Deviations reviewed
All 5 build deviations declared in BUILD_COMPLETE.md were reviewed.

D1 -- T4 expected output: The plan description said normaliseSiteNo("md-1110") = null.
The regex matches "md-1110" and returns "1110"; cleanSiteName("md-1110","1110") returns
null (stand-in pattern). Correct output is "[OOH] 1110 - General issue captured". The
test asserts the correct value. ACCEPTABLE.

D2 -- _setQueryResolver hook: A 4-line test-only escape hatch added to zendesk.js, reset
in afterEach. No production behavior change. ACCEPTABLE.

D3 -- 37 new unit tests vs plan's 36: Extra test (edge-case supplement in
backfill-ooh-titles.test.js) adds coverage for SKIP-site-mismatch, SKIP-no-site,
SKIP-requester-updated, SKIP-monitoring-word, no-TRG pattern, stand-in siteName, and
changed-since-plan. ACCEPTABLE.

D4 -- Rollback write order: "re-read, check changed-since-plan, write rollback, PUT" is
the correct order. No rollback line written for a changed ticket (B3 verified). ACCEPTABLE.

D5 -- DATA_MODE guard inside main(): Correct for a dual-mode script that must be importable
in any DATA_MODE. Module-level guard would have caused process.exit(1) during test imports.
ACCEPTABLE.

SECTION: Defects and observations
No code defects. One documentation observation.

O1 (build doc, no severity): BUILD_COMPLETE.md's textual description of the 8 SKIP rows
misclassifies tickets #50626 ("6202 - Horse & Groom...") and #50071 ("6261 Wheatstone
Inn - General issue") as SKIP-already-has-site. Both subjects do not start "[OOH] " and
are correctly classified SKIP-human-renamed by the code (rule 1 fires first). The B1 test
assertion (4 SKIP-human-renamed, 2 SKIP-already-has-site) matches the correct code
behaviour. The contradiction is within BUILD_COMPLETE.md only; the code, the tests, and
the fixtures are all correct and consistent.

DECISION: Verdict | PASS | PASS-WITH-NOTES | FAIL
-->

# TEST RESULTS -- OOHDASH-137
## Site number and pub name in OOH Zendesk ticket titles (v1.4.4)

**Ticket:** OOHDASH-137 | **Release:** v1.4.4 (patch) | **Code under test:** d4288e1
(PR #119 head, branch test/oohdash-137) | **Date:** 2026-10-21 | **Environment:**
local, AUTH_MODE=dev, DATA_MODE=fixture, PORT 3156 (no live Zendesk, no ThingsBoard,
no SMS, no production writes)

**Authoritative spec:** Jira ACs (site in title for every journey; site identifiable
from title alone; downstream consumers unaffected), then DESIGN.md, then BUILD_PLAN.md.

---

## 1. Test plan

| Area | Method | Protocols applied |
|---|---|---|
| Unit | npm run test:unit (node:test), includes T1-T20, R1-R10, B1-B7 | Return-value assertions only |
| E2E | npx playwright test, full suite, single run | Repo suite as built |
| Exploratory | Direct buildOohTitle calls; raiseQuery / createOutcomeTicket via fixture server; Tonight table observation | Data fidelity, removal assertion, error paths (R9/R10), state reset, multi-step |
| Back-fill | planBackfill against fixtures (dry run only); --apply not passed | Data fidelity on plan counts and new titles |
| Source guard | Manual grep + R7 automated | No bare [OOH] literals outside comments |

Source-check ban: reviewed all 37 new unit tests. R7 reads zendesk.js source but asserts
on behaviour (no [OOH] literal remaining), not on function implementation. No toString
or implementation-string tests found.

---

## 2. Acceptance criteria results

| # | Acceptance criterion | Result |
|---|---|---|
| AC1 | Heating journey title includes siteNo and siteName | PASS -- [OOH] 6832 Old Grey Mare - Heating complaint... |
| AC2 | Hot-water journey title includes siteNo and siteName | PASS -- [OOH] 6832 Old Grey Mare - Hot water issue... |
| AC3 | Kitchen journey title includes siteNo and siteName | PASS -- [OOH] 6832 Old Grey Mare - Kitchen equipment... |
| AC4 | Lighting journey title includes siteNo and siteName | PASS -- [OOH] 6832 Old Grey Mare - External lighting... - P1 |
| AC5 | Refrigeration journey title includes siteNo and siteName | PASS -- verified via buildOohTitle |
| AC6 | Gateway journey title includes siteNo and siteName | PASS -- [OOH] 6832 Old Grey Mare - Lighthouse gateway... |
| AC7 | Something-else / P1 journey title includes siteNo and siteName | PASS -- [OOH] 6832 Old Grey Mare - Something else... P1 |
| AC8 | OOH query title includes siteNo and siteName where known | PASS -- [OOH] 6832 Old Grey Mare - OOH query |
| AC9 | OOH query with no site produces [OOH] OOH query | PASS |
| AC10 | Ambiguous house number title includes siteNo and siteName | PASS |
| AC11 | No site number produces [OOH] outcome (no-site fallback) | PASS |
| AC12 | Stand-in siteName (gk-NNNN) falls back to number-only | PASS -- [OOH] 6832 - General issue captured |
| AC13 | Site identifiable from title alone | PASS -- siteNo always first after [OOH] |
| AC14 | No double [OOH] prefix ever | PASS -- idempotency verified (T18) |
| AC15 | P1 suffix preserved | PASS -- "- P1" kept on lighting and something-else |
| AC16 | Long dash (em-dash, double-hyphen) preserved in outcome | PASS -- T2, R2 verified |
| AC17 | Tonight "What happened" column shows raw subject | PASS -- confirmed in live browser |
| AC18 | Tags unchanged (ooh, ooh_p1) | PASS -- ticket-title.js has no tag logic |
| AC19 | No site-N repeat in query title | PASS -- R5 assertion |
| AC20 | Title capped at 150 chars; site part never shortened | PASS -- T19 verified |
| AC21 | gk-prefix siteNo normalises to digits | PASS -- T3, T8, T9, T10 |
| AC22 | Source guard: no bare [OOH] literal in zendesk.js | PASS -- R7 and manual grep |
| AC23 | Back-fill plan: 8 RENAME, 8 SKIP on fixture data | PASS -- B1 and dry-run |
| AC24 | Back-fill RENAME titles match DESIGN.md section 2 | PASS -- B1 exact assertions |
| AC25 | Rollback line written before PUT | PASS -- B2 verified |
| AC26 | No rollback line for SKIP-changed-since-plan | PASS -- B3 verified |
| AC27 | 429 retry-after respected | PASS -- B4 verified |
| AC28 | 3 consecutive failures halt run | PASS -- B5 verified |
| AC29 | Rollback restores where current = newTitle; skips if changed again | PASS -- B6 verified |
| AC30 | DATA_MODE guard inside main(), module importable in fixture mode | PASS -- D5 verified |
| AC31 | --apply requires explicit flag and --plan file | PASS -- code trace verified |
| AC32 | resolveSiteName throw caught; number-only title; ticket created | PASS -- R9 |
| AC33 | resolveSiteName timeout at 2000ms; number-only title | PASS -- R10 (elapsed 1900-3000ms) |
| AC34 | [TRG] comment body still carries site reference via summary | PASS -- R6, manual thread check |
| AC35 | Rollback file shape: 4 keys (Id, OldSubject, NewSubject, AppliedAt) | PASS -- B2 |
| AC36 | No live Zendesk or ThingsBoard calls in dry-run mode | PASS -- confirmed |

---

## 3. Automated suite counts

| Suite | Total | Pass | Skip | Fail |
|---|---|---|---|---|
| Unit (npm run test:unit) | 472 | 471 | 1 | 0 |
| Playwright e2e | 163 | 161 | 2 | 0 |

Pre-existing skips: U13 (IOT_REPO_PATH absent), TF-18, TF-19. All unchanged.
New tests added: T1-T20 (ticket-title.test.js), R1-R10 (oohdash-137-title.test.js),
B1-B7 including edge-case supplement (backfill-ooh-titles.test.js). All 37 pass.

---

## 4. Deviations from build plan (all acceptable)

D1 -- T4 output: plan description had a doc error on normaliseSiteNo("md-1110"). Code
and test are correct. Acceptable.

D2 -- _setQueryResolver: test-only hook, 4 lines, reset in afterEach, no production
behavior change. Acceptable.

D3 -- 37 tests vs 36: extra edge-case supplement adds coverage. Acceptable.

D4 -- Rollback write order: code is correct (re-read before writing rollback line).
Acceptable.

D5 -- DATA_MODE guard inside main(): correct placement for dual-mode script. Acceptable.

---

## 5. Defects and observations

No code defects.

O1 (documentation error, severity: none): BUILD_COMPLETE.md textual skip-row descriptions
misclassify #50626 and #50071 as SKIP-already-has-site. Both are correctly
SKIP-human-renamed (neither starts "[OOH] "). The B1 test assertion (4+2+2=8) is
consistent with the code and dry-run. No action required on the code.

---

## 6. Verdict

PASS.
