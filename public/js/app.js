/**
 * App shell: state, navigation, banners, toasts, modal/drawer plumbing,
 * keyboard-navigable site search (design §2/§3.1).
 */

/* ------------------------ state ------------------------ */
const state = {
    me: null,               // /api/me payload: operator, killSwitch, notices, degraded, version
    view: 'home',
    siteNo: null,
    pendingSite: null,      // resolved-but-unconfirmed site (confirmation gate)
    ambiguous: null,        // { siteNo, matches }
    confirmToken: null,
    workspace: null,
    flow: null,
    call: null,             // { issues: [{label, cls, ticket}] }
    recent: [],
    tonight: null,
    tonightFilter: '',
    cb: { siteNo: null, data: null, tab: 'active', error: null },
    admin: null,
    drawer: null,
    loadError: null
};

const $ = s => document.querySelector(s);
const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 4200);
}

/**
 * Blocking reason for writes: F005 deploy-time lock, kill-switch (F016) or degraded reads
 * (TQ-8) — all fail safe to capture-and-escalate.
 *
 * R8/S10 secondary behaviour: this predicate now ALSO consults ks.writesDisabled (the F005
 * deploy-time lock echoed on /api/me via killSwitch). Previously the deploy lock produced only
 * a server-side 423 with NO client block; consulting it here yields a proper client-side block
 * while control is OFF (canary/pre-flip), so the block is loud in the UI, not just at dispatch.
 */
function writesDisabled(siteNo) {
    const ks = state.me?.killSwitch;
    if (ks?.writesDisabled) return 'Device control is disabled at deploy time (safety/canary lock) — changes can’t be sent yet';
    if (ks?.global) return `Device control is switched off globally — ${esc(ks.reason || '')} (${esc(ks.actor || '')})`;
    if (siteNo && ks?.sites?.[siteNo]) return `Device control is switched off for this site — ${esc(ks.sites[siteNo].reason)} (${esc(ks.sites[siteNo].actor)})`;
    if (state.me?.degraded || state.workspace?.degraded) return 'Live device reads are unavailable (degraded mode) — changes can’t be confirmed';
    return null;
}

/* ------------------------ boot / me ------------------------ */
// R8/S10: keys for the client-side, per-session control-live transition scaffold.
const CTRL_LIVE_SEEN = 'ooh.controlLive.lastSeen';   // last-observed controlLive: 'true' | 'false'
const CTRL_LIVE_ACKED = 'ooh.controlLive.acked';     // first-use OFF→ON ack recorded this session

/**
 * R8/S10: general last-seen-state compare for the deploy-time control-live flag. Reads the
 * prior observed state from sessionStorage and returns the transition so the caller can act.
 *
 * Kept deliberately general (records the raw current value, reports both edges) so the
 * ON→OFF "returned to safety-lock" signal — DEFERRED to the C5 preflight, NOT built here — is a
 * pure additive follow-on: it can consume the same offToOn/onToOff result with no rework of this
 * scaffold. Only the OFF→ON edge acts today.
 */
function controlLiveTransition() {
    let lastSeen = null;
    try { lastSeen = sessionStorage.getItem(CTRL_LIVE_SEEN); } catch { /* storage may be unavailable */ }
    const live = !!state.me?.controlLive;
    // OFF→ON: we previously recorded OFF and are now live (the flip happened this session).
    const offToOn = lastSeen === 'false' && live;
    // ON→OFF: previously live, now OFF — DEFERRED to C5 preflight (scaffold only, no action today).
    const onToOff = lastSeen === 'true' && !live;
    try { sessionStorage.setItem(CTRL_LIVE_SEEN, live ? 'true' : 'false'); } catch { /* ignore */ }
    if (!live) { try { sessionStorage.removeItem(CTRL_LIVE_ACKED); } catch { /* ignore */ } }
    return { lastSeen, live, offToOn, onToOff };
}

/**
 * R8/S10: fire the one-time first-use acknowledgement modal on the OFF→ON transition ONLY.
 * Already-ON-at-load (lastSeen unset + live) shows the banner but NO modal — that handler joined
 * an already-live shift; the interrupt would be noise. Interrupt-precedence: the ack must not
 * stack on an open confirm modal (window.ctl in a compose/confirm dispatch) — defer silently in
 * that case; the persistent live-banner in the shell strip already conveys state.
 */
function maybeControlLiveAck() {
    const t = controlLiveTransition();
    if (!t.offToOn) return;
    let acked = null;
    try { acked = sessionStorage.getItem(CTRL_LIVE_ACKED); } catch { /* ignore */ }
    if (acked === 'true') return;                 // already acked this session — do not re-fire
    if (window.ctl) return;                       // never stack on an in-flight confirm/dispatch
    try { sessionStorage.setItem(CTRL_LIVE_ACKED, 'true'); } catch { /* ignore */ }
    openModal(`<div data-testid="control-live-ack">
      <h3 style="margin-bottom:8px">Device control is now LIVE</h3>
      <p class="small" style="margin-bottom:16px">Changes you send will reach real equipment. Continue with care — confirm the site before every change.</p>
      <div class="mrow" style="justify-content:flex-end"><button class="btn primary" data-testid="control-live-ack-ok" onclick="closeModal()">I understand</button></div>
    </div>`);
}

async function refreshMe() {
    state.me = await api.get('/api/me');
    maybeControlLiveAck();
}

async function boot() {
    try {
        await refreshMe();
        state.loadError = null;
    } catch (err) {
        state.loadError = err.message;
    }
    render();
}

/* ------------------------ shell ------------------------ */
function render() {
    if (state.loadError) {
        document.getElementById('app').innerHTML =
            `<div class="content narrow" style="margin:60px auto"><div class="alert err"><b>Can’t load the OOH Dashboard.</b> ${esc(state.loadError)} <button class="btn" style="margin-left:10px" onclick="boot()">Retry</button></div></div>`;
        return;
    }
    const op = state.me.operator;
    const isIot = op.role === 'iot';
    const ws = state.workspace;
    const kill = writesDisabled(state.siteNo);
    const notice = state.me.notices?.[0];
    document.getElementById('app').innerHTML = `
 <div class="sidebar">
  <div class="brand">OOH Dashboard<small>Lighthouse out-of-hours support</small></div>
  <div class="nav">
   <button data-testid="nav-home" class="${state.view === 'home' || state.view === 'site' ? 'active' : ''}" onclick="go('home')">📞 New Call</button>
   <button data-testid="nav-callback" class="${state.view === 'callback' ? 'active' : ''}" onclick="go('callback')">↩️ Callback Lookup</button>
   <button data-testid="nav-tonight" class="${state.view === 'tonight' ? 'active' : ''}" onclick="go('tonight')">🌙 Tonight</button>
   ${isIot ? `<button data-testid="nav-admin" class="${state.view === 'admin' ? 'active' : ''}" onclick="go('admin')">🛡️ Admin</button>` : ''}
  </div>
  <div class="foot">
   <div class="opchip"><div class="avatar">${esc(op.name.split(' ').map(w => w[0]).join('').slice(0, 2))}</div>
    <div><div class="nm" data-testid="operator-name">${esc(op.name)}</div><div class="rl">${esc(op.roleLabel)} · signed in via SSO</div></div></div>
   <button class="btn link" style="padding:2px 0" onclick="signOut()">Sign out</button>
  </div>
 </div>
 <div class="main">
  <div class="topbar">
   <span class="ctx">${ws && state.confirmToken ? `${esc(ws.site.siteName)} · <span class="mono">${esc(ws.site.siteNo)}</span>` : ({ home: 'New Call', callback: 'Callback Lookup', tonight: 'Tonight', admin: 'Admin', site: 'New Call' })[state.view]}</span>
   <span class="ver">v${esc(state.me.version)}${state.me.dataMode === 'fixture' ? ' · fixture data' : ''}</span>
  </div>
  ${kill ? `<div class="banner kill" data-testid="kill-banner">⛔ ${kill} — control actions are disabled; capture &amp; escalate still works.${isIot ? ' <button class="btn link" onclick="go(\'admin\')">Manage</button>' : ''}</div>` : ''}
  ${state.me.controlLive ? `<div class="banner live" data-testid="control-live-banner">🟢 <b>Device control is LIVE</b> — changes you send will reach real equipment. Confirm the site before every change.</div>` : ''}
  ${notice && (state.view === 'home' || state.view === 'site') ? `<div class="banner notice" data-testid="notice-banner">📣 <b>${esc(notice.OohNoticeTitle)}</b>&nbsp;${esc(notice.OohNoticeBody)}</div>` : ''}
  <div id="view"></div>
 </div>`;
    ({ home: vHome, site: vSite, callback: vCallback, tonight: vTonight, admin: vAdmin })[state.view]();
    paintDrawer();
}

async function go(v) {
    state.view = v;
    if (v === 'home') {
        state.siteNo = null; state.pendingSite = null; state.ambiguous = null;
        state.confirmToken = null; state.workspace = null; state.flow = null; state.call = null;
    }
    try { await refreshMe(); } catch { /* keep last known me */ }
    render();
}

async function signOut() {
    try { await api.post('/auth/logout'); } catch { /* session may already be gone */ }
    window.location.href = '/auth/login';
}

/* ------------------------ site search (keyboard-navigable) ------------------------ */
let srch = { hits: [], sel: -1, onPick: null, boxId: '', timer: null };

function bindSearch(inputId, boxId, onPick) {
    srch = { hits: [], sel: -1, onPick, boxId, timer: null };
    const inp = $('#' + inputId);
    inp.addEventListener('input', () => {
        clearTimeout(srch.timer);
        srch.timer = setTimeout(() => searchInput(inp.value), 180);
    });
    inp.addEventListener('keydown', e => {
        if (!srch.hits.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); srch.sel = Math.min(srch.sel + 1, srch.hits.length - 1); paintSel(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); srch.sel = Math.max(srch.sel - 1, 0); paintSel(); }
        else if (e.key === 'Enter' && srch.sel >= 0) { e.preventDefault(); srch.onPick(srch.hits[srch.sel].siteNo); }
    });
}

async function searchInput(q) {
    const box = $('#' + srch.boxId);
    if (!box) return;
    q = q.trim();
    srch.sel = -1;
    if (!q) { srch.hits = []; box.innerHTML = ''; return; }
    let results;
    try {
        ({ results } = await api.get(`/api/sites/search?q=${encodeURIComponent(q)}`));
    } catch (err) {
        srch.hits = [];
        box.innerHTML = `<div class="sresults"><div class="empty">${err.degraded
            ? '<b>The device inventory is unreachable right now.</b> You can still capture the caller’s issue — go to a manual capture via “Something else” once the site is known, or raise it in Tonight → Raise a query.'
            : esc(err.message)}</div></div>`;
        return;
    }
    srch.hits = results;
    if (!results.length) {
        box.innerHTML = `<div class="sresults"><div class="empty" data-testid="search-empty"><b>No site matches “${esc(q)}”.</b><br>Check the house number with the caller. If it’s still not found, the site may not be on Lighthouse — search by pub name, or capture &amp; escalate.</div></div>`;
        return;
    }
    box.innerHTML = `<div class="sresults" data-testid="search-results">${results.map((s, i) =>
        `<div class="ri" data-i="${i}" onmouseenter="srch.sel=${i};paintSel()" onclick="srch.onPick('${esc(s.siteNo)}')">
   <span class="mono" style="background:var(--surface-variant);padding:2px 8px;border-radius:4px">${esc(s.siteNo)}</span>
   <div><b>${esc(s.siteName)}</b><div class="small">${esc(s.brand)}</div></div>
   ${s.duplicate ? '<span class="tag amber" style="margin-left:auto">duplicate ID</span>' : ''}</div>`).join('')}</div>`;
}

function paintSel() {
    document.querySelectorAll('#' + srch.boxId + ' .ri').forEach((el, i) => el.classList.toggle('sel', i === srch.sel));
}

/* ------------------------ modal / drawer plumbing ------------------------ */
function openModal(html, dismissible = true) {
    document.getElementById('modalroot').innerHTML =
        `<div class="overlay" onclick="if(event.target===this&&${dismissible})closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal() { document.getElementById('modalroot').innerHTML = ''; }

function paintDrawer() {
    document.querySelectorAll('.drawer').forEach(x => x.remove());
    if (state.drawer) {
        const d = document.createElement('div');
        d.className = 'drawer';
        d.innerHTML = state.drawer;
        document.body.appendChild(d);
    }
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        // Esc never dispatches — it cancels (accessibility §7)
        if (window.ctl && window.ctl.phase === 'compose') { ctlCancel(); return; }
        if (!window.ctl) { closeModal(); if (state.drawer) { state.drawer = null; paintDrawer(); } }
    }
});

boot();
