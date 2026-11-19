<!-- gate:contract
TICKET: OOHDASH-166
PHASE: design

SECTION: What this design does
Since v1.7.5 (13 November), 69 Greene King house IDs show "House ID is ambiguous" and remote control is blocked. The cause is that the Zendesk site list holds the same pub twice, once under an old tag and once under a new gk_ tag. This design treats the same pub listed twice as one site and prefers the gk_ tag. Callback history searches both tags. New tickets get the site field filled in again. A house ID that the Zendesk list doesn't have, or that has two different pub names, goes back to the pre-v1.7.5 behaviour: the dashboard looks it up on Lighthouse, and the agent gets full control with a "Pub name not confirmed" warning. Code change only. No Zendesk, database or setting changes. Released as v1.7.7.

SECTION: Your decisions from discovery, applied
Fix path is Option A: the code removes duplicates and Zendesk stays as it is. Callback history searches the old and new tags across the full 90 days. Sites on Lighthouse but missing from the Zendesk list fall back to the Lighthouse look-up. This happens only when the Zendesk list has no single match, so the fast path for the other 300 or so sites is unchanged. You asked what control the agent would have after picking a pub at 5199. The answer is full control either way. The equipment always loads by house ID, so a pick could never change which equipment the agent controls. For that reason there is no pick pop-up.

SECTION: The 5199 and 5190 mix-up (new finding)
Lighthouse house 5199 is Silkwood Farm and house 5190 is Sycamore Farm (Burnley). In Zendesk the names on gk_5199 and gk_5190 are swapped. The old Sycamore Farm option also wrongly says 5199. A live check today (19 November, read-only) shows the IoT team's rename has not happened yet. Until it happens, 5199 has two different pub names and shows "Pub name not confirmed" with full control. 5190 currently shows the wrong name, "Farmhouse Kitchen (Silkwood Park)". The proposed name check (Decision 2) catches this. Once the rename lands, both become ordinary duplicates of the same pub and resolve normally, with no code change. The design works the same before and after the rename.

SECTION: A second bug found and fixed in the same code
The function that matches a house ID to a Zendesk option also matched part of the tag text. As a result, house 220 (Bull and Anchor, Exhall) also matched gk_6220. This is the "house 220" case in discovery: it is in the Zendesk list, but its tickets get no site field and its history comes back empty. It affects 9 three-digit house IDs, 7 of them Greene King. The fix matches the house ID exactly, using the same rule the site list already uses.

SECTION: The proposed name check (Decision 2)
When a site's equipment loads, the dashboard already has the equipment names. Some sites name their equipment after the pub, for example gk-silkwoodfarm-fryer-2a. If the Zendesk pub name has no word in common with those names, the dashboard shows "Pub name not confirmed" and asks for the house ID instead. It also writes one data-quality note per house ID per hour. It makes no new calls and costs nothing to run. The confirm button already waits for the equipment check, so the warning appears before the agent can confirm. Before release, the build runs it read-only against every house ID and lists any false alarms. A false alarm is safe, because it only asks the agent to check the house ID.

SECTION: What the agent sees
For 69 sites: the old "ambiguous" card is gone. The confirm screen shows the pub name as for any other site. Where the pub name can't be confirmed, the heading reads "House ID 5199" and a yellow note says "Pub name not confirmed". The script asks the customer to confirm the house ID and which pub they're calling from. The same wording replaces "Site name unverified" and "Unrecognised site gk-5199" on the confirm screen, the control pop-up, the progress tracker and the customer banner, so that no agent is ever asked to read out a machine name. The ambiguous card stays only as a safety net, for when Lighthouse itself returns two sites for one number. No live site does this today, and its wording is now plain English. The prototype linked in the body shows all 11 states on the real screens.

SECTION: Cost, speed and risk
No new background work, polling or AI tokens. The callback lookup makes one extra Zendesk search for the 69 sites with two tags. The two searches run together, so the agent doesn't wait longer. The Lighthouse fallback is only used for house IDs that the Zendesk list doesn't resolve to one pub. Those look-ups take a few seconds, as they did before v1.7.5. A house ID that exists nowhere now takes about 0.2 seconds to say "No site found", instead of answering at once. Rollback is the v1.7.6 image (cc04d3a). Nothing needs undoing in Zendesk or the database.

DECISION: 5199 until the IoT team renames it | Let the agent control it with the "Pub name not confirmed" warning (recommended) | Keep blocking it with the "matches more than one pub" card until the rename lands
DECISION: Name check (equipment names against the Zendesk pub name) | Add it, release it with this fix (recommended) | Leave it out and rely on the IoT team fixing names
-->

# OOHDASH-166 Design — one site per house ID, history across both tags, Lighthouse fallback

**Date:** 2026-11-19
**Discovery:** `gate-artefacts/discovery-oohdash-166-site-ambiguity.md` (PR #210, merged 5b476cf). James's review decisions are applied as written.
**Release target:** v1.7.7 (patch). Code only.
**Prototype (real OOH screens, 11 states):** [OOHDASH-166 prototype](mockups/oohdash-166-site-lookup-mockup.html)

---

## 1. The problem in one paragraph

v1.7.5 made the first site look-up read the Zendesk site list (field 11405878329244) instead of Lighthouse. That list holds 394 options for 317 house IDs. For 69 Greene King house IDs, the same pub appears twice: an old option (for example `green_king__farm_house_inn__hillfield_farm`) and a new one (`gk_5674`). The dashboard counts two matches, calls the house ID "ambiguous", and blocks control. The same rule has always left the ticket site field empty and the callback history empty for these sites.

## 2. Live facts this design rests on (read-only, 19 November 2026)

| Fact | Value | How checked |
|---|---|---|
| Options in the Site field | 394 | Zendesk options API |
| House IDs | 317 | Same, with the dashboard's own house-ID rule |
| House IDs with two options and the same pub name | 69 (all have exactly one gk_ option) | Same |
| House IDs with different pub names | 2: 5199 (Greene King) and 929 (McDonalds, not on the OOH estate) | Same |
| Does every gk_ tag end in its own house ID? | Yes, no exceptions | Same |
| Three-digit house IDs that also match another option's tag text | 9 (220, 218, 250, 631, 736, 744, 780, plus McDonalds 612 and 792) | Same |
| IoT team rename of 5199 and 5190 done? | Not yet. gk_5199 still says Sycamore Farm, gk_5190 still says Silkwood Park | Same |
| Which pub is behind Lighthouse 5199 and 5190 | 5199 is Silkwood Farm, 5190 is Sycamore Farm (Burnley) | TB alarm tickets (finding passed on by the orchestrator, PROVEN) |

House 929 McDonalds: the two names are the same pub written two ways ("McDonalds - Telford Forge - (929)" and "Telford Forge"). It is not on the OOH estate, so the Lighthouse look-up (brand gk) returns "No site found" as it does today.

## 3. The design

### 3.1 One shared rule for "which options belong to this house ID" (services/zendesk.js)

A new internal helper, `siteOptionsFor(siteNo)`, reads the cached option list (1-hour cache, unchanged) and returns one of three answers:

| Answer | When | What it carries |
|---|---|---|
| `one` | Every option for this house ID has the same pub name (after trimming, single spaces, and ignoring case) | `preferredTag` (the gk_ option's value; if none, the first option's value), `allTags` (every option value for this house ID), `siteName`, `brand` |
| `conflict` | Two or more different pub names | `names` (the distinct names), `allTags` |
| `none` | No option for this house ID | nothing |

"For this house ID" means `siteNoFromOption(option) === siteNo`. That is the same rule the site list already uses. The old test, which also accepted `option.value.includes(siteNo)`, is removed, and this is what fixes house 220 and the other eight. The pub name compared is `humanNameFromOption`, which is the part after the last `::`, with the house number removed. So "Farmhouse Inns" and "Farm House Kitchen" in the middle of the name don't matter.

Every existing caller then uses that helper:

| Function | Today | After |
|---|---|---|
| `matchSiteOption` / `resolveSiteTag` (ticket site field) | null if more than one match | `one` gives `preferredTag`; `conflict` and `none` give null (data-quality note on the ticket, as today) |
| `resolveSiteName` (pub name for a site) | null if more than one match | `one` gives `siteName`; otherwise null (name not confirmed) |
| `siteDirectory` (search list, site index, look-up) | one entry per option | one entry per house ID for `one`, carrying the gk_ option's name and brand; one entry per distinct name for `conflict` (so search still shows the amber "duplicate ID" row, Q5 of OOHDASH-164) |
| `callbackLookup` (history) | searches one tag; empty if more than one | `one`: searches every tag in `allTags` (see 3.3); `conflict`: empty with `unresolvedSiteTag`, as today; `none`: as today |

### 3.2 Site look-up order (services/resolution.js, `resolveSiteInventory`)

Fixture mode stays as it is: it uses the full read.

| Step | Zendesk site list says | What happens | Speed |
|---|---|---|---|
| 1 | Exactly one entry (after the de-dup) | Fast stub confirm screen, background read starts. Unchanged from v1.7.6 | Under 0.5 s to the confirm screen |
| 2 | No entry | **New:** falls back to `resolveSite`, which is the Lighthouse look-up used before v1.7.5. Lighthouse returns one site, so the site resolves with `nameUnverified: true`. If Lighthouse returns none, the agent sees "No site found" | A few seconds when equipment is found (full read, 5 s cap); about 0.2 s when nothing is found |
| 3 | Two or more different names | **New:** writes one data-quality note ("House ID 5199 has more than one pub name in the Zendesk site list: A / B"), then falls back to `resolveSite` as in step 2 | As step 2 |
| 4 | List can't be read | Falls back to `resolveSite`. Unchanged | As step 2 |
| any | Lighthouse returns more than one site | Ambiguous card, now with plain wording (section 4). Unreachable on today's live code, because the Lighthouse look-up always builds one site. It stays as a safety net | n/a |

Data-quality notes from steps 3 and 5.3 are written at most once per house ID per hour (a small in-memory map). The data-quality log keeps only 200 entries, and today every blocked search adds one, so repeated searches would push useful entries out.

`confirmSite` doesn't change. It already confirms against the Lighthouse result and refuses anything that isn't exactly one site. The F004 rule (no device change until the agent confirms) holds.

### 3.3 Callback history across both tags

For a `one` house ID with two tags, `callbackLookup` runs one Zendesk search per tag, at the same time:
`type:ticket custom_field_11405878329244:<tag> created><90 days ago>`.
It merges the results by ticket ID, sorts them by last update (newest first), and keeps the first 12, as today. If one search fails, the other's results are shown and the failure is logged. If both fail, it behaves as today. `ticketsForSite` (the site-page ticket panel) reads from `callbackLookup`, so it gets the full history too.

Why two searches and not one combined query: we haven't checked whether Zendesk treats two values for the same custom field as "either". Two searches that run together cost the agent no extra wait.

### 3.4 Tickets get the site field again

`createOutcomeTicket` gets `preferredTag` (gk_) for the 69 sites and the 7 three-digit Greene King sites. Their tickets carry the site field again, without the "Site field could not be resolved" note. Tickets already created stay as they are.

### 3.5 Name check (Decision 2, recommended)

Where it runs: in `_doFetchLiveSitesByNumber` (services/tb-device.js), after the device list is known and the Zendesk name has been resolved. It makes no new calls.

The rule:
1. **Equipment words.** For each matched device, take `normaliseName(name)`. Keep the first segment after `gk-` only if it is all letters and 4 or more long, for example `silkwoodfarm` from `gk-silkwoodfarm-fryer-2a` or from `gk_silkwoodfarm_salus_STA10108784 (5199-f-3)`. Skip segments that contain digits (`gk-5674-…`, or `gk-6209fryer-1`). Skip device words: salus, tuya, intesis, gateway, boiler, boilercontrol, powerpause, it500, it700, lwgateway, test.
2. **Pub words.** Split the Zendesk pub name into words of 4 or more letters. Drop the generic ones: farm, farmhouse, house, kitchen, inn, inns, arms, hotel, tavern, park, lodge, grill, carvery, restaurant, the.
3. **Mismatch** = there is at least one equipment word, at least one pub word, and no pub word appears inside any equipment word.
4. On a mismatch, the site gets `nameUnverified: true` and `siteName` = the account ID, which is the same as any unconfirmed site today. One data-quality note is written: "House ID 5190: Zendesk pub name 'Farmhouse Kitchen (Silkwood Park)' doesn't match equipment names (sycamorefarm). Check the site list."

Worked examples:

| House ID | Zendesk name | Equipment word | Result |
|---|---|---|---|
| 5190 before rename | Farmhouse Kitchen (Silkwood Park) | sycamorefarm | Mismatch: "Pub name not confirmed" |
| 5190 after rename | Sycamore Farm (Burnley) | sycamorefarm | Match, normal |
| 5199 after rename | Farmhouse Kitchen (Silkwood Park) | silkwoodfarm | Match, normal |
| 5674 | Hillfield Farm (Solihull) | none, or hillfieldfarm | No check, or match |
| 6261 | Wheatstone Inn (Gloucester) | none (devices named gk-6261-…) | No check |

How the warning reaches the confirm screen: `GET /sites/:siteNo/summary` already waits on the background read before the confirm button unlocks. It now also returns `siteName` and `nameUnverified`. The browser copies both into `state.pendingSite` before it redraws, so the warning appears before the agent can press "This is the right site". The workspace and the control pop-up read the same site, so they agree.

Pre-release dry run (a build task and a release blocker): a read-only script runs the rule over every house ID in the site list, using the existing svc-read path (the same way `scripts/tb-parity.mjs` reads). It lists every mismatch. The expected list is 5190 only, while the rename is pending. Any other hit is checked by hand and recorded in the build gate. If a hit is a true error, it goes to the IoT team as a rename request. If it is a false alarm, its word is added to the skip lists.

## 4. Screens and wording (the full list, checked against every flow)

Every place that shows an unconfirmed site name changes the same way, so no agent is ever asked to say "gk-5199" to a customer.

| Where | Today (v1.7.6) | After |
|---|---|---|
| Confirm screen heading (`renderConfirmGate`, unconfirmed) | gk-5199 `5199` | House ID 5199 |
| Confirm screen note (`unverifiedNotice`) | ⚠ Site name unverified — we couldn't resolve a recognisable name for this house number. Confirm the house number by voice before making any change. | ⚠ Pub name not confirmed — our records don't give one clear pub name for house ID 5199. Check the house ID with the customer before you make any change. The equipment shown is the equipment for this house ID. |
| Confirm screen script (unconfirmed) | Ask the customer: can I just confirm, you're calling from gk-5199, site number 5199? | Ask the customer: can I just confirm your house ID? I have it as 5199. And which pub are you calling from? |
| Control pop-up (`ctlTargetBlock`) | ⚠ Site name unverified — confirm the house number by voice before sending. / Unrecognised site gk-5199 | ⚠ Pub name not confirmed — check the house ID with the customer before sending. / House ID 5199 |
| Progress tracker (`drawControl` tracker name) | ⚠ Unrecognised site gk-5199 | ⚠ House ID 5199 (pub name not confirmed) |
| Customer banner (`callerBanner` site line) | gk-5199 5199 | House ID 5199 |
| Ambiguous card heading | ⚠️ House ID 6758 is ambiguous | ⚠️ House ID 6758 matches more than one pub |
| Ambiguous card text | This ID matches more than one site (Bowers and Bowman). To protect against changing the wrong site, remote control is blocked for ambiguous IDs. | Our records list more than one pub under this house ID: Bowers and Bowman. To avoid changing the wrong pub, you can't make changes from here tonight. |
| Ambiguous card script | I can't safely make changes for this site number tonight — It's logged, … | I can't safely make changes for this site tonight — it's logged, … (capital letter typo fixed) |
| Ambiguous capture toast | IoT team will resolve the duplicate ID | Unchanged |

Nothing else on screen changes. The flows, P1 path, ticket model and confirm-button behaviour are all as today.

Customer-answerable check: the new script asks the customer only for their house ID and pub name, which every customer can answer. "Customer" is used throughout, and no technical words are introduced.

## 5. How the discovery experience goals are met

| Discovery goal | How this design meets it | Prototype state |
|---|---|---|
| Searching a GK house ID goes straight to the pub name and confirm, with no mention of "ambiguity" | One site per house ID for same-name duplicates | 2 (after) against 1 (today) |
| Full 90-day history including older tickets | Both tags searched and merged | 3 (after) against 4 (today) |
| Search step stays out of the way | The fast path is unchanged for all single-match sites. The fallback is used only where the list can't name one pub | 2, 9 |
| Site confirmation is high-stakes, so the check is right | Where the name can't be trusted, the screen asks for the house ID rather than confirming a wrong pub | 5, 6 |
| An escalation must be clear and conclusive, not a dead end | The ambiguous card keeps its ticket and P1 path with plain wording; it is now a safety net only | 11 |
| Sites on Lighthouse but missing from Zendesk are not blocked | Lighthouse fallback restored | 9 |

## 6. Data dictionary (names Build and the tester use)

| Name | Meaning | Source | Notes |
|---|---|---|---|
| `siteNo` | House ID, digits only, as a string | Search input / TB | One meaning everywhere |
| `zdOptionValue` | A Zendesk Site field option's machine value (the "site tag"), for example `gk_5674` or `green_king__farm_house_inn__hillfield_farm` | Zendesk field 11405878329244 | Not sensitive |
| `zdOptionName` | The option's display name, `Brand::Sub-brand::<house ID> <Pub> (<Town>)` | Same | Not sensitive |
| `zdPubName` | `humanNameFromOption`: last `::` segment, house ID removed | Derived | Compared without case and with single spaces |
| `zdSiteMatch.status` | `one`, `conflict` or `none` | `siteOptionsFor` | New |
| `zdSiteMatch.preferredTag` | The gk_ option value; otherwise the first option value | `siteOptionsFor` | Written to the ticket site field |
| `zdSiteMatch.allTags` | All option values for the house ID | `siteOptionsFor` | Used for callback history only |
| `site.nameUnverified` | True when the pub name can't be confirmed (no Zendesk name, conflicting names, or name check mismatch) | resolution / tb-device | Drives the "Pub name not confirmed" wording |
| `tbEquipmentWord` | All-letter device-name segment after `gk-`, for example `silkwoodfarm` | Device names already read | Never stored; used only for the name check |
| Data-quality note | Text line in Cosmos `OohAppConfig / data-quality` | `addDataQualityFlag` | Rolling 200 entries (unchanged). Contains the agent's name on the existing look-up notes only; the new notes contain no personal data |

## 7. Test plan

### 7.1 Unit tests (node --test, test/oohdash-166-site-options.test.js and others)

Test data: a stub option list built from real live names (below). Each test must fail on today's code before the fix, and be shown to.

| ID | Test | Expect |
|---|---|---|
| U1 | `siteOptionsFor('5674')` with the old and gk_ Hillfield options | `one`, preferredTag `gk_5674`, allTags both |
| U2 | Same with the options in reverse order | Still `gk_5674` |
| U3 | `siteOptionsFor('5199')` with the three current live options | `conflict`, two names |
| U4 | `siteOptionsFor('5199')` and `('5190')` with the renamed options | both `one`; gk_5199 and gk_5190 preferred |
| U5 | `siteOptionsFor('220')` with gk_220 and gk_6220 | `one`, `gk_220` (fixes the tag-text match) |
| U6 | `siteOptionsFor('612')` with the four gk_612x and md_612 options | `one`, `md_612` |
| U7 | Names that differ only in case or spacing | `one` |
| U8 | `siteDirectory()` with the stub | one entry for 5674; two entries for 5199 (current); 317-house-ID shape kept |
| U9 | `resolveSiteTag` / `resolveSiteName` for 5674, 5199 (current), 220 | gk_5674 / Hillfield Farm (Solihull); null / null; gk_220 / Bull & Anchor (Exhall) |
| U10 | `callbackLookup('5674')` with a stubbed search returning 3 and 2 tickets (1 shared) | 4 tickets, newest first; two searches sent |
| U11 | `callbackLookup` when one of the two searches throws | other results returned, error logged |
| U12 | `createOutcomeTicket` for 5674 | site field `gk_5674`, no data-quality note |
| U13 | `resolveSiteInventory` with no entry and a stubbed TB returning one site | resolved, `nameUnverified: true` (today: `none`) |
| U14 | `resolveSiteInventory` with a conflict | data-quality note written once, then resolves through TB; a second search within the hour writes no second note |
| U15 | `resolveSiteInventory` with TB returning two sites | ambiguous (safety net kept) |
| U16 | Name check rule: the five worked examples in 3.5 plus a `gk-6209fryer-1`-style name and a `gk_salus_…` name | as in the table; no flag for the last two |
| U17 | `/summary` passes `nameUnverified` and `siteName` through | fields present |
| U18 | Screen-text golden test: the wording table in section 4, rendered through the real view functions (vm dump) | exact strings |

### 7.2 End-to-end tests (Playwright, fixture mode)

Fixture mode never reads the Zendesk list, so the new rules are covered by the unit tests. The e2e tests cover the screen changes:

| ID | Test | Expect |
|---|---|---|
| E1 | Search 6758 (fixture pair) | Card reads "House ID 6758 matches more than one pub"; Yes leads to P1, No leads to ticket (update `tests/resolution.spec.js:32` and `tests/additional-notes.spec.js` E13) |
| E2 | A fixture site with no pub name (add one with `nameUnverified`) | Heading "House ID …", "Pub name not confirmed" note, house-ID script; confirm works; control pop-up and banner show "House ID …" |
| E3 | The existing confirm-gate suite | Unchanged and green |

### 7.3 Live checks after release (read-only, by the release doer)

| ID | Check | Pass |
|---|---|---|
| L1 | Open 5674 on live | Confirm screen "Hillfield Farm (Solihull)", no ambiguous card |
| L2 | Callback lookup for 5674 | Tickets from both tags appear; the count matches a direct Zendesk search of both tags |
| L3 | A test-mode or real OOH ticket for one of the 69 sites | Site field = its gk_ tag |
| L4 | Open 5199 (if the rename is still pending) | "Pub name not confirmed", full control |
| L5 | Open 5190 (if the rename is still pending, and Decision 2 is yes) | "Pub name not confirmed" once equipment loads |
| L6 | Open 220 | Pub name shown, history present |
| L7 | `[UX]` timing lines for single-match sites | t-gate p95 no worse than v1.7.6 |

## 8. Release and rollback

- **Release:** v1.7.7 patch from clean main (`npm run release`), image rolled out with `kubectl set image` (KUBECONFIG ooh.yaml). Check the resources after the rollout (known drift lesson).
- **No changes outside the code:** no Zendesk option edits or deletions, no Cosmos or database change, no environment or K8s secret change, no new setting.
- **Rollback:** `kubectl set image` back to `apitechhub.azurecr.io/ooh-dashboard:cc04d3a` (v1.7.6). Nothing to undo elsewhere. Tickets created with the site field during the release keep it, which is correct.
- **The IoT team rename** can land before, during or after the release. Both states are covered (sections 3.2, 3.5 and tests U3/U4).

## 9. Cost and running

| Item | Cost |
|---|---|
| AI tokens | None. No model calls in the product. |
| Zendesk API | One extra search per callback lookup or site page, for the 69 sites only. Runs alongside the first, so no extra wait. Well within rate limits. |
| Lighthouse (TB) | No new calls on the fast path. The fallback adds the pre-v1.7.5 read for unmatched house IDs only. |
| Background work | None added. No timers, polling or new processes. |
| Build effort | Small: about 4 functions in zendesk.js, 1 in resolution.js, the name check in tb-device.js, a small wording change in views.js and control.js, and tests. |

## 10. Open flags and out of scope

- **Out of scope (James's decision A):** deleting the 69 old Zendesk options. The code handles them either way.
- **Out of scope, noted:** Lighthouse look-ups by house ID only find equipment named with the number, or older Salus thermostats with "(5199-…)". Equipment named after the pub, such as `gk-silkwoodfarm-fryer-2a`, is found only if `data/site-aliases.json` lists the pub word for that house ID. 5199 and 5190 have no alias today. This is not caused by v1.7.5 and is not changed here. It is worth its own small ticket: add aliases for the Farmhouse Inns sites after a read-only check of their device names.
- **Interim:** until the IoT team renames them, 5199 has no callback history (conflicting names, as today) and searching by pub name for "Sycamore" lists 5199. The confirm screen's "Pub name not confirmed" note and house-ID script catch this.
- **UNRESOLVED:** how many look-ups were blocked between 13 and 19 November (from discovery). It doesn't block the design.
