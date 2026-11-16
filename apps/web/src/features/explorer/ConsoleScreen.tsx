'use client';
import Link from 'next/link';
import {useEffect} from 'react';
import {Dialog} from '@base-ui/react/dialog';
import {useExplorer} from './ExplorerSession';
import {SkyViewer} from '@/features/viewer/SkyViewer';
import {AnnotationPanel} from '@/features/annotations/AnnotationPanel';
import {ShareField} from '@/features/context/ShareField';
import {CoordinateForm} from './CoordinateForm';
import {TargetPresets} from './TargetPresets';
import {CachedExamplePicker,SearchStatus} from './SearchStatus';
import styles from './console.module.css';
import {ObservationFeedback} from './ObservationFeedback';
import {observationStatus} from './loading';
export function ConsoleScreen(){
  const s=useExplorer();
  useEffect(()=>{document.getElementById('observatory-title')?.focus({preventScroll:true});if(new URLSearchParams(window.location.search).has('field'))window.dispatchEvent(new Event('khonsu:field'));},[]);
  const status=observationStatus(s.search,s.exampleLoading,s.exampleError,s.sequence?.sequence_id??null,s.presentation);
  const feedback=status?<ObservationFeedback status={status} onCancel={s.cancelLoading} onRetry={()=>s.search.phase==='failed'||s.search.phase==='cancelled'?s.retrySearch():void s.loadExample(new URLSearchParams(window.location.search).get('example')??s.selectedExampleId)} onEdit={s.editSearch}/>:null;
  const field=<><CoordinateForm target={s.selectedTarget} shared={s.sharedLink} onSubmit={request=>void s.submit(request)} busy={s.search.phase==='running'}/><TargetPresets targets={s.targets} selected={s.selectedTarget?.preset_id} error={s.catalogError} onChoose={target=>s.setSelectedTarget({...target})}/><SearchStatus state={s.search} canLoadExample={s.examples.length>0} onCancel={s.cancelSearch} onRetry={s.retrySearch} onEditSearch={s.editSearch} onLoadExample={()=>void s.loadExample()}/><CachedExamplePicker examples={s.examples} selectedId={s.selectedExampleId} onSelect={s.setSelectedExampleId} error={s.exampleError} loading={s.examplesLoading} onLoad={()=>void s.loadExample()}/>{s.exampleLoading&&<p role="status">Opening saved observations... <button onClick={s.cancelExample}>CANCEL</button></p>}</>;
  const notes=<AnnotationPanel sequence={s.sequence} selection={s.selection} annotations={s.candidates.annotations} contexts={s.candidates.contexts} selectedCandidateId={s.selectedCandidateId} storage={s.candidates.storage} atCapacity={s.candidates.atCapacity} onAdd={s.addCandidate} onUpdate={s.candidates.updateNote} onRemove={s.removeCandidate} onSelectCandidate={s.selectCandidate} onStartFresh={s.candidates.startFresh} onDownloadUnreadable={s.downloadUnreadable}/>;
  return <main className={styles.shell} data-console data-embed={s.compact}>
    <a className="skip-link" href="#observation-canvas">Skip to observation image</a>
    <header className={styles.header}><Link href="/" aria-label="Khonsu home"><img src="/khonsu-mark.svg" alt=""/>KHONSU</Link><span id="observatory-title" tabIndex={-1} className={styles.fieldTitle}>{s.sequence?.title??'YOUR OBSERVATORY'}</span><nav aria-label="Console navigation">
      <Dialog.Root><Dialog.Trigger disabled={!s.sequence}>SHARE</Dialog.Trigger><Dialog.Portal><Dialog.Backdrop className={styles.dialogBackdrop}/><Dialog.Popup className={styles.dialog}><div className={styles.dialogHeader}><Dialog.Title>Share your sky field</Dialog.Title><Dialog.Close>CLOSE</Dialog.Close></div>{s.sequence&&<ShareField sequence={s.sequence} activeFrameId={s.activeFrameId}/>}</Dialog.Popup></Dialog.Portal></Dialog.Root>
      <Dialog.Root><Dialog.Trigger>HELP</Dialog.Trigger><Dialog.Portal><Dialog.Backdrop className={styles.dialogBackdrop}/><Dialog.Popup className={styles.dialog}><div className={styles.dialogHeader}><Dialog.Title>Pause. Compare. Notice.</Dialog.Title><Dialog.Close>CLOSE</Dialog.Close></div><p>Rewind selects real observation dates. Pan moves the view. Inspect explains pixel quality. Mark records a candidate note.</p><p>On the image: arrows operate the selected tool, Space plays or pauses, + and - zoom, 0 fits the field, and Enter records a Mark selection.</p><p>Clean View can visually estimate gaps. Mark uses original measurements. Check quality and compare dates before interpreting a change.</p><Link href="/#guide">OPEN THE FIELD GUIDE</Link></Dialog.Popup></Dialog.Portal></Dialog.Root>
    </nav></header><SkyViewer sequence={s.sequence} activeFrameId={s.activeFrameId} annotations={s.candidates.annotations} selectedCandidateId={s.selectedCandidateId} onFrameChange={s.setActiveFrameId} onSelect={s.setSelection} fieldPanel={field} notesPanel={notes} loadingFeedback={feedback} onPresentationState={s.setPresentation}/>
  </main>;
}
