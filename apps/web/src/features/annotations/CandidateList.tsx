"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import type { CandidateAnnotation, FrameSummary } from "@/features/explorer/interfaces";
import { observationLabel } from "@/features/viewer/time";
import { MAX_NOTE_LENGTH } from "./records";
import { formatSky } from "./sky";
import styles from "./annotations.module.css";

interface CandidateListProps {
  annotations: CandidateAnnotation[];
  /** Frames of each candidate's sequence, when known. */
  framesFor: (annotation: CandidateAnnotation) => FrameSummary[] | null;
  selectedId: string | null;
  /** Show the candidate on the image; omitted for candidates from other sequences. */
  onShow?: (id: string) => void;
  onUpdate: (id: string, note: string) => void;
  onRemove: (id: string) => void;
  onExport: (id: string) => void;
}

function frameName(frames: FrameSummary[] | null, frameId: string): string {
  const index = frames?.findIndex(frame => frame.frame_id === frameId) ?? -1;
  if (!frames || index < 0) return `frame ${frameId}`;
  return `observation ${index + 1}, ${observationLabel(frames[index]!.observed_start_utc)}`;
}

export function CandidateList({ annotations, framesFor, selectedId, onShow, onUpdate, onRemove, onExport }: CandidateListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Return focus to a control that still exists, so keyboard users keep their place.
  function closeEditor(id: string) {
    setEditing(null);
    requestAnimationFrame(() => document.getElementById(`candidate-edit-${id}`)?.focus());
  }
  function save(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (!draft.trim()) return;
    onUpdate(id, draft);
    closeEditor(id);
  }
  function remove(id: string) {
    onRemove(id);
    requestAnimationFrame(() => document.getElementById("notes-title")?.focus());
  }
  return <ul className={styles.candidateList}>{annotations.map((item, index) => {
    const frames = framesFor(item), number = String(index + 1).padStart(2, "0");
    const { comparison } = item.selection;
    return <li key={item.id} aria-current={item.id === selectedId ? "true" : undefined} className={item.id === selectedId ? styles.selected : undefined}>
      <div className={styles.candidateHeading}>
        <span className={styles.candidateNumber}>CANDIDATE {number}</span>
        <span className={styles.candidateActions}>
          {onShow && <button type="button" onClick={() => onShow(item.id)} aria-label={`Show candidate ${number} on the image`}>SHOW</button>}
          <button id={`candidate-edit-${item.id}`} type="button" onClick={() => { setEditing(item.id); setDraft(item.note); }} aria-label={`Edit the note for candidate ${number}`}>EDIT</button>
          <button type="button" onClick={() => onExport(item.id)} aria-label={`Export candidate ${number} as an evidence file`}>EXPORT</button>
          <button type="button" aria-label={`Delete candidate ${number}`} onClick={() => remove(item.id)}><Icon name="close" size={16} /></button>
        </span>
      </div>
      {editing === item.id
        ? <form className={styles.editForm} onSubmit={event => save(event, item.id)}>
            <label htmlFor={`edit-${item.id}`}>Note for candidate {number}</label>
            <textarea id={`edit-${item.id}`} rows={3} maxLength={MAX_NOTE_LENGTH} value={draft} onChange={event => setDraft(event.target.value)} autoFocus />
            <span><button type="submit" disabled={!draft.trim()}>SAVE NOTE</button><button type="button" onClick={() => closeEditor(item.id)}>CANCEL</button></span>
          </form>
        : <p>{item.note}</p>}
      <span className={styles.coordinates}>
        {item.sky ? `${formatSky(item.sky.ra_deg, item.sky.dec_deg)}, degrees` : `PIXEL POSITION ONLY: ${item.skyUnavailableReason ?? "no sky coordinates."}`}<br />
        GRID X {item.selection.x} / Y {item.selection.y} (zero-based, top-left) / MARKED ON {frameName(frames, item.selection.frameId).toUpperCase()}
        {comparison && <><br />COMPARING A: {frameName(frames, comparison.aFrameId).toUpperCase()} / B: {frameName(frames, comparison.bFrameId).toUpperCase()}</>}
        {item.selection.pixelHasData === false && <><br /><strong>NO VALID DATA AT THIS PIXEL IN THE MARKED OBSERVATION</strong></>}
        {item.updatedAt !== item.createdAt && <><br />NOTE EDITED {observationLabel(item.updatedAt).toUpperCase()}</>}
      </span>
    </li>;
  })}</ul>;
}
