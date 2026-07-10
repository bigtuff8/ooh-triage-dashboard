/**
 * Views: New Call (home), Site Workspace (confirmation gate + picker), Callback
 * Lookup, Tonight (shift view), Admin (IoT only). Design spec §3.
 */

/* ------------------------ home (§3.1) ------------------------ */
function vHome() {
    $('#view').innerHTML = `<div class="content narrow">
  <div class="card" style="padding:26px">
   <h2>Who’s calling?</h2>
   <p class="sub" style="margin-bottom:14px">Ask for the <b>house number</b> (4 digits) — or search by pub name. Use ↑ ↓ and Enter to pick.</p>
   <div class="searchwrap"><input id="sq" data-testid="site-search" placeholder="e.g. 6832 or Old Grey Mare" autocomplete="off"><div id="sres"></div></div>
   <p class="small" style="margin-top:12px">Caller ringing back about an earlier issue? <button class="btn link" onclick="go('callback')">Use Callback Lookup →</button></p>
  </div>
  <div class="card">
   <h3>Recent calls tonight (yours)</h3>
   ${state.recent.length ? state.recent.map(r =>
        `<div class="stepdone" style="cursor:pointer" onclick="openSite('${esc(r.siteNo)}')"><span>📞</span> <b>${esc(r.siteName)}</b> <span class="mono">${esc(r.siteNo)}</span> <span class="small" style="margin-left:auto">${esc(r.t)}</span></div>`).join('')
        : '<p class="small">No calls yet this shift. The whole shift’s activity is under <b>Tonight</b>.</p>'}
  </div></div>`;
    bindSearch('sq', 'sres', openSite);
    $('#sq').focus();
}

/* ------------------------ resolution + workspace (§3.2, F004) ------------------------ */
async function openSite(siteNo) {
    state.view = 'site';
    state.siteNo = siteNo;
    state.pendingSite = null;
    state.ambiguous = null;
    state.confirmToken = null;
    state.workspace = null;
    state.flow = null;
    state.call = null;
    render();
    $('#view').innerHTML = `<div class="content narrow"><div class="card" style="padding:26px"><h2>Looking up site ${esc(siteNo)}…</h2></div></div>`;
    try {
        const result = await api.get(`/api/sites/${encodeURIComponent(siteNo)}/resolve`);
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

function renderAmbiguous() {
    const a = state.ambiguous;
    $('#view').innerHTML = `<div class="content narrow"><div class="card" style="border-color:var(--warning)" data-testid="ambiguous-card">
   <h2>⚠️ House ID ${esc(a.siteNo)} is ambiguous</h2>
   <p class="sub" style="margin:8px 0">This ID matches more than one site (${a.matches.map(m => `<b>${esc(m.siteName)}</b>`).join(' and ')}). To protect against changing the wrong site, remote control is blocked for ambiguous IDs.</p>
   <div class="script">“I can’t safely make changes for this site number tonight — I’ll log this for the IoT team as a priority and they’ll pick it up.”</div>
   <button class="btn primary" data-testid="ambiguous-capture" onclick="ambiguousCapture()">Capture &amp; escalate to IoT</button>
   <button class="btn" onclick="go('home')" style="margin-left:8px">Search again</button>
  </div></div>`;
}

async function ambiguousCapture() {
    const a = state.ambiguous;
    try {
        const { ticket } = await api.post('/api/outcomes', {
            type: 'capture',
            siteNo: a.siteNo,
            siteName: `Ambiguous (${a.matches.map(m => m.siteName).join(' / ')})`,
            subject: `Ambiguous house ID ${a.siteNo} — caller could not be resolved to one site`,
            detail: `OOH could not safely resolve house ID ${a.siteNo} (matches ${a.matches.map(m => m.siteName).join(' and ')}). Captured for IoT priority review.`,
            captureClass: 'data-quality'
        });
        toast(`✅ Captured as ticket <b>#${ticket.id}</b> — IoT team will resolve the duplicate ID`);
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
    }
    go('home');
}

function renderConfirmGate() {
    const s = state.pendingSite;
    if (!s) { $('#view').innerHTML = '<div class="content narrow"><div class="card"><h2>Loading…</h2></div></div>'; return; }
    $('#view').innerHTML = `<div class="content narrow"><div class="card" style="padding:26px" data-testid="confirm-gate">
   <h2>${esc(s.siteName)} <span class="mono" style="background:var(--surface-variant);padding:2px 10px;border-radius:6px;margin-left:6px">${esc(s.siteNo)}</span></h2>
   <p class="sub">${esc(s.brand)} · ${esc(s.address)}</p>
   <p style="margin:10px 0 4px">${esc(s.deviceSummary)}</p>
   <div class="script">“Can I just confirm — you’re calling from <b>${esc(s.siteName)}</b>, site number <b>${esc(s.siteNo)}</b>?”</div>
   <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn primary big" data-testid="confirm-site" onclick="confirmSite()">✓ This is the right site</button>
    <button class="btn big" onclick="go('home')">Search again</button>
   </div></div></div>`;
}

async function confirmSite() {
    try {
        const { confirmToken, workspace } = await api.post(`/api/sites/${encodeURIComponent(state.siteNo)}/confirm`);
        state.confirmToken = confirmToken;
        state.workspace = workspace;
        state.call = { issues: [] };
        if (!state.recent.some(r => r.siteNo === workspace.site.siteNo)) {
            state.recent.unshift({ siteNo: workspace.site.siteNo, siteName: workspace.site.siteName, t: now() });
            state.recent = state.recent.slice(0, 5);
        }
        scheduleWorkspaceRefresh();
    } catch (err) {
        toast(`⚠️ ${esc(err.message)}`);
        if (err.resolution?.status === 'ambiguous') { state.ambiguous = err.resolution; }
    }
    render();
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

function renderWorkspace() {
    const ws = state.workspace;
    const s = ws.site;
    const flowHtml = state.flow ? renderFlow() : `
   ${ws.anyOffline ? `<div class="alert err" data-testid="offline-banner" style="display:flex;align-items:center;gap:10px;margin:0 0 10px">📡 <b>Some Lighthouse equipment at this site is not responding.</b><button class="btn" style="margin-left:auto" onclick="startFlow('connectivity')">Run connection check</button></div>` : ''}
   ${ws.degraded ? `<div class="alert warn" data-testid="degraded-banner">⚠️ Live reads are unavailable — flows will capture &amp; escalate rather than make changes.</div>` : ''}
   <div class="card">
   ${callSoFar()}
   <h3>What is the caller reporting?</h3>
   <input class="issueinput" id="iq" data-testid="smart-entry" placeholder="Type it in the caller’s words — e.g. “pub is freezing”, “no power in the kitchen”…" autocomplete="off" oninput="issueSearch(this.value)">
   <div class="sugg" id="isugg"></div>
   <div class="tiles" data-testid="category-tiles">${CATS.map(c => `<div class="tile" data-testid="tile-${c.k}" onclick="startFlow('${c.k}')"><div class="tt">${c.ic} ${c.t}</div><div class="td">${c.d}</div></div>`).join('')}</div></div>`;

    $('#view').innerHTML = `<div class="content"><div class="wsgrid">
  <div>
   <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 18px">
    <div><h2 style="display:inline">${esc(s.siteName)}</h2> <span class="mono">${esc(s.siteNo)}</span><div class="sub">${esc(s.brand)} · ${esc(s.address)}</div></div>
    ${s.callsLast30Days >= 2 ? `<span class="tag amber" title="OOH tickets in the last 30 days">🔁 ${s.callsLast30Days} calls this month</span>` : ''}
    <button class="btn link" style="margin-left:auto" onclick="endCall()">End call</button>
   </div>
   ${flowHtml}
  </div>
  <div>
   <div class="card tight"><h3>Live device status</h3>${deviceBoard(ws)}</div>
   <div class="card tight"><h3>What Lighthouse controls at this site</h3><ul class="scopelist" data-testid="scope-list">
    ${ws.scope.map(g => `<li><span${g.level === 'none' ? ' style="color:var(--text-disabled)"' : ''}>${esc(g.label)}</span>${g.level === 'ctl' ? '<span class="tag green">Controllable from here</span>' : g.level === 'mon' ? '<span class="tag grey">Monitored only</span>' : '<span class="tag grey">Not on Lighthouse here</span>'}</li>`).join('')}
   </ul><p class="small" style="margin-top:6px">Live from the device inventory — use it to answer “isn’t that you?”</p></div>
   <div class="card tight"><h3>Open tickets for this site</h3>${siteTickets(ws)}</div>
  </div></div></div>`;
    if (!state.flow) $('#iq')?.focus();
}

function callSoFar() {
    if (!state.call || !state.call.issues.length) return '';
    return `<div class="callsofar" data-testid="call-so-far"><b>This call so far:</b> ${state.call.issues.map(i =>
        `<span class="tag ${i.cls}" style="margin:0 4px 0 6px">${esc(i.label)}</span>${i.ticket ? `<span class="small">#${i.ticket}</span>` : ''}`).join(' ')}</div>`;
}

function deviceBoard(ws) {
    if (!ws.devices.length) return '<p class="small">No Lighthouse devices found for this site — use the Something else flow for a scope check.</p>';
    return `<table class="tbl" data-testid="device-board">${ws.devices.map(d => {
        const t = d.telemetry || {};
        const on = d.online ? '<span class="tag green"><span class="dot" style="background:var(--success)"></span>online</span>'
            : '<span class="tag red"><span class="dot" style="background:var(--danger)"></span>offline</span>';
        let rd = '—';
        if (d.kind === 'heating' && typeof t.localTemperature === 'number') rd = `<b>${t.localTemperature}°C</b> <span class="small">set ${t.heatingSetpoint}°C${t.mode ? ' · ' + esc(t.mode) : ''}</span>`;
        else if (d.kind === 'heating' && typeof t.roomSensor1Temp === 'number') rd = `<b>${t.roomSensor1Temp}°C</b> <span class="small">boiler panel${t.output1State ? ' · heating on' : ''}</span>`;
        else if (d.kind === 'heating') rd = '<span class="small">no reading</span>';
        if (d.kind === 'hotwater') rd = t.hwBoostHours ? `<b>Boost ${t.hwBoostHours}h</b>` : '<span class="small">no boost active</span>';
        if (d.kind === 'kitchen') rd = (t.switch_1 ? '<b>On</b>' : 'Off') + (d.schedule ? ` <span class="small">${esc(d.schedule)}</span>` : '');
        return `<tr class="${d.online ? '' : 'rowoff'}"><td style="width:52%"><b style="font-size:13px">${esc(d.zone)}</b><div class="mono" style="color:var(--text-disabled);font-size:11px">${esc(d.deviceId)}</div></td><td>${on}</td><td>${rd}</td></tr>`;
    }).join('')}</table>`;
}

function siteTickets(ws) {
    if (!ws.tickets.length) return '<p class="small">No tickets in the last 90 days.</p>';
    return ws.tickets.map(t =>
        `<div class="stepdone" style="cursor:pointer" onclick="openTicketDrawer(${t.id})"><span class="tag ${t.visit ? 'amber' : t.status.raw === 'open' ? 'blue' : 'violet'}">${esc(t.status.agent)}</span> <span style="flex:1;font-size:13px">${esc(t.subject)}</span> <span class="small">#${t.id}</span></div>`).join('');
}

function endCall() {
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
        threadHtml = `<div class="alert err">Couldn’t load the thread: ${esc(err.message)}</div>`;
    }
    state.drawer = drawerShell(ticketId, cbTicket, threadHtml);
    paintDrawer();
}

function drawerShell(ticketId, cbTicket, threadHtml) {
    return `<div class="dh">Ticket #${ticketId}<button class="btn link" onclick="state.drawer=null;paintDrawer()">✕</button></div><div class="db">
  ${cbTicket ? `<p><b>${esc(cbTicket.subject)}</b></p>
  <p class="small" style="margin-bottom:10px">Opened ${esc(cbTicket.createdFriendly)} · <span class="tag blue">${esc(cbTicket.status.agent)}</span></p>
  <h3>Read to the caller</h3><div class="script" data-testid="caller-script">“${esc(cbTicket.script)}”</div>
  ${cbTicket.visit ? '<div class="alert warn" data-testid="chargeable-warning">⚠️ <b>Engineer visit involved</b> — remind the caller: if the fault turns out not to be Lighthouse equipment, the visit may be chargeable.</div>' : ''}
  <h3 style="margin-top:14px">Caller expects an update by…</h3>
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
  <div class="card"><h2>Callback Lookup</h2><p class="sub" style="margin-bottom:12px">“I called earlier — what’s happening?” Find the site, read the script. Use ↑ ↓ and Enter to pick.</p>
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
            ? 'Zendesk is unreachable — take the caller’s details and start a new call to capture the issue; it will be logged as soon as connectivity returns.'
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
        : `<p class="small" style="padding:8px 0" data-testid="callback-empty">No tickets for this site in the last 90 days — if the caller insists they rang, take details and <button class="btn link" onclick="openSite('${esc(state.cb.siteNo)}')">start a new call</button>.</p>`}
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
    scope: '<span class="tag grey">not Lighthouse</span>',
    'no-action': '<span class="tag grey">no action</span>',
    timeout: '<span class="tag amber">timeout</span>',
    failed: '<span class="tag red">failed</span>',
    rejected: '<span class="tag red">rejected</span>',
    query: '<span class="tag violet">query</span>',
    note: '<span class="tag grey">note</span>',
    admin: '<span class="tag grey">admin</span>',
    'revert-failed': '<span class="tag red">revert failed</span>'
};

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
    <td>${esc(a.operatorName)}</td><td>${esc(a.detail)}</td>
    <td>${OUTCOME_CHIP[a.outcome] || esc(a.outcome || '')}</td>
    <td>${a.ticketId ? `<button class="btn link" style="padding:0" onclick="openTicketDrawer(${a.ticketId})">#${a.ticketId}</button>` : '—'}</td></tr>`).join('')}</table>`
        : `<p class="small" style="padding:10px 0" data-testid="tonight-empty">${q ? 'No activity matching that filter tonight.' : 'No activity yet tonight.'}</p>`}
   <p class="small" style="margin-top:10px">The IoT team’s morning review (mark-as-reviewed, P1 acknowledgements, feedback) happens in the <b>IoT Support dashboard</b>, which receives all of this automatically.</p>
  </div></div>`;
}

function raiseQuery() {
    openModal(`<div class="mh">Raise a query with the IoT team<button class="btn link" onclick="closeModal()">✕</button></div><div class="mb">
  <p class="sub" style="margin-bottom:10px">For anything older than tonight, or anything you’re unsure about — this goes straight onto a ticket for the team.</p>
  <div class="formrow"><label>Site (if known)</label><input id="qsite" data-testid="query-site" placeholder="e.g. 6832"></div>
  <div class="formrow"><label>Your query</label><textarea id="qtxt" data-testid="query-text" rows="3" placeholder="e.g. Caller says they rang two nights ago about fryers — can’t see it tonight"></textarea></div>
 </div><div class="mf"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" data-testid="query-send" onclick="sendQuery()">Send query</button></div>`);
}

async function sendQuery() {
    const text = $('#qtxt')?.value?.trim();
    if (!text) { toast('⚠️ Describe the query first'); return; }
    try {
        const { ticket } = await api.post('/api/query', { siteNo: $('#qsite')?.value?.trim() || null, text });
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
  <div class="alert info" style="margin-top:0">The morning <b>Review Queue</b> (mark-as-reviewed, P1 log, handler feedback) lives in the <b>IoT Support dashboard</b> (F026). This page holds the OOH app’s own safety rails.</div>
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
  <div class="card"><h3>P1 text-message log</h3>
   ${a.sms.length ? `<table class="tbl">${a.sms.map(sl =>
        `<tr><td>${esc(new Date(sl.dispatchedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td><b>${esc(sl.siteName)}</b> <span class="mono">${esc(sl.siteNo)}</span></td><td>${esc(sl.sentTo)}${sl.dispatchOk ? '' : ' <span class="tag red">send failed</span>'}</td><td><a href="${esc(sl.OohP1EscalationLink)}" target="_blank" rel="noopener">#${sl.ticketId}</a></td><td>${sl.OohP1AckAt ? `<span class="tag green">ack ${esc(new Date(sl.OohP1AckAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</span>` : `<button class="btn link" onclick="ackP1('${sl.id}')">Mark acknowledged</button>`}</td></tr>`).join('')}</table>` : '<p class="small">No P1 texts sent yet.</p>'}
  </div>
  <div class="card"><h3>Capability &amp; guardrail registry <span class="tag grey">read-only mirror of server registry</span></h3>
   <table class="tbl" data-testid="admin-registry"><tr><th>Device type</th><th>Allowed commands</th><th>Ranges (app policy)</th></tr>
   ${a.reg.deviceTypes.map(d => `<tr><td>${esc(d.label)}</td><td>${d.commands.length ? d.commands.map(c => `<span class="mono">${esc(c)}</span>`).join(', ') : '— none —'}</td>
    <td>${d.deviceRange ? `±${a.reg.policy.setpointDeltaMax}°C of current, cap ${a.reg.policy.setpointCap}°C (device ${d.deviceRange.min}–${d.deviceRange.max})` : d.boostRange ? `${d.boostRange.min}–${d.boostRange.max}h, 0 cancels` : 'capture &amp; escalate only (SD-515 / SR-4)'}${d.modes ? ` · modes ${d.modes.join('/')}` : ''}${d.slowEcho ? ' · slow echo — timeout handling applies' : ''}</td></tr>`).join('')}</table>
  </div>
  <div class="card" data-testid="admin-notices"><h3>New-site / shift notices</h3>
   ${a.nt.length ? a.nt.map(n => `<div class="stepdone"><span>📣</span><div style="flex:1"><b>${esc(n.OohNoticeTitle)}</b><div class="small">${esc(n.OohNoticeBody)}</div></div><button class="btn link" onclick="retireNotice('${n.noticeId}')">Retire</button></div>`).join('') : '<p class="small">No active notices.</p>'}
   <div class="formrow" style="margin-top:10px"><label>New notice</label><input id="ntitle" data-testid="notice-title" placeholder="Title (shows on handlers’ New Call page)"><textarea id="nbody" data-testid="notice-body" rows="2" style="margin-top:6px" placeholder="Body"></textarea></div>
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
