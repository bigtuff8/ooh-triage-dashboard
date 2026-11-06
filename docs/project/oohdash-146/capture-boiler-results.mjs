import { newPage, confirm } from './lib.mjs';
import fs from 'fs';
const { browser, page } = await newPage();
const out = {};
for (const [name, path] of [['on', ['Bar/Restaurant','Too cold / not working','Turn heating on','2 hours','Change it anyway']], ['off', ['Bar/Restaurant','Too hot / wants it off','Turn heating off','Until 07:00','Change it anyway']]]) {
await confirm(page, '9001');
await page.evaluate(()=>{const now=Date.now();state.workspace.boilerControl=Object.assign({},state.workspace.boilerControl,{heating:{visible:true,mode:'auto',panelLastSeenMs:now-60000,zones:[{n:1,on:true,roomTemp:17.5,target:20,hold:null},{n:2,on:false,roomTemp:19,target:20,hold:null}],demand:true}});state.workspace.boostAvailable={on:true,off:true};state.workspace.activeBoostHolds=[];state.smartEntryText='The pub is cold';startTileFlow('heating');});
for (const t of path) { await page.evaluate((t)=>{[...document.querySelectorAll('[data-testid=flow-panel] button')].find(b=>b.innerText.trim()===t).click();},t); await page.waitForTimeout(500); }
for (let i=0;i<20;i++){ await page.waitForTimeout(1500); const t=await page.evaluate(()=>document.querySelector('[data-testid=flow-panel]').innerText); if(!/Sending/.test(t)) { out[name]={text:t,grid:await page.evaluate(()=>document.querySelector('.wsgrid').innerHTML)}; console.log(name,'->',t.split('\n').filter(x=>x.trim()).slice(6,20).join(' | ').slice(0,600)); break;} if(i==19) console.log(name,'still sending'); }
}
fs.writeFileSync('bp-done.json',JSON.stringify(out));
await browser.close();
