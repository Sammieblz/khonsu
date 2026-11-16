"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { ObservationFrame, SkyViewerProps, ViewerTool } from "@/features/explorer/interfaces";
import { PlaybackControls } from "./PlaybackControls";
import { describeComparison } from "./comparison";
import { useFrameLoader } from "./useFrameLoader";
import { usePlayback } from "./usePlayback";
import { nearestObservation, observationLabel, timePositions } from "./time";
import { boundedImageView, centerImageField, clientPointToRaster, FIT, nativeSampling, visibleImageField, zoomImageAt, fittedImage, fillImage } from "./viewport";
import { DisplayRenderer } from './displayRenderer';
import { ObservationDetails } from '@/features/annotations/ObservationDetails';
import { ContextPanel } from '@/features/context/ContextPanel';
import { GaiaLayer } from '@/features/context/GaiaLayer';
import { useGaia } from '@/features/context/useGaia';
import { qualityOverlay } from '@/features/context/quality';
import { usePreparedFrames } from './usePreparedFrames';
import { displaySize, measuredResolution, HD_DISPLAY_SIDE, MAX_DISPLAY_SIDE, type AutoResolution, type DisplayOptions } from './display';
import styles from "./viewer.module.css";
import {Inspector,INSPECTOR_TABS,type InspectorTab} from '@/features/explorer/Inspector';
import {useViewerSetting} from '@/features/explorer/ViewerMemory';
const EMPTY_FRAMES: ObservationFrame[] = [];
const CLEAN_VIEW_KEY='khonsu.clean-view.v1';

export function SkyViewer(props: SkyViewerProps) {
  return <ObservationConsole key={props.sequence?.sequence_id ?? 'empty'} {...props} />;
}
function ObservationConsole({ sequence, activeFrameId, annotations, selectedCandidateId = null, onFrameChange, onSelect,fieldPanel,notesPanel,loadingFeedback,onPresentationState }: SkyViewerProps) {
  const memoryKey=sequence?.sequence_id??'empty';
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useViewerSetting<ViewerTool>(memoryKey,'tool','time');
  const [gaiaEnabled,setGaiaEnabled]=useViewerSetting(memoryKey,'gaiaEnabled',false),[wiseEnabled,setWiseEnabled]=useViewerSetting(memoryKey,'wiseEnabled',false),[qualityEnabled,setQualityEnabled]=useViewerSetting(memoryKey,'qualityEnabled',false);
  const [selectedSource,setSelectedSource]=useState('');
  const [panel,setPanel]=useViewerSetting<InspectorTab>(memoryKey,'panel',sequence?'display':'field');
  const [showMarks,setShowMarks]=useViewerSetting(memoryKey,'marks',true),[showLabels,setShowLabels]=useViewerSetting(memoryKey,'labels',true);
  function openPanel(tab:InspectorTab){setPanel(tab);setExpanded(false);}
  useEffect(()=>{if(matchMedia('(max-width: 1099px), (max-height: 599px)').matches)setExpanded(true);const field=()=>openPanel('field');window.addEventListener('khonsu:field',field);return()=>window.removeEventListener('khonsu:field',field);},[]);
  useEffect(()=>{const inspect=(event:Event)=>{const detail=(event as CustomEvent).detail??{};if(INSPECTOR_TABS.includes(detail.panel))openPanel(detail.panel);if(['time','pan','mark','inspect'].includes(detail.tool)){stop();setTool(detail.tool);}if(detail.close)setExpanded(true);};window.addEventListener('khonsu:inspect',inspect);return()=>window.removeEventListener('khonsu:inspect',inspect);},[]);
  const gaia=useGaia(sequence,gaiaEnabled);
  const [view, setView] = useViewerSetting(memoryKey,'view',FIT), [expanded, setExpanded] = useState(false);
  const [speed, setSpeed] = useViewerSetting(memoryKey,'speed',700), [blink, setBlink] = useState(false);
  const original:DisplayOptions={low:sequence?.display.vmin??0,high:sequence?.display.vmax??1,a:Number(sequence?.processing?.asinh_a??.1),gamma:1,curve:sequence?.display.stretch??'asinh',mask:'subtle',sampling:'smooth',detail:0,includeWarnings:false};
  const [display,setDisplay]=useViewerSetting<DisplayOptions>(memoryKey,'display',{...original,a:.3});
  const [originalHeld,setOriginalHeld]=useState(false),[outputSize,setOutputSize]=useState({width:1,height:1});
  const [cleanView,setCleanView]=useViewerSetting(memoryKey,'cleanView',true),[showEstimates,setShowEstimates]=useViewerSetting(memoryKey,'showEstimates',false),[originalShown,setOriginalShown]=useState(false);
  useEffect(()=>{try{const saved=localStorage.getItem(CLEAN_VIEW_KEY);if(saved==='off')setCleanView(false);}catch{/* Optional preference storage. */}},[]);
  const [viewportSize,setViewportSize]=useViewerSetting(memoryKey,'viewportSize',{width:1,height:1});
  const [resolution,setResolution]=useViewerSetting<'auto'|'hd'|'4k'>(memoryKey,'resolution','auto'),[autoResolution,setAutoResolution]=useState<AutoResolution>('checking');
  const [renderMs,setRenderMs]=useState<number|null>(null);
  const maxSide=resolution==='4k'||(resolution==='auto'&&autoResolution==='4k')?MAX_DISPLAY_SIDE:HD_DISPLAY_SIDE;
  const effectiveDisplay=useMemo(()=>({...display,detail:originalHeld||originalShown||tool==='mark'?0:display.detail,includeWarnings:originalHeld||originalShown||tool==='mark'?false:display.includeWarnings,reduceGrain:!originalHeld&&!originalShown&&tool!=='mark'&&display.reduceGrain,softHighlights:!originalHeld&&!originalShown&&tool!=='mark'&&display.softHighlights,cleanView:cleanView&&!originalHeld&&!originalShown&&tool!=='mark',showEstimates}),[display,originalHeld,originalShown,tool,cleanView,showEstimates]);
  const [forceCpu,setForceCpu]=useViewerSetting(memoryKey,'forceCpu',false),[rendererMode,setRendererMode]=useState('Preparing display'),[rendering,setRendering]=useState(false);
  const [adapter,setAdapter]=useState('');
  const [rendererRevision,setRendererRevision]=useState(0);
  const renderer=useRef<DisplayRenderer|null>(null),revision=useRef(0),drawing=useRef(false),latestDraw=useRef<(()=>Promise<void>)|null>(null);
  const [a, setA] = useViewerSetting(memoryKey,'a',0), [b, setB] = useViewerSetting(memoryKey,'b',Math.max(0,(sequence?.frames.length ?? 1)-1));
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
  const warningsShown=displayAvailable&&!!raster?.warning&&!!effectiveDisplay.includeWarnings;
  const cleanAvailable=displayAvailable&&!!raster?.estimated;
  const estimatesShown=cleanAvailable&&!!effectiveDisplay.cleanView;
  const refinementAvailable=displayAvailable&&!!raster?.refinedValues;
  const refinementShown=displayAvailable&&(!!effectiveDisplay.softHighlights||(refinementAvailable&&!!effectiveDisplay.reduceGrain));
  const preparedFailed=!!active&&rasterFailed.includes(active.frame_id);
  const frameReady=(frame:ObservationFrame|undefined)=>!!frame&&images.has(frame.frame_id)&&(!frame.raster||rasters.has(frame.frame_id)||rasterFailed.includes(frame.frame_id));
  const ready=frameReady(active),comparisonReady=a!==b&&frameReady(frames[a])&&frameReady(frames[b]);
  const nativeAcross=sequence?nativeSampling(sequence.requested_fov_arcmin,sequence.processing?.native_pixel_scale_arcsec):null;
  const geometry={stageWidth:viewportSize.width,stageHeight:viewportSize.height,rasterWidth:sequence?.grid.width_px??1,rasterHeight:sequence?.grid.height_px??1};
  const geometryRef=useRef(geometry);geometryRef.current=geometry;
  const fit=fittedImage(geometry),region=visibleImageField(view,geometry);
  const fitStyle={left:fit.left,top:fit.top,width:fit.width,height:fit.height};
  const presentationPhase=!active?'empty':failedIds.includes(active.frame_id)?'failed':ready&&!rendering?'ready':'loading';
  useEffect(()=>{onPresentationState?.({sequenceId:sequence?.sequence_id??null,frameId:active?.frame_id??null,phase:presentationPhase});},[sequence?.sequence_id,active?.frame_id,presentationPhase,onPresentationState]);
  const {playing,setPlaying}=usePlayback(frameIds,active?.frame_id ?? null,onFrameChange,speed,ready&&!rendering);
  useLayoutEffect(()=>{renderer.current=new DisplayRenderer(()=>setRendererRevision(value=>value+1),forceCpu);return()=>{revision.current++;latestDraw.current=null;renderer.current?.dispose();renderer.current=null;};},[forceCpu]);

  function releaseHold(){ if(held.current){onFrameChange(held.current);held.current=null;} }
  function stop(){setPlaying(false);setBlink(false);releaseHold();}
  function toggleClean(){stop();const next=originalShown?true:!cleanView;setOriginalShown(false);setCleanView(next);try{localStorage.setItem(CLEAN_VIEW_KEY,next?'on':'off');}catch{/* Keep controls usable without storage. */}}
  function selectIndex(next:number){stop();if(frames[next])onFrameChange(frames[next].frame_id);}
  function beginHold(){if(!active||!ready||a===b)return;setPlaying(false);setBlink(false);if(!held.current)held.current=active.frame_id;onFrameChange(frames[b]!.frame_id);}
  useEffect(()=>{const release=()=>{setBlink(false);setPlaying(false);setOriginalHeld(false);releaseHold();pointers.current.clear();drag.current=null;};window.addEventListener('blur',release);return()=>window.removeEventListener('blur',release);});
  useEffect(()=>{
    if(!blink||!comparisonReady||!ready||rendering)return;
    // Start the viewing interval only after this frame has actually appeared.
    const timer=window.setTimeout(()=>onFrameChange(active?.frame_id===frames[a]!.frame_id?frames[b]!.frame_id:frames[a]!.frame_id),speed);
    return()=>window.clearTimeout(timer);
  },[blink,comparisonReady,ready,rendering,a,b,frames,active,onFrameChange,speed]);
  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    const resize=()=>{
      const previous=geometryRef.current;
      const next={...previous,stageWidth:element.clientWidth,stageHeight:element.clientHeight};
      const nextFit=fittedImage(next),oldFit=fittedImage(previous);
      setView(current=>boundedImageView({...current,x:current.x*nextFit.width/Math.max(1,oldFit.width),y:current.y*nextFit.height/Math.max(1,oldFit.height)},next));
      setViewportSize({width:element.clientWidth,height:element.clientHeight});
      const scale=resolution==='4k'?MAX_DISPLAY_SIDE/Math.max(1,nextFit.width,nextFit.height):window.devicePixelRatio*view.zoom;
      const size=displaySize(Math.max(1,nextFit.width*scale),Math.max(1,nextFit.height*scale),maxSide);
      setOutputSize(old=>old.width===size.width&&old.height===size.height?old:size);
    };
    const observer=new ResizeObserver(resize);resize();observer.observe(element);window.addEventListener('resize',resize);
    return()=>{observer.disconnect();window.removeEventListener('resize',resize);};
  },[view.zoom,maxSide,resolution]);
  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    const wheel=(event:WheelEvent)=>{if(tool!=='pan'||!sequence)return;event.preventDefault();const rect=element.getBoundingClientRect();setView(current=>zoomImageAt(current,Math.exp(-event.deltaY*.002),event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2,geometryRef.current));};
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
      const started=performance.now();
      let rendered:HTMLCanvasElement|ImageBitmap|ImageData|HTMLImageElement=image;
      try{
        if(raster&&renderer.current)rendered=await renderer.current.render(raster,effectiveDisplay,outputSize);
        if(token!==revision.current)return;
        context.fillStyle=effectiveDisplay.mask==='subtle'?'#070b12':'#273140';context.fillRect(0,0,width,height);context.imageSmoothingEnabled=false;
        if(rendered instanceof ImageData){const temporary=document.createElement('canvas');temporary.width=rendered.width;temporary.height=rendered.height;temporary.getContext('2d')!.putImageData(rendered,0,0);context.drawImage(temporary,0,0,width,height);}
        else context.drawImage(rendered,0,0,width,height);
        if(qualityEnabled&&raster){
          const overlay=document.createElement('canvas');overlay.width=raster.width;overlay.height=raster.height;
          overlay.getContext('2d')!.putImageData(new ImageData(qualityOverlay(raster),raster.width,raster.height),0,0);
          context.drawImage(overlay,0,0,width,height);
        }
        context.strokeStyle='#f3bc60';context.lineWidth=Math.max(2,width/400);
        // Every frame shares one grid, so a mark is the same sky position on every epoch.
        // Solid on the observation it was made on, dashed on the others, numbered as in the list.
        annotations.filter(note=>showMarks&&note.selection.sequenceId===sequence.sequence_id).forEach((note,number)=>{
          const radius=Math.max(10,width/40),x=(note.selection.x+.5)*scaleX,y=(note.selection.y+.5)*scaleY,selected=note.id===selectedCandidateId;
          context.save();context.strokeStyle=context.fillStyle=selected?'#79c7e8':'#f3bc60';context.lineWidth=Math.max(2,width/400)*(selected?1.8:1);
          context.setLineDash(note.selection.frameId===active.frame_id?[]:[radius/3,radius/4]);context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.stroke();
          context.setLineDash([]);context.font=`${Math.max(14,Math.round(width/36))}px monospace`;if(showLabels)context.fillText(String(number+1).padStart(2,'0'),x+radius*.75,y-radius*.75);context.restore();
        });
        if(tool==='mark'||tool==='inspect'){context.strokeStyle='#79c7e8';context.strokeRect(cursor.x*scaleX,cursor.y*scaleY,scaleX,scaleY);}
        const mode=raster?(renderer.current?.mode??'CPU canvas'):'Original PNG';
        // Include the next presentation opportunity, not just GPU submission.
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if(token!==revision.current)return;
        const elapsed=performance.now()-started;setRenderMs(elapsed);
        setAutoResolution(current=>measuredResolution(current,mode,elapsed));
        setRendererMode(mode);setAdapter(raster?(renderer.current?.adapter??''):'');setRendering(false);
      }catch{if(token===revision.current){context.fillStyle='#070b12';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);setRendererMode('Original PNG: display renderer unavailable');setAutoResolution('hd');setRendering(false);}}
      finally{if(rendered instanceof ImageBitmap)rendered.close();}
    };
    if(!drawing.current){drawing.current=true;void(async()=>{while(latestDraw.current){const job=latestDraw.current;latestDraw.current=null;await job();}drawing.current=false;})();}
  },[sequence,active,images,annotations,selectedCandidateId,outputSize,cursor,tool,raster,ready,effectiveDisplay,forceCpu,rendererRevision,qualityEnabled,showMarks,showLabels]);
  function mark(x:number,y:number){
    if(!sequence||!active||!ready)return;
    // Validity comes from the verified raster mask; a PNG-only frame cannot say.
    const pixelHasData=raster?raster.valid[y*raster.width+x]===1:null;
    const pixelQuality=raster?(pixelHasData?'strict-valid':raster.warning?.[y*raster.width+x]===1?'warning-only':'unavailable'):'unknown';
    const comparison=a!==b&&frames[a]&&frames[b]?{aFrameId:frames[a].frame_id,bFrameId:frames[b].frame_id}:null;
    onSelect({sequenceId:sequence.sequence_id,frameId:active.frame_id,x,y,coordinateSpace:'natural-raster',pixelOrigin:'top-left',comparison,pixelHasData,pixelQuality});
  }
  function pointerDown(event:PointerEvent<HTMLDivElement>){
    if(!active)return;stop();event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus({preventScroll:true});
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});drag.current={x:event.clientX,y:event.clientY,position:positions[index] ?? 0,moved:false};
  }
  function pointerMove(event:PointerEvent<HTMLDivElement>){
    const previous=pointers.current.get(event.pointerId), start=drag.current,rect=event.currentTarget.getBoundingClientRect();
    if(!previous||!start)return;
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>3)start.moved=true;
    if(tool==='pan'){
      const other=[...pointers.current.entries()].find(([id])=>id!==event.pointerId)?.[1];
      if(other){const oldDistance=Math.hypot(previous.x-other.x,previous.y-other.y),distance=Math.hypot(event.clientX-other.x,event.clientY-other.y);if(oldDistance>0)setView(current=>zoomImageAt(current,distance/oldDistance,(event.clientX+other.x)/2-rect.left-rect.width/2,(event.clientY+other.y)/2-rect.top-rect.height/2,geometry));}
      else setView(current=>boundedImageView({...current,x:current.x+event.clientX-previous.x,y:current.y+event.clientY-previous.y},geometry));
    } else if(tool==='time') {const next=nearestObservation(positions,start.position+(event.clientX-start.x)/rect.width);if(frames[next])onFrameChange(frames[next].frame_id);}
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
  }
  function pointerEnd(event:PointerEvent<HTMLDivElement>){
    if(event.type==='pointerup'&&(tool==='mark'||tool==='inspect')&&!rendering&&!drag.current?.moved&&sequence&&canvas.current){const point=clientPointToRaster(event.clientX,event.clientY,canvas.current.getBoundingClientRect(),sequence.grid.width_px,sequence.grid.height_px);if(point){setCursor(point);if(tool==='mark'){mark(point.x,point.y);openPanel('notes');}}}
    pointers.current.delete(event.pointerId);drag.current=null;
  }
  function zoom(factor:number){const element=viewport.current;if(element)setView(current=>zoomImageAt(current,factor,0,0,geometry));}
  function key(event:KeyboardEvent<HTMLDivElement>){
    if(!active)return;
    if(event.key==='Escape'){stop();setExpanded(false);return;}
    const delta: [number,number] | null=event.key==='ArrowLeft'?[-1,0]:event.key==='ArrowRight'?[1,0]:event.key==='ArrowUp'?[0,-1]:event.key==='ArrowDown'?[0,1]:null;
    if(delta){event.preventDefault();stop();if(tool==='time')selectIndex(Math.max(0,Math.min(frames.length-1,index+(delta[0]||-delta[1]))));else if(tool==='pan'&&viewport.current)setView(current=>boundedImageView({...current,x:current.x-delta[0]*24,y:current.y-delta[1]*24},geometry));else if(sequence)setCursor(current=>({x:Math.max(0,Math.min(sequence.grid.width_px-1,current.x+delta[0])),y:Math.max(0,Math.min(sequence.grid.height_px-1,current.y+delta[1]))}));}
    if(event.key==='Enter'&&tool==='mark'){event.preventDefault();mark(cursor.x,cursor.y);openPanel('notes');}
    if(event.key===' '){event.preventDefault();setBlink(false);setPlaying(!playing);}
    if(event.key==='+'||event.key==='=')zoom(1.25);if(event.key==='-')zoom(.8);if(event.key==='0')setView(FIT);
  }
  const layerPanel=sequence&&active&&<ContextPanel sequence={sequence} active={active} raster={raster} cursor={cursor} estimatesShown={estimatesShown}
      gaiaEnabled={gaiaEnabled} onGaia={setGaiaEnabled} gaia={gaia} selected={selectedSource} onSelect={id=>{stop();setSelectedSource(id);}}
      wiseEnabled={wiseEnabled} onWise={setWiseEnabled} qualityEnabled={qualityEnabled} onQuality={setQualityEnabled}
      onInspect={()=>{stop();setTool('inspect');viewport.current?.focus({preventScroll:true});}}/>;
  const cleanPanel=active&&<div className={styles.cleanControls} role="group" aria-label="Clean view controls">
      <button aria-pressed={estimatesShown} disabled={!cleanAvailable||tool==='mark'} onClick={toggleClean}>CLEAN VIEW</button>
      <button aria-pressed={originalShown} disabled={!displayAvailable||tool==='mark'} onClick={()=>{stop();setOriginalShown(value=>!value);}}>SHOW ORIGINAL</button>
      <button aria-pressed={showEstimates&&estimatesShown} disabled={!estimatesShown} onClick={()=>{stop();setShowEstimates(value=>!value);}}>SHOW ESTIMATED AREAS</button>
      <button aria-pressed={refinementShown} disabled={!refinementAvailable||tool==='mark'} onClick={()=>{stop();setOriginalShown(false);const next=!refinementShown;setDisplay(old=>({...old,reduceGrain:next,softHighlights:next,detail:0}));}}>REFINE IMAGE</button>
      <p className={styles.cleanNotice} data-clean-view={estimatesShown?'on':'off'} role="status">
        {tool==='mark'?'Original shown while marking. Estimates are excluded from measurements.':raster?.gapFillFailed?'Clean View could not load. Missing areas remain unfilled.':!displayAvailable?(ready?'Original observation shown. Clean View is unavailable for this image.':'Loading the original observation.'):estimatesShown?`Missing areas are visually estimated (${((active.estimated_fraction??0)*100).toFixed(1)}%). ${showEstimates?'Amber stripes show estimated areas.':Math.max(0,(active.masked_fraction??0)-(active.estimated_fraction??0))>1e-7?'Larger gaps remain visible.':'Use Original to inspect the missing areas.'} Estimates can hide unknown features.`:originalShown||originalHeld?'Original observation shown. Visual refinements are paused.':cleanAvailable?`${refinementShown?'Gaps are shown.':'Original observation shown.'} Turn on Clean View to estimate bounded gaps.`:'No eligible gaps in this observation.'}
      </p>
      <p className={styles.cleanNotice} data-refinement={refinementShown?'on':'off'}>{refinementShown?`${effectiveDisplay.reduceGrain&&refinementAvailable?'Grain softened. ':''}${effectiveDisplay.softHighlights?'Bright areas gently compressed. ':''}Faint features may soften; compare Original when checking changes.`:raster?.refinementFailed?'Image refinement could not load. Original samples remain available.':tool==='mark'?'Image refinement pauses while marking.':refinementAvailable?'Refine Image softens grain and bright areas. It starts off.':'Native grain reduction is unavailable for this observation.'}</p>
    </div>;
  const comparePanel=active&&<div className={styles.comparison}>
      <label>REFERENCE / A<select aria-label="Comparison A" value={a} onChange={event=>{stop();setA(Number(event.target.value));}}>{frames.map((frame,i)=><option key={frame.frame_id} value={i}>{i+1}: {observationLabel(frame.observed_start_utc)}</option>)}</select></label>
      <label>COMPARE / B<select aria-label="Comparison B" value={b} onChange={event=>{stop();setB(Number(event.target.value));}}>{frames.map((frame,i)=><option key={frame.frame_id} value={i}>{i+1}: {observationLabel(frame.observed_start_utc)}</option>)}</select></label>
      {blink&&a!==b&&!comparisonReady&&<p className={styles.comparisonStatus} role="status">{[a,b].some(i=>failedIds.includes(frames[i]?.frame_id ?? ''))?<>Observation {[a,b].filter(i=>failedIds.includes(frames[i]?.frame_id ?? '')).map(i=>i===a?'A':'B').join(' and ')} could not be loaded, so blinking is paused. <button onClick={retry}>RETRY IMAGE</button></>:'Blinking starts when both observations have loaded.'}</p>}
      {(()=>{const comparison=sequence?describeComparison(sequence,a,b):null;if(!comparison)return null;return <div className={styles.comparisonNotes}>
        <p>{comparison.sides[0]}</p><p>{comparison.sides[1]}</p>
        {comparison.notes.length>0&&<ul aria-label="Limits of this comparison">{comparison.notes.map(note=><li key={note}>{note}</li>)}</ul>}
      </div>;})()}
    </div>;
  const advancedPanel=active&&<details className={styles.displayControls}>
      <summary>ADVANCED IMAGE DISPLAY <span data-renderer={rendererMode}>{rendererMode}</span></summary>
      {sequence&&<p className={styles.samplingReadout} data-native-samples={nativeAcross??undefined}>
        {nativeAcross===null?'Native sampling unavailable':`About ${Math.round(nativeAcross)} native samples across the full field`} · {sequence.grid.width_px} × {sequence.grid.height_px} prepared pixels · {outputSize.width} × {outputSize.height} display pixels.
        {nativeAcross!==null&&<> Enlarging the view does not add measured detail.</>}
      </p>}
      {active&&<p className={styles.hint} data-quality={warningsShown?'warnings':'strict'}>{warningsShown?'WARNING SAMPLES VISIBLE. These are excluded from trusted measurements.':'STRICT SOURCE SAMPLES. Any Clean View estimates are displayed separately.'} {active.raster?.encoding==='float32-le-quality8-v2'?`${((active.warning_fraction??0)*100).toFixed(1)}% warning-only; ${(Math.max(0,(active.masked_fraction??0)-(active.warning_fraction??0))*100).toFixed(1)}% unavailable.`:'This older mask does not distinguish warning-only samples.'} Dark navy marks unfilled excluded samples; it is not measured darkness.</p>}
      {active&&<div className={styles.imageModes}>
        <div role="group" aria-label="Image sampling">
          <button disabled={!displayAvailable} aria-pressed={displayAvailable&&display.sampling==='smooth'} onClick={()=>setDisplay(old=>({...old,sampling:'smooth'}))}>SMOOTH</button>
          <button disabled={!displayAvailable} aria-pressed={!displayAvailable||display.sampling==='pixels'} onClick={()=>setDisplay(old=>({...old,sampling:'pixels'}))}>PIXELS</button>
        </div>
        <button disabled={!displayAvailable||tool==='mark'} aria-pressed={displayAvailable&&(display.detail??0)>0} onClick={()=>setDisplay(old=>({...old,detail:old.detail?0:.35,reduceGrain:old.detail?old.reduceGrain:false}))}>DETAIL EXPERIMENT</button>
        <button disabled={!refinementAvailable||tool==='mark'} aria-pressed={refinementAvailable&&!!effectiveDisplay.reduceGrain} onClick={()=>{stop();setOriginalShown(false);setDisplay(old=>({...old,reduceGrain:!old.reduceGrain,detail:0}));}}>REDUCE GRAIN</button>
        <button disabled={!displayAvailable||tool==='mark'} aria-pressed={displayAvailable&&!!effectiveDisplay.softHighlights} onClick={()=>{stop();setOriginalShown(false);setDisplay(old=>({...old,softHighlights:!old.softHighlights}));}}>SOFT HIGHLIGHTS</button>
        <button disabled={!displayAvailable||!(display.detail||display.reduceGrain||display.softHighlights)||tool==='mark'} onPointerDown={event=>{stop();event.currentTarget.setPointerCapture(event.pointerId);setOriginalHeld(true);}} onPointerUp={()=>setOriginalHeld(false)} onPointerCancel={()=>setOriginalHeld(false)} onLostPointerCapture={()=>setOriginalHeld(false)} onBlur={()=>setOriginalHeld(false)} onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();stop();setOriginalHeld(true);}}} onKeyUp={event=>{if(event.key===' '||event.key==='Enter')setOriginalHeld(false);}}>HOLD ORIGINAL</button>
        <p className={styles.hint} data-detail={displayAvailable&&effectiveDisplay.detail?'on':'off'}>{!displayAvailable?'PREPARED PNG: interactive intensity display is unavailable.':tool==='mark'?'Mark uses original intensities. Detail is paused.':effectiveDisplay.detail?'EXPERIMENTAL DETAIL: visual emphasis only. Hold original to compare without it.':'Smooth viewing adds no measured resolution. Clean View estimates are separately labelled.'}</p>
      </div>}

      {preparedFailed&&<p role="status">Interactive intensity data could not be verified. Showing the original prepared PNG.</p>}
      {!active.raster&&<p>This sequence contains prepared PNGs only. Intensity adjustments need aligned raster data.</p>}
      <fieldset disabled={!displayAvailable}>
        <label>Black level<input aria-label="Black level" type="range" min={original.low-(original.high-original.low)*.2} max={Math.min(original.high,display.high)-(original.high-original.low)*.01} step={(original.high-original.low)/500} value={display.low} onChange={event=>setDisplay(old=>({...old,low:Number(event.target.value)}))}/></label>
        <label>White level<input aria-label="White level" type="range" min={Math.max(original.low,display.low)+(original.high-original.low)*.01} max={original.high+(original.high-original.low)} step={(original.high-original.low)/500} value={display.high} onChange={event=>setDisplay(old=>({...old,high:Number(event.target.value)}))}/></label>
        <label>Stretch<select aria-label="Display stretch" value={display.curve} onChange={event=>setDisplay(old=>({...old,curve:event.target.value as DisplayOptions['curve']}))}><option value="asinh">Asinh</option><option value="linear">Linear</option></select></label>
        <label>Asinh softness<input aria-label="Asinh softness" type="range" min="0.05" max="1" step=".01" value={display.a} disabled={display.curve!=='asinh'} onChange={event=>setDisplay(old=>({...old,a:Number(event.target.value)}))}/></label>
        <label>Gamma<input aria-label="Gamma" type="range" min=".5" max="2" step=".05" value={display.gamma} onChange={event=>setDisplay(old=>({...old,gamma:Number(event.target.value)}))}/></label>
        <label>No-data style<select aria-label="No-data style" value={display.mask} onChange={event=>setDisplay(old=>({...old,mask:event.target.value as DisplayOptions['mask']}))}><option value="subtle">Subdued gaps</option><option value="quiet">Inspect slate</option><option value="hatch">Detailed hatch</option></select></label>
        <label>Quality policy<select aria-label="Quality policy" value={display.includeWarnings?'warnings':'strict'} disabled={!raster?.warning} onChange={event=>setDisplay(old=>({...old,includeWarnings:event.target.value==='warnings'}))}><option value="strict">Strict samples</option><option value="warnings">Include warning-only samples</option></select></label>
        <label>Detail amount (experimental)<input aria-label="Detail amount" type="range" min="0" max=".5" step=".05" value={display.detail??0} disabled={tool==='mark'} onChange={event=>setDisplay(old=>({...old,detail:Number(event.target.value)}))}/></label>
        <button onClick={()=>setDisplay({...original,a:.3})}>QUIET PRESET</button><button onClick={()=>setDisplay(original)}>ORIGINAL / RESET</button>
      </fieldset>
      <label className={styles.rendererChoice}>Rendering <select aria-label="Rendering mode" value={forceCpu?'cpu':'auto'} onChange={event=>{setAutoResolution('checking');setForceCpu(event.target.value==='cpu');}}><option value="auto">Automatic GPU / CPU</option><option value="cpu">CPU</option></select></label>
      <label className={styles.rendererChoice}>Display resolution <select aria-label="Display resolution" value={resolution} onChange={event=>{setResolution(event.target.value as typeof resolution);setAutoResolution('checking');}}><option value="auto">Adaptive</option><option value="hd">HD budget</option><option value="4k">4K budget</option></select></label>
      <p className={styles.hint} data-resolution={resolution==='auto'?autoResolution:resolution}>Aspect ratio preserved; 4K uses at most 8.3 million pixels (2880 square). {renderMs!==null&&`Last render and presentation interval: ${Math.round(renderMs)} ms.`} Adaptive uses HD on CPU or after a slow frame.</p>
      <p className={styles.hint} data-adapter={adapter}>{rendererMode==='WebGL2'?`Graphics adapter: ${adapter}`:rendererMode.startsWith('CPU')?'CPU display active. GPU availability depends on this browser and device.':''}</p>
      <p className={styles.hint}>One display setting across all epochs. Black {display.low.toPrecision(4)} / white {display.high.toPrecision(4)} MJy/sr | {display.curve} {display.a.toFixed(2)} | gamma {display.gamma.toFixed(2)}. Display changes do not add measured detail.</p>
    </details>;
  const infoPanel=sequence&&<ObservationDetails sequence={sequence} activeFrameId={active?.frame_id ?? null} comparison={frames.length?{a,b}:null} />;
  return <section className={styles.instrument} data-focus={expanded} aria-label="Sky image viewer">
    <div className={styles.tools} role="group" aria-label="Viewer tool">
      {(['time','pan','mark','inspect'] as ViewerTool[]).map(value=><button key={value} aria-pressed={tool===value} disabled={!active} onClick={()=>{stop();setTool(value);if(value==='inspect')openPanel('layers');if(value==='mark')openPanel('notes');}}>{value==='time'?'REWIND':value.toUpperCase()}</button>)}
      <div className={styles.zoomButtons}><button disabled={!active} onClick={()=>zoom(.8)} aria-label="Zoom out">-</button><button disabled={!active} onClick={()=>zoom(1.25)} aria-label="Zoom in">+</button></div>
      <button disabled={!active} onClick={()=>setView(FIT)}>FIT</button><button disabled={!active} onClick={()=>setView(fillImage(geometry))}>FILL</button>
      <button onClick={()=>setExpanded(!expanded)} aria-pressed={expanded}>FOCUS</button>
    </div>
    <div className={styles.stage}>
      <div className={styles.stageHeading}><span>{sequence?.data_mode.toUpperCase()??'CHOOSE A FIELD'}</span><span>{active?.wavelength_um?.toFixed(3)}{active?.wavelength_um?' μm':''}</span></div>
      <div id="observation-canvas" ref={viewport} className={styles.viewport} style={{cursor:tool==='pan'?'grab':tool==='mark'||tool==='inspect'?'crosshair':'ew-resize'}} tabIndex={0} role="group" aria-label="Observation canvas" aria-describedby="viewer-help" onKeyDown={key} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={()=>{pointers.current.clear();drag.current=null;}}>
      {view.zoom>1&&active&&ready&&<button className={styles.overview} aria-label="Field overview: click to recenter, Enter to center the field" onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key!=='Escape')event.stopPropagation();}} onClick={event=>{event.stopPropagation();stop();const rect=event.currentTarget.getBoundingClientRect();const x=event.detail===0 ? .5 : (event.clientX-rect.left)/rect.width,y=event.detail===0 ? .5 : (event.clientY-rect.top)/rect.height;setView(current=>centerImageField(current,x,y,geometry));}}>
        <img src={images.get(active.frame_id)!.src} crossOrigin="anonymous" alt="" draggable={false}/>
        <span className={styles.overviewRegion} style={{left:`${region.left*100}%`,top:`${region.top*100}%`,width:`${region.width*100}%`,height:`${region.height*100}%`}}/>
        <span className={styles.overviewLabel}>FULL FIELD</span>
      </button>}
      {sequence&&active?<><canvas ref={canvas} className={styles.canvas} data-sampling={displayAvailable?display.sampling:'pixels'} style={{...fitStyle,transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`,visibility:ready&&!rendering?'visible':'hidden'}} width={outputSize.width} height={outputSize.height} aria-label={`Observation ${active.observation_id ?? active.frame_id}`} />{(!ready||rendering)&&(failedIds.includes(active.frame_id)?<div className={styles.loadState} role="status">This observation could not be loaded.<button onPointerDown={event=>event.stopPropagation()} onClick={retry}>RETRY IMAGE</button></div>:loadingFeedback??<div className={styles.loadState} role="status">Loading this observation...</div>)}</>:loadingFeedback??<div className={styles.emptyState}><span>ONE SKY. MANY MOMENTS.</span><h2>Find what<br/>time reveals.</h2><p>Choose a target or open saved observations.</p><small>NO SCIENTIFIC IMAGE IS DISPLAYED</small></div>}
      {sequence&&active&&gaiaEnabled&&gaia.data&&ready&&!rendering&&<div className={styles.layerFrame} style={fitStyle}><GaiaLayer data={gaia.data} frameId={active.frame_id} width={sequence.grid.width_px} height={sequence.grid.height_px}
        view={view} viewportWidth={fit.width} selected={selectedSource} interactive={tool!=='mark'&&tool!=='inspect'} onSelect={id=>{stop();openPanel('layers');setSelectedSource(id);}}/></div>}
    </div><div className={styles.orientation}><strong>{tool==='time'?'REWIND':tool.toUpperCase()} TOOL</strong><span>N ↑ · E ←</span><span>{Math.round(view.zoom*100)}%{region.width<.999||region.height<.999?' · CROPPED VIEW':''}</span><span><i/> No data</span>{sequence&&<span>{sequence.requested_fov_arcmin} arcmin full field</span>}</div><p id="viewer-help" className={styles.hint}>{tool==='time'?'Drag left for earlier, right for later. Arrow keys step observations.':tool==='pan'?'Drag to pan. Scroll or pinch to zoom. Arrow keys move; 0 fits the field.':tool==='inspect'?`Select a pixel to inspect quality, or move with arrow keys. Keyboard cursor: ${cursor.x}, ${cursor.y}.`:`Select a pixel, or use arrow keys then Enter. Keyboard cursor: ${cursor.x}, ${cursor.y}.`} Space plays or pauses.</p>
    </div>
    <Inspector tab={panel} onTab={setPanel} open={!expanded} onOpen={open=>setExpanded(!open)} panels={{field:fieldPanel,notes:notesPanel,display:<>{cleanPanel}{advancedPanel}<button disabled={!active||nativeAcross===null} onClick={()=>setView(boundedImageView({zoom:nativeAcross!/Math.max(1,fit.width*window.devicePixelRatio),x:0,y:0},geometry))}>NATIVE SCALE</button></>,layers:<><p>SPHEREx base image (always visible)</p><div className={styles.layerSwitches}><label><input type="checkbox" checked={showMarks} onChange={event=>setShowMarks(event.target.checked)}/> Candidate marks</label><label><input type="checkbox" disabled={!showMarks} checked={showLabels} onChange={event=>setShowLabels(event.target.checked)}/> Candidate labels</label></div>{layerPanel}</>,compare:comparePanel,info:infoPanel}}/>
    <div className={styles.bottomDock}><PlaybackControls frames={frames} index={index} playing={playing} speed={speed} onSpeed={setSpeed} onIndexChange={selectIndex} onToggle={()=>{setBlink(false);releaseHold();if(!playing&&index===frames.length-1&&frames[0])onFrameChange(frames[0].frame_id);setPlaying(!playing);}} /><div className={styles.quickCompare}>{active&&<>      <button disabled={a===b} aria-pressed={blink} onClick={()=>{setPlaying(false);releaseHold();onFrameChange(frames[a]!.frame_id);setBlink(!blink);}}>{blink?'STOP BLINK':'BLINK A/B'}</button>
      <button disabled={a===b} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);beginHold();}} onPointerUp={releaseHold} onPointerCancel={releaseHold} onLostPointerCapture={releaseHold} onBlur={releaseHold} onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();beginHold();}}} onKeyUp={event=>{if(event.key===' '||event.key==='Enter')releaseHold();}}>HOLD FOR B</button>
      {/* One press switches between A and B, for anyone who cannot hold a button or prefers no blinking. */}
      <button disabled={a===b} aria-label={active.frame_id===frames[b]?.frame_id?`Show A, ${observationLabel(frames[a]?.observed_start_utc)}`:`Show B, ${observationLabel(frames[b]?.observed_start_utc)}`} onClick={()=>{stop();onFrameChange(active.frame_id===frames[b]!.frame_id?frames[a]!.frame_id:frames[b]!.frame_id);}}>{active.frame_id===frames[b]?.frame_id?'SHOW A':'SHOW B'}</button>
</>}</div></div>
  </section>;
}
