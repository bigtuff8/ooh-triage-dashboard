// OOHDASH-146 rev 4, D13 "the universal risk question".
// Every flow asks the same question, "Is there an immediate risk to trade or to anyone's health and safety?" (Yes / No), and it is the
// ONLY route to a P1. Yes goes to the live P1 confirm step plus a mandatory agent comment; No is the normal next-working-day ticket
// (or the closed note on the paths Lighthouse does not control).
//
// This file is the authored layer for D13. It (1) rewrites the live questions that used to raise a P1 on their own (the kitchen service
// question, the fridge stock-at-risk question, Something else "is it urgent"), (2) inserts the question in front of every other
// ticket that is raised while the problem is still unresolved on the call, (3) gives every P1 confirm screen the mandatory comment,
// and (4) records which ticket screens are exempt because the problem was resolved on the call.
const B = require('./build-proto.cjs');
const { NODES, add, p1confirm, p1after, delta, H, W, dyn, EX, shell, ICON, TITLE } = B;
const esc = H.esc;
const { RISK_ASK, RISK_KNOWN, RISK_HELP } = H;

delta('R14', 'D13: the universal risk question, the only way to a P1',
  'Every flow asks "Is there an immediate risk to trade or to anyone\'s health and safety?" (Yes / No) where the problem is still not resolved on the call, before the ticket is made. Yes goes to the live P1 confirm step and cannot be raised until the agent has written why it is urgent. No is the normal ticket for the next working day (or the closed note where Lighthouse does not control the equipment). It replaces the kitchen "is it needed for service" question, the fridge "is stock at risk" question and the Something else "is it urgent" question, and it is now the only way to a P1 (lighting, contractor, hot water, fans, heating, air conditioning, connection, not-on-Lighthouse and site-not-identified paths all go through it).');

const ICONKEY = Object.fromEntries(Object.entries(ICON).map(([k, v]) => [v, k]));
const WORDS = { Kitchen: 'The fryer will not come on', Lighting: 'Car park lights are off', Fans: 'Need the fans on late', Hot: 'No hot water in the kitchen', Heat: 'The bar is freezing', Else: 'Cellar cooler alarm going off', Conn: 'Nothing is working', Air: 'Aircon is blowing warm', Fridge: 'Freezer alarm going off', Cont: 'Needs the fryers on to test the gas interlock' };
const mark = n => { if (!n.deltas.includes('R14')) n.deltas.push('R14'); };
const headOf = html => { const m = /<span style="font-size:18px">([^<]*)<\/span><b>([^<]*)<\/b>/.exec(html || ''); return m ? { icon: m[1], title: m[2] } : null; };
const knownOf = html => { const m = /<div class="known" data-testid="known-so-far">[\s\S]*?<\/ul><\/div>/.exec(html || ''); return m ? m[0] : ''; };
const li = text => '<li class="stepdone" data-kind="customer"><span class="kicon">👤</span><span>' + esc(text) + '</span></li>';
const addKnown = (html, v) => !html || html.includes(RISK_KNOWN(v)) ? html : html.replace(/(<div class="known" data-testid="known-so-far">[\s\S]*?)(<\/ul><\/div>)/, (m, a, b) => a + li(RISK_KNOWN(v)) + b);
const frameOf = n => n.root || n.rootKey;

/* ------------------------------------------------------------------ 1. the live questions that raised a P1 on their own */
const SUBJ = [
  ['Kitchen equipment off during service — P1', 'Kitchen equipment off — risk to trade or health and safety — P1'],
  ['Kitchen equipment off — not needed until later', 'Kitchen equipment off — no immediate risk'],
  ['External lighting not working — P1', 'External lighting not working — risk to trade or health and safety — P1'],
  ['Refrigeration temperature alarm — stock at risk', 'Refrigeration alarm — risk to trade or health and safety — P1'],
  ['Contractor on site needs IoT support — P1', 'Contractor on site — risk to trade or health and safety — P1'],
  ['PowerPause override failed — contractor on site — P1', 'Contractor on site, PowerPause override failed — risk to trade or health and safety — P1'],
  ['PowerPause override — Donkey Derby (site 6786) — IoT team escalation', 'Contractor on site (Donkey Derby), override unavailable — risk to trade or health and safety — P1']
];
const SAY_P1 = 'Thanks. As there\'s an immediate risk to trade or to anyone\'s health and safety, I\'m going to raise this as urgent with our on-call team.';
Object.values(NODES).forEach(n => {
  if (!n.flowHtml) return;
  const o = n.flowHtml; let h = o;
  // kitchen service question and its two answers
  h = h.replace(/is the kitchen needed for service right now, with food being served or breakfast on\?/g, RISK_ASK);
  h = h.replace(/>Yes, it's needed now</g, '>Yes<').replace(/>No, it can wait</g, '>No<');
  h = h.split('Kitchen needed for service now: no, it can wait').join(RISK_KNOWN('no')).split('Kitchen needed for service now: yes').join(RISK_KNOWN('yes'));
  h = h.split('Kitchen equipment off while the site is serving:').join('Kitchen equipment off, with an immediate risk to trade or to anyone\'s health and safety:');
  // fridge question
  h = h.replace(/is stock at risk right now, for example a freezer warming up or a big temperature alarm\?/g, RISK_ASK);
  h = h.replace(/>Yes, stock is at risk</g, '>Yes<').replace(/>No, it's just a query</g, '>No<');
  h = h.split('Stock is at risk right now').join(RISK_KNOWN('yes'));
  h = h.split('Customer reports refrigeration failure with stock at risk.').join('Customer reports a refrigeration alarm with an immediate risk to trade or to anyone\'s health and safety.');
  // lighting question (live went straight from "still off" to the P1)
  // one clear wording for the P1 confirm step (the Say)
  h = h.replace(/(Thanks\. )?(As [^<]*?|This site's override doesn't work, so )I'm going to raise this as urgent with our on-call team\./g, SAY_P1);
  SUBJ.forEach(([a, b]) => { h = h.split(a).join(b); });
  // contractor: the "always urgent" rule goes; the Donkey Derby "straight to a P1" goes
  h = h.split('Contractor on site calls are always treated as urgent — an engineer is standing there waiting.').join('An engineer is standing there waiting, so help them with the override first. A P1 is raised only if there is an immediate risk to trade or to anyone\'s health and safety.');
  h = h.split('This is the one case where you go straight to a P1.').join('The engineer can\'t be helped on site here, so go on to the risk question.');
  h = h.split('I\'ll raise it as urgent so the IoT team contacts the site directly. Their direct line is').join('Our IoT team can help directly; their direct line is');
  h = h.split('>Continue to the P1<').join('>Continue<');
  if (h !== o) { n.flowHtml = h; mark(n); }
  if (n.t) n.t = n.t.split("Yes, it's needed now").join('Yes (immediate risk)').split('No, it can wait').join('No (no immediate risk)').split("Yes, stock is at risk").join('Yes (immediate risk)').split("No, it's just a query").join('No (no immediate risk)');
});
// the Something else live reason box (OOHDASH-134) is replaced by the shared mandatory comment, so nothing else to edit there.

// the question screens carry the same short "for you" help, once
Object.values(NODES).forEach(n => {
  if (!n.flowHtml || !n.flowHtml.includes(RISK_ASK) || n.flowHtml.includes('data-testid="risk-help"')) return;
  n.flowHtml = n.flowHtml.replace('<div class="answers"', RISK_HELP + '<div class="answers"'); mark(n);
});

/* ------------------------------------------------------------------ 2. the families of P1 confirm screens used by the inserted question */
const FAM = {
  kitchen: { subject: 'Kitchen equipment — risk to trade or health and safety — P1', detail: 'Kitchen equipment problem that is not resolved on the call. The customer says there is an immediate risk to trade or to anyone\'s health and safety.' },
  unm: { subject: 'Equipment Lighthouse does not control — risk to trade or health and safety — P1', detail: 'Equipment that Lighthouse does not see or control at this site. The customer says there is an immediate risk to trade or to anyone\'s health and safety, so the on-call team calls back. Nothing can be switched from here.', unm: true },
  hw: { subject: 'Hot water — risk to trade or health and safety — P1', detail: 'Hot water problem. Lighthouse has no hot water control or temperature reading here. The customer says there is an immediate risk to trade or to anyone\'s health and safety, so the on-call team calls back.', unm: true },
  fan: { subject: 'Extractor fans — risk to trade or health and safety — P1', detail: 'Extractor fans needed or not working. The customer says there is an immediate risk to trade or to anyone\'s health and safety.' },
  ac: { subject: 'Air conditioning — risk to trade or health and safety — P1', detail: 'Air conditioning problem. It cannot be changed from here. The customer says there is an immediate risk to trade or to anyone\'s health and safety.', unm: true },
  heat: { subject: 'Heating — risk to trade or health and safety — P1', detail: 'Heating problem that is not resolved on the call. The customer says there is an immediate risk to trade or to anyone\'s health and safety.' },
  conn: { subject: 'Equipment not connecting — risk to trade or health and safety — P1', detail: 'Equipment is not connecting to Lighthouse and the customer\'s checks did not fix it. The customer says there is an immediate risk to trade or to anyone\'s health and safety.' },
  site: { subject: 'Site not identified — risk to trade or health and safety — P1', detail: 'The house number matches two sites and the customer could not say which. The customer says there is an immediate risk to trade or to anyone\'s health and safety.' }
};
const FNAME = { Kitchen: 'kitchen equipment', Lighting: 'outside lighting', Fans: 'extractor fans', Fridge: 'fridges', Hot: 'hot water', Heat: 'heating', Else: 'something else', Conn: 'connection', Cont: 'contractor on site', Air: 'air conditioning' };
function famNodes(fam, fkey, g, root) {
  const key = fam + ':' + fkey, cid = 'F:' + key, aid = 'F:' + key + ':after', F = FAM[fam];
  if (NODES[cid]) return cid;
  const subject = fam === 'unm' ? 'Equipment Lighthouse does not control (' + FNAME[fkey] + ') — risk to trade or health and safety — P1' : F.subject;
  const known = [W(WORDS[fkey]), ['c', RISK_KNOWN('yes')]];
  p1confirm(cid, { g, t: 'Risk: Yes, confirm the P1 (' + fam + ', ' + FNAME[fkey] + ')', root, f: fkey, to: aid, known, deltas: ['R14'],
    say: F.unm ? 'Thanks. I can\'t fix that equipment from here, but as there\'s an immediate risk to trade or to anyone\'s health and safety, I\'m going to raise this as urgent with our on-call team so they can call you straight back.' : SAY_P1, subject, detail: F.detail });
  p1after(aid, { g, t: 'Risk: P1 raised (' + fam + ', ' + FNAME[fkey] + ')', root, f: fkey, subject, deltas: ['R14'], known,
    say: 'That\'s raised as urgent, reference ' + dyn(EX) + '. Someone from our on-call team will call you back shortly.' + (F.unm ? ' Lighthouse doesn\'t control this equipment, so please also contact your service contractor straight away.' : '') });
  return cid;
}

/* ------------------------------------------------------------------ 3. the question screen, inserted in front of a ticket that is raised while unresolved */
const refersTo = (n, id) => (n.edges || []).some(e => e.to === id) || [n.flowHtml, n.modalHtml, n.pageHtml].some(h => h && h.includes('data-to="' + id + '"'));
function retargetAll(n, from, to) {
  (n.edges || []).forEach(e => { if (e.to === from) e.to = to; });
  ['flowHtml', 'modalHtml', 'pageHtml'].forEach(k => { if (n[k]) n[k] = n[k].split('data-to="' + from + '"').join('data-to="' + to + '"'); });
}
function afterFrom(id, o) { // an open next-working-day ticket screen, built from the known list of the question screen
  const card = H.afterCard('outcome-captured', 'Ticket created for the IoT team', EX, '<p class="after-line">Nothing was switched from here. The IoT team picks it up the <b>next working day</b>.</p><p class="after-line small">On the ticket: ' + esc(o.subject) + '</p>',
    'Thanks. It\'s logged, reference ' + dyn(EX) + ', and our IoT team picks it up the next working day.', '');
  return add({ id, g: o.g, t: o.t, rootKey: o.root, flowHtml: shell(o.icon, o.title, addKnown(o.known, 'no') + card + H.addNote(EX) + H.outButtons(), false), edges: [], deltas: ['R14'], authored: true, ticketNode: true, from: o.from });
}
const GATED = []; // [question id, target id]
function gate(target, o) {
  o = o || {};
  const t = NODES[target]; if (!t) throw new Error('gate: no node ' + target);
  const parents = Object.values(NODES).filter(n => n.id !== target && !/^(RQ:|F:|NT:)/.test(n.id) && !(o.except || []).includes(n.id) && refersTo(n, target));
  const hd = headOf(t.flowHtml) || { icon: '🛠', title: 'Something else / not sure' };
  const fkey = ICONKEY[hd.icon] || 'Else';
  const p0 = parents.find(p => knownOf(p.flowHtml));
  const known = p0 ? knownOf(p0.flowHtml) : knownOf(t.flowHtml);
  const g = t.g, root = frameOf(t);
  const rq = 'RQ:' + target;
  const yes = o.yesIsTarget ? target : famNodes(o.fam, fkey, g, root);
  let no = target;
  if (o.noNew) no = afterFrom('NT:' + target, { g, t: 'Risk: No, normal ticket (' + (o.noNew.label || target) + ')', root, icon: hd.icon, title: hd.title, known, subject: o.noNew.subject }).id;
  else { t.flowHtml = addKnown(t.flowHtml, 'no'); mark(t); }
  parents.forEach(p => retargetAll(p, target, rq));
  add({ id: rq, g, t: 'Risk question before: ' + (t.t || target).slice(0, 60), rootKey: root, authored: true, deltas: ['R14'], edges: [], kind: 'flow',
    flowHtml: shell(hd.icon, hd.title, known + RISK_HELP + H.sayBox('', RISK_ASK) + H.answers([['Yes', yes], ['No', no]], 'customer-answers'), true) });
  GATED.push([rq, target]);
  if (o.except) NODES[target].exemptParents = o.except;
  return rq;
}

/* kitchen: the live questions are rewritten in place above; the paths that did not ask one are gated here */
['K8888~12', 'K8888~18', 'K8888~29', 'K6832~18', 'K8888-gw-B-unscheduled~2', 'K8888-gw-B-outside~2', 'K-none~2'].forEach(id => gate(id, { fam: 'unm' }));
['K8888~46', 'K8888~51', 'K6832~23', 'K6832~28', 'K6832~33', 'K-attend-no'].forEach(id => gate(id, { fam: 'kitchen' }));
/* lighting: override first (159 J1); still off now asks the question instead of going straight to the P1 */
gate('L6749~3', { yesIsTarget: true, noNew: { label: 'lighting still off', subject: 'External lighting not working — no immediate risk' } });
gate('L6360~3', { yesIsTarget: true, noNew: { label: 'lighting still off', subject: 'External lighting not working — no immediate risk' } });
gate('L6961~4', { yesIsTarget: true, noNew: { label: 'lighting still off', subject: 'External lighting not working — no immediate risk' } });
/* extractor fans, air conditioning, hot water, connection check, heating, boiler panel */
['FAN6851~2', 'FAN-switch~3'].forEach(id => gate(id, { fam: 'fan' }));
gate('AC6218~1', { fam: 'ac' });
['HW-nodhw', 'HW-auto', 'HW-auto-ended', 'HW-on-until', 'HW-off-until', 'HW-on-v1', 'HW-off-v1', 'HW-cc-stale', 'HW-cc-notreconf', 'HW-cc-decode', 'HW-nlh'].forEach(r => gate('HW:' + r, { fam: 'hw' }));
['CN6832~2', 'CN5198~2', 'CN6771~3', 'CN6772~2', 'CN6773~2'].forEach(id => gate(id, { fam: 'conn' }));
['BP9001~5', 'BP9001~6'].forEach(id => gate(id, { fam: 'heat' }));
gate('BP9001-read~6', { fam: 'heat', except: ['BPdone-on'] });
gate('BP9001-read~8', { fam: 'heat', except: ['BPdone-off'] });
gate('S7001~4', { fam: 'heat' });
gate('S-coldrads', { fam: 'heat' });
['S-buildheat', 'S-broken-keepingup'].forEach(id => gate(id, { fam: 'unm' }));
['CTL:escalate-indet', 'CTL:escalate-nondel'].forEach(id => gate(id, { fam: 'heat' }));
/* contractor on site: the "always urgent" rule goes; the override is still offered first */
gate('CT6832~4', { yesIsTarget: true, noNew: { label: 'contractor, something else', subject: 'Contractor on site — no immediate risk' } });
['CT6832~9', 'CT6832~10'].forEach(id => gate(id, { yesIsTarget: true, noNew: { label: 'contractor, override failed', subject: 'Contractor on site, PowerPause override failed — no immediate risk' } }));
gate('CT-dd~4', { yesIsTarget: true, noNew: { label: 'contractor, something else', subject: 'Contractor on site — no immediate risk' } });
gate('CT-dd~5', { yesIsTarget: true, noNew: { label: 'contractor, Donkey Derby', subject: 'Contractor on site (Donkey Derby), override unavailable — no immediate risk' } });
/* not on Lighthouse here (closed notes) and the heating closed notes */
['L-none-1', 'FAN-none-1', 'H-none-1', 'AC-none-1', 'O-none'].forEach(id => gate(id, { fam: 'unm' }));

/* site could not be identified (ambiguous house number): a page, not a flow panel */
{
  const lg = NODES['SITE-ambiguous-logged'], amb = NODES['SITE-ambiguous'];
  const yesId = famNodes('site', 'Else', 'PAGES', 'K6832');
  const card = '<div style="padding:0 20px"><div class="card tight"><h3>Before I log this</h3>' + RISK_HELP + H.sayBox('', RISK_ASK) + H.answers([['Yes', yesId], ['No', 'SITE-ambiguous-logged']], 'customer-answers') + '</div></div>';
  B.NODES['SITE-ambiguous-logged'].pageHtml = addKnown(lg.pageHtml, 'no');
  mark(lg);
  const q = add({ id: 'RQ:SITE-ambiguous-logged', g: 'PAGES', t: 'Risk question before: house number matches two sites: logged', kind: 'page', pageHtml: amb.pageHtml.replace(/<div class="outbtns">[\s\S]*?<\/div>/, '') + card, deltas: ['R14'], authored: true, edges: [] });
  GATED.push([q.id, 'SITE-ambiguous-logged']);
}

/* ------------------------------------------------------------------ 4. the P1 confirm screens: mandatory comment, button disabled until it has real content */
const PREFILL = 'Fryers off during Sunday lunch service, 80 covers booked';
function p1Confirm(n) {
  let h = n.flowHtml; if (!h || !h.includes('p1-confirm-warning') || h.includes('data-p1c')) return;
  const retry = n.id === 'SH:p1fail';
  h = h.replace(/(<div class="tb-detail">[^<]*<\/div>)(<\/div>)/, (m, a, b) => a + H.tbReason(retry ? PREFILL : '') + b);
  h = h.replace('<div class="p1warn"', H.p1Reason(retry ? PREFILL : '') + '<div class="p1warn"');
  if (!retry) h = h.replace(/(<button class="btn danger" data-testid="record-outcome"[^>]*?)(>Raise the P1<\/button>)/, '$1 disabled aria-disabled="true"$2');
  h = addKnown(h, 'yes');
  n.flowHtml = h; mark(n);
}
function p1After(n) {
  let h = n.flowHtml; if (!h || !h.includes('outcome-p1')) return;
  if (!h.includes('data-testid="p1-reason-note"')) h = h.replace(/(<p class="after-line small">On the ticket: [^<]*<\/p>)/, '$1<p class="after-line small" data-testid="p1-reason-note">Why it\'s urgent is on the ticket, in your words.</p>');
  h = addKnown(h, 'yes');
  n.flowHtml = h; mark(n);
}
Object.values(NODES).forEach(n => { p1Confirm(n); if (n.isP1) p1After(n); });
// fridge: "No" is the live closed note (Lighthouse does not control fridges); it records the answer
NODES['FR6851~3'].flowHtml = addKnown(NODES['FR6851~3'].flowHtml, 'no'); mark(NODES['FR6851~3']);

/* ------------------------------------------------------------------ 5. exemptions: ticket screens where the problem was resolved on the call, or the customer declined */
const EXEMPT = {
  resolved: ['K8888~9', 'K8888~14', 'K8888~17', 'K8888~20', 'K8888~24', 'K8888~27', 'K6832~6', 'K6832~10', 'K6832~14', 'K8888-gw-off-unknown~2', 'K8888-gw-fallback~2', 'L6749~2', 'L6360~2', 'L6961~3', 'L6961~7', 'CT6832~8', 'CN6771~2', 'K-booked-later', 'K-booked-earlier', 'K-cancelled', 'K-fine', 'CTL:finish-up', 'CTL:finish-frost', 'CTL:finish-switch', 'CTL:release-ok', 'BPdone-on', 'BPdone-off'],
  declined: ['S7001~5', 'S-offnoact'],
  copy: ['SH:p1fail']
};
Object.entries(EXEMPT).forEach(([why, ids]) => ids.forEach(id => { if (!NODES[id]) throw new Error('exempt: no node ' + id); NODES[id].exempt = why; }));

module.exports = { GATED, EXEMPT };
