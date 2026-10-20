<!-- gate:contract
TICKET: OOHDASH-135
PHASE: ship

SECTION: What is being shipped.
Patch v1.4.3 ships Track 1 of OOHDASH-135 (SD-446 ThingsBoard command mapping). Five items: (1) flows.js filter+loop for multi-circuit lighting and fan devices; (2) hwBoostHoursRequested attribute name fix in the hwboost command path; (3) SALUS_IT500_CTL_ENABLED feature flag (default false) with two-level enforcement — Level A suppresses the UI controllable affordance, Level B rejects dispatch at the control service; (4) boilerControl heating scope hard-coded to 'mon' (removes latent dead-code false-positive); (6) 'not-lighthouse' hot-water scope level and flows.js render branch for heating-only boilerControl sites. Track 2 (Item 5, DHW override state display) is excluded and remains blocked on Spencer's semantic confirmation.

SECTION: Gate lineage.
Build-plan gate: PR 112, commit 5ed291c (merged). Build gate: PR 113, commit e86da27 (merged). Test gate: PR 114 (merged). All four gates cleared by panel. James Brown approved each gate PR.

SECTION: Risk and open conditions.
SALUS_IT500_CTL_ENABLED defaults false in production. No iT500 commands can reach ThingsBoard until the flag is explicitly set to 'true' in AKS. The pre-activation checklist applies: (a) confirm WRITES_DISABLED=false via kubectl before touching any env, (b) complete live round-trip test with workbench equipment and Spencer's TB service account before setting the flag, (c) record in OOHDASH-135 Jira. The live round-trip requirement is documented on OOHDASH-135 comment 41392. Track 2 (Item 5) is a separate patch, pending Spencer's input. This ship does not change WRITES_DISABLED, SMS_PROVIDER, or any other env.

DECISION: Gate — v1.4.3 patch safe to ship; flag default-false is the production guard; pre-activation checklist governs the flag flip separately. | Confirmed — ship | Issues found — hold
-->

# Ship — OOHDASH-135 Track 1: patch v1.4.3

**Date:** 2026-10-20
**Version:** 1.4.3 (patch from 1.4.2)
**Branch:** `release/v1.4.3`
**Base:** `main` / commit `1708ef3` (test gate merge)

---

## 1. What ships

Track 1 of OOHDASH-135 — five items from the signed-off build plan:

| Item | Change | Status |
|------|--------|--------|
| 1 | flows.js filter+loop for multi-circuit lighting and fan | Shipped |
| 2 | hwBoostHoursRequested attribute name fix | Shipped |
| 3 | SALUS_IT500_CTL_ENABLED flag, Level A + Level B enforcement | Shipped — flag=false in prod |
| 4 | boilerControl heating scope hard-coded 'mon' | Shipped |
| 6 | 'not-lighthouse' hot-water scope + flows branch | Shipped |
| 5 | DHW override state display (Track 2) | Excluded — blocked on Spencer |

---

## 2. Gate lineage

| Gate | PR | Merge commit | Panel result |
|------|----|--------------|--------------|
| Build-plan | 112 | 5ed291c | Cleared round 2 (CT1-CT5 addressed) |
| Build | 113 | e86da27 | Cleared (e2e fixes BC-E4, F005/F009) |
| Test | 114 | 1708ef3 | Cleared |

---

## 3. Post-ship: what is NOT live yet

The iT500 control button is suppressed in production (flag=false). The code is present but inert. Before the flag can be set true:

1. Confirm `WRITES_DISABLED=false` via kubectl at activation time
2. Complete live round-trip test with workbench iT500 unit + Spencer's TB service account
3. Record sign-off in OOHDASH-135

This is a separate session, not part of this patch.

---

## 4. Rollback

If any issue is found post-deploy: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<prior-sha>`. Prior SHA is logged by release.sh at deploy time.
