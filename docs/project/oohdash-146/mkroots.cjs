const fs=require('fs');
const DHW={auto:{mode:'auto'},'auto-ended':{mode:'on-until',untilMs:-30*60000},'on-until':{mode:'on-until',untilMs:90*60000},'off-until':{mode:'off-until',untilMs:120*60000},'on-v1':{mode:'on-v1',confirmedAt:-5*60000},'off-v1':{mode:'off-v1',confirmedAt:-5*60000},'cc-stale':{mode:'auto',lastSeen:-3*3600000},'cc-notreconf':{mode:'on-v1',confirmedAt:-50*60000},'cc-decode':{mode:'cant-confirm',unreadableReason:'decode-error'}};
const R=[];
const hw=(id,site,setup,text)=>R.push({id,site,cat:'hotwater',text:text||'No hot water in the kitchen',setup,max:6});
hw('HW-nodhw','6832',"()=>{state.workspace.boilerControl={dhwOverride:{visible:false}};}");
for(const [k,v] of Object.entries(DHW)) hw('HW-'+k,'6832',"()=>{const v="+JSON.stringify(v)+";const now=Date.now();state.workspace.boilerControl={dhwOverride:{visible:true,mode:v.mode,panelLastSeenMs:now+(v.lastSeen||-60000),untilMs:v.untilMs!=null?now+v.untilMs:null,confirmedAtMs:v.confirmedAt!=null?now+v.confirmedAt:null,unreadableReason:v.unreadableReason||null}};}");
hw('HW-nlh','6360',null);
const gw=v=>"()=>{const d=state.workspace.devices.find(x=>x.deviceId==='gk-8888-glasswasher-1');d.tuya.verdict='"+v+"';}";
const drop=k=>"()=>{state.workspace.devices=state.workspace.devices.filter(d=>d.kind!=='"+k+"');}";
const out={
 A:[ {id:'K6832',site:'6832',cat:'kitchen',text:'The kitchen is dead',max:40},
     ...['B-unscheduled','B-outside','off-unknown','fallback'].map(v=>({id:'K8888-gw-'+v,site:'8888',cat:'kitchen',text:'The glass washer will not work',setup:gw(v),prefix:['Glass washer'],max:14})),
     {id:'K-none',site:'6832',cat:'kitchen',text:'The fryer will not come on',setup:drop('kitchen'),max:6},
     {id:'L6749',site:'6749',cat:'lighting',text:'Car park lights are off',max:25},
     {id:'L6360',site:'6360',cat:'lighting',text:'Car park lights are off',max:20},
     {id:'L6961',site:'6961',cat:'lighting',text:'Car park lights are off',max:20},
     {id:'L-none',site:'6832',cat:'lighting',text:'Car park lights are off',setup:drop('lighting'),max:6},
     {id:'FAN6851',site:'6851',cat:'fan',text:'Need the fans on late',max:25},
     {id:'FAN-switch',site:'6851',cat:'fan',text:'Need the fans on late',setup:"()=>{const d=state.workspace.devices.find(d=>d.kind==='fan');d.capabilities=['switch'];d.registered=true;d.telemetry=Object.assign({},d.telemetry,{switch_1:true});}",max:20},
     {id:'FAN-none',site:'6832',cat:'fan',text:'Need the fans on late',setup:drop('fan'),max:6} ],
 B:[ ...R,
     {id:'FR6851',site:'6851',cat:'fridge',text:'Freezer alarm going off',max:25},
     {id:'CN6832',site:'6832',cat:'connectivity',start:'banner',max:25},
     {id:'CN7004',site:'7004',cat:'connectivity',text:'Nothing is working',max:15},
     {id:'CN-devoff',site:'7004',cat:'connectivity',text:'The bar is freezing',setup:"()=>{const h=state.workspace.devices.find(d=>d.kind==='heating');if(h)h.online=false;}",setup2:"()=>{state.flow.data.from='heating';render();}",max:15},
     {id:'CN5198',site:'5198',cat:'connectivity',text:'Rooms are cold',setup2:"()=>{state.flow.data.from='heating';render();}",max:15},
     {id:'CN6771',site:'6771',cat:'connectivity',text:'Nothing is working',max:20},
     {id:'CN6772',site:'6772',cat:'connectivity',text:'Boiler not working',max:20},
     {id:'CN6773',site:'6773',cat:'connectivity',text:'Boiler not working',max:20},
     {id:'O6832',site:'6832',cat:'other',text:'Cellar cooler alarm going off',max:40},
     {id:'AC6218',site:'6218',cat:'aircon',text:'Aircon in the function room is blowing warm',max:8},
     {id:'AC-none',site:'6832',cat:'aircon',text:'Aircon is blowing warm',max:8} ],
 C:[ {id:'CT6832',site:'6832',cat:'contractor',text:'',max:40},
     {id:'CT-dd',site:'6832',cat:'contractor',text:'',setup:"()=>{state.workspace.site.siteNo='6786';}",max:25},
     {id:'S6832',site:'6832',cat:'heating',text:'The bar is freezing',max:45},
     {id:'S6832-cold',site:'6832',cat:'heating',text:'The bar is freezing',setup:"()=>{const d=state.workspace.devices.find(x=>x.deviceId==='IT500-BAR-6832');d.telemetry.localTemperature=16;d.telemetry.heatingSetpoint=20;}",max:30},
     {id:'S6832-near',site:'6832',cat:'heating',text:'Heating not working',setup:"()=>{const d=state.workspace.devices.find(x=>x.deviceId==='IT500-BAR-6832');d.telemetry.localTemperature=19.5;d.telemetry.heatingSetpoint=20;}",max:30},
     {id:'S7001',site:'7001',cat:'heating',text:'Rooms are cold',max:25},
     {id:'S7003',site:'7003',cat:'heating',text:'Bar is cold',max:25},
     {id:'S-none',site:'6832',cat:'heating',text:'The bar is freezing',setup:drop('heating'),max:6},
     {id:'BP6234',site:'6234',cat:'heating',text:'The pub is cold',max:40} ]
};
for(const k in out) fs.writeFileSync('roots-'+k+'.json',JSON.stringify(out[k],null,1));
