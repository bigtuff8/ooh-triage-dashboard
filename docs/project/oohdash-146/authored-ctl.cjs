// R7: the device control window in the live window markup (views.json capture) with the 146 plain wording from the rev 2 rows.
const B = require('./build-proto.cjs');
const { NODES, add, H, dyn, W, EX, PK, liveNode, retarget } = B;
const OLD = require('./proposed-wording.cjs');
const row = id => OLD.STATES.find(s => s.id === id);
const esc = H.esc;
const T = s => String(s == null ? '' : s).replace(/[’]/g, "'").replace(/the manual control button/g, 'the manual override').replace(/manual control button/g, 'manual override').replace(/\bcaller\b/g, 'customer');

const modalShell = (title, inner, footer, proto) => '<div class="overlay"><div class="modal"><div class="mh">' + esc(title) + '<button class="btn link" data-to="@back">✕</button></div><div class="mb">' + inner + '</div>' + (footer ? '<div class="mf">' + footer + '</div>' : '') + (proto ? '<div class="protohint">Prototype only: what happens next. ' + proto + '</div>' : '') + '</div></div>';
const target = (tech) => '<div class="target" data-testid="control-target"><div class="target-identity"><div class="target-name">The Wheatsheaf</div><div class="target-tech"><span class="mono">7412</span> → ' + tech + '</div></div></div>';

function compose(id, o) {
  const holds = [['Until its next timetable change (default)', 'none', 'CTL:' + o.same], ['Until 07:00 tomorrow', '07:00', 'CTL:' + o.hold], ['For 4 hours', '4h', 'CTL:' + o.same]];
  const chips = '<div class="stepq" style="font-size:13.5px">How long should this last?</div><div class="chips">' + holds.map(h => '<button class="chip' + (o.sel === h[1] ? ' sel' : '') + '" data-to="' + h[2] + '">' + h[0] + '</button>').join('') + '</div>';
  const inner = target(o.tech) +
    (o.stepper ? '<div class="stepper"><button>−</button><span class="val">' + o.big + '</span><button>+</button></div>' : '<div style="text-align:center;margin:10px 0"><span class="val" style="font-size:30px;font-weight:700">' + o.big + '</span></div>') +
    '<p class="guard">' + esc(o.guard) + '</p>' + (o.noHold ? '' : chips) + '<p class="small" style="margin-top:8px">' + esc(o.small) + '</p>' +
    '<div class="warnbox"><b>Before you press:</b> ' + o.warn + '</div>';
  add({ id, g: 'CTL', t: o.t, rootKey: o.root, modalHtml: modalShell(o.title, inner, '<button class="btn" data-to="@back">Cancel</button><button class="btn primary" data-testid="control-send" data-to="' + o.send + '">Send</button>'), deltas: ['R7'],
    flowHtml: o.flow, authored: true, edges: [] });
}
const heatFlow = (root) => H.flowShell('🌡️', 'Heating', H.known([W('The bar is freezing'), ['c', 'Area: <b>Bar/Restaurant</b>'], ['c', 'The customer wants it warmer']]) + '<div class="alert info">Complete the control action in the window…</div>', false);
const lightFlow = H.flowShell('💡', 'External lighting', H.known([W('Car park lights are off')]) + '<div class="alert info">Complete the control action in the window…</div>', false);
const base = { root: 'S6832-cold', flow: heatFlow(), tech: 'Bar area', stepper: true, noHold: false };
compose('CTL:compose-up', Object.assign({}, base, { t: 'Make it warmer (no set time)', title: 'Make it warmer', big: '21°C', guard: 'Target temperature now 18°C. You can set 15–21°C (up to 3°C either way, never above 25°C).', sel: 'none', same: 'compose-up', hold: 'compose-up-hold',
  small: 'Without a set time, the thermostat goes back to its own timetable at its next change. In the evening that can be soon, so a set time is usually better.', warn: 'this switches the <span class="dyn">Bar area</span> heating to <span class="dyn">21°C</span> at the site straight away.', send: 'CTL:slow' }));
compose('CTL:compose-up-hold', Object.assign({}, base, { t: 'Make it warmer (until 07:00)', title: 'Make it warmer', big: '21°C', guard: 'Target temperature now 18°C. You can set 15–21°C (up to 3°C either way, never above 25°C).', sel: '07:00', same: 'compose-up', hold: 'compose-up-hold',
  small: 'At Wed 07:00 it goes back to 18°C by itself. This still happens if the dashboard restarts.', warn: 'this switches the <span class="dyn">Bar area</span> heating to <span class="dyn">21°C</span> at the site straight away.', send: 'CTL:inflight' }));
compose('CTL:compose-down', Object.assign({}, base, { t: 'Make it cooler', title: 'Make it cooler', big: '15°C', guard: 'Target temperature now 18°C. You can set 15–21°C (up to 3°C either way, never above 25°C).', sel: '07:00', same: 'compose-down', hold: 'compose-down',
  small: 'At Wed 07:00 it goes back to 18°C by itself. This still happens if the dashboard restarts.', warn: 'this switches the <span class="dyn">Bar area</span> heating to <span class="dyn">15°C</span> at the site straight away.', send: 'CTL:inflight', flow: heatFlow().replace('wants it warmer', 'wants it cooler') }));
compose('CTL:compose-frost', Object.assign({}, base, { t: 'Turn heating off (down to 5°C)', title: 'Turn heating off', big: 'Heating off (5°C)', stepper: false, guard: 'The heating stays off unless the building gets close to freezing.', sel: '07:00', same: 'compose-frost', hold: 'compose-frost',
  small: 'At Wed 07:00 it goes back to 18°C by itself. This still happens if the dashboard restarts.', warn: 'this turns the <span class="dyn">Bar area</span> heating down to <span class="dyn">5°C</span> at the site straight away.', send: 'CTL:finish-frost', flow: heatFlow().replace('wants it warmer', 'wants it off') }));
compose('CTL:compose-switch', { t: 'Turn a lighting circuit on', root: 'L6961', flow: lightFlow, tech: 'Car park lights', stepper: false, noHold: true, title: 'Turn on', big: 'Turn on', guard: 'This turns the car park lights circuit on. We only show it as done when the switch confirms it.', small: '', warn: 'this turns the <span class="dyn">car park lights</span> on at the site straight away.', send: 'CTL:finish-switch', same: '', hold: '' });

// tracker modals
const stepsHtml = (a, b, c) => '<div class="syncsteps"><div class="ss ' + a[1] + '">' + a[0] + '</div><div class="ss ' + b[1] + '">' + b[0] + '</div><div class="ss ' + c[1] + '">' + c[0] + '</div></div>';
function tracker(id, o) {
  const inner = '<div class="target"><span class="target-name"><b>The Wheatsheaf</b></span> <span class="mono">7412</span> → Bar area · 21°C</div>' + stepsHtml(o.a, o.b, o.c) + '<div class="alert ' + o.cls + '" aria-live="polite">' + o.text + '</div>';
  add({ id, g: 'CTL', t: o.t, rootKey: 'S6832-cold', flowHtml: heatFlow(), modalHtml: modalShell(o.title || 'Make it warmer', inner, o.footer || '', o.proto || ''), deltas: ['R7'], authored: true, edges: [] });
}
const go = (label, to, cls) => H.btn(label, to, cls || '');
tracker('CTL:inflight', { t: 'Waiting for the thermostat', a: ['1. Sent', 'ok'], b: ['2. Accepted', 'ok'], c: ['3. Waiting for the thermostat…', 'on'], cls: 'info', text: 'Accepted. Waiting for the thermostat to show the change in its own reading. We only say "done" when it does.',
  proto: go('It confirms', 'CTL:confirmed') + go('It is slow', 'CTL:slow') + go('It rejects it', 'CTL:nondelivery') + go('No answer', 'CTL:indeterminate') });
tracker('CTL:slow', { t: 'Slow thermostat: carry on', a: ['1. Sent', 'ok'], b: ['2. Accepted', 'ok'], c: ['3. Waiting for the thermostat…', 'on'], cls: 'info', text: 'Sent to the thermostat. It should take effect within about 4 minutes. You can carry on with the customer; we\'ll keep watching and update the ticket when the thermostat confirms.', footer: go('Done, carry on', 'CTL:release-ok', 'primary') });
tracker('CTL:confirmed', { t: 'Confirmed (with a set time)', a: ['1. Sent', 'ok'], b: ['2. Accepted', 'ok'], c: ['✅ Confirmed', 'ok'], cls: 'ok', text: '✅ <b>Done: the thermostat now reads 21°C.</b> We only show this when the thermostat itself confirms it. It goes back to normal at Wed 07:00.', footer: go('Done', 'CTL:finish-up', 'primary') });
tracker('CTL:confirmed-late', { t: 'Confirmed late', a: ['1. Sent', 'ok'], b: ['2. Accepted', 'ok'], c: ['✅ Confirmed', 'ok'], cls: 'ok', text: '✅ <b>Done: the thermostat now reads 21°C (confirmed late).</b> This came in after we told you it wasn\'t confirmed, so tell the customer it\'s now done.', footer: go('Done', 'CTL:finish-up', 'primary') });
tracker('CTL:already', { t: 'Already at that value', a: ['1. Sent', 'ok'], b: ['2. Accepted', 'ok'], c: ['✅ Confirmed', 'ok'], cls: 'ok', text: '✅ <b>Already at 21°C.</b> The thermostat already reads this, so nothing needed changing. It goes back to normal at Wed 07:00.', footer: go('Done', 'CTL:finish-up', 'primary') });
tracker('CTL:nondelivery', { t: 'Not delivered', a: ['1. Sent', 'ok'], b: ['2. Accepted', 'ok'], c: ['✕ Not delivered', 'bad'], cls: 'err', text: '❌ <b>Not delivered.</b> The thermostat rejected the change. Nothing has changed on site, so don\'t tell the customer it\'s done.', footer: go('Log it for the IoT helpdesk', 'CTL:escalate-nondel', 'primary') });
tracker('CTL:indeterminate', { t: 'Not confirmed yet', a: ['1. Sent', 'ok'], b: ['2. Accepted', 'ok'], c: ['⚠ Not confirmed', 'bad'], cls: 'warn', text: '⚠️ <b>Not confirmed yet.</b> We sent the change but the thermostat hasn\'t confirmed it. It may still go through. We\'ll keep watching and update the ticket if it does, so please don\'t treat it as done.', footer: go('Log it for the IoT helpdesk', 'CTL:escalate-indet', 'primary') });

// results (live after-card; D2: no ticket number means no "I've logged it")
function result(id, r, o) {
  o = o || {};
  const body = H.known([W(o.words || 'The bar is freezing')].concat(o.known || [])) + (o.alert ? '<div class="alert err" data-testid="ticket-failed">' + o.alert + (o.alertBtn ? ' ' + H.btn(o.alertBtn, 'CTL:release-ok', 'small') : '') + '</div>' : '') +
    (o.noTicket
      ? H.sayBox(esc(T(r.say)), '', 'after-say') + '<div class="outcome after" data-testid="outcome-applied"><div class="after-head"><span class="after-kicker">What happened</span>✔ ' + esc(T(r.hd)) + '</div><div class="after-body"><p class="after-line">' + esc(T(r.body)) + '</p></div></div>'
      : H.afterCard(o.test || 'outcome-applied', esc(T(r.hd)), EX, '<p class="after-line">' + esc(T(r.body)) + '</p>' + (r.foot ? '<p class="small">' + esc(T(r.foot)).replace(/#\d+/g, '#' + EX) + '</p>' : ''), esc(T(r.say)), '')) +
    (o.noTicket ? '' : H.addNote(EX)) + H.outButtons();
  add({ id, g: 'CTL', t: o.t, rootKey: o.root || 'S6832-cold', flowHtml: H.flowShell(o.icon || '🌡️', o.title || 'Heating', body, false), deltas: ['R7'], authored: true, ticketNode: !o.noTicket, edges: [] });
}
result('CTL:finish-up', row('CTL-finish-up'), { t: 'Result: done (target raised, with a set time)' });
result('CTL:finish-frost', row('CTL-finish-frost'), { t: 'Result: done (heating turned off)' });
result('CTL:finish-switch', row('CTL-finish-switch'), { t: 'Result: circuit switched', words: 'Car park lights are off', icon: '💡', title: 'External lighting', root: 'L6961' });
result('CTL:finish-fail', row('CTL-finish-fail'), { t: 'Result: done, but the ticket could not be logged', noTicket: true, alert: T(row('CTL-finish-fail').alert) });
result('CTL:release-ok', row('CTL-release-ok'), { t: 'Result: sent, waiting (ticket logged)', test: 'outcome-sent' });
add({ id: 'CTL:release-fail', g: 'CTL', t: 'Result: sent, waiting, ticket FAILED (no false "I\'ve logged it")', rootKey: 'S6832-cold', deltas: ['R7'], authored: true,
  flowHtml: H.flowShell('🌡️', 'Heating', H.known([W('The bar is freezing')]) + '<div class="alert err" data-testid="ticket-failed">We couldn\'t log this automatically: Zendesk is unreachable. ' + H.btn('Try logging again', 'CTL:release-ok', 'small') + '</div>' + H.sayBox('That\'s gone to the thermostat now. It can take a few minutes to take effect. We\'ll keep an eye on it, and I\'ll make sure it\'s logged for our team.', '', 'after-say') + '<div class="outcome after"><div class="after-head"><span class="after-kicker">What happened</span>📨 Sent: waiting for the thermostat to confirm</div><div class="after-body"><p class="after-line">Target temperature raised to 21°C (Bar area) has been sent. It should take effect within about 4 minutes.</p></div></div>' + H.outButtons(), false), edges: [] });
result('CTL:escalate-indet', row('CTL-escalate-indet'), { t: 'Result: not confirmed, logged' });
result('CTL:escalate-nondel', row('CTL-escalate-nondel'), { t: 'Result: not delivered, logged' });

// the live "Turn OFF / Turn ON" buttons open the switch window
Object.values(NODES).filter(n => n.live && (n.g === 'LIGHT' || n.g === 'FAN')).forEach(n => n.edges.forEach(e => { if (/^Turn (OFF|ON)$/.test(e.l)) e.to = 'CTL:compose-switch'; }));
// boiler panel duration results (live captures)
liveNode('BPdone-on', { g: 'BP', t: 'Result: heating turned on (live)', deltas: ['R11'] });
liveNode('BPdone-off', { g: 'BP', t: 'Result: heating turned off (live)', deltas: ['R11'] });
const dur = { 'BP9001-read~5': 'BPdone-on', 'BP9001-read~7': 'BPdone-off' };
Object.entries(dur).forEach(([n, to]) => NODES[n].edges.forEach(e => { if (/^(30 minutes|1 hour|2 hours|Until 07:00)$/.test(e.l)) e.to = to; }));
NODES['BPdone-on'].edges.forEach(e => { if (e.l === 'Finish this issue') e.to = 'BP9001-read~6'; });
NODES['BPdone-off'].edges.forEach(e => { if (e.l === 'Finish this issue') e.to = 'BP9001-read~8'; });
['BP9001-read~5', 'BP9001-read~7', 'BP9001-read~6', 'BP9001-read~8', 'BP9001', 'BP9001-read'].forEach(() => {});
Object.values(NODES).filter(n => n.g === 'BP' && !n.deltas.includes('R11')).forEach(n => n.deltas.push('R11'));
