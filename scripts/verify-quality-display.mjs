// Real warning masks, bounded 4K, candidate validity and background-study controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,unlink,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {browserDisplayModules} from './browser-display-modules.mjs';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3001',api=process.env.KHONSU_TEST_API||'http://localhost:8001';
const output=resolve(process.env.KHONSU_TEST_OUTPUT||'.cache/quality/browser');await mkdir(output,{recursive:true});
const modules=await browserDisplayModules(),folder=new URL('../apps/web/out/__quality/',import.meta.url);
await mkdir(folder,{recursive:true});for(const [name,source] of Object.entries(modules))await writeFile(new URL(name,folder),source);
const report={testedAt:new Date().toISOString(),browsers:[]};
const ready=page=>page.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:60000});
const button=(page,name)=>page.getByRole('button',{name,exact:true});
try{
 for(const engine of [chromium,firefox]){
  const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(base);await button(page,'LOAD CACHED REAL EXAMPLE').click();await ready(page);
   await page.locator('summary').filter({hasText:'IMAGE DISPLAY'}).click();
   assert.equal(await page.getByLabel('No-data style',{exact:true}).inputValue(),'subtle');
   await page.getByLabel('Display resolution',{exact:true}).selectOption('hd');await ready(page);
   const real=await (await fetch(`${api}/v1/examples`)).json(),primary=real.find(e=>e.sequence_id==='real-wise-0855');
   const raw=new Uint8Array(await (await fetch(api+primary.frames[0].raster.url)).arrayBuffer()),side=primary.grid.width_px,quality=raw.subarray(side*side*4);
   assert(quality.includes(2),'Real fixture must contain warning-only samples');
   await page.getByLabel('Quality policy',{exact:true}).selectOption('warnings');await ready(page);
   const warningIndex=quality.findIndex((q,i)=>q===2&&i%side>side*.2&&i%side<side*.8&&Math.floor(i/side)>side*.2&&Math.floor(i/side)<side*.8);
   assert(warningIndex>=0);await button(page,'MARK').click();await ready(page);
   const c=page.locator('canvas');await c.scrollIntoViewIfNeeded();await ready(page);const box=await c.boundingBox();
   await page.mouse.click(box.x+(warningIndex%side+.5)*box.width/side,box.y+(Math.floor(warningIndex/side)+.5)*box.height/side);
   await page.getByText(/Warning-only sample: OUTLIER/).waitFor();
   await page.getByLabel('Observation note',{exact:true}).fill('Quality acceptance control, not a discovery.');
   await button(page,'SAVE CANDIDATE NOTE').click();
   const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('khonsu.candidates.v2')));
   assert.equal(stored.candidates[0].selection.pixelQuality,'warning-only');assert.equal(stored.candidates[0].selection.pixelHasData,false);
   await button(page,'REWIND').click();
   await page.getByLabel('Display resolution',{exact:true}).selectOption('4k');await ready(page);
   const size=await c.evaluate(c=>({width:c.width,height:c.height}));assert.deepEqual(size,{width:2880,height:2880});
   const screenshot=await c.evaluate(c=>c.toDataURL('image/jpeg',.8));await writeFile(`${output}/${engine.name()}-4k.jpg`,Buffer.from(screenshot.split(',')[1],'base64'));
   await page.getByLabel('Display resolution',{exact:true}).selectOption('auto');
   await page.getByLabel('Rendering mode',{exact:true}).selectOption('cpu');await ready(page);
   assert.equal(await page.locator('[data-resolution]').getAttribute('data-resolution'),'hd');
   assert.equal(await page.locator('[data-renderer]').textContent(),'CPU worker');
   const parity=await page.evaluate(async({api,primary})=>{
    const {DisplayRenderer}=await import('/__quality/displayRenderer.js'),{decodeRaster,renderPixels}=await import('/__quality/display.js');
    const bytes=await(await fetch(api+primary.frames[0].raster.url)).arrayBuffer(),raster=decodeRaster(bytes,primary.grid.width_px,primary.grid.height_px,primary.frames[0].raster.encoding);
    const gpu=new DisplayRenderer(()=>{}),cpu=new DisplayRenderer(()=>{},true),canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
    let maximum=0,checks=0;const timings=[];
    const paint=image=>{context.clearRect(0,0,canvas.width,canvas.height);if(image instanceof ImageData)context.putImageData(image,0,0);else context.drawImage(image,0,0);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;if(image instanceof ImageBitmap)image.close();return rgba;};
    try{
     for(const mask of ['subtle','quiet','hatch'])for(const includeWarnings of [false,true])for(const sampling of ['smooth','pixels']){
      const options={low:primary.display.vmin,high:primary.display.vmax,a:.3,gamma:1,curve:'asinh',mask,includeWarnings,sampling,detail:.35},size={width:231,height:147};
      canvas.width=size.width;canvas.height=size.height;const expected=renderPixels(raster,options,size);
      for(const renderer of [gpu,cpu]){const got=paint(await renderer.render(raster,options,size));for(let i=0;i<got.length;i++)maximum=Math.max(maximum,Math.abs(got[i]-expected[i]));checks++;}
     }
     if(maximum>1)throw Error(`Quality CPU/GPU difference ${maximum}`);
     canvas.width=3840;canvas.height=2160;
     for(const renderer of [gpu,cpu]){const start=performance.now();const got=paint(await renderer.render(raster,{low:primary.display.vmin,high:primary.display.vmax,a:.3,gamma:1,curve:'asinh',mask:'subtle',sampling:'smooth',includeWarnings:true},{width:3840,height:2160}));let signal=0;for(let i=0;i<got.length;i+=4)if(got[i]>80&&got[i]===got[i+1]&&got[i]===got[i+2])signal++;if(signal<1000)throw Error('Empty 4K render');timings.push({mode:renderer.mode,milliseconds:performance.now()-start,signalPixels:signal});}
     return{maximumByteDifference:maximum,checks,timings,adapter:gpu.adapter};
    }finally{gpu.dispose();cpu.dispose();}
   },{api,primary});
   await page.goto(base+'/resolution-lab/#quality-study');const study=page.getByRole('region',{name:'Quality and background study'});
   await study.locator('img').first().waitFor();await study.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
   await button(page,'SUBTRACT ZODI MODEL').click();await button(page,'INCLUDE WARNING SAMPLES').click();await button(page,'INSPECT STUDY GAPS').click();
   assert.equal(await study.locator('[data-gaps]').first().getAttribute('data-gaps'),'inspect');
   await page.getByLabel('Quality study field',{exact:true}).selectOption('1');await study.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(process.env.AXE_CORE_PATH){await page.addScriptTag({path:process.env.AXE_CORE_PATH});const violations=await page.evaluate(async()=>{const r=await window.axe.run('#quality-study',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[]);}
   await page.evaluate(()=>document.activeElement?.blur());
   await study.screenshot({path:`${output}/${engine.name()}-study-mobile.png`});assert.deepEqual(errors,[]);
   report.browsers.push({browser:engine.name(),version:browser.version(),size,warningCandidateExcluded:true,cpuAdaptiveFallback:true,studyControls:true,mobileNoOverflow:true,...parity});
   console.log(engine.name()+': quality and 4K passed');
  }finally{await browser.close();}
 }
 await writeFile(`${output}/quality-browser-report.json`,JSON.stringify(report,null,2)+'\n');
}finally{for(const name of Object.keys(modules))await unlink(new URL(name,folder));await rmdir(folder);}
