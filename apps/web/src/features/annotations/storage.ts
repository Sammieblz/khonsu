import type { CandidateAnnotation } from "../explorer/interfaces";

export const ANNOTATIONS_KEY = "khonsu.annotations.v2";
export const LEGACY_ANNOTATIONS_KEY = "khonsu.annotations.v1";
export const MAX_ANNOTATIONS = 100;
export const MAX_STORAGE_CHARACTERS = 4_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

function validEvidence(value: unknown, selection: Record<string, unknown>): boolean {
  if (!isRecord(value) || !isRecord(value.manifest)) return false;
  const manifest = value.manifest;
  const sky = value.skyPosition;
  if (!Array.isArray(manifest.frames) || !Array.isArray(value.comparisonFrameIds)) return false;
  const frames: unknown[] = manifest.frames;
  const comparisonIds: unknown[] = value.comparisonFrameIds;
  if (value.schemaVersion !== 1 || value.origin !== "human" || value.reviewStatus !== "unreviewed"
    || typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt))
    || value.frameId !== selection.frameId || manifest.sequence_id !== selection.sequenceId
    || !["synthetic", "cached-real", "live"].includes(String(value.dataMode))
    || value.dataMode !== manifest.data_mode
    || !isRecord(manifest.grid) || !isRecord(manifest.display) || !isRecord(manifest.target)
    || typeof manifest.disclosure !== "string"
    || frames.length < 2 || frames.length > 96
    || !frames.every(frame => isRecord(frame) && identifier(frame.frame_id))
    || !frames.some(frame => isRecord(frame) && frame.frame_id === selection.frameId)
    || comparisonIds.length > 2
    || !comparisonIds.every(id => identifier(id) && frames.some(frame => isRecord(frame) && frame.frame_id === id))
    || !Number.isInteger(manifest.grid.width_px) || !Number.isInteger(manifest.grid.height_px)
    || Number(manifest.grid.width_px) < 1 || Number(manifest.grid.width_px) > 4096
    || Number(manifest.grid.height_px) < 1 || Number(manifest.grid.height_px) > 4096
    || Number(selection.x) >= Number(manifest.grid.width_px) || Number(selection.y) >= Number(manifest.grid.height_px)) return false;
  if (sky !== null && (!isRecord(sky) || sky.coordinateFrame !== "ICRS"
    || typeof sky.raDeg !== "number" || !Number.isFinite(sky.raDeg) || sky.raDeg < 0 || sky.raDeg >= 360
    || typeof sky.decDeg !== "number" || !Number.isFinite(sky.decDeg) || sky.decDeg < -90 || sky.decDeg > 90)) return false;
  if (value.query !== null && (!isRecord(value.query)
    || typeof value.query.ra_deg !== "number" || !Number.isFinite(value.query.ra_deg) || value.query.ra_deg < 0 || value.query.ra_deg >= 360
    || typeof value.query.dec_deg !== "number" || !Number.isFinite(value.query.dec_deg) || value.query.dec_deg < -90 || value.query.dec_deg > 90
    || typeof value.query.fov_arcmin !== "number" || !Number.isFinite(value.query.fov_arcmin) || value.query.fov_arcmin < .5 || value.query.fov_arcmin > 60)) return false;
  if (value.dataMode !== "synthetic") {
    if (!isRecord(manifest.grid.wcs_header) || !["identity", "flip-y"].includes(String(manifest.grid.raster_to_wcs))) return false;
    if (!frames.every(frame => isRecord(frame)
      && typeof frame.observed_start_utc === "string" && Number.isFinite(Date.parse(frame.observed_start_utc))
      && typeof frame.observed_end_utc === "string" && Number.isFinite(Date.parse(frame.observed_end_utc))
      && typeof frame.source_fits_url === "string" && /^https:\/\//.test(frame.source_fits_url)
      && typeof frame.wavelength_um === "number" && Number.isFinite(frame.wavelength_um)
      && typeof frame.bandwidth_um === "number" && frame.bandwidth_um > 0
      && typeof frame.observation_id === "string"
      && (frame.release === "DR1" || frame.release === "QR3"))) return false;
  }
  return true;
}

export function parseStoredAnnotations(raw: string | null): CandidateAnnotation[] {
  if (!raw || raw.length > MAX_STORAGE_CHARACTERS) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  const entries = Array.isArray(value) ? value
    : isRecord(value) && value.schemaVersion === 2 && Array.isArray(value.annotations) ? value.annotations : null;
  if (!entries) return [];
  const seen = new Set<string>();
  return entries.filter((item): item is CandidateAnnotation => {
    if (!isRecord(item) || !isRecord(item.selection)) return false;
    const selection = item.selection;
    const valid = identifier(item.id) && !seen.has(item.id)
      && typeof item.note === "string" && item.note.trim().length > 0 && item.note.length <= 500
      && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt))
      && identifier(selection.sequenceId) && identifier(selection.frameId)
      && typeof selection.x === "number" && Number.isInteger(selection.x) && selection.x >= 0 && selection.x < 4096
      && typeof selection.y === "number" && Number.isInteger(selection.y) && selection.y >= 0 && selection.y < 4096
      && selection.coordinateSpace === "natural-raster" && selection.pixelOrigin === "top-left"
      && (item.evidence === undefined || validEvidence(item.evidence, selection));
    if (valid) seen.add(item.id as string);
    return valid;
  });
}

export function canSafelyPersistStoredAnnotations(raw: string | null, restored: CandidateAnnotation[]): boolean {
  if (!raw) return true;
  if (raw.length > MAX_STORAGE_CHARACTERS) return false;
  try {
    const value: unknown = JSON.parse(raw);
    const entries = Array.isArray(value) ? value
      : isRecord(value) && value.schemaVersion === 2 && Array.isArray(value.annotations) ? value.annotations : null;
    return entries !== null && entries.length === restored.length;
  } catch { return false; }
}

export function serializeAnnotations(annotations: CandidateAnnotation[]): string {
  const raw = JSON.stringify({ schemaVersion: 2, annotations });
  if (raw.length > MAX_STORAGE_CHARACTERS) throw new Error("Candidate storage is full. Export notes before adding more.");
  return raw;
}
