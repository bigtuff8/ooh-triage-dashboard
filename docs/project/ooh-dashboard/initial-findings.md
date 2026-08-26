# OOH Dashboard — Initial Findings

**Project:** Zendesk OOH Dashboard
**Status:** Discovery
**Date:** 18 March 2026
**Author:** James Brown / Digital Delivery

---

## Sources Analysed

| Source | Period | Volume |
|--------|--------|--------|
| WhatsApp — OOH Lighthouse Support Team | 5 Jan 2026 – 17 Mar 2026 | ~384 messages |
| Microsoft Teams — Lighthouse Out Of Hours channel | 14 Dec 2025 – 17 Mar 2026 | ~200 messages |

Teams history was exported manually. WhatsApp history exported via in-app export.

---

## People & Roles (as observed in chats)

| Role | People |
|------|--------|
| OOH Call Handlers | Kellie Roche, Rebekah (Becky) White, Juliet (Ju) Upfold, Kelly Merton, Collease Hall, Kim Jowett |
| IoT Support (remote resolution) | Sam Day, Csaba Jakab (CJ), Tony Willetts |
| IoT / Lighthouse Management | Jonathon Wilkinson, Ashley Sheridan, James Brown |
| External Contractors (callout) | Bellrock, DPP, Nadach, SCC, GK Electrical |

---

## Key Findings

### 1. Two channels are doing the same job with no coordination

Teams and WhatsApp are both being used for OOH incident management, with no formal separation of purpose. The same incidents frequently appear in both channels. On 21 February, CJ explicitly asked the OOH team to copy messages from Teams to WhatsApp because the IoT team don't always have Teams access at weekends. This means the team is maintaining two parallel, unintegrated channels — and issues fall through the gap between them.

**Implication:** The dashboard needs to be a single, definitive channel for all OOH communication, replacing both.

---

### 2. No consistent intake format — and it matters

Message quality ranges from fully structured (site number, issue, contact name and number) to incomplete or ambiguous. Missing contact numbers slow callbacks. Wrong site numbers cause wasted investigation (Kellie gave house ID 7244 for Whistling Goose when it should have been 6886 — that site wasn't even on IoT). Kelly's messages occasionally omit the site number entirely.

The information the IoT team always need is the same three things: **what site, what's the symptom, who to call back.** The current format doesn't reliably capture all three.

**Implication:** Structured ticket intake with a site number lookup is the highest-value single feature.

---

### 3. Repeat sites are invisible

Several sites appear multiple times across both chats with the same or related issues:

- **Angel Inn 6749** — heating/temperature, multiple calls over several weeks
- **Rosedene 7949** — no heating or hot water, multiple incidents, described as "again"
- **Mill House 6360** — outdoor lighting, multiple contacts
- **Devon 7714** — no heating, site called twice in one evening, second call went unanswered
- **Fox Hunters 6795** — no heating, appears in both channels

Because there is no ticket history, the IoT team cannot identify these as chronic issues. They are treated as fresh incidents each time, which masks potential underlying problems (poor install, persistent connectivity issue, site misusing overrides).

**Implication:** Site lookup should surface recent ticket history and flag repeat contacts. This also feeds into a longer-term reporting need.

---

### 4. "Is this ours?" is a constant friction point

A significant proportion of contacts involve either the OOH handler being unsure if the issue is in Lighthouse scope, or the IoT team confirming it isn't. Examples:

- Polite Vicar — Merlin 2000S gas interlock panel (not Lighthouse, electrical fault)
- Rovers Tye — bathroom lights tripping (not Lighthouse, controlled by electrician)
- Starting Gate 7043 — signage not working (pre-existing fault, not Lighthouse)
- Water Tower 6883 — boiler PCB failure (engineer blamed Lighthouse and left)
- Rose & Crown 6855 — dishwasher leaking after sensor install (not caused by sensors)
- Quakerwood 6845 — boiler company told site Lighthouse controls hot water temperature (partially true, partially not)

The OOH team are currently making scope judgements without any reference tool. They rely on posting to the chat and waiting for the IoT team to confirm.

**Implication:** A per-site scope panel ("what Lighthouse controls at this site") would allow the OOH handler to answer the site's first question on the call, and eliminate a large proportion of unnecessary escalations.

---

### 5. Contractor-on-site situations are the highest-stakes incidents

When a Bellrock, DPP, Nadach, or SCC engineer is physically on site and needs IoT remote support to proceed, the cost of delay is immediate — the engineer's time, the site's frustration, the risk of the engineer leaving the job incomplete. These incidents appear regularly across both chats and cause the most visible stress. They are currently indistinguishable from comfort calls in the chat.

Examples: Two Steeples contactor (engineer on site, firmware not updated), Polite Vicar Nadach callout (engineer on site, didn't know what they were supposed to do), Brentwood Bellrock emergency (emergency hot water callout, needed IoT to advise).

**Implication:** Contractor-on-site should be a distinct flag on the ticket that triggers immediate notification to the IoT team — not just another message in the queue.

---

### 6. No visibility of status for the OOH handler

Once the OOH handler posts an issue, they have no way of knowing if it's been seen, is being investigated, or has been resolved — unless they watch the chat thread. A significant amount of chat traffic is status-checking ("is anyone looking at this?", "thanks Sam!") or chasing ("site have called again, any chance someone can pick this up").

**Implication:** A live ticket status visible to the OOH handler (Raised → Picked up → Resolved, with resolution notes) would eliminate most of this traffic and let handlers close the loop with sites confidently.

---

### 7. The BDM approval threshold is unclear and inconsistent

The question "does this need BDM approval?" appears multiple times, typically around permanent setpoint changes or switching off a zone entirely. Handlers are unsure where the line is. In some cases the IoT team apply changes without mentioning approval; in others they pause pending sign-off. There is no documented threshold visible to the OOH team.

**Implication:** The scope panel or triage guidance should include clear inline guidance on what requires BDM approval, with the BDM contact surfaced at the site level.

---

### 8. No callback tracking — the loop often doesn't close

Multiple incidents end with "have said someone will call back tomorrow" with no further record. The Devon 7714 site called twice in one evening; the second call went unanswered. Ridgeway Arms left a voicemail that Tony resolved the following morning, only because he happened to see the thread. There is no mechanism for the IoT team to push a callback request to the OOH handler, and no way for the handler to confirm the callback was completed.

**Implication:** A callback flag on a resolved ticket — visible in the OOH handler's queue — is a simple but impactful feature.

---

### 9. New site types and expansions are not communicated to the OOH team

McDonald's was added to the Lighthouse estate without any briefing to OOH. Kelly fielded a call at 6:30am and had no idea they were now handling McDonald's sites. The same gap exists for "innovation sites" (Charnwood Arms, no standard schedules), accommodation sites with different setpoint approval rules, and hotels where kitchen equipment timing is business-critical from early morning.

**Implication:** A broadcast/notice mechanism for the IoT team to push site updates and heads-up messages to all OOH handlers before a shift.

---

### 10. Credentials were shared in plain text (security issue — action required)

On 9 February 2026, the following credentials were shared in the WhatsApp group in plain text:

- **Lighthouse/Tuya login:** `gk-6733@lhlive.co.uk` / `GKLighthouse1234!`
- **IoT WiFi password:** `t7ZVTqcVHD,F;:;` (variant: `t7ZVTqcVHD,F;:`)

These should be treated as compromised. Both should be rotated immediately. This occurred because the team had no secure mechanism for sharing credentials during an out-of-hours engineer visit.

**Implication:** The dashboard should not directly expose credentials but should provide a secure, role-gated reference lookup so this practice becomes unnecessary. A policy update is also required.

---

## Issue Taxonomy (from both channels)

Based on frequency across both chats, OOH contacts break down approximately as follows:

| Category | Approx. Share | Notes |
|----------|--------------|-------|
| Heating — too cold (setpoint/override) | ~28% | Most common. Sites want setpoint raised or override applied. |
| External lighting not working | ~18% | Tongou/power pause device offline, fuse tripped, or device removed from system. |
| Kitchen equipment off early or not on | ~15% | Fryers, extractors, glasswashers, Merrychef. Schedule issues or power pause. |
| Heating — not responding | ~10% | Gateway offline (Dragino), device offline, controller broken. |
| Scope / not our issue | ~10% | Boiler PCB, electrical faults, plumbing. Regularly attributed to Lighthouse incorrectly. |
| Hot water — none or insufficient | ~9% | Schedule or boiler fault. DHW override usually resolves. |
| Heating — too hot | ~5% | Gateway down causing fallback, or setpoint too high. |
| Device / connectivity offline | ~5% | Lighthouse box red, Tuya not found, WiFi issues. |

---

## Proposed Key Features (Priority Order)

The following features are proposed for the OOH Dashboard, ordered by impact based on the research above.

### P1 — Must Have

**1. Site number lookup with scope panel**
Type a 4-digit site number → auto-fill site name, address, and a clear "what Lighthouse controls here" summary. This is the single highest-impact feature and would resolve findings 2, 4, and 7 in one.

**2. Structured ticket intake**
A fast form (30 seconds, usable on mobile): site number, issue category, urgency level, contact name and number, free-text notes. Replaces the unstructured chat post.

**3. Urgency flag — with a dedicated "contractor on site" option**
Three levels: Business Critical / Comfort / Advisory. "Contractor on site" as a distinct flag that triggers an immediate push notification to the IoT team.

**4. Live ticket status visible to OOH handler**
Raised → Claimed (by name, time) → Resolved (with notes). Eliminates status-chasing messages and allows the handler to close the loop with the site.

**5. Callback flag**
IoT team marks a resolved ticket as "callback needed". Appears in the OOH handler's open queue until confirmed complete.

**6. IoT team availability status**
Each IoT team member sets Available / Limited / Offline. Visible on the OOH handler's screen at all times.

### P2 — Should Have

**7. Repeat contact indicator on site lookup**
Shows number of tickets raised for this site in the last 14 and 30 days. Flags chronic callers for escalation to IoT management.

**8. Triage guidance per issue category**
Per-category decision tree: Is this in scope at this site? What to ask the site. What to tell the site if it's not ours. What to do if it is ours. Reduces unnecessary escalations.

**9. Broadcast / shift heads-up panel**
IoT management can push a pinned notice to all OOH handler screens (e.g. "Power pause re-engagement today — expect heating calls", "McDonald's sites now on Lighthouse").

**10. BDM contact and approval threshold guidance**
Surfaced on the site panel. Clear inline note on what changes require BDM approval before the IoT team can act.

**11. Contractor directory**
Searchable list of contractor companies, contacts, and phone numbers. Replaces numbers being shared ad hoc in chat.

### P3 — Nice to Have

**12. Live sensor readings on site panel**
Current ambient temperature, setpoint, and device online/offline status. Reduces need for IoT team to check Lighthouse portal separately before responding.

**13. Reporting dashboard**
Call volume by date, site, category. Repeat contact league table. Resolution time by category. To be built once structured data exists — not before.

---

## Open Questions

- Does the Lighthouse system expose an API for live readings that could feed the site panel?
- What is the authoritative data source for "what is installed at each site"? (Commissioning reports? Lighthouse portal? Something else?)
- What is the exact BDM approval threshold for setpoint changes, in writing?
- Are OOH handlers primarily on mobile or desktop when fielding calls?
- Is there appetite for handlers to follow triage steps with sites before escalating, or is the preference always to escalate immediately?
- When the M365 connector is available, Teams history should be re-analysed to supplement these findings.

---

## Immediate Actions Required (outside the dashboard)

1. **Rotate** the Lighthouse/Tuya GK login credentials (`gk-6733@lhlive.co.uk`)
2. **Rotate** the IoT WiFi password (`t7ZVTqcVHD,F;:;`)
3. **Issue guidance** to the OOH and IoT teams that credentials must not be shared via WhatsApp or Teams
4. **Validate these findings** with Sam Day, Kellie Roche, and at least one other OOH handler before moving to specification

---

*Next step: validate findings with OOH team and IoT team, then move to feature specification.*
