<!-- gate:contract
SECTION Scope: This design covers OOHDASH-70 ONLY — the R10/C8 in-app hot-water (DHW) scope-routing clarity. It contains no /healthz work, no dispatch authz, no bridge-inventory transport (B2) and no site-identity (B0/C9) material; those live in their own artefacts and in the shared conditions register. It decides one thing: hot-water complaints must be routed to capture-and-escalate BEFORE any compose/dispatch affordance, and the scope signal must be driven by live device presence, not a hard-coded constant.
SECTION The gap: The DHW control path and the "Hot water" scope tile both key off deviceType === 'salus-it500-dhw' (api.js:107, flows.js:266). The live bridge NEVER emits that vendorId — a combi iT500 arrives as ONE salus-it500 device carrying a hotWater telemetry field (bridge.js:57-67). So the scope tile reports HW as flatly 'none' → "Not on Lighthouse here" for ALL sites, and the boost/compose affordance (flows.js:277) can only appear from fixture data, never live. The app is safe-by-accident today; the risk is a future data change (R7) silently re-enabling a compose path off an unverified deviceId. Cited to file:line.
SECTION The design: Make HW-out-of-scope the explicit, correct R1 DEFAULT and surface it at the scope-tile / device-list view BEFORE compose. Drive the "Hot water" scope level from what live data actually contains (device presence / hotWaterCapable), NOT the constant salus-it500-dhw match, so the signal is honest and R7-ready. The hotwater flow's no-device branch (flows.js:267-269) already routes to capture-and-escalate — this design makes that the deterministic, front-loaded path and removes the implication that HW is controllable.
SECTION R7 dependency: Whether HW is EVER controllable from live data is a product/data decision (combi split vs re-key DHW off telemetry.hotWater), owner Spencer, UNVERIFIED. This design does NOT decide R7. It designs the scope signal so that IF a real controllable DHW device later appears in live data, the tile flips to controllable off actual presence — no code change to re-enable, no hard-coded "HW off" to unpick.
SECTION Code surface: The scope-tile level fn (api.js:107), the hotwater flow entry (flows.js:266-277), and the scope/device render (views.js:154,168). Small surface; the change is making the default explicit and presence-driven, not adding control.
SECTION Tests: HW complaint at a live site surfaces "not controllable here — capture and escalate" at the scope view before any compose affordance; the boost/compose chip never renders from live data; a synthetic controllable-DHW device flips the tile to controllable (R7-ready proof); the capture-and-escalate outcome logs a hot-water class ticket.
SECTION Condition: C8 + R10 primary (OOHDASH-70); R7 is the OPEN product dependency (Spencer); B2 is the bridge-contract boundary — referenced, not absorbed. None closed here.
DECISION hw-scope-approach: Treat "hot water is OUT OF SCOPE" as the correct, safe R1 DEFAULT and surface it at the scope-tile / device-list view BEFORE any compose/dispatch affordance — a hot-water complaint routes to capture-and-escalate with a clear "hot water is not controllable here — capture details and escalate" message. Drive the "Hot water" scope tile level from ACTUAL live device presence (a controllable DHW device / hotWaterCapable signal), NOT the hard-coded deviceType === 'salus-it500-dhw' constant (api.js:107) which live data never satisfies. This keeps the default honest and, per R7, lets the tile flip to controllable automatically if live data ever carries a real DHW control device — no re-enable code change, no "HW off" constant to unpick.
DECISION R7-openness: The scope signal must NOT hard-code "HW off". It reads live device presence so R7 (combi split vs re-key DHW off telemetry.hotWater — owner Spencer, UNVERIFIED, F025 decision) can bring HW into scope later by data alone. This design decides the R1 default and the before-compose UX; it does NOT decide R7 and must not be treated as closing it.
-->

# Design — OOHDASH-70 hot-water (DHW) scope routing — before-compose capture-and-escalate

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Ticket:** OOHDASH-70 (C8 + R10) · **Date:** 2026-09-15
**Repo state (verified):** `main`, app v1.2.0. Hot-water control and the "Hot water" scope tile both key off `deviceType === 'salus-it500-dhw'` (`routes/api.js:107`, `public/js/flows.js:266`); the live bridge never emits that vendorId (`services/bridge.js:57-67`).
**Scope:** exactly one thing — in-app HW scope clarity so handlers are told HW is out of scope **before** they compose an action. **Nothing else.** No `/healthz`, no dispatch authz, no bridge-inventory transport (B2), no site-identity (B0/C9). Carried conditions live in `RELEASE_CONDITIONS_REGISTER.md`; this design references only the ones that genuinely touch -70.
**Method:** every code claim verified firsthand against deployed source on `main`, cited to `file:line`. R7 and any external-owned item is marked **UNVERIFIED** with its owner.

---

## 1. Verified current state

**The scope tile keys off a vendorId live data never emits.** The "Hot water" scope group derives its level from a hard-coded device-type match:

```
{ key: 'hotwater', label: 'Hot water',
  level: s => s.devices.some(d => d.deviceType === 'salus-it500-dhw') ? 'ctl' : 'none' }   (api.js:107)
```

The bridge contract mapper is explicit that this vendorId is **never emitted live**: a combi iT500 arrives as **one** `salus-it500` device carrying a `hotWater` telemetry field, and `deviceType` is set verbatim from `vendorId` (`bridge.js:57-67`). The mapper's own KNOWN MISMATCH note (flagged as F025) states: *"The bridge never emits that vendorId … hot-water CONTROL and the hot-water scope tile will NOT activate from live bridge data under the current registry model."* It also records that the combi DHW signal **is** present as `hotWaterCapable: raw.hotWater != null` (`bridge.js` mapper) and in telemetry — the data to drive an honest tile already exists; only the tile logic ignores it.

**Consequence at the scope view.** Because no live device matches `salus-it500-dhw`, the tile level is always `'none'`, which `views.js:154` renders as **"Not on Lighthouse here"** for every live site (this matches tester test 6 — "everything else shows 'not on lighthouse here'", and test 5 — "No boiler or tuya devices found"). So today HW *appears* out of scope — but by **accident of a never-matching constant**, not by a designed default.

**The compose affordance is gated on the same never-matching device.** The hotwater flow:

```
hotwater(ws, f) {
  const dhw = ws.devices.find(d => d.deviceType === 'salus-it500-dhw');   (flows.js:266)
  if (f.stage === 0) {
    if (!dhw) { doneLine('No boostable hot-water device at this site');
      return `…isn't on a boostable Lighthouse device — likely boiler-side…
              <button onclick="flowStep({cap:1})">Capture & escalate</button>
              <button onclick="flowStep({sc:1})">Scope guidance (boiler fault?)</button>`; }   (flows.js:267-269)
    …
    return `…<button data-testid="hw-boost-yes" onclick="flowStep({boost:1})">Yes — set a boost</button>…`;   (flows.js:277)
```

So the **"Yes — set a boost"** compose/dispatch chip (`flows.js:277`, which calls `openControl(dhwDev,'boost')` at `flows.js:281`) only renders when a `salus-it500-dhw` device is found — i.e. **never from live data**, only from fixture. Live callers already fall into the `!dhw` branch and get capture-and-escalate.

**Net.** The app is **safe-by-accident**, not safe-by-design:
- The "out of scope" signal is a side-effect of a constant that never matches, sitting **inside the flow** (after the handler has already picked the HW category), not front-loaded at the scope view as a designed default.
- The scope tile ignores the `hotWaterCapable` / `telemetry.hotWater` signal that live combi devices genuinely carry — so it can neither explain *why* HW is out of scope nor honestly reflect a future controllable device.
- The residual risk is **forward-looking**: the moment R7 changes the data (a `salus-it500-dhw` device, or any re-key), the `hw-boost-yes` compose path silently re-arms off a deviceId whose control contract is unverified.

---

## 2. The design — HW-out-of-scope as the explicit R1 default, surfaced before compose

Two coupled decisions.

**(a) Make "hot water is not controllable here" the explicit, front-loaded default at the scope view (C8).**
The scope-tile / device-list view (`views.js:153-155`, `data-testid="scope-list"`) is the BEFORE-compose surface a handler reads while answering *"isn't that you?"*. The "Hot water" tile must render a **designed** out-of-scope state there — *"Hot water — not controllable here; capture details and escalate"* — reached **before** any category tile / compose affordance. Concretely, a hot-water complaint routes to **capture-and-escalate** (the existing `outcomeCaptured(… OohCaptureClass:'hot-water')` path, `flows.js:283-289`) as the deterministic default, and the **"Yes — set a boost"** compose chip (`flows.js:277`) does **not** render for a site whose HW is out of scope. This turns today's accidental `!dhw` fallback into the designed, single path, and removes the implication that HW is controllable.

**(b) Drive the tile level from ACTUAL live device presence, not the constant (C8 + R7).**
Replace the hard-coded `deviceType === 'salus-it500-dhw'` test at `api.js:107` with a level derived from **what live data actually contains**:
- `ctl` (Controllable) **only if** a genuinely controllable DHW device is present in live data (the presence predicate — see R7 below — not a name-match on a vendorId that never arrives);
- `mon` / out-of-scope-with-context if the site carries the `hotWaterCapable` / `telemetry.hotWater` signal (a combi is *observed* but not *controllable*), letting the tile say *"hot water demand is monitored, but not adjustable from here"* rather than a bare "Not on Lighthouse here";
- `none` otherwise.

This is the load-bearing R7-readiness move: the signal becomes a **function of live inventory**, so the correct R1 behaviour (out of scope) holds today because no controllable DHW device is present — **not** because a constant is hard-wired off. There is no "HW off" flag to later unpick.

**Why this over the alternatives.**
- *Do nothing (rely on the never-matching constant).* Rejected: the out-of-scope signal lives inside the flow, after category selection — it violates C8's "before compose" requirement — and it hard-codes an assumption that forecloses R7 the moment data changes.
- *Hard-code "Hot water: out of scope" as a literal.* Rejected: it satisfies C8 but **forecloses R7** — bringing HW into scope would then need a code change, and the tile could never reflect a real controllable device that appears in live data.
- *Chosen: presence-driven tile + front-loaded capture-and-escalate default.* Satisfies C8 (before-compose clarity), keeps R7 open (scope flips on live presence alone), and reuses the existing capture-and-escalate outcome.

---

## 3. R7 — the open product dependency (do not treat as closed)

Whether hot water is **ever** controllable from live data is a product/data decision, **owned by Spencer**, **UNVERIFIED** — the F025 combi question: split the combi into two logical devices, or re-key the DHW control paths off `telemetry.hotWater`. See `RELEASE_CONDITIONS_REGISTER.md` **R7** for the full row. This design:
- decides the **R1 default** (HW out of scope → capture-and-escalate) and the **before-compose UX**, which are ours;
- does **not** decide R7, and the presence predicate in §2(b) is deliberately written so that **if** R7 later makes a real controllable DHW device (or a re-keyed control path) appear in live inventory, the tile flips to `ctl` and the flow re-enables the boost affordance **off actual presence** — no "re-enable" edit, no constant to change;
- treats R7 as the **proof obligation** that must land before any HW *control* is trusted (mirroring how B3 gates write, and the boundary at B2 for the bridge contract). Until R7 clears, the presence predicate must not admit `salus-it500-dhw` as controllable on the strength of the name alone.

---

## 4. Boundary (reference, not absorbed)

- **B2 — bridge inventory read/contract (OOHDASH-75).** Same `/api/devices` contract this design reads (`bridge.js:57-67`), but B2 is the *transport + contract-proof* condition, designed and tracked elsewhere. This design consumes the mapped `hotWaterCapable` / `telemetry.hotWater` fields; it does **not** re-prove the bridge read. Reference `RELEASE_CONDITIONS_REGISTER.md` B2.
- **B0 / C9 — site identity.** Out of scope here; referenced only.
- This artefact is HW **scope clarity** specifically — not device inventory, not identity, not control-auth.

---

## 5. Code surface

| File | Change |
|---|---|
| `routes/api.js` | Replace the `hotwater` `SCOPE_GROUPS` level fn (`:107`) — swap the hard-coded `deviceType === 'salus-it500-dhw'` match for a live-presence-driven level: `ctl` only if a genuinely controllable DHW device is present, an out-of-scope-with-context level where `hotWaterCapable`/`telemetry.hotWater` is observed but not controllable, else `none`. Same `scope` payload shape (`:126`). |
| `public/js/flows.js` | Make the out-of-scope path the **deterministic default** for the hotwater flow (`:266-277`): the boost/compose chip (`hw-boost-yes`, `:277`) renders **only** when the presence predicate says controllable; otherwise route straight to capture-and-escalate (reuse `outcomeCaptured` at `:283-289`, `OohCaptureClass:'hot-water'`) / scope guidance. Front-load the "not controllable here — capture and escalate" message before compose. |
| `public/js/views.js` | Render the presence-driven HW tile state at the scope-list view (`:154`) so a `mon`/out-of-scope-with-context level reads as *"hot water monitored / not adjustable from here"* rather than a bare "Not on Lighthouse here"; keep the device-board fallback copy (`:168`) consistent. |

No new control capability is added; the change makes the existing safe behaviour **designed, front-loaded, and presence-driven**.

---

## 6. Proving tests (design)

1. **Before-compose out-of-scope (C8 core).** Load a live site (no controllable DHW device); assert the "Hot water" scope tile renders the designed out-of-scope-with-context state at `data-testid="scope-list"` **before** any category/compose affordance, and that a HW complaint routes to capture-and-escalate.
2. **Compose affordance never renders from live data.** For any live-shaped inventory (`salus-it500` combi carrying `hotWater`, no `salus-it500-dhw`), assert the `hw-boost-yes` chip (`flows.js:277`) does **not** render and no `openControl(…, 'boost')` path is reachable.
3. **R7-ready flip (presence-driven, not constant).** Inject a synthetic **controllable** DHW device into live inventory; assert the tile flips to `ctl` and the boost affordance re-appears **without any code change** — proving the signal is driven by live presence, not a hard-coded "HW off". *(This is the R7-openness proof; it does not decide R7.)*
4. **Capture-and-escalate outcome logs correctly.** The HW capture path records a ticket with `OohCaptureClass:'hot-water'` (`flows.js:288`) and the "not controllable here — capture and escalate" script.

*Fixture/live seam:* tests drive inventory via the existing workspace/fixture path — no live bridge call in CI. Note the fixture *may* still carry a `salus-it500-dhw` device (that is what exercises test 3); **live** never does (`bridge.js:57-67`).

---

## 7. Carried conditions (pointers only)

See `RELEASE_CONDITIONS_REGISTER.md` for full rows, owners and resolve-before:

- **C8 (primary)** — HW scope clarity must surface at the device-list view **before compose**, not as a post-attempt correction. This design front-loads it at the scope tile and removes the implied controllability. *(OOHDASH-70.)*
- **R10 (primary)** — in-app HW scope clarity: route HW complaints to capture-and-escalate in advance. Delivered by §2. Design-gate (hard); ties to C8.
- **R7 (dependency — OPEN, Spencer/product, UNVERIFIED)** — whether HW is ever controllable from live data (combi split vs re-key off `telemetry.hotWater`, F025). **Not decided here**; the scope signal is designed to flip on live presence when R7 lands.
- **B2 (boundary)** — bridge inventory read/contract (OOHDASH-75); same contract, designed elsewhere — referenced, not absorbed.

None of these is closed by this artefact.

---

*All line numbers cited against repo `main`, 2026-09-15, verified firsthand for this artefact: `services/bridge.js:57-67`, `routes/api.js:96,105,107,126`, `public/js/flows.js:266,267-269,277,281,283-289`, `public/js/views.js:153-155,154,168`. R7 is UNVERIFIED, owned by Spencer. This artefact decides the R1 HW-scope default and the before-compose UX only; it does not decide R7, invoke gates, open a PR, commit, or flip anything.*
