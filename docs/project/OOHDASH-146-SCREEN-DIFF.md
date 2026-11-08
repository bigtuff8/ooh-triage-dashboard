# OOHDASH-146 screen-text diff, revision 4 (prototype against live v1.6.6)

Method: the real app (origin/main 916f6e3, v1.6.6) was run in fixture mode with writes enabled and a script clicked every button on every flow, saving each screen's html and text. The prototype is built from those captured screens. Example site name, house number and ticket numbers are normalised on both sides (item N1). This script then loads the finished prototype, reads the text of every screen and compares it line by line with the text of the live screen it came from.

## Result

- Prototype screens: 402 (211 taken from live, 185 authored for 146).
- Identical to live after example-data normalisation: 83.
- Differ from live, every difference mapped to an item below: 134.
- New in 146 (no live screen), each mapped to an item: 185 of 185.
- **Unexplained differences: 0.**
- Live screens captured but not shown in the prototype: 244 (mostly control-window and duplicate crawl states; the replaced and removed live screens are listed under "Live screens replaced").
- Click test: 3431 clicks on 402 screens; dead buttons: 0; buttons that lead to a missing screen: 0; JS errors: 0.

## D13 (R14) checks

- Screens that show the exact question: 72 (exact text on all but: none).
- Ticket screens (not P1): 108; each is either reached only from a risk question (79) or exempt because the problem was resolved on the call or the customer declined (29); ungated: none.
- P1 confirm screens: 46; each reached only from a risk question; exceptions: none.
- P1 button disabled until the comment has real content: checked on 45 confirm screens (empty, spaces only, 9 characters, cleared, ten characters padded with spaces stay disabled; real content enables); failures: none; clicking it with an empty comment stays on the confirm screen: true.

- D14 urgency: 8 "when is it needed" screens (chip mapping wrong on: none); 9 urgent banners; 7 not-urgent banners; a not-urgent screen reaches a P1: never; an urgent screen with no P1 confirm ahead: none.
- Automatic P1 exceptions: P1 screens with no confirm step ahead of them: K-auto-p1 (only K-auto-p1 expected; others: none); K-auto-p1 reached only from the "cannot make the change" screens: yes.
- The retry confirm screen (SH:p1fail, pre-filled): {"initialEnabled":true,"cleared":true,"short":true,"typed":false}.

## Live screens not carried into the prototype (crawl states per scenario)

L6961: 1, L-none: 7, FAN-switch: 5, FAN-none: 7, HW-nodhw: 3, HW-auto: 3, HW-auto-ended: 3, HW-on-until: 3, HW-off-until: 3, HW-on-v1: 3, HW-off-v1: 3, HW-cc-stale: 3, HW-cc-notreconf: 3, HW-cc-decode: 3, HW-nlh: 2, CN7004: 2, CN-devoff: 2, O6832: 12, AC-none: 1, S6832: 46, S6832-cold: 28, S6832-near: 30, S7001: 1, S7003: 18, S-none: 7, BP6234: 41, BP9001-read: 4. These are replaced by the changed screens named in the items below (HW-* by R3, O6832 by R2, CN7004 and CN-devoff by R5, the "Continue under Something else" dead ends in L-none, FAN-none, S-none by R4, the heating agent-button screens by R6), or are crawl states that only show a control window left open.

## The "differs from live" list

| Item | What changes |
|---|---|
| R1 | Kitchen: a one-off change for the next time (D8). New first question when the customer needs a different time, the equipment's next times, the safety question, a check step, a booked card, a cancel path and a site banner. The live answer "It's fine, but we need it at different times" goes to this step instead of straight to the timetable form. "Different times every week" still goes to the live form. |
| R2 | Something else, redesigned (D5, D11). The customer picks what it is about and the dashboard starts that issue's questions; the two agent-judgement buttons and the "it is controlled, go back" dead end are gone. "None of these" asks the universal risk question (R14) in place of the live urgent-or-not question, and the live required reason box becomes the shared mandatory P1 comment. |
| R3 | Hot water: one closed note everywhere (D5, D7). No hot water control and no temperature reading at any site, so the two agent buttons ("Pass it to the IoT team", "Scope guidance") are removed and the screen goes straight to a closed note telling the customer to use their service contractor. The hot water state at the time of the call is added to the ticket. |
| R4 | Not on Lighthouse here: closed note, no dead end (D6, D11). Outside lighting, extractor fans, heating and air conditioning that are not on Lighthouse at the site now end on a closed note (with "Which equipment is it?" as in live kitchen), instead of "Continue under Something else". Live air conditioning is the same at every site; it now says so honestly where there is none. |
| R5 | Connection check: no button, divert corrected (D10). The "Run connection check" button on the site screen and the typed keywords are removed (the automatic divert stays). The divert no longer says "Everything at this site is online" when the customer's own thermostat is the thing that is offline. The all-online screen is no longer reachable. |
| R6 | Heating (thermostats): customer questions, no agent buttons (D5, D12). The agent buttons "Give the radiator advice", "Raise the setpoint anyway" and "Adjust the setpoint anyway" are replaced by plain questions to the customer (for example "Are the radiators in that area warm?"); the turn-it-off card asks the customer. The area picker and readings are live. |
| R7 | Device control window: plain wording and an honest ticket line (D2, D4). Window titles and buttons in plain words ("Make it warmer", "Send"), no raw device codes, and "I've logged it" only when a ticket number came back (a failed ticket shows "Try logging again"). Results use the live after-card. The repeated "not confirmed yet" pop-up shows once (not visible on a screen). |
| R8 | Customer details: name, role and number (D9, non-blocking). Asked on the site screen after the site is confirmed. The call record still starts at site confirm (live E1), so the issue buttons are never blocked. "The customer won't give these" records that instead. Once saved, a customer line appears above every issue screen. |
| R9 | Tonight: plain outcome chips and "What happened". Raw codes replaced by plain chips (including the boiler-boost key, closed note and the kitchen one-off chips). |
| R10 | "Caller" becomes "customer" in ticket text (B4). The words "caller" and "Caller" in ticket subjects, ticket notes and the ticket status label (views.js:99, zendesk.js:255, 388-389, 588). Shown on the "Ticket wording" screen and on the callback ticket drawer. |
| R11 | Boiler-panel (pub heating) screens added to the prototype (C6a). These screens are live and unchanged apart from the shared text key; they were missing from the earlier prototype. The two duration results ("Heating turned on/off") are captured from live; the transient "Sending…" screens are not shown. |
| R12 | Outside lighting wording: "on-site switch" becomes "manual override". Live uses "the on-site switch" in the lighting known-lines and the ticket text but "manual override" everywhere else (C1). Made consistent. |
| R13 | Site screen "Sending nothing": offline banner hint. The offline banner no longer offers the connection check button; its hint now reads "The questions check the equipment for you if your issue involves it." |
| G1 | Grammar fixes on multi-circuit kitchen sites (D). "can't show whether them are on" becomes "can't show whether they are on", and "has the kitchen — pot wash and kitchen — fryers come on?" becomes "have the kitchen — pot wash and kitchen — fryers come on?". |
| N1 | Example data. Site name, house number, ticket numbers and the times shown are fixed examples so every screen reads the same; the live screens use the site's own data. |
| R14 | D13: the universal risk question, the only way to a P1. Every flow asks "Is there an immediate risk to trade or to anyone's health and safety?" (Yes / No) where the problem is still not resolved on the call, before the ticket is made. Yes goes to the live P1 confirm step and cannot be raised until the agent has written why it is urgent. No is the normal ticket for the next working day (or the closed note where Lighthouse does not control the equipment). It replaces the kitchen "is it needed for service" question, the fridge "is stock at risk" question and the Something else "is it urgent" question, and it is now the only way to a P1 (lighting, contractor, hot water, fans, heating, air conditioning, connection, not-on-Lighthouse and site-not-identified paths all go through it). |
| R15 | D14: the urgency window (fans, air conditioning, kitchen times and one-offs). Planned requests are filtered by whether they are urgent, judged against the IoT team's office hours and a 3 working hour response. Extractor fans: one-off or every week, then when it is needed; only a one-off that is urgent can be a P1. Kitchen "different times every week": only an urgent request can be a P1. Kitchen one-off: the "will someone be there" question is gone; an urgent one-off the dashboard can make is booked, and one it cannot make raises a P1 automatically. Air conditioning keeps the risk question and tells the agent where to put an ongoing schedule change. |

## Screens that differ from live, and why

| Prototype screen | Live source | Items |
|---|---|---|
| K8888~10 | K8888~10 | R14 |
| K8888~11 | K8888~11 | R14 |
| K8888~12 | K8888~12 | R14 |
| K8888~13 | K8888~13 | R14 |
| K8888~15 | K8888~15 | R14 |
| K8888~16 | K8888~16 | R14 |
| K8888~18 | K8888~18 | R14 |
| K8888~19 | K8888~19 | R14 |
| K8888~21 | K8888~21 | R14 |
| K8888~22 | K8888~22 | R14 |
| K8888~25 | K8888~25 | R14 |
| K8888~26 | K8888~26 | R14 |
| K8888~29 | K8888~29 | R14 |
| K8888~30 | K8888~30 | R14 |
| K8888~31 | K8888~31 | R14 |
| K8888~32 | K8888~32 | R14 |
| K8888~33 | K8888~33 | R14 |
| K8888~34 | K8888~34 | R14 |
| K8888~35 | K8888~35 | R14 |
| K8888~36 | K8888~36 | R14 |
| K8888~37 | K8888~37 | R14 |
| K8888~38 | K8888~38 | R14 |
| K8888~39 | K8888~39 | R14 |
| K8888~40 | K8888~40 | R14 |
| K8888~41 | K8888~41 | R14 |
| K8888~42 | K8888~42 | R14 |
| K8888~43 | K8888~43 | R14 |
| K8888~44 | K8888~44 | R14 |
| K8888~45 | K8888~45 | R14 |
| K8888~47 | K8888~47 | R14 |
| K8888~48 | K8888~48 | R14 |
| K8888~49 | K8888~49 | R14 |
| K8888~50 | K8888~50 | R14 |
| K8888~52 | K8888~52 | R14 |
| K8888~53 | K8888~53 | R14 |
| K8888~54 | K8888~54 | R14 |
| K8888~55 | K8888~55 | R14 |
| K8888~56 | K8888~56 | R14 |
| K8888~57 | K8888~57 | R14 |
| K8888~58 | K8888~58 | R14 |
| K8888~59 | K8888~59 | R14 |
| K8888~60 | K8888~60 | R14 |
| K8888~61 | K8888~61 | R14 |
| K8888-gw-B-unscheduled~2 | K8888-gw-B-unscheduled~2 | R14 |
| K8888-gw-B-unscheduled~3 | K8888-gw-B-unscheduled~3 | R14 |
| K8888-gw-B-unscheduled~4 | K8888-gw-B-unscheduled~4 | R14 |
| K8888-gw-B-unscheduled~5 | K8888-gw-B-unscheduled~5 | R14 |
| K8888-gw-B-unscheduled~6 | K8888-gw-B-unscheduled~6 | R14 |
| K8888-gw-B-outside~2 | K8888-gw-B-outside~2 | R14 |
| K8888-gw-B-outside~3 | K8888-gw-B-outside~3 | R14 |
| K8888-gw-B-outside~4 | K8888-gw-B-outside~4 | R14 |
| K8888-gw-B-outside~5 | K8888-gw-B-outside~5 | R14 |
| K8888-gw-B-outside~6 | K8888-gw-B-outside~6 | R14 |
| K8888-gw-off-unknown~3 | K8888-gw-off-unknown~3 | R14 |
| K8888-gw-off-unknown~4 | K8888-gw-off-unknown~4 | R14 |
| K8888-gw-off-unknown~5 | K8888-gw-off-unknown~5 | R14 |
| K8888-gw-off-unknown~6 | K8888-gw-off-unknown~6 | R14 |
| K8888-gw-off-unknown~7 | K8888-gw-off-unknown~7 | R14 |
| K8888-gw-off-unknown~8 | K8888-gw-off-unknown~8 | R14 |
| K8888-gw-off-unknown~9 | K8888-gw-off-unknown~9 | R14 |
| K8888-gw-off-unknown~10 | K8888-gw-off-unknown~10 | R14 |
| K8888-gw-fallback~3 | K8888-gw-fallback~3 | R14 |
| K8888-gw-fallback~4 | K8888-gw-fallback~4 | R14 |
| K8888-gw-fallback~5 | K8888-gw-fallback~5 | R14 |
| K8888-gw-fallback~6 | K8888-gw-fallback~6 | R14 |
| K8888-gw-fallback~7 | K8888-gw-fallback~7 | R14 |
| K8888-gw-fallback~8 | K8888-gw-fallback~8 | R14 |
| K8888-gw-fallback~9 | K8888-gw-fallback~9 | R14 |
| K8888-gw-fallback~10 | K8888-gw-fallback~10 | R14 |
| K6832~4 | K6832~4 | G1, R1 |
| K6832~7 | K6832~7 | R14 |
| K6832~8 | K6832~8 | R14 |
| K6832~11 | K6832~11 | R14 |
| K6832~12 | K6832~12 | R14 |
| K6832~14 | K6832~14 | G1 |
| K6832~15 | K6832~15 | G1, R14 |
| K6832~16 | K6832~16 | G1, R14 |
| K6832~17 | K6832~17 | G1 |
| K6832~18 | K6832~18 | R14 |
| K6832~19 | K6832~19 | R14 |
| K6832~20 | K6832~20 | R14 |
| K6832~21 | K6832~21 | R14 |
| K6832~22 | K6832~22 | R14 |
| K6832~24 | K6832~24 | R14 |
| K6832~25 | K6832~25 | R14 |
| K6832~26 | K6832~26 | R14 |
| K6832~27 | K6832~27 | R14 |
| K6832~29 | K6832~29 | G1, R14 |
| K6832~30 | K6832~30 | G1, R14 |
| K6832~31 | K6832~31 | G1, R14 |
| K6832~32 | K6832~32 | G1, R14 |
| K6832~33 | K6832~33 | G1 |
| K6832~34 | K6832~34 | R14 |
| K6832~35 | K6832~35 | R14 |
| K6832~36 | K6832~36 | R14 |
| K6832~37 | K6832~37 | R14 |
| K6832~38 | K6832~38 | G1, R14 |
| K6832~39 | K6832~39 | G1, R14 |
| K-none~2 | K-none~2 | R14 |
| L6749~2 | L6749~2 | R12 |
| L6749~3 | L6749~3 | R12, R14 |
| L6749~4 | L6749~4 | R12, R14 |
| L6360~2 | L6360~2 | R12 |
| L6360~3 | L6360~3 | R12, R14 |
| L6360~4 | L6360~4 | R12, R14 |
| L6961~3 | L6961~3 | R12 |
| L6961~4 | L6961~4 | R12, R14 |
| L6961~6 | L6961~6 | R12, R14 |
| L6961~7 | L6961~7 | R12 |
| FR6851~1 | FR6851~1 | R14 |
| FR6851~2 | FR6851~2 | R14 |
| FR6851~3 | FR6851~3 | R14 |
| FR6851~4 | FR6851~4 | R14 |
| CN6832~2 | CN6832~2 | R14 |
| CN5198~2 | CN5198~2 | R14 |
| CN6771~3 | CN6771~3 | R14 |
| CN6772~2 | CN6772~2 | R14 |
| CN6773~2 | CN6773~2 | R14 |
| CT6832~4 | CT6832~4 | R14 |
| CT6832~7 | CT6832~7 | R14 |
| CT6832~9 | CT6832~9 | R14 |
| CT6832~10 | CT6832~10 | R14 |
| CT6832~11 | CT6832~11 | R14 |
| CT-dd~3 | CT-dd~3 | R14 |
| CT-dd~4 | CT-dd~4 | R14 |
| CT-dd~5 | CT-dd~5 | R14 |
| CT-dd~6 | CT-dd~6 | R14 |
| CT-dd~7 | CT-dd~7 | R14 |
| AC6218~1 | AC6218~1 | R14 |
| BP9001~5 | BP9001~5 | R14 |
| BP9001~6 | BP9001~6 | R14 |
| BP9001-read~6 | BP9001-read~6 | R14 |
| BP9001-read~8 | BP9001-read~8 | R14 |
| S7001~4 | S7001~4 | R14 |
| HW:HW-nodhw | none (new) | R3, R14 |
| HW:HW-auto | none (new) | R3, R14 |
| HW:HW-auto-ended | none (new) | R3, R14 |
| HW:HW-on-until | none (new) | R3, R14 |
| HW:HW-off-until | none (new) | R3, R14 |
| HW:HW-on-v1 | none (new) | R3, R14 |
| HW:HW-off-v1 | none (new) | R3, R14 |
| HW:HW-cc-stale | none (new) | R3, R14 |
| HW:HW-cc-notreconf | none (new) | R3, R14 |
| HW:HW-cc-decode | none (new) | R3, R14 |
| HW:HW-nlh | none (new) | R3, R14 |
| L-none-0 | none (new) | R4 |
| L-none-1 | none (new) | R4, R14 |
| FAN-none-0 | none (new) | R4 |
| FAN-none-1 | none (new) | R4, R14 |
| H-none-0 | none (new) | R4 |
| H-none-1 | none (new) | R4, R14 |
| AC-none-0 | none (new) | R4 |
| AC-none-1 | none (new) | R4, R14 |
| CN-devoff | none (new) | R5 |
| O-0 | none (new) | R2 |
| O-choice | none (new) | R2, R14 |
| O-normal | none (new) | R2 |
| O-p1 | none (new) | R2, R14 |
| O-p1-after | none (new) | R2, R14 |
| O-none | none (new) | R2, R4, R14 |
| K-what | none (new) | R1 |
| K-when-pick | none (new) | R1 |
| K-when | none (new) | R1 |
| K-fine | none (new) | R1 |
| K-later | none (new) | R1 |
| K-earlier | none (new) | R1 |
| K-confirm-later | none (new) | R1, R15 |
| K-booked-later | none (new) | R1 |
| K-confirm-earlier | none (new) | R1, R15 |
| K-booked-earlier | none (new) | R1 |
| K-normal | none (new) | R1, R15 |
| K-auto-p1 | none (new) | R1, R15, R14 |
| K-book-fail | none (new) | R1 |
| K-cancelled | none (new) | R1 |
| K-when-unknown | none (new) | R1 |
| S-warm-buildheat | none (new) | R6 |
| S-buildheat | none (new) | R6, R14 |
| S-coldrads | none (new) | R6, R14 |
| S-broken-under | none (new) | R6 |
| S-broken-keepingup | none (new) | R6, R14 |
| S-off-frost | none (new) | R6 |
| S-offnoact | none (new) | R6 |
| CTL:compose-up | none (new) | R7 |
| CTL:compose-up-hold | none (new) | R7 |
| CTL:compose-down | none (new) | R7 |
| CTL:compose-frost | none (new) | R7 |
| CTL:compose-switch | none (new) | R7 |
| CTL:inflight | none (new) | R7 |
| CTL:slow | none (new) | R7 |
| CTL:confirmed | none (new) | R7 |
| CTL:confirmed-late | none (new) | R7 |
| CTL:already | none (new) | R7 |
| CTL:nondelivery | none (new) | R7 |
| CTL:indeterminate | none (new) | R7 |
| CTL:finish-up | none (new) | R7 |
| CTL:finish-frost | none (new) | R7 |
| CTL:finish-switch | none (new) | R7 |
| CTL:finish-fail | none (new) | R7 |
| CTL:release-ok | none (new) | R7 |
| CTL:release-fail | none (new) | R7 |
| CTL:escalate-indet | none (new) | R7, R14 |
| CTL:escalate-nondel | none (new) | R7, R14 |
| WS-offline | none (new) | R5, R13 |
| CD-ws | none (new) | R8 |
| CD-saved | none (new) | R8 |
| CD-declined | none (new) | R8 |
| K-banner | none (new) | R1 |
| CB-list | none (new) | R10 |
| CB-drawer | none (new) | R10 |
| TONIGHT | none (new) | R9 |
| TONIGHT-query | none (new) | R9 |
| TICKET-TEXT | none (new) | R10 |
| SH:p1fail | none (new) | R7, R14 |
| SITE-ambiguous-logged | none (new) | R10, R14 |
| F:unm:Kitchen | none (new) | R14 |
| F:unm:Kitchen:after | none (new) | R14 |
| RQ:K8888~12 | none (new) | R14 |
| RQ:K8888~18 | none (new) | R14 |
| RQ:K8888~29 | none (new) | R14 |
| RQ:K6832~18 | none (new) | R14 |
| RQ:K8888-gw-B-unscheduled~2 | none (new) | R14 |
| RQ:K8888-gw-B-outside~2 | none (new) | R14 |
| RQ:K-none~2 | none (new) | R14 |
| F:kitchen:Kitchen | none (new) | R14 |
| F:kitchen:Kitchen:after | none (new) | R14 |
| UQ:K8888~46 | none (new) | R15 |
| UU:K8888~46 | none (new) | R15 |
| UN:K8888~46 | none (new) | R15 |
| UQ:K8888~51 | none (new) | R15 |
| UU:K8888~51 | none (new) | R15 |
| UN:K8888~51 | none (new) | R15 |
| UQ:K6832~23 | none (new) | R15 |
| UU:K6832~23 | none (new) | R15 |
| UN:K6832~23 | none (new) | R15 |
| UQ:K6832~28 | none (new) | R15 |
| UU:K6832~28 | none (new) | R15 |
| UN:K6832~28 | none (new) | R15 |
| UQ:K6832~33 | none (new) | R15 |
| UU:K6832~33 | none (new) | R15 |
| UN:K6832~33 | none (new) | R15 |
| F:fan:Fans | none (new) | R14 |
| F:fan:Fans:after | none (new) | R14 |
| UK:FAN6851~2 | none (new) | R15 |
| UQ:FAN6851~2 | none (new) | R15 |
| UU:FAN6851~2 | none (new) | R15 |
| UN:FAN6851~2 | none (new) | R15 |
| UK:FAN-switch~3 | none (new) | R15 |
| UQ:FAN-switch~3 | none (new) | R15 |
| UU:FAN-switch~3 | none (new) | R15 |
| UN:FAN-switch~3 | none (new) | R15 |
| NT:L6749~3 | none (new) | R14 |
| RQ:L6749~3 | none (new) | R14 |
| NT:L6360~3 | none (new) | R14 |
| RQ:L6360~3 | none (new) | R14 |
| NT:L6961~4 | none (new) | R14 |
| RQ:L6961~4 | none (new) | R14 |
| F:ac:Air | none (new) | R14, R15 |
| F:ac:Air:after | none (new) | R14 |
| RQ:AC6218~1 | none (new) | R14, R15 |
| F:hw:Hot | none (new) | R14 |
| F:hw:Hot:after | none (new) | R14 |
| RQ:HW:HW-nodhw | none (new) | R14 |
| RQ:HW:HW-auto | none (new) | R14 |
| RQ:HW:HW-auto-ended | none (new) | R14 |
| RQ:HW:HW-on-until | none (new) | R14 |
| RQ:HW:HW-off-until | none (new) | R14 |
| RQ:HW:HW-on-v1 | none (new) | R14 |
| RQ:HW:HW-off-v1 | none (new) | R14 |
| RQ:HW:HW-cc-stale | none (new) | R14 |
| RQ:HW:HW-cc-notreconf | none (new) | R14 |
| RQ:HW:HW-cc-decode | none (new) | R14 |
| RQ:HW:HW-nlh | none (new) | R14 |
| F:conn:Conn | none (new) | R14 |
| F:conn:Conn:after | none (new) | R14 |
| RQ:CN6832~2 | none (new) | R14 |
| RQ:CN5198~2 | none (new) | R14 |
| RQ:CN6771~3 | none (new) | R14 |
| RQ:CN6772~2 | none (new) | R14 |
| RQ:CN6773~2 | none (new) | R14 |
| F:heat:Heat | none (new) | R14 |
| F:heat:Heat:after | none (new) | R14 |
| RQ:BP9001~5 | none (new) | R14 |
| RQ:BP9001~6 | none (new) | R14 |
| RQ:BP9001-read~6 | none (new) | R14 |
| RQ:BP9001-read~8 | none (new) | R14 |
| RQ:S7001~4 | none (new) | R14 |
| RQ:S-coldrads | none (new) | R14 |
| F:unm:Heat | none (new) | R14 |
| F:unm:Heat:after | none (new) | R14 |
| RQ:S-buildheat | none (new) | R14 |
| RQ:S-broken-keepingup | none (new) | R14 |
| RQ:CTL:escalate-indet | none (new) | R14 |
| RQ:CTL:escalate-nondel | none (new) | R14 |
| NT:CT6832~4 | none (new) | R14 |
| RQ:CT6832~4 | none (new) | R14 |
| NT:CT6832~9 | none (new) | R14 |
| RQ:CT6832~9 | none (new) | R14 |
| NT:CT6832~10 | none (new) | R14 |
| RQ:CT6832~10 | none (new) | R14 |
| NT:CT-dd~4 | none (new) | R14 |
| RQ:CT-dd~4 | none (new) | R14 |
| NT:CT-dd~5 | none (new) | R14 |
| RQ:CT-dd~5 | none (new) | R14 |
| F:unm:Lighting | none (new) | R14 |
| F:unm:Lighting:after | none (new) | R14 |
| RQ:L-none-1 | none (new) | R14 |
| F:unm:Fans | none (new) | R14 |
| F:unm:Fans:after | none (new) | R14 |
| RQ:FAN-none-1 | none (new) | R14 |
| RQ:H-none-1 | none (new) | R14 |
| F:unm:Air | none (new) | R14 |
| F:unm:Air:after | none (new) | R14 |
| RQ:AC-none-1 | none (new) | R14 |
| F:unm:Else | none (new) | R14 |
| F:unm:Else:after | none (new) | R14 |
| RQ:O-none | none (new) | R14 |
| F:site:Else | none (new) | R14 |
| F:site:Else:after | none (new) | R14 |
| RQ:SITE-ambiguous-logged | none (new) | R14 |

## Line-by-line differences (each line is either only in live or only in the prototype)

### K8888~10 (live K8888~10; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~11 (live K8888~11; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~12 (live K8888~12; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### K8888~13 (live K8888~13; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~15 (live K8888~15; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~16 (live K8888~16; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~18 (live K8888~18; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### K8888~19 (live K8888~19; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~21 (live K8888~21; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~22 (live K8888~22; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~25 (live K8888~25; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~26 (live K8888~26; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888~29 (live K8888~29; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### K8888~30 (live K8888~30; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Fryer. The manual override on the PowerPause panel didn't bring it on. Checked at 14:41: the fryer is off; it should have come on at 00:00.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Fryer. The manual override on the PowerPause panel didn't bring it on. Checked at 14:41: the fryer is off; it should have come on at 00:00.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~31 (live K8888~31; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~32 (live K8888~32; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and we can't use the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Fryer. The customer couldn't find the PowerPause panel to use the override. Checked at 14:41: the fryer is off; it should have come on at 00:00.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Fryer. The customer couldn't find the PowerPause panel to use the override. Checked at 14:41: the fryer is off; it should have come on at 00:00.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~33 (live K8888~33; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~34 (live K8888~34; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and it still isn't working, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Glass washer. Power reaches the equipment but the customer still thinks it's ours. Checked at 14:41: the glass washer is on; its timetable has it on.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Glass washer. Power reaches the equipment but the customer still thinks it's ours. Checked at 14:41: the glass washer is on; its timetable has it on.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~35 (live K8888~35; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~36 (live K8888~36; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Dishwasher. The manual override on the PowerPause panel didn't bring it on. Checked at 14:41: the dishwasher is off; it has no timetable, so it's meant to stay on.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Dishwasher. The manual override on the PowerPause panel didn't bring it on. Checked at 14:41: the dishwasher is off; it has no timetable, so it's meant to stay on.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~37 (live K8888~37; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~38 (live K8888~38; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and we can't use the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Dishwasher. The customer couldn't find the PowerPause panel to use the override. Checked at 14:41: the dishwasher is off; it has no timetable, so it's meant to stay on.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Dishwasher. The customer couldn't find the PowerPause panel to use the override. Checked at 14:41: the dishwasher is off; it has no timetable, so it's meant to stay on.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~39 (live K8888~39; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~40 (live K8888~40; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and it still isn't working, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Pot wash. Power reaches the equipment but the customer still thinks it's ours. Checked at 14:41: the pot wash is on; it's switched on but isn't drawing any power.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Pot wash. Power reaches the equipment but the customer still thinks it's ours. Checked at 14:41: the pot wash is on; it's switched on but isn't drawing any power.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~41 (live K8888~41; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~42 (live K8888~42; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Bain-marie. The manual override on the PowerPause panel didn't bring it on. Checked at 14:41: the bain-marie is off; its timetable has it off until 23:59.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Bain-marie. The manual override on the PowerPause panel didn't bring it on. Checked at 14:41: the bain-marie is off; its timetable has it off until 23:59.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~43 (live K8888~43; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~44 (live K8888~44; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and we can't use the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Bain-marie. The customer couldn't find the PowerPause panel to use the override. Checked at 14:41: the bain-marie is off; its timetable has it off until 23:59.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Bain-marie. The customer couldn't find the PowerPause panel to use the override. Checked at 14:41: the bain-marie is off; its timetable has it off until 23:59.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~45 (live K8888~45; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~47 (live K8888~47; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Fryer, Glass washer, Dishwasher, Pot wash and Bain-marie. The manual override on the PowerPause panel didn't bring it on. Checked at 14:41: the fryer is off; it should have come on at 00:00. Checked at 14:41: the glass washer is on; its timetable has it on. Checked at 14:41: the dishwasher is off; it has no timetable, so it's meant to stay on. Checked at 14:41: the pot wash is on; it's switched on but isn't drawing any power. Checked at 14:41: the bain-marie is off; its timetable has it off until 23:59.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Fryer, Glass washer, Dishwasher, Pot wash and Bain-marie. The manual override on the PowerPause panel didn't bring it on. Checked at 14:41: the fryer is off; it should have come on at 00:00. Checked at 14:41: the glass washer is on; its timetable has it on. Checked at 14:41: the dishwasher is off; it has no timetable, so it's meant to stay on. Checked at 14:41: the pot wash is on; it's switched on but isn't drawing any power. Checked at 14:41: the bain-marie is off; its timetable has it off until 23:59.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~48 (live K8888~48; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~49 (live K8888~49; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and we can't use the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Fryer, Glass washer, Dishwasher, Pot wash and Bain-marie. The customer couldn't find the PowerPause panel to use the override. Checked at 14:42: the fryer is off; it should have come on at 00:00. Checked at 14:42: the glass washer is on; its timetable has it on. Checked at 14:42: the dishwasher is off; it has no timetable, so it's meant to stay on. Checked at 14:42: the pot wash is on; it's switched on but isn't drawing any power. Checked at 14:42: the bain-marie is off; its timetable has it off until 23:59.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Fryer, Glass washer, Dishwasher, Pot wash and Bain-marie. The customer couldn't find the PowerPause panel to use the override. Checked at 14:42: the fryer is off; it should have come on at 00:00. Checked at 14:42: the glass washer is on; its timetable has it on. Checked at 14:42: the dishwasher is off; it has no timetable, so it's meant to stay on. Checked at 14:42: the pot wash is on; it's switched on but isn't drawing any power. Checked at 14:42: the bain-marie is off; its timetable has it off until 23:59.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888~50 (live K8888~50; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888~52 (live K8888~52; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888~53 (live K8888~53; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888~54 (live K8888~54; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888~55 (live K8888~55; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888~56 (live K8888~56; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888~57 (live K8888~57; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888~58 (live K8888~58; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888~59 (live K8888~59; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888~60 (live K8888~60; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888~61 (live K8888~61; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888-gw-B-unscheduled~2 (live K8888-gw-B-unscheduled~2; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### K8888-gw-B-unscheduled~3 (live K8888-gw-B-unscheduled~3; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888-gw-B-unscheduled~4 (live K8888-gw-B-unscheduled~4; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and it still isn't working, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Glass washer. Power reaches the equipment but the customer still thinks it's ours. Checked at 14:44: the glass washer is on; it has no timetable, so it stays on.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Glass washer. Power reaches the equipment but the customer still thinks it's ours. Checked at 14:44: the glass washer is on; it has no timetable, so it stays on.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888-gw-B-unscheduled~5 (live K8888-gw-B-unscheduled~5; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888-gw-B-unscheduled~6 (live K8888-gw-B-unscheduled~6; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888-gw-B-outside~2 (live K8888-gw-B-outside~2; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### K8888-gw-B-outside~3 (live K8888-gw-B-outside~3; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888-gw-B-outside~4 (live K8888-gw-B-outside~4; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and it still isn't working, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Glass washer. Power reaches the equipment but the customer still thinks it's ours. Checked at 14:45: the glass washer is on; it's on outside its timetable hours, so it was probably switched on at the PowerPause panel.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Glass washer. Power reaches the equipment but the customer still thinks it's ours. Checked at 14:45: the glass washer is on; it's on outside its timetable hours, so it was probably switched on at the PowerPause panel.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888-gw-B-outside~5 (live K8888-gw-B-outside~5; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888-gw-B-outside~6 (live K8888-gw-B-outside~6; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888-gw-off-unknown~3 (live K8888-gw-off-unknown~3; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888-gw-off-unknown~4 (live K8888-gw-off-unknown~4; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888-gw-off-unknown~5 (live K8888-gw-off-unknown~5; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Glass washer. The manual override on the PowerPause panel didn't bring it on. Checked at 14:45: the glass washer is on; its timetable can't be read right now.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Glass washer. The manual override on the PowerPause panel didn't bring it on. Checked at 14:45: the glass washer is on; its timetable can't be read right now.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888-gw-off-unknown~6 (live K8888-gw-off-unknown~6; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888-gw-off-unknown~7 (live K8888-gw-off-unknown~7; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and we can't use the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Glass washer. The customer couldn't find the PowerPause panel to use the override. Checked at 14:45: the glass washer is on; its timetable can't be read right now.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Glass washer. The customer couldn't find the PowerPause panel to use the override. Checked at 14:45: the glass washer is on; its timetable can't be read right now.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888-gw-off-unknown~8 (live K8888-gw-off-unknown~8; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888-gw-off-unknown~9 (live K8888-gw-off-unknown~9; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888-gw-off-unknown~10 (live K8888-gw-off-unknown~10; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888-gw-fallback~3 (live K8888-gw-fallback~3; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888-gw-fallback~4 (live K8888-gw-fallback~4; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K8888-gw-fallback~5 (live K8888-gw-fallback~5; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Glass washer. The manual override on the PowerPause panel didn't bring it on. Glass washer not connecting to us.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Glass washer. The manual override on the PowerPause panel didn't bring it on. Glass washer not connecting to us.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888-gw-fallback~6 (live K8888-gw-fallback~6; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888-gw-fallback~7 (live K8888-gw-fallback~7; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and we can't use the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Glass washer. The customer couldn't find the PowerPause panel to use the override. Glass washer not connecting to us.
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Glass washer. The customer couldn't find the PowerPause panel to use the override. Glass washer not connecting to us.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K8888-gw-fallback~8 (live K8888-gw-fallback~8; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K8888-gw-fallback~9 (live K8888-gw-fallback~9; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K8888-gw-fallback~10 (live K8888-gw-fallback~10; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K6832~4 (live K6832~4; items G1, R1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~7 (live K6832~7; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K6832~8 (live K6832~8; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K6832~11 (live K6832~11; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K6832~12 (live K6832~12; items R14)

- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K6832~14 (live K6832~14; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~15 (live K6832~15; items G1, R14)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)
- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K6832~16 (live K6832~16; items G1, R14)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)
- Live: Ask the customer: is the kitchen needed for service right now, with food being served or breakfast on?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, it's needed now
- Live: No, it can wait
- Prototype: Yes
- Prototype: No

### K6832~17 (live K6832~17; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~18 (live K6832~18; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### K6832~19 (live K6832~19; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Kitchen — pot wash. The manual override on the PowerPause panel didn't bring it on. Kitchen — pot wash connecting to us (older site: on/off state not visible).
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Kitchen — pot wash. The manual override on the PowerPause panel didn't bring it on. Kitchen — pot wash connecting to us (older site: on/off state not visible).
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K6832~20 (live K6832~20; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K6832~21 (live K6832~21; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and we can't use the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Kitchen — pot wash. The customer couldn't find the PowerPause panel to use the override. Kitchen — pot wash connecting to us (older site: on/off state not visible).
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Kitchen — pot wash. The customer couldn't find the PowerPause panel to use the override. Kitchen — pot wash connecting to us (older site: on/off state not visible).
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K6832~22 (live K6832~22; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K6832~24 (live K6832~24; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Kitchen — fryers. The manual override on the PowerPause panel didn't bring it on. Kitchen — fryers connecting to us (older site: on/off state not visible).
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Kitchen — fryers. The manual override on the PowerPause panel didn't bring it on. Kitchen — fryers connecting to us (older site: on/off state not visible).
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K6832~25 (live K6832~25; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K6832~26 (live K6832~26; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and we can't use the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Kitchen — fryers. The customer couldn't find the PowerPause panel to use the override. Kitchen — fryers connecting to us (older site: on/off state not visible).
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Kitchen — fryers. The customer couldn't find the PowerPause panel to use the override. Kitchen — fryers connecting to us (older site: on/off state not visible).
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K6832~27 (live K6832~27; items R14)

- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K6832~29 (live K6832~29; items G1, R14)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)
- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Kitchen — pot wash and Kitchen — fryers. The manual override on the PowerPause panel didn't bring it on. Kitchen — pot wash connecting to us (older site: on/off state not visible). Kitchen — fryers connecting to us (older site: on/off state not visible).
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Kitchen — pot wash and Kitchen — fryers. The manual override on the PowerPause panel didn't bring it on. Kitchen — pot wash connecting to us (older site: on/off state not visible). Kitchen — fryers connecting to us (older site: on/off state not visible).
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K6832~30 (live K6832~30; items G1, R14)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)
- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K6832~31 (live K6832~31; items G1, R14)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)
- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As you need the kitchen now and we can't use the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Kitchen equipment off during service — P1
- Live: Kitchen equipment off while the site is serving: Kitchen — pot wash and Kitchen — fryers. The customer couldn't find the PowerPause panel to use the override. Kitchen — pot wash connecting to us (older site: on/off state not visible). Kitchen — fryers connecting to us (older site: on/off state not visible).
- Prototype: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Kitchen equipment off, with an immediate risk to trade or to anyone's health and safety: Kitchen — pot wash and Kitchen — fryers. The customer couldn't find the PowerPause panel to use the override. Kitchen — pot wash connecting to us (older site: on/off state not visible). Kitchen — fryers connecting to us (older site: on/off state not visible).
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### K6832~32 (live K6832~32; items G1, R14)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)
- Live: Kitchen needed for service now: no, it can wait
- Prototype: Immediate risk to trade or to anyone's health and safety: no
- Live: On the ticket: Kitchen equipment off — not needed until later
- Prototype: On the ticket: Kitchen equipment off — no immediate risk

### K6832~33 (live K6832~33; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~34 (live K6832~34; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K6832~35 (live K6832~35; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K6832~36 (live K6832~36; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K6832~37 (live K6832~37; items R14)

- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K6832~38 (live K6832~38; items G1, R14)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)
- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K6832~39 (live K6832~39; items G1, R14)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)
- Live: Kitchen needed for service now: yes
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Kitchen equipment off during service — P1
- Prototype: On the ticket: Kitchen equipment off — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### K-none~2 (live K-none~2; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### L6749~2 (live L6749~2; items R12)

- Live: The lights came on with the on-site switch
- Prototype: The lights came on with the manual override

### L6749~3 (live L6749~3; items R12, R14)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override
- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As the lights are still off after the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: External lighting not working — P1
- Prototype: External lighting not working — risk to trade or health and safety — P1
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### L6749~4 (live L6749~4; items R12, R14)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override
- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: External lighting not working — P1
- Prototype: On the ticket: External lighting not working — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### L6360~2 (live L6360~2; items R12)

- Live: The lights came on with the on-site switch
- Prototype: The lights came on with the manual override

### L6360~3 (live L6360~3; items R12, R14)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override
- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As the lights are still off after the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: External lighting not working — P1
- Prototype: External lighting not working — risk to trade or health and safety — P1
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### L6360~4 (live L6360~4; items R12, R14)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override
- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: External lighting not working — P1
- Prototype: On the ticket: External lighting not working — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### L6961~3 (live L6961~3; items R12)

- Live: The lights came on with the on-site switch
- Prototype: The lights came on with the manual override

### L6961~4 (live L6961~4; items R12, R14)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override
- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As the lights are still off after the override, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: External lighting not working — P1
- Prototype: External lighting not working — risk to trade or health and safety — P1
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### L6961~6 (live L6961~6; items R12, R14)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override
- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: External lighting not working — P1
- Prototype: On the ticket: External lighting not working — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### L6961~7 (live L6961~7; items R12)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override

### FR6851~1 (live FR6851~1; items R14)

- Live: Ask the customer: is stock at risk right now, for example a freezer warming up or a big temperature alarm?
- Prototype: Ask the customer: Is there an immediate risk to trade or to anyone's health and safety?
- Prototype: ℹ For you (background, not to read out)
- Prototype: Trade means the site can't serve customers or can't open. Health and safety means anything that could hurt someone. Yes raises a P1: the IoT team's on-call agent is texted straight away and deals with it immediately. No logs it, and the IoT team picks it up the next working day.
- Live: Yes, stock is at risk
- Live: No, it's just a query
- Prototype: Yes
- Prototype: No

### FR6851~2 (live FR6851~2; items R14)

- Live: Stock is at risk right now
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As stock is at risk, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Refrigeration temperature alarm — stock at risk
- Live: Customer reports refrigeration failure with stock at risk. Monitoring-only on Lighthouse; escalated for immediate advice + appliance callout guidance.
- Prototype: Refrigeration alarm — risk to trade or health and safety — P1
- Prototype: Customer reports a refrigeration alarm with an immediate risk to trade or to anyone's health and safety. Monitoring-only on Lighthouse; escalated for immediate advice + appliance callout guidance.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### FR6851~3 (live FR6851~3; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### FR6851~4 (live FR6851~4; items R14)

- Live: Stock is at risk right now
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Refrigeration temperature alarm — stock at risk
- Prototype: On the ticket: Refrigeration alarm — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### CN6832~2 (live CN6832~2; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### CN5198~2 (live CN5198~2; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### CN6771~3 (live CN6771~3; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### CN6772~2 (live CN6772~2; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### CN6773~2 (live CN6773~2; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### CT6832~4 (live CT6832~4; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: As the engineer is on site now, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Contractor on site needs IoT support — P1
- Prototype: Contractor on site — risk to trade or health and safety — P1
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### CT6832~7 (live CT6832~7; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Contractor on site needs IoT support — P1
- Prototype: On the ticket: Contractor on site — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### CT6832~9 (live CT6832~9; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: PowerPause override failed — contractor on site — P1
- Prototype: Contractor on site, PowerPause override failed — risk to trade or health and safety — P1
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### CT6832~10 (live CT6832~10; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: Thanks. As the override hasn't brought it on, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: PowerPause override failed — contractor on site — P1
- Prototype: Contractor on site, PowerPause override failed — risk to trade or health and safety — P1
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### CT6832~11 (live CT6832~11; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: PowerPause override failed — contractor on site — P1
- Prototype: On the ticket: Contractor on site, PowerPause override failed — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### CT-dd~3 (live CT-dd~3; items R14)

- Live: Donkey Derby (site 7412): the override on site doesn't work here. This site uses a different type of panel, so the override button does not apply. This is the one case where you go straight to a P1.
- Prototype: Donkey Derby (site 7412): the override on site doesn't work here. This site uses a different type of panel, so the override button does not apply. The engineer can't be helped on site here, so go on to the risk question.
- Live: I'm sorry, this site can't be overridden on site. I'll raise it as urgent so the IoT team contacts the site directly. Their direct line is 023 814 0228, email iot@airedale-group.co.uk.
- Live: Continue to the P1
- Prototype: I'm sorry, this site can't be overridden on site. Our IoT team can help directly; their direct line is 023 814 0228, email iot@airedale-group.co.uk.
- Prototype: Continue

### CT-dd~4 (live CT-dd~4; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: As the engineer is on site now, I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Live: Contractor on site needs IoT support — P1
- Prototype: Contractor on site — risk to trade or health and safety — P1
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### CT-dd~5 (live CT-dd~5; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: This site's override doesn't work, so I'm going to raise this as urgent with our on-call team.
- Prototype: Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.
- Prototype: Why it's urgent (your words): (you haven't written this yet)
- Prototype: Why is this urgent? (required — goes on the P1 ticket)
- Prototype: Type why this is urgent (at least 10 characters) before you can raise the P1.

### CT-dd~6 (live CT-dd~6; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Live: On the ticket: Contractor on site needs IoT support — P1
- Prototype: On the ticket: Contractor on site — risk to trade or health and safety — P1
- Prototype: Why it's urgent is on the ticket, in your words.

### CT-dd~7 (live CT-dd~7; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: yes
- Prototype: Why it's urgent is on the ticket, in your words.

### AC6218~1 (live AC6218~1; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### BP9001~5 (live BP9001~5; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### BP9001~6 (live BP9001~6; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### BP9001-read~6 (live BP9001-read~6; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### BP9001-read~8 (live BP9001-read~8; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

### S7001~4 (live S7001~4; items R14)

- Prototype: 👤
- Prototype: Immediate risk to trade or to anyone's health and safety: no

## Identical screens

K8888~1, K8888~2, K8888~3, K8888~4, K8888~5, K8888~6, K8888~7, K8888~8, K8888~9, K8888~14, K8888~17, K8888~20, K8888~23, K8888~24, K8888~27, K8888~28, K8888~46, K8888~51, K8888-gw-B-unscheduled~1, K8888-gw-B-outside~1, K8888-gw-off-unknown~1, K8888-gw-off-unknown~2, K8888-gw-fallback~1, K8888-gw-fallback~2, K6832~1, K6832~2, K6832~3, K6832~5, K6832~6, K6832~9, K6832~10, K6832~13, K6832~23, K6832~28, K-none~1, L6749~1, L6360~1, L6961~1, L6961~2, FAN6851~1, FAN6851~2, FAN-switch~1, FAN-switch~2, FAN-switch~3, CN6832~1, CN5198~1, CN6771~1, CN6771~2, CN6772~1, CN6773~1, CT6832~1, CT6832~2, CT6832~3, CT6832~5, CT6832~6, CT6832~8, CT-dd~1, CT-dd~2, BP9001~1, BP9001~2, BP9001~3, BP9001~4, BP9001-read~1, BP9001-read~2, BP9001-read~3, BP9001-read~4, BP9001-read~5, BP9001-read~7, S7001~1, S7001~2, S7001~5, S6832-cold~1, S6832-cold~2, S6832-cold~3, S6832-near~3, BPdone-on, BPdone-off, HOME, SEARCH-none, SITE-confirm, SITE-ambiguous, WORKSPACE, CB-empty
