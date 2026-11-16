// Real cached images; explicit transport faults test notebook recovery only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3004',out=resolve(process.env.KHONSU_TEST_OUTPUT||'.cache/guided-notebook');await mkdir(out,{recursive:true});
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const ready=p=>p.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:60000});
const saved=p=>p.locator('[data-notebook-state="saved"]').waitFor();
const put=p=>p.waitForResponse(r=>r.url().endsWith('/v1/notebook')&&r.request().method()==='PUT'&&r.ok());
const notes=p=>p.getByRole('tab',{name:'NOTES',exact:true}).click();
async function create(p,text){await p.getByLabel('Observation note',{exact:true}).fill(text);const response=put(p);await button(p,'SAVE OBSERVATION NOTE').click();await response;await saved(p);}
const report=[];
for(const engine of [chromium,firefox]){
 const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:768}}),p=await context.newPage(),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(base);const started=Date.now();await p.locator('#explore-entry').getByRole('link',{name:'EXPLORE THE SKY',exact:true}).click();
  await p.locator('[data-sky-entry]').waitFor();await p.waitForTimeout(900);assert.equal(await p.locator('[data-sky-entry]').isVisible(),true);
  await p.screenshot({path:resolve(out,engine.name()+'-entry.png')});
  await p.locator('[data-sky-entry]').waitFor({state:'hidden',timeout:7000});const entryMs=Date.now()-started;assert.ok(entryMs>=2800&&entryMs<7000,`entry took ${entryMs} ms`);await ready(p);
  assert.equal(await p.locator('[data-khonsu-guardian]').count(),0);
  await notes(p);await create(p,'Browser acceptance note: compare the real dates before interpreting changes.');
  const note=p.locator('[data-observation-note]').first();assert.equal(await note.count(),1);
  await button(p,'Edit observation note 1').click();await p.getByRole('textbox',{name:'Edit observation note 1',exact:true}).fill('Edited acceptance note, with original observation context.');
  const edited=put(p);await button(p,'SAVE CHANGES').click();await edited;await saved(p);
  await p.reload();await ready(p);await notes(p);await note.getByText('Edited acceptance note, with original observation context.',{exact:true}).waitFor();
  const download=p.waitForEvent('download');await button(p,'EXPORT NOTEBOOK (1)').click();const file=await download,exported=JSON.parse(await readFile(await file.path(),'utf8'));
  assert.equal(exported.notes.length,1);assert.equal(exported.notes[0].sequence.sequence_id,'real-wise-0855');assert.equal(exported.notes[0].frame_id,'frame-0001');assert.equal(exported.candidate_evidence.candidates.length,0);assert.equal('key'in exported,false);
  await p.screenshot({path:resolve(out,engine.name()+'-notes.png')});
  const deleted=put(p);await button(p,'Delete observation note 1').click();await deleted;await p.reload();await ready(p);await notes(p);assert.equal(await p.locator('[data-observation-note]').count(),0);
  await p.route('**/v1/notebook',r=>r.abort());await p.getByLabel('Observation note',{exact:true}).fill('Offline acceptance note retained locally.');await button(p,'SAVE OBSERVATION NOTE').click();await p.locator('[data-notebook-state="offline"]').waitFor();
  await p.reload();await ready(p);await notes(p);await p.getByText('Offline acceptance note retained locally.',{exact:true}).waitFor();
  await p.unroute('**/v1/notebook');const recovered=put(p);await button(p,'RETRY NOTEBOOK SAVE').click();await recovered;await saved(p);
  const other=await p.context().newPage();other.on('dialog',d=>d.accept());await other.goto(base+'/console/?example=real-wise-0855');await ready(other);await notes(other);await create(other,'Second tab saved this note.');
  await p.getByLabel('Observation note',{exact:true}).fill('First tab has a newer unsaved idea.');await button(p,'SAVE OBSERVATION NOTE').click();await p.locator('[data-notebook-state="conflict"]').waitFor();await p.getByText('First tab has a newer unsaved idea.',{exact:true}).waitFor();
  await button(p,'LOAD DATABASE COPY').click();await saved(p);await p.getByText('Second tab saved this note.',{exact:true}).waitFor();assert.equal(await p.getByText('First tab has a newer unsaved idea.',{exact:true}).count(),0);await other.close();
  const dial=p.locator('[data-time-dial]'),box=await dial.boundingBox(),x=v=>box.x+(16+568*v)/600*box.width;
  await p.mouse.move(x(.5),box.y+22);await p.mouse.down();await p.mouse.move(x(.62),box.y+22,{steps:5});
  assert.ok(Math.abs(Number(await dial.locator('[data-position]').getAttribute('data-position'))-.62)<.02);await p.mouse.up();
  await p.waitForFunction(()=>Math.abs(Number(document.querySelector('[data-time-dial] [data-position]')?.getAttribute('data-position'))-1)<.001);await ready(p);
  await p.locator('#observation-index').press('Home');await ready(p);assert.match(await p.locator('#observation-index').getAttribute('aria-valuetext'),/07 Nov 2025/);
  await button(p,'GUIDED MODE').click();await p.locator('[data-guided-mode]').waitFor();
  for(let i=0;i<6;i++)await button(p,'NEXT STEP').click();await p.getByRole('link',{name:'OPEN THE COMPLETE GUIDE'}).waitFor();await p.screenshot({path:resolve(out,engine.name()+'-tour.png')});await p.keyboard.press('Escape');await p.locator('[data-guided-mode]').waitFor({state:'hidden'});
  assert.equal(await button(p,'GUIDED MODE').evaluate(e=>e===document.activeElement),true);
  await p.setViewportSize({width:390,height:844});await ready(p);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  if(await button(p,'Close controls').isVisible())await button(p,'Close controls').click();await button(p,'GUIDED MODE').click();await button(p,'NEXT STEP').click();await button(p,'Minimize tour instructions').click();await p.screenshot({path:resolve(out,engine.name()+'-mobile-tour.png')});
  for(let i=0;i<3;i++)await button(p,'NEXT STEP').click();await p.getByLabel('Observation note',{exact:true}).click();await p.getByLabel('Observation note',{exact:true}).fill('Mobile guided-mode draft.');await p.screenshot({path:resolve(out,engine.name()+'-mobile-guided-notes.png')});await button(p,'Exit guided mode').click();
  await p.goto(base+'/docs/');assert.equal(await p.locator('main section').count(),12);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const axe=process.env.AXE_SCRIPT;if(axe){await p.addScriptTag({path:axe});const audit=await p.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
  await p.setViewportSize({width:1366,height:768});await p.goto(base);await p.locator('#explore-entry').getByRole('link',{name:'EXPLORE THE SKY',exact:true}).click();await p.locator('[data-sky-entry]').waitFor();
  // Measure event-to-dismissal in the page, excluding automation transport latency.
  await p.locator('[data-sky-entry]').evaluate(entry=>{window.__skipMs=null;const skip=[...entry.querySelectorAll('button')].find(b=>b.textContent==='SKIP INTRO');skip.addEventListener('click',()=>{const started=performance.now();const check=()=>{if(!entry.isConnected||getComputedStyle(entry).display==='none'){window.__skipMs=performance.now()-started;observer.disconnect();}};const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true,attributes:true});requestAnimationFrame(check);},{once:true});});
  await button(p,'SKIP INTRO').click();await p.waitForFunction(()=>typeof window.__skipMs==='number');const skipMs=await p.evaluate(()=>window.__skipMs);assert.ok(skipMs<1000,`Skip took ${skipMs} ms after the click`);await ready(p);
  await p.emulateMedia({reducedMotion:'reduce'});await p.goto(base);await p.locator('#explore-entry').getByRole('link',{name:'EXPLORE THE SKY',exact:true}).click();await ready(p);assert.equal(await p.locator('[data-sky-entry]').count(),0);assert.equal(await p.locator('[data-khonsu-guardian]').count(),0);
  await button(p,'MARK').click();await ready(p);await p.locator('canvas').first().click();await notes(p);await p.getByLabel('Observation note',{exact:true}).fill('Migration acceptance candidate.');const marked=put(p);await button(p,'SAVE CANDIDATE NOTE').click();await marked;
  const legacy=await p.evaluate(()=>localStorage.getItem('khonsu.candidates.v2'));
  const migratedContext=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await migratedContext.addInitScript(raw=>{if(!localStorage.getItem('khonsu.candidates.v2'))localStorage.setItem('khonsu.candidates.v2',raw);},legacy);
  const migrated=await migratedContext.newPage();await migrated.goto(base+'/console/?example=real-wise-0855');await ready(migrated);await notes(migrated);await saved(migrated);await migrated.getByText('Migration acceptance candidate.',{exact:true}).waitFor();assert.equal(await migrated.evaluate(()=>JSON.parse(localStorage.getItem('khonsu.notebook.v1')).document.candidate_snapshot),legacy);await migratedContext.close();
  const blockedContext=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await blockedContext.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Blocked for acceptance','SecurityError');};});
  const blocked=await blockedContext.newPage();let uploads=0;blocked.on('request',r=>{if(r.method()==='PUT'&&r.url().endsWith('/v1/notebook'))uploads++;});await blocked.goto(base+'/console/');await notes(blocked);await blocked.getByLabel('Observation note',{exact:true}).fill('Memory-only note.');await button(blocked,'SAVE OBSERVATION NOTE').click();await blocked.getByText('Memory-only note.',{exact:true}).waitFor();assert.equal(uploads,0);await blocked.locator('[data-notebook-state="local-only"]').waitFor();await blockedContext.close();
  const brokenContext=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await brokenContext.addInitScript(()=>localStorage.setItem('khonsu.notebook.v1','{broken'));
  const broken=await brokenContext.newPage();await broken.goto(base+'/console/');await notes(broken);await button(broken,'DOWNLOAD SAVED DATA').waitFor();assert.equal(await broken.evaluate(()=>localStorage.getItem('khonsu.notebook.v1')),'{broken');await brokenContext.close();
  assert.deepEqual(errors,[]);report.push({browser:engine.name(),version:browser.version(),entryMs,skipMs,notes:'create, edit, export, delete, reload, offline recovery, tab conflict, legacy migration, blocked storage and damaged backup preservation passed',dial:'pointer follows continuous drag; release snaps to real date; keyboard immediate',tour:'seven steps, focus return, minimize, mobile controls and documentation passed',errors});
 }finally{await browser.close();}
}
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
