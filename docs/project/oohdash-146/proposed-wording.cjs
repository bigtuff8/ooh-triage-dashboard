// OOHDASH-146 — single source of truth for the proposed wording (revision 2: James's UI review, D5–D12).
// Drives: the design doc wording tables, the screen-text diff, and the prototype.
// Example values (names, times, temperatures, ticket numbers) are fixed examples; the build fills them from data.
// kind: step (a question or information card mid-flow), outcome (card -> Check and log -> logged),
//       p1 (combined P1 card: raise -> logged P1 banner + Say), modal (control window), ctlout (a result
//       card that logs its own ticket, as the control window does today), view (other screen).
// chips: [label, nextStateId|null, primary?]. log: { type, subject, detail, closed? }.
// log.closed = true: the ticket is created already solved (OohCloseOnCreate, D6), for the record only.
// was: the ids of today's screens this row replaces (for the screen-text diff). REMOVED: today's screens with no row.
const LOG = 'Log for the IoT helpdesk and finish';
const LOGC = 'Save the note and finish';
const P1BTN = 'Raise the P1 and finish';
const D2 = 'I’ve raised an urgent P1 ticket for this site and someone will call you back shortly.';
const NOTE = 'I’ll make a note of your call on our side.';
const CLOSEDGTK = 'Lighthouse doesn’t monitor or control this, so the customer goes to their own contractor. The ticket is saved already closed, for the record only.';

const S = [];
function add(o) { S.push(o); }
const REMOVED = {};

/* ============================== HOT WATER (D5, D6, D7) ============================== */
// D7: no hot water control on any architecture and no temperature reading (only a demand signal).
// Every hot water call ends on one closed note telling the customer to contact their own service engineer.
const HWSUBJ = 'Hot water: customer referred to their own service engineer';
const HWDET = 'Customer reports a hot water problem. Lighthouse has no hot water control and no hot water temperature reading at this site. Customer told to contact their own boiler or service engineer. Saved as a closed ticket for the record.';
const HWREF = 'Contact your own boiler or service engineer through your usual route';
add({ id: 'HW-0', flow: 'Hot water', title: 'First screen: no hot water setting shown (now goes straight to the outcome)', ref: 'flows.js:1782-1799', kind: 'outcome', was: ['HW-0'],
  done: 'Hot water: we don’t control it from here',
  hd: 'We don’t control hot water from here',
  say: 'Lighthouse doesn’t control your hot water and can’t see how hot it is, so please contact your own boiler or service engineer through your usual route. ' + NOTE,
  gtk: 'No site has hot water control on Lighthouse, and we never see its temperature, only whether the heating controls are asking for hot water. This is never a P1. The ticket is saved already closed, for the record only.',
  log: { type: 'scope-only', closed: true, subject: HWSUBJ, detail: HWDET } });
const DHW = [
  ['auto', 'Hot water setting: normal timetable', 'Hot water is on its normal timetable', 'Normal timetable',
    'Nobody has changed the hot water at the heating controls, so that isn’t the reason for the problem.',
    'Your hot water controls are on their normal timetable, so nobody has switched it off. Lighthouse doesn’t control your hot water itself, so please contact your own boiler or service engineer through your usual route. ' + NOTE,
    'Hot water at time of call: on its normal timetable.'],
  ['auto-ended', 'Hot water setting: a change has just ended', 'Hot water is back on its normal timetable', 'Normal timetable',
    'Someone changed the hot water at the controls until 18:15. That has ended, so it isn’t the reason for the problem now.',
    'Your hot water controls are back on their normal timetable. Lighthouse doesn’t control your hot water itself, so please contact your own boiler or service engineer through your usual route. ' + NOTE,
    'Hot water at time of call: on its normal timetable (a change ended at 18:15).'],
  ['on-until', 'Hot water setting: switched on until a time', 'Hot water has been switched on at the controls until 21:30', 'Switched on',
    'The controls are already asking for hot water, so the problem is in the boiler or hot water system, which we don’t monitor or control.',
    'Your heating controls are already asking for hot water until 21:30, so the problem is in the boiler or hot water system, which Lighthouse doesn’t monitor or control. Please contact your own boiler or service engineer through your usual route. ' + NOTE,
    'Hot water at time of call: switched on at the controls until 21:30.'],
  ['off-until', 'Hot water setting: switched off until a time', 'Hot water has been switched off at the controls until 22:00', 'Switched off',
    'That is the likely reason there is no hot water. It comes back on by itself at 22:00. We can’t change it from here.',
    'Your hot water has been switched off at the heating controls until 22:00, and it comes back on by itself then. If you need it sooner, it can be switched back on at the controls on site, or your own service engineer can help. We can’t change it from here. ' + NOTE,
    'Hot water at time of call: switched off at the controls until 22:00.'],
  ['on-v1', 'Hot water setting: switched on (no end time)', 'Hot water has been switched on at the controls', 'Switched on',
    'These controls don’t say when it ends. They are asking for hot water, so the problem is in the boiler or hot water system, which we don’t monitor or control.',
    'Your heating controls are already asking for hot water, so the problem is in the boiler or hot water system, which Lighthouse doesn’t monitor or control. Please contact your own boiler or service engineer through your usual route. ' + NOTE,
    'Hot water at time of call: switched on at the controls.'],
  ['off-v1', 'Hot water setting: switched off (no end time)', 'Hot water has been switched off at the controls', 'Switched off',
    'That is the likely reason there is no hot water. These controls don’t say when it ends, and we can’t change it from here.',
    'Your hot water has been switched off at the heating controls. It can be switched back on at those controls on site, or your own service engineer can help. We can’t change it from here. ' + NOTE,
    'Hot water at time of call: switched off at the controls.'],
  ['cc-stale', 'Hot water setting: controls not reporting', 'We can’t see the hot water setting right now', 'Can’t confirm',
    'The heating controls last reported 3 hours ago. Don’t tell the customer whether the hot water is on or off.',
    'I can’t see your hot water setting from here at the moment, and Lighthouse doesn’t control hot water, so please contact your own boiler or service engineer through your usual route. ' + NOTE,
    'Hot water at time of call: could not be confirmed (heating controls last reported 3 hours ago).'],
  ['cc-notreconf', 'Hot water setting: not confirmed recently', 'We can’t see the hot water setting right now', 'Can’t confirm',
    'The heating controls haven’t confirmed the hot water setting recently. Don’t tell the customer whether the hot water is on or off.',
    'I can’t see your hot water setting from here at the moment, and Lighthouse doesn’t control hot water, so please contact your own boiler or service engineer through your usual route. ' + NOTE,
    'Hot water at time of call: could not be confirmed (heating controls haven’t confirmed it recently).'],
  ['cc-decode', 'Hot water setting: reading doesn’t make sense', 'We can’t see the hot water setting right now', 'Can’t confirm',
    'The hot water reading from the heating controls doesn’t make sense right now. Don’t tell the customer whether the hot water is on or off.',
    'I can’t see your hot water setting from here at the moment, and Lighthouse doesn’t control hot water, so please contact your own boiler or service engineer through your usual route. ' + NOTE,
    'Hot water at time of call: could not be confirmed (reading doesn’t make sense).']
];
for (const [k, title, hd, tag, gtk, say, ts] of DHW) {
  add({ id: 'HW-0-dhw-' + k, flow: 'Hot water', title: title + ' (straight to the outcome)', ref: 'flows.js:560-675 (+ twin services/tb-device.js dhwOverrideOutcome)', kind: 'outcome', was: ['HW-0-dhw-' + k],
    done: 'Hot water: we don’t control it from here', hd, tag, gtk, say, ticketSentence: ts,
    log: { type: 'scope-only', closed: true, subject: HWSUBJ, detail: HWDET + ' ' + ts } });
}
add({ id: 'HW-nlh', flow: 'Hot water', title: 'Hot water not on Lighthouse (first screen and outcome merged)', ref: 'flows.js:1777-1781 and 1803-1811', kind: 'outcome', was: ['HW-0-nlh', 'HW-nlh'],
  done: 'Hot water: not on Lighthouse at this site',
  hd: 'Hot water here isn’t on Lighthouse',
  say: 'Your hot water isn’t monitored or controlled by Lighthouse, so please contact your own boiler or service engineer through your usual route. ' + NOTE,
  gtk: CLOSEDGTK,
  log: { type: 'scope-only', closed: true, subject: 'Hot water: not on Lighthouse, customer referred to their own engineer', detail: 'Customer reports a hot water problem. Hot water at this site is not monitored or controlled by Lighthouse. Customer told to contact their own boiler or service engineer. Saved as a closed ticket for the record.' } });
REMOVED['HW-cap'] = 'Removed (D5, D7). The agent no longer chooses between “log it” and “boiler advice”. Every hot water screen is now one closed note telling the customer to contact their own service engineer (rows HW-0 and HW-0-dhw-*).';
REMOVED['HW-sc'] = 'Removed (D5, D7). “It sounds like the boiler itself” was the agent’s judgement. The hot water setting rows now say what the data shows, and every call ends on one closed note.';

/* ============================== KITCHEN (D5, D6, D8) ============================== */
const NOWQ = [['Yes, it’s needed now', 'K-crit'], ['No, it can wait', 'K-ncrit']];
const CAMEON = [['Yes, it’s on now', 'K-override-ok', true], ['No, it’s still off', 'K-override-fail']];
const APPL = (sayLead) => sayLead + ' That means it’s a fault with the appliance itself, which Lighthouse doesn’t monitor or control, so please contact your own repairs engineer through your usual route. ' + NOTE;
const APPLSUBJ = 'Kitchen appliance fault: customer referred to their own repairs engineer';
add({ id: 'K-none', flow: 'Kitchen', title: 'No kitchen equipment on Lighthouse here (new: was a dead end)', ref: 'flows.js:1849', kind: 'outcome',
  done: 'Kitchen equipment: not on Lighthouse at this site',
  hd: 'Kitchen equipment here isn’t on Lighthouse',
  say: 'Your kitchen equipment isn’t monitored or controlled by Lighthouse, so please contact your own repairs engineer through your usual route. ' + NOTE,
  gtk: CLOSEDGTK,
  log: { type: 'scope-only', closed: true, subject: 'Kitchen equipment: not on Lighthouse, customer referred to their own engineer', detail: 'Customer reports a kitchen equipment problem. No kitchen equipment at this site is monitored or controlled by Lighthouse. Customer told to contact their own repairs engineer. Saved as a closed ticket for the record.' } });
add({ id: 'K-what', flow: 'Kitchen', title: 'What does the customer need? (new first question when we can read the kitchen)', ref: 'flows.js:1863-1886', kind: 'step',
  q: 'Ask the customer: is the equipment not working, or do you need it on at a different time?',
  chips: [['It’s not working', 'K-picker'], ['I need it at a different time', 'K-when']] });
add({ id: 'K-legacy-0', flow: 'Kitchen', title: 'First screen (we can’t read this kitchen’s equipment)', ref: 'flows.js:1855-1861', kind: 'step', was: ['K-legacy-0'],
  done: 'Kitchen equipment: we can reach it',
  q: 'Ask the customer: is the kitchen needed for service right now (food being served or hotel breakfast)?', chips: [['Yes, it’s needed now', 'K-crit'], ['No, it can wait', 'K-when-unknown']] });
add({ id: 'K-crit', flow: 'Kitchen', title: 'P1: kitchen off during service', ref: 'flows.js:1892-1899 and 2051-2058', kind: 'p1', was: ['K-crit'],
  hd: 'Kitchen off during service: raise a P1',
  gtk: 'It can’t be switched on from here, so the on-duty manager needs to call the site back.',
  sayAfter: D2 + ' In the meantime, the manual control button on the PowerPause unit, if you have one, is safe to use.',
  log: { type: 'escalate-p1', subject: 'Kitchen equipment off during service — P1 (unchanged)', detail: 'Kitchen equipment off while the site is serving food. It can’t be switched from here; needs immediate IoT helpdesk action.' } });
add({ id: 'K-when-unknown', flow: 'Kitchen', title: 'Needed at a different time, but we can’t read its times (D8 fallback)', ref: 'flows.js:1901-1908 and 2060-2067', kind: 'step',
  done: 'Needed at a different time',
  hd: 'We can’t see this equipment’s timetable right now',
  say: 'I can’t see your kitchen equipment’s timetable from here at the moment, so I can’t set up a one-off change tonight. I’ll log exactly when you need it, and our team will sort it with you on the next working day. If you need it on before then, pressing the manual control button on the PowerPause unit once brings it on until its next timetable change.',
  gtk: 'A one-off change is only offered when we can read the equipment’s next on and off times (see section 8).',
  field: 'When does the customer need it on? (e.g. until 1am tonight for a deep clean)', chips: [['Next', 'K-ncrit', true]] });
add({ id: 'K-ncrit', flow: 'Kitchen', title: 'Outcome: different times needed, logged for our team', ref: 'flows.js:1901-1908 and 2060-2067', kind: 'outcome', was: ['K-ncrit'],
  done: 'Customer needs it at: until 1am tonight for a deep clean',
  hd: 'Different times needed: logged for our team',
  say: 'I’ll log exactly when you need it, and our team will sort the times with you on the next working day.',
  log: { type: 'capture', subject: 'Kitchen equipment: different times needed', detail: 'Customer needs kitchen equipment at different times: until 1am tonight for a deep clean. No one-off change was made from here. Logged for the IoT helpdesk.' } });
add({ id: 'K-picker', flow: 'Kitchen', title: 'Which equipment (several circuits)', ref: 'flows.js:1881-1886', kind: 'step', was: ['K-picker'],
  q: 'Which bit of kitchen equipment is it?', chips: [['Fryer', 'K-vA'], ['Glass washer', 'K-vB'], ['Dishwasher', 'K-vD'], ['Pot wash', 'K-vE'], ['Bain-marie', 'K-vC'], ['Several or all of it', 'K-all']] });
add({ id: 'K-vA', flow: 'Kitchen', title: 'Off, but should have come on', ref: 'flows.js:1950-1953', kind: 'step', was: ['K-vA'],
  hd: 'The fryer is off, but its timetable says it should have come on at 11:30',
  say: 'Your fryer is off, but it should have come on at 11:30, so it looks like it hasn’t started by itself. The PowerPause unit has a manual control button on the front. Could you press it once now?',
  fact: 'Checked at 19:42: the fryer is off; its timetable has it on since 11:30.', q: 'Ask the customer: has it come on?', chips: CAMEON });
add({ id: 'K-vB', flow: 'Kitchen', title: 'On, as its timetable expects (now goes straight to the outcome)', ref: 'flows.js:1954-1957', kind: 'outcome', was: ['K-vB'],
  done: 'The glass washer has power',
  hd: 'The glass washer has power, as its timetable expects, until 23:00',
  say: APPL('Your glass washer has power and its timetable says it should be on.'),
  gtk: CLOSEDGTK,
  fact: 'Checked at 19:42: the glass washer is on; its timetable has it on from 11:30 until 23:00.',
  log: { type: 'scope-only', closed: true, subject: APPLSUBJ, detail: 'Power is reaching the glass washer, so the fault is in the appliance, which Lighthouse doesn’t monitor or control. Customer told to contact their own repairs engineer. Checked at 19:42: the glass washer is on; its timetable has it on from 11:30 until 23:00.' } });
add({ id: 'K-vB-unscheduled', flow: 'Kitchen', title: 'On, no timetable (straight to the outcome)', ref: 'flows.js:1970-1973', kind: 'outcome', inj: true, was: ['K-vB-unscheduled'],
  done: 'The glass washer has power',
  hd: 'The glass washer has power (it has no timetable, so it stays on)',
  say: APPL('Your glass washer has power. It doesn’t have a timetable, so it’s meant to stay on.'),
  gtk: CLOSEDGTK,
  fact: 'Checked at 19:42: the glass washer is on; it has no timetable.',
  log: { type: 'scope-only', closed: true, subject: APPLSUBJ, detail: 'Power is reaching the glass washer (no timetable, meant to stay on), so the fault is in the appliance. Customer told to contact their own repairs engineer. Checked at 19:42: the glass washer is on; it has no timetable.' } });
add({ id: 'K-vB-outside', flow: 'Kitchen', title: 'On outside its set times (straight to the outcome)', ref: 'flows.js:1974-1977', kind: 'outcome', inj: true, was: ['K-vB-outside'],
  done: 'The glass washer has power',
  hd: 'The glass washer has power outside its set times',
  say: APPL('Your glass washer has power. It’s outside its usual times, so someone has probably switched it on by hand at the PowerPause unit.'),
  gtk: 'Next timetable change: off at 23:00. ' + CLOSEDGTK,
  fact: 'Checked at 19:42: the glass washer is on; its timetable has it off since 15:00.',
  log: { type: 'scope-only', closed: true, subject: APPLSUBJ, detail: 'Power is reaching the glass washer outside its set times (probably switched on by hand), so the fault is in the appliance. Customer told to contact their own repairs engineer. Checked at 19:42: the glass washer is on; its timetable has it off since 15:00.' } });
add({ id: 'K-vC', flow: 'Kitchen', title: 'Off, as its timetable expects', ref: 'flows.js:1958-1961', kind: 'step', was: ['K-vC'],
  hd: 'The bain-marie is off, as its timetable expects, until 17:00',
  say: 'Your bain-marie is off because that’s what its timetable says at this time of day. It’s due to come on at 17:00. Do you need it on before then?',
  fact: 'Checked at 15:42: the bain-marie is off; its timetable has it off until 17:00.',
  q: 'Ask the customer: do you need it on before 17:00?',
  chips: [['Yes, right now', 'K-vC-now'], ['Yes, a bit before 17:00', 'K-earlier'], ['No, 17:00 is fine', 'K-fine']] });
add({ id: 'K-vC-now', flow: 'Kitchen', title: 'Needed on right now: the manual control button (new)', ref: 'flows.js:1958-1961', kind: 'step',
  done: 'Needed on right now',
  hd: 'Bring the bain-marie on now with the manual control button',
  say: 'Please press the manual control button on the front of the PowerPause unit once. It brings the bain-marie on now, and it goes back to its normal timetable at its next change.',
  q: 'Ask the customer: has it come on?', chips: CAMEON });
add({ id: 'K-vD', flow: 'Kitchen', title: 'Off, but meant to stay on', ref: 'flows.js:1962-1965', kind: 'step', was: ['K-vD'],
  hd: 'The dishwasher is off, but it’s meant to stay on',
  say: 'That circuit doesn’t have a timetable, so it’s meant to stay on. It looks like it may have tripped. Could you check your fuse board while I wait? If a switch has tripped, resetting it should bring it back.',
  fact: 'Checked at 19:42: the dishwasher is off; it has no timetable.',
  q: 'Ask the customer: has it come back on?', chips: [['Yes, it’s back on', 'K-fuse-fixed', true], ['No, it’s still off', 'K-fuse-fail']] });
add({ id: 'K-vE', flow: 'Kitchen', title: 'On, but using no power (straight to the outcome)', ref: 'flows.js:1966-1969', kind: 'outcome', was: ['K-vE'],
  done: 'The pot wash has power but isn’t using any',
  hd: 'The pot wash has power but isn’t using any',
  say: APPL('Power is reaching your pot wash but it isn’t using any.'),
  gtk: 'The circuit is on but the appliance draws nothing, so it may have tripped inside or been switched off at the unit. ' + CLOSEDGTK,
  fact: 'Checked at 19:42: the pot wash is on but using no power.',
  log: { type: 'scope-only', closed: true, subject: APPLSUBJ, detail: 'Power is reaching the pot wash but it draws nothing, so the fault is in the appliance. Customer told to contact their own repairs engineer. Checked at 19:42: the pot wash is on but using no power.' } });
add({ id: 'K-voff-unknown', flow: 'Kitchen', title: 'Off, timetable can’t be read', ref: 'flows.js:1978-1981', kind: 'step', inj: true, was: ['K-voff-unknown'],
  hd: 'The glass washer is off, and we can’t read its timetable',
  say: 'Your glass washer is off, but I can’t see its timetable right now. The PowerPause unit has a manual control button on the front. Could you press it once now?',
  fact: 'Checked at 19:42: the glass washer is off; its timetable couldn’t be read.', q: 'Ask the customer: has it come on?', chips: CAMEON });
add({ id: 'K-vfallback', flow: 'Kitchen', title: 'Live reading not available', ref: 'flows.js:1941-1945', kind: 'step', inj: true, was: ['K-vfallback'],
  hd: 'We can’t read the kitchen equipment right now', q: 'Ask the customer: is the kitchen needed for service right now (food being served or hotel breakfast)?', chips: [['Yes, it’s needed now', 'K-crit'], ['No, it can wait', 'K-when-unknown']] });
add({ id: 'K-all', flow: 'Kitchen', title: 'Several or all of it (summary)', ref: 'flows.js:2071-2088', kind: 'step', was: ['K-all'],
  list: ['Fryer: off, should be on', 'Glass washer: on', 'Dishwasher: off, should stay on', 'Pot wash: on, but using no power', 'Bain-marie: off until its set time'],
  hd: 'The fryer is off, but its timetable says it should have come on at 11:30',
  say: 'Your fryer is off, but it should have come on at 11:30, so it looks like it hasn’t started by itself. The PowerPause unit has a manual control button on the front. Could you press it once now?',
  fact: 'Checked at 19:42: the fryer is off; its timetable has it on since 11:30.', q: 'Ask the customer: has it come on?', chips: CAMEON });
add({ id: 'K-override-ok', flow: 'Kitchen', title: 'Outcome: came on with the manual control button', ref: 'flows.js:2000-2013', kind: 'outcome', was: ['K-override-ok'],
  done: 'It came on with the manual control button',
  hd: 'Sorted on site with the manual control button',
  say: 'That’s sorted. I’ll log it so our team can check its timetable on the next working day.',
  log: { type: 'capture', subject: 'Kitchen circuit sorted on site with the manual control button', detail: 'Kitchen circuit didn’t come on at its set time; customer sorted it with the PowerPause manual control button. Checked at 19:42: the fryer is off; its timetable has it on since 11:30.' } });
add({ id: 'K-fuse-fixed', flow: 'Kitchen', title: 'Outcome: back on after the fuse board reset', ref: 'flows.js:2019-2027', kind: 'outcome', was: ['K-fuse-fixed'],
  done: 'It came back on after the fuse board reset',
  hd: 'Sorted on site: the fuse board had tripped',
  say: 'Glad that’s sorted. I’ll log it so our team can check why it tripped.',
  log: { type: 'capture', subject: 'Kitchen circuit tripped, fixed on site', detail: 'Kitchen circuit that should stay on had tripped; reset on site. Checked at 19:42: the dishwasher is off; it has no timetable.' } });
for (const [k, done] of [['override-fail', 'It didn’t come on with the manual control button'], ['fuse-fail', 'The fuse board is fine and it’s still off']]) {
  add({ id: 'K-' + k, flow: 'Kitchen', title: 'Follow-up: is it needed now? (' + done + ')', ref: 'flows.js:2014-2045', kind: 'step', was: ['K-' + k], done,
    q: 'Ask the customer: is the kitchen needed for service right now?', chips: NOWQ });
}
REMOVED['K-repairs'] = 'Removed (D5, D6). “Site will contact their repairs team” was an agent choice. When power is reaching the appliance the system now decides: it is an appliance fault, and the card itself is the closed outcome (rows K-vB, K-vB-unscheduled, K-vB-outside, K-vE).';
REMOVED['K-still-ours'] = 'Removed (D5). “Customer still thinks it’s our problem” was not a question the customer answers. Power reaching the appliance means the fault is the appliance’s (closed outcome, D6).';

/* ---------- D8: one-off change for the next occasion (never writes the timetable) ---------- */
add({ id: 'K-when', flow: 'Kitchen', title: 'Needed at a different time: its next times (new, D8)', ref: 'flows.js:1932-1934 (tuya.schedule nextOn / nextOff)', kind: 'step',
  done: 'Needed at a different time',
  hd: 'The fryer goes off at 23:00 tonight and comes on again at 07:00 tomorrow',
  say: 'Your fryer’s timetable switches it off at 23:00 tonight and back on at 07:00 tomorrow. Do those times work for you, or do you need it at a different time?',
  gtk: 'We can set up a one-off change for the next time only. It never changes the timetable.',
  fact: 'Checked at 19:42: the fryer is on; its timetable has it off at 23:00 and on again at 07:00 tomorrow.',
  q: 'What does the customer need?',
  chips: [['Those times are fine', 'K-fine'], ['On later tonight', 'K-later'], ['On earlier tomorrow', 'K-earlier'], ['Different times every day', 'K-perm']] });
add({ id: 'K-fine', flow: 'Kitchen', title: 'Outcome: its normal times are fine (new)', ref: 'new', kind: 'outcome',
  done: 'Its normal times are fine',
  hd: 'Its normal times work for the customer',
  say: 'Great, then nothing needs changing, and it’ll come on at 07:00 tomorrow as usual. ' + NOTE,
  gtk: 'Nothing for our team to do, so the ticket is saved already closed, for the record only.',
  log: { type: 'scope-only', closed: true, subject: 'Kitchen times checked with the customer: no change needed', detail: 'Customer asked about the fryer’s times. Next times read out (off 23:00 tonight, on 07:00 tomorrow); the customer is happy with them. Nothing changed. Saved as a closed ticket for the record.' } });
add({ id: 'K-later', flow: 'Kitchen', title: 'On later tonight: how long? (new)', ref: 'new', kind: 'step',
  done: 'Needed on later tonight',
  q: 'Ask the customer: how long after 23:00 do you need it on?',
  gtk: 'Up to 2 hours past its normal off time, tonight only.',
  chips: [['Until 23:30', 'K-attend-later'], ['Until midnight', 'K-attend-later'], ['Until 1am', 'K-attend-later']] });
add({ id: 'K-earlier', flow: 'Kitchen', title: 'On earlier: what time? (new)', ref: 'new', kind: 'step',
  done: 'Needed on earlier tomorrow',
  q: 'Ask the customer: what time do you need it on tomorrow?',
  gtk: 'Up to 2 hours before its normal on time (07:00), for the next time only.',
  note: 'From the bain-marie card the times offered are before its next on time (17:00): 16:30, 16:00 and 15:00.',
  chips: [['06:30', 'K-attend-earlier'], ['06:00', 'K-attend-earlier'], ['05:00', 'K-attend-earlier']] });
for (const [k, nx] of [['later', 'K-confirm-later'], ['earlier', 'K-confirm-earlier']]) {
  add({ id: 'K-attend-' + k, flow: 'Kitchen', title: 'Safety check: will someone be there? (' + (k === 'later' ? 'on later' : 'on earlier') + ', new)', ref: 'new', kind: 'step',
    done: k === 'later' ? 'Needed on until midnight tonight' : 'Needed on from 06:00 tomorrow',
    q: 'Ask the customer: will someone be in the kitchen while it’s on?',
    gtk: 'We only switch kitchen equipment on when someone will be there.',
    chips: [['Yes, someone will be there', nx, true], ['No, nobody will be there', 'K-attend-no']] });
}
add({ id: 'K-attend-no', flow: 'Kitchen', title: 'Outcome: nobody will be there, so no one-off (new)', ref: 'new', kind: 'outcome',
  done: 'Nobody will be in the kitchen',
  hd: 'No one-off: nobody will be in the kitchen',
  say: 'For safety we only switch kitchen equipment on when someone will be there, so I won’t set that up. I’ll log what you need, and our team will look at the times with you on the next working day.',
  log: { type: 'capture', subject: 'Kitchen equipment: different times needed', detail: 'Customer asked for the fryer on until midnight tonight; nobody will be in the kitchen then, so no one-off was set up. Logged for the IoT helpdesk to agree times.' } });
add({ id: 'K-confirm-later', flow: 'Kitchen', title: 'Check before booking: on later (new)', ref: 'new', kind: 'step',
  hd: 'Check before booking: the fryer stays on until midnight tonight',
  lines: ['The Wheatsheaf · 7412 → Fryer', 'At 23:00 its timetable switches it off as usual. Within about 2 minutes we switch it back on, and at midnight we switch it off again.', 'Tomorrow it carries on with its normal times. The timetable itself isn’t changed.'],
  gtk: 'Booking only means our system has accepted it. Each switch is shown as done only when the fryer confirms it.',
  chips: [['Book it', 'K-booked-later', true], ['Change the time', 'K-later']] });
add({ id: 'K-confirm-earlier', flow: 'Kitchen', title: 'Check before booking: on earlier (new)', ref: 'new', kind: 'step',
  hd: 'Check before booking: the fryer comes on at 06:00 tomorrow',
  lines: ['The Wheatsheaf · 7412 → Fryer', 'At 06:00 tomorrow we switch it on. At 07:00 its timetable carries on as normal.', 'This is for tomorrow only. The timetable itself isn’t changed.'],
  gtk: 'Booking only means our system has accepted it. The switch is shown as done only when the fryer confirms it.',
  chips: [['Book it', 'K-booked-earlier', true], ['Change the time', 'K-earlier']] });
add({ id: 'K-booked-later', flow: 'Kitchen', title: 'Result: booked, on until midnight (new)', ref: 'new', kind: 'ctlout',
  hd: 'Booked: the fryer stays on until midnight tonight',
  body: 'Booked at 19:44. Just after 23:00 we switch it back on, and at midnight we switch it off. Its timetable isn’t changed. Nothing has been switched yet.',
  say: 'That’s booked. Your fryer will go off at 23:00 as usual, come back on within about two minutes, and stay on until midnight. Please still switch the fryer off at the fryer itself when you’ve finished with it. Tomorrow it carries on with its normal times. I’ve logged it, and our team will check on the next working day whether you need the times changed for good.',
  foot: 'Logged on ticket #48219 for the IoT helpdesk (reviewed next working day).',
  chips: [['Cancel this booking', 'K-cancelled']] });
add({ id: 'K-booked-earlier', flow: 'Kitchen', title: 'Result: booked, on at 06:00 tomorrow (new)', ref: 'new', kind: 'ctlout',
  hd: 'Booked: the fryer comes on at 06:00 tomorrow',
  body: 'Booked at 19:44. At 06:00 tomorrow we switch it on; at 07:00 its timetable carries on as normal. Nothing has been switched yet.',
  say: 'That’s booked. Your fryer will come on at 06:00 tomorrow instead of 07:00, then carry on with its normal times. I’ve logged it, and our team will check on the next working day whether you need the times changed for good.',
  foot: 'Logged on ticket #48220 for the IoT helpdesk (reviewed next working day).',
  chips: [['Cancel this booking', 'K-cancelled']] });
add({ id: 'K-book-fail', flow: 'Kitchen', title: 'Result: couldn’t book it (new)', ref: 'new', kind: 'ctlout',
  hd: 'Not booked: the fryer isn’t responding',
  alert: 'We couldn’t set that up: the fryer isn’t responding right now. Nothing has been booked and nothing will be switched.',
  say: 'I can’t set that up from here at the moment, so nothing will change tonight. I’ll log exactly what you need, and our team will sort it with you on the next working day.',
  chips: [['Log it for the IoT helpdesk', 'K-ncrit', true]] });
add({ id: 'K-cancelled', flow: 'Kitchen', title: 'Result: booking cancelled (new)', ref: 'new', kind: 'ctlout',
  hd: 'Cancelled: nothing will be switched',
  body: 'The one-off for the fryer is cancelled. It keeps to its normal times.',
  say: 'I’ve cancelled that, so your fryer will keep to its normal times. I’ve added that to the ticket.',
  foot: 'Added to ticket #48219.',
  note: 'If it is cancelled while the fryer is already on for the one-off, it is switched off now and only shown as off once the fryer confirms it.' });
add({ id: 'K-banner', flow: 'Kitchen', title: 'Site screen while a one-off is booked (new)', ref: 'new', kind: 'step',
  banner: '⏱ Fryer: booked to stay on until midnight tonight (ticket #48219). [Cancel]',
  gtk: 'Shown at the top of the site screen for anyone who takes a call from this site until the one-off has finished.',
  q: 'What is the customer reporting?', chips: [['Cancel the booking', 'K-cancelled']] });
add({ id: 'K-perm', flow: 'Kitchen', title: 'Outcome: different times every day (new)', ref: 'new', kind: 'outcome',
  done: 'Needs different times every day',
  hd: 'Different times every day: logged for our team',
  say: 'Changing its regular times is something our team sorts with you, so I’ll log exactly what you need and they’ll be in touch on the next working day.',
  field: 'What times does the customer need?',
  log: { type: 'capture', subject: 'Kitchen equipment: timetable change requested', detail: 'Customer wants the fryer’s regular times changed: on from 06:00 on weekdays. Timetables are never changed from here; logged for the IoT helpdesk.' } });

/* ============================== LIGHTING (D5, D6) ============================== */
const LQ = [['Yes, they’re on', 'L-ok', true], ['No, they’re still off', 'L-p1']];
add({ id: 'L-none', flow: 'Outside lighting', title: 'Outside lighting not on Lighthouse here (new: was a dead end)', ref: 'flows.js:2107', kind: 'outcome',
  done: 'Outside lights: not on Lighthouse at this site',
  hd: 'Outside lighting here isn’t on Lighthouse',
  say: 'Your outside lights aren’t monitored or controlled by Lighthouse, so please contact your own electrician or maintenance contractor through your usual route. ' + NOTE,
  gtk: CLOSEDGTK,
  log: { type: 'scope-only', closed: true, subject: 'Outside lighting: not on Lighthouse, customer referred to their own contractor', detail: 'Customer reports an outside lighting problem. Outside lighting at this site is not monitored or controlled by Lighthouse. Customer told to contact their own electrician or contractor. Saved as a closed ticket for the record.' } });
add({ id: 'L-0-online', flow: 'Outside lighting', title: 'First screen (can’t switch from here)', ref: 'flows.js:2104-2118', kind: 'step', was: ['L-0-online'],
  done: 'Outside lights: the lighting controller is online',
  hd: 'We can’t switch the outside lights from here',
  say: 'Your outside lights have a sensor that turns them on by itself at dusk, so they normally look after themselves. If they haven’t come on tonight, please flip the Lighthouse lighting switch on site to turn them on by hand. That only covers tonight. The sensor takes over again by itself from tomorrow, so there’s nothing to reset.',
  gtk: 'Switching outside lights from here isn’t available at this site yet.', q: 'Ask the customer: are the lights on now?', chips: LQ });
add({ id: 'L-0-offline', flow: 'Outside lighting', title: 'First screen (lighting controller not responding)', ref: 'flows.js:2104-2118', kind: 'step', was: ['L-0-offline'],
  done: 'Outside lights: the lighting controller isn’t responding',
  hd: 'The outside lighting controller isn’t responding',
  say: 'Your outside lights have a sensor that turns them on by itself at dusk. The lighting controller isn’t responding at the moment, which is usually a tripped switch on the fuse board, so please check that first. If the fuse board looks fine, flip the Lighthouse lighting switch on site to turn the lights on by hand. That only covers tonight; the sensor takes over again from tomorrow.',
  gtk: 'A controller that isn’t responding often means a tripped fuse board.', q: 'Ask the customer: are the lights on now?', chips: LQ });
add({ id: 'L-0-switch', flow: 'Outside lighting', title: 'First screen (can switch from here)', ref: 'flows.js:2108-2118', kind: 'step', was: ['L-0-switch'],
  done: 'Outside lights: the lighting controller is online',
  rows: [['Car park lights: currently off', 'Turn on']],
  hd: 'You can switch the outside lights from here',
  say: 'Your outside lights normally come on by themselves at dusk. I can switch them on from here for you now.',
  gtk: 'Use the Turn on button above. It only counts as done once the lights confirm it.', note: 'The circuit row no longer shows the device code.',
  q: 'Ask the customer: are the lights on now?', chips: LQ });
add({ id: 'L-ok', flow: 'Outside lighting', title: 'Outcome: lights on', ref: 'flows.js:2121-2129', kind: 'outcome', was: ['L-ok'],
  done: 'The lights are on now',
  hd: 'Outside lights on after the on-site switch',
  say: 'Great, that’s them on. I’ll still log it so our team can check why they didn’t come on by themselves.',
  log: { type: 'capture', subject: 'Outside lights: turned on by hand on site', detail: 'Customer turned the outside lights on with the on-site switch after guidance. Logged so the IoT helpdesk can check why they didn’t come on by themselves.' } });
add({ id: 'L-p1', flow: 'Outside lighting', title: 'P1: lights still off', ref: 'flows.js:2130-2136', kind: 'p1', was: ['L-p1'],
  done: 'The lights are still off',
  hd: 'Outside lights still off: raise a P1',
  gtk: 'It may be the electrical supply rather than the lighting control, so the on-duty manager will call the site back.',
  sayAfter: D2 + ' If the dark frontage is a safety concern right now, your site’s duty-manager procedure for calling out an electrician still applies, as this may be an electrical supply issue rather than the lighting control.',
  log: { type: 'escalate-p1', subject: 'External lighting not working — P1 (unchanged)', detail: 'Outside lights still off after the on-site switch; possibly a tripped supply or a failed controller. Can’t be switched from here; needs urgent IoT helpdesk or electrical follow-up.' } });

/* ============================== FANS (D5, D6) ============================== */
add({ id: 'FAN-none', flow: 'Extractor fans', title: 'Extractor fans not on Lighthouse here (new: was a dead end)', ref: 'flows.js:2147', kind: 'outcome',
  done: 'Extractor fans: not on Lighthouse at this site',
  hd: 'Extractor fans here aren’t on Lighthouse',
  say: 'Your extractor fans aren’t monitored or controlled by Lighthouse, so please contact your own ventilation or maintenance contractor through your usual route. ' + NOTE,
  gtk: CLOSEDGTK,
  log: { type: 'scope-only', closed: true, subject: 'Extractor fans: not on Lighthouse, customer referred to their own contractor', detail: 'Customer reports an extractor fan problem. Extractor fans at this site are not monitored or controlled by Lighthouse. Customer told to contact their own contractor. Saved as a closed ticket for the record.' } });
add({ id: 'FAN-0', flow: 'Extractor fans', title: 'First screen (can’t switch from here)', ref: 'flows.js:2157-2159', kind: 'step', was: ['FAN-0'],
  done: 'Extractor fans: the controller is online',
  hd: 'We can’t switch the extractor fans from here',
  gtk: 'Fan control from here isn’t available at this site yet. Write down exactly what the customer says.',
  field: 'Ask the customer: what do you need the fans to do, and until when?', chips: [['Next', 'FAN-cap', true]] });
add({ id: 'FAN-0-switch', flow: 'Extractor fans', title: 'First screen (can switch from here)', ref: 'flows.js:2148-2156', kind: 'step', inj: true, was: ['FAN-0-switch'],
  done: 'Extractor fans: the controller is online',
  rows: [['Kitchen extractor fans: currently on', 'Turn off']],
  hd: 'You can switch the extractor fans from here',
  gtk: 'Use the button above. It only counts as done once the fans confirm it.',
  field: 'Ask the customer: do you need different times? (optional)', chips: [['Next', 'FAN-cap', true]] });
add({ id: 'FAN-cap', flow: 'Extractor fans', title: 'Outcome: request logged', ref: 'flows.js:2161-2168', kind: 'outcome', was: ['FAN-cap'],
  done: 'Request: fans on until 1am for a deep clean',
  hd: 'Fan request noted for the IoT helpdesk',
  say: 'I’ll log exactly what you need, with the times, and our team will sort it. If the fans are needed for cooking safety right now, please use the manual switch on site.',
  log: { type: 'capture', subject: 'Extractor fan request', detail: 'Customer request: fans on until 1am for a deep clean. Fans can’t be changed from here out of hours; logged for the IoT helpdesk.' } });

/* ============================== FRIDGES (D6: never a P1) ============================== */
add({ id: 'FR-0', flow: 'Fridges and freezers', title: 'Fridges and freezers (now one closed outcome, never a P1)', ref: 'flows.js:2174-2194', kind: 'outcome', was: ['FR-0'],
  done: 'Fridges and freezers: we watch temperatures but don’t control or repair them',
  hd: 'We watch fridge temperatures but don’t control or repair the fridges',
  say: 'Lighthouse keeps an eye on your fridge and freezer temperatures, but it doesn’t control or repair the fridges themselves, so please contact your own refrigeration engineer through your usual route. If stock is at risk, move it to a working fridge or freezer if you can. ' + NOTE,
  gtk: 'This is never a P1, even with stock at risk (your D6). The ticket is saved already closed, for the record only.',
  log: { type: 'scope-only', closed: true, subject: 'Fridge or freezer: customer referred to their own refrigeration engineer', detail: 'Customer reports a fridge or freezer problem. Lighthouse monitors temperatures only and doesn’t control or repair the appliances. Customer told to contact their own refrigeration engineer. Saved as a closed ticket for the record.' } });
REMOVED['FR-risk'] = 'Removed (D6). A fridge or freezer problem is no longer a P1, even with stock at risk. It ends on the closed note in row FR-0. The P1 sentence count drops from 7 to 6 (section 10, B13).';
REMOVED['FR-q'] = 'Removed (D5, D6). “Stock at risk / just a question” no longer changes the outcome, so there is no question. Row FR-0 is the single closed outcome.';

/* ============================== CONNECTION CHECK (D10: reached only by automatic divert) ============================== */
add({ id: 'CN-devoff', flow: 'Connection check', title: 'Diverted here: the equipment is offline but the site is online (new: was “Everything at this site is online”)', ref: 'flows.js:2267-2268', kind: 'step', was: ['CN-allonline', 'CN-devoff'],
  done: 'Connection check: the bar thermostat isn’t responding; the site is online',
  hd: 'The bar thermostat isn’t responding, but the rest of the site is online',
  say: 'Your bar thermostat has lost its connection to us, so I can’t see or change it from here at the moment. Could you check it has power, and that nothing on the fuse board has tripped?',
  gtk: 'The site’s Lighthouse unit is online; only this piece of equipment is down.',
  q: 'Ask the customer: is it working now?', chips: [['Yes, it’s working now', 'CN-back', true], ['No, it’s still not working', 'CN-dcap']],
  note: 'On “Yes” the dashboard checks the connection again. If the equipment is still offline it shows the “not responding” outcome instead.' });
REMOVED['CN-report'] = 'Removed (D10). The connection check is no longer started by hand, so the “everything is online” screen can’t be reached. Its replacement for the divert case is row CN-devoff.';
add({ id: 'CN-anchoroff', flow: 'Connection check', title: 'Lighthouse unit offline', ref: 'flows.js:2239-2244', kind: 'step', was: ['CN-anchoroff'],
  done: 'Connection check: the Lighthouse unit on the wall is offline',
  hd: 'The Lighthouse unit at this site is offline',
  gtk: 'It’s the wall-mounted unit that connects the site. Nothing can be changed from here while it’s down. It’s usually power or internet at the site.',
  say: 'The Lighthouse unit on your wall isn’t responding, which normally means it’s lost power or internet. Could you check the fuse board hasn’t tripped, that the unit has lights on, and that the router is on? I’ll stay on the line.',
  q: 'Ask the customer: are there lights on the Lighthouse unit now?', chips: [['Yes, the lights are on', 'CN-back', true], ['No, still no lights', 'CN-cap']],
  note: 'On “Yes” the dashboard checks the connection again. If the unit is still offline it shows the “still offline” outcome instead.' });
add({ id: 'CN-back', flow: 'Connection check', title: 'Outcome: back online during the call', ref: 'flows.js:2272-2280', kind: 'outcome', was: ['CN-back'],
  done: 'Back online after the customer’s checks',
  hd: 'Back online after the customer’s checks',
  say: 'That’s it back online. Give it ten minutes to settle. I’ll log it so our team can check it stays healthy overnight.',
  log: { type: 'capture', subject: 'Lighthouse unit offline: back online during the call', detail: 'The Lighthouse unit was offline; the customer checked the fuse board and power and it came back. Logged for the IoT helpdesk to check it stays online overnight.' } });
add({ id: 'CN-cap', flow: 'Connection check', title: 'Outcome: Lighthouse unit still offline', ref: 'flows.js:2302-2307', kind: 'outcome', was: ['CN-cap'],
  done: 'Still offline after the customer’s checks',
  hd: 'The Lighthouse unit is still offline',
  say: 'I can’t fix this from here while the Lighthouse unit is offline, so I’ll log it as a priority for our team. Anything electrical, like a tripped switch that won’t reset, is one for your own electrician tonight.',
  log: { type: 'capture', subject: 'Lighthouse unit offline: equipment can’t be reached', detail: 'Equipment can’t be reached after the customer’s power and router checks. Nothing can be changed from here; needs an IoT helpdesk connection check.' } });
add({ id: 'CN-gwless', flow: 'Connection check', title: 'Site with no Lighthouse unit (equipment connects on its own)', ref: 'flows.js:2227-2236', kind: 'step', was: ['CN-gwless'],
  done: 'Connection check: this site’s equipment connects on its own',
  hd: 'The equipment you’re calling about isn’t responding',
  gtk: 'This site has no single Lighthouse unit; each piece of equipment connects on its own.',
  q: 'Ask the customer: is it working now?',
  chips: [['Yes, it’s working now', 'CN-back'], ['No, it’s still not working', 'CN-dcap', true]],
  note: 'On “Yes” the dashboard checks the equipment again; if it is still not responding it shows the “not responding” outcome.' });
add({ id: 'CN-dcap', flow: 'Connection check', title: 'Outcome: equipment not responding', ref: 'flows.js:2294-2301', kind: 'outcome', was: ['CN-dcap'],
  hd: 'The equipment isn’t responding',
  say: 'The equipment you’re calling about isn’t responding to us, so I can’t reach it from here tonight. I’ll log it as a priority for our team.',
  log: { type: 'capture', subject: 'Equipment not responding', detail: 'The equipment the customer reported isn’t responding to Lighthouse. Needs an IoT helpdesk connection check (raised from the heating questions).' } });
add({ id: 'CN-group1', flow: 'Connection check', title: 'One equipment group offline', ref: 'flows.js:2249-2265', kind: 'step', was: ['CN-group1'],
  done: 'Connection check: the site is reachable, 1 equipment group isn’t responding',
  hd: 'The boiler equipment isn’t responding',
  gtk: 'The site is reachable, but the boiler equipment has lost its own connection. Other equipment at this site can still be reached.',
  q: 'Ask the customer: is it working now?',
  chips: [['Yes, it’s working now', 'CN-back'], ['No, it’s still not working', 'CN-gcap', true]] });
add({ id: 'CN-group2', flow: 'Connection check', title: 'Two equipment groups offline', ref: 'flows.js:2249-2265', kind: 'step', was: ['CN-group2'],
  done: 'Connection check: the site is reachable, 2 equipment groups aren’t responding',
  hd: 'Two equipment groups aren’t responding',
  gtk: 'The site is reachable, but the boiler and the main distribution board have each lost their own connection. Other equipment at this site can still be reached.',
  q: 'Ask the customer: is it working now?',
  chips: [['Yes, it’s working now', 'CN-back'], ['No, it’s still not working', 'CN-gcap', true]] });
add({ id: 'CN-gcap', flow: 'Connection check', title: 'Outcome: equipment group offline', ref: 'flows.js:2282-2292', kind: 'outcome', was: ['CN-gcap'],
  hd: 'The boiler equipment has lost its connection',
  say: 'The site itself is online, but the unit that runs that equipment has lost its connection, so I can’t reach it from here tonight. I’ll log it as a priority for our team.',
  log: { type: 'capture', subject: 'Equipment offline: boiler can’t be reached', detail: 'Site reachable, but the boiler equipment group has lost its connection, so it can’t be reached from here. Needs an IoT helpdesk connection check.' } });

/* ============================== CONTRACTOR (D5) ============================== */
add({ id: 'CT-0', flow: 'Contractor on site', title: 'First screen (unchanged apart from labels)', ref: 'flows.js:2311-2316', kind: 'step', was: ['CT-0'],
  hd: 'Contractor on site: always urgent, an engineer is waiting',
  fields: ['Contractor and company', 'What do they need?'], chips: [['Next', 'CT-1', true]],
  note: 'The contractor is the customer on this call: the customer details step takes their name and number, with the role filled in as “Contractor”.' });
add({ id: 'CT-1', flow: 'Contractor on site', title: 'Is it PowerPause kitchen equipment?', ref: 'flows.js:2318-2325', kind: 'step', audience: 'contractor', was: ['CT-1'],
  done: 'Contractor: Dan Price, Northern Refrigeration · needs the fryers on to test the gas interlock',
  q: 'Ask the contractor: is it kitchen equipment on a PowerPause unit that you need switched on?',
  chips: [['Yes, kitchen equipment', 'CT-pp-type'], ['No, it’s something else', 'CT-p1']],
  note: 'At Donkey Derby (site 6786) “Yes” goes straight to the P1 card in row CT-ddesc, because the manual control button doesn’t work there.' });
add({ id: 'CT-p1', flow: 'Contractor on site', title: 'P1: escalate now', ref: 'flows.js:2327-2334', kind: 'p1', audience: 'contractor', was: ['CT-p1'],
  hd: 'Contractor waiting on site: raise a P1',
  sayAfter: D2 + ' Please ask the engineer to hold on.',
  log: { type: 'escalate-p1', subject: 'Contractor on site needs IoT support — P1 (unchanged)', detail: 'Contractor Dan Price, Northern Refrigeration, on site now: needs the fryers on to test the gas interlock. Escalated straight away.' } });
add({ id: 'CT-pp-type', flow: 'Contractor on site', title: 'Manual control button: find the unit', ref: 'flows.js:2362-2380', kind: 'step', audience: 'contractor', was: ['CT-pp-type'],
  done: 'It’s kitchen equipment on a PowerPause unit',
  hd: 'Using the manual control button on the PowerPause unit',
  say: 'Step 1, find the unit: “The PowerPause unit is usually near the kitchen distribution boards, behind a large appliance, or on the ceiling nearby. It will be labelled.” Step 2, check the label: “There should be a label on the unit saying either Tongou or Owon. Which does it say?”',
  q: 'Which does the label say?', chips: [['Tongou', 'CT-pp-instr'], ['Owon', 'CT-pp-instr']] });
add({ id: 'CT-pp-instr', flow: 'Contractor on site', title: 'Manual control button: press it', ref: 'flows.js:2382-2398', kind: 'step', audience: 'contractor', was: ['CT-pp-instr'],
  done: 'Tongou unit: manual control button steps given',
  hd: 'Tongou unit: press the manual control button once',
  say: 'Press the manual control button on the front of the Tongou unit once. Don’t hold it down. The equipment should come on within a few seconds, and it stays on until the unit’s next timetable change.',
  gtk: 'This is temporary. The unit goes back to its normal timetable at its next change.',
  q: 'Ask the contractor: has the equipment come on?',
  chips: [['Yes, it’s on', 'CT-ppdone', true], ['No, it’s still off', 'CT-p1']] });
add({ id: 'CT-ppdone', flow: 'Contractor on site', title: 'P1: equipment on with the button, call logged', ref: 'flows.js:2400-2408', kind: 'p1', audience: 'contractor', was: ['CT-ppdone'],
  done: 'The equipment came on with the manual control button',
  hd: 'Equipment on with the manual control button: raise the P1',
  sayAfter: 'I’ve logged this call. It will stay on until the unit’s next timetable change. If the problem comes back, ring us back and we’ll escalate it further.',
  log: { type: 'escalate-p1', subject: 'PowerPause contractor: manual control button steps given on site', detail: 'Contractor Dan Price, Northern Refrigeration, given the PowerPause manual control button steps (Tongou unit); the equipment came on. On until the unit’s next timetable change.' } });
add({ id: 'CT-ddesc', flow: 'Contractor on site', title: 'P1: Donkey Derby (site 6786), straight to the P1 card', ref: 'flows.js:2337-2360', kind: 'p1', audience: 'contractor', inj: true, was: ['CT-dd', 'CT-ddesc'],
  done: 'It’s kitchen equipment on a PowerPause unit',
  hd: 'Donkey Derby (site 6786): the manual control button doesn’t work here, so raise a P1',
  gtk: 'This site uses a different kind of unit, so the manual control button steps don’t apply.',
  sayAfter: 'I’m sorry, the equipment at this site can’t be switched on by hand. I’ve escalated this as a priority, and our team will contact the site directly. Their direct line is 023 814 0228, and the email is iot@airedale-group.co.uk.',
  log: { type: 'escalate-p1', subject: 'PowerPause: Donkey Derby (site 6786): IoT helpdesk escalation', detail: 'Contractor Dan Price, Northern Refrigeration, on site at Donkey Derby (6786). The PowerPause manual control button doesn’t apply at this site. Escalated to the IoT helpdesk.' } });

/* ============================== SOMETHING ELSE (D5, D11) + AIRCON (D6) ============================== */
add({ id: 'O-0', flow: 'Something else', title: 'First screen: the customer’s words, then “is it about any of these?”', ref: 'flows.js:2419-2433', kind: 'step', was: ['O-0', 'O-1'],
  field: 'Describe the issue in the customer’s words (e.g. “the cellar cooler alarm is going off”)',
  q: 'Ask the customer: is it about any of these?',
  chips: [['Heating', 'S-1'], ['Hot water', 'HW-0'], ['Kitchen equipment', 'K-what'], ['Outside lighting', 'O-none'], ['Extractor fans', 'O-none'], ['Inside lighting or sockets', 'O-none'], ['The boiler itself', 'O-none'], ['None of these', 'O-choice', true]],
  gtk: 'Each answer goes straight to the right questions for this site. If Lighthouse doesn’t have it here, it goes to a closed note telling the customer to use their own contractor.',
  note: 'The list is this site’s own list from “What Lighthouse controls at this site”. Anything on Lighthouse here (controlled or monitored) starts that issue’s own questions, carrying the customer’s words; anything not on Lighthouse here goes to row O-none.' });
REMOVED['O-1'] = 'Merged into O-0 (D5). “Check if Lighthouse controls it” and “Log it as described” were agent choices; the customer now just says what it is about.';
add({ id: 'O-choice', flow: 'Something else', title: 'None of these: is it urgent? (P1 path unchanged, OOHDASH-134/153)', ref: 'flows.js:367-383', kind: 'step', was: ['O-choice'],
  done: 'Issue: “Cellar cooler alarm going off”',
  q: 'Ask the customer: is this stopping the site trading, or is it a safety risk, right now?',
  chips: [['Yes, it’s urgent', 'O-p1'], ['No, it can wait', 'O-normal', true]],
  gtk: 'A P1 is anything that is immediately health and safety or business trading affecting. Please only use this option after you’ve attempted to follow through one of the circumstance tiles. P1 escalation will send a text to the escalation manager on the IoT Support team immediately upon submission.',
  note: '“Yes, it’s urgent” is the existing P1 Escalation button with a new label: same reason box (required when no words were typed), same ooh_p1 path and agreed sentence.' });
add({ id: 'O-normal', flow: 'Something else', title: 'Outcome: can wait, normal priority', ref: 'flows.js:2435-2444', kind: 'outcome', was: ['O-normal'],
  done: 'It can wait until the next working day',
  hd: 'Logged as described',
  say: 'I’ll log exactly what you’ve described for our team, and they’ll pick it up on the next working day. If it becomes urgent tonight, ring back and we’ll escalate it.',
  log: { type: 'capture', subject: 'General issue logged', detail: 'Customer reported: cellar cooler alarm going off. Logged word for word for the IoT helpdesk.' } });
add({ id: 'O-p1', flow: 'Something else', title: 'P1: urgent', ref: 'flows.js:2445-2456', kind: 'p1', was: ['O-p1'],
  done: 'Urgent: stopping the site trading or a safety risk',
  hd: 'Urgent: raise a P1',
  sayAfter: D2,
  log: { type: 'escalate-p1', subject: 'Something else - urgent, escalated as P1 (unchanged)', detail: 'Customer reported: smoke smell from the plant room. Didn’t fit a specific tile; customer says it is stopping trading or a safety risk.' } });
REMOVED['O-ctl'] = 'Removed (D11). The “it is controlled here, go back to the issue picker” dead end is gone: choosing an area on Lighthouse now starts its questions straight away.';
REMOVED['O-mon'] = 'Removed (D11). A monitored area now starts that area’s own questions (for heating, the thermostat questions), which decide the outcome from the data.';
add({ id: 'O-none', flow: 'Something else', title: 'Outcome: not on Lighthouse here (closed note)', ref: 'flows.js:2471-2475', kind: 'outcome', was: ['O-none'],
  done: 'Outside lighting: not on Lighthouse at this site',
  hd: 'Outside lighting isn’t on Lighthouse at this site',
  say: 'That isn’t monitored or controlled by Lighthouse at your site, so please contact your own contractor or service engineer through your usual route. ' + NOTE,
  gtk: CLOSEDGTK,
  log: { type: 'scope-only', closed: true, subject: 'Outside lighting: not on Lighthouse, customer referred to their own contractor', detail: 'Lighthouse has no outside lighting at The Wheatsheaf. Customer’s issue: car park lights out. Customer told to contact their own contractor. Saved as a closed ticket for the record.' } });
add({ id: 'AC', flow: 'Air conditioning', title: 'Outcome: air conditioning on Lighthouse here, logged', ref: 'flows.js:1760-1768', kind: 'outcome', was: ['AC'],
  done: 'Air conditioning: on Lighthouse here, can’t be changed from here',
  hd: 'Air conditioning can’t be changed from here',
  say: 'Air conditioning isn’t something I can change from here, so I’ll log it for our team and they’ll pick it up on the next working day. If it becomes urgent overnight, call back and we can escalate it.',
  log: { type: 'capture', subject: 'Air conditioning request (The Wheatsheaf)', detail: 'Customer raised an air conditioning issue. Air conditioning can’t be changed from here, so it is logged for the IoT helpdesk.' } });
add({ id: 'AC-none', flow: 'Air conditioning', title: 'Outcome: no air conditioning on Lighthouse here (new, closed note)', ref: 'flows.js:1760-1768', kind: 'outcome',
  done: 'Air conditioning: not on Lighthouse at this site',
  hd: 'Air conditioning here isn’t on Lighthouse',
  say: 'Your air conditioning isn’t monitored or controlled by Lighthouse, so please contact your own air conditioning engineer through your usual route. ' + NOTE,
  gtk: CLOSEDGTK,
  log: { type: 'scope-only', closed: true, subject: 'Air conditioning: not on Lighthouse, customer referred to their own engineer', detail: 'Customer raised an air conditioning issue. No air conditioning at this site is monitored or controlled by Lighthouse. Customer told to contact their own air conditioning engineer. Saved as a closed ticket for the record.' } });

/* ============================== HEATING: THERMOSTATS (D12 + D5) ============================== */
const RADQ = [['Yes, they’re warm', 'S-buildheat'], ['No, they’re cold', 'S-coldrads']];
add({ id: 'H-none', flow: 'Heating (thermostats)', title: 'No heating on Lighthouse here (new: was a dead end)', ref: 'flows.js:1608-1610', kind: 'outcome',
  done: 'Heating: not on Lighthouse at this site',
  hd: 'Heating here isn’t on Lighthouse',
  say: 'Your heating isn’t monitored or controlled by Lighthouse, so please contact your own heating engineer through your usual route. ' + NOTE,
  gtk: CLOSEDGTK,
  log: { type: 'scope-only', closed: true, subject: 'Heating: not on Lighthouse, customer referred to their own engineer', detail: 'Customer reports a heating problem. No heating at this site is monitored or controlled by Lighthouse. Customer told to contact their own heating engineer. Saved as a closed ticket for the record.' } });
add({ id: 'S-1', flow: 'Heating (thermostats)', title: 'Reading and “what does the customer need?”', ref: 'flows.js:1678-1705', kind: 'step', was: ['S-1'],
  done: 'Area: Bar/Restaurant',
  read: '17.5°C · Target 18°C · reading just now · online',
  q: 'Ask the customer: what do you need?',
  chips: [['Warmer', 'S-warm-buildheat'], ['Cooler', null], ['Turn it off', 'S-off-frost'], ['It’s not working', 'S-broken-under']] });
add({ id: 'S-warm-buildheat', flow: 'Heating (thermostats)', title: 'Warmer, but already asking for heat', ref: 'flows.js:1708-1711', kind: 'step', inj: true, was: ['S-warm-buildheat'],
  done: 'Asked for: warmer · the heating is already asking for heat',
  hd: 'Turning the thermostat up won’t help here',
  gtk: 'The room is 16°C against a target of 20°C and the thermostat is online, so it is already asking for more heat than the building is giving. The customer’s answer tells us whether the heat is reaching the radiators.',
  q: 'Ask the customer: are the radiators in that area warm?', chips: RADQ });
add({ id: 'S-broken-keepingup', flow: 'Heating (thermostats)', title: 'Not working, but keeping up (straight to the outcome)', ref: 'flows.js:1727-1729', kind: 'outcome', inj: true, was: ['S-broken-keepingup'],
  done: 'Reported: heating not working',
  hd: 'The heating is keeping up',
  say: 'Your thermostat is reading 19.5 degrees against a target of 20, so our controls are keeping up. If one area still feels cold, it’s likely a radiator or its valve, which Lighthouse doesn’t monitor or control, so please contact your own heating engineer through your usual route. ' + NOTE,
  gtk: CLOSEDGTK,
  log: { type: 'scope-only', closed: true, subject: 'Heating complaint: controls keeping up (Bar area)', detail: 'Room 19.5°C against a target of 20°C with the thermostat online. Our controls are keeping up; customer told to contact their own heating engineer about radiators or valves. Saved as a closed ticket for the record.' } });
add({ id: 'S-broken-under', flow: 'Heating (thermostats)', title: 'Not working, below target', ref: 'flows.js:1730', kind: 'step', inj: true, was: ['S-broken-under'],
  done: 'Reported: heating not working',
  hd: 'The room is below its target temperature',
  gtk: 'The room is 17°C against a target of 20°C, so the thermostat is already asking for heat. Turning it up won’t change that. The customer’s answer tells us whether the heat is reaching the radiators.',
  q: 'Ask the customer: are the radiators in that area warm?', chips: RADQ,
  note: 'When the room is at or near its target (within 1°C) this screen is replaced by the closed outcome in row S-broken-keepingup.' });
add({ id: 'S-off-frost', flow: 'Heating (thermostats)', title: 'Turn it off (thermostat has no off switch)', ref: 'flows.js:1717-1724', kind: 'step', was: ['S-off-frost'],
  done: 'Asked for: turn the heating off',
  hd: 'This thermostat can’t be switched fully off',
  say: 'This thermostat doesn’t have an off switch, but I can turn it right down so the heating stays off unless the building gets close to freezing. Would you like me to do that?',
  gtk: 'Turning it down to 5°C is the nearest safe option. It goes back to normal when the set time ends.',
  chips: [['Yes, turn it down', 'CTL-compose-frost', true], ['No, leave it as it is', 'S-offnoact']] });
add({ id: 'S-offnoact', flow: 'Heating (thermostats)', title: 'Outcome: leave it as it is', ref: 'flows.js:1735-1742', kind: 'outcome', noAction: true, was: ['S-offnoact'],
  done: 'The customer wants it left as it is',
  hd: 'No change made to the heating',
  say: 'I haven’t changed anything tonight. If you change your mind, call back and we can turn it down straight away.',
  log: { type: 'no-action', subject: 'Heating-off request: no change made (Bar area)', detail: 'Customer asked for the heating off; turning it down to 5°C was offered and the customer chose to leave it as it is. Nothing was changed.' } });
add({ id: 'S-buildheat', flow: 'Heating (thermostats)', title: 'Outcome: radiators warm, our controls are working (closed note)', ref: 'flows.js:1744-1751', kind: 'outcome', inj: true, was: ['S-buildheat'],
  done: 'The radiators are warm',
  hd: 'The heating controls are doing their job',
  say: 'Your thermostat is asking for heat and your radiators are warm, so our controls are working; the room just isn’t getting enough heat from them. That’s down to the radiators, their valves or the boiler, which Lighthouse doesn’t monitor or control, so please contact your own heating engineer through your usual route. ' + NOTE,
  gtk: CLOSEDGTK,
  log: { type: 'scope-only', closed: true, subject: 'Heating complaint: controls working, room below target (Bar area)', detail: 'Room 16°C against a target of 20°C with the thermostat online and asking for heat; customer says the radiators are warm. Not a Lighthouse controls fault; customer told to contact their own heating engineer. Saved as a closed ticket for the record.' } });
add({ id: 'S-coldrads', flow: 'Heating (thermostats)', title: 'Outcome: asking for heat, radiators cold (new)', ref: 'new', kind: 'outcome', inj: true,
  done: 'The radiators are cold',
  hd: 'Asking for heat, but the radiators are cold',
  say: 'Our thermostat is asking for heat but your radiators are cold, so I’ll log it for our team to check our controls on the next working day. If your boiler is showing a fault light, your own boiler engineer is the quickest fix tonight.',
  gtk: 'This could be our controls not reaching the boiler, or the boiler itself, so it goes to the IoT helpdesk as a normal ticket.',
  log: { type: 'capture', subject: 'Heating: thermostat asking for heat, radiators cold (Bar area)', detail: 'Room 17°C against a target of 20°C with the thermostat online and asking for heat; customer says the radiators are cold. Needs the IoT helpdesk to check the controls reach the boiler.' } });
add({ id: 'S-dark1', flow: 'Heating (thermostats)', title: 'Heating unit not reporting (straight to the outcome)', ref: 'flows.js:1646-1667', kind: 'outcome', was: ['S-dark1', 'S-darkcap'],
  done: 'Area: Accommodation · not reporting',
  hd: 'This heating unit isn’t sending us any readings',
  say: 'That heating unit isn’t sending us any information at the moment, so I can’t see or change it from here tonight. I’ll log it for our team to look into on the next working day.',
  gtk: 'There is no live reading and it can’t be changed from here. This usually means it has lost power or its connection.', note: 'With several units the headline is “The heating units in this area aren’t sending us any readings”.',
  log: { type: 'capture', subject: 'Heating unit not reporting (Accommodation)', detail: 'The Accommodation heating unit is not reporting to Lighthouse (no live readings), so it can’t be read or changed from here. Logged for the IoT helpdesk to check the unit and its connection.' } });
REMOVED['S-darkcap'] = 'Merged into S-dark1 (D5): the unit not reporting is our equipment, so the system logs it; there is no agent choice.';
REMOVED['S-darknoact'] = 'Removed (D5). “No further action” for a unit that isn’t reporting was an agent choice; the unit is always logged for our team (row S-dark1).';

/* ============================== DEVICE CONTROL WINDOW (keeps today's ticket model, D2) ============================== */
const TGT = 'The Wheatsheaf · 7412 → Bar area';
add({ id: 'CTL-compose-up', flow: 'Device control window', title: 'Make it warmer (no set time)', ref: 'control.js:21-23, 70-78, 114-131', kind: 'modal',
  mtitle: 'Make it warmer', target: TGT, big: '21°C',
  lines: ['Target temperature now 18°C. You can set 15–21°C (up to 3°C either way, never above 25°C).', 'How long should this last?', '[Until its next timetable change (default)] [Until 07:00 tomorrow] [For 4 hours]', 'Without a set time, the thermostat goes back to its own timetable at its next change. In the evening that can be soon, so a set time is usually better.'],
  chips: [['Cancel', null], ['Send', 'CTL-slow', true]] });
add({ id: 'CTL-compose-up-hold', flow: 'Device control window', title: 'Make it warmer (until 07:00)', ref: 'control.js:75-77', kind: 'modal',
  mtitle: 'Make it warmer', target: TGT, big: '21°C',
  lines: ['Target temperature now 18°C. You can set 15–21°C (up to 3°C either way, never above 25°C).', 'How long should this last?', '[Until its next timetable change] [Until 07:00 tomorrow ✓] [For 4 hours]', '⏱️ At Wed 07:00 it goes back to 18°C by itself. This still happens if the dashboard restarts.'],
  chips: [['Cancel', null], ['Send', 'CTL-confirmed', true]] });
add({ id: 'CTL-compose-frost', flow: 'Device control window', title: 'Turn heating off (down to 5°C)', ref: 'control.js:125', kind: 'modal',
  mtitle: 'Turn heating off', target: TGT, big: 'Heating off (5°C)',
  lines: ['The heating stays off unless the building gets close to freezing.', 'How long should this last?', '[Until its next timetable change] [Until 07:00 tomorrow ✓] [For 4 hours]', '⏱️ At Wed 07:00 it goes back to 18°C by itself. This still happens if the dashboard restarts.'],
  chips: [['Cancel', null], ['Send', 'CTL-finish-frost', true]] });
add({ id: 'CTL-compose-switch', flow: 'Device control window', title: 'Turn a circuit on', ref: 'control.js:127', kind: 'modal',
  mtitle: 'Turn on', target: 'The Wheatsheaf · 7412 → Car park lights', big: 'Turn on',
  lines: ['This turns the car park lights circuit on. We only show it as done when the switch confirms it.'],
  chips: [['Cancel', null], ['Send', 'CTL-finish-switch', true]] });
add({ id: 'CTL-inflight', flow: 'Device control window', title: 'Waiting for the thermostat', ref: 'control.js:146-165', kind: 'modal',
  mtitle: 'Make it warmer', target: TGT + ' · 21°C',
  lines: ['1. Sent · 2. Accepted · 3. Waiting for the thermostat…', 'Accepted. Waiting for the thermostat to show the change in its own reading. We only say “done” when it does.'] });
add({ id: 'CTL-slow', flow: 'Device control window', title: 'Slow thermostat: carry on', ref: 'control.js:156-159', kind: 'modal',
  mtitle: 'Make it warmer', target: TGT + ' · 21°C',
  lines: ['1. Sent · 2. Accepted · 3. Waiting for the thermostat…', '📨 Sent to the thermostat. It should take effect within about 4 minutes. You can carry on with the customer; we’ll keep watching and update the ticket when the thermostat confirms.'],
  chips: [['Done, carry on', 'CTL-release-ok', true]] });
add({ id: 'CTL-confirmed', flow: 'Device control window', title: 'Confirmed (with a set time)', ref: 'control.js:152, 166-167', kind: 'modal',
  mtitle: 'Make it warmer', target: TGT + ' · 21°C',
  lines: ['1. Sent · 2. Accepted · ✅ Confirmed', '✅ Done: the thermostat now reads 21°C. We only show this when the thermostat itself confirms it. It goes back to normal at Wed 07:00.'],
  chips: [['Done', 'CTL-finish-up', true]] });
add({ id: 'CTL-confirmed-late', flow: 'Device control window', title: 'Confirmed late', ref: 'control.js:167', kind: 'modal',
  mtitle: 'Make it warmer', target: TGT + ' · 21°C',
  lines: ['1. Sent · 2. Accepted · ✅ Confirmed', '✅ Done: the thermostat now reads 21°C (confirmed late). This came in after we told you it wasn’t confirmed, so tell the customer it’s now done.'],
  chips: [['Done', 'CTL-finish-up', true]] });
add({ id: 'CTL-already', flow: 'Device control window', title: 'Already at that value', ref: 'control.js:154-155', kind: 'modal',
  mtitle: 'Make it warmer', target: TGT + ' · 21°C',
  lines: ['1. Sent · 2. Accepted · ✅ Confirmed', '✅ Already at 21°C. The thermostat already reads this, so nothing needed changing. It goes back to normal at Wed 07:00.'],
  chips: [['Done', 'CTL-finish-up', true]] });
add({ id: 'CTL-nondelivery', flow: 'Device control window', title: 'Not delivered', ref: 'control.js:168-169', kind: 'modal',
  mtitle: 'Make it warmer', target: TGT + ' · 21°C',
  lines: ['1. Sent · 2. Accepted · ✕ Not delivered', '❌ Not delivered. The thermostat rejected the change. Nothing has changed on site, so don’t tell the customer it’s done.'],
  chips: [['Log it for the IoT helpdesk', 'CTL-escalate-nondel', true]] });
add({ id: 'CTL-indeterminate', flow: 'Device control window', title: 'Not confirmed yet', ref: 'control.js:170-172', kind: 'modal',
  mtitle: 'Make it warmer', target: TGT + ' · 21°C',
  lines: ['1. Sent · 2. Accepted · ⚠ Not confirmed', '⚠️ Not confirmed yet. We sent the change but the thermostat hasn’t confirmed it. It may still go through. We’ll keep watching and update the ticket if it does, so please don’t treat it as done.'],
  chips: [['Log it for the IoT helpdesk', 'CTL-escalate-indet', true]] });
add({ id: 'CTL-finish-up', flow: 'Device control window', title: 'Result: done (target raised, with a set time)', ref: 'control.js:330-377 (ctlFinish)', kind: 'ctlout', inj: true,
  hd: 'Done: the thermostat has confirmed it',
  body: 'Target temperature raised to 21°C (Bar area), confirmed by the thermostat. ⏱️ Goes back to normal at Tue 23:55 (automatic).',
  say: 'That’s done. I’ve turned it up to 21 degrees and the thermostat has confirmed it. It stays like that until Tue 23:55, then goes back to its normal timetable.',
  foot: 'Logged on ticket #48213 for the IoT helpdesk (reviewed next working day).',
  note: 'No set time: the last sentence is “It goes back to its normal timetable at its next change.” Turned down: “I’ve turned it down to 19 degrees…”.' });
add({ id: 'CTL-finish-frost', flow: 'Device control window', title: 'Result: done (heating turned off)', ref: 'control.js:338-345', kind: 'ctlout', inj: true,
  hd: 'Done: the thermostat has confirmed it',
  body: 'Heating turned off (5°C) (Bar area), confirmed by the thermostat. ⏱️ Goes back to normal at Tue 23:55 (automatic).',
  say: 'That’s done. Your heating is now off, and it will only come on if the building gets close to freezing, until Tue 23:55, when it goes back to its normal timetable.',
  foot: 'Logged on ticket #48214 for the IoT helpdesk (reviewed next working day).' });
add({ id: 'CTL-finish-switch', flow: 'Device control window', title: 'Result: circuit switched', ref: 'control.js:343-344', kind: 'ctlout',
  hd: 'Done: the switch has confirmed it',
  body: 'Car park lights turned on, confirmed by the switch.',
  say: 'That’s done. The car park lights are now on, and it’s confirmed.',
  foot: 'Logged on ticket #48215 for the IoT helpdesk (reviewed next working day).' });
add({ id: 'CTL-finish-fail', flow: 'Device control window', title: 'Result: done, but the ticket failed', ref: 'control.js:370-374', kind: 'ctlout', inj: true,
  hd: 'Done: the thermostat has confirmed it',
  body: 'Target temperature raised to 21°C (Bar area), confirmed by the thermostat.',
  alert: 'The change has been made, but we couldn’t log the ticket: Zendesk is unreachable. Raise it in Tonight, Raise a query, so there’s a record.',
  say: 'That’s done. I’ve turned it up to 21 degrees and the thermostat has confirmed it. It goes back to its normal timetable at its next change.' });
add({ id: 'CTL-release-ok', flow: 'Device control window', title: 'Result: sent, waiting (ticket logged)', ref: 'control.js:255-293 (ctlRelease)', kind: 'ctlout', fix: 'release',
  hd: 'Sent: waiting for the thermostat to confirm',
  body: 'Target temperature raised to 21°C (Bar area) has been sent. It should take effect within about 4 minutes. We’re watching it and will add the result to ticket #48216.',
  say: 'That’s gone to the thermostat now. It can take a few minutes to take effect. I’ve logged it, and we’ll keep an eye on it. If it doesn’t respond, we’ll follow it up.',
  foot: 'Ticket #48216' });
add({ id: 'CTL-release-fail', flow: 'Device control window', title: 'Result: sent, waiting (ticket FAILED, false claim fixed)', ref: 'control.js:280-288', kind: 'ctlout', fix: 'release', inj: true,
  hd: 'Sent: waiting for the thermostat to confirm',
  body: 'Target temperature raised to 21°C (Bar area) has been sent. It should take effect within about 4 minutes.',
  alert: 'We couldn’t log this automatically: Zendesk is unreachable.',
  alertBtn: 'Try logging again',
  say: 'That’s gone to the thermostat now. It can take a few minutes to take effect. We’ll keep an eye on it, and I’ll make sure it’s logged for our team.',
  note: 'When “Try logging again” works, the card switches to the logged version (with “I’ve logged it” and the ticket number). No notes box is shown until there is a ticket number.' });
add({ id: 'CTL-escalate-indet', flow: 'Device control window', title: 'Result: not confirmed, logged', ref: 'control.js:382-419 (ctlEscalate)', kind: 'ctlout',
  hd: 'Not confirmed: logged for the IoT helpdesk',
  body: 'We tried to raise the target temperature to 21°C (Bar area), but the thermostat hasn’t confirmed it. Treat it as not done.',
  say: 'I tried to make that change from here, but the thermostat hasn’t confirmed it, so I won’t tell you it’s done. I’ve logged it as a priority, and it may still go through; our team will check.',
  foot: 'Ticket #48217' });
add({ id: 'CTL-escalate-nondel', flow: 'Device control window', title: 'Result: not delivered, logged (contradiction fixed)', ref: 'control.js:410-413', kind: 'ctlout',
  hd: 'Not delivered: logged for the IoT helpdesk',
  body: 'We tried to raise the target temperature to 21°C (Bar area), but it didn’t reach the thermostat. Nothing has changed.',
  say: 'I tried to make that change from here, but it didn’t reach the thermostat, so nothing has changed. I’ve logged it as a priority for our team.',
  foot: 'Ticket #48218' });


/* ============================== CUSTOMER DETAILS (D9, new) ============================== */
const CDSAY = 'Can I take your name, your role, and the best number to reach you on?';
const CDGTK = 'Name and contact number are needed before anything is logged; role is optional. They go on every ticket from this call, in the ticket’s internal notes, so our team can call back. They’re not sent in the P1 text and not shown in Tonight.';
add({ id: 'CD-home', flow: 'Customer details', title: 'New call: details first, then the site (new)', ref: 'views.js:27-41', kind: 'view',
  hd: 'Who’s calling?', say: CDSAY, gtk: CDGTK,
  fields: ['Customer’s name (required)', 'Their role (optional, e.g. duty manager, chef, contractor)', 'Best contact number (required)'],
  lines: ['Site: house number (4 digits) or pub name [search]'] });
add({ id: 'CD-ws', flow: 'Customer details', title: 'Site found first: details asked next (new)', ref: 'views.js:125-140, 180-200', kind: 'step',
  hd: 'Who’s calling?', say: CDSAY, gtk: CDGTK,
  fields: ['Customer’s name (required)', 'Their role (optional, e.g. duty manager, chef, contractor)', 'Best contact number (required)'],
  chips: [['Save and continue', null, true], ['The customer won’t give these', null]],
  note: 'Shown at the top of the site screen until saved; the issue buttons wait below it. “The customer won’t give these” records “Customer declined to give their details” instead, so a call is never blocked.' });
add({ id: 'CD-saved', flow: 'Customer details', title: 'Details saved: shown on every screen of the call (new)', ref: 'views.js:217-220', kind: 'step',
  banner: '👤 Priya Shah · duty manager · 07700 900123 [Change]',
  gtk: 'The details stay for the whole call and every issue in it, and are cleared when you press End call.',
  q: 'What is the customer reporting?', chips: [['Kitchen equipment', 'K-what'], ['Hot water', 'HW-0'], ['Heating', 'S-1']] });
add({ id: 'CD-check', flow: 'Customer details', title: 'Check and log shows who called (new section)', ref: 'flows.js:923-1079 (wrapUpStep)', kind: 'view',
  hd: 'Check and log',
  lines: ['Customer: Priya Shah (duty manager) · 07700 900123 [Change]', 'What the customer said · What we found · What we did · What we’ll log · Your notes'] });

/* ============================== SHARED SCREENS (new states) ============================== */
add({ id: 'SH-closed', flow: 'Shared screens', title: 'Logged as a closed note (contact history only, D6)', ref: 'flows.js:410-415 (outcomeScope)', kind: 'view',
  hd: '✅ Noted for the record: ticket #48213 (closed)',
  lines: ['There’s nothing for our team to do, so the ticket is saved already closed. It still shows in this site’s ticket history and Callback Lookup.', '• What we found: Hot water here isn’t on Lighthouse', '• What we told the customer: contact their own boiler or service engineer', '[➕ Add another issue] [✔ End call]'] });
add({ id: 'SH-p1fail', flow: 'Shared screens', title: 'P1 failed to raise (section 3.4)', ref: 'flows.js:337-343 (outcomeP1)', kind: 'view',
  hd: 'Kitchen off during service: raise a P1',
  alert: '⚠️ The P1 has NOT been raised: we couldn’t reach the ticket system. Nobody has been paged yet. Press Try again. If it fails again, phone the IoT helpdesk now on 023 814 0228.',
  alertBtn: 'Try again',
  lines: ['The P1 card, the customer’s details and your notes stay on screen. No ticket number, no “P1 raised” and no words to read are shown until a P1 really exists.'] });
add({ id: 'SH-logfail', flow: 'Shared screens', title: 'Check and log failed (unchanged pub heating behaviour)', ref: 'flows.js:923-1079', kind: 'view',
  hd: 'Check and log',
  alert: 'We couldn’t log this: we couldn’t reach the ticket system.', alertBtn: 'Try again',
  lines: ['Nothing is claimed: no ticket number, no “Logged”, no entry in “This call so far”. The card, details and notes stay.'] });

/* ============================== OTHER SCREENS ============================== */
add({ id: 'WS-offline', flow: 'Other screens', title: 'Site screen: some equipment not responding (button removed, D10)', ref: 'views.js:187', kind: 'view', was: ['WS-offline'],
  alert: '📡 Some Lighthouse equipment at this site isn’t responding.',
  lines: ['If the customer’s issue involves it, the questions check it for you.', 'The “Run connection check” button is removed, and typing words like “offline” or “router” no longer suggests a connection check (D10).'] });
add({ id: 'SITE-confirm', flow: 'Other screens', title: 'Confirm the site', ref: 'views.js:117', kind: 'view', was: ['SITE-confirm'],
  hd: 'The Wheatsheaf · 7412', say: 'Can I just confirm: you’re calling from The Wheatsheaf, site number 7412?', chips: [['✓ This is the right site', null, true], ['Search again', null]] });
add({ id: 'SITE-ambiguous', flow: 'Other screens', title: 'House number matches two sites', ref: 'views.js:75-107', kind: 'view', was: ['SITE-ambiguous'],
  hd: 'House number 6758 matches more than one site',
  gtk: 'It matches Bowers and Bowman. To avoid changing the wrong site, nothing can be changed from here for this number.',
  say: 'I can’t safely make changes for this site number tonight, so I’ll log it for our team as a priority and they’ll pick it up.',
  chips: [['Log it for the IoT helpdesk', null, true], ['Search again', null]],
  log: { type: 'capture', subject: 'House number 6758 matches more than one site', detail: 'OOH couldn’t safely match house number 6758 to one site (it matches Bowers and Bowman). Logged for the IoT helpdesk to review.' } });
add({ id: 'SEARCH-none', flow: 'Other screens', title: 'Search: no match', ref: 'app.js:228, 234; views.js:33', kind: 'view', was: ['SEARCH-none'],
  lines: ['No site matches “Zzyzx Arms”. Check the house number with the customer. If it’s still not found, the site may not be on Lighthouse: search by pub name, or log it.', 'Customer ringing back about an earlier issue? Use Callback Lookup →', '(Inventory down: “You can still log the customer’s issue: use “Something else” once the site is known, or raise it in Tonight, Raise a query.”)'] });
add({ id: 'CB-drawer', flow: 'Other screens', title: 'Callback ticket drawer', ref: 'views.js:406-420', kind: 'view', was: ['CB-drawer'],
  hd: 'Ticket #48213 · Target temperature raised — Bar area',
  say: 'I can see your issue was reported 20 minutes ago. Your issue has been logged and our team will be picking it up shortly.',
  lines: ['(Closed note: “I can see we spoke 20 minutes ago and made a note of it. That one was for your own contractor, so there’s nothing open with us for it.”)', '(Visit involved: “⚠️ Engineer visit involved: remind the customer that if the fault turns out not to be Lighthouse equipment, the visit may be chargeable.”)', 'When does the customer expect an update? [date] [Save follow-up]', 'Notes and feedback thread …'] });
add({ id: 'CB-empty', flow: 'Other screens', title: 'Callback: no tickets', ref: 'views.js:465, 480', kind: 'view', was: ['CB-empty'],
  lines: ['No tickets for this site in the last 90 days. If the customer insists they rang, take details and start a new call.', '(Zendesk down: “Zendesk is unreachable. Take the customer’s details and start a new call to log the issue; it will be logged as soon as the connection returns.”)'] });
add({ id: 'TONIGHT', flow: 'Other screens', title: 'Tonight table: outcome chips and “What happened”', ref: 'views.js:491-505, 529-534', kind: 'view', was: ['TONIGHT'],
  table: [
    ['20:02', 'The Wheatsheaf 7412', 'Heating turned on (zone 1)', 'heating turned on', 'today shows the raw code'],
    ['20:14', 'The Wheatsheaf 7412', 'Heating put back to normal (zone 1)', 'back to normal', 'today shows the raw code'],
    ['20:20', 'The Wheatsheaf 7412', 'Target temperature raised — Bar area', 'applied ✓', 'today shows the raw code'],
    ['20:31', 'The Wheatsheaf 7412', 'Target temperature raised — not applied, logged', 'captured', 'today also shows an internal class code'],
    ['20:40', 'The Wheatsheaf 7412', 'Fridge or freezer: customer referred to their own refrigeration engineer', 'closed note', 'new for closed tickets (today says “not Lighthouse”)'],
    ['20:52', 'The Wheatsheaf 7412', 'Pub heating: added to ticket', 'added to ticket', 'today shows the raw code'],
    ['21:05', 'The Wheatsheaf 7412', 'Fryer one-off: on until midnight', 'one-off booked', 'new (D8)'],
    ['23:02', 'The Wheatsheaf 7412', 'Fryer one-off: back on after its timetable', 'one-off on', 'new (D8)'],
    ['00:01', 'The Wheatsheaf 7412', 'Fryer one-off: switched off at midnight', 'one-off done', 'new (D8)'],
    ['06:00', 'The Plough 6120', 'Glass washer one-off: not carried out (not responding at 06:00)', 'not carried out', 'new (D8), red']
  ],
  lines: ['Raise a query placeholder: “e.g. Customer says they rang two nights ago about fryers, can’t see it tonight”'] });

/* ============================== SHARED: outcome helpers ============================== */
const SHARED = {
  checkAndLog: { title: 'Check and log', sections: ['Customer', 'What the customer said', 'What we found', 'What we did', 'What we’ll log', 'Your notes'], button: LOG, closedButton: LOGC, p1Button: P1BTN },
  customer: 'Priya Shah (duty manager) · 07700 900123',
  logged: '✅ Logged: ticket #48213 is with the IoT helpdesk',
  loggedNext: 'Our team picks this up on the next working day.',
  closedLogged: '✅ Noted for the record: ticket #48213 (closed)',
  closedNext: 'There’s nothing for our team to do, so the ticket is saved already closed. It still shows in this site’s ticket history and Callback Lookup.',
  p1Logged: '🚨 P1 raised: ticket #48213',
  p1Status: 'The P1 is logged as ticket #48213 in the IoT Support dashboard, which pages the on-duty manager.',
  p1Fail: '⚠️ The P1 has NOT been raised: we couldn’t reach the ticket system. Nobody has been paged yet. Press Try again. If it fails again, phone the IoT helpdesk now on 023 814 0228.'
};

module.exports = { STATES: S, SHARED, LOG, LOGC, P1BTN, D2, REMOVED };
