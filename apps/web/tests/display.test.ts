import assert from 'node:assert/strict';
import test from 'node:test';
import {attachGapFill,attachRefinement,decodeRaster,renderPixels,detailValues,displaySize,measuredResolution,HD_DISPLAY_SIDE,MAX_DISPLAY_SIDE,MAX_DISPLAY_PIXELS} from '../src/features/viewer/display.ts';
const options={low:0,high:10,a:.3,gamma:1,curve:'linear' as const,mask:'quiet' as const};
test('refinement remains a separate visual copy and cannot add validity or change warnings',()=>{
 const original={width:4,height:1,values:new Float32Array([-3,2,9,0]),valid:new Uint8Array([1,1,0,0]),warning:new Uint8Array([0,0,1,0])};
 const buffer=new ArrayBuffer(20);new Float32Array(buffer,0,4).set([-2,3,0,0]);new Uint8Array(buffer,16).set([1,1,0,0]);
 const copy=decodeRaster(buffer,4,1,'float32-le-refined8-v1');assert.equal(copy.valid.some(Boolean),false);
 const refined=attachRefinement(original,copy),before=new Float32Array(original.values);
 assert.deepEqual(renderPixels(refined,options),renderPixels(original,options));
 assert.deepEqual(refined.valid,original.valid);
 const reduced=renderPixels(refined,{...options,low:-5,reduceGrain:true,includeWarnings:true});
 const source=renderPixels(original,{...options,low:-5,includeWarnings:true});
 assert.notEqual(reduced[0],source[0]);assert.equal(reduced[8],source[8]);
 assert.deepEqual(original.values,before);
 copy.refinedMask![2]=1;assert.throws(()=>attachRefinement(original,copy),/validity/);
});
test('soft highlights keep faint mapping and separate bright values above the white point',()=>{
 const raster={width:7,height:1,values:new Float32Array([-2,0,.1,.4,10,20,40]),valid:new Uint8Array(7).fill(1)};
 const regular=renderPixels(raster,{...options,curve:'asinh'}),soft=renderPixels(raster,{...options,curve:'asinh',softHighlights:true});
 assert.deepEqual([...soft.slice(0,16)],[...regular.slice(0,16)]);
 assert(soft[16]!<soft[20]!&&soft[20]!<soft[24]!&&soft[24]!<255);
 assert.equal(regular[16],255);assert.equal(regular[24],255);
 for(let i=4;i<7;i++){const mapped=Math.asinh(raster.values[i]!/10/.3)/Math.asinh(1/.3);assert.equal(soft[i*4],Math.round(255*(.65+.35*(-Math.expm1(-(mapped-.65)/.35)))));}
});
test('gap estimates never become validity, replace observations or affect original rendering',()=>{
 const original={width:20,height:1,values:new Float32Array(20).fill(5),valid:new Uint8Array(20).fill(1),warning:new Uint8Array(20)};
 original.valid[10]=0;original.warning[10]=1;original.values[10]=9;
 const buffer=new ArrayBuffer(100);new DataView(buffer).setFloat32(40,3,true);new Uint8Array(buffer,80)[10]=1;
 const fill=decodeRaster(buffer,20,1,'float32-le-estimate8-v1');assert.equal(fill.valid[10],0);
 const raster=attachGapFill(original,fill,.05),before=renderPixels(original,options);
 assert.deepEqual(renderPixels(raster,options),before);
 const clean=renderPixels(raster,{...options,cleanView:true});
 assert.equal(clean[40],77);assert.equal(original.values[10],9);assert.equal(raster.valid[10],0);
 assert.equal(renderPixels(raster,{...options,cleanView:true,includeWarnings:true})[40],230);
 for(let i=0;i<20;i++)if(i!==10)assert.equal(clean[i*4],before[i*4]);
 original.valid[10]=1;assert.throws(()=>attachGapFill(original,fill,.05),/overlaps/);
});
test('estimated smoothing cannot influence measured neighbors',()=>{
 const raster={width:2,height:1,values:new Float32Array([5,0]),valid:new Uint8Array([1,0]),estimated:new Uint8Array([0,1]),estimates:new Float32Array([0,10])};
 const original=renderPixels(raster,{...options,sampling:'smooth'},{width:8,height:1});
 const clean=renderPixels(raster,{...options,sampling:'smooth',cleanView:true},{width:8,height:1});
 assert.deepEqual(clean.slice(0,16),original.slice(0,16));
 assert(clean[24]!>original[24]!);
});
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
 assert.deepEqual(result,{width:HD_DISPLAY_SIDE,height:HD_DISPLAY_SIDE/2});
 assert.deepEqual(displaySize(440,220),{width:440,height:220});
 assert.throws(()=>displaySize(Infinity,100));
 const raster={width:1,height:1,values:new Float32Array([1]),valid:new Uint8Array([1])};
 for(const detail of [-1,.51,NaN])assert.throws(()=>renderPixels(raster,{...options,detail}));
 assert.throws(()=>renderPixels(raster,options,{width:10000,height:10000}));
});
test('quality v2 never lets warning samples contaminate strict pixels',()=>{
 const buffer=new ArrayBuffer(15);[5,10,1e6].forEach((v,i)=>new DataView(buffer).setFloat32(i*4,v,true));new Uint8Array(buffer,12).set([1,2,0]);
 assert.throws(()=>decodeRaster(buffer,3,1));
 const raster=decodeRaster(buffer,3,1,'float32-le-quality8-v2');
 assert.deepEqual([...raster.valid],[1,0,0]);assert.deepEqual([...raster.warning!],[0,1,0]);
 const strict=renderPixels(raster,{...options,mask:'subtle',sampling:'smooth'},{width:6,height:1});
 const shown=renderPixels(raster,{...options,mask:'subtle',sampling:'smooth',includeWarnings:true},{width:6,height:1});
 assert.deepEqual(shown.slice(0,8),strict.slice(0,8));
 assert.notDeepEqual(shown.slice(8,16),strict.slice(8,16));
 assert.deepEqual([...shown.slice(16)],[7,11,18,255,7,11,18,255]);
 assert.deepEqual([...raster.valid],[1,0,0]);
});
test('4K preserves aspect and bounds memory; adaptive never oscillates after a slow frame',()=>{
 assert.deepEqual(displaySize(7680,4320,MAX_DISPLAY_SIDE),{width:3840,height:2160});
 assert.deepEqual(displaySize(8000,8000,MAX_DISPLAY_SIDE),{width:2880,height:2880});
 for(const [w,h] of [[4000,3000],[3000,7000],[10000,1]]){
  const size=displaySize(w!,h!,MAX_DISPLAY_SIDE);assert(size.width*size.height<=MAX_DISPLAY_PIXELS);
  assert(Math.abs(size.width/size.height-w!/h!)<Math.max(1,w!/h!));
 }
 assert.equal(measuredResolution('checking','WebGL2',20),'4k');
 assert.equal(measuredResolution('4k','WebGL2',150),'hd');
 assert.equal(measuredResolution('hd','WebGL2',10),'hd');
 assert.equal(measuredResolution('4k','CPU worker',10),'hd');
});
