import type {components} from '../../lib/api/generated';
import {loadStore} from './storage.ts';
export type NotebookDocument=components['schemas']['NotebookDocument'];
export type NotebookRecord=components['schemas']['NotebookRecord'];
export type ObservationNote=components['schemas']['ObservationNote'];
export const NOTEBOOK_KEY='khonsu.notebook.v1';
export interface NotebookBackup {key:string;revision:number;dirty:boolean;document:NotebookDocument;}
export type DatabaseState='connecting'|'saved'|'saving'|'offline'|'conflict'|'full'|'rejected'|'local-only';
export interface NotebookTransport {read():Promise<NotebookRecord>;write(revision:number,document:NotebookDocument):Promise<NotebookRecord>;}
export function validDocument(value:unknown):value is NotebookDocument {
 if(!value||typeof value!=='object')return false;
 const d=value as NotebookDocument;
 if(typeof d.candidate_snapshot!=='string'||!loadStore(d.candidate_snapshot,null).ok||!Array.isArray(d.observation_notes)||d.observation_notes.length>200)return false;
 return new Set(d.observation_notes.map(n=>n?.id)).size===d.observation_notes.length&&d.observation_notes.every(n=>{
  if(!n||typeof n.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(n.id)||typeof n.text!=='string'||!n.text.trim()||n.text.length>2000||!Number.isFinite(Date.parse(n.created_at))||!Number.isFinite(Date.parse(n.updated_at)))return false;
  return n.sequence==null?n.frame_id==null:typeof n.sequence.sequence_id==='string'&&Array.isArray(n.sequence.frames)&&n.sequence.frames.length<=96&&n.sequence.frames.every(f=>f&&typeof f.frame_id==='string')&&(!n.frame_id||n.sequence.frames.some(f=>f.frame_id===n.frame_id));
 });
}
export function readBackup(raw:string):NotebookBackup {
 if(raw.length>4_000_000)throw Error('Notebook backup exceeds its size limit.');
 const b=JSON.parse(raw) as NotebookBackup;
 if(!b||!/^[a-f0-9]{64}$/.test(b.key)||!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.dirty!=='boolean'||!validDocument(b.document))throw Error('This notebook backup could not be read. It has been kept unchanged.');
 return b;
}
/** Serial writes and optimistic revisions protect edits made during slow requests. */
export class NotebookSync {
 backup:NotebookBackup;
 private transport:NotebookTransport;private persist:(value:NotebookBackup)=>void;private changed:(document:NotebookDocument)=>void;private report:(state:DatabaseState)=>void;
 private busy=false;private connected=false;private disposed=false;private generation=0;
 constructor(backup:NotebookBackup,transport:NotebookTransport,persist:(value:NotebookBackup)=>void,changed:(document:NotebookDocument)=>void,report:(state:DatabaseState)=>void){this.backup=backup;this.transport=transport;this.persist=persist;this.changed=changed;this.report=report;}
 close(){this.disposed=true;}
 update(document:NotebookDocument){this.backup={...this.backup,document,dirty:true};this.generation++;this.persist(this.backup);void this.flush();}
 async connect(choice?:'local'|'database'){
  if(this.busy||this.disposed)return;this.busy=true;this.report('connecting');const generation=this.generation;
  try{
   const remote=await this.transport.read();if(this.disposed)return;
   if(!Number.isSafeInteger(remote.revision)||remote.revision<0||(remote.document!==null&&!validDocument(remote.document)))throw Error('Invalid notebook response');
   if(choice==='database'){
    if(generation!==this.generation){this.report('conflict');this.connected=false;return;}
    if(!remote.document)throw Error('The database has no saved copy.');
    this.backup={...this.backup,revision:remote.revision,document:remote.document,dirty:false};this.changed(remote.document);
   }else if(choice==='local'){this.backup={...this.backup,revision:remote.revision,dirty:true};}
   else if(remote.revision!==this.backup.revision){
    if(this.backup.dirty){this.report('conflict');this.connected=false;return;}
    if(remote.document){this.backup={...this.backup,revision:remote.revision,document:remote.document,dirty:false};this.changed(remote.document);}
    else {this.backup={...this.backup,revision:0,dirty:true};}
   }
   this.connected=true;this.persist(this.backup);this.report(this.backup.dirty?'saving':'saved');
  }catch{if(!this.disposed){this.connected=false;this.report('offline');}}
  finally{this.busy=false;if(!this.disposed&&this.connected)void this.flush();}
 }
 private async flush(){
  if(this.busy||!this.connected||!this.backup.dirty||this.disposed)return;this.busy=true;
  try{
   while(this.backup.dirty&&!this.disposed){
    this.report('saving');const generation=this.generation;
    const result=await this.transport.write(this.backup.revision,this.backup.document);if(this.disposed)return;
    if(result.revision!==this.backup.revision+1)throw Error('Invalid revision');
    this.backup={...this.backup,revision:result.revision,dirty:generation!==this.generation};this.persist(this.backup);
   }
   if(!this.disposed)this.report('saved');
  }catch(error){if(!this.disposed){this.connected=false;const status=(error as {status?:number}).status;this.report(status===409?'conflict':status===413||status===507?'full':status===422?'rejected':'offline');}}
  finally{this.busy=false;}
 }
}
