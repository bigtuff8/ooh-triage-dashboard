# OOH Dashboard — Data Dictionary

**Project:** Zendesk Integration / OOH Dashboard
**Date:** 21 March 2026
**Purpose:** Map every data point in the OOH Dashboard UI to its source system. Confirmed Zendesk fields include field IDs. Everything else is flagged for investigation.

---

## Source System Key

| Code | System | Status |
|------|--------|--------|
| **ZD** | Zendesk API (existing integration, confirmed) | Available now |
| **TB** | ThingsBoard / Lighthouse (requires investigation) | Not yet integrated |
| **SMS** | SMS Gateway (Twilio / Azure Comms / other) | Not yet selected |
| **APP** | Dashboard application state / local config files | Available now |
| **NEW** | New functionality — doesn't exist anywhere yet | Needs building |

---

## 1. Intake Form (Call Logging)

Captured by the OOH agent at the start of each call.

| Field | Required | Source | Zendesk Field ID | Notes |
|-------|----------|--------|-------------------|-------|
| **Site** | Yes | **ZD** | `11405878329244` | Dropdown, ~290 options. Loaded via `/api/zendesk/field-options/11405878329244`. Format: `brand::subBrand::siteName` |
| **Caller Name** | Yes | **ZD** | Ticket `requester_id` → user name | Requester is the person who raised the ticket. New callers = new Zendesk user. |
| **Caller Role** | No | **NEW** | — | Not in Zendesk. Options: GM, AGM, Chef, Staff, Contractor, Other. Could be stored as internal note or new custom field. |
| **Contact Phone** | Yes | **ZD** | User `phone` field on requester | Stored on the Zendesk user record. |
| **Contact Email** | No | **ZD** | User `email` field on requester | Stored on the Zendesk user record. |
| **Alternative Contact** | No | **NEW** | — | Not in Zendesk. Would need to be stored as internal note text or new custom field. |
| **Urgency / Priority** | Yes | **ZD** | Ticket `priority` | Zendesk native field. Values: `urgent`, `high`, `normal`, `low`. Mapped in UI to: Trade Critical=urgent, Comfort=high, H&S=urgent, Advisory=normal. |

### Investigation needed:
- **Caller Role** — decide: new Zendesk custom field, or captured in ticket notes only?
- **Alternative Contact** — same decision

---

## 2. Ticket Data (during triage and after resolution)

| Field | Source | Zendesk Field ID | Notes |
|-------|--------|-------------------|-------|
| **Ticket ID** | **ZD** | `id` | Auto-generated on ticket creation |
| **Subject** | **ZD** | `subject` | Auto-populated from incoming call / editable |
| **Status (system)** | **ZD** | `status` | Zendesk native: new, open, pending, hold, solved, closed |
| **Status (25-step custom)** | **ZD** | `custom_status_id` | See status map below. OOH relevant: Triage, Investigating, Escalated to EM, Resolved |
| **Priority** | **ZD** | `priority` | urgent, high, normal, low |
| **Assigned Agent** | **ZD** | `assignee_id` → user lookup | OOH agents won't own tickets — this stays as IoT team member or unassigned |
| **Organization / Client** | **ZD** | `organization_id` → org lookup | Greene King, McDonalds, Watercare, etc. |
| **Created Timestamp** | **ZD** | `created_at` | ISO 8601 |
| **Updated Timestamp** | **ZD** | `updated_at` | ISO 8601 |
| **Tags** | **ZD** | `tags[]` | Array of strings. Display only in dashboard. |
| **Equipment L1** | **ZD** | `25999250599964` | Tagger (read-only due to Zendesk API limitation). Categories: Warewash, Refrigeration, Kitchen Appliance, Power Pause, Sensors, Networking, HVAC, Schedule Change, Not Applicable |
| **Equipment L2** | **ZD** | `25999054084252` | Text field. Pipe-separated format: `L1: Cat | Sub | Problem: Type | N/A: Reason`. Stores all categorisation data. |
| **Root Cause** | **ZD** | `25999085692060` | Tagger. Set on resolution by IoT team, not OOH. |
| **Root Cause Sub** | **ZD** | `25999091554204` | Tagger. Set on resolution by IoT team, not OOH. |
| **Problem Indication** | **ZD** | `26210220997660` | Tagger. Could be auto-set by triage flow (e.g., Device Offline, Customer Reported Issue). |
| **Follow-up Date** | **ZD** | `26074112194076` | Date. Used for callback scheduling. |
| **Site (resolution field)** | **ZD** | `11405878329244` | Required for resolution. Same as intake site dropdown. |
| **Topic** | **ZD** | `11405886606364` | Dropdown. Required for resolution. |
| **Visibility** | **ZD** | `18295618747164` | Multiselect. Required for resolution. |

### Custom Status IDs (relevant to OOH)

| ID | Name | When used by OOH |
|----|------|-------------------|
| `25999053375260` | Triage | Ticket created from call — initial state |
| `25999053444508` | Investigating | Triage in progress |
| `25999056203932` | Awaiting Remote Fix | OOH agent applying a pocket change |
| `25999081452188` | Awaiting Customer Action | Site asked to check fuse board etc. |
| `25999056432284` | Escalated to EM | Sent to escalation manager |
| `25999081650076` | Sent to Repairs Admin | Routed to GK Repairs |
| `25999081709724` | Sent to Network | Routed to IoT team / Network Engineers |
| `25999082641308` | Resolved | Triage completed, issue resolved by OOH |

---

## 3. Comments & Timeline

| Field | Source | Notes |
|-------|--------|-------|
| **Comment Text** | **ZD** | `/tickets/{id}/comments.json` — array of comments |
| **Comment Author** | **ZD** | `author_id` → user lookup |
| **Comment Timestamp** | **ZD** | `created_at` |
| **Comment Visibility** | **ZD** | `public` boolean — true=public, false=internal |
| **Activity Code** | **ZD** | Detected from comment body prefix or auto-tagged. Codes: CC, CE, ACS, ACM, ACX, AE, RFX, ESC, NFA, REV |
| **Attachments** | **ZD** | `attachments[]` on each comment — content_url, file_name, content_type, size |
| **Audit Trail** | **ZD** | `/tickets/{id}/audits.json` — field changes, status transitions, assignments |

### OOH-specific comment types (NEW — auto-generated by triage):

| Comment Type | Source | Content |
|-------------|--------|---------|
| **Triage Notes** | **NEW** | Auto-generated from chat conversation. Captures: issue category, device checked, live data snapshot, action taken. |
| **Override Reason** | **NEW** | Free text from agent capturing why the site requested the override. Stored as internal note. |
| **Escalation Context** | **NEW** | Auto-generated: reason for escalation, contractor details if applicable, triage steps already taken. |
| **Resolution Summary** | **NEW** | Auto-generated: what was done, what auto-reverts, what review ticket was created. |

---

## 4. Site Data

| Field | Source | Zendesk Field ID | Notes |
|-------|--------|-------------------|-------|
| **Site Name** | **ZD** | Part of `11405878329244` options | Extracted from dropdown option name via `parseSiteName()` |
| **Site Code / House ID** | **ZD** | Part of `11405878329244` options | Embedded in option value (e.g., `gk_fi_whistling_goose_6886`) |
| **Client / Brand** | **ZD** | Part of `11405878329244` options | First segment of `::` delimited name |
| **Site Address** | **TB?** | — | Not in Zendesk. May be in ThingsBoard site entity. Investigate. |
| **Site Postcode** | **TB?** | — | Not in Zendesk. May be in ThingsBoard site entity. Investigate. |
| **Repeat Caller Count** | **ZD** | Computed | Count of tickets for this site in last 14/30 days. Computed from ticket search: `type:ticket fieldvalue:11405878329244_siteValue created>30daysago` |

### Investigation needed:
- **Site Address / Postcode** — where is this held? ThingsBoard entity attributes? Commissioning data? Separate spreadsheet?

---

## 5. Device Data (Site Panel & Triage Live Data)

**None of this is in Zendesk.** All device/telemetry data requires ThingsBoard or the underlying control platform.

| Field | Source | Purpose in UI | Notes |
|-------|--------|---------------|-------|
| **Asset Inventory** | **TB** | Device hierarchy in sidebar (Power Pause, Heating, Monitoring, Connectivity) | ThingsBoard device list per site/tenant. Need to understand: entity structure, how sites map to device groups. |
| **Device Online/Offline** | **TB** | Status dots (green/red) per device | ThingsBoard device `active` attribute or last telemetry timestamp. |
| **Device Last Seen** | **TB** | "Offline since 18 Feb" in triage | ThingsBoard `lastActivityTime` on device entity. |
| **Current Temperature** | **TB** | Live reading in triage (e.g., 17.4°C) | ThingsBoard telemetry key — likely `temperature` or similar. Need to identify exact key names. |
| **Setpoint Temperature** | **TB** | Target temp in triage (e.g., 21°C) | ThingsBoard attribute or telemetry. May be on a different entity (controller vs sensor). |
| **Heating Active (Y/N)** | **TB** | "Heating: Active/Inactive" in triage | ThingsBoard telemetry — likely derived from valve state or call-for-heat signal. |
| **Flow Temperature** | **TB** | Boiler flow temp (e.g., 48°C) | ThingsBoard telemetry on boiler sensor. |
| **Power State (On/Off)** | **TB** | Equipment on/off status | ThingsBoard telemetry on Tuya/Tongou devices — power consumption or switch state. |
| **Schedule (per device)** | **TB?** | Schedule grid (Mon-Sun on/off times) | **Investigate:** where are schedules stored? ThingsBoard? Tuya cloud? Local device config? |
| **Gateway Status** | **TB** | "IoT Gateway: Online" in sidebar | ThingsBoard gateway device entity. |
| **WiFi/Connectivity** | **TB** | "GK WiFi: OK" in sidebar | May be inferred from gateway connectivity or separate monitoring. |
| **Energy Consumption** | **TB** | "Energy: Live" in monitoring section | ThingsBoard telemetry from Power Pause current sensors. |

### Critical investigation questions for ThingsBoard session:

1. **Entity structure** — How are sites, devices, and assets organised? Tenant → Customer → Device? Asset hierarchy?
2. **Telemetry keys** — What are the exact key names for temperature, setpoint, power state, flow temp?
3. **Device types** — How does ThingsBoard distinguish between a Tongou, a Salus thermostat, a Dragino gateway?
4. **Schedules** — Where are device schedules stored and managed? ThingsBoard rule chains? Tuya cloud? Device firmware?
5. **Control path** — To apply a setpoint change or device override, what's the API call chain? ThingsBoard → ? → Device?
6. **Site-to-device mapping** — How do you go from "Whistling Goose 6886" to a list of its devices?

---

## 6. Control Actions (Pocket Changes)

**None of this exists yet.** These are new capabilities that require integration with the control platform.

| Action | What it does | Target System | Notes |
|--------|-------------|---------------|-------|
| **Raise/Lower Setpoint** | Adjust heating zone target temp | **TB → ?** | Need to understand: does ThingsBoard send RPC to the Salus controller? Or does it go via another platform? |
| **Equipment Override (On)** | Turn on a Power Pause device | **TB → Tuya?** | Tongou/Tuya devices — does ThingsBoard control these directly, or via Tuya Cloud API? |
| **Equipment Override (Off)** | Turn off a Power Pause device | **TB → Tuya?** | Same question |
| **DHW Override** | Force domestic hot water valve open | **TB → ?** | What controls the DHW valve? Salus? Boiler integration? |
| **Schedule Temp Change** | Modify on/off time for a device | **TB → ?** | Where are schedules managed? Can they be changed via API? |
| **Auto-Revert** | Revert a pocket change after X hours | **NEW** | Needs a timer mechanism. Options: ThingsBoard scheduled RPC, dashboard cron job, or rule chain. |

### Critical investigation questions:

1. **What does ThingsBoard actually control?** Is it a read-only aggregator, or does it send commands to devices?
2. **Tuya API** — Do Tongou Power Pause devices respond to Tuya Cloud API commands? Can we bypass ThingsBoard for control?
3. **Salus API** — Do heating controllers have their own API, or is everything via ThingsBoard?
4. **Auto-revert mechanism** — What's the safest way to implement time-limited changes?
5. **Audit logging** — When a change is made via API, is it logged in ThingsBoard? Or do we need to log it ourselves?

---

## 7. Escalation Workflow

| Field | Source | Notes |
|-------|--------|-------|
| **Escalation Reason** | **NEW** | Selected by agent from predefined options (Contractor on site, Equipment fault, Safety concern, Triage didn't resolve). Stored as internal comment. |
| **Contractor Name** | **NEW** | Free text, captured when reason = "Contractor on site". Stored in comment. |
| **Contractor Phone** | **NEW** | Free text. Stored in comment. |
| **Contractor Company** | **NEW** | Free text. Stored in comment. |
| **Escalation Manager** | **APP** | From `data/escalation-rules.json` → `escalationEmail` (currently Sam Day). |
| **SMS Notification** | **SMS** | New capability. Send ticket link + summary to escalation manager mobile. |
| **45-min Timeout** | **NEW** | Timer that auto-routes if no response. Needs: timer mechanism + routing logic. |
| **Auto-Route Target** | **APP** | From escalation-rules.json or new routing config. Contacts for: GK Repairs Admin, Network Engineers, SCC, Flowrite. |
| **Escalation Status** | **ZD** | Custom status `25999056432284` (Escalated to EM). Tracked via status transitions. |

### Existing escalation contacts (from `data/escalation-rules.json`):

| Field | Current Value |
|-------|---------------|
| Escalation Email | `sam.day@sccuk.com` |
| Escalation CC | (empty) |
| Routing CC | `jamesbrown@airedale-group.co.uk` |
| Overdue Hours | 24 |

### Missing contacts (need populating):

| Team | Purpose | Contact |
|------|---------|---------|
| GK Repairs Admin | Boiler, plumbing, electrical | **TBC** |
| Network Engineers | Lighthouse hardware, firmware | IoT team direct — **TBC** |
| SCC | Kitchen equipment contractors | **TBC** |
| Flowrite | Refrigeration contractors | **TBC** |

---

## 8. Callback Tracking

| Field | Source | Notes |
|-------|--------|-------|
| **Callback Site** | **ZD** | From ticket site field |
| **Callback Reason** | **ZD** | From ticket subject/comment |
| **Callback Contact** | **ZD** | From ticket requester phone |
| **Callback Due** | **ZD** | `26074112194076` (Follow-up Date custom field) |
| **Callback Status** | **NEW** | Not currently tracked in Zendesk. Options: add a tag (`callback_due`, `callback_complete`) or use follow-up date presence as indicator. |

---

## 9. Shift Notices

| Field | Source | Notes |
|-------|--------|-------|
| **Notice Title** | **NEW** | Not in Zendesk. Needs a new data store — could be a simple JSON file, a Zendesk trigger/automation, or a new API endpoint. |
| **Notice Body** | **NEW** | Same |
| **Notice Author** | **NEW** | IoT team member who posted it |
| **Notice Timestamp** | **NEW** | When posted |
| **Notice Expiry** | **NEW** | When to auto-hide |
| **Notice Type** | **NEW** | Warning, New, Info |

### Options for storage:
- **Simple:** JSON file on server (`data/shift-notices.json`) managed via a simple admin UI
- **Zendesk-native:** Create notices as a specific ticket type/tag, query via search
- **Dashboard API:** New endpoint `POST /api/notices`, stored in local DB or file

---

## 10. Application Config (existing)

| Data | Source | File |
|------|--------|------|
| Team members | **APP** | `data/team.json` — name, initials, role, color, Zendesk user ID |
| SLA targets | **APP** | `data/escalation-rules.json` — P1: 1h/4h, P2: 4h/24h, P3: 8h/72h, P4: 24h/168h |
| Portfolio clients | **APP** | `data/portfolio.json` — org IDs, names, priorities |
| Escalation routing | **APP** | `data/escalation-rules.json` — email, CC, overdue threshold |

---

## Summary: What Needs Investigating

| # | Question | Blocks |
|---|----------|--------|
| 1 | **ThingsBoard entity structure** — how sites map to devices | Device panel, triage live data, all control actions |
| 2 | **ThingsBoard telemetry keys** — exact key names for temp, setpoint, power, flow | Triage live data cards |
| 3 | **Control path** — ThingsBoard → ? → physical device | All pocket changes (setpoint, override, DHW) |
| 4 | **Schedule storage** — where are device schedules held and can they be read/written via API? | Schedule viewing, schedule-based triage logic |
| 5 | **Site metadata** — where is address/postcode stored? | Site lookup, intake form |
| 6 | **Tuya API access** — can Power Pause devices be controlled via Tuya Cloud independently? | Kitchen and lighting overrides |
| 7 | **Salus API access** — can heating setpoints be changed via Salus API independently? | Heating setpoint adjustments |
| 8 | **Auto-revert mechanism** — how to implement time-limited changes safely | All pocket changes |
| 9 | **SMS gateway selection** — which service for escalation notifications? | Escalation workflow |
| 10 | **Caller Role / Alt Contact** — new Zendesk field or notes-only? | Intake form |

---

---

## 11. Triage Conversation Map — Data Requirements Per Step

Every triage state in the mockup is listed below with the exact data the bot needs to drive that conversation. This maps the "what the bot says/shows" to "what system provides it."

### 11.1 Common / Entry

| State | Bot Action | Data Required | Source | Read/Write |
|-------|-----------|---------------|--------|------------|
| `issue_select` | Shows site name, repeat caller count, presents 5 issue category options | Site name, house ID, brand (from intake) | **ZD** (site field options) | Read |
| | | Ticket count for this site in last 30 days | **ZD** (ticket search by site field value) | Read |

### 11.2 Heating Path

| State | Bot Action | Data Required | Source | Read/Write |
|-------|-----------|---------------|--------|------------|
| `heat_type` | Asks hot or cold. Shows number of zones. | Count of heating zones at this site | **TB** (device list filtered by type=heating) | Read |
| `heat_cold_zone` | Lists zone names for selection | Zone names (e.g., Restaurant, Bar, Accommodation) | **TB** (heating device entities per site) | Read |
| `heat_cold_check_rest` | Shows live data card: current temp, setpoint, heating active, flow temp | **Current temperature** — sensor telemetry | **TB** telemetry key (investigate) | Read |
| | | **Setpoint** — target temperature | **TB** attribute or telemetry (investigate) | Read |
| | | **Heating active** (calling for heat Y/N) | **TB** telemetry — valve state or heat demand signal | Read |
| | | **Flow temperature** — boiler output temp | **TB** telemetry — boiler sensor (investigate) | Read |
| | Recommends setpoint boost | **Allowable setpoint range** — max/min guardrails | **APP** config or **TB** device attribute | Read |
| | Captures override reason | Agent free text input | **NEW** → stored as **ZD** internal comment | Write |
| | Applies setpoint change | **Write setpoint** to heating controller | **TB → ? → Salus/boiler controller** | **Write** |
| `heat_cold_check_bar` | Same live data card | Same telemetry as above, for Zone 2 | **TB** | Read |
| `heat_cold_check_accom` | Same + BDM approval warning | Same telemetry + **BDM approval threshold** per zone | **TB** attribute or **APP** config | Read |
| `heat_cold_check_all` | Gateway status + all zone temps | **Gateway online/offline** | **TB** gateway device `active` status | Read |
| | | All zone temperatures in one call | **TB** multi-device telemetry query | Read |
| `heat_hot_zone` | All zone temps + identifies overheating zone | Same as check_all + **fallback mode detection** | **TB** — gateway connection history, device fallback flag | Read |
| | Lowers setpoint | **Write setpoint** (lower) | **TB → ? → controller** | **Write** |
| `heat_gw_escalate` | Escalation — gateway offline | Gateway last seen timestamp | **TB** `lastActivityTime` | Read |
| | Sends SMS to escalation manager | Escalation manager phone number | **APP** config | Read |
| | | SMS send capability | **SMS** gateway | **Write** |
| `heat_done` | Creates P1 review ticket | Ticket creation in Zendesk | **ZD** create ticket API | **Write** |
| | Auto-revert timer | Timer/scheduler for reverting setpoint | **NEW** mechanism | **Write** |

### 11.3 Kitchen Equipment Path

| State | Bot Action | Data Required | Source | Read/Write |
|-------|-----------|---------------|--------|------------|
| `kit_which` | Lists kitchen equipment at this site | **Device inventory** — Power Pause devices of type kitchen | **TB** device list per site, filtered by category | Read |
| `kit_fryer` | Shows fryer status, power pause status, schedule | **Device power state** (on/off) per fryer | **TB** telemetry — Tuya switch state or power consumption | Read |
| | | **Power Pause device status** (online/offline) | **TB** Tongou device status | Read |
| | | **Current schedule** — when were fryers set to turn off? | **TB or Tuya** schedule config | Read |
| `kit_wash` | Glasswasher/dishwasher status | **Device status** per wash device | **TB** Tuya device telemetry | Read |
| | | **Device last offline timestamp** | **TB** device connection history | Read |
| `kit_merrychef` / `kit_extract` | Single device status + schedule | Same as fryer | **TB** | Read |
| | Extractor: gas interlock warning | **Interlock relationship** — which devices are linked? | **TB** device relationship or **APP** config | Read |
| `kit_override_*` | Applies equipment override | **Write: turn on Power Pause device** | **TB → Tuya Cloud?** | **Write** |
| | Captures override reason | Agent free text input | **NEW** → **ZD** internal comment | Write |
| | Auto-revert after X hours | Timer/scheduler | **NEW** mechanism | **Write** |
| `kit_done` | Creates review ticket | Ticket creation | **ZD** | **Write** |

### 11.4 Lighting Path

| State | Bot Action | Data Required | Source | Read/Write |
|-------|-----------|---------------|--------|------------|
| `light_which` | Lists external lighting devices at site | **Device inventory** — Power Pause devices of type lighting | **TB** device list per site | Read |
| `light_carpark` | Shows Tongou status, schedule | **Tongou device status** (online/offline) | **TB** device status | Read |
| | | **Schedule** — when should lights be on? | **TB or Tuya** schedule | Read |
| | Turns on lights remotely | **Write: switch Tongou device on** | **TB → Tuya?** | **Write** |
| `light_festoon` | Shows device offline + last seen date | **Device last seen** timestamp | **TB** `lastActivityTime` | Read |
| | Guides manual override | **Does this site have a manual override panel?** Knowledge of physical site layout | **APP** config or **TB** device attribute | Read |
| `light_notours` | Scope check — internal lights not ours | **Scope data** — what Lighthouse controls | **TB** device inventory (absence = not ours) | Read |

### 11.5 Hot Water Path

| State | Bot Action | Data Required | Source | Read/Write |
|-------|-----------|---------------|--------|------------|
| `hw_check` | Shows DHW status, temp, setpoint, valve state | **DHW temperature** | **TB** telemetry | Read |
| | | **DHW setpoint** | **TB** attribute/telemetry | Read |
| | | **DHW valve state** (open/closed) | **TB** telemetry — valve actuator | Read |
| `hw_no_hot` | Confirms DHW is active = not our fault | Same as above — if active, it's a boiler/plumbing issue | **TB** | Read |
| `hw_too_hot` | Lowers DHW setpoint as safety measure | **Write: lower DHW setpoint** | **TB → ? → controller** | **Write** |
| `hw_intermittent` | Forces DHW valve open continuously | **Write: override DHW valve** | **TB → ? → controller** | **Write** |

### 11.6 Scope / "Something Else" Path

| State | Bot Action | Data Required | Source | Read/Write |
|-------|-----------|---------------|--------|------------|
| `other_scope` | Presents common non-LH issues as options | Static list — no dynamic data needed | **APP** (hardcoded) | — |
| `other_boiler` | Confirms boiler not LH-controlled | **Scope data** — is boiler in device list? | **TB** device inventory | Read |
| `other_electrical` | Checks if partial = our device offline | **All device statuses** at site | **TB** multi-device status query | Read |
| `other_fridge` | Confirms fridge/freezer not LH-controlled | **Scope data** | **TB** device inventory | Read |
| `other_unknown` | Shows full scope list | **Complete device inventory** for site | **TB** device list | Read |

### 11.7 Escalation (from any path)

| State | Bot Action | Data Required | Source | Read/Write |
|-------|-----------|---------------|--------|------------|
| Any escalation | Updates ticket status to "Escalated to EM" | **Write: update custom_status_id** | **ZD** ticket update | **Write** |
| | Adds escalation context as internal comment | **Write: add comment** with triage notes | **ZD** comment create | **Write** |
| | Sends SMS to escalation manager | Manager phone number | **APP** config | Read |
| | | SMS send capability | **SMS** gateway | **Write** |
| | Starts 45-min timeout | Timer mechanism | **NEW** | **Write** |
| | Auto-route on timeout | Route to team contact | **APP** config + **ZD** ticket update | **Write** |
| | Notify agent of outcome | Notification mechanism | **NEW** (dashboard push/poll) | Read |

### 11.8 Resolution (from any path)

| State | Bot Action | Data Required | Source | Read/Write |
|-------|-----------|---------------|--------|------------|
| Any resolution | Updates ticket status to "Resolved" | **Write: update custom_status_id** to `25999082641308` | **ZD** ticket update | **Write** |
| | Adds resolution summary as internal comment | **Write: add comment** | **ZD** comment create | **Write** |
| | Sets site field on ticket (if not already) | **Write: update custom field** `11405878329244` | **ZD** ticket update | **Write** |
| | Creates P1 review ticket (if pocket change was applied) | **Write: create ticket** with reference to original | **ZD** ticket create | **Write** |

---

## 12. Triage Data Summary — What You Need to Find

Consolidated list of every unique data point the triage needs, grouped by investigation area.

### From ThingsBoard (READ)

| # | Data Point | Used In | Priority |
|---|-----------|---------|----------|
| 1 | **Site → device list** (what's installed) | Every triage path, sidebar, scope checks | Critical |
| 2 | **Device online/offline status** | Every path — first check before anything | Critical |
| 3 | **Device last seen timestamp** | Offline device triage (festoon, gateway) | Critical |
| 4 | **Current temperature** (per heating zone) | Heating triage | Critical |
| 5 | **Setpoint temperature** (per heating zone) | Heating triage | Critical |
| 6 | **Heating active / call for heat** signal | Heating triage | Critical |
| 7 | **Flow temperature** (boiler output) | Heating triage — condenser diagnosis | High |
| 8 | **Power state** (on/off per Power Pause device) | Kitchen + lighting triage | Critical |
| 9 | **Device schedule** (on/off times per day) | Kitchen + lighting — "schedule ended" logic | High |
| 10 | **DHW temperature + setpoint + valve state** | Hot water triage | High |
| 11 | **Gateway status** (online/offline) | "Whole pub cold" escalation path | Critical |
| 12 | **Device type/category** | Filtering devices into hierarchy (PP, Heating, Monitoring) | High |
| 13 | **Device-to-device relationships** (e.g., extractor → gas interlock) | Extractor fan triage warning | Medium |

### From ThingsBoard or Control Platform (WRITE)

| # | Action | Used In | Priority |
|---|--------|---------|----------|
| 14 | **Set heating setpoint** | Heating boost/lower | Critical |
| 15 | **Turn on/off Power Pause device** | Kitchen override, lighting override | Critical |
| 16 | **Override DHW valve** | Hot water override | High |
| 17 | **Auto-revert** (timed reversal of above) | All pocket changes | Critical |

### From Zendesk (READ + WRITE — already available)

| # | Action | Used In | Confirmed |
|---|--------|---------|-----------|
| 18 | Read site dropdown options | Intake site selection | ✅ Field `11405878329244` |
| 19 | Read ticket comments | Timeline, comment view | ✅ `/tickets/{id}/comments.json` |
| 20 | Read ticket audits | Timeline system events | ✅ `/tickets/{id}/audits.json` |
| 21 | Search tickets by site | Repeat caller count | ✅ Search API |
| 22 | Create ticket | Auto-create on call, P1 review | ✅ POST `/tickets.json` |
| 23 | Update ticket fields | Status, priority, site, custom fields | ✅ PUT `/tickets/{id}.json` |
| 24 | Add comment (internal) | Triage notes, override reason, escalation | ✅ PUT `/tickets/{id}.json` with comment |
| 25 | Read users | Caller lookup, agent names | ✅ `/users.json` |
| 26 | Read organizations | Client name | ✅ `/organizations.json` |

### New Systems Needed

| # | Capability | Used In | Options |
|---|-----------|---------|---------|
| 27 | **SMS send** | Escalation notification | Twilio, Azure Communication Services, MessageBird |
| 28 | **Timer/scheduler** | Auto-revert, 45-min escalation timeout | Server-side cron, ThingsBoard rule chain, or dashboard scheduled task |
| 29 | **Shift notices storage** | Notice board | JSON file, dashboard API, or Zendesk custom object |

---

## 10. Equipment Images & Visual Assets

**Source:** Extracted from `OOH Dash Reference Docs/Flaming Grill scope of Works V1.0.pptx`
**Location:** `equipment-images/catalogued/`
**Full catalogue:** `EQUIPMENT_IMAGE_CATALOGUE.md`
**Date added:** 2026-03-28

### Heating & Hot Water

| Image File | Equipment | TB Device Type | Used In Flow | Display Name |
|------------|-----------|---------------|-------------|-------------|
| `salus-it700-thermostat.png` | Salus IT700 smart thermostat (LCD, temperature, icons) | `salusDevice` | tooCold, controlsIssue, heatingStuck | Heating Zone |
| `salus-receiver.png` | Salus receiver (Auto/Manual, On/Off switches) | `salusDevice` (gateway) | controlsIssue, heatingStuck | Heating Gateway |
| `boiler-unit.jpeg` | Wall-mounted gas boiler (on-site photo) | `boilerControl` | noHotWater | Boiler Controller |
| `old-thermostat-dial.jpeg` | Old dial thermostat (being replaced by Salus) | — | Reference only | — |
| `honeywell-programmer.jpeg` | Honeywell programmer (being replaced) | — | Reference only | — |

### Kitchen Equipment / PowerPause

| Image File | Equipment | TB Device Type | Used In Flow | Display Name |
|------------|-----------|---------------|-------------|-------------|
| `powerpause-sticker.jpeg` | PowerPause sticker — "Power controlled automatically" + QR | — (label) | kitchenEquip, ovensGrills | — |
| `lighthouse-qr-label.jpeg` | Lighthouse monitoring label — "Appliance monitored remotely" + QR | — (label) | All flows (reference) | — |
| `tongou-wifi-switch.png` | Tongou TO-Q-SY1-JWT WiFi switch (DIN rail, 16A) | `tuya Profile` | kitchenEquip, externalLighting, keepsTurningOff | Fryer, Grill, Merrychef, etc. |
| `isolator-switch.jpeg` | ESR rotary isolator (red/yellow, IP65) | — (infrastructure) | kitchenEquip (interlock check) | — |
| `contactor-hager.jpeg` | Hager ESC 425 contactor (25A) | — (infrastructure) | kitchenEquip (contactor fault) | — |

### External Lighting & Heating

| Image File | Equipment | TB Device Type | Used In Flow | Display Name |
|------------|-----------|---------------|-------------|-------------|
| `external-light.png` | LED external light fixture (pole-mounted) | `tuya Profile` (externallighting) | externalLighting | External Lights |
| `sangamo-timeclock.jpeg` | Sangamo 24hr timeclock (replaced by Tongou) | — | Reference only | — |

### Refrigeration & Cellar

| Image File | Equipment | TB Device Type | Used In Flow | Display Name |
|------------|-----------|---------------|-------------|-------------|
| `door-contact-sensor.png` | Magnetic door contact (surface mount) | `door profile` | fridgeIssue (door check) | Door Sensor |
| `lorawan-sensor-node.png` | Dragino SN50v3-LB LoRaWAN sensor node | `cellar profile`, `fridge and freezer profile` | fridgeIssue (T2 sensor data) | Temperature Sensor |

### Networking & Infrastructure

| Image File | Equipment | TB Device Type | Used In Flow | Display Name |
|------------|-----------|---------------|-------------|-------------|
| `r10a-gateway.png` | R10A Modbus gateway (black, DIN rail) | `R10A Modbus Gateway` | gatewayOffline | Kitchen/Cellar/AC Gateway |
| `dragino-gateway.jpeg` | Dragino LoRaWAN gateway (white, dual antennas) | — (LoRaWAN infra) | gatewayOffline ("small box with lights") | LoRaWAN Gateway |
| `pmac211-meter.png` | Pilot PMAC211 energy meter (DIN rail) | `meterOnlyProfile` | — (not OOH relevant) | — |
| `distribution-board.jpeg` | Main distribution board (on-site photo) | — (infrastructure) | keepsTurningOff (MCB check), wontTurnOn | — |
| `eaton-panel-board.jpeg` | Eaton Memshield 3 panel board (closed) | — (infrastructure) | Reference only | — |
| `mcb-breaker.jpeg` | CHINT NB1-63 3-phase MCB | — (infrastructure) | kitchenEquip (MCB check) | — |
| `mcb-3phase.png` | RS PRO 3-phase MCB | — (infrastructure) | kitchenEquip (MCB check) | — |
| `electrical-enclosure.jpeg` | IP65 electrical enclosure (PowerPause housing) | — (infrastructure) | Reference only | — |

### Warewash

| Image File | Equipment | TB Device Type | Used In Flow | Display Name |
|------------|-----------|---------------|-------------|-------------|
| `belimo-flow-meter.jpeg` | Belimo water flow meter (orange, inline) | `warewashMonitoringProfile` | — (not OOH relevant) | — |

### Branding & Reference

| Image File | Shows | Used In |
|------------|-------|---------|
| `lighthouse-logo.png` | Lighthouse logo (full) | App branding |
| `lighthouse-logo-small.png` | Lighthouse logo (compact) | Sidebar/badges |
| `site-labels-sheet.jpeg` | Complete site label sheet (all equipment panel names) | Reference — naming conventions |

### Gaps — Images Not Yet Available

| Equipment | Needed For | How To Source |
|-----------|-----------|--------------|
| **Interlock panel** (green light + green button) | kitchenEquip T1 flow — "Can you see a panel with a green light?" | Photo from IoT team at any installed site |
| **Boiler error display** | noHotWater, controlsIssue — "Any error codes on the display?" | Photo of boiler with digital error readout |
| **Salus IT700 icon legend** | controlsIssue — "Walk through the icons: Wi-Fi, battery, flame" | Annotated diagram of IT700 display icons |
| **Walk-in fridge/freezer** (exterior) | fridgeIssue — monitoring scope context | On-site photo or stock image |
| **Patio heater** | externalHeating flow | Stock image of typical pub patio heater |
| **Festoon lighting** | externalLighting — "festoon" reference | Stock image of outdoor string lighting |

---

*This document should be used as the investigation checklist for the ThingsBoard API session.*
