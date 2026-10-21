<!-- gate:contract
TICKET: OOHDASH-137
PHASE: design
DATE: 2026-10-21
QUESTIONS:
Q1: Spencer - The IoT Support Dashboard runs its OOH P1 auto-alert on EVERY update to an open ticket tagged ooh_p1, not only on creation. If that ticket has no confirmed alert record (for example the alert was switched off when the ticket was created, or the record has expired after 30 days), any later edit, including a person renaming it, can send the P1 alert again. Is that intended? STATUS: UNRESOLVED (code facts PROVEN; not blocking - this design leaves P1 tickets out of the back-fill)
Q2: Anyone - Is 150 characters the right safety cap for a Zendesk ticket title? STATUS: DEDUCED (figure carried from discovery; Zendesk does not publish a hard limit we could find; the cap is defensive and no real title comes near it)

SECTION: What this change does
OOHDASH-137. Every Zendesk ticket the OOH dashboard creates will start with the site number and pub name, so Sam's team can see which site a ticket belongs to without opening it, and can merge same-site tickets quickly. Today a title reads "[OOH] General issue captured". After this change it reads "[OOH] 6186 George Inn (Bathampton) - General issue captured". This follows James's decisions at the discovery gate: number and name first, no area in the title, and a one-off rename of the tickets that are still open on release day. Only the ticket title changes. Tags, priority, the ticket's internal notes, the P1 route and everything the handler sees on screen stay exactly as they are.

SECTION: What the titles will look like
The pattern is "[OOH] number name - what happened". When the dashboard has no trustworthy pub name for the site, the title is "[OOH] number - what happened". If no site number was given at all (only possible when a handler raises a general query from the Tonight page without filling in the site), the title is "[OOH] OOH query". The pub name is the same cleaned name the dashboard already shows handlers, for example "Wheatstone Inn (Gloucester)". This design keeps the town in brackets, because there are many pubs with the same name (there are several Black Bulls) and the IoT team already include the town when they rename tickets by hand. James can choose to drop the town (decision D1). The "what happened" wording is not changed at all, including the long dashes some outcomes already use, because the IoT Support Dashboard reads the text before the first long dash to fill in the site line of its P1 alert.

SECTION: Where the code changes
Three small changes, all on the server. First, a new file holds one small function that builds the title from the site number, the pub name and the outcome wording. It has no other job and no outside connections, so it is easy to test. Second, the one place that creates every OOH ticket (createOutcomeTicket in services/zendesk.js, the line that today sets the subject to "[OOH] " plus the wording) calls that function instead. This one change covers flow outcomes, control outcomes, late device confirmations and the ambiguous-house-number capture. Third, "Raise a query" stops writing "- site 6832" into its own wording (which would otherwise show the site twice), tidies the site number the handler typed, and looks up the pub name from the dashboard's existing one-hour site list, so the query ticket gets the same title shape as every other ticket. The internal note on the query ticket keeps its current first line, so nothing that reads those notes is affected. No browser code changes.

SECTION: The title rules
The site number is checked first. It normally arrives as plain digits, for example "6261"; the code was traced for every route and none of them send the "gk_6261" form (that form only appears in Zendesk's own site field). To be safe, "gk_6261", "gk-6261", "GK 6261" and spaces around the number are all turned into "6261". A blank or "unknown" site means no site part at all. In the query route only, if the handler typed words rather than a number, those words (cut to 40 characters) are used in place of the number. The pub name is cleaned next: line breaks, tabs and repeated spaces are reduced to single spaces, and the name is treated as missing if it is blank, is just the site number, or is the stand-in the dashboard uses when it cannot find a real name (for example "gk-6261" or "md-1110"). That stand-in really does reach tickets today: open ticket 49665 shows "gk-5209" as its site name. A name that starts with its own number has that number removed, so we never get "6261 6261 Wheatstone Inn". Names are cut at 60 characters. If the wording already begins with the site number, nothing is added, so a title is never doubled. Finally the whole title is kept to 150 characters by shortening only the wording, ending with "...", never the site part. Characters such as the ampersand in "Shuttle & Loom" and accented letters are kept as they are.

SECTION: What does not change
The tags (ooh, ooh_p1, ooh_query, ooh_late_sync), priority, the ticket category, the site field and the internal [TRG] note are untouched. The P1 route in this dashboard is untouched: the P1 text is still built from the pub name, the number and the short summary, never from the ticket title. The IoT Support Dashboard finds OOH tickets by tag, not by title, so it keeps working; when it receives a new P1 ticket its alert's "Site" line will now actually contain the site, which is an improvement. The Tonight page's "What happened" column keeps the short wording: the code stores the wording before the title is built, and the Tonight page already has its own Site column. That corrects the discovery note, which expected the site to appear in that column. On a site's ticket list in the dashboard, new tickets will repeat that site's number and name in their titles. This matches what the IoT team's hand-renamed tickets already look like and needs no change. None of the 27 Zendesk triggers, 42 views or 4 automations depend on the "[OOH]" title start; the discovery checked all of these live.

SECTION: Back-fill of open tickets
A one-off script, scripts/backfill-ooh-titles.mjs, renames the OOH tickets that are still open on release day. It only runs when James says go at release. By default it changes nothing: it prints each ticket with its current title and the proposed new title, and saves that plan to a file. A second run with the apply option and that plan file makes the changes. The script finds tickets tagged ooh that are new, open, pending or on hold. It leaves these alone: any ticket the IoT team have already renamed (its title no longer starts with "[OOH] "); any that already start with the site number; any P1 ticket (see the risk section and decision D2); any with an "updated by requester" tag, because a Zendesk rule removes that tag on any staff edit and the ticket would drop out of the team's Customer Updated view; and any where the site cannot be worked out with certainty. The site number comes from the ticket's Zendesk site field (for example "gk_6186" gives 6186), checked against the "Site selected" line in the dashboard's own first note on the ticket. If the two disagree, or neither exists, the ticket is skipped and listed. The pub name comes from the same lookup the dashboard uses for new tickets, so old and new titles match. Before each change the script records the original title in a rollback file, and it re-reads each ticket so it never overwrites a title that someone changed after the plan was made. It makes one change every two seconds and waits when Zendesk says to slow down. It adds no comment to the tickets, because a comment would email the assignee. The live read today shows 16 open OOH tickets: 8 would be renamed, 4 have already been renamed by the IoT team, 2 already start with the site number and 2 are P1s that are left alone. Renaming a title on its own sends nothing to the requester: the only customer-update email rule needs a public comment, and these tickets are raised by the dashboard's service account in any case.

SECTION: Testing
A new unit test file checks the title function against every rule above: the normal case, a missing name, the "gk-6261" stand-in, a name that equals the number, a name that starts with the number, messy spacing and line breaks, every site number format, a blank or unknown site, words typed in the query site box, wording that already starts with the site, a device ID that happens to contain the site digits (it must still get the prefix), wording that already starts with "[OOH]", very long wording and very long names, an empty wording, long dashes kept as they are, and the ambiguous-site name. A second test creates tickets through each of the five routes in test mode and checks the title the dashboard would send to Zendesk, and checks that the Tonight page's wording stays short. A small code check confirms the live Zendesk request uses the built title. The browser (Playwright) tests do not need changing: they check the wording the browser sends, which this change does not touch, and the test-mode ticket keeps its existing wording field. The full suite must still pass. The back-fill is tested against a test-data file shaped like the 16 live open tickets, and must produce exactly the 8 renames and 8 skips above, with stubbed Zendesk calls for the apply and rollback runs.

SECTION: Cost and silent running
No AI is used, so no tokens are spent, and there is no new cost. Titles are built from information the dashboard already has. The query route's name lookup uses the existing one-hour site list, so at most one extra Zendesk read an hour. Nothing new runs in the background: no timer, no watcher, no service. The back-fill is a script a person runs once by hand. It makes about 16 Zendesk reads and 8 updates and finishes in under a minute. Both criteria are fully met.

SECTION: Risks and rollback
Risk 1: a renamed P1 ticket could send the on-duty manager's alert again. The IoT Support Dashboard re-checks open P1 tickets on every edit, and its alert switch is on in its deployment settings. If a P1 ticket has no confirmed alert record, a rename could page someone. The back-fill therefore leaves P1 tickets out (D2), and question Q1 asks Spencer whether this behaviour is intended. Risk 2: renamed tickets jump to the top of any view sorted by last update. This is minor, one-off and affects about 8 tickets. Risk 3: a wrong pub name. This is controlled by using the same lookup as new tickets, checking the site against two sources, and rejecting stand-in names. Rollback for the code is to redeploy the previous release, v1.4.3. Nothing is stored that needs undoing; new tickets simply go back to the old title. Rollback for the back-fill is to run the script with the rollback file. It restores each original title, but only where the title has not been changed again since.

SECTION: Decisions and open questions
Three decisions for James. D1: keep the town in brackets in the pub name (recommended) or drop it. D2: leave P1 tickets out of the back-fill (recommended) or rename them too. D3: the release number. Two questions came out of the research, listed exactly as written. Neither blocks Build.
Q1: Spencer - The IoT Support Dashboard runs its OOH P1 auto-alert on EVERY update to an open ticket tagged ooh_p1, not only on creation. If that ticket has no confirmed alert record (for example the alert was switched off when the ticket was created, or the record has expired after 30 days), any later edit, including a person renaming it, can send the P1 alert again. Is that intended? STATUS: UNRESOLVED (code facts PROVEN; not blocking - this design leaves P1 tickets out of the back-fill)
Q2: Anyone - Is 150 characters the right safety cap for a Zendesk ticket title? STATUS: DEDUCED (figure carried from discovery; Zendesk does not publish a hard limit we could find; the cap is defensive and no real title comes near it)

DECISION: Pub name in the title (D1) | Keep the town in brackets, e.g. "6261 Wheatstone Inn (Gloucester)" | Drop the town, e.g. "6261 Wheatstone Inn"
DETAIL: Keeping the town is recommended. Several pubs share a name, and the IoT team already include the town when they rename tickets by hand (for example "6202 - Horse & Groom (Writtle)"). It adds about 12 characters.

DECISION: P1 tickets in the back-fill (D2) | Leave open P1 tickets out (2 tickets today) | Rename them as well
DETAIL: Leaving them out is recommended until Spencer answers Q1, because renaming an open P1 could send the on-duty manager's alert again. Only 2 tickets are affected and they will close normally.

DECISION: Release number (D3) | Patch release v1.4.4 | Minor release v1.5.0
DETAIL: A patch release is recommended. The change only alters ticket titles on the server, plus a one-off script. There is no new screen or feature for handlers.
-->

# DESIGN - OOHDASH-137
## Site number and pub name in OOH Zendesk ticket titles

**Ticket:** OOHDASH-137 | **Live:** v1.4.3 | **Base:** origin/main bf1cd56 | **Date:** 2026-10-21
**Input:** docs/project/OOHDASH-137-DISCOVERY.md (gate PR #116, merged). James's binding decisions at that gate: Q1 number and name first, with a number-only fallback; Q2 no area in the title; Q3 back-fill of open tickets is in scope.
**Mockup:** none. This change has no screen. The only thing a person sees is the Zendesk ticket title, and section 2 gives the exact before and after titles taken from live tickets. The dashboard's own screens, and every click path a handler takes, are unchanged (section 5).

---

## 1. What the code does today (verified on bf1cd56)

Every OOH ticket is created by `createOutcomeTicket` in services/zendesk.js. The live request sets `subject: '[OOH] ' + subject` (line 350). In test mode (fixture), the ticket is kept in memory with the raw `subject` and no prefix (line 333).

| # | Route | Caller | siteNo arrives as | siteName arrives as | Title today |
|---|---|---|---|---|---|
| 1 | Flow outcomes | public/js/flows.js -> POST /api/outcomes (routes/api.js:346, 357) | `ws.site.siteNo`, which is the ThingsBoard site key: plain digits, e.g. "6261" (tb-device.js:1058) | the resolved pub name, OR the stand-in `${brand}-${siteNo}` such as "gk-6261" when unresolved (tb-device.js:1059, 1090) | [OOH] General issue captured |
| 2 | Control outcomes | public/js/control.js:270, 356, 402 -> same route | same, plain digits | same as route 1 | [OOH] Setpoint lower (long dash) sent, awaiting device confirmation |
| 3 | Late device confirmation | services/control.js:391, 420 -> `createLateSyncTicket` (zendesk.js:424) | `action.siteNo` from `site.siteNo` (control.js:127), plain digits; or `OohActionSiteNo` restored from the store (control.js:450) | `action.siteName`; can be null for a restored action | [OOH] Late device confirmation (long dash) IT700TX-025804FB |
| 4 | Raise a query | public/js/views.js:409 -> POST /api/query (api.js:488) -> `raiseQuery` (zendesk.js:610) | whatever the handler typed in "Site (if known)" (free text, "e.g. 6832"), or null, which becomes 'unknown' | not passed | [OOH] OOH query (long dash) site 6832 |
| 5 | Ambiguous house number | public/js/views.js:93 -> POST /api/outcomes | the ambiguous house number, digits | "Ambiguous (Black Bull / Red Lion)" | [OOH] Ambiguous house ID 6261 (long dash) caller could not be resolved to one site |

Route 5 was not listed in the discovery. It goes through the same function, so the single change point still covers it.

The "gk_7639" form seen in discovery is the value of Zendesk's site field (custom field 11405878329244). None of the five routes sends it as `siteNo` (PROVEN by code trace above). The helper still accepts it, to be safe and because the back-fill reads that field.

---

## 2. Before and after (live open tickets, read-only search 2026-10-21)

This document is ASCII only, so a long dash already in the wording is shown as `--`. The code keeps the real long dash.

| Ticket | Title today | Title after back-fill |
|---|---|---|
| 50703 | [OOH] General issue captured | [OOH] 6186 George Inn (Bathampton) - General issue captured |
| 50641 | [OOH] Setpoint lower -- sent, awaiting device confirmation | [OOH] 7971 Shuttle & Loom (Darlington) - Setpoint lower -- sent, awaiting device confirmation |
| 50639 | [OOH] Lighthouse gateway / equipment offline | [OOH] 6813 Lamb Inn (Rustington) - Lighthouse gateway / equipment offline |
| 50637 | [OOH] Heating complaint -- system performing to setpoint (IT700TX-025E29D3) | [OOH] 7639 Black Bull (Corbridge) - Heating complaint -- system performing to setpoint (IT700TX-025E29D3) |
| 50628 | [OOH] Setpoint raise -- sent, awaiting device confirmation | [OOH] 6813 Lamb Inn (Rustington) - Setpoint raise -- sent, awaiting device confirmation |
| 50621 | [OOH] Hot water issue - not resolvable remotely tonight | [OOH] 6107 Battle Axes (Elstree) - Hot water issue - not resolvable remotely tonight |
| 50567 | [OOH] Equipment group gateway offline -- main distribution board and heating unreachable | [OOH] 6770 Castle (Bristol) - Equipment group gateway offline -- main distribution board and heating unreachable (111 characters) |
| 50453 | [OOH] General issue captured | [OOH] 6145 Bulls Head (Chiswick) - General issue captured |

New tickets, by route:

| Route | Example title after the change |
|---|---|
| 1 Flow | [OOH] 6261 Wheatstone Inn (Gloucester) - External lighting not working -- P1 |
| 1 Flow, name unresolved | [OOH] 5209 - General issue captured (the stand-in "gk-5209" is rejected) |
| 2 Control | [OOH] 7639 Black Bull (Corbridge) - Setpoint raise -- sent, awaiting device confirmation |
| 3 Late sync, restored action without name | [OOH] 7639 - Late device confirmation -- IT700TX-025804FB |
| 4 Query with number | [OOH] 6832 Old Grey Mare - OOH query (name illustrative) |
| 4 Query, no site | [OOH] OOH query |
| 4 Query, words typed | [OOH] Black Bull Corbridge - OOH query |
| 5 Ambiguous | [OOH] 6261 Ambiguous (Black Bull / Red Lion) - Ambiguous house ID 6261 -- caller could not be resolved to one site |

Route 5 repeats the number because the browser's own wording contains it. This was left as it is on purpose, so that no browser code changes. It is rare and still clear.

With D1 set to "drop the town", the brackets are removed in the title only. The dashboard screens keep the full name.

---

## 3. Code change specification (for Build)

### 3.1 New module: services/ticket-title.js (pure, no imports)

Exports `buildOohTitle({ siteNo, siteName, outcome })`. It returns a string and never throws. Also export `normaliseSiteNo(raw)` and `cleanSiteName(name, siteNo)` so the back-fill script and the tests can use them.

Rules, in order:

1. **Text clean** (used on every input): `String(x ?? '')`, replace every control character (code points 0-31 and 127, including line breaks and tabs) with a space, collapse runs of spaces to one, then trim.
2. **siteNo** -> `normaliseSiteNo`:
   - cleaned value matches `^(?:[A-Za-z]{1,5}[-_ ]?)?(\d{3,6})$` -> the digits (covers "6261", "gk_6261", "gk-6261", "GK 6261", " 6261 ");
   - empty, or equal to "unknown" (any case) -> null;
   - anything else -> `{ freeText }`, the cleaned text cut to 40 characters. Only the query route can produce this.
3. **siteName** -> `cleanSiteName`: clean it, then treat it as missing if it is empty, equals "unknown", equals the siteNo digits, or matches the stand-in `^[A-Za-z]{1,5}[-_]\d{3,6}$`. Remove a leading `<siteNo>` followed by spaces and/or a hyphen. If the name is now empty, treat it as missing. Cut to 60 characters (57 plus "..."). Apply D1 here: if the town is to be dropped, remove one trailing ` (...)` group.
4. **outcome**: clean it, and remove one leading `[OOH]` and the spaces after it, so the function can be run twice safely. Empty becomes "OOH outcome". Do not change dashes or any other character in it.
5. **Site part**: digits plus (name ? ' ' + name : ''). With `freeText`, the site part is the free text. With no siteNo, the site part is empty (the name is not used without a number, because a name alone is not checked).
6. **No double site**: if the outcome starts with the siteNo digits followed by a non-digit or the end of the text, the site part is dropped. Only the START of the wording is checked. A device ID that happens to contain the digits (for example "...E6261") must still get the prefix.
7. **Join**: `'[OOH] ' + (sitePart ? sitePart + ' - ' : '') + outcome`. The separator is the ASCII " - ".
8. **Cap**: if the result is longer than 150 characters, shorten only the outcome so that the total is exactly 150, ending in "...". The site part and the "[OOH] " prefix are never cut.

### 3.2 services/zendesk.js - createOutcomeTicket

- At the top: `const title = buildOohTitle({ siteNo, siteName, outcome: subject });`
- Live request: `subject: title` (replaces the existing `[OOH] ${subject}`).
- Test-mode ticket: add the field `title` next to the existing `subject`, and leave `subject` unchanged. Existing displays and e2e tests read `subject`.
- Return `{ id, url, title }` in both modes. The extra field is additive. The browser ignores it.
- `summaryLine`, the [TRG] body, tags, priority and custom fields are unchanged.

### 3.3 services/zendesk.js - raiseQuery

- `const norm = normaliseSiteNo(siteNo);`
- If `norm` is digits: `siteName = await resolveSiteName(norm)`. This reuses the 1-hour cache, returns null in test mode, never throws, and needs no new external call when the cache is warm.
- Title wording (`subject`) becomes the plain `'OOH query'`.
- `summary` keeps today's text exactly (`OOH query (long dash) site N`, or `OOH query`), so the first line of the [TRG] note is unchanged.
- Pass to createOutcomeTicket: `siteNo` = the digits, or the handler's raw text, or 'unknown' (as today, so the site-field lookup and the data-quality note behave as before); `siteName`; `subject: 'OOH query'`. When the handler typed words, pass the cleaned words through so rule 2 uses them.
- routes/api.js /query audit line (`Query raised: ...`) is unchanged.

### 3.4 Unchanged on purpose

createLateSyncTicket (it already passes siteNo and siteName), routes/api.js /outcomes (the audit `detail` is built from the raw `subject` at api.js:397, so the Tonight page "What happened" column keeps the short wording), escalation.js (the P1 text is built from siteName, siteNo and the summary), and all browser code.

---

## 4. Back-fill script: scripts/backfill-ooh-titles.mjs

**Run:** with live Zendesk settings in the environment (the same variables the app reads through config.js; `DATA_MODE=live`). The script refuses to start in any other mode.

**Modes:**

| Command | Effect |
|---|---|
| `node scripts/backfill-ooh-titles.mjs` | Dry run (the default). Reads the tickets, prints `id / action / old title / new title`, writes `backfill-plan-<timestamp>.json`. No writes to Zendesk. |
| `... --apply --plan <file>` | Applies only the RENAME rows in that plan. Each row is re-checked first. |
| `... --rollback <file>` | Puts back the original titles from a rollback file. |

**Selection:** Zendesk search `type:ticket tags:ooh status<solved`, read page by page. This covers new, open, pending and on hold.

**Per-ticket outcome (the first rule that matches wins):**

| Action | Rule |
|---|---|
| SKIP-human-renamed | title does not start with "[OOH] " (e.g. 50626, 50071, 49665, 50076) |
| SKIP-already-has-site | after "[OOH] " the title starts with the site number (e.g. 50069, 50030, and anything already in the new format) |
| SKIP-p1 | tagged ooh_p1 (D2; e.g. 50701, 50697) |
| SKIP-requester-updated | tagged updated_by_requester or updated_by_repairs_admin |
| SKIP-no-site | the site cannot be derived (see below) |
| SKIP-site-mismatch | the two site sources disagree |
| SKIP-monitoring-word | the new title would contain the word "Monitoring" (the "Monitoring Tagging" trigger would add a tag) |
| RENAME | otherwise; new title = `buildOohTitle({ siteNo, siteName, outcome: old title minus "[OOH] " })` |

**Site source, stated precisely:**
1. siteNo: Zendesk site field 11405878329244, value such as `gk_6186`, passed through `normaliseSiteNo`. This field is set by the dashboard on every ticket it creates (zendesk.js:345).
2. Cross-check: the ticket's first comment (the dashboard's [TRG] note), line `Site selected: <name> (<siteNo>)`. If both sources exist and their numbers differ -> SKIP-site-mismatch. If the field is empty, the [TRG] number is used alone. If neither exists -> SKIP-no-site.
3. siteName: `resolveSiteName(siteNo)`, the same lookup new tickets use. If that returns null, use the [TRG] name, passed through `cleanSiteName` (so "gk-5209" is rejected). If there is still no name, the number-only title is used.

**Apply safety:**
- Before each update, write `{ OohBackfillTicketId, OohBackfillOldSubject, OohBackfillNewSubject, OohBackfillAppliedAt }` to `backfill-rollback-<timestamp>.json` (one JSON object per line, written immediately).
- Re-read the ticket. If the title is no longer the planned old title -> SKIP-changed-since-plan.
- Send the update as `PUT /tickets/{id}.json` with `{ ticket: { subject, safe_update: true, updated_stamp } }`, so Zendesk rejects the write if anyone edited the ticket in between. Subject only: no comment, no tags, no status.
- Make one write every 2 seconds. On HTTP 429, wait for the time in Retry-After, then retry once. Stop after 3 failures in a row. Finish with a summary of how many were renamed, skipped and failed.
- Rollback restores a title only where the current title still equals the new title.

**What a subject-only update by the service account fires (all 27 triggers read live 2026-10-21):**

| Trigger | Fires? | Effect |
|---|---|---|
| Notify Customer of Ticket Update | No | needs a public comment |
| Notify requester and CCs of received request / proactive incident / proactive Alarm / Internal Response | No | creation only |
| Notify assignee of comment update | No | needs a comment to be present (the condition value "not_relevant" means a comment of either kind is present; DEDUCED from Zendesk condition rules) |
| Notify assignee of assignment | No | the assignee does not change |
| Agent Update - Remove Customer Updated Tag | Yes | removes updated_by_requester; handled by SKIP-requester-updated |
| Customer Update - Add Customer Updated Tag | No | the service account is an agent (it writes internal notes, which end users cannot) |
| Monitoring Tagging | Only if the title contains "Monitoring" | handled by SKIP-monitoring-word |
| Combi Oven OOH / 00 - Set Manual Override Tag Early | No | they need "Combi Oven / Water Usage / OOH" in the title |
| IoT Dashboard - Push Ticket Updates | Yes | the IoT Support Dashboard updates its cached title (server.js:3700-3711). For an open ooh_p1 ticket it also re-runs the P1 auto-alert (server.js:3740-3750); handled by SKIP-p1 and Q1. |

No email or notification goes to the requester. PROVEN for the trigger list; the "not_relevant" meaning is DEDUCED.

---

## 5. Test plan

| Id | File | What it proves |
|---|---|---|
| T1-T19 | test/ticket-title.test.js (new) | Every rule in 3.1, one case each: normal; null name; stand-ins "gk-6261" and "md-1110"; name equal to the number; name starting with the number; spaces, tabs and line breaks; "gk_7639", "GK-7639", " 7639 "; null, "" and "unknown"; free text "Black Bull Corbridge"; wording already starting "6202 - Horse & Groom"; device ID containing the digits still gets the prefix; wording already starting "[OOH]"; a 300-character wording gives exactly 150 characters ending "..." with the site part whole; a 90-character name is cut to 60; empty wording becomes "OOH outcome"; long dash kept; "Ambiguous (A / B)" kept; running the function on its own output gives the same title. |
| R1-R6 | test/oohdash-137-title.test.js (new, test mode) | `createOutcomeTicket` for routes 1, 2 and 5 returns the expected `title`; `createLateSyncTicket` with a null name gives the number-only title; `raiseQuery(op, '6832', ...)` returns a title starting "[OOH] 6832" with no "site 6832" repeat; `raiseQuery(op, null, ...)` returns "[OOH] OOH query"; the [TRG] first line of the query note is unchanged; the test-mode ticket `subject` is unchanged. |
| R7 | same file | A source check, in the style of notes-coverage-guard.test.js: the live request in createOutcomeTicket sets `subject: title`, and no other `'[OOH] '` string is left in zendesk.js. |
| R8 | same file | The Tonight audit `detail` for a capture outcome equals the raw wording (no site prefix). |
| B1-B6 | test/backfill-ooh-titles.test.js (new) | The planning function, run on test/fixtures/backfill-open-ooh.json (16 tickets shaped like the live read, with subjects, tags, site field and [TRG] lines), gives exactly 8 RENAME (the titles in section 2), 4 SKIP-human-renamed, 2 SKIP-already-has-site, 2 SKIP-p1. Extra fixture rows cover: mismatch, no site, requester-updated, the Monitoring word, and a stand-in name. With a stubbed Zendesk client: the rollback line is written before the PUT; changed-since-plan is skipped; a 429 is waited out and retried; 3 failures in a row stop the run; rollback leaves alone a ticket whose title was changed again. |
| E2E | full Playwright suite, unchanged | Must pass with no edits. The tests check the wording the browser sends (for example oohdash-134-other-p1.spec.js:73), and this change does not alter it. The test-mode `subject` is unchanged. |
| Release check | manual, after deploy | Create one test-mode-equivalent capture on the live test site agreed with James and read its title in Zendesk. Then run the back-fill dry run and show James the plan before any apply. |

---

## 6. Data dictionary (fields this change touches)

| Name | Meaning | Where | Sensitivity / retention |
|---|---|---|---|
| OohTicketTitle | The full Zendesk ticket subject built by `buildOohTitle` | Zendesk ticket `subject`; returned as `title` by createOutcomeTicket | Business data (pub name, number); kept as long as the ticket |
| OohTicketOutcomeSubject | The short wording from the flow or control screen (the existing `subject` field in the request body) | POST /api/outcomes body; audit `detail`; test-mode `subject` | Unchanged |
| OohTitleSiteNo | The site number after `normaliseSiteNo` (digits only) | title building only | Not stored separately |
| OohTitleSiteName | The pub name after `cleanSiteName` | title building only | Not stored separately |
| OohBackfillTicketId / OohBackfillOldSubject / OohBackfillNewSubject / OohBackfillAppliedAt | One rollback record per renamed ticket | backfill-rollback-<timestamp>.json on the machine that ran the script | No personal data. Kept 30 days after release, then deleted. Never committed (add `backfill-*.json` to .gitignore). |

---

## 7. Cost, silent running, and size of the work

- **Tokens and money:** none. There is no AI anywhere in the change. The query route may make at most one extra cached Zendesk read an hour. The back-fill is about 16 reads and 8 writes, once.
- **Background running:** none added. There is no timer, watcher or service. The back-fill runs by hand, in the foreground, once.
- **Build size:** about half a day. One small new module, two edits in zendesk.js, one script, three test files, one fixture file and one .gitignore line.
- **Benefit:** Sam's team can see which site a ticket belongs to in lists and in the merge picker, without opening it. This removes the hand-renaming they do today (for example 50633, 50626 and 50071).

---

## 8. Risks and rollback

| Risk | Likelihood | Control |
|---|---|---|
| A back-filled P1 ticket sends the alert again through the IoT Support Dashboard | Low, but serious if it happens | SKIP-p1 (D2); Q1 to Spencer |
| A wrong pub name in a title | Low | the same lookup as new tickets; the two-source site check; stand-in names rejected |
| Back-fill overwrites a title someone has just edited | Low | re-read before writing, plus `safe_update` |
| Renamed tickets jump up views sorted by last update | Certain, minor | one-off, about 8 tickets |
| Zendesk rate limiting (already seen live) | Medium | 2-second pacing; Retry-After respected; stops after 3 failures |
| Titles get longer in the dashboard's site ticket list | Certain, cosmetic | the list already cuts long titles with "..." (views.js:231) |

**Rollback:** for the code, redeploy v1.4.3. There is no stored data or setting to undo. For the back-fill, run `--rollback <file>`.

---

## 9. Handoff to Build

- Build in this order: the module from 3.1 and its tests, then the createOutcomeTicket change, then raiseQuery, then the script, its fixture and its tests.
- Load-bearing details that must not be flattened: the site part is never cut; long dashes in the wording are kept (the IoT Support Dashboard splits on them); the [TRG] note and the Tonight wording are unchanged; the back-fill adds no comment and leaves out P1 tickets unless D2 says otherwise.
- The back-fill apply runs only on James's explicit go at release, after he has seen the dry-run plan.
- Open flags: Q1 (Spencer) and Q2 (the length cap). Route 5 keeps a repeated number, on purpose.
