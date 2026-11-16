// Genuine catalog/observation browser acceptance; outage responses are explicit test injections.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3003',api=process.env.KHONSU_TEST_API||'http://localhost:8003';
const output=resolve(process.env.KHONSU_TEST_OUTPUT||'.cache/context72/browser');await mkdir(output,{recursive:true});
const examples=await(await fetch(api+'/v1/examples')).json(),primary=examples[0];
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const ready=async page=>{await page.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:60000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
const load=async page=>{await page.goto(base);await button(page,'LOAD CACHED REAL EXAMPLE').click();await ready(page);};
const report={testedAt:new Date().toISOString(),browsers:[]};
for(const engine of [chromium,firefox]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await load(page);
  const canvas=page.locator('canvas').first(),layers=page.locator('details').filter({has:page.locator('summary').filter({hasText:'LAYERS & SKY CONTEXT'})}).first();
  await button(page,'INSPECT').click();await ready(page);
  assert.equal(await layers.evaluate(element=>element.open),true);
  await button(page,'Next observation').click();await ready(page);
  // This is the exact previously reported gap in the second genuine WISE frame.
  await canvas.scrollIntoViewIfNeeded();let rect=await canvas.boundingBox();
  await page.mouse.click(rect.x+31.5/primary.grid.width_px*rect.width,rect.y+75.5/primary.grid.height_px*rect.height);
  await ready(page);
  assert.equal(await page.locator('[data-pixel-quality]').getAttribute('data-pixel-quality'),'estimated');
  assert.match(await page.locator('[data-pixel-quality]').innerText(),/not a telescope measurement/);
  assert.equal(await page.getByLabel('Observation note',{exact:true}).isDisabled(),true);
  await page.getByLabel('Quality overlay',{exact:true}).check();await ready(page);
  await canvas.screenshot({path:resolve(output,engine.name()+'-quality.png')});
  await page.getByLabel('Quality overlay',{exact:true}).uncheck();await ready(page);
  await button(page,'PAN').click();await ready(page);
  await page.evaluate(()=>{window.__contextBefore=document.querySelector('canvas').toDataURL();});
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/context/gaia'));
  await page.getByLabel('Known sources / Gaia DR3',{exact:true}).check();
  const response=await responsePromise;
  assert.equal(response.status(),200,await response.text());const context=await response.json();
  assert.ok(context.sources.length>0);assert.equal(context.sequence_id,primary.sequence_id);
  await page.locator('[data-gaia-id]').first().waitFor();
  assert.equal(await page.evaluate(()=>window.__contextBefore===document.querySelector('canvas').toDataURL()),true,'Catalog overlays must not change science canvas pixels');
  const current=primary.frames[1].frame_id;
  const source=context.sources.find(source=>source.positions.some(point=>point.frame_id===current&&point.x>15&&point.y>15&&point.x<primary.grid.width_px-15&&point.y<primary.grid.height_px-15));
  assert.ok(source);const position=source.positions.find(point=>point.frame_id===current);
  await page.getByLabel('Inspect catalog source',{exact:true}).selectOption(source.source_id);
  const circle=page.locator(`[data-gaia-id="${source.source_id}"]`);
  const alignment=async()=>{
    const marker=await circle.boundingBox(),image=await canvas.boundingBox();
    assert.ok(marker&&image);
    const dx=Math.abs(marker.x+marker.width/2-(image.x+(position.x+.5)/primary.grid.width_px*image.width));
    const dy=Math.abs(marker.y+marker.height/2-(image.y+(position.y+.5)/primary.grid.height_px*image.height));
    assert.ok(dx<.1&&dy<.1,JSON.stringify({dx,dy}));return {dx,dy};
  };
  const fit=await alignment();await button(page,'Zoom in').click();await ready(page);const zoom=await alignment();
  await button(page,'FIT / RESET').click();await ready(page);
  await page.getByRole('group',{name:'Observation canvas',exact:true}).screenshot({path:resolve(output,engine.name()+'-gaia.png')});
  // Marker data changes to the selected genuine epoch without inventing frames.
  await button(page,'Next observation').click();await ready(page);
  const nextPosition=source.positions.find(point=>point.frame_id===primary.frames[2].frame_id);
  assert.ok(nextPosition);assert.ok(Math.abs(Number(await circle.getAttribute('cx'))-nextPosition.x)<1e-8);
  // A catalog failure is independent of playback and original science assets.
  await page.getByLabel('Known sources / Gaia DR3',{exact:true}).uncheck();
  // New sequence remount clears catalog state, allowing a controlled outage.
  await load(page);
  await layers.locator('summary').first().click();
  await page.route('**/context/gaia',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'CONTEXT_UNAVAILABLE',message:'Injected catalog outage for acceptance',details:[]})}));
  await page.getByLabel('Known sources / Gaia DR3',{exact:true}).check();
  await page.getByRole('alert').filter({hasText:'Injected catalog outage'}).waitFor();
  await button(page,'Next observation').click();await ready(page);
  await page.unroute('**/context/gaia');
  await button(page,'RETRY GAIA').click();await page.locator('[data-gaia-id]').first().waitFor({timeout:40000});
  // The external Aladin pane must open the intended survey, field and actual tiles.
  const wiseTiles=[];
  page.on('response',res=>{if(res.url().includes('/AllWISE/RGB-W4-W2-W1/')&&res.url().includes('/Norder')&&res.status()===200)wiseTiles.push(res.url());});
  await page.getByLabel('WISE reference pane',{exact:true}).check();
  const iframe=page.locator('iframe[title="Aladin Lite AllWISE reference sky"]');await iframe.scrollIntoViewIfNeeded();
  const frame=await(await iframe.elementHandle()).contentFrame();
  await frame.waitForFunction(()=>window.initialView&&document.querySelector('canvas'),null,{timeout:60000});
  const wiseView=await frame.evaluate(()=>window.initialView);
  assert.ok(Math.abs(wiseView.ra-primary.target.ra_deg)<1e-6&&Math.abs(wiseView.dec-primary.target.dec_deg)<1e-6);
  assert.equal(wiseView.hips,'https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/RGB-W4-W2-W1');
  assert.equal(wiseView.fov,primary.requested_fov_arcmin/60);
  const wiseRect=await iframe.boundingBox();assert.ok(Math.abs(wiseRect.width/wiseRect.height-primary.grid.width_px/primary.grid.height_px)<.01);
  const until=Date.now()+30000;while(!wiseTiles.length&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,250));
  assert.ok(wiseTiles.length>0,'No successful real WISE tile response');
  await iframe.screenshot({path:resolve(output,engine.name()+'-wise.png')});
  await page.getByLabel('WISE reference pane',{exact:true}).uncheck();assert.equal(await iframe.count(),0);
  await page.getByText('Link & embed preview',{exact:true}).click();
  const code=await page.getByLabel('HTML embed code',{exact:true}).inputValue();assert.match(code,/embed=1/);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('Injected clipboard denial'))},configurable:true}));
  await button(page,'COPY EMBED CODE').click();await page.getByText('Copying was blocked. Select and copy the text below.',{exact:true}).waitFor();
  const url=await page.getByRole('link',{name:'OPEN COMPACT PREVIEW'}).getAttribute('href');
  const embedded=await browser.newPage({viewport:{width:820,height:900}}),archiveRequests=[];
  embedded.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/v1/sequences'))archiveRequests.push(request.url());});
  await embedded.goto(url);await embedded.locator('[data-embed="true"]').waitFor();
  assert.equal(Number(await embedded.locator('#ra').inputValue()),primary.target.ra_deg);
  assert.equal(archiveRequests.length,0,'Shared links must not start an archive job');
  await embedded.screenshot({path:resolve(output,engine.name()+'-embed.png')});
  await embedded.close();
  const host=await browser.newPage();await host.setContent(code);const compactFrame=await(await host.locator('iframe').elementHandle()).contentFrame();
  await compactFrame.locator('[data-embed="true"]').waitFor();assert.equal(Number(await compactFrame.locator('#ra').inputValue()),primary.target.ra_deg);await host.close();
  await page.setViewportSize({width:390,height:844});await ready(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await layers.scrollIntoViewIfNeeded();await layers.screenshot({path:resolve(output,engine.name()+'-mobile.png')});
  assert.deepEqual(errors,[]);
  report.browsers.push({browser:engine.name(),version:browser.version(),catalogSources:context.sources.length,truncated:context.truncated,fit,zoom,wiseView,wiseTiles:wiseTiles.length,quality:'estimated gap explained without creating a candidate',failure:'503 retry and playback passed',sharing:'compact mode preserves coordinates; no auto archive request',errors});
 }finally{await browser.close();}
}
await writeFile(resolve(output,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
