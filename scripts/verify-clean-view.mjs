// Real cached images, estimated-area disclosure, original comparison and evidence.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {browserDisplayModules} from './browser-display-modules.mjs';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3003',api=process.env.KHONSU_TEST_API||'http://localhost:8003';
const output=resolve(process.env.KHONSU_TEST_OUTPUT||'.cache/clean-view/browser');await mkdir(output,{recursive:true});
const examples=await(await fetch(api+'/v1/examples')).json(),primary=examples[0];
const modules=await browserDisplayModules(),folder=new URL('../apps/web/out/__clean/',import.meta.url);
await mkdir(folder,{recursive:true});for(const [name,source] of Object.entries(modules))await writeFile(new URL(name,folder),source);
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const ready=async page=>{await page.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:60000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
const load=async page=>{await page.goto(base);await button(page,'LOAD CACHED REAL EXAMPLE').click();await ready(page);};
const advanced=async page=>{const summary=page.locator('summary').filter({hasText:'IMAGE DISPLAY'});if(!await summary.evaluate(e=>e.parentElement.open))await summary.click();};
const report={testedAt:new Date().toISOString(),browsers:[]};
try{
 for(const engine of [chromium,firefox]){
  const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await load(page);await advanced(page);await page.getByLabel('Display resolution',{exact:true}).selectOption('hd');await ready(page);
   assert.equal(await button(page,'CLEAN VIEW').getAttribute('aria-pressed'),'true');
   assert.match(await page.locator('[data-clean-view]').textContent(),/Some missing areas are estimated/);
   const canvas=page.locator('canvas');
   await page.evaluate(()=>{const c=document.querySelector('canvas');window.__cleanPixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;});
   await canvas.screenshot({path:`${output}/${engine.name()}-clean.png`});
   await button(page,'SHOW ORIGINAL').click();await ready(page);
   const comparison=await page.evaluate(async({api,primary})=>{
    const c=document.querySelector('canvas'),original=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    const side=primary.grid.width_px,bytes=await(await fetch(api+primary.frames[0].raster.url)).arrayBuffer(),quality=new Uint8Array(bytes,side*side*4);
    let changed=0,measuredChanged=0;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
     const i=(y*c.width+x)*4,q=quality[Math.floor((y+.5)*side/c.height)*side+Math.floor((x+.5)*side/c.width)];
     if(original[i]!==window.__cleanPixels[i]||original[i+1]!==window.__cleanPixels[i+1]){changed++;if(q===1)measuredChanged++;}
    }
    return {changedDisplayPixels:changed,measuredDisplayPixelsChanged:measuredChanged};
   },{api,primary});
   assert(comparison.changedDisplayPixels>100);assert.equal(comparison.measuredDisplayPixelsChanged,0);
   await canvas.screenshot({path:`${output}/${engine.name()}-original.png`});
   await button(page,'SHOW ORIGINAL').click();await ready(page);
   await button(page,'SHOW ESTIMATED AREAS').click();await ready(page);
   assert.match(await page.locator('[data-clean-view]').textContent(),/Amber stripes/);
   const highlighted=await canvas.evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<p.length;i+=4)if(p[i]===243&&p[i+1]===188&&p[i+2]===96)count++;return count;});assert(highlighted>10);
   await button(page,'SHOW ESTIMATED AREAS').click();await ready(page);
   const stamp=await page.locator('#observation-index').getAttribute('aria-valuetext');
   await page.locator('#observation-index').fill('1000');await ready(page);
   assert.notEqual(await page.locator('#observation-index').getAttribute('aria-valuetext'),stamp);
   assert.equal(await page.locator('[data-clean-view]').getAttribute('data-clean-view'),'on');
   await page.locator('#observation-index').fill('0');await ready(page);
   const raw=new Uint8Array(await(await fetch(api+primary.frames[0].gap_fill.url)).arrayBuffer()),side=primary.grid.width_px,mask=raw.subarray(side*side*4);
   const selected=mask.findIndex((q,i)=>q===1&&i%side>side*.25&&i%side<side*.75&&Math.floor(i/side)>side*.25&&Math.floor(i/side)<side*.75);assert(selected>=0);
   await button(page,'MARK').click();await ready(page);
   assert.equal(await page.locator('[data-clean-view]').getAttribute('data-clean-view'),'off');
   assert.equal(await button(page,'CLEAN VIEW').isDisabled(),true);
   const box=await canvas.boundingBox();
   await canvas.click({position:{x:(selected%side+.5)*box.width/side,y:(Math.floor(selected/side)+.5)*box.height/side}});
   await page.getByLabel('Observation note',{exact:true}).fill('Clean View acceptance control, not a discovery.');
   await button(page,'SAVE CANDIDATE NOTE').click();
   const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('khonsu.candidates.v2')));
   assert.equal(stored.candidates[0].selection.x,selected%side);
   assert.equal(stored.candidates[0].selection.y,Math.floor(selected/side));
   assert.equal(stored.candidates[0].selection.pixelHasData,false,JSON.stringify({expected:{x:selected%side,y:Math.floor(selected/side)},actual:stored.candidates[0].selection}));
   assert.notEqual(stored.candidates[0].selection.pixelQuality,'strict-valid');
   const downloadEvent=page.waitForEvent('download');
   await page.getByRole('button',{name:/^EXPORT ALL SAVED CANDIDATES/}).click();
   const download=await downloadEvent,evidence=JSON.parse(await readFile(await download.path(),'utf8'));
   assert.equal(evidence.candidates[0].position.pixel_has_data,false);
   assert.notEqual(evidence.candidates[0].position.pixel_quality,'strict-valid');
   await button(page,'REWIND').click();await ready(page);
   await button(page,'CLEAN VIEW').focus();await page.keyboard.press('Space');await ready(page);
   assert.equal(await page.locator('[data-clean-view]').getAttribute('data-clean-view'),'off');
   await load(page);assert.equal(await button(page,'CLEAN VIEW').getAttribute('aria-pressed'),'false');
   await button(page,'CLEAN VIEW').click();await ready(page);
   await page.setViewportSize({width:390,height:844});await ready(page);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(process.env.AXE_CORE_PATH){await page.addScriptTag({path:process.env.AXE_CORE_PATH});const violations=await page.evaluate(async()=>{const result=await window.axe.run('[aria-label="Sky image viewer"]',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[]);}
   await page.getByRole('group',{name:'Clean view controls',exact:true}).screenshot({path:`${output}/${engine.name()}-controls-mobile.png`});
   await advanced(page);await page.getByLabel('Rendering mode',{exact:true}).selectOption('cpu');await ready(page);
   assert.equal(await page.locator('[data-renderer]').textContent(),'CPU worker');
   assert.equal(await page.locator('[data-clean-view]').getAttribute('data-clean-view'),'on');
   const parity=await page.evaluate(async({api,examples})=>{
    const {DisplayRenderer}=await import('/__clean/displayRenderer.js'),{decodeRaster,attachGapFill,renderPixels}=await import('/__clean/display.js');
    const gpu=new DisplayRenderer(()=>{}),cpu=new DisplayRenderer(()=>{},true),canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
    let maximum=0,checks=0;
    try{
     for(const example of examples)for(const frame of example.frames){
      const read=async meta=>decodeRaster(await(await fetch(api+meta.url)).arrayBuffer(),example.grid.width_px,example.grid.height_px,meta.encoding);
      const raster=attachGapFill(await read(frame.raster),await read(frame.gap_fill),frame.estimated_fraction);
      for(const sampling of ['pixels','smooth'])for(const includeWarnings of [false,true])for(const cleanView of [false,true])for(const showEstimates of [false,true]){
       const options={low:example.display.vmin,high:example.display.vmax,a:.3,gamma:1,curve:'asinh',mask:'subtle',sampling,includeWarnings,cleanView,showEstimates,detail:.35},size={width:237,height:163};
       canvas.width=size.width;canvas.height=size.height;const expected=renderPixels(raster,options,size);
       for(const renderer of [gpu,cpu]){const image=await renderer.render(raster,options,size);if(image instanceof ImageData)context.putImageData(image,0,0);else context.drawImage(image,0,0);if(image instanceof ImageBitmap)image.close();const got=context.getImageData(0,0,size.width,size.height).data;for(let i=0;i<got.length;i++)maximum=Math.max(maximum,Math.abs(got[i]-expected[i]));checks++;}
      }
     }
     return {maximumByteDifference:maximum,checks,gpuMode:gpu.mode,adapter:gpu.adapter};
    }finally{gpu.dispose();cpu.dispose();}
   },{api,examples});
   assert.equal(parity.gpuMode,'WebGL2');assert(parity.maximumByteDifference<=1);
   const failed=await browser.newPage();await failed.route('**/*-fill.bin',route=>route.abort());await load(failed);
   assert.match(await failed.locator('[data-clean-view]').textContent(),/could not load/);
   assert.equal(await failed.locator('[data-clean-view]').getAttribute('data-clean-view'),'off');await failed.close();
   const legacy=await browser.newPage();await legacy.route('**/v1/examples',route=>route.fulfill({json:examples.map(e=>({...e,frames:e.frames.map(f=>({...f,gap_fill:null,estimated_fraction:0}))}))}));await load(legacy);
   assert.equal(await button(legacy,'CLEAN VIEW').isDisabled(),true);await legacy.close();
   const blocked=await browser.newPage();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('Blocked storage test');}}));await load(blocked);
   assert.equal(await button(blocked,'CLEAN VIEW').getAttribute('aria-pressed'),'true');
   await button(blocked,'CLEAN VIEW').click();await ready(blocked);assert.equal(await button(blocked,'CLEAN VIEW').getAttribute('aria-pressed'),'false');await blocked.close();
   assert.deepEqual(errors,[]);
   report.browsers.push({browser:engine.name(),version:browser.version(),...comparison,...parity,markUsesOriginal:true,estimatedMarkExcluded:true,exportExcludesEstimate:true,preferencePersists:true,blockedStorageUsable:true,realDateStepping:true,mobileNoOverflow:true,keyboardToggle:true,failedFillFallsBack:true,legacyCompatible:true});
   console.log(engine.name()+': Clean View passed');
  }finally{await browser.close();}
 }
 await writeFile(`${output}/browser.json`,JSON.stringify(report,null,2)+'\n');
}finally{for(const name of Object.keys(modules))await unlink(new URL(name,folder));await rmdir(folder);}
