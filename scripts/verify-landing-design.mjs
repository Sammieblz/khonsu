import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.KHONSU_TEST_URL||'http://localhost:3004',out=resolve('.cache/landing-design');await mkdir(out,{recursive:true});
const report=[];
for(const engine of [chromium,firefox]){
 const browser=await engine.launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.locator('#story[data-enhanced=true]').waitFor();await p.screenshot({path:resolve(out,engine.name()+'-hero.png')});
  const first=await p.locator('#story article').first().boundingBox();
  await p.evaluate(()=>scrollTo({top:document.querySelector('#story').getBoundingClientRect().top+scrollY+innerHeight-80,behavior:'instant'}));await p.waitForTimeout(650);
  const shifted=await p.locator('#story article').first().boundingBox();assert.ok(shifted.x<first.x-800);
  await p.screenshot({path:resolve(out,engine.name()+'-story.png')});
  assert.equal(await p.locator('#fields article').count(),5);assert.equal(await p.locator('#story time').count(),2);
  await p.getByRole('button',{name:'USE SIMPLE VIEW',exact:true}).click();await p.locator('#story:not([data-enhanced])').waitFor();
  assert.equal(await p.locator('.pin-spacer').count(),0);
  const positions=await p.locator('#story article').evaluateAll(items=>items.map(e=>e.getBoundingClientRect().top));assert.ok(positions[0]<positions[1]&&positions[1]<positions[2]);
  await p.emulateMedia({reducedMotion:'reduce'});await p.reload();assert.equal(await p.locator('#story').getAttribute('data-enhanced'),null);
  const axe=process.env.AXE_SCRIPT;if(axe){await p.addScriptTag({path:axe});const result=await p.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await p.locator('#story').getAttribute('data-enhanced'),null);
  await p.screenshot({path:resolve(out,engine.name()+'-mobile.png')});
  await p.setViewportSize({width:683,height:384});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.setViewportSize({width:1366,height:768});
  // Normal keyboard activation reaches real observations and removes landing motion.
  const entry=p.locator('#explore-entry').getByRole('link',{name:'EXPLORE THE SKY',exact:true});await entry.focus();await p.keyboard.press('Enter');
  await p.waitForFunction(()=>document.querySelector('canvas')?.style.visibility==='visible',null,{timeout:60000});assert.equal(await p.locator('#story').count(),0);assert.equal(await p.locator('.pin-spacer').count(),0);
  await p.getByRole('link',{name:'Khonsu home',exact:true}).click();await p.locator('#hero-title').waitFor();
  const posts=[];p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/v1/sequences'))posts.push(r.url());});
  await p.getByRole('link',{name:'Barnard\'s Star',exact:true}).click();await p.locator('#ra').waitFor();assert.ok(Number(await p.locator('#ra').inputValue())>269);assert.equal(posts.length,0);
  const plain=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await plain.goto(base);assert.equal(await plain.locator('#story article').count(),3);assert.equal(await plain.locator('#fields article').count(),5);assert.equal(await plain.locator('#story').getAttribute('data-enhanced'),null);assert.equal(await plain.getByRole('button',{name:'USE SIMPLE VIEW',exact:true}).count(),0);assert.equal(await plain.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.match(await plain.locator('#explore-entry a').first().getAttribute('href'),/console/);await plain.close();
  assert.deepEqual(errors,[]);report.push({browser:engine.name(),version:browser.version(),horizontal:'native vertical scrolling moves three chapters',fallbacks:'simple, mobile, reduced motion, 200% and no JavaScript',keyboard:'entry and preset navigation passed',errors});
 }finally{await browser.close();}
}
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
