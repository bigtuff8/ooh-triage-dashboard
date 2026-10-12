<!-- gate:contract
DECISION: Overall verdict — OOHDASH-113 release-preflight | GO — cut v1.3.6 now; run release.sh patch from main | CONDITIONAL GO — hold for specific investigation listed below | BLOCK — do not release; requires a fix
DETAIL: Five stories from Sam's 9 October feedback are on main (merged via PR #77, commit 9a6e605). All 67 tests pass. Version will bump from v1.3.5 to v1.3.6. Release script uses `kubectl set image` only — WRITES_DISABLED env is untouched. F4a is safety-critical (active P1 escalation banner for Shire Horse class incidents) and must not be delayed. F1+F2 correct a structural bug where DHW boost was unreachable in production for all C&B sites.
DECISION: Post-deploy verification method | Automated — release.sh verifies /healthz version and writesDisabled on completion | Manual — James checks /healthz and a live site workspace after deploy | Skip — deploy only, verify next working day
DETAIL: The release script polls /healthz (up to 5 times, 5s apart) and prints version + writesDisabled. A manual site-open on one C&B site (e.g. 6097 or 6769) confirms F1 DHW fix and F2 scope trim live. F4a banner requires an active ooh_p1 Zendesk ticket to trigger — verify by checking a known-P1 site if one is open, or treat as verified-by-test for this release.
-->

# OOHDASH-113 Release-Preflight Gate — Ninth October Feedback Items

**Epic:** OOHDASH-113 · **Date:** 2026-10-12 · **Stage:** Release-preflight (gate 4 of 5)
**Branch:** main @ 9a6e605 · **Release:** v1.3.5 → v1.3.6

## What this gate approves

Cutting release v1.3.6 of the OOH Triage Dashboard. The release script will bump version, build the ACR image, and roll out to the `iot-services` namespace via `kubectl set image`. WRITES_DISABLED is untouched.

---

## What ships in v1.3.6

| Story | Change | Criticality |
|---|---|---|
| F4a — Active P1 banner | Red banner in workspace when ooh_p1 Zendesk ticket active in 24h window | SAFETY-CRITICAL |
| F1 — DHW controllability | Fixes structural bug — DHW boost was unreachable on ALL C&B sites in prod | HIGH |
| F2 — Trim controls panel | Caps to 5 named rows for C&B sites (heating, hot water, kitchen, external lighting, fan) | MEDIUM |
| F3 — Connection-check text | Adds "This step is optional" hint below offline-check button | LOW |
| F5 — PowerPause contractor script | Tongou/Owon override guidance in contractor flow; 6786 escalation branch | MEDIUM |

---

## Pre-release checks

| Check | Status |
|---|---|
| Tests (67/67) | PASS — gate 3 confirmed |
| Branch: on main | YES — 9a6e605 |
| Clean working tree | YES — verified |
| Synced with origin/main | YES — PR #77 merged and fetched |
| WRITES_DISABLED policy | Unchanged — release.sh uses set image only |
| Previous live image | Retrieved by release.sh at run time for rollback reference |

---

## Release plan

Command: `npm run release` (which runs `scripts/release.sh patch`)

Steps performed by the script:

1. Guards — confirms on main, clean tree, synced
2. `npm version patch` — bumps package.json to 1.3.6, commits "release v1.3.6", creates git tag v1.3.6
3. Pushes main + tag to GitHub
4. Builds ACR image `apitechhub.azurecr.io/ooh-dashboard` tagged with sha, v1.3.6, and latest
5. `kubectl -n iot-services set image deployment/ooh-dashboard` — env vars untouched
6. Polls `https://ooh.airedale-group.io/healthz` to verify version and writesDisabled

Rollback: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=<previous-image>` (printed by script at start).

---

## F4a safety note

The P1 escalation banner is fail-open on Zendesk outage (empty array = no banner, not an error). The banner is non-dismissible (design gate decision D3). It appears above the issue picker when any ooh_p1 tagged ticket is active and updated within 24 hours. This change directly addresses the Shire Horse incident class.
