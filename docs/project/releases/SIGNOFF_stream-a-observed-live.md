# SIGNOFF — Stream A (refrigeration switch-deny) observed live

Required artefact for the OOHDASH-19 write-flip interlock (DESIGN_cellar-switch-removal.md §6.1).
Enforced by `test/interlock-stream-a.test.js`.

| Field | Value |
|---|---|
| Image digest | `b65560b` |
| **Image ref** | `apitechhub.azurecr.io/ooh-dashboard:b65560b` (= release v1.3.0) |
| **Environment** | prod AKS `apitechhub`, namespace `iot-services`, deployment `ooh-dashboard` |
| **Date observed** | 2026-09-24 |
| **Named owner** | James Brown |
| **Verdict** | **PASS** — the refrigeration switch-deny is present and effective in the running image |

## What was observed

**1. Boot self-test passed on the running image.** The pod that came up on the write-flip
(`ooh-dashboard-6f7b5fd4cc-5xrcm`, image `b65560b`) logged
`[WRITE-LOCK] *** DEVICE WRITES ARE ENABLED IN PRODUCTION — WRITES_DISABLED=false ***`
with **no** accompanying refrigeration-guard lock message. Per `services/refrig-guard.js`, a running
image lacking the deny would have engaged the latch and kept writes LOCKED with a hard startup error.
The absence of that error is positive proof the deny is compiled into the deployed image.

**2. The deny was exercised against every real refrigeration asset in production, not a single probe.**
All devices in ThingsBoard whose name contains cellar / fridge / freezer / chiller were enumerated
(1,389 devices). Of those, **43 sit on the switch-capable `tuya Profile`** — these are the actual
blast radius of the CTO's stock-loss concern, because the capability-first classifier would otherwise
render a Turn OFF button for them. Each of the 43 was passed through `classifyDevice()` with a
worst-case payload asserting both `switchReported: true` and `switch_1: true`.

**Result: 43 / 43 classified `refrigeration`, `controllable: false`. Zero leaks.**

This included the name shapes most likely to defeat a naive matcher, all correctly denied:

| Name | Why it is a hard case |
|---|---|
| `Gk-6720-fridge-1` | capitalised prefix |
| `gk-6600-fridge-1 ` | trailing whitespace |
| `gk-6750-cellar cooling ` | embedded space **and** trailing whitespace |
| `gk-4631-cellarcooling-1` | concatenated compound noun |
| `gk-6211-walkinfreezer` | no trailing index segment |
| `gk-6857-freezercondensor-1` | compound + misspelling |

## Deviation from the design's specified check — read this

DESIGN_cellar-switch-removal.md §6.1 specified the observation as: *a named owner confirms the
cellar device `gk-6261-cellar-1` shows no Turn OFF button in the live pod UI.*

That exact check **could not be performed, because `gk-6261-cellar-1` does not exist.** Site 6261 has
23 devices and none of them is a cellar unit; the name is a synthetic probe used by
`refrig-guard.js` only to drive the pure, name-based `classifyDevice()` self-test. The design named a
device that was never real.

The evidence above is offered as a **stronger** substitute: rather than one human eyeballing one
(non-existent) device, the deny was verified against the complete real population of 43 switch-capable
refrigeration assets. What is **not** covered by this artefact, and is honestly flagged as residual:

- **No human has visually confirmed the absent Turn OFF button in the live UI.** The proof is at the
  classification layer, which is what actually gates the button, plus two independent server-side
  backstops (`registry.js:112`, `killswitch.js`). A UI observation would add a fourth, end-to-end layer.
- The 43-device sweep is a **point-in-time snapshot** (2026-09-24). A newly-commissioned refrigeration
  asset with an unusual name is denied by the same name rules, but has not been individually tested.

## Ordering note — the interlock did not actually gate the flip

The CI interlock was designed to block the write-flip by failing the **manifest PR**. The flip that
went live on 2026-09-24 was applied with `kubectl set env` directly against the cluster, which never
touches git — so branch protection never ran, and writes were enabled **before** this artefact existed.
The safety outcome is unaffected (the runtime boot guard, which cannot be bypassed that way, did its
job and confirmed the deny was present). But the governance route has a hole: **any lever applied via
`set env` bypasses every git-side gate.** Worth closing separately — see OOHDASH-19 follow-ups.
