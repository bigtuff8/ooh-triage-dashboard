<!-- gate:contract
TICKET: OOHDASH-167
PHASE: test

SECTION: What was tested
Branch: test/oohdash-167 (main @ 9e0e8a6, squash-merged build/oohdash-167 via PR #218).
Unit tests: 938 pass / 10 fail / 1 skipped (949 total). Zero new failures — the 10 failures are pre-existing (mock.module incompatibilities on Windows/Node unrelated to this change, confirmed by identical count on main before the build PR was applied).
Playwright e2e: removed in OOHDASH-146 (v1.7.0). Not applicable.
Screen-text diff: all 4 pick-up row states verified against design addendum wording (see section below).
OOHDASH-167 unit tests (T1, T2a, T2a-absent, T2b, T4a, T4b): 6/6 pass.

SECTION: Screen-text diff — 4 pick-up row states
State 1 (picked up): gtk.ok label "✅ Picked up — as of [HH:MM]", body agent display name. Code renders t.pickedUpBy.name when isAssigned=true and pickedUpBy is non-null. MATCH.
State 2 (P1, not picked up): gtk.warn label "⏳ Not yet picked up — as of [HH:MM]", body "Raised [createdFriendly]". Code renders when isAssigned=false and isP1=true. MATCH.
State 3 (non-P1, logged): gtk (default blue) label "⏳ Logged — IoT team to review", no body text. Code renders when isAssigned=false and isP1=false. MATCH.
State 4 (assigned, name unresolvable): gtk.ok label "✅ Picked up — as of [HH:MM]", body "(agent name unavailable)". Code renders when isAssigned=true and pickedUpBy=null. MATCH.
State 5 (not OOH): no row rendered at all. Conditional on t.fromOoh. MATCH.

SECTION: Release note
Release: npm run release from clean main → v1.7.8 patch.
Rollout: KUBECONFIG=$KUBECONFIG_PATH kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<new-image-sha> -n <namespace>
Rollback: KUBECONFIG=$KUBECONFIG_PATH kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:cc04d3a -n <namespace>
  (cc04d3a = v1.7.7; namespace from Spencer)
Data wind-back: none required. The pick-up row is read-only display of Zendesk assignee data; no new writes or stored state.
Point of no return: none. A rollback simply removes the row from the ticket page; no data is lost and no downstream consumer is affected.
Live checks post-release (L1–L4): open ticket 45097 in fixture → green "Picked up — Jamie Ashton" row; open ticket 45110 in fixture → blue "Logged" row; open a seeded P1 ticket with no assignee → amber "Not yet picked up" row; open a non-OOH ticket → no row. Rollback trigger: any fails.
-->

# OOHDASH-167 Test — pick-up visibility on the ticket page

**Date:** 2026-11-25
**Branch:** test/oohdash-167 (main @ 9e0e8a6, build PR #218 merged)
**Build gate:** PR #218 (merged 9e0e8a6)

---

## 1. Unit tests

| Suite | Pass | Fail | Skipped | Notes |
|---|---|---|---|---|
| test/*.test.js (full unit suite) | 938 | 10 | 1 | 10 pre-existing failures (mock.module incompatibilities on Windows/Node); confirmed identical on baseline main before build PR |
| OOHDASH-167 new tests (T1, T2a, T2a-absent, T2b, T4a, T4b) | 6 | 0 | 0 | All pass; in test/zendesk.test.js |

Zero new failures introduced by this build. Playwright e2e: removed in OOHDASH-146 (v1.7.0), not applicable.

---

## 2. Screen-text diff — pick-up row states

Verified implementation in `public/js/app.js` against design artefact + addendum wording:

| State | Condition | CSS class | Label | Body | Match |
|---|---|---|---|---|---|
| Picked up | isAssigned=true, pickedUpBy non-null | gtk ok | ✅ Picked up — as of [HH:MM] | Agent display name | PASS |
| Assigned, name unavailable | isAssigned=true, pickedUpBy=null | gtk ok | ✅ Picked up — as of [HH:MM] | (agent name unavailable) | PASS |
| P1, not yet picked up | isAssigned=false, isP1=true | gtk warn | ⏳ Not yet picked up — as of [HH:MM] | Raised [createdFriendly] | PASS |
| Logged, non-P1 | isAssigned=false, isP1=false | gtk (default) | ⏳ Logged — IoT team to review | (empty) | PASS |
| Not OOH ticket | fromOoh=false | — | (no row rendered) | — | PASS |

---

## 3. OOHDASH-167 unit test results

| Test | Description | Result |
|---|---|---|
| T1 | ticketView(45097) fixture → isAssigned true, pickedUpBy Jamie Ashton, fetchedAt string | PASS |
| T2a | Explicit null assignee_id → isAssigned false, pickedUpBy null | PASS |
| T2a-absent | Absent assignee_id field (undefined) → isAssigned false | PASS |
| T2b | P1 ticket with no assignee → isAssigned false, isP1 true, pickedUpBy null | PASS |
| T4a | resolveAgentName stub throws → isAssigned true, pickedUpBy null | PASS |
| T4b | resolveAgentName stub returns null → isAssigned true, pickedUpBy null | PASS |

---

## 4. Code changes summary

**services/zendesk.js:** Fixture ticket 45097 gains `assignee_id: 21142139507484`. `resolveAgentName` fixture guard returns "Jamie Ashton" for that ID. `ticketView()` returns `isAssigned`, `pickedUpBy`, `fetchedAt`. Test-only `_setResolveAgentName` escape hatch added (same pattern as existing `_setQueryResolver`).

**public/css/styles.css:** `.gtk.ok` (green) and `.gtk.warn` (amber) modifier classes added after the base `.gtk` rules.

**public/js/app.js:** 5-state conditional pick-up row inserted after the status div; conditional on `t.fromOoh`.

---

## 5. Release note

This is a v1.7.8 patch release (new feature, no breaking changes, no config change required).

- Rollout: `kubectl set image` with new image SHA (produced by `npm run release` on clean main).
- Rollback image: `cc04d3a` (v1.7.7, the current live version).
- No data wind-back required: read-only display feature, no writes, no new stored state.
- No point of no return.
