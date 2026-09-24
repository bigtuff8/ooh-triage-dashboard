# Handoff — OOH Triage Dashboard → IoT Support Dashboard
## Fire the P1 escalation SMS off OOH-origin `ooh_p1` tickets (Approach B)

**From:** OOH Triage Dashboard session (`C:\repos\ooh-triage-dashboard`, owner bigtuff8) · app **v1.3.0 live**
**To:** the IoT Support Dashboard session/repo
**Date:** 2026-09-24 · **Ticket:** OOHDASH-73 · **Author:** James (bigtuff8)
**Status of the OOH side:** the ticket contract below is **already built and live** — no further OOH-side code is required for Approach B.

---

## 1. Why this handoff exists (the decision)

OOHDASH-73 ("enable the P1 escalation SMS to the on-duty manager") was originally scoped as **Approach A** — the OOH dashboard sends the SMS itself via its own Twilio path. That was designed and built (all inert, in `log` mode — the OOH dashboard has **never** sent a P1 SMS in production). 

James has confirmed the correct architecture is **Approach B**, which the OOH discovery gate already flagged as the preferred target:

> The OOH dashboard **creates and labels** the P1 OOH ticket. The **IoT Support Dashboard** recognises it is an OOH-origin P1 and fires **its own already-built SMS notifier** (the same one that has sent real escalation texts since ~April 2026).

So: **all remaining build work is in the IoT Support Dashboard repo.** The OOH dashboard's job — producing a reliably-labelled P1 ticket — is done. This brief hands you the exact contract to trigger on.

---

## 2. The ticket contract — what the OOH dashboard stamps on a P1 (verified in live code)

Every P1 escalation the OOH dashboard raises creates a **Zendesk ticket** (via `POST /tickets.json`) carrying **all** of the following. Trace: `routes/api.js:247-285`, `services/zendesk.js:278-308`.

| Field | Value on a P1 OOH ticket | Notes |
|---|---|---|
| **Tags** | `ooh` **and** `ooh_p1` | `ooh` = every OOH ticket; **`ooh_p1` = P1 only.** This is the recommended trigger key. `routes/api.js:267`, `zendesk.js:303` |
| **Priority** | `urgent` | P1 → `urgent`; non-P1 OOH → `normal`. `api.js:266` |
| **Subject** | `[OOH] <subject>` | `[OOH]` prefix on every OOH ticket. `zendesk.js:300` |
| **Category** (custom field) | field id `25999250486684` = `tcat_support_request` ("Support Request") | On every OOH ticket, not P1-specific. `config.js:78-79`, `zendesk.js:279` |
| **Site** (custom field) | site field id `config.zendesk.siteFieldId` = resolved site tag | Present when the house ID resolves; absent + flagged if not. `zendesk.js:293-297` |
| **First comment** | internal (`public:false`) `[TRG]` transcript | Site, ticket, operator, action transcript. `zendesk.js:301` |
| **Ticket URL** | `https://<subdomain>.zendesk.com/agent/tickets/<id>` | For the deep-link the SMS should carry. `zendesk.js:308` |

**Recommended discriminator for your trigger:** the **`ooh_p1` tag**. It is applied by the OOH dashboard **only** on a P1 escalation and is not carried by any BAU alarm ticket (BAU alarms are created by ThingsBoard's own rule chain straight into Zendesk and never pass through the OOH dashboard). Priority `urgent` + the `[OOH]` subject prefix are good secondary confirmations.

---

## 3. What the IoT Support Dashboard needs to build

1. **A watcher/trigger** on the shared Zendesk instance that fires when a ticket appears carrying the **`ooh_p1`** tag (near-real-time — the on-duty manager needs the text within ~60s of the ticket being created).
2. On match, **invoke the existing SMS notifier** with:
   - the **on-duty escalation manager** recipient (already owned/configured on the IoT side),
   - a message summarising site + ticket,
   - a **deep-link to the ticket** (the OOH ticket URL above, or your own ticket view of the same ticket).
3. **Idempotency / de-dup:** fire the SMS **once per `ooh_p1` ticket**. Guard against re-firing on ticket updates, re-tagging, or watcher replays.

---

## 4. Invariants & gotchas (please honour)

- **No double-paging.** The OOH dashboard's own Approach-A Twilio path stays permanently in `log` mode under Approach B (it sends nothing). Confirm the IoT-side send is the **only** sender so the manager is never texted twice. If Approach A were ever accidentally enabled (`SMS_PROVIDER=twilio` in the OOH pod) **and** your watcher is live, that is the double-send failure mode.
- **The OOH ticket carries a potentially-misleading dispatch note.** After raising a P1, the OOH dashboard posts an internal comment recording *its own* dispatch result — in `log` mode that reads *"text not sent — phone the on-duty manager now"* (`api.js:280`, `zendesk.addP1DispatchNote`). Once the IoT side is actually sending, that OOH comment is stale/misleading. Coordination options (decide together): suppress that OOH note under Approach B, or have handlers treat the IoT send as authoritative. **Flag for the join call.**
- **Deep-link host.** The OOH side currently builds deep-links against `IOT_DASH_BASE_URL` (the live IoT Support host, `https://zendesk-uat.airedale-api.co.uk` — the "uat" is historical, it is live). If the IoT side builds its own deep-link, use whichever host opens the correct **live** ticket. A wrong host does **not** fail loudly — verify it in the live test.
- **BAU vs OOH separation.** Only OOH-dashboard P1s carry `ooh_p1`. Do not broaden the trigger to plain `ooh` (that catches non-P1) or to priority alone (BAU alarms can be urgent).

---

## 5. Open questions for the IoT-support session to resolve

1. Does the IoT Support Dashboard already have a Zendesk watcher/trigger mechanism, or does one need building? What's the near-real-time latency floor?
2. Where does the on-duty recipient number/name live on the IoT side, and who rotates it (believed: Sam Day's team)? Confirm it's a real current on-duty person.
3. De-dup key: can you key on ticket id + `ooh_p1` first-seen, and survive a restart without re-sending?
4. The stale-OOH-note coordination decision (§4).
5. Does the existing IoT notifier's message format/deep-link meet the OOH requirement, or does it need an OOH-specific variant?

---

## 6. Live-test the join (definition of done)

As an OOH handler on the live site, trigger a **real** system-decided P1 on a stable test site. **Pass =** the on-duty manager's device receives **one** SMS within 60s, carrying a deep-link that opens the **correct live ticket**; no double-send; the `ooh_p1` ticket exists with the fields in §2. Close the test P1 ticket afterwards.

---

### Reference — OOH-side files
- `routes/api.js:247-285` — the `POST /outcomes` P1 path (ticket create + tag + priority)
- `services/zendesk.js:278-308` — `createOutcomeTicket` (subject prefix, tags, category/site custom fields, URL)
- `config.js:76-79` — category field id + value
- `services/escalation.js` — the OOH-side Approach-A Twilio path (stays in `log` mode; the OOH-origin fail-closed guard shipped in v1.3.0 but is inert)
- OOH discovery gate: `docs/ooh-p1-sms-enable/DISCOVERY-GATE.md` (§ two candidate approaches — names Approach A vs B)
