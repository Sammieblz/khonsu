import test from 'node:test';
import assert from 'node:assert/strict';
import {readConsoleRoute,exampleLink,consoleLink} from '../src/features/explorer/routes.ts';
import {fittedImage,fillImage,boundedImageView,visibleImageField,zoomImageAt,clientPointToRaster} from '../src/features/viewer/viewport.ts';

test('console links distinguish saved examples from explicit coordinate searches',()=>{
  assert.deepEqual(readConsoleRoute('?example=real-wise-0855&obs=first'),{kind:'example',id:'real-wise-0855',observation:'first'});
  assert.equal(readConsoleRoute('?example=../../secret').kind,'invalid');
  assert.equal(readConsoleRoute('?example=real-wise-0855&ra_deg=12&dec_deg=3').kind,'invalid');
  const link=consoleLink({ra_deg:359.9,dec_deg:-89.9,fov_arcmin:12},'obs_1');
  const restored=readConsoleRoute(link.slice(link.indexOf('?')));assert.equal(restored.kind,'ok');
  if(restored.kind==='ok')assert.equal(restored.search.values.ra_deg,359.9);
  assert.match(exampleLink('real-wise-0855','obs_1',true),/embed=1/);
});
test('fitting preserves the complete field; fill crops without stretching',()=>{
  for(const [rw,rh] of [[100,100],[200,100],[100,200]])for(const [w,h] of [[970,500],[390,320],[1500,800]]){
    const g={stageWidth:w,stageHeight:h,rasterWidth:rw,rasterHeight:rh},fit=fittedImage(g);
    assert.ok(Math.abs(fit.width/fit.height-rw/rh)<1e-10);
    assert.ok(fit.width<=w+1e-8&&fit.height<=h+1e-8);
    const full=visibleImageField({zoom:1,x:0,y:0},g);assert.equal(full.width,1);assert.equal(full.height,1);
    const filled=fillImage(g);assert.ok(fit.width*filled.zoom>=w-1e-8&&fit.height*filled.zoom>=h-1e-8);
    const moved=boundedImageView({...filled,x:1e5,y:-1e5},g),region=visibleImageField(moved,g);
    assert.ok(region.left>=0&&region.top>=0&&region.left+region.width<=1+1e-8&&region.top+region.height<=1+1e-8);
    const center=clientPointToRaster(w/2,h/2,fit,rw,rh);assert.deepEqual(center,{x:Math.floor(rw/2),y:Math.floor(rh/2)});
    if(fit.left>0)assert.equal(clientPointToRaster(0,h/2,fit,rw,rh),null);
    const zoomed=zoomImageAt({zoom:1,x:0,y:0},2,0,0,g);assert.equal(zoomed.zoom,2);
  }
});
