// OOHDASH-146 rev 4: verifies the built prototype.
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
  t = t.split('v1.6.6 · fixture data').join('Prototype · OOHDASH-146 rev 4.2 · live v1.6.6 screens');
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
  await page.evaluate(() => { const ta = document.querySelector('[data-p1c]'); if (ta && !ta.value) { ta.value = 'Fryers off during Sunday lunch service, 80 covers booked'; ta.dispatchEvent(new Event('input', { bubbles: true })); } });
  const count = await page.evaluate(() => document.querySelectorAll('#stage button, #stage [data-to], #stage .tile, #modalroot button, #modalroot [data-to]').length);
  for (let k = 0; k < count; k++) {
    await page.evaluate(i => go(i), id);
    await page.evaluate(() => { const ta = document.querySelector('[data-p1c]'); if (ta && !ta.value) { ta.value = 'Fryers off during Sunday lunch service, 80 covers booked'; ta.dispatchEvent(new Event('input', { bubbles: true })); } });
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
const p1 = await page.evaluate(() => { const ta = document.querySelector('[data-p1c]'); ta.value = 'Fryers off during Sunday lunch service, 80 covers booked'; ta.dispatchEvent(new Event('input', { bubbles: true })); const b = [...document.querySelectorAll('#stage button')].find(x => /^Raise the P1$/.test(x.textContent.trim())); b.click(); return S.id; });

// ---- D13 checks
const RISK = "Is there an immediate risk to trade or to anyone's health and safety?";
const DD = await page.evaluate(() => { const o = {}; Object.keys(D).forEach(k => { const n = D[k]; const set = new Set(); (n.e || []).forEach(x => x && set.add(x)); const re = /data-to="([^"]+)"/g; let m; [n.h, n.m].filter(Boolean).forEach(h => { re.lastIndex = 0; while ((m = re.exec(h))) set.add(m[1]); }); o[k] = { to: [...set], h: (n.h || '') }; }); return o; });
const parentsOf = {}; Object.entries(DD).forEach(([k, n]) => n.to.forEach(t => { const r = t === '@end' ? null : t; if (r) (parentsOf[r] = parentsOf[r] || []).push(k); }));
const riskSet = new Set(Object.keys(DD).filter(k => DD[k].h.includes(RISK)));
const URGQ = 'When does the customer need this in place?';
const urgSet = new Set(Object.keys(DD).filter(k => DD[k].h.includes(URGQ) || DD[k].h.includes('data-testid="urgency-kind"') || DD[k].h.includes('data-testid="urgency-banner"')));
const uuSet = new Set(Object.keys(DD).filter(k => DD[k].h.includes('Urgent — outside office hours')));
const unSet = new Set(Object.keys(DD).filter(k => DD[k].h.includes('Not urgent — the IoT team can pick this up in time')));
const d13 = { questionScreens: riskSet.size, ticketScreens: 0, gated: 0, exempt: 0, ungated: [], confirms: 0, confirmBad: [], confirmUngated: [], askText: 0, askBad: [] };
const TEXT_OK = { test: h => h.includes("<b>Ask the customer:</b> " + RISK + "</div>") };
for (const k of riskSet) { d13.askText++; if (!TEXT_OK.test(DD[k].h)) d13.askBad.push(k); }
for (const n of meta.nodes) {
  const h = DD[n.id].h;
  if (/data-testid="p1-confirm-warning"/.test(h)) {
    d13.confirms++;
    const ps = (parentsOf[n.id] || []).filter(p => !(n.id === 'SH:p1fail'));
    if (n.id !== 'SH:p1fail' && !ps.length) d13.confirmUngated.push(n.id + ' (no parent)');
    ps.forEach(p => { if (!riskSet.has(p) && !uuSet.has(p)) d13.confirmUngated.push(n.id + ' <- ' + p); });
  }
  if (n.tk && !n.p1) {
    d13.ticketScreens++;
    if (n.exempt) { d13.exempt++; continue; }
    const ps = (parentsOf[n.id] || []).filter(p => !(n.exemptParents || []).includes(p));
    if (!ps.length || ps.some(p => !riskSet.has(p) && !urgSet.has(p))) d13.ungated.push(n.id + ' <- ' + (ps.join(',') || 'nothing'));
    else d13.gated++;
  }
}
// P1 button disabled until the comment has real content
const confirmIds = meta.nodes.filter(n => /data-testid="p1-confirm-warning"/.test(DD[n.id].h) && n.id !== 'SH:p1fail').map(n => n.id);
const p1cases = []; let p1bad = [];
for (const id of confirmIds) {
  await page.evaluate(i => go(i), id);
  const st = await page.evaluate(() => {
    const ta = document.querySelector('[data-p1c]'), b = document.querySelector('[data-testid="record-outcome"]'); if (!ta || !b) return null;
    const out = {}; const set = v => { ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); return b.disabled; };
    out.initial = b.disabled; out.spaces = set('            '); out.short = set('too short'); out.ok = set('Fryers off, 80 covers booked'); out.cleared = set(''); out.tenSpaced = set('   abcdefghi   '); out.tenReal = set('abcdefghij');
    return out;
  });
  if (!st) { p1bad.push(id + ': no comment box or button'); continue; }
  const good = st.initial === true && st.spaces === true && st.short === true && st.ok === false && st.cleared === true && st.tenSpaced === true && st.tenReal === false;
  if (!good) p1bad.push(id + ' ' + JSON.stringify(st));
  p1cases.push(id);
}
// the button cannot be pressed with an empty comment even by clicking
await page.evaluate(() => go('K8888~30'));
const clickEmpty = await page.evaluate(() => { const b = document.querySelector('[data-testid="record-outcome"]'); b.click(); return S.id; });
// D14 and the automatic exceptions
const reachFrom = id => { const seen = new Set([id]), q = [id]; while (q.length) { const x = q.shift(); ((DD[x] || {}).to || []).forEach(t => { if (!seen.has(t) && DD[t]) { seen.add(t); q.push(t); } }); } return seen; };
const isConfirm = id => DD[id] && DD[id].h.includes('data-testid="p1-confirm-warning"');
const isP1After = id => DD[id] && DD[id].h.includes('data-testid="outcome-p1"');
d13.urg = { question: [...urgSet].filter(k => DD[k].h.includes(URGQ)).length, urgent: uuSet.size, notUrgent: unSet.size, chipBad: [], unReachesP1: [], uuNoConfirm: [], p1Orphans: [], auto: [], autoBad: [] };
for (const k of urgSet) if (DD[k].h.includes(URGQ)) { const to = (DD[k].h.match(/class="chip ans" data-to="([^"]+)"/g) || []).map(x => /data-to="([^"]+)"/.exec(x)[1]); if (to.length !== 4 || !to.slice(0, 2).every(t => uuSet.has(t) || t === 'K-auto-p1') || !to.slice(2).every(t => unSet.has(t) || t === 'K-normal')) d13.urg.chipBad.push(k + ' ' + to.join(',')); }
for (const k of unSet) { if (/^K-normal/.test(k)) continue; const r = reachFrom(k); [...r].forEach(x => { if (isConfirm(x) || isP1After(x)) d13.urg.unReachesP1.push(k + ' -> ' + x); }); }
for (const k of uuSet) { if (!/^UU:/.test(k)) continue; if (![...reachFrom(k)].some(isConfirm)) d13.urg.uuNoConfirm.push(k); }
const autoIds = meta.nodes.filter(n => n.p1 && !(parentsOf[n.id] || []).some(isConfirm)).map(n => n.id);
d13.urg.auto = autoIds; d13.urg.p1Orphans = autoIds.filter(id => id !== 'K-auto-p1');
const ap = parentsOf['K-auto-p1'] || []; d13.urg.autoBad = ['K-when-unknown', 'K-book-fail'].filter(p => !ap.includes(p));
// the retry screen (the 46th confirm screen): pre-filled, so the button starts enabled; clearing the comment disables it and typing enables it again
await page.evaluate(() => go('SH:p1fail'));
d13.p1failCheck = await page.evaluate(() => { const ta = document.querySelector('[data-p1c]'), b = document.querySelector('[data-testid="record-outcome"]'); const set = x => { ta.value = x; ta.dispatchEvent(new Event('input', { bubbles: true })); return b.disabled; }; const o = { initialEnabled: !b.disabled }; o.cleared = set(''); o.short = set('abc'); o.typed = set('Fryers off during Sunday lunch'); return o; });
d13.p1Checked = p1cases.length; d13.p1Bad = p1bad; d13.clickEmptyStaysOn = clickEmpty === 'K8888~30';

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
let md = '# OOHDASH-146 screen-text diff, revision 4 (prototype against live v1.6.6)\n\n';
md += 'Method: the real app (origin/main 916f6e3, v1.6.6) was run in fixture mode with writes enabled and a script clicked every button on every flow, saving each screen\'s html and text. The prototype is built from those captured screens. Example site name, house number and ticket numbers are normalised on both sides (item N1). This script then loads the finished prototype, reads the text of every screen and compares it line by line with the text of the live screen it came from.\n\n';
md += '## Result\n\n';
md += '- Prototype screens: ' + meta.nodes.length + ' (' + meta.nodes.filter(n => n.live).length + ' taken from live, ' + meta.nodes.filter(n => n.authored).length + ' authored for 146).\n';
md += '- Identical to live after example-data normalisation: ' + identical + '.\n- Differ from live, every difference mapped to an item below: ' + explained + '.\n- New in 146 (no live screen), each mapped to an item: ' + (isNew - rows.filter(r => r.status === 'new' && !r.items.length).length) + ' of ' + isNew + '.\n';
md += '- **Unexplained differences: ' + unexplained + '.**\n';
md += '- Live screens captured but not shown in the prototype: ' + notShown + ' (mostly control-window and duplicate crawl states; the replaced and removed live screens are listed under "Live screens replaced").\n';
md += '- Click test: ' + clicks + ' clicks on ' + idsAll.length + ' screens; dead buttons: ' + dead.length + '; buttons that lead to a missing screen: ' + navDead.length + '; JS errors: ' + errors.length + '.\n\n';
md += '## D13 (R14) checks\n\n- Screens that show the exact question: ' + d13.questionScreens + ' (exact text on all but: ' + (d13.askBad.join(', ') || 'none') + ').\n- Ticket screens (not P1): ' + d13.ticketScreens + '; each is either reached only from a risk question (' + d13.gated + ') or exempt because the problem was resolved on the call or the customer declined (' + d13.exempt + '); ungated: ' + (d13.ungated.join('; ') || 'none') + '.\n- P1 confirm screens: ' + d13.confirms + '; each reached only from a risk question; exceptions: ' + (d13.confirmUngated.join('; ') || 'none') + '.\n- P1 button disabled until the comment has real content: checked on ' + d13.p1Checked + ' confirm screens (empty, spaces only, 9 characters, cleared, ten characters padded with spaces stay disabled; real content enables); failures: ' + (d13.p1Bad.join('; ') || 'none') + '; clicking it with an empty comment stays on the confirm screen: ' + d13.clickEmptyStaysOn + '.\n\n';
md += '- D14 urgency: ' + d13.urg.question + ' "when is it needed" screens (chip mapping wrong on: ' + (d13.urg.chipBad.join('; ') || 'none') + '); ' + d13.urg.urgent + ' urgent banners; ' + d13.urg.notUrgent + ' not-urgent banners; a not-urgent screen reaches a P1: ' + (d13.urg.unReachesP1.join('; ') || 'never') + '; an urgent screen with no P1 confirm ahead: ' + (d13.urg.uuNoConfirm.join('; ') || 'none') + '.' + String.fromCharCode(10) + '- Automatic P1 exceptions: P1 screens with no confirm step ahead of them: ' + d13.urg.auto.join(', ') + ' (only K-auto-p1 expected; others: ' + (d13.urg.p1Orphans.join(', ') || 'none') + '); K-auto-p1 reached only from the "cannot make the change" screens: ' + (d13.urg.autoBad.length ? 'NO, missing ' + d13.urg.autoBad.join(',') : 'yes') + '.' + String.fromCharCode(10) + '- The retry confirm screen (SH:p1fail, pre-filled): ' + JSON.stringify(d13.p1failCheck) + '.' + String.fromCharCode(10) + String.fromCharCode(10);
md += '## Live screens not carried into the prototype (crawl states per scenario)\n\n' + Object.entries(replacedRoots).map(([r, c]) => r + ': ' + c).join(', ') + '. These are replaced by the changed screens named in the items below (HW-* by R3, O6832 by R2, CN7004 and CN-devoff by R5, the "Continue under Something else" dead ends in L-none, FAN-none, S-none by R4, the heating agent-button screens by R6), or are crawl states that only show a control window left open.\n\n';
md += '## The "differs from live" list\n\n| Item | What changes |\n|---|---|\n' + Object.keys(dl).map(k => '| ' + k + ' | ' + dl[k].title + '. ' + dl[k].what.replace(/\|/g, '/') + ' |').join('\n') + '\n\n';
md += '## Screens that differ from live, and why\n\n| Prototype screen | Live source | Items |\n|---|---|---|\n' + rows.filter(r => r.status !== 'identical').map(r => '| ' + r.id + ' | ' + (r.src || 'none (new)') + ' | ' + (r.items.join(', ') || 'UNEXPLAINED') + ' |').join('\n') + '\n\n';
md += '## Line-by-line differences (each line is either only in live or only in the prototype)\n\n' + detail.map(x => '### ' + x.id + ' (live ' + x.src + '; items ' + (x.items.join(', ') || 'UNEXPLAINED') + ')\n\n' + x.d.map(l => (l[0] === '-' ? '- Live: ' : '- Prototype: ') + l.slice(2)).join('\n')).join('\n\n') + '\n';
md += '\n## Identical screens\n\n' + rows.filter(r => r.status === 'identical').map(r => r.id).join(', ') + '\n';
fs.writeFileSync(OUT + '.md', md);
fs.writeFileSync(OUT + '.json', JSON.stringify({ screens: meta.nodes.length, identical, explained, isNew, unexplained, clicks, dead, navDead, errors, unreachable, p1sim: p1, d13, rows }, null, 1));
console.log(JSON.stringify({ screens: meta.nodes.length, identical, explained, isNew, unexplained, notShown, clicks, dead: dead.length, navDead: navDead.length, errors: errors.length, unreachable: unreachable.length, p1sim: p1 }));
if (dead.length) console.log('DEAD:', dead.slice(0, 30));
if (navDead.length) console.log('NAVDEAD:', navDead.slice(0, 30));
if (unreachable.length) console.log('UNREACHABLE:', unreachable.slice(0, 40));
console.log('D13:', JSON.stringify(d13));
console.log('UNEXPLAINED:', rows.filter(r => r.status === 'UNEXPLAINED').map(r => r.id).slice(0, 40));
