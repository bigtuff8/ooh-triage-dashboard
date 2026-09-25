# OOH Estate Topology Model — Plain-English Companion

**Companion to:** `OOH_ESTATE_TOPOLOGY_MODEL_2026-09-25.md` (the technical document)
**Date:** 2026-09-25 · **Status:** FIRST DRAFT for review by Sam, Spencer and Jonathan
**Governing epic:** OOHDASH-103
**Changelog:**
- 2026-09-25 — updated with controlled bench-test results (Q4/Q8). The smart-switch (Tuya) control **mechanism was proven to work end-to-end on a test bench**, but it is **switched off in the live system today** because the live "bridge" software is an older version built before the fix — so it needs a software update before it will work in production. The confirmation signals were shown to say **"confirmed", "failed" or "refused"** as expected, and a real "confirmed" was seen on a Tuya switch. **But a real "confirmed" has still never been seen for the heating (Salus)** — a test heating instruction on the bench was never picked up — so heating control confirmation is still unproven.
- 2026-09-25 — updated with Sam/Spencer validation-round answers (Q1/Q2/Q3/Q6 resolved and moved into section 3 as confirmed fact; Q4/Q8 now carry bench-test results; Q5 moved to Jonathan/Rikki with James picking it up; Q7 low-priority tbc).

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

**Newly confirmed (Sam/Spencer validation round, 2026-09-25).** Four things that were open questions in the first draft are now settled fact:

- **The Salus "gateway" box is actually the heating *receiver*.** It is not a communications hub — it wires directly into the boiler and switches it on and off on the thermostat's instruction. Importantly, the heating **schedules live inside the thermostat itself**, not in that box. So if the receiver has a problem, switching the boiler on and off can be affected, but the programmed schedule keeps running regardless.

- **We now know exactly which equipment depends on an on-site box, and which does not.** Only the smart switches (Tuya) talk straight to their manufacturer's cloud with no on-site box in the way. Everything else that we thought was "direct" actually leans on an on-site gateway: the LoRaWAN box relays the dishwashers, glasswashers, fryers, cellars, fridges/freezers and heating & hot-water sensors; the meters and the air-conditioning go through the site's Modbus box. A useful pattern also emerged: a single machine (a dishwasher, say) often shows up **twice** — once as a monitoring sensor on the LoRaWAN box, and once as a Tuya control switch — so we always read each half against its own path.

- **The electricity and gas meters (AMR) are not on-site equipment at all.** They are a feed pulled in from the UK utility providers over the internet. There is nothing physical on-site to "reach". This is why an AMR showing as inactive is completely normal and healthy — and it means the dashboard must never treat one as a broken on-site device.

- **There are genuinely two different kinds of "boiler" record, not one recorded twice.** One (`boilerControl`) is the real, controllable boiler control panel. The other (`boiler-control`, with a hyphen) is a set of room-temperature sensors — monitor-only. They must be kept firmly apart. This also surfaced a real heating dependency worth knowing: on a site that shares one boiler with attached accommodation, if the main boiler panel is switched off, a room thermostat calling for heat in the accommodation cannot actually pull any heat — because the boiler feeding it is disabled.

The important nuance: the **map of what is where and how it connects is now largely confirmed**, and the **reading** side is proven. What still needs full confirmation is the **control** side — actually sending an instruction and getting back honest proof it landed (see section 4). A controlled bench test on 2026-09-25 moved this forward but did not finish it: the smart-switch (Tuya) control mechanism was **proven to work on the bench**, yet it is **still switched off in the live system** (the live software is an older version, built before the fix, so it needs an update first); and while the confirmation signals behaved as designed on the switches, **the heating (Salus) still has not been seen to confirm a real instruction**. So control is partly proven, partly still open. The technical document is careful about that distinction, and so is this one.

---

## 4. What is still an open question

The technical document lists eight questions, labelled Q1 to Q8. The 2026-09-25 Sam/Spencer validation round **answered four of them** — Q1, Q2, Q3 and Q6 are now RESOLVED, and their answers have moved up into section 3 as confirmed fact (they are kept in the table below, marked RESOLVED, so you can still see what was asked and where to look it up). The 2026-09-25 controlled bench test then took **Q4 and Q8** a big step further: the smart-switch (Tuya) control mechanism is now **proven to work on the bench but is switched off in the live system** (Q4), and the confirmation signals were shown to behave as designed **except that the heating (Salus) has still not confirmed a real instruction** (Q8). Q5 has moved to Jonathan and Rikki (with James picking it up), and Q7 remains to be confirmed. Nothing still open is a defect to fix blindly — several are decisions or definitions to agree, not bugs.

| # | In plain English | Why it is still open | Who should answer | Example to look up (real site / asset) |
|---|---|---|---|---|
| **Q1 — RESOLVED** | Some heating systems (Salus brand) have an extra box on-site called a "gateway". Does a control instruction depend on it? | **Answered (Sam/Spencer validation round, 2026-09-25):** it is the heating **receiver** — it wires into the boiler and switches it on/off on the thermostat's instruction; it is not a comms hub. Schedules live inside the thermostat, so they keep running even if the receiver has a problem; only on/off switching depends on it. Now recorded as fact in section 3. | — (closed) | Compare `gk-6261-salusit700-gateway-1` (reads offline) against its child thermostat `gk-6261-salusit700-1` (still live) — and the same pattern at site **6267**. |
| **Q2 — RESOLVED** | For each type of equipment, does its data pass through an on-site coordinating box, or does it only need the site's internet connection? | **Answered (Sam/Spencer validation round, 2026-09-25):** only the Tuya smart switches are truly direct. The LoRaWAN box relays the dishwashers, glasswashers, fryers, cellars, fridges/freezers and heating & hot-water sensors; the meters and the air-conditioning go through the site's Modbus box; PowerPause devices are independent. And a single machine often appears twice — a LoRaWAN monitoring sensor plus a Tuya control switch. Now recorded as fact in section 3. | — (closed) | Site **birchwoodfarm** (several gateway types on one site: `gk-birchwoodfarm-kitchen-r10a`, `gk-birchwoodfarm-cellar-r10a`, `gk-birchwoodfarm-ac-r10a`, `gk-birchwoodfarm-lwgateway`) and site **6261** (`gk-6261-kitchen-r10a`, `gk-6261-maindb-r10a`). |
| **Q3 — RESOLVED** | The electricity and gas meters — do they report over one radio technology, another, or a mix? | **Answered (Sam/Spencer validation round, 2026-09-25):** neither — they are not on-site equipment at all. The meter readings (AMR) are a data feed pulled in from the UK utility providers over the internet. There is nothing physical on-site to reach, and "inactive" is normal and healthy. The dashboard must never treat one as a broken on-site device. Now recorded as fact in section 3. | — (closed) | `gk-6261-ElecAMR-1` and `gk-6261-GasAMR-1` — an external utility feed, not an on-site device. |
| **Q4 — answered (with an important caveat)** (controlled bench test, 2026-09-25) | The smart switches (Tuya brand) — do we send the right command, and when will the live system actually be able to command them? | **Answered:** the control mechanism **works end-to-end on the bench** — two different switches were turned on and confirmed in about 2.5 seconds, and the same single instruction works for both makes of switch (the bridge handles the make-specific detail). **But it is switched off in the live system today:** the live bridge software (built July 2026) is older than the fix (late August 2026), so it needs a software update before it will work in production. This means Sam's understanding that it is already live is not correct. Until the update, the dashboard must keep showing Tuya as read-only. | Live-system update owner (Spencer) | Any Tuya device, e.g. `gk-6261-externallighting-1` or `gk-6261-fryer-1` (bench references: `bench-owon-1`, `bench-tongou-sy1-1`). |
| Q5 | The boilers use a non-standard way of receiving instructions. When do they move onto the standard method? | A migration is planned but not yet done. Until then, the dashboard treats boilers as monitor-only. | **Jonathan / Rikki** (this moved out of Spencer's scope on 2026-09-25); **James is picking it up directly.** | `gk-6261-boilercontrol-1` — status/timeline of LH-INT-BOILER-001 (move from the non-standard method to the standard command contract). |
| **Q6 — RESOLVED** | Are there genuinely two separate kinds of "boiler" equipment, or is it one kind recorded under two slightly different labels? | **Answered (Sam/Spencer validation round, 2026-09-25):** genuinely two separate kinds. `boilerControl` is the real, controllable boiler control panel; `boiler-control` (with a hyphen) is a set of room-temperature sensors that are monitor-only. They must be kept firmly apart. This also surfaced a real heating dependency, now recorded in section 3: on a site sharing one boiler with attached accommodation, if the main boiler panel is off, a room thermostat in the accommodation cannot pull any heat. | — (closed) | Compare a device on `boilerControl` vs one on `boiler-control`; and `gk-6261-kitchen-r10a` (profile `remoteItProfile`) vs `gk-birchwoodfarm-kitchen-r10a` (profile `R10A Modbus Gateway`) — same name style, different profile. |
| Q7 (LOW priority — still tbc) | The air-conditioning (Intesis brand) — is there any signal back that confirms an instruction landed, can we control on/off and fan speed, and how does it actually connect? | On the one unit examined, no confirmation signal was seen. A new conflict also needs settling: Sam says air-con control goes through the site's Modbus box, whereas the SD-195 document says each unit connects directly to the AC Cloud. Still to be confirmed. Low priority — this is a low-penetration product, only about **11 live units across the whole estate**. | **Spencer** (as part of OOHDASH-98) | `gk-birchwoodfarm-ac-1` (profile `airConditioningProfile`) — any confirmation signal beyond the setpoint echo, are on/off and fan-speed safe to control, and does control route via the Modbus box or direct to AC Cloud? (bench reference: `funklet-intesis-29d1f022`) |
| **Q8 — part-answered: signals confirmed, heating still unproven** (controlled bench test, 2026-09-25) | For the heating that *does* give a confirmation signal, we had only ever seen it say "pending" (in progress). We had not seen it say "confirmed" or "failed" for real. | **The confirmation signals were shown to behave as designed** — "confirmed", "failed" (the equipment refused) and "refused" (out of range or not allowed) — and a real "confirmed" was seen on a Tuya switch in about 2.5 seconds. **But a real "confirmed" was still NOT seen for the heating (Salus):** a test heating instruction on an online, healthy bench heating unit was simply **never picked up** — the signal stayed stuck on an old "pending" from a week earlier, even though the unit itself was still reporting fine. So heating control confirmation is still unproven and must be treated as unconfirmed for now. Two review points still stand: (1) the confirmation should arrive as a **background pop-up when it is read — the operator should never be made to wait** on a spinner; and (2) this stuck "pending" now looks like it may be a problem with *how the instruction is being sent* to the heating, not just an offline box — because it happened on a healthy unit. | Bench test / Spencer | `gk-6261-salusit700-1` currently shows `setpointSyncStatus: pending`; on the bench, `spencer-home-salusit700` was healthy but did **not** pick up a test write (stuck on a stale "pending" from 2026-09-17). Still need to observe a real heating write reach `synced`. |

"Bench" means a controlled test on a real device off to one side, rather than against a live site.

**Two practical notes from the bench test (for the technical team to follow up — not part of the map itself):**

- The bench/test system's log-in details are kept in a different secure store (`airedale-kv-uat`) from the live system's, which is worth knowing before anyone goes looking for them.
- The bench/test system is **no longer the small, isolated 8-device sandbox the runbook describes** — it now holds around 3,333 devices, some with production-style names. Whether it is still safely separated from the live system should be **re-checked with Spencer**.

---

## 5. Why each part matters

This is the payoff. Each finding below changes either what the operator sees on screen or what the dashboard is allowed to do — and each ties straight back to the goal of fast, correct, safe out-of-hours decisions.

**(a) A control instruction can look sent but never actually arrive.**
The dashboard must never show a cheerful "Done ✓" unless the equipment has genuinely confirmed it. If the instruction was sent but no confirmation came back, the operator must see "Sent, but not confirmed — we cannot verify this reached the device." This is the single most important behaviour in the whole design. A false "done" is worse than an honest "not sure", because it stops the operator escalating something that actually needed a call-out. And because the confirmation can take a little time to arrive, it should come back as a **background pop-up when it lands** (Spencer's steer, 2026-09-25) — the operator is told "sent" straight away and can carry on, rather than being made to wait on a spinner.

**(b) The smart switches (Tuya) cannot really be controlled in the live system yet — even though the mechanism now works.**
Reading them works — the operator can see whether a switch is on and how much power it is drawing. The bench test on 2026-09-25 proved the *mechanism* to control them works end-to-end (two switches turned on and confirmed in about 2.5 seconds). But it is still **not switched on in production today**: the live bridge software is an older version, built before the fix, so production needs a software update first. So the dashboard must not offer a working on/off button for these until that update is done and control is genuinely live. Showing a button that does nothing would badly mislead the operator.

**(c) Being able to read a device does not mean you can control it — and the reverse.**
These two abilities are separate and often differ. A fridge sensor is perfectly readable but was never meant to be controlled. A switch might be readable while its control path is dormant. The dashboard must judge each ability on its own evidence and never assume that because it can see a device, it can command it.

**(d) A "gateway offline" warning does not automatically mean the site is dead — but which box matters.**
"Gateway" can mean two different on-site boxes, and the validation round sharpened this. The site's own **internet/4G box** being offline does not stop the equipment that reports through the manufacturer's cloud — the Tuya smart switches and the cloud-connected thermostats keep coming through fine — so that must be shown as *context* ("on-site direct access is impaired"), never as a false alarm that the whole site is down. The **relay boxes are different**, though: if the LoRaWAN box is down, the equipment that depends on it (dishwashers, fryers, fridges, and the rest) genuinely stops reporting; if the Modbus box is down, the meters and the air-conditioning do. So the dashboard must read each device against its own path and be precise about *which* gateway is offline and *what that actually affects* — never a blanket "site down", and never a blanket "all fine".

**(e) Some equipment gives no real confirmation signal, so we cannot promise the action worked.**
The air-conditioning and the boilers, as things stand, do not send back a clear "yes, done" signal. For these, even a correctly sent instruction is honestly "unconfirmed". The dashboard must say so plainly rather than imply success. This keeps the operator's trust and, again, keeps genuinely unresolved problems moving toward escalation.

The thread running through all five: the dashboard earns trust by being **honest about what it does and does not know**. That honesty is what lets a non-expert rely on it at 2am.

---

## 6. The honest confidence line

Put simply: **the map of what is where and how it connects is now largely confirmed, and we can trust what the dashboard READS. On the CONTROL side, the bench test proved the smart-switch (Tuya) mechanism works, but it is DORMANT in the live system until a software update; and CONFIRMATION that control worked is still UNPROVEN for the heating (Salus) — a real "confirmed" has never been seen there.** So control is partly proven, partly still open.

That ordering is deliberate and safe. Reading is harmless — the worst case is a stale number, which we handle by labelling it "no recent data" rather than "broken". Controlling is where the risk lives, because a wrong or unconfirmed instruction can have real consequences at a site. So we have built and proven the safe half first, and we are holding the control half behind confirmation until each type of equipment has demonstrably passed. Building trust in the reading foundation, then adding control only as each piece is proven, is the responsible order.

---

## 7. What happens next

This is a **first draft**, shared with Sam, Spencer and Jonathan for review. It is not signed-off fact.

The 2026-09-25 validation round with Sam and Spencer turned four of the questions (Q1, Q2, Q3, Q6) into confirmed fact, and the 2026-09-25 controlled bench test then largely answered Q4 and Q8 (with the two caveats above: the live system needs a software update before smart-switch control works, and the heating still needs to be seen confirming a real instruction). The remaining items in section 4 are the work from here:

- **Sam** (helpdesk) — confirmed the comms and equipment picture in this round; continues to help confirm how things behave in practice and what operators actually need to see.
- **Spencer** (technical / bridge owner) — the follow-ups land with you: getting the smart-switch (Tuya) fix into the live system so control actually works there (Q4), getting the heating (Salus) to confirm a real instruction on the bench (Q8), and settling the air-conditioning confirmation plus the connection-path conflict (Q7, low priority). Also worth a quick check: whether the bench/test system is still safely separated from the live system (see the practical notes under section 4).
- **Jonathan** and **Rikki** — now own the boiler command-contract migration (Q5), which has moved out of Spencer's scope; **James is picking this up directly.**
- **Jonathan** (CTO) — the direction-setting calls, including product decisions about which controls the dashboard should offer at all.

Once these are answered, the map becomes a dependable foundation the dashboard can safely act on — which is the whole point: a non-expert reaching the right, safe outcome, fast, out of hours.

---

*This is a plain-English companion. Where the technical document is uncertain, this document says so rather than papering over it — being honest about what is and is not known is the entire purpose.*
