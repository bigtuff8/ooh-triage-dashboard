# Release Notes — OOH Dashboard

## v1.0.0 → v1.0.2 — Live build (harness cycle 2026-07-10T22-01-41)

**Date:** 2026-07-11 · **Mode:** Airedale · **Design gate approved:** 2026-07-10 · **Test phase:** PASS (1 rework cycle)

### What's New

The read-only prototype is now a full authenticated product for out-of-hours call handlers:

- **Guided call handling (F012):** confirmed-site workspace with live device board, smart issue entry (type the caller's words, the system suggests the right flow), 8 category tiles, system-triggered connection check, multi-issue calls, and a "Tonight" shift view.
- **Real device control (F002/F005/F006/F007):** heating setpoint up/down, Salus frost-hold "off" and Intesis native Off, hot-water boost (0–9h) — all through the single SD-492 ThingsBoard shared-attribute write path. The prototype's direct vendor routes are deleted.
- **Truth-first sync tracking (F008):** "Applied" is shown only when the device echoes the change back; pending/failed/rejected/timeout are first-class states, with IT700 slow-echo handling and a late-sync watch that updates the ticket.
- **Safety rails:** blocking site-confirmation gate with server-enforced confirm tokens (F004); server-side capability + value guardrails, mirrored in the UI steppers (F009); durable timed overrides that survive restarts and revert exactly once (F010); runtime global/per-site write kill-switch with mandatory reason (F016).
- **Everything on a ticket (F011/F013/F015/F017):** every outcome writes an `ooh`-tagged Zendesk ticket carrying the real operator identity; callback lookup translates ticket status to caller-friendly scripts (with chargeable-visit warning); notes ride existing internal comments; uncovered classes capture-and-escalate with honest messaging.
- **P1 escalation (F014):** system-decided P1s dispatch an SMS (pluggable provider; log provider until the gateway decision) with a deep-link straight to the ticket in the IoT Support dashboard, with acknowledgement tracking for the SLA metric.
- **Auth (F001):** B2C OIDC (config-driven, PKCE), fail-secure production startup, server-side role enforcement (handler vs IoT admin), dev identities gated non-production.
- **Ops (F018/F021/F022):** multi-stage Dockerfile + K8s manifests (iot-services, limits, probes), `/healthz` with subsystems + active alerts, alert conditions (write-failure streak, revert failure, SMS failure), service metrics (self-serve rate, control success rate, P1 SLA, capture volume by class), operator runbook.

Companion release: **IoT Support dashboard v1.49.0** (branch `feature/f026-ooh-review-queue`) adds the OOH Review queue (Needs review / P1 log / Captured / All activity, bulk mark-as-reviewed, read-only holds mirror with failed-revert highlight) and the `?ticket=` deep-link landing.

### Fixed during test rework (v1.0.1)
- Smart-entry suggestion chips broke on apostrophes in the caller's words ("won't", "it's") — caller text no longer passes through inline handler source; regression test added.
- Unknown `/api/*` paths now return 404 JSON, never the SPA shell.
- Tonight audit rows show friendly hold-revert times; hold picker shows the explicit revert value; favicon added.

### v1.0.2 (advisories)
- `captureClass` → `OohCaptureClass` (data-dictionary Ooh-prefix rule; done pre-live, no migration).
- Fixture ticket-store id-reset quirk documented; F003 credential doc aligned with the deferral convention.

### Known deferrals (externally gated)
- **F003** SR-3 scoped TB write credential + bench proof (Spencer) — hard gate before any live device write.
- **F014 live SMS** — gateway decision (Q-F) + on-duty number; config-only switch.
- **F018 pipeline** — Spencer repo/pipeline/secrets/hostname (see `DEPLOYMENT_REQUEST.md`).
- **F023** — live-site control assurance gate (D4a), after deployment + credential.
- **F025 send** — Spencer ask email ready, needs sending.
- **F026 deploy** — dashboard branch push = UAT deploy (James's approval), then mobile deep-link verification.

### Technical Notes
- Suite: 41 Playwright tests, 0 failures — real server in fixture mode, all 6 mandatory protocols.
- Quality scores (Airedale): UX 9 · Brand 9 · Craft 7.5 · Functionality 7 · Originality 8 → 8.4 weighted.
- Backlog: styled Popconfirm to replace native prompt/confirm; dynamic hold label after midnight; session store for multi-replica.
