import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(resolve('../../.cache/browser-tools/node_modules/playwright'));
const dir=resolve('public/captures');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const tab=(p,name)=>p.getByRole('tab',{name,exact:true}).click();
const ready=p=>p.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:60000});
const pause=p=>p.waitForTimeout(1500);
const clips=JSON.parse(await readFile('captures.json','utf8').catch(()=>'{}'));
async function capture(id,action,home=false){
 if(clips[id])return;
 const context=await browser.newContext({viewport:{width:1600,height:900},recordVideo:{dir:resolve('../../.cache/video-raw'),size:{width:1600,height:900}}});
 const p=await context.newPage(),began=Date.now();p.setDefaultTimeout(15000);p.on('dialog',d=>d.accept());
 try{
 await p.goto('http://localhost:3000/'+(home?'':'console/?example=real-wise-0855'));
 if(!home)await ready(p);else await p.waitForFunction(()=>localStorage.getItem('khonsu.notebook.v1'));
 await p.evaluate(()=>document.fonts.ready);await pause(p);
 const from=(Date.now()-began)/1000;
 await pause(p);await action(p);await pause(p);
 await p.screenshot({path:resolve(dir,id+'.png')});
 const duration=(Date.now()-began)/1000-from;
 const video=p.video();await context.close();await video.saveAs(resolve(dir,id+'.webm'));
 clips[id]={from,duration};await writeFile(resolve('captures.json'),JSON.stringify(clips,null,2));console.log(id,duration.toFixed(2));
 }catch(e){await p.screenshot({path:resolve(dir,id+'-failure.png')}).catch(()=>{});await context.close();throw e;}
}
try{
 await capture('entry',async p=>{await p.locator('#explore-entry').getByRole('link',{name:'EXPLORE THE SKY',exact:true}).click();await ready(p);await p.waitForTimeout(3500);},true);
 await capture('field',async p=>{await tab(p,'FIELD');await pause(p);await p.locator('#ra').fill('133.7601213914074');await p.locator('#dec').fill('-7.242127941212259');await pause(p);});
 await capture('time',async p=>{await button(p,'Next observation').click();await ready(p);await pause(p);await button(p,'Next observation').click();await ready(p);await pause(p);await p.locator('#observation-index').press('Home');await ready(p);await button(p,'Play observations').click();await p.waitForTimeout(3000);if(await button(p,'Pause observations').isVisible())await button(p,'Pause observations').click();});
 await capture('navigate',async p=>{await button(p,'FILL').click();await ready(p);await pause(p);await button(p,'FIT').click();await button(p,'PAN').click();await button(p,'Zoom in').click();await ready(p);await pause(p);await button(p,'FIT').click();});
 await capture('compare',async p=>{await tab(p,'COMPARE');await pause(p);await button(p,'BLINK A/B').click();await p.waitForTimeout(3500);const stop=p.getByRole('button',{name:/STOP BLINK|PAUSE BLINK/i});if(await stop.count())await stop.first().click();});
 await capture('display',async p=>{await tab(p,'DISPLAY');await pause(p);await button(p,'SHOW ORIGINAL').click();await ready(p);await pause(p);await button(p,'SHOW ORIGINAL').click();await ready(p);});
 await capture('quality',async p=>{await tab(p,'LAYERS');await p.getByLabel('Quality overlay',{exact:true}).check();await pause(p);await button(p,'INSPECT').click();await p.locator('canvas').first().click();await pause(p);await tab(p,'INFO');});
 await capture('context',async p=>{await tab(p,'LAYERS');await pause(p);});
 await capture('notes',async p=>{await tab(p,'NOTES');await p.getByLabel('Observation note',{exact:true}).fill('Compare the actual dates and quality flags before interpreting this field.');await pause(p);await button(p,'SAVE OBSERVATION NOTE').click();await pause(p);await p.locator('[data-observation-note]').first().scrollIntoViewIfNeeded();});
 await capture('candidate',async p=>{await button(p,'MARK').click();await ready(p);await p.locator('canvas').first().click({position:{x:300,y:240}});await tab(p,'NOTES');await p.getByLabel('Observation note',{exact:true}).fill('Example candidate note for this walkthrough. Check other epochs; no discovery claimed.');await pause(p);await button(p,'SAVE CANDIDATE NOTE').click();await pause(p);const exported=p.waitForEvent('download');await p.getByRole('button',{name:/^EXPORT ALL SAVED CANDIDATES/}).click();await (await exported).saveAs(resolve(dir,'demo-evidence.json'));});
 await capture('share',async p=>{await button(p,'SHARE').click();await pause(p);await p.keyboard.press('Escape');await button(p,'GUIDED MODE').click();await pause(p);await button(p,'NEXT STEP').click();await pause(p);await p.keyboard.press('Escape');await p.goto('http://localhost:3000/docs/');await pause(p);});
}finally{await browser.close();}
