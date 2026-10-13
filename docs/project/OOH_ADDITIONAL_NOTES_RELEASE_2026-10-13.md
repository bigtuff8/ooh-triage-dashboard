<!-- gate:contract
SECTION: What this release ships
This is a small patch release that moves the live OOH Dashboard from version 1.3.6 to 1.3.7. It ships one feature, OOHDASH-119 "Additional Notes before ticket submit".
- OOH agents get an optional "Additional notes for the IoT team" box on every guided flow, from the first step. It holds up to 1,000 characters, and the counter turns amber at 900.
- Before a ticket is raised there is now a confirm step with a "Record outcome" button. Nothing is sent to Zendesk until the agent presses it.
- The note goes into the ticket's internal [TRG] transcript as a timed line, so the IoT team can see it on the IoT Support Dashboard the next morning.
- After the ticket is raised, the agent can add a late note. It lands as a separate internal [OOH NOTE] comment.
- Drafts survive a page reload within the call and are cleared when the call ends.
Nothing else changes. There are no new settings or secrets, no database changes, and device control and SMS are untouched. The release is cut with the usual one-command release script.

SECTION: Pre-flight checks run tonight
All checks were run read-only on a clean copy of the code about to ship (main at 5df092f).
- Code: local main matches GitHub main exactly. 52 files changed since the live version; the app code changes are in seven files, plus new tests and documents.
- Unit tests: 354 run, 353 passed, 0 failed, 1 known skip. The skip is an old one, unrelated to this feature.
- Full end-to-end browser tests (local, stubbed data, no live calls): 133 run, 131 passed, 0 failed, 2 known skips. The two skips are device-control checks that cannot run against test data. Unit tests cover them instead.
- One thing to fix before the cut: an untracked scratch file (scripts/patch-contractor.mjs) is in the main folder. The release script refuses to run unless the folder is clean. One local command hides it from git without touching the file, the same way earlier releases handled stray files. It is never built into the app image.
- Cache-busting version numbers in the page have been bumped, so agents' browsers will load the new screens.
- Still one server copy (replicas: 1), unchanged. No new environment variables or secrets. No data migration.
- Live site right now: version 1.3.6, healthy, device control on (as intended since 24 Sept). It is showing two "write failure streak" alerts raised at about 19:28 tonight. Those come from live device commands and have nothing to do with this release, but you may want to know about them before deploying.

SECTION: How it goes live and how we undo it
Going live: hide the scratch file from git, run the release script, then check that the live health page reports 1.3.7. The script bumps the version, tags it, builds the image and swaps it in. During the swap the single server restarts for a few seconds, so any agent signed in at that moment has to sign in again.
Expected script warning: at the end the script warns that device writes are not locked. That is correct. Device control has been switched on deliberately since 24 Sept, and the release leaves that setting exactly as it is.
Undo: one command points the live server back at the exact v1.3.6 image (build 080ccab). Then wait for the restart and check the health page reports 1.3.6. The full commands are in the document body. There is no on/off switch for this feature on its own, so undoing it means rolling back the whole release.
What cannot be undone: notes already written into Zendesk tickets stay there after a rollback. That is acceptable, because they are ordinary internal comments.

SECTION: Proof on the live site after release (must pass)
Straight after release, on the live dashboard, using the pub Old Grey Mare (site 6832):
- First confirm that Old Grey Mare 6832 exists and opens on the live system.
- On desktop and at phone width, check that the notes box and the "Record outcome" button are both visible.
- Raise one ordinary (not P1) guided-flow ticket with a note starting "TEST OOHDASH-119 — please ignore —". Check the note appears in the Zendesk ticket and in the IoT Support Dashboard ticket view. That dashboard is zendesk-uat.airedale-api.co.uk; despite the name, it is the live one.
- Add a late note to the same ticket and check it shows as [OOH NOTE] in both places.
- Close the test ticket.
No P1 and no live device commands at any point. If any step fails, we roll back to 1.3.6.

SECTION: Known limits carried and what agents need to hear
- The notes paths for P1 and device control are proven by automated tests only. The live proof deliberately avoids them.
- A pipe character typed in a note shows as a broken bar (¦) in the ticket. This is deliberate, so the IoT dashboard's parser is not confused.
- If saving a late note fails, nobody is alerted. The agent sees an error and can retry, and the text is kept.
- Any signed-in agent can add a note to any ticket number. This risk existed before this feature and was accepted; the follow-up is OOHDASH-120.
- Still one server copy, so every deploy forces a quick sign-in again. The follow-up is OOHDASH-121.
- Sam Day has been asked to sign off the on-screen wording. Whether that blocks release is your decision below.
- Agents should be told about the new box and the new "Record outcome" step. A three-line message is drafted for you in the body.

DECISION: Does Sam Day's wording sign-off block release? | Release now; Sam signs off the wording tomorrow and any tweak is a small follow-up | Hold the release until Sam signs off
DETAIL: Recommend releasing now. The wording has already been checked against the approved design (8 of 8), and a wording tweak is a tiny, low-risk follow-up.

DECISION: When should the release run? | Now, during tonight's OOH shift, picking a moment with no live call | Tomorrow in daytime quiet hours
DETAIL: Recommend daytime quiet hours. The single-server restart forces any signed-in agent to sign in again, and agents are on shift now. If you release tonight, warn the agents first.
-->

# Release preflight — OOHDASH-119 Additional Notes before ticket submit (v1.3.7)

**Date:** 2026-10-13
**Release:** v1.3.7 (patch on live v1.3.6)
**Ships from:** `main` @ `5df092f` ("ooh-triage-dashboard — build gate (#83)")
**Live now:** v1.3.6, image tag / commit `080ccab` (git tag `v1.3.6`), https://ooh.airedale-group.io
**Repo:** `C:\repos\ooh-triage-dashboard`
**Cut command (post-approval only):** `bash scripts/release.sh patch`
**Authored by:** Release doer. This document is the plan only. Nothing has been bumped, built, pushed to main or deployed.

> **Presentation note.** This document has no fenced code blocks. Commands appear as inline `code` chips, in line with earlier OOH release artefacts.

---

## 1. What ships

### 1.1 Version

| Item | Value |
|---|---|
| Current live version | 1.3.6 (`/healthz` confirmed 2026-10-13 ~22:10 BST) |
| Target version | 1.3.7 |
| Bump type | patch (`npm version patch` inside `scripts/release.sh`) |
| Git tag created by the script | `v1.3.7` |
| Image tags created by the script | `ooh-dashboard:<new short sha>`, `ooh-dashboard:v1.3.7`, `ooh-dashboard:latest` |

### 1.2 Changes since live (`080ccab..5df092f`)

Commits: the discovery, design, build-plan and build gates for OOHDASH-119 (PRs #79, #80, #81 revert of an ungated plan, #82, #83). Total diff is 52 files, +5,618 / −77.

**Shipped application code (goes into the image):**

| File | Plain-English change |
|---|---|
| `public/js/notes.js` (new) | The notes box component. It shows a 1,000-character counter that turns amber at 900, autosaves drafts to the browser session (`ooh_note_draft`), keeps focus while the screen redraws, and drives the post-submit "Add a note" box (open → saving → saved / error, with retry). |
| `public/js/flows.js` | Adds the notes box to every guided flow and a confirm step with the "Record outcome" button. Sends `additionalNotes` with the outcome, echoes "Your notes are on ticket #N" after submit, and treats a whitespace-only note as no note (DF-01 fix). |
| `public/js/control.js` | Carries `additionalNotes` through the device-control finish path. |
| `public/js/views.js` | Clears the draft on end call, cancel and "Add another issue". Adds the notes box to the Tonight "raise a query" path. |
| `public/js/app.js` | Reads the notes cap from `/api/me`. Wires draft lifecycle hooks. |
| `public/index.html` | Loads `notes.js` and bumps the cache-busters (from `?v=1.0.2` to `1.3.7`–`1.3.9`) so browsers fetch the new scripts. |
| `routes/api.js` | Accepts `additionalNotes` on `/api/outcomes` and `/api/query`. Adds a `kind=additional-notes` path on `POST /api/tickets/:id/notes` that writes an `[OOH NOTE]` internal comment, protected against duplicate submits by an in-process idempotency map with a 60-second expiry. Exposes `notes.maxChars` on `/api/me`. Error logs record the ticket ID and error message only, never note content. |
| `services/zendesk.js` | Adds `normaliseAdditionalNotes()`. It trims the note, caps it at 1,000 characters, turns line breaks into " / ", defuses text that looks like the `Operator:` / `Outcome:` headers, and swaps every `|` for `¦` (DF-02 fix). It also appends the timed "Additional notes from OOH agent" line to the `[TRG]` transcript. |
| `config.js` | Adds the constant `config.notes.maxChars = 1000`. This is a constant, not an environment variable. |

**Not in the image:** tests (`test/`, `tests/`), design, test and build documents, mockup HTML, and screenshots. `.dockerignore` excludes `tests`, `*.md` and `.claude`. The Dockerfile copies only `server.js`, `config.js`, `services/`, `routes/`, `public/` and `data/fixtures` + `data/site-aliases.json`.

### 1.3 Cache-buster

Confirmed in `public/index.html` on `5df092f`:
- `styles.css?v=1.3.7`
- `api.js?v=1.3.7`
- `notes.js?v=1.3.8`
- `flows.js?v=1.3.9`
- `control.js?v=1.3.8`
- `views.js?v=1.3.8`
- `app.js?v=1.3.8`

All of these differ from the live `?v=1.0.2`, so every changed script is fetched fresh. The values do not line up exactly with 1.3.7, but that is cosmetic and has no effect on behaviour.

---

## 2. Gate lineage

| Stage | Reference |
|---|---|
| Discovery | PR #79 (`2d9718c`) — `OOH_ADDITIONAL_NOTES_DISCOVERY_2026-10-13.md` |
| Design | PR #80 (`58366fd`) — `OOH_ADDITIONAL_NOTES_DESIGN_2026-10-13.md` + DF-09 mockup |
| Build plan | PR #82 (`c6690fc`) — `OOH_ADDITIONAL_NOTES_BUILD_PLAN_2026-10-13.md` (the ungated plan commit `18b3ef9` was reverted in PR #81) |
| Build | PR #83 (`5df092f`) — `OOH_ADDITIONAL_NOTES_BUILD_2026-10-13.md` |
| Test | `OOH_ADDITIONAL_NOTES_TEST_RESULTS_2026-10-13.md` — overall PASS (DF-01 and DF-02 found, fixed and verified) |
| Pre-release live proof | `OOH_ADDITIONAL_NOTES_PRE_RELEASE_LIVE_PROOF_2026-10-13.md` — real Zendesk ticket #50346 (S1 [TRG] note, S2 [OOH NOTE]), checked by the operator in the IoT Support Dashboard at 20:49, then closed |

---

## 3. Preflight checks (run 2026-10-13, read-only)

| # | Check | Result |
|---|---|---|
| P1 | Local `main` == `origin/main` | PASS. Both at `5df092f66079ed58a82a82244cf1603a400c1e55`, after `git fetch`. |
| P2 | Working tree clean (release.sh guard: `git status --porcelain` must be empty) | **WILL FAIL as-is.** One untracked file, `scripts/patch-contractor.mjs` (operator scratch), is not ignored (`git check-ignore` returns nothing). Fix it before the cut by adding the path to `.git/info/exclude`, as earlier releases did for stray files (that file already lists `.claude/` and `docs/project/releases/CROSS-STREAM_cellar-vs-p1-sms.md`). The file itself is not touched. It is not part of the image, because the Dockerfile never copies `scripts/`. |
| P3 | Unit suite on a clean worktree of `origin/main` (`C:\repos\ooh-119-rel.wt`, `npm ci`, `npm run test:unit`) | PASS. **354 tests: 353 pass, 0 fail, 1 skip.** The skip is the old CR3 `REFRIG_PROFILES` test. The 7 "pre-existing failures" listed in the test results do not appear on a clean checkout with no `.env`, so they were caused by that local environment. |
| P4 | Full local e2e (`npx playwright test`, `DATA_MODE=fixture`, `AUTH_MODE=dev`, no `.env` present, so no live Zendesk/TB/SMS) | PASS. **133 tests: 131 pass, 0 fail, 2 skip** (TF-18/TF-19, fixture limitation, covered by unit route tests). Run time 4.9 min. This includes the builder spec E1–E26 and the tester spec TF-01–TF-34. |
| P5 | `k8s/deployment.yaml` replicas | `replicas: 1`, unchanged since `080ccab`. The diff shows no changes to `k8s/`, `Dockerfile`, `package.json` or `package-lock.json`. |
| P6 | New env vars or secrets | None. No new `process.env` / `env(` reads in the shipped code diff. The cap is the code constant `config.notes.maxChars`. |
| P7 | Schema / data migration | None. Notes are written only as Zendesk internal comments. No Cosmos container or document-shape change. |
| P8 | Live baseline (`GET https://ooh.airedale-group.io/healthz`) | `version 1.3.6`, `status ok`, `writesDisabled:false` (device control on since 2026-09-24, OOHDASH-19), Zendesk / TB / Cosmos healthy. **Two `write-failure-streak` alerts are active** (raised 18:28 and 18:29 UTC). They come from live device commands and are not caused by this release. Noted so the operator is aware before deploying. |
| P9 | Build-context safety | `.dockerignore` excludes `.env`, `.env.*`, `.claude`, `.git`, `node_modules`, `tests`. There is no `.claude/worktrees` folder in the repo, so the CIR WinError-3 long-path issue does not apply (v1.3.6 was built the same way). |

---

## 4. Release steps (post-approval only)

All commands run from `C:\repos\ooh-triage-dashboard` in Git Bash. The prerequisites are `az login` (ACR Task Runner) and `KUBECONFIG=~/.kube/ooh.yaml` (`deployer-ooh`).

1. **Make sure the rollback image exists:** `az acr repository show-tags -n apitechhub --repository ooh-dashboard --query "[?@=='080ccab']" -o tsv` should print `080ccab`.
2. **Hide the scratch file from git (local only, not committed):** `echo scripts/patch-contractor.mjs >> .git/info/exclude`, then `git status --porcelain` should print nothing.
3. **Check you are on synced main:** `git switch main && git fetch origin && git status -sb` should show `## main...origin/main` with no ahead/behind count.
4. **Warn the agents** if releasing during a shift (single pod; see §7).
5. **Cut:** `bash scripts/release.sh patch`. In order, the script:
   - checks you are on main, the tree is clean and in sync with origin;
   - prints the current live image as the rollback reference, which must read `apitechhub.azurecr.io/ooh-dashboard:080ccab`;
   - runs `npm version patch`, which commits "release v1.3.7" and tags `v1.3.7`;
   - runs `git push origin main` and `git push origin v1.3.7`;
   - runs `az acr build --registry apitechhub --image ooh-dashboard:<sha> --image ooh-dashboard:v1.3.7 --image ooh-dashboard:latest .`;
   - runs `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<sha>`, then `rollout status --timeout=180s`;
   - prints the live `WRITES_DISABLED` / `SMS_PROVIDER` values and checks `/healthz`.
6. **Expected script warning:** "writesDisabled is NOT true". This is correct and expected. Live has run `WRITES_DISABLED=false` since 2026-09-24. `set image` cannot change env, so the value stays `false`, the same as before the release. Only stop if it reads anything other than `false`.
7. **Health check:** `curl -s https://ooh.airedale-group.io/healthz` should show **`"version":"1.3.7"`**, `"status":"ok"`, `"writesDisabled":false`, and Zendesk `healthy:true`, `configured:true`. If the version still reads 1.3.6, wait for the rollout to finish and retry; do not redeploy.
8. **Find the new pod and check its logs:** `kubectl -n iot-services get pods -l app=ooh-dashboard`, then `kubectl -n iot-services logs <new-pod> --tail=30`. Look for a clean boot and the write-enabled banner. Ignore ECONNRESET noise from the terminating pod.
9. **Run the post-release live proof (§6).**
10. **Record:** fill in the §8 release record and append a v1.3.7 entry to `RELEASE_NOTES.md`.

---

## 5. Rollback

**Trigger:** any failure in §4 steps 7–8 or §6, at the operator's decision. The release doer never rolls back automatically.

Exact sequence (Git Bash):

1. `export KUBECONFIG=~/.kube/ooh.yaml`
2. `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:080ccab`
3. `kubectl -n iot-services rollout status deployment/ooh-dashboard --timeout=180s`
4. `curl -s https://ooh.airedale-group.io/healthz` should show `"version":"1.3.6"` and `"writesDisabled":false`
5. `kubectl -n iot-services get pods`, then check the new pod's logs (`kubectl -n iot-services logs <pod> --tail=30`).

Notes:
- `set image` changes only the image, so env (`WRITES_DISABLED`, `SMS_PROVIDER`, secrets) is untouched in both directions.
- The `v1.3.7` git tag and version commit stay on `main`. A forward fix would ship as v1.3.8. We do not rewrite history or force-push.
- **Point of no return:** notes already written into Zendesk tickets (internal `[TRG]` lines and `[OOH NOTE]` comments) stay after a rollback. This is acceptable: they are ordinary internal comments, and the IoT dashboard already parses them.
- **No per-feature killswitch.** The notes box cannot be switched off on its own. Rollback means the whole v1.3.6 image.
- The single pod means a rollback also forces signed-in agents to sign in again.

---

## 6. Post-release live proof (hard condition, operator-chosen)

Run on **https://ooh.airedale-group.io** (production, B2C sign-in as the operator) immediately after §4 step 7.

| # | Step | Pass criterion |
|---|---|---|
| L0 | Search for **Old Grey Mare, site 6832** and open the workspace | The site resolves and opens on the live system. If it does not, stop and pick a replacement site with the operator. Do not improvise. |
| L1a | Desktop (≥1280px): start a standard (non-P1) guided flow, e.g. Heating → "Give guidance & log it" | The "Additional notes for the IoT team (optional)" box and its `0 / 1000` counter are visible from the first step. "Record outcome" is visible at the confirm step. |
| L1b | Phone width (real phone, or browser at 390px) | The notes box, counter and "Record outcome" are visible with no sideways scrolling. |
| L2 | Type `TEST OOHDASH-119 — please ignore — post-release live proof v1.3.7`, then press Record outcome | The echo "Your notes are on ticket #N" appears. In Zendesk, ticket #N's internal `[TRG]` comment has the timed line "Additional notes from OOH agent: …". In the **IoT Support Dashboard** (https://zendesk-uat.airedale-api.co.uk, which is the live IoT dashboard despite the name), the ticket detail shows the note as a timed step. |
| L3 | Press "+ Add a note to ticket #N", type `TEST OOHDASH-119 — please ignore — late note`, then Save | "Note saved to ticket #N". Zendesk shows an internal comment starting `[OOH NOTE]`. The IoT Support Dashboard shows the `[OOH NOTE]`. |
| L4 | Close the test ticket in Zendesk: add the internal comment "OOHDASH-119 post-release test ticket — closed", then set status to solved | The ticket is solved. Only one ticket was created. |

**Constraints:** no P1 outcome, and no live device commands (do not press any control buttons). The test ticket must start with "TEST OOHDASH-119 — please ignore —".

**Fail:** if any of L1–L3 fails, report it to the operator. The recommended action is the §5 rollback to `080ccab`.

---

## 7. Conditions and known limitations carried

| # | Item | Status |
|---|---|---|
| C1 | Notes on P1 paths (kitchen, fridge, contractor, lighting) and on device-control finish/escalate are proven by **automated tests only** (TF-06/09/11/12, E-spec, unit route tests). The live proof deliberately avoids P1 and device commands. | Carried, accepted |
| C2 | A pipe character in a note appears as a broken bar (¦) in Zendesk and the IoT dashboard (DF-02 fix protects the TRG-STEP field separator). | Carried, by design |
| C3 | No alert when a late-note save fails. The agent sees a plain-English error and can retry, and the text is kept. Nothing is sent to the IoT team about failed saves. | Carried, accepted |
| C4 | IDOR: any signed-in operator can add a note to any ticket ID via `/api/tickets/:id/notes`. This existed before (shared with `/followup`, `/thread`); the operator stamp is recorded on every note. | Accepted 2026-10-13; follow-up **OOHDASH-120** |
| C5 | `replicas: 1`. Each deploy or rollback drops the only pod, and agents must sign in again. The idempotency map is in-process, which is correct at one replica. | Carried; follow-up **OOHDASH-121** |
| C6 | **Sam Day copy sign-off: requested.** The on-screen wording matches the approved design §6 (F-02, 8 of 8). | **DECISION 1 below** |
| C7 | Agent comms about the new field and the Record outcome step | Draft below, for the operator to send |
| C8 | Release timing while agents are on shift (single pod) | **DECISION 2 below** |
| C9 | Two `write-failure-streak` alerts were active on live before the release (18:28/18:29 UTC). They are not related to this release. | For the operator's awareness |

### 7.1 Draft message to OOH agents (for the operator to send)

> From tonight's update, every call flow has an optional "Additional notes for the IoT team" box. Anything you type there goes into the ticket for the IoT team's morning review (it is not sent in urgent P1 texts).
> Tickets are no longer raised automatically at the end of a flow: check the summary and press **Record outcome** to raise it.
> Forgot something? After the ticket is raised, press "+ Add a note to ticket #…" to add a late note.

---

## 8. Release record (to fill in after the cut)

| Field | Value |
|---|---|
| Version | v1.3.7 |
| Release commit / tag | (the "release v1.3.7" commit sha) / `v1.3.7` |
| Built from | `main` @ `5df092f` + version commit |
| Image | `apitechhub.azurecr.io/ooh-dashboard:<sha>` (+ `:v1.3.7`) |
| Previous image (rollback ref) | `apitechhub.azurecr.io/ooh-dashboard:080ccab` (v1.3.6) |
| What shipped | OOHDASH-119 Additional Notes before ticket submit |
| Gate reference | Test results PASS (`OOH_ADDITIONAL_NOTES_TEST_RESULTS_2026-10-13.md`), build gate PR #83, and this preflight's release-preflight gate |
| Remote / branch / target | `origin` (bigtuff8/ooh-triage-dashboard) / `main` / AKS `apitechhub`, ns `iot-services`, deploy `ooh-dashboard` |
| `/healthz` after release | (version 1.3.7, writesDisabled false) |
| Live proof L0–L4 | (pass/fail, test ticket #) |
| Deploy status | (succeeded / rolled back) |
| Timestamp / confirmed by | (time) / James Brown |
