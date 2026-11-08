// Composes docs/project/OOHDASH-146-DESIGN.md (revision 4) from design-rev4-template.md, the generated lists, and the
// sections of revision 2 that are kept (read from git: the revision 2 commit 76497df).
// Usage: node compose-design.cjs <rev2.md> <proto-nodes.json> <verify.json> <out.md> [<addendum.md>]   (the addendum, if given, is appended unchanged)
const fs = require('fs');
const [rev2f, nodesf, verf, outf, addf] = process.argv.slice(2);
const rev2 = fs.readFileSync(rev2f, 'utf8');
const meta = JSON.parse(fs.readFileSync(nodesf, 'utf8'));
const ver = JSON.parse(fs.readFileSync(verf, 'utf8'));
const tpl = fs.readFileSync(require('path').join(__dirname, 'design-rev4-template.md'), 'utf8');
const NOTE = new Set(['N1', 'R11', 'R17']);

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

  const NLc = String.fromCharCode(10);
  const starts = (l, p) => l.indexOf(p) === 0;
  t = t.split(NLc).map(l => {
    if (starts(l, '| Switching off fails |')) return l.replace(/ \|$/, ' **Accepted exception (Q11, James 2026-11-08):** this and an urgent one-off the dashboard cannot make (D14d) are the only P1s raised without a question, because nobody is on a call. The P1 carries p1Origin automatic and a fixed system reason ("Automatic: ..."), so the rule "a P1 needs a reason" holds. |');
    if (starts(l, '- A failed switch-off pages the on-duty manager')) return '- A failed switch-off sends a text message to the on-call agent after 10 minutes (an automatic P1, accepted, Q11).';
    if (starts(l, '4. Safety question:')) return '4. No "will someone be in the kitchen" question (D14d). PowerPause only controls the power to the equipment; starting it, stopping it and using it safely stays the site\'s responsibility. The agent info box and the Say both say so. The check card shows the urgency banner instead (section 2B). If the request is not urgent, nothing is booked and a normal ticket is logged (K-normal).';
    if (starts(l, '| No live read (flag off, read failed')) return '| No live read (flag off, read failed, the circuit isn\'t in §tuya-sites.json§, or the site has no one-off) | Today\'s legacy kitchen screen; "different times" goes to K-when-unknown | No. K-when-unknown asks when it is needed: urgent raises a P1 automatically (K-auto-p1, D14d); not urgent is a normal ticket (K-normal). The screen still offers the manual override for tonight. |'.split('§').join(String.fromCharCode(96));
    if (starts(l, '- Nothing is booked unless the customer says someone will be in the kitchen.')) return '- No attended question: PowerPause only controls the power, so safe use stays the site\'s responsibility (D14d). A one-off is booked only when it is urgent and the dashboard can make the change.';
    if (starts(l, '| Booking call |')) return l.split(' OohOneOffAttended: true,').join('').split('Checks in order:').join('Checks in order: the site and device are the ones confirmed on this call (§siteNo§ and §deviceId§ bound to the call, B29); urgency recomputed by §urgencyOf§ (a not-urgent request is refused with 409);'.split('§').join(String.fromCharCode(96)));
    return l.split('so the on-duty manager is paged').join('so the on-call agent is sent a text message');
  }).join(NLc);
  t = t.split('so the on-duty manager is paged').join('so the on-call agent is sent a text message');
  return t;
}
// section 17: drop rows about names that no longer exist, note the live closed-ticket mechanism
function dict(t) {
  const lines = t.split('\n').filter(l => !/`OohOneOffAttended`/.test(l)).filter(l => !/`flow\.data\._wrapClosed`|`flow\.data\._wrapType`|`OohCloseOnCreate`|ticket `status: 'solved'` on create|\[TRG\]` line "Closed on creation/.test(l));
  const i = lines.findIndex(l => /^\|---/.test(l));
  lines.splice(i + 1, 0, "| `p1Reason` | `/api/outcomes` body, only with `type: 'escalate-p1'` | string, 10 to 500 characters after trimming and collapsing spaces | The agent's answer to \"Why is this urgent?\". Required for a P1; the server returns 400 without it. Written into the ticket's first internal `[TRG]` comment as \"Why urgent (agent): ...\"; never in the subject. | Free text typed by the agent: no personal details (hint on screen). Kept with the ticket; same retention as the ticket (PD-1). |", "| `riskAnswer` (known-so-far line) | `knownSoFar` | \"yes\" or \"no\" | The customer's answer to the universal question, shown as \"Immediate risk to trade or to anyone's health and safety: yes\" or \"...: no\" and written to the ticket with the other known-so-far lines. | none |", "| `RISK_ASK` | browser constant (`flows.js`) | string | The exact question text: Is there an immediate risk to trade or to anyone's health and safety? One definition, used by every flow. | none |", '| `closeOnCreate` (live) | `/api/outcomes` body | boolean | The ticket is created already solved (closed note). Live since 159; 146 reuses it, no new name. | none |');
  // rev 4.2: retention of the customer contact line (PD-1), and the names D14 and the hardening add
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].indexOf('| `[TRG]` line "Customer contact') === 0) lines[k] = '| `[TRG]` line "Customer contact: …" | Zendesk internal first comment | text, fixed label | The customer contact, after the Operator line | **Personal data.** Zendesk internal comment only. **Retention (James, 2026-11-08, PD-1): deleted automatically 12 months after the ticket is closed, and an agent can remove it by hand earlier.** Lawful basis: legitimate interests (call-back). The automatic deletion is set up by the IoT helpdesk before release (see the rework addendum). Characters that could forge a ticket line are stripped before it is written (B31). |';
    if (lines[k].indexOf('| `customerContact.OohCustomerName`') === 0 || lines[k].indexOf('| `customerContact.OohCustomerPhone`') === 0) lines[k] = lines[k].replace(/\| \*\*Personal data\.[^|]*\|$/, '| **Personal data.** Zendesk internal comment only (12 month automatic deletion after close, or removed earlier by an agent, PD-1); never in OOH stores, audit, Tonight, SMS or browser storage |').replace(/\| \*\*Personal data\*\*; as the name \|$/, '| **Personal data**; as the name (PD-1) |');
  }
  const j = lines.findIndex(l => /^\|---/.test(l));
  lines.splice(j + 1, 0,
    '| `p1Origin` | `/api/outcomes` body, only with `type: \'escalate-p1\'` | \'agent\' or \'automatic\' | Who raised the P1. \'automatic\' is accepted only from the one-off server code (failed switch-off, Q11) and the urgent-one-off-cannot-be-made case (D14d), with a fixed system reason ("Automatic: ..."). A browser cannot send \'automatic\'. | none |',
    '| `neededAt` | browser and `/api/outcomes`, `/api/oneoffs` bodies | local date and time | When the customer needs a planned change to be in place (fans, kitchen times, one-off). Input to `urgencyOf`. | none |',
    '| `urgency` | derived, never stored from the browser | \'urgent\' or \'not-urgent\' | Result of `urgencyOf(neededAt, now)` (section 2B.1); the server recomputes it. Shown as "Urgent — outside office hours" or "Not urgent — the IoT team can pick this up in time". Written as a known-so-far line on the ticket. | none |',
    '| `OOH_OFFICE_HOURS`, `OOH_RESPONSE_WORKING_HOURS` | `config.js` | \'Mon-Fri 09:00-17:00\' (confirmed, Q14), 3 | The IoT office hours and response window used by `urgencyOf`. | none |',
    '| `config/bank-holidays.json` | file | list of dates | Dates that count as non-working days for `urgencyOf`. | none |');
  return lines.join('\n');
}
const real = Object.entries(meta.deltas).filter(([k]) => !NOTE.has(k));
const allDelta = Object.entries(meta.deltas);
const diffTable = '| Item | What changes |\n|---|---|\n' + allDelta.map(([k, v]) => '| ' + k + ' | **' + v.title.replace(/\|/g, '/') + '.** ' + v.what.replace(/\|/g, '/') + ' |').join('\n');
const byItem = {}; meta.nodes.forEach(n => n.deltas.forEach(d => { (byItem[d] = byItem[d] || []).push(n.id); }));
const screenTable = '| Item | Screens | Count |\n|---|---|---|\n' + Object.keys(meta.deltas).map(k => '| ' + k + ' | ' + (k === 'R17' ? 'every in-call screen (all flows, the site screen and Add details)' : ((byItem[k] || []).map(x => '`' + x + '`').join(', ') || 'none')) + ' | ' + (byItem[k] || []).length + ' |').join('\n');
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
  '| D15: the prototype starts on "Who\'s calling?" with name, role, number and the site search on one screen | ' + (ver.d16.startScreen.whos && ver.d16.startScreen.nameField && ver.d16.startScreen.roleField && ver.d16.startScreen.phoneField && ver.d16.startScreen.search && ver.d16.startScreen.bootId === 'HOME' ? 'yes' : 'NO') + ' |',
  '| D16: caller banner on every in-call screen, in each of five states (full, name only, number only, none, declined) | ' + ver.d16.inCall + ' screens each: ' + Object.values(ver.d16.stateRows).join(', ') + '; missing ' + ver.d16.noBanner.length + '; wrong ' + ver.d16.bannerBad.length + '; on a screen outside a call ' + ver.d16.outsideWithBanner.length + ' |',
  '| D16: walk from the start screen to a kitchen flow, four ways of starting; add details mid-call | ' + ver.d16.flowPath.filter(x => x[1].ok).length + ' of ' + ver.d16.flowPath.length + ' walks keep the right banner; add details ' + (ver.d16.addDetails.ok ? 'ok' : 'FAILED') + ' |',
  '| D16: phone width (390 px) | banner ' + ver.d16.phone.bannerHeight + ' px high and sticky; it moves the say box down by ' + ver.d16.phone.pushedBy + ' px; with the real app (without the ' + ver.d16.phone.prototypeBarHeight + ' px prototype bar) the say box top is at ' + (ver.d16.phone.sayTopWith - ver.d16.phone.prototypeBarHeight) + ' px of ' + ver.d16.phone.viewport + ' |',
  '| Q12 wording: screens, side panels and the prototype file containing "on-duty", "on-call manager", "paged" or "pages the" | ' + (ver.d16.q12Hits.length ? ver.d16.q12Hits.join(', ') : 'none') + ' |',
  '| D13: screens that show the exact question | ' + ver.d13.questionScreens + ' (wrong wording on ' + ver.d13.askBad.length + ') |',
  '| D13: ticket screens (not P1) reached only from the question | ' + ver.d13.gated + ' of ' + (ver.d13.gated + ver.d13.exempt) + '; the other ' + ver.d13.exempt + ' are resolved on the call or declined, listed in the screen-text diff; ungated: ' + ver.d13.ungated.length + ' |',
  '| D13: P1 confirm screens reached only from the question | ' + ver.d13.confirms + ' (exceptions: ' + ver.d13.confirmUngated.length + ') |',
  '| D13: P1 button disabled until the comment has real content | checked on ' + ver.d13.p1Checked + ' screens; failures: ' + ver.d13.p1Bad.length + '; clicking it empty stays on the confirm step: ' + ver.d13.clickEmptyStaysOn + ' |',
  '| Scenario-only screens (reached by the Screen picker, not by clicking from the first call screen) | ' + ver.unreachable.length + ' |'
].join('\n');
const sub = {
  NSCREENS: meta.nodes.length, NLIVE: nLive, NAUTH: meta.nodes.length - nLive, NDELTAS: Object.keys(meta.deltas).length - 3,
  NINCALL: ver.d16.inCall, NQ: ver.d13.questionScreens, NCONF: ver.d13.confirms, NP1: ver.d13.p1Checked, NTK: ver.d13.ticketScreens, NGATED: ver.d13.gated, NEXEMPT: ver.d13.exempt,
  NIDENT: ver.identical, NEXPL: ver.explained, NNEW: ver.isNew, NUNEXPL: ver.unexplained, NCLICKS: ver.clicks,
  DIFFTABLE: diffTable, SCREENTABLE: screenTable, RESULTS: results,
  S7: fix(sec(7)).replace(/^Today the card[^\n]*\n/, m => m), S8: fix(sec(8)), S10: fix(sec(10)), S11: fix(sec(11)), S13: fix(sec(13)), S17: dict(fix(sec(17)))
};
// section 8 and 10 carry their own headings (### 8.x) inside; keep. Remove the duplicate first heading line of section 9 text
let out = tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in sub ? String(sub[k]) : m));
// the retained section 10 (control window) begins with its own table; fine
if (addf) out = out.trimEnd() + String.fromCharCode(10,10) + fs.readFileSync(addf, "utf8").trim() + String.fromCharCode(10);
fs.writeFileSync(outf, out);
console.log('wrote', outf, (out.length / 1024).toFixed(0) + 'KB');
const left = out.match(/\{\{\w+\}\}/g); if (left) console.log('UNFILLED', left);
