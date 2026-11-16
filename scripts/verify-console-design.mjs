// Real cached observations; transport faults below are explicitly injected controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3004';
const output=resolve(process.env.KHONSU_TEST_OUTPUT||'.cache/console-design');await mkdir(output,{recursive:true});
const ready=async p=>{await p.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:60000});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const tab=(p,name)=>p.getByRole('tab',{name,exact:true}).click();
const report={testedAt:new Date().toISOString(),browsers:[]};
for(const engine of [chromium,firefox]){
 const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  const p=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'}),errors=[],archive=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/v1/sequences'))archive.push(r.url());});
  await p.goto(base+'/console/?example=real-wise-0855');await ready(p);
  assert.equal(archive.length,0);assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight),768);
  const canvas=p.locator('canvas').first(),fit=await canvas.boundingBox();assert.ok(Math.abs(fit.width/fit.height-1)<.002);
  await p.screenshot({path:resolve(output,engine.name()+'-console.png')});
  await button(p,'FILL').click();await ready(p);const fill=await canvas.boundingBox();assert.ok(fill.width>fit.width);
  await button(p,'FIT').click();await ready(p);assert.ok(Math.abs((await canvas.boundingBox()).width-fit.width)<1);
  await button(p,'Next observation').click();await ready(p);const time=await p.locator('#observation-index').getAttribute('aria-valuetext');
  await button(p,'MARK').click();await ready(p);await canvas.click();
  await button(p,'PAN').click();await button(p,'Zoom in').click();await ready(p);
  const view=await canvas.getAttribute('style');
  await tab(p,'NOTES');await p.getByLabel('Observation note',{exact:true}).fill('Unsaved navigation acceptance note.');
  await p.getByRole('link',{name:'Khonsu home',exact:true}).click();
  await p.getByRole('link',{name:'RETURN TO OBSERVATORY',exact:true}).click();await ready(p);
  assert.equal(await p.locator('#observation-index').getAttribute('aria-valuetext'),time);
  assert.equal(await p.getByLabel('Observation note',{exact:true}).inputValue(),'Unsaved navigation acceptance note.');
  assert.equal(await canvas.getAttribute('style'),view);
  await button(p,'FIT').click();await button(p,'MARK').click();await ready(p);
  const rect=await canvas.boundingBox();await canvas.click({position:{x:rect.width*.5,y:rect.height*.5}});
  await button(p,'SAVE CANDIDATE NOTE').click();
  const records=await p.evaluate(()=>JSON.parse(localStorage.getItem('khonsu.candidates.v2')));assert.equal(records.candidates.length,1);
  const downloadPromise=p.waitForEvent('download');await p.getByRole('button',{name:/^EXPORT ALL SAVED CANDIDATES/}).click();
  const download=await downloadPromise,evidence=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(evidence.candidates.length,1);
  await button(p,'PAN').click();await tab(p,'DISPLAY');assert.equal(await button(p,'CLEAN VIEW').getAttribute('aria-pressed'),'true');
  await button(p,'SHOW ORIGINAL').click();await ready(p);assert.equal(await button(p,'SHOW ORIGINAL').getAttribute('aria-pressed'),'true');
  await button(p,'SHOW ORIGINAL').click();await ready(p);
  await button(p,'SHARE').click();await p.getByRole('dialog').waitFor();await p.keyboard.press('Escape');assert.equal(await button(p,'SHARE').evaluate(e=>e===document.activeElement),true);
  await p.setViewportSize({width:1920,height:1080});await ready(p);assert.equal(await p.evaluate(()=>document.documentElement.scrollHeight),1080);
  await p.setViewportSize({width:390,height:844});await ready(p);
  if(await button(p,'Close controls').isVisible())await button(p,'Close controls').click();
  await button(p,'CONTROLS').click();await tab(p,'LAYERS');
  assert.equal(await button(p,'Next observation').isVisible(),true);await button(p,'Next observation').click();await ready(p);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await p.screenshot({path:resolve(output,engine.name()+'-mobile.png')});
  await p.keyboard.press('Escape');await button(p,'CONTROLS').waitFor();
  // A 200% desktop zoom is represented by its 683 x 384 CSS viewport.
  await p.setViewportSize({width:683,height:384});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await button(p,'CONTROLS').click();await tab(p,'FIELD');await p.locator('#ra').fill('12');await p.locator('#dec').fill('-7');
  await button(p,'Close controls').click();
  await p.goto(base+'/?ra_deg=12&dec_deg=-7&fov_arcmin=6&embed=1');await p.waitForURL('**/console/**');await p.locator('[data-embed="true"]').waitFor();
  await button(p,'CONTROLS').click();await tab(p,'FIELD');
  assert.equal(await p.locator('#ra').inputValue(),'12');assert.equal(archive.length,0);
  await p.setViewportSize({width:1366,height:768});
  await p.goto(base+'/console/?example=not-an-example');await p.getByText(/selected cached example is no longer available/).first().waitFor();assert.equal(await canvas.count(),0);
  await p.route('**/v1/examples',route=>route.abort());await p.goto(base+'/console/?example=real-wise-0855');await p.getByRole('alert').first().waitFor();await p.unroute('**/v1/examples');
  await p.goto(base+'/console/?example=real-wise-0855');await ready(p);
  const axePath=process.env.AXE_SCRIPT;if(axePath){await p.addScriptTag({path:axePath});const audit=await p.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
  assert.deepEqual(errors,[]);report.browsers.push({browser:engine.name(),version:browser.version(),fit,fill,navigation:'frame, zoom and draft preserved',candidate:'original-grid record and export passed',responsive:'1366,1920,390 and 200% CSS viewport',failures:'missing example and offline service',errors});
 }finally{await browser.close();}
}
await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
