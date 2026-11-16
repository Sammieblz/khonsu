// Authentic cached assets; delayed transport and job responses are test controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3004',api=process.env.KHONSU_TEST_API||'http://localhost:8004';
const output=resolve('.cache/sky-motion');await mkdir(output,{recursive:true});
const examples=await(await fetch(api+'/v1/examples')).text();
const report=[];
for(const engine of [chromium,firefox]){
 const browser=await engine.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:output,size:{width:1280,height:720}}}),p=await context.newPage(),errors=[];
  p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  const requests=[];
  await p.route('**/v1/examples',async route=>{requests.push(Date.now());await new Promise(r=>setTimeout(r,2500));await route.fulfill({contentType:'application/json',body:examples}).catch(()=>{});});
  await p.goto(base);if(engine===chromium){const cdp=await context.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  await p.evaluate(()=>{document.addEventListener('click',()=>{window.__entryClicked=Date.now();},{capture:true,once:true});window.__entryObserver=new MutationObserver(()=>{const entry=document.querySelector('[data-sky-entry]');if(entry&&!window.__entryStart)window.__entryStart=Date.now();if(!entry&&window.__entryStart&&!window.__entryEnd)window.__entryEnd=Date.now();});window.__entryObserver.observe(document.body,{childList:true,subtree:true});});
  await p.locator('#explore-entry').getByRole('link',{name:'EXPLORE THE SKY',exact:true}).click();
  await p.waitForFunction(()=>window.__entryStart&&window.__entryEnd,null,{timeout:6000});
  const timing=await p.evaluate(()=>({click:window.__entryClicked,start:window.__entryStart,end:window.__entryEnd}));
  const afterClick=requests.find(time=>time>=timing.click)-timing.click;
  assert.ok(afterClick<timing.end-timing.click,'Request should start during, not after, the transition');
  assert.ok(timing.end-timing.start<1400,'Intro is bounded even with throttled CPU');
  const status=p.locator('[data-loading-stage]');await status.waitFor();const text=await status.getByRole('status').textContent();
  await p.screenshot({path:resolve(output,engine.name()+'-loading.png')});
  assert.match(text,/saved observations/);assert.equal(await status.locator('progress').getAttribute('value'),null);
  await p.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:60000});assert.equal(await status.count(),0);
  await p.unroute('**/v1/examples');
  await p.emulateMedia({reducedMotion:'reduce'});await p.goto(base);await p.locator('#explore-entry').getByRole('link',{name:'EXPLORE THE SKY',exact:true}).click();assert.equal(await p.locator('[data-sky-entry]').count(),0);
  await p.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible');
  // A fake in-flight transport tests real cancellation code without NASA work.
  let cancelled=0;const job={sequence_id:'motion-control',status:'retrieving',progress:.25,message:'Injected retrieval stage for browser acceptance',created_at:'2026-11-15T00:00:00Z',updated_at:'2026-11-15T00:00:00Z',error:null};
  await p.route('**/v1/sequences',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(job)}));
  await p.route('**/v1/sequences/motion-control',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(job)}));
  await p.route('**/v1/sequences/motion-control/cancel',r=>{cancelled++;return r.fulfill({contentType:'application/json',body:JSON.stringify({...job,status:'cancelled'})});});
  await p.goto(base+'/console/?ra_deg=12&dec_deg=-7&fov_arcmin=6');await p.getByRole('button',{name:'SEARCH THIS FIELD',exact:true}).click();
  await p.locator('[data-loading-stage="retrieving"]').waitFor();
  await p.locator('[data-loading-stage] button').filter({hasText:'CANCEL'}).click();await p.locator('[data-loading-stage="cancelled"]').waitFor();
  assert.equal(cancelled,1);await p.getByRole('button',{name:'TRY AGAIN',exact:true}).click();await p.locator('[data-loading-stage="retrieving"]').waitFor();
  await p.getByRole('link',{name:'Khonsu home',exact:true}).click();await p.waitForURL(base+'/');await p.waitForTimeout(300);assert.equal(cancelled,2);
  assert.deepEqual(errors,[]);await context.close();report.push({browser:engine.name(),version:browser.version(),requestDuringEntryMs:afterClick,throttle:engine===chromium?'4x CPU':'none',cancelled,errors});
 }finally{await browser.close();}
}
await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
