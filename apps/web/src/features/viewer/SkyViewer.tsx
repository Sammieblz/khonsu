"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ObservationFrame, SkyViewerProps, ViewerTool } from "@/features/explorer/interfaces";
import { PlaybackControls } from "./PlaybackControls";
import { useFrameLoader } from "./useFrameLoader";
import { usePlayback } from "./usePlayback";
import { clientPointToRaster } from "./viewport";
import styles from "./viewer.module.css";

const EMPTY_FRAMES: ObservationFrame[] = [];

export function SkyViewer({ sequence, activeFrameId, annotations, onFrameChange, onSelect }: SkyViewerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<ViewerTool>("time");
  const frames = sequence?.frames ?? EMPTY_FRAMES;
  const frameIds = useMemo(() => frames.map(frame => frame.frame_id), [frames]);
  const index = Math.max(0, frames.findIndex(frame => frame.frame_id === activeFrameId));
  const active = frames[index];
  const { images, failedIds } = useFrameLoader(frames);
  const { playing, setPlaying } = usePlayback(frameIds, active?.frame_id ?? null, onFrameChange);

  useEffect(() => {
    if (!sequence || !active || !canvas.current) return;
    const context = canvas.current.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, sequence.grid.width_px, sequence.grid.height_px);
    const image = images.get(active.frame_id);
    if (!image) return;
    context.drawImage(image, 0, 0, sequence.grid.width_px, sequence.grid.height_px);
    context.strokeStyle = "#D9AE6A";
    context.lineWidth = Math.max(1, sequence.grid.width_px / 400);
    for (const annotation of annotations.filter(item => item.selection.frameId === active.frame_id)) {
      context.beginPath();
      context.arc(annotation.selection.x + .5, annotation.selection.y + .5, Math.max(5, sequence.grid.width_px / 50), 0, Math.PI * 2);
      context.stroke();
    }
  }, [sequence, active, images, annotations]);

  function selectAt(clientX: number, clientY: number) {
    if (tool !== "mark" || !sequence || !active || !canvas.current || !images.has(active.frame_id)) return;
    const point = clientPointToRaster(clientX, clientY, canvas.current.getBoundingClientRect(), sequence.grid.width_px, sequence.grid.height_px);
    if (point) onSelect({ sequenceId: sequence.sequence_id, frameId: active.frame_id, ...point, coordinateSpace: "natural-raster", pixelOrigin: "top-left" });
  }

  return (
    <section className={styles.instrument} aria-label="Sky image viewer">
      <div className={styles.instrumentHeading}><span>02 / OBSERVATION WINDOW</span><span>{sequence ? sequence.data_mode.toUpperCase() : "AWAITING VERIFIED DATA"}</span></div>
      {sequence && <p className={styles.disclosure}>{sequence.disclosure}</p>}
      <div className={styles.viewport}>
        {sequence && active ? (
          <><canvas ref={canvas} className={styles.canvas} width={sequence.grid.width_px} height={sequence.grid.height_px} aria-label={`Observation ${active.frame_id}; use Mark candidate, then select a location`} onClick={event => selectAt(event.clientX, event.clientY)} />
          {!images.has(active.frame_id) && <p className={styles.loadState} role="status">{failedIds.includes(active.frame_id) ? "This frame could not be loaded." : "Loading this observation..."}</p>}</>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.reticle} aria-hidden="true"><span /><i /></div>
            <span className={styles.emptyEyebrow}>YOUR OBSERVATORY IS READY</span>
            <h2>Every observation<br />leaves a trace.</h2>
            <p>Choose a field to begin.<br />Real observations appear here when a search finishes.</p>
            <span className={styles.emptyDisclosure}>NO SKY DATA IS BEING DISPLAYED</span>
          </div>
        )}
        <div className={styles.orientation} aria-hidden="true"><span>N ↑</span><span>E ←</span></div>
        <div className={styles.tools} role="group" aria-label="Viewer tool">
          <button aria-pressed={tool === "time"} onClick={() => setTool("time")}><Icon name="clock" /><span>Time</span></button>
          <button disabled title="Pan and zoom are reserved for the viewer implementation"><Icon name="pan" /><span>Pan</span></button>
          <button aria-pressed={tool === "mark"} disabled={!active} onClick={() => setTool("mark")}><Icon name="mark" /><span>Mark</span></button>
        </div>
      </div>
      <PlaybackControls frames={frames} index={index} playing={playing} onToggle={() => {
        if (playing) { setPlaying(false); return; }
        if (index === frames.length - 1 && frames[0]) onFrameChange(frames[0].frame_id);
        setPlaying(true);
      }} onIndexChange={nextIndex => { setPlaying(false); const frame = frames[nextIndex]; if (frame) onFrameChange(frame.frame_id); }} />
    </section>
  );
}
