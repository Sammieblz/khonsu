import type { CandidateAnnotation, ImageSelection, SequenceContext } from "../explorer/interfaces.ts";
import { emptyStore, MAX_CANDIDATES, MAX_NOTE_LENGTH, type CandidateStore } from "./records.ts";

export const STORE_KEY = "khonsu.candidates.v2";
export const LEGACY_KEY = "khonsu.annotations.v1";
export const STORE_SCHEMA = "khonsu-candidates";
export const STORE_VERSION = 2;
/** Browser storage is a few megabytes; stay well inside it. */
export const MAX_STORE_CHARS = 2_000_000;

export type StoreLoad =
  | { ok: true; store: CandidateStore; migrated: boolean }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function isPixel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 4096;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

function isSelection(value: unknown, legacy: boolean): value is ImageSelection {
  if (!isRecord(value)) return false;
  const base = isId(value.sequenceId) && isId(value.frameId) && isPixel(value.x) && isPixel(value.y)
    && value.coordinateSpace === "natural-raster" && value.pixelOrigin === "top-left";
  if (!base || legacy) return base;
  const comparison = value.comparison;
  const comparisonOk = comparison === null || (isRecord(comparison) && isId(comparison.aFrameId) && isId(comparison.bFrameId));
  const quality=value.pixelQuality;
  const qualityOk=quality===undefined || (quality==='unknown'&&value.pixelHasData===null)
    || (quality==='strict-valid'&&value.pixelHasData===true)
    || ((quality==='warning-only'||quality==='unavailable')&&value.pixelHasData===false);
  return comparisonOk && qualityOk && (value.pixelHasData === null || typeof value.pixelHasData === "boolean");
}

function isCandidate(value: unknown): value is CandidateAnnotation {
  if (!isRecord(value)) return false;
  const sky = value.sky;
  const skyOk = sky === null || (isRecord(sky)
    && typeof sky.ra_deg === "number" && sky.ra_deg >= 0 && sky.ra_deg < 360
    && typeof sky.dec_deg === "number" && sky.dec_deg >= -90 && sky.dec_deg <= 90
    && sky.frame === "ICRS" && sky.unit === "deg" && typeof sky.method === "string");
  return isId(value.id) && value.origin === "human" && isSelection(value.selection, false) && skyOk
    && (value.skyUnavailableReason === null || typeof value.skyUnavailableReason === "string")
    && typeof value.note === "string" && value.note.length > 0 && value.note.length <= MAX_NOTE_LENGTH
    && isTime(value.createdAt) && isTime(value.updatedAt);
}

function isContext(value: unknown, key: string): value is SequenceContext {
  if (!isRecord(value) || value.sequence_id !== key) return false;
  const grid = value.grid, target = value.target;
  return ["synthetic", "cached-real", "live"].includes(value.data_mode as string)
    && Array.isArray(value.frames) && value.frames.length <= 96 && value.frames.every(frame => isRecord(frame) && isId(frame.frame_id))
    && isRecord(grid) && isPixel(grid.width_px) && isPixel(grid.height_px)
    && isRecord(target) && typeof target.ra_deg === "number" && typeof target.dec_deg === "number"
    && Array.isArray(value.warnings) && isRecord(value.processing) && isRecord(value.display);
}

/** Version 1 records only held a pixel and a note. */
function migrateLegacy(value: unknown): CandidateAnnotation | null {
  if (!isRecord(value) || !isId(value.id) || !isSelection(value.selection, true) || !isTime(value.createdAt)
    || typeof value.note !== "string" || !value.note || value.note.length > MAX_NOTE_LENGTH) return null;
  const selection = value.selection;
  return {
    id: value.id,
    origin: "human",
    selection: {
      sequenceId: selection.sequenceId, frameId: selection.frameId, x: selection.x, y: selection.y,
      coordinateSpace: "natural-raster", pixelOrigin: "top-left", comparison: null, pixelHasData: null,
    },
    sky: null,
    skyUnavailableReason: "Saved by an earlier version that did not record sky coordinates or observation details.",
    note: value.note,
    createdAt: value.createdAt,
    updatedAt: value.createdAt,
  };
}

/**
 * Read stored candidates. Entries this version cannot read are kept in
 * `unreadable` and written back unchanged, so nothing is silently discarded.
 * A store that is not readable at all is reported, never overwritten here.
 */
export function loadStore(raw: string | null, legacyRaw: string | null): StoreLoad {
  if (raw === null) {
    if (legacyRaw === null) return { ok: true, store: emptyStore(), migrated: false };
    let legacy: unknown;
    try { legacy = JSON.parse(legacyRaw); } catch { return { ok: true, store: emptyStore(), migrated: false }; }
    if (!Array.isArray(legacy)) return { ok: true, store: emptyStore(), migrated: false };
    const store = emptyStore();
    for (const item of legacy) {
      const migrated = migrateLegacy(item);
      if (migrated && store.candidates.length < MAX_CANDIDATES) store.candidates.push(migrated);
      else store.unreadable.push(item);
    }
    return { ok: true, store, migrated: true };
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { ok: false, reason: "The saved candidate data in this browser is damaged." }; }
  if (!isRecord(value) || value.schema !== STORE_SCHEMA) {
    return { ok: false, reason: "The saved candidate data in this browser is not in a format Khonsu recognises." };
  }
  if (value.version !== STORE_VERSION) {
    return { ok: false, reason: `The saved candidates use format version ${String(value.version)}; this page reads version ${STORE_VERSION}.` };
  }
  if (!Array.isArray(value.candidates) || !isRecord(value.sequences)) {
    return { ok: false, reason: "The saved candidate data in this browser is incomplete." };
  }
  const store = emptyStore();
  if (Array.isArray(value.unreadable)) store.unreadable.push(...value.unreadable);
  for (const item of value.candidates) {
    if (isCandidate(item) && store.candidates.length < MAX_CANDIDATES) store.candidates.push(item);
    else store.unreadable.push(item);
  }
  for (const [key, context] of Object.entries(value.sequences)) {
    if (isContext(context, key)) store.sequences[key] = context;
    else store.unreadable.push({ sequence_snapshot: key, value: context });
  }
  return { ok: true, store, migrated: false };
}

export function serializeStore(store: CandidateStore): string {
  return JSON.stringify({
    schema: STORE_SCHEMA, version: STORE_VERSION,
    candidates: store.candidates, sequences: store.sequences,
    ...(store.unreadable.length ? { unreadable: store.unreadable } : {}),
  });
}
