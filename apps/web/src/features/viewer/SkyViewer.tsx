"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { ObservationFrame, SkyViewerProps, ViewerTool } from "@/features/explorer/interfaces";
import { PlaybackControls } from "./PlaybackControls";
import { useFrameLoader } from "./useFrameLoader";
import { usePlayback } from "./usePlayback";
import { nearestObservation, observationLabel, timePositions } from "./time";
import { boundedView, clientPointToRaster, displayScale, FIT, zoomAt } from "./viewport";
import styles from "./viewer.module.css";
const EMPTY_FRAMES: ObservationFrame[] = [];

export function SkyViewer(props: SkyViewerProps) {
  return <ObservationConsole key={props.sequence?.sequence_id ?? 'empty'} {...props} />;
}
function ObservationConsole({ sequence, activeFrameId, annotations, onFrameChange, onSelect }: SkyViewerProps) {
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<ViewerTool>('time');
  const [view, setView] = useState(FIT), [expanded, setExpanded] = useState(false);
  const [speed, setSpeed] = useState(700), [blink, setBlink] = useState(false);
  const [a, setA] = useState(0), [b, setB] = useState(Math.max(0,(sequence?.frames.length ?? 1)-1));
  const [cursor, setCursor] = useState({x:Math.floor((sequence?.grid.width_px ?? 1)/2),y:Math.floor((sequence?.grid.height_px ?? 1)/2)});
  const held = useRef<string | null>(null);
  const pointers = useRef(new Map<number,{x:number;y:number}>());
  const drag = useRef<{x:number;y:number;position:number;moved:boolean}|null>(null);
  const frames = sequence?.frames ?? EMPTY_FRAMES;
  const frameIds = useMemo(()=>frames.map(frame=>frame.frame_id),[frames]);
  const positions = timePositions(frames.map(frame=>frame.observed_start_utc));
  const index = Math.max(0,frames.findIndex(frame=>frame.frame_id===activeFrameId)), active=frames[index];
  const {images,failedIds,retry}=useFrameLoader(frames,index,[a,b]);
  const ready=!!active && images.has(active.frame_id);
  const {playing,setPlaying}=usePlayback(frameIds,active?.frame_id ?? null,onFrameChange,speed,ready);
  const scale=sequence?displayScale(sequence.grid.width_px,sequence.grid.height_px):1;

  function releaseHold(){ if(held.current){onFrameChange(held.current);held.current=null;} }
  function stop(){setPlaying(false);setBlink(false);releaseHold();}
  function selectIndex(next:number){stop();if(frames[next])onFrameChange(frames[next].frame_id);}
  function beginHold(){if(!ready||a===b)return;setPlaying(false);setBlink(false);if(!held.current)held.current=active.frame_id;onFrameChange(frames[b]!.frame_id);}
  useEffect(()=>{const release=()=>{setBlink(false);setPlaying(false);releaseHold();pointers.current.clear();drag.current=null;};window.addEventListener('blur',release);return()=>window.removeEventListener('blur',release);});
  useEffect(()=>{
    if(!blink||a===b||!images.has(frames[a]?.frame_id ?? '')||!images.has(frames[b]?.frame_id ?? ''))return;
    const timer=window.setInterval(()=>onFrameChange(active?.frame_id===frames[a]!.frame_id?frames[b]!.frame_id:frames[a]!.frame_id),speed);
    return()=>window.clearInterval(timer);
  },[blink,a,b,images,frames,active,onFrameChange,speed]);
  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    const observer=new ResizeObserver(()=>setView(current=>boundedView(current,element.clientWidth,element.clientHeight)));
    observer.observe(element);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    const wheel=(event:WheelEvent)=>{if(tool!=='pan'||!sequence)return;event.preventDefault();const rect=element.getBoundingClientRect();setView(current=>zoomAt(current,Math.exp(-event.deltaY*.002),event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2,rect.width,rect.height));};
    element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
  },[tool,sequence]);
  useLayoutEffect(()=>{
    if(!sequence||!active||!canvas.current)return;
    const context=canvas.current.getContext('2d');if(!context)return;
    const width=sequence.grid.width_px*scale,height=sequence.grid.height_px*scale;
    context.clearRect(0,0,width,height);
    const image=images.get(active.frame_id);if(!image)return;
    context.fillStyle='#273140';context.fillRect(0,0,width,height);context.imageSmoothingEnabled=false;
    context.drawImage(image,0,0,width,height);
    context.strokeStyle='#f3bc60';context.lineWidth=Math.max(2,width/400);
    for(const note of annotations.filter(note=>note.selection.sequenceId===sequence.sequence_id&&note.selection.frameId===active.frame_id)){
      context.beginPath();context.arc((note.selection.x+.5)*scale,(note.selection.y+.5)*scale,Math.max(10,width/40),0,Math.PI*2);context.stroke();
    }
    if(tool==='mark'){context.strokeStyle='#79c7e8';context.strokeRect(cursor.x*scale,cursor.y*scale,scale,scale);}
  },[sequence,active,images,annotations,scale,cursor,tool]);
  function mark(x:number,y:number){if(!sequence||!active||!ready)return;onSelect({sequenceId:sequence.sequence_id,frameId:active.frame_id,x,y,coordinateSpace:'natural-raster',pixelOrigin:'top-left'});}
  function pointerDown(event:PointerEvent<HTMLDivElement>){
    if(!active)return;stop();event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus();
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});drag.current={x:event.clientX,y:event.clientY,position:positions[index] ?? 0,moved:false};
  }
  function pointerMove(event:PointerEvent<HTMLDivElement>){
    const previous=pointers.current.get(event.pointerId), start=drag.current,rect=event.currentTarget.getBoundingClientRect();
    if(!previous||!start)return;
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>3)start.moved=true;
    if(tool==='pan'){
      const other=[...pointers.current.entries()].find(([id])=>id!==event.pointerId)?.[1];
      if(other){const oldDistance=Math.hypot(previous.x-other.x,previous.y-other.y),distance=Math.hypot(event.clientX-other.x,event.clientY-other.y);if(oldDistance>0)setView(current=>zoomAt(current,distance/oldDistance,(event.clientX+other.x)/2-rect.left-rect.width/2,(event.clientY+other.y)/2-rect.top-rect.height/2,rect.width,rect.height));}
      else setView(current=>boundedView({...current,x:current.x+event.clientX-previous.x,y:current.y+event.clientY-previous.y},rect.width,rect.height));
    } else if(tool==='time') {const next=nearestObservation(positions,start.position+(event.clientX-start.x)/rect.width);if(frames[next])onFrameChange(frames[next].frame_id);}
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
  }
  function pointerEnd(event:PointerEvent<HTMLDivElement>){
    if(event.type==='pointerup'&&tool==='mark'&&!drag.current?.moved&&sequence&&canvas.current){const point=clientPointToRaster(event.clientX,event.clientY,canvas.current.getBoundingClientRect(),sequence.grid.width_px,sequence.grid.height_px);if(point){setCursor(point);mark(point.x,point.y);}}
    pointers.current.delete(event.pointerId);drag.current=null;
  }
  function zoom(factor:number){const element=viewport.current;if(element)setView(current=>zoomAt(current,factor,0,0,element.clientWidth,element.clientHeight));}
  function key(event:KeyboardEvent<HTMLDivElement>){
    if(!active)return;
    if(event.key==='Escape'){stop();setExpanded(false);return;}
    const delta: [number,number] | null=event.key==='ArrowLeft'?[-1,0]:event.key==='ArrowRight'?[1,0]:event.key==='ArrowUp'?[0,-1]:event.key==='ArrowDown'?[0,1]:null;
    if(delta){event.preventDefault();stop();if(tool==='time')selectIndex(Math.max(0,Math.min(frames.length-1,index+(delta[0]||-delta[1]))));else if(tool==='pan'&&viewport.current)setView(current=>boundedView({...current,x:current.x-delta[0]*24,y:current.y-delta[1]*24},viewport.current!.clientWidth,viewport.current!.clientHeight));else if(sequence)setCursor(current=>({x:Math.max(0,Math.min(sequence.grid.width_px-1,current.x+delta[0])),y:Math.max(0,Math.min(sequence.grid.height_px-1,current.y+delta[1]))}));}
    if(event.key==='Enter'&&tool==='mark'){event.preventDefault();mark(cursor.x,cursor.y);}
    if(event.key===' '){event.preventDefault();setBlink(false);setPlaying(!playing);}
    if(event.key==='+'||event.key==='=')zoom(1.25);if(event.key==='-')zoom(.8);if(event.key==='0')setView(FIT);
  }
  return <section className={`${styles.instrument} ${expanded?styles.expanded:''}`} aria-label="Sky image viewer">
    <div className={styles.instrumentHeading}><span>{sequence?.title ?? 'YOUR OBSERVATORY'}</span><span>{sequence?.data_mode.toUpperCase() ?? 'NO OBSERVATIONS LOADED'}</span></div>
    <div className={styles.tools} role="group" aria-label="Viewer tool">
      {(['time','pan','mark'] as ViewerTool[]).map(value=><button key={value} aria-pressed={tool===value} disabled={!active} onClick={()=>{stop();setTool(value);}}>{value==='time'?'REWIND':value.toUpperCase()}</button>)}
      <button disabled={!active} onClick={()=>zoom(.8)} aria-label="Zoom out">−</button><button disabled={!active} onClick={()=>zoom(1.25)} aria-label="Zoom in">+</button>
      <button disabled={!active} onClick={()=>setView(FIT)}>FIT / RESET</button><button onClick={()=>setExpanded(!expanded)} aria-pressed={expanded}>{expanded?'CONTRACT':'EXPAND'}</button>
    </div>
    <div ref={viewport} className={styles.viewport} style={{aspectRatio:sequence?`${sequence.grid.width_px}/${sequence.grid.height_px}`:'1',cursor:tool==='pan'?'grab':tool==='mark'?'crosshair':'ew-resize'}} tabIndex={0} role="group" aria-label="Observation canvas" aria-describedby="viewer-help" onKeyDown={key} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={()=>{pointers.current.clear();drag.current=null;}}>
      {sequence&&active?<><canvas ref={canvas} className={styles.canvas} style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`,visibility:ready?'visible':'hidden'}} width={sequence.grid.width_px*scale} height={sequence.grid.height_px*scale} aria-label={`Observation ${active.observation_id ?? active.frame_id}`} />{!ready&&<div className={styles.loadState} role="status">{failedIds.includes(active.frame_id)?<>This observation could not be loaded.<button onPointerDown={event=>event.stopPropagation()} onClick={retry}>RETRY IMAGE</button></>:'Loading this observation...'}</div>}</>:<div className={styles.emptyState}><span>ONE SKY. MANY MOMENTS.</span><h2>Find what<br/>time reveals.</h2><p>Choose a target or open saved observations.</p><small>NO SCIENTIFIC IMAGE IS DISPLAYED</small></div>}
    </div>
    <div className={styles.orientation}><span>N ↑ · E ←</span><span>{Math.round(view.zoom*100)}%{view.zoom>1?' · CROPPED VIEW':''}</span><span><i/> No data</span>{sequence&&<span>{sequence.requested_fov_arcmin} arcmin full field</span>}</div>
    <p id="viewer-help" className={styles.hint}>{tool==='time'?'Drag left for earlier, right for later. Arrow keys step observations.':tool==='pan'?'Drag to pan. Scroll or pinch to zoom. Arrow keys move; 0 fits the field.':`Select a pixel, or use arrow keys then Enter. Keyboard cursor: ${cursor.x}, ${cursor.y}.`} Space plays or pauses.</p>
    <PlaybackControls frames={frames} index={index} playing={playing} speed={speed} onSpeed={setSpeed} onIndexChange={selectIndex} onToggle={()=>{setBlink(false);releaseHold();if(!playing&&index===frames.length-1&&frames[0])onFrameChange(frames[0].frame_id);setPlaying(!playing);}} />
    {active&&<div className={styles.comparison}>
      <label>EARLIER / A<select aria-label="Comparison A" value={a} onChange={event=>{stop();setA(Number(event.target.value));}}>{frames.map((frame,i)=><option key={frame.frame_id} value={i}>{i+1}: {observationLabel(frame.observed_start_utc)}</option>)}</select></label>
      <label>LATER / B<select aria-label="Comparison B" value={b} onChange={event=>{stop();setB(Number(event.target.value));}}>{frames.map((frame,i)=><option key={frame.frame_id} value={i}>{i+1}: {observationLabel(frame.observed_start_utc)}</option>)}</select></label>
      <button disabled={a===b} aria-pressed={blink} onClick={()=>{setPlaying(false);releaseHold();onFrameChange(frames[a]!.frame_id);setBlink(!blink);}}>{blink?'STOP BLINK':'BLINK A/B'}</button>
      <button disabled={a===b} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);beginHold();}} onPointerUp={releaseHold} onPointerCancel={releaseHold} onLostPointerCapture={releaseHold} onBlur={releaseHold} onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();beginHold();}}} onKeyUp={event=>{if(event.key===' '||event.key==='Enter')releaseHold();}}>HOLD FOR B</button>
    </div>}
    {sequence&&<details className={styles.provenance}><summary>Observation details & quality</summary><p>{sequence.disclosure}</p><p>{active?.observation_id} · {active?.release} · {active?.wavelength_um?.toFixed(4)} μm · {((active?.masked_fraction ?? 0)*100).toFixed(1)}% masked</p>{active?.source_fits_url&&<a href={active.source_fits_url} target="_blank" rel="noreferrer">Source FITS at IRSA</a>}{[...(sequence.warnings??[]),...(active?.warnings??[])].map((warning,i)=><p key={i}>{warning.message}</p>)}</details>}
  </section>;
}
