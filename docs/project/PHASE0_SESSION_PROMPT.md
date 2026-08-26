# Phase 0 session prompt (paste into a new session)

You are picking up the OOH Triage Dashboard project to complete **Phase 0 — Deploy & Smoke** (the items in OOHDASH Sprint 1). Work as an orchestrator: delegate investigation/execution legwork to sub-agents and show me only your summaries and decisions.

**Read this handover first — it is the authoritative brief and is self-contained:**
`C:\Users\james\OneDrive - Airedale Catering Equipment\Projects\Work\IOT OOH Dash\PHASE0_HANDOVER.md`

Supporting docs in the same folder: `OOH_CATCHUP_AND_BACKLOG_2026-08-14.md` (full context), `DEPLOY_RUNBOOK.md` (deploy detail), `TEST_STRATEGY_live-integrations.md` (safe-testing).

**Objective:** get v1.2.0 deployed to the live platform write-locked, prove it end-to-end, and merge to `main`. The Phase 0 tickets are OOHDASH-2 through OOHDASH-7.

**Do this, in order:**
1. **OOHDASH-2 (now, yours):** switch the Zendesk client to `Authorization: Bearer` in `services/zendesk.js` `authHeader()`, add a `test/zendesk.test.js` unit test on the header, run `npm run test:unit`. Heed the credential-type reconciliation in the handover (Bearer needs the `scapi_` OAuth-style token; the runbook's "Basic/API token" wording is superseded). Commit on `feature/go-live-sd586`.
2. **OOHDASH-3 (Spencer) & OOHDASH-4 (Jonathan), in parallel:** draft the chase messages (confirm B1/B3/B4 infra prereqs; confirm the `scapi_` token is complete/active), run them past me before sending. These gate the deploy.
3. **OOHDASH-5 (after -3 confirms):** `az acr build` → `kubectl set image` via `~/.kube/ooh.yaml`, namespace `iot-services`, **quiet hours only** (single replica → live re-SSO).
4. **OOHDASH-6:** run the smoke checklist — **do not skip step 4a (the real Cosmos write)**.
5. **OOHDASH-7:** merge to `main` once smoke passes.

**Guardrails (hard):** Phase 0 is deploy + smoke ONLY. Keep `WRITES_DISABLED=true` and `SMS_PROVIDER=log` — no live device control, no live SMS (sites are open/trading in a heatwave; live control is a supervised Stage 2 later). Don't touch SD-330. Don't `az aks get-credentials` (use the scoped kubeconfig). Don't deploy outside quiet hours without flagging it.

**Keep Jira aligned:** OOHDASH (cloudId `980108f4-3398-44f5-8fde-336ffe4fa810`). Transition each ticket To Do → In Progress → Done with a short evidence comment as you go; keep -3/-4 blocked until confirmed.

**Also:** capture the OOH deploy plumbing into a new CIR doc `OOH_DASHBOARD_DEPLOY.md` once confirmed (it's currently a gap).

Start by reading the handover, then give me a short plan and the draft chase messages for Spencer and Jonathan before sending anything externally. Check in with me before the actual deploy step.
