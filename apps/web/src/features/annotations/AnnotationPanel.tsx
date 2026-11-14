"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import type { AnnotationPanelProps } from "@/features/explorer/interfaces";
import { pixelToSky } from "../viewer/wcs";
import { CandidateList } from "./CandidateList";
import { createEvidenceBundle } from "./model";
import styles from "./annotations.module.css";

export function AnnotationPanel({
  selection, annotations, onAdd, onRemove, sequence, request, comparisonFrameIds, storageWarning,
}: AnnotationPanelProps) {
  const [note, setNote] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const currentSelection = sequence && selection?.sequenceId === sequence.sequence_id
    && sequence.frames.some(frame => frame.frame_id === selection.frameId) ? selection : null;
  const sky = currentSelection && sequence ? pixelToSky(currentSelection, sequence.grid) : null;
  const currentAnnotations = sequence
    ? annotations.filter(item => item.selection.sequenceId === sequence.sequence_id) : [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentSelection || !note.trim()) return;
    onAdd(currentSelection, note);
    setNote("");
  }

  function exportEvidence(ids?: string[]) {
    if (!sequence) return;
    try {
      const selected = ids ? currentAnnotations.filter(item => ids.includes(item.id)) : currentAnnotations;
      const bundle = createEvidenceBundle(selected, { manifest: sequence, query: request, comparisonFrameIds });
      const filename = "khonsu-evidence-" + sequence.sequence_id.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2) + "\n"], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus("Downloaded " + filename + " with " + selected.length + " candidate note" + (selected.length === 1 ? "." : "s."));
    } catch {
      setExportStatus("The evidence file could not be downloaded. Your notes remain in this browser.");
    }
  }

  return <section className={styles.panel} aria-labelledby="notes-title">
    <span className={styles.eyebrow}>03 / KEEP THE EVIDENCE</span>
    <h2 id="notes-title">Something worth a closer look?</h2>
    <p className={styles.instructions} aria-live="polite">{currentSelection
      ? "Selected pixel " + currentSelection.x + ", " + currentSelection.y + " in frame " + currentSelection.frameId + "."
      : "Choose Mark in the loaded viewer, then select a location. Keyboard users can move the crosshair with arrow keys and press Enter."}</p>
    {currentSelection && <p className={styles.coordinates}>{sky
      ? "ICRS / RA " + sky.raDeg.toFixed(7) + "° / Dec " + sky.decDeg.toFixed(7) + "°"
      : "PIXEL POSITION ONLY / supported celestial WCS unavailable"}</p>}
    {sequence?.data_mode === "synthetic" && <p className={styles.warning} role="note">SYNTHETIC DEVELOPMENT DATA. These marks are practice notes, not NASA observations.</p>}
    {storageWarning && <p className={styles.warning} role="status">{storageWarning}</p>}
    <form onSubmit={submit}>
      <label htmlFor="candidate-note">Observation note</label>
      <textarea id="candidate-note" rows={3} maxLength={500} placeholder="What changed? What might explain it?"
        value={note} onChange={event => setNote(event.target.value)} disabled={!currentSelection}
        aria-describedby="candidate-guidance"
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} />
      <button type="submit" disabled={!currentSelection || !note.trim()}><Icon name="mark" size={17} />SAVE CANDIDATE NOTE</button>
    </form>
    <p id="candidate-guidance" className={styles.instructions}>Record uncertainty and possible artifacts. Check alignment, wavelength, masks, background, and point spread function before interpreting movement or brightness.</p>
    <CandidateList annotations={currentAnnotations} onRemove={onRemove} onExport={id => exportEvidence([id])} />
    <button type="button" className={styles.exportButton} disabled={!sequence || !currentAnnotations.length}
      onClick={() => exportEvidence()}>EXPORT ALL NOTES ({currentAnnotations.length})</button>
    <p className={styles.exportStatus} role="status">{exportStatus}</p>
    <details className={styles.exportDetails}>
      <summary>What is in an evidence file?</summary>
      <p>The JSON file keeps notes, image and sky positions when available, actual observation dates, source URLs, wavelength context, masks, display settings, output WCS, the original query, and A/B frame identities. Each new note retains its capture-time manifest. Synthetic data stays explicitly labelled.</p>
      <p>Images are referenced, not embedded in this JSON record. Prepared image URLs may expire; source FITS links and processing settings help reproduce the view. A query link does not include your private notes.</p>
    </details>
    <p className={styles.disclaimer}>Human-marked, unreviewed candidates. A mark is a lead to investigate, not a confirmed discovery. Notes stay in this browser unless you export them.</p>
  </section>;
}
