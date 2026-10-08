<!-- gate:contract
SECTION: What this release cuts.
A single patch — v1.3.5 — shipping one targeted fix to the P1 outcome card in `public/js/flows.js`. Across all four P1 entry points (Kitchen K3, Fridge FR1, Contractor CTR1, Outside Lighting), the card previously showed a red alarm reading "Text not sent — phone the on-duty manager now." That warning was false: OOH never sends the SMS. The IoT Support Dashboard detects the `ooh_p1` tag placed on the Zendesk ticket and pages the on-duty manager from there (Approach B). The fix replaces the false conditional with one honest static sentence: "The P1 is logged as ticket #NNN in the IoT Support dashboard, which pages the on-duty manager." No server code was changed. SMS behaviour is unchanged. The cut command is `scripts/release.sh patch` from clean synced main.

SECTION: Gate lineage and test evidence.
Build gate: PR #71, merge commit 70d7bfc, CI green. Test gate: PR #72, commit 3d38efe (current HEAD on main). Both gates carried `--allow-missing-lineage` — operator-directed single-stage hotfix; the design gate was the operator directive itself (no formal design ceremony). Unit suite: 300 pass, 0 fail, 1 accepted skip (CR3 `REFRIG_PROFILES` file absent — pre-existing). Playwright e2e: 57 pass, 0 fail. Lighting, fridge, and contractor P1 paths all verified: honest Approach-B line present, old "Text not sent" and "phone the on-duty manager now" strings absent. Override-doesn't-escalate guard (111-B) intact. Regression sweep clean — every surviving hit of the old strings is inside a `not.toContainText()` absence assertion.

SECTION: Conditions and blocking status.
No conditions are blocking. The B2C live visual walkthrough was carried — no OIDC/B2C credentials are present in the CIR `credentials/` directory and none are needed for this display-text-only release. SMS behaviour is unchanged by this patch: `SMS_PROVIDER` and `WRITES_DISABLED` are preserved as-is by `set image`. `ooh_p1` tagging and the IoT Support Dashboard paging path remain unaffected.

DECISION: Release go/no-go — cut v1.3.5 by running `scripts/release.sh patch` from clean synced main. | Go — cut it | No-go — hold and state reason
-->

# Release preflight — P1 dispatch-status honesty patch (v1.3.5)

**Date:** 2026-10-08
**Release:** v1.3.5 (patch, fast-follow to v1.3.4)
**Current HEAD on main:** 3d38efe
**Repo:** `C:\repos\ooh-triage-dashboard`
**Cut command:** `scripts/release.sh patch` (Orchestrator runs this post-approval)

> **Presentation note.** Commands and identifiers are shown as inline `code` chips — no fenced blocks — so the artefact renders cleanly in the gate review card. This mirrors the house style established in `OOH_OUTSIDE_LIGHTING_DESIGN_2026-10-08.md`.

---

## 1. Release summary

### 1.1 What changed

A single line in `public/js/flows.js` at the `outcomeP1` renderer (around line 246) was replaced. The old renderer held a conditional on `res.p1.dispatchOk`: when true it claimed "A text message has been sent …"; when false (always, under Approach B) it showed a red alarm: "Text not sent — phone the on-duty manager now." Both branches were false.

The replacement is one unconditional sentence: "The P1 is logged as ticket #`${res.ticket.id}` in the IoT Support dashboard, which pages the on-duty manager."

Because `outcomeP1` is the shared renderer for every P1 entry point, a single edit corrects the dispatch-status card across all four flows — Kitchen (K3), Fridge (FR1), Contractor (CTR1), and Outside Lighting.

### 1.2 Why the old warning was wrong

OOH operates under Approach B. When a P1 is raised, the app:

- Creates a Zendesk ticket at priority `urgent`
- Tags it `ooh_p1`
- Returns `dispatchOk: false` — because OOH never sends an SMS itself

The IoT Support Dashboard independently monitors for the `ooh_p1` tag and fires the on-duty SMS from there. `SMS_PROVIDER=log` on the OOH side is intentional and correct. The old red alarm was therefore always wrong: the manager was always being paged, and telling the handler to phone them manually created a duplicate alert on every P1 call.

### 1.3 What was NOT changed

- `routes/api.js` and all server-side files — untouched
- The `ooh_p1` tag and Zendesk ticket creation path — intact
- Read-aloud `script` strings inside `outcomeP1` callers (e.g. "a text has gone to our on-duty manager") — left as-is (accurate under Approach B)
- SMS behaviour — unchanged; `SMS_PROVIDER` and `WRITES_DISABLED` are preserved by `set image`

---

## 2. Gate lineage

| Gate | PR | Merge commit | CI | `--allow-missing-lineage` |
|---|---|---|---|---|
| Build (code fix) | #71 | `70d7bfc` | green | yes |
| Test (results artefact) | #72 | `3d38efe` | green | yes |

Both gates carried `--allow-missing-lineage` under operator direction. This was an explicit single-stage hotfix: the change was operator-directed (correct a live false warning), so no formal design ceremony was opened. The operator directive is the design gate. This override is on the record here.

Build artefact: `docs/project/OOH_P1_DISPATCH_HONESTY_BUILD_2026-10-08.md` (merged on main)

Test artefact: `docs/project/OOH_P1_DISPATCH_HONESTY_TEST_2026-10-08.md` (merged on main)

---

## 3. Test evidence

### 3.1 Unit suite

Command: `npm run test:unit`

Result: 301 total — 300 pass, 0 fail, 1 skip.

The single skip is the CR3 profile-populate enforcement test (`REFRIG_PROFILES` data file absent). This skip is pre-existing and accepted — it predates this release and is unrelated to the P1 dispatch fix.

### 3.2 End-to-end (Playwright)

Command: `npx playwright test`

Result: 57 pass, 0 fail. Wall time: 2 min 30 sec, 1 worker. No flakes observed.

### 3.3 Per-check verdicts

**Lighting P1 honest line present (111-C)** — `outside-lighting-p1.spec.js`: `[data-testid="p1-dispatch-status"]` asserted to contain "logged as ticket" and "pages the on-duty manager". Both passed. PASS.

**Old Approach-A strings absent on lighting P1 (111-C)** — Three `not.toContainText` guards: "Text not sent", "text message has been sent", "phone the on-duty manager now". All absent. PASS.

**Fridge P1 honest line present** — `control.spec.js`: `[data-testid="outcome-p1"]` asserted to contain "logged as ticket" and "pages the on-duty manager"; absence of "Text not sent" confirmed. The server SMS log line confirming `ooh_p1` tag and ticket creation was also observed. PASS.

**Contractor P1 honest line present** — `tonight-callback.spec.js`: asserted "logged as ticket", "IoT Support dashboard", "pages the on-duty manager". Absence of "Text not sent" and "text message has been sent" confirmed. PASS.

**P1 fires with `type:escalate-p1` in POST body (111-A)** — POST body `body.type === 'escalate-p1'` intercepted and asserted. PASS.

**`ooh_p1` tag applied server-side** — `routes/api.js:267` `extraTags: isP1 ? ['ooh_p1'] : []` confirmed by code read. CONFIRMED.

**Override-doesn't-escalate guard intact (111-B)** — `[data-testid="outcome-captured"]` visible; `[data-testid="outcome-p1"]` count = 0. PASS.

**No remaining `dispatchOk` or `SMS_PROVIDER` reference in dispatch-status path** — `grep SMS_PROVIDER public/js/flows.js` returned nothing; `outcomeP1` at lines 242–248 renders an unconditional static sentence. CONFIRMED.

### 3.4 Regression sweep

Searched `tests/` for the four removed strings: "Text not sent", "text message has been sent", "dispatchOk", "phone the on-duty manager now". Every surviving hit is inside a `not.toContainText()` absence assertion — no stale positive assertion of any removed string remains. Sweep: CLEAN.

---

## 4. Conditions

No conditions are blocking release.

**B2C live visual walkthrough — carried.** No OIDC/B2C credentials are present in the CIR `credentials/` directory. This check cannot be performed without a live signed-in session against the production Azure B2C tenant. The fix is display-text-only; no auth path was modified, and no fabricated result is offered.

**SMS behaviour — unchanged by this release.** The fix touches only the client-side renderer in `public/js/flows.js`. `SMS_PROVIDER`, `WRITES_DISABLED`, and every server-side env variable are preserved as-is by `kubectl set image` (which replaces only the container image, never env). The `ooh_p1` Zendesk tag that drives the IoT Support Dashboard paging path is unaffected.

---

## 5. The cut

### 5.1 Prerequisites

- Logged in to Azure as the ACR Task Runner (`az login` / correct subscription)
- `KUBECONFIG` set to `~/.kube/ooh.yaml` (deployer-ooh service account)
- Local `main` clean and synced with `origin/main`

### 5.2 Exact command

`scripts/release.sh patch`

Run from the repo root on a clean, synced `main` branch. The script:

1. Guards: confirms branch = main, clean tree, in sync with origin
2. `npm version patch` → bumps `package.json` 1.3.4 → 1.3.5, commits "release v1.3.5", tags `v1.3.5`
3. Pushes `main` and tag `v1.3.5` to origin
4. Builds the image in ACR (`apitechhub` registry) tagged with the git sha AND `v1.3.5` AND `latest`
5. Rolls out with `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<sha>` — env untouched
6. Verifies `/healthz` reports `version: 1.3.5` and `writesDisabled: true`

### 5.3 Post-cut verification

After the rollout completes, confirm `https://ooh.airedale-group.io/healthz` returns:

- `version`: `1.3.5`
- `writesDisabled`: `true`

If `writesDisabled` is not `true`, stop and investigate before proceeding. Do not auto-rollback.

### 5.4 Rollback line

Current live image (v1.3.4): `apitechhub.azurecr.io/ooh-dashboard:68997cb`

To revert: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:68997cb`

Then verify `/healthz` reports `version: 1.3.4` and `writesDisabled: true`.

Rollback is an operator decision — do not execute automatically on deploy failure.

---

## 6. Safety confirmation

`set image` replaces only the container image in the running deployment. It cannot change `WRITES_DISABLED`, `SMS_PROVIDER`, or any other environment variable. Write-lock state and SMS routing are preserved by the release mechanism itself — this is the documented safety property of the OOH release process (see `scripts/release.sh` header comment).

No credentials, tokens, or `.env` contents are included in this artefact or in the release commit. No force-push will be used. The release commit (cut by `npm version`) and the version tag (`v1.3.5`) are the only git objects added beyond the existing main history.
