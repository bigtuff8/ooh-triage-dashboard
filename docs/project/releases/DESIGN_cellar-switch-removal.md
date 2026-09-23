<!-- gate:contract
SECTION: What this is
This is the build-ready design for Stream A of R1: removing the device-control switch capability from refrigeration (Cellar) assets, so a cellar cooling unit can never present a Turn OFF button or accept a switch write. It turns the signed-off discovery into an unambiguous spec — the exact deny rule and where it sits, the new registry type and its backstop, the behaviour at every layer, the full test design with named files, and a before/after mockup. It is design only: no product code was changed, nothing is committed, no gate is invoked.
SECTION: The one-paragraph fix
Controllability travels on the device's TYPE through the registry, not on the classifier's controllable flag (which is computed and then thrown away). So the fix adds a deterministic refrigeration deny at the very top of classifyDevice that reassigns a refrigeration device onto a brand-new monitor-only type, `refrigeration`, whose registry command list is empty. Empty commands means the button never renders and the server write guard rejects a switch by construction. A second, independent guard in the registry refuses a switch for a refrigeration device even if classification were somehow bypassed. The deny runs before — and takes precedence over — both the capability-first switch intent and the name-based asset match.
SECTION: The deny rule and its precision
The rule fires on refrigeration appliance words (fridge, freezer, chiller, cold room in every spelling — coldroom, cold-room, cold_room, cold room — refrigeration, refrig), on the location word cellar, and — once confirmed on live data — on the cellar device profile. Appliance words always mean monitor-only. The location word cellar (and the profile) mean monitor-only UNLESS the name also carries an explicit controllable-appliance word — light, fan, socket, or a kitchen appliance — because a cellar light or cellar fan is a genuine switchable circuit that merely sits in the cellar and must stay controllable. This revision fixed two matching bugs the reviewer caught: (1) the earlier draft mis-described how names are cleaned up, so hyphenated/underscored "cold-room" would have slipped through — every spelling is now matched; (2) a glued name like "cellarfan-1" was wrongly being blocked because short words like "fan" were matched too strictly — glued controllable forms (cellarfan, cellarlgt) are now recognised as switchable, matching what the mockup shows. One honest limitation is now stated openly: if any controllable circuit were ever named with a refrigeration word in it (e.g. "fridge-light"), it would be treated as monitor-only — we assume none exist and verify that against live names before build.
SECTION: What changes at each layer
Classification: a switch-bearing cellar unit comes out typed `refrigeration`, kind `fridge`, not controllable. The control surface (the API workspace payload) then reports its capabilities as an empty list. The client draws no Turn OFF button and the Kitchen scope tile no longer lights up as controllable on a cellar-only site. The server write guard rejects any switch command aimed at a refrigeration device, failing closed. A genuine kitchen, lighting or fan switch is untouched, and a cellar light stays switchable.
SECTION: The safety interlock
This fix must land, and be OBSERVED running in the live pod, before the wide device-write flip (OOHDASH-19). Writes stay globally locked (WRITES_DISABLED stays "true") throughout design, build and test — the fix is what makes it safe to consider un-locking later, but it does not itself un-lock anything. The deny is designed to fail closed: when a device looks like refrigeration and there is no clear controllable reason to allow a switch, it is treated as monitor-only. The reviewer's concern that this ordering was only a memory note is now addressed by a structural interlock (proposed, pending your confirmation): a named live sign-off file, a CI check that blocks the write-flip until that sign-off exists for the deployed image, and a boot-time guard that keeps writes locked unless the refrigeration fix is actually present in the running image. The "observed live" check needs a named owner — proposed as you (or IoT Support / Sam Day) — confirming a specified cellar device shows no Turn OFF button in the live pod; please confirm the owner at gate.
SECTION: How it is tested
New tests prove the add cases (a switch-bearing cellar becomes monitor-only with no button and a rejected write; a cellar light is NOT over-blocked; an ambiguous refrigeration device defaults to monitor-only) and a named regression set proves everything else stays exactly as it is (heating setpoint and frost, Intesis-off-held, hot-water boost, kitchen/lighting/fan switching, the registration, kill-switch and guardrail gates, and the monitor-only fridge flow). The test files to touch are named in the design.
SECTION: The one thing still to confirm
The exact live cellar device names, profile string and telemetry keys are unverified from the repo and need a read-only ThingsBoard probe (CR3, the first build step). The design stays fail-closed until then: the profile signal is left empty so it can never wrongly over-block on a guessed string, the name-token deny fully protects every recognised refrigeration name, and the registry backstop refuses switches independently. Two safeguards were added so the probe cannot be silently skipped: a code FIXME plus a test that fails the build if the probe result lands but the profile list is left empty, and a CR3 checklist that also verifies no controllable circuit is named with a refrigeration word. Three decisions in this revision are marked "proposed — pending your confirmation at gate": the tightening that drops bare switch/relay from the controllable list (gated on a fixture proving no real site is affected), the structural write-flip interlock, and the named owner for the live sign-off. One handler-facing limitation is written into the release notes: until the probe lands, a cellar unit named only by an opaque code may still show a Turn OFF button (harmless while writes stay locked), and Turn OFF presence may look inconsistent across sites.
DECISION: Accept this design and proceed to build the refrigeration switch-deny? | Accept — proceed to build | Request changes
DETAIL: The fix axis (deviceType reassignment + registry backstop), the deny predicate with its cellar-light carve-out, the per-layer behaviour and the full test design are all specified against verified source. One input — the live cellar naming/profile probe (CR3) — remains open and is the first build step; the design is fail-closed until it lands and does not block acceptance.
-->

# Design — Remove the device-control switch capability from refrigeration (Cellar) assets

**Release:** OOH Triage Dashboard — R1 · **Stream:** A (cellar switch removal) · **Stage:** Design · **Date:** 2026-09-23
**Repo (verified):** `C:\repos\ooh-triage-dashboard` (owner bigtuff8), app **v1.2.4**, `WRITES_DISABLED="true"`, `SMS_PROVIDER="log"`.
**Input:** signed-off, merged discovery `docs/project/releases/DISCOVERY_cellar-switch-removal.md`; cross-stream verdict `docs/project/releases/CROSS-STREAM_cellar-vs-p1-sms.md` (Stream A is fully independent of Stream B).
**Method:** every code claim verified firsthand against the working tree at v1.2.4, cited to `file:line`. The one unverified input (live cellar naming/profile) is marked **UNVERIFIED** with its probe and owner. No code was changed — this is design only. The orchestrator governs the gate; this artefact does not invoke reviewers, open a PR, commit, or flip anything.

---

## 1. Design intent (what "correct" looks like)

A refrigeration asset — a cellar cooling unit, a fridge, a freezer, a chiller, a cold room — must be **monitor-only** everywhere in the tool. Specifically:

- It must **never** present a Turn OFF (or Turn ON) button to a handler.
- It must **never** cause a control scope tile to read "Controllable from here".
- A crafted switch command aimed at it must be **rejected at the server**, fail-closed, before dispatch.
- A genuine controllable circuit — a kitchen fryer, external lighting, an extractor fan, **and a cellar light or cellar fan** — must be **completely unaffected**.

This is the honest model the handler already expects: refrigeration is "we watch the temperature, we don't switch the cooling". The leak today is that a cellar unit carrying an embedded switch signal is mis-typed as a controllable kitchen switch. The fix removes that one mis-classification and nothing else.

---

## 2. The fix axis (verified) and why the obvious fix is not enough

Controllability travels on **`deviceType`** through the registry, **not** on the classifier's `controllable`/`control` fields:

- `classifyDevice` computes `controllable`/`control` (`services/tb-device.js:242-248`), but `mapTbDevice` emits only `deviceType` and `kind` and **drops** `controllable`/`control` (`services/tb-device.js:336-349`).
- The workspace payload derives capabilities purely from the type: `capabilities: registry.capabilitiesFor(d.deviceType)?.commands || []` (`routes/api.js:154`). For `tuya` that is `['switch']` (`services/registry.js:47`).
- The client draws the button only when `capabilities.includes('switch')` (`public/js/flows.js:201-203`), and the server write guard passes a switch only when `entry.commands.includes('switch')` (`services/registry.js:103-105`).

So merely setting `controllable:false` in the classifier changes nothing any button or write path sees. **The fix must move the device onto a type whose registry commands are empty.** That closes the button, the scope tile and the write guard all at once, because they all read the type.

---

## 3. Crux 1 — the refrigeration deny: signal set, predicate, precision carve-out

### 3.1 The signal set

Three classes of signal, all evaluated over the **normalised** name (`normaliseName`, `services/tb-device.js:104-111`, which lower-cases, strips parenthetical cross-refs, maps `_`→`-`, collapses whitespace):

- **Refrigeration appliance words (always monitor-only):** `fridge`, `freezer`, `chiller`, `coldroom`, `cold-room`, `cold room`, `refrigeration`, `refrig`. These name the cooling appliance itself, and each is matched as a substring of the **normalised** name. **Verified firsthand against the real `normaliseName` (`services/tb-device.js:104-111`):** it lower-cases, strips parenthetical cross-refs, **maps `_`→`-`**, collapses whitespace and trims — it does **NOT** map `-`→space and does **NOT** map `_`→space. So the four written forms of "cold room" normalise thus: `coldroom`→`coldroom`; `cold-room`→`cold-room`; `cold_room`→`cold-room` (via the `_`→`-` rule); `cold room`→`cold room`. A list carrying only `coldroom`/`cold room` (as an earlier draft did) therefore MISSES both `cold-room` and `cold_room` — neither contains the substring `coldroom` **or** `cold room`, so `norm.includes(...)` is false for both. **Correction:** the list carries all three literal shapes — `coldroom`, `cold-room`, `cold room` — which makes `norm.includes(...)` true for **all four** input forms (`cold_room` is covered by `cold-room` after normalisation). Every appliance token is ≥5 chars or an unambiguous hyphenated/spaced pair, so substring matching is bleed-safe.
- **Location word (monitor-only unless a controllable appliance word is also present):** `cellar`. A cellar with a cooling relay is refrigeration; a cellar **light** or **fan** is a real controllable circuit.
- **Device profile (additive, UNVERIFIED — deny-only):** the cellar/refrigeration profile string, once confirmed by the live probe (CR3). Treated like the location class (overridable). **Held empty until CR3 lands** (see §9) so it can never over-block on a guessed string. The codebase deliberately does not classify *controllability* from the profile (`services/tb-device.js:195`); using the profile purely as a *deny* signal is a safe, additive departure.

The **switch telemetry** (`switch_1`/`switch`/`switchReported`/`switchOn`, `services/tb-device.js:184-187`) is the *problem* signal the deny exists to override; it is not part of the deny key.

### 3.2 The controllable-override set (the precision carve-out)

An explicit controllable-appliance word in the name **wins over the location word `cellar` and the profile** (but not over an appliance word — a fridge is a fridge). The override set:

- `light`, `lighting`, `lgt` (lighting circuits)
- `fan`, `extractfan`, `extractor` (ventilation fans)
- `socket` (a switched socket)
- the kitchen-appliance words `fryer`, `grill`, `bainmarie`, `potwash`, `oven`, `dishwash`

**Every override token is matched as a substring of the normalised name — INCLUDING the short ones (`lgt`, `fan`).** This is a deliberate departure from the existing asset matcher (`services/tb-device.js:256-259`), which restricts ≤3-char tokens to **exact token equality** to stop bleed (`extractfan` contains `ac`/`gw`). **That exact-only rule is wrong for this override set** — it was the second blocking defect. With exact-only, a **glued** controllable form defeats the override and is wrongly denied:

- Worked example — `gk-6261-cellarfan-1`: `norm='gk-6261-cellarfan-1'`, `tokens=['gk','6261','cellarfan','1']`. `hasLocation` is true (`norm` contains `cellar`), `hasAppliance` false. With exact-only, `tokens.includes('fan')` is **false** (the token is `cellarfan`, not `fan`) and no other override token matches → the fan is **wrongly forced monitor-only**. Substring matching (`norm.includes('fan')` → true) recognises it correctly as controllable. (The mockup already depicts `gk-6261-cellarfan-1` as a switchable cellar fan — the spec is now made consistent with it.)
- **Re-audit of every short (≤3-char) override token.** Only `fan` and `lgt` are ≤3 chars. Both need the substring fix: `gk-6261-cellarlgt-1` (glued) would also fail exact-only and is fixed by substring. The ≥5-char tokens (`light`, `lighting`, `extractfan`, `extractor`, `socket`, kitchen words) already matched glued forms via substring — which is exactly why `cellarlight-1` passed while `cellarfan-1`/`cellarlgt-1` did not.

Substring-matching the short override tokens is **provably safe here** for two reasons: (1) the override is only ever consulted for a location/profile-triggered device that carries **no** appliance noun — an appliance noun short-circuits to deny *before* the override line is reached (§3.3); and (2) no refrigeration or location word (`fridge`, `freezer`, `chiller`, `coldroom`, `cold-room`, `refrigeration`, `refrig`, `cellar`) contains any override token as a substring, so a substring match can never fire spuriously on a cooling word.

**Appliance-absolutism assumption (previously hidden — now stated, to be verified at CR3).** Because `hasAppliance` returns the deny with **no override consulted** (§3.3), a name carrying BOTH a refrigeration appliance noun AND a controllable token is forced monitor-only. Concretely, `refrigeration-floor-socket` and `fridge-light-circuit` classify as monitor-only **regardless** of the `socket`/`light` token. This is deliberately fail-closed and is the correct default — but it rests on an assumption that must be **visible and verified, not hidden**: *no controllable circuit anywhere in the estate carries a refrigeration appliance noun in its name.* If a real controllable circuit is named e.g. `...fridge-light...`, it would be over-blocked. Verifying this against live device names is a **CR3 checklist item (§9)**; if a counter-example exists it needs an explicit allow-exception before build lands. Fail-closed remains correct; the assumption is what makes the fail-closed choice defensible.

**Deliberate tightening of the override set (proposed — pending James's confirmation at gate; see §10):** the generic power words `switch`, `relay`, `contactor`, `powerpause`, `tongou`, `owon` are **excluded** from the override set. A cellar device carrying only a generic switch/relay word is ambiguous — it could be the cooling relay — so fail-closed keeps it monitor-only. Discovery §2 listed `switch`/`socket` as example override tokens; this design keeps `socket` (an unambiguous non-cooling circuit) but drops bare `switch`/`relay`. This is a defensible narrowing, but it is a change from discovery and so is marked **proposed — pending James's confirmation** and gated on a test fixture proving no known site is affected (§8.1, §10).

### 3.3 The predicate (build-ready pseudocode)

Add these constants near `ASSET_INTENT` (`services/tb-device.js:152`) and a helper alongside `hasSwitchSignal`. Stated as build-ready specification (identifiers and values inline):

- **`REFRIG_APPLIANCE`** — appliance nouns: ALL forms of every noun that must always mean monitor-only, matched with `norm.includes(...)` over the REAL normaliser (lower-case, strip parens, `_`→`-`, collapse whitespace). Because `normaliseName` maps `_`→`-` but NOT `-`→space, both "cold-room" and "cold_room" normalise to `cold-room`; all three literal shapes are listed so every written form of "cold room" is caught. Values: `fridge`, `freezer`, `chiller`, `coldroom`, `cold-room`, `cold room`, `refrigeration`, `refrig`.
- **`REFRIG_LOCATION`** — the location class (overridable): `cellar`.
- **`REFRIG_PROFILES`** — an empty list until CR3. Carry a `FIXME(CR3)` on this constant: populate it from the confirmed live cellar/refrigeration profile string BEFORE the profile-deny is relied upon. An empty list is fail-closed — the profile signal is inert and the name-token deny plus the registry backstop still protect every recognised name. An empty list once CR3 is resolved is a defect, not a valid state — see the enforcement test in §8.3 which FAILS if the CR3 probe artefact exists yet this list is still empty.
- **`CTRL_OVERRIDE`** — the controllable-appliance tokens: `light`, `lighting`, `lgt`, `fan`, `extractfan`, `extractor`, `socket`, `fryer`, `grill`, `bainmarie`, `potwash`, `oven`, `dishwash`.

Helper **`isRefrigerationDeny(norm, profile)`** — returns true when the device is refrigeration and must be forced monitor-only, EVEN IF it carries a switch signal:

- compute **hasAppliance** = any `REFRIG_APPLIANCE` token is a substring of `norm`;
- compute **hasLocation** = any `REFRIG_LOCATION` token is a substring of `norm`;
- compute **hasProfile** = any `REFRIG_PROFILES` entry is a substring of the lower-cased profile (empty until CR3);
- if none of hasAppliance / hasLocation / hasProfile is true → return false (not refrigeration);
- **ASSUMPTION** (verify at CR3, §9): no controllable circuit in the estate carries a refrigeration appliance noun in its name. An appliance noun therefore returns the deny with NO override consulted — e.g. a name like "fridge-light-circuit" is monitor-only despite the `light` token. Fail-closed. So: if hasAppliance → return true (appliance noun ⇒ always monitor-only);
- otherwise (location- or profile-only) → yield to an explicit controllable-appliance token: compute **override** = any `CTRL_OVERRIDE` token is a substring of `norm`, then return NOT override. Substring-match EVERY override token, including the short ones (`fan`, `lgt`), so GLUED forms (`cellarfan-1`, `cellarlgt-1`, `cellarlight-1`) are recognised. This is safe because the override is only reached for a location/profile device with no appliance noun, and no cooling/location word contains any override token as a substring.

### 3.4 Where it sits and what precedence it takes

Insert the deny as the **first** branch of `classifyDevice`, immediately after `norm`/`tokens` are computed (`services/tb-device.js:200-201`) and **before** the capability-first switch intent (`:203-206`) and the name asset-intent match (`:214`):

In `classifyDevice`, immediately after `norm` and `tokens` are computed (`normaliseName(name)`, then split on `[-\s]+`), add the deterministic refrigeration deny as the FIRST branch. It mirrors the existing deterministic non-controllable patterns (Intesis-off-held, hot-water-out-of-scope): a safe outcome forced regardless of a raw capability, with precedence over the capability-first switch intent AND over `matchAssetIntent`.

- When `isRefrigerationDeny(norm, profile)` is true (the deny matches over `norm`, so `tokens` are no longer needed for it), return early with: `kind: 'fridge'` (NOT `'kitchen'` — so it never enters the Kitchen flow or the Kitchen scope test); `deviceType: 'refrigeration'` (a registry key whose commands are `[]`, §4); `deviceTypeLabel: 'Refrigeration (monitor-only)'`; `controllable: false`; `control: null`.
- Otherwise fall through to the existing capability-first plus name-intent logic, unchanged.

**Precedence order:** refrigeration deny **>** capability-first switch intent **>** name asset intent. Because it returns early, the switch telemetry never reaches the `hasSwitchSignal` branch and `matchAssetIntent` is never consulted for a denied device — no fuzzy pass can pull a fridge into `kitchen`.

**Why `kind: 'fridge'`:** the existing `fridge` kind is the honest home. It is excluded from the Kitchen device list (`public/js/flows.js:372`) and from every control scope tile (`routes/api.js:137-143` — no group keys on `fridge`), and the Fridges & freezers keyword list already routes callers who say "cellar" to the monitor-only fridge flow (`public/js/flows.js:26`). It aligns the leak's fix with the model the tool already presents.

---

## 4. Crux 2 — the registry type and the write-guard backstop

### 4.1 New monitor-only device type

Add one entry to `REGISTRY` (`services/registry.js:11-51`): a key `refrigeration` whose value sets `label` to `Refrigeration (monitor-only)` and `commands` to an empty list.

With empty commands, `capabilitiesFor('refrigeration').commands` is `[]`, so:

- the workspace payload serialises `capabilities: []` (`routes/api.js:154`) → `canSwitch` is false → **no button** (`public/js/flows.js:201-203`);
- `validateCommand`'s `switch` case rejects, because `entry.commands.includes('switch')` is false → `{ ok:false, reason: 'Refrigeration (monitor-only) does not support remote on/off switching' }` (`services/registry.js:103`).

This alone closes the leak at every gate by construction. It also keeps `admin/registry` honest (`services/registry.js:131-144`) — the Admin page will list `refrigeration` with no commands.

### 4.2 Independent backstop (defence-in-depth)

Add an explicit, type-level refusal at the top of the `switch` case (`services/registry.js:99`), independent of the command list, so the guard holds even if a future edit ever gave `refrigeration` a stray command. In the `switch` case, before the existing checks:

- if `device.deviceType` equals `refrigeration` → return not-ok with the reason that refrigeration assets are monitor-only and remote switching is not permitted;
- then the existing checks unchanged: if `entry.commands` does not include `switch` → return not-ok ("<label> does not support remote on/off switching"); if `value` is not a boolean → return not-ok ("Switch value must be true (on) or false (off)"); otherwise return ok with attribute `switchDesired` and the boolean value.

This is the second, independent guard the registry header already envisages ("primary guard … bridge edge-gating is the backstop", `services/registry.js:1-6`). Here the registry is the independent backstop behind the classifier: even a crafted request that names a refrigeration device is refused.

---

## 5. Resulting behaviour at each layer (the spec Build implements against)

**Classification (`services/tb-device.js`).** A device whose normalised name or profile matches the refrigeration deny — and lacks a controllable-override token — returns `{ kind:'fridge', deviceType:'refrigeration', deviceTypeLabel:'Refrigeration (monitor-only)', controllable:false, control:null }`, regardless of a `switch_1` telemetry signal. A cellar **light**/**fan** falls through to the existing logic and classifies exactly as it does today (lighting/fan `tuya`, controllable).

**Mapping (`services/tb-device.js:336-349`).** `mapTbDevice` emits `deviceType:'refrigeration'`, `kind:'fridge'`. No other field changes; `isDuplicate`/`hasReported`/`online`/`telemetry` are untouched.

**Control surface (`routes/api.js`).**
- `workspacePayload` (`:152-161`) serialises `capabilities: []` for the device (empty registry commands).
- `switchControllable(site,'kitchen')` (`:133-134`) no longer sees the cellar unit (its kind is `fridge`, not `kitchen`), so on a cellar-only site the **Kitchen scope tile stays `none`/`mon`, never flips to `ctl`** (`:139`).
- `deviceSummary` (`:104-112`) no longer counts the cellar unit as a kitchen circuit.

**Client render (`public/js/flows.js`).**
- The Kitchen flow lists only `kind:'kitchen'` devices (`:372`); the reclassified cellar is absent → no row, no `switchButtons`, **no Turn OFF**.
- `canSwitch` (`:201-203`) returns false for the device even if it were listed, because `capabilities` is empty.
- A caller reporting a warm cellar/fridge is routed (keyword "cellar", `:26`) into the hard-coded monitor-only **fridge flow** (`:468-492`): live temperature + status, a clear "monitored, not controlled" message, and the correct P1 (stock-at-risk) or query outcome.

**Server write guard (`services/registry.js`).** `validateCommand(device,'switch',false)` for a `refrigeration` device returns `{ ok:false }` — fail-closed — via the explicit backstop and the empty command list. Dispatch never writes `switchDesired`.

**Genuine controllable paths — unchanged.** Kitchen fryer/oven `tuya`, external lighting `tuya`, extractor fan `tuya`, cellar-**light**, cellar-**fan**: none carries a refrigeration appliance word, and the location carve-out lets the controllable token win, so all classify and behave exactly as today.

---

## 6. Fail-closed default and the OOHDASH-19 interlock

- **Fail-closed by construction.** The deny forces monitor-only whenever refrigeration intent is recognised and no explicit controllable reason exists; the registry backstop refuses a switch independently; the profile set is left empty rather than guessed. The design never *enables* control it cannot justify.
- **Writes stay locked.** `WRITES_DISABLED` remains `"true"` (`k8s/deployment.yaml`) throughout design, build and test. This fix does **not** flip it; that is OOHDASH-19, a separate decision.
- **Ordering interlock.** This fix must land **and be observed running in the live pod** (a real cellar device shows no switch button in the running image — "live means in-effect, not merely merged", discovery §8 risk) **before** the wide OOHDASH-19 write-flip. The fix is a **blocker** on that flip; it is not a precondition of the P1-SMS stream (Stream B), which is fully independent.

### 6.1 Structural enforcement of the interlock (proposed — pending James's confirmation at gate)

The interlock above must not be a memory note that a future dev can merge OOHDASH-19 ahead of. Three concrete, structural guards make the ordering enforceable, defence-in-depth:

- **Sign-off artefact (the named record).** A required file, `docs/project/releases/SIGNOFF_stream-a-observed-live.md`, that does not exist until Stream A is observed live. It records, in fixed fields: the **live image digest** running when the check was made, the **specified cellar device** inspected (proposed: `gk-6261-cellar-1`), the observation (**no Turn OFF button present** in the live pod), the **date**, and the **named owner's sign-off** (proposed owner: **James**, or **IoT Support / Sam Day** as OOH P1 sign-off owner — James to confirm the owner at gate). This is the durable artefact the CX "observed-running" gate needs.
- **CI gate on the write-flip PR (blocks the merge).** A test, `test/interlock-stream-a.test.js`, that is a no-op *unless* the diff/working tree flips `WRITES_DISABLED` to `"false"` in `k8s/deployment.yaml`. When that flip is present it ASSERTS that `SIGNOFF_stream-a-observed-live.md` exists AND names an image digest equal to the digest the manifest is deploying (not a stale prior digest). If the artefact is absent or stale, the test **fails**, and branch protection (required green CI) blocks the OOHDASH-19 merge. Concretely: parse the manifest for `WRITES_DISABLED` and the image ref; if writes are being enabled, require the sign-off file and a matching digest.
- **Runtime deploy-time guard (belt-and-braces — the "in the running image" backstop).** On boot, if writes are enabled (`WRITES_DISABLED!=="true"`), the app runs a self-test: it calls `classifyDevice('gk-6261-cellar-1', 'default', { switchReported:true })` and asserts the result is `deviceType:'refrigeration', controllable:false`. If the refrigeration deny is NOT present in the running image (i.e. Stream A was skipped/reverted), the guard **keeps writes locked** and logs a hard startup error. This ties the write-flip to Stream A being *actually present in the deployed image*, not merely merged — so even if OOHDASH-19 is merged first, writes cannot go live without the deny in effect.

These are proposals to make the ordering non-bypassable; the exact CI wiring and whether all three (vs the artefact + one guard) are adopted is James's call at gate. Marked **proposed — pending James's confirmation at gate.**

---

## 7. Data dictionary (the naming standard Build and the tester read against)

The solution introduces **no new writable field**; its point is the *removal* of a writable capability for one device class. The catalogue below is the naming standard for the entities and fields this change touches.

**Entity: `device` (canonical shape, `services/tb-device.js:18-20`, `mapTbDevice`).** Origin: ThingsBoard inventory via the read plane. The classification-deciding fields:

- **`device.name`** (context: raw TB device name; source of the deny name-tokens). Example values: `gk-6261-cellar-1` (cellar cooling), `gk-6261-cellarlight-1` / `gk-6261-cellar-light-1` (controllable cellar light), `gk-6261-coldroom-1`, `gk-6209fryer-1` (kitchen). Sensitivity: low (asset id). Retention: transient (read live, cached 30s, not persisted).
- **`device.profile`** (context: raw TB device type/profile string, `raw.type`/`raw.profile`; additive deny signal). Value: **UNVERIFIED** — the confirmed cellar/refrigeration profile string is the CR3 probe output. Populate `REFRIG_PROFILES` from it. Sensitivity: low. Retention: transient.
- **`device.telemetry.switch_1`** (context: normalised switch reading; the *problem* signal the deny overrides). Boolean. Present on a switch-bearing cellar; the deny forces monitor-only despite it.
- **`device.deviceType`** (context: registry key that carries controllability). New value **`refrigeration`** for a denied device (was mis-set to `tuya`). Unique, unambiguous, one registry entry.
- **`device.kind`** (context: flow/scope routing). Value **`fridge`** for a denied device (was mis-set to `kitchen`).
- **`device.deviceTypeLabel`** (context: human label on the device row / read card). Value **`Refrigeration (monitor-only)`**.
- **`device.capabilities`** (context: wire field on the workspace payload, `routes/api.js:154`; the client's switch gate). Value **`[]`** for a refrigeration device.

**Entity: registry `deviceType` (`services/registry.js`).** New row key **`refrigeration`**, `label:'Refrigeration (monitor-only)'`, `commands:[]`. Naming is disjoint from every existing key (`salus-*`, `intesis`, `tuya`, `boiler-panel`, `tb-rulechain`, `gateway`) — no collision.

**Constant sets (new, `services/tb-device.js`).** `REFRIG_APPLIANCE`, `REFRIG_LOCATION`, `REFRIG_PROFILES` (empty until CR3), `CTRL_OVERRIDE` — the confirmed refrigeration token standard. These are the single source of truth for "what counts as refrigeration" and are read only by `isRefrigerationDeny`.

---

## 8. Test design (the concrete assets the tester runs)

Two verification layers, mirroring the existing suite: **unit** (pure classifier + registry) and **integration** (classify → map → payload → scope), plus a **flows/e2e** script for the UI-visible behaviour flows.js has no unit harness for.

### 8.1 ADD cases — unit: `test/tb-classify.test.js` (classifier)

- **Cellar + switch → monitor-only (core).** `classifyDevice('gk-6261-cellar-1', 'default', { switchReported: true })` → `kind:'fridge'`, `deviceType:'refrigeration'`, `controllable:false`, `control:null`. Proves the deny beats the capability-first switch intent.
- **Every appliance word denies with a switch present.** `fridge`, `freezer`, `chiller`, `coldroom`, `cold-room`, `refrigeration`, `refrig` names each carrying `switch_1` → `refrigeration` monitor-only.
- **Precision carve-out — cellar light NOT over-blocked.** `classifyDevice('gk-6261-cellar-light-1', 'gatewayDevice', { switchReported: true })` → `kind:'lighting'`, `deviceType:'tuya'`, `controllable:true`. Also `gk-6261-cellarlight-1` (glued light) → `lighting`/`tuya`/controllable.
- **Precision carve-out — GLUED short-token forms (the fix for blocking finding 2).** All of these MUST classify controllable, proving substring override of short tokens: `gk-6261-cellar-fan-1` (hyphenated) → `fan`/`tuya`/controllable; **`gk-6261-cellarfan-1` (glued — the case that failed exact-only and is now added)** → `fan`/`tuya`/controllable; `gk-6261-cellarlgt-1` (glued `lgt`) → `lighting`/`tuya`/controllable. The glued `cellarfan-1` case is the regression guard against re-introducing the exact-only short-token rule. (This mirrors the mockup, which shows `gk-6261-cellarfan-1` switchable.)
- **All four cold-room forms deny (the fix for blocking finding 1).** Each of `gk-6261-coldroom-1`, `gk-6261-cold-room-1`, `gk-6261-cold_room-1`, `gk-6261-cold room 1` carrying `switch_1` → `deviceType:'refrigeration'`, monitor-only. This proves the appliance list matches every written form against the REAL `normaliseName` (`_`→`-`, not `-`→space).
- **Fail-closed default.** `classifyDevice('gk-6261-cellar-1', 'default', {})` (refrigeration token, no override, no switch) → `refrigeration` monitor-only (consistent typing even without a switch signal). And an ambiguous cellar device carrying only a generic `switch`/`relay` word (no override) → `refrigeration` (the deliberate tightening, §3.2).
- **Tightening-safety fixture (proves the §3.2 tightening harms no known site — CX/§10 requirement).** A fixture `test/fixtures/known-cellar-switch-names.json` enumerating the actual cellar-controllable device names known to exist in the estate (populated from the CR3 probe; seeded with the confirmed examples until then). A test asserts **every** name in that fixture still classifies **controllable** under the tightened override set — i.e. dropping bare `switch`/`relay`/`contactor`/`powerpause` does not over-block any real controllable cellar circuit. If a real site is found to name a controllable cellar circuit with only a bare `switch`/`relay` token, this test fails and the tightening must be revisited before build lands.
- **Precedence over name intent.** A name mixing a refrigeration word with a non-override kitchen-context word but no controllable-appliance token still denies.

### 8.2 ADD cases — unit: `test/control-plane.test.js` (registry, near the existing switch block at `:84`)

- **`capabilitiesFor('refrigeration')`** → `{ label:'Refrigeration (monitor-only)', commands:[] }`; `.commands` deep-equals `[]`.
- **Write guard rejects a switch (empty commands).** `validateCommand({ deviceType:'refrigeration', telemetry:{ switch_1:true } }, 'switch', false)` → `{ ok:false }`, reason mentions monitor-only / no switching.
- **Backstop holds independently.** Same call proves the explicit `deviceType==='refrigeration'` refusal fires (belt-and-braces).

### 8.3 ADD cases — integration: new file `test/refrigeration-deny.test.js`

- **Serialisation.** `mapTbDevice` on a cellar+switch raw device → `deviceType:'refrigeration'`, `kind:'fridge'`; the `workspacePayload` device carries `capabilities: []`.
- **Scope does not light up.** A synthetic site whose only switch-bearing device is a cellar unit → the **Kitchen scope tile is not `ctl`** (`SCOPE_GROUPS` kitchen level), and no scope group reports the cellar as controllable.
- **Precision at the payload.** A site with a real kitchen fryer + a cellar cooling unit + a cellar light → Kitchen tile `ctl` (fryer), lighting `ctl` (cellar light), the cellar cooling unit `capabilities:[]`.
- **CR3 profile-populate enforcement (the fix for blocking finding 4 — stops `REFRIG_PROFILES=[]` being silently forgotten).** A test that reads the CR3 probe artefact (`data/cr3-cellar-profile.json`, the probe output). If that artefact does **not** exist, the test is skipped with a message naming CR3 as the blocker (fail-closed name-only cover is the accepted interim). If it **does** exist (CR3 resolved), the test ASSERTS `REFRIG_PROFILES` is non-empty AND contains every profile string the artefact lists. So the moment the probe result lands, an empty/incomplete `REFRIG_PROFILES` **fails CI** — the populate step cannot be silently forgotten. Pair this with the in-code `FIXME(CR3)` on the constant (§3.3).
- **Appliance-absolutism assumption is intentional and load-bearing (the fix for blocking finding 5).** A documented assertion that `classifyDevice('gk-6261-fridge-light-circuit', 'default', { switchReported:true })` → `deviceType:'refrigeration'` monitor-only, with a comment stating this is **deliberate fail-closed behaviour** resting on the §3.2 assumption "no controllable circuit in the estate carries a refrigeration appliance noun." This freezes the behaviour as intended (not an accidental bug) and points the reader to the CR3 estate-name check (§9) that verifies the assumption holds.

### 8.4 Flows / e2e script (UI-visible) — Playwright, `test/e2e/` (or the existing Playwright IP the tester owns)

Using fixture inventory seeded with the realistic devices in §9.2:

- A confirmed cellar-only site: the Kitchen flow shows **no Turn OFF button** for the cellar unit; a "cellar warm" call routes to the monitor-only **fridge flow** (stock-at-risk P1 / query).
- A crafted `POST /api/control/dispatch` with `command:'switch'` at the cellar `deviceId` returns a guard rejection (fail-closed), even with `WRITES_DISABLED=false` in the test seam.
- **Observed-running check** (release-time, live pod): a real cellar device shows no switch button in the running image before OOHDASH-19 is considered.

### 8.5 Regression set that MUST stay GREEN

Run and keep passing (no edits expected):

- `test/tb-classify.test.js` — all existing classify cases: Salus setpoint heating (`:26-40`), Tuya kitchen switch (`:42-48`), Intesis (`:50-54`), gateway (`:56-61`), the C4 exception classes (`:64-120`), the site-query filter and telemetry-normalisation blocks.
- `test/control-plane.test.js` — switch validation strict-boolean (`:84-90`), setpoint ranges + frost + mode-held (`:62-113`), registration gate (`:153-159`), guardrail/idempotency and switch e2e (`:166-257`), WRITES_DISABLED behaviour.
- `test/writesDisabled.test.js` — the lock primitive stays true / 423 unchanged.
- `test/hotwater-scope.test.js` — HW scope + the monitor-only fridge path unchanged.
- Flows behaviour with **no unit harness** — heating setpoint/frost, **Intesis-off-held** (`public/js/flows.js:284-292`), HW-boost presence-gating, and the genuine kitchen/lighting/fan switch render — are covered by the §8.4 Playwright script (regression assertions that these paths are byte-for-byte unchanged in behaviour).

### 8.6 ADD cases — OOHDASH-19 interlock: new file `test/interlock-stream-a.test.js` (proposed with §6.1)

- **No-op unless writes are being enabled.** With `WRITES_DISABLED="true"` in `k8s/deployment.yaml` (the current state), the test passes trivially — it does not obstruct any Stream A build/merge.
- **Blocks the write-flip without a live sign-off.** When the manifest flips `WRITES_DISABLED` to `"false"`, the test FAILS unless `docs/project/releases/SIGNOFF_stream-a-observed-live.md` exists and names an image digest matching the digest being deployed. Proves the CI gate (§6.1) blocks OOHDASH-19 from merging ahead of an observed-live Stream A.
- **Runtime guard self-test.** A unit test of the boot guard (§6.1): with writes enabled, `classifyDevice('gk-6261-cellar-1','default',{ switchReported:true })` must return `refrigeration`/`controllable:false`; the guard keeps writes locked and logs a hard error if the deny is absent. Proves the "in the running image" backstop.

---

## 9. Crux — the one UNVERIFIED input, and how the design stays safe without it

- **What is unverified (CR3).** The exact live cellar device **names**, **profile string**, and **telemetry keys**. Probe (owner: platform read via James/Spencer TB creds, CIR §6): query TB for cellar-equipped sites and record, per device, the raw name, the profile/type, and whether a cellar unit carries `switch_1`.
- **How the design stays fail-closed until it lands.**
  - `REFRIG_PROFILES` is **empty**, so the profile signal can never over-block on a guessed string; the name-token deny fully protects every **recognised** refrigeration name today.
  - The token set is deliberately broad (appliance + location) and the registry backstop refuses a switch **independently of classification**, so a mis-typed device is still refused at the write guard.
  - The carve-out only ever *relaxes* the deny for an explicit controllable token, never *tightens* it — it cannot cause an under-block of a cooling unit.
- **The residual gap (open question, §10).** A cellar cooling unit named only by an opaque id (e.g. a bare devEUI) with **no** recognised refrigeration token and **no** confirmed profile would not be caught by the name deny. This is precisely why CR3 (confirm the profile string, then populate `REFRIG_PROFILES`) is the **first build input**. Once the profile is confirmed, the profile-based deny closes this gap for any device on the cellar profile regardless of its name.

### 9.1 CR3 checklist (must be completed before the profile-deny is relied on)

The CR3 read-only ThingsBoard probe is the **first build input**. Its output is recorded to `data/cr3-cellar-profile.json`. The probe must complete ALL of the following, each a tickable checklist item:

1. **Record the confirmed cellar/refrigeration profile string(s)** and populate `REFRIG_PROFILES` from them. Enforced by the §8.3 CR3 profile-populate test, which fails if the probe artefact exists but `REFRIG_PROFILES` is empty/incomplete.
2. **Verify the appliance-absolutism assumption (§3.2).** Scan every controllable device name in the estate and confirm **none** carries a refrigeration appliance noun (`fridge`, `freezer`, `chiller`, `coldroom`, `cold-room`, `refrigeration`, `refrig`). If any controllable circuit is so named (e.g. `...fridge-light...`), it would be over-blocked — record it and add an explicit allow-exception before build lands. Tick = "no controllable circuit carries an appliance noun (or exceptions recorded)."
3. **Verify the tightening-safety fixture (§3.2, §8.1).** Confirm no controllable cellar circuit is named with only a bare `switch`/`relay`/`contactor`/`powerpause` token; populate `test/fixtures/known-cellar-switch-names.json` from the real names found.
4. **Record whether any cellar cooling unit is named only by an opaque id** (a bare devEUI / no recognised refrigeration token). Every such unit is the residual gap below; the profile-deny (item 1) closes it once populated.

### 9.2 Realistic fixture/test data (for §8)

- `gk-6261-cellar-1` — profile `default` (or the confirmed cellar profile), telemetry `{ switch_1:false, temperature:6.4 }` → **refrigeration monitor-only** (the leak device).
- `gk-6261-cellarlight-1` — telemetry `{ switchReported:false }` → **lighting `tuya`, controllable** (precision proof, glued light).
- `gk-6261-cellarfan-1` — telemetry `{ switchReported:true }` → **fan `tuya`, controllable** (glued short-token proof — the blocking-finding-2 case; matches the mockup).
- `gk-6261-coldroom-1` and `gk-6261-cold-room-1` — telemetry `{ switch_1:true, temperature:2.1 }` → **refrigeration monitor-only** (both cold-room spellings must deny — blocking-finding-1 case).
- `gk-6209fryer-1` — telemetry `{ switchReported:false }` → **kitchen `tuya`, controllable** (regression).
- `gk-6261-salusit700-1` — telemetry `{ heatingSetpoint:21, localTemperature:19 }` → **heating, controllable** (regression).

---

## 10. Open flags for the panel / James

- **Deliberate tightening of the override set (proposed — pending James's confirmation at gate).** Bare `switch`/`relay`/`contactor`/`powerpause` are **excluded** from the controllable-override tokens (fail-closed), where discovery §2 listed `switch`/`socket` as examples. `socket` is kept; ambiguous generic switch/relay words are not. This is a change from discovery, so it is **proposed — pending James's confirmation** and is gated on the **tightening-safety fixture** (`test/fixtures/known-cellar-switch-names.json`, §8.1) proving no known site names a controllable cellar circuit with only a bare `switch`/`relay` token. Confirm the narrowing, or widen it back if such a name exists.
- **Structural OOHDASH-19 interlock (proposed — pending James's confirmation at gate).** The ordering interlock is made non-bypassable by a sign-off artefact + CI gate + runtime boot guard (§6.1), replacing the earlier process-only note. James to confirm the mechanism (and which combination) at gate.
- **Observed-running-live gate — named owner + check + artefact (proposed — pending James's confirmation at gate).** Owner **proposed: James** (or **IoT Support / Sam Day**, OOH P1 sign-off owner). Check: the specified cellar device (proposed `gk-6261-cellar-1`) shows **no Turn OFF button** in the live pod, on the deployed image digest. Artefact: `docs/project/releases/SIGNOFF_stream-a-observed-live.md` (§6.1). **James to confirm the owner at gate.**
- **`normaliseName` correction (resolved in this revision).** The earlier draft claimed `cold-room`/`cold_room` normalise to the tokens `cold room`; verified against `services/tb-device.js:104-111`, the real normaliser maps `_`→`-` (not `-`→space), so those forms normalise to `cold-room`. The appliance list and predicate are corrected (§3.1, §3.3) to match all four written forms. No open question — noted for the panel's audit trail.
- **UNVERIFIED live cellar naming/profile (CR3).** First build input; the design is fail-closed until it lands (§9, §9.1). The residual opaque-id gap closes once the profile string is confirmed and `REFRIG_PROFILES` is populated; the §8.3 test fails if the probe lands but the array stays empty.
- **`kind:'fridge'` reuse.** The design reuses the existing `fridge` kind rather than introducing a `refrigeration` kind, so the reclassified cellar inherits the honest monitor-only fridge flow and the existing "cellar" keyword routing. If a distinct cellar presentation is later wanted, that is an additive follow-up, not part of this fix.
- **Upstream hardening (deferrable, CR6).** Optionally ask the platform to stop publishing the switch key for the cellar profile at source. Hardening only — never relied on; the dashboard fails closed regardless.

---

## 11. Mockup

A self-contained, interactive before/after mockup ships alongside this design:

- `docs/project/releases/mockups/cellar-switch-removal.html`

It shows, side by side and toggleable: **Before** — a cellar cooling unit surfacing in the Kitchen flow with a live **Turn OFF** button (clicking it reveals the stock-loss hazard the CTO flagged); **After** — the same unit rendered monitor-only in the fridge flow with no control affordance; and a **precision panel** proving a genuine kitchen fryer, a cellar **light** and a cellar **fan** (`gk-6261-cellarfan-1`, the glued-form case) stay switchable. Realistic device names and readings throughout (site 6261).

---

## 12. Release notes for handlers (plain English — ship with the release)

Two honest, scoped limitations a handler should understand. Both are safe today because writes are globally locked, but they must be visible, not buried:

- **A cellar unit with an unrecognised name may still show a Turn OFF button until CR3.** The fix removes the Turn OFF button for every cellar/refrigeration unit whose **name** contains a recognised word (cellar, fridge, freezer, chiller, cold room, refrigeration) — which is the great majority. A cellar cooling unit named **only by an opaque code** (a bare device id, no recognised word) and whose profile has not yet been confirmed **may still show a Turn OFF button** until the CR3 probe confirms the profile and closes the gap by device profile. **This cannot cause harm right now:** all remote switching is globally locked (`WRITES_DISABLED="true"`) and stays locked until OOHDASH-19, so pressing such a button changes nothing on site. If you ever see a Turn OFF button on something that is clearly a cooling unit, do not rely on it — treat a warm cellar as an appliance fault (stock-at-risk P1 or query), and report the device name so it can be added.
- **Turn OFF presence can look inconsistent across sites (mixed-site).** Because recognition is name-based until CR3, one site's cellar may correctly show **no** Turn OFF while another site's differently-named cellar still shows one. This inconsistency is expected and temporary; it disappears once CR3 confirms the profile and every unit on the cellar profile is recognised regardless of its name. Until then, the rule for handlers is simple and consistent regardless of the button: **Lighthouse monitors cellar/fridge/freezer temperatures; it does not switch cooling.** A warm unit is always an appliance fault to escalate, never a remote off/on.

---

*All line numbers cited against the working tree at v1.2.4, 2026-09-23, verified firsthand. UNVERIFIED items name the exact probe + owner. Design only — no code changed. Writes stay locked (`WRITES_DISABLED="true"`) throughout; the fix must be observed running in the live pod before OOHDASH-19 is considered. The orchestrator governs the gate.*
