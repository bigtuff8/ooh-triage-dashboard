// R5, R8, R9, R10, R13 and the other pages: built on the captured live pages (views.json), with the 146 changes applied.
const B = require('./build-proto.cjs');
const { NODES, add, H, dyn, W, EX, PK, VW, norm, stripOn, liveNode } = B;
const OLD = require('./proposed-wording.cjs');
const esc = H.esc;

function replaceCard(html, startMarker, newHtml) {
  const s = html.indexOf(startMarker); if (s < 0) return html;
  let depth = 0, i = s; const re = /<div\b|<\/div>/g; re.lastIndex = s; let m;
  while ((m = re.exec(html))) { if (m[0] === '</div>') { depth--; if (depth === 0) { return html.slice(0, s) + newHtml + html.slice(m.index + 6); } } else depth++; }
  return html;
}
const NOTICKETS = '<div class="card tight"><h3>Open tickets for this site</h3><p class="small" data-testid="site-tickets-empty">No open tickets raised from this dashboard.</p></div>';
function cleanPage(h) {
  h = norm(stripOn(h), 'K6832');
  h = h.replace(/<div class="statusstrip p1-banner"[\s\S]*?<\/div>\s*<\/div>/, '');
  h = replaceCard(h, '<div class="card tight"><h3>Open tickets for this site</h3>', NOTICKETS);
  h = h.replace(/data-testid="nav-home"/, 'data-testid="nav-home" data-to="HOME"').replace(/data-testid="nav-callback"/, 'data-testid="nav-callback" data-to="CB-list"').replace(/data-testid="nav-tonight"/, 'data-testid="nav-tonight" data-to="TONIGHT"');
  h = h.replace(/<div class="tile" data-testid="tile-(\w+)">/g, (m, k) => '<div class="tile" data-testid="tile-' + k + '" data-to="TILE:' + k + '">');
  h = h.replace(/<button class="btn link" style="margin-left:auto">End call<\/button>/, '<button class="btn link" style="margin-left:auto" data-to="@end">End call</button>');
  return h;
}
const page = (id, g, t, html, deltas, extra) => add(Object.assign({ id, g, t, kind: 'page', pageHtml: html, deltas: deltas || [], authored: true, edges: [] }, extra || {}));
const vsrc = (id, vw) => { NODES[id].src = 'view:' + vw; NODES[id].authored = false; };

/* live pages */
const wsPage = cleanPage(VW['workspace'].app);
page('SEARCH-none', 'PAGES', 'Search: no site matches', cleanPage(VW['search-none'].app));
page('SITE-confirm', 'PAGES', 'Confirm the site', cleanPage(VW['site-confirm'].app));
page('SITE-ambiguous', 'PAGES', 'House number matches two sites', cleanPage(VW['site-ambiguous'].app));
page('WORKSPACE', 'PAGES', 'Site screen: what is the customer reporting?', wsPage);
vsrc('SEARCH-none', 'search-none'); vsrc('SITE-confirm', 'site-confirm'); vsrc('SITE-ambiguous', 'site-ambiguous'); vsrc('WORKSPACE', 'workspace');

/* R5 / R13: offline banner without the button */
let off = cleanPage(VW['workspace-offline'].app);
off = off.replace(/<button class="btn" style="margin-left:auto">Run connection check<\/button>/, '').replace('This step is optional — you can go straight to the issue.', 'If the customer\'s issue involves it, the questions check the equipment for you.');
page('WS-offline', 'CONN', 'Site screen: some equipment not responding (button removed)', off, ['R5', 'R13']);

/* R8 / R16 (D15): "Who's calling?" is the start screen, with the site search on the same screen. Details are optional and never block. */
const homeLive = cleanPage(VW['home'].app);
page('HOME-old', 'PAGES', 'New call: the old live landing page (kept for comparison; no longer the start)', homeLive);
vsrc('HOME-old', 'home');
const fld = (id, label, ph, v) => '<div class="formrow"><label for="' + id + '">' + label + '</label><input id="' + id + '" placeholder="' + esc(ph) + '"' + (v ? ' value="' + esc(v) + '"' : '') + '></div>';
const RESULT = '<div class="stepdone" style="cursor:pointer;margin-top:6px" data-act="pick-site"><b>The Wheatsheaf</b> <span class="mono">7412</span> · Greene King · Bury St Edmunds</div>';
function whosCalling(o) {
  o = o || {};
  const card = '<div class="card" style="padding:26px" data-testid="whos-calling">' +
    '<h2>Who\'s calling?</h2>' +
    H.sayBox('<p>Can I take your name, your role, and the best number to reach you on?</p>', '') +
    '<div class="cd-grid">' + fld('cd-name', 'Customer\'s name <span class="small">(optional)</span>', 'e.g. Priya Shah', o.name) + fld('cd-role', 'Their role <span class="small">(optional)</span>', 'e.g. duty manager, chef, contractor', o.role) + fld('cd-phone', 'Best contact number <span class="small">(optional)</span>', 'e.g. 07700 900123', o.phone) + '</div>' +
    '<p class="small" data-testid="details-optional">Optional: you can search for the site without them. If you take them, they go on every ticket from this call, in the ticket\'s internal notes, so our team can call back. They are not sent in the P1 text and not shown in Tonight. The call record starts when the site is confirmed.</p>' +
    '<button class="btn link" data-act="decline" data-testid="cd-decline" style="padding:2px 0">The customer won\'t give these</button>' +
    '<h3 style="margin-top:18px">Which site is it?</h3>' +
    '<p class="sub" style="margin-bottom:10px">Ask for the <b>house number</b> (4 digits) — or search by pub name. Use ↑ ↓ and Enter to pick.</p>' +
    '<div class="searchwrap"><input id="sq" data-testid="site-search" data-search="1" placeholder="e.g. 6832 or Old Grey Mare" autocomplete="off"' + (o.results ? ' value="wheat"' : '') + '><div id="sres">' + (o.results ? RESULT : '') + '</div></div>' +
    '<p class="small" style="margin-top:12px">Customer ringing back about an earlier issue? <button class="btn link" data-to="CB-list">Use Callback Lookup →</button></p>' +
    '</div>\n  <div class="card">';
  return homeLive.replace(/<div class="card" style="padding:26px">[\s\S]*?<\/div>\n  <div class="card">/, () => card);
}
page('HOME', 'PAGES', 'New call: Who\'s calling? with the site search on the same screen (the start, D15)', whosCalling({}), ['R16']);
page('CD-partial', 'CD', 'Who\'s calling?: partly filled (name and role, no number yet)', whosCalling({ name: 'Priya Shah', role: 'duty manager' }), ['R16']);
page('CD-results', 'CD', 'Who\'s calling?: details given, site search showing a result', whosCalling({ name: 'Priya Shah', role: 'duty manager', phone: '07700 900123', results: true }), ['R16']);
const entryAt = '<div class="card">\n   \n   <h3>What is the customer reporting?</h3>';
const addCard = '<div class="card" data-testid="add-details" style="padding:16px"><h3>Add or change the customer\'s details</h3>' +
  '<div class="cd-grid">' + fld('cd-name', 'Customer\'s name', 'e.g. Priya Shah') + fld('cd-role', 'Their role', 'e.g. duty manager') + fld('cd-phone', 'Best contact number', 'e.g. 07700 900123') + '</div>' +
  H.infoBox('Optional and never blocks the call. The banner above updates as soon as you save. The details go on any ticket raised from now on.') +
  '<div class="outbtns"><button class="btn primary" data-act="save-details" data-testid="cd-save">Save details</button><button class="btn" data-act="cancel-add">Back to the call</button></div></div>';
page('CD-add', 'CD', 'Add details during the call (from the banner "Add details" or "Change"); the banner updates', wsPage.replace(entryAt, addCard + entryAt), ['R16', 'R17']);
/* R1: site screen while a one-off is booked */
page('K-banner', 'KD8', 'Site screen while a one-off is booked (with Cancel)', wsPage.replace(entryAt, '<div class="oneoff-banner" data-testid="oneoff-banner">⏱ Fryer: booked to stay on until midnight tonight (ticket ' + H.tktLink(EX) + '). ' + H.btn('Cancel', 'K-cancelled') + '</div>' + entryAt), ['R1']);

/* callback + Tonight (R9, R10) */
let cb = cleanPage(VW['callback-list'].app);
cb = cb.replace('<div class="stepdone" style="cursor:pointer">', '<div class="stepdone" style="cursor:pointer" data-to="CB-drawer"><span class="tag amber">Customer has replied: being reviewed</span><span style="flex:1">Target temperature raised: Bar area</span><span class="small">#' + EX + ' · 20 minutes ago</span></div><div class="stepdone" style="cursor:pointer">');
page('CB-list', 'PAGES', 'Callback Lookup: tickets for the site ("Customer has replied")', cb, ['R10']);
let dr = VW['callback-drawer'].app; const di = dr.indexOf('<div class="drawer">');
const drawer = norm(stripOn(dr.slice(di)), 'K6832').replace(/<div class="dh">Ticket #\d+/, '<div class="dh">Ticket #' + EX).replace('<button class="btn link">✕</button>', '<button class="btn link" data-to="CB-list">✕</button>');
page('CB-drawer', 'PAGES', 'Callback Lookup: ticket drawer', cb + drawer, ['R10']);
page('CB-empty', 'PAGES', 'Callback Lookup: no tickets', cleanPage(VW['callback-empty'].app)); vsrc('CB-empty', 'callback-empty');
// Tonight: live page with plain chips
const TN = OLD.STATES.find(s => s.id === 'TONIGHT');
const chipCls = { 'heating turned on': 'blue', 'back to normal': 'green', 'applied ✓': 'green', 'captured': 'blue', 'closed note': 'grey', 'added to ticket': 'blue', 'one-off booked': 'blue', 'one-off on': 'blue', 'one-off done': 'green', 'not carried out': 'red' };
const siteCell = x => { const m = /^(.*) (\d{4})$/.exec(x); return '<b>' + esc(m[1]) + '</b> <span class="mono">' + m[2] + '</span>'; };
const rows = TN.table.map(r => '<tr><td>' + r[0] + '</td><td>' + siteCell(r[1]) + '</td><td>Sam Okafor</td><td>' + esc(r[2].replace(/own refrigeration engineer/, 'service contractor')) + '</td><td><span class="tag ' + (chipCls[r[3]] || 'grey') + '">' + esc(r[3]) + '</span></td><td>' + H.tktLink(EX) + '</td></tr>').join('');
let tn = cleanPage(VW['tonight'].app);
tn = tn.replace(/<table class="tbl" data-testid="tonight-table">[\s\S]*?<\/table>/, '<table class="tbl" data-testid="tonight-table"><tbody><tr><th>Time</th><th>Site</th><th>Agent</th><th>What happened</th><th>Outcome</th><th>Ticket</th></tr>' + rows + '</tbody></table>');
page('TONIGHT', 'PAGES', 'Tonight: plain outcome chips (no raw codes)', tn, ['R9']);
{ const tq = cleanPage(VW['tonight-query'].app).replace(/<table class="tbl" data-testid="tonight-table">[\s\S]*?<\/table>/, '<table class="tbl" data-testid="tonight-table"><tbody><tr><th>Time</th><th>Site</th><th>Agent</th><th>What happened</th><th>Outcome</th><th>Ticket</th></tr>' + rows + '</tbody></table>'); page('TONIGHT-query', 'PAGES', 'Tonight: raise a query', tq + norm(stripOn(VW['tonight-query'].modal || ''), 'K6832'), ['R9']); }
// ticket wording (R10)
page('TICKET-TEXT', 'PAGES', 'Ticket wording: "caller" becomes "customer" (not on a screen today; shown here)', '<div class="content narrow" style="padding-top:16px"><div class="card"><h2>Ticket wording that changes (R10)</h2><p class="sub">These words appear in tickets, ticket notes and a status label, not on an agent screen. The left column is live today; the right is the new wording.</p><table class="tbl"><tbody><tr><th>Where</th><th>Live today</th><th>New</th></tr>' +
  [['Ticket subject, ambiguous site (views.js:99)', 'Ambiguous house ID 6758 — caller could not be resolved to one site', 'Ambiguous house ID 6758 — customer could not be resolved to one site'],
   ['Ticket text rewrite (zendesk.js:255)', 'Caller\'s words: …', 'Customer\'s words: …'],
   ['Late-change ticket note (zendesk.js:388-389)', 'reported to the caller as NOT applied · VERIFY WITH THE CALLER', 'reported to the customer as NOT applied · VERIFY WITH THE CUSTOMER'],
   ['Ticket status label (zendesk.js:588)', 'Caller has replied — being reviewed', 'Customer has replied — being reviewed']].map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td><b>' + esc(r[2]) + '</b></td></tr>').join('') + '</tbody></table></div></div>', ['R10']);
// P1 could not be raised (D2 failure path), built on the live P1 confirm screen
const k30 = NODES['K8888~30'];
add({ id: 'SH:p1fail', g: 'PAGES', t: 'Kitchen P1: could not be raised (nobody paged, no ticket number)', rootKey: 'K8888', authored: true, deltas: ['R7'], src: null,
  flowHtml: k30.flowHtml.replace('<div class="confirm-step"', '<div class="alert err" data-testid="p1-raise-failed">⚠️ <b>The P1 has NOT been raised:</b> we couldn\'t reach the ticket system. Nobody has been paged yet. Press Try again. If it fails again, phone the IoT helpdesk now on 023 814 0228.</div><div class="confirm-step"').replace('>Raise the P1</button>', '>Try again</button>'),
  edges: k30.edges.map(e => Object.assign({}, e)) });
NODES['SH:p1fail'].retry = 'K8888~30';

// ambiguous site: the ticket it raises says "customer" (R10)
{ const amb = NODES['SITE-ambiguous'].pageHtml;
  page('SITE-ambiguous-logged', 'PAGES', 'House number matches two sites: logged', amb.replace(/<div class="outbtns">[\s\S]*?<\/div>/, '') + '<div style="padding:0 20px">' + H.afterCard('outcome-captured', 'Ticket created for the IoT team', EX, '<p class="after-line">Nothing was switched from here. The IoT team picks it up the <b>next working day</b>.</p><p class="after-line small">On the ticket: Ambiguous house ID 7412 — customer could not be resolved to one site</p>', "I can't safely make changes for this site number tonight. It's logged, reference " + dyn(EX) + ', and our IoT team picks it up the next working day.', '') + '</div>', ['R10']); }
