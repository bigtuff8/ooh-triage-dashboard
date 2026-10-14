<!-- gate:contract
SECTION: What ships in v1.3.8
This is a patch release moving the live OOH Dashboard from v1.3.7 to v1.3.8. Two tickets are combined into one cut.

OOHDASH-122 fixes the "degraded" red banner that appeared on the New Call page after every pod restart, even when ThingsBoard reads were working. The banner was triggered by a cold-start initialisation value, not a real fault. The fix changes the logic so "degraded" means a real read failure has been recorded (lastError is set), not "no read yet". It also adds a one-shot non-blocking start-up probe that confirms ThingsBoard connectivity within the first few seconds of boot, so the banner state is accurate almost immediately. As a companion fix, the green "Device control is LIVE" banner is now hidden whenever any red banner is visible, so the two can never appear together.

OOHDASH-127 fixes a mobile viewport overflow that was causing the workspace to scroll sideways at 390 px phone width. The fix is a CSS grid-track change (minmax(0,1fr) instead of 1fr) in both mobile breakpoints. A test race on the tonight-callback note test (F015) is also stabilised.

Nothing else changes. There are no new environment variables, secrets, database changes, or manifest changes. Device control and SMS settings are untouched by the release script.

SECTION: Pre-flight checks run 2026-10-14
All checks were run read-only on a clean checkout of origin/main at 123a72f, which contains both OOHDASH-122 and OOHDASH-127.

Unit tests: 379 total, 378 pass, 0 fail, 1 skip. The one skip is the pre-existing IOT_REPO_PATH drift check (requires a sibling repo directory absent on any build machine). No new skips.

Full Playwright end-to-end suite: 140 total, 138 pass, 2 skip, 0 fail. The two skips are TF-18 and TF-19 (ctlFinish/ctlEscalate carry additionalNotes; fixture site 6832 has no control tile; both pre-date this release and are covered by unit tests). The three failures and one flaky test recorded by the independent tester at cb9efc9 (control.spec.js F008 x2 intermittent; TF-28 mobile overflow; TF-25 sign-in race) all pass on main: TF-28 and TF-25 are fixed by OOHDASH-127; the F008 control.spec tests are intermittent pre-existing failures that passed on this run.

Live site (https://ooh.airedale-group.io/healthz, read 2026-10-14): version 1.3.7, status ok, writesDisabled false, bridge healthy true and lastError null, Zendesk healthy and configured, Cosmos healthy. No active alerts. Device control has been live since 2026-09-24.

Cluster resources: kubectl confirmed requests cpu 100m / memory 192Mi, limits cpu 500m / memory 512Mi. This matches k8s/deployment.yaml exactly. No OOM drift from a previous set image operation.

Current live image: apitechhub.azurecr.io/ooh-dashboard:e6d98bd (git tag v1.3.7).

SECTION: Release steps
The release is cut with one command after this plan is approved. All commands run from C:\repos\ooh-triage-dashboard in Git Bash with az logged in (ACR Task Runner) and KUBECONFIG set to ~/.kube/ooh.yaml (deployer-ooh).

Step 1: confirm the rollback image is present in ACR before starting. az acr repository show-tags -n apitechhub --repository ooh-dashboard --orderby time_desc --output table should list v1.3.7 and e6d98bd.

Step 2: verify the working tree in C:\repos\ooh-triage-dashboard is clean. git status --porcelain must return nothing. If any untracked or modified files appear, exclude them from tracking (git check-ignore, then .git/info/exclude for stray local files) or commit them before running the script. The script refuses to run on a dirty tree.

Step 3: confirm synced main. git switch main && git fetch origin && git status -sb must show main...origin/main with no ahead/behind count, and HEAD at 123a72f.

Step 4: if releasing during an active OOH shift, warn agents. The single pod restarts during the rollout and any signed-in handler must sign in again.

Step 5: cut the release. bash scripts/release.sh patch. The script in order: checks you are on main with a clean synced tree; prints the current live image as the rollback reference (must read apitechhub.azurecr.io/ooh-dashboard:e6d98bd); runs npm version patch to commit "release v1.3.8" and tag v1.3.8; pushes main and the tag; builds the image in ACR from a clean git archive context tagged with both the new short sha and v1.3.8 and latest; runs kubectl set image then rollout status; verifies WRITES_DISABLED and SMS_PROVIDER; polls /healthz for the new version.

Note on the build context: the script builds using az acr build which runs in ACR Tasks, not locally. There is no .claude/worktrees directory in the repo, so the WinError-3 long-path issue from the CIR does not apply.

Note on resources: release.sh uses kubectl set image, which updates the image tag only and does not touch resource requests or limits. After rollout, re-confirm resources with kubectl -n iot-services get deployment ooh-dashboard -o jsonpath='{.spec.template.spec.containers[0].resources}'. Expected: requests cpu 100m / memory 192Mi, limits cpu 500m / memory 512Mi. If they differ, apply with kubectl -n iot-services set resources deployment/ooh-dashboard -c ooh-dashboard --requests=cpu=100m,memory=192Mi --limits=cpu=500m,memory=512Mi.

Step 6: expected script warning. At the end the script will warn "writesDisabled is NOT true". This is correct and expected. Device control has been live since 2026-09-24 (OOHDASH-19) and the release intentionally preserves that setting. Only stop if writesDisabled reads anything other than false.

Step 7: health check. curl -s https://ooh.airedale-group.io/healthz should show version 1.3.8, status ok, writesDisabled false, bridge.healthy true, bridge.lastError null. If the version still reads 1.3.7, wait for the rollout to complete and retry; do not redeploy.

Step 8: find the new pod and inspect its logs. kubectl -n iot-services get pods -l app=ooh-dashboard then kubectl -n iot-services logs <new-pod> --tail=40. Look for the start-up probe log line [TB] start-up read probe: ok in Nms and the write-enabled banner. Ignore ECONNRESET noise from the terminating old pod; the CIR notes that kubectl logs may pick the old pod during a rollout so always resolve the new pod name explicitly.

Step 9: run the post-release live proof (see the Live Proof section below).

Step 10: record. Append the v1.3.8 entry to RELEASE_NOTES.md in the repo (draft text is in the body of this document). Attach evidence screenshots to Jira OOHDASH-122 and OOHDASH-127.

RELEASE_NOTES.md entry to append after the v1.3.7 section:

v1.3.8 -- OOHDASH-122 degraded-mode banner false negative + OOHDASH-127 CI/mobile overflow fix

Date: 2026-10-14. Bump type: patch. Ships from: main at 123a72f.
Gate lineage: 122 discovery PR #86, design PR #89, build plan PR #90, build PR #92, test PR (branch test/oohdash-122-degraded-banner cb9efc9). 127 fix PR #94.

What changed:
OOHDASH-122: routes/api.js exports bridgeDegraded() which derives degraded from !!status.lastError; /me and workspacePayload() both call it. services/tb-device.js adds probeBridgeReadOnce() -- a one-shot non-blocking start-up read probe (live only, fires inside app.listen callback). public/js/app.js LIVE banner gains guard controlLive && !kill so green and red are mutually exclusive across all nine states. server.js wires the probe fire-and-forget with a .catch() that logs one sanitised line. 23 new unit tests (U1-U14 truth table + P1-P9 + P11 probe suite) and 7 new e2e journeys (E1-E7).
OOHDASH-127: public/css/styles.css both mobile breakpoints changed from grid-template-columns:1fr to minmax(0,1fr). public/js/views.js subject span gains min-width:0 overflow ellipsis. tests/tonight-callback.spec.js F015 waits for thread fetch before typing. tests/oohdash-127.spec.js regression test added.

Accepted known behaviours: F11 (refrigeration lock shows red when writes enabled but refrig assets locked -- by design, Stream A deny); F12 (mid-call TB outage shows red -- clears on workspace reload, by design); F015 live-note-race (a brief Loading state before typing in tonight callback -- stabilised in test, rare in production).
Follow-up: OOHDASH-124 (thingsboardRead TTL improvement, DECISION 3 out of scope for this release).

SECTION: Rollback
Trigger criteria for rollback (all are operator decisions -- the release doer does not roll back automatically):

- /healthz shows bridge.healthy false with a non-null lastError and this persists more than 60 seconds after the pod is ready, AND ThingsBoard is otherwise reachable (other sites load normally). This means the start-up probe captured a genuine read failure that has not cleared.
- The New Call page shows both the green LIVE banner and any red banner simultaneously after more than 10 seconds on the page. This means the guard logic did not deploy correctly.
- The pod enters a CrashLoopBackOff or OOMKilled state.
- The /healthz version does not advance to 1.3.8 within 3 minutes of rollout status completing.

Do NOT roll back on: bridge.healthy false with lastError null within the first 30 seconds (this is the normal pre-probe boot window); a single red banner on New Call that clears within 30 seconds (probe resolving); the expected "writesDisabled is NOT true" warning from the release script; write-failure-streak alerts from live device commands (unrelated to this release).

Exact rollback sequence:

1. export KUBECONFIG=~/.kube/ooh.yaml
2. kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:e6d98bd
3. kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=180s
4. curl -s https://ooh.airedale-group.io/healthz should show version 1.3.7 and writesDisabled false
5. kubectl -n iot-services get pods -l app=ooh-dashboard then check new pod logs for a clean boot

After rollback: the v1.3.8 git tag and release commit stay on main. A forward fix would ship as v1.3.9. Do not rewrite history or force-push.

Resource drift check after rollback: repeat the resources verify step from the Release Steps section. The same set resources command applies if the values are not 100m/192Mi requests and 500m/512Mi limits.

What cannot be undone after rollback: none. OOHDASH-122 and OOHDASH-127 are pure client-side rendering changes and CSS fixes. No Zendesk comments are written by these changes. No Cosmos data is touched.

SECTION: Security check -- /healthz lastError exposure
The subsystems.bridge.lastError field in /healthz is set only to err.message from the Node.js Error object (tb-device.js lines 980, 1007, 1089, 1093). It is never set to err.config, err.response.data, or any axios request object.

For the start-up probe: probe failures record strings such as "Start-up read probe failed: Request failed with status code 401" or "Start-up read probe timed out after 8000ms". Neither form includes the ThingsBoard host URL, the JWT token, or the read credential password. The probe's STARTUP_PROBE_PATH constant (/api/tenant/devices?pageSize=1&page=0) is a path, not a full URL; it does not appear in err.message.

For site reads: lastReadError stores err.message such as "Request failed with status code 401" or "read ECONNRESET". These do not include the TB_URL hostname or any credential material.

Test P9 (test/bridge-startup-probe.test.js) explicitly asserts that an err.config carrying a password field is not present in lastError. This runs as part of the unit suite.

Finding: no credential, token, URL, or hostname exposure risk via /healthz. The lastError field is safe to leave unauthenticated (consistent with /healthz being unauthenticated by design for Kubernetes probe access).

SECTION: Live proof for James (L1-L5)
Perform immediately after the new pod reports ready. Capture screenshots at each step and attach them to Jira OOHDASH-122 (L1-L5) and OOHDASH-127 (L4 mobile step). This is the authoritative evidence record for both tickets.

L1 (within 60 seconds of pod ready -- orchestrator): open https://ooh.airedale-group.io/healthz. Pass: JSON shows version 1.3.8, status ok, subsystems.bridge.healthy true, subsystems.bridge.lastError null. The subsystems.thingsboard.read field may show unknown on its 60-second TTL cycle; that is DECISION 3 (OOHDASH-124) and is not a failure here.

L2 (orchestrator): check pod logs for the new pod (kubectl -n iot-services logs <new-pod> --tail=40). Pass: exactly one line matching [TB] start-up read probe: ok in Nms with no retry or second probe line. If the line shows failed or timeout, note the error text before proceeding to L3. A failed probe at this step is not an automatic rollback trigger; the banner state (L3) is the deciding check.

L3 (James): sign in to the OOH Dashboard. On the New Call page before searching or confirming any site, check the banner state. Pass: only the green "Device control is LIVE" banner is visible. No red "control actions are disabled" banner. This is the primary fix confirmation.

L4 (James): search for and confirm site 6832 Old Grey Mare and open the workspace. Check: green banner only, no site-level degraded warning. Then resize the browser to 390 px width (or use a real phone). Pass: the workspace area does not scroll sideways; all cards fit within the viewport. This confirms OOHDASH-127.

L5 (James, optional): engage the global kill-switch from Admin. Pass: red "control actions are disabled" banner visible and green LIVE banner absent. After clearing: green banner returns and red banner disappears. Skip entirely if there is any live call activity.

If L1 shows bridge.healthy false with a non-null lastError: check L2 for the error text before treating it as a build defect. A transient TB hiccup at restart time sets lastError and clears automatically after the first successful getSitesByNumber() call when a handler opens a workspace.

SECTION: Accepted known behaviours and follow-up
F11 (refrigeration lock): when WRITES_DISABLED is false and refrig assets are present, the LIVE banner may be visible alongside a site-level control restriction for those assets. This is Stream A deny behaviour by design (services/refrig-guard.js boot self-test). Not a banner conflict; not a regression.

F12 (mid-call TB outage): if TB becomes unreachable during an active handler session after the workspace was confirmed, a red banner appears. It clears automatically when TB recovers and the workspace is refreshed. This is by design; it is a real fault signal, not a cold-start artefact.

F015 live-note-race: the tonight-callback note step may briefly show a Loading state before the thread is ready. OOHDASH-127 stabilised this in the test by waiting for the Loading text to clear; in production it is rare and self-resolving. Not a regression.

OOHDASH-124: the thingsboardRead subsystem in /healthz uses a 60-second TTL probe (tbStatus()) that is separate from the bridge latch. On main at 123a72f it may briefly show unknown. Accepted as out of scope for this release; OOHDASH-124 is the follow-up.

DECISION: When should this release run? | Release in quiet hours (not during an active OOH shift) | Release now and warn agents first
DETAIL: Recommend quiet hours. The single pod means any signed-in handler is forced to sign in again during the rollout. If handlers are on shift, alert them first via the usual channel. The fix addresses a banner that appears after every restart, so there is low urgency; next-morning quiet hours is the safer window.
-->

# Release preflight -- OOHDASH-122 + OOHDASH-127 (v1.3.8)

**Date:** 2026-10-14
**Release:** v1.3.8 (patch on live v1.3.7)
**Ships from:** `main` @ `123a72f` -- contains OOHDASH-122 (PR #92) and OOHDASH-127 (PR #94)
**Live now:** v1.3.7, image `e6d98bd` (git tag `v1.3.7`), https://ooh.airedale-group.io
**Repo:** `C:\repos\ooh-triage-dashboard`
**Cut command (post-approval only):** `bash scripts/release.sh patch`
**Authored by:** Release doer. This document is the plan only. Nothing has been bumped, built, pushed, or deployed.

---

## 1. What ships

### 1.1 Version

| Item | Value |
|---|---|
| Current live version | 1.3.7 (confirmed via /healthz 2026-10-14) |
| Target version | 1.3.8 |
| Bump type | patch (`npm version patch` inside `scripts/release.sh`) |
| Git tag created by script | `v1.3.8` |
| Image tags | `ooh-dashboard:<new short sha>`, `ooh-dashboard:v1.3.8`, `ooh-dashboard:latest` |

### 1.2 OOHDASH-122 -- Degraded banner false negative

Four production files changed. No k8s manifests, no config, no Cosmos, no secrets.

| File | Change |
|---|---|
| `routes/api.js` | `bridgeDegraded()` helper exported; derives `degraded` as `!!status.lastError` at `/api/me` and `workspacePayload()`. +9/-2 lines. |
| `services/tb-device.js` | `probeBridgeReadOnce()` added (35 lines, additive). One-shot non-blocking start-up read probe -- live mode only; fires after port binding, never before. |
| `public/js/app.js` | LIVE banner gains guard `controlLive && !kill`; three-line maintenance comment documents the coupling. +4/-1 lines. |
| `server.js` | Fire-and-forget probe call inside `app.listen` callback (live only). `.catch()` logs one sanitised line. +7/-1 lines. |

Five test files added or revised (not in the image): `test/degraded-banner.test.js` (revised), `test/bridge-startup-probe.test.js` (revised), `tests/degraded-banner.spec.js` (new, 160 lines), `tests/killswitch.spec.js` (+4 lines).

### 1.3 OOHDASH-127 -- CI/mobile overflow fix

Three files changed, one added. All changes are client-side CSS/JS and test files.

| File | Change |
|---|---|
| `public/css/styles.css` | Both mobile breakpoints (max-width 1100px and 900px): `grid-template-columns:1fr` -> `minmax(0,1fr)`. Prevents grid track from expanding to min-content of nowrap scope tags. |
| `public/js/views.js` | Subject `<span>` in `siteTickets()` row gains `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. |
| `tests/tonight-callback.spec.js` | F015: waits for `.drawer #thread` to not contain "Loading" before `pressSequentially`. Eliminates DOM race after async thread fetch. |
| `tests/oohdash-127.spec.js` | New deterministic TF-28 regression test at 390 px viewport (site 6883 Water Tower, longest status label). |

### 1.4 Accepted known behaviours

| Code | Description |
|---|---|
| F11 | Refrigeration lock: LIVE banner visible while refrig assets are control-restricted. Stream A deny by design. |
| F12 | Mid-call TB outage shows red banner; clears on workspace reload. Real fault signal, not cold-start. |
| F015 live-note-race | Brief Loading state in tonight-callback note step. Rare in production, self-resolving. |

Follow-up: OOHDASH-124 (thingsboardRead TTL improvement, DECISION 3, out of scope).

---

## 2. Gate lineage

| Stage | Ticket | Reference |
|---|---|---|
| Discovery | OOHDASH-122 | PR #86 |
| Design | OOHDASH-122 | PR #89 -- `OOHDASH-122_DEGRADED_BANNER_DESIGN_2026-10-14.md` |
| Build plan | OOHDASH-122 | PR #90 -- `OOHDASH-122_DEGRADED_BANNER_BUILD_PLAN_2026-10-14.md` |
| Build | OOHDASH-122 | PR #92 -- `OOHDASH-122_DEGRADED_BANNER_BUILD_2026-10-14.md` (commit 0856514); hardening pass cb9efc9 |
| Test | OOHDASH-122 | Branch `test/oohdash-122-degraded-banner` -- `OOHDASH-122_DEGRADED_BANNER_TEST_PLAN_2026-10-14.md` |
| Fix | OOHDASH-127 | PR #94 -- `OOHDASH-127_CI_E2E_FIX_2026-10-14.md` |

---

## 3. Preflight checks (run 2026-10-14, read-only on origin/main 123a72f)

| # | Check | Result |
|---|---|---|
| P1 | origin/main HEAD matches target commit | PASS. `git log origin/main -1` = `123a72f fix(OOHDASH-122): degraded-mode banner false negative -- cold-start double banner (#92)`. OOHDASH-127 is present on main (merged as PR #94, commit f6718e9, before 123a72f). |
| P2 | Working tree clean (release.sh guard) | CHECKED IN WORKTREE ONLY. The preflight worktree (`C:\harness-runs\gate122\release\ooh-triage-dashboard`) has modified PNG test evidence files (`docs/project/test-evidence/oohdash-119/*.png`) that are not relevant to the release. Before running `release.sh` from `C:\repos\ooh-triage-dashboard`, verify `git status --porcelain` returns nothing from that directory. If any stray files exist, use `.git/info/exclude` as earlier releases did. |
| P3 | Unit suite on origin/main 123a72f (`node --experimental-test-module-mocks --test "test/*.test.js"`) | PASS. **379 total: 378 pass, 0 fail, 1 skip.** The skip is `test/iot-consumer-parse.test.js` U13 (IOT_REPO_PATH drift check; pre-existing, expected without sibling repo). |
| P4 | Full Playwright e2e suite on origin/main 123a72f (`npx playwright test`, fixture mode, port 3155) | PASS. **140 total: 138 pass, 0 fail, 2 skip.** The two skips are TF-18 and TF-19 (fixture site 6832 has no control tile; pre-existing, covered by unit tests). TF-28 (mobile overflow), TF-25 (sign-in race), and the two F008 control tests that failed in the tester's branch run all pass on main 123a72f: TF-28/TF-25 are fixed by OOHDASH-127; the F008 tests are intermittent pre-existing tests that passed on this run. |
| P5 | Live site baseline | PASS. `/healthz` at 2026-10-14: `version 1.3.7`, `status ok`, `writesDisabled false`, `bridge.healthy true`, `bridge.lastError null`, Zendesk `healthy true configured true`, Cosmos `healthy true`. No active alerts. |
| P6 | Live cluster resources vs manifest | PASS. `kubectl` confirms requests `cpu:100m / memory:192Mi`, limits `cpu:500m / memory:512Mi`. Matches `k8s/deployment.yaml` exactly. No OOM drift. |
| P7 | Rollback image confirmed | PASS. Live image `apitechhub.azurecr.io/ooh-dashboard:e6d98bd` confirmed from cluster. Git tag `v1.3.7` maps to commit `e6d98bd9a66ac007f47e47e0cca6843e31c855f9`. Both are the v1.3.7 rollback target. |
| P8 | New env vars or secrets | NONE. `probeBridgeReadOnce` uses the existing TB read credential from `ooh-dashboard-secrets`. No new `process.env` reads. No new k8s secret fields. `STARTUP_PROBE_PATH` is a code constant. |
| P9 | Manifest / schema / data migration | NONE. No changes to `k8s/deployment.yaml`, `Dockerfile`, `package-lock.json` (beyond the version bump that `release.sh` applies), or Cosmos container shape. |
| P10 | `package.json` version | `"version": "1.3.7"`. `release.sh patch` will advance this to `1.3.8` and commit "release v1.3.8". |

---

## 4. Release steps (post-approval only)

All commands from `C:\repos\ooh-triage-dashboard` in Git Bash. Prerequisites: `az login` (ACR Task Runner), `KUBECONFIG=~/.kube/ooh.yaml` (`deployer-ooh`).

1. **Confirm the rollback image is in ACR:** `az acr repository show-tags -n apitechhub --repository ooh-dashboard --orderby time_desc --output table` -- should list `v1.3.7` and `e6d98bd`.

2. **Verify the working tree is clean:** `git status --porcelain` must return nothing. If it does not, address any stray files (`.git/info/exclude` for local-only scratch files) before proceeding. Do not stage or commit anything that does not belong in the release.

3. **Confirm synced main:** `git switch main && git fetch origin && git status -sb` -- must show `## main...origin/main` with no ahead/behind count, HEAD at `123a72f`.

4. **Warn agents if on shift.** The single pod restarts during rollout; any signed-in handler must sign in again.

5. **Cut:** `bash scripts/release.sh patch`. In order the script:
   - checks main, clean tree, synced with origin;
   - prints the current live image as rollback reference (must read `apitechhub.azurecr.io/ooh-dashboard:e6d98bd`);
   - runs `npm version patch` -- commits "release v1.3.8" and tags `v1.3.8`;
   - pushes `main` and `v1.3.8` to origin;
   - builds image in ACR via `az acr build --registry apitechhub --image ooh-dashboard:<sha> --image ooh-dashboard:v1.3.8 --image ooh-dashboard:latest .` -- builds from `git archive HEAD` context (CIR note: do NOT run from the repo dir; the script handles the export);
   - runs `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<sha>` then `rollout status --timeout=180s`;
   - prints `WRITES_DISABLED` and `SMS_PROVIDER` values;
   - polls `/healthz` for the new version.

6. **Expected script warning:** "writesDisabled is NOT true". Correct and expected. Device control (`WRITES_DISABLED=false`) has been live since 2026-09-24 (OOHDASH-19). `set image` cannot change env. Only stop if the value is anything other than `false`.

7. **Resource drift check:** `kubectl -n iot-services get deployment ooh-dashboard -o jsonpath='{.spec.template.spec.containers[0].resources}'`. Expected: `{"limits":{"cpu":"500m","memory":"512Mi"},"requests":{"cpu":"100m","memory":"192Mi"}}`. If different, apply: `kubectl -n iot-services set resources deployment/ooh-dashboard -c ooh-dashboard --requests=cpu=100m,memory=192Mi --limits=cpu=500m,memory=512Mi`.

8. **Health check:** `curl -s https://ooh.airedale-group.io/healthz` -- must show `"version":"1.3.8"`, `"status":"ok"`, `"writesDisabled":false`, `"bridge":{"mode":"live","healthy":true,"lastError":null}`. If version is still 1.3.7, wait for rollout to complete and retry; do not redeploy.

9. **Pod log check:** `kubectl -n iot-services get pods -l app=ooh-dashboard` then `kubectl -n iot-services logs <new-pod-name> --tail=40`. Look for exactly one line: `[TB] start-up read probe: ok in <n>ms`. Ignore ECONNRESET noise from the terminating old pod; always resolve the new pod name explicitly before judging the log.

10. **Run the post-release live proof** (section 6).

11. **Record:** append the RELEASE_NOTES.md entry (section 7) to `C:\repos\ooh-triage-dashboard\RELEASE_NOTES.md`. Attach evidence screenshots to Jira OOHDASH-122 and OOHDASH-127.

---

## 5. Rollback

**Triggers** (operator decision -- the release doer never rolls back automatically):

- `/healthz` shows `bridge.healthy:false` with a **non-null `lastError`** and this persists more than 60 seconds after the new pod is ready, AND ThingsBoard is otherwise reachable from other paths.
- New Call page shows both green LIVE banner and any red banner simultaneously, more than 10 seconds after page load (banner guard not deployed correctly).
- Pod enters CrashLoopBackOff or OOMKilled state.
- `/healthz` version does not advance to 1.3.8 within 3 minutes of rollout completion.

**Do NOT roll back on:** `bridge.healthy:false` with `lastError:null` within the first 30 seconds (normal pre-probe boot window); a single red banner that clears within 30 seconds (probe resolving); the "writesDisabled is NOT true" script warning; write-failure-streak alerts from live device commands.

**Exact rollback sequence:**

    export KUBECONFIG=~/.kube/ooh.yaml
    kubectl -n iot-services set image deployment/ooh-dashboard \
        ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:e6d98bd
    kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=180s
    curl -s https://ooh.airedale-group.io/healthz
    # expect version 1.3.7, writesDisabled false
    kubectl -n iot-services get pods -l app=ooh-dashboard
    kubectl -n iot-services logs <new-pod-name> --tail=30

After rollback:
- The `v1.3.8` git tag and release commit stay on main. A forward fix ships as v1.3.9.
- No history rewriting or force-push.
- No data to undo: OOHDASH-122 and OOHDASH-127 are rendering and CSS changes only; no Zendesk comments or Cosmos writes.
- Re-verify resources post-rollback: same resource check as step 7 above.

---

## 6. Post-release live proof (operator)

Perform immediately after step 9. Capture screenshots at each step and attach to Jira OOHDASH-122 (L1-L5) and OOHDASH-127 (L4 mobile check). Evidence goes to Jira, not a local folder.

| # | Who | Step | Pass condition |
|---|---|---|---|
| L1 | Orchestrator | Within 60s of pod ready: `curl -s https://ooh.airedale-group.io/healthz` | `"version":"1.3.8"`, `"status":"ok"`, `subsystems.bridge.healthy:true`, `subsystems.bridge.lastError:null`. `thingsboard.read` may show `unknown` on its 60s TTL cycle; this is OOHDASH-124 territory and is not a failure. |
| L2 | Orchestrator | Check new pod logs for probe line | Exactly one `[TB] start-up read probe: ok in <n>ms` line. If `failed` or `timeout`: note the error text; check whether TB was transiently unavailable at restart time before treating as a defect. Not an automatic rollback trigger. |
| L3 | James | Sign in to https://ooh.airedale-group.io. On the New Call page before any site search | Only the green "Device control is LIVE" banner visible. No red "control actions are disabled" banner. This is the primary OOHDASH-122 fix confirmation in production. |
| L4 | James | Search and confirm site 6832 Old Grey Mare; open workspace. Then check at 390 px phone width (real phone or browser dev tools). | Green banner only; no site-level degraded warning. At 390 px: no horizontal scroll; all workspace cards fit within the viewport. This is the OOHDASH-127 confirmation. |
| L5 | James (optional) | Engage the global kill-switch from Admin; confirm banner; clear it. Skip if any live call is active. | While engaged: only red banner visible, green LIVE banner absent. After clearing: green returns, red disappears. |

If L1 shows `healthy:false` with a non-null `lastError`: examine L2 for the error text before escalating. A transient TB 429 at start-up leaves `lastError:null` (rate-limited outcome, not recorded); a genuine failure sets a "Start-up read probe failed:" prefix. The banner clears automatically after the first successful `getSitesByNumber()` call when a handler opens a workspace.

---

## 7. RELEASE_NOTES.md entry (append after v1.3.7 section)

    ## v1.3.8 -- OOHDASH-122 degraded banner + OOHDASH-127 mobile overflow (2026-10-14)

    **Date:** 2026-10-14 | **Type:** patch | **Ships from:** main @ 123a72f

    ### OOHDASH-122: degraded-mode banner false negative

    - Degraded state now means a REAL read failure has been recorded (`lastError` set), not "not yet
      proven". A fresh pod with no read yet is not reported as degraded.
    - One-shot non-blocking start-up read probe (`probeBridgeReadOnce`) fires after port binding,
      sets `bridge.healthy` true (or records a real `lastError`) within the first network round-trip.
    - Green "Device control is LIVE" banner is now hidden whenever any red banner is visible.
      Green and red can never appear together (all nine states S1-S9 from the design truth table).

    23 new unit tests (U1-U14 truth table, P1-P9 + P11 probe suite) and 7 new e2e journeys (E1-E7).

    ### OOHDASH-127: CI/mobile overflow fix

    - Mobile grid-track columns changed from `1fr` to `minmax(0,1fr)` in both mobile breakpoints.
      Eliminates horizontal scroll at 390 px viewport caused by nowrap scope-list tags.
    - Subject span in ticket rows gains `min-width:0` to prevent flex blowout.
    - F015 tonight-callback note test race stabilised (waits for thread fetch before typing).
    - `tests/oohdash-127.spec.js` regression test added.

    ### Accepted known behaviours (unchanged)

    F11: refrigeration lock shows control restriction alongside LIVE banner -- Stream A deny, by design.
    F12: mid-call TB outage shows red banner, clears on workspace reload -- real fault signal, by design.
    F015 (live): brief Loading state in tonight-callback note step -- rare, self-resolving.

    ### Follow-up

    OOHDASH-124: `thingsboardRead` TTL improvement (out of scope, accepted at design DECISION 3).

---

## 8. Recommended CIR runbook text

The orchestrator should route this text to the CIR (OOH_DASHBOARD_DEPLOY.md) to replace the existing cold-start gotcha note at the "Gotcha -- false 'degraded'" bullet. The release doer does not edit the CIR.

---

**v1.3.8 cold-start behaviour (OOHDASH-122)**

After a pod restart the dashboard fires one read-only probe request to ThingsBoard (list one device, no site required) using the read credential. The probe runs in the background after the port is bound and does not delay start-up. The brief window (a few seconds) before the probe completes where `/healthz` shows `bridge.healthy:false` and `lastError:null` is normal; it is not a failure. Kubernetes probes are unaffected (always HTTP 200).

Diagnosing the start-up probe: check the pod log for `[TB] start-up read probe: <outcome> in <n>ms`.

Outcome values:
- `ok`: ThingsBoard reads working; bridge healthy from boot. Red banner will not appear.
- `failed` or `timeout`: ThingsBoard unreachable at start-up. Red "reads unavailable" banner appears; clears automatically after the first successful workspace load. A 401 means the read credential needs rotation.
- `rate-limited`: ThingsBoard returned 429; probe backed off without recording an error. No red banner; latch set by first real workspace load.
- (line absent): probe did not fire; `DATA_MODE` is not `live` or server did not reach `app.listen`. `DATA_MODE` is set in `k8s/deployment.yaml` (env `DATA_MODE`, value `live`).

A red banner that persists beyond 60 seconds after the pod is ready is a genuine ThingsBoard read failure, not a cold-start artefact. Check the `[TB]` probe log line and the TB read credential before rolling back.

Rollback: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:e6d98bd` (v1.3.7 image).
Preserve resources: verify `.spec.template.spec.containers[0].resources` before and after; apply `set resources` if they differ.

---

*Authored by Release doer, 2026-10-14. Nothing has been bumped, built, pushed, or deployed. This is the plan only.*
