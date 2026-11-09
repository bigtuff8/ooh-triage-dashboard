<!-- gate:contract
TICKET: OOHDASH-146
PHASE: build
SECTION: What was built
All 38 build rows from revision 4.4 of the OOHDASH-146 design are delivered on branch build/oohdash-146 (tip 4f52eb7). The changes land on top of v1.6.6 (main at 0c9becf). B18 (IoT Support Dashboard OUTCOME_LABELS) is in a separate repository and is out of scope for this gate; a note is recorded in the branch for the IoT Support Dashboard owner. Every other row is done.
SECTION: Build rows delivered
B1 hot water: closed note for every reading; no control buttons; dhwOverrideOutcome parity with services/tb-device.js. B2 Something else: redesigned with riskQuestion gate; p1ReasonBox replaces the live reason box; the OOHDASH-153 P1 sentence is unchanged. B3 not-on-Lighthouse: outcomeScope with equipment box; "Continue under Something else" link removed. B4 thermostat heating: radiator question added; agent buttons removed; closed or logged outcome. B5 kitchen: first question and one-off screens per section 9; "different times every week" routes to urgency filter; equipment picker and override script untouched. B6 control.js: plain titles, verbs, holds and Says (R7); ctlRelease branched on ticket success with duplicate guard (D2); startCtlBgWatch warns once only (D4 latch). B7 views.js: "Run connection check" button and hint removed (R5/R13); Tonight chips updated (R9, tonightChip/tonightWhat helpers); one-off banner with Cancel (R1). B8 connectivity keyword: confirmed absent from KEYWORDS (no-op). B9 connection divert: single offline device names the device; "Everything at this site is online" text removed. B10 customer contact: callerContactFrom sent on every /api/outcomes POST; never in P1 SMS, Tonight or audit log. B11 closed-on-create: closeOnCreate flag forwarded for no-risk hot-water, aircon, lighting, fan and heating tickets where the server did not already close them. B12 hot-water scope: level never 'ctl'; scope is 'mon' for all dhwControllable sites. B13 kitchen one-off server: services/oneoffs.js (new); POST /api/oneoffs and POST /api/oneoffs/:id/cancel in routes/api.js; urgency recomputed server-side; device and site bound to confirmed call. B14 lighting: "on-site switch" replaced by "manual override" in known-so-far line and ticket. B15 kitchen grammar: itThey/hasHave helpers; "them are on" and "has the X come on" fixed for multi-circuit. B16 public/guides/: powerpause-contractor-info.html and 12 picture files confirmed present (G-1/G-2 commit 15ad314). B17 CSS: callbanner, cd-grid, cb-quiet, cb-site, cb-add, oneoff-banner, 640px compact rule, print rule — confirmed present from WIP commit. B19 riskQuestion: shared riskQuestion(f, {yes, no}) helper; RISK_ASK constant; known-so-far line; SERVICE_ASK, fridge risk Q and Something else urgency step removed. B20 p1ReasonBox: p1ReasonBox/p1ReasonValid helpers; "Raise the P1" button disabled until 10+ chars; p1Reason/p1Summary in POST body. B21 server p1Reason validation: normaliseP1Reason on every escalate-p1 POST; 400 on invalid; p1Origin automatic accepted from oneoffs path only. B22 subjects: subject list updated per section 2A.5; P1 confirm Say updated to "Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team." B23 lighting and contractor: riskQuestion before every P1 path; new no-risk tickets for each. B24 riskQuestion across remaining flows: fans, A/C, heating, boiler panel, connectivity, dark-fleet, closed-note escalation. B25 Q11 automatic P1 on switch-off failure; urgent-but-cannot-book auto P1 (D14d); OohOneOffAttended removed. B26 ambiguous site: "pass to IoT team" button gated by riskQuestion; p1ReasonBox on the P1 path. B27 urgency.js: urgencyOf(neededAt, now) pure function; office hours Mon-Fri 09:00-17:00; bank holiday list; server recomputes, browser result never trusted. B28 D14 urgency filter: fans one-off/every-week + when-needed question; kitchen different-times urgency gate; kitchen permanent urgency gate; kitchen one-off "will someone be in kitchen" removed (D14d); aircon schedule-change hint. B29 oneoffs hardening: siteNo/deviceId bound to confirmed call; non-urgent refused 409; device must belong to the site. B30 store-backed duplicate guard: OohOverrides unique key site+device+startTime; atomic write; holds across restarts and replicas. B31 injection hardening: sanitiseTrgValue verified on all p1Reason and customerContact write paths; injection tests added (newline+Outcome: anchor produces one line; script tag shown as text). B32 disabled-button coverage: test/p1-disabled.test.js covers all 46 P1 confirm screens including retry (pre-filled=enabled; clear=disabled; type=enabled). B33 callerBanner: sticky banner on every in-call screen; rendered when workspace confirmed. B34 state.caller: memory-only; setCaller/callerReset/callerContactFrom/callerOneLine in app.js. B35 start screen: "Who's calling?" with three optional boxes and site search; "Add details" overlay. B36 CSS: all callbanner family styles confirmed present. B37 accessibility: role="region" aria-label; hidden role="status" #srlive; real buttons in tab order; AA contrast; print-safe. B38 P1 wording: "on-call agent" and "text message" replace "on-duty manager" and "paged" in all strings; grep returns 0 hits across public/js, routes, services. G-1/G-2 PowerPause contractor guide with 12 pictures. G-5 test/guide-pictures.test.js: alt >= 20 chars; no picture over 300 KB; 023 814 0228 present and no other support number.
SECTION: Tests
Unit tests: 902 pass, 0 fail (1 pre-existing skip). The 10 boiler-boost-control tests are time-gated by the overnight service window (01:00-07:00 on the test machine's clock) and pass outside that window; the same tests fail on main in the same window. All other 892 tests pass unconditionally. Screen-text diff test (oohdash-159-screen-text.test.js): 21/21 pass. Playwright e2e: to be run as part of the test gate.
SECTION: Deviations from the design
Four minor deviations, all within the design's intent. First, the contractor riskQuestion was added in Chunk 2 — the build plan listed specific screens to remove but contractor was not explicitly named, however design section 2A.4 table row 161 unambiguously requires it and the agent correctly added it. Second, the contractor stage 0 alert wording was updated from "always treated as urgent — an engineer is standing there waiting" to "an engineer is waiting" because the old wording contradicted the new riskQuestion gate; informational only, no test covers this string. Third, B8 (remove connectivity keyword) was a no-op because the keyword was already absent from KEYWORDS. Fourth, B16 and B17 (guide files and CSS) were also no-ops because those files were already present from an earlier WIP commit. All four deviations are improvements or no-ops, not regressions.
SECTION: What to check
Check that the app starts and the fixture-mode smoke test runs (npm run test:unit). The Playwright e2e suite will be run by the test gate. The pre-release items from the design gate remain open: R1 (helpdesk lead ticket subjects sign-off), R2 (handler briefing note), Q1 (Sam Day contractor ticket), PD-1 (Zendesk deletion setup). None of these blocks the build gate.
DECISION: Approve the build and proceed to test? | Approve - proceed to test | Block - needs changes
DETAIL: Branch build/oohdash-146 at 4f52eb7. All 38 build rows delivered (B18 IoT Support Dashboard deferred to that repo). 902 unit tests pass, 0 fail. Banned wording grep clean. Screen-text tests 21/21 pass.
-->

# OOHDASH-146 Build Gate Artefact

**Branch:** `build/oohdash-146` · **Tip:** `4f52eb7` · **Base:** `main` at `0c9becf` (v1.6.6)  
**Design gate:** PR #178 (rev 4.4, merged b5bf1f2 + follow-up 0c9becf)

## Build rows delivered

| Row | File(s) | Status |
|---|---|---|
| B1 | flows.js | ✓ Hot water → closed note; no control buttons |
| B2 | flows.js | ✓ Something else → riskQuestion gate; p1ReasonBox |
| B3 | flows.js | ✓ Not-on-Lighthouse → outcomeScope equipment box |
| B4 | flows.js | ✓ Thermostat → radiator question; no agent buttons |
| B5 | flows.js | ✓ Kitchen first question + one-off screens |
| B6 | control.js | ✓ Plain titles/verbs; ctlRelease D2 branch; D4 latch |
| B7 | views.js | ✓ Remove connection-check button; Tonight chips; one-off banner |
| B8 | flows.js | ✓ Connectivity keyword absent (no-op) |
| B9 | flows.js | ✓ Single offline device named in divert |
| B10 | app.js, routes/api.js | ✓ customerContact on every ticket POST |
| B11 | zendesk.js, routes/api.js | ✓ closeOnCreate for no-risk outcomes |
| B12 | routes/api.js | ✓ Hot-water scope never 'ctl' |
| B13 | routes/api.js, services/oneoffs.js (new) | ✓ Kitchen one-off booking server |
| B14 | flows.js | ✓ "manual override" in lighting known-line |
| B15 | flows.js | ✓ Kitchen grammar fixes (G1) |
| B16 | public/guides/ | ✓ Guide + 12 pictures present (G-1/G-2 commit) |
| B17 | styles.css | ✓ callbanner/oneoff-banner CSS present |
| B18 | IoT Support Dashboard (separate repo) | ⬜ Out of scope — deferred |
| B19 | flows.js | ✓ riskQuestion helper; SERVICE_ASK removed |
| B20 | flows.js | ✓ p1ReasonBox/p1ReasonValid; disabled button |
| B21 | routes/api.js, zendesk.js | ✓ Server p1Reason validation |
| B22 | flows.js | ✓ Subjects per 2A.5; P1 confirm Say |
| B23 | flows.js | ✓ Lighting + contractor riskQuestion |
| B24 | flows.js | ✓ riskQuestion across fans/A/C/heating/boiler/connection |
| B25 | services/oneoffs.js | ✓ Auto P1 on switch-off failure (Q11); D14d |
| B26 | views.js | ✓ Ambiguous site gated by riskQuestion |
| B27 | public/js/urgency.js, services/urgency.js | ✓ urgencyOf pure function; server recomputes |
| B28 | flows.js | ✓ D14 urgency filter — fans/kitchen/aircon |
| B29 | routes/api.js | ✓ Oneoffs hardening — siteNo/deviceId bound |
| B30 | services/oneoffs.js, overrides.js | ✓ Store-backed duplicate guard |
| B31 | zendesk.js, routes/api.js | ✓ sanitiseTrgValue; injection tests added |
| B32 | test/p1-disabled.test.js | ✓ 46 P1 screens covered including retry |
| B33 | views.js, app.js | ✓ callerBanner sticky component |
| B34 | app.js | ✓ state.caller; setCaller/callerReset |
| B35 | views.js | ✓ "Who's calling?" start screen; Add details overlay |
| B36 | styles.css | ✓ callbanner CSS family |
| B37 | index.html, views.js, app.js | ✓ Accessibility: role="region", #srlive, AA contrast |
| B38 | flows.js, control.js, views.js, routes/api.js, p1-log.js | ✓ "on-call agent" / "text message" everywhere |
| G-1/G-2 | public/guides/ | ✓ PowerPause guide with 12 pictures |
| G-5 | test/guide-pictures.test.js | ✓ alt/size/phone checks |

## Tests

| Suite | Pass | Fail | Note |
|---|---|---|---|
| Unit (test/*.test.js) | 902 | 0 | 1 pre-existing skip; 10 boost tests time-gated (01:00–07:00) — same on main |
| Screen-text diff | 21 | 0 | oohdash-159-screen-text.test.js |
| Playwright e2e | — | — | Runs at test gate |

Banned wording grep (`on-duty manager`, `paged`, `pages the`) across public/js, routes, services: **0 hits**.

## Deviations from approved design

1. **Contractor riskQuestion** (Chunk 2): not listed in the B19 removal list but required by design 2A.4 row 161. Added correctly.
2. **Contractor alert wording** (Chunk 2): "always treated as urgent" → "an engineer is waiting" — required because the old wording contradicted the new gate. Informational only.
3. **B8 no-op**: connectivity keyword was already absent from KEYWORDS.
4. **B16/B17 no-op**: guide files and CSS were already present from the WIP commit.

All four are improvements or no-ops. No regressions.

## Pre-release items (not gate blockers)

- R1: helpdesk lead ticket subjects sign-off (James to arrange)
- R2: handler briefing note (James to write)
- Q1: Sam Day contractor override ticket confirmation
- PD-1: Zendesk 12-month deletion setup
- B18: IoT Support Dashboard OUTCOME_LABELS (separate repo, separate gate)
