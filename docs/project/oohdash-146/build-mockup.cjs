// OOHDASH-146 rev 2: rebuilds the real-screen prototype from proposed-wording.cjs.
// Keeps the captured real page (head, stylesheet, workspace markup) and replaces the data + renderer script.
// Usage: node build-mockup.cjs   (writes ../mockups/OOHDASH-146-mockup.html)
const fs = require('fs');
const path = require('path');
const { STATES, SHARED, LOG, LOGC, P1BTN } = require('./proposed-wording.cjs');
const MOCK = path.join(__dirname, '..', 'mockups', 'OOHDASH-146-mockup.html');
const html = fs.readFileSync(MOCK, 'utf8');
const m = html.match(/<script>\s*\nvar STATES/);
if (!m) throw new Error('data script not found');
let head = html.slice(0, m.index);

const CSS = `/* rev2 */
.callerline{display:flex;align-items:center;gap:8px;background:var(--surface-variant);border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 12px;margin:0 0 10px;font-size:13px}
.callerline a{margin-left:auto;color:var(--primary);cursor:pointer;font-size:12.5px}
.oneoff-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--info-light);border:1px solid #BFDBFE;border-radius:var(--radius-md);padding:10px 14px;margin-bottom:10px;color:#1E40AF;font-weight:500}
.oneoff-banner .btn{margin-left:auto}
.checkbox-note{font-size:12.5px;color:var(--text-secondary);margin-top:6px}
.dim{opacity:.45;pointer-events:none}
#proto .sim{margin-left:10px}
.overlay{top:var(--proto-h,0px)!important;align-items:flex-start!important;overflow:auto}
.drawer{top:var(--proto-h,0px)!important}
`;
head = head.replace(/\/\* rev2 \*\/[\s\S]*?<\/style>/, '</style>');
head = head.replace('</style>\n</head>', CSS + '</style>\n</head>');
head = head.replace(/<span class="pdesc">[\s\S]*?<\/span><div class="row" id="flowrow">/,
  '<span class="pdesc"> · the real OOH Dashboard screen (captured from the app in fixture mode) with the revision 2 wording inside (your D5 to D12). Pick a flow, then a screen. Buttons work: answers go to the next screen, cards go to Check and log, then to the logged result or the closed note. Example data and ticket numbers only. <label><input type="checkbox" id="showold" onchange="S.old=this.checked;draw()"> Show today’s text under each screen</label><label class="sim"><input type="checkbox" id="simfail" onchange="S.sim=this.checked;S.failedOnce=false"> Make the next log or P1 fail once</label></span><div class="row" id="flowrow">');

const cur = Object.assign(JSON.parse(fs.readFileSync(path.join(__dirname, 'screen-dump-7bd03ba.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(__dirname, 'screen-dump-extra-7bd03ba.json'), 'utf8')));
const OLD = {};
for (const s of STATES) {
  const ids = s.was || [s.id];
  const t = ids.filter(i => cur[i]).map(i => cur[i].text.split('\n').map(x => x.trim()).filter(Boolean).filter(x => !/^(guided flow|Cancel issue|💬|✓|You: |Each issue is logged|📝 Anything|For the ticket and|\d+ \/ 1000)/.test(x)).join('\n'));
  if (t.length) OLD[s.id] = t.join('\n—\n');
}
const data = 'var STATES = ' + JSON.stringify(STATES).split(' (unchanged)').join('') + ';\nvar SHARED = ' + JSON.stringify(SHARED) +
  ';\nvar LOGBTN = ' + JSON.stringify(LOG) + ';\nvar LOGCBTN = ' + JSON.stringify(LOGC) + ';\nvar P1BTN = ' + JSON.stringify(P1BTN) + ';\nvar OLD = ' + JSON.stringify(OLD) + ';\n';

const RENDER = String.raw`
var ICON = {'Customer details':'👤','Hot water':'🚿','Kitchen':'🍳','Outside lighting':'💡','Extractor fans':'🌀','Fridges and freezers':'🧊','Connection check':'📡','Contractor on site':'🧰','Something else':'✍️','Air conditioning':'❄️','Heating (thermostats)':'🌡️','Device control window':'🌡️','Shared screens':'🧾','Other screens':'📞'};
var WORDS = {'Hot water':'No hot water in the kitchen','Kitchen':'The fryer won’t come on','Outside lighting':'Car park lights are off','Extractor fans':'Need the fans on late','Fridges and freezers':'Freezer alarm going off','Connection check':'The bar is freezing','Contractor on site':'','Something else':'Cellar cooler alarm going off','Air conditioning':'Aircon in the function room is blowing warm','Heating (thermostats)':'The bar is freezing','Device control window':'The bar is freezing','Shared screens':'No hot water in the kitchen'};
var S = { flow: 'Customer details', id: null, phase: 'card', old: false, issues: [], sim: false, failedOnce: false };
var ENTRY = '';
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function st(id){for(var i=0;i<STATES.length;i++)if(STATES[i].id===id)return STATES[i];return null;}
function flows(){var f=[];STATES.forEach(function(s){if(f.indexOf(s.flow)<0)f.push(s.flow);});return f;}
function go(id){var s=st(id);if(!s)return;S.flow=s.flow;S.id=id;S.phase='card';S.issues=[];draw();window.scrollTo(0,0);}
function pickFlow(f){S.flow=f;S.issues=[];var first=STATES.filter(function(s){return s.flow===f;})[0];go(first.id);}
function toast(t){var el=document.getElementById('toasts');el.innerHTML='<div class="toast">'+t+'</div>';setTimeout(function(){el.innerHTML='';},2600);}
function say(t,aud){return '<div class="say" data-testid="say-block"><span class="say-label">🗣 Say to the '+(aud||'customer')+'</span>'+esc(t)+'</div>';}
function gtk(t){return t?'<div class="gtk" data-testid="gtk-block"><span class="gtk-label">ℹ Good to know (for you, not the customer)</span>'+esc(t)+'</div>':'';}
function nav(c){return c[1]?"go('"+c[1]+"')":"toast('In the app this continues to the next step.')";}
function chipBtns(s){return (s.chips||[]).map(function(c){var cls=c[2]?'btn primary':(s.kind==='step'&&!s.hd&&!s.say?'chip':'btn');return '<button class="'+cls+'" onclick="'+nav(c)+'">'+esc(c[0])+'</button>';}).join('');}
function notesBox(){return '<div class="notes-group"><label class="notes-label">📝 Anything the customer told you that isn’t captured above, e.g. engineer due at 7am</label><textarea class="notes-input" rows="2" placeholder="Anything the customer told you that isn’t captured above, e.g. engineer due at 7am"></textarea><div class="notes-meta"><span class="small">For the ticket and the IoT helpdesk’s morning review. Not sent in urgent P1 texts. Keep it factual, no personal details.</span><span class="small">0 / 1000</span></div></div>';}
function outBtns(){return '<div class="outbtns"><button class="btn" onclick="toast(\'Starts a new issue for the same call and customer.\')">➕ Add another issue</button><button class="btn primary" onclick="toast(\'Ends the call and clears the customer details.\')">✔ End call</button></div>';}
function callerLine(){return '<div class="callerline" data-testid="caller-line">👤 <b>Priya Shah</b> · duty manager · 07700 900123<a onclick="go(\'CD-ws\')">Change</a></div>';}
function bannerHtml(b){var m=b.match(/^(.*?)\s*\[(\w+)\]\s*$/);if(!m)return '<div class="oneoff-banner">'+esc(b)+'</div>';return '<div class="oneoff-banner" data-testid="oneoff-banner">'+esc(m[1])+'<button class="btn" onclick="'+(m[2]==='Cancel'?"go('K-cancelled')":"go('CD-ws')")+'">'+esc(m[2])+'</button></div>';}
function linesHtml(ls){return (ls||[]).map(function(l){return '<p class="small" style="margin:6px 0">'+esc(l)+'</p>';}).join('');}
function fieldsHtml(fs){return (fs||[]).map(function(f){return '<div class="formrow"><label>'+esc(f)+'</label><input></div>';}).join('');}
function cardBody(s){
  var h='';
  if(s.banner) h+=bannerHtml(s.banner);
  if(s.read) h+='<div class="zoneread"><span class="small">'+esc(s.read)+'</span></div>';
  if(s.rows) h+=s.rows.map(function(r){return '<div class="zoneread"><span style="font-size:20px">'+(s.flow==='Extractor fans'?'🌀':'💡')+'</span><div><b>'+esc(r[0])+'</b></div><div style="margin-left:auto"><button class="btn primary" onclick="go(\'CTL-compose-switch\')">'+esc(r[1])+'</button></div></div>';}).join('');
  if(s.list) h+='<div data-testid="kitchen-all-summary">'+s.list.map(function(l){return '<div class="small">'+esc(l)+'</div>';}).join('')+'</div>';
  var inner='';
  if(s.hd) inner+='<b class="hd">'+esc(s.hd)+(s.tag?' <span class="tag '+({'Normal timetable':'green','Switched on':'blue','Switched off':'amber'}[s.tag]||'grey')+'">'+esc(s.tag)+'</span>':'')+'</b>';
  if(s.alert) inner+='<div class="alert err" style="margin:8px 0">'+esc(s.alert)+'</div>';
  if(s.lines) inner+=linesHtml(s.lines);
  if(s.say) inner+=say(s.say,s.audience);
  inner+=gtk(s.gtk);
  if(s.fact) inner+='<div class="factline">'+esc(s.fact)+'</div>';
  inner+=fieldsHtml(s.fields);
  if(s.field) inner+='<div class="formrow"><label>'+esc(s.field)+'</label><input></div>';
  if(s.q) inner+='<div class="stepq">'+esc(s.q)+'</div>';
  if(s.kind==='outcome') inner+='<div class="outbtns"><button class="btn primary" data-testid="std-checklog" onclick="S.phase=\'wrap\';draw()">Check and log</button></div>';
  else if(s.chips) inner+='<div class="'+(s.hd||s.say?'outbtns':'chips')+'">'+chipBtns(s)+'</div>';
  if(s.hd||s.say) h+='<div class="reco'+(s.log&&s.log.closed?' closedcard':'')+'">'+inner+'</div>'; else h+=inner;
  return h;
}
function failOnce(){ if(S.sim&&!S.failedOnce){S.failedOnce=true;return true;} return false; }
function submitLog(subject){ S.phase='logging';draw();setTimeout(function(){ if(failOnce()){S.phase='logfail';draw();return;} S.phase='logged';S.issues.push(subject);draw();},600); }
function submitP1(subject){ S.phase='logging';draw();setTimeout(function(){ if(failOnce()){S.phase='p1fail';draw();return;} S.phase='logged';S.issues.push(subject);draw();},600); }
var CUR=null;
function wrapUp(s,failMsg){
  CUR=s;
  return '<div class="wrapup" data-testid="wrap-up"><h3>Check and log</h3>'+
   (failMsg?'<div class="alert err" data-testid="log-failed" style="margin-bottom:10px">'+esc(failMsg)+'</div>':'')+
   '<div class="wu-section"><strong>Customer</strong>'+esc(SHARED.customer)+' <a style="color:var(--primary);cursor:pointer;font-size:12.5px" onclick="go(\'CD-ws\')">Change</a></div>'+
   '<div class="wu-section"><strong>What the customer said</strong>'+(WORDS[s.flow]?esc(WORDS[s.flow]):'<span class="small">Nothing recorded</span>')+'</div>'+
   '<div class="wu-section"><strong>What we found</strong>'+esc(s.hd)+'</div>'+
   '<div class="wu-section"><strong>What we did</strong><ul class="wu-actions"><li>'+(s.done&&/came on with|lights are on|came back on|Back online/.test(s.done)?esc(s.done):(s.log.closed?'Told the customer who to contact':'Nothing changed'))+'</li></ul></div>'+
   '<div class="wu-section"><strong>What we’ll log</strong>'+esc(s.log.detail)+'</div>'+
   (s.log.closed?'<p class="small">This is saved as a closed ticket: a note for the record, with nothing for our team to do.</p>':'')+
   '<div class="outbtns" style="margin-top:14px"><button class="btn primary" data-testid="wrap-submit" onclick="submitLog(CUR.log.subject)">'+esc(failMsg?'Try again':(s.log.closed?LOGCBTN:LOGBTN))+'</button></div></div>';
}
function logged(s){
  var c=s.log.closed;
  return '<div class="outcome applied" data-testid="'+(c?'wrap-logged-closed':'wrap-logged')+'"><div style="font-size:15px;font-weight:700;margin-bottom:8px">'+esc(c?SHARED.closedLogged:SHARED.logged)+'</div><div class="small">'+esc(c?SHARED.closedNext:SHARED.loggedNext)+'</div>'+
   '<div class="small loggedlist" style="margin-top:6px">• What we found: '+esc(s.hd)+'\n• What we’ll log: '+esc(s.log.detail)+'</div></div><p class="small" style="margin-top:8px">+ Add a note to ticket #48213</p>'+outBtns();
}
function p1Card(s,failed){
  CUR=s;
  return '<div class="reco p1card" data-testid="p1-card"><b class="hd">'+esc(s.hd)+'</b>'+gtk(s.gtk)+
   (failed?'<div class="alert err" data-testid="p1-raise-failed" style="margin:8px 0">'+esc(SHARED.p1Fail)+'</div>':'')+
   '<div class="wu-section" style="margin-top:8px"><strong style="display:block;font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.4px">Customer</strong>'+esc(SHARED.customer)+'</div>'+
   '<div class="wu-section" style="margin-top:8px"><strong style="display:block;font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.4px">What we’ll log</strong>'+esc(s.log.detail)+'</div>'+
   '<div class="outbtns"><button class="btn danger" style="background:var(--danger);color:#fff;border-color:var(--danger)" data-testid="wrap-submit-p1" onclick="submitP1(CUR.log.subject)">'+esc(failed?'Try again':P1BTN)+'</button></div></div>';
}
function p1Logged(s){
  return '<div class="outcome p1" data-testid="outcome-p1"><h3>'+esc(SHARED.p1Logged)+'</h3><p data-testid="p1-dispatch-status">'+esc(SHARED.p1Status)+'</p>'+say(s.sayAfter,s.audience)+'</div><p class="small" style="margin-top:8px">+ Add a note to ticket #48213</p>'+outBtns();
}
function ctlOut(s){
  var h='<div class="reco"><b class="hd">'+esc(s.hd)+'</b>'+(s.body?'<p>'+esc(s.body)+'</p>':'');
  if(s.alert) h+='<div class="alert err" style="margin:8px 0">'+esc(s.alert)+(s.alertBtn?' <button class="btn" onclick="go(\'CTL-release-ok\')">'+esc(s.alertBtn)+'</button>':'')+'</div>';
  h+=say(s.say)+gtk(s.gtk)+(s.foot?'<p class="small">'+esc(s.foot)+'</p>':'');
  if(s.chips) h+='<div class="outbtns">'+s.chips.map(function(c){return '<button class="btn'+(c[2]?' primary':'')+'" onclick="'+nav(c)+'">'+esc(c[0])+'</button>';}).join('')+'</div>';
  h+='</div>'+(s.foot&&/ticket #/.test(s.foot)?'<p class="small">+ Add a note to ticket</p>':'')+outBtns();
  return h;
}
function flowPanel(s, body, withNotes){
  var w=WORDS[s.flow];
  var head=s.flow==='Device control window'?'Heating':(s.flow==='Shared screens'?'Hot water':s.flow);
  return callerLine()+'<div class="flowpanel" data-testid="flow-panel"><div class="flowhead"><span style="font-size:18px">'+(ICON[s.flow]||'')+'</span><b>'+esc(head)+'</b><span class="small" style="margin-left:6px">guided flow</span><button class="btn link" style="margin-left:auto" onclick="S.id=null;draw()">Cancel issue</button></div>'+
   '<div class="flowbody">'+(w?'<div class="stepdone"><span>💬</span>Customer’s words: “'+esc(w)+'”</div>':'')+(s.done?'<div class="stepdone"><span class="tick">✓</span>'+esc(s.done)+'</div>':'')+body+(withNotes?notesBox():'')+'</div>'+
   '<div class="flowfoot"><span>You: <b>Sam Okafor</b></span><span style="margin-left:auto">Each issue is logged to a ticket when you finish it</span></div></div>';
}
function modal(s){
  var ls=(s.lines||[]).map(function(l){return /^\[/.test(l)?'<div class="chips" style="margin:6px 0">'+l.replace(/\[([^\]]+)\]/g,function(m,x){return '<button class="chip'+(/✓|default/.test(x)?' sel':'')+'">'+esc(x.replace(' ✓',''))+'</button>';})+'</div>':(/^1\. Sent/.test(l)?'<div class="syncsteps">'+l.split(' · ').map(function(x){return '<div class="ss '+(/✅|Accepted|Sent/.test(x)?'ok':/✕/.test(x)?'bad':/⚠/.test(x)?'bad':'on')+'">'+esc(x)+'</div>';}).join('')+'</div>':'<p class="'+(/^[✅❌⚠📨⏱]/.test(l)?'alert '+(/^✅/.test(l)?'ok':/^❌/.test(l)?'err':/^⚠/.test(l)?'warn':'info'):'guard')+'" style="margin:8px 0;text-align:left">'+esc(l)+'</p>');}).join('');
  var big=s.big?'<div style="text-align:center;margin:10px 0"><span class="val" style="font-size:34px;font-weight:700">'+esc(s.big)+'</span></div>':'';
  var btns=(s.chips||[]).map(function(c){var nx=c[1]?"closeM();go('"+c[1]+"')":"closeM();toast('Closed without sending.')";return '<button class="btn'+(c[2]?' primary':'')+'" onclick="'+nx+'">'+esc(c[0])+'</button>';}).join('');
  return '<div class="overlay"><div class="modal"><div class="mh">'+esc(s.mtitle)+'<button class="btn link" onclick="closeM()">✕</button></div><div class="mb"><div class="target"><span class="target-name">The Wheatsheaf</span><div class="target-tech">'+esc(s.target)+'</div></div>'+big+ls+'</div>'+(btns?'<div class="mf">'+btns+'</div>':'')+'</div></div>';
}
function closeM(){document.getElementById('modalroot').innerHTML='';}
function wsCard(inner){return '<div class="card" style="padding:18px">'+inner+'</div>';}
function view(s){
  if(s.id==='CB-drawer'){
    document.getElementById('modalroot').innerHTML='<div class="drawer"><div class="dh">Ticket #48213<button class="btn link" onclick="closeM()">✕</button></div><div class="db"><p><b>Target temperature raised — Bar area</b></p><p class="small" style="margin-bottom:10px">Opened 20 minutes ago · <span class="tag blue">Just received — not yet picked up</span></p>'+say(s.say)+'<p class="small" style="margin-top:8px">'+esc(s.lines[0])+'</p><h3 style="margin-top:14px">When does the customer expect an update?</h3><div style="display:flex;gap:8px;margin-bottom:14px"><input type="date"><button class="btn">Save follow-up</button></div><h3>Notes &amp; feedback thread</h3><p class="small">Shared with the IoT team. Replies made in the IoT Support dashboard appear here.</p><p class="small" style="margin-top:8px">'+esc(s.lines[1])+'</p></div></div>';
    return '<div class="card"><h2>Callback Lookup</h2><p class="sub">The drawer on the right shows the new “Say to the customer” block.</p></div>';
  }
  if(s.id==='TONIGHT'){
    return '<div class="card"><h2>Tonight</h2><p class="sub" style="margin-bottom:10px">Every call and action in the current out-of-hours period (since 17:00).</p><table class="tbl"><tr><th>Time</th><th>Site</th><th>What happened</th><th>Outcome</th></tr>'+s.table.map(function(r){var c={'heating turned on':'blue','back to normal':'green','applied ✓':'green','captured':'blue','closed note':'grey','added to ticket':'blue','one-off booked':'blue','one-off on':'blue','one-off done':'green','not carried out':'red'}[r[3]]||'grey';return '<tr><td>'+r[0]+'</td><td><b>'+esc(r[1])+'</b></td><td>'+esc(r[2])+'</td><td><span class="tag '+c+'">'+esc(r[3])+'</span><div class="small">'+esc(r[4])+'</div></td></tr>';}).join('')+'</table><p class="small" style="margin-top:10px">'+esc(s.lines[0])+'</p></div>';
  }
  if(s.id==='CD-home'){
    return '<div class="content narrow" style="padding:0"><div class="card" style="padding:26px" data-testid="caller-details"><h2>'+esc(s.hd)+'</h2>'+say(s.say)+fieldsHtml(s.fields)+gtk(s.gtk)+
      '<h3 style="margin-top:14px">Find the site</h3><p class="sub" style="margin-bottom:10px">Ask for the <b>house number</b> (4 digits) or search by pub name. You can do this before or after the details.</p><div class="searchwrap"><input placeholder="e.g. 7412 or The Wheatsheaf"></div>'+
      '<div class="outbtns" style="margin-top:14px"><button class="btn primary" onclick="go(\'CD-saved\')">Save details and open The Wheatsheaf</button><button class="btn" onclick="toast(\'Records “Customer declined to give their details” on every ticket from this call.\')">The customer won’t give these</button></div></div></div>';
  }
  if(s.id==='CD-check'){ var hs=st('HW-nlh'); return callerLine()+wrapUp(hs); }
  if(s.id==='SH-closed'){ return flowPanel(st('HW-nlh'),logged(st('HW-nlh')),false); }
  if(s.id==='SH-p1fail'){ return flowPanel(st('K-crit'),p1Card(st('K-crit'),true),true); }
  if(s.id==='SH-logfail'){ return flowPanel(st('K-override-ok'),wrapUp(st('K-override-ok'),s.alert),true); }
  if(s.id==='WS-offline'){ return '<div class="alert err" data-testid="offline-banner" style="margin:0 0 10px">'+esc(s.alert)+'</div>'+ENTRY+linesHtml(s.lines); }
  var h='<div class="card" style="padding:22px">';
  if(s.hd) h+='<h2>'+esc(s.hd)+'</h2>';
  h+=gtk(s.gtk);
  if(s.say) h+=say(s.say);
  h+=linesHtml(s.lines);
  if(s.chips) h+='<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">'+s.chips.map(function(c){return '<button class="btn'+(c[2]?' primary':'')+'" onclick="toast(\'In the app this continues.\')">'+esc(c[0])+'</button>';}).join('')+'</div>';
  return h+'</div>';
}
function wsView(s){
  if(s.id==='CD-ws') return wsCard('<h3>'+esc(s.hd)+'</h3>'+say(s.say)+fieldsHtml(s.fields)+gtk(s.gtk)+'<div class="outbtns"><button class="btn primary" onclick="go(\'CD-saved\')">Save and continue</button><button class="btn" onclick="toast(\'Records “Customer declined to give their details”.\');go(\'CD-saved\')">The customer won’t give these</button></div>')+'<div class="dim">'+ENTRY+'</div><p class="checkbox-note">The issue buttons work once the details are saved (or the customer declines).</p>';
  if(s.id==='CD-saved') return callerLine()+gtk(s.gtk)+ENTRY+'<div class="chips" style="margin-top:8px">'+chipBtns(s)+'</div>';
  if(s.id==='K-banner') return callerLine()+bannerHtml(s.banner)+gtk(s.gtk)+ENTRY;
  return '';
}
function draw(){
  var fr=document.getElementById('flowrow'), sr=document.getElementById('staterow');
  fr.innerHTML='<span style="color:#94A3B8;margin-right:4px">Flow:</span>'+flows().map(function(f){return '<button class="pb'+(f===S.flow?' on':'')+'" onclick="pickFlow(\''+f+'\')">'+esc(f)+'</button>';}).join('');
  sr.innerHTML='<span style="color:#94A3B8;margin-right:4px">Screen:</span>'+STATES.filter(function(s){return s.flow===S.flow;}).map(function(s){return '<button class="pb'+(s.id===S.id?' on':'')+'" title="'+esc(s.id)+'" onclick="go(\''+s.id+'\')">'+esc(s.title)+'</button>';}).join('');
  protoH();
  var el=document.getElementById('flow'); closeM();
  document.getElementById('callsofar').innerHTML=S.issues.length?'<div class="callsofar" data-testid="call-so-far"><b>This call so far:</b> '+S.issues.map(function(i){return '<span class="tag blue">'+esc(i)+'</span>';}).join(' ')+'</div>':'';
  if(!S.id){ el.innerHTML=callerLine()+ENTRY; return; }
  var s=st(S.id), body='';
  if(s.id==='CD-ws'||s.id==='CD-saved'||s.id==='K-banner'){ el.innerHTML=wsView(s)+oldText(s); return; }
  if(s.kind==='view'){ el.innerHTML=view(s)+oldText(s); return; }
  if(s.kind==='modal'){ el.innerHTML=flowPanel(s,'<div class="alert info">Complete the control action in the window…</div>',false)+oldText(s); document.getElementById('modalroot').innerHTML=modal(s); return; }
  if(s.kind==='ctlout'){ el.innerHTML=flowPanel(s,ctlOut(s),false)+oldText(s); return; }
  if(s.kind==='p1'){
    if(S.phase==='logged') body=p1Logged(s); else if(S.phase==='logging') body='<div class="alert info">Raising the P1…</div>'; else body=p1Card(s,S.phase==='p1fail');
    el.innerHTML=flowPanel(s,body,S.phase==='card'||S.phase==='p1fail')+oldText(s); return;
  }
  if(s.kind==='outcome'){
    if(S.phase==='wrap') body=wrapUp(s); else if(S.phase==='logfail') body=wrapUp(s,'We couldn’t log this: we couldn’t reach the ticket system.'); else if(S.phase==='logging') body='<div class="alert info">Logging…</div>'; else if(S.phase==='logged') body=logged(s); else body=cardBody(s);
    el.innerHTML=flowPanel(s,body,S.phase==='card'||S.phase==='wrap'||S.phase==='logfail')+oldText(s); return;
  }
  el.innerHTML=flowPanel(s,cardBody(s),true)+oldText(s);
}
function oldText(s){ var dn=s.note?'<div class="oldtext" style="border-color:#94A3B8;background:#F8FAFC;color:#334155"><b>Design note (not shown in the app)</b>'+esc(s.note)+'</div>':''; if(!S.old) return dn; var t=OLD[s.id]; return '<div class="oldtext"><b>Today’s screen text (captured from the live code in fixture mode)'+(s.inj?', reached with injected data':'')+'</b>'+(t?esc(t):'(this screen does not exist today)')+'</div>'+dn; }
function togProto(){var p=document.getElementById('proto');p.classList.toggle('min');document.getElementById('ptog').textContent=p.classList.contains('min')?'Show scenarios':'Hide';protoH();}
function protoH(){document.documentElement.style.setProperty('--proto-h',document.getElementById('proto').offsetHeight+'px');}
(function boot(){
  var left=document.querySelector('.wsgrid > div');
  var cards=left.querySelectorAll('.card');
  var entry=cards[1];
  entry.querySelectorAll('[onclick],[oninput]').forEach(function(e){e.removeAttribute('onclick');e.removeAttribute('oninput');});
  ENTRY=entry.outerHTML; entry.remove();
  var mk=function(id){var d=document.createElement('div');d.id=id;left.appendChild(d);return d;};
  mk('callsofar'); mk('flow');
  document.querySelectorAll('[onclick]').forEach(function(e){ if(!e.closest('#proto')) e.removeAttribute('onclick'); });
  var b=document.querySelector('[data-testid=control-live-banner]'); if(b) b.remove();
  go('CD-home'); window.addEventListener('resize',protoH);
})();
`;
const out = head + '<script>\n' + data + RENDER + '</script>\n</body></html>\n';
fs.writeFileSync(MOCK, out);
console.log('mockup written', (out.length / 1024).toFixed(0) + ' KB', STATES.length, 'states');
