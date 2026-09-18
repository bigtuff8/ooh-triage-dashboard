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
const HIDDENCATS = [{ k: 'connectivity', ic: '📡', t: 'Connection check', d: 'Lighthouse gateway / equipment not responding' }];
const KEYWORDS = [
    { k: 'hotwater', words: ['hot water', 'no water', 'shower', 'tap', 'washing up', 'wash up'] },
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
function startFlow(k, freeText) {
    state.flow = { cat: k, stage: 0, data: { freeText: freeText || '' }, done: [] };
    render();
}

function cancelFlow() {
    if (confirm('Cancel this issue? Anything recorded so far will still be captured to a ticket if a step was completed.')) {
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

function heatingZones() { return state.workspace.devices.filter(d => d.kind === 'heating'); }

function renderFlow() {
    const f = state.flow;
    const c = catOf(f.cat);
    let body = '';
    if (f.stage === 99 && f.data._outcomeHtml) body = f.data._outcomeHtml;
    else {
        try { body = FLOWR[f.cat](state.workspace, f); }
        catch (e) { body = `<div class="alert err">Flow error: ${esc(e.message)}</div>`; }
    }
    return `<div class="flowpanel" data-testid="flow-panel">
  <div class="flowhead"><span style="font-size:18px">${c.ic}</span><b>${c.t}</b><span class="small" style="margin-left:6px">guided flow</span><button class="btn link" style="margin-left:auto" onclick="cancelFlow()">Cancel issue</button></div>
  <div class="flowbody">${f.data.freeText ? `<div class="stepdone"><span>💬</span>Caller’s words: “${esc(f.data.freeText)}”</div>` : ''}${f.done.map(d => `<div class="stepdone"><span class="tick">✓</span>${d}</div>`).join('')}${body}</div>
  <div class="flowfoot"><span>Operator: <b>${esc(state.me.operator.name)}</b></span><span style="margin-left:auto">Everything here is recorded to the Zendesk ticket automatically</span></div>
 </div>`;
}

/* ------------------------ outcome plumbing (async → ticket) ------------------------ */
function outButtons() {
    return `<div class="outbtns"><button class="btn" data-testid="add-another-issue" onclick="anotherIssue()">➕ Add another issue</button><button class="btn primary" data-testid="end-call" onclick="endCall()">✔ End call</button></div>`;
}

function anotherIssue() { state.flow = null; render(); }

function registerIssue(label, cls, ticketId) {
    if (state.call) state.call.issues.push({ label, cls, ticket: ticketId });
}

/**
 * Records an outcome to the server (ticket + audit) exactly once per flow key, then
 * swaps in the final outcome card. Failure renders inline with a manual retry —
 * never a silent drop, never an auto-retry loop.
 */
function finishOutcome(f, key, payload, renderCard) {
    if (f.data['_out_' + key]) return f.data['_out_' + key];
    if (f.data['_err_' + key]) {
        const msg = f.data['_err_' + key];
        return `<div class="alert err">Couldn’t record the outcome: ${esc(msg)}
   <button class="chip" style="margin-left:8px" onclick="state.flow.data['_err_${key}']=null;state.flow.data['_pend_${key}']=null;render()">Try again</button></div>`;
    }
    if (!f.data['_pend_' + key]) {
        f.data['_pend_' + key] = 1;
        const ws = state.workspace;
        api.post('/api/outcomes', {
            siteNo: ws.site.siteNo,
            siteName: ws.site.siteName,
            callerWords: f.data.freeText || null,
            ...payload
        }).then(res => {
            // Test 10 (D-10a) — echo the handler's typed words on the outcome card, so note
            // retention is verifiable at their own screen, not only trusted to the back office.
            // Rendered once here so all four outcome card types inherit it; nothing shown when
            // no words were typed (a legitimate tile-without-typing path) — never an empty quote.
            const echo = f.data.freeText
                ? `<div class="stepdone small" data-testid="outcome-callerwords"><span>💬</span>Recorded from the caller: “${esc(f.data.freeText)}”</div>`
                : '';
            const html = echo + renderCard(res) + outButtons();
            f.data['_out_' + key] = html;
            registerIssue(payload.issueLabel || payload.subject, payload.issueCls || 'blue', res.ticket.id);
            f.stage = 99;
            f.data._outcomeHtml = html;
            render();
        }).catch(err => {
            f.data['_err_' + key] = err.message;
            f.data['_pend_' + key] = null;
            render();
        });
    }
    return '<div class="alert info">Recording the outcome…</div>';
}

function outcomeCaptured(f, key, { subject, detail, script, OohCaptureClass }) {
    return finishOutcome(f, key,
        { type: 'capture', subject, detail, OohCaptureClass, issueLabel: subject, issueCls: 'blue' },
        res => `<div class="outcome captured" data-testid="outcome-captured"><h3>📥 Captured for the IoT team</h3><p>${detail}</p>
  <p style="margin-top:4px">This will be actioned on the <b>next working day</b> — it is logged, not lost.</p>
  <div class="script">“${script}”</div><p class="small">Ticket <b>#${res.ticket.id}</b></p></div>`);
}

function outcomeP1(f, key, { subject, detail, script, p1Summary }) {
    return finishOutcome(f, key,
        { type: 'escalate-p1', subject, detail, p1Summary, issueLabel: subject, issueCls: 'red' },
        res => `<div class="outcome p1" data-testid="outcome-p1"><h3>🚨 Escalated — P1</h3><p>${detail}</p>
  <p style="margin-top:4px" data-testid="p1-dispatch-status">${res.p1 && res.p1.dispatchOk
      ? `A <b>text message</b> has been sent to the <b>on-duty escalation manager</b> at ${esc(new Date(res.p1.dispatchedAt || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}, with a direct link to ticket <b>#${res.ticket.id}</b> in the IoT Support dashboard.`
      : `<span class="tag red">Text not sent — phone the on-duty manager now.</span> The P1 is logged as ticket <b>#${res.ticket.id}</b> in the IoT Support dashboard.`}</p>
  <div class="script">“${script}”</div><p class="small">Ticket <b>#${res.ticket.id}</b></p></div>`);
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
    return `<div class="chips" style="margin-top:8px"><button class="chip" onclick="startFlow('other')">Continue under “Something else”</button></div>`;
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

/* ------------------------ flow renderers ------------------------ */
const FLOWR = {
    heating(ws, f) {
        const zones = heatingZones();
        if (f.stage === 0) {
            if (!zones.length) return '<div class="alert warn">No heating on Lighthouse at this site.</div>' + otherShortcut();
            return `<div class="stepq">Which area is the caller talking about?</div><div class="chips">${zones.map((z, i) =>
                `<button class="chip" data-testid="zone-${i}" onclick="flowStep({zi:${i}})">${esc(z.zone)}</button>`).join('')}</div>`;
        }
        const z = zones[f.data.zi];
        const t = z.telemetry || {};
        const temp = typeof t.localTemperature === 'number' ? t.localTemperature : (typeof t.roomSensor1Temp === 'number' ? t.roomSensor1Temp : null);
        const sp = t.heatingSetpoint;
        if (f.stage === 1) {
            doneLine(`Area: <b>${esc(z.zone)}</b>`);
            if (!z.online) { doneLine('Live read: <b>device offline</b>'); f.cat = 'connectivity'; f.stage = 0; f.data.from = 'heating'; return FLOWR.connectivity(ws, f); }
            const read = `<div class="zoneread"><span class="t">${temp != null ? temp + '°C' : '—'}</span><div><div>${sp != null ? `Setpoint <b>${sp}°C</b>` : ''}${t.mode ? ' · mode <b>' + esc(t.mode) + '</b>' : ''}</div><div class="small">${esc(z.deviceId)} · ${z.deviceType === 'boiler-panel' ? 'pub boiler panel' : 'live read just now'}</div></div><span class="tag green">online</span></div>`;
            if (z.deviceType === 'boiler-panel') {
                doneLine(`Live read: ${temp != null ? temp + '°C' : 'no reading'} · pub boiler panel`);
                return read + `<div class="reco" data-testid="reco-boiler-panel"><b class="hd">This zone can’t be adjusted remotely yet.</b>It runs on the pub’s boiler control panel, which isn’t connected for remote changes (it’s on the priority list with our platform team).<div class="outbtns"><button class="btn primary" onclick="flowStep({need:'bp'})">Capture &amp; escalate for the IoT team</button><button class="btn" onclick="flowStep({need:'noact'})">End with no action</button></div></div>`;
            }
            return read + `<div class="stepq">What does the caller need?</div><div class="chips">
    <button class="chip" data-testid="need-warm" onclick="flowStep({need:'warm'})">Warmer</button>
    <button class="chip" data-testid="need-cool" onclick="flowStep({need:'cool'})">Cooler</button>
    <button class="chip" data-testid="need-off" onclick="flowStep({need:'off'})">Turn it off</button>
    <button class="chip" data-testid="need-broken" onclick="flowStep({need:'broken'})">It’s not working</button></div>`;
        }
        if (f.stage === 2) {
            const need = f.data.need;
            if (need === 'bp') {
                return outcomeCaptured(f, 'bp', {
                    subject: `Pub heating change requested (${z.zone})`,
                    detail: `Caller asked for a pub heating adjustment; boiler-panel control isn’t available remotely yet. Logged with the reading ${temp != null ? temp + '°C' : 'n/a'}. (SR-4① pressure recorded.)`,
                    script: 'I’ve logged this for the IoT team — pub heating on this site can’t be adjusted remotely yet, so they’ll pick this up as a priority.',
                    OohCaptureClass: 'boiler-panel-heating'
                });
            }
            if (need === 'noact') {
                return outcomeNoAction(f, 'noact', {
                    subject: 'Pub heating query — no action possible tonight',
                    detail: 'Caller asked about pub boiler-panel heating; no remote control path exists tonight and the caller declined a follow-up. Call recorded for the audit trail.',
                    script: ''
                });
            }
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
                // D10 SAFETY: Intesis on/off via modeDesired is HELD in v1 — the bridge treats any
                // non-'off' mode as ON and the bench unit gave NO modeSyncStatus, so a "turn off" we
                // can't confirm is unsafe. Redirect the Intesis off request to capture-and-escalate
                // rather than firing an unconfirmable mode write.
                if (z.deviceType === 'intesis') {
                    doneLine('Intesis off — mode control held (unconfirmable); captured');
                    return outcomeCaptured(f, 'intesisoff', {
                        subject: `AC turn-off requested (${z.zone})`,
                        detail: `Caller asked to turn off the Intesis AC in ${z.zone}. Remote on/off for this unit isn’t confirmable yet (mode control held), so it’s captured for the IoT team rather than fired unconfirmed. Live read ${temp != null ? temp + '°C' : 'n/a'}${sp != null ? `, setpoint ${sp}°C` : ''}.`,
                        script: 'I can’t safely switch that AC off remotely tonight because the unit doesn’t confirm the change back — so rather than tell you it’s done when it might not be, I’ve logged it as a priority for the IoT team. If there’s an on-site controller you can use that in the meantime.',
                        OohCaptureClass: 'intesis-off-held'
                    });
                }
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

    hotwater(ws, f) {
        // Presence-driven: a controllable DHW device is one whose registry
        // capabilities actually expose a hot-water boost command — NOT a name-match
        // on `salus-it500-dhw` (live bridge data never emits it, bridge.js:57-67).
        // Out-of-scope is the DETERMINISTIC R1 default; the boost/compose affordance
        // only appears if live inventory genuinely carries a controllable DHW device
        // (R7-ready: flips on presence with no code change).
        const dhw = ws.devices.find(d => (d.capabilities || []).includes('hwboost'));
        if (f.stage === 0) {
            if (!dhw) {
                doneLine('Hot water not controllable here — capture & escalate');
                return `<div class="alert info">Hot water is not controllable from here — it’s boiler-side, not on a boostable Lighthouse device. Capture the details and escalate.</div><div class="chips"><button class="chip" onclick="flowStep({cap:1})">Capture &amp; escalate</button><button class="chip" onclick="flowStep({sc:1})">Scope guidance (boiler fault?)</button></div>`;
            }
            if (!dhw.online) { f.cat = 'connectivity'; f.stage = 0; return FLOWR.connectivity(ws, f); }
            const boost = dhw.telemetry?.hwBoostHours || 0;
            doneLine(`Live read: hot-water unit online${boost ? ' · boost ' + boost + 'h active' : ''}`);
            return `<div class="zoneread"><span style="font-size:22px">🚿</span><div><div><b>${esc(dhw.deviceId)}</b> — online${boost ? ', boost ' + boost + 'h already running' : ''}</div><div class="small">Salus IT500 hot-water unit</div></div><span class="tag green">online</span></div>
   <div class="stepq">Boost the hot water now?</div><div class="chips"><button class="chip" data-testid="hw-boost-yes" onclick="flowStep({boost:1})">Yes — set a boost</button><button class="chip" onclick="flowStep({cap:1})">No — capture &amp; escalate</button></div>`;
        }
        if (f.stage === 1) {
            const dhwDev = ws.devices.find(d => (d.capabilities || []).includes('hwboost'));
            // Presence-guarded: the compose/boost path is reachable ONLY when a genuinely
            // controllable DHW device is present. Without one, a boost intent falls through
            // to the deterministic capture-and-escalate default (never openControl on nothing).
            if (f.data.boost && dhwDev) { openControl(dhwDev, 'boost'); return ctlPlaceholder(); }
            if (f.data.cap || f.data.boost) {
                doneLine('Outcome: captured');
                return outcomeCaptured(f, 'cap', {
                    subject: 'Hot water issue — not resolvable remotely tonight',
                    detail: `Caller reports hot-water problems${dhwDev ? ' beyond what a boost resolves' : ' and no boostable device exists here'}. Needs IoT/boiler-side investigation.`,
                    script: 'I’ve logged this for the IoT team as a priority for the morning. If it’s urgent overnight the boiler’s own override panel may help — and if a boiler engineer attends, remember a visit can be chargeable if the fault isn’t Lighthouse equipment.',
                    OohCaptureClass: 'hot-water'
                });
            }
            if (f.data.sc) {
                return outcomeScope(f, 'sc', {
                    subject: 'Hot water — likely boiler fault',
                    evidence: 'Lighthouse monitors demand here; the boiler itself (pressure, PCB, pilot) is not Lighthouse equipment.',
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
            const off = ks.some(k => !k.online);
            doneLine('Live read: ' + ks.map(k => `${esc(k.zone.replace('Kitchen — ', ''))} <b>${k.online ? (k.telemetry?.switch_1 ? 'On' : 'Off — schedule ' + (k.schedule || 'unknown')) : 'OFFLINE'}</b>`).join(' · '));
            if (off) { f.cat = 'connectivity'; f.stage = 0; return FLOWR.connectivity(ws, f); }
            // D10: per-circuit Turn ON/OFF when the device is switch-capable + online + registered.
            // Otherwise the circuit falls back to the capture path (unchanged) — capture is never lost.
            const anySwitch = ks.some(k => canSwitch(k));
            const rows = ks.map((k, i) => `<div class="zoneread"><span style="font-size:20px">🍳</span><div><div><b>${esc(k.zone)}</b> — ${k.telemetry?.switch_1 ? 'currently ON' : 'currently OFF'}</div><div class="small">${k.schedule ? 'Schedule ' + esc(k.schedule) + ' · ' : ''}${esc(k.deviceId)}</div></div>${switchButtons(k, `kitchen-switch-${i}`)}<span class="tag ${k.telemetry?.switch_1 ? 'green' : 'grey'}">${k.telemetry?.switch_1 ? 'on' : 'off'}</span></div>`).join('');
            return rows +
                `<div class="alert info">${anySwitch ? 'Switchable circuits can be turned on/off directly above — the change only counts once the device confirms. ' : 'Kitchen circuits can’t be switched remotely from here yet (that control path is on the priority list with our platform team). '}If it’s simply outside the schedule window, the schedule explains it — otherwise capture it.</div>
   <div class="stepq">Is the kitchen needed for service <b>right now</b> (food being served / hotel breakfast)?</div>
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
        const lg = ws.devices.find(d => d.kind === 'lighting');
        if (f.stage === 0) {
            doneLine('Live read: external lighting ' + (lg ? (lg.online ? 'device online' : 'device NOT responding') : 'not on Lighthouse here'));
            if (!lg) return '<div class="alert info">External lighting at this site isn’t on Lighthouse.</div>' + otherShortcut();
            const lgSwitch = canSwitch(lg)
                ? `<div class="zoneread"><span style="font-size:20px">💡</span><div><div><b>${esc(lg.zone)}</b> — ${lg.telemetry?.switch_1 ? 'currently ON' : 'currently OFF'}</div><div class="small">${esc(lg.deviceId)}</div></div>${switchButtons(lg, 'lighting-switch')}<span class="tag ${lg.telemetry?.switch_1 ? 'green' : 'grey'}">${lg.telemetry?.switch_1 ? 'on' : 'off'}</span></div>`
                : '';
            return lgSwitch + `<div class="alert info">${canSwitch(lg) ? 'This lighting circuit can be switched on/off directly above — the change only counts once the device confirms.' : `External lighting can’t be switched remotely from here yet (on the priority list with our platform team).${lg.online ? '' : ' The lighting controller is also <b>not responding</b>, which often means a tripped fuse board.'}`}</div>
   <div class="script">“There’s a manual override for the outside lights${lg.online ? '' : ' — but first it’s worth checking your fuse board, because the lighting controller isn’t responding'}. If you have the Lighthouse lighting switch, flick it to override and they’ll come on.”</div>
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
            return outcomeCaptured(f, 'cap', {
                subject: 'External lighting not working',
                detail: 'Manual override did not resolve; possible tripped supply or failed controller. Needs IoT/electrical follow-up.',
                script: 'I’ve logged this for the IoT team to investigate first thing. If the pub frontage being dark is a safety concern tonight, your own electrician or duty manager procedure applies — this may be an electrical supply issue rather than the lighting control.',
                OohCaptureClass: 'lighting'
            });
        }
        return '';
    },

    fan(ws, f) {
        const fan = ws.devices.find(d => d.kind === 'fan');
        if (f.stage === 0) {
            doneLine('Live read: extractor fans ' + (fan ? (fan.online ? 'controller online' : 'controller NOT responding') : 'not on Lighthouse here'));
            if (!fan) return '<div class="alert info">Extractor fans at this site aren’t on Lighthouse.</div>' + otherShortcut();
            const fanSwitch = canSwitch(fan)
                ? `<div class="zoneread"><span style="font-size:20px">🌀</span><div><div><b>${esc(fan.zone)}</b> — ${fan.telemetry?.switch_1 ? 'currently ON' : 'currently OFF'}</div><div class="small">${esc(fan.deviceId)}</div></div>${switchButtons(fan, 'fan-switch')}<span class="tag ${fan.telemetry?.switch_1 ? 'green' : 'grey'}">${fan.telemetry?.switch_1 ? 'on' : 'off'}</span></div>`
                : '';
            if (canSwitch(fan)) return fanSwitch + `<div class="alert info">This fan circuit can be switched on/off directly above — the change only counts once the device confirms. If the caller needs a schedule change instead, capture it below.</div>
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
        const gw = ws.devices.find(d => d.kind === 'gateway');
        const off = ws.devices.filter(d => !d.online);
        if (!f.data.ofq) {
            if (!f.data._cline) {
                doneLine('Connection check: ' + (gw && !gw.online ? '<b>Lighthouse gateway OFFLINE</b>' : off.length ? off.length + ' device(s) offline' : 'all equipment online'));
                f.data._cline = 1;
            }
            if (gw && gw.online && !off.length) {
                return `<div class="alert ok">Everything at this site is showing <b>online</b> — the Lighthouse equipment looks healthy. If the caller says nothing is working, it may be a different fault.</div><div class="chips"><button class="chip" onclick="flowStep({ofq:'cap'})">Capture what the caller reports</button></div>`;
            }
            return `<div class="alert err" data-testid="connectivity-alert"><b>${gw && !gw.online ? 'The Lighthouse gateway at this site is offline.' : 'Some Lighthouse equipment is offline.'}</b> The gateway is the wall-mounted Lighthouse unit that connects the site — no remote command can reach the site while it’s down. This is usually power or internet at the site.</div>
   <div class="script">“The Lighthouse unit on your wall isn’t responding, which normally means it’s lost power or internet. Could you check the fuse board hasn’t tripped, that the unit has lights on, and the router is up? I’ll stay on the line.”</div>
   <div class="stepq">After the caller checks:</div>
   <div class="chips"><button class="chip" onclick="flowStep({ofq:'back'})">It’s back online / lights on</button><button class="chip" data-testid="connectivity-stilldead" onclick="flowStep({ofq:'cap'})">Still dead — capture &amp; escalate</button></div>`;
        }
        if (f.data.ofq === 'back') {
            doneLine('Site restored power/connection');
            return outcomeCaptured(f, 'back', {
                subject: 'Lighthouse gateway offline — restored on the call',
                detail: 'Gateway was offline; caller checked fuse board/power and it recovered. Logged for the IoT team to verify overnight stability.',
                script: 'That’s it back online. Give it ten minutes to settle — I’ve logged it so the team check it stayed healthy overnight.',
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
   <div class="chips"><button class="chip" data-testid="contractor-escalate" onclick="flowStep({cn:document.getElementById('cn').value||'(name not given)',cw:document.getElementById('cw').value||'(not specified)'})">Escalate now — P1</button></div>`;
        }
        doneLine('Contractor: ' + esc(f.data.cn) + ' — ' + esc(f.data.cw));
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
    <button class="chip" data-testid="other-capture" onclick="flowStep({q:document.getElementById('otxt').value||'(not specified)',path:'cap'})">Capture &amp; escalate as described</button>
   </div>`;
        }
        if (f.stage === 1) {
            if (!f.data._oline) { doneLine('Issue: “' + esc(f.data.q) + '”'); f.data._oline = 1; }
            if (f.data.path === 'cap') {
                return outcomeCaptured(f, 'cap', {
                    subject: 'General issue captured',
                    detail: `Caller reported: ${f.data.q}. Captured verbatim for the IoT team.`,
                    script: 'I’ve logged exactly what you’ve described for the IoT team — they’ll pick it up on the next working day. If it gets urgent tonight, ring back and we’ll escalate.',
                    OohCaptureClass: 'general'
                });
            }
            return `<div class="stepq">Which of these is it closest to?</div><div class="chips">
    ${state.workspace.scope.map(g => `<button class="chip" data-testid="scope-${g.key}" onclick="flowStep({g:'${g.key}'})">${esc(g.label)}</button>`).join('')}</div>
   <p class="small" style="margin-top:8px">This checks the live device inventory for <b>this site</b> — it can say with certainty what is and isn’t on Lighthouse here. What it can’t always settle is a fault <i>inside</i> shared kit (e.g. the boiler behind our controls).</p>`;
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
