"use client";

import { Icon } from "@/components/ui/Icon";
import type { FailureGuide, SequenceJob } from "@/lib/api/client";
import { observationLabel } from "@/features/viewer/time";
import type { SequenceManifest, SequenceRequest } from "./interfaces";
import styles from "./explorer.module.css";

export type SearchState =
  | { phase: "idle" }
  | { phase: "running"; request: SequenceRequest; job: SequenceJob | null }
  | { phase: "ready"; request: SequenceRequest; manifest: SequenceManifest }
  | { phase: "failed"; request: SequenceRequest; code: string; message: string; details: string[]; guide: FailureGuide }
  | { phase: "cancelled"; request: SequenceRequest }
  | { phase: "example"; manifest: SequenceManifest };

interface Props {
  state: SearchState;
  canLoadExample: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onEditSearch: () => void;
  onLoadExample: () => void;
}

interface CachedExampleProps {
  examples: SequenceManifest[];
  selectedId: string;
  error: string;
  loading: boolean;
  onSelect: (id: string) => void;
  onLoad: () => void;
}

export function CachedExamplePicker({ examples, selectedId, error, loading, onSelect, onLoad }: CachedExampleProps) {
  return <section className={styles.searchStatus} aria-labelledby="cached-example-title">
    <span className={styles.eyebrow} id="cached-example-title">SAVED OBSERVATIONS</span>
    <p className={styles.statusDetail}>Explore a previously acquired real field without contacting IRSA. The local observation service must still be running. Your form coordinates stay unchanged.</p>
    {loading ? <p role="status">Checking cached examples...</p> : error ? <p role="alert">{error}</p> : examples.length === 0 ? <p>No verified cached observation example is bundled with this service.</p> : <>
      <label htmlFor="cached-example">Cached real field</label>
      <select id="cached-example" className={styles.secondaryButton} value={selectedId} onChange={event => onSelect(event.target.value)}>
        {examples.map(example => <option key={example.sequence_id} value={example.sequence_id}>{example.title}</option>)}
      </select>
      <div className={styles.statusActions}><button type="button" className={styles.secondaryButton} onClick={onLoad}>LOAD CACHED REAL EXAMPLE</button></div>
    </>}
  </section>;
}

function fieldSummary(request: Pick<SequenceRequest, "ra_deg" | "dec_deg" | "fov_arcmin">): string {
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

export function SearchStatus({ state, canLoadExample, onCancel, onRetry, onEditSearch, onLoadExample }: Props) {
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
      {cached
        ? <p className={styles.statusDetail}>Previously acquired observations of {manifest.title}. This is not a live result for the coordinates in the form.</p>
        : <p className={styles.statusDetail}>Live result for {fieldSummary({ ...manifest.target, fov_arcmin: manifest.requested_fov_arcmin })}.</p>}
      <QualityNotes manifest={manifest} />
    </section>;
  }

  const request = state.request;
  if (state.phase === "cancelled") {
    return <section className={styles.searchStatus} aria-labelledby="search-status-title">
      <span className={styles.eyebrow} id="search-status-title">SEARCH CANCELLED</span>
      <p role="alert">The search was cancelled. Your coordinates are still in the form.</p>
      <div className={styles.statusActions}>
        <button type="button" className={styles.secondaryButton} onClick={onRetry}><Icon name="arrow" size={15} />SEARCH AGAIN</button>
        <button type="button" className={styles.secondaryButton} onClick={onEditSearch}>EDIT SEARCH</button>
      </div>
    </section>;
  }

  // Each failure kind has its own heading, guidance and recovery actions.
  const { guide } = state;
  return <section className={styles.searchStatus} aria-labelledby="search-status-title">
    <span className={styles.eyebrow} id="search-status-title">{guide.title}</span>
    <p role="alert">{state.message}</p>
    {state.details.length > 0 && <ul className={styles.statusDetail}>{state.details.slice(0, 5).map(item => <li key={item}>{item}</li>)}</ul>}
    <p className={styles.statusDetail}>{guide.hint}</p>
    <p className={styles.statusDetail}><code>{state.code}</code> · {fieldSummary(request)}</p>
    <div className={styles.statusActions}>
      {guide.retry && <button type="button" className={styles.secondaryButton} onClick={onRetry}><Icon name="arrow" size={15} />RETRY SEARCH</button>}
      {guide.editSearch && <button type="button" className={styles.secondaryButton} onClick={onEditSearch}>EDIT SEARCH</button>}
      {guide.cachedExample && canLoadExample && <button type="button" className={styles.secondaryButton} onClick={onLoadExample}>LOAD CACHED REAL EXAMPLE</button>}
    </div>
  </section>;
}
