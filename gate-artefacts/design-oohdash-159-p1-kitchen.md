<!-- gate:contract
SECTION: What this design changes
One file of product code (public/js/flows.js, the kitchen flow only) plus tests and one new fixture site. The caller is asked "Is the kitchen needed for service right now?" BEFORE the dashboard sends the call down a path that has no P1. A "Yes" raises a P1 straight away. A "No" carries on exactly as today. Three gaps are closed in one PR (D3 + D5): live-mode offline circuits, live-mode reachable-but-off circuits (verdicts A, C, D and off-unknown), and legacy-mode offline circuits. Same ooh_p1 P1 path and IoT Support Dashboard paging as every other P1 (D4). No server, infrastructure or ticket-type changes.

SECTION: Fix 1 — live mode, circuits not reporting (Kirsty's call)
In live-mode stage 0, the offline list is still worked out first, but it no longer diverts straight away. If any circuit is not reporting and the service question has not been answered, the screen asks it. A new shared block at the top of stage 1 handles the answer, and legacy mode uses the same block (Fix 3). "Yes" raises a P1 at once. The P1 card names the circuits that are not reporting, says the site is serving, and does NOT mention the override button (D1, because the device cannot be reached). "No" diverts to the connectivity check exactly as today. If every circuit is reporting, the question is not asked at stage 0 and the circuit picker shows as today.

SECTION: Fix 2 — live mode, circuit reachable but off
In live-mode stage 1, before the verdict card is drawn, the dashboard checks the chosen circuit's verdict. For "Several / all of it", it checks every circuit. If any of them is off (verdict A, C, D or off-unknown) and the service question has not been answered, the screen asks it. "Yes" raises a P1 at once, using the live fact line for that circuit. This P1 card DOES include the override tip (D2): the PowerPause override button on the front of the unit is safe to press while the team calls back. "No" shows the verdict card and override guidance exactly as today. Circuits that are ON (verdicts B, E, B-outside, B-unscheduled) are not asked. Those are appliance faults routed to the site's repairs team, as today.

SECTION: Fix 3 — legacy mode, circuits not reporting
On legacy (non-Tuya) sites, the service question moves above the offline check. Today it is asked only when every circuit is reachable, so it is now asked on every legacy kitchen call. "Yes" raises a P1. If any circuit is not reporting, the P1 card has no override tip (D1). If every circuit is reachable, the P1 card is unchanged. "No" with a circuit not reporting diverts to the connectivity check as today. "No" with every circuit reachable gives the same captured ticket as today. The not-reporting check is shared with Fix 1. It runs before the existing outcome step and uses the same offline test as stage 0. The live-mode fallback route (live state could not be read) is not an offline case, so its behaviour does not change.

SECTION: The new question uses the existing wording and buttons
The question, both buttons and their test ids (kitchen-critical, kitchen-notcritical) are copied word for word from the existing legacy question. The operator sees one familiar question, never a new one. On the live-mode screens the buttons record the answer and keep the live circuit data, so "No" returns to the live verdict card and not to the legacy captured ticket.

SECTION: Follow-up steps after the caller has already said "No"
Today, "Override didn't work" (A, C, off-unknown) and "Fuse board is fine / still off" (D) re-ask the service question. After this change the caller has already answered "No" at that point. The recommended design skips the repeat and goes straight to the existing captured ticket for the IoT team. "Caller still says it's our problem" (B and E) keeps asking, because the question was never asked on those routes. See the decision below.

SECTION: P1 card text
Both new P1 outcomes keep the existing subject "Kitchen equipment off during service — P1" and the text-message summary "Kitchen equipment off during service", so the IoT team sees one consistent P1 type. Offline card: detail says which circuits are not reporting while the site is serving, and that the IoT team needs to act now. The script is "I've raised an urgent P1 ticket for this site and someone will call you back shortly." with no override mention. Reachable-but-off card: the detail gives the circuit, its live reading and its schedule. The script adds "In the meantime, the override button on the front of the PowerPause unit is safe to use — pressing it once should bring the circuit on." The ticket number is shown on the card as today.

SECTION: Tests
New: TF-159-01 live offline + Yes gives outcome-p1 with no override text. New: TF-159-02 live verdict C (bain-marie, site 8888) + Yes gives outcome-p1 with override text. New: TF-159-03 legacy offline (fixture site 6750) + Yes gives outcome-p1. Also in the PR: offline + No still reaches the connectivity flow, and verdict C + No still shows the verdict card. TF-159-01 needs a new fixture site, 8889, with one Tuya kitchen circuit reporting offline. Fixture site 8888 has no offline circuit, and adding one there would change every TF-140 test. Existing TF-140-02, 04, 06, 07, 08 and 09 reach verdicts A, D or C, so each gets one extra "No" click before its current assertions. Their assertions do not change. Unit tests are unaffected because the client flow has no unit tests.

SECTION: Risk
P1 volume rises on purpose, but only where the caller says service is happening now (R3, accepted in discovery). Calls that are not urgent gain one question on reachable-but-off circuits and on every legacy kitchen call. The override route is otherwise unchanged. There is no server change, so release rollback is the usual image rollback. Before the test gate, the orchestrator dumps the real screen text for every new state and diffs it against this design (standing rule after OOHDASH-144).

DECISION: Follow-up after "Override didn't work" / "Fuse board is fine" when the caller already said "No" | Skip the repeat question — go straight to the captured ticket (recommended) | Ask the service question again — things may have changed during the call
DECISION: Approve design and proceed to build? | Approve — proceed to build | Changes requested
-->

# OOHDASH-159 Design — P1 missed: kitchen off during active service

**Date:** 2026-10-28
**Status:** Design — awaiting gate approval
**Discovery:** PR #182 (merged 2026-10-28) — James decisions D1–D5 binding
**Scope:** `public/js/flows.js` kitchen flow only, plus e2e tests and one fixture site. No server, infra or ticket-type changes.

---

## The principle

Ask "Is the kitchen needed for service **right now**?" **before** the dashboard sends the call down a route that has no P1. A "Yes" is a P1 straight away. A "No" behaves exactly as today. That is the one rule applied in all three places.

| Situation | Before | After — "Yes" | After — "No" |
|---|---|---|---|
| Live (Tuya), any circuit not reporting | Straight to connectivity, no P1 (Kirsty, #51205) | P1, **no** override tip (D1) | Connectivity, as today |
| Live, chosen circuit reachable but off (A / C / D / off-unknown) | Override advice; P1 only after override fails | P1 **with** override tip (D2) | Verdict card + override, as today |
| Live, circuit ON (B / E / B-outside / B-unscheduled) | Repairs advice | Not asked — unchanged | Not asked — unchanged |
| Legacy, any circuit not reporting | Straight to connectivity, no P1 | P1, **no** override tip (D1) | Connectivity, as today |
| Legacy, all reachable | Service question → P1 / captured | Unchanged | Unchanged |

---

## Fix 1 — Live mode, circuits not reporting (`flows.js` ~1864–1868)

Today: in live-mode stage 0, `offlineDevices` is worked out (circuits whose Tuya verdict is `offline`). If any exist, the flow immediately switches `f.cat` to `connectivity` and hands over to the connectivity flow.

Change: keep working out `offlineDevices`. If any exist and `f.data.crit` is not yet set, return the service question (existing wording, existing `kitchen-critical` / `kitchen-notcritical` buttons). The answer goes through `flowStep`, which moves to stage 1. A new shared block, the "not-reporting outcome", handles the answer. It is described under Fix 3 because legacy mode uses it too.

If no circuit is offline, stage 0 is unchanged and the picker or single-circuit auto-select runs as today.

## Fix 2 — Live mode, circuit reachable but off (`flows.js` ~1950–2085)

Today: stage 1 shows `verdictCard` for the chosen circuit. For verdicts A, C and off-unknown the card offers "Sorted with the override" / "Override didn't work". For D it offers the fuse-board check. The service question appears only after one of those fails.

Change: after the follow-up (`_kitchenOutcome`) handling and the legacy-crit handling, and before the verdict card is drawn, work out the "off" circuits:

- single circuit: the chosen device, if its verdict is `A`, `C`, `D` or `off-unknown`;
- "Several / all of it": every live circuit with one of those verdicts.

If at least one is off and `f.data.crit` is not set, return the service question. Its buttons set `crit` but **keep** `_liveKs`. The existing post-failure buttons clear `_liveKs`, and copying them here would wrongly send a "No" to the legacy captured ticket.

- `crit` = 1: `outcomeP1` with the reachable wording. The detail carries `tuyaFactLine` for the off circuit(s).
- `crit` = 0: draw the verdict card as today. Nothing else changes.

ON verdicts (B, E, B-outside, B-unscheduled) skip the question. Those routes are appliance faults for the site's repairs team, and their "Caller still says it's our problem" button keeps asking the question as today.

## Fix 3 — Legacy mode, circuits not reporting (`flows.js` ~1852–1861)

Today: `off` is true when any kitchen circuit is not online, and it diverts to connectivity before the service question. The question is asked only when all circuits are reachable.

Change: in legacy stage 0, ask the service question first, whatever the reachability. The doneLine reads "Some kitchen circuits aren't reporting." or "The kitchen circuits are reachable." to match.

**Shared not-reporting outcome (Fixes 1 and 3).** This is a new block at the very top of `stage >= 1`, before the legacy and live stage-1 branches. It runs when `f.data.crit` is set and the site has a kitchen circuit not reporting. The test is the same as stage 0 uses: on a live site, any Tuya verdict `offline`; on a legacy site, any circuit with `online` false. The block must sit there because neither stage-0 route stores `_liveKs` before asking. Without it, the answer would fall into the legacy branch, which does not know about offline circuits.

- `crit` = 1: `outcomeP1` with the offline wording (below). No override tip.
- `crit` = 0: set `f.cat` to `connectivity`, reset the stage, and hand over to the connectivity flow. This is today's divert, one question later.

When every circuit is reporting, the block does nothing. The existing legacy branch then gives today's P1 or captured ticket, unchanged. The live fallback route (verdict `fallback`) also lands in the legacy branch. It is untouched, because a fallback circuit is not an offline one: stage 0 has already caught every offline circuit.

---

## Follow-up after "No" (decision)

Once the caller has said "No", "Override didn't work" and "Fuse board is fine / still off" would ask the same question again. The recommended design reads the answer already given and goes straight to the existing captured ticket (`kitchen-powerpause`), with no repeat question. The alternative keeps the repeat question, in case the situation changed during the call. James to choose.

---

## P1 card text

Both outcomes keep the subject **"Kitchen equipment off during service — P1"** and the SMS summary **"Kitchen equipment off during service"** (`p1Summary`). They use the same `ooh_p1` route, with no new tag (D4). The ticket number is shown as today.

**Offline (Fix 1, Fix 3):**
- Detail: "Kitchen circuits not reporting while the site is actively serving: [circuit names]. No remote view or control possible; needs immediate IoT action."
- Script: "I've raised an urgent P1 ticket for this site and someone will call you back shortly."

**Reachable but off (Fix 2):**
- Detail: "Kitchen circuit off while the site is actively serving." followed by the live fact line (relay state, schedule state, read time).
- Script: "I've raised an urgent P1 ticket for this site and someone will call you back shortly. In the meantime, the override button on the front of the PowerPause unit is safe to use — pressing it once should bring the circuit on."

---

## Tests (`tests/tuya-kitchen-flow.spec.js` plus a legacy spec)

| ID | Set-up | Click path | Expect |
|---|---|---|---|
| TF-159-01 | New fixture site 8889 — one Tuya kitchen circuit, `tuyaFixture.online` false (verdict `offline`) | Kitchen tile → Yes | `outcome-p1`; card text has no "override" |
| TF-159-01b | Site 8889 | Kitchen tile → No | connectivity flow shown, no P1 |
| TF-159-02 | Site 8888 bain-marie (verdict C) | Picker → Bain-marie → Yes | `outcome-p1`; card text includes the PowerPause override line |
| TF-159-02b | Site 8888 bain-marie | Picker → Bain-marie → No | `kitchen-verdict` card as today |
| TF-159-03 | Fixture site 6750 (legacy, circuit offline) | Kitchen tile → Yes | `outcome-p1`; no override line |

Existing TF-140-02 (A), 04 (D), 06 (C), 07 (all → top verdict A), 08 (A → override-ok) and 09 (D → fuse-fail) each gain one "No" click before their current assertions. TF-140-03 and 05 (B, E) are unchanged. TF-140-09's either/or assertion becomes a strict `outcome-captured` if the recommended follow-up option is chosen.

Why a new site, 8889: fixture site 8888 has five reachable circuits that every TF-140 test depends on. An offline circuit there would put every TF-140 test through the offline P1 route.

---

## Risk

- P1 volume goes up on purpose, but only when the caller confirms service is happening now. R3 was accepted at discovery.
- Calls that are not urgent gain one extra question on reachable-but-off circuits and on every legacy kitchen call. That is cheap compared with a missed P1.
- The client file is the only product change. Rollback is the usual image rollback.
- v1.5.3 lesson: `flows.js` must use straight quotes. A curly quote shipped a SyntaxError before. The build runs the full e2e suite, and CI must be green before merge.
- Screen-text diff before the test gate: every new state's real text is dumped and checked against this design.

---

*Design by ooh-triage-dashboard-R1-mvrygaux · 2026-10-28*
