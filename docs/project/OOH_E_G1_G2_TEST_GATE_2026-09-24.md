<!-- gate:contract
SECTION: What this gate is
This is the TEST gate for the coordinated E (OOHDASH-89) plus G1 and G2 (OOHDASH-91) change that merged to main at commit 8c711cb. The build was walked end-to-end against both signed-off designs on the running app in fixture mode at a phone-class operator viewport. Approving this gate confirms the implementation behaves as designed and clears it to proceed; it merges only the end-to-end test fixtures added for this walk. Writes stay locked; nothing here deploys or changes the write posture.
SECTION: The gap this phase closed first
The local fixture dataset used legacy device names, so before this phase every fixture site resolved to the gateway-less path and the anchor, hub-down and group-offline states could not be seen through the UI. This phase added gk-namespace fixture sites so all four site-reachability states render for real in the app: a multi-gateway site with the hub and its equipment-group gateways up, a variant with the hub offline, a variant with one equipment-group gateway offline, a variant with two offline, and a hub-less site. Existing fixtures were left untouched, and the unit suite stayed green after the addition.
SECTION: E — kitchen readability and side-card removal, verified in the app
The reshaped kitchen step shows one plain-English assessment line and the single deciding question, with no multi-circuit strip, no per-circuit rows, and no horizontal overflow on the operator viewport — the direct fix for Tony's readability complaint, verified visually. The offline auto-divert still fires, and both kitchen outcomes still route (a P1 escalation and a normal capture were each raised). The workspace right sidebar now shows exactly two cards, the removed device table is gone, and the two-column grid proportions are intact with no spacer or dead space.
SECTION: G1 — plain-English gateway label, verified
On the hub-offline site the connection-check first mention reads "the wall-mounted Lighthouse unit is offline" rather than the old bare "Lighthouse gateway OFFLINE" chip, so the operator meets the plain-English framing at the first line and the existing red wall-unit alert and caller script follow unchanged.
SECTION: G2 — all four reachability states behave as designed
Anchor online with all groups up reads as reachable in green. Anchor offline fires the red wall-unit outcome with its existing outcomes. One equipment-group gateway offline, reached through the heating auto-divert, produces a single amber callout naming the group in natural English ("the boiler equipment group"), with a log-it action, no remote-control offer, and not the anchor-down question. Two groups offline produce exactly one combined amber callout enumerating both with the reassurance line stated once. A hub-less site makes no whole-site claim, checks the equipment directly, and shows no Lighthouse or gateway framing anywhere. Group labels rendered as natural English throughout, never a raw device token.
SECTION: Capture outcomes and routing, verified
The group-offline log-it chip raised a captured ticket carrying the group context and a "raised from heating flow" note under the connectivity class; the gateway-less log-it chip raised a captured ticket with no gateway framing. Operators reach the group-offline conclusion through the existing kitchen, heating and hot-water auto-diverts; lighting and fan correctly keep their existing inline "not responding" wording and do not show the new callout, which is the recorded out-of-scope boundary for their own tickets.
SECTION: Result and evidence
Every scenario in both designs' end-to-end testing scope passed with no defect and no discrepancy against the specified copy, severity colours, test ids and label values. The unit suite is 280 passed, 0 failed, 1 skipped. Eight screenshots covering the reshaped kitchen, the removed side card, the layout, and all four G2 states are embedded directly in this review as the evidence card (self-contained, committed in-repo, no external host) and every scenario is also described in prose, so the verdict stands on the text alone. The required CI check remains unit tests; e2e is not required and its known failures are out of scope.
SECTION: What approving this does
Approving confirms the test phase and merges the added end-to-end fixtures to main. It does not deploy and does not change the write-lock. The change under test is already on main; this gate certifies it. After approval the themes can move to done and any remaining follow-ups (the scoped-out lighting and fan group-offline work, and the gk-namespace live re-check when new site types are commissioned) are carried on their own tickets.
DECISION: Approve the test phase for E + G1 + G2 — every end-to-end scenario in both signed-off designs verified in the running app at the operator viewport with no defect, unit suite green, and the firm kitchen-readability item met visually — and merge the added test fixtures? | Yes — approve the test phase | Request changes
-->

# OOH test gate — E (OOHDASH-89) + G1 and G2 (OOHDASH-91)

**Stage:** Test. **Date:** 2026-09-24. **Branch:** `test/oohdash-89-91-e-g1-g2` (from main at 8c711cb — the build under test is already merged).
**Designs verified against:** `docs/project/OOH_E_G_DESIGN_2026-09-24.md` and `docs/project/OOH_G2_REACHABILITY_DESIGN_2026-09-24.md` (both merged, signed off).

The merged E + G1 + G2 change was walked end-to-end on the running app in fixture mode at a 390px operator viewport, plus a desktop layout check, with zero console errors across the session.

## Visual evidence (embedded in this review)

The eight screenshots are embedded directly in this gate review as the evidence card, rendered inline and committed in-repo at `mockups/ooh-e-g-test-evidence.html` (self-contained, no external host — durable in the PR record). They cover the reshaped kitchen step, the removed side card, the intact desktop layout, and all four G2 site-reachability states: reachable, hub-down with the G1 label, single group-offline reached via the heating divert, the combined two-group callout, and the gateway-less site. Every scenario is also described in prose below, so the verdict stands on the text alone.

## Fixtures added to close the UI gap

The dev fixtures used legacy device names, so before this phase every site resolved to the gateway-less path. Five gk-namespace sites were added so all four states render for real:

- **6770** — multi-gateway, hub and all group gateways up: reachable (green). Also carries online kitchen circuits for the E reshape and both outcomes.
- **6771** — hub (`lwgateway`) offline: hub-down (red) and the G1 label.
- **6772** — hub up, `boiler-r10a` offline, with the area thermostat offline so the heating auto-divert carries the operator into the group-offline conclusion: single amber "boiler".
- **6773** — hub up, `boiler-r10a` and `maindb-r10a` offline: combined amber callout.
- **5198** — gateway-less (five `salusit500` thermostats, no gateway device).

Existing fixtures were left intact. The unit suite is 280 passed, 0 failed, 1 skipped after the addition.

## Scenario results (all pass)

**E — kitchen and layout.**

- Kitchen step reads as one assessment line plus the deciding question, no live-read strip, no per-circuit rows, no horizontal overflow on the operator viewport.
- Offline auto-divert still fires; both outcomes route (a P1 escalation and a normal capture were raised).
- Right sidebar shows exactly two cards; the device table is gone; the 7fr/5fr grid is intact with no spacer or dead space.

**G1 — gateway label.**

- The connection-check first mention reads "the wall-mounted Lighthouse unit is offline"; the red wall-unit alert and caller script follow unchanged.

**G2 — reachability states.**

- Anchor online, all groups up: reachable (green).
- Anchor offline: hub-down (red) with existing outcomes.
- One group offline via the heating divert: single amber callout naming "the boiler equipment group" in natural English, log-it action, no remote-control offer, not the anchor-down question.
- Two groups offline: exactly one combined amber callout enumerating both, reassurance stated once.
- Gateway-less site: neutral info line, per-device liveness, no site claim, no gateway framing anywhere.

**Captures and routing.**

- Group-offline log-it raised a captured ticket carrying the group context and a "raised from heating flow" note (connectivity class); gateway-less log-it raised a captured ticket with no gateway framing.
- Group-offline is reached through the existing kitchen, heating and hot-water auto-diverts; lighting and fan keep their inline "not responding" wording (recorded out-of-scope boundary).

## Verdict

Faithful to both designs end-to-end, no defect found, ready for the test gate. The firm Tony-T3 readability item is met visually on the operator viewport.
