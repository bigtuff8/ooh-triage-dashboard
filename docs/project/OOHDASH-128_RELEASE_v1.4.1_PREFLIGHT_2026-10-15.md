<!-- gate:contract
SECTION: What ships in v1.4.1
This is a patch release moving the live OOH Dashboard from v1.4.0 to v1.4.1. One ticket ships: OOHDASH-128.

OOHDASH-128 fixes a site-load bug: older-convention bare-salus thermostats (named gk_{sitename}_salus_{serial} (NNNN-L-n)) were never loaded into the site workspace because normaliseName() strips the parenthetical before applying the site filter (^gk-NNNN). The fix adds a supplementary ThingsBoard bracket-text lookup (textSearch=(NNNN-) run in parallel with the existing token queries inside fetchLiveSitesByNumber. Results are deduped by device ID, with token-query results taking precedence. A device is accepted if the existing anchored filter passes OR isLegacySalusForSite() confirms it belongs to the target site. The lookup fails soft: a bracket-fetch error is caught, logged as a console.warn, and returns an empty array so the token path is unaffected.

74 sites that have at least one bare-salus thermostat now load those devices correctly. The Bar/Restaurant area was previously missing at site 5191 (a total-failure site); it is now resolved. Site 5791 r-2 (a no-bracket bare-salus device with no parenthetical at all) remains absent and is deferred to OOHDASH-129 (design decision D2). The Area reading line gains two new variants ("the only reporting zone" / "coldest of N reporting zones"), and a "some heating units are not reporting" note appears when any device in an area is offline. A D3 footnote appears for legacy units that cannot be matched to any area, keeping the unmapped-area fallback chip for iT500 devices. Four new paragraphs were added to the OOHDASH-113 handler support guide.

Token fetches inside fetchLiveSitesByNumber now run in parallel (all token + bracket fetches via Promise.all, rather than sequential for-loops). This is a non-regressive improvement over the build plan's IIFE approach. The realistic concurrency increase is negligible (max 3 concurrent requests per site load: 2 token + 1 legacy, with a 30-second per-site cache), but TB 429s should be watched in pod logs immediately after deploy.

Nothing else changes. No environment variables, secrets, Cosmos schema, Kubernetes manifest, or write-path are altered. WRITES_DISABLED stays false; device control and SMS settings are untouched by the release script.

SECTION: Pre-flight checks run 2026-10-15
All checks run read-only on the worktree at origin/main 3fc9ba0, which is the merged result of OOHDASH-128 build (PR #102, merge 06c330e) and test (PR #103, merge 3fc9ba0).

Unit tests (npm run test:unit): 411 pass, 1 skip, 0 fail (412 total). The one skip is the pre-existing IOT_REPO_PATH drift check in notes-coverage-guard.test.js (requires a sibling repo directory absent on any build machine). All 20 OOHDASH-128 unit tests (U1-U12, C1-C8) pass.

Full Playwright e2e suite (npx playwright test): 150 pass, 2 skip, 0 fail (152 total, duration 4.4 min). The two skips are TF-18 and TF-19 in tests/tester/oohdash-119.tester.spec.js (fixture site has no control tile; pre-existing, unaffected by this ticket). All 6 OOHDASH-128 e2e tests (E1-E6) pass.

Exploratory fixture-mode run (desktop 1280x900 and mobile 390x844): 11 of 11 checks pass. D3 (area-unmapped chip absent when only legacy salus present) confirmed. No horizontal scroll at 390px.

OQ6 live read-only spot-check against portal.lhlive.co.uk (JWT auth, no writes): 5 of 5 sites pass. Site 5694: 6 older units found, zero foreign devices. Site 5204: 6 older units (including malformed z-1), zero foreign devices, "520" / "52040" anti-bleed confirmed. Site 5788: 6 older units (including 1-s code), zero foreign devices. Site 5191: 1 older unit (f-2, Accommodation) found; also 1 modern device present in TB (not present during discovery sweep). Site 5791: 1 older unit (z-1) found; D2 deferred no-bracket units absent as expected. Cross-site guard clean across all five sites.

Live site baseline (https://ooh.airedale-group.io/healthz, read 2026-10-15): version 1.4.0, status ok, writesDisabled false, bridge.healthy true, bridge.lastError null. No active alerts. Device control has been live since 2026-09-24 (OOHDASH-19).

Current live image: apitechhub.azurecr.io/ooh-dashboard:a093a72 (git tag v1.4.0, release commit on main).

No new process.env reads, no new k8s secret fields, no new k8s manifest changes, no Cosmos container shape changes. The only new third-party network call is the bracket textSearch to the same ThingsBoard endpoint already used for all other device queries.

RELEASE_NOTES.md: a v1.4.1 entry was added at the top of RELEASE_NOTES.md by the build doer (WU12). It has "Date: TBD" pending the actual release date. After the cut, update the date and the branch reference to main at the release sha; no other edits are needed.

SECTION: Release steps
The release is cut with one command after this plan is approved. All commands run from C:\repos\ooh-triage-dashboard (the canonical checkout, NOT a worktree) in Git Bash with az logged in (ACR Task Runner) and KUBECONFIG set to ~/.kube/ooh.yaml (deployer-ooh).

Step 1: confirm the rollback image is present in ACR before starting. Run az acr repository show-tags -n apitechhub --repository ooh-dashboard --orderby time_desc --output table and confirm v1.4.0 and a093a72 are listed.

Step 2: verify the working tree in C:\repos\ooh-triage-dashboard is clean. git status --porcelain must return nothing. If stray files appear, use .git/info/exclude for local-only scratch files. The script refuses to run on a dirty tree.

Step 3: confirm synced main. git switch main && git fetch origin && git status -sb must show main...origin/main with no ahead/behind count and HEAD at 3fc9ba0.

Step 4: if releasing during an active OOH shift, warn agents. The single pod restarts during rollout and any signed-in handler must sign in again.

Step 5: cut the release. Run bash scripts/release.sh patch. The script in order: checks you are on main with a clean synced tree; prints the current live image as the rollback reference (must read apitechhub.azurecr.io/ooh-dashboard:a093a72); runs npm version patch to commit "release v1.4.1" and tag v1.4.1; pushes main and the tag to origin; builds the image in ACR via az acr build tagged with both the new short sha and v1.4.1 and latest; runs kubectl -n iot-services set image then rollout status --timeout=180s; prints WRITES_DISABLED and SMS_PROVIDER; polls /healthz for the new version.

Note on transient tag-push reject: git push origin v1.4.1 occasionally receives a transient rejection (GitHub protection race or ACR Tasks timing). If the tag push step fails, the main push and ACR build have already succeeded. Manual recovery: git push origin v1.4.1 from the canonical checkout. The release commit is already on main; only the tag is missing.

Step 6: expected script warning. The script will warn "writesDisabled is NOT true". This is correct and expected. Device control has been live since 2026-09-24 (OOHDASH-19); WRITES_DISABLED is false and set image cannot change it. Only stop if writesDisabled reads anything other than false.

Step 7: resource drift check. After rollout, run kubectl -n iot-services get deployment ooh-dashboard -o jsonpath='{.spec.template.spec.containers[0].resources}'. Expected: requests cpu 100m / memory 192Mi, limits cpu 500m / memory 512Mi. If different, apply: kubectl -n iot-services set resources deployment/ooh-dashboard -c ooh-dashboard --requests=cpu=100m,memory=192Mi --limits=cpu=500m,memory=512Mi.

Step 8: health check. curl -s https://ooh.airedale-group.io/healthz must show "version":"1.4.1", "status":"ok", "writesDisabled":false, bridge.healthy:true, bridge.lastError:null. If the version still reads 1.4.0, wait for rollout and retry; do not redeploy.

Step 9: pod log check. kubectl -n iot-services get pods -l app=ooh-dashboard then kubectl -n iot-services logs <new-pod-name> --tail=40. Confirm a clean boot with a [TB] start-up read probe line. Watch specifically for any 429 Rate Limit responses in the first 60 seconds (parallel fetches increased concurrency slightly; see 429 assessment in the smoke plan). Ignore ECONNRESET noise from the terminating old pod; always resolve the new pod name explicitly before reading the log.

Step 10: run the post-release smoke plan (section 6 of this document).

Step 11: record. Update the RELEASE_NOTES.md entry at the top of the file: replace "Date: TBD" with the actual release date and update the branch reference to "main at <release-sha>". Attach evidence screenshots to Jira OOHDASH-128.

SECTION: Rollback
Trigger criteria for rollback (operator decision -- the release doer never rolls back automatically):

- /healthz shows bridge.healthy:false with a non-null lastError and this persists more than 60 seconds after the new pod is ready, AND ThingsBoard is otherwise reachable from other paths. This would indicate the new parallel bracket fetch broke the bridge latch.
- The pod enters CrashLoopBackOff or OOMKilled state.
- /healthz version does not advance to 1.4.1 within 3 minutes of rollout completion.
- Any site loads zero devices where v1.4.0 loaded devices (a regression, not an improvement). Check a non-salus site first (see smoke plan S5) to distinguish fix-related behaviour from a broader regression.

Do NOT roll back on: bridge.healthy:false with lastError:null within the first 30 seconds (normal pre-probe boot window); the expected "writesDisabled is NOT true" script warning; a single TB 429 warn in pod logs that does not repeat (the parallel fetch assessment found negligible concurrency increase); legacy Salus devices appearing in the workspace for the first time (that is the fix).

Exact rollback sequence:

    export KUBECONFIG=~/.kube/ooh.yaml
    kubectl -n iot-services set image deployment/ooh-dashboard \
        ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:a093a72
    kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=180s
    curl -s https://ooh.airedale-group.io/healthz
    # expect version 1.4.0, writesDisabled false

After rollback: the v1.4.1 git tag and release commit stay on main. A forward fix ships as v1.4.2. No history rewriting or force-push. No data to undo: OOHDASH-128 adds read requests only; no Zendesk comments or Cosmos writes are involved in the fix.

Resource drift check after rollback: repeat the resources verify step from the Release Steps section. The same set resources command applies if values do not match 100m/192Mi requests and 500m/512Mi limits.

SECTION: Security check -- staged diff scan
The OOHDASH-128 diff (build PR #102 + test PR #103) was scanned for credential-shaped content before the Test gate was raised. Findings: none. No connection string, token, password, API key, or secret-shaped literal appears in any changed file. The new textSearch parameter passes a bracket prefix (e.g., "(5694-") not a credential. The ThingsBoard JWT credential is read from the existing ooh-dashboard-secrets environment variable (TB_PASSWORD), unchanged. No new process.env reads were added. This artefact itself contains no secrets.

SECTION: Smoke plan (S1-S5)
Perform immediately after step 9. All checks are READ-ONLY. Do not issue any control command during smoke. Capture screenshots at each step and attach to Jira OOHDASH-128.

S1 (orchestrator, within 60s of pod ready): curl -s https://ooh.airedale-group.io/healthz. Pass: "version":"1.4.1", "status":"ok", bridge.healthy:true, bridge.lastError:null, writesDisabled:false. Also check subsystems.thingsboard.read -- a brief "unknown" on the 60-second TTL cycle is acceptable (OOHDASH-124 territory, not a failure here).

S2 (orchestrator): pod log check. kubectl -n iot-services get pods -l app=ooh-dashboard then kubectl -n iot-services logs <new-pod-name> --tail=40. Pass: clean boot line, [TB] start-up read probe: ok in Nms. Note: watch for any "429 Too Many Requests" warn lines in the first 60 seconds. One or two transient 429s are informational only (the parallel fetch assessment rated the concurrency increase as negligible). Persistent 429s (more than 5 in 60 seconds) warrant investigation before proceeding.

S3 (James): sign in and confirm site 5694 (Wheatstone Inn or equivalent). Navigate to Heating. Pass: at least 6 older Salus devices visible in the workspace -- specifically, the Bar/Restaurant area should show entries. Check the area reading line for "the only reporting zone" or "coldest of N reporting zones" variants. Check that no devices from site 5204 or other sites appear (cross-site bleed guard). This is the primary OOHDASH-128 fix confirmation in production.

S4 (James): confirm sites 5204 (malformed z-1 unit) and 5788 (1-s code unit). Pass: older Salus devices appear in Heating. For 5204: confirm the z-1 unit appears and no "520" or "52040" device IDs are present. For 5788: the 1-s unit appears. Optionally confirm site 5191 (now has both a modern and an older f-2 device; f-2 should appear). For site 5791: z-1 should appear; r-2 will remain absent (deferred to OOHDASH-129, expected and correct).

S5 (James): open one non-salus site (e.g. a site with only salusit700 or Tuya devices) and confirm the workspace and Heating area are unchanged. Pass: device list identical to pre-release behaviour; no legacy-salus noise; area chips and reading lines unaffected. This is the regression guard.

If S1 shows bridge.healthy:false with a non-null lastError: examine pod logs for the error text before treating as a defect. A transient TB 429 at restart time does not set lastError (the fail-soft catch returns an empty array). A genuine failure records a "Start-up read probe failed:" prefix.

SECTION: Accepted known behaviours and follow-up
D2 deferred (OOHDASH-129): site 5791 r-2 and any bare-salus device with no parenthetical at all cannot be loaded by Option A. These remain absent from the workspace. This is an accepted design decision confirmed at the discovery gate and carried verbatim through all subsequent gates.

OQ7 (non-blocking, owner James): 18 older-unit devices whose bracket contains no parseable site number (placeholder codes, JWTEST-R1, empty bracket) cannot be loaded by Option A or any subsequent code change without data fixes. Does not block release. Candidate for OOHDASH-129 triage or a separate data clean-up ticket.

OQ8 (non-blocking, owner James): a printed or PDF copy of the OOHDASH-113 handler guide may have been issued and may need regenerating after the G1-G4 edits (four new paragraphs: "Some heating units are not reporting", "If nothing in the area is reporting", a not-reporting row in the reachability table, and a new FAQ item for the unmatched-area footnote). Does not block release.

429 post-release watch: the parallel fetch change is a non-regressive improvement that increases maximum concurrent ThingsBoard requests from 1 to 3 per site load. With 11 live users and a 30-second per-site cache, realistic concurrency is negligible. The OQ6 live spot-check observed no 429 responses across 5 sites. Monitor pod logs for the first 30 minutes post-deploy; persistent 429s (more than 5 in 60 seconds) are an investigation trigger but not an automatic rollback trigger unless they cause device-load failures.

DECISION: D-128-TIMING: When should this release run? | Release in quiet hours (out of hours, not during an active OOH shift) -- recommended: the single pod restarts during rollout and forces every signed-in handler to sign in again; the fix is a read-path improvement with no urgency that would justify a mid-shift disruption | Release now and warn on-shift handlers first via the usual channel | Hold pending further review
-->

# Release preflight -- OOHDASH-128 (v1.4.1)

**Date:** 2026-10-15
**Release:** v1.4.1 (patch on live v1.4.0)
**Ships from:** `main` @ `3fc9ba0` -- contains OOHDASH-128 build (PR #102, merge 06c330e) and test (PR #103, merge 3fc9ba0)
**Live now:** v1.4.0, image `a093a72` (git tag `v1.4.0`), https://ooh.airedale-group.io
**Repo:** `C:\repos\ooh-triage-dashboard`
**Cut command (post-approval only):** `bash scripts/release.sh patch`
**Authored by:** Release doer. This document is the plan only. Nothing has been bumped, built, pushed, or deployed.

---

## 1. What ships

### 1.1 Version

| Item | Value |
|---|---|
| Current live version | 1.4.0 (confirmed via /healthz 2026-10-15) |
| Target version | 1.4.1 |
| Bump type | patch (npm version patch inside scripts/release.sh) |
| Git tag created by script | v1.4.1 |
| Image tags | ooh-dashboard:<new short sha>, ooh-dashboard:v1.4.1, ooh-dashboard:latest |

### 1.2 OOHDASH-128 -- Legacy bare-salus thermostat load fix

Five production files changed. No k8s manifests, no config, no Cosmos, no secrets.

| File | Change |
|---|---|
| services/tb-device.js | legacySalusSiteNo(rawName), isLegacySalusForSite(rawName, siteNo), fetchTbDevicesForText(textSearch) added. fetchLiveSitesByNumber gains a parallel bracket-text lookup (textSearch=(NNNN-) deduped by device ID, fail-soft on error). Token fetches now run in parallel via Promise.all. |
| public/js/flows.js | isUnplacedLegacySalus(d), unplacedLegacySalus() added. hasUnmappedHeating exclusion of unplaced salus (D3). Footnote (heating-unplaced-note) for unmatched legacy units. Area reading line gains "only reporting zone" / "coldest of N reporting zones" variants. Area-not-reporting note (area-not-reporting-note) shown when nOff > 0. |
| docs/bau-support/OOHDASH-113-handler-guide.html | Four new paragraphs: G1 "Some heating units are not reporting", G2 "If nothing in the area is reporting", G3 not-reporting table row, G4 FAQ item for unmatched-area footnote. |
| data/data-dictionary.json | 7 new rows in Derived device fields section. |
| RELEASE_NOTES.md | v1.4.1 entry added at top (Date: TBD -- update after cut). |

Seven test files added or revised (not in the image): test/legacy-salus-guard.test.js, test/legacy-salus-flows.test.js, tests/oohdash-128-legacy-salus.spec.js (all new), plus fixture additions.

### 1.3 Design decisions carried through

| Code | Decision |
|---|---|
| D2 | No-paren bare-salus devices (site 5791 r-2) deferred to OOHDASH-129. |
| D3 | Footnote only for unplaced legacy units; iT500 unmapped-area chip preserved. |
| D4 | Patch bump (v1.4.1). |

### 1.4 Accepted known behaviours

| Code | Description |
|---|---|
| D2 deferred | Site 5791 r-2 and any no-parenthetical bare-salus device remain absent until OOHDASH-129. |
| OQ7 (non-blocking) | 18 devices with no parseable site number in bracket (placeholder / JWTEST-R1 / empty bracket). Cannot be fixed by code alone; requires data fixes. Owner: James. |
| OQ8 (non-blocking) | OOHDASH-113 handler guide PDF/print copy may need regenerating after G1-G4 edits. Owner: James. |

---

## 2. Gate lineage

| Stage | Ticket | Reference |
|---|---|---|
| Discovery | OOHDASH-128 | PR #99 -- docs/project/oohdash-128-discovery/DISCOVERY.md |
| Design | OOHDASH-128 | PR #100 -- docs/project/oohdash-128-design/DESIGN.md |
| Build plan | OOHDASH-128 | PR #101 -- docs/project/OOHDASH-128_LEGACY_SALUS_LOAD_BUILD_PLAN_2026-10-14.md |
| Build | OOHDASH-128 | PR #102 -- merge 06c330e, branch build/oohdash-128-legacy-salus-load |
| Test | OOHDASH-128 | PR #103 -- merge 3fc9ba0, branch test/oohdash-128-legacy-salus |

---

## 3. Preflight checks (run 2026-10-15, read-only on origin/main 3fc9ba0)

| # | Check | Result |
|---|---|---|
| P1 | origin/main HEAD matches target commit | PASS. git log origin/main -1 = 3fc9ba0 Merge pull request #103 from bigtuff8/test/oohdash-128-legacy-salus. Build (PR #102, 06c330e) and test (PR #103, 3fc9ba0) both present on main. |
| P2 | Working tree clean (release.sh guard) | Checked in worktree only. Before running release.sh from C:\repos\ooh-triage-dashboard, verify git status --porcelain returns nothing. If stray files exist use .git/info/exclude. The script refuses to run on a dirty tree. |
| P3 | Unit suite on origin/main 3fc9ba0 (npm run test:unit) | PASS. 411 pass, 1 skip, 0 fail (412 total, 5.5s). Skip: IOT_REPO_PATH drift guard in notes-coverage-guard.test.js (pre-existing, no sibling repo on build machine). All 20 OOHDASH-128 unit tests (U1-U12, C1-C8) pass. |
| P4 | Full Playwright e2e suite on origin/main 3fc9ba0 (npx playwright test) | PASS. 150 pass, 2 skip, 0 fail (152 total, 4.4 min). The two skips are TF-18 and TF-19 in tests/tester/oohdash-119.tester.spec.js (fixture site has no control tile; pre-existing). All 6 OOHDASH-128 e2e tests (E1-E6) pass. |
| P5 | Exploratory fixture-mode run | PASS. 11 of 11 checks pass (desktop 1280x900 and mobile 390x844). D3 (area-unmapped chip absent when only legacy salus present) confirmed. No horizontal scroll at 390px. |
| P6 | OQ6 live read-only spot-check | PASS. 5 of 5 sites (5694, 5204, 5788, 5191, 5791) clean. Zero foreign devices across all five sites. Anti-bleed for "520" vs "5204" confirmed. Site 5191 f-2 loads alongside a modern iT500 now present in TB. Site 5791 z-1 loads; r-2 absent as expected (D2 deferred). |
| P7 | Live site baseline | PASS. /healthz 2026-10-15: version 1.4.0, status ok, writesDisabled false, bridge.healthy true, bridge.lastError null. No active alerts. |
| P8 | Rollback image confirmed | PASS. Live image apitechhub.azurecr.io/ooh-dashboard:a093a72 is the v1.4.0 release commit (git tag v1.4.0). Rollback target is this exact image. |
| P9 | New env vars or secrets | NONE. All new functions use the existing TB read credential from ooh-dashboard-secrets. No new process.env reads. No new k8s secret fields. The textSearch parameter is a string constant derived from the site number at call time. |
| P10 | Manifest / schema / data migration | NONE. No changes to k8s/deployment.yaml, Dockerfile, or Cosmos container shape. |
| P11 | RELEASE_NOTES.md entry | PRESENT. v1.4.1 entry added at top of RELEASE_NOTES.md by build doer (WU12). Date field reads "TBD" -- update to actual release date after the cut. Branch reference reads build/oohdash-128-legacy-salus-load -- update to main at <release-sha> after the cut. |
| P12 | package.json version | "version": "1.4.0". scripts/release.sh patch will advance this to 1.4.1 and commit "release v1.4.1". |

---

## 4. Release steps (post-approval only)

All commands from C:\repos\ooh-triage-dashboard in Git Bash. Prerequisites: az login (ACR Task Runner), KUBECONFIG=~/.kube/ooh.yaml (deployer-ooh).

1. **Confirm the rollback image is in ACR:** az acr repository show-tags -n apitechhub --repository ooh-dashboard --orderby time_desc --output table -- should list v1.4.0 and a093a72.

2. **Verify the working tree is clean:** git status --porcelain must return nothing. Address any stray files with .git/info/exclude. Do not stage or commit anything that does not belong in the release.

3. **Confirm synced main:** git switch main && git fetch origin && git status -sb -- must show ## main...origin/main with no ahead/behind count, HEAD at 3fc9ba0.

4. **Warn agents if on shift.** The single pod restarts during rollout; any signed-in handler must sign in again.

5. **Cut:** bash scripts/release.sh patch. In order the script:
   - checks main, clean tree, synced with origin;
   - prints the current live image as rollback reference (must read apitechhub.azurecr.io/ooh-dashboard:a093a72);
   - runs npm version patch -- commits "release v1.4.1" and tags v1.4.1;
   - pushes main and v1.4.1 to origin;
   - builds image in ACR via az acr build --registry apitechhub --image ooh-dashboard:<sha> --image ooh-dashboard:v1.4.1 --image ooh-dashboard:latest .;
   - runs kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<sha> then rollout status --timeout=180s;
   - prints WRITES_DISABLED and SMS_PROVIDER values;
   - polls /healthz for the new version.

6. **Transient tag-push reject:** if git push origin v1.4.1 receives a rejection (GitHub protection race or ACR Tasks timing), the main push and ACR build have already succeeded. Recovery: git push origin v1.4.1 from the canonical checkout. The release commit is already on main.

7. **Expected script warning:** "writesDisabled is NOT true". Correct and expected. WRITES_DISABLED is false (device control live since 2026-09-24). set image cannot change env. Only stop if the value is anything other than false.

8. **Resource drift check:** kubectl -n iot-services get deployment ooh-dashboard -o jsonpath='{.spec.template.spec.containers[0].resources}'. Expected: requests cpu 100m / memory 192Mi, limits cpu 500m / memory 512Mi. If different, apply: kubectl -n iot-services set resources deployment/ooh-dashboard -c ooh-dashboard --requests=cpu=100m,memory=192Mi --limits=cpu=500m,memory=512Mi.

9. **Health check:** curl -s https://ooh.airedale-group.io/healthz -- must show "version":"1.4.1", "status":"ok", "writesDisabled":false, bridge.healthy:true, bridge.lastError:null. If version still reads 1.4.0, wait and retry; do not redeploy.

10. **Pod log check:** kubectl -n iot-services get pods -l app=ooh-dashboard then kubectl -n iot-services logs <new-pod-name> --tail=40. Look for a clean boot and the [TB] start-up read probe line. Specifically watch for any "429 Too Many Requests" warn lines in the first 60 seconds. Persistent 429s (more than 5 in 60 seconds) are an investigation trigger; isolated ones are informational. Always resolve the new pod name explicitly before judging the log.

11. **Run the post-release smoke plan** (section 6).

12. **Record:** update the RELEASE_NOTES.md v1.4.1 entry -- replace "Date: TBD" with the actual release date and update the branch reference to "main at <release-sha>". Attach evidence screenshots to Jira OOHDASH-128.

---

## 5. Rollback

**Triggers** (operator decision -- the release doer never rolls back automatically):

- /healthz shows bridge.healthy:false with a **non-null lastError** and this persists more than 60 seconds after the new pod is ready, AND ThingsBoard is otherwise reachable.
- Any site that loaded devices under v1.4.0 now loads zero devices (a regression on the token path, not the bracket path).
- Pod enters CrashLoopBackOff or OOMKilled state.
- /healthz version does not advance to 1.4.1 within 3 minutes of rollout completion.

**Do NOT roll back on:** bridge.healthy:false with lastError:null within the first 30 seconds; the "writesDisabled is NOT true" script warning; legacy Salus devices appearing for the first time (the fix working correctly); site 5791 r-2 absent (deferred to OOHDASH-129, expected); isolated TB 429 warns in pod logs.

**Exact rollback sequence:**

    export KUBECONFIG=~/.kube/ooh.yaml
    kubectl -n iot-services set image deployment/ooh-dashboard \
        ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:a093a72
    kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=180s
    curl -s https://ooh.airedale-group.io/healthz
    # expect version 1.4.0, writesDisabled false
    kubectl -n iot-services get pods -l app=ooh-dashboard
    kubectl -n iot-services logs <new-pod-name> --tail=30

After rollback:
- The v1.4.1 git tag and release commit stay on main. A forward fix ships as v1.4.2.
- No history rewriting or force-push.
- No data to undo: OOHDASH-128 is a read-path addition only. No Zendesk comments or Cosmos writes are involved.
- Re-verify resources post-rollback: same resource check as step 8 above.

---

## 6. Post-release smoke plan (James + orchestrator)

Perform immediately after step 10. All checks READ-ONLY. No control commands. Capture screenshots and attach to Jira OOHDASH-128.

| # | Who | Step | Pass condition |
|---|---|---|---|
| S1 | Orchestrator | Within 60s of pod ready: curl -s https://ooh.airedale-group.io/healthz | "version":"1.4.1", "status":"ok", bridge.healthy:true, bridge.lastError:null, writesDisabled:false. thingsboard.read may show unknown on 60s TTL cycle; not a failure (OOHDASH-124). |
| S2 | Orchestrator | Pod log check for new pod | Clean boot. [TB] start-up read probe: ok in Nms. Watch for 429 warn lines: 1-2 isolated ones are informational; more than 5 in 60 seconds warrant investigation before continuing. |
| S3 | James | Sign in, confirm site 5694. Navigate to Heating. | Older bare-salus devices visible in workspace. Bar/Restaurant area present. Reading line shows "only reporting zone" or "coldest of N reporting zones" variant. No foreign devices from other sites. This is the primary OOHDASH-128 fix confirmation. |
| S4 | James | Confirm site 5204 (z-1 unit) and site 5788 (1-s code). Optionally site 5191. | Older Salus devices appear in Heating for both sites. For 5204: z-1 visible, no 520/52040 device IDs present. For site 5791: z-1 visible; r-2 absent (deferred to OOHDASH-129, expected and correct). |
| S5 | James | Open one non-salus site (e.g. a site with only salusit700 or Tuya devices). | Device list and Heating area identical to pre-release behaviour. No legacy-salus noise. Area chips and reading lines unaffected. This is the regression guard. |

If S1 shows healthy:false with a non-null lastError: examine pod log S2 for the error text before escalating. The fail-soft catch on the bracket lookup returns an empty array and does not set lastError; a genuine failure points to the existing token path, not the new code.

---

## 7. RELEASE_NOTES.md update

The v1.4.1 entry is already present at the top of RELEASE_NOTES.md (added by build doer WU12). After the release cut, make two edits to that entry:

- Replace "Date: TBD (release doer cuts with `npm run release:patch`)" with the actual release date and cut method.
- Replace "Branch: `build/oohdash-128-legacy-salus-load`" with "Ships from: main at <release-sha> (release commit adds version bump)".

No new text needs appending; the entry is complete.

---

*Authored by Release doer, 2026-10-15. Nothing has been bumped, built, pushed, or deployed. This is the plan only.*
