# HANDOVER — Independently Validate the ThingsBoard-Direct Discovery (pre-design gate)

**For:** a fresh OOH Dashboard session · **Authored:** 2026-09-16 · **Owner:** James Brown
**Mission in one line:** *Adversarially validate every claim in the ThingsBoard-direct discovery so that when we re-engineer the OOH dash's read+control plane, it works first time — then set James up to move to design.*

You are a fresh session. Do **not** trust the prior session's conclusions — **re-prove them** against live systems and the codebase. Your job is verification, not construction. **Write no product code.** Deploy sub-agents, make them try to *break* the findings, and return a go/no-go with evidence.

---

## 1. Context — what the prior session established (all marked as CLAIMS to re-verify)

The OOH Triage Dashboard (live prod, v1.2.1, `ooh.airedale-group.io`) currently reads its device inventory from the integration-bridge's internal `/api/devices`, which only exposes the bridge's own vendor-adapter subset (for site 6261, 1 of 23 devices). **Decision (confirmed with Spencer): read + control DIRECT from ThingsBoard; the bridge stays behind TB only for vendor command dispatch.**

Three artefacts hold the discovery — read them first:
- `docs/project/OOH_TB_DIRECT_INVESTIGATION_2026-09-16.md` — architecture rationale.
- `docs/project/OOH_TB_DIRECT_DESIGN_2026-09-16.md` — the proposed build (read-service replacing `services/bridge.js`, `classifyDevice()` parser, control deltas, code-change inventory).
- `docs/project/OOH_DEVICE_DATA_DICTIONARY_2026-09-16.md` — per-type read + control catalogue.

**CLAIMS to validate (each must be independently re-proven or refuted):**
- **C1 Read plane:** a TB query by device-name prefix returns a site's *full* estate. (Prior: site 6261 → 23 devices / 18 active, vs 1 via bridge.)
- **C2 Auth:** prod TB is `portal.lhlive.co.uk`; the PE API key works ONLY as `Authorization: ApiKey <key>`; the prod **service accounts** (Key Vault `airedale-kv-prod`) authenticate via `POST /api/auth/login` → JWT.
- **C3 Site query:** `gk-{siteNo}-*` name prefix is authoritative; customer grouping is inconsistent; brand casing varies (`gk/Gk/GK`); some site keys are alphanumeric (`allertonhallfarm`).
- **C4 Naming/classification:** `{brand}-{siteNo}-{assetType}-{n}` parses cleanly into categories for the estate — and where it DOESN'T (find the exceptions).
- **C5 Control payloads:** shared-attribute writes — `switchDesired` (Tuya bool), `setpointDesired`/`modeDesired`/`hwBoostHoursDesired` (thermostats) — dispatched by the bridge, confirmed via `<thing>Reported`+`<thing>SyncStatus=synced` (~2–4s). (Prior: PROVEN on `bench-owon-1` Tuya switch only.)
- **C6 Bounded control set:** only 4 live controllable types — Tuya switch, Salus thermostat, Intesis AC, boilerControl (defer). All else monitor-only.
- **C7 Per-device controllability:** control capability is per-device (some *monitoring* profiles carry a Tuya `switch_1`), NOT per-profile.
- **C8 Code integration:** the new TB read-service can preserve the exact `services/bridge.js` public interface (`getSites/getSitesByNumber/searchSites/getDevice/bridgeStatus`) and canonical device shape so `control.js`, `routes/api.js`, `public/js/flows.js`, `registry.js` are untouched; `device.deviceId` MUST be the TB device NAME (control path resolves UUID from it).

## 2. Credentials & access (values are NOT in this doc — pull at runtime)

- **Prod TB read:** Key Vault `airedale-kv-prod` → `thingsboard-read-username` / `thingsboard-read-password` (validated: `svc-read@…`, reads devices+telemetry). Host `https://portal.lhlive.co.uk`.
- **Prod TB control/write:** `thingsboard-control-username` / `-password` (SR-3 `ooh-control`). **Do NOT issue writes against production/live trading-site devices — ever.**
- **Dev/bench TB:** `thingsboard-dev-username` / `-password` — host `https://airedale-dev.iot-private.cloud` (UAT bridge; only place writes are allowed). James has authorised use of the dev pair. Bench devices: Tuya switches `bench-owon-1`, `bench-tongou-sy1-1/-sy1-2`, `bench-tongou-sy2-1` (free to toggle); thermostats `funklet-intesis-29d1f022`, `spencer-home-salusit700` (capture-and-restore guards; 19–23°C, prefer off/fan). Runbook: SharePoint `SD-664 IoT UAT Device Fleet Register\SD-664-uat-playground-runbook.md`.
- Azure CLI is authenticated as James → `az keyvault secret show --vault-name airedale-kv-prod -n <name> --query value -o tsv`. **Never log, commit, or write any secret to disk.** Full auth detail: CIR `THINGSBOARD_ALARM_ACCESS.md` §6.

## 3. Your validation mission — deploy agents to REFUTE, then gate

Run these as parallel sub-agents (adversarial framing — each tries to find where the claim fails). Keep James to summaries only (one line per agent, one per result).

1. **Read-plane validator (multi-site, not just 6261).** Enumerate **8–12 diverse real sites** across brands and site-key styles (numeric + alphanumeric, `gk` + minor brands). For each: does the name-prefix query return the full estate? Do all devices classify? **Surface every device that does NOT fit `{brand}-{siteNo}-{assetType}-{n}`** and every profile that appears at sites but isn't in the data dictionary. Confirm the query scales (12,801-device tenant — no full-estate pulls at runtime).
2. **Control-plane validator (bench, adversarial).** On the dev bench, re-prove the write→`synced` loop for **each controllable type**: Tuya switch (incl. a **multi-gang** `switch_1`+`switch_2` device — does `switchDesired` address a channel?), Salus thermostat (`setpointDesired`/`modeDesired`/`hwBoostHoursDesired`), Intesis AC (`setpointDesired`/`modeDesired` **and** the unverified `OnOff`/`FanSpeed` extras — find the literal attribute names). Test failure modes: bad value, offline device, timeout — what does `SyncStatus` do? Capture-and-restore every thermostat. **No production writes.**
3. **Code-integration validator.** Audit EVERY consumer of `services/bridge.js` and `services/tb-client.js`. Prove (or refute) that the interface-preserving swap in the design holds — hidden coupling, the `deviceId`=TB-name requirement, the `switchDesired` addition to `ATTRIBUTE_FAMILY`, the dormant kitchen/lighting/fan flows in `public/js/flows.js` + `SCOPE_GROUPS`. List anything that would break on the swap.
4. **Credential/scope & fail-safe validator.** Confirm read vs write account scopes; that `WRITES_DISABLED` fail-closed semantics hold; that live-mode config (`TB_URL`, service accounts, `BRIDGE_BASE_URL`) is coherent; no secret leakage path. Confirm the API-key-vs-service-account decision for prod runtime.
5. **Synthesis & design-readiness gate.** Collate 1–4 into a single **validation report** (`docs/project/OOH_TB_DIRECT_VALIDATION_REPORT.md`): per-claim CONFIRMED / REFUTED / NEEDS-DECISION with evidence, a consolidated **open-decisions list** for James, and a **go/no-go for design** with the concrete design-kickoff scope if go.

## 4. Invariants (do not violate)
- Production system. **No writes to prod/live devices.** Bench (dev TB) only for writes. `WRITES_DISABLED=true` on live stays.
- ThingsBoard is source of truth; the bridge stays behind TB for dispatch — remove only the dash's *read*-coupling to the bridge `/api/devices`.
- Secrets are runtime-only (Key Vault) — never in code, logs, commits, or this doc's descendants.
- Verification only this session — **no product code.** The build is gated behind James's human approval AFTER this validation.
- Orchestrator output discipline: James sees summaries only — one line per agent deployed, one per result; never sub-agent transcripts.

## 5. Current state & definition of done
Read plane + one control type (Tuya switch) already proven by the prior session; creds all located in `airedale-kv-prod` and the read account validated. **This session's job is to widen and adversarially harden that proof across all sites and all controllable types, prove the code swap is safe, and hand James a go/no-go with a crisp design-kickoff.** Done = the validation report exists, every claim C1–C8 is CONFIRMED/REFUTED/NEEDS-DECISION with evidence, and James has a clear "move to design" (or "fix these first") decision in front of him.
