"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/ui/Brand";
import { AnnotationPanel } from "@/features/annotations/AnnotationPanel";
import { useAnnotations } from "@/features/annotations/useAnnotations";
import { SkyViewer } from "@/features/viewer/SkyViewer";
import { ApiClientError, describeFailure, listExamples, runSequenceJob } from "@/lib/api/client";
import { SequenceSession } from "@/lib/api/session";
import { CoordinateForm } from "./CoordinateForm";
import { CachedExamplePicker, SearchStatus, type SearchState } from "./SearchStatus";
import { TargetPresets } from "./TargetPresets";
import type { ImageSelection, SequenceManifest, SequenceRequest } from "./interfaces";
import styles from "./explorer.module.css";

export function ExplorerScreen() {
  const [sequence, setSequence] = useState<SequenceManifest | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ImageSelection | null>(null);
  const [search, setSearch] = useState<SearchState>({ phase: "idle" });
  const [examples, setExamples] = useState<SequenceManifest[]>([]);
  const [selectedExampleId, setSelectedExampleId] = useState("");
  const [exampleError, setExampleError] = useState("");
  const [examplesLoading, setExamplesLoading] = useState(true);
  // One live search at a time; replacing or leaving it cancels its server job.
  const session = useRef<SequenceSession | null>(null);
  const activeExampleLoad = useRef<AbortController | null>(null);
  const { annotations, addAnnotation, removeAnnotation } = useAnnotations();

  function searchSession(): SequenceSession {
    session.current ??= new SequenceSession(runSequenceJob);
    return session.current;
  }

  useEffect(() => {
    const controller = new AbortController();
    listExamples(controller.signal).then(items => {
      setExamples(items);
      setSelectedExampleId(items[0]?.sequence_id ?? "");
      setExamplesLoading(false);
    }, error => {
      if (controller.signal.aborted) return;
      setExampleError(error instanceof ApiClientError ? error.message : "Cached observation examples could not be checked. Check the local observation service.");
      setExamplesLoading(false);
    });
    return () => {
      controller.abort();
      activeExampleLoad.current?.abort();
      void session.current?.stop();
    };
  }, []);

  function showSequence(manifest: SequenceManifest) {
    setSequence(manifest);
    setActiveFrameId(manifest.frames[0]?.frame_id ?? null);
    setSelection(null);
  }

  async function submit(request: SequenceRequest) {
    activeExampleLoad.current?.abort();
    activeExampleLoad.current = null;
    // Never leave a previous sequence on screen under a new query.
    setSequence(null);
    setActiveFrameId(null);
    setSelection(null);
    setSearch({ phase: "running", request, job: null });
    try {
      const manifest = await searchSession().start(request, {
        onUpdate: job => setSearch({ phase: "running", request, job }),
      });
      if (!manifest) return; // Replaced by a newer search or stopped.
      showSequence(manifest);
      setSearch({ phase: "ready", request, manifest });
    } catch (error) {
      const failure = error instanceof ApiClientError
        ? error
        : new ApiClientError("The search failed unexpectedly. Retry, or reload the page.", 0, "CLIENT_FAILURE");
      setSearch({
        phase: "failed", request, code: failure.code, message: failure.message,
        details: failure.details, guide: describeFailure(failure.code),
      });
    }
  }

  function cancelSearch() {
    if (search.phase !== "running") return;
    setSearch({ phase: "cancelled", request: search.request });
    void searchSession().stop();
  }

  function retrySearch() {
    if (search.phase === "failed" || search.phase === "cancelled") void submit(search.request);
  }

  function editSearch() {
    document.getElementById("ra")?.focus();
  }

  async function loadExample() {
    const example = examples.find(item => item.sequence_id === selectedExampleId);
    if (!example) return;
    activeExampleLoad.current?.abort();
    const controller = new AbortController();
    activeExampleLoad.current = controller;
    await searchSession().stop();
    if (activeExampleLoad.current !== controller || controller.signal.aborted) return;
    setSearch(state => state.phase === "running" ? { phase: "cancelled", request: state.request } : state);
    // Recheck the selected bundle: a missing or corrupt asset must not load a
    // different cached field under the user's selected example name.
    try {
      const available = await listExamples(controller.signal);
      if (activeExampleLoad.current !== controller || controller.signal.aborted) return;
      const verified = available.find(item => item.sequence_id === selectedExampleId);
      if (!verified) throw new Error("The selected cached example is no longer available. Restore the reviewed bundle and reload this page.");
      showSequence(verified);
      setSearch({ phase: "example", manifest: verified });
      setExampleError("");
    } catch (error) {
      if (activeExampleLoad.current !== controller || controller.signal.aborted) return;
      setExampleError(error instanceof Error ? error.message : "The cached example could not be loaded.");
    } finally {
      if (activeExampleLoad.current === controller) activeExampleLoad.current = null;
    }
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
            <SearchStatus state={search} canLoadExample={examples.length > 0} onCancel={cancelSearch} onRetry={retrySearch} onEditSearch={editSearch} onLoadExample={() => void loadExample()} />
            <CachedExamplePicker examples={examples} selectedId={selectedExampleId} error={exampleError} loading={examplesLoading} onSelect={id => { activeExampleLoad.current?.abort(); activeExampleLoad.current = null; setSelectedExampleId(id); setExampleError(""); }} onLoad={() => void loadExample()} />
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
