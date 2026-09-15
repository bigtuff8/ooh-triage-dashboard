<!-- gate:contract
SECTION Scope: This design covers B0 / R0 ONLY — recognisable site identity (name/brand/address) at the dispatch confirm step, and its confirm-modal visual hierarchy (C9). It contains no dispatch-authz work (that is DESIGN_dispatch-authz.md / R4) and no /healthz work. Carried conditions and the other blockers live in RELEASE_CONDITIONS_REGISTER.md and are referenced by ID, not re-pasted.
SECTION The defect: In live mode fetchLiveSites() cannot get a site name from the bridge /api/devices payload, so it sets siteName = accountId and leaves brand/address undefined (bridge.js:122-127). Every downstream identity render — the resolve confirm script, the site header, and the dispatch confirm modal — therefore shows an opaque identifier ("gk-6261 6261", "undefined · undefined") instead of a recognisable pub. A wrong-site dispatch is IRREVERSIBLE, so this is a pre-flip safety requirement, not cosmetic. It is tester Tony Willetts' fail on tests 1, 2 and 3.
SECTION The split (buildable-now vs blocked-on-B2): The app CAN resolve a human site name NOW without B2, by reusing the existing Zendesk site-field option lookup (zendesk.js:53-73, resolveSiteTag) which is keyed off the same house number and already carries a human option name — enrich the live site record with a name from there. Brand and full postal address are NOT in Zendesk's site-tag options and NOT on the current bridge wire; a complete brand+address confirm target DEPENDS ON B2 (the extended F025 bridge contract / registry), owner Spencer/IoT. Design states clearly what lands now and what waits.
SECTION Visual hierarchy (C9): The confirm modal (control.js:96) currently leads with "Sending to:" then the name; the accountId/siteNo mono chip sits inline. Redesign so the recognisable identity is the MOST prominent element and a bare accountId is never an acceptable confirm target — when only an accountId is available the modal must show an explicit "unverified site name" warning rather than presenting the opaque id as if it were the site.
SECTION Tests: enrichment yields a real name in live mode; a confirm target with no resolvable name shows the unverified-identity warning and de-emphasises the raw accountId; fixture mode is unchanged; brand/address degrade gracefully to a single-line name when B2 data is absent.
DECISION identity-source: Enrich live site records with a human site name NOW via the existing Zendesk site-field option lookup (resolveSiteTag path, zendesk.js:53-73), replacing siteName = accountId (bridge.js:124). Full brand + postal address at confirm is DEFERRED to B2 (extended F025 bridge contract / registry), owner Spencer/IoT — the confirm modal degrades gracefully to name-only until B2 lands and NEVER presents a bare accountId as the site identity.
DECISION confirm-hierarchy: Redesign the confirm modal (control.js:96) so recognisable site identity is the single most prominent element (C9); when no name resolves, show an explicit "site name unverified — confirm the house number by voice" warning and de-emphasise the raw accountId. An opaque accountId alone is not an acceptable confirm target.
-->

# Design — B0 / R0 site identity at the confirm step

**Release:** OOH Triage Dashboard — internal IoT-team live-control · **Stage:** Design · **Blocker/Requirement:** B0 / R0 · **Date:** 2026-09-15
**Repo state (verified):** `main`, app v1.2.0. In live mode `fetchLiveSites()` sets `siteName = g.accountId` and leaves `brand`/`address` `undefined` (`services/bridge.js:122-127`); every identity render downstream therefore shows the raw `accountId`.
**Scope:** exactly one thing — a recognisable site identity (name/brand/address) at the dispatch **confirm** step, plus that confirm modal's **visual hierarchy** (C9). No dispatch authz (see `DESIGN_dispatch-authz.md`, R4), no `/healthz`, no confirm-loop timing (C4/C7). Carried conditions and the other pre-flip blockers live in `RELEASE_CONDITIONS_REGISTER.md`, referenced here by ID, not re-pasted.
**Method:** every code claim verified firsthand against deployed source on `main`, cited to `file:line`. Any external-owned dependency is named with its owner.

> **Safety framing.** A wrong-site dispatch is **irreversible** (an actuation lands on a real pub's heating/hot-water). Presenting an opaque `gk-6261` as the confirm target invites confirming the wrong site. B0/R0 is therefore a **pre-flip safety requirement**, not cosmetic. This is exactly tester **Tony Willetts'** fail on tests 1, 2 and 3 (search-by-number, search-by-name, confirm-correct-site — *"Doesnt show house name or location. Just gk-6261 6261"*).

---

## 1. Verified current state

- The bridge `/api/devices` contract is a **flat device array with no site name** (`bridge.js:1-16`). `fetchLiveSites()` reconstructs sites by grouping on `accountId`, then sets:
  - `siteName: g.accountId` — the `TODO` explicitly notes a real name *"needs a registry/Zendesk lookup (F025 follow-up)"* (`bridge.js:122-124`);
  - `brand: undefined`, `address: undefined`, `callsLast30Days: undefined` — *"not in payload — registry/Zendesk-sourced (guarded downstream)"* (`bridge.js:125-127`).
- The canonical site shape callers expect is `{ siteNo, siteName, brand, address, callsLast30Days, devices[] }` (`bridge.js:13-14`). Fixture mode supplies all of it (e.g. `"Old Grey Mare" · "Greene King · Farmhouse Inns" · "Stockton Ln, York YO31"`, `data/fixtures/bridge-devices.json`), which is why the confirm path *looks* correct in dev and **degrades only in live** — the mode Tony tested.
- That degraded `siteName`/`brand`/`address` flows to **every identity render**:
  - the resolve/confirm script — *"Can I just confirm — you're calling from **{siteName}**, site number **{siteNo}**?"* and the site header `{brand} · {address}` (`public/js/views.js:88-91`);
  - the **dispatch confirm modal** (compose target): `Sending to: <b>{siteName}</b> {siteNo} → {deviceId} ({zone})` (`public/js/control.js:96`, `data-testid="control-target"`);
  - the sync-tracker header (`control.js:113`) and recents/audit rows (`views.js:105,145`).
  - In live mode these become *"gk-6261 6261"* and *"undefined · undefined"*.
- An **identity resolver already exists in-app**: `resolveSiteTag(siteNo)` pages the Zendesk **site custom-field options** (`config.zendesk.siteFieldId`), matches on the embedded house number, and returns the matching option — a **human-named** site option — with a 1-hour cache (`services/zendesk.js:53-73`). It is used today for ticketing, keyed off the *same* house number the confirm step already has.

**Consequence.** The app has, in-process, a source for a **human site name** (Zendesk site-field options) that it is not using to populate the live site record. **Brand and full postal address**, however, are in neither the Zendesk site-tag option nor the current bridge wire — those are the part that genuinely depends on B2.

---

## 2. Design decision

### Option chosen — enrich the live site name now (Zendesk options), defer brand+address to B2

**Option A — name-from-Zendesk now (CHOSEN).** In `fetchLiveSites()`, replace `siteName = g.accountId` (`bridge.js:124`) with a name resolved via the existing Zendesk site-field option lookup for `siteNo` (the `resolveSiteTag` path, `zendesk.js:53-73`), falling back to `accountId` **only when no option matches**. This lands a recognisable name **without B2**, reusing a lookup that already runs, is already cached (1h), and is keyed off the house number the confirm step holds. It directly fixes Tony's tests 1-3 for the **name** (the dominant complaint).

**Option B — wait for B2 to carry name/brand/address on the wire (NOT chosen as the sole path).** The clean long-term source is the extended **F025 bridge contract** (or a registry) delivering `siteName`/`brand`/`address` in `/api/devices`, removing the per-confirm Zendesk dependency. This is **owner Spencer/IoT** and is tracked as **B2**. It is the right home for **brand + full address**, but gating the whole fix on it leaves the pre-flip name gap open indefinitely. So B is the destination, not the interim.

**Decision: do A now, converge on B.** Enrich `siteName` from Zendesk immediately; keep `brand`/`address` `undefined` until B2 lands and **degrade the confirm UI gracefully to name-only** in the interim (§4). The site record's shape is unchanged, so when B2 begins populating `brand`/`address` the confirm modal lights them up with no further app change.

**Buildable now (no B2):** a recognisable **site name** at resolve, confirm-modal, header and audit renders, via the existing Zendesk option lookup.
**Blocked on B2 (Spencer/IoT):** **brand** and **full postal address** at confirm — not present in Zendesk site-tag options and not on the current bridge wire. Until B2, the confirm target is **name + house number**, which is already sufficient to end the "gk-6261" defect; brand/address are additive confidence.

### Confirm-step visual hierarchy (C9)

Regardless of source, the confirm modal (`control.js:96`) is redesigned so **recognisable identity is the most prominent element**:

- Lead with the **site name** as the largest/boldest line (not the "Sending to:" label); house number as a secondary chip; `deviceId`/`zone` demoted to a technical sub-line.
- **Never present a bare `accountId` as the site.** When the resolved name is still just the `accountId` (Zendesk miss **and** no B2 data), the modal must render an explicit **"⚠ Site name unverified — confirm the house number by voice before sending"** banner and visibly de-emphasise the raw `accountId`, rather than showing it as if it were the site name. An opaque `accountId` alone is **not** an acceptable confirm target (C9).

---

## 3. Key constraints

- **Do not block heating control.** The change is confined to how `siteName` (and later `brand`/`address`) is *populated/displayed*; device resolution, guardrails and dispatch are untouched.
- **Zendesk-lookup cost/failure.** `resolveSiteTag` is network + 1h-cached (`zendesk.js:55-64`) and returns `null` on miss or error (`zendesk.js:69,72`). Enrichment must be **best-effort and non-fatal**: a Zendesk failure must **not** break `fetchLiveSites()` (which throws → degraded/capture-and-escalate, `bridge.js:138-153`). On miss/error, fall back to `accountId` **and** trigger the §2 "unverified" confirm warning.
- **Live-only.** Fixture mode already carries full identity; enrichment applies to the live branch only, leaving dev/Playwright behaviour unchanged.
- **B2 dependency is honest.** Brand/address remain `undefined` until B2; the UI degrades to name-only. Nothing here closes B2 or F025 — those are Spencer/IoT (see register B2/R2).
- **Confirm-token safety (C2) is out of scope** but must not regress — this design changes identity display only, not the confirm-token single-use path (`resolution.js:50-64`).

---

## 4. Files / functions to change

| File | Change |
|---|---|
| `services/bridge.js` | In `fetchLiveSites()` (`:100-133`), replace `siteName: g.accountId` (`:124`) with a best-effort name resolved for `siteNo` via the Zendesk site-field option lookup (reuse/extend `resolveSiteTag`, `services/zendesk.js:53-73`, to expose the option's human name), falling back to `accountId` on miss/error. Keep `brand`/`address` `undefined` until B2 (`:125-126`); leave the site shape (`:13-14`) intact so B2 populates them with no further change. Enrichment must be non-fatal (wrap so a Zendesk error never throws out of `fetchLiveSites()`). |
| `services/zendesk.js` | Surface the matched option's human *name* (not just its tag `value`) from the site-field option lookup (`:66-68`) so bridge enrichment can consume a display name. No new external call — same paged/cached options. |
| `public/js/control.js` | Redesign the confirm-modal target (`:96`, `data-testid="control-target"`) so site identity is the most prominent element (C9): name largest, house number secondary, device/zone demoted. Add the "⚠ site name unverified" banner + de-emphasised `accountId` when the name is unresolved. Mirror the identity emphasis in the sync-tracker header (`:113`). |
| `public/js/views.js` | Guard the resolve/confirm script and site header so a missing `brand`/`address` renders name-only (no literal "undefined · undefined") until B2 (`:88-91`). Same graceful-degrade applied to recents/audit identity (`:145`). |

*(Line numbers are the touch-points, not the full edit surface.)*

---

## 5. Test plan (proving the fix)

1. **Name enrichment lands in live mode.** Live mode, Zendesk site-field options stubbed to contain a human name for house `6261`; assert `fetchLiveSites()` returns `siteName` = that name (not `gk-6261`), and the confirm modal target (`control.js:96`) renders it as the dominant line. *(Tony's tests 1-3: search-by-number, search-by-name, confirm-correct-site now show a recognisable pub.)*
2. **Search-by-name works.** With the enriched name in the record, `searchSites('robin')` (`bridge.js:163-168`, which already matches on `siteName`) returns the site — proving test 2 (search by name) is satisfied by the same enrichment.
3. **Unverified-identity guard.** Live mode, Zendesk lookup returns `null` (miss/error) and no B2 data; assert the confirm modal shows the **"site name unverified"** warning, de-emphasises the raw `accountId`, and does **not** present the `accountId` as the site name (C9). Assert `fetchLiveSites()` still succeeds (non-fatal).
4. **Graceful brand/address degrade (pre-B2).** `brand`/`address` `undefined`; assert the header and confirm script render name-only with no literal "undefined · undefined" (`views.js:88-91`).
5. **B2-ready.** When the site record *does* carry `brand`/`address` (simulating B2), assert the confirm modal surfaces them beneath the name with no code change — proving the shape is B2-forward.
6. **Fixture unchanged.** Fixture mode still shows full identity (`Old Grey Mare · Greene King · Farmhouse Inns · Stockton Ln, York YO31`); no regression.

---

## 6. Conditions referenced

- **B0 / R0** — the blocker/requirement itself: recognisable site identity at confirm before the flip. **Partially closable now** (name via Zendesk); **brand + address depend on B2**. See the register for the full row.
- **C9** — confirm-step visual hierarchy: recognisable identity must be the most prominent element and a bare `accountId` is not an acceptable confirm target. **Addressed** by §2/§4.
- **B2 / R2** — the extended F025 bridge contract / registry read (owner **Spencer/IoT**) is the durable source of `siteName`/`brand`/`address` on the wire and the home of brand+address for confirm. **Not closed here.**
- **C4** (dispatch-time freshness) noted only where it touches identity: the site (and its enriched name) is served from `fetchLiveSites()`'s 30s TTL cache (`bridge.js:22,101`); this design does **not** decide C4's dispatch-time re-fetch — it is called out so the identity shown is understood to be cache-fresh, not re-fetched at dispatch.

All other carried items (B1/B3, C1-C8, R1/R3-R11, the shaping conditions) are **out of scope here** and tracked in `RELEASE_CONDITIONS_REGISTER.md`. None is closed by this artefact.

---

*All line numbers cited against repo `main`, 2026-09-15, verified firsthand for this artefact: `bridge.js:1-16,13-14,22,100-133,122-127,124,138-153,163-168`, `zendesk.js:53-73,66-68`, `public/js/control.js:96,113`, `public/js/views.js:88-91,105,145`, `resolution.js:50-64`, `data/fixtures/bridge-devices.json`. B2 is UNVERIFIED, owned by Spencer/IoT. This artefact decides the site-identity-at-confirm approach only; it does not invoke gates, open a PR, commit the change, or flip anything.*
