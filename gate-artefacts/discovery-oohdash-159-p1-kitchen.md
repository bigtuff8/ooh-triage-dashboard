<!-- gate:contract
SECTION: The bug
In live mode (Tuya-enabled sites), the kitchen triage flow never asks "Is the kitchen needed for service right now?" before showing circuit verdict cards and override options. This question IS asked in legacy mode (non-Tuya sites) at stage 0 — any "yes" immediately triggers P1. In live mode the service-criticality question only surfaces after an override attempt fails. When DST fires all kitchen circuits off one hour early, Tuya reports them as Verdict C ("OFF — schedule has it off until [next on time]"), which the flow presents as expected. The operator is scripted to try the override; if it works, the flow exits as a normal captured ticket. P1 is never triggered regardless of root cause.

SECTION: Proof
flows.js:1855-1861 — legacy mode asks "Is kitchen needed for service right now?" at stage 0 → yes → P1 immediately.
flows.js:1864-1886 — live mode: stage 0 checks for offline devices, then goes straight to device picker. No service-criticality question.
flows.js:1958-1961 — Verdict C (relay OFF, schedule says off — the DST state): shows only override chips (override-ok, override-fail). No P1 path directly from here.
flows.js:2014-2017 — "override-fail" outcome: THEN asks "Is kitchen needed for service right now?" — the first point P1 becomes reachable in live mode.
flows.js:2002 — "override-ok" outcome: outcomeCaptured (normal ticket). P1 is unreachable from this branch even if service is active.
tuya-kitchen-flow.spec.js has no test for: live mode + circuit off + service active → P1.

SECTION: Proposed fix
In live mode stage 0 (flows.js, after the offline-device divert at line 1868 and before "Store live kitchen devices" at line 1871), add a service-criticality question that mirrors legacy mode. If crit:1 → any circuit with an off verdict (A, C, D, off-unknown) raises P1 immediately, with the PowerPause override tip added as in-call advice in the P1 outcome detail. If crit:0 → proceed with override guidance as today. One new code block (~10 lines) and matching updates to verdictCard stage 1 dispatch. New test: live mode + Verdict C + crit:1 → outcome-p1.

SECTION: What is still unresolved
Three items need clarification before design can close. R1: Is site 6819 Tuya-enabled? If yes, the fix above is correct. If no (legacy mode), the P1 path was available and Kirsty either answered "No — needed later/tomorrow" or went through a different flow. Check tuya-sites.json for site 6819. R2: What path did Kirsty actually take? The Zendesk ticket for site 6819 on 2026-10-26 ~20:30 BST will show OohCaptureClass and ticket text — that tells us whether the kitchen flow was reached and which branch it took. R3: James decision on override + P1: should a successful override still file as P1? The DST root cause is still live even if the override worked (the schedule will misfire again). Recommendation: yes, P1 regardless — the override tip is advice, not a gate. Needs James confirmation.

DECISION: Is site 6819 Tuya-enabled (live mode)? | Yes — 6819 is in tuya-sites.json; fix targets live-mode stage 0 | No — 6819 is legacy mode; root cause is different (Kirsty answered wrong question or used wrong flow) | Unknown — need to check tuya-sites.json before design starts
DECISION: Should a successful override still raise P1? | Yes — P1 regardless of override success; override tip is advice not a gate (recommended) | No — if override works it is resolved; only override-fail or no-override paths need P1 | Need more thought
DECISION: Scope for the design gate | Fix live-mode only: ask crit question at stage 0 before device picker | Fix both modes: add explicit "all circuits off" fast-path for the __all__ case too | Fix + add Zendesk OohCaptureClass audit log entry for missed-P1 pattern detection
-->

# OOHDASH-159 Discovery — P1 classification missed: kitchen off during active service

**Date:** 2026-10-27
**Status:** SPIKE complete — gate for design decision
**Scope:** Read-only investigation. No code changes in this SPIKE.
**Trigger:** Site 6819, BST-end night 2026-10-26. All kitchen equipment went off at 8:30pm. DST caused the schedule to fire one hour early (schedule said 9:30pm). Site was still serving food. Agent Kirsty logged a ticket; it was not surfaced as P1.

---

## The bug

**In live mode (Tuya-enabled sites), the kitchen triage flow never asks "Is the kitchen needed for service right now?" before showing circuit verdict cards and override options.**

The P1 path is gated behind an override attempt: the service-criticality question only surfaces if the operator reports the override has failed. In the DST scenario, all kitchen circuits show as **Verdict C** — "OFF — the schedule has it off until [next on time]" — which the flow presents as expected behaviour. The operator is scripted to say "it's off per schedule, try the override." If the override works, or the operator accepts the "scheduled off" answer without pushing further, the flow exits as a normal captured ticket. P1 is never triggered.

This contrasts with **legacy mode** (non-Tuya sites), where stage 0 asks "Is the kitchen needed for service right now?" immediately after the online check. A "yes" answer goes straight to P1, regardless of schedule state or root cause.

---

## Proof — traced from source

### Legacy mode path (non-Tuya sites) — P1 is reachable from question 1

```
flows.js:1855-1861
  stage 0, !isLiveMode branch:
    d.online check → if any offline, divert to connectivity
    else → ask: "Is the kitchen needed for service right now?"
      → crit:1 (yes) → stage 1
        → immediately: outcomeP1 — P1 ticket raised
      → crit:0 (no) → outcomeCaptured (normal ticket)
```

P1 is the FIRST outcome reached for any "yes" answer. No override step, no intermediate questions.

### Live mode path (Tuya-enabled sites) — P1 is gated behind override failure

```
flows.js:1864-1886
  stage 0, isLiveMode branch:
    offline check (verdict === 'offline') → divert to connectivity
    else → device picker shown (or single circuit auto-selected)
    ← NO service-criticality question at stage 0 →

flows.js:1889+
  stage 1 live mode:
    verdictCard(device) → shows circuit verdict + override chips

    Verdict C (relay OFF, schedule says off — the DST state):
      flows.js:1958-1961
      label: "OFF — the schedule has it off until [next on time]"
      script: "it's showing as off, but that's what the schedule says..."
      chips: [override-ok] [override-fail]
      ← NO service-criticality question, NO P1 path from here →

    "override-ok" → outcomeCaptured (normal ticket, P1 unreachable)
    "override-fail" → flows.js:2014-2017
      → THEN asks: "Is the kitchen needed for service right now?"
        → crit:1 → P1 reachable (but only now, after override attempt)
        → crit:0 → outcomeCaptured
```

P1 requires two operator actions: (1) try the override AND (2) report it failed. A working override, or an operator who accepts "scheduled off" without trying the override, exits as a normal ticket.

### DST scenario reconstructed

At 8:30pm BST→GMT night, the PowerPause schedule's "off" event fired one hour early. From Tuya's perspective:

- `switchOn: false` (relay off) ✓
- `schedule.state: 'off'` ✓
- `schedule.nextOn`: set to early morning next day

This is **Verdict C** — the circuit looks exactly like a correctly-scheduled off event. The flow presents it as expected. The operator is told "it's scheduled off, try the override." If the caller pressed the override button and it brought the circuit back on (which it would, because it overrides the schedule), the flow returns `outcomeCaptured`. No P1, no escalation, no IoT call.

### Test coverage gap

`tests/tuya-kitchen-flow.spec.js` — no test for: live mode + circuit off + service active → P1.  
`TF-140-08` (override-ok on Verdict A) is tested and correctly resolves as `outcome-captured`. This is the P1 blind spot: a passing test suite with no guard on the P1 path in live mode.

---

## What is unresolved

### R1 — Is site 6819 Tuya-enabled?

**UNRESOLVED.** Check `data/tuya-sites.json` for site 6819. If present, the bug above is the root cause and the fix targets live-mode stage 0. If absent (legacy mode), the P1 path was available to Kirsty via the stage 0 question, which means either she answered "No — needed later/tomorrow" by mistake, or she didn't go through the kitchen flow at all.

### R2 — What path did Kirsty actually take?

**UNRESOLVED.** The Zendesk ticket raised for site 6819 on 2026-10-26 around 20:30 BST will show:
- `OohCaptureClass` field: `kitchen-powerpause` (kitchen flow reached) or absent (different flow)
- Absence of `ooh_p1` tag: P1 was never raised
- Ticket text: the script lines the operator read will identify the branch (Verdict C script is distinctive)

### R3 — James decision: should a successful override still file as P1?

**DECISION NEEDED.** Even if the caller pressed the override and the kitchen came back on, the DST root cause is still live — the schedule will misfire again. Recommendation: yes, raise P1 regardless of override success. The override tip should be advice within the P1 outcome card ("The PowerPause override button is safe to use in the meantime"), not a gate that determines whether P1 is raised at all. Needs James's call before design gate.

---

## Proposed fix

**Mirror legacy mode in live mode: ask the service-criticality question at stage 0, before the device picker, after the offline-device check.**

**Change location:** `public/js/flows.js`, after the offline divert (line 1868), before "Store live kitchen devices" (line 1871).

Add:
```js
// Ask service criticality before device selection — mirrors legacy mode.
// Any kitchen off during service is P1 regardless of root cause.
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
```

**Stage 1 live mode dispatch:** if `f.data.crit === 1` AND selected device verdict is A, C, D, or `off-unknown` → raise P1 immediately. Override tip included as advice in the P1 outcome detail string. If `crit === 0` → show verdictCard with override guidance as today.

**New test:** TF-159-01: live mode (fixture site 8888) + select Bain-marie (Verdict C) + crit:1 → `outcome-p1`. Covers the DST scenario exactly.

**Verdict B and E** (circuit ON) are unaffected — there is nothing to escalate when the circuit is on.

---

## Related

- OOHDASH-152: day-order fix (merged PR 164) — separate DST root cause
- Tuya DST shift investigation (run mvp7xjqf) — separate fix for schedule clock drift
- OOHDASH-134: "Something else" P1 flow (separate flow, not affected here)

---

*Investigation by ooh-triage-dashboard-R1-mvr5x7x6 · 2026-10-27*
