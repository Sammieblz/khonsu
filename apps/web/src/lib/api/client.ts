import type { PresetTarget, SequenceJob, SequenceManifest, SequenceRequest } from "../../features/explorer/interfaces";

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

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function contractError(message = "The observation service returned an incompatible response."): never {
  throw new ApiClientError(message, 502, "INVALID_SERVICE_RESPONSE");
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function id(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value); }

export function controlledApiUrl(reference: string): string {
  const base = new URL(`${apiBaseUrl()}/`);
  const url = new URL(reference, base);
  if (url.origin !== base.origin || !/^\/v1\//.test(url.pathname) || url.username || url.password || url.hash) {
    throw new ApiClientError("The service returned an unexpected asset or manifest address.", 502, "INVALID_ASSET_ORIGIN");
  }
  return url.toString();
}

export function resolveAssetUrl(imageUrl: string): string { return controlledApiUrl(imageUrl); }

export function safeSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; }
  catch { return null; }
}

async function jsonRequest(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<unknown> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 30_000);
  const stop = () => timeout.abort(signal?.reason);
  if (signal?.aborted) stop();
  signal?.addEventListener("abort", stop, { once: true });
  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(controlledApiUrl(path), { ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers }, cache: "no-store", signal: timeout.signal });
    payload = await response.json().catch(() => null);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError(timeout.signal.aborted ? "The observation service took too long to respond. You can retry this search." : "The observation service is unavailable. Check that the backend is running and reachable.", 0, timeout.signal.aborted ? "SERVICE_TIMEOUT" : "SERVICE_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
  if (!response.ok) {
    const body = record(payload);
    const detail = record(body?.error) ?? record(body?.detail) ?? body;
    const message = text(detail?.message) ? detail.message : "The service could not complete this request.";
    const code = text(detail?.code) ? detail.code : response.status === 404 ? "SEQUENCE_EXPIRED" : "REQUEST_FAILED";
    const details = Array.isArray(detail?.details) ? detail.details.filter((item): item is string => typeof item === "string") : [];
    throw new ApiClientError(message, response.status, code, details);
  }
  return payload;
}

export function decodeManifest(payload: unknown): SequenceManifest {
  const value = record(payload);
  const grid = record(value?.grid);
  const target = record(value?.target);
  const display = record(value?.display);
  if (!value || !id(value.sequence_id) || !text(value.title) || !text(value.disclosure) || !["live", "cached-real", "synthetic"].includes(String(value.data_mode)) || !grid || !target || !display) contractError();
  if (!finite(grid.width_px) || !Number.isInteger(grid.width_px) || grid.width_px < 1 || grid.width_px > 4096 || !finite(grid.height_px) || !Number.isInteger(grid.height_px) || grid.height_px < 1 || grid.height_px > 4096) contractError("The service returned unsupported image dimensions.");
  if (!finite(target.ra_deg) || target.ra_deg < 0 || target.ra_deg >= 360 || !finite(target.dec_deg) || Math.abs(target.dec_deg) > 90 || target.coordinate_frame !== "ICRS") contractError("The service returned an invalid sky coordinate frame.");
  if (!finite(display.vmin) || !finite(display.vmax) || display.vmin >= display.vmax || !["linear", "asinh"].includes(String(display.stretch))) contractError("The service returned invalid image display settings.");
  if (!Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > 96) contractError("At least two usable frames are required for a sequence.");
  const identifiers = new Set<string>();
  let previousTime = -Infinity;
  for (const item of value.frames) {
    const frame = record(item);
    if (!frame || !id(frame.frame_id) || identifiers.has(frame.frame_id) || !text(frame.image_url) || !text(frame.label)) contractError("The sequence contains an invalid or duplicate frame.");
    identifiers.add(frame.frame_id);
    controlledApiUrl(frame.image_url);
    if (frame.masked_fraction != null && (!finite(frame.masked_fraction) || frame.masked_fraction < 0 || frame.masked_fraction > 1)) contractError();
    if (value.data_mode !== "synthetic") {
      if (!text(frame.observed_start_utc) || !Number.isFinite(Date.parse(frame.observed_start_utc)) || !text(frame.observed_end_utc) || !Number.isFinite(Date.parse(frame.observed_end_utc)) || !finite(frame.wavelength_um) || !finite(frame.bandwidth_um) || !finite(frame.detector) || !text(frame.observation_id) || !["DR1", "QR3"].includes(String(frame.release)) || !safeSourceUrl(typeof frame.source_fits_url === "string" ? frame.source_fits_url : null)) contractError("Real observations need their original dates, wavelengths, release, and source references.");
      const observedTime = Date.parse(frame.observed_start_utc);
      if (observedTime < previousTime || Date.parse(frame.observed_end_utc) < observedTime) contractError("The observation times are not in chronological order.");
      previousTime = observedTime;
    }
  }
  return payload as SequenceManifest;
}

function decodeJob(payload: unknown): SequenceJob {
  const value = record(payload);
  if (!value || !id(value.sequence_id) || !["queued", "retrieving", "processing", "ready", "failed", "cancelled", "expired"].includes(String(value.status))) contractError("The service returned an unknown processing state.");
  if (value.manifest_url != null && typeof value.manifest_url === "string") controlledApiUrl(value.manifest_url);
  return payload as SequenceJob;
}

export async function getPresets(signal?: AbortSignal): Promise<PresetTarget[]> {
  const payload = await jsonRequest("/v1/presets", {}, signal);
  if (!Array.isArray(payload)) contractError();
  for (const item of payload) {
    const preset = record(item);
    if (!preset || !id(preset.preset_id) || !text(preset.label) || !text(preset.coordinate_note)) contractError();
    if (preset.ra_deg != null && (!finite(preset.ra_deg) || preset.ra_deg < 0 || preset.ra_deg >= 360)) contractError();
    if (preset.dec_deg != null && (!finite(preset.dec_deg) || Math.abs(preset.dec_deg) > 90)) contractError();
  }
  return payload as PresetTarget[];
}

export async function getExamples(signal?: AbortSignal): Promise<SequenceManifest[]> {
  const payload = await jsonRequest("/v1/examples", {}, signal);
  if (!Array.isArray(payload)) contractError();
  const examples = payload.map(decodeManifest);
  if (examples.some(example => example.data_mode !== "cached-real")) contractError("The real-example catalog contained an unexpected data mode.");
  return examples;
}

export async function requestSequence(request: SequenceRequest, signal?: AbortSignal): Promise<SequenceJob> {
  return decodeJob(await jsonRequest("/v1/sequences", { method: "POST", body: JSON.stringify(request) }, signal));
}
export async function getSequenceStatus(sequenceId: string, signal?: AbortSignal): Promise<SequenceJob> {
  if (!id(sequenceId)) contractError();
  return decodeJob(await jsonRequest(`/v1/sequences/${sequenceId}`, {}, signal));
}
export async function cancelSequence(sequenceId: string, signal?: AbortSignal): Promise<SequenceJob> {
  if (!id(sequenceId)) contractError();
  return decodeJob(await jsonRequest(`/v1/sequences/${sequenceId}/cancel`, { method: "POST" }, signal));
}
export async function getManifest(sequenceId: string, manifestUrl?: string | null, signal?: AbortSignal): Promise<SequenceManifest> {
  if (!id(sequenceId)) contractError();
  return decodeManifest(await jsonRequest(manifestUrl ?? `/v1/sequences/${sequenceId}/manifest`, {}, signal));
}
export async function getSyntheticDemo(signal?: AbortSignal): Promise<SequenceManifest> {
  const manifest = decodeManifest(await jsonRequest("/v1/demo/manifest", {}, signal));
  if (manifest.data_mode !== "synthetic") contractError("The development example returned an unexpected data mode.");
  return manifest;
}

export function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Request cancelled", "AbortError")); return; }
    const cancel = () => { clearTimeout(timer); reject(new DOMException("Request cancelled", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export async function pollSequence(initial: SequenceJob, onProgress: (job: SequenceJob) => void, signal?: AbortSignal, options: { timeoutMs?: number; intervalMs?: number } = {}): Promise<SequenceJob> {
  const deadline = Date.now() + (options.timeoutMs ?? 360_000);
  let current = initial;
  let interval = options.intervalMs ?? 800;
  while (true) {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    onProgress(current);
    if (["ready", "failed", "cancelled", "expired"].includes(current.status)) return current;
    if (Date.now() >= deadline) throw new ApiClientError("Processing has taken longer than expected. Cancel or retry the query; it may have expired after a backend restart.", 408, "POLL_TIMEOUT");
    await abortableDelay(interval, signal);
    current = await getSequenceStatus(current.sequence_id, signal);
    interval = Math.min(2500, interval * 1.2);
  }
}
