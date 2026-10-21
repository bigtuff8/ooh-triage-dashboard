<!-- gate:contract
TICKET: OOHDASH-137
PHASE: build-plan
DATE: 2026-10-21
VERSION: 3

SECTION: What will be built
OOHDASH-137, patch release v1.4.4. Every Zendesk ticket the OOH dashboard creates will start with the site number and pub name, so Sam's team can see which site a ticket belongs to in the Zendesk list and merge picker without opening it. A title that today reads "[OOH] General issue captured" will read "[OOH] 6186 George Inn (Bathampton) - General issue captured". The town stays in brackets (D1). P1 tickets are left out of the one-off back-fill (D2). Release is a patch, v1.4.4 (D3). There is no screen change and no browser code change. The work is entirely server-side: one new pure module, two small edits in zendesk.js, one back-fill script, three new test files and two fixture files.

SECTION: Trigger analysis (requester/assignee/group notification verdict)
PROVEN. 27 active triggers read live 2026-10-21 via Zendesk API. A subject-only PUT by the service account (role = agent, update_type = Change, no comment) on an open ooh-tagged ticket fires exactly two triggers. "Agent Update - Remove Customer Updated Tag" (22251870512924): fires on Change by agent with no iotddiaryauto comment; action is remove_tags updated_by_requester and updated_by_repairs_admin; no notification to any person. "IoT Dashboard Push Ticket Updates" (26455778093852): fires on any Change; action is a webhook to the IoT Support Dashboard; no notification to any person. All other active triggers that send email or notifications to requester, assignee or group require either update_type = Create, or comment_is_public = true, or assignee_id changed, or role = end_user; none of those conditions are met by a subject-only PUT from an agent with no comment. Three inactive triggers with notification actions (Notify all agents, Notify agent and CCs of comment update, Notify assignee of reopened ticket) do not fire regardless. No trigger notifies the requester, assignee or any group on a back-fill rename. This is a hard precondition that must be re-verified at apply time: the runbook step before --apply includes re-listing triggers and confirming no new active notification trigger matches a Change event (see section 9).

SECTION: IoT Support Dashboard non-P1 webhook path (code trace)
PROVEN. For a subject-only PUT on an open ooh-tagged non-P1 ticket: (1) HMAC verified, server.js:3663-3671. (2) Status and priority normalised to lowercase, server.js:3686-3687. (3) ticketId parsed from payload, server.js:3676. (4) cachedIdx found in ticketCache.tickets, server.js:3692. Ticket is open (not solved or closed), cachedIdx >= 0: (5) cached.subject updated to payload.subject, server.js:3704. Other fields (status, priority, tags, updated_at, custom_fields) updated if present in payload, server.js:3705-3711. (6) broadcastSSE({ type: 'ticket-updated', ticketId, ticket: cached }), server.js:3713. SSE pushes the updated title to any IoT Dashboard browser tabs that are currently open. (7) OOH auto branch: hasOohP1Tag(payload.tags) is false for a non-P1 ticket; handleOohAutoEscalation is not called, server.js:3749. (8) 200 returned, server.js:3767. No DB write. No email. No SMS. No alert. No Cosmos write. The only user-visible effect is that connected IoT Dashboard browser sessions see the ticket's displayed title update in real time via SSE. This is correct and beneficial behaviour.

SECTION: James's approved changes to the design
Q1 (discovery) decided: site number and name first. Q2 (discovery) decided: no area in the title. Q3 (discovery) decided: back-fill of existing open OOH tickets is in scope. D1 decided: keep the town in brackets. D2 decided: leave the 2 open P1 tickets out of the back-fill. D3 decided: patch release v1.4.4.

SECTION: Work units and order
Five work units. WU1 creates the pure title module and its 20-case unit test. WU2 wires createOutcomeTicket and adds route-level and source-guard tests. WU3 updates raiseQuery with a 2-second timeout on resolveSiteName and adds R9 (throw) and R10 (timeout) tests. WU4 creates the back-fill script, two fixture files, and the 6-test suite. WU5 cuts the v1.4.4 release and runs the back-fill dry run for James to approve before any apply. Each unit is self-verified before the next begins.

SECTION: Tests mapped to acceptance criteria
20 helper unit tests (T1-T20, test/ticket-title.test.js). 10 route and source tests (R1-R10, test/oohdash-137-title.test.js): all five creation routes, raiseQuery title and [TRG] note, source guard, Tonight audit wording, resolveSiteName throw fallback (R9), resolveSiteName 2-second timeout fallback (R10). 6 back-fill tests (B1-B6, test/backfill-ooh-titles.test.js): exact counts on the 16-ticket fixture, plus edge cases from the separate fixture. Full Playwright suite unchanged and must pass.

SECTION: Back-fill apply checkpoint
At Step 4 (dry run) James sees the actual printed table and plan file as they exist at run time. The fixture counts (8 RENAME, 8 SKIP) are test expectations only and will likely differ at apply time as tickets open and close between today and release day. James approves or rejects based on the table he sees. The trigger re-check (a manual step in the runbook, section 9) is completed before --apply is passed to the script.

SECTION: Rollback
Code rollback: redeploy v1.4.3. This does NOT undo titles already renamed by the back-fill. For back-fill rollback: run the script with --rollback and the rollback file. Rollback restores only titles that have not been changed again since apply. The Zendesk native ticket audit log (edit history in the Zendesk agent UI) is the independent durable record of every subject change.

SECTION: Open questions (non-blocking)
Q1-Design (Spencer): the IoT Support Dashboard fires handleOohAutoEscalation on every webhook for an ooh_p1-tagged ticket. If a claim record is stale (TTL ~30 days), a later webhook on that ticket (unrelated to the back-fill, since P1 tickets are excluded) could resend the alert via the stale-reclaim path (ooh-escalation.js lines 464-493). Is that intended? STATUS: UNRESOLVED. Not blocking.
Q2-Design (anyone): Is 150 characters the right safety cap? STATUS: DEDUCED. No action needed.

DECISION: Pub name in the title (D1) | Keep the town in brackets | Drop the town
DECISION: P1 tickets in the back-fill (D2) | Leave open P1 tickets out | Rename them
DECISION: Release number (D3) | Patch release v1.4.4 | Minor release v1.5.0
-->

# BUILD PLAN -- OOHDASH-137
## Site number and pub name in OOH Zendesk ticket titles

**Ticket:** OOHDASH-137 | **Release:** v1.4.4 (patch) | **Base:** origin/main 2791351 (v1.4.3) | **Design:** docs/project/oohdash-137-design/DESIGN.md (gate PR #117) | **Standards:** house idioms of this repo (plain JS ES modules, node:test, Playwright). Universal rules: no secrets or environment values added; errors handled by the existing shared error path.

---

## 1. James's binding decisions

- D1: Keep the town in brackets.
- D2: Leave open P1 tickets (tagged ooh_p1) out of the back-fill. Two such tickets exist today.
- D3: Patch release v1.4.4.
- Q1 (discovery, Sam): Site number and name first. Format "[OOH] N Name - outcome". Fallback when no trusted name: "[OOH] N - outcome". Fallback when no site: "[OOH] OOH query".
- Q2 (discovery, Sam): No area in the title.
- Q3 (discovery, Sam): Back-fill of existing open OOH tickets is in scope.

---

## 2. Evidence: trigger analysis for a back-fill subject-only PUT

**PROVEN.** All 27 triggers read live via Zendesk API 2026-10-21.

A subject-only PUT by the service account has these properties: update_type = Change, role = agent, no comment added, no assignee change.

| Trigger (id) | Active | Fires? | Reason it does not fire | Notification risk |
|---|---|---|---|---|
| Notify requester and CCs of received request (11404238446748) | Yes | No | update_type = Create required | None |
| Notify Customer of Ticket Update (11440065305500) | Yes | No | ALL block requires comment_is_public = true; subject-only update has no comment | None |
| Notify assignee of assignment (11404238465436) | Yes | No | requires assignee_id changed | None |
| Notify requester of new proactive incident (11404211806492) | Yes | No | update_type = Create required | None |
| Notify requester of new proactive Alarm (18355259472540) | Yes | No | update_type = Create required | None |
| Notify all agents of received request (11404211821596) | No | No | inactive | None |
| Notify assignee of comment update (11404211811228) | Yes | No | comment_is_public = "not_relevant" means a comment must be present; subject-only update has no comment | None |
| Notify agent and CCs of comment update (11404238450972) | No | No | inactive | None |
| Notify assignee of reopened ticket (11404238474012) | No | No | inactive | None |
| Internal Response (18355259472540) | Yes | No | update_type = Create required | None |
| Meg Forwarding - No Alarms (25105383058204) | No | No | inactive | None |
| 00 - Set Manual Override Tag Early (21229001101596) | Yes | No | subject must include "Combi Oven | Water Usage | OOH" | None |
| Flagging job internal (18339548124572) | Yes | No | update_type = Create required | None |
| Combi Oven OOH (20753520688540) | Yes | No | subject must include "Combi Oven | Water Usage | OOH" | None |
| Monitoring Tagging (21523886901916) | Yes | Only if subject includes "Monitoring" | SKIP-monitoring-word prevents this | Adds tag; no notification |
| Customer Update - Add Customer Updated Tag (22251828768540) | Yes | No | role must be end_user; service account is agent | None |
| Agent Update - Remove Customer Updated Tag (22251870512924) | Yes | YES | Change by agent with no iotddiaryauto comment | Removes tags only; no notification |
| Assign Brand - Farmhouse Inns (23900410418076) | No | No | inactive | None |
| Assign Brand - Flaming Grill (23900496860700) | No | No | inactive | None |
| Assign Client - Greene King (23900460027804) | No | No | inactive | None |
| Assign Site (23901538223004) | No | No | inactive | None |
| Assign Site (updated - lh device not present) (24782887944476) | No | No | inactive | None |
| Assign Site (updated - lh present) (24782877603868) | No | No | inactive | None |
| Auto: Set Customer Replied status (26381354953116) | Yes | No | role must be end_user | None |
| Phone Call - Notes/Checks (24050667752092) | No | No | inactive | None |
| IoT Dashboard -- Push Ticket Updates (26455778093852) | Yes | YES | fires on any Change | Webhook to IoT Dashboard; no person notified |
| IoT Dashboard -- Push New Tickets (26455738065052) | Yes | No | update_type = Create required | None |

**Summary:** Two triggers fire. Neither notifies any person. "Agent Update - Remove Customer Updated Tag" removes the updated_by_requester tag (a no-op for the 8 back-fill targets, which the SKIP-requester-updated rule already excluded from having that tag). "IoT Dashboard - Push Ticket Updates" sends a webhook to the IoT Dashboard; see section 3 for the code trace.

**Hard precondition at apply time:** before running --apply, the operator re-lists the live Zendesk triggers (one CLI or MCP call) and confirms no new active trigger with a notification action matches a Change event from an agent without a comment. This is a mandatory step in the apply runbook (section 9). If a new such trigger is found, stop and escalate to James.

---

## 3. Evidence: IoT Support Dashboard non-P1 webhook path (code trace)

**PROVEN.** Trace for a subject-only PUT on an open ooh-tagged non-P1 ticket:

- server.js:3663-3671 -- HMAC verified.
- server.js:3686-3687 -- status and priority normalised to lowercase.
- server.js:3676 -- ticketId extracted from payload.
- server.js:3692 -- cachedIdx = ticketCache.tickets.findIndex(t => t.id === ticketId). Ticket is in cache (it was loaded at startup and is open).
- server.js:3694 -- status is not "solved" or "closed" (back-fill targets are open/pending/hold).
- server.js:3701-3713 -- cachedIdx >= 0 branch: cached.subject = payload.subject (line 3704); other fields updated from payload (3705-3711); broadcastSSE({ type: "ticket-updated", ticketId, ticket: cached }) (line 3713). SSE notifies connected browser tabs of the new title. No DB write. No Cosmos call. No email. No SMS.
- server.js:3749 -- OOH auto branch: hasOohP1Tag(payload.tags) is false (non-P1 ticket has no ooh_p1 tag); handleOohAutoEscalation is NOT called.
- server.js:3767 -- 200 returned.

**What connected IoT Dashboard browsers see:** the SSE "ticket-updated" event carries the updated cached ticket object including the new subject. Any browser tab currently viewing open tickets receives this and updates the displayed title. This is correct and beneficial. No alert, no action, no email.

---

## 4. Scope summary

| File | Change |
|---|---|
| services/ticket-title.js | New. Pure module. Exports buildOohTitle, normaliseSiteNo, cleanSiteName. No imports. |
| services/zendesk.js | Two edits: createOutcomeTicket (import + line 350 + return value) and raiseQuery (lines 610-622, adds 2s timeout on resolveSiteName). |
| scripts/backfill-ooh-titles.mjs | New. One-off back-fill script. Never committed secrets. |
| test/ticket-title.test.js | New. 20 unit cases. |
| test/oohdash-137-title.test.js | New. 10 route-level, source-guard and error-path cases. |
| test/backfill-ooh-titles.test.js | New. 6 back-fill planning, apply and rollback cases. |
| test/fixtures/ooh-open-tickets.json | New. Exactly 16 tickets matching the live read. Includes comments array per ticket. |
| test/fixtures/ooh-backfill-edge-cases.json | New. Edge-case rows. |
| .gitignore | Two lines: backfill-plan-*.json and backfill-rollback-*.json. Does not match fixture filenames. |

No browser code changes. No routes/api.js changes. No flows.js changes. No Playwright spec changes.

---

## 5. Work units

### WU1 -- New title module (services/ticket-title.js) and unit tests

**What changes:** create services/ticket-title.js. No imports; exports buildOohTitle, normaliseSiteNo, cleanSiteName. Create test/ticket-title.test.js with 20 cases.

**Rules (DESIGN.md section 3.1, D1 applied):**

Text clean (applied to every input): coerce to String(x ?? ''), replace control characters (code points 0-31 and 127) with a space, collapse runs of spaces to one, trim.

normaliseSiteNo(raw): (1) cleaned value matches /^(?:[A-Za-z]{1,5}[-_ ]?)?(\d{3,6})$/ -> return the captured digit string; (2) empty or "unknown" (any case) -> null; (3) anything else -> { freeText: cleaned text cut to 40 characters }.

cleanSiteName(name, siteNo): (1) apply text clean; (2) treat as missing (return null) if: empty, "unknown", equals siteNo digits, or matches /^[A-Za-z]{1,5}[-_]\d{3,6}$/ (stand-in pattern e.g. "gk-6261"); (3) remove leading siteNo digits followed by spaces or a hyphen; if now empty, treat as missing; (4) cut to 60 characters (57 + "..." if longer); (5) D1: town kept as-is.

buildOohTitle({ siteNo, siteName, outcome }):
1. normalisedNo = normaliseSiteNo(siteNo).
2. cleanedName = (normalisedNo is a string) ? cleanSiteName(siteName, normalisedNo) : null.
3. outcome: String(outcome ?? ''), strip one leading "[OOH] " prefix, collapse whitespace. An empty, null or undefined outcome becomes "OOH outcome" (never literal "undefined").
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
| T4 | siteNo "md-1110", siteName "md-1110" (stand-in) | stand-in normaliseSiteNo = null; [OOH] General issue captured |
| T5 | siteNo "6261", siteName "6261" (equals number) | name missing; [OOH] 6261 - General issue captured |
| T6 | siteNo "6261", siteName "6261 Wheatstone Inn" | number stripped; [OOH] 6261 Wheatstone Inn - ... |
| T7 | siteName with embedded line breaks and double spaces | collapsed to single spaces |
| T8 | siteNo "gk_7639" | normalised to "7639" |
| T9 | siteNo "GK-7639" | normalised to "7639" |
| T10 | siteNo " 7639 " | normalised to "7639" |
| T11 | siteNo null, siteName "Wheatstone Inn" | site part empty; name unused without siteNo |
| T12 | siteNo "" | same as T11 |
| T13 | siteNo "unknown" | null; same as T11 |
| T14 | siteNo null, siteName null, outcome "OOH query" | [OOH] OOH query |
| T15 | siteNo "6261", outcome starts "6202 ..." | site part NOT dropped (different digits) |
| T16 | siteNo "6261", outcome starts "6261" | no-double fires; site part dropped |
| T17 | siteNo "6261", outcome contains "E6261" mid-string | site part NOT dropped (only start checked) |
| T18 | outcome already starts "[OOH] " | prefix stripped; exactly one [OOH] in result |
| T19 | 300-char outcome, siteNo "6261", siteName "Wheatstone Inn (Gloucester)" | result exactly 150 chars ending "..."; site part whole |
| T20 | outcome null, then outcome undefined | both become "OOH outcome"; no literal "undefined" in title |

Additional assertions within the 20: a 90-character siteName is cut to 60; long dashes in outcome kept; buildOohTitle on its own output is idempotent.

Self-verify: npm run test:unit for ticket-title.test.js, all pass.

---

### WU2 -- createOutcomeTicket wiring (services/zendesk.js line 350) and route tests

**Import (one statement, covers both WU2 and WU3):**

  import { buildOohTitle, normaliseSiteNo } from './ticket-title.js';

Both symbols in one import. WU3 does not add a second import.

**Edits inside createOutcomeTicket:**

Before the live/test branch:
  const title = buildOohTitle({ siteNo, siteName, outcome: subject });

Test-mode return: add title field beside id and url.

Live-mode payload: replace the existing subject line with subject: title.

Live-mode return: add title field beside id and url.

Fields summary, detail, callerWords, tags, priority, custom_fields and the [TRG] comment body are untouched. The Tonight audit line (routes/api.js line 397) reads the raw subject from the request body before createOutcomeTicket is called and is not affected.

**test/oohdash-137-title.test.js (R1-R8):**

R1: flow outcome (siteNo "6261", siteName "Wheatstone Inn (Gloucester)", subject "External lighting not working - P1") -> title "[OOH] 6261 Wheatstone Inn (Gloucester) - External lighting not working - P1".

R2: control outcome (siteNo "7639", siteName "Black Bull (Corbridge)", subject "Setpoint lower -- sent, awaiting device confirmation") -> title "[OOH] 7639 Black Bull (Corbridge) - Setpoint lower -- sent, awaiting device confirmation". Long dash unchanged.

R3: createLateSyncTicket with null siteName (siteNo "7639") -> title "[OOH] 7639 - Late device confirmation -- IT700TX-025804FB".

R4: ambiguous-house-number path (siteNo "6261", siteName "Ambiguous (Black Bull / Red Lion)", subject "Ambiguous house ID 6261 -- caller could not be resolved to one site") -> title starts "[OOH] 6261 Ambiguous (Black Bull / Red Lion) - ". No-double does not fire (outcome starts "Ambiguous").

R5: raiseQuery with siteNo "6832" and looked-up siteName -> title "[OOH] 6832 Name - OOH query"; no "site 6832" substring.

R6: raiseQuery with siteNo null -> title "[OOH] OOH query".

R7 (source guard): fs.readFileSync of services/zendesk.js; regex for literal '[OOH] ' outside comment lines; zero matches.

R8: createOutcomeTicket in test mode for a capture outcome; the raw subject does not appear with a site prefix in the test-mode fixture subject field; the Tonight audit path is confirmed unaffected.

Self-verify: npm run test:unit for oohdash-137-title.test.js (R1-R8 only at this point), all pass.

---

### WU3 -- raiseQuery cleanup (services/zendesk.js lines 610-622)

**Exact edits:**

normaliseSiteNo is already imported from WU2. resolveSiteName is already defined in zendesk.js. Replace the opening of raiseQuery with:

  const norm = normaliseSiteNo(siteNo);
  const digits = (norm && typeof norm === 'string') ? norm : null;
  let resolvedName = null;
  if (digits) {
      const RESOLVE_TIMEOUT_MS = 2000;
      const timeoutP = new Promise(res => setTimeout(() => res(null), RESOLVE_TIMEOUT_MS));
      try {
          resolvedName = await Promise.race([resolveSiteName(digits), timeoutP]);
      } catch (_) {
          resolvedName = null;
      }
  }
  const summary = `OOH query${siteNo ? ` -- site ${siteNo}` : ''}`;
  return createOutcomeTicket({
      operator,
      siteNo: siteNo || 'unknown',
      siteName: resolvedName,
      subject: 'OOH query',
      summary,
      ...

**Latency bound:** resolveSiteName resolves from a 1-hour cache in the normal case (sub-millisecond). The 2-second cap covers a cold-cache Zendesk read that times out. Any hang beyond 2 seconds causes the timeout promise to win with null; the ticket is created with a number-only title and creation is not delayed beyond 2 seconds on this path.

**Additional tests (R9, R10) in test/oohdash-137-title.test.js:**

R9: resolveSiteName is stubbed to throw. raiseQuery with siteNo "6832" completes; returned title is "[OOH] 6832 - OOH query" (number-only, no name); ticket is created.

R10: resolveSiteName is stubbed to return a promise that never resolves. raiseQuery with siteNo "6832" completes within ~2200ms (2000ms timeout plus headroom); returned title is "[OOH] 6832 - OOH query". Test uses a real timer (not fake timer), since the timeout is a functional requirement not just an implementation detail.

Self-verify: npm run test:unit for oohdash-137-title.test.js (all R1-R10), all pass.

---

### WU4 -- Back-fill script, fixtures and tests

**scripts/backfill-ooh-titles.mjs:**

Imports config.js and ticket-title.js. Refuses to start unless DATA_MODE === 'live'.

**[TRG] cross-check fetch:** The Zendesk search API does not return comment bodies. The script fetches comments per ticket: GET /tickets/{id}/comments.json?sort_order=asc&per_page=5. It reads the body of the first comment and pattern-matches for "Site selected: NAME (SITENO)". If the pattern is not found: log { level: 'info', step: 'trg-parse', ticketId: id, result: 'not-found' }; use the site field alone. Rate-limit budget: up to N search results + N comment reads in dry-run; N + 8 PUTs + 8 read-backs in apply. Comment reads are spaced 500ms apart. PUTs are spaced 2 seconds apart.

**SKIP-monitoring-word rule:** check the CURRENT TITLE (the existing subject field as read from Zendesk) for the word "Monitoring" using /\bMonitoring\b/i. The check is on the raw current subject, not the not-yet-built new title. Since the new title is built by prepending the site to the current outcome text, a current title without "Monitoring" produces a new title without "Monitoring". The "Monitoring Tagging" trigger (21523886901916, active) adds the "monitoring" tag when the subject contains "Monitoring"; the SKIP prevents this from firing on any back-fill rename.

**Per-ticket planning rules (first match wins):**

1. SKIP-human-renamed: title does not start "[OOH] ".
2. SKIP-already-has-site: after "[OOH] " the title starts with the site number from source 1.
3. SKIP-p1: tagged ooh_p1 (D2).
4. SKIP-requester-updated: tagged updated_by_requester or updated_by_repairs_admin.
5. Derive siteNo: Zendesk site field 11405878329244 via normaliseSiteNo (source 1). Cross-check: first comment [TRG] "Site selected: NAME (SITENO)" line (source 2). If both exist and numbers differ: SKIP-site-mismatch. If neither exists: SKIP-no-site.
6. SKIP-monitoring-word: current subject (raw) matches /\bMonitoring\b/i.
7. Derive siteName: resolveSiteName(digits); if null, [TRG] name through cleanSiteName; if still none, number-only.
8. Build new title: buildOohTitle({ siteNo: digits, siteName, outcome: currentSubject.slice('[OOH] '.length) }).
9. RENAME.

**Apply safety (per ticket):**

Pre-apply: log { step: 'pre-apply', id, oldTitle, newTitle }.
Write rollback line to backfill-rollback-{timestamp}.json before the PUT.
Re-read ticket. If current subject != planned oldTitle -> SKIP-changed-since-plan.
PUT /tickets/{id}.json: { ticket: { subject: newTitle, safe_update: true, updated_stamp } }.
Post-apply read-back: re-read ticket. If subject matches newTitle -> log { step: 'verified', id }. If not -> log { step: 'verify-mismatch', id, expected, got } as WARN.
Print reconciliation summary: { renamed, verified, unverified }.
2-second gap between PUTs. On HTTP 429, wait Retry-After, retry once. Stop after 3 consecutive failures.
Copy rollback file to C:\harness-runs\iot-ooh-dash\ immediately after the script finishes (success or failure). Log the destination path.

**Updated_at and list ordering:** a subject-only PUT changes updated_at. The 8 renamed tickets will briefly appear at the top of views sorted by last updated. This is one-off and minor. No customer-visible notification fires (confirmed by trigger analysis, section 2).

**Zendesk audit log:** every subject change is recorded in the Zendesk native ticket audit log (edit history in the agent UI). This is the independent durable record for each change, separate from the rollback file.

**test/fixtures/ooh-open-tickets.json:** Exactly 16 ticket objects. Each object includes: id, subject, tags (array), custom_fields (array including site field 11405878329244), status, and a comments array (shaped as GET /tickets/{id}/comments response, first element containing the [TRG] note body with a "Site selected: NAME (SITENO)" line where applicable). These 16 tickets produce exactly 8 RENAME and 8 SKIP rows for B1 exact counts. The fixture counts are test expectations; actual counts at apply time will differ as tickets open and close.

**test/fixtures/ooh-backfill-edge-cases.json:** Additional rows: site-field and [TRG] numbers disagree (SKIP-site-mismatch); neither source has a site number (SKIP-no-site); tagged updated_by_requester (SKIP-requester-updated); current subject contains "Monitoring" (SKIP-monitoring-word); [TRG] pattern absent from first comment (structured log line emitted); stand-in siteName resolved to number-only title; changed-since-plan in apply path (SKIP-changed-since-plan).

**.gitignore additions:**

  backfill-plan-*.json
  backfill-rollback-*.json

These patterns do not match ooh-open-tickets.json or ooh-backfill-edge-cases.json.

**test/backfill-ooh-titles.test.js (B1-B6):**

B1: planning function on ooh-open-tickets.json with stubbed comment fetch: exactly 8 RENAME rows with the titles from DESIGN.md section 2, 4 SKIP-human-renamed, 2 SKIP-already-has-site, 2 SKIP-p1.

B2: apply with stubbed Zendesk client: rollback line written before PUT; post-apply read-back succeeds; reconciliation summary shows 1 renamed, 1 verified.

B3: apply where ticket subject changed since plan: no PUT, no rollback line, SKIP-changed-since-plan.

B4: apply where a single HTTP 429 is returned; Retry-After waited; PUT retried; success recorded.

B5: apply where 3 consecutive PUT failures halt the run; summary states failure count.

B6: rollback restores original title where current title equals new title; leaves alone a ticket whose title was changed again after apply.

Self-verify: npm run test:unit for backfill-ooh-titles.test.js, all pass.

---

## 6. Acceptance criteria map

| AC | Tests |
|---|---|
| T1-T20: title module rules | test/ticket-title.test.js (WU1) |
| R1-R4: all five creation routes correct title | test/oohdash-137-title.test.js (WU2) |
| R5-R6: raiseQuery title correct, no "site N" repeat | test/oohdash-137-title.test.js (WU3) |
| R7: source guard, no bare "[OOH] " in zendesk.js | test/oohdash-137-title.test.js (WU2) |
| R8: Tonight audit wording unchanged | test/oohdash-137-title.test.js (WU2) |
| R9: resolveSiteName throw -> number-only title, ticket created | test/oohdash-137-title.test.js (WU3) |
| R10: resolveSiteName hang -> 2s timeout -> number-only title, ticket created | test/oohdash-137-title.test.js (WU3) |
| B1-B6: back-fill planning, apply, rollback | test/backfill-ooh-titles.test.js (WU4) |
| E2E: full Playwright suite unchanged | Playwright suite (unmodified) |

---

## 7. Verification (Build runs before handoff)

1. npm run test:unit -- all 36 cases (T1-T20, R1-R10, B1-B6) green, zero failures.
2. npx playwright test -- single sequential run; no concurrent Playwright on this host. All existing specs green.
3. Self-audit:
   - grep '[OOH] ' services/zendesk.js returns zero hits outside comments.
   - .gitignore has backfill-plan-*.json and backfill-rollback-*.json (not backfill-*.json).
   - No credential, endpoint, or environment-specific value in any committed file.
   - buildOohTitle on its own output is idempotent (T18 covers this).
   - Long dashes in outcome unchanged (R2 covers this).
   - raiseQuery [TRG] first line uses summary not subject (R8 cross-check).

---

## 8. Code PR flow

The orchestrator opens the code PR from the build branch and merges it without a human gate (autonomous-merge rule for non-gate PRs). CI checks that must pass: "unit tests" and "e2e (playwright)" (both required by branch protection). Build branch targets main from base 2791351.

---

## 9. Release v1.4.4 and back-fill sequence

**Step 1 (Build): all 36 unit tests green, Playwright suite green, code PR merged to main, CI checks passed.**

**Step 2 (Release): cut v1.4.4.**
Run npm run release (patch) from clean main. Bumps package.json to 1.4.4, creates tag v1.4.4, writes release notes entry. Release notes: OOHDASH-137 (preference improvement), titles now include site number and pub name, raiseQuery simplified, back-fill script ships separately, no screen changes, rollback to v1.4.3.

**Step 3 (Deploy): deploy v1.4.4.**
Standard set-image deploy per CIR OOH_DASHBOARD_DEPLOY.md. Confirm pod is Running and liveness endpoint returns 200. If the deploy fails: redeploy v1.4.3 (code rollback); do not proceed to back-fill. Note: code rollback does NOT undo back-fill renames; those are independent paths.

**Step 4 (Dry run): run back-fill dry run.**
On the operator machine with CIR credentials/zendesk.env sourced:
  node scripts/backfill-ooh-titles.mjs
Print the table and save backfill-plan-{timestamp}.json. Show James the actual printed table. The counts will differ from today's 8/4/2/2 as tickets open and close between now and release day. James approves or rejects based on what he sees. Do not proceed without his explicit go.

**Step 5 (Trigger re-check, mandatory): re-list live triggers before --apply.**
List all active Zendesk triggers (one Zendesk API call or MCP call). Confirm no new active trigger notifies a person (requester, assignee, group or webhook to an alerting system) on a Change event from an agent without a comment. If such a trigger is found, stop and escalate to James before proceeding. This is a hard gate; it does not depend on memory of the previous trigger read.

**Step 6 (Pre-apply): send heads-up to Sam's team.**
James sends (or delegates) the following before applying:
  "Hi Sam, we are about to rename the open OOH tickets that still have generic subjects to include the site name and number. This is a one-off tidy-up for the new format that ships today. The tickets will briefly appear at the top of your updated-ticket view. No other changes. Open P1 tickets are not touched."
Adjust counts based on the Step 4 output.

**Step 7 (Apply): apply back-fill.**
Only after James's go, the trigger re-check is clean, and the heads-up is sent:
  node scripts/backfill-ooh-titles.mjs --apply --plan backfill-plan-{timestamp}.json
Expected: under 1 minute total. The rollback file (backfill-rollback-{timestamp}.json) is written during the run. Immediately after the script finishes, copy it to C:\harness-runs\iot-ooh-dash\ and log the destination path. Keep it there for 30 days. Never commit it.

**Step 8 (Release check): post-deploy verification.**
Create one test capture on the agreed live check site (7971 Shuttle and Loom (Darlington) unless James specifies another). Read its title in Zendesk. Confirm it matches "[OOH] N Name - outcome" (e.g. "[OOH] 7971 Shuttle and Loom (Darlington) - General issue captured"). Credentials: CIR credentials/zendesk.env.

---

## 10. Rollback

**Code rollback:** redeploy v1.4.3 image. New tickets go back to generic "[OOH] outcome" titles. This does NOT undo back-fill renames; the two are independent.

**Back-fill rollback:** run with the rollback file:
  node scripts/backfill-ooh-titles.mjs --rollback backfill-rollback-{timestamp}.json
Restores each ticket's original title where the current title still equals the applied new title. The Zendesk native ticket audit log (edit history in the agent UI) is the independent durable record.

---

## 11. Definition of done

- All 36 new unit tests pass (npm run test:unit).
- Full Playwright suite passes, zero new failures.
- Source guard (R7) passes.
- .gitignore has backfill-plan-*.json and backfill-rollback-*.json (not backfill-*.json).
- Code PR merged to main, CI checks green.
- v1.4.4 deployed, liveness endpoint 200.
- Trigger re-check completed at apply time (Step 5).
- Back-fill dry-run output shown to James before any apply.
- Heads-up sent to Sam's team before apply.
- Back-fill apply run only on James's explicit go.
- Rollback file copied to C:\harness-runs\iot-ooh-dash after apply.
- Post-deploy release check ticket confirmed in Zendesk.
- Handoff note lists every deviation from this plan, or states "none".

---

## 12. Open questions (carry to Test gate)

Q1-Design (Spencer): IoT Dashboard fires handleOohAutoEscalation on every webhook for an ooh_p1-tagged ticket. If a claim record is stale (TTL ~30 days), a later webhook on that ticket (not from the back-fill) could resend via the stale-reclaim path (ooh-escalation.js lines 464-493). Is that intended? STATUS: UNRESOLVED. Not blocking.

Q2-Design (anyone): Is 150 characters the right safety cap for Zendesk ticket titles? STATUS: DEDUCED. No action needed before build.
