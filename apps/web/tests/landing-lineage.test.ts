import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
test('landing previews retain exact genuine pixels, timestamps and source identifiers',()=>{
 const data=read('../src/features/explorer/landing-data.json'),source=read('../../../fixtures/real/real-wise-0855/manifest.json');
 assert.equal(data.sequence_id,source.sequence_id);assert.equal(data.frame_count,source.frames.length);
 for(const preview of data.frames){const frame=source.frames.find((f:{frame_id:string})=>f.frame_id===preview.frame_id);assert.ok(frame);for(const key of ['observed_start_utc','observation_id','release','source_fits_url','wavelength_um'])assert.equal(preview[key],frame[key]);
  const bytes=readFileSync(new URL('../public'+preview.image_url,import.meta.url));
  const original=readFileSync(new URL('../../../fixtures/real/real-wise-0855/'+preview.frame_id+'.png',import.meta.url));
  assert.deepEqual(bytes,original);assert.equal(createHash('sha256').update(bytes).digest('hex'),preview.sha256);
 }
});
test('all five historical target labels agree with the dated coverage report',()=>{
 const data=read('../src/features/explorer/landing-data.json'),source=read('../../../docs/target-coverage.json');assert.equal(data.checked_at_utc,source.checked_at_utc);assert.equal(data.targets.length,5);
 for(const target of data.targets){const original=source.targets.find((t:{preset_id:string})=>t.preset_id===target.preset_id);assert.ok(original);for(const key of Object.keys(target))assert.equal(target[key],original[key]);}
});
