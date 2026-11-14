"use client";

import { Icon } from "@/components/ui/Icon";
import type { Recovery, SequenceJob } from "@/lib/api/client";
import { observationLabel } from "@/features/viewer/time";
import type { SequenceManifest, SequenceRequest } from "./interfaces";
import styles from "./explorer.module.css";

export type SearchState =
  | { phase: "idle" }
  | { phase: "running"; request: SequenceRequest; job: SequenceJob | null }
  | { phase: "ready"; request: SequenceRequest; manifest: SequenceManifest }
  | { phase: "failed"; request: SequenceRequest; code: string; message: string; recovery: Recovery }
  | { phase: "cancelled"; request: SequenceRequest }
  | { phase: "example"; manifest: SequenceManifest };

interface Props {
  state: SearchState;
  canLoadExample: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onLoadExample: () => void;
}

function fieldSummary(request: SequenceRequest): string {
  return `RA ${request.ra_deg.toFixed(5)}°, Dec ${request.dec_deg.toFixed(5)}°, ${request.fov_arcmin ?? 6}′ field`;
}

function QualityNotes({ manifest }: { manifest: SequenceManifest }) {
  const warnings = manifest.warnings ?? [];
  if (!warnings.length) return null;
  return <details className={styles.qualityNotes}>
    <summary>Quality notes ({warnings.length})</summary>
    <ul>{warnings.map(item => <li key={item.code}><code>{item.code}</code> {item.message}</li>)}</ul>
  </details>;
}

export function SearchStatus({ state, canLoadExample, onCancel, onRetry, onLoadExample }: Props) {
  if (state.phase === "idle") return null;

  if (state.phase === "running") {
    const job = state.job;
    return <section className={styles.searchStatus} aria-labelledby="search-status-title">
      <span className={styles.eyebrow} id="search-status-title">SEARCHING THE IRSA ARCHIVE</span>
      <p role="status" aria-live="polite">{job?.message ?? "Submitting your search"}</p>
      <progress className={styles.progress} max={1} value={job?.progress ?? 0} aria-label="Search progress" />
      <p className={styles.statusDetail}>{fieldSummary(state.request)}. Live searches can take a few minutes; results are kept temporarily.</p>
      <div className={styles.statusActions}><button type="button" className={styles.secondaryButton} onClick={onCancel}><Icon name="close" size={15} />CANCEL SEARCH</button></div>
    </section>;
  }

  if (state.phase === "ready" || state.phase === "example") {
    const { manifest } = state;
    const first = manifest.frames[0];
    const last = manifest.frames[manifest.frames.length - 1];
    const cached = state.phase === "example";
    return <section className={styles.searchStatus} aria-labelledby="search-status-title">
      <span className={styles.eyebrow} id="search-status-title">{cached ? "CACHED REAL EXAMPLE" : "SEQUENCE READY"}</span>
      <p role="status" aria-live="polite">{manifest.frames.length} real observations, {observationLabel(first?.observed_start_utc ?? null)} to {observationLabel(last?.observed_start_utc ?? null)}.</p>
      {cached && <p className={styles.statusDetail}>Previously acquired observations of {manifest.title}. This is not a live result for the coordinates in the form.</p>}
      <QualityNotes manifest={manifest} />
    </section>;
  }

  const request = state.request;
  const failed = state.phase === "failed";
  return <section className={styles.searchStatus} aria-labelledby="search-status-title">
    <span className={styles.eyebrow} id="search-status-title">{failed ? "SEARCH STOPPED" : "SEARCH CANCELLED"}</span>
    <p role="alert">{failed ? state.message : "The search was cancelled. Your coordinates are still in the form."}</p>
    {failed && <p className={styles.statusDetail}><code>{state.code}</code> · {fieldSummary(request)}</p>}
    {failed && state.recovery === "change-query" && <p className={styles.statusDetail}>Retrying the same search will not help. Try another target, a wider field or more frames.</p>}
    <div className={styles.statusActions}>
      {(!failed || state.recovery === "retry") && <button type="button" className={styles.secondaryButton} onClick={onRetry}><Icon name="arrow" size={15} />{failed ? "RETRY SEARCH" : "SEARCH AGAIN"}</button>}
      {failed && canLoadExample && <button type="button" className={styles.secondaryButton} onClick={onLoadExample}>LOAD CACHED REAL EXAMPLE</button>}
    </div>
  </section>;
}
