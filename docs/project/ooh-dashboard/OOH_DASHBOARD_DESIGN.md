# OOH Agent Dashboard — Design Document

**Project:** Zendesk Integration / OOH Dashboard
**Date:** 21 March 2026
**Author:** James Brown / Digital Delivery
**Status:** Discovery → Design
**Predecessor:** OOH_CAPABILITY_ANALYSIS.md (21 Mar 2026), initial-findings.md (18 Mar 2026)

---

## 1. Purpose

Provide the Out of Hours (OOH) call handling team with a self-service UI that allows them to:

1. Receive and manage inbound calls with structured ticket data
2. Triage issues using guided flows — without subjective guesswork
3. Make temporary, safe control changes to resolve common issues immediately
4. Escalate genuinely complex issues with rich context and priority routing
5. Eliminate the Teams/WhatsApp hand-off to the IoT support team for resolvable issues

**Target outcome:** ~66% of OOH contacts resolved by the handler without IoT team involvement (based on capability analysis of 91 historic incidents).

---

## 2. Technical Context

### Existing Platform
- **IoT Support Dashboard** — live at `zendesk-uat.airedale-api.co.uk`
- **Stack:** Node.js/Express backend, vanilla JS frontend, Zendesk API proxy
- **Design system:** Inter font, purple primary (#594AE2), Material Icons Outlined
- **Deployment:** Push to `master` = instant deploy to UAT (~90s)
- **Auth:** Planned EntraID SSO (see AUTH_DESIGN.md)

### Integration Points (to be investigated)
- **Zendesk API** — ticket creation/retrieval on inbound call (existing)
- **ThingsBoard API** — site data, device status, setpoints, overrides, schedules (NEW — requires separate investigation session)
- **Telephony** — auto-pop ticket on call receipt (further investigation needed — may influence whether Zendesk remains in the chain)
- **SMS Gateway** — escalation notifications to on-call manager (NEW)

### Deployment Assumption
This UI would be exposed via the same URL as the existing dashboard, as an additional view mode (alongside Manager/Operative). This is the preferred approach but subject to validation.

---

## 3. Capability Coverage

Every capability from the analysis is addressed. The classification determines the technical approach.

| # | Capability | Classification | How Addressed |
|---|-----------|---------------|---------------|
| C1 | Adjust Heating Setpoint | **Control** | Pocket change: temp setpoint adjustment via ThingsBoard |
| C2 | Override Kitchen Equipment | **Control** | Pocket change: instant on/off via ThingsBoard |
| C3 | External Lighting Control | **Control** | Pocket change: instant on/off via ThingsBoard |
| C4 | Scope Determination | **View** | Site panel: asset inventory showing what LH controls |
| C5 | Contractor On-Site Escalation | **Escalation** | Engineer escalation workflow with SMS + timeout routing |
| C6 | Hot Water Override | **Control** | Pocket change: DHW override via ThingsBoard |
| C7 | Schedule Viewing | **View** | Site panel: device schedules with export/email option |
| C8 | Device Status Visibility | **View** | Site panel: online/offline/fault status per device |
| C9 | Callback Tracking | **View + Workflow** | Ticket actions: follow-up flag, visible in queue |
| C10 | New Site/Client Awareness | **Communication** | Shift notices panel: pinned broadcasts from IoT team |

---

## 4. User Journeys

### 4.1 Primary Flow: Inbound Call

```
Phone rings
    → Zendesk creates ticket automatically (existing behaviour)
    → Dashboard auto-pops the ticket to the agent's screen
    → Agent sees: caller info, no site linkage yet
    → Agent searches for site (by name, house ID, or postcode)
    → Agent links ticket to site (one click)
    → Site panel loads: assets, scope, schedules, device status, recent tickets
    → Agent follows triage flow based on issue category
    → Triage flow guides agent to:
        (a) Self-service resolution (pocket change) → done
        (b) Note/follow-up for IoT team next day → done
        (c) Engineer escalation → SMS workflow → done
```

### 4.2 Entry Points to Site Data

There are two distinct entry points, depending on context:

1. **Auto-triggered ticket (no site linkage):** Call comes in → ticket pops → agent must search and link site manually. This is the normal flow.
2. **Direct site lookup:** Agent may need to look up a site independently (e.g. callback from previous shift, proactive check). No ticket context needed.

### 4.3 Escalation Flow: Engineer Request

```
Agent determines engineer is needed (via triage or experience)
    → Agent raises escalation from ticket
    → Selects routing: GK Repairs Admin / Network Engineers / SCC / Flowrite
    → System sends SMS to Escalation Manager with ticket link
    → Escalation Manager opens ticket on mobile (UI is responsive)
    → Manager can: Approve / Redirect / Add notes
    → If no response within 45 minutes:
        → Auto-route to selected team contact
        → Notify agent that timeout routing occurred
    → Agent is notified of outcome (approval, redirect, or timeout)
    → Ticket is updated with full audit trail
```

---

## 5. Screen Definitions

### 5.1 OOH Agent Home

The default view when an OOH agent logs in. Shows:

- **Active ticket** (auto-popped from inbound call, or empty state)
- **Shift notices** (C10 — pinned broadcasts from IoT management)
- **Open tickets queue** (any unresolved OOH tickets from current/previous shifts)
- **Callback queue** (C9 — tickets flagged for follow-up)

### 5.2 Ticket Panel

Shown when a ticket is active (auto-popped or selected from queue). Two-column layout matching existing modal pattern (960px max-width on desktop):

**Left column — Ticket Info:**
- Caller name, phone number
- Auto-generated ticket ID (from Zendesk)
- Linked site (if linked) — with search/link button if not
- Issue category (selectable)
- Priority (guided by triage, not subjective)
- Agent notes (free text)
- Actions: Add follow-up, Escalate, Resolve

**Right column — Site Context (loads when site is linked):**
- Site name, house ID, address, postcode
- Client (Greene King, McDonalds, etc.)
- **Scope panel:** What Lighthouse controls at this site (plain English)
- **Recent tickets:** Last 14/30 days for this site (repeat caller indicator)
- **Outbound comms:** Any notes about attempts to contact this site
- **Asset summary:** Equipment hierarchy in plain language

### 5.3 Site Search

Triggered from the ticket panel when no site is linked. Modal overlay:

- Search by house ID (4-digit), site name, or postcode
- Results show: site name, house ID, client, postcode
- One-click to link site to active ticket
- Also accessible independently from sidebar nav for direct site lookup

### 5.4 Site Detail Panel

Expanded view of a linked site. Tabs or accordion sections:

**Assets tab:**
Equipment displayed in a logical hierarchy, plain English labels:
```
Kitchen
├── Cooking: Fryers (x2), Synergy Grill, Merrychef
├── Wash: Glasswasher, Dishwasher
└── Ventilation: Extractor Fans

Heating
├── Zone 1 — Restaurant (Setpoint: 22°C, Current: 20°C)
├── Zone 2 — Bar (Setpoint: 21°C, Current: 19°C)
└── Zone 3 — Accommodation (Setpoint: 22°C, Current: 18°C)

Hot Water
└── DHW (Status: On, Setpoint: 60°C)

External
├── Car Park Lighting
├── Festoon Lighting
└── Outdoor Heaters
```

Each asset shows:
- Plain name (not technical ID)
- Online/Offline status (green/red dot) — C8
- Current state (on/off, current temp) — C8
- "Quick action" button for pocket changes — C1/C2/C3/C6

**Schedules tab:**
- Per-device schedule grid (day of week × on/off times) — C7
- Export button: download as PDF or email to site contact directly
- Visual indicator if current time is within/outside schedule

**History tab:**
- Recent tickets for this site (last 30 days)
- Repeat contact indicator if >2 tickets in 14 days
- Any open/pending tickets

### 5.5 Triage Flow

A guided decision-tree panel that appears contextually based on the issue category selected on the ticket. The agent follows it while on the phone.

**Purpose:** Remove subjective guesswork. Guide the agent to a binary outcome — either "you can resolve this" or "escalate with this information."

**Example flow — "Site says heating not working":**
```
Step 1: Search for site → Link to ticket
Step 2: Does this site have Lighthouse heating control?
        → YES: Continue
        → NO: "Advise site to contact GK Repairs Admin on [number]" → Resolve
Step 3: Check device status — is the gateway online?
        → YES: Continue
        → NO: "Gateway offline. Advise site to check fuse board. If not resolved,
                log for IoT team review tomorrow." → Add note → Resolve
Step 4: Check current temperature vs setpoint
        → At or above setpoint: "Heating is working. Building may be
          insufficiently heated. Advise site." → Resolve
        → Below setpoint, heating active: "Heating is running but hasn't
          reached setpoint. Advise site to allow 30 mins." → Resolve
        → Below setpoint, heating NOT active: Offer pocket change
          → "Raise setpoint by 2°C?" → Agent confirms → Change applied
          → Resolve ticket, P1 review ticket auto-created for IoT team
```

**Key design principles for triage flows:**
- Each step shows live data where available (current temp, device status)
- Binary choices only — no ambiguity
- Agent never has to make a technical judgement
- Every path ends with a clear action and resolution
- Flows are authored and maintained by the IoT team (not hardcoded)

### 5.6 Pocket Changes (Control Panel)

When the triage flow (or agent experience) identifies a safe temporary change:

- **What the agent sees:** A confirmation dialog showing exactly what will change, in plain English: "Turn on Fryer 1 at Mill House 6360 for 2 hours"
- **What happens behind the scenes:**
  1. Temporary change applied via ThingsBoard API
  2. Change is time-limited (auto-reverts after configurable duration, e.g. 2–4 hours)
  3. A **P1 review ticket** is automatically created in the workflow system for the IoT team
  4. The review ticket contains: what changed, who changed it, when, why (from triage flow context), and the original ticket reference
- **What the IoT team sees next morning:** An alarm-like ticket in their queue — "OOH pocket change: setpoint raised from 20°C to 22°C at Mill House 6360 at 18:45. Review required: make permanent, revert, or investigate."

**Available pocket changes:**
| Action | Parameters | Auto-revert? |
|--------|-----------|-------------|
| Raise/lower heating setpoint | ±°C, max/min guardrails | Yes (configurable, e.g. 4 hours) |
| Turn on kitchen equipment | Device selection | Yes (configurable, e.g. 2 hours) |
| Turn on/off external lighting | Device selection | No (follows next schedule cycle) |
| Override DHW (hot water) | On/off | Yes (configurable, e.g. 4 hours) |

**Guardrails:**
- Setpoint changes limited to ±3°C from current setpoint
- Maximum setpoint cap (e.g. 25°C for pub areas, configurable per site)
- Accommodation changes may require BDM approval — triage flow handles this
- All changes logged with full audit trail
- All changes generate a P1 review ticket automatically

### 5.7 Engineer Escalation

Raised from the ticket panel when triage or agent experience determines an engineer is needed.

**Agent completes:**
- Routing selection: GK Repairs Admin / Network Engineers (Lighthouse) / SCC / Flowrite
- Urgency context (pre-filled from triage where possible)
- Whether contractor is currently on site (yes/no + contractor name/number)
- Free text: what the engineer needs to do/know

**System actions:**
1. SMS sent to Escalation Manager (currently Sam Day, configurable) containing:
   - Site name + house ID
   - Issue summary (one line)
   - Direct link to ticket in the OOH dashboard (mobile-friendly)
2. 45-minute countdown starts
3. Escalation Manager can:
   - **Approve** — routes to selected team, notifies agent
   - **Redirect** — changes routing (e.g. "this is SCC not GK"), routes, notifies agent
   - **Add notes** — provides guidance to agent or receiving team
   - **Reject** — with reason, notifies agent
4. If no response in 45 minutes:
   - Auto-routes to the selected team contact
   - Notifies agent that timeout routing has occurred
   - Flags in the escalation manager's queue as "auto-routed — please review"

**Routing contacts (configurable in data/escalation-rules.json):**
| Team | Purpose | Contact |
|------|---------|---------|
| GK Repairs Admin | BAU site maintenance, boiler, plumbing | TBC |
| Network Engineers | Lighthouse hardware, firmware, connectivity | IoT team direct |
| SCC | BAU kitchen equipment contractors | TBC |
| Flowrite | BAU refrigeration contractors | TBC |

### 5.8 Shift Notices (C10)

A pinned panel on the OOH agent home screen showing broadcasts from the IoT team.

- IoT management can create notices (via Manager view in existing dashboard)
- Notices are visible to all OOH agents for a configurable duration
- Examples: "McDonald's sites now live — LE postcodes", "Power pause re-engagement today — expect higher call volume", "Chef & Brewer sites coming online next week"
- Simple dismiss/acknowledge per agent
- Archived after expiry for audit

---

## 6. Data Requirements

### From Zendesk (existing integration)
- Ticket creation on inbound call (existing)
- Ticket retrieval, update, comments (existing API proxy)
- Organization/client lookup (existing)

### From ThingsBoard (NEW — requires investigation)
- Site directory: name, house ID, address, postcode, client
- Asset inventory per site: device type, plain name, category/hierarchy
- Device status: online/offline, last seen, signal quality
- Current readings: temperature, setpoint, power state
- Schedules: per-device on/off times by day of week
- Control API: setpoint adjustment, device override (on/off), DHW override
- Audit: who changed what, when (for pocket change logging)

### From SMS Gateway (NEW)
- Send SMS to escalation manager on engineer request
- Receive/track response (or implement via dashboard link + timeout)

### Internal Data (dashboard-managed)
- OOH team members and roles
- Escalation routing contacts and rules
- Triage flow definitions (authored by IoT team)
- Shift notices
- Pocket change guardrails (max setpoint, duration, etc.)

---

## 7. Open Questions / Investigation Required

| # | Question | Dependency |
|---|----------|-----------|
| 1 | Does ThingsBoard expose the APIs needed for site lookup, device status, readings, and control? | Next session with ThingsBoard API enabled |
| 2 | What is the asset/device hierarchy in ThingsBoard? Does it map to the plain-English categories needed? | ThingsBoard investigation |
| 3 | Can Zendesk auto-pop a ticket to the dashboard on inbound call, or is telephony middleware needed? | Telephony architecture review |
| 4 | Is Zendesk still needed long-term, or could the dashboard handle ticket lifecycle directly? | Strategic decision |
| 5 | What SMS gateway to use for escalation notifications? (Twilio, Azure Communication Services, etc.) | Infrastructure decision |
| 6 | Who authors and maintains the triage flows? What format should they be stored in? | Process decision with IoT team |
| 7 | What are the exact guardrails for pocket changes? (max setpoint, duration, BDM thresholds per site type) | Business rules — confirm with Sam Day / Jonathan |
| 8 | What are the correct contact details for GK Repairs Admin, SCC, and Flowrite routing? | Confirm with IoT team |
| 9 | Should OOH agents see the existing Manager/Operative views, or only the OOH view? | Role/permission decision |
| 10 | Accommodation sites have different rules (BDM approval for setpoint changes) — how is this flagged per site in ThingsBoard? | ThingsBoard data model |

---

## 8. Phasing Suggestion

Based on technical dependency and value:

### Phase 1 — View Only (no ThingsBoard control needed)
- Ticket auto-pop and management
- Site search and linkage
- Shift notices (C10)
- Callback/follow-up tracking (C9)
- Basic triage flows (text-based guidance, no live data)
- Engineer escalation workflow with SMS

### Phase 2 — View + Live Data (ThingsBoard read-only)
- Site asset panel with live device status (C4, C8)
- Schedule viewing and export (C7)
- Triage flows enhanced with live data (current temp, device online/offline)
- Repeat contact indicator

### Phase 3 — Control (ThingsBoard write access)
- Pocket changes: setpoint, equipment override, lighting, DHW (C1, C2, C3, C6)
- Auto-revert mechanism
- P1 review ticket auto-generation
- Full triage flows with binary action outcomes

---

## 9. Design Constraints

- Must match existing dashboard design system (Inter, #594AE2, Material Icons, card layout)
- Must be mobile-friendly (OOH agents may be on phone/tablet)
- Must work as an additional view mode within the existing dashboard (preferred) or as a linked companion app
- All pocket changes must be audited and auto-generate review tickets
- No permanent changes permitted from OOH UI — all changes are temporary
- Triage flows must be maintainable by IoT team without code changes

---

## 10. Reference Files

| Document | Path | Purpose |
|----------|------|---------|
| Capability Analysis | `archive/OOH Dashboard/OOH_CAPABILITY_ANALYSIS.md` | Source analysis of 91 incidents |
| Initial Findings | `archive/OOH Dashboard/initial-findings.md` | First-pass discovery from chat analysis |
| Teams Chat | `archive/OOH Dashboard/teams chat history.txt` | Raw Teams chat export |
| WhatsApp Chat | `archive/OOH Dashboard/_chat.txt` | Raw WhatsApp chat export |
| Dashboard CLAUDE.md | `iot-support-dashboard/CLAUDE.md` | Deployment rules and locked files |
| Dashboard CSS | `iot-support-dashboard/public/css/styles.css` | Design system reference |
| Alignment Principles | `iot-support-dashboard/ALIGNMENT_DESIGN_PRINCIPLES.md` | Ticket row layout spec |
| Auth Design | `iot-support-dashboard/AUTH_DESIGN.md` | Authentication architecture |
| Escalation Rules | `iot-support-dashboard/data/escalation-rules.json` | SLA targets and routing config |
| Mockup | `archive/OOH Dashboard/OOH_DASHBOARD_MOCKUP.html` | Desktop UI mockup |

---

*Next step: ThingsBoard API investigation session to validate data availability for Phases 2 and 3.*
