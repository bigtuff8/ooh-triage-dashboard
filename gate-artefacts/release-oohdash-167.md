<!-- gate:contract
TICKET: OOHDASH-167
PHASE: release

SECTION: Release summary
Version: v1.7.8 (image SHA 2c2326d), deployed 2026-11-25.
Rollback image: f0716fe (v1.7.7 — previous live; full kubectl rollback command below).
Test gate: PR #219 (merged 1d5b589). Build gate: PR #218 (merged 9e0e8a6). Design gate: PR #216 (merged 7c10f94).
Release command run from clean main (pulled to 1d5b589) → npm run release → ACR build (run db8a) + kubectl set image completed.
Post-deploy pod rollout confirmed: "deployment ooh-dashboard successfully rolled out" (1/1 Ready).
/healthz post-deploy: version=1.7.8, writesDisabled=false (expected — writes have been enabled since v1.3.0; WRITES_DISABLED=false is the correct production state).
Rollback command: KUBECONFIG=C:/Users/james/.kube/ooh.yaml kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:f0716fe

SECTION: L1 — Fixture picked-up state
In fixture mode (?fixture or DATA_MODE=fixture), /api/tickets/45097/view now returns isAssigned=true, pickedUpBy={name:"Jamie Ashton"}, fetchedAt=[HH:MM].
The ticket page at /ticket/45097 renders the green gtk.ok pick-up row: label "✅ Picked up — as of [HH:MM]", body "Jamie Ashton".

SECTION: L2 — Fixture logged state (non-P1)
Ticket 45110 (no assignee, ooh tag, no ooh_p1) renders the blue gtk pick-up row: label "⏳ Logged — IoT team to review", no body text.

SECTION: L3 — Live OOH tickets (assigned)
Any live OOH ticket with an assignee_id set renders the green pick-up row with the agent's display name from Zendesk (cached after first open).

SECTION: L4 — Live OOH tickets (unassigned)
Any live OOH P1 ticket (ooh_p1 tag) with no assignee renders the amber pick-up row: "⏳ Not yet picked up — as of [HH:MM]" with raised time.
Any live non-P1 OOH ticket with no assignee renders the blue "⏳ Logged — IoT team to review" row.

SECTION: Post-release monitoring
No new alerting required. The pick-up row is read-only display of Zendesk assignee data; no writes, no new stored state. Any error in the resolveAgentName lookup degrades silently to "(agent name unavailable)" — never surfaces to the agent as an error.

DECISION: Release approved? | YES | HOLD (reason) | ROLLBACK
-->

# OOHDASH-167 Release — pick-up visibility on the ticket page

**Version:** v1.7.8 (image `2c2326d`)
**Date:** 2026-11-25
**Rollback image:** `f0716fe` (v1.7.7)

---

## Release evidence

| Check | Result |
|---|---|
| ACR build | PASS — run db8a, image 2c2326d |
| kubectl rollout | PASS — 1/1 Ready |
| /healthz version | 1.7.8 ✓ |
| /healthz writesDisabled | false (expected production state) |

Rollback: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:f0716fe`

---

## L1 — Picked-up state (fixture)

Ticket 45097 (`assignee_id: 21142139507484`). `/api/tickets/45097/view` returns `isAssigned: true`, `pickedUpBy: { name: "Jamie Ashton" }`, `fetchedAt` string.

Ticket page renders green row: **✅ Picked up — as of [HH:MM]** / Jamie Ashton.

---

## L2 — Logged state (fixture, non-P1)

Ticket 45110 (no assignee, `ooh` tag only). Ticket page renders blue row: **⏳ Logged — IoT team to review** / (no body text).

---

## L3 — Live assigned OOH tickets

Any live OOH ticket with `assignee_id` set renders the green pick-up row with the agent's Zendesk display name. Name is cached in-process after first open — no extra call on subsequent opens of the same agent's tickets in the same pod lifetime.

---

## L4 — Live unassigned OOH tickets

P1 tickets (`ooh_p1` tag, no assignee): amber **⏳ Not yet picked up — as of [HH:MM]** row with raised time.
Non-P1 tickets (no assignee): blue **⏳ Logged — IoT team to review** row.
Non-OOH tickets: no pick-up row of any kind — page identical to pre-v1.7.8.

---

## Rollback

Data wind-back: none needed. The pick-up row is read-only display; a rollback to v1.7.7 simply removes the row from the ticket page — no written state to unwind.
