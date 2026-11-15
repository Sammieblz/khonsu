"use client";
import type { ObservationFrame } from "@/features/explorer/interfaces";
import { nearestObservation, observationLabel, timePositions } from "./time";
import styles from "./viewer.module.css";
interface Props { frames: ObservationFrame[]; index: number; playing: boolean; speed: number; onSpeed: (speed: number) => void; onToggle: () => void; onIndexChange: (index: number) => void; }
export function PlaybackControls({ frames, index, playing, speed, onSpeed, onToggle, onIndexChange }: Props) {
  const active = frames[index], positions = timePositions(frames.map(frame => frame.observed_start_utc));
  const label = active ? observationLabel(active.observed_start_utc) : "Choose a field to begin";
  return <div className={styles.transport} aria-label="Observation time controls">
    <div className={styles.timeReadout}><span>{active ? `${index + 1} / ${frames.length} OBSERVATIONS` : "OBSERVATION TIME"}</span><strong>{label}</strong></div>
    <svg className={styles.timeArc} viewBox="0 0 600 70" aria-label="Available observation dates" onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);const r=event.currentTarget.getBoundingClientRect();onIndexChange(nearestObservation(positions,((event.clientX-r.left)/r.width*600-16)/568));}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId)){const r=event.currentTarget.getBoundingClientRect();onIndexChange(nearestObservation(positions,((event.clientX-r.left)/r.width*600-16)/568));}}} style={{touchAction:"none"}}>
      <path d="M16 56 Q300 -26 584 56" fill="none" />
      {positions.map((position, i) => <circle key={frames[i]!.frame_id} cx={16+568*position} cy={56-164*position*(1-position)} r={i === index ? 7 : 4} className={i===index ? styles.selectedTick : undefined} onClick={() => onIndexChange(i)}><title>{observationLabel(frames[i]!.observed_start_utc)}</title></circle>)}
    </svg>
    <label className="sr-only" htmlFor="observation-index">Observation time</label>
    <input id="observation-index" className={styles.timeSlider} type="range" min="0" max="1000" step="1" value={Math.round((positions[index] ?? 0)*1000)} disabled={frames.length<2} aria-valuetext={label}
      onChange={event => onIndexChange(nearestObservation(positions,Number(event.target.value)/1000))}
      onKeyDown={event => { const next=event.key==='ArrowRight'||event.key==='ArrowUp'?index+1:event.key==='ArrowLeft'||event.key==='ArrowDown'?index-1:event.key==='Home'?0:event.key==='End'?frames.length-1:null; if(next!==null){event.preventDefault();onIndexChange(Math.max(0,Math.min(frames.length-1,next)));} }} />
    <div className={styles.transportButtons}>
      <button disabled={index<=0||!active} onClick={()=>onIndexChange(index-1)} aria-label="Previous observation">PREVIOUS</button>
      <button className={styles.playButton} disabled={frames.length<2} onClick={onToggle} aria-label={playing?'Pause observations':'Play observations'}>{playing?'PAUSE':'PLAY'}</button>
      <button disabled={!active||index>=frames.length-1} onClick={()=>onIndexChange(index+1)} aria-label="Next observation">NEXT</button>
      <label>Rate <select aria-label="Playback rate" value={speed} onChange={event=>onSpeed(Number(event.target.value))}><option value={1400}>Slow</option><option value={700}>Normal</option><option value={350}>Fast</option></select></label>
    </div>
    {active && <div className={styles.epochButtons}>{frames.map((frame,i)=><button key={frame.frame_id} aria-pressed={index===i} onClick={()=>onIndexChange(i)} title={observationLabel(frame.observed_start_utc)}>{i===0?'EARLIEST':i===frames.length-1?'LATEST':`VISIT ${i+1}`}<small>{frame.observed_start_utc?.slice(0,10) ?? 'Date unavailable'}</small></button>)}</div>}
    <p className={styles.hint}>Ticks follow elapsed UTC time. Gaps contain no observations. Playback steps through available exposures.</p>
  </div>;
}
