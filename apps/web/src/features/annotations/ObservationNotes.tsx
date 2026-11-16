'use client';
import {useState} from 'react';
import {useExplorer} from '@/features/explorer/ExplorerSession';
import {observationLabel} from '@/features/viewer/time';
import {buildEvidence} from './evidence';
import {downloadText} from './download';
import styles from './annotations.module.css';
export function ObservationNotes(){
 const {candidates:c}=useExplorer(),[editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState(''),[message,setMessage]=useState('');
 const states={connecting:'Checking your saved notebook...',saving:'Saving to your notebook...',saved:'Notebook connected. Saved changes are backed up.',offline:'Database unavailable. Keep this page open if your browser copy could not be saved.',conflict:'Another tab saved a different copy. Your changes are still here. Export before choosing a copy.',full:'Notebook storage is full. Export and remove older entries, then retry.',rejected:'The service could not accept this notebook. Export your page copy before retrying.', 'local-only':'Notes are available for this visit. Export to keep them.'};
 function exportNotes(id?:string){const notes=id?c.notes.filter(n=>n.id===id):c.notes;const success=downloadText(`khonsu-notebook-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({format:'khonsu-notebook-export',version:1,exported_at:new Date().toISOString(),notice:'Human notes, not detections. General observation notes do not identify a pixel or source.',notes,candidate_evidence:id?null:buildEvidence(c.annotations,c.contexts,new Date().toISOString())},null,2));setMessage(success?'Notebook file downloaded.':'Download blocked. Allow downloads in your browser and try again.');}
 return <div className={styles.notebook}>
  <p role="status" data-notebook-state={c.database}>{states[c.database]}</p>
  {['offline','full','rejected'].includes(c.database)&&<button onClick={c.retryDatabase}>RETRY NOTEBOOK SAVE</button>}
  {c.database==='conflict'&&<div className={styles.noteTools}><button onClick={c.keepLocal}>KEEP THIS PAGE'S COPY</button><button onClick={()=>{if(window.confirm('Replace this page with the database copy? Export this page first to keep both.'))c.loadDatabase();}}>LOAD DATABASE COPY</button></div>}
  <button type="button" disabled={!c.notes.length&&!c.annotations.length} onClick={()=>exportNotes()}>EXPORT NOTEBOOK ({c.notes.length+c.annotations.length})</button>
  {message&&<p role="status">{message}</p>}
  {c.notes.length>0&&<h3>Observation notes ({c.notes.length})</h3>}
  <ul className={styles.observationNotes}>{[...c.notes].reverse().map((note,i)=>{
   const frame=note.sequence?.frames.find(f=>f.frame_id===note.frame_id),number=c.notes.length-i;
   return <li key={note.id} data-observation-note={note.id}>
    <strong>{note.sequence?.title??'Workspace note'}</strong><small>{frame?observationLabel(frame.observed_start_utc):'No observation attached'}</small>
    {editing===note.id?<form onSubmit={event=>{event.preventDefault();c.editNote(note.id,draft);setEditing(null);}}><label htmlFor={'edit-note-'+note.id}>Edit observation note {number}</label><textarea id={'edit-note-'+note.id} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} rows={4} autoFocus/><div className={styles.noteTools}><button disabled={!draft.trim()}>SAVE CHANGES</button><button type="button" onClick={()=>setEditing(null)}>CANCEL EDIT</button></div></form>:<p>{note.text}</p>}
    <div className={styles.noteTools}><button aria-label={`Edit observation note ${number}`} onClick={()=>{setDraft(note.text);setEditing(note.id);}}>EDIT</button><button aria-label={`Export observation note ${number}`} onClick={()=>exportNotes(note.id)}>EXPORT</button><button aria-label={`Delete observation note ${number}`} onClick={()=>{if(window.confirm('Delete this observation note from your notebook?'))c.deleteNote(note.id);}}>DELETE</button></div>
   </li>;
  })}</ul>
 </div>;
}
