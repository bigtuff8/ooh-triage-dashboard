# Tony Willetts' Tester Feedback — TB-Direct Impact Assessment

**Timestamp:** 2026-09-18 · **Owner:** James Brown
**Purpose:** James paused acting on Tony's Tier-1 feedback, suspecting the TB-direct re-engineering would make some of it moot. This maps **each** of Tony's items against what TB-direct actually changed, so the other session knows what's resolved vs what is still real in-repo work.

**Sources:** Tony Willetts email "OOh Dashboard testing" (2026-09-11, OOHDASH-72 Tier-1: 6 pass / 7 fail); the paused discovery `discovery/tester-feedback` branch (OOHDASH-77, 2026-09-16 — written on the **old bridge-only premise**); the deployed TB-direct build (`main` @ `dce9ea0`, read cutover live).

> **Headline:** the OOHDASH-77 discovery's central blocker **K1 — "the integration-bridge only carries Salus, so non-heating devices can never render; external-blocked on Spencer/IoT"** — is **dissolved** by TB-direct. We no longer read from the bridge; we read the full estate direct from ThingsBoard. So the items OOHDASH-77 *parked on the bridge* (Tests 5 & 6) are now **resolved in-app**, and the name/search fails (Tests 1–3) are resolved as a side-effect of the read-plane work. The genuinely app-internal defects (Tests 10, 11b, 11c) are **untouched** and remain the real remaining work.

---

## Per-item verdict

### Test 1 — Search a site by number · FAIL → **LIKELY RESOLVED (re-test)**
Tony: *"Only shows House ID and gk-number."* No pub name/location.
TB-direct: the read plane now populates `siteName`/`brand` from the site header (AMR SERVER_SCOPE) and the Zendesk site directory. Search results are sourced from `zendesk.siteDirectory()` carrying `{siteNo, siteName, brand}`. The name is now available to render. **Re-test on the deployed build**; if the results row still shows only the number, it's a small front-end display fix, not a data gap.

### Test 2 — Search a site by name · FAIL → **RESOLVED by design (D8) (re-test)**
Tony: *"No sites can be found when typing name."*
TB-direct: this was a **known** limitation — TB `textSearch` cannot do pub-name search — so the design explicitly added a **warmed pub-name search index** from the Zendesk directory (decision D8). `searchSites()` now matches on `siteName.includes(q)` over that directory. **Directly addressed by the read-plane build.** Re-test.

### Test 3 — Confirm the correct site · FAIL → **LIKELY RESOLVED (re-test)**
Tony: *"Doesn't show house name or location. Just gk-6261 6261."*
Same root as Test 1 — `siteName` now populated. Re-test; residual is display-only if anything.

### Test 5 — Read live device status · FAIL → **RESOLVED by TB-direct (the whole point) (re-test)**
Tony: *"Only shows Salus/Accommodation Gateway. No boiler or tuya devices found."*
OOHDASH-77 classified this **EXTERNAL-BLOCKED (K1)** — the bridge only carries Salus; coverage parked on Spencer/IoT (OOHDASH-75/76). **TB-direct removes that premise entirely:** we read direct from ThingsBoard, which holds the full estate (site 6261 = 23 devices incl. boiler, tuya kitchen/lighting/fans, metering). The read cutover is **deployed live** (`thingsboardRead:healthy`). **This is the single largest resolution.** Re-test on the deployed build — expect the full estate, not just Salus.

### Test 6 — Lighthouse scope tiles · FAIL → **RESOLVED by TB-direct (re-test; live actuation pending write-flip)**
Tony: *"Says we only control heating, everything else shows 'not on lighthouse here'."*
OOHDASH-77 planned only a **copy-honesty pass** (coverage parked). **TB-direct resolves the root cause:** `SCOPE_GROUPS` is now capability-driven — kitchen/lighting/fans render as controllable (`ctl`) when their devices carry the switch capability, which they now do (visible + classified). The "not on lighthouse here" copy is largely **moot** — the honest answer is now "yes, controllable." Note: the tiles show control *capability* now (read); live *actuation* still needs the write-flip. Re-test.

### Test 10 — Record an outcome (typed notes dropped) · FAIL → **STILL OPEN — TB-direct-independent**
Tony: *"Ticket was raised but it didn't include the actual notes I typed."*
OOHDASH-77 root cause (CT-1, reproducible): the **category tiles drop the handler's smart-entry text** — `views.js:177` calls `startFlow('${c.k}')` with no second arg, so `state.smartEntryText` never becomes `callerWords` (null on the wire); no `Caller's words:` line on the ticket. **TB-direct does not touch `views.js`/`flows.js` outcome routing — this defect stands.** Fix is routing-only (carry `smartEntryText` into `startFlow`, as the "Sounds like" chip already does). *Nuance:* the secondary control-path synthesised-detail drop (OOHDASH-77 §1.3) sits in `control.js`/`api.js`, which the control build reworked — re-verify that path, but the **primary** tile-drop is unchanged and remains the real fix.

### Test 11 — Escalate a P1 · FAIL → **SPLIT: 11a partly enabled by TB-direct; 11b/11c still open**
Tony: *"Can only raise P1 through 'Contractor on site'… kitchen appliances dropping off should be P1… P1 doesn't send text."*
- **11a — P1 route (system-driven, D1):** OOHDASH-77 noted the kitchen-critical P1 path was **unreachable live because no kitchen devices were on the bridge (K1)**. **TB-direct makes it reachable** — kitchen devices are now visible, so "all kitchen appliances dropped off = P1" becomes detectable/implementable. The auto-P1 flow-mapping (D1) still needs building, and the heating/fan/hotwater welfare candidates still need James/Sam sign-off — but the **blocker on 11a's kitchen case is lifted**.
- **11b — send a real P1 text:** **STILL OPEN, TB-direct-independent.** `SMS_PROVIDER=log` sends nothing; enabling the real gateway is go/no-go #4 (deliberately out of scope of the TB-direct deploy). External preconditions per OOHDASH-77 §2b.
- **11c — `dispatchOk` falsely claims "SMS sent":** **STILL OPEN, TB-direct-independent.** In-repo honesty defect in `escalation.js`/`flows.js:153`/`api.js:227` — a log-mode no-op is recorded and shown as a successful dispatch. Fix folds into the SMS gateway work.

### Passes (unchanged): Test 4 (ambiguous rejected), 7 (recent tickets), 8 (callback lookup), 9 (tonight view), 12 (safety-lock negative), 13 (add follow-up). TB-direct doesn't regress these; re-confirm 4/12 given the read/control changes.

---

## Re-scoped action list (for the other session)

**Now resolved by TB-direct — re-test on the deployed build, then close the tickets:**
- Test 5 (device coverage) · Test 6 (scope tiles) · Test 2 (name search) · likely Test 1 & 3 (name/location display).

**Still real in-repo work — unaffected by TB-direct (do these regardless of the write-flip):**
- **Test 10** — routing fix so category tiles carry `smartEntryText` into `startFlow` (primary; re-verify the control-path secondary).
- **Test 11b** — enable the real SMS gateway (go/no-go #4; external preconditions).
- **Test 11c** — make `dispatchOk` reflect an actual send; gate the "text sent" card + transcript line on it.

**Enabled/changed by TB-direct — now buildable:**
- **Test 11a** — auto-P1 on warranted flows (kitchen-critical now reachable; heating/fan/hotwater need James/Sam sign-off per OOHDASH-77 §2a).

**Housekeeping:** the `discovery/tester-feedback` branch (OOHDASH-77) is unmerged and its K1 premise is dissolved. Re-scope it: Tests 5/6 move from "external-blocked/parked" to "resolved — re-test"; keep its Test 10 root cause and Test 11a flow-mapping (still valid). Do not merge as-is.
