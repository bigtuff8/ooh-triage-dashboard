# OOH Triage Dashboard — status snapshot (2026-08-13)

Quick context so we don't re-derive everything when Spencer replies. Full detail lives in root `PROJECT_STATUS.md`, `handover/`, and Jira SD-586.

## Where the project is
- **App: DONE.** Built, tested, released **v1.2.0** (63/63 tests pass; independent pre-deploy review clean). Pushed to GitHub (`bigtuff8/ooh-triage-dashboard`, branch `feature/go-live-sd586`) but **not merged / not deployed**.
- **Platform: LIVE.** Spencer's prod platform stood up; SD-586 (his ticket) is **closed Done**. Placeholder live at https://ooh.airedale-group.io.
- **Deploy model:** self-serve — James does `az acr build` → `kubectl set image` once Spencer's two asks are confirmed.

## The two things blocking go-live (Spencer's court)
From James's Mon 10 Aug 19:18 email (subject *"RE: can you grant… IOT OOH Dash – last couple of steps hopefully"*):
1. **Load Jonathan Wilkinson's Zendesk token** into the `ooh-dashboard-secrets` k8s secret (`ZENDESK_API_TOKEN` is the only placeholder key left; secret otherwise rebuilt at 18/21 real values by Spencer).
2. **Narrow `id-iot-support-frontend-uat`'s Cosmos Data Reader to `OohOverrides` only.**

Gating line: *"I'll flip the image once you confirm Jonathan's token is loaded and the SD-330 grant is narrowed."*

**Status: no reply on that thread as of 13 Aug. James chased Spencer 13 Aug.**

## Open item on JAMES's court (separate thread)
Spencer replied Tue 11 Aug 12:41 on **"RE: Netservice Service Bus – not publishing"** (different problem, same project):
- He fixed the NetService feed (was hitting a stored proc prod bypasses — 0 events for a month; now ~2,900 emits flowing).
- **He asked James for the dashboard listener's error logs** — it's dead-lettering every message (`MaxDeliveryCountExceeded`, 31 in DLQ). Send whatever `ProcessErrorAsync` / handler catch logged.

## Next actions when Spencer responds
- **If he confirms token load + SD-330 narrowing** → James saves kubeconfig, runs the **write-locked canary** (`WRITES_DISABLED=true`, `SMS=log`; step 4a real-Cosmos-write is the hard gate) = go/no-go, then merge to `main`.
- **DLQ question** → send `ProcessErrorAsync` logs (blocked on James, not Spencer).
- Only remaining dev item off critical path: **IM-01** `/healthz` runtime-staleness fix.

## Cast
- **Spencer Thompson** — Group Head of Business Technology; owns Azure sub / AKS / Key Vault; deployment authority. `Spencer.Thompson@airedale-group.co.uk`.
- **James Brown** — app owner / deployer (`bigtuff8`).
- **Jonathan Wilkinson** — his Zendesk creds reused for OOH ticketing this release (no dedicated service account yet).
