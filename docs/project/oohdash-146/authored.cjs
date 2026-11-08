// OOHDASH-146 rev 3: which live screens the prototype keeps, which it changes, and the screens that are new in 146.
// Every difference from live is tagged with an item id (R1..R14, G1) listed in DELTAS; the screen-text diff proves nothing else differs.
const B = require('./build-proto.cjs');
const { PK, VW, NODES, group, delta, add, liveNode, retarget, step, after, p1confirm, p1after, W, shell, H, dyn, rootFirst } = B;
const OLD = require('./proposed-wording.cjs');
const oldRow = id => OLD.STATES.find(s => s.id === id);
const esc = H.esc;
// C5: "service contractor" app-wide, C1: "manual override" (live wording), and customer-not-caller
function words(t) {
  if (t == null) return t;
  return String(t)
    .replace(/\b(your|their|the) own (boiler or service engineer|service engineer|heating engineer|repairs engineer|refrigeration engineer|air conditioning engineer|electrician or maintenance contractor|ventilation or maintenance contractor|contractor or service engineer|contractor|boiler company)\b/g, (m, a) => (a === 'the' ? 'the' : a) + ' service contractor')
    .replace(/boiler or service engineer/g, 'service contractor')
    .replace(/manual control button/g, 'manual override')
    .replace(/the caller\b/g, 'the customer')
    .replace(/[’]/g, "'");
}
const T = words;

/* ------------------------------------------------------------------ delta register (the "differs from live" list) */
delta('R1', 'Kitchen: a one-off change for the next time (D8)', 'New first question when the customer needs a different time, the equipment\'s next times, the safety question, a check step, a booked card, a cancel path and a site banner. The live answer "It\'s fine, but we need it at different times" goes to this step instead of straight to the timetable form. "Different times every week" still goes to the live form.');
delta('R2', 'Something else, redesigned (D5, D11)', 'The customer picks what it is about and the dashboard starts that issue\'s questions; the two agent-judgement buttons and the "it is controlled, go back" dead end are gone. "None of these" asks the universal risk question (R14) in place of the live urgent-or-not question, and the live required reason box becomes the shared mandatory P1 comment.');
delta('R3', 'Hot water: one closed note everywhere (D5, D7)', 'No hot water control and no temperature reading at any site, so the two agent buttons ("Pass it to the IoT team", "Scope guidance") are removed and the screen goes straight to a closed note telling the customer to use their service contractor. The hot water state at the time of the call is added to the ticket.');
delta('R4', 'Not on Lighthouse here: closed note, no dead end (D6, D11)', 'Outside lighting, extractor fans, heating and air conditioning that are not on Lighthouse at the site now end on a closed note (with "Which equipment is it?" as in live kitchen), instead of "Continue under Something else". Live air conditioning is the same at every site; it now says so honestly where there is none.');
delta('R5', 'Connection check: no button, divert corrected (D10)', 'The "Run connection check" button on the site screen and the typed keywords are removed (the automatic divert stays). The divert no longer says "Everything at this site is online" when the customer\'s own thermostat is the thing that is offline. The all-online screen is no longer reachable.');
delta('R6', 'Heating (thermostats): customer questions, no agent buttons (D5, D12)', 'The agent buttons "Give the radiator advice", "Raise the setpoint anyway" and "Adjust the setpoint anyway" are replaced by plain questions to the customer (for example "Are the radiators in that area warm?"); the turn-it-off card asks the customer. The area picker and readings are live.');
delta('R7', 'Device control window: plain wording and an honest ticket line (D2, D4)', 'Window titles and buttons in plain words ("Make it warmer", "Send"), no raw device codes, and "I\'ve logged it" only when a ticket number came back (a failed ticket shows "Try logging again"). Results use the live after-card. The repeated "not confirmed yet" pop-up shows once (not visible on a screen).');
delta('R8', 'Customer details: name, role and number (D9, non-blocking)', 'Asked on the site screen after the site is confirmed. The call record still starts at site confirm (live E1), so the issue buttons are never blocked. "The customer won\'t give these" records that instead. Once saved, a customer line appears above every issue screen.');
delta('R9', 'Tonight: plain outcome chips and "What happened"', 'Raw codes replaced by plain chips (including the boiler-boost key, closed note and the kitchen one-off chips).');
delta('R10', '"Caller" becomes "customer" in ticket text (B4)', 'The words "caller" and "Caller" in ticket subjects, ticket notes and the ticket status label (views.js:99, zendesk.js:255, 388-389, 588). Shown on the "Ticket wording" screen and on the callback ticket drawer.');
delta('R11', 'Boiler-panel (pub heating) screens added to the prototype (C6a)', 'These screens are live and unchanged apart from the shared text key; they were missing from the earlier prototype. The two duration results ("Heating turned on/off") are captured from live; the transient "Sending…" screens are not shown.');
delta('R12', 'Outside lighting wording: "on-site switch" becomes "manual override"', 'Live uses "the on-site switch" in the lighting known-lines and the ticket text but "manual override" everywhere else (C1). Made consistent.');
delta('R13', 'Site screen "Sending nothing": offline banner hint', 'The offline banner no longer offers the connection check button; its hint now reads "The questions check the equipment for you if your issue involves it."');
delta('G1', 'Grammar fixes on multi-circuit kitchen sites (D)', '"can\'t show whether them are on" becomes "can\'t show whether they are on", and "has the kitchen — pot wash and kitchen — fryers come on?" becomes "have the kitchen — pot wash and kitchen — fryers come on?".');
delta('N1', 'Example data', 'Site name, house number, ticket numbers and the times shown are fixed examples so every screen reads the same; the live screens use the site\'s own data.');

/* ------------------------------------------------------------------ groups */
group('K8888', 'Kitchen: site with its own equipment list', 'Start at the first question. Live screens from a site whose kitchen circuits we can read, plus the new D8 question and one-off screens.');
group('K6832', 'Kitchen: older site (can\'t read the circuits)', 'Live screens. The multi-circuit sentences have the grammar fix (G1).');
group('KGW', 'Kitchen: other equipment states (live)', 'The glass washer in four other states: working but not on schedule, outside its times, off for an unknown reason, not connecting.');
group('KD8', 'Kitchen: one-off change for next time (new, D8)', 'Not in live. Keeps the timetable untouched; books one switch-on or one extension for the next occasion only.');
group('HW', 'Hot water (changed: closed note)', 'Eleven readings of the hot water setting, all ending on the same closed note. No hot water control anywhere.');
group('NLH', 'Not on Lighthouse here (changed: closed notes)', 'Equipment the site does not have on Lighthouse: the customer is told to use their service contractor. The ticket is created already closed.');
group('LIGHT', 'Outside lighting', 'Live screens: override first. A switchable controller site, an online controller and one that is not connecting.');
group('FAN', 'Extractor fans', 'Live screens, including the timetable request form with the Area Manager line.');
group('FR', 'Fridges and freezers', 'Live and unchanged (a P1 only when stock is at risk, as shipped in 159). Flagged for your check, see item C3.');
group('CONN', 'Connection check (reached by the automatic divert only)', 'There is no button any more. These screens appear when heating, kitchen or lighting finds equipment offline.');
group('CONT', 'Contractor on site', 'Live screens. The guide link opens the revised guide with the device pictures.');
group('ELSE', 'Something else (changed)', 'The customer\'s words, then "is it about any of these?", then "is it urgent?" on the agreed P1 path.');
group('AC', 'Air conditioning', 'Live screen, unchanged where the site has it. See the Not on Lighthouse group for the closed note where it does not.');
group('HEAT', 'Heating (thermostats)', 'Live area picker and readings; the questions that followed the old agent buttons are changed (D5, D12). Control windows are in their own group.');
group('BP', 'Heating: pub boiler panel (added)', 'Live screens for sites whose heating is the pub boiler panel: no reading, and a reading with the zone state and the duration choices.');
group('CTL', 'Device control window (changed)', 'The window that sends a change to a thermostat or switch, and the card shown afterwards.');
group('CD', 'Customer details (new, D9)', 'Name, role and number, asked after the site is confirmed. Never blocks the call.');
group('PAGES', 'Other screens', 'Search, site confirmation, callback, Tonight, the site screen with its banners, ticket wording.');

/* ------------------------------------------------------------------ live screens (BFS from the first screen of a root) */
function liveRoot(root, g, o) {
  o = o || {};
  const seen = new Set(); const q = [rootFirst[root]]; const out = [];
  while (q.length) {
    const cid = q.shift(); if (seen.has(cid)) continue; seen.add(cid);
    const n = PK.nodes[cid]; if (!n) continue;
    if (/Complete the control action in the window/.test(n.text)) continue;
    if (n.path.some(l => /^(✕|Cancel|−|\+|Send to device|Until next schedule slot \(default\)|Until 07:00 tomorrow|For 4 hours)$/.test(l))) continue;
    if (o.drop && o.drop.includes(cid)) continue;
    let flow = n.flow; if (!flow) continue;
    const nd = liveNode(cid, { g, deltas: (o.nodeDeltas && o.nodeDeltas[cid]) || [], id: o.prefix ? o.prefix + cid : cid });
    out.push(nd);
    n.edges.forEach(e => { if (!e.skip && e.to) q.push(e.to); });
  }
  return out;
}
const ID = (cid, prefix) => (prefix || '') + cid;

// kitchen, site with its own list ----------------------------------------------------------------
liveRoot('K8888', 'K8888');
['B-unscheduled', 'B-outside', 'off-unknown', 'fallback'].forEach(v => liveRoot('K8888-gw-' + v, 'KGW'));
liveRoot('K6832', 'K6832');
liveRoot('K-none', 'NLH');
// lighting, fans, fridges
liveRoot('L6749', 'LIGHT'); liveRoot('L6360', 'LIGHT');
const L61 = liveRoot('L6961', 'LIGHT', { allowModal: [] });
liveRoot('FAN6851', 'FAN');
liveRoot('FAN-switch', 'FAN');
liveRoot('FR6851', 'FR');
// connection check (divert-only): keep the offline-reached roots, drop the all-online root
liveRoot('CN6832', 'CONN'); liveRoot('CN5198', 'CONN'); liveRoot('CN6771', 'CONN'); liveRoot('CN6772', 'CONN'); liveRoot('CN6773', 'CONN');
// contractor
liveRoot('CT6832', 'CONT'); liveRoot('CT-dd', 'CONT');
// air conditioning (live, site has it)
liveRoot('AC6218', 'AC');
// boiler panel
liveRoot('BP9001', 'BP'); liveRoot('BP9001-read', 'BP', { drop: ['BP9001-read~9', 'BP9001-read~10', 'BP9001-read~11', 'BP9001-read~12'] });
// heating: live area picker + readings + dark-unit screens
liveRoot('S7001', 'HEAT');
const hn = (cid, o) => liveNode(cid, Object.assign({ g: 'HEAT' }, o));
hn('S6832-cold~1'); hn('S6832-cold~2'); hn('S6832-cold~3'); hn('S6832-near~3', { t: 'Live: Bar reading, room close to its target' });

// live nodes whose group is pre-set by the root; set titles from the path
Object.values(NODES).forEach(n => {
  if (!n.live) return;
  const p = PK.nodes[n.src].path;
  n.t = (p.length ? p.join(' > ') : 'First screen') + (n.t && !/^Live: /.test(n.t) ? '' : '');
  if (n.t.length > 90) n.t = n.t.slice(0, 87) + '...';
});

/* ------------------------------------------------------------------ live screens changed by 146 (wording / retarget only) */
// R12 lighting wording
Object.values(NODES).filter(n => n.live && n.g === 'LIGHT').forEach(n => {
  const a = n.flowHtml.split('with the on-site switch').join('with the manual override').split('after the on-site switch').join('after the manual override');
  if (a !== n.flowHtml) { n.flowHtml = a; n.deltas.push('R12'); }
});

/* ------------------------------------------------------------------ R3 hot water: closed note everywhere */
const HWV = [
  ['HW-nodhw', 'Hot water: not controlled (no setting shown)', 'HW-0', 'Hot water: we don\'t control it from here', null],
  ['HW-auto', 'Setting: normal timetable', 'HW-0-dhw-auto'], ['HW-auto-ended', 'Setting: a change has just ended', 'HW-0-dhw-auto-ended'],
  ['HW-on-until', 'Setting: switched on until a time', 'HW-0-dhw-on-until'], ['HW-off-until', 'Setting: switched off until a time', 'HW-0-dhw-off-until'],
  ['HW-on-v1', 'Setting: switched on (no end time)', 'HW-0-dhw-on-v1'], ['HW-off-v1', 'Setting: switched off (no end time)', 'HW-0-dhw-off-v1'],
  ['HW-cc-stale', 'Can\'t confirm: controls last reported hours ago', 'HW-0-dhw-cc-stale'], ['HW-cc-notreconf', 'Can\'t confirm: not confirmed recently', 'HW-0-dhw-cc-notreconf'],
  ['HW-cc-decode', 'Can\'t confirm: reading doesn\'t make sense', 'HW-0-dhw-cc-decode'], ['HW-nlh', 'Site has no hot water on Lighthouse', 'HW-nlh']
];
HWV.forEach(([root, title, oid]) => {
  const r = oldRow(oid === 'HW-0' ? 'HW-0' : oid);
  const hd = T(r.hd), say = T(r.say);
  const ticketLine = r.ticketSentence ? r.ticketSentence : null;
  after('HW:' + root, { g: 'HW', t: title, root, f: 'Hot', kind: 'closed', deltas: ['R3'],
    known: [W('No hot water in the kitchen'), ['k', esc(hd)]], info: r.gtk ? esc(T(r.gtk)) : '', say: esc(say), ticketLine });
});
// the live screens these replace are listed in the diff as "removed"

/* ------------------------------------------------------------------ R4 not on Lighthouse here */
function nlh(id, flowKey, what, icon, soWords, ticketSubject) {
  const f = ICON_OF[flowKey];
  const s = step(id + '-0', { g: 'NLH', t: what + ': not on Lighthouse here', root: id === 'L-none' ? 'L6360' : 'K-none', f, deltas: ['R4'],
    known: [W(soWords), ['c', 'The problem is with ' + what.toLowerCase() + ', which isn\'t on Lighthouse at this site']],
    info: 'Lighthouse doesn\'t switch any ' + what.toLowerCase() + ' at this site, so there is nothing to check or change from here.',
    say: '<p>That isn\'t controlled by Lighthouse at your site, so I can\'t see it or switch it from here. Please contact your service contractor through your usual route; they look after that equipment.</p>',
    fields: '<div class="formrow"><label>Which equipment is it? <span class="small">(the customer\'s words)</span></label><input placeholder="e.g. the car park lights on the barn"></div>',
    btns: H.btn('Continue', id + '-1', 'primary') });
  after(id + '-1', { g: 'NLH', t: what + ': closed note', root: id === 'L-none' ? 'L6360' : 'K-none', f, kind: 'closed', deltas: ['R4'],
    known: [W(soWords), ['c', 'The problem is with ' + what.toLowerCase() + ', which isn\'t on Lighthouse at this site'], ['c', 'The customer says it\'s: "The car park lights on the barn"']],
    say: 'I\'ve put a note of this call on your site\'s record, reference ' + dyn(EXn) + '. Your service contractor is the right person to look at that.', ticketLine: ticketSubject });
  return s;
}
const EXn = B.EX;
const ICON_OF = { L: 'Lighting', F: 'Fans', H: 'Heat', A: 'Air' };
nlh('L-none', 'L', 'Outside lighting', '', 'Car park lights are off', 'Outside lighting: not on Lighthouse, customer referred to their service contractor');
nlh('FAN-none', 'F', 'Extractor fans', '', 'Need the fans on late', 'Extractor fans: not on Lighthouse, customer referred to their service contractor');
nlh('H-none', 'H', 'Heating', '', 'The bar is freezing', 'Heating: not on Lighthouse, customer referred to their service contractor');
nlh('AC-none', 'A', 'Air conditioning', '', 'Aircon is blowing warm', 'Air conditioning: not on Lighthouse, customer referred to their service contractor');

/* ------------------------------------------------------------------ R5 connection check */
step('CN-devoff', { g: 'CONN', t: 'Diverted here: the thermostat is offline but the site is online', root: 'CN5198', f: 'Conn', deltas: ['R5'],
  known: [W('The bar is freezing'), ['k', 'The bar thermostat isn\'t connecting to us; the rest of the site is']],
  info: 'The site\'s Lighthouse unit is online; only this piece of equipment is down.',
  say: '<p>Your bar thermostat has lost its connection to us, so I can\'t see or change it from here at the moment. Could you check it has power, and that nothing on the fuse board has tripped?</p>', ask: 'is it working now?',
  answers: [['Yes, it\'s working now', 'CN6771~2'], ['No, it\'s still not working', 'CN5198~2']] });

/* ------------------------------------------------------------------ R2 Something else */
const ELSE = oldRow('O-choice');
step('O-0', { g: 'ELSE', t: 'First screen: the customer\'s words, then "is it about any of these?"', root: 'O6832', f: 'Else', deltas: ['R2'],
  known: [W('Cellar cooler alarm going off')],
  info: 'Each answer goes straight to the right questions for this site. If Lighthouse does not have it here, it goes to a closed note telling the customer to use their service contractor. The list is this site\'s own list.',
  say: '', ask: 'is it about any of these?',
  answers: [['Heating', 'HEAT:start'], ['Hot water', 'HW:HW-auto'], ['Kitchen equipment', 'K-what'], ['Outside lighting', 'O-none'], ['Extractor fans', 'O-none'], ['The boiler itself', 'O-none'], ['None of these', 'O-choice']] });
step('O-choice', { g: 'ELSE', t: 'None of these: the risk question (D13)', root: 'O6832', f: 'Else', deltas: ['R2'],
  known: [W('Cellar cooler alarm going off'), ['c', 'It isn\'t about anything on the list']],
  info: H.RISK_INFO + ' Please only use this option after you\'ve attempted to follow through one of the circumstance tiles.',
  say: '', ask: H.RISK_ASK, answers: [['Yes', 'O-p1'], ['No', 'O-normal']] });
after('O-normal', { g: 'ELSE', t: 'Can wait: logged as described', root: 'O6832', f: 'Else', deltas: ['R2'],
  known: [W('Cellar cooler alarm going off'), ['c', 'It isn\'t about anything on the list'], ['c', H.RISK_KNOWN('no')]],
  say: 'I\'ve passed exactly what you\'ve described to our IoT team, reference ' + dyn(EXn) + '. They pick it up the next working day. If it becomes urgent tonight, ring back and we\'ll escalate it.', ticketLine: 'General issue captured' });
p1confirm('O-p1', { g: 'ELSE', t: 'Urgent: confirm the P1', root: 'O6832', f: 'Else', deltas: ['R2'], to: 'O-p1-after',
  known: [W('Cellar cooler alarm going off'), ['c', 'It isn\'t about anything on the list'], ['c', H.RISK_KNOWN('yes')]],
  say: 'Thanks. I\'m going to raise this as urgent with our on-call team.', subject: 'Something else — risk to trade or health and safety — P1', detail: 'Customer reported: Cellar cooler alarm going off. Did not fit a specific tile; the customer says there is an immediate risk to trade or to anyone\'s health and safety.' });
p1after('O-p1-after', { g: 'ELSE', t: 'Urgent: P1 raised', root: 'O6832', f: 'Else', deltas: ['R2'], subject: 'Something else — risk to trade or health and safety — P1',
  known: [W('Cellar cooler alarm going off'), ['c', 'It isn\'t about anything on the list'], ['c', H.RISK_KNOWN('yes')]],
  say: 'That\'s raised as urgent, reference ' + dyn(EXn) + '. Someone from our on-call team will call you back shortly.' });
after('O-none', { g: 'ELSE', t: 'Not on Lighthouse here: closed note', root: 'O6832', f: 'Else', kind: 'closed', deltas: ['R2', 'R4'],
  known: [W('Cellar cooler alarm going off'), ['c', 'It is about outside lighting, which isn\'t on Lighthouse at this site']],
  say: 'That isn\'t part of the Lighthouse system at your site, so please contact your service contractor through your usual route. I\'ve noted the call on your site\'s record, reference ' + dyn(EXn) + '.' });

/* ------------------------------------------------------------------ R1 kitchen one-off (D8) */
const Kn = { g: 'KD8', root: 'K8888', f: 'Kitchen', deltas: ['R1'] };
step('K-what', Object.assign({}, Kn, { t: 'First question: not working, or a different time? (new)', known: [W('The fryer won\'t come on')],
  say: '', ask: 'is the equipment not working, or do you need it on at a different time?',
  info: 'Shown where we can read the kitchen\'s times. Where we can\'t, the live equipment list is shown straight away.',
  answers: [['It\'s not working', 'K8888~1'], ['I need it at a different time', 'K-when-pick']] }));
step('K-when-pick', Object.assign({}, Kn, { t: 'Which equipment needs a different time? (new)', known: [W('The fryer won\'t come on'), ['c', 'The customer needs it at a different time']],
  info: 'From this site\'s equipment list. The prototype shows the fryer\'s times as the example; other equipment shows its own times in the same layout.',
  say: '', ask: 'which piece of kitchen equipment needs a different time?', answers: [['Fryer', 'K-when'], ['Glass washer', 'K-when'], ['Dishwasher', 'K-when'], ['Pot wash', 'K-when'], ['Bain-marie', 'K-when']] }));
step('K-when', Object.assign({}, Kn, { t: 'Its next times: do they work? (new)', known: [W('The fryer won\'t come on'), ['c', 'The customer needs it at a different time'], ['k', dyn('Fryer') + ' is on; its timetable has it off at ' + dyn('23:00') + ' tonight and on again at ' + dyn('07:00') + ' tomorrow']],
  info: 'We can set up a one-off change for the next time only. It never changes the timetable. PowerPause only controls the power to the equipment, so starting it, stopping it and using it safely stays the site\'s responsibility.',
  say: '<p>Your fryer\'s timetable switches it off at 23:00 tonight and back on at 07:00 tomorrow. Do those times work for you, or do you need it at a different time?</p>', ask: 'what do you need?',
  answers: [['Those times are fine', 'K-fine'], ['On later tonight', 'K-later'], ['On earlier tomorrow', 'K-earlier'], ['Different times every week (a permanent change)', 'K8888~28'], ['Needed for a later day, not tonight or tomorrow morning', 'K-normal']] }));
after('K-fine', Object.assign({}, Kn, { t: 'Outcome: its normal times are fine (closed note)', kind: 'closed',
  known: [W('The fryer won\'t come on'), ['c', 'The customer needs it at a different time'], ['c', 'Its normal times are fine']],
  say: 'Great, then nothing needs changing, and it\'ll come on at 07:00 tomorrow as usual. I\'ve made a note of your call, reference ' + dyn(EXn) + '.', ticketLine: 'Kitchen times checked with the customer: no change needed' }));
step('K-later', Object.assign({}, Kn, { t: 'On later tonight: how long? (new)', known: [W('The fryer won\'t come on'), ['c', 'Needed on later tonight']],
  info: 'Up to 2 hours past its normal off time, tonight only.', say: '', ask: 'how long after 23:00 do you need it on?',
  answers: [['Until 23:30', 'K-confirm-later'], ['Until midnight', 'K-confirm-later'], ['Until 1am', 'K-confirm-later']] }));
step('K-earlier', Object.assign({}, Kn, { t: 'On earlier tomorrow: what time? (new)', known: [W('The fryer won\'t come on'), ['c', 'Needed on earlier tomorrow']],
  info: 'Up to 2 hours before its normal on time (07:00), for the next time only.', say: '', ask: 'what time do you need it on tomorrow?',
  answers: [['06:30', 'K-confirm-earlier'], ['06:00', 'K-confirm-earlier'], ['05:00', 'K-confirm-earlier']] }));
const RESP = 'PowerPause only controls the power to the equipment. Starting it, stopping it and using it safely stays the site\'s responsibility.';
['later', 'earlier'].forEach(w => {
  const kn = [W('The fryer won\'t come on'), ['c', w === 'later' ? 'Needed on until midnight tonight' : 'Needed on from 06:00 tomorrow'], ['k', '<b>Urgent</b> — it is needed before the IoT team could act']];
  add({ id: 'K-confirm-' + w, g: 'KD8', t: 'Check before booking (' + w + ', urgent)', rootKey: 'K8888', deltas: ['R1', 'R15'], authored: true,
    flowHtml: shell('🍳', 'Kitchen equipment', H.known(kn) + H.urgBanner(true, w === 'later' ? 'Needed tonight, and the IoT team could not act before then, so you can book it now.' : 'Needed before 12:00 tomorrow, and the IoT team could not act before then, so you can book it now.') +
      H.infoBox('Booking only means our system has accepted it. Each switch is shown as done only when the fryer confirms it. ' + RESP) +
      '<div class="confirm-step" data-testid="confirm-step">' + H.sayBox('<p>' + (w === 'later' ? 'At 23:00 its timetable switches it off as usual. Within about 2 minutes we switch it back on, and at midnight we switch it off again. Tomorrow it carries on with its normal times. The timetable itself isn\'t changed.' : 'At 06:00 tomorrow we switch it on, ahead of its normal 07:00, and after that it carries on with its normal times. The timetable itself isn\'t changed.') + '</p>', '') +
      H.warnBox('this books a one-off for the <span class="dyn">fryer</span>. The timetable is not changed.') + '<div class="outbtns"><button class="btn primary" data-testid="record-outcome" data-to="K-booked-' + w + '">Book it</button><button class="btn" data-to="K-' + w + '">Change the time</button></div></div>', true), edges: [] });
  add({ id: 'K-booked-' + w, g: 'KD8', t: 'Result: booked (' + w + ')', rootKey: 'K8888', deltas: ['R1'], authored: true, ticketNode: true,
    flowHtml: shell('🍳', 'Kitchen equipment', H.known(kn.slice(0, 2)) +
      H.afterCard('outcome-oneoff', w === 'later' ? 'Booked: the fryer stays on until midnight tonight' : 'Booked: the fryer comes on at 06:00 tomorrow', B.EX,
        '<p class="after-line">' + (w === 'later' ? 'Booked at 19:44. Just after 23:00 we switch it back on, and at midnight we switch it off.' : 'Booked at 19:44. At 06:00 we switch it on, ahead of its normal 07:00.') + ' Its timetable isn\'t changed. Nothing has been switched yet.</p><p class="after-line small">On the ticket: Kitchen one-off booked (reviewed the next working day)</p>',
        (w === 'later' ? 'That\'s booked. Your fryer will go off at 23:00 as usual, come back on within about two minutes, and stay on until midnight. Please still switch the fryer off at the fryer itself when you\'ve finished with it. Tomorrow it carries on with its normal times.' : 'That\'s booked. Your fryer will come on at 06:00 tomorrow, an hour before its normal time, then carry on with its normal times.') + ' Starting and using it safely stays with your team. It\'s logged, reference ' + dyn(B.EX) + ', and our team will check on the next working day whether you need the times changed for good.',
        '<div class="outbtns" style="margin-top:8px"><button class="btn" data-to="K-cancelled">Cancel this booking</button></div>') + H.addNote(B.EX) + H.outButtons(), false), edges: [] });
});
// not urgent: a normal ticket only, no P1 offered
after('K-normal', Object.assign({}, Kn, { t: 'Not urgent: a normal ticket for the team (no booking, no P1)',
  known: [W('The fryer won\'t come on'), ['c', 'Needed for a later day'], ['k', '<b>Not urgent</b> — the IoT team can pick this up in time']],
  say: 'Thanks. It\'s logged, reference ' + dyn(EXn) + ', and our IoT team picks it up the next working day, in plenty of time for when you need it.', ticketLine: 'Kitchen equipment: different times needed (not urgent)', deltas: ['R1', 'R15'] }));
// urgent but the dashboard cannot make the change: a P1 is raised automatically (second automatic exception, with the failed switch-off)
add({ id: 'K-auto-p1', g: 'KD8', t: 'Urgent, and the dashboard cannot make the change: P1 raised automatically', rootKey: 'K8888', deltas: ['R1', 'R15'], authored: true, ticketNode: true, isP1: true, autoP1: true, edges: [],
  flowHtml: shell('🍳', 'Kitchen equipment', H.known([W('The fryer won\'t come on'), ['c', 'Needed on later than its normal times'], ['k', '<b>Urgent</b> — it is needed before the IoT team could act'], ['k', 'The dashboard can\'t make a one-off change here']]) +
    H.sayBox('That\'s raised as urgent, reference ' + dyn(B.EX) + '. I can\'t set that up from here, so someone from our on-call team will call you back shortly. ' + RESP, '', 'after-say') +
    '<div class="outcome after" data-testid="outcome-p1"><div class="after-head"><span class="after-kicker">What happened</span>✔ P1 raised automatically<span class="tktbadge" data-testid="after-ticket">Ticket ' + H.tktLink(B.EX) + '</span></div><div class="after-body"><p class="after-line" data-testid="p1-dispatch-status">The on-duty manager has been paged and will call the site back.</p><p class="after-line small">On the ticket: Kitchen one-off could not be set up — urgent request — P1 (automatic)</p><p class="after-line small" data-testid="p1-reason-note">Why it\'s urgent is on the ticket: an urgent one-off was requested and the dashboard cannot make the change. No comment is needed; nobody typed it.</p></div></div>' + H.addNote(B.EX) + H.outButtons(), false) });
add({ id: 'K-book-fail', g: 'KD8', t: 'Result: couldn\'t book it (the fryer isn\'t responding)', rootKey: 'K8888', deltas: ['R1'], authored: true,
  flowHtml: shell('🍳', 'Kitchen equipment', H.known([W('The fryer won\'t come on'), ['c', 'Needed on until midnight tonight'], ['k', '<b>Urgent</b> — it is needed before the IoT team could act']]) + '<div class="alert err" data-testid="book-failed">We couldn\'t set that up: the fryer isn\'t responding right now. Nothing has been booked and nothing will be switched.</div>' +
    H.sayBox('<p>I can\'t set that up from here at the moment. As you need it tonight, I\'m passing it straight to our on-call team.</p>', '') + '<div class="outbtns">' + H.btn('Continue', 'K-auto-p1', 'primary') + '</div>', true), edges: [] });
add({ id: 'K-cancelled', g: 'KD8', t: 'Result: booking cancelled', rootKey: 'K8888', deltas: ['R1'], authored: true, ticketNode: true,
  flowHtml: shell('🍳', 'Kitchen equipment', H.known([W('The fryer won\'t come on'), ['c', 'The customer cancelled the one-off']]) +
    H.afterCard('outcome-cancelled', 'Cancelled: nothing will be switched', B.EX, '<p class="after-line">The one-off for the fryer is cancelled. It keeps to its normal times.</p><p class="after-line small">Added to the ticket.</p>', 'I\'ve cancelled that, so your fryer will keep to its normal times. I\'ve added that to the ticket, reference ' + dyn(B.EX) + '.', '') + H.addNote(B.EX) + H.outButtons(), false), edges: [] });
step('K-when-unknown', Object.assign({}, Kn, { t: 'Needed at a different time, but the dashboard can\'t make a one-off change here (fallback)', root: 'K6832', known: [W('The kitchen is dead'), ['c', 'Needed at a different time']],
  info: 'A one-off change is only possible when the site has the one-off switched on, the circuit supports it and we can read its next on and off times. Here it cannot be made. ' + H.URG_INFO,
  say: '<p>I can\'t see your kitchen equipment\'s timetable from here at the moment, so I can\'t set up a one-off change. If you need it on before the team can look at it, pressing the manual override on the PowerPause panel once brings it on until its next timetable change.</p>', ask: H.URG_ASK,
  answers: H.urgChips('K-auto-p1', 'K-normal'), btns: H.guideLink() }));
// the live tile now starts with the new question; live "different times" answers go to the new step
Object.values(NODES).forEach(n => {
  if (n.live && (n.g === 'K8888')) n.edges.forEach(e => { if (/different times$/.test(e.l)) { e.to = 'K-when'; if (!n.deltas.includes('R1')) n.deltas.push('R1'); } });
  if (n.live && n.g === 'K6832') n.edges.forEach(e => { if (/different times$/.test(e.l)) { e.to = 'K-when-unknown'; if (!n.deltas.includes('R1')) n.deltas.push('R1'); } });
});
Object.values(NODES).forEach(n => { if (n.live && n.g === 'KGW') n.edges.forEach(e => { if (/different times$/.test(e.l)) { e.to = 'K-when'; if (!n.deltas.includes('R1')) n.deltas.push('R1'); } }); });

/* ------------------------------------------------------------------ R6 heating questions (thermostats) */
function heatEdges(readId, o) {
  const n = NODES[readId];
  n.edges.forEach(e => {
    if (e.l === 'Warmer') e.to = o.warm;
    if (e.l === 'Cooler') e.to = 'CTL:compose-down';
    if (e.l === 'Turn it off') e.to = 'S-off-frost';
    if (e.l === "It's not working") e.to = o.broken;
  });
}
const Hn = { g: 'HEAT', root: 'S6832-cold', f: 'Heat', deltas: ['R6'] };
const hs = (id, t, known, extra) => step(id, Object.assign({}, Hn, { t, known: [W('The bar is freezing'), ['c', 'Area: <b>Bar/Restaurant</b>']].concat(known) }, extra));
hs('S-warm-buildheat', 'Warmer, but the controls already ask for heat', [['c', 'The customer wants it warmer'], ['k', 'The room is <b>16°C</b> against a target of <b>20°C</b>']],
  { info: 'The room is 16°C against a target of 20°C and the thermostat is online, so it is already asking for more heat than the building is giving. Turning it up would not change that. The customer\'s answer tells us whether the heat is reaching the radiators.',
    say: '<p>Your thermostat is already asking for more heat than the room is getting, so turning it up won\'t help.</p>', ask: 'are the radiators in that area warm?', answers: [['Yes, they\'re warm', 'S-buildheat'], ['No, they\'re cold', 'S-coldrads']] });
after('S-buildheat', { g: 'HEAT', t: 'Radiators warm: closed note', root: 'S6832-cold', f: 'Heat', kind: 'closed', deltas: ['R6'],
  known: [W('The bar is freezing'), ['c', 'Area: <b>Bar/Restaurant</b>'], ['c', 'The customer wants it warmer'], ['k', 'The room is <b>16°C</b> against a target of <b>20°C</b>'], ['c', 'The radiators are warm']],
  say: 'Your thermostat is asking for heat and your radiators are warm, so our controls are working; the room just isn\'t getting enough heat from them. That\'s down to the radiators, their valves or the boiler, which Lighthouse doesn\'t monitor or control, so please contact your service contractor through your usual route. I\'ve made a note of your call, reference ' + dyn(EXn) + '.', ticketLine: 'Heating complaint: controls working, room below target (Bar area)' });
after('S-coldrads', { g: 'HEAT', t: 'Radiators cold: ticket for the team', root: 'S6832-cold', f: 'Heat', deltas: ['R6'],
  known: [W('The bar is freezing'), ['c', 'Area: <b>Bar/Restaurant</b>'], ['c', 'The customer wants it warmer'], ['k', 'The room is <b>16°C</b> against a target of <b>20°C</b>'], ['c', 'The radiators are cold']],
  say: 'Our thermostat is asking for heat but your radiators are cold, so I\'ve logged it, reference ' + dyn(EXn) + ', for our team to check our controls on the next working day. If your boiler is showing a fault light, your service contractor is the quickest fix tonight.', ticketLine: 'Heating: thermostat asking for heat, radiators cold (Bar area)' });
hs('S-broken-under', 'Not working, and the room is below its target', [['c', 'The customer says the heating isn\'t working'], ['k', 'The room is <b>16°C</b> against a target of <b>20°C</b>']],
  { info: 'The thermostat is already asking for heat, so turning it up won\'t change that. The customer\'s answer tells us whether the heat is reaching the radiators.', say: '', ask: 'are the radiators in that area warm?', answers: [['Yes, they\'re warm', 'S-buildheat'], ['No, they\'re cold', 'S-coldrads']] });
after('S-broken-keepingup', { g: 'HEAT', t: 'Not working, room near its target: closed note', root: 'S6832-near', f: 'Heat', kind: 'closed', deltas: ['R6'],
  known: [W('Heating not working'), ['c', 'Area: <b>Bar/Restaurant</b>'], ['c', 'The customer says the heating isn\'t working'], ['k', 'The room is <b>19.5°C</b> against a target of <b>20°C</b>']],
  say: 'Your thermostat is reading 19.5 degrees against a target of 20, so our controls are keeping up. If one area still feels cold, it\'s likely a radiator or its valve, which Lighthouse doesn\'t monitor or control, so please contact your service contractor through your usual route. I\'ve made a note of your call, reference ' + dyn(EXn) + '.', ticketLine: 'Heating complaint: controls keeping up (Bar area)' });
hs('S-off-frost', 'Turn it off: the customer chooses', [['c', 'The customer wants it off']],
  { info: 'Turning it down to 5°C is the nearest safe option. It goes back to normal when the set time ends.', say: '<p>This thermostat doesn\'t have an off switch, but I can turn it right down so the heating stays off unless the building gets close to freezing.</p>', ask: 'would you like me to do that?', answers: [['Yes, turn it down', 'CTL:compose-frost'], ['No, leave it as it is', 'S-offnoact']] });
after('S-offnoact', { g: 'HEAT', t: 'Leave it as it is: nothing changed', root: 'S6832-cold', f: 'Heat', deltas: ['R6'], head: 'Call recorded, nothing changed',
  line: 'Nothing was switched or changed. The conversation is on the site\'s contact history.',
  known: [W('The bar is freezing'), ['c', 'Area: <b>Bar/Restaurant</b>'], ['c', 'The customer wants it off'], ['c', 'The customer wants it left as it is']],
  say: 'I haven\'t changed anything tonight. If you change your mind, call back and we can turn it down straight away. I\'ve made a note, reference ' + dyn(EXn) + '.', ticketLine: 'Heating-off request: no change made (Bar area)' });
heatEdges('S6832-cold~3', { warm: 'S-warm-buildheat', broken: 'S-broken-under' });
heatEdges('S6832-cold~2', { warm: 'S-warm-buildheat', broken: 'S-broken-under' });
heatEdges('S6832-near~3', { warm: 'CTL:compose-up', broken: 'S-broken-keepingup' });
['S6832-cold~2', 'S6832-cold~3', 'S6832-near~3'].forEach(i => { if (!NODES[i].deltas.includes('R6')) NODES[i].deltas.push('R6'); });

/* ------------------------------------------------------------------ R7 control window (modal screens) */
require('./authored-ctl.cjs');
/* ------------------------------------------------------------------ R11 boiler panel result cards, R8/R9/R10 pages */
require('./authored-pages.cjs');
require('./authored-d13.cjs');
