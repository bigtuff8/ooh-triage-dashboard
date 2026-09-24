<!-- gate:contract
SECTION: Purpose — This page is a TRIAGE, not a fix-everything plan. Nine pieces of field feedback from Tony and CJ have been sorted into "real defect", "preference / UX choice" and "definition or unknown we can't answer yet". For each one you get options and a suggested disposition — but no build is implied. This page IS the decision point.
SECTION: What already shipped — v1.3.0 (OOHDASH-82) already fixed some of this feedback: the false gateway chips, the plain-English device labels, and removing broken aircon control. Reading this first stops us re-scoping work that is already done.
SECTION: The nine items triaged — Each item says whether it is a defect, a preference or an unknown; how confident we are and on what evidence; the options on the table; and what it NEEDS to move (tester clarification, a Sam/Jonathan decode, a ThingsBoard expert, a live check, or a design decision). Item A (false-offline) is the worked example with live evidence from site 6770.
SECTION: Questions back to CJ and Tony — The concrete questions the testers need to answer before some items can move, above all: agree what "offline" actually means.
SECTION: Needs external confirmation — Things James cannot decide alone and neither can the testers: grouped by who owns the answer (Sam Day / Jonathan Wilkinson, or an IoT / ThingsBoard expert).
SECTION: Recommended priority and your disposition menu — A suggested order and, per item, one of PROCEED / SEND BACK / PARK / NEEDS-INFO. Recommendations only — the call is yours at this gate.
DECISION: Per item, choose one — PROCEED to design / SEND BACK to testers / PARK (later phase) / NEEDS-INFO (blocked on external confirmation).
-->

# OOH Field-Feedback Discovery — Epic OOHDASH-84

Discovery artefact · 2026-09-24 · triage / decision-support

## 1. Purpose and scope

This artefact triages the field feedback captured from Tony Willetts and Csaba Jakab (CJ) against the live OOH Triage Dashboard. It is a **decision-support document, not a build plan**. Nothing here commits any code change.

The triage lens is deliberate. Field feedback is a mix of three different things, and treating them all as "bugs to fix" would be wrong:

- **DEFECT** — a factual or technical error where the product does the wrong thing and code or live evidence proves it.
- **PREFERENCE** — a legitimate UX or design choice where there is no single correct answer, only a decision to be made.
- **DEFINITION / UNKNOWN** — a term or behaviour that must first be *agreed* or *decoded* before anyone can say whether it is a defect. The canonical example: "offline" is a definition to be agreed with the field and with IoT, not a threshold to be silently coded.

Many items are a mix, and where they are, this document says so. For each of the nine children it gives: a classification, a confidence level with its evidence, a set of options (never a single foregone fix), and a **NEEDS** tag naming what must happen for the item to move.

Two sections are first-class deliverables in their own right: the **Questions back to CJ and Tony** (Section 4) and the **Needs external confirmation** register (Section 5). The gate (Section 6) is where James decides, per item, what happens next. No build is implied by anything below.

A standing caution runs through this document: James is not a ThingsBoard (TB) expert and cannot personally confirm claims about TB behaviour. Therefore **no assertion about TB behaviour is made here without either live evidence gathered read-only, or code evidence from this repo** — and anything resting on TB behaviour we could not verify is explicitly flagged "needs TB-expert confirmation".

## 2. What v1.3.0 (OOHDASH-82) already shipped that touches this feedback

Before triaging, note what is already done, so nothing below gets re-scoped:

- **False gateway *chips* fixed.** The OOHDASH-82 asset-intent reorder corrected the mis-classification that surfaced spurious "gateway" chips. Evidence: the ordered `ASSET_INTENT` table in `services/tb-device.js:170-180`. This addressed the *classification* half of item G — it did **not** address the *offline-accuracy* half (see G below).
- **Plain-English asset-type labels.** Devices now carry human labels such as "Salus iT700", "Salus thermostat", "Intesis AC", "Kitchen circuit", "Lighthouse gateway" (`ASSET_INTENT` labels, same lines). This is the foundation the naming feedback (item B) wants to build further on.
- **Heating collapsed to two areas.** `deriveArea()` (`services/tb-device.js:400-409`) now returns only `Accommodation` or `Bar/Restaurant` (or null). This is the shipped two-area model that item B's granular-labelling request is in tension with.
- **Aircon control removed.** Aircon is no longer controllable — correct, per the earlier CTO steer. But no *read* view was added in its place, which is exactly what item I now raises.

## 3. Per-child triage

### A — OOHDASH-85 · False-offline / live-status accuracy — DEFECT + DEFINITION (worked example)

**Classification.** A genuine DEFECT wrapped around a DEFINITION that must be agreed. This is the loudest complaint from both testers.

**Confidence: high — code-confirmed and live-evidenced.**

The defect, in code: `services/tb-device.js:549-551` fetches `active,lastActivityTime` from SERVER_SCOPE, but only `active` is consumed (`bag.__active = parseActive(...)` at line 564); `lastActivityTime` is read and thrown away. The device's `online` field is then a raw passthrough of TB's `active` flag with **no freshness check at all** (`online: raw.isOnline ?? raw.active ?? false`, `services/tb-device.js:485`). So a device TB still marks `active=true` shows online even if it last spoke weeks ago, and — the direction the field actually hit — a device that reported minutes ago but carries `active=false` shows offline.

The live worked example (site 6770, read-only, 2026-09-24):

- 41 devices total; 30 carry `active=true`, 11 carry `active=false`.
- Of the 11 shown "offline", **4 are demonstrably live** — `gk-6770-roof-1`, `gk-6770-roof-2`, `gk-6770-roof-3`, and a raw-ID device `70B3D5E75F200626` — each reported within the last hour yet carries `active=false`.
- 1 is borderline — `gk-6770-salusit700-gateway-1`, last seen roughly 3.6 days ago.
- 6 are genuinely offline: `gk-6770-extractfan-1` (~113 days, a CJ-named device), `gk-6770-externallighting-1` (~81 days, CJ-named, matching CJ's reported date), `gk-6770-salusit700-1` (~74 days), `gk-6770-lwgateway` (~63 days), plus `gk-6770-GasAMR-1` and `gk-6770-ElecAMR-1` which have never reported.

So roughly 36-45% of the devices shown "offline" at this one site are **false offline**. No `active=true`-but-stale devices were exhibited here right now, so the false-*online* direction is not demonstrated at this site (it remains latently possible given the passthrough).

A clean gap exists in the live data: the live estate is all within ~3.6 days; the dead estate is all ~63 days or older. A freshness threshold anywhere in roughly the 24-48h band cleanly separates CJ's genuinely-dead devices from the live ones. Never-reported devices (missing `lastActivityTime`) should be treated as offline.

**The DEFINITION caveat — stated plainly.** The exact freshness threshold is a *tuning decision*, not a number to pick quietly. Different device types report at different cadences (a thermostat, a metering unit, and a gateway do not "check in" on the same clock), so the threshold should be validated against each device type's expected reporting cadence before it is locked. That is an IoT / TB-expert input, not a developer's guess.

**Options.**

- Option A1 — derive `online` from `lastActivityTime` freshness with a single global threshold (e.g. in the 24-48h band), never-reported treated as offline. Simplest; risks mis-flagging a slow-cadence device type.
- Option A2 — per-device-type freshness thresholds, sourced from IoT-confirmed cadences. More accurate; blocked on the cadence data.
- Option A3 — show *both* signals: keep TB `active` but add a "last seen N ago" line so the operator judges. Lowest technical risk; pushes the judgement to the human.

**NEEDS:** design-decision (which option) + tester-clarify (agree the definition of "offline") + TB-expert-or-IoT (per-type reporting cadences to set the threshold). This item is the most contained high-value fix, but its threshold must not be chosen without the cadence input.

### G — OOHDASH-91 · "Lighthouse gateway" meaning + check semantics — DEFINITION / UNKNOWN + partial-done

**Classification.** Mostly DEFINITION / UNKNOWN, with one half already shipped and the other half sharing item A's root cause.

**Confidence: medium.** The classification half is code-confirmed done (the OOHDASH-82 chip fix, `ASSET_INTENT` reorder). The offline-accuracy half is code-confirmed to be the *same* passthrough defect as A. What "lighthouse gateway" actually means, versus the device named `lwgateway`, and what is actually being checked, is genuinely unknown from code alone.

**Live nuance that must not be lost:** at site 6770 the device `gk-6770-lwgateway` is **genuinely offline** (~63 days silent). So some "gateway offline" reports from the field are TRUE, not false. This is why G cannot be dismissed as "already fixed" — the false-*chip* problem is fixed, but a real gateway-offline signal exists and rides on the same A-defect.

**Options.**

- Option G1 — fold the offline-accuracy half straight into item A's fix; treat lwgateway like any other device for freshness.
- Option G2 — additionally define, with Sam/JW, what "lighthouse gateway" is as an asset class and what a "gateway check" should verify (is it presence only, or does it gate the devices behind it?).

**NEEDS:** Sam-JW-decode (what `lwgateway` / "lighthouse gateway" is and what should be checked) + the A fix for the offline half.

### B — OOHDASH-86 · Human device and area naming — PREFERENCE + design-tension + UNKNOWN

**Classification.** Primarily PREFERENCE, in genuine tension with the shipped two-area model, with an UNKNOWN embedded (site-code decoding).

**Confidence: medium.** What CJ wants is clear from the feedback; whether it fits inside or supersedes the shipped model is a design decision; the site codes are undecodable from code.

CJ wants **more granular per-zone labels** — for example flat 1, restaurant 1 (heard as hot-water plus zone 1), restaurant 2 (zone 2), thermostat 1, gateway 1. Today the instance suffix that would carry that (the `-f1` / `-r1` style tail) is parsed down to a single class letter and the instance number discarded: `parseSiteCodeLetter()` (`services/tb-device.js:383-387`) matches `^\(?\s*\d+\s*-\s*([sfrb])\s*-` and returns only `s`/`f`/`r`/`b`; `deriveArea()` (`:400-409`) then maps that one letter to one of the two areas. The zone-level identity CJ is asking for is thrown away in that step.

**The design tension — do not resolve it here.** Does granular labelling live *inside* the two-area model (area stays the grouping, zone becomes the leaf under it) or does it *supersede* the two-area collapse that OOHDASH-82 just shipped? That is a design decision, and it interacts directly with the naming feedback already logged as being in tension with the shipped model.

**The UNKNOWN.** Site codes such as "s1" and "STA" are **not decodable from code** — the parser only knows the four class letters, and what "STA" or a bare "s1" maps to in the real estate is not knowable without Sam/JW.

**Options.**

- Option B1 — keep two areas as grouping, add a zone leaf label parsed from the instance suffix (area = grouping, zone = leaf).
- Option B2 — replace the two-area collapse with the granular per-zone naming CJ describes.
- Option B3 — do nothing to the model; only improve the label strings within the current structure.

**NEEDS:** design-decision (B1 vs B2 vs B3, resolving the tension) + Sam-JW-decode (what s1 / STA / the site codes actually mean). Present as options; do not pick.

### C — OOHDASH-87 · Heating / hot-water controllability via R1 — DEFINITION / UNKNOWN, possibly NOT-a-defect

**Classification.** DEFINITION / UNKNOWN. May well be correct-as-designed rather than a defect.

**Confidence: medium-high on the code fact; the "should it?" is a human question.**

Code confirms CJ's own guess: hot water is only controllable if a device carries the `hwboost` capability (`public/js/flows.js:445`, a `find` over the workspace devices for one whose capabilities include `hwboost`). The comment at `:439-444` states live bridge data never emits this, so hot water deliberately defaults to "not controllable — capture and escalate". The flow already renders a plain-English "hot water is not controllable from here" message. This is **by design**, and it flips on automatically if inventory ever carries a boostable DHW device (no code change needed).

**The real question is for humans, not code:** *should* DHW be controllable via R1 (which would need the bridge to expose the capability), or is the current "not controllable, here's why" behaviour correct and only in need of a clearer explanation on the call? This turns on what R1's role actually is, which is a TB/IoT matter.

**Options.**

- Option C1 — accept as-designed; improve the explanatory copy only (a PREFERENCE-sized change, if any).
- Option C2 — pursue making DHW controllable, which requires the bridge to expose a boost capability — a dependency outside this repo.

**NEEDS:** TB-expert-or-IoT (confirm R1's role and whether DHW-via-R1 control is even intended) + tester-clarify (is the ask "let me control it" or "explain why I can't better").

### I — OOHDASH-93 · AC-unit info, READ-ONLY — PREFERENCE / enhancement

**Classification.** PREFERENCE / enhancement. More relevant now that control was removed.

**Confidence: high on the gap; open on what read is useful.**

OOHDASH-82 correctly removed aircon *control* but added no *read*. Confirmed: `public/js/views.js` has read branches for `heating` (lines 211-213), `hotwater` (214) and `kitchen` (215), but **no aircon/intesis branch** — an aircon device therefore falls through to a blank read ("—") in the device board.

**Options.**

- Option I1 — add a minimal read (online + temperature).
- Option I2 — add a fuller read (temperature, setpoint, mode, online).
- Option I3 — leave blank (accept the gap).

Which is right depends on what Intesis telemetry actually exists, which must be checked live.

**NEEDS:** tester-clarify (what AC info actually helps on a call) + live-check (what Intesis telemetry is genuinely present).

### D — OOHDASH-88 · Extract + Supply fans for gas isolator — DEFECT + EXTERNAL BLOCKER

**Classification.** DEFECT in the code, but gated by an EXTERNAL BLOCKER that may make it moot.

**Confidence: high on the code gaps; blocked on inventory topology.**

Code gaps confirmed: the fan flow uses a single `ws.devices.find(d => d.kind === 'fan')` (`public/js/flows.js:554`) — it can only ever find *one* fan; the `ASSET_INTENT` fan row carries only `extractfan`/`fan`/`extractor` tokens with **no 'supply' token** (`services/tb-device.js:179`); and there is **no gas-isolator pairing logic** anywhere. So extract-plus-supply-for-gas-isolator simply is not modelled.

**But — the external blocker.** CJ notes the FHI extract and supply fans are on a *separate Tuya account* and have been offline since roughly April, so they may not even be in this TB tenant. Building pairing logic for devices that are not in the tenant would be wasted work.

**Options.**

- Option D1 — confirm the account/inventory topology first; only then decide whether to model supply fans and gas-isolator pairing.
- Option D2 — park until the FHI account situation is resolved.

**NEEDS:** Sam-JW-decode / IoT (confirm the FHI separate-Tuya-account situation and whether these devices are in this tenant at all) — this must be answered *before* any build.

### E — OOHDASH-89 · Kitchen flow + per-device selection ("fryer 2") — PREFERENCE / UX

**Classification.** PREFERENCE / UX. Overlaps item F.

**Confidence: high on current behaviour.**

Today the kitchen flow lists all kitchen circuits with per-circuit switches (`public/js/flows.js:483-497`) but has no "pick fryer 2 and run checks on just it" selection step. That is a design choice about flow shape, not a defect.

**Options.**

- Option E1 — add a per-device selection step ahead of the checks.
- Option E2 — keep the list-all view; improve labelling so individual circuits are easier to spot.

**NEEDS:** design-decision (flow shape) — coordinate with F.

### F — OOHDASH-90 · Device-list UX (search, "ON until XX", exclude DBS/AMR, compaction) — MIXED preference + data-gap

**Classification.** MIXED. Two quick UX wins plus two items blocked on data not in the model.

**Confidence: high on each sub-part.**

- Search is site-only today, not a device filter — a UX gap, quick to close.
- "ON until XX" is **inert**: `schedule` is hardcoded `null` at device build (`services/tb-device.js:487`) and nothing populates it — the kitchen and fan flows even print "schedule unknown"/omit it because of this. Showing a real "on until" needs schedule data that is not in the model.
- No DBS/AMR exclusion exists; the 6770 AMR meters (`gk-6770-GasAMR-1`, `gk-6770-ElecAMR-1`) that never report illustrate the noise this creates.
- The list is flat with no compaction — a UX choice.

So: search and compaction are quick UX; schedule and metering-exclude are **blocked on data not in the model**.

**Options.**

- Option F1 — ship the two UX wins now (device search, list compaction), independent of the data gaps.
- Option F2 — pursue "on until" and DBS/AMR exclusion, both of which need data/identification sources from IoT.

**NEEDS:** design-decision (search + compaction) + TB-expert-or-IoT (where schedule data lives; how metering/DBS/AMR devices are reliably identified).

### H — OOHDASH-92 · On-call visual aids (email-a-photo, how-to videos) — NEW CAPABILITY + content decision

**Classification.** NEW CAPABILITY. No such feature exists; this is not a fix.

**Confidence: high — confirmed absent.**

There is no email-a-photo or how-to-video feature in the product today. Beyond the build, this needs a **content owner**: who records and hosts the videos, and where photos are sent/stored. Likely a later phase.

**Options.**

- Option H1 — scope as a distinct later-phase capability with a named content owner.
- Option H2 — park until the higher-value legibility and accuracy items land.

**NEEDS:** design-decision + a content owner (who produces and hosts the material).

## 4. Questions back to CJ and Tony

These are the concrete clarification and shared-definition questions that unblock the items above. They deduplicate overlapping feedback and pin down terms.

- **Agree the definition of "offline" (item A/G).** What does "offline" mean to you on a call — never reported, or not reported *recently*? If recently, how stale is too stale for the kinds of devices you deal with? (We have live evidence that a 24-48h freshness line cleanly separates the genuinely-dead devices from the live ones at site 6770 — we want your view before anyone locks a number.)
- **Which exact zone labels do you want (item B)?** Please confirm the exact wording — e.g. "flat 1", "restaurant 1", "restaurant 2", "thermostat 1", "gateway 1" — and whether these sit *under* the Accommodation / Bar-Restaurant grouping or *replace* it.
- **Confirm the FHI extract/supply fan situation (item D).** Are the FHI extract and supply fans on a separate Tuya account, and have they been offline since around April? Should we expect them to come back into this system at all?
- **Hot water via R1 (item C).** When you say hot water should be controllable — do you mean you want to *control* it from the dashboard, or do you mean the "you can't control it from here" message should explain *why* more clearly?
- **What AC info would actually help on a call (item I)?** With control removed, what read-only information about an aircon unit would you want to see — just online/offline, or temperature, setpoint and mode too?
- **Kitchen per-device selection (item E).** When you say "fryer 2", do you want to pick a single circuit and run checks on just that one, or is the issue that the circuits are hard to tell apart in the current list?
- **Device-list pain points (item F).** Which matters most — searching within a site's device list, hiding the metering (AMR/DBS) devices that never report, showing "on until", or a more compact list? Ranking these helps us sequence.

## 5. Needs external confirmation

Grouped by who owns the answer. James cannot decide these alone, and neither can the testers.

**Sam Day / Jonathan Wilkinson (business/estate knowledge):**

- Decode the site codes "s1", "STA" and the general site-code scheme (item B) — the code only knows the class letters s/f/r/b; the real-world mapping is not derivable here.
- Define what "lighthouse gateway" / the `lwgateway` device is as an asset, and what a "gateway check" should actually verify (item G).
- Confirm R1's role in DHW (item C) — is hot-water control via R1 intended at all, or is boiler-side/capture-and-escalate the correct model?
- Confirm the FHI separate-Tuya-account and inventory situation (item D) — jointly with IoT.

**IoT / TB-expert (technical/telemetry knowledge — nothing here may be asserted without this):**

- Per-device-type reporting cadences (item A) — needed to set the offline freshness threshold safely; a global number chosen without this risks mis-flagging slow-cadence device types.
- Where schedule data lives (item F) — the model's `schedule` is hardcoded null; "on until" cannot be shown until a real source is identified.
- How metering devices (AMR/DBS) are reliably identified (item F) — needed to exclude them from the noise.
- What Intesis telemetry is actually available (item I) — determines what an aircon read can show.
- FHI account topology (item D) — whether the FHI fans are in this TB tenant at all — jointly with Sam/JW.

## 6. Recommended priority and per-item disposition menu

Recommendations only. The disposition of each item is **James's call at this gate**. For each child, choose one of: **PROCEED** to design / **SEND BACK** to testers for clarification / **PARK** (later phase) / **NEEDS-INFO** (blocked on external confirmation).

**Suggested priority order and rationale:**

1. **A (false-offline) — highest and most contained.** Loudest complaint, code-confirmed defect, live-evidenced, and self-contained. The one caveat is the threshold must be set with IoT cadence input, so it is a PROCEED-once-the-definition-is-agreed rather than a blind build. The offline half of **G** rides on the same fix.
2. **The B / C / I "legibility" cluster.** High field value (naming, hot-water explanation, aircon read), but gated on the naming design-tension (B) and the Sam/JW decodes (B, C). Sequence after A.
3. **E / F UX.** Genuine improvements; the quick wins in F (search, compaction) and the E flow shape can move on a design decision; the data-dependent parts of F wait on IoT.
4. **D and H.** External-dependency-blocked (D on the FHI account topology; H on a content owner). Likely a later phase.

**Suggested disposition menu (recommendations — decide per item at the gate):**

- **A (OOHDASH-85):** suggested PROCEED to design, conditional on agreeing the offline definition and getting IoT cadence input.
- **G (OOHDASH-91):** suggested NEEDS-INFO (Sam/JW define lwgateway) for the definition half; the offline half folds into A.
- **B (OOHDASH-86):** suggested SEND BACK (exact labels) + NEEDS-INFO (Sam/JW decode) before any design decision.
- **C (OOHDASH-87):** suggested SEND BACK (control vs explanation) + NEEDS-INFO (R1's role).
- **I (OOHDASH-93):** suggested SEND BACK (what AC info helps) + live-check (Intesis telemetry).
- **D (OOHDASH-88):** suggested NEEDS-INFO (FHI account topology) — do not build first.
- **E (OOHDASH-89):** suggested design-decision (PROCEED or PARK), coordinate with F.
- **F (OOHDASH-90):** suggested split — PROCEED on search + compaction; NEEDS-INFO on schedule + metering-exclude.
- **H (OOHDASH-92):** suggested PARK (later phase) pending a content owner.

No build is implied by this artefact. This gate is the decision point.
