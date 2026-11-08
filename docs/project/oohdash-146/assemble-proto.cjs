// Assembles the prototype HTML + the node list for the screen-text diff.
const fs = require('fs');
const path = require('path');
const B = require('./build-proto.cjs');
const { PK, VW, NODES, GROUPS, DELTAS, H, norm, stripOn, plainText, EX, siteOf, OUTHTML, OUTNODES } = B;
const esc = H.esc;
const SC = process.env.SC;

/* ---- edge resolution */
const ALIAS = { 'HEAT:start': 'S6832-cold~1' };
const missing = [];
Object.values(NODES).forEach(n => {
  n.edges.forEach(e => {
    if (e.s === 1) { e.to = null; return; } // control-window buttons of crawl states: the window is rebuilt as the CTL screens
    if (e.to && ALIAS[e.to]) e.to = ALIAS[e.to];
    if (e.to && !NODES[e.to] && !/^(@|TILE:)/.test(e.to)) { missing.push(n.id + ' --' + e.l + '--> ' + e.to); e.to = null; }
  });
});
// authored nodes carry data-to inside their html; validate those too
const dataToRe = /data-to="([^"]+)"/g;
Object.values(NODES).forEach(n => {
  [n.flowHtml, n.modalHtml, n.pageHtml].filter(Boolean).forEach(h => { let m; dataToRe.lastIndex = 0; while ((m = dataToRe.exec(h))) { const t = m[1].replace(/^TILE:.*/, 'WORKSPACE').replace(/^@.*/, 'WORKSPACE').replace('HEAT:start', 'S6832-cold~1'); if (!NODES[t]) missing.push(n.id + ' data-to ' + m[1]); } });
});

/* ---- frames, heads, right columns */
const frames = {}, heads = {}, rights = {}, rightKeys = {};
const frameRoot = n => n.root || n.rootKey || 'K8888';
function frameFor(root) {
  if (!PK.frames[root]) root = 'K8888';
  if (frames[root]) return root;
  let pre = B.norm(B.stripOn(PK.frames[root].pre), root), post = B.stripOn(PK.frames[root].post);
  pre = pre.replace(/data-testid="nav-home"/, 'data-testid="nav-home" data-to="HOME"').replace(/data-testid="nav-callback"/, 'data-testid="nav-callback" data-to="CB-list"').replace(/data-testid="nav-tonight"/, 'data-testid="nav-tonight" data-to="TONIGHT"')
    .replace('v1.6.6 · fixture data', 'Prototype · OOHDASH-146 rev 4.2 · live v1.6.6 screens');
  frames[root] = { pre, post };
  const first = PK.nodes[B.rootFirst[root]];
  heads[root] = B.norm(B.stripOn(first.head || ''), root).replace(/<button class="btn link" style="margin-left:auto">End call<\/button>/, '<button class="btn link" style="margin-left:auto" data-to="@end">End call</button>');
  return root;
}
function replaceCard(html, startMarker, newHtml) {
  const s = html.indexOf(startMarker); if (s < 0) return html + newHtml;
  let depth = 0; const re = /<div\b|<\/div>/g; re.lastIndex = s; let m;
  while ((m = re.exec(html))) { if (m[0] === '</div>') { depth--; if (depth === 0) return html.slice(0, s) + newHtml + html.slice(m.index + 6); } else depth++; }
  return html;
}
function ticketRow(subject, p1) {
  return '<p class="small" style="margin:-4px 0 4px">Raised from this dashboard, with their status right now.</p><div class="stepdone siteticket" data-testid="site-ticket"><a class="tktrow" href="/ticket/' + EX + '" target="_blank" rel="noopener" title="Opens the ticket in a new tab">' + (p1 ? '<span class="tag red" data-testid="site-ticket-p1">P1</span> ' : '') + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">' + esc(subject) + '</span> <span class="small">#' + EX + '</span></a><div class="small" data-testid="site-ticket-status">Just received — not yet picked up</div></div>';
}
function rightFor(n, root) {
  let base = rights['@' + root];
  if (base === undefined) {
    const first = PK.nodes[B.rootFirst[root]];
    base = B.norm(B.stripOn(first.right || ''), root);
    rights['@' + root] = base;
  }
  let subject = null;
  if (n.ticketNode) {
    const t = plainText(n.flowHtml || '');
    const m = /On the ticket: ([^\n]+)/.exec(t);
    subject = m ? m[1] : ((/✔ ([^\n]+)/.exec(t) || [])[1] || 'Ticket');
  }
  const closedNode = /Recorded and closed/.test(n.flowHtml || ''); if (closedNode) subject = null;
  const card = '<div class="card tight"><h3>Open tickets for this site</h3>' + (n.ticketNode && !closedNode ? ticketRow(subject, n.isP1) : '<p class="small" data-testid="site-tickets-empty">No open tickets raised from this dashboard.</p>') + '</div>';
  const html = replaceCard(base, '<div class="card tight"><h3>Open tickets for this site</h3>', card);
  const key = String(html.length) + ':' + (n.ticketNode && !closedNode ? 1 : 0) + (n.isP1 ? 1 : 0) + ':' + root + ':' + (subject || '');
  if (!rightKeys[key]) rightKeys[key] = html;
  return key;
}
const P1BANNER = '<div class="statusstrip p1-banner" data-testid="p1-escalation-banner" style="display:flex;align-items:flex-start;gap:10px"><span style="font-size:1.2em;flex-shrink:0">🚨</span><div><b>Active P1 escalation on record for this site — review before advising.</b> Ticket ' + H.tktLink(EX) + ': Just received — not yet picked up.</div></div>';

/* ---- order screens inside groups (breadth-first from each group's first screen) */
const START = { K8888: 'K-what', K6832: 'K6832~1', KGW: 'K8888-gw-B-unscheduled~1', KD8: 'K-what', HW: 'RQ:HW:HW-nodhw', NLH: 'K-none~1', LIGHT: 'L6749~1', FAN: 'FAN6851~1', FR: 'FR6851~1', CONN: 'WS-offline', CONT: 'CT6832~1', ELSE: 'O-0', AC: 'RQ:AC6218~1', HEAT: 'S6832-cold~1', BP: 'BP9001-read~1', CTL: 'CTL:compose-up', CD: 'CD-ws', PAGES: 'HOME' };
const order = {};
GROUPS.forEach(g => {
  const ids = Object.values(NODES).filter(n => n.g === g.id).map(n => n.id);
  const seen = new Set(), out = [];
  const q = [START[g.id]].filter(x => NODES[x] && NODES[x].g === g.id).concat(ids);
  const bfs = (s) => { const qq = [s]; while (qq.length) { const x = qq.shift(); if (seen.has(x) || !NODES[x] || NODES[x].g !== g.id) continue; seen.add(x); out.push(x); NODES[x].edges.forEach(e => e.to && qq.push(e.to)); const re = /data-to="([^"@][^"]*)"/g; let m; [NODES[x].flowHtml, NODES[x].modalHtml].filter(Boolean).forEach(h => { re.lastIndex = 0; while ((m = re.exec(h))) qq.push(m[1]); }); } };
  q.forEach(bfs);
  order[g.id] = out;
});
// K-what is in KD8 but also the entry of the K8888 group: put the live screens of K8888 after it
order['K8888'] = ['K-what'].concat(order['K8888'].filter(x => x !== 'K-what' && NODES[x].g === 'K8888'));
NODES['K-what'].g = 'KD8';
order['K8888'] = Object.values(NODES).filter(n => n.g === 'K8888').map(n => n.id);
order['KD8'] = ['K-what'].concat(order['KD8'].filter(x => x !== 'K-what'));
// show K-what first in the main kitchen group too: copy the entry id into that list's head
order['K8888'].unshift('K-what');

/* ---- compact data */
const D = {}, GR = {};
GROUPS.forEach(g => { GR[g.id] = order[g.id] || []; });
Object.values(NODES).forEach(n => {
  const root = frameFor(frameRoot(n));
  const rec = { g: n.g, t: n.t, k: n.kind === 'page' ? 'page' : 'flow', d: n.deltas, src: n.src || null };
  if (n.kind === 'page') { rec.h = n.pageHtml; if (n.cust) rec.cust = true; }
  else {
    rec.h = n.flowHtml; rec.fr = root; rec.r = rightFor(n, root);
    if (n.isP1) rec.p1 = 1;
    rec.e = n.edges.map(e => e.to || null);
    if (n.modalHtml) rec.m = n.modalHtml;
    if (n.cust) rec.cust = true;
    if (n.id === 'SH:p1fail') rec.nocust = false;
  }
  if (n.src) rec.src = n.src;
  D[n.id] = rec;
});
// guide link points at the revised guide prototype that sits next to this file
Object.values(D).forEach(r => { if (r.h) r.h = r.h.split('/guides/powerpause-contractor-info.html').join('oohdash-146-powerpause-guide.html'); if (r.m) r.m = r.m.split('/guides/powerpause-contractor-info.html').join('oohdash-146-powerpause-guide.html'); });

/* ---- page */
const css = fs.readFileSync(path.join(SC, 'live', 'public', 'css', 'styles.css'), 'utf8');
const protoCss = fs.readFileSync(path.join(__dirname, 'proto.css'), 'utf8');
const runtime = fs.readFileSync(path.join(__dirname, 'proto-runtime.js'), 'utf8');
const DL = {}; Object.entries(DELTAS).forEach(([k, v]) => { DL[k] = { title: v.title, what: v.what, note: /^(N1|R11)$/.test(k) }; });
const GL = GROUPS.map(g => ({ id: g.id, label: g.label }));
const head = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OOHDASH-146 prototype, rev 4.2 (live v1.6.6 plus the 146 changes)</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E%F0%9F%8C%99%3C/text%3E%3C/svg%3E"><style>' + css + '\n' + protoCss + '</style></head><body>';
const bar = '<div id="proto"><button class="ptog" id="ptog" onclick="togProto()">Hide</button><b>OOHDASH-146 prototype, rev 4.2</b> <span id="badge"></span><span class="pdesc"> · every screen is the live v1.6.6 screen (captured from the real app, fixture mode) with only the 146 changes applied. Pick a flow, then a screen, or just click the buttons. Example data only. <label><input type="checkbox" id="showdiff"> Show what differs from live</label><label class="sim"><input type="checkbox" id="simfail"> Make the next P1 fail once</label></span><div class="row"><span style="color:#94A3B8">Flow:</span><select id="gsel"></select><button class="pb" id="gstart">Start of this flow</button><span style="color:#94A3B8">Screen:</span><select id="ssel"></select></div></div>';
const body = bar + '<div id="app-stage"><div id="stage"></div></div><div id="diffpanel"></div><div id="toasts"></div><div id="modalroot"></div>';
const data = 'var D=' + JSON.stringify(D) + ';\nvar GR=' + JSON.stringify(GR) + ';\nvar GL=' + JSON.stringify(GL) + ';\nvar DL=' + JSON.stringify(DL) + ';\nvar PB={"1":' + JSON.stringify(P1BANNER) + '};\nvar FR=' + JSON.stringify(frames) + ';\nvar HEAD=' + JSON.stringify(heads) + ';\nvar RT=' + JSON.stringify(rightKeys) + ';\n';
const html = head + body + '<script>\n' + data + runtime + '\n</script></body></html>\n';
fs.writeFileSync(OUTHTML, html);

/* ---- node list for the diff / click test */
const list = Object.values(NODES).map(n => ({ id: n.id, g: n.g, t: n.t, src: n.src || null, deltas: n.deltas, kind: n.kind, authored: !!n.authored, live: !!n.live, tk: !!n.ticketNode, p1: !!n.isP1, exempt: n.exempt || null, exemptParents: n.exemptParents || null }));
fs.writeFileSync(OUTNODES, JSON.stringify({ nodes: list, missing, deltas: DELTAS, groups: GROUPS }, null, 1));
console.log('built', OUTHTML, (html.length / 1024).toFixed(0) + 'KB', Object.keys(NODES).length, 'screens;', 'live', list.filter(x => x.live).length, 'authored', list.filter(x => x.authored).length);
if (missing.length) console.log('MISSING TARGETS (' + missing.length + '):\n' + missing.slice(0, 60).join('\n'));
