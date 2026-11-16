// Live browser acceptance. No request interception or substituted observations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3000';
const out=process.env.KHONSU_TEST_OUTPUT||'.cache/live-irsa-repair/browser';
const ra=Number(process.env.KHONSU_TEST_RA||270.03),dec=Number(process.env.KHONSU_TEST_DEC||66.52);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],posts=[],assets=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/v1/sequences'))posts.push(request.postDataJSON());});
page.on('response',response=>{if(/\/v1\/sequences\/[^/]+\/frames\//.test(response.url()))assets.push({url:response.url(),status:response.status()});});
try{
 await page.goto(base+'/console/',{waitUntil:'domcontentloaded'});
 await page.getByRole('tab',{name:'FIELD',exact:true}).click();
 await page.locator('#ra').fill(String(ra));await page.locator('#dec').fill(String(dec));
 const response=page.waitForResponse(r=>/\/v1\/sequences\/[^/]+\/manifest$/.test(r.url())&&r.status()===200,{timeout:300000});
 await page.getByRole('button',{name:'SEARCH THIS FIELD',exact:true}).click();
 const manifest=await (await response).json();
 assert.equal(posts.length,1);assert.equal(manifest.data_mode,'live');
 assert.equal(manifest.target.ra_deg,ra);assert.equal(manifest.target.dec_deg,dec);
 assert.equal(manifest.processing.observation_discovery,'local-index');
 assert.equal(manifest.processing.observation_index_coverage,'partial');
 assert.ok(manifest.frames.length>=2);
 assert.ok(new Set(manifest.frames.map(f=>f.observed_start_utc)).size>=2);
 assert.ok(manifest.warnings.some(w=>w.code==='LOCAL_OBSERVATION_INDEX'));
 const ready=()=>page.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:45000});
 await ready();await page.getByText('LIVE / INDEXED SEARCH',{exact:true}).waitFor();
 const first=await page.locator('canvas').getAttribute('aria-label');
 await page.getByRole('button',{name:'Next observation',exact:true}).click();await ready();
 assert.notEqual(await page.locator('canvas').getAttribute('aria-label'),first);
 await page.screenshot({path:`${out}/desktop.png`,fullPage:true});
 await page.getByRole('tab',{name:'INFO',exact:true}).click();
 await page.locator('[data-inspector-panel="info"]').getByText('LOCAL_OBSERVATION_INDEX',{exact:true}).waitFor();
 await page.screenshot({path:`${out}/provenance.png`,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const close=page.getByRole('button',{name:'Close controls',exact:true});
 await close.waitFor({state:'visible'});await close.click();await close.waitFor({state:'hidden'});
 await page.getByText('LIVE / INDEXED SEARCH',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.screenshot({path:`${out}/mobile.png`,fullPage:true});
 assert.ok(assets.length>=2);assert.ok(assets.every(a=>a.status===200));assert.deepEqual(errors,[]);
 const report={base,checked_utc:new Date().toISOString(),request:posts[0],sequence_id:manifest.sequence_id,
  frames:manifest.frames.map(f=>({observation_id:f.observation_id,date:f.observed_start_utc,release:f.release,source_fits_url:f.source_fits_url})),
  discovery:manifest.processing.observation_discovery,frame_assets:assets,desktop:true,mobile:true,step:true,provenance:true,page_errors:errors};
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 await writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
 console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true});console.error((await page.locator('body').innerText()).slice(-4000));throw error;}
finally{await browser.close();}
