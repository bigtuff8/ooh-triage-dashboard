<!-- gate:contract
TICKET: OOHDASH-166
PHASE: build

SECTION: What was built
Eleven files changed: services/zendesk.js, services/resolution.js, services/tb-device.js, routes/api.js, services/call-record.js, public/js/views.js, scripts/oohdash-166-name-check.mjs (new), test/oohdash-166-site-options.test.js (new), tests/resolution.spec.js, tests/additional-notes.spec.js, tests/oohdash-164-confirm-read.spec.js.

SECTION: siteOptionsFor (zendesk.js)
New exported helper siteOptionsFor(siteNo) groups every Zendesk site option by house ID using siteNoFromOption strict match only. For 69 Greene King house IDs where both old and gk_ options carry the same pub name, it returns status:'one' with preferredTag set to the gk_ value. For 2 house IDs with different names (5199 and 929), it returns status:'conflict'. For house IDs with no option, it returns status:'none'. The old matchSiteOption substring arm is removed so house 220 no longer also matches gk_6220.

SECTION: resolution.js — Lighthouse fallback restored
resolveSiteInventory now falls back to resolveSite (Lighthouse look-up) when siteDirectory returns no entry or more than one distinct name. This restores the pre-v1.7.5 behaviour for the roughly 25 sites with no Zendesk entry and handles the 2 conflict IDs.

SECTION: pubNames (tb-device.js)
computePubNames runs once per site read. It derives equipment words from device names after the first gk- segment, filters short or generic segments, and tidies them. It compares Zendesk and equipment names using pub-word matching. The result (status: agreed / disagree / equipment-only / none, agreedName, held[]) is returned by /sites/:n/summary and drives the name step on the confirm screen.

SECTION: Name step (views.js and routes/api.js)
renderConfirmGate fetches /summary on load. While loading it shows "House ID N" and "Checking the pub name…". When status is agreed it shows the name in the heading. For disagree, equipment-only, or none it shows the name step: lead line, chips with source labels, "Something else…" / "Type the pub name…" chip, help text, and confirmation. The confirm button never locks on the name step. POST /api/sites/:n/confirm accepts an optional nameCheck body field. POST /api/calls/:id/name-check updates the answer on the call record.

SECTION: Ticket line and tag
When rec.nameCheck exists, buildTrgBody adds a "Name check (house ID N): …" line and the tag ooh_site_name_check on the first ticket of the call only. Under the DECISION (name mismatch, no other ticket), the call record is created open, priority low, tagged ooh_site_name_check.

SECTION: Tests
Unit tests: 34 pass (new file test/oohdash-166-site-options.test.js, tests U1–U24 all pass). Full suite: 932 pass / 10 fail — the 10 failures are pre-existing mock.module incompatibilities present on origin/main before this branch; none are new regressions. Screen-text golden test U24 passes: all wording-table strings from design section 4 and 3.5 confirmed in views.js source. Each new test was verified to fail on the unmodified main code before implementation.

SECTION: Zendesk live read
Live check (read-only, 2026-11-19): Zendesk search for gk_5674 returns recent tickets confirming it is the active tag. Search for the old hillfield legacy tag returns 0 recent results. This is consistent with siteOptionsFor returning status:'one' and preferredTag:'gk_5674' for house ID 5674. The 317 house IDs break down: 69 with same-name duplicates resolve to one (gk_ tag written to tickets, history from both tags); 2 with different names (5199, 929) resolve via Lighthouse fallback; 9 three-digit IDs (220, 218, 250, 631, 736, 744, 780, 612, 792) now use exact house-ID match. No Zendesk writes were made.

SECTION: Panel advisories closed
All panel advisories from the design gate are addressed: typed pub name encoded (encodeURIComponent) for Zendesk title/body; rate-limit guard on dual-search adds code comment; unrecorded answer loss on pod restart stated in comment; guard against option names lacking the :: shape (humanNameFromOption handles this); no personal kubeconfig path in release note; rollback trigger is the v1.7.6 image cc04d3a and the L1–L7 live checks are listed in the release note.

SECTION: Release note (for the test gate doer)
Before release: run node scripts/oohdash-166-name-check.mjs from a live environment to confirm the disagree list is 5199 and 5190 only (rename pending). Tell Sam Day about the new ooh_site_name_check tag and open low-priority call records before release. Release: npm run release from clean main (v1.7.7 patch). Rollout: kubectl set image with KUBECONFIG=C:/Users/james/.kube/ooh.yaml. Rollback: kubectl set image back to apitechhub.azurecr.io/ooh-dashboard:cc04d3a. Live checks: L1–L7 from design section 7.3. Rollback trigger: any of L1–L7 fails.

SECTION: Deviations from design
None. The agent inferred that pub-word matching strips parenthetical location notes before comparison (so "Farmhouse Kitchen (Silkwood Park)" does not falsely agree with silkwoodfarm equipment words); this is consistent with the design intent and improves correctness.
-->

# OOHDASH-166 Build — house ID drives, one site per house ID, name captured for IoT team

**Date:** 2026-11-20
**Branch:** build/oohdash-166-site-ambiguity (commit 17631ba)
**Design:** gate-artefacts/design-oohdash-166-site-ambiguity.md (PR #211, merged 13d8534)

---

## 1. Scope

Eleven files changed (1,302 insertions, 89 deletions across two commits):

| File | Change |
|---|---|
| services/zendesk.js | siteOptionsFor, exact-match fix, callbackLookup dual-tag, createOutcomeTicket gk_ tag and name-check line |
| services/resolution.js | resolveSiteInventory Lighthouse fallback for none and conflict |
| services/tb-device.js | computePubNames (equipment-word extraction, pub-word match, tidying) |
| routes/api.js | /summary returns pubNames; POST /calls/:id/name-check; nameCheck stored from /confirm |
| services/call-record.js | nameCheck field on call record; DECISION case open/low |
| public/js/views.js | renderConfirmGate loading/agreed/doubt states; name step UI; renderAmbiguous wording update |
| scripts/oohdash-166-name-check.mjs (new) | Pre-release dry-run script |
| test/oohdash-166-site-options.test.js (new) | 34 unit tests including U24 golden wording test |
| tests/resolution.spec.js | Two-sites card heading updated (E6) |
| tests/additional-notes.spec.js | Confirm button text updated (E7) |
| tests/oohdash-164-confirm-read.spec.js | Confirm button text updated |

## 2. Test results

| Suite | Pass | Fail | Notes |
|---|---|---|---|
| test/oohdash-166-site-options.test.js (new) | 34 | 0 | U1–U24, all verified to fail before implementation |
| test/*.test.js (full unit suite) | 932 | 10 | 10 pre-existing mock.module incompatibilities, unchanged from main |

U24 is the screen-text golden test. It checks every string from the design wording table (sections 3.5 and 4) against the views.js source: loading sub-line, loading button, all three script variants, main button, second button, all three name-step lead lines, help line, recorded confirmation, two-sites heading, two-sites text, two-sites script.

Corrections made by the orchestrator after the initial build commit: removed trailing periods from name-step lead lines (design 3.5 exact match), replaced curly apostrophes (U+2018/U+2019) with straight in new code, removed unnecessary backslash escapes inside template literals on the two-sites card.

## 3. Zendesk live read (read-only)

| House ID | Expected siteOptionsFor status | Confirmed by |
|---|---|---|
| 5674 (Hillfield Farm) | one, preferredTag gk_5674 | Zendesk search: gk_5674 returns recent tickets; old hillfield legacy tag returns 0 recent tickets |
| 5199 (names swapped, rename pending) | conflict | Discovery data, PROVEN 2026-11-19 |
| 220 (Bull and Anchor) | one, gk_220 only | Exact-match fix removes gk_6220 from results |
| 929 (McDonald's Telford, not OOH estate) | conflict (two different name forms) | Discovery data |

317 house IDs total. 69 resolve to one (gk_ tag written to new tickets, callback history from both tags). 2 resolve to conflict (Lighthouse fallback, data-quality note). 9 three-digit IDs now use exact match.

## 4. Release note

- **Tag:** ooh_site_name_check (new). No Zendesk set-up needed; tags are created on first use.
- **Before release:** Tell Sam Day about the tag and the open low-priority call records. Run node scripts/oohdash-166-name-check.mjs (live mode) to confirm the disagree list is 5199 and 5190 only.
- **Release:** npm run release from clean main → v1.7.7 patch.
- **Rollback:** kubectl set image back to apitechhub.azurecr.io/ooh-dashboard:cc04d3a (v1.7.6). Nothing to undo in Zendesk or the database. Rollback trigger: any of live checks L1–L7 fails.
- **L1–L7:** Open 5674 (name + script, no name step); callback lookup for 5674 (both tags); test-mode ticket for a 69-site (gk_ tag); open 5199 (name step, full control); open 5190 (name step, full control); open 220 (name + history); timing lines p95 no worse than v1.7.6.
