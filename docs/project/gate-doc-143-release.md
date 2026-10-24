<!-- gate:contract
DECISION: Overall verdict — OOHDASH-143 release v1.5.1 | GO — cut and deploy v1.5.1 now | CONDITIONAL GO — hold for specific investigation below | BLOCK — do not release; requires a fix
DETAIL: P1 bug at Hinckley Knight site 6811 (and others). Two fixes to services/tb-device.js: (A) tbBool now accepts TB REST string-valued telemetry — fixes null zone states at all V1+V2 sites; (B) z2Configured falls back to output3Schedule presence when mask[2]=false — activates at 43 V1 sites (live sweep 2026-10-24). Spencer Q-B2 (definitive mask[2] semantics) outstanding but not a release blocker: Fix B is a display-only read change reversible in one kubectl rollback. Build gate PR #144 (b4a028d), test gate PR #145 (bf779a4). All unit and e2e checks green. v1.5.1 tag pushed.
DECISION: Post-deploy verification method | Smoke-test live site — open site 6335 (mask[2]=false, 2 schedule entries) and confirm zone 2 appears; open site 6811 and confirm zone states decode (overrides now cleared) | Manual /healthz check only | Skip — deploy only, verify next working day
DETAIL: Site 6335 is in the Fix B affected set and is a clean positive check. Site 6811 currently has no output3Schedule entries so Fix B does not activate there — verify Fix A by confirming zone states decode (not null) if any override is present.
-->

# OOHDASH-143 Release Gate — P1 String-Bool Decode + Zone 2 Fix (v2)

**Ticket:** OOHDASH-143 · **Date:** 2026-10-24 · **Stage:** Release (gate 5 of 5)
**Branch:** main @ 11057e3 · **Release:** v1.5.0 → v1.5.1

## What this gate approves

Cutting and deploying release v1.5.1 of the OOH Triage Dashboard. Image built in ACR, rolled out via `kubectl set image`. WRITES_DISABLED and all other env vars untouched.

---

## What ships in v1.5.1

| Fix | Change | Criticality |
|---|---|---|
| A — tbBool string decode | Accepts `"true"`/`"1"` and `"false"`/`"0"` from TB REST telemetry. Any other string (e.g. `"True"`, whitespace, `""`) returns `null` — same as before. Fixes null zone states at ALL V1+V2 sites when TB returns string telemetry. | P1 |
| B — z2Configured schedule fallback | Falls back to output3Schedule entry count when mask[2]=false. Activates at **43 V1 sites** (live sweep 2026-10-24 — see table below). Sites with mask[2]=false and no schedule entries are unaffected (zone 2 still excluded). | Display change |

**Fix B is a display-only read change.** It cannot write to devices. Rollback: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:v1.5.0`

---

## Pre-release checks

| Check | Status |
|---|---|
| Unit tests | PASS — PR #144 CI green |
| E2E (playwright) | PASS — PR #144 CI green |
| Build gate | MERGED — PR #144 (b4a028d) 2026-10-24 |
| Test gate | MERGED — PR #145 (bf779a4) 2026-10-24 |
| Branch on main | YES — 11057e3 (release v1.5.1 commit) |
| v1.5.1 tag pushed | YES — pushed to origin 2026-10-24 |
| WRITES_DISABLED policy | Unchanged — deploy uses kubectl set image only |
| Spencer Q-B2 (mask[2] semantics) | Outstanding — not a release blocker; Fix B is reversible in <60s |

---

## Fix B blast radius — live sweep (2026-10-24)

225 V1+V2 boilercontrol devices across estate. 140 V1, 77 V2, 8 unclassified.

**43 V1 sites where Fix B activates** (mask[2]=false, output3Schedule has entries — zone 2 will now appear):

220, 5135, 6335, 6600, 6716, 6759, 6770, 6777, 6787, 6791, 6792, 6794, 6799, 6803, 6805, 6806, 6812, 6815, 6816, 6820, 6822, 6827, 6828, 6833, 6841, 6842, 6852, 6854, 6861, 6865, 6870, 6871, 6873, 6874, 6875, 6883, 6884, 6885, 6887, 6888, 6891, 7714, 7950

All have output3Schedule entries (1–4) deliberately programmed by heating engineers. Site 6811 is NOT in this set — its schedule is currently empty, so Fix B does not activate there.

**13 V1 sites with mask[2]=false and no schedule** — unaffected; zone 2 stays excluded:
4631, 1736, 6755, 6768, 6790, 6793, 6800, 6811, 6813, 6786, 6893, 8019, 4744

---

## Risk assessment

Fix B accepted risk: output3Schedule entries are deliberately programmed — it is unlikely heating engineers would configure zone 2 schedules for a zone that physically doesn't exist. If the assumption is wrong and phantom zone 2 rows appear, rollback is one kubectl command (under 60 seconds, no data affected). Spencer Q-B2 will confirm definitively after this release; if Q-B2 reveals that mask[2]=false does mean "zone not wired", Fix B will be reverted in a follow-on patch.

---

## Rollback reference

Prior image for rollback: retrieve from `kubectl -n iot-services get deploy ooh-dashboard -o jsonpath='{.spec.template.spec.containers[0].image}'` before deploy.

Fast rollback if phantom zones appear post-deploy:
```
kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:<prior-sha>
```
