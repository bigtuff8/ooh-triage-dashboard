<!-- gate:contract
TICKET: OOHDASH-137
PHASE: build-plan
DATE: 2026-10-21
VERSION: 2

SECTION: What will be built
OOHDASH-137, patch release v1.4.4. Every Zendesk ticket the OOH dashboard creates will start with the site number and pub name, so Sam's team can see which site a ticket belongs to in the Zendesk list and merge picker without opening it. A title that today reads "[OOH] General issue captured" will read "[OOH] 6186 George Inn (Bathampton) - General issue captured". The town stays in brackets (D1). P1 tickets are left out of the one-off back-fill (D2). Release is a patch, v1.4.4 (D3). There is no screen change and no browser code change. The work is entirely server-side: one new pure module, two small edits in zendesk.js, one back-fill script, three new test files and two fixture files.

SECTION: P1 alert risk verdict (B1)
PROVEN. The IoT Support Dashboard P1 auto-alert fires only when the webhook payload for the UPDATED TICKET ITSELF contains the ooh_p1 tag. Evidence: server.js line 3749: if (OOH_AUTO_ENABLED and hasOohP1Tag(payload.tags) and OPEN_STATUSES.includes(payload.status)). hasOohP1Tag (ooh-escalation.js lines 112-114) checks extractTags(rawTags).includes('ooh_p1') on the incoming payload only. extractTags(undefined) returns [] (lines 106-110), so if the trigger omits tags, hasOohP1Tag is false. There is no global re-evaluation of all open ooh_p1 tickets on any non-P1 ticket update. The startup sweep (runOohStartupSweep, line 4247) is a one-time sweep at pod boot, not triggered by individual ticket updates. A back-fill subject-only PUT on a non-P1 ticket produces a webhook payload without the ooh_p1 tag; hasOohP1Tag returns false; handleOohAutoEscalation is not called. Excluding P1 tickets from the back-fill (D2) is therefore sufficient and not merely precautionary.

SECTION: James's approved changes to the design
Q1 (discovery) decided: site number and name first. Q2 (discovery) decided: no area in the title. Q3 (discovery) decided: back-fill of existing open OOH tickets is in scope. D1 decided: keep the town in brackets. D2 decided: leave the 2 open P1 tickets out of the back-fill. D3 decided: patch release v1.4.4.

SECTION: Work units and order
Five work units. WU1 creates the pure title module and its 20-case unit test (19 design cases plus a null-outcome defence case). WU2 wires createOutcomeTicket, adds the route-level and source-guard tests, and adds a resolveSiteName failure test. WU3 updates raiseQuery. WU4 creates the back-fill script, two fixture files, and the 6-test suite. WU5 cuts the v1.4.4 release and runs the back-fill dry run for James to approve before any apply. Each unit is self-verified before the next begins.

SECTION: Tests mapped to acceptance criteria
20 helper unit tests (T1-T20, test/ticket-title.test.js) cover every title-module rule plus a null/undefined outcome defence. 9 route and source tests (R1-R9, test/oohdash-137-title.test.js) cover all five creation routes, the raiseQuery title and note, the source guard, the Tonight audit wording, and resolveSiteName failure inside raiseQuery. 6 back-fill tests (B1-B6, test/backfill-ooh-titles.test.js) cover the 16-ticket main fixture with exact counts, plus rollback and apply edge cases from the separate edge-case fixture. The full Playwright suite is unchanged and must pass.

SECTION: Back-fill apply checkpoint shown to James
At Step 4 (dry run) James sees the printed table (id / action / old title / new title or skip reason), the exact count of 8 renames and 8 skips, and the path to the plan file. Before Step 5 (apply), the operator sends a brief heads-up to Sam's team (draft in section 9 below). At Step 5 (apply) the script re-reads each ticket, logs a pre-apply line, writes the rollback record, sends the PUT, and immediately reads the ticket back to verify the subject matches. The rollback file is copied to C:\harness-runs\iot-ooh-dash right after apply completes.

SECTION: Rollback
Code rollback: redeploy v1.4.3. This does NOT undo titles already renamed by the back-fill. For those, run the script with --rollback and the rollback file. Rollback restores only titles that have not been changed again since apply. The rollback file is the durable record for back-fill recovery; the Zendesk native ticket audit log (visible in the ticket's edit history in the Zendesk UI) is the independent durable record of every subject change.

SECTION: Open questions (non-blocking)
Q1-Design (Spencer): the IoT Support Dashboard fires handleOohAutoEscalation on every webhook for an ooh_p1-tagged ticket. If a P1 ticket's Cosmos claim record is stale (TTL expired, typically 30 days), a subsequent webhook (not from the back-fill, since P1 tickets are excluded) could resend the alert via the stale-reclaim path (ooh-escalation.js lines 464-493). Is that intended? STATUS: UNRESOLVED. Not blocking.
Q2-Design (anyone): Is 150 characters the right safety cap for Zendesk ticket titles? STATUS: DEDUCED. No action needed before build.

DECISION: Pub name in the title (D1) | Keep the town in brackets | Drop the town
DECISION: P1 tickets in the back-fill (D2) | Leave open P1 tickets out | Rename them
DECISION: Release number (D3) | Patch release v1.4.4 | Minor release v1.5.0
-->

# BUILD PLAN -- OOHDASH-137
## Site number and pub name in OOH Zendesk ticket titles

**Ticket:** OOHDASH-137 | **Release:** v1.4.4 (patch) | **Base:** origin/main 2791351 (v1.4.3) | **Design:** docs/project/oohdash-137-design/DESIGN.md (gate PR #117) | **Standards:** house idioms of this repo (plain JS ES modules, node:test, Playwright). Universal rules: no secrets or environment values added; errors handled by the existing shared error path.

---

## 1. James's binding decisions

- D1: Keep the town in brackets. A title reads "6261 Wheatstone Inn (Gloucester) - ..." not "6261 Wheatstone Inn - ...".
- D2: Leave open P1 tickets (tagged ooh_p1) out of the back-fill. Two such tickets exist today.
- D3: Patch release v1.4.4.
- Q1 (discovery, Sam): Site number and name first. Format "[OOH] N Name - outcome". Fallback when no trusted name: "[OOH] N - outcome". Fallback when no site: "[OOH] OOH query".
- Q2 (discovery, Sam): No area in the title.
- Q3 (discovery, Sam): Back-fill of existing open OOH tickets is in scope.

---

## 2. P1 alert risk analysis (B1)

**PROVEN: excluding P1 tickets from the back-fill is sufficient. A non-P1 subject PUT cannot trigger the P1 alert.**

The IoT Support Dashboard webhook handler (server.js line 3749) gates the auto-escalation call on a single compound check against the INCOMING WEBHOOK PAYLOAD:

  if (OOH_AUTO_ENABLED && hasOohP1Tag(payload.tags) && OPEN_STATUSES.includes(payload.status))

hasOohP1Tag (ooh-escalation.js lines 112-114) calls extractTags(rawTags).includes('ooh_p1'). extractTags (lines 106-110) returns [] for undefined, null, or any non-string non-array. There is no code path that, on receiving an update to any ticket, re-evaluates all open ooh_p1 tickets. The startup sweep (runOohStartupSweep, line 4247) is a one-shot run at pod boot, not triggered by individual ticket updates.

Back-fill behaviour: a subject-only PUT on a non-P1 ticket fires the "IoT Dashboard - Push Ticket Updates" Zendesk trigger. The webhook payload contains that ticket's tags. Because the ticket is not tagged ooh_p1, hasOohP1Tag returns false and handleOohAutoEscalation is not called. P1 tickets are additionally excluded from the back-fill by D2, so they receive no rename at all.

Risk Q1 from the design (still open with Spencer): even outside the back-fill, if a P1 ticket's Cosmos claim record is stale (TTL ~30 days), any later webhook on that ticket (not from the back-fill) would enter the stale-reclaim path (ooh-escalation.js lines 464-493). That path reconciles before resending, but an unreconciled stale claim could resend the SMS. This is a standing product behaviour question unrelated to this change. It does not block build.

---

## 3. Scope summary

| File | Change |
|---|---|
| services/ticket-title.js | New. Pure module. Exports buildOohTitle, normaliseSiteNo, cleanSiteName. No imports. |
| services/zendesk.js | Two edits: createOutcomeTicket (import + line 350 + return value) and raiseQuery (lines 610-622). |
| scripts/backfill-ooh-titles.mjs | New. One-off back-fill script. Never committed secrets. |
| test/ticket-title.test.js | New. 20 unit cases for the title module. |
| test/oohdash-137-title.test.js | New. 9 route-level, source-guard and error-path cases. |
| test/backfill-ooh-titles.test.js | New. 6 back-fill planning, apply and rollback cases. |
| test/fixtures/ooh-open-tickets.json | New. Exactly 16 tickets matching the live read (for B1 exact counts). |
| test/fixtures/ooh-backfill-edge-cases.json | New. Edge-case rows: mismatch, no-site, requester-updated, Monitoring-word, stand-in name, changed-since-plan. |
| .gitignore | Two lines: backfill-plan-*.json and backfill-rollback-*.json. These patterns do not match the fixture filenames. |

No browser code changes. No routes/api.js changes. No flows.js changes. No Playwright spec changes.

---

## 4. Work units

### WU1 -- New title module (services/ticket-title.js) and unit tests

**What changes:** create services/ticket-title.js. No imports; exports buildOohTitle, normaliseSiteNo, cleanSiteName. Create test/ticket-title.test.js with 20 cases.

**Rules (DESIGN.md section 3.1, D1 applied):**

Text clean (applied to every input): coerce to String(x ?? ''), replace control characters (code points 0-31 and 127) with a space, collapse runs of spaces to one, trim.

normaliseSiteNo(raw): (1) cleaned value matches /^(?:[A-Za-z]{1,5}[-_ ]?)?(\d{3,6})$/ -> return the captured digit string; (2) empty or "unknown" (any case) -> null; (3) anything else -> { freeText: cleaned text cut to 40 characters }.

cleanSiteName(name, siteNo): (1) apply text clean; (2) treat as missing (return null) if: empty, "unknown", equals siteNo digits, or matches /^[A-Za-z]{1,5}[-_]\d{3,6}$/ (stand-in pattern e.g. "gk-6261", "md-1110"); (3) remove a leading occurrence of siteNo digits followed by spaces and/or a hyphen; if now empty, treat as missing; (4) cut to 60 characters (57 + "..." if longer); (5) D1: town kept as-is.

buildOohTitle({ siteNo, siteName, outcome }):
1. normalisedNo = normaliseSiteNo(siteNo).
2. cleanedName = (normalisedNo and typeof normalisedNo === 'string') ? cleanSiteName(siteName, normalisedNo) : null.
3. Clean the outcome string. Strip one leading "[OOH] " prefix (with any following spaces) for idempotency. An empty, null or undefined outcome becomes "OOH outcome" (never the literal "undefined").
4. Site part: digits -> digits + (name ? ' ' + name : ''); freeText -> freeText; null -> ''.
5. No-double: if site part non-empty and outcome starts with the siteNo digits followed by a non-digit or end, drop the site part.
6. Join: '[OOH] ' + (sitePart ? sitePart + ' - ' : '') + outcome.
7. Cap: if result longer than 150 chars, shorten outcome to make total exactly 150, ending "...". Never shorten the site part or "[OOH] " prefix.
8. Return the string. Never throw.

**test/ticket-title.test.js (T1-T20):**

| Id | Input | Expected |
|---|---|---|
| T1 | siteNo "6261", siteName "Wheatstone Inn (Gloucester)", outcome "General issue captured" | [OOH] 6261 Wheatstone Inn (Gloucester) - General issue captured |
| T2 | siteNo "6261", siteName null | [OOH] 6261 - General issue captured |
| T3 | siteNo "gk-6261", siteName "Wheatstone Inn (Gloucester)" | [OOH] 6261 Wheatstone Inn (Gloucester) - General issue captured |
| T4 | siteNo "md-1110", siteName "md-1110" (stand-in) | stand-in normaliseSiteNo returns null; [OOH] General issue captured |
| T5 | siteNo "6261", siteName "6261" (equals number) | name missing; [OOH] 6261 - General issue captured |
| T6 | siteNo "6261", siteName "6261 Wheatstone Inn" (starts with number) | number stripped; [OOH] 6261 Wheatstone Inn - ... |
| T7 | siteName with embedded line breaks and double spaces | collapsed to single spaces |
| T8 | siteNo "gk_7639" | normalised to "7639" |
| T9 | siteNo "GK-7639" | normalised to "7639" |
| T10 | siteNo " 7639 " | normalised to "7639" |
| T11 | siteNo null, siteName "Wheatstone Inn" | site part empty; name unused without siteNo; [OOH] outcome |
| T12 | siteNo "", siteName "Wheatstone Inn" | same as T11 |
| T13 | siteNo "unknown" | null -> same as T11 |
| T14 | siteNo null, siteName null, outcome "OOH query" | [OOH] OOH query |
| T15 | siteNo "6261", outcome starts "6202 ..." (different number) | site part NOT dropped; [OOH] 6261 - 6202 ... |
| T16 | siteNo "6261", outcome starts "6261" | no-double fires; site part dropped |
| T17 | siteNo "6261", outcome contains "E6261" mid-string | site part NOT dropped (only start of outcome checked) |
| T18 | outcome already starts "[OOH] " | prefix stripped; exactly one [OOH] in result |
| T19 | 300-char outcome, siteNo "6261", siteName "Wheatstone Inn (Gloucester)" | result exactly 150 chars ending "..."; site part whole |
| T20 | outcome null or undefined | becomes "OOH outcome"; no literal "undefined" in title |

Additional assertions within the 20: a 90-character siteName is cut to 60; long dashes in outcome kept; "Ambiguous (Black Bull / Red Lion)" kept; buildOohTitle on its own output is idempotent.

Self-verify: npm run test:unit for ticket-title.test.js, all pass.

---

### WU2 -- createOutcomeTicket wiring (services/zendesk.js line 350) and route tests

**Import (one statement, covers WU2 and WU3):**

  import { buildOohTitle, normaliseSiteNo } from './ticket-title.js';

Both symbols imported here. WU3 uses normaliseSiteNo from this same import; no second import statement is added in WU3.

**Edits inside createOutcomeTicket:**

Before the live/test branch:
  const title = buildOohTitle({ siteNo, siteName, outcome: subject });

Test-mode return: add title field beside the existing id and url.

Live-mode payload: replace `subject: \`[OOH] ${subject}\`` with `subject: title`.

Live-mode return: add title field beside id and url.

Fields summary, detail, callerWords, tags, priority, custom_fields and the [TRG] comment body are untouched. The Tonight audit line (routes/api.js line 397) reads the raw subject from the request body before createOutcomeTicket is called and is not affected.

**test/oohdash-137-title.test.js (R1-R9):**

R1: flow outcome (siteNo "6261", siteName "Wheatstone Inn (Gloucester)", subject "External lighting not working - P1") -> title "[OOH] 6261 Wheatstone Inn (Gloucester) - External lighting not working - P1".

R2: control outcome (siteNo "7639", siteName "Black Bull (Corbridge)", subject "Setpoint lower -- sent, awaiting device confirmation") -> title "[OOH] 7639 Black Bull (Corbridge) - Setpoint lower -- sent, awaiting device confirmation". Long dash unchanged.

R3: createLateSyncTicket with null siteName (siteNo "7639") -> title "[OOH] 7639 - Late device confirmation -- IT700TX-025804FB".

R4: ambiguous-house-number path (siteNo "6261", siteName "Ambiguous (Black Bull / Red Lion)", subject "Ambiguous house ID 6261 -- caller could not be resolved to one site") -> title starts "[OOH] 6261 Ambiguous (Black Bull / Red Lion) - ". No-double does not fire (outcome starts "Ambiguous", not "6261").

R5: raiseQuery with siteNo "6832" and looked-up siteName -> title "[OOH] 6832 Name - OOH query"; no "site 6832" substring in title.

R6: raiseQuery with siteNo null -> title "[OOH] OOH query".

R7 (source guard): fs.readFileSync of services/zendesk.js, regex for literal '[OOH] ' outside comment lines, zero matches. This confirms the old subject assignment is gone and no bare "[OOH] " is added elsewhere.

R8: createOutcomeTicket in test mode for a capture outcome; the raw subject ("General issue captured") does not appear in the title field with a site prefix but is unchanged in the test-mode fixture subject field. Confirms the Tonight audit path is unaffected.

R9: resolveSiteName throws inside raiseQuery; ticket is still created; the returned title is "[OOH] N - OOH query" (number-only, no name). Verifies the try/catch null fallback in WU3.

Self-verify: npm run test:unit for oohdash-137-title.test.js, all pass.

---

### WU3 -- raiseQuery cleanup (services/zendesk.js lines 610-622)

**Exact edits (from DESIGN.md section 3.3):**

normaliseSiteNo is already imported from WU2. Replace the opening of raiseQuery:

  const norm = normaliseSiteNo(siteNo);
  const digits = (norm && typeof norm === 'string') ? norm : null;
  let resolvedName = null;
  if (digits) {
      try { resolvedName = await resolveSiteName(digits); } catch (_) { resolvedName = null; }
  }
  const summary = `OOH query${siteNo ? ` -- site ${siteNo}` : ''}`;
  return createOutcomeTicket({
      operator,
      siteNo: siteNo || 'unknown',
      siteName: resolvedName,
      subject: 'OOH query',
      summary,
      ...

The try/catch on resolveSiteName is the non-throwing null fallback for R9. The summary variable carries the original verbose text for the [TRG] first line. The subject passed to createOutcomeTicket is the plain "OOH query"; buildOohTitle builds "[OOH] N Name - OOH query". When the handler typed words (norm is { freeText }), siteNo is passed as the raw text so rule 2 treats it as freeText.

Nothing else in raiseQuery changes. R5, R6, R9 cover this.

---

### WU4 -- Back-fill script, fixtures and tests

**scripts/backfill-ooh-titles.mjs:**

Imports: config.js (env/Zendesk vars), ticket-title.js (buildOohTitle, normaliseSiteNo, cleanSiteName). Refuses to start unless DATA_MODE === 'live'.

**[TRG] cross-check fetch (B2b):** The Zendesk search API returns ticket metadata but not comment bodies. The script fetches comments per ticket: GET /tickets/{id}/comments.json?sort_order=asc&per_page=5. It reads the first comment body and pattern-matches for "Site selected: NAME (SITENO)". If the pattern does not match, it logs: '[BACKFILL] #ID [TRG] line not found in first comment - using field-only site source'. Rate-limit budget: up to 16 search results + 16 comment reads = 32 Zendesk API calls in dry-run. In apply: 32 + 8 PUTs + 8 read-backs = 48 calls. Pacing: comment reads are spaced 500ms apart (well within the standard rate limit); PUTs are spaced 2 seconds apart as before.

**SKIP-monitoring-word rule (panel feedback):** The check is applied to the CURRENT TITLE TEXT (the existing subject field as read from Zendesk), not to the not-yet-built new title. Specifically: the outcome string (current subject minus "[OOH] " prefix) is checked for the word "Monitoring" (case-insensitive whole-word match using /\bMonitoring\b/i). If matched, the rule fires and the ticket is skipped.

**Per-ticket planning rules (first match wins):**

1. SKIP-human-renamed: title does not start "[OOH] ".
2. SKIP-already-has-site: after "[OOH] " the title starts with the site number from source 1.
3. SKIP-p1: tagged ooh_p1 (D2).
4. SKIP-requester-updated: tagged updated_by_requester or updated_by_repairs_admin.
5. Derive siteNo: Zendesk site field 11405878329244 (e.g. "gk_6186") via normaliseSiteNo (source 1). Cross-check: first comment [TRG] "Site selected: NAME (SITENO)" line (source 2). If both exist and numbers differ: SKIP-site-mismatch. If neither exists: SKIP-no-site.
6. SKIP-monitoring-word: the CURRENT TITLE (subject field) contains the word "Monitoring" (case-insensitive, /\bMonitoring\b/i on the raw current subject).
7. Derive siteName: resolveSiteName(digits); if null, [TRG] name through cleanSiteName; if still none, number-only.
8. Build new title: buildOohTitle({ siteNo: digits, siteName, outcome: currentSubject.slice('[OOH] '.length) }).
9. RENAME.

**Apply safety (per ticket):**

Pre-apply: log structured JSON line { step: 'pre-apply', id, oldTitle, newTitle }.
Write rollback line to backfill-rollback-{timestamp}.json before the PUT: { OohBackfillTicketId, OohBackfillOldSubject, OohBackfillNewSubject, OohBackfillAppliedAt }.
Re-read ticket. If current subject != planned oldTitle -> SKIP-changed-since-plan (no PUT, no rollback line for this ticket).
PUT /tickets/{id}.json: { ticket: { subject: newTitle, safe_update: true, updated_stamp } }. Subject only.
Post-apply read-back (B2d): re-read ticket after the PUT. If subject matches newTitle -> log { step: 'verified', id }. If not -> log { step: 'verify-mismatch', id, expected: newTitle, got: actualSubject } as WARN. Print a reconciliation summary at the end: { renamed, verified, unverified }.
2-second gap between PUTs. On HTTP 429, read Retry-After, wait, retry once. Stop after 3 consecutive failures.
Copy backfill-rollback-{timestamp}.json to C:\harness-runs\iot-ooh-dash\ immediately after apply completes (or after stop due to failures). Log the destination path.

**Updated_at and list ordering (panel item):** A subject-only PUT by the service account changes the ticket's updated_at timestamp. Tickets in Zendesk views sorted by last updated will re-sort; the 8 renamed tickets will briefly appear at the top of those views. This is one-off and minor. No customer-visible notification fires (the customer notification trigger requires a public comment). The IoT Support Dashboard will receive a webhook for each rename and update its cached title.

**Zendesk audit log:** Every subject change by the back-fill is recorded in the Zendesk native ticket audit log (visible in the ticket's edit history in the Zendesk agent UI). This is the independent durable record for each change, separate from the rollback file.

**test/fixtures/ooh-open-tickets.json:** Exactly 16 ticket objects, shaped as Zendesk GET /tickets/{id} responses (id, subject, tags array, custom_fields array with site field, status). Each also has a comments array (shaped as GET /tickets/{id}/comments response with at most 5 items) containing the [TRG] first note with a "Site selected: NAME (SITENO)" line where applicable. These 16 tickets match the live read and produce exactly 8 RENAME and 8 SKIP rows for B1 exact counts.

**test/fixtures/ooh-backfill-edge-cases.json:** Additional rows exercising: site-field and [TRG] numbers disagree (SKIP-site-mismatch), neither source has a site number (SKIP-no-site), tagged updated_by_requester (SKIP-requester-updated), current subject contains "Monitoring" (SKIP-monitoring-word), [TRG] pattern absent from first comment (structured log line check), stand-in siteName resolved to number-only title, changed-since-plan (SKIP-changed-since-plan in apply path).

**.gitignore additions:** Two lines:

  backfill-plan-*.json
  backfill-rollback-*.json

These patterns do not match ooh-open-tickets.json or ooh-backfill-edge-cases.json. The committed fixture files are safe.

**test/backfill-ooh-titles.test.js (B1-B6):**

B1: planning function on ooh-open-tickets.json with a stubbed Zendesk client (comment fetch returns the fixture comments): exactly 8 RENAME rows with the titles from DESIGN.md section 2, 4 SKIP-human-renamed, 2 SKIP-already-has-site, 2 SKIP-p1.

B2: apply function with a stubbed Zendesk client: rollback line written before the PUT; post-apply read-back succeeds; reconciliation summary shows 1 renamed, 1 verified.

B3: apply function where ticket current subject differs from plan (SKIP-changed-since-plan); no PUT sent, no rollback line written, summary shows 0 renamed.

B4: apply function where a single HTTP 429 response is returned; stub records the Retry-After wait; PUT retried; success after retry recorded in summary.

B5: apply function where 3 consecutive PUT failures halt the run; summary states failure count; rollback file was written for each attempted rename that had a pre-apply log line.

B6: rollback function restores original title where current title equals new title; leaves alone a ticket whose title was changed again after apply.

Self-verify: npm run test:unit for backfill-ooh-titles.test.js, all pass.

---

## 5. Acceptance criteria map

| AC | Tests |
|---|---|
| T1-T20: title module rules including null/undefined outcome | test/ticket-title.test.js (WU1) |
| R1-R4: all five creation routes return correct title | test/oohdash-137-title.test.js (WU2) |
| R5-R6: raiseQuery title correct, no "site N" repeat | test/oohdash-137-title.test.js (WU3) |
| R7: source guard, no bare "[OOH] " left in zendesk.js | test/oohdash-137-title.test.js (WU2) |
| R8: Tonight audit wording unchanged | test/oohdash-137-title.test.js (WU2) |
| R9: resolveSiteName failure in raiseQuery -> number-only title, ticket created | test/oohdash-137-title.test.js (WU3) |
| B1-B6: back-fill planning, apply, rollback | test/backfill-ooh-titles.test.js (WU4) |
| E2E: full Playwright suite unchanged | Playwright suite (unmodified) |

---

## 6. Verification (Build runs before handoff)

1. npm run test:unit -- all 35 cases (T1-T20, R1-R9, B1-B6) green, zero failures.
2. npx playwright test -- single sequential run; no concurrent Playwright on this host. All existing specs green; zero new failures.
3. Self-audit before handoff:
   - grep '[OOH] ' services/zendesk.js returns zero hits outside comments.
   - cat .gitignore shows backfill-plan-*.json and backfill-rollback-*.json (not backfill-*.json).
   - No credential, endpoint, or environment-specific value in any committed file.
   - buildOohTitle(buildOohTitle(x)) === buildOohTitle(x) for the T1 inputs (T18 covers this).
   - Long dashes in outcome strings unchanged through all title builds (T2, R2).
   - raiseQuery [TRG] first line uses summary not subject (R8 cross-check).

---

## 7. Code PR flow

The orchestrator opens the code PR from the build branch and merges it without a human gate (autonomous-merge rule for non-gate PRs). CI checks that must pass before merge: "unit tests" and "e2e (playwright)" (both required by branch protection). The build branch targets main from base 2791351.

---

## 8. Credentials, deploy runbook, live check site

- Zendesk credentials for the back-fill: CIR credentials/zendesk.env (same vars the app reads through config.js). The script uses these vars via config.js; no vars are hard-coded.
- Deploy runbook: CIR OOH_DASHBOARD_DEPLOY.md (or npm run release for the version bump step).
- Live check site: to be confirmed with James at release. Sam's team has used site 6186 George Inn (Bathampton) and site 7971 Shuttle and Loom (Darlington) as test subjects in recent weeks. Propose 7971 as the post-deploy check site unless James specifies another.

---

## 9. Release v1.4.4 and back-fill sequence

**Step 1 (Build): all 35 unit tests green, Playwright suite green, code PR merged to main, CI checks passed.**

**Step 2 (Release): cut v1.4.4.**
Run npm run release (patch) from clean main. Bumps package.json to 1.4.4, creates tag v1.4.4, writes release notes entry. Release notes: OOHDASH-137 (preference improvement), titles now include site number and pub name, raiseQuery simplified, back-fill script ships separately, no screen changes, rollback to v1.4.3.

**Step 3 (Deploy): deploy v1.4.4 to the cluster.**
Standard set-image deploy per CIR OOH_DASHBOARD_DEPLOY.md. Confirm pod is Running and liveness endpoint returns 200. If the deploy fails: redeploy v1.4.3 (code rollback); do not proceed to back-fill. Note: code rollback does NOT undo any back-fill renames; those are independent.

**Step 4 (Dry run): run back-fill dry run, show output to James.**
On the operator machine with CIR credentials/zendesk.env in the environment:
  node scripts/backfill-ooh-titles.mjs
Print the table and save backfill-plan-{timestamp}.json. Show James the printed table (expect 8 RENAME rows, 8 SKIP rows matching the DESIGN.md section 2 list). Do not proceed without James's explicit go.

**Step 5 (Pre-apply): send heads-up to Sam's team.**
Before applying, James sends this message (or equivalent) to Sam:
  "Hi Sam, we are about to rename the 8 open OOH tickets that still have generic subjects (General issue captured, Setpoint raise etc.) to include the site name and number. This is a one-off tidy-up for the new format that ships today. They will briefly appear at the top of your updated-ticket view. No other changes. The 2 open P1 tickets are not touched."

**Step 6 (Apply): apply back-fill.**
Only after James confirms the dry-run plan and the heads-up has been sent:
  node scripts/backfill-ooh-titles.mjs --apply --plan backfill-plan-{timestamp}.json
The script paces at one write every 2 seconds. Expected: 8 renames, under 1 minute total. Copy the rollback file to C:\harness-runs\iot-ooh-dash\ immediately after the script finishes. Print the destination path. Keep the rollback file there for 30 days, then delete. Never commit it.

**Step 7 (Release check): post-deploy verification.**
Create one test capture on the agreed live check site (see section 8). Read its title in Zendesk. Confirm it matches "[OOH] N Name - outcome". This satisfies the DESIGN.md section 5 Release check row.

---

## 10. Rollback

**Code rollback:** redeploy v1.4.3 image. New tickets go back to generic "[OOH] outcome" titles. No stored data or setting to undo. This does NOT undo back-fill renames; the two are independent.

**Back-fill rollback:** run with the rollback file:
  node scripts/backfill-ooh-titles.mjs --rollback backfill-rollback-{timestamp}.json
This puts back the original title for each ticket where the current title still equals the new title applied. Tickets changed by the IoT team after apply are not touched. The Zendesk native ticket audit log (edit history in the agent UI) is the independent durable record for each change.

---

## 11. Definition of done

- All 35 new unit tests pass (npm run test:unit).
- Full Playwright suite passes (npx playwright test), zero new failures.
- Source guard (R7) passes: no bare "[OOH] " in zendesk.js outside comments.
- .gitignore has backfill-plan-*.json and backfill-rollback-*.json (not backfill-*.json).
- Code PR merged to main, CI checks green.
- v1.4.4 deployed, liveness endpoint 200.
- Back-fill dry-run shown to James before any apply.
- Heads-up sent to Sam's team before apply.
- Back-fill apply run only on James's explicit go.
- Rollback file copied to C:\harness-runs\iot-ooh-dash after apply.
- Post-deploy release check ticket created on the agreed test site and title confirmed in Zendesk.
- Handoff note lists every deviation from this plan, or states "none".

---

## 12. Open questions (carry to Test gate)

Q1-Design (Spencer): the IoT Support Dashboard fires handleOohAutoEscalation on every webhook for an ooh_p1-tagged ticket. If a claim record is stale (TTL ~30 days), a later webhook could resend via the stale-reclaim path (ooh-escalation.js lines 464-493). Is that intended? STATUS: UNRESOLVED. Not blocking.

Q2-Design (anyone): Is 150 characters the right safety cap for Zendesk ticket titles? STATUS: DEDUCED. No action needed before build.
