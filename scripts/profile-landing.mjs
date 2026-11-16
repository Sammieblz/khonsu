// Compare two static exports locally. Real API metadata is replayed identically.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const before=process.env.KHONSU_BASELINE_URL||'http://localhost:3006',after=process.env.KHONSU_TEST_URL||'http://localhost:3004',api=process.env.KHONSU_TEST_API||'http://localhost:8004';
const responses=Object.fromEntries(await Promise.all(['presets','examples'].map(async name=>[name,await(await fetch(api+'/v1/'+name)).text()]))),results=[];
for(const engine of [chromium,firefox]){
 const browser=await engine.launch({headless:true});
 try{for(const [version,url] of [['before',before],['after',after]]){
  const context=await browser.newContext({viewport:{width:1366,height:768}}),p=await context.newPage();
  await p.route('https://fonts.googleapis.com/**',r=>r.abort());
  await p.route(/\/v1\/(presets|examples)$/,r=>r.fulfill({contentType:'application/json',body:responses[r.request().url().split('/').at(-1)]}));
  await p.addInitScript(()=>{window.__longTasks=[];if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});});
  if(engine===chromium){const cdp=await context.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  await p.goto(url);await p.waitForTimeout(700);
  const load=await p.evaluate(()=>{const nav=performance.getEntriesByType('navigation')[0],resources=performance.getEntriesByType('resource').filter(e=>e.name.startsWith(location.origin));return {domContentLoadedMs:Math.round(nav.domContentLoadedEventEnd),loadMs:Math.round(nav.loadEventEnd),localResourceBytes:resources.reduce((n,e)=>n+e.encodedBodySize,0),longTasks:window.__longTasks};});
  const frames=await p.evaluate(()=>new Promise(resolve=>{const values=[],start=performance.now();let previous=start;function tick(now){values.push(now-previous);previous=now;window.scrollTo({top:(now-start)*1.8,behavior:'instant'});if(now-start<2400)requestAnimationFrame(tick);else{const sorted=values.slice(1).sort((a,b)=>a-b);resolve({frames:sorted.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],over50ms:sorted.filter(v=>v>50).length});}}requestAnimationFrame(tick);}));
  results.push({browser:engine.name(),version,browserVersion:browser.version(),cpuThrottle:engine===chromium?4:1,...load,scrollFrameIntervals:frames});await context.close();
 }}finally{await browser.close();}
}
await mkdir('.cache/landing-design',{recursive:true});await writeFile(resolve('.cache/landing-design/performance.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
