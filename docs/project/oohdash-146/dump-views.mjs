// Captures the non-flow screens of the REAL v1.6.6 app (HTML + text): home, site confirm, ambiguous, search,
// callback, Tonight, control window states, boiler heating screens.
import { newPage, confirm } from './lib.mjs';
import { writeFileSync } from 'fs';
const OUT = process.argv[2];
const { browser, page } = await newPage();
const R = {};
const app = () => page.evaluate(() => document.getElementById('app').innerHTML);
const modalH = () => page.evaluate(() => document.getElementById('modalroot').innerHTML);
const bodyText = () => page.evaluate(() => document.getElementById('app').innerText.trim());
const modalT = () => page.evaluate(() => document.getElementById('modalroot').innerText.trim());
async function rec(id, how, note) {
  try { const r = await how(); R[id] = Object.assign({ note: note || '' }, r); process.stdout.write(id + ' '); }
  catch (e) { console.log('FAIL', id, e.message.split('\n')[0]); }
}
const full = async () => ({ app: await app(), text: await bodyText(), modal: await modalH(), modalText: await modalT() });
await rec('home', async () => { await page.evaluate(() => go('home')); await page.waitForTimeout(400); return full(); });
await rec('search-none', async () => { await page.locator('[data-testid="site-search"]').fill('Zzyzx Arms'); await page.waitForTimeout(900); return full(); });
await rec('site-confirm', async () => { await page.evaluate(() => go('home')); await page.evaluate(async () => { await openSite('6832'); }); await page.waitForSelector('[data-testid="confirm-gate"]'); return full(); });
await rec('site-ambiguous', async () => { await page.evaluate(() => { state.ambiguous = null; state.siteNo = null; go('home'); }); await page.evaluate(async () => { await openSite('6758'); }); await page.waitForSelector('[data-testid="ambiguous-card"]'); return full(); });
await page.evaluate(() => { state.ambiguous = null; state.siteNo = null; go('home'); render(); });
await confirm(page, '6832');
await rec('workspace', async () => { await page.waitForTimeout(300); return full(); });
await rec('workspace-offline', async () => { await page.evaluate(() => { state.workspace.anyOffline = true; render(); }); await page.waitForTimeout(200); return full(); });
await rec('callback-list', async () => { await page.evaluate(() => go('callback')); await page.evaluate(async () => { await pickCallbackSite('6832'); }); await page.waitForTimeout(500); return full(); });
await rec('callback-drawer', async () => {
  const id = await page.evaluate(() => { const t = state.cb.data.tickets; const all = [...t.active, ...t.recent, ...t.closed]; return all.length ? all[0].id : null; });
  await page.evaluate(async (id) => { await openTicketDrawer(id, findCbTicket(id)); }, id); await page.waitForTimeout(600);
  return { app: await page.evaluate(() => document.body.innerHTML), text: await page.evaluate(() => document.body.innerText) };
});
await rec('callback-empty', async () => { await page.evaluate(() => { state.drawer = null; if (typeof paintDrawer === 'function') paintDrawer(); }); await page.evaluate(async () => { await pickCallbackSite('9003'); }); await page.waitForTimeout(500); return full(); });
await rec('tonight', async () => { await page.evaluate(async () => { go('tonight'); }); await page.waitForSelector('[data-testid="tonight-table"], [data-testid="tonight-empty"]', { timeout: 10000 }); return full(); });
await rec('tonight-query', async () => { await page.evaluate(() => raiseQuery()); await page.waitForTimeout(250); const r = await full(); await page.evaluate(() => closeModal()); return r; });
// control window states (thermostat 6832)
await confirm(page, '6832');
async function ctlState(mode, action, hold) {
  await page.evaluate(({ mode, action, hold }) => {
    const d = state.workspace.devices.find(x => x.deviceId === 'IT500-BAR-6832');
    state.flow = { cat: 'heating', stage: 3, data: { freeText: 'The bar is freezing', area: 'Bar/Restaurant', additionalNotes: '' }, done: [] };
    window.ctl = null; closeModal();
    window.ctl = { device: d, mode, phase: action ? 'tracker' : 'compose', error: null, action, val: mode === 'frost' ? 5 : 21, hold: hold || (mode === 'frost' ? '07:00' : 'none') };
    drawControl();
  }, { mode, action, hold });
  await page.waitForTimeout(150);
  return { modal: await modalH(), modalText: await modalT(), app: await app(), text: await bodyText() };
}
const CT = { 'CTL-compose-up': ['up', null, 'none'], 'CTL-compose-up-hold': ['up', null, '07:00'], 'CTL-compose-frost': ['frost', null, '07:00'],
  'CTL-inflight': ['up', { state: 'in-flight', status: 'accepted' }, 'none'],
  'CTL-slow': ['up', { state: 'in-flight', status: 'pending', slowEchoDevice: true, copyMinutes: 4 }, 'none'],
  'CTL-confirmed': ['up', { state: 'confirmed', actionType: 'setpoint-up' }, '07:00'],
  'CTL-confirmed-late': ['up', { state: 'confirmed', confirmedLate: true, actionType: 'setpoint-up' }, 'none'],
  'CTL-already': ['up', { state: 'already-set', actionType: 'setpoint-up' }, '07:00'],
  'CTL-nondelivery': ['up', { state: 'non-delivery', operatorError: 'The thermostat rejected the change.' }, 'none'],
  'CTL-indeterminate': ['up', { state: 'indeterminate' }, 'none'] };
for (const [id, a] of Object.entries(CT)) await rec(id, () => ctlState(...a));
async function ctlOutcome(fnName, mode, action, hold, failPost) {
  await ctlState(mode, action, hold);
  if (failPost) await page.route('**/api/outcomes', r => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Zendesk is unreachable' }) }));
  await page.evaluate((fn) => { window[fn](); }, fnName);
  await page.waitForFunction(() => state.flow && state.flow.stage === 99, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  if (failPost) await page.unroute('**/api/outcomes');
  return { app: await app(), text: await bodyText(), modal: await modalH(), modalText: await modalT() };
}
await rec('CTL-finish-up', () => ctlOutcome('ctlFinish', 'up', { state: 'confirmed', actionType: 'setpoint-up' }, '4h'));
await rec('CTL-finish-frost', () => ctlOutcome('ctlFinish', 'frost', { state: 'confirmed', actionType: 'heating-off-frost' }, '4h'));
await rec('CTL-finish-fail', () => ctlOutcome('ctlFinish', 'up', { state: 'confirmed', actionType: 'setpoint-up' }, 'none', true));
await rec('CTL-release-ok', () => ctlOutcome('ctlRelease', 'up', { state: 'in-flight', slowEchoDevice: true, copyMinutes: 4 }, 'none'));
await rec('CTL-release-fail', () => ctlOutcome('ctlRelease', 'up', { state: 'in-flight', slowEchoDevice: true, copyMinutes: 4 }, 'none', true));
await rec('CTL-escalate-indet', () => ctlOutcome('ctlEscalate', 'up', { state: 'indeterminate' }, 'none'));
await rec('CTL-escalate-nondel', () => ctlOutcome('ctlEscalate', 'up', { state: 'non-delivery', operatorError: 'The thermostat rejected the change.' }, 'none'));
await page.evaluate(() => { window.ctl = null; closeModal(); state.flow = null; render(); });
await confirm(page, '6961');
await rec('CTL-compose-switch', async () => {
  await page.evaluate(() => { const d = state.workspace.devices.find(x => x.kind === 'lighting'); window.ctl = null; window.ctl = { device: d, mode: 'switchon', phase: 'compose', error: null, action: null, val: true, hold: 'none' }; drawControl(); });
  return { modal: await modalH(), modalText: await modalT(), app: await app(), text: await bodyText() };
});
await rec('CTL-finish-switch', async () => {
  await page.evaluate(() => { const d = state.workspace.devices.find(x => x.kind === 'lighting'); state.flow = { cat: 'lighting', stage: 1, data: { freeText: '', additionalNotes: '' }, done: [] }; window.ctl = { device: d, mode: 'switchon', phase: 'tracker', error: null, action: { state: 'confirmed', actionType: 'switch' }, val: true, hold: 'none' }; ctlFinish(); });
  await page.waitForFunction(() => state.flow && state.flow.stage === 99, null, { timeout: 10000 }); await page.waitForTimeout(300);
  return { app: await app(), text: await bodyText(), modal: await modalH(), modalText: await modalT() };
});
writeFileSync(OUT, JSON.stringify(R));
console.log('\nwrote', Object.keys(R).length);
await browser.close();
