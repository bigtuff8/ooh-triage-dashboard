<!-- gate:contract
TICKET: OOHDASH-164
PHASE: build
STEP: committee

SECTION: What this gate covers
Stage 0 of the OOHDASH-164 site lookup speed work. Stage 0 adds browser timing measurement and ships as its own patch (v1.7.4) before Stage 1, so live lookups produce a true before baseline for T-gate and T-site. Stage 1 (the bulk read, Q1 to Q9) is built only after proofs a and b pass with the full key list. This gate presents the Stage 0 code for review before the test and release gates.

SECTION: What was built — Stage 0 (commit 8b6b112)
Six browser marks using performance.mark and performance.measure. In app.js: search-submit and search-result bracket the GET /api/sites/search call inside searchInput. In views.js: device-read-start and device-read-complete bracket the GET /api/sites/:siteNo/resolve call inside openSite; confirm-screen-paint fires after renderConfirmGate paints the HTML; workspace-ready fires after render in confirmSite on the success path only. The three measures are T-search (search-submit to search-result), T-gate (device-read-start to confirm-screen-paint) and T-site (device-read-start to workspace-ready). When workspace-ready fires, uxBeacon (defined in app.js) sends a navigator.sendBeacon POST to /api/ux-timing carrying the three integer values and the site number. A new authenticated POST /api/ux-timing route in routes/api.js validates that all values are non-negative integers and the site number matches the expected pattern, then writes one log line: [UX] site=6803 t-search=41 t-gate=15230 t-site=16410 build=v1.7.4. No free text and no customer data are logged. Server-Timing total;dur is added to the response from /resolve, /confirm and /workspace so the browser DevTools network panel shows server-side duration. A read-only scripts/ux-timing-report.mjs reads kubectl log output on stdin and prints p50 and p95 for all three measures. No change was made to the write path, timeout, retry, or any control logic.

SECTION: What was built — proof script (commit b10ec26)
scripts/tb-batch-proof.mjs is updated with the complete 53-key list from design section 6 (37 TIME_SERIES, 2 SERVER_ATTRIBUTE, 6 CLIENT_ATTRIBUTE, 9 SHARED_ATTRIBUTE) — the discovery-era script was about 20 boiler decoder keys short. The script now also reports whether CLIENT_ATTRIBUTE and SERVER_ATTRIBUTE values come back typed or as strings, whether any returned entries have ts=0 (never-reported keys the adapter must drop), and device count and latency for all four test sites (6803, 6827, 6234, 6811). The API key is never printed. The script is read-only; it makes no writes to ThingsBoard.

SECTION: Test results
Unit tests: 918 pass, 0 fail, 1 skipped (NODE test runner, 919 total). Playwright e2e suite runs at the test gate against fixture data; it is not run here. The new /api/ux-timing route is covered by the existing route-registration test pattern. The design requires a golden screen-text test pinning every new wording line before the test gate; Stage 0 adds no new wording, so no golden test is needed at this gate.

SECTION: Proof script command for James
To run proofs a and b, fetch the ThingsBoard read API key from Key Vault and pipe it straight into the script. The key is never written to disk or echoed. Run from PowerShell in the repo root:

`$env:TB_API_KEY = (az keyvault secret show --vault-name airedale-kv-prod --name thingsboard-read-apikey --query value -o tsv); node scripts/tb-batch-proof.mjs`

Proof a passes if every site returns HTTP 200. Proof b passes if all 53 keys are present in at least one device across the four sites. The script exits 0 on PASS and 1 on FAIL.

SECTION: What comes next
If this gate is approved: the test gate opens (Playwright e2e in fixture mode), then the release gate opens for James to give the go. Stage 1 build begins only after proofs a and b both pass and James gives the go on Stage 1.

SECTION: Invariants held
No change to the write path: timeout stays 15 s, no retry, write session untouched. F004 is unchanged: the confirm button stays disabled until the server confirms the site is unique. The ux-timing route is authenticated and accepts numbers only. No new npm dependency was added.

DECISION: Approve Stage 0 build and proceed to test gate? | A: Approve — Stage 0 looks correct, proceed to test gate (recommended) | B: Changes requested
-->

# Build gate: OOHDASH-164 Stage 0

Project ooh-triage-dashboard, branch feat/oohdash-164-stage0, two commits ahead of main (a87b33d). Date 2026-11-12. Follows the design gate PR 200 (Addendum A: 30 s cache, Stage 0 ships alone as v1.7.4).

## What was built

### Stage 0 measurement (commit 8b6b112)

| File | Change |
|---|---|
| public/js/app.js | uxBeacon helper; search-submit and search-result marks in searchInput |
| public/js/views.js | device-read-start and device-read-complete marks in openSite; confirm-screen-paint mark in renderConfirmGate; workspace-ready mark and beacon call in confirmSite |
| routes/api.js | POST /api/ux-timing (authenticated, integers only, one [UX] log line, 204); Server-Timing total;dur on /resolve, /confirm and /workspace |
| scripts/ux-timing-report.mjs | New read-only script: parses [UX] lines from stdin, prints p50 and p95 for t-search, t-gate and t-site |

The three measures the beacon sends:

| Measure | From | To | Expected today (baseline) |
|---|---|---|---|
| T-search | search-submit | search-result | ~40 ms |
| T-gate | device-read-start | confirm-screen-paint | ~15 200 ms (the target after Stage 1 is under 500 ms at p95) |
| T-site | device-read-start | workspace-ready | ~16 400 ms |

### Proof script (commit b10ec26)

scripts/tb-batch-proof.mjs updated with the full 53-key list from design section 6. Added: attribute type reporting, ts=0 detection, per-site device count and latency. API key never printed.

## Test results

918 pass / 919 total / 0 fail (NODE test runner, unit tests only). Playwright e2e runs at the test gate.

## Proof script command

Run from PowerShell in the repo root (the key is never written to disk or echoed):

`$env:TB_API_KEY = (az keyvault secret show --vault-name airedale-kv-prod --name thingsboard-read-apikey --query value -o tsv); node scripts/tb-batch-proof.mjs`

## Invariants

Write path unchanged. F004 unchanged. No new npm dependency. No customer data logged.
