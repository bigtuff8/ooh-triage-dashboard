<!-- gate:contract
SECTION: What this design fixes
OOHDASH-128. About 380 older Salus thermostats (names like gk_wingfieldfarm_salus_STA10108576 (5694-r-2)) never load into the dashboard, because the site search only looks for names starting gk-5694. This design adds one extra lookup per site for names carrying the bracketed site code "(5694-", with a strict check that the number in the bracket is exactly this site. Once loaded, the existing OOHDASH-108 and OOHDASH-123 logic already types them, places them in Accommodation or Bar/Restaurant from the letter, and shows them honestly as "not reporting". No ThingsBoard data is changed.

SECTION: What the handler will see
Very little changes on screen, on purpose. The area question stays the same two buttons. If an area has a modern thermostat that is reporting plus older units that are not, the reading still comes from the modern unit, and one new grey line under it says how many other units in that area are not reporting and that nothing done on the call caused it. If every unit in an area is silent, the handler gets today's "not reporting" outcome with no controls. Three sites (5204, 5788, 5791) each have one older unit whose site code has no usable letter; a one-line footnote under the area question acknowledges it, and it is kept out of the area buttons. The site banner does not change: all 74 affected sites already show the "some equipment not responding" banner today.

SECTION: Evidence behind the design (live, read-only, 14 Oct 2026)
Running the repository's own classifier over all 385 live older-Salus names: 382 type as older Salus and 3 are modern-named gateways that already load. 358 carry a bracket starting with a site number, so the new lookup will load them: 355 get an area (202 Accommodation, 153 Bar/Restaurant) and 3 get none. The other 27 cannot load by this route: the 9 with no bracket (deferred to OOHDASH-129 per D2) and 18 whose bracket has no site number at all (for example (?7?4-?-?), (JWTEST-R1), and an empty bracket). The bracket search is case-insensitive and matches anywhere in the name. No two affected site numbers are prefixes of each other. Searches for (519-, (520- and (518- return nothing. One lookup takes 33 to 63 ms. Every older unit checked last reported on 2 June 2026 and shows active false.

SECTION: Code change in one paragraph
Build changes services/tb-device.js and public/js/flows.js only, plus tests, fixtures and the support guide. In fetchLiveSitesByNumber, the bracket lookup runs alongside the existing gk- lookup. Results from both go through the existing de-duplication by device ID. A device is kept if it passes the existing anchored filter (unchanged) or a new strict older-Salus check. The 30-second per-site cache is unchanged and simply holds the larger device list. If the extra lookup fails, the site still loads exactly as it does today, and a warning is logged. In flows.js, older units with no area are counted for the footnote and kept out of the "area not identified" button, and the reading line becomes honest about units that are not reporting.

SECTION: Cost and silent running
Every site opened makes one more small ThingsBoard request, about 50 ms. It runs at the same time as the existing request, so the page does not get slower. On sites that have no older units it returns nothing. On the 74 affected sites, each older unit adds the same three per-device reads every other device already gets, all run in parallel: about 15 extra requests per 30-second refresh while a handler has the site open. There is no subscription, no per-call charge, no AI spend and no new background process. Nothing runs when nobody is looking at a site. Both criteria are fully met.

SECTION: Testing and the OQ6 pre-ship spot-check
The tests include unit tests for the strict check: 520 versus 5204, malformed brackets, upper case, duplicates, a fake ThingsBoard that returns every site's older units, lookup failure, and the cache. They also cover the new screen lines in both singular and plural, and a test that a fresh older unit is not forced offline (T8). Two new fixture sites drive a new Playwright spec. The existing required e2e suite must stay green unchanged. Before release, an opt-in read-only live check runs against five real sites with exact expected results: 5694 (baseline), 5204 (has a z letter), 5788 (has a swapped 1-s code), 5191 (only older units) and 5791 (no-area unit, plus the deferred no-bracket units). Each workspace must hold only that site's devices, and the modern device list must be identical to v1.4.0.

SECTION: Risk and rollback
The main risk is loading another site's devices. This is closed three ways: the search text ends in a hyphen, the bracket number must equal the site number exactly, and the name must contain _salus_. The pre-ship check proves it on five sites. Rollback means redeploying the v1.4.0 image. There is no data or configuration to undo.

SECTION: Decisions and open questions
Two decisions for James: D3 (where the no-area units are acknowledged) and D4 (version number). Settled at discovery: D1 Option A, D2 deferral of no-bracket units to OOHDASH-129, OQ1, OQ2, OQ4 accepted, OQ5 footnote, and OQ6, which is specified here. Still open: OQ3 (Spencer, only for a future rename), OQ7 (who owns the 18 units with no site number in their code) and OQ8 (whether the printed support-guide PDF is re-issued). None of these block Build.

DECISION: Where the 3 no-area older units are acknowledged (D3, OQ5 interpretation) | Footnote under the heating area question only; keep them out of the "Heating - area not identified" button | Footnote AND also add them to the "Heating - area not identified" button (an extra button that always ends in "not reporting")
DETAIL: OQ5 asked for a site-level count, not device detail. Today's code would automatically put these units behind the "area not identified" button, which would add a question option that can only ever dead-end. The recommendation keeps that button for what it was built for (unmapped iT500 and boiler panels) and shows the count once, where the heating conversation starts. It affects 3 units at 3 sites today.

DECISION: Release version (D4) | Patch release v1.4.1 (bug fix: devices that should always have loaded now load; no new capability) | Minor release v1.5.0 (to flag the visible change on 74 sites)
DETAIL: Patch is recommended. Nothing new can be done from the dashboard. Devices that were wrongly missing now appear, with three small copy additions. The release notes and support guide carry the communication.
-->

# DESIGN -- OOHDASH-128
## Load older-convention ("bare") Salus thermostats into the site workspace

**Ticket:** OOHDASH-128 (Bug) | **Live:** v1.4.0 | **Base:** origin/main 48890d4 | **Date:** 2026-10-14
**Input:** docs/project/oohdash-128-discovery/DISCOVERY.md and tb-sweep-evidence.json (Discovery gate PR #99, approved)
**Prototype:** docs/project/oohdash-128-design/heating-legacy-salus-mockup.html (self-contained, clickable, light and dark, phone width)

---

## 1. Selections carried in from Discovery

| ID | James's selection | How this design honours it |
|---|---|---|
| D1 | Option A: supplementary textSearch "(siteNo-" plus a strict filter. The bracket's leading digit group must equal the site number exactly. The existing anchored path stays unchanged. | Section 3 |
| D2 | Defer the 9 no-bracket devices (incl. 5791 r-2) to OOHDASH-129 | Not loaded. Covered by test U12 and the spot-check on 5791. |
| OQ4 | Accept mixed-health Accommodation. Older units must be told apart from modern ones, with explanatory copy and a support-guide update. | Sections 5 and 6 |
| OQ5 | Show the no-letter devices as a lightweight site-level count or footnote only | Section 5.3, plus decision D3 |
| OQ6 | Spot-check the cross-site guard on 2-3 more sites, including one with a malformed bracket | Section 8.4 (five sites, three of them new) |

Governing principle: the heating screen follows the caller's question and ends in an outcome. Static device detail is low value. Every UI addition below is one line of plain text with no new component, colour or button.

---

## 2. What the code does today (verified on 48890d4)

| Step | Where | Today's behaviour for "gk_bramleyfarm_salus_STA10109369 (5204-f-1)" |
|---|---|---|
| Site query tokens | services/tb-device.js:189 siteQueryTokens | tokens = ["5204"] plus any alias tokens |
| Device search | :775 fetchTbDevicesForToken, :764 fetchTbDevicePage | textSearch=gk-5204. TB matches a case-insensitive substring. "gk-5204" is not a substring of "gk_bramleyfarm_salus_..." (underscore, and the site number appears only in the bracket), so the device is never returned. PROVEN live: 0 older units across the gk-5694, gk-5191, gk-5791, gk-5204 and gk-5788 searches. |
| Anchored filter | :204 siteNameFilter, :175 normaliseName, used at :934 | ^gk-(5204)(?![0-9]) over the normalised name. normaliseName removes the bracket (:178), so the device would fail even if it were returned. |
| Per-device reads | :836 fetchTelemetry | Not reached |
| Map and classify | :720 mapTbDevice, then :388 classifyDevice and :569 deriveArea | Not reached |

**What already works once a device is loaded (no change needed):**

- **classifyDevice (:388)** comes to deviceType "salus" through the name-token path. The tokens are gk / bramleyfarm / salus / sta10109369, and the "salus" row is at :287. FORWARD_ONLY_TOKENS (:472) stops the old bleed into salus-it700. The repo's own classifier was run over all 385 live names: 382 come out as "salus", and 3 come out as "gateway" (gk-6099/6758/6858-salus-r10a, which are modern-named and already load today).
- **deriveArea (:569-586)** reads the CLIENT_SCOPE site letter first, then the raw-name trailing bracket (:579-581), using parseSiteCodeLetter (:516). Letters s or f give Accommodation. Letters r or b give Bar/Restaurant. Anything else gives null. Live CLIENT_SCOPE site is the bracket text itself, for example "(5694-r-2)".
- **mapTbDevice (:720)** passes the raw name to deriveArea (:736). It sets online from lastActivityTime freshness (:745), so nothing is hardcoded offline. isDuplicate (:755) is not triggered: no older name contains "old".
- **fetchTelemetry (:836)** reads timeseries, SERVER_SCOPE active and lastActivityTime, and CLIENT_SCOPE site/salusLocation for each device, in parallel. Older units do not use the boilerControl profile and are not PowerPause, so no SHARED_SCOPE read is made.
- **registry.js:41** ("salus" capability) and **:113-118** ("salus" control contract) set controllable false and dark true. Control is refused at the server whatever the screen shows.
- **public/js/flows.js:124 heatingDevices** includes deviceType "salus". **:139 isDarkFleet** is true for "salus". **:152 heatingAreasPresent** builds the area buttons. **:163 devicesForArea** and **:176 areaRepresentative** take the coldest device that is online.
- **routes/api.js:217 anyOffline** turns on the site banner when any device is offline. Live check (read-only, 481 requests): all 74 affected sites already have at least one modern device silent for more than 48 hours, or no modern devices. So the banner is already showing on every affected site and this fix does not newly trigger it. This is DEDUCED, using a flat 48-hour threshold as a stand-in for per-class thresholds.

---

## 3. Exact code changes -- services/tb-device.js

### 3.1 New pure helpers (export them; place them directly after siteNameFilter, :204-208)

    /**
     * OOHDASH-128: site number carried in an OLDER-convention Salus name's trailing bracket, or null.
     * Accepts only raw names containing `_salus_` (case-insensitive) whose LAST bracket group starts
     * with a digit run followed by a hyphen: "gk_x_salus_STA1 (5204-z-1)" gives "5204".
     * null for: no `_salus_` (incl. glued `_salusit500_`), no trailing bracket, empty bracket,
     * "?"-placeholder codes, "(JWTEST-R1)", a bracket with no hyphen after the digits ("(5135)").
     */
    export function legacySalusSiteNo(rawName) {
        const s = String(rawName || '');
        if (!s.toLowerCase().includes('_salus_')) return null;
        const m = s.match(/\(([^)]*)\)\s*$/);            // same trailing-group rule as deriveArea :580
        if (!m) return null;
        const d = m[1].match(/^\s*(\d+)\s*-/);
        return d ? d[1] : null;
    }

    /** OOHDASH-128 cross-site guard: STRICT string equality, never substring or numeric. */
    export function isLegacySalusForSite(rawName, siteNo) {
        const n = legacySalusSiteNo(rawName);
        return n !== null && n === String(siteNo);
    }

Notes for Build:

- Use string equality, not Number(). "05204" must not equal "5204", and 520 must never equal 5204.
- Apply the check to the RAW name. normaliseName removes the bracket.
- Requiring the hyphen after the digits matches the confirmed live code shapes. It also rejects modern cross-reference brackets such as "gk-6360-maindb-r10a (5135)", which are already ruled out by the `_salus_` check anyway.

### 3.2 Generalise the paged fetch (:775)

Split fetchTbDevicesForToken into a text-based fetch and a thin wrapper. Behaviour does not change for existing callers.

    async function fetchTbDevicesForText(textSearch) {
        // body of today's fetchTbDevicesForToken loop, with fetchTbDevicePage(textSearch, page)
    }
    async function fetchTbDevicesForToken(brand, token) {
        return fetchTbDevicesForText(`${brand}-${token}`);
    }

fetchTbDevicePage (:769) already runs encodeURIComponent on textSearch, so "(5204-" is sent as textSearch=%285204-. TB_PAGE_CAP (50) still applies.

### 3.3 fetchLiveSitesByNumber (:915-1011)

Replace lines :923-934 (from the byId build through the matched filter) with:

    // Over-fetch a broad prefix per token, paginate (unchanged).
    const tokenFetch = (async () => {
        const out = [];
        for (const token of tokens) out.push(...await fetchTbDevicesForToken(brand, token));
        return out;
    })();
    // OOHDASH-128: older-convention Salus carry the site number ONLY in a trailing bracket
    // "(5204-f-1)". Search that text in PARALLEL with the token fetch. The trailing hyphen stops a
    // numeric-prefix bleed at the TB query (5204 is not matched by "(520-"). FAIL-SOFT: a failure
    // here must never make the site worse than v1.4.0, so it degrades to "no older units" plus a warning.
    const legacyFetch = fetchTbDevicesForText(`(${key}-`).catch(err => {
        console.warn(`[TB] Older-Salus lookup failed for site ${key} - continuing without it: ${err.message}`);
        return [];
    });
    const [tokenRaw, legacyRaw] = await Promise.all([tokenFetch, legacyFetch]);

    // Dedupe by TB id across BOTH result sets (first seen wins; token results first).
    const byId = new Map();
    for (const d of [...tokenRaw, ...legacyRaw]) {
        const id = d?.id?.id || d?.id || d?.name;
        if (!byId.has(id)) byId.set(id, d);
    }

    // Keep = existing anchored filter (UNCHANGED) OR the strict older-Salus check.
    const matched = [...byId.values()].filter(d =>
        filter.test(normaliseName(d.name)) || isLegacySalusForSite(d.name, key));

Everything after this point (:936 onwards) is unchanged:

- fetchTelemetry(matched)
- mapTbDevice per device
- the freshness debounce
- the boilerControl derivation. Older units are not on the boilerControl profile, so boilerControl does not change.
- Zendesk name enrichment
- the cache write

Properties this preserves:

- **No regression for modern devices.** The token fetch, the alias overlay and siteNameFilter are byte-identical. The OR can only add devices that pass the strict check. A modern device returned by the bracket search is kept only if it already passes siteNameFilter, and in that case the token fetch had already returned it.
- **Token-fetch failure behaviour is unchanged.** A token-fetch error still throws, which still means degraded mode. Only the new lookup fails soft.
- **Cache.** perSiteCache (:85), keyed by siteNo, with LIVE_CACHE_TTL 30 s (:84), checked at :917-918, written at :967/:1009. It now simply stores the larger device list. No new cache. The test helpers that clear the cache (:1171, :1178) still clear everything.
- **Empty-site path (:964-968).** A site whose only devices are older units now returns a site object, where today it returns []. This is intended: it is the 5191 total-failure fix.
- **Fixture mode (:1063)** does not call fetchLiveSitesByNumber. E2E coverage of the screen therefore comes from fixture sites, and the fetch itself is covered by unit tests through the axios adapter.

### 3.4 How downstream consumes the new devices (no code change)

| Consumer | Line | Result for an older unit |
|---|---|---|
| classifyDevice | tb-device.js:388 | deviceType "salus", kind "heating", controllable false. With no setpoint telemetry, control is null. |
| deriveArea | :569 | Accommodation (s/f), Bar/Restaurant (r/b), or null (z, swapped "1-s") |
| mapTbDevice online | :745 | Freshness rule. All units checked are stale since 2 Jun, so offline. A fresh unit would be online (test U10, the T8 case). |
| heatingDevices | flows.js:124 | Included |
| isDarkFleet | flows.js:139 | true, so an area made up only of dark units ends in the "not reporting" outcome with no controls |
| areaRepresentative | flows.js:176 | Skips offline units, so a reporting modern thermostat stays the reading |
| control dispatch | registry.js:113-118 | controllable false, so refused at the server |

---

## 4. Exact code changes -- public/js/flows.js

### 4.1 New helpers (place directly after hasUnmappedHeating, :158-160)

    /** OOHDASH-128 (OQ5/D3): older-convention Salus units whose site code has no usable area letter. */
    function isUnplacedLegacySalus(d) { return !!d && d.deviceType === 'salus' && !d.area; }
    function unplacedLegacySalus() { return heatingDevices().filter(isUnplacedLegacySalus); }

### 4.2 Keep unplaced older units out of the fallback button (D3, recommended option)

- **hasUnmappedHeating (:158):** change to `heatingDevices().some(d => !d.area && !isUnplacedLegacySalus(d))`.
- **devicesForArea(null) (:165):** change to `heatingDevices().filter(d => !d.area && !isUnplacedLegacySalus(d))`.

Unmapped iT500 and boiler-panel devices keep today's "Heating - area not identified" button exactly as it is (the existing AC1/7.2 e2e on fixture 6218 stays green). If James picks D3's other option, Build skips 4.2 and the footnote is shown as well.

### 4.3 Heating step 0 (:455-468)

- **Footnote.** Append footnoteHtml (section 5.3) after the area-button row, inside the returned HTML. Do the same in the no-area branch.
- **No-area branch (:457).** The condition stays `!areas.length && !unmapped`. When unplacedLegacySalus().length > 0, the alert text becomes "No heating area can be checked on Lighthouse at this site.", followed by the footnote and then otherShortcut(). When it is 0, the text stays exactly "No heating on Lighthouse at this site." The control.spec.js:140 assertion is unchanged.

### 4.4 Heating step 1 reading line (:517-520) and dark-fleet outcome (:483-501)

- Compute `nOn = set.filter(d => d.online).length` and `nOff = set.length - nOn`.
- **Reading line (liveNote, non-boiler branch):**
  - When nInArea > 1 and nOff === 0: unchanged (" . coldest of N zones in Area"), so the existing e2e AC2 and the aircon-removal unit test stay green.
  - When nInArea > 1 and nOff > 0: use the copy in section 5.1.
- **New note.** When nOff > 0, add one line between the zoneread block and the "What does the caller need?" question: the area-not-reporting note (section 5.2).
- **Dark-fleet outcome.** When set.length > 1, use the plural heading and body (section 5.4). The single-device copy is unchanged, so the OOHDASH-123 e2e stays green. The capture subject, detail and script are unchanged.

No change to views.js, control.js, routes, registry or CSS. Existing classes (.small, .alert.warn, .reco) are reused.

---

## 5. Screen copy (plain English, exact text)

All copy is ASCII here. Build uses the app's existing middle-dot separator in the reading line, the same as today's "live read just now . coldest of..." string at :519.

### 5.1 Reading line when some units in the area are silent (CHANGED)

| Condition | Text after "live read just now" |
|---|---|
| nOn = 1, nOff >= 1 | "the only reporting zone in {Area}" |
| nOn >= 2, nOff >= 1 | "coldest of {nOn} reporting zones in {Area}" |

Why: today's text would say "coldest of 4 zones" when 3 of the 4 are silent. That overstates what was read.

### 5.2 Area-not-reporting note (NEW; data-testid="area-not-reporting-note"; class small)

- Singular: "1 other heating unit in {Area} is not reporting, so it is not part of this reading. Nothing done on this call caused this."
- Plural: "{n} other heating units in {Area} are not reporting, so they are not part of this reading. Nothing done on this call caused this."

The second sentence is the reassurance that discovery's CX criteria ask for, and it is always true: reading a site cannot take a device offline. The note does not name the device type, which matches the conversational principle. The support guide explains the background.

### 5.3 Unplaced-unit footnote (NEW; data-testid="heating-unplaced-note"; class small; 10px top margin)

| Condition | Text |
|---|---|
| n = 1, offline | "Also at this site: 1 older Salus heating unit that could not be matched to an area. It is not reporting and is not used in this check." |
| n > 1, all offline | "Also at this site: {n} older Salus heating units that could not be matched to an area. They are not reporting and are not used in this check." |
| any online | Same first sentence, then "It is not used in this check." or "They are not used in this check." |

It is not a button and lists no device names. It does not appear when n = 0.

### 5.4 Dark-fleet outcome, more than one unit in the area (CHANGED, plural only)

- Heading: "The heating units in this area are not reporting."
- Body: "They are Salus units that have stopped sending live data to Lighthouse, so there is no live reading and they cannot be switched or adjusted from here. This usually means the devices have lost power or their connection."

### 5.5 Phone layout

All three additions are block-level text inside the existing flow panel. They wrap naturally at 360 px. The zoneread row already wraps (styles.css:105 flex-wrap). There are no new tap targets, so nothing changes about touch sizing. Check visually in the e2e at a 390 x 844 viewport (test E6).

### 5.6 All four states

| State | What happens |
|---|---|
| Loading | Unchanged. The site loads as one request. The extra lookup runs in parallel, so the wait does not get longer. |
| Empty | Section 4.3: when unplaced units exist, the reworded no-area alert plus the footnote. Otherwise unchanged. |
| Error | The lookup fails soft. The page shows the v1.4.0 view and the server logs one line: "[TB] Older-Salus lookup failed for site ...". |
| Success | Sections 5.1 to 5.4 |

---

## 6. Support guide changes (docs/bau-support/mockups/bau-support-guide.html)

This 5.4 MB self-contained page, with screenshots inlined, is the OOHDASH-113 handler guide. It does not currently mention "not reporting", not even for OOHDASH-123. Build edits text only: no screenshot retakes are needed, because the area-question screenshot is still accurate. Edit the HTML with a text-safe tool, not by reading the whole file into a context.

| Ref | Location (anchor) | Change |
|---|---|---|
| G1 | id="issue-heating", after the "If the heater isn't responding" block | New paragraph, heading "Some heating units are not reporting": "Some pubs have older Salus thermostats that stopped sending data to Lighthouse in June 2026. From v1.4.1 the dashboard counts them, so you may see a line such as '3 other heating units in Accommodation are not reporting'. This is not a new fault and nothing you did caused it. The reading shown comes from the unit that is reporting, and you can carry on with the caller as normal." |
| G2 | id="issue-heating", same place | New paragraph, heading "If nothing in the area is reporting": "You will see 'This heating device is not reporting' (or 'The heating units in this area are not reporting'). There is no live reading and nothing can be changed from here. Use Capture & escalate so the IoT team can check the device, or end with no action if the caller does not want a follow-up." |
| G3 | id="screen-words", table "Is the equipment reachable?" | New row. On screen: "not reporting". Meaning: "The device has stopped sending data to Lighthouse altogether, usually lost power or connection. It cannot be read or changed here. Capture it for the IoT team." |
| G4 | id="faq" | New question: "The heating step says an older Salus unit could not be matched to an area. What do I do?" Answer: "Nothing extra on the call. That unit's label does not say which part of the pub it heats, so the dashboard leaves it out of the check and tells you it exists. Answer the caller about the area they mean. The IoT team is fixing these labels separately." |

If a printed or PDF copy of the guide has been issued, it needs regenerating. See OQ8.

---

## 7. Data dictionary (additions for docs/project/DATA_DICTIONARY.md, section "Derived device fields")

| Name | Kind | Meaning | Source | Retention / sensitivity |
|---|---|---|---|---|
| legacySalusSiteNo(rawName) | Pure function (server) | Site number from an older Salus name's trailing bracket, or null | services/tb-device.js | Not stored. Low. |
| isLegacySalusForSite(rawName, siteNo) | Pure function (server) | Cross-site guard: strict string equality | services/tb-device.js | Not stored. Low. |
| Legacy Salus site code | TB naming convention | Trailing "(NNNN-L-n)" on gk_{sitename}_salus_{serial} names. L is s/f/r/b. | ThingsBoard entity name and CLIENT_SCOPE `site` (same text) | Read-only. Low. |
| device.deviceType = "salus" | Existing derived field | Older-convention Salus thermostat | classifyDevice | Per request. Low. |
| device.area | Existing derived field | Accommodation, Bar/Restaurant or null | deriveArea | Per request. Low. |
| isUnplacedLegacySalus(d) | Client predicate | deviceType "salus" with area null | public/js/flows.js | Not stored. Low. |
| area-not-reporting-note | UI test id | Silent-units line under an area reading | flows.js | n/a |
| heating-unplaced-note | UI test id | Site-level footnote for unplaced older units | flows.js | n/a |

No personal data. No new stored fields. No Cosmos or Zendesk change.

---

## 8. Test plan

### 8.1 Unit tests -- new file test/legacy-salus-site-load.test.js

The style is node:test with an axios adapter interceptor, copied from test/tb-device.test.js. DATA_MODE=live is set before the dynamic import. Use __resetLiveCache between cases. The test data is inline in the file; the names are real live names.

    TB devices (id, name, type, lastActivityAgeMs, clientScope.site):
      m1  gk-5204-salusit700          default  600000     -
      m2  gk-5204-lwgateway-1         default  600000     -
      b1  gk_bramleyfarm_salus_STA10109321 (5204-f-1)  default  none  (5204-f-1)
      b2  gk_bramleyfarm_salus_STA10109322 (5204-f-2)  default  none  (5204-f-2)
      b3  gk_bramleyfarm_salus_STA10109323 (5204-f-3)  default  none  (5204-f-3)
      b4  gk_bramleyfarm_salus_STA10109324 (5204-r-2)  default  none  (5204-r-2)
      b5  gk_bramleyfarm_salus_STA10109325 (5204-r-3)  default  none  (5204-r-3)
      b6  gk_bramleyfarm_salus_STA10109369 (5204-z-1)  default  none  (5204-z-1)
      x1  gk_wingfieldfarm_salus_STA10108576 (5694-r-2) default none  (5694-r-2)
      x2  gk_unknown_salus_STA10108639 (5788-1-s)       default none  (5788-1-s)
      x3  gk_unknown_salus_STA10108419 (?7?4-?-?)       default none  (?7?4-?-?)
      x4  gk_unknown_salus_STA10108795 5791-r-2         default none  -
      x5  gk-6360-maindb-r10a (5204-a-1)                default 600000 -
    Serials b1-b5 are test-data stand-ins in the real 5204 naming pattern; b6, x1-x4 are verbatim live names.
    x5 is a synthetic hostile name (non-salus bracket carrying 5204).

| ID | Case | Expected |
|---|---|---|
| U1 | legacySalusSiteNo over a table: b1 gives "5204"; b6 gives "5204"; x2 gives "5788"; x3 gives null; "(JWTEST-R1)" gives null; "()" gives null; x4 (no bracket) gives null; x5 gives null (no _salus_); "gk_x_SALUS_y (5204-r-1)" gives "5204"; "gk-1666-salusit500-r1 (1666-r-1)" gives null | Exact values as listed |
| U2 | isLegacySalusForSite: b4 vs "520" false; vs "5204" true; vs "52040" false; vs 5204 (number) true; "gk_x_salus_y (05204-r-1)" vs "5204" false | Strict string equality |
| U3 | Site 5204. The token search returns m1, m2. The bracket search returns b1-b6. | Workspace = m1, m2, b1-b6 (8 devices). b1-b3 are Accommodation, b4-b5 Bar/Restaurant, b6 area null. All b* are deviceType "salus" and online false. |
| U4 (T4 anti-bleed, hostile TB) | The adapter answers ANY "(" search with every older-unit fixture (b1-b6, x1-x4) plus x5 | Site 5204 gets exactly b1-b6. Site 520 gets zero older units. x5 is never accepted. |
| U5 | Duplicate: the adapter returns b1 from BOTH searches (same id) | b1 appears once |
| U6 (T2 no regression) | Existing fixture site 6261 (tb-devices.raw.json); the bracket search returns [] | deviceIds deep-equal the pre-change list. Exactly one extra request URL, containing textSearch=%286261- |
| U7 | The bracket search throws a 500 | The site still returns m1, m2. console.warn is called once with "Older-Salus lookup failed for site 5204". No throw. |
| U8 | The token search throws | getSitesByNumber still rejects (degraded mode unchanged) |
| U9 | Cache: two calls within 30 s | The second call makes 0 TB requests. After __resetLiveCache, both searches run again. |
| U10 (T8) | b4 with fresh lastActivityTime (age 10 min) | b4 is online true. Area is still Bar/Restaurant. control is still null and the registry still refuses it. |
| U11 (T1 total failure) | Site 5191: the token search returns []. The bracket search returns "gk_cherrytreefarm_salus_STA10108309 (5191-f-2)". | Returns 1 site holding 1 device, Accommodation (today this returns []) |
| U12 (T5, D2) | Site 5791: the bracket search returns "gk_pinetreefarm_salus_STA10109673 (5791-z-1)". x4 exists but contains no "(5791-". | Workspace holds the z-1 unit only. x4 is absent (deferred to OOHDASH-129). |

Client-side (vm-sandbox style, as in test/aircon-removal.test.js), new file test/legacy-salus-flow.test.js:

| ID | Case | Expected |
|---|---|---|
| C1 | ws = 5204 set (1 online iT700 Accommodation at 19.5, 3 offline salus Accommodation, 2 offline salus Bar/Restaurant, 1 offline salus null) | Step 0 HTML has area-accommodation and area-bar-restaurant, NO area-unmapped, and contains heating-unplaced-note with "1 older Salus heating unit". |
| C2 | Choose Accommodation | Contains "the only reporting zone in Accommodation" and "3 other heating units in Accommodation are not reporting". need-warm is present. |
| C3 | Choose Bar/Restaurant | Contains reco-dark-fleet with "The heating units in this area are not reporting." No need-* buttons. |
| C4 | ws = an unmapped online iT500 plus 1 unplaced salus | area-unmapped present (iT500 kept). Fallback set excludes the salus unit. Footnote present. |
| C5 | ws = only 1 unplaced salus | "No heating area can be checked on Lighthouse at this site." plus the footnote. No chips. |
| C6 | ws = no heating at all | Exactly "No heating on Lighthouse at this site." No footnote. |
| C7 | 2 unplaced, 1 of them online | Footnote ends "They are not used in this check." (no "not reporting") |
| C8 | Area of 2 online units | Still "coldest of 2 zones in Accommodation". No area-not-reporting-note. |

### 8.2 E2E (Playwright, fixture mode, required CI check "e2e (playwright)")

Add two sites to data/fixtures/bridge-devices.json. Fixture devices are served as they are, so they carry a pre-derived `area` exactly as mapTbDevice would set it.

    7003 "Bramley Farm Inn" (address "Test Row, Leeds LS3"), devices:
      gk-7003-salusit700                       salus-it700  heating  Accommodation   online true   localTemperature 19.5, heatingSetpoint 21, mode "Heat"
      gk_bramleyfarm_salus_STA10109321 (7003-f-1)  salus  heating  Accommodation   online false  telemetry {}
      gk_bramleyfarm_salus_STA10109322 (7003-f-2)  salus  heating  Accommodation   online false  telemetry {}
      gk_bramleyfarm_salus_STA10109323 (7003-f-3)  salus  heating  Accommodation   online false  telemetry {}
      gk_bramleyfarm_salus_STA10109324 (7003-r-2)  salus  heating  Bar/Restaurant  online false  telemetry {}
      gk_bramleyfarm_salus_STA10109325 (7003-r-3)  salus  heating  Bar/Restaurant  online false  telemetry {}
      gk_bramleyfarm_salus_STA10109369 (7003-z-1)  salus  heating  null            online false  telemetry {}
    7004 "Pine Tree Farm" (address "Test Row, Leeds LS4"), devices:
      gk_pinetreefarm_salus_STA10109673 (7004-z-1) salus  heating  null            online false  telemetry {}
      gk-7004-lwgateway-1                       gateway      gateway  null            online true

New spec tests/oohdash-128-legacy-salus.spec.js uses signIn and confirmSite from tests/helpers.js:

| ID | Steps | Expected (DOM) |
|---|---|---|
| E1 | 7003, tile-heating | area-accommodation and area-bar-restaurant visible. area-unmapped count 0. heating-unplaced-note contains "1 older Salus heating unit that could not be matched to an area". flow-panel does not contain "STA101". |
| E2 (T6) | then area-accommodation | .flowbody contains "19.5", "the only reporting zone in Accommodation". area-not-reporting-note contains "3 other heating units in Accommodation are not reporting" and "Nothing done on this call caused this". need-warm visible. |
| E3 (T1) | 7003, Bar/Restaurant | reco-dark-fleet contains "The heating units in this area are not reporting." need-warm count 0. dark-capture then record-outcome gives outcome-captured containing "not reporting". |
| E4 (T7) | 7004, tile-heating | .alert.warn has "No heating area can be checked on Lighthouse at this site.". heating-unplaced-note visible. No area chips. |
| E5 (T2) | Existing suites | area-model, rosetta-dark-fleet-and-schedule, control and every other spec pass unchanged |
| E6 | E1 and E2 at viewport 390 x 844 | No horizontal scroll (document.scrollWidth <= innerWidth). Notes visible. |

### 8.3 Coverage map to discovery tests

T1 is covered by U11, E3. T2 by U6, C8, E5. T3 by U3. T4 by U2, U4. T5 by U12. T6 by C2, E2. T7 by C5, E1, E4. T8 by U10, C7.

### 8.4 OQ6 pre-ship live spot-check (read-only, blocks release)

The new opt-in test is test/live/legacy-salus-sitecheck.test.js. It follows the same pattern as test/live/false-offline-live.test.js: JWT from CIR credentials/thingsboard.env, and it reports skip-with-reason (never a silent pass) when the credentials are missing. It calls the BUILT getSitesByNumber in DATA_MODE=live and asserts the following for each site:

| Site | Why chosen | Older units expected (exact) | Must NOT appear |
|---|---|---|---|
| 5694 | Discovery baseline | 6: r-1, r-2 (Bar/Restaurant); f-1, f-2, f-3, s-1 (Accommodation) | any device whose bracket is not 5694 |
| 5204 | Malformed letter (z) alongside well-formed codes | 6: r-2, r-3 (Bar/Restaurant); f-1, f-2, f-3 (Accommodation); z-1 (area null, footnote) | anything from 520 or 52040, and anything not 5204 |
| 5788 | Swapped code "(5788-1-s)" alongside well-formed codes | 6: r-1, r-2 (Bar/Restaurant); f-1, f-2, f-3 (Accommodation); 1-s (area null, footnote) | anything not 5788 |
| 5191 | Total-failure site, older units only | 1: f-2 (Accommodation) | anything not 5191 |
| 5791 | No-area unit plus the deferred no-bracket units | 1: z-1 (area null). The 3 no-bracket units (r-2, f-1, f-2) are ABSENT. | anything not 5791 |

For every site, these must also hold:

- The modern (non-older-unit) device IDs equal the v1.4.0 output. Capture this first by running the same test against main.
- Every older unit has a legacySalusSiteNo equal to the site.
- The result is recorded in the release preflight doc.

The pass rule is all five sites green. Any foreign device is a hard stop. Post-deploy smoke on the live dashboard: open 5204, then Heating, and confirm sections 5.1 to 5.3 render.

---

## 9. How the CX criteria are met

| Discovery moment | Where it is met | Mockup |
|---|---|---|
| Site overview: stay out of the way | Nothing is added to the site view. The banner state is already on for all 74 sites. | n/a |
| Mixed-health area: a checkpoint | The reading stays on the reporting modern unit, and the honest reading line plus the note (5.1, 5.2) tell the two apart | 5204 Bramley Farm, then Accommodation |
| Dark older unit: reassurance | "Nothing done on this call caused this." (5.2), plus support-guide G1 | same |
| "Great looks like": the handler is not tempted to control the dead unit | Older units never become the reading or offer controls. The registry refuses at the server too. | 5204, then Bar/Restaurant |
| No-letter units are acknowledged, not shown as device detail | One footnote (5.3) | 5204 step 1; 5791 |
| Total-failure site 5191 now has heating | Accommodation appears and ends in the honest outcome | 5191 |

The discovery brief assumed area health chips (green/amber/red) and per-device cards. Neither exists in the heating flow since OOHDASH-82: the area buttons have no colour, and there are no device cards. "Tell them apart" is therefore delivered through the reading line and the note, not new card types. This is deliberate and consistent with the conversational-outcome principle.

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-site bleed | Low | High | Search text ends in a hyphen; strict string guard; _salus_ check; U2, U4, and the five-site live check (8.4) |
| Modern-device regression | Very low | High | The anchored path is byte-identical; the OR is additive only; U6, E5, and the 8.4 modern-list equality |
| Handlers read the new note as a fault | Medium | Medium | Reassurance sentence, guide G1/G4, release note |
| An older unit comes back to life (T8) | Low | Low | Freshness rule unchanged (U10). Control stays refused because the registry has the "salus" contract set to dark. |
| Extra TB load | Certain, small | Negligible | Section 11 |
| A new fixture site disturbs other e2e tests | Low | Low | Unique site numbers 7003/7004. No spec counts fixture sites (checked). |
| Existing unit-test TB adapters see an extra "(NNNN-" search | Certain | None | Checked: tb-device, site-identity, tb-clientscope and hotwater-scope adapters substring-match names and return [] for it; the OOHDASH-80 URL guard (tb-device.test.js:198-207) still holds because the new URL is also /api/tenant/devices |
| The guide file is large and hard to edit | Medium | Low | Targeted text edits only (section 6) |

## 11. Cost and performance

Per site load:

- 1 extra GET /api/tenant/devices?textSearch=(NNNN- taking 33-63 ms live. It runs alongside the token search, so wall-clock time is the slower of the two, not the sum.
- On the 74 affected sites, about 5 devices on average, each with 3 parallel reads: about 15 extra GETs per 30 s refresh per open site.

The worst case is estate-bounded: 358 devices across 74 sites, and only while someone is viewing that site. There is no LLM use, no tokens, no subscription and no per-call cost. Nothing runs in the background, nothing polls when idle, and no window opens. Both mandatory criteria are met in full and there is no compromise to state.

## 12. Rollback and version

- **Rollback:** redeploy the v1.4.0 image. There are no data, configuration or schema changes. Remember to check resources after any image change (known drift issue).
- **Version:** patch v1.4.1 recommended (D4), using `npm run release` (scripts/release.sh patch). RELEASE_NOTES.md gets a v1.4.1 entry stating these points: older Salus thermostats now load on 74 sites; Bar/Restaurant appears at 5191; 5791 Bar/Restaurant is still pending OOHDASH-129; and the new handler copy.

## 13. Hand-off to Build -- files to touch

- services/tb-device.js (3.1-3.3)
- public/js/flows.js (4.1-4.4)
- test/legacy-salus-site-load.test.js (new)
- test/legacy-salus-flow.test.js (new)
- test/live/legacy-salus-sitecheck.test.js (new, opt-in)
- data/fixtures/bridge-devices.json (sites 7003, 7004)
- tests/oohdash-128-legacy-salus.spec.js (new)
- docs/bau-support/mockups/bau-support-guide.html (G1-G4)
- docs/project/DATA_DICTIONARY.md (section 7)
- RELEASE_NOTES.md

Do not touch data/site-aliases.json, the registry, routes or CSS.

**Load-bearing moments that must not be flattened:**

- the reassurance sentence in 5.2
- unplaced units kept out of the fallback button (unless James chooses otherwise at D3)
- fail-soft on the bracket lookup only

## 14. Decisions and open questions

| ID | Item | Status / owner |
|---|---|---|
| D1 | Option A | Settled at discovery |
| D2 | No-bracket units go to OOHDASH-129 | Settled at discovery |
| D3 | Where the 3 no-area units are acknowledged | Open: James. Recommended: footnote only, kept out of the fallback button. |
| D4 | Release version | Open: James. Recommended: patch v1.4.1. |
| OQ1 | Partial versus total failure | Resolved at discovery: 72 partial, 2 total |
| OQ2 | No-bracket units | Resolved: deferred to OOHDASH-129 (D2) |
| OQ3 | Do other systems rely on the old names? | Open: Spencer Thompson. Matters only for a future rename. Does not block. |
| OQ4 | Mixed-health Accommodation | Resolved: accepted. Sections 5.1 and 5.2. |
| OQ5 | No-letter units | Resolved: site-level footnote. Section 5.3. |
| OQ6 | Cross-site spot-check | Resolved: yes. Five sites specified in 8.4; blocks release. |
| OQ7 | 18 units whose bracket holds no site number ("?" placeholders, (JWTEST-R1), an empty bracket) can never be tied to a site by code. Add them to OOHDASH-129, or a separate data clean-up with the IoT team? | Open: James. Does not block. |
| OQ8 | Has a printed or PDF copy of the OOHDASH-113 handler guide been issued that must be regenerated after G1-G4? | Open: James. Does not block Build. |

*Evidence: read-only ThingsBoard reads on 2026-10-14 against portal.lhlive.co.uk: a 105-request sweep, an all-385 classification run through the repository classifier, and a 481-request banner check. No writes. No product code changed by this artefact.*
