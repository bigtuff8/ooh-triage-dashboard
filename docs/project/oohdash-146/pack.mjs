// Packs the live crawl into prototype nodes: strips handlers, tags buttons with their edge index, splits the page frame.
import { chromium } from 'playwright';
import fs from 'fs';
const files = process.argv.slice(2, -1);
const OUT = process.argv[process.argv.length - 1];
let crawl = {};
for (const f of files) Object.assign(crawl, JSON.parse(fs.readFileSync(f, 'utf8')));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3093/auth/dev');
await page.locator('button:has-text("Test Handler")').click();
await page.waitForSelector('[data-testid="operator-name"]');
const proc = (args) => page.evaluate(({ grid, modal, edges, frame }) => {
  const strip = el => { el.querySelectorAll('*').forEach(e => { [...e.attributes].forEach(a => { if (/^on/i.test(a.name)) e.removeAttribute(a.name); }); }); };
  const wrap = document.createElement('div'); wrap.style.cssText = 'position:absolute;left:0;top:0;width:900px';
  document.body.appendChild(wrap);
  const out = {};
  wrap.innerHTML = grid;
  const left = wrap.children[0], right = wrap.children[1];
  const flow = left && left.querySelector('.flowpanel');
  const headCard = left && left.querySelector(':scope > .card');
  const banner = left && left.querySelector('.p1-banner');
  const tag = (scopeEl, scope) => {
    if (!scopeEl) return;
    const btns = [...scopeEl.querySelectorAll('button')].filter(b => !b.closest('.notes-group') && b.offsetParent !== null && !b.disabled && (b.innerText.trim()));
    // same filter as the crawler's listButtons
    const f = btns.filter(b => !(b.closest('.formrow') && !/^(Continue|Send|Submit|Save)/.test(b.innerText.trim().replace(/\s+/g, ' '))));
    const counts = {};
    f.forEach(b => {
      const label = b.innerText.trim().replace(/\s+/g, ' ');
      const k = scope + '|' + label; const nth = counts[k] || 0; counts[k] = nth + 1;
      const idx = edges.findIndex(e => e.scope === scope && e.label === label && e.nth === nth);
      if (idx >= 0) b.setAttribute('data-e', String(idx));
    });
  };
  if (flow) tag(flow, 0);
  if (flow) { const fl = flow; strip(fl); out.flow = fl.outerHTML; }
  if (headCard) { strip(headCard); out.head = headCard.outerHTML; }
  if (banner) { strip(banner); out.p1 = banner.outerHTML; }
  if (right) { strip(right); out.right = right.innerHTML; }
  // anything else in the left column apart from head card, banner, flow (e.g. call-so-far, other cards)
  if (left) { const extra = [...left.children].filter(c => c !== headCard && c !== banner && c !== flow); out.extra = extra.map(e => { strip(e); return e.outerHTML; }).join(''); }
  if (modal) {
    wrap.innerHTML = modal;
    const m = wrap;
    tag(m, 1);
    strip(m); out.modal = wrap.innerHTML;
  }
  wrap.remove();
  return out;
}, args);
const nodes = {};
const frames = {};
for (const [id, n] of Object.entries(crawl)) {
  const r = await proc({ grid: n.grid, modal: n.modal || '', edges: n.buttons, frame: '' });
  nodes[id] = { root: n.root, path: n.path.map(p => p.label), text: n.text, modalText: n.modalText, flow: r.flow || '', head: r.head || '', p1: r.p1 || '', right: r.right || '', extra: r.extra || '', modal: n.modal ? r.modal : '', edges: n.buttons.map(b => ({ l: b.label, s: b.scope, to: b.to, skip: !!b.skip })) };
  if (!frames[n.root]) {
    const f = n.frame; const gi = n.grid ? f.indexOf(n.grid.slice(0, 80)) : -1;
    let pre = f, post = '';
    if (gi >= 0) { const start = f.lastIndexOf('<div class="wsgrid">', gi) + '<div class="wsgrid">'.length; pre = f.slice(0, start); post = f.slice(gi + n.grid.length); }
    frames[n.root] = { pre, post };
  }
}
fs.writeFileSync(OUT, JSON.stringify({ nodes, frames }));
console.log('packed', Object.keys(nodes).length, 'nodes', Object.keys(frames).length, 'frames');
await browser.close();
