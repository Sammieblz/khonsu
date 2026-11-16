import type { components } from "./generated";

// Tyrone owns this fetch boundary. Shapes come from the generated contract;
// do not declare a second copy of an API model here.
export type SequenceRequest = components["schemas"]["SequenceRequest"];
export type SequenceJob = components["schemas"]["SequenceJob"];
export type SequenceManifest = components["schemas"]["SequenceManifest"];
export type JobStatus = SequenceJob["status"];
export type PresetTarget = components['schemas']['PresetTarget'];
export type GaiaContext = components['schemas']['GaiaContext'];
export type GaiaSource = components['schemas']['GaiaSource'];

export function notebookTransport(key:string){
  const headers={'X-Khonsu-Notebook':key,'Content-Type':'application/json'};
  return {
    read:()=>requestJson<components['schemas']['NotebookRecord']>('/v1/notebook',{headers,cache:'no-store',signal:AbortSignal.timeout(5000)}),
    write:(revision:number,document:components['schemas']['NotebookDocument'])=>requestJson<components['schemas']['NotebookRecord']>('/v1/notebook',{method:'PUT',headers,body:JSON.stringify({revision,document}),cache:'no-store',signal:AbortSignal.timeout(8000)}),
  };
}

export async function loadGaiaContext(sequence: SequenceManifest, signal: AbortSignal): Promise<GaiaContext> {
  if (sequence.data_mode === 'synthetic' || !/^[a-zA-Z0-9_-]{1,80}$/.test(sequence.sequence_id)) {
    throw new ApiClientError('Catalog context requires a real observation sequence.', 409, 'CONTEXT_UNAVAILABLE');
  }
  const kind = sequence.data_mode === 'cached-real' ? 'examples' : 'sequences';
  const result = await requestJson<GaiaContext>(`/v1/${kind}/${sequence.sequence_id}/context/gaia`, {signal});
  const frames = new Set(sequence.frames.map(frame => frame.frame_id));
  if (result.sequence_id !== sequence.sequence_id || result.catalog !== 'Gaia DR3' || !Array.isArray(result.sources) || result.sources.length > 500 ||
      result.sources.some(source => !/^[0-9]{1,20}$/.test(source.source_id) || !Array.isArray(source.positions) || source.positions.length > frames.size ||
        source.positions.some(point => !frames.has(point.frame_id) || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < -.5 || point.y < -.5 || point.x >= sequence.grid.width_px-.5 || point.y >= sequence.grid.height_px-.5))) {
    throw new ApiClientError('The catalog context does not match this sky grid.', 502, 'INVALID_RESPONSE');
  }
  return result;
}
export async function listPresets(signal?:AbortSignal):Promise<PresetTarget[]> {
  const items=await requestJson<PresetTarget[]>('/v1/presets',{signal});
  if(!Array.isArray(items))throw new ApiClientError('The target catalog is unavailable.',502,'INVALID_RESPONSE');
  return items;
}

/** Client-side codes for failures that never reach an API error body. */
export const CLIENT_ERROR = {
  backendUnavailable: "BACKEND_UNAVAILABLE",
  invalidResponse: "INVALID_RESPONSE",
  pollTimeout: "POLL_TIMEOUT",
  cancelled: "CANCELLED",
  expired: "JOB_EXPIRED",
  notConfigured: "API_NOT_CONFIGURED",
} as const;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(message: string, status: number, code: string, details: string[] = []) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

function isLoopback(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname) || hostname.endsWith(".localhost");
}

/**
 * Why this page cannot use the API origin compiled into it, or null when it
 * can. Without this, a public build made without NEXT_PUBLIC_API_BASE_URL
 * would send every visitor's browser to port 8000 on their own computer.
 */
export function apiConfigurationProblem(
  pageUrl: string | undefined = typeof window === "undefined" ? undefined : window.location.href,
): string | null {
  if (!pageUrl) return null;
  const page = new URL(pageUrl);
  let api: URL;
  try {
    api = new URL(apiBaseUrl());
  } catch {
    return "This copy of Khonsu has an invalid observation service address. The site operator must rebuild it with NEXT_PUBLIC_API_BASE_URL set to the HTTPS API origin.";
  }
  if (!isLoopback(page.hostname) && isLoopback(api.hostname)) {
    return "This copy of Khonsu was built without a public observation service address, so it would contact your own computer instead. The site operator must rebuild it with NEXT_PUBLIC_API_BASE_URL set to the HTTPS API origin.";
  }
  if (page.protocol === "https:" && api.protocol !== "https:" && !isLoopback(api.hostname)) {
    return "This secure page is configured with an insecure observation service address, which browsers block. The site operator must rebuild it with an HTTPS API origin.";
  }
  return null;
}

/** Resolve an API-relative artifact path (from a manifest) against the API origin. */
export function resolveAssetUrl(imageUrl: string): string {
  return new URL(imageUrl, `${apiBaseUrl()}/`).toString();
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isAbort(error: unknown): boolean {
  return record(error)?.name === "AbortError";
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const problem = apiConfigurationProblem();
  if (problem) throw new ApiClientError(problem, 0, CLIENT_ERROR.notConfigured);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, init);
  } catch (error) {
    if (isAbort(error)) throw error;
    const slow = record(error)?.name === "TimeoutError";
    throw new ApiClientError(
      slow
        ? "The observation service did not answer in time. Check that the backend is running, then retry."
        : "The observation service is unavailable. Start the backend container or check the configured API address.",
      0, CLIENT_ERROR.backendUnavailable,
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = record(payload);
    const detail = record(body?.error) ?? record(body?.detail) ?? body;
    const message = typeof detail?.message === "string" ? detail.message : "The observation service could not complete this request.";
    const code = typeof detail?.code === "string" ? detail.code : "REQUEST_FAILED";
    const details = Array.isArray(detail?.details) ? detail.details.filter((item): item is string => typeof item === "string") : [];
    throw new ApiClientError(message, response.status, code, details);
  }
  if (payload === null) {
    throw new ApiClientError("The observation service returned an unreadable response.", response.status, CLIENT_ERROR.invalidResponse);
  }
  return payload as T;
}

const jobPath = (sequenceId: string) => `/v1/sequences/${encodeURIComponent(sequenceId)}`;

/** Upper bound for the job-creation request, which only validates and enqueues. */
export const CREATE_TIMEOUT_MS = 30_000;

export function createSequence(request: SequenceRequest, signal?: AbortSignal): Promise<SequenceJob> {
  return requestJson<SequenceJob>("/v1/sequences", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal,
  });
}

export function getSequenceStatus(sequenceId: string, signal?: AbortSignal): Promise<SequenceJob> {
  return requestJson<SequenceJob>(jobPath(sequenceId), { signal });
}

export function getSequenceManifest(sequenceId: string, signal?: AbortSignal): Promise<SequenceManifest> {
  return requestJson<SequenceManifest>(`${jobPath(sequenceId)}/manifest`, { signal });
}

export function cancelSequence(sequenceId: string): Promise<SequenceJob> {
  return requestJson<SequenceJob>(`${jobPath(sequenceId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

/** Verified cached-real sequences bundled with the backend; often empty. */
export function listExamples(signal?: AbortSignal): Promise<SequenceManifest[]> {
  return requestJson<SequenceManifest[]>("/v1/examples", { signal });
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Called with every job state the server reports, including the first. */
  onUpdate?: (job: SequenceJob) => void;
  initialPollMs?: number;
  maxPollIntervalMs?: number;
  /** Stop waiting (and cancel the job) after this long. */
  maxWaitMs?: number;
  /** Consecutive unreachable-backend polls tolerated before giving up. */
  maxPollFailures?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

function abortError(): Error {
  const error = new Error("The search was replaced or cancelled.");
  error.name = "AbortError";
  return error;
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(abortError()); }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const TERMINAL_STATUSES = new Set<JobStatus>(["ready", "failed", "cancelled", "expired"]);

function terminalError(job: SequenceJob): ApiClientError {
  if (job.status === "failed") {
    return new ApiClientError(
      job.error?.message ?? "The sequence could not be prepared.", 0,
      job.error?.code ?? "PROCESSING_FAILED", job.error?.details ?? [],
    );
  }
  if (job.status === "cancelled") {
    return new ApiClientError("The search was cancelled.", 0, CLIENT_ERROR.cancelled);
  }
  return new ApiClientError("This temporary job expired or the backend restarted. Repeat the search.", 410, CLIENT_ERROR.expired);
}

function cancelQuietly(sequenceId: string): Promise<void> {
  return cancelSequence(sequenceId).then(() => undefined, () => undefined);
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

// Coordinates round-trip through JSON unchanged; the tolerance only absorbs
// float formatting, far below one SPHEREx pixel (about 6 arcseconds).
const TARGET_TOLERANCE_DEG = 1e-7;

/** Reject a manifest that does not belong to this job and this search. */
function checkManifest(manifest: SequenceManifest, sequenceId: string, request: SequenceRequest): SequenceManifest {
  const target = record(record(manifest)?.target);
  const sameField = typeof target?.ra_deg === "number" && typeof target.dec_deg === "number"
    && Math.abs(target.ra_deg - request.ra_deg) <= TARGET_TOLERANCE_DEG
    && Math.abs(target.dec_deg - request.dec_deg) <= TARGET_TOLERANCE_DEG;
  if (manifest.sequence_id !== sequenceId || manifest.data_mode !== "live" || !sameField) {
    throw new ApiClientError(
      "The service returned a sequence that does not match this search, so it was not shown. Retry the search.",
      0, CLIENT_ERROR.invalidResponse,
    );
  }
  return manifest;
}

/**
 * Start a sequence job and poll with capped backoff until it is ready, then
 * return its manifest. Rejects with ApiClientError for every failure state and
 * with an AbortError when the caller aborts.
 *
 * Aborting never leaves work behind: creation is allowed to finish so the
 * server-assigned job can be cancelled, a non-terminal job is cancelled before
 * the promise settles, and no request is sent after that.
 */
export async function runSequenceJob(request: SequenceRequest, options: RunOptions = {}): Promise<SequenceManifest> {
  const { signal, onUpdate } = options;
  const sleep = options.sleep ?? abortableSleep;
  const now = options.now ?? Date.now;
  const maxInterval = options.maxPollIntervalMs ?? 5000;
  const maxFailures = options.maxPollFailures ?? 3;
  const deadline = now() + (options.maxWaitMs ?? 10 * 60 * 1000);
  let interval = options.initialPollMs ?? 1000;
  let failures = 0;

  if (signal?.aborted) throw abortError();
  // Not tied to the caller's signal: an aborted POST could still create a job
  // that nobody can cancel, holding the single science worker for minutes.
  let job = await createSequence(request, timeoutSignal(CREATE_TIMEOUT_MS));
  const sequenceId = job.sequence_id;
  try {
    if (signal?.aborted) throw abortError();
    onUpdate?.(job);
    while (job.status !== "ready") {
      if (TERMINAL_STATUSES.has(job.status)) throw terminalError(job);
      if (now() >= deadline) {
        await cancelQuietly(sequenceId);
        throw new ApiClientError("Stopped waiting for this search. The archive may be slow; try again or request fewer frames.", 0, CLIENT_ERROR.pollTimeout);
      }
      await sleep(interval, signal);
      interval = Math.min(maxInterval, Math.round(interval * 1.5));
      try {
        job = await getSequenceStatus(sequenceId, signal);
        failures = 0;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 410) throw terminalError({ ...job, status: "expired" });
        if (error instanceof ApiClientError && error.code === CLIENT_ERROR.backendUnavailable) {
          // Ride out a brief outage such as a container restart. If the
          // process did restart, the next answer is a 410 for the lost job.
          if (++failures < maxFailures) continue;
          throw new ApiClientError(
            "Lost contact with the observation service while the search was running. Check that the backend is still running, then retry.",
            0, CLIENT_ERROR.backendUnavailable,
          );
        }
        throw error;
      }
      onUpdate?.(job);
    }
    return checkManifest(await getSequenceManifest(sequenceId, signal), sequenceId, request);
  } catch (error) {
    if (signal?.aborted) {
      if (!TERMINAL_STATUSES.has(job.status)) await cancelQuietly(sequenceId);
      throw isAbort(error) ? error : abortError();
    }
    throw error;
  }
}

/** Distinct, readable failure states shown to the user. */
export type FailureKind =
  | "invalid-search" | "no-coverage" | "too-large" | "archive" | "busy" | "timeout"
  | "unusable-data" | "processing" | "expired" | "unreachable" | "misconfigured" | "not-configured" | "cancelled" | "notebook-offline" | "notebook-full" | "notebook-conflict";

export interface FailureGuide {
  kind: FailureKind;
  /** Short panel heading. */
  title: string;
  /** What the user can do next, in plain language. */
  hint: string;
  /** Repeating the identical search can reasonably succeed. */
  retry: boolean;
  /** Changing the coordinates, field or frame count is the useful next step. */
  editSearch: boolean;
  /** Offer a bundled cached real example, when one is available. */
  cachedExample: boolean;
}

const GUIDES: Record<FailureKind, Omit<FailureGuide, "kind">> = {
  "notebook-offline":{title:'NOTEBOOK DATABASE UNAVAILABLE',hint:'Your page keeps its notes. Export a copy and retry notebook saving when the service is available.',retry:true,editSearch:false,cachedExample:false},
  "notebook-full":{title:'NOTEBOOK STORAGE LIMIT',hint:'Export your notebook and remove older entries before saving again.',retry:false,editSearch:false,cachedExample:false},
  "notebook-conflict":{title:'NOTEBOOK COPIES DIFFER',hint:'Export this page, then choose which notebook copy to keep. No copy was silently overwritten.',retry:false,editSearch:false,cachedExample:false},
  "invalid-search": {
    title: "CHECK THE SEARCH", retry: false, editSearch: true, cachedExample: false,
    hint: "The service rejected these search values. Correct them and search again.",
  },
  "no-coverage": {
    title: "NOT ENOUGH COMPARABLE OBSERVATIONS", retry: false, editSearch: true, cachedExample: true,
    hint: "The SPHEREx data here could not form a time sequence, so retrying the same search will not help. Try another target or a wider field, or explore a cached real example.",
  },
  "too-large": {
    title: "SEARCH TOO LARGE", retry: false, editSearch: true, cachedExample: false,
    hint: "This search exceeds a safety limit. Use a smaller field of view or another target.",
  },
  archive: {
    title: "IRSA ARCHIVE UNAVAILABLE", retry: true, editSearch: false, cachedExample: true,
    hint: "The NASA/IPAC archive did not deliver usable data. Wait a minute and retry, or explore a cached real example meanwhile.",
  },
  busy: {
    title: "OBSERVATION SERVICE BUSY", retry: true, editSearch: false, cachedExample: true,
    hint: "The observation service is at capacity. Retry after the current search finishes or temporary results expire.",
  },
  timeout: {
    title: "SEARCH TOOK TOO LONG", retry: true, editSearch: true, cachedExample: true,
    hint: "The search ran past its time limit. Retry when the archive is less busy, or use a smaller field.",
  },
  "unusable-data": {
    title: "ARCHIVE DATA COULD NOT BE USED", retry: false, editSearch: true, cachedExample: true,
    hint: "The observations for this field failed a validity check, so no frames were shown. Try another target or explore a cached real example.",
  },
  processing: {
    title: "PROCESSING FAILED", retry: true, editSearch: true, cachedExample: true,
    hint: "The observations could not be prepared. Retry once; if it fails again, try another target.",
  },
  expired: {
    title: "SEARCH EXPIRED", retry: true, editSearch: false, cachedExample: false,
    hint: "Search results are kept only temporarily and do not survive a service restart. Your coordinates are still in the form; retry to start a fresh search.",
  },
  unreachable: {
    title: "OBSERVATION SERVICE UNREACHABLE", retry: true, editSearch: false, cachedExample: false,
    hint: "Retry once the backend is running. Cached real examples come from the same service, so they are unavailable until it is reachable.",
  },
  "not-configured": {
    title: "SITE NOT CONNECTED TO A SERVICE", retry: false, editSearch: false, cachedExample: false,
    hint: "Searches and saved observations both come from the observation service, so nothing can load until this site is rebuilt with its address.",
  },
  misconfigured: {
    title: "LIVE SEARCH NOT AVAILABLE", retry: false, editSearch: false, cachedExample: true,
    hint: "The observation service is running without the scientific components live searches need. Rebuild it with them, or explore a cached real example.",
  },
  cancelled: {
    title: "SEARCH CANCELLED", retry: true, editSearch: true, cachedExample: false,
    hint: "The search was cancelled. Your coordinates are still in the form.",
  },
};

// Every code the API, retrieval, processing or this client can report.
// Unknown codes fall back to "processing", which still offers a retry.
const KIND_BY_CODE: Record<string, FailureKind> = {
  NOTEBOOK_UNAVAILABLE:'notebook-offline',NOTEBOOK_TOO_LARGE:'notebook-full',NOTEBOOK_CAPACITY:'notebook-full',NOTEBOOK_CONFLICT:'notebook-conflict',
  INVALID_REQUEST: "invalid-search", invalid_target: "invalid-search", INVALID_PROCESSING_OPTIONS: "invalid-search",
  NO_USABLE_COVERAGE: "no-coverage", INSUFFICIENT_EPOCHS: "no-coverage",
  INSUFFICIENT_COMPARABLE_EPOCHS: "no-coverage", INSUFFICIENT_SPECTRAL_OVERLAP: "no-coverage",
  too_many_observations: "too-large", archive_size_limit: "too-large", RESOURCE_LIMIT: "too-large",
  archive_busy: "archive", archive_unavailable: "archive", empty_archive_response: "archive",
  invalid_archive_response: "archive", invalid_fits: "archive", unsafe_source_url: "archive", aborted: "archive",
  QUEUE_FULL: "busy", CACHE_FULL: "busy", CACHE_UNAVAILABLE: "busy",
  JOB_TIMEOUT: "timeout", archive_timeout: "timeout", [CLIENT_ERROR.pollTimeout]: "timeout",
  INVALID_FITS: "unusable-data", INVALID_WCS: "unusable-data", INVALID_PROVENANCE: "unusable-data",
  MISSING_QUALITY_DATA: "unusable-data", MISSING_SPECTRAL_METADATA: "unusable-data",
  UNSUPPORTED_RELEASE: "unusable-data", UNSUPPORTED_FLUX_UNIT: "unusable-data",
  PROCESSING_FAILED: "processing", [CLIENT_ERROR.invalidResponse]: "processing", NOT_READY: "processing",
  [CLIENT_ERROR.expired]: "expired", ASSET_EXPIRED: "expired",
  [CLIENT_ERROR.backendUnavailable]: "unreachable",
  SCIENCE_UNAVAILABLE: "misconfigured", SCIENCE_DEPENDENCIES_MISSING: "misconfigured",
  [CLIENT_ERROR.notConfigured]: "not-configured",
  [CLIENT_ERROR.cancelled]: "cancelled", cancelled: "cancelled",
};

/** Codes with an explicit failure state; a contract test compares these with the API. */
export function knownFailureCodes(): string[] {
  return Object.keys(KIND_BY_CODE);
}

/** The failure state and recovery actions for an error code. */
export function describeFailure(code: string): FailureGuide {
  const kind = KIND_BY_CODE[code] ?? "processing";
  return { kind, ...GUIDES[kind] };
}

export type Recovery = "retry" | "change-query" | "none";

/** Compact form of describeFailure, kept for existing callers. */
export function recoveryFor(code: string): Recovery {
  const guide = describeFailure(code);
  if (guide.retry) return "retry";
  if (guide.editSearch) return "change-query";
  return "none";
}

