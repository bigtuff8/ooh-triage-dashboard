// Generates: wording-tables.md (for the design doc), SCREEN-DIFF.md, mockup-data.js
const fs = require('fs');
const clean = require('./clean.cjs');
const { STATES, SHARED, LOG, LOGC, P1BTN, REMOVED } = require('./proposed-wording.cjs');
const cur = Object.assign(JSON.parse(fs.readFileSync(process.argv[2] || 'screen-dump-7bd03ba.json', 'utf8')), fs.existsSync(process.argv[3] || 'screen-dump-extra-7bd03ba.json') ? JSON.parse(fs.readFileSync(process.argv[3] || 'screen-dump-extra-7bd03ba.json', 'utf8')) : {});
const cell = s => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
const chipTxt = cs => (cs || []).map(c => '[' + c[0] + ']').join(' ');

function propText(s) {
  const p = [];
  if (s.done) p.push('Progress line: ' + s.done);
  if (s.read) p.push('Reading: ' + s.read);
  if (s.banner) p.push('Banner: ' + s.banner);
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
    p.push('Check and log: ' + SHARED.checkAndLog.sections.join(' / ') + ' (What we’ll log: “' + s.log.detail + '”) [' + (s.log.closed ? LOGC : LOG) + ']');
    p.push('Then: ' + (s.log.closed ? SHARED.closedLogged + ' · ' + SHARED.closedNext : SHARED.logged + ' · ' + SHARED.loggedNext) + ' [Add another issue] [End call]');
  } else if (s.kind === 'p1') {
    p.push('What we’ll log: “' + s.log.detail + '” [' + P1BTN + ']');
    p.push('Then: ' + SHARED.p1Logged + ' · ' + SHARED.p1Status + ' · Say to the ' + (s.audience || 'customer') + ': “' + s.sayAfter + '” [Add another issue] [End call]');
  } else if (s.chips) p.push('Buttons: ' + chipTxt(s.chips));
  if (s.kind === 'ctlout' && s.chips) p.push('Buttons: ' + chipTxt(s.chips));
  if (s.foot) p.push(s.foot);
  if (s.note) p.push('Design note: ' + s.note);
  return p.join(' · ');
}

/* ---------------- wording tables ---------------- */
let md = '';
const flows = [...new Set(STATES.map(s => s.flow))];
let row = 0;
const counts = { outcome: 0, p1: 0, ctlout: 0, step: 0, modal: 0, view: 0, closed: 0, isNew: 0 };
for (const fl of flows) {
  md += '\n### ' + fl + '\n\n';
  md += '| # | Screen or outcome (code on main 7bd03ba) | Headline | Say to the customer | Good to know (agent only) | Buttons, Check and log, ticket |\n|---|---|---|---|---|---|\n';
  for (const s of STATES.filter(x => x.flow === fl)) {
    row++; counts[s.kind]++; if (s.log && s.log.closed) counts.closed++; if (/\(new|new\)|^new$/.test(s.title) || s.ref === 'new') counts.isNew++;
    const id = s.id;
    let hd = s.hd || s.mtitle || s.q || '';
    if (s.tag) hd += ' (tag: ' + s.tag + ')';
    let say = s.kind === 'p1' ? 'After raising: “' + s.sayAfter + '”' : (s.say ? '“' + s.say + '”' : '(none)');
    if (s.audience === 'contractor') say = '(Say to the contractor) ' + say;
    let gtk = s.gtk || '';
    if (s.body) gtk = s.body + (gtk ? ' ' + gtk : '');
    if (s.banner) gtk = 'Banner: ' + s.banner + (gtk ? ' ' + gtk : '');
    if (s.fields) gtk += (gtk ? ' ' : '') + 'Fields: ' + s.fields.join(' · ');
    if (s.field) gtk += (gtk ? ' ' : '') + 'Field: ' + s.field;
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
    if (s.kind === 'outcome') b = (s.q ? 'Question: ' + s.q + ' · ' : '') + '[Check and log] → [' + (s.log.closed ? LOGC : LOG) + '] · type ' + s.log.type + (s.log.closed ? ', saved as a closed ticket (OohCloseOnCreate)' : '') + ' · subject “' + s.log.subject + '” · What we’ll log: “' + s.log.detail + '”';
    else if (s.kind === 'p1') b = 'P1 card: What we’ll log “' + s.log.detail + '” → [' + P1BTN + '] · escalate-p1, ooh_p1 tag (pages the on-duty manager, unchanged) · subject “' + s.log.subject + '”';
    else if (s.kind === 'ctlout') b = (s.foot || '') + (s.chips ? ' ' + chipTxt(s.chips) : '') + (/^K-/.test(s.id) ? ' (one-off booking logs its own ticket, section 8)' : ' (ticket model unchanged, D2)');
    else b = (s.q && s.kind !== 'view' ? 'Question: ' + s.q + ' · ' : '') + chipTxt(s.chips) + (s.done ? ' · progress line “' + s.done + '”' : '') + (s.log ? ' · subject “' + s.log.subject + '”' : '');
    md += `| ${id} | ${cell(s.title)}${s.ref === 'new' ? '' : ' (' + cell(s.ref) + ')'}${s.inj ? ' ¹' : ''} | ${cell(hd)} | ${cell(say)} | ${cell(gtk || '(none)')} | ${cell(b)} |\n`;
  }
}
fs.writeFileSync('wording-tables.md', md);

/* ---------------- screen diff ---------------- */
const EXTRA = { 'S-0': 'Unchanged apart from the question wording (“Ask the customer: which area is it?”).', 'S-darkmulti': 'As S-dark1 with the plural headline “The heating units in this area aren’t sending us any readings”; now goes straight to the outcome.', 'CB-list': 'Ticket subjects follow the new subjects in the wording table. Closed notes show the status “Closed: note for the record”.', 'TONIGHT-query': 'Placeholder: “e.g. Customer says they rang two nights ago about fryers, can’t see it tonight”.' };
let dm = '';
let n = 0;
const byId = Object.fromEntries(STATES.map(s => [s.id, s]));
const byWas = {};
for (const s of STATES) for (const w of (s.was || [s.id])) (byWas[w] = byWas[w] || []).push(s);
const usedNew = new Set();
for (const [id, v] of Object.entries(cur)) {
  n++;
  let t = clean(v.text).replace(/Customer.s words: "[^"]*" \/ /, '');
  t = t.replace(/ \/ \+ Add a note to ticket #\d+/, ' / [+ Add a note to ticket]').replace(/➕ Add another issue \/ ✔ End call/, '[Add another issue] [End call]');
  t = t.replace(/----AFTER RECORD----/, '⟶ AFTER “Record outcome”:');
  let p;
  if (byWas[id]) { p = byWas[id].map(s => { usedNew.add(s.id); return (s.id !== id ? '(now row ' + s.id + ') ' : '') + propText(s); }).join(' ‖ '); }
  else if (REMOVED[id]) p = 'REMOVED. ' + REMOVED[id];
  else p = EXTRA[id] || '';
  const note = v.note ? ' ¹ ' + v.note : '';
  dm += `| ${id}${note ? ' ¹' : ''} | ${cell(t)} | ${cell(p)}${note ? ' (' + cell(v.note) + ')' : ''} |
`;
}
// proposed-only states (new screens, or screens today that the dump never reached)
let nNew = 0;
for (const s of STATES) if (!usedNew.has(s.id) && !cur[s.id]) { n++; nNew++; dm += `| ${s.id} (new) | ${s.today ? cell(s.today) : '(not in today’s dump: ' + cell(s.title) + ')'} | ${cell(propText(s))} |
`; }
fs.writeFileSync('diff-rows.md', dm);
fs.writeFileSync('mockup-data.js', 'var STATES = ' + JSON.stringify(STATES).split(' (unchanged)').join('') + ';\nvar SHARED = ' + JSON.stringify(SHARED) + ';\nvar LOGBTN = ' + JSON.stringify(LOG) + ';\nvar P1BTN = ' + JSON.stringify(P1BTN) + ';\n');
console.log('rows', row, counts, 'diff rows', n, 'new-only', nNew, 'removed', Object.keys(REMOVED).length);
