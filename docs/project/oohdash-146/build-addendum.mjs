// OOHDASH-146 rev 4.3: builds the self-contained addendum page for D15 (start screen) and D16 (caller banner).
// Every frame is a real screen of the prototype (its own markup and the live stylesheet), captured in the state named in its label and
// shown in an iframe so the real responsive rules apply (the phone frames are 390 pixels wide).
// Usage: node build-addendum.mjs <prototype.html> <live-styles.css> <proto.css> <out.html>   (run with playwright resolvable)
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [, , PROTO, LIVECSS, PROTOCSS, OUT] = process.argv;
const css = fs.readFileSync(LIVECSS, 'utf8') + '\n' + fs.readFileSync(PROTOCSS, 'utf8') + '\nbody{padding-top:0}.topbar{top:0}';
const FRAMES = [
  { id: 'HOME', flow: 'New call', page: 'Start screen: "Who\'s calling?" with the site search on the same screen', state: 'Nothing typed yet. No banner yet: the call has not started.', wide: true },
  { id: 'CD-partial', flow: 'New call', page: 'Start screen', state: 'Partly filled: name and role, no number yet. The agent can still go straight to the site search.', wide: true },
  { id: 'CD-results', flow: 'New call', page: 'Start screen with site search results', state: 'Details given; the agent has typed "wheat" and picks the site from the result.', wide: true },
  { id: 'WORKSPACE', flow: 'Site screen', page: 'What is the customer reporting?', state: 'Banner: full details', caller: 'full', wide: true },
  { id: 'K8888~2', flow: 'Kitchen', page: 'Override step (the live 159 screen)', state: 'Banner: full details (name, role, number, site)', caller: 'full', wide: true },
  { id: 'BP9001-read~2', flow: 'Heating, boiler panel', page: 'What do you need?', state: 'Banner: partial, name only ("no number taken", with "Add details")', caller: 'name', wide: true },
  { id: 'O-choice', flow: 'Something else', page: 'The universal risk question', state: 'Banner: no contact details taken (quiet text, optional "Add details", never blocks)', caller: 'none', wide: true },
  { id: 'L6749~1', flow: 'Outside lighting', page: 'Override first', state: 'Banner: full details', caller: 'full', wide: true },
  { id: 'CT6832~2', flow: 'Contractor on site', page: 'Does the engineer need help with the override?', state: 'Banner: partial, number only ("no name taken")', caller: 'number', wide: true },
  { id: 'K8888~30', flow: 'Kitchen', page: 'P1 confirm with the mandatory comment (comment filled, button now live)', state: 'Banner: full details', caller: 'full', comment: 'Fryers off during Sunday lunch service, 80 covers booked', wide: true },
  { id: 'K8888~52', flow: 'Kitchen', page: 'After-card: P1 raised, with the ticket link and the End call button', state: 'Banner: partial, number only (still visible at the end of the call)', caller: 'number', wide: true },
  { id: 'CD-add', flow: 'Any flow', page: 'Add details during the call (opened from the banner)', state: 'Opened from a screen with no details taken; the agent comes back to the same screen after saving.', caller: 'none', from: 'K8888~2', wide: true },
  { id: 'K8888~2', flow: 'Kitchen', page: 'Override step, after details were added mid-call', state: 'Banner updated to full details', caller: 'full', wide: true, suffix: ' (after adding details)' },
  { id: 'K8888~2', flow: 'Kitchen', page: 'Override step at phone width (390 pixels)', state: 'Banner: full details, compact single line, sticky under the top bar', caller: 'full', phone: true },
  { id: 'O-choice', flow: 'Something else', page: 'Risk question at phone width (390 pixels)', state: 'Banner: no contact details taken; the say box stays on screen', caller: 'none', phone: true }
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('file:///' + PROTO.replace(/\\/g, '/'));
const CALLERS = { full: 'full', name: 'name', number: 'number', none: 'none' };
for (const f of FRAMES) {
  if (f.caller) await page.selectOption('#bsel', CALLERS[f.caller]);
  if (f.from) await page.evaluate(i => go(i), f.from);
  await page.evaluate(i => go(i), f.id);
  if (f.comment) await page.evaluate(c => { const ta = document.querySelector('[data-p1c]'); ta.value = c; ta.textContent = c; ta.dispatchEvent(new Event('input', { bubbles: true })); }, f.comment);
  f.html = await page.evaluate(() => document.getElementById('stage').innerHTML + document.getElementById('modalroot').innerHTML);
  f.banner = await page.evaluate(() => { const b = document.querySelector('[data-testid="caller-banner"]'); return b ? b.getAttribute('data-state') : 'none (not in a call yet)'; });
}
await browser.close();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const doc = f => '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body>' + f.html + '</body></html>';
const pageCss = ':root{--bg:#f4f5f7;--card:#fff;--text:#1d2330;--muted:#5b6475;--line:#d9dde5;--accent:#4f46e5}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171d;--card:#1e232c;--text:#e7eaf0;--muted:#9aa3b2;--line:#2b313c;--accent:#8b93ff}}:root[data-theme="dark"]{--bg:#14171d;--card:#1e232c;--text:#e7eaf0;--muted:#9aa3b2;--line:#2b313c;--accent:#8b93ff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1180px;margin:0 auto;padding:20px 16px 56px}h1{font-size:1.4rem;margin:0 0 6px}h2{font-size:1.05rem;margin:28px 0 4px}p{margin:0 0 10px}.muted{color:var(--muted)}.note{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin:14px 0}.frame{margin:16px 0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}.cap{font-size:.92rem;margin:0 0 8px}.cap b{font-weight:650}.tag{display:inline-block;font-size:.78rem;border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin-right:6px;color:var(--muted)}iframe{width:100%;height:620px;border:1px solid var(--line);border-radius:8px;background:#fff;display:block}.phone iframe{width:390px;height:720px;margin:0 auto;max-width:100%}a{color:var(--accent)}@media (max-width:700px){main{padding:14px 10px 40px}iframe{height:560px}}';
let n = 0;
const fr = FRAMES.map(f => { n++; return '<section class="frame' + (f.phone ? ' phone' : '') + '"><p class="cap"><span class="tag">Frame ' + n + '</span><b>' + esc(f.flow) + '</b> · ' + esc(f.page) + '<br><span class="muted">State: ' + esc(f.state) + '</span></p><iframe title="Frame ' + n + ': ' + esc(f.flow + ', ' + f.page + ', ' + f.state) + '" srcdoc="' + esc(doc(f)) + '" loading="lazy"></iframe></section>'; });
const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OOHDASH-146 addendum: Who\'s calling and the caller banner</title><style>' + pageCss + '</style></head><body><main>' +
  '<h1>OOHDASH-146 addendum: "Who\'s calling?" start screen (D15) and the caller banner (D16)</h1>' +
  '<p class="muted">Revision 4.3 of the design. Every frame below is a real screen from the clickable prototype, drawn with the live stylesheet, in the state named in its label. Frames are static pictures you can scroll inside; to click through the whole call, open the <a href="oohdash-146-mockup.html">full prototype</a> (it starts on this new screen, and the "Caller banner" control at the top lets you switch the banner state on any screen).</p>' +
  '<div class="note"><b>What changes.</b> "New call" opens "Who\'s calling?" with the customer\'s name, role and number and the site search on one screen. The details are optional: the agent can go straight to the site search, and the call record still starts when the site is confirmed. Once the site is confirmed, a permanent banner shows on every in-call screen: the caller\'s name, number and role if given, and the site. Four states: full details; partial (name only or number only); none taken (quiet "No contact details taken" with an optional "Add details" that never blocks); and updated when details are added mid-call. The banner is display only inside the signed-in session. Customer contact data is still held only on the Zendesk ticket, with the 12 month automatic deletion and manual removal from PD-1.</div>' +
  '<h2>1. The start screen</h2>' + fr.slice(0, 3).join('') +
  '<h2>2. The banner in different flows and page structures</h2>' + fr.slice(3, 11).join('') +
  '<h2>3. Adding details mid-call</h2>' + fr.slice(11, 13).join('') +
  '<h2>4. Phone width</h2>' + fr.slice(13).join('') +
  '<p class="muted" style="margin-top:28px">Prototype only: example names and numbers. Built by docs/project/oohdash-146/build-addendum.mjs from the prototype.</p></main></body></html>\n';
fs.writeFileSync(OUT, html);
console.log('addendum', FRAMES.length, 'frames', (html.length / 1024).toFixed(0) + 'KB');
