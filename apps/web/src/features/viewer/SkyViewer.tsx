"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ObservationFrame, SkyViewerProps, ViewerTool } from "@/features/explorer/interfaces";
import { PlaybackControls } from "./PlaybackControls";
import { useFrameLoader } from "./useFrameLoader";
import { usePlayback } from "./usePlayback";
import { chronologicalFrames, epochTimeline, nearestTimelineIndex, observationLabel } from "./time";
import { FIT_VIEW, MAX_ZOOM, clampViewport, clientPointToRaster, imageGeometry, rasterPointToDisplay, zoomAtPoint, type RasterPoint, type ViewportTransform } from "./viewport";
import { pixelToSky } from "./wcs";
import styles from "./viewer.module.css";

const EMPTY_FRAMES: ObservationFrame[] = [];
const DIRECTIONS: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
interface Drag { id: number; x: number; y: number; view: ViewportTransform; position: number; moved: boolean; }

export function SkyViewer({ sequence, activeFrameId, annotations, onFrameChange, onSelect, tool: controlledTool, onToolChange, comparison, onComparisonChange }: SkyViewerProps) {
  const instructionsId = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const frameCallback = useRef(onFrameChange);
  frameCallback.current = onFrameChange;
  const [ownTool, setOwnTool] = useState<ViewerTool>("time");
  const tool = controlledTool ?? ownTool;
  const [view, setView] = useState<ViewportTransform>(FIT_VIEW);
  const [size, setSize] = useState({ width: 1, height: 1, dpr: 1 });
  const [cursor, setCursor] = useState<RasterPoint | null>(null);
  const [ownComparison, setOwnComparison] = useState({ aFrameId: null as string | null, bFrameId: null as string | null });
  const [blinking, setBlinking] = useState(false);
  const originalFrames = sequence?.frames ?? EMPTY_FRAMES;
  const frames = useMemo(() => chronologicalFrames(originalFrames), [originalFrames]);
  const timeline = useMemo(() => epochTimeline(frames), [frames]);
  const frameIds = useMemo(() => frames.map(frame => frame.frame_id), [frames]);
  const index = Math.max(0, frames.findIndex(frame => frame.frame_id === activeFrameId));
  const active = frames[index];
  const chosen = comparison ?? ownComparison;
  const aId = frameIds.includes(chosen.aFrameId ?? "") ? chosen.aFrameId! : frameIds[0] ?? "";
  const bId = frameIds.includes(chosen.bFrameId ?? "") ? chosen.bFrameId! : frameIds[frameIds.length - 1] ?? "";
  const aFrame = frames.find(frame => frame.frame_id === aId);
  const bFrame = frames.find(frame => frame.frame_id === bId);
  const { images, failedIds, retry } = useFrameLoader(frames, active?.frame_id ?? null, sequence?.sequence_id ?? "", [aId, bId]);
  const image = active ? images.get(active.frame_id) : undefined;
  const wrongGrid = Boolean(image && sequence && (image.naturalWidth !== sequence.grid.width_px || image.naturalHeight !== sequence.grid.height_px));
  const ready = Boolean(image && !wrongGrid);
  const { playing, setPlaying } = usePlayback(frameIds, active?.frame_id ?? null, onFrameChange, ready);
  const canBlink = frames.length > 1 && aId !== bId;
  const comparisonFailed = failedIds.filter(id => id === aId || id === bId);
  const comparisonReady = canBlink && images.has(aId) && images.has(bId);
  const gridWidth = sequence?.grid.width_px ?? 1;
  const gridHeight = sequence?.grid.height_px ?? 1;
  const markPoint = cursor ?? { x: Math.floor(gridWidth / 2), y: Math.floor(gridHeight / 2) };
  const sky = sequence ? pixelToSky(markPoint, sequence.grid) : null;

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const measure = () => { const rect = element.getBoundingClientRect(); setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr: Math.min(window.devicePixelRatio || 1, 2) }); };
    measure();
    if (typeof ResizeObserver !== "undefined") { const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect(); }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => { setView(FIT_VIEW); setCursor(null); setBlinking(false); setPlaying(false); drag.current = null; }, [sequence?.sequence_id, setPlaying]);
  useEffect(() => { setView(previous => clampViewport(previous, size, gridWidth, gridHeight)); }, [size, gridWidth, gridHeight]);
  useEffect(() => {
    if (!blinking || !comparisonReady) return;
    const timer = window.setTimeout(() => frameCallback.current(active?.frame_id === aId ? bId : aId), 900);
    return () => window.clearTimeout(timer);
  }, [blinking, comparisonReady, active?.frame_id, aId, bId]);
  useEffect(() => { if (!canBlink || comparisonFailed.length > 0) setBlinking(false); }, [canBlink, comparisonFailed.length]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setBlinking(false); };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    if (!sequence || !active || !image || wrongGrid) return;
    const geometry = imageGeometry(size, gridWidth, gridHeight, view);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, geometry.left, geometry.top, geometry.width, geometry.height);
    context.strokeStyle = "#D9AE6A"; context.lineWidth = 1.5;
    for (const annotation of annotations.filter(item => item.selection.sequenceId === sequence.sequence_id)) {
      const point = rasterPointToDisplay(annotation.selection, size, gridWidth, gridHeight, view);
      context.beginPath(); context.arc(point.x, point.y, 9, 0, Math.PI * 2); context.stroke();
    }
    if (tool === "mark") {
      const point = rasterPointToDisplay(markPoint, size, gridWidth, gridHeight, view);
      context.strokeStyle = "#79C7E8"; context.beginPath();
      context.moveTo(point.x - 12, point.y); context.lineTo(point.x - 4, point.y);
      context.moveTo(point.x + 4, point.y); context.lineTo(point.x + 12, point.y);
      context.moveTo(point.x, point.y - 12); context.lineTo(point.x, point.y - 4);
      context.moveTo(point.x, point.y + 4); context.lineTo(point.x, point.y + 12);
      context.stroke();
    }
  }, [sequence, active, image, wrongGrid, annotations, size, view, gridWidth, gridHeight, tool, markPoint.x, markPoint.y]);
  useEffect(() => {
    const element = canvas.current;
    if (!element || tool !== "pan" || !sequence) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * .002);
      setView(previous => zoomAtPoint(previous, previous.zoom * factor, { x: event.clientX - rect.left, y: event.clientY - rect.top }, rect, gridWidth, gridHeight));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [tool, sequence, gridWidth, gridHeight]);

  function stopMotion() { setPlaying(false); setBlinking(false); }
  function changeTool(next: ViewerTool) { stopMotion(); setOwnTool(next); onToolChange?.(next); drag.current = null; }
  function changeIndex(next: number) { stopMotion(); if (frames[next]) onFrameChange(frames[next].frame_id); }
  function togglePlayback() {
    setBlinking(false);
    if (playing) { setPlaying(false); return; }
    if (index === frames.length - 1 && frames[0]) onFrameChange(frames[0].frame_id);
    setPlaying(true);
  }
  function zoomBy(factor: number) {
    stopMotion();
    setView(previous => zoomAtPoint(previous, previous.zoom * factor, { x: size.width / 2, y: size.height / 2 }, size, gridWidth, gridHeight));
  }
  function emitSelection(point: RasterPoint) {
    if (!sequence || !active || !ready) return;
    setCursor(point);
    onSelect({ sequenceId: sequence.sequence_id, frameId: active.frame_id, ...point, coordinateSpace: "natural-raster", pixelOrigin: "top-left" });
  }
  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!active || event.button !== 0) return;
    stopMotion(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view, position: timeline.positions[index] ?? (frames.length < 2 ? 0 : index / (frames.length - 1)), moved: false };
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture.moved ||= Math.hypot(dx, dy) > 5;
    if (tool === "pan") setView(clampViewport({ ...gesture.view, panX: gesture.view.panX + dx, panY: gesture.view.panY + dy }, size, gridWidth, gridHeight));
    else if (tool === "time" && gesture.moved) {
      const next = nearestTimelineIndex(timeline.positions, gesture.position + dx / Math.max(1, size.width * .8));
      if (next >= 0 && frames[next].frame_id !== active?.frame_id) onFrameChange(frames[next].frame_id);
    }
  }
  function pointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const gesture = drag.current;
    if (gesture?.id === event.pointerId && tool === "mark" && !gesture.moved && sequence) {
      const point = clientPointToRaster(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), gridWidth, gridHeight, view);
      if (point) emitSelection(point);
    }
    drag.current = null;
  }
  function keyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!active) return;
    const direction = DIRECTIONS[event.key];
    if (event.key === "Escape") { event.preventDefault(); changeTool("time"); return; }
    if (event.key === " " && tool === "time") { event.preventDefault(); togglePlayback(); return; }
    if (tool === "time" && (direction || event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      changeIndex(event.key === "Home" ? 0 : event.key === "End" ? frames.length - 1 : Math.max(0, Math.min(frames.length - 1, index + (event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1))));
    } else if (tool === "mark" && direction) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      setCursor({ x: Math.max(0, Math.min(gridWidth - 1, markPoint.x + direction[0] * step)), y: Math.max(0, Math.min(gridHeight - 1, markPoint.y + direction[1] * step)) });
    } else if (tool === "mark" && event.key === "Enter") { event.preventDefault(); emitSelection(markPoint); }
    else if (tool === "pan" && direction) {
      event.preventDefault();
      setView(previous => clampViewport({ ...previous, panX: previous.panX - direction[0] * 40, panY: previous.panY - direction[1] * 40 }, size, gridWidth, gridHeight));
    } else if (tool === "pan" && ["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "0") setView(FIT_VIEW); else zoomBy(event.key === "-" ? 1 / 1.5 : 1.5);
    }
  }
  function setComparison(nextA: string, nextB: string) {
    stopMotion();
    const next = { aFrameId: nextA, bFrameId: nextB };
    setOwnComparison(next); onComparisonChange?.(next);
  }

  return (
    <section className={styles.instrument} aria-label="Sky image viewer">
      <div className={styles.instrumentHeading}><span>02 / OBSERVATION WINDOW</span><span>{sequence ? sequence.data_mode.toUpperCase() : "AWAITING VERIFIED DATA"}</span></div>
      {sequence && <p className={styles.disclosure}>{sequence.disclosure}</p>}
      <div className={styles.viewport} ref={surface}>
        {sequence && active ? <>
          <canvas ref={canvas} className={styles.canvas} width={Math.round(size.width * size.dpr)} height={Math.round(size.height * size.dpr)} style={{ touchAction: tool === "pan" ? "none" : tool === "time" ? "pan-y" : "manipulation", cursor: tool === "pan" ? "grab" : tool === "mark" ? "crosshair" : "ew-resize" }}
            tabIndex={0} role="img" aria-label={"Observation " + active.frame_id + ". " + observationLabel(active.observed_start_utc)} aria-describedby={instructionsId}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; }} onKeyDown={keyboard} />
          {!ready && <div className={styles.loadState} role="status">
            <p>{wrongGrid ? "This frame does not match the sequence grid. It cannot be aligned safely." : failedIds.includes(active.frame_id) ? "This observation could not be loaded. Its pixels are not being displayed." : "Loading the selected observation..."}</p>
            {failedIds.includes(active.frame_id) && <button onClick={() => retry(active.frame_id)}>Retry observation</button>}
          </div>}
          <div className={styles.viewMetrics}><span>FULL FIELD {sequence.requested_fov_arcmin.toFixed(2)} ARCMIN</span><span>{view.zoom.toFixed(1)}x DISPLAY ZOOM</span></div>
        </> : <div className={styles.emptyState}>
          <div className={styles.reticle} aria-hidden="true"><span /><i /></div>
          <span className={styles.emptyEyebrow}>YOUR OBSERVATORY IS READY</span>
          <h2>Every observation<br />leaves a trace.</h2>
          <p>Choose a field to begin.<br />Inspect actual observations, or open a clearly labelled example.</p>
          <span className={styles.emptyDisclosure}>NO SKY DATA IS BEING DISPLAYED</span>
        </div>}
        {sequence?.grid.orientation === "north-up-east-left" && <div className={styles.orientation} aria-label="North is up and east is left"><span>N ↑</span><span>E ←</span></div>}
        <div className={styles.tools} role="group" aria-label="Viewer tool">
          <button aria-pressed={tool === "time"} disabled={!active} onClick={() => changeTool("time")}><Icon name="clock" /><span>Time</span></button>
          <button aria-pressed={tool === "pan"} disabled={!active} onClick={() => changeTool("pan")}><Icon name="pan" /><span>Pan</span></button>
          <button aria-pressed={tool === "mark"} disabled={!active} onClick={() => changeTool("mark")}><Icon name="mark" /><span>Mark</span></button>
        </div>
      </div>
      <div className={styles.inspectionBar}>
        <p id={instructionsId} className={styles.toolHint}>{tool === "time" ? "Swipe horizontally to select a real epoch. Arrow keys step; Space plays or pauses." : tool === "pan" ? "Drag to pan. Wheel or + / - to zoom; arrow keys pan; 0 resets." : "Click a pixel, or focus the image and use arrow keys. Shift moves 10 pixels; Enter selects."}</p>
        <div className={styles.zoomButtons} role="group" aria-label="Image zoom">
          <button aria-label="Zoom out" disabled={!active || view.zoom <= 1} onClick={() => zoomBy(1 / 1.5)}>−</button>
          <button aria-label="Reset image to fit" disabled={!active} onClick={() => setView(FIT_VIEW)}>Fit</button>
          <button aria-label="Zoom in" disabled={!active || view.zoom >= MAX_ZOOM} onClick={() => zoomBy(1.5)}>+</button>
        </div>
      </div>
      {tool === "mark" && active && <div className={styles.markReadout}>
        <span>PIXEL {markPoint.x}, {markPoint.y}{sky ? " / ICRS " + sky.raDeg.toFixed(6) + "°, " + sky.decDeg.toFixed(6) + "°" : " / SKY COORDINATES UNAVAILABLE"}</span>
        <button disabled={!ready} onClick={() => emitSelection(markPoint)}>Select crosshair pixel</button>
      </div>}
      {active && <p className={styles.frameContext}>{active.wavelength_um != null ? active.wavelength_um.toFixed(3) + " µm" : "Wavelength unavailable"} · {active.release ?? "Release unavailable"} · {sequence?.display.stretch ?? "linear"} stretch fixed across frames</p>}
      <PlaybackControls frames={frames} index={index} playing={playing} onToggle={togglePlayback} onIndexChange={changeIndex} />
      {frames.length > 0 && <div className={styles.comparison}>
        <div className={styles.comparisonHeading}><span>COMPARE TWO MOMENTS</span><span>CRISP SWITCH / SAME GRID + STRETCH</span></div>
        <div className={styles.comparisonSelectors}>
          <label><span>A / REFERENCE</span><select aria-label="Reference observation A" value={aId} onChange={event => setComparison(event.target.value, bId)}>{frames.map((frame, i) => <option key={frame.frame_id} value={frame.frame_id}>{i + 1}. {observationLabel(frame.observed_start_utc)}</option>)}</select></label>
          <label><span>B / COMPARISON</span><select aria-label="Comparison observation B" value={bId} onChange={event => setComparison(aId, event.target.value)}>{frames.map((frame, i) => <option key={frame.frame_id} value={frame.frame_id}>{i + 1}. {observationLabel(frame.observed_start_utc)}</option>)}</select></label>
        </div>
        <div className={styles.comparisonButtons}>
          <button aria-pressed={active.frame_id === aId} onClick={() => { stopMotion(); onFrameChange(aId); }}>View A</button>
          <button aria-pressed={active.frame_id === bId} onClick={() => { stopMotion(); onFrameChange(bId); }}>View B</button>
          <button aria-pressed={blinking} disabled={!canBlink} onClick={() => { setPlaying(false); if (blinking) { setBlinking(false); return; } comparisonFailed.forEach(retry); onFrameChange(aId); setBlinking(true); }}>{blinking ? "Pause blink" : "Blink A/B"}</button>
        </div>
        <p className={styles.comparisonHint}>{!canBlink ? "Choose two different observations to compare." : blinking && !comparisonReady ? "Loading both observations before blinking." : "Blinking advances one real frame every 0.9 seconds. Pause at any time."}</p>
        {comparisonFailed.length > 0 && <p className={styles.comparisonError} role="status">A comparison image failed to load. {comparisonFailed.map(id => <button key={id} onClick={() => retry(id)}>Retry {id === aId ? "A" : "B"}</button>)}</p>}
        {(aFrame?.warnings?.length || bFrame?.warnings?.length || sequence?.warnings?.length) ? <p className={styles.comparisonHint}>Quality warnings apply. Inspect source and mask details before interpreting a difference.</p> : null}
      </div>}
    </section>
  );
}
