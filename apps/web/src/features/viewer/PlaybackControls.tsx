"use client";

import { useId, useMemo, useRef, type PointerEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ObservationFrame } from "@/features/explorer/interfaces";
import { adjacentFrameIndex, epochTimeline, nearestTimelineIndex, observationLabel } from "./time";
import styles from "./viewer.module.css";

interface Props {
  frames: ObservationFrame[];
  index: number;
  playing: boolean;
  onToggle: () => void;
  onIndexChange: (index: number) => void;
}

export function PlaybackControls({ frames, index, playing, onToggle, onIndexChange }: Props) {
  const id = useId();
  const dragging = useRef(false);
  const timeline = useMemo(() => epochTimeline(frames), [frames]);
  const active = frames[index];
  const position = timeline.positions[index];
  function scrub(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = nearestTimelineIndex(timeline.positions, ((event.clientX - rect.left) / rect.width - .02) / .96);
    if (next >= 0) onIndexChange(next);
  }
  const scaleLabel = timeline.mode === "time" ? "TRUE TIME SPACING / GAPS PRESERVED" : "FRAME ORDER / ELAPSED TIME UNAVAILABLE";
  return (
    <div className={styles.transport} aria-label="Observation time controls">
      <div className={styles.timeReadout}>
        <span>{frames.length ? (index + 1) + " / " + frames.length + " OBSERVATIONS" : "NO OBSERVATIONS LOADED"}</span>
        <strong>{active ? observationLabel(active.observed_start_utc) : "TIME BEGINS WITH A REAL OBSERVATION"}</strong>
      </div>
      <div className={styles.timeArc} aria-hidden="true" onPointerDown={event => {
        if (frames.length < 2) return;
        dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); scrub(event);
      }} onPointerMove={event => { if (dragging.current) scrub(event); }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}>
        <svg viewBox="0 0 600 72" preserveAspectRatio="none">
          <path d="M12 12 Q300 96 588 12" />
          {timeline.positions.map((value, frameIndex) => value === null ? null : <circle key={frames[frameIndex].frame_id} cx={12 + value * 576} cy={12 + 168 * value * (1 - value)} r={frameIndex === index ? 5 : 2.5} className={frameIndex === index ? styles.activeTick : styles.epochTick} />)}
        </svg>
      </div>
      <label className="sr-only" htmlFor={id}>Observation timeline. {scaleLabel}</label>
      <input id={id} className={styles.timeSlider} type="range" min="0" max="1000" step="1" value={Math.round((position ?? 0) * 1000)} disabled={frames.length < 2} onChange={event => {
        const next = nearestTimelineIndex(timeline.positions, Number(event.target.value) / 1000);
        if (next >= 0) onIndexChange(next);
      }} onKeyDown={event => {
        let next: number | null = null;
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = adjacentFrameIndex(index, -1, frames.length);
        if (event.key === "ArrowRight" || event.key === "ArrowUp") next = adjacentFrameIndex(index, 1, frames.length);
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = frames.length - 1;
        if (next !== null && next >= 0) { event.preventDefault(); onIndexChange(next); }
      }} aria-valuetext={active ? (index + 1) + " of " + frames.length + ". " + observationLabel(active.observed_start_utc) : "No observations loaded"} />
      <div className={styles.axisCaption}><span>{scaleLabel}</span>{timeline.unknownCount > 0 && <span>{timeline.unknownCount} undated; use step buttons</span>}</div>
      <div className={styles.transportButtons}>
        <button aria-label="Previous observation" disabled={!frames.length || index <= 0} onClick={() => onIndexChange(adjacentFrameIndex(index, -1, frames.length))}><Icon name="back" /></button>
        <button className={styles.playButton} aria-label={playing ? "Pause observations" : "Play observations"} aria-pressed={playing} disabled={frames.length < 2} onClick={onToggle}><Icon name={playing ? "pause" : "play"} /></button>
        <button aria-label="Next observation" disabled={!frames.length || index >= frames.length - 1} onClick={() => onIndexChange(adjacentFrameIndex(index, 1, frames.length))}><Icon name="arrow" /></button>
        <span className={styles.sequenceNote}>1 SECOND / OBSERVATION<br />DISCRETE FRAMES. NO INTERPOLATION.</span>
      </div>
    </div>
  );
}
