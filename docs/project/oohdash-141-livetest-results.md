# OOHDASH-141 supervised live boost test: results (2026-10-24, 15:27–15:36 BST)

James gave the go in-session. Pub zone 1 only. Four tests ran in parallel. Logs are in `run-go-2026-10-24T14-27-56-811Z/`.

| Test | Site | Applied | Panel echo | Boiler before → during | Back to auto | Panel echo | Zone state 5 min later |
|---|---|---|---|---|---|---|---|
| V1 ON→OFF | 6720 | yes | <1 s (same second) | on → on (other zones still calling) | yes | <1 s | ON = baseline |
| V1 OFF→ON | 6790 | yes | <1 s | **off → on** | yes | <1 s | OFF = baseline |
| V2 ON→OFF | 6214 | yes | 8 s | on → off | yes (override 0) | 7 s | still OFF (thermostat deadband, see below) |
| V2 OFF→ON | 6302 | yes | 9 s | **off → on** | yes (override 0) | 8 s | still ON (thermostat deadband, see below) |

## What this proves

1. **D1 dispatch works for both versions.**
   - V2: one-way RPC `{method:'override', params:'CHZ1 ±1|0'}`.
   - V1: a single-key SHARED_SCOPE write of `output2Override`. The TB dashboard writes all three keys together, but writing one key on its own is enough.
2. **Q3 RESOLVED: the boiler follows a zone ON.** At 6790 (V1) and 6302 (V2) the boiler was idle, and it was firing by the first 30 s check after the zone was forced ON. There is no need to send a separate boiler command; `BOILER_BOOST_FORCE_BOILER` stays false.
3. **Confirm timing.**
   - V1 echoes within the same second, so the design's 2 s limit is fine.
   - V2 takes 7–9 s on the panel clock, so **the design's 5 s V2 limit is too tight. Widen it to 15 s** (`confirmLimitMs` for V2).
4. **V2 natural expiry.** "CHZ1 ±1" set the override end time to 1792879200, which is 22:00Z (23:00 BST). That is the next timetable edge, as discovery said.
5. **V2 "auto" hands the zone back to its thermostat; it does not snap the output back.**
   - V2 pub zones are thermostatic: the timetable sets 21 °C by day and 15 °C at night, with a 0.5 °C deadband, and the zone is rechecked every 10 min (`CHZ1.enable_interval_mins`).
   - After "CHZ1 0", the override cleared within about 8 s, but `output_state` stays wherever the boost left it until the room temperature crosses the deadband.
   - Both rooms were at 20.8–20.9 °C, inside 20.5–21.5, so either state is correct auto behaviour.
   - **Design consequences:**
     - (a) Revert confirmation must use override = 0 only, never output_state. The design already does this.
     - (b) The ticket and operator wording should say "back on automatic; the panel's thermostat takes over".
     - (c) A V2 Heat ON forces the valve open whatever the room temperature, and Heat OFF overrides the thermostat.
6. **The V1 panel output changed as expected** at both V1 sites (`output2State`). Physical valve wiring is still unverified; that needs someone on site.

## Side findings

- **6302:** the zone-valve-2 and flow-temp alarms (in both the CHZ1 and boiler keys) come on every time the zone runs, every day for the past 7 days, so this is an existing fault, not caused by the test. Room sensor 2 has been silent since June, and sensor 1's last reading was 14:39.
- **6302 knock-on:** with a stale sensor reading 20.9 °C, the zone may stay ON longer than it would have. The panel's own sensor-timeout fallback starts about 16:39 anyway. The worst case is about an hour of extra heating, and it ends at the 23:00 setback at the latest.
