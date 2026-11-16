import test from 'node:test';
import assert from 'node:assert/strict';
import {observationStatus} from '../src/features/explorer/loading.ts';
import {describeFailure,type SequenceJob} from '../src/lib/api/client.ts';
const request={ra_deg:12,dec_deg:3,fov_arcmin:6},empty={phase:'empty' as const,sequenceId:null,frameId:null};
test('loading stages follow server evidence and never simulate a percentage',()=>{
 const submitting=observationStatus({phase:'running',request,job:null},false,'',null,empty);
 assert.equal(submitting?.progress,undefined);
 for(const status of ['queued','retrieving','processing','ready'] as const){
  const job={status,progress:.4,message:'Actual server stage'} as SequenceJob;
  const result=observationStatus({phase:'running',request,job},false,'',null,empty);
  assert.equal(result?.key,status);assert.equal(result?.progress,.4);assert.equal(result?.detail,job.message);
 }
 assert.equal(observationStatus({phase:'idle'},false,'','real',empty)?.key,'rendering');
 assert.equal(observationStatus({phase:'idle'},false,'','real',{phase:'ready',sequenceId:'real',frameId:'actual'}),null);
});
test('cancelled, unavailable, failed and no-coverage states remain actionable',()=>{
 assert.equal(observationStatus({phase:'cancelled',request},false,'',null,empty)?.busy,false);
 assert.equal(observationStatus({phase:'idle'},false,'Offline',null,empty)?.key,'example-failed');
 const guide=describeFailure('NO_COVERAGE');
 const result=observationStatus({phase:'failed',request,guide,code:'NO_COVERAGE',message:'No coverage',details:[]},false,'',null,empty);
 assert.equal(result?.busy,false);assert.equal(result?.retry,guide.retry);assert.match(result?.detail??'',/No coverage/);
});

test('archive failure exposes explicit cached recovery and server diagnostics without claiming a sequence',()=>{
 const guide=describeFailure('archive_unavailable'),details=['Archive stage: image search','Upstream HTTP status: 502'];
 const result=observationStatus({phase:'failed',request,guide,code:'archive_unavailable',message:'IRSA service unavailable',details},false,'',null,empty);
 assert.equal(result?.cachedExample,true);assert.equal(result?.retry,true);assert.equal(result?.busy,false);
 assert.deepEqual(result?.diagnostics,details);
 assert.equal(observationStatus({phase:'running',request,job:null},false,'',null,empty)?.cachedExample,undefined);
});
