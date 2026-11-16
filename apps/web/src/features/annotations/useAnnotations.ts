"use client";
import {useEffect,useRef,useState} from 'react';
import type {CandidateStorageState,ImageSelection,SequenceContext,SequenceManifest} from '@/features/explorer/interfaces';
import {notebookTransport} from '@/lib/api/client';
import {addCandidate,createCandidate,emptyStore,MAX_CANDIDATES,removeCandidate,updateCandidateNote,type CandidateStore} from './records';
import {LEGACY_KEY,loadStore,MAX_STORE_CHARS,serializeStore,STORE_KEY} from './storage';
import {NOTEBOOK_KEY,NotebookSync,readBackup,type NotebookBackup,type NotebookDocument,type ObservationNote,type DatabaseState} from './notebook';
export function useAnnotations(){
 const [store,setStore]=useState<CandidateStore>(emptyStore),[notes,setNotes]=useState<ObservationNote[]>([]);
 const [storage,setStorage]=useState<CandidateStorageState>({kind:'loading'}),[database,setDatabase]=useState<DatabaseState>('local-only');
 const current=useRef({store,notes}),sync=useRef<NotebookSync|null>(null),unreadable=useRef<string|null>(null),writable=useRef(false);
 function apply(document:NotebookDocument){const loaded=loadStore(document.candidate_snapshot,null);if(!loaded.ok)return;current.current={store:loaded.store,notes:document.observation_notes??[]};setStore(loaded.store);setNotes(document.observation_notes??[]);}
 function persist(backup:NotebookBackup){
  if(!writable.current)return;const raw=JSON.stringify(backup);
  if(raw.length>4_000_000||backup.document.candidate_snapshot.length>MAX_STORE_CHARS){setStorage({kind:'too-large'});return;}
  try{localStorage.setItem(NOTEBOOK_KEY,raw);localStorage.setItem(STORE_KEY,backup.document.candidate_snapshot);setStorage({kind:'saved',preservedUnreadable:current.current.store.unreadable.length});}catch{setStorage({kind:'write-failed'});}
 }
 function start(backup:NotebookBackup){sync.current?.close();writable.current=true;const client=new NotebookSync(backup,notebookTransport(backup.key),persist,apply,setDatabase);sync.current=client;apply(backup.document);persist(backup);void client.connect();}
 useEffect(()=>{
  try{
   const raw=localStorage.getItem(NOTEBOOK_KEY);
   if(raw){try{start(readBackup(raw));}catch{unreadable.current=raw;setStorage({kind:'unreadable',reason:'This notebook backup could not be read. It has been kept unchanged.'});}return()=>{sync.current?.close();sync.current=null;writable.current=false;};}
   const candidateRaw=localStorage.getItem(STORE_KEY),loaded=loadStore(candidateRaw,candidateRaw===null?localStorage.getItem(LEGACY_KEY):null);
   if(!loaded.ok){unreadable.current=candidateRaw;setStorage({kind:'unreadable',reason:loaded.reason});return;}
   const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
   const backup={key,revision:0,dirty:loaded.store.candidates.length>0||loaded.store.unreadable.length>0,document:{candidate_snapshot:serializeStore(loaded.store),observation_notes:[]}};
   // Save the recovery key before any upload. Blocked storage stays local.
   localStorage.setItem(NOTEBOOK_KEY,JSON.stringify(backup));start(backup);
  }catch{setStorage({kind:'unavailable'});}
  return()=>{sync.current?.close();sync.current=null;writable.current=false;};
 },[]);
 function change(next:{store:CandidateStore;notes:ObservationNote[]}){current.current=next;setStore(next.store);setNotes(next.notes);sync.current?.update({candidate_snapshot:serializeStore(next.store),observation_notes:next.notes});}
 function add(selection:ImageSelection,note:string,context:SequenceContext|null){const c=current.current;change({...c,store:addCandidate(c.store,createCandidate(selection,note,context,crypto.randomUUID(),new Date().toISOString()),context)});}
 function updateNote(id:string,note:string){const c=current.current;change({...c,store:updateCandidateNote(c.store,id,note,new Date().toISOString())});}
 function remove(id:string){const c=current.current;change({...c,store:removeCandidate(c.store,id)});}
 function addNote(text:string,sequence:SequenceManifest|null,frameId:string|null){
  if(!text.trim()||current.current.notes.length>=200)return;const now=new Date().toISOString();
  const note:ObservationNote={id:crypto.randomUUID(),text:text.trim().slice(0,2000),created_at:now,updated_at:now,sequence,frame_id:sequence?frameId:null};
  change({...current.current,notes:[...current.current.notes,note]});
 }
 function editNote(id:string,text:string){if(!text.trim())return;change({...current.current,notes:current.current.notes.map(n=>n.id===id?{...n,text:text.trim().slice(0,2000),updated_at:new Date().toISOString()}:n)});}
 function deleteNote(id:string){change({...current.current,notes:current.current.notes.filter(n=>n.id!==id)});}
 function startFresh(){
  const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  const backup={key,revision:0,dirty:true,document:{candidate_snapshot:serializeStore(current.current.store),observation_notes:current.current.notes}};
  try{localStorage.setItem(NOTEBOOK_KEY,JSON.stringify(backup));start(backup);unreadable.current=null;}
  catch{setStorage({kind:'write-failed'});}
 }
 return{annotations:store.candidates,contexts:store.sequences,storage,database,notes,atCapacity:store.candidates.length>=MAX_CANDIDATES,unreadableData:()=>unreadable.current,add,updateNote,remove,startFresh,addNote,editNote,deleteNote,retryDatabase:()=>void sync.current?.connect(),keepLocal:()=>void sync.current?.connect('local'),loadDatabase:()=>void sync.current?.connect('database')};
}
