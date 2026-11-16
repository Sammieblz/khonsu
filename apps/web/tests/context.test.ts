import assert from 'node:assert/strict';
import test from 'node:test';
import {pixelQuality,qualityOverlay} from '../src/features/context/quality.ts';
import {compactMode,shareLinks,wiseReferenceUrl,WISE_SURVEY} from '../src/features/context/links.ts';
import {readSharedSearch} from '../src/features/explorer/coordinates.ts';

test('inspection distinguishes measurements, warnings and display guesses without changing their masks',()=>{
  const raster={width:4,height:1,values:new Float32Array([2,3,0,0]),valid:new Uint8Array([1,0,0,0]),warning:new Uint8Array([0,1,0,0]),estimated:new Uint8Array([0,0,1,0])};
  const snapshot=structuredClone(raster);
  assert.deepEqual([0,1,2,3].map(x=>pixelQuality(raster,x,0,true).kind),['strict-valid','warning-only','estimated','unavailable']);
  assert.match(pixelQuality(raster,2,0,false).title,/Missing/);
  assert.equal(pixelQuality(undefined,0,0,false).kind,'unknown');
  assert.equal(pixelQuality(raster,4,0,false).kind,'unknown');
  const overlay=qualityOverlay(raster);
  assert.deepEqual([...overlay.slice(0,4)],[0,0,0,0]);
  assert.ok(overlay[7]>0&&overlay[11]>0&&overlay[15]>0);
  assert.deepEqual(raster,snapshot);
});
test('compact share keeps exact coordinates and observation, drops private or stale URL parameters',()=>{
  const values={ra_deg:359.99999,dec_deg:-89.4,fov_arcmin:6};
  const links=shareLinks('https://khonsu.example/path/?private=note&embed=1#secret',values,'spherex-real-id');
  assert.equal(new URL(links.link).hash,'');
  assert.equal(new URL(links.link).searchParams.has('private'),false);
  assert.equal(compactMode(new URL(links.link).search),false);
  assert.equal(compactMode(new URL(links.embed).search),true);
  const restored=readSharedSearch(new URL(links.embed).search);
  assert.equal(restored.kind,'ok');
  if(restored.kind==='ok'){assert.deepEqual(restored.search.values,values);assert.equal(restored.search.observationId,'spherex-real-id');}
  assert.match(links.code,/&amp;/);
  assert.doesNotMatch(links.code,/secret|private|<script/);
  assert.equal(compactMode('?embed=2'),false);
  assert.equal(compactMode('?embed=1&'+ 'a'.repeat(2048)),false);
  assert.throws(()=>shareLinks('javascript:alert(1)',values));
});
test('WISE link selects the verified IRSA atlas and field rather than a default survey',()=>{
  const link=new URL(wiseReferenceUrl(133.76,-7.24,6));
  assert.equal(link.origin,'https://aladin.cds.unistra.fr');
  assert.equal(link.searchParams.get('hips'),WISE_SURVEY);
  assert.equal(link.searchParams.get('ra'),'133.76');
  assert.equal(link.searchParams.get('dec'),'-7.24');
  assert.equal(link.searchParams.get('fov'),'0.1');
});
