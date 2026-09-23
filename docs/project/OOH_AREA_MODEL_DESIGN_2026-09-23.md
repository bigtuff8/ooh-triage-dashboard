<!-- gate:contract
SECTION Decisions first: The design is build-ready and needs no code decisions reopened — B1, B2 and B3 were all settled at the discovery gate. ONE product point is left for James to confirm and it is small: the URGENCY of the aircon referral. This design routes every air-conditioning request through the SAME normal capture-and-refer path the dashboard already uses for the held Intesis-off request today — a next-working-day IoT ticket with a caller script, NOT an overnight P1 with an SMS page. That is the justified default (it matches today's behaviour and aircon is a comfort issue, not an overnight safety risk), but James was away when asked, so it is marked PROVISIONAL for him to confirm or upgrade at this gate.
SECTION What this is: The build-ready design for OOHDASH-82 — collapse the heating "Which area?" step to only two caller-meaningful areas (Accommodation, Bar/Restaurant) derived from device attributes, stop gateways and hardware serials ever appearing as selectable areas, and remove aircon control from the dashboard entirely (every aircon request becomes a captured referral to the IoT team). It names the exact files and functions to change, the code shape for each, the area-to-device fan-out rule, a data dictionary, acceptance-criteria checks and a full test plan. It changes NO product code and proposes NO write-flip; writes stay LOCKED.
SECTION The area-to-device fan-out (B1) — the central design call: Collapsing many device chips to two fixed areas means one area (say Accommodation) can be three thermostats, and today the flow reads back exactly one device by list index. This design defines the fan-out. For the LIVE READ it shows a single representative reading — the COLDEST online thermostat in the chosen area — because a heating call is a complaint about cold, so surfacing the worst-performing zone is the honest and safe choice (an average could hide a freezing room). For CONTROL it specifies a fan-out to ALL controllable thermostats in the area (warming "Accommodation" should warm every accommodation zone, not one), but that path is LATENT — it stays behind the existing write-lock and is not built now; today the request still lands on the write-locked capture path.
SECTION The two-area mapping (B2, confirmed): iT700 thermostats map 100% to Accommodation with no attribute read needed. iT500 thermostats carry a structured site-code whose letter is the signal: s (Staff) and f (Flats) map to Accommodation; r (Restaurant) and b (Bar) map to Bar/Restaurant. iT700-with-default-label and the small share of iT500 with no site-code are handled by explicit fallbacks so no thermostat is ever lost from the list.
SECTION Gateway fix: The 225 paired gateways show as junk area chips because the classifier tests the "salus" name-token before the "gateway" token and returns the first match. The recommended fix is to reorder the classifier so the gateway row is tested first — this corrects the device type everywhere it is read, not just in the chip list — backed by a structural safeguard that the area list only ever accepts real thermostat types, so a gateway can never be an area even if the classifier changed.
SECTION Aircon removal and the referral path (B3): Intesis is removed from the area model and never offers a control. Because there is no longer an aircon "area" chip, this design gives the handler two clear ways to reach the referral: an "Air conditioning" shortcut shown in the heating step when the site actually has aircon units, and smart-entry keywords (air con, aircon, a/c, cooling) that route a typed request straight to the referral. The referral itself reuses the existing capture mechanism — a normal IoT ticket with a caller script (B3 urgency is the confirm-point above).
SECTION Data dictionary and tests: A first-class data dictionary names every new and touched field (the new area field, the two client-scope attributes, the referral capture class) with retention and sensitivity. A full test plan gives unit tests for each rule plus the live handler re-test needed for the parts that cannot be checked headlessly.
DECISION Approve this design for OOHDASH-82 — the two-area model with the coldest-online representative read (B1), the confirmed iT500 s/f/r/b letter mapping (B2), the gateway reorder fix, and the aircon-removal-plus-referral path — so it can proceed to Build? | Approve — proceed to Build | Request changes
DECISION Confirm the aircon referral URGENCY: adopt NORMAL capture-and-refer (next-working-day IoT ticket with a caller script, matching today's held Intesis-off behaviour), rather than the P1/SMS escalation path? | Confirm normal capture | Upgrade to P1/SMS escalation
DETAIL Every current-behaviour claim is traced to a file:line read firsthand on this branch; every estate count is carried from James's full live-ThingsBoard analysis (12,816 devices, 2026-09-23). Writes remain LOCKED throughout — the aircon change REDUCES the control surface and the latent area-control fan-out stays behind the write-lock. No product code was changed; no PR was opened; the Orchestrator raises the governed gate.
-->

# Design — Heating area model: collapse to two areas, remove aircon control (OOHDASH-82)

**Release:** OOH Triage Dashboard — R1 · **Stage:** Design · **Date:** 2026-09-23 · **Owner:** James Brown
**Ticket:** OOHDASH-82 (Story, Highest) — *Heating "area" selector: collapse to two areas (Accommodation / Bar-Restaurant) from device attributes; remove aircon control (refer via ticket).*
**Input (signed off):** `docs/project/OOH_AREA_MODEL_DISCOVERY_2026-09-23.md` (discovery, PR #43 merged).

**Repo state (verified):** branch `design/oohdash-82-area-model` off `main` @ `8f82a31` (`git rev-parse`); package version `1.2.4`; `WRITES_DISABLED=true`; ThingsBoard is the system of record, the integration-bridge sits behind it for command dispatch only.

**Method.** Every current-behaviour claim was re-read firsthand on `main` @ `8f82a31` during this design (file:line below). Every estate count and attribute-coverage figure is carried from James's full live-ThingsBoard estate analysis of 2026-09-23 (`AREA-LABELS-FOR-SAM.md`, 12,816 devices, 100% of tenant) and is marked `doc`. Line numbers below match the current tree.

**Verification legend:** `code` = traced to source on this branch in this design · `code(deployed)` = behaviour also present on the deployed HEAD · `doc` = carried from the verified live-estate analysis.

**Invariants honoured.** Writes to ThingsBoard stay **LOCKED** (`WRITES_DISABLED=true`); nothing here flips them. The aircon-control removal REDUCES the control surface. The area-to-device CONTROL fan-out is **latent** — specified but not wired, and it can only ever run once writes are unlocked and that workstream reviews it. ThingsBoard is system of record. **Design only — no product code was changed;** code was read solely to specify the change precisely.

---

## 1. Scope and non-goals

**In scope (design for Build):**
- A device-to-area derivation that maps a heating device to Accommodation, Bar/Restaurant, or "not an area device", from device type plus a client-scope attribute (§3).
- Reading the two client-scope attributes the derivation needs — not fetched today (§4).
- The gateway mis-classification fix (§5).
- Aircon-control removal and a captured-referral path with a clear handler route (§6).
- The flow UI change: two area chips, the area-to-device fan-out for read and latent control (§7).
- Data dictionary (§8), acceptance-criteria checks (§9), test scripts and test data (§10).

**Non-goals / invariants (do not violate):**
- **Writes stay LOCKED.** The area-control fan-out (§7.3) is latent and behind the write-lock; it is not built in this workstream.
- **No new referral pipe.** The aircon referral reuses the existing capture mechanism (`outcomeCaptured`), never a parallel one (§6).
- **ThingsBoard is system of record;** the integration-bridge is command-dispatch only. No change here.
- **Design only** — proposed code shapes match existing style; no product source is edited in this artefact.

---

## 2. Current behaviour this design changes (firsthand)

All line numbers read on `main` @ `8f82a31`; behaviour also present on the deployed HEAD.

| # | Current behaviour | Evidence (file:line) | Ver |
|---|---|---|---|
| C1 | The area-chip candidate set is every heating-kind device. | `public/js/flows.js:86` — `heatingZones()` filters devices with `kind` equal to heating | code(deployed) |
| C2 | One chip per heating device; the chip label is the raw `zone`; the chosen chip is stored only as the list index. | `public/js/flows.js:231-232` — chips map to `flowStep({zi:i})` and show the raw zone | code(deployed) |
| C3 | The chosen chip is dereferenced to exactly ONE device by that index; all reads use that single device. | `public/js/flows.js:234` — `const z = zones[f.data.zi]`, then `z.telemetry`, `z.online`, `z.deviceId`, `z.deviceType` | code(deployed) |
| C4 | The confirmed-area line echoes the same raw label. | `public/js/flows.js:239` — `doneLine('Area: ' + z.zone)` | code(deployed) |
| C5 | `zone` is the first non-empty of label, then zone-attr, then site-attr, then name; for these devices the label is a hardware serial. | `services/tb-device.js:405` — the `zone` assignment in `mapTbDevice` | code(deployed) |
| C6 | The three Salus rows and the Intesis row are typed as heating; the gateway row is typed gateway and listed LAST. | `services/tb-device.js:152-162` — `ASSET_INTENT` ordering | code(deployed) |
| C7 | Name-token classification returns the FIRST matching row, so a gateway whose name carries a salus token is typed heating before the gateway row is tested. | `services/tb-device.js:319-337` (`matchAssetIntent`), reached from `classifyDevice` `:281` | code(deployed) |
| C8 | Aircon (Intesis) setpoint control is offered today: Warmer/Cooler on an Intesis device calls `openControl` (a setpoint change). | `public/js/flows.js:273-277` | code(deployed) |
| C9 | Intesis OFF is already redirected to a normal capture (not fired) — the template this design generalises. | `public/js/flows.js:284-292` (`outcomeCaptured` with class `intesis-off-held`) | code(deployed) |
| C10 | The registry still grants Intesis a setpoint command. | `services/registry.js:32-45` | code(deployed) |
| C11 | Control is globally gated by the write-lock: `openControl` refuses and redirects to capture when writes are disabled. | `public/js/control.js:51-57` | code(deployed) |
| C12 | Client-scope attributes are NOT read today; `fetchTelemetry` reads only latest timeseries plus the server-scope active flag. | `services/tb-device.js:465-494` | code(deployed) |
| C13 | The canonical device shape from `mapTbDevice` flows unchanged into the workspace the UI reads, so any new field added there reaches the front end. | `routes/api.js:152-161` spreads each device into the workspace payload | code(deployed) |

**The load-bearing consequence (B1).** C2 and C3 are the pair that breaks: the flow encodes the chosen area as a list index and reads back one device. Collapsing to two fixed areas severs that one-to-one link — Accommodation may be three thermostats. Defining the area-to-device fan-out for read and latent control is the primary design task (§7), not a relabel.

---

## 3. Device-to-area derivation (task 1)

**Where it lives.** A new pure function `deriveArea(deviceType, clientScope)` in `services/tb-device.js`, alongside `classifyDevice`. It is called from `mapTbDevice` (`tb-device.js:397-417`) and its result is written into the canonical device shape as a new `area` field, so the UI never re-derives a location.

**Return values.** The string `Accommodation`, the string `Bar/Restaurant`, or `null` (meaning "not an area device" — gateways, temp sensors, aircon, and any unmapped case). `null` is the safe default.

**Rules (B2, confirmed by James).**
1. `deviceType` equal to `salus-it700` returns **Accommodation** unconditionally. The iT700 is the one-per-site accommodation controller and maps 100% to Accommodation (`doc`), so no attribute read is needed and the 133 units carrying the useless default label `IT700` are correctly placed regardless.
2. `deviceType` equal to `salus-it500` parses the site-code letter (helper below) and returns **Accommodation** for `s` (Staff) or `f` (Flats), and **Bar/Restaurant** for `r` (Restaurant) or `b` (Bar). Any other or missing letter returns `null` (fallback, §7.2).
3. Every other `deviceType` (intesis, gateway, tuya, refrigeration, boiler-panel, unknown) returns `null` — never an area.

**Site-code parse.** A helper `parseSiteCodeLetter(siteCode)` extracts the single letter from the iT500 `site` client-scope value. Observed shapes are like `(1771-f-1)` and `5670-s-1` (`doc`): a site number, a hyphen, the class letter, a hyphen, an instance number, optionally wrapped in parentheses. The helper lower-cases the value and matches the class letter with the anchored pattern `^\(?\s*\d+\s*-\s*([sfrb])\s*-` (first capture group is the letter). No match returns `null`. This is bleed-safe because it anchors on the leading site-number-then-hyphen and only accepts the four known class letters.

**Why derive once, in the service.** Placing `area` on the canonical shape (not in the flow) means the classifier row order, the attribute parse, and the fallback rules all live in one tested service function; the front end reads a plain `d.area`. This mirrors how `kind`, `deviceType` and `capabilities` are already server-derived and consumed opaquely by the UI (C13).

---

## 4. Fetch the location attribute (task 2, the discovery Q4 gap)

**The gap.** The derivation for iT500 depends on the `site` client-scope attribute, and `salusLocation` (iT700) is the discovery's named partner attribute — but **client-scope attributes are not read today** (C12). `fetchTelemetry` (`tb-device.js:465-494`) reads only latest timeseries and the server-scope `active` flag.

**New read.** Add a `readClientScopeAttributes(uuid, keys)` export to `services/tb-client.js`, mirroring the existing `readServerScopeAttributes` (`tb-client.js:122-132`) but against the `CLIENT_SCOPE` attributes endpoint (`/api/plugins/telemetry/DEVICE/{uuid}/values/attributes/CLIENT_SCOPE?keys=...`). It folds the TB array form to a plain key-to-value map exactly as the server-scope helper does. Read-only by contract.

**Where it is called.** In `fetchTelemetry` (`tb-device.js:471`), add a THIRD concurrent settled read per device — `readClientScopeAttributes(uuid, 'site,salusLocation')` — into the existing `Promise.allSettled` group so it runs alongside the timeseries and server-scope reads with no extra serial round-trip. A failed client-scope read degrades that one device to no client-scope (area falls back to the §7.2 rule), never the whole site — matching the existing fail-safe posture (`tb-device.js:484-490`). Stash the resolved map on the telemetry bag under a private key `__clientScope`.

**Where the value lands.** In `fetchLiveSitesByNumber` (`tb-device.js:520-527`), the private `__active` key is already stripped from the bag before mapping; strip `__clientScope` the same way and pass it into `mapTbDevice(raw, telemetryBag, clientScope)`. In `mapTbDevice` (`tb-device.js:397-417`), call `deriveArea(cls.deviceType, clientScope)` and set the new `area` field on the returned shape. The `area` field then reaches the workspace through the unchanged spread at `routes/api.js:153` (C13).

**iT700 efficiency note.** Because `salus-it700` maps to Accommodation unconditionally (§3 rule 1), the derivation does not strictly need `salusLocation` at all; it is read only so the value is available for future display and the data dictionary records it, and because it is batched into the one already-concurrent call it costs no extra round-trip. If the per-site read latency is ever a concern, `salusLocation` can be dropped from the key list with no change to area behaviour — the `site` code is the only attribute the mapping actually consumes.

**iT700 default-label handling.** No special handling is required: the 100% Accommodation rule sidesteps the label-quality problem entirely, so the 133 units carrying the default `IT700` are placed in Accommodation like every other iT700 (`doc`).

---

## 5. Gateway mis-classification fix (task 3)

**Root cause (recap, code-confirmed).** A gateway carries no switch/setpoint telemetry, so classification falls to the name-token path (`classifyDevice:281` calls `matchAssetIntent:319`). That function returns the first `ASSET_INTENT` row whose token matches, and the Salus rows are ordered before the gateway row (`tb-device.js:153-161`). A gateway name such as `gk-6218-salusit700-gateway-1` tokenises to include `salusit700`, matches the very first row, and is typed heating before the gateway row at `:161` is ever tested (C6/C7).

**Two options analysed.**

| Option | What it changes | Corrects the type everywhere? | Regression risk |
|---|---|---|---|
| A — reorder `ASSET_INTENT` so the gateway row is tested before the three Salus rows | The gateway name matches the gateway row first and is typed gateway; the device is then correctly excluded from the heating candidate set. | Yes — the device is typed gateway in every consumer (scope groups, counts, chips), not just the chip list. | Low — see analysis below. |
| B — filter out gateway-kind devices only at the area candidate set | Leaves the device mis-typed as heating but hides it from the chips. | No — the device is still wrongly heating everywhere else. | Low but leaves the root defect in place. |

**Recommendation: Option A (reorder), with a structural backstop.** Move the gateway row (`tokens gateway, r10a, dragino, gw`) above the three Salus rows in `ASSET_INTENT`. This is the root-cause fix: a paired gateway is typed gateway everywhere.

**Regression analysis (why Option A is safe).** The name-token path is only reached for devices with NO switch/setpoint telemetry (`classifyDevice:271-281`); genuine thermostats are classified capability-first from their setpoint signal, and the name only refines the deviceType WITHIN the heating family (`:288`), which never selects the gateway row. So reordering cannot re-type a real thermostat. For a no-telemetry device to be newly caught by the gateway row it would need a tokenised name containing `gateway`, `r10a`, `dragino`, or the exact token `gw` — the `gw` token is guarded exact-only for tokens of three characters or fewer (`:322-326`), so it cannot bleed, and no genuine Salus thermostat name carries the longer gateway tokens (`doc`). Risk is therefore low.

**Structural backstop.** Independently of classifier order, the area derivation (§3) only returns a non-null area for `salus-it700` and `salus-it500`, and the flow's area-candidate set (§7.1) accepts only devices with a non-null `area`. So a gateway can never become an area chip even if the classifier were later changed — defence in depth. Acceptance criterion AC3 is satisfied by the reorder; the backstop guarantees it structurally.

---

## 6. Aircon-control removal and the referral path (task 4)

**End state.** Intesis is never an area, never offers a control, and every aircon request becomes a captured referral to the IoT team via the existing capture mechanism. Four touch points change.

| # | Touch point | Today | Change (for Build) | Evidence |
|---|---|---|---|---|
| A1 | Classifier Intesis row | Intesis typed as heating, so it surfaces as an area chip. | Re-kind Intesis to `kind` equal to `aircon` (deviceType stays `intesis`). It is then excluded from the heating candidate set and from the area derivation (which already returns null for intesis, §3). | `tb-device.js:156` |
| A2 | Classifier control grant | `classifyDevice` grants Intesis a setpoint control when a setpoint signal is present. | Force Intesis to non-controllable: in `classifyDevice`, when the resolved deviceType is `intesis`, set `controllable` false and `control` null before returning (`tb-device.js:302-315`). | `tb-device.js:288-291,302-315` |
| A3 | Registry Intesis entry | Intesis lists a setpoint command. | Set the Intesis `commands` list to empty so `validateCommand` refuses any Intesis command server-side (defence in depth, mirroring the refrigeration monitor-only pattern). | `services/registry.js:32-45` |
| A4 | Heating flow Warmer/Cooler branch | Warmer/Cooler on an Intesis device fires `openControl` (C8); Intesis-off already captures (C9). | The heating flow no longer sees Intesis at all (A1 removes it from the candidate set), so the `intesis` branches at `flows.js:273-292` become dead and are removed. Aircon requests are served by the new referral flow below. | `flows.js:273-292` |

**Net effect.** Intesis never appears as an area (A1), never offers a control (A2/A3), and any aircon request is captured and referred (below). This REDUCES the control surface, consistent with the write-lock.

**The handler route to the referral (the discovery's open question).** Removing the Intesis area chip removes the old way a handler reached an aircon action, so the design gives two explicit routes into a small new referral flow:

1. **Smart-entry keywords.** Add an `aircon` category to the keyword map (`public/js/flows.js` keyword groups) with words such as air con, aircon, a/c, ac, cooling, air conditioning. A typed request then surfaces the "Air conditioning" suggestion chip and carries the handler's words into the referral via the existing `startSuggestedFlow` / `startTileFlow` path.
2. **In-context shortcut.** In the heating flow's first step (`flows.js:229-232`), when the site has any device with `kind` equal to `aircon`, render a clearly-labelled "Air conditioning (handled by the IoT team)" chip beneath the two area chips. It is visibly NOT one of the two areas; selecting it starts the referral flow. This catches the common case of a caller who says "heating" but means the AC.

**The referral flow.** A single-step `aircon` flow renderer whose only outcome is a normal capture via `outcomeCaptured` (`flows.js:158`), reusing the exact mechanism behind today's `intesis-off-held` capture (C9). Proposed outcome shape: subject "Air conditioning request (site)", a detail line recording the caller's request and that aircon is not controllable from the dashboard, a caller script explaining the IoT team will pick it up on the next working day, and a new `OohCaptureClass` value `aircon-referral`. No setpoint, no `openControl`, no write. This is a **normal** capture (next-working-day IoT ticket with a caller script), NOT the P1/SMS escalation path — matching today's held Intesis-off behaviour, because aircon is a comfort issue rather than an overnight safety risk. **This urgency choice is PROVISIONAL — James to confirm at this gate** (contract DECISION 2).

**Anti-reinvention.** The referral reuses `outcomeCaptured` and the existing `POST /api/outcomes` path (`flows.js:158-164`); it builds no parallel referral pipe. The only new artefacts are the keyword group, the shortcut chip, the one-step renderer, and the `aircon-referral` capture class.

---

## 7. Flow UI change and the area-to-device fan-out (tasks 1 and 5, the central design call)

### 7.1 Two area chips instead of per-device chips

Replace `heatingZones()` (`flows.js:86`) and the chip render (`flows.js:231-232`) with an area-first model:

- A new `heatingDevices()` returns the site's controllable heating devices — those with `deviceType` equal to `salus-it700` or `salus-it500` (this structurally excludes gateways, intesis, temp sensors; the boiler-panel case is handled in §7.4).
- A new `heatingAreasPresent()` returns the DISTINCT non-null `area` values across `heatingDevices()` — at most the two strings Accommodation and Bar/Restaurant, in a fixed display order (Accommodation first).
- The first step renders one chip per present area, labelled with the area name, plus the aircon shortcut (§6) when the site has aircon, plus the unmapped-fallback chip (§7.2) when needed. The chosen area is stored by NAME: `flowStep({area: 'Accommodation'})`, not by list index. This fixes C2 and C4 (the confirmed-area line now echoes the area name, never a serial).
- The existing "No heating on Lighthouse at this site" branch (`flows.js:230`) is retained and now triggers when no present area and no fallback device exists — the empty-state copy (discovery Q5) is unchanged.

### 7.2 iT500 fallback (the small share with no site-code)

An iT500 with a setpoint control but no parseable site-code letter derives `area` null (§3 rule 2). Such a device must never be lost. Design: `heatingAreasPresent()` also reports whether any controllable heating device has a null area; when so, the first step shows one extra fallback chip labelled "Heating — area not identified" (present only when such a device exists). Selecting it resolves to the set of null-area controllable heating devices and proceeds through the same read/control fan-out below. This respects AC1 (the label is caller-meaningful, never a serial) while guaranteeing no device is dropped. As site-code coverage improves the chip simply stops appearing. (Conservative alternative, if the gate prefers: route the fallback straight to capture-and-refer instead of a live read — noted, not recommended, because it needlessly denies a live reading the handler could use.)

### 7.3 The read fan-out (B1 — read): coldest online representative

An area now resolves to a device SET. The live read shows a single **representative** reading chosen by this rule, in a new helper `areaRepresentative(devices)`:

1. Consider only the online devices in the area's set.
2. If none are online, treat the area as offline and route to the existing connectivity branch exactly as today (`flows.js:240`).
3. Among the online devices, pick the one with the LOWEST current temperature (first non-empty of `localTemperature`, then `roomSensor1Temp`). Break ties by `deviceId` ascending for determinism. If no online device has a numeric temperature, pick the first online device by `deviceId` ascending.

The chosen representative becomes the single `z` the rest of the heating flow already uses (`flows.js:234` onwards) — so `z.telemetry`, `z.online`, `z.deviceId`, `z.deviceType`, temperature/setpoint reads and the boiler-panel branch all keep working unchanged. The read subline is made honest: it states the representative device and, when the area has more than one device, appends a small note such as "coldest of N zones in Accommodation" so the handler knows the reading is the worst-case zone, not the only zone.

**Why coldest-online, and alternatives rejected.** A heating call is a complaint about cold, so the coldest zone is the one most likely to be the caller's subject and the safest to surface — an average or a "primary device" reading could hide a genuinely freezing room behind a warm one, which for an overnight welfare call is the wrong failure mode. Showing a full list of all thermostats was rejected because it reintroduces exactly the serial-soup clutter this ticket removes. Coldest-online degrades cleanly: when an area is a single device it is identically today's single-device read.

### 7.4 The control fan-out (B1 — control): latent, apply-to-all, behind the write-lock

When the caller wants Warmer/Cooler, the intent is to change the WHOLE area, not one zone. The control design is therefore an apply-to-all fan-out:

- A latent helper `applyAreaControl(devices, direction)` would iterate the controllable devices in the area and dispatch each through the EXISTING validated single-device path (`openControl` then the registry-guarded dispatch), each independently validated against its own setpoint window and each independently write-locked, returning a per-device result summary.
- **It is not wired now.** Because `WRITES_DISABLED=true`, `openControl` short-circuits to the blocked modal and redirects to capture for any device (C11). So today the flow keeps calling `openControl(z, direction)` on the representative, which only ever reaches the write-locked blocked path — behaviourally identical to today. The fan-out is a LATENT specification the write-enable workstream must implement BEFORE unlock, so that "make Accommodation warmer" does not silently warm only one of three zones.
- Degrades cleanly: when an area is a single device, apply-to-all is exactly today's single-device control.

**Why apply-to-all, and the safety flag.** Targeting one representative thermostat would leave the caller's other accommodation rooms cold, contradicting the request. Apply-to-all matches caller intent. The larger blast radius is acceptable ONLY because it is latent behind the write-lock and must be reviewed at the write-flip; the design flags this explicitly as a write-flip precondition. The conservative alternative (control the representative only) is recorded for the write-flip review to weigh; this design recommends apply-to-all with per-device validation.

### 7.5 The confirmed-area line and read-back (C3/C4 fix)

The stored `f.data.area` (a name) replaces `f.data.zi` (an index). `doneLine` echoes the area name (`flows.js:239`). The single-device dereference `zones[f.data.zi]` (`flows.js:234`) becomes: resolve the area's device set, then `const z = areaRepresentative(set)`. All downstream reads are unchanged because `z` is still one device.

---

## 8. Data dictionary (mandatory)

The naming standard for every entity and field this work adds or touches. Names are unique; the context prefix column disambiguates where the same concept recurs.

| Field / entity | Where it lives | Type and allowed values | Context / prefix | Retention | Sensitivity |
|---|---|---|---|---|---|
| `device.area` | canonical device shape (`mapTbDevice`), flows to workspace | String Accommodation, string Bar/Restaurant, or null (not an area device) | New field; the single source of a device's caller-meaningful area | In-memory only; per-request, honours the 30s site cache | Low — a location class, not personal data |
| `clientScope.site` | TB CLIENT_SCOPE attribute, read via `readClientScopeAttributes` | String site-code, e.g. 1771-f-1; the class letter is s, f, r, or b | iT500 only; the sole attribute the area mapping consumes | Read live, not persisted by the dashboard | Low |
| `clientScope.salusLocation` | TB CLIENT_SCOPE attribute | Free text (often the default IT700) | iT700 partner attribute; read for display/vocabulary, not required for area | Read live, not persisted | Low |
| `siteCodeLetter` | parse output of `parseSiteCodeLetter` | One of s, f, r, b, or null | Derivation intermediate; not stored on the shape | Transient | Low |
| `device.kind` (aircon) | classifier output | New value aircon (added alongside heating, kitchen, lighting, fan, gateway, fridge, unknown) | Re-kinds Intesis so it leaves the heating candidate set | In-memory | Low |
| `OohCaptureClass` = `aircon-referral` | capture payload (`outcomeCaptured` to `/api/outcomes`) | String constant aircon-referral | New capture class for aircon requests; sits beside intesis-off-held, boiler-panel-heating | Persisted on the IoT ticket per existing capture retention | Low — operational, no caller PII beyond the existing caller-words field |
| `flow.data.area` | heating flow state | String area name (replaces the numeric flow.data.zi) | Replaces the list-index selection with a named area | Client session only | Low |

No new personal-data field is introduced. The caller-words field already carried on every capture is unchanged by this work.

---

## 9. Acceptance criteria to verification (task 6)

| AC | Ticket requirement | Concrete testable check | Unit-testable | Needs live re-test |
|---|---|---|---|---|
| AC1 | "Which area?" presents only Accommodation and/or Bar/Restaurant (only those present), never serials/names. | `heatingAreasPresent()` over a fixture with iT700 plus s/r iT500s returns exactly the present area names; the rendered chips carry those names and no serial. | Yes (logic) plus DOM-level render assert | Yes — handler login, confirm chips read as area names |
| AC2 | A chosen area maps to the correct underlying heating device(s) for read and control. | `deriveArea` returns the right area per device type and letter; `areaRepresentative` returns the coldest online device; the resolved set for an area contains exactly the right devices. | Yes | Yes — confirm the live read matches the coldest zone |
| AC3 | Gateway devices no longer appear as selectable areas. | `classifyDevice` types a `gk-...-salusit700-gateway-1` name as gateway (reorder fix); `heatingAreasPresent` excludes it; `deriveArea` returns null for it. | Yes | Partial — spot-check a real paired-gateway site |
| AC4 | Aircon: no control action in the dash; requests captured and referred by ticket. | `classifyDevice` returns non-controllable for intesis; `validateCommand` refuses every Intesis command (empty registry commands); the aircon flow yields a capture with class `aircon-referral` and no `openControl`; the keyword and shortcut both reach the referral. | Yes | Yes — handler login, confirm no control offered and a referral ticket is raised |

**Live re-test note.** AC1, AC2 and AC4 each need a handler-login Playwright pass because the chip render, the live coldest-zone read, and the referral ticket all depend on live inventory and session state that cannot be exercised headlessly. AC3 is fully unit-testable; a single live spot-check on a known paired-gateway site is a belt-and-braces confirmation.

---

## 10. Test scripts and test data (mandatory)

### 10.1 Unit tests (`npm run test:unit`, `test/*.test.js`)

| Item | New/changed test file | Assertions |
|---|---|---|
| Area derivation | `test/area-derivation.test.js` (new) | iT700 returns Accommodation with and without salusLocation; iT500 with letter s and f returns Accommodation; with r and b returns Bar/Restaurant; with an unknown or missing letter returns null; intesis, gateway, tuya return null. |
| Site-code parse | same file | `parseSiteCodeLetter` extracts the letter from `(1771-f-1)`, from `5670-s-1`, is case-insensitive, and returns null for empty, malformed, or non-sfrb letters. |
| Gateway classify | `test/gateway-classify.test.js` (new) | A `gk-6218-salusit700-gateway-1` name classifies as gateway (kind gateway) after the reorder; a genuine `gk-6218-salusit700` thermostat with setpoint telemetry still classifies as salus-it700 heating (regression guard); the `gw` short token still does not bleed into other names. |
| Aircon removal | `test/aircon-removal.test.js` (new) | An intesis device classifies non-controllable with null control; `validateCommand` refuses a setpoint on intesis; the aircon flow submits a capture with `OohCaptureClass` aircon-referral and never calls `openControl`; an aircon keyword resolves to the aircon suggestion. |
| Read fan-out | `test/area-representative.test.js` (new) | With three online Accommodation thermostats, `areaRepresentative` returns the coldest; ties break by deviceId ascending; all offline returns none (drives the connectivity branch); a single-device area returns that device (clean degrade). |
| Client-scope read | `test/tb-clientscope.test.js` (new) | `readClientScopeAttributes` folds the TB array form to a map; a failed client-scope read degrades one device to no client-scope without failing the site (fail-safe). |

Model the new tests on the existing `test/refrigeration-deny.test.js` (classifier assertions) and `test/hotwater-scope.test.js` (flow-outcome assertions).

### 10.2 Test data (realistic, no lorem)

A fixture site (extend `data/fixtures/bridge-devices.json` or a test-local fixture) representing a real mixed estate site, for example site 6218:
- iT700 thermostat `gk-6218-salusit700`, salusLocation `IT700` (the default case), setpoint 21C, localTemperature 19C, online — expected Accommodation.
- Paired gateway `gk-6218-salusit700-gateway-1`, no telemetry, offline — expected gateway, never an area.
- iT500 `gk-6218-salusit500-2`, client-scope site `6218-s-1`, setpoint 20C, localTemperature 17C, online — expected Accommodation (Staff), and the coldest of the Accommodation set (so the representative).
- iT500 `gk-6218-salusit500-3`, client-scope site `6218-r-1`, setpoint 20C, localTemperature 21C, online — expected Bar/Restaurant.
- iT500 `gk-6218-salusit500-4`, no client-scope site — expected the "Heating — area not identified" fallback.
- Intesis `gk-6218-intesis-1`, setpoint 24C, no location attribute — expected aircon, no control, referral only.

This drives every branch: two present areas plus the fallback chip plus the aircon shortcut; the Accommodation representative is the 17C Staff iT500; the gateway is absent from the chips.

### 10.3 Live re-test script (handler login, Playwright)

1. Log in as a handler; open a mixed site (e.g. 6218). In the heating flow, confirm the first step shows Accommodation and Bar/Restaurant chips (and the fallback chip if present), an "Air conditioning" shortcut, and NO serials or gateway chips (AC1, AC3).
2. Choose Accommodation; confirm the live read shows the coldest online zone with the "coldest of N zones" note; confirm the confirmed-area line reads Accommodation, not a serial (AC2).
3. Choose the aircon shortcut and, separately, type "air con not working"; confirm both reach the referral and raise a capture ticket with class aircon-referral and no control button anywhere (AC4).
4. Confirm Warmer/Cooler still routes to the write-locked capture path (writes remain locked) — no live actuation.

---

## 11. Risks and open items for Build

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Coldest-online representative surprises a handler who expected a specific zone's reading | Low | Medium | The read subline states it is the coldest of N zones; single-device areas are unaffected; the rule is documented in the handler support doc. |
| Latent control fan-out ships wrong at write-flip (applies to all when only one was intended, or vice versa) | Medium | High | Fan-out is latent behind the write-lock and flagged as an explicit write-flip precondition for review; today only the write-locked capture path runs. |
| Client-scope read adds latency to the per-site query | Medium | Medium | Batched into the existing concurrent settled reads; honours the 30s cache; salusLocation is droppable with no area impact if latency bites. |
| An unmapped iT500 (no site-code) is mis-placed | Low | Medium | Unmapped derives null and lands in the clearly-labelled fallback chip, never guessed into an area; coverage improvement removes the chip. |
| Gateway reorder regresses a genuine Salus device | Low | Medium | Reorder only affects no-telemetry devices; thermostats are classified capability-first; regression guard test asserts a real thermostat still types as salus. |
| Aircon referral urgency wrong for a genuine overnight AC emergency | Low | Medium | Normal capture is the provisional default (B3); the gate decision can upgrade to P1/SMS if James wants; the escape is a product call, not a code constraint. |

### Decided (do not reopen)
- **B1 read** — coldest online representative, deterministic tie-break (§7.3).
- **B1 control** — apply-to-all fan-out, latent behind the write-lock (§7.4).
- **B2** — iT500 letter mapping s/f to Accommodation, r/b to Bar/Restaurant; iT700 to Accommodation 100% (§3).
- **Gateway fix** — reorder `ASSET_INTENT`, plus the structural area-allowlist backstop (§5).
- **Aircon mechanism** — reuse `outcomeCaptured` with class aircon-referral; two handler routes (§6).

### Still needs confirm (James, at this gate)
- **B3 urgency** — NORMAL capture-and-refer versus P1/SMS escalation for aircon. Design default and recommendation: NORMAL capture (matches today's held Intesis-off behaviour; aircon is a comfort issue). **This is the single open product point** (contract DECISION 2).

---

## 12. Realising the customer-experience criteria

| Discovery CX target | How this design realises it | Where to see it |
|---|---|---|
| Handler sees caller-meaningful areas, never serials | Two named area chips derived server-side; serials and gateways structurally excluded | §7.1, §5 backstop; live re-test step 1 |
| The right heating is read for the caller's area | Coldest-online representative surfaces the worst-performing zone, the one most likely to be the complaint | §7.3; live re-test step 2 |
| No device is ever silently lost | iT700/iT500 mapping plus the explicit fallback chip for unmapped iT500 | §7.2 |
| Aircon is handled honestly, not half-controlled | All Intesis control removed; every aircon request becomes a captured referral with a caller script | §6; live re-test step 3 |
| Nothing overpromises under the write-lock | Control stays on the write-locked capture path; the fan-out is latent and flagged for the write-flip review | §7.4; live re-test step 4 |

---

## 13. Handoff to Build

- **Design doc** — this artefact is the contract for what to build (files, functions, code shapes in §3 to §7).
- **Data dictionary** — §8 is the naming standard Build implements against and the tester reads against.
- **Test scripts and test data** — §10 gives the unit tests, the realistic fixture, and the live re-test to run post-build.
- **CX mapping** — §12 marks the load-bearing moments that must not be flattened in implementation.
- **Open flags** — the single confirm-point is B3 urgency (§11); the latent control fan-out (§7.4) is a write-flip precondition, not part of this build.

---

*All line numbers read firsthand 2026-09-23 against branch `design/oohdash-82-area-model` off `main` @ `8f82a31`. Estate counts and attribute-coverage figures are carried from James's full live-ThingsBoard estate analysis of 2026-09-23 (`AREA-LABELS-FOR-SAM.md`, 12,816 devices), marked `doc`. Writes remain LOCKED — no write-flip is proposed; the aircon change reduces the control surface and the area-control fan-out is latent behind the write-lock. This artefact changed no application source, opened no PR and raised no gate — the Orchestrator governs those.*
