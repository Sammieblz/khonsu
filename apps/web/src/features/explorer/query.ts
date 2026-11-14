import type { SequenceRequest } from "./interfaces";
import { parseCoordinates } from "./coordinates.ts";

export interface ParsedQuery {
  request: SequenceRequest | null;
  notices: string[];
  syntheticRequested: boolean;
  exampleId: string | null;
}

export interface SearchFormValues {
  ra: string;
  dec: string;
  fov: string;
  maxFrames: string;
  detector: string;
  wavelengthMin: string;
  wavelengthMax: string;
  start: string;
  end: string;
}

export function formValuesForRequest(request: SequenceRequest | null): SearchFormValues {
  const inputDate = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0, 16) : "";
  return {
    ra: request ? String(request.ra_deg) : "", dec: request ? String(request.dec_deg) : "",
    fov: String(request?.fov_arcmin ?? 6), maxFrames: String(request?.max_frames ?? 24),
    detector: request?.detector == null ? "" : String(request.detector),
    wavelengthMin: request?.wavelength_min_um == null ? "" : String(request.wavelength_min_um),
    wavelengthMax: request?.wavelength_max_um == null ? "" : String(request.wavelength_max_um),
    start: inputDate(request?.start_utc), end: inputDate(request?.end_utc),
  };
}

export function validateSearchForm(values: SearchFormValues): { ok: true; request: SequenceRequest } | { ok: false; message: string } {
  const coordinates = parseCoordinates(values.ra, values.dec, values.fov);
  if (!coordinates.ok) return coordinates;
  const maxFrames = boundedNumber(values.maxFrames, 2, 96, true);
  if (maxFrames === null) return { ok: false, message: "Choose a whole-number frame limit from 2 to 96." };
  const request: SequenceRequest = { ...coordinates.value, coordinate_frame: "ICRS", max_frames: maxFrames };
  if (values.detector) {
    const detector = boundedNumber(values.detector, 1, 6, true);
    if (detector === null) return { ok: false, message: "Choose a detector from 1 to 6, or all detectors." };
    request.detector = detector;
  }
  for (const [value, key] of [[values.wavelengthMin, "wavelength_min_um"], [values.wavelengthMax, "wavelength_max_um"]] as const) {
    if (!value.trim()) continue;
    const wavelength = boundedNumber(value.trim(), .75, 5);
    if (wavelength === null) return { ok: false, message: "Wavelength filters must be from 0.75 to 5.0 micrometers." };
    request[key] = wavelength;
  }
  if (request.wavelength_min_um != null && request.wavelength_max_um != null && request.wavelength_min_um > request.wavelength_max_um) return { ok: false, message: "The minimum wavelength must not exceed the maximum." };
  for (const [value, key] of [[values.start, "start_utc"], [values.end, "end_utc"]] as const) {
    if (!value) continue;
    const date = explicitUtc(`${value}Z`);
    if (!date) return { ok: false, message: "Choose a valid UTC date and time." };
    request[key] = date;
  }
  if (request.start_utc && request.end_utc && Date.parse(request.start_utc) >= Date.parse(request.end_utc)) return { ok: false, message: "The start date must be earlier than the end date." };
  return { ok: true, request };
}

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const identifier = /^[a-zA-Z0-9_-]{1,80}$/;

function boundedNumber(value: string | null, minimum: number, maximum: number, integer = false): number | null {
  if (!value || !decimal.test(value) || value.length > 80) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) return null;
  return parsed;
}

export function explicitUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function parseQueryParameters(search: string): ParsedQuery {
  const params = new URLSearchParams(search);
  const notices: string[] = [];
  const result: ParsedQuery = { request: null, notices, syntheticRequested: params.get("mode") === "synthetic", exampleId: null };
  const example = params.get("example");
  if (example && identifier.test(example)) result.exampleId = example;
  else if (example) notices.push("The example identifier in this link is invalid.");
  if (!params.has("ra") && !params.has("dec")) return result;
  if ((params.has("source") && params.get("source") !== "spherex") || (params.has("units") && params.get("units") !== "deg") || (params.has("frame") && params.get("frame") !== "ICRS")) {
    notices.push("This link uses unsupported coordinates or a different source. Khonsu accepts SPHEREx positions in ICRS decimal degrees.");
    return result;
  }
  let fov = boundedNumber(params.get("fov"), .5, 60);
  if (fov === null) {
    fov = 6;
    if (params.has("fov")) notices.push("The invalid field size was reset to 6 arcminutes.");
  }
  const coordinates = parseCoordinates(params.get("ra") ?? "", params.get("dec") ?? "", String(fov));
  if (!coordinates.ok) { notices.push(coordinates.message); return result; }
  const request: SequenceRequest = { ...coordinates.value, coordinate_frame: "ICRS", max_frames: 24 };
  if (params.has("max_frames")) {
    const maxFrames = boundedNumber(params.get("max_frames"), 2, 96, true);
    if (maxFrames === null) notices.push("The invalid frame limit was reset to 24.");
    else request.max_frames = maxFrames;
  }
  if (params.has("detector")) {
    const detector = boundedNumber(params.get("detector"), 1, 6, true);
    if (detector === null) notices.push("The invalid detector filter was removed.");
    else request.detector = detector;
  }
  for (const [key, field] of [["wmin", "wavelength_min_um"], ["wmax", "wavelength_max_um"]] as const) {
    if (!params.has(key)) continue;
    const wavelength = boundedNumber(params.get(key), .75, 5);
    if (wavelength === null) notices.push("An invalid wavelength filter was removed.");
    else request[field] = wavelength;
  }
  if (request.wavelength_min_um != null && request.wavelength_max_um != null && request.wavelength_min_um > request.wavelength_max_um) {
    delete request.wavelength_min_um;
    delete request.wavelength_max_um;
    notices.push("The reversed wavelength range was removed.");
  }
  for (const [key, field] of [["start", "start_utc"], ["end", "end_utc"]] as const) {
    const raw = params.get(key);
    if (!raw) continue;
    const date = explicitUtc(raw);
    if (!date) notices.push("An invalid date filter was removed. Shared dates need an explicit timezone.");
    else request[field] = date;
  }
  if (request.start_utc && request.end_utc && Date.parse(request.start_utc) >= Date.parse(request.end_utc)) {
    delete request.start_utc;
    delete request.end_utc;
    notices.push("The reversed date range was removed.");
  }
  result.request = request;
  return result;
}

export function serializeQuery(request: SequenceRequest): URLSearchParams {
  const params = new URLSearchParams({ source: "spherex", units: "deg", frame: "ICRS", ra: String(request.ra_deg), dec: String(request.dec_deg), fov: String(request.fov_arcmin ?? 6), max_frames: String(request.max_frames ?? 24) });
  for (const [key, value] of [["detector", request.detector], ["wmin", request.wavelength_min_um], ["wmax", request.wavelength_max_um], ["start", request.start_utc], ["end", request.end_utc]] as const) {
    if (value != null && value !== "") params.set(key, String(value));
  }
  return params;
}

export function queryUrl(baseUrl: string, request: SequenceRequest | null, options: { synthetic?: boolean; exampleId?: string } = {}): string {
  const url = new URL(baseUrl);
  url.search = request ? serializeQuery(request).toString() : "";
  if (options.synthetic) url.searchParams.set("mode", "synthetic");
  if (options.exampleId && identifier.test(options.exampleId)) url.searchParams.set("example", options.exampleId);
  url.hash = "explorer";
  return url.toString();
}
