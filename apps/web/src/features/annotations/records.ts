import type {
  CandidateAnnotation, FrameSummary, ImageSelection, SequenceContext, SequenceManifest,
} from "../explorer/interfaces.ts";
import { sharedSearchQuery, type CoordinateValues } from "../explorer/coordinates.ts";
import { rasterToSky, SKY_METHOD } from "./sky.ts";

export const MAX_CANDIDATES = 200;
export const MAX_NOTE_LENGTH = 500;

export interface CandidateStore {
  candidates: CandidateAnnotation[];
  /** Sequence snapshots keyed by sequence ID, kept while a candidate refers to them. */
  sequences: Record<string, SequenceContext>;
  /** Stored entries this version could not read, written back unchanged. */
  unreadable: unknown[];
}

export function emptyStore(): CandidateStore {
  return { candidates: [], sequences: {}, unreadable: [] };
}

const LIVE_QUERY_NOTE = "Repeats the search that produced this sequence. A later search can return different observations as archive results and exposure selection change.";
const CACHED_QUERY_NOTE = "Runs a new live search of the same field. It can return different observations from this cached sequence, whose frames are listed here.";

function frameSummary(frame: SequenceManifest["frames"][number]): FrameSummary {
  return {
    frame_id: frame.frame_id,
    observation_id: frame.observation_id ?? null,
    observed_start_utc: frame.observed_start_utc ?? null,
    observed_end_utc: frame.observed_end_utc ?? null,
    release: frame.release ?? null,
    detector: frame.detector ?? null,
    wavelength_um: frame.wavelength_um ?? null,
    bandwidth_um: frame.bandwidth_um ?? null,
    masked_fraction: frame.masked_fraction ?? 0,
    warning_fraction: frame.warning_fraction ?? 0,
    source_fits_url: frame.source_fits_url ?? null,
    warnings: (frame.warnings ?? []).map(({ code, message }) => ({ code, message })),
  };
}

/**
 * Snapshot what a candidate needs after the live sequence is gone. Values come
 * from the manifest on screen; nothing is re-derived or filled in.
 * `query` is the search that produced a live sequence; `pageBase` is the
 * site address the reproducible link starts from.
 */
export function sequenceContext(
  manifest: SequenceManifest,
  query: CoordinateValues | null,
  pageBase: string | null,
  recordedAt: string,
): SequenceContext {
  let searchQuery: SequenceContext["query"] = null;
  if (manifest.data_mode !== "synthetic") {
    const values = query ?? {
      ra_deg: manifest.target.ra_deg, dec_deg: manifest.target.dec_deg, fov_arcmin: manifest.requested_fov_arcmin,
    };
    searchQuery = {
      ra_deg: values.ra_deg, dec_deg: values.dec_deg, fov_arcmin: values.fov_arcmin, coordinate_frame: "ICRS",
      link: pageBase ? `${pageBase}${sharedSearchQuery(values)}` : null,
      note: manifest.data_mode === "live" ? LIVE_QUERY_NOTE : CACHED_QUERY_NOTE,
    };
  }
  return {
    sequence_id: manifest.sequence_id,
    data_mode: manifest.data_mode,
    title: manifest.title,
    disclosure: manifest.disclosure,
    target: { ...manifest.target },
    requested_fov_arcmin: manifest.requested_fov_arcmin,
    grid: { ...manifest.grid, wcs_header: manifest.grid.wcs_header ? { ...manifest.grid.wcs_header } : manifest.grid.wcs_header },
    display: { ...manifest.display },
    processing: { ...(manifest.processing ?? {}) },
    warnings: (manifest.warnings ?? []).map(({ code, message }) => ({ code, message })),
    frames: manifest.frames.map(frameSummary),
    query: searchQuery,
    recorded_at_utc: recordedAt,
  };
}

export function createCandidate(
  selection: ImageSelection,
  note: string,
  context: SequenceContext | null,
  id: string,
  now: string,
): CandidateAnnotation {
  const conversion = context
    ? rasterToSky(context.grid, selection.x, selection.y)
    : { ok: false as const, reason: "The sequence details were not available when this mark was made." };
  return {
    id,
    origin: "human",
    selection: { ...selection, comparison: selection.comparison ? { ...selection.comparison } : null },
    sky: conversion.ok
      ? { ra_deg: conversion.ra_deg, dec_deg: conversion.dec_deg, frame: "ICRS", unit: "deg", method: SKY_METHOD }
      : null,
    skyUnavailableReason: conversion.ok ? null : conversion.reason,
    note: note.trim().slice(0, MAX_NOTE_LENGTH),
    createdAt: now,
    updatedAt: now,
  };
}

export function addCandidate(store: CandidateStore, candidate: CandidateAnnotation, context: SequenceContext | null): CandidateStore {
  if (store.candidates.length >= MAX_CANDIDATES || !candidate.note) return store;
  const sequenceId = candidate.selection.sequenceId;
  const sequences = context && !store.sequences[sequenceId]
    ? { ...store.sequences, [sequenceId]: context }
    : store.sequences;
  return { ...store, candidates: [...store.candidates, candidate], sequences };
}

/** Changes only the note and edit time of the one matching record. */
export function updateCandidateNote(store: CandidateStore, id: string, note: string, now: string): CandidateStore {
  const trimmed = note.trim().slice(0, MAX_NOTE_LENGTH);
  if (!trimmed) return store;
  let changed = false;
  const candidates = store.candidates.map(item => {
    if (item.id !== id || item.note === trimmed) return item;
    changed = true;
    return { ...item, note: trimmed, updatedAt: now };
  });
  return changed ? { ...store, candidates } : store;
}

/** Removes one record, and its sequence snapshot when nothing else refers to it. */
export function removeCandidate(store: CandidateStore, id: string): CandidateStore {
  const removed = store.candidates.find(item => item.id === id);
  if (!removed) return store;
  const candidates = store.candidates.filter(item => item.id !== id);
  const sequenceId = removed.selection.sequenceId;
  if (candidates.some(item => item.selection.sequenceId === sequenceId)) return { ...store, candidates };
  const sequences = { ...store.sequences };
  delete sequences[sequenceId];
  return { ...store, candidates, sequences };
}
