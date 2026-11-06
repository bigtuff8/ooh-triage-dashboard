// OOHDASH-146 rev 3: crawls the REAL v1.6.6 app in fixture mode by clicking every answer button.
import { newPage, confirm } from './lib.mjs';
import fs from 'fs';
const roots = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const { browser, page } = await newPage();
const nodes = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const SKIP = /^(Cancel issue|➕ Raise another issue|✔ End call|Raise another issue|End call)$/;
const norm = t => t.replace(/#\d{4,6}/g, '#N').replace(/reference \d{4,6}/g, 'reference N').replace(/Ticket \d{4,6}/g,'Ticket N').replace(/\d{1,2}:\d{2}/g, 'HH:MM').replace(/\s+/g, ' ').trim();
const FLOWSEL = '[data-testid="flow-panel"]';
async function settle() {
  let prev = '', n = 0;
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(220);
    const t = await page.evaluate(() => { const f = document.querySelector('[data-testid="flow-panel"]'); return (f ? f.innerText : '') + (document.getElementById('modalroot') || {}).innerText; });
    if (t === prev && !/Saving|Raising|Logging|…$/.test(t)) { if (++n >= 2) return; } else n = 0;
    prev = t;
  }
}
async function startRoot(r) {
  await confirm(page, r.site);
  if (r.setup) await page.evaluate(new Function('return (' + r.setup + ')')());
  if (r.start === 'banner') { await page.evaluate(() => { state.workspace.anyOffline = true; render(); }); await page.locator('[data-testid="offline-banner"] button').click(); }
  else await page.evaluate(({ k, t }) => { state.smartEntryText = t; startTileFlow(k); }, { k: r.cat, t: r.text || '' });
  if (r.setup2) await page.evaluate(new Function('return (' + r.setup2 + ')')());
  await settle();
}
async function listButtons() {
  return page.evaluate(({ SKIP }) => {
    const re = new RegExp(SKIP);
    const out = [];
    const scopes = [document.querySelector('[data-testid="flow-panel"]'), document.getElementById('modalroot')].filter(Boolean);
    scopes.forEach((sc, si) => {
      [...sc.querySelectorAll('button')].forEach((b, i) => {
        const label = b.innerText.trim().replace(/\s+/g, ' ');
        if (!label || b.disabled || b.offsetParent === null) return;
        if (b.closest('.notes-group')) return;
        if (b.closest('.formrow') && !/^(Continue|Send|Submit|Save)/.test(label)) return;
        out.push({ label, scope: si, skip: re.test(label) });
      });
    });
    return out;
  }, { SKIP: SKIP.source });
}
async function fillInputs() {
  await page.evaluate(() => {
    const sc = [document.querySelector('[data-testid="flow-panel"]'), document.getElementById('modalroot')].filter(Boolean);
    sc.forEach(s => {
      s.querySelectorAll('.formrow .answers').forEach(a => { if (!a.querySelector('.sel')) { const c = a.querySelector('button.chip'); if (c) c.click(); } });
      s.querySelectorAll('input, textarea, select').forEach(e => {
        if (e.closest('.notes-group')) return;
        const set = v => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
        if (e.tagName === 'SELECT') { if (e.options.length > 1 && !e.value) set(e.options[1].value); }
        else if (e.type === 'checkbox' || e.type === 'radio') { }
        else if (e.type === 'time') { if (!e.value) set('01:00'); }
        else if (e.type === 'date') { }
        else if (!e.value) { const l = ((e.closest('.formrow,label,div') || {}).innerText || '') + (e.placeholder || ''); set(/contractor|company/i.test(l) ? 'Dan Price, Northern Refrigeration' : /what do they need|need/i.test(l) && /contractor|engineer|they/i.test(l) ? 'Needs the fryers on to test the gas interlock' : /equipment|which/i.test(l) ? 'The cellar python (beer line chiller)' : /day|time|when|hour/i.test(l) ? 'Fridays and Saturdays, open until 01:00' : 'Customer asked for this by phone'); }
      });
    });
  });
}
async function clickBtn(b, nth) {
  await fillInputs();
  const ok = await page.evaluate(({ label, scope, nth }) => {
    const sc = scope === 1 ? document.getElementById('modalroot') : document.querySelector('[data-testid="flow-panel"]');
    if (!sc) return false;
    const m = [...sc.querySelectorAll('button')].filter(x => !x.closest('.notes-group') && x.offsetParent !== null && x.innerText.trim().replace(/\s+/g, ' ') === label);
    if (!m[nth]) return false;
    m[nth].click(); return true;
  }, { label: b.label, scope: b.scope, nth });
  if (!ok) throw new Error('button not found ' + b.label);
  await settle();
}
async function capture() {
  return page.evaluate(() => {
    const f = document.querySelector('[data-testid="flow-panel"]');
    const g = document.querySelector('.wsgrid');
    const m = document.getElementById('modalroot');
    const app = document.getElementById('app');
    return { text: (f ? f.innerText : '').trim(), grid: g ? g.innerHTML : '', modal: m ? m.innerHTML : '', modalText: m ? m.innerText.trim() : '', frame: app ? app.innerHTML : '' };
  });
}
const key = c => norm(c.text + '||' + c.modalText);
let total = 0;
for (const r of roots) {
  const rid = r.id;
  const seen = {}; // sig -> id
  const queue = [{ path: [] }];
  let count = 0;
  const ids = Object.keys(nodes).filter(k => nodes[k].root === rid);
  if (ids.length && !r.force) { console.log('skip (done)', rid); continue; }
  async function replay(path) {
    await startRoot(r);
    for (const st of path) { await clickBtn({ label: st.label, scope: st.scope }, st.nth); }
  }
  async function visit(path, edge) {
    try { await replay(path); } catch (e) { console.log('replay fail', rid, path.map(p => p.label).join('>'), e.message.split('\n')[0]); return null; }
    const c = await capture();
    const sig = key(c);
    if (seen[sig]) return { id: seen[sig], isNew: false };
    const id = rid + '~' + (++count);
    seen[sig] = id;
    const btns = await listButtons();
    const nthMap = {};
    const list = btns.map(b => { const k2 = b.scope + '|' + b.label; nthMap[k2] = (nthMap[k2] || 0); const nth = nthMap[k2]++; return Object.assign({}, b, { nth }); });
    nodes[id] = { root: rid, path, text: c.text, modalText: c.modalText, grid: c.grid, modal: c.modal, frame: c.frame, buttons: list.map(b => ({ label: b.label, scope: b.scope, nth: b.nth, skip: b.skip, to: null })), setup: r.setup || null };
    return { id, isNew: true, list };
  }
  const work = [];
  const pre = (r.prefix || []).map(l => ({ label: l, scope: 0, nth: 0 }));
  const first = await visit(pre); if (!first) { console.log('root failed', rid); continue; }
  work.push({ id: first.id, path: pre, list: first.list });
  while (work.length) {
    const w = work.shift();
    for (let i = 0; i < w.list.length; i++) {
      const b = w.list[i];
      if (b.skip) continue;
      const path = w.path.concat([{ label: b.label, scope: b.scope, nth: b.nth }]);
      if (path.length > (r.depth || 14) || count > (r.max || 90)) continue;
      const res = await visit(path);
      if (!res) continue;
      nodes[w.id].buttons[i].to = res.id;
      if (res.isNew) work.push({ id: res.id, path, list: res.list });
    }
    fs.writeFileSync(OUT, JSON.stringify(nodes));
  }
  console.log('root', rid, 'screens', count);
  total += count;
}
fs.writeFileSync(OUT, JSON.stringify(nodes));
console.log('TOTAL', total);
await browser.close();
