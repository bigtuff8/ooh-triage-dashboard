<!-- gate:contract
TICKET: OOHDASH-166
PHASE: design

SECTION: What this design does
Since v1.7.5 (13 November), 69 Greene King house IDs show "House ID is ambiguous" and remote control is blocked. The cause: the Zendesk site list holds the same pub twice, under an old tag and a new gk_ tag. This design treats the same pub listed twice as one site, and uses the gk_ tag. Callback history searches both tags, and new tickets get the site field filled in again. The house ID drives everything. The agent confirms the house ID with the customer, and the equipment and controls load by that number. The pub name is checked at the same time, for information only. A name problem never blocks the agent or sends them back to search. It's code only: no Zendesk, database or setting changes. The release is v1.7.7.

SECTION: House ID drives, name is information
The script asks the customer to confirm the house ID first. When our records agree on the pub name, the screen shows that name, as it does today, and asks nothing more. When they disagree, or we hold no name, the agent asks which pub the customer is calling from. They tap one of the names we hold, or type what the customer says. This step is optional and never locks the confirm button or the controls. While the equipment loads, the screen shows "Checking the pub name…". No name appears until the check finishes. Agents always continue with the site and keep full control. The one exception is the safety-net case where Lighthouse itself holds two sites under one house ID (see below).

SECTION: The name goes on the ticket
Whatever the agent taps or types goes on the OOH ticket for that call, as one clear line. For example: "Name check (house ID 5190): our records list Sycamore Farm (Burnley) / Farmhouse Kitchen (Silkwood Park); customer says Sycamore Farm (Burnley), please tidy the site list". The ticket is also tagged ooh_site_name_check, so the IoT team can find these next working day and tidy the site list. The line is written even if the agent didn't record an answer ("customer's answer not recorded"). The existing data-quality flag is kept: at most one per house ID per hour. One question is open (see the decision below): what happens when the call raises no ticket that the IoT team will see.

SECTION: Where the names come from
There are two sources, and neither needs a new external call. The first is the Zendesk site list, which is already cached for an hour. The second is the equipment names already read for the site: for example, gk-sycamorefarm-fridge-1 gives "Sycamore Farm". Pub names in data/site-aliases.json count too. The Lighthouse asset record (for example sycamore_farm) is not used. Reading it would cost one extra Lighthouse call every time a site opens, and nothing found so far needs it. If no source gives a name, the screen shows the house ID only. The name comparison that spots 5190's wrong name is now simply part of this step, so the separate name-check decision is dropped.

SECTION: The 5199 and 5190 mix-up
Lighthouse house 5199 is Silkwood Farm (gk-silkwoodfarm-*). House 5190 is Sycamore Farm, Burnley (gk-sycamorefarm-*). In Zendesk the names on gk_5199 and gk_5190 are swapped. The old Sycamore Farm option also says 5199. A read-only check today shows the IoT team's rename hasn't happened yet. Until it does, both house IDs open with full control. The name step offers both names, marking the one that matches the equipment, and the answer goes on the ticket. After the rename, both show one agreed name, with no code change.

SECTION: Two sites under one house ID (safety net)
This applies only if Lighthouse itself holds two different sites under one house ID. No live site does today. In that case we can't know which equipment belongs to the customer, so remote control stays blocked. The agent still records the pub name on the same card and goes straight to a next-day ticket or a P1. They are not sent back to search. "Search again" stays only as a small "Wrong house ID" link, for when the customer gives a different number.

SECTION: A second bug fixed in the same code
The function that matches a house ID to a Zendesk option also matched part of the tag text. So house 220 (Bull and Anchor, Exhall) also matched gk_6220, and its tickets got no site field and no history. It affects 9 three-digit house IDs, 7 of them Greene King. The fix matches the house ID exactly.

SECTION: Cost, speed and risk
No new background work, polling or AI tokens. The callback lookup makes one extra Zendesk search for the 69 sites with two tags. The two searches run together, so the agent doesn't wait any longer. House IDs missing from the Zendesk list are looked up on Lighthouse, which takes a few seconds, as it did before v1.7.5. Rollback is the v1.7.6 image (cc04d3a). Nothing needs undoing in Zendesk or the database.

DECISION: Name mismatch on a call that raises no ticket the IoT team will see | Keep it to one ticket: the call record for that call is left open at low priority and tagged ooh_site_name_check, instead of being created solved (recommended) | Create a separate low-priority data-quality ticket alongside the solved call record | No ticket: the line goes on the solved call record and the data-quality flag only
-->


# OOHDASH-166 Design — house ID drives, one site per house ID, history across both tags, name captured for the IoT team

**Date:** 2026-11-19
**Discovery:** `gate-artefacts/discovery-oohdash-166-site-ambiguity.md` (PR #210, merged 5b476cf). James's review decisions are applied as written.
**Release target:** v1.7.7 (patch). Code only.
**Prototype (real OOH screens, 12 pages; revision 3 after James's review on 19 November):** [OOHDASH-166 prototype](mockups/oohdash-166-site-lookup-mockup.html)

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
| 2 | No entry | **New:** falls back to `resolveSite`, which is the Lighthouse look-up used before v1.7.5. Lighthouse returns one site, so the site resolves, and its name follows 3.5 (`equipment-only` or `none`). If Lighthouse returns none, the agent sees "No site found" | A few seconds when equipment is found (full read, 5 s cap); about 0.2 s when nothing is found |
| 3 | Two or more different names | **New:** writes one data-quality note ("House ID 5199 has more than one pub name in the Zendesk site list: A / B"), then falls back to `resolveSite` as in step 2 | As step 2 |
| 4 | List can't be read | Falls back to `resolveSite`. Unchanged | As step 2 |
| any | Lighthouse returns more than one site | Two-sites card (3.6): control blocked, name captured, ticket or P1 in place. Unreachable on today's live code, because the Lighthouse look-up always builds one site. It stays as a safety net | n/a |

Data-quality notes from step 3 and from 3.5 are written at most once per house ID per hour (a small in-memory map). The data-quality log keeps only 200 entries, and today every blocked search adds one, so repeated searches would push useful entries out.

`confirmSite` doesn't change. It already confirms against the Lighthouse result and refuses anything that isn't exactly one site. The F004 rule (no device change until the agent confirms) holds.

### 3.3 Callback history across both tags

For a `one` house ID with two tags, `callbackLookup` runs one Zendesk search per tag, at the same time:
`type:ticket custom_field_11405878329244:<tag> created><90 days ago>`.
It merges the results by ticket ID, sorts them by last update (newest first), and keeps the first 12, as today. If one search fails, the other's results are shown and the failure is logged. If both fail, it behaves as today. `ticketsForSite` (the site-page ticket panel) reads from `callbackLookup`, so it gets the full history too.

Why two searches and not one combined query: we haven't checked whether Zendesk treats two values for the same custom field as "either". Two searches that run together cost the agent no extra wait.

### 3.4 Tickets get the site field again

`createOutcomeTicket` gets `preferredTag` (gk_) for the 69 sites and the 7 three-digit Greene King sites. Their tickets carry the site field again, without the "Site field could not be resolved" note. Tickets already created stay as they are.

### 3.5 House ID drives; the pub name is checked alongside it (revision 3, James's review on 19 November)

**The model.**
1. The house ID is the only thing that decides which equipment loads and which controls the agent gets. The agent confirms the house ID with the customer.
2. The pub name is checked at the same time and is for information only. A name problem never blocks the confirm button or the controls, and never sends the agent back to search.
3. When the name is in doubt, the agent records the name the customer gives, on the same screen. That answer goes on the ticket so the IoT team can tidy the site list.

**Where names come from** (no new external calls):

| Source | What it gives | How it's read | New external call? |
|---|---|---|---|
| Zendesk site list | `zdPubName` of every Site option for the house ID | Cached option list (1-hour cache) | No |
| Equipment names | First all-letter segment after `gk-` in the device names already read, tidied: `gk-sycamorefarm-fridge-1` gives "Sycamore Farm", `gk_silkwoodfarm_salus_STA10108784 (5199-f-3)` gives "Silkwood Farm" | Device list from the site read | No |
| Alias file | All-letter tokens in `data/site-aliases.json` for the house ID | Local file | No |
| Lighthouse asset record (e.g. `sycamore_farm`) | Not used | Would need one extra TB call per site opened, and nothing found so far needs it | Not proposed |
| None of the above | Nothing; the screen shows the house ID only | n/a | No |

**Equipment words (rule E).** For each matched device, take `normaliseName(name)`. Keep the first segment after `gk-` only if it is all letters and 4 or more letters long. Skip segments with digits, such as `gk-5674-…` and `gk-6209fryer-1`. Skip these device words: salus, tuya, intesis, gateway, boiler, boilercontrol, powerpause, it500, it700, lwgateway, test.

**Pub words (rule P).** Split a Zendesk name into words of 4 or more letters. Drop the generic words: farm, farmhouse, house, kitchen, inn, inns, arms, hotel, tavern, park, lodge, grill, carvery, restaurant, the.

**A name "fits" the equipment** when one of its pub words appears inside an equipment word.

**Tidying an equipment word.** Split it before a trailing generic word (silkwoodfarm becomes "Silkwood Farm"), then capitalise each word.

**`site.pubNames`** is built in `_doFetchLiveSitesByNumber` once the devices and the Zendesk answer are both in. It is returned by `/sites/:siteNo/summary`, which the confirm button already waits for.

| `status` | When | Confirm-screen heading | Name step shown? | Names offered (`held`) |
|---|---|---|---|---|
| `agreed` | One Zendesk name, and it fits the equipment, or there are no equipment words | The name + house ID (as today) | No | n/a |
| `disagree` | Zendesk names differ from each other, or the single Zendesk name doesn't fit the equipment | House ID | Yes | The name that fits the equipment first, marked "matches the equipment". If no Zendesk name for this house ID fits, use the one name in the whole cached list that fits (5190 gives "Sycamore Farm (Burnley)"); if none fits, the tidied equipment word. Then every Zendesk name for the house ID, marked "ticket system". |
| `equipment-only` | No Zendesk option; equipment words exist | House ID | Yes | The tidied equipment name, marked "matches the equipment" |
| `none` | No name anywhere | House ID | Yes | None; a text box only |

**No name before the check finishes.** Until `/summary` returns, the heading reads "House ID 5674" with a muted line "Checking the pub name…". The script already asks the customer to confirm the house ID, so the agent isn't waiting. The confirm button stays locked only because it already waits for the equipment read (OOHDASH-164 Q3). No new wait is added for the name.

**The name step (inline, optional, prompted).** It is a dashed box below the script:
- The first line says why it's there: "Our records disagree on the pub name for this house ID", "Our records only hold a name taken from the equipment", or "We don't hold a pub name for this house ID".
- One chip for each held name, with its source in small text, plus a "Something else…" chip that opens a text box with a Save button. When no names are held, the chip reads "Type the pub name…".
- The help line reads: "Optional: tap the answer if you get one; you can carry on either way. Whatever you record goes on the ticket for the IoT team."
- After a tap or a Save, the box shows "✓ Pub name recorded. Customer says: X. This goes on the ticket so the IoT team can tidy the site list.", with a Change link.
- The confirm button ("✓ House ID confirmed — open the site") works whether or not a name is recorded.
- The typed text is capped at 120 characters. It is stored as plain text and escaped wherever it is shown.

**Where the answer is kept.** The browser holds it in `state.nameCheck` and sends it with `POST /api/sites/:siteNo/confirm` (new optional body field). If the agent changes it after confirming (the Change link stays on the site page header), it sends `POST /api/calls/:id/name-check`. The server stores it on the call record as `rec.nameCheck = { siteNo, held[], answer, how: picked / typed / none, at }`. Neither route calls an outside system.

**On the ticket.** Any OOH ticket created during the call (outcome, P1, capture or call record) gets two additions when `rec.nameCheck` exists:
- A line in the `[TRG]` body, next to the data-quality note: `Name check (house ID 5190): our records list Sycamore Farm (Burnley) / Farmhouse Kitchen (Silkwood Park); customer says Sycamore Farm (Burnley) — please tidy the site list.` If the agent recorded nothing, the line reads "customer's answer not recorded". If no names are held, it reads "we hold no pub name for this house ID".
- The tag `ooh_site_name_check`, which follows the existing `ooh`, `ooh_p1` and `ooh_call_record` tag pattern.

The line goes on the first ticket of the call only, so it doesn't repeat on every issue. If the call raises no ticket the IoT team will see, see the DECISION. The recommended option keeps it to one ticket: the call record for that call is created open, at low priority, with the tag, instead of solved.

**The data-quality flag is kept.** One note per house ID per hour for `disagree` and `equipment-only`, written when the site is read, whether or not the agent records anything. The deployment runs one replica, so "per hour" holds.

**The script** (one say-box, house ID first):
- While loading: "can I just confirm your house ID? I have it as 5674."
- When the name is agreed: "can I just confirm your house ID? I have it as 5674, that's Hillfield Farm (Solihull)."
- When the name step is shown: "can I just confirm your house ID? I have it as 5190. And which pub are you calling from?"

**Pre-release dry run** (a build task and a release blocker). `node scripts/oohdash-166-name-check.mjs` is a new, read-only script that uses the same svc-read path as `scripts/tb-parity.mjs`. It lists every house ID whose status would be `disagree` or `equipment-only`. While the rename is pending, the expected list is 5199 and 5190. Others go into the build gate; false alarms add a word to the skip lists. A false alarm only shows the optional name step, so it is safe.

**Known limits.** Sites with equipment named by number get no equipment comparison, so a wrong single Zendesk name still shows as agreed (as today). Two pubs that share a distinctive word could pass. The dry run cannot list a swap it doesn't detect.

### 3.6 Two sites on Lighthouse under one house ID (the safety net)

This applies only if `resolveSite` gets more than one site back from Lighthouse. No live site does today, because the Lighthouse look-up builds one site per number. Under "house ID drives", this is the one case where the number cannot tell us which equipment is the customer's. So remote control stays blocked (`confirmSite` refuses, as today). The card changes so the agent never loops back to search:
- The heading reads "⚠️ House ID 6758 has two sites on Lighthouse".
- The text reads "Lighthouse has two different sites under this house ID, so we can't tell which equipment is the customer's. You can't make changes from here tonight, but you can log it for the IoT team."
- The same name step as 3.5, with the question shown in the box ("Ask the customer: which pub are you calling from?"). The names offered are those of the two sites.
- The existing risk question with Yes (P1) and No (next-day ticket). Both tickets carry the name-check line and the tag.
- "Wrong house ID — search again" stays only as a small link, for a customer who gives a different number.

## 4. Screens and wording (the full list, checked against every flow)

Every screen follows the same rule. It shows the agreed name, or "House ID N". It never asks the agent to say "gk-5199" to a customer, and never shows a disputed name as fact.

| Where | Today (v1.7.6) | After |
|---|---|---|
| Confirm screen while loading | The search-row name is shown straight away | Heading "House ID 5674"; muted "Checking the pub name…"; script "can I just confirm your house ID? I have it as 5674."; button "Checking site…" (waits for equipment, as today) |
| Confirm screen, name agreed | Name + house ID; "you're calling from X, site number N?" | Name + house ID; "can I just confirm your house ID? I have it as 5674, that's Hillfield Farm (Solihull)." |
| Confirm screen, name in doubt or none | 5199: ambiguous card, blocked. 5190: wrong name shown as fact. Missing from Zendesk: "No site found". No name: "Site name unverified…" | Heading "House ID N"; script adds "And which pub are you calling from?"; name step (3.5) |
| Main button | ✓ This is the right site | ✓ House ID confirmed — open the site |
| Second button | Search again | Wrong house ID — search again |
| Name step | n/a | Lead line, chips, "Something else…", help line, then "✓ Pub name recorded…" with Change (3.5) |
| Control pop-up (`ctlTargetBlock`) | ⚠ Site name unverified — confirm the house number by voice before sending. / Unrecognised site gk-5199 | Agreed name, or "House ID 5199". There is no warning: the house ID was confirmed on the confirm screen. |
| Progress tracker (`drawControl`) | ⚠ Unrecognised site gk-5199 | Agreed name, or "House ID 5199" |
| Customer banner (`callerBanner`) | gk-5199 5199 | Agreed name + house ID; otherwise "House ID 5199", plus "· customer says X" once recorded |
| Ticket title (`buildOohTitle`) | gk-5199 or the Zendesk name | Agreed name; otherwise the customer's answer marked "(per customer)", or the house ID only |
| Ticket body | "Site field could not be resolved…" note only | Plus the name-check line (3.5) |
| Two-sites card heading | ⚠️ House ID 6758 is ambiguous | ⚠️ House ID 6758 has two sites on Lighthouse |
| Two-sites card text | This ID matches more than one site (…). To protect against changing the wrong site, remote control is blocked for ambiguous IDs. | Lighthouse has two different sites under this house ID, so we can't tell which equipment is the customer's. You can't make changes from here tonight, but you can log it for the IoT team. |
| Two-sites card script | I can't safely make changes for this site number tonight — It's logged, … | I can't make changes for this site tonight — I'll log it, and our IoT team picks it up the next working day. |
| Two-sites card "Search again" button | Button | Small link "Wrong house ID — search again" |

Nothing else on screen changes. The flows, the P1 path, the issue model and the F004 confirm token all stay as they are.

Customer-answerable check: the script asks only for the house ID and the pub name, which every customer can answer. "Customer" is used throughout, and no technical words are introduced.

## 5. How the discovery experience goals are met

| Discovery goal | How this design meets it | Prototype page |
|---|---|---|
| Searching a GK house ID goes straight to the pub name and confirm, with no mention of "ambiguity" | One site per house ID for same-name duplicates | 2 (after) against 1 (today) |
| Full 90-day history, including older tickets | Both tags searched and merged | 3 (after) against 4 (today) |
| The search step stays out of the way | Fast path unchanged; agent never bounced back to search over a name | 2, 5–10 |
| Site confirmation is high-stakes, so a check is right | The check is on the house ID, which is what drives the equipment. The name is never shown before it is checked, and is never read out when disputed. | 2, 5, 6 |
| An escalation must be clear and conclusive, not a dead end | Name problems never block. The two-sites card captures the name and goes to a ticket or P1 in place. | 11 |
| Sites on Lighthouse but missing from Zendesk are not blocked | Lighthouse fallback restored; name step offers the equipment name | 9, 10 |

## 6. Data dictionary (names Build and the tester use)

| Name | Meaning | Source | Notes |
|---|---|---|---|
| `siteNo` | House ID, digits only, as a string. The single key for equipment and control. | Search input / TB | One meaning everywhere |
| `zdOptionValue` | A Zendesk Site option's machine value (the "site tag"), for example `gk_5674` or `green_king__farm_house_inn__hillfield_farm` | Zendesk field 11405878329244 | Not sensitive |
| `zdOptionName` | The option's display name, `Brand::Sub-brand::<house ID> <Pub> (<Town>)` | Same | Not sensitive |
| `zdPubName` | `humanNameFromOption`: last `::` segment, house ID removed | Derived | Compared ignoring case, with single spaces |
| `zdSiteMatch.status` | `one`, `conflict` or `none` | `siteOptionsFor` | New |
| `zdSiteMatch.preferredTag` | The gk_ option value, otherwise the first option value | `siteOptionsFor` | Written to the ticket site field |
| `zdSiteMatch.allTags` | All option values for the house ID | `siteOptionsFor` | Callback history only |
| `tbEquipmentWord` | All-letter device-name segment after `gk-` (plus all-letter alias tokens), for example `sycamorefarm` | Device names already read | Never stored |
| `site.pubNames` | `{ status: agreed / disagree / equipment-only / none, agreedName, held: [{ name, from: equipment / ticket-system }] }` | tb-device (3.5) | Returned by `/summary`; drives every name on screen |
| `site.nameUnverified` | True when `pubNames.status` isn't `agreed` | resolution / tb-device | Kept for existing callers |
| `nameCheck` (browser `state.nameCheck`, server `rec.nameCheck`) | `{ siteNo, held[], answer, how: picked / typed / none, at }` | Agent input on the confirm screen or the two-sites card | `answer` is free text the customer gave, up to 120 characters. It's operational, not personal. It's kept only on the in-memory call record and the Zendesk ticket (Zendesk retention applies). |
| Name-check ticket line | `Name check (house ID N): our records list …; customer says … — please tidy the site list.` | `buildTrgBody` / `buildCallRecordText` | On the first ticket of the call |
| Tag `ooh_site_name_check` | Marks tickets that carry a name-check line | `createOutcomeTicket` extraTags | New tag; follows the `ooh_*` pattern |
| Data-quality note | Text line in Cosmos `OohAppConfig / data-quality` | `addDataQualityFlag` | Rolling 200 entries (unchanged); new notes hold no personal data |

## 7. Test plan

### 7.1 Unit tests (node --test, `test/oohdash-166-site-options.test.js` and others)

The test data is a stub option list built from real live names: the Hillfield pair, the three current 5199 options, gk_5190 as it is now, the renamed versions, gk_220 with gk_6220, the gk_612x group with md_612, and device names `gk-sycamorefarm-fridge-1`, `gk-sycamorefarm-freezer-1`, `gk_silkwoodfarm_salus_STA10108784 (5199-f-3)`, `gk-6209fryer-1`, `gk_salus_STA1 (5694-1)` and `gk-5674-boiler-1`. Each test must be shown to fail on today's code first.

| ID | Test | Expect |
|---|---|---|
| U1 | `siteOptionsFor('5674')` with the old and gk_ Hillfield options | `one`, preferredTag `gk_5674`, allTags both |
| U2 | The same, with the options in reverse order | Still `gk_5674` |
| U3 | `siteOptionsFor('5199')` with the three current options | `conflict`, two names |
| U4 | `siteOptionsFor('5199')` and `('5190')` with the renamed options | Both `one`; gk_5199 / gk_5190 |
| U5 | `siteOptionsFor('220')` with gk_220 and gk_6220 | `one`, `gk_220` |
| U6 | `siteOptionsFor('612')` with the gk_612x group and md_612 | `one`, `md_612` |
| U7 | Names differing only in case or spacing | `one` |
| U8 | `siteDirectory()` with the stub | One entry for 5674; two for 5199 (current) |
| U9 | `resolveSiteTag` / `resolveSiteName` for 5674, 5199 (current), 220 | gk_5674 / Hillfield Farm (Solihull); null / null; gk_220 / Bull & Anchor (Exhall) |
| U10 | `callbackLookup('5674')`, stubbed searches return 3 and 2 tickets (1 shared) | 4 tickets, newest first; two searches |
| U11 | `callbackLookup` when one search throws | The other's results are returned and the error is logged |
| U12 | `createOutcomeTicket` for 5674 | Site field `gk_5674`, no data-quality note |
| U13 | `resolveSiteInventory`, no entry, stubbed TB returns one site | Resolved (today: `none`) |
| U14 | `resolveSiteInventory`, conflict | One data-quality note, resolves through TB; none on a second search within the hour |
| U15 | `resolveSiteInventory`, TB returns two sites | Two-sites (safety net) |
| U16 | `pubNames` for: 5674 (agreed), 5199 current (disagree, Silkwood first and marked equipment), 5190 current (disagree, "Sycamore Farm (Burnley)" first from the whole list), 6418-style equipment-only, 6431-style none, and the `gk-6209fryer-1` / `gk_salus_…` names (no equipment word) | As in 3.5 |
| U17 | Tidying: silkwoodfarm, sycamorefarm, oakbrookfarm, meridian | Silkwood Farm, Sycamore Farm, Oakbrook Farm, Meridian |
| U18 | `/summary` returns `pubNames`; confirm screen shows no name before it | Golden text "Checking the pub name…" |
| U19 | `POST /confirm` with a `nameCheck` body field stores it on the call record; `POST /calls/:id/name-check` updates it; another agent's call is refused | Stored / updated / 403 |
| U20 | Name-check line wording for picked, typed, none-recorded and no-names-held | Exact strings as in 3.5 |
| U21 | First ticket of a call with `rec.nameCheck` gets the line + tag `ooh_site_name_check`; the second ticket does not | As stated |
| U22 | Call with `rec.nameCheck` and no other ticket: call record follows the DECISION (recommended: created open, priority low, tagged) | As decided |
| U23 | Typed answer with `<script>` or 500 characters | Escaped on screen; cut to 120 on the ticket |
| U24 | Screen-text golden test of the wording table in section 4 (vm dump of the real view functions) | Exact strings |

### 7.2 End-to-end tests (Playwright, fixture mode)

Fixture mode never reads the Zendesk list. The rules are covered by the unit tests; e2e covers the screens and the name step.

| ID | Test | Expect |
|---|---|---|
| E1 | Fixture site with `pubNames.status` agreed | Name + house ID; house-ID-first script; no name step |
| E2 | Fixture site with `disagree` (add one) | "House ID N"; name step with two chips; tap one, see "✓ Pub name recorded"; confirm; the outcome ticket body has the name line and the tag |
| E3 | The same, but "Something else…", type, Save | Typed name on the ticket |
| E4 | The same, but confirm without recording | Confirm works; the ticket line says "customer's answer not recorded" |
| E5 | Fixture `none` site | Text box only; confirm works |
| E6 | Search 6758 (fixture pair) | Two-sites card; name step; No gives a ticket with the name line; no Search-again button (link only). Update `tests/resolution.spec.js:32` and `tests/additional-notes.spec.js` E13 |
| E7 | Existing confirm-gate suite | Green, after its button text is updated to "House ID confirmed — open the site" |

### 7.3 Live checks after release (read-only except one test-mode ticket, by the release doer)

| ID | Check | Pass |
|---|---|---|
| L1 | Open 5674 | "Hillfield Farm (Solihull)", house-ID-first script, no name step |
| L2 | Callback lookup for 5674 | Tickets from both tags; the count matches a direct Zendesk search of both tags |
| L3 | A test-mode OOH ticket for one of the 69 sites | Site field = gk_ tag |
| L4 | Open 5199 (rename pending) | Name step offers Farmhouse Kitchen (Silkwood Park) "matches the equipment" and Sycamore Farm (Burnley); full control |
| L5 | Open 5190 (rename pending) | Name step offers Sycamore Farm (Burnley) "matches the equipment" and Farmhouse Kitchen (Silkwood Park) |
| L6 | Open 220 | Name shown; history present |
| L7 | `[UX]` timing lines for single-match sites | t-gate p95 no worse than v1.7.6 |

## 8. Release and rollback

- **Release:** v1.7.7 patch from clean main (`npm run release`), rolled out with `kubectl set image` (KUBECONFIG `C:/Users/james/.kube/ooh.yaml`). After the rollout, check `kubectl get deploy ooh-dashboard -o jsonpath='{.spec.template.spec.containers[0].resources}'` still shows the committed limits (512Mi memory). `set image` has kept stale limits before.
- **What changes for the IoT team:** a new ticket tag `ooh_site_name_check` and a "Name check" line on some OOH tickets. Tell Sam Day before release (orchestrator, not the build). The tag needs no Zendesk set-up; tags are created on first use.
- **No changes outside the code:** no Zendesk option edits or deletions, no Cosmos change, no environment or secret change, no new setting.
- **Rollback:** `kubectl set image` back to `apitechhub.azurecr.io/ooh-dashboard:cc04d3a` (v1.7.6). Nothing to undo elsewhere. Tickets already carrying the line or tag keep them, which is harmless.
- **The IoT team rename** can land before, during or after the release. Both states are covered by 3.5 and by tests U3, U4 and U16.

## 9. Cost and running

| Item | Cost |
|---|---|
| AI tokens | None. There are no model calls in the product. |
| Zendesk API | One extra search per callback lookup or site page, for the 69 two-tag sites only. It runs alongside the first. Name capture adds no Zendesk calls: the line rides on tickets the call already creates. Under the recommended option, a mismatch-only call creates its call record open instead of solved, so the number of tickets stays the same. |
| Lighthouse (TB) | No new calls. The fallback restores the pre-v1.7.5 read for unmatched house IDs only. The asset record is not read. |
| Background work | None added. No timers, polling or new processes. |
| Build effort | Small to medium: about 4 functions in zendesk.js, 1 in resolution.js, `pubNames` in tb-device.js, the name step in views.js, small call-record and ticket-body changes, 1 new route, and tests. |

## 10. Open flags and out of scope

- **Out of scope (James's decision A):** deleting the 69 old Zendesk options.
- **Out of scope, noted:** Lighthouse look-ups by house ID find equipment named after the pub (`gk-silkwoodfarm-fryer-2a`) only if `data/site-aliases.json` lists that word for the house ID. 5199 and 5190 have no alias today. This is not caused by v1.7.5. It is worth its own small ticket: add aliases for the Farmhouse Inns sites after a read-only check.
- **Interim:** until the rename, 5199 has no callback history (conflicting names, as today), and a pub-name search for "Sycamore" lists 5199. The house-ID-first script and the name step catch this.
- **Revision history:** revision 2 showed both names on the heading. Revision 3 (this version) makes the house ID the driver, moves names into an optional name step recorded on the ticket, drops the separate name-check and 5199-interim decisions, and changes the two-sites card to capture the name and go to a ticket in place.
- **UNRESOLVED:** how many look-ups were blocked between 13 and 19 November (from discovery). This does not block the design.
