# OOH TB-Direct — State & Handover (resume-anywhere)

**Timestamp:** 2026-09-18 · **Owner:** James Brown · **Status:** read cutover LIVE on prod; write-flip HELD at James's checkpoint.
**Purpose:** lock the whole TB-direct effort into one clear record so any follow-up session resumes exactly here. Read this first, then the linked artefacts.

---

## 1. One-paragraph summary
The OOH dashboard has been re-engineered to read **and** control devices **directly from ThingsBoard**, replacing the integration-bridge's `/api/devices` read (which only ever surfaced 1 of a site's ~23 devices). It went through four governed gates — validation, decisions, design, pre-deployment — **all approved and merged**. The new build is on `main` (161 unit tests green) and the **read cutover is deployed live** (image `dce9ea0`), showing the full site estate by category. **Writes are still locked** (`WRITES_DISABLED=true`); the write-flip is deliberately held at James's checkpoint. Control v1 = Tuya switch + setpoint; Intesis on/off, IT500 hot-water boost, multi-gang and boiler are held.

## 2. Where we are RIGHT NOW (the live checkpoint)
- **Deployed:** prod pod runs `apitechhub.azurecr.io/ooh-dashboard:dce9ea0` (from `main` HEAD `dce9ea0`), 0 restarts, resources 512Mi preserved.
- **`/healthz`:** `dataMode:live`, **`writesDisabled:true`** (control inert — correct), **`thingsboardRead:healthy`** (TB-direct read working), zendesk + Cosmos healthy.
- **Known cosmetic:** `/healthz` overall shows `degraded` because the boolean bridge read-latch (`bridge.healthy`) is cold until the first operator site-search. **Proven pre-existing** (identical in `git show af594dd~1:services/bridge.js` — no self-warm; `getSites()` has no callers; only `getSitesByNumber` warms it). NOT a regression; clears on first site open. If a follow-up wants to remove it: warm the latch on boot or drive the degraded predicate off `thingsboardRead` instead of the cold latch.
- **Rollback target:** prior image `07dfb99` (`kubectl -n iot-services rollout undo deployment/ooh-dashboard`).

## 3. THE NEXT ACTION (what a resume session does first)
The only thing between here and live control is the **write-flip**, which James holds. When he gives the go:
1. (Optional, recommended) confirm the read cutover visually — open a site in the live dashboard, confirm the full estate renders (kitchen/lighting/fans/metering), which also clears the degraded banner. Requires a handler B2C login (can't be done headlessly).
2. Flip: `export KUBECONFIG=~/.kube/ooh.yaml && kubectl -n iot-services set env deployment/ooh-dashboard WRITES_DISABLED=false && kubectl -n iot-services rollout status deployment/ooh-dashboard` → `/healthz` shows `writesDisabled:false`. This is the manifest's **go/no-go #3**, the single enable diff (`k8s/deployment.yaml:69`).
3. Canary: one **low-impact** circuit (e.g. external lighting) on a chosen site, off→on via the dashboard → confirm `switchSyncStatus=synced` + audit + revert; watch a real setpoint round-trip (the one path not yet observed through our code — §6). Global kill-switch armed as the instant abort. (Note: "arm per-site kill-switches for all-but-canary" is impractical at 373 sites — use the global kill-switch as the abort instead.)

Full mechanics: `OOH_TB_DIRECT_GOLIVE_RUNBOOK.md`.

## 4. The journey (gates — all merged to main)
- **Validation** (adversarial re-proof of C1–C8): `OOH_TB_DIRECT_VALIDATION_REPORT.md`.
- **Decisions gate — PR #25** (D1–D10): `OOH_TB_DIRECT_DESIGN_DECISIONS.md`. Later amended with Spencer's control spec.
- **Spencer's control contract:** `OOH_TB_DIRECT_CONTROL_SPEC_2026-09-17.md` + impact `OOH_TB_DIRECT_CONTROL_SPEC_IMPACT_2026-09-17.md` + corrected matrix `mockups/OOH_ASSET_CONTROL_MATRIX_corrected.html`.
- **Design gate — PR #26**: `OOH_TB_DIRECT_READ_CONTROL_DESIGN.md` (+ `OOH_TB_DIRECT_DESIGN_GATE.md`, mockup).
- **Build:** PR #27 (read plane) + PR #28 (control plane) — non-gate, merged by the orchestrator.
- **Pre-deployment gate — PR #29**: `OOH_TB_DIRECT_PREDEPLOY_GATE.md` + `OOH_TB_DIRECT_GOLIVE_RUNBOOK.md` + go/no-go mockup.

## 5. What's on main (the build)
- **Read:** `services/tb-device.js` (full estate direct from TB; `bridge.js` is now a re-export shim). `deviceId` = TB device NAME (corrective — was the bridge vendor id, which broke the name-keyed control path). Site query = over-fetch + anchored regex `^{brand}-{site}(?![0-9])` + `data/site-aliases.json`. `classifyDevice()` capability-based, typo-tolerant, covers the undocumented profiles. Pub-name search via `zendesk.siteDirectory()`. Boolean `bridgeStatus()` latch preserved.
- **Control:** `services/confirm.js` (shared edge/settle logic). `readControlState` reads `/values/timeseries` (fixed a latent bug — it read `/values/attributes`). Edge-aware dispatch (`already-satisfied`/`duplicate-pending`/dispatch) + fresh-echo settle (`syncTs > dispatchTs`). Registration gate (`hasPublishedState`). `switchDesired` + wired kitchen/lighting/fan flows. Mode vocabulary lowercased (a capitalised `'Off'` could switch an Intesis AC ON); Intesis `mode` command dropped (on/off held). Intesis range 16→32. `WRITES_DISABLED` throws 423 in `writeSharedAttribute`. Edge-safe revert.
- **Tests:** 161 unit (`npm run test:unit`). `bridge.test.js`→`tb-device.test.js` + `tb-classify.test.js` + `control-plane.test.js`; `site-identity`/`hotwater-scope`/`control-single-use`/`late-sync-alert` migrated.

## 6. Proven vs assumed (be honest with the next session)
- **Proven live (bench smoke, real HTTP through our code):** Tuya `switchDesired`→`synced` (fresh echo); the `/values/timeseries` confirm-read; edge-aware no-op; the registration probe. Read plane proven live (validation).
- **Assumed, not yet observed:** a full **setpoint** round-trip through our confirm loop on a live-echoing thermostat (the dev-bench Intesis was dormant; the guard failed safe with an honest timeout). Watch on the canary.
- **Security caveat:** the least-privilege read role is not yet bound — both TB accounts are TENANT_ADMIN, so a leaked read cred could write outside the app. App path guarded by `WRITES_DISABLED` + kill-switch. Bind `Airedale Read Only` (Spencer) to close.

## 7. Open items (carry forward)
- **O-1** Salus IT500 combi: bridge emits one `salus-it500` + `hotWater`, registry models a separate `salus-it500-dhw` — needs Spencer confirm + product call. hwBoost held.
- **O-2** Intesis on/off can't ship until `modeSyncStatus` is proven on a mode-capable unit + confirm copy softened. Held.
- **O-3** Intesis setpoint cap: APP_POLICY 25 °C clips the 16–32 cooling range — keep conservative or add a per-device cap.
- **O-4** Clear-then-set for a stuck `duplicate-pending` is deliberately out of v1.
- **O-5 / D5** Verify `Airedale Read Only` can read timeseries + shared attrs + key lists and cannot write; confirm its Key Vault mapping. (Spencer.)
- Read-side: verify the bulk telemetry query at build (per-device fallback shipped); alias-map coverage (seed from the 50 collision pairs).
- **SMS go-live (go/no-go #4)** — `SMS_PROVIDER=log` stays; out of scope here.

## 8. Deploy facts (from CIR `OOH_DASHBOARD_DEPLOY.md`)
- `export KUBECONFIG=~/.kube/ooh.yaml`; ns `iot-services`; deployment `ooh-dashboard`; live at `https://ooh.airedale-group.io`.
- Build from a clean `git archive` (never the repo dir — `.claude/worktrees` breaks the tar): `git archive HEAD | tar -x -C $STAGE; ( cd $STAGE && az acr build --registry apitechhub --image ooh-dashboard:$SHA . )`.
- Deploy: `kubectl -n iot-services set image deployment/ooh-dashboard ooh-dashboard=apitechhub.azurecr.io/ooh-dashboard:$SHA` (preserves resources). Handlers with claimArea 1500 provisioned.

## 9. Tony's tester feedback — intersection (see the companion doc)
The TB-direct work **resolves several of Tony Willetts' Tier-1 fails** (OOHDASH-72, 2026-09-11) that the paused `discovery/tester-feedback` branch (OOHDASH-77) had classified as external-blocked on the bridge. Full mapping: `OOH_TESTER_FEEDBACK_TB_DIRECT_IMPACT_2026-09-18.md`. Short version: **Tests 5, 6, 2 (and likely 1, 3) are resolved/greatly improved** by the read cutover + pub-name search; **Tests 10, 11b, 11c remain real in-repo work** unaffected by TB-direct; **Test 11a's kitchen-P1 path is now reachable** (kitchen devices are visible). The OOHDASH-77 branch is unmerged and its central premise (bridge-only-Salus, K1) is now dissolved — re-scope it, don't merge as-is.

## 10. Uncommitted / branches
- `discovery/tester-feedback` (origin) — the paused OOHDASH-77 discovery; unmerged; partly superseded (see §9). Do not merge as-is.
- Working tree clean on `main`. Memory: `ooh-tb-direct-validation-verdicts` (this project's running record).
