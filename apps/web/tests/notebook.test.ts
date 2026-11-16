import test from 'node:test';
import assert from 'node:assert/strict';
import {NotebookSync,readBackup,validDocument,type NotebookBackup,type NotebookDocument,type NotebookRecord,type DatabaseState} from '../src/features/annotations/notebook.ts';
import {serializeStore} from '../src/features/annotations/storage.ts';
import {emptyStore} from '../src/features/annotations/records.ts';
const doc=(text='test'):NotebookDocument=>({candidate_snapshot:serializeStore(emptyStore()),observation_notes:[{id:'test',text,created_at:'2026-11-16T03:00:00Z',updated_at:'2026-11-16T03:00:00Z',sequence:null,frame_id:null}]});
const backup=(dirty=false):NotebookBackup=>({key:'a'.repeat(64),revision:0,dirty,document:doc()});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('notebook rejects damaged storage and unrelated frame references',()=>{
 assert.throws(()=>readBackup('{broken'));assert.equal(validDocument({...doc(),observation_notes:[{...doc().observation_notes![0],frame_id:'missing'}]}),false);
 assert.deepEqual(readBackup(JSON.stringify(backup())),backup());
});
test('edits made while saving are queued with the new revision',async()=>{
 const writes:{revision:number;document:NotebookDocument;done:(value:NotebookRecord)=>void}[]=[],saved:NotebookBackup[]=[];
 const sync=new NotebookSync(backup(),{read:async()=>({revision:0,document:null}),write:(revision,document)=>new Promise(done=>writes.push({revision,document,done}))},b=>saved.push(b),()=>{},()=>{});
 await sync.connect();sync.update(doc('first'));sync.update(doc('latest'));assert.equal(writes.length,1);
 writes[0]!.done({revision:1,document:writes[0]!.document});await tick();assert.equal(writes.length,2);assert.equal(writes[1]!.revision,1);assert.equal(writes[1]!.document.observation_notes![0]!.text,'latest');
 writes[1]!.done({revision:2,document:writes[1]!.document});await tick();assert.equal(saved.at(-1)?.dirty,false);sync.close();
});
test('offline changes remain dirty and reconnect saves them',async()=>{
 let online=false,stored:NotebookRecord={revision:0,document:null};const states:DatabaseState[]=[];
 const sync=new NotebookSync(backup(),{read:async()=>{if(!online)throw Error('offline');return stored;},write:async(revision,document)=>stored={revision:revision+1,document}},()=>{},()=>{},s=>states.push(s));
 await sync.connect();sync.update(doc('keep this'));assert.equal(sync.backup.dirty,true);assert.equal(states.at(-1),'offline');online=true;await sync.connect();await tick();assert.equal(stored.document?.observation_notes![0]?.text,'keep this');assert.equal(states.at(-1),'saved');sync.close();
});
test('changed remote revision never silently overwrites dirty notes',async()=>{
 let writes=0,changed=0;const states:DatabaseState[]=[];
 const sync=new NotebookSync(backup(true),{read:async()=>({revision:4,document:doc('other tab')}),write:async(revision,document)=>{writes++;return {revision:revision+1,document};}},()=>{},()=>changed++,s=>states.push(s));
 await sync.connect();assert.equal(states.at(-1),'conflict');assert.equal(changed,0);assert.equal(writes,0);assert.equal(sync.backup.document.observation_notes![0]?.text,'test');
 await sync.connect('local');await tick();assert.equal(writes,1);assert.equal(sync.backup.revision,5);sync.close();
});
test('a clean local copy restores newer database data without writing it back',async()=>{
 let restored:NotebookDocument|null=null,writes=0;
 const sync=new NotebookSync(backup(),{read:async()=>({revision:3,document:doc('restored')}),write:async()=>{writes++;throw Error('unexpected');}},()=>{},d=>restored=d,()=>{});
 await sync.connect();assert.deepEqual(restored,doc('restored'));assert.equal(writes,0);sync.close();
});

test('choosing the database copy cannot discard an edit made while it loads',async()=>{
 let finish:(value:NotebookRecord)=>void=()=>{};const states:DatabaseState[]=[];let changed=0;
 const sync=new NotebookSync(backup(true),{read:()=>new Promise(resolve=>finish=resolve),write:async()=>{throw Error('unexpected write');}},()=>{},()=>changed++,s=>states.push(s));
 const reading=sync.connect('database');sync.update(doc('typed while loading'));finish({revision:4,document:doc('remote')});await reading;
 assert.equal(changed,0);assert.equal(states.at(-1),'conflict');assert.equal(sync.backup.document.observation_notes![0]?.text,'typed while loading');sync.close();
});

test('a rejected write keeps local changes pending for explicit recovery',async()=>{
 for(const [status,state] of [[409,'conflict'],[413,'full'],[422,'rejected'],[507,'full']] as const){
  const states:DatabaseState[]=[];
  const sync=new NotebookSync(backup(),{read:async()=>({revision:0,document:null}),write:async()=>{throw {status};}},()=>{},()=>{},s=>states.push(s));
  await sync.connect();sync.update(doc('retain this'));await tick();assert.equal(sync.backup.dirty,true);assert.equal(states.at(-1),state);sync.close();
 }
});
