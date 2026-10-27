# OOHDASH-153 Test Gate Results

Date: 2026-10-27  Commit: b877e83 (main, post-merge)
Spec: gate-artefacts/oohdash153-design.md sections 3.4 / 4 / 5 / 6a

SUITE COUNTS
============
Unit (npm run test:unit): 845 pass, 0 fail, 1 skip
Playwright full suite:    210 pass, 1 fail (BB-C1 pre-existing), 2 skip
Playwright oohdash153 spec (9 tests): 9 pass, 0 fail

Build doc claimed 202/0/2 for Playwright (before my 9 tests).
Actual pre-my-spec count: 201/1/2 -- see finding F2.

P1 OUTCOME CARDS
================

#1 Kitchen legacy (site 6832) flows.js:1894                         PASS
   D2 + on-site override switch sentence -- character-exact

#2 Kitchen live-mode (site 8888, Tuya) flows.js:1894                PASS
   Both journeys execute line 1894 (see finding F1)

#3 Outside lighting (site 6749) flows.js:2131                       PASS
   D2 + duty-manager/electrician sentence -- character-exact

#4 Fridge stock-at-risk (site 6832) flows.js:2183                   PASS
   D2 + appliance repair route sentence -- character-exact

#5 Contractor pp=no (site 6759) flows.js:2328                       PASS
   D2 + Please ask the engineer to hold on -- character-exact

#6 Contractor fallback flows.js:2411                       FINDING (F1)
   DEAD CODE -- unreachable via any UI flow.
   Source text correct per unit source guard (845/0/1 unit run).

#7 Something else P1 (site 6749) flows.js:2450                      PASS
   D2 only -- character-exact

D2 sentence on all 5 reachable paths:
  "I've raised an urgent P1 ticket for this site and someone will call you back shortly."

Old wording absent ("sent an urgent text", "but someone will ring you shortly"): PASS

DISPATCH-STATUS LINE
====================
Expected: "The P1 is logged as ticket #N in the IoT Support dashboard,
           which pages the on-duty manager."
Actual: confirmed on all 5 driven paths -- ticket number varies, wording exact.
VERDICT: PASS

RESPONSE SHAPE (p1 field) -- evidence: p1-request-response.json
================================================================
p1.raisedAt  : 2026-10-27T07:52:52.147Z                            PASS
p1.link      : https://zendesk-uat.airedale-api.co.uk/?ticket=45176 PASS
p1.sentTo    : absent (undefined)                                   PASS
p1.dispatchOk: absent (undefined)                                   PASS
p1.provider  : absent (undefined)                                   PASS

ZENDESK TICKET SIDE -- evidence: p1-zendesk-side.txt
=====================================================
ooh_p1 tag present: yes                                             PASS
ooh tag present: yes                                                PASS
NOT SENT in timeline         : absent                               PASS
ACTION NEEDED in timeline    : absent                               PASS
#ooh-p1-dispatch in timeline : absent                               PASS
phone the on-duty manager now: absent                               PASS
Dispatch note (addP1DispatchNote): deleted -- only [TRG] transcript PASS

Note: addP1DispatchNote deleted from services/zendesk.js. Zendesk ticket
carries only the [TRG] transcript note. Positive audit in Cosmos via p1-log.js.
Correct per design s4.

ADMIN CARD -- evidence: admin-p1-log.txt, admin-p1-log.png
===========================================================
Heading: P1 escalation log                                          PASS
Row static text: Raised with ooh_p1 tag, IoT Support Dashboard pages the manager  PASS
Mark acknowledged button present                                    PASS
After ack: ack 07:52 timestamp shown                                PASS
No send-failed tag                                                  PASS
Metrics: P1 escalations / SLA = 14, median ack 0 min               PASS

ADMIN CARD LEGACY ROW -- evidence: admin-legacy-row.txt
========================================================
Injected: { dispatchOk: false, sentTo: On-duty escalation manager, provider: log }
Static text present: Raised with ooh_p1 tag, IoT Support Dashboard pages the manager  PASS
send-failed tag count: 0                                            PASS
Old sentTo/dispatchOk fields not rendered                           PASS

FINDINGS
========

F1 -- Dead code at flows.js:2053 and 2411 (pre-existing, not from OOHDASH-153)

  flows.js:1888: if (!f.data._liveKs) guard catches ALL kitchen paths -- line 2047
  never reached, line 2053 is dead code. Both kitchen P1 journeys execute line 1894.

  flows.js:2411: all four contractor branches return before this line.
  No UI state can trigger the fallback.

  Impact: none. All 5 reachable P1 paths verify correctly. Dead paths have correct
  D2 text per unit source guard. Pre-existing (old wording was there before this PR).
  Routing: follow-on cleanup ticket.

F2 -- BB-C1 (boiler-boost.spec.js:314) fails at post-DST runtime (pre-existing)

  BB-C1 asserts revertAtMs via expectedUntilNextOnTime(nowMs).
  Despite a comment claiming not-time-dependent, the assertion depends on current
  London time and DST offset. BST-to-GMT occurred 2026-10-26; test fails at 07:52 UTC.
  OOHDASH-153 changes do not touch boiler-boost or time calculation code.

  Build doc claimed 0 e2e failures; actual: 1 (BB-C1). Build agent ran at a time
  when the test happened to pass.
  Routing: separate BB-C1 DST investigation ticket.

VERDICT: PASS
=============

All OOHDASH-153 functionality verifies correctly:
  5 reachable P1 UI paths -- character-exact D2 scripts confirmed
  Response p1 shape -- {raisedAt, link} only, no legacy fields
  Zendesk side -- ooh_p1 tag present, no dispatch note written
  Admin card -- renamed, static text correct, ack works, metrics correct
  Legacy-row rendering -- no send-failed tag, old fields not rendered
  Unit: 845 pass, 0 fail, 1 skip

Finding F1 (dead code) is pre-existing and does not affect correctness.
Finding F2 (BB-C1 DST flakiness) is unrelated to OOHDASH-153.