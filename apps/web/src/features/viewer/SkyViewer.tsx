"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { ObservationFrame, SkyViewerProps, ViewerTool } from "@/features/explorer/interfaces";
import { PlaybackControls } from "./PlaybackControls";
import { useFrameLoader } from "./useFrameLoader";
import { usePlayback } from "./usePlayback";
import { nearestObservation, observationLabel, timePositions } from "./time";
import { boundedView, clientPointToRaster, FIT, zoomAt } from "./viewport";
import { DisplayRenderer } from './displayRenderer';
import { usePreparedFrames } from './usePreparedFrames';
import { displaySize, type DisplayOptions } from './display';
import styles from "./viewer.module.css";
const EMPTY_FRAMES: ObservationFrame[] = [];

export function SkyViewer(props: SkyViewerProps) {
  return <ObservationConsole key={props.sequence?.sequence_id ?? 'empty'} {...props} />;
}
function ObservationConsole({ sequence, activeFrameId, annotations, selectedCandidateId = null, onFrameChange, onSelect }: SkyViewerProps) {
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<ViewerTool>('time');
  const [view, setView] = useState(FIT), [expanded, setExpanded] = useState(false);
  const [speed, setSpeed] = useState(700), [blink, setBlink] = useState(false);
  const original:DisplayOptions={low:sequence?.display.vmin??0,high:sequence?.display.vmax??1,a:Number(sequence?.processing?.asinh_a??.1),gamma:1,curve:sequence?.display.stretch??'asinh',mask:'quiet',sampling:'smooth',detail:0};
  const [display,setDisplay]=useState<DisplayOptions>({...original,a:.3});
  const [originalHeld,setOriginalHeld]=useState(false),[outputSize,setOutputSize]=useState({width:1,height:1});
  const effectiveDisplay=useMemo(()=>({...display,detail:originalHeld||tool==='mark'?0:display.detail}),[display,originalHeld,tool]);
  const [forceCpu,setForceCpu]=useState(false),[rendererMode,setRendererMode]=useState('Preparing display'),[rendering,setRendering]=useState(false);
  const [adapter,setAdapter]=useState('');
  const [rendererRevision,setRendererRevision]=useState(0);
  const renderer=useRef<DisplayRenderer|null>(null),revision=useRef(0),drawing=useRef(false),latestDraw=useRef<(()=>Promise<void>)|null>(null);
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
  const {rasters,failed:rasterFailed}=usePreparedFrames(frames,sequence?.grid.width_px??0,sequence?.grid.height_px??0,index,[a,b]);
  const raster=active?rasters.get(active.frame_id):undefined;
  const displayAvailable=!!raster&&!rendererMode.startsWith('Original PNG');
  const preparedFailed=!!active&&rasterFailed.includes(active.frame_id);
  const ready=!!active && images.has(active.frame_id)&&(!active.raster||!!raster||preparedFailed);
  const {playing,setPlaying}=usePlayback(frameIds,active?.frame_id ?? null,onFrameChange,speed,ready&&!rendering);
  useLayoutEffect(()=>{renderer.current=new DisplayRenderer(()=>setRendererRevision(value=>value+1),forceCpu);return()=>{revision.current++;latestDraw.current=null;renderer.current?.dispose();renderer.current=null;};},[forceCpu]);

  function releaseHold(){ if(held.current){onFrameChange(held.current);held.current=null;} }
  function stop(){setPlaying(false);setBlink(false);releaseHold();}
  function selectIndex(next:number){stop();if(frames[next])onFrameChange(frames[next].frame_id);}
  function beginHold(){if(!ready||a===b)return;setPlaying(false);setBlink(false);if(!held.current)held.current=active.frame_id;onFrameChange(frames[b]!.frame_id);}
  useEffect(()=>{const release=()=>{setBlink(false);setPlaying(false);setOriginalHeld(false);releaseHold();pointers.current.clear();drag.current=null;};window.addEventListener('blur',release);return()=>window.removeEventListener('blur',release);});
  useEffect(()=>{
    if(!blink||a===b||!images.has(frames[a]?.frame_id ?? '')||!images.has(frames[b]?.frame_id ?? ''))return;
    const timer=window.setInterval(()=>onFrameChange(active?.frame_id===frames[a]!.frame_id?frames[b]!.frame_id:frames[a]!.frame_id),speed);
    return()=>window.clearInterval(timer);
  },[blink,a,b,images,frames,active,onFrameChange,speed]);
  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    const resize=()=>{
      setView(current=>boundedView(current,element.clientWidth,element.clientHeight));
      const size=displaySize(Math.max(1,element.clientWidth*window.devicePixelRatio*view.zoom),Math.max(1,element.clientHeight*window.devicePixelRatio*view.zoom));
      setOutputSize(old=>old.width===size.width&&old.height===size.height?old:size);
    };
    const observer=new ResizeObserver(resize);resize();observer.observe(element);window.addEventListener('resize',resize);
    return()=>{observer.disconnect();window.removeEventListener('resize',resize);};
  },[view.zoom]);
  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    const wheel=(event:WheelEvent)=>{if(tool!=='pan'||!sequence)return;event.preventDefault();const rect=element.getBoundingClientRect();setView(current=>zoomAt(current,Math.exp(-event.deltaY*.002),event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2,rect.width,rect.height));};
    element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
  },[tool,sequence]);
  useLayoutEffect(()=>{
    if(!sequence||!active||!canvas.current)return;
    const context=canvas.current.getContext('2d');if(!context)return;
    const {width,height}=outputSize,scaleX=width/sequence.grid.width_px,scaleY=height/sequence.grid.height_px;
    context.clearRect(0,0,width,height);
    const token=++revision.current,image=images.get(active.frame_id);if(!image||!ready)return;
    setRendering(true);
    latestDraw.current=async()=>{
      let rendered:HTMLCanvasElement|ImageBitmap|ImageData|HTMLImageElement=image;
      try{
        if(raster&&renderer.current)rendered=await renderer.current.render(raster,effectiveDisplay,outputSize);
        if(token!==revision.current)return;
        context.fillStyle='#273140';context.fillRect(0,0,width,height);context.imageSmoothingEnabled=false;
        if(rendered instanceof ImageData){const temporary=document.createElement('canvas');temporary.width=rendered.width;temporary.height=rendered.height;temporary.getContext('2d')!.putImageData(rendered,0,0);context.drawImage(temporary,0,0,width,height);}
        else context.drawImage(rendered,0,0,width,height);
        context.strokeStyle='#f3bc60';context.lineWidth=Math.max(2,width/400);
        // Every frame shares one grid, so a mark is the same sky position on every epoch.
        // Solid on the observation it was made on, dashed on the others, numbered as in the list.
        annotations.filter(note=>note.selection.sequenceId===sequence.sequence_id).forEach((note,number)=>{
          const radius=Math.max(10,width/40),x=(note.selection.x+.5)*scaleX,y=(note.selection.y+.5)*scaleY,selected=note.id===selectedCandidateId;
          context.save();context.strokeStyle=context.fillStyle=selected?'#79c7e8':'#f3bc60';context.lineWidth=Math.max(2,width/400)*(selected?1.8:1);
          context.setLineDash(note.selection.frameId===active.frame_id?[]:[radius/3,radius/4]);context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.stroke();
          context.setLineDash([]);context.font=`${Math.max(14,Math.round(width/36))}px monospace`;context.fillText(String(number+1).padStart(2,'0'),x+radius*.75,y-radius*.75);context.restore();
        });
        if(tool==='mark'){context.strokeStyle='#79c7e8';context.strokeRect(cursor.x*scaleX,cursor.y*scaleY,scaleX,scaleY);}
        setRendererMode(raster?(renderer.current?.mode??'CPU canvas'):'Original PNG');setAdapter(raster?(renderer.current?.adapter??''):'');setRendering(false);
      }catch{if(token===revision.current){context.fillStyle='#273140';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);setRendererMode('Original PNG: display renderer unavailable');setRendering(false);}}
      finally{if(rendered instanceof ImageBitmap)rendered.close();}
    };
    if(!drawing.current){drawing.current=true;void(async()=>{while(latestDraw.current){const job=latestDraw.current;latestDraw.current=null;await job();}drawing.current=false;})();}
  },[sequence,active,images,annotations,selectedCandidateId,outputSize,cursor,tool,raster,ready,effectiveDisplay,forceCpu,rendererRevision]);
  function mark(x:number,y:number){
    if(!sequence||!active||!ready)return;
    // Validity comes from the verified raster mask; a PNG-only frame cannot say.
    const pixelHasData=raster?raster.valid[y*raster.width+x]===1:null;
    const comparison=a!==b&&frames[a]&&frames[b]?{aFrameId:frames[a].frame_id,bFrameId:frames[b].frame_id}:null;
    onSelect({sequenceId:sequence.sequence_id,frameId:active.frame_id,x,y,coordinateSpace:'natural-raster',pixelOrigin:'top-left',comparison,pixelHasData});
  }
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
    {active&&<p className={styles.activeDate}>{observationLabel(active.observed_start_utc)}</p>}
    <div className={styles.tools} role="group" aria-label="Viewer tool">
      {(['time','pan','mark'] as ViewerTool[]).map(value=><button key={value} aria-pressed={tool===value} disabled={!active} onClick={()=>{stop();setTool(value);}}>{value==='time'?'REWIND':value.toUpperCase()}</button>)}
      <button disabled={!active} onClick={()=>zoom(.8)} aria-label="Zoom out">−</button><button disabled={!active} onClick={()=>zoom(1.25)} aria-label="Zoom in">+</button>
      <button disabled={!active} onClick={()=>setView(FIT)}>FIT / RESET</button><button onClick={()=>setExpanded(!expanded)} aria-pressed={expanded}>{expanded?'CONTRACT':'EXPAND'}</button>
    </div>
    <div ref={viewport} className={styles.viewport} style={{aspectRatio:sequence?`${sequence.grid.width_px}/${sequence.grid.height_px}`:'1',cursor:tool==='pan'?'grab':tool==='mark'?'crosshair':'ew-resize'}} tabIndex={0} role="group" aria-label="Observation canvas" aria-describedby="viewer-help" onKeyDown={key} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={()=>{pointers.current.clear();drag.current=null;}}>
      {sequence&&active?<><canvas ref={canvas} className={styles.canvas} data-sampling={displayAvailable?display.sampling:'pixels'} style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`,visibility:ready&&!rendering?'visible':'hidden'}} width={outputSize.width} height={outputSize.height} aria-label={`Observation ${active.observation_id ?? active.frame_id}`} />{(!ready||rendering)&&<div className={styles.loadState} role="status">{failedIds.includes(active.frame_id)?<>This observation could not be loaded.<button onPointerDown={event=>event.stopPropagation()} onClick={retry}>RETRY IMAGE</button></>:'Loading this observation...'}</div>}</>:<div className={styles.emptyState}><span>ONE SKY. MANY MOMENTS.</span><h2>Find what<br/>time reveals.</h2><p>Choose a target or open saved observations.</p><small>NO SCIENTIFIC IMAGE IS DISPLAYED</small></div>}
    </div>
    <div className={styles.orientation}><span>N ↑ · E ←</span><span>{Math.round(view.zoom*100)}%{view.zoom>1?' · CROPPED VIEW':''}</span><span><i/> No data</span>{sequence&&<span>{sequence.requested_fov_arcmin} arcmin full field</span>}</div>
    <p id="viewer-help" className={styles.hint}>{tool==='time'?'Drag left for earlier, right for later. Arrow keys step observations.':tool==='pan'?'Drag to pan. Scroll or pinch to zoom. Arrow keys move; 0 fits the field.':`Select a pixel, or use arrow keys then Enter. Keyboard cursor: ${cursor.x}, ${cursor.y}.`} Space plays or pauses.</p>
    {active&&<div className={styles.imageModes}>
      <div role="group" aria-label="Image sampling">
        <button disabled={!displayAvailable} aria-pressed={displayAvailable&&display.sampling==='smooth'} onClick={()=>setDisplay(old=>({...old,sampling:'smooth'}))}>SMOOTH</button>
        <button disabled={!displayAvailable} aria-pressed={!displayAvailable||display.sampling==='pixels'} onClick={()=>setDisplay(old=>({...old,sampling:'pixels'}))}>PIXELS</button>
      </div>
      <button disabled={!displayAvailable||tool==='mark'} aria-pressed={displayAvailable&&(display.detail??0)>0} onClick={()=>setDisplay(old=>({...old,detail:old.detail?0:.35}))}>DETAIL EXPERIMENT</button>
      <button disabled={!displayAvailable||!display.detail||tool==='mark'} onPointerDown={event=>{stop();event.currentTarget.setPointerCapture(event.pointerId);setOriginalHeld(true);}} onPointerUp={()=>setOriginalHeld(false)} onPointerCancel={()=>setOriginalHeld(false)} onLostPointerCapture={()=>setOriginalHeld(false)} onBlur={()=>setOriginalHeld(false)} onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();stop();setOriginalHeld(true);}}} onKeyUp={event=>{if(event.key===' '||event.key==='Enter')setOriginalHeld(false);}}>HOLD ORIGINAL</button>
      <p className={styles.hint} data-detail={displayAvailable&&effectiveDisplay.detail?'on':'off'}>{!displayAvailable?'PREPARED PNG: interactive intensity display is unavailable.':tool==='mark'?'Mark uses original intensities. Detail is paused.':effectiveDisplay.detail?'EXPERIMENTAL DETAIL: visual emphasis only. Hold original to compare without it.':'ORIGINAL INTENSITIES: smooth viewing adds no measured resolution.'}</p>
    </div>}
    <PlaybackControls frames={frames} index={index} playing={playing} speed={speed} onSpeed={setSpeed} onIndexChange={selectIndex} onToggle={()=>{setBlink(false);releaseHold();if(!playing&&index===frames.length-1&&frames[0])onFrameChange(frames[0].frame_id);setPlaying(!playing);}} />
    {active&&<div className={styles.comparison}>
      <label>REFERENCE / A<select aria-label="Comparison A" value={a} onChange={event=>{stop();setA(Number(event.target.value));}}>{frames.map((frame,i)=><option key={frame.frame_id} value={i}>{i+1}: {observationLabel(frame.observed_start_utc)}</option>)}</select></label>
      <label>COMPARE / B<select aria-label="Comparison B" value={b} onChange={event=>{stop();setB(Number(event.target.value));}}>{frames.map((frame,i)=><option key={frame.frame_id} value={i}>{i+1}: {observationLabel(frame.observed_start_utc)}</option>)}</select></label>
      <button disabled={a===b} aria-pressed={blink} onClick={()=>{setPlaying(false);releaseHold();onFrameChange(frames[a]!.frame_id);setBlink(!blink);}}>{blink?'STOP BLINK':'BLINK A/B'}</button>
      <button disabled={a===b} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);beginHold();}} onPointerUp={releaseHold} onPointerCancel={releaseHold} onLostPointerCapture={releaseHold} onBlur={releaseHold} onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();beginHold();}}} onKeyUp={event=>{if(event.key===' '||event.key==='Enter')releaseHold();}}>HOLD FOR B</button>
    </div>}
    {active&&<details className={styles.displayControls}>
      <summary>IMAGE DISPLAY <span data-renderer={rendererMode}>{rendererMode}</span></summary>
      {preparedFailed&&<p role="status">Interactive intensity data could not be verified. Showing the original prepared PNG.</p>}
      {!active.raster&&<p>This sequence contains prepared PNGs only. Intensity adjustments need aligned raster data.</p>}
      <fieldset disabled={!displayAvailable}>
        <label>Black level<input aria-label="Black level" type="range" min={original.low-(original.high-original.low)*.2} max={Math.min(original.high,display.high)-(original.high-original.low)*.01} step={(original.high-original.low)/500} value={display.low} onChange={event=>setDisplay(old=>({...old,low:Number(event.target.value)}))}/></label>
        <label>White level<input aria-label="White level" type="range" min={Math.max(original.low,display.low)+(original.high-original.low)*.01} max={original.high+(original.high-original.low)} step={(original.high-original.low)/500} value={display.high} onChange={event=>setDisplay(old=>({...old,high:Number(event.target.value)}))}/></label>
        <label>Stretch<select aria-label="Display stretch" value={display.curve} onChange={event=>setDisplay(old=>({...old,curve:event.target.value as DisplayOptions['curve']}))}><option value="asinh">Asinh</option><option value="linear">Linear</option></select></label>
        <label>Asinh softness<input aria-label="Asinh softness" type="range" min="0.05" max="1" step=".01" value={display.a} disabled={display.curve!=='asinh'} onChange={event=>setDisplay(old=>({...old,a:Number(event.target.value)}))}/></label>
        <label>Gamma<input aria-label="Gamma" type="range" min=".5" max="2" step=".05" value={display.gamma} onChange={event=>setDisplay(old=>({...old,gamma:Number(event.target.value)}))}/></label>
        <label>No-data style<select aria-label="No-data style" value={display.mask} onChange={event=>setDisplay(old=>({...old,mask:event.target.value as DisplayOptions['mask']}))}><option value="quiet">Quiet slate</option><option value="hatch">Detailed hatch</option></select></label>
        <label>Detail amount (experimental)<input aria-label="Detail amount" type="range" min="0" max=".5" step=".05" value={display.detail??0} disabled={tool==='mark'} onChange={event=>setDisplay(old=>({...old,detail:Number(event.target.value)}))}/></label>
        <button onClick={()=>setDisplay({...original,a:.3})}>QUIET PRESET</button><button onClick={()=>setDisplay(original)}>ORIGINAL / RESET</button>
      </fieldset>
      <label className={styles.rendererChoice}>Rendering <select aria-label="Rendering mode" value={forceCpu?'cpu':'auto'} onChange={event=>setForceCpu(event.target.value==='cpu')}><option value="auto">Automatic GPU / CPU</option><option value="cpu">CPU</option></select></label>
      <p className={styles.hint} data-adapter={adapter}>{rendererMode==='WebGL2'?`Graphics adapter: ${adapter}`:rendererMode.startsWith('CPU')?'CPU display active. GPU availability depends on this browser and device.':''}</p>
      <p className={styles.hint}>One display setting across all epochs. Black {display.low.toPrecision(4)} / white {display.high.toPrecision(4)} MJy/sr | {display.curve} {display.a.toFixed(2)} | gamma {display.gamma.toFixed(2)}. Display changes do not add measured detail.</p>
    </details>}
    {sequence&&<details className={styles.provenance}><summary>Observation details & quality</summary><p>{sequence.disclosure}</p><p>{active?.observation_id} · {active?.release} · {active?.wavelength_um?.toFixed(4)} μm · {((active?.masked_fraction ?? 0)*100).toFixed(1)}% masked</p>{active?.source_fits_url&&<a href={active.source_fits_url} target="_blank" rel="noreferrer">Source FITS at IRSA</a>}{[...(sequence.warnings??[]),...(active?.warnings??[])].map((warning,i)=><p key={i}>{warning.message}</p>)}</details>}
  </section>;
}
