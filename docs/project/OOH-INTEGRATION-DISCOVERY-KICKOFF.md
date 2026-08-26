# Discovery Kickoff — OOH Producer Conformance + Integration Go-Live

**Created:** 2026-07-14 (by the F026 IoT-dash Tester session) · **For:** the Discovery agent of a NEW build-harness cycle
**Project (this cycle runs here):** `Work/Zendesk Integration/ooh-triage-dashboard` (the OOH producer)
**Harness:** build · **Mode:** airedale · **First phase:** discovery

You are the **Discovery agent** opening a new build-harness cycle. Read and follow your profiles:
- `C:\Users\james\OneDrive - Airedale Catering Equipment\Projects\Work\Claude Agents\agents\discovery.md`
- `C:\Users\james\OneDrive - Airedale Catering Equipment\Projects\Work\Claude Agents\harnesses\build.md`
Also honour the harness checkpoint protocol (write the phase checkpoint BEFORE advancing; never hand-edit `harness-state.json`; verify artefact existence before declaring it). Invoke the Critical Thinker at the end of discovery per your profile.

---

## The objective (one sentence)
Produce a single, ordered shaping proposal + activity plan that takes the **OOH Triage Dashboard (producer)** into **exact conformance with the now-frozen IoT Support Dashboard contract**, and sequences the **safe, coordinated go-live** of both products working end-to-end — in a single production environment with **no staging**.

## The frozen consumer + contract (DO NOT change the IoT dash)
The IoT Support Dashboard side is **done and deployed (v1.49.1)**. It is the **frozen consumer** and the **source-of-truth contract**. This cycle changes the **producer + infra**, not the consumer. The contract is:
`…\iot-support-dashboard\2026-07-11T08-55-41\design-spec.md` **§1** (and §6 cross-product deps).

## Primary inputs to AMALGAMATE (do not re-derive — build on these)
All under `…\iot-support-dashboard\2026-07-11T08-55-41\` unless noted:
- `integration-assessment.md` — the Researcher's contract-conformance matrix, graceful-independence analysis, no-staging cutover strategy, E2E test matrix, and staged plan.
- `critical-thinker-review.md` + `critical-thinker-integration-review.md` — the two adversarial reviews (false-green fix, kill-switch default, the untested `[TRG]`-in-search assumption, recording-may-be-undeliverable, Cosmos key scope).
- `RELEASE-HANDOFF-AND-NEXT-CYCLE.md` **§E** — the staged plan (0/A/B/C/D) and the load-bearing principle.
- `design-spec.md` §1/§6 (contract + deps).
- Producer code (this repo): `RELEASE_NOTES.md`, `services/zendesk.js` (`createOutcomeTicket` ~line 96), `routes/api.js`, `config.js`, `services/killswitch.js`.
- `…\OOH Dashboard\PROJECT_STATUS.md` (producer status: v1.0.2, fixture-mode, unmerged, Spencer-gated).

## The conformance gaps to close (producer side)
From the reviews — the producer currently does NOT meet the frozen contract on:
1. **Action transcript** — `createOutcomeTicket` posts a one-line `[TRG] ${detail}`; the contract needs the FULL timestamped `HH:MM | step` trail (site→zone→live reads→flow→dispatched value→sync→SMS).
2. **Call-recording link** — none posted. Contract needs a `Call recording: <url>` internal comment (IF a recording URL exists — see must-verify #2).
3. **Deep-link host** — producer default `IOT_DASH_BASE_URL` ≠ the live dashboard host; set it to `zendesk-uat.airedale-api.co.uk` or the P1 SMS deep-link is dead.
4. **Requester identity** — currently the API service account; contract wants a stable named OOH requester.
5. (Confirmed already met: create-all-as-`new` — do NOT re-open this; the producer already creates `new`.)

## Three must-verify assumptions (these make "conform → auto-works" TRUE or FALSE)
1. **`[TRG]`-in-search-`description`:** the dashboard's whole oversight parse assumes the internal `[TRG]` comment is returned in the Zendesk search result `description`. Verify with one real ticket. (Highest leverage — if false, the consumer needs a change and the "frozen" promise breaks.)
2. **Recording source:** does OOH telephony actually produce a recording URL? If not, the recording feature is **undeliverable**, not deferred — the contract must say so.
3. **Cosmos access:** the dashboard's holds mirror needs a **shared Cosmos account + a key scoped to DB `ooh-dashboard`**, or the failed-revert safety strip stays silently empty.

## External critical-path dependencies (Spencer)
SR-3 scoped TB write credential (device writes), pipeline/hostname (producer deploy), shared Cosmos key (holds), SMS gateway (P1). These gate go-live (Stages B–D), not the design/build of the ticket contract. Sequence around them.

## What discovery must produce
1. A **shaping proposal** amalgamating the above into ONE ordered activity set (design → build → test → coordinated release), reconciled with the staged plan (0/A/B/C/D) and design-spec §9 sequencing.
2. A **component inventory + integration blueprint** for the producer changes + infra.
3. A clear **dependency map** (what's internal/buildable now vs Spencer-gated) and the **go/no-go gates** for James.
4. The **no-staging test strategy** made concrete (controlled production canary: kill-switch engaged, SMS=log, dedicated test site, cleanup) — this is the riskiest surface, so flag it for the Design Gate + Critical Thinker.
Then hand to the Design agent (produce this cycle's design-spec), the Design Gate, and onward (build → test → gate → release).

## Scope guardrails
- Change the **producer + infra + the contract's test strategy** only. The IoT Support Dashboard is frozen — flag it explicitly if you believe a consumer change is unavoidable (it should not be, if the contract holds).
- This cycle **is** harness-governed — the gates are the point. Follow the build harness + discovery protocol fully.

Begin by reading your profiles and the amalgamation inputs, then confirm the work folder for this cycle before producing the shaping proposal.
