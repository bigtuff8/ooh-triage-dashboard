<!-- gate:contract
SECTION: What G2 is
G2 finishes theme G by defining the "is this site reachable?" conclusion the earlier E+G pass deliberately parked. It is NOT a new screen and NOT a device table. It is a single high-assurance conclusion that the connection-check flow already almost produces, now made truthful and multi-gateway-aware. It consumes OOHDASH-85's corrected liveness (shipped in v1.3.1) — it does not touch how "online" is decided. Both former blockers (OOHDASH-85 unsettled; gateway meaning unverified) are now cleared, so G2 is ready to design in full.
SECTION: Multi-gateway rule
Most sites have several gateway-kind devices at once (a site may carry an lwgateway plus boiler-r10a, maindb-r10a and a Salus hub). The current code picks ONE arbitrarily with find(d => d.kind === 'gateway'), which can report the wrong device's state as "the site". G2's rule: the LoRaWAN site hub (lwgateway) is the site's connectivity anchor and alone governs the site-reachable claim; the -r10a and Salus-hub gateways are equipment-group gateways whose state maps to their own equipment group's reachability, never to the whole site. If the lwgateway is down, the site is unreachable; if only an equipment-group gateway is down, the site stays reachable and only that group is flagged.
SECTION: Anchor-selection rule
Build MUST select the anchor with a new pure read-only helper, not the arbitrary find(). Because kind:gateway is shared by lwgateway, the -r10a devices and the Salus hub, selection is by device NAME, not kind. The anchor is the device whose normalised name (services/tb-device.js normaliseName) split on hyphen/whitespace has a segment exactly equal to the token lwgateway — a segment-equality test, deliberately not a substring test, so no other gateway can pose as the anchor. 0 anchors is the gateway-less path; the pathological >1 case picks the first by sorted name deterministically.
SECTION: Group-gateway offline
An offline equipment-group gateway must never be silently invisible. When the anchor is online but a group gateway (boiler-r10a, maindb-r10a, kitchen-r10a or the Salus hub) is offline, the SITE stays reachable AND the relevant per-equipment flow surfaces that group as unreachable as its own outcome, consuming d.online. This is a build item with verbatim copy, not a narrative aside.
SECTION: Accepted assumptions
G2 rests on one recorded bet: every remote command reaches the site through the lwgateway (the LoRaWAN hub), so the lwgateway alone governs the site-reachable claim. It is drawn from existing tb-device/flows commentary and the 2026-09-24 read-only sweep of 6 sites (5198, 6770, 6261, 4631, 6886, 6748); it is NOT verified against every possible estate architecture. Re-validate before deploy if new site types or connectivity architectures are commissioned.
SECTION: Gateway-less sites (5198)
Some sites (CJ's 5198) have no gateway device at all — only thermostats in the gk-5198-* namespace. At such a site the dashboard must NOT claim gateway-based reachability it cannot assert. G2's fallback: fall back to the per-device liveness of the specific equipment the flow is about, make no site-wide reachability claim, and give the operator an action-oriented (not architectural) line. Verbatim operator line: "This site uses direct device connections — we'll check the equipment directly." The operator sees per-equipment liveness for the kit in question, never a false whole-site verdict.
SECTION: Assurance gating
G2 asserts a site-reachability conclusion ONLY when it is confident: a recognised connectivity anchor (lwgateway) exists AND its corrected online value is known. Anchor present and online → "the site is reachable"; anchor present and offline → the existing plain-English "wall-mounted Lighthouse unit is offline" outcome; no anchor, or the read cannot be trusted → stay silent and defer to per-device liveness. Default to silence over a low-confidence claim. No standing readout is introduced — the conclusion appears only as an outcome of the connectivity Q&A.
SECTION: What build will change
One file does the real work: public/js/flows.js connectivity handler (~line 606-637). Replace the arbitrary single find() with the anchor-based multi-gateway selection and emit the site-reachability conclusion consuming the corrected d.online. A small optional read-side helper may be added in services/tb-device.js to classify a gateway device as connectivity-anchor vs equipment-group — pure read, NO change to liveness (deriveFreshnessOnline / the online: assignment stay untouched). Confirms E's side-card removal is NOT reversed: G2 stays outcome-only, no standing device-health surface returns.
SECTION: Open items
One OPTIONAL forward-looking question for Jonathan Wilkinson, not a blocker: if a future Salus hub is named WITHOUT a gateway token, the classifier would miss it and it would not be recognised as an anchor. Today every gateway in the estate is caught, so this is a watch-item only. Nothing else needs external input; both former blockers are cleared.
SECTION: Workspace layout after removal
Removing the "Live device status" card (E's shared decision) drops the right sidebar from three cards to two — the scope card and the tickets card. The workspace grid is fractional, not fixed: 7fr for the left Q&A flow and 5fr for the right sidebar, with the two columns top-aligned. Because the columns are independent and size to their own content, taking one card off the sidebar simply makes the sidebar shorter; it does NOT leave a hole in the grid, does NOT stretch the surviving cards, and does NOT change the flow column's width. The recommended resolution is therefore to keep the exact two-column proportions and let the flow stay the primary focus with the shortened sidebar beside it — no grid rewrite, no widening, no filler card. Build must not add a replacement panel or a spacer to "balance" the column.
SECTION: Styling the outcome line
The E kitchen backend-assessment line and the G2 site-reachability conclusion are the operator's answer, so they must READ as the answer, not as a quiet completed-step tick. They render as a body-level coloured callout (the existing alert component) placed directly ABOVE the deciding question, so the operator's eye lands on the conclusion then the next step. Severity is carried by colour: the all-good / reachable case is the green success callout; the offline / unreachable / group-down case is the red danger callout with its existing plain-English wall-unit wording; the gateway-less case is the neutral info callout that makes no site verdict. The quiet dashed step-trail is kept only as a secondary record of what the flow checked, never as the primary conclusion. No new visual language is invented.
SECTION: Readability outcome
Tony's original complaint was that the kitchen "live read" strip was squished and hard to read on his device. E deletes that multi-circuit strip and the per-circuit rows outright and replaces them with one short plain-English line, which removes the horizontal-cramming that caused the problem. The readability intent build must meet: the reshaped kitchen step and every reachability outcome must be legible on the operator's real out-of-hours viewport, wrap cleanly with no horizontal overflow, and keep comfortable line length and spacing. This is a named test-scope item: the build/test stage must verify it visually with screenshots on the operator viewport, not just assert it in code.
DECISION: Approve this revised G2 design — the exact siteConnectivityAnchor segment-equality rule, the verbatim gateway-less and group-offline operator copy, the scoped-in group-gateway-offline build item, the recorded lwgateway accepted bet, AND the added UI/UX design (keep the two-column grid with the shortened sidebar, style the reachability/assessment conclusion as a severity-coloured callout above the deciding question, and meet the stated kitchen-readability intent verified by screenshot) — all consistent with E's side-card removal? | Yes, approve | Request changes
-->

# OOH G2 — site-reachability outcome design (multi-gateway + gateway-less)

**Stage:** Design. **Date:** 2026-09-24. **Author:** Design doer.
**Ticket:** OOHDASH-91 theme G, part G2 (the broader "is this site reachable" device-availability outcome deferred by the earlier E+G design).
**Inputs (settled, not re-litigated):** `docs/project/OOH_E_G_DESIGN_2026-09-24.md` (merged E+G, whose G2 material is the starting shape) and `docs/project/OOH_FALSE_OFFLINE_DESIGN_2026-09-24.md` (OOHDASH-85 liveness, shipped v1.3.1).
**Branch tip verified against:** origin/main at d7c4330 (v1.3.1).

This is design only. No product code lands. The output is a build-ready specification of the site-reachability conclusion, the multi-gateway rule, the gateway-less fallback, and the exact touch-points.

---

## Governing principle (honoured throughout)

The dashboard is triage-question-led. The backend assesses device data and the operator sees only a high-assurance conclusion and the next step. Device availability and reachability surface ONLY as an outcome of the question-and-answer, and ONLY where assurance is high — never as a standing readout or table. Where assurance is not high the dashboard does not assert: it stays silent or defers to the existing per-flow behaviour. This is the same rule that removes the always-on "Live device status" side card under E; G2 does not reintroduce any standing device-health surface. G2 is outcome-only.

---

## What has changed since the E+G design (both former blockers cleared)

The earlier E+G pass parked G2 pending two things. Both are now resolved.

**OOHDASH-85 shipped (v1.3.1) — liveness is now freshness-authoritative.** `services/tb-device.js` `deriveFreshnessOnline` (line 506) is applied at the `online:` assignment (lines 585-587): a null last-report timestamp is offline; an age at or under 48 hours (`FRESHNESS_DEFAULT_MS`, with a per-type override map that is present but currently empty) is online; an age over 48 hours is offline; the `active` flag is corroboration only and can never flip a fresh device. A server-side anti-flicker debounce (`applyFreshnessDebounce`, line 528) backs it up. Consumers still read the same opaque boolean `d.online` on each device — it is simply truthful now. **G2 CONSUMES `d.online`. G2 does not redesign liveness — that is OOHDASH-85, done. Nothing in this design touches `deriveFreshnessOnline` or the `online:` assignment.**

**Gateway meaning and classifier verified (live read-only estate sweep, 2026-09-24), and re-confirmed against code here.** The gateway row in `ASSET_INTENT` (`services/tb-device.js` line 198, tokens `gateway` / `r10a` / `dragino` / `gw`) is tested BEFORE the Salus rows (lines 199-201), so it catches every gateway in the estate. "Lighthouse gateway" is our label; `lwgateway` is the LoRaWAN site hub; `-r10a` devices are gateway hardware. The Salus edge case is already handled — `gk-<site>-salusit700-gateway-1` carries a `salus` token but is a hub and is correctly typed `gateway` by the ordering. The only residual is forward-looking (a future Salus hub named WITHOUT a gateway token) and is carried below as an optional note to JW, not a blocker.

**Two realities the sweep exposed that G2 must resolve:**

- **Multi-gateway sites.** Most sites have several gateway-kind devices at once. Site 6770, for example, carries `lwgateway` plus `boiler-r10a`, `maindb-r10a` and `salusit700-gateway-1`. The current connectivity handler (`public/js/flows.js` line 607) does `ws.devices.find(d => d.kind === 'gateway')` and returns only ONE, arbitrarily — whichever the array yields first. That device's online state is then narrated as "the site's" connectivity, which can be simply wrong.
- **Gateway-less sites.** CJ's site 5198 has NO gateway device in its `gk-5198-*` namespace — only five `salusit500` thermostats. There is nothing for the current `.find()` to return (`gw` is `undefined`), so the handler silently falls to the "N device(s) offline / all equipment online" branch counting every device — which is not a site-reachability statement at all.

---

## The reachability outcome — a Q&A outcome, not a panel

The connectivity flow (`public/js/flows.js` lines 606-637) already produces almost exactly what G2 needs, and G2 builds on it rather than inventing a new surface:

- Line 611 emits a one-line connection-check summary (`doneLine`).
- Lines 617-618 give the plain-English explanation ("the wall-mounted Lighthouse unit that connects the site — no remote command can reach the site while it's down") and the caller-facing script ("The Lighthouse unit on your wall isn't responding…").
- Lines 622-636 route the two outcomes (restored on the call; still dead — capture and escalate).

G2's job is to make the summary line and the branch that follows it a truthful, high-assurance **site-reachability conclusion**, computed from the corrected `d.online` and the correct gateway, rather than from an arbitrary single device. The plain-English explanation and caller script at lines 617-618 are reused verbatim — they are already the right words; G2 only makes sure they fire on the right signal. No new screen, no status pill, no device list. The conclusion is an outcome of entering the connectivity flow, exactly as today.

---

## The multi-gateway rule (build contract)

G2 replaces the arbitrary `find(d => d.kind === 'gateway')` with a rule that distinguishes the site's connectivity anchor from equipment-group gateways.

**Recommended rule — the LoRaWAN hub is the connectivity anchor.**

- **The site connectivity anchor is `lwgateway`** — the LoRaWAN site hub. Its corrected `d.online` alone governs the whole-site reachability claim. If the anchor is online, the site is reachable; if the anchor is offline, the site is unreachable and the existing plain-English wall-unit outcome (lines 617-618) fires.
- **The `-r10a` and Salus-hub gateways are equipment-group gateways.** Each one's state maps to the reachability of its own equipment group (the boiler group behind `boiler-r10a`, the main distribution board behind `maindb-r10a`, the Salus heating group behind `salusit700-gateway-1`), NOT to the whole site. An equipment-group gateway being offline does not make the site unreachable — it makes that group unreachable while the rest of the site is still reachable through the anchor.
- **Selection (exact, executable rule).** Selection is by device NAME, not by `kind` — `kind:gateway` is shared by the anchor, the `-r10a` devices and the Salus hub (`services/tb-device.js` `ASSET_INTENT` line 198 types all of them `kind:gateway` via the `gateway`/`r10a` tokens), so "the gateway is the anchor" is not executable by kind alone. See the mandatory helper below.

**Mandatory anchor helper (build contract).** Add a pure, read-only helper to `services/tb-device.js` with this exact signature:

`siteConnectivityAnchor(devices) -> device | null`

Its behaviour is exactly:

- For each device, compute `normaliseName(device.name)` (the existing exported normaliser, `services/tb-device.js` line 141 — lower-cases, strips parenthetical cross-refs, maps `_`→`-`, collapses whitespace; it does NOT split on `-`).
- Split that normalised name into segments on hyphen/whitespace: `norm.split(/[-\s]+/).filter(Boolean)` (the same split `classifyDevice` uses at line 303).
- **The predicate is exact SEGMENT EQUALITY, not substring:** a device is an anchor candidate when `segments.includes('lwgateway')` is true — i.e. one of its hyphen/space-delimited segments equals the exact string `lwgateway`. This is deliberately a segment-equality test and NOT `norm.includes('lwgateway')`: segment equality means no other device can pose as the anchor by merely containing the token. `gk-<site>-lwgateway-1` → segment `lwgateway` present → anchor. `gk-<site>-boiler-r10a-1`, `gk-<site>-maindb-r10a-1`, `gk-<site>-kitchen-r10a-1` and `gk-<site>-salusit700-gateway-1` have NO `lwgateway` segment → NOT anchors, even though all are `kind:gateway`.
- **0 candidates → return `null`** (the gateway-less path — see below).
- **Exactly 1 candidate → return it.**
- **>1 candidate (pathological, not expected in the swept estate) → deterministic pick: return the candidate whose `normaliseName` sorts first** (`.sort()` ascending on the normalised name, take `[0]`). This guarantees a stable choice; it is a defensive tie-break, not an expected case.
- The helper is pure and read-only: it reads only `device.name`, allocates nothing outside its scope, derives no liveness, and never mutates the input. It does not touch `deriveFreshnessOnline` or the `online:` assignment.

**The connectivity handler MUST call `siteConnectivityAnchor(ws.devices)` and MUST NOT use `ws.devices.find(d => d.kind === 'gateway')` (`public/js/flows.js` ~line 607).** That arbitrary `.find()` is the exact bug G2 exists to kill; removing it is a hard build requirement, not a preference.

**Why this rule (justified against the sweep and operator value).** The sweep showed that a single site legitimately holds one LoRaWAN hub plus several hardware gateways, and only the LoRaWAN hub is the site's single point of connectivity — every remote command reaches the site through it, which is precisely what lines 617-618 already tell the caller. Reporting an equipment-group gateway's state as "the site" (today's arbitrary `.find()`) produces two failure modes an out-of-hours operator cannot afford: a false "site unreachable" when only one boiler group's gateway is down (sending the operator and caller down the fuse-board dead-end for a site that is actually reachable), and a false "site reachable" when the anchor is down but the `.find()` happened to return an online equipment gateway. Anchoring the site claim on the one device that actually is the site's connectivity removes both. It also matches how the operator reasons: "can we reach the site at all?" is the anchor; "is this bit of kit reachable?" is the group gateway, which the per-flow reads already cover.

**Behaviour when the anchor is present:**

- Anchor online → the site is reachable. If an equipment-group gateway is offline, the site-level claim stays "reachable" AND the relevant per-equipment flow surfaces that group as unreachable — see the scoped-in build item below.
- Anchor offline → the site is unreachable; fire the existing wall-unit alert and caller script (lines 617-618) and both existing outcomes (lines 622-636) unchanged.

## Equipment-group-gateway-offline (SCOPED IN — build item)

This behaviour is scoped IN for this increment (aligned with theme E), not left in narrative. **Build item:** when `siteConnectivityAnchor(ws.devices)` is online but an equipment-group gateway (`boiler-r10a`, `maindb-r10a`, `kitchen-r10a`, or the Salus hub `salusit700-gateway`) has `d.online === false`, the site-level claim stays "reachable" AND the per-equipment flow that concerns that group (heating / kitchen / connectivity) surfaces THAT group as unreachable as its own flow outcome, consuming the group gateway's `d.online`. An offline group gateway is therefore never silently invisible — it becomes a group-level outcome, not a whole-site verdict and not nothing.

- **Verbatim operator-facing line (group gateway offline, site anchor up):** "The site is reachable, but the <group> equipment isn't responding — its own connection is down. Other equipment at this site can still be reached."
- **Verbatim caller-facing line:** "The site itself is online, but the unit that runs the <group> equipment has lost its connection. I can't reach that equipment remotely, so I'll log it as a priority for the IoT team."
- `<group>` is the caller-meaningful group label (e.g. "boiler", "main distribution board", "kitchen", "heating") resolved from the offline group gateway; build maps the group gateway to its label from the same asset intent already used elsewhere.
- Tone matches the existing flows.js connectivity wording (plain-English, action-oriented, no gateway jargon exposed as the operator's mental model).

---

## The gateway-less-site case (5198)

Some sites have no gateway device at all. Site 5198 carries only `salusit500` thermostats in its `gk-5198-*` namespace; there is no connectivity anchor and no equipment-group gateway to assess.

**Rule: never claim gateway-based reachability that cannot be asserted.** When the site has no gateway-kind device:

- The dashboard makes NO site-wide reachability claim — it does not say "the site is reachable" and it does not say "the site is unreachable". There is nothing it can truthfully assert at site level.
- It falls back to the per-device liveness of the specific equipment the flow is about — the existing per-flow `!d.online → connectivity` reads that already run for heating, hot-water and kitchen. Those reads consume the corrected `d.online` and remain the source of truth for "is this thermostat reachable".
- **What the operator sees at such a site (verbatim copy).** No whole-site connectivity verdict, and no gateway mental model imposed at 2am. In place of the anchor-based summary line the flow shows this exact operator-facing line:

  **"This site uses direct device connections — we'll check the equipment directly."**

  The concrete next step: the flow falls back to the per-device liveness (`d.online`) of the specific equipment the current flow concerns (the thermostats the caller is asking about), reports that per-equipment reachability, and offers the normal capture path. It makes NO site-wide reachability claim. Where a caller-facing line is needed it stays equally action-oriented, e.g.: **"This site's equipment connects directly rather than through a single hub, so let me check the specific unit you're calling about."** The operator is never shown a false whole-site "reachable" or "unreachable" chip.

This keeps G2 inside the governing principle: where assurance is not high (no anchor to assert from), the dashboard stays silent at site level and defers to the existing per-flow behaviour.

---

## Assurance gating (exact conditions)

G2 asserts, defers, or stays silent as follows, tied to `d.online` truthfulness and gateway presence:

- **Assert "site reachable"** only when a connectivity anchor (`lwgateway`) exists AND its corrected `d.online` is `true`.
- **Assert "site unreachable"** (fire the existing wall-unit outcome) only when a connectivity anchor exists AND its corrected `d.online` is `false`. Because `d.online` is now freshness-authoritative with the anti-flicker debounce behind it, an offline anchor is a high-assurance "dead", not the old flapping `active` flag.
- **Stay silent at site level and defer to per-device liveness** when there is no connectivity anchor (gateway-less site), or when the anchor's state cannot be trusted (missing/unreadable liveness — which OOHDASH-85 already resolves to offline, but if a future signal made even that uncertain, the correct behaviour is silence, never a low-confidence claim).
- **Default is silence over a low-confidence claim.** G2 never manufactures a whole-site verdict it cannot stand behind.

Equipment-group gateways feed only group-level reachability inside the relevant flow; they never move the site-level assertion.

---

## What G2 removes / replaces vs E (consistency check)

E already removed the always-on "Live device status" side card (`deviceBoard` in `views.js`), a one-time shared decision referenced by both E and G. **G2 confirms and does not reverse that removal.** G2 introduces no standing device-health surface, no reachability table, no per-device status list. The two decisions are consistent: there is exactly one removal of the standing surface (E), and G2 is purely outcome-only — a truthful site-reachability conclusion produced inside the connectivity Q&A, nothing more. Any temptation to render a "which gateways are up" grid is explicitly out of scope and contrary to the governing principle.

---

## UI / UX and layout design (the visual consequences of E + G1 + G2)

The behaviour above is settled; this section owns the visual and layout consequences so build does not have to improvise them. It is grounded in the actual CSS (`public/css/styles.css`) and the actual markup (`public/js/views.js` `renderWorkspace`, `public/js/flows.js` `renderFlow`).

### 1. Workspace layout after the shared side-card removal

**The fact on the ground.** The workspace is a two-column CSS grid, `.wsgrid` (`styles.css` line 92): `grid-template-columns: minmax(0,7fr) minmax(0,5fr); gap:12px; align-items:start`. The LEFT column (`views.js` lines 180-187) is the site-header card plus the Q&A flow (`flowHtml`). The RIGHT column (lines 188-193) is three `card tight` blocks stacked in DOM order: "Live device status" (`deviceBoard`, line 189), "What Lighthouse controls at this site" (scope list, lines 190-192), "Open tickets for this site" (line 193). The grid collapses to a single column at `max-width:1100px` and again at `max-width:900px` (lines 93 and 172).

**What removing "Live device status" actually does to the grid.** The columns are **fractional (7fr / 5fr), not fixed pixel widths**, and they are **top-aligned (`align-items:start`)** with each column sizing to its own content independently. This matters, and it makes the resolution simple:

- Removing the first `card tight` from the right column just makes the right column **shorter** — the two remaining cards (scope, tickets) move up and the column ends earlier. Nothing stretches to fill the gap, because grid tracks are sized by the 7fr/5fr ratio and row height comes from content, not from matching the other column.
- The **left flow column is completely unaffected** — its width is the 7fr track regardless of how tall the right column is, and `align-items:start` means it does not grow to match a now-shorter sidebar. There is **no dead space** created inside the grid; the only visible change is that the sidebar is shorter, which is the correct and expected outcome of removing a card.
- The 7fr / 5fr ratio already makes the **Q&A flow the primary focus** (58% vs 42% of the content width). That is exactly what the conversational-outcome principle wants, so it is kept.

**Recommended resolution (concrete build intent).**

- **Keep the `.wsgrid` `minmax(0,7fr) minmax(0,5fr)` grid exactly as-is.** Do NOT change the column ratio, do NOT widen the flow column, do NOT convert to a single column, do NOT add a spacer or a replacement panel to "balance" the sidebar. The shortened two-card sidebar sitting beside the primary flow column is the accepted, correct layout.
- **The only markup change is the deletion** of the `<div class="card tight"><h3>Live device status</h3>${deviceBoard(ws)}</div>` line (`views.js` line 189) — E's change, confirmed here, not re-opened. The two surviving `card tight` blocks keep their DOM order (scope, then tickets) and their existing `card tight` styling untouched.
- **No CSS change is required** for `.wsgrid`, `.card`, or `.card.tight`. The layout resolves correctly by construction because the grid is fractional and top-aligned. Build should confirm this by inspection, not by adding rules.

This is the load-bearing visual decision: the removal shortens the sidebar and leaves the primary flow column and the grid proportions intact — no rebalance work is needed or wanted.

### 2. Presentation of the new operator-facing lines (styling and placement)

There are two operator-facing lines this coordinated change introduces or reshapes: E's kitchen backend-assessment line ("The kitchen circuits are reachable.") and G2's site-reachability conclusion (reachable / unreachable / group-down / gateway-less). Both are the operator's ANSWER, so both must be styled and placed as the answer, not as a quiet tick in the step trail.

**Reuse the existing flow UI patterns — do not invent visual language.** `renderFlow` (`flows.js` line 175) renders each `doneLine` as a `.stepdone` row (a dashed, secondary, ✓-ticked completed-step trail — `styles.css` line 98) and then renders the handler's returned `body` beneath it. Conclusions in the codebase are already expressed as body-level `.alert` callouts coloured by severity:

- `.alert.ok` — green success callout (`styles.css` line 71), already used for the "everything online" connectivity outcome at `flows.js` line 615.
- `.alert.err` — red danger callout (line 69), already used for the connectivity "gateway offline / equipment offline" outcome at `flows.js` line 617 (carries `data-testid="connectivity-alert"`).
- `.alert.warn` — amber (line 68); `.alert.info` — neutral blue (line 70), used across the flows for informational, no-verdict states.
- Status pills exist as `.tag.green` / `.tag.red` with a `.dot` (lines 60, 62, 66), used inside `deviceBoard` today.

**Design decisions:**

- **The site-reachability conclusion is a body-level `.alert`, coloured by severity — NOT merely a `doneLine`.** The `doneLine` step-trail is kept as the quiet secondary record of what was checked ("Connection check: …"), but the conclusion the operator must act on is the loud callout in the body:
  - **Anchor online → site reachable → `.alert.ok`** (green). Reuse the existing all-good callout at `flows.js` line 615.
  - **Anchor offline → site unreachable → `.alert.err`** (red) with the existing verbatim wall-unit wording and `data-testid="connectivity-alert"` at `flows.js` line 617-618. Unchanged copy, unchanged severity — G2 only makes it fire on the correct anchor.
  - **Group gateway offline, anchor online → `.alert.warn`** (amber) inside the relevant per-equipment flow, carrying the verbatim group-offline copy already specified above. Amber, not red: the site is reachable, only a group is down — severity must not read as a whole-site outage.
  - **Gateway-less site → `.alert.info`** (neutral) carrying the verbatim "This site uses direct device connections — we'll check the equipment directly." line. Neutral, because no site verdict is being asserted — the colour must not imply reachable or unreachable.
- **Placement: conclusion first, then the next step.** The severity callout sits at the TOP of the returned `body`, directly above the deciding `.stepq` question and its `.chips` (the existing order in every flow handler — see the kitchen handler `flows.js` lines 494-497 and the connectivity handler lines 615-619). This lands the operator's eye on the conclusion, then on the single next action, exactly as the conversational-outcome principle requires.
- **E's kitchen assessment line.** E specifies "The kitchen circuits are reachable." emitted as a `doneLine` before the deciding question (E design lines 74, 122). That is retained as approved. Because it is only shown on the reachable happy path (the offline case diverts at `flows.js` line 489 before the line is composed), a quiet reachable `doneLine` above the deciding `.stepq` is appropriate — it is a low-stakes confirmation, not a high-stakes verdict, so it does not need the loud `.alert` treatment that the connectivity unreachable case gets. The severity ladder is deliberate: routine reachable = quiet trail line; high-stakes unreachable / group-down = loud coloured callout. No new class is introduced for either.

### 3. Readability outcome (Tony's T3 complaint)

**What was wrong.** Tony's original T3 feedback was that the kitchen "live read" was squished and hard to read on his device. The cause is visible in the code: `flows.js` line 488 concatenates every kitchen circuit into ONE `doneLine` joined with " · " separators, and line 493 renders a per-circuit `.zoneread` row (`styles.css` line 105 — a horizontal flex row with an icon, text and switch buttons) for each circuit. On a narrow operator viewport that concatenated strip and the stack of horizontal rows crowd the line and cause exactly the squished, hard-to-read result Tony reported.

**How the reshape fixes it.** E removes the concatenated "Live read:" `doneLine` (line 488), the entire per-circuit `.zoneread` `rows` block (line 493) and the accompanying info alert (line 495), replacing all of it with ONE short plain-English line before the deciding question. Removing the multi-item horizontal strip and the row stack removes the horizontal cramming that was the root cause. The operator now reads one short sentence and one question instead of a dense multi-circuit readout.

**Readability intent build must meet (explicit acceptance criteria):**

- The reshaped kitchen step and every reachability outcome must be **legible on the operator's actual out-of-hours viewport** (the device class the operator uses at 2am, not just a desktop browser).
- **No horizontal overflow** — content wraps cleanly; nothing forces a sideways scroll or clips at the viewport edge.
- **Comfortable line length and spacing** — the single assessment line and the `.stepq` question read as normal prose, not a cramped strip.
- The severity callouts (section 2) must also pass the same legibility bar on the operator viewport.

**This is a named test-scope item.** Readability cannot be asserted from code alone — it must be **visually verified with screenshots on the operator viewport at the build/test stage**. It is added to the end-to-end testing scope below as an explicit item.

### 4. Consistency and no regressions

- **Retained sidebar cards are unaffected.** The "What Lighthouse controls at this site" scope card (`views.js` lines 190-192, `.scopelist` styling `styles.css` line 166) and the "Open tickets for this site" card (line 193) keep their DOM order, their `card tight` styling and their content. G2 changes neither.
- **No standing device-health surface is reintroduced.** G2 adds no reachability table, no per-device status list, no "which gateways are up" grid — anywhere. The `deviceBoard` table (`views.js` lines 204-218) stays removed. The site-reachability conclusion exists ONLY as an in-flow `.alert` outcome, consistent with E and with the governing principle.
- **Two-column responsive behaviour still holds.** The `.wsgrid` single-column collapses at `max-width:1100px` and `max-width:900px` (`styles.css` lines 93, 172) are unchanged by removing a sidebar card; on a narrow viewport the surviving scope and tickets cards stack under the flow exactly as before, just with one fewer card in the stack.

---

## What build will change (files, functions, touch-points)

Cited against origin/main at d7c4330; line numbers may drift slightly, cite what is found at build time. Note tb-device.js line numbers drifted after OOHDASH-85.

- **`public/js/flows.js` connectivity handler (lines 606-637)** — the primary change. **Remove `ws.devices.find(d => d.kind === 'gateway')` (line 607) — that arbitrary find is the exact bug G2 exists to kill — and call `siteConnectivityAnchor(ws.devices)` instead.** The returned device (or `null`) is the anchor; the remaining gateway-kind devices are equipment-group gateways. Drive the summary line (line 611) and the reachable/unreachable branch (lines 614-620) from the anchor's corrected `d.online`. Add the gateway-less fallback (anchor `null`): make no site-level claim, show the verbatim gateway-less operator line, and defer to per-device liveness for the equipment the flow concerns. Add the group-gateway-offline outcome (anchor online, a group gateway offline): show the verbatim group-offline copy at group level while the site claim stays "reachable". Reuse the plain-English wall-unit alert and caller script (lines 617-618) and both outcomes (lines 622-636) unchanged for the anchor-offline path.
- **`services/tb-device.js`** — liveness is NOT touched. `deriveFreshnessOnline` (line 506), `applyFreshnessDebounce` (line 528) and the `online:` assignment (lines 585-587) stay exactly as shipped in v1.3.1. **Add the MANDATORY pure read-only helper `siteConnectivityAnchor(devices) -> device | null`** (exact rule specified above): segment-equality on the `lwgateway` token over `normaliseName`-split segments, `null` for 0 candidates, first-by-sorted-name for the pathological >1 case. It is pure read logic over the device name — no new liveness derivation, no mutation. It lives in `tb-device.js` (not inline in flows.js) so the rule is expressed once and unit-testable. The `ASSET_INTENT` gateway row (line 198) is NOT changed — it still types every gateway `kind:gateway`; the anchor distinction is made by name in the helper, not by kind.
- **`public/js/views.js`** — no NEW change beyond E's confirmed side-card deletion. The "Live device status" `card tight` block (line 189) is removed by E; G2 confirms and does not reverse it, and reintroduces no standing surface. No `.wsgrid` / `.card` CSS change is needed (see the UI/UX section): the fractional 7fr/5fr, top-aligned grid resolves the removal correctly by shortening the sidebar while the flow column keeps its width. The two surviving `card tight` blocks (scope, tickets) keep their DOM order and styling.
- **`public/css/styles.css`** — no change. All outcome styling reuses existing components: `.alert.ok/.err/.warn/.info` for the severity callouts, `.stepdone` for the quiet step-trail, `.stepq`/`.chips`/`.chip` for the deciding question, and the unchanged `.wsgrid` / `.card` / `.card.tight` grid. No new class is introduced.

No new fields and no new entities. The change is a corrected selection rule plus a fallback, both consuming existing fields (`d.kind`, `d.online`, device name). No data-dictionary change is required.

---

## Accepted assumptions (recorded bets)

- **The lwgateway is the sole site-connectivity path (ACCEPTED BET).** Every remote command reaches the site through the `lwgateway` (the LoRaWAN hub); therefore the lwgateway alone governs the site-reachable claim. This is drawn from existing `tb-device.js` / `flows.js` code commentary (the wall-unit "no remote command can reach the site while it's down" wording at flows.js line 617) AND the 2026-09-24 read-only estate sweep of 6 sites (5198, 6770, 6261, 4631, 6886, 6748) in the `gk-<site>-*` namespace. It is NOT verified against every possible estate architecture — only against those swept sites. **Re-examination trigger:** re-validate this bet before deploy if new site types or connectivity architectures are commissioned (e.g. a site with two LoRaWAN hubs, or a non-LoRaWAN primary path). Recorded here so it is not re-litigated at build time, but flagged for pre-deploy re-check.

## Open items

- **Optional forward-looking note for Jonathan Wilkinson (NOT a blocker).** If a future Salus hub is named WITHOUT any gateway token, the classifier (`ASSET_INTENT`) would type it as heating and G2 would not recognise it as a connectivity anchor or an equipment-group gateway. Every gateway in the current estate is caught, so this is a watch-item to confirm with JW when new Salus hubs are commissioned, not a change needed now.
- No other external input is required. Both former blockers (OOHDASH-85 settled; gateway meaning verified) are cleared. No blockers are invented here.

---

## End-to-end testing scope (hand to the test stage)

The design must be verifiable post-build against these scenarios:

- **Multi-gateway site, anchor online → site reachable.** A site with `lwgateway` online plus one or more equipment-group gateways (mix of online and offline): the connectivity flow asserts the site is reachable; an offline equipment-group gateway does not flip the site-level claim to unreachable.
- **Multi-gateway site, anchor offline → site unreachable.** The `lwgateway` offline (regardless of the equipment-group gateways' states): the flow fires the existing plain-English wall-unit alert and caller script (lines 617-618) and both existing outcomes ("It's back online" restored capture; "Still dead" escalation capture) unchanged.
- **Multi-gateway selection is not arbitrary.** With several gateway-kind devices present, the site claim tracks the `lwgateway` anchor specifically, not whichever device the array happens to yield first — verified by constructing a site where the anchor and an equipment-group gateway disagree on state.
- **`siteConnectivityAnchor` selection is exact.** Unit-test the helper directly: given a device set with `lwgateway`, `boiler-r10a`, `maindb-r10a` and `salusit700-gateway`, it returns exactly the `lwgateway` device and none of the others (segment-equality, not substring). Given no `lwgateway` device it returns `null`. Given two `lwgateway`-segment devices it returns the first by sorted normalised name deterministically.
- **Group-gateway offline, anchor online → group flagged, site stays reachable.** A site with `lwgateway` online and (e.g.) `boiler-r10a` offline: the site claim is "reachable" AND the heating/connectivity flow surfaces the boiler group as unreachable with the verbatim group-offline copy. Assert the offline group gateway is never silently invisible and never flips the site to unreachable.
- **Gateway-less site (5198) → no false site claim, correct copy.** A site with no gateway-kind device (only thermostats): the flow makes NO whole-site reachable/unreachable claim, shows the verbatim gateway-less operator line ("This site uses direct device connections — we'll check the equipment directly."), and correctly falls back to per-device liveness for the equipment in question. Assert the operator never sees a false "site reachable" or "site unreachable" chip.
- **Assurance gating.** Anchor with trustworthy `d.online` asserts; no anchor stays silent at site level and defers. Default-to-silence holds when the anchor state is not high-assurance.
- **Consistency with E.** Confirm G2 introduces no standing device-health surface — the "Live device status" card stays removed, and no reachability table or per-device status list appears anywhere.
- **Outcome styling and placement.** Confirm each reachability outcome renders as the correct severity `.alert` in the flow body ABOVE the deciding question: reachable = `.alert.ok` (green), unreachable = `.alert.err` (red, existing wall-unit copy), group-down = `.alert.warn` (amber), gateway-less = `.alert.info` (neutral). Confirm the loud conclusion, not a quiet step-trail line, is what the operator's eye lands on first.
- **Workspace layout after removal (visual).** Confirm the right sidebar now shows exactly two cards (scope, tickets), the left flow column keeps its width, the 7fr/5fr grid proportions are unchanged, and there is no dead space or stretched card where "Live device status" was. Confirm no replacement or spacer panel was added.
- **Readability on the operator viewport (screenshot-verified — Tony T3).** On the operator's actual out-of-hours viewport, capture screenshots of the reshaped kitchen step and the reachability outcomes. Assert: the single kitchen assessment line and deciding question read as clean prose with no squished multi-circuit strip; no horizontal overflow or clipping; comfortable line length and spacing; the severity callouts are legible. This item MUST be verified visually with screenshots, not by code inspection alone.

Realistic test data: a multi-gateway site (e.g. 6770-shaped: `lwgateway` + `boiler-r10a` + `maindb-r10a` + `salusit700-gateway-1`) run in both anchor-online and anchor-offline states; a gateway-less site (5198-shaped: five `salusit500` thermostats, no gateway); and a site where an equipment-group gateway is offline while the anchor is online.

---

## How the CX criteria are realised

- **Persona (out-of-hours operator, night, time pressure, locked script, stressed caller):** the operator gets one truthful whole-site answer to "can we even reach this site?" — computed from the one device that actually is the site's connectivity — instead of an arbitrary device's state that may send them down the wrong path.
- **Reassurance moment (connectivity — high stakes):** the wall-unit explanation and caller script (lines 617-618) are preserved and now fire on the correct signal, so the assurance the operator gives the caller is grounded in the right device.
- **Friction moment (routine):** no new surface, no new decision — the conclusion appears only as an outcome of the connectivity flow, and gateway-less sites are handled silently at site level rather than with a spurious verdict.
- **"Great looks like":** the dashboard never asserts a whole-site reachability claim it cannot stand behind; at a gateway-less site it says so plainly and uses the equipment's own liveness, exactly the high-assurance-or-silence behaviour the governing principle demands.
