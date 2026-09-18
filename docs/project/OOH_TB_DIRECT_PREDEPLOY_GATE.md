# OOH Dashboard — TB-Direct Pre-Deployment Gate (deploy + write-flip)

**Timestamp:** 2026-09-18 · **Stage:** pre-deployment (go/no-go #3) · **Owner:** James Brown
**Gate ask:** approve, in one act, **(a)** deploying the TB-direct read+control build to the live pod and **(b)** lifting `WRITES_DISABLED` so control actuates live trading-site devices — or request changes.

> **Full runbook:** `OOH_TB_DIRECT_GOLIVE_RUNBOOK.md` (exact build/deploy/flip/rollback commands, preflight, residual risks). **Interactive review:** [`mockups/OOH_TB_DIRECT_golive_review.html`](mockups/OOH_TB_DIRECT_golive_review.html) — the go/no-go board (what ships, proven vs assumed vs held, the staged rollout, and the abort) embedded on this PR. Design: `OOH_TB_DIRECT_READ_CONTROL_DESIGN.md`.

---

## This is the most consequential act in the programme
It changes production twice: the operator view (1-of-23 heating → full estate by category) and, critically, it makes control **actually actuate real devices at real pubs**. It is deliberately raised as a human gate, not taken autonomously. This is exactly the manifest's anticipated go/no-go #3 (`k8s/deployment.yaml` — the single `WRITES_DISABLED=false` enable diff).

## What ships
- **Read cutover:** the full site estate by category, direct from ThingsBoard.
- **Control v1:** Tuya on/off (kitchen, lighting, fans, over-door heaters) + setpoint (Salus + Intesis). **Held:** Intesis on/off, Salus IT500 hot-water boost, multi-gang, boiler — these render as monitor + escalate.

## What's proven (high confidence)
- `main` unit suite green (161 tests).
- Bench control smoke through our ACTUAL code, live over HTTP: Tuya write→confirm reached `synced` with a fresh echo; the `/values/timeseries` confirm-read (a latent bug we fixed) works live; edge-aware no-op and the registration probe work.
- Read plane proven live in validation (site 6261 = 23 devices; multi-site).
- Handler roles provisioned; kill-switch (global + per-site, instant, no deploy) available.

## What's assumed, not yet observed (accept explicitly)
- **A live setpoint round-trip through our confirm loop** has not been observed against a live-echoing thermostat (the dev-bench Intesis was dormant; the bench IT700 slow-echoes). The write path and the confirm-read are proven; Spencer's contract asserts the round-trip. Mitigation: the fresh-echo guard fails safe (honest timeout, never a fake success); watch the first live setpoint on the canary.
- **Least-privilege read role not yet bound.** Both TB accounts are still TENANT_ADMIN, so a leaked *read* credential could write directly to TB (outside the app). Not a functional blocker — the app path is guarded by `WRITES_DISABLED` + kill-switch — but the credential is over-privileged until Spencer binds `Airedale Read Only`. Can land independently.

## Recommended rollout (inside this one approval)
1. Deploy in quiet hours (replicas:1 → a redeploy re-SSOs logged-in users); writes still locked.
2. Verify the read cutover: full estate renders across categories, no heating-path regression, `/healthz` healthy with `writesDisabled:true`.
3. Arm safety: engage per-site kill-switches for all but one **canary site** so the first live write is contained.
4. Flip: `WRITES_DISABLED=false`; `/healthz` shows `writesDisabled:false`.
5. Canary live write: one Tuya switch off→on on the canary → confirm `synced` + audit + revert; watch a real setpoint round-trip. If clean, release the other sites; if not, abort.

## Abort / rollback (fastest first)
- **Kill-switch** — instant, no deploy, blocks all/any writes; reads continue.
- **Re-lock:** set `WRITES_DISABLED=true` and roll out (absence/typo also disables — fail-closed).
- **Roll back the code:** `rollout undo` (reverts the read cutover too).

## Out of scope
SMS go-live (`SMS_PROVIDER=log` stays — go/no-go #4); the held control surfaces; the least-privilege role binding.

## On approval
- **Accept** → I execute the runbook: deploy read-only → verify → arm kill-switches → write-flip → canary live write, reporting at each step, ready to abort on your word.
- **Amend** → e.g. split it (deploy read-only now, write-flip later), require the read-role bound first, or start Tuya-only with setpoint held until a prod round-trip is observed.
- Provenance: hand-authored gate; no doer produced it. Approving here authorises the live deploy **and** the write-flip.
