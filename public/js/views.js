/**
 * Views: New Call (home), Site Workspace (confirmation gate + picker), Callback
 * Lookup, Tonight (shift view), Admin (IoT only). Design spec §3.
 */

/**
 * B0/R0 — the site sub-line (brand · address). Renders name-only (returns '') when brand/address
 * are absent (pre-B2, live mode) so identity NEVER degrades to the literal "undefined · undefined".
 * Once B2 puts brand/address on the record this lights up with no further change.
 */
function siteSubline(s) {
    const parts = [s.brand, s.address].filter(v => v != null && String(v).trim() !== '');
    return parts.length ? `<div class="sub">${parts.map(p => esc(p)).join(' · ')}</div>` : '';
}

/**
 * B0/R0 · C9 — the confirm-gate warning shown when a site\'s name could not be verified (live
 * Zendesk miss). Keeps a wrong-site dispatch honest: confirm the house number by voice.
 */
function unverifiedNotice(s) {
    return s.nameUnverified
        ? `<div class="alert warn" data-testid="confirm-unverified">⚠ <b>Site name unverified</b> — we couldn\'t resolve a recognisable name for this house number. Confirm the house number by voice before making any change.</div>`
        : '';
}

/* ------------------------ OOHDASH-146 D16 (B33): permanent caller banner ------------------------ */
/**
 * Renders the sticky caller banner shown on every in-call screen once the site is confirmed.
 * State comes from state.caller (name, role, phone, declined) and state.workspace.site.
 * NOT a live region — the banner is NOT announced on every screen change. Caller details updates
 * are announced via the hidden #srlive role="status" node instead (B37).
 */
function callerBanner(s) {
    const c = s.caller || {};
    const site = s.workspace && s.workspace.site;
    const siteLine = site ? `<span class="cb-site">${esc(site.siteName)} ${esc(site.siteNo)}</span>` : '';
    const hasName = c.name && c.name.trim();
    const hasRole = c.role && c.role.trim();
    const hasPhone = c.phone && c.phone.trim();
    const hasAny = hasName || hasRole || hasPhone;

    let who = '';
    if (hasAny) {
        const namePart = hasName ? esc(c.name) : '';
        const rolePart = hasRole ? `<span class="cb-role">${esc(c.role)}</span>` : '';
        const phonePart = hasPhone ? esc(c.phone) : '<span class="cb-quiet">no number taken</span>';
        const sep1 = namePart && (rolePart || phonePart) ? ' · ' : '';
        const sep2 = (namePart || rolePart) && phonePart ? ' · ' : '';
        who = `📞 ${namePart}${sep1}${rolePart}${sep2}${phonePart}`;
    } else if (c.declined) {
        who = `<span class="cb-quiet">(the customer declined)</span>`;
    } else {
        who = `<span class="cb-quiet">No contact details taken</span>`;
    }

    const addBtn = hasAny
        ? `<button class="btn link cb-add" onclick="showCdAdd()">Change</button>`
        : `<button class="btn link cb-add" onclick="showCdAdd()">Add details</button>`;

    return `<div class="callbanner" role="region" aria-label="Call in progress"><span class="cb-who">${who}</span>${addBtn}${siteLine}</div>`;
}

/* ------------------------ OOHDASH-146 D15 (B35): "Add contact details" overlay screen ------------------------ */
/**
 * vCdAdd — the full-screen form shown when the agent clicks "Add details" or "Change" in the caller banner.
 * Pre-fills from state.caller. Saves to state.caller via saveCdAdd(). Closing/saving returns to the previous screen.
 */
function vCdAdd() {
    const c = state.caller || {};
    $('#view').innerHTML = `<div class="content narrow">
  <div class="card" style="padding:26px">
   <h2>Customer contact details</h2>
   <p class="sub" style="margin-bottom:12px">These are stored for this call only and go on the ticket. They are never shared outside the IoT team.</p>
   <div class="cd-grid">
    <div class="formrow"><label for="cda-name">Customer\'s name <span class="small">(optional)</span></label>
     <input id="cda-name" data-testid="cda-name" maxlength="80" autocomplete="off" value="${esc(c.name || '')}"></div>
    <div class="formrow"><label for="cda-role">Their role <span class="small">(optional)</span></label>
     <input id="cda-role" data-testid="cda-role" maxlength="40" autocomplete="off" placeholder="e.g. duty manager" value="${esc(c.role || '')}"></div>
    <div class="formrow"><label for="cda-phone">Best contact number <span class="small">(optional)</span></label>
     <input id="cda-phone" data-testid="cda-phone" type="tel" autocomplete="off" value="${esc(c.phone || '')}"></div>
   </div>
   <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
    <button class="btn primary" data-testid="cda-save" onclick="saveCdAdd(document.getElementById('cda-name').value,document.getElementById('cda-role').value,document.getElementById('cda-phone').value)">Save</button>
    <button class="btn" onclick="state.cdAdd=false;render()">Cancel</button>
    <button class="btn link" style="margin-left:auto" onclick="setCaller({declined:true});state.cdAdd=false;render()">Customer declined to give details</button>
   </div>
  </div></div>`;
    // B37: focus the first input
    document.getElementById('cda-name')?.focus();
}

/* ------------------------ home (§3.1) ------------------------ */
function vHome() {
    const c = state.caller || {};
    $('#view').innerHTML = `<div class="content narrow">
  <div class="card" style="padding:26px">
   <h2>Who\'s calling?</h2>
   ${sayBox('Can I take your name, your role, and the best number to reach you on?')}
   <div class="cd-grid" style="margin:10px 0 6px">
    <div class="formrow"><label for="hq-name">Customer\'s name <span class="small">(optional)</span></label>
     <input id="hq-name" data-testid="hq-name" maxlength="80" autocomplete="off" value="${esc(c.name || '')}" oninput="setCaller({name:this.value,role:document.getElementById('hq-role').value,phone:document.getElementById('hq-phone').value})"></div>
    <div class="formrow"><label for="hq-role">Their role <span class="small">(optional)</span></label>
     <input id="hq-role" data-testid="hq-role" maxlength="40" autocomplete="off" placeholder="e.g. duty manager" value="${esc(c.role || '')}" oninput="setCaller({name:document.getElementById('hq-name').value,role:this.value,phone:document.getElementById('hq-phone').value})"></div>
    <div class="formrow"><label for="hq-phone">Best contact number <span class="small">(optional)</span></label>
     <input id="hq-phone" data-testid="hq-phone" type="tel" autocomplete="off" value="${esc(c.phone || '')}" oninput="setCaller({name:document.getElementById('hq-name').value,role:document.getElementById('hq-role').value,phone:this.value})"></div>
   </div>
   <p style="margin:4px 0 14px"><button class="btn link" data-testid="hq-declined" onclick="setCaller({declined:true});document.getElementById('sq').focus()">The customer won\'t give these</button></p>
   <p class="sub" style="margin-bottom:8px"><b>Which site is it?</b> Ask for the house number (4 digits) — or search by pub name. Use ↑ ↓ and Enter to pick.</p>
   <div class="searchwrap"><input id="sq" data-testid="site-search" placeholder="e.g. 6832 or Old Grey Mare" autocomplete="off"><div id="sres"></div></div>
   <p class="small" style="margin-top:12px">Customer ringing back about an earlier issue? <button class="btn link" onclick="go('callback')">Use Callback Lookup →</button></p>
  </div>
  <div class="card">
   <h3>Recent calls tonight (yours)</h3>
   ${state.recent.length ? state.recent.map(r =>
        `<div class="stepdone" style="cursor:pointer" onclick="openSite('${esc(r.siteNo)}')"><span>📞</span> <b>${esc(r.siteName)}</b> <span class="mono">${esc(r.siteNo)}</span> <span class="small" style="margin-left:auto">${esc(r.t)}</span></div>`).join('')
        : '<p class="small">No calls yet this shift. The whole shift\'s activity is under <b>Tonight</b>.</p>'}
  </div></div>`;
    bindSearch('sq', 'sres', openSite);
    // Don't focus the site search immediately — the agent needs to fill in caller details first
}

/* ------------------------ resolution + workspace (§3.2, F004) ------------------------ */
async function openSite(siteNo) {
    if (state.call && state.call.id) callFinalise('site-change'); // OOHDASH-159 rev 5 (E1)
    state.view = 'site';
    state.siteNo = siteNo;
    state.pendingSite = null;
    state.ambiguous = null;
    state.confirmToken = null;
    state.workspace = null;
    state.flow = null;
    state.call = null;
    // Q3/Q4: reset confirm gate state for the new site
    _confirmInProgress = false;
    _confirmGateSummaryLoaded = false;
    _confirmGateDeviceSummary = null;
    render();
    $('#view').innerHTML = `<div class="content narrow"><div class="card" style="padding:26px"><h2>Looking up site ${esc(siteNo)}…</h2></div></div>`;
    try {
        performance.clearMarks('device-read-start'); performance.mark('device-read-start');
        const result = await api.get(`/api/sites/${encodeURIComponent(siteNo)}/resolve`);
        performance.clearMarks('device-read-complete'); performance.mark('device-read-complete');
        if (result.status === 'resolved') state.pendingSite = result.site;
        else if (result.status === 'ambiguous') state.ambiguous = result;
        else { toast(`No site found for ${esc(siteNo)}`); state.view = 'home'; }
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
        state.view = 'home';
    }
    render();
}

function vSite() {
    if (state.ambiguous) return renderAmbiguous();
    if (!state.confirmToken) return renderConfirmGate();
    renderWorkspace();
}

// OOHDASH-146 B26: riskQuestion gates the IoT-team capture for the ambiguous-site view.
// state.ambiguousRisk: undefined = show risk question; true = show P1 confirm step.
// state.ambiguousNotes: saved notes value across re-renders.
// state.ambiguousRiskReason: typed P1 reason.

function renderAmbiguous() {
    const a = state.ambiguous;
    const riskConfirm = state.ambiguousRisk === true;
    const riskReason = state.ambiguousRiskReason || '';
    const reasonOk = typeof p1ReasonValid === 'function' && p1ReasonValid(riskReason);
    const savedNotes = state.ambiguousNotes || '';

    let actionArea;
    if (riskConfirm) {
        const reasonBoxHtml = `<div class="formrow" style="margin-top:10px"><label for="p1-reason-input">Why is this urgent? (required, goes on the P1 ticket)</label>
   <textarea id="p1-reason-input" data-testid="p1-reason" maxlength="500" rows="2" oninput="ambiguousRiskInput(this.value)">${esc(riskReason)}</textarea></div>`;
        actionArea = `<div class="confirm-step" data-testid="confirm-step">
   ${sayBox("Thanks. As there's an immediate risk to trade or to anyone's health and safety, I'm going to raise this as urgent with our on-call team.")}
   ${reasonBoxHtml}
   ${typeof p1WarnBox === 'function' ? p1WarnBox() : ''}
   <button class="btn danger" data-testid="record-outcome" style="margin-top:4px" onclick="ambiguousP1Submit()"${reasonOk ? '' : ' disabled aria-disabled="true"'}>Raise the P1</button>
  </div>`;
    } else {
        const riskNote = typeof infoBox === 'function'
            ? infoBox('<p>Trade means the site cannot serve customers or cannot open. Health and safety means anything that could hurt someone.</p><p>Yes goes to an urgent P1; No gives a next-working-day ticket.</p>')
            : '';
        const riskQ = typeof RISK_ASK !== 'undefined' ? RISK_ASK : 'Is there an immediate risk to trade or to anyone\'s health and safety?';
        const answerHtml = typeof answers === 'function'
            ? answers(`<button class="chip" data-testid="risk-yes" onclick="state.ambiguousNotes=notesValue('addnotes-amb');state.ambiguousRisk=true;renderAmbiguous()">Yes</button><button class="chip" data-testid="risk-no" onclick="ambiguousCapture()">No</button>`)
            : '';
        actionArea = riskNote +
            (typeof sayBox === 'function' ? sayBox('I can\'t safely make changes for this site number tonight — It\'s logged, and our IoT team picks it up the next working day.', riskQ) : '') +
            answerHtml +
            `<button class="btn" onclick="go('home')" style="margin-top:8px">Search again</button>`;
    }

    $('#view').innerHTML = `<div class="content narrow"><div class="card" style="border-color:var(--warning)" data-testid="ambiguous-card">
   <h2>&#9888;&#65039; House ID ${esc(a.siteNo)} is ambiguous</h2>
   <p class="sub" style="margin:8px 0">This ID matches more than one site (${a.matches.map(m => `<b>${esc(m.siteName)}</b>`).join(' and ')}). To protect against changing the wrong site, remote control is blocked for ambiguous IDs.</p>
   ${notesField({ id: 'addnotes-amb', value: savedNotes })}
   <div style="margin-top:10px">
    ${actionArea}
   </div>
  </div></div>`;
}

/** Oninput handler for the P1 reason textarea in the ambiguous view. */
function ambiguousRiskInput(value) {
    state.ambiguousRiskReason = value;
    const ok = typeof p1ReasonValid === 'function' && p1ReasonValid(value);
    const btn = document.querySelector('[data-testid="record-outcome"]');
    if (btn) { btn.disabled = !ok; if (ok) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', 'true'); }
}

/** Submits the P1 outcome for the ambiguous-site view. */
async function ambiguousP1Submit() {
    const a = state.ambiguous;
    const reason = state.ambiguousRiskReason || '';
    if (typeof p1ReasonValid === 'function' && !p1ReasonValid(reason)) return;
    const btn = document.querySelector('[data-testid="record-outcome"]');
    if (btn) btn.disabled = true;
    try {
        const { ticket } = await api.post('/api/outcomes', {
            type: 'escalate-p1',
            additionalNotes: notesValue('addnotes-amb'),
            siteNo: a.siteNo,
            siteName: `Ambiguous (${a.matches.map(m => m.siteName).join(' / ')})`,
            subject: `Site not identified — risk to trade or health and safety — P1`,
            detail: `OOH could not safely resolve house ID ${a.siteNo} (matches ${a.matches.map(m => m.siteName).join(' and ')}). Customer indicated immediate risk to trade or health and safety.`,
            p1Reason: reason,
            p1Summary: typeof p1SummaryFromReason === 'function' ? p1SummaryFromReason(reason) : reason.slice(0, 80),
            OohCaptureClass: 'data-quality'
        });
        toast(`✅ Raised as P1 — ticket <b>#${ticket.id}</b> — on-call agent will call back`);
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
        if (btn) btn.disabled = false;
        return;
    }
    state.ambiguousRisk = undefined;
    state.ambiguousRiskReason = undefined;
    state.ambiguousNotes = undefined;
    go('home');
}

async function ambiguousCapture() {
    const a = state.ambiguous;
    try {
        const { ticket } = await api.post('/api/outcomes', {
            type: 'capture',
            additionalNotes: notesValue('addnotes-amb'), // OOHDASH-119
            siteNo: a.siteNo,
            siteName: `Ambiguous (${a.matches.map(m => m.siteName).join(' / ')})`,
            subject: `Ambiguous house ID ${a.siteNo} — customer could not be resolved to one site`,
            detail: `OOH could not safely resolve house ID ${a.siteNo} (matches ${a.matches.map(m => m.siteName).join(' and ')}). Captured for IoT priority review.`,
            OohCaptureClass: 'data-quality'
        });
        toast(`✅ Captured as ticket <b>#${ticket.id}</b> — IoT team will resolve the duplicate ID`);
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
    }
    state.ambiguousRisk = undefined;
    state.ambiguousRiskReason = undefined;
    state.ambiguousNotes = undefined;
    go('home');
}

// Q3: state for the confirm gate background load
var _confirmGateSummaryLoaded = false;
var _confirmGateDeviceSummary = null;

function renderConfirmGate() {
    const s = state.pendingSite;
    if (!s) { $('#view').innerHTML = '<div class="content narrow"><div class="card"><h2>Loading…</h2></div></div>'; return; }
    // Q3: show placeholder if background read hasn't landed yet
    const deviceLine = _confirmGateSummaryLoaded && _confirmGateDeviceSummary
        ? esc(_confirmGateDeviceSummary)
        : (s.deviceSummary ? esc(s.deviceSummary) : 'Checking the Lighthouse equipment at this site…');
    // Q3: button disabled until summary arrives; Q4: re-entry guard via _confirmInProgress
    const needsSummary = !_confirmGateSummaryLoaded && !s.deviceSummary;
    const btnLabel = needsSummary ? 'Checking site…' : '✓ This is the right site';
    const btnDisabled = needsSummary ? 'disabled' : '';
    $('#view').innerHTML = `<div class="content narrow"><div class="card" style="padding:26px" data-testid="confirm-gate">
   <h2>${esc(s.siteName)} <span class="mono" style="background:var(--surface-variant);padding:2px 10px;border-radius:6px;margin-left:6px">${esc(s.siteNo)}</span></h2>
   ${siteSubline(s)}
   ${unverifiedNotice(s)}
   <p style="margin:10px 0 4px" data-testid="confirm-device-line">${deviceLine}</p>
   ${sayBox('', `can I just confirm, you\'re calling from ${dyn(s.siteName)}, site number ${dyn(s.siteNo)}?`)}

   <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn primary big" data-testid="confirm-site" onclick="confirmSite()" ${btnDisabled}>${btnLabel}</button>
    <button class="btn big" onclick="go('home')">Search again</button>
   </div></div></div>`;
    performance.clearMarks('confirm-screen-paint'); performance.mark('confirm-screen-paint');
    // Q3: if summary not yet loaded, fetch it in background
    if (needsSummary) {
        fetch(`/api/sites/${encodeURIComponent(s.siteNo)}/summary`)
            .then(r => r.json())
            .then(data => {
                _confirmGateSummaryLoaded = true;
                _confirmGateDeviceSummary = data.deviceSummary || null;
                // Re-render confirm gate to update device line and enable button
                if (state.view === 'site' && !state.confirmToken) renderConfirmGate();
            })
            .catch(() => { _confirmGateSummaryLoaded = true; });
    }
}

// Q4: re-entry guard — prevents duplicate confirm POSTs from rapid clicks
var _confirmInProgress = false;

async function confirmSite() {
    // Q4: re-entry guard — only the first click fires; later clicks do nothing
    if (_confirmInProgress) return;
    _confirmInProgress = true;
    // Disable button and show spinner immediately
    const btn = document.querySelector('[data-testid="confirm-site"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Opening site…'; }
    const searchAgainBtn = document.querySelector('.btn.big:not([data-testid="confirm-site"])');
    if (searchAgainBtn) searchAgainBtn.disabled = true;
    try {
        const { confirmToken, workspace, callId } = await api.post(`/api/sites/${encodeURIComponent(state.siteNo)}/confirm`);
        state.confirmToken = confirmToken;
        state.workspace = workspace;
        // OOHDASH-159 rev 5 (E1): the server started the call record when the site was confirmed.
        state.call = { id: callId || null, issues: [] };
        if (!state.recent.some(r => r.siteNo === workspace.site.siteNo)) {
            state.recent.unshift({ siteNo: workspace.site.siteNo, siteName: workspace.site.siteName, t: now() });
            state.recent = state.recent.slice(0, 5);
        }
        scheduleWorkspaceRefresh();
    } catch (err) {
        _confirmInProgress = false;  // allow retry on error
        toast(`⚠️ ${esc(err.message)}`);
        if (err.resolution?.status === 'ambiguous') { state.ambiguous = err.resolution; }
    }
    render();
    if (state.confirmToken) {
        performance.clearMarks('workspace-ready'); performance.mark('workspace-ready');
        uxBeacon(state.siteNo);
    }
}

let wsRefreshTimer = null;
function scheduleWorkspaceRefresh() {
    clearInterval(wsRefreshTimer);
    wsRefreshTimer = setInterval(async () => {
        if (state.view !== 'site' || !state.confirmToken || state.flow || window.ctl) return;
        try {
            const { workspace } = await api.get(`/api/sites/${encodeURIComponent(state.siteNo)}/workspace?confirmToken=${state.confirmToken}`);
            state.workspace = workspace;
            if (state.view === 'site') render();
        } catch { /* keep last reads; degraded banner comes from /api/me */ }
    }, 30000);
}

// One-shot workspace refresh called by flow handlers after a control action, so the
// banner and hold list are current without waiting for the 30-second auto-timer.
// Does NOT call render() — caller is responsible for that.
async function refreshWorkspace() {
    if (!state.confirmToken || !state.siteNo) return;
    try {
        const { workspace } = await api.get(`/api/sites/${encodeURIComponent(state.siteNo)}/workspace?confirmToken=${state.confirmToken}`);
        state.workspace = workspace;
    } catch { /* keep last reads */ }
}

// Presence-driven scope tag. Hot water gets an out-of-scope-with-context reading
// at `mon` ("monitored / not adjustable from here") rather than the generic
// "Monitored only", so a combi observed-but-not-controllable reads honestly and
// never as a bare "Not on Lighthouse here". `ctl` still flips on live presence.
// OOHDASH-159 rev 4: 'offline' (every device of that kind offline) and 'unreachable' (the site wall unit
// is offline, so nothing at the site can be reached) are new truthful levels.
function scopeTag(g) {
    if (g.level === 'unreachable') return '<span class="tag amber">Can\'t be reached right now</span>';
    if (g.level === 'offline') return '<span class="tag amber">Not responding right now</span>';
    // D2: unknown — data unavailable (grey tag with dashed border)
    if (g.level === 'unknown') return '<span class="tag" style="color:var(--on-surface-variant,#666);border-style:dashed">? Data unavailable</span>';
    if (g.level === 'ctl') return '<span class="tag green">Controllable from here</span>';
    if (g.level === 'mon') {
        return g.key === 'hotwater'
            ? '<span class="tag grey">Monitored — not adjustable from here</span>'
            : '<span class="tag grey">Monitored only</span>';
    }
    return g.key === 'hotwater'
        ? '<span class="tag grey">Not controllable here</span>'
        : '<span class="tag grey">Not on Lighthouse here</span>';
}

function renderWorkspace() {
    const ws = state.workspace;
    const s = ws.site;
    const flowHtml = state.flow ? renderFlow() : `
   ${ws.anyOffline ? `<div class="alert err" data-testid="offline-banner" style="display:flex;flex-direction:column;gap:6px;margin:0 0 10px"><div style="display:flex;align-items:center;gap:10px">📡 <b>Some Lighthouse equipment at this site is not responding.</b></div><p class="small" data-testid="offline-banner-optional-hint" style="margin:0">The questions check the equipment for you if your issue involves it.</p></div>` : ''}
   ${ws.anyUnknown ? `<div class="alert" data-testid="unknown-banner" style="display:flex;flex-direction:column;gap:6px;margin:0 0 10px;border-color:var(--on-surface-variant,#999);color:var(--on-surface-variant,#555)"><div style="display:flex;align-items:center;gap:10px">❓ <b>We couldn't read some Lighthouse equipment just now.</b></div><p class="small" style="margin:0">It may be working — we just can't see it. The page will try again in 30 seconds.</p></div>` : ''}
   ${ws.degraded ? `<div class="alert warn" data-testid="degraded-banner">⚠️ Live reads are unavailable — flows will pass issues to the IoT team rather than make changes.</div>` : ''}
   <div class="card">
   ${callSoFar()}
   <h3>What is the customer reporting?</h3>
   <input class="issueinput" id="iq" data-testid="smart-entry" placeholder="Type it in the customer&#39;s words — e.g. &quot;pub is freezing&quot;, &quot;no power in the kitchen&quot;..." autocomplete="off" oninput="issueSearch(this.value)">
   <div class="sugg" id="isugg"></div>
   <div class="tiles" data-testid="category-tiles">${CATS.map(c => `<div class="tile" data-testid="tile-${c.k}" onclick="startTileFlow('${c.k}')"><div class="tt">${c.ic} ${c.t}</div><div class="td">${c.d}</div></div>`).join('')}</div></div>`;

    $('#view').innerHTML = `<div class="content"><div class="wsgrid">
  <div>
   <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 18px">
    <div><h2 style="display:inline">${esc(s.siteName)}</h2> <span class="mono">${esc(s.siteNo)}</span>${siteSubline(s)}</div>
    ${s.callsLast30Days >= 2 ? `<span class="tag amber" title="OOH tickets in the last 30 days">🔁 ${s.callsLast30Days} calls this month</span>` : ''}
    <button class="btn link" style="margin-left:auto" onclick="endCall()">End call</button>
   </div>
   ${renderP1Banner(ws)}
   ${renderBoostHoldBanner(ws)}
   ${flowHtml}
  </div>
  <div>
   <div class="card tight"><h3>What Lighthouse controls at this site</h3><ul class="scopelist" data-testid="scope-list">
    ${ws.scope.map(g => `<li><span${g.level === 'none' ? ' style="color:var(--text-disabled)"' : ''}>${esc(g.label)}</span>${scopeTag(g)}</li>`).join('')}
   </ul><p class="small" style="margin-top:6px" data-testid="scope-footnote">From this site\'s equipment list and its connection right now.</p></div>
   <div class="card tight"><h3>Open tickets for this site</h3>${siteTickets(ws)}</div>
  </div></div></div>`;
    if (!state.flow) $('#iq')?.focus();
}

function callSoFar() {
    if (!state.call || !state.call.issues.length) return '';
    return `<div class="callsofar" data-testid="call-so-far"><b>This call so far:</b> ${state.call.issues.map(i =>
        `<span class="tag ${i.cls}" style="margin:0 4px 0 6px">${esc(i.label)}</span>${i.ticket ? `<span class="small">${tktLink(i.ticket)}</span>` : ''}`).join(' ')}</div>`;
}

// OOHDASH-117 F4a — P1 escalation banner (safety-critical pre-triage signal)
function renderP1Banner(ws) {
    const tickets = ws.activeP1Tickets;
    if (!tickets || tickets.length === 0) return '';
    const first = tickets[0];
    // OOHDASH-159 rev 5 (A1): OOH agents can't open Zendesk. The ticket number opens the in-app ticket page in a new tab.
    const linkHtml = ` Ticket ${tktLink(first.id, 'p1-banner-ticket')}: ${esc(first.status?.agent || '')}.`;
    return `<div class="statusstrip p1-banner" data-testid="p1-escalation-banner" style="display:flex;align-items:flex-start;gap:10px">
  <span style="font-size:1.2em;flex-shrink:0">🚨</span>
  <div><b>Active P1 escalation on record for this site — review before advising.</b>${linkHtml}${tickets.length > 1 ? ` <span class="small">(${tickets.length} active P1 tickets)</span>` : ''}</div>
</div>`;
}

// OOHDASH-144 §10.1 — boost hold banner (shown at the top of the site page).
// State machine: idle → confirm → working → done/pending/changed/error.
var _holdBannerConfirm = {}; // { [holdId]: 'confirm'|'working'|'done'|'pending'|'changed'|'error' }
var _holdBannerResult = {};  // { [holdId]: { result, hold } }
// Timers put back to normal stay on the banner with their result until dismissed (§10.1),
// even though they have left activeBoostHolds (so the flow intercept clears).
var _holdBannerFinished = {}; // { [holdId]: { hold, siteNo } }

function renderBoostHoldBanner(ws) {
    var siteNo = ws && ws.site ? String(ws.site.siteNo) : '';
    var active = ws.activeBoostHolds || [];
    var finished = Object.keys(_holdBannerFinished).map(function(id) { return _holdBannerFinished[id]; })
        .filter(function(f) { return f.siteNo === siteNo && !active.some(function(h) { return h.id === f.hold.id; }); })
        .map(function(f) { return f.hold; });
    var holds = active.concat(finished);
    if (!holds.length) return '';

    function fmtTime(isoOrMs) {
        if (!isoOrMs) return '';
        var d = new Date(isoOrMs);
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    var rows = holds.map(function(h) {
        var phase = _holdBannerConfirm[h.id] || 'idle';
        var dir = h.direction === 'on' ? 'on' : 'off';
        var dirEmoji = dir === 'on' ? '🔥' : '❄';
        var zLabel = h.boilerZone === 'CHZ2' ? 'Zone 2' : 'Zone 1';
        var untilStr = fmtTime(h.revertAt);
        var who = h.createdBy ? h.createdBy.split(' ')[0] : 'someone';

        var stateHtml = '';
        if (phase === 'idle') {
            var desc = dirEmoji + ' ' + zLabel + ': heating turned ' + dir + (untilStr ? ' until ' + untilStr : '') + ', by ' + esc(who);
            stateHtml = '<div class="hb-row"><span class="hb-state">' + desc + '</span>' +
                '<button class="btn" data-testid="hb-cancel-' + h.id + '" onclick="holdBannerCancel(\'' + h.id + '\')">' +
                'Put back to normal now</button></div>';
        } else if (phase === 'confirm') {
            stateHtml = '<div class="hb-row"><span class="hb-state">Put ' + zLabel + ' back to its normal timetable now?</span>' +
                '<button class="btn primary" data-testid="hb-confirm-yes-' + h.id + '" onclick="holdBannerConfirmYes(\'' + h.id + '\',\'' + h.boilerZone + '\')">Yes, put it back</button>' +
                '<button class="btn" onclick="holdBannerKeep(\'' + h.id + '\')">Keep it</button></div>';
        } else if (phase === 'working') {
            stateHtml = '<div class="hb-row"><span class="hb-state">⏳ Putting it back… this can take up to 30 seconds.</span></div>';
        } else if (phase === 'done') {
            var r = _holdBannerResult[h.id] || {};
            var tkt = (r.hold || {}).ticketId;
            var tktStr = tkt ? ' Noted on ticket ' + tktLink(tkt) + '.' : '';
            stateHtml = '<div class="hb-row alert ok" style="margin:0"><span class="hb-state">✅ ' + zLabel + ' is back to normal.' + tktStr + ' ' +
                '<span class="say" style="display:inline;background:none;border:none;padding:0;font-size:inherit">Say to the customer: "That\'s done. Your heating is back on its normal timetable."</span>' +
                '</span><button class="btn" onclick="holdBannerDismiss(\'' + h.id + '\')">Dismiss</button></div>';
        } else if (phase === 'pending') {
            var tkt2 = ((_holdBannerResult[h.id] || {}).hold || {}).ticketId;
            var tktStr2 = tkt2 ? ' on ticket ' + tktLink(tkt2) : '';
            stateHtml = '<div class="hb-row alert warn" style="margin:0"><span class="hb-state">⏳ We\'ve asked the heating to go back to normal, but the controls haven\'t confirmed yet. We\'ll keep trying. If the heating doesn\'t switch off in the next few minutes, the IoT helpdesk is alerted automatically' + tktStr2 + '.</span></div>';
        } else if (phase === 'changed') {
            var tkt3 = ((_holdBannerResult[h.id] || {}).hold || {}).ticketId;
            var tktStr3 = tkt3 ? ' It is on ticket ' + tktLink(tkt3) + ' for the IoT helpdesk to check the next working day.' : '';
            stateHtml = '<div class="hb-row alert warn" style="margin:0"><span class="hb-state">⚠ Someone has changed ' + zLabel + ' at the heating controls since we did, so we\'ve left it as it is.' + tktStr3 + '</span><button class="btn" onclick="holdBannerDismiss(\'' + h.id + '\')">Dismiss</button></div>';
        } else if (phase === 'finished') {
            stateHtml = '<div class="hb-row"><span class="hb-state">This had already finished. Refreshing…</span></div>';
        } else if (phase === 'error') {
            stateHtml = '<div class="hb-row alert err" style="margin:0"><span class="hb-state">Couldn\'t put it back: ' + esc((_holdBannerResult[h.id] || {}).error || 'try again') + '.</span>' +
                '<button class="btn" onclick="holdBannerCancel(\'' + h.id + '\')">Try again</button></div>';
        }
        return stateHtml;
    }).join('');

    return '<div class="hold-banner" data-testid="boost-hold-banner">' +
        '<div class="hb-title">We\'ve changed the heating at this site</div>' + rows + '</div>';
}

function holdBannerCancel(id) {
    _holdBannerConfirm[id] = 'confirm';
    render();
}

function holdBannerKeep(id) {
    delete _holdBannerConfirm[id];
    render();
}

function holdBannerDismiss(id) {
    delete _holdBannerConfirm[id];
    delete _holdBannerResult[id];
    delete _holdBannerFinished[id];
    // Remove from workspace holds so banner disappears.
    if (state.workspace && state.workspace.activeBoostHolds) {
        state.workspace.activeBoostHolds = state.workspace.activeBoostHolds.filter(function(h) { return h.id !== id; });
    }
    render();
}

function holdBannerConfirmYes(id, zone) {
    _holdBannerConfirm[id] = 'working';
    render();
    api.post('/api/sites/' + state.workspace.site.siteNo + '/booster-holds/' + id + '/cancel', { confirmToken: state.confirmToken }).then(function(res) {
        var result = res.result;
        _holdBannerResult[id] = res;
        if (result === 'reverted' || result === 'already-auto') {
            _holdBannerConfirm[id] = 'done';
        } else if (result === 'pending') {
            _holdBannerConfirm[id] = 'pending';
        } else if (result === 'superseded' || result === 'left-forced') {
            _holdBannerConfirm[id] = 'changed';
        } else {
            _holdBannerConfirm[id] = 'done';
        }
        // Remove from active holds so flow intercept clears; keep the row on the banner with its result.
        var finishedHold = (state.workspace && state.workspace.activeBoostHolds || []).find(function(h) { return h.id === id; });
        if (finishedHold) _holdBannerFinished[id] = { hold: finishedHold, siteNo: String(state.workspace.site.siteNo) };
        if (state.workspace && state.workspace.activeBoostHolds) {
            state.workspace.activeBoostHolds = state.workspace.activeBoostHolds.filter(function(h) { return h.id !== id; });
        }
        // Also push a put-back action to the flow if one is running.
        if (state.flow && state.flow.data) {
            state.flow.data.actions = state.flow.data.actions || [];
            state.flow.data.actions.push({ kind: 'put-back', zones: [zone], result: result, ticketId: (res.hold || {}).ticketId || null, atMs: Date.now() });
        }
        render();
    }).catch(function(err) {
        var code = err.message || '';
        // §10.1: a timer that already ended shows "already finished" and refreshes; other codes get plain words.
        if (code === 'hold-ended' || code === 'hold-not-found') {
            _holdBannerConfirm[id] = 'finished';
            render();
            setTimeout(function() { refreshWorkspace(); }, 1500);
            return;
        }
        var plain = { 'not-confirmed': 'confirm the site first, then try again', 'hold-changed': 'it was changed at the same moment, so try again' }[code];
        _holdBannerResult[id] = { error: plain || 'the heating controls didn\'t accept the change, so try again' };
        _holdBannerConfirm[id] = 'error';
        render();
    });
}

// OOHDASH-89/91 (E, shared decision): the always-on "Live device status" side card and its
// `deviceBoard` table were removed. Device state is triage-question-led — it surfaces ONLY as a
// high-assurance Q&A outcome (the flow reachability conclusions), never as a standing readout.

// OOHDASH-159 rev 5 (A1): open tickets raised from this dashboard, P1s first with a badge, and the plain current
// status from the IoT team's ticket. Each opens the in-app ticket page in a new tab.
function siteTickets(ws) {
    if (!ws.tickets.length) return '<p class="small" data-testid="site-tickets-empty">No open tickets raised from this dashboard.</p>';
    return '<p class="small" style="margin:-4px 0 4px">Raised from this dashboard, with their status right now.</p>' + ws.tickets.map(t =>
        `<div class="stepdone siteticket" data-testid="site-ticket"><a class="tktrow" href="/ticket/${encodeURIComponent(String(t.id))}" target="_blank" rel="noopener" title="Opens the ticket in a new tab">${t.isP1 ? '<span class="tag red" data-testid="site-ticket-p1">P1</span> ' : ''}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">${esc(t.subject)}</span> <span class="small">#${esc(String(t.id))}</span></a><div class="small" data-testid="site-ticket-status">${esc(t.status.agent)}</div></div>`).join('');
}

function endCall() {
    callFinalise('end-call'); // OOHDASH-159 rev 5 (E1): publishes the whole call record
    notesDraftClear(); // OOHDASH-119: clear the sessionStorage draft at explicit end-of-call
    clearInterval(wsRefreshTimer);
    state.flow = null;
    state.call = null;
    go('home');
}

/* ------------------------ ticket drawer (thread + notes, F015) ------------------------ */
async function openTicketDrawer(ticketId, cbTicket) {
    let threadHtml = '<p class="small">Loading thread…</p>';
    state.drawer = drawerShell(ticketId, cbTicket, threadHtml);
    paintDrawer();
    try {
        const { thread } = await api.get(`/api/tickets/${ticketId}/thread`);
        threadHtml = thread.length ? `<div class="timeline">${thread.slice().reverse().map(c =>
            `<div class="tlitem"><div class="tw">${esc(new Date(c.at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}</div>${esc(c.body)}</div>`).join('')}</div>`
            : '<p class="small">No notes yet.</p>';
    } catch (err) {
        threadHtml = `<div class="alert err">Couldn\'t load the thread: ${esc(err.message)}</div>`;
    }
    state.drawer = drawerShell(ticketId, cbTicket, threadHtml);
    paintDrawer();
}

function drawerShell(ticketId, cbTicket, threadHtml) {
    return `<div class="dh">Ticket #${ticketId}<button class="btn link" onclick="state.drawer=null;paintDrawer()">✕</button></div><div class="db">
  ${cbTicket ? `<p><b>${esc(cbTicket.subject)}</b></p>
  <p class="small" style="margin-bottom:10px">Opened ${esc(cbTicket.createdFriendly)} · <span class="tag blue">${esc(cbTicket.status.agent)}</span></p>
  ${sayBox(esc(cbTicket.script), '', { testid: 'caller-script' })}
  ${cbTicket.visit ? '<div class="alert warn" data-testid="chargeable-warning">⚠️ <b>Engineer visit involved</b> — remind the customer: if the fault turns out not to be Lighthouse equipment, the visit may be chargeable.</div>' : ''}
  <h3 style="margin-top:14px">Customer expects an update by…</h3>
  <div style="display:flex;gap:8px;margin-bottom:14px"><input type="date" id="fud" style="border:1.5px solid var(--border);border-radius:6px;padding:7px 10px"><button class="btn" onclick="saveFollowUp(${ticketId})">Save follow-up</button></div>` : ''}
  <h3>Notes &amp; feedback thread</h3>
  <p class="small" style="margin-bottom:8px">Shared with the IoT team — replies made in the IoT Support dashboard appear here.</p>
  <div id="thread">${threadHtml}</div>
  <div class="formrow" style="margin-top:12px"><label>Add a note for the IoT team</label><textarea id="notebody" data-testid="note-input" rows="2"></textarea></div>
  <button class="btn primary" data-testid="note-send" onclick="sendNote(${ticketId})">Send note</button>
 </div>`;
}

async function sendNote(ticketId) {
    const body = $('#notebody')?.value?.trim();
    if (!body) return;
    try {
        await api.post(`/api/tickets/${ticketId}/notes`, { body });
        toast('✅ Note added — the IoT team will see it on the ticket');
        openTicketDrawer(ticketId, state.cb.data ? findCbTicket(ticketId) : null);
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
    }
}

async function saveFollowUp(ticketId) {
    const date = $('#fud')?.value;
    if (!date) return;
    try {
        await api.post(`/api/tickets/${ticketId}/followup`, { date });
        toast(`📅 Follow-up date saved to ticket #${ticketId}`);
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
    }
}

/* ------------------------ callback lookup (§3.5, F013) ------------------------ */
function vCallback() {
    const cb = state.cb;
    $('#view').innerHTML = `<div class="content narrow">
  <div class="card"><h2>Callback Lookup</h2><p class="sub" style="margin-bottom:12px">"I called earlier — what\'s happening?" Find the site, read the script. Use ↑ ↓ and Enter to pick.</p>
  <div class="searchwrap"><input id="cbq" data-testid="callback-search" placeholder="House number or pub name" autocomplete="off"><div id="cbres"></div></div></div>
  ${cb.error ? `<div class="alert err">${esc(cb.error)}</div>` : ''}
  ${cb.data ? cbTickets() : ''}
 </div>`;
    bindSearch('cbq', 'cbres', pickCallbackSite);
    if (!cb.data) $('#cbq').focus();
}

async function pickCallbackSite(siteNo) {
    state.cb = { siteNo, data: null, tab: 'active', error: null };
    render();
    try {
        state.cb.data = await api.get(`/api/callback/${encodeURIComponent(siteNo)}`);
    } catch (err) {
        state.cb.error = err.degraded
            ? 'Zendesk is unreachable — take the customer\'s details and start a new call to capture the issue; it will be logged as soon as connectivity returns.'
            : err.message;
    }
    render();
}

function cbTickets() {
    const { tickets } = state.cb.data;
    const tab = state.cb.tab;
    const list = tickets[tab] || [];
    return `<div class="card" data-testid="callback-results">
  <div class="tabs">${[['active', 'Active'], ['recent', 'Recent'], ['closed', 'Closed']].map(([k, l]) =>
        `<button class="${tab === k ? 'on' : ''}" onclick="state.cb.tab='${k}';render()">${l}<span class="cnt">${tickets[k].length}</span></button>`).join('')}</div>
  ${list.length ? list.map(t =>
        `<div class="stepdone" style="cursor:pointer" onclick='openTicketDrawer(${t.id}, findCbTicket(${t.id}))'><span class="tag ${t.visit ? 'amber' : 'blue'}">${esc(t.status.agent)}</span><span style="flex:1">${esc(t.subject)}</span><span class="small">#${t.id} · ${esc(t.updatedFriendly)}</span></div>`).join('')
        : `<p class="small" style="padding:8px 0" data-testid="callback-empty">No tickets for this site in the last 90 days — if the customer insists they rang, take details and <button class="btn link" onclick="openSite('${esc(state.cb.siteNo)}')">start a new call</button>.</p>`}
 </div>`;
}

function findCbTicket(id) {
    const g = state.cb.data?.tickets;
    if (!g) return null;
    return [...g.active, ...g.recent, ...g.closed].find(t => t.id === id) || null;
}

/* ------------------------ tonight (§3.6) ------------------------ */
const OUTCOME_CHIP = {
    synced: '<span class="tag green">applied ✓</span>',
    pending: '<span class="tag amber">confirming…</span>',
    captured: '<span class="tag blue">captured</span>',
    p1: '<span class="tag red">P1 escalated</span>',
    scope: '<span class="tag grey">closed note</span>',
    'no-action': '<span class="tag grey">no action</span>',
    timeout: '<span class="tag amber">timeout</span>',
    failed: '<span class="tag red">failed</span>',
    rejected: '<span class="tag red">rejected</span>',
    query: '<span class="tag violet">query</span>',
    note: '<span class="tag grey">note</span>',
    admin: '<span class="tag grey">admin</span>',
    'revert-failed': '<span class="tag red">revert failed</span>'
};

/* B7 R9: tonightChip and tonightWhat — richer outcome chip + detail for the Tonight table */
function tonightChip(a) {
    const oc = a.outcome;
    const cls = a.OohCaptureClass || '';
    if (cls === 'boiler-boost-on' || cls === 'boiler-boost-off') {
        if (oc === 'NON-DELIVERY') return '<span class="tag red">not delivered</span>';
        if (cls === 'boiler-boost-on') return '<span class="tag blue">heating turned on</span>';
        return '<span class="tag blue">heating turned off</span>';
    }
    if (cls === 'boiler-boost-cancel') {
        if (oc === 'reverted' || oc === 'synced' || oc === 'confirmed') return '<span class="tag green">back to normal</span>';
        if (oc === 'already-auto') return '<span class="tag grey">changed on site</span>';
        if (oc === 'left-forced') return '<span class="tag amber">left as found</span>';
        if (oc === 'pending') return '<span class="tag amber">confirming…</span>';
    }
    if (cls === 'boiler-revert') {
        if (oc === 'confirmed') return '<span class="tag green">back to normal</span>';
        if (oc === 'revert-failed') return '<span class="tag red">did not go back</span>';
    }
    if (cls === 'kitchen-oneoff') {
        if (oc === 'booked' || oc === 'on') return '<span class="tag blue">one-off booked/on</span>';
        if (oc === 'done' || oc === 'handed-back') return '<span class="tag green">one-off done</span>';
        if (oc === 'missed' || oc === 'off-failed') return '<span class="tag red">not carried out</span>';
        if (oc === 'cancelled') return '<span class="tag grey">cancelled</span>';
    }
    if (oc === 'appended') return '<span class="tag blue">added to ticket</span>';
    if (oc === 'synced') return '<span class="tag green">applied ✓</span>';
    if (oc === 'indeterminate') return '<span class="tag amber">not confirmed</span>';
    if (oc === 'scope') return '<span class="tag grey">closed note</span>';
    return OUTCOME_CHIP[oc] || '<span class="tag grey">logged</span>';
}

function tonightWhat(a) {
    const cls = a.OohCaptureClass || '';
    const zone = a.zone ? ' (' + esc(a.zone) + ')' : '';
    const oc = a.outcome;
    if (cls === 'boiler-boost-on') {
        return oc === 'NON-DELIVERY'
            ? 'Tried to turn the heating on' + zone
            : 'Heating turned on' + zone;
    }
    if (cls === 'boiler-boost-off') {
        return oc === 'NON-DELIVERY'
            ? 'Tried to turn the heating off' + zone
            : 'Heating turned off' + zone;
    }
    if (cls === 'boiler-boost-cancel') return 'Heating put back to normal' + zone;
    if (cls === 'boiler-revert') return 'Heating went back to normal by itself' + zone;
    if (cls === 'kitchen-oneoff') return esc(a.detail || '');
    // strip control-failure annotation for all other classes
    return esc((a.detail || '').replace(/\s*·\s*class:\s*control-failure/g, ''));
}

async function vTonight() {
    $('#view').innerHTML = `<div class="content"><div class="card"><h2>Tonight</h2><p class="sub">Loading…</p></div></div>`;
    try {
        state.tonight = await api.get('/api/tonight');
    } catch (err) {
        $('#view').innerHTML = `<div class="content"><div class="card"><h2>Tonight</h2><div class="alert err">${esc(err.message)} <button class="btn" onclick="vTonight()">Retry</button></div></div></div>`;
        return;
    }
    paintTonight();
}

function paintTonight() {
    const q = state.tonightFilter.trim().toLowerCase();
    const rows = (state.tonight?.entries || []).filter(a =>
        !q || (a.siteName || '').toLowerCase().includes(q) || (a.siteNo || '').includes(q));
    $('#view').innerHTML = `<div class="content">
  <div class="card">
   <h2>Tonight</h2><p class="sub" style="margin-bottom:10px">Every call and action in the current out-of-hours period (since 17:00). Anything older is one for the IoT team — raise a query rather than digging.</p>
   <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">
    <input class="issueinput" data-testid="tonight-filter" style="max-width:320px;height:38px;margin:0" placeholder="Filter by site or house number…" value="${esc(state.tonightFilter)}" oninput="state.tonightFilter=this.value;paintTonight()">
    <button class="btn" style="margin-left:auto" data-testid="raise-query" onclick="raiseQuery()">❓ Raise a query with the IoT team</button>
   </div>
   ${rows.length ? `<table class="tbl" data-testid="tonight-table"><tr><th>Time</th><th>Site</th><th>Agent</th><th>What happened</th><th>Outcome</th><th>Ticket</th></tr>
   ${rows.map(a => `<tr><td>${esc(new Date(a.OohActionAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</td>
    <td>${a.siteName ? `<b>${esc(a.siteName)}</b> <span class="mono">${esc(a.siteNo || '')}</span>` : '—'}</td>
    <td>${esc(a.operatorName)}</td><td>${tonightWhat(a)}</td>
    <td>${tonightChip(a)}</td>
    <td>${a.ticketId ? `${tktLink(a.ticketId)}` : '—'}</td></tr>`).join('')}</table>`
        : `<p class="small" style="padding:10px 0" data-testid="tonight-empty">${q ? 'No activity matching that filter tonight.' : 'No activity yet tonight.'}</p>`}
   <p class="small" style="margin-top:10px">The IoT team\'s morning review (mark-as-reviewed, P1 acknowledgements, feedback) happens in the <b>IoT Support dashboard</b>, which receives all of this automatically.</p>
  </div></div>`;
}

function raiseQuery() {
    openModal(`<div data-testid="query-modal"><div class="mh">Raise a query with the IoT team<button class="btn link" onclick="closeModal()">✕</button></div><div class="mb">
  <p class="sub" style="margin-bottom:10px">For anything older than tonight, or anything you\'re unsure about — this goes straight onto a ticket for the team.</p>

  <div class="formrow"><label>Site (if known)</label><input id="qsite" data-testid="query-site" placeholder="e.g. 6832"></div>
  <div class="formrow"><label>Your query</label><textarea id="qtxt" data-testid="query-text" rows="3" placeholder="e.g. Customer says they rang two nights ago about fryers — can\'t see it tonight"></textarea></div>

  ${notesField({ id: 'addnotes-q' })}
 </div><div class="mf"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" data-testid="query-send" onclick="sendQuery()">Send query</button></div></div>`);
}

async function sendQuery() {
    const text = $('#qtxt')?.value?.trim();
    if (!text) { toast('⚠️ Describe the query first'); return; }
    try {
        const { ticket } = await api.post('/api/query', {
            siteNo: $('#qsite')?.value?.trim() || null,
            text,
            additionalNotes: notesValue('addnotes-q') // OOHDASH-119
        });
        closeModal();
        toast(`✅ Query sent to the IoT team — ticket <b>#${ticket.id}</b>`);
        if (state.view === 'tonight') vTonight();
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
    }
}

/* ------------------------ admin (§3.7, IoT only) ------------------------ */
async function vAdmin() {
    $('#view').innerHTML = `<div class="content narrow"><div class="card"><h2>Admin</h2><p class="sub">Loading…</p></div></div>`;
    try {
        const [ks, ov, reg, nt, dq, sms, alerts, metrics] = await Promise.all([
            api.get('/api/admin/killswitch'),
            api.get('/api/admin/overrides'),
            api.get('/api/admin/registry'),
            api.get('/api/admin/notices'),
            api.get('/api/admin/data-quality'),
            api.get('/api/admin/sms-log'),
            api.get('/api/admin/alerts'),
            api.get('/api/admin/metrics')
        ]);
        state.admin = { ks, ov: ov.overrides, reg, nt: nt.notices, dq: dq.flags, sms: sms.log, alerts: alerts.alerts, metrics };
    } catch (err) {
        $('#view').innerHTML = `<div class="content narrow"><div class="card"><h2>Admin</h2><div class="alert err">${esc(err.message)} <button class="btn" onclick="vAdmin()">Retry</button></div></div></div>`;
        return;
    }
    paintAdmin();
}

function paintAdmin() {
    const a = state.admin;
    const m = a.metrics;
    $('#view').innerHTML = `<div class="content narrow">
  <div class="alert info" style="margin-top:0">The morning <b>Review Queue</b> (mark-as-reviewed, P1 log, handler feedback) lives in the <b>IoT Support dashboard</b> (F026). This page holds the OOH app\'s own safety rails.</div>
  ${a.alerts.length ? `<div class="card" style="border-color:var(--danger)"><h3>🔔 Active alerts</h3>${a.alerts.map(al =>
        `<div class="stepdone"><span>⚠️</span><div style="flex:1"><b>${esc(al.code)}</b><div class="small">${esc(al.message)} · ${esc(new Date(al.raisedAt).toLocaleString('en-GB'))}${al.count > 1 ? ` · ×${al.count}` : ''}</div></div><button class="btn link" onclick="clearAlert('${al.id}')">Clear</button></div>`).join('')}</div>` : ''}
  <div class="card" data-testid="admin-killswitch">
   <h3>Device control kill-switch</h3>
   <div style="display:flex;align-items:center;gap:14px;padding:8px 0">
    <button class="sw ${a.ks.global ? 'off' : 'on'}" data-testid="kill-global" onclick="toggleKill()"></button>
    <div><b>${a.ks.global ? 'Writes DISABLED globally' : 'Writes enabled'}</b><div class="small">${a.ks.global ? `${esc(a.ks.reason)} (${esc(a.ks.actor)}) — reads and capture-and-escalate continue to work` : 'Turning this off blocks every device write at runtime, no redeploy needed'}</div></div>
   </div>
   <h3 style="margin-top:14px">Per-site</h3>
   <div class="formrow"><input id="kssite" placeholder="House number, e.g. 6832" style="max-width:220px"> <button class="btn" onclick="siteKill(true)">Disable writes for site</button></div>
   ${Object.keys(a.ks.sites || {}).length ? `<table class="tbl">${Object.entries(a.ks.sites).map(([no, s]) =>
        `<tr><td><span class="mono">${esc(no)}</span> — ${esc(s.reason)} <span class="small">(${esc(s.actor)})</span></td><td style="text-align:right"><button class="btn link" onclick="siteKillOff('${esc(no)}')">Re-enable</button></td></tr>`).join('')}</table>` : '<p class="small">No per-site switches engaged.</p>'}
  </div>
  <div class="card" data-testid="admin-holds"><h3>Active timed overrides (holds)</h3>
   ${a.ov.length ? `<table class="tbl"><tr><th>Site</th><th>Device</th><th>Held</th><th>Reverts</th><th>Set by</th><th></th></tr>${a.ov.map(h =>
        `<tr${h.status === 'revert-failed' ? ' style="background:var(--danger-light)"' : ''}><td><b>${esc(h.siteName)}</b> <span class="mono">${esc(h.siteNo)}</span></td><td><span class="mono">${esc(h.deviceId)}</span><div class="small">${esc(h.zone)}</div></td><td>${esc(h.heldValue)} <span class="small">(was ${esc(h.revertValue)})</span></td><td>⏱️ ${esc(new Date(h.OohOverrideRevertAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}${h.status === 'revert-failed' ? ' <span class="tag red">revert failed</span>' : ''}</td><td>${esc(h.createdBy)}</td>
    <td><button class="btn link" onclick="cancelHold('${h.id}')">Cancel hold</button></td></tr>`).join('')}</table>`
        : '<p class="small">No active holds. Reverts fire exactly once, survive restarts, and appear here while running (also mirrored to the IoT Support dashboard queue).</p>'}
  </div>
  <div class="card"><h3>Service metrics <span class="tag grey">last ${m.windowDays} days</span></h3>
   <table class="tbl" data-testid="admin-metrics">
    <tr><td>Self-serve rate</td><td><b>${m.selfServeRate == null ? '—' : Math.round(m.selfServeRate * 100) + '%'}</b> <span class="small">(${m.totals.callOutcomes} outcomes)</span></td></tr>
    <tr><td>Control success rate</td><td><b>${m.controlSuccessRate == null ? '—' : Math.round(m.controlSuccessRate * 100) + '%'}</b> <span class="small">(${m.totals.controlActions} dispatched · ${m.controlFailures} failed)</span></td></tr>
    <tr><td>P1 escalations / SLA</td><td><b>${m.totals.p1Escalations}</b> <span class="small">${m.p1SlaMedianMinutes != null ? '· median ack ' + m.p1SlaMedianMinutes + ' min' : '· no acks recorded yet'}</span></td></tr>
    <tr><td>Captured for next day</td><td><b>${m.totals.captured}</b> <span class="small">${Object.entries(m.captureVolumeByClass).map(([k, v]) => `${esc(k)}: ${v}`).join(' · ') || ''}</span></td></tr>
   </table>
  </div>
  <div class="card"><h3>P1 escalation log</h3>
   ${a.sms.length ? `<table class="tbl">${a.sms.map(sl =>
        `<tr><td>${esc(new Date(sl.dispatchedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td><b>${esc(sl.siteName)}</b> <span class="mono">${esc(sl.siteNo)}</span></td><td>Raised with ooh_p1 tag · IoT Support Dashboard sends a text message to the on-call agent</td><td>${tktLink(sl.ticketId)}</td><td>${sl.OohP1AckAt ? `<span class="tag green">ack ${esc(new Date(sl.OohP1AckAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</span>` : `<button class="btn link" onclick="ackP1('${sl.id}')">Mark acknowledged</button>`}</td></tr>`).join('')}</table>` : '<p class="small">No P1 escalations raised yet.</p>'}
  </div>
  <div class="card"><h3>Capability &amp; guardrail registry <span class="tag grey">read-only mirror of server registry</span></h3>
   <table class="tbl" data-testid="admin-registry"><tr><th>Device type</th><th>Allowed commands</th><th>Ranges (app policy)</th></tr>
   ${a.reg.deviceTypes.map(d => `<tr><td>${esc(d.label)}</td><td>${d.commands.length ? d.commands.map(c => `<span class="mono">${esc(c)}</span>`).join(', ') : '— none —'}</td>
    <td>${d.deviceRange ? `±${a.reg.policy.setpointDeltaMax}°C of current, cap ${a.reg.policy.setpointCap}°C (device ${d.deviceRange.min}–${d.deviceRange.max})` : d.boostRange ? `${d.boostRange.min}–${d.boostRange.max}h, 0 cancels` : 'capture &amp; escalate only (SD-515 / SR-4)'}${d.modes ? ` · modes ${d.modes.join('/')}` : ''}${d.slowEcho ? ' · slow echo — timeout handling applies' : ''}</td></tr>`).join('')}</table>
  </div>
  <div class="card" data-testid="admin-notices"><h3>New-site / shift notices</h3>
   ${a.nt.length ? a.nt.map(n => `<div class="stepdone"><span>📣</span><div style="flex:1"><b>${esc(n.OohNoticeTitle)}</b><div class="small">${esc(n.OohNoticeBody)}</div></div><button class="btn link" onclick="retireNotice('${n.noticeId}')">Retire</button></div>`).join('') : '<p class="small">No active notices.</p>'}
   <div class="formrow" style="margin-top:10px"><label>New notice</label><input id="ntitle" data-testid="notice-title" placeholder="Title (shows on handlers' New Call page)"><textarea id="nbody" data-testid="notice-body" rows="2" style="margin-top:6px" placeholder="Body"></textarea></div>
   <button class="btn" data-testid="notice-publish" onclick="publishNotice()">Publish notice</button>
  </div>
  <div class="card"><h3>Data-quality flags</h3>
   ${a.dq.length ? a.dq.map(d => `<div class="stepdone"><span>⚠️</span><div><div class="small">${esc(new Date(d.at).toLocaleString('en-GB'))}</div>${esc(d.text)}</div></div>`).join('') : '<p class="small">No flags recorded.</p>'}
  </div></div>`;
}

async function toggleKill() {
    const engaged = state.admin.ks.global;
    if (!engaged) {
        const reason = prompt('Reason for disabling all device writes (required, shown to handlers):');
        if (!reason) return;
        try { state.admin.ks = await api.post('/api/admin/killswitch/global', { enabled: true, reason }); }
        catch (err) { toast(`⚠️ ${esc(err.message)}`); }
    } else {
        try { state.admin.ks = await api.post('/api/admin/killswitch/global', { enabled: false }); toast('✅ Device writes re-enabled'); }
        catch (err) { toast(`⚠️ ${esc(err.message)}`); }
    }
    await refreshMe();
    render();
}

async function siteKill(enabled) {
    const siteNo = $('#kssite')?.value?.trim();
    if (!siteNo) { toast('⚠️ Enter a house number first'); return; }
    const reason = prompt(`Reason for disabling writes for site ${siteNo} (required):`);
    if (!reason) return;
    try { state.admin.ks = await api.post('/api/admin/killswitch/site', { siteNo, enabled, reason }); }
    catch (err) { toast(`⚠️ ${esc(err.message)}`); }
    await refreshMe();
    render();
}

async function siteKillOff(siteNo) {
    try { state.admin.ks = await api.post('/api/admin/killswitch/site', { siteNo, enabled: false }); }
    catch (err) { toast(`⚠️ ${esc(err.message)}`); }
    await refreshMe();
    render();
}

async function cancelHold(id) {
    if (!confirm('Revert this hold now?')) return;
    try {
        const { override } = await api.post(`/api/admin/overrides/${id}/cancel`);
        toast(override.status === 'reverted' ? '↩️ Hold reverted — device confirmed' : `⚠️ Revert status: ${esc(override.status)}`);
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
    }
    vAdmin();
}

async function publishNotice() {
    const title = $('#ntitle')?.value?.trim();
    const body = $('#nbody')?.value?.trim();
    if (!title) { toast('⚠️ Notice needs a title'); return; }
    try {
        await api.post('/api/admin/notices', { title, body });
        toast('📣 Notice published to handlers');
        await refreshMe();
        vAdmin();
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
    }
}

async function retireNotice(id) {
    try { await api.del(`/api/admin/notices/${id}`); await refreshMe(); vAdmin(); }
    catch (err) { toast(`⚠️ ${esc(err.message)}`); }
}

async function ackP1(id) {
    try { await api.post(`/api/admin/sms-log/${id}/ack`); vAdmin(); }
    catch (err) { toast(`⚠️ ${esc(err.message)}`); }
}

async function clearAlert(id) {
    try { await api.post(`/api/admin/alerts/${id}/clear`); vAdmin(); }
    catch (err) { toast(`⚠️ ${esc(err.message)}`); }
}
