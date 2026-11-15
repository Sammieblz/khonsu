import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeRaster,renderPixels,detailValues,displaySize,MAX_DISPLAY_SIDE} from '../src/features/viewer/display.ts';
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
test('smooth interpolation is in intensity space, while Pixels preserves sample values',()=>{
 const raster={width:2,height:1,values:new Float32Array([0,10]),valid:new Uint8Array([1,1])};
 const size={width:4,height:1};
 const gray=(pixels:Uint8ClampedArray)=>[...pixels].filter((_,i)=>i%4===0);
 assert.deepEqual(gray(renderPixels(raster,{...options,sampling:'smooth'},size)),[0,64,191,255]);
 assert.deepEqual(gray(renderPixels(raster,{...options,sampling:'pixels'},size)),[0,0,255,255]);
 const asinh=gray(renderPixels(raster,{...options,sampling:'smooth',curve:'asinh'},size));
 assert.equal(asinh[1],Math.round(255*Math.asinh(.25/.3)/Math.asinh(1/.3)));
});
test('smoothing excludes invalid intensities and retains the nearest sample mask exactly',()=>{
 const raster={width:2,height:1,values:new Float32Array([1e6,5]),valid:new Uint8Array([0,1])};
 const pixels=renderPixels(raster,{...options,sampling:'smooth'},{width:4,height:1});
 assert.deepEqual([...pixels],[39,49,64,255,39,49,64,255,128,128,128,255,128,128,128,255]);
});
test('rectangular resizing preserves row orientation and exact sample boundaries',()=>{
 const raster={width:2,height:3,values:new Float32Array([0,2,4,6,8,10]),valid:new Uint8Array(6).fill(1)};
 const pixels=renderPixels(raster,{...options,sampling:'pixels'},{width:6,height:9});
 for(let y=0;y<9;y++)for(let x=0;x<6;x++){
  assert.equal(pixels[(y*6+x)*4],Math.round(255*raster.values[Math.floor(y/3)*2+Math.floor(x/3)]!/10));
 }
});
test('detail leaves a constant field unchanged and cannot exceed its correction bound',()=>{
 const raster={width:9,height:9,values:new Float32Array(81).fill(3),valid:new Uint8Array(81).fill(1)};
 assert.deepEqual(detailValues(raster,{...options,detail:.5}),raster.values);
 raster.values[40]=20;
 const original=new Float32Array(raster.values),boosted=detailValues(raster,{...options,detail:.5});
 assert(boosted[40]!>original[40]!);
 for(let i=0;i<81;i++)assert(Math.abs(boosted[i]!-original[i]!)<=.400001);
 assert.deepEqual(raster.values,original);
 raster.valid[39]=0;
 assert.equal(detailValues(raster,{...options,detail:.5})[40],20,'Never sharpen across a missing sample');
 assert.equal(detailValues(raster,{...options,detail:0}),raster.values);
});
test('display work is bounded independently of zoom or device pixel ratio',()=>{
 const result=displaySize(8000,4000);
 assert.deepEqual(result,{width:MAX_DISPLAY_SIDE,height:MAX_DISPLAY_SIDE/2});
 assert.deepEqual(displaySize(440,220),{width:440,height:220});
 assert.throws(()=>displaySize(Infinity,100));
 const raster={width:1,height:1,values:new Float32Array([1]),valid:new Uint8Array([1])};
 for(const detail of [-1,.51,NaN])assert.throws(()=>renderPixels(raster,{...options,detail}));
 assert.throws(()=>renderPixels(raster,options,{width:10000,height:10000}));
});
