"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/ui/Brand";
import { AnnotationPanel } from "@/features/annotations/AnnotationPanel";
import { downloadText } from "@/features/annotations/download";
import { sequenceContext } from "@/features/annotations/records";
import { useAnnotations } from "@/features/annotations/useAnnotations";
import { SkyViewer } from "@/features/viewer/SkyViewer";
import { ShareField } from '@/features/context/ShareField';
import { compactMode } from '@/features/context/links';
import { ApiClientError, describeFailure, listExamples, listPresets, type PresetTarget, runSequenceJob } from "@/lib/api/client";
import { SequenceSession } from "@/lib/api/session";
import { CoordinateForm, type SharedLinkState } from "./CoordinateForm";
import { DEFAULT_FOV_ARCMIN, readSharedSearch, sharedSearchQuery, type CoordinateValues, type SharedSearch } from "./coordinates";
import { CachedExamplePicker, SearchStatus, type SearchState } from "./SearchStatus";
import { TargetPresets } from "./TargetPresets";
import type { ImageSelection, SequenceManifest, SequenceRequest } from "./interfaces";
import styles from "./explorer.module.css";

export function ExplorerScreen() {
  const [compact,setCompact]=useState(false);
  const [sequence, setSequence] = useState<SequenceManifest | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ImageSelection | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
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
  const candidates = useAnnotations();

  function requestValues(request: SequenceRequest): CoordinateValues {
    return { ra_deg: request.ra_deg, dec_deg: request.dec_deg, fov_arcmin: request.fov_arcmin ?? DEFAULT_FOV_ARCMIN };
  }

  // The address bar always describes the search on screen, so copying it
  // reproduces that search. Candidate notes are never part of it.
  function setAddress(query: string) {
    try {
      if(compactMode(window.location.search))query+=(query?'&':'?')+'embed=1';
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
    setCompact(compactMode(window.location.search));
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
    setSelectedCandidateId(null);
  }

  // The entry button disappears when a sequence opens. Focus only after React
  // has committed the new console, rather than racing the render in a RAF.
  useEffect(() => {
    if (!sequence) return;
    const consoleElement = document.getElementById('explorer');
    consoleElement?.focus({ preventScroll: true });
    consoleElement?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [sequence]);

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

  // A candidate keeps a snapshot of its sequence and the search that produced
  // it, so its evidence survives the live job expiring or a page reload.
  function addCandidate(candidateSelection: ImageSelection, note: string) {
    if (!sequence) return;
    const query = search.phase === "ready" && search.manifest.sequence_id === sequence.sequence_id ? requestValues(search.request) : null;
    let pageBase: string | null = null;
    try { pageBase = `${window.location.origin}${window.location.pathname}`; } catch { /* The link is optional evidence. */ }
    candidates.add(candidateSelection, note, sequenceContext(sequence, query, pageBase, new Date().toISOString()));
  }

  function selectCandidate(candidateId: string | null) {
    setSelectedCandidateId(candidateId);
    const candidate = candidates.annotations.find(item => item.id === candidateId);
    if (candidate && sequence && candidate.selection.sequenceId === sequence.sequence_id) setActiveFrameId(candidate.selection.frameId);
  }

  function removeCandidate(candidateId: string) {
    if (candidateId === selectedCandidateId) setSelectedCandidateId(null);
    candidates.remove(candidateId);
  }

  function downloadUnreadable() {
    const raw = candidates.unreadableData();
    if (raw !== null) downloadText(`khonsu-unreadable-candidates-${new Date().toISOString().slice(0, 10)}.json`, raw);
  }

  // Keep the selected observation in the link once a live sequence is shown.
  useEffect(() => {
    if (search.phase !== "ready") return;
    const frame = search.manifest.frames.find(item => item.frame_id === activeFrameId);
    setAddress(sharedSearchQuery(requestValues(search.request), frame?.observation_id ?? null));
  }, [search, activeFrameId]);

  const picker=<CachedExamplePicker examples={examples} selectedId={selectedExampleId} error={exampleError} loading={examplesLoading} onSelect={id=>{activeExampleLoad.current?.abort();activeExampleLoad.current=null;setSelectedExampleId(id);setExampleError('');}} onLoad={()=>void loadExample()}/>;
  const showConsole=compact||!!sequence||search.phase!=='idle';
  return (
    <div id="top" className={styles.site} data-loaded={showConsole} data-embed={compact}>
      <a className="skip-link" href="#field-command">Skip to field controls</a>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Main navigation"><a href="#field-command">EXPLORE</a><a href="#guide">HOW TO LOOK</a><a href="#credits">CREDITS</a><button onClick={()=>{setMissionOpen(true);requestAnimationFrame(()=>document.getElementById('mission')?.scrollIntoView());}}>THE MISSION</button></nav>
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
          <div className={styles.mainInstrument}><SkyViewer sequence={sequence} activeFrameId={activeFrameId} annotations={candidates.annotations} selectedCandidateId={selectedCandidateId} onFrameChange={setActiveFrameId} onSelect={setSelection}/></div>
          <aside className={styles.sidePanel} aria-label="Observation context and candidate notes">
            {sequence&&<ShareField sequence={sequence} activeFrameId={activeFrameId}/>}
            <SearchStatus state={search} canLoadExample={examples.length > 0} onCancel={cancelSearch} onRetry={retrySearch} onEditSearch={editSearch} onLoadExample={()=>void loadExample()}/>
            {picker}
            <AnnotationPanel sequence={sequence} selection={selection} annotations={candidates.annotations} contexts={candidates.contexts} selectedCandidateId={selectedCandidateId} storage={candidates.storage} atCapacity={candidates.atCapacity} onAdd={addCandidate} onUpdate={candidates.updateNote} onRemove={removeCandidate} onSelectCandidate={selectCandidate} onStartFresh={candidates.startFresh} onDownloadUnreadable={downloadUnreadable}/>
          </aside>
        </section>}
        <section id="guide" className={styles.guide} aria-labelledby="guide-title">
          <div><span className={styles.eyebrow}>THE OBSERVER'S FIELD GUIDE</span><h2 id="guide-title">Pause. Compare. Notice.</h2></div>
          <ol>
            <li><span>01</span><h3>Find your field</h3><p>Choose a known target or enter coordinates. Open saved observations for a quick first look.</p></li>
            <li><span>02</span><h3>Rewind and blink</h3><p>Drag through the actual observation dates, or blink two of them. Pan for a closer look. Nothing is drawn between real observations.</p></li>
            <li><span>03</span><h3>Check the quality</h3><p>Open Observation details &amp; quality for each date's release, wavelength, missing data and warnings. Many apparent changes are gaps, noise or artifacts.</p></li>
            <li><span>04</span><h3>Mark a candidate</h3><p>Choose Mark, select the position and write what you saw. Notes stay in this browser.</p></li>
            <li><span>05</span><h3>Export the evidence</h3><p>Download an evidence file with positions, dates and source links. A search link repeats the search but never carries notes.</p></li>
          </ol>
          <div className={styles.guideNote}>
            <h3>Moving, or changing?</h3>
            <p>A source that sits in different places on different dates may be moving. One that stays put but brightens or fades may be varying, or may only look different because of noise, a slightly different wavelength, unmatched image sharpness or missing data. Khonsu shows the observations; it does not detect, confirm or classify anything. A mark is a lead for follow-up, not a discovery.</p>
          </div>
        </section>
        <details id="mission" className={styles.mission} open={missionOpen} onToggle={event=>setMissionOpen(event.currentTarget.open)}>
          <summary>THE MISSION <span>Explore SPHEREx in 3D</span></summary>
          {missionOpen&&<><div className={styles.missionHeading}><div><h2>The instrument behind the observations.</h2><p>NASA Eyes mission simulation. Its simulation clock is separate from your selected observation dates.</p></div><button className={styles.secondaryButton} onClick={()=>setMissionOpen(false)}>CLOSE MISSION</button></div><iframe src="https://eyes.nasa.gov/apps/solar-system/#/sc_spherex" title="NASA Eyes SPHEREx mission simulation" allow="fullscreen" referrerPolicy="no-referrer"/><p>NASA/JPL-Caltech. If the interactive view cannot load, <a href="https://eyes.nasa.gov/apps/solar-system/#/sc_spherex" target="_blank" rel="noreferrer">open NASA Eyes in a new tab</a>. <a href="https://spherex.caltech.edu/" target="_blank" rel="noreferrer">Read about SPHEREx</a>.</p></>}
        </details>
        <section id="credits" className={styles.credits} aria-labelledby="credits-title">
          <div><span className={styles.eyebrow}>DATA &amp; CREDITS</span><h2 id="credits-title">Where these observations come from.</h2></div>
          <div>
            <p>The images are SPHEREx spectral images from the <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">NASA/IPAC Infrared Science Archive (IRSA)</a>, retrieved as small cutouts and placed by Khonsu on one celestial grid. Each observation's release, UTC time and source FITS link are listed under Observation details &amp; quality in the viewer.</p>
            <p>Acknowledgement requested by IRSA for SPHEREx data: <q>This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.</q></p>
            <p>SPHEREx DR1 spectral images: <a href="https://doi.org/10.26131/IRSA678" target="_blank" rel="noreferrer">doi:10.26131/IRSA678</a>. Some observations are Quick Release (QR) images; IRSA states that <q>the DR1 spectral images are intended to be used together with the QR3 spectral images as a uniformly processed set.</q> See the <a href="https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html" target="_blank" rel="noreferrer">SPHEREx DR1 overview at IRSA</a>.</p>
            <p className={styles.notice}>NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.</p>
            <p>Khonsu is an independent NASA Space Apps Challenge 2026 participant project. It has not been reviewed or approved by NASA, JPL, Caltech or IPAC. The NASA Eyes view in The Mission is a NASA/JPL-Caltech simulation shown for context; its clock never changes observation dates.</p>
          </div>
        </section>
      </main>
      <footer className={styles.footer}><span>KHONSU / BYTEBOYZ</span><p>NASA Space Apps Challenge 2026. Independent participant project.</p><a href="https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/" target="_blank" rel="noreferrer">CHALLENGE BRIEF</a></footer>
    </div>
  );
}
