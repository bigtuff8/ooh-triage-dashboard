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
    { k: 'other', ic: '✍️', t: 'Something else / not sure', d: "Describe it in the customer\'s words" }
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
    // before heating so "air con" / "aircon" / "cooling" score to aircon, not heating\'s 'warm'/'cold'.
    { k: 'aircon', words: ['air con', 'aircon', 'a/c', 'air conditioning', 'cooling', 'air-con'] },
    { k: 'heating', words: ['heat', 'cold', 'freez', 'warm', 'too hot', 'boiling hot', 'radiator', 'temperature', 'thermostat', 'boiler'] },
    { k: 'kitchen', words: ['fryer', 'grill', 'glasswash', 'dishwash', 'oven', 'merrychef', 'kitchen', 'equipment', 'no power', 'lincat', 'coffee', 'pot wash', 'deep clean'] },
    { k: 'lighting', words: ['light', 'dark', 'car park', 'festoon', 'sign'] },
    { k: 'fan', words: ['fan', 'extract', 'ventilat'] },
    { k: 'fridge', words: ['fridge', 'freezer', 'chill', 'cellar'] },
    { k: 'contractor', words: ['engineer', 'contractor', 'bellrock', 'dpp', 'on site', 'bms'] }
];

function catOf(k) { return CATS.concat(HIDDENCATS).find(c => c.k === k); }

function issueSearch(q) {
    const box = $('#isugg');
    // The caller\'s words are held in state and read back by startSuggestedFlow —
    // NEVER interpolated into inline handler source (quotes in natural speech,
    // e.g. "won\'t", break a JS string inside an onclick attribute).
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
 * Symmetric with startSuggestedFlow — the tile path must carry the handler\'s words too.
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
    // OOHDASH-159 rev 5 (E1): every issue gets a key so the server-side call record can follow it.
    const issueKey = (opts && opts.carryNotes && state.flow && state.flow.issueKey) || ('i' + (++issueSeq));
    state.flow = { cat: k, stage: 0, data: { freeText: freeText || '', _flowKey: k, additionalNotes }, done: [], issueKey };
    render();
    callProgress();
}

/* ------------------------ OOHDASH-159 rev 5 (E1): automatic call record ------------------------ */
let issueSeq = 0;
/** callId + issueKey for any outcome request, so the server links the ticket to the call record. */
function callFields() {
    return { callId: (state.call && state.call.id) || null, issueKey: (state.flow && state.flow.issueKey) || null };
}
/** The current issue's progress (what we know so far, notes) for the call record. */
function callIssuePayload() {
    const f = state.flow;
    if (!f) return {};
    const c = catOf(f.cat);
    return { issueKey: f.issueKey, cat: c ? c.t : f.cat, knownSoFar: knownSoFarLines(f), notes: (f.data.additionalNotes || '').trim() || null };
}
/** Sent after every step. Fire and forget: the record never blocks the agent. */
function callProgress() {
    if (!state.call || !state.call.id || !state.flow) return;
    const id = state.call.id;
    api.post('/api/calls/' + encodeURIComponent(id) + '/progress', callIssuePayload()).catch(err => {
        if (err.status === 409) showCallReopenBanner(id);
    });
}
/**
 * Finalises the issue ('another-issue') or the whole call ('end-call', 'left-screen', 'site-change').
 * keepalive lets the request finish while the page is closing.
 */
function callFinalise(reason, keepalive) {
    if (!state.call || !state.call.id) return Promise.resolve(null);
    const id = state.call.id;
    const body = { reason, ...callIssuePayload() };
    if (reason !== 'another-issue') state.call.id = null; // never finalise the same call twice from here
    if (keepalive) {
        try {
            fetch('/api/calls/' + encodeURIComponent(id) + '/finalise', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        } catch (e) { /* the idle sweeper finalises it instead */ }
        return Promise.resolve(null);
    }
    return api.post('/api/calls/' + encodeURIComponent(id) + '/finalise', body).catch(() => null);
}
// Only finalise on actual unload (persisted=true means bfcache — the page is kept alive).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('pagehide', (ev) => { if (!ev.persisted && state.call && state.call.id) callFinalise('left-screen', true); });

// Part 2b: heartbeat — keep the server-side idle timer alive while the agent is on screen.
// Runs every 2 minutes regardless of visibilityState (tab focus is not required).
let _hbTimer = null;
function startHeartbeat() {
    if (_hbTimer) return;
    if (typeof setInterval === 'undefined') return;
    _hbTimer = setInterval(() => {
        if (!state.call || !state.call.id) return;
        fetch('/api/calls/' + encodeURIComponent(state.call.id) + '/heartbeat', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}'
        }).catch(() => {});
    }, 120000);
    if (_hbTimer && _hbTimer.unref) _hbTimer.unref();
}
if (typeof window !== 'undefined') startHeartbeat();

/** Part 2c: 409 recovery banner — the call was auto-closed while the agent was still on screen. */
function showCallReopenBanner(callId) {
    if (document.querySelector('[data-testid="call-reopen-banner"]')) return; // already shown
    const bar = document.createElement('div');
    bar.className = 'alert warn';
    bar.setAttribute('data-testid', 'call-reopen-banner');
    bar.innerHTML = '<b>Your call record was automatically closed</b> (no activity for a while). ' +
        '<button class="btn small" onclick="reopenCall(\'' + encodeURIComponent(callId) + '\',this.closest(\'[data-testid=call-reopen-banner]\'))">Continue this call</button> ' +
        '<button class="btn small" onclick="this.closest(\'[data-testid=call-reopen-banner]\').remove()">Dismiss</button>';
    const view = typeof $ !== 'undefined' && $('[data-testid="workspace"]');
    if (view) view.prepend(bar); else { const v = document.getElementById('view'); if (v) v.prepend(bar); }
}
async function reopenCall(encodedId, banner) {
    const id = decodeURIComponent(encodedId);
    try {
        const res = await api.post('/api/calls/' + encodeURIComponent(id) + '/reopen');
        if (res && res.ok) {
            if (!state.call) state.call = { id, issues: [] };
            else state.call.id = id;
            if (banner) banner.remove();
        } else {
            toast('Could not continue the call record: ' + esc((res && res.error) || 'unknown error'));
        }
    } catch (err) {
        toast('Could not continue the call record: ' + esc(err.message));
    }
}

/** A ticket number that opens the in-app ticket page in a NEW tab (A1). Never a Zendesk link. */
function tktLink(id, testid) {
    if (id == null || id === '?') return '#?';
    return '<a class="tktlink" href="/ticket/' + encodeURIComponent(String(id)) + '" target="_blank" rel="noopener"' + (testid ? ' data-testid="' + testid + '"' : '') + ' title="Opens the ticket in a new tab">#' + esc(String(id)) + '</a>';
}

/** K1: the full PowerPause guide, served by the app, opened in a new tab. */
function guideLink() {
    return '<a class="guidelink" data-testid="override-guide-link" href="/guides/powerpause-contractor-info.html" target="_blank" rel="noopener">📘 Show the override guide (opens in a new tab)</a>';
}

/**
 * c (rev 5): customer-answer buttons have their own look and a "Customer's answer" label above every set.
 * `buttonsHtml` are <button class="chip ..."> elements; each gets the `ans` class.
 */
function answers(buttonsHtml, testid) {
    const html = String(buttonsHtml).replace(/class="chip(?![\w-])/g, 'class="chip ans');
    return '<div class="answers" data-testid="' + (testid || 'customer-answers') + '"><div class="ans-label">👤 Customer\'s answer</div><div class="chips">' + html + '</div></div>';
}

function cancelFlow() {
    if (confirm('Stop this issue? What you have covered so far is still saved to the call record.')) {
        callFinalise('another-issue');
        notesDraftClear(); // OOHDASH-119: clear the draft on explicit cancel
        state.flow = null;
        render();
    }
}

function flowStep(patch) {
    state.flow.stage++;
    Object.assign(state.flow.data, patch || {});
    render();
    callProgress();
}

// OOHDASH-159 rev 4: "What we know so far". Each line is a fact of one of two kinds:
// 'customer' (what the customer told us, 👤) or 'check' (what the dashboard checked by itself, 🔎).
// Never an outcome, action or decision. Re-renders re-run a step, so ignore an exact repeat.
function doneLine(txt, kind) {
    const k = kind === 'customer' ? 'customer' : 'check';
    if (!state.flow.done.some(d => d.t === txt && d.k === k)) state.flow.done.push({ k, t: txt });
}

/** The list as plain strings for the ticket ("Customer: ..." / "Checked: ..."), first line = typed words. */
function knownSoFarLines(f) {
    const plain = h => String(h == null ? '' : h).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    const out = [];
    if (f && f.data && f.data.freeText) out.push('Customer: The customer says: "' + plain(f.data.freeText) + '"');
    ((f && f.done) || []).forEach(d => {
        const t = plain(d.t);
        if (t) out.push((d.k === 'customer' ? 'Customer: ' : 'Checked: ') + t);
    });
    return out.slice(0, 30);
}

/* ------------------------ OOHDASH-159 rev 4: the text key ------------------------ */
/** A value taken from the site (equipment name, time, temperature, ticket number), highlighted. */
function dyn(v) { return '<span class="dyn">' + esc(String(v == null ? '' : v)) + '</span>'; }

/**
 * Script: the green "Say to the customer" box. `html` is already-safe HTML (may be ''). `ask` is the
 * question to the customer, rendered as the box's last line ("Ask the customer: ..."). opts.testid
 * overrides the default say-block test id.
 */
function sayBox(html, ask, opts) {
    const tid = (opts && opts.testid) || 'say-block';
    const askHtml = ask ? '<div class="say-ask" data-testid="ask-customer"><b>Ask the customer:</b> ' + ask + '</div>' : '';
    return '<div class="say" data-testid="' + tid + '"><span class="say-label">🗣 Say to the customer</span>' + (html || '') + askHtml + '</div>';
}

/** Agent background: the blue "For you" box. Left out when there is nothing to say. */
function infoBox(html) {
    if (!html) return '';
    return '<div class="gtk" data-testid="gtk-block"><span class="gtk-label">ℹ For you (background, not to read out)</span>' + html + '</div>';
}

/** Ticket text: the dashed uncoloured box. subject/detail are plain text (escaped here). */
function ticketBox(subject, detail, testid) {
    return '<div class="ticketbox" data-testid="' + (testid || 'ticket-box') + '"><span class="tb-label">📄 What goes on the ticket (for the IoT team)</span>' +
        (subject ? '<div class="tb-subject">' + esc(subject) + '</div>' : '') +
        (detail ? '<div class="tb-detail">' + esc(detail) + '</div>' : '') + '</div>';
}

/** Ordinary red warning, always placed directly above the button it warns about. */
function warnBox(text, testid) {
    return '<div class="warnbox" data-testid="' + (testid || 'warn-box') + '"><b>Before you press:</b> ' + text + '</div>';
}

/** The stronger P1 warning (solid red heading). */
function p1WarnBox() {
    return '<div class="p1warn" data-testid="p1-confirm-warning"><div class="p1warn-head">🚨 This raises a P1</div><div class="p1warn-body">It sends a text message to the on-call agent straight away.</div></div>';
}

/**
 * One neutral after-action card for every outcome (rev 5, f): the words to say come FIRST, and the recap of
 * what actually happened sits BELOW them, with the ticket number (opens the in-app ticket in a new tab).
 */
function afterCard(testid, head, ticketId, lineHtml, scriptHtml, extra) {
    const badge = ticketId != null ? '<span class="tktbadge" data-testid="after-ticket">Ticket ' + tktLink(ticketId) + '</span>' : '';
    return (scriptHtml ? sayBox(scriptHtml, '', { testid: 'after-say' }) : '') +
        '<div class="outcome after" data-testid="' + testid + '"><div class="after-head"><span class="after-kicker">What happened</span>✔ ' + head + badge + '</div><div class="after-body">' +
        (lineHtml || '') + (extra || '') + '</div></div>';
}

/* ------------------------ heating area model (OOHDASH-82, design §7) ------------------------ */

// Fixed display order for the two caller-meaningful areas (Accommodation first, design §7.1).
const HEATING_AREA_ORDER = ['Accommodation', 'Bar/Restaurant'];

/**
 * The site\'s heating devices for the area model — Salus iT700/iT500 (design §7.1), PLUS pub
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
  <div class="flowbody">${knownSoFarHtml(f)}${body}${notesBox}</div>
  <div class="flowfoot"><span>You: <b>${esc(state.me.operator.name)}</b></span><span style="margin-left:auto" data-testid="flow-foot-record">Everything on this call is saved to the IoT Support Dashboard automatically</span></div>
 </div>`;
}

/** "What we know so far": 👤 customer answers and 🔎 dashboard checks; the typed words come first. */
function knownSoFarHtml(f) {
    const items = [];
    if (f.data.freeText) items.push(`<li class="stepdone" data-testid="known-customer-words"><span class="kicon">👤</span><span>The customer says: "${esc(f.data.freeText)}"</span></li>`);
    (f.done || []).forEach(d => {
        items.push(`<li class="stepdone" data-kind="${d.k}"><span class="kicon">${d.k === 'customer' ? '👤' : '🔎'}</span><span>${d.t}</span></li>`);
    });
    if (!items.length) return '';
    return `<div class="known" data-testid="known-so-far"><div class="known-title">What we know so far</div><ul>${items.join('')}</ul></div>`;
}

/* ------------------------ outcome plumbing (async → ticket) ------------------------ */
// OOHDASH-159 rev 5 (E1, f): one end-of-call block at the bottom of every outcome. No log step: pressing
// either button closes this issue's record; the conversation is published automatically.
function outButtons() {
    return `<div class="endblock" data-testid="end-block"><p class="endnote" data-testid="publish-note">When you press either button, this conversation is published to the IoT Support Dashboard as the complete record. If you leave the screen, it is published automatically.</p><div class="outbtns"><button class="btn" data-testid="add-another-issue" onclick="anotherIssue()">➕ Raise another issue</button><button class="btn primary" data-testid="end-call" onclick="endCall()">✔ End call</button></div></div>`;
}

function anotherIssue() { callFinalise('another-issue'); notesDraftClear(); state.flow = null; render(); } // OOHDASH-119: clear draft

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
function finishOutcome(f, key, payload, renderCard, pre) {
    // Already succeeded — return the cached card HTML
    if (f.data['_out_' + key]) return f.data['_out_' + key];
    // Error state — show inline retry
    if (f.data['_err_' + key]) {
        const msg = f.data['_err_' + key];
        return `<div class="alert err">Couldn\'t record the outcome: ${esc(msg)}
   <button class="chip" style="margin-left:8px" onclick="state.flow.data['_err_${key}']=null;state.flow.data['_pend_${key}']=null;state.flow.data['_conf_${key}']=null;render()">Try again</button></div>`;
    }
    // Store the payload and renderCard idempotently on first visit
    if (!f.data['_conf_' + key]) {
        f.data['_conf_' + key] = { ...payload };
        f.data['_renderCard_' + key] = renderCard;
    }
    // Submitting — loading state
    if (f.data['_pend_' + key]) {
        return (pre || '') + '<div class="alert info" data-testid="saving-record">Saving to the call record…</div>';
    }
    // OOHDASH-159 rev 5 (E1): nothing to press for an ordinary outcome. The ticket is created as soon as
    // the step is reached, so its reference can be read out. Only a P1 keeps a confirm step.
    if (payload.type !== 'escalate-p1') {
        f.data['_pend_' + key] = 1;
        Promise.resolve().then(() => window.submitPendingOutcome(key, true));
        return (pre || '') + '<div class="alert info" data-testid="saving-record">Saving to the call record…</div>';
    }
    // Confirm step (OOHDASH-159 rev 4): optional script/info for this step, the ticket box, then the
    // warning directly above the button. A P1 gets the stronger warning and the only red button.
    // (The FLOW-BOX is injected by renderFlow outside this function so it stays live during the step)
    // B20: reason box for manual P1s; button disabled until reason is valid
    const isAuto = !!(f.data.p1Origin === 'automatic');
    const reasonOk = isAuto || p1ReasonValid(f.data.p1Reason);
    const reasonBoxHtml = isAuto ? '' : p1ReasonBox(f);
    return `<div class="confirm-step" data-testid="confirm-step">
  ${pre || ''}
  ${ticketBox(payload.subject, payload.detail)}
  ${reasonBoxHtml}
  ${p1WarnBox()}
  <button class="btn danger" data-testid="record-outcome" style="margin-top:4px" onclick="submitPendingOutcome('${key}')"${reasonOk ? '' : ' disabled aria-disabled="true"'}>Raise the P1</button>
 </div>`;
}

/**
 * OOHDASH-119 — fires the actual POST after the agent clicks "Record outcome".
 * Global so it can be called from the inline onclick in the confirm step HTML.
 */
window.submitPendingOutcome = function submitPendingOutcome(key, auto) {
    const f = state.flow;
    if (!f) return;
    const payload = f.data['_conf_' + key];
    if (!payload) return;
    if (!auto && f.data['_pend_' + key]) return; // double-click guard
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
        knownSoFar: knownSoFarLines(f), // OOHDASH-159 rev 4: written onto the ticket, never into the P1 text
        ...callFields(), // rev 5 (E1): link the ticket to the call record
        customerContact: callerContactFrom(state.caller), // OOHDASH-146 B10
        ...payload,
        // B20: p1Reason typed in confirm step; p1Summary cut to 80 chars; p1Origin for automatic P1s
        // Must come AFTER ...payload so the computed values win over payload.p1Summary (which is
        // undefined for flows that don't pass an explicit p1Summary to outcomeP1).
        ...(payload.type === 'escalate-p1' ? {
            p1Reason: f.data.p1Reason || null,
            p1Summary: p1SummaryFromReason(f.data.p1Reason) || payload.p1Summary || null,
            p1Origin: f.data.p1Origin || null
        } : {})
    }).then(res => {
        notesDraftClear(); // OOHDASH-119: clear sessionStorage draft on success
        const echo = ''; // rev 4: the customer's words are already the first line of What we know so far
        const notesEcho = (f.data.additionalNotes || '').trim()
            ? (() => {
                const isP1 = payload.type === 'escalate-p1';
                const tid = res?.ticket?.id ?? null; // guard: id may be absent on degraded response
                const ref = tid ? `ticket ${tktLink(tid)}` : 'the ticket';
                const mid = isP1
                    ? `Your notes are on ${ref} for the morning review: "${esc(f.data.additionalNotes)}" (not in the urgent text)`
                    : `Your notes are on ${ref}: "${esc(f.data.additionalNotes)}"`;
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

// OOHDASH-159 rev 4: every outcome helper renders the same neutral after-action card. `script` may be
// a string or a function of the response (so it can quote the ticket number). `pre` is optional
// script/info HTML shown on the confirm step above the ticket box.
function scriptText(script, res) { return typeof script === 'function' ? script(res) : script; }

function outcomeCaptured(f, key, { subject, detail, script, OohCaptureClass, pre, line, closeOnCreate }) {
    return finishOutcome(f, key,
        { type: 'capture', subject, detail, OohCaptureClass, issueLabel: subject, issueCls: 'blue', ...(closeOnCreate ? { closeOnCreate: true } : {}) },
        res => afterCard('outcome-captured', 'Ticket created for the IoT team', res.ticket.id,
            `<p class="after-line">${line || 'Nothing was switched from here. The IoT team picks it up the <b>next working day</b>.'}</p><p class="after-line small">On the ticket: ${esc(subject)}</p>`,
            scriptText(script, res)), pre);
}

function outcomeP1(f, key, { subject, detail, script, p1Summary, OohCaptureClass, pre }) {
    return finishOutcome(f, key,
        { type: 'escalate-p1', subject, detail, p1Summary, OohCaptureClass: OohCaptureClass || null, issueLabel: subject, issueCls: 'red' },
        res => afterCard('outcome-p1', 'P1 raised', res.ticket.id,
            `<p class="after-line" data-testid="p1-dispatch-status">The on-call agent has been sent a text message and will call the site back.</p><p class="after-line small">On the ticket: ${esc(subject)}</p>`,
            scriptText(script, res)), pre);
}

/* ------------------------ OOHDASH-146 D13: universal risk question (B19 / B20) --------------- */

const RISK_ASK = 'Is there an immediate risk to trade or to anyone\'s health and safety?';
const P1_REASON_BOX_MAX = 500;
const P1_REASON_MIN_LEN = 10;

/** True when text (trimmed, spaces collapsed) is at least 10 characters. */
function p1ReasonValid(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().length >= P1_REASON_MIN_LEN;
}

/**
 * Input handler for the P1 reason textarea: persists the value and enables / disables the
 * "Raise the P1" button. Global so it can be called from the inline oninput attribute.
 */
function p1ReasonInput(value) {
    const f = state.flow;
    if (!f) return;
    f.data.p1Reason = value;
    const ok = p1ReasonValid(value);
    const btn = document.querySelector('[data-testid="record-outcome"]');
    if (btn) { btn.disabled = !ok; if (ok) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', 'true'); }
}

/** Renders the mandatory "Why is this urgent?" comment box above p1WarnBox. */
function p1ReasonBox(f) {
    const val = esc(f.data.p1Reason || '');
    return `<div class="formrow" style="margin-top:10px"><label for="p1-reason-input">Why is this urgent? (required, goes on the P1 ticket)</label>
   <textarea id="p1-reason-input" data-testid="p1-reason" maxlength="${P1_REASON_BOX_MAX}" rows="2" oninput="p1ReasonInput(this.value)">${val}</textarea></div>`;
}

/** Cuts a P1 reason to at most 80 characters for the SMS summary. */
function p1SummaryFromReason(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > 80 ? t.slice(0, 77) + '...' : t;
}

/**
 * Onclick handler for the universal risk question chips. Sets f.data._riskAns and re-renders
 * without advancing the stage, so the same call to riskQuestion delivers the Yes / No result.
 */
function riskAns(isYes) {
    const f = state.flow;
    if (!f) return;
    f.data._riskAns = isYes ? 1 : 0;
    render();
}

/**
 * D13: the universal risk question. Shows the question with a grey "for you" note and Yes / No
 * chips on first call; on re-render after the agent clicks, records the known-so-far line and
 * delegates to the yes() or no() callback.
 * @param {object} f - flow state
 * @param {{yes: Function, no: Function}} callbacks - called when the customer answers
 */
function riskQuestion(f, { yes, no }) {
    if (f.data._riskAns === undefined) {
        const note = infoBox('<p>Trade means the site cannot serve customers or cannot open. Health and safety means anything that could hurt someone.</p><p>Yes goes to an urgent P1; No gives a next-working-day ticket.</p>');
        return note + sayBox('', RISK_ASK) +
            answers('<button class="chip" data-testid="risk-yes" onclick="riskAns(1)">Yes</button>' +
                    '<button class="chip" data-testid="risk-no" onclick="riskAns(0)">No</button>');
    }
    if (f.data._riskAns) {
        if (!f.data._riskLine) { doneLine('Immediate risk to trade or to anyone\'s health and safety: yes', 'customer'); f.data._riskLine = 1; }
        return yes();
    }
    if (!f.data._riskLine) { doneLine('Immediate risk to trade or to anyone\'s health and safety: no', 'customer'); f.data._riskLine = 1; }
    return no();
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

function outcomeScope(f, key, { subject, evidence, script, pre }) {
    return finishOutcome(f, key,
        { type: 'scope-only', subject, detail: evidence, issueLabel: subject, issueCls: 'grey', closeOnCreate: true },
        res => afterCard('outcome-scope', 'Recorded and closed (contact history)', res.ticket.id,
            '<p class="after-line">Nothing for the IoT team to do: Lighthouse doesn\'t control this here. The call is on the site\'s contact history.</p>',
            scriptText(script, res)), pre);
}

function outcomeNoAction(f, key, { subject, detail, script, pre }) {
    return finishOutcome(f, key,
        { type: 'no-action', subject, detail, issueLabel: subject, issueCls: 'grey' },
        res => afterCard('outcome-noaction', 'Call recorded, nothing changed', res.ticket.id,
            '<p class="after-line">Nothing was switched or changed. The conversation is on the site\'s contact history.</p>',
            scriptText(script, res)), pre);
}

/* ------------------------ OOHDASH-159 rev 5 (i): timetable requests ------------------------ */
// The agent COLLECTS what the customer needs that the timetable doesn't cover BEFORE the ticket is created.
// The next screen is only the confirmation: ticket number, and the team contacts them the next working day.
const SCHED_APPROVAL = 'Permanent changes to the timetable need approval from the pub\'s management, usually the Area Manager. Our team will check that with them before anything changes.';

/* ------------------------ OOHDASH-146 D14: urgency helper (B28) ----------------------------- */
/**
 * Maps the agent's "when needed" answer (tonight/tmrw-before12/tmrw-12plus/later) to a Date
 * for urgencyOf. Used by the fan and kitchen flows.
 */
function neededAtFromWhen(when) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (when) {
        case 'tonight':       return new Date(today.getTime() + 23 * 3600000 + 59 * 60000);
        case 'tmrw-before12': return new Date(today.getTime() + 24 * 3600000 + 11 * 3600000);
        case 'tmrw-12plus':   return new Date(today.getTime() + 24 * 3600000 + 12 * 3600000);
        case 'later':         return new Date(today.getTime() + 48 * 3600000 + 12 * 3600000);
        default:              return new Date(today.getTime() + 23 * 3600000 + 59 * 60000);
    }
}

/** Renders the urgency banner for planned requests (D14). */
function urgencyBannerHtml(isUrgent, testid) {
    const tid = testid || 'urgency-banner';
    const cls = isUrgent ? 'err' : 'ok';
    const label = isUrgent ? 'Urgent — outside office hours' : 'Not urgent — the IoT team can pick this up in time';
    return '<div class="alert ' + cls + '" data-testid="' + tid + '"><b>' + label + '</b></div>';
}

/** The four "when is it needed?" chips used in D14 flows. stateKey is the flowStep key to set. */
function whenNeededChips(stateKey) {
    return answers(
        '<button class="chip" data-testid="when-tonight" onclick="flowStep({' + stateKey + ':\'tonight\'})">Tonight</button>' +
        '<button class="chip" data-testid="when-tmrw-before12" onclick="flowStep({' + stateKey + ':\'tmrw-before12\'})">Tomorrow before 12:00</button>' +
        '<button class="chip" data-testid="when-tmrw-12plus" onclick="flowStep({' + stateKey + ':\'tmrw-12plus\'})">Tomorrow at 12:00 or later</button>' +
        '<button class="chip" data-testid="when-later" onclick="flowStep({' + stateKey + ':\'later\'})">A later day this week</button>'
    );
}

function scheduleCollect(f, key, { equipment, preselect, timetableHtml, subject, OohCaptureClass, lead }) {
    const d = f.data;
    if (!d.schEq) d.schEq = (preselect || []).slice();
    if (!d.schDone) {
        const eqChips = (equipment || []).map((n, i) =>
            `<button class="chip${d.schEq.includes(n) ? ' sel' : ''}" data-testid="sched-eq-${i}" aria-pressed="${d.schEq.includes(n)}" onclick="schedToggleEq(${i})">${dyn(n)}</button>`).join('');
        const kindChip = (k, label) => `<button class="chip${d.schKind === k ? ' sel' : ''}" data-testid="sched-kind-${k}" aria-pressed="${d.schKind === k}" onclick="state.flow.data.schKind='${k}';render()">${label}</button>`;
        const missing = d.schMissing && (!String(d.schTimes || '').trim() || !d.schKind)
            ? '<div class="alert err" data-testid="sched-missing">Ask the customer for the days and times, and whether it\'s just this once or every week, before you continue.</div>' : '';
        return `<div class="schedcollect" data-testid="sched-collect">
   ${infoBox(timetableHtml || '')}
   ${sayBox((lead ? '<p>' + lead + '</p>' : '') + '<p>I can\'t change the timetable from here tonight, but I\'ll pass exactly what you need to our IoT team. ' + SCHED_APPROVAL + '</p>', 'what do you need that the timetable doesn\'t cover? Which equipment, which days and times, and is it just this once or every week?')}
   ${(equipment || []).length ? `<div class="formrow"><label>Which equipment? <span class="small">(from this site's equipment list)</span></label>${answers(eqChips, 'sched-equipment')}</div>` : ''}
   <div class="formrow"><label for="schtimes">Which days and times?</label><input id="schtimes" data-testid="sched-times" value="${esc(d.schTimes || '')}" oninput="state.flow.data.schTimes=this.value" placeholder="e.g. Saturday, on from 10:00 for a breakfast event"></div>
   <div class="formrow"><label>Just this once, or every week?</label>${answers(kindChip('once', 'Just this once') + kindChip('permanent', 'Every week (a permanent change)'), 'sched-kind')}</div>
   <div class="formrow"><label for="schmore">Anything else they told you <span class="small">(optional)</span></label><textarea id="schmore" data-testid="sched-more" rows="2" oninput="state.flow.data.schMore=this.value">${esc(d.schMore || '')}</textarea></div>
   ${missing}
   <button class="btn primary" data-testid="sched-continue" onclick="schedContinue()">Continue</button></div>`;
    }
    const eq = d.schEq.length ? d.schEq.join(', ') : 'not specified';
    const kind = d.schKind === 'permanent' ? 'every week (permanent change: needs the pub\'s management approval)' : 'just this once';
    return outcomeCaptured(f, key, {
        subject: subject + (d.schKind === 'permanent' ? ' — permanent change' : ' — one-off'),
        detail: `Customer needs: ${eq}; ${String(d.schTimes || '').trim()}; ${kind}.${String(d.schMore || '').trim() ? ' Also said: ' + String(d.schMore).trim() + '.' : ''} Collected on the call; not changed out of hours.`,
        script: res => 'Thanks, that\'s with our IoT team, reference ' + dyn(res.ticket.id) + '. They\'ll contact you the next working day to arrange it.' +
            (d.schKind === 'permanent' ? ' As it\'s a permanent change, they\'ll check it with your management first.' : ''),
        line: 'Nothing was changed tonight. The IoT team contacts the site the <b>next working day</b>.',
        OohCaptureClass
    });
}

function schedToggleEq(i) {
    const f = state.flow;
    const btn = document.querySelector('[data-testid="sched-eq-' + i + '"]');
    const name = btn ? btn.textContent : null;
    if (!name) return;
    const at = f.data.schEq.indexOf(name);
    if (at >= 0) f.data.schEq.splice(at, 1); else f.data.schEq.push(name);
    render();
}

function schedContinue() {
    const d = state.flow.data;
    if (!String(d.schTimes || '').trim() || !d.schKind) { d.schMissing = 1; render(); return; }
    doneLine('Needs: ' + esc(d.schEq.join(', ') || 'equipment not specified') + ', ' + esc(String(d.schTimes).trim()), 'customer');
    doneLine(d.schKind === 'permanent' ? 'Every week (a permanent change)' : 'Just this once', 'customer');
    flowStep({ schDone: 1 });
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
 * circuit reading ON shows Turn OFF, and vice-versa). Renders nothing when the device isn\'t
 * switchable (canSwitch false) — the flow\'s capture fallback still applies.
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
 * equipmentGroupLabel(device) -> string | null. Pure, read-only. Resolves a non-anchor gateway\'s
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
        var reason = ago ? 'last reported ' + ago : "isn\'t reporting";
        return {
            state: 'cant-confirm',
            headline: "Hot water override: can\'t confirm",
            explanation: ago
                ? "The boiler panel last reported " + ago + ", so we can\'t tell whether the hot water is overridden. Don\'t tell the customer it is on or off; pass it to the IoT team as normal."
                : "The boiler panel isn\'t reporting, so we can\'t tell whether the hot water is overridden. Don\'t tell the customer it is on or off; pass it to the IoT team as normal.",
            script: "I can\'t see the current hot water setting from here right now, so I\'ll log it for the team to check.",
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
            script: "The hot water controls haven\'t been overridden - they\'re running on the normal timetable.",
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
            script: "The hot water has already been switched on from the controls and will stay on until " + timeStr + ". If it\'s still not coming through, it\'s likely the boiler itself, so I\'ll log it for the team.",
            ticketSentence: 'Hot water override at time of call: Override ON until ' + timeStr + '.'
        };
    }
    if (effectiveMode === 'off-until') {
        var timeStr2 = _dhwFmtTime(untilMs, nowMs);
        return {
            state: 'off-until',
            headline: 'Hot water override: Override OFF until ' + timeStr2,
            explanation: "Hot water has been deliberately switched off from the boiler panel until " + timeStr2 + ". That is the likely reason there is no hot water. It goes back to its normal timetable at " + timeStr2 + ". We can\'t change it from here, so pass it to the IoT team if the customer needs it sooner.",
            script: "The hot water has been switched off on purpose at the controls until " + timeStr2 + ", then it goes back to normal. I\'ll log that you need it back sooner so the team can look at it.",
            ticketSentence: 'Hot water override at time of call: Override OFF until ' + timeStr2 + '.'
        };
    }
    if (effectiveMode === 'on-v1') {
        return {
            state: 'on-v1',
            headline: 'Hot water override: Override ON',
            explanation: "Hot water has been set to run from the boiler panel. This type of panel doesn\'t give an end time. The controls are asking for hot water, so if there is still none, the likely cause is the boiler or the cylinder.",
            script: "The hot water has been switched on from the controls. If it\'s still not coming through, it\'s likely the boiler itself, so I\'ll log it for the team.",
            ticketSentence: 'Hot water override at time of call: Override ON.'
        };
    }
    if (effectiveMode === 'off-v1') {
        return {
            state: 'off-v1',
            headline: 'Hot water override: Override OFF',
            explanation: "Hot water has been deliberately switched off on the boiler panel. That is the likely reason there is no hot water. This type of panel doesn\'t say when it ends, and we can\'t change it from here, so pass it to the IoT team.",
            script: "The hot water has been switched off on purpose at the controls. I\'ll log it so the team can switch it back on for you.",
            ticketSentence: 'Hot water override at time of call: Override OFF.'
        };
    }
    // cant-confirm: stale, implausible, not-reconfirmed, decode-error, or unknown
    var ccExplanation, ccTicket;
    if (effectiveReason === 'stale') {
        var ago2 = _dhwFmtAgo(panelLastSeenMs, nowMs);
        var reason2 = ago2 ? 'last reported ' + ago2 : "isn\'t reporting";
        ccExplanation = ago2
            ? "The boiler panel last reported " + ago2 + ", so we can\'t tell whether the hot water is overridden. Don\'t tell the customer it is on or off; pass it to the IoT team as normal."
            : "The boiler panel isn\'t reporting, so we can\'t tell whether the hot water is overridden. Don\'t tell the customer it is on or off; pass it to the IoT team as normal.";
        ccTicket = 'Hot water override at time of call: could not be confirmed (' + reason2 + ').';
    } else if (effectiveReason === 'not-reconfirmed') {
        ccExplanation = "The boiler panel hasn\'t re-confirmed its hot water override recently, so we can\'t tell whether it is still in place. Don\'t tell the customer it is on or off; pass it to the IoT team as normal.";
        ccTicket = "Hot water override at time of call: could not be confirmed (panel hasn\'t re-confirmed recently).";
    } else {
        ccExplanation = "The boiler panel\'s hot water override reading doesn\'t make sense right now, so we can\'t tell whether it is overridden. Don\'t tell the customer it is on or off; pass it to the IoT team as normal.";
        ccTicket = "Hot water override at time of call: could not be confirmed (reading doesn\'t make sense).";
    }
    return {
        state: 'cant-confirm',
        headline: "Hot water override: can\'t confirm",
        explanation: ccExplanation,
        script: "I can\'t see the current hot water setting from here right now, so I\'ll log it for the team to check.",
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
 * bpOutcomeCard(wcode, heating, nowMs, boostAvailable, activeBoostHolds) — OOHDASH-144 rebuild.
 * Returns { headline, sayHtml, gtkHtml, wrapKind, candidateZones, direction } per the new standard.
 * boostAvailable = { on: bool, off: bool }. activeBoostHolds from workspace.
 */
function bpOutcomeCard(wcode, heating, nowMs, boostAvailable, activeBoostHolds) {
    boostAvailable = boostAvailable || { on: false, off: false };
    activeBoostHolds = activeBoostHolds || [];
    var zones = (heating && heating.zones) || [];

    function panelAgo(ms) {
        if (ms === null || ms === undefined) return 'never';
        var diff = nowMs - ms;
        if (diff < 2 * 60 * 1000) return 'just now';
        if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' min ago';
        return Math.floor(diff / 3600000) + ' hours ago';
    }

    // OOHDASH-159 rev 4: the shared text-key boxes (green script, blue "For you").
    function say(text) { return sayBox(text); }

    function gtk(text) { return infoBox(text); }

    // Helper: find the earliest nextOn across a set of zone objects.
    // Only uses nextOn when dayText is 'today' or 'tomorrow' — never a named weekday.
    // This bounds the risk of a wrong day-order deduction: today/tomorrow is day-order-agnostic
    // for all-7-days zones (the whole V1 estate as of 2026-10-27 estate sweep).
    function earliestNextOn(zoneObjs) {
        var best = null;
        for (var i = 0; i < zoneObjs.length; i++) {
            var tt = zoneObjs[i].timetable;
            if (tt && tt.nextOn && (tt.nextOn.dayText === 'today' || tt.nextOn.dayText === 'tomorrow')) {
                if (!best || tt.nextOn.atMs < best.atMs) best = tt.nextOn;
            }
        }
        return best;
    }

    // Helper: timetable clause for a set of zones (", which next comes on at HH:MM")
    function nextOnClause(zoneObjs) {
        var n = earliestNextOn(zoneObjs);
        if (!n) return '';
        var day = (n.dayText && n.dayText !== 'today') ? (' ' + n.dayText) : '';
        return ', which next comes on at ' + n.timeText + day;
    }

    // Helper: "good to know" temp clause
    function tempGtk(zoneObjs) {
        var n = earliestNextOn(zoneObjs);
        if (!n || n.tempC == null) return '';
        return 'At ' + n.timeText + ' it heats the pub to ' + n.tempC + '°C, and only comes on if the room is cooler than that.';
    }

    // Helper: is this zone under an OOH hold?
    function oohHold(zoneId) {
        return activeBoostHolds.find(function(h) { return h.boilerZone === zoneId; }) || null;
    }

    // Helper: forced-until text for a zone (V2 only)
    function forcedUntilText(z) {
        if (z.forcedUntilMs && z.forcedUntilMs > nowMs) {
            var d = new Date(z.forcedUntilMs);
            return ' until ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        }
        return '';
    }

    var headline, sayHtml, gtkHtml = '', wrapKind = 'capture', candidateZones = [], direction = 'on';
    var ago = panelAgo(heating && heating.panelLastSeenMs);

    if (wcode === 'W1') {
        headline = "We can\'t see the pub heating right now";
        sayHtml = say("I can\'t see your heating controls from here at the moment, so I\'ll log it for our team to check the next working day.");
        gtkHtml = gtk('The heating controls last reported ' + esc(ago) + '. Don\'t tell the customer whether the heating is on or off.');
        wrapKind = 'capture';
    } else if (wcode === 'W2') {
        headline = "The heating controls are asking the boiler for heat";
        sayHtml = say("Our controls are asking your boiler for heat right now, so they\'re doing their job. The problem is most likely the boiler itself or the radiators, so please call your heating engineer. I\'ll log tonight\'s call.");
        gtkHtml = '';
        wrapKind = 'advice';
    } else if (wcode === 'W3') {
        var offZonesW3 = zones.filter(function(z) { return !z.on; });
        candidateZones = offZonesW3.filter(function(z) { return !oohHold(z.zone || ('CHZ' + z.n)); });
        var nextOnW3 = nextOnClause(candidateZones.length ? candidateZones : offZonesW3);
        headline = "Part of the pub heating is off";
        var canOn = boostAvailable.on && candidateZones.length > 0;
        sayHtml = say(canOn
            ? 'Part of your heating is switched off at the controls right now. I can turn it on from here for a set time, and then it goes back to its normal timetable' + nextOnW3 + ". I\'ll log it for our team to look at properly."
            : "Part of your heating is switched off at the controls. I can\'t change that from here, so I\'ll log it for our team to sort.");
        gtkHtml = gtk("If the customer says the cold area is the part that\'s already heating, it\'s more likely the boiler or radiators, so advise their heating engineer instead.");
        direction = 'on';
        wrapKind = 'capture';
    } else if (wcode === 'W4') {
        headline = "The heating is switched off for the summer";
        sayHtml = say("Your heating controls are still on their summer setting, which keeps the heating off. I can\'t change that from here, but I\'ll log it so our team can switch it back for you.");
        gtkHtml = '';
        wrapKind = 'capture';
    } else if (wcode === 'W5') {
        var forcedOffZone = zones.find(function(z) { return !z.on && z.forced === 'off'; }) || zones[0] || { n: 1, zone: 'CHZ1' };
        var foZoneId = forcedOffZone.zone || ('CHZ' + forcedOffZone.n);
        var foHold = oohHold(foZoneId);
        var fuText = forcedUntilText(forcedOffZone);
        if (foHold) {
            // This zone was turned off by OOH — different wording
            var foHoldUntil = foHold.revertAt ? new Date(foHold.revertAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
            headline = "We turned this heating off earlier";
            sayHtml = say("We turned that part of your heating off earlier" + (foHoldUntil ? ', until ' + foHoldUntil : '') + ". I can put it back to normal now, so it follows its usual timetable again.");
            gtkHtml = '';
            candidateZones = []; // no further turn-on; offer put-back only
        } else {
            headline = "Someone has switched the heating off at the controls";
            var canOnW5 = boostAvailable.on && !foHold;
            sayHtml = say(canOnW5
                ? "Part of your heating has been switched off by hand at the controls" + (fuText ? fuText : '') + ". I can turn it back on from here for a set time. I\'ll log it so our team can check why it was switched off."
                : "Part of your heating has been switched off by hand at the controls. I can\'t change it from here, but I\'ll log that you need it back on so our team can sort it.");
            gtkHtml = canOnW5 ? gtk("Someone at the pub or an engineer may have done this on purpose, so check with the customer before turning it back on.") : '';
            candidateZones = canOnW5 ? [forcedOffZone] : [];
            direction = 'on';
        }
        wrapKind = 'capture';
    } else if (wcode === 'W6') {
        var allZonesW6 = zones.length > 0 ? zones : [{ n: 1, zone: 'CHZ1' }];
        candidateZones = allZonesW6.filter(function(z) { return !oohHold(z.zone || ('CHZ' + z.n)); });
        var nextOnW6 = nextOnClause(allZonesW6);
        var canOnW6 = boostAvailable.on && candidateZones.length > 0;
        headline = "The heating is off on its timetable";
        sayHtml = say("Your heating is off on its normal timetable right now" + (nextOnW6 ? ' and is next due on' + nextOnW6.replace(', which next comes on', '') : '') + "." +
            (canOnW6 ? " I can turn it on from here for a set time if you need it. I\'ll log the call." : " I can\'t turn it on from here, so I\'ll log it for our team."));
        gtkHtml = gtk(tempGtk(allZonesW6));
        direction = 'on';
        wrapKind = 'capture';
    } else if (wcode === 'W7') {
        var fallbackZone = zones.find(function(z) { return z.fallback; }) || zones[0] || { n: 1 };
        headline = "The heating is running on a simple timer";
        sayHtml = say("Your heating is running, but on a simple timer because one of the room temperature sensors isn\'t working, so it may feel cooler than normal. I\'ll log it for our team to fix the sensor.");
        gtkHtml = '';
        wrapKind = 'capture';
    } else if (wcode === 'W8') {
        var onZonesW8 = zones.filter(function(z) { return z.on; });
        var oohOnZones = onZonesW8.filter(function(z) { return !!oohHold(z.zone || ('CHZ' + z.n)); });
        candidateZones = onZonesW8.filter(function(z) { return !oohHold(z.zone || ('CHZ' + z.n)); });
        var nextOnW8 = nextOnClause(onZonesW8);
        var canOffW8 = boostAvailable.off && candidateZones.length > 0;
        var oohAddOn = oohOnZones.map(function(z) {
            var h = oohHold(z.zone || ('CHZ' + z.n));
            var until = h && h.revertAt ? new Date(h.revertAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
            var holdDir = h && h.direction === 'off' ? 'off' : 'on';
            return 'We turned zone ' + z.n + ' ' + holdDir + ' earlier' + (until ? ', until ' + until : '') + '. I can put that back to normal now.';
        }).join(' ');
        headline = "The heating is on";
        if (canOffW8) {
            sayHtml = say("Your heating is on at the controls right now." + (oohAddOn ? ' ' + oohAddOn : '') +
                " I can turn it off from here for a set time, and then it goes back to its normal timetable" + nextOnW8 + ". I\'ll log the call.");
        } else if (oohAddOn) {
            // Every "on" zone is one we turned on: the agent can put it back, so never say "can't change it".
            sayHtml = say("Your heating is on at the controls right now. " + oohAddOn + " I\'ll log the call.");
        } else {
            sayHtml = say("Your heating is on at the controls and I can\'t change it from here tonight. Turning the radiators down will help in the meantime. I\'ll log it for our team.");
        }
        gtkHtml = '';
        direction = 'off';
        wrapKind = 'capture';
    } else if (wcode === 'W9') {
        headline = "The pub heating is already off";
        sayHtml = say("Our controls show your pub heating is off right now, so the warmth is coming from somewhere else, perhaps a radiator turned up by hand or another heater. I\'ll log the call.");
        gtkHtml = gtk('Ask whether a portable heater or the rooms upstairs have heating on.');
        wrapKind = 'no-action';
    } else {
        headline = "We can\'t see the pub heating right now";
        sayHtml = say("I can\'t see your heating controls from here at the moment, so I\'ll log it for our team to check.");
        gtkHtml = '';
        wrapKind = 'capture';
    }

    return { headline: headline, sayHtml: sayHtml, gtkHtml: gtkHtml, wrapKind: wrapKind, candidateZones: candidateZones, direction: direction };
}

/**
 * wrapUpStep — "Check and log" (§9). Shared by all pub heating outcomes.
 * Handles first-log and append-to-existing-ticket paths.
 */
// One plain-English line per action, shared by Check and log and the logged banner (§9).
function wrapActionLine(a, forTicket) {
    var timeStr = a.atMs ? new Date(a.atMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' ' : '';
    var kindLabel = {
        'turn-on': 'Turned the heating on', 'turn-off': 'Turned the heating off',
        'turn-on-failed': 'Tried to turn the heating on', 'turn-off-failed': 'Tried to turn the heating off',
        'put-back': 'Put the heating back to normal'
    }[a.kind] || 'Changed the heating';
    var zoneStr = a.zones && a.zones.length ? ', ' + a.zones.map(function(z) { return z.replace('CHZ', 'zone '); }).join(' and ') : '';
    var untilStr = a.untilMs ? ', until ' + new Date(a.untilMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    var failStr = a.result === 'failed' ? ', but the heating controls couldn\'t be reached' : '';
    var logStr = (a.ticketId && !forTicket) ? ' (logged automatically, ticket #' + a.ticketId + ')' : '';
    return timeStr + kindLabel + zoneStr + untilStr + failStr + logStr;
}

function wrapUpStep(ws, f, heating) {
    var nowMs = Date.now();
    var actions = f.data.actions || [];
    // Find any ticketId already logged in this issue
    var existingTicketId = null;
    for (var i = 0; i < actions.length; i++) {
        if (actions[i].ticketId) { existingTicketId = actions[i].ticketId; break; }
    }

    if (f.data['_wrap_done']) {
        // Already submitted — show the green banner + out buttons
        var tkt = f.data['_wrap_ticket'];
        var bannerText = 'Ticket ' + tktLink(tkt) + ' is with the IoT helpdesk. They pick it up the next working day.';
        var actionLines = (actions.length ? actions.map(function(a) {
            return '• ' + esc(wrapActionLine(a));
        }) : ['• Nothing changed']).join('\n');
        if (f.data.additionalNotes) actionLines += '\n• Your notes: ' + esc(f.data.additionalNotes);
        if (!f.data._wrapReg) { registerIssue(esc(f.data._wrapSubject || 'Pub heating'), 'violet', tkt); f.data._wrapReg = 1; }
        f.stage = 99;
        return afterCard('wrap-logged', actions.length ? 'Heating change saved to the ticket' : 'Ticket created for the IoT helpdesk', tkt,
            '<p class="after-line">' + bannerText + '</p><div class="small" style="white-space:pre-line">' + actionLines + '</div>') + notesPostBox(tkt) + outButtons();
    }

    if (f.data['_wrap_err']) {
        // §9.2: append-refused and hold-not-found are not transient — offer a new-ticket button
        // instead of "Try again" (which would just fail again). The earlier ticket ID is shown
        // as evidence so the agent knows what they were trying to add to.
        var errCode = f.data['_wrap_err_code'] || '';
        var isAppendFail = (errCode === 'append-refused' || errCode === 'hold-not-found');
        var errTicket = f.data['_wrap_err_ticket'];
        var evidenceHtml = (isAppendFail && errTicket)
            ? '<div class="small" style="margin-top:4px">Earlier ticket: #' + esc(String(errTicket)) + '</div>'
            : '';
        var actionBtn = isAppendFail
            ? '<button class="btn primary" data-testid="wrap-new-ticket" onclick="wrapUpForceNew()" style="margin-top:8px">Save it as a new ticket</button>'
            : '<button class="btn" onclick="state.flow.data[\'_wrap_err\']=null;state.flow.data[\'_wrap_pend\']=null;render()">Try again</button>';
        return '<div class="alert err" data-testid="wrap-error">' + esc(f.data['_wrap_err']) + evidenceHtml + ' ' + actionBtn + '</div>';
    }

    if (f.data['_wrap_pend']) {
        return '<div class="alert info" data-testid="saving-record">Saving to the call record…</div>';
    }
    // OOHDASH-159 rev 5 (E1): no "Check and log" step. The summary is saved automatically; the recap shows after.
    Promise.resolve().then(wrapUpSubmit);
    return '<div class="alert info" data-testid="saving-record">Saving to the call record…</div>';
}

// rev 4 "Check and log" layout, kept only for reference by the old tests; never rendered in rev 5.
function _wrapUpLegacyLayout(ws, f, heating, actions, existingTicketId) {

    // Build the sections
    var wrapTitle = f.data.wrapKind === 'no-action' ? 'Check and log' : 'Check and log';
    var whatSaid = f.data.freeText ? esc(f.data.freeText) : '<span class="small" style="color:var(--text-secondary)">Nothing recorded</span>';
    var whatFound = esc(f.data._wrapHeadline || (heating && heating.zones && heating.zones.length ? 'Heating checked' : 'Pub heating checked'));
    var whatDidLines = actions.length ? actions.map(function(a) {
        return '<li>' + esc(wrapActionLine(a)) + '</li>';
    }).join('') : '<li>Nothing changed</li>';
    var whatLog = esc(f.data._wrapLogSentence || 'Pub heating call logged for the IoT helpdesk.');
    var btnLabel = existingTicketId
        ? 'Add to ticket #' + existingTicketId + ' and finish'
        : 'Log for the IoT helpdesk and finish';

    var html = '<div class="wrapup" data-testid="wrap-up">' +
        '<h3>Check and log</h3>' +
        '<div class="wu-section"><strong>What the customer said</strong>' + whatSaid + '</div>' +
        '<div class="wu-section"><strong>What we found</strong>' + whatFound + '</div>' +
        '<div class="wu-section"><strong>What we did</strong><ul class="wu-actions">' + whatDidLines + '</ul></div>' +
        ticketBox(f.data._wrapSubject || 'Pub heating', f.data._wrapLogSentence || 'Pub heating call logged for the IoT helpdesk.', 'wrap-ticket-box') +
        warnBox(existingTicketId ? 'this adds to ticket #' + dyn(existingTicketId) + ' for the IoT helpdesk.' : 'this logs a ticket for the IoT helpdesk.', 'wrap-warning') +
        '<div class="outbtns" style="margin-top:6px">' +
        '<button class="btn primary" data-testid="wrap-submit" onclick="wrapUpSubmit()">' + btnLabel + '</button>' +
        '</div></div>';

    return html;
}

// Called when the agent clicks the submit button in Check and log.
function wrapUpSubmit() {
    if (!state.flow || !state.flow.data) return;
    var f = state.flow;
    if (f.data['_wrap_pend']) return; // prevent double-click
    var ws = state.workspace;
    var actions = f.data.actions || [];
    var existingTicketId = null;
    for (var i = 0; i < actions.length; i++) {
        if (actions[i].ticketId) { existingTicketId = actions[i].ticketId; break; }
    }
    f.data['_wrap_pend'] = true;
    render();

    var actionLines = actions.map(function(a) { return wrapActionLine(a, true); });

    // Find hold ids from actions
    var holdIds = [];
    for (var j = 0; j < actions.length; j++) {
        if (actions[j].holdIds) holdIds = holdIds.concat(actions[j].holdIds);
    }
    // Find the first hold with a ticket for the append path
    var appendToHoldId = null;
    for (var k = 0; k < actions.length; k++) {
        if (actions[k].ticketId && actions[k].holdIds && actions[k].holdIds.length) {
            appendToHoldId = actions[k].holdIds[0];
            break;
        }
    }

    var subject = f.data._wrapSubject || 'Pub heating';
    var detail = f.data._wrapHeadline || subject;
    var logSentence = f.data._wrapLogSentence || detail;

    // §9.2: if the agent is re-submitting after append-refused, bypass the append path.
    var forceNew = !!f.data['_wrap_force_new'];

    var body = {
        type: f.data.wrapKind === 'no-action' ? 'no-action' : 'capture',
        siteNo: ws.site.siteNo,
        siteName: ws.site.siteName,
        subject: subject,
        detail: logSentence,
        callerWords: f.data.freeText || null,
        knownSoFar: knownSoFarLines(f), // OOHDASH-159 rev 4
        ...callFields(), // rev 5 (E1)
        customerContact: callerContactFrom(state.caller), // OOHDASH-146 B10
        additionalNotes: f.data.additionalNotes || null,
        OohCaptureClass: 'boiler-panel-heating',
        actions: actionLines,
        holdIds: holdIds,
        // Cite the earlier ticket when re-submitting after append-refused (§9.2 Related: #N).
        relatedToTicketId: forceNew ? (f.data['_wrap_related_ticket'] || null) : null
    };
    if (appendToHoldId && existingTicketId && !forceNew) {
        body.appendToHoldId = appendToHoldId;
        body.confirmToken = state.confirmToken;
    }

    api.post('/api/outcomes', body).then(function(res) {
        var tkt = (res.ticket && res.ticket.id) ? res.ticket.id : (res.ticketId || '?');
        f.data['_wrap_pend'] = null;
        f.data['_wrap_done'] = true;
        f.data['_wrap_ticket'] = tkt;
        f.data['_wrap_subject'] = subject;
        f.data['_wrap_force_new'] = null;
        f.data['_wrap_related_ticket'] = null;
        // Refresh workspace so banner clears if we put something back
        refreshWorkspace().catch(function() {});
        render();
    }).catch(function(err) {
        f.data['_wrap_pend'] = null;
        // Map raw error codes to plain English (design section 12 glossary).
        // Never show raw codes on screen.
        var rawCode = err.message || 'unknown error';
        var mappedMsg = rawCode;
        if (rawCode === 'append-refused') mappedMsg = "Couldn't add to the existing ticket. Use the button below to log as a new ticket instead.";
        else if (rawCode === 'expired-token') mappedMsg = "The site confirmation has expired. Re-confirm the site and try again.";
        else if (rawCode === 'site-mismatch') mappedMsg = "The confirmed site doesn't match this heating change. Confirm the site again and try again.";
        else if (rawCode === 'hold-not-found') mappedMsg = "Couldn't find the earlier heating change. Use the button below to log as a new ticket instead.";
        // Store the raw code so wrapUpStep can pick the right recovery action (§9.2).
        f.data['_wrap_err_code'] = rawCode;
        // Store the ticket we were trying to append to — shown as evidence and used as Related: #N.
        if (rawCode === 'append-refused' || rawCode === 'hold-not-found') {
            f.data['_wrap_err_ticket'] = existingTicketId;
        }
        f.data['_wrap_err'] = mappedMsg;
        render();
    });
}

/**
 * wrapUpForceNew — §9.2 fallback when append-refused / hold-not-found.
 * Clears the error state and re-submits as a brand-new ticket, passing the
 * earlier ticket id so the server can cite "Related: #N" in the first comment.
 */
function wrapUpForceNew() {
    if (!state.flow || !state.flow.data) return;
    var f = state.flow;
    var relatedTicket = f.data['_wrap_err_ticket'] || null;
    // Clear error flags
    f.data['_wrap_err'] = null;
    f.data['_wrap_err_code'] = null;
    f.data['_wrap_err_ticket'] = null;
    // Signal that this submit must bypass the append path and cite the earlier ticket
    f.data['_wrap_force_new'] = true;
    f.data['_wrap_related_ticket'] = relatedTicket;
    wrapUpSubmit();
}

/**
 * boilerPanelHeatingBranch(ws, f, panelDevice, site) — OOHDASH-144 rebuild.
 * Handles the entire pub heating flow (W-codes, zone picker, boost, check-and-log).
 */
function boilerPanelHeatingBranch(ws, f, panelDevice, site) {
    var heating = ws.boilerControl && ws.boilerControl.heating ? ws.boilerControl.heating : null;
    var nowMs = Date.now();
    var boostAvailable = ws.boostAvailable || { on: false, off: false };
    var activeBoostHolds = ws.activeBoostHolds || [];

    function panelAgo(ms) {
        if (ms === null || ms === undefined) return 'never';
        var diff = nowMs - ms;
        if (diff < 2 * 60 * 1000) return 'just now';
        if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' min ago';
        return Math.floor(diff / 3600000) + ' hours ago';
    }

    function fmtTemp(v) {
        if (typeof v !== 'number' || !isFinite(v) || v < -30 || v > 110) return null;
        return v.toFixed(1) + '°C';
    }

    function fmtTime(ms) {
        return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    // Build readout line (§8.1a)
    function buildReadout() {
        if (!heating || !heating.visible) {
            return '<div class="zoneread"><span class="small">Pub heating controls — no reading</span></div>';
        }
        var zones = heating.zones || [];
        var zoneParts = zones.map(function(z) {
            var stateHtml = z.on === true ? '<b class="ok">on</b>' : (z.on === false ? '<b class="warn">off</b>' : '—');
            return 'Zone ' + z.n + ' ' + stateHtml;
        }).join(' · ');
        var temps = zones.map(function(z) { return fmtTemp(z.roomTemp); }).filter(Boolean).join(' / ');
        var ago = panelAgo(heating.panelLastSeenMs);
        var readoutText = (zoneParts || 'no zones') +
            (temps ? ' · Room ' + temps : '') +
            ' · Heating controls last reported ' + ago;
        return '<div class="zoneread"><span class="small">' + readoutText + '</span></div>';
    }

    var readout = buildReadout();
    var need = f.data.need;

    // Check and log step (§9)
    // OOHDASH-146 B24: gate with riskQuestion when no heating actions were taken this call.
    if (need === 'bp-wrap') {
        if ((f.data.actions || []).length === 0) {
            return riskQuestion(f, {
                yes: () => outcomeP1(f, 'bp-p1', {
                    subject: 'Pub heating — risk to trade or health and safety — P1',
                    detail: 'Customer raised a pub heating issue; no heating changes were made from the dashboard this call. Customer indicated immediate risk to trade or health and safety.',
                    pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                    script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                }),
                no: () => wrapUpStep(ws, f, heating)
            });
        }
        return wrapUpStep(ws, f, heating);
    }

    // INTERCEPT: active holds running at this site (§8.3)
    if (f.stage === 1 && activeBoostHolds.length > 0 && !f.data._holdInterceptDismissed) {
        doneLine('Area: <b>Bar/Restaurant</b>', 'customer');
        var zones0 = (heating && heating.zones) || [];
        var holdRows = activeBoostHolds.map(function(h) {
            var dir = h.direction === 'on' ? 'on' : 'off';
            var until = h.revertAt ? fmtTime(new Date(h.revertAt)) : '';
            var who = h.createdBy ? h.createdBy.split(' ')[0] : 'someone';
            var emoji = dir === 'on' ? '🔥' : '❄';
            var tt = zones0.find(function(z) { return z.zone === h.boilerZone; });
            var nextOnClause = '';
            if (tt && tt.timetable && tt.timetable.nextOn && (tt.timetable.nextOn.dayText === 'today' || tt.timetable.nextOn.dayText === 'tomorrow') && !(h.revertAt && tt.timetable.nextOn.atMs <= new Date(h.revertAt).getTime())) {
                var n = tt.timetable.nextOn;
                var dayPfx = (n.dayText && n.dayText !== 'today') ? (' ' + n.dayText) : '';
                nextOnClause = ', which next comes on at ' + n.timeText + dayPfx;
            }
            var zNum = h.boilerZone === 'CHZ2' ? '2' : '1';
            var sayText = dir === 'on'
                ? "We\'ve already turned your heating on until " + until + ". After that it goes back to its normal timetable" + nextOnClause + "."
                : "We\'ve already turned your heating off until " + until + ". After that it goes back to its normal timetable" + nextOnClause + ".";
            return '<div style="margin:6px 0">' + emoji + ' <b>Zone ' + zNum + ': heating turned ' + dir + (until ? ' until ' + until : '') + ', by ' + esc(who) + '</b>' +
                ' <button class="btn" data-testid="hb-cancel-' + h.id + '" onclick="holdBannerCancel(\'' + h.id + '\')">Put back to normal now</button></div>';
        }).join('');
        var firstHold = activeBoostHolds[0];
        var firstDir = firstHold.direction === 'on' ? 'on' : 'off';
        var firstUntil = firstHold.revertAt ? fmtTime(new Date(firstHold.revertAt)) : '';
        var firstTT = zones0.find(function(z) { return z.zone === firstHold.boilerZone; });
        var firstNextOn = '';
        if (firstTT && firstTT.timetable && firstTT.timetable.nextOn && (firstTT.timetable.nextOn.dayText === 'today' || firstTT.timetable.nextOn.dayText === 'tomorrow') && !(firstHold.revertAt && firstTT.timetable.nextOn.atMs <= new Date(firstHold.revertAt).getTime())) {
            var fn = firstTT.timetable.nextOn;
            firstNextOn = ', which next comes on at ' + fn.timeText + ((fn.dayText && fn.dayText !== 'today') ? ' ' + fn.dayText : '');
        }
        var interceptSay = firstDir === 'on'
            ? "We\'ve already turned your heating on until " + firstUntil + ". After that it goes back to its normal timetable" + firstNextOn + "."
            : "We\'ve already turned your heating off until " + firstUntil + ". After that it goes back to its normal timetable" + firstNextOn + ".";
        return readout + '<div class="reco" data-testid="reco-boost-hold">' +
            '<b class="hd">We\'ve already changed the heating here</b>' + holdRows +
            sayBox(esc(interceptSay)) +
            '<div class="outbtns">' +
            '<button class="btn" data-testid="bp-hold-continue" onclick="flowStep({need:\'bp-hold-continue\'})">The customer needs something else</button>' +
            // §10.2: once something has been changed in this issue, never offer "No further action".
            (f.data.actions && f.data.actions.length
                ? '<button class="btn primary" data-testid="bp-finish-notes" onclick="flowStep({need:\'bp-wrap\'})">Finish this issue</button>'
                : '<button class="btn" data-testid="bp-hold-noact" onclick="flowStep({need:\'bp-wrap\',wrapKind:\'no-action\'})">No further action</button>') +
            '</div></div>';
    }

    if (need === 'bp-hold-continue') {
        f.data._holdInterceptDismissed = true;
        f.stage = 1;
        f.data.need = null;
        return boilerPanelHeatingBranch(ws, f, panelDevice, site);
    }

    // Stage 1: ask what the customer needs
    if (f.stage === 1) {
        // The hold intercept already showed the Area line; don't repeat it after "The customer needs something else".
        if (!f.data._holdInterceptDismissed) doneLine('Area: <b>Bar/Restaurant</b>', 'customer');
        return readout +
            sayBox('', 'what do you need?') +
            answers('<button class="chip" data-testid="need-cold" onclick="flowStep({need:\'cold\'})">Too cold / not working</button>' +
            '<button class="chip" data-testid="need-hot" onclick="flowStep({need:\'hot\'})">Too hot / wants it off</button>');
    }

    // Zone picker (§8.4)
    if (need === 'bp-zones') {
        var bzDir = f.data.direction || 'on';
        // Re-derive candidates fresh (avoids embedding large JSON in onclick handlers)
        var bzCard0 = bpOutcomeCard(f.data.bpWcode || 'W6', heating, nowMs, boostAvailable, activeBoostHolds);
        var bzCandidates = bzCard0.candidateZones || [];
        var bzDirLabel = bzDir === 'on' ? 'turn on all of them' : 'turn off all of them';
        var bzChips = bzCandidates.map(function(z) {
            var zId = z.zone || ('CHZ' + z.n);
            var zLabel = 'Zone ' + z.n + ' only';
            return '<button class="chip" role="button" aria-pressed="false" data-testid="bp-zone-' + zId + '" ' +
                'onclick="bpZoneSelect(\'' + zId + '\')" id="bpzc-' + zId + '">' + zLabel + '</button>';
        }).join('');
        bzChips += '<button class="chip" role="button" aria-pressed="false" data-testid="bp-zone-all" id="bpzc-all" onclick="bpZoneSelect(\'all\')">All zones (not sure)</button>';
        var bpCancelDir2 = f.data.bpCallDir || 'cold';
        return '<div class="reco" data-testid="reco-bp-zones">' +
            '<b class="hd">Which part of the pub?</b>' +
            sayBox("Your heating is split into sections, called zones, which were set up with the original pipework. Our system can\'t see which rooms each zone covers.",
                "do you know which part of the pub each one heats? If you\'re not sure, I\'ll " + esc(bzDirLabel) + '.') +
            answers(bzChips, 'bp-zone-answers') +
            '<div class="outbtns" style="margin-top:10px">' +
            '<button class="btn primary" id="bpz-continue" disabled data-testid="bp-zones-continue" onclick="bpZoneContinue()">Continue</button>' +
            '<button class="btn" onclick="flowStep({need:\'' + bpCancelDir2 + '\'})">Back</button>' +
            '</div></div>';
    }

    // Boost duration picker (§8.5)
    if (need === 'bp-boost') {
        var bpDir = f.data.direction || 'on';
        var bpZones = f.data.zones || [f.data.zone || 'CHZ1'];
        var bpZLabel = bpZones.length > 1 ? 'All zones' : (bpZones[0] === 'CHZ2' ? 'Zone 2' : 'Zone 1');
        var bpDirLabel = bpDir === 'on' ? 'Turn the heating on' : 'Turn the heating off';
        // Compute until-next-on from zone timetables
        var heatingZones0 = (heating && heating.zones) || [];
        var earliestNextOnMs = null;
        var earliestNextOnTime = null;
        var earliestNextOnDay = null;
        var earliestNextOnTemp = null;
        for (var bi = 0; bi < bpZones.length; bi++) {
            var zData = heatingZones0.find(function(z) { return z.zone === bpZones[bi]; });
            if (zData && zData.timetable && zData.timetable.nextOn && (zData.timetable.nextOn.dayText === 'today' || zData.timetable.nextOn.dayText === 'tomorrow')) {
                var n2 = zData.timetable.nextOn;
                if (earliestNextOnMs === null || n2.atMs < earliestNextOnMs) {
                    earliestNextOnMs = n2.atMs;
                    earliestNextOnTime = n2.timeText;
                    earliestNextOnDay = n2.dayText;
                    earliestNextOnTemp = n2.tempC;
                }
            }
        }
        var untilNextOnOk = earliestNextOnMs !== null &&
            (earliestNextOnMs - nowMs) >= 15 * 60 * 1000 &&
            (earliestNextOnMs - nowMs) <= 11 * 60 * 60 * 1000;
        var bpDurations;
        if (bpDir === 'on') {
            bpDurations = [{ key: '30', label: '30 minutes' }, { key: '60', label: '1 hour' }, { key: '120', label: '2 hours' }];
        } else {
            bpDurations = [{ key: '60', label: '1 hour' }, { key: '120', label: '2 hours' }];
            if (untilNextOnOk) {
                var dayPart = (earliestNextOnDay && earliestNextOnDay !== 'today') ? (earliestNextOnDay + ' ') : '';
                bpDurations.push({ key: 'until-next-on', label: 'Until ' + earliestNextOnTime + ', when it\'s next due on' });
            } else {
                bpDurations.push({ key: 'until-0700', label: 'Until 07:00' });
            }
        }
        var bpDurBtns = bpDurations.map(function(d) {
            return '<button class="chip" data-testid="bp-dur-' + d.key + '" onclick="flowStep({need:\'bp-boost-send\',durationKey:\'' + d.key + '\'})">' + esc(d.label) + '</button>';
        }).join('');
        // Build Say block
        var bpNextOnClause = '';
        if (earliestNextOnMs !== null && earliestNextOnDay) {
            var dayPfx2 = (earliestNextOnDay && earliestNextOnDay !== 'today') ? (' ' + earliestNextOnDay) : '';
            bpNextOnClause = ', which next comes on at ' + earliestNextOnTime + dayPfx2;
        }
        var bpSayText = bpDir === 'on'
            ? "I\'ll turn it on now. After that it goes back to its normal timetable" + bpNextOnClause + "."
            : '';
        var bpGtkText = (bpDir === 'off' && untilNextOnOk && earliestNextOnTemp != null)
            ? 'At ' + earliestNextOnTime + ' it heats the pub to ' + earliestNextOnTemp + '°C if the room is cooler than that.'
            : '';
        var bpCancelDir3 = f.data.bpCallDir || 'cold';
        return '<div class="reco" data-testid="reco-boost-dur">' +
            '<b class="hd">' + esc(bpDirLabel) + ': how long?</b>' +
            (bpSayText ? sayBox(esc(bpSayText)) : '') +
            infoBox(bpGtkText ? esc(bpGtkText) : '') +
            warnBox('this turns the heating ' + (bpDir === 'on' ? 'on' : 'off') + ' at the site straight away.', 'bp-dur-warning') +
            '<div class="chips" style="margin-top:6px">' + bpDurBtns + '</div>' +
            '<div style="margin-top:10px"><button class="btn" onclick="flowStep({need:\'' + bpCancelDir3 + '\'})">Back</button></div>' +
            '</div>';
    }

    // Boost send + result (§10.3)
    if (need === 'bp-boost-send') {
        var bsDir = f.data.direction || 'on';
        var bsZones = f.data.zones || [f.data.zone || 'CHZ1'];
        var bsDurKey = f.data.durationKey || '60';
        var bsKey = 'boost-' + bsDir + '-' + bsZones.join(',');

        if (f.data['_out_' + bsKey]) return f.data['_out_' + bsKey];

        if (f.data['_err_' + bsKey]) {
            var bsErrMsg = f.data['_err_' + bsKey];
            return '<div class="alert err">Couldn\'t change the heating: ' + esc(bsErrMsg) +
                ' <button class="chip" onclick="state.flow.data[\'_err_' + bsKey + '\']=null;state.flow.data[\'_pend_' + bsKey + '\']=null;render()">Try again</button>' +
                ' <button class="chip" onclick="flowStep({need:\'bp-wrap\',wrapKind:\'capture\'})">Pass it to the IoT helpdesk</button></div>';
        }

        if (f.data['_pend_' + bsKey]) {
            return '<div class="alert info">Sending…</div>';
        }

        // Warning: zone already has an active override — ask to acknowledge
        if (f.data['_warn_' + bsKey]) {
            var bsWarns = f.data['_warn_' + bsKey];
            var bsWarnList = bsWarns.map(function(w) { return '<li>' + esc(w.message || String(w)) + '</li>'; }).join('');
            return '<div class="alert warn"><b>Someone has already changed this at the heating controls</b><ul style="margin:6px 0 0 16px">' + bsWarnList + '</ul>' +
                '<div style="margin-top:10px">' +
                '<button class="chip" data-testid="bp-boost-ack" onclick="state.flow.data[\'_warn_' + bsKey + '\']=null;state.flow.data.acknowledgedWarnings=true;render()">Change it anyway</button>' +
                ' <button class="chip" onclick="flowStep({need:\'bp-wrap\',wrapKind:\'capture\'})">Pass it to the IoT helpdesk instead</button>' +
                '</div></div>';
        }

        // Fire the boost request
        f.data['_pend_' + bsKey] = 1;
        render();
        // Find if we already have a ticket from a prior action in this issue
        var priorActions = f.data.actions || [];
        var priorTicketHoldId = null;
        for (var pai = 0; pai < priorActions.length; pai++) {
            if (priorActions[pai].ticketId && priorActions[pai].holdIds && priorActions[pai].holdIds.length) {
                priorTicketHoldId = priorActions[pai].holdIds[0];
                break;
            }
        }
        var bsBody = {
            siteNo: ws.site.siteNo,
            confirmToken: state.confirmToken,
            deviceId: panelDevice.deviceId,
            zones: bsZones,
            direction: bsDir,
            durationKey: bsDurKey,
            callerWords: f.data.freeText || null
        };
        if (f.data.acknowledgedWarnings) bsBody.acknowledgedWarnings = true;
        if (priorTicketHoldId) bsBody.appendToHoldId = priorTicketHoldId;
        api.post('/api/boiler-boost', bsBody).then(function(res) {
            f.data['_pend_' + bsKey] = null;
            if (res.warnings) {
                f.data['_warn_' + bsKey] = res.warnings;
                render();
                return;
            }
            var act = res.action || {};
            var bsDirLabel2 = bsDir === 'on' ? 'Heating turned on' : 'Heating turned off';
            var bsResultRows = '';
            // The server reports each zone as { zone, outcome }; read `outcome` (older payloads used `state`).
            // Server contract (services/control.js dispatchBoilerBoost): action.zones[] = { zone, outcome, dispatchError, panelVersion },
            // outcome ∈ CONFIRMED | IN-FLIGHT-TIMEOUT | NON-DELIVERY. Anything else is treated as failed (fail closed).
            var allZoneOutcomes = (act.zones || []).map(function(zo) {
                var st = zo.outcome;
                if (st !== 'CONFIRMED' && st !== 'IN-FLIGHT-TIMEOUT') st = 'NON-DELIVERY';
                return { zone: zo.zone, state: st };
            });
            if (allZoneOutcomes.length === 0 && bsZones.length > 0) {
                // No per-zone results: never claim success; show it as sent but not confirmed.
                allZoneOutcomes = bsZones.map(function(z) { return { zone: z, state: 'IN-FLIGHT-TIMEOUT' }; });
            }
            var confirmedZones = allZoneOutcomes.filter(function(zo) { return zo.state === 'CONFIRMED'; }).map(function(zo) { return zo.zone; });
            var okZones = allZoneOutcomes.filter(function(zo) { return zo.state !== 'NON-DELIVERY'; }).map(function(zo) { return zo.zone; });
            var failedZones = allZoneOutcomes.filter(function(zo) { return zo.state === 'NON-DELIVERY'; }).map(function(zo) { return zo.zone; });
            var zoneWords = function(zs) { return zs.map(function(z) { return z.replace('CHZ', 'zone '); }).join(' and '); };
            if (okZones.length === 0) bsDirLabel2 = 'We couldn\'t change the heating';
            allZoneOutcomes.forEach(function(zo) {
                var zNum = zo.zone === 'CHZ2' ? '2' : '1';
                var untilMs = act.revertAtMs;
                var untilStr = untilMs ? fmtTime(untilMs) : '';
                var fallbackNote = act.fallback === 'until-0700' ? ' (until 07:00, because the timetable couldn\'t be read)' : '';
                var tktId = act.ticketId;
                var row = '';
                if (zo.state === 'CONFIRMED') {
                    row = '✅ Zone ' + zNum + ': ' + (bsDir === 'on' ? 'on' : 'off') + (untilStr ? ' until ' + untilStr : '') + esc(fallbackNote) +
                        (act.clamped ? ' (stopped at 01:00, the latest allowed)' : '');
                } else if (zo.state === 'IN-FLIGHT-TIMEOUT') {
                    row = '⏳ Zone ' + zNum + ': sent, but the heating controls haven\'t confirmed yet. It will still go back to normal at ' + untilStr + '. If the heating doesn\'t come ' + (bsDir === 'on' ? 'on' : 'off') + ', the IoT helpdesk will see it' + (tktId ? ' on ticket #' + tktId : '') + '.';
                } else {
                    row = '❌ Zone ' + zNum + ': we couldn\'t reach the heating controls, so it wasn\'t turned ' + bsDir + '.';
                }
                bsResultRows += '<div data-testid="boost-zone-result-' + zo.zone + '">' + esc(row) + '</div>';
            });
            // nextOn clause for the Say block
            var heatingZones1 = (heating && heating.zones) || [];
            var bsNextOnClause = '';
            for (var bni = 0; bni < bsZones.length; bni++) {
                var zData2 = heatingZones1.find(function(z) { return z.zone === bsZones[bni]; });
                if (zData2 && zData2.timetable && zData2.timetable.nextOn && (zData2.timetable.nextOn.dayText === 'today' || zData2.timetable.nextOn.dayText === 'tomorrow') && !(act.revertAtMs && zData2.timetable.nextOn.atMs <= act.revertAtMs)) {
                    var nn = zData2.timetable.nextOn;
                    var dayPfx3 = (nn.dayText && nn.dayText !== 'today') ? (' ' + nn.dayText) : '';
                    bsNextOnClause = ', which next comes on at ' + nn.timeText + dayPfx3;
                    break;
                }
            }
            var bsUntilStr = act.revertAtMs ? fmtTime(act.revertAtMs) : '';
            // Autolog box
            var tkt2 = act.ticketId;
            // Only say "I've logged" when the automatic ticket really exists; otherwise it is logged at Check and log.
            var loggedVerb = tkt2 ? "I\'ve logged" : "I\'ll log";
            var bsSayText;
            var dirWord = bsDir === 'on' ? 'on' : 'off';
            if (okZones.length === 0) {
                // Nothing reached the heating controls: never tell the customer it's done (§10.3).
                bsSayText = "I\'m sorry, I couldn\'t change your heating from here. " + loggedVerb + " it for our team to sort out.";
            } else {
                // "That's done" only for zones the controls confirmed; sent-but-unconfirmed zones get "I've asked".
                var lead;
                if (confirmedZones.length === okZones.length) {
                    lead = failedZones.length ? "That\'s done for " + zoneWords(okZones) + ". It" : "That\'s done. Your heating";
                } else {
                    lead = "I\'ve asked your heating controls to turn " + (failedZones.length ? zoneWords(okZones) + ' ' : 'it ') + dirWord + ". It";
                }
                bsSayText = lead + " will be " + dirWord + " until " + bsUntilStr + ", and then it goes back to its normal timetable" + bsNextOnClause + ".";
                // Partial failure: name the zones that didn't change (§10.3 "I've logged the rest").
                if (failedZones.length) bsSayText += " I couldn\'t change " + zoneWords(failedZones) + ", so " + loggedVerb + " that for our team.";
            }
            var autologHtml = '';
            if (tkt2) {
                // §9.3: a zone that didn't respond gets the "didn't respond" wording, not "because we changed it".
                autologHtml = failedZones.length
                    ? '<div class="autolog" data-testid="autolog-box">📋 We\'ve logged this automatically to the IoT helpdesk as ticket ' + tktLink(tkt2) + '. The heating controls didn\'t respond, so there may be a problem with the equipment or its internet connection.</div>'
                    : '<div class="autolog" data-testid="autolog-box">📋 We\'ve logged this automatically to the IoT helpdesk as ticket ' + tktLink(tkt2) + ', because we changed the heating at the pub. You can add notes before you finish.</div>';
            } else {
                autologHtml = '<div class="autolog" data-testid="autolog-box">We couldn\'t save this to a ticket yet. It is saved when you finish this issue.</div>';
            }
            // Record action for Check and log
            var holdIds2 = (act.overrideIds || []).map(function(o) { return o.overrideId; });
            f.data.actions = f.data.actions || [];
            if (okZones.length) {
                f.data.actions.push({ kind: bsDir === 'on' ? 'turn-on' : 'turn-off', zones: okZones, untilMs: act.revertAtMs || null, result: 'ok', holdIds: holdIds2, ticketId: tkt2 || null, atMs: Date.now() });
            }
            if (failedZones.length) {
                f.data.actions.push({ kind: bsDir === 'on' ? 'turn-on-failed' : 'turn-off-failed', zones: failedZones, untilMs: null, result: 'failed', holdIds: [], ticketId: tkt2 || null, atMs: Date.now() });
            }
            // Set wrap context
            f.data._wrapSubject = bsDirLabel2;
            // "What we found" stays the card headline (§9.1); only fall back to the action if no card set one.
            if (!f.data._wrapHeadline) f.data._wrapHeadline = bsDirLabel2 + ' — ' + zoneWords(bsZones);
            var logParts = [];
            if (okZones.length) logParts.push((bsDir === 'on' ? 'turned on' : 'turned off') + ', ' + zoneWords(okZones) + (bsUntilStr ? ', until ' + bsUntilStr : ''));
            if (failedZones.length) logParts.push('tried to turn ' + bsDir + ' ' + zoneWords(failedZones) + ' but the heating controls could not be reached');
            f.data._wrapLogSentence = 'Pub heating at time of call: ' + logParts.join('; ') + '.';
            f.data.wrapKind = 'action';
            // Green only when every zone is confirmed; a failed, partial or unconfirmed change uses the neutral logged style.
            // OOHDASH-159 rev 4: the neutral after-action card when something changed; a red failure box when nothing did.
            var bsCardHtml = okZones.length
                ? afterCard('outcome-boost', esc(bsDirLabel2), tkt2 || null,
                    '<div style="margin:0 0 6px">' + bsResultRows + '</div>', esc(bsSayText), autologHtml)
                : '<div class="alert err" data-testid="outcome-boost"><b>' + esc(bsDirLabel2) + '</b>' +
                    '<div style="margin:6px 0">' + bsResultRows + '</div></div>' + sayBox(esc(bsSayText)) + autologHtml;
            f.data['_out_' + bsKey] = bsCardHtml +
                '<div class="outbtns"><button class="btn primary" data-testid="bp-finish-notes" onclick="flowStep({need:\'bp-wrap\'})">Finish this issue</button></div>';
            f.data._outcomeHtml = bsCardHtml;
            // C2 fix: the boost consumed the original confirmToken; the server returns a
            // fresh one so wrapUpSubmit's append check (hasSiteConfirmation) finds a valid
            // confirmation for this session. Store it immediately.
            if (res.confirmToken) state.confirmToken = res.confirmToken;
            refreshWorkspace().catch(function() {});
            render();
        }).catch(function(err) {
            f.data['_pend_' + bsKey] = null;
            f.data['_err_' + bsKey] = err.message;
            render();
        });
        return '<div class="alert info">Sending to the heating controls…</div>';
    }

    // Stage 2: show outcome card (§8.2)
    if (need === 'cold' || need === 'hot') {
        var wcode = boilerHeatingOutcome(heating, need, nowMs);
        f.data.bpWcode = wcode;
        f.data.bpCallDir = need;
        var card = bpOutcomeCard(wcode, heating, nowMs, boostAvailable, activeBoostHolds);
        doneLine('The customer says: ' + (need === 'cold' ? 'too cold or not working' : 'too hot or wants it off'), 'customer');
        // Set wrap context from the card
        f.data._wrapSubject = card.headline;
        f.data._wrapHeadline = card.headline;
        f.data.wrapKind = card.wrapKind;
        // Build ticket/log sentence from wcode
        var bpLogSegs = [];
        if (wcode === 'W1') bpLogSegs.push('Heating could not be checked (heating controls last updated ' + panelAgo(heating && heating.panelLastSeenMs) + ').');
        else if (wcode === 'W2') bpLogSegs.push('All zones on, heating calling. Likely a boiler or radiator fault; site advised to call their heating engineer.');
        else if (wcode === 'W3') { var offZ3 = (heating && heating.zones || []).filter(function(z) { return !z.on; }).map(function(z) { return 'zone ' + z.n; }).join(' and '); bpLogSegs.push('Part of pub heating off (' + (offZ3 || 'zone 2') + ').' ); }
        else if (wcode === 'W4') bpLogSegs.push('Heating on its summer setting (off season).');
        else if (wcode === 'W5') bpLogSegs.push('Heating switched off by hand.');
        else if (wcode === 'W6') { var nc6 = heating && heating.nextChange; bpLogSegs.push('Heating off on timetable' + (nc6 ? ', next change at ' + nc6 : '') + '.'); }
        else if (wcode === 'W7') bpLogSegs.push('Heating running on a simple timer (room sensor not working).');
        else if (wcode === 'W8') { var onZ8 = (heating && heating.zones || []).filter(function(z) { return z.on; }).map(function(z) { return 'zone ' + z.n; }).join(' and '); bpLogSegs.push('Heating on (' + (onZ8 || 'zones') + '). Customer wants it off.'); }
        else if (wcode === 'W9') bpLogSegs.push('Pub heating already off. Warmth from another source.');
        f.data._wrapLogSentence = bpLogSegs.join(' ');
        // Build action buttons
        var boostBtns = '';
        var candidates = card.candidateZones || [];
        var boostDir = card.direction || 'on';
        if (candidates.length === 1) {
            // Single candidate — go straight to boost
            var cZone = candidates[0].zone || ('CHZ' + candidates[0].n);
            var cLabel = boostDir === 'on' ? 'Turn heating on' : 'Turn heating off';
            boostBtns = '<button class="btn boost-' + boostDir + '" data-testid="bp-boost-' + boostDir + '-' + cZone + '" onclick="flowStep({need:\'bp-boost\',direction:\'' + boostDir + '\',zones:[\'' + cZone + '\']})">' + cLabel + '</button>';
        } else if (candidates.length > 1) {
            // Multiple candidates — zone picker (candidates re-derived in handler from bpWcode)
            var cLabel2 = boostDir === 'on' ? 'Turn heating on' : 'Turn heating off';
            boostBtns = '<button class="btn boost-' + boostDir + '" data-testid="bp-zones-btn" onclick="flowStep({need:\'bp-zones\',direction:\'' + boostDir + '\'})">' + cLabel2 + '</button>';
        }
        var wrapBtn = '<button class="btn primary" data-testid="bp-checklog" onclick="flowStep({need:\'bp-wrap\'})">Finish this issue</button>';
        return readout +
            '<div class="reco" data-testid="reco-boiler-panel">' +
            '<b class="hd">' + esc(card.headline) + '</b>' +
            card.sayHtml +
            card.gtkHtml +
            // rev 5 (c): the heating buttons below are agent actions, not customer answers.
            '<div class="outbtns">' + boostBtns + wrapBtn + '</div>' +
            '</div>';
    }

    // Fallback: reset to stage 1
    f.stage = 1;
    f.data.need = null;
    return boilerPanelHeatingBranch(ws, f, panelDevice, site);
}

// Zone chip selection helper (single-select)
var _bpZoneSelected = null;
function bpZoneSelect(zId) {
    _bpZoneSelected = zId;
    // Toggle aria-pressed on chips
    var chips = document.querySelectorAll('[id^="bpzc-"]');
    chips.forEach(function(c) { c.setAttribute('aria-pressed', 'false'); c.classList.remove('selected'); });
    var chosen = document.getElementById('bpzc-' + zId);
    if (chosen) { chosen.setAttribute('aria-pressed', 'true'); chosen.classList.add('selected'); }
    var btn = document.getElementById('bpz-continue');
    if (btn) btn.disabled = false;
}
function bpZoneContinue() {
    if (!_bpZoneSelected || !state.flow) return;
    var f = state.flow;
    var ws = state.workspace;
    var heating2 = ws && ws.boilerControl && ws.boilerControl.heating ? ws.boilerControl.heating : null;
    var boostAvail2 = (ws && ws.boostAvailable) || { on: false, off: false };
    var activeHolds2 = (ws && ws.activeBoostHolds) || [];
    var card2 = bpOutcomeCard(f.data.bpWcode || 'W6', heating2, Date.now(), boostAvail2, activeHolds2);
    var candidates = card2.candidateZones || [];
    var dir = f.data.direction || 'on';
    var zones;
    if (_bpZoneSelected === 'all') {
        zones = candidates.map(function(z) { return z.zone || ('CHZ' + z.n); });
    } else {
        zones = [_bpZoneSelected];
    }
    _bpZoneSelected = null;
    flowStep({ need: 'bp-boost', direction: dir, zones: zones });
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
                // OOHDASH-146 B3: riskQuestion replaces otherShortcut for not-on-Lighthouse paths.
                if (unplacedCount > 0) {
                    return '<div class="alert warn">No heating area can be checked on Lighthouse at this site.</div>' + unplacedNoteHtml +
                        riskQuestion(f, {
                            yes: () => outcomeP1(f, 'nlh-p1', {
                                subject: 'Heating not on Lighthouse — risk to trade or health and safety — P1',
                                detail: 'No heating area can be checked on Lighthouse at this site. Customer indicated immediate risk to trade or health and safety.',
                                pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                                script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                            }),
                            no: () => outcomeScope(f, 'nlh', {
                                subject: 'Heating — not on Lighthouse at this site',
                                evidence: 'No heating area can be checked on Lighthouse at this site.',
                                script: res => 'Lighthouse doesn\'t manage the heating at your site. Please contact your heating contractor through your usual route. I\'ve noted the call, reference ' + dyn(res.ticket.id) + '.'
                            })
                        });
                }
                return '<div class="alert warn">No heating on Lighthouse at this site.</div>' +
                    riskQuestion(f, {
                        yes: () => outcomeP1(f, 'nlh-p1', {
                            subject: 'Heating not on Lighthouse — risk to trade or health and safety — P1',
                            detail: 'No heating devices found at this site on Lighthouse. Customer indicated immediate risk to trade or health and safety.',
                            pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                            script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                        }),
                        no: () => outcomeScope(f, 'nlh', {
                            subject: 'Heating — not on Lighthouse at this site',
                            evidence: 'No heating devices found at this site on Lighthouse.',
                            script: res => 'Lighthouse doesn\'t manage the heating at your site. Please contact your heating contractor through your usual route. I\'ve noted the call, reference ' + dyn(res.ticket.id) + '.'
                        })
                    });
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
            return sayBox('', 'which area are you calling about?') + answers(areaChips + fallbackChip) + airconChip + unplacedNoteHtml;
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
            // captured for the IoT team) is unchanged; only the wording matches James\'s binding decision.
            if (set.length > 0 && set.every(isDarkFleet)) {
                // OOHDASH-146 B24: riskQuestion added before darkcap outcomeCaptured.
                if (f.data.need === 'darkcap') {
                    return riskQuestion(f, {
                        yes: () => outcomeP1(f, 'dark-p1', {
                            subject: `Heating device not reporting — risk to trade or health and safety — P1 (${areaLabel})`,
                            detail: `The ${areaLabel} heating controller is a Salus unit that is not reporting to Lighthouse (no live data). Customer indicated immediate risk to trade or health and safety.`,
                            pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                            script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                        }),
                        no: () => outcomeCaptured(f, 'darkcap', {
                            subject: `Heating device not reporting (${areaLabel})`,
                            detail: `The ${areaLabel} heating controller is a Salus unit that is not reporting to Lighthouse (no live data), so it cannot be read or adjusted remotely. Logged for the IoT team to check the device and its connection.`,
                            script: 'That heating controller isn\'t sending us any data at the moment, so I can\'t read or change it remotely tonight. It\'s logged, and our IoT team picks it up the next working day.',
                            OohCaptureClass: 'dark-fleet-heating'
                        })
                    });
                }
                if (f.data.need === 'darknoact') {
                    return outcomeNoAction(f, 'darknoact', {
                        subject: `Heating device not reporting (${areaLabel}) - no action`,
                        detail: `Customer asked about ${areaLabel} heating; the Salus controller is not reporting to Lighthouse and the customer declined a follow-up. Call recorded for the audit trail.`,
                        script: ''
                    });
                }
                doneLine(`Area: <b>${esc(areaLabel)}</b>`, 'customer');
                doneLine('The thermostat in this area isn\'t connecting to us', 'check');
                // OOHDASH-128 (OQ4): plural heading when the area has multiple dark-fleet devices.
                if (set.length > 1) {
                    return `<div class="reco" data-testid="reco-dark-fleet"><b class="hd">The heating units in this area are not reporting.</b>They are Salus units that have stopped sending live data to Lighthouse, so there is no live reading and they cannot be switched or adjusted from here. This usually means the devices have lost power or their connection.</div>${sayBox('I can\'t read or change that heating controller from here tonight, because it isn\'t sending us any data.', 'would you like our IoT team to look into it the next working day?')}${answers('<button class="chip" data-testid="dark-capture" onclick="flowStep({need:\'darkcap\'})">Yes, please</button><button class="chip" data-testid="dark-noact" onclick="flowStep({need:\'darknoact\'})">No, leave it</button>')}`;
                }
                return `<div class="reco" data-testid="reco-dark-fleet"><b class="hd">This heating device is not reporting.</b>It is a Salus unit that has stopped sending live data to Lighthouse, so there is no live reading and it cannot be switched or adjusted from here. This usually means the device has lost power or its connection.</div>${sayBox('I can\'t read or change that heating controller from here tonight, because it isn\'t sending us any data.', 'would you like our IoT team to look into it the next working day?')}${answers('<button class="chip" data-testid="dark-capture" onclick="flowStep({need:\'darkcap\'})">Yes, please</button><button class="chip" data-testid="dark-noact" onclick="flowStep({need:\'darknoact\'})">No, leave it</button>')}`;
            }
            // D2 (OOHDASH-164 Stage 1): all devices in the area have readOk=false → data unavailable,
            // not confirmed offline. Use distinct wording and log-it path with specific ticket note.
            if (set.length > 0 && set.every(d => d.readOk === false)) {
                if (f.data.need === 'urcap') {
                    return outcomeCaptured(f, 'urcap', {
                        subject: `Heating thermostat unreadable (${areaLabel})`,
                        detail: 'Thermostat data unavailable at time of call (read failed) — not confirmed offline',
                        script: res => 'That\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day.',
                        OohCaptureClass: 'heating'
                    });
                }
                if (f.data.need === 'urnoact') {
                    return outcomeNoAction(f, 'urnoact', {
                        subject: `Heating thermostat unreadable (${areaLabel}) — no action`,
                        detail: 'Thermostat data unavailable at time of call (read failed) — not confirmed offline. Customer declined a follow-up.',
                        script: res => 'No problem. It\'s noted on the call record, reference ' + dyn(res.ticket.id) + '. If it\'s still not working, give us a call back.'
                    });
                }
                doneLine(`Area: <b>${esc(areaLabel)}</b>`, 'customer');
                doneLine('We can\'t read the thermostat in this area right now', 'check');
                return sayBox('We can\'t read the thermostat in this area right now, so we can\'t check or change it from here.', 'would you like our IoT team to look into it the next working day?') +
                    answers(`<button class="chip" data-testid="area-unreadable-capture" onclick="flowStep({need:'urcap'})">Yes, please</button>` +
                            `<button class="chip" data-testid="area-unreadable-noact" onclick="flowStep({need:'urnoact'})">No, leave it</button>`);
            }
            doneLine(`Area: <b>${esc(areaLabel)}</b>`, 'customer');
            doneLine('The thermostat in this area isn\'t connecting to us', 'check');
            // B9: pass the zone name so the connectivity flow names the device, not "Everything is online"
            f.data.offlineZone = areaLabel;
            f.cat = 'connectivity'; f.stage = 0; f.data.from = 'heating';
            return FLOWR.connectivity(ws, f);
        }
        const t = z.telemetry || {};
        const temp = typeof t.localTemperature === 'number' ? t.localTemperature : (typeof t.roomSensor1Temp === 'number' ? t.roomSensor1Temp : null);
        const sp = t.heatingSetpoint;
        const nInArea = set.length;
        if (f.stage === 1) {
            doneLine(`Area: <b>${esc(areaLabel)}</b>`, 'customer');
            if (!z.online) {
                // D2: if device failed its read, say "can't read" rather than "isn't connecting"
                if (z.readOk === false) {
                    doneLine('We can\'t read the thermostat in this area right now', 'check');
                } else {
                    doneLine('The thermostat in this area isn\'t connecting to us', 'check');
                    f.data.offlineZone = areaLabel; f.cat = 'connectivity'; f.stage = 0; f.data.from = 'heating'; return FLOWR.connectivity(ws, f);
                }
            }
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
            return read + notReportingNote + sayBox('', 'what do you need?') + answers(`
    <button class="chip" data-testid="need-warm" onclick="flowStep({need:'warm'})">Warmer</button>
    <button class="chip" data-testid="need-cool" onclick="flowStep({need:'cool'})">Cooler</button>
    <button class="chip" data-testid="need-off" onclick="flowStep({need:'off'})">Turn it off</button>
    <button class="chip" data-testid="need-broken" onclick="flowStep({need:'broken'})">It\'s not working</button>`);
        }
        if (f.stage === 2) {
            const need = f.data.need;
            // OOHDASH-146 B4: replaced agent buttons with radiator question + riskQuestion.
            if (need === 'warm' && temp != null && sp != null && temp <= sp - 2) {
                doneLine('The customer wants it warmer', 'customer');
                doneLine('The heating is already asking for heat', 'check');
                if (f.data.rads === 'warm') {
                    doneLine('The customer says radiators are warm', 'customer');
                    return outcomeScope(f, 'bh', {
                        subject: `Heating — system running and radiators warm (${z.zone})`,
                        evidence: `Zone reading ${temp}°C against a ${sp}°C setpoint with the device online. Customer confirms radiators are warm — the system is working and the building is warming up normally.`,
                        script: 'The heating is running and the radiators are warm, so it\'s working as it should. The room will get there in time. I\'ve noted the call on your site\'s record.'
                    });
                }
                if (f.data.rads === 'cold') {
                    doneLine('The customer says radiators are cold', 'customer');
                    return riskQuestion(f, {
                        yes: () => outcomeP1(f, 'rad-p1', {
                            subject: `Heating — radiators cold — risk to trade or health and safety — P1 (${z.zone})`,
                            detail: `Zone reading ${temp}°C against a ${sp}°C setpoint — the system is asking for heat but radiators are cold. Customer indicated immediate risk to trade or health and safety.`,
                            pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                            script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                        }),
                        no: () => outcomeCaptured(f, 'rad-cap', {
                            subject: `Heating — radiators not heating up (${z.zone})`,
                            detail: `Zone reading ${temp}°C against a ${sp}°C setpoint — the system is asking for heat but radiators are reported cold. No immediate risk to trade or health and safety. Likely radiators/TRVs or boiler-side limitation.`,
                            script: res => 'It\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day and will be in touch.',
                            OohCaptureClass: 'heating'
                        })
                    });
                }
                return `<div class="reco" data-testid="reco-building-heat"><b class="hd">Raising the setpoint won\'t help here.</b>The zone is reading <b>${temp}°C against a ${sp}°C setpoint</b> with the device online — the system is already asking for more heat than the building is delivering.</div>` +
                    sayBox('', 'are the radiators in that area warm?') +
                    answers('<button class="chip" data-testid="rads-warm" onclick="state.flow.data.rads=\'warm\';render()">Yes, they\'re warm</button>' +
                            '<button class="chip" data-testid="rads-cold" onclick="state.flow.data.rads=\'cold\';render()">No, they\'re cold</button>');
            }
            if (need === 'warm' || need === 'cool') {
                doneLine('The customer wants it ' + (need === 'warm' ? 'warmer' : 'cooler'), 'customer');
                openControl(z, need === 'warm' ? 'up' : 'down');
                return ctlPlaceholder();
            }
            if (need === 'off') {
                doneLine('The customer wants it off', 'customer');
                // OOHDASH-82 (design §6, A4): the heating flow no longer sees Intesis (aircon is removed
                // from the candidate set and served by the dedicated `aircon` referral flow), so the old
                // `z.deviceType === 'intesis'` off-held branch here is dead and has been removed. Salus
                // heat-only units offer the frost-hold below.
                return `<div class="reco" data-testid="reco-frost"><b class="hd">This thermostat has no "off" switch.</b>It\'s a Salus heat-only unit. The closest safe action is a <b>frost-hold</b>: set it to 5°C, so the heating stays off unless the building risks freezing. Normal service resumes when the hold ends.<div class="outbtns"><button class="btn primary" data-testid="frost-recommended" onclick="flowStep({frost:1})">Set frost-hold 5°C (recommended)</button><button class="btn" data-testid="frost-decline" onclick="flowStep({offnoact:1})">The customer doesn\'t want that</button></div></div>`;
            }
            if (need === 'broken') {
                doneLine('The customer says the heating isn\'t working', 'customer');
                // OOHDASH-146 B4: replaced agent buttons with radiator question for keeping-up; riskQuestion for under-target.
                if (temp != null && sp != null && temp >= sp - 1) {
                    if (f.data.rads === 'warm') {
                        doneLine('The customer says radiators are warm', 'customer');
                        return outcomeScope(f, 'bh', {
                            subject: `Heating — system performing to setpoint — radiators confirmed warm (${z.zone})`,
                            evidence: `Zone reading ${temp}°C against a ${sp}°C setpoint — keeping up. Customer confirms radiators are warm.`,
                            script: 'The heating is keeping up and the radiators are warm, so the system is working. I\'ve noted the call on your site\'s record.'
                        });
                    }
                    if (f.data.rads === 'cold') {
                        doneLine('The customer says radiators are cold', 'customer');
                        return riskQuestion(f, {
                            yes: () => outcomeP1(f, 'rad-p1', {
                                subject: `Heating — radiators cold despite keeping up — risk to trade or health and safety — P1 (${z.zone})`,
                                detail: `Zone reading ${temp}°C against a ${sp}°C setpoint — the system is keeping up but radiators are reported cold. Customer indicated immediate risk to trade or health and safety.`,
                                pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                                script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                            }),
                            no: () => outcomeCaptured(f, 'rad-cap', {
                                subject: `Heating — radiators not heating up despite thermostat reading (${z.zone})`,
                                detail: `Zone reading ${temp}°C against a ${sp}°C setpoint — the system is keeping up but radiators are reported cold. No immediate risk. Likely radiators/TRVs or boiler-side issue.`,
                                script: res => 'It\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day.',
                                OohCaptureClass: 'heating'
                            })
                        });
                    }
                    return `<div class="reco"><b class="hd">The system is keeping up.</b>This zone is reading <b>${temp}°C at a ${sp}°C setpoint</b>. If the customer still reports cold, it\'s likely a radiator/TRV or zoning issue rather than the controls.</div>` +
                        sayBox('', 'are the radiators in that area warm?') +
                        answers('<button class="chip" data-testid="rads-warm" onclick="state.flow.data.rads=\'warm\';render()">Yes, they\'re warm</button>' +
                                '<button class="chip" data-testid="rads-cold" onclick="state.flow.data.rads=\'cold\';render()">No, they\'re cold</button>');
                }
                return riskQuestion(f, {
                    yes: () => outcomeP1(f, 'ht-p1', {
                        subject: `Heating not reaching setpoint — risk to trade or health and safety — P1 (${z.zone})`,
                        detail: `Reading ${temp != null ? temp + '°C' : '—'} vs setpoint ${sp != null ? sp + '°C' : '—'} — under target. Customer indicated immediate risk to trade or health and safety.`,
                        pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                        script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                    }),
                    no: () => outcomeCaptured(f, 'ht-cap', {
                        subject: `Heating below target — not at setpoint (${z.zone})`,
                        detail: `Reading ${temp != null ? temp + '°C' : '—'} vs setpoint ${sp != null ? sp + '°C' : '—'} — under target. No immediate risk to trade or health and safety. Logged for IoT team investigation.`,
                        script: res => 'It\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day.',
                        OohCaptureClass: 'heating'
                    })
                });
            }
        }
        // OOHDASH-146 B4: stage 3 retains only frost-hold and no-action outcomes.
        // forceCtl and buildheat are removed — B4 replaces them with the radiator question path.
        if (f.stage === 3) {
            if (f.data.frost) { openControl(z, 'frost'); return ctlPlaceholder(); }
            if (f.data.offnoact) {
                return outcomeNoAction(f, 'offnoact', {
                    subject: `Heating-off request — no action taken (${z.zone})`,
                    detail: 'Customer asked for the heating off; the frost-hold option was offered and declined. Nothing was changed.',
                    script: 'No changes made tonight. If you change your mind, call us again and we can set it straight away.'
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
        // OOHDASH-146 B24: riskQuestion added before outcomeCaptured.
        // B28: schedule-change hint so the agent knows where to put ongoing change details.
        doneLine('Air conditioning can\'t be changed from here', 'check');
        return infoBox('If the customer needs an ongoing schedule change, ask for the details and put them in the notes box that appears with the ticket — the IoT team will see them on the ticket.') +
            riskQuestion(f, {
            yes: () => outcomeP1(f, 'aircon-p1', {
                subject: `Air conditioning — risk to trade or health and safety — P1 (${ws.site.siteName})`,
                detail: 'Customer raised an air-conditioning issue. Aircon is not controllable from the dashboard. Customer indicated immediate risk to trade or health and safety.',
                pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
            }),
            no: () => outcomeCaptured(f, 'aircon', {
                subject: `Air conditioning request (${ws.site.siteName})`,
                detail: 'Customer raised an air-conditioning issue. Aircon is not controllable from the dashboard, so it is captured and referred to the IoT team rather than actioned here.',
                script: 'Air conditioning isn\'t something I can adjust from here. It\'s logged, and our IoT team picks it up the next working day.',
                OohCaptureClass: 'aircon-referral',
                closeOnCreate: true
            })
        });
    },

    hotwater(ws, f) {
        // OOHDASH-114-F1: DHW controllability is now determined by the boilerControl workspace field
        // (Sam Day spec - V1/V2 shared-attribute check). The old devices.find was testing for a device
        // type that live inventory never emits. ws.boilerControl is always present (defaulted server-side).
        // OOHDASH-135 Item 6: not-lighthouse scope path — pure-heating site, hot water not on Lighthouse.
        // OOHDASH-146 B1: removed agent buttons; first screen is now the DHW reading with riskQuestion.
        const hwLevel = (ws.scope || []).filter(function(s) { return s.key === 'hotwater'; }).map(function(s) { return s.level; })[0];
        if (f.stage === 0) {
            if (hwLevel === 'not-lighthouse') {
                doneLine('Hot water isn\'t on Lighthouse here', 'check');
                return `<div data-testid="hw-not-lighthouse">${infoBox('Hot water at this site isn\'t on Lighthouse. It runs on the site\'s own boiler or system and isn\'t connected here.')}</div>` +
                    riskQuestion(f, {
                        yes: () => outcomeP1(f, 'nlh-p1', {
                            subject: 'Hot water issue — risk to trade or health and safety — P1',
                            detail: 'Customer reports hot-water problems. Hot water at this site is not connected to Lighthouse — no remote monitoring or control available. Customer indicated immediate risk to trade or health and safety.',
                            pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                            script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                        }),
                        no: () => outcomeCaptured(f, 'nlh', {
                            subject: 'Hot water issue — not on Lighthouse',
                            detail: 'Customer reports hot-water problems. Hot water at this site is not connected to Lighthouse — no remote monitoring or control available. Logged for IoT team follow-up.',
                            script: 'Hot water at this site isn\'t on Lighthouse, so I can\'t see it from here. It\'s logged, and our IoT team picks it up the next working day.',
                            OohCaptureClass: 'hot-water',
                            closeOnCreate: true
                        })
                    });
            }
            doneLine('Hot water can\'t be changed from here', 'check');
            // OOHDASH-136: DHW override card — shown before the blue note when visible.
            // _hwDhwTs is captured by closure in the riskQuestion callbacks below.
            var _hwDhwOv = ws.boilerControl && ws.boilerControl.dhwOverride;
            var _hwDhwCard = '';
            var _hwDhwTs = '';
            if (_hwDhwOv && _hwDhwOv.visible === true) {
                var _hwDhwOc = dhwOverrideOutcome(_hwDhwOv, Date.now());
                if (_hwDhwOc) {
                    var _hwTagColor = {auto:'green','auto-ended':'green','on-until':'blue','on-v1':'blue','off-until':'amber','off-v1':'amber','cant-confirm':'grey'}[_hwDhwOc.state] || 'grey';
                    var _hwTagText = {auto:'Auto','auto-ended':'Auto','on-until':'Override ON','on-v1':'Override ON','off-until':'Override OFF','off-v1':'Override OFF','cant-confirm':"Can't confirm"}[_hwDhwOc.state] || "Can't confirm";
                    _hwDhwCard = '<div class="reco" data-testid="hw-dhw-override">' +
                        '<b class="hd">' + _hwDhwOc.headline + ' <span class="tag ' + _hwTagColor + '" data-testid="hw-dhw-override-tag">' + _hwTagText + '</span></b>' +
                        '<p>' + _hwDhwOc.explanation + '</p>' +
                        sayBox(_hwDhwOc.script) +
                        '</div>';
                    _hwDhwTs = ' ' + _hwDhwOc.ticketSentence;
                }
            }
            return _hwDhwCard + infoBox('Hot water here runs on the boiler panel, which this dashboard watches but can\'t control, so there\'s no remote boost. The IoT team picks it up the next working day.') +
                riskQuestion(f, {
                    yes: () => outcomeP1(f, 'hw-p1', {
                        subject: 'Hot water issue — risk to trade or health and safety — P1',
                        detail: 'Customer reports hot-water problems. Hot water is boiler-side (monitor-only on Lighthouse) — no remote boost available. Customer indicated immediate risk to trade or health and safety.' + _hwDhwTs,
                        pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                        script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                    }),
                    no: () => outcomeCaptured(f, 'cap', {
                        subject: 'Hot water issue — not resolvable remotely tonight',
                        detail: 'Customer reports hot-water problems. Hot water is boiler-side (monitor-only on Lighthouse) — there is no remote boost. Needs IoT/boiler-side investigation.' + _hwDhwTs,
                        script: 'It\'s logged, and our IoT team picks it up the next working day. If it\'s urgent tonight, the boiler\'s own controls may help, and if a boiler engineer attends, a visit can be chargeable if the fault isn\'t Lighthouse equipment.',
                        OohCaptureClass: 'hot-water',
                        closeOnCreate: true
                    })
                });
        }
        return '';
    },

    kitchen(ws, f) {
        // OOHDASH-159 rev 5 (J1): override FIRST on every circuit (live reachable, live offline, legacy). A P1 is
        // only raised when the override hasn't brought it on AND the kitchen is needed for service now.
        const ks = ws.devices.filter(d => d.kind === 'kitchen');
        const kName = d => (d && (d.tuya?.displayName || d.zone || d.deviceId)) || 'Kitchen circuit';
        const namesText = list => grammaticalList(list.map(kName));
        const namesDyn = (list, lower) => grammaticalList(list.map(d => dyn(lower ? kName(d).toLowerCase() : kName(d))));
        const areWord = list => list.length === 1 ? 'isn\'t' : 'aren\'t';
        const isAre = list => list.length === 1 ? 'is' : 'are';
        const itThem = list => list.length === 1 ? 'it' : 'them';
        // B15 G1: grammatically correct pronoun and auxiliary for plural circuits
        const itThey = list => list.length === 1 ? 'it' : 'they';
        const hasHave = list => list.length === 1 ? 'has' : 'have';
        const INTERLOCK = /fry|bain|gantr|super ?pass/i; // the guide: fryers and heated gantries / bain-marie

        const OFF_VERDICTS = ['A', 'C', 'D', 'off-unknown'];
        function tFmt(t) { return t ? t.time : '?'; }
        function dayFmt(t) { if (!t) return ''; return t.dayText && t.dayText !== 'today' ? ` ${t.dayText}` : ''; }
        function timeFmt(t) { return t ? `${tFmt(t)}${dayFmt(t)}` : '?'; }
        function reasonWords(device, wrap) {
            const t = device.tuya || {};
            const sched = t.schedule || {};
            const w = wrap || (x => x);
            switch (t.verdict) {
                case 'A': return 'it should have come on at ' + w(timeFmt(sched.lastChange));
                case 'C': return 'its timetable has it off until ' + w(timeFmt(sched.nextOn));
                case 'D': return 'it has no timetable, so it\'s meant to stay on';
                case 'off-unknown': return 'its timetable can\'t be read right now';
                case 'B': return sched.nextOff ? 'its timetable has it on until ' + w(timeFmt(sched.nextOff)) : 'its timetable has it on';
                case 'B-unscheduled': return 'it has no timetable, so it stays on';
                case 'B-outside': return 'it\'s on outside its timetable hours, so it was probably switched on at the PowerPause panel';
                case 'E': return 'it\'s switched on but isn\'t drawing any power';
                default: return '';
            }
        }
        function plainReading(device, wrap) {
            const t = device.tuya;
            if (!t) return '';
            const w = wrap || (x => x);
            const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
            const why = reasonWords(device, wrap);
            return 'Checked at ' + w(timeStr) + ': the ' + w(kName(device).toLowerCase()) + ' is ' + (t.switchOn ? 'on' : 'off') + (why ? '; ' + why : '');
        }
        const dynWrap = x => dyn(x);
        // What we can see of a circuit: offline (not connecting), off, on, or unknown (older site, connecting).
        function stateOf(d) {
            if (d.tuya) {
                const v = d.tuya.verdict;
                if (v === 'offline' || v === 'fallback') return 'offline';
                if (OFF_VERDICTS.includes(v)) return 'off';
                return 'on';
            }
            // D2: a device whose read failed is "unknown" (data unavailable), not "offline"
            if (d.readOk === false) return 'unknown';
            return d.online ? 'unknown' : 'offline';
        }
        function factText(d) {
            if (d.readOk === false) return kName(d) + ' — data unavailable right now.';
            const s = stateOf(d);
            if (s === 'offline') return kName(d) + ' not connecting to us.';
            if (s === 'unknown') return kName(d) + ' connecting to us (older site: on/off state not visible).';
            return plainReading(d) + '.';
        }

        // ── 1. Which equipment? (names from this site's equipment list) ───────────────────────
        if (f.data.kSel === undefined) {
            if (!ks.length) f.data.kSel = '__other__';
            else if (ks.length === 1) f.data.kSel = ks[0].deviceId;
            else {
                const chips = ks.map((d, i) =>
                    `<button class="chip" data-testid="kitchen-circuit-${i}" onclick="flowStep({kSel:'${String(d.deviceId).replace(/'/g, "\\\\'")}'})">${dyn(kName(d))}</button>`).join('');
                return `<div data-testid="kitchen-picker">${sayBox('', 'which piece of kitchen equipment is the problem?')}
   <div class="fromlist" data-testid="from-equipment-list">📋 <b>From this site's equipment list.</b> These are the kitchen circuits Lighthouse controls here; the names come from this site, not a fixed list.</div>
   ${answers(chips + '<button data-testid="kitchen-all" class="chip" onclick="flowStep({kSel:\'__all__\'})">Several / all of it</button><button data-testid="kitchen-not-listed" class="chip" onclick="flowStep({kSel:\'__other__\'})">Something not on this list</button>')}</div>`;
            }
        }

        // ── 2. Something not on this list (b) → service contractor, record closed ──────────────
        if (f.data.kSel === '__other__') {
            if (!f.data.kOtherDone) {
                if (!f.data._kOtherLine) { doneLine('The problem is with equipment that isn\'t on this site\'s Lighthouse list', 'customer'); f.data._kOtherLine = 1; }
                const listInfo = ks.length
                    ? `Lighthouse only switches the kitchen equipment on this site's list: ${namesDyn(ks)}. Anything else in the kitchen (for example a grill, hot plate or oven that isn't listed) runs on its own supply, so we can't see it or switch it.`
                    : 'Lighthouse doesn\'t switch any kitchen equipment at this site.';
                return `<div data-testid="kitchen-not-listed-step">${infoBox(listInfo)}
   ${sayBox('That isn\'t controlled by Lighthouse at your site, so I can\'t see it or switch it from here. Please contact your service contractor through your usual route; they look after that equipment.')}
   <div class="formrow"><label for="kother">Which equipment is it? (the customer's words)</label><input id="kother" data-testid="kitchen-other-name" value="${esc(f.data.kOther || '')}" oninput="state.flow.data.kOther=this.value" placeholder="e.g. the grill"></div>
   <button class="btn primary" data-testid="kitchen-other-continue" onclick="flowStep({kOtherDone:1})">Continue</button></div>`;
            }
            const what = String(f.data.kOther || '').trim();
            if (what) doneLine('The customer says it\'s: "' + esc(what) + '"', 'customer');
            return outcomeScope(f, 'not-listed', {
                subject: 'Kitchen equipment not controlled by Lighthouse — customer referred to their service contractor',
                evidence: `Customer reported a problem with ${what ? '"' + what + '"' : 'kitchen equipment'}, which is not on this site's Lighthouse equipment list${ks.length ? ' (' + namesText(ks) + ')' : ''}. Told to contact their service contractor. Record closed on creation (contact history).`,
                script: res => 'I\'ve put a note of this call on your site\'s record, reference ' + dyn(res.ticket.id) + '. Your service contractor is the right person to look at that.'
            });
        }

        const S = f.data.kSel === '__all__' ? ks : ks.filter(d => d.deviceId === f.data.kSel);
        if (!S.length) return infoBox('That piece of equipment is no longer on this site\'s list.') + otherShortcut();
        const problem = S.filter(d => stateOf(d) !== 'on');

        // ── 3a. Everything chosen has power → appliance fault, service contractor ─────────────
        if (!problem.length) {
            const d = S[0];
            const zoneL = dyn(kName(d).toLowerCase());
            if (!f.data._kOnLine) { S.forEach(x => doneLine(`${dyn(kName(x))} has power and is switched on`, 'check')); f.data._kOnLine = 1; }
            const ko = f.data.kOn;
            if (ko === undefined) {
                const e = d.tuya?.verdict === 'E';
                const script = e
                    ? `The ${zoneL} has power at our end, but the appliance isn't drawing any. Please check it hasn't been switched off on the appliance itself. If it's switched on and still won't work, it's a fault with the appliance, so please contact your service contractor.`
                    : `The ${zoneL} has power and is switched on at our end. If it still isn't working, it's most likely a fault with the appliance itself, so please contact your service contractor.`;
                return `<div data-testid="kitchen-verdict">${sayBox(script, 'is that OK, or do you still think it\'s our equipment?')}
   ${infoBox(`Power is reaching the ${zoneL}, so Lighthouse isn't stopping it. <div class="small" style="margin-top:4px" data-testid="kitchen-reading">${plainReading(d, dynWrap)}.</div>`)}
   ${answers(`<button class="chip" data-testid="kitchen-repairs" onclick="flowStep({kOn:'contractor'})">I'll call our service contractor</button><button class="chip" data-testid="kitchen-still-ours" onclick="flowStep({kOn:'ours'})">I still think it's your equipment</button>`)}</div>`;
            }
            if (ko === 'contractor') {
                doneLine('The customer will call their service contractor', 'customer');
                return outcomeScope(f, 'contractor', {
                    subject: 'Kitchen appliance fault — customer referred to their service contractor',
                    evidence: `Power reaching ${namesText(S)}; appliance fault suspected; customer will contact their service contractor. ${S.map(factText).join(' ')}`,
                    script: res => 'Thanks. I\'ve noted the call on your site\'s record, reference ' + dyn(res.ticket.id) + '. Your service contractor will be able to look at the appliance itself.'
                });
            }
            // 'ours' → fall through to the service question below (no override: the power is already on)
            if (!f.data._kOursLine) { doneLine('The customer still thinks it\'s our equipment', 'customer'); f.data._kOursLine = 1; }
            f.data.ov = f.data.ov || 'on-insist';
        }

        // ── 3b. Override first (J1) ───────────────────────────────────────────────────────────
        const offline = problem.filter(d => stateOf(d) === 'offline');
        const off = problem.filter(d => stateOf(d) === 'off');
        const unknown = problem.filter(d => stateOf(d) === 'unknown');
        if (!f.data._kChecked) {
            if (offline.length) doneLine(`${namesDyn(offline)} ${areWord(offline)} connecting to us`, 'check');
            off.forEach(d => doneLine(`${dyn(kName(d))} is off; ${reasonWords(d, dynWrap)}`, 'check'));
            if (unknown.length) doneLine(`${namesDyn(unknown)} ${isAre(unknown)} connecting to us (this site can't show whether ${itThey(unknown)} ${isAre(unknown)} on)`, 'check');
            f.data._kChecked = 1;
        }
        if (f.data.ov === undefined) {
            const lead = [];
            if (offline.length) lead.push(`I can see your ${namesDyn(offline, true)} ${areWord(offline)} connecting to us at the moment, so I can't see or switch ${itThem(offline)} from here.`);
            if (off.length) lead.push(`I can see your ${namesDyn(off, true)} ${isAre(off)} switched off at the moment.`);
            if (unknown.length) lead.push(`I can't see from here whether your ${namesDyn(unknown, true)} ${isAre(unknown)} on.`);
            const always = off.filter(d => d.tuya?.verdict === 'D');
            if (always.length) lead.push(`The ${namesDyn(always, true)} ${isAre(always)} meant to stay on all the time, so first check the fuse board hasn't tripped.`);
            const interlock = problem.filter(d => INTERLOCK.test(kName(d)));
            const names = namesDyn(problem, true);
            const script = `<p>${lead.join(' ')}</p>
   <p>There's a manual override on the PowerPause panel. The panel is usually by the kitchen distribution boards, behind the appliance, or on the ceiling. Every appliance we control has a Lighthouse label on it.</p>
   <p>${problem.length > 1 ? `Find the button for each of them (${grammaticalList(problem.map(d => dyn(kName(d).toLowerCase()))).replace(/ and /, ', ')}) and press each one <b>once</b>. Please don't hold them down.` : `Find the button for the ${names} and press it <b>once</b>. Please don't hold it down.`}${interlock.length ? ` For the ${namesDyn(interlock, true)}, also press the green start button on the interlock panel in the kitchen.` : ''}</p>
   <p>The override is logged and monitored, and our team checks it automatically the next working day. It stays on until the next timetable change.</p>`;
            const why = off.map(d => `${dyn(kName(d))} is off because ${reasonWords(d, dynWrap)}.`);
            unknown.forEach(d => { if (d.schedule) why.push(`${dyn(kName(d))} timetable: ${dyn(d.schedule)}.`); });
            const info = (why.length ? why.join('<br>') + '<br>' : '') + 'Pressing the button once brings the circuit on until the next timetable change. Holding it down takes the circuit off the system, so ask them not to.<div style="margin-top:6px">' + guideLink() + '</div>';
            const timetableAns = (off.some(d => d.tuya?.verdict === 'C') || unknown.length)
                ? '<button class="chip" data-testid="kitchen-needs-times" onclick="flowStep({ov:\'kwhen\'})">It\'s fine, but we need it at different times</button>' : '';
            const fuseAns = always.length ? '<button class="chip" data-testid="kitchen-fuse-fixed" onclick="flowStep({ov:\'fuse\'})">The fuse board had tripped; resetting it fixed it</button>' : '';
            return `<div data-testid="kitchen-override-step">${sayBox(script, `${hasHave(problem)} the ${names} come on?`)}${infoBox(info)}
   ${answers(`<button class="chip" data-testid="kitchen-override-ok" onclick="flowStep({ov:'ok'})">Yes, it's come on</button><button class="chip" data-testid="kitchen-override-fail" onclick="flowStep({ov:'fail'})">No, it hasn't come on</button><button class="chip" data-testid="kitchen-no-panel" onclick="flowStep({ov:'nopanel'})">They can't find the panel</button>${fuseAns}${timetableAns}`)}</div>`;
        }
        const facts = S.map(factText).join(' ');
        if (f.data.ov === 'ok') {
            doneLine('It came on with the override', 'customer');
            return outcomeCaptured(f, 'override-ok', {
                subject: 'Kitchen equipment on with the manual override',
                detail: `The customer used the manual override on the PowerPause panel and the ${namesText(problem)} came on. Override monitored; check the timetable and the circuit the next working day. ${facts}`,
                script: res => 'Great, that\'s it on. The override lasts until the next timetable change. It\'s logged, reference ' + dyn(res.ticket.id) + ', and our team checks it automatically the next working day.',
                line: 'Nothing was switched from here; the customer used the override on site. The IoT team checks it the <b>next working day</b>.',
                OohCaptureClass: 'kitchen-powerpause'
            });
        }
        if (f.data.ov === 'fuse') {
            doneLine('The fuse board had tripped and resetting it fixed it', 'customer');
            return outcomeCaptured(f, 'fuse-fixed', {
                subject: 'Kitchen circuit tripped — fixed on site',
                detail: `Always-on kitchen circuit had tripped; reset on site. ${facts}`,
                script: res => 'Glad that\'s sorted. It\'s logged, reference ' + dyn(res.ticket.id) + ', so our team can check why it tripped the next working day.',
                line: 'Nothing was switched from here; the customer reset the fuse board. The IoT team checks why it tripped the <b>next working day</b>.',
                OohCaptureClass: 'kitchen-powerpause'
            });
        }
        // B5: K-when-unknown — the production path when the one-off book isn't available.
        // The agent picks when the customer needs the change; urgency determines the outcome.
        if (f.data.ov === 'kwhen') {
            if (!f.data._kKwhenLine) { doneLine('The equipment is working, but the customer needs it at a different time', 'customer'); f.data._kKwhenLine = 1; }
            if (!f.data.kOneoffWhen) {
                return sayBox(null, 'When does the customer need this in place?') +
                    answers(
                        '<button class="chip" data-testid="koneoff-tonight" onclick="flowStep({kOneoffWhen:\'tonight\'})">Tonight</button>' +
                        '<button class="chip" data-testid="koneoff-tmrw-before12" onclick="flowStep({kOneoffWhen:\'tmrw-before12\'})">Tomorrow before 12:00</button>' +
                        '<button class="chip" data-testid="koneoff-tmrw-12plus" onclick="flowStep({kOneoffWhen:\'tmrw-12plus\'})">Tomorrow at 12:00 or later</button>' +
                        '<button class="chip" data-testid="koneoff-later" onclick="flowStep({kOneoffWhen:\'later\'})">A later day this week</button>' +
                        '<button class="chip" data-testid="koneoff-everyweek" onclick="flowStep({ov:\'sched\'})">Different times every week</button>'
                    );
            }
            const neededAt = neededAtFromWhen(f.data.kOneoffWhen);
            const urg = typeof OohUrgency !== 'undefined' ? OohUrgency.urgencyOf(neededAt, Date.now()) : null;
            const isUrgent = urg && urg.urgent;
            if (isUrgent) {
                // D14d: auto P1 — the one-off cannot be booked from here and the request is urgent
                if (!f.data.p1Origin) { f.data.p1Origin = 'automatic'; f.data.p1Reason = 'Automatic: urgent kitchen one-off requested but cannot be booked from this site.'; }
                return urgencyBannerHtml(true, 'koneoff-urgency-banner') +
                    outcomeP1(f, 'k-auto-p1', {
                        subject: 'Kitchen one-off could not be set up — urgent request — P1',
                        detail: 'Customer needs kitchen equipment at a different time urgently, but this change cannot be booked from here. P1 raised automatically for the on-call agent.',
                        pre: sayBox('I need to raise this urgently for our on-call team, as this site\'s one-off booking isn\'t set up yet.'),
                        script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.',
                        p1Summary: 'Auto: urgent kitchen one-off - cannot book'
                    });
            }
            return urgencyBannerHtml(false, 'koneoff-urgency-banner') +
                outcomeCaptured(f, 'k-normal', {
                    subject: 'Kitchen equipment: different times needed',
                    detail: 'Customer needs kitchen equipment at a different time just this once. Not urgent; IoT team to contact site the next working day.',
                    script: res => 'Thanks, it\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day.',
                    line: 'The customer needs the equipment at a different time. Nothing was changed tonight. IoT team picks up the <b>next working day</b>.',
                    OohCaptureClass: 'kitchen-powerpause'
                });
        }

        if (f.data.ov === 'sched') {
            if (!f.data._kSchLine) { doneLine('The equipment is working, but the customer needs it at different times every week', 'customer'); f.data._kSchLine = 1; }
            const tt = problem.map(d => d.tuya ? `${dyn(kName(d))}: ${reasonWords(d, dynWrap)}` : `${dyn(kName(d))}: ${dyn(d.schedule || 'timetable not shown')}`).join('<br>');
            // B28c: urgency filter for permanent (every week) changes after the form is filled
            if (f.data.schDone && f.data.schKind === 'permanent') {
                if (!f.data.kSchWhen) {
                    return sayBox(null, 'When does the customer need this in place?') + whenNeededChips('kSchWhen');
                }
                const neededAt = neededAtFromWhen(f.data.kSchWhen);
                const urg = typeof OohUrgency !== 'undefined' ? OohUrgency.urgencyOf(neededAt, Date.now()) : null;
                const isUrgent = urg && urg.urgent;
                const banner = urgencyBannerHtml(isUrgent, 'kperm-urgency-banner');
                if (!f.data.kSchOutcome) {
                    if (isUrgent) {
                        return banner +
                            infoBox('If you raise a P1, write the full schedule request in the comment so the on-call agent can sort it out.') +
                            answers(
                                '<button class="chip" data-testid="kperm-p1" onclick="flowStep({kSchOutcome:\'p1\'})">Raise a P1</button>' +
                                '<button class="chip" data-testid="kperm-ticket" onclick="flowStep({kSchOutcome:\'ticket\'})">Log a normal ticket</button>'
                            );
                    }
                    return banner + answers('<button class="chip" data-testid="kperm-ticket" onclick="flowStep({kSchOutcome:\'ticket\'})">Log a normal ticket</button>');
                }
                if (f.data.kSchOutcome === 'p1') {
                    return outcomeP1(f, 'k-perm-p1', {
                        subject: 'Kitchen equipment — risk to trade or health and safety — P1',
                        detail: `Customer needs kitchen equipment at different times every week. Urgent — before the IoT team can respond. Equipment: ${(f.data.schEq || []).join(', ') || 'not specified'}; times: ${String(f.data.schTimes || '').trim() || 'not specified'}.`,
                        pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                        script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                    });
                }
                // kSchOutcome === 'ticket': normal ticket
                const eq = (f.data.schEq || []).length ? f.data.schEq.join(', ') : 'not specified';
                return outcomeCaptured(f, 'k-perm', {
                    subject: 'Kitchen timetable request — permanent change',
                    detail: `Customer needs: ${eq}; ${String(f.data.schTimes || '').trim()}; every week (permanent change: needs management approval).${String(f.data.schMore || '').trim() ? ' Also said: ' + String(f.data.schMore).trim() + '.' : ''} Collected on the call; not changed out of hours.`,
                    script: res => 'Thanks, that\'s with our IoT team, reference ' + dyn(res.ticket.id) + '. They\'ll contact you the next working day to arrange it. As it\'s a permanent change, they\'ll check it with your management first.',
                    line: 'Nothing was changed tonight. The IoT team contacts the site the <b>next working day</b>.',
                    OohCaptureClass: 'kitchen-powerpause'
                });
            }
            return scheduleCollect(f, 'k-sched', {
                equipment: ks.map(kName),
                preselect: problem.map(kName),
                timetableHtml: 'What the timetable says now:<br>' + tt,
                subject: 'Kitchen timetable request',
                OohCaptureClass: 'kitchen-powerpause'
            });
        }

        // ── 4. Override didn't work → the service question → P1 only if needed now ─────────────
        if (!f.data._kFailLine) {
            if (f.data.ov === 'fail') doneLine('It didn\'t come on with the override', 'customer');
            if (f.data.ov === 'nopanel') doneLine('The customer can\'t find the PowerPause panel', 'customer');
            f.data._kFailLine = 1;
        }
        const tried = f.data.ov === 'fail' ? 'The manual override on the PowerPause panel didn\'t bring it on.'
            : f.data.ov === 'nopanel' ? 'The customer couldn\'t find the PowerPause panel to use the override.'
                : 'Power reaches the equipment but the customer still thinks it\'s ours.';
        return riskQuestion(f, {
            yes: () => outcomeP1(f, 'crit', {
                subject: 'Kitchen equipment off — risk to trade or health and safety — P1',
                detail: `Kitchen equipment off; immediate risk to trade or health and safety: ${namesText(S)}. ${tried} ${facts}`,
                pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.") +
                    infoBox(`${namesDyn(S)}: ${offline.length ? 'not connecting to us, so the on-call agent can\'t see or switch ' + itThem(S) + ' either.' : 'the on-call agent will call the site back.'}`),
                script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
            }),
            no: () => outcomeCaptured(f, 'ncrit', {
                subject: 'Kitchen equipment off — no immediate risk',
                detail: `${namesText(S)} off; no immediate risk to trade or health and safety. ${tried} ${facts}`,
                script: res => 'Thanks. It\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day and will be in touch.',
                OohCaptureClass: 'kitchen-powerpause'
            })
        });
    },

    lighting(ws, f) {
        // OOHDASH-135 Item 1: filter() so multi-circuit sites surface every lighting device.
        const lgs = ws.devices.filter(d => d.kind === 'lighting');
        if (f.stage === 0) {
            const anyOnline = lgs.some(d => d.online);
            const allUnreadable = lgs.length > 0 && lgs.every(d => d.readOk === false);
            // D2: if all controllers failed their read, say "can't read" not "isn't connecting"
            doneLine(lgs.length ? (allUnreadable ? 'We can\'t read the outside lighting controller right now' : anyOnline ? 'The outside lighting controller is connecting to us' : 'The outside lighting controller isn\'t connecting to us') : 'Outside lighting isn\'t on Lighthouse here', 'check');
            // OOHDASH-146 B3: riskQuestion replaces otherShortcut for not-on-Lighthouse paths.
            if (!lgs.length) return '<div class="alert info">External lighting at this site isn\'t on Lighthouse.</div>' +
                riskQuestion(f, {
                    yes: () => outcomeP1(f, 'nlh-p1', {
                        subject: 'External lighting not on Lighthouse — risk to trade or health and safety — P1',
                        detail: 'External lighting at this site is not connected to Lighthouse — no Lighthouse device found. Customer indicated immediate risk to trade or health and safety.',
                        pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                        script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                    }),
                    no: () => outcomeScope(f, 'nlh', {
                        subject: 'External lighting — not on Lighthouse at this site',
                        evidence: 'No Lighthouse lighting device found at this site — lighting is not in the Lighthouse estate here.',
                        script: res => 'Lighthouse doesn\'t manage the external lighting at your site. Please contact your lighting contractor through your usual route. I\'ve noted the call, reference ' + dyn(res.ticket.id) + '.'
                    })
                });
            const lgSwitches = lgs.map(lg =>
                canSwitch(lg)
                    ? `<div class="zoneread"><span style="font-size:20px">💡</span><div><div><b>${esc(lg.zone)}</b> — ${lg.telemetry?.switch_1 ? 'currently ON' : 'currently OFF'}</div><div class="small">${esc(lg.deviceId)}</div></div>${switchButtons(lg, 'lighting-switch')}<span class="tag ${lg.telemetry?.switch_1 ? 'green' : 'grey'}">${lg.telemetry?.switch_1 ? 'on' : 'off'}</span></div>`
                    : ''
            ).join('');
            const anySwitchable = lgs.some(canSwitch);
            // rev 5 (J1): the override first; a P1 only if the lights are still off afterwards.
            return lgSwitches + infoBox((anySwitchable ? 'You can switch the lighting circuit above; the change only counts once the controller confirms it. ' : 'Outside lighting can\'t be switched from here. ') +
                (anyOnline ? '' : 'The lighting controller isn\'t connecting to us, which often means a tripped fuse board. ') +
                'The outside lights are on the PowerPause panel too, so the override button brings them on until the next timetable change.<div style="margin-top:6px">' + guideLink() + '</div>') +
                sayBox((anyOnline ? '<p>The outside lights come on automatically at dusk, so they should usually look after themselves.</p>'
                    : '<p>The lighting controller isn\'t connecting to us at the moment. Could you check your fuse board first, as a tripped switch is the usual cause?</p>') +
                    '<p>If they\'re still off, there\'s a manual override on the PowerPause panel. It\'s usually by the distribution boards or in the bar, and the outside lights have a Lighthouse label. Press the override button <b>once</b>; please don\'t hold it down. The override is logged and monitored, and our team checks it automatically the next working day.</p>', 'have the lights come on?') +
                answers(`<button class="chip" data-testid="lighting-ok" onclick="flowStep({r:'ok'})">Yes, they've come on</button><button class="chip" data-testid="lighting-still-off" onclick="flowStep({r:'cap'})">No, they're still off</button>`);
        }
        if (f.stage === 1) {
            if (f.data.r === 'ok') {
                doneLine('The lights came on with the manual override', 'customer');
                return outcomeCaptured(f, 'ok', {
                    subject: 'External lighting — on with the manual override',
                    detail: 'Customer used the manual override on the PowerPause panel and the outside lights came on. Override monitored; the IoT team checks why they didn\'t come on automatically.',
                    script: res => 'Great, that\'s them on. It\'s logged, reference ' + dyn(res.ticket.id) + ', and our team checks it automatically the next working day.',
                    line: 'Nothing was switched from here; the customer used the override on site. The IoT team checks it the <b>next working day</b>.',
                    OohCaptureClass: 'lighting'
                });
            }
            doneLine('The lights are still off after the manual override', 'customer');
            return riskQuestion(f, {
                yes: () => outcomeP1(f, 'cap', {
                    subject: 'External lighting not working — risk to trade or health and safety — P1',
                    detail: 'The manual override on the PowerPause panel did not bring the outside lights on; possible tripped supply or failed controller. Immediate risk to trade or health and safety. Remote switching not available; needs immediate IoT/electrical follow-up.',
                    pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                    script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly. If the dark frontage is a safety concern right now, your site\'s procedure for calling an electrician still applies.'
                }),
                no: () => outcomeCaptured(f, 'capno', {
                    subject: 'External lighting not working — no immediate risk',
                    detail: 'The manual override on the PowerPause panel did not bring the outside lights on; possible tripped supply or failed controller. No immediate risk to trade or health and safety. IoT team to investigate next working day.',
                    script: res => 'Thanks. It\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day and will be in touch.',
                    OohCaptureClass: 'lighting'
                })
            });
        }
        return '';
    },

    fan(ws, f) {
        // OOHDASH-135 Item 1: filter() so multi-circuit sites surface every fan device.
        const fans = ws.devices.filter(d => d.kind === 'fan');
        if (f.stage === 0) {
            const anyOnline = fans.some(d => d.online);
            const allUnreadable = fans.length > 0 && fans.every(d => d.readOk === false);
            // D2: if all controllers failed their read, say "can't read" not "isn't connecting"
            doneLine(fans.length ? (allUnreadable ? 'We can\'t read the fan controller right now' : anyOnline ? 'The fan controller is connecting to us' : 'The fan controller isn\'t connecting to us') : 'Extractor fans aren\'t on Lighthouse here', 'check');
            // OOHDASH-146 B3: riskQuestion replaces otherShortcut for not-on-Lighthouse paths.
            if (!fans.length) return '<div class="alert info">Extractor fans at this site aren\'t on Lighthouse.</div>' +
                riskQuestion(f, {
                    yes: () => outcomeP1(f, 'nlh-p1', {
                        subject: 'Extractor fans not on Lighthouse — risk to trade or health and safety — P1',
                        detail: 'Extractor fans at this site are not connected to Lighthouse — no Lighthouse device found. Customer indicated immediate risk to trade or health and safety.',
                        pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                        script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                    }),
                    no: () => outcomeScope(f, 'nlh', {
                        subject: 'Extractor fans — not on Lighthouse at this site',
                        evidence: 'No Lighthouse fan device found at this site — extractor fans are not in the Lighthouse estate here.',
                        script: res => 'Lighthouse doesn\'t manage the extractor fans at your site. Please contact your contractor through your usual route. I\'ve noted the call, reference ' + dyn(res.ticket.id) + '.'
                    })
                });
            // B28: D14 urgency filter — fall through to the state machine below
        }
        // B28: D14 urgency filter for extractor fans (one-off vs every week, then when needed)
        const anySwitchable = fans.some(canSwitch);
        const fanSwitches = fans.map(fan =>
            canSwitch(fan)
                ? `<div class="zoneread"><span style="font-size:20px">🌀</span><div><div><b>${dyn(fan.zone)}</b> — ${fan.telemetry?.switch_1 ? 'currently ON' : 'currently OFF'}</div><div class="small">${esc(fan.deviceId)}</div></div>${switchButtons(fan, 'fan-switch')}<span class="tag ${fan.telemetry?.switch_1 ? 'green' : 'grey'}">${fan.telemetry?.switch_1 ? 'on' : 'off'}</span></div>`
                : ''
        ).join('');
        const fanTimetableInfo = (anySwitchable ? 'You can switch a fan above if the customer needs it on or off right now; the change only counts once the controller confirms it. ' : 'Fans can\'t be switched from here. ') +
            'If they need the fans on right now, the override button on the PowerPause panel brings them on until the next timetable change.<div style="margin-top:6px">' + guideLink() + '</div>';

        if (!f.data.fanKind) {
            return fanSwitches + infoBox(fanTimetableInfo) +
                sayBox(null, 'Is it just this once, or does the customer need this every week?') +
                answers(
                    '<button class="chip" data-testid="fan-kind-once" onclick="flowStep({fanKind:\'once\'})">Just this once</button>' +
                    '<button class="chip" data-testid="fan-kind-everyweek" onclick="flowStep({fanKind:\'everyweek\'})">Every week</button>'
                );
        }

        if (f.data.fanKind === 'everyweek') {
            if (!f.data._fanEveryweekLine) { doneLine('The customer needs the fans at different times every week', 'customer'); f.data._fanEveryweekLine = 1; }
            return scheduleCollect(f, 'fan-sched', {
                equipment: fans.map(x => x.zone || 'Extractor fan'),
                preselect: fans.length === 1 ? [fans[0].zone || 'Extractor fan'] : [],
                timetableHtml: fanTimetableInfo,
                lead: 'If you need the fans on right now, the override button on the PowerPause panel brings them on until the next timetable change. Press it once; please don\'t hold it down.',
                subject: 'Extractor fan timetable request',
                OohCaptureClass: 'fans'
            });
        }

        // fanKind === 'once'
        if (!f.data._fanOnceLine) { doneLine('The customer needs the fans adjusted just this once', 'customer'); f.data._fanOnceLine = 1; }

        if (!f.data.fanWhen) {
            return sayBox(null, 'When does the customer need this in place?') + whenNeededChips('fanWhen');
        }

        const fanNeededAt = neededAtFromWhen(f.data.fanWhen);
        const fanUrg = typeof OohUrgency !== 'undefined' ? OohUrgency.urgencyOf(fanNeededAt, Date.now()) : null;
        const fanIsUrgent = fanUrg && fanUrg.urgent;

        if (!f.data.fanOutcome) {
            const fanBanner = urgencyBannerHtml(fanIsUrgent, 'fan-urgency-banner');
            if (fanIsUrgent) {
                return fanBanner +
                    infoBox('If you raise a P1, write why it\'s urgent in the comment — for example, what opening time the fans are needed for.') +
                    answers(
                        '<button class="chip" data-testid="fan-outcome-p1" onclick="flowStep({fanOutcome:\'p1\'})">Raise a P1</button>' +
                        '<button class="chip" data-testid="fan-outcome-ticket" onclick="flowStep({fanOutcome:\'ticket\'})">Log a normal ticket</button>'
                    );
            }
            return fanBanner +
                answers('<button class="chip" data-testid="fan-outcome-ticket" onclick="flowStep({fanOutcome:\'ticket\'})">Log a normal ticket</button>');
        }

        if (f.data.fanOutcome === 'p1') {
            return outcomeP1(f, 'fan-urgent-p1', {
                subject: 'Extractor fans — urgent one-off — P1',
                detail: 'Customer needs extractor fans adjusted urgently for a one-off occasion. Requested before the IoT team can respond.',
                pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
            });
        }

        return outcomeCaptured(f, 'fan-ticket', {
            subject: 'Extractor fan timetable request',
            detail: 'Customer needs extractor fans at a different time just this once. Logged for the IoT team to pick up the next working day.',
            script: res => 'Thanks, it\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day.',
            line: 'Nothing was switched from here. The IoT team picks it up the <b>next working day</b>.',
            OohCaptureClass: 'fans'
        });
    },

    fridge(ws, f) {
        if (f.stage === 0) {
            doneLine('Lighthouse watches fridge temperatures but doesn\'t control the fridges', 'check');
            return infoBox('Lighthouse <b>monitors</b> fridge and freezer temperatures but doesn\'t control them, so a warm fridge is an appliance fault. There is no override for fridges.') +
                riskQuestion(f, {
                    yes: () => outcomeP1(f, 'risk', {
                        subject: 'Refrigeration alarm — risk to trade or health and safety — P1',
                        detail: 'Customer reports refrigeration failure with immediate risk to trade or health and safety. Monitoring-only on Lighthouse; escalated for immediate advice + appliance callout guidance.',
                        pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                        script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly. The fridge itself isn\'t controlled by Lighthouse, so please also contact your service contractor.'
                    }),
                    no: () => outcomeScope(f, 'q', {
                        subject: 'Refrigeration query — monitored only',
                        evidence: 'Lighthouse monitors refrigeration temperatures for alerting; the appliances themselves are maintained via the site\'s normal repair route.',
                        script: res => 'Lighthouse keeps an eye on the temperatures but doesn\'t control the fridges, so for a faulty unit please contact your service contractor. I\'ve noted the call on your site\'s record, reference ' + dyn(res.ticket.id) + '.'
                    })
                });
        }
        return '';
    },

    connectivity(ws, f) {
        // OOHDASH-91 G2: the site-reachability conclusion is anchored on the LoRaWAN hub (lwgateway), the
        // one device every remote command reaches the site through — NOT an arbitrary `find(kind==='gateway')`,
        // which could narrate an equipment-group gateway\'s state as "the site". The -r10a / Salus-hub
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
                if (anchor === null) cl = 'This site\'s equipment connects to us directly, with no wall unit';
                // D2: failed read → "can't read" (we don't know if it's offline or just unreadable)
                else if (!anchor.online) cl = anchor.readOk === false ? 'We can\'t read the Lighthouse wall unit right now' : 'The Lighthouse wall unit at this site isn\'t connecting to us';
                else if (offlineGroups.length) cl = `The site is connecting to us, but ${offlineGroups.length === 1 ? 'one equipment group isn\'t' : offlineGroups.length + ' equipment groups aren\'t'}`;
                else cl = 'The site is connecting to us';
                doneLine(cl, 'check');
                f.data._cline = 1;
            }

            // Gateway-less site (e.g. 5198): no anchor and no equipment-group gateway to assess. Make NO
            // whole-site reachability claim; defer to per-device liveness for the flow\'s own equipment. NO
            // Lighthouse-unit / gateway / fuse-board framing anywhere.
            if (anchor === null) {
                const fromKind = f.data.from;
                const equip = ws.devices.filter(d => d.kind !== 'gateway' && (!fromKind || d.kind === fromKind));
                const live = !equip.length ? ''
                    : `<p style="margin:8px 0">The equipment you\'re calling about ${equip.every(d => d.online) ? 'is responding' : 'isn\'t responding right now'}.</p>`;
                return `<div data-testid="connectivity-gwless">${infoBox('This site\'s equipment connects to us directly, with no wall unit, so we check the equipment itself.' + live)}</div>
   ${sayBox('The equipment you\'re calling about isn\'t connecting to us at the moment, so I can\'t reach it from here.', 'is it working now?')}
   ${answers(`<button class="chip" data-testid="gwless-back" onclick="flowStep({ofq:'dback'})">Yes, it's working again</button><button class="chip" data-testid="gwless-capture" onclick="flowStep({ofq:'dcap'})">No, it's still not working</button>`)}`;
            }

            // Anchor OFFLINE (or unreadable) → site unreachable path.
            if (!anchor.online) {
                // D2: if the read failed, say "can't read" rather than "isn't connecting"
                if (anchor.readOk === false) {
                    return `<div data-testid="connectivity-alert">${infoBox('We can\'t read the Lighthouse wall unit right now. It may be working — we just can\'t see it.')}</div>
   ${sayBox('We\'re having trouble reading the Lighthouse unit on your wall just now — it may be a temporary issue.', 'could you check whether the unit has lights on?')}
   ${answers(`<button class="chip" data-testid="connectivity-back" onclick="flowStep({ofq:'back'})">Yes, the unit looks on</button><button class="chip" data-testid="connectivity-stilldead" onclick="flowStep({ofq:'cap'})">No, it looks off</button>`)}`;
                }
                return `<div data-testid="connectivity-alert">${infoBox('The Lighthouse wall unit at this site isn\'t connecting to us. It connects the whole site, so nothing can be reached from here while it\'s down. This is usually power or internet at the site.')}</div>
   ${sayBox('The Lighthouse unit on your wall isn\'t responding, which normally means it\'s lost power or internet. I\'ll stay on the line.', 'could you check the fuse board hasn\'t tripped, that the unit has lights on, and the router is on?')}
   ${answers(`<button class="chip" data-testid="connectivity-back" onclick="flowStep({ofq:'back'})">Yes, the unit's lights are back on</button><button class="chip" data-testid="connectivity-stilldead" onclick="flowStep({ofq:'cap'})">No, it's still not working</button>`)}`;
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
                    callout = `The site is reachable, but ${groupPhrase(labels[0])} isn\'t responding — its own connection is down. Other equipment at this site can still be reached.`;
                    stepq = `${groupPhrase(labels[0]).charAt(0).toUpperCase() + groupPhrase(labels[0]).slice(1)} can\'t be reached remotely while its connection is down. It\'s passed to the IoT team unless the customer says it\'s working again.`;
                } else {
                    const n = NUM_WORDS[labels.length] || String(labels.length);
                    callout = `The site is reachable, but ${n} of its equipment groups aren\'t responding — ${grammaticalList(labels.map(listItem))} — because each has lost its own connection. Other equipment at this site can still be reached.`;
                    stepq = `These equipment groups can\'t be reached remotely while their connection is down. It\'s passed to the IoT team unless the customer says it\'s working again.`;
                }
                return `<div data-testid="connectivity-group-offline">${infoBox(callout + ' ' + stepq)}</div>
   ${sayBox('The site itself is connecting to us, but the unit that runs that equipment has lost its own connection, so I can\'t reach it from here.', 'is it working now?')}
   ${answers(`<button class="chip" data-testid="group-offline-back" onclick="flowStep({ofq:'gback'})">Yes, it's working again</button><button class="chip" data-testid="group-offline-capture" onclick="flowStep({ofq:'gcap'})">No, it's still not working</button>`)}`;
            }

            // Anchor ONLINE, no group gateway offline.
            // B9: if diverted from heating with a known offline zone, name the device instead of saying all is well.
            if (f.data.offlineZone) {
                return infoBox(`<b>${esc(f.data.offlineZone)}</b> — the thermostat in this area isn\'t connecting to us. The site itself is reachable.`) +
                    sayBox('The site is connecting to us, but the heating controller in that area isn\'t responding. This can be a temporary glitch, or the device may have lost power or its connection.', 'would you like our IoT team to look into it?') +
                    answers(`<button class="chip" data-testid="connectivity-zone-capture" onclick="flowStep({ofq:'cap'})">Yes, please</button>` +
                        `<button class="chip" data-testid="connectivity-zone-noact" onclick="flowStep({ofq:'noact'})">No, leave it</button>`);
            }
            return infoBox('Everything at this site is connecting to us, so the Lighthouse equipment looks healthy. If the customer says nothing is working, it may be a different fault.') +
                sayBox('Everything on our side is connecting normally at the moment.', 'what is still not working for you?') +
                answers(`<button class="chip" data-testid="connectivity-allok-continue" onclick="flowStep({ofq:'cap'})">They've told me; continue</button>`);
        }

        // ---- outcome stage ----
        if (f.data.ofq === 'back') {
            doneLine('The customer says it\'s back on', 'customer');
            return outcomeCaptured(f, 'back', {
                subject: 'Lighthouse gateway offline — restored on the call',
                detail: 'Gateway was offline; customer checked fuse board/power and it recovered. Logged for the IoT team to verify overnight stability.',
                script: res => 'That\'s it back on. Give it ten minutes to settle. It\'s logged, reference ' + dyn(res.ticket.id) + ', and our team checks the next working day that it stayed connected.',
                OohCaptureClass: 'connectivity'
            });
        }
        // B9: zone-specific "no action" when diverted from heating and customer declines to log
        if (f.data.ofq === 'noact') {
            doneLine('The customer doesn\'t want it logged', 'customer');
            return outcomeNoAction(f, 'zone-noact', {
                subject: 'Heating thermostat not responding — no action taken',
                detail: `Thermostat in ${f.data.offlineZone ? esc(f.data.offlineZone) : 'area'} not responding. Customer declined to log it.`,
                script: res => 'No problem. It\'s noted on the call record, reference ' + dyn(res.ticket.id) + '. If it\'s still not working, give us a call back.'
            });
        }
        // OOHDASH-146 B24: riskQuestion added to gcap, dcap, and cap paths.
        // Group-offline capture (anchor up): carries the group context; no remote action possible.
        if (f.data.ofq === 'gcap') {
            const plain = offlineGroups.map(equipmentGroupLabel);
            const labelStr = grammaticalList(plain);
            const multi = plain.length > 1;
            return riskQuestion(f, {
                yes: () => outcomeP1(f, 'gcap-p1', {
                    subject: 'Equipment group gateway offline — risk to trade or health and safety — P1',
                    detail: `Site reachable, but the ${labelStr} equipment group gateway${multi ? 's are' : ' is'} offline; that equipment cannot be reached remotely. Customer indicated immediate risk to trade or health and safety.`,
                    pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                    script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                }),
                no: () => outcomeCaptured(f, 'gcap', {
                    subject: `Equipment group gateway offline — ${labelStr} unreachable`,
                    detail: `Site reachable, but the ${labelStr} equipment group gateway${multi ? 's are' : ' is'} offline; that equipment cannot be reached remotely. No remote action possible; needs IoT connectivity investigation${f.data.from ? ` (raised from ${f.data.from} flow)` : ''}.`,
                    script: res => 'I can\'t reach that equipment from here tonight. It\'s logged, reference ' + dyn(res.ticket.id) + ', and our IoT team picks it up the next working day.',
                    OohCaptureClass: 'connectivity'
                })
            });
        }
        // Gateway-less capture: per-device unreachable at a direct-connection site; NO gateway framing.
        if (f.data.ofq === 'dcap') {
            return riskQuestion(f, {
                yes: () => outcomeP1(f, 'dcap-p1', {
                    subject: 'Equipment unreachable — risk to trade or health and safety — P1',
                    detail: `This site uses direct device connections (no site hub). The equipment the customer reported is not responding on its own connection. Customer indicated immediate risk to trade or health and safety.`,
                    pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                    script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                }),
                no: () => outcomeCaptured(f, 'dcap', {
                    subject: 'Equipment unreachable — direct-connection site',
                    detail: `This site uses direct device connections (no site hub). The equipment the customer reported is not responding on its own connection. No remote action possible; needs IoT connectivity investigation${f.data.from ? ` (raised from ${f.data.from} flow)` : ''}.`,
                    script: res => 'I can\'t reach that equipment from here tonight. It\'s logged, reference ' + dyn(res.ticket.id) + ', and our IoT team picks it up the next working day.',
                    OohCaptureClass: 'connectivity'
                })
            });
        }
        return riskQuestion(f, {
            yes: () => outcomeP1(f, 'cap-p1', {
                subject: 'Lighthouse gateway offline — risk to trade or health and safety — P1',
                detail: `Equipment unreachable after on-site power/router checks. Customer indicated immediate risk to trade or health and safety.`,
                pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
            }),
            no: () => outcomeCaptured(f, 'cap', {
                subject: 'Lighthouse gateway / equipment offline',
                detail: `Equipment unreachable after on-site power/router checks. No remote action possible; needs IoT connectivity investigation${f.data.from ? ` (raised from ${f.data.from} flow)` : ''}.`,
                script: res => 'I can\'t fix that from here while the Lighthouse unit is offline. It\'s logged, reference ' + dyn(res.ticket.id) + ', and our IoT team picks it up the next working day. Anything electrical, like a tripped switch that won\'t reset, is one for your own electrician tonight.',
                OohCaptureClass: 'connectivity'
            })
        });
    },

    contractor(ws, f) {
        if (f.stage === 0) {
            return `<div class="alert warn"><b>Contractor on site</b> — an engineer is waiting. Capture the details below, then the question determines how to raise this.</div>
   <div class="formrow"><label>Contractor / company</label><input id="cn" data-testid="contractor-name" placeholder="e.g. the attending engineer\'s name and company"></div>
   <div class="formrow"><label>What do they need?</label><input id="cw" data-testid="contractor-need" placeholder="e.g. needs BMS access to the heating"></div>
   <div class="chips"><button class="chip" data-testid="contractor-next" onclick="flowStep({cn:document.getElementById('cn').value||'(name not given)',cw:document.getElementById('cw').value||'(not specified)'})">Continue</button></div>`;
        }
        // Stage 1: PowerPause guidance branch (OOHDASH-118 F5)
        if (f.stage === 1 && !f.data.ppguidance) {
            if (!f.data._cline) { doneLine('Contractor: ' + esc(f.data.cn) + ', needs ' + esc(String(f.data.cw).replace(/^needs\s+/i, '')), 'customer'); f.data._cline = 1; }
            return `${sayBox('', 'does the engineer need help with the PowerPause override?')}
   ${answers(`<button class="chip" data-testid="contractor-pp-yes" onclick="flowStep({ppguidance:'yes'})">Yes, the override</button>
    <button class="chip" data-testid="contractor-pp-no" onclick="flowStep({ppguidance:'no'})">No, something else</button>`)}`;
        }
        // No path: B19 universal risk question then P1 or next-working-day ticket
        if (f.data.ppguidance === 'no') {
            return riskQuestion(f, {
                yes: () => outcomeP1(f, 'p1', {
                    subject: 'Contractor on site — risk to trade or health and safety — P1',
                    detail: `Contractor ${f.data.cn} on site now: ${f.data.cw}. Immediate risk to trade or health and safety. Escalated immediately.`,
                    pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                    script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly. Please ask the engineer to hold on.'
                }),
                no: () => outcomeCaptured(f, 'p1no', {
                    subject: 'Contractor on site — no immediate risk',
                    detail: `Contractor ${f.data.cn} on site: ${f.data.cw}. No immediate risk to trade or health and safety. Logged for the IoT team.`,
                    script: res => 'Thanks. It\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day and will be in touch.',
                    OohCaptureClass: 'general'
                })
            });
        }
        // Yes path: site 6786 (Donkey Derby) exception
        const isDonkeyDerby = Number(ws.site.siteNo) === 6786;
        if (f.data.ppguidance === 'yes' && isDonkeyDerby) {
            if (!f.data._ddline) { doneLine('The override doesn\'t work at this site (Donkey Derby)', 'check'); f.data._ddline = 1; }
            return infoBox('<b>Donkey Derby (site 6786): the override on site doesn\'t work here.</b> This site uses a different type of panel, so the override button does not apply.') +
                sayBox(`I\'m sorry, this site can\'t be overridden on site. The IoT team\'s direct line is <b>023 814 0228</b>, email <b>iot@airedale-group.co.uk</b>.`) +
                riskQuestion(f, {
                    yes: () => outcomeP1(f, 'ppesc', {
                        subject: 'Contractor on site (Donkey Derby), override unavailable — risk to trade or health and safety — P1',
                        detail: `Contractor ${f.data.cn} on site at Donkey Derby (6786). Local PowerPause override not available at this site. Immediate risk to trade or health and safety. Escalated to IoT team.`,
                        pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                        script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly. The IoT team\'s direct line is 023 814 0228.',
                        OohCaptureClass: 'kitchen-powerpause'
                    }),
                    no: () => outcomeCaptured(f, 'ppescno', {
                        subject: 'Contractor on site — no immediate risk',
                        detail: `Contractor ${f.data.cn} on site at Donkey Derby (6786). Override unavailable; no immediate risk to trade or health and safety. Logged for the IoT team.`,
                        script: res => 'Thanks. It\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day and will be in touch.',
                        OohCaptureClass: 'kitchen-powerpause'
                    })
                });
        }
        // Yes path: standard sites — device-type picker then override instruction
        if (f.data.ppguidance === 'yes' && !f.data.pptype) {
            return `${infoBox('Read this to the engineer. The guide has photos of the panels and both buttons.<div style="margin-top:6px">' + guideLink() + '</div>')}
  ${sayBox(`<p><b>Step 1: find the panel.</b> The PowerPause panel is usually by the kitchen distribution boards, behind the appliance, or on the ceiling. Every appliance we control has a Lighthouse label.</p>
   <p><b>Step 2: check the device.</b> The unit will say either <b>Tongou</b> or <b>Owon</b>.</p>`, 'which does it say?')}
  ${answers(`<button class="chip" data-testid="contractor-pp-tongou" onclick="flowStep({pptype:'tongou'})">Tongou</button>
   <button class="chip" data-testid="contractor-pp-owon" onclick="flowStep({pptype:'owon'})">Owon</button>`)}`;
        }
        // Device type confirmed: show override instruction then log chip
        if (f.data.pptype && !f.data.ppdone) {
            const devLabel = f.data.pptype === 'tongou' ? 'Tongou' : 'Owon';
            return `${sayBox(`<p><b>${devLabel} override:</b> press the override button on the ${devLabel} unit <b>once</b>. Please don\'t hold it down; holding it takes the circuit off the system. For fryers and heated gantries, also press the green start button on the interlock panel.</p>
   <p>The override stays on until the next timetable change. It is logged and monitored, and our team checks it automatically the next working day.</p>`, 'has the equipment come on?')}
  ${infoBox(`This is a temporary override only. The ${devLabel} device goes back to its normal timetable at the next change.<div style="margin-top:6px">` + guideLink() + `</div>`)}
  ${answers(`<button class="chip" data-testid="contractor-pp-done" onclick="flowStep({ppdone:'ok'})">Yes, it's come on</button><button class="chip" data-testid="contractor-pp-fail" onclick="flowStep({ppdone:'fail'})">No, it hasn't come on</button>`)}`;
        }
        // rev 5 (J1): the override worked → no P1, the record goes to the IoT team for the next working day.
        if (f.data.ppdone === 'ok' || f.data.ppdone === 1) {
            doneLine('The engineer used the override and it came on', 'customer');
            return outcomeCaptured(f, 'ppdone', {
                subject: 'PowerPause override used by contractor on site',
                detail: `Contractor ${f.data.cn} used the PowerPause override (${f.data.pptype} device) and the equipment came on. Override active until the next timetable change; monitored.`,
                script: res => 'Great. The override stays on until the next timetable change. It\'s logged, reference ' + dyn(res.ticket.id) + ', and our team checks it automatically the next working day.',
                OohCaptureClass: 'kitchen-powerpause'
            });
        }
        // The override didn't work → risk question then P1 or next-working-day ticket.
        if (f.data.ppdone === 'fail') {
            doneLine('The engineer used the override and it didn\'t come on', 'customer');
            return riskQuestion(f, {
                yes: () => outcomeP1(f, 'ppfail', {
                    subject: 'Contractor on site, PowerPause override failed — risk to trade or health and safety — P1',
                    detail: `Contractor ${f.data.cn} on site used the PowerPause override (${f.data.pptype} device) and the equipment did not come on. Immediate risk to trade or health and safety. Needs immediate IoT action.`,
                    pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                    script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly. Please ask the engineer to hold on.',
                    OohCaptureClass: 'kitchen-powerpause'
                }),
                no: () => outcomeCaptured(f, 'ppfailno', {
                    subject: 'Contractor on site — no immediate risk',
                    detail: `Contractor ${f.data.cn} on site: PowerPause override (${f.data.pptype}) did not bring equipment on. No immediate risk to trade or health and safety. Logged for IoT team.`,
                    script: res => 'Thanks. It\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day and will be in touch.',
                    OohCaptureClass: 'kitchen-powerpause'
                })
            });
        }
        // Fallback: should not be reached in normal flow
        if (!f.data._cline) { doneLine('Contractor: ' + esc(f.data.cn) + ', needs ' + esc(String(f.data.cw).replace(/^needs\s+/i, '')), 'customer'); f.data._cline = 1; }
        return riskQuestion(f, {
            yes: () => outcomeP1(f, 'p1', {
                subject: 'Contractor on site — risk to trade or health and safety — P1',
                detail: `Contractor ${f.data.cn} on site now: ${f.data.cw}. Escalated immediately.`,
                pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly. Please ask the engineer to hold on.'
            }),
            no: () => outcomeCaptured(f, 'p1no', {
                subject: 'Contractor on site — no immediate risk',
                detail: `Contractor ${f.data.cn} on site: ${f.data.cw}. No immediate risk to trade or health and safety.`,
                script: res => 'Thanks. It\'s logged, reference ' + dyn(res.ticket.id) + '. Our IoT team picks it up the next working day.',
                OohCaptureClass: 'general'
            })
        });
    },
    other(ws, f) {
        // OOHDASH-146 B2: single Continue button at stage 0; scope chips + None-of-these at stage 1.
        if (f.stage === 0) {
            return `${sayBox('', 'what\'s the problem? (Type it in their words.)')}
   <div class="formrow"><textarea id="otxt" data-testid="other-text" rows="2" placeholder="e.g. the voltage optimiser needs resetting — is that you?">${esc(f.data.freeText || '')}</textarea></div>
   <div class="chips">
    <button class="chip" data-testid="other-continue" onclick="flowStep({q:document.getElementById('otxt').value||'(not specified)'})">Continue</button>
   </div>`;
        }
        if (f.stage === 1) {
            if (!f.data._oline) {
                // The typed words are already the first line when they match the smart-entry text.
                if (String(f.data.q || '').trim() !== String(f.data.freeText || '').trim()) doneLine('The customer says: "' + esc(f.data.q) + '"', 'customer');
                f.data._oline = 1;
            }
            // B19: replaced otherP1Choice with the universal risk question.
            if (f.data.path === 'cap') return riskQuestion(f, {
                yes: () => outcomeP1(f, 'p1', {
                    subject: 'Something else — risk to trade or health and safety — P1',
                    detail: `Customer reported: ${f.data.q}. Did not fit a specific tile; immediate risk to trade or health and safety.`,
                    pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                    script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                }),
                no: () => outcomeCaptured(f, 'cap', {
                    subject: 'Something else — no immediate risk',
                    detail: `Customer reported: ${f.data.q}. No immediate risk to trade or health and safety. Passed verbatim for the IoT team.`,
                    script: res => 'I\'ve passed exactly what you\'ve described to our IoT team, reference ' + dyn(res.ticket.id) + '. They pick it up the next working day.',
                    OohCaptureClass: 'general'
                })
            });
            return `<div class="stepq agentq">Which of these is it closest to?</div><div class="chips">
    ${state.workspace.scope.map(g => `<button class="chip" data-testid="scope-${g.key}" onclick="flowStep({g:'${g.key}'})">${esc(g.label)}</button>`).join('')}
    <button class="chip" data-testid="scope-none-of-these" onclick="state.flow.data.path='cap';render()">None of these</button></div>
   <p class="small" style="margin-top:8px">This checks the live device inventory for <b>this site</b> — it can say with certainty what is and isn\'t on Lighthouse here. What it can\'t always settle is a fault <i>inside</i> shared kit (e.g. the boiler behind our controls).</p>`;
        }
        if (f.stage === 2) {
            const g0 = state.workspace.scope.find(x => x.key === f.data.g);
            // OOHDASH-159 rev 4: 'offline' / 'unreachable' rows are present but can't be reached → treat as monitored.
            const g = g0 && (g0.level === 'offline' || g0.level === 'unreachable') ? { ...g0, level: 'mon', reach: g0.level } : g0;
            if (!f.data._gline) {
                const reachTxt = g.reach === 'unreachable' ? ' (can\'t be reached right now)' : g.reach === 'offline' ? ' (not responding right now)' : '';
                doneLine(esc(g.label) + ': ' + (g.level === 'ctl' ? 'controlled from here' : g.level === 'mon' ? 'monitored only' + reachTxt : 'not on Lighthouse here'), 'check');
                f.data._gline = 1;
            }
            // OOHDASH-146 B2: ctl → startFlow that issue's own flow; mon/none → riskQuestion.
            if (g.level === 'ctl') return infoBox(`<b>${esc(g.label)} is controlled by Lighthouse at this site.</b> Use the flow for ${esc(g.label.toLowerCase())} to handle it.`) +
                `<div class="chips"><button class="chip" data-testid="scope-ctl-start" onclick="startFlow('${g.key}', state.flow.data.q||'', {carryNotes:true})">Start the ${esc(g.label)} flow</button></div>`;
            if (g.level === 'mon') {
                return riskQuestion(f, {
                    yes: () => outcomeP1(f, 'mon-p1', {
                        subject: `${g.label} — monitored only — risk to trade or health and safety — P1`,
                        detail: `${g.label} is monitored by Lighthouse at this site but not remotely controllable. Customer\'s issue: ${f.data.q}. Customer indicated immediate risk to trade or health and safety.`,
                        pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                        script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                    }),
                    no: () => outcomeScope(f, 'mon', {
                        subject: `${g.label} — monitored only`,
                        evidence: `${g.label} is monitored by Lighthouse at this site but not remotely controllable. Customer\'s issue: ${f.data.q}`,
                        script: res => 'Lighthouse watches that here but doesn\'t control it from here. I\'ve noted your request on your site\'s record, reference ' + dyn(res.ticket.id) + '.'
                    })
                });
            }
            return riskQuestion(f, {
                yes: () => outcomeP1(f, 'none-p1', {
                    subject: `${g.label} — not on Lighthouse — risk to trade or health and safety — P1`,
                    detail: `Live inventory shows no Lighthouse ${g.label.toLowerCase()} devices at ${state.workspace.site.siteName}. Customer\'s issue: ${f.data.q}. Customer indicated immediate risk to trade or health and safety.`,
                    pre: sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team."),
                    script: res => 'That\'s raised as urgent, reference ' + dyn(res.ticket.id) + '. Someone from our on-call team will call you back shortly.'
                }),
                no: () => outcomeScope(f, 'none', {
                    subject: `${g.label} — not on Lighthouse at this site`,
                    evidence: `Live inventory shows no Lighthouse ${g.label.toLowerCase()} devices at ${state.workspace.site.siteName}. Customer\'s issue: ${f.data.q}`,
                    script: res => 'That isn\'t part of the Lighthouse system at your site, so please contact your service contractor through your usual route. I\'ve noted the call on your site\'s record, reference ' + dyn(res.ticket.id) + '.'
                })
            });
        }
        return '';
    }
};
