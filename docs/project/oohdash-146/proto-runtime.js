/* OOHDASH-146 rev 4 prototype runtime. Data (D, GR, FR, HEAD, RT, DL) is injected by build-proto. No network, no build step. */
var S = { id: null, sim: false, failed: false, cust: false, diff: false, last: 'WORKSPACE', caller: { name: 'Priya Shah', role: 'duty manager', phone: '07700 900123', declined: false }, addFrom: null };
var TILE = { heating: 'S6832-cold~1', hotwater: 'RQ:HW:HW-auto', kitchen: 'K-what', lighting: 'L6749~1', fan: 'FAN6851~1', fridge: 'FR6851~1', contractor: 'CT6832~1', other: 'O-0' };
var LABELTO = { '✓ This is the right site': 'WORKSPACE', 'Search again': 'HOME', 'Pass it to the IoT team': 'RQ:SITE-ambiguous-logged', 'Use Callback Lookup →': 'CB-list', 'start a new call': 'HOME', '❓ Raise a query with the IoT team': 'TONIGHT-query', 'Cancel': 'TONIGHT', 'Send query': 'TONIGHT', '✕': 'TONIGHT' };
function $(s, r) { return (r || document).querySelector(s); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toast(t) { var el = $('#toasts'); el.innerHTML = '<div class="toast">' + t + '</div>'; clearTimeout(toast._t); toast._t = setTimeout(function () { el.innerHTML = ''; }, 2600); }
function groupNodes(g) { return GR[g] || []; }
// D16: the permanent caller banner (display only; state lives in S.caller, in memory, for the call)
var SITEB = 'The Wheatsheaf <span class="mono">7412</span>';
function bannerHtml() {
  var c = S.caller || {}, n = (c.name || '').trim(), ro = (c.role || '').trim(), p = (c.phone || '').trim(), who, state, act;
  var role = ro ? '<span class="cb-role"> · ' + esc(ro) + '</span>' : '';
  if (n && p) { who = '<b>' + esc(n) + '</b>' + role + ' · <span class="mono">' + esc(p) + '</span>'; state = 'full'; act = 'Change'; }
  else if (n) { who = '<b>' + esc(n) + '</b>' + role + ' · <span class="cb-quiet">no number taken</span>'; state = 'partial'; act = 'Add details'; }
  else if (p) { who = '<span class="mono">' + esc(p) + '</span>' + role + ' · <span class="cb-quiet">no name taken</span>'; state = 'partial'; act = 'Add details'; }
  else if (ro) { who = esc(ro) + ' · <span class="cb-quiet">no name or number taken</span>'; state = 'partial'; act = 'Add details'; }
  else { who = '<span class="cb-quiet">No contact details taken' + (c.declined ? ' (the customer declined)' : '') + '</span>'; state = 'none'; act = 'Add details'; }
  return '<div class="callbanner" data-testid="caller-banner" data-state="' + state + '" role="region" aria-label="Call in progress"><span class="cb-ico" aria-hidden="true">📞</span><span class="cb-who">' + who + '</span><span class="cb-site"><span class="cb-quiet">Call in progress ·</span> ' + SITEB + '</span><button class="btn link cb-add" data-testid="cb-add" data-to="CD-add">' + act + '</button></div>';
}
function readCaller() {
  var g = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
  var n = g('cd-name'), ro = g('cd-role'), p = g('cd-phone'); if (n === null && ro === null && p === null) return;
  var any = ((n || '') + (ro || '') + (p || '')).trim() !== '';
  S.caller = { name: n || '', role: ro || '', phone: p || '', declined: !any && !!(S.caller && S.caller.declined) };
}
function act(el) {
  var a = el.getAttribute('data-act');
  if (a === 'pick-site') { readCaller(); go('SITE-confirm'); }
  else if (a === 'decline') { readCaller(); S.caller.declined = !S.caller.declined; el.textContent = S.caller.declined ? '✓ Recorded: the customer won\'t give details (press again to undo)' : 'The customer won\'t give these'; }
  else if (a === 'save-details') { readCaller(); var any = ((S.caller.name || '') + (S.caller.role || '') + (S.caller.phone || '')).trim() !== ''; if (any) S.caller.declined = false; go(S.addFrom || 'WORKSPACE'); var sr = $('#srlive'); if (sr) sr.textContent = 'Customer details saved. The call banner is updated.'; }
  else if (a === 'cancel-add') go(S.addFrom || 'WORKSPACE');
}
function go(id, from) {
  var n = D[id]; if (!n) { toast('That screen is not in this prototype.'); return; }
  var prevId = S.id; S.id = id; if (n.k === 'flow' || id === 'WORKSPACE') S.last = id === 'WORKSPACE' ? 'WORKSPACE' : S.last;
  if (id === 'CD-add' && prevId && prevId !== 'CD-add') S.addFrom = prevId;
  draw(); window.scrollTo(0, 0);
}
function stage(n) {
  if (n.k === 'page') return n.ic ? n.h.replace(/(<div class="wsgrid">\s*<div>)/, function (m) { return m + bannerHtml(); }) : n.h;
  var f = FR[n.fr] || FR[Object.keys(FR)[0]];
  var left = (n.ic ? bannerHtml() : '') + (HEAD[n.fr] || '') + (n.p1 ? PB[n.p1] || '' : '') + n.h;
  return f.pre + '<div>' + left + '</div><div>' + (RT[n.r] || '') + '</div>' + f.post;
}
function id0() { return S.id; }
function draw() {
  var n = D[S.id];
  var gsel = $('#gsel'), ssel = $('#ssel');
  var g = n.g;
  if (gsel.value !== g) { gsel.value = g; fillScreens(); }
  ssel.value = S.id;
  var html = stage(n);
  $('#stage').innerHTML = html;
  $('#modalroot').innerHTML = n.m || '';
  var live = n.src ? 'Same markup and wording as live screen ' + n.src : 'New screen in 146';
  var dd = (n.d || []).filter(function (x) { return !(DL[x] && DL[x].note); });
  $('#badge').innerHTML = dd.length ? '<span class="bd diff">Differs from live: ' + dd.join(', ') + '</span>' : (n.src ? '<span class="bd same">Same as live</span>' : '<span class="bd diff">New</span>');
  var panel = '';
  if (S.diff) {
    panel = '<div class="oldtext"><b>' + (dd.length ? 'What differs from live on this screen' : 'This screen is the live v1.6.6 screen') + '</b>' + (n.src ? 'Live source: ' + esc(n.src) + '. ' : 'Not in live. ') +
      (n.d || []).map(function (x) { return '\n' + x + ': ' + esc(DL[x] ? DL[x].title + '. ' + DL[x].what : ''); }).join('') + '</div>';
  }
  $('#diffpanel').innerHTML = panel;
  if (id0() === 'CD-add') { var c = S.caller || {}; ['name', 'role', 'phone'].forEach(function (k) { var el = document.getElementById('cd-' + k); if (el) el.value = c[k] || ''; }); }
  protoH();
  var sr = $('#sres'); if (sr && S.id !== 'SEARCH-none') sr.innerHTML = '';
}
function fillScreens() {
  var g = $('#gsel').value, ssel = $('#ssel');
  ssel.innerHTML = groupNodes(g).map(function (id) { return '<option value="' + id + '">' + esc(D[id].t) + '</option>'; }).join('');
}
function startOf(g) { return (groupNodes(g) || [])[0]; }
function togProto() { var p = $('#proto'); p.classList.toggle('min'); $('#ptog').textContent = p.classList.contains('min') ? 'Show controls' : 'Hide'; protoH(); }
function protoH() { document.documentElement.style.setProperty('--proto-h', $('#proto').offsetHeight + 'px'); }
function resolve(to, btn) {
  if (to === '@end') { S.caller = { name: '', role: '', phone: '', declined: false }; return 'HOME'; }
  if (to === '@another') return 'WORKSPACE';
  if (to === '@cancel') return 'WORKSPACE';
  if (to === '@back') return D[S.id].back || (S.id.indexOf('CTL:') === 0 ? (S.id.indexOf('switch') > 0 ? 'L6961~1' : 'S6832-cold~3') : 'WORKSPACE');
  if (to === 'HEAT:start') return 'S6832-cold~1';
  if (to.indexOf('TILE:') === 0) return TILE[to.slice(5)] || 'WORKSPACE';
  return to;
}
document.addEventListener('click', function (e) {
  if (e.target.closest('#proto')) return;
  var actEl = e.target.closest('[data-act]'); if (actEl) { e.preventDefault(); act(actEl); return; }
  var a = e.target.closest('a');
  if (a) {
    var href = a.getAttribute('href') || '';
    if (/\/ticket\//.test(href)) { e.preventDefault(); toast('In the app this opens ticket ' + esc(a.textContent) + ' in a new tab.'); return; }
    if (/powerpause/.test(href)) return; // opens the revised guide prototype in a new tab
    e.preventDefault(); return;
  }
  var el = e.target.closest('[data-to],button,.tile,.stepdone');
  if (!el) return;
  var n = D[S.id]; if (!n) return;
  var label = (el.textContent || '').trim().replace(/\s+/g, ' ');
  var to = el.getAttribute('data-to');
  if (!to && el.hasAttribute('data-e')) { var idx = +el.getAttribute('data-e'); to = (n.e || [])[idx]; }
  if (!to) {
    if (/^Cancel issue$/.test(label)) to = '@cancel'; else if (/^➕ Raise another issue$/.test(label)) to = '@another'; else if (/^✔ End call$|^End call$/.test(label)) to = '@end';
    else if (LABELTO[label] && n.k === 'page') to = LABELTO[label];
    else if (el.closest('.formrow') && el.classList.contains('chip')) {
      var ans = el.closest('.answers');
      if (ans && ans.getAttribute('data-testid') === 'sched-kind') ans.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('sel'); c.setAttribute('aria-pressed', 'false'); });
      var on = !el.classList.contains('sel'); el.classList.toggle('sel', on); el.setAttribute('aria-pressed', on ? 'true' : 'false'); return;
    } else if (el.tagName === 'BUTTON' && /^\+ Add a note to ticket/.test(label)) { toast('In the app this opens a note box for the ticket.'); return; }
    else if (el.tagName === 'BUTTON' && /^(−|\+)$/.test(label)) { toast('In the app this changes the temperature by 1°C, within the limits shown.'); return; }
    else if (el.tagName === 'BUTTON' && el.closest('.tabs')) { toast('Tabs are the same as live.'); return; }
    else if (el.tagName === 'BUTTON' && /Sign out/.test(label)) { toast('Sign out is the same as live.'); return; }
    else if (el.tagName === 'BUTTON' && /^(Save and continue|Save|Save follow-up|Send note)$/.test(label)) { toast('Saved (same as live).'); return; }
    else if (el.tagName === 'BUTTON' || el.classList.contains('tile')) { toast('In the app this does what live does today (not part of this change).'); return; }
    else return;
  }
  e.preventDefault();
  if (/^Raise the P1$/.test(label) && S.sim && !S.failed) { S.failed = true; go('SH:p1fail'); return; }
  var dest = resolve(to, el);
  if (dest === S.id) { toast('Same as live: the app checks again and, because the equipment is still offline, shows this screen again.'); return; }
  go(dest);
});
document.addEventListener('input', function (e) {
  if (e.target && e.target.getAttribute && e.target.getAttribute('data-search')) {
    var v = e.target.value.trim().toLowerCase(), r = $('#sres');
    r.innerHTML = (v.length >= 3 && ('7412'.indexOf(v) === 0 || 'the wheatsheaf'.indexOf(v) >= 0 || v.indexOf('wheat') >= 0)) ? '<div class="stepdone" style="cursor:pointer;margin-top:6px" data-act="pick-site"><b>The Wheatsheaf</b> <span class="mono">7412</span> · Greene King · Bury St Edmunds</div>' : (v.length >= 3 ? '<div class="stepdone" style="cursor:pointer;margin-top:6px" data-to="SEARCH-none">No site matches "' + esc(e.target.value) + '"</div>' : '');
  }
});
// D13: the P1 button stays disabled until the agent's comment has real content (trimmed, at least 10 characters)
function p1ok(v) { return String(v).replace(/s+/g, ' ').trim().length >= 10; }
document.addEventListener('input', function (e) {
  var t = e.target; if (!t || !t.getAttribute || !t.getAttribute('data-p1c')) return;
  var box = t.closest('.confirm-step'); if (!box) return;
  var b = box.querySelector('[data-testid="record-outcome"]'), ok = p1ok(t.value);
  if (b) { b.disabled = !ok; b.setAttribute('aria-disabled', ok ? 'false' : 'true'); }
  var note = box.querySelector('.p1-blocked-note'); if (note) note.hidden = ok;
  var echo = box.querySelector('[data-p1echo]'); if (echo) echo.textContent = t.value.replace(/s+/g, ' ').trim() || "(you haven't written this yet)";
});
(function boot() {
  var gs = Object.keys(GR);
  $('#gsel').innerHTML = GL.map(function (g) { return '<option value="' + g.id + '">' + esc(g.label) + '</option>'; }).join('');
  $('#gsel').addEventListener('change', function () { fillScreens(); go(startOf(this.value)); });
  $('#ssel').addEventListener('change', function () { go(this.value); });
  $('#showdiff').addEventListener('change', function () { S.diff = this.checked; draw(); });
  $('#bsel').addEventListener('change', function () { var v = this.value; S.caller = v === 'full' ? { name: 'Priya Shah', role: 'duty manager', phone: '07700 900123', declined: false } : v === 'name' ? { name: 'Priya Shah', role: '', phone: '', declined: false } : v === 'number' ? { name: '', role: '', phone: '07700 900123', declined: false } : v === 'declined' ? { name: '', role: '', phone: '', declined: true } : { name: '', role: '', phone: '', declined: false }; draw(); });
  $('#simfail').addEventListener('change', function () { S.sim = this.checked; S.failed = false; });
  $('#gstart').addEventListener('click', function () { go(startOf($('#gsel').value)); });
  window.addEventListener('resize', protoH);
  $('#gsel').value = 'PAGES'; fillScreens(); go('HOME');
})();
