import type { SequenceManifest } from "@/features/explorer/interfaces";
import { dataModeLabel, frameNotes, processingSummary, utcSeconds } from "./provenance";
import styles from "./provenance.module.css";

interface ObservationDetailsProps {
  sequence: SequenceManifest;
  activeFrameId: string | null;
  /** Indices of the A and B observations selected for comparison. */
  comparison: { a: number; b: number } | null;
}

function signed(value: number, digits: number): string {
  return `${value < 0 ? "-" : "+"}${Math.abs(value).toFixed(digits)}`;
}

/**
 * Where each observation came from and what limits it, shown next to the
 * image. Every value is read from the manifest; nothing is estimated here.
 */
export function ObservationDetails({ sequence, activeFrameId, comparison }: ObservationDetailsProps) {
  const mode = dataModeLabel(sequence);
  const notes = frameNotes(sequence);
  const summary = processingSummary(sequence);
  const processing = Object.entries(sequence.processing ?? {});
  return <details className={styles.details} open>
    <summary>Observation details &amp; quality <span>{mode.title}</span></summary>
    <p className={styles.mode} data-mode={sequence.data_mode}><strong>{mode.title}.</strong> {mode.detail}</p>
    <p>{sequence.disclosure}</p>

    <h3>Field</h3>
    <dl className={styles.facts}>
      <dt>Target</dt><dd>RA {sequence.target.ra_deg.toFixed(5)}°, Dec {signed(sequence.target.dec_deg, 5)}° (ICRS, decimal degrees)</dd>
      <dt>Field</dt><dd>{sequence.requested_fov_arcmin}′ requested; output grid {sequence.grid.width_px} × {sequence.grid.height_px} pixels{summary.scale ? `, ${summary.scale}″ per pixel` : ""}; north up, east left</dd>
      <dt>Display</dt><dd>{summary.display}</dd>
      <dt>Processing</dt><dd>{summary.processing}</dd>
    </dl>

    <h3 id="observation-list-title">Observations ({sequence.frames.length})</h3>
    <div className={styles.listWrap} role="region" aria-labelledby="observation-list-title" tabIndex={0}>
      <ol className={styles.observations}>{sequence.frames.map((frame, index) => {
        const roles = [
          frame.frame_id === activeFrameId ? "showing" : null,
          comparison?.a === index ? "A" : null,
          comparison?.b === index ? "B" : null,
        ].filter(Boolean).join(" · ");
        const id = frame.observation_id ?? frame.frame_id;
        return <li key={frame.frame_id} data-frame-id={frame.frame_id} aria-current={frame.frame_id === activeFrameId ? "true" : undefined}>
          <span className={styles.obsLine}><strong>{index + 1} · {utcSeconds(frame.observed_start_utc)}</strong>{roles && <span className={styles.role}>{roles.toUpperCase()}</span>}</span>
          <span className={styles.obsLine}>{frame.source_fits_url
            ? <a href={frame.source_fits_url} target="_blank" rel="noreferrer" aria-label={`${id}: source FITS at IRSA (opens in a new tab)`}>{id}</a>
            : <>{id} (no source link)</>}
            <span>{frame.release ?? "release unknown"}</span><span>detector {frame.detector ?? "unknown"}</span></span>
          <span className={styles.obsLine}>
            <span>{frame.wavelength_um != null ? `${frame.wavelength_um.toFixed(4)} µm` : "wavelength unknown"}{frame.bandwidth_um != null ? `, band ${frame.bandwidth_um.toFixed(4)} µm` : ""}</span>
            <span>{((frame.masked_fraction ?? 0) * 100).toFixed(1)}% no data</span>
          </span>
        </li>;
      })}</ol>
    </div>

    <h3>Quality notes</h3>
    <ul className={styles.notes}>{notes.map(note => <li key={note.key}><strong>{note.scope}:</strong> {note.message}{note.code && <> <code>{note.code}</code></>}</li>)}</ul>

    {processing.length > 0 && <details className={styles.record}>
      <summary>Full processing record ({processing.length} entries)</summary>
      <dl>{processing.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
    </details>}
  </details>;
}
