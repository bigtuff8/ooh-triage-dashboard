<!--
gate:contract
TICKET: OOHDASH-153
PHASE: build
SECTION: What was built
The old Approach A text-message code has been removed, as the approved design said (PR #170). The P1 outcome no longer runs the Twilio log-mode path and no longer writes the "P1 SMS NOT SENT, phone the manager now" note to the Zendesk ticket. Instead it records a positive entry in the P1 log: "P1 ticket raised with ooh_p1 tag; OOH side complete; IoT Support Dashboard will page the on-duty manager." The ooh_p1 tag that triggers the real page is unchanged.
SECTION: What operators will see
All seven P1 scripts now open with "I've raised an urgent P1 ticket for this site and someone will call you back shortly." Each keeps its safety advice, as you chose at the design gate. The Admin card is renamed "P1 escalation log". It no longer shows a false "send failed" tag, and "Mark acknowledged" works as before.
SECTION: Proof
Unit tests: 845 pass, 0 fail. The orchestrator ran them separately on the build commit and got the same result. Playwright end-to-end tests: 202 pass, 0 fail, 2 skipped. A source guard test checks that the old SMS module, the dispatch note and the "a text has gone" wording cannot come back. No changes to the kubernetes manifest, environment, secrets or devices.
DECISION: Approve build and merge to main? | Approve - merge build | Block - needs changes
-->

# OOHDASH-153 Build: clean up P1 SMS scaffolding

**Date:** 2026-10-27 · **Phase:** build · **Release:** R1 · **Design:** PR #170 (merged, 8763332) · **Build commit:** dcd1527 on `build/oohdash153`

## 1. As built vs design

The build matches the approved design (`gate-artefacts/oohdash153-design.md`) with no deviations. The script decision taken at the design gate was "swap only the false claim and keep the safety advice", and that is what was built.

| File | Change |
|---|---|
| `services/escalation.js` | Deleted (Twilio and log-mode path, origin guard) |
| `services/p1-log.js` | New: `recordP1Raised` (positive entry, fail-safe, `p1-log-write-failed` alert), `p1Log`, `acknowledgeP1`, `buildEscalationLink` |
| `routes/api.js` | Import swapped. P1 block now calls `recordP1Raised`. `addP1DispatchNote` call and its try/catch removed. Response `p1` is now `{ raisedAt, link }`. Admin routes use the new module (paths unchanged) |
| `services/zendesk.js` | `addP1DispatchNote` deleted |
| `public/js/flows.js` | Seven scripts: false text claim replaced with the D2 sentence, safety advice kept |
| `public/js/views.js` | Admin card: "P1 escalation log", static row text, "No P1 escalations raised yet." |
| `config.js`, `.env.example` | `sms` block and P1 SMS env lines removed (`iotDashBaseUrl` kept) |
| `services/metrics.js`, `services/store.js` | Comments only |
| `test/p1-dispatch-honesty.test.js` | Deleted. Its two transcript tests moved to `test/p1-log.test.js` |
| `test/p1-log.test.js` | New: unit tests for the new module plus source guards |
| `test/degraded-banner.test.js` | Removed the stub for the deleted function |
| `tests/removal-health.spec.js` | E2E updated for the renamed Admin card |

## 2. Scripts as shipped

| Flow | Script |
|---|---|
| Heating, vulnerable occupant (x2) | I've raised an urgent P1 ticket for this site and someone will call you back shortly. In the meantime the on-site override switch, if you have one, is safe to use. |
| Outside lighting | I've raised an urgent P1 ticket for this site and someone will call you back shortly. If the dark frontage is a safety concern right now, your site's duty-manager procedure for calling out an electrician still applies, … |
| Fridge stock at risk | I've raised an urgent P1 ticket for this site and someone will call you back shortly. The fridge itself isn't controlled by Lighthouse, so alongside our callback you should follow your normal appliance repair route. |
| Contractor on site (x2) | I've raised an urgent P1 ticket for this site and someone will call you back shortly. Please ask the engineer to hold on. |
| Something else, P1 | I've raised an urgent P1 ticket for this site and someone will call you back shortly. |

## 3. Verification

- `npm run test:unit`: 846 tests, 845 pass, 0 fail, 1 skipped. The build agent ran it, and the orchestrator re-ran it independently on dcd1527.
- `npx playwright test`: 202 pass, 0 fail, 2 skipped (build agent run). CI will re-run both required checks on this PR.
- A residual grep found zero hits in `routes/`, `services/`, `public/` and `config.js` for any of these:
  - the `escalation.js` import
  - `addP1DispatchNote`
  - `config.sms`
  - "a text has gone"
  - "sent an urgent text"
- The Approach B join contract is untouched: the `ooh_p1` tag, urgent priority, `[OOH]` subject and Support Request category.

## 4. Not in this build (as designed)

- `SMS_PROVIDER` in `k8s/deployment.yaml` and the `release.sh` grep: these are now inert, and are queued for the next manifest change.
- Naming cleanup ticket (`OohSmsLog`, `dispatchedAt`, `/api/admin/sms-log`).
- Possible `TWILIO_*` values in the platform secret: removal and revocation need James's go to contact Spencer.

## 5. Next

After approval and merge, the next step is the test gate, then a patch release, v1.6.3.
