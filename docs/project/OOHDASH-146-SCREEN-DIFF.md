# OOHDASH-146 screen-text diff, revision 3 (prototype against live v1.6.6)

Method: the real app (origin/main 916f6e3, v1.6.6) was run in fixture mode with writes enabled and a script clicked every button on every flow, saving each screen's html and text. The prototype is built from those captured screens. Example site name, house number and ticket numbers are normalised on both sides (item N1). This script then loads the finished prototype, reads the text of every screen and compares it line by line with the text of the live screen it came from.

## Result

- Prototype screens: 298 (211 taken from live, 81 authored for 146).
- Identical to live after example-data normalisation: 195.
- Differ from live, every difference mapped to an item below: 22.
- New in 146 (no live screen), each mapped to an item: 81 of 81.
- **Unexplained differences: 0.**
- Live screens captured but not shown in the prototype: 244 (mostly control-window and duplicate crawl states; the replaced and removed live screens are listed under "Live screens replaced").
- Click test: 2579 clicks on 298 screens; dead buttons: 0; buttons that lead to a missing screen: 0; JS errors: 0.

## Live screens not carried into the prototype (crawl states per scenario)

L6961: 1, L-none: 7, FAN-switch: 5, FAN-none: 7, HW-nodhw: 3, HW-auto: 3, HW-auto-ended: 3, HW-on-until: 3, HW-off-until: 3, HW-on-v1: 3, HW-off-v1: 3, HW-cc-stale: 3, HW-cc-notreconf: 3, HW-cc-decode: 3, HW-nlh: 2, CN7004: 2, CN-devoff: 2, O6832: 12, AC-none: 1, S6832: 46, S6832-cold: 28, S6832-near: 30, S7001: 1, S7003: 18, S-none: 7, BP6234: 41, BP9001-read: 4. These are replaced by the changed screens named in the items below (HW-* by R3, O6832 by R2, CN7004 and CN-devoff by R5, the "Continue under Something else" dead ends in L-none, FAN-none, S-none by R4, the heating agent-button screens by R6), or are crawl states that only show a control window left open.

## The "differs from live" list

| Item | What changes |
|---|---|
| R1 | Kitchen: a one-off change for the next time (D8). New first question when the customer needs a different time, the equipment's next times, the safety question, a check step, a booked card, a cancel path and a site banner. The live answer "It's fine, but we need it at different times" goes to this step instead of straight to the timetable form. "Different times every week" still goes to the live form. |
| R2 | Something else, redesigned (D5, D11). The customer picks what it is about and the dashboard starts that issue's questions; the two agent-judgement buttons and the "it is controlled, go back" dead end are gone. The urgent-or-not question and the P1 are as live. |
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

## Screens that differ from live, and why

| Prototype screen | Live source | Items |
|---|---|---|
| K6832~4 | K6832~4 | G1, R1 |
| K6832~14 | K6832~14 | G1 |
| K6832~15 | K6832~15 | G1 |
| K6832~16 | K6832~16 | G1 |
| K6832~17 | K6832~17 | G1 |
| K6832~29 | K6832~29 | G1 |
| K6832~30 | K6832~30 | G1 |
| K6832~31 | K6832~31 | G1 |
| K6832~32 | K6832~32 | G1 |
| K6832~33 | K6832~33 | G1 |
| K6832~38 | K6832~38 | G1 |
| K6832~39 | K6832~39 | G1 |
| L6749~2 | L6749~2 | R12 |
| L6749~3 | L6749~3 | R12 |
| L6749~4 | L6749~4 | R12 |
| L6360~2 | L6360~2 | R12 |
| L6360~3 | L6360~3 | R12 |
| L6360~4 | L6360~4 | R12 |
| L6961~3 | L6961~3 | R12 |
| L6961~4 | L6961~4 | R12 |
| L6961~6 | L6961~6 | R12 |
| L6961~7 | L6961~7 | R12 |
| HW:HW-nodhw | none (new) | R3 |
| HW:HW-auto | none (new) | R3 |
| HW:HW-auto-ended | none (new) | R3 |
| HW:HW-on-until | none (new) | R3 |
| HW:HW-off-until | none (new) | R3 |
| HW:HW-on-v1 | none (new) | R3 |
| HW:HW-off-v1 | none (new) | R3 |
| HW:HW-cc-stale | none (new) | R3 |
| HW:HW-cc-notreconf | none (new) | R3 |
| HW:HW-cc-decode | none (new) | R3 |
| HW:HW-nlh | none (new) | R3 |
| L-none-0 | none (new) | R4 |
| L-none-1 | none (new) | R4 |
| FAN-none-0 | none (new) | R4 |
| FAN-none-1 | none (new) | R4 |
| H-none-0 | none (new) | R4 |
| H-none-1 | none (new) | R4 |
| AC-none-0 | none (new) | R4 |
| AC-none-1 | none (new) | R4 |
| CN-devoff | none (new) | R5 |
| O-0 | none (new) | R2 |
| O-choice | none (new) | R2 |
| O-normal | none (new) | R2 |
| O-p1 | none (new) | R2 |
| O-p1-after | none (new) | R2 |
| O-none | none (new) | R2, R4 |
| K-what | none (new) | R1 |
| K-when-pick | none (new) | R1 |
| K-when | none (new) | R1 |
| K-fine | none (new) | R1 |
| K-later | none (new) | R1 |
| K-earlier | none (new) | R1 |
| K-attend-later | none (new) | R1 |
| K-confirm-later | none (new) | R1 |
| K-booked-later | none (new) | R1 |
| K-attend-earlier | none (new) | R1 |
| K-confirm-earlier | none (new) | R1 |
| K-booked-earlier | none (new) | R1 |
| K-attend-no | none (new) | R1 |
| K-book-fail | none (new) | R1 |
| K-cancelled | none (new) | R1 |
| K-when-unknown | none (new) | R1 |
| S-warm-buildheat | none (new) | R6 |
| S-buildheat | none (new) | R6 |
| S-coldrads | none (new) | R6 |
| S-broken-under | none (new) | R6 |
| S-broken-keepingup | none (new) | R6 |
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
| CTL:escalate-indet | none (new) | R7 |
| CTL:escalate-nondel | none (new) | R7 |
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
| SH:p1fail | none (new) | R7 |
| SITE-ambiguous-logged | none (new) | R10 |

## Line-by-line differences (each line is either only in live or only in the prototype)

### K6832~4 (live K6832~4; items G1, R1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~14 (live K6832~14; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~15 (live K6832~15; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~16 (live K6832~16; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~17 (live K6832~17; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~29 (live K6832~29; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~30 (live K6832~30; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~31 (live K6832~31; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~32 (live K6832~32; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~33 (live K6832~33; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~38 (live K6832~38; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### K6832~39 (live K6832~39; items G1)

- Live: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether them are on)
- Prototype: Kitchen — pot wash and Kitchen — fryers are connecting to us (this site can't show whether they are on)

### L6749~2 (live L6749~2; items R12)

- Live: The lights came on with the on-site switch
- Prototype: The lights came on with the manual override

### L6749~3 (live L6749~3; items R12)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override

### L6749~4 (live L6749~4; items R12)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override

### L6360~2 (live L6360~2; items R12)

- Live: The lights came on with the on-site switch
- Prototype: The lights came on with the manual override

### L6360~3 (live L6360~3; items R12)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override

### L6360~4 (live L6360~4; items R12)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override

### L6961~3 (live L6961~3; items R12)

- Live: The lights came on with the on-site switch
- Prototype: The lights came on with the manual override

### L6961~4 (live L6961~4; items R12)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override

### L6961~6 (live L6961~6; items R12)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override

### L6961~7 (live L6961~7; items R12)

- Live: The lights are still off after the on-site switch
- Prototype: The lights are still off after the manual override

## Identical screens

K8888~1, K8888~2, K8888~3, K8888~4, K8888~5, K8888~6, K8888~7, K8888~8, K8888~9, K8888~10, K8888~11, K8888~12, K8888~13, K8888~14, K8888~15, K8888~16, K8888~17, K8888~18, K8888~19, K8888~20, K8888~21, K8888~22, K8888~23, K8888~24, K8888~25, K8888~26, K8888~27, K8888~28, K8888~29, K8888~30, K8888~31, K8888~32, K8888~33, K8888~34, K8888~35, K8888~36, K8888~37, K8888~38, K8888~39, K8888~40, K8888~41, K8888~42, K8888~43, K8888~44, K8888~45, K8888~46, K8888~47, K8888~48, K8888~49, K8888~50, K8888~51, K8888~52, K8888~53, K8888~54, K8888~55, K8888~56, K8888~57, K8888~58, K8888~59, K8888~60, K8888~61, K8888-gw-B-unscheduled~1, K8888-gw-B-unscheduled~2, K8888-gw-B-unscheduled~3, K8888-gw-B-unscheduled~4, K8888-gw-B-unscheduled~5, K8888-gw-B-unscheduled~6, K8888-gw-B-outside~1, K8888-gw-B-outside~2, K8888-gw-B-outside~3, K8888-gw-B-outside~4, K8888-gw-B-outside~5, K8888-gw-B-outside~6, K8888-gw-off-unknown~1, K8888-gw-off-unknown~2, K8888-gw-off-unknown~3, K8888-gw-off-unknown~4, K8888-gw-off-unknown~5, K8888-gw-off-unknown~6, K8888-gw-off-unknown~7, K8888-gw-off-unknown~8, K8888-gw-off-unknown~9, K8888-gw-off-unknown~10, K8888-gw-fallback~1, K8888-gw-fallback~2, K8888-gw-fallback~3, K8888-gw-fallback~4, K8888-gw-fallback~5, K8888-gw-fallback~6, K8888-gw-fallback~7, K8888-gw-fallback~8, K8888-gw-fallback~9, K8888-gw-fallback~10, K6832~1, K6832~2, K6832~3, K6832~5, K6832~6, K6832~7, K6832~8, K6832~9, K6832~10, K6832~11, K6832~12, K6832~13, K6832~18, K6832~19, K6832~20, K6832~21, K6832~22, K6832~23, K6832~24, K6832~25, K6832~26, K6832~27, K6832~28, K6832~34, K6832~35, K6832~36, K6832~37, K-none~1, K-none~2, L6749~1, L6360~1, L6961~1, L6961~2, FAN6851~1, FAN6851~2, FAN-switch~1, FAN-switch~2, FAN-switch~3, FR6851~1, FR6851~2, FR6851~3, FR6851~4, CN6832~1, CN6832~2, CN5198~1, CN5198~2, CN6771~1, CN6771~2, CN6771~3, CN6772~1, CN6772~2, CN6773~1, CN6773~2, CT6832~1, CT6832~2, CT6832~3, CT6832~4, CT6832~5, CT6832~6, CT6832~7, CT6832~8, CT6832~9, CT6832~10, CT6832~11, CT-dd~1, CT-dd~2, CT-dd~3, CT-dd~4, CT-dd~5, CT-dd~6, CT-dd~7, AC6218~1, BP9001~1, BP9001~2, BP9001~3, BP9001~4, BP9001~5, BP9001~6, BP9001-read~1, BP9001-read~2, BP9001-read~3, BP9001-read~4, BP9001-read~5, BP9001-read~6, BP9001-read~7, BP9001-read~8, S7001~1, S7001~2, S7001~4, S7001~5, S6832-cold~1, S6832-cold~2, S6832-cold~3, S6832-near~3, BPdone-on, BPdone-off, HOME, SEARCH-none, SITE-confirm, SITE-ambiguous, WORKSPACE, CB-empty
