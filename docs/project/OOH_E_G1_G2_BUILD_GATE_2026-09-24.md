<!-- gate:contract
SECTION: What this gate is
This is the BUILD gate for one coordinated change carrying theme E (OOHDASH-89, kitchen readability) and theme G (OOHDASH-91, G1 gateway label plus G2 site-reachability outcome). The two merged, signed-off designs (E+G in PR #54, G2 in PR #57) are now working code on branch build/oohdash-89-91-e-g1-g2. Approving this gate merges that code to main. Writes remain locked at deploy time; nothing here changes the write posture or touches liveness.
SECTION: E — the kitchen flow now reads as one line
The always-on "Live device status" side card and its whole-site device table are deleted from the workspace — that static readout is gone, replaced by nothing, because device state should surface only as a triage outcome. The kitchen flow no longer shows a squished multi-circuit "Live read" strip or per-circuit rows; it now states one plain-English assessment line, "The kitchen circuits are reachable.", and goes straight to the single deciding question. The offline auto-divert, the deciding question, and both outcomes (P1 escalation and normal capture) are preserved exactly. This is the direct fix for Tony's readability complaint.
SECTION: G1 — the gateway is named in plain English at first mention
The connection-check summary no longer opens with the bare "Lighthouse gateway OFFLINE" chip. The operator now meets the plain-English framing at the first mention — "the wall-mounted Lighthouse unit is offline" — so the caller-facing explanation is consistent from the first line. No classifier change was needed; the shipped v1.3.x reorder already prevents false gateway heating chips and was confirmed present, not edited.
SECTION: G2 — site reachability is anchored on the real hub, not an arbitrary device
The connectivity flow used to pick one gateway device arbitrarily and narrate its state as the whole site, which could be simply wrong on the many sites that carry several gateway devices. It now selects the site's LoRaWAN hub as the single connectivity anchor by an exact name-segment rule, and only that anchor governs the whole-site reachable claim. A new pure, read-only helper does the selection; liveness is untouched and the corrected online signal shipped in v1.3.1 is consumed as-is.
SECTION: G2 — equipment-group and gateway-less sites are handled honestly
When the site hub is up but an equipment group's own gateway is down, the site stays reachable and the operator sees one amber callout naming the affected group in natural English (boiler, main distribution board, kitchen, heating) — never a raw device token — with a log-it-for-IoT action and no false remote-control offer. Two or more groups down render as one combined callout, not a stack. A site with no hub at all makes no whole-site claim: it checks the specific equipment directly and offers capture, with no Lighthouse-unit framing anywhere. All of this lives in the one connectivity handler, reached by the existing per-flow diverts; the heating, hot-water, lighting and fan handlers were not modified.
SECTION: Fidelity to the signed-off designs
Every verbatim operator and caller copy string, every data-testid, the exact segment-equality anchor rule, the exact label-extraction rule, both recorded accepted bets, and the UI severity ladder (green reachable, red hub-down, amber group-down, neutral hub-less) are implemented as written in the two merged designs. The two-column workspace grid is unchanged; no spacer or replacement panel was added to fill the removed card, per the design's explicit instruction.
SECTION: Verification done before this gate
The unit suite is green at 280 passed, 0 failed, 1 skipped, with 15 new tests covering the anchor selection (exact segment-equality, the null gateway-less case, and the deterministic tie-break) and the group-label extraction (each mapped label plus the safe generic fallback that never emits a raw token). The required CI check is unit tests; e2e is not required and was not run. The firm screenshot item — kitchen readability on a phone-class operator viewport — was captured and reviewed: the single assessment line and deciding question read as clean prose with no horizontal overflow, and the amber group-offline callout wraps cleanly and stays legible.
SECTION: Declared deviations and known limits
Three honest notes. First, the anchor and label rules are expressed twice — the canonical unit-tested copy in the service module and a textually identical copy in the browser flow file — because the front-end is served as plain global scripts with no module system, so it cannot import the service; the two are kept in lock-step and flagged in comments. Second, the local fixture dataset uses legacy device names, so in the dev app every fixture site resolves to the gateway-less path; the anchor, hub-down and group-down paths are proven by unit tests plus direct-handler injection (the amber screenshot is one such), and exercising them through the fixture UI would need gk-namespace fixtures added under their own task. Third, a small forward-looking watch-item for Jonathan Wilkinson (not a blocker): a future Salus hub named without any gateway token would not be recognised as an anchor; every gateway in today's estate is caught.
SECTION: What approving this does
Approving merges the build branch to main behind the required unit-tests check. It does not deploy and does not change the write-lock. The change is subtractive on the operator surface (one card and one strip removed) plus one corrected selection rule and one wording fix; no new fields, entities, CSS classes, or data-dictionary changes. The next stage is the test phase, where the full end-to-end scenarios in the two designs are walked.
DECISION: Approve the E + G1 + G2 build — the kitchen reshape and side-card removal, the plain-English gateway label, and the anchor-based site-reachability outcome with its group-offline and gateway-less paths — as a faithful implementation of the two merged designs, verified by a green unit suite and the firm kitchen-readability screenshot, to merge to main behind the unit-tests check? | Yes — approve the build | Request changes
-->

# OOH build gate — E (OOHDASH-89) + G1 and G2 (OOHDASH-91)

**Stage:** Build. **Date:** 2026-09-24. **Branch:** `build/oohdash-89-91-e-g1-g2` (from main at 3792c23).
**Designs implemented (merged, signed off):** `docs/project/OOH_E_G_DESIGN_2026-09-24.md` (PR #54) and `docs/project/OOH_G2_REACHABILITY_DESIGN_2026-09-24.md` (PR #57).

This build turns both merged designs into working, self-verified code as one coordinated change. The governing principle is honoured throughout: the dashboard is triage-question-led, the backend assesses device data, and device state surfaces only as a high-assurance question-and-answer outcome — never as a standing readout.

## What changed, in plain terms

**E — kitchen readability (OOHDASH-89).**

- The always-on "Live device status" side card and its whole-site device table are removed from the workspace. The "What Lighthouse controls at this site" scope card and the "Open tickets" card stay exactly as they were.
- The kitchen flow drops the squished multi-circuit "Live read" strip and the per-circuit rows. It now states one line — "The kitchen circuits are reachable." — then the single deciding question, "Is the kitchen needed for service right now?".
- Preserved unchanged: the empty-set guard, the offline auto-divert into the connection check, the deciding question and its two chips, and both outcomes (P1 escalation and normal capture).

**G1 — gateway label (OOHDASH-91).**

- The connection-check summary now carries the plain-English "wall-mounted Lighthouse unit is offline" framing at the first mention, replacing the bare "Lighthouse gateway OFFLINE" chip.
- No classifier change: the shipped reorder that prevents false gateway heating chips was confirmed present, not edited.

**G2 — site reachability outcome (OOHDASH-91).**

- The arbitrary "pick any gateway" selection is gone. A new pure, read-only helper selects the site's LoRaWAN hub as the single connectivity anchor by exact name-segment equality, and only the anchor governs the whole-site reachable claim.
- Anchor online with no group gateway down reads as reachable (green). Anchor offline fires the existing hub-down outcome (red, verbatim copy unchanged). A group gateway down while the hub is up reads as reachable with an amber callout naming the group in natural English and a log-it action; two or more down render as one combined callout. A site with no hub makes no whole-site claim, checks the equipment directly, and offers capture with no gateway framing.
- The whole feature lives in the one connectivity handler, reached by the existing kitchen, heating and hot-water auto-diverts. The heating, hot-water, lighting and fan handlers were not modified. Liveness was not touched; the corrected online signal from v1.3.1 is consumed as-is.

## Verification

- Unit suite green: 280 passed, 0 failed, 1 skipped. 15 new tests cover anchor selection (exact segment-equality, gateway-less null, deterministic tie-break) and group-label extraction (each label plus the safe generic fallback that never emits a raw token).
- Required CI check is unit tests. e2e is not required and was not run.
- Firm screenshot item — kitchen readability on a phone-class operator viewport — captured and reviewed: single assessment line and deciding question read as clean prose, chips comfortably spaced, no horizontal overflow. The amber group-offline callout also wraps cleanly and stays legible.

## Declared deviations and limits (nothing hidden)

- The anchor and label rules exist in two textually identical copies — the canonical unit-tested one in the service module and a browser copy in the flow file — because the front-end has no module system to import the service. Kept in lock-step, flagged in comments.
- The local fixture dataset uses legacy device names, so the dev app resolves every fixture site to the gateway-less path. The anchor, hub-down and group-down paths are proven by unit tests plus direct-handler injection; walking them through the fixture UI needs gk-namespace fixtures added under their own task.
- Forward-looking watch-item for Jonathan Wilkinson, not a blocker: a future Salus hub named without any gateway token would not be recognised as an anchor. Every gateway in today's estate is caught.

## What approval does

Approving merges the build branch to main behind the required unit-tests check. It does not deploy and does not change the write-lock. Next stage is the test phase, which walks the full end-to-end scenarios in the two designs.
