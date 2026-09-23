<!-- gate:contract
SECTION: What this is
This is the build-ready design for Stream A of R1: removing the device-control switch capability from refrigeration (Cellar) assets, so a cellar cooling unit can never present a Turn OFF button or accept a switch write. It turns the signed-off discovery into an unambiguous spec — the exact deny rule and where it sits, the new registry type and its backstop, the behaviour at every layer, the full test design with named files, and a before/after mockup. It is design only: no product code was changed, nothing is committed, no gate is invoked.
SECTION: The one-paragraph fix
Controllability travels on the device's TYPE through the registry, not on the classifier's controllable flag (which is computed and then thrown away). So the fix adds a deterministic refrigeration deny at the very top of classifyDevice that reassigns a refrigeration device onto a brand-new monitor-only type, `refrigeration`, whose registry command list is empty. Empty commands means the button never renders and the server write guard rejects a switch by construction. A second, independent guard in the registry refuses a switch for a refrigeration device even if classification were somehow bypassed. The deny runs before — and takes precedence over — both the capability-first switch intent and the name-based asset match.
SECTION: The deny rule and its precision
The rule fires on refrigeration appliance words (fridge, freezer, chiller, coldroom, refrigeration, refrig), on the location word cellar, and — once confirmed on live data — on the cellar device profile. Appliance words always mean monitor-only. The location word cellar (and coldroom, and the profile) mean monitor-only UNLESS the name also carries an explicit controllable-appliance word — light, fan, socket, or a kitchen appliance — because a cellar light or cellar fan is a genuine switchable circuit that merely sits in the cellar and must stay controllable. This is the precision carve-out the discovery demanded: an explicit controllable token wins over the bare location token.
SECTION: What changes at each layer
Classification: a switch-bearing cellar unit comes out typed `refrigeration`, kind `fridge`, not controllable. The control surface (the API workspace payload) then reports its capabilities as an empty list. The client draws no Turn OFF button and the Kitchen scope tile no longer lights up as controllable on a cellar-only site. The server write guard rejects any switch command aimed at a refrigeration device, failing closed. A genuine kitchen, lighting or fan switch is untouched, and a cellar light stays switchable.
SECTION: The safety interlock
This fix must land, and be OBSERVED running in the live pod, before the wide device-write flip (OOHDASH-19). Writes stay globally locked (WRITES_DISABLED stays "true") throughout design, build and test — the fix is what makes it safe to consider un-locking later, but it does not itself un-lock anything. The deny is designed to fail closed: when a device looks like refrigeration and there is no clear controllable reason to allow a switch, it is treated as monitor-only.
SECTION: How it is tested
New tests prove the add cases (a switch-bearing cellar becomes monitor-only with no button and a rejected write; a cellar light is NOT over-blocked; an ambiguous refrigeration device defaults to monitor-only) and a named regression set proves everything else stays exactly as it is (heating setpoint and frost, Intesis-off-held, hot-water boost, kitchen/lighting/fan switching, the registration, kill-switch and guardrail gates, and the monitor-only fridge flow). The test files to touch are named in the design.
SECTION: The one thing still to confirm
The exact live cellar device names, profile string and telemetry keys are unverified from the repo and need a read-only ThingsBoard probe. The design stays fail-closed until then: the profile signal is left empty so it can never wrongly over-block on a guessed string, the name-token deny fully protects every recognised refrigeration name, and the registry backstop refuses switches independently. The residual gap — a cellar unit named only by an opaque id with no recognised token and no confirmed profile — is the reason the probe is the first build input.
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

- **Refrigeration appliance words (always monitor-only):** `fridge`, `freezer`, `chiller`, `coldroom`, `refrigeration`, `refrig`. These name the cooling appliance itself. All are ≥5 characters, so they are matched as substrings of the normalised name safely (no short-token bleed). `cold-room` / `cold_room` normalise to the two tokens `cold room`, matched as the substring `cold room` in addition to the glued `coldroom`.
- **Location word (monitor-only unless a controllable appliance word is also present):** `cellar`. A cellar with a cooling relay is refrigeration; a cellar **light** or **fan** is a real controllable circuit.
- **Device profile (additive, UNVERIFIED — deny-only):** the cellar/refrigeration profile string, once confirmed by the live probe (CR3). Treated like the location class (overridable). **Held empty until CR3 lands** (see §9) so it can never over-block on a guessed string. The codebase deliberately does not classify *controllability* from the profile (`services/tb-device.js:195`); using the profile purely as a *deny* signal is a safe, additive departure.

The **switch telemetry** (`switch_1`/`switch`/`switchReported`/`switchOn`, `services/tb-device.js:184-187`) is the *problem* signal the deny exists to override; it is not part of the deny key.

### 3.2 The controllable-override set (the precision carve-out)

An explicit controllable-appliance word in the name **wins over the location word `cellar` and the profile** (but not over an appliance word — a fridge is a fridge). The override set:

- `light`, `lighting`, `lgt` (lighting circuits)
- `fan`, `extractfan`, `extractor` (ventilation fans)
- `socket` (a switched socket)
- the kitchen-appliance words `fryer`, `grill`, `bainmarie`, `potwash`, `oven`, `dishwash`

Matched the same way the existing matcher treats tiny tokens (`services/tb-device.js:256-259`): tokens ≤3 chars (`lgt`, `fan`) match on **exact token equality only**; longer tokens match as substrings.

**Deliberate tightening (flag for James — see §10):** the generic power words `switch`, `relay`, `contactor`, `powerpause`, `tongou`, `owon` are **excluded** from the override set. A cellar device carrying only a generic switch/relay word is ambiguous — it could be the cooling relay — so fail-closed keeps it monitor-only. Discovery §2 listed `switch`/`socket` as example override tokens; this design keeps `socket` (an unambiguous non-cooling circuit) but drops bare `switch`/`relay` toward fail-closed. This is a defensible narrowing, not a contradiction, and is called out as an open confirmation.

### 3.3 The predicate (build-ready pseudocode)

Add these constants near `ASSET_INTENT` (`services/tb-device.js:152`) and a helper alongside `hasSwitchSignal`:

```
const REFRIG_APPLIANCE = ['fridge', 'freezer', 'chiller', 'coldroom', 'cold room', 'refrigeration', 'refrig'];
const REFRIG_LOCATION  = ['cellar'];                      // location class — overridable
const REFRIG_PROFILES  = [];                              // UNVERIFIED — populate from CR3; empty = fail-closed (never over-block on a guess)
const CTRL_OVERRIDE    = ['light', 'lighting', 'lgt', 'fan', 'extractfan', 'extractor', 'socket',
                          'fryer', 'grill', 'bainmarie', 'potwash', 'oven', 'dishwash'];

// True ⇒ this device is refrigeration and must be forced monitor-only, EVEN IF it carries a switch signal.
function isRefrigerationDeny(norm, tokens, profile) {
    const hasAppliance = REFRIG_APPLIANCE.some(t => norm.includes(t));
    const hasLocation  = REFRIG_LOCATION.some(t => norm.includes(t));
    const prof = String(profile || '').toLowerCase();
    const hasProfile   = REFRIG_PROFILES.some(p => prof.includes(p));   // empty until CR3
    if (!hasAppliance && !hasLocation && !hasProfile) return false;
    if (hasAppliance) return true;                                       // appliance noun ⇒ always monitor-only
    // location- or profile-only ⇒ yield to an explicit controllable-appliance token
    const override = CTRL_OVERRIDE.some(t => t.length <= 3 ? tokens.includes(t) : norm.includes(t));
    return !override;
}
```

### 3.4 Where it sits and what precedence it takes

Insert the deny as the **first** branch of `classifyDevice`, immediately after `norm`/`tokens` are computed (`services/tb-device.js:200-201`) and **before** the capability-first switch intent (`:203-206`) and the name asset-intent match (`:214`):

```
export function classifyDevice(name, profile, telemetry) {
    const norm = normaliseName(name);
    const tokens = norm.split(/[-\s]+/).filter(Boolean);

    // Stream A — DETERMINISTIC REFRIGERATION DENY. Precedence over the capability-first switch intent
    // AND over matchAssetIntent. Mirrors the existing deterministic non-controllable patterns
    // (Intesis-off-held, hot-water-out-of-scope): a safe outcome forced regardless of a raw capability.
    if (isRefrigerationDeny(norm, tokens, profile)) {
        return {
            kind: 'fridge',                     // NOT 'kitchen' — never enters the Kitchen flow or Kitchen scope test
            deviceType: 'refrigeration',        // a registry key whose commands are [] (§4)
            deviceTypeLabel: 'Refrigeration (monitor-only)',
            controllable: false,
            control: null
        };
    }
    // …existing capability-first + name-intent logic unchanged…
}
```

**Precedence order:** refrigeration deny **>** capability-first switch intent **>** name asset intent. Because it returns early, the switch telemetry never reaches the `hasSwitchSignal` branch and `matchAssetIntent` is never consulted for a denied device — no fuzzy pass can pull a fridge into `kitchen`.

**Why `kind: 'fridge'`:** the existing `fridge` kind is the honest home. It is excluded from the Kitchen device list (`public/js/flows.js:372`) and from every control scope tile (`routes/api.js:137-143` — no group keys on `fridge`), and the Fridges & freezers keyword list already routes callers who say "cellar" to the monitor-only fridge flow (`public/js/flows.js:26`). It aligns the leak's fix with the model the tool already presents.

---

## 4. Crux 2 — the registry type and the write-guard backstop

### 4.1 New monitor-only device type

Add one entry to `REGISTRY` (`services/registry.js:11-51`):

```
'refrigeration': { label: 'Refrigeration (monitor-only)', commands: [] },
```

With empty commands, `capabilitiesFor('refrigeration').commands` is `[]`, so:

- the workspace payload serialises `capabilities: []` (`routes/api.js:154`) → `canSwitch` is false → **no button** (`public/js/flows.js:201-203`);
- `validateCommand`'s `switch` case rejects, because `entry.commands.includes('switch')` is false → `{ ok:false, reason: 'Refrigeration (monitor-only) does not support remote on/off switching' }` (`services/registry.js:103`).

This alone closes the leak at every gate by construction. It also keeps `admin/registry` honest (`services/registry.js:131-144`) — the Admin page will list `refrigeration` with no commands.

### 4.2 Independent backstop (defence-in-depth)

Add an explicit, type-level refusal at the top of the `switch` case (`services/registry.js:99`), independent of the command list, so the guard holds even if a future edit ever gave `refrigeration` a stray command:

```
case 'switch': {
    if (device.deviceType === 'refrigeration')
        return { ok: false, reason: 'Refrigeration assets are monitor-only — remote switching is not permitted' };
    if (!entry.commands.includes('switch')) return { ok: false, reason: `${entry.label} does not support remote on/off switching` };
    if (typeof value !== 'boolean') return { ok: false, reason: 'Switch value must be true (on) or false (off)' };
    return { ok: true, attribute: 'switchDesired', value };
}
```

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
- **Precision carve-out — cellar light NOT over-blocked.** `classifyDevice('gk-6261-cellar-light-1', 'gatewayDevice', { switchReported: true })` → `kind:'lighting'`, `deviceType:'tuya'`, `controllable:true`. Also `gk-6261-cellarlight-1` (glued) and `gk-6261-cellar-fan-1` → `fan`/`tuya`/controllable.
- **Fail-closed default.** `classifyDevice('gk-6261-cellar-1', 'default', {})` (refrigeration token, no override, no switch) → `refrigeration` monitor-only (consistent typing even without a switch signal). And an ambiguous cellar device carrying only a generic `switch`/`relay` word (no override) → `refrigeration` (the deliberate tightening, §3.2).
- **Precedence over name intent.** A name mixing a refrigeration word with a non-override kitchen-context word but no controllable-appliance token still denies.

### 8.2 ADD cases — unit: `test/control-plane.test.js` (registry, near the existing switch block at `:84`)

- **`capabilitiesFor('refrigeration')`** → `{ label:'Refrigeration (monitor-only)', commands:[] }`; `.commands` deep-equals `[]`.
- **Write guard rejects a switch (empty commands).** `validateCommand({ deviceType:'refrigeration', telemetry:{ switch_1:true } }, 'switch', false)` → `{ ok:false }`, reason mentions monitor-only / no switching.
- **Backstop holds independently.** Same call proves the explicit `deviceType==='refrigeration'` refusal fires (belt-and-braces).

### 8.3 ADD cases — integration: new file `test/refrigeration-deny.test.js`

- **Serialisation.** `mapTbDevice` on a cellar+switch raw device → `deviceType:'refrigeration'`, `kind:'fridge'`; the `workspacePayload` device carries `capabilities: []`.
- **Scope does not light up.** A synthetic site whose only switch-bearing device is a cellar unit → the **Kitchen scope tile is not `ctl`** (`SCOPE_GROUPS` kitchen level), and no scope group reports the cellar as controllable.
- **Precision at the payload.** A site with a real kitchen fryer + a cellar cooling unit + a cellar light → Kitchen tile `ctl` (fryer), lighting `ctl` (cellar light), the cellar cooling unit `capabilities:[]`.

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

---

## 9. Crux — the one UNVERIFIED input, and how the design stays safe without it

- **What is unverified (CR3).** The exact live cellar device **names**, **profile string**, and **telemetry keys**. Probe (owner: platform read via James/Spencer TB creds, CIR §6): query TB for cellar-equipped sites and record, per device, the raw name, the profile/type, and whether a cellar unit carries `switch_1`.
- **How the design stays fail-closed until it lands.**
  - `REFRIG_PROFILES` is **empty**, so the profile signal can never over-block on a guessed string; the name-token deny fully protects every **recognised** refrigeration name today.
  - The token set is deliberately broad (appliance + location) and the registry backstop refuses a switch **independently of classification**, so a mis-typed device is still refused at the write guard.
  - The carve-out only ever *relaxes* the deny for an explicit controllable token, never *tightens* it — it cannot cause an under-block of a cooling unit.
- **The residual gap (open question, §10).** A cellar cooling unit named only by an opaque id (e.g. a bare devEUI) with **no** recognised refrigeration token and **no** confirmed profile would not be caught by the name deny. This is precisely why CR3 (confirm the profile string, then populate `REFRIG_PROFILES`) is the **first build input**. Once the profile is confirmed, the profile-based deny closes this gap for any device on the cellar profile regardless of its name.

### 9.2 Realistic fixture/test data (for §8)

- `gk-6261-cellar-1` — profile `default` (or the confirmed cellar profile), telemetry `{ switch_1:false, temperature:6.4 }` → **refrigeration monitor-only** (the leak device).
- `gk-6261-cellarlight-1` — telemetry `{ switchReported:false }` → **lighting `tuya`, controllable** (precision proof).
- `gk-6261-coldroom-1` — telemetry `{ switch_1:true, temperature:2.1 }` → **refrigeration monitor-only**.
- `gk-6209fryer-1` — telemetry `{ switchReported:false }` → **kitchen `tuya`, controllable** (regression).
- `gk-6261-salusit700-1` — telemetry `{ heatingSetpoint:21, localTemperature:19 }` → **heating, controllable** (regression).

---

## 10. Open flags for the panel / James

- **Deliberate tightening of the override set (design call).** Bare `switch`/`relay`/`contactor`/`powerpause` are **excluded** from the controllable-override tokens (fail-closed), where discovery §2 listed `switch`/`socket` as examples. `socket` is kept; ambiguous generic switch/relay words are not. Confirm this narrowing is acceptable, or widen it back if a real cellar-light is known to be named with a bare `switch` token.
- **UNVERIFIED live cellar naming/profile (CR3).** First build input; the design is fail-closed until it lands (§9). The residual opaque-id gap closes once the profile string is confirmed and `REFRIG_PROFILES` is populated.
- **`kind:'fridge'` reuse.** The design reuses the existing `fridge` kind rather than introducing a `refrigeration` kind, so the reclassified cellar inherits the honest monitor-only fridge flow and the existing "cellar" keyword routing. If a distinct cellar presentation is later wanted, that is an additive follow-up, not part of this fix.
- **Upstream hardening (deferrable, CR6).** Optionally ask the platform to stop publishing the switch key for the cellar profile at source. Hardening only — never relied on; the dashboard fails closed regardless.

---

## 11. Mockup

A self-contained, interactive before/after mockup ships alongside this design:

- `docs/project/releases/mockups/cellar-switch-removal.html`

It shows, side by side and toggleable: **Before** — a cellar cooling unit surfacing in the Kitchen flow with a live **Turn OFF** button (clicking it reveals the stock-loss hazard the CTO flagged); **After** — the same unit rendered monitor-only in the fridge flow with no control affordance; and a **precision panel** proving a genuine kitchen fryer and a cellar **light** stay switchable. Realistic device names and readings throughout (site 6261).

---

*All line numbers cited against the working tree at v1.2.4, 2026-09-23, verified firsthand. UNVERIFIED items name the exact probe + owner. Design only — no code changed. Writes stay locked (`WRITES_DISABLED="true"`) throughout; the fix must be observed running in the live pod before OOHDASH-19 is considered. The orchestrator governs the gate.*
