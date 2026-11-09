<!-- gate:contract
TICKET: OOHDASH-146
PHASE: release
SECTION: Release summary
Version v1.7.0 — minor bump from v1.6.6. This is the agent-screen standard release: riskQuestion gates across all escalation paths, P1 reason box, Something Else flow rebuild, caller banner, kitchen one-off booking, and the full B1–B38 build from OOHDASH-146 design rev 4.4. Main at 4a43da1 (includes build PR #192, CI cleanup PR #193, test gate PR #194).
SECTION: Gate lineage
Discovery gate: PR #162 (merged). Design gate: PR #178 rev 4.4 (merged 9f8c2f0, decisions E1/J1/A1/K1). Build gate: PR #192 (merged cc0a1b7, all 38 B-rows, 902 unit tests). Test gate: PR #194 (merged 4a43da1, 182 Playwright tests pass, 0 fail).
SECTION: Pre-release items
Four items from the design gate remain open and are NOT release blockers (James's decisions in the design gate): R1 (helpdesk lead ticket subjects sign-off — James to arrange post-release), R2 (handler briefing note — James to write post-release), Q1 (Sam Day contractor ticket confirmation — not blocking), PD-1 (Zendesk 12-month deletion setup — not blocking). B18 (IoT Support Dashboard OUTCOME_LABELS) is deferred to a separate gate on that repo.
SECTION: Rollback
Rollback image: image 916f6e3 (v1.6.6, the last live release). Command: kubectl set image deployment/ooh-triage-dashboard ooh-triage-dashboard=<registry>/ooh-triage-dashboard:916f6e3 -n ooh (KUBECONFIG=C:/Users/james/.kube/ooh.yaml). The v1.6.6 image is the current rollback target. After this release the rollback target becomes the v1.7.0 image SHA.
SECTION: Release steps
1. npm run release:minor — bumps package.json to 1.7.0, commits, tags v1.7.0, pushes tag + main. 2. CI unit tests run on the tag push (required, 44s). 3. kubectl set image to the new image SHA once the container image is built and pushed by CI/CD. 4. Smoke check: confirm site loads, fixture-mode sign-in works, one flow navigates to outcome. 5. Update rollback digest in the memory/release notes.
DECISION: Approve release of v1.7.0 | Approve - cut v1.7.0 | Block - hold release
DETAIL: main at 4a43da1. All gates passed. 38 B-rows delivered. 902 unit + 182 Playwright tests green. Pre-release items R1/R2/Q1/PD-1 noted as post-release. Rollback: 916f6e3 (v1.6.6).
-->

# OOHDASH-146 Release Gate — v1.7.0

**Current live:** v1.6.6 (image `916f6e3`)  
**Releasing:** v1.7.0 from main at `4a43da1`

## Gate lineage

| Gate | PR | Decision |
|---|---|---|
| Discovery | #162 | Merged |
| Design | #178 (rev 4.4) | Merged |
| Build | #192 | Merged — 38 B-rows, 902 unit tests |
| Test | #194 | Merged — 182 Playwright, 0 fail |

## What's in v1.7.0

**Agent-screen standard (OOHDASH-146 design rev 4.4):** riskQuestion gates on every P1 escalation path (lighting, aircon, heating, dark-fleet, contractor, Something Else, ambiguous); P1 reason box with 10+ char validation; Something Else three-stage redesign (text → scope chips → risk question); caller banner on every in-call screen; kitchen one-off booking server; customer contact on every ticket; closed-on-create for no-risk outcomes; "on-call agent" / "text message" wording everywhere; PowerPause contractor guide; accessibility (role="region", #srlive, AA contrast). Full B1–B38 delivery.

**Also included:** CI e2e job removed (PR #193) — harness test gate is now the sole Playwright authority. GitHub CI runs unit tests only (44s).

## Pre-release items (not blockers — James's decision from design gate)

- **R1** — helpdesk lead ticket subject sign-off (post-release)
- **R2** — handler briefing note (post-release)
- **Q1** — Sam Day contractor ticket confirmation
- **PD-1** — Zendesk 12-month deletion setup
- **B18** — IoT Support Dashboard OUTCOME_LABELS (separate repo, separate gate)

## Rollback

Rollback image: `916f6e3` (v1.6.6). After release the rollback target becomes the v1.7.0 image SHA.
