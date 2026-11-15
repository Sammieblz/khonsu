"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./resolutionLab.module.css";
import { QualityStudy } from './QualityStudy';

type Mode = "current" | "native" | "stack" | "truth" | "coverage";
type Assets = { standard: string; shoulder: string };
interface Field {
  id: string; title: string; kind: "real" | "synthetic"; note: string;
  fov_arcmin: number | null; native_scale_arcsec: number | null; prepared_side: number;
  display_side: number; stack_available: boolean; exposure_count?: number;
  assets: Partial<Record<Mode | "denoised", Assets>>; coverage_asset?: string;
  quality_flags?: { scope: string; counts: Record<string, number> };
  metrics: Record<string, number | string | null>;
  source: null | { observation_id: string; observed_start_utc: string; observed_end_utc: string;
    release: string; wavelength_um: number; source_fits_url: string; raw_sha256: string };
  coverage?: { inspected: number; failed: number; triples_checked: number; status: string };
}
interface LabReport {
  schema_version: number; generated_at_utc: string; fields: Field[];
  audit: { id: string; title: string; inspected: number; failed: number; status: string; note: string }[];
}
const names: Record<Mode, string> = { current: "CURRENT", native: "NATIVE RESAMPLE", stack: "RECONSTRUCTION", truth: "KNOWN TRUTH", coverage: "COVERAGE" };
const explanations: Record<Mode, string> = {
  current: "The existing aligned image, enlarged using Smooth display.",
  native: "A direct, bounded cubic resampling of the original measurements. Finer display sampling adds no measured resolution.",
  stack: "Experimental pixel-drop reconstruction from eight simulated exposures. A sampling control, not a real SPHEREx stack.",
  truth: "The analytic, pixel-convolved scene used to generate this synthetic control, before added noise and missing samples.",
  coverage: "Contributing simulated exposures per output pixel: black is zero, full amber is eight. Boundaries remain discrete.",
};

export function ResolutionLab() {
  const [report, setReport] = useState<LabReport | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("native");
  const [shoulder, setShoulder] = useState(true);
  const [grain, setGrain] = useState(true);
  const [showGaps, setShowGaps] = useState(false);
  const [held, setHeld] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/experiments/resolution/manifest.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw Error("The comparison report could not be loaded."); return response.json(); })
      .then((data: LabReport) => {
        if (data.schema_version !== 2 || !Array.isArray(data.fields) || !data.fields.length || !Array.isArray(data.audit)
          || data.fields.some(f => !f.assets?.current?.standard || !f.assets?.native?.standard)) {
          throw Error("This comparison report is incomplete.");
        }
        setReport(data);
      }).catch(error => { if (!controller.signal.aborted) setError(String(error.message)); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const release = () => setHeld(false);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => { window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", release); };
  }, []);
  const field = report?.fields[fieldIndex];
  const visibleMode = held ? "current" : mode;
  const grainApplied = !held && mode === "native" && grain && !!field?.assets.denoised;
  const assetMode = grainApplied ? "denoised" : visibleMode;
  const inspectGaps = held || showGaps;
  const source = field && (visibleMode === "coverage" ? field.coverage_asset : field.assets[assetMode]?.[!held && shoulder ? "shoulder" : "standard"]);
  const available = field ? [...new Set([...Object.values(field.assets).flatMap(a => a ? [a.standard, a.shoulder] : []), ...(field.coverage_asset ? [field.coverage_asset] : [])])] : [];
  const ready = !!source && loaded[source] && !failed[source];

  function resetView() { setZoom(1); viewport.current?.scrollTo(0, 0); }
  function selectField(value: string) {
    setFieldIndex(Number(value)); setMode("native"); setHeld(false); setShoulder(true); setGrain(true); resetView();
  }
  function selectMode(value: Mode) { setHeld(false); setMode(value); }
  function metric(name: string, digits = 2) {
    const value = field?.metrics[name];
    return typeof value === "number" ? value.toFixed(digits) : "Unavailable";
  }

  return <main className={styles.lab}>
    <a className="skip-link" href="#comparison">Skip to image comparison</a>
    <header className={styles.header}><a href="/" className={styles.brand}><img src="/khonsu-mark.svg" alt="" width={38} height={38} />KHONSU</a><a href="/">BACK TO OBSERVATORY ↗</a></header>
    <div className={styles.intro}><div><p className={styles.eyebrow}>RESOLUTION LAB / EXPERIMENT 02</p><h1>A CLOSER LOOK.</h1></div><p>Start with the same sky.<br />See what processing changes.<br/><a href="#quality-study">Compare masks and background</a></p></div>
    {error ? <div role="alert" className={styles.message}><p>{error}</p><button onClick={() => setAttempt(a => a+1)}>RETRY COMPARISON</button></div> : !field ? <p role="status">Loading the comparison...</p> : <>
      <div className={styles.workspace}>
        <section id="comparison" className={styles.console} aria-label="Resolution comparison">
          <div className={styles.readout}><span>{field.kind === "real" ? "AUTHENTIC SPHEREX / SINGLE EXPOSURE" : "SIMULATED CONTROL / 8 GENERATED EXPOSURES"}</span><strong>{field.kind === "real" ? field.source?.observed_start_utc.replace("T", " ") : "NO REAL OBSERVATION DATE"}</strong></div>
          <div className={styles.modeBar} role="group" aria-label="Comparison treatment">
            {(["current", "native", "stack"] as Mode[]).map(value => <button key={value} aria-pressed={mode === value} disabled={value === "stack" && !field.stack_available} onClick={() => selectMode(value)}>{names[value]}</button>)}
          </div>
          <div ref={viewport} tabIndex={0} role="region" aria-label="Comparison image; scroll to pan when zoomed" className={styles.viewport} data-kind={field.kind} data-mode={visibleMode} data-ready={!!ready} data-shoulder={!held && shoulder} data-grain={grainApplied} data-gaps={inspectGaps ? "inspect" : "quiet"}>
            <div className={styles.imagePlane} style={{ width: `${zoom*100}%` }} data-gaps={inspectGaps ? "inspect" : "quiet"}>
              {available.map(url => <img key={url} src={url} alt={url === source ? `${field.title}: ${names[visibleMode].toLowerCase()}` : ""} aria-hidden={url !== source} draggable={false} width={768} height={768}
                style={{ visibility: url === source && ready ? "visible" : "hidden", imageRendering: visibleMode === "coverage" ? "pixelated" : "auto" }}
                onLoad={() => setLoaded(previous => ({ ...previous, [url]: true }))}
                onError={() => setFailed(previous => ({ ...previous, [url]: true }))} />)}
            </div>
            {!ready && <div className={styles.imageStatus} role="status">{source && failed[source] ? "This comparison image could not be loaded. Refresh to retry." : "Loading the selected treatment..."}</div>}
          </div>
          <div className={styles.scale}><span>{field.kind === "real" ? "N ↑ · E ←" : "SYNTHETIC GRID"}</span><span>{Math.round(zoom*100)}% / {zoom > 1 ? "SCROLL TO PAN" : "FULL FIELD"}</span><span>{field.fov_arcmin ? `${field.fov_arcmin} ARCMIN` : "32 NATIVE SAMPLES ACROSS"}</span></div>
          <div className={styles.controls}>
            <button aria-pressed={grainApplied} disabled={mode !== "native" || !field.assets.denoised} onClick={() => { setHeld(false); setGrain(!grain); }}>REDUCE GRAIN</button>
            <button aria-pressed={showGaps} disabled={mode === "coverage" || mode === "truth"} onClick={() => { setHeld(false); setShowGaps(!showGaps); }}>SHOW GAPS</button>
            <button aria-pressed={shoulder} disabled={mode === "coverage"} onClick={() => { setHeld(false); setShoulder(!shoulder); }}>PRESERVE BRIGHT CORES</button>
          </div>
          <p className={styles.gapLegend}><span className={styles.gapKey} data-gaps={inspectGaps ? "inspect" : "quiet"} />{visibleMode === "coverage" ? "Coverage counts are simulated." : visibleMode === "truth" ? "Known synthetic truth contains no gaps." : inspectGaps ? "Slate = missing or rejected measurements." : "Dark navy = missing or rejected measurements. Show gaps to inspect."}</p>
          <div className={styles.controls}>
            <button className={styles.hold} disabled={!ready || !field.assets.current || !loaded[field.assets.current.standard] || !!failed[field.assets.current.standard]} aria-pressed={held}
              onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setHeld(true); }} onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)} onLostPointerCapture={() => setHeld(false)} onBlur={() => setHeld(false)}
              onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setHeld(true); } }}
              onKeyUp={event => { if (event.key === " " || event.key === "Enter") setHeld(false); }}>HOLD ORIGINAL</button>
            <button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z-.5))}>−</button>
            <button aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z+.5))}>+</button>
            <button onClick={resetView}>FIT / RESET</button>
          </div>
          <p className={styles.explanation} aria-live="polite">{held ? "ORIGINAL: current Smooth display, with its original highlights and slate gaps. Grain reduction is off." : grainApplied ? "Noise reduction on: a small adaptive filter calms the measured background before resampling. Faint features may be softened; compare with grain reduction off." : explanations[mode]}</p>
          {!held && shoulder && mode !== "coverage" && <p className={styles.caption}>Bright cores: a gradual highlight curve keeps more differences visible above the original white point.</p>}
          {field.kind === "synthetic" && <div className={styles.controls}><button aria-pressed={mode === "truth"} onClick={() => selectMode("truth")}>KNOWN TRUTH</button><button aria-pressed={mode === "coverage"} onClick={() => selectMode("coverage")}>COVERAGE</button><span className={styles.caption}>Coverage: black 0 → amber 8 contributors</span></div>}
        </section>
        <aside className={styles.context} aria-label="Comparison context">
          <label className={styles.eyebrow} htmlFor="lab-field">CHOOSE THE FIELD</label>
          <select id="lab-field" value={fieldIndex} onChange={event => selectField(event.target.value)}>{report!.fields.map((f, i) => <option key={f.id} value={i}>{f.title}</option>)}</select>
          <h2>{field.kind === "real" ? "ONE OBSERVATION. TWO VIEWS." : "MEASURE AGAINST THE TRUTH."}</h2>
          <p>{field.note}</p>
          {field.kind === "real" ? <>
            <dl><dt>Native sampling</dt><dd>{field.native_scale_arcsec?.toFixed(2)} arcsec / pixel</dd><dt>Existing aligned grid</dt><dd>{field.prepared_side} × {field.prepared_side}</dd><dt>Display image</dt><dd>{field.display_side} × {field.display_side}</dd></dl>
            <div className={styles.finding}><span className={styles.eyebrow}>RECONSTRUCTION / UNAVAILABLE</span><p>The bounded search found no qualifying group of three closely timed, spectrally matched exposures for this field.</p><p>{field.coverage?.inspected} files inspected. More archive coverage may exist.</p></div>
            <p className={styles.caption}>Gap styling is separate from noise reduction. Missing star cores remain unmeasured; changing their appearance does not restore them.</p>
          </> : <>
            <dl><dt>Current view error / RMSE</dt><dd>{metric("current_rmse", 5)}</dd><dt>Native resample error / RMSE</dt><dd>{metric("native_rmse", 5)}</dd><dt>Reduced grain error / RMSE</dt><dd>{metric("denoised_rmse", 5)}</dd><dt>Reconstruction error / RMSE</dt><dd>{metric("stack_rmse", 5)}</dd></dl>
            <p className={styles.caption}>Lower is better against this known scene, on identical valid pixels. Eight exposures, four pixel phases, fixed seed 57. This result does not establish improvement in real SPHEREx data.</p>
          </>}
          <details><summary>HOW TO COMPARE</summary><p>Native resample starts with Reduce grain on. Toggle it to judge background texture on the same measured pixels. Show gaps changes only how missing data is marked.</p><p>Turn Reduce grain and Preserve bright cores off to compare resampling alone. Hold Original with the pointer, Space or Enter to restore the original treatment and slate marking.</p><p>Zoom keeps the same field. Scroll within the image to pan, then Fit / Reset to return.</p></details>
          {field.quality_flags && <details><summary>WHY THE GAPS?</summary><p>These pixels were rejected by the observation quality mask. Bloom, overflow, persistence and other artifacts can leave holes even in a bright source. Dark navy is a quieter marker; it is not a measured dark patch.</p><p>{field.quality_flags.scope}: {Object.entries(field.quality_flags.counts).map(([name, count]) => `${name} (${count})`).join(", ")}.</p></details>}
          {field.source && <details><summary>SOURCE & MEASUREMENTS</summary><p>{field.source.observation_id}<br />{field.source.release} / {field.source.wavelength_um.toFixed(5)} µm</p><p>Exposure: {field.source.observed_start_utc}<br />to {field.source.observed_end_utc}</p><p>Maximum reference-peak position change: {metric("max_centroid_change_arcsec")} arcsec. A processing diagnostic, not a motion measurement.</p><a href={field.source.source_fits_url} target="_blank" rel="noreferrer">Original FITS at IRSA ↗</a><p className={styles.hash}>SHA-256 {field.source.raw_sha256}</p></details>}
          <a className={styles.reportLink} href="/experiments/resolution/manifest.json" download>DOWNLOAD COMPARISON REPORT ↓</a>
        </aside>
      </div>
      <footer className={styles.footer}><p>FIND WHAT TIME REVEALS.</p><span>Research preview. Original observations and saved candidate notes remain in the observatory.</span><a href="/">RETURN TO THE SKY ↗</a></footer>
    </>}
    <QualityStudy />
  </main>;
}
