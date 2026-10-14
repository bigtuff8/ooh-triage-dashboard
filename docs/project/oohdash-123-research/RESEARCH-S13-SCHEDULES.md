# RESEARCH-S13: can the dashboard read device schedules, and where do they live? (OOHDASH-123, 2026-10-14)

Method: read-only prod ThingsBoard GETs, throttled to one request in flight with 0.5 s spacing and backoff on 429/5xx (after the coordinator's rate-limit note; earlier parallel scans were stopped and discarded). Jira SD-477, SharePoint (SD-477 design v0.3, SD-446 vendor status, the SD-446/477 "Appliances Where Schedules and Timeclocks have JSON type schema" doc, SD-479 spec), Teams search (Spencer, 9-14 Oct), OOH repo grep. Credentials loaded from the CIR env file inside a script; none printed or stored. No writes, no RPC, no attribute saves. Intesis and vendor token VALUES were never read or printed (key names only).

## Question (S13, from James)
Can the dashboard read the details of any schedules set on devices (heating, lighting, kitchen/extractor circuits, PowerPause, boiler panels)? Where are schedules held and in what shape? Are they "held as credentials"? Is any of it readable with our existing access?

## Headline verdict
- PROVEN: the schedules are NOT credentials. No device class stores a schedule in a credential. Where they exist they are ordinary ThingsBoard attributes or telemetry, or live inside the device, and our existing tenant-admin identity can read the ThingsBoard ones today.
- PROVEN: "Schedule Hub" (schedulehub-uat.airedale-group.io, SD-479) is the engineer job-scheduling system (Timefold, Aeromark, jobs pinned and solved). It has nothing to do with device schedules. Spencer's 12 Oct line "the uat hub carries the scheduling uat" refers to that. The device-schedule project is SD-477, which is design-only (status ND Backlog, "Nothing built") and therefore holds no live schedules yet.
- PROVEN: the IoT Hub (iothub.airedale-group.io, prod, Spencer 10 Oct) represents the live TB devices; it does not yet hold schedules (Spencer 12 Oct: "Live Shell Hub doesn't contain scheduling yet").
- Readable today in TB, in a documented JSON shape: boiler panels, PowerPause circuits, contactor modules. Readable today but as an opaque blob needing a decoder: Tuya/Tongou/Owon plug and fryer devices, Salus IT700. Not held anywhere TB can read: Intesis air-con and Salus IT500 (vendor cloud only).
- The existing OOH code deliberately sends no schedule (docs/BRIDGE_CONTRACT.md lines 67 and 97, tb-device.js line 717 sets schedule null), so surfacing "next scheduled change" is new build, not a bug.

## What "held as credentials" probably refers to (explained plainly)
Three real things look like it, none is a schedule store:
1. Vendor logins live with the bridge, not on devices. SD-446 vendor status shows the bridge keeps a vendor account (the "Creds" column) per vendor. For Salus IT500 (Arrayent), and for Intesis, the programme/calendar lives in the vendor's cloud, so reaching a schedule means logging in to that vendor account. That is the sense in which a schedule is "behind a credential" (DEDUCED, medium; SD-477 design table section 5 says Intesis runs from a cloud calendar via a portal API, and IT500 uses Arrayent registers).
2. Intesis devices in TB carry a SERVER_SCOPE attribute named intesisAccessToken (key name seen on gk-st-office-intesis-1; value not read). That is a credential sitting on the device record, but it is a login token, not a schedule. Raise with Spencer as a security note (same family as the doorbell secret in S2-S3).
3. Unox ovens: the feed credentials sit inside a TB rule node, and TB scheduler events carry no credentials (SD-446 status doc lines 585-595). Unrelated to heating/lighting schedules but it is the one place the words "scheduler" and "credentials" meet.
Also: TB "scheduler events" (GET /api/schedulerEvents, the PE edition feature, TB version 4.3.1.4PE) exist, 15 in total, but they are platform jobs (propertySync, tuyaSync, getSalusData, scheduleSync, unox loaders, alarm triggers), not per-device schedules. PROVEN, live read 14 Oct.

## Where schedules live, per device class

### 1. Boiler panels (profile boilerControl, 223 devices; the 315 hyphenated boiler-control are LoRa sensors, not boilers)
- Where: SHARED_SCOPE attributes on the device. Two naming styles: indexed outputNSchedule (output1..4Schedule) and named CHZ1.schedule, CHZ2.schedule, DHW.schedule, recirc_pump.schedule, accom_N.schedule. Sample of 20 (page 2 of the type list): all 20 carried indexed or named schedule keys, all in SHARED_SCOPE.
- Shape (PROVEN): {"schedule":[{"value":21,"time":"11:00","loops":"1111111","timer_id":"65184321"}, ...]}. value is the setpoint (21, 15 for heating; 60, 20 for hot water); time is HH:MM local; loops is a 7-character Sun..Sat mask. Example gk-6780-boilercontrol-1 output2Schedule, last written 10 Oct 2026 11:12Z: 22 at 11:00 and 15 at 21:30 every day. Some outputs have day-split entries (loops 1000000 / 0111100 / 0000011).
- Readable today: YES, GET attributes SHARED_SCOPE (PROVEN). Source of shape: SD-477 reference doc (schema) plus our reads.
- Next-change logic: trivial (pure function of the JSON, site timezone Europe/London). The attribute is the intent; whether the panel obeyed it is UNVERIFIED. Manual overrides are separate keys (output1..4Override, CHZ1.override telemetry etc.), so "next scheduled change" can be shown with an "override active" caveat.

### 2. PowerPause circuits (powerpause-circuit, 241 devices; kitchen/extractor/toaster circuits)
- Where: SHARED_SCOPE attributes schedules (weekly) and sched_overrides (dated). A CLIENT_SCOPE echo exists, so the device reports what it holds (PROVEN on md-0001test-pp-1-circuit-4: same empty value in both scopes, 2 Oct).
- Shape (PROVEN): same {"schedule":[{value,time,loops}]} with value 0 OFF, 1 ON, 2 IDLE_OFF. Overrides use {value,timestamp} (unix seconds, applies until next change). Sample 25 devices: 14 have a non-empty weekly schedule, 0 have non-empty sched_overrides. Example md-780wigston-ppverticaltoaster-3 (16 Mar 2026): ON 11:00 and OFF 22:00 on Sun, Fri, Sat; ON 16:00 and OFF 22:00 on Thu; shape confirmed.
- Readable today: YES. Compare SHARED (what we asked) to CLIENT (what the device reports) to prove "on device". The 11 sampled circuits with empty schedules just run with no schedule (UNVERIFIED whether that means always-on).
- Telemetry key override on the circuit shows a manual override state (value "0" seen, 7 Oct).

### 3. Contactor modules (contactorModule, 1 device in prod; lighting/other circuits)
- Where: SHARED_SCOPE circuitNSchedule. PROVEN on demo-contactorModule: circuit1Schedule, same Tuya-style JSON, written 11 Feb 2025. Only one device exists in prod, so practically no OOH relevance today.

### 4. Tuya plugs/fryer switches (tuya Profile, 3,157 devices; Tongou and Owon relays)
- Where: device-side, mirrored into TB as TELEMETRY keys, not attributes. In a 30-device sample (page 40, so not first-created), keys: schedule on 10, cycle_time on 13, countdown_1 on 15. No schedule-like ATTRIBUTE keys on any of 10 attribute-sampled devices.
- Shape: opaque base64. Example gk-6176-fryer-1 schedule, refreshed 14 Oct 00:02Z, 40 bytes, decodes to eight 5-byte records [day mask, hour, minute, on/off, enable]: 97/06:45/off, 97/07:45/off, 97/08:45/on, 127/21:30/off, 127/23:30/off, 30/09:15/off, 30/10:15/off, 30/11:15/on. Matches SD-477's description of the Owon DP131 blob (5-byte records). DEDUCED medium: the byte meanings (day mask bit order, relay bit, last byte) are copied from SD-477 and not bench-verified by me; the values look odd (consecutive OFFs) so a decode error is plausible. cycle_time (Tongou) is a different record format (10 records [enable, week, start, end, on, off] minutes, big-endian u16, per SD-477 bench log); the sample I saw was empty (written 25 Sep 2025).
- Readable today: the raw blob YES (latest telemetry GET); a human-readable next-change NO until we write and test a decoder per product. SD-477 notes Tongou and Owon encodings are the only ones bench-proven; prod products can be mislabelled (risk O4), so choose decoder by product id, not name.
- Also note: dashboards hold state in the TB "Tuya Schedule Change" widget and CJ's Tuya Scheduler / IPS CSV pages write these (SD-477 section 8), so seven writers can overwrite each other.

### 5. Salus IT700 thermostats (salusDevice, 1,181 devices; heating)
- Where: device-held, published to TB as telemetry hex strings: heatSchedule1/2/3, coolSchedule1/2/3, schedule, scheduleEnable (1 = schedule on), scheduleType, programOperationMode, holdType (0 follow schedule, 2 hold). Sample of 25 IT700 named devices: 19 had heatSchedule1 refreshed on 14 Oct, 6 last on 10 Nov 2025 (stale or dormant); of 15 live ones 14 had scheduleEnable 1 and holdType 0, one had holdType 2.
- Shape: hex blob, e.g. heatSchedule1 "02000000150007002100093018001800210022001800ffff0500ff..." (value truncated here). I could NOT decode it: the obvious readings do not reproduce the setpoint steps seen on gk-6791-salusit700-1 on 13 Oct (06:01 21, 08:31 18, 17:01 21, 21:01 18, from RESEARCH-S1-S8) and that device's own blob is dated 10 Nov 2025. SD-477 section 10.5 also lists "IT700 HeatSchedule encoding not decoded" as an open risk. UNRESOLVED for next-change.
- Practical workaround that needs no decoder (DEDUCED medium): holdType 0 plus scheduleEnable 1 tells us the device is following its programme, and the history of heatingSetpoint/setPoint shows the daily step pattern, from which a "usual next change" could be inferred. That is inference, not a read of the programme.
- TB-level interface: the SD-477 reference doc says plainly "Salus IT700 and IT500: currently there is no Thingsboard schedule interface; scheduling is handled on the device itself and is not exposed via shared attributes." Writing a Salus schedule is not wired for any vendor (SD-446 status: IScheduleCommands implemented by no adapter; scheduleDesired appears once, as a comment).

### 6. Salus IT500 (about 730 devices, all dormant in prod per S1-S8)
- Where: Arrayent vendor cloud / device registers (A/B/C00-06, 6 setpoint slots per day per zone, 3 hot-water pairs per day per SD-477 section 5). No schedule keys found on IT500-style devices in the S1-S8 key lists (setPoint, currentSetpoint, mode, hotWaterOn, ...). Not readable from TB. Moot for OOH anyway while the fleet is dormant.

### 7. Intesis air-conditioning (airConditioningProfile, 246 devices)
- Where: the Intesis cloud calendar (portal API), executed by the cloud, not the unit (SD-477 section 5: "Runs on device? No"). No schedule-like attribute or telemetry key in the 10-device sample (keys: setpoint_desired, setpoint_reported, power, mode, fanSpeed ...). Not readable from TB. UNRESOLVED whether any existing Intesis programmes are used in the estate; would need the vendor portal API with the bridge's account, which is a Spencer/bridge action.

### 8. Lighting and outside lighting
- Outside lights are dusk-till-dawn via a built-in light sensor plus the Lighthouse switch (DISCOVERY_oohdash-111-112): there is no timetable to read. Where lighting is a Tuya relay or contactor circuit it falls under classes 3 or 4.

### 9. Site opening hours (the thing schedules are meant to follow)
- PROVEN: 284 "Property Schedule" assets (name pattern "Property Schedule_<id>_<site>") hold SERVER-scope weekDayWorkingHours: per weekday operation1 / serving / operation2 windows as [hour, minute], plus tz. Example Red Lion (Avebury): Monday operation1 11:00-11:30, serving 11:30-21:00, operation2 21:00-22:00; updated 13 May 2026. Linked by relation fromPropertyScheduleToProperty (to the pub asset) and fromCustomerToPropertySchedule (Greene King). One "Equipment Schedule" asset exists (Test Fryer, per-device weekDayWorkingHours plus offsets and overrideStrategy, linked to the device gk-pptestsite-fryer-1). SD-477 section 4.5 says old property data "was wrong at best and destructive at worst" and must not be treated as the operating schedule (D1).
- Useful for OOH as "is the site open now / when does it close" context, not as a device schedule. Readable today: YES.

## Where the SD-477 design leaves this (what is coming)
- SD-477 v0.3 (2 Oct) proposes one canonical RFC 5545-style `schedule` JSON attribute in SERVER_SCOPE on customer, property, machine-type profile and device, compiled into per-device `timeclock*` outputs: timeclockEffective, timeclockHorizon, timeclockState (Scheduled, Sending, In effect, At risk, Act now, Lapsed, Approximated, Drift), timeclockLoss. Nothing is built or live (SD-477 "Status: design only").
- When built, "next scheduled change" for any class is a read of timeclockEffective in TB, no vendor login needed. Boiler panels and PowerPause are explicitly excluded from the first phase ("TB-native" profile later), so their current attributes stay the source.

## What it would take to surface "next scheduled change" in the OOH dashboard
Per class, smallest first:
1. Boiler panels, PowerPause, contactor: add a read of SHARED_SCOPE keys to the existing TB read path (services/tb-device.js already reads attributes), a pure function (JSON + site timezone + loops mask) for next change, and display. Size S to M. Needs: Spencer to say the shape is stable across both boiler schemas (the data dictionary says two incompatible boiler schemas exist), and to confirm that empty means "no schedule".
2. Tuya plugs/fryers: add a per-product decoder (Tongou cycle_time, Owon DP131 base64) for the telemetry value, with golden tests. Size M. Blocked on a verified byte map from Spencer's bench (SD-477 lists byte 5, capacity and bit order as unverified).
3. Salus IT700: needs the HeatSchedule hex decoded, which nobody has done. Until then show "follows schedule / on hold" from scheduleEnable and holdType only. Size S for the indicator, L for a true next-change.
4. IT500, Intesis: not feasible from TB; wait for SD-477 timeclock outputs or a bridge read. Show "schedule not visible".
Cost/token and silent running: all reads are on-demand GETs when an operator opens a device; no new poller, daemon or token spend, nothing runs while idle (criteria met). Rate risk: do not sweep estates on a timer; read per device or per site view on demand, with caching, because prod TB returned 429/5xx under parallel scanning today.

## What this changes in the matrix and for Design
1. Add a "schedule visibility" column to the Rosetta matrix per class as above; mark Salus IT500 and Intesis "not visible", Salus IT700 and Tuya "opaque blob, no decoder", boiler panels and PowerPause "readable JSON".
2. Do not design against a Schedule Hub; it is engineer scheduling. Do not design against SD-477 timeclock keys yet; they do not exist.
3. Control caveat for Design: a schedule step can change a setpoint or switch while an OOH command is pending (S8 false-confirm risk). Reading holdType, scheduleEnable and the next change time lets the confirm rule ignore a scheduled step landing in the window.
4. Contract note: the OOH bridge payload keeps `schedule: null`; adding it is an additive change that needs Spencer's and the OOH contract owner's agreement (OOH_BRIDGE_CONTRACT).

## Coverage gaps (honest limits)
- Samples, not census: Tuya 30 of 3,157, IT700 25 of about 466 named, boilerControl 20 of 223, PowerPause 25 of 241, Intesis 10 of 246, contactor 1 of 1. Counts such as "14 of 25 non-empty" should not be extrapolated.
- Did not read the SD-477 round-trip detail for Intesis/Salus beyond the design table, the SD-479 spec beyond its header and keyword checks, or any GitHub repo; the bridge and timeclock-service source were not read. A GitHub code search for a schedule/scheduler service was not run in this pass (UNVERIFIED that none exists beyond SD-477 design).
- No Dev/UAT TB read. UAT Schedule Hub and IoT Hub UAT not opened (no need, wrong system for device schedules).
- The Salus blob decode and the Tuya byte map are not verified; the Tuya decode above is structural only.

## Residual questions for Spencer (one line each, with our default)
- Q-S13a: Confirm "Schedule Hub" is engineer job scheduling only and device schedules will first appear as SD-477 timeclock keys? Default: yes; we ignore the Schedule Hub for OOH.
- Q-S13b: For boiler panels, which of the two schemas (indexed outputNSchedule versus named CHZ1.schedule) is current, and is SHARED_SCOPE the source of truth with CLIENT_SCOPE the echo? Default: read SHARED_SCOPE, accept both naming styles, ignore if absent.
- Q-S13c: Can you give the verified byte map and day-mask bit order for Owon DP131 (schedule) and Tongou cycle_time so we can decode in the dashboard? Default: show "has schedule" only; no next-change for plugs until supplied.
- Q-S13d: Is the Salus IT700 heatSchedule1-3 hex decodable by the bridge team, and is the 10 Nov 2025 timestamp on some devices a stale publish? Default: show scheduleEnable/holdType only.
- Q-S13e: For Intesis and Salus IT500, is any schedule readable through the bridge without a vendor login, or must the bridge fetch it? Default: not visible.
- Q-S13f: Should the dashboard surface PowerPause empty schedules as "no schedule" (run always) or "unknown"? Default: "no schedule set" in neutral wording.
- Security note (not a question): intesisAccessToken is stored as a SERVER_SCOPE attribute on Intesis devices and is readable by our tenant-admin identity. Suggest it moves to the bridge secret store; we never read or log it.

## Sources
- Prod TB GETs 14 Oct 2026 (portal.lhlive.co.uk, v4.3.1.4PE): /api/deviceProfileInfos, /api/assetProfileInfos, /api/schedulerEvents, /api/tenant/assets by type, per-device keys and values for attributes and timeseries, /api/relations/info.
- Jira SD-477 (status ND Backlog; links SD-374, SD-198).
- SharePoint: SD-477-schedule-design.md v0.3; Thingsboard Appliances Where Schedules and Timeclocks have JSON type schema.docx (SD-446 and SD-477 folders); SD-446-vendor-implementation-status.md (verified 28 Sep); SD-479-Scheduling-Specification.md v1.3.
- Teams: Spencer 12 Oct 09:12-09:15Z (Schedule Hub UAT link; "scheduling uat" versus IoT Hub UAT); Spencer 10 Oct 17:53Z (prod IoT Hub live).
- OOH repo: docs/BRIDGE_CONTRACT.md lines 67 and 97; services/tb-device.js line 717; docs/project/OOH_DEVICE_DATA_DICTIONARY_2026-09-16.md lines 31 and 39.
- Scripts used (no secrets): C:/harness-runs/iot-ooh-dash/research/s13/*.mjs and their .out files.
