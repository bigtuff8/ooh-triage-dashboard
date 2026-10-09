# OOHDASH-113 Discovery — Ninth October Feedback Items

**Epic:** OOHDASH-113 · **Date:** 2026-10-09 · **Stage:** Discovery  
**Stories:** OOHDASH-114 (F1), OOHDASH-115 (F2), OOHDASH-116 (F3), OOHDASH-117 (F4), OOHDASH-118 (F5)  
**Source:** Sam Day feedback emails 2026-10-08 and 2026-10-09

---

## Epic summary

Five feedback items from Sam Day targeting the live OOH Triage Dashboard (v1.3.5). They range from a logic investigation (F1) through copy tweaks (F2, F3) to a safety-critical new capability (F4) and a CTO-authored policy read-back (F5). All evaluated under the governing principle: **triage-question-led, outcome-oriented, no raw device detail**.

**F1 HTML requirements document status:** Not found at any searched location (AppData temp, Outlook cache, OneDrive Projects). All F1 findings derive from codebase inspection only. This is a BLOCKER — see conditions.

---

## F1 — Heating & hot-water controllability (OOHDASH-114)

### Problem statement

Sam's "main change." Suspected logic bug in how the triage flow determines DHW (domestic hot water) controllability. OOHDASH-87 established four DHW architectures (C&B V2/FG V1 boilerControl, FHI Salus r-1, Tuya dhw-named) each gated by different per-site signals: `heating_scenario.separate_dhw`, `output1OutputMask[3]`, and/or Tuya dhw-named device presence.

### Evidence from codebase (exact file:line)

**`routes/api.js:120-121` — `hasControllableDhw`:**
```js
export function hasControllableDhw(site) {
    return site.devices.some(d => (registry.capabilitiesFor(d.deviceType)?.commands || []).includes('hwboost'));
}
```
Tests whether a `salus-it500-dhw`-typed device appears in the TB inventory. Bridge code comment at `bridge.js:57-67` explicitly states this device type is never emitted by the live bridge. **Result: DHW boost is structurally unreachable in production for all sites.**

**`routes/api.js:136-144` — SCOPE_GROUPS:**
```js
{ key: 'hotwater', label: 'Hot water', level: s =>
    hasControllableDhw(s) ? 'ctl' : hasHotWaterSignal(s) ? 'mon' : 'none' },
{ key: 'heating', label: 'Heating', level: s =>
    s.devices.some(d => d.kind === 'heating' && d.deviceType !== 'boiler-panel') ? 'ctl'
    : s.devices.some(d => d.kind === 'heating') ? 'mon' : 'none' },
```

**Gating signals from OOHDASH-87 — ALL ABSENT from live code:**
- `separate_dhw` — **zero matches** in entire repo (design docs only, `docs/project/OOH_DEVICE_DATA_DICTIONARY_2026-09-16.md:51`)
- `output1OutputMask` — **zero matches** in live code
- `heating_scenario` — **zero matches** in live code
None of the three OOHDASH-87 per-site gating attributes are read by any live code path.

**`public/js/flows.js:506-512` — DHW flow controllability check:**
```js
const dhw = ws.devices.find(d => (d.capabilities || []).includes('hwboost'));
if (f.stage === 0) {
    if (!dhw) {
        doneLine('Hot water not controllable here — capture & escalate');
        return ...
    }
}
```

**Heating flow:** No bug evident. `SCOPE_GROUPS` heating rule (api.js:137) and heating flow (flows.js:365-483) read live TB telemetry for Salus iT700/iT500 and degrade cleanly for boiler-panel. If Sam's "main change" is exclusively DHW, heating may be unaffected — confirm with Sam.

### Scope assessment

**Backend + design/verification** — not a simple client-side tweak.

The suspected bug: the four DHW architectures from OOHDASH-87 are never queried at runtime. DHW controllability relies entirely on a device type (`salus-it500-dhw`) that the bridge never emits. Whether the fix is (a) make that type emit from the bridge; (b) read `separate_dhw`/`output1OutputMask[3]` from TB shared attributes; or (c) read Tuya dhw-named device presence — cannot be determined without the F1 requirements HTML doc and live TB verification on at least one dhw-capable site (6097/6769/5208/6164).

### Open questions / risks

- **BLOCKER:** F1 requirements HTML document not found. Sam to re-send.
- **UNVERIFIED:** Does any live site have `salus-it500-dhw`-typed device in TB inventory? Bridge asserts never.
- **UNVERIFIED:** Do OOHDASH-87 gating signals (`separate_dhw`, `output1OutputMask[3]`) exist as TB shared attributes on dhw-capable sites today? Requires live TB query.

### Proposed approach options

- **Option A — Presence-driven via bridge (minimal TB coupling):** extend bridge to emit `dhw-capable` flag when a dhw-capable device is detected. `hasControllableDhw` tests this flag.
- **Option B — Read TB shared attributes directly (TB-direct, aligns with CIR decision):** read `heating_scenario.separate_dhw` / `output1OutputMask[3]` in `workspacePayload` (api.js:146). Adds one TB round-trip per workspace open.

Neither option should enter design without the F1 HTML doc and live TB verification.

---

## F2 — Trim Lighthouse controls panel to 5 rows (OOHDASH-115)

### Problem statement

The "What Lighthouse controls at this site" side panel shows all 7 SCOPE_GROUPS unconditionally. Sam wants it capped at 5 rows for C&B sites. Two of the 7 (`electrics`, `boiler`) are hardcoded `level: () => 'none'` — always showing "Not on Lighthouse here."

### Current implementation (file:line)

**`public/js/views.js:190`:**
```js
${ws.scope.map(g => `<li>...</li>`).join('')}
```
No cap, no filter, no brand conditional.

**`site.brand` availability:** `tb-device.js:867` — `brand: undefined` in live TB data path. Brand is only populated from fixture data. A C&B brand filter would silently fail in production for all live sites.

### Scope assessment

Client-side only (`views.js:190`). However, a C&B brand filter is not viable without first sourcing `site.brand` from live data (backend data gap). Universal none-filter is viable now with a one-line change.

### Proposed approach

- **Option A (recommended, no blocker):** `ws.scope.filter(g => g.level !== 'none')` in `renderWorkspace()` before rendering. Achieves 5-row outcome universally. One-line change to views.js:190.
- **Option B (blocked):** Brand-conditional cap — requires `site.brand` from a reliable live source first.

**Clarification needed from Sam:** Is intent "hide permanently-none rows everywhere" (Option A) or "specifically C&B sites" (Option B, larger scope)?

---

## F3 — Reword connection-check prompt as optional (OOHDASH-116)

### Problem statement

The connection-check is entered either by operator choice or by automatic diversion from heating/kitchen/fan flows when devices are offline. Sam wants the prompt to make clear it is optional.

### Current wording (exact, with file:line)

**`public/js/views.js:170` — offline banner button:**
```
"Run connection check"
```
Imperative. No optionality signal. No skip affordance. The flow also auto-diverts from heating/kitchen/fan without asking the operator (`FLOWR.connectivity`, flows.js:671-780).

### Proposed new wording

- Button: **"Check connection (optional)"** or add a "Skip — go straight to the issue" chip alongside.

### Scope assessment

**Client-side only — `views.js:170`.** One string change (S-complexity). Does NOT change auto-divert flow logic.

**Clarification needed from Sam:** Does "optional" mean (a) relabel button only; (b) add skip chip; or (c) also change auto-divert behaviour so heating/kitchen can proceed despite offline devices? Option (c) is materially larger scope — flow-logic change in flows.js.

---

## F4 — Surface escalation + engineer-on-site before agent replies (OOHDASH-117)

### Problem statement (safety context)

**Shire Horse incident:** a customer fell, an ambulance was needed. OOH operators must not triage from a position of ignorance about an active P1 escalation or ongoing engineer site visit. **Safety-critical — must not be deferred.**

### Current Zendesk integration (file:line)

**`routes/api.js:148`:** `tickets = await zendesk.ticketsForSite(site.siteNo);`  
**`services/zendesk.js:547-549`:** returns last 4 `recent` tickets. The `active` group (tickets not `solved`/`closed`) is already computed at zendesk.js:537.  
**`ws.tickets`** is sent to the frontend and rendered in the side panel (`views.js:192`). P1 tag (`ooh_p1`) is applied at api.js:267 on P1 outcomes.

**Gap:** No pre-triage banner surfaces open P1 tickets before the operator begins triage — they're visible only in the side panel if the operator scrolls to it.

### Netservice engineer-on-site — integration status

**UNVERIFIED / NOT FOUND.** Zero repo references to `netservice`, `engineer on site`, `onsite`, `site visit`, `attending engineer`, or `attendance` in live code. Only hit is a placeholder at flows.js:785 ("e.g. the attending engineer's name"). OOHDASH-106 (shell-hub migration) is outstanding.

### Scope assessment

**Two separable sub-problems:**

**F4a — Active P1 banner (no external blocker):**
- Backend: add `activeP1Tickets` field in `workspacePayload` — filter `ws.tickets.active` for `ooh_p1`-tagged tickets updated within 24 hours (or a dedicated Zendesk tag search).
- Frontend: red situational-awareness banner in `renderWorkspace()` (views.js:166) above the issue picker when `ws.activeP1Tickets.length > 0`. "Active P1 escalation on record for this site. Review the ticket before advising."
- Cost: one additional Zendesk REST call per workspace open (fail-open, same pattern as api.js:148-149).

**F4b — Engineer on site (blocked on external input):**
- No integration exists. Data source unknown (Bellrock? DPP? Netservice?). Requires Spencer Thompson to identify system, access method, and data contract.
- F4a is deliverable independently — must not wait for F4b.

### Open questions / risks

- **BLOCKED (F4b):** Owner of engineer-on-site attendance data unknown. Spencer to advise.
- Verify Zendesk API supports `tags:ooh_p1` filter in search query alongside site tag (zendesk.js:506-509).
- 24-hour recency filter on P1 check prevents stale-ticket false alarms.
- Zendesk latency: fail-open mandatory.

---

## F5 — PowerPause contractor override read-back (OOHDASH-118)

### Problem statement

Site 6786 (Donkey Derby) reference case. When a contractor has an active PowerPause override, the triage script must surface this before advising any power-off action (CTO directive — Jonathan Wilkinson).

### PowerPause context (from Word doc)

Word document found at `Lighthouse PowerPause Cheat Sheet.docx` describes PowerPause as Tuya-actuated schedule enforcement. It is a site-operator cheat sheet — it does **not** define a software/TB-level attribute for contractor overrides. The "contractor override" as a data entity is undefined by this document.

**Codebase references:** `flows.js:577` — `OohCaptureClass: 'kitchen-powerpause'` (audit tag only, no state read). `services/registry.js:63` — Tuya labelled as PowerPause/kitchen device. `flows.js:782-795` — contractor flow escalates as P1 but reads no override state.

### Where PowerPause state lives

**UNVERIFIED.** PowerPause is Tuya-actuated (registry.js:63). An active override is likely a TB shared attribute on the site or Tuya kitchen device (e.g. `override_active`, `powerpause_override`), or a time-bound config entry — but neither is visible in the repo.

### Scope assessment

**Blocked on data-contract definition.** Jonathan Wilkinson must answer: what attribute, on what entity, in what system holds the contractor override state? What does active/inactive look like?

Once unblocked — likely scope:
- Backend: read override attribute from TB in `workspacePayload`; add `powerPauseOverride: { active: bool, detail: string }`.
- Frontend: banner in kitchen flow stage 0 (flows.js ~line 557) and contractor flow (flows.js ~line 783) when active.

---

## Delivery sequencing recommendation

| # | Story | Complexity | Blocker | Rationale |
|---|---|---|---|---|
| 1 | F4a — Active P1 banner (OOHDASH-117) | S-M | None | Safety-critical; data in workspace; frontend banner |
| 2 | F3 — Connection-check wording (OOHDASH-116) | S | None (clarify scope) | Smallest change; one string in views.js |
| 3 | F2 — Trim controls panel (OOHDASH-115) | S | None if Option A | One-line filter; clarify intent with Sam |
| 4 | F1 — DHW controllability fix (OOHDASH-114) | M-L | HTML doc + TB verification | Largest code uncertainty; needs Sam + Spencer |
| 5 | F5 — PowerPause override (OOHDASH-118) | M | JW data-contract clarification | CTO directive; blocked on attribute schema |
| 6 | F4b — Engineer on site (OOHDASH-117) | L | Spencer / Netservice source | New integration; no existing data path |

F4a and F3 can proceed to design in parallel — different files, no shared dependency.

---

## Cross-cutting risks

- **Brand field unreliability:** `site.brand` is `undefined` in live TB data path (tb-device.js:867). F2 Option B is blocked on this.
- **Zendesk availability:** F4a adds a second Zendesk call per workspace load; fail-open mandatory.
- **Playwright e2e suite:** All frontend changes require e2e coverage (49/49 green, required check). Existing testids: `offline-banner`, `scope-list`.
- **F4 priority:** Shire Horse safety context — F4a must not slip to "nice to have." Ship alongside or immediately after F3.
- **LLM/token cost:** Zero — all integrations are synchronous HTTP API calls (Zendesk, TB) per workspace load. No background polling.

---

## Conditions for design gate (MUST before F1 and F5 enter design)

1. **MUST — F1 requirements document.** Sam Day to re-send "OOH Dashboard — Issue and Lighthouse Data Requirements" HTML. F1 cannot enter design without it.
2. **MUST — F1 live TB verification.** Spencer to query dhw-capable site (6097/6769/5208/6164) — confirm which attributes exist and what values indicate "controllable".
3. **MUST — F5 data contract.** Jonathan Wilkinson to confirm PowerPause contractor override attribute name, entity, system, schema.
4. **SHOULD — F2 intent.** Sam to confirm: universal none-filter (Option A) or C&B-specific cap (Option B).
5. **SHOULD — F4b data source.** Spencer to advise which system holds engineer-on-site attendance and whether any API/feed is available.

---

## Discovery verdict recommendation

**CONDITIONAL GO**

- F4a, F3, and F2 Option A are ready for design immediately — no unresolved blockers.
- F1 and F5 are blocked — must not enter design until conditions 1–3 above are met.
- F4b is a longer-term item requiring external data-source identification before scope can be set.
