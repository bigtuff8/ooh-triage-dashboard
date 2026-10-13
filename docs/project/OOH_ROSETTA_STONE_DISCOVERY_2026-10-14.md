<!-- gate:contract
SECTION: What we are solving
OOHDASH-123, the "Rosetta Stone". On 10 October Spencer changed how ThingsBoard reports back on a remote command. Everything we wrote about device control before then (the 17 September contract, the device dictionary, the PR #60 estate model and the CIR control contract) uses the old signals. This discovery lines up every old mapping against Spencer's new contract, device class by device class, so that Design can start straight away on re-plumbing the guided flows (heating, hot water, lighting, fans and the timed hold) to read, change and confirm through ThingsBoard the new way. The full working detail for Design is in docs/project/OOH_ROSETTA_STONE_MATRIX_2026-10-14.md.

SECTION: The new contract in one paragraph
We still ask for a change by setting a "Desired" value on the device, for example switchDesired. ThingsBoard's new command gate then marks the request "pending", and the vendor answers "accepted" or "rejected". A rejection comes with a short error message. There is no separate "reported" value any more. A change counts as confirmed only when the device's own reading matches what we asked for, for example the switch reading flips. Two catches: the status is written twice, so only accepted or rejected is final, and the device's reading can change before "accepted" arrives. Tuya switches finish in about half a second, and at worst under two seconds. Salus heating will take minutes, and Spencer is still measuring it. A read-only ThingsBoard check (approved by you, run 13 to 14 October) confirmed the real key names on Spencer's test switch: the status is switchSyncStatus and the error is switchLastError. Both are now stored as device attributes, not as time-series readings.

SECTION: The headline problem
The live dashboard is still listening for the old signals, which no longer exist. So every remote change now ends as "No confirmation" after 90 seconds, even when the light actually switched in under two seconds. A genuine rejection would also show as "No confirmation" rather than "Not delivered". This never shows a false success, so it is safe, but it is not useful, and it teaches operators to ignore warnings. It also blocks a repeat attempt. If the stored "Desired" value already equals the request, the dashboard refuses to send it again. That is true today for the 6261 thermostat, which has held 19 °C as its Desired value since 24 September while the room is set to 16.5.

SECTION: Summary matrix
The table below gives one line per device class: whether what we can read, what we can control, and how we hear back each match Spencer's new contract. CONFIRMED means our records and the new contract agree. GAP FILLED means the new information answers an old open question. CONTRADICTION means our records or code are now wrong. STILL A GAP means nobody has settled it yet, and Design gets a recommended default.

| Device class | Read | Control | Feedback |
|---|---|---|---|
| Tuya switch (lighting, fans, kitchen circuits) | CONTRADICTION: the display trusts a retired key first; the tongou variant is a gap | CONFIRMED key; GAP FILLED (live in prod since 10 Oct) | CONTRADICTION in code; GAP FILLED (names, place, timings) |
| Salus IT700 thermostat | CONFIRMED | CONFIRMED key; STILL A GAP (Salus never yet proven) | CONTRADICTION in code; STILL A GAP (names by analogy, time limit) |
| Salus IT500 heating | STILL A GAP (sample used a key we do not read) | STILL A GAP | CONTRADICTION; STILL A GAP |
| Salus IT500 hot water | CONTRADICTION (sample keys differ from ours) | STILL A GAP (dead path) | CONTRADICTION; STILL A GAP |
| Bare "salus" thermostats | CONFIRMED | STILL A GAP | CONTRADICTION |
| Intesis air con | CONFIRMED | STILL A GAP (removed from the dashboard anyway) | STILL A GAP |
| Boiler panel V1 and V2 | V2 CONFIRMED; V1 STILL A GAP | CONTRADICTION: the screen offers a boost that can never be sent | STILL A GAP |
| Read-only classes (fridge, cellar, meters, sensors, gateways) | CONFIRMED (one internal mismatch on the offline rule) | not applicable | not applicable |

Across the 33 detailed rows: 7 confirmed, 3 gap filled, 10 contradictions, 13 still a gap.

SECTION: PR #60 open questions Q4, Q7 and Q8
Q4 (Tuya control in production) is now resolved. Spencer put the new bridge live on 10 October, and the read-only check shows his test switch flipping and the "accepted" status, so Tuya control is live and the old "dormant" wording is out of date. Q7 (air con acknowledgement) is unresolved, but it no longer matters for this release, because air con control was removed from the dashboard and air con calls are captured and referred to the IoT team. Q8 (the status values and a real Salus confirmation) is only partly resolved. The status values are replaced by the new set, so our 25 September answer is wrong, but no Salus change has yet been seen to confirm under any contract. The "pops up when confirmed, never a blocking wait" steer still stands.

SECTION: Impact on the guided flows
Heating: the same setpoint and frost changes, but confirmation now comes from the thermostat's own setpoint reading, and Salus can take minutes, so the operator must be released at once and told the result later. Hot water: the boost button has never been able to work live. The server always refuses it, and an automated test only passes because its test data has a device the real estate does not have. Lighting and fans: control is live and fast. These need the new confirmation, a fix to the on/off display, and a fix to the repeat-attempt block. Kitchen, air con, fridge and connectivity: no control and no change needed. Timed hold and revert: every automatic revert will currently report "revert failed" and raise an alert even when it worked, so it needs the same new confirmation rule. Across all of them: show three honest outcomes (confirmed, not delivered, not confirmed) and never show the last two as success. Also show the vendor's error message on a rejection, use a time limit per vendor, and keep in-flight results safe if the server restarts.

SECTION: Gaps that remain
These are still open: the exact key names for Salus, boost and mode results (they are assumed to follow the Tuya pattern, but no such command has run since the change); which Salus reading confirms a setpoint; whether IT500 thermostats use a setpoint key our code does not read (one sample did); the Salus time limit; whether the new command gate accepts the dashboard's own login; what the new "switchRequested" value is for; how to re-send when the stored Desired value is stuck; whether tongou switches report as "switch"; and whether any V1 boiler panels remain. None of these stops Design starting. Each has a recommended default that can be swapped later in one place.

SECTION: Questions for Spencer
Twelve questions, full list in the matrix document section 6.1. The ones that matter most: please confirm the Salus, boost and mode result keys follow the Tuya pattern; give the Salus time limit and say whether a Salus change has confirmed since 10 October; confirm the command gate will accept the dashboard's write login; explain how the gate refuses a command; say how to re-send when the Desired value is already set but the device disagrees; and say which Salus reading confirms a setpoint.

SECTION: Questions for you
The seven decisions below are yours. There are also two smaller questions. Will you approve one controlled live test switch (off, then on, on an agreed device) at the release gate? And should a vendor error be shown to the operator word for word, or as a plain sentence with the vendor text kept on the ticket? I recommend the plain sentence.

DECISION: What time limit should each vendor get before we say "not confirmed"? | Per vendor: Tuya 10 seconds, Salus 10 minutes for now (adjustable without a release) | Keep one 90-second limit for everything
DETAIL: Recommend per vendor. Spencer asked for this explicitly. Tuya's worst case is under 2 seconds, so 90 seconds makes operators wait for nothing. Salus takes minutes, so 90 seconds marks good changes as failed. The Salus figure is provisional until Spencer publishes his measurement.

DECISION: What does "confirmed" mean to the operator? | The device's own reading now matches what we asked for | The vendor accepted the command
DETAIL: Recommend the device reading. That is Spencer's definition, and it is the only signal that proves the light or heating actually changed. "Accepted" only proves the vendor took the request.

DECISION: If the vendor accepted the command but the device has not shown the change by the time limit, what do we show? | "Not confirmed": accepted by the system, but the device has not shown the change yet; keep watching and update the ticket if it lands | Treat accepted as success
DETAIL: Recommend "not confirmed". Showing accepted as success would bring back the OOHDASH-102 false-success problem. Keep watching in the background and add a note to the ticket if the device catches up.

DECISION: What should we do with Salus heating control while Salus confirmation is still unproven? | Keep it offered, labelled "may take a few minutes", with the result popping up later and the ticket updated | Pause remote heating changes until Spencer shows one Salus change confirming
DETAIL: Recommend keeping it offered with honest wording. The three-outcome rule means an unproven Salus change can never be shown as success, and heating is the most valuable remote fix overnight. Revisit if Spencer's measurement shows Salus does not confirm at all.

DECISION: Does hot-water boost stay in scope for this release? | Out: remove the boost button that can never work and route to capture-and-escalate with the existing boiler guidance | In: rebuild boost, which needs a boiler-panel override contract (owned by Jonathan and Rikki) or a working IT500 hot-water device
DETAIL: Recommend out. Boost has never been able to dispatch live, and the screen currently claims hot water is "controllable". Removing the false offer is the honest quick fix. Rebuilding it depends on contracts that do not exist yet.

DECISION: Should more read-only ThingsBoard checks run before Design starts? | Start Design now and run a small read-only sweep alongside it (a live IT500, a tongou switch, a V1 boiler panel, a bare Salus) | Hold Design until the sweep is done
DETAIL: Recommend starting Design now. The key answer (names and where they live) is already proven on Spencer's test switch. The remaining items only change values in one table, so they can land during Design without rework.

DECISION: Should in-flight results be saved so a server restart cannot lose them? | Yes, in this release, using the save-and-resume design already written | Defer it again
DETAIL: Recommend yes. With Salus taking minutes, the window in which a restart silently loses a result grows from seconds to minutes. The save-and-resume design already exists, but it was deferred.
-->
