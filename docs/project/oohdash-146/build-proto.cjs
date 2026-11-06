// OOHDASH-146 rev 3 prototype builder.
// Input : packed.json (the live v1.6.6 screens crawled by clicking every button in the real app, fixture mode),
//         views.json (non-flow pages + control windows), proposed-wording.cjs (rev 2 wording rows for the screens 159 did not touch).
// Output: the self-contained prototype (HTML), proto-nodes.json (every screen + which live screen it came from + which
//         "differs from live" item explains any difference) used by the screen-text diff and the click test.
// Usage : SC=<scratch dir holding dump/packed.json + dump/views.json> node build-proto.cjs <out.html> <nodes.json>
const fs = require('fs');
const path = require('path');
const H = require('./live-helpers.cjs');
const { esc } = H;
const SC = process.env.SC;
const PK = JSON.parse(fs.readFileSync(path.join(SC, 'dump', 'packed.json'), 'utf8'));
const VW = JSON.parse(fs.readFileSync(path.join(SC, 'dump', 'views.json'), 'utf8'));
const OUTHTML = process.argv[2], OUTNODES = process.argv[3];
const EX = '48213';
const SITE = { name: 'The Wheatsheaf', no: '7412', addr: 'Greene King · 14 Mill Lane, Bury St Edmunds' };

/* ---------------------------------------------------------------- normalisation of captured live html/text */
const siteOf = {};
for (const [root, f] of Object.entries(PK.frames)) {
  const m = /<span class="ctx">([^<]*?) · <span class="mono">(\d+)<\/span>/.exec(f.pre);
  siteOf[root] = m ? { name: m[1], no: m[2] } : null;
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function norm(s, root) {
  if (s == null) return s;
  const so = siteOf[root];
  if (so) {
    s = s.split(so.name).join(SITE.name);
    s = s.replace(new RegExp('(?<![0-9])' + so.no + '(?![0-9])', 'g'), SITE.no);
  }
  s = s.replace(/\b4[5-9]\d{3}\b/g, EX);
  s = s.split('v1.6.6 · fixture data').join('Prototype · OOHDASH-146 rev 3 · live v1.6.6 screens').split('Test Handler').join('Sam Okafor').replace(/>TH</g, '>SO<');
  s = s.split('Greene King · Test Street, Test Town').join(SITE.addr);
  s = s.replace(/<div class="sub">Greene King · [^<]*<\/div>/g, '<div class="sub">' + SITE.addr + '</div>').replace(/<span class="tag amber" title="OOH tickets in the last 30 days">[^<]*<\/span>/g, '');
  return s;
}
const stripOn = h => h.replace(/\s+on[a-z]+="[^"]*"/g, '');
// Grammar fixes found on live multi-circuit kitchen sites (item G1)
function grammar(s) {
  let changed = false;
  const a = s.split('whether them are on').join('whether they are on');
  if (a !== s) changed = true; s = a;
  s = s.replace(/Ask the customer:<\/b> has the ([^<?]+?) come on\?/g, (m, x) => { if (/ and |, /.test(x)) { changed = true; return 'Ask the customer:</b> have the ' + x + ' come on?'; } return m; });
  s = s.replace(/<b>Ask the customer:<\/b> has the ([^<?]+?) come on\?/g, (m, x) => { if (/ and |, /.test(x)) { changed = true; return '<b>Ask the customer:</b> have the ' + x + ' come on?'; } return m; });
  return { s, changed };
}
function plainText(html) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|div|li|h\d|button|label|tr)>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').split('\n').map(x => x.trim()).filter(Boolean).join('\n');
}

/* ---------------------------------------------------------------- node registry */
const NODES = {};         // id -> node
const GROUPS = [];        // {id,label,intro}
const DELTAS = {};        // id -> {title, what, where}
function group(id, label, intro) { GROUPS.push({ id, label, intro: intro || '' }); }
function delta(id, title, what) { DELTAS[id] = { title, what }; }
function add(n) { if (NODES[n.id]) throw new Error('dup ' + n.id); NODES[n.id] = Object.assign({ edges: [], deltas: [], kind: 'flow' }, n); return n; }

// live nodes -------------------------------------------------------
const rootFirst = {};
for (const [id, n] of Object.entries(PK.nodes)) if (/~1$/.test(id) || !rootFirst[n.root]) rootFirst[n.root] = rootFirst[n.root] || id;
function liveNode(cid, o) {
  const n = PK.nodes[cid]; if (!n) throw new Error('no live node ' + cid);
  const root = n.root;
  let flow = norm(stripOn(n.flow), root);
  const g = grammar(flow); flow = g.s;
  const dl = (o.deltas || []).slice(); if (g.changed && !dl.includes('G1')) dl.push('G1');
  const id = o.id || cid;
  // tag: edge targets resolved at assemble time; keep crawl ids in edges (mapped below)
  return add({ id, g: o.g, t: o.t || ('Live: ' + n.path.join(' > ')) || cid, root, src: cid, flowHtml: flow, rootKey: root, edges: n.edges.map(e => ({ l: e.l, to: e.to, skip: e.skip, s: e.s })), deltas: dl, liveText: n.text, live: true, ticketNode: /tktbadge/.test(n.flow), isP1: /P1 raised/.test(n.flow) });
}
// helpers to retarget / edit edges on a node after creation
const retarget = (id, label, to) => { const n = NODES[id]; let hit = 0; n.edges.forEach(e => { if (e.l === label) { e.to = to; hit++; } }); if (!hit) throw new Error('no edge ' + label + ' on ' + id); };

/* ---------------------------------------------------------------- authored screen builders (live markup) */
const W = (words) => ['words', words];
function bodyStep(p) {
  return H.known(p.known) + (p.info ? H.infoBox(p.info) : '') + (p.say || p.ask ? H.sayBox(p.say || '', p.ask) : '') + (p.fields || '') + (p.answers ? H.answers(p.answers, p.atid) : '') + (p.btns ? '<div class="outbtns">' + p.btns + '</div>' : '');
}
const shell = (icon, title, body, notes) => H.flowShell(icon, title, body, notes);
const ICON = { Kitchen: '🍳', Lighting: '💡', Fans: '🌀', Fridge: '🧊', Hot: '🚿', Heat: '🌡️', Else: '✍️', Conn: '📡', Cont: '🧰', Air: '❄️' };
const TITLE = { Kitchen: 'Kitchen equipment', Lighting: 'External lighting', Fans: 'Extractor fans', Fridge: 'Fridges and freezers', Hot: 'Hot water', Heat: 'Heating', Else: 'Something else / not sure', Conn: 'Connection check', Cont: 'Contractor on site', Air: 'Air conditioning' };
function step(id, o) { // an ordinary question / information step
  return add({ id, g: o.g, t: o.t, rootKey: o.root, flowHtml: shell(ICON[o.f], TITLE[o.f], bodyStep(o), true), edges: [], deltas: o.deltas || [], authored: true, from: o.from });
}
const OPEN = { head: 'Ticket created for the IoT team', test: 'outcome-captured', line: 'Nothing was switched from here. The IoT team picks it up the <b>next working day</b>.' };
const CLOSED = { head: 'Recorded and closed (contact history)', test: 'outcome-scope', line: "Nothing for the IoT team to do: Lighthouse doesn't control this here. The call is on the site's contact history." };
function after(id, o) { // an auto-saved outcome: words to say first, then what happened, then the two end buttons
  const k = o.kind === 'closed' ? CLOSED : OPEN;
  const body = H.known(o.known) + (o.info ? H.infoBox(o.info) : '') +
    H.afterCard(k.test, o.head || k.head, EX, '<p class="after-line">' + (o.line || k.line) + '</p>' + (o.ticketLine ? '<p class="after-line small">On the ticket: ' + esc(o.ticketLine) + '</p>' : ''), o.say, '') +
    H.addNote(EX) + (o.extraAfter || '') + H.outButtons();
  return add({ id, g: o.g, t: o.t, rootKey: o.root, flowHtml: shell(ICON[o.f], TITLE[o.f], body, false), edges: [], deltas: o.deltas || [], authored: true, ticketNode: true });
}
function p1confirm(id, o) {
  const body = H.known(o.known) + '<div class="confirm-step" data-testid="confirm-step">' + H.sayBox(o.say, '', 'say-block') + H.ticketBox(o.subject, o.detail) + H.p1WarnBox() +
    '<button class="btn danger" data-testid="record-outcome" style="margin-top:4px" data-to="' + o.to + '" data-p1="1">Raise the P1</button></div>' + H.notesBox;
  return add({ id, g: o.g, t: o.t, rootKey: o.root, flowHtml: shell(ICON[o.f], TITLE[o.f], body, false), edges: [], deltas: o.deltas || [], authored: true });
}
function p1after(id, o) {
  const body = H.known(o.known) + H.sayBox(o.say, '', 'after-say') + '<div class="outcome after" data-testid="outcome-p1"><div class="after-head"><span class="after-kicker">What happened</span>✔ P1 raised<span class="tktbadge" data-testid="after-ticket">Ticket ' + H.tktLink(EX) + '</span></div><div class="after-body"><p class="after-line" data-testid="p1-dispatch-status">The on-duty manager has been paged and will call the site back.</p><p class="after-line small">On the ticket: ' + esc(o.subject) + '</p></div></div>' + H.addNote(EX) + H.outButtons();
  return add({ id, g: o.g, t: o.t, rootKey: o.root, flowHtml: shell(ICON[o.f], TITLE[o.f], body, false), edges: [], deltas: o.deltas || [], authored: true, ticketNode: true, isP1: true });
}
const dyn = H.dyn;
module.exports = { PK, VW, NODES, GROUPS, DELTAS, group, delta, add, liveNode, retarget, step, after, p1confirm, p1after, W, shell, ICON, TITLE, norm, stripOn, plainText, siteOf, SITE, EX, rootFirst, grammar, OUTHTML, OUTNODES, H, dyn };
require('./authored.cjs');
require('./assemble-proto.cjs');
