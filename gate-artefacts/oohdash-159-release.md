<!--
gate:contract
TICKET: OOHDASH-159
PHASE: release
SECTION: What goes live
Patch release v1.6.6 from main e503594, which carries the OOHDASH-159 build (PR #188) and test evidence (PR #189). Operators will see the override step first in every kitchen flow: before the service question is asked, they are guided to try the PowerPause panel, with a link to the full contractor guide. P1 is raised only if the override does not bring the equipment on and the kitchen is needed now. Every call is logged automatically from the moment the site is confirmed — no "log it" button anywhere. Ticket numbers open a new in-app tab showing the subject, P1 badge and current status, never Zendesk. Outside lighting chips are renamed to "Yes, they've come on" and "No, they're still off". Three bug fixes also ship: the live offline-divert now offers the override step (not an immediate P1), the Verdict-C gate condition is corrected, and the legacy offline-divert is consistent.
SECTION: How it is released
The standard script, npm run release (patch). It bumps to v1.6.6, commits "release v1.6.6", tags it, pushes main and the tag, builds the image in ACR, rolls it out with kubectl set image (env untouched — WRITES_DISABLED stays false), then checks /healthz. No manifest, secret or resource change. The live memory limit is already the committed 512Mi.
SECTION: Pre-release items to confirm
Two items from the design artefact (PR #183) must be in place before go-live: (1) the Cosmos container OohCallRecords must exist — if it does not, call records degrade silently (the server logs a non-fatal error on each call but all other features work). (2) The IoT team must have confirmed that closed ooh_call_record tickets will appear on their dashboard as contact history. Neither item is a code defect; both require a quick confirmation. The release DECISION below asks for confirmation of both before approving.
SECTION: Checks after release and rollback
After rollout the orchestrator checks: /healthz reports 1.6.6 and writesDisabled false, pod Running with no restarts, the kitchen flow shows the override step before the service question, and ticket links open the in-app tab. No test P1 is raised on live. Rollback is kubectl set image back to 2ab9486 (v1.6.5), which takes about one minute.
DECISION: Pre-release confirmed and release v1.6.6 to live now? | Approve — Cosmos and IoT-team confirmed, release v1.6.6 | Hold — waiting on Cosmos container or IoT-team agreement
-->

# OOHDASH-159 Release preflight: v1.6.6

**Date:** 2026-11-04 · **Phase:** release · **Release:** R1 · **From:** main e503594 · **Gates:** discovery #182, design #183, build #188, test #189 (all merged)

## 1. Live state (read-only, checked 2026-11-04)

| Item | Value |
|---|---|
| Live version (`/healthz`) | 1.6.5 |
| Live image | `apitechhub.azurecr.io/ooh-dashboard:2ab9486` (rollback target) |
| Pod (`iot-services`) | 1/1 Running, 0 restarts (3d 23h) |
| `writesDisabled` | false |
| Subsystems | bridge healthy, thingsboard read healthy, zendesk healthy, cosmos healthy |
| Active alert | `no-overnight-activity` — no OOH tickets in the last overnight period (count 24); pre-existing, unrelated to this release; not a go/no-go blocker |

## 2. What changes

The code change is exactly what build PR #188 delivered and test PR #189 verified. In short:

**E1 — automatic call record (every call):** a call record starts at site confirm and is finalised on End call, Raise another issue, leaving the screen, or after 20 minutes idle. No agent "log" step and no "this logs a ticket" warning anywhere. The red warning appears only before an equipment switch; solid red only before a P1.

**J1 — override first (kitchen and outside lighting):** the PowerPause override step is now the first question after the equipment is chosen, for every kitchen circuit type (smart reachable, not reporting, older sites). The service question ("is the kitchen needed for service right now?") appears only after the override attempt. The P1 is raised only if it still won't come on and the kitchen is needed now. Outside lighting chip labels renamed.

**A1 — in-app tickets:** ticket numbers open a new in-app tab at `/tickets/:id/view` showing the subject, P1 badge and current Zendesk status. The Zendesk direct link is gone from every surface. The site panel shows OOH-raised tickets (ooh tag) with a P1 badge and plain status.

**K1 — PowerPause guide:** the full PowerPause Contractor Info guide is served at `/guides/powerpause-contractor-info.html` with Tongou and Owon instructions. Every override step links to it.

**Bug fixes:** live offline-divert now offers the override step first (not an immediate P1); Verdict-C gate condition corrected; legacy offline-divert consistent with live path.

**Encoding safety:** `escFence` guard applied to `callerWords` and `additionalNotes` in the Zendesk ticket body. 409-conflict recovery in the call-record writer.

No change to: heating, DHW, pub heating, fridge, or any flow other than kitchen and outside lighting. No manifest, secret, resource or env change.

## 3. Pre-release items (must confirm before go-live)

| # | Item | Why it matters | Owner |
|---|---|---|---|
| PR-1 | Cosmos container `OohCallRecords` exists | call-record.js writes each call there; without it, every call logs a non-fatal error and no call records are persisted. The dashboard and ticketing still work normally. | Spencer |
| PR-2 | IoT team confirms closed `ooh_call_record` tickets appear on their dashboard | a closed "contact history" ticket is created when a call ends with no P1 (or is abandoned); the IoT team needs to see these for full call-record visibility | IoT team / James |

## 4. Release steps

1. Run `npm run release` (patch) from clean, synced main (e503594). The script:
   - Guards: on main, clean tree, synced with origin.
   - Bumps `package.json` to v1.6.6, commits "release v1.6.6", tags it.
   - Pushes main and the tag.
   - Runs `az acr build`, tagged with the sha, `v1.6.6` and `latest`.
   - Runs `kubectl set image` on deployment `ooh-dashboard` in namespace `iot-services`.
   - Polls `/healthz` until 1.6.6 is reported.

2. Known noise: `release.sh` prints "writesDisabled is NOT true". This is expected — writes have been intentionally live since v1.3.0.

## 5. Post-release verification (orchestrator)

| Check | Pass condition |
|---|---|
| `/healthz` | `version` 1.6.6, `writesDisabled` false, all subsystems healthy |
| Pod | Running, 0 restarts, image = new sha |
| Kitchen flow | Override step appears before service question |
| Ticket link | Ticket number opens in-app tab (not Zendesk) |
| No test P1 on live | Raise no live test incidents |

## 6. Rollback

Rollback target: `kubectl set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:2ab9486 -n iot-services` — restores v1.6.5 in approximately one minute. No data risk: the call-record store is append-only, and the Cosmos container is not modified by a rollback.
