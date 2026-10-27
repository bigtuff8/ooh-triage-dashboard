// OOHDASH-146 rev 2: assembles OOHDASH-146-DESIGN.md (template + generated wording tables) and
// OOHDASH-146-SCREEN-DIFF.md (header + generated diff rows). Run after gen.cjs.
// Usage: node assemble.cjs [design-template.md]
// Without a template it refreshes the tables inside the existing design doc (between the "### Hot water" table and "## 5.").
const fs = require('fs');
const path = require('path');
const { STATES, REMOVED } = require('./proposed-wording.cjs');
const DOC = path.join('..', 'OOHDASH-146-DESIGN.md');
const NL = String.fromCharCode(10);
const tpl = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : (() => {
  const d = fs.readFileSync(DOC, 'utf8');
  const a = d.indexOf(NL + '### Hot water' + NL);
  const b = d.indexOf(NL + '## 5. ');
  return d.slice(0, a) + '{{TABLES}}' + NL + d.slice(b);
})();
const tables = fs.readFileSync('wording-tables.md', 'utf8');
const k = s => STATES.filter(x => x.kind === s).length;
const closed = STATES.filter(s => s.log && s.log.closed && s.kind === 'outcome').length;
const vals = { ROWS: STATES.length, OUTCOMES: k('outcome'), CLOSED: closed, OPEN: k('outcome') - closed, P1S: k('p1'), CTLOUT: k('ctlout'), STEPS: k('step'), MODALS: k('modal'), VIEWS: k('view'), TABLES: tables };
const _rows = fs.readFileSync('diff-rows.md', 'utf8');
vals.NEWROWS = (_rows.match(/^\| [^|]+ \(new\) \|/gm) || []).length;
let doc = tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in vals ? String(vals[key]) : m));
fs.writeFileSync(path.join('..', 'OOHDASH-146-DESIGN.md'), doc);

const cur1 = Object.keys(JSON.parse(fs.readFileSync('screen-dump-7bd03ba.json', 'utf8'))).length;
const cur2 = Object.keys(JSON.parse(fs.readFileSync('screen-dump-extra-7bd03ba.json', 'utf8'))).length;
const rows = fs.readFileSync('diff-rows.md', 'utf8');
const nRows = rows.trim().split('\n').length;
const nNew = (rows.match(/^\| [^|]+ \(new\) \|/gm) || []).length;
const head = `# OOHDASH-146 screen-text diff (appendix to OOHDASH-146-DESIGN.md), revision 2

Date: 2026-10-27 · Code: main 7bd03ba (v1.6.4, unchanged since revision 1) · Method: the real app was run locally in fixture mode (port 3093, scratch store). A Playwright walk put the app into every flow state and saved the flow panel, control window or page text. That text is the **current** column, cleaned only of the shared header, footer and notes box. The **proposed** column is the new wording from the design wording table (section 4), which now includes your decisions D5 to D12.

Revision 2 adds a second capture (\`screen-dump-extra.mjs\`, ${cur2} screens) of states the first pass never reached: the four "Continue under Something else" dead ends, air conditioning at a site without it, the offline banner, and the connection check reached by the heating divert at a site that is otherwise online. That last one proves a false statement on today's screen: it says "Everything at this site is showing online" while the customer's own thermostat is the thing that's offline (row CN-devoff).

How to read the current column: outcome rows show two parts. The first part is today's confirm step (subject, detail, Record outcome). The text after "AFTER Record outcome" is the card shown once the ticket exists.

How to read the proposed column: "(now row X)" means today's screen is replaced by row X of the wording table. "REMOVED" means the screen no longer exists, with the reason (usually D5: it was an agent's judgement, not a question the customer answers). Rows marked "(new)" are screens that don't exist today.

¹ = the state could not be produced by any fixture site, so it was reached through the real renderer with injected data, as noted in the row. Nothing was dumped from a copy of the code: every current row is the live code's own output.

States dumped: ${cur1 + cur2} (${cur1} in the first pass, ${cur2} in revision 2). Rows below: ${nRows} (${nRows - nNew} dumped screens, ${nNew} new screens). Removed or merged screens: ${Object.keys(REMOVED).length}.

| State | Current on-screen text (main 7bd03ba) | Proposed text |
|---|---|---|
`;
fs.writeFileSync(path.join('..', 'OOHDASH-146-SCREEN-DIFF.md'), head + rows);
console.log('design + diff written', vals.ROWS, 'rows; diff rows', nRows, 'new', nNew);
