<!-- gate:contract
TICKET: OOHDASH-137
PHASE: build-plan
DATE: 2026-10-21

SECTION: What will be built
OOHDASH-137, patch release v1.4.4. Every Zendesk ticket the OOH dashboard creates will include the site number and pub name at the start of its subject, so Sam's team can see which site a ticket belongs to in the Zendesk list and merge picker without opening it. A title that today reads "[OOH] General issue captured" will read "[OOH] 6186 George Inn (Bathampton) - General issue captured". The town stays in brackets (D1). P1 tickets are left out of the one-off back-fill (D2). Release is a patch, v1.4.4 (D3). There is no screen change and no browser code change. The work is entirely server-side: one new pure module, two small edits in zendesk.js, one back-fill script, three new test files and one fixture file.

SECTION: James's approved changes to the design
Q1 (discovery) decided: site number and name first, format "[OOH] 6261 Wheatstone Inn - outcome". Q2 (discovery) decided: no area in the title. Q3 (discovery) decided: back-fill of existing open OOH tickets is in scope. D1 decided: keep the town in brackets, e.g. "6261 Wheatstone Inn (Gloucester)". D2 decided: leave the 2 open P1 tickets out of the back-fill. D3 decided: patch release v1.4.4. These decisions replace the corresponding open questions in the discovery and design gate documents and are the authoritative inputs for Build.

SECTION: Work units and order
Five work units, built in order. WU1 creates the new pure title module and its 19-case unit test. WU2 wires createOutcomeTicket to use the title module and adds the route-level and source-guard tests. WU3 updates raiseQuery to pass siteName and simplify its subject, covered by the same test file. WU4 creates the back-fill script, its fixture and its 6-test suite. WU5 cuts the v1.4.4 release and runs the back-fill dry run for James to approve before any apply. Each unit is self-verified before the next begins.

SECTION: Tests mapped to acceptance criteria
19 helper unit tests (T1-T19, test/ticket-title.test.js) cover every rule in the title module. 8 route-and-source tests (R1-R8, test/oohdash-137-title.test.js) cover all five creation routes, the raiseQuery simplification, the source guard (no bare "[OOH]" left in zendesk.js), and the Tonight audit wording unchanged. 6 back-fill tests (B1-B6, test/backfill-ooh-titles.test.js) cover the 16-ticket fixture with the expected 8 renames and 8 skips, plus edge cases. The full Playwright suite is unchanged and must pass.

SECTION: Verification approach
Unit tests: npm run test:unit (or node --test test/ticket-title.test.js test/oohdash-137-title.test.js test/backfill-ooh-titles.test.js). Playwright: npx playwright test (single sequential run, no concurrent Playwright on this host). Self-audit before handoff: no "[OOH] " string left in zendesk.js except in the source guard test, backfill-*.json added to .gitignore, no secrets in committed files.

SECTION: Rollback and release
Code rollback: redeploy v1.4.3. No data or configuration to undo. Back-fill rollback: run the script with --rollback plus the rollback file it produced. Release is npm run release (patch bump) after all tests pass. Back-fill apply runs only on James's explicit go after he has seen the dry-run output.

SECTION: Open questions (non-blocking)
Q1-Design (Spencer): the IoT Support Dashboard re-checks open P1 tickets on every ticket update and can send the alert again if there is no confirmed alert record. Does Spencer intend that behaviour? STATUS: UNRESOLVED. Not blocking - P1 tickets are already excluded from the back-fill (D2).
Q2-Design (anyone): Is 150 characters the right safety cap for a Zendesk ticket title? STATUS: DEDUCED. Zendesk does not publish a hard limit; the cap is defensive and no real title comes near it.

DECISION: Pub name in the title (D1) | Keep the town in brackets | Drop the town
DECISION: P1 tickets in the back-fill (D2) | Leave open P1 tickets out | Rename them
DECISION: Release number (D3) | Patch release v1.4.4 | Minor release v1.5.0
-->

# BUILD PLAN -- OOHDASH-137
## Site number and pub name in OOH Zendesk ticket titles

**Ticket:** OOHDASH-137 | **Release:** v1.4.4 (patch) | **Base:** origin/main 2791351 (v1.4.3) | **Design:** docs/project/oohdash-137-design/DESIGN.md (gate PR #117, merged) | **Standards:** house idioms of this repo (plain JS ES modules, node:test, Playwright); no separate standards file. Universal rules apply: no secrets or environment values added; errors handled by the existing shared error path.

---

## 1. James's binding decisions (supersede design wherever they differ)

- D1: Keep the town in brackets in the pub name. A title reads "6261 Wheatstone Inn (Gloucester) - ..." not "6261 Wheatstone Inn - ...". Dashboard screens keep the full name regardless.
- D2: Leave open P1 tickets (those tagged ooh_p1) out of the back-fill. Two such tickets exist today. They will close normally with their current generic titles.
- D3: Patch release v1.4.4.
- Q1 (discovery, Sam): Site number and name first. Format: "[OOH] 6261 Wheatstone Inn (Gloucester) - General issue captured". Fallback when no trusted pub name: "[OOH] 6261 - General issue captured". Fallback when no site at all: "[OOH] OOH query".
- Q2 (discovery, Sam): No area in the title. Area already appears inside the outcome wording for heating flows.
- Q3 (discovery, Sam): Back-fill of existing open OOH tickets is in scope.

---

## 2. Scope summary

Three source files change. One new module is created. One script is created. Three test files and one fixture are added.

| File | Change |
|---|---|
| services/ticket-title.js | New. Pure module. Exports buildOohTitle, normaliseSiteNo, cleanSiteName. No imports. |
| services/zendesk.js | Two edits: createOutcomeTicket line 350 and raiseQuery line 610-622. |
| scripts/backfill-ooh-titles.mjs | New. One-off back-fill script. Never committed secrets. |
| test/ticket-title.test.js | New. 19 unit cases for the title module. |
| test/oohdash-137-title.test.js | New. 8 route-level and source-guard cases. |
| test/backfill-ooh-titles.test.js | New. 6 back-fill planning and apply cases. |
| test/fixtures/backfill-open-ooh.json | New. 16 tickets shaped like the live read. |
| .gitignore | One line: backfill-*.json |

No browser code changes. No routes/api.js changes. No flows.js changes. No Playwright spec changes.

---

## 3. Work units

### WU1 -- New title module (services/ticket-title.js) and its unit tests

**Approach:** Create a new file services/ticket-title.js that exports three functions. It has no imports and never throws. Build the file, run the 19 unit cases, verify all pass before moving to WU2.

**services/ticket-title.js rules (from DESIGN.md section 3.1, D1 applied):**

The module applies rules in this exact order. Text clean is applied to every input: coerce to string, replace control characters (code points 0-31 and 127) with a space, collapse runs of spaces to one space, trim.

normaliseSiteNo(raw):
- Cleaned value matches /^(?:[A-Za-z]{1,5}[-_ ]?)?(\d{3,6})$/ -> return the captured digits as a string.
- Empty or equal to "unknown" (case-insensitive) -> return null.
- Anything else -> return { freeText: cleaned text cut to 40 characters }. Only the raiseQuery route can produce this.

cleanSiteName(name, siteNo):
- Apply text clean.
- Treat as missing (return null) if: empty; equal to "unknown"; equal to the siteNo digits; matches /^[A-Za-z]{1,5}[-_]\d{3,6}$/ (the stand-in pattern, e.g. "gk-6261", "md-1110").
- Remove a leading occurrence of siteNo digits followed by zero or more spaces and an optional hyphen and spaces. If the result is now empty, treat as missing.
- Cut to 60 characters (if longer, cut to 57 and append "...").
- D1 is applied here: the town is kept. (If D1 were "drop", a trailing " (...)" group would be removed here. Since D1 = keep, no removal.)
- Return the cleaned name or null.

buildOohTitle({ siteNo, siteName, outcome }):
1. normalisedNo = normaliseSiteNo(siteNo).
2. cleanedName = (normalisedNo and typeof normalisedNo === 'string') ? cleanSiteName(siteName, normalisedNo) : null.
3. Clean the outcome string. Remove one leading "[OOH]" prefix (with any following spaces) so the function is safe to call twice. Empty outcome becomes "OOH outcome".
4. Site part: if normalisedNo is a string (digits), site part = normalisedNo + (cleanedName ? ' ' + cleanedName : ''). If normalisedNo is { freeText }, site part = freeText. If normalisedNo is null, site part = ''.
5. No-double check: if site part is not empty and outcome starts with the site digits followed by a non-digit or end of string, drop the site part. Only check the start of outcome.
6. Join: '[OOH] ' + (sitePart ? sitePart + ' - ' : '') + outcome. Separator is ASCII " - " (space hyphen space).
7. Cap: if the result is longer than 150 characters, shorten outcome so that the total is exactly 150, ending in "...". Never shorten the site part or the "[OOH] " prefix.
8. Return the string.

**test/ticket-title.test.js (19 cases, T1-T19 in DESIGN.md section 5):**

| Id | Input | Expected |
|---|---|---|
| T1 | siteNo "6261", siteName "Wheatstone Inn (Gloucester)", outcome "General issue captured" | [OOH] 6261 Wheatstone Inn (Gloucester) - General issue captured |
| T2 | siteNo "6261", siteName null, outcome "General issue captured" | [OOH] 6261 - General issue captured |
| T3 | siteNo "gk-6261", siteName "Wheatstone Inn (Gloucester)", outcome "General issue captured" | [OOH] 6261 Wheatstone Inn (Gloucester) - General issue captured |
| T4 | siteNo "md-1110", siteName "md-1110" (stand-in = missing), outcome "OOH query" | [OOH] OOH query (stand-in rejected, no site No recognised) |
| T5 | siteNo "6261", siteName "6261" (equals number, missing), outcome "..." | [OOH] 6261 - ... |
| T6 | siteNo "6261", siteName "6261 Wheatstone Inn" (starts with number), outcome "..." | cleanSiteName strips "6261", result is "Wheatstone Inn"; [OOH] 6261 Wheatstone Inn - ... |
| T7 | siteName with embedded line breaks and double spaces | cleaned to single spaces |
| T8 | siteNo "gk_7639" | normalised to "7639" |
| T9 | siteNo "GK-7639" | normalised to "7639" |
| T10 | siteNo " 7639 " | normalised to "7639" |
| T11 | siteNo null, siteName "Wheatstone Inn" | site part empty; [OOH] ... (siteName unused without siteNo) |
| T12 | siteNo "", siteName "Wheatstone Inn" | same as T11 |
| T13 | siteNo "unknown" | null; same as T11 |
| T14 | siteNo null, siteName null, outcome "OOH query" | [OOH] OOH query |
| T15 | siteNo "6261", siteName null, outcome "6202 - Horse and Groom - something" (outcome starts with a DIFFERENT number) | site part not dropped (different digits); [OOH] 6261 - 6202 - Horse and Groom - something |
| T16 | siteNo "6261", siteName null, outcome starting "6261" | no-double: site part dropped; [OOH] 6261... |
| T17 | siteNo "6261", siteName null, outcome contains "E6261" mid-string (not at start) | site part NOT dropped; [OOH] 6261 - ...E6261... |
| T18 | siteNo "6261", siteName null, outcome already starting "[OOH] " | [OOH] prefix stripped before joining; result has exactly one [OOH] |
| T19 | 300-character outcome, siteNo "6261", siteName "Wheatstone Inn (Gloucester)" | result is exactly 150 chars ending "..."; site part and "[OOH] " untouched |

Additional cases within the 19 that the design lists and that map to multiple assertions: a 90-character siteName is cut to 60 (57 + "..."); empty wording becomes "OOH outcome"; long dashes in outcome are kept unchanged; "Ambiguous (Black Bull / Red Lion)" kept; calling buildOohTitle on its own output gives the same string (idempotent).

Self-verify: npm run test:unit passes for ticket-title.test.js.

---

### WU2 -- createOutcomeTicket wiring (services/zendesk.js line 350)

**Approach:** Add one import at the top of zendesk.js, replace the subject line, add title to the return value in both live and test modes. This is the single change point for all five ticket-creation routes.

**Exact edit, createOutcomeTicket:**

At the top of zendesk.js add:
  import { buildOohTitle } from './ticket-title.js';

Inside createOutcomeTicket, before the live/test branch, add:
  const title = buildOohTitle({ siteNo, siteName, outcome: subject });

In the test-mode return (currently returns { id, url }), add the title field:
  return { id: t.id, url: ..., title };

In the live-mode payload, replace:
  subject: `[OOH] ${subject}`
with:
  subject: title

In the live-mode return (currently returns { id, url }), add the title field:
  return { id: data.ticket.id, url: ..., title };

The fields summary, detail, callerWords, tags, priority, custom_fields and the [TRG] comment body are untouched.

The Tonight audit line (routes/api.js line 397, `detail: subject + ...`) reads the raw subject from the request body before createOutcomeTicket is called. It is not affected by this change.

**test/oohdash-137-title.test.js (R1-R8, route-level and source-guard, DESIGN.md section 5):**

R1: createOutcomeTicket in test mode for a flow outcome (siteNo "6261", siteName "Wheatstone Inn (Gloucester)", subject "External lighting not working - P1") returns { title: "[OOH] 6261 Wheatstone Inn (Gloucester) - External lighting not working - P1" }.

R2: createOutcomeTicket in test mode for a control outcome (siteNo "7639", siteName "Black Bull (Corbridge)", subject "Setpoint lower -- sent, awaiting device confirmation") returns { title: "[OOH] 7639 Black Bull (Corbridge) - Setpoint lower -- sent, awaiting device confirmation" }. The long dash in the outcome is unchanged.

R3: createLateSyncTicket in test mode with a null siteName (action.siteNo "7639", action.siteName null) returns { title: "[OOH] 7639 - Late device confirmation -- IT700TX-025804FB" }.

R4: createOutcomeTicket in test mode for the ambiguous-house-number path (route 5 in design: siteNo "6261", siteName "Ambiguous (Black Bull / Red Lion)", subject "Ambiguous house ID 6261 -- caller could not be resolved to one site") returns a title starting "[OOH] 6261 Ambiguous (Black Bull / Red Lion) - " followed by the outcome. The repeated number in the outcome stays; no-double check does not fire because the outcome starts "Ambiguous", not "6261".

R5: raiseQuery in test mode with siteNo "6832" and a looked-up siteName "Old Grey Mare" returns { title: "[OOH] 6832 Old Grey Mare - OOH query" } and the title contains no "site 6832" substring.

R6: raiseQuery in test mode with siteNo null returns { title: "[OOH] OOH query" }.

R7 (source guard): a grep of services/zendesk.js for the literal string '[OOH] ' finds zero occurrences in non-comment, non-test code (that is, the old subject assignment is gone and no bare "[OOH] " is added anywhere else). This test runs against the source file with fs.readFileSync and a regex, matching the pattern used in notes-coverage-guard.test.js.

R8: createOutcomeTicket in test mode for a capture outcome, checking routes/api.js line 397: the raw subject stored in the audit detail ("General issue captured") does not contain "6261" or "[OOH]". This is confirmed by the test calling createOutcomeTicket directly and verifying the returned title field versus the unchanged subject field in the test-mode fixture ticket.

Self-verify: npm run test:unit for oohdash-137-title.test.js all pass.

---

### WU3 -- raiseQuery cleanup (services/zendesk.js line 610-622)

**Approach:** Two changes to raiseQuery. Change the subject it passes to createOutcomeTicket from the verbose "OOH query -- site N" down to the plain "OOH query". Add a siteName lookup so the query ticket gets the same "[OOH] N Name - OOH query" shape as all other tickets.

**Exact edit, raiseQuery (from design section 3.3):**

Replace the opening of the function:

Old (current code, DESIGN.md section 1, zendesk.js lines 610-622):
  const subject = `OOH query${siteNo ? ` -- site ${siteNo}` : ''}`;
  return createOutcomeTicket({
      operator,
      siteNo: siteNo || 'unknown',
      subject,
      summary: subject,
      ...

New:
  const norm = normaliseSiteNo(siteNo);
  const digits = (norm && typeof norm === 'string') ? norm : null;
  const resolvedName = digits ? await resolveSiteName(digits) : null;
  const summary = `OOH query${siteNo ? ` -- site ${siteNo}` : ''}`;
  return createOutcomeTicket({
      operator,
      siteNo: siteNo || 'unknown',
      siteName: resolvedName,
      subject: 'OOH query',
      summary,
      ...

The summary variable carries the original verbose text and is used for the [TRG] first line only. The subject passed to createOutcomeTicket is now the plain "OOH query", so buildOohTitle builds "[OOH] 6832 Old Grey Mare - OOH query". Nothing in routes/api.js changes. normaliseSiteNo is imported from ticket-title.js (already imported by the WU2 edit). resolveSiteName is already defined in zendesk.js.

When the handler typed words rather than a number (norm is { freeText }), pass siteNo as the raw text (the existing siteNo variable, not the digits), so buildOohTitle rule 2 treats it as freeText and uses it in the site part.

R5 and R6 in test/oohdash-137-title.test.js (written in WU2) cover this. Also covered by R8 (the [TRG] first line stays as summary, not as the new short subject).

Self-verify: npm run test:unit all pass. Manual check: call raiseQuery through the test route and confirm the title field in the response.

---

### WU4 -- Back-fill script, fixture, and back-fill tests

**Approach:** Create the script, the fixture, and the tests. The script must refuse to run unless DATA_MODE=live. Tests use a stubbed Zendesk client and the fixture file. The apply mode is confirmed correct by tests only; it never runs in CI.

**scripts/backfill-ooh-titles.mjs:**

Entry point. Reads environment and config exactly as the app reads them (imports config.js). Exits with a clear message if DATA_MODE is not "live". Uses the Zendesk search API to fetch all tickets matching `type:ticket tags:ooh status<solved`, page by page. For each ticket, runs the planning function (below) to decide RENAME or a SKIP-* reason.

Dry-run mode (default, no flags): prints a table (id / action / old title / new title or skip reason) to stdout, writes backfill-plan-{timestamp}.json to the current working directory. No writes to Zendesk.

Apply mode (--apply --plan FILE): reads the plan file, processes only RENAME rows. For each: re-reads the ticket from Zendesk, skips if the current title differs from the planned old title (SKIP-changed-since-plan), writes the rollback line to backfill-rollback-{timestamp}.json before the PUT, sends PUT /tickets/{id}.json with { ticket: { subject: newTitle, safe_update: true } } (subject only; no comment, no tag change, no status change), waits 2 seconds between writes, on HTTP 429 reads Retry-After and waits, stops after 3 consecutive failures. Prints a summary.

Rollback mode (--rollback FILE): reads the rollback file, for each record re-reads the ticket, puts back the original title only if the current title equals the new title that was applied. Prints a summary.

Per-ticket planning function (returns one of: RENAME or SKIP-{reason}). Rules in order (first match wins):
1. SKIP-human-renamed: title does not start with "[OOH] ".
2. SKIP-already-has-site: after "[OOH] " the title starts with the site number derived from source 1.
3. SKIP-p1: ticket has the tag ooh_p1 (D2).
4. SKIP-requester-updated: ticket has tag updated_by_requester or updated_by_repairs_admin.
5. Derive siteNo: from Zendesk site field 11405878329244 (e.g. "gk_6186") via normaliseSiteNo. Cross-check: read the ticket's first comment for the "Site selected: NAME (SITENO)" line. If both exist and differ: SKIP-site-mismatch. If field empty and no [TRG] line: SKIP-no-site. Use whichever is available.
6. SKIP-monitoring-word: the new proposed title would contain the word "Monitoring".
7. Derive siteName: resolveSiteName(digits), or if null, the name from the [TRG] "Site selected" line passed through cleanSiteName. If still no name, use number-only title.
8. Build new title: buildOohTitle({ siteNo: digits, siteName, outcome: currentTitle.slice('[OOH] '.length) }).
9. RENAME: record { id, oldTitle: currentTitle, newTitle, siteNo: digits }.

Expected result on the 16 live open tickets as of 2026-10-21: 8 RENAME, 4 SKIP-human-renamed (50626, 50071, 49665, 50076), 2 SKIP-already-has-site (50069, 50030), 2 SKIP-p1 (50701, 50697).

**test/fixtures/backfill-open-ooh.json:**

An array of 16 ticket objects shaped like the Zendesk ticket response: id, subject, tags, the site custom field array, and a first_comment field with the [TRG] body. Tickets match the live read exactly for the 8 RENAME rows in DESIGN.md section 2. Four have human-renamed titles (no "[OOH] " prefix). Two already start with the site number. Two are tagged ooh_p1. Additional rows beyond 16 cover: a site-mismatch case, a no-site case, a requester-updated case, a Monitoring-word case, and a stand-in name case.

**test/backfill-ooh-titles.test.js (B1-B6):**

B1: the planning function run on the 16-ticket fixture produces exactly 8 RENAME rows with the titles shown in DESIGN.md section 2, 4 SKIP-human-renamed, 2 SKIP-already-has-site, and 2 SKIP-p1.

B2: with a stubbed Zendesk client, the apply function for a single RENAME row writes the rollback line before sending the PUT.

B3: with a stubbed client, a ticket whose current title differs from the planned old title (changed-since-plan) is SKIP-changed-since-plan and no PUT is sent.

B4: with a stubbed client, a single HTTP 429 response is waited out (the stub records the delay call) and the PUT is retried once; success after retry is recorded in the summary.

B5: with a stubbed client, three consecutive PUT failures halt the run and the summary states the failure count.

B6: the rollback function with a stubbed client restores the original title of a ticket whose current title equals the new title, and leaves alone a ticket whose title was changed again after apply.

Self-verify: npm run test:unit for backfill-ooh-titles.test.js all pass.

---

## 4. Acceptance criteria map

| AC (from DESIGN.md test plan) | Tests |
|---|---|
| T1-T19: title module rules | test/ticket-title.test.js (WU1) |
| R1-R4: all five creation routes return correct title | test/oohdash-137-title.test.js (WU2) |
| R5-R6: raiseQuery title correct, no "site N" repeat | test/oohdash-137-title.test.js (WU3) |
| R7: source guard, no bare "[OOH] " left in zendesk.js | test/oohdash-137-title.test.js (WU2) |
| R8: Tonight audit wording unchanged | test/oohdash-137-title.test.js (WU2) |
| B1-B6: back-fill planning, apply, rollback | test/backfill-ooh-titles.test.js (WU4) |
| E2E: full Playwright suite unchanged | Playwright suite (unmodified) |

The five creation routes satisfy the single fix-point requirement from discovery. The raiseQuery simplification (removing "- site N" from the subject while keeping it in the summary/[TRG] line) satisfies DESIGN.md section 3.3.

---

## 5. Verification (Build runs before handoff)

Run in this order:

1. npm run test:unit
   Runs node:test on the test/ directory. Must show all tests in ticket-title.test.js, oohdash-137-title.test.js and backfill-ooh-titles.test.js green. Zero failures; zero skipped unless marked with skip intentionally.

2. npx playwright test
   Single sequential run of the full Playwright suite. No concurrent Playwright processes on this host. Must show all existing specs green. No new spec is added; this is a regression check only.

3. Self-audit before handoff:
   - grep '"[OOH] ' services/zendesk.js returns zero hits outside comments and the new source-guard test.
   - cat .gitignore includes backfill-*.json.
   - No credential, endpoint, or environment-specific value is hardcoded in any committed file.
   - buildOohTitle called on its own output returns the same string (idempotent, tested by T19).
   - Long dashes in outcome strings are unchanged through all title builds.
   - The [TRG] note first line in raiseQuery uses the verbose summary, not the short subject.

---

## 6. Code PR flow

The orchestrator opens the code PR from the build branch and merges it without a human gate. This is not a design gate or a test gate; it is a code-record PR. The pattern follows the autonomous-merge rule for non-gate PRs. The orchestrator does not raise a gate for the code PR.

CI checks that must pass before merge:
- unit tests (the "unit tests" required check in branch protection)
- e2e (playwright) (the "e2e (playwright)" required check in branch protection)

The build branch is forked from origin/main 2791351. The code PR targets main.

---

## 7. Release v1.4.4 and back-fill sequence

**Step 1 (Build): all tests green, code PR merged to main.**

**Step 2 (Release doer or orchestrator): cut v1.4.4.**
Run npm run release (patch) from a clean main checkout. This bumps package.json to 1.4.4, creates the git tag v1.4.4, writes the release notes entry. Release notes entry covers: OOHDASH-137 (preference improvement), what changed (ticket titles now include site number and pub name, raiseQuery simplified, back-fill script ships separately), no screen changes, rollback to v1.4.3 (image sha TBD at release time).

**Step 3 (Release doer or orchestrator): deploy v1.4.4 to the cluster.**
Standard set-image deploy. Confirm the pod is Running and no 5xx on the liveness endpoint.

**Step 4 (Release doer): run back-fill dry run, show output to James.**
On a machine with the live Zendesk environment variables set (same vars as the app, from CIR credentials/zendesk.env), run:
  node scripts/backfill-ooh-titles.mjs
Output is the table and the backfill-plan-{timestamp}.json file. Show James the printed table. Do not proceed to apply without his explicit go.

**Step 5 (James's go): apply back-fill.**
Only after James confirms the dry-run plan:
  node scripts/backfill-ooh-titles.mjs --apply --plan backfill-plan-{timestamp}.json
The script paces at one write every 2 seconds. Expected: 8 renames, <1 minute total. The rollback file (backfill-rollback-{timestamp}.json) is kept on the machine that ran the script for 30 days, then deleted. It is never committed.

**Step 6 (manual, Release doer after deploy): release check.**
Create one test capture on the agreed live test site. Read its title in Zendesk. Confirm it matches the "[OOH] N Name - outcome" format. This satisfies the "Release check" row in DESIGN.md section 5.

---

## 8. Rollback

**Code rollback:** redeploy the v1.4.3 image. New tickets go back to generic "[OOH] outcome" titles. No data to undo.

**Back-fill rollback:** run the script with the rollback file:
  node scripts/backfill-ooh-titles.mjs --rollback backfill-rollback-{timestamp}.json
This puts back original titles where the title has not been changed again since apply. Tickets changed by the IoT team after apply are not touched.

---

## 9. Definition of done

- All 19 T-tests, 8 R-tests and 6 B-tests pass (npm run test:unit).
- Full Playwright suite passes (npx playwright test), zero new failures.
- Source guard (R7) passes: no bare "[OOH] " in zendesk.js outside comments.
- backfill-*.json is in .gitignore.
- Code PR merged to main, CI checks green.
- v1.4.4 released, deployed, and the liveness endpoint returns 200.
- Back-fill dry-run shown to James before any apply.
- Back-fill apply run only on James's explicit go.
- Release check ticket created on the agreed test site and title confirmed in Zendesk.
- Handoff note lists every deviation from this plan, or states "none".

---

## 10. Open questions (carry to Test gate)

Q1-Design (Spencer): the IoT Support Dashboard re-checks open P1 tickets on every ticket update and can send the P1 alert again if there is no confirmed alert record. Is that intended? STATUS: UNRESOLVED. Not blocking. P1 tickets excluded from back-fill (D2) means this risk is already mitigated.

Q2-Design (anyone): Is 150 characters the right safety cap for Zendesk ticket titles? STATUS: DEDUCED. Zendesk does not publish a hard limit; real titles do not approach 150. The cap is defensive. No action needed before build.
