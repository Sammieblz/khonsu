// Replay genuine recorded Draconis frames through the real console and controls.
// This offline display acceptance does not claim a new archive query succeeded.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('fixtures/validation/r-draconis-gap'),evaluation=resolve(process.env.KHONSU_FILL_EVALUATION||'.cache/draconis-fill/evaluation');
const output=resolve(process.env.KHONSU_TEST_OUTPUT||'.cache/draconis-fill/browser');await mkdir(output,{recursive:true});
const source=JSON.parse(await readFile(root+'/source-manifest.json','utf8'));
const science=JSON.parse(await readFile(evaluation+'/science.json','utf8'));
const manifest={...source,sequence_id:'validation-r-draconis',data_mode:'cached-real',title:'Recorded R Draconis display validation',disclosure:'Genuine recorded observations replayed for display validation. Filled values are estimates, not measurements.',processing:{...source.processing,...science.policy},frames:[]},assets=new Map();
for(const f of source.frames){
 const stem=f.frame_id,prefix='/v1/examples/validation-r-draconis/frames/';
 for(const suffix of ['.bin','.png'])assets.set(stem+suffix,await readFile(root+'/'+stem+suffix));
 const fill=await readFile(evaluation+'/'+stem+'-fill.bin');assets.set(stem+'-fill.bin',fill);
 const record=science.frames.find(r=>r.frame===stem);
 manifest.frames.push({...f,image_url:prefix+stem+'.png',raster:{...f.raster,url:prefix+stem+'.bin'},refinement:null,
  gap_fill:{url:prefix+stem+'-fill.bin',encoding:'float32-le-estimate8-v1',size_bytes:fill.length,sha256:createHash('sha256').update(fill).digest('hex')},estimated_fraction:record.estimated_pixels/(source.grid.width_px*source.grid.height_px)});
}
const base=process.env.KHONSU_TEST_URL||'http://localhost:3000';
const button=(p,name)=>p.getByRole('button',{name,exact:true,includeHidden:true});
const ready=async p=>{await p.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible');await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
const engines=process.env.KHONSU_CHROMIUM_ONLY?[chromium]:[chromium,firefox],report={mode:'controlled replay of genuine recorded observations',browsers:[]};
for(const engine of engines){
 const b=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try{
  const p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/v1/examples',route=>route.fulfill({json:[manifest],headers:{'access-control-allow-origin':'*'}}));
  await p.route('**/v1/examples/validation-r-draconis/frames/*',route=>{const name=basename(new URL(route.request().url()).pathname);assert(assets.has(name));return route.fulfill({body:assets.get(name),contentType:name.endsWith('.png')?'image/png':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});});
  // Keep test notes local and never write to a visitor's notebook or production DB.
  await p.route('**/v1/notebook',route=>route.abort());
  await p.goto(base+'/console/?example=validation-r-draconis');await ready(p);
  await p.locator('summary').filter({hasText:'IMAGE DISPLAY'}).click();await p.getByLabel('Display resolution',{exact:true}).selectOption('hd');await ready(p);
  const checks=[];
  for(let frame=0;frame<2;frame++){
   if(frame){await button(p,'Next observation').click();await ready(p);}
   assert.equal(await button(p,'CLEAN VIEW').getAttribute('aria-pressed'),'true');
   assert.equal(await p.locator('[data-estimated-fill]').isVisible(),true);
   assert.doesNotMatch(await p.locator('[data-clean-view]').textContent(),/Larger gaps remain/);
   await p.evaluate(()=>{const c=document.querySelector('canvas');window.__dracoClean=c.getContext('2d').getImageData(0,0,c.width,c.height).data;});
   await p.locator('canvas').screenshot({path:`${output}/${engine.name()}-${frame+1}-filled.png`});
   if(frame===0)await p.screenshot({path:`${output}/${engine.name()}-console.png`});
   await button(p,'SHOW ORIGINAL').click();await ready(p);
   assert.equal(await p.locator('[data-estimated-fill]').count(),0);
   const quality=Array.from(assets.get(manifest.frames[frame].frame_id+'.bin').subarray(source.grid.width_px**2*4));
   const comparison=await p.evaluate(({quality,side})=>{
    const c=document.querySelector('canvas'),raw=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let changed=0,measuredChanged=0;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(raw[i]!==window.__dracoClean[i]||raw[i+1]!==window.__dracoClean[i+1]||raw[i+2]!==window.__dracoClean[i+2]){changed++;if(quality[Math.floor((y+.5)*side/c.height)*side+Math.floor((x+.5)*side/c.width)]===1)measuredChanged++;}}
    const center=(Math.floor(c.height/2)*c.width+Math.floor(c.width/2))*4;
    return {changed,measuredChanged,originalCenter:Array.from(raw.slice(center,center+3)),filledCenter:Array.from(window.__dracoClean.slice(center,center+3))};
   },{quality,side:source.grid.width_px});
   assert(comparison.changed>1000);assert.equal(comparison.measuredChanged,0);assert.deepEqual(comparison.originalCenter,[7,11,18]);assert(comparison.filledCenter[0]>180);
   await p.locator('canvas').screenshot({path:`${output}/${engine.name()}-${frame+1}-original.png`});
   await button(p,'SHOW ORIGINAL').click();await ready(p);
   await button(p,'SHOW ESTIMATED AREAS').click();await ready(p);assert.match(await p.locator('[data-clean-view]').textContent(),/Amber stripes/);
   const stripes=await p.locator('canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]===243&&d[i+1]===188&&d[i+2]===96)n++;return n;});assert(stripes>100);
   await p.locator('canvas').screenshot({path:`${output}/${engine.name()}-${frame+1}-estimates.png`});
   await button(p,'SHOW ESTIMATED AREAS').click();await ready(p);
   const gpuMode=await p.locator('[data-renderer]').getAttribute('data-renderer');assert.equal(gpuMode,'WebGL2');
   await p.getByLabel('Rendering mode',{exact:true}).selectOption('cpu');await p.waitForFunction(()=>document.querySelector('[data-renderer]')?.getAttribute('data-renderer')?.startsWith('CPU'));await ready(p);
   const maximumDifference=await p.locator('canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let m=0;for(let i=0;i<d.length;i++)m=Math.max(m,Math.abs(d[i]-window.__dracoClean[i]));return m;});assert(maximumDifference<=1);
   await p.getByLabel('Rendering mode',{exact:true}).selectOption('auto');await ready(p);
   checks.push({frame:manifest.frames[frame].observation_id,...comparison,stripes,maximumDifference,gpuMode});
  }
  await p.setViewportSize({width:390,height:844});await ready(p);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await p.locator('[data-estimated-fill]').isVisible(),true);
  await p.setViewportSize({width:1440,height:1000});await ready(p);
  await button(p,'MARK').click();await ready(p);assert.equal(await button(p,'CLEAN VIEW').isDisabled(),true);
  assert.equal(await p.locator('[data-estimated-fill]').count(),0);
  const canvas=p.locator('canvas'),box=await canvas.boundingBox();await canvas.click({position:{x:box.width/2,y:box.height/2}});
  await p.getByLabel('Observation note',{exact:true}).fill('Display validation only, not a discovery.');await button(p,'SAVE CANDIDATE NOTE').click();
  const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('khonsu.candidates.v2')));assert.equal(stored.candidates[0].selection.pixelHasData,false);
  const downloadEvent=p.waitForEvent('download');await p.getByRole('button',{name:/^EXPORT ALL SAVED CANDIDATES/}).click();const download=await downloadEvent;
  const evidence=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(evidence.candidates[0].position.pixel_has_data,false);
  assert.notEqual(evidence.candidates[0].position.pixel_quality,'strict-valid');assert.deepEqual(errors,[]);
  report.browsers.push({browser:engine.name(),version:b.version(),checks,markShowsOriginal:true,exportRejectsEstimatedMeasurement:true,pageErrors:errors});
  console.log(engine.name()+': Draconis fill accepted');
 }finally{await b.close();}
}
await writeFile(output+'/browser.json',JSON.stringify(report,null,2)+'\n');
