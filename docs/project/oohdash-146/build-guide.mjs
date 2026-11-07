// OOHDASH-146 rev 4.1: builds the PowerPause guide as a FAITHFUL copy of the Word document
// "Lighthouse PowerPause Contractor Info.docx" (Remote Monitoring - General / Customer Sites / Greene King / Flaming Grills / Phase 2 Sites / Engineer Information).
// Text, phone number, Tongou / Owon wording, table and pictures are exactly the document's, in the document's order. No refinement.
// Usage: node build-guide.mjs <extracted-docx-dir> <emf-as-png> <out-guide-dir> <out-standalone.html>   (run with playwright resolvable)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [, , X, EMFPNG, OUT, STANDALONE] = process.argv;
const M = X + '/word/media/';
const imgDir = path.join(OUT, 'powerpause'); fs.rmSync(imgDir, { recursive: true, force: true }); fs.mkdirSync(imgDir, { recursive: true });

// 1. pictures: every picture in the document body, in document order (image12 is the page-header logo; the header repeats on every Word page, so it is shown once at the top)
const PICS = [
  ['image12.png', 'doc-0-header-logo', 432, 'Lighthouse logo with the slogan, from the page header of the Word document'],
  ['image1.jpeg', 'doc-1-interlock-panel', 900, 'Safety interlock panel: the green light and the green start button for fryers and gantries'],
  ['image2.png', 'doc-2-tongou', 454, 'Tongou device on the PowerPause panel, with the override button marked'],
  ['image3.png', 'doc-3-owon', 356, 'Owon meter on the PowerPause panel, with the override button marked'],
  ['image4.png', 'doc-4-label', 767, 'The Lighthouse PowerPause label that is attached to every controlled appliance'],
  ['image5.jpeg', 'doc-5-kitchen-panel', 900, 'Example kitchen PowerPause panel'],
  ['image6.jpeg', 'doc-6-interlock-panel', 900, 'Example interlock panel for the bain-marie, heated gantries and fryers, with its start button'],
  ['image7.jpeg', 'doc-7-ceiling-panel', 900, 'Example ceiling PowerPause panel'],
  ['image8.jpeg', 'doc-8-bar-panel', 900, 'Example bar PowerPause panel'],
  ['image9.png', 'doc-9-single-phase', 195, 'Manual override button on a single phase appliance'],
  ['image10.png', 'doc-10-three-phase', 102, 'Manual override button on a three phase appliance'],
  [null, 'doc-11-contactor', 204, 'Contactor with its manual control switch']
];
const browser = await chromium.launch(); const page = await browser.newPage();
const done = {};
for (const [src, name, maxW] of PICS) {
  const file = src ? M + src : EMFPNG; const ext = src ? path.extname(src).toLowerCase() : '.png';
  const buf = fs.readFileSync(file); const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const r = await page.evaluate(async ({ b64, mime, maxW }) => {
    const img = new Image(); img.src = 'data:' + mime + ';base64,' + b64; await img.decode();
    const w = Math.min(img.naturalWidth, maxW), h = Math.round(img.naturalHeight * w / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    const keepPng = mime === 'image/png';
    return { url: c.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.82), w, h, png: keepPng };
  }, { b64: buf.toString('base64'), mime, maxW });
  const fn = name + (r.png ? '.png' : '.jpg');
  fs.writeFileSync(path.join(imgDir, fn), Buffer.from(r.url.split(',')[1], 'base64'));
  done[name] = { fn, w: r.w, h: r.h };
}
await browser.close();

// 2. the table, read from the document
const doc = fs.readFileSync(X + '/word/document.xml', 'utf8');
const tbl = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(doc)[0];
const cellText = c => [...c.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
const rows = [...tbl.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(r => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(c => cellText(c[0])));
const esc = s => String(s).replace(/&amp;/g, '&').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tableHtml = '<table><tbody>' + rows.map((r, i) => '<tr>' + r.map(c => (i === 0 ? '<th scope="col">' : '<td>') + esc(c) + (i === 0 ? '</th>' : '</td>')).join('') + '</tr>').join('') + '</tbody></table>';

// 3. the page: the document's text and order, word for word
const fig = (n, caption) => { const p = PICS.find(x => x[1].startsWith('doc-' + n + '-')); const d = done[p[1]]; return '<figure><img src="@@' + d.fn + '@@" width="' + d.w + '" height="' + d.h + '" alt="' + esc(p[3]) + '">' + (caption ? '<figcaption>' + caption + '</figcaption>' : '') + '</figure>'; };
const ul = a => '<ul>' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
const body = [
  fig(0),
  '<h1>Lighthouse PowerPause – Smart Appliance Control – Contractor Version</h1>',
  '<p>PowerPause is part of the Lighthouse IoT roll-out. It makes sure kitchen appliances aren’t switched on too early or left running too late, saving energy and reducing costs.</p>',
  '<h2>How It Works</h2>', ul(['Appliances are switched on/off automatically at agreed times.', 'Times are set in line with the pub’s operating hours.', 'Changes to schedules must be authorised by the Area Manager.', 'Ad-hoc exceptions (e.g. football matches, TV events, festive hours) should be raised with the Pub Support Team, who will coordinate with the Area Manager.']),
  '<h2>Safety Interlock Appliances (Fryers &amp; Gantries)</h2>', ul(['Controlled via the interlock panel in the kitchen.', 'Green light ON → Appliance available to use.', 'Press the green button → You’ll hear the contactor click and the appliance powers up.']),
  fig(1),
  '<h2>All Devices connected to Power Pause</h2>', ul(['Controlled through Power Pause panel (pictured below)', 'Appliances have agreed schedules with Greene King (attached underneath)', '2 different devices (Tongou & Owon)', 'Both devices have an override switch (for contractor use only)']),
  '<div class="pair">', fig(2, '<b>Override button for Tongou device</b><br>(Press this button once, do not hold down this will remove from the system)<br><b>Tongou (On)</b>'),
  fig(3, '<b>Override button for Owon device</b><br>(Press this button once, do not hold down this will remove from the system)<br><b>Owon Meter (On)</b>'), '</div>',
  '<p>If you need to override the PowerPause for maintenance purposes, locate the PowerPause panel usually located by the kitchen distribution boards, behind the appliance or mounted on the ceiling.</p>',
  '<h2>Look for This Label</h2>', ul(['Every appliance controlled by PowerPause will have this label attached:']), fig(4),
  '<h2>Lighthouse Support</h2>', '<p>For any help or schedule adjustments, contact the Lighthouse IoT Support Team:</p>', '<p>E: iot@airedale-group.co.uk</p>', '<p>T: 023 814 0228</p>',
  '<h2>Which Appliances Are We Controlling</h2>', ul(['Supply & Extract Fans', 'Merry Chefs', 'Fryers', 'Grills', 'Griddles', 'Bain Maire / Heated Gantry / Super Pass', 'Dishwashers', 'Glasswasher', 'Carveries', 'Combi Ovens', 'Coffee Machines', 'Outside Lights', 'External Heaters / Jumbrellas']),
  '<h2>Agreed Fire Up Fire Down times (based on serving hours)</h2>', '<div class="tw">' + tableHtml + '</div>',
  '<h2>Example Kitchen PowerPause Panel</h2>', fig(5),
  '<h2>Example Interlock Panel</h2>', fig(6), '<p>This is a safety interlock panel for the bainemarie/heated gantries and the fryers. Press the start button to enable the contactor</p>',
  '<h2>Example Ceiling Panel</h2>', fig(7), '<p><b>Please note on the ceiling and back of appliance panel the existing 13A sockets still exists for isolation and for IR testing.</b></p>',
  '<h2>Example Bar Panel</h2>', fig(8),
  '<h2>Manual Override Button</h2>',
  '<h3>Single Phase Appliances</h3>', fig(9, 'Press Once to Override until the next time schedule<br>(Do not hold down the button)'),
  '<h3>Three Phase Appliances</h3>', fig(10, 'Press Once to Override until the next time schedule<br>(Do not hold down the button)'),
  '<p>Don’t forget to press the start button on the interlock panel for those appliances that have them</p>',
  '<h2>Contactor Override</h2>', '<p>If the PowerPause is faulty and the pub requires the appliance to be manually overridden to operate. Please either power the coil on the contactor or where present use the contactor manual on button</p>', fig(11, 'Manual Contactor Control'),
  '<h2>Contact and Report to Airedale Lighthouse Team</h2>', '<p>Please report any issues to the Lighthouse Team on iot@airedale-group.co.uk</p>', '<p>Many thanks</p>'
].join('\n');
const css = ':root{--bg:#fff;--text:#111;--muted:#555;--line:#d9d9d9;--card:#fff}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171d;--text:#e7eaf0;--muted:#9aa3b2;--line:#2b313c;--card:#fff}}:root[data-theme="dark"]{--bg:#14171d;--text:#e7eaf0;--muted:#9aa3b2;--line:#2b313c;--card:#fff}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:760px;margin:0 auto;padding:20px 16px 48px;color:var(--text);background:var(--bg);line-height:1.5}h1{font-size:1.35rem}h2{font-size:1.05rem;margin:26px 0 8px;border-top:1px solid var(--line);padding-top:14px}h3{font-size:.98rem;margin:16px 0 6px}ul{margin:0 0 10px;padding-left:22px}figure{margin:12px 0;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px;color:#111;text-align:center}figure img{max-width:100%;max-height:560px;width:auto;height:auto}figcaption{font-size:.9rem;margin-top:6px;text-align:left}.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.88rem}th,td{border:1px solid var(--line);padding:4px 6px;text-align:left}th{background:rgba(127,127,127,.15)}';
const html = f => '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lighthouse PowerPause – Contractor Version</title><style>' + css + '</style></head><body><main>\n' + body.replace(/@@([^@]+)@@/g, (m, fn) => f(fn)) + '\n</main></body></html>\n';
fs.writeFileSync(path.join(OUT, 'powerpause-contractor-info.html'), html(fn => 'powerpause/' + fn));
fs.writeFileSync(STANDALONE, html(fn => 'data:' + (fn.endsWith('.png') ? 'image/png' : 'image/jpeg') + ';base64,' + fs.readFileSync(path.join(imgDir, fn)).toString('base64')));
const total = fs.readdirSync(imgDir).reduce((a, f) => a + fs.statSync(path.join(imgDir, f)).size, 0);
console.log('pictures', Object.keys(done).length, 'bytes', total, 'table rows', rows.length, 'cols', rows[0].length);
