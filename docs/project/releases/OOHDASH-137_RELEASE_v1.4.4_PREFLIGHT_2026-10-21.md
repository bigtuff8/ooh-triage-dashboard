<!-- gate:contract
TICKET: OOHDASH-137
PHASE: release-preflight
DATE: 2026-10-21
VERSION: 1

SECTION: What ships in v1.4.4
OOHDASH-137, patch release v1.4.4. Every Zendesk ticket the OOH dashboard creates will
carry the site number and pub name at the start of its subject, so Sam's team can see
which site a ticket belongs to in the Zendesk list and the merge picker without opening
it. A title that today reads "[OOH] General issue captured" will read "[OOH] 6186 George
Inn (Bathampton) - General issue captured". The town stays in brackets (D1 decided at
design gate). P1 tickets are left out of the one-off back-fill (D2 decided at design
gate). Release is a patch, v1.4.4 (D3 decided at design gate).

There is no screen change and no browser code change. The work is entirely server-side:
services/ticket-title.js (new pure module), two small edits in services/zendesk.js, and
scripts/backfill-ooh-titles.mjs (the one-off back-fill script, runs separately after
deploy). Tests: 37 new unit tests (T1-T20, R1-R10, B1-B6 plus edge-case supplement).
The full suite is 472 unit tests (471 pass, 1 pre-existing skip), 163 Playwright e2e
(161 pass, 2 pre-existing skips), all passing on build/oohdash-137 head d4288e1 per
BUILD_COMPLETE.md.

POSTURE UNCHANGED: WRITES_DISABLED false since 2026-09-24, SMS_PROVIDER log by design.
No new env vars, no secrets, no data migration.

SECTION: Pre-flight checks run 2026-10-21
Read-only checks were run today before this document was authored.

Live healthz: version 1.4.3, writesDisabled false, bridge.healthy true, bridge.lastError
null, zendesk healthy, zendesk configured, store cosmos healthy, activeAlerts empty.
Status field reads "degraded" because thingsboardRead is "unknown". This is the
documented cold-start artefact (CIR OOH_DASHBOARD_DEPLOY.md): thingsboardRead
initialises "unknown" each pod start and only flips to "healthy" after the first
successful site read; the health probe does not flip it, so a freshly restarted pod
always shows "degraded" briefly. bridge.healthy is true and lastError is null, so there
is no real fault to investigate before releasing. This is not a hold.

Live image (rollback reference): apitechhub.azurecr.io/ooh-dashboard:a075b5e
(git tag v1.4.3, confirmed running as the single live pod today).

Note: RELEASE_NOTES.md was not updated when v1.4.3 was cut (2026-10-20 release commit
a0e559d did not touch it). The v1.4.4 RELEASE_NOTES.md entry goes at the top of the
file above v1.4.2. The v1.4.3 gap is an observation; it is not a hold on this release.

Code PR #119 (branch build/oohdash-137, head d4288e1) is not yet merged. This preflight
is authored in parallel with the test gate. The release must not proceed until PR #119
is merged, CI is green, and the Test-RESULTS gate is approved.

SECTION: Preconditions before cut
1. Code PR #119 merged to main, all CI checks green.
2. Test-RESULTS gate approved (docs/project/oohdash-137-test/TEST-RESULTS.md).
3. James's go on D-137-TIMING (see DECISION below).
4. Working tree on C:\repos\ooh-triage-dashboard clean, synced to updated main
   (release.sh guard enforces this).

SECTION: Release steps
After all preconditions are met: npm run release (= scripts/release.sh patch) from
C:\repos\ooh-triage-dashboard. The script checks main is clean and in sync, records
the live image as rollback reference, bumps package.json to 1.4.4, creates tag v1.4.4,
pushes main and the tag, builds the image in ACR from a git archive context (not the
repo dir -- avoids .claude/worktrees WinError 3), runs kubectl set image (env and
resources untouched), waits for rollout, polls healthz. The single pod restarts; every
signed-in handler must sign in again.

The script will warn that writesDisabled is not true. This is correct and expected
(value is false today). Stop only if the value has changed from today's live reading.

After the cut: update RELEASE_NOTES.md v1.4.4 entry with the actual release commit
reference; attach evidence to Jira OOHDASH-137.

Back-fill runs after deploy, not during it. See section 6 and 7.

SECTION: Post-deploy smoke
1. Within 60 seconds of pod ready: curl https://ooh.airedale-group.io/healthz.
   Expect version 1.4.4, writesDisabled false, bridge.healthy true, lastError null.
   "degraded" on thingsboardRead is acceptable (cold-start artefact as above).
2. Read new pod logs explicitly (resolve the new pod name -- the terminating pod emits
   ECONNRESET noise). Expect clean boot and [TB] start-up read probe ok.
3. Title check: create one fixture-mode (DATA_MODE=fixture) or live test capture on
   site 7971 (Shuttle and Loom, Darlington). Read its Zendesk subject via the API.
   Expect: "[OOH] 7971 Shuttle and Loom (Darlington) - <outcome wording>".
   Do not submit any live P1 in production for this check.
4. If the title check shows the old format "[OOH] <outcome>" without the site prefix,
   stop and investigate before proceeding to back-fill.

SECTION: Back-fill sequence (Step 4 through Step 8 per BUILD_PLAN.md section 9)
The back-fill is a separate step after deploy. None of these steps run automatically.

Step 4 (dry run): source CIR credentials/zendesk.env, then:
  node scripts/backfill-ooh-titles.mjs
This prints a table of every open OOH ticket with its current subject and the proposed
new subject, writes backfill-plan-{timestamp}.json. The fixture-equivalent table is
shown in section 8 of this document as a format reference; the actual counts will differ
because tickets open and close. James approves or rejects the actual printed table.
Do not proceed without his explicit go.

Step 5 (trigger re-check, mandatory before --apply): re-list all active Zendesk triggers
and confirm no new active trigger notifies a person on a Change event from an agent
without a comment. This gate does not rely on memory of the earlier trigger analysis;
re-verify live. If a new notifying trigger is found, stop and escalate to James.

Step 6 (heads-up to Sam's team): James sends (or explicitly delegates) the message
drafted in section 9 of this document before --apply.

Step 7 (apply): only after James's go, trigger re-check clean, and heads-up sent:
  node scripts/backfill-ooh-titles.mjs --apply --plan backfill-plan-{timestamp}.json
Expected run time under 1 minute (one change per 2 seconds, ~8 renames). The rollback
file (backfill-rollback-{timestamp}.json) is written during the run. Immediately after
the script finishes, copy it to C:\harness-runs\iot-ooh-dash\ and note the path.
Keep it there for 30 days. Never commit it to the repo.

Step 8 (read-back): read the Zendesk subject of one renamed ticket (any from the plan)
via the API. Confirm it matches the expected "[OOH] N Name - outcome" pattern.

SECTION: Rollback -- code
Triggers (operator decides; release doer never rolls back automatically):
- Pod CrashLoopBackOff or OOMKilled.
- healthz version does not advance to 1.4.4 within 3 minutes of rollout completion.
- bridge.healthy false with non-null lastError persisting more than 60 seconds.
- New ticket titles do not carry the site prefix (post-smoke title check fails).

Do NOT roll back on: "degraded" with thingsboardRead "unknown" and lastError null
(cold-start artefact); the writesDisabled script warning (expected, value is false);
terminating-pod ECONNRESET log noise.

Rollback command:
  export KUBECONFIG=~/.kube/ooh.yaml
  kubectl -n iot-services set image deployment/ooh-dashboard \
    ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:a075b5e
  kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=180s
  curl -s https://ooh.airedale-group.io/healthz   (expect version 1.4.3)

Code rollback does NOT undo back-fill renames; they are independent.

SECTION: Rollback -- back-fill
Use the rollback file copied to C:\harness-runs\iot-ooh-dash\:
  node scripts/backfill-ooh-titles.mjs \
    --rollback C:\harness-runs\iot-ooh-dash\backfill-rollback-{timestamp}.json
Restores each ticket's original subject only where the current subject equals the applied
new subject. If a ticket has been renamed again since apply, that ticket is skipped and
logged. The Zendesk native ticket audit log (edit history in the Zendesk agent UI) is
the independent durable record of every subject change.

Back-fill rollback does NOT revert the code. The two rollbacks are independent and
either can be run alone.

SECTION: Security scan -- staged diff
Commits 42fc43b through d4288e1 on build/oohdash-137 were reviewed for
credential-shaped content. New files: services/ticket-title.js (pure string functions,
no imports), scripts/backfill-ooh-titles.mjs (reads Zendesk creds from process.env,
never hardcoded), test files and fixtures (synthetic ticket data, no secrets),
.gitignore additions. No new env var declaration, no secret reference, no connection
string, no token, no key. The Zendesk credentials are sourced at runtime from
process.env (which the back-fill runbook fills from CIR credentials/zendesk.env
before running -- never committed). No change to Dockerfile, k8s, package.json
scripts section, or any configuration file. The release commit itself changes only
package.json version fields and RELEASE_NOTES.md.

DECISION: D-137-TIMING: When should the release and back-fill run? | Release now, back-fill in the same session (recommended for quiet hours) | Release now, back-fill later when Sam confirms the team is clear | Hold to a quiet period
DETAIL: Release now, back-fill in the same session (recommended for quiet hours) | Running both together during an out-of-hours quiet period minimises the window between code deploy and title fix. The single pod restarts, signing out all handlers; running during quiet hours avoids disruption. Sam's heads-up should be sent before the back-fill apply step even at quiet hours.
DETAIL: Release now, back-fill later when Sam confirms the team is clear | The code ships and new tickets immediately get the correct title format. The back-fill of the existing 8 open tickets can wait until Sam's team confirms a good moment. The rollback file must be kept safe in the interim.
DETAIL: Hold to a quiet period | Zero disruption during active shifts. The back-fill and release both wait. Open tickets continue to have generic subjects until then.
-->

# Release preflight -- OOHDASH-137 (v1.4.4)

**Date:** 2026-10-21
**Release:** v1.4.4 (patch on live v1.4.3)
**Ships from:** main (after PR #119 merges)
**Live now:** v1.4.3, image apitechhub.azurecr.io/ooh-dashboard:a075b5e (git tag v1.4.3)
**Rollback image:** apitechhub.azurecr.io/ooh-dashboard:a075b5e
**Repo (canonical, cut from here):** C:\repos\ooh-triage-dashboard
**Cut command (post-approval only):** npm run release (= bash scripts/release.sh patch)
**Authored by:** Release doer, 2026-10-21. Nothing has been bumped, built, pushed or deployed. This is the plan only.

---

## 1. What ships

### 1.1 Version

| Item | Value |
|---|---|
| Current live version | 1.4.3 (healthz 2026-10-21) |
| Target version | 1.4.4 |
| Bump type | patch (npm version patch inside scripts/release.sh) |
| Git tag created by script | v1.4.4 |
| Rollback image (before cut) | apitechhub.azurecr.io/ooh-dashboard:a075b5e |

### 1.2 Change summary (PR #119, build/oohdash-137, commits 42fc43b..d4288e1)

| File | Change |
|---|---|
| services/ticket-title.js | New. Pure module. Exports buildOohTitle, normaliseSiteNo, cleanSiteName. No outside connections. |
| services/zendesk.js | createOutcomeTicket: calls buildOohTitle to build the Zendesk subject; live PUT now carries subject: title. raiseQuery: adds 2s timeout on resolveSiteName; simplifies the subject to the built title. Both return paths expose a title field. |
| scripts/backfill-ooh-titles.mjs | New. One-off back-fill script. DATA_MODE guard inside main(). Exports planBackfill, applyBackfill, rollbackBackfill for test injection. Never commits secrets. |
| test/ticket-title.test.js | New. 20 unit cases (T1-T20). |
| test/oohdash-137-title.test.js | New. 10 route-level, source-guard, Tonight audit, and error-path cases (R1-R10). |
| test/backfill-ooh-titles.test.js | New. 7 tests (B1-B6 plus edge-case supplement). |
| test/fixtures/ooh-open-tickets.json | New. 16 synthetic tickets matching the live read. |
| test/fixtures/ooh-backfill-edge-cases.json | New. 7 edge-case rows. |
| .gitignore | +2 lines: backfill-plan-*.json, backfill-rollback-*.json. |

No changes to: browser code (flows.js, app.js, views.js, styles.css), routes/api.js,
Dockerfile, k8s/deployment.yaml, package.json scripts, any configuration file.

### 1.3 Deviations from build plan (per BUILD_COMPLETE.md)

D1 -- T4 expected value had a documentation error; implementation is correct.
D2 -- _setQueryResolver hook added to zendesk.js for R9/R10 ESM test injection; production-neutral.
D3 -- 37 new unit tests vs plan's 36; extra edge-case supplement test in backfill suite.
D4 -- rollback write order: B3 was authoritative; re-read before writing rollback line.
D5 -- DATA_MODE guard moved inside main() so test imports work cleanly.
None of these deviations change the production behaviour described in the design.

### 1.4 Posture (unchanged)

| Setting | Value | Note |
|---|---|---|
| WRITES_DISABLED | false | Device control live since 2026-09-24; set image cannot change env. |
| SMS_PROVIDER | log | By design; paging done by IoT Support dashboard on P1 tickets. |
| New env vars or secrets | none | |
| Manifest, schema, Cosmos shape | no change | |

---

## 2. Gate lineage

| Stage | Ticket | Reference |
|---|---|---|
| Design | OOHDASH-137 | docs/project/oohdash-137-design/DESIGN.md (PR #117) |
| Build plan | OOHDASH-137 | docs/project/oohdash-137-build-plan/BUILD_PLAN.md (PR #118) |
| Build | OOHDASH-137 | PR #119, branch build/oohdash-137, head d4288e1 -- NOT YET MERGED |
| Test | OOHDASH-137 | docs/project/oohdash-137-test/TEST-RESULTS.md -- gate running in parallel |

Release is BLOCKED until PR #119 merges, CI is green, and the Test-RESULTS gate is approved.

---

## 3. Preflight checks (read-only, run 2026-10-21)

| # | Check | Result |
|---|---|---|
| P1 | Live healthz version | 1.4.3 -- PASS |
| P2 | healthz writesDisabled | false -- PASS (expected; unchanged throughout) |
| P3 | healthz bridge.healthy | true -- PASS |
| P4 | healthz bridge.lastError | null -- PASS |
| P5 | healthz zendesk | healthy and configured -- PASS |
| P6 | healthz store | cosmos healthy -- PASS |
| P7 | healthz status | degraded (thingsboardRead "unknown") -- NOTE: cold-start artefact; not a fault (see note below) |
| P8 | healthz activeAlerts | empty -- PASS |
| P9 | Live image (rollback reference) | apitechhub.azurecr.io/ooh-dashboard:a075b5e -- recorded |
| P10 | Code PR #119 merged and CI green | PENDING -- release blocked until this is confirmed |
| P11 | Test-RESULTS gate approved | PENDING -- release blocked until approved |
| P12 | RELEASE_NOTES.md v1.4.4 entry | Present in this preflight commit (date TBD until cut) |
| P13 | Working tree clean on canonical checkout | Confirmed by release.sh guard at cut time |

Note on P7 -- "degraded" is not a pre-release concern for this patch. Per CIR
OOH_DASHBOARD_DEPLOY.md: thingsboardRead initialises to "unknown" on every pod start
and only becomes "healthy" after the first successful site read; the liveness probe does
not flip it. A pod restarted since its last handler session shows "degraded" on
thingsboardRead while bridge.healthy is true and lastError is null. This is the same
behaviour documented in the v1.3.8 release section of OOH_DASHBOARD_DEPLOY.md. The
check to hold on is a persisting non-null lastError for more than 5 minutes; that is
not present.

---

## 4. Release steps (post-approval only)

From C:\repos\ooh-triage-dashboard in Git Bash. Prerequisites: az login,
KUBECONFIG=~/.kube/ooh.yaml (deployer-ooh context).

1. Confirm PR #119 is merged to main and all CI checks are green.
2. Confirm the Test-RESULTS gate is approved.
3. Confirm James has given go on D-137-TIMING.
4. Confirm the rollback image is in ACR:
   az acr repository show-tags -n apitechhub --repository ooh-dashboard \
     --orderby time_desc --output table
   (expect v1.4.3 and a075b5e to appear)
5. If releasing during a shift, warn on-shift handlers of the pod restart (see section 9).
6. Pull main to get the merged PR #119 commits; confirm clean, in-sync tree.
7. Cut:
   npm run release
   The script checks guards, prints the rollback reference (expect a075b5e), bumps and
   tags v1.4.4, pushes main and the tag, builds in ACR from git archive (avoids
   .claude/worktrees WinError 3), runs kubectl set image, waits for rollout, polls
   healthz.
8. Expected script warning "writesDisabled is NOT true" -- correct; value is false.
   Stop only if value has changed from today's live reading.
9. Run the smoke plan (section 6).
10. Run the back-fill sequence (sections 7 and 8) once smoke passes.
11. Update RELEASE_NOTES.md v1.4.4 entry with the actual release commit reference;
    attach evidence to Jira OOHDASH-137.

If the tag push is rejected but the main push and ACR build succeeded, re-push the tag
from the canonical checkout. Never force.

---

## 5. Rollback -- code

Triggers (operator decides; release doer does not roll back automatically):

- Pod CrashLoopBackOff or OOMKilled.
- healthz version does not reach 1.4.4 within 3 minutes of rollout completion.
- bridge.healthy false with non-null lastError persisting more than 60 seconds after pod ready.
- New ticket titles do not carry the site prefix (smoke title check fails after pod ready).

Do NOT roll back on: "degraded" with thingsboardRead "unknown" and lastError null
(cold-start artefact); the writesDisabled warning from the script; ECONNRESET noise
from the terminating pod.

Rollback sequence:

  export KUBECONFIG=~/.kube/ooh.yaml
  kubectl -n iot-services set image deployment/ooh-dashboard \
    ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:a075b5e
  kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=180s
  curl -s https://ooh.airedale-group.io/healthz   (expect version 1.4.3)
  kubectl -n iot-services logs deploy/ooh-dashboard --tail=20

After rollback: v1.4.4 tag and commit stay on main; a forward fix ships as v1.4.5.
No history rewriting. Code rollback does NOT undo back-fill renames; those are
independent. Any Zendesk ticket created while v1.4.4 was live keeps its enriched title.

---

## 6. Post-deploy smoke

| # | Step | Pass condition |
|---|---|---|
| S1 | Within 60s of pod ready: curl -s https://ooh.airedale-group.io/healthz | version 1.4.4, writesDisabled false, bridge.healthy true, lastError null ("degraded" on thingsboardRead acceptable) |
| S2 | Pod log check (resolve new pod name explicitly before reading) | Clean boot; [TB] start-up read probe ok; no crash or repeated errors |
| S3 | Title smoke on site 7971 (Shuttle and Loom, Darlington): create a fixture-mode or live test capture and read its Zendesk subject | Subject starts "[OOH] 7971 Shuttle and Loom (Darlington) - " followed by the outcome wording |
| S4 | Verify raiseQuery unchanged path still works | No regression; "OOH query" subject format intact |

Stop and do not proceed to back-fill if S3 fails (title still in old format).

---

## 7. Back-fill sequence

None of these steps run automatically. All live Zendesk calls are prohibited until the
code and smoke are confirmed green. No dry-run against live before code deploy.

Step 4 -- Dry run (no writes to Zendesk):

  cd C:\repos\ooh-triage-dashboard
  source "C:/Users/james/OneDrive - Airedale Catering Equipment/Projects/Work/\
    Central Integration Repository/credentials/zendesk.env"
  node scripts/backfill-ooh-titles.mjs

This prints the table to stdout and writes backfill-plan-{timestamp}.json. Show James
the actual printed table. The counts in the table will differ from today's fixture
counts (tickets open and close). Section 8 of this document shows the fixture-equivalent
table as a format reference only.

James's explicit go is required before proceeding to Step 5. If he rejects any row,
stop and investigate that row before proceeding.

Step 5 -- Trigger re-check (mandatory; does not rely on memory of earlier analysis):

List all active Zendesk triggers:

  curl -s "https://theairedalegroup.zendesk.com/api/v2/triggers/active.json" \
    -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq ".triggers[] | {id, title}"

Confirm no new active trigger notifies a person (requester, assignee, group or alerting
webhook) on a Change event from an agent without a comment. If such a trigger is found,
stop and escalate to James before proceeding.

Step 6 -- Heads-up to Sam's team (see Sam message draft in section 9).

Step 7 -- Apply (only after James's go, trigger re-check clean, heads-up sent):

  node scripts/backfill-ooh-titles.mjs \
    --apply --plan backfill-plan-{timestamp}.json

Expected: under 1 minute. One rename per 2 seconds, pause on 429. The rollback file
backfill-rollback-{timestamp}.json is written during the run.

Immediately after completion: copy the rollback file to C:\harness-runs\iot-ooh-dash\
and note the full path. Keep it for 30 days. Never commit it to the repo.

Step 8 -- Read-back one renamed ticket:

  curl -s "https://theairedalegroup.zendesk.com/api/v2/tickets/{id}.json" \
    -u "$ZENDESK_EMAIL/token:$ZENDESK_API_TOKEN" | jq ".ticket.subject"

Confirm the subject matches "[OOH] N Name - outcome" pattern.

---

## 8. Back-fill dry-run fixture reference (format illustration only)

These rows are from the fixture file (test/fixtures/ooh-open-tickets.json) as of the
build gate. The real dry-run output will differ. This table shows the expected title
format, not the expected counts at release day.

Renames expected from fixture (8 rows):

  50703  [OOH] General issue captured
           --> [OOH] 6186 George Inn (Bathampton) - General issue captured

  50641  [OOH] Setpoint lower -- sent, awaiting device confirmation
           --> [OOH] 7971 Shuttle and Loom (Darlington) - Setpoint lower -- sent,
               awaiting device confirmation

  50639  [OOH] Lighthouse gateway / equipment offline
           --> [OOH] 6813 Lamb Inn (Rustington) - Lighthouse gateway / equipment offline

  50637  [OOH] Heating complaint -- system performing to setpoint (IT700TX-025E29D3)
           --> [OOH] 7639 Black Bull (Corbridge) - Heating complaint -- system
               performing to setpoint (IT700TX-025E29D3)

  50628  [OOH] Setpoint raise -- sent, awaiting device confirmation
           --> [OOH] 6813 Lamb Inn (Rustington) - Setpoint raise -- sent, awaiting
               device confirmation

  50621  [OOH] Hot water issue - not resolvable remotely tonight
           --> [OOH] 6107 Battle Axes (Elstree) - Hot water issue - not resolvable
               remotely tonight

  50567  [OOH] Equipment group gateway offline -- main distribution board and
          heating unreachable
           --> [OOH] 6770 Castle (Bristol) - Equipment group gateway offline -- main
               distribution board and heating unreachable

  50453  [OOH] General issue captured
           --> [OOH] 6145 Bulls Head (Chiswick) - General issue captured

Skips from fixture (8 rows):

  50626  SKIP-already-has-site  (subject starts with site number)
  50071  SKIP-already-has-site  (subject starts with site number)
  50069  SKIP-already-has-site  (subject includes siteNo)
  50030  SKIP-already-has-site  (subject includes siteNo)
  49665  SKIP-human-renamed     ([OOH] prefix absent; custom title by IoT team)
  50076  SKIP-human-renamed     ([OOH] prefix absent; custom title by IoT team)
  50701  SKIP-p1                (tagged ooh_p1; excluded by D2)
  50697  SKIP-p1                (tagged ooh_p1; excluded by D2)

---

## 9. Handler and team communications

### 9a. On-shift handler warning (before pod restart, if releasing during a shift)

"Quick heads-up: the OOH dashboard is updating in the next few minutes. You will be
signed out for about a minute while it restarts. Sign back in when you see the login
screen. Nothing changes about how you use the dashboard."

### 9b. Sam heads-up (before back-fill apply, Step 6)

(For James to send to Sam Day before running --apply. Adjust counts based on the
actual Step 4 dry-run output.)

"Hi Sam,

We are about to do a one-off tidy-up of the open OOH tickets. We have just shipped an
update so that new OOH tickets automatically include the site number and pub name in
their subject (e.g. "[OOH] 7971 Shuttle and Loom (Darlington) - Setpoint lower").

As part of the release we are renaming the existing open tickets that still have generic
subjects to match the new format. There are around 8 tickets to rename. They will
briefly appear at the top of your updated-ticket view as they are processed. It will
finish in under a minute.

Open P1 tickets are not touched. No comments are added to any ticket, so no one will
get an email from this.

Let me know if you have any questions."

---

## 10. RELEASE_NOTES.md v1.4.4 entry (to insert above v1.4.2 after cut)

The full text of the entry appears in the worktree at RELEASE_NOTES.md. After the
release commit, replace "TBD" with the actual release date and the actual release
commit sha.

---

## 11. Rollback -- back-fill (independent of code)

If the back-fill produced wrong titles or the apply was run by mistake:

  node scripts/backfill-ooh-titles.mjs \
    --rollback C:\harness-runs\iot-ooh-dash\backfill-rollback-{timestamp}.json

The script restores each ticket's original subject only where the current subject still
equals the applied new subject. Tickets renamed again by a person since the apply are
logged as skipped. The Zendesk native ticket audit log (ticket history in the agent UI)
is the independent durable record of every subject change regardless.

Back-fill rollback does not change the code or the image. Run it standalone if needed
even after a code rollback.

---

*Authored by Release doer, 2026-10-21. Nothing has been bumped, built, pushed or deployed.*
