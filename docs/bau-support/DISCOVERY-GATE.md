<!-- gate:contract
SECTION: What this gate is
This is the Stage 1 (discovery) sign-off for a new deliverable: a plain-English BAU support document (training, standard operating procedure and FAQ) for the non-technical out-of-hours handlers who use the OOH Triage Dashboard. Discovery is complete. This gate does not build the final document — that is the next (design) stage. What you are approving here is that the discovery is accurate and that we may proceed to design.
The full evidence is in the interactive review page embedded below as the Live prototype card — a mobile-friendly walkthrough with all 28 real screenshots from the live site (v1.2.4). Open mockups/bau-discovery-mockup.html to click through it.

SECTION: What discovery covered
A firsthand walk of the live site (v1.2.4, signed in as an OOH handler) captured 28 full-page screenshots across every screen: the New Call landing and site search, site confirmation, the core triage workspace, all eight guided issue flows (heating, hot water, kitchen, external lighting, extractor fans, fridges, contractor on site, and something-else), the connection-check auto-divert, the canary control lock, ticket auto-creation, Callback Lookup, and the Tonight shift log. Each screen is documented with what the handler sees, what they do, and what the system does automatically, plus a status and colour glossary, the intervention model, and FAQ and edge-case seeds.

SECTION: The confirmed use case
Out of hours, a non-technical handler takes a call from a Lighthouse-connected pub with a problem. Today the handler is effectively a postbox, forwarding almost everything to the IoT team. The dashboard turns that into a guided triage desk: the handler searches the site, sees live device status, is walked through a scripted conversation per issue type, and can take a safe pre-programmed action where one is possible and unlocked. Every completed triage automatically writes a prioritised, fully-transcribed ticket into the IoT Support (Zendesk) dashboard, so the caller gets a clear answer and a reference number and the IoT team gets consistent, prioritised detail instead of a forwarded voicemail.

SECTION: Decision — what is done
The four test tickets the discovery walk auto-created on production Zendesk (numbers 49073 to 49076) have been deleted. They were internal-only with no customer email sent. This is recorded for transparency; nothing needs actioning.

SECTION: Decision — open questions to confirm
A short list of items needs the IoT team's or your confirmation before the final document can be fully accurate. None of them blocks starting the design stage; they are fill-ins. First: is the on-duty-manager SMS or paging live in production, or canary-gated (the walk showed "Text not sent")? Second: when is the canary lock on device control lifted, so training does not go stale? Third: what is the full priority matrix — only P1, captured next-working-day, and scope-only were observed, so is there a P2 or P3? Fourth: what is the live-data backing source, if handlers need "where does the live data come from" explained? Fifth: confirm the not-individually-captured branches (extractor fans; the fridge "just a query" branch; and the heating cooler, off, and not-working branches) all behave as the shared capture and escalate pattern.

SECTION: Recommendation and sign-off
The recommendation is to proceed to Stage 2: design the final hi-fi HTML support document and then convert it to PDF for distribution, treating the open questions above as fill-ins that do not block starting design. Approve this gate to proceed to design, or request changes if the discovery needs more work first.
DECISION: Proceed to Stage 2 (design the final support document)? | Approve — proceed to design | Request changes
DETAIL: Discovery is complete and evidenced by 28 real screenshots of the live v1.2.4 site; the open questions are accuracy fill-ins that can be resolved during design and do not block starting it.
-->

# OOH Triage Dashboard — BAU Support Document · Stage 1 discovery gate

This is the discovery sign-off for a new deliverable: a plain-English BAU support document (training, SOP and FAQ) for the non-technical out-of-hours handlers who use the OOH Triage Dashboard. Stage 1 (discovery capture) is complete. This gate is governance for stage 1 only — it does not build the final product document, which is the next design stage.

## What discovery covered

A firsthand walk of the live site (v1.2.4) captured 28 full-page screenshots across every screen and every guided issue flow. Each screen is documented in plain English — what the handler sees, what they do, and what the system does automatically — alongside a status and colour glossary, the intervention model, the current control-lock reality, and FAQ and edge-case seeds. The full interactive evidence is the review page embedded as the Live prototype card, built from mockups/bau-discovery-mockup.html.

## The confirmed use case

Out of hours, a non-technical handler takes a call from a Lighthouse-connected pub with a problem. Today the handler is effectively a postbox who forwards almost everything to the IoT team. The dashboard turns that into a guided triage desk: the handler searches the site, sees live device status, is walked through a scripted conversation per issue type, and can take a safe pre-programmed action where possible and unlocked. Every completed triage automatically writes a prioritised, fully-transcribed ticket into the IoT Support dashboard.

## Decisions for sign-off

- Done: the four test tickets the walk auto-created on production Zendesk (49073 to 49076) have been deleted — they were internal-only with no customer email sent.
- Open, to confirm before the final doc is finalised (none blocks starting design): whether on-duty-manager SMS is live or canary-gated; the control-unlock date; the full priority matrix (is there a P2 or P3); the live-data backing source; and confirmation that the not-individually-captured branches follow the shared capture-and-escalate pattern.
- Recommendation: proceed to Stage 2 — design the final hi-fi HTML support document, then convert to PDF for distribution — treating the open questions as fill-ins.

## How to review

Open the Live prototype card below to click through the full discovery: what this is and who it's for, the triage-to-ticket journey, a screen-by-screen gallery of all 28 screens, the colour and status glossary, the intervention model and canary lock, and the FAQ seeds. Approve to proceed to design, or request changes.
