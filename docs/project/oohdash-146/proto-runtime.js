/* OOHDASH-146 rev 3 prototype runtime. Data (D, GR, FR, HEAD, RT, DL) is injected by build-proto. No network, no build step. */
var S = { id: null, sim: false, failed: false, cust: false, diff: false, last: 'WORKSPACE' };
var TILE = { heating: 'S6832-cold~1', hotwater: 'HW:HW-auto', kitchen: 'K-what', lighting: 'L6749~1', fan: 'FAN6851~1', fridge: 'FR6851~1', contractor: 'CT6832~1', other: 'O-0' };
var LABELTO = { '✓ This is the right site': 'CD-ws', 'Search again': 'HOME', 'Pass it to the IoT team': 'SITE-ambiguous-logged', 'Use Callback Lookup →': 'CB-list', 'start a new call': 'HOME', '❓ Raise a query with the IoT team': 'TONIGHT-query', 'Cancel': 'TONIGHT', 'Send query': 'TONIGHT', '✕': 'TONIGHT' };
function $(s, r) { return (r || document).querySelector(s); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toast(t) { var el = $('#toasts'); el.innerHTML = '<div class="toast">' + t + '</div>'; clearTimeout(toast._t); toast._t = setTimeout(function () { el.innerHTML = ''; }, 2600); }
function groupNodes(g) { return GR[g] || []; }
function callerLine() { return '<div class="callerline" data-testid="caller-line">👤 <b>Priya Shah</b> · duty manager · 07700 900123<a data-to="CD-ws">Change</a></div>'; }
function go(id, from) {
  var n = D[id]; if (!n) { toast('That screen is not in this prototype.'); return; }
  S.id = id; if (n.k === 'flow' || id === 'WORKSPACE') S.last = id === 'WORKSPACE' ? 'WORKSPACE' : S.last;
  if (n.cust) S.cust = true;
  draw(); window.scrollTo(0, 0);
}
function stage(n) {
  if (n.k === 'page') return n.h;
  var f = FR[n.fr] || FR[Object.keys(FR)[0]];
  var left = (HEAD[n.fr] || '') + (n.p1 ? PB[n.p1] || '' : '') + (S.cust && !n.nocust ? callerLine() : '') + n.h;
  return f.pre + '<div>' + left + '</div><div>' + (RT[n.r] || '') + '</div>' + f.post;
}
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
  if (to === '@end') { S.cust = false; return 'HOME'; }
  if (to === '@another') return 'WORKSPACE';
  if (to === '@cancel') return 'WORKSPACE';
  if (to === '@back') return D[S.id].back || (S.id.indexOf('CTL:') === 0 ? (S.id.indexOf('switch') > 0 ? 'L6961~1' : 'S6832-cold~3') : 'WORKSPACE');
  if (to === 'HEAT:start') return 'S6832-cold~1';
  if (to.indexOf('TILE:') === 0) return TILE[to.slice(5)] || 'WORKSPACE';
  return to;
}
document.addEventListener('click', function (e) {
  if (e.target.closest('#proto')) return;
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
    r.innerHTML = (v.length >= 3 && ('7412'.indexOf(v) === 0 || 'the wheatsheaf'.indexOf(v) >= 0 || v.indexOf('wheat') >= 0)) ? '<div class="stepdone" style="cursor:pointer;margin-top:6px" data-to="SITE-confirm"><b>The Wheatsheaf</b> <span class="mono">7412</span> · Greene King · Bury St Edmunds</div>' : (v.length >= 3 ? '<div class="stepdone" style="cursor:pointer;margin-top:6px" data-to="SEARCH-none">No site matches "' + esc(e.target.value) + '"</div>' : '');
  }
});
(function boot() {
  var gs = Object.keys(GR);
  $('#gsel').innerHTML = GL.map(function (g) { return '<option value="' + g.id + '">' + esc(g.label) + '</option>'; }).join('');
  $('#gsel').addEventListener('change', function () { fillScreens(); go(startOf(this.value)); });
  $('#ssel').addEventListener('change', function () { go(this.value); });
  $('#showdiff').addEventListener('change', function () { S.diff = this.checked; draw(); });
  $('#simfail').addEventListener('change', function () { S.sim = this.checked; S.failed = false; });
  $('#gstart').addEventListener('click', function () { go(startOf($('#gsel').value)); });
  window.addEventListener('resize', protoH);
  $('#gsel').value = 'PAGES'; fillScreens(); go('HOME');
})();
