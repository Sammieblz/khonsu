import styles from "./explorer.module.css";
import type { PresetTarget } from "./interfaces";

export function TargetPresets({ presets, loading, error, disabled, onSelect, onRetry }: { presets: PresetTarget[]; loading: boolean; error: string; disabled: boolean; onSelect: (preset: PresetTarget) => void; onRetry: () => void }) {
  return (
    <section className={styles.referenceTargets} aria-labelledby="reference-targets-title">
      <div><span className={styles.eyebrow} id="reference-targets-title">CHALLENGE REFERENCE TARGETS</span><p>Choose a catalog position. Available dates and usable wavelength coverage vary by field.</p></div>
      {loading && <p role="status">Loading the target catalog...</p>}
      {error && <div className={styles.catalogError}><p>{error}</p><button type="button" onClick={onRetry}>Retry target catalog</button></div>}
      {!loading && !error && !presets.length && <p>The service has not supplied reference targets.</p>}
      <ol>{presets.map((target, index) => <li key={target.preset_id}><button type="button" disabled={disabled || target.ra_deg == null || target.dec_deg == null} onClick={() => onSelect(target)} title={target.coordinate_note}><span>{String(index + 1).padStart(2, "0")}</span>{target.label}<small>{target.ra_deg == null || target.dec_deg == null ? "Coordinates unavailable" : target.object_type}</small></button></li>)}</ol>
    </section>
  );
}
