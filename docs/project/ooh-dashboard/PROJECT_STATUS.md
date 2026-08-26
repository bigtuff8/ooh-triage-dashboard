# OOH Dashboard

**Status:** BLOCKED on Spencer — conformance cycle COMPLETE, **v1.1.0** pushed to `feature/live-build-v1` (test PASS, 1 rework cycle). Spencer ask (deploy blocker + control-path appendix) SENT 2026-07-14. Waiting on Spencer's feasibility/timing for the canary infra before anything else can move.
**Last Active:** 2026-07-14
**Quick Context:** Self-service UI for out-of-hours call handlers to triage and resolve IoT site issues without escalating to the IoT team.

## Current State

- **v0.3.0 prototype** — fully interactive IoT OOH Triage with live IoT platform data
- **Standalone project** — `ooh-triage-dashboard/`. GitHub: `bigtuff8/ooh-triage-dashboard`
- **15 triage flows** in chat-based v4 UI: Kitchen Equipment, Too Cold, No Hot Water, Keeps Turning Off, Ovens & Grills, Heating Stuck, Controls Issue, Fridge/Freezer, External Lighting, External Heating (NEW), Won't Turn On, Something Else, It's Freezing, Gateway Offline, Direct Escalation
- **Live data connected**: ThingsBoard (235 GK sites indexed by house ID), Tuya (HMAC auth), Salus (Cognito SRP). All READ-ONLY.
- **All control actions simulated** — zero POST/PUT calls in frontend. PROTOTYPE_SAFETY.md documents enforcement.
- **Three-agent test coverage**: flow walkthrough (109 paths, 0 dead ends), interpretation audit (0 remaining HIGH violations), UX review (all HIGH/MED fixed)
- **Data sidebar** in triage view — call context, live zone data, TB device inventory grouped by L1 category
- **Landing page**: top 3 volume-driven cards + alphabetised two-column layout + live site device panel
- **Escalation flow redesigned**: holding script → CTA → modal → explicit submit/close differentiation
- **System determines outcomes** — no agent interpretation or judgement required in any flow
- **Code on feature branch**: `feature/flow-amendments-v2` (not yet merged to master)

### What still exists from earlier phases
- **Capability Analysis** complete — 10 capabilities, 91 incidents
- **Interactive Mockup** (v5) — in this folder
- **Data Dictionary** — mapped to Zendesk field IDs
- **Investigation Checklist** — 29 items across 5 sections
- **Questions sent to Sam Day** — awaiting responses

## Key Design Decisions Made

- All escalations route to IoT Support — OOH agent never decides routing
- GK Repairs (0345 603 4566) is advisory referral only — agent advises caller, ticket still goes to IoT
- No hard "no" from OOH agents — soft pushback OK, but always action the request if customer insists
- Pub/accommodation branch in heating and hot water flows
- Structured handoff with T1 checks, findings, diagnostic references, ruled-out items
- Callbacks = P1 alarm tickets in existing queue
- Triage notes = new activity code TRG in Zendesk comments
- Override reasons captured in posted comment for audit trail

## Next Steps (go-live sequence — currently waiting on Spencer)

**BLOCKED pending Spencer's reply** to the 2026-07-14 ask (`2026-07-14T10-30-11/SPENCER_ASK_EMAIL.md`). Nothing on our side moves until Section A lands.

1. **Spencer — Section A (deploy blocker):** deploy pipeline + K8s Secret (SR-2), hostname/ingress + `APP_ORIGIN` (N-4), B2C OIDC + OOH handler role + handler accounts (SR-1), Cosmos key scoped to DB `ooh-dashboard` (N-3), bridge read-API access (N-1), scoped TB write cred to boot (SR-3), `SESSION_SECRET`, `IOT_DASH_BASE_URL`. The app is fail-secure and needs all of these to boot in live mode even for the locked canary.
2. **On receipt →** deploy the **controlled canary** (`WRITES_DISABLED=true`, `SMS_PROVIDER=log`), run the T0–T7 matrix incl. the live full-length [TRG] truncation test (T4) and first live reconciliation/merge. **James go/no-go #2.**
3. **Phase D cutover:** open device writes after SR-3 bench proof + D4a assurance (go/no-go #3); switch SMS to the real gateway after Q-F (go/no-go #4).
4. **Spencer — control-path roadmap (Appendix):** commit/timing for #1 boiler-panel (feasible now, SD-491/SD-559), then kitchen/PowerPause + lighting + fans (SD-515), then schedules (SD-477).
5. **Carry-forward go-live conditions:** IM-02 P1-claim ack feedback path (metric 2 not live-measurable until built), IM-04 layer-1 `/healthz` uptime, AD-07 populate `OOH_OPERATOR_AGENT_MAP`, IM-05 residual optimisation; + the 7 SteerCo conditions.

## How to Resume

1. Read this file
2. The code is at: `../ooh-triage-dashboard/` (separate git repo)
3. Run: `cd ../ooh-triage-dashboard && npm start` to test locally
4. Key design files in this folder:
   - `OOH_PROPOSED_FLOW_CHANGES.md` — the design that was implemented
   - `OOH_CAPABILITY_ANALYSIS.md` — source analysis
   - `OOH_DASHBOARD_DESIGN.md` — full design document
   - `OOH_DATA_DICTIONARY.html` — annotated data dictionary
   - `feature-list.json` — harness feature list (14 features)
   - `progress.txt` — harness session log

## Session Log

| Date | Summary |
|------|---------|
| 2026-07-14 | **Conformance cycle complete + released — v1.1.0** (harness `../2026-07-14T10-30-11/`). Brought the producer into exact conformance with the FROZEN IoT Support dashboard contract (consumer v1.49.1, no consumer file touched): F001 anchors-first [TRG] transcript, F002 Ticket Category, F003 Zendesk Talk call-ticket reconciliation/merge, F004 deep-link host, F005 deploy-time write lock, F010 liveness, F011 metrics. Test found the fixture suite passed but a **Critical-Thinker review at the release gate caught CR-01** (F003 auto-merge unreachable in the default *live* config — masked by fixture-only tests). **Rework cycle 1** fixed it (answered-by via users lookup, window 5→45min, recording note, agent-name cache) + AD-04; CT re-review CLOSED all findings. Tests: 92/92 (Playwright 41, dev-selfverify 25, tester-verify 16, verify-rework-cr01 10). v1.1.0 pushed to `feature/live-build-v1` (6498294, unmerged/undeployed). **Spencer ask (deploy blocker Section A + control-path appendix) SENT 2026-07-14 — now blocked awaiting his reply.** Device writes + live SMS remain LOCKED. |
| 2026-07-11 | **Live build complete** (harness cycle `../2026-07-10T22-01-41/`): full rebuild to the approved design on `feature/live-build-v1` v1.0.2 — B2C-ready auth, single SD-492 write path with server guardrails + confirm gate, honest sync tracking, durable restart-proven timed overrides, kill-switch, ooh-tagged tickets with operator identity, P1 SMS (log provider), metrics/alerts/runbook, Docker+K8s. Test PASS (1 rework cycle; 41 Playwright tests 0 fail; quality 8.4 weighted). Companion IoT Support dashboard v1.49.0 (OOH Review queue + deep-link) built + tested on unpushed branch. Remaining: push approvals, Spencer asks (`SPENCER_ASK_EMAIL.md`), SR-3 bench proof, D4a live gate. Docs: `RELEASE_NOTES.md` (app repo), `DEPLOYMENT_REQUEST.md` (work folder). |
| 2026-03-18 | Initial findings from chat analysis (initial-findings.md) |
| 2026-03-21 | Deep capability analysis (10 capabilities, 91 incidents). Design document. Mockup v1-v3. |
| 2026-03-22 | Mockup v4-v5 (interactive triage, intake form, override reasons, site lookup/detail). Data dictionary with James's annotations. Investigation checklist. Questions compiled and sent to Sam Day. Folder moved from archive/ to project root. |
| 2026-03-24 | **Prototype implementation** in iot-support-dashboard. Phases 0-5: 5 backend service proxies (ThingsBoard, Tuya, Salus w/ Cognito SRP, Intesis, Pocket Changes), OOH view mode in dashboard, triage engine with JSON state machine, 8 flow definitions, chat-based UI, data cards, pocket change auto-revert with retry + P1 ticket on failure, deployment.yaml updated with secret placeholders. Server boots cleanly — all services degrade gracefully without credentials. |
| 2026-03-26 | **Standalone project created** (`bigtuff8/ooh-triage-dashboard`). Ported from iot-support-dashboard ooh-triage-prototype branch. Implemented all 12 flow amendments from OOH_PROPOSED_FLOW_CHANGES.md (v0.2.0). 14 flows total. New state types: input, referral. Structured handoff in triage summaries. Harness initialisation + developer phase complete. Infrastructure review: Spencer's credentials cover all 5 IoT services needed (ThingsBoard, Tuya, Salus, Intesis, Mobile Manager). |
| 2026-07-04 | **Discovery re-opened** (harness work folder `2026-07-04T08-38-53`). Spencer delivered device control (SD-492, prod): setpoint (Salus+Intesis), mode (Intesis), HW boost (IT500). Refreshed chat corpus (WhatsApp ×2, Teams human OOH chat). Produced discovery shaping proposal + research log. Key gaps found: persistence (setpoint reverts at next slot; SD-477 backlog) and uncovered device classes (lighting/fans/PowerPause ~27% volume). CT + SteerCo review in progress; then discovery gate → Build harness Phase 0 (control-path spike). |
| 2026-03-27 | **v0.3.0 — Major prototype build.** Rewrote frontend to v4 chat-based UI. Connected live data from ThingsBoard (235 sites indexed by house ID), Tuya (HMAC), Salus (Cognito SRP) — all read-only. 15 flows with all v2 amendments. Three-agent test coverage (flow walkthrough, UX review, interpretation audit). Removed all agent interpretation/judgement language. Redesigned escalation flow (holding script → CTA → modal → confirmation). Added: data sidebar, live/demo badges, async loading with timeouts, back button, binary action validation, expanded equipment types, external heating flow, prototype safety framework. Credentials sourced from Spencer's Bitbucket repo (api-tech-hub/apitechhub). |
