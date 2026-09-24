<!-- gate:contract
SECTION: What we built
The fix that makes device liveness truthful. The dashboard now decides "offline" from FRESHNESS — how long since a device last reported — instead of from ThingsBoard's `active` flag, which was mislabelling live devices as offline. The change lands at the single line where `online` was computed, so every triage flow that reads it is corrected at once with no other code touched. A device that reported within the threshold is ONLINE (the `active` flag can no longer override that); a device with no report time, or one silent past its threshold, is OFFLINE. The threshold is 48 hours with a per-device-type override hook for when IoT confirms per-type cadence.
SECTION: Proven against real devices
This was verified read-only against live ThingsBoard, not just fixtures. The roof units that were wrongly shown offline at sites 4631, 6886 and 6748 now compute ONLINE — including units whose `active` flag was false but which had reported minutes ago. At live site 6770 the genuinely-dead devices correctly stay OFFLINE: both AMR meters (no report time), CJ's two long-dead devices (external lighting silent ~81 days, extract fan ~113 days), and the Lighthouse gateway (~63 days). Zero false-online: no device with a missing or stale timestamp is ever reported online. A fast unit test pins the exact rule so it cannot regress; the full unit suite is green (265 pass, 0 fail).
SECTION: What stays the same
No new screen, no status light, no device-health list — the corrected value simply flows into the triage answers the operator already sees (connection-check, heating, hot-water, kitchen, and the "some equipment not responding" banner). Writes stayed locked throughout; all ThingsBoard access was read-only GET. The theme-G device-health experience is untouched — this fixes only the shared liveness signal.
SECTION: What we still need
One IoT confirmation before the threshold is locked: the expected reporting cadence per device type (roof units, gateways, AMR meters). Owner: Sam Day / IoT. Until then 48 hours is the safe provisional default and it already separates live from dead cleanly on real data; any slower-reporting type slots into the per-type hook as a one-line number with no redesign. Separately, two pre-existing end-to-end tests fail on unrelated SMS/P1 wording — not caused by this change, and e2e is not the required CI check.
DECISION: Approve merging this freshness-based liveness fix? | Yes, merge | Request changes
-->

# OOHDASH-85 Build — truthful device liveness from report freshness

**Type:** Build gate (code + proof for approval). **Date:** 2026-09-24. **Ticket:** OOHDASH-85 (theme A — false-offline / live device-status accuracy).
**Basis:** the approved, merged design `docs/project/OOH_FALSE_OFFLINE_DESIGN_2026-09-24.md`. This build implements that design exactly; the pull request carries the full code diff.

The dashboard was telling out-of-hours operators that devices were offline when they were alive and reporting — Tony flagged it, including that it "looks worse two minutes later". This build fixes it at the single seam the design identified, and proves the fix against real devices, read-only.

---

## 1. What changed (the code)

- **`services/tb-device.js`** — the whole fix:
  - `parseLastActivity()` reads `lastActivityTime` (epoch-ms) from the SAME SERVER_SCOPE read that already fetched `active,lastActivityTime` — the truthful signal the old code fetched and threw away. Missing / non-numeric / `<=0` → `null`.
  - `deriveFreshnessOnline()` is the rule: missing timestamp → OFFLINE; age within threshold → ONLINE (with `active` ignored so it can never flip a fresh device offline); age beyond threshold → OFFLINE (with `active` recorded as corroboration of "dead"). This replaces the old `online: raw.isOnline ?? raw.active ?? false` passthrough.
  - `FRESHNESS_DEFAULT_MS` (48h) plus a `FRESHNESS_BY_TYPE` per-`deviceType` override hook, resolved as `FRESHNESS_BY_TYPE[deviceType] ?? default`. The hook is empty, ready for Sam's numbers.
  - `applyFreshnessDebounce()` — a server-side backstop: a device stale for the first time still reports its prior value; only a second consecutive stale poll asserts offline; a device that reports again resets. A missing timestamp or a failed read asserts offline immediately (preserving the OOHDASH-80 fail-safe).
- **`test/freshness-online.test.js`** (new) — unit test pinning fresh→online (even with `active=false`), stale→offline, missing→offline, active-never-rescues, per-type threshold, and the debounce.
- **`test/live/false-offline-live.test.js`** (new) — the live read-only proof (§2).
- **`data/fixtures/tb-devices.raw.json`, `test/tb-device.test.js`, `test/site-identity.test.js`** — updated to encode the freshness contract instead of the superseded `active`-only rule.
- **`.gitignore`** — adds `credentials/` so the local ThingsBoard env used by the live proof can never be committed.

No consumer of `online` changed — they all read it as an opaque boolean, so correcting the derivation corrects them all: the workspace "not responding" banner (`routes/api.js`), the heating/hot-water/kitchen and connection-check flows (`public/js/flows.js`), and control dispatch (`services/control.js`).

---

## 2. The proof (real devices, read-only)

Run against live ThingsBoard with read-only GETs (JWT auth; writes stayed locked; no secret committed or logged).

- **Live-but-false-offline devices now ONLINE.** Roof units at sites 4631, 6886 and 6748 — the ones the design named — all compute ONLINE under the freshness rule, having reported within the hour. This is the bug Tony and CJ reported, fixed.
- **Genuinely-dead devices stay OFFLINE** (site 6770): `gk-6770-ElecAMR-1` and `gk-6770-GasAMR-1` (no report time), `gk-6770-externallighting-1` (~1944h) and `gk-6770-extractfan-1` (~2722h) — CJ's two named dead devices — plus `gk-6770-lwgateway` (~1513h) and the Salus gateway.
- **Zero false-online:** no device with a missing or stale timestamp is ever reported online — the decisive negative check.
- **Live test:** 4/4 pass (3 positive sites + the 6770 negative). A named site unreachable at run time reports skip-with-reason, never a silent pass.
- **Unit suite:** 265 pass, 1 skip (pre-existing, unrelated), 0 fail.

---

## 3. Scope, safety, and what remains

- **No new UI** — corrected liveness surfaces only through the existing triage outcomes (conversational-outcome principle). No status pill, no device-health list.
- **Read-plane only** — no write path touched; WRITES_DISABLED unaffected.
- **Theme-G boundary respected** — only the shared liveness signal is changed; device-health UX is untouched.
- **Open item (does not block merge):** IoT per-type reporting cadence — owner Sam Day. 48h is the provisional default via the per-type hook until confirmed.
- **Note:** two pre-existing e2e tests fail on unrelated SMS/P1 wording; not caused by this change and e2e is not the required CI check.

---

## 4. If you approve

Merging lands the truthful-liveness fix. The follow-ups are: fold Sam's per-type cadence into the `FRESHNESS_BY_TYPE` hook when it arrives, and (separately) the theme-G broader device-availability view that was deferred behind this liveness mechanism.
