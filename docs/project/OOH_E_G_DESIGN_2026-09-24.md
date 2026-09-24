<!-- gate:contract
SECTION: The shared decision
Remove the always-on "Live device status" side card (deviceBoard in views.js). It is the one surface both E and G point at: a permanent whole-site table of device names, raw identifiers, online/offline dots and per-kind readings that the operator should not be reading during a call. It is deleted, not collapsed. The adjacent "What Lighthouse controls at this site" scope card stays — it answers "isn't that you?" better and carries no live health noise. One decision, referenced by both sections below.
SECTION: E — kitchen reshape
The kitchen flow loses its static live-read strip: the "Live read:" summary line and the one-row-per-circuit detail block both go. In their place a single backend-assessment line ("The kitchen circuits are reachable") leads straight into the existing deciding question, "Is the kitchen needed for service right now?". The offline auto-divert to the connection check is preserved unchanged, and both outcome paths (P1 escalation, normal capture) are untouched. Individual-appliance picking is subsumed by the backend assessment, never reintroduced as a picker. The dashboard asserts "reachable" only when confident; otherwise it diverts or stays silent.
SECTION: G — gateway label + deferred reachability
Short term (G1, mostly shipped): confirm "the wall-mounted Lighthouse unit that connects the site" as the plain-English answer to "what does Lighthouse gateway mean", and apply that same framing everywhere the gateway is named — including the one bare status chip at flows.js line 611 that today reads "Lighthouse gateway OFFLINE" with no gloss. The v1.3.0 classifier reorder already prevents false gateway heating chips. The broad device-health reduction is the SAME shared side-card decision above, not a second call. Broader (G2, deferred): any reachability view surfaces only as a high-assurance Q&A outcome and consumes OOHDASH-85's corrected liveness — its design does not begin until OOHDASH-85 is settled.
SECTION: Dependencies & open items
Hard sequencing dependency: G2 (the outcome-only reachability view) must not begin design until OOHDASH-85's freshness-based liveness (48h threshold, active demoted to corroboration) is settled; G2 consumes that liveness, it does not re-derive it. Open clarification for Sam Day or Jonathan Wilkinson: what "Lighthouse gateway" physically means in the live estate, whether it equals the lwgateway device, and whether any Salus-system gateway is named in a way the current gateway tokens (gateway/r10a/dragino/gw) miss. This is a clarification, not a blocker to G1 or E.
SECTION: What build will change
views.js: delete the "Live device status" card at renderWorkspace (line 189) and the deviceBoard function (lines 204-218). flows.js kitchen handler (lines 483-519): replace the "Live read:" doneLine and the per-circuit rows with one backend-assessment line before the deciding question; keep the offline divert (line 489) and both outcomes. flows.js connectivity handler: add the plain-English gloss to the bare gateway chip at line 611. Lighting and fan flows use the same per-device pattern and are flagged for a later consistency pass, out of scope here. No product code lands in this design stage.
DECISION: Approve this coordinated E+G design — remove the static side card, reshape the kitchen flow to one backend-assessment line before the deciding question, and apply the plain-English gateway label consistently — with G2 sequenced behind OOHDASH-85? | Yes, approve | Request changes
-->

# OOH E and G — coordinated design (kitchen readability; Lighthouse gateway meaning and device-health)

**Stage:** Design. **Date:** 2026-09-24. **Author:** Design doer.
**Tickets:** OOHDASH-89 (theme E) and OOHDASH-91 (theme G), designed as one coordinated pass because they share one governing principle and one load-bearing decision.
**Input:** `docs/project/OOH_E_G_UX_DISCOVERY_2026-09-24.md` (approved). **Repo:** C:\repos\ooh-triage-dashboard.
**Branch tip verified against:** origin/main at 5371189.

This is design only. No product code lands. The output is a build-ready specification of what changes, where, and the exact shape of the new backend-assessment line.

---

## Governing principle (honoured throughout)

The dashboard is triage-question-led. The machine assesses device data in the backend and presents only the conclusion and the next step. Static device detail — health readouts, device names, live-read strips — is low-to-zero value to an out-of-hours operator on a call and actively harms it: it crowds a small screen and it tempts an off-script side-conversation about a named device. Device state surfaces ONLY as a high-assurance outcome of the question-and-answer, never as a standing readout. Every decision below is a direct application of that rule.

---

## The shared decision — remove the always-on "Live device status" side card

Both E and G point at the same surface, so the design makes ONE decision about it (discovery Option E1, approved).

**What exists today (code-confirmed).** `renderWorkspace` in `public/js/views.js` (line 189) renders a permanent card `<div class="card tight"><h3>Live device status</h3>${deviceBoard(ws)}</div>`. `deviceBoard` (lines 204-218) draws a whole-site table: one row per device with the zone name, the raw `deviceId` in small monospaced text, an online/offline tag with a coloured dot, and a per-kind live reading (temperature for heating, boost for hot water, on/off + schedule for kitchen). This card is on screen for every call, whatever flow is running.

**Decision.** Remove it entirely. Delete the card wrapper at line 189 and delete the `deviceBoard` function (lines 204-218). This is a removal, not a collapse-behind-a-disclosure (discovery Option E2 was the fallback, not the recommendation): a collapsed table still carries the temptation-to-go-off-script whenever it is opened, for negligible operator value.

**What is retained and why it is sufficient.** The adjacent "What Lighthouse controls at this site" scope card (`views.js` lines 190-192) stays exactly as is. It renders `ws.scope` — the plain-English list of what Lighthouse controls at the site, with a scope tag per group — and its caption already frames it as the answer to "isn't that you?". This is the surface that legitimately serves the site-scope need, and it carries no live health noise. Removing `deviceBoard` does not touch it, and it does not touch the "Open tickets for this site" card below it (line 193).

**Data note.** This removes surfacing of existing fields (`d.online`, `d.deviceId`, `d.telemetry`, `d.schedule`) from the default view. It introduces no new entity or field, so no data-dictionary change is required — the fields still exist on the workspace model and remain available to the flow logic that consumes them in the backend assessment described below.

---

## E — kitchen flow reshape (OOHDASH-89)

### What exists today (code-confirmed, flows.js lines 483-519)

The kitchen handler filters site devices to `kind === 'kitchen'` (line 484). At stage 0 it:

- pushes a "Live read:" summary line via `doneLine` (line 488) concatenating every kitchen circuit with its on/off/offline state and schedule;
- auto-diverts the whole flow into the connection check if any circuit reads offline (line 489, `if (off) { f.cat = 'connectivity'; ... return FLOWR.connectivity(ws, f); }`);
- renders one detailed row per circuit (line 493): a cooking icon, the bold zone name, the current on/off wording, the schedule, the raw `deviceId`, an optional per-circuit switch button (`switchButtons`, gated by `canSwitch`), and an on/off tag;
- only then shows the single deciding question, "Is the kitchen needed for service right now?" (line 496), whose answer routes the outcome: business-critical-now to a P1 escalation (lines 500-508), not-critical-tonight to a normal capture (lines 509-516).

The deciding question is the only element on that screen that changes the outcome. Everything above it is static detail the operator should not be reading.

### Target shape

At stage 0, after the empty-set guard (line 486) and BEFORE anything is rendered, the backend assesses the kitchen circuits and the flow presents one line, then the deciding question. Concretely:

- **Keep the empty-set guard** (line 486) unchanged: no kitchen circuits, show the "No kitchen circuits on Lighthouse here" info and the other-shortcut.
- **Keep the offline auto-divert** (line 489) unchanged and in the same position — it runs before the assessment line is shown, so an offline circuit never reaches the reshaped happy path. This IS the "device state as an outcome, not a readout" pattern; it stays the template.
- **Replace** the "Live read:" `doneLine` (line 488) and the entire per-circuit `rows` block (line 493) and its accompanying `anySwitch` info alert (line 495) with a SINGLE backend-assessment line that precedes the deciding question.
- **Keep** the deciding question (line 496), its two chips (line 497), and both outcome branches at stage 1 (lines 499-517) exactly as they are. The subjects, details, scripts and capture classes do not change.

### Shape of the backend-assessment line

The assessment runs in the flow's backend logic (client-side JS that has already loaded the workspace device model — "backend" here means "computed, not read off a panel by the operator"). It is a small pure function over the kitchen circuits:

- Inputs: `ks` (the filtered kitchen circuits, already in hand at line 484), each carrying `online` and `telemetry`.
- The offline case is already handled by the divert at line 489, so by the time the assessment line is composed, every circuit is online. The assessment therefore emits the high-assurance reachable statement.
- Output: one plain-English `doneLine`, e.g. **"The kitchen circuits are reachable."** — a single high-assurance statement of what the assessment found, with no device names, identifiers, schedules or per-circuit readings.
- It is then followed immediately by the deciding question. No rows, no picker, no live-read strip.

**How "high assurance" is decided.** The line asserts "reachable" only when the flow is confident — and confidence is exactly the condition the existing code already enforces: the divert at line 489 means the reachable line is only ever reached when every kitchen circuit is online. If any circuit is offline the flow diverts to the connection check and the reachable line is never shown. The design adds no new liveness judgement of its own — it inherits the existing online signal and the existing divert. Where a future signal (post-OOHDASH-85) would make even the online read uncertain, the correct behaviour is to divert or stay silent, never to assert reachability the dashboard cannot stand behind. The rule: only assert "reachable" when confident; otherwise divert or say nothing.

**Individual-appliance selection is subsumed, not relocated.** "Fryer 2" as a thing the operator picks disappears. The backend assessment is the whole answer to "what is the state of the kitchen"; the deciding question is the whole answer to "does it matter right now". Per-circuit switch control, where the platform later supports it, appears as an OUTCOME of the flow (after the deciding question routes there), not as a standing row the operator scans — consistent with the D10 switch pattern that already gates on `canSwitch`.

### Consistency note (out of scope for this build, flagged for a later pass)

The lighting flow (flows.js lines 521-578) and the fan flow use the identical per-device row pattern and "Live read:" `doneLine` (e.g. lighting at lines 524 and 527). They are OUT of scope for OOHDASH-89. This design flags the consistency explicitly so a later pass aligns them to the same single-assessment-line shape, rather than leaving the kitchen flow stylistically alone. Do not touch them in this build.

---

## G — gateway label and deferred reachability (OOHDASH-91)

### G1 — short term (recommended now, largely shipped)

**The plain-English label is the answer to "what does Lighthouse gateway mean".** The connectivity flow already carries it: at flows.js line 617 the offline alert names the gateway as "the wall-mounted Lighthouse unit that connects the site" and explains that no remote command can reach the site while it is down; the caller-facing script at line 618 repeats it in the caller's words ("The Lighthouse unit on your wall isn't responding"). Confirm this wording as the standing answer to CJ's meaning question.

**Apply the same framing everywhere the gateway is named — the one gap.** An audit of `public/js` for gateway naming found one place where the gateway shows as a bare status chip without the plain-English gloss: **flows.js line 611**, the connection-check summary `doneLine`, which reads "**Lighthouse gateway OFFLINE**". This is a raw status chip with no wall-unit explanation next to it. Design change: keep the summary line terse (it is a done-line, not the alert) but ensure the plain-English explanation is never more than the immediately-following alert away — which it already is at line 617 for the offline path. The recommended minimal change is to make the line read in plain-English terms, e.g. "Connection check: the wall-mounted Lighthouse unit is offline", so the operator meets the plain-English framing at the first mention rather than only in the alert below. The other gateway references are acceptable: line 20 is the flow-menu description ("Lighthouse gateway / equipment not responding"), which is operator-facing menu copy and reads fine; lines 625/632 are ticket subjects (internal record, not operator-facing during the call).

**False gateway heating chips are already prevented.** The v1.3.0 OOHDASH-82 classifier reorder in `services/tb-device.js` is confirmed present: the gateway row (line 171, tokens `gateway/r10a/dragino/gw`) is tested BEFORE the Salus rows (lines 172-174), with the documented reasoning at lines 162-167 — a paired gateway whose name carries a Salus token now matches gateway first and is typed gateway everywhere, and the short `gw` token is exact-only so it cannot bleed. No design change here; this is confirmation.

**Broad device-health reduction is the shared decision, not a second call.** The whole-site device-health table G refers to is the same `deviceBoard` side card removed in the shared decision above. G references that decision; it does not make a separate one.

### G2 — broader (deferred)

Any "what devices exist / what is online / what is controllable" view must be very simple and must surface ONLY as a high-assurance outcome of the question-and-answer, never as a standing readout — the same move as E. A device is reported reachable or not reachable only when a flow needs that conclusion and only when the dashboard can assert it with high assurance.

**This design does not build G2 and does not redesign liveness accuracy.** G2's reachability statement CONSUMES OOHDASH-85's corrected liveness (freshness-based, 48-hour threshold, `active` demoted to a corroborating signal). It does not re-derive liveness. See the hard sequencing dependency below.

---

## Dependencies and open items

**Hard sequencing dependency — OOHDASH-85.** G2 design does not begin until OOHDASH-85's liveness definition is settled. A truthful outcome-only reachability statement is only safe once the liveness it asserts is truthful, so G2 must consume the freshness-based definition (48h threshold, `active` demoted) rather than invent a second one. OOHDASH-85 is a separate parallel session; nothing in this design touches liveness accuracy. This dependency does not block G1 or E, which rely only on the existing `online` signal and the existing divert.

**Open clarification for Sam Day or Jonathan Wilkinson (not a blocker).** What does "Lighthouse gateway" physically mean in the live estate? Is it the same device operators call `lwgateway`? Does it ever include a Salus system's own gateway, and if so, how is that device named in ThingsBoard? Code confirms the classifier types anything named `gateway/r10a/dragino/gw` as a gateway, but only Sam or JW can confirm the physical mapping and whether any Salus gateway is named in a way the current tokens miss (a Salus gateway whose name carries only a `salus` token and none of the gateway tokens would still classify as heating). This is a clarification to route via Sam; it does not block G1 or E.

**Open question carried from discovery (low risk).** Confirm via Tony (through Sam) that the operator never relies on the whole-site device table for anything the retained scope card does not already answer. The disposition already assumes not; not a blocker.

---

## What build will change (files, functions, touch-points)

Cited against origin/main at 5371189; line numbers may drift slightly, cite what is found at build time.

- **`public/js/views.js`** — In `renderWorkspace`, delete the "Live device status" card at line 189 (`<div class="card tight"><h3>Live device status</h3>${deviceBoard(ws)}</div>`). Delete the `deviceBoard` function (lines 204-218). Leave the "What Lighthouse controls at this site" card (lines 190-192) and the "Open tickets" card (line 193) untouched. Confirm no other caller of `deviceBoard` remains after removal.
- **`public/js/flows.js` kitchen handler (lines 483-519)** — At stage 0: keep the empty-set guard (486) and the offline auto-divert (489). Replace the "Live read:" `doneLine` (488), the per-circuit `rows` block (493) and the `anySwitch` info alert (495) with a single backend-assessment `doneLine` ("The kitchen circuits are reachable.") emitted before the deciding question. Keep the deciding question (496), its chips (497), and both stage-1 outcomes (P1 500-508, capture 509-516) unchanged.
- **`public/js/flows.js` connectivity handler (line 611)** — Reword the connection-check `doneLine` so the first mention of the gateway carries the plain-English wall-unit framing (e.g. "the wall-mounted Lighthouse unit is offline") rather than the bare "Lighthouse gateway OFFLINE" chip. Leave the offline alert (617), the caller script (618) and the outcome branches (622-636) unchanged.
- **`services/tb-device.js` (lines 162-177)** — No change. Confirm the OOHDASH-82 gateway-before-Salus reorder is in place; this is a verification, not an edit.
- **Lighting/fan flows (flows.js ~521-578)** — No change. Flagged for a later consistency pass only.

No new fields, no new entities, no data-dictionary change. The change is subtractive on the operator surface plus one wording fix.

---

## End-to-end testing scope (hand to the test stage)

The design must be verifiable post-build against these scenarios:

- **Kitchen happy path (reachable).** All kitchen circuits online: the flow shows the single backend-assessment line ("The kitchen circuits are reachable.") and goes straight to the deciding question, with no per-circuit rows, no live-read strip and no device picker on screen.
- **Kitchen unhappy path (offline divert preserved).** At least one kitchen circuit offline: the flow auto-diverts to the connection check exactly as before, and the reachable line is never shown.
- **Kitchen outcomes fire unchanged.** "Yes — business critical now" still routes to the P1 escalation (subject, script and P1 summary unchanged); "No — needed later" still routes to the normal capture (subject, detail, script and capture class unchanged).
- **Gateway-offline connectivity flow.** With the gateway offline, the flow still shows the plain-English wall-unit explanation; the first mention (connection-check line) now carries the plain-English framing; both outcomes still work — "It's back online" produces the restored capture, "Still dead" produces the escalation capture.
- **Side-card removal is safe.** Removing the "Live device status" card breaks neither the retained "What Lighthouse controls" scope card (still renders `ws.scope` and answers "isn't that you?") nor any flow that reads device state in its backend logic (kitchen filter, connectivity gateway find, lighting/fan reads all still function).

Realistic test data: a site with several online kitchen circuits (for the reachable path), a site with one kitchen circuit offline (for the divert), and a site whose gateway (`kind === 'gateway'`) is offline (for the connectivity plain-English path).

---

## How the CX criteria are realised

- **Persona (out-of-hours operator, night, time pressure, locked script, stressed caller):** the kitchen screen now lands the operator's eyes on one plain-English conclusion and the one deciding question — nothing on screen invites a side-conversation about a named circuit.
- **Reassurance moment (connectivity/offline — high stakes):** kept as a clear checkpoint. The gateway-offline path retains its full plain-English explanation and caller script, and the first mention now carries the same framing so the assurance is consistent from the first line.
- **Friction moment (routine kitchen triage):** stripped to one assessment line plus one question — the flow gets out of the way exactly where discovery asked it to.
- **"Great looks like" (gateway):** the caller understands, in their own words, that the wall unit has lost power or internet and what to check — the existing line 618 script achieves this, now met consistently from the first gateway mention.
