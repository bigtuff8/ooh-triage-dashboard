// OOHDASH-146 rev 2: today's text for screens the first dump never reached (dead ends and the divert case
// that wrongly says "everything is online"). Same method: the REAL app in fixture mode, flagged injections.
// Usage: node screen-dump-extra.mjs extra.json   (app on :3093, as in screen-dump.mjs)
import { newPage, confirm } from './lib.mjs';
import { writeFileSync } from 'fs';
const OUT = process.argv[2] || 'extra.json';
const { browser, page } = await newPage();
const results = {};
async function flow(cat, data, stage = 0, freeText = '') {
  await page.evaluate(({ cat, data, stage, freeText }) => {
    window.ctl = null; closeModal();
    state.flow = { cat, stage, data: Object.assign({ freeText, _flowKey: cat, additionalNotes: '' }, data), done: [] };
    render();
  }, { cat, data, stage, freeText });
  await page.waitForTimeout(150);
}
const panel = async () => (await page.locator('[data-testid="flow-panel"]').innerText()).trim();
async function record(id, how, note) {
  try { results[id] = { text: await how(), note: note || '' }; } catch (e) { results[id] = { text: 'DUMP FAILED: ' + e.message.split('\n')[0], note: note || '' }; }
  process.stdout.write(id + ' ');
}
const drop = (kind) => page.evaluate((k) => { state.workspace.devices = state.workspace.devices.filter(d => d.kind !== k); }, kind);
const INJ = (k) => 'reached by removing the ' + k + ' devices from the fixture workspace (no fixture site lacks them)';

await confirm(page, '6832');
await record('K-none', async () => { await drop('kitchen'); await flow('kitchen', {}, 0, 'The fryer won’t come on'); return panel(); }, INJ('kitchen'));
await confirm(page, '6832');
await record('L-none', async () => { await drop('lighting'); await flow('lighting', {}, 0, 'Car park lights are off'); return panel(); }, INJ('lighting'));
await confirm(page, '6832');
await record('FAN-none', async () => { await drop('fan'); await flow('fan', {}, 0, 'Need the fans on late'); return panel(); }, INJ('fan'));
await confirm(page, '6832');
await record('H-none', async () => { await drop('heating'); await flow('heating', {}, 0, 'The bar is freezing'); return panel(); }, INJ('heating'));
await confirm(page, '6832');
await record('AC-none', async () => { await flow('aircon', {}, 0, 'Aircon is blowing warm'); return panel(); }, 'today the air conditioning flow is the same at every site (row AC)');
// Divert case: site 7004 has everything online; one thermostat goes offline, the heating questions divert.
await confirm(page, '7004');
await record('CN-devoff', async () => {
  await page.evaluate(() => { const h = state.workspace.devices.find(d => d.kind === 'heating'); if (h) h.online = false; });
  await flow('connectivity', { from: 'heating' }, 0, 'The bar is freezing');
  return panel();
}, 'site 7004 with one thermostat set offline; the connection check run exactly as the heating divert runs it (flows.js:1680: cat connectivity, from heating)');
await confirm(page, '6771');
await record('WS-offline', async () => { await page.evaluate(() => { state.flow = null; state.workspace.anyOffline = true; render(); }); await page.waitForTimeout(150); return (await page.locator('[data-testid="offline-banner"]').innerText()).trim(); }, '');
writeFileSync(OUT, JSON.stringify(results, null, 1));
await browser.close();
console.log('\nwrote', OUT);
