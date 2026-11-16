"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {downloadText} from '@/features/annotations/download';
import {sequenceContext} from '@/features/annotations/records';
import {useAnnotations} from '@/features/annotations/useAnnotations';
import {compactMode} from '@/features/context/links';
import {ApiClientError,describeFailure,listExamples,listPresets,type PresetTarget,runSequenceJob} from '@/lib/api/client';
import {SequenceSession} from '@/lib/api/session';
import type {SharedLinkState} from './CoordinateForm';
import type {SearchState} from './SearchStatus';
import {DEFAULT_FOV_ARCMIN,sharedSearchQuery,type CoordinateValues,type SharedSearch} from './coordinates';
import type {ImageSelection,SequenceManifest,SequenceRequest} from './interfaces';
import {readConsoleRoute,exampleLink} from './routes';
import {ViewerMemory} from './ViewerMemory';
export type PresentationState={phase:'empty'|'loading'|'ready'|'failed';sequenceId:string|null;frameId:string|null};
function useExplorerController(){
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
  const pathname=usePathname();
  const [draft,setDraft]=useState({ra:'',dec:'',fov:'6'});
  const [noteDraft,setNoteDraft]=useState('');
  const [exampleLoading,setExampleLoading]=useState(false);
  const [presentation,setPresentation]=useState<PresentationState>({phase:'empty',sequenceId:null,frameId:null});
  const lastRoute=useRef('');
  const [sharedLink, setSharedLink] = useState<SharedLinkState | null>(null);
  // The observation a shared link selects, applied only to that link's search.
  const linkedSearch = useRef<SharedSearch | null>(null);
  // One live search at a time; replacing or leaving it cancels its server job.
  const session = useRef<SequenceSession | null>(null);
  const activeExampleLoad = useRef<AbortController | null>(null);
  const candidates = useAnnotations();
  const current = useRef({sequence,search});
  current.current={sequence,search};

  function requestValues(request: SequenceRequest): CoordinateValues {
    return { ra_deg: request.ra_deg, dec_deg: request.dec_deg, fov_arcmin: request.fov_arcmin ?? DEFAULT_FOV_ARCMIN };
  }

  // The address bar always describes the search on screen, so copying it
  // reproduces that search. Candidate notes are never part of it.
  function setAddress(query: string) {
    try {
      if(compactMode(window.location.search))query+=(query?'&':'?')+'embed=1';
      window.history.replaceState(window.history.state, "", `/console/${query}`);
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
    setPresentation({phase:"loading",sequenceId:manifest.sequence_id,frameId:manifest.frames[0]?.frame_id??null});
    setActiveFrameId(manifest.frames[0]?.frame_id ?? null);
    setSelection(null);
    setSelectedCandidateId(null);
    setNoteDraft('');
  }

  async function submit(request: SequenceRequest) {
    activeExampleLoad.current?.abort();
    activeExampleLoad.current = null;
    // Never leave a previous sequence on screen under a new query.
    setSequence(null);
    setActiveFrameId(null);
    setSelection(null);
    setExampleLoading(false);
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
    window.dispatchEvent(new Event("khonsu:field"));
    requestAnimationFrame(()=>document.getElementById("ra")?.focus());
  }

  async function loadExample(id=selectedExampleId, observation:string|null=null) {
    if(!id)return;
    setExampleLoading(true);setSequence(null);setExampleError("");setSearch({phase:"idle"});
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
      const verified = available.find(item => item.sequence_id === id);
      if (!verified) throw new Error("The selected cached example is no longer available. Restore the reviewed bundle and reload this page.");
      showSequence(verified);
      setSearch({ phase: "example", manifest: verified });
      setSelectedExampleId(id);
      const selected=verified.frames.find(frame=>frame.observation_id===observation);
      if(selected)setActiveFrameId(selected.frame_id);
      setAddress('?'+exampleLink(id,selected?.observation_id).split('?')[1]);
      setExampleError("");
    } catch (error) {
      if (activeExampleLoad.current !== controller || controller.signal.aborted) return;
      setExampleError(error instanceof Error ? error.message : "The cached example could not be loaded.");
    } finally {
      if (activeExampleLoad.current === controller) {activeExampleLoad.current = null;setExampleLoading(false);}
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
    if(pathname!=='/console/'&&pathname!=='/console')return;
    if(search.phase==='example'){
      const frame=search.manifest.frames.find(item=>item.frame_id===activeFrameId);
      setAddress('?'+exampleLink(search.manifest.sequence_id,frame?.observation_id).split('?')[1]);return;
    }
    if (search.phase !== "ready") return;
    const frame = search.manifest.frames.find(item => item.frame_id === activeFrameId);
    setAddress(sharedSearchQuery(requestValues(search.request), frame?.observation_id ?? null));
  }, [search, activeFrameId]);


  function cancelExample(){activeExampleLoad.current?.abort();activeExampleLoad.current=null;setExampleLoading(false);setExampleError('Opening saved observations was cancelled. Choose a field or try again.');}
  useEffect(()=>{
    if(pathname!=='/console/'&&pathname!=='/console'){
      activeExampleLoad.current?.abort();activeExampleLoad.current=null;setExampleLoading(false);
      void session.current?.stop();
      setSearch(current=>current.phase==='running'?{phase:'cancelled',request:current.request}:current);
      lastRoute.current='';return;
    }
    function restore(){
      const query=window.location.search;if(lastRoute.current===query+'console')return;lastRoute.current=query+'console';
      const {sequence,search}=current.current;
      setCompact(compactMode(query));const route=readConsoleRoute(query);
      if(route.kind==='example'){
        if(sequence?.sequence_id===route.id){const frame=sequence.frames.find(item=>item.observation_id===route.observation);if(frame)setActiveFrameId(frame.frame_id);return;}
        void loadExample(route.id,route.observation);
      } else if(route.kind==='ok'){
        activeExampleLoad.current?.abort();activeExampleLoad.current=null;setExampleLoading(false);void session.current?.stop();
        linkedSearch.current=route.search;setDraft({ra:String(route.search.values.ra_deg),dec:String(route.search.values.dec_deg),fov:String(route.search.values.fov_arcmin)});
        setSharedLink({values:route.search.values,message:'Search restored. Choose Search this field to query real observations.'});
        const same=search.phase==='ready'&&sharedSearchQuery(requestValues(search.request))===sharedSearchQuery(route.search.values);
        if(!same){setSequence(null);setSearch({phase:'idle'});}
        else {const frame=search.manifest.frames.find(item=>item.observation_id===route.search.observationId);if(frame)setActiveFrameId(frame.frame_id);}
      }else if(route.kind==='invalid'){activeExampleLoad.current?.abort();activeExampleLoad.current=null;setExampleLoading(false);void session.current?.stop();setSequence(null);setSearch({phase:'idle'});setSharedLink({values:null,message:route.message});}
    }
    restore();window.addEventListener('popstate',restore);return()=>{lastRoute.current='';window.removeEventListener('popstate',restore);};
  },[pathname]);
  return {compact,sequence,activeFrameId,setActiveFrameId,selection,setSelection,selectedCandidateId,search,examples,selectedExampleId,setSelectedExampleId,exampleError,examplesLoading,targets,selectedTarget,setSelectedTarget,catalogError,sharedLink,candidates,submit,cancelSearch,retrySearch,editSearch,loadExample,addCandidate,selectCandidate,removeCandidate,downloadUnreadable,draft,setDraft,noteDraft,setNoteDraft,exampleLoading,cancelExample,presentation,setPresentation};
}
const Context=createContext<ReturnType<typeof useExplorerController>|null>(null);
export function ExplorerSession({children}:{children:ReactNode}){const session=useExplorerController();return <Context.Provider value={session}><ViewerMemory>{children}</ViewerMemory></Context.Provider>;}
export function useExplorer(){const session=useContext(Context);if(!session)throw new Error('Explorer session is missing');return session;}
