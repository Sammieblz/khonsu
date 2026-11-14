"use client";

import { Icon } from "@/components/ui/Icon";
import type { ObservationFrame } from "@/features/explorer/interfaces";
import { adjacentFrameIndex, observationLabel } from "./time";
import styles from "./viewer.module.css";

interface Props {
  frames: ObservationFrame[];
  index: number;
  playing: boolean;
  onToggle: () => void;
  onIndexChange: (index: number) => void;
}

export function PlaybackControls({ frames, index, playing, onToggle, onIndexChange }: Props) {
  const hasFrames = frames.length > 0;
  const active = frames[index];
  return (
    <div className={styles.transport} aria-label="Observation time controls">
      <div className={styles.timeReadout}><span>{hasFrames ? `${index + 1} / ${frames.length} OBSERVATIONS` : "NO OBSERVATIONS LOADED"}</span><strong>{active ? observationLabel(active.observed_start_utc) : "TIME BEGINS WITH A REAL OBSERVATION"}</strong></div>
      <div className={styles.timeArc} aria-hidden="true"><svg viewBox="0 0 600 52" preserveAspectRatio="none"><path d="M12 8Q300 88 588 8" /><path d="M12 8Q300 88 588 8" pathLength="100" strokeDasharray=".2 3.8" /></svg></div>
      <label className="sr-only" htmlFor="observation-index">Observation frame</label>
      <input id="observation-index" className={styles.timeSlider} type="range" min="0" max={Math.max(0, frames.length - 1)} step="1" value={Math.max(0, index)} disabled={frames.length < 2} onChange={event => onIndexChange(Number(event.target.value))} aria-valuetext={active ? observationLabel(active.observed_start_utc) : "No observations loaded"} />
      <div className={styles.transportButtons}>
        <button aria-label="Previous observation" disabled={!hasFrames || index <= 0} onClick={() => onIndexChange(adjacentFrameIndex(index, -1, frames.length))}><Icon name="back" /></button>
        <button className={styles.playButton} aria-label={playing ? "Pause observations" : "Play observations"} disabled={frames.length < 2} onClick={onToggle}><Icon name={playing ? "pause" : "play"} /></button>
        <button aria-label="Next observation" disabled={!hasFrames || index >= frames.length - 1} onClick={() => onIndexChange(adjacentFrameIndex(index, 1, frames.length))}><Icon name="arrow" /></button>
        <span className={styles.sequenceNote}>ACTUAL FRAMES / NO INTERPOLATED SKY</span>
      </div>
    </div>
  );
}
