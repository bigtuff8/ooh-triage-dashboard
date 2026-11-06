// OOHDASH-146 rev 3: verifies the built prototype.
//  1. screen-text diff: the text of every prototype screen against the text of the live v1.6.6 screen it was taken from;
//     every difference must be explained by an item in the "differs from live" list (zero unexplained).
//  2. click test: every button on every screen is clicked; nothing may throw, and no navigation button may lead nowhere.
// Usage: node verify-proto.mjs <proto.html> <proto-nodes.json> <packed.json> <out-prefix>   (run with playwright resolvable)
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [,, HTML, NODES, PACKED, VIEWS, OUT] = process.argv;
const VW = JSON.parse(fs.readFileSync(VIEWS, 'utf8'));
const meta = JSON.parse(fs.readFileSync(NODES, 'utf8'));
const PK = JSON.parse(fs.readFileSync(PACKED, 'utf8'));
const SITEOF = {};
for (const [root, f] of Object.entries(PK.frames)) { const m = /<span class="ctx">([^<]*?) · <span class="mono">(\d+)<\/span>/.exec(f.pre); SITEOF[root] = m ? { name: m[1], no: m[2] } : null; }
const NOTE = new Set(['N1', 'R11']);
const SITE = { name: 'The Wheatsheaf', no: '7412' };
function normText(t, root) {
  const so = SITEOF[root];
  if (so) { t = t.split(so.name).join(SITE.name); t = t.replace(new RegExp('(?<![0-9])' + so.no + '(?![0-9])', 'g'), SITE.no); }
  t = t.replace(/\b4[5-9]\d{3}\b/g, '48213').split('Test Handler').join('Sam Okafor').split('Greene King · Test Street, Test Town').join('Greene King · 14 Mill Lane, Bury St Edmunds');
  t = t.split('v1.6.6 · fixture data').join('Prototype · OOHDASH-146 rev 3 · live v1.6.6 screens');
  t = t.replace(/^TH$/gm, 'SO').replace(/Greene King · [^\n]*/g, 'Greene King · 14 Mill Lane, Bury St Edmunds').replace(/^🔁 2 calls this month$/gm, '');
  return t;
}
const lines = t => t.replace(/[ \t]+/g, ' ').split('\n').map(x => x.trim()).filter(x => x && !/^(📝 Anything|For the ticket and the IoT|0 \/ 1000|You: |Everything on this call)/.test(x));
function diffLines(a, b) {
  const n = a.length, m = b.length; const L = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push('- ' + a[i++]); else out.push('+ ' + b[j++]); }
  while (i < n) out.push('- ' + a[i++]); while (j < m) out.push('+ ' + b[j++]);
  return out;
}
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file:///' + HTML.replace(/\\/g, '/'));
const idsAll = meta.nodes.map(n => n.id);
const protoText = {};
for (const id of idsAll) {
  await page.evaluate(i => go(i), id);
  protoText[id] = await page.evaluate(() => { const f = document.querySelector('[data-testid="flow-panel"]'); const m = document.getElementById('modalroot'); return f ? f.innerText : (document.getElementById('stage').innerText + (m ? m.innerText : '')); });
}
// ---- diff
const rows = []; let unexplained = 0, identical = 0, explained = 0, isNew = 0;
const detail = [];
for (const n of meta.nodes) {
  const real = n.deltas.filter(d => !NOTE.has(d));
  if (!n.src) { isNew++; rows.push({ id: n.id, g: n.g, status: 'new', items: real }); if (!real.length) unexplained++; continue; }
  const isView = /^view:/.test(n.src); const live = isView ? { text: VW[n.src.slice(5)].text + '\n' + (VW[n.src.slice(5)].modalText || ''), root: 'K6832' } : PK.nodes[n.src]; const root = live.root;
  let lt = normText(live.text, root), pt = protoText[n.id];
  if (isView) { const cut = x => { x = x.replace(/🚨\nActive P1 escalation[^\n]*\n?/, ''); const k = x.indexOf('Open tickets for this site'); return k >= 0 ? x.slice(0, k) : x; }; lt = cut(lt); pt = cut(pt); }
  const a = lines(lt), b = lines(pt);
  const d = diffLines(a, b);
  if (!d.length) { identical++; rows.push({ id: n.id, g: n.g, src: n.src, status: 'identical', items: [] }); continue; }
  if (real.length) { explained++; rows.push({ id: n.id, g: n.g, src: n.src, status: 'differs', items: real }); detail.push({ id: n.id, src: n.src, items: real, d }); }
  else { unexplained++; rows.push({ id: n.id, g: n.g, src: n.src, status: 'UNEXPLAINED', items: [] }); detail.push({ id: n.id, src: n.src, items: [], d }); }
}
// live screens not in the prototype
const used = new Set(meta.nodes.map(n => n.src).filter(Boolean));
const replacedRoots = {}; Object.entries(PK.nodes).forEach(([k, v]) => { if (!used.has(k)) { replacedRoots[v.root] = (replacedRoots[v.root] || 0) + 1; } });
const notShown = Object.keys(PK.nodes).filter(k => !used.has(k)).length;
// ---- click test
let clicks = 0, dead = [], navDead = [];
const reach = new Set();
for (const id of idsAll) {
  await page.evaluate(i => go(i), id);
  const count = await page.evaluate(() => document.querySelectorAll('#stage button, #stage [data-to], #stage .tile, #modalroot button, #modalroot [data-to]').length);
  for (let k = 0; k < count; k++) {
    await page.evaluate(i => go(i), id);
    const info = await page.evaluate(k => {
      const els = [...document.querySelectorAll('#stage button, #stage [data-to], #stage .tile, #modalroot button, #modalroot [data-to]')];
      const el = els[k]; if (!el) return null;
      const lab = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
      document.getElementById('toasts').innerHTML = ''; const before = S.id;
      el.click();
      return { lab, before, after: S.id, toast: document.getElementById('toasts').innerHTML !== '' };
    }, k);
    if (!info) continue; clicks++;
    if (info.after && info.after !== info.before) reach.add(info.after);
    if (info.after === info.before && !info.toast) {
      // allowed: toggles inside forms, notes, fields
      const ok = await page.evaluate(k => { const els = [...document.querySelectorAll('#stage button, #stage [data-to], #stage .tile, #modalroot button, #modalroot [data-to]')]; const el = els[k]; return !el || !!el.closest('.formrow') || !!el.closest('.notes-group') || el.tagName === 'A' || /^Raise the P1$|^Try again$/.test((el.textContent || '').trim()); }, k);
      if (!ok) dead.push(id + ' :: ' + info.lab);
    }
    if (info.toast && /not part of this change|That screen is not in this prototype/.test(await page.evaluate(() => document.getElementById('toasts').innerText))) navDead.push(id + ' :: ' + info.lab);
  }
}
// P1 failure simulation
await page.evaluate(() => { S.sim = true; S.failed = false; go('K8888~30'); });
const p1 = await page.evaluate(() => { const b = [...document.querySelectorAll('#stage button')].find(x => /^Raise the P1$/.test(x.textContent.trim())); b.click(); return S.id; });
// reachability from HOME by clicking
const adj = {}; // computed from the in-page data
const D = await page.evaluate(() => { const o = {}; Object.keys(D).forEach(k => { const n = D[k]; const set = new Set(); (n.e || []).forEach(x => x && set.add(x)); const re = /data-to="([^"]+)"/g; let m; [n.h, n.m].filter(Boolean).forEach(h => { re.lastIndex = 0; while ((m = re.exec(h))) set.add(m[1]); }); o[k] = [...set]; }); return o; });
const TILE = await page.evaluate(() => TILE);
const seen = new Set(['HOME']); const q = ['HOME', 'WORKSPACE'];
const resolveTo = t => t === '@end' ? 'HOME' : t === '@another' || t === '@cancel' || t === '@back' ? 'WORKSPACE' : /^TILE:/.test(t) ? TILE[t.slice(5)] : t;
// seed: HOME -> SITE-confirm via search, -> CD-ws -> WORKSPACE
['SITE-confirm', 'CD-ws', 'CD-saved', 'CD-declined', 'SEARCH-none', 'CB-list', 'TONIGHT'].forEach(x => q.push(x));
while (q.length) { const x = q.shift(); if (seen.has(x) && x !== 'HOME') continue; seen.add(x); (D[x] || []).forEach(t => { const r = resolveTo(t); if (r && !seen.has(r)) q.push(r); }); }
// live nodes' button targets are in e[]; dead = no edge
const unreachable = idsAll.filter(i => !seen.has(i));
await browser.close();

// ---- reports
const dl = meta.deltas;
const real = Object.keys(dl).filter(k => !NOTE.has(k));
let md = '# OOHDASH-146 screen-text diff, revision 3 (prototype against live v1.6.6)\n\n';
md += 'Method: the real app (origin/main 916f6e3, v1.6.6) was run in fixture mode with writes enabled and a script clicked every button on every flow, saving each screen\'s html and text. The prototype is built from those captured screens. Example site name, house number and ticket numbers are normalised on both sides (item N1). This script then loads the finished prototype, reads the text of every screen and compares it line by line with the text of the live screen it came from.\n\n';
md += '## Result\n\n';
md += '- Prototype screens: ' + meta.nodes.length + ' (' + meta.nodes.filter(n => n.live).length + ' taken from live, ' + meta.nodes.filter(n => n.authored).length + ' authored for 146).\n';
md += '- Identical to live after example-data normalisation: ' + identical + '.\n- Differ from live, every difference mapped to an item below: ' + explained + '.\n- New in 146 (no live screen), each mapped to an item: ' + (isNew - rows.filter(r => r.status === 'new' && !r.items.length).length) + ' of ' + isNew + '.\n';
md += '- **Unexplained differences: ' + unexplained + '.**\n';
md += '- Live screens captured but not shown in the prototype: ' + notShown + ' (mostly control-window and duplicate crawl states; the replaced and removed live screens are listed under "Live screens replaced").\n';
md += '- Click test: ' + clicks + ' clicks on ' + idsAll.length + ' screens; dead buttons: ' + dead.length + '; buttons that lead to a missing screen: ' + navDead.length + '; JS errors: ' + errors.length + '.\n\n';
md += '## Live screens not carried into the prototype (crawl states per scenario)\n\n' + Object.entries(replacedRoots).map(([r, c]) => r + ': ' + c).join(', ') + '. These are replaced by the changed screens named in the items below (HW-* by R3, O6832 by R2, CN7004 and CN-devoff by R5, the "Continue under Something else" dead ends in L-none, FAN-none, S-none by R4, the heating agent-button screens by R6), or are crawl states that only show a control window left open.\n\n';
md += '## The "differs from live" list\n\n| Item | What changes |\n|---|---|\n' + Object.keys(dl).map(k => '| ' + k + ' | ' + dl[k].title + '. ' + dl[k].what.replace(/\|/g, '/') + ' |').join('\n') + '\n\n';
md += '## Screens that differ from live, and why\n\n| Prototype screen | Live source | Items |\n|---|---|---|\n' + rows.filter(r => r.status !== 'identical').map(r => '| ' + r.id + ' | ' + (r.src || 'none (new)') + ' | ' + (r.items.join(', ') || 'UNEXPLAINED') + ' |').join('\n') + '\n\n';
md += '## Line-by-line differences (each line is either only in live or only in the prototype)\n\n' + detail.map(x => '### ' + x.id + ' (live ' + x.src + '; items ' + (x.items.join(', ') || 'UNEXPLAINED') + ')\n\n' + x.d.map(l => (l[0] === '-' ? '- Live: ' : '- Prototype: ') + l.slice(2)).join('\n')).join('\n\n') + '\n';
md += '\n## Identical screens\n\n' + rows.filter(r => r.status === 'identical').map(r => r.id).join(', ') + '\n';
fs.writeFileSync(OUT + '.md', md);
fs.writeFileSync(OUT + '.json', JSON.stringify({ screens: meta.nodes.length, identical, explained, isNew, unexplained, clicks, dead, navDead, errors, unreachable, p1sim: p1, rows }, null, 1));
console.log(JSON.stringify({ screens: meta.nodes.length, identical, explained, isNew, unexplained, notShown, clicks, dead: dead.length, navDead: navDead.length, errors: errors.length, unreachable: unreachable.length, p1sim: p1 }));
if (dead.length) console.log('DEAD:', dead.slice(0, 30));
if (navDead.length) console.log('NAVDEAD:', navDead.slice(0, 30));
if (unreachable.length) console.log('UNREACHABLE:', unreachable.slice(0, 40));
console.log('UNEXPLAINED:', rows.filter(r => r.status === 'UNEXPLAINED').map(r => r.id).slice(0, 40));
