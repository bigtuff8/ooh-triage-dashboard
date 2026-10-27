<!-- gate:contract
SECTION: The bug — two paths, both miss P1
This is two linked gaps in the live-mode kitchen flow. PRIMARY GAP (what actually happened, PROVEN): In live mode, if any kitchen Tuya device has verdict 'offline', the flow immediately diverts to the connectivity flow (flows.js:1866-1868). The connectivity flow has no kitchen-specific P1 path. Kirsty's ticket #51205 (2026-10-27 20:39 UTC) confirms this: the OohCaptureClass is "connectivity" (subject "[OOH] ... Lighthouse gateway / equipment offline"). She added the kitchen emergency as a free-text note. P1 was never offered or raised. SECONDARY GAP (would be triggered if devices weren't offline): When devices are reachable but show Verdict C (relay OFF, schedule says off — the normal DST state), the flow presents the circuit as "expected off" and suggests the override first. The service-criticality question only surfaces after override failure. A working override exits as outcomeCaptured with no P1. Neither gap asks "Is this kitchen needed for service right now?" before the P1 path is lost.

SECTION: Proof — R1, R2, R3 all resolved in spike
R1 RESOLVED (PROVEN): data/tuya-sites.json line 142 — "gk-6819" entry exists. Site 6819 is Tuya-enabled. Live-mode path is confirmed. R2 RESOLVED (PROVEN): Zendesk ticket #51205 (2026-10-27 20:39 UTC, gk_6819). Subject "[OOH] 6819 Lutley Oak (Halesowen) - Lighthouse gateway / equipment offline". Transcript: "Equipment unreachable after on-site power/router checks. No remote action possible; needs IoT connectivity investigation." Kirsty's note: "All equipment has gone off and not on, due to the clock changing it goes off at 8:30pm now and needs to be 9:30pm, site still has food going out, can someone call ASAP contact number is 07961239552 - Kirsty". Tags: ooh, tcat_support_request — NO ooh_p1. Kitchen flow diverted to connectivity at stage 0 before any service-criticality check. R3 ACCEPTED: Moving crit to stage 0 will raise P1 for all Tuya kitchen calls where the caller confirms service is active AND any circuit is off or offline. This is the correct behaviour — it makes live-mode sites consistent with legacy mode intent. Volume impact is bounded (only Tuya-enabled sites, only OOH hours, only confirmed-active-service calls). Explicitly accepted.

SECTION: Proposed fix — one question, two outcomes
Ask service-criticality (crit) BEFORE the offline-device divert in live mode, in flows.js, before line 1866. If crit:1 AND offlineDevices.length > 0 → P1 immediately (kitchen-emergency subject, override-safe-to-use advice in detail). If crit:1 AND devices reachable but off-verdict (A/C/D/off-unknown) at stage 1 → P1 immediately. If crit:0 → proceed with connectivity divert or verdictCard/override guidance as today. One new question block (~15 lines in stage 0) and one new dispatch block in stage 1. Two new tests: TF-159-01 (crit:1 + offline → outcome-p1) and TF-159-02 (crit:1 + Verdict C → outcome-p1).

SECTION: Volume impact (R3 accepted)
Every Tuya kitchen call where the caller says service is active and any circuit is off or offline will now raise P1. This aligns live-mode sites with the intent already present in legacy mode. Volume impact is bounded: only Tuya-enabled sites (those in data/tuya-sites.json, a known set), only OOH hours, only when the caller confirms service is active. Accepted.

DECISION: Override advice in the P1 outcome card | Yes — include "The on-site PowerPause override button is safe to use in the meantime" in the P1 detail (recommended) | No — keep P1 card simple, omit override tip | Need more thought
DECISION: Fix scope | Both fixes together: offline-divert P1 + Verdict C/A/D stage-1 P1 in one PR (recommended) | Offline-divert P1 only (primary bug); Verdict C path as follow-on ticket | All off-verdicts + offline-divert + __all__ fast-path in one PR
DECISION: Ticket type | Same ooh_p1 tag and IoT Support Dashboard paging path as existing P1s — no change needed (recommended) | Add a "schedule/DST" flag to distinguish cause | Need more thought
-->

# OOHDASH-159 Discovery — P1 classification missed: kitchen off during active service

**Date:** 2026-10-27
**Status:** SPIKE complete — all items resolved — gate for design decisions
**Scope:** Read-only investigation. No code changes in this SPIKE.
**Trigger:** Site 6819 Lutley Oak (Halesowen), BST-end night 2026-10-26. All kitchen equipment went off at 8:30pm. DST caused the schedule to fire one hour early. Site was still serving food. Agent Kirsty logged ticket #51205; no P1 raised.

---

## What actually happened — Kirsty's path (PROVEN)

**Zendesk ticket #51205** (2026-10-27 20:39 UTC, site gk_6819):

> **Subject:** [OOH] 6819 Lutley Oak (Halesowen) — Lighthouse gateway / equipment offline
>
> **Transcript:** "Equipment unreachable after on-site power/router checks. No remote action possible; needs IoT connectivity investigation."
>
> **Kirsty's free-text note:** "All equipment has gone off and not on, due to the clock changing it goes off at 8:30pm now and needs to be 9:30pm, site still has food going out, can someone call ASAP contact number is 07961239552 — Kirsty"
>
> **Tags:** ooh, tcat_support_request. **No ooh_p1.** Priority: normal.

**Kirsty went through the connectivity flow, not the kitchen flow.** She knew this was a kitchen emergency and documented it in free-text, but the flow had already ended at `outcomeCaptured`. No P1 was offered or raised.

---

## R1: Site 6819 is Tuya-enabled (PROVEN)

`data/tuya-sites.json` line 142: `"gk-6819": "eu1757586577803wcQHH"` — the site is in the Tuya live-mode registry. The live-mode flow path applies.

---

## The two bugs

### Bug 1 — Primary (what caused the miss)

**Location:** `public/js/flows.js:1866-1868`

```js
const offlineDevices = ks.filter(d => d.tuya && d.tuya.verdict === 'offline');
if (offlineDevices.length > 0) {
    f.cat = 'connectivity'; f.stage = 0; return FLOWR.connectivity(ws, f);
}
```

When any kitchen circuit is offline in live mode, the flow redirects unconditionally to the connectivity flow **before asking whether service is active**. The connectivity flow always exits as `outcomeCaptured` — "Equipment unreachable / needs IoT investigation." No P1 path exists.

All-kitchen-offline during service is the most critical kitchen scenario. It should always be P1 if service is active. Instead, it exits as a normal ticket.

### Bug 2 — Secondary (would trigger if devices weren't offline)

**Location:** `public/js/flows.js:1864-1886` (live-mode stage 0) and `flows.js:1958-1961` (Verdict C)

In live mode, after the offline check, the flow goes straight to the device picker with no service-criticality question. Verdict C (relay OFF, schedule says off — the DST state) tells the operator "it's scheduled off, try the override." Service-criticality is only asked after override failure.

**Legacy mode contrast:** `flows.js:1855-1861` — asks crit at stage 0 immediately. A "yes" goes to P1 before any override step. Live mode has no equivalent.

---

## Code trace — the path Kirsty followed

```
live-mode kitchen flow stage 0 (site 6819, 20:39 UTC):
  flows.js:1852-1853: liveKs populated; isLiveMode = true
  flows.js:1866:      offlineDevices = kitchen devices where tuya.verdict === 'offline'
                      (all circuits offline — power cut by DST-early schedule)
  flows.js:1867-1868: offlineDevices.length > 0
                      → f.cat = 'connectivity'; FLOWR.connectivity(ws, f)
                      ← NO crit question, NO P1 path ←
  connectivity flow   → outcomeCaptured → ticket #51205
```

```
legacy-mode kitchen flow stage 0 (non-Tuya site, same scenario):
  flows.js:1857: off = ks.some(k => !k.online)
  flows.js:1858: if (off) → connectivity (same gap here too, but...)
  flows.js:1859: else → "Is the kitchen needed for service right now?"
                   → crit:1 → P1
```

Both modes share the "any-offline → connectivity" divert without a crit check first. Legacy mode asks crit for non-offline kitchen issues; live mode never does.

---

## Fix

**One question, placed before the offline check, covers both bugs.**

In `public/js/flows.js`, before the `offlineDevices` check at line 1866, insert:

```js
// Ask service criticality before any offline divert or device picker.
// Kitchen off during service is P1 regardless of cause (offline, schedule, fault).
if (f.data.crit === undefined) {
    return `<div class="stepq">Is the kitchen needed for service <b>right now</b>
 (food being served / hotel breakfast)?</div>
   <div class="chips">
     <button class="chip" data-testid="kitchen-critical"
       onclick="flowStep({crit:1})">Yes — business critical now</button>
     <button class="chip" data-testid="kitchen-notcritical"
       onclick="flowStep({crit:0})">No — needed later / tomorrow</button>
   </div>`;
}
// crit is now set.
// If crit:1 and any offline device → P1 immediately (don't divert to connectivity).
if (f.data.crit === 1 && offlineDevices.length > 0) {
    doneLine('Business-critical during service — circuits offline — P1');
    return outcomeP1(f, 'crit', {
        subject: 'Kitchen equipment off during service — P1',
        detail: 'Kitchen circuits offline while the site is actively serving. Needs immediate IoT action.',
        script: 'I\'ve raised an urgent P1 ticket. Someone will call back shortly. The on-site override switch, if available, is safe to try in the meantime.',
        p1Summary: 'Kitchen equipment offline during service'
    });
}
// crit:0 and offline → connectivity divert as today
if (offlineDevices.length > 0) {
    f.cat = 'connectivity'; f.stage = 0; return FLOWR.connectivity(ws, f);
}
```

In stage 1, before `verdictCard` is shown: if `f.data.crit === 1` and verdict is A/C/D/off-unknown → P1. If `f.data.crit === 0` → show verdictCard with override guidance as today.

**New tests:**
- TF-159-01: live mode + offline circuit + crit:1 → `outcome-p1` (covers Kirsty's exact scenario)
- TF-159-02: live mode + Verdict C + crit:1 → `outcome-p1` (covers the override-gate secondary gap)

---

## Volume impact (R3, accepted)

Every Tuya kitchen call where the caller says service is active and any circuit is off or offline will now raise P1. This is the correct behaviour and aligns live-mode sites with legacy mode. Volume impact is bounded: only Tuya-enabled sites in data/tuya-sites.json, only OOH hours, only when the caller confirms service is active. Explicitly accepted.

---

## Related

- OOHDASH-152: day-order fix (merged PR 164) — separate DST root cause
- Tuya DST shift investigation (run mvp7xjqf) — separate fix for schedule clock drift
- OOHDASH-134: "Something else" P1 flow — separate flow, not affected

---

*Investigation by ooh-triage-dashboard-R1-mvr5x7x6 · 2026-10-27*
*Evidence: Zendesk #51205 | data/tuya-sites.json:142 | public/js/flows.js:1866-1868*
