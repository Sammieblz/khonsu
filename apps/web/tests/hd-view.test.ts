import assert from 'node:assert/strict';
import test from 'node:test';
import { centerImageField, visibleImageField, nativeSampling } from '../src/features/viewer/viewport.ts';
import { frameCacheWindow } from '../src/features/viewer/time.ts';
import { requestedFrames, readSharedSearch, sharedSearchQuery } from '../src/features/explorer/coordinates.ts';
import { decodeRaster, displaySize, MAX_RASTER_BYTES } from '../src/features/viewer/display.ts';

test('HD display retains aspect ratio and the largest valid prepared raster', () => {
  assert.deepEqual(displaySize(1920,1080),{width:1920,height:1080});
  assert.deepEqual(displaySize(3840,2160),{width:2160,height:1215});
  const bytes=new ArrayBuffer(MAX_RASTER_BYTES),n=2048*2048;
  new Float32Array(bytes,0,n)[n-1]=-5;
  new Uint8Array(bytes,n*4)[n-1]=1;
  const raster=decodeRaster(bytes,2048,2048);
  assert.equal(raster.values[n-1],-5); assert.equal(raster.valid[n-1],1);
  assert.throws(()=>decodeRaster(bytes,2049,2048));
});

test('overview recenter and visible field agree through zoom and pan', () => {
  const geometry={stageWidth:800,stageHeight:600,rasterWidth:800,rasterHeight:600};
  const view=centerImageField({zoom:4,x:0,y:0},.7,.3,geometry);
  const region=visibleImageField(view,geometry);
  assert(Math.abs(region.left+region.width/2-.7)<1e-12);
  assert(Math.abs(region.top+region.height/2-.3)<1e-12);
  assert.equal(region.width,.25);
  const edge=visibleImageField(centerImageField(view,0,1,geometry),geometry);
  assert.equal(edge.left,0); assert.equal(edge.top+edge.height,1);
  assert.equal(nativeSampling(6,6.2),360/6.2);
  for (const value of [null,undefined,'6.2',NaN,0]) assert.equal(nativeSampling(6,value),null);
});

test('large frames share a three-frame cache prioritizing current and A/B', () => {
  const frames=Array.from({length:10},()=>({raster:{size_bytes:MAX_RASTER_BYTES}}));
  assert.deepEqual(frameCacheWindow(frames,5,[0,9]),[5,0,9]);
  assert.deepEqual(frameCacheWindow(frames,0,[0,9]),[0,9,1]);
  const withEstimates=Array.from({length:10},()=>({raster:{size_bytes:3*1024*1024},gap_fill:{size_bytes:3*1024*1024}}));
  assert.deepEqual(frameCacheWindow(withEstimates,5,[0,9]),[5,0,9], 'Estimate memory counts toward the same cache budget');
  const withRefinement=Array.from({length:10},()=>({raster:{size_bytes:2*1024*1024},gap_fill:{size_bytes:2*1024*1024},refinement:{raster:{size_bytes:2*1024*1024}}}));
  assert.deepEqual(frameCacheWindow(withRefinement,5,[0,9]),[5,0,9], 'Refinement memory counts toward the same cache budget');
});

test('wide searches round trip without inflating the exposure request', () => {
  const values={ra_deg:133.795,dec_deg:-7.245,fov_arcmin:120};
  const parsed=readSharedSearch(sharedSearchQuery(values));
  assert.equal(parsed.kind,'ok'); if(parsed.kind==='ok') assert.deepEqual(parsed.search.values,values);
  assert.equal(requestedFrames(120),4); assert.equal(requestedFrames(60),8); assert.equal(requestedFrames(6),16);
});
