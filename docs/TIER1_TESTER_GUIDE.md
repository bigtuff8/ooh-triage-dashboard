# OOH Triage Dashboard — Tier-1 Tester Guide

A short, practical guide for the IoT support desk to get started on the Out-of-Hours (OOH)
Triage Dashboard. **Tier-1 scope is chat + read + capture/escalate. Device CONTROL is NOT
enabled for Tier-1.**

---

## 1. What it's for

The dashboard is the guided triage tool for out-of-hours call handlers: find the site a
caller is reporting, read its live device status, and record an outcome (capture the issue,
scope it, take no action, or escalate a P1). It writes a summary back to the Zendesk ticket
so the day team has a clean handover.

---

## 2. Getting in

- **URL:** https://ooh.airedale-group.io
- **Login:** your **Airedale AD single sign-on** (the same account you use for other Airedale
  systems). There's no separate password to set up.
- **Provisioning is required first.** Your account must be granted the OOH handler role
  before the app will let you in — if you get an "access denied" / no-role screen after
  signing in, you have not been provisioned yet. Contact the person in section 7 to be added.
  (Do not keep retrying; it won't change until the role is granted.)

---

## 3. Practise on a known-good test site: 6261

Use site **6261** (`gk-6261`) to learn the flow. It's a **Salus iT700 heating site** — a
good, representative example with live device data to look at. Practising here keeps you off
real customer sites while you learn.

---

## 4. The triage flow

1. **Search the site** — type the site number/name (try `6261`) and open it.
2. **Confirm** you've got the right site (check the name/location against what the caller
   told you).
3. **Read the device status** — look at the live heating/device state so you understand
   what's actually happening on site.
4. **Pick an outcome:**
   - **Capture** — record the issue/fault details for the day team to pick up.
   - **Scope-only** — you've investigated and scoped it, but no further action needed now.
   - **No-action** — nothing wrong / nothing to do.
   - **Escalate P1** — genuine out-of-hours priority-1; this triggers the P1 escalation path.
5. The outcome is written back to the Zendesk ticket as the handover summary.

> Escalate P1 only for genuine priority-1 situations — it pages people. When practising, use
> capture / scope-only / no-action instead.

---

## 5. Test-tag convention (IMPORTANT — keeps the live queue clean)

When you create or work a **practice** ticket, tag it with **both**:

- `test`
- `ooh-test`

This marks it clearly as a training/practice ticket so it can be filtered out of the live
work.

### Cleanup

Practice tickets must not pollute the live **SD-330** OOH queue. After a practice session:

- Close/resolve your practice tickets, and
- Make sure they carry the `test` + `ooh-test` tags so they can be found and cleared.

If in doubt, flag your practice tickets to the contact in section 7 for cleanup rather than
leaving them open in the live queue.

---

## 6. In scope vs not (Tier-1)

**In scope (yes):**
- Device / site **READ** — view live status and telemetry.
- **Capture** an issue and write the handover summary to Zendesk.
- **Escalate** a genuine P1.

**Not in scope (no):**
- Device **CONTROL** / making changes to equipment (set-points, on/off, overrides). Control
  is **not enabled** for Tier-1. If a situation seems to need a device change, **escalate**
  rather than attempting it.

---

## 7. Who to contact

- **Provisioning / access problems, and practice-ticket cleanup:** James Brown
  (jamesbrown@airedale-group.co.uk).
- **Anything you're unsure about during a real OOH call:** follow the normal OOH escalation
  path (escalate P1 in the dashboard) rather than guessing.
