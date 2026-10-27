// OOHDASH-146 screen-text dump: drives the REAL app (fixture mode, :3093) into every flow state and
// records the flow panel / modal / view innerText. Injected states are flagged in `note`.
import { newPage, confirm } from './lib.mjs';
import { writeFileSync } from 'fs';
const OUT = process.argv[2] || 'current.json';
const { browser, page } = await newPage();
const results = {};
let curSite = null;
async function site(s) { if (curSite !== s) { await confirm(page, s); curSite = s; } }
async function flow(cat, data, stage = 0, freeText = 'The kitchen is dead') {
  await page.evaluate(({ cat, data, stage, freeText }) => {
    window.ctl = null; closeModal();
    state.flow = { cat, stage, data: Object.assign({ freeText, _flowKey: cat, additionalNotes: '' }, data), done: [] };
    render();
  }, { cat, data, stage, freeText });
  await page.waitForTimeout(120);
}
async function panel() { return (await page.locator('[data-testid="flow-panel"]').innerText()).trim(); }
async function modal() { return (await page.locator('#modalroot').innerText()).trim(); }
async function view() { return (await page.locator('#view').innerText()).trim(); }
async function record(id, how, note) {
  try { results[id] = { text: await how(), note: note || '' }; }
  catch (e) { results[id] = { text: 'DUMP FAILED: ' + e.message.split('\n')[0], note: note || '' }; }
  process.stdout.write(id + ' ');
}
async function submitOutcome() {
  const btn = page.locator('[data-testid="record-outcome"]');
  if (await btn.count()) { await btn.click(); await page.waitForFunction(() => state.flow && state.flow.stage === 99, null, { timeout: 10000 }); }
  return panel();
}
async function inject(fn, arg) { await page.evaluate(fn, arg); }
const AFTER = '\n----AFTER RECORD----\n';
const NOTE_INJ = 'reached with injected workspace data (no fixture site has this hot water state)';

// ---------------- HOT WATER ----------------
await site('6832');
const DHW = {
  auto: { mode: 'auto' },
  'auto-ended': { mode: 'on-until', untilMs: -30 * 60000 },
  'on-until': { mode: 'on-until', untilMs: 90 * 60000 },
  'off-until': { mode: 'off-until', untilMs: 120 * 60000 },
  'on-v1': { mode: 'on-v1', confirmedAt: -5 * 60000 },
  'off-v1': { mode: 'off-v1', confirmedAt: -5 * 60000 },
  'cc-stale': { mode: 'auto', lastSeen: -3 * 3600000 },
  'cc-notreconf': { mode: 'on-v1', confirmedAt: -50 * 60000 },
  'cc-decode': { mode: 'cant-confirm', unreadableReason: 'decode-error' }
};
const noDhw = () => inject(() => { state.workspace.boilerControl = { dhwOverride: { visible: false } }; });
await record('HW-0', async () => { await noDhw(); await flow('hotwater', {}, 0, 'No hot water in the kitchen'); return panel(); });
for (const [k, v] of Object.entries(DHW)) {
  await record('HW-0-dhw-' + k, async () => {
    await inject((v) => {
      const now = Date.now();
      state.workspace.boilerControl = { dhwOverride: { visible: true, mode: v.mode, panelLastSeenMs: now + (v.lastSeen || -60000),
        untilMs: v.untilMs != null ? now + v.untilMs : null, confirmedAtMs: v.confirmedAt != null ? now + v.confirmedAt : null, unreadableReason: v.unreadableReason || null } };
    }, v);
    await flow('hotwater', {}, 0, 'No hot water in the kitchen'); return panel();
  }, NOTE_INJ);
}
await record('HW-cap', async () => { await noDhw(); await flow('hotwater', { cap: 1 }, 1, 'No hot water in the kitchen'); return (await panel()) + AFTER + await submitOutcome(); });
await record('HW-sc', async () => { await flow('hotwater', { sc: 1 }, 1, 'No hot water in the kitchen'); return (await panel()) + AFTER + await submitOutcome(); });
await site('6360');
await record('HW-0-nlh', async () => { await flow('hotwater', {}, 0, 'No hot water in the kitchen'); return panel(); });
await record('HW-nlh', async () => { await flow('hotwater', { nlh: 1 }, 1, 'No hot water in the kitchen'); return (await panel()) + AFTER + await submitOutcome(); });

// ---------------- KITCHEN ----------------
await site('6832');
await record('K-legacy-0', async () => { await flow('kitchen', {}); return panel(); });
await record('K-crit', async () => { await flow('kitchen', { crit: 1 }, 1); return (await panel()) + AFTER + await submitOutcome(); });
await record('K-ncrit', async () => { await flow('kitchen', { crit: 0 }, 1); return (await panel()) + AFTER + await submitOutcome(); });
await site('8888');
await record('K-picker', async () => { await flow('kitchen', {}); return panel(); });
const KV = { A: 'gk-8888-fryer-1', B: 'gk-8888-glasswasher-1', D: 'gk-8888-dishwasher-1', E: 'gk-8888-potwash-1', C: 'gk-8888-bainmarie-1' };
for (const [v, id] of Object.entries(KV)) {
  await record('K-v' + v, async () => { await flow('kitchen', { _liveKs: Object.values(KV), _selectedCircuit: id }, 1); return panel(); });
}
for (const v of ['B-unscheduled', 'B-outside', 'off-unknown', 'fallback']) {
  await record('K-v' + v, async () => {
    await inject((v) => { const d = state.workspace.devices.find(x => x.deviceId === 'gk-8888-glasswasher-1'); d._origV = d._origV || d.tuya.verdict; d.tuya.verdict = v; }, v);
    await flow('kitchen', { _liveKs: Object.values(KV), _selectedCircuit: 'gk-8888-glasswasher-1' }, 1);
    const t = await panel();
    await inject(() => { const d = state.workspace.devices.find(x => x.deviceId === 'gk-8888-glasswasher-1'); d.tuya.verdict = d._origV; });
    return t;
  }, 'verdict injected on the glass washer circuit (fixture site 8888 has no circuit in this state)');
}
await record('K-all', async () => { await flow('kitchen', { _liveKs: Object.values(KV), _selectedCircuit: '__all__' }, 1); return panel(); });
for (const ko of ['override-ok', 'fuse-fixed', 'repairs']) {
  await record('K-' + ko, async () => { await flow('kitchen', { _liveKs: Object.values(KV), _selectedCircuit: ko === 'fuse-fixed' ? KV.D : ko === 'repairs' ? KV.B : KV.A, _kitchenOutcome: ko }, 2); return (await panel()) + AFTER + await submitOutcome(); });
}
for (const ko of ['override-fail', 'fuse-fail', 'still-ours']) {
  await record('K-' + ko, async () => { await flow('kitchen', { _liveKs: Object.values(KV), _selectedCircuit: KV.A, _kitchenOutcome: ko }, 2); return panel(); });
}

// ---------------- LIGHTING ----------------
await site('6749');
await record('L-0-online', async () => { await flow('lighting', {}, 0, 'Car park lights are off'); return panel(); });
await record('L-ok', async () => { await flow('lighting', { r: 'ok' }, 1, 'Car park lights are off'); return (await panel()) + AFTER + await submitOutcome(); });
await record('L-p1', async () => { await flow('lighting', { r: 'cap' }, 1, 'Car park lights are off'); return (await panel()) + AFTER + await submitOutcome(); });
await site('6360');
await record('L-0-offline', async () => { await flow('lighting', {}, 0, 'Car park lights are off'); return panel(); });
await site('6961');
await record('L-0-switch', async () => { await flow('lighting', {}, 0, 'Car park lights are off'); return panel(); });

// ---------------- FAN ----------------
await site('6851');
await record('FAN-0', async () => { await flow('fan', {}, 0, 'Need the fans on late'); return panel(); });
await record('FAN-0-switch', async () => {
  await inject(() => { const d = state.workspace.devices.find(x => x.kind === 'fan'); d._oc = d.capabilities; d.capabilities = ['switch']; d.registered = true; d.telemetry = Object.assign({}, d.telemetry, { switch_1: true }); });
  await flow('fan', {}, 0, 'Need the fans on late'); const t = await panel();
  await inject(() => { const d = state.workspace.devices.find(x => x.kind === 'fan'); d.capabilities = d._oc; });
  return t;
}, 'switch capability injected on the fan (no fixture fan is switchable)');
await record('FAN-cap', async () => { await flow('fan', { note: 'Fans on until 1am for a deep clean' }, 1, 'Need the fans on late'); return (await panel()) + AFTER + await submitOutcome(); });

// ---------------- FRIDGE ----------------
await record('FR-0', async () => { await flow('fridge', {}, 0, 'Freezer alarm going off'); return panel(); });
await record('FR-risk', async () => { await flow('fridge', { risk: 1 }, 1, 'Freezer alarm going off'); return (await panel()) + AFTER + await submitOutcome(); });
await record('FR-q', async () => { await flow('fridge', { risk: 0 }, 1, 'Freezer alarm going off'); return (await panel()) + AFTER + await submitOutcome(); });

// ---------------- CONNECTIVITY ----------------
await site('7004');
await record('CN-allonline', async () => { await flow('connectivity', {}, 0, 'Nothing is working'); return panel(); });
await site('6832');
await record('CN-cap', async () => { await flow('connectivity', { ofq: 'cap', _cline: 1 }, 0, 'Nothing is working'); return (await panel()) + AFTER + await submitOutcome(); });
await site('5198');
await record('CN-gwless', async () => { await flow('connectivity', { from: 'heating' }, 0, 'Rooms are cold'); return panel(); });
await record('CN-dcap', async () => { await flow('connectivity', { ofq: 'dcap', _cline: 1, from: 'heating' }, 0, 'Rooms are cold'); return (await panel()) + AFTER + await submitOutcome(); });
await site('6771');
await record('CN-anchoroff', async () => { await flow('connectivity', {}, 0, 'Nothing is working'); return panel(); });
await record('CN-back', async () => { await flow('connectivity', { ofq: 'back', _cline: 1 }, 0, 'Nothing is working'); return (await panel()) + AFTER + await submitOutcome(); });
await site('6772');
await record('CN-group1', async () => { await flow('connectivity', {}, 0, 'Boiler not working'); return panel(); });
await record('CN-gcap', async () => { await flow('connectivity', { ofq: 'gcap', _cline: 1 }, 0, 'Boiler not working'); return (await panel()) + AFTER + await submitOutcome(); });
await site('6773');
await record('CN-group2', async () => { await flow('connectivity', {}, 0, 'Boiler not working'); return panel(); });

// ---------------- CONTRACTOR ----------------
await site('6832');
await record('CT-0', async () => { await flow('contractor', {}, 0, ''); return panel(); });
const CN = { cn: 'Dan Price, Northern Refrigeration', cw: 'Needs the fryers on to test the gas interlock' };
await record('CT-1', async () => { await flow('contractor', CN, 1, ''); return panel(); });
await record('CT-p1', async () => { await flow('contractor', Object.assign({ ppguidance: 'no' }, CN), 2, ''); return (await panel()) + AFTER + await submitOutcome(); });
await record('CT-pp-type', async () => { await flow('contractor', Object.assign({ ppguidance: 'yes' }, CN), 2, ''); return panel(); });
await record('CT-pp-instr', async () => { await flow('contractor', Object.assign({ ppguidance: 'yes', pptype: 'tongou' }, CN), 3, ''); return panel(); });
await record('CT-ppdone', async () => { await flow('contractor', Object.assign({ ppguidance: 'yes', pptype: 'tongou', ppdone: 1 }, CN), 4, ''); return (await panel()) + AFTER + await submitOutcome(); });
await inject(() => { state.workspace.site._origNo = state.workspace.site.siteNo; state.workspace.site.siteNo = '6786'; });
await record('CT-dd', async () => { await flow('contractor', Object.assign({ ppguidance: 'yes' }, CN), 2, ''); return panel(); }, 'site number injected as 6786 (Donkey Derby is not a fixture site)');
await record('CT-ddesc', async () => { await flow('contractor', Object.assign({ ppguidance: 'yes', ppesc: 1 }, CN), 3, ''); return panel(); }, 'site number injected as 6786; confirm step only, not posted');
await inject(() => { state.workspace.site.siteNo = state.workspace.site._origNo; });

// ---------------- OTHER + AIRCON ----------------
await record('O-0', async () => { await flow('other', {}, 0, ''); return panel(); });
await record('O-1', async () => { await flow('other', { q: 'The voltage optimiser is beeping', path: 'check' }, 1, ''); return panel(); });
await record('O-choice', async () => { await flow('other', { q: 'Cellar cooler alarm going off', qraw: 'Cellar cooler alarm going off', path: 'cap' }, 1, ''); return panel(); });
await record('O-normal', async () => { await flow('other', { q: 'Cellar cooler alarm going off', qraw: 'Cellar cooler alarm going off', path: 'normal' }, 2, ''); return (await panel()) + AFTER + await submitOutcome(); });
await record('O-p1', async () => { await flow('other', { q: 'Smoke smell from the plant room', qraw: 'Smoke smell from the plant room', path: 'p1', p1reason: 'Smoke smell from the plant room' }, 2, ''); return (await panel()) + AFTER + await submitOutcome(); });
await record('O-ctl', async () => { await flow('other', { q: 'Fryers off', path: 'check', g: 'kitchen' }, 2, ''); return panel(); });
await record('O-mon', async () => { await flow('other', { q: 'Bar is cold', path: 'check', g: 'heating' }, 2, ''); return (await panel()) + AFTER + await submitOutcome(); });
await record('O-none', async () => { await flow('other', { q: 'Car park lights out', path: 'check', g: 'lighting' }, 2, ''); return (await panel()) + AFTER + await submitOutcome(); });
await site('6218');
await record('AC', async () => { await flow('aircon', {}, 0, 'Aircon in the function room is blowing warm'); return (await panel()) + AFTER + await submitOutcome(); });

// ---------------- SALUS HEATING ----------------
await site('6832');
await record('S-0', async () => { await flow('heating', {}, 0, 'The bar is freezing'); return panel(); });
await record('S-1', async () => { await flow('heating', { area: 'Bar/Restaurant' }, 1, 'The bar is freezing'); return panel(); });
const setT = (t, sp) => inject(([t, sp]) => { const d = state.workspace.devices.find(x => x.deviceId === 'IT500-BAR-6832'); d._o = d._o || Object.assign({}, d.telemetry); d.telemetry.localTemperature = t; d.telemetry.heatingSetpoint = sp; }, [t, sp]);
const resetT = () => inject(() => { const d = state.workspace.devices.find(x => x.deviceId === 'IT500-BAR-6832'); if (d._o) d.telemetry = Object.assign({}, d._o); });
await record('S-warm-buildheat', async () => { await setT(16, 20); await flow('heating', { area: 'Bar/Restaurant', need: 'warm' }, 2, 'The bar is freezing'); const t = await panel(); await resetT(); return t; }, 'room temperature injected (16°C against 20°C)');
await record('S-off-frost', async () => { await flow('heating', { area: 'Bar/Restaurant', need: 'off' }, 2, 'Too hot in the bar'); return panel(); });
await record('S-broken-keepingup', async () => { await setT(19.5, 20); await flow('heating', { area: 'Bar/Restaurant', need: 'broken' }, 2, 'Heating not working'); const t = await panel(); await resetT(); return t; }, 'room temperature injected (19.5°C against 20°C)');
await record('S-broken-under', async () => { await setT(17, 20); await flow('heating', { area: 'Bar/Restaurant', need: 'broken' }, 2, 'Heating not working'); const t = await panel(); await resetT(); return t; }, 'room temperature injected (17°C against 20°C)');
await record('S-offnoact', async () => { await flow('heating', { area: 'Bar/Restaurant', need: 'off', offnoact: 1 }, 3, 'Too hot in the bar'); return (await panel()) + AFTER + await submitOutcome(); });
await record('S-buildheat', async () => { await setT(16, 20); await flow('heating', { area: 'Bar/Restaurant', need: 'warm', buildheat: 1 }, 3, 'The bar is freezing'); const t = (await panel()) + AFTER + await submitOutcome(); await resetT(); return t; }, 'room temperature injected (16°C against 20°C)');
await site('7001');
await record('S-dark1', async () => { await flow('heating', { area: 'Accommodation' }, 1, 'Rooms are cold'); return panel(); });
await record('S-darkcap', async () => { await flow('heating', { area: 'Accommodation', need: 'darkcap' }, 2, 'Rooms are cold'); return (await panel()) + AFTER + await submitOutcome(); });
await record('S-darknoact', async () => { await flow('heating', { area: 'Accommodation', need: 'darknoact' }, 2, 'Rooms are cold'); return (await panel()) + AFTER + await submitOutcome(); });
await site('7003');
await record('S-darkmulti', async () => { await flow('heating', { area: 'Bar/Restaurant' }, 1, 'Bar is cold'); return panel(); });

// ---------------- CONTROL MODAL ----------------
await site('6832');
async function ctlState(mode, action, hold) {
  await page.evaluate(({ mode, action, hold }) => {
    const d = state.workspace.devices.find(x => x.deviceId === 'IT500-BAR-6832');
    state.flow = { cat: 'heating', stage: 3, data: { freeText: 'The bar is freezing', area: 'Bar/Restaurant', additionalNotes: '' }, done: [] };
    window.ctl = null; closeModal();
    window.ctl = { device: d, mode, phase: action ? 'tracker' : 'compose', error: null, action: action, val: mode === 'frost' ? 5 : 21, hold: hold || (mode === 'frost' ? '07:00' : 'none') };
    drawControl();
  }, { mode, action, hold });
  await page.waitForTimeout(100);
  return modal();
}
await record('CTL-compose-up', () => ctlState('up', null, 'none'));
await record('CTL-compose-up-hold', () => ctlState('up', null, '07:00'));
await record('CTL-compose-frost', () => ctlState('frost', null, '07:00'));
await record('CTL-inflight', () => ctlState('up', { state: 'in-flight', status: 'accepted' }, 'none'));
await record('CTL-slow', () => ctlState('up', { state: 'in-flight', status: 'pending', slowEchoDevice: true, copyMinutes: 4 }, 'none'));
await record('CTL-confirmed', () => ctlState('up', { state: 'confirmed', actionType: 'setpoint-up' }, '07:00'));
await record('CTL-confirmed-late', () => ctlState('up', { state: 'confirmed', confirmedLate: true, actionType: 'setpoint-up' }, 'none'));
await record('CTL-already', () => ctlState('up', { state: 'already-set', actionType: 'setpoint-up' }, '07:00'));
await record('CTL-nondelivery', () => ctlState('up', { state: 'non-delivery', operatorError: 'The thermostat rejected the change.' }, 'none'));
await record('CTL-indeterminate', () => ctlState('up', { state: 'indeterminate' }, 'none'));
async function ctlOutcome(fnName, mode, action, hold, failPost) {
  await ctlState(mode, action, hold);
  if (failPost) await page.route('**/api/outcomes', r => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Zendesk is unreachable' }) }));
  await page.evaluate((fn) => { window[fn](); }, fnName);
  await page.waitForFunction(() => state.flow && state.flow.stage === 99, null, { timeout: 10000 });
  if (failPost) await page.unroute('**/api/outcomes');
  return panel();
}
await record('CTL-finish-up', () => ctlOutcome('ctlFinish', 'up', { state: 'confirmed', actionType: 'setpoint-up' }, '4h'), 'hold "For 4 hours" chosen, to show the "until the morning schedule" mismatch');
await record('CTL-finish-frost', () => ctlOutcome('ctlFinish', 'frost', { state: 'confirmed', actionType: 'heating-off-frost' }, '4h'), 'hold "For 4 hours" chosen');
await record('CTL-finish-fail', () => ctlOutcome('ctlFinish', 'up', { state: 'confirmed', actionType: 'setpoint-up' }, 'none', true), 'ticket call failed on purpose (route intercept)');
await record('CTL-release-ok', () => ctlOutcome('ctlRelease', 'up', { state: 'in-flight', slowEchoDevice: true, copyMinutes: 4 }, 'none'));
await record('CTL-release-fail', () => ctlOutcome('ctlRelease', 'up', { state: 'in-flight', slowEchoDevice: true, copyMinutes: 4 }, 'none', true), 'ticket call failed on purpose (route intercept): shows the false "I\'ve logged it"');
await record('CTL-escalate-indet', () => ctlOutcome('ctlEscalate', 'up', { state: 'indeterminate' }, 'none'));
await record('CTL-escalate-nondel', () => ctlOutcome('ctlEscalate', 'up', { state: 'non-delivery', operatorError: 'The thermostat rejected the change.' }, 'none'));
await page.evaluate(() => { window.ctl = null; closeModal(); state.flow = null; render(); });
await site('6961');
await record('CTL-compose-switch', async () => {
  await page.evaluate(() => { const d = state.workspace.devices.find(x => x.kind === 'lighting'); window.ctl = null; window.ctl = { device: d, mode: 'switchon', phase: 'compose', error: null, action: null, val: true, hold: 'none' }; drawControl(); });
  return modal();
});
await record('CTL-finish-switch', async () => {
  await page.evaluate(() => { const d = state.workspace.devices.find(x => x.kind === 'lighting'); state.flow = { cat: 'lighting', stage: 1, data: { freeText: '', additionalNotes: '' }, done: [] }; window.ctl = { device: d, mode: 'switchon', phase: 'tracker', error: null, action: { state: 'confirmed', actionType: 'switch' }, val: true, hold: 'none' }; ctlFinish(); });
  await page.waitForFunction(() => state.flow && state.flow.stage === 99, null, { timeout: 10000 });
  return panel();
});
await page.evaluate(() => { window.ctl = null; closeModal(); state.flow = null; render(); });

// ---------------- SITE / SEARCH / CALLBACK / TONIGHT ----------------
await record('SITE-confirm', async () => { await page.evaluate(() => go('home')); await page.evaluate(async () => { await openSite('6832'); }); await page.waitForSelector('[data-testid="confirm-gate"]'); return view(); });
curSite = null;
await record('SITE-ambiguous', async () => { await page.evaluate(async () => { await openSite('6758'); }); await page.waitForSelector('[data-testid="ambiguous-card"]'); return view(); });
await page.evaluate(() => { state.ambiguous = null; state.siteNo = null; go('home'); render(); });
await record('SEARCH-none', async () => { await page.locator('[data-testid="site-search"]').fill('Zzyzx Arms'); await page.waitForTimeout(900); return view(); });
await record('CB-list', async () => { await page.evaluate(() => go('callback')); await page.evaluate(async () => { await pickCallbackSite('6832'); }); await page.waitForTimeout(400); return view(); });
await record('CB-drawer', async () => {
  const id = await page.evaluate(() => { const t = state.cb.data.tickets; const all = [...t.active, ...t.recent, ...t.closed]; return all.length ? all[0].id : null; });
  if (!id) return 'no tickets';
  await page.evaluate(async (id) => { await openTicketDrawer(id, findCbTicket(id)); }, id);
  await page.waitForTimeout(500);
  return (await page.locator('body').innerText()).split('Ticket #').slice(1).join('Ticket #').trim();
});
await record('CB-empty', async () => { await page.evaluate(() => { state.drawer = null; if (typeof paintDrawer === 'function') paintDrawer(); }); await page.evaluate(async () => { await pickCallbackSite('9003'); }); await page.waitForTimeout(400); return view(); });
await record('TONIGHT', async () => { await page.evaluate(async () => { go('tonight'); }); await page.waitForSelector('[data-testid="tonight-table"], [data-testid="tonight-empty"]', { timeout: 10000 }); return view(); });
await record('TONIGHT-query', async () => { await page.evaluate(() => raiseQuery()); await page.waitForTimeout(200); const t = await modal(); const ph = await page.locator('[data-testid="query-text"]').getAttribute('placeholder'); await page.evaluate(() => closeModal()); return t + '\n[placeholder] ' + ph; });

writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log('\nDONE', Object.keys(results).length);
await browser.close();
