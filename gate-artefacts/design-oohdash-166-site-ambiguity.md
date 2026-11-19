<!-- gate:contract
TICKET: OOHDASH-166
PHASE: design

SECTION: What this design does
Since v1.7.5 (13 November), 69 Greene King house IDs show "House ID is ambiguous" and remote control is blocked. The cause is that the Zendesk site list holds the same pub twice, once under an old tag and once under a new gk_ tag. This design treats the same pub listed twice as one site and prefers the gk_ tag. Callback history searches both tags. New tickets get the site field filled in again. A house ID that the Zendesk list doesn't have, or that has two different pub names, goes back to the pre-v1.7.5 behaviour: the dashboard looks it up on Lighthouse, and the agent gets full control. The screen shows every pub name we hold and says which one matches the equipment. Code change only. No Zendesk, database or setting changes. Released as v1.7.7.

SECTION: Your decisions from discovery, applied
Fix path is Option A: the code removes duplicates and Zendesk stays as it is. Callback history searches the old and new tags across the full 90 days. Sites on Lighthouse but missing from the Zendesk list fall back to the Lighthouse look-up. This happens only when the Zendesk list has no single match, so the fast path for the other 300 or so sites is unchanged. You asked what control the agent would have after picking a pub at 5199. The answer is full control either way. The equipment always loads by house ID, so a pick could never change which equipment the agent controls. For that reason there is no pick pop-up.

SECTION: The 5199 and 5190 mix-up (new finding)
Lighthouse house 5199 is Silkwood Farm (equipment named gk-silkwoodfarm-*). House 5190 is Sycamore Farm, Burnley (gk-sycamorefarm-freezer-1, gk-sycamorefarm-fridge-1). In Zendesk the names on gk_5199 and gk_5190 are swapped, and the old Sycamore Farm option also wrongly says 5199. A read-only check today (19 November) shows the IoT team's rename hasn't happened yet. Until it does, the 5199 confirm screen shows both names. "Farmhouse Kitchen (Silkwood Park)" is marked as matching the equipment at 5199, and "Sycamore Farm (Burnley)" is listed under it as what our ticket system also says. With the name check, 5190 shows "Sycamore Farm (Burnley)" as matching its equipment, with the wrong ticket-system name listed under it. After the rename, both show one clear name with no code change.

SECTION: A second bug found and fixed in the same code
The function that matches a house ID to a Zendesk option also matched part of the tag text. As a result, house 220 (Bull and Anchor, Exhall) also matched gk_6220. This is the "house 220" case in discovery: it is in the Zendesk list, but its tickets get no site field and its history comes back empty. It affects 9 three-digit house IDs, 7 of them Greene King. The fix matches the house ID exactly, using the same rule the site list already uses.

SECTION: The proposed name check (Decision 2)
When a site's equipment loads, the dashboard already has the equipment names, so the check makes no new calls. Some sites name their equipment after the pub, for example gk-sycamorefarm-fridge-1. If the ticket-system pub name doesn't fit that name, the screen shows both. The equipment-matching name comes first, marked "Matches the equipment at house ID 5190". It is the full ticket-system name where one fits ("Sycamore Farm (Burnley)"), otherwise the equipment name tidied up ("Sycamore Farm"). The ticket-system name is listed underneath. One data-quality note is written per house ID per hour. Before release, the build runs the check read-only against every house ID and lists any false alarms. A false alarm is safe: it only shows a second name.

SECTION: What the agent sees
The agent sees every pub name we hold for the house ID, and never a name before it has been checked. While the equipment loads, the screen says "Checking the pub name…" with the button locked. The script asks the customer which pub they're calling from, and never reads out a disputed name. For the 69 sites with one clear name, the confirm screen looks as it does today. Where our records disagree, the screen shows both names, says which one matches the equipment, and adds a small "Pub name not confirmed" line. A site missing from the ticket system shows the name taken from its equipment. If no name exists anywhere, it shows the house ID and says so. The ambiguous card stays only as a safety net, for when Lighthouse itself returns two sites, and its wording is now plain English. The prototype shows all 12 states on the real screens.

SECTION: Cost, speed and risk
No new background work, polling or AI tokens. The callback lookup makes one extra Zendesk search for the 69 sites with two tags. The two searches run together, so the agent doesn't wait longer. The Lighthouse fallback is only used for house IDs that the Zendesk list doesn't resolve to one pub. Those look-ups take a few seconds, as they did before v1.7.5. A house ID that exists nowhere now takes about 0.2 seconds to say "No site found", instead of answering at once. Rollback is the v1.7.6 image (cc04d3a). Nothing needs undoing in Zendesk or the database.

DECISION: 5199 until the IoT team renames it | Let the agent control it, showing both names with Silkwood Park marked as matching the equipment (recommended) | Keep blocking it with the "matches more than one pub" card until the rename lands
DECISION: Name check (equipment names against the ticket-system pub name) | Add it, so 5190 shows both names with Sycamore Farm marked as matching (recommended) | Leave it out; 5190 shows the wrong name until the IoT team renames it
-->

# OOHDASH-166 Design — one site per house ID, history across both tags, Lighthouse fallback

**Date:** 2026-11-19
**Discovery:** `gate-artefacts/discovery-oohdash-166-site-ambiguity.md` (PR #210, merged 5b476cf). James's review decisions are applied as written.
**Release target:** v1.7.7 (patch). Code only.
**Prototype (real OOH screens, 12 states; revised after James's review on 19 November):** [OOHDASH-166 prototype](mockups/oohdash-166-site-lookup-mockup.html)

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
| 2 | No entry | **New:** falls back to `resolveSite`, which is the Lighthouse look-up used before v1.7.5. Lighthouse returns one site, so the site resolves, and its name follows 3.5 (`lighthouse-only` or `none`). If Lighthouse returns none, the agent sees "No site found" | A few seconds when equipment is found (full read, 5 s cap); about 0.2 s when nothing is found |
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

### 3.5 Pub names shown, and the name check (Decision 2, recommended)

**James's rule (review of PR #211):** show every pub name we hold for the house ID. If there is one clear name, show it as today. If our sources disagree, show both, and say which one matches the equipment at this house ID. Never show or read out a name before the check has finished.

**Where each name comes from**

| Source | What it is | How it's read | New external call? |
|---|---|---|---|
| Ticket-system name | `zdPubName` of every Zendesk Site option for this house ID (one, or several when they disagree) | Cached Zendesk option list (1-hour cache) | No |
| Equipment name | First all-letter segment after `gk-` in the device names already read for the site, for example `sycamorefarm` from `gk-sycamorefarm-fridge-1` or `silkwoodfarm` from `gk_silkwoodfarm_salus_STA10108784 (5199-f-3)` | Device list already fetched by the site read | No |
| Alias file | `data/site-aliases.json` text tokens for the house ID (for example `1110meridian`) | Local file, already loaded | No. Used as an extra equipment word when present. |
| Lighthouse asset name (for example `sycamore_farm`) | The TB asset record for the site | **Not used.** The site read doesn't fetch assets today. Adding it would be one extra TB call per site open. That isn't needed for 5199, 5190 or any case found so far, so it's left out. It can be added later as a separate change with its cost stated. | Would be one call; not proposed |
| None of the above | Equipment named by number only (`gk-6431-…`), and no Zendesk option | n/a | Show the house ID only |

**Equipment words** (rule E): for each matched device, `normaliseName(name)`. Keep the first segment after `gk-` only if it is all letters and 4 or more long. Skip segments with digits (`gk-5674-…`, `gk-6209fryer-1`). Skip device words: salus, tuya, intesis, gateway, boiler, boilercontrol, powerpause, it500, it700, lwgateway, test. Add any alias-file tokens that are all letters.

**Pub words** (rule P): split a ticket-system name into words of 4 or more letters. Drop the generic ones: farm, farmhouse, house, kitchen, inn, inns, arms, hotel, tavern, park, lodge, grill, carvery, restaurant, the.

**A ticket-system name "fits" the equipment** when one of its pub words appears inside an equipment word.

**What the screen shows** (`site.pubNames`, built in `_doFetchLiveSitesByNumber` once the devices and the Zendesk answer are both in):

| Case | `status` | Heading (primary name) | Under the heading |
|---|---|---|---|
| One ticket-system name, and it fits the equipment or there are no equipment words | `clear` | That name | Nothing new (as today) |
| Ticket-system names disagree with each other or with the equipment, and one name fits the equipment | `disagree` | The fitting name. If no name for this house ID fits, the one name in the whole cached site list that fits (for example "Sycamore Farm (Burnley)" for 5190). If none or several fit, the equipment word tidied up ("sycamorefarm" becomes "Sycamore Farm") | "✓ Matches the equipment at house ID 5190", then "Our ticket system lists: <each other name>", then "⚠ Pub name not confirmed — our records disagree. Check the pub the customer names against the names above." |
| Ticket-system names disagree and no equipment words exist | `disagree` (no match) | First ticket-system name | "Our ticket system lists: <each other name>" and the not-confirmed line. There is no "matches" line. |
| No ticket-system option; equipment words exist | `lighthouse-only` | Equipment word tidied up ("Oakbrook Farm") | "Name taken from the equipment at this house ID. This site is missing from our ticket system's site list." plus the not-confirmed line |
| No name anywhere | `none` | "House ID 6431" | "⚠ We don't hold a pub name for this house ID. Check the house ID with the customer." |

**Tidying an equipment word:** split before a trailing generic word from rule P (silkwoodfarm becomes "Silkwood Farm", oakbrookfarm becomes "Oakbrook Farm"), then capitalise each word. If there is no generic word, the result is one capitalised word.

**Never before the check:** the confirm screen no longer prints the search-row name straight away. Until `/sites/:siteNo/summary` returns, the heading is "House ID 5674". A muted line reads "Checking the pub name…" and the button stays locked ("Checking site…"), as it already does for the device line. The script reads "can I take the name of the pub you're calling from?". `/summary` already waits on the background read; it now also returns `pubNames`. The browser copies it into `state.pendingSite` before it redraws. Speed: the time to a usable confirm screen is unchanged, because the button already waited for `/summary`. Only the name now arrives with the device line instead of before it.

**Script once loaded:** `clear` keeps today's script ("can I just confirm, you're calling from X, site number N?"). `disagree` and `lighthouse-only` ask "which pub are you calling from?", so a disputed name is never read out as fact. `none` asks "which pub are you calling from, and can you read me your house ID?".

**Data-quality note:** when the status is `disagree`, one note is written per house ID per hour, per pod. The pod note matters: the in-memory map isn't shared, so two pods can each write one. Example: "House ID 5190: ticket-system name 'Farmhouse Kitchen (Silkwood Park)' doesn't match the equipment (sycamorefarm). Check the site list."

**Without Decision 2 (no name check):** equipment words aren't compared. A single ticket-system name shows as `clear` even when it's wrong (prototype page 7). Conflicting ticket-system names still show both, but with no "matches the equipment" line.

**Known limit:** sites whose equipment is named by number get no check, so a wrong ticket-system name there still shows as clear (the same as today). Two pubs sharing a distinctive word could pass. The pre-release dry run lists every `disagree` result. It cannot list swaps it doesn't detect.

Worked examples:

| House ID | Ticket-system names | Equipment word | Shown |
|---|---|---|---|
| 5199 before rename | Farmhouse Kitchen (Silkwood Park); Sycamore Farm (Burnley) | silkwoodfarm | Farmhouse Kitchen (Silkwood Park), matches the equipment; also lists Sycamore Farm (Burnley) |
| 5190 before rename | Farmhouse Kitchen (Silkwood Park) | sycamorefarm | Sycamore Farm (Burnley), matches the equipment (found in the site list); also lists Farmhouse Kitchen (Silkwood Park) |
| 5199 / 5190 after rename | one name each | silkwoodfarm / sycamorefarm | clear |
| 5674 | Hillfield Farm (Solihull) | none, or hillfieldfarm | clear |
| 6418 (example) | none | oakbrookfarm | Oakbrook Farm, from the equipment |
| 6431 (example) | none | none | House ID 6431 |

Pre-release dry run (a build task and a release blocker): `node scripts/oohdash-166-name-check.mjs` (new, read-only). It reads the site list and, for each house ID, the device names over the same svc-read path `scripts/tb-parity.mjs` uses. It prints every house ID whose status would be `disagree` or `lighthouse-only`. Expected while the rename is pending: 5199 and 5190. The build gate records any others and how each was settled: a true error goes to the IoT team as a rename request, and a false alarm has its word added to the skip lists.

## 4. Screens and wording (the full list, checked against every flow)

Every place that shows a site name follows the same rule: the primary name from 3.5, or "House ID N" if there is none. No agent is ever asked to say "gk-5199" to a customer.

| Where | Today (v1.7.6) | After |
|---|---|---|
| Confirm screen while loading | Search-row name shown straight away | Heading "House ID 5674", muted line "Checking the pub name…", button "Checking site…" (locked), script "can I take the name of the pub you're calling from?" |
| Confirm screen, clear | Name + house ID | Unchanged |
| Confirm screen, disagree | (5199: ambiguous card; 5190: wrong name shown as fact) | Primary name + house ID; "✓ Matches the equipment at house ID 5190"; "Our ticket system lists: …"; "⚠ Pub name not confirmed — our records disagree. Check the pub the customer names against the names above."; script "which pub are you calling from?" |
| Confirm screen, missing from the ticket system | "No site found" toast (v1.7.5 regression) | Equipment name + house ID; "Name taken from the equipment at this house ID. This site is missing from our ticket system's site list."; not-confirmed line; script "which pub are you calling from?" |
| Confirm screen, no name anywhere | gk-6431 + "Site name unverified — we couldn't resolve a recognisable name…" | "House ID 6431"; "⚠ We don't hold a pub name for this house ID. Check the house ID with the customer."; script "which pub are you calling from, and can you read me your house ID?" |
| Control pop-up (`ctlTargetBlock`) | ⚠ Site name unverified — confirm the house number by voice before sending. / Unrecognised site gk-5199 | Primary name (or "House ID 5199"); for anything other than clear: "⚠ Pub name not confirmed — check the house ID with the customer before sending." |
| Progress tracker (`drawControl` tracker name) | ⚠ Unrecognised site gk-5199 | Primary name, or "House ID 5199", with "(pub name not confirmed)" when not clear |
| Customer banner (`callerBanner` site line) | gk-5199 5199 | Primary name + house ID, or "House ID 5199" |
| Ticket title (`buildOohTitle`) | gk-5199 or the Zendesk name | Primary name; the ticket note lists the other names when status is disagree |
| Ambiguous card heading | ⚠️ House ID 6758 is ambiguous | ⚠️ House ID 6758 matches more than one pub |
| Ambiguous card text | This ID matches more than one site (Bowers and Bowman). To protect against changing the wrong site, remote control is blocked for ambiguous IDs. | Our records list more than one pub under this house ID: Bowers and Bowman. To avoid changing the wrong pub, you can't make changes from here tonight. |
| Ambiguous card script | I can't safely make changes for this site number tonight — It's logged, … | I can't safely make changes for this site tonight — it's logged, … (capital letter typo fixed) |
| Ambiguous capture toast | IoT team will resolve the duplicate ID | Unchanged |

Nothing else on screen changes. The flows, P1 path, ticket model and confirm-button behaviour are all as today.

Customer-answerable check: the new scripts ask only for the pub name and house ID, which every customer can answer. "Customer" is used throughout, and no technical words are introduced.

## 5. How the discovery experience goals are met

| Discovery goal | How this design meets it | Prototype state |
|---|---|---|
| Searching a GK house ID goes straight to the pub name and confirm, with no mention of "ambiguity" | One site per house ID for same-name duplicates | 2 (after) against 1 (today) |
| Full 90-day history including older tickets | Both tags searched and merged | 3 (after) against 4 (today) |
| Search step stays out of the way | The fast path is unchanged for all single-match sites. The fallback is used only where the list can't name one pub | 2, 9 |
| Site confirmation is high-stakes, so the check is right | No name is shown until it has been checked. Where our records disagree, both names are shown, with the one matching the equipment marked, and the script asks which pub the customer is calling from | 5, 6 (against 7) |
| An escalation must be clear and conclusive, not a dead end | The ambiguous card keeps its ticket and P1 path with plain wording; it is now a safety net only | 11 |
| Sites on Lighthouse but missing from Zendesk are not blocked | Lighthouse fallback restored; name taken from the equipment, or the house ID if there is none | 9, 12 |

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
| `site.nameUnverified` | True whenever `pubNames.status` isn't `clear` | resolution / tb-device | Kept for existing callers |
| `site.pubNames` | `{ status: clear / disagree / lighthouse-only / none, primary, primaryMatchesEquipment, others[] }` | tb-device (3.5) | Drives every name on screen; returned by `/summary` |
| `tbEquipmentWord` | All-letter device-name segment after `gk-` (plus all-letter alias-file tokens), for example `silkwoodfarm` | Device names already read | Never stored; used for the name check and the `lighthouse-only` name |
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
| U13 | `resolveSiteInventory` with no entry and a stubbed TB returning one site | resolved, `pubNames.status` `lighthouse-only` or `none` (today: `none`) |
| U14 | `resolveSiteInventory` with a conflict | data-quality note written once, then resolves through TB; a second search within the hour writes no second note |
| U15 | `resolveSiteInventory` with TB returning two sites | ambiguous (safety net kept) |
| U16 | `pubNames` for every worked example in 3.5, plus a `gk-6209fryer-1`-style name and a `gk_salus_…` name | as in the table; no equipment word for the last two |
| U16b | Tidying: silkwoodfarm, sycamorefarm, oakbrookfarm, meridian | Silkwood Farm, Sycamore Farm, Oakbrook Farm, Meridian |
| U17 | `/summary` returns `pubNames`; the confirm screen shows no name before it arrives | fields present; golden text "Checking the pub name…" |
| U18 | Screen-text golden test: the wording table in section 4, rendered through the real view functions (vm dump) | exact strings |

### 7.2 End-to-end tests (Playwright, fixture mode)

Fixture mode never reads the Zendesk list, so the new rules are covered by the unit tests. The e2e tests cover the screen changes:

| ID | Test | Expect |
|---|---|---|
| E1 | Search 6758 (fixture pair) | Card reads "House ID 6758 matches more than one pub"; Yes leads to P1, No leads to ticket (update `tests/resolution.spec.js:32` and `tests/additional-notes.spec.js` E13) |
| E2 | Fixture sites for each `pubNames` status (add a `disagree` and a `none` fixture) | Loading line first, then the names and scripts in section 4; confirm works; control pop-up and banner show the primary name or "House ID …" |
| E3 | The existing confirm-gate suite | Unchanged and green |

### 7.3 Live checks after release (read-only, by the release doer)

| ID | Check | Pass |
|---|---|---|
| L1 | Open 5674 on live | Confirm screen "Hillfield Farm (Solihull)", no ambiguous card |
| L2 | Callback lookup for 5674 | Tickets from both tags appear; the count matches a direct Zendesk search of both tags |
| L3 | A test-mode or real OOH ticket for one of the 69 sites | Site field = its gk_ tag |
| L4 | Open 5199 (if the rename is still pending) | Farmhouse Kitchen (Silkwood Park) marked as matching the equipment; Sycamore Farm (Burnley) listed under it; full control |
| L5 | Open 5190 (if the rename is still pending, and Decision 2 is yes) | Sycamore Farm (Burnley) marked as matching the equipment; Farmhouse Kitchen (Silkwood Park) listed under it |
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
- **Interim:** until the IoT team renames them, 5199 has no callback history (conflicting names, as today), and searching by pub name for "Sycamore" lists 5199. The confirm screen then shows Silkwood Park as matching the equipment and asks which pub the customer is calling from, which catches this.
- **Revision 2 (19 November, James's prototype review):** no name before the check; every name we hold is shown, with the one matching the equipment marked; prototype pages 5 to 9 relabelled, page 12 added. No new external calls.
- **UNRESOLVED:** how many look-ups were blocked between 13 and 19 November (from discovery). It doesn't block the design.
