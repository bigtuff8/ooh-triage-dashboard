<!-- gate:contract
SECTION: Purpose. OOHDASH-85 is about the dashboard calling live devices "offline" when they are not. This section says why we are looking and what we deliberately left out of scope.
SECTION: What is wrong and why. Plain-English explanation of the bug in the code: the dashboard trusts one ThingsBoard flag that is not a truthful sign of life, and throws away the timestamp that would tell the truth.
SECTION: What the live evidence shows. We read five real sites tonight, read-only. This section says what we found: roughly a third to two-fifths of "offline" devices are actually alive, the false alarms cluster on the same device kinds, and crucially we saw zero cases of the opposite error.
SECTION: How we should define offline. Three options, and the one we recommend, in plain English, with why the evidence points there.
SECTION: The flapping problem. Tony's "looks worse two minutes later" — what causes it and whether the fix removes it.
SECTION: How this should show up for the operator. The dashboard answers triage questions; it should not show a raw status light. This says where corrected liveness must be trusted and how it should surface.
SECTION: What we still need to confirm. The open questions, chiefly whether IoT can confirm how often each device type is meant to report.
SECTION: Recommendation. The one-line steer for the panel.
DECISION: Approve the recommended definition of offline (freshness-based, 48-hour threshold, active flag as a corroborating signal only) as the basis for the design stage, or ask for a different option.
-->

# OOHDASH-85 Discovery — False "offline" / live device-status accuracy

**Stage:** Discovery (read-only). **Date:** 2026-09-24. **Author:** Discovery doer.
**Ticket:** OOHDASH-85 (theme A — false "offline" / live device-status accuracy).
**Working copy:** C:\repos\ooh-triage-dashboard.

---

## Purpose and scope

The OOH Triage Dashboard is telling operators that live, currently-reporting devices are "offline". Field feedback from Tony Willetts flagged this, including the observation that the picture "looks worse two minutes later". This discovery frames the problem precisely, backs it with live multi-site evidence read tonight, lays out options for how the dashboard should define "offline", and reconciles the answer with the dashboard's governing conversational-outcome principle. The orchestrator raises the discovery gate; nothing here opens a PR or changes code, config or live state.

This work was carried out entirely read-only. Writes remain locked at deploy time (WRITES_DISABLED true, SMS provider in log mode). All ThingsBoard access was GET-only, authenticated by the live JWT login path; no control command of any kind was issued.

Scope boundary with theme G (OOHDASH-91). The liveness-accuracy mechanism this ticket produces is SHARED with the gateway-offline half of theme G. This discovery covers the shared liveness mechanism — how the dashboard decides whether any device (gateway included) is truly alive. It deliberately keeps out of scope the broader device-health user experience that theme G owns (device-health dashboards, per-device health history, health-trend surfacing); that work is downscoped and deferred, and must not be folded in here.

Relationship to prior work. This is NOT a recurrence of a prior fix that failed to hold. OOHDASH-80 fixed a genuinely different, earlier bug in which every device showed offline because online status was being read from a field that does not exist on the device-list call; OOHDASH-80 correctly moved the source to the per-device SERVER_SCOPE `active` boolean, and that fix is in effect (the sites read tonight return a healthy mix of active-true and active-false, not a blanket offline). OOHDASH-85 is the NEXT problem exposed once `active` became the source: the `active` boolean is not a truthful measure of liveness. So no "why did the prior fix not hold" section is required; the prior fix held and did its job. What OOHDASH-85 must not do is repeat the shape of that history by shipping another single-signal definition that is merged, marked Live, but never observed correcting a real false-offline device — the design and test stages must prove the new definition in effect against real devices, not merely merge it.

---

## Problem statement and root cause (code-evidenced)

The dashboard derives each device's `online` state from ThingsBoard's per-device SERVER_SCOPE `active` boolean, with no freshness check, and it silently discards the one field that would let it check freshness.

Concretely, in services/tb-device.js:

- The telemetry read requests BOTH `active` and `lastActivityTime` from SERVER_SCOPE (the read at approximately line 551 asks for the two keys together).
- Only `active` is consumed. `parseActive` (approximately lines 523 to 528) folds the `active` value to a boolean; `lastActivityTime` is fetched and then thrown away — it is never read out of the attribute bag.
- The `online` field is a raw passthrough of that boolean: `online` is set from `raw.isOnline` if present, otherwise `raw.active`, otherwise false (the mapping at approximately line 485, fed by the site assembly at approximately line 615). There is no comparison of `lastActivityTime` against the current time anywhere on this path.

The root cause is therefore that `active` is treated AS liveness when it is not liveness. In ThingsBoard, the per-device `active` flag reflects the device's connection/session state as the platform last computed it (it flips on an inactivity-timeout rule and on reconnect events); it can read false for a device that is in fact still delivering telemetry, and it can lag reality in both directions. The truthful signal for "is this device actually alive" is "when did it last report" — precisely the `lastActivityTime` the code already fetches and discards.

There is a second, front-end contributor. The workspace view re-polls every 30 seconds (public/js/views.js, the refresh timer at approximately lines 138 to 147). Because the underlying `active` boolean can flip between polls, the operator sees the offline picture change from one 30-second refresh to the next — the mechanism behind Tony's "looks worse two minutes later".

Anti-reinvention note. No new liveness service, store or pipeline is needed. The fix extends the EXISTING read path: the data (`lastActivityTime`) is already being fetched over the existing read-scoped session, and the existing `parseActive`/mapping seam is the single place where the derivation is made. This is a change to a derivation that already runs, not a new mechanism.

---

## Multi-site live evidence

Five live sites were read tonight (2026-09-24), read-only, via JWT auth against portal.lhlive.co.uk. For every device the SERVER_SCOPE `active` boolean and `lastActivityTime` were read by device UUID, and each device was classified into: active-true and recently reported (genuinely online); active-false but recently reported (FALSE-OFFLINE — the bug); active-true but stale (FALSE-ONLINE — the opposite error); active-false and genuinely stale (correctly offline); and never reported at all (no lastActivityTime). "Recently" here uses a 24-hour classification band for reporting purposes; the threshold decision is discussed separately below.

Per-site results:

- Site 6261 (23 devices): 18 genuinely online, 0 false-offline, 0 false-online, 3 genuinely dead, 2 never-reported. The three dead were a salus gateway (about 99 hours silent), a distribution board (about 1851 hours) and a kitchen board (about 1509 hours); the two never-reported were the electricity and gas AMR meters. This site happens to have no false-offline devices right now.
- Site 4631 (39 devices): 28 genuinely online, 4 FALSE-OFFLINE, 0 false-online, 4 genuinely dead, 3 never-reported. The four false-offline devices were roof units and a cellar sensor, all reporting within the last hour yet flagged active-false.
- Site 6886 (37 devices): 17 genuinely online, 5 FALSE-OFFLINE, 0 false-online, 12 genuinely dead, 3 never-reported. The false-offline set was again dominated by roof units plus a cellar sensor. This site also carries one of the CJ-named test devices (cjtest) among the never-reported.
- Site 6748 (32 devices): 19 genuinely online, 4 FALSE-OFFLINE, 0 false-online, 7 genuinely dead, 2 never-reported. False-offline were roof units and a salus gateway that had reported about 11 hours earlier.
- Site 6770 (from the earlier read, 41 devices): approximately 40 percent of the shown-offline set was demonstrably live (4 of the 11 shown offline had reported within the hour while active-false); the remainder were genuinely dead including the site gateway (about 63 days silent) and two AMR meters that never reported.

The cross-site pattern:

- False-offline generalises well beyond 6770. Four of the five sampled sites showed active-false-but-fresh devices; the one exception (6261) simply had none in that state at read time. Where false-offline occurs it is a material fraction of the "offline" list — at 4631, 6886 and 6748 the false-offline count is comparable to or larger than the genuinely-dead count once never-reported meters are set aside. Expressed against the shown-offline population (false-offline plus dead plus never-reported), false-offline runs from roughly a quarter to over a third at the affected sites, consistent with the ~40 percent seen at 6770.
- The false-offline devices are not random. They cluster hard on specific device kinds: roof units (the "roof" name-stem) appear as false-offline on every affected site, along with cellar sensors and, on two sites, salus gateways. This strongly suggests the `active` flag's inactivity-timeout is mis-tuned for the reporting cadence of those particular device types, rather than a site-wide fault.
- FALSE-ONLINE (active-true but stale) was ZERO across all five sites, including the large ones. Not a single device was seen reporting active-true while its last activity was stale. This is the single most decision-relevant finding: on the sampled estate, trusting freshness does not create a false-online risk, because `active` is not staying stuck true on dead devices.
- Never-reported devices are consistent and explainable: the electricity and gas AMR meters (elecamr, gasamr) appear as never-reported on essentially every site, plus the occasional test device (cjtest). These are correctly offline and should stay offline.
- Cadence spread is clean. Live devices reported very recently — the overwhelming majority within about 0 to 1 hour, with the single oldest "still-live" observation being a salus gateway at about 11 hours. Genuinely dead devices sat at 99 hours or more, running to thousands of hours. There is a large empty band between roughly 12 hours and roughly 99 hours in which NO device fell. In other words, across five sites of varying size and device mix, live and dead separate cleanly with a wide margin, and no observed device sat in the ambiguous middle.

---

## The "offline" definition — options and recommendation

Three concrete options were considered against the evidence above.

Option 1 — freshness-only. Define online as: the time since `lastActivityTime` is within a threshold T; ignore `active` entirely; treat a missing `lastActivityTime` as offline. Choosing T: both 24 hours and 48 hours cleanly separate live from dead in the sampled data, because nothing sat between about 12 hours and about 99 hours. 24 hours is tighter and catches a genuinely-gone device sooner; 48 hours is safer against a legitimately slow-reporting device type whose expected cadence has not yet been confirmed with IoT (see open questions). Against the sampled data this option produces zero false-online (there were none to reintroduce) and eliminates every observed false-offline, because every false-offline device had reported within the hour. Its only risk is a device type that legitimately reports less often than T; the ~11-hour salus gateway is the closest observed case and sits comfortably inside either threshold.

Option 2 — combine active AND fresh, or active OR fresh. The AND form (online only when active is true and fresh) would RETAIN every false-offline we observed, because those devices are fresh but active-false — so AND is refuted by the evidence. The OR form (online when active is true or fresh) fixes false-offline just as freshness-only does, and would additionally rescue any device that is active-true but momentarily missing a timestamp. Because no false-online cases exist in the data, the OR form's extra "active-true" arm carries little downside today — but it also carries little benefit, and it re-admits `active` (the untrustworthy signal) as a way to be called online, which is exactly the fragility this ticket exists to remove. OR is acceptable but strictly weaker than treating `active` as corroboration only.

Option 3 — per-device-type / cadence-aware threshold. Give each device type its own freshness threshold matched to its expected reporting cadence (for example a fast-reporting thermostat gets a short T, a meter or a gateway a longer one). The evidence shows device types DO cluster differently (roof units, gateways and meters behave distinctly from kitchen equipment), which is the argument for this option. However, the observed cadence spread among LIVE devices is not actually wide (almost everything live is within about an hour; the outlier is a single ~11-hour gateway), and the live-versus-dead gap is so large that a single threshold already separates them cleanly. Per-type thresholds would be the right answer only if IoT confirms that some device type legitimately reports on a cadence approaching or exceeding a single global threshold — which the data does not currently show. This option should be held as a documented fallback, adopted only if the cadence confirmation (below) contradicts the clean single-threshold picture.

Recommendation. Adopt a freshness-based definition with `active` demoted to a corroborating signal, not a source of truth. Concretely: derive online from "reported within T", treat missing `lastActivityTime` as offline, and set T at 48 hours as the initial value — 48 rather than 24 purely as a safety margin until IoT confirms the slowest legitimate per-type cadence, at which point T can be tightened. This is essentially Option 1 with a deliberately conservative T, keeping `active` available only to raise assurance (see the reconciliation section), never to override a stale timestamp into "online". Option 3 is the documented fallback if cadence confirmation shows a type that legitimately breaches a single threshold. This is a recommendation for the panel to weigh, not a unilateral decision.

---

## The poll-flap question

Tony's "looks worse two minutes later" is the 30-second workspace re-poll surfacing the flip-flop of the raw `active` boolean between polls. Deriving liveness from `lastActivityTime` rather than from raw `active` largely removes the flap by construction: `lastActivityTime` only ever moves forward and the live-versus-dead margin is wide, so the age-since-last-report does not oscillate across a threshold from one 30-second poll to the next the way the `active` boolean does. A device that is alive stays comfortably inside T on every poll; a device that is dead stays comfortably outside it.

A small residual risk remains for a device sitting exactly at the threshold boundary. To make the operator-facing answer robust rather than merely usually-stable, the design should add a light debounce for the offline assertion specifically: only assert offline when the device has been beyond T across a small number of consecutive reads (a poll or two), rather than on a single read. Given the observed margins this will rarely if ever engage, but it guarantees the operator never sees a device flicker between online and offline on consecutive refreshes. No last-seen "time ago" needs to be shown to the operator as a raw field (that would cut against the governing principle below); the debounce is internal.

---

## Reconciliation with the conversational-outcome principle

The dashboard is triage-question-led: the machine assesses device data in the BACKEND and surfaces conclusions as the OUTCOME of a question-and-answer flow. Static device detail — including a raw online/offline status pill the operator reads and interprets — is low-to-zero operator value and can distract. Corrected liveness must therefore be delivered as a trustworthy INPUT to the triage machine and surfaced only as a high-assurance conclusion, not as a status light.

Where liveness must be trustworthy:

- The connection-check flow — any triage step that concludes "this device is / is not reachable" or routes the operator based on reachability. This is the primary consumer and the place a false-offline does real harm (it sends the operator down a "device is dead" branch for a device that is actually fine).
- Any control-offer gate that suppresses or warns about control because a device appears unreachable. A false-offline here needlessly blocks or discourages a legitimate action.
- The shared gateway-liveness decision that theme G (OOHDASH-91) also consumes — the same derivation must serve the gateway-offline determination, so the mechanism must be correct for gateways, not only for kitchen equipment.

How it should surface: as the answer to the relevant triage question ("is the device reachable?" resolves to a confident yes/no with the reasoning held in the backend), not as a persistent raw pill the operator is left to read and second-guess. The operator should receive a conclusion they can act on, not a raw flag they have to interpret.

What "high assurance" should mean here: the dashboard should only assert OFFLINE when BOTH conditions hold — the device is stale beyond the threshold T, AND that staleness is consistent across the small debounce window (a poll or two), so a single flapping read can never drive an offline conclusion. The `active` boolean is retained purely as corroboration: when `active` is false but the device is fresh, freshness wins and the device is treated as online (the fix); `active` may be used to RAISE confidence in a genuinely-dead determination (stale AND active-false is a stronger dead signal than stale alone) but must never be allowed to turn a fresh device offline. High assurance is thus "stale, sustained, and unchallenged by a recent report", never "the platform's active flag said so".

---

## Open questions and needs

- IoT / ThingsBoard cadence confirmation (TAG: NEEDS-IOT). The single most important open question: what is the expected reporting cadence for each device TYPE, especially roof units, salus gateways and AMR meters? The data shows a clean single-threshold separation today, but the recommended 48-hour T and the decision to prefer a single threshold over per-type thresholds both rest on the assumption that no legitimate device type reports less often than 48 hours. This must be confirmed with IoT rather than guessed. If any type legitimately reports on a multi-day cadence, the design must switch to Option 3 (per-type thresholds) for that type. Owner: IoT (Sam Day / IoT team).
- Meaning of `active` from the platform's own rule (TAG: NEEDS-IOT, lower priority). Confirmation of the exact inactivity-timeout that drives the `active` flag on this tenant would explain WHY roof units and gateways are the recurring false-offline set, and would let us tune with knowledge rather than inference. Not a blocker for the recommended definition, which does not depend on `active` being correct.
- Never-reported devices as a category (TAG: OPEN, product). The AMR meters never report and are correctly offline, but they will always show offline; the design should decide whether "never-commissioned / never-reported" deserves a distinct triage treatment from "was alive, now dead", since the operator response differs. This is a small product decision, not a mechanism question.

---

## Risks

- Slow-cadence device type breaks a single threshold. Likelihood: low on current evidence (nothing live sat beyond ~11 hours). Impact: a legitimately-slow device would be called offline. Mitigation: the conservative 48-hour T plus the NEEDS-IOT cadence confirmation; fall back to per-type thresholds (Option 3) for any confirmed slow type.
- False-online appears on unsampled sites or seasonally. Likelihood: low but not provable from five sites — false-online was zero everywhere sampled, but that cannot guarantee it never occurs. Impact: if `active` ever sticks true on a dead device, a freshness-only rule still catches it (freshness would read stale and call it offline), so the recommended definition is actually MORE robust to this than the current code. Net risk is low and the recommendation reduces rather than increases it.
- Fix merged but never observed in effect. Likelihood: real, given the ticket lineage in this area. Impact: another "Live but not truly fixed" cycle. Mitigation: the test scope below must prove the corrected definition against REAL devices that are currently false-offline (roof units at 4631/6886/6748 are known present examples), not merely against fixtures — the fix must be observed flipping a real false-offline device to online.
- Debounce introduces latency in reporting a genuine outage. Likelihood: certain but tiny (one to two poll cycles, tens of seconds). Impact: negligible against a threshold measured in tens of hours. Mitigation: keep the debounce window to a poll or two.

---

## Proposed design-stage shape

The design stage would decide and specify:

- The exact online derivation: freshness-based with `active` as corroboration only, the chosen threshold T (initial 48 hours pending cadence confirmation), and the missing-timestamp-equals-offline rule — implemented at the single existing derivation seam in services/tb-device.js so `lastActivityTime` (already fetched) is consumed instead of discarded.
- The offline-assertion debounce (consistency across a poll or two before asserting offline) and where it lives relative to the 30-second workspace poll.
- How corrected liveness feeds the triage/connection-check flow as a high-assurance conclusion rather than a raw pill, including the shared consumption by theme G's gateway-offline determination.
- The data scope: the device entity's `active`, `lastActivityTime` and derived `online`, where each originates (SERVER_SCOPE, read-only) and how the derived value flows into the workspace and the triage flow.
- The end-to-end test scope: prove a known real false-offline device (a roof unit at an affected site) is now reported online; prove a genuinely dead device (a long-silent board or gateway) stays offline; prove a never-reported meter stays offline; prove no flicker across consecutive polls; and prove the corrected value drives the connection-check branch correctly. These must run against real device states, not only fixtures, so the fix is OBSERVED in effect and not merely merged.

The design must respect the theme G scope boundary: specify only the shared liveness mechanism, not device-health UX.

---

## Recommendation

Adopt a freshness-based definition of offline — online when the device reported within a threshold T (initially 48 hours, tightened once IoT confirms per-type cadence), missing timestamp equals offline, with ThingsBoard's `active` flag demoted to a corroborating signal that can strengthen a "dead" conclusion but can never turn a freshly-reporting device offline. Surface the result as a high-assurance triage outcome, not a raw status pill, and assert offline only when staleness is sustained across a poll or two. The live evidence supports this cleanly: false-offline is real and generalises, false-online was absent everywhere sampled, and live-versus-dead separate with a wide margin. The one thing to confirm before finalising the threshold is per-type reporting cadence with IoT.
