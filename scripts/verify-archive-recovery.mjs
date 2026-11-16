// Controlled archive failures only; cached observation assets come from the real API.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3011';
const out=process.env.KHONSU_TEST_OUTPUT||'.cache/archive-recovery';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const report=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}});
  const page=await context.newPage();let posts=0;
  const diagnostics=['Archive stage: image search','Attempts: 5 of 5','Upstream HTTP status: 502'];
  await page.route('**/v1/sequences',route=>{
   assert.equal(route.request().method(),'POST');posts++;
   return route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({sequence_id:'outage-test',status:'queued',progress:0,message:'Controlled test'})});
  });
  await page.route('**/v1/sequences/outage-test',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sequence_id:'outage-test',status:'failed',progress:.1,message:'Controlled archive outage',error:{code:'archive_unavailable',message:"IRSA's image search service is temporarily unavailable (HTTP 502).",details:diagnostics}})}));
  await page.goto(base+'/console/?example=real-wise-0855');
  const ready=()=>page.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:30000});
  await ready();
  const controls=page.getByRole('button',{name:'CONTROLS',exact:true});
  if(await controls.isVisible())await controls.click();
  await page.getByRole('tab',{name:'FIELD',exact:true}).click();
  await page.locator('#ra').fill('270');await page.locator('#dec').fill('66.5');
  await page.getByRole('button',{name:'SEARCH THIS FIELD',exact:true}).click();
  const close=page.getByRole('button',{name:'Close controls',exact:true});
  if(await close.isVisible())await close.click();
  const feedback=page.locator('[data-loading-stage="failed"]');await feedback.waitFor();
  const recovery=feedback.getByRole('button',{name:'OPEN CACHED REAL OBSERVATIONS',exact:true});
  assert.equal(await recovery.isVisible(),true);assert.equal(posts,1);
  await feedback.getByText('Technical details',{exact:true}).click();
  await feedback.getByText('Upstream HTTP status: 502',{exact:true}).waitFor();
  assert.match(await feedback.innerText(),/Saved field: WISE 0855/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:`${out}/failure-${width}.png`,fullPage:true});
  await feedback.getByRole('button',{name:'TRY AGAIN',exact:true}).click();
  await feedback.waitFor();assert.equal(posts,2);
  await recovery.click();await ready();
  assert.equal(await feedback.count(),0);assert.equal(posts,2);
  assert.match(page.url(),/example=real-wise-0855/);
  await page.getByText('CACHED-REAL',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/recovered-${width}.png`,fullPage:true});
  report.push({width,explicitCachedRecovery:true,retryStartsNewSearch:true,automaticFallback:false,realCachedAssets:true,diagnostics:true});
  await context.close();
 }
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
