// Crops the PowerPause device pictures out of the 9 guide page scans (and optimises them).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const SC = process.argv[2];
const SRC = SC + '/live/docs/project/guides/powerpause';
const OUT = SC + '/guide-img';
fs.mkdirSync(OUT, { recursive: true });
const CROPS = [
  ['interlock-start-buttons', SRC + '/page-1.jpg', 197, 674, 307, 280],
  ['tongou-override-photo', SRC + '/page-2.jpg', 130, 130, 750, 336],
  ['owon-override-photo', SRC + '/page-2.jpg', 130, 487, 890, 368],
  ['lighthouse-label', SC + '/docx/x/word/media/image1.png', 0, 0, 0, 0],
  ['kitchen-powerpause-panel', SRC + '/page-4.jpg', 130, 282, 779, 734],
  ['interlock-panel', SRC + '/page-5.jpg', 130, 163, 791, 757],
  ['ceiling-panel', SRC + '/page-6.jpg', 130, 170, 633, 844],
  ['bar-panel', SRC + '/page-7.jpg', 130, 170, 645, 860],
  ['override-single-phase', SRC + '/page-8.jpg', 130, 225, 735, 490],
  ['override-three-phase', SRC + '/page-8.jpg', 130, 800, 700, 555],
  ['contactor-manual-button', SRC + '/page-9.jpg', 130, 315, 740, 430]
];
const browser = await chromium.launch();
const page = await browser.newPage();
const info = [];
for (const [name, file, x, y, w, h] of CROPS) {
  const b64 = fs.readFileSync(file).toString('base64');
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const res = await page.evaluate(async ({ b64, mime, x, y, w, h }) => {
    const img = new Image(); img.src = 'data:' + mime + ';base64,' + b64; await img.decode();
    if (!w) { w = img.naturalWidth; h = img.naturalHeight; }
    const scale = Math.min(1, 900 / w);
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.82).split(',')[1], w: c.width, h: c.height };
  }, { b64, mime, x, y, w, h });
  fs.writeFileSync(OUT + '/' + name + '.jpg', Buffer.from(res.data, 'base64'));
  info.push({ name, w: res.w, h: res.h, bytes: Buffer.from(res.data, 'base64').length });
}
fs.writeFileSync(OUT + '/index.json', JSON.stringify(info, null, 1));
console.log(info.map(i => i.name + ' ' + i.w + 'x' + i.h + ' ' + Math.round(i.bytes / 1024) + 'KB').join('\n'));
await browser.close();
