<!-- gate:contract
SECTION Blockers first: Nothing in this repo is hard-blocked — every root cause is code-confirmed and the fix is buildable here. But TWO product decisions must be made before Design can finish, and one data question needs Sam Day. B1 (the central one): when the area selector collapses from "one chip per device" to just Accommodation / Bar-Restaurant, an area can now map to SEVERAL heating devices, and the current flow assumes exactly ONE device per chip. Someone must decide what "read" and "control" mean when Accommodation is three thermostats — show which temperature, and (when writes are eventually unlocked) act on which device. B2: the iT500 site-code letter scheme (s/f/r/b) is the mapping's backbone but its meaning is UNVERIFIED — Sam must confirm s=Staff, f=Flats, r=Restaurant, b=Bar before we hard-wire it. Read these before the detail.
SECTION What this is: The formal discovery for OOHDASH-82 — collapse the heating "Which area?" step to only TWO caller-meaningful areas (Accommodation, Bar/Restaurant) derived from device attributes; stop showing hardware serials and gateways as selectable areas; and remove aircon control from the dashboard entirely, referring every aircon request to the IoT team by ticket. Discovery only — no product code was changed; code was read to confirm every root cause, and the estate counts come from James's full live-ThingsBoard analysis (12,816 devices, 2026-09-23).
SECTION What we found (plain English): The complaint is real and confirmed at source. The "Which area?" step prints each heating device's raw label, which for these devices is a hardware serial (like IT700TX-025E1675) or a raw name (like gk-6218-salusit700) — meaningless to a handler. A second, quieter defect: because the classifier checks the "salus" name-token before the "gateway" token, the 225 paired Salus gateways are themselves mis-typed as heating and appear as their own junk "area" chips. And aircon (Intesis) is currently classified as heating, so the 403 Intesis units already surface as heating areas AND already offer a setpoint control — yet they carry NO location attribute of any kind, so they can never be honestly placed in an area. That is exactly why the ticket says: remove aircon control, refer by ticket.
SECTION The two-area mapping and where each fact is grounded: iT700 thermostats are the accommodation controller (one per site) and map 100% to Accommodation. iT500 units carry a structured site-code whose letter (s/f/r/b) is the only per-device signal that separates Accommodation (staff/flats) from Bar-Restaurant (restaurant/bar). Intesis has no location and is removed from the area model entirely. Every count and attribute-coverage figure is from James's live-estate analysis (marked "doc"); every code behaviour is traced to a file:line on this branch (marked "code").
SECTION The central design question (hand to Design): The heating flow today stores the chosen chip as an index into the device list and reads back exactly one device from it (zones[f.data.zi]). Collapsing to two areas breaks that one-to-one link — an area can be many devices. Design must define the area-to-device fan-out for both the live read (which temperature/setpoint to show) and, latently under the write-lock, control. This is the single biggest thing to settle and it is called out as B1.
SECTION Aircon removal scope: Removing aircon control touches four places — the classifier row that types Intesis as heating, the registry entry that still grants Intesis a setpoint command, the heating flow's warmer/cooler branch that fires that command, and the flow's existing Intesis-off capture. None of it flips writes. The end state: Intesis never appears as an area and never offers a control; an aircon request is captured and referred to the IoT team by ticket.
SECTION Acceptance criteria mapped to work: Each of the ticket's four acceptance criteria is mapped to what it will require of Design versus Build, and split into "still needs a decision" versus "build-ready once decided".
DECISION Adopt the two-area model (Accommodation / Bar-Restaurant) as scoped here, with area-to-device fan-out (B1) and the iT500 letter scheme (B2) resolved at Design? | Approve — proceed to Design | Request changes
DETAIL The complaint and both defects (serial labels, gateway mis-classification) are code-confirmed; the two-area mapping is grounded in a full live-estate read. Two product decisions (area-to-device fan-out; iT500 letter meaning) and no code changes gate the Design stage. Writes stay LOCKED throughout.
-->

# Discovery — Heating area model: collapse to two areas, remove aircon control (OOHDASH-82)

**Release:** OOH Triage Dashboard — R1 · **Stage:** Discovery · **Date:** 2026-09-23 · **Owner:** James Brown
**Ticket:** OOHDASH-82 (Story, Highest, raised 2026-09-23) — *Heating "area" selector: collapse to two areas (Accommodation / Bar-Restaurant) from device attributes; remove aircon control (refer via ticket).*

**Repo state (verified):** branch `discovery/oohdash-82-area-model` off `main` @ `b039ac8` (`git rev-parse`); package version `1.2.4`; `WRITES_DISABLED=true`; ThingsBoard is the system of record, the integration-bridge sits behind it for command dispatch only.

**Method.** Every current-behaviour claim was read firsthand on this branch during this discovery (file:line below); line numbers were re-confirmed and match `main` @ `b039ac8`. Every estate count and attribute-coverage figure comes from James's full live-ThingsBoard estate analysis of 2026-09-23 (`C:\harness-runs\ooh-triage-dashboard\bau-support-doc\AREA-LABELS-FOR-SAM.md`, 12,816 devices, 100% of tenant, no sampling) — these are not re-derivable from static code and are marked `doc`. Anything not confirmable firsthand is marked **UNVERIFIED** with the probe + owner.

**Verification legend:** `code` = traced to source on this branch in this discovery · `code(deployed)` = behaviour also confirmed present on the deployed HEAD · `doc` = carried from James's verified live-estate analysis · **UNVERIFIED** = not confirmed firsthand; probe + owner named.

**Invariants honoured.** Writes to ThingsBoard stay **LOCKED** (`WRITES_DISABLED=true`) — nothing here proposes flipping them on; the aircon-control removal REDUCES the control surface, it never enables one. ThingsBoard is system of record. **Discovery only — no product code was changed;** code was read solely to confirm root causes.

---

## 0. Blockers first (each with owner)

Nothing in-repo is hard-blocked. Two product decisions and one data question gate the **Design** stage — none blocks approving this discovery, but each must be answered before Design can complete.

| # | Blocker / open decision | Why it blocks Design | What resolves it | Owner |
|---|---|---|---|---|
| **B1** | **Area → multiple-device fan-out (the central design question).** Collapsing "one chip per device" to two fixed areas means one area may map to SEVERAL heating devices. The flow today assumes exactly one device per chip (`flows.js:234` `zones[f.data.zi]`). | The live read (temperature/setpoint/online) and, latently under the write-lock, control both dereference a single device `z`. With N devices behind "Accommodation", the flow has no defined answer for which device to read or act on. | Design defines the fan-out semantics: read (show one representative / aggregate / list per device) and control (apply-to-all / choose / primary device). See §2 and §6. | James + Design |
| **B2** | **iT500 site-code letter scheme (`s`/`f`/`r`/`b`) is UNVERIFIED.** The two-area split for iT500 units depends entirely on this letter, but its meaning is inferred, not confirmed. | The whole iT500 → area mapping rule (s/f → Accommodation, r/b → Bar-Restaurant) hard-wires an unconfirmed convention; getting it wrong routes a caller to the wrong heating. | Sam Day confirms the scheme (proposed: s=Staff, f=Flats, r=Restaurant, b=Bar). Coverage is 93% of iT500 (`doc`); the ~7% with no `site` code need a fallback rule. | Sam Day |
| **B3** | **Aircon referral mechanism is undefined.** The ticket requires aircon requests be "captured and referred by ticket". A capture path already exists (`outcomeCaptured` → `/api/outcomes`), but whether a distinct referral/label/routing to the IoT team is required is not specified. | Design cannot state the aircon outcome copy/routing without knowing if "refer by ticket" = the existing capture ticket or a new dedicated referral class. | James confirms whether the existing capture-and-escalate ticket suffices or a distinct "aircon referral" class/label is wanted. | James |

> **Not a recurrence.** OOHDASH-82 is a new Story, not a re-fix of a prior Live ticket in this area — so no "why did the prior fix not hold?" section is required. The area-labelling problem was *surfaced* (as a gap, not a fix) in the BAU-support-doc session (`AREA-LABELS-FOR-SAM.md`); this is the first ticket to act on it.

---

## 1. Problem framing

The heating flow's first step asks **"Which area is the caller talking about?"** and renders **one chip per heating device**, labelled with the device's `zone` field. For heating devices that field resolves to the device's TB `label` — which is **not a location**: it holds a **hardware serial** (e.g. `IT700TX-025E1675`, `SAWZ600GW-5E10DB38`) or, absent a label, the **raw device name** (e.g. `gk-6218-salusit700`). Both are meaningless to a non-technical OOH handler. James's complaint is confirmed at source.

Three distinct defects sit inside that one step:

1. **Labels are serials/names, not areas** — the core complaint.
2. **Gateways pollute the list** — 225 paired Salus gateways are mis-classified as `heating` and appear as their own junk area chips (root cause §3).
3. **Aircon appears as heating but has no location** — 403 Intesis units are classified `heating`, so they surface as area chips AND offer a setpoint control, yet they carry no location attribute of any kind, so they can never be honestly placed in an area (§4).

**Target (James decision, 2026-09-23):** only **two** caller-meaningful areas ever surface — **Accommodation** or **Bar/Restaurant** — and only those present at the site. Gateways never appear. Aircon control is removed from the dashboard and referred to the IoT team by ticket.

This workstream does **not** touch the write-flip. It changes what is *shown* and *offered*; live actuation stays behind `WRITES_DISABLED=true`.

---

## 2. Current behaviour — evidence table (firsthand)

All line numbers read on this branch; behaviour also present on deployed HEAD (`main` @ `b039ac8` = deployed).

| # | Current behaviour | Evidence (file:line) | Ver |
|---|---|---|---|
| C1 | The area-chip candidate set is every heating-kind device. | `public/js/flows.js:86` — `heatingZones() = state.workspace.devices.filter(d => d.kind === 'heating')` | code(deployed) |
| C2 | One chip is rendered per heating device; the chip label is `esc(z.zone)`; the chosen chip is stored only as the **list index** `zi`. | `public/js/flows.js:231-232` — `zones.map((z,i) => <button ... onclick="flowStep({zi:${i}})">${esc(z.zone)}</button>)` | code(deployed) |
| C3 | The chosen chip is dereferenced back to **exactly one device** by that index. | `public/js/flows.js:234` — `const z = zones[f.data.zi];` (then `z.telemetry`, `z.online`, `z.deviceId`, `z.deviceType` are all read off that single device) | code(deployed) |
| C4 | The confirmed area line echoes the same raw label. | `public/js/flows.js:239` — `doneLine('Area: <b>${esc(z.zone)}</b>')` | code(deployed) |
| C5 | `zone` is derived as label → zone-attr → site-attr → name. For heating devices the TB `label` is a hardware serial, so this is what the handler sees. | `services/tb-device.js:338` — `zone` takes the first non-empty of `label`, `zone`, `site`, `name` | code(deployed) |
| C6 | All Salus rows AND the Intesis row are typed `kind:'heating'`; the gateway row is typed `kind:'gateway'`, and it is **listed after** the Salus rows. | `services/tb-device.js:152-162` — `ASSET_INTENT`: `salusit700` (:153), `salusit500` (:154), `salus` (:155), `intesis/ac/aircon` (:156) … `gateway/r10a/dragino/gw` (:161) | code(deployed) |
| C7 | Name-token classification returns the **first** matching row (substring for tokens >3 chars; exact-only for ≤3). So a device whose name carries a `salus*` token is typed `heating` before the `gateway` row is ever reached. | `services/tb-device.js:252-270` (`matchAssetIntent`); substring pass `:256-261`, `exactOnly = at.length <= 3` `:258` | code(deployed) |
| C8 | Classification is capability-first: telemetry switch/setpoint signals set intent first; a device with no such signal (a gateway) falls through to the name-token path above. | `services/tb-device.js:199-233` (`classifyDevice`); telemetry-first `:205-211`; name path `:214-229`; fallback `:231-232` | code(deployed) |
| C9 | Aircon (Intesis) setpoint control **is** offered today: in the heating flow, "Warmer"/"Cooler" on an Intesis device calls `openControl(z,'up'/'down')`, a setpoint change. | `public/js/flows.js:273-277` (`need==='warm'/'cool'` → `openControl`); dispatch stepper `public/js/control.js:62` | code(deployed) |
| C10 | Intesis **off** is already redirected to capture-and-escalate (not fired) — mode control is held. | `public/js/flows.js:284-292` (`z.deviceType === 'intesis'` → `outcomeCaptured('intesisoff', …)`) | code(deployed) |
| C11 | The registry still grants Intesis a `setpoint` command (mode already dropped for the D10 safety hold). | `services/registry.js:32-45` — `'intesis': { commands: ['setpoint'], deviceRange:{min:16,max:32} }` | code(deployed) |
| C12 | Control is globally gated by the write-lock: `openControl` refuses and redirects to capture when writes are disabled. | `public/js/control.js:51-57` (`writesDisabled` → blocked modal) | code(deployed) |

**The central design consequence (B1).** C2 + C3 are the load-bearing pair: the flow encodes the chosen area as an **index into the device list** and reads back **one device**. Collapsing N chips → 2 fixed areas severs that one-to-one link — "Accommodation" may be three thermostats. Every downstream read in the heating flow (`z.telemetry`, temperature/setpoint at `flows.js:234-241`, online check, `openControl(z,…)`) assumes a single `z`. **Defining the area→device fan-out for read and (latent) control is the primary Design task**, not a cosmetic relabel.

---

## 3. Gateway mis-classification — root cause (firsthand)

**Symptom.** 225 paired Salus gateways (name pattern `gk-{site}-salusit700-gateway-1`, `doc`) appear as their own selectable "area" chips, carrying no useful location.

**Root cause (code-confirmed).** A gateway device carries no switch/setpoint telemetry, so the capability-first pass leaves `intent = null` (`tb-device.js:205-211`). Classification then falls to the name-token path (`:214`), which calls `matchAssetIntent` (`:252-270`). That function returns the **first** `ASSET_INTENT` row whose token substring-matches — and the rows are ordered with the Salus rows first (`:153-155`) and the gateway row last (`:161`). The gateway's name tokenises (split on `[-\s]+`, `:201`) to include `salusit700`, which matches the very first row (`:153`) exactly → the device is typed `kind:'heating'` and `matchAssetIntent` returns **before the gateway row at `:161` is ever tested**. So the gateway is mis-typed heating, `heatingZones()` (`flows.js:86`) includes it, and it renders as an area chip (`flows.js:231-232`).

**Fix shape (for Design/Build, not implemented here).** Either (a) make gateway detection win over the Salus name-token (e.g. test the `gateway`/`r10a`/`dragino`/`gw` tokens before the Salus rows, or exclude a device whose name also carries a `gateway` token), or (b) exclude `kind:'gateway'` from the area candidate set at `heatingZones()`. Acceptance criterion (3) is satisfied by either. Note the ≤3-char exact-only guard (`:258`) already prevents `gw` bleeding into other names — the defect is purely the row-order first-match against `salusit700`.

---

## 4. The two-area target model — mapping rules and grounding

Only **Accommodation** and/or **Bar/Restaurant** ever surface (only those present at the site). Mapping rules, each with where its attribute source is confirmed:

| Device family | Estate count | Location attribute source | Maps to | Coverage / caveat | Ver |
|---|---|---|---|---|---|
| **Salus iT700** (main accommodation controller, one per site) | 225 thermostats (+225 paired gateways) | CLIENT_SCOPE `salusLocation` (human-entered); values dominated by accommodation/staff-flat/manager-flat terms | **Accommodation (100%)** per James's decision | `salusLocation` populated 219/225 (97%), but 133 hold the useless default `"IT700"` — only ~80 (~40%) genuinely descriptive. The 100% rule sidesteps the label-quality problem: iT700 → Accommodation regardless of `salusLocation` text. | doc |
| **Salus iT500** (+ `gk_*farm_salus_*` units) | 347 iT500 + 383 farm-salus | CLIENT_SCOPE `site` code, e.g. `(1771-f-1)`, `(5670-s-1)` — structured letter code | **Accommodation** if letter ∈ {s,f}; **Bar/Restaurant** if letter ∈ {r,b} | `site` code coverage ~93% of iT500 (`doc`); the letter scheme **s/f/r/b is UNVERIFIED** (B2 — Sam to confirm). ~7% with no code need a fallback (§6). | doc |
| **Intesis / AC** | 403 units | **None** — no `label`, no `salusLocation`, no location attribute of any kind (sampled units empty on every scope) | **Removed from the area model entirely** (§5) | This absence is *why* aircon control is removed and referred by ticket — no honest area can be derived. | doc |
| **Salus gateways** | 225 | None (0%) | **Never a selectable area** (§3 fix) | Currently mis-typed heating (§3). | doc |
| Ambient temp sensors | 104 | SERVER_SCOPE `friendlyName` / `label` ("Kitchen-temp", "Bar Temperature", "Restaurant Temp") | Not area chips — a *vocabulary* source only | Different hardware from the heating controllers; useful as a controlled-vocabulary reference, not a drop-in relabel. | doc |

**Proposed mapping logic (for Design to realise, not built here):**
- `deviceType === 'salus-it700'` → **Accommodation**.
- `deviceType === 'salus-it500'` → parse the site-code letter → **Accommodation** (s/f) or **Bar/Restaurant** (r/b); no code → fallback (B2/§6).
- `deviceType === 'intesis'` → **excluded** from the area model (§5).
- `kind === 'gateway'` → **excluded** (§3).
- The area chips shown = the distinct set of {Accommodation, Bar/Restaurant} actually present after mapping the site's controllable heating devices.

**Where the iT500 site-code lives in the canonical shape (a Design/Build gap to flag).** The canonical device shape (`tb-device.js:330-350`) does **not** currently surface `salusLocation` or the iT500 `site` code as its own field — `mapTbDevice` folds a location only into `zone` (`:338`, taking the first non-empty of `label`, `zone`, `site`, then `name`). The `site` code is a CLIENT_SCOPE attribute (`doc`), and CLIENT_SCOPE attributes are **not read** by the current inventory path — `fetchTelemetry` reads only latest timeseries + SERVER_SCOPE `active` (`tb-device.js:398-427`). **So the attribute the mapping depends on is not fetched today** — surfacing `salusLocation`/`site` into the canonical shape is itself a Build task, and reading a new attribute scope is a concrete open item for Design (§6, Q4).

---

## 5. Aircon-control removal — impact scope (firsthand, not implemented)

The ticket: aircon (Intesis) has no location tie-back → **remove aircon control from the dash; make aircon a 100% referral via ticket to the IoT support team.** Today Intesis is classified `heating`, so it appears as an area AND offers a setpoint control (C9/C11). Removing control touches exactly four places:

| # | Touch point | What it does today | Change intent (for Build, not done here) | Evidence |
|---|---|---|---|---|
| A1 | Classifier row | Intesis typed `kind:'heating'`, `deviceType:'intesis'` → surfaces as a heating area chip. | Stop Intesis surfacing as a heating area — either re-kind Intesis (e.g. `kind:'aircon'`, excluded from `heatingZones()`) or exclude `deviceType:'intesis'` from the area candidate set. | `tb-device.js:156`, consumed by `flows.js:86` |
| A2 | Classifier setpoint control | `classifyDevice` grants Intesis `setpointDesired` control when a setpoint signal is present → `controllable:true`. | Force Intesis `controllable:false` / `control:null`. | `tb-device.js:207-224,238-240` |
| A3 | Registry entry | `'intesis'` still lists `commands:['setpoint']`. | Remove `setpoint` from the Intesis registry entry (leaving `commands:[]`) so `validateCommand` refuses any Intesis command server-side (defence in depth). | `registry.js:32-45,86` |
| A4 | Heating flow branch | Warmer/Cooler on an Intesis device fires `openControl(z,'up'/'down')` (a setpoint write, C9). Intesis-off already captures (C10). | Replace the Intesis control branch with a **capture-and-refer** outcome (the referral, B3). Extend the existing `intesis-off-held` capture pattern (`flows.js:284-292`) to all aircon intents. | `flows.js:273-277` (control) vs `flows.js:284-292` (already-captures) |

**Net effect:** Intesis never appears as an area (A1), never offers a control (A2/A3), and any aircon request is captured and referred to the IoT team by ticket (A4 + B3). This **reduces** the control surface — fully consistent with the write-lock invariant. The existing `intesis-off` capture (C10) is the template; the referral copy/routing is the one open product point (B3).

> **Anti-reinvention check.** The referral does **not** need a new mechanism: the capture path (`outcomeCaptured` → `POST /api/outcomes`, `flows.js:158-164`) and the `intesis-off-held` capture (`flows.js:286-291`) already exist and already route to the IoT team. Extend them; do not build a parallel referral pipe. B3 only decides whether a distinct label/class is wanted.

---

## 6. Acceptance criteria → what each requires of Design / Build

| AC | Ticket requirement | Needs DESIGN | Build-ready once designed | Evidence anchor |
|---|---|---|---|---|
| **AC1** | "Which area?" presents only Accommodation and/or Bar/Restaurant (only those present), never serials/names. | The area-label mapping (§4) and the fan-out (B1) — chips become area names, not device labels. | Replace `heatingZones()`→per-device chips with per-area chips derived from the §4 mapping. | `flows.js:86,231-232` |
| **AC2** | A chosen area maps to the correct underlying heating device(s) for control/read. | **B1 fan-out semantics** — the central question: read (which temp/setpoint) and control (which device / all). Plus surfacing `salusLocation`/`site` into the canonical shape and reading CLIENT_SCOPE. | Once fan-out is defined: change `zones[f.data.zi]` (single device) to an area→device-set resolution; add the attribute read to `fetchTelemetry`/`mapTbDevice`. | `flows.js:234`; `tb-device.js:330-350,398-427` |
| **AC3** | Gateway devices no longer appear as selectable areas. | Minimal — pick fix (a) row-order/exclusion or (b) exclude `kind:'gateway'` from candidates (§3). | Reorder/guard `matchAssetIntent`, or filter `heatingZones()`. Low complexity. | `tb-device.js:152-162,252-270`; `flows.js:86` |
| **AC4** | Aircon: no control action in the dash; requests captured and referred by ticket. | B3 — confirm referral = existing capture ticket or a distinct class/label. | A1-A4 (§5): re-kind/exclude Intesis, strip its registry command, swap the control branch for capture-and-refer. | `tb-device.js:156`; `registry.js:32-45`; `flows.js:273-292` |

### Still needs Design (decision first)
- **B1** — area→multiple-device fan-out for read and (latent) control. **The gating decision.**
- **B2** — iT500 `s/f/r/b` letter scheme (Sam) + the fallback for the ~7% of iT500 with no `site` code and any site with no descriptive source.
- **B3** — aircon referral mechanism (existing capture vs distinct class).
- **Q4 (Design open item)** — reading a new attribute scope: `salusLocation` (CLIENT_SCOPE) and the iT500 `site` code are **not fetched today** (§4); Design must specify surfacing them into the canonical shape, including cache/latency impact on the per-site read (`tb-device.js:398-427`, 30s cache `:63`).
- **Q5 (Design open item)** — sites with only gateways/temp-sensors and **no controllable heating**: the "no heating on Lighthouse here" branch already exists (`flows.js:230`) and should catch these once gateways/Intesis are excluded — Design to confirm the empty-area copy.

### Build-ready once designed (code paths identified, low/known complexity)
- **AC3 gateway exclusion** — smallest, self-contained (§3).
- **AC4 aircon removal** — A1-A4 are four precise edits (§5); the capture template exists.
- **AC1/AC2 relabel + fan-out** — mechanical once B1/B2 land; the render and resolution points are pinned (C2/C3).

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| iT500 letter scheme guessed wrong (B2) → caller routed to wrong heating. | Medium | High (wrong control/read) | Block hard-wiring until Sam confirms; ship with a conservative fallback (unmapped → show both areas / capture) until confirmed. |
| Area→device fan-out under-specified (B1) → ambiguous read/control when writes later unlock. | Medium | High | Resolve B1 at Design before Build; keep control latent behind the write-lock so any fan-out error is read-only until reviewed. |
| `salusLocation`/`site` not currently fetched (Q4) → added attribute reads slow the per-site query. | Medium | Medium | Batch the CLIENT_SCOPE read alongside the existing concurrent telemetry/SERVER_SCOPE reads (`tb-device.js:398-427`); honour the 30s cache. |
| Aircon removal leaves a site with zero heating areas and no honest message. | Low | Medium | Reuse the existing "no heating on Lighthouse here" branch (`flows.js:230`); Design confirms copy (Q5). |
| Relabel regresses the single-device read for genuine single-device sites. | Low | Medium | Fan-out design must degrade cleanly to the current behaviour when an area = one device. |

---

## 8. Recommended first step

1. **Get the two product decisions in flight now** — B1 (area→device fan-out) with James + Design, and B2 (iT500 letter scheme) with Sam Day. Everything else is mechanical once these land; neither needs any code.
2. **In parallel, Build can take AC3 (gateway exclusion) and AC4 (aircon removal) to Design immediately** — both are self-contained, code-paths pinned (§3, §5), and neither depends on B1/B2. AC3 removes visible junk; AC4 reduces the control surface (write-lock-safe).
3. **Hold AC1/AC2 (the relabel + fan-out) until B1/B2 are answered and Q4 (attribute fetch) is specified** — this is the substantive build and it depends on the decisions above.

Recommended first phase: **AC3 + AC4** (unblocks visible quality and control-surface reduction with no external decision), running in parallel with the **B1/B2 decision-gathering** that unblocks AC1/AC2.

---

*All line numbers cited against branch `discovery/oohdash-82-area-model` off `main` @ `b039ac8` (= deployed HEAD), read firsthand 2026-09-23. Estate counts and attribute-coverage figures are from James's full live-ThingsBoard estate analysis of 2026-09-23 (`AREA-LABELS-FOR-SAM.md`, 12,816 devices), marked `doc`. Writes remain LOCKED — no write-flip is proposed; the aircon change reduces the control surface. This artefact did not edit application source, open a PR, or raise a gate — the Orchestrator governs those.*
