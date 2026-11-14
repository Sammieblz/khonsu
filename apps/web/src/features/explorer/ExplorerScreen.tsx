"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/ui/Brand";
import { AnnotationPanel } from "@/features/annotations/AnnotationPanel";
import { useAnnotations } from "@/features/annotations/useAnnotations";
import { SkyViewer } from "@/features/viewer/SkyViewer";
import { ApiClientError, cancelSequence, listExamples, recoveryFor, runSequenceJob } from "@/lib/api/client";
import { CoordinateForm } from "./CoordinateForm";
import { SearchStatus, type SearchState } from "./SearchStatus";
import { TargetPresets } from "./TargetPresets";
import type { ImageSelection, SequenceManifest, SequenceRequest } from "./interfaces";
import styles from "./explorer.module.css";

const TERMINAL = new Set(["ready", "failed", "cancelled", "expired"]);

interface ActiveRun {
  controller: AbortController;
  jobId: string | null;
  status: string | null;
}

export function ExplorerScreen() {
  const [sequence, setSequence] = useState<SequenceManifest | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ImageSelection | null>(null);
  const [search, setSearch] = useState<SearchState>({ phase: "idle" });
  const [examples, setExamples] = useState<SequenceManifest[]>([]);
  const activeRun = useRef<ActiveRun | null>(null);
  const { annotations, addAnnotation, removeAnnotation } = useAnnotations();

  // Stop polling and release the single backend worker for an abandoned job.
  function stopActiveRun(): Promise<void> {
    const run = activeRun.current;
    activeRun.current = null;
    if (!run) return Promise.resolve();
    run.controller.abort();
    if (!run.jobId || (run.status && TERMINAL.has(run.status))) return Promise.resolve();
    return cancelSequence(run.jobId).then(() => undefined, () => undefined);
  }

  useEffect(() => {
    const controller = new AbortController();
    listExamples(controller.signal).then(setExamples, () => undefined);
    return () => {
      controller.abort();
      void stopActiveRun();
    };
  }, []);

  function showSequence(manifest: SequenceManifest) {
    setSequence(manifest);
    setActiveFrameId(manifest.frames[0]?.frame_id ?? null);
    setSelection(null);
  }

  async function submit(request: SequenceRequest) {
    await stopActiveRun();
    const run: ActiveRun = { controller: new AbortController(), jobId: null, status: null };
    activeRun.current = run;
    // Never leave a previous sequence on screen under a new query.
    setSequence(null);
    setActiveFrameId(null);
    setSelection(null);
    setSearch({ phase: "running", request, job: null });
    try {
      const manifest = await runSequenceJob(request, {
        signal: run.controller.signal,
        onUpdate: job => {
          if (activeRun.current !== run) return;
          run.jobId = job.sequence_id;
          run.status = job.status;
          setSearch({ phase: "running", request, job });
        },
      });
      if (activeRun.current !== run) return;
      activeRun.current = null;
      showSequence(manifest);
      setSearch({ phase: "ready", request, manifest });
    } catch (error) {
      if (activeRun.current !== run || run.controller.signal.aborted) return;
      activeRun.current = null;
      const failure = error instanceof ApiClientError
        ? error
        : new ApiClientError("The search failed unexpectedly. Retry, or reload the page.", 0, "CLIENT_FAILURE");
      setSearch({ phase: "failed", request, code: failure.code, message: failure.message, recovery: recoveryFor(failure.code) });
    }
  }

  async function cancelSearch() {
    if (search.phase !== "running") return;
    const { request } = search;
    await stopActiveRun();
    setSearch({ phase: "cancelled", request });
  }

  function retrySearch() {
    if (search.phase === "failed" || search.phase === "cancelled") void submit(search.request);
  }

  function loadExample() {
    const example = examples[0];
    if (!example) return;
    void stopActiveRun();
    showSequence(example);
    setSearch({ phase: "example", manifest: example });
  }

  return (
    <div id="top" className={styles.site}>
      <a className="skip-link" href="#explorer">Skip to the explorer</a>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Main navigation"><a href="#explorer">EXPLORER</a><a href="#guide">HOW TO LOOK</a><a href="https://spherex.caltech.edu/" target="_blank" rel="noreferrer">THE MISSION <span aria-hidden="true">↗</span></a></nav>
        <span className={styles.buildLabel}>DEVELOPMENT SCAFFOLD</span>
      </header>

      <main>
        <section className={styles.introduction} aria-labelledby="hero-title">
          <div><span className={styles.eyebrow}>A DIFFERENT WAY TO LOOK BACK</span><h1 id="hero-title">REWIND THE SKY.<br /><span>REVEAL THE CHANGE.</span></h1></div>
          <p>One sky. Many moments.<br />Explore the changing infrared sky through observations from NASA's SPHEREx mission.</p>
        </section>

        <section id="explorer" className={styles.workspace} aria-label="Sky observation explorer">
          <div className={styles.mainInstrument}>
            <SkyViewer sequence={sequence} activeFrameId={activeFrameId} annotations={annotations} onFrameChange={setActiveFrameId} onSelect={setSelection} />
            <TargetPresets />
          </div>
          <aside className={styles.sidePanel} aria-label="Field selection and candidate notes">
            <CoordinateForm onSubmit={request => void submit(request)} busy={search.phase === "running"} />
            <SearchStatus state={search} canLoadExample={examples.length > 0} onCancel={() => void cancelSearch()} onRetry={retrySearch} onLoadExample={loadExample} />
            <AnnotationPanel selection={selection} annotations={annotations.filter(item => item.selection.sequenceId === sequence?.sequence_id)} onAdd={addAnnotation} onRemove={removeAnnotation} />
          </aside>
        </section>

        <section id="guide" className={styles.guide} aria-labelledby="guide-title">
          <div><span className={styles.eyebrow}>THE OBSERVER'S FIELD GUIDE</span><h2 id="guide-title">Pause. Compare. Notice.</h2></div>
          <ol><li><span>01</span><h3>Choose your field</h3><p>Search a sky position, then review the observations that actually cover it.</p></li><li><span>02</span><h3>Move through time</h3><p>Compare dated frames with matching coordinates and compatible wavelength coverage.</p></li><li><span>03</span><h3>Keep the evidence</h3><p>Mark a candidate and record its frame, position, and quality information. A change still needs verification.</p></li></ol>
        </section>
      </main>

      <footer className={styles.footer}><span>KHONSU / BYTEBOYZ</span><p>NASA Space Apps Challenge 2026. Independent participant project.</p><a href="https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/" target="_blank" rel="noreferrer">CHALLENGE BRIEF ↗</a></footer>
    </div>
  );
}
