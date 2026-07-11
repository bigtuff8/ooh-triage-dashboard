/**
 * Control modal + sync tracker (design §3.4; F002/F005/F006/F007/F008/F010).
 *
 * The ONLY way a write happens — always from a flow, never freestanding.
 * "Applied" is shown ONLY when the server reports the device echo (synced).
 * The stepper cannot compose an out-of-range value (server enforces the same
 * window and rejects anything else — F009 defence in depth).
 */

window.ctl = null;
let ctlPollTimer = null;

const CTL_TITLES = { up: 'Raise setpoint', down: 'Lower setpoint', frost: 'Turn heating off (frost-hold)', modeoff: 'Turn off (mode)', boost: 'Hot-water boost' };
const CTL_WHAT = { up: 'Setpoint raise', down: 'Setpoint lower', frost: 'Heating off (frost-hold)', modeoff: 'Heating off (mode)', boost: 'HW boost' };

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
    if (mode === 'modeoff') c.val = 'Off';
    if (mode === 'boost') c.val = 2;
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
    // 07:00 tomorrow (or today if before 07:00)
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
        ? 'Without a hold, the device’s own schedule reclaims this at the next slot — fine for daytime, but evening changes usually need a hold.'
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
    return c.mode === 'boost' ? c.val + 'h boost' : c.mode === 'modeoff' ? 'Mode Off' : c.val + '°C';
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
        if (c.mode === 'boost') body = `<div class="stepper"><button data-testid="stepper-down" onclick="ctlStep(-1)" ${c.val <= 1 ? 'disabled' : ''}>−</button><span class="val" data-testid="stepper-value">${c.val}h</span><button data-testid="stepper-up" onclick="ctlStep(1)" ${c.val >= 9 ? 'disabled' : ''}>+</button></div><p class="guard">Hot-water boost 1–9 hours (device-native timer — reverts by itself).</p>`;
        openModal(`<div class="mh">${CTL_TITLES[c.mode]}<button class="btn link" onclick="ctlCancel()">✕</button></div><div class="mb">
   <div class="target" data-testid="control-target">Sending to: <b>${esc(ws.site.siteName)}</b> <span class="mono">${esc(ws.site.siteNo)}</span> → <span class="mono">${esc(d.deviceId)}</span> (${esc(d.zone)})</div>
   ${c.error ? `<div class="alert err" data-testid="control-error">${esc(c.error)}</div>` : ''}${body}
  </div><div class="mf"><button class="btn" onclick="ctlCancel()">Cancel</button><button class="btn primary" data-testid="control-send" onclick="ctlSend()">Send to device</button></div>`, false);
        return;
    }

    // Sync tracker phases: sent → confirming → applied / failed / rejected / timeout
    const ph = c.phase;
    const steps = `<div class="syncsteps" data-testid="sync-steps">
   <div class="ss ${ph !== 'sent' ? 'ok' : 'on'}">1. Sent</div>
   <div class="ss ${ph === 'confirm' ? 'on wait' : ph === 'done' ? 'ok' : ['failed', 'rejected', 'timeout'].includes(ph) ? 'bad' : ''}">2. Device confirming…</div>
   <div class="ss ${ph === 'done' ? 'ok' : ['failed', 'rejected', 'timeout'].includes(ph) ? 'bad' : ''}">${ph === 'failed' ? '✕ Failed' : ph === 'rejected' ? '✕ Rejected' : ph === 'timeout' ? '⚠ No confirmation' : '3. Applied'}</div></div>`;
    let tail = '';
    if (ph === 'sent' || ph === 'confirm') tail = `<p class="small" style="text-align:center" aria-live="polite">Waiting for the device to echo the change back — usually under 30 seconds. <b>“Applied” only means device-confirmed.</b></p>`;
    if (ph === 'done') tail = `<div class="alert ok" data-testid="sync-applied" aria-live="polite">✅ <b>Applied — device confirmed ${ctlValTxt()} at ${new Date(c.action.settledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.</b>${c.hold !== 'none' ? ` Hold active: reverts at ${holdRevertText(c.hold)}.` : ''}</div><div style="text-align:right"><button class="btn primary" data-testid="sync-done" onclick="ctlFinish()">Done</button></div>`;
    if (ph === 'failed' || ph === 'rejected') tail = `<div class="alert err" data-testid="sync-failed" aria-live="assertive">❌ <b>The device ${ph === 'rejected' ? 'rejected' : 'refused'} this command</b> (<span class="mono">${ph}</span>). Nothing has changed on site — do not tell the caller it’s done.</div><div style="text-align:right;display:flex;gap:8px;justify-content:flex-end"><button class="btn" onclick="ctlRetry()">Try again</button><button class="btn primary" data-testid="sync-escalate" onclick="ctlEscalate()">Escalate instead</button></div>`;
    if (ph === 'timeout') tail = `<div class="alert warn" data-testid="sync-timeout" aria-live="assertive">⏱️ <b>The device hasn’t confirmed yet.</b>${c.action?.slowEchoDevice ? ' This unit (IT700) can be slow to echo.' : ''} <b>Treat the change as NOT applied.</b> We’ll keep watching in the background and update the ticket if it lands.</div><div style="text-align:right;display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-testid="sync-wait" onclick="ctlWaitMore()">Keep waiting (30s)</button><button class="btn primary" data-testid="sync-escalate" onclick="ctlEscalate()">Escalate</button></div>`;
    openModal(`<div class="mh">${CTL_TITLES[c.mode]}</div><div class="mb"><div class="target">${esc(ws.site.siteName)} <span class="mono">${esc(ws.site.siteNo)}</span> → <span class="mono">${esc(d.deviceId)}</span> · ${ctlValTxt()}</div>${steps}${tail}</div>`, false);
}

async function ctlSend() {
    const c = window.ctl;
    c.error = null;
    c.phase = 'sent';
    drawControl();
    const command = { up: 'setpoint', down: 'setpoint', frost: 'frost', modeoff: 'mode', boost: 'hwboost' }[c.mode];
    const hold = c.hold !== 'none' ? { revertAt: holdRevertAt(c.hold).toISOString(), label: c.hold === '4h' ? 'For 4 hours' : 'Until 07:00 tomorrow' } : null;
    try {
        const { action } = await api.post('/api/control/dispatch', {
            confirmToken: state.confirmToken,
            siteNo: state.siteNo,
            deviceId: c.device.deviceId,
            command,
            value: c.mode === 'modeoff' ? 'Off' : c.val,
            direction: c.mode === 'up' ? 'up' : c.mode === 'down' ? 'down' : undefined,
            hold
        });
        c.action = action;
        c.phase = 'confirm';
        drawControl();
        startCtlPolling();
    } catch (err) {
        // Guardrail (422), kill-switch (423), confirmation (409) → back to compose with the reason
        c.phase = 'compose';
        c.error = err.message;
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
        c.action = action;
        if (['synced', 'late-synced'].includes(action.state) && c.phase !== 'done') { c.phase = 'done'; drawControl(); }
        else if (['failed', 'rejected'].includes(action.state) && !['failed', 'rejected'].includes(c.phase)) { c.phase = action.state; drawControl(); }
        else if (action.state === 'timeout' && c.phase !== 'timeout') { c.phase = 'timeout'; drawControl(); }
        if (['synced', 'late-synced', 'failed', 'rejected'].includes(action.state)) clearInterval(ctlPollTimer);
    }, 2000);
}

async function ctlWaitMore() {
    const c = window.ctl;
    try {
        const { action } = await api.post(`/api/control/actions/${c.action.actionId}/wait`);
        c.action = action;
        c.phase = 'confirm';
        drawControl();
        startCtlPolling();
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
    }
}

function ctlRetry() {
    const c = window.ctl;
    clearInterval(ctlPollTimer);
    c.phase = 'compose';
    c.action = null;
    drawControl();
}

function ctlCancel() {
    clearInterval(ctlPollTimer);
    window.ctl = null;
    closeModal();
    if (state.flow) state.flow.stage = Math.max(0, state.flow.stage - 1);
    render();
}

/**
 * Synced → record the outcome ticket (server links it to the dispatch audit entry
 * and any hold), render the applied outcome card.
 */
async function ctlFinish() {
    const c = window.ctl;
    clearInterval(ctlPollTimer);
    window.ctl = null;
    closeModal();
    const holdTxt = c.hold !== 'none' ? `Hold until ${holdRevertText(c.hold)} — will revert automatically (durable)` : null;
    const what = CTL_WHAT[c.mode];
    const script = {
        up: `Done — I’ve set it to ${c.val} degrees and the device has confirmed. ${holdTxt ? 'It’ll hold until the morning schedule.' : 'The site schedule takes back over at the next slot.'}`,
        down: `Done — lowered to ${c.val} degrees and confirmed by the device.`,
        frost: `The heating’s now off on a frost-hold — it’ll only kick in if the building gets near freezing${holdTxt ? ', and normal service resumes at 7am' : ''}.`,
        modeoff: 'That’s the system switched off — confirmed by the unit itself.',
        boost: `Hot water boost is on for ${c.val} hours — it’ll switch back by itself.`
    }[c.mode];
    const detail = `${what} to <b>${ctlValTxt(c)}</b> on <span class="mono">${esc(c.device.deviceId)}</span>, device-confirmed (<span class="mono">synced</span>).`;

    let html;
    try {
        const res = await api.post('/api/outcomes', {
            type: c.action.actionType,
            actionId: c.action.actionId,
            siteNo: state.workspace.site.siteNo,
            siteName: state.workspace.site.siteName,
            subject: `${what} — ${c.device.zone}`,
            detail: `${what} to ${c.mode === 'modeoff' ? 'Off' : c.val}${c.mode === 'boost' ? 'h' : c.mode === 'modeoff' ? '' : '°C'} on ${c.device.deviceId}, device-confirmed (synced).`,
            callerWords: state.flow?.data?.freeText || null,
            holdText: holdTxt
        });
        registerIssue(`${what} — ${c.device.zone}`, 'green', res.ticket.id);
        html = `<div class="outcome applied" data-testid="outcome-applied"><h3>✅ Change applied — device confirmed</h3><p>${detail}</p>${holdTxt ? `<p style="margin-top:4px">⏱️ ${holdTxt}</p>` : ''}
  <div class="script">“${script}”</div><p class="small">Recorded on ticket <b>#${res.ticket.id}</b> · reviewed by the IoT team next working day (in the IoT Support dashboard)</p>${outButtons()}</div>`;
        toast(`✅ <b>${esc(state.workspace.site.siteName)}</b>: ${what} ${ctlValTxt(c)} — device confirmed`);
    } catch (err) {
        html = `<div class="outcome applied" data-testid="outcome-applied"><h3>✅ Change applied — device confirmed</h3><p>${detail}</p>
  <div class="alert err">The change IS applied, but recording the ticket failed: ${esc(err.message)}. Tell the IoT team via Tonight → Raise a query so the audit trail is complete.</div>
  <div class="script">“${script}”</div>${outButtons()}</div>`;
    }
    if (state.flow) { state.flow.stage = 99; state.flow.data._outcomeHtml = html; }
    render();
}

/**
 * Failed / rejected / timeout → honest capture-and-escalate outcome (never success).
 */
async function ctlEscalate() {
    const c = window.ctl;
    clearInterval(ctlPollTimer);
    window.ctl = null;
    closeModal();
    const what = CTL_WHAT[c.mode];
    const why = c.action?.state === 'timeout' ? 'no sync confirmation (timeout)' : `write ${c.action?.state || 'failed'} (vendor ${c.action?.state || 'failed'})`;
    const isTimeout = c.action?.state === 'timeout';
    let html;
    try {
        const res = await api.post('/api/outcomes', {
            type: 'capture',
            actionId: c.action?.actionId, // links the failed dispatch's audit entry + late-sync ticket updates
            siteNo: state.workspace.site.siteNo,
            siteName: state.workspace.site.siteName,
            subject: `${what} — NOT applied, escalated`,
            detail: `Attempted ${what} (${ctlValTxt(c)}) on ${c.device.deviceId} but ${why}. Change must be treated as not applied.`,
            callerWords: state.flow?.data?.freeText || null,
            captureClass: 'control-failure'
        });
        registerIssue(`${what} — NOT applied`, 'blue', res.ticket.id);
        html = `<div class="outcome captured" data-testid="outcome-escalated"><h3>📥 Captured for the IoT team</h3>
  <p>Attempted ${what} (${ctlValTxt(c)}) on <span class="mono">${esc(c.device.deviceId)}</span> but ${esc(why)}. <b>The change must be treated as not applied.</b></p>
  <div class="script">“I tried to make that change remotely but the device hasn’t confirmed it, so I’m not going to tell you it’s done when it may not be. I’ve logged it as a priority instead${isTimeout ? ' — it may still land, and the team will check' : ''}.”</div>
  <p class="small">Ticket <b>#${res.ticket.id}</b></p>${outButtons()}</div>`;
    } catch (err) {
        html = `<div class="alert err">Couldn’t record the escalation: ${esc(err.message)} — raise it via Tonight → Raise a query so it isn’t lost.</div>${outButtons()}`;
    }
    if (state.flow) { state.flow.stage = 99; state.flow.data._outcomeHtml = html; }
    render();
}
