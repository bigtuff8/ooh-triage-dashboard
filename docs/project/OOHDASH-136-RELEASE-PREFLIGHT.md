# OOHDASH-136 Release Preflight

gate:contract
TICKET OOHDASH-136
PHASE release-preflight
QUESTIONS none
DECISIONS none

## Summary

DHW override state display for V1 and V2 boilerControl panels. Read-only display. Patch release v1.4.4 -> v1.4.5. All gates cleared.

## Gate Chain

- Discovery gate: PR #122 merged (prior session)
- Design gate: PR #123 merged b1be401 (prior session)
- Build-plan gate: PR #124 merged 4075c63 (2026-10-22)
- Build: PR #126 merged 9080e8c, CI green (unit tests + e2e, 2026-10-22)
- Test-results gate: PR #127 merged 16efd72 (2026-10-22)

## What Is Being Released

A single additive change to the Hot water triage flow: a new DHW override state card shown at stage 0 for sites with a boilerControl panel (V1 or V2). No existing behaviour changes. No control path. No writes to ThingsBoard.

Changed files on main since v1.4.4:
- config/config.js (4 new constants)
- services/tb-device.js (decodeDhwOverride, dhwOverrideOutcome, V1 history read)
- routes/api.js (dhwOverride safe default on defaultBc)
- public/js/flows.js (DHW override card at Hot water stage 0)
- test/oohdash-136-dhw-override.test.js (29 new unit tests)
- tests/oohdash-136-dhw-override.spec.js (12 new e2e tests)
- data/fixtures/bridge-devices.json (9 fixture sites 9361-9369)

## Release Command

From a clean main checkout in C:\repos\ooh-triage-dashboard:

npm run release:patch

This tags v1.4.5, bumps package.json, pushes tag to origin, and triggers the deployment pipeline.

## Pre-Release Checklist

- main is at 16efd72 (all OOHDASH-136 commits present)
- CI green on 9080e8c (unit tests 33s pass, e2e 4m38s pass)
- No WRITES_DISABLED flag change required (display-only build)
- No env var additions required (4 config constants have safe defaults)
- No migration or data change required

## Post-Release Verification

1. GET /healthz — expect {"status":"healthy"} with all subsystems green
2. GET /api/version — expect {"version":"1.4.5"}
3. Manual smoke — V2 path: navigate to a site that has heating_scenario in its CLIENT attributes but NOT output1OutputMask in SHARED attributes (a pure V2 panel, not a dual-marker site). At Hot water stage 0, confirm the DHW override card renders showing one of: Auto (on-schedule), Override ON until, Override OFF until, or Can't confirm.
4. Manual smoke — V1 path: navigate to a site that has output1OutputMask in its SHARED attributes but NOT heating_scenario in CLIENT attributes (a pure V1 panel). At Hot water stage 0, confirm the DHW override card renders showing one of: Override ON (V1), Override OFF (V1), or Can't confirm.
5. Manual smoke — no panel: navigate to a site with no boilerControl panel. Confirm no DHW override card appears at Hot water stage 0.

Note: the 7 known dual-marker sites (gk-6250, gk-6195, gk-6220, gk-6239, gk-6186, gk-4019, gk-6135) will render the card via the V2 path (heating_scenario-first rule). These are valid for checking the card appears but are not ideal primary smoke targets due to the dual-marker visual disagrement with the existing heating controllability row (tracked separately in Open Flag 1).

## Rollback

Revert commit 9080e8c via a hotfix branch and redeploy. The dhwOverride field is additive; reverting removes the card but does not break any existing behaviour. No data or state to clean up.

## Open Flags (not blocking this release)

- Open Flag 2: flows.js line 635 "This zone can't be adjusted remotely yet" — heating boiler-panel branch wording from OOHDASH-135 W5-D never landed. Separate ticket to be raised.
- Open Flag 1: 7 known dual-marker sites confirmed V2 by estate sweep; new dual-marker sites handled correctly by heating_scenario-first rule.
