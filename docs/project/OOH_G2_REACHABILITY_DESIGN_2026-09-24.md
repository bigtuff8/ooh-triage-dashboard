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
DECISION: Approve this revised G2 design — the exact siteConnectivityAnchor segment-equality rule, the verbatim gateway-less and group-offline operator copy, the scoped-in group-gateway-offline build item, and the recorded lwgateway accepted bet — all consistent with E's side-card removal? | Yes, approve | Request changes
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

## What build will change (files, functions, touch-points)

Cited against origin/main at d7c4330; line numbers may drift slightly, cite what is found at build time. Note tb-device.js line numbers drifted after OOHDASH-85.

- **`public/js/flows.js` connectivity handler (lines 606-637)** — the primary change. **Remove `ws.devices.find(d => d.kind === 'gateway')` (line 607) — that arbitrary find is the exact bug G2 exists to kill — and call `siteConnectivityAnchor(ws.devices)` instead.** The returned device (or `null`) is the anchor; the remaining gateway-kind devices are equipment-group gateways. Drive the summary line (line 611) and the reachable/unreachable branch (lines 614-620) from the anchor's corrected `d.online`. Add the gateway-less fallback (anchor `null`): make no site-level claim, show the verbatim gateway-less operator line, and defer to per-device liveness for the equipment the flow concerns. Add the group-gateway-offline outcome (anchor online, a group gateway offline): show the verbatim group-offline copy at group level while the site claim stays "reachable". Reuse the plain-English wall-unit alert and caller script (lines 617-618) and both outcomes (lines 622-636) unchanged for the anchor-offline path.
- **`services/tb-device.js`** — liveness is NOT touched. `deriveFreshnessOnline` (line 506), `applyFreshnessDebounce` (line 528) and the `online:` assignment (lines 585-587) stay exactly as shipped in v1.3.1. **Add the MANDATORY pure read-only helper `siteConnectivityAnchor(devices) -> device | null`** (exact rule specified above): segment-equality on the `lwgateway` token over `normaliseName`-split segments, `null` for 0 candidates, first-by-sorted-name for the pathological >1 case. It is pure read logic over the device name — no new liveness derivation, no mutation. It lives in `tb-device.js` (not inline in flows.js) so the rule is expressed once and unit-testable. The `ASSET_INTENT` gateway row (line 198) is NOT changed — it still types every gateway `kind:gateway`; the anchor distinction is made by name in the helper, not by kind.
- **`public/js/views.js`** — no change. The side-card removal is E's; G2 does not reintroduce a standing surface, so there is nothing to add here.

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

Realistic test data: a multi-gateway site (e.g. 6770-shaped: `lwgateway` + `boiler-r10a` + `maindb-r10a` + `salusit700-gateway-1`) run in both anchor-online and anchor-offline states; a gateway-less site (5198-shaped: five `salusit500` thermostats, no gateway); and a site where an equipment-group gateway is offline while the anchor is online.

---

## How the CX criteria are realised

- **Persona (out-of-hours operator, night, time pressure, locked script, stressed caller):** the operator gets one truthful whole-site answer to "can we even reach this site?" — computed from the one device that actually is the site's connectivity — instead of an arbitrary device's state that may send them down the wrong path.
- **Reassurance moment (connectivity — high stakes):** the wall-unit explanation and caller script (lines 617-618) are preserved and now fire on the correct signal, so the assurance the operator gives the caller is grounded in the right device.
- **Friction moment (routine):** no new surface, no new decision — the conclusion appears only as an outcome of the connectivity flow, and gateway-less sites are handled silently at site level rather than with a spurious verdict.
- **"Great looks like":** the dashboard never asserts a whole-site reachability claim it cannot stand behind; at a gateway-less site it says so plainly and uses the equipment's own liveness, exactly the high-assurance-or-silence behaviour the governing principle demands.
