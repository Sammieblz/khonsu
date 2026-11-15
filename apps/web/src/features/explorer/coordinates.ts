import { MIN_FOV_ARCMIN, MAX_FOV_ARCMIN } from '../../lib/api/generated-limits.ts';
export { MIN_FOV_ARCMIN, MAX_FOV_ARCMIN } from '../../lib/api/generated-limits.ts';

export interface CoordinateValues {
  ra_deg: number;
  dec_deg: number;
  fov_arcmin: number;
}

export type CoordinateResult =
  | { ok: true; value: CoordinateValues }
  | { ok: false; message: string };

export function parseCoordinates(ra: string, dec: string, fov: string): CoordinateResult {
  if (!ra.trim() || !dec.trim() || !fov.trim()) {
    return { ok: false, message: "Enter both sky coordinates and a field size." };
  }
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (![ra, dec, fov].every(value => decimal.test(value.trim()))) {
    return { ok: false, message: "Use decimal numbers for coordinates and field size." };
  }
  const raValue = Number(ra);
  const decValue = Number(dec);
  const fovValue = Number(fov);
  if (![raValue, decValue, fovValue].every(Number.isFinite)) {
    return { ok: false, message: "Use finite decimal numbers for coordinates and field size." };
  }
  if (raValue < 0 || raValue >= 360) {
    return { ok: false, message: "Right Ascension must be at least 0 and less than 360 degrees." };
  }
  if (decValue < -90 || decValue > 90) {
    return { ok: false, message: "Declination must be between -90 and +90 degrees." };
  }
  if (fovValue < MIN_FOV_ARCMIN || fovValue > MAX_FOV_ARCMIN) {
    return { ok: false, message: `Choose a field from ${MIN_FOV_ARCMIN} to ${MAX_FOV_ARCMIN} arcminutes.` };
  }
  return { ok: true, value: { ra_deg: raValue, dec_deg: decValue, fov_arcmin: fovValue } };
}

// Wide cutouts use fewer exposures within the same download/output budgets.
export function requestedFrames(fovArcmin: number): number {
  return fovArcmin > 60 ? 4 : fovArcmin > 30 ? 8 : 16;
}

// Shareable search links. Parameter names carry their units. A link restores
// the form only; the visitor still starts the search, and the frame count stays
// the form's fixed bound, so a link cannot start or enlarge an archive download.
export const DEFAULT_FOV_ARCMIN = 6;
const MAX_QUERY_LENGTH = 2048;
const MAX_VALUE_LENGTH = 32;
const OBSERVATION_ID = /^[A-Za-z0-9_.-]{1,64}$/;

export interface SharedSearch {
  values: CoordinateValues;
  /** IRSA observation to select once the sequence loads, if it is present. */
  observationId: string | null;
  /** Optional values that were invalid and replaced by defaults. */
  notes: string[];
}

export type SharedSearchResult =
  | { kind: "none" }
  | { kind: "ok"; search: SharedSearch }
  | { kind: "invalid"; message: string };

/**
 * Read a search from a page query string such as `location.search`. Required
 * coordinates are never corrected: an out-of-range or malformed position is
 * rejected rather than moved. Unknown parameters are ignored.
 */
export function readSharedSearch(query: string): SharedSearchResult {
  if (query.length > MAX_QUERY_LENGTH) {
    return { kind: "invalid", message: "The shared link is too long to be a Khonsu search, so nothing was restored." };
  }
  const params = new URLSearchParams(query);
  const value = (key: string) => params.get(key)?.trim() ?? null;
  const ra = value("ra_deg");
  const dec = value("dec_deg");
  if (ra === null && dec === null) return { kind: "none" };
  if (!ra || !dec) {
    return { kind: "invalid", message: "The shared link is missing a coordinate, so nothing was restored." };
  }
  const frame = value("frame");
  if (frame !== null && frame.toUpperCase() !== "ICRS") {
    return { kind: "invalid", message: "The shared link uses a coordinate frame other than ICRS, so nothing was restored." };
  }
  const notes: string[] = [];
  let fov = value("fov_arcmin");
  if (fov !== null && (fov.length > MAX_VALUE_LENGTH || !parseCoordinates("0", "0", fov).ok)) {
    notes.push(`The link's field of view was not valid, so the default ${DEFAULT_FOV_ARCMIN}′ field is used.`);
    fov = null;
  }
  if (ra.length > MAX_VALUE_LENGTH || dec.length > MAX_VALUE_LENGTH) {
    return { kind: "invalid", message: "The shared link's coordinates are not valid decimal degrees, so nothing was restored." };
  }
  const parsed = parseCoordinates(ra, dec, fov ?? String(DEFAULT_FOV_ARCMIN));
  if (!parsed.ok) {
    return { kind: "invalid", message: `The shared link's coordinates are not valid. ${parsed.message} Nothing was restored.` };
  }
  const observation = value("obs");
  return { kind: "ok", search: { values: parsed.value, observationId: observation && OBSERVATION_ID.test(observation) ? observation : null, notes } };
}

/** The query string that reproduces a search, optionally with a selected observation. */
export function sharedSearchQuery(values: CoordinateValues, observationId?: string | null): string {
  const params = new URLSearchParams({
    ra_deg: String(values.ra_deg), dec_deg: String(values.dec_deg),
    fov_arcmin: String(values.fov_arcmin), frame: "ICRS",
  });
  if (observationId && OBSERVATION_ID.test(observationId)) params.set("obs", observationId);
  return `?${params.toString()}`;
}
