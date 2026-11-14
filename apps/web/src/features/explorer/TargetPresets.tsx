import styles from "./explorer.module.css";

const referenceTargets = ["Barnard's Star", "Epsilon Indi B", "WISE 0855", "RW Aurigae", "R Draconis"];

export function TargetPresets() {
  return (
    <section className={styles.referenceTargets} aria-labelledby="reference-targets-title">
      <div><span className={styles.eyebrow} id="reference-targets-title">CHALLENGE REFERENCE TARGETS</span><p>Coordinates and verified sequences will be connected here.</p></div>
      <ol>{referenceTargets.map((target, index) => <li key={target}><span>{String(index + 1).padStart(2, "0")}</span>{target}</li>)}</ol>
    </section>
  );
}
