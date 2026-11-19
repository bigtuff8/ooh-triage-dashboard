<!-- gate:contract
SECTION: What broke and when
Searching any of 70 Greene King house IDs (mostly Farmhouse Inns) on the OOH dashboard now returns "House ID XXXX is ambiguous — matches [same pub] and [same pub]" and blocks remote control. This started on 13 November 2026 when v1.7.5 went live. That release changed the first site look-up from a ThingsBoard query (which always returns one site per house number) to the Zendesk site directory, which holds duplicate or conflicting entries for each of these 70 GK sites. For 69 of them both entries describe the same pub, so the ambiguity is false. A second knock-on: the agent cannot see call history for blocked sites (zero historical tickets shown) and new OOH tickets for these sites are being created without the site field populated.

SECTION: Scale
70 Greene King sites (mostly Farmhouse Inns) are blocked from OOH remote control right now. 69 are the same pub listed twice under two different Zendesk tag names (a straightforward de-dup). One house ID, 5199, is genuinely complicated — two different pubs share it (Silkwood Park and Sycamore Farm Burnley) — a real data issue needing a decision. One further non-GK site (929, McDonalds) has a name clash but is not on the OOH estate. For sample site 5674 (Hillfield Farm Solihull): 117 tickets under its gk_5674 tag and 23 under the old legacy tag — all 140 are invisible to the agent while the site is blocked. How many operator attempts have been blocked since 13 November is not yet confirmed (the data quality log in Cosmos could not be read directly — the admin dashboard endpoint at /api/admin/data-quality will show it once an IoT-role session is active).

SECTION: Options
Three options. Option A — code-only de-dup: when the Zendesk directory returns multiple options for the same house number with the same pub name, the dashboard prefers the gk_ option and treats the site as unambiguous. The callback history search also covers both old and new tags so older tickets remain visible. No Zendesk admin access needed; small effort; unblocks all 69 same-name sites immediately. Option B — Zendesk field cleanup: Sam Day deletes the 69 legacy options. Cleans the data at source but requires admin access and verification of Zendesk's behaviour when deleting an option that is on existing tickets. Option C combines both — code fix unblocks first, Zendesk cleanup follows as data hygiene. Option C is recommended.

SECTION: Questions for Sam Day
Q1: Who is the admin for the Zendesk Site field (ID 11405878329244)? Assume Sam Day — does not block design.
Q2: When a custom field option is deleted from the Site field, what happens to tickets already tagged with that option — does Zendesk clear the site field value on those tickets, or does the tag value stay on the ticket even after the option is gone? Assume the field is cleared (treat as risk) — BLOCKS Option B/C design if unconfirmed.
Q3: Does the IoT Support Dashboard use the Site field value or legacy tag names (like green_king__farm_house_inn__*) to filter or display tickets by site, or does it use only the ooh/ooh_p1 tags for routing? Assume site field not used for P1 routing — does not block design.
Q4: Can the 69 legacy options be bulk-deleted, and is there any automation or alarm writer that tags new tickets with a legacy site tag (risk of deleted options being re-created during a deletion window)? Assume no bulk delete, no active re-creation — does not block design.

DECISION: Fix path | Option A — code de-dup only, Zendesk unchanged | Option B — Zendesk cleanup only, no code change | Option C — code de-dup now, Zendesk cleanup follows (recommended)
DECISION: Call history | Search both old and new site tags so the agent sees the full 90-day history (recommended) | Search the gk_ tag only after de-dup, legacy history lost
DECISION: Genuine clash — site 5199 | Show "this site has two different pubs at the same house ID — remote control not available, escalate the call" with a ticket logged (recommended) | Build disambiguation screen — show both pub names and ask the operator to pick
DECISION: Sites in TB but absent from Zendesk field | Restore pre-v1.7.5 behaviour — fall back to TB look-up when Zendesk has no match so control is not blocked | Accept the gap — if no Zendesk option exists, control is blocked (consistent with the new directory-first model) | Raise as a separate ticket
-->

# OOHDASH-166 Discovery — Zendesk site-directory ambiguity blocks 70 OOH sites

**Date:** 2026-11-19
**Status:** Investigation complete — gate for design decisions
**Scope:** Read-only investigation. No code or Zendesk changes in this spike.
**Trigger:** Live v1.7.6: searching house ID 5674 returns "House ID 5674 is ambiguous — matches Hillfield Farm (Solihull) and Hillfield Farm (Solihull)"; remote control blocked.

---

## Recurrence check (step 0)

This is not a recurrence of a previously-fixed ticket. The ambiguity was introduced by v1.7.5 (13 Nov 2026) and has not been seen or treated before.

---

## What is broken (current state — PROVEN)

An operator searching any of 70 Greene King house IDs (mostly Farmhouse Inns) on the OOH dashboard sees:

> **"House ID XXXX is ambiguous — matches [pub name] and [pub name]"**

Remote control is blocked. The operator cannot confirm the site. The callback lookup also returns no historical tickets. New OOH tickets created for these sites carry no site field (a data quality note is appended instead).

This message comes from `services/resolution.js:resolveSiteInventory` (~L126-134). When the Zendesk directory returns more than one match for a house ID, the function logs a data quality flag to Cosmos and returns an `ambiguous` status object — which the calling code translates into the error message the operator sees.

The two match names are always identical for 69 of the 70 blocked sites — the same pub listed twice — so the message reads "matches [X] and [X]", which correctly led James to investigate.

---

## Root cause — v1.7.5 regression (PROVEN)

### Before v1.7.5

`resolveSiteInventory` fell through to `resolveSite` → `bridge.getSitesByNumber(siteNo)` → `fetchLiveSitesByNumber(siteNo)` (services/tb-device.js:1720). That function queries ThingsBoard by device name prefix (`gk-{siteNo}-*`) and always constructs exactly **one** site object (tb-device.js:1917: `const sites = [site]`). One match → never ambiguous at the control gate.

### v1.7.5 change (commit 52aeda5, shipped 13 Nov)

`resolveSiteInventory` now reads the Zendesk site directory (a 1-hour cached call). At resolution.js:116-134, it imports the zendesk service, calls `siteDirectory()`, filters the resulting array to entries whose `siteNo` matches the searched key, and if more than one entry matches, returns an `ambiguous` status.

`siteDirectory()` maps the Zendesk Site field options (11405878329244) into `[{ siteNo, siteName, brand }]` entries — one entry per option. For the 69 same-name GK house IDs, two options exist: a legacy-named option (e.g. `green_king__farm_house_inn__hillfield_farm`) and a newer gk_ option (e.g. `gk_5674`). Both have the same `siteNo` extracted by `siteNoFromOption`. Result: `matches.length === 2` → `status: 'ambiguous'`.

**This is a confirmed v1.7.5 regression. The TB lookup path is unaffected; the Zendesk directory lookup introduced the false ambiguity.**

---

## Scale and breakdown (PROVEN)

Field 11405878329244 live snapshot (2026-11-19):

| Count | Description |
|---|---|
| 394 | Total options in the Site field |
| 317 | Distinct house IDs |
| 71 | House IDs with more than one option (ambiguous under the new path) |
| 69 | Same pub, same name, two options (false ambiguity — simple de-dup) |
| 1 | Three-way: house 5199 — two genuinely different pub names (Silkwood Park / Sycamore Farm Burnley) |
| 1 | Two options, non-GK: house 929 (McDonalds, Telford Forge) — not on OOH estate |

The 69 false-ambiguity sites are Greene King sites (mostly Farmhouse Inns, with a small number of other GK sub-brands). Each holds one legacy option (e.g. `green_king__farm_house_inn__hillfield_farm`, created when the field was originally populated) and one newer gk_ option (e.g. `gk_5674`, added when the tagging convention changed). The pub name and brand are identical between the two options.

---

## Second-order impact: callback lookup and ticket site field (PROVEN)

### Callback history hidden

`callbackLookup` (zendesk.js:716) calls `resolveSiteTag(siteNo)` → `matchSiteOption(options, siteNo)`. This function returns `null` when more than one option matches. With two options, `siteTag` is `null` and the function returns early with `unresolvedSiteTag: true` and zero tickets.

For site 5674: **117 tickets** under `gk_5674` and **23 tickets** under `green_king__farm_house_inn__hillfield_farm` are invisible to the agent. All 140 are hidden.

### New tickets missing site field

In `createOutcomeTicket` (zendesk.js:~L419-423): the function calls `resolveSiteTag(siteNo)`. If a tag is returned, it is added to the ticket's custom fields as the Site field value. If `resolveSiteTag` returns null, the custom field is omitted and a data quality note is appended to the ticket body instead.

Because `resolveSiteTag` returns `null` for all 70 GK sites, new OOH tickets are created without the site field. A data quality note is appended to the ticket body. This affects IoT Support Dashboard site filtering (the IoT Dashboard may rely on the site field for per-site views — see Q3 for Sam Day).

**Note:** This ticket-quality gap pre-dates v1.7.5. `matchSiteOption` has always returned `null` for >1 match; the gk_ options were added some months before Nov 13, so tickets for these 70 GK sites have been missing the site field since then. v1.7.5 made the problem visible to operators by blocking control too.

---

## Third impact: Cosmos DQ log (UNRESOLVED)

`resolveSiteInventory` calls `addDataQualityFlag(...)` on every blocked search attempt. These flags are written to Cosmos `OohAppConfig / data-quality`. The Cosmos CLI and pod logs were inaccessible during this investigation (no active Azure CLI auth to the account; pod logs empty — pod restarted). The count of blocked attempts since 13 Nov is therefore **UNRESOLVED**.

**How to verify:** A session authenticated as an IoT-role user can read `/api/admin/data-quality` on the live app, which returns all flags ordered newest-first. James or Sam Day can check this via the dashboard admin page or via `kubectl exec` into the pod.

---

## Triggers, automations, views (PROVEN)

27 triggers examined. **No trigger references any legacy site tag** (e.g. `green_king__farm_house_inn__*`, `gk_5674`). All triggers are generic (notification routing, IoT Dashboard webhook push, tag management).

The IoT Dashboard triggers ("Push New Tickets" and "Push Ticket Updates") fire on all ticket events and push `{{ticket.tags}}` as a string. P1 routing in the IoT Dashboard uses the `ooh_p1` tag, which is independent of the site field. Views were scanned; no view references a legacy site tag. No automation would re-create a deleted legacy option.

**Retiring the 69 legacy Zendesk options would not break any trigger, automation, or view.** Impact to existing tickets when an option is deleted is UNVERIFIED (Q2 for Sam Day).

---

## "None" sites — a related v1.7.5 regression (DEDUCED)

`resolveSiteInventory` also returns `{ status: 'none' }` when a house ID has no Zendesk option at all. Pre-v1.7.5, control fell through to the TB lookup and worked. Post-v1.7.5, any site in TB but absent from the Zendesk field is now also blocked. The brief notes 5 OOH tickets since August with "Site field could not be resolved" (house 220 cited), which are the ticket quality symptom of this pre-existing category. How many sites are now also control-blocked (the new symptom) is **UNRESOLVED**. This is a related but distinct issue from the ambiguity gap.

---

## Genuine clash — site 5199 (PROVEN)

House 5199 has three options:
1. `green_king__farm_house_inn__silkwood_farm` → "Farmhouse Kitchen (Silkwood Park)"
2. `green_king__farm_house_inn__sycamore_farm` → "Sycamore Farm (Burnley)"
3. `gk_5199` → "Sycamore Farm (Burnley)"

Two different pub names share the same house ID. This cannot be resolved by a name-match de-dup. It is a genuine data issue. The correct pub behind the `gk_5199` option is Sycamore Farm (Burnley). Silkwood Park has a legacy option only. Whether Silkwood Park has a valid house ID or should be re-keyed is **UNRESOLVED** (Q for Sam Day, out of scope for this ticket but noted for data hygiene).

---

## Options

### Option A — code-only de-dup (recommended as the first step)

**What it does:**
- In `siteDirectory()` (zendesk.js:~L164-186): when multiple options share the same `siteNo` AND the same `siteName`, deduplicate and return only the entry whose `value` starts with `gk_` (preferring the newer canonical tag). If names differ, return all entries (the genuine clash case — still ambiguous).
- In `matchSiteOption` (zendesk.js:~L80-83): same de-dup logic — when multiple options match and all have the same name, return the gk_ one rather than null.
- In `callbackLookup` (zendesk.js:~L721-726): when `resolveSiteTag` returns a gk_ tag, also run a secondary search for all other options for that siteNo (the legacy tag). Merge results so all historical tickets are visible.

**Token/cost efficiency (PROVEN compliant):** No new API calls. The Zendesk site directory is already a 1-hour cached call. The callbackLookup secondary search adds one extra Zendesk search per 90-day history lookup; the result set is small (23 tickets for the sample site). Cost uplift is negligible.

**Silent running (PROVEN compliant):** No background service, timer, or polling added. The 1-hour cache TTL fires on the next live request. No tokens consumed while idle.

**Effort:** S (small — changes to 3 functions in zendesk.js, no schema change, no Zendesk admin access required).

**Risk:** Low. Leaves legacy options in the Zendesk field (data hygiene gap, not a functional risk).

**Unblocks:** All 69 same-name sites. Site 5199 remains ambiguous (different names). "None" sites remain blocked (separate issue).

### Option B — Zendesk field cleanup

**What it does:** Sam Day deletes the 69 legacy options from the Site field. Only the gk_ options remain. `matchSiteOption` returns exactly one match per site.

**Token/cost efficiency:** No code change. No token impact.

**Silent running:** One-time admin action. Not applicable.

**Effort:** Medium (Zendesk admin access + verification of ticket impact, no bulk-delete API confirmed). Risk of disruption during the deletion window if anything is writing legacy-tagged tickets.

**Risk:** UNVERIFIED — Zendesk's behaviour when an option is deleted that is on existing tickets is unknown (Q2). Existing tickets may lose their site field value, breaking IoT Dashboard site filtering for historical tickets.

**Dependency:** Requires Sam Day confirmation of Q2 and Q4 before proceeding.

### Option C — both (recommended)

Code fix (Option A) first → unblocks all 69 same-name sites within one deploy. Zendesk cleanup (Option B) follows once Q2 and Q4 are confirmed with Sam Day. Best long-term outcome.

---

## Curatable requirements and features

Each item is separable; James can keep, cut, or defer individually.

| ID | Requirement | Outcome | Option |
|---|---|---|---|
| R1 | Deduplicate same-name options in siteDirectory() — prefer gk_ tag | 69 same-name sites unblocked from OOH control | A/C |
| R2 | Deduplicate same-name options in matchSiteOption() — prefer gk_ tag | Ticket site field populated for 69 sites | A/C |
| R3 | callbackLookup searches all matching site tags — both legacy and gk_ | Agent sees full 90-day call history for 69 sites | A/C |
| R4 | Site 5199 genuine-clash: show escalation card ("two different pubs, escalate") with auto-logged ticket | Operator has a clear outcome, audit trail preserved | A/C |
| R5 | Zendesk: delete 69 legacy site options (pending Q2+Q4 from Sam Day) | Root data issue resolved; no future false ambiguity from new gk_ additions | B/C |
| R6 | Restore pre-v1.7.5 TB fallback for "none" sites — or accept and raise as OOHDASH-167 | Sites in TB but absent from Zendesk not blocked | Separate |
| R7 | (Out of scope) Investigate Silkwood Park (site 5199 legacy option) house-ID correctness | Data hygiene for edge case | Out of scope |

---

## Customer experience success criteria (handed to design)

**Persona–journey map:**
The operator is an out-of-hours call-handler (non-technical, working an OOH shift). A pub manager calls: "our heating / hot water isn't working". The operator types the house ID they were given on the phone. They need to reach the site, see call history, and act — in under 60 seconds. The ambiguous card today terminates that journey with no path forward.

**Reassurance vs friction calibration:**
- The search step is routine and low-stakes: get out of the way, no checkpoint needed.
- The site confirmation is high-stakes (wrong site = wrong write): a brief confirmation gate is correct.
- An escalation outcome (site 5199, genuine clash) must be clear and conclusive — not a dead end. The operator must leave with a ticket number and a script.

**"Great looks like..."**
- Searching a Greene King house ID immediately shows the site name and proceeds to confirmation, with no mention of "ambiguity" or "legacy tags". The old error is gone.
- The agent can see the full 90-day call history including older tickets (pre-gk_ tag change), not just the last 6 months.
- For site 5199 (or any future genuine clash): a clear "this house ID has two different pubs — escalate the call" card, identical UX to the "not found" escalation, with a ticket logged automatically.

---

## Data scope (handed to design)

The fix touches the following data:
- **Zendesk Site field (ID 11405878329244):** option values and names. The key distinction is `value.startsWith('gk_')` vs legacy pattern. The `siteNo` is extracted from the option name's last `::` segment.
- **OohAppConfig / data-quality:** DQ flags written by `addDataQualityFlag`. Design will want to confirm these are cleared or annotated once the fix is live (not a backlog concern, but worth flagging to Sam Day).
- **Ticket site field:** currently null for all 70 GK sites. Post-fix, newly created tickets will carry the gk_ tag. Historical tickets already created without the field remain unchanged (Zendesk does not retroactively set custom fields on closed tickets).
- **Retention/sensitivity:** ticket data is personal/operational. Zendesk option data is non-sensitive. The DQ log contains handler names (from `operator.name`); retention follows the existing OohAppConfig 200-entry rolling window.

---

## End-to-end testing scope (handed to design)

The following scenarios must be verifiable once the fix is built:

| Scenario | Happy/unhappy | What to prove |
|---|---|---|
| Search house ID 5674 (or any of the 69 same-name sites) | Happy | No ambiguous card; site name shown; operator can confirm and proceed to control |
| Callback history for site 5674 shows tickets from both gk_5674 and legacy tag | Happy | Agent sees all 140 historical tickets (117 + 23), not zero |
| New OOH ticket created for site 5674 carries the site field set to gk_5674 | Happy | No data quality note; site field populated |
| Search house ID 5199 (genuine clash) | Unhappy | Escalation card shown; ticket logged; no crash |
| Search a house ID with no Zendesk option (e.g. house 220) | Unhappy | Consistent, expected behaviour (either TB fallback or clear "not found" message) — depends on Decision 4 |
| Fixture mode: no Zendesk directory — existing fixture tests unaffected | Happy | resolveSiteInventory falls through to TB read as before |

---

## Risks, costs, and benefits

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Zendesk deleting an option clears the field on historical tickets | Medium | Medium — historical tickets lose site field; IoT Dashboard per-site views break | Confirm with Sam Day (Q2) before any Zendesk change; Option A is safe regardless |
| gk_ prefix assumption wrong — some site has a gk_ option but the legacy one is correct | Low | Low — a site would get the wrong ticket tag | Cross-check: all 69 sites' gk_ option names match their legacy option names exactly (PROVEN) |
| Silkwood Park (5199 legacy option) has live tickets that need the site field | Low | Low — legacy-only site; unlikely active OOH use | Treat 5199 as escalation; note for Sam Day |
| Future field option adds (new sites) create new duplicates | Low | Same regression | Option B (cleanup) prevents this long-term; Option A handles it defensively |

**Cost:** Option A is code-only, no token cost increase, no recurring charges. Option B is a one-time Zendesk admin action. Option C = A + B.

**Benefits:** 70 Greene King sites (mostly Farmhouse Inns) restored to full OOH remote control. Full call history visible to agents. OOH tickets carry correct site field data. Data quality log clears.

---

## High-level next steps

1. **James makes Decision 1 (fix path), Decision 3 (site 5199), and Decision 4 (none-sites)** — these determine the design scope.
2. **Sam Day answers Q1–Q4** before any Zendesk change is made. Q2 is the critical one.
3. If Option A or C: design gate with the code change to `services/zendesk.js`. Effort S, one PR. No external dependency.
4. If Option C: Sam Day follow-up ticket to delete 69 legacy options (can be async, after the code fix is live).
5. The "none-sites" regression (Decision 4) may warrant a separate ticket (OOHDASH-167 suggested) if the TB-fallback path is chosen — it would be a small change to `resolveSiteInventory` to restore the pre-v1.7.5 fallback when `matches.length === 0`.

---

## Third-party question list

| ID | Question | For | Recommended default | Blocks design |
|---|---|---|---|---|
| Q1 | Who is the admin for Zendesk Site field 11405878329244? | Sam Day | Assume Sam Day | No |
| Q2 | When a Site field option is deleted, what happens to tickets already tagged with it — does the field clear, or does the tag stay on the ticket? | Sam Day | Assume field cleared (treat as risk) | YES if Option B/C chosen |
| Q3 | Does the IoT Support Dashboard use the Site field value or legacy tag names (green_king__farm_house_inn__*) for ticket filtering or display, or only ooh/ooh_p1 tags for routing? | Sam Day | Assume Site field not used for P1 routing (DEDUCED from trigger sweep) | No |
| Q4 | Can the 69 legacy options be bulk-deleted? Is any automation or alarm writer creating tickets tagged with a legacy site tag (risk of deleted options being re-created)? | Sam Day | Assume no bulk delete, no active re-creation | No |

---

*Investigation by ooh-triage-dashboard-R1-mvXXXX · 2026-11-19*
*Evidence: services/resolution.js:104-152 | services/zendesk.js:80-186 | services/tb-device.js:1720-1920 | Zendesk field 11405878329244 live snapshot (2026-11-19) | Zendesk ticket counts: gk_5674=117, legacy=23 | 27 triggers examined*
