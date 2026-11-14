import { safeSourceUrl } from "@/lib/api/client";
import type { SequenceManifest } from "./interfaces";
import styles from "./explorer.module.css";

const number = (value: number | null | undefined, digits = 3) => value == null ? "Unavailable" : value.toFixed(digits);
const date = (value: string | null | undefined) => value ? new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC") : "Unavailable";

export function ObservationDetails({ sequence, activeFrameId }: { sequence: SequenceManifest | null; activeFrameId: string | null }) {
  if (!sequence) return null;
  const frame = sequence.frames.find(item => item.frame_id === activeFrameId) ?? sequence.frames[0];
  if (!frame) return null;
  const source = safeSourceUrl(frame.source_fits_url);
  const warnings = [...(sequence.warnings ?? []), ...(frame.warnings ?? [])];
  return <section className={styles.provenance} aria-labelledby="observation-details-title">
    <div className={styles.provenanceHeading}><div><span className={styles.eyebrow}>SOURCE / QUALITY / CONTEXT</span><h2 id="observation-details-title">What you are looking at</h2></div><span className={styles.modeBadge}>{sequence.data_mode === "synthetic" ? "SIMULATION" : sequence.data_mode === "cached-real" ? "CACHED REAL DATA" : "REAL ARCHIVE DATA"}</span></div>
    <p className={styles.disclosure}>{sequence.disclosure}</p>
    <dl className={styles.metadataGrid}>
      <div><dt>Field center / ICRS degrees</dt><dd>{number(sequence.target.ra_deg, 6)}, {number(sequence.target.dec_deg, 6)}</dd></div>
      <div><dt>Angular field / output raster</dt><dd>{number(sequence.requested_fov_arcmin, 2)} arcmin / {sequence.grid.width_px} x {sequence.grid.height_px} px</dd></div>
      <div><dt>Exposure start</dt><dd>{date(frame.observed_start_utc)}</dd></div>
      <div><dt>Exposure end</dt><dd>{date(frame.observed_end_utc)}</dd></div>
      <div><dt>Wavelength at field center</dt><dd>{frame.wavelength_um == null ? "Unavailable" : `${number(frame.wavelength_um)} micrometers`}</dd></div>
      <div><dt>Bandwidth</dt><dd>{frame.bandwidth_um == null ? "Unavailable" : `${number(frame.bandwidth_um)} micrometers`}</dd></div>
      <div><dt>Release / detector</dt><dd>{frame.release ?? "Unavailable"} / {frame.detector == null ? "Unavailable" : `D${frame.detector}`}</dd></div>
      <div><dt>Masked pixels</dt><dd>{frame.masked_fraction == null ? "Unavailable" : `${(frame.masked_fraction * 100).toFixed(1)}%`}</dd></div>
    </dl>
    <details className={styles.details}><summary>Observation lineage and display settings</summary>
      <dl className={styles.lineage}><div><dt>Sequence</dt><dd>{sequence.sequence_id}</dd></div><div><dt>Frame</dt><dd>{frame.frame_id}</dd></div><div><dt>Observation identifier</dt><dd>{frame.observation_id ?? "Unavailable"}</dd></div><div><dt>Display stretch</dt><dd>{sequence.display.stretch ?? "Unavailable"}; shared limits {sequence.display.vmin} to {sequence.display.vmax}</dd></div><div><dt>Grid orientation</dt><dd>{sequence.grid.orientation ?? "Unavailable"}; pixel origin {sequence.grid.pixel_origin ?? "Unavailable"}</dd></div></dl>
      {source ? <a className={styles.sourceLink} href={source} target="_blank" rel="noreferrer">Open the original archive FITS source</a> : <p className={styles.formNote}>No authentic source file is associated with this simulated frame.</p>}
    </details>
    <details className={styles.details} open={warnings.length > 0}><summary>Quality information {warnings.length ? `(${warnings.length} warnings)` : "and interpretation"}</summary>
      {warnings.length > 0 ? <ul className={styles.warningList}>{warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><strong>{warning.code}</strong><span>{warning.message}</span></li>)}</ul> : <p className={styles.formNote}>No additional warning was supplied for this frame. This does not independently establish that a changing feature is a real astronomical source.</p>}
      <p className={styles.formNote}>Masked areas have insufficient or flagged data. Different backgrounds, wavelength samples, point spread functions, or residual registration errors can resemble change. A mark records a candidate for investigation, not a discovery.</p>
    </details>
  </section>;
}
