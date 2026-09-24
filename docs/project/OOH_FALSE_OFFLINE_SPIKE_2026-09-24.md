<!-- gate:contract
SECTION: The bug
The dashboard tells out-of-hours operators that devices are "offline" when they are actually alive and reporting. It reads one ThingsBoard flag, `active`, and treats it as proof of life — but that flag is not a truthful sign of life. Worse, the code already fetches the timestamp that would tell the truth (when the device last reported) and then throws it away. So a device that reported minutes ago can still show offline.
SECTION: The proof
We read five live sites tonight, read-only. Across them, roughly a quarter to two-fifths of the devices shown as "offline" had in fact reported within the last hour — they were alive. The false alarms cluster on the same device kinds (roof units, cellar sensors, some gateways). Critically we saw ZERO cases of the opposite error (a dead device wrongly shown online), and live versus genuinely-dead devices separate with a wide, clean gap.
SECTION: The fix we recommend
Decide "offline" from freshness — how long since the device last reported — instead of from the `active` flag. Treat a device with no timestamp as offline, and demote `active` to a supporting hint that can confirm "dead" but never turn a fresh device offline. Start the threshold at 48 hours (conservative until IoT confirms how often each device type should report), and only assert offline when a device stays stale across a poll or two so it cannot flicker. Show the result as a triage answer, not a raw status light.
SECTION: What we still need
One confirmation from IoT before we lock the threshold: the expected reporting cadence per device type (roof units, gateways, meters). The data shows a clean 48-hour cut today, but if any device type legitimately reports less often, that type needs its own threshold.
DECISION: Adopt the freshness-based definition of "offline" (48-hour threshold, active flag as corroboration only) as the basis for the design stage? | Yes, adopt it | Request changes
-->

# OOHDASH-85 Spike — live devices are being shown as "offline"

**Type:** Spike on a reported bug (read-only investigation). **Date:** 2026-09-24. **Ticket:** OOHDASH-85.

The dashboard is telling out-of-hours operators that devices are offline when they are actually alive and reporting — Tony flagged it, including that the picture "looks worse two minutes later". This spike pins down the cause, proves how often it happens against live data, and recommends the fix. It was carried out entirely read-only; writes stayed locked and only GET calls were made to ThingsBoard.

## The bug

The dashboard decides whether a device is online from ThingsBoard's per-device `active` flag, with no freshness check — and it discards the one field that would tell the truth.

- In `services/tb-device.js` the read asks ThingsBoard for BOTH `active` and `lastActivityTime` (around line 551), but only `active` is used (`parseActive`, around lines 523 to 528). `lastActivityTime` is fetched and then thrown away.
- The `online` value is a straight passthrough of that flag (around lines 485 and 615): it takes `raw.isOnline` if present, otherwise `raw.active`, otherwise false. Nothing anywhere compares the last-report time against now.
- Why that is wrong: ThingsBoard's `active` is a session / inactivity-timeout flag, not a measure of "did this device just report". It reads false for devices that are still delivering telemetry. The truthful signal — when the device last reported — is exactly the `lastActivityTime` the code already fetches and discards.
- The "worse two minutes later" part: the workspace re-polls every 30 seconds (`public/js/views.js`, around lines 138 to 147). The raw `active` flag flips between polls, so the offline picture visibly changes from one refresh to the next.

## The proof (five live sites, read-only, tonight)

- Per site: site 6261 (23 devices) had 0 false-offline; site 4631 (39) had 4; site 6886 (37) had 5; site 6748 (32) had 4; site 6770 (41, from the earlier read) had about 40 percent of its shown-offline list actually alive.
- The pattern holds across sites: false-offline appeared on four of the five sampled sites, running from roughly a quarter to over a third of each "offline" list, and it clusters on the same device kinds — roof units, cellar sensors, and some gateways — which points to the `active` timeout being mis-tuned for those types, not a site-wide fault.
- The decisive finding: ZERO false-online across all five sites — not one dead device was wrongly shown as online. Live devices had reported within about 11 hours at most; genuinely dead devices were 99 hours silent or more; nothing sat in the gap between. Live and dead separate cleanly with a wide margin.

## The fix we recommend

- Decide online from freshness — time since the device last reported — rather than from the `active` flag. Treat a missing timestamp as offline. Keep `active` only as corroboration: it can strengthen a "this is dead" conclusion, but must never turn a freshly-reporting device offline.
- Set the threshold at 48 hours to start — deliberately conservative until IoT confirms the slowest legitimate per-type cadence, after which it can be tightened.
- Remove the flicker: derive from the last-report time (which only moves forward) and assert offline only when a device stays stale across a poll or two. Given the wide margin this will rarely engage, but it guarantees no flip-flopping between refreshes.
- Surface the answer where triage needs it (for example "is this device reachable?"), as a confident conclusion rather than a raw status light the operator has to interpret. This is a change to a derivation that already runs — the data is already being fetched — not a new mechanism.

## What we still need before locking it

- One confirmation from IoT: the expected reporting cadence per device type, especially roof units, gateways and the AMR meters. The 48-hour cut is clean on tonight's data, but if a type legitimately reports less often than that it needs its own threshold rather than the single global one. [NEEDS-IOT — Sam Day / IoT team]

## Scope note

- The mechanism that decides liveness truthfully is shared with the gateway-offline half of OOHDASH-91 (theme G) — the same fix serves both. G's broader device-health user experience stays out of scope here.

## If you approve

- This freshness-based definition becomes the basis for the design stage. Design would specify the exact derivation at the single existing seam in `services/tb-device.js` (consume the `lastActivityTime` already fetched), the anti-flicker debounce, and a test that proves a real currently-false-offline device (a roof unit at 4631, 6886 or 6748) flips to online while genuinely-dead devices and never-reporting meters stay offline — so the fix is observed working against real devices, not just merged.
