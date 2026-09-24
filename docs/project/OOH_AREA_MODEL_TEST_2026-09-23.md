<!-- gate:contract
SECTION Decision first: The OOHDASH-82 area-model build is FUNCTIONALLY CORRECT and the test stage is ready to approve, with two named acceptance items closed by a live handler re-test rather than headlessly. The fixture-mode Playwright suite proves the two-area chip model end to end — the chips render as Accommodation / Bar-Restaurant (never serials or a gateway), a multi-device area reads its coldest online zone, the paired gateway is absent as an area, and every aircon request lands as an aircon-referral capture with no control button. What a fixture run cannot prove is the LIVE inventory shape (real iT500 site-codes, a real paired-gateway site) and the live coldest-zone read on a real mixed site — those are the live re-test steps listed below.
SECTION What this is: The test-stage report for OOHDASH-82 (the heating area model). It records the full regression result (Playwright + unit), the AC1-AC4 disposition split into automated-green versus needs-live-re-test, the new e2e coverage and fixture additions made this stage, and the exact live re-test script a handler must run to close the acceptance items that cannot be exercised headlessly. It changed NO product code — only tests and test fixtures.
SECTION Regression headline: Unit 252 pass / 0 fail / 1 skip. Playwright 47 pass / 2 fail. Both failures are a SINGLE pre-existing environment condition — the P1 SMS provider runs in log mode by default (no Twilio configured), so a P1 outcome honestly shows "text not sent, phone the on-duty manager" rather than "text message sent". Two legacy specs assert the Twilio-sent wording. This was PROVEN pre-existing by running those specs on the pre-build commit, where they fail identically; it is not a regression from this build and it is not a product bug (log-mode returning sent:false is the designed honest behaviour). It is out of scope for this gate.
SECTION What the build got right (independently re-verified): the heating step now derives at most two caller-meaningful areas from a device area field and stores the choice by NAME not list index; gateways and Intesis are structurally excluded from the area candidate set; a multi-device area surfaces the coldest online zone with an honest "coldest of N zones" note; a single-device area degrades to exactly today's single read; and aircon is never controllable — both the in-context shortcut and a typed keyword reach a normal aircon-referral capture, verified by inspecting the actual POST the app makes (not by reading source).
SECTION The fixture reality the tester had to close: fixture-mode serves devices verbatim from bridge-devices.json and never runs the live deriveArea, so before this stage NO fixture device carried an area field and the new chips could not render at all. Seven existing control/killswitch specs still drove the OLD per-device zone-N chips and went red against the new flow. This stage added the area field to every fixture heating device, added a design-§10.2 mixed site (6218: iT700, two mapped iT500s, an unmapped iT500, an Intesis, a paired gateway), migrated the seven specs to the area chips WITHOUT weakening any assertion, and rewrote the obsolete Intesis-control spec into an aircon-removal spec.
DECISION Approve the TEST stage for OOHDASH-82 — accepting that AC1, AC2 and AC4 carry a named live-handler re-test (chip render, live coldest-zone read, and the referral ticket on a real mixed site) to close, per the script in section 5? | Approve test stage (live re-test items tracked) | Request changes
DETAIL Method: the real server was driven in fixture mode (AUTH_MODE=dev, DATA_MODE=fixture, port 3155) via Playwright, full client-server-service round trips, no route mocking of the flow under test. Every verdict is backed by observed DOM content or the real network request, never a source-string check. The two failing specs were re-run on the pre-build commit 7768535 to confirm they are pre-existing. No product code (services, public/js, routes) was modified — only tests and test fixtures. Repo state verified: branch test/oohdash-82-area-model off main @ 15dce60; package version 1.2.4; WRITES_DISABLED default fail-closed (the fixture e2e sets it false only to exercise the dispatch flow, unchanged from before this stage).
-->

# Test — Heating area model: two-area selector, gateway fix, aircon referral (OOHDASH-82)

**Release:** OOH Triage Dashboard — R1 · **Stage:** Test · **Date:** 2026-09-23 · **Owner:** James Brown
**Ticket:** OOHDASH-82 (Story, Highest) — *Heating "area" selector: collapse to two areas (Accommodation / Bar-Restaurant) from device attributes; remove aircon control (refer via ticket).*
**Input (signed off):** `docs/project/OOH_AREA_MODEL_DESIGN_2026-09-23.md` (design, PR #44) and `docs/project/OOH_AREA_MODEL_DISCOVERY_2026-09-23.md` (discovery). Build merged as PR #45.

**Repo state (verified):** branch `test/oohdash-82-area-model` off `main` @ `15dce60` (`git rev-parse`); package version `1.2.4`; the build (PR #45) is merged into `main`. No product code was changed at this stage — only tests and test fixtures.

**Method.** The real server was driven in fixture mode (`AUTH_MODE=dev`, `DATA_MODE=fixture`, port 3155, self-hosted webServer) via Playwright — full client-to-server-to-service round trips, no route mocking of the flow under test. Every verdict below is backed by observed DOM content or the actual network request the app makes; no verdict rests on inspecting source text. The two failing specs were independently re-run on the pre-build commit `7768535` to establish whether they are pre-existing or a regression.

**Invariants honoured.** Writes to ThingsBoard stay LOCKED in production (`WRITES_DISABLED` default fail-closed); the fixture e2e enables writes only to exercise the dispatch flow, exactly as before this stage. No product source (`services/*`, `public/js/*`, `routes/*`) was edited — a tester tests the code, it does not modify it. The aircon change REDUCES the control surface. ThingsBoard remains system of record.

---

## 1. Regression result

| Suite | Command | Result |
|---|---|---|
| Unit | `npm run test:unit` | 253 tests · 252 pass · 0 fail · 1 skip |
| End-to-end (Playwright, fixture mode) | `npm test` | 49 tests · 47 pass · 2 fail |

Both Playwright failures share ONE pre-existing cause and neither is a regression from this build.

| Failing spec | What it asserts | Actual (fixture/log mode) | Disposition |
|---|---|---|---|
| `control.spec.js` — outcome-record failure retry (Protocol 4, 500 path) | The P1 outcome card reads "text message" sent to the on-duty manager. | The card honestly reads "Text not sent — phone the on-duty manager now" because the SMS provider runs in log mode (`sent:false`). | Pre-existing environment condition — fails identically on pre-build `7768535`. Not a regression; not a product bug. |
| `tonight-callback.spec.js` — contractor flow escalates P1 with text-message wording | Same "text message" sent wording on the contractor P1. | Same log-mode "text not sent" honest wording. | Pre-existing environment condition — fails identically on pre-build `7768535`. Not a regression; not a product bug. |

**Why these are not a product bug.** `services/escalation.js` sends via the configured SMS provider; with no Twilio credentials it uses the `log` provider, which returns `sent:false` by design so a log-mode no-op is never recorded as a successful dispatch. The UI then honestly tells the handler to phone the manager. That is correct fail-honest behaviour. The two specs assume a Twilio-configured environment and pre-date OOHDASH-82; closing them is a separate test-environment task, out of scope for this gate.

**Evidence they are pre-existing.** The two specs were run in isolation on the pre-build commit `7768535` (the merge immediately before the build feat commit) in a throwaway git worktree; both failed with the identical "text not sent" mismatch. The OOHDASH-82 build therefore neither introduced nor touched this behaviour.

---

## 2. What the build got right (independently re-verified)

Each item below was driven from scratch through the real UI and asserted on observed outcome — not trusted from the build's self-report.

| Behaviour | Observed evidence |
|---|---|
| Two-area chips, stored by NAME | The heating step renders `Accommodation` and `Bar/Restaurant` chips with those exact texts; the confirmed-area line echoes the area name, never a serial. |
| No serial or gateway as a chip | The flow panel contains no `gateway`, `salusit700`, `salusit500` or `intesis` token; no legacy `zone-N` chip exists. |
| Coldest-online representative for a multi-device area | Choosing Accommodation (two online zones, 19°C and 17°C) surfaces the 17°C device with the note "coldest of 2 zones in Accommodation". |
| Clean single-device degrade | Choosing a single-device area surfaces that one device with no "coldest of N" note. |
| Gateway never resolves as an area device | Choosing an area never yields the gateway id in the live read. |
| Aircon is never controllable | The aircon shortcut and a typed aircon keyword each POST a `capture` with class `aircon-referral`; the outcome card shows "Captured for the IoT team / next working day"; no warmer, cooler or send control renders. |
| No aircon top-level tile | The category tiles carry no `aircon` tile — aircon is reached only via the keyword suggestion or the in-context shortcut. |

---

## 3. AC1-AC4 disposition (automated-green vs needs-live-re-test)

Grading is against the design §9 AC-to-verification map. "Automated-green" means proven this stage by a fixture-mode e2e assertion on observed behaviour. "Needs live re-test" means a genuine dependency on live inventory or live session state that a fixture cannot stand in for (design §10.3).

| AC | Requirement | Automated-green this stage | Needs live re-test |
|---|---|---|---|
| AC1 | The area step presents only Accommodation and/or Bar-Restaurant present at the site, never serials/names. | Yes — chips render with exact area-name text; no serial/gateway token in the flow panel; the unmapped fallback chip reads "Heating — area not identified". | Yes — confirm on a REAL mixed site that the chips read as area names for live iT500 site-codes. |
| AC2 | A chosen area maps to the correct device(s); read = coldest online thermostat in the set. | Yes — multi-device Accommodation reads the coldest zone with the honest note; single-device area degrades cleanly. | Yes — confirm the live read matches the actual coldest zone on a real multi-thermostat area. |
| AC3 | Gateway devices no longer appear as selectable areas. | Yes — the paired gateway is absent from the chips and never resolves as an area device; fully covered by unit tests too. | Belt-and-braces — spot-check one real paired-gateway site. |
| AC4 | Aircon: no control in the dash; requests captured and referred by ticket (class `aircon-referral`). | Yes — shortcut AND keyword each POST `aircon-referral` as a normal capture with no control button; verified on the real network request. | Yes — confirm on live that a referral ticket is actually raised in Zendesk and no control is offered. |

**Summary.** AC3 is effectively closed headlessly (unit + e2e). AC1, AC2 and AC4 are automated-green for the LOGIC and the UI wiring, and each carries a targeted live re-test for the part that depends on real inventory or a real ticket being raised — exactly the split the design anticipated in §9 and §10.3.

---

## 4. New e2e coverage and fixture additions (this stage)

**New spec — `tests/area-model.spec.js`** (8 tests, all green). Drives site 6218 and asserts: the two area chips render with exact area-name text (AC1); the unmapped fallback chip is caller-meaningful (AC1/§7.2); Accommodation reads the coldest of its two online zones with the honest note (AC2); a single-device area degrades with no "coldest of N" note (AC2); the paired gateway is absent from chips and from the resolved area set (AC3); the aircon shortcut and a typed keyword each reach an `aircon-referral` capture with no control button, verified on the real POST body (AC4); and there is no aircon category tile (AC4/removal).

**Migrated specs — no assertion weakened.** `tests/control.spec.js` and `tests/killswitch.spec.js` drove the old per-device `zone-N` chips, which the build replaced. Their heating entry was migrated to click the area chip that resolves to the same target device, and a target assertion was updated where the coldest-online rule now selects a different (still-correct) device in a shared area. The obsolete "Intesis turn-off uses native mode Off" spec was rewritten to assert the NEW correct behaviour: an Intesis-only site offers no heating and no aircon control, and the request is captured and referred (`aircon-referral`) via the keyword route.

**Fixture — `data/fixtures/bridge-devices.json`.** Fixture mode serves devices verbatim and never runs the live `deriveArea`, so the area chips could not render without an `area` field on fixture devices. Added an `area` value to every fixture heating device (matching what `deriveArea` sets on the live path), and added the design-§10.2 mixed site 6218: an iT700 (Accommodation), a Staff iT500 and a Restaurant iT500 (Accommodation / Bar-Restaurant), an unmapped iT500 (fallback), an Intesis (kind aircon), and a paired gateway. No existing device was removed.

**Existing unit coverage confirmed present and green.** The build already ships `test/area-derivation.test.js`, `test/area-representative.test.js`, `test/gateway-classify.test.js`, `test/aircon-removal.test.js` and `test/tb-clientscope.test.js`, covering the derivation rules, the coldest-representative selection, the gateway reorder, the aircon removal and the client-scope read. These are behavioural (they call functions and assert return values / rendered HTML in a sandbox), not source checks, and all pass.

---

## 5. Live re-test script (handler login on a real mixed site — closes AC1, AC2, AC4)

A handler must run these on a real mixed-estate site (design §10.3). Each step names the acceptance item it closes.

1. Log in as a handler and open a real mixed site. In the heating flow, confirm the first step shows Accommodation and Bar-Restaurant chips (and the fallback chip only if an unmapped iT500 exists), an "Air conditioning" shortcut when the site has aircon, and NO serials or gateway chips. (AC1, AC3)
2. Choose Accommodation and confirm the live read shows the coldest online zone with the "coldest of N zones" note, and the confirmed-area line reads Accommodation, not a serial. (AC2)
3. Choose the aircon shortcut and, separately, type "air con not working"; confirm both reach the referral and raise a Zendesk capture ticket carrying class `aircon-referral`, with no control button anywhere. (AC4)
4. Confirm Warmer/Cooler still routes to the write-locked capture path (writes remain locked) — no live actuation. (invariant)

---

## 6. Pre-existing item to track separately (not a gate blocker)

The two P1 "text message sent" specs assume a Twilio-configured environment. In fixture/dev the SMS provider is log mode, so the honest "text not sent" wording renders and those assertions fail — identically on the pre-build commit. This predates OOHDASH-82 and is not a product bug. Recommend a follow-up test-environment ticket to either configure a stub SMS provider for e2e or adjust those two specs to assert the log-mode honest wording. It does not affect the OOHDASH-82 verdict.

---

*Method note: all e2e verdicts rest on observed DOM content or the real network request the app issues; no verdict rests on a source-string check. The two failing specs were re-run on pre-build `7768535` to confirm they are pre-existing. No product source was modified at this stage — only `tests/*` and `data/fixtures/bridge-devices.json`. Repo state verified against `main` @ `15dce60`, package version `1.2.4`.*
