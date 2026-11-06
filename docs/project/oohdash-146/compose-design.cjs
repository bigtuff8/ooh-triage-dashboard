// Composes docs/project/OOHDASH-146-DESIGN.md (revision 3) from design-rev3-template.md, the generated lists, and the
// sections of revision 2 that are kept (read from git: the revision 2 commit 76497df).
// Usage: node compose-design.cjs <rev2.md> <proto-nodes.json> <verify.json> <out.md>
const fs = require('fs');
const [rev2f, nodesf, verf, outf] = process.argv.slice(2);
const rev2 = fs.readFileSync(rev2f, 'utf8');
const meta = JSON.parse(fs.readFileSync(nodesf, 'utf8'));
const ver = JSON.parse(fs.readFileSync(verf, 'utf8'));
const tpl = fs.readFileSync(require('path').join(__dirname, 'design-rev3-template.md'), 'utf8');
const NOTE = new Set(['N1', 'R11']);

function sec(n) {
  const re = new RegExp('^## ' + n + '\\. .*$', 'm');
  const m = re.exec(rev2); if (!m) throw new Error('no section ' + n);
  const start = m.index + m[0].length;
  const next = /^## \d+\. /m.exec(rev2.slice(start));
  return rev2.slice(start, next ? start + next.index : rev2.length).trim();
}
const XREF = [['§3.4', 'the P1 failure screen'], ['§3.5', 'D5'], ['§3.2', 'the live helpers'], ['§3.1', 'the live text key'], ['§8.1', 'section 9'], ['§8.3', 'section 9 (server)'], ['§8.4', 'section 9 (safety)'], ['§8', 'section 9'], ['§7', 'section 8'], ['§9', 'section 10'], ['§10', 'section 11'], ['§11', 'section 12'], ['§13', 'section 13'], ['§5', 'section 7'], ['§4', 'the prototype'], ['§12', 'section 6'], ['§14', 'section 14'], ['§16', 'section 16'], ['§17', 'section 17']];
function fix(t) {
  XREF.forEach(([a, b]) => { t = t.split(a).join(b); });
  t = t.replace(/^### 8\.(\d)/gm, '### 9.$1');
  t = t.split('manual control button').join('manual override').split('Check and log').join('the finish step');
  t = t.split('Different times every day (logged for the IoT team; timetables are never changed from here)').join('Different times every week (a permanent change), which goes to the live timetable form with its Area Manager line (timetables are never changed from here)');
  t = t.split('row K-ncrit').join('the live "not needed until later" ticket').split('row K-book-fail').join('screen K-book-fail');
  return t;
}
// section 17: drop rows about names that no longer exist, note the live closed-ticket mechanism
function dict(t) {
  const lines = t.split('\n').filter(l => !/`flow\.data\._wrapClosed`|`flow\.data\._wrapType`|`OohCloseOnCreate`|ticket `status: 'solved'` on create|\[TRG\]` line "Closed on creation/.test(l));
  const i = lines.findIndex(l => /^\|---/.test(l));
  lines.splice(i + 1, 0, '| `closeOnCreate` (live) | `/api/outcomes` body | boolean | The ticket is created already solved (closed note). Live since 159; 146 reuses it, no new name. | none |');
  return lines.join('\n');
}
const real = Object.entries(meta.deltas).filter(([k]) => !NOTE.has(k));
const allDelta = Object.entries(meta.deltas);
const diffTable = '| Item | What changes |\n|---|---|\n' + allDelta.map(([k, v]) => '| ' + k + ' | **' + v.title.replace(/\|/g, '/') + '.** ' + v.what.replace(/\|/g, '/') + ' |').join('\n');
const byItem = {}; meta.nodes.forEach(n => n.deltas.forEach(d => { (byItem[d] = byItem[d] || []).push(n.id); }));
const screenTable = '| Item | Screens | Count |\n|---|---|---|\n' + Object.keys(meta.deltas).map(k => '| ' + k + ' | ' + ((byItem[k] || []).map(x => '`' + x + '`').join(', ') || 'none') + ' | ' + (byItem[k] || []).length + ' |').join('\n');
const nLive = meta.nodes.filter(n => n.live).length, nAuth = meta.nodes.filter(n => n.authored).length;
const results = [
  '| Check | Result |', '|---|---|',
  '| Prototype screens | ' + meta.nodes.length + ' (' + nLive + ' live, ' + (meta.nodes.length - nLive) + ' authored or live pages) |',
  '| Identical to live after example-data normalisation | ' + ver.identical + ' |',
  '| Differ from live, every difference mapped to an item | ' + ver.explained + ' |',
  '| New in 146 (no live screen), each mapped to an item | ' + ver.isNew + ' |',
  '| **Unexplained differences** | **' + ver.unexplained + '** |',
  '| Buttons clicked | ' + ver.clicks + ' |',
  '| Dead buttons / JS errors | ' + ver.dead.length + ' / ' + ver.errors.length + ' |',
  '| Failed P1 simulated | lands on ' + ver.p1sim + ' |',
  '| Scenario-only screens (reached by the Screen picker, not by clicking from the first call screen) | ' + ver.unreachable.length + ' |'
].join('\n');
const sub = {
  NSCREENS: meta.nodes.length, NLIVE: nLive, NAUTH: meta.nodes.length - nLive, NDELTAS: Object.keys(meta.deltas).length - 2,
  NIDENT: ver.identical, NEXPL: ver.explained, NNEW: ver.isNew, NUNEXPL: ver.unexplained, NCLICKS: ver.clicks,
  DIFFTABLE: diffTable, SCREENTABLE: screenTable, RESULTS: results,
  S7: fix(sec(7)).replace(/^Today the card[^\n]*\n/, m => m), S8: fix(sec(8)), S10: fix(sec(10)), S11: fix(sec(11)), S13: fix(sec(13)), S17: dict(fix(sec(17)))
};
// section 8 and 10 carry their own headings (### 8.x) inside; keep. Remove the duplicate first heading line of section 9 text
let out = tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in sub ? String(sub[k]) : m));
// the retained section 10 (control window) begins with its own table; fine
fs.writeFileSync(outf, out);
console.log('wrote', outf, (out.length / 1024).toFixed(0) + 'KB');
const left = out.match(/\{\{\w+\}\}/g); if (left) console.log('UNFILLED', left);
