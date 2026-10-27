<!--
gate:contract
TICKET: OOHDASH-153
PHASE: release
SECTION: What goes live
Patch release v1.6.3 from main 49eaad0, which carries the OOHDASH-153 build (PR #171) and test evidence (PR #172). Operators will hear the honest P1 script, "I've raised an urgent P1 ticket for this site and someone will call you back shortly.", with the safety advice kept. P1 tickets will stop getting the "P1 SMS NOT SENT, phone the manager now" note. The Admin card becomes "P1 escalation log". The ooh_p1 tag that makes the IoT Support Dashboard page the manager is unchanged.
SECTION: How it is released
The standard script, npm run release (patch). It bumps to v1.6.3, tags and pushes, builds the image in ACR, rolls it out with kubectl set image, then checks /healthz. Set image leaves every env value as it is: writes stay enabled and SMS_PROVIDER stays at log, which now does nothing. There is no manifest, secret or resource change. The live memory limit is already the committed 512Mi.
SECTION: Checks after release and rollback
After rollout, the orchestrator checks four things. /healthz must report 1.6.3 and writesDisabled false. The pod must be Running with no restarts. The Admin page must load. A read-only check of the newest live P1 ticket must show no new dispatch note. No test P1 is raised on live. Rollback is kubectl set image back to image 5cbfa8b (v1.6.2), which takes about a minute.
DECISION: Release v1.6.3 to live now? | Approve - release v1.6.3 now | Hold - do not release yet
-->

# OOHDASH-153 Release preflight: v1.6.3

**Date:** 2026-10-27 · **Phase:** release · **Release:** R1 · **From:** main 49eaad0 · **Gates:** discovery #169, design #170, build #171, test #172 (all merged)

## 1. Live state now (read-only, checked 2026-10-27)

| Item | Value |
|---|---|
| Live version (`/healthz`) | 1.6.2 |
| Live image | `apitechhub.azurecr.io/ooh-dashboard:5cbfa8b` (rollback target) |
| Pod | 1/1 Running, 0 restarts |
| Resources | limits 500m / 512Mi, requests 100m / 192Mi (matches manifest, no drift) |
| Env | `WRITES_DISABLED=false`, `SMS_PROVIDER=log`, `DATA_MODE=live`, `AUTH_MODE=oidc` |
| Subsystems | bridge, ThingsBoard read, Zendesk and Cosmos all healthy |

## 2. What changes

The code change is exactly what build PR #171 delivered, and test PR #172 proved it. In short:

- `services/escalation.js` removed (the Twilio log-mode path).
- New `services/p1-log.js` writes a positive record to the P1 log.
- `addP1DispatchNote` removed, so P1 tickets no longer get the "NOT SENT" note.
- Seven P1 scripts corrected to the D2 wording, with safety advice kept.
- Admin card renamed "P1 escalation log". There is no false "send failed" tag, and Mark acknowledged still works.
- Config: the `sms` block was removed. Nothing in the live env needs to change: `SMS_PROVIDER` remains on the pod but is no longer read.

## 3. Release steps

1. Run `npm run release` (patch) from clean, synced main. The script:
   - guards that main is clean and synced;
   - bumps `npm version` to v1.6.3, then commits and tags;
   - pushes main and the tag;
   - runs `az acr build`, tagged with the sha, `v1.6.3` and `latest`;
   - runs `kubectl set image`;
   - polls `/healthz`.
2. Known noise: `release.sh` prints a "writesDisabled is NOT true" warning. It dates from before go-live. Writes have been intentionally live since v1.3.0, so this warning is expected and is not a fault.

## 4. Post-release verification (orchestrator)

| Check | Pass condition |
|---|---|
| `/healthz` | `version` 1.6.3, `writesDisabled` false, all subsystems healthy |
| Pod | Running, 0 restarts, image = new sha |
| Admin page | Loads, and the "P1 escalation log" card renders |
| Zendesk (read-only) | The next real P1 after release has the `ooh_p1` tag and no `#ooh-p1-dispatch` note. Check on the first P1 that arrives; no test P1 is raised on live |

## 5. Rollback

`kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:5cbfa8b`, then confirm `/healthz` reports 1.6.2. No data migration is involved: old and new P1 log entries are readable by both versions.

## 6. Open follow-ups (not blocking)

- F1: tidy up the two unreachable script copies.
- F2: boiler-boost e2e test is sensitive to the clock change. Needs its own ticket.
- Naming cleanup: `OohSmsLog`, `/api/admin/sms-log`.
- Remove `SMS_PROVIDER` from the manifest at the next manifest change.
- Check the platform secret for `TWILIO_*` values. Contacting Spencer needs James's go.
