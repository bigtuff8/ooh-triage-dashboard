<!-- gate:contract
SECTION: What is being released.
A single patch release, v1.3.4, covering two stories in one commit. OOHDASH-112 replaces the Outside Lighting read-aloud script with two fully-written sentences — one per device state — that explain the dusk sensor, the one-off nature of the override, and the automatic next-day reset. OOHDASH-111 upgrades the "still not working" outcome from a next-working-day capture to a live P1 escalation: the on-duty manager is texted immediately, matching the behaviour already in place for Kitchen, Fridge and Contractor P1s. No server code changed, no database schema changed, no new endpoints, no new env vars. The release uses `scripts/release.sh patch` which uses `kubectl set image` — it cannot change `WRITES_DISABLED` or `SMS_PROVIDER`; both remain exactly as live.

SECTION: Gate lineage.
Four pre-release gates cleared in order: Discovery (PR #66), Design (PR #67, commit 5079806), Build-plan (PR #68, commit 27d4830, CI green), and Test-results (PR #69, commit c091e23). Build and test gates were passed using `--allow-missing-lineage`, citing the merged predecessor PRs — the known self-gate run-id gap; the predecessor work is genuinely merged and audited. Main is now at c091e23.

SECTION: Test evidence.
Unit suite: 300 pass, 0 fail, 1 pre-existing skip (unchanged from baseline). Playwright e2e full suite: 57 pass, 0 fail. All 9 design §8 assertions verified pass by the independent test stage: P1 fires on "still not working"; regression guard (override-resolved stays a capture, no SMS); log-mode honesty; no-device guard; p1Summary propagation; online and offline script text; responsive render; unhappy-path error surfacing.

SECTION: Conditions.
D2 (SMS_PROVIDER=twilio active in production) is RESOLVED — confirmed live by the operator on 2026-10-08; 111 will genuinely page. D3 (Sam Day wording sign-off) and B2C (live visual walkthrough) are CARRIED as post-ship confirmations. The operator has elected to ship on this basis: both are confirmations of correct behaviour, not behaviour risks; 112 is text-only and the dev-auth e2e fully covers all 9 design assertions.

SECTION: The cut.
Post-approval, the Orchestrator runs `scripts/release.sh patch` from clean, synced main. Step by step: (1) guards — confirms on main, clean tree, synced with origin; (2) `npm version patch` — bumps package.json 1.3.3 to 1.3.4, commits "release v1.3.4", tags v1.3.4; (3) pushes main and the v1.3.4 tag to origin; (4) `az acr build` — builds the Docker image in ACR tagged with both the git sha and v1.3.4; (5) `kubectl -n iot-services set image` — rolls the new image out (env untouched); (6) verifies `/healthz` reports version 1.3.4 and `writesDisabled:true`. Rollback if needed: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=<prev image>` — the script prints the previous image tag at startup.

DECISION: Go / No-Go — approve to cut v1.3.4. | Go — cut the release | No-Go — hold, reason below
-->

# Release preflight — OOHDASH-111 & OOHDASH-112: Outside Lighting P1 escalation + supporting text

**Release:** v1.3.4 (patch — 1.3.3 → 1.3.4)
**Date:** 2026-10-08
**Branch / head commit:** `main` at `c091e23` (test gate merged)
**Release doer:** Release stage

> **Presentation note.** No fenced code blocks appear in this artefact. Commands and code strings are shown as inline `code` chips, pipe tables, and bulleted prose — the same convention as the preceding stream artefacts — so this document renders cleanly in the gate review card.

---

## 1. Release summary

**What a handler or tester will notice after v1.3.4 ships**

- **OOHDASH-112 — revised Outside Lighting read-aloud script.** When the Outside Lighting triage flow opens, the words the handler reads to the caller have changed. The online-device state now reads a sentence explaining that the lights are on an automatic dusk-till-dawn sensor, that the override only affects tonight, and that the sensor picks everything back up automatically from tomorrow — so callers understand they are not breaking anything permanent. The offline-device state carries the same explanation and retains the fuse-board check. The previous mid-sentence ternary ("There's a manual override for the outside lights…") is gone.

- **OOHDASH-111 — "still not working" now escalates as P1.** If the caller tries the manual override and the lights still do not come on, clicking "Still not working — capture & escalate" now fires a live P1 escalation: the on-duty manager is texted immediately, a red "Escalated — P1" outcome card appears in the flow, and the Zendesk ticket is filed with `priority:urgent` and the `ooh_p1` tag. The previous behaviour — "I've logged this for the IoT team to investigate first thing" with a normal-priority capture — is gone from this branch. The "Caller sorted it with the override" path is unchanged: no SMS, blue capture card, normal priority.

---

## 2. Gate lineage

All four pre-release gates are cleared. Main is at `c091e23`.

| Gate | PR | Commit | Status |
|---|---|---|---|
| Discovery | #66 | — | Merged |
| Design | #67 | `5079806` | Merged |
| Build-plan | #68 | `27d4830` | Merged — CI green (unit 300/0/1, e2e 57/0) |
| Test-results | #69 | `c091e23` | Merged |

**`--allow-missing-lineage` overrides used on PR #68 (build) and PR #69 (test).** Both gates were raised as consecutive self-gate runs, which each receive phase-specific run IDs — the harness cannot resolve the predecessor chain locally, so the override is required. The predecessor work is genuinely merged (PRs #66 and #67 are merged; the build artefact cites commit 5079806 which is the merged design gate; the test artefact cites commit 27d4830 which is the merged build). The override does not waive the gate; it resolves a known tooling gap in phase-lineage tracking documented in the session memory (`gate-phase-lineage-selfgate-gap.md`).

---

## 3. Test evidence

### 3.1 Automated suite

| Suite | Command | Pass | Fail | Skip |
|---|---|---|---|---|
| Unit | `npm run test:unit` | 300 | 0 | 1 |
| Playwright e2e (full) | `npx playwright test` | 57 | 0 | 0 |

The 1 skip is the pre-existing CR3 profile-populate enforcement skip (`cr3-cellar-profile.json` probe artefact not yet present) — unchanged from before this change set, accepted interim condition.

The 8 new tests in `tests/outside-lighting-p1.spec.js` are included in the 57 e2e total. No pre-existing test broken. Both builds (build phase + independent test phase) observed these counts.

### 3.2 Design §8 assertions — 9/9 PASS

Verified by the independent test stage against `main` at `27d4830` (build merge) using the dev-auth harness. Results are recorded in the test artefact `OOH_OUTSIDE_LIGHTING_TEST_2026-10-08.md` §3.

| Assertion | Source | Verdict |
|---|---|---|
| P1 fires on "still not working"; card is `outcome-p1`; POST `type:'escalate-p1'` | §8-111-1 | PASS |
| Regression guard: `r:'ok'` stays capture; no `ooh_p1` tag; no SMS emitted | §8-111-2 | PASS |
| Log-mode honesty: lighting P1 card shows "Text not sent" fallback | §8-111-3 | PASS |
| No-device guard: scope alert shown; "Still not working" chip absent | §8-111-4 | PASS |
| `p1Summary` propagates as `'External lighting not responding'` in POST body and SMS | §8-111-5 | PASS |
| Online script: dusk sensor + "only affects tonight" + "picks everything back up"; no fuse-board | §8-112-1 | PASS |
| Offline script: all online points plus "fuse board" and "tripped breaker" | §8-112-2 | PASS |
| ≤1100px viewport: `.script` block `scrollWidth <= clientWidth`; no overflow | §8-112-3 | PASS |
| Unhappy path: POST failure surfaces inline error; no silent drop; no auto-retry | §8 final | PASS |

---

## 4. Conditions status

| # | Condition | Owner | Status at release |
|---|---|---|---|
| D2 | `SMS_PROVIDER=twilio` active in production before 111 ships | Spencer / IoT ops | **RESOLVED** — confirmed live by operator (James) 2026-10-08. OOHDASH-111 will genuinely text the on-duty manager on the first "still not working" lighting P1. |
| D3 | Sam Day signs off the OOHDASH-112 wording (three questions: sensor universality, auto-reset reliability, fuse-board as first action) | Sam Day (IoT Support lead) | **CARRIED** — post-ship confirmation. 112 is a text-only change with zero behaviour risk; the dev-auth e2e fully covers all assertions. Operator has elected to ship and route D3 to Sam after go-live. |
| B2C | Live visual walkthrough on the deployed app behind Azure B2C auth | James / IoT team | **CARRIED** — no handler credentials available in the CIR for automated verification. The automated suite covers all 9 design §8 assertions via the dev-auth harness. B2C is a human sign-off on visual render, not a behaviour test. Operator has elected to ship and route this to the team for a walk-through post-release. |

D3 and B2C are confirmations of already-verified behaviour, not open behaviour questions. The operator's election to ship on these terms is recorded here and is explicit.

---

## 5. The cut — post-approval steps

**Orchestrator executes this command after operator approval:**

`scripts/release.sh patch`

Run from the repo root on a clean, synced `main` (`C:\repos\ooh-triage-dashboard`). This is the only authorised release path.

### 5.1 What the script does, step by step

- **Guard check.** Confirms the current branch is `main`, the working tree is clean, and `HEAD` matches `origin/main`. Fails fast with an error message on any violation.
- **Capture the live image.** Records the current live image tag from `kubectl -n iot-services get deploy ooh-dashboard` — this is the rollback reference, printed at the end.
- **`npm version patch`.** Bumps `package.json` from `1.3.3` to `1.3.4`, commits `release v1.3.4`, and creates the git tag `v1.3.4`.
- **Push main and tag.** Pushes `main` and `v1.3.4` to origin — the git tag is the permanent audit anchor for this release.
- **ACR build.** Runs `az acr build --registry apitechhub --image ooh-dashboard:<sha> --image ooh-dashboard:v1.3.4 --image ooh-dashboard:latest` — builds the Docker image in Azure Container Registry, tagged with both the git sha and the version. No local Docker required.
- **`kubectl set image`.** Runs `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<sha>` then waits for `rollout status --timeout=180s`.
- **Verify.** Reads the live env from the pod spec (confirms `WRITES_DISABLED` and `SMS_PROVIDER` are untouched), then polls `https://ooh.airedale-group.io/healthz` up to five times. Expects `version:1.3.4` and `writesDisabled:true`.

### 5.2 Prereqs

- `az login` with the ACR Task Runner identity (tenant `002bfc30`, James's object id `ec79d06a-…`, granted by Spencer — see `DEPLOY_RUNBOOK.md §0`).
- `KUBECONFIG=~/.kube/ooh.yaml` (the deployer-ooh scoped kubeconfig Spencer issued — `kubectl set image` and log read only; cannot apply/create/delete or read secrets).
- `main` clean and synced to `origin/main` at `c091e23` — the script's own guard will fail if not.

### 5.3 Healthz verification

After rollout completes, the script polls `https://ooh.airedale-group.io/healthz`. The expected response body:

- `version`: `1.3.4`
- `writesDisabled`: `true`

A warning is printed if `writesDisabled` is anything other than `true` — **stop and investigate before continuing** in that case. The health check returns HTTP 200 even in a degraded subsystem state (by design — to avoid single-replica restart on a transient blip); read the body, not just the status code.

### 5.4 Rollback

If the rollout fails or the healthz check shows an unexpected state, do not attempt automated recovery. The script prints the previous image tag at startup as "current live image (rollback ref)". Rollback is:

`kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=<prev image>`

This is non-destructive: no database migrations, no consumer changes, no manifest apply — a `set image` undo is sufficient. `WRITES_DISABLED` and `SMS_PROVIDER` are not touched by either direction.

---

## 6. Safety confirmation

- **No env changes.** `scripts/release.sh` uses `kubectl set image` exclusively — it cannot and does not change `WRITES_DISABLED`, `SMS_PROVIDER`, or any other env var. Both vars remain exactly as live: `WRITES_DISABLED=true` (enforced), `SMS_PROVIDER=twilio` (confirmed D2). A write-flip remains a separate, deliberate manifest change and is not part of this release.
- **No schema changes.** No database migrations, no new Cosmos containers, no new Zendesk fields. The `/api/outcomes` P1 route is reused unchanged.
- **No new services.** The escalation path (Twilio, `OohSmsLog`, `OohAuditLog`) is pre-existing infrastructure shared with K3/FR1/CTR1. Nothing new runs in the background.
- **Single-replica caveat (RB-4).** The app runs one replica. The `set image` rollout briefly drops the pod — existing signed-in handlers are returned through SSO mid-shift. Deploy during quiet hours as per `DEPLOY_RUNBOOK.md §3`.
- **Rollback reference.** The script prints and the release record will record the previous image tag. The v1.3.4 git tag marks the exact shipped commit permanently.

---

## 7. Post-release record (to be completed by Orchestrator after cut)

| Field | Value |
|---|---|
| Version released | v1.3.4 |
| Commit | (post-cut — `npm version` commit hash) |
| Tag | `v1.3.4` |
| ACR image sha | (post-cut — printed by script) |
| Previous image (rollback ref) | (printed by script at start) |
| Work items | OOHDASH-111, OOHDASH-112 |
| Gate reference | Discovery #66, Design #67 (5079806), Build #68 (27d4830), Test #69 (c091e23) |
| Remote / branch | origin/main |
| Deploy target | `iot-services/ooh-dashboard` → `https://ooh.airedale-group.io` |
| Deploy status | (post-cut) |
| Healthz verified | (post-cut — version + writesDisabled:true) |
| Operator confirmation | James — 2026-10-08 |
| D3 post-ship | Route to Sam Day (OOHDASH-112 wording sign-off — three questions from design §5) |
| B2C post-ship | James / IoT team manual walk-through on live app using handler login |
