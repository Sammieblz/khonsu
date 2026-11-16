"use client";
import type { ObservationFrame } from "@/features/explorer/interfaces";
import {useLayoutEffect,useMemo,useRef,type PointerEvent} from 'react';
import {animate} from 'motion';
import {dialFraction,dialPoint,DIAL_SPRING} from './dial';
import { nearestObservation, observationLabel, timePositions } from "./time";
import styles from "./viewer.module.css";
interface Props { frames: ObservationFrame[]; index: number; playing: boolean; speed: number; onSpeed: (speed: number) => void; onToggle: () => void; onIndexChange: (index: number) => void; }
export function PlaybackControls({ frames, index, playing, speed, onSpeed, onToggle, onIndexChange }: Props) {
  const active = frames[index], positions = useMemo(()=>timePositions(frames.map(frame => frame.observed_start_utc)),[frames]);
  const root=useRef<HTMLDivElement>(null),handle=useRef<HTMLSpanElement>(null),dragging=useRef(false),fraction=useRef(positions[index]??0),selected=useRef(index),size=useRef({width:600,height:44});
  const spring=useRef<ReturnType<typeof animate>|null>(null),latest=useRef({positions,index});latest.current={positions,index};
  const label = active ? observationLabel(active.observed_start_utc) : "Choose a field to begin";
  function paint(value:number){fraction.current=value;const point=dialPoint(value,size.current.width,size.current.height);if(handle.current){handle.current.style.transform=`translate(${point.x}px,${point.y}px) translate(-50%,-50%)`;handle.current.dataset.position=String(value);}}
  function stopSpring(){spring.current?.stop();spring.current=null;}
  function selectImmediately(next:number){stopSpring();selected.current=next;paint(positions[next]??0);onIndexChange(next);}
  function scrub(event:PointerEvent<HTMLInputElement>){
    const rect=event.currentTarget.getBoundingClientRect(),p=dialFraction(event.clientX,rect.left,rect.width);paint(p);
    const next=nearestObservation(positions,p);if(next!==selected.current){selected.current=next;onIndexChange(next);}
  }
  function release(event:PointerEvent<HTMLInputElement>){
    if(!dragging.current)return;dragging.current=false;delete root.current?.dataset.dragging;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    const target=positions[selected.current]??0;stopSpring();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(target-fraction.current)<.00001){paint(target);return;}
    spring.current=animate(fraction.current,target,{...DIAL_SPRING,onUpdate:paint,onComplete:()=>{spring.current=null;paint(target);}});
  }
  useLayoutEffect(()=>{if(!dragging.current&&(index!==selected.current||!spring.current)){stopSpring();selected.current=index;paint(positions[index]??0);}},[index,positions]);
  useLayoutEffect(()=>{const element=root.current;if(!element)return;const resize=new ResizeObserver(()=>{size.current={width:element.clientWidth,height:element.clientHeight};stopSpring();paint(latest.current.positions[latest.current.index]??0);});resize.observe(element);return()=>{resize.disconnect();stopSpring();};},[]);
  return <div className={styles.transport} aria-label="Observation time controls">
    <div className={styles.timeReadout}><span>{active ? `${index + 1} / ${frames.length} OBSERVATIONS` : "OBSERVATION TIME"}</span><strong>{label}</strong></div>
    <div ref={root} className={styles.timeDial} data-time-dial>
    <svg className={styles.timeArc} viewBox="0 0 600 70" preserveAspectRatio="none" aria-hidden="true">
      <path d="M16 56 Q300 -26 584 56" fill="none" />
      {positions.map((position, i) => <circle key={frames[i]!.frame_id} cx={16+568*position} cy={56-164*position*(1-position)} r={3}><title>{observationLabel(frames[i]!.observed_start_utc)}</title></circle>)}
    </svg>
    {active&&<span ref={handle} className={styles.dialHandle} aria-hidden="true"/>}
    <label className="sr-only" htmlFor="observation-index">Observation time</label>
    <input id="observation-index" className={styles.timeSlider} type="range" min="0" max="1000" step="1" value={Math.round((positions[index] ?? 0)*1000)} disabled={frames.length<2} aria-valuetext={label}
      onPointerDown={event=>{if(event.button!==0||frames.length<2)return;event.preventDefault();stopSpring();dragging.current=true;selected.current=index;event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);if(root.current)root.current.dataset.dragging='true';scrub(event);}}
      onPointerMove={event=>{if(dragging.current&&event.currentTarget.hasPointerCapture(event.pointerId))scrub(event);}}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onChange={event => selectImmediately(nearestObservation(positions,Number(event.target.value)/1000))}
      onKeyDown={event => { const next=event.key==='ArrowRight'||event.key==='ArrowUp'?index+1:event.key==='ArrowLeft'||event.key==='ArrowDown'?index-1:event.key==='Home'?0:event.key==='End'?frames.length-1:null; if(next!==null){event.preventDefault();selectImmediately(Math.max(0,Math.min(frames.length-1,next)));} }} />
    </div>
    <div className={styles.transportButtons}>
      <button disabled={index<=0||!active} onClick={()=>onIndexChange(index-1)} aria-label="Previous observation">PREVIOUS</button>
      <button className={styles.playButton} disabled={frames.length<2} onClick={onToggle} aria-label={playing?'Pause observations':'Play observations'}>{playing?'PAUSE':'PLAY'}</button>
      <button disabled={!active||index>=frames.length-1} onClick={()=>onIndexChange(index+1)} aria-label="Next observation">NEXT</button>
      <label>Rate <select aria-label="Playback rate" value={speed} onChange={event=>onSpeed(Number(event.target.value))}><option value={1400}>Slow</option><option value={700}>Normal</option><option value={350}>Fast</option></select></label>
    </div>
  </div>;
}
