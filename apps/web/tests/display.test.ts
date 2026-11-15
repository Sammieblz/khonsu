import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeRaster,renderPixels} from '../src/features/viewer/display.ts';
const options={low:0,high:10,a:.3,gamma:1,curve:'linear' as const,mask:'quiet' as const};
test('display retains unclipped signed intensities, with explicit mask colors',()=>{
 const buffer=new ArrayBuffer(20),view=new DataView(buffer);
 [-3,5,30,0].forEach((v,i)=>view.setFloat32(i*4,v,true));new Uint8Array(buffer,16).set([1,1,1,0]);
 const raster=decodeRaster(buffer,2,2);assert.deepEqual([...raster.values],[-3,5,30,0]);
 assert.deepEqual([...renderPixels(raster,options)],[0,0,0,255,128,128,128,255,255,255,255,255,39,49,64,255]);
});
test('malformed rasters and reversed limits are rejected before display',()=>{
 assert.throws(()=>decodeRaster(new ArrayBuffer(21),2,2));
 const buffer=new ArrayBuffer(5);new DataView(buffer).setFloat32(0,NaN,true);assert.throws(()=>decodeRaster(buffer,1,1));
 assert.throws(()=>renderPixels({width:1,height:1,values:new Float32Array([1]),valid:new Uint8Array([1])},{...options,low:20}));
});
