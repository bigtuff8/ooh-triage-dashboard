<!-- gate:contract
SECTION: The shared question
Both items are really one question: how much raw device detail should the dashboard put in front of an out-of-hours operator, and when. The dashboard is triage-question-led — the machine assesses the device data in the background and presents the next step; static device detail is low value to the operator and can pull them off-script. So device state should surface as a high-assurance outcome of the Q&A, not as raw panels to read.
SECTION: E — kitchen readability
Today the kitchen step shows a cramped, overflowing "live read" strip plus a row per circuit, with the deciding question buried underneath; the flow already auto-diverts to the connectivity check when a circuit is offline. Recommendation: remove the static strip and let a single backend-assessment line lead into the deciding question. Picking an individual appliance ("fryer 2") is handled by that backend assessment, not by a static device picker. Near design-ready.
SECTION: G — gateway meaning and device-health
The v1.3.0 fix already stopped gateways being mis-shown as heating chips, and the plain-English "wall-mounted Lighthouse unit" wording already ships in the connectivity flow — so the short-term ask is largely done. The broader "what devices exist / what is online" view should be very simple and appear only as a high-assurance outcome, and it depends on OOHDASH-85's corrected liveness rather than re-deriving it. One thing code cannot answer: what "Lighthouse gateway" physically means and whether it equals the lwgateway — that needs Sam or Jonathan Wilkinson.
SECTION: What design would build
For E, the removal of the static strip and the single backend-assessment line before the question. For G, confirming the plain-English label as the short-term answer and holding the broader reachability view behind OOHDASH-85. Both keep device state as a triage outcome, never a raw pill.
DECISION: Approve removing the static kitchen strip (E) and confirming the plain-English gateway label as G's short-term answer, both reshaped so device state surfaces only as a high-assurance Q&A outcome? | Yes, approve | Request changes
-->

# OOH E and G — UX discovery (kitchen flow and readability; Lighthouse gateway meaning and device-health)

**Stage:** Discovery (read-only). **Date:** 2026-09-24. **Author:** Discovery doer.
**Tickets:** OOHDASH-89 (theme E) and OOHDASH-91 (theme G), taken as one coordinated pass because they share one governing design principle.
**Working copy:** C:\repos\ooh-triage-dashboard (this is the real product repo; the cwd C:\harness-runs\ooh-triage-dashboard holds only the BAU support doc).

---

## Purpose and scope

These two field-feedback items (Tony Willetts on kitchen readability; Csaba Jakab on what "Lighthouse gateway" means) look like separate complaints but share one root question: how much static device detail should the dashboard put in front of an out-of-hours operator, and when. This discovery confirms the current behaviour in code, frames the target behaviour under the dashboard's governing principle, and hands a design shape to the design stage. James has already largely dispositioned both items in the same direction, so this is confirming behaviour and framing the design, not re-litigating whether to act.

All work here is read-only. No code, config or live state was changed. Writes remain locked at deploy time. Nothing here opens a pull request or runs a gate.

Scope boundary with OOHDASH-85 (theme A). The mechanism for deciding truthfully whether a device is offline — the freshness-based definition with a 48-hour threshold and the `active` flag demoted to a corroborating signal — is owned by OOHDASH-85, whose discovery is already done. This discovery does NOT redesign that mechanism. Item G here CONSUMES the corrected liveness that OOHDASH-85 produces; the job for G is the meaning, the label and the surfacing, not the accuracy algorithm. That dependency is called out explicitly in the G section.

---

## The shared principle (read this into every recommendation below)

The dashboard is triage-question-led. The operator works through the question-and-answer script with the caller. The MACHINE assesses the device data in the backend and presents the relevant narrative and the next step. Static device detail — health readouts, device names, device lists, live-read strips across the screen — is of low-to-zero value to the operator during a call, and it actively harms the call in two ways: it crowds the screen (Tony's readability complaint), and it invites off-script questions that circumnavigate the locked conversational flow.

The rule that follows, and that both items below apply: device availability, online state and controllability should surface only as an OUTCOME of the question-and-answer, and only where the dashboard can assert it with HIGH assurance. The backend does the assessment; the operator sees the conclusion and the next step, not the raw material.

---

## Item E — kitchen equipment flow and readability (OOHDASH-89)

### Current behaviour (code-evidenced)

There are two distinct places where static kitchen device state is rendered today, and it is worth separating them because they are removed differently.

First, the always-on right-hand column. renderWorkspace in public/js/views.js at line 189 renders a permanent card titled "Live device status" whose body is deviceBoard (public/js/views.js lines 204 to 218). deviceBoard draws a row per device for the whole site — device zone name, the raw device identifier in monospaced small text, an online-or-offline tag, and a per-kind live reading (for a kitchen device the reading is the on-or-off switch state plus any schedule string, at line 215). This card is on screen throughout the call regardless of which flow, if any, is running. This is the strip that reads as cramped, because it lists every device with its identifier and a status dot in a narrow side column, and it sits next to a second card ("What Lighthouse controls at this site", lines 190 to 192) that repeats much of the same inventory framing.

Second, inside the kitchen flow itself. The kitchen handler in public/js/flows.js (lines 483 to 519) opens by filtering the site devices to kind kitchen (line 484). At stage zero it pushes a "Live read:" summary line via doneLine (line 488) that concatenates every kitchen circuit with its on/off/offline state and schedule, then renders one detailed row PER circuit (line 493) — a cooking icon, the circuit zone name in bold, the current on-or-off wording, the schedule and the raw device identifier, an optional per-circuit Turn ON / Turn OFF button (switchButtons, flows.js lines 286 to 292, gated by canSwitch at 277 to 279 which requires the switch capability, online, and registered), and an on/off tag. Only AFTER all that per-device detail does the single triage question appear ("Is the kitchen needed for service right now?", line 496), which is the question that actually decides the outcome — business-critical-now routes to a P1 escalation (lines 500 to 508), not-critical-tonight routes to a normal capture (lines 509 to 516). The screenshot reference bau-support-doc/screens/17-kitchen-live-reads-autodivert.png shows this per-circuit strip in situ.

So the flow already contains one important backend assessment: if ANY kitchen circuit reads offline it diverts the whole flow into the connectivity check before asking anything (flows.js line 489, `if (off) ... return FLOWR.connectivity`). That auto-divert is exactly the "surface device state as an outcome, not a static readout" pattern the principle wants — it is just currently buried beneath, and duplicated by, the static detail above it.

### The problem in operator terms

At 2am the operator does not need to read a list of fryer identifiers and schedule strings to help a caller. The two things that actually drive the call are: is the kitchen equipment reachable and healthy right now, and is the kitchen business-critical this minute. Everything else on the screen is noise that (a) makes the panel cramped and hard to read on the device, and (b) tempts the operator or the caller into a side-conversation about a specific named circuit that the locked script is designed to avoid. The static "Live device status" side card compounds this by being on screen for every call, kitchen or not.

### Target behaviour under the principle

Remove the static kitchen live-read detail as a thing the operator reads, and let the backend assessment lead. Concretely: before the dashboard presents the next dialogue step, it should have already assessed the kitchen circuits in the backend and should present only the resulting narrative and next step. The existing offline auto-divert (flows.js line 489) is the template — extend that idea so the operator sees a short, high-assurance statement of what the assessment found ("the kitchen circuits are reachable" or "a kitchen circuit is not responding, run the connection check first") and then goes straight to the deciding question. Per-device selection ("fryer 2") is subsumed by that backend assessment; it is NOT re-introduced as a static device picker. Where a circuit is genuinely switchable and the platform later supports it, the control affordance can appear as an outcome of the flow, not as a permanent row the operator scans.

### Options (a real choice exists here)

Option E1 — remove the static "Live device status" side card entirely (views.js line 189 / deviceBoard) and strip the per-circuit detail rows from the kitchen flow, keeping only a one-line backend-assessment statement plus the single deciding question. Simplest, cleanest against the principle, biggest readability win. Cost: the operator loses the at-a-glance whole-site device table, which some may currently use for the "isn't that you?" scope answer — though the adjacent "What Lighthouse controls" scope card (views.js lines 190 to 192) already serves that need better and is retained.

Option E2 — keep a much-simplified device presence somewhere collapsed and out of the default view (for example behind a "show device detail" disclosure), so it exists for the rare case an operator wants it but is not the default surface. Middle path. Cost: still carries the temptation-to-go-off-script risk whenever it is opened, and adds UI complexity for low value.

Option E3 — leave the static strip and only fix the readability (spacing, font). Rejected against the principle; it treats the symptom (cramped) not the cause (static detail the operator should not be reading), and it is the direction James has already dispositioned away from.

Recommendation: Option E1. It is the direct expression of the governing principle and delivers Tony's readability win as a by-product of removing the thing that should not be there. If the panel wants a safety net, E2 is the fallback, but E1 is the recommended target.

### What design would build

- Remove or replace the always-on "Live device status" side card (views.js line 189 / deviceBoard) per the chosen option.
- Re-shape the kitchen flow so a single backend-assessment line precedes the deciding question, replacing the per-circuit detail rows (flows.js lines 488 and 493), while PRESERVING the offline auto-divert to the connectivity check (line 489) and the two outcome paths unchanged (P1 at 500 to 508, capture at 509 to 516).
- Keep switch control, where it exists, as a flow outcome rather than a standing row.
- Note for design: this same static-detail question applies to the lighting and fan flows (flows.js 521 to 578), which use the identical per-device row pattern and "Live read:" doneLines. They are OUT of scope for this ticket, but design should note the consistency so a later pass can align them rather than leaving the kitchen flow stylistically alone.

### Open questions

- [Ask Tony, via Sam] Confirm the operator never relies on the whole-site device table for anything the retained scope card does not already answer. Low risk; the disposition already assumes not. Not a blocker.

Assessment: E is near design-ready. The direction is settled and the code touch-points are identified; the only residual is the E1-versus-E2 panel choice.

---

## Item G — Lighthouse gateway meaning and device-health (OOHDASH-91)

### Current behaviour (code-evidenced)

The gateway is handled in two places. In classification, services/tb-device.js at line 171 the ASSET_INTENT table maps the tokens gateway, r10a, dragino and gw to kind gateway with the plain-English label "Lighthouse gateway". As of the v1.3.0 OOHDASH-82 fix this gateway row is deliberately tested BEFORE the Salus thermostat rows (lines 172 to 174), with the reasoning documented in the comment at lines 162 to 167: a paired gateway whose name carries a Salus token (for example a name like the site-gateway example in that comment) now matches the gateway row first and is typed as a gateway everywhere, not merely hidden from a chip list. That reorder removed the false gateway chips that were appearing as junk heating areas.

In the flow, the connectivity handler in public/js/flows.js (lines 606 to 637) finds the gateway with `ws.devices.find(d => d.kind === 'gateway')` (line 607) and derives its state from the device's own `online` flag. It pushes a connection-check summary line (line 611) that says either the gateway is offline, or a count of offline devices, or all equipment online. When the gateway is offline it shows the plain-English explanation already in place at line 617: it names the gateway as "the wall-mounted Lighthouse unit that connects the site" and explains that no remote command can reach the site while it is down, usually because of power or internet at the site. The caller-facing script at line 618 repeats that in caller-friendly words ("the Lighthouse unit on your wall isn't responding"). So the short-term plain-English label the disposition calls for is ALREADY substantially shipped in the connectivity flow.

What "Lighthouse gateway" maps to in the data: from code alone it is any device the classifier types as kind gateway, which is any device whose name carries gateway, r10a, dragino or gw (tb-device.js line 171). This clearly covers the LoRaWAN wall gateway family (the r10a and dragino tokens are LoRaWAN gateway hardware). Whether it ALSO includes a Salus system's own gateway (the "salus gateway" the ticket asks about) is only partly answerable from code: a Salus-branded gateway would only be typed as a gateway if its name carries one of the four gateway tokens; if a Salus gateway's name carries ONLY a salus token and none of the gateway tokens, the reorder does not help it and it would still classify as heating. The code cannot tell us how the live estate actually names its Salus gateways — that is a data-and-domain question.

The always-on "Live device status" side card (views.js line 189, the same deviceBoard covered under E) is also the broad device-health surface G refers to: it shows every device with an online/offline tag and a per-kind reading. This is the low-value, distracting device-health detail the G disposition wants minimised.

### The problem in operator terms

Two things. First, meaning: an operator (and CJ raising the feedback) sees "Lighthouse gateway" and is not sure what physical thing it refers to or whether it is the same as the "lwgateway" device they see elsewhere. The connectivity flow already answers this well in plain English when the gateway is offline; the gap is whether that clear framing is applied consistently and whether the term matches what people call the device on site. Second, health detail: the broad whole-site device-health table is minimal value and distracting, for the same reasons set out under E.

### Target behaviour under the principle

Short term (largely done): keep and, where needed, extend the plain-English gateway label so the operator always sees "the wall-mounted Lighthouse unit that connects the site" rather than a raw device name or a bare status chip. The v1.3.0 fix already removed the false gateway chips; the connectivity flow already carries the plain-English line. The residual short-term work is small — ensure the plain-English framing is what the operator sees anywhere the gateway is named, and confirm the term used matches site vocabulary.

Broader: any "what devices exist / what is online / what is controllable" view must be very simple and must surface only as a high-assurance outcome of the question-and-answer, never as a standing readout. This is the same move as E — the broad device-health table should not be the default surface. A device is reported reachable or not reachable only when the flow needs that conclusion and only when the corrected liveness lets the dashboard assert it with high assurance.

### Options

Option G1 (short-term, recommended now) — confirm the shipped plain-English gateway label as the answer to the "what does Lighthouse gateway mean" complaint, apply the same plain-English framing anywhere else the gateway is named, and reduce the broad device-health table in line with the E decision. Low cost, mostly already built.

Option G2 (broader, sequenced after OOHDASH-85) — replace any remaining standing device-health surfacing with a high-assurance, flow-outcome-only reachability statement, consuming the corrected liveness from OOHDASH-85. This is where the "very simple, outcome-only" device view is realised.

Recommendation: do G1 now (it is nearly complete) and sequence G2 behind OOHDASH-85, because a truthful outcome-only reachability statement is only safe once the liveness it asserts is truthful.

### What design would build

- Confirm and, where missing, apply the existing plain-English gateway framing (flows.js line 617) consistently wherever the gateway is named to the operator.
- Reduce the broad device-health table (the shared deviceBoard, views.js line 189) per the E decision — the two items should make the SAME call about that side card, not two different ones.
- For the broader outcome-only reachability statement, design against the corrected liveness OOHDASH-85 delivers; do not build a second liveness definition here.

### Open questions

- [Ask Sam / JW] What does "Lighthouse gateway" mean in the live estate, and is it the same device operators call "lwgateway"? Does it ever include the Salus system's own gateway, and if so how is that device named in ThingsBoard? Code can confirm the classifier types anything named gateway/r10a/dragino/gw as a gateway, but only Sam or JW can confirm the physical mapping and whether any Salus gateway is named in a way the current tokens miss. This is the one genuine external dependency in G. It is a clarification, not a blocker to G1.
- [Depends on OOHDASH-85] The broader outcome-only reachability statement (G2) depends on the freshness-based liveness definition OOHDASH-85 produces. G2 must not begin its design until that liveness is settled, and must consume it rather than re-derive it. This is a hard sequencing dependency, not a blocker to G1.

Assessment: G's short-term half (G1) is near design-ready and mostly shipped; the broader half (G2) is deliberately deferred behind OOHDASH-85 and behind the Sam/JW meaning clarification.

---

## Design-stage shape (both items)

Both items make the same move — take static device detail off the default operator surface and let the backend assessment present only the conclusion and the next step. The single most consequential shared decision is the always-on "Live device status" side card (deviceBoard, views.js line 189): E and G both point at it, and design should make ONE decision about it that serves both, not two.

Customer-experience steer for design. The persona is an out-of-hours operator, often at night, under time pressure, working a locked script with a stressed caller on the line. Great looks like: the operator's eyes land on the deciding question and the backend's plain-English conclusion, with nothing on screen inviting a side-conversation about a named device. For the gateway specifically, "great" is the caller understanding, in their own words, that the wall unit has lost power or internet and what to check — which the current line at flows.js 618 already achieves. Reassurance-versus-friction: the connectivity/offline moment is high-stakes and wants a clear checkpoint (it already has one); the routine kitchen triage wants to get out of the way — one assessment line, one question, done. Design owns realising this; discovery only sets the target.

Data scope note for design: nothing new is catalogued here. Both items REMOVE surfacing of existing fields (online state, device identifiers, per-kind readings) rather than introducing new entities. The one data-shaped open item is the physical meaning of "Lighthouse gateway" (Sam/JW), which is domain knowledge, not a new field.

End-to-end testing scope for design to turn into scripts: the kitchen flow still auto-diverts to the connectivity check when a circuit is offline (happy path: reachable circuits go straight to the deciding question; unhappy path: an offline circuit diverts); the P1 and capture outcomes are unchanged and must still fire; the gateway-offline connectivity flow still shows the plain-English wall-unit explanation and both the restored and still-dead outcomes; and the removal of the static side card must not break the retained scope card or any flow that referenced device state.

---

## Recommendation

Approve the two shipped-and-shaping dispositions: for E, remove the static kitchen live-read detail (Option E1) and let a single backend-assessment line precede the deciding question; for G, confirm the already-shipped plain-English gateway label as the short-term answer (Option G1) and defer the broader outcome-only reachability view (G2) behind OOHDASH-85 and behind the Sam/JW meaning clarification. Make one shared decision about the always-on "Live device status" side card that serves both items. Both items are near design-ready with little residual discovery.
