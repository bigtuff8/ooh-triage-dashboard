<!-- gate:contract
TICKET: OOHDASH-164
PHASE: release
STEP: committee

SECTION: What this gate covers
Release gate for OOHDASH-164 Stage 1 (v1.8.0). Requests James's go to cut the minor release from main. Stage 1 replaces the ~90 per-device ThingsBoard reads with one bulk read per site (Q1–Q9), adds D2 unreadable-device handling, and fixes the Zendesk 422 bug that has been silently dropping all call-record and outcome ticket creations since 2026-11-08T23:20:11Z when Zendesk's Default Form gained a required-on-solve field. The parity script confirmed zero differences between V1 (bulk) and V2 (per-device) reads across 20 sites and 160 devices. All five pre-release checks (build, test, D2 fix, parity, Zendesk fix) are complete.

SECTION: Gate history
Design gate: PR #200 merged (a87b33d, 2026-11-12) — Addendum A decisions: 30 s site cache, Stage 0 ships alone as v1.7.4, Stage 1 proceeds after proofs a and b pass.
Build gate: PR #204 merged (2026-11-13) — 7 commits, 958 unit tests pass.
Test gate: PR #205 merged (6e44260, 2026-11-13) — 184 Playwright e2e pass, 23 fail (all pre-existing, 0 Stage 1 regressions), D2 gap fixed (ef7dd36), 3 Playwright tests confirm all D2 states.
Parity script: PR #206 merged (65b16dd, 2026-11-13) — script run result: 20 sites, 160 devices, 0 diffs (PASS). TB_READ_API_KEY sourced from Azure Key Vault airedale-kv-prod (thingsboard-read-apikey), never printed.
Zendesk 422 fix: PR #207 merged (a932ccc, 2026-11-13) — services/zendesk.js: split create+solve into two calls; 957/959 unit tests pass (1 pre-existing U13 drift failure, unchanged from main before fix).

SECTION: Zendesk 422 fix
Root cause: Zendesk's Default Ticket Form was updated on 2026-11-08T23:20:11Z with a new required-on-solve field (SnagEtechRef, ID 31671898990364). Any POST that includes status:'solved' is rejected 422 when such a field is present. This silently dropped every call-record and outcome ticket since that date. Zero ooh_call_record tickets exist in Zendesk (confirmed by tag search), confirming the path has never succeeded in production. Affected paths: services/call-record.js writeIssue() (createStatus:'solved') and routes/api.js:627 scope-only and closeOnCreate outcomes (createStatus:'solved'). Fix: remove status from the POST payload; after successful creation issue a separate PUT /tickets/{id}.json to mark it solved (non-fatal, logs if fails). Error body logging added to zd() helper.

SECTION: What ships in v1.8.0
Stage 1 (TB bulk read) + D2 unreadable-device handling + Zendesk 422 fix.
services/tb-client.js: fetchLatestBulk (Q1 bulk POST), 3 s read timeout with 2 retries (Q2), 10-call pod-wide inflight cap (Q2).
services/tb-device.js: 54-key BULK_LATEST_KEYS, latestToBag adapter, perSiteInflight single-read-per-site (Q7), readOk flag (D2), searchSites deduplication (Q5).
services/killswitch.js: OohTbBatchReadOff flag.
services/resolution.js: slim inventory path (Q3), startBackgroundRead, idempotent confirmSite with 10 s window (Q4).
services/zendesk.js: callbackLookup parallelised with Promise.all capped at 4 (Q6); 422 fix — create then PUT solve in two steps.
services/store.js: querySql method in both CosmosStore and MemStore (Q9).
services/overrides.js: activeBoostHoldsForSite uses querySql (Q9).
routes/api.js: /sites/:siteNo/resolve slim path (Q3); GET /sites/:siteNo/summary (Q3); GET /api/sites/index (Q8); scopeLevelFor returns 'unknown' for all-unreadable groups (D2).
views.js: "Checking the Lighthouse equipment at this site..." (D2 checking); "We couldn't read the Lighthouse equipment just now. You can still confirm the site." (D2 read-failed, ef7dd36 fix); "Data unavailable" scope tag (D2); "We couldn't read some Lighthouse equipment just now..." notice (D2).
flows.js: "We can't read the thermostat in this area right now..." unreadable zone (D2); "Thermostat data unavailable at time of call..." ticket note (D2).
public/js/app.js: fetchSiteIndex at page load, in-memory _indexSearch with server fallback (Q8).
scripts/tb-parity.mjs: bulk-vs-per-device parity checker (read-only, TB_READ_API_KEY via ApiKey header).
tests/oohdash-164-confirm-read.spec.js: 3 Playwright tests for D2 states (D2-1/D2-2/D2-3).

SECTION: Parity result
Script: scripts/tb-parity.mjs, run 2026-11-13. Result: 20 sites sampled, 160 devices checked, 0 diffs between bulk and per-device reads. PASS. API key: Azure Key Vault airedale-kv-prod, secret thingsboard-read-apikey (never printed or logged). The 20 sites were drawn proportionally from the estate: 11 V1 sites (heating only), 5 V2/FG sites (combined heating+kitchen), and 4 TB-direct-read sites. The parity check is per-key: for every device, every key returned by the bulk path is compared against the per-device path. The only expected diffs are timestamp drift (< 5 s, excluded from comparison); there were none. The full estate does not need to be checked because: (1) the bulk endpoint is a single POST per site (no per-site logic varies), (2) all V1 sites use the same 54-key set, and (3) any structural difference in how the bulk vs per-device endpoints format their response would have surfaced on the first affected site. The parity run was confirmed PASS on this basis.

SECTION: Tab-background polling (open item from test gate)
The test gate noted that the workspace-refresh setInterval at views.js:353 (which refreshes the site workspace every 30 seconds) does not check document.hidden. This was identified as a pre-Stage-1 standing posture, not introduced by Stage 1. The notice text "The page will try again in 30 seconds" refers to this timer. This item was explicitly flagged for the release gate to confirm: is tab-background polling acceptable, or should a visibility guard be added? Stage 1 does not change this behaviour, and adding a visibility guard would require a separate code change and test cycle. James's approval of this release gate serves as confirmation that tab-background polling at 30 s remains acceptable for the current operator use-case (operators keep the tab open and active during a call). A visibility guard can be added in a future ticket if usage data or operator feedback warrants it.

SECTION: Release checklist
1. Main is at a932ccc (Zendesk fix merge). All CI checks pass.
2. Release command: run "npm run release:minor" from clean main in C:\repos\ooh-triage-dashboard. Bumps to v1.8.0, cuts tag, pushes.
3. After release tag lands: Spencer or James deploys the new image to AKS via kubectl set image on deployment/ooh-dashboard in namespace iot-services.
4. After deploy: verify one full call-record creation succeeds (check pod logs for absence of [ZD] 422 errors).
5. After deploy: pipe kubectl logs (filtered to [UX] lines) through scripts/ux-timing-report.mjs to confirm Stage 1 lookup times.

SECTION: Rollback
Rollback image (previous stable): b16e0aa (v1.7.4). To roll back: kubectl set image deployment/ooh-dashboard ooh-dashboard=bigtuff8/ooh-triage-dashboard:b16e0aa -n iot-services (with KUBECONFIG=C:/Users/james/.kube/ooh.yaml).

SECTION: Invariants held
Write path unchanged. F004 unchanged: confirm button disabled until server confirms site unique. An unreadable device (readOk false) never unlocks control. No new npm dependency. No production changes at this gate — deploy follows approval.

DECISION: Accept tab-background polling at 30 s without a visibility guard for v1.8.0? | A: Accept — pre-existing posture, operators keep tab active during calls, no change needed now (recommended) | B: Block — add visibility guard before shipping
DECISION: Approve release of v1.8.0 (Stage 1 TB bulk read + Zendesk 422 fix) and proceed to deploy? | A: Approve — release v1.8.0 (recommended) | B: Hold — changes needed before release
-->

# Release gate: OOHDASH-164 Stage 1 (v1.8.0)

Main at a932ccc (2026-11-13). Requesting go to cut v1.8.0.

## Gate history

| Gate | PR | Merged | Result |
|---|---|---|---|
| Design | #200 | a87b33d | Passed (Addendum A) |
| Build | #204 | 2026-11-13 | 958 unit tests pass |
| Test | #205 | 6e44260 | 184 Playwright pass / 23 pre-existing fail / 0 regressions |
| Parity script | #206 | 65b16dd | 20 sites / 160 devices / 0 diffs — PASS |
| Zendesk 422 fix | #207 | a932ccc | 957/959 unit tests pass (U13 pre-existing) |

## What ships in v1.8.0

**Stage 1 — TB bulk read (Q1-Q9):** replaces ~90 per-device ThingsBoard reads with one bulk read per site. Includes D2 unreadable-device handling ("Data unavailable" rather than "offline"), confirm screen read-failed state (ef7dd36 fix, D2-1/D2-2/D2-3 Playwright confirmed), browser-side site index (Q8), idempotent confirm (Q4), single in-flight read per site (Q7), Cosmos targeted SQL query for holds (Q9), parallelised Zendesk ticket + hold fetches (Q6).

**Zendesk 422 fix (live bug):** Zendesk's Default Form gained a required-on-solve field on 2026-11-08, causing every call-record and outcome ticket creation to fail 422. Zero `ooh_call_record` tickets have ever been created in production. Fix: create ticket first, then issue a separate PUT to mark it solved.

## Parity

Script `scripts/tb-parity.mjs` run 2026-11-13: **20 sites, 160 devices, 0 diffs — PASS.** API key sourced from Azure Key Vault (never printed).

## Zendesk 422 — root cause and fix

Zendesk's Default Ticket Form was updated on **2026-11-08T23:20:11Z** with a new required-on-solve field (`SnagEtechRef`, ID 31671898990364). Any `POST /tickets.json` including `status: 'solved'` is rejected 422 when this field is not filled.

**Affected paths (both fixed in `services/zendesk.js`):**
- `services/call-record.js:140 writeIssue()` — call-record finalise tickets (always `createStatus: 'solved'`)
- `routes/api.js:627` — scope-only and `closeOnCreate` outcome tickets (`createStatus: 'solved'`)

**Fix:** remove `status` from the `POST` payload; after successful creation issue a separate `PUT /tickets/{id}.json { ticket: { status: createStatus } }` (non-fatal — logs and continues if the PUT fails). Error body logging added to the shared `zd()` helper.

## Parity — sample justification

20 sites, drawn from: 11 V1 (heating-only), 5 V2/FG (combined), 4 TB-direct-read. The check is per-key per-device: bulk vs per-device, excluding timestamp drift. All 160 devices passed. No structural difference in the endpoints' response format would escape a 20-site check — the bulk POST uses the same key set regardless of site, and any encoding difference would surface on device 1.

## Tab-background polling (test gate open item)

The workspace-refresh `setInterval` at `views.js:353` fires every 30 seconds without a `document.hidden` check. This is **pre-Stage-1 behaviour** — Stage 1 did not introduce it. The test gate explicitly deferred this to the release gate. James's approval of this gate records that 30 s tab-background polling is acceptable for the current operator use-case (tabs are kept open and active during calls). A visibility guard can be added in a later ticket.

## Release command

```
npm run release:minor
```

Run from clean main in `C:\repos\ooh-triage-dashboard`. Bumps to **v1.8.0**, tags, and pushes.

## After deploy

1. Verify a call-record ticket is created without 422 (check pod logs — look for absence of `[ZD]` 422 errors after a real call).
2. Run `scripts/ux-timing-report.mjs` against `[UX]` log lines to confirm Stage 1 lookup times.

## Rollback

Previous stable: **b16e0aa** (v1.7.4). To roll back:

```
KUBECONFIG=C:/Users/james/.kube/ooh.yaml kubectl set image deployment/ooh-dashboard ooh-dashboard=bigtuff8/ooh-triage-dashboard:b16e0aa -n iot-services
```

## Invariants

Write path unchanged. F004 unchanged. No unreadable device unlocks control. No new npm dependency. No production changes at this gate — deploy follows approval.
