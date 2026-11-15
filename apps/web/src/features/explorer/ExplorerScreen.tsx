"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/ui/Brand";
import { AnnotationPanel } from "@/features/annotations/AnnotationPanel";
import { useAnnotations } from "@/features/annotations/useAnnotations";
import { SkyViewer } from "@/features/viewer/SkyViewer";
import { ApiClientError, describeFailure, listExamples, listPresets, type PresetTarget, runSequenceJob } from "@/lib/api/client";
import { SequenceSession } from "@/lib/api/session";
import { CoordinateForm, type SharedLinkState } from "./CoordinateForm";
import { DEFAULT_FOV_ARCMIN, readSharedSearch, sharedSearchQuery, type CoordinateValues, type SharedSearch } from "./coordinates";
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
  const [targets,setTargets]=useState<PresetTarget[]>([]);
  const [selectedTarget,setSelectedTarget]=useState<PresetTarget|null>(null);
  const [catalogError,setCatalogError]=useState('');
  const [missionOpen,setMissionOpen]=useState(false);
  const [sharedLink, setSharedLink] = useState<SharedLinkState | null>(null);
  // The observation a shared link selects, applied only to that link's search.
  const linkedSearch = useRef<SharedSearch | null>(null);
  // One live search at a time; replacing or leaving it cancels its server job.
  const session = useRef<SequenceSession | null>(null);
  const activeExampleLoad = useRef<AbortController | null>(null);
  const { annotations, addAnnotation, removeAnnotation } = useAnnotations();

  function requestValues(request: SequenceRequest): CoordinateValues {
    return { ra_deg: request.ra_deg, dec_deg: request.dec_deg, fov_arcmin: request.fov_arcmin ?? DEFAULT_FOV_ARCMIN };
  }

  // The address bar always describes the search on screen, so copying it
  // reproduces that search. Candidate notes are never part of it.
  function setAddress(query: string) {
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${query}${window.location.hash}`);
    } catch {
      // A blocked history update only loses the shareable address.
    }
  }

  function searchSession(): SequenceSession {
    session.current ??= new SequenceSession(runSequenceJob);
    return session.current;
  }

  useEffect(() => {
    const controller = new AbortController();
    const link = readSharedSearch(window.location.search);
    if (link.kind === "ok") {
      const { ra_deg, dec_deg, fov_arcmin } = link.search.values;
      linkedSearch.current = link.search;
      setSharedLink({
        values: link.search.values,
        message: [`Search restored from a shared link: RA ${ra_deg}°, Dec ${dec_deg}°, ${fov_arcmin}′ field. Choose Explore the sky to run it.`, ...link.search.notes].join(" "),
      });
    } else if (link.kind === "invalid") {
      setSharedLink({ values: null, message: link.message });
    }
    listPresets(controller.signal).then(setTargets,()=>{if(!controller.signal.aborted)setCatalogError('Target catalog could not be loaded.');});
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
    requestAnimationFrame(()=>{const consoleElement=document.getElementById('explorer');consoleElement?.focus({preventScroll:true});consoleElement?.scrollIntoView({behavior:'instant',block:'start'});});
  }

  async function submit(request: SequenceRequest) {
    activeExampleLoad.current?.abort();
    activeExampleLoad.current = null;
    // Never leave a previous sequence on screen under a new query.
    setSequence(null);
    setActiveFrameId(null);
    setSelection(null);
    setSearch({ phase: "running", request, job: null });
    setAddress(sharedSearchQuery(requestValues(request)));
    try {
      const manifest = await searchSession().start(request, {
        onUpdate: job => setSearch({ phase: "running", request, job }),
      });
      if (!manifest) return; // Replaced by a newer search or stopped.
      showSequence(manifest);
      const linked = linkedSearch.current;
      if (linked && sharedSearchQuery(linked.values) === sharedSearchQuery(requestValues(request))) {
        linkedSearch.current = null;
        // Select the linked observation only if this sequence really has it.
        const frame = manifest.frames.find(item => item.observation_id === linked.observationId);
        if (frame) setActiveFrameId(frame.frame_id);
      }
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
      setAddress(""); // A cached example is not a search a link can reproduce.
      setExampleError("");
    } catch (error) {
      if (activeExampleLoad.current !== controller || controller.signal.aborted) return;
      setExampleError(error instanceof Error ? error.message : "The cached example could not be loaded.");
    } finally {
      if (activeExampleLoad.current === controller) activeExampleLoad.current = null;
    }
  }

  // Keep the selected observation in the link once a live sequence is shown.
  useEffect(() => {
    if (search.phase !== "ready") return;
    const frame = search.manifest.frames.find(item => item.frame_id === activeFrameId);
    setAddress(sharedSearchQuery(requestValues(search.request), frame?.observation_id ?? null));
  }, [search, activeFrameId]);

  const picker=<CachedExamplePicker examples={examples} selectedId={selectedExampleId} error={exampleError} loading={examplesLoading} onSelect={id=>{activeExampleLoad.current?.abort();activeExampleLoad.current=null;setSelectedExampleId(id);setExampleError('');}} onLoad={()=>void loadExample()}/>;
  const showConsole=!!sequence||search.phase!=='idle';
  return (
    <div id="top" className={styles.site} data-loaded={showConsole}>
      <a className="skip-link" href="#field-command">Skip to field controls</a>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Main navigation"><a href="#field-command">EXPLORE</a><a href="#guide">HOW TO LOOK</a><button onClick={()=>{setMissionOpen(true);requestAnimationFrame(()=>document.getElementById('mission')?.scrollIntoView());}}>THE MISSION</button></nav>
        <span className={styles.buildLabel}>SPHEREx / NASA SPACE APPS 2026</span>
      </header>
      <main>
        <section className={styles.introduction} aria-labelledby="hero-title">
          <div className={styles.celestial} aria-hidden="true" />
          <div className={styles.heroCopy}><span className={styles.eyebrow}>AN OBSERVATORY THROUGH TIME</span><h1 id="hero-title">THE SKY<br/>REMEMBERS.</h1><p>Move through real SPHEREx observations.<br/>Find what time reveals.</p><span className={styles.artLabel}>ORIGINAL CELESTIAL ILLUSTRATION</span></div>
          {!showConsole&&<aside className={styles.entryPanel} aria-label="Open saved observations"><img src="/khonsu-mark.svg" width="100" height="100" alt=""/><p className={styles.tagline}>One sky.<br/>Many moments.</p>{picker}</aside>}
        </section>
        <section id="field-command" className={styles.command} aria-label="Choose a sky field">
          <CoordinateForm target={selectedTarget} shared={sharedLink} onSubmit={request=>void submit(request)} busy={search.phase==='running'}/>
          <TargetPresets targets={targets} selected={selectedTarget?.preset_id} error={catalogError} onChoose={target=>{setSelectedTarget({...target});document.getElementById('ra')?.focus();}}/>
        </section>
        {showConsole&&<section id="explorer" tabIndex={-1} className={styles.workspace} aria-label="Sky observation explorer">
          <div className={styles.mainInstrument}><SkyViewer sequence={sequence} activeFrameId={activeFrameId} annotations={annotations} onFrameChange={setActiveFrameId} onSelect={setSelection}/></div>
          <aside className={styles.sidePanel} aria-label="Observation context and candidate notes">
            <SearchStatus state={search} canLoadExample={examples.length > 0} onCancel={cancelSearch} onRetry={retrySearch} onEditSearch={editSearch} onLoadExample={()=>void loadExample()}/>
            {picker}
            <AnnotationPanel selection={selection} annotations={annotations.filter(item=>item.selection.sequenceId===sequence?.sequence_id)} onAdd={addAnnotation} onRemove={removeAnnotation}/>
          </aside>
        </section>}
        <section id="guide" className={styles.guide} aria-labelledby="guide-title">
          <div><span className={styles.eyebrow}>THE OBSERVER'S FIELD GUIDE</span><h2 id="guide-title">Pause. Compare. Notice.</h2></div>
          <ol><li><span>01</span><h3>Find your field</h3><p>Choose a known target or enter coordinates. Open saved observations for a quick first look.</p></li><li><span>02</span><h3>Rewind the observations</h3><p>Drag through actual dates. Pan for a closer look. Hold or blink to compare two visits.</p></li><li><span>03</span><h3>Question the change</h3><p>Adjust the shared display, inspect quality, and keep a candidate note. Apparent change needs verification.</p></li></ol>
        </section>
        <details id="mission" className={styles.mission} open={missionOpen} onToggle={event=>setMissionOpen(event.currentTarget.open)}>
          <summary>THE MISSION <span>Explore SPHEREx in 3D</span></summary>
          {missionOpen&&<><div className={styles.missionHeading}><div><h2>The instrument behind the observations.</h2><p>NASA Eyes mission simulation. Its simulation clock is separate from your selected observation dates.</p></div><button className={styles.secondaryButton} onClick={()=>setMissionOpen(false)}>CLOSE MISSION</button></div><iframe src="https://eyes.nasa.gov/apps/solar-system/#/sc_spherex" title="NASA Eyes SPHEREx mission simulation" allow="fullscreen" referrerPolicy="no-referrer"/><p>NASA/JPL-Caltech. If the interactive view cannot load, <a href="https://eyes.nasa.gov/apps/solar-system/#/sc_spherex" target="_blank" rel="noreferrer">open NASA Eyes in a new tab</a>. <a href="https://spherex.caltech.edu/" target="_blank" rel="noreferrer">Read about SPHEREx</a>.</p></>}
        </details>
      </main>
      <footer className={styles.footer}><span>KHONSU / BYTEBOYZ</span><p>NASA Space Apps Challenge 2026. Independent participant project.</p><a href="https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/" target="_blank" rel="noreferrer">CHALLENGE BRIEF</a></footer>
    </div>
  );
}
