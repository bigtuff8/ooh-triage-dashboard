// Generates: wording-tables.md (for the design doc), SCREEN-DIFF.md, mockup-data.js
const fs = require('fs');
const clean = require('./clean.cjs');
const { STATES, SHARED, LOG, P1BTN } = require('./proposed-wording.cjs');
const cur = JSON.parse(fs.readFileSync(process.argv[2] || 'screen-dump-7bd03ba.json', 'utf8'));
const cell = s => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
const chipTxt = cs => (cs || []).map(c => '[' + c[0] + ']').join(' ');

function propText(s) {
  const p = [];
  if (s.done) p.push('Progress line: ' + s.done);
  if (s.read) p.push('Reading: ' + s.read);
  if (s.rows) p.push(s.rows.map(r => r[0] + ' [' + r[1] + ']').join('; '));
  if (s.list) p.push(s.list.join('; '));
  if (s.mtitle) p.push('Window title: ' + s.mtitle + ' · ' + s.target + (s.big ? ' · ' + s.big : ''));
  if (s.hd) p.push('Headline: ' + s.hd + (s.tag ? ' [tag: ' + s.tag + ']' : ''));
  if (s.body) p.push(s.body);
  if (s.alert) p.push('Alert: ' + s.alert + (s.alertBtn ? ' [' + s.alertBtn + ']' : ''));
  if (s.kind !== 'p1' && s.say) p.push('Say to the ' + (s.audience || 'customer') + ': “' + s.say + '”');
  if (s.gtk) p.push('Good to know: ' + s.gtk);
  if (s.fact) p.push('Small print: ' + s.fact);
  if (s.lines) p.push(s.lines.join(' · '));
  if (s.table) p.push(s.table.map(r => r.slice(0, 4).join(' / ')).join('; '));
  if (s.q) p.push('Question: ' + s.q);
  if (s.field) p.push('Field: ' + s.field);
  if (s.fields) p.push('Fields: ' + s.fields.join(', '));
  if (s.kind === 'outcome') {
    p.push('Buttons: [Check and log]');
    p.push('Check and log: ' + SHARED.checkAndLog.sections.join(' / ') + ' (What we’ll log: “' + s.log.detail + '”) [' + LOG + ']');
    p.push('Then: ' + SHARED.logged + ' · ' + SHARED.loggedNext + ' [Add another issue] [End call]');
  } else if (s.kind === 'p1') {
    p.push('What we’ll log: “' + s.log.detail + '” [' + P1BTN + ']');
    p.push('Then: ' + SHARED.p1Logged + ' · ' + SHARED.p1Status + ' · Say to the ' + (s.audience || 'customer') + ': “' + s.sayAfter + '” [Add another issue] [End call]');
  } else if (s.chips) p.push('Buttons: ' + chipTxt(s.chips));
  if (s.foot) p.push(s.foot);
  if (s.note) p.push('Design note: ' + s.note);
  return p.join(' · ');
}

/* ---------------- wording tables ---------------- */
let md = '';
const flows = [...new Set(STATES.map(s => s.flow))];
let row = 0;
const counts = { outcome: 0, p1: 0, ctlout: 0, step: 0, modal: 0, view: 0 };
for (const fl of flows) {
  md += '\n### ' + fl + '\n\n';
  md += '| # | Screen or outcome (code on main 7bd03ba) | Headline | Say to the customer | Good to know (agent only) | Buttons, Check and log, ticket |\n|---|---|---|---|---|---|\n';
  for (const s of STATES.filter(x => x.flow === fl)) {
    row++; counts[s.kind]++;
    const id = s.id;
    let hd = s.hd || s.mtitle || s.q || '';
    if (s.tag) hd += ' (tag: ' + s.tag + ')';
    let say = s.kind === 'p1' ? 'After raising: “' + s.sayAfter + '”' : (s.say ? '“' + s.say + '”' : '(none)');
    if (s.audience === 'contractor') say = '(Say to the contractor) ' + say;
    let gtk = s.gtk || '';
    if (s.body) gtk = s.body + (gtk ? ' ' + gtk : '');
    if (s.alert) gtk = 'Alert: ' + s.alert + (s.alertBtn ? ' [' + s.alertBtn + ']' : '') + (gtk ? ' ' + gtk : '');
    if (s.fact) gtk += (gtk ? ' ' : '') + 'Small print: ' + s.fact;
    if (s.lines) gtk += (gtk ? ' ' : '') + s.lines.join(' · ');
    if (s.read) gtk += (gtk ? ' ' : '') + 'Reading line: ' + s.read;
    if (s.list) gtk += (gtk ? ' ' : '') + 'Summary lines: ' + s.list.join('; ');
    if (s.rows) gtk += (gtk ? ' ' : '') + 'Circuit row: ' + s.rows.map(r => r[0] + ' [' + r[1] + ']').join('; ');
    if (s.table) gtk += (gtk ? ' ' : '') + s.table.map(r => r[2] + ' → chip “' + r[3] + '” (' + r[4] + ')').join('; ');
    if (s.note) gtk += (gtk ? ' ' : '') + 'Design note: ' + s.note;
    if (s.ticketSentence) gtk += (gtk ? ' ' : '') + 'Ticket sentence: ' + s.ticketSentence;
    let b;
    if (s.kind === 'outcome') b = '[Check and log] → [' + LOG + '] · type ' + s.log.type + ' · subject “' + s.log.subject + '” · What we’ll log: “' + s.log.detail + '”';
    else if (s.kind === 'p1') b = 'P1 card: What we’ll log “' + s.log.detail + '” → [' + P1BTN + '] · escalate-p1, ooh_p1 tag (pages the on-duty manager, unchanged) · subject “' + s.log.subject + '”';
    else if (s.kind === 'ctlout') b = (s.foot || '') + ' (ticket model unchanged, D2)';
    else b = chipTxt(s.chips) + (s.done ? ' · progress line “' + s.done + '”' : '') + (s.log ? ' · subject “' + s.log.subject + '”' : '');
    md += `| ${id} | ${cell(s.title)} (${cell(s.ref)})${s.inj ? ' ¹' : ''} | ${cell(hd)} | ${cell(say)} | ${cell(gtk || '(none)')} | ${cell(b)} |\n`;
  }
}
fs.writeFileSync('wording-tables.md', md);

/* ---------------- screen diff ---------------- */
const EXTRA = { 'S-0': 'Unchanged (already “Which area is the customer talking about?”).', 'S-darkmulti': 'As S-dark1 with the plural headline “The heating units in this area aren’t sending us any readings”.', 'CB-list': 'Ticket subjects follow the new subjects in the wording table (for example “Target temperature raised — not applied, logged” instead of “Setpoint raise — NOT applied, escalated”).', 'TONIGHT-query': 'Placeholder: “e.g. Customer says they rang two nights ago about fryers, can’t see it tonight”.' };
let dm = '';
let n = 0;
const byId = Object.fromEntries(STATES.map(s => [s.id, s]));
for (const [id, v] of Object.entries(cur)) {
  n++;
  let t = clean(v.text).replace(/Customer.s words: "[^"]*" \/ /, '');
  t = t.replace(/ \/ \+ Add a note to ticket #\d+/, ' / [+ Add a note to ticket]').replace(/➕ Add another issue \/ ✔ End call/, '[Add another issue] [End call]');
  t = t.replace(/----AFTER RECORD----/, '⟶ AFTER “Record outcome”:');
  const p = byId[id] ? propText(byId[id]) : (EXTRA[id] || '');
  const note = v.note ? ' ¹ ' + v.note : '';
  dm += `| ${id}${note ? ' ¹' : ''} | ${cell(t)} | ${cell(p)}${note ? ' (' + cell(v.note) + ')' : ''} |\n`;
}
// proposed-only states
for (const s of STATES) if (!cur[s.id]) { n++; dm += `| ${s.id} (new) | (does not exist today: ${cell(s.title)}) | ${cell(propText(s))} |\n`; }
fs.writeFileSync('diff-rows.md', dm);
fs.writeFileSync('mockup-data.js', 'var STATES = ' + JSON.stringify(STATES).split(' (unchanged)').join('') + ';\nvar SHARED = ' + JSON.stringify(SHARED) + ';\nvar LOGBTN = ' + JSON.stringify(LOG) + ';\nvar P1BTN = ' + JSON.stringify(P1BTN) + ';\n');
console.log('rows', row, counts, 'diff rows', n);
