<!-- gate:contract
SECTION: What this design covers.
Two tightly-scoped changes to the Outside Lighting triage flow, designed as one piece of work because they touch the same screen. OOHDASH-112 rewrites the words the handler reads to the caller so they explain the dusk sensor, the one-off override, and the automatic reset — exact copy already authored and coverage-checked by the Writer. OOHDASH-111 upgrades the "still not working" outcome from a next-working-day capture to a live P1 escalation that texts the on-duty manager, reusing the escalation plumbing that already powers the Kitchen, Fridge and Contractor P1 outcomes. Both changes live in one client-side file (public/js/flows.js); 111 reuses the already-gated /api/outcomes P1 path. No new services, no database changes, no new endpoints, and nothing new runs in the background. Runtime cost is zero — these are edits to text and a function call, not new infrastructure.

SECTION: The one real decision in this work.
Outside Lighting ends in two outcomes: "caller sorted it with the override" and "still not working". Only the second one becomes a P1. If the caller fixed it with the override, the lights are on, nobody needs paging, and that path stays exactly as it is today (a logged capture). Escalating the resolved path would text the on-duty manager about a problem the caller just solved — wrong and noisy. This is decision D1 and it is settled: escalate "still not working" only.

DECISION: D1 — Escalate the "still not working" branch to P1 only; leave "caller sorted it with the override" as an unchanged capture. | Agree: ship as designed | Escalate both branches (not recommended) | Discuss

SECTION: What must be true before the P1 part goes live.
The P1 text-message path is shared with the Kitchen, Fridge and Contractor escalations. Before this ships, someone with production access needs to confirm the live SMS provider is actually set to send (not in log-only mode) — carried here as condition D2, owner Spencer / IoT ops. The exact wording for 112 also needs a sign-off from Sam Day (condition D3) — three specific questions are listed in the document for him. The copy change (112) carries no behaviour risk and can ship first; the P1 change (111) is held until D2 is confirmed.

DECISION: D2 — Confirm SMS_PROVIDER=twilio is active in production before the lighting P1 trigger ships (shared with K3/FR1/CTR1). | Confirmed live | Still in log mode — hold 111 | Spencer to check

DECISION: D3 — Sam Day signs off the 112 wording (three questions in the doc). | Approved as written | Changes requested | Route to Sam
-->

# Design — OOHDASH-111 & OOHDASH-112: Outside Lighting P1 escalation + supporting text

**Date:** 2026-10-08
**Stage:** Design (post-discovery, pre-build)
**Repo / branch:** `C:\repos\ooh-triage-dashboard` · `gate/oohdash-111-112-design`
**Live app:** https://ooh.airedale-group.io (v1.3.3)
**Source of truth (discovery):** `docs/project/DISCOVERY_oohdash-111-112-outside-lighting.md` (gate-cleared)
**Design owner:** Design doer

---

## 1. Problem recap

The Outside Lighting triage flow in `public/js/flows.js` guides an out-of-hours handler through a late-evening call where a site's external lights are not on. Discovery confirmed two gaps. First (OOHDASH-112): the read-aloud script tells the caller there is a manual override but never explains the *why* — that the lights are on a dusk-till-dawn sensor, that the override is a harmless one-off, and that everything resets automatically tomorrow — so callers are left unsure whether they are breaking something permanent. Second (OOHDASH-111): when the override does **not** fix it, the flow currently files a next-working-day capture, so a dark car park on a Friday night waits until Monday with no one paged — even though the P1 escalation plumbing (the `ooh_p1` tag, the on-duty-manager SMS, the audit trail) already exists and already serves the Kitchen, Fridge and Contractor flows. This design realises both: the words, and the escalation. (Discovery §2.1, §3, §8.)

---

## 2. OOHDASH-112 — supporting text (text-only)

### 2.1 What changes

One line changes: the `div.script` read-aloud at `public/js/flows.js:594`. Today the script is built from a single mid-sentence ternary that inserts a fuse-board clause when the controller is offline. The Writer's new copy is two distinct, fully-written sentences for the online and offline states, so the cleanest implementation is to promote the ternary to select the **whole** sentence per state. No chip labels, no step headings, no outcome classification, and no `div.alert.info` content changes. This is the pattern the brief calls for: update both interpolated forms of the ternary.

### 2.2 Before → after

**BEFORE (current `flows.js:594`):**

```js
   <div class="script">“There’s a manual override for the outside lights${lg.online ? '' : ' — but first it’s worth checking your fuse board, because the lighting controller isn’t responding'}. If you have the Lighthouse lighting switch, flick it to override and they’ll come on.”</div>
```

The two interpolated forms this produces today:

- **Online (ternary → `''`):** "There's a manual override for the outside lights. If you have the Lighthouse lighting switch, flick it to override and they'll come on."
- **Offline (ternary → clause):** "There's a manual override for the outside lights — but first it's worth checking your fuse board, because the lighting controller isn't responding. If you have the Lighthouse lighting switch, flick it to override and they'll come on."

**AFTER (proposed `flows.js:594`):**

```js
   <div class="script">“${lg.online
       ? 'The outside lights have a sensor that brings them on automatically at dusk — so they should usually look after themselves. If tonight’s an exception, flip the Lighthouse lighting switch to override and they’ll come on. That only affects tonight; the sensor picks everything back up automatically from tomorrow, so there’s nothing to reset.'
       : 'The outside lights have a sensor that brings them on automatically at dusk, so they should usually look after themselves. The lighting controller isn’t responding at the moment — it’s worth checking your fuse board first, as a tripped breaker is the usual cause. If everything looks clear, flip the Lighthouse lighting switch to override — that only covers tonight, and the sensor picks everything back up automatically from tomorrow.'}”</div>
```

The two interpolated forms this produces (Writer's verbatim copy):

- **Online branch (`lg.online` truthy):**
  > "The outside lights have a sensor that brings them on automatically at dusk — so they should usually look after themselves. If tonight's an exception, flip the Lighthouse lighting switch to override and they'll come on. That only affects tonight; the sensor picks everything back up automatically from tomorrow, so there's nothing to reset."

- **Offline branch (`lg.online` falsy):**
  > "The outside lights have a sensor that brings them on automatically at dusk, so they should usually look after themselves. The lighting controller isn't responding at the moment — it's worth checking your fuse board first, as a tripped breaker is the usual cause. If everything looks clear, flip the Lighthouse lighting switch to override — that only covers tonight, and the sensor picks everything back up automatically from tomorrow."

### 2.3 Design note on punctuation

The wording is the Writer's copy, verbatim. In the code form above, apostrophes and the spaced dash are rendered with the file's existing typographic convention (curly `'`, em dash `—`) so the new line matches every other `div.script` in `flows.js` — this is house-style punctuation normalisation only, not a wording change. Build must keep the file UTF-8 (the file already contains curly quotes throughout). The surrounding `"…"` display quotes are the existing `.script` wrapper and are unchanged.

### 2.4 Coverage check (discovery 112-R1..R5)

| Requirement | Online copy | Offline copy |
|---|---|---|
| 112-R1 override is a one-off/disposable | "That only affects tonight… nothing to reset" | "that only covers tonight" |
| 112-R2 schedule resumes automatically | "the sensor picks everything back up automatically from tomorrow" | "the sensor picks everything back up automatically from tomorrow" |
| 112-R3 dusk sensor explained | "a sensor that brings them on automatically at dusk" | "a sensor that brings them on automatically at dusk" |
| 112-R4 applies in both script variants | yes | yes (plus fuse-board check retained) |
| 112-R5 text-only, no behaviour change | no chips/headings/classes touched | no chips/headings/classes touched |

---

## 3. OOHDASH-111 — Outside Lighting P1 escalation

### 3.1 The pattern to mirror (quoted from the live code)

All three existing auto-P1 outcomes call the same `outcomeP1(f, key, {...})` helper. K3 (Kitchen) is the cleanest template — `flows.js:566`:

```js
return outcomeP1(f, 'crit', {
    subject: 'Kitchen equipment off during service — P1',
    detail: 'Kitchen circuits off while the site is actively serving. Remote switching not available; needs immediate IoT action.',
    script: 'This is urgent so I’ve escalated it right now — a text has gone to our on-duty manager and someone will call you back shortly. In the meantime the on-site override switch, if you have one, is safe to use.',
    p1Summary: 'Kitchen equipment off during service'
});
```

The shape is four fields: `subject`, `detail`, `script`, `p1Summary`. Note it carries **no** `OohCaptureClass` — that field belongs only to `outcomeCaptured`. `outcomeP1` (`flows.js:242`) posts `type:'escalate-p1'`, which `routes/api.js:253` detects and routes to `priority:'urgent'` + `extraTags:['ooh_p1']` + `escalation.escalateP1(..., origin:'ooh-dashboard')`. The lighting change needs **no** server edit — it reuses this path exactly as K3/FR1/CTR1 do.

### 3.2 Before → after (the `r:'cap'` branch only)

**BEFORE (current `flows.js:607–612` — the "still not working" branch):**

```js
            return outcomeCaptured(f, 'cap', {
                subject: 'External lighting not working',
                detail: 'Manual override did not resolve; possible tripped supply or failed controller. Needs IoT/electrical follow-up.',
                script: 'I’ve logged this for the IoT team to investigate first thing. If the pub frontage being dark is a safety concern tonight, your own electrician or duty manager procedure applies — this may be an electrical supply issue rather than the lighting control.',
                OohCaptureClass: 'lighting'
            });
```

**AFTER (proposed — escalate to P1):**

```js
            doneLine('Override did not resolve — P1');
            return outcomeP1(f, 'cap', {
                subject: 'External lighting not working — P1',
                detail: 'Manual override did not resolve the outside lights; possible tripped supply or failed controller. Remote switching not available — needs immediate IoT/electrical follow-up.',
                script: 'I’ve escalated this as urgent — a text has gone to our on-duty manager and someone will call you back shortly. If the dark frontage is a safety concern right now, your site’s duty-manager procedure for calling out an electrician still applies, as this may be an electrical supply issue rather than the lighting control.',
                p1Summary: 'External lighting not responding'
            });
```

**Changes, line by line:**
- `outcomeCaptured` → `outcomeP1` (the whole behaviour switch: tag, priority, SMS, audit).
- `subject` gains the `— P1` suffix, matching the K3/CTR1 house convention.
- `detail` reworded to reflect urgency (keeps the "tripped supply or failed controller" diagnosis).
- `script` reframed from "logged for first thing" to "escalated as urgent, text has gone", **retaining** the safety caveat about the site's own electrician/duty-manager route (this real-world advice survives the reframe).
- `OohCaptureClass:'lighting'` is **dropped** (not used by `outcomeP1`); replaced by `p1Summary:'External lighting not responding'`, which becomes the SMS body the on-duty manager reads.
- A `doneLine('Override did not resolve — P1')` is **added** so the flow trail shows the escalation — every other P1 branch (K3, FR1) writes a `doneLine`; the current cap branch is the only P1-bound path without one. This is a minor consistency adjunct inside the "still not working" branch, not a scope expansion.

### 3.3 The override-resolved branch stays a capture (unchanged)

The `r:'ok'` branch at `flows.js:600–605` is **not touched**. It remains `outcomeCaptured`, blue card, no SMS, no `ooh_p1` tag:

```js
            if (f.data.r === 'ok') {
                doneLine('Resolved via on-site override');
                return outcomeCaptured(f, 'ok', {
                    subject: 'External lighting — resolved with on-site override',
                    detail: 'Caller used the manual override successfully after guidance. Logged so the IoT team can check why the schedule/automation didn’t fire.',
                    script: 'Great — that’s them on. I’ve still logged it so the team can check why they didn’t come on automatically.',
                    OohCaptureClass: 'lighting'
                });
            }
```

### 3.4 Proposed `p1Summary` string

**`p1Summary: 'External lighting not responding'`**

Rationale: `p1Summary` is passed to `escalation.escalateP1` as `summary` and becomes the SMS body the on-duty manager reads on their phone (`routes/api.js:275`). It must be short, scannable, and unambiguous about *what* failed. "External lighting not responding" matches the register of FR1's `'Refrigeration failure — stock at risk'` and CTR1's `'Contractor on site: …'` — a noun-phrase describing the fault, not a sentence. The site name and ticket link are added by the escalation layer, so the summary only carries the fault.

---

## 4. D1 decision — escalate "still not working" only

**Decision: Only the "still not working" (`r:'cap'`) branch becomes P1. The "caller sorted it with the override" (`r:'ok'`) branch stays an unchanged capture.**

**Rationale.** The two branches represent opposite call outcomes. In `r:'ok'` the lights are on — the caller just fixed them with the override; there is nothing for an on-duty manager to action, and paging them would be false urgency and SMS noise (and cost). In `r:'cap'` the override failed, the frontage is dark, and the fault is now plausibly an electrical supply or controller failure that genuinely needs someone tonight. The standup brief said "the Outside Lighting triage outcome" (singular), and the only outcome that warrants a page is the unresolved one. This also avoids discovery risk R2 (a P1 card telling a caller "someone will call you back" when they have already sorted it). Escalating both would be the wrong design; escalating the resolved path is explicitly rejected.

---

## 5. Gate conditions to carry

| # | Condition | Owner | Why it matters | Status |
|---|---|---|---|---|
| D2 | Confirm `SMS_PROVIDER=twilio` is active (not `log`) in production before the lighting P1 trigger ships | Spencer / IoT ops | The P1 SMS path is **shared** with K3/FR1/CTR1. If prod is still in log mode, enabling lighting P1 does not change send behaviour — but D2 must be confirmed so the escalation genuinely pages someone, and so live SMS spend is acknowledged. `config.js:100` defaults `SMS_PROVIDER` to `'log'`; the live value is not readable from source. | **Open — carry to build/ops** |
| D3 | Sam Day signs off the OOHDASH-112 wording | Sam Day (IoT Support lead) | The copy is caller-facing and makes claims about how the hardware behaves (dusk sensor, automatic reset). SME must confirm those claims are true for the estate. | **Open — carry to review** |
| B2C | Live-app walkthrough validation was blocked by Azure B2C auth at design time | Build/Tester | The design is verified against source (exact line numbers, exact helper shapes) and a pixel-faithful mockup, but the running flow was not clicked through live during design because the app sits behind B2C sign-in. Validate on the live/preview app at build or test — or attempt during build with CIR B2C credentials if available. | **Open — validate at build/test** |

### D3 — the Writer's three sign-off questions for Sam

1. **Dusk sensor universality:** Is it true for *every* Lighthouse external-lighting site that the lights are on an automatic dusk-till-dawn light sensor? The copy states this unconditionally ("have a sensor that brings them on automatically at dusk"). If any site is schedule-only (timer, no sensor), the online copy would mislead.
2. **Automatic next-day reset:** After a manual override, do the lights reliably return to automatic/sensor control the *following* dusk with no human reset? The copy promises "the sensor picks everything back up automatically from tomorrow, so there's nothing to reset." Is that always the case, or can an override latch until cleared?
3. **Fuse board / tripped breaker as usual cause (offline copy):** When the controller is "not responding", is a tripped breaker genuinely the *most common* cause we want the caller sent to check first? The offline copy leads the caller to the fuse board before the override. Confirm that is the right first action and won't send callers to the wrong place.

---

## 6. Cost / token-efficiency and silent-running assessment (mandatory)

- **Token / £-cost:** Zero marginal runtime cost. Both stories are edits to client-side JavaScript strings and one function call. No LLM tokens are consumed (there is no model in this path). No new API calls, compute, or storage. The only recurring £-cost is the P1 SMS itself — one text per genuine unresolved-lighting P1 — which is bounded by call volume and is the *intended* spend of the feature, shared with the three existing P1 outcomes. Nothing here scales cost unbounded.
- **Silent background running:** No background, polling, watcher, daemon, scheduled, or wake-on-timer component is introduced or touched. The P1 SMS fires only on a real operator action (clicking "still not working") — it does real work only when there is real work, never to poll. Fully compliant.

---

## 7. Fields touched (naming reference for build + test)

No schema changes. The outcome POST (`/api/outcomes`) already accepts every field used; 111 changes only *which* values the lighting branch sends.

| Field | Where set | 111 lighting value | Meaning |
|---|---|---|---|
| `type` | `outcomeP1` → `finishOutcome` | `'escalate-p1'` | Triggers `isP1` path in `routes/api.js:253` (tag + SMS). |
| `subject` | flow renderer | `'External lighting not working — P1'` | Zendesk ticket subject / `issueLabel`. |
| `detail` | flow renderer | see §3.2 | Human detail shown on the outcome card and in the transcript. |
| `p1Summary` | flow renderer | `'External lighting not responding'` | SMS body to the on-duty manager (`escalation.escalateP1` `summary`). |
| `issueCls` | `outcomeP1` | `'red'` | Call-summary chip colour (red for P1). |
| `extraTags` | `routes/api.js:267` | `['ooh_p1']` (derived from `isP1`) | The single place `ooh_p1` is applied — unchanged, inherited. |
| `priority` | `routes/api.js:266` | `'urgent'` (derived) | Zendesk priority — unchanged, inherited. |

---

## 8. Test notes — what the Playwright e2e must assert

Extends the existing suite (naming/pattern per `p1-dispatch-honesty.test.js`). The flow is reachable by opening a site with a `kind:'lighting'` device and selecting the External Lighting tile.

**OOHDASH-111:**
1. **P1 fires on "still not working":** device present + online → override guidance → click **"Still not working — capture & escalate"** → the rendered card is `.outcome.p1` with `data-testid="outcome-p1"` and heading "Escalated — P1" (NOT `.outcome.captured`). The POST to `/api/outcomes` carries `type:'escalate-p1'`; the resulting ticket carries tags including `ooh_p1` and `priority:'urgent'`.
2. **Override-resolved does NOT escalate (regression guard):** same setup → click **"Caller sorted it with the override"** → card is `.outcome.captured` (`data-testid="outcome-captured"`), no `ooh_p1` tag, no SMS dispatch, `priority:'normal'`.
3. **Log-mode honesty:** with `SMS_PROVIDER=log`, the P1 card's `data-testid="p1-dispatch-status"` shows the "Text not sent — phone the on-duty manager now" fallback, not "a text message has been sent". (Existing behaviour, now also exercised on the lighting path.)
4. **No-device guard:** site with no `kind:'lighting'` device → scoped "not on Lighthouse" message; the P1 path is unreachable.
5. **`p1Summary` propagation:** assert the dispatched escalation `summary` equals `'External lighting not responding'`.

**OOHDASH-112:**
6. **Online script text present:** online device → `.script` contains all three points — the dusk sensor, "only affects tonight", and "picks everything back up automatically from tomorrow".
7. **Offline script text present:** offline device → `.script` contains the three points **plus** the fuse-board / tripped-breaker check.
8. **Responsive render:** at ≤1100px the `.script` block renders inside `.flowbody` with no overflow (the `wsgrid` collapses to one column; flow text is identical across viewports — discovery §2.4).

**Unhappy path (unchanged, assert it still holds):** an outcome POST failure mid-P1 surfaces the inline "Couldn't record the outcome… Try again" state (`finishOutcome` `_err_` path) — no silent drop, no auto-retry loop.

---

## 9. Mockups

Pixel-faithful, self-contained HTML (real class names and the live CSS tokens inlined), at desktop and ≤1100px:

- `docs/project/mockups/OOH_OUTSIDE_LIGHTING_mockup_2026-10-08.html`

It shows: the revised read-aloud script (112) in both online and offline states; the new P1 outcome card (111) in both dispatch-sent and log-mode-fallback states; and, for contrast, the unchanged override-resolved capture card — proving the two branches render differently. The app is light-theme only (no `prefers-color-scheme`/`data-theme` in `public/css/styles.css`), so the faithful mockup is light; this is a match to the live app, not an omission.

---

## 10. Handoff to Build

- **Contract:** this document. Two edits, one file (`public/js/flows.js`): line 594 (112) and the `r:'cap'` branch at 607–612 (111). 111 also adds one `doneLine`. No server change — the `/api/outcomes` P1 path is reused unchanged.
- **Visual truth:** the mockup above.
- **Load-bearing CX moments not to flatten:** the P1 card must read as *decisive* ("a text has gone… someone will call you back"); the script must keep the reassurance that the override is harmless and self-resetting. These are the "great looks like" from discovery §8.
- **Open flags:** D2 (SMS provider — blocks 111 going live), D3 (Sam's wording sign-off — blocks 112), B2C live-walkthrough validation (carry to build/test). 112 can ship first (zero behaviour risk); 111 holds on D2.
