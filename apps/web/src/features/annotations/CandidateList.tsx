import { Icon } from "@/components/ui/Icon";
import type { CandidateAnnotation } from "@/features/explorer/interfaces";
import styles from "./annotations.module.css";

export function CandidateList({ annotations, onRemove, onExport }: {
  annotations: CandidateAnnotation[];
  onRemove: (id: string) => void;
  onExport?: (id: string) => void;
}) {
  if (!annotations.length) return <p className={styles.empty}>No candidate notes for this sequence yet.</p>;
  return <ul className={styles.candidateList}>{annotations.map((item, index) => <li key={item.id}>
    <div>
      <span className={styles.candidateNumber}>CANDIDATE {String(index + 1).padStart(2, "0")} / UNREVIEWED</span>
      <button type="button" aria-label={"Remove candidate " + (index + 1)} onClick={() => onRemove(item.id)}><Icon name="close" size={16} /></button>
    </div>
    <p>{item.note}</p>
    <span className={styles.coordinates}>FRAME {item.selection.frameId} / X {item.selection.x} / Y {item.selection.y}</span>
    {item.evidence?.skyPosition && <span className={styles.coordinates}>ICRS / RA {item.evidence.skyPosition.raDeg.toFixed(7)}° / Dec {item.evidence.skyPosition.decDeg.toFixed(7)}°</span>}
    <span className={styles.coordinates}>{item.evidence
      ? "HUMAN MARK / " + item.evidence.dataMode.toUpperCase() + " / CAPTURED " + item.createdAt
      : "LEGACY NOTE / capture-time scientific context unavailable"}</span>
    {onExport && <button className={styles.singleExport} type="button" onClick={() => onExport(item.id)}>EXPORT THIS CANDIDATE</button>}
  </li>)}</ul>;
}
