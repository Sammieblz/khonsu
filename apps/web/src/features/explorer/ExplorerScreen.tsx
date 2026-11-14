"use client";

import { useMemo, useState } from "react";
import { Brand } from "@/components/ui/Brand";
import { AnnotationPanel } from "@/features/annotations/AnnotationPanel";
import { useAnnotations } from "@/features/annotations/useAnnotations";
import { SkyViewer } from "@/features/viewer/SkyViewer";
import { CoordinateForm } from "./CoordinateForm";
import { ObservationDetails } from "./ObservationDetails";
import { TargetPresets } from "./TargetPresets";
import { useExplorer } from "./useExplorer";
import styles from "./explorer.module.css";

export function ExplorerScreen() {
  const explorer = useExplorer();
  const { annotations, addAnnotation, removeAnnotation, storageWarning } = useAnnotations();
  const [shareMessage, setShareMessage] = useState("");
  const comparisonFrameIds = useMemo(() => [explorer.comparison.aFrameId, explorer.comparison.bFrameId].filter((value): value is string => !!value), [explorer.comparison]);
  const visibleAnnotations = annotations.filter(item => item.selection.sequenceId === explorer.sequence?.sequence_id);

  async function copySearch() {
    try { await navigator.clipboard.writeText(explorer.shareLink); setShareMessage("Query link copied. Candidate notes remain private to this browser."); }
    catch { setShareMessage("Copy the query link from the field below. Candidate notes are not included."); }
  }

  return <div id="top" className={styles.site}>
    <a className="skip-link" href="#explorer">Skip to the explorer</a>
    <header className={styles.header}>
      <Brand />
      <nav aria-label="Main navigation"><a href="#explorer">EXPLORER</a><a href="#guide">HOW TO LOOK</a><a href="https://spherex.caltech.edu/" target="_blank" rel="noreferrer">THE MISSION</a></nav>
      <span className={styles.buildLabel}>NASA SPACE APPS / 2026</span>
    </header>

    <main>
      <section className={styles.introduction} aria-labelledby="hero-title">
        <div><span className={styles.eyebrow}>A DIFFERENT WAY TO LOOK BACK</span><h1 id="hero-title">REWIND THE SKY.<br /><span>REVEAL THE CHANGE.</span></h1></div>
        <p>One sky. Many moments.<br />Explore the changing infrared sky through observations from NASA's SPHEREx mission.</p>
      </section>

      {explorer.notices.length > 0 && <div className={styles.notices} role="status">{explorer.notices.map((notice, index) => <p key={index}>{notice}</p>)}</div>}

      <section id="explorer" className={styles.workspace} aria-label="Sky observation explorer">
        <div className={styles.mainInstrument}>
          <div className={styles.searchStatus} data-state={explorer.status.state}>
            <div role={explorer.status.error ? "alert" : "status"} aria-live={explorer.status.error ? "assertive" : "polite"}><span className={styles.statusLabel}>{explorer.status.state === "idle" ? "OBSERVATORY" : explorer.status.state.toUpperCase()}</span><p>{explorer.status.message}</p>{explorer.status.error?.details.length ? <ul>{explorer.status.error.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul> : null}</div>
            {explorer.busy && <><progress aria-label="Sequence preparation progress" max="1" {...(explorer.status.progress == null ? {} : { value: explorer.status.progress })} /><button className={styles.secondaryButton} type="button" onClick={() => void explorer.cancelCurrent()}>Cancel search</button></>}
            {!explorer.busy && explorer.status.error && explorer.request && <button className={styles.secondaryButton} type="button" onClick={() => void explorer.runQuery(explorer.request!)}>Retry this query</button>}
            {explorer.busy && explorer.sequence && <p className={styles.previousNotice}>The previous sequence remains visible below with its original dates and source context while this new search runs.</p>}
          </div>
          <SkyViewer sequence={explorer.sequence} activeFrameId={explorer.activeFrameId} annotations={visibleAnnotations} onFrameChange={explorer.setActiveFrameId} onSelect={explorer.setSelection} tool={explorer.tool} onToolChange={explorer.setTool} comparison={explorer.comparison} onComparisonChange={explorer.setComparison} />
          <TargetPresets presets={explorer.presets} loading={explorer.catalogLoading} error={explorer.presetError} disabled={explorer.busy} onRetry={explorer.refreshCatalog} onSelect={preset => {
            if (preset.ra_deg == null || preset.dec_deg == null) return;
            void explorer.runQuery({ ra_deg: preset.ra_deg, dec_deg: preset.dec_deg, coordinate_frame: "ICRS", fov_arcmin: 6, max_frames: 24 });
          }} />
          <section className={styles.examples} aria-labelledby="example-title">
            <div><span className={styles.eyebrow}>OTHER WAYS TO LOOK</span><h2 id="example-title">Real examples. Explicit simulations.</h2></div>
            {explorer.catalogLoading ? <p>Checking for previously acquired real sequences...</p> : explorer.exampleError ? <p>{explorer.exampleError} <button type="button" className={styles.inlineButton} onClick={explorer.refreshCatalog}>Retry examples</button></p> : explorer.examples.length ? <ul>{explorer.examples.map(example => <li key={example.sequence_id}><button className={styles.secondaryButton} type="button" disabled={explorer.busy} onClick={() => explorer.loadExample(example)}>{example.title}<small>Cached real observations / {example.frames.length} frames</small></button></li>)}</ul> : <p>No verified cached real sequence is installed on this backend yet. Live search remains available when the archive is reachable.</p>}
            <details className={styles.simulationDisclosure}><summary>Try the viewer with a simulation</summary><p>This opt-in example uses generated test images. It demonstrates controls and candidate notes, and is not evidence of a SPHEREx observation or a discovery.</p><button className={styles.secondaryButton} type="button" disabled={explorer.busy} onClick={() => void explorer.loadSynthetic()}>Open simulation</button></details>
          </section>
          <ObservationDetails sequence={explorer.sequence} activeFrameId={explorer.activeFrameId} />
        </div>
        <aside className={styles.sidePanel} aria-label="Field selection and candidate notes">
          <CoordinateForm request={explorer.request} onSubmit={request => void explorer.runQuery(request)} busy={explorer.busy} />
          <section className={styles.sharing} aria-labelledby="share-title"><h2 id="share-title">Bring someone to this field.</h2><button className={styles.secondaryButton} type="button" onClick={() => void copySearch()} disabled={!explorer.request && !explorer.sequence}>Copy query link</button><p>Links share search parameters or an explicit example. They do not publish your candidate notes.</p>{shareMessage && <div role="status"><p>{shareMessage}</p><label className="sr-only" htmlFor="query-link">Shareable query link</label><input id="query-link" value={explorer.shareLink} readOnly onFocus={event => event.target.select()} /></div>}</section>
          <AnnotationPanel selection={explorer.selection} annotations={visibleAnnotations} sequence={explorer.sequence} request={explorer.displayedRequest} comparisonFrameIds={comparisonFrameIds} storageWarning={storageWarning} onAdd={(selection, note) => addAnnotation(selection, note, explorer.sequence ? { manifest: explorer.sequence, query: explorer.displayedRequest, comparisonFrameIds } : undefined)} onRemove={removeAnnotation} />
        </aside>
      </section>

      <section id="guide" className={styles.guide} aria-labelledby="guide-title"><div><span className={styles.eyebrow}>THE OBSERVER'S FIELD GUIDE</span><h2 id="guide-title">Pause. Compare. Notice.</h2></div><ol><li><span>01</span><h3>Choose your field</h3><p>Search an ICRS sky position, then inspect observations that actually cover it. A field may have too few compatible frames.</p></li><li><span>02</span><h3>Move through time</h3><p>Use Time to scrub real epochs, Pan to change the viewport, and A/B to compare two frames. Missing dates remain missing.</p></li><li><span>03</span><h3>Keep the evidence</h3><p>Mark a candidate, inspect source quality, and export its metadata and notes. A change still needs verification.</p></li></ol></section>
      <details className={styles.credits}><summary>Sources, acknowledgements, and limitations</summary><p>This project uses NASA SPHEREx data served by the NASA/IPAC Infrared Science Archive. SPHEREx is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, funded by NASA. Source files and processing context are attached to each real frame.</p><p>NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.</p><p><a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">SPHEREx archive and documentation</a> / <a href="https://doi.org/10.26131/IRSA678" target="_blank" rel="noreferrer">DR1 spectral image data reference</a></p></details>
    </main>
    <footer className={styles.footer}><span>KHONSU / BYTEBOYZ</span><p>NASA Space Apps Challenge 2026. Independent participant project.</p><a href="https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/" target="_blank" rel="noreferrer">CHALLENGE BRIEF</a></footer>
  </div>;
}
