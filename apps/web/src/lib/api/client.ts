import type { components } from "./generated";

// Tyrone owns this fetch boundary. Shapes come from the generated contract;
// do not declare a second copy of an API model here.
export type SequenceRequest = components["schemas"]["SequenceRequest"];
export type SequenceJob = components["schemas"]["SequenceJob"];
export type SequenceManifest = components["schemas"]["SequenceManifest"];
export type JobStatus = SequenceJob["status"];
export type PresetTarget = components['schemas']['PresetTarget'];
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
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, init);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiClientError(
      "The observation service is unavailable. Start the backend container or check the configured API address.",
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
  return requestJson<SequenceJob>(`${jobPath(sequenceId)}/cancel`, { method: "POST" });
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

/**
 * Start a sequence job and poll with capped backoff until it is ready, then
 * return its manifest. Rejects with ApiClientError for every failure state and
 * with an AbortError when the caller aborts; no polling continues after either.
 */
export async function runSequenceJob(request: SequenceRequest, options: RunOptions = {}): Promise<SequenceManifest> {
  const { signal, onUpdate } = options;
  const sleep = options.sleep ?? abortableSleep;
  const now = options.now ?? Date.now;
  const maxInterval = options.maxPollIntervalMs ?? 5000;
  const deadline = now() + (options.maxWaitMs ?? 10 * 60 * 1000);
  let interval = options.initialPollMs ?? 1000;

  let job = await createSequence(request, signal);
  onUpdate?.(job);
  while (job.status !== "ready") {
    if (job.status === "failed" || job.status === "cancelled" || job.status === "expired") throw terminalError(job);
    if (now() >= deadline) {
      await cancelSequence(job.sequence_id).catch(() => undefined);
      throw new ApiClientError("Stopped waiting for this search. The archive may be slow; try again or request fewer frames.", 0, CLIENT_ERROR.pollTimeout);
    }
    await sleep(interval, signal);
    interval = Math.min(maxInterval, Math.round(interval * 1.5));
    try {
      job = await getSequenceStatus(job.sequence_id, signal);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 410) throw terminalError({ ...job, status: "expired" });
      throw error;
    }
    onUpdate?.(job);
  }
  return getSequenceManifest(job.sequence_id, signal);
}

export type Recovery = "retry" | "change-query" | "none";

const RETRYABLE = new Set([
  "archive_busy", "archive_unavailable", "archive_timeout", "empty_archive_response", "invalid_archive_response",
  "JOB_TIMEOUT", "QUEUE_FULL", "CACHE_FULL", "CACHE_UNAVAILABLE", "PROCESSING_FAILED",
  CLIENT_ERROR.backendUnavailable, CLIENT_ERROR.pollTimeout, CLIENT_ERROR.expired, CLIENT_ERROR.cancelled,
]);
const CHANGE_QUERY = new Set([
  "INVALID_REQUEST", "invalid_target", "too_many_observations", "archive_size_limit",
  "INSUFFICIENT_EPOCHS", "INSUFFICIENT_COMPARABLE_EPOCHS", "INSUFFICIENT_SPECTRAL_OVERLAP",
  "NO_USABLE_COVERAGE", "RESOURCE_LIMIT",
]);

/** What a user can usefully do next after a failure with this code. */
export function recoveryFor(code: string): Recovery {
  if (RETRYABLE.has(code)) return "retry";
  if (CHANGE_QUERY.has(code)) return "change-query";
  return "none";
}
