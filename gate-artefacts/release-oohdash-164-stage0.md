<!-- gate:contract
TICKET: OOHDASH-164
PHASE: release
STEP: committee

SECTION: What this gate covers
Release gate for OOHDASH-164 Stage 0 (v1.7.4). Requests James's go to cut the patch release from main at 8aa6e1b. Stage 0 adds browser timing measurement only — six performance marks, a navigator.sendBeacon POST to /api/ux-timing (authenticated, integer-only), Server-Timing headers on three routes, and a read-only log-parser script. No user-facing changes. No write-path changes.

SECTION: Gate history
Discovery gate: PR #198 merged (5f35545).
Design gate: PR #200 merged (a87b33d, 2026-11-12) — Addendum A decisions: 30 s site cache, Stage 0 ships alone as v1.7.4, build proceeds after proofs a and b.
Build gate: PR #201 merged (520598a, 2026-11-12) — 918 unit tests pass.
Test gate: PR #202 merged (8aa6e1b, 2026-11-12) — 181 Playwright e2e pass (fixture mode), 0 fail.

SECTION: Release checklist
1. Main is at 8aa6e1b — test gate merge commit.
2. All CI checks pass on main.
3. Release command: `npm run release` from clean main in C:\repos\ooh-triage-dashboard (or the stage0 worktree). This cuts the patch version bump to v1.7.4, tags, and pushes.
4. After release tag lands: Spencer or James deploys the new image to AKS (kubectl set image or standard pipeline).
5. After deploy: collect 20 or more real lookups from kubectl logs using `kubectl logs -n iot-services deployment/ooh-dashboard | grep '\[UX\]'`, pipe to `node scripts/ux-timing-report.mjs`, and record the p50/p95 figures as the Stage 0 baseline. This baseline governs whether Stage 1 is worth building.

SECTION: What happens after release
Stage 0 is complete once the baseline is collected. Stage 1 (the bulk read, Q1–Q9) begins only after both proofs a and b pass and James gives the go for Stage 1. Proof command (run from repo root with az keyvault access):

$env:TB_API_KEY = (az keyvault secret show --vault-name airedale-kv-prod --name thingsboard-read-apikey --query value -o tsv); node scripts/tb-batch-proof.mjs

Proof a: HTTP 200 from bulk endpoint for all four test sites (6803, 6827, 6234, 6811).
Proof b: all 53 keys present in at least one device across those sites.

SECTION: Rollback
Rollback image (previous stable): 916f6e3 (v1.6.6, the last release before Stage 0). To rollback: `kubectl set image deployment/ooh-dashboard ooh-dashboard=<registry>/ooh-triage-dashboard:916f6e3 -n iot-services`.

SECTION: Invariants
No production changes at this gate. No kubectl writes. No deploy. The release gate records James's go — the actual deploy follows after the gate is approved.

DECISION: Approve release of v1.7.4 (Stage 0 — measurement only) and proceed to deploy? | A: Approve — release v1.7.4 (recommended) | B: Hold — changes needed before release
-->

# Release gate: OOHDASH-164 Stage 0 (v1.7.4)

Main at 8aa6e1b (2026-11-12). Requesting go to cut v1.7.4.

## Gate history

| Gate | PR | Merged | Result |
|---|---|---|---|
| Discovery | #198 | 5f35545 | Passed |
| Design | #200 | a87b33d | Passed (Addendum A decisions) |
| Build | #201 | 520598a | 918 unit tests pass |
| Test | #202 | 8aa6e1b | 181 Playwright pass, 0 fail |

## What ships in v1.7.4

Stage 0 — measurement only. No user-visible changes.

- 6 browser `performance.mark` calls bracketing the lookup flow
- `navigator.sendBeacon` → authenticated `POST /api/ux-timing` (integers only, structured log line)
- `Server-Timing total;dur` on `/resolve`, `/confirm`, `/workspace`
- `scripts/ux-timing-report.mjs` — read-only p50/p95 parser

## Release command

From clean main (`C:\repos\ooh-triage-dashboard` or the stage0 worktree):

```
npm run release
```

## After deploy — baseline collection

```
kubectl logs -n iot-services deployment/ooh-dashboard | grep '\[UX\]' | node scripts/ux-timing-report.mjs
```

Collect ≥20 lookups, record p50/p95 for t-search, t-gate, t-site. This is the Stage 0 baseline.

## Proof script (before Stage 1)

```powershell
$env:TB_API_KEY = (az keyvault secret show --vault-name airedale-kv-prod --name thingsboard-read-apikey --query value -o tsv); node scripts/tb-batch-proof.mjs
```

Proof a: HTTP 200 for all four sites. Proof b: all 53 keys present. Both must pass before Stage 1 starts.

## Rollback

Previous stable image: `916f6e3` (v1.6.6).

## Invariants

Write path unchanged. F004 unchanged. No production impact at this gate — deploy follows approval.
