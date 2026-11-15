// Production viewer + real CPython derivatives, with separate transport-failure controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {browserDisplayModules} from './browser-display-modules.mjs';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3003',api=process.env.KHONSU_TEST_API||'http://localhost:8003';
const output=resolve(process.env.KHONSU_TEST_OUTPUT||'.cache/refinement/browser');await mkdir(output,{recursive:true});
const examples=await(await fetch(api+'/v1/examples')).json();
const modules=await browserDisplayModules(),folder=new URL('../apps/web/out/__refinement/',import.meta.url);
await mkdir(folder,{recursive:true});for(const [name,source] of Object.entries(modules))await writeFile(new URL(name,folder),source);
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const ready=async page=>{await page.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:60000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
const load=async page=>{await page.goto(base);await page.getByLabel('Cached real field',{exact:true}).selectOption('real-wise-0855');await button(page,'LOAD CACHED REAL EXAMPLE').click();await ready(page);};
const advanced=async page=>{const summary=page.locator('summary').filter({hasText:'IMAGE DISPLAY'});if(!await summary.evaluate(e=>e.parentElement.open))await summary.click();};
const capture=async(page,key)=>{await ready(page);return page.evaluate(key=>{const c=document.querySelector('canvas');window[key]=c.getContext('2d').getImageData(0,0,c.width,c.height).data;},key);};
const difference=async(page,key,skipCursor=false)=>page.evaluate(({key,skipCursor,side})=>{const c=document.querySelector('canvas'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let changed=0,max=0;for(let i=0;i<pixels.length;i++){const x=Math.floor(i/4)%c.width,y=Math.floor(i/4/c.width);if(skipCursor&&Math.abs(x-(Math.floor(side/2)+.5)*c.width/side)<c.width/side+4&&Math.abs(y-(Math.floor(side/2)+.5)*c.height/side)<c.height/side+4)continue;const d=Math.abs(pixels[i]-window[key][i]);max=Math.max(max,d);if(i%4===0&&d)changed++;}return {changed,max};},{key,skipCursor,side:examples.find(e=>e.sequence_id==='real-wise-0855').grid.width_px});
const report={testedAt:new Date().toISOString(),browsers:[]};
try{
 for(const engine of [chromium,firefox]){
  const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',error=>errors.push(String(error)));await load(page);await advanced(page);
   await page.getByLabel('Display resolution',{exact:true}).selectOption('hd');await ready(page);
   assert.equal(await button(page,'REFINE IMAGE').getAttribute('aria-pressed'),'false');
   await button(page,'SHOW ORIGINAL').click();await capture(page,'originalPixels');
   await button(page,'SHOW ORIGINAL').click();await capture(page,'cleanPixels');
   await page.locator('canvas').screenshot({path:`${output}/${engine.name()}-before.png`});
   await button(page,'REFINE IMAGE').click();await ready(page);assert.equal(await page.locator('[data-refinement]').getAttribute('data-refinement'),'on');
   const changed=await difference(page,'cleanPixels');assert(changed.changed>1000);await capture(page,'refinedPixels');
   await page.locator('canvas').screenshot({path:`${output}/${engine.name()}-refined.png`});
   await button(page,'SHOW ORIGINAL').click();await ready(page);assert.equal((await difference(page,'originalPixels')).max,0);
   await button(page,'SHOW ORIGINAL').click();await ready(page);assert.equal((await difference(page,'refinedPixels')).max,0);
   await button(page,'HOLD ORIGINAL').focus();await page.keyboard.down('Space');await ready(page);
   assert.equal((await difference(page,'originalPixels')).max,0);
   await page.keyboard.up('Space');await ready(page);assert.equal((await difference(page,'refinedPixels')).max,0);
   const firstDate=await page.locator('#observation-index').getAttribute('aria-valuetext');
   await button(page,'Next observation').click();await ready(page);assert.notEqual(await page.locator('#observation-index').getAttribute('aria-valuetext'),firstDate);
   assert.equal(await page.locator('[data-refinement]').getAttribute('data-refinement'),'on');
   await button(page,'Previous observation').click();await ready(page);
   // The Mark tool adds a visible cyan cursor; compare the original image outside it.
   await button(page,'MARK').click();await ready(page);assert.equal((await difference(page,'originalPixels',true)).max,0);
   assert.equal(await button(page,'REFINE IMAGE').isDisabled(),true);
   await page.getByRole('group',{name:'Observation canvas',exact:true}).focus();await page.keyboard.press('Enter');
   await page.getByLabel('Observation note',{exact:true}).fill('Refinement acceptance control, not a discovery.');
   await button(page,'SAVE CANDIDATE NOTE').click();
   const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:/^EXPORT ALL SAVED CANDIDATES/}).click();
   const download=await downloadEvent,evidence=JSON.parse(await readFile(await download.path(),'utf8'));
   const primary=examples.find(e=>e.sequence_id==='real-wise-0855'),raw=await(await fetch(api+primary.frames[0].raster.url)).arrayBuffer();
   const position=evidence.candidates[0].position,side=primary.grid.width_px;
   const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('khonsu.candidates.v2')).candidates[0].selection);
   assert.equal(position.pixel_has_data,new Uint8Array(raw,side*side*4)[stored.y*side+stored.x]===1);
   await button(page,'REWIND').click();await ready(page);
   await button(page,'REFINE IMAGE').focus();await page.keyboard.press('Space');await ready(page);assert.equal(await page.locator('[data-refinement]').getAttribute('data-refinement'),'off');
   await page.keyboard.press('Space');await ready(page);assert.equal(await page.locator('[data-refinement]').getAttribute('data-refinement'),'on');
   await page.setViewportSize({width:390,height:844});await ready(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByRole('group',{name:'Clean view controls',exact:true}).screenshot({path:`${output}/${engine.name()}-controls-mobile.png`});
   if(process.env.AXE_CORE_PATH){await page.addScriptTag({path:process.env.AXE_CORE_PATH});assert.deepEqual(await page.evaluate(async()=>{const r=await window.axe.run('[aria-label="Sky image viewer"]',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>v.id);}),[]);}
   await advanced(page);await page.getByLabel('Rendering mode',{exact:true}).selectOption('cpu');await ready(page);assert.equal(await page.locator('[data-renderer]').textContent(),'CPU worker');
   const parity=await page.evaluate(async({api,examples})=>{
    const {DisplayRenderer}=await import('/__refinement/displayRenderer.js'),{decodeRaster,attachGapFill,attachRefinement,renderPixels}=await import('/__refinement/display.js');
    const gpu=new DisplayRenderer(()=>{}),cpu=new DisplayRenderer(()=>{},true),canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
    let maximum=0,checks=0;
    try{
     for(const example of examples)for(const frame of example.frames){
      const read=async meta=>decodeRaster(await(await fetch(api+meta.url)).arrayBuffer(),example.grid.width_px,example.grid.height_px,meta.encoding);
      const original=await read(frame.raster),raster=attachRefinement(attachGapFill(original,await read(frame.gap_fill),frame.estimated_fraction),await read(frame.refinement.raster));
      for(const sampling of ['pixels','smooth'])for(const reduceGrain of [false,true])for(const softHighlights of [false,true])for(const detail of [0,.35]){
       const options={low:example.display.vmin,high:example.display.vmax,a:.3,gamma:1,curve:'asinh',mask:'subtle',sampling,reduceGrain,softHighlights,detail,cleanView:true,includeWarnings:true},size={width:237,height:163};
       canvas.width=size.width;canvas.height=size.height;const expected=renderPixels(raster,options,size);
       for(const renderer of [gpu,cpu]){const image=await renderer.render(raster,options,size);if(image instanceof ImageData)context.putImageData(image,0,0);else context.drawImage(image,0,0);if(image instanceof ImageBitmap)image.close();const got=context.getImageData(0,0,size.width,size.height).data;for(let i=0;i<got.length;i++)maximum=Math.max(maximum,Math.abs(got[i]-expected[i]));checks++;}
      }
     }
     return {maximumByteDifference:maximum,checks,gpuMode:gpu.mode,adapter:gpu.adapter};
    }finally{gpu.dispose();cpu.dispose();}
   },{api,examples});
   assert.equal(parity.gpuMode,'WebGL2');assert(parity.maximumByteDifference<=1,JSON.stringify(parity));
   const failed=await browser.newPage();await failed.route('**/*-refined.bin',route=>route.abort());await load(failed);
   assert.equal(await button(failed,'REFINE IMAGE').isDisabled(),true);assert.match(await failed.locator('[data-refinement]').textContent(),/could not load/);await failed.close();
   const corrupt=await browser.newPage();await corrupt.route('**/*-refined.bin',async route=>{const response=await route.fetch(),bytes=Buffer.from(await response.body());bytes[0]^=1;await route.fulfill({response,body:bytes});});await load(corrupt);
   assert.equal(await button(corrupt,'REFINE IMAGE').isDisabled(),true);await corrupt.close();
   const legacy=await browser.newPage();await legacy.route('**/v1/examples',route=>route.fulfill({json:examples.map(e=>({...e,frames:e.frames.map(f=>({...f,refinement:null}))}))}));await load(legacy);
   assert.equal(await button(legacy,'REFINE IMAGE').isDisabled(),true);await legacy.close();
   assert.deepEqual(errors,[]);
   report.browsers.push({browser:engine.name(),version:browser.version(),changedDisplayPixels:changed.changed,...parity,startsOff:true,originalExact:true,holdOriginalExact:true,markOriginal:true,evidenceValidityUnchanged:true,realDateStepping:true,mobileNoOverflow:true,keyboardToggle:true,failedOrCorruptOriginalFallback:true,legacyCompatible:true});
   console.log(engine.name()+': refinement passed');
  }finally{await browser.close();}
 }
 await writeFile(`${output}/browser.json`,JSON.stringify(report,null,2)+'\n');
}finally{for(const name of Object.keys(modules))await unlink(new URL(name,folder));await rmdir(folder);}
