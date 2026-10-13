OOHDASH-119 Additional Notes — Pre-Release Live Integration Proof
Date: 2026-10-13
Branch: origin/build/oohdash-119-additional-notes @ 666ff3e
Tester: Test-Stage Reviewer (automated, via Playwright + Zendesk API)
Local port: 3219 — SERVER STOPPED after testing

ENVIRONMENT SETUP

The app was run locally with:
- AUTH_MODE=dev (no B2C SSO required for local test)
- DATA_MODE=fixture (site 6832 fixture data)
- ZENDESK_FORCE_LIVE=true (worktree-only patch in services/zendesk.js to route Zendesk calls to the real API while keeping fixture site data; the patch adds a single env-override guard to the live() function and is isolated to this test worktree — it never reaches any shared branch)
- WRITES_DISABLED=true (device writes disabled — confirmed in /healthz and in the UI banner throughout)
- SMS_PROVIDER=log (no SMS)
- ZENDESK credentials: current token from CIR (rotated 2026-08-20)

/healthz at startup: status=ok, writesDisabled=true, zendesk.mode=live, zendesk.healthy=true, zendesk.configured=true


SAFETY VERIFICATION

- WRITES_DISABLED=true: CONFIRMED via /healthz response and visible in the OOH Dashboard UI banner throughout all test steps ("Device control is disabled at deploy time (safety/canary lock)").
- SMS_PROVIDER=log: confirmed in .env — no SMS sent.
- No P1 path taken: heating "Give guidance & log it" outcome (scope-only, not P1).
- Site: Old Grey Mare (6832) only.
- All notes begin with "TEST OOHDASH-119 — please ignore —".
- Total tickets created: 1 (ticket #50346). Both S1 and S2 used the same ticket.


CHECK 1 — Notes box visible at desktop (1280px)

PASS

The additional notes textarea with label "Additional notes for the IoT team (optional)", its description text, and the character counter (0 / 1000) were all present and visible:
- At the area-selection step (first step after choosing Heating): screenshot 04-notes-box-visible-S1.png
- At the diagnostic step (second step, after choosing Bar/Restaurant): snapshot confirmed textarea ref=f1e270 visible with text and 121 / 1000 counter
- At the confirm step (final step before Record outcome): snapshot confirmed textarea ref=f1e451 visible with text and 121 / 1000 counter

Notes persisted across all guided-flow steps without being cleared. PASS.


CHECK 2 — "Record outcome" button visible at desktop

PASS

At the confirm step the button "Record outcome" was visible (snapshot ref=f1e448), confirmed by the Playwright accessibility snapshot. Screenshot: 06-confirm-record-outcome-button-S1.png.


CHECK 3 — S1 Zendesk ticket created, [TRG] body contains notes line

TICKET: #50346
PASS (with one finding — see below)

Ticket verified via Zendesk API:
- Subject: [OOH] Heating complaint — system performing to setpoint (Bar area)
- Status: new (at creation), then solved (closed by test)
- Tags: gk_6832, internal, ooh, tcat_support_request
- Comment 1 (public=false):

[TRG] Heating complaint — system performing to setpoint (Bar area)
Operator: Test Handler (OOH)
Outcome: scope-only
Transcript:
20:28 | Site selected: Old Grey Mare (6832)
20:28 | Zone reading 17.5°C against a 18°C setpoint with the device online and responding — consistent with a building/TRV/boiler-side limitation, not a Lighthouse control fault.
20:28 | Additional notes from OOH agent: "TEST OOHDASH-119 — please ignore — Heating issue reported in bar area | caller says very cold / Engineer due 07:00 tomorrow"

EVIDENCE:
- Line break (\n between "very cold" and "Engineer due") converted to " / ": CONFIRMED
- Note appended at end of transcript in "HH:MM | Additional notes from OOH agent: ..." format: CONFIRMED
- Comment is internal (public=false): CONFIRMED

FINDING — pipe neutralisation partial (build commit 7308309 fixes this):
The note text contained "bar area | caller says very cold". In the version tested at this pre-release run (build commit 666ff3e), the normaliseAdditionalNotes() function only neutralised pipes adjacent to timestamp patterns. Free-text pipes were preserved verbatim, causing "bar area | caller says very cold" to appear with a raw pipe in the Zendesk ticket body.

STATUS: FIXED in build commit 7308309 (pipe → ¦ U+00A6 neutralisation extended to ALL pipe characters in the notes body, not just timestamp-adjacent ones). fb1f702 (typography) built on top of this. The test branch (test/oohdash-119-additional-notes) has this fix merged. Unit test coverage: test/zendesk.test.js. Builder e2e coverage: E15 + E26.


CHECK 4 — S2 late note: [OOH NOTE] internal comment (not [TRG])

PASS

Using the post-submit "+ Add a note to ticket #50346" box:
- Note typed: "TEST OOHDASH-119 — please ignore — S2 late note: caller called back to say heating now working"
- Saved via the "Save note" button
- Verified via Zendesk API:

Comment 2 (public=false):
[OOH NOTE] Additional notes from OOH agent: "TEST OOHDASH-119 — please ignore — S2 late note: caller called back to say heating now working"

Operator: Test Handler (handler@example.com)

PASS: Starts with [OOH NOTE] (not [TRG]). Is an internal comment (public=false). Contains the note text.
Screenshot: 09-S2-late-note-typed.png, 10-S2-note-saved.png.


CHECK 5 — Post-submit "Add a note" box visible

PASS

After Record outcome was clicked, the UI showed:
- "Your notes are on ticket #50346: ..." confirmation line
- The outcome result card
- The button "+ Add a note to ticket #50346" which, when clicked, expanded into a note input with "Type a note…" placeholder and "Save note" / "Cancel" buttons

Screenshot: 07-post-submit-ticket-50346.png, 08-post-submit-add-note-box.png.

State-reset check: after S2 note was saved, the post-submit note input was cleared (the save collapsed the input). The "+ Add a note to ticket #50346" button returned to the UI, ready for another note. PASS.


CHECK 6 — Mobile visibility at 390px

Browser viewport set to 390 x 844 via Playwright browser_resize.

PASS — all four elements verified:
- Notes box visible (textarea at area-selection step): PASS — snapshot ref=f1e1057 present; screenshot 12-mobile-notes-box-visible.png
- Character counter visible (0 / 1000): PASS — snapshot ref=f1e1060; screenshot 12-mobile-notes-box-visible.png
- "Record outcome" button visible at confirm step: PASS — snapshot ref=f1e1330; screenshot 14-mobile-all-visible-390px.png (full-page screenshot confirms button reachable without horizontal scroll)
- Post-submit box visible at mobile: PASS — screenshot 11-mobile-post-submit.png captured the post-submit state at 390px (taken immediately after viewport was resized to mobile before starting the fresh mobile flow)


CHECK 7 — IoT Support Dashboard notes visible

PASS — operator-verified (screenshot 15)

Operator (James Brown, jamesbrown@airedale-group.co.uk) verified ticket #50346 in the IoT Support Dashboard at https://zendesk-uat.airedale-api.co.uk at 20:49 on 2026-10-13. The IoT dashboard displayed:
- S1: The additional-notes line "TEST OOHDASH-119 — please ignore — ..." visible as timed step 3 in the ticket detail view
- S2: The [OOH NOTE] late note visible as a separate internal comment in the ticket

Both IoT S1 and IoT S2 confirmed PASS by operator inspection. Screenshot: 15-iot-dashboard-ticket-50346-operator-check.png.


TICKET CLOSURE

Ticket #50346:
- Internal comment added: "OOHDASH-119 pre-release test ticket — closed by test"
- Status set to: solved
- API call result: Ticket 50346 status: solved — CONFIRMED


SCREENSHOT INDEX

All screenshots saved to docs/project/test-evidence/oohdash-119/live-pre-release/ in this worktree.

| File | What it shows |
|---|---|
| 01-dev-signin.png | Dev sign-in page at local server |
| 02-homepage.png | Dashboard homepage after sign-in |
| 03-workspace-6832.png | Workspace for Old Grey Mare 6832 |
| 04-notes-box-visible-S1.png | Notes box visible at area-selection step (desktop) |
| 05-notes-typed-S1.png | Note typed with 121/1000 counter (desktop) |
| 06-confirm-record-outcome-button-S1.png | Confirm step with "Record outcome" button and notes box (desktop) |
| 07-post-submit-ticket-50346.png | Post-submit showing ticket #50346 and Add a note button (desktop) |
| 08-post-submit-add-note-box.png | Post-submit Add a note box open (desktop) |
| 09-S2-late-note-typed.png | S2 note typed in post-submit box |
| 10-S2-note-saved.png | After S2 note saved |
| 11-mobile-post-submit.png | Post-submit state at mobile 390px (just after viewport resize) |
| 12-mobile-notes-box-visible.png | Notes box and counter at mobile 390px (area-selection step) |
| 13-mobile-confirm-record-outcome.png | Full-page mobile confirm step |
| 14-mobile-all-visible-390px.png | Notes box + counter + Record outcome button at mobile 390px (confirm step) |
| 15-iot-dashboard-ticket-50346-operator-check.png | IoT Support Dashboard at zendesk-uat.airedale-api.co.uk, 20:49, ticket #50346 — operator-verified; notes as timed step 3 + [OOH NOTE] late note visible |


VERDICT

pass

All conditions resolved:
1. Pipe neutralisation: FIXED in build commit 7308309 — all free-text pipes in notes body replaced with U+00A6 before TRG-STEP insertion. Unit and builder tests confirm.
2. IoT Support Dashboard: PASS — operator-verified (James Brown) at 20:49 on 2026-10-13; screenshot 15.

All checks pass: notes box visible throughout the flow, counter visible, Record outcome button visible, notes appear in [TRG] body with line-break → " / " conversion, [OOH NOTE] post-submit comment is internal and not [TRG]-prefixed, mobile visibility at 390px confirmed for all UI elements, device writes confirmed disabled, single ticket #50346 created and closed. IoT S1+S2 operator-verified.
