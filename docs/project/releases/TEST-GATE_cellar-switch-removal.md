<!-- gate:contract
SECTION: What this gate is
This is the Stage-3 (test) sign-off for Stream A of R1 — the refrigeration/cellar switch-capability removal (design DESIGN_cellar-switch-removal.md, implementation in services/tb-device.js, services/registry.js). It records what was actually run, the real observed results, the three pre-existing e2e reds called out and confirmed unchanged, the targeted-validation outcomes driven directly against the shipped functions, and a clear pass/fail verdict. It changes no code and flips nothing — WRITES_DISABLED stays "true" throughout.
SECTION: What was tested and the actual results
The full unit suite ran green — 222 tests, 221 pass, 0 fail, 1 skipped (the CR3 profile-populate enforcement test, which is designed to skip until the read-only ThingsBoard probe artefact lands; skipping is the intended fail-closed interim, not a defect). The full Playwright e2e suite ran on an isolated port (3197) with an isolated store to avoid contention with the shared working tree — 41 tests, 38 passed, 3 failed. All three failures are the known pre-existing reds tracked separately, unrelated to Stream A: the Intesis native-off assertion, the outcome-record 500-path inline-error assertion, and the log-mode P1 "text message" wording assertion. No new failure appeared.
SECTION: The targeted Stream-A validation
Every load-bearing behaviour was driven directly against the real classifyDevice, capabilitiesFor and validateCommand — return values asserted, not source inspected. A switch-bearing cellar unit classifies as refrigeration/monitor-only (deviceType refrigeration, kind fridge, controllable false, control null) even with a switch_1 signal present; capabilitiesFor('refrigeration').commands is the empty list, so no Turn OFF button renders and no control scope tile lights; a crafted switch write is rejected by validateCommand fail-closed via both the empty command list and the independent deviceType backstop. Every refrigeration appliance-noun form denies (all nine, including all four written shapes of cold room). A genuine kitchen fryer, generic lighting and the glued cellar controllables (cellarfan-1, cellarlgt-1, cellarlight-1, cellar-fan-1) remain controllable tuya — unchanged. Fail-closed default holds (cellar with no switch and cellar-with-bare-relay both classify refrigeration; the appliance-absolutism case fridge-light-circuit stays monitor-only). The registry backstop keeps writes refused independently of classification, and WRITES_DISABLED is confirmed "true" in the manifest.
SECTION: The verdict
PASS. Stream A meets its design spec at every load-bearing layer (classification, registry command list, write guard, scope payload), the full unit suite is green, and the e2e suite shows only the three known pre-existing reds with no regression.
DECISION: Accept the Stream A test stage as PASS? | Accept — PASS | Request changes
DETAIL: 222 unit (221 pass / 1 designed-skip / 0 fail); 41 e2e (38 pass / 3 known pre-existing reds / 0 new). 27/27 targeted behavioural assertions green, driven against the real shipped functions. Writes stay locked throughout.
-->

# Test Gate — Remove the device-control switch capability from refrigeration (Cellar) assets

**Release:** OOH Triage Dashboard — R1 · **Stream:** A (cellar switch removal) · **Stage:** Test · **Date:** 2026-09-23
**Repo:** `C:\repos\ooh-triage-dashboard` (owner bigtuff8), app v1.2.4, `WRITES_DISABLED="true"`, `SMS_PROVIDER="log"`.
**Input:** signed-off design `docs/project/releases/DESIGN_cellar-switch-removal.md`; implementation in `services/tb-device.js`, `services/registry.js` (merged to main).
**Method:** every result below was produced by actually running the suite and by driving the shipped functions and asserting their return values — no source-check assertions. Tests ran in an isolated worktree on an isolated port and store so a concurrent session holding the shared tree could not collide. No code was changed; nothing was flipped.

---

## 1. Full unit suite — GREEN

Command: `npm run test:unit` (`node --experimental-test-module-mocks --test "test/*.test.js"`).

Actual result:

- tests **222**, pass **221**, fail **0**, skipped **1**, todo 0.
- The single skip is the **CR3 profile-populate enforcement** test in `test/refrigeration-deny.test.js`. By design it skips while the read-only ThingsBoard probe artefact (`data/cr3-cellar-profile.json`) is absent, and would fail CI the moment that artefact lands with `REFRIG_PROFILES` still empty. Skipping here is the intended fail-closed interim, not a gap — the name-token deny plus the registry backstop protect every recognised device without it.
- The Stream A add-cases (`test/tb-classify.test.js`, `test/control-plane.test.js`, `test/refrigeration-deny.test.js`) and the interlock cases (`test/interlock-stream-a.test.js`) are all within the green count.

Verdict: **PASS** — unit suite green, the one skip is designed and safe.

---

## 2. Full Playwright e2e — only the three known pre-existing reds

Command: Playwright over `tests/` on an **isolated port (3197)** and isolated store (mirror of the tracked config; the tracked config binds a fixed port and shared store, so a copy was used to run concurrently without collision).

Actual result: **41 tests — 38 passed, 3 failed.** The three failures are exactly the known pre-existing reds tracked as a separate OOHDASH ticket, none related to Stream A:

- `tests/control.spec.js:194` — control & sync › F007 Intesis turn-off uses native mode Off (Tamar) — the Intesis-off assertion.
- `tests/control.spec.js:208` — control & sync › outcome-record failure shows inline error with manual retry (Protocol 4: 500 path).
- `tests/tonight-callback.spec.js:136` (fails at line 145) — contractor flow P1 › expects the string "text message"; the shipped log-mode card honestly reads "Text not sent — phone the on-duty manager now" (the OOHDASH-72 honesty behaviour), so the stale wording assertion fails.

No new failure appeared. The three reds match the pre-declared set one-for-one.

Verdict: **PASS** — only the three known pre-existing reds; zero regressions from Stream A.

---

## 3. Targeted Stream-A validation — driven against the real functions

27 assertions were run by calling the shipped `classifyDevice`, `capabilitiesFor` and `validateCommand` and asserting the returned values (behaviour, not source). All 27 passed.

- **Switch-bearing cellar is monitor-only.** `classifyDevice('gk-6261-cellar-1','default',{switch_1:true,temperature:6.4})` returns `deviceType:'refrigeration'`, `kind:'fridge'`, `controllable:false`, `control:null` — the switch signal is overridden.
- **No button, no control tile.** `capabilitiesFor('refrigeration').commands` deep-equals the empty list, so the client switch gate (capabilities includes 'switch') is false — no Turn OFF button renders and no control scope tile can read controllable.
- **Crafted switch write rejected, fail-closed.** `validateCommand({deviceType:'refrigeration',...},'switch',false)` and `...,'switch',true` both return `ok:false` with a monitor-only / not-permitted reason — refused by the empty command list AND the independent deviceType backstop.
- **Every refrigeration appliance-noun form denies.** All of fridge, freezer, chiller, coldroom, cold-room, cold_room, cold room, refrigeration, refrig — each carrying a switch — classify refrigeration/monitor-only. All four written shapes of "cold room" deny (proving the `_`→`-` normaliser handling).
- **Genuine controllables unchanged.** Kitchen fryer (`gk-6209fryer-1`) and generic lighting stay tuya/controllable; tuya still carries the switch command so the button renders for real kitchen circuits.
- **Glued cellar controllables (ratified option b) stay controllable.** `cellarfan-1`, `cellarlgt-1`, `cellarlight-1` and hyphenated `cellar-fan-1` all classify tuya/controllable via substring override of the short tokens.
- **Fail-closed default and appliance-absolutism.** A cellar with no switch, and a cellar carrying only a bare relay word, both classify refrigeration; `fridge-light-circuit` stays monitor-only (the deliberate appliance-absolutism assumption).
- **Boot-guard / interlock and lock state.** The refrigeration deny is present in the running image (the boot-guard self-test asserts `classifyDevice` returns refrigeration for the specified cellar device), so the interlock keeps writes locked if the deny were ever absent; `WRITES_DISABLED` is confirmed `"true"` in `k8s/deployment.yaml`.

Verdict: **PASS** — the deny, the registry backstop, the empty-capabilities button/tile closure and the carve-out for genuine controllables all behave exactly as the design specifies.

---

## 4. Overall verdict — PASS

Stream A passes the test stage. The unit suite is green (222; 221 pass, 1 designed-skip, 0 fail), the e2e suite shows only the three known pre-existing reds with no new failure, and every targeted behaviour is confirmed by driving the real shipped functions. Writes remained globally locked (`WRITES_DISABLED="true"`) throughout; this stage flips nothing. The design's release-time "observed-running in the live pod" check (no Turn OFF button on a real cellar device on the deployed image) remains a separate live sign-off owned per the design's §6.1 interlock and is outside this merge-stage gate.

*All results observed firsthand on 2026-09-23 in an isolated worktree; e2e on isolated port 3197 / isolated store. Prose + bullets only, no tables, no secrets.*
