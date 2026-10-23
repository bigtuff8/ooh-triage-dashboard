/**
 * Guided flows (F012, design §4): smart issue entry, 8 category tiles + the
 * system-triggered connection check, chat-style steps, recommendation cards,
 * uniform outcome cards. Every outcome records a Zendesk ticket via
 * POST /api/outcomes (F011/F017); P1s report the text-message dispatch (F014).
 */

/* ------------------------ categories + keyword matcher ------------------------ */
const CATS = [
    { k: 'heating', ic: '🌡️', t: 'Heating', d: 'Too cold, too hot, turn it off, not working' },
    { k: 'hotwater', ic: '🚿', t: 'Hot water', d: 'None, not enough, too hot' },
    { k: 'kitchen', ic: '🍳', t: 'Kitchen equipment', d: 'Fryers, grills, glasswashers off / turning off' },
    { k: 'lighting', ic: '💡', t: 'External lighting', d: 'Outside / car park lights' },
    { k: 'fan', ic: '🌀', t: 'Extractor fans', d: 'Fans on/off or wrong times' },
    { k: 'fridge', ic: '🧊', t: 'Fridges & freezers', d: 'Temperature alarms, not cooling' },
    { k: 'contractor', ic: '🧰', t: 'Contractor on site', d: 'Engineer needs Lighthouse info now' },
    { k: 'other', ic: '✍️', t: 'Something else / not sure', d: 'Describe it in the caller’s words' }
];
const HIDDENCATS = [
    { k: 'connectivity', ic: '📡', t: 'Connection check', d: 'Lighthouse gateway / equipment not responding' },
    // OOHDASH-82 (design §6): aircon is not a top-level tile — it is reached from smart-entry keywords
    // (suggestion chip) and the in-context shortcut in the heating step. Both start the `aircon` flow,
    // whose only outcome is a captured referral to the IoT team (no dashboard control of AC).
    { k: 'aircon', ic: '❄️', t: 'Air conditioning', d: 'Handled by the IoT team — captured and referred' }
];
const KEYWORDS = [
    { k: 'hotwater', words: ['hot water', 'no water', 'shower', 'tap', 'washing up', 'wash up'] },
    // OOHDASH-82 (design §6): aircon keywords route a typed request straight to the referral. Ordered
    // before heating so "air con" / "aircon" / "cooling" score to aircon, not heating's 'warm'/'cold'.
    { k: 'aircon', words: ['air con', 'aircon', 'a/c', 'air conditioning', 'cooling', 'air-con'] },
    { k: 'heating', words: ['heat', 'cold', 'freez', 'warm', 'too hot', 'boiling hot', 'radiator', 'temperature', 'thermostat', 'boiler'] },
    { k: 'kitchen', words: ['fryer', 'grill', 'glasswash', 'dishwash', 'oven', 'merrychef', 'kitchen', 'equipment', 'no power', 'lincat', 'coffee', 'pot wash', 'deep clean'] },
    { k: 'lighting', words: ['light', 'dark', 'car park', 'festoon', 'sign'] },
    { k: 'fan', words: ['fan', 'extract', 'ventilat'] },
    { k: 'fridge', words: ['fridge', 'freezer', 'chill', 'cellar'] },
    { k: 'connectivity', words: ['offline', 'red light', 'flashing', 'no connection', 'internet', 'wifi', 'nothing work', 'not responding', 'router', 'gateway'] },
    { k: 'contractor', words: ['engineer', 'contractor', 'bellrock', 'dpp', 'on site', 'bms'] }
];

function catOf(k) { return CATS.concat(HIDDENCATS).find(c => c.k === k); }

function issueSearch(q) {
    const box = $('#isugg');
    // The caller's words are held in state and read back by startSuggestedFlow —
    // NEVER interpolated into inline handler source (quotes in natural speech,
    // e.g. "won't", break a JS string inside an onclick attribute).
    state.smartEntryText = q;
    q = q.trim().toLowerCase();
    if (q.length < 3) { box.innerHTML = ''; return; }
    const scores = {};
    for (const g of KEYWORDS) for (const w of g.words) if (q.includes(w)) scores[g.k] = (scores[g.k] || 0) + w.length;
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => catOf(k)).filter(Boolean);
    box.innerHTML = (ranked.length
        ? `Sounds like: ${ranked.map(c => `<button class="chip" data-testid="suggest-${c.k}" style="padding:5px 12px;min-height:0" onclick="startSuggestedFlow('${c.k}')">${c.ic} ${c.t}</button>`).join(' ')} or `
        : 'No obvious match — ')
        + `<button class="chip" data-testid="suggest-other" style="padding:5px 12px;min-height:0" onclick="startSuggestedFlow('other')">✍️ Continue with what you typed</button>`;
}

/** Starts a flow suggested from smart entry, carrying the typed caller words from state. */
function startSuggestedFlow(k) {
    startFlow(k, state.smartEntryText || '');
}

/**
 * Starts a category-tile flow, carrying the typed caller words from state (Test 10).
 * Symmetric with startSuggestedFlow — the tile path must carry the handler's words too.
 * The text stays in state.smartEntryText and is NEVER interpolated into the onclick
 * attribute (quotes/apostrophes in natural speech would break the inline handler).
 */
function startTileFlow(k) {
    startFlow(k, state.smartEntryText || '');
}

/* ------------------------ flow engine ------------------------ */
/**
 * Starts a guided flow, restoring any matching sessionStorage draft (OOHDASH-119 E18).
 * opts.carryNotes — true on in-flow shortcuts (aircon from heating, other-shortcut) to
 * carry the in-memory additionalNotes across instead of restoring from sessionStorage.
 * Does NOT clear the sessionStorage draft — clearing only happens at explicit end-of-call points.
 */
function startFlow(k, freeText, opts) {
    const siteNo = state.workspace?.site?.siteNo || null;
    let additionalNotes = '';
    if (opts?.carryNotes && state.flow?.data?.additionalNotes) {
        // Carry the in-memory value when an in-flow shortcut transitions between flow types
        additionalNotes = state.flow.data.additionalNotes;
    } else if (siteNo) {
        // Restore from sessionStorage (E18: survives reload; does NOT clear the draft)
        additionalNotes = notesDraftRestore(siteNo, k) || '';
    }
    state.flow = { cat: k, stage: 0, data: { freeText: freeText || '', _flowKey: k, additionalNotes }, done: [] };
    render();
}

function cancelFlow() {
    if (confirm('Cancel this issue? Anything recorded so far will still be captured to a ticket if a step was completed.')) {
        notesDraftClear(); // OOHDASH-119: clear the draft on explicit cancel
        state.flow = null;
        render();
    }
}

function flowStep(patch) {
    state.flow.stage++;
    Object.assign(state.flow.data, patch || {});
    render();
}

function doneLine(txt) { state.flow.done.push(txt); }

/* ------------------------ heating area model (OOHDASH-82, design §7) ------------------------ */

// Fixed display order for the two caller-meaningful areas (Accommodation first, design §7.1).
const HEATING_AREA_ORDER = ['Accommodation', 'Bar/Restaurant'];

/**
 * The site's heating devices for the area model — Salus iT700/iT500 (design §7.1), PLUS pub
 * boiler-panel devices so the existing boiler-panel read/guidance branch is not lost (design §7.1
 * notes the boiler-panel case must still be handled; §7.5 keeps its branch working unchanged). This
 * structurally excludes gateways, aircon (intesis, now kind `aircon`), and temp sensors, so no
 * serial/gateway can ever become an area chip even independent of the classifier reorder (§5
 * structural backstop). Boiler-panels derive a null `area` and so surface under the fallback chip.
 */
function heatingDevices() {
    return state.workspace.devices.filter(d =>
        d.deviceType === 'salus-it700' || d.deviceType === 'salus-it500'
        // OOHDASH-123 (D-DARK-FLEETS): the old-convention bare `salus` units are heating devices too.
        // They are dark (not reporting) so they only ever surface the "device not reporting" branch,
        // never a controllable reading.
        || d.deviceType === 'salus' || d.deviceType === 'boiler-panel');
}

/**
 * OOHDASH-123 (D-DARK-FLEETS): a dark-fleet heating device is a Salus iT500 or an older bare-salus
 * unit. These are non-controllable and, in practice, offline (they stopped reporting telemetry), so an
 * area made up only of them is surfaced as "device not reporting" with no controls (not the generic
 * gateway "not responding" branch). deviceType is the authoritative signal (registry marks both dark).
 */
function isDarkFleet(d) {
    return !!d && (d.deviceType === 'salus-it500' || d.deviceType === 'salus');
}

/** True when the site has any aircon (Intesis) device — gates the in-context aircon shortcut (§6). */
function siteHasAircon() {
    return state.workspace.devices.some(d => d.kind === 'aircon');
}

/**
 * The DISTINCT non-null area names present across heatingDevices(), in fixed display order (design
 * §7.1) — at most Accommodation and Bar/Restaurant.
 */
function heatingAreasPresent() {
    const present = new Set(heatingDevices().map(d => d.area).filter(Boolean));
    return HEATING_AREA_ORDER.filter(a => present.has(a));
}

/** True when any controllable heating device has a null area — drives the fallback chip (design §7.2). */
function hasUnmappedHeating() {
    // OOHDASH-128 (D3): unplaced bare-salus units are kept out of the "Heating — area not identified"
    // fallback chip. They are shown in the site-level footnote only. Unmapped iT500 and
    // boiler-panel devices still drive the fallback chip exactly as before.
    return heatingDevices().some(d => !d.area && !isUnplacedLegacySalus(d));
}

/** The device SET for a chosen area name; the fallback area (null) resolves to all unmapped devices. */
function devicesForArea(area) {
    return area === null
        // OOHDASH-128 (D3): unplaced bare-salus units are excluded from the null-area fallback set.
        ? heatingDevices().filter(d => !d.area && !isUnplacedLegacySalus(d))
        : heatingDevices().filter(d => d.area === area);
}

/** OOHDASH-128: true when d is an older-convention bare-salus unit (deviceType "salus") with no area. */
function isUnplacedLegacySalus(d) { return !!d && d.deviceType === 'salus' && !d.area; }
/** OOHDASH-128: all bare-salus devices with no area at this site. */
function unplacedLegacySalus() { return heatingDevices().filter(isUnplacedLegacySalus); }

/**
 * areaRepresentative(devices) — the single representative reading for an area (design §7.3, B1-read):
 * the COLDEST online thermostat. Returns null when no device in the set is online (→ connectivity
 * branch). Among online devices, picks the lowest current temperature (localTemperature, then
 * roomSensor1Temp); ties break by deviceId ascending; if no online device has a numeric temperature,
 * the first online device by deviceId ascending. Degrades cleanly: a single-device area returns it.
 */
function areaRepresentative(devices) {
    const online = (devices || []).filter(d => d.online);
    if (!online.length) return null;
    const tempOf = d => {
        const t = d.telemetry || {};
        if (typeof t.localTemperature === 'number') return t.localTemperature;
        if (typeof t.roomSensor1Temp === 'number') return t.roomSensor1Temp;
        return null;
    };
    const byId = (a, b) => String(a.deviceId).localeCompare(String(b.deviceId));
    const withTemp = online.filter(d => tempOf(d) != null);
    if (!withTemp.length) return [...online].sort(byId)[0];
    return withTemp.sort((a, b) => {
        const ta = tempOf(a), tb = tempOf(b);
        return ta !== tb ? ta - tb : byId(a, b);
    })[0];
}

function renderFlow() {
    const f = state.flow;
    const c = catOf(f.cat);
    let body = '';
    if (f.stage === 99 && f.data._outcomeHtml) {
        // OOHDASH-119: replace %%NOTESPOST%% placeholder with the rendered post-submit box
        body = f.data._outcomeHtml.replace('%%NOTESPOST%%', notesPostBox(f.data._ticketId));
    } else {
        try { body = FLOWR[f.cat](state.workspace, f); }
        catch (e) { body = `<div class="alert err">Flow error: ${esc(e.message)}</div>`; }
    }
    // OOHDASH-119 FLOW-BOX: inject the notes textarea into every active step (stage < 99).
    // At stage 99 the notes post-box is already embedded in the outcome HTML above.
    const notesBox = f.stage !== 99
        ? notesField({ id: 'addnotes', bind: 'flow', value: f.data.additionalNotes || '' })
        : '';
    return `<div class="flowpanel" data-testid="flow-panel">
  <div class="flowhead"><span style="font-size:18px">${c.ic}</span><b>${c.t}</b><span class="small" style="margin-left:6px">guided flow</span><button class="btn link" style="margin-left:auto" onclick="cancelFlow()">Cancel issue</button></div>
  <div class="flowbody">${f.data.freeText ? `<div class="stepdone"><span>💬</span>Caller's words: "${esc(f.data.freeText)}"</div>` : ''}${f.done.map(d => `<div class="stepdone"><span class="tick">✓</span>${d}</div>`).join('')}${body}${notesBox}</div>
  <div class="flowfoot"><span>Operator: <b>${esc(state.me.operator.name)}</b></span><span style="margin-left:auto">Everything here is recorded to the Zendesk ticket automatically</span></div>
 </div>`;
}

/* ------------------------ outcome plumbing (async → ticket) ------------------------ */
function outButtons() {
    return `<div class="outbtns"><button class="btn" data-testid="add-another-issue" onclick="anotherIssue()">➕ Add another issue</button><button class="btn primary" data-testid="end-call" onclick="endCall()">✔ End call</button></div>`;
}

function anotherIssue() { notesDraftClear(); state.flow = null; render(); } // OOHDASH-119: clear draft

function registerIssue(label, cls, ticketId) {
    if (state.call) state.call.issues.push({ label, cls, ticket: ticketId });
}

/**
 * OOHDASH-119 E2 — Records an outcome exactly once per flow key after an agent confirms
 * the outcome on the confirm step. Failure renders inline with a manual retry.
 *
 * Confirm step flow (operator decision B1+B2):
 *   chip click → _conf_ stored, confirm step rendered (outcome description + FLOW-BOX + Record button)
 *   Record outcome click → submitPendingOutcome → sets _pend_, fires POST, renders outcome card
 *
 * The existing _pend_ double-fire guard and Try-again error path are preserved.
 */
function finishOutcome(f, key, payload, renderCard) {
    // Already succeeded — return the cached card HTML
    if (f.data['_out_' + key]) return f.data['_out_' + key];
    // Error state — show inline retry
    if (f.data['_err_' + key]) {
        const msg = f.data['_err_' + key];
        return `<div class="alert err">Couldn’t record the outcome: ${esc(msg)}
   <button class="chip" style="margin-left:8px" onclick="state.flow.data['_err_${key}']=null;state.flow.data['_pend_${key}']=null;state.flow.data['_conf_${key}']=null;render()">Try again</button></div>`;
    }
    // Store the payload and renderCard idempotently on first visit
    if (!f.data['_conf_' + key]) {
        f.data['_conf_' + key] = { ...payload };
        f.data['_renderCard_' + key] = renderCard;
    }
    // Submitting — loading state
    if (f.data['_pend_' + key]) {
        return '<div class="alert info">Recording the outcome…</div>';
    }
    // Confirm step: show outcome description + Record outcome button
    // (The FLOW-BOX is injected by renderFlow outside this function so it stays live during the step)
    return `<div class="confirm-step" data-testid="confirm-step">
  <div class="alert info" style="margin-bottom:8px">
   <b>${esc(payload.subject)}</b>
   ${payload.detail ? `<div style="margin-top:4px;font-size:0.9em">${esc(payload.detail)}</div>` : ''}
  </div>
  <button class="btn primary" data-testid="record-outcome" style="margin-top:4px" onclick="submitPendingOutcome('${key}')">Record outcome</button>
 </div>`;
}

/**
 * OOHDASH-119 — fires the actual POST after the agent clicks "Record outcome".
 * Global so it can be called from the inline onclick in the confirm step HTML.
 */
window.submitPendingOutcome = function submitPendingOutcome(key) {
    const f = state.flow;
    if (!f) return;
    const payload = f.data['_conf_' + key];
    if (!payload) return;
    // Retrieve the renderCard stored on the closure captured in the outcome helper.
    // We stored it alongside the payload at _renderCard_ when the confirm step was first built.
    const renderCard = f.data['_renderCard_' + key];
    f.data['_pend_' + key] = 1;
    render(); // shows the loading state immediately
    const ws = state.workspace;
    api.post('/api/outcomes', {
        siteNo: ws.site.siteNo,
        siteName: ws.site.siteName,
        callerWords: f.data.freeText || null,
        additionalNotes: (f.data.additionalNotes || '').trim() || null, // OOHDASH-119; DF-01: trim so whitespace-only → null
        ...payload
    }).then(res => {
        notesDraftClear(); // OOHDASH-119: clear sessionStorage draft on success
        const echo = f.data.freeText
            ? `<div class="stepdone small" data-testid="outcome-callerwords"><span>💬</span>Recorded from the caller: “${esc(f.data.freeText)}”</div>`
            : '';
        const notesEcho = (f.data.additionalNotes || '').trim()
            ? (() => {
                const isP1 = payload.type === 'escalate-p1';
                const tid = res?.ticket?.id ?? null; // guard: id may be absent on degraded response
                const ref = tid ? `ticket #${tid}` : 'the ticket';
                const mid = isP1
                    ? `Your notes are on ${ref} for the morning review: “${esc(f.data.additionalNotes)}” (not in the urgent text)`
                    : `Your notes are on ${ref}: “${esc(f.data.additionalNotes)}”`;
                return `<div class="stepdone small" data-testid="addnotes-echo"><span>📝</span>${mid}</div>`;
            })()
            : '';
        const card = renderCard ? renderCard(res) : '';
        const html = echo + notesEcho + card + '%%NOTESPOST%%' + outButtons();
        f.data['_out_' + key] = html;
        f.data._ticketId = res.ticket.id;
        registerIssue(payload.issueLabel || payload.subject, payload.issueCls || 'blue', res.ticket.id);
        f.stage = 99;
        f.data._outcomeHtml = html;
        render();
    }).catch(err => {
        f.data['_err_' + key] = err.message;
        f.data['_pend_' + key] = null;
        render();
    });
};

function outcomeCaptured(f, key, { subject, detail, script, OohCaptureClass }) {
    return finishOutcome(f, key,
        { type: 'capture', subject, detail, OohCaptureClass, issueLabel: subject, issueCls: 'blue' },
        res => `<div class="outcome captured" data-testid="outcome-captured"><h3>📥 Captured for the IoT team</h3><p>${detail}</p>
  <p style="margin-top:4px">This will be actioned on the <b>next working day</b> — it is logged, not lost.</p>
  <div class="script">“${script}”</div><p class="small">Ticket <b>#${res.ticket.id}</b></p></div>`);
}

function outcomeP1(f, key, { subject, detail, script, p1Summary, OohCaptureClass }) {
    return finishOutcome(f, key,
        { type: 'escalate-p1', subject, detail, p1Summary, OohCaptureClass: OohCaptureClass || null, issueLabel: subject, issueCls: 'red' },
        res => `<div class="outcome p1" data-testid="outcome-p1"><h3>🚨 Escalated — P1</h3><p>${detail}</p>
  <p style="margin-top:4px" data-testid="p1-dispatch-status">The P1 is logged as ticket <b>#${res.ticket.id}</b> in the IoT Support dashboard, which pages the on-duty manager.</p>
  <div class="script">“${script}”</div><p class="small">Ticket <b>#${res.ticket.id}</b></p></div>`);
}

/* ------------------------ OOHDASH-134: P1 Escalation in "Something else" ------------------------ */

const OTHER_P1_SUMMARY_MAX = 80;

/**
 * Text-message summary for a "Something else" P1: whitespace collapsed, prefixed, and cut to at most
 * 80 characters (77 + "..."). The full reason stays in the ticket detail.
 */
function otherP1Summary(text) {
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!t) return 'Something else - see ticket'; // defensive only: the UI guard blocks an empty reason
    const s = 'Something else: ' + t;
    return s.length > OTHER_P1_SUMMARY_MAX ? s.slice(0, OTHER_P1_SUMMARY_MAX - 3) + '...' : s;
}

/** The reason for a "Something else" P1: the stage-0 caller words, else the inline reason box. Blank = ''. */
function otherP1Reason(f) {
    const typed = String(f.data.qraw || '').trim();
    return typed || String(f.data.p1reason || '').trim();
}

/** Choice step after "Capture & escalate as described": P1 Escalation or Raise a Normal Priority ticket. */
function otherP1Choice(f) {
    const hasStage0Text = !!String(f.data.qraw || '').trim();
    const blocked = !otherP1Reason(f);
    const reasonBox = hasStage0Text ? '' : `<div class="formrow" style="margin-top:10px"><label for="op1reason">Reason for a P1 (required to escalate)</label>
   <textarea id="op1reason" data-testid="other-p1-reason" rows="2" oninput="otherP1ReasonInput(this.value)">${esc(f.data.p1reason || '')}</textarea></div>
   <p class="small p1-blocked-note" data-testid="other-p1-blocked-note"${blocked ? '' : ' hidden'}>Type the reason this is a P1 before escalating.</p>`;
    return `<div class="stepq">How should this be raised?</div>${reasonBox}
   <div class="chips">
    <button class="chip p1" data-testid="other-p1" onclick="raiseOtherP1()"${blocked ? ' disabled aria-disabled="true"' : ''}>P1 Escalation</button>
    <button class="chip" data-testid="other-normal" onclick="flowStep({path:'normal'})">Raise a Normal Priority ticket</button>
   </div>
   <div class="p1-explainer" data-testid="other-p1-explainer">
    <p>A P1 is anything that is immediately health and safety or business trading affecting.</p>
    <p>Please only use this option after you've attempted to follow through one of the circumstance tiles.</p>
    <p>P1 escalation will send a text to the escalation manager on the IoT Support team immediately upon submission.</p>
   </div>`;
}

/** Inline reason box handler: keeps the value across re-renders and enables P1 only for a non-blank reason. */
function otherP1ReasonInput(value) {
    const f = state.flow;
    if (!f) return;
    f.data.p1reason = value;
    const ok = !!otherP1Reason(f);
    const btn = document.querySelector('[data-testid="other-p1"]');
    if (btn) { btn.disabled = !ok; if (ok) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', 'true'); }
    const note = document.querySelector('[data-testid="other-p1-blocked-note"]');
    if (note) note.hidden = ok;
}

/** P1 button: re-checks the reason guard (D4) so a blank reason can never be escalated. */
function raiseOtherP1() {
    const f = state.flow;
    if (!f) return;
    const reason = otherP1Reason(f);
    if (!reason) {
        const note = document.querySelector('[data-testid="other-p1-blocked-note"]');
        if (note) note.hidden = false;
        return;
    }
    flowStep({ path: 'p1', p1reason: reason });
}

function outcomeScope(f, key, { subject, evidence, script }) {
    return finishOutcome(f, key,
        { type: 'scope-only', subject, detail: evidence, issueLabel: subject, issueCls: 'grey' },
        res => `<div class="outcome scope" data-testid="outcome-scope"><h3>ℹ️ Not on Lighthouse at this site</h3><p>${evidence}</p>
  <div class="script">“${script}”</div><p class="small">Logged as ticket <b>#${res.ticket.id}</b> (scope-only) so we can track “blame Lighthouse” calls</p></div>`);
}

function outcomeNoAction(f, key, { subject, detail, script }) {
    return finishOutcome(f, key,
        { type: 'no-action', subject, detail, issueLabel: subject, issueCls: 'grey' },
        res => `<div class="outcome noaction" data-testid="outcome-noaction"><h3>📝 Call logged — no action taken</h3><p>${detail}</p>
  ${script ? `<div class="script">“${script}”</div>` : ''}<p class="small">Ticket <b>#${res.ticket.id}</b></p></div>`);
}

function otherShortcut() {
    return `<div class="chips" style="margin-top:8px"><button class="chip" onclick="startFlow('other', state.flow?.data?.freeText||'', {carryNotes:true})">Continue under "Something else"</button></div>`;
}

function ctlPlaceholder() { return '<div class="alert info">Complete the control action in the window…</div>'; }

/**
 * D10 — a device offers remote on/off only when it carries the `switch` capability AND is online
 * AND has registered with the platform (published first state). Anything short of all three falls
 * back to the capture path, so we never present a switch that would be silently dropped.
 */
function canSwitch(d) {
    return !!d && (d.capabilities || []).includes('switch') && d.online && d.registered !== false;
}

/**
 * Per-circuit Turn ON / Turn OFF buttons — only the OPPOSITE of the current state is offered (a
 * circuit reading ON shows Turn OFF, and vice-versa). Renders nothing when the device isn't
 * switchable (canSwitch false) — the flow's capture fallback still applies.
 */
function switchButtons(d, testid) {
    if (!canSwitch(d)) return '';
    const isOn = !!d.telemetry?.switch_1;
    return `<div class="switchbtns" style="display:flex;gap:6px;margin-left:auto">${isOn
        ? `<button class="btn" data-testid="${testid}-off" onclick="startSwitch('${esc(d.deviceId)}','off')">Turn OFF</button>`
        : `<button class="btn primary" data-testid="${testid}-on" onclick="startSwitch('${esc(d.deviceId)}','on')">Turn ON</button>`}</div>`;
}

/** Opens the control modal for a Tuya switch circuit (looked up by deviceId in the live workspace). */
function startSwitch(deviceId, dir) {
    const dev = state.workspace.devices.find(d => d.deviceId === deviceId);
    if (!dev) { toast('⚠️ Device no longer in the live inventory — refresh the site.'); return; }
    openControl(dev, dir === 'on' ? 'switchon' : 'switchoff');
}

/* ------------------------ site connectivity anchor + group labels (OOHDASH-91 G2) ------------------------ */
// NOTE (build deviation, recorded): the canonical, unit-tested rule lives in services/tb-device.js
// (siteConnectivityAnchor / equipmentGroupLabel). These browser copies exist ONLY because public/js is
// served as plain global scripts with no bundler/module system, so the connectivity handler here cannot
// import the server ESM module. The algorithm is textually identical to the tb-device.js version; both
// read the device NAME (client-side the name lives on `deviceId`, server-side on `name`). Keep the two in
// lock-step if the rule ever changes.

// normaliseName — identical to services/tb-device.js normaliseName (lower-case, strip parenthetical
// cross-refs, `_`→`-`, collapse whitespace). Duplicated for the same no-bundler reason as above.
function normaliseName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/_/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

const ANCHOR_SEGMENT = 'lwgateway';
const GATEWAY_GROUP_TOKENS = ['r10a', 'gw', 'gateway'];
const GROUP_LABELS = { boiler: 'boiler', maindb: 'main distribution board', kitchen: 'kitchen', salusit700: 'heating' };

function deviceNameSegments(d) {
    return normaliseName(d && (d.name != null ? d.name : d.deviceId)).split(/[-\s]+/).filter(Boolean);
}

/**
 * siteConnectivityAnchor(devices) -> device | null. Pure, read-only. The site connectivity anchor is the
 * LoRaWAN hub: the device whose normalised name has a segment EXACTLY equal to `lwgateway` (segment-
 * equality, NOT substring, so no -r10a/Salus gateway can pose as it). 0 candidates → null (gateway-less
 * site). >1 (pathological) → first by sorted normalised name. Reads only the name; derives no liveness.
 */
function siteConnectivityAnchor(devices) {
    const candidates = (devices || []).filter(d => deviceNameSegments(d).includes(ANCHOR_SEGMENT));
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const nm = d => normaliseName(d && (d.name != null ? d.name : d.deviceId));
    return [...candidates].sort((a, b) => { const na = nm(a), nb = nm(b); return na < nb ? -1 : na > nb ? 1 : 0; })[0];
}

/**
 * equipmentGroupLabel(device) -> string | null. Pure, read-only. Resolves a non-anchor gateway's
 * equipment group to its natural-English operator label on the SAME split-segment basis as the anchor
 * rule: find the gateway token (r10a/gw/gateway) segment, take the segment IMMEDIATELY preceding it, map
 * via GROUP_LABELS. Unknown token → the safe generic 'the equipment group' (NEVER the raw token). Returns
 * null when no gateway token segment exists (fronts no group — e.g. a spare lwgateway), excluding it.
 */
function equipmentGroupLabel(device) {
    const segs = deviceNameSegments(device);
    const i = segs.findIndex(s => GATEWAY_GROUP_TOKENS.includes(s));
    if (i <= 0) return null;
    return GROUP_LABELS[segs[i - 1]] || 'the equipment group';
}

/* -------- OOHDASH-136: DHW override outcome helpers (browser twin of tb-device.js) -------- */
// NOTE: keep this algorithm in lock-step with services/tb-device.js dhwOverrideOutcome.
// U20 enforces behavioral parity. A change to one must touch the other.
// Constants must match config.js defaults (60 min stale, 35 min V1 confirm).
const _BOILER_STALE_MS = 60 * 60 * 1000;
const _BOILER_V1_CONFIRM_MS = 35 * 60 * 1000;

function _dhwFmtTime(ms, nowMs) {
    var tz = 'Europe/London';
    var d = new Date(ms);
    var timeStr = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    var timeDisp = timeStr === '00:00' ? 'midnight' : timeStr;
    var fmtDate = function(dt) { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt); };
    var todayStr = fmtDate(new Date(nowMs));
    var tomorrowStr = fmtDate(new Date(nowMs + 86400000));
    var targetStr = fmtDate(d);
    if (targetStr === todayStr) return timeDisp;
    if (targetStr === tomorrowStr) return timeDisp === 'midnight' ? 'midnight' : timeDisp + ' tomorrow';
    var dayName = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(d);
    var dayNum = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric' }).format(d);
    var monthName = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short' }).format(d);
    return 'on ' + dayName + ' ' + dayNum + ' ' + monthName + ' at ' + timeDisp;
}

function _dhwFmtAgo(panelLastSeenMs, nowMs) {
    if (panelLastSeenMs == null) return null;
    var ageMs = nowMs - panelLastSeenMs;
    var ageMins = Math.round(ageMs / 60000);
    if (ageMins < 120) return ageMins + ' minute' + (ageMins !== 1 ? 's' : '') + ' ago';
    var ageHrs = Math.round(ageMs / 3600000);
    if (ageHrs < 48) return ageHrs + ' hour' + (ageHrs !== 1 ? 's' : '') + ' ago';
    var tz = 'Europe/London';
    var d = new Date(panelLastSeenMs);
    var dayName = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(d);
    var dayNum = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric' }).format(d);
    var monthName = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short' }).format(d);
    var timeStr = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return 'on ' + dayName + ' ' + dayNum + ' ' + monthName + ' at ' + timeStr;
}

/**
 * dhwOverrideOutcome(dhwOverride, nowMs) -> {state, headline, explanation, script, ticketSentence} | null
 *
 * Browser twin of services/tb-device.js dhwOverrideOutcome (same algorithm; keep both in lock-step).
 * Re-applies time-based checks at nowMs. Called at Hot water stage 0 render; no network call.
 */
function dhwOverrideOutcome(dhwOverride, nowMs) {
    if (!dhwOverride || !dhwOverride.visible) return null;
    var mode = dhwOverride.mode;
    var panelLastSeenMs = dhwOverride.panelLastSeenMs;
    var untilMs = dhwOverride.untilMs;
    var confirmedAtMs = dhwOverride.confirmedAtMs;
    var unreadableReason = dhwOverride.unreadableReason;

    // Re-apply staleness
    if (panelLastSeenMs == null || (nowMs - panelLastSeenMs) > _BOILER_STALE_MS) {
        var ago = _dhwFmtAgo(panelLastSeenMs, nowMs);
        var reason = ago ? 'last reported ' + ago : "isn't reporting";
        return {
            state: 'cant-confirm',
            headline: "Hot water override: can't confirm",
            explanation: ago
                ? "The boiler panel last reported " + ago + ", so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal."
                : "The boiler panel isn't reporting, so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal.",
            script: "I can't see the current hot water setting from here right now, so I'll log it for the team to check.",
            ticketSentence: 'Hot water override at time of call: could not be confirmed (' + reason + ').'
        };
    }

    // V2 end-time transition
    var effectiveMode = mode;
    var effectiveReason = unreadableReason;
    if ((mode === 'on-until' || mode === 'off-until') && untilMs != null && untilMs <= nowMs) {
        effectiveMode = 'auto-ended';
    }
    // V1 confirmation expiry
    if ((mode === 'on-v1' || mode === 'off-v1') && (confirmedAtMs == null || (nowMs - confirmedAtMs) > _BOILER_V1_CONFIRM_MS)) {
        effectiveMode = 'cant-confirm';
        effectiveReason = 'not-reconfirmed';
    }

    if (effectiveMode === 'auto') {
        return {
            state: 'auto',
            headline: 'Hot water override: Auto (on schedule)',
            explanation: 'Nobody has overridden the hot water on the boiler panel. It is following its normal timetable, so an override is not the reason for the problem.',
            script: "The hot water controls haven't been overridden - they're running on the normal timetable.",
            ticketSentence: 'Hot water override at time of call: Auto (on schedule).'
        };
    }
    if (effectiveMode === 'auto-ended') {
        var endedAt = untilMs != null ? _dhwFmtTime(untilMs, nowMs) : '';
        return {
            state: 'auto-ended',
            headline: 'Hot water override: Auto (on schedule)',
            explanation: 'An override ended at ' + endedAt + ' and the panel has gone back to its normal timetable, so an override is not the reason for the problem now.',
            script: 'The hot water controls are back on the normal timetable.',
            ticketSentence: 'Hot water override at time of call: Auto (on schedule, override ended at ' + endedAt + ').'
        };
    }
    if (effectiveMode === 'on-until') {
        var timeStr = _dhwFmtTime(untilMs, nowMs);
        return {
            state: 'on-until',
            headline: 'Hot water override: Override ON until ' + timeStr,
            explanation: 'Hot water has already been set to run from the boiler panel and stays on until ' + timeStr + '. The controls are asking for hot water, so if there is still none, the likely cause is the boiler or the cylinder.',
            script: "The hot water has already been switched on from the controls and will stay on until " + timeStr + ". If it's still not coming through, it's likely the boiler itself, so I'll log it for the team.",
            ticketSentence: 'Hot water override at time of call: Override ON until ' + timeStr + '.'
        };
    }
    if (effectiveMode === 'off-until') {
        var timeStr2 = _dhwFmtTime(untilMs, nowMs);
        return {
            state: 'off-until',
            headline: 'Hot water override: Override OFF until ' + timeStr2,
            explanation: "Hot water has been deliberately switched off from the boiler panel until " + timeStr2 + ". That is the likely reason there is no hot water. It goes back to its normal timetable at " + timeStr2 + ". We can't change it from here, so escalate if the caller needs it sooner.",
            script: "The hot water has been switched off on purpose at the controls until " + timeStr2 + ", then it goes back to normal. I'll log that you need it back sooner so the team can look at it.",
            ticketSentence: 'Hot water override at time of call: Override OFF until ' + timeStr2 + '.'
        };
    }
    if (effectiveMode === 'on-v1') {
        return {
            state: 'on-v1',
            headline: 'Hot water override: Override ON',
            explanation: "Hot water has been set to run from the boiler panel. This type of panel doesn't give an end time. The controls are asking for hot water, so if there is still none, the likely cause is the boiler or the cylinder.",
            script: "The hot water has been switched on from the controls. If it's still not coming through, it's likely the boiler itself, so I'll log it for the team.",
            ticketSentence: 'Hot water override at time of call: Override ON.'
        };
    }
    if (effectiveMode === 'off-v1') {
        return {
            state: 'off-v1',
            headline: 'Hot water override: Override OFF',
            explanation: "Hot water has been deliberately switched off on the boiler panel. That is the likely reason there is no hot water. This type of panel doesn't say when it ends, and we can't change it from here, so escalate it.",
            script: "The hot water has been switched off on purpose at the controls. I'll log it so the team can switch it back on for you.",
            ticketSentence: 'Hot water override at time of call: Override OFF.'
        };
    }
    // cant-confirm: stale, implausible, not-reconfirmed, decode-error, or unknown
    var ccExplanation, ccTicket;
    if (effectiveReason === 'stale') {
        var ago2 = _dhwFmtAgo(panelLastSeenMs, nowMs);
        var reason2 = ago2 ? 'last reported ' + ago2 : "isn't reporting";
        ccExplanation = ago2
            ? "The boiler panel last reported " + ago2 + ", so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal."
            : "The boiler panel isn't reporting, so we can't tell whether the hot water is overridden. Don't tell the caller it is on or off; log it and escalate as normal.";
        ccTicket = 'Hot water override at time of call: could not be confirmed (' + reason2 + ').';
    } else if (effectiveReason === 'not-reconfirmed') {
        ccExplanation = "The boiler panel hasn't re-confirmed its hot water override recently, so we can't tell whether it is still in place. Don't tell the caller it is on or off; log it and escalate as normal.";
        ccTicket = "Hot water override at time of call: could not be confirmed (panel hasn't re-confirmed recently).";
    } else {
        ccExplanation = "The boiler panel's hot water override reading doesn't make sense right now, so we can't tell whether it is overridden. Don't tell the caller it is on or off; log it and escalate as normal.";
        ccTicket = "Hot water override at time of call: could not be confirmed (reading doesn't make sense).";
    }
    return {
        state: 'cant-confirm',
        headline: "Hot water override: can't confirm",
        explanation: ccExplanation,
        script: "I can't see the current hot water setting from here right now, so I'll log it for the team to check.",
        ticketSentence: ccTicket
    };
}

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Grammatical join: "A" · "A and B" · "A, B and C". */
function grammaticalList(items) {
    if (items.length <= 1) return items[0] || '';
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

/* ------------------------------------------------------------------ */
/* OOHDASH-139: Pub boiler panel heating flow helpers                  */
/* ------------------------------------------------------------------ */

/**
 * boilerHeatingOutcome(heating, need, nowMs) — pure state-first decision tree.
 * Returns a W-code string ('W1'..'W9').
 */
function boilerHeatingOutcome(heating, need, nowMs) {
    var staleMs = 60 * 60 * 1000;
    var isStale = !heating || !heating.visible
        || heating.panelLastSeenMs === null
        || (nowMs - heating.panelLastSeenMs) > staleMs;
    if (isStale) return 'W1';

    var zones = (heating.zones || []);
    var anyOn = zones.some(function(z) { return z.on; });
    var allOn = zones.length > 0 && zones.every(function(z) { return z.on; });
    var anyFallback = zones.some(function(z) { return z.fallback; });
    var anyForcedOff = zones.some(function(z) { return !z.on && z.forced === 'off'; });
    var someOnSomeOff = anyOn && !allOn;

    if (need === 'cold') {
        if (anyFallback) return 'W7';
        if (heating.boilerCalling && allOn) return 'W2';
        if (anyForcedOff) return 'W5';
        if (someOnSomeOff) return 'W3';
        if (heating.summerMode) return 'W4';
        return 'W6';
    }
    if (need === 'hot') {
        if (anyOn) return 'W8';
        return 'W9';
    }
    return 'W1';
}

/**
 * bpOutcomeCard(wcode, heating, nowMs) — returns all card fields for a W-code.
 */
function bpOutcomeCard(wcode, heating, nowMs) {
    var zones = (heating && heating.zones) || [];
    var version = heating && heating.version;

    function panelAgo(ms) {
        if (ms === null || ms === undefined) return 'never';
        var diff = nowMs - ms;
        if (diff < 2 * 60 * 1000) return 'just now';
        if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' min ago';
        return Math.floor(diff / 3600000) + ' hours ago';
    }

    function forcedTimeStr(zone) {
        if (version === 'V2' && zone.forcedUntilMs && zone.forcedUntilMs > nowMs) {
            var d = new Date(zone.forcedUntilMs);
            var hh = String(d.getHours()).padStart(2, '0');
            var mm2 = String(d.getMinutes()).padStart(2, '0');
            return 'until ' + hh + ':' + mm2;
        }
        if (zone.held) return 'and is being held';
        return '';
    }

    // Forced-on add-on sentence
    var forcedOnZone = zones.find(function(z) { return z.on === true && z.forced === 'on'; });
    var forcedOnSentence = '';
    if (forcedOnZone) {
        var ts = forcedTimeStr(forcedOnZone);
        forcedOnSentence = 'Pub zone ' + forcedOnZone.n + ' has been switched on at the panel' +
            (ts ? ' (' + ts + ')' : '') + ", so it's running outside its normal timetable.";
    }

    var headline, operatorText, scriptText, ticketText, buttons;
    var ago = panelAgo(heating && heating.panelLastSeenMs);

    if (wcode === 'W1') {
        headline = "Pub heating: can’t check right now";
        operatorText = "The pub’s boiler panel last reported " + ago + ", so we can’t see what the heating is doing. Don’t tell the caller whether it is on or off. Log it for the IoT team.";
        scriptText = "I can’t see the pub heating controls from here at the moment, so I’ve logged it for the team to check.";
        ticketText = "Pub heating at time of call: could not be checked (boiler panel last reported " + ago + ").";
        buttons = '<button class="btn primary" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>' +
                  '<button class="btn" data-testid="bp-noact" onclick="flowStep({need:\'bp-noact\'})">End with no action</button>';
    } else if (wcode === 'W2') {
        headline = "Lighthouse is asking the boiler for heat";
        operatorText = "The panel is calling for heat and every pub heating zone is switched on. The controls are doing their job, so the fault is most likely the boiler itself, the pipework, or the radiators and valves. The site needs their gas or heating engineer.";
        scriptText = "Our controls are asking the boiler for heat right now, so the problem looks like it’s with the boiler or the radiators rather than the controls. Please call your heating engineer. I’ve logged tonight’s call.";
        ticketText = "Pub heating at time of call: panel calling for heat, all pub zones on. Likely a boiler/heating-side fault; site advised to call their heating engineer.";
        buttons = '<button class="btn primary" data-testid="bp-advice" onclick="flowStep({need:\'bp-advice\'})">Advise site &amp; log it (recommended)</button>' +
                  '<button class="btn" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>';
    } else if (wcode === 'W3') {
        var onZonesW3 = zones.filter(function(z) { return z.on; }).map(function(z) { return 'pub zone ' + z.n; });
        var offZonesW3 = zones.filter(function(z) { return !z.on; }).map(function(z) { return 'pub zone ' + z.n; });
        var onListW3 = onZonesW3.join(', ') || 'pub zone 1';
        var offListW3 = offZonesW3.join(', ') || 'pub zone 2';
        var onListCapW3 = onListW3.charAt(0).toUpperCase() + onListW3.slice(1);
        headline = "Part of the pub heating is off";
        operatorText = esc(onListCapW3) + " is on, but " + esc(offListW3) + " is off right now. The panel doesn’t tell us why from here, and we can’t switch zones remotely. Log it for the IoT team. If the caller says the cold area is the part that’s heating, treat it as a boiler or radiator problem and advise their heating engineer.";
        scriptText = "Part of the heating is on, but one area is switched off at the controls. I can’t change that from here, so I’ve logged it for the team.";
        ticketText = "Pub heating at time of call: " + esc(onListW3) + " on, " + esc(offListW3) + " off. Captured for the IoT team.";
        buttons = '<button class="btn primary" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>' +
                  '<button class="btn" data-testid="bp-advice" onclick="flowStep({need:\'bp-advice\'})">Advise heating engineer &amp; log it</button>' +
                  '<button class="btn" data-testid="bp-noact" onclick="flowStep({need:\'bp-noact\'})">End with no action</button>';
    } else if (wcode === 'W4') {
        headline = "Pub heating is in summer mode";
        operatorText = "The panel has switched the pub heating off for the summer season. It isn’t a fault, but we can’t change it from here. If the site needs heating, log it for the IoT team.";
        scriptText = "The heating controls are still set to summer mode, which is why the heating isn’t coming on. I can’t change that from here, but I’ve logged it so the team can switch it back for you.";
        ticketText = "Pub heating at time of call: off, panel in summer mode. Site needs heating; captured for the IoT team.";
        buttons = '<button class="btn primary" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>' +
                  '<button class="btn" data-testid="bp-noact" onclick="flowStep({need:\'bp-noact\'})">End with no action</button>';
    } else if (wcode === 'W5') {
        var forcedOffZone = zones.find(function(z) { return !z.on && z.forced === 'off'; }) || zones[0] || { n: 1 };
        var tsW5 = forcedTimeStr(forcedOffZone);
        var tsPhraseW5 = tsW5 || (forcedOffZone.held ? 'and is being held off' : '');
        headline = "Pub heating has been switched off on purpose";
        operatorText = "Pub zone " + forcedOffZone.n + " has been deliberately switched off at the boiler panel" +
            (tsPhraseW5 ? " (" + tsPhraseW5 + ")" : "") +
            ". That’s the likely reason it’s cold. We can’t change it from here, so log it for the IoT team if the site needs the heating back on.";
        scriptText = "That part of the heating has been switched off on purpose at the controls. I can’t change it from here, but I’ve logged that you need it back on so the team can sort it.";
        ticketText = "Pub heating at time of call: pub zone " + forcedOffZone.n + " forced OFF at the panel" +
            (tsPhraseW5 ? " (" + tsPhraseW5 + ")" : "") + ". Site needs heat; captured for the IoT team.";
        buttons = '<button class="btn primary" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>' +
                  '<button class="btn" data-testid="bp-noact" onclick="flowStep({need:\'bp-noact\'})">End with no action</button>';
    } else if (wcode === 'W6') {
        var nc = heating && heating.nextChange;
        headline = "Pub heating is off at the controls right now";
        operatorText = "The panel isn’t asking the boiler for heat. It isn’t in summer mode and nobody has switched it off on purpose, so it’s most likely outside its heating times." +
            (nc ? " Based on the panel’s stored timetable, the next change is " + esc(nc) + "." : "") +
            " We can’t switch it on from here.";
        scriptText = "The heating is off on its timetable at the moment" +
            (nc ? " and is due back on at " + esc(nc) : "") +
            ". I can’t turn it on from here, so I’ve logged it for the team.";
        ticketText = "Pub heating at time of call: off at the panel (no summer mode, not forced off" +
            (nc ? "; next scheduled change " + esc(nc) : "") + "). Captured for the IoT team.";
        buttons = '<button class="btn primary" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>' +
                  '<button class="btn" data-testid="bp-noact" onclick="flowStep({need:\'bp-noact\'})">End with no action</button>';
    } else if (wcode === 'W7') {
        var fallbackZone = zones.find(function(z) { return z.fallback; }) || zones[0] || { n: 1 };
        headline = "Heating is running on a back-up cycle";
        operatorText = "The panel has lost the room temperature reading for pub zone " + fallbackZone.n + ", so it’s heating that zone on a timed on/off cycle instead. Rooms can feel cooler than normal. The IoT team needs to check the room sensor.";
        scriptText = "The heating is running, but on a back-up setting because a temperature sensor isn’t reporting. I’ve logged it for the team to fix the sensor.";
        ticketText = "Pub heating at time of call: pub zone " + fallbackZone.n + " on back-up (fallback) cycle, room sensor not reporting. Captured for the IoT team.";
        buttons = '<button class="btn primary" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>' +
                  '<button class="btn" data-testid="bp-noact" onclick="flowStep({need:\'bp-noact\'})">End with no action</button>';
    } else if (wcode === 'W8') {
        var onZonesW8 = zones.filter(function(z) { return z.on; }).map(function(z) { return 'pub zone ' + z.n; });
        var onListW8 = onZonesW8.length > 0 ? onZonesW8.join(' and ') : 'pub zones';
        headline = "Pub heating is on, and we can’t switch it off from here";
        operatorText = "The panel is heating " + esc(onListW8) + ". Pub heating on this panel can’t be changed remotely. Log it for the IoT team. In the meantime the site can turn the radiator valves down.";
        scriptText = "The heating is on at the controls and I can’t change it from here tonight. Turning the radiator valves down will help in the meantime. I’ve logged it for the team.";
        ticketText = "Pub heating at time of call: on (" + esc(onListW8) + "). Caller wants it lower/off; not remotely adjustable. Captured for the IoT team.";
        buttons = '<button class="btn primary" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>' +
                  '<button class="btn" data-testid="bp-noact" onclick="flowStep({need:\'bp-noact\'})">End with no action</button>';
    } else if (wcode === 'W9') {
        headline = "Pub heating is already off";
        operatorText = "The panel isn’t heating any pub zone right now, so the warmth isn’t coming from the pub heating controls. Ask whether another heater, or the accommodation heating, is on.";
        scriptText = "Our controls show the pub heating is off right now, so the warmth is coming from somewhere else, perhaps a radiator on manual or another heater. I’ve noted the call.";
        ticketText = "Pub heating at time of call: off at the panel. Caller reports too warm; heat source is not the pub heating controls.";
        buttons = '<button class="btn" data-testid="bp-noact" onclick="flowStep({need:\'bp-noact\'})">Log it &amp; end</button>' +
                  '<button class="btn primary" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>';
    } else {
        headline = "Pub heating: can’t check right now";
        operatorText = "Could not determine the heating state. Log it for the IoT team.";
        scriptText = "I can’t see the pub heating controls from here at the moment, so I’ve logged it for the team to check.";
        ticketText = "Pub heating at time of call: could not be determined.";
        buttons = '<button class="btn primary" data-testid="bp-capture" onclick="flowStep({need:\'bp-esc\'})">Capture &amp; escalate for the IoT team</button>' +
                  '<button class="btn" data-testid="bp-noact" onclick="flowStep({need:\'bp-noact\'})">End with no action</button>';
    }

    return { headline: headline, operatorText: operatorText, scriptText: scriptText, ticketText: ticketText, buttons: buttons, forcedOnSentence: forcedOnSentence };
}

/**
 * boilerPanelHeatingBranch(ws, f, panelDevice, site) — handles the entire boiler panel heating flow.
 * Entered when the chosen area's device set has a boiler-panel device.
 */
function boilerPanelHeatingBranch(ws, f, panelDevice, site) {
    var heating = ws.boilerControl && ws.boilerControl.heating ? ws.boilerControl.heating : null;
    var nowMs = Date.now();

    function panelAgo(ms) {
        if (ms === null || ms === undefined) return 'never';
        var diff = nowMs - ms;
        if (diff < 2 * 60 * 1000) return 'just now';
        if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' min ago';
        return Math.floor(diff / 3600000) + ' hours ago';
    }

    function fmtTemp(v) {
        if (typeof v !== 'number' || !isFinite(v) || v < -30 || v > 110) return '—';
        return v.toFixed(1) + '°C';
    }

    // Build readout line
    function buildReadout() {
        if (!heating || !heating.visible) {
            return '<div class="zoneread"><span class="small">Pub boiler panel — no reading</span></div>';
        }
        var zones = heating.zones || [];
        var zoneParts = zones.map(function(z) {
            var stateHtml = z.on === true ? '<b class="ok">on</b>' : (z.on === false ? '<b class="warn">off</b>' : '—');
            return 'Pub zone ' + z.n + ' ' + stateHtml;
        }).join(' · ');
        var temps = zones.map(function(z) { return fmtTemp(z.roomTemp); }).join(' / ');
        var ago = panelAgo(heating.panelLastSeenMs);
        var readoutText = (zoneParts || 'no zones') +
            (temps && temps !== '—' ? ' · room ' + temps : '') +
            ' · panel reported ' + ago;
        return '<div class="zoneread"><span class="small">' + readoutText + '</span></div>';
    }

    var readout = buildReadout();

    // Stage 1: ask what the caller needs (two chips only for boiler panel)
    if (f.stage === 1) {
        doneLine('Area: <b>Bar/Restaurant (pub boiler panel)</b>');
        return readout +
            '<div class="stepq">What does the caller need?</div>' +
            '<div class="chips">' +
            '<button class="chip" data-testid="need-cold" onclick="flowStep({need:\'cold\'})">Too cold / not working</button>' +
            '<button class="chip" data-testid="need-hot" onclick="flowStep({need:\'hot\'})">Too hot / wants it off</button>' +
            '</div>';
    }

    var need = f.data.need;

    // Outcome button clicks
    if (need === 'bp-esc') {
        var wcode1 = f.data.bpWcode || 'W1';
        var card1 = bpOutcomeCard(wcode1, heating, nowMs);
        return outcomeCaptured(f, 'bp-esc', { subject: card1.headline, detail: card1.operatorText, script: card1.scriptText, OohCaptureClass: 'boiler-panel-heating' });
    }
    if (need === 'bp-advice') {
        var wcode2 = f.data.bpWcode || 'W2';
        var card2 = bpOutcomeCard(wcode2, heating, nowMs);
        return outcomeCaptured(f, 'bp-advice', { subject: card2.headline, detail: card2.operatorText, script: card2.scriptText, OohCaptureClass: 'boiler-panel-advice' });
    }
    if (need === 'bp-noact') {
        return outcomeNoAction(f, 'bp-noact', { subject: 'Pub heating query — no action', detail: '', script: '' });
    }

    // Stage 2: show outcome card
    if (need === 'cold' || need === 'hot') {
        var wcode = boilerHeatingOutcome(heating, need, nowMs);
        f.data.bpWcode = wcode;
        var card = bpOutcomeCard(wcode, heating, nowMs);
        doneLine('Need: <b>' + (need === 'cold' ? 'Too cold / not working' : 'Too hot / wants it off') + '</b>');
        doneLine('Outcome: <b>' + wcode + '</b>');
        return readout +
            '<div class="reco" data-testid="reco-boiler-panel">' +
            '<b class="hd">' + esc(card.headline) + '</b>' +
            '<div class="k">What to tell the operator</div>' +
            '<p>' + card.operatorText + '</p>' +
            (card.forcedOnSentence ? '<p>' + esc(card.forcedOnSentence) + '</p>' : '') +
            '<div class="k">Say to caller</div>' +
            '<p class="script">“' + card.scriptText + '”</p>' +
            '<div class="k">Ticket sentence</div>' +
            '<p class="tkt">' + card.ticketText + '</p>' +
            '<div class="outbtns">' + card.buttons + '</div>' +
            '</div>';
    }

    // Fallback: reset to stage 1
    f.stage = 1;
    f.data.need = null;
    return boilerPanelHeatingBranch(ws, f, panelDevice, site);
}

/* ------------------------ flow renderers ------------------------ */
const FLOWR = {
    heating(ws, f) {
        // OOHDASH-82 (design §7): area-first model. Chips are the DISTINCT areas present (max two:
        // Accommodation / Bar-Restaurant), plus a labelled fallback chip for unmapped iT500s and the
        // aircon shortcut when the site has AC. The chosen area is stored by NAME (not a list index).
        const areas = heatingAreasPresent();
        const unmapped = hasUnmappedHeating();
        if (f.stage === 0) {
            // OOHDASH-128 (OQ5): site-level footnote for unplaced bare-salus units. Shown whenever n > 0.
            const unplaced = unplacedLegacySalus();
            const unplacedCount = unplaced.length;
            let unplacedNoteHtml = '';
            if (unplacedCount > 0) {
                const anyOn = unplaced.some(d => d.online);
                const unitWord = unplacedCount === 1 ? 'unit' : 'units';
                const theyWord = unplacedCount === 1 ? 'It is' : 'They are';
                const notWord = unplacedCount === 1 ? 'is' : 'are';
                const firstSentence = 'Also at this site: ' + unplacedCount + ' older Salus heating ' + unitWord + ' that could not be matched to an area.';
                const secondSentence = anyOn
                    ? theyWord + ' not used in this check.'
                    : theyWord + ' not reporting and ' + notWord + ' not used in this check.';
                unplacedNoteHtml = '<p class="small" data-testid="heating-unplaced-note" style="margin-top:10px">' + firstSentence + ' ' + secondSentence + '</p>';
            }
            if (!areas.length && !unmapped) {
                // OOHDASH-128 (C5): reworded alert when only unplaced bare-salus exist.
                if (unplacedCount > 0) {
                    return '<div class="alert warn">No heating area can be checked on Lighthouse at this site.</div>' + unplacedNoteHtml + otherShortcut();
                }
                return '<div class="alert warn">No heating on Lighthouse at this site.</div>' + otherShortcut();
            }
            const areaChips = areas.map(a =>
                `<button class="chip" data-testid="area-${a === 'Accommodation' ? 'accommodation' : 'bar-restaurant'}" onclick="flowStep({area:'${a}'})">${esc(a)}</button>`).join('');
            // Fallback chip (§7.2): unmapped iT500s — a caller-meaningful label, never a serial.
            const fallbackChip = unmapped
                ? `<button class="chip" data-testid="area-unmapped" onclick="flowStep({area:'__unmapped__'})">Heating — area not identified</button>`
                : '';
            // In-context aircon shortcut (§6): visibly NOT one of the two areas; starts the referral flow.
            const airconChip = siteHasAircon()
                ? `<div class="chips" style="margin-top:8px"><button class="chip" data-testid="aircon-shortcut" onclick="startFlow('aircon', state.flow.data.freeText||'', {carryNotes:true})">❄️ Air conditioning (handled by the IoT team)</button></div>`
                : '';
            return `<div class="stepq">Which area is the caller talking about?</div><div class="chips">${areaChips}${fallbackChip}</div>${airconChip}` + unplacedNoteHtml;
        }
        // Resolve the chosen area (by name) to its device SET, then to the coldest-online representative.
        const chosenArea = f.data.area === '__unmapped__' ? null : f.data.area;
        const areaLabel = f.data.area === '__unmapped__' ? 'Heating — area not identified' : f.data.area;
        const set = devicesForArea(chosenArea);

        // OOHDASH-139: if the area has a boiler panel, route to the panel branch before
        // areaRepresentative and the no-online-device connectivity diversion.
        const panelDevice = set.find(d => d.deviceType === 'boiler-panel');
        if (panelDevice) {
            return boilerPanelHeatingBranch(ws, f, panelDevice, ws.site);
        }

        const z = areaRepresentative(set);
        // No online device in the area → connectivity branch (design §7.3 rule 2), same as a single
        // offline device today. Uses any device in the set to name the area in the connectivity line.
        if (!z) {
            // OOHDASH-123 (D-DARK-FLEETS): when every device in the area is a dark Salus (iT500 /
            // bare-salus), it is offline because it does not report, not because the site is unreachable.
            // Say "device not reporting" plainly and offer NO controls, instead of diverting into the
            // generic gateway "not responding" connectivity branch. The outcome (offline, no controls,
            // captured for the IoT team) is unchanged; only the wording matches James's binding decision.
            if (set.length > 0 && set.every(isDarkFleet)) {
                if (f.data.need === 'darkcap') {
                    return outcomeCaptured(f, 'darkcap', {
                        subject: `Heating device not reporting (${areaLabel})`,
                        detail: `The ${areaLabel} heating controller is a Salus unit that is not reporting to Lighthouse (no live data), so it cannot be read or adjusted remotely. Logged for the IoT team to check the device and its connection.`,
                        script: "That heating controller isn't sending us any data at the moment, so I can't read or change it remotely tonight. I've logged it for the IoT team to look into.",
                        OohCaptureClass: 'dark-fleet-heating'
                    });
                }
                if (f.data.need === 'darknoact') {
                    return outcomeNoAction(f, 'darknoact', {
                        subject: `Heating device not reporting (${areaLabel}) - no action`,
                        detail: `Caller asked about ${areaLabel} heating; the Salus controller is not reporting to Lighthouse and the caller declined a follow-up. Call recorded for the audit trail.`,
                        script: ''
                    });
                }
                doneLine(`Area: <b>${esc(areaLabel)}</b>`);
                doneLine('Live read: <b>device not reporting</b>');
                // OOHDASH-128 (OQ4): plural heading when the area has multiple dark-fleet devices.
                if (set.length > 1) {
                    return `<div class="reco" data-testid="reco-dark-fleet"><b class="hd">The heating units in this area are not reporting.</b>They are Salus units that have stopped sending live data to Lighthouse, so there is no live reading and they cannot be switched or adjusted from here. This usually means the devices have lost power or their connection.<div class="outbtns"><button class="btn primary" data-testid="dark-capture" onclick="flowStep({need:'darkcap'})">Capture &amp; escalate for the IoT team</button><button class="btn" data-testid="dark-noact" onclick="flowStep({need:'darknoact'})">End with no action</button></div></div>`;
                }
                return `<div class="reco" data-testid="reco-dark-fleet"><b class="hd">This heating device is not reporting.</b>It is a Salus unit that has stopped sending live data to Lighthouse, so there is no live reading and it cannot be switched or adjusted from here. This usually means the device has lost power or its connection.<div class="outbtns"><button class="btn primary" data-testid="dark-capture" onclick="flowStep({need:'darkcap'})">Capture &amp; escalate for the IoT team</button><button class="btn" data-testid="dark-noact" onclick="flowStep({need:'darknoact'})">End with no action</button></div></div>`;
            }
            doneLine(`Area: <b>${esc(areaLabel)}</b>`);
            doneLine('Live read: <b>no thermostat online in this area</b>');
            f.cat = 'connectivity'; f.stage = 0; f.data.from = 'heating';
            return FLOWR.connectivity(ws, f);
        }
        const t = z.telemetry || {};
        const temp = typeof t.localTemperature === 'number' ? t.localTemperature : (typeof t.roomSensor1Temp === 'number' ? t.roomSensor1Temp : null);
        const sp = t.heatingSetpoint;
        const nInArea = set.length;
        if (f.stage === 1) {
            doneLine(`Area: <b>${esc(areaLabel)}</b>`);
            if (!z.online) { doneLine('Live read: <b>device offline</b>'); f.cat = 'connectivity'; f.stage = 0; f.data.from = 'heating'; return FLOWR.connectivity(ws, f); }
            // OOHDASH-128 (OQ4): compute online/offline counts for mixed-health copy and the note.
            const nOn = set.filter(d => d.online).length;
            const nOff = nInArea - nOn;
            // OOHDASH-82 (design §7.3): when the area has more than one device the read is the COLDEST
            // online zone — honest subline. OOHDASH-128: mixed-health shows "only reporting zone" or "coldest of N reporting zones".
            const liveNote = z.deviceType === 'boiler-panel'
                ? 'pub boiler panel'
                : 'live read just now' + (nInArea > 1
                    ? (nOff === 0
                        ? ` · coldest of ${nInArea} zones in ${esc(areaLabel)}`
                        : nOn === 1
                            ? ` · the only reporting zone in ${esc(areaLabel)}`
                            : ` · coldest of ${nOn} reporting zones in ${esc(areaLabel)}`)
                    : '');
            const read = `<div class="zoneread"><span class="t">${temp != null ? temp + '°C' : '—'}</span><div><div>${sp != null ? `Setpoint <b>${sp}°C</b>` : ''}${t.mode ? ' · mode <b>' + esc(t.mode) + '</b>' : ''}</div><div class="small">${esc(z.deviceId)} · ${liveNote}</div></div><span class="tag green">online</span></div>`;
            // OOHDASH-128 (OQ4): area-not-reporting note — shown when some devices in the area are offline.
            const notReportingNote = nOff > 0
                ? '<p class="small" data-testid="area-not-reporting-note">' + (nOff === 1 ? '1 other heating unit' : nOff + ' other heating units') + ' in ' + esc(areaLabel) + ' ' + (nOff === 1 ? 'is' : 'are') + ' not reporting, so ' + (nOff === 1 ? 'it is' : 'they are') + ' not part of this reading. Nothing done on this call caused this.</p>'
                : '';
            return read + notReportingNote + `<div class="stepq">What does the caller need?</div><div class="chips">
    <button class="chip" data-testid="need-warm" onclick="flowStep({need:'warm'})">Warmer</button>
    <button class="chip" data-testid="need-cool" onclick="flowStep({need:'cool'})">Cooler</button>
    <button class="chip" data-testid="need-off" onclick="flowStep({need:'off'})">Turn it off</button>
    <button class="chip" data-testid="need-broken" onclick="flowStep({need:'broken'})">It’s not working</button></div>`;
        }
        if (f.stage === 2) {
            const need = f.data.need;
            if (need === 'warm' && temp != null && sp != null && temp <= sp - 2) {
                doneLine('Requested: warmer · system already calling for heat');
                return `<div class="reco" data-testid="reco-building-heat"><b class="hd">Raising the setpoint won’t help here.</b>The zone is reading <b>${temp}°C against a ${sp}°C setpoint</b> with the device online — the system is already asking for more heat than the building is delivering. That usually means radiators/TRVs or the boiler.<div class="outbtns"><button class="btn primary" onclick="flowStep({buildheat:1})">Give building-heat guidance &amp; log it</button><button class="btn" onclick="flowStep({forceCtl:1})">Adjust the setpoint anyway</button></div></div>`;
            }
            if (need === 'warm' || need === 'cool') {
                doneLine('Requested: ' + (need === 'warm' ? 'warmer' : 'cooler'));
                openControl(z, need === 'warm' ? 'up' : 'down');
                return ctlPlaceholder();
            }
            if (need === 'off') {
                doneLine('Requested: turn heating off');
                // OOHDASH-82 (design §6, A4): the heating flow no longer sees Intesis (aircon is removed
                // from the candidate set and served by the dedicated `aircon` referral flow), so the old
                // `z.deviceType === 'intesis'` off-held branch here is dead and has been removed. Salus
                // heat-only units offer the frost-hold below.
                return `<div class="reco" data-testid="reco-frost"><b class="hd">This thermostat has no “off” switch.</b>It’s a Salus heat-only unit. The closest safe action is a <b>frost-hold</b>: set it to 5°C, so the heating stays off unless the building risks freezing. Normal service resumes when the hold ends.<div class="outbtns"><button class="btn primary" data-testid="frost-recommended" onclick="flowStep({frost:1})">Set frost-hold 5°C (recommended)</button><button class="btn" data-testid="frost-decline" onclick="flowStep({offnoact:1})">End with no action</button></div></div>`;
            }
            if (need === 'broken') {
                doneLine('Reported: heating not working');
                if (temp != null && sp != null && temp >= sp - 1) {
                    return `<div class="reco"><b class="hd">The system is keeping up.</b>This zone is reading <b>${temp}°C at a ${sp}°C setpoint</b>. If the caller still reports cold, it’s likely a radiator/TRV or zoning issue rather than the controls.<div class="outbtns"><button class="btn primary" onclick="flowStep({buildheat:1})">Give guidance &amp; log it</button><button class="btn" onclick="flowStep({forceCtl:1})">Raise the setpoint anyway</button></div></div>`;
                }
                return `<div class="alert warn">Reading ${temp != null ? temp + '°C' : '—'} vs setpoint ${sp != null ? sp + '°C' : '—'} — under target. Try raising the setpoint; if it doesn’t respond, this becomes an escalation.</div><div class="chips"><button class="chip" onclick="flowStep({forceCtl:1})">Raise setpoint</button><button class="chip" onclick="flowStep({buildheat:1})">Capture &amp; escalate instead</button></div>`;
            }
        }
        if (f.stage === 3) {
            if (f.data.frost) { openControl(z, 'frost'); return ctlPlaceholder(); }
            if (f.data.offnoact) {
                doneLine('No action taken');
                return outcomeNoAction(f, 'offnoact', {
                    subject: `Heating-off request — no action taken (${z.zone})`,
                    detail: 'Caller asked for the heating off; the frost-hold option was offered and declined. Nothing was changed.',
                    script: 'No changes made tonight — if you change your mind, call back and we can set it straight away.'
                });
            }
            if (f.data.forceCtl) { openControl(z, f.data.need === 'cool' ? 'down' : 'up'); return ctlPlaceholder(); }
            if (f.data.buildheat) {
                doneLine('Outcome: building-heat guidance');
                return outcomeScope(f, 'bh', {
                    subject: `Heating complaint — system performing to setpoint (${z.zone})`,
                    evidence: `Zone reading ${temp}°C against a ${sp}°C setpoint with the device online and responding — consistent with a building/TRV/boiler-side limitation, not a Lighthouse control fault.`,
                    script: `The system here is already asking for full heat — it’s reaching ${temp} degrees against a higher target, which usually means radiator valves or the boiler itself. It’s worth having your maintenance team check the radiators; I’ve logged tonight’s reading either way.`
                });
            }
        }
        return '';
    },

    // OOHDASH-82 (design §6): the aircon referral flow. A single step whose only outcome is a NORMAL
    // capture via outcomeCaptured (the exact mechanism behind the former intesis-off-held capture),
    // with the new capture class `aircon-referral`. No setpoint, no openControl, no write — aircon is
    // not controllable from the dashboard; every request is captured and referred to the IoT team.
    aircon(ws, f) {
        doneLine('Air conditioning — not controllable from the dashboard; captured for the IoT team');
        return outcomeCaptured(f, 'aircon', {
            subject: `Air conditioning request (${ws.site.siteName})`,
            detail: 'Caller raised an air-conditioning issue. Aircon is not controllable from the dashboard, so it is captured and referred to the IoT team rather than actioned here.',
            script: 'Air conditioning isn’t something I can adjust from here, so I’ve logged it for the IoT team — they’ll pick it up on the next working day. If it becomes urgent overnight, call back and we can escalate.',
            OohCaptureClass: 'aircon-referral'
        });
    },

    hotwater(ws, f) {
        // OOHDASH-114-F1: DHW controllability is now determined by the boilerControl workspace field
        // (Sam Day spec - V1/V2 shared-attribute check). The old devices.find was testing for a device
        // type that live inventory never emits. ws.boilerControl is always present (defaulted server-side).
        // OOHDASH-135 Item 6: not-lighthouse scope path — pure-heating site, hot water not on Lighthouse.
        const hwLevel = (ws.scope || []).filter(function(s) { return s.key === 'hotwater'; }).map(function(s) { return s.level; })[0];
        if (f.stage === 0) {
            if (hwLevel === 'not-lighthouse') {
                doneLine('Hot water - not on Lighthouse at this site');
                return `<div class="alert info" data-testid="hw-not-lighthouse">Hot water at this site isn’t on Lighthouse — it runs on the site’s own boiler or system and isn’t connected here. We can log the details and escalate to the IoT team.</div>
   <div class="chips"><button class="chip" data-testid="hw-nlh-capture" onclick="flowStep({nlh:1})">Log and escalate to IoT team</button></div>`;
            }
            doneLine('Hot water - boiler-side, not controllable from here; captured for the IoT team');
            // OOHDASH-136: DHW override card — shown before the blue note when visible.
            var _hwDhwOv = ws.boilerControl && ws.boilerControl.dhwOverride;
            var _hwDhwCard = '';
            if (_hwDhwOv && _hwDhwOv.visible === true) {
                var _hwDhwOc = dhwOverrideOutcome(_hwDhwOv, Date.now());
                if (_hwDhwOc) {
                    var _hwTagColor = {auto:'green','auto-ended':'green','on-until':'blue','on-v1':'blue','off-until':'amber','off-v1':'amber','cant-confirm':'grey'}[_hwDhwOc.state] || 'grey';
                    var _hwTagText = {auto:'Auto','auto-ended':'Auto','on-until':'Override ON','on-v1':'Override ON','off-until':'Override OFF','off-v1':'Override OFF','cant-confirm':"Can't confirm"}[_hwDhwOc.state] || "Can't confirm";
                    _hwDhwCard = '<div class="reco" data-testid="hw-dhw-override">' +
                        '<b class="hd">' + _hwDhwOc.headline + ' <span class="tag ' + _hwTagColor + '" data-testid="hw-dhw-override-tag">' + _hwTagText + '</span></b>' +
                        '<p>' + _hwDhwOc.explanation + '</p>' +
                        '<div class="script">"' + _hwDhwOc.script + '"</div>' +
                        '</div>';
                }
            }
            return _hwDhwCard + `<div class="alert info">Hot water here runs on the boiler panel, which this dashboard monitors but can't control - there's no remote boost. We'll capture the details with the site boiler guidance and escalate to the IoT team, so you still have a next step for the caller.</div>
   <div class="chips"><button class="chip" data-testid="hw-capture" onclick="flowStep({cap:1})">Log and escalate to IoT team</button><button class="chip" data-testid="hw-scope" onclick="flowStep({sc:1})">Scope guidance (boiler fault?)</button></div>`;
        }
        if (f.stage === 1) {
            // OOHDASH-135 Item 6: not-lighthouse capture — must come before the !f.data.sc check.
            if (f.data.nlh) {
                doneLine('Outcome: captured (not on Lighthouse)');
                return outcomeCaptured(f, 'nlh', {
                    subject: 'Hot water issue — not on Lighthouse',
                    detail: 'Caller reports hot-water problems. Hot water at this site is not connected to Lighthouse — no remote monitoring or control available. Logged for IoT team follow-up.',
                    script: "I've logged this for the IoT team. Hot water at this site isn't on Lighthouse so there's no remote view of it — the team will follow up to investigate.",
                    OohCaptureClass: 'hot-water'
                });
            }
            if (!f.data.sc) {
                doneLine('Outcome: captured');
                // OOHDASH-136: append DHW override ticket sentence when the card was shown.
                var _hwDhwOv1 = ws.boilerControl && ws.boilerControl.dhwOverride;
                var _hwDhwTs1 = '';
                if (_hwDhwOv1 && _hwDhwOv1.visible === true) {
                    var _hwOc1 = dhwOverrideOutcome(_hwDhwOv1, Date.now());
                    if (_hwOc1) _hwDhwTs1 = ' ' + _hwOc1.ticketSentence;
                }
                return outcomeCaptured(f, 'cap', {
                    subject: 'Hot water issue - not resolvable remotely tonight',
                    detail: 'Caller reports hot-water problems. Hot water is boiler-side (monitor-only on Lighthouse) - there is no remote boost. Needs IoT/boiler-side investigation.' + _hwDhwTs1,
                    script: "I've logged this for the IoT team as a priority for the morning. If it's urgent overnight the boiler's own override panel may help - and if a boiler engineer attends, remember a visit can be chargeable if the fault isn't Lighthouse equipment.",
                    OohCaptureClass: 'hot-water'
                });
            }
            if (f.data.sc) {
                // OOHDASH-136: append DHW override ticket sentence when the card was shown.
                var _hwDhwOv2 = ws.boilerControl && ws.boilerControl.dhwOverride;
                var _hwDhwTs2 = '';
                if (_hwDhwOv2 && _hwDhwOv2.visible === true) {
                    var _hwOc2 = dhwOverrideOutcome(_hwDhwOv2, Date.now());
                    if (_hwOc2) _hwDhwTs2 = ' ' + _hwOc2.ticketSentence;
                }
                return outcomeScope(f, 'sc', {
                    subject: 'Hot water — likely boiler fault',
                    evidence: 'Lighthouse monitors demand here; the boiler itself (pressure, PCB, pilot) is not Lighthouse equipment.' + _hwDhwTs2,
                    script: 'From what you’re describing this looks like the boiler itself rather than the Lighthouse controls — that’s one for your boiler company. I’ll note tonight’s call so there’s a record.'
                });
            }
        }
        return '';
    },

    kitchen(ws, f) {
        const ks = ws.devices.filter(d => d.kind === 'kitchen');
        if (f.stage === 0) {
            if (!ks.length) return '<div class="alert info">No kitchen circuits on Lighthouse here.</div>' + otherShortcut();
            // OOHDASH-89 (E): the static "Live read:" strip and the per-circuit rows are gone. The offline
            // auto-divert stays FIRST and unchanged — any offline circuit re-enters the connection check and
            // never reaches the reshaped happy path. When every circuit is online the backend is confident,
            // so the flow states ONE high-assurance assessment line and goes straight to the deciding question
            // (individual-appliance picking is subsumed by the assessment, never a picker). Only assert
            // "reachable" when confident; otherwise the divert above handles it.
            const off = ks.some(k => !k.online);
            if (off) { f.cat = 'connectivity'; f.stage = 0; return FLOWR.connectivity(ws, f); }
            doneLine('The kitchen circuits are reachable.');
            return `<div class="stepq">Is the kitchen needed for service <b>right now</b> (food being served / hotel breakfast)?</div>
   <div class="chips"><button class="chip" data-testid="kitchen-critical" onclick="flowStep({crit:1})">Yes — business critical now</button><button class="chip" data-testid="kitchen-notcritical" onclick="flowStep({crit:0})">No — needed later / tomorrow</button></div>`;
        }
        if (f.stage === 1) {
            if (f.data.crit) {
                doneLine('Business-critical during service — P1');
                return outcomeP1(f, 'crit', {
                    subject: 'Kitchen equipment off during service — P1',
                    detail: 'Kitchen circuits off while the site is actively serving. Remote switching not available; needs immediate IoT action.',
                    script: 'This is urgent so I’ve escalated it right now — a text has gone to our on-duty manager and someone will call you back shortly. In the meantime the on-site override switch, if you have one, is safe to use.',
                    p1Summary: 'Kitchen equipment off during service'
                });
            }
            doneLine('Not service-critical tonight');
            const ksched = ws.devices.find(d => d.kind === 'kitchen')?.schedule || '';
            return outcomeCaptured(f, 'ncrit', {
                subject: 'Kitchen equipment / schedule request',
                detail: `Caller needs kitchen equipment outside the current schedule window (${ksched}). Remote switching and schedule changes aren’t available OOH yet — logged for the IoT team.`,
                script: 'The equipment is on a schedule and comes on at its set time. I can’t safely change that tonight, but I’ve logged it and the IoT team will sort the times with you tomorrow.',
                OohCaptureClass: 'kitchen-powerpause'
            });
        }
        return '';
    },

    lighting(ws, f) {
        // OOHDASH-135 Item 1: filter() so multi-circuit sites surface every lighting device.
        const lgs = ws.devices.filter(d => d.kind === 'lighting');
        if (f.stage === 0) {
            const anyOnline = lgs.some(d => d.online);
            doneLine('Live read: external lighting ' + (lgs.length ? (anyOnline ? 'device online' : 'device(s) NOT responding') : 'not on Lighthouse here'));
            if (!lgs.length) return '<div class="alert info">External lighting at this site isn’t on Lighthouse.</div>' + otherShortcut();
            const lgSwitches = lgs.map(lg =>
                canSwitch(lg)
                    ? `<div class="zoneread"><span style="font-size:20px">💡</span><div><div><b>${esc(lg.zone)}</b> — ${lg.telemetry?.switch_1 ? 'currently ON' : 'currently OFF'}</div><div class="small">${esc(lg.deviceId)}</div></div>${switchButtons(lg, 'lighting-switch')}<span class="tag ${lg.telemetry?.switch_1 ? 'green' : 'grey'}">${lg.telemetry?.switch_1 ? 'on' : 'off'}</span></div>`
                    : ''
            ).join('');
            const anySwitchable = lgs.some(canSwitch);
            return lgSwitches + `<div class="alert info">${anySwitchable ? 'This lighting circuit can be switched on/off directly above — the change only counts once the device confirms.' : `External lighting can’t be switched remotely from here yet (on the priority list with our platform team).${anyOnline ? '' : ' The lighting controller is also <b>not responding</b>, which often means a tripped fuse board.'}`}</div>
   <div class="script">“${anyOnline
   ? 'The outside lights have a sensor that brings them on automatically at dusk — so they should usually look after themselves. If tonight’s an exception, flip the Lighthouse lighting switch to override and they’ll come on. That only affects tonight; the sensor picks everything back up automatically from tomorrow, so there’s nothing to reset.'
   : 'The outside lights have a sensor that brings them on automatically at dusk, so they should usually look after themselves. The lighting controller isn’t responding at the moment — it’s worth checking your fuse board first, as a tripped breaker is the usual cause. If everything looks clear, flip the Lighthouse lighting switch to override — that only covers tonight, and the sensor picks everything back up automatically from tomorrow.'}”</div>
   <div class="chips"><button class="chip" onclick="flowStep({r:'ok'})">Caller sorted it with the override</button><button class="chip" onclick="flowStep({r:'cap'})">Still not working — capture &amp; escalate</button></div>`;
        }
        if (f.stage === 1) {
            if (f.data.r === 'ok') {
                doneLine('Resolved via on-site override');
                return outcomeCaptured(f, 'ok', {
                    subject: 'External lighting — resolved with on-site override',
                    detail: 'Caller used the manual override successfully after guidance. Logged so the IoT team can check why the schedule/automation didn’t fire.',
                    script: 'Great — that’s them on. I’ve still logged it so the team can check why they didn’t come on automatically.',
                    OohCaptureClass: 'lighting'
                });
            }
            doneLine('Override did not resolve — P1');
            return outcomeP1(f, 'cap', {
                subject: 'External lighting not working — P1',
                detail: 'Manual override did not resolve the outside lights; possible tripped supply or failed controller. Remote switching not available — needs immediate IoT/electrical follow-up.',
                script: 'I’ve escalated this as urgent — a text has gone to our on-duty manager and someone will call you back shortly. If the dark frontage is a safety concern right now, your site’s duty-manager procedure for calling out an electrician still applies, as this may be an electrical supply issue rather than the lighting control.',
                p1Summary: 'External lighting not responding'
            });
        }
        return '';
    },

    fan(ws, f) {
        // OOHDASH-135 Item 1: filter() so multi-circuit sites surface every fan device.
        const fans = ws.devices.filter(d => d.kind === 'fan');
        if (f.stage === 0) {
            const anyOnline = fans.some(d => d.online);
            doneLine('Live read: extractor fans ' + (fans.length ? (anyOnline ? 'controller online' : 'controller(s) NOT responding') : 'not on Lighthouse here'));
            if (!fans.length) return '<div class="alert info">Extractor fans at this site aren’t on Lighthouse.</div>' + otherShortcut();
            const anySwitchable = fans.some(canSwitch);
            const fanSwitches = fans.map(fan =>
                canSwitch(fan)
                    ? `<div class="zoneread"><span style="font-size:20px">🌀</span><div><div><b>${esc(fan.zone)}</b> — ${fan.telemetry?.switch_1 ? 'currently ON' : 'currently OFF'}</div><div class="small">${esc(fan.deviceId)}</div></div>${switchButtons(fan, 'fan-switch')}<span class="tag ${fan.telemetry?.switch_1 ? 'green' : 'grey'}">${fan.telemetry?.switch_1 ? 'on' : 'off'}</span></div>`
                    : ''
            ).join('');
            if (anySwitchable) return fanSwitches + `<div class="alert info">This fan circuit can be switched on/off directly above — the change only counts once the device confirms. If the caller needs a schedule change instead, capture it below.</div>
   <div class="formrow"><label>Capture a schedule/time request (optional)</label><input id="fannote" data-testid="fan-note" placeholder="e.g. fans on until 1am for deep clean"></div>
   <div class="chips"><button class="chip" onclick="flowStep({note:document.getElementById('fannote').value||'(not specified)'})">Capture &amp; escalate</button></div>`;
            return `<div class="alert info">Fan control isn’t available remotely yet (on the priority list with our platform team). Capture the request — include the times the caller needs.</div>
   <div class="formrow"><label>What does the caller need? (times, which fans)</label><input id="fannote" data-testid="fan-note" placeholder="e.g. fans on until 1am for deep clean"></div>
   <div class="chips"><button class="chip" onclick="flowStep({note:document.getElementById('fannote').value||'(not specified)'})">Capture &amp; escalate</button></div>`;
        }
        if (f.stage === 1) {
            doneLine('Captured: ' + esc(f.data.note));
            return outcomeCaptured(f, 'cap', {
                subject: 'Extractor fan request',
                detail: `Caller request: ${f.data.note}. Remote fan control not available OOH — logged for the IoT team.`,
                script: 'I’ve logged exactly what you need with the times. The IoT team will action it — if the fans are needed for cooking safety right now, the on-site override switch is the fallback.',
                OohCaptureClass: 'fans'
            });
        }
        return '';
    },

    fridge(ws, f) {
        if (f.stage === 0) {
            doneLine('Refrigeration is monitored-only on Lighthouse');
            return `<div class="alert info">Lighthouse <b>monitors</b> fridge/freezer temperatures but doesn’t control them — a warm fridge is an appliance fault.</div>
   <div class="stepq">Is stock at risk right now (freezer warming, big temperature alarm)?</div>
   <div class="chips"><button class="chip" data-testid="fridge-risk" onclick="flowStep({risk:1})">Yes — stock at risk</button><button class="chip" onclick="flowStep({risk:0})">No — just a query</button></div>`;
        }
        if (f.stage === 1) {
            if (f.data.risk) {
                doneLine('Stock at risk — P1');
                return outcomeP1(f, 'risk', {
                    subject: 'Refrigeration temperature alarm — stock at risk',
                    detail: 'Caller reports refrigeration failure with stock at risk. Monitoring-only on Lighthouse; escalated for immediate advice + appliance callout guidance.',
                    script: 'I’ve escalated this as urgent — a text has gone to our on-duty manager. The fridge itself isn’t controlled by Lighthouse, so alongside our callback you should follow your normal appliance repair route — but someone will ring you shortly.',
                    p1Summary: 'Refrigeration failure — stock at risk'
                });
            }
            return outcomeScope(f, 'q', {
                subject: 'Refrigeration query — monitored only',
                evidence: 'Lighthouse monitors refrigeration temperatures for alerting; the appliances themselves are maintained via the site’s normal repair route.',
                script: 'Lighthouse keeps an eye on the temperatures but doesn’t control the fridges — for a faulty unit your usual repairs process is the right route. I’ll note the call.'
            });
        }
        return '';
    },

    connectivity(ws, f) {
        // OOHDASH-91 G2: the site-reachability conclusion is anchored on the LoRaWAN hub (lwgateway), the
        // one device every remote command reaches the site through — NOT an arbitrary `find(kind==='gateway')`,
        // which could narrate an equipment-group gateway's state as "the site". The -r10a / Salus-hub
        // gateways are equipment-group gateways: their state maps to their own group, never the whole site.
        const anchor = siteConnectivityAnchor(ws.devices);
        // Group gateways = non-anchor gateway-kind devices that front an equipment group (resolve to a label;
        // this excludes any spare lwgateway, which fronts no group → equipmentGroupLabel returns null).
        const groupGateways = ws.devices.filter(d => d.kind === 'gateway' && d !== anchor && equipmentGroupLabel(d) !== null);
        const offlineGroups = groupGateways.filter(d => !d.online);

        // gback/dback are recovery re-checks: clear the answer and re-run the read (reflecting any recovery).
        if (f.data.ofq === 'gback' || f.data.ofq === 'dback') f.data.ofq = null;

        if (!f.data.ofq) {
            if (!f.data._cline) {
                let cl;
                if (anchor === null) cl = 'direct-connection site (no site hub)';
                else if (!anchor.online) cl = '<b>the wall-mounted Lighthouse unit is offline</b>';
                else if (offlineGroups.length) cl = `site reachable · ${offlineGroups.length} equipment group${offlineGroups.length > 1 ? 's' : ''} not responding`;
                else cl = 'the site is reachable';
                doneLine('Connection check: ' + cl);
                f.data._cline = 1;
            }

            // Gateway-less site (e.g. 5198): no anchor and no equipment-group gateway to assess. Make NO
            // whole-site reachability claim; defer to per-device liveness for the flow's own equipment. NO
            // Lighthouse-unit / gateway / fuse-board framing anywhere.
            if (anchor === null) {
                const fromKind = f.data.from;
                const equip = ws.devices.filter(d => d.kind !== 'gateway' && (!fromKind || d.kind === fromKind));
                const live = !equip.length ? ''
                    : `<p style="margin:8px 0">The equipment you’re calling about ${equip.every(d => d.online) ? 'is responding' : 'isn’t responding right now'}.</p>`;
                return `<div class="alert info" data-testid="connectivity-gwless">This site uses direct device connections — we’ll check the equipment directly.</div>
   ${live}
   <div class="stepq">We check this site’s equipment directly. Log it for the IoT team, or re-check if the caller says it’s working again.</div>
   <div class="chips"><button class="chip" data-testid="gwless-capture" onclick="flowStep({ofq:'dcap'})">Log it for the IoT team</button><button class="chip" data-testid="gwless-back" onclick="flowStep({ofq:'dback'})">The caller says it’s working again</button></div>`;
            }

            // Anchor OFFLINE → site unreachable → existing plain-English wall-unit outcome (verbatim, unchanged).
            if (!anchor.online) {
                return `<div class="alert err" data-testid="connectivity-alert"><b>The Lighthouse gateway at this site is offline.</b> The gateway is the wall-mounted Lighthouse unit that connects the site — no remote command can reach the site while it’s down. This is usually power or internet at the site.</div>
   <div class="script">“The Lighthouse unit on your wall isn’t responding, which normally means it’s lost power or internet. Could you check the fuse board hasn’t tripped, that the unit has lights on, and the router is up? I’ll stay on the line.”</div>
   <div class="stepq">After the caller checks:</div>
   <div class="chips"><button class="chip" onclick="flowStep({ofq:'back'})">It’s back online / lights on</button><button class="chip" data-testid="connectivity-stilldead" onclick="flowStep({ofq:'cap'})">Still dead — capture &amp; escalate</button></div>`;
            }

            // Anchor ONLINE + one or more equipment-group gateways OFFLINE → site stays reachable, amber
            // group-offline callout (ONE combined callout for 2+ groups). No anchor-down question; drop-to-
            // capture (NO remote-control affordance — the group gateway is down, no command can land).
            if (offlineGroups.length) {
                const labels = offlineGroups.map(equipmentGroupLabel);
                const groupPhrase = l => l === 'the equipment group' ? 'the equipment group' : `the <b>${l}</b> equipment group`;
                const listItem = l => l === 'the equipment group' ? 'the equipment group' : `the <b>${l}</b>`;
                let callout, stepq;
                if (labels.length === 1) {
                    callout = `The site is reachable, but ${groupPhrase(labels[0])} isn’t responding — its own connection is down. Other equipment at this site can still be reached.`;
                    stepq = `${groupPhrase(labels[0]).charAt(0).toUpperCase() + groupPhrase(labels[0]).slice(1)} can’t be reached remotely while its connection is down. Log it for the IoT team, or re-check if the caller says it’s working again.`;
                } else {
                    const n = NUM_WORDS[labels.length] || String(labels.length);
                    callout = `The site is reachable, but ${n} of its equipment groups aren’t responding — ${grammaticalList(labels.map(listItem))} — because each has lost its own connection. Other equipment at this site can still be reached.`;
                    stepq = `These equipment groups can’t be reached remotely while their connection is down. Log it for the IoT team, or re-check if the caller says it’s working again.`;
                }
                return `<div class="alert warn" data-testid="connectivity-group-offline">${callout}</div>
   <div class="stepq">${stepq}</div>
   <div class="chips"><button class="chip" data-testid="group-offline-capture" onclick="flowStep({ofq:'gcap'})">Log it for the IoT team</button><button class="chip" data-testid="group-offline-back" onclick="flowStep({ofq:'gback'})">The caller says it’s working again</button></div>`;
            }

            // Anchor ONLINE, no group gateway offline → site reachable (green, existing all-good callout).
            return `<div class="alert ok">Everything at this site is showing <b>online</b> — the Lighthouse equipment looks healthy. If the caller says nothing is working, it may be a different fault.</div><div class="chips"><button class="chip" onclick="flowStep({ofq:'cap'})">Capture what the caller reports</button></div>`;
        }

        // ---- outcome stage ----
        if (f.data.ofq === 'back') {
            doneLine('Site restored power/connection');
            return outcomeCaptured(f, 'back', {
                subject: 'Lighthouse gateway offline — restored on the call',
                detail: 'Gateway was offline; caller checked fuse board/power and it recovered. Logged for the IoT team to verify overnight stability.',
                script: 'That’s it back online. Give it ten minutes to settle — I’ve logged it so the team check it stayed healthy overnight.',
                OohCaptureClass: 'connectivity'
            });
        }
        // Group-offline capture (anchor up): carries the group context; no remote action possible.
        if (f.data.ofq === 'gcap') {
            const plain = offlineGroups.map(equipmentGroupLabel);
            const labelStr = grammaticalList(plain);
            const multi = plain.length > 1;
            return outcomeCaptured(f, 'gcap', {
                subject: `Equipment group gateway offline — ${labelStr} unreachable`,
                detail: `Site reachable, but the ${labelStr} equipment group gateway${multi ? 's are' : ' is'} offline; that equipment cannot be reached remotely. No remote action possible; needs IoT connectivity investigation${f.data.from ? ` (raised from ${f.data.from} flow)` : ''}.`,
                script: 'The site itself is online, but the unit that runs that equipment has lost its connection, so I can’t reach it remotely tonight. I’ve logged it as a priority for the IoT team.',
                OohCaptureClass: 'connectivity'
            });
        }
        // Gateway-less capture: per-device unreachable at a direct-connection site; NO gateway framing.
        if (f.data.ofq === 'dcap') {
            return outcomeCaptured(f, 'dcap', {
                subject: 'Equipment unreachable — direct-connection site',
                detail: `This site uses direct device connections (no site hub). The equipment the caller reported is not responding on its own connection. No remote action possible; needs IoT connectivity investigation${f.data.from ? ` (raised from ${f.data.from} flow)` : ''}.`,
                script: 'This site’s equipment connects directly rather than through a single hub, and the unit you’re calling about isn’t responding, so I can’t reach it remotely tonight. I’ve logged it as a priority for the IoT team.',
                OohCaptureClass: 'connectivity'
            });
        }
        return outcomeCaptured(f, 'cap', {
            subject: 'Lighthouse gateway / equipment offline',
            detail: `Equipment unreachable after on-site power/router checks. No remote action possible; needs IoT connectivity investigation${f.data.from ? ` (raised from ${f.data.from} flow)` : ''}.`,
            script: 'It’s not something I can fix remotely while the Lighthouse unit is offline, so I’ve logged it as a priority for the IoT team. Anything electrical — like a tripped board that won’t reset — is one for your own electrician tonight.',
            OohCaptureClass: 'connectivity'
        });
    },

    contractor(ws, f) {
        if (f.stage === 0) {
            return `<div class="alert warn"><b>Contractor on site</b> calls are always treated as urgent — an engineer is standing there waiting.</div>
   <div class="formrow"><label>Contractor / company</label><input id="cn" data-testid="contractor-name" placeholder="e.g. the attending engineer’s name and company"></div>
   <div class="formrow"><label>What do they need?</label><input id="cw" data-testid="contractor-need" placeholder="e.g. needs BMS access to the heating"></div>
   <div class="chips"><button class="chip" data-testid="contractor-next" onclick="flowStep({cn:document.getElementById('cn').value||'(name not given)',cw:document.getElementById('cw').value||'(not specified)'})">Next — review need</button></div>`;
        }
        // Stage 1: PowerPause guidance branch (OOHDASH-118 F5)
        if (f.stage === 1 && !f.data.ppguidance) {
            if (!f.data._cline) { doneLine('Contractor: ' + esc(f.data.cn) + ' — ' + esc(f.data.cw)); f.data._cline = 1; }
            return `<div class="stepq">Does the contractor need PowerPause override guidance?</div>
   <div class="chips">
    <button class="chip" data-testid="contractor-pp-yes" onclick="flowStep({ppguidance:'yes'})">Yes — show override procedure</button>
    <button class="chip" data-testid="contractor-pp-no" onclick="flowStep({ppguidance:'no'})">No — escalate now</button>
   </div>`;
        }
        // No path: fall straight through to P1 outcome (unchanged behaviour)
        if (f.data.ppguidance === 'no') {
            return outcomeP1(f, 'p1', {
                subject: 'Contractor on site needs IoT support — P1',
                detail: `Contractor ${f.data.cn} on site now: ${f.data.cw}. Escalated immediately.`,
                script: 'I’ve sent an urgent text to our on-duty manager and they’ll ring the site straight back — usually within a few minutes. Please ask the engineer to hold on.',
                p1Summary: `Contractor on site: ${f.data.cw}`
            });
        }
        // Yes path: site 6786 (Donkey Derby) exception
        const isDonkeyDerby = Number(ws.site.siteNo) === 6786;
        if (f.data.ppguidance === 'yes' && isDonkeyDerby) {
            if (f.data.ppesc) {
                return outcomeP1(f, 'ppesc', {
                    subject: 'PowerPause override — Donkey Derby (site 6786) — IoT team escalation',
                    detail: `Contractor ${f.data.cn} on site at Donkey Derby (6786). Local PowerPause override not available at this site. Escalated to IoT team.`,
                    script: 'I’ve escalated this as a priority — the IoT team will be in touch shortly. IoT direct: 023 814 0228.',
                    p1Summary: 'Contractor: PowerPause — Donkey Derby — IoT escalation',
                    OohCaptureClass: 'kitchen-powerpause'
                });
            }
            if (!f.data._ddline) { doneLine('PowerPause override: Donkey Derby exception — escalate to IoT team'); f.data._ddline = 1; }
            return `<div class="alert warn">
   <b>Donkey Derby (site 6786) — local override not available.</b>
   This site uses a different container type; the local override button does not apply.
  </div>
  <div class="script">
   "I’m sorry — this site can’t be overridden locally. I’m escalating to the IoT team
   right now and they’ll contact the site directly.
   IoT team direct line: <b>023 814 0228</b> — email: <b>iot@airedale-group.co.uk</b>."
  </div>
  <div class="chips">
   <button class="chip" data-testid="contractor-pp-escalate" onclick="flowStep({ppesc:1})">Escalate as P1</button>
  </div>`;
        }
        // Yes path: standard sites — device-type picker then override instruction
        if (f.data.ppguidance === 'yes' && !f.data.pptype) {
            if (!f.data._ppgline) { doneLine('PowerPause override guidance given to contractor'); f.data._ppgline = 1; }
            return `<div class="alert ok">
   <b>PowerPause local override — read to the contractor:</b>
  </div>
  <div class="script">
   <p><b>Step 1 — Locate the panel.</b>
   "The PowerPause panel is usually near the kitchen distribution boards, behind a
   major appliance, or mounted on the ceiling nearby. It will be labelled."</p>
   <p><b>Step 2 — Identify the device type.</b>
   "There should be a label on the unit. It will say either <b>Tongou</b> or
   <b>Owon</b>. Which does it say?"</p>
  </div>
  <div class="formrow"><label>Device type</label></div>
  <div class="chips">
   <button class="chip" data-testid="contractor-pp-tongou" onclick="flowStep({pptype:'tongou'})">Tongou</button>
   <button class="chip" data-testid="contractor-pp-owon" onclick="flowStep({pptype:'owon'})">Owon</button>
  </div>`;
        }
        // Device type confirmed: show override instruction then log chip
        if (f.data.pptype && !f.data.ppdone) {
            if (!f.data._pptline) { doneLine('PowerPause override: device type ' + f.data.pptype + ' — button procedure given'); f.data._pptline = 1; }
            const devLabel = f.data.pptype === 'tongou' ? 'Tongou' : 'Owon';
            return `<div class="script">
   <p><b>${devLabel} override:</b>
   "Press the override button on the front of the ${devLabel} unit <b>once</b> — do not
   hold it. The override stays active until the device’s next scheduled change. The
   equipment should power on within a few seconds."</p>
  </div>
  <div class="alert info">
   This is a temporary override only. The ${devLabel} device will return to its normal
   schedule at the next programmed event.
  </div>
  <div class="chips">
   <button class="chip" data-testid="contractor-pp-done" onclick="flowStep({ppdone:1})">Override done — log the call</button>
  </div>`;
        }
        // Override done: log the P1 outcome
        if (f.data.ppdone) {
            return outcomeP1(f, 'ppdone', {
                subject: 'PowerPause contractor override — guidance given on site',
                detail: `Contractor ${f.data.cn} given PowerPause override procedure (${f.data.pptype} device). Override active until next scheduled event.`,
                script: 'I’ve logged this call. The override will hold until the device’s next scheduled change — if the issue returns, ring back and we’ll escalate further.',
                p1Summary: `Contractor on site: PowerPause override given (${f.data.pptype})`,
                OohCaptureClass: 'kitchen-powerpause'
            });
        }
        // Fallback: should not be reached in normal flow
        if (!f.data._cline) { doneLine('Contractor: ' + esc(f.data.cn) + ' — ' + esc(f.data.cw)); f.data._cline = 1; }
        return outcomeP1(f, 'p1', {
            subject: 'Contractor on site needs IoT support — P1',
            detail: `Contractor ${f.data.cn} on site now: ${f.data.cw}. Escalated immediately.`,
            script: 'I’ve sent an urgent text to our on-duty manager and they’ll ring the site straight back — usually within a few minutes. Please ask the engineer to hold on.',
            p1Summary: `Contractor on site: ${f.data.cw}`
        });
    },
    other(ws, f) {
        if (f.stage === 0) {
            return `<div class="stepq">Describe the issue in the caller’s words</div>
   <div class="formrow"><textarea id="otxt" data-testid="other-text" rows="2" placeholder="e.g. “the voltage optimiser needs resetting — is that you?”">${esc(f.data.freeText || '')}</textarea></div>
   <div class="chips">
    <button class="chip" data-testid="other-check" onclick="flowStep({q:document.getElementById('otxt').value||'(not specified)',path:'check'})">Check if it’s Lighthouse-controlled</button>
    <button class="chip" data-testid="other-capture" onclick="flowStep({q:document.getElementById('otxt').value||'(not specified)',qraw:document.getElementById('otxt').value,path:'cap'})">Capture &amp; escalate as described</button>
   </div>`;
        }
        if (f.stage === 1) {
            if (!f.data._oline) { doneLine('Issue: “' + esc(f.data.q) + '”'); f.data._oline = 1; }
            // OOHDASH-134: Capture now opens a two-button choice (P1 Escalation / normal priority).
            if (f.data.path === 'cap') return otherP1Choice(f);
            return `<div class="stepq">Which of these is it closest to?</div><div class="chips">
    ${state.workspace.scope.map(g => `<button class="chip" data-testid="scope-${g.key}" onclick="flowStep({g:'${g.key}'})">${esc(g.label)}</button>`).join('')}</div>
   <p class="small" style="margin-top:8px">This checks the live device inventory for <b>this site</b> — it can say with certainty what is and isn’t on Lighthouse here. What it can’t always settle is a fault <i>inside</i> shared kit (e.g. the boiler behind our controls).</p>`;
        }
        if (f.stage === 2 && f.data.path === 'normal') {
            // OOHDASH-134: identical to the pre-v1.4.2 Capture outcome.
            if (!f.data._nline) { doneLine('Raised as a normal priority ticket'); f.data._nline = 1; }
            return outcomeCaptured(f, 'cap', {
                subject: 'General issue captured',
                detail: `Caller reported: ${f.data.q}. Captured verbatim for the IoT team.`,
                script: 'I’ve logged exactly what you’ve described for the IoT team — they’ll pick it up on the next working day. If it gets urgent tonight, ring back and we’ll escalate.',
                OohCaptureClass: 'general'
            });
        }
        if (f.stage === 2 && f.data.path === 'p1') {
            // OOHDASH-134: same shared P1 signal as the lighting/kitchen/contractor flows
            // (escalate-p1 via outcomeP1; no capture class, no actionId).
            if (!f.data._pline) { doneLine('P1 Escalation chosen'); f.data._pline = 1; }
            const reason = f.data.p1reason;
            return outcomeP1(f, 'p1', {
                subject: 'Something else - urgent, escalated as P1',
                detail: `Caller reported: ${reason}. Did not fit a specific tile; handler judged it urgent tonight.`,
                script: 'I’ve escalated this as urgent — a text has gone to our on-duty manager and someone will call you back shortly.',
                p1Summary: otherP1Summary(reason)
            });
        }
        if (f.stage === 2) {
            const g = state.workspace.scope.find(x => x.key === f.data.g);
            if (!f.data._gline) {
                doneLine('Checked: ' + g.label + ' → ' + (g.level === 'ctl' ? 'Lighthouse-controlled here' : g.level === 'mon' ? 'monitored only here' : 'not on Lighthouse here'));
                f.data._gline = 1;
            }
            if (g.level === 'ctl') return `<div class="alert ok"><b>${esc(g.label)} IS Lighthouse-controlled at this site.</b> Use the matching flow to action it.</div><div class="chips"><button class="chip" onclick="anotherIssue()">Back to the issue picker</button></div>`;
            if (g.level === 'mon') {
                return outcomeScope(f, 'mon', {
                    subject: `${g.label} — monitored only`,
                    evidence: `${g.label} is monitored by Lighthouse at this site but not remotely controllable. Caller’s issue: ${f.data.q}`,
                    script: 'Lighthouse monitors that here but doesn’t control it remotely — I’ll log your request for the IoT team rather than leave you going round in circles.'
                });
            }
            return outcomeScope(f, 'none', {
                subject: `${g.label} — not on Lighthouse at this site`,
                evidence: `Live inventory shows no Lighthouse ${g.label.toLowerCase()} devices at ${state.workspace.site.siteName}. Caller’s issue: ${f.data.q}`,
                script: 'That isn’t part of the Lighthouse system at your site — it’ll be one for your usual repairs route. I’ll note the call so there’s a record you asked.'
            });
        }
        return '';
    }
};
