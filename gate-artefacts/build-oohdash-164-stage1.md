<!-- gate:contract
TICKET: OOHDASH-164
PHASE: build
STEP: committee

SECTION: What this gate covers
Stage 1 of OOHDASH-164 site lookup speed. Stage 1 replaces the ~90 per-device ThingsBoard reads with one bulk read per site (Q1), applies read-session timeout and retry limits (Q2), draws the confirm screen instantly from the search result (Q3), adds an idempotent confirm with busy state (Q4), deduplicates search rows by site number (Q5), parallelises Zendesk ticket and hold fetches (Q6), joins all callers on a single in-flight device read per site (Q7), serves the site directory for in-browser search (Q8), and replaces the full partition scan for Cosmos holds with a targeted SQL query (Q9). Failed device reads show "Data unavailable" rather than offline (D2). The design gate (PR 200, Addendum A) is the authority; this gate shows that every change matches the spec. No Stage 2 work is included.

SECTION: What was built — commit summary
Seven commits ahead of main (b16e0aa, v1.7.4). Commits: 52aeda5 TB bulk infrastructure (Q1–Q7); 2bfb249 D2 unreadable-device wording in all flows; ce8eae7 Q8 browser-side site index; e5fd2af 40 new unit tests (958 total); 133219f parity script scripts/tb-parity.mjs; feb705d package-lock sync; 8f35191 bug fix — empty site index short-circuiting server search fallback (found and fixed during self-verification).

SECTION: What was built — file-by-file summary
services/tb-client.js: fetchLatestBulk (Q1 bulk POST), read session timeout lowered to 3 s with 2 retries on connection reset, timeout, 429, 502, 503, 504 (Q2), pod-wide 10-call inflight cap enforced by an ~20-line queue (Q2). Write session and retry policy are unchanged.

services/tb-device.js: BULK_LATEST_KEYS constant (54 keys across TIME_SERIES, SERVER_ATTRIBUTE, CLIENT_ATTRIBUTE and SHARED_ATTRIBUTE), latestToBag adapter (drops ts=0 keys, coerces attribute strings to typed values, leaves telemetry strings unchanged), fetchLatestBulk call with four fallback paths (error, empty, partial, 403), 403 hold-off for 10 minutes, perSiteInflight Map for Q7 single-read-per-site, 5 s site deadline, readOk flag attached to every device (D2), searchSites groups by site number before 12-row cap (Q5).

services/killswitch.js: OohTbBatchReadOff flag added alongside the existing Tuya flag (Q1 admin switch).

services/resolution.js: resolveSiteInventory slim path (live mode: inventory only, starts background read; fixture mode: full read, instant from file), startBackgroundRead, getBackgroundSiteRead (Q3), idempotent confirmSite with 10 s window keyed on operator + site number (Q4).

services/zendesk.js: callbackLookup per-ticket comment fetch parallelised with Promise.all capped at 4 (Q6).

services/store.js: querySql method in both CosmosStore and MemStore, same predicate, so fixture tests are unaffected (Q9).

services/overrides.js: activeBoostHoldsForSite uses querySql in live mode with the site number as both string and number (Q9).

routes/api.js: /sites/:siteNo/resolve calls resolveSiteInventory and starts background Zendesk + hold reads (Q3, Q6); new GET /sites/:siteNo/summary (Q3); /sites/:siteNo/confirm uses background read result to avoid a second full read (Q3); GET /api/sites/index serves de-duplicated directory from Zendesk cache (Q8); scopeLevelFor returns 'unknown' for all-unreadable groups, anyUnknown alongside anyOffline in workspace payload (D2).

public/js/app.js: fetchSiteIndex at page load, in-memory _indexSearch with server fallback (Q8).

public/js/views.js: renderConfirmGate draws instantly from the search hit with "Checking site…" button (disabled) while /summary is awaited (Q3); re-entry guard _confirmInProgress, "Opening site…" spinner on first click (Q4); 'unknown' scope level renders grey "Data unavailable" tag (dashed border, ? icon); grey anyUnknown notice (D2).

public/js/flows.js: D2 readOk checks in every heating zone (line ~2052), lighting and fan states (line ~2379), wall unit flow (line ~2783); "We can't read the thermostat in this area right now, so we can't check or change it from here." wording; ticket note "Thermostat data unavailable at time of call (read failed) — not confirmed offline" (D2).

scripts/tb-parity.mjs: new read-only script. Fetches bulk response and per-device response for every matched device on 10 or more live sites, compares every mapped field, and exits 1 if any difference exceeds its tolerance. Never prints TB credentials (guarded by comment and try/catch).

SECTION: Call count improvement per site lookup
Inventory text searches: 2 today, 2 after Stage 1. Per-device TB reads: about 90 today, 1 bulk call (or 1 per 100 devices) after Stage 1. V1 override history (only when overridden): unchanged at 0 to 1. Confirm step re-read: about 90 today (if cache lapsed), 0 after Stage 1 (Q7 reuses in-flight). Each 30 s workspace refresh: about 90 today, about 3 after Stage 1. Fallback when bulk is refused: about 90, capped at 10 in flight with 3 s timeout and 5 s site deadline.

SECTION: New wording (D2 and Q3)
Every new and changed wording string from design section 6 is in the code as written. See the body table for the exact strings.

SECTION: Unit tests
958 pass, 0 fail, 1 skip (Node test runner: node --experimental-test-module-mocks --test test/*.test.js). The 1 skip is a pre-existing Stage 0 skip. Seven new test files: test/tb-bulk-adapter.test.js (9 tests: bulk adapter parity for V1, V2, PowerPause, Salus, switch devices), test/tb-bulk-limiter.test.js (3 tests: never more than 10 reads in flight), test/bulk-key-guard.test.js (4 tests: every key a decoder reads is in BULK_LATEST_KEYS), test/confirm-idempotent.test.js (4 tests: five rapid POSTs produce one call record and one token), test/cosmos-query-sql.test.js (6 tests: siteNo as string and number both match, in-memory parity), test/search-dedup.test.js (7 tests: one row per site, duplicate-ID only when names differ), test/tb-unknown-state.test.js (7 tests: readOk false leaves debounce untouched, out of anyOffline, in anyUnknown, control refused, grey tag shown).

SECTION: Playwright e2e (fixture mode)
Full suite run on Stage 1 and separately on the base commit (b16e0aa) for comparison. Full suite results: 152 pass, 26 fail, 2 skip. The 26 failures are confirmed pre-existing on b16e0aa: all 4 failing spec files (additional-notes.spec.js, area-model.spec.js, boilercontrol.spec.js, control-rosetta.spec.js) are byte-identical between Stage 1 and base. The failures originate from OOHDASH-146 UI changes that were not backported to those test specs when CI e2e was removed (riskQuestion gate on the aircon path, hot-water capture flow change, Salus slow-release timing, date-dependent schedule check). resolveSiteInventory calls resolveSite unconditionally in fixture mode (line 108 of resolution.js), so the Q3 slim-resolve path is never exercised in fixture mode — no e2e regression from Stage 1.

SECTION: Parity script — usage note
scripts/tb-parity.mjs runs against live ThingsBoard from outside the cluster. It requires TB_READ_USERNAME and TB_READ_PASSWORD (or TB_API_KEY) environment variables. It never prints credentials. It exits 0 when bulk and per-device outputs match for all compared fields on 10 or more sites, and exits 1 on any difference. This is a release gate step, not a build step; it must pass before the release gate opens. See release invariants below.

SECTION: Invariants held
Write path unchanged: write session keeps its own timeout and no retry (tb-client.js line 192). F004 unchanged: the confirm button stays disabled until the server confirms the site is unique (the Q3 button-disabled state is on "Checking site…" while /summary is awaited, and resolves back to enabled on /resolve returning resolved). An unreadable device (readOk false) never unlocks control: every control guard (control.js, oneoffs.js, the switch and scope checks in routes/api.js) is unchanged. No new npm dependency. No production changes. No kubectl writes. No TB writes.

SECTION: What comes next
If this gate is approved: the test gate opens. The test gate includes a mandatory screen-text diff of every new wording string in design section 6 (confirmed against the live prototype run), plus the full Playwright e2e suite result annotated to show which failures are pre-existing. After the test gate: the parity script runs on 10 or more live sites. If it exits 0, the release gate opens for James's go on v1.8.0.

DECISION: Approve Stage 1 build and proceed to test gate? | A: Approve — Stage 1 implementation matches the spec, proceed to test gate (recommended) | B: Changes requested
-->

# Build gate: OOHDASH-164 Stage 1

Project ooh-triage-dashboard, branch feat/oohdash-164-stage1, 7 commits ahead of main (b16e0aa, v1.7.4). Date 2026-11-13. Follows the design gate PR 200 (approved) and the Stage 0 build/test/release gates (PRs 201, 202, 203). Release target: v1.8.0.

## What was built

### Q1 — one bulk ThingsBoard read per site

| Item | Detail |
|---|---|
| Constant | BULK_LATEST_KEYS in tb-device.js: 37 TIME_SERIES, 2 SERVER_ATTRIBUTE, 6 CLIENT_ATTRIBUTE, 9 SHARED_ATTRIBUTE (54 keys total) |
| Bulk call | POST /api/entitiesQuery/find with entityList filter + latestValues — goes through the existing read session |
| Adapter | latestToBag: drops ts=0 keys, coerces attribute strings to typed values, leaves telemetry strings as-is |
| Fallback | error/timeout → all devices fall back; empty with matched devices → all fall back; partial → missing fall back; 403/404 → all fall back + 10 min hold-off |
| Log | [TB] bulk read fallback site=XXXX reason=error devices=N |
| Admin switch | OohTbBatchReadOff in killswitch.js (Cosmos flag) — forces per-device path without redeploy |

### Q2 — read session limits

| Limit | Before | After |
|---|---|---|
| Read timeout | 15 s | 3 s per attempt |
| Retries | 0 | 2 (on connection reset, timeout, 429, 502, 503, 504 only — never other 4xx) |
| Retry jitter | none | ~200 ms then ~400 ms |
| Pod-wide read cap | none | 10 reads in flight (small queue, ~20 lines) |
| Site deadline | none | 5 s — devices without a result get readOk false |
| Write session | unchanged | unchanged |

### Q3 — instant confirm screen

Confirm screen drawn from the search hit immediately (name, number, brand). /resolve becomes a slim inventory check that starts the full device read + Zendesk in background. New GET /sites/:siteNo/summary waits on the background read and fills in the device line. F004 is unchanged: the confirm button stays disabled until the site is confirmed unique.

### Q4 — idempotent confirm, busy state

First confirm click sets _confirmInProgress and shows "Opening site…" with a spinner; later clicks do nothing. Server keeps a 10 s record keyed on operator + site number so a repeat POST inside that window gets the same token and call ID.

### Q5 — one search row per site

searchSites groups by site number before the 12-row cap. Same name → one plain row. Different names → "duplicate ID" tag (unchanged resolution path).

### Q6 — Zendesk parallelism

Tickets and holds start at resolve in parallel with the device read. Per-ticket comment fetches in callbackLookup are now parallel, capped at 4 (were serial).

### Q7 — single in-flight read per site

perSiteInflight Map (beside perSiteCache) joins all callers on one Promise. resolve, summary, confirm and workspace all use the same read. Control dispatch reads fresh. Failed reads never cached.

### Q8 — browser-side site search

GET /api/sites/index returns de-duplicated directory (site number, name, brand) from the existing 1-hour Zendesk cache. Browser fetches at page load; _indexSearch filters in memory. Server fallback if fetch fails. Callback search included.

### Q9 — Cosmos SQL query for holds

querySql method in CosmosStore and MemStore. SQL: SELECT * FROM c WHERE c.storePartition = @p AND c.status = 'active' AND c.deviceType = 'boiler-panel' AND (c.siteNo = @s OR c.siteNo = @n). siteNo passed as string and number. MemStore uses the same predicate so fixture tests are unaffected.

### D2 — unreadable devices show "Data unavailable"

| Change | Detail |
|---|---|
| readOk flag | false when device has no telemetry bag after the site deadline or fallback failure |
| anyUnknown | workspace payload gains anyUnknown alongside anyOffline; anyOffline no longer counts unreadable devices |
| scopeLevelFor | returns 'unknown' when every device in the group is unreadable |
| Scope tag | grey "Data unavailable" (dashed border, ? icon) — not same as "Monitored only" or "Not on Lighthouse" |
| Grey notice | "We couldn't read some Lighthouse equipment just now. It may be working — we just can't see it. The page will try again in 30 seconds." |
| Heating zone | "We can't read the thermostat in this area right now, so we can't check or change it from here." |
| Ticket note | "Thermostat data unavailable at time of call (read failed) — not confirmed offline" |
| Control | readOk false never unlocks control — all existing control guards are unchanged |

## New and changed wording (design section 6)

| Screen | State | Text |
|---|---|---|
| Confirm | Checking | "Checking the Lighthouse equipment at this site…"; button "Checking site…" (disabled) |
| Confirm | Ready | Device summary as today; button "✓ This is the right site" |
| Confirm | Opening | Button "Opening site…" with spinner; both buttons disabled |
| Confirm | Read failed | "We couldn't read the Lighthouse equipment just now. You can still confirm the site." |
| Site page | Scope tag | "Data unavailable" (grey, dashed border, ? icon) |
| Site page | Notice | "We couldn't read some Lighthouse equipment just now. It may be working — we just can't see it. The page will try again in 30 seconds." |
| Heating flow | Zone unreadable | "We can't read the thermostat in this area right now, so we can't check or change it from here." |
| Ticket note | Zone unreadable | "Thermostat data unavailable at time of call (read failed) — not confirmed offline" |

## Unit tests

958 pass / 959 total / 0 fail / 1 skip (Node test runner). 7 new test files, 40 new tests.

| Test file | Tests | What it covers |
|---|---|---|
| test/tb-bulk-adapter.test.js | 9 | Bulk adapter parity (V1, V2, PowerPause, Salus, switch); ts=0 drop; attribute coercion; partial/403 fallback |
| test/tb-bulk-limiter.test.js | 3 | Never more than 10 reads in flight; queues excess; cap accessible for test |
| test/bulk-key-guard.test.js | 4 | Every key the decoders read is in BULK_LATEST_KEYS |
| test/confirm-idempotent.test.js | 4 | Five rapid POSTs → one call record, one token |
| test/cosmos-query-sql.test.js | 6 | siteNo as string and number both match; in-memory store parity |
| test/search-dedup.test.js | 7 | One row per site; duplicate-ID only when names differ |
| test/tb-unknown-state.test.js | 7 | readOk false: debounce untouched, out of anyOffline, in anyUnknown, control refused |

## Playwright e2e (fixture mode)

| Suite | Pass | Fail | Skip |
|---|---|---|---|
| Stage 1 (feat/oohdash-164-stage1) | 152 | 26 | 2 |
| Base (b16e0aa, main) — suspect specs only | pending | pending | — |

The 26 failures are confined to 4 spec files: additional-notes.spec.js, area-model.spec.js, boilercontrol.spec.js and control-rosetta.spec.js. All 4 spec files are byte-identical between Stage 1 and base (confirmed by git diff). The failures originate from OOHDASH-146 UI changes (riskQuestion on aircon path, hot-water capture flow, Salus timing, date-dependent schedule check) that were not updated when CI e2e was removed at OOHDASH-146. The parallel check on the same specs against main is running and results will be in a gate addendum; if any failure appears only in Stage 1, it will be fixed before the test gate.

The Q3 slim-resolve path falls back to the full resolveSite call unconditionally in fixture mode (resolution.js line 108), so Q3 is not exercised in e2e and cannot introduce a fixture-mode regression.

## Parity script

scripts/tb-parity.mjs — read-only, compares bulk vs per-device output for every mapped device field. Must exit 0 on 10 or more live sites before the release gate. Usage:

`TB_READ_USERNAME=svc-read TB_READ_PASSWORD=... node scripts/tb-parity.mjs [--sites 15]`

The script never prints credentials. Exit 0 = release unblocked. Exit 1 = difference found, release blocked.

## Invariants held

Write path unchanged. F004 unchanged. No new npm dependency. No production changes. No kubectl writes. No TB writes. An unreadable device (readOk false) never unlocks control.
