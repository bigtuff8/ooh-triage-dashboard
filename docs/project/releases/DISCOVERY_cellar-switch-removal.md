<!-- gate:contract
SECTION: Blockers and headline finding first
The CTO's ask — "remove the switch capability for Cellar" — is real, code-confirmed, and a blocker on the wide write-flip (OOHDASH-19). But the forensic pass found the proposed fix, as originally framed, would NOT actually remove the button. The dashboard decides "can this be switched?" from the device's TYPE (tuya carries a switch command), not from the classifier's controllable flag — the classifier's controllable/control fields are computed and then thrown away before the device reaches the screen or the write guard. So a fix that only flips controllable:false changes nothing a handler or a write would ever see. This section names that correction and the one thing that must be confirmed on live data (the real cellar device names and profile) before build.
SECTION: What this is
A current-state discovery for stream A of R1: removing the device-control switch capability from refrigeration (Cellar) assets, so a cellar cooling unit can never present a Turn OFF button or accept a switch write. It is discovery only — no code was changed. Every claim is traced to a file line, a live system, or marked UNVERIFIED with the exact probe and owner. Writes stay globally locked (WRITES_DISABLED="true") throughout.
SECTION: The leak, in plain English
Any device whose live telemetry carries a switch reading (switch_1 / switch / switchReported / switchOn) is classified as a controllable Tuya kitchen switch, purely because it can switch — the classifier never looks at whether the thing is a fridge. The words cellar, fridge and freezer are not in the name table that would refine it back to monitor-only. So a cellar cooling unit with an embedded Tuya relay is typed tuya, and every downstream gate reads tuya as switchable: the site view lights the Kitchen tile as controllable, the Kitchen flow draws a Turn OFF button, and the server's write guard accepts a switch command. It is inert TODAY only because all writes are globally locked; it goes live the moment OOHDASH-19 flips.
SECTION: The exclusion signal set and why it is precise
Names the exact signals to key the deny on (refrigeration asset tokens fridge/freezer/chiller/coldroom/refrigeration, the location token cellar, the cellar device profile, and the switch telemetry that is the problem), and proves against the code that the genuinely-controllable switch assets (kitchen, lighting, fans) share none of these tokens — so a precise deny does not over-block real control. It also flags the one real over-block trap: a "cellar light" or "cellar fan" is a controllable circuit that happens to sit in the cellar, and must NOT be swept up by a blunt match on the word cellar.
SECTION: The fix locus and precedence (corrected)
Because controllability travels on deviceType, the deterministic refrigeration deny rule in classifyDevice must reassign the device off the switch-bearing tuya type onto a monitor-only type whose registry commands are empty — not merely set controllable:false. That makes the capabilities list empty at the wire, so no button renders, and makes the server guard reject a switch by construction. A second, independent guard in the registry (reject a switch command for a refrigeration device) is the defence-in-depth backstop. The rule mirrors the existing deterministic non-controllable patterns (Intesis-off-held, hot-water-out-of-scope) and takes precedence over the capability-first switch intent.
SECTION: Dashboard-only or also upstream
Recommends the dashboard-side deterministic deny as the primary, non-negotiable fix (the dashboard must fail closed regardless of what the platform publishes), with an optional, additive upstream ask to Spencer/platform to stop publishing the switch key for the cellar profile. Upstream is hardening, never the thing relied on.
SECTION: Blast radius and the full test surface
Lists every control path that must be regression-proven UNCHANGED (heating setpoint and frost, Intesis-off-held, hot-water boost, Kitchen switch, Lighting switch, Fans switch, registration and kill-switch gates) and the new tests the fix must add — including the two that protect precision: a real kitchen/lighting/fan switch stays controllable, and a cellar-light is not over-blocked. Fail-closed is the governing principle: when in doubt, monitor-only.
SECTION: Requirements, options, risks and handoffs
The curatable requirements suite (each item keep/cut/defer independently), the real options with trade-offs, the risk register, and the CX success criteria, data scope and end-to-end test scope handed to the design doer.
SECTION: Jira and next steps
No existing OOHDASH issue covers this stream; a proposed issue is captured for naming confirmation (not created). The recommended first move is the live device-name/profile probe that turns the one UNVERIFIED signal into a confirmed exclusion key, because the fix cannot be built precisely without it.
DECISION: Accept this discovery and proceed to design of the refrigeration switch-deny? | Accept — proceed to design | Request changes
DETAIL: The leak is code-confirmed and the fix axis is corrected (deviceType, not the discarded controllable flag). One signal — the live cellar device naming and profile — is UNVERIFIED and is the first design/build input; it does not block accepting discovery.
-->

# Discovery — Remove the device-control switch capability from refrigeration (Cellar) assets

**Release:** OOH Triage Dashboard — R1 · **Stream:** A (cellar switch removal) · **Stage:** Discovery · **Date:** 2026-09-23
**Repo (verified):** `C:\repos\ooh-triage-dashboard`, working branch `docs/bau-support-discovery`, app **v1.2.4** (`package.json:3`), `WRITES_DISABLED="true"` (`k8s/deployment.yaml:74-75`), `SMS_PROVIDER="log"`.
**Origin:** CTO Jonathan Wilkinson, email 2026-09-21 ("Could you please remove the switch capability for Cellar"), recorded in memory `ooh-cellar-switch-remove-directive`.
**Method:** verified against deployed source on the working tree + the Central Integration Repository + live Jira. Anything not confirmable firsthand is marked **UNVERIFIED** with the exact probe and owner. No code was changed — this is discovery only.

---

## 0. Blockers and the headline correction (read first)

- **HEADLINE CORRECTION (verified).** The directive's originally-recorded fix — "force `controllable:false` and `control:null` in `classifyDevice`" — is **necessary but NOT sufficient, and on its own would change nothing a handler or a write path ever sees.** Controllability is decided downstream from the device's **`deviceType`**, not from the classifier's `controllable`/`control` fields. Those fields are computed in `classifyDevice` (`services/tb-device.js:236-247`) and then **dropped** by `mapTbDevice`, which emits only `deviceType`/`kind` and never `controllable`/`control` (`services/tb-device.js:330-350`). Both the client render gate and the server write guard read capabilities from the registry keyed on `deviceType` (`routes/api.js:154`, `services/registry.js:80-82`). So the real fix must move the device off the switch-bearing `tuya` type — see §3.

- **BLOCKER (UNVERIFIED signal — owner: platform read, via James/Spencer creds).** The exact **live cellar device naming and profile string** are not confirmable from this repo. The fix keys on refrigeration signals; those signals must be read off real cellar devices before build so the exclusion is precise and complete. Probe in §2. This does **not** block accepting the discovery — it is the first design/build input.

- **INTERLOCK (context).** While `WRITES_DISABLED="true"` the leak is inert. If **OOHDASH-19** flips writes on **without** this fix, a handler could switch a cellar cooling unit OFF — the exact CTO-flagged stock-loss risk. This stream therefore **blocks the wide OOHDASH-19 enable**. (A scoped single-device heating-setpoint proof can still proceed independently, kill-switch ready.)

---

## 1. The leak, verified end-to-end

The controllability decision for a switch travels entirely on **`deviceType` → registry commands**. Traced step by step against the deployed source:

- **Classify (capability-first).** `classifyDevice` sets, for ANY device whose telemetry carries a switch key, `deviceType:'tuya'`, `kind:'kitchen'`, controllable, `control:{switchDesired}` (`services/tb-device.js:205-206`). `hasSwitchSignal` fires on any of `switchReported`/`switchOn`/`switch_1`/`switch` (`services/tb-device.js:184-187`). The tokens `cellar`/`fridge`/`freezer` are **absent** from the `ASSET_INTENT` name table (`services/tb-device.js:152-162`), so name refinement never pulls a cellar unit back to monitor-only — it stays typed `tuya`.
- **Map (drops the flags).** `mapTbDevice` emits `deviceType: cls.deviceType` and `kind: cls.kind` but **not** `controllable`/`control` (`services/tb-device.js:336-349`). From here on, nothing reads the classifier's controllable verdict.
- **Serialise (registry-derived capabilities).** `workspacePayload` attaches `capabilities: registry.capabilitiesFor(d.deviceType)?.commands` (`routes/api.js:154`). For `tuya` that is `['switch']` (`services/registry.js:47`). It also sets `registered: d._demo !== 'unregistered'` (`routes/api.js:159`) — live inventory has no `_demo`, so a live cellar reads `registered:true`.
- **Scope tile lights up.** `switchControllable(site,'kitchen')` returns true when any `kind:'kitchen'` device's registry commands include `switch` (`routes/api.js:133-134`), so the Kitchen scope tile flips from `mon` to `ctl` (`routes/api.js:139`).
- **Client renders a Turn OFF button.** `canSwitch(d)` = `capabilities.includes('switch') && online && registered` (`public/js/flows.js:201-203`); the Kitchen flow maps every `kind:'kitchen'` device through `switchButtons` (`public/js/flows.js:372,381`), which draws **Turn OFF** for a unit reading ON (`public/js/flows.js:210-216`) → `startSwitch` → `openControl(dev,'switchoff')` (`public/js/flows.js:219-223`).
- **Server write guard accepts it.** `validateCommand(device,'switch',false)` checks `entry.commands.includes('switch')` where `entry` is the `tuya` registry row → passes, returns `{attribute:'switchDesired', value:false}` (`services/registry.js:99-105`). The dispatch path then writes `switchDesired=false` (`services/control.js:89-90,122`) — cellar cooling OFF.

**The fridge flow itself is clean and not the leak.** The dedicated `fridge` renderer is hard-coded monitor-only (P1 stock-at-risk / query-only), with no control affordance (`public/js/flows.js:468-492`). The leak is that a switch-bearing cellar is classified `kind:'kitchen'`, so it surfaces in the **Kitchen** flow, never the fridge flow.

**Verdict:** the leak is real and the effective control axis is `deviceType`, confirmed at both the render gate and the write guard.

---

## 2. Crux 1 — the exclusion signal set, and proof it is precise

**Signals to key the refrigeration deny on** (in precedence order):

- **Refrigeration asset tokens (unambiguous):** `fridge`, `freezer`, `chiller`, `coldroom` / `cold-room`, `refrigeration`, `refrig`. These name the asset itself and always mean monitor-only refrigeration.
- **Location token `cellar`** — but qualified (see over-block trap below): `cellar` alone, or `cellar` + a cooling/refrigeration word, means cellar cooling (a refrigeration asset). `cellar` + a controllable asset token (`light`/`lighting`/`fan`/`switch`/`socket`) does **not**.
- **Device profile** — the cellar/refrigeration profile string, if one exists (e.g. a `cellar`/`fridge` profile). **UNVERIFIED** from this repo (see probe). Note the codebase deliberately does **not** classify controllability from the profile label today (C7, `services/tb-device.js:196`); using the profile purely as a *deny* signal is a safe, additive departure, but the exact string must be confirmed.
- **The switch telemetry itself** (`switch_1` etc.) — this is the problem signal; the deny rule exists precisely to override it for refrigeration.

**Proof the deny does not over-block genuine control (verified against `ASSET_INTENT`, `services/tb-device.js:152-162`).** The genuinely-controllable switch assets are matched by these tokens: `fryer, grill, bainmarie, potwash, kitchen, oven, dishwash` (kitchen); `powerpause, tongou, owon, contactor, switch, relay` (power/kitchen); `light, lighting, lgt` (lighting); `extractfan, fan, extractor` (fans). **None** of these contains or collides with `cellar/fridge/freezer/chiller/coldroom/refrigeration`. The token spaces are disjoint, so a refrigeration deny keyed on the tokens above cannot catch a real kitchen/lighting/fan switch. The bounded fuzzy pass (Levenshtein ≤2, `services/tb-device.js:263-268`) is not a collision risk either — the refrigeration tokens are all edit-distance ≫2 from every controllable token — but the deny rule must run with **precedence over** `matchAssetIntent` so nothing fuzzy-pulls a fridge into `kitchen` first.

**The one real over-block trap (must be designed for).** A **`cellar light`, `cellar fan`, or `cellar socket`** is a controllable circuit that merely sits in the cellar — it must stay switchable. A blunt "name contains `cellar` → monitor-only" rule would wrongly kill legitimate control. **Precision requirement:** an explicit controllable asset token in the name (`light`/`fan`/`fryer`/etc.) must win over the bare `cellar` location token; the deny fires only when the refrigeration/cellar-cooling intent is the asset and no competing controllable asset token is present. This is exactly what the live-name probe must characterise.

**Probe (owner: platform read via James/Spencer TB creds — CIR §6 auth table).** Query TB for devices on one or more cellar-equipped sites and record, per device: the raw **name**, the **profile/type** string, and the **telemetry keys** present (does a cellar unit carry `switch_1`?). This turns the profile signal and the `cellar`-qualifier rule from UNVERIFIED into a confirmed, complete exclusion key. Fail-closed until then: treat any refrigeration-token device as monitor-only.

---

## 3. Crux 2 — fix locus and precedence (corrected for the deviceType axis)

**Primary fix — deterministic refrigeration deny in `classifyDevice` that reassigns `deviceType`.** Because controllability travels on `deviceType`, the rule must do more than set `controllable:false`: it must reassign the device onto a **monitor-only device type whose registry `commands` are empty**, so the leak is closed at every downstream gate automatically.

- **Locus:** `classifyDevice` (`services/tb-device.js:199-249`), as a deterministic branch that runs **before / with precedence over** the capability-first switch intent (`:205-206`) and over `matchAssetIntent` (`:214`). This mirrors the existing deterministic non-controllable patterns — Intesis-off-held (`public/js/flows.js:284-292`) and hot-water-out-of-scope (presence-driven `hwboost`, `routes/api.js:120-121`) — which force a safe outcome regardless of a raw capability.
- **Effect:** for a refrigeration-signal device, set a refrigeration `kind` (e.g. `fridge`, so it is not `kitchen` and never enters the Kitchen flow / Kitchen scope test at `routes/api.js:133-139`) and a **monitor-only `deviceType`** — either a new registry key (e.g. `refrigeration`) with `commands: []`, or an existing empty-command type. Also set `controllable:false`/`control:null` for internal consistency. With empty commands, `routes/api.js:154` yields `capabilities: []` → `canSwitch` false → **no button**; and `validateCommand` returns "does not support remote on/off switching" → **write rejected**.
- **Precedence rule:** refrigeration deny > capability-first switch intent > name asset intent. The `cellar`-qualifier exception (§2) must let an explicit controllable asset token override the location token so cellar-lights stay switchable.

**Defence-in-depth — registry-side guard (`services/registry.js`).** Independently of classification, harden the write guard so a refrigeration device can never accept a switch: add a `refrigeration` device type with `commands: []` (so `validateCommand`'s `switch` case rejects by construction, `:99-105`), and/or add an explicit refusal in the `switch` case when the device is refrigeration-kinded. This is the backstop the header comment already envisages ("primary guard … bridge edge-gating is the backstop", `services/registry.js:1-6`) — here the registry is the second, independent guard behind the classifier.

**Do NOT** attempt this via config. Kill-switches are all-or-nothing (global/per-site), not per-device/per-capability, so there is no config-only way to remove just the cellar switch (memory (c)). This is a code change delivered as an image release (self-serve per memory pod-roll note).

---

## 4. Crux 3 — dashboard-only vs also upstream

- **Recommendation: dashboard-side deterministic deny is the PRIMARY, non-negotiable fix.** The dashboard must fail closed regardless of what the bridge/TB publish — it cannot depend on an upstream promise to withhold a signal. Both the classifier reassignment and the registry backstop live in this repo and are self-serve to release.
- **Optional additive upstream ask (owner: Spencer / platform):** the bridge / ThingsBoard stop publishing the switch key for the cellar profile at source. This reduces the signal upstream and is good hygiene, but it is **hardening, not the fix** — it is out of this repo, unversioned, and must never be the thing relied on. Raise it as a low-priority platform note, not a dependency.

---

## 5. Crux 4 — blast radius and the full test surface

**Must remain UNCHANGED and be regression-proven (every existing control path):**

- **Heating — setpoint (warmer/cooler):** Salus it500/it700 `setpointDesired`, ±3°C/25°C window (`public/js/flows.js:273-277`; `services/registry.js:80-94`).
- **Heating — frost-hold 5°C:** `setpointDesired` = frostSetpoint (`public/js/flows.js:304`; `services/registry.js:95-98`).
- **Heating — "turn off":** Salus → frost recommendation; Intesis → **Intesis-off-held** capture, no write fired (`public/js/flows.js:278-293`). Must stay held.
- **Hot water — boost:** presence-driven `hwboost` on a real DHW device only (`routes/api.js:120-121`; `public/js/flows.js:327-350`). Currently never live; must stay exactly as-is.
- **Kitchen — switch:** a genuine kitchen circuit (tuya, fryer/oven/etc.) stays switchable (`public/js/flows.js:371-385`).
- **Lighting — switch:** external lighting tuya stays switchable (`routes/api.js:140`; lighting flow).
- **Fans — switch:** extractor fan tuya stays switchable (`public/js/flows.js:441-455`).
- **Guards:** registration gate (`services/control.js:84-86`), kill-switch / `WRITES_DISABLED` 423 (`services/control.js:68-70`), guardrail window (`services/control.js:88-90`) — all unchanged.
- **Monitor-only refrigeration (fridge flow):** stays monitor-only (`public/js/flows.js:468-492`) — and a switch-bearing cellar must now ALSO be monitor-only and absent from the Kitchen flow/scope.

**New tests the fix must ADD:**

- A cellar/fridge/freezer device **with `switch_1` present** classifies monitor-only: `controllable:false`, `deviceType` carries **no** switch command, `kind` is not `kitchen`, and the serialised `capabilities` excludes `switch`.
- That device renders **no Turn OFF button** in the Kitchen flow (`canSwitch` false) and does not appear as a Kitchen circuit; the **Kitchen scope tile** does not flip to `ctl` on a cellar-only site.
- Server **`validateCommand` rejects** a `switch` command against that device (defence-in-depth) — even if a crafted request reaches dispatch.
- **Precision guard 1:** a real kitchen / lighting / fan tuya switch is **unchanged** — still controllable end to end.
- **Precision guard 2 (over-block):** a `cellar light` / `cellar fan` (controllable circuit) is **not** over-blocked — remains switchable.
- **Fail-closed default:** an ambiguous refrigeration-signal device with no clear controllable token defaults to monitor-only.

---

## 6. Curatable requirements suite (keep / cut / defer per item)

- **CR1 — Deterministic refrigeration deny in `classifyDevice` reassigning `deviceType` to a no-command monitor-only type.** Outcome: a cellar cooling unit can never present a switch or accept a switch write. Src §1, §3. Primary; blocks OOHDASH-19.
- **CR2 — Registry backstop: a `refrigeration` device type with empty commands and/or an explicit switch-refusal for refrigeration-kinded devices.** Outcome: defence-in-depth — the write guard refuses independently of classification. Src §3.
- **CR3 — Confirm the live cellar device naming + profile + telemetry keys.** Outcome: the exclusion key is precise and complete, not guessed. Src §2. **UNVERIFIED — first build input.**
- **CR4 — Precision rule: explicit controllable asset token overrides the bare `cellar` location token.** Outcome: cellar-lights/fans stay controllable; no over-block. Src §2.
- **CR5 — Regression suite proving all existing control paths unchanged (heating setpoint/frost, Intesis-off-held, HW boost, kitchen/lighting/fan switch, registration + kill-switch + guardrail).** Outcome: the fix removes only the cellar switch and nothing else. Src §5.
- **CR6 — Optional upstream note to platform: stop publishing the switch key for the cellar profile.** Outcome: signal reduced at source; hardening only. Src §4. Deferrable.
- **CR7 — Raise the OOHDASH tracking issue for this stream and link it as a blocker of OOHDASH-19.** Outcome: the interlock is visible and governed. Src §10.

---

## 7. Options with traceability

- **Fix-axis option A — reassign `deviceType` to a no-command monitor-only type (RECOMMENDED).** Serves CR1/CR2/CR5. Closes the leak at every downstream gate by construction (render + scope + write guard), because they all read `deviceType`. Cost: one classifier branch + one registry entry. Right because it fixes the axis that is actually read.
- **Fix-axis option B — keep `deviceType:'tuya'` and add a separate refrigeration flag consumed at each gate.** Serves CR1 but requires touching the API serialiser, the client `canSwitch`, the scope test, and the write guard to read a new flag. Higher surface, more places to miss, contradicts the existing "controllability = deviceType" invariant. Not recommended.
- **Signal-key option — asset tokens only vs asset tokens + cellar-qualifier + profile.** Tokens-only is simplest but may miss a cellar unit named only by location; adding the qualified `cellar` rule + profile (CR3/CR4) is more complete but needs the live probe. Recommended: implement the token deny now, extend with the confirmed profile/qualifier once CR3 lands; fail-closed in the interim.
- **Scope option — dashboard-only vs dashboard + upstream.** Dashboard-side is mandatory and sufficient for safety; upstream (CR6) is additive hardening. Recommended: dashboard-side now, upstream as a low-priority platform note.

---

## 8. Risk register

- **Over-block a controllable cellar-light/fan** — likelihood medium if keyed bluntly on `cellar`; impact medium (a legitimate control silently removed). Mitigation: CR4 precision rule + CR3 live names + precision test.
- **Under-block: a cellar named by an unforeseen token/profile still classifies switchable** — likelihood medium while CR3 UNVERIFIED; impact high (the exact CTO risk survives). Mitigation: fail-closed default (CR3), registry backstop (CR2), broad refrigeration token set.
- **Regression to a real control path** — likelihood low; impact high (breaks working kitchen/lighting/fan/heating control). Mitigation: CR5 full regression suite before merge.
- **Fix merged but never in effect at runtime ("Live means merged, not in-effect")** — likelihood medium given prior harness experience; impact high (OOHDASH-19 flipped believing cellar is safe when the running image is unchanged). Mitigation: the release must **observe** the fix running (a cellar device shows no switch button in the live pod), not just merge it, before OOHDASH-19 flips.
- **OOHDASH-19 flips without this fix landing** — likelihood governed by the release gate; impact high (stock-loss). Mitigation: CR7 link as an explicit blocker of OOHDASH-19.

---

## 9. Handoffs to design

**Data scope (design turns into the data dictionary).**
- Entity `device` gains a confirmed **refrigeration classification**: the deciding fields are `name` (tokens), `profile`/`type` (raw TB type), and `telemetry` switch keys — with a new/reused monitor-only `deviceType` and a refrigeration `kind`. Origin: TB inventory via `mapTbDevice` (`services/tb-device.js:330-350`). Catalogue the confirmed cellar profile string (CR3) and the refrigeration token set.
- No new writable field is introduced; the point is the **removal** of a writable capability for one device class.

**CX success criteria (design realises these).**
- **Persona–journey:** an OOH handler on a live call about a warm/failing cellar or fridge. Journey: search site → confirm site → read live refrigeration state → understand it is **monitored, not controllable** → route to the correct outcome (P1 stock-at-risk, or query/capture). The handler must never be offered, and never believe they have, a remote off/on for a cooling unit.
- **Reassurance vs friction:** refrigeration is a **monitor-only, get-out-of-the-way** experience — no control affordance, clear "monitored not adjustable" labelling (the pattern already exists at `public/js/views.js:152-162` and the fridge flow). The high-stakes checkpoint for genuine switches (kitchen/lighting/fan) is unchanged. A cellar unit must present identically to the honest fridge flow, not as a Kitchen circuit.
- **"Great looks like…":** a handler looking at any cellar/fridge/freezer device sees only live temperature and status and a clear monitored-only message; there is no Turn OFF button anywhere for a cooling unit; and a genuine cellar-light or cellar-fan is still switchable where it legitimately can be.

**End-to-end test scope (design turns into scripts + data).** Prove, once built: a switch-bearing cellar device shows monitored-only with no switch button and rejects a crafted switch write; a real kitchen/lighting/fan switch is unchanged; a cellar-light stays switchable; the fridge flow (P1/query) is unchanged; heating setpoint/frost, Intesis-off-held and HW-boost are unchanged; and the fix is **observed running in the live pod** (not merely merged) before any write-flip.

---

## 10. Crux 5 — Jira

- **Searched (verified 2026-09-23):** no existing OOHDASH issue covers cellar/refrigeration switch removal (JQL over `text ~ cellar / "switch capability"` and `summary ~ refrigeration` returned only unrelated backlog items OOHDASH-74, OOHDASH-69). OOHDASH-19 (write-flip, To Do) and OOHDASH-18 (write cred, To Do) confirmed.
- **Proposed issue (NOT created — awaiting James's naming/convention confirmation):**
  - Summary: *"Remove device-control switch capability for refrigeration (Cellar) assets — classify switch-bearing cellar/fridge/freezer units monitor-only"*.
  - Type: Task (or Bug — it is a latent safety defect; James to choose).
  - Body seed: the leak trace (§1), the fix locus + precedence (§3), the test surface (§5).
  - **Link: blocks OOHDASH-19** (records the interlock).

---

## 11. Recommended next step

**First move: run the live cellar device probe (CR3)** — read the real cellar/fridge/freezer device names, profile strings, and telemetry keys off TB for cellar-equipped sites (owner: platform read via James/Spencer creds, CIR §6). This is the one UNVERIFIED input, and the deny rule cannot be built precisely or completely without it. In parallel, design can proceed on the confirmed axis: the deterministic `deviceType` reassignment in `classifyDevice` plus the registry backstop, with the fail-closed default covering the gap until CR3 lands. Confirm the Jira naming (§10) and link it as a blocker of OOHDASH-19. Writes stay locked (`WRITES_DISABLED="true"`) throughout; the fix must be **observed running** in the live pod before OOHDASH-19 is even considered.

---

*All line numbers cited against the working tree at v1.2.4, 2026-09-23. UNVERIFIED items name the exact probe + owner. Discovery only — no code changed. This artefact does not invoke reviewers or the next stage; the orchestrator governs the Discovery gate.*
