# OOH Estate Topology Model — Plain-English Companion

**Companion to:** `OOH_ESTATE_TOPOLOGY_MODEL_2026-09-25.md` (the technical document)
**Date:** 2026-09-25 · **Status:** FIRST DRAFT for review by Sam, Spencer and Jonathan
**Governing epic:** OOHDASH-103

---

## How to read this document

This is a plain-English explainer. It sits alongside a longer, more technical document and tells you, in everyday words, what that document says, what we now know for certain, and what we still need to confirm. You do not need to read the technical document first. You do not need any specialist knowledge. Where a technical word is unavoidable, it is defined the first time it appears.

A few terms used throughout, defined once:

- **The dashboard** — the OOH (Out Of Hours) Triage Dashboard. "Triage" means quickly sorting a problem to decide what to do about it. This is the tool an on-call person uses at night or over a weekend when a pub or restaurant site reports a problem.
- **A site** — one Greene King pub or restaurant. There are about 373 of them.
- **A device** — a piece of connected equipment at a site: a thermostat, a fridge, a fryer, a boiler, a meter, and so on. Across all sites there are roughly 12,800 of these.
- **ThingsBoard** — the central system that all the equipment reports into. Think of it as the noticeboard where every device posts its latest readings. When we say the dashboard "reads" a device, it reads it from ThingsBoard.
- **Read** — get information *from* a device (its temperature, whether it is on, and so on).
- **Control** — send an instruction *to* a device (turn it on, change the temperature, boost the hot water).

---

## 1. What this document is

The technical document is a **map of every kind of connected equipment** that can exist at a Greene King site, and how each kind talks to the central system.

For each kind of equipment it records four things in plain terms: how it connects, what information the dashboard can read from it, whether the dashboard can send it an instruction, and — crucially — whether the equipment will tell us honestly that our instruction actually arrived.

It is deliberately organised **by type of equipment, not site by site**. There is no page in it for "site 6261". Instead, when an operator opens a site, the dashboard looks up what equipment is actually there right now and matches each item to its entry on the map. The map is the stable, reusable knowledge; the live site look-up happens at the moment of the call.

---

## 2. Why it exists

The whole point of the dashboard is this: when something goes wrong at a site out of hours, a **non-specialist** on-call person should be able to take the call, be guided through a set of structured questions, and reach the **right, safe answer quickly** — without having to understand the equipment themselves. The machine does the technical assessment quietly in the background and hands the operator a clear conclusion. Every call ends in one of three things: a safe remote action (such as nudging a temperature or boosting hot water), a logged or escalated ticket to the technical team, or a P1 alert that texts the on-duty manager for something genuinely urgent. "P1" simply means top-priority.

For the dashboard to do that safely, it has to know three things accurately, for the exact site, at the exact moment of the call:

1. **What equipment is actually there.**
2. **What of that equipment we can genuinely reach and read.**
3. **What we can genuinely and safely send an instruction to.**

That knowledge is exactly what this map provides. If the dashboard guessed, or worked from an out-of-date list, it could tell an operator that a heater was turned on when it never was — the sort of mistake that turns a quiet night into a welfare problem. The map exists so the dashboard never has to guess.

---

## 3. What we now know for certain

These parts are established and evidence-backed. They are safe to rely on.

- **We have a full, counted inventory of the estate.** There are roughly 12,800 devices across about 373 sites, and they fall into a manageable number of *types* — a handful that can be controlled (thermostats, air-conditioning, smart switches, boilers) and a larger set that are monitor-only (meters, fridge and freezer sensors, cellar sensors, door sensors, and so on). Because we work from types, not from a per-site list, the knowledge stays accurate even as individual devices come and go.

- **Equipment is named to a consistent pattern.** Almost every device is named like `gk-6261-fryer-1` — a brand code, then the site, then the equipment type, then a number. This pattern is what lets the dashboard pick out the right site's equipment reliably. There are a few known exceptions (some sites are named by word rather than number, some names have stray spaces, a small number were typed by hand), and these are documented so the dashboard can handle them.

- **We can reliably READ device data.** This has been proven with live checks against the real system. When we ask for a site's equipment, we get it back with current readings. This is the strong, dependable foundation the dashboard is built on.

- **We have documented, clear rules for how a control instruction is supposed to travel.** The design says an operator's instruction is written onto the central noticeboard, and a separate service picks it up and passes it on to the equipment's manufacturer system, which then acts and reports back. We know this intended route in detail.

The important nuance: the **reading** side is proven. The **control** side is mostly documented design intent that still needs live confirmation (see section 4). The technical document is careful about that distinction, and so is this one.

---

## 4. What is still an open question

The technical document lists eight open questions, labelled Q1 to Q8. These are the things we do not yet know for certain and need the right people to confirm. Nothing here is a defect to fix blindly — several of these are decisions or definitions to agree, not bugs.

| # | In plain English | Why it is still open | Who should answer |
|---|---|---|---|
| Q1 | Some heating systems (Salus brand) have an extra box on-site called a "gateway". Does a control instruction actually *depend* on that box, or is it just a passive relay? | The documentation says there is no on-site coordinator, yet the box exists in the data, and one live site shows a temperature change stuck as "not yet confirmed". We cannot tell if the two facts are related. | Sam / Spencer |
| Q2 | For each type of equipment, does its data genuinely pass through an on-site coordinating box, or does it only need the site's internet connection? | We have inferred the answer from documents but have not checked it exhaustively across the whole estate. | Spencer |
| Q3 | The electricity and gas meters — do they report over one radio technology, another, or a mix? | There is no single document that settles it. (Either way, these meters showing as "inactive" is normal and healthy — they only report occasionally.) | Sam / Spencer |
| Q4 | The smart switches (Tuya brand) — when will the live system actually be able to command them? | The capability is built but not switched on in the live system yet. Reading them works fine; only sending instructions is dormant. | Sam / Spencer |
| Q5 | The boilers use a non-standard way of receiving instructions. When do they move onto the standard method? | A migration is planned but not yet done. Until then, the dashboard treats boilers as monitor-only. | Spencer |
| Q6 | Are there genuinely two separate kinds of "boiler" equipment, or is it one kind recorded under two slightly different labels? | A full system audit now suggests it is one kind under two labels, which narrows the question — but one detail (whether the second label really carries boiler readings or sensor readings) is not yet nailed down. | Sam / Spencer |
| Q7 | The air-conditioning (Intesis brand) — when we send an instruction, is there any signal back that confirms it landed? And can we control on/off and fan speed at all? | On the one unit examined, no confirmation signal was seen. Until one is confirmed, every air-con instruction is treated as unconfirmed. | Sam / Spencer |
| Q8 | For the heating that *does* give a confirmation signal, we have only ever seen it say "pending" (in progress). We have not yet seen it say "confirmed" or "failed" for real. | We trust the documented behaviour, but we want to watch a real instruction complete before we rely on the "confirmed" signal as proof. | Bench test / Spencer |

"Bench" means a controlled test on a real device off to one side, rather than against a live site.

---

## 5. Why each part matters

This is the payoff. Each finding below changes either what the operator sees on screen or what the dashboard is allowed to do — and each ties straight back to the goal of fast, correct, safe out-of-hours decisions.

**(a) A control instruction can look sent but never actually arrive.**
The dashboard must never show a cheerful "Done ✓" unless the equipment has genuinely confirmed it. If the instruction was sent but no confirmation came back, the operator must see "Sent, but not confirmed — we cannot verify this reached the device." This is the single most important behaviour in the whole design. A false "done" is worse than an honest "not sure", because it stops the operator escalating something that actually needed a call-out.

**(b) The smart switches (Tuya) cannot really be controlled in the live system yet.**
Reading them works — the operator can see whether a switch is on and how much power it is drawing. But the ability to actually flip them is not switched on in production today. So the dashboard must not offer a working on/off button for these until that is genuinely live. Showing a button that does nothing would badly mislead the operator.

**(c) Being able to read a device does not mean you can control it — and the reverse.**
These two abilities are separate and often differ. A fridge sensor is perfectly readable but was never meant to be controlled. A switch might be readable while its control path is dormant. The dashboard must judge each ability on its own evidence and never assume that because it can see a device, it can command it.

**(d) A "gateway offline" warning does not mean the site is dead.**
The on-site gateway is, roughly, the site's own internet box. It can show as offline while the equipment at the site is still perfectly reachable — because most equipment reports in through the manufacturer's cloud, not through that on-site box. So the dashboard must present "gateway offline" as *context* ("on-site direct access is impaired"), never as a false alarm that the whole site is down. Getting this wrong would send someone to a site that was fine.

**(e) Some equipment gives no real confirmation signal, so we cannot promise the action worked.**
The air-conditioning and the boilers, as things stand, do not send back a clear "yes, done" signal. For these, even a correctly sent instruction is honestly "unconfirmed". The dashboard must say so plainly rather than imply success. This keeps the operator's trust and, again, keeps genuinely unresolved problems moving toward escalation.

The thread running through all five: the dashboard earns trust by being **honest about what it does and does not know**. That honesty is what lets a non-expert rely on it at 2am.

---

## 6. The honest confidence line

Put simply: **we can trust what the dashboard READS. The ability to CONTROL equipment, and to CONFIRM that control worked, is still being verified.**

That ordering is deliberate and safe. Reading is harmless — the worst case is a stale number, which we handle by labelling it "no recent data" rather than "broken". Controlling is where the risk lives, because a wrong or unconfirmed instruction can have real consequences at a site. So we have built and proven the safe half first, and we are holding the control half behind confirmation until each type of equipment has demonstrably passed. Building trust in the reading foundation, then adding control only as each piece is proven, is the responsible order.

---

## 7. What happens next

This is a **first draft**, shared with Sam, Spencer and Jonathan for review. It is not signed-off fact.

The open questions in section 4 are the work. Your answers are what turn the provisional parts of the map into confirmed fact:

- **Sam** (helpdesk) — help confirm how things behave in practice and what operators actually need to see.
- **Spencer** (technical / bridge owner) — the questions about how data and instructions travel, and about the boiler and air-con confirmation signals, mostly land with you.
- **Jonathan** (CTO) — the direction-setting calls, including product decisions about which controls the dashboard should offer at all.

Once these are answered, the map becomes a dependable foundation the dashboard can safely act on — which is the whole point: a non-expert reaching the right, safe outcome, fast, out of hours.

---

*This is a plain-English companion. Where the technical document is uncertain, this document says so rather than papering over it — being honest about what is and is not known is the entire purpose.*
