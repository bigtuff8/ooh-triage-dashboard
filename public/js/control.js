/**
 * Control modal + three-outcome tracker (OOHDASH-123 Rosetta Stone; design §5, build plan WU6/WU9/WU11).
 *
 * The ONLY way a write happens — always from a flow, never freestanding. The dashboard writes a
 * *Requested key to SERVER_SCOPE; the device\'s OWN reading is what proves a change. Exactly three
 * outcomes are ever shown, and only CONFIRMED renders as success:
 *   CONFIRMED      — green: the device echoed the change in its own telemetry, after we sent.
 *   NOT DELIVERED  — red: a gate/vendor rejection, shown as a plain sentence (raw text on the ticket).
 *   NOT CONFIRMED  — amber: accepted-but-unproven at the per-vendor limit. Never "failed", never "done".
 *
 * DD-RESEND-UX (James override): NO resend. A not-confirmed command is never re-fired; the watcher keeps
 * watching and updates the ticket. There is no resend button and no "keep waiting" affordance.
 * DD-WAIT-HANDOFF: for slow (Salus) classes the handler is released at once ("about N minutes"); a
 * detached background watcher toasts the result and the server updates the ticket when it lands.
 */

window.ctl = null;
let ctlPollTimer = null;
let ctlBgTimer = null; // detached background watch for a released (slow) action — toasts the late result

const CTL_TITLES = { up: 'Raise setpoint', down: 'Lower setpoint', frost: 'Turn heating off (frost-hold)', modeoff: 'Turn off (mode)', switchon: 'Turn ON', switchoff: 'Turn OFF' };
const CTL_WHAT = { up: 'Setpoint raise', down: 'Setpoint lower', frost: 'Heating off (frost-hold)', modeoff: 'Heating off (mode)', switchon: 'Switch ON', switchoff: 'Switch OFF' };
const CTL_VERB = { up: 'raise the setpoint', down: 'lower the setpoint', frost: 'set a frost-hold', modeoff: 'turn off', switchon: 'switch on', switchoff: 'switch off' };
// The "not confirmed yet" sentence (mirrors services/errors.js NOT_CONFIRMED_MESSAGE).
const CTL_NOT_CONFIRMED = "We sent the command but the device hasn\'t confirmed it yet. It may still take effect — check again in a few minutes, or raise a ticket if it does not respond.";

function openControl(device, mode) {
    const blocked = writesDisabled(state.siteNo);
    if (blocked) {
        state.flow = null;
        openModal(`<div class="mh">Control unavailable<button class="btn link" onclick="closeModal()">✕</button></div><div class="mb"><div class="alert err" data-testid="control-blocked">⛔ ${blocked}.</div><p>Use <b>capture &amp; escalate</b> instead — the request will be logged and actioned by the IoT team.</p></div><div class="mf"><button class="btn primary" onclick="closeModal();render()">OK</button></div>`);
        return;
    }
    if (window.ctl) return; // already open
    const t = device.telemetry || {};
    window.ctl = { device, mode, phase: 'compose', error: null, action: null };
    const c = window.ctl;
    if (mode === 'up' || mode === 'down') c.val = (t.heatingSetpoint ?? 20) + (mode === 'up' ? 1 : -1) * (device.setpointWindow?.step ?? 0.5) * 2;
    if (mode === 'frost') c.val = 5;
    // D10 SAFETY: mode vocabulary is lowercase end-to-end — the bridge treats any non-'off' mode as ON.
    if (mode === 'modeoff') c.val = 'off';
    if (mode === 'switchon') c.val = true;
    if (mode === 'switchoff') c.val = false;
    c.hold = (mode === 'frost') ? '07:00' : 'none';
    clampCtlVal();
    drawControl();
}

function clampCtlVal() {
    const c = window.ctl;
    if ((c.mode === 'up' || c.mode === 'down') && c.device.setpointWindow) {
        c.val = Math.min(c.device.setpointWindow.max, Math.max(c.device.setpointWindow.min, c.val));
        c.val = Math.round(c.val * 10) / 10;
    }
}

function holdRevertAt(hold) {
    if (hold === '4h') return new Date(Date.now() + 4 * 3600e3);
    const d = new Date();
    if (d.getHours() >= 7) d.setDate(d.getDate() + 1);
    d.setHours(7, 0, 0, 0);
    return d;
}

function holdRevertText(hold) {
    const d = holdRevertAt(hold);
    return d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function holdPicker() {
    const c = window.ctl;
    const opts = [['none', 'Until next schedule slot (default)'], ['07:00', 'Until 07:00 tomorrow'], ['4h', 'For 4 hours']];
    return `<div class="stepq" style="font-size:13.5px">Hold this change?</div><div class="chips">${opts.map(([v, l]) =>
        `<button class="chip ${c.hold === v ? 'sel' : ''}" data-testid="hold-${v}" onclick="ctlHold('${v}')">${l}</button>`).join('')}</div>
 <p class="small" style="margin-top:8px">${c.hold === 'none'
        ? 'Without a hold, the device\'s own schedule reclaims this at the next slot — fine for daytime, but evening changes usually need a hold.'
        : `⏱️ Will automatically revert${c.device?.telemetry?.heatingSetpoint != null ? ` to <b>${c.device.telemetry.heatingSetpoint}°C</b>` : ' to the previous value'} at <b>${holdRevertText(c.hold)}</b>. The revert survives restarts (durable store).`}</p>`;
}

function ctlHold(v) { window.ctl.hold = v; drawControl(); }

function ctlStep(dx) {
    const c = window.ctl;
    c.val = Math.round((c.val + dx) * 10) / 10;
    clampCtlVal();
    drawControl();
}

function ctlValTxt(c = window.ctl) {
    if (c.mode === 'modeoff') return 'Mode Off';
    if (c.mode === 'switchon') return 'ON';
    if (c.mode === 'switchoff') return 'OFF';
    return c.val + '°C';
}

/**
 * The confirm-modal site-identity block (B0/R0 · C9). Site identity is the most prominent element; an
 * unverified site shows a confirm-by-voice warning and never presents the bare accountId as the site.
 */
function ctlTargetBlock(site, device) {
    const dev = `<div class="target-tech"><span class="mono">${esc(site.siteNo)}</span> → <span class="mono">${esc(device.deviceId)}</span> · ${esc(device.zone)}</div>`;
    if (site.nameUnverified) {
        const raw = site.accountId || site.siteName;
        return `<div class="target-identity unverified">
    <div class="alert warn" data-testid="control-unverified">⚠ <b>Site name unverified</b> — confirm the house number by voice before sending.</div>
    <div class="target-name muted" data-testid="control-target-name">Unrecognised site <span class="mono small">${esc(raw)}</span></div>
    ${dev}</div>`;
    }
    return `<div class="target-identity">
    <div class="target-name" data-testid="control-target-name">${esc(site.siteName)}</div>
    ${dev}</div>`;
}

function drawControl() {
    const c = window.ctl;
    const d = c.device;
    const ws = state.workspace;
    if (c.phase === 'compose') {
        let body = '';
        if (c.mode === 'up' || c.mode === 'down') {
            const w = d.setpointWindow || { min: 5, max: 25, step: 0.5 };
            body = `<div class="stepper"><button data-testid="stepper-down" onclick="ctlStep(-${w.step})" ${c.val <= w.min ? 'disabled' : ''}>−</button><span class="val" data-testid="stepper-value">${c.val}°C</span><button data-testid="stepper-up" onclick="ctlStep(${w.step})" ${c.val >= w.max ? 'disabled' : ''}>+</button></div>
   <p class="guard" data-testid="guardrail-text">Currently ${d.telemetry?.heatingSetpoint}°C · you can set <b>${w.min}–${w.max}°C</b> (±3°C of current, max 25°C). The server enforces the same limits.</p>${holdPicker()}`;
        }
        if (c.mode === 'frost') body = `<div style="text-align:center;margin:10px 0"><span class="val" style="font-size:34px;font-weight:700">5°C frost-hold</span></div><p class="guard">Heating stays off unless the building risks freezing.</p>${holdPicker()}`;
        if (c.mode === 'modeoff') body = `<div style="text-align:center;margin:10px 0"><span class="val" style="font-size:34px;font-weight:700">Mode → Off</span></div><p class="guard">Intesis native Off. Current mode: ${esc(d.telemetry?.mode || '—')}.</p>${holdPicker()}`;
        if (c.mode === 'switchon' || c.mode === 'switchoff') body = `<div style="text-align:center;margin:10px 0"><span class="val" style="font-size:34px;font-weight:700">Switch → ${c.mode === 'switchon' ? 'ON' : 'OFF'}</span></div><p class="guard" data-testid="switch-guard">This turns the <b>${esc(d.zone)}</b> circuit ${c.mode === 'switchon' ? 'ON' : 'OFF'} (single relay). Shown as done only when the device confirms.</p>`;
        openModal(`<div class="mh">${CTL_TITLES[c.mode]}<button class="btn link" onclick="ctlCancel()">✕</button></div><div class="mb">
   <div class="target" data-testid="control-target">${ctlTargetBlock(ws.site, d)}</div>
   ${c.error ? `<div class="alert err" data-testid="control-error">${esc(c.error)}</div>` : ''}${body}
  </div><div class="mf"><button class="btn" onclick="ctlCancel()">Cancel</button><button class="btn primary" data-testid="control-send" onclick="ctlSend()">Send to device</button></div>`, false);
        return;
    }

    // ---- three-outcome tracker ----
    const a = c.action || {};
    const st = a.state;
    const slow = !!a.slowEchoDevice;
    const n = a.copyMinutes;
    // Progress strip: Sent → Gate pending → Accepted → Confirmed (honest, device-proven).
    const confirmedP = st === 'confirmed' || st === 'already-set';
    const acceptedP = confirmedP || a.status === 'accepted';
    const badP = st === 'non-delivery';
    const indP = st === 'indeterminate';
    const cls = (ok, bad) => bad ? 'bad' : ok ? 'ok' : (st === 'in-flight' ? 'on' : '');
    const steps = `<div class="syncsteps" data-testid="sync-steps">
   <div class="ss ok">1. Sent</div>
   <div class="ss ${acceptedP ? 'ok' : badP ? 'bad' : 'on'}">2. Accepted by the gate</div>
   <div class="ss ${confirmedP ? 'ok' : badP ? 'bad' : indP ? 'bad' : 'on'}">${confirmedP ? '✅ Confirmed' : badP ? '✕ Not delivered' : indP ? '⚠ Not confirmed' : '3. Device confirming…'}</div></div>`;

    let tail = '';
    const holdSuffix = (c.hold && c.hold !== 'none') ? ` Hold active: reverts at ${holdRevertText(c.hold)}.` : '';

    if (st === 'already-set') {
        tail = `<div class="alert ok" data-testid="sync-confirmed" aria-live="polite">✅ <b>Already at the requested value — ${esc(ctlValTxt(c))}.</b> The device already reads this, so no change was needed.${holdSuffix}</div><div style="text-align:right"><button class="btn primary" data-testid="sync-done" onclick="ctlFinish()">Done</button></div>`;
    } else if (st === 'in-flight' && slow) {
        // DD-WAIT-HANDOFF: release the handler immediately for a slow (Salus) class.
        tail = `<div class="alert info" data-testid="sync-sent-slow" aria-live="polite">📨 <b>Sent to the device.</b> It should take effect within about <b>${n} minutes</b> — you can carry on with the caller; we\'ll watch it in the background, show the result here and update the ticket when the thermostat confirms.</div>
   <div style="text-align:right"><button class="btn primary" data-testid="sync-release" onclick="ctlRelease()">Done — carry on</button></div>`;
    } else if (st === 'in-flight') {
        if (a.status === 'accepted') {
            tail = `<p class="small" style="text-align:center" aria-live="polite"><span class="spin"></span> <b>Accepted by the system</b> — waiting for the device to show the change in its own reading. <b>"Confirmed" only means device-proven.</b></p>`;
        } else {
            tail = `<p class="small" style="text-align:center" aria-live="polite"><span class="spin"></span> Sent to the device — waiting for it to confirm… <b>"Confirmed" only means the device\'s own reading proved it.</b></p>`;
        }
    } else if (st === 'confirmed') {
        tail = `<div class="alert ok" data-testid="sync-confirmed" aria-live="polite">✅ <b>Confirmed — device reports ${esc(confirmReadingText(c))}${a.confirmedLate ? ' (confirmed late)' : ''}.</b> This is the only outcome we ever show as success.${a.confirmedLate ? ' This came in after we told you it was not yet confirmed — tell the caller it\'s now done.' : ''}${holdSuffix}</div><div style="text-align:right"><button class="btn primary" data-testid="sync-done" onclick="ctlFinish()">Done</button></div>`;
    } else if (st === 'non-delivery') {
        tail = `<div class="alert err" data-testid="sync-notdelivered" aria-live="assertive">❌ <b>Not delivered.</b> ${esc(a.operatorError || 'The change could not be sent.')} <b>Nothing has changed on site — do not tell the caller it\'s done.</b></div><div style="text-align:right"><button class="btn primary" data-testid="sync-escalate" onclick="ctlEscalate()">Capture &amp; escalate</button></div>`;
    } else if (st === 'indeterminate') {
        // NOT CONFIRMED — NO resend button (DD-RESEND-UX). The watcher keeps watching.
        tail = `<div class="alert warn" data-testid="sync-notconfirmed" aria-live="assertive">⚠️ <b>Not confirmed yet.</b> ${esc(a.operatorError || CTL_NOT_CONFIRMED)} We\'re still watching in the background and will update the ticket if it lands — <b>please don\'t treat this as done.</b></div><div style="text-align:right"><button class="btn primary" data-testid="sync-escalate" onclick="ctlEscalate()">Capture &amp; escalate</button></div>`;
    }

    const trackerName = ws.site.nameUnverified
        ? `⚠ <span class="muted">Unrecognised site <span class="mono">${esc(ws.site.accountId || ws.site.siteName)}</span></span>`
        : `<b>${esc(ws.site.siteName)}</b>`;
    openModal(`<div class="mh">${CTL_TITLES[c.mode]}</div><div class="mb"><div class="target"><span class="target-name">${trackerName}</span> <span class="mono">${esc(ws.site.siteNo)}</span> → <span class="mono">${esc(d.deviceId)}</span> · ${ctlValTxt()}</div>${steps}${tail}</div>`, false);
}

/** Human reading text for a confirmed outcome (switch → ON/OFF, setpoint → N°C). */
function confirmReadingText(c = window.ctl) {
    if (c.mode === 'switchon') return 'ON';
    if (c.mode === 'switchoff') return 'OFF';
    if (c.mode === 'modeoff') return 'off';
    return ctlValTxt(c);
}

async function ctlSend() {
    const c = window.ctl;
    c.error = null;
    c.phase = 'tracker';
    c.action = { state: 'in-flight', status: 'pending' };
    drawControl();
    const command = { up: 'setpoint', down: 'setpoint', frost: 'frost', modeoff: 'mode', switchon: 'switch', switchoff: 'switch' }[c.mode];
    const hold = c.hold !== 'none' ? { revertAt: holdRevertAt(c.hold).toISOString(), label: c.hold === '4h' ? 'For 4 hours' : 'Until 07:00 tomorrow' } : null;
    const dispatchValue = c.mode === 'modeoff' ? 'off'
        : c.mode === 'switchon' ? true
        : c.mode === 'switchoff' ? false
        : c.val;
    try {
        const { action } = await api.post('/api/control/dispatch', {
            confirmToken: state.confirmToken,
            siteNo: state.siteNo,
            deviceId: c.device.deviceId,
            command,
            value: dispatchValue,
            direction: c.mode === 'up' ? 'up' : c.mode === 'down' ? 'down' : undefined,
            hold
        });
        c.action = action;
        if (action.state === 'already-set' || action.state === 'confirmed') {
            drawControl();
            return;
        }
        // in-flight: a slow class is released at once (the tracker shows the "carry on" card); a fast
        // class polls to its quick outcome.
        drawControl();
        startCtlPolling();
    } catch (err) {
        // Guardrail (422), kill-switch (423), confirmation (409) → back to compose with the reason.
        c.phase = 'compose';
        c.error = err.message;
        c.action = null;
        drawControl();
    }
}

function startCtlPolling() {
    clearInterval(ctlPollTimer);
    ctlPollTimer = setInterval(async () => {
        const c = window.ctl;
        if (!c || !c.action) { clearInterval(ctlPollTimer); return; }
        let action;
        try {
            ({ action } = await api.get(`/api/control/actions/${c.action.actionId}`));
        } catch { return; /* transient — keep polling */ }
        if (!action) return;
        const prev = c.action.state;
        c.action = action;
        // Redraw on any meaningful change (status pending→accepted, or a terminal/indeterminate state).
        drawControl();
        if (['confirmed', 'non-delivery'].includes(action.state)) {
            clearInterval(ctlPollTimer);
        }
        // indeterminate is NOT terminal — keep polling so a late confirm flips the card to CONFIRMED.
    }, 2000);
}

/**
 * DD-WAIT-HANDOFF — the operator releases a slow (Salus) action and carries on. We record the outcome
 * ticket now ("sent, awaiting confirmation"), attach it so the server watcher updates THAT ticket, and
 * start a detached background watch that toasts the result when it lands. No resend, ever.
 */
async function ctlRelease() {
    const c = window.ctl;
    clearInterval(ctlPollTimer);
    const action = c.action;
    const what = CTL_WHAT[c.mode];
    const additionalNotes = state.flow?.data?.additionalNotes || null;
    const holdTxt = c.hold !== 'none' ? `Hold until ${holdRevertText(c.hold)} — will revert automatically (durable)` : null;
    let ticketId = null;
    try {
        const res = await api.post('/api/outcomes', {
            type: 'capture',
            additionalNotes,
            actionId: action?.actionId,
            siteNo: state.workspace.site.siteNo,
            siteName: state.workspace.site.siteName,
            subject: `${what} — sent, awaiting device confirmation`,
            detail: `${what} (${ctlValTxt(c)}) sent to ${c.device.deviceId}. This unit can take a few minutes to confirm; the result will be added to this ticket when the device confirms. Treat as not-yet-applied until confirmed.`,
            callerWords: state.flow?.data?.freeText || null,
            holdText: holdTxt,
            OohCaptureClass: 'control-awaiting-confirm'
        });
        ticketId = res?.ticket?.id || null;
        notesDraftClear();
        if (state.flow?.data) state.flow.data._ticketId = ticketId;
        registerIssue(`${what} — awaiting confirmation`, 'blue', ticketId);
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
    }
    // Detached background watch — toast the result; the server also writes it to the ticket.
    startCtlBgWatch(action?.actionId, what);
    const html = `<div class="outcome captured" data-testid="outcome-awaiting"><h3>📨 Sent — awaiting the device</h3>
  <p>${what} (${ctlValTxt(c)}) is on its way to <span class="mono">${esc(c.device.deviceId)}</span>. It should take effect within about <b>${action?.copyMinutes} minutes</b>. We\'re watching in the background and will update the ticket when the device confirms.</p>
  <div class="script">"That\'s gone to the thermostat now — it can take a few minutes to take effect. I\'ve logged it, and we\'ll keep an eye on it; if it doesn\'t respond we\'ll follow it up."</div>
  ${ticketId ? `<p class="small">Ticket <b>#${ticketId}</b></p>` : ''}%%NOTESPOST%%${outButtons()}</div>`;
    window.ctl = null;
    closeModal();
    if (state.flow) { state.flow.stage = 99; state.flow.data._outcomeHtml = html; }
    render();
}

/** Detached watch for a released action — toasts the final outcome (CONFIRMED / NOT DELIVERED / NOT CONFIRMED). */
function startCtlBgWatch(actionId, what) {
    clearInterval(ctlBgTimer);
    if (!actionId) return;
    let elapsed = 0;
    ctlBgTimer = setInterval(async () => {
        elapsed += 15000;
        let action;
        try { ({ action } = await api.get(`/api/control/actions/${actionId}`)); } catch { return; }
        if (!action) { if (elapsed > 10 * 60000) clearInterval(ctlBgTimer); return; }
        if (action.state === 'confirmed') {
            toast(`✅ <b>Confirmed</b> — ${esc(what)} is now device-confirmed.`);
            clearInterval(ctlBgTimer);
        } else if (action.state === 'non-delivery') {
            toast(`❌ <b>Not delivered</b> — ${esc(what)}: ${esc(action.operatorError || 'the device rejected it')}. It\'s on the ticket.`);
            clearInterval(ctlBgTimer);
        } else if (action.state === 'indeterminate' && elapsed > 2 * 60000) {
            toast(`⚠️ <b>Not confirmed yet</b> — ${esc(what)} hasn\'t confirmed. Still watching; it\'s on the ticket.`);
        }
        if (elapsed > 95 * 60000) clearInterval(ctlBgTimer);
    }, 15000);
    ctlBgTimer.unref?.();
}

function ctlCancel() {
    clearInterval(ctlPollTimer);
    window.ctl = null;
    closeModal();
    if (state.flow) state.flow.stage = Math.max(0, state.flow.stage - 1);
    render();
}

/**
 * CONFIRMED (or already-set) → record the outcome ticket and render the applied outcome card.
 */
async function ctlFinish() {
    const c = window.ctl;
    clearInterval(ctlPollTimer);
    window.ctl = null;
    closeModal();
    const holdTxt = c.hold !== 'none' ? `Hold until ${holdRevertText(c.hold)} — will revert automatically (durable)` : null;
    const what = CTL_WHAT[c.mode];
    const reading = confirmReadingText(c);
    const script = {
        up: `Done — I\'ve set it to ${c.val} degrees and the device has confirmed. ${holdTxt ? 'It\'ll hold until the morning schedule.' : 'The site schedule takes back over at the next slot.'}`,
        down: `Done — lowered to ${c.val} degrees and confirmed by the device.`,
        frost: `The heating\'s now off on a frost-hold — it\'ll only kick in if the building gets near freezing${holdTxt ? ', and normal service resumes at 7am' : ''}.`,
        modeoff: 'That\'s the system switched off — confirmed by the unit itself.',
        switchon: `That circuit is now switched ON — confirmed by the device.`,
        switchoff: `That circuit is now switched OFF — confirmed by the device.`
    }[c.mode];
    const detail = `${what} to <b>${esc(reading)}</b> on <span class="mono">${esc(c.device.deviceId)}</span>, device-confirmed.`;
    const additionalNotes = state.flow?.data?.additionalNotes || null;
    let html;
    try {
        const res = await api.post('/api/outcomes', {
            type: c.action.actionType,
            additionalNotes,
            actionId: c.action.actionId,
            siteNo: state.workspace.site.siteNo,
            siteName: state.workspace.site.siteName,
            subject: `${what} — ${c.device.zone}`,
            detail: `${what} to ${reading} on ${c.device.deviceId}, device-confirmed.`,
            callerWords: state.flow?.data?.freeText || null,
            holdText: holdTxt
        });
        notesDraftClear();
        if (state.flow?.data) { state.flow.data._ticketId = res.ticket.id; }
        const notesEcho = additionalNotes
            ? `<div class="stepdone small" data-testid="addnotes-echo"><span>📝</span>Note added — for the ticket and morning review: "${esc(additionalNotes)}"</div>`
            : '';
        registerIssue(`${what} — ${c.device.zone}`, 'green', res.ticket.id);
        html = `<div class="outcome applied" data-testid="outcome-applied"><h3>✅ Change applied — device confirmed</h3><p>${detail}</p>${holdTxt ? `<p style="margin-top:4px">⏱️ ${holdTxt}</p>` : ''}
  ${notesEcho}<div class="script">"${script}"</div><p class="small">Recorded on ticket <b>#${res.ticket.id}</b> · reviewed by the IoT team next working day (in the IoT Support dashboard)</p>%%NOTESPOST%%${outButtons()}</div>`;
        toast(`✅ <b>${esc(state.workspace.site.siteName)}</b>: ${what} ${reading} — device confirmed`);
    } catch (err) {
        html = `<div class="outcome applied" data-testid="outcome-applied"><h3>✅ Change applied — device confirmed</h3><p>${detail}</p>
  <div class="alert err">The change IS applied, but recording the ticket failed: ${esc(err.message)}. Tell the IoT team via Tonight → Raise a query so the audit trail is complete.</div>
  <div class="script">"${script}"</div>${outButtons()}</div>`;
    }
    if (state.flow) { state.flow.stage = 99; state.flow.data._outcomeHtml = html; }
    render();
}

/**
 * NOT DELIVERED / NOT CONFIRMED → honest capture-and-escalate outcome (never success). No resend.
 */
async function ctlEscalate() {
    const c = window.ctl;
    clearInterval(ctlPollTimer);
    window.ctl = null;
    closeModal();
    const what = CTL_WHAT[c.mode];
    const stateNow = c.action?.state;
    const notConfirmed = stateNow === 'indeterminate';
    const why = notConfirmed
        ? 'the device has not confirmed the change (not confirmed)'
        : `the change was not delivered (${esc(c.action?.operatorError || 'rejected')})`;
    const additionalNotes = state.flow?.data?.additionalNotes || null;
    let html;
    try {
        const res = await api.post('/api/outcomes', {
            type: 'capture',
            additionalNotes,
            actionId: c.action?.actionId,
            siteNo: state.workspace.site.siteNo,
            siteName: state.workspace.site.siteName,
            subject: `${what} — NOT applied, escalated`,
            detail: `Attempted ${what} (${ctlValTxt(c)}) on ${c.device.deviceId} but ${notConfirmed ? 'the device did not confirm' : 'the change was not delivered'}. Change must be treated as not applied.`,
            callerWords: state.flow?.data?.freeText || null,
            OohCaptureClass: 'control-failure'
        });
        notesDraftClear();
        if (state.flow?.data) { state.flow.data._ticketId = res.ticket.id; }
        registerIssue(`${what} — NOT applied`, 'blue', res.ticket.id);
        html = `<div class="outcome captured" data-testid="outcome-escalated"><h3>📥 Captured for the IoT team</h3>
  <p>Attempted ${what} (${ctlValTxt(c)}) on <span class="mono">${esc(c.device.deviceId)}</span> but ${why}. <b>The change must be treated as not applied.</b></p>
  <div class="script">"I tried to make that change remotely but the device hasn\'t confirmed it, so I\'m not going to tell you it\'s done when it may not be. I\'ve logged it as a priority instead${notConfirmed ? ' — it may still land, and the team will check' : ''}."</div>
  <p class="small">Ticket <b>#${res.ticket.id}</b></p>%%NOTESPOST%%${outButtons()}</div>`;
    } catch (err) {
        html = `<div class="alert err">Couldn\'t record the escalation: ${esc(err.message)} — raise it via Tonight → Raise a query so it isn\'t lost.</div>${outButtons()}`;
    }
    if (state.flow) { state.flow.stage = 99; state.flow.data._outcomeHtml = html; }
    render();
}
