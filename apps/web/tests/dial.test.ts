import test from 'node:test';
import assert from 'node:assert/strict';
import {dialFraction,dialPoint} from '../src/features/viewer/dial.ts';
import {nearestObservation} from '../src/features/viewer/time.ts';
test('pointer hit area agrees with visible ticks at narrow and wide widths',()=>{
 for(const width of [280,970,1500])for(const fraction of [0,.14,.51,1]){
  const point=dialPoint(fraction,width,44),hit=dialFraction(20+point.x,20,width);assert.ok(Math.abs(hit-fraction)<1e-12);
 }
});
test('dragging past the ends selects real boundary observations',()=>{
 const positions=[0,.25,1];assert.equal(nearestObservation(positions,dialFraction(-100,0,400)),0);assert.equal(nearestObservation(positions,dialFraction(800,0,400)),2);assert.equal(dialFraction(2,0,0),0);
});
