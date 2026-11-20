<!-- gate:contract
TICKET: OOHDASH-166
PHASE: test

SECTION: What was tested
Branch: test/oohdash-166-site-ambiguity (main @ 097b078, squash-merged build/oohdash-166-site-ambiguity).
Unit tests: 992 pass / 0 fail / 1 skipped (993 total). Zero failures — the 10 pre-existing mock.module incompatibilities on Windows/Node were resolved by the siteOptionsFor mock additions in the same build PR; CI also green (run 44703195708).
Playwright e2e: 180 passed / 1 flaky / 2 skipped (exit 0). Flaky: removal-health.spec.js:62 (pre-existing P1 SLA hook race). All OOHDASH-166 confirm-gate paths pass.
Screen-text diff: U24 golden wording test passes in unit suite — all design section 3.5/4 strings confirmed in views.js source.
Name-check script: live-environment pre-release step (requires ZENDESK creds); documented in release note.

SECTION: Screen-text diff
U24 golden test (test/oohdash-166-site-options.test.js) verifies every design section 3.5/4 string against views.js source. Passes on this commit. Strings confirmed:
- Loading sub-line: "Checking the pub name…"
- Loading button: "Checking site…"
- Agreed script: "can I just confirm your house ID? I have it as … that's …"
- Doubt script: "can I just confirm your house ID? I have it as … And which pub are you calling from?"
- No-step script: "can I just confirm your house ID? I have it as …"
- Main button: "✓ House ID confirmed — open the site"
- Second button: "Wrong house ID — search again"
- Name-step lead lines (no trailing period): "Our records disagree on the pub name for this house ID" / "Our records only hold a name taken from the equipment" / "We don't hold a pub name for this house ID"
- Help line: "Optional: tap the answer if you get one; you can carry on either way…"
- Recorded confirmation: "✓ Pub name recorded. Customer says: …"
- Two-sites heading: "⚠️ House ID N has two sites on Lighthouse"
- Two-sites text: "Lighthouse has two different sites under this house ID…"
- Two-sites script: "I can't make changes for this site tonight — I'll log it…"

SECTION: Playwright e2e
180 passed / 1 flaky (removal-health.spec.js:62, pre-existing SLA hook race) / 2 skipped / 0 failed. Exit code 0.

SECTION: Pre-release checks (for the release doer)
Credentials: ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN from Spencer's vault (same as existing OOH Zendesk integration creds). KUBECONFIG from Spencer (file path is operator-local — not committed; C:\Users\james\.kube\ooh.yaml is James's machine, not a release requirement).
1. Run: node scripts/oohdash-166-name-check.mjs from a machine with live Zendesk creds.
   API cost: one GET /api/v2/ticket_fields/<id> call (bounded one-shot, ~200 KB payload). No writes.
   Go/no-go rule: Zendesk conflict list must be {5199, 5190} only. Any other site → do not release, raise with orchestrator.
   Baseline owner: James Brown (IoT PM). The {5199,5190} list is re-baselined before each release that ships after IoT team renames those sites; update EXPECTED_DISAGREE in scripts/oohdash-166-name-check.mjs at that point.
   Record the output: paste the script's terminal output as a comment on OOHDASH-166 (or in the release log) before clicking release. This is the durable go/no-go evidence for the audit trail.
2. Tell Sam Day (IoT Support lead, sam.day@...) about the new ooh_site_name_check tag before releasing, so the team knows to treat low-priority open calls tagged ooh_site_name_check as IoT name-mismatch records. No secondary contact required (Sam's team can consume the tag without direct involvement from James).
Data retention: ooh_site_name_check tag and free-text "Customer says: …" records are B2B operational data (no personal data — pub names and house IDs only). Existing Zendesk retention policy applies (same as all other OOH call records). No special disposal required.

SECTION: Release note
Release: npm run release from clean main → v1.7.7 patch.
Rollout: KUBECONFIG=$KUBECONFIG_PATH kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<new-image-sha> -n <namespace>
Rollback: KUBECONFIG=$KUBECONFIG_PATH kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:cc04d3a -n <namespace>
  (cc04d3a = v1.7.6; namespace from Spencer)
Data wind-back: ooh_site_name_check tags and "Customer says: …" records written between deploy and rollback persist in Zendesk after image rollback. This is acceptable — the tag is informational only and IoT team treats those records as advisory data. No cleanup required on rollback.
Point of no return: once IoT team begin consuming ooh_site_name_check records (expected within 24h of Sam Day notification), a rollback creates a brief gap in records. Acceptable — IoT team is told to treat the tag as best-effort. The boundary is explicitly: no hard POR.
Live checks post-release (L1–L7): open 5674 (name + script, no name step); callback lookup for 5674 (both tags); test-mode ticket for a 69-site (gk_ tag); open 5199 (name step, full control); open 5190 (name step, full control); open 220 (name + history); timing lines p95 no worse than v1.7.6. Rollback trigger: any fails.
Post-release monitoring: name-step render errors are logged server-side (NODE_ENV + existing error handler). No new alerting needed — P1 misfires would surface via normal OOH P1 flow or IoT team report.
-->

# OOHDASH-166 Test — house ID drives, one site per house ID, name captured for IoT team

**Date:** 2026-11-20
**Branch:** test/oohdash-166-site-ambiguity (main @ 097b078)
**Build gate:** PR #212 (merged 097b078)

---

## 1. Unit tests

| Suite | Pass | Fail | Skipped | Notes |
|---|---|---|---|---|
| test/*.test.js (full unit suite) | 992 | 0 | 1 | Zero failures — includes U1–U24 (OOHDASH-166 new tests) |

All 10 pre-existing mock.module incompatibilities resolved by siteOptionsFor mock additions in build PR #212. CI run 44703195708 also green.

U24 (screen-text golden test) passes — all design section 3.5/4 wording strings confirmed in views.js source.

## 2. Playwright e2e

| Result | Count | Notes |
|---|---|---|
| Passed | 180 | All OOHDASH-166 confirm-gate paths covered |
| Flaky | 1 | removal-health.spec.js:62 — pre-existing P1 SLA hook race, not related to this change |
| Skipped | 2 | Pre-existing |
| Failed | 0 | |

Exit code 0. The flaky test (`P1 escalation log records raised ticket with deep-link`) is a timing-sensitive race in the SLA hook path, pre-existing and unrelated to OOHDASH-166.

## 3. Pre-release checks

**Credentials:** ZENDESK creds from Spencer's vault. KUBECONFIG from Spencer (operator-local file).

1. Run `node scripts/oohdash-166-name-check.mjs` (one Zendesk API call, read-only, ~200 KB). **Go/no-go:** Zendesk conflict list = {5199, 5190} only. Any other site → do not release.
   - **Record the output:** paste terminal output as a comment on OOHDASH-166 (durable go/no-go evidence).
   - **Baseline owner:** James Brown. Re-baseline `EXPECTED_DISAGREE` in the script before any release that ships after IoT team renames 5199/5190.
2. Tell Sam Day (IoT Support lead) about `ooh_site_name_check` tag before releasing. No other action needed.

**Data retention:** `ooh_site_name_check` tag + "Customer says: …" records are B2B operational data (pub names + house IDs, no personal data). Existing Zendesk retention policy applies.

## 4. Release

- **Release:** `npm run release` from clean main → v1.7.7 patch
- **Rollout:** `KUBECONFIG=$KUBECONFIG_PATH kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<new-sha> -n <namespace>`
- **Rollback:** `KUBECONFIG=$KUBECONFIG_PATH kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:cc04d3a -n <namespace>` (v1.7.6)
- **Data wind-back:** Zendesk tags/records written between deploy and rollback persist — acceptable, IoT treat these as advisory. No cleanup on rollback.
- **L1–L7 live checks:** open 5674 → agreed name + right script + no name step; callback lookup 5674 → both tags; test ticket → gk_ tag; open 5199 → name step + full control; open 5190 → name step + full control; open 220 → right name + history; p95 timing no worse than v1.7.6
- **Rollback trigger:** any L1–L7 fails
