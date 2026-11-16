import assert from 'node:assert/strict';
import test from 'node:test';
import { timePositions, nearestObservation, frameWindow } from '../src/features/viewer/time.ts';
import { boundedImageView, zoomImageAt, clientPointToRaster } from '../src/features/viewer/viewport.ts';
test('time spacing preserves long gaps and duplicate epochs without inventing frames',()=>{
  const positions=timePositions(['2025-01-01','2025-01-02','2025-01-02','2025-01-11']);
  assert.deepEqual(positions,[0,.1,.1,1]);
  assert.equal(nearestObservation(positions,.2),1);assert.equal(nearestObservation(positions,.9),3);
  assert.deepEqual(timePositions([null,null,null]),[0,.5,1]);
});
test('frame prefetch stays within five images with A/B pins',()=>{
  assert.deepEqual(frameWindow(96,50,[0,95]),[50,49,51,0,95]);
  assert.deepEqual(frameWindow(2,0,[0,1]),[0,1]);
});
test('zoom anchors retain the selected raster location and fit bounds stop lost fields',()=>{
  const geometry={stageWidth:400,stageHeight:200,rasterWidth:400,rasterHeight:200};
  const next=zoomImageAt({zoom:1,x:0,y:0},2,100,50,geometry);
  assert.deepEqual(next,{zoom:2,x:-100,y:-50});
  const point=clientPointToRaster(300,150,{left:-300,top:-150,width:800,height:400},100,50);
  assert.deepEqual(point,{x:75,y:37});
  assert.deepEqual(boundedImageView({zoom:.5,x:900,y:900},geometry),{zoom:1,x:0,y:0});
});
