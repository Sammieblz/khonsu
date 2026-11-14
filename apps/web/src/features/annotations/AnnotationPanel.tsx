"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import type { AnnotationPanelProps } from "@/features/explorer/interfaces";
import { CandidateList } from "./CandidateList";
import styles from "./annotations.module.css";

export function AnnotationPanel({ selection, annotations, onAdd, onRemove }: AnnotationPanelProps) {
  const [note, setNote] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || !note.trim()) return;
    onAdd(selection, note);
    setNote("");
  }
  return <section className={styles.panel} aria-labelledby="notes-title">
    <span className={styles.eyebrow}>03 / KEEP THE EVIDENCE</span>
    <h2 id="notes-title">Something worth a closer look?</h2>
    <p className={styles.instructions}>{selection ? `Selected pixel ${selection.x}, ${selection.y} in frame ${selection.frameId}.` : "Load an observation, choose Mark, then select a location to start a candidate note."}</p>
    <form onSubmit={submit}>
      <label htmlFor="candidate-note">Observation note</label>
      <textarea id="candidate-note" rows={3} maxLength={500} placeholder="What changed? What might explain it?" value={note} onChange={event => setNote(event.target.value)} disabled={!selection} />
      <button type="submit" disabled={!selection || !note.trim()}><Icon name="mark" size={17} />SAVE CANDIDATE NOTE</button>
    </form>
    <CandidateList annotations={annotations} onRemove={onRemove} />
    <p className={styles.disclaimer}>Notes stay in this browser. A candidate is an observation to investigate, not a confirmed discovery.</p>
  </section>;
}
