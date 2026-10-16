<!-- gate:contract
SECTION: What ships in v1.4.2
This is a patch release moving the live OOH Dashboard from v1.4.1 to v1.4.2. One ticket ships: OOHDASH-134, a P1 Escalation choice in the Something else flow.

Today, when a handler chooses Something else and then Capture, the dashboard raises a normal-priority ticket straight away. After this release, Capture opens one extra step with two buttons: a red P1 Escalation button and a Raise a Normal Priority ticket button. P1 Escalation raises exactly the same P1 as the lighting, kitchen and contractor flows (urgent priority, the ooh and ooh_p1 tags, the same subject format). The normal ticket button does what Capture did before. Under the buttons, a short explanation says what a P1 is (immediately health and safety or business trading affecting), to try a circumstance tile first, and that a P1 texts the escalation manager on the IoT Support team straight away. The P1 button stays blocked until there is a non-blank reason; if the caller-words box was left empty, a reason box appears on the choice step.

It is a browser-only change (flows.js, styles.css) with one small bug fix in notes.js: a pending debounced notes-draft save is now cancelled when the draft is cleared, so notes typed just before submitting cannot leak into the next flow. There is no server change, no new environment variable, no secret and no data migration. The diff cdf480e to 036de05 is 14 files, 965 insertions, 9 deletions, most of it tests and design docs. RELEASE_NOTES.md and the tester guide are updated.

The posture is unchanged: device writes stay enabled as today (WRITES_DISABLED=false since 2026-09-24) and SMS_PROVIDER stays log by design. Paging is done by the IoT Support dashboard when it sees a P1 ticket, so the OOH dashboard environment is not touched.

SECTION: Pre-flight checks run 2026-10-16
Read-only checks were run today. Live healthz reports version 1.4.1, status ok, bridge healthy with no last error, Zendesk configured and healthy, Cosmos store healthy, and no active alerts. The live deployment image is apitechhub.azurecr.io/ooh-dashboard:cdf480e (the v1.4.1 release commit) and one pod is Running, 1 of 1 ready, with 0 restarts. Resources match the manifest (requests 100m CPU and 192Mi, limits 500m and 512Mi). The main branch on origin is at 036de05 (merge of PR #107), which is the exact state to be released.

The test results are not in this document. Test-RESULTS: see gate for docs/project/oohdash-134-test/TEST-RESULTS.md (running in parallel). The release should not be cut until that gate has passed and been approved.

SECTION: Release steps
After James says go and the test gate is approved, the orchestrator cuts the release from the canonical main checkout with npm run release, which runs scripts/release.sh patch. In order, the script checks main is clean and in sync, records the live image as the rollback reference, bumps to 1.4.2 and tags v1.4.2, pushes main and the tag, builds the image in ACR, runs kubectl set image (environment untouched), waits for the rollout and polls healthz. The single pod restarts during the rollout, so every signed-in handler has to sign in again. A script warning that writesDisabled is not true is expected and correct. Before the cut, on-shift handlers are warned (see the handler communications section). After the cut, RELEASE_NOTES.md v1.4.2 gets the real release commit reference.

SECTION: Rollback
If the release misbehaves, the operator decides on rollback; nothing rolls back automatically. The rollback is one command: kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:cdf480e, followed by rollout status and a healthz check that reads version 1.4.1. Triggers are CrashLoopBackOff or OOMKilled, healthz not advancing to 1.4.2 within 3 minutes, a persistent non-null bridge lastError, or the Something else flow failing to show both buttons. There is nothing to undo in data: the release adds no schema and no writes of its own. Any P1 ticket raised while v1.4.2 was live is a real ticket and stays. The release commit and tag stay on the main branch; a forward fix ships as v1.4.3. No force-push.

SECTION: Security check -- staged diff scan
The cdf480e to 036de05 diff was reviewed for credential-shaped content. Findings: none. The changes are UI code, CSS, tests, design and build-plan docs, release notes and one tester-guide line. No environment variable, secret reference, connection string or token is added, and nothing in the Kubernetes manifest or Dockerfile changes. The release commit itself only changes the package version fields.

SECTION: Smoke plan
Within 60 seconds of the pod being ready, the orchestrator checks healthz reads version 1.4.2 with status ok and bridge healthy, then reads the new pod logs for a clean boot (resolve the new pod name explicitly; the terminating pod emits ECONNRESET noise). Then James or the orchestrator signs in, opens any site, starts Something else, chooses Capture, and confirms the new step shows both the P1 Escalation and Raise a Normal Priority ticket buttons plus the explanation text. The UI check stops there: no outcome is submitted in production, because every outcome creates a real Zendesk ticket and a P1 would page the escalation manager. Finally confirm the Check if it is Lighthouse-controlled branch still opens as before.

SECTION: Handler communications and known behaviours
This release changes the Capture path, so on-shift handlers need a heads-up before the cut. Existing capture now needs one extra click on Raise a Normal Priority ticket. The new P1 Escalation button is for genuine P1s only (health and safety or business trading affecting) after trying a circumstance tile, and it pages the IoT Support escalation manager. Everyone will be signed out when the pod restarts and must sign in again. Accepted behaviours: a Something else P1 has no capture class, so audit metrics show it as unclassified, the same as the lighting P1. The P1 button needs a non-blank reason. The Lighthouse-controlled check path is unchanged. Handler guide wording should be refreshed after release (a one-line tester guide update is already in the diff).

DECISION: D-134-TIMING: When should this release run? | Release now and warn on-shift handlers first (recommended) | Release at a quiet time later tonight | Hold to Monday
DETAIL: Release now and warn on-shift handlers first (recommended) | The change is UI only and easy to reverse. Handlers get a short heads-up that Capture now has one extra click, and that they will be signed out for about a minute while the single pod restarts. This gets the P1 route in front of handlers soonest and avoids carrying an unreleased fix for the notes-draft leak. The cost is a brief sign-out during a live shift.
DETAIL: Release at a quiet time later tonight | Avoids any sign-out during an active shift, but the release then runs when fewer people are around to notice a problem, and James would need to be available for the smoke check. Handlers still need to be told about the extra Capture click at their next shift.
DETAIL: Hold to Monday | Zero disruption this weekend, but handlers have no P1 option in Something else until then, so a real P1 found through Something else would still need the old workaround of using a circumstance tile or phoning. The release can then be run in normal working hours with the team present.
-->

# Release preflight -- OOHDASH-134 (v1.4.2)

**Date:** 2026-10-16
**Release:** v1.4.2 (patch on live v1.4.1)
**Ships from:** `main` @ `036de05` (merge of PR #107, branch feat/oohdash-134-other-p1)
**Live now:** v1.4.1, image `cdf480e` (git tag `v1.4.1`), https://ooh.airedale-group.io
**Repo:** `C:\repos\ooh-triage-dashboard` (canonical checkout; cut by the orchestrator only)
**Cut command (post-approval only):** `npm run release` (= `bash scripts/release.sh patch`)
**Authored by:** Release doer. This document is the plan only. Nothing has been bumped, built, pushed or deployed.

---

## 1. What ships

### 1.1 Version

| Item | Value |
|---|---|
| Current live version | 1.4.1 (healthz 2026-10-16) |
| Target version | 1.4.2 |
| Bump type | patch (npm version patch inside scripts/release.sh) |
| Git tag created by script | v1.4.2 |
| Image tags | ooh-dashboard:<new short sha>, ooh-dashboard:v1.4.2, ooh-dashboard:latest |
| package.json now | 1.4.1 (script advances to 1.4.2 and commits "release v1.4.2") |

### 1.2 Diff cdf480e..036de05 (14 files, +965 / -9)

| File | Change |
|---|---|
| public/js/flows.js | New otherP1Choice step, otherP1Summary, otherP1Reason, otherP1ReasonInput, raiseOtherP1. Capture now opens the two-button step. P1 uses the shared outcomeP1 helper (+99 lines). |
| public/css/styles.css | .chip.p1, .chip:disabled, .p1-explainer, .p1-blocked-note (+6 lines). |
| public/js/notes.js | notesDraftClear now also clears the pending debounced save timer (+3 lines). Fixes a draft re-written after clear. |
| test/other-p1-summary.test.js | New unit test (72 lines). |
| tests/oohdash-134-other-p1.spec.js | New e2e spec 134-A..H incl. lighting-P1 parity and blocked-reason cases (235 lines). |
| tests/additional-notes.spec.js, tests/killswitch.spec.js, tests/tester/oohdash-119*.spec.js | Existing Capture tests now press Raise a Normal Priority ticket; one added notes-draft case. |
| RELEASE_NOTES.md | v1.4.2 entry (+27). Date field read TBD on main; set to 2026-10-16 in this preflight commit. |
| docs/TIER1_TESTER_GUIDE.md | One line added for the new step. |
| docs/project/oohdash-134-design, oohdash-134-build-plan | Design, mockup and build plan (documentation only). |

No change to services, routes, k8s, Dockerfile, package.json or data files.

### 1.3 Posture (unchanged)

| Setting | Value | Note |
|---|---|---|
| WRITES_DISABLED | false | Device control live since 2026-09-24. set image cannot change env. |
| SMS_PROVIDER | log | By design. Paging is done by the IoT Support dashboard on P1 tickets. Env untouched. |
| New env vars or secrets | none | |
| Manifest, schema, Cosmos shape | no change | |

---

## 2. Gate lineage

| Stage | Ticket | Reference |
|---|---|---|
| Design | OOHDASH-134 | docs/project/oohdash-134-design/DESIGN.md |
| Build plan | OOHDASH-134 | docs/project/oohdash-134-build-plan/BUILD_PLAN.md |
| Build | OOHDASH-134 | PR #107 -- merge 036de05, branch feat/oohdash-134-other-p1 |
| Test | OOHDASH-134 | Test-RESULTS: see gate for docs/project/oohdash-134-test/TEST-RESULTS.md (running in parallel) |

---

## 3. Preflight checks (run 2026-10-16, read-only)

| # | Check | Result |
|---|---|---|
| P1 | Remote main HEAD is the target commit | PASS. 036de05 Merge pull request #107. |
| P2 | Live healthz | PASS. version 1.4.1, status ok, writesDisabled false, bridge healthy true, lastError null, zendesk configured and healthy, store cosmos healthy, activeAlerts empty. |
| P3 | Live image and pod | PASS. Image apitechhub.azurecr.io/ooh-dashboard:cdf480e. Pod ooh-dashboard-8687757f9-tw9jj 1/1 Running, 0 restarts, age 29h. |
| P4 | Resources vs manifest | PASS. requests 100m / 192Mi, limits 500m / 512Mi. |
| P5 | Rollback image is the v1.4.1 release commit | PASS. cdf480e is live now and tag v1.4.1 exists. Confirm it is in ACR (step 2 below) before the cut. |
| P6 | New env vars, secrets, manifest or data migration | NONE. |
| P7 | RELEASE_NOTES.md entry | PRESENT. Date set to 2026-10-16 in this commit. |
| P8 | Test gate | PENDING. Test-RESULTS: see gate for docs/project/oohdash-134-test/TEST-RESULTS.md (running in parallel). Release is blocked until it is approved. |
| P9 | Working tree clean on canonical checkout | To be checked by the orchestrator at cut time (release.sh guard). This worktree was used for authoring only. |

---

## 4. Release steps (post-approval only)

From C:\repos\ooh-triage-dashboard in Git Bash. Prerequisites: az login, KUBECONFIG=~/.kube/ooh.yaml (deployer-ooh).

1. Confirm James has given go on D-134-TIMING and the Test gate is approved.
2. Confirm the rollback image is in ACR: az acr repository show-tags -n apitechhub --repository ooh-dashboard --orderby time_desc --output table (expect v1.4.1 and cdf480e).
3. Warn on-shift handlers (section 7) if releasing during a shift.
4. Switch to main, fetch, and confirm status shows main in sync with the remote and a clean tree (at 036de05 or a later docs-only commit from this preflight merge).
5. Cut: npm run release. The script checks guards, prints the rollback reference (expect cdf480e), bumps and tags v1.4.2, pushes main and tag, builds in ACR, runs set image, waits for rollout and polls healthz.
6. If the tag push is rejected, the main push and ACR build already succeeded. Re-push the tag from the canonical checkout. Never force.
7. Expected script warning "writesDisabled is NOT true" is correct (value is false). Stop only if the value differs from live today.
8. Run the smoke plan (section 6).
9. Update RELEASE_NOTES.md v1.4.2 with the release commit reference; attach evidence to Jira OOHDASH-134.

---

## 5. Rollback

Triggers (operator decision; the release doer never rolls back automatically):

- Pod in CrashLoopBackOff or OOMKilled.
- healthz version does not advance to 1.4.2 within 3 minutes of rollout completion.
- bridge.healthy false with a non-null lastError persisting more than 60 seconds after pod ready.
- The Something else flow does not show both buttons, or a normal ticket can no longer be raised from Capture.

Do NOT roll back on: bridge.healthy false with lastError null in the first 30 seconds (documented cold-start artefact); the writesDisabled script warning; terminating-pod ECONNRESET log noise.

Rollback sequence: export KUBECONFIG=~/.kube/ooh.yaml, then kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:cdf480e, then kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=180s, then curl -s https://ooh.airedale-group.io/healthz (expect version 1.4.1), then check the new pod logs.

After rollback: the v1.4.2 tag and commit stay on main, a forward fix ships as v1.4.3, no history rewriting. No data to undo. Any real P1 ticket raised in the interim stays valid.

---

## 6. Post-release smoke plan

| # | Who | Step | Pass condition |
|---|---|---|---|
| S1 | Orchestrator | Within 60s of pod ready: curl -s https://ooh.airedale-group.io/healthz | version 1.4.2, status ok, writesDisabled false, bridge.healthy true, lastError null |
| S2 | Orchestrator | Pod log check on the NEW pod (resolve name explicitly) | Clean boot, [TB] start-up read probe ok, no crash or repeated errors |
| S3 | James or orchestrator | Sign in, open any site, start Something else, choose Capture and escalate as described | New step shows both P1 Escalation (red) and Raise a Normal Priority ticket, plus the P1 explanation text. STOP HERE: do not submit any outcome in production. |
| S4 | James or orchestrator | Back out and open Check if it is Lighthouse-controlled | Path behaves as before. |

---

## 7. Handler communications

Tell on-shift handlers before the cut. Suggested wording: "Short update coming: you will be signed out for about a minute while the dashboard updates. After it, Something else then Capture has one extra step. Choose Raise a Normal Priority ticket for what you did before. P1 Escalation is only for something immediately health and safety or business trading affecting, after you have tried a circumstance tile. It texts the IoT Support escalation manager straight away and needs a reason."

Follow-ups (non-blocking): refresh the handler guide wording for the new step; audit metrics show Something else P1 as unclassified (same as lighting P1).

---

## 8. RELEASE_NOTES.md update

The v1.4.2 entry is present at the top of RELEASE_NOTES.md. Its Date field is changed from TBD to 2026-10-16 in this preflight commit. After the cut, replace the Branch reference with "Ships from: main at the release sha".

---

*Authored by Release doer, 2026-10-16. Nothing has been bumped, built, pushed or deployed. This is the plan only.*
