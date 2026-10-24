<!--
gate:contract
TICKET: OOHDASH-141
PHASE: test
SECTION: Automated test results
All 671 pre-existing unit tests pass. Seventy new tests were added across six new test files. Every row of the §5 clamp decision table is covered (20 tests), both DST nights (fall-back 2026-10-25 and spring-forward 2027-03-28), all allow-list rejections, all §6 revert decision rows (V1 and V2), the full dispatchBoilerBoost flag and outcome paths, and the WRITES_DISABLED exemption for the revert. Playwright e2e: 7 of 7 pass — boost button display, duration picker, dispatch, outcome copy, warning acknowledgment, and the Heat OFF path all verified against the fixture harness.

SECTION: What the live field test must confirm
Three things remain for a live test at a real boilerControl site. First: confirm a Heat ON boost forces the zone and the boiler follows (Q3 was answered YES in the supervised test on 2026-10-24, so this is a re-check in the shipped code path). Second: confirm the revert fires at the correct time and sets the zone back to auto, with the Zendesk ticket updated with the revert outcome. Third: confirm the Heat OFF path forces the zone off and reverts cleanly.

The supervised live test on 2026-10-24 (before this build was cut) answered Q3 (boiler follows zone) and confirmed the V2 RPC roundtrip completes within 15 s. The shipped code uses the same dispatch path and confirm timing, so the risk of the live field test failing is low.

SECTION: What has NOT been tested live yet
The revert worker has not been exercised against a real panel. The fixture tests confirm its logic; a real revert has not been observed. Also not tested live: V1 panels (only V2 was used in the supervised test). The V1 path (SHARED_SCOPE write to output2Override / output3Override) is the same write path as the existing control flow for V1 salus panels; only the attribute name is new.

SECTION: Rollout and release plan
James approved "Launch it" at the design live-test gate. The feature ships enabled for all boilerControl sites (V1 and V2). No per-site flags to toggle. BOILER_BOOST_REVERT_EXEMPT defaults to 'all' in config.js — no prod env-var required. After James gives go: cut v1.5.0, deploy, then run the live field test at one pub site to confirm end-to-end before calling it done.

DECISION: Live field test timing | After release (field test is James and IoT team's acceptance check post-deploy) | Before release (test gate must include a live revert observation)
DETAIL: SELECTED — After release. The automated suite covers 100% of the logic. The supervised live test on 2026-10-24 confirmed the V2 dispatch path and Q3 (boiler follows zone). A live revert observation would add confidence but requires waiting 30 min–2 h in the field. James accepted the after-release timing at the design live-test gate ("Launch it"). The live field acceptance (one boost + observed revert at a real site) is the first action after v1.5.0 deploys, not a precondition of this gate.

SECTION: Revert worker background cost and visibility posture
The revert worker is the existing OohOverrides watcher in overrides.js. It is NOT a standalone daemon or separate process — it runs inside the OOH server process as a lightweight in-process timer. Idle posture: no tokens consumed, no LLM calls, no external API traffic while idle. When a hold's revertAt time fires, it wakes, reads the hold document, and dispatches a single SHARED_SCOPE write (V1) or RPC call (V2), then sleeps again. The 5-minute retry cycle only activates when a revert has already failed — in the normal case (no active holds) nothing runs. The watcher is visible to on-call via the boost-hold-failed alert (commit 118e058) and the Zendesk ticket outcome notes. It consumes no meaningful machine resources or recurring cost at idle.
-->

# OOHDASH-141 Test gate: pub heating boost

**Date:** 2026-10-24 · **Phase:** test · **Branch:** build/oohdash-141 (merged → main)

## Automated test results

All 671 pre-existing unit tests pass. Seventy new tests added across six new files:

| File | Tests | What is covered |
|---|---|---|
| `test/boost-window.test.js` | 20 | Every §5 clamp row; fall-back 2026-10-25; spring-forward 2027-03-28 |
| `test/boiler-boost-registry.test.js` | 13 | Zone/duration allow-list; V1 zone map; boiler-panel absent from REQUESTED_KEYS |
| `test/boiler-tb-client.test.js` | 14 | Allow-list rejections; fixture roundtrips; WRITES_DISABLED blocks dispatch |
| `test/boiler-writes-disabled.test.js` | 4 | WRITES_DISABLED blocks dispatch; revertExempt=all still reverts |
| `test/boiler-boost-control.test.js` | 10 | Flags, warning/ack, CONFIRMED/NON-DELIVERY/IN-FLIGHT-TIMEOUT, ticket failure |
| `test/boiler-overrides.test.js` | 9 | §6 revert decision table; bounded retry; late-revert note; Salus/Tuya path unchanged |

Playwright e2e: **7 of 7 pass** — boost button display, duration picker, dispatch, outcome copy, warning acknowledgment, and Heat OFF path all verified against the fixture harness.

## Prior live test (2026-10-24, before this build)

The supervised live test answered Q3 (the boiler follows the zone: YES) and confirmed the V2 RPC roundtrip completes within 15 s. The shipped code uses the same dispatch path and confirm timing class as that test. One CI timing fix was added post-test (fixture ts advancement — no production code changed).

## What a live field test needs to confirm

Three things remain for a live observation at a real boilerControl site:

1. **Heat ON boost** — zone forced on, boiler follows, revert fires at the right time and sets the zone back to auto. Zendesk ticket updated with revert outcome.
2. **Heat OFF boost** — zone forced off, reverts cleanly after the hold expires.
3. **V1 panel** — only V2 was tested live on 2026-10-24. V1 uses `output2Override` / `output3Override` SHARED_SCOPE writes, same underlying write path as existing V1 salus control.

## Untested live paths

The revert worker has not been observed against a real panel. Fixture tests confirm logic; a live revert observation is the remaining gap. V1 panels have not been exercised in the live path.

## Rollout plan

James approved "Launch it" at the design live-test gate. Feature ships enabled for all boilerControl sites — no per-site flags. `BOILER_BOOST_REVERT_EXEMPT` defaults to `'all'` in `config.js`; no prod env-var needed.

After James gives the release go: cut v1.5.0, deploy, then run the live field acceptance at one pub site. The acceptance test must include: (1) a Heat ON boost on a V2 panel with an observed revert, and (2) a V1 panel boost or explicit confirmation that no V1 sites exist in the estate at release time. Only then is the ticket closed.

## Revert worker background posture

The revert worker runs inside the OOH server process as a lightweight in-process timer. It is NOT a separate daemon. Idle: no tokens, no LLM calls, no external traffic — only wakes when a held revert's `revertAt` timestamp fires. On a boost-free night it consumes nothing. The 5-minute retry loop only activates when a revert has already failed. On-call visibility: `boost-hold-failed` alert on Cosmos write failure; Zendesk ticket updated with each revert outcome. No meaningful machine resource or recurring cost at idle.

## Invariants

- No boost can start or be sent between 01:00 and 07:00 (server-enforced).
- Revert only ever sets the zone to 0 (auto). No schedule keys are ever written.
- Zendesk ticket is opened on every boost dispatch, regardless of revert outcome.
- Failed reverts are retried every 5 min for up to 12 h, with a note on each retry.
