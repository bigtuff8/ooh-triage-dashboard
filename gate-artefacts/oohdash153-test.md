<!--
gate:contract
TICKET: OOHDASH-153
PHASE: test
SECTION: What was tested
The merged build (main b877e83) was run locally in its fixture mode and each P1 outcome was driven through the real app. Every screen's text was captured. The orchestrator then read every capture against the approved design line by line. Five P1 scripts are reachable and all five match the design character for character. The Admin "P1 escalation log" card was checked, including Mark acknowledged and an old-style legacy row. The request and response for a P1, and what lands on the Zendesk ticket, were also captured.
SECTION: Results
All 15 checked surfaces pass. The P1 response now carries only the raised time and the ticket link. The Zendesk ticket keeps its ooh_p1 tag and has no "NOT SENT", "ACTION NEEDED" or dispatch note. Old log entries no longer show a false "send failed" tag. Unit tests: 845 pass, 0 fail. Playwright: 210 pass, 2 skipped and 1 fail. The one fail is in an unrelated boiler-boost test, explained below.
SECTION: Two findings, neither caused by this change
F1: two of the seven script copies cannot be reached through the UI. One is an identical copy of the heating script, the other a defensive contractor fallback marked "should not be reached". Both have the correct text, and a unit guard pins all seven. F2: the boiler-boost "until next on" end-to-end test failed when run at 07:52 on 27 October, just after the clocks went back. It checks a time that depends on the clock and touches no P1 code. CI passed it on this build's PR the night before. This should be a separate ticket.
DECISION: Approve test and proceed to release (v1.6.3)? | Approve - proceed to release | Block - needs more testing
-->

# OOHDASH-153 Test: clean up P1 SMS scaffolding

**Date:** 2026-10-27 · **Phase:** test · **Release:** R1 · **Code under test:** main b877e83 (build PR #171) · **Design:** PR #170

## 1. Method

- The tester ran the real app locally in its Playwright fixture mode on b877e83. No lookalike pages were used.
- It drove each P1 outcome and saved the outcome card's on-screen text plus a screenshot. Evidence is in `gate-artefacts/oohdash153-test/`.
- The orchestrator then read every capture against design section 5 (scripts) and section 3.4 (Admin card), comparing them line by line, and checked the request and response capture.

## 2. P1 outcome cards (script as shown on screen)

| # | Flow | Expected (design §5) | Shown on screen | Result |
|---|---|---|---|---|
| 1 | Kitchen off in service (legacy path) | D2 + "In the meantime the on-site override switch, if you have one, is safe to use." | Identical | PASS |
| 2 | Kitchen off in service (live path) | Same as 1 | Identical | PASS |
| 3 | Outside lighting | D2 + electrician procedure sentence | Identical | PASS |
| 4 | Fridge stock at risk | D2 + "The fridge itself isn't controlled by Lighthouse, so alongside our callback you should follow your normal appliance repair route." | Identical | PASS |
| 5 | Contractor on site, escalate now | D2 + "Please ask the engineer to hold on." | Identical | PASS |
| 6 | Contractor fallback | Same as 5 | Not reachable through the UI. Text checked in source and pinned by unit guard | See F1 |
| 7 | Something else P1 | D2 only | Identical | PASS |

D2 = "I've raised an urgent P1 ticket for this site and someone will call you back shortly."

Every card also shows the unchanged and true line: "The P1 is logged as ticket #N in the IoT Support dashboard, which pages the on-duty manager." PASS.

## 3. Server side

| Check | Result |
|---|---|
| P1 response `p1` = `{ raisedAt, link }` only. No `sentTo`, `dispatchOk` or `provider` | PASS (captured: raisedAt plus a link to the IoT dashboard ticket) |
| Zendesk ticket keeps the `ooh_p1` tag | PASS |
| No "NOT SENT", "ACTION NEEDED" or `#ooh-p1-dispatch` note on the ticket | PASS |
| Transcript still contains "P1 escalation raised - on-duty manager to be paged" | PASS by unit test `p1-log.test.js` (transcript tests kept). The fixture's timeline view truncates the transcript, so the screen capture cannot show it |
| Urgent priority, `[OOH]` subject, Support Request category | Unchanged code (not in the build diff) |

## 4. Admin P1 escalation log

| Check | Result |
|---|---|
| Heading "P1 escalation log" | PASS |
| Row text "Raised with ooh_p1 tag · IoT Support Dashboard pages the manager" | PASS |
| Mark acknowledged changes the row to "ack HH:MM" | PASS |
| Metrics row "P1 escalations / SLA" renders | PASS |
| Legacy row (old shape: `dispatchOk:false`, `provider:'log'`) shows the new static text and no "send failed" tag | PASS (0 send-failed tags) |

## 5. Suites

- Unit, `npm run test:unit` on b877e83: 845 pass, 0 fail, 1 skipped.
- Playwright full suite plus 9 new OOHDASH-153 walk tests: 210 pass, 1 fail, 2 skipped. All 9 OOHDASH-153 tests pass.
- CI on build PR #171: unit tests SUCCESS, e2e (playwright) SUCCESS.

## 6. Findings

**F1, unreachable script copies (pre-existing, not a defect of this change).**
- The second kitchen copy is identical to path 1.
- The contractor fallback sits after every contractor branch has already returned. The code comment calls it "should not be reached".
- Both carry the correct text, and the unit guard checks that the D2 sentence appears exactly 7 times with no old wording.
- Suggested follow-up: a small tidy-up ticket.

**F2, boiler-boost e2e is clock-sensitive (pre-existing, unrelated).**
- `boiler-boost.spec.js:314` (BB-C1, "until next on" time) failed when run at 07:52 UTC on 27 October, the first weekday after BST ended.
- It touches no P1 code, and CI passed it on PR #171.
- It needs its own ticket. It may relate to the DST work in OOHDASH-141/144.

## 7. Recommendation

Proceed to release v1.6.3 (patch). There are no env, secret or manifest changes. Rollback is the standard image rollback to v1.6.2.
