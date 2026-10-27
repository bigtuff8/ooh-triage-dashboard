// OOHDASH-146 — single source of truth for the proposed wording.
// Drives: the design doc wording tables, the screen-text diff, and the prototype.
// Example values (names, times, temperatures, ticket numbers) are fixed examples; the build fills them from data.
// kind: step (a question or information card mid-flow), outcome (card -> Check and log -> logged),
//       p1 (combined P1 card: raise -> logged P1 banner + Say), modal (control window), view (other screen).
// chips: [label, nextStateId|null, primary?]. log: { type, subject, detail }.
const LOG = 'Log for the IoT helpdesk and finish';
const P1BTN = 'Raise the P1 and finish';
const D2 = 'I’ve raised an urgent P1 ticket for this site and someone will call you back shortly.';

const S = [];
function add(o) { S.push(o); }

/* ============================== HOT WATER ============================== */
const HWQ = [['Log it for the IoT helpdesk', 'HW-cap', true], ['It sounds like the boiler itself', 'HW-sc']];
add({ id: 'HW-0', flow: 'Hot water', title: 'First screen (no hot water setting shown)', ref: 'flows.js:1782-1799', kind: 'step',
  done: 'Hot water: we can see it but can’t change it from here',
  hd: 'Hot water is run by the boiler’s own controls',
  gtk: 'We can see the hot water here but can’t change it, so it can’t be turned on from here. Log it, or give boiler advice if it sounds like the boiler itself.',
  chips: HWQ });
const DHW = [
  ['auto', 'Hot water setting: normal timetable', 'Hot water is on its normal timetable', 'Normal timetable', 'Nobody has changed the hot water at the heating controls, so that isn’t the reason for the problem.', 'Your hot water controls are on their normal timetable, so nobody has switched it off.', 'Hot water at time of call: on its normal timetable.'],
  ['auto-ended', 'Hot water setting: a change has just ended', 'Hot water is back on its normal timetable', 'Normal timetable', 'Someone changed the hot water at the controls until 18:15. That has ended, so it isn’t the reason for the problem now.', 'Your hot water controls are back on their normal timetable.', 'Hot water at time of call: on its normal timetable (a change ended at 18:15).'],
  ['on-until', 'Hot water setting: switched on until a time', 'Hot water has been switched on at the controls until 21:30', 'Switched on', 'The controls are asking for hot water, so if there is still none, the likely cause is the boiler or the hot water cylinder.', 'Your hot water has already been switched on at the controls and stays on until 21:30. If it’s still not coming through, it’s most likely the boiler itself, so I’ll log it for our team.', 'Hot water at time of call: switched on at the controls until 21:30.'],
  ['off-until', 'Hot water setting: switched off until a time', 'Hot water has been switched off at the controls until 22:00', 'Switched off', 'That is the likely reason there is no hot water. It goes back to its normal timetable at 22:00. We can’t change it from here, so log it if the customer needs it sooner.', 'Your hot water has been switched off at the controls until 22:00, and then it goes back to normal. I’ll log that you need it back sooner so our team can look at it.', 'Hot water at time of call: switched off at the controls until 22:00.'],
  ['on-v1', 'Hot water setting: switched on (no end time)', 'Hot water has been switched on at the controls', 'Switched on', 'These controls don’t say when it ends. They are asking for hot water, so if there is still none, the likely cause is the boiler or the hot water cylinder.', 'Your hot water has been switched on at the controls. If it’s still not coming through, it’s most likely the boiler itself, so I’ll log it for our team.', 'Hot water at time of call: switched on at the controls.'],
  ['off-v1', 'Hot water setting: switched off (no end time)', 'Hot water has been switched off at the controls', 'Switched off', 'That is the likely reason there is no hot water. These controls don’t say when it ends, and we can’t change it from here, so log it.', 'Your hot water has been switched off at the controls. I’ll log it so our team can switch it back on for you.', 'Hot water at time of call: switched off at the controls.'],
  ['cc-stale', 'Hot water setting: controls not reporting', 'We can’t see the hot water setting right now', 'Can’t confirm', 'The heating controls last reported 3 hours ago. Don’t tell the customer whether the hot water is on or off.', 'I can’t see your hot water setting from here at the moment, so I’ll log it for our team to check.', 'Hot water at time of call: could not be confirmed (heating controls last reported 3 hours ago).'],
  ['cc-notreconf', 'Hot water setting: not confirmed recently', 'We can’t see the hot water setting right now', 'Can’t confirm', 'The heating controls haven’t confirmed the hot water setting recently. Don’t tell the customer whether the hot water is on or off.', 'I can’t see your hot water setting from here at the moment, so I’ll log it for our team to check.', 'Hot water at time of call: could not be confirmed (heating controls haven’t confirmed it recently).'],
  ['cc-decode', 'Hot water setting: reading doesn’t make sense', 'We can’t see the hot water setting right now', 'Can’t confirm', 'The hot water reading from the heating controls doesn’t make sense right now. Don’t tell the customer whether the hot water is on or off.', 'I can’t see your hot water setting from here at the moment, so I’ll log it for our team to check.', 'Hot water at time of call: could not be confirmed (reading doesn’t make sense).']
];
for (const [k, title, hd, tag, gtk, say, ts] of DHW) {
  add({ id: 'HW-0-dhw-' + k, flow: 'Hot water', title, ref: 'flows.js:560-675 (+ twin services/tb-device.js dhwOverrideOutcome)', kind: 'step',
    done: 'Hot water: we can see it but can’t change it from here', hd, tag, gtk, say, ticketSentence: ts, chips: HWQ });
}
add({ id: 'HW-0-nlh', flow: 'Hot water', title: 'First screen (hot water not on Lighthouse)', ref: 'flows.js:1777-1781', kind: 'step',
  done: 'Hot water: not on Lighthouse at this site', hd: 'Hot water here isn’t on Lighthouse',
  gtk: 'It runs on the site’s own boiler or system and isn’t connected to us, so we can’t see or change it.',
  chips: [['Log it for the IoT helpdesk', 'HW-nlh', true]] });
add({ id: 'HW-nlh', flow: 'Hot water', title: 'Outcome: not on Lighthouse, logged', ref: 'flows.js:1803-1811', kind: 'outcome',
  hd: 'Hot water isn’t on Lighthouse at this site',
  say: 'Your hot water isn’t connected to our system, so I can’t see it from here. I’ll log it so our team can follow it up.',
  log: { type: 'capture', subject: 'Hot water issue: not on Lighthouse', detail: 'Customer reports a hot water problem. Hot water at this site is not connected to Lighthouse, so we can’t see or change it. Logged for the IoT helpdesk to follow up.' } });
add({ id: 'HW-cap', flow: 'Hot water', title: 'Outcome: can’t change it from here, logged', ref: 'flows.js:1812-1827', kind: 'outcome',
  hd: 'We can’t change the hot water from here',
  say: 'I can’t change your hot water from here, so I’ll log it for our team as a priority for the morning. If it’s urgent tonight, the controls on the boiler itself may let you turn the hot water on by hand. If you call out a boiler engineer, the visit may be chargeable if the fault isn’t our equipment.',
  log: { type: 'capture', subject: 'Hot water issue: can’t be fixed from here tonight', detail: 'Customer reports a hot water problem. Hot water is run by the boiler’s own controls; we can see it but can’t change it from here. Needs IoT helpdesk or boiler follow-up. [+ the hot water setting sentence, when one was shown]' } });
add({ id: 'HW-sc', flow: 'Hot water', title: 'Outcome: sounds like the boiler itself', ref: 'flows.js:1828-1841', kind: 'outcome',
  hd: 'This sounds like the boiler itself',
  say: 'From what you’re describing, this sounds like the boiler itself rather than our controls, so it’s one for your boiler company. I’ll log tonight’s call so there’s a record.',
  gtk: 'Our controls only ask the boiler for hot water. Faults inside the boiler, such as low pressure or the pilot light, are not our equipment.',
  log: { type: 'scope-only', subject: 'Hot water: likely a boiler fault', detail: 'Lighthouse can see the hot water demand here; the boiler itself (pressure, circuit board, pilot light) is not Lighthouse equipment. Customer advised to call their boiler company. [+ the hot water setting sentence, when one was shown]' } });

/* ============================== KITCHEN ============================== */
const NOWQ = [['Yes, it’s needed now', 'K-crit'], ['No, it’s needed later or tomorrow', 'K-ncrit']];
add({ id: 'K-legacy-0', flow: 'Kitchen', title: 'First screen (no live reading for this kitchen)', ref: 'flows.js:1855-1861', kind: 'step',
  done: 'Kitchen equipment: we can reach it', q: 'Is the kitchen needed for service right now (food being served or hotel breakfast)?', chips: NOWQ });
add({ id: 'K-crit', flow: 'Kitchen', title: 'P1: kitchen off during service', ref: 'flows.js:1892-1899 and 2051-2058', kind: 'p1',
  hd: 'Kitchen off during service: raise a P1',
  gtk: 'It can’t be switched on from here, so the on-duty manager needs to call the site back.',
  sayAfter: D2 + ' In the meantime, the manual control button on the PowerPause unit, if you have one, is safe to use.',
  log: { type: 'escalate-p1', subject: 'Kitchen equipment off during service — P1 (unchanged)', detail: 'Kitchen equipment off while the site is serving food. It can’t be switched from here; needs immediate IoT helpdesk action.' } });
add({ id: 'K-ncrit', flow: 'Kitchen', title: 'Outcome: needed later, logged', ref: 'flows.js:1901-1908 and 2060-2067', kind: 'outcome',
  hd: 'The kitchen isn’t needed until later',
  say: 'Your kitchen equipment comes on at its set times. I can’t safely change those times tonight, so I’ll log it and our team will sort the times with you tomorrow.',
  log: { type: 'capture', subject: 'Kitchen equipment: request to change its times', detail: 'Customer needs kitchen equipment outside its set times (07:00–23:00). Times can’t be changed out of hours, so logged for the IoT helpdesk.' } });
add({ id: 'K-picker', flow: 'Kitchen', title: 'Which equipment (several circuits)', ref: 'flows.js:1881-1886', kind: 'step',
  q: 'Which bit of kitchen equipment is the problem?', chips: [['Fryer', 'K-vA'], ['Glass washer', 'K-vB'], ['Dishwasher', 'K-vD'], ['Pot wash', 'K-vE'], ['Bain-marie', 'K-vC'], ['Several or all of it', 'K-all']] });
const BTN = [['Sorted with the manual control button', 'K-override-ok', true], ['The button didn’t work', 'K-override-fail']];
const REP = [['Site will contact their repairs team', 'K-repairs', true], ['Customer still thinks it’s our problem', 'K-still-ours']];
add({ id: 'K-vA', flow: 'Kitchen', title: 'Off, but should have come on', ref: 'flows.js:1950-1953', kind: 'step',
  hd: 'The fryer is off, but its timetable says it should have come on at 11:30',
  say: 'Your fryer is off, but it should have come on at 11:30, so it looks like it hasn’t started by itself. The PowerPause unit has a manual control button on the front. Pressing it once should bring it on straight away.',
  fact: 'Checked at 19:42: the fryer is off; its timetable has it on since 11:30.', chips: BTN });
add({ id: 'K-vB', flow: 'Kitchen', title: 'On, as its timetable expects', ref: 'flows.js:1954-1957', kind: 'step',
  hd: 'The glass washer is on, as its timetable expects, until 23:00',
  say: 'Your glass washer has power and its timetable says it should be on. If it still isn’t working, it’s most likely a fault with the appliance itself, so please contact your repairs team.',
  fact: 'Checked at 19:42: the glass washer is on; its timetable has it on from 11:30 until 23:00.', chips: REP });
add({ id: 'K-vB-unscheduled', flow: 'Kitchen', title: 'On, no timetable (contradiction fixed)', ref: 'flows.js:1970-1973', kind: 'step', inj: true,
  hd: 'The glass washer is on (it has no timetable, so it stays on)',
  say: 'Your glass washer has power. It doesn’t have a timetable, so it’s meant to stay on. If it still isn’t working, it’s most likely a fault with the appliance itself, so please contact your repairs team.',
  fact: 'Checked at 19:42: the glass washer is on; it has no timetable.', chips: REP });
add({ id: 'K-vB-outside', flow: 'Kitchen', title: 'On outside its set times (contradiction fixed)', ref: 'flows.js:1974-1977', kind: 'step', inj: true,
  hd: 'The glass washer is on outside its set times',
  say: 'Your glass washer has power. It’s outside its usual times, so someone has probably switched it on by hand at the PowerPause unit. If it still isn’t working, it’s most likely a fault with the appliance itself, so please contact your repairs team.',
  gtk: 'Next timetable change: off at 23:00.',
  fact: 'Checked at 19:42: the glass washer is on; its timetable has it off since 15:00.', chips: REP });
add({ id: 'K-vC', flow: 'Kitchen', title: 'Off, as its timetable expects', ref: 'flows.js:1958-1961', kind: 'step',
  hd: 'The bain-marie is off, as its timetable expects, until 17:00',
  say: 'Your bain-marie is off because that’s what its timetable says at this time of day. It’s due to come on at 17:00. If you need it on now, press the manual control button on the PowerPause unit once to bring it on early. It goes back to its normal timetable at its next change.',
  fact: 'Checked at 15:42: the bain-marie is off; its timetable has it off until 17:00.', chips: BTN });
add({ id: 'K-vD', flow: 'Kitchen', title: 'Off, but meant to stay on', ref: 'flows.js:1962-1965', kind: 'step',
  hd: 'The dishwasher is off, but it’s meant to stay on',
  say: 'That circuit doesn’t have a timetable, so it’s meant to stay on. It looks like it may have tripped. Could you check your fuse board while I wait? If a switch has tripped, resetting it should bring it back.',
  fact: 'Checked at 19:42: the dishwasher is off; it has no timetable.', chips: [['Fuse board had tripped, resetting it fixed it', 'K-fuse-fixed', true], ['Fuse board is fine, still off', 'K-fuse-fail']] });
add({ id: 'K-vE', flow: 'Kitchen', title: 'On, but using no power', ref: 'flows.js:1966-1969', kind: 'step',
  hd: 'The pot wash has power but isn’t using any',
  say: 'Power is reaching your pot wash but it isn’t using any, so it’s most likely a fault with the appliance itself. Please contact your repairs team.',
  gtk: 'The circuit is on but the appliance draws nothing, so it may have tripped inside or been switched off at the unit.',
  fact: 'Checked at 19:42: the pot wash is on but using no power.', chips: REP });
add({ id: 'K-voff-unknown', flow: 'Kitchen', title: 'Off, timetable can’t be read', ref: 'flows.js:1978-1981', kind: 'step', inj: true,
  hd: 'The glass washer is off, and we can’t read its timetable',
  say: 'Your glass washer is off, but I can’t see its timetable right now. The PowerPause unit has a manual control button on the front. Pressing it once should bring it on straight away.',
  fact: 'Checked at 19:42: the glass washer is off; its timetable couldn’t be read.', chips: BTN });
add({ id: 'K-vfallback', flow: 'Kitchen', title: 'Live reading not available', ref: 'flows.js:1941-1945', kind: 'step', inj: true,
  hd: 'We can’t read the kitchen equipment right now', q: 'Is the kitchen needed for service right now (food being served or hotel breakfast)?', chips: NOWQ });
add({ id: 'K-all', flow: 'Kitchen', title: 'Several or all of it (summary)', ref: 'flows.js:2071-2088', kind: 'step',
  list: ['Fryer: off, should be on', 'Glass washer: on', 'Dishwasher: off, should stay on', 'Pot wash: on, but using no power', 'Bain-marie: off until its set time'],
  hd: 'The fryer is off, but its timetable says it should have come on at 11:30',
  say: 'Your fryer is off, but it should have come on at 11:30, so it looks like it hasn’t started by itself. The PowerPause unit has a manual control button on the front. Pressing it once should bring it on straight away.',
  fact: 'Checked at 19:42: the fryer is off; its timetable has it on since 11:30.', chips: BTN });
add({ id: 'K-override-ok', flow: 'Kitchen', title: 'Outcome: sorted with the manual control button', ref: 'flows.js:2000-2013', kind: 'outcome',
  done: 'Sorted on site with the manual control button',
  hd: 'Sorted on site with the manual control button',
  say: 'That’s sorted. I’ll log it so our team can check its timetable tomorrow.',
  log: { type: 'capture', subject: 'Kitchen circuit sorted on site with the manual control button', detail: 'Kitchen circuit didn’t come on at its set time; customer sorted it with the PowerPause manual control button. Checked at 19:42: the fryer is off; its timetable has it on since 11:30.' } });
add({ id: 'K-fuse-fixed', flow: 'Kitchen', title: 'Outcome: fuse board reset fixed it', ref: 'flows.js:2019-2027', kind: 'outcome',
  done: 'Fuse board had tripped, resetting it fixed it',
  hd: 'Sorted on site: the fuse board had tripped',
  say: 'Glad that’s sorted. I’ll log it so our team can check why it tripped.',
  log: { type: 'capture', subject: 'Kitchen circuit tripped, fixed on site', detail: 'Kitchen circuit that should stay on had tripped; reset on site. Checked at 19:42: the dishwasher is off; it has no timetable.' } });
add({ id: 'K-repairs', flow: 'Kitchen', title: 'Outcome: site will call their repairs team', ref: 'flows.js:2033-2041', kind: 'outcome',
  done: 'Site will contact their repairs team',
  hd: 'Appliance fault: the site will contact their repairs team',
  say: 'I’ll log tonight’s call. If your repairs team can’t get out tonight and the kitchen can’t serve, call us back and we’ll escalate it.',
  log: { type: 'capture', subject: 'Kitchen appliance fault: site referred to repairs', detail: 'Power reaching the glass washer; appliance fault likely; site referred to their repairs team. Checked at 19:42: the glass washer is on; its timetable has it on from 11:30 until 23:00.' } });
for (const [k, done] of [['override-fail', 'The manual control button didn’t work'], ['fuse-fail', 'Fuse board is fine, still off'], ['still-ours', 'Customer still thinks it’s our problem']]) {
  add({ id: 'K-' + k, flow: 'Kitchen', title: 'Follow-up: is it needed now? (' + done + ')', ref: 'flows.js:2014-2045', kind: 'step', done, q: 'Is the kitchen needed for service right now?', chips: NOWQ });
}

/* ============================== LIGHTING ============================== */
const LQ = [['Customer turned them on with the switch', 'L-ok', true], ['Still not working', 'L-p1']];
add({ id: 'L-0-online', flow: 'Outside lighting', title: 'First screen (can’t switch from here)', ref: 'flows.js:2104-2118', kind: 'step',
  done: 'Outside lights: the lighting controller is online',
  hd: 'We can’t switch the outside lights from here',
  say: 'Your outside lights have a sensor that turns them on by itself at dusk, so they normally look after themselves. If they haven’t come on tonight, flip the Lighthouse lighting switch on site to turn them on by hand. That only covers tonight. The sensor takes over again by itself from tomorrow, so there’s nothing to reset.',
  gtk: 'Switching outside lights from here isn’t available at this site yet.', chips: LQ });
add({ id: 'L-0-offline', flow: 'Outside lighting', title: 'First screen (lighting controller not responding)', ref: 'flows.js:2104-2118', kind: 'step',
  done: 'Outside lights: the lighting controller isn’t responding',
  hd: 'The outside lighting controller isn’t responding',
  say: 'Your outside lights have a sensor that turns them on by itself at dusk. The lighting controller isn’t responding at the moment, which is usually a tripped switch on the fuse board, so please check that first. If the fuse board looks fine, flip the Lighthouse lighting switch on site to turn the lights on by hand. That only covers tonight; the sensor takes over again from tomorrow.',
  gtk: 'A controller that isn’t responding often means a tripped fuse board.', chips: LQ });
add({ id: 'L-0-switch', flow: 'Outside lighting', title: 'First screen (can switch from here)', ref: 'flows.js:2108-2118', kind: 'step',
  done: 'Outside lights: the lighting controller is online',
  rows: [['Car park lights: currently off', 'Turn on']],
  hd: 'You can switch the outside lights from here',
  say: 'Your outside lights normally come on by themselves at dusk. I can switch them on from here for you now.',
  gtk: 'Use the Turn on button above. It only counts as done once the lights confirm it.', note: 'The circuit row no longer shows the device code.',
  chips: [['Customer turned them on with the switch', 'L-ok'], ['Still not working', 'L-p1']] });
add({ id: 'L-ok', flow: 'Outside lighting', title: 'Outcome: turned on by hand on site', ref: 'flows.js:2121-2129', kind: 'outcome',
  done: 'Customer turned the lights on with the on-site switch',
  hd: 'Outside lights turned on by hand on site',
  say: 'Great, that’s them on. I’ll still log it so our team can check why they didn’t come on by themselves.',
  log: { type: 'capture', subject: 'Outside lights: turned on by hand on site', detail: 'Customer turned the outside lights on with the on-site switch after guidance. Logged so the IoT helpdesk can check why they didn’t come on by themselves.' } });
add({ id: 'L-p1', flow: 'Outside lighting', title: 'P1: still not working', ref: 'flows.js:2130-2136', kind: 'p1',
  done: 'On-site switch didn’t work: P1',
  hd: 'Outside lights still not working: raise a P1',
  gtk: 'It may be the electrical supply rather than the lighting control, so the on-duty manager will call the site back.',
  sayAfter: D2 + ' If the dark frontage is a safety concern right now, your site’s duty-manager procedure for calling out an electrician still applies, as this may be an electrical supply issue rather than the lighting control.',
  log: { type: 'escalate-p1', subject: 'External lighting not working — P1 (unchanged)', detail: 'Outside lights still off after the on-site switch; possibly a tripped supply or a failed controller. Can’t be switched from here; needs urgent IoT helpdesk or electrical follow-up.' } });

/* ============================== FANS ============================== */
add({ id: 'FAN-0', flow: 'Extractor fans', title: 'First screen (can’t switch from here)', ref: 'flows.js:2157-2159', kind: 'step',
  done: 'Extractor fans: the controller is online',
  hd: 'We can’t switch the extractor fans from here',
  gtk: 'Fan control from here isn’t available at this site yet. Note exactly what the customer needs.',
  field: 'What does the customer need? (times, which fans)', chips: [['Log it for the IoT helpdesk', 'FAN-cap', true]] });
add({ id: 'FAN-0-switch', flow: 'Extractor fans', title: 'First screen (can switch from here)', ref: 'flows.js:2148-2156', kind: 'step', inj: true,
  done: 'Extractor fans: the controller is online',
  rows: [['Kitchen extractor fans: currently on', 'Turn off']],
  hd: 'You can switch the extractor fans from here',
  gtk: 'Use the button above. It only counts as done once the fans confirm it. If the customer needs different times instead, note them below.',
  field: 'Different times needed? (optional)', chips: [['Log it for the IoT helpdesk', 'FAN-cap', true]] });
add({ id: 'FAN-cap', flow: 'Extractor fans', title: 'Outcome: request logged', ref: 'flows.js:2161-2168', kind: 'outcome',
  done: 'Request: fans on until 1am for a deep clean',
  hd: 'Fan request noted for the IoT helpdesk',
  say: 'I’ll log exactly what you need, with the times, and our team will sort it. If the fans are needed for cooking safety right now, use the manual switch on site.',
  log: { type: 'capture', subject: 'Extractor fan request', detail: 'Customer request: fans on until 1am for a deep clean. Fans can’t be changed from here out of hours; logged for the IoT helpdesk.' } });

/* ============================== FRIDGES ============================== */
add({ id: 'FR-0', flow: 'Fridges and freezers', title: 'First screen', ref: 'flows.js:2174-2179', kind: 'step',
  done: 'Fridges and freezers: we monitor them but can’t control them',
  hd: 'We can see fridge temperatures but can’t control the fridges',
  gtk: 'A warm fridge or freezer is an appliance fault.',
  q: 'Is stock at risk right now (a freezer warming up, a big temperature alarm)?', chips: [['Yes, stock at risk', 'FR-risk'], ['No, just a question', 'FR-q']] });
add({ id: 'FR-risk', flow: 'Fridges and freezers', title: 'P1: stock at risk', ref: 'flows.js:2181-2189', kind: 'p1',
  hd: 'Stock at risk: raise a P1',
  gtk: 'We monitor the temperatures but can’t control the appliances, so the on-duty manager will call back with advice.',
  sayAfter: D2 + ' The fridge itself isn’t controlled by Lighthouse, so alongside our callback you should follow your normal appliance repair route.',
  log: { type: 'escalate-p1', subject: 'Refrigeration temperature alarm — stock at risk (unchanged)', detail: 'Customer reports a fridge or freezer failure with stock at risk. We monitor temperatures but can’t control the appliances; escalated for urgent advice and an appliance callout.' } });
add({ id: 'FR-q', flow: 'Fridges and freezers', title: 'Outcome: just a question (headline fixed)', ref: 'flows.js:2190-2194', kind: 'outcome', fix: 'scope',
  hd: 'We monitor the fridges but don’t control them',
  say: 'We keep an eye on your fridge temperatures, but we don’t control the fridges themselves. For a faulty unit, your usual repairs process is the right route. I’ll log the call.',
  log: { type: 'scope-only', subject: 'Fridge or freezer question: monitored only', detail: 'Lighthouse monitors fridge and freezer temperatures for alerts; the appliances are repaired through the site’s normal repairs route.' } });

/* ============================== CONNECTIVITY ============================== */
add({ id: 'CN-allonline', flow: 'Connection check', title: 'Everything online', ref: 'flows.js:2267-2268', kind: 'step',
  done: 'Connection check: everything at the site is online',
  hd: 'Everything at this site is online',
  say: 'Everything of ours at your site is showing online. Tell me what isn’t working and I’ll log it for our team.',
  gtk: 'Our equipment looks healthy, so it may be a different fault. Note exactly what the customer describes.',
  chips: [['Log what the customer describes', 'CN-report', true]] });
add({ id: 'CN-report', flow: 'Connection check', title: 'Outcome: everything online, customer’s report logged (new: was the “offline” card)', ref: 'flows.js:2268 and 2302-2307', kind: 'outcome', fix: 'cn',
  hd: 'Everything is online: logging what the customer describes',
  say: 'Everything of ours at your site is showing online, so I’ll log exactly what you’ve described for our team to look into.',
  log: { type: 'capture', subject: 'Customer report: site equipment all online', detail: 'All Lighthouse equipment at the site was online at the time of the call. Customer’s words are on the ticket. Logged for the IoT helpdesk.' } });
add({ id: 'CN-anchoroff', flow: 'Connection check', title: 'Lighthouse unit offline', ref: 'flows.js:2239-2244', kind: 'step',
  done: 'Connection check: the Lighthouse unit on the wall is offline',
  hd: 'The Lighthouse unit at this site is offline',
  gtk: 'It’s the wall-mounted unit that connects the site. Nothing can be changed from here while it’s down. It’s usually power or internet at the site.',
  say: 'The Lighthouse unit on your wall isn’t responding, which normally means it’s lost power or internet. Could you check the fuse board hasn’t tripped, that the unit has lights on, and that the router is on? I’ll stay on the line.',
  q: 'After the customer checks:', chips: [['It’s back online, lights on', 'CN-back', true], ['Still off', 'CN-cap']] });
add({ id: 'CN-back', flow: 'Connection check', title: 'Outcome: back online during the call', ref: 'flows.js:2272-2280', kind: 'outcome',
  done: 'The site’s power or internet came back',
  hd: 'Back online after the customer’s checks',
  say: 'That’s it back online. Give it ten minutes to settle. I’ll log it so our team can check it stays healthy overnight.',
  log: { type: 'capture', subject: 'Lighthouse unit offline: back online during the call', detail: 'The Lighthouse unit was offline; the customer checked the fuse board and power and it came back. Logged for the IoT helpdesk to check it stays online overnight.' } });
add({ id: 'CN-cap', flow: 'Connection check', title: 'Outcome: Lighthouse unit still offline', ref: 'flows.js:2302-2307', kind: 'outcome',
  hd: 'The Lighthouse unit is still offline',
  say: 'I can’t fix this from here while the Lighthouse unit is offline, so I’ll log it as a priority for our team. Anything electrical, like a tripped switch that won’t reset, is one for your own electrician tonight.',
  log: { type: 'capture', subject: 'Lighthouse unit offline: equipment can’t be reached', detail: 'Equipment can’t be reached after the customer’s power and router checks. Nothing can be changed from here; needs an IoT helpdesk connection check.' } });
add({ id: 'CN-gwless', flow: 'Connection check', title: 'Site with no Lighthouse unit (equipment connects on its own)', ref: 'flows.js:2227-2236', kind: 'step',
  done: 'Connection check: this site’s equipment connects on its own',
  hd: 'The equipment you’re calling about isn’t responding',
  gtk: 'This site has no single Lighthouse unit; each piece of equipment connects on its own.', note: 'When the equipment is responding, the headline reads “The equipment you’re calling about is responding”.',
  q: 'Log it for the IoT helpdesk, or check again if the customer says it’s working again.',
  chips: [['Log it for the IoT helpdesk', 'CN-dcap', true], ['Customer says it’s working again', 'CN-gwless']] });
add({ id: 'CN-dcap', flow: 'Connection check', title: 'Outcome: equipment not responding (no Lighthouse unit)', ref: 'flows.js:2294-2301', kind: 'outcome',
  hd: 'The equipment isn’t responding',
  say: 'Your equipment connects on its own rather than through one hub, and the unit you’re calling about isn’t responding, so I can’t reach it from here tonight. I’ll log it as a priority for our team.',
  log: { type: 'capture', subject: 'Equipment not responding: site with no Lighthouse unit', detail: 'This site’s equipment connects on its own (no Lighthouse unit). The equipment the customer reported isn’t responding. Needs an IoT helpdesk connection check (raised from the heating questions).' } });
add({ id: 'CN-group1', flow: 'Connection check', title: 'One equipment group offline', ref: 'flows.js:2249-2265', kind: 'step',
  done: 'Connection check: the site is reachable, 1 equipment group isn’t responding',
  hd: 'The boiler equipment isn’t responding',
  gtk: 'The site is reachable, but the boiler equipment has lost its own connection. Other equipment at this site can still be reached.',
  q: 'Log it for the IoT helpdesk, or check again if the customer says it’s working again.',
  chips: [['Log it for the IoT helpdesk', 'CN-gcap', true], ['Customer says it’s working again', 'CN-group1']] });
add({ id: 'CN-group2', flow: 'Connection check', title: 'Two equipment groups offline', ref: 'flows.js:2249-2265', kind: 'step',
  done: 'Connection check: the site is reachable, 2 equipment groups aren’t responding',
  hd: 'Two equipment groups aren’t responding',
  gtk: 'The site is reachable, but the boiler and the main distribution board have each lost their own connection. Other equipment at this site can still be reached.',
  q: 'Log it for the IoT helpdesk, or check again if the customer says it’s working again.',
  chips: [['Log it for the IoT helpdesk', 'CN-gcap', true], ['Customer says it’s working again', 'CN-group2']] });
add({ id: 'CN-gcap', flow: 'Connection check', title: 'Outcome: equipment group offline', ref: 'flows.js:2282-2292', kind: 'outcome',
  hd: 'The boiler equipment has lost its connection',
  say: 'The site itself is online, but the unit that runs that equipment has lost its connection, so I can’t reach it from here tonight. I’ll log it as a priority for our team.',
  log: { type: 'capture', subject: 'Equipment offline: boiler can’t be reached', detail: 'Site reachable, but the boiler equipment group has lost its connection, so it can’t be reached from here. Needs an IoT helpdesk connection check.' } });

/* ============================== CONTRACTOR ============================== */
add({ id: 'CT-0', flow: 'Contractor on site', title: 'First screen (unchanged apart from labels)', ref: 'flows.js:2311-2316', kind: 'step',
  hd: 'Contractor on site: always urgent, an engineer is waiting',
  fields: ['Contractor and company', 'What do they need?'], chips: [['Next', 'CT-1', true]] });
add({ id: 'CT-1', flow: 'Contractor on site', title: 'Do they need the manual control button steps?', ref: 'flows.js:2318-2325', kind: 'step',
  done: 'Contractor: Dan Price, Northern Refrigeration · needs the fryers on to test the gas interlock',
  q: 'Does the contractor need help using the manual control button on the PowerPause unit?',
  chips: [['Yes, show the steps', 'CT-pp-type'], ['No, escalate now', 'CT-p1']] });
add({ id: 'CT-p1', flow: 'Contractor on site', title: 'P1: escalate now', ref: 'flows.js:2327-2334', kind: 'p1', audience: 'contractor',
  hd: 'Contractor waiting on site: raise a P1',
  sayAfter: D2 + ' Please ask the engineer to hold on.',
  log: { type: 'escalate-p1', subject: 'Contractor on site needs IoT support — P1 (unchanged)', detail: 'Contractor Dan Price, Northern Refrigeration, on site now: needs the fryers on to test the gas interlock. Escalated straight away.' } });
add({ id: 'CT-pp-type', flow: 'Contractor on site', title: 'Manual control button: find the unit', ref: 'flows.js:2362-2380', kind: 'step', audience: 'contractor',
  done: 'Manual control button steps given to the contractor',
  hd: 'Using the manual control button on the PowerPause unit',
  say: 'Step 1, find the unit: “The PowerPause unit is usually near the kitchen distribution boards, behind a large appliance, or on the ceiling nearby. It will be labelled.” Step 2, check the label: “There should be a label on the unit saying either Tongou or Owon. Which does it say?”',
  q: 'Which unit is it?', chips: [['Tongou', 'CT-pp-instr'], ['Owon', 'CT-pp-instr']] });
add({ id: 'CT-pp-instr', flow: 'Contractor on site', title: 'Manual control button: press it', ref: 'flows.js:2382-2398', kind: 'step', audience: 'contractor',
  done: 'Tongou unit: manual control button steps given',
  hd: 'Tongou unit: press the manual control button once',
  say: 'Press the manual control button on the front of the Tongou unit once. Don’t hold it down. The equipment should come on within a few seconds, and it stays on until the unit’s next timetable change.',
  gtk: 'This is temporary. The unit goes back to its normal timetable at its next change.',
  chips: [['Done: log the call', 'CT-ppdone', true]] });
add({ id: 'CT-ppdone', flow: 'Contractor on site', title: 'P1: button used, call logged', ref: 'flows.js:2400-2408', kind: 'p1', audience: 'contractor',
  hd: 'Contractor used the manual control button: raise the P1',
  sayAfter: 'I’ve logged this call. It will stay on until the unit’s next timetable change. If the problem comes back, ring us back and we’ll escalate it further.',
  log: { type: 'escalate-p1', subject: 'PowerPause contractor: manual control button steps given on site', detail: 'Contractor Dan Price, Northern Refrigeration, given the PowerPause manual control button steps (Tongou unit). On until the unit’s next timetable change.' } });
add({ id: 'CT-dd', flow: 'Contractor on site', title: 'Donkey Derby (site 6786) exception', ref: 'flows.js:2337-2360', kind: 'step', audience: 'contractor', inj: true,
  done: 'Donkey Derby: the manual control button doesn’t apply here',
  hd: 'Donkey Derby (site 6786): the manual control button doesn’t work here',
  gtk: 'This site uses a different kind of unit, so the manual control button steps don’t apply.',
  say: 'I’m sorry, the equipment at this site can’t be switched on by hand. I’m escalating it to our team right now and they’ll contact the site directly. Our team’s direct line is 023 814 0228, and the email is iot@airedale-group.co.uk.',
  chips: [['Raise the P1', 'CT-ddesc', true]] });
add({ id: 'CT-ddesc', flow: 'Contractor on site', title: 'P1: Donkey Derby escalation', ref: 'flows.js:2338-2346', kind: 'p1', audience: 'contractor', inj: true,
  hd: 'Donkey Derby: raise a P1',
  sayAfter: 'I’ve escalated this as a priority, and our team will be in touch shortly. Their direct line is 023 814 0228.',
  log: { type: 'escalate-p1', subject: 'PowerPause: Donkey Derby (site 6786): IoT helpdesk escalation', detail: 'Contractor Dan Price, Northern Refrigeration, on site at Donkey Derby (6786). The PowerPause manual control button doesn’t apply at this site. Escalated to the IoT helpdesk.' } });

/* ============================== SOMETHING ELSE + AIRCON ============================== */
add({ id: 'O-0', flow: 'Something else', title: 'First screen', ref: 'flows.js:2419-2426', kind: 'step',
  q: 'Describe the issue in the customer’s words', field: 'e.g. “the voltage optimiser needs resetting, is that you?”',
  chips: [['Check if Lighthouse controls it', 'O-1'], ['Log it as described', 'O-choice']] });
add({ id: 'O-1', flow: 'Something else', title: 'Which is it closest to?', ref: 'flows.js:2431-2433', kind: 'step',
  done: 'Issue: “The voltage optimiser is beeping”', q: 'Which of these is it closest to?',
  chips: [['Heating', 'O-mon'], ['Kitchen equipment', 'O-ctl'], ['External lighting', 'O-none']],
  gtk: 'This checks what Lighthouse has at this site, so it can say for certain what is and isn’t ours. It can’t always settle a fault inside shared equipment, such as the boiler behind our controls.' });
add({ id: 'O-choice', flow: 'Something else', title: 'P1 or normal priority (unchanged, OOHDASH-134/153)', ref: 'flows.js:2367-2383', kind: 'step',
  done: 'Issue: “Cellar cooler alarm going off”', q: 'How should this be raised?',
  chips: [['P1 Escalation', 'O-p1'], ['Raise a Normal Priority ticket', 'O-normal']],
  gtk: 'A P1 is anything that is immediately health and safety or business trading affecting. Please only use this option after you’ve attempted to follow through one of the circumstance tiles. P1 escalation will send a text to the escalation manager on the IoT Support team immediately upon submission.' });
add({ id: 'O-normal', flow: 'Something else', title: 'Outcome: normal priority', ref: 'flows.js:2435-2444', kind: 'outcome',
  done: 'Raised as a normal priority ticket',
  hd: 'Logged as described',
  say: 'I’ll log exactly what you’ve described for our team, and they’ll pick it up on the next working day. If it becomes urgent tonight, ring back and we’ll escalate it.',
  log: { type: 'capture', subject: 'General issue logged', detail: 'Customer reported: cellar cooler alarm going off. Logged word for word for the IoT helpdesk.' } });
add({ id: 'O-p1', flow: 'Something else', title: 'P1: urgent', ref: 'flows.js:2445-2456', kind: 'p1',
  done: 'P1 Escalation chosen',
  hd: 'Urgent: raise a P1',
  sayAfter: D2,
  log: { type: 'escalate-p1', subject: 'Something else - urgent, escalated as P1 (unchanged)', detail: 'Customer reported: smoke smell from the plant room. Didn’t fit a specific tile; agent judged it urgent tonight.' } });
add({ id: 'O-ctl', flow: 'Something else', title: 'It is controlled here', ref: 'flows.js:2463', kind: 'step',
  done: 'Checked: kitchen equipment is controlled from here',
  hd: 'Kitchen equipment can be controlled from here at this site',
  gtk: 'Use the Kitchen equipment questions to sort it.', chips: [['Back to the issue picker', null]] });
add({ id: 'O-mon', flow: 'Something else', title: 'Outcome: monitored only (headline fixed)', ref: 'flows.js:2464-2470', kind: 'outcome', fix: 'scope',
  done: 'Checked: heating is monitored here, not controlled',
  hd: 'Heating is monitored here, not controlled',
  say: 'We can see your heating here, but we can’t change it from here, so I’ll log your request for our team rather than leave you going round in circles.',
  log: { type: 'scope-only', subject: 'Heating: monitored only', detail: 'Heating is monitored by Lighthouse at this site but can’t be changed from here. Customer’s issue: bar is cold.' } });
add({ id: 'O-none', flow: 'Something else', title: 'Outcome: not on Lighthouse here', ref: 'flows.js:2471-2475', kind: 'outcome',
  done: 'Checked: external lighting isn’t on Lighthouse here',
  hd: 'External lighting isn’t on Lighthouse at this site',
  say: 'That isn’t part of our system at your site, so it’ll be one for your usual repairs route. I’ll log the call so there’s a record you asked.',
  log: { type: 'scope-only', subject: 'External lighting: not on Lighthouse at this site', detail: 'Lighthouse has no external lighting at The Wheatsheaf. Customer’s issue: car park lights out.' } });
add({ id: 'AC', flow: 'Air conditioning', title: 'Outcome: logged for the IoT helpdesk', ref: 'flows.js:1760-1768', kind: 'outcome',
  done: 'Air conditioning: can’t be changed from here',
  hd: 'Air conditioning can’t be changed from here',
  say: 'Air conditioning isn’t something I can change from here, so I’ll log it for our team and they’ll pick it up on the next working day. If it becomes urgent overnight, call back and we can escalate it.',
  log: { type: 'capture', subject: 'Air conditioning request (The Wheatsheaf)', detail: 'Customer raised an air conditioning issue. Air conditioning can’t be changed from here, so it is logged for the IoT helpdesk.' } });

/* ============================== SALUS HEATING (thermostats) ============================== */
add({ id: 'S-1', flow: 'Heating (thermostats)', title: 'Reading and “what does the customer need?”', ref: 'flows.js:1678-1705', kind: 'step',
  done: 'Area: Bar/Restaurant',
  read: '17.5°C · Target 18°C · reading just now · online',
  q: 'What does the customer need?',
  chips: [['Warmer', 'S-warm-buildheat'], ['Cooler', null], ['Turn it off', 'S-off-frost'], ['It’s not working', 'S-broken-keepingup']] });
add({ id: 'S-warm-buildheat', flow: 'Heating (thermostats)', title: 'Warmer, but already asking for heat', ref: 'flows.js:1708-1711', kind: 'step', inj: true,
  done: 'Asked for: warmer · the heating is already asking for heat',
  hd: 'Turning the thermostat up won’t help here',
  gtk: 'The room is 16°C against a target of 20°C and the thermostat is online, so it is already asking for more heat than the building is giving. That usually means the radiators, their valves or the boiler.',
  chips: [['Give heating advice and log it', 'S-buildheat', true], ['Turn the target temperature up anyway', 'CTL-compose-up']] });
add({ id: 'S-broken-keepingup', flow: 'Heating (thermostats)', title: 'Not working, but keeping up', ref: 'flows.js:1727-1729', kind: 'step', inj: true,
  done: 'Reported: heating not working',
  hd: 'The heating is keeping up',
  gtk: 'The room is 19.5°C against a target of 20°C. If the customer still says it’s cold, it’s likely a radiator, a radiator valve or which rooms are heated, not our controls.',
  chips: [['Give heating advice and log it', 'S-buildheat', true], ['Turn the target temperature up anyway', 'CTL-compose-up']] });
add({ id: 'S-broken-under', flow: 'Heating (thermostats)', title: 'Not working, below target', ref: 'flows.js:1730', kind: 'step', inj: true,
  done: 'Reported: heating not working',
  hd: 'The room is below its target temperature',
  gtk: 'The room is 17°C against a target of 20°C. Try turning the target temperature up. If the heating doesn’t respond, log it for the IoT helpdesk.',
  chips: [['Turn the target temperature up', 'CTL-compose-up', true], ['Log it for the IoT helpdesk instead', 'S-buildheat']] });
add({ id: 'S-off-frost', flow: 'Heating (thermostats)', title: 'Turn it off (thermostat has no off switch)', ref: 'flows.js:1717-1724', kind: 'step',
  done: 'Asked for: turn the heating off',
  hd: 'This thermostat can’t be switched fully off',
  say: 'This thermostat doesn’t have an off switch, but I can turn it right down so the heating stays off unless the building gets close to freezing.',
  gtk: 'The nearest safe option is to turn it down to 5°C. It goes back to normal when the set time ends.',
  chips: [['Turn heating off (down to 5°C)', 'CTL-compose-frost', true], ['No further action', 'S-offnoact']] });
add({ id: 'S-offnoact', flow: 'Heating (thermostats)', title: 'Outcome: no further action', ref: 'flows.js:1735-1742', kind: 'outcome', noAction: true,
  done: 'No further action',
  hd: 'No change made to the heating',
  say: 'I haven’t changed anything tonight. If you change your mind, call back and we can turn it off straight away.',
  log: { type: 'no-action', subject: 'Heating-off request: no change made (Bar area)', detail: 'Customer asked for the heating off; turning it down to 5°C was offered and declined. Nothing was changed.' } });
add({ id: 'S-buildheat', flow: 'Heating (thermostats)', title: 'Outcome: heating advice (headline fixed)', ref: 'flows.js:1744-1751', kind: 'outcome', fix: 'scope', inj: true,
  hd: 'The heating controls are doing their job',
  say: 'Your heating is already asking for full heat. It’s reaching 16 degrees against a higher target, which usually means the radiator valves or the boiler itself. It’s worth having your maintenance team check the radiators. I’ll log tonight’s reading either way.',
  log: { type: 'scope-only', subject: 'Heating complaint: controls working, room below target (Bar area)', detail: 'Room 16°C against a target of 20°C with the thermostat online and responding. Points to the radiators, their valves or the boiler, not a Lighthouse controls fault.' } });
add({ id: 'S-dark1', flow: 'Heating (thermostats)', title: 'Heating unit not reporting', ref: 'flows.js:1661-1667', kind: 'step',
  done: 'Area: Accommodation · not reporting',
  hd: 'This heating unit isn’t sending us any readings',
  say: 'That heating unit isn’t sending us any information at the moment, so I can’t see or change it from here tonight.',
  gtk: 'There is no live reading and it can’t be changed from here. This usually means it has lost power or its connection.', note: 'With several units the headline is “The heating units in this area aren’t sending us any readings”.',
  chips: [['Log it for the IoT helpdesk', 'S-darkcap', true], ['No further action', 'S-darknoact']] });
add({ id: 'S-darkcap', flow: 'Heating (thermostats)', title: 'Outcome: not reporting, logged', ref: 'flows.js:1646-1653', kind: 'outcome',
  hd: 'Heating unit not reporting: logging it',
  say: 'That heating unit isn’t sending us any information at the moment, so I can’t see or change it from here tonight. I’ll log it for our team to look into.',
  log: { type: 'capture', subject: 'Heating unit not reporting (Accommodation)', detail: 'The Accommodation heating unit is not reporting to Lighthouse (no live readings), so it can’t be read or changed from here. Logged for the IoT helpdesk to check the unit and its connection.' } });
add({ id: 'S-darknoact', flow: 'Heating (thermostats)', title: 'Outcome: no further action', ref: 'flows.js:1654-1660', kind: 'outcome', noAction: true,
  hd: 'No further action',
  say: 'I’ll log tonight’s call so there’s a record.',
  log: { type: 'no-action', subject: 'Heating unit not reporting (Accommodation): no further action', detail: 'Customer asked about Accommodation heating; the heating unit is not reporting to Lighthouse and the customer didn’t want a follow-up. Call logged for the record.' } });

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

/* ============================== OTHER SCREENS ============================== */
add({ id: 'SITE-confirm', flow: 'Other screens', title: 'Confirm the site', ref: 'views.js:117', kind: 'view',
  hd: 'The Wheatsheaf · 7412', say: 'Can I just confirm: you’re calling from The Wheatsheaf, site number 7412?', chips: [['✓ This is the right site', null, true], ['Search again', null]] });
add({ id: 'SITE-ambiguous', flow: 'Other screens', title: 'House number matches two sites', ref: 'views.js:75-107', kind: 'view',
  hd: 'House number 6758 matches more than one site',
  gtk: 'It matches Bowers and Bowman. To avoid changing the wrong site, nothing can be changed from here for this number.',
  say: 'I can’t safely make changes for this site number tonight, so I’ll log it for our team as a priority and they’ll pick it up.',
  chips: [['Log it for the IoT helpdesk', null, true], ['Search again', null]],
  log: { type: 'capture', subject: 'House number 6758 matches more than one site', detail: 'OOH couldn’t safely match house number 6758 to one site (it matches Bowers and Bowman). Logged for the IoT helpdesk to review.' } });
add({ id: 'SEARCH-none', flow: 'Other screens', title: 'Search: no match', ref: 'app.js:228, 234; views.js:33', kind: 'view',
  lines: ['No site matches “Zzyzx Arms”. Check the house number with the customer. If it’s still not found, the site may not be on Lighthouse: search by pub name, or log it.', 'Customer ringing back about an earlier issue? Use Callback Lookup →', '(Inventory down: “You can still log the customer’s issue: use “Something else” once the site is known, or raise it in Tonight, Raise a query.”)'] });
add({ id: 'CB-drawer', flow: 'Other screens', title: 'Callback ticket drawer', ref: 'views.js:406-420', kind: 'view',
  hd: 'Ticket #48213 · Target temperature raised — Bar area',
  say: 'I can see your issue was reported 20 minutes ago. Your issue has been logged and our team will be picking it up shortly.',
  lines: ['(Visit involved: “⚠️ Engineer visit involved: remind the customer that if the fault turns out not to be Lighthouse equipment, the visit may be chargeable.”)', 'When does the customer expect an update? [date] [Save follow-up]', 'Notes and feedback thread …'] });
add({ id: 'CB-empty', flow: 'Other screens', title: 'Callback: no tickets', ref: 'views.js:465, 480', kind: 'view',
  lines: ['No tickets for this site in the last 90 days. If the customer insists they rang, take details and start a new call.', '(Zendesk down: “Zendesk is unreachable. Take the customer’s details and start a new call to log the issue; it will be logged as soon as the connection returns.”)'] });
add({ id: 'TONIGHT', flow: 'Other screens', title: 'Tonight table: outcome chips and “What happened”', ref: 'views.js:491-505, 529-534', kind: 'view',
  table: [
    ['20:02', 'The Wheatsheaf 7412', 'Heating turned on (zone 1)', 'heating turned on', 'today shows the raw code'],
    ['20:14', 'The Wheatsheaf 7412', 'Heating put back to normal (zone 1)', 'back to normal', 'today shows the raw code'],
    ['20:20', 'The Wheatsheaf 7412', 'Target temperature raised — Bar area', 'applied ✓', 'today shows the raw code'],
    ['20:31', 'The Wheatsheaf 7412', 'Target temperature raised — not applied, logged', 'captured', 'today also shows an internal class code'],
    ['20:40', 'The Wheatsheaf 7412', 'Fridge or freezer question: monitored only', 'advice given', 'today says “not Lighthouse”'],
    ['20:52', 'The Wheatsheaf 7412', 'Pub heating: added to ticket', 'added to ticket', 'today shows the raw code']
  ],
  lines: ['Raise a query placeholder: “e.g. Customer says they rang two nights ago about fryers, can’t see it tonight”'] });

/* ============================== SHARED: outcome helpers ============================== */
const SHARED = {
  checkAndLog: { title: 'Check and log', sections: ['What the customer said', 'What we found', 'What we did', 'What we’ll log', 'Your notes'], button: LOG, p1Button: P1BTN },
  logged: '✅ Logged: ticket #48213 is with the IoT helpdesk',
  loggedNext: 'Our team picks this up on the next working day.',
  p1Logged: '🚨 P1 raised: ticket #48213',
  p1Status: 'The P1 is logged as ticket #48213 in the IoT Support dashboard, which pages the on-duty manager.'
};

module.exports = { STATES: S, SHARED, LOG, P1BTN, D2 };
