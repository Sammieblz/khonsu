"use client";

import { useState, type FormEvent } from "react";
import {useExplorer} from '@/features/explorer/ExplorerSession';
import { Icon } from "@/components/ui/Icon";
import type { AnnotationPanelProps, CandidateAnnotation, CandidateStorageState, ImageSelection, SequenceManifest } from "@/features/explorer/interfaces";
import { observationLabel } from "@/features/viewer/time";
import { CandidateList } from "./CandidateList";
import { downloadText } from "./download";
import { buildEvidence, evidenceFilename, evidenceJson } from "./evidence";
import { MAX_CANDIDATES, MAX_NOTE_LENGTH } from "./records";
import { formatSky, rasterToSky } from "./sky";
import styles from "./annotations.module.css";

function SelectionSummary({ selection, sequence }: { selection: ImageSelection; sequence: SequenceManifest }) {
  const index = sequence.frames.findIndex(frame => frame.frame_id === selection.frameId);
  const frame = sequence.frames[index];
  const sky = rasterToSky(sequence.grid, selection.x, selection.y);
  return <div className={styles.selection} aria-live="polite">
    <p>Grid pixel X {selection.x}, Y {selection.y} on observation {index + 1}, {observationLabel(frame?.observed_start_utc)}{frame?.observation_id ? ` (${frame.observation_id})` : ""}.</p>
    <p className={styles.sky}>{sky.ok ? `${formatSky(sky.ra_deg, sky.dec_deg)}, from the sequence's common grid.` : `Sky coordinates unavailable: ${sky.reason} The mark will keep its pixel position only.`}</p>
    {selection.pixelHasData === false && <p className={styles.warning}>{selection.pixelQuality==='warning-only'?'Warning-only sample: OUTLIER/OVERFLOW flags exclude this value from trusted measurements.':'No valid data at this pixel in this observation: it is masked or outside coverage.'} A mark here records a quality concern, not a measured source.</p>}
    {selection.pixelHasData === null && <p>This frame has no intensity data in the browser, so data validity at this pixel is unknown.</p>}
  </div>;
}

function StorageMessage({ storage, onStartFresh, onDownloadUnreadable }: { storage: CandidateStorageState; onStartFresh: () => void; onDownloadUnreadable: () => void }) {
  switch (storage.kind) {
    case "loading": return null;
    case "saved": return storage.preservedUnreadable
      ? <p className={styles.storage}>{storage.preservedUnreadable} saved {storage.preservedUnreadable === 1 ? "entry" : "entries"} could not be read by this version. {storage.preservedUnreadable === 1 ? "It is" : "They are"} kept unchanged in this browser and not shown.</p>
      : null;
    case "unavailable": return <p className={styles.storage} role="status">This browser is not allowing saved data, so candidates last only until you leave or reload this page.</p>;
    case "write-failed": return <p className={styles.storage} role="status">The latest change could not be saved in this browser. It remains on this page until you leave or reload it.</p>;
    case "too-large": return <p className={styles.storage} role="status">The candidate list is too large to save in this browser. Delete some candidates to resume saving; changes remain on this page until you leave.</p>;
    case "unreadable": return <div className={styles.storage} role="status">
      <p>{storage.reason} It has been left untouched. New candidates last only for this page visit until you choose what to do.</p>
      <span><button type="button" onClick={onDownloadUnreadable}>DOWNLOAD SAVED DATA</button><button type="button" onClick={onStartFresh}>REPLACE IT WITH THIS PAGE'S CANDIDATES</button></span>
    </div>;
  }
}

export function AnnotationPanel({
  sequence, selection, annotations, contexts, selectedCandidateId, storage, atCapacity,
  onAdd, onUpdate, onRemove, onSelectCandidate, onStartFresh, onDownloadUnreadable,
}: AnnotationPanelProps) {
  const {noteDraft:note,setNoteDraft:setNote}=useExplorer();
  const [exportMessage, setExportMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const current = annotations.filter(item => item.selection.sequenceId === sequence?.sequence_id);
  const others = annotations.filter(item => item.selection.sequenceId !== sequence?.sequence_id);
  const activeSelection = selection && sequence && selection.sequenceId === sequence.sequence_id ? selection : null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSelection || !note.trim() || atCapacity) return;
    onAdd(activeSelection, note);
    setNote("");
  }
  // Works from the candidates in memory, so damaged or blocked storage never prevents an export.
  function exportCandidates(items: CandidateAnnotation[]) {
    if (!items.length) return;
    const now = new Date().toISOString();
    const name = evidenceFilename(items, now);
    const saved = downloadText(name, evidenceJson(buildEvidence(items, contexts, now)));
    setExportMessage(saved
      ? `Downloaded ${name} with ${items.length} ${items.length === 1 ? "candidate" : "candidates"} and the observations behind ${items.length === 1 ? "it" : "them"}.`
      : "This browser blocked the download. Open the preview below and copy the evidence instead.");
  }
  function exportOne(id: string) {
    const item = annotations.find(candidate => candidate.id === id);
    if (item) exportCandidates([item]);
  }
  function framesFor(item: CandidateAnnotation) {
    if (sequence && item.selection.sequenceId === sequence.sequence_id) return contexts[sequence.sequence_id]?.frames ?? sequence.frames.map(frame => ({
      frame_id: frame.frame_id, observation_id: frame.observation_id ?? null, observed_start_utc: frame.observed_start_utc ?? null,
      observed_end_utc: frame.observed_end_utc ?? null, release: frame.release ?? null, detector: frame.detector ?? null,
      wavelength_um: frame.wavelength_um ?? null, bandwidth_um: frame.bandwidth_um ?? null, masked_fraction: frame.masked_fraction ?? 0,
      warning_fraction: frame.warning_fraction ?? 0,
      source_fits_url: frame.source_fits_url ?? null, warnings: [],
    }));
    return contexts[item.selection.sequenceId]?.frames ?? null;
  }
  return <section className={styles.panel} aria-labelledby="notes-title">
    <span className={styles.eyebrow}>03 / KEEP THE EVIDENCE</span>
    <h2 id="notes-title" tabIndex={-1}>Something worth a closer look?</h2>
    {activeSelection && sequence
      ? <SelectionSummary selection={activeSelection} sequence={sequence} />
      : <p className={styles.instructions}>Load an observation, choose Mark, then select a location to start a candidate note.</p>}
    <form onSubmit={submit}>
      <label htmlFor="candidate-note">Observation note</label>
      <textarea id="candidate-note" rows={3} maxLength={MAX_NOTE_LENGTH} placeholder="What changed? What might explain it?" value={note} onChange={event => setNote(event.target.value)} disabled={!activeSelection || atCapacity} />
      <button type="submit" disabled={!activeSelection || !note.trim() || atCapacity}><Icon name="mark" size={17} />SAVE CANDIDATE NOTE</button>
      {atCapacity && <p className={styles.storage}>This browser holds the maximum of {MAX_CANDIDATES} candidates. Delete some to add more.</p>}
    </form>
    {current.length
      ? <CandidateList annotations={current} framesFor={framesFor} selectedId={selectedCandidateId} onShow={id => onSelectCandidate(id === selectedCandidateId ? null : id)} onUpdate={onUpdate} onRemove={onRemove} onExport={exportOne} />
      : <p className={styles.empty}>No candidate notes for this sequence yet.</p>}
    {others.length > 0 && <details className={styles.others}>
      <summary>{others.length} {others.length === 1 ? "candidate" : "candidates"} saved from other sequences</summary>
      <p className={styles.instructions}>These marks belong to sequences that are not on screen, so they are not drawn on this image. Their positions and observation details are kept.</p>
      <CandidateList annotations={others} framesFor={framesFor} selectedId={null} onUpdate={onUpdate} onRemove={onRemove} onExport={exportOne} />
    </details>}
    <div className={styles.export}>
      <button type="button" disabled={!annotations.length} onClick={() => exportCandidates(annotations)}>EXPORT ALL SAVED CANDIDATES ({annotations.length})</button>
      {exportMessage && <p role="status">{exportMessage}</p>}
      <p>An evidence file holds each note, its grid and ICRS position, the observations compared, their real UTC times, release, wavelength, source FITS links, quality warnings and the search that reproduces the field.</p>
      {annotations.length > 0 && <details onToggle={event => setPreviewOpen(event.currentTarget.open)}>
        <summary>Preview the evidence file</summary>
        {previewOpen && <pre tabIndex={0} aria-label="Evidence file preview">{evidenceJson(buildEvidence(annotations, contexts, new Date().toISOString()))}</pre>}
      </details>}
    </div>
    <StorageMessage storage={storage} onStartFresh={onStartFresh} onDownloadUnreadable={onDownloadUnreadable} />
    <p className={styles.guidance}>Apparent movement or brightening can come from noise, detector artifacts, unmatched point spread functions or remaining registration error. Check the quality notes and other epochs before trusting a change.</p>
    <p className={styles.disclaimer}>Notes stay in this browser. A search link repeats the search but never includes notes; export an evidence file to share them. A candidate is an observation to investigate, not a confirmed discovery.</p>
  </section>;
}
