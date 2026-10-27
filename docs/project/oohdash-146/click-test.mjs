// OOHDASH-146 rev 2: click-tests the prototype and scans every rendered screen for banned words.
// Usage: node click-test.mjs [path-to-mockup.html]
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const file = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'mockups', 'OOHDASH-146-mockup.html');
const BANNED = [/\bcaller\b/i, /setpoint/i, /frost-hold/i, /\boverride/i, /overridden/i, /boiler panel/i, /hold active/i, /\brevert/i, /\bboost/i, /salus/i, /tuya/i, /\brelay\b/i, /gateway/i, /schedule/i, /End with no action/, /Captured for the IoT team/, /Capture &/, /\bCHZ/, /IT\d{3}-/, /Scope guidance/, /sounds like the boiler/i, /\banyway\b/i, /Give (building-heat )?guidance/, /Check if/, /Back to the issue picker/, /Continue under/, /Escalate as P1/, /Override done/, /#undefined/, /until \?/];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(file).href);
await page.evaluate(() => togProto());
const ids = await page.evaluate(() => STATES.map(s => s.id));
const kinds = await page.evaluate(() => Object.fromEntries(STATES.map(s => [s.id, s.kind])));
const text = async () => page.evaluate(() => {
  const clone = document.getElementById('flow').cloneNode(true);
  clone.querySelectorAll('.oldtext').forEach(n => n.remove());
  return clone.innerText + '\n' + document.getElementById('modalroot').innerText;
});
const hits = []; let screens = 0; let clicks = 0; const dead = [];
async function scan(id, phase) { screens++; const t = await text(); for (const re of BANNED) { const m = t.match(re); if (m) hits.push(`${id}/${phase}: ${m[0]}`); } }
for (const id of ids) {
  await page.evaluate(i => go(i), id);
  await scan(id, 'card');
  const SEL = (await page.locator('#modalroot .overlay').count()) ? '#modalroot button' : '#flow button, #modalroot button';
  const nBtn = await page.locator(SEL).count();
  for (let i = 0; i < nBtn; i++) {
    await page.evaluate(i => go(i), id);
    const b = page.locator(SEL).nth(i);
    if (!(await b.isVisible())) continue;
    const before = await page.evaluate(() => S.id + '|' + S.phase + '|' + document.getElementById('flow').innerHTML.length);
    await b.click({ timeout: 3000 }); clicks++;
    await page.waitForTimeout(20);
    const after = await page.evaluate(() => S.id + '|' + S.phase + '|' + document.getElementById('flow').innerHTML.length + '|' + document.getElementById('toasts').innerText + document.getElementById('modalroot').innerHTML.length);
    if (before === after.split('|').slice(0, 3).join('|') && !/\S/.test(after.split('|')[3] || '')) dead.push(`${id} button ${i}`);
  }
  if (kinds[id] === 'outcome') {
    await page.evaluate(i => go(i), id);
    await page.click('[data-testid="std-checklog"]'); await scan(id, 'wrap');
    await page.click('[data-testid="wrap-submit"]'); await page.waitForTimeout(700); await scan(id, 'logged');
    const ok = await page.locator('[data-testid="wrap-logged"], [data-testid="wrap-logged-closed"]').count();
    if (!ok) dead.push(id + ' did not reach logged');
  }
  if (kinds[id] === 'p1') {
    await page.evaluate(i => go(i), id);
    await page.click('[data-testid="wrap-submit-p1"]'); await page.waitForTimeout(700); await scan(id, 'p1-logged');
    if (!(await page.locator('[data-testid="outcome-p1"]').count())) dead.push(id + ' did not reach P1 raised');
  }
}
// failure simulation: one P1 and one Check and log
await page.evaluate(() => { S.sim = true; S.failedOnce = false; go('K-crit'); });
await page.click('[data-testid="wrap-submit-p1"]'); await page.waitForTimeout(700);
const p1fail = await page.locator('[data-testid="p1-raise-failed"]').count();
const p1failNoTicket = !(await text()).includes('P1 raised');
await scan('K-crit', 'p1-failed');
await page.click('[data-testid="wrap-submit-p1"]'); await page.waitForTimeout(700);
const p1after = await page.locator('[data-testid="outcome-p1"]').count();
await page.evaluate(() => { S.sim = true; S.failedOnce = false; go('HW-nlh'); });
await page.click('[data-testid="std-checklog"]'); await page.click('[data-testid="wrap-submit"]'); await page.waitForTimeout(700);
const logfail = await page.locator('[data-testid="log-failed"]').count();
await page.click('[data-testid="wrap-submit"]'); await page.waitForTimeout(700);
const closedAfter = await page.locator('[data-testid="wrap-logged-closed"]').count();
// phone width: no horizontal page scroll on a sample of screens
await page.setViewportSize({ width: 390, height: 844 });
const wide = [];
for (const id of ['CD-home', 'K-when', 'K-booked-later', 'HW-0', 'SH-p1fail', 'O-0']) { await page.evaluate(i => go(i), id); const w = await page.evaluate(() => document.documentElement.scrollWidth); if (w > 400) wide.push(id + ':' + w); }
await browser.close();
console.log(JSON.stringify({ states: ids.length, screensScanned: screens, buttonsClicked: clicks, jsErrors: errors, bannedHits: hits, deadButtons: dead, p1FailShown: p1fail, p1FailNoTicket: p1failNoTicket, p1AfterRetry: p1after, logFailShown: logfail, closedAfterRetry: closedAfter, phoneWidthOverflow: wide }, null, 1));
