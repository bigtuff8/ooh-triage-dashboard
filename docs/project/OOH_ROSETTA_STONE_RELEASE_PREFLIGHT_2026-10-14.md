<!-- gate:contract
SECTION: What ships in this release
OOHDASH-123 "Rosetta Stone" re-plumbs the dashboard's device read, control and feedback path onto Spencer's production ThingsBoard IoT Command Gate contract. It ships on top of the live v1.3.8 (OOHDASH-122 degraded banner + OOHDASH-127 mobile fix). The headline change is the write path: the dashboard now writes <cap>Requested keys (switchRequested / setpointRequested / modeRequested) to SERVER_SCOPE through the gate, and the old writeSharedAttribute / Desired primitive is removed entirely so no Desired write can originate from the dashboard. Around that sit: a true three-outcome confirmation model (CONFIRMED only when a fresh accepted status AND matching telemetry with a timestamp after dispatch are both present -- the OOHDASH-102 false-success bug is not reintroduced); a no-resend NOT CONFIRMED surface (capture-and-escalate only, the watcher keeps watching and updates the ticket); per-device-class copy, limits and poll cadences (Tuya 10s, IT700 copy 5m / limit 45m, IT500 copy 15m / limit 35m, offline 3h); next-scheduled-change display for boiler V1/V2 panels and PowerPause circuits, labelled "based on the device's stored schedule" with a safe fallback; dark-fleet display ("device not reporting", no controls) for the dark IT500 and bare-salus populations; hot-water boost removed from the client (capture-and-escalate instead); save-and-resume across a pod restart; and humane, translated error copy with no raw gate:/vendor: strings on screen. This is a behaviour change to control dispatch, not a cosmetic patch.

SECTION: Test status
The merged Test-RESULTS gate verdict is PASS-WITH-NOTES, independently re-run (not taken on the build doer's word). Unit: 390 pass / 0 fail / 1 environmental skip (391 total) -- the one skip is the IOT_REPO_PATH drift guard that only runs with a sibling checkout present, not a product gap. Playwright e2e: 144 pass / 0 fail / 2 skip, as a single full-suite run well inside the webserver-fragility window. OOHDASH-122 (degraded banner) and OOHDASH-123 (three-outcome) behaviours and their tests pass together on the integrated base. Every one of James's four binding selections (DD-RESEND-UX no-resend, DD-J8-TEST capability-built-not-executed, DD-SCHED-DISPLAY decoded display, DD-WAIT-HANDOFF immediate release) is present in code and exercised by a behaviour test. No defects were found; the "notes" are three non-blocking observations (one cosmetic fail-safe dead branch, the honest e2e isolation handling, and the four go-live preconditions carried by design). No prod ThingsBoard writes were made and J8 was not executed during Test. Release precondition: the two CI required checks on main (unit tests, e2e playwright) must be green on the release commit before the cut runs.

SECTION: Version decision
Live is v1.3.8. This release is a behaviour change to control dispatch and adds several operator-facing features (new write contract, three-outcome model, dark-fleet display, schedule display, boost removal, save-and-resume), which is a minor bump under the project's own rule (patch = fixes, minor = features). The recommendation is a minor bump to v1.4.0 (bash scripts/release.sh minor). A patch bump to v1.3.9 is a defensible alternative if James prefers to keep the series minor-count low, but it under-signals the size of the change. There are no breaking public-API changes (the dashboard exposes no versioned API to external consumers), so a major bump is not warranted. This is captured as DECISION D-123-VERSION.

SECTION: Write-enablement posture
This is the critical decision. Live prod today has writesDisabled=false (device control has been live since 2026-09-24, OOHDASH-19). The re-plumb changes HOW writes happen: the new writeServerScopeAttribute primitive fails closed (throws 423) only when WRITES_DISABLED is true. The routine release path (scripts/release.sh) uses kubectl set image and leaves env UNTOUCHED, so a plain cut would deploy the new, prod-unproven write primitive ENABLED and routing real operator commands immediately -- before the J8 live admission test has proven the new path and before the two SEC credentials that gate J8 have even been rotated (D-SEC-ROTATE, due 2026-10-21, still OPEN as of 2026-10-14). The recommended posture is to ship with the new write path GATED: Spencer sets WRITES_DISABLED=true (a deliberate env change -- James's deployer-ooh scoped credential cannot change env) at or before this deploy, so the new primitive is dormant until D-SEC-ROTATE is confirmed and J8 passes with James's in-person approval; the WRITES_DISABLED=false flip is then a separate go/no-go. Tradeoff: live device control is suspended between this deploy and the J8 go/no-go, and it requires a Spencer action. The alternative is to ship ENABLED (env untouched) and treat J8 as an immediate post-deploy validation, which puts an unproven re-plumbed write path live to real operators ahead of its own stated precondition -- higher risk, and contrary to the design intent that J8 is the go-live gate. Captured as DECISION D-123-WRITE-POSTURE.

SECTION: Go-live preconditions
These four items do NOT block shipping the code, but they are explicit go-live gating items that block enabling and trusting the new control path in prod. SQ-05 (Salus path unproven): no Salus setpoint/mode command has been observed reaching accepted-and-confirmed under the new contract; the salus-it700 contract ships flagged unproven and labelled accordingly. Blocks: declaring Salus control validated. Does not block the Tuya path. D-SEC-ROTATE (two live credentials -- the gate doorbell credential and the Intesis vendor token -- rotated with Spencer's written confirmation by 2026-10-21): OPEN as of 2026-10-14. Blocks: J8, and therefore the WRITES_DISABLED=false flip. SQ-13 (schedule field semantics -- day order, timezone, authority): must be confirmed to fully trust the displayed next-change times; mitigated because dayOrder and tz are single invertible config constants (defaults mon-first, Europe/London), so a correction is a config change, not a rebuild. Blocks: full trust of the schedule display (not the release). J8 (live admission test on ag-brackley-poweroutlet-6, James-approved only): the end-to-end prod proof of the new write path; read-only until James approves in person, and itself blocked until D-SEC-ROTATE is confirmed. Blocks: enabling/validating the new write path in prod.

SECTION: Deployment plan
The cut runs AFTER this gate is approved and James has recorded the version and write-posture selections. All commands run from C:\repos\ooh-triage-dashboard (NOT a worktree) in Git Bash, with az logged in (ACR Task Runner) and KUBECONFIG=~/.kube/ooh.yaml (deployer-ooh). Steps: (1) capture the current live image as the rollback reference (kubectl -n iot-services get deploy ooh-dashboard -o jsonpath of the container image -- expected the v1.3.8 image); confirm it is present in ACR. (2) Verify the working tree in C:\repos\ooh-triage-dashboard is clean (git status --porcelain returns nothing -- release.sh refuses a dirty tree). (3) Confirm main is synced with origin and at the release commit. (4) If Option A (gated) was selected: Spencer sets WRITES_DISABLED=true BEFORE the roll, and confirm /healthz shows writesDisabled:true. (5) Warn any on-shift handlers -- the single pod restarts and forces re-sign-in. (6) Cut with bash scripts/release.sh minor (or patch per D-123-VERSION): it guards main/clean/synced, runs npm version to commit and tag vX.Y.Z, pushes main and the tag, builds the ACR image tagged with the sha + version + latest, kubectl set image, rollout status, prints WRITES_DISABLED/SMS_PROVIDER, polls /healthz. (7) Re-confirm cluster resources match the manifest. (8) Health check /healthz for the new version. (9) Inspect the new pod logs for a clean boot and the resume block. (10) Run the read-only smoke checks. (11) Record: append RELEASE_NOTES.md and attach evidence to Jira OOHDASH-123.

SECTION: Rollback plan
The rollback target is v1.3.8 (the current live image captured in deployment-plan step 1). Rollback is kubectl -n iot-services set image deployment/ooh-dashboard back to the v1.3.8 image, then rollout status, then confirm /healthz shows version 1.3.8. The v1.4.0 (or v1.3.9) git tag and release commit stay on main; a forward fix ships as the next version. Never force-push or rewrite history. Non-destructive: the re-plumb is code-only -- no Cosmos schema change, no data migration, no manifest change beyond the image tag (and, under Option A, the reversible WRITES_DISABLED env change that only Spencer can set or revert). Note on env and rollback: set image does not touch env, so if Option A set WRITES_DISABLED=true, a rolled-back v1.3.8 also runs write-disabled until Spencer reverts it. What cannot be undone: under Option A (gated), no writes occurred so there is nothing to undo; under Option B (enabled), any SERVER_SCOPE *Requested commands already dispatched to real devices under v1.4.0 cannot be un-sent -- a further reason to prefer Option A.

SECTION: Smoke and post-deploy verification
All post-deploy checks this release are READ-ONLY. The live write validation is J8 and is gated on James; it is NOT part of this smoke plan. Checks: /healthz reports the new version, status ok, bridge.healthy true with lastError null, thingsboardRead healthy, zendesk and store healthy, and writesDisabled reflecting the chosen posture (true under Option A). New-pod logs show a clean boot, the save-and-resume block, and no errors. Read-only UI pass (James or orchestrator): sign in, confirm a site, and observe the new read path render -- external-lighting units on the bare switch key now show on/off state, the dark IT500 and bare-salus devices show "device not reporting" with no controls, boiler and PowerPause cards show the next-scheduled-change line, and the hot-water flow shows no boost chip. Confirm the two CI required checks are green on main. Do NOT issue any control command during smoke.

SECTION: Prod safety and secrets
Prod ThingsBoard is READ-ONLY for this release: no control command is issued and, under the recommended Option A posture, the new write primitive is fail-closed (423). This artefact contains no secrets. The two live credentials under D-SEC-ROTATE -- the gate doorbell credential in the rule-chain metadata and the Intesis vendor token on gk-st-office-intesis-1 -- are described structurally only and their values are never copied here or anywhere in the release. No Twilio token, no ThingsBoard credential, no connection string appears in any changed file (the merged Test security scan of the full diff found no credential-shaped literals). The release script uses set image and cannot change any secret or env value.

DECISION: D-123-VERSION: What version does this release ship as? | Minor bump to v1.4.0 (recommended -- a behaviour change to control dispatch plus several new operator-facing features; run bash scripts/release.sh minor) | Patch bump to v1.3.9 (keeps the series patch-only, but under-signals the size of the change; run bash scripts/release.sh patch)
DECISION: D-123-WRITE-POSTURE: Does this release ship with the new write path gated or enabled? | Ship GATED (recommended -- Spencer sets WRITES_DISABLED=true at/before deploy so the new writeServerScopeAttribute primitive fails closed until D-SEC-ROTATE is confirmed and J8 passes with James's approval; live control is suspended until the J8 go/no-go) | Ship ENABLED (env untouched, WRITES_DISABLED stays false; the prod-unproven re-plumbed write path routes real operator commands on deploy and J8 becomes a post-deploy validation -- higher risk, contrary to the design intent that J8 is the go-live gate)
DECISION: D-123-WINDOW: When should the cut run? | Quiet hours, not during an active OOH shift (recommended -- the single pod restarts during rollout and forces every signed-in handler to re-authenticate) | Release now and warn on-shift handlers first via the usual channel
-->

# Release preflight -- OOHDASH-123 "Rosetta Stone" (R1)

**Date:** 2026-10-14
**Ticket:** OOHDASH-123 (R1) -- re-plumb device read/control/feedback onto Spencer's ThingsBoard IoT Command Gate contract
**Ships on top of:** live v1.3.8 (OOHDASH-122 degraded banner + OOHDASH-127 mobile fix)
**Recommended version:** v1.4.0 (minor) -- see DECISION D-123-VERSION
**Branch (this artefact):** preflight/oohdash-123-release off origin/main @ 5ef158c (the merged 123 code + tests on top of v1.3.8)
**Cut command (post-approval only):** bash scripts/release.sh minor (run from C:\repos\ooh-triage-dashboard)
**Authored by:** Release doer. This document is the plan only. Nothing has been bumped, built, pushed, tagged, or deployed. The J8 live test has NOT been run.

---

## 1. What ships

OOHDASH-123 re-plumbs the dashboard onto the production IoT Command Gate contract. The change set (merged on main at 5ef158c, verified by the Test gate):

| Area | Change |
|---|---|
| Write path (headline) | Dashboard writes `<cap>Requested` (switchRequested / setpointRequested / modeRequested) to SERVER_SCOPE via the gate. `writeServerScopeAttribute` added, allow-listed against `registry.REQUESTED_KEYS`. The old `writeSharedAttribute` / Desired primitive is removed entirely -- no Desired write can originate from the dashboard. |
| Three-outcome confirmation | `classifyOutcome` returns CONFIRMED only when a fresh accepted status AND matching confirming telemetry whose ts is after dispatchTs are both present. Accepted-alone is IN-FLIGHT, never success (OOHDASH-102 false-success bug not reintroduced). Stale guard ignores any status/telemetry at or before dispatchTs. |
| No-resend | NOT CONFIRMED surface offers only capture-and-escalate ("please don't treat this as done"); `ctlRetry` and the mid-wait prompt are gone; the watcher keeps watching to the late-watch horizon and writes the result to the ticket. |
| Per-class copy / limits / poll | Env-overridable in config.js: Tuya 10s; IT700 copy 5m / limit 45m; IT500 copy 15m / limit 35m; offline 3h; monitor 48h. |
| Next-scheduled-change display | `services/schedule.js` decodes the next change for boiler V1 (output1..4Schedule), V2 (CHZ1.schedule / DHW.schedule) and PowerPause (schedules), labelled "based on the device's stored schedule", on by default, safe null fallback to "following its programme". |
| Dark-fleet display | salus-it500 and bare-salus contracts carry dark:true / controllable:false; the UI shows "device not reporting" and offers no control. |
| Boost removal | Hot-water boost removed from the client; hot-water flow shows no boost chip and routes to capture-and-escalate. |
| Save-and-resume | In-flight actions survive a pod restart and settle correctly on resume. |
| Humane errors | Translated operator copy; no raw gate:/vendor: strings on screen; raw detail on the ticket. |

No new environment variables, no new secrets, no Cosmos schema change, no data migration, no k8s manifest change beyond the image tag (plus, under the recommended write posture, a reversible WRITES_DISABLED env change owned by Spencer).

Accepted non-blocking note carried from Test: `registry.validateCommand` retains a dead `hwboost` branch returning `hwBoostHoursDesired`, which the write primitive rejects because it is not in `REQUESTED_KEYS` -- a fail-safe dead branch, not a Desired-write leak. Tidy in a later pass; it does not hold this gate.

---

## 2. Test status

| Item | Result |
|---|---|
| Test gate verdict | PASS-WITH-NOTES (merged, independently re-run) -- `OOH_ROSETTA_STONE_TEST_RESULTS_2026-10-14.md` |
| Unit | 390 pass / 0 fail / 1 environmental skip (391 total). Skip = IOT_REPO_PATH drift guard (needs a sibling checkout). |
| e2e (Playwright) | 144 pass / 0 fail / 2 skip, full-suite single run inside the webserver-fragility window. |
| 122 + 123 together | Degraded-banner and three-outcome behaviours and tests pass together on the integrated base. |
| Binding decisions | DD-RESEND-UX, DD-J8-TEST, DD-SCHED-DISPLAY, DD-WAIT-HANDOFF all present in code and behaviour-tested. |
| Defects | None. |
| Secrets in diff | None (full-diff scan, 38 files). |

**Release precondition:** the two CI required checks on main (`unit tests` and `e2e (playwright)`) must be green on the release commit before the cut runs.

---

## 3. Gate lineage

| Stage | Reference |
|---|---|
| Discovery | PR #86 (gate approved 2026-10-14) + addendum `OOH_ROSETTA_STONE_ADDENDUM_2026-10-14.md` (nine research streams) |
| Design | PR #91 -- `OOH_ROSETTA_STONE_DESIGN_2026-10-14.md` (James's four binding selections) |
| Build plan | `OOH_ROSETTA_STONE_BUILD_PLAN_2026-10-14.md` (J8 runbook section 9) |
| Build | merged to main (WU0-WU17), self-audited |
| Test | `OOH_ROSETTA_STONE_TEST_RESULTS_2026-10-14.md` -- PASS-WITH-NOTES |

---

## 4. Live baseline (read-only, 2026-10-14)

`/healthz` read read-only at 2026-10-14:

- version 1.3.8, status ok, authMode oidc, dataMode live
- **writesDisabled false** (device control live since 2026-09-24, OOHDASH-19)
- bridge: mode live, healthy true, lastError null
- thingsboard: read healthy, write false, writeConfigured true
- zendesk healthy and configured; store cosmos healthy
- no active alerts, empty control queue

The writesDisabled:false state is the crux of the write-enablement posture decision (section 6).

---

## 5. Version decision (DECISION D-123-VERSION)

Live is v1.3.8. The re-plumb is a behaviour change to control dispatch plus several new operator-facing features, which maps to a **minor** bump under the project rule (patch = fixes, minor = features, major = breaking public-API changes). There is no external versioned API, so no major bump is warranted.

| Option | Version | Cut command | Note |
|---|---|---|---|
| Recommended | **v1.4.0** (minor) | `bash scripts/release.sh minor` | Signals the size of the change honestly. |
| Alternative | v1.3.9 (patch) | `bash scripts/release.sh patch` | Keeps the series patch-only; under-signals the change. |

---

## 6. Write-enablement posture (DECISION D-123-WRITE-POSTURE) -- CRITICAL

The re-plumb changes HOW writes happen. The new `writeServerScopeAttribute` primitive fails closed (throws 423) only when `WRITES_DISABLED` is true. Prod today runs `writesDisabled=false`. `scripts/release.sh` uses `kubectl set image` and leaves env UNTOUCHED, so a plain cut deploys the new, prod-unproven write path ENABLED and routing real operator commands on deploy -- before J8 proves it and before the SEC credentials that gate J8 are rotated (D-SEC-ROTATE OPEN, due 2026-10-21).

| Option | Posture | What it means | Tradeoff |
|---|---|---|---|
| **Recommended -- Option A** | GATED | Spencer sets `WRITES_DISABLED=true` at/before deploy (James's deployer-ooh creds cannot change env). New primitive dormant until D-SEC-ROTATE confirmed and J8 passes with James's approval; then flip `WRITES_DISABLED=false` as a separate go/no-go. | Live device control is suspended between this deploy and the J8 go/no-go; requires a Spencer env change. No writes occur, so nothing to undo on rollback. |
| Option B | ENABLED | Env untouched; `WRITES_DISABLED` stays false. New path live on deploy; J8 becomes a post-deploy validation. | Prod-unproven re-plumbed write path routes real operator commands ahead of its own stated precondition. Any dispatched commands cannot be un-sent. Higher risk; contrary to design intent. |

**Recommendation: Option A (gated).** The whole point of J8 is to be the go-live precondition for the new write path; shipping enabled bypasses it.

---

## 7. Go-live preconditions (gating items, not shipped-blockers)

These do not block shipping the code; they block enabling and trusting the new control path in prod.

| Precondition | Status 2026-10-14 | What it blocks |
|---|---|---|
| SQ-05 -- Salus path unproven | Carried; salus-it700 ships flagged unproven | Declaring Salus control validated (not the Tuya path, not the release) |
| D-SEC-ROTATE -- both credentials rotated, written confirmation by 2026-10-21 | **OPEN** | J8, and therefore the `WRITES_DISABLED=false` flip |
| SQ-13 -- schedule field semantics (day order, timezone, authority) | Carried; dayOrder/tz are invertible config constants | Full trust of the schedule display; a correction is config-only, not a rebuild |
| J8 -- live admission test (ag-brackley-poweroutlet-6, James-approved) | Read-only; not executed; blocked on D-SEC-ROTATE | Enabling/validating the new write path in prod |

**J8 summary (build plan section 9):** write switchRequested=false (OFF) then switchRequested=true (ON, restore) on ag-brackley-poweroutlet-6; expect pending -> accepted -> switch_1 telemetry flip with server ts > dispatchTs -> CONFIRMED within 10s; no Desired write from the dashboard; capture the full attribute/telemetry timeline to the go-live record. Read-only until James approves in person.

---

## 8. Deployment plan (post-approval only)

All commands from C:\repos\ooh-triage-dashboard (NOT a worktree) in Git Bash. Prereqs: `az login` (ACR Task Runner), `KUBECONFIG=~/.kube/ooh.yaml` (deployer-ooh). Surface: namespace `iot-services`, deployment `ooh-dashboard`, registry `apitechhub` (apitechhub.azurecr.io/ooh-dashboard), URL https://ooh.airedale-group.io.

1. **Capture the rollback reference.** `kubectl -n iot-services get deploy ooh-dashboard -o jsonpath='{.spec.template.spec.containers[0].image}'` -- record it (the v1.3.8 image). Confirm it is in ACR: `az acr repository show-tags -n apitechhub --repository ooh-dashboard --orderby time_desc --output table` should list `v1.3.8`.
2. **Clean tree.** `git status --porcelain` must return nothing (release.sh refuses a dirty tree). Exclude any stray local files via `.git/info/exclude`; never stage anything that does not belong in the release.
3. **Synced main.** `git switch main && git fetch origin && git status -sb` -- `## main...origin/main`, no ahead/behind, HEAD at the release commit.
4. **If Option A (gated) selected:** Spencer sets `WRITES_DISABLED=true` BEFORE the roll; confirm `/healthz` shows `writesDisabled:true`.
5. **Warn on-shift handlers** (DECISION D-123-WINDOW). The single pod restarts during rollout and forces re-sign-in.
6. **Cut:** `bash scripts/release.sh minor` (or `patch` per D-123-VERSION). In order the script: guards main/clean/synced; prints the current live image as the rollback reference; runs `npm version` to commit "release vX.Y.Z" and tag it; pushes main and the tag; builds the ACR image via `az acr build` tagged with the sha + version + latest; `kubectl set image` then `rollout status --timeout=180s`; prints `WRITES_DISABLED` / `SMS_PROVIDER`; polls `/healthz`.
7. **Script warning on writesDisabled.** The script warns if writesDisabled is not true. Under Option A (true) there is no warning. Under Option B (false) the warning is expected and correct (control is intentionally live); only stop if the value is unexpected for the chosen posture.
8. **Resource drift check.** `kubectl -n iot-services get deploy ooh-dashboard -o jsonpath='{.spec.template.spec.containers[0].resources}'` -- expect requests cpu 100m / memory 192Mi, limits cpu 500m / memory 512Mi. If different, `kubectl -n iot-services set resources deployment/ooh-dashboard -c ooh-dashboard --requests=cpu=100m,memory=192Mi --limits=cpu=500m,memory=512Mi`.
9. **Health check.** `curl -s https://ooh.airedale-group.io/healthz` -- expect the new version, status ok, bridge healthy true, lastError null, thingsboardRead healthy, writesDisabled per chosen posture. If version still reads 1.3.8, wait for rollout and retry; do not redeploy.
10. **Pod log check.** Resolve the new pod name explicitly, then `kubectl -n iot-services logs <new-pod> --tail=40` -- clean boot, save-and-resume block, no errors. Ignore ECONNRESET noise from the terminating old pod.
11. **Smoke checks** (section 9).
12. **Record.** Append the RELEASE_NOTES.md entry (section 11) and attach evidence to Jira OOHDASH-123.

---

## 9. Smoke / post-deploy verification (READ-ONLY)

The live write validation is J8 and is gated on James; it is NOT part of this smoke plan. No control command is issued during smoke.

| # | Who | Check | Pass |
|---|---|---|---|
| S1 | Orchestrator | `/healthz` | New version, status ok, bridge healthy true / lastError null, thingsboardRead healthy, zendesk + store healthy, writesDisabled per posture (true under Option A) |
| S2 | Orchestrator | New-pod logs | Clean boot, save-and-resume block present, no errors |
| S3 | James / orchestrator | Sign in; confirm a site; observe read path | External-lighting units on the bare switch key show on/off state; dark IT500 and bare-salus show "device not reporting" with no controls; boiler and PowerPause cards show the next-scheduled-change line; hot-water flow shows no boost chip |
| S4 | Orchestrator | CI on main | `unit tests` and `e2e (playwright)` green on the release commit |

---

## 10. Rollback

Rollback target is **v1.3.8** (the image captured in step 1). Operator decision only -- the release doer never rolls back automatically, and never auto-recovers a failed deploy (report the failure, the error, and the last-known-good image, and let James decide).

Sequence:

    export KUBECONFIG=~/.kube/ooh.yaml
    kubectl -n iot-services set image deployment/ooh-dashboard \
        ooh-dashboard=<v1.3.8-image-from-step-1>
    kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=180s
    curl -s https://ooh.airedale-group.io/healthz
    # expect version 1.3.8
    kubectl -n iot-services get pods -l app=ooh-dashboard
    kubectl -n iot-services logs <new-pod> --tail=30

After rollback:
- The vX.Y.Z git tag and release commit stay on main; a forward fix ships as the next version. No history rewrite, no force-push.
- Non-destructive: the re-plumb is code-only -- no Cosmos schema change, no data migration, no manifest change beyond the image tag.
- Env and rollback: `set image` does not touch env. If Option A set `WRITES_DISABLED=true`, the rolled-back v1.3.8 also runs write-disabled until Spencer reverts it.
- What cannot be undone: under Option A (gated) no writes occurred, so nothing to undo. Under Option B (enabled) any SERVER_SCOPE `*Requested` commands already dispatched to real devices under this release cannot be un-sent.
- Re-confirm resources post-rollback (same check as step 8).

---

## 11. RELEASE_NOTES.md entry (append above the v1.3.8 section, version per D-123-VERSION)

    ## vX.Y.Z -- OOHDASH-123 "Rosetta Stone": IoT Command Gate re-plumb (2026-10-14)

    **Date:** 2026-10-14 | **Type:** minor (or patch per D-123-VERSION) | **Ships on top of:** v1.3.8

    ### What changed
    - Write path re-plumbed onto Spencer's production IoT Command Gate: the dashboard writes
      <cap>Requested keys (switchRequested / setpointRequested / modeRequested) to SERVER_SCOPE
      through the gate. The old writeSharedAttribute / Desired primitive is removed entirely.
    - Three-outcome confirmation: CONFIRMED only on a fresh accepted status AND matching telemetry
      with a timestamp after dispatch. Accepted-alone is in-flight, never success (OOHDASH-102 fixed).
    - No-resend NOT CONFIRMED surface: capture-and-escalate only; the watcher keeps watching and
      updates the ticket.
    - Per-class copy / limits / poll (Tuya 10s; IT700 copy 5m / limit 45m; IT500 copy 15m / limit 35m;
      offline 3h), all env-overridable.
    - Next-scheduled-change display for boiler V1/V2 panels and PowerPause circuits.
    - Dark-fleet display: dark IT500 and bare-salus show "device not reporting", no controls.
    - Hot-water boost removed from the client (capture-and-escalate instead).
    - Save-and-resume across a pod restart; humane translated error copy (no raw gate:/vendor: strings).

    ### Write-enablement posture
    Shipped GATED / ENABLED (record per D-123-WRITE-POSTURE). The new write primitive fails closed
    (423) when WRITES_DISABLED is true. The WRITES_DISABLED=false flip for the new path is a separate
    go/no-go, gated on D-SEC-ROTATE confirmation and the J8 live admission test (James-approved).

    ### Go-live preconditions carried
    SQ-05 (Salus unproven), D-SEC-ROTATE (two credential rotations, written confirmation by 2026-10-21),
    SQ-13 (schedule field semantics), J8 (live admission test). See the preflight for what each blocks.

    ### Test
    PASS-WITH-NOTES. Unit 390/391 (1 env skip); e2e 144/0 (2 skips). 122 + 123 green together.

    ### Accepted non-blocking note
    Dead hwboost branch in registry.validateCommand (fail-safe, rejected by the write primitive;
    not a Desired-write leak) -- tidy in a later pass.

---

## 12. Prod safety and secrets

- Prod ThingsBoard is READ-ONLY this release. No control command is issued, and under the recommended Option A posture the new write primitive is fail-closed (423).
- No secrets in this artefact. The two live credentials under D-SEC-ROTATE -- the gate doorbell credential in the rule-chain metadata (SQ-SEC-1) and the Intesis vendor token on gk-st-office-intesis-1 (SQ-SEC-2) -- are described structurally only and are never copied here.
- The merged Test security scan of the full diff (38 files) found no credential-shaped literals. Twilio and token config are env() reads with no embedded default secret.
- `scripts/release.sh` uses `set image` and cannot change any secret or env value; the `WRITES_DISABLED` change (Option A) is a separate, deliberate, Spencer-owned env action.

---

*Authored by Release doer, 2026-10-14. This is the plan only. Nothing has been bumped, built, pushed, tagged, or deployed, and the J8 live test has not been run. The orchestrator acts only on James's recorded selections for D-123-VERSION, D-123-WRITE-POSTURE and D-123-WINDOW.*
