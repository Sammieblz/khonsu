import type { CandidateAnnotation, FrameSummary, SequenceContext } from "../explorer/interfaces.ts";

// A versioned, self-contained record of a person's candidate marks. Every
// observation value is copied from the sequence snapshot taken when the mark
// was made, which in turn is a copy of the manifest on screen.

export const EVIDENCE_FORMAT = "khonsu-evidence";
export const EVIDENCE_VERSION = "1.0";

export const EVIDENCE_NOTICE = "Candidate marks made by a person in Khonsu. A candidate is a lead for follow-up, not a confirmed detection, planet or discovery. Apparent change can come from noise, detector artifacts, unmatched point spread functions or registration error.";
export const EVIDENCE_SHARING = "A Khonsu search link repeats a search but never carries notes. This file is the only way these notes leave the browser where they were made; nothing was uploaded.";

export interface EvidenceFrameRef {
  frame_id: string;
  observation_id: string | null;
  observed_start_utc: string | null;
}

export interface EvidenceCandidate {
  candidate_id: string;
  origin: "human";
  review_status: "unreviewed candidate";
  note: string;
  created_at_utc: string;
  updated_at_utc: string;
  sequence_id: string;
  sequence_snapshot_available: boolean;
  synthetic_input: boolean | null;
  marked_frame: EvidenceFrameRef;
  comparison: { a: EvidenceFrameRef; b: EvidenceFrameRef } | null;
  position: {
    grid_pixel: {
      x: number; y: number;
      coordinate_space: "natural-raster";
      pixel_origin: "top-left";
      pixel_center_convention: "zero-based-integer-centers";
    };
    sky: { ra_deg: number; dec_deg: number; frame: "ICRS"; unit: "deg"; method: string } | null;
    sky_unavailable_reason: string | null;
    pixel_has_data: boolean | null;
    pixel_quality: 'strict-valid' | 'warning-only' | 'unavailable' | 'unknown';
  };
}

export interface EvidenceFile {
  format: typeof EVIDENCE_FORMAT;
  schema_version: typeof EVIDENCE_VERSION;
  exported_at_utc: string;
  notice: string;
  sharing: string;
  candidate_count: number;
  contains_synthetic_input: boolean;
  candidates: EvidenceCandidate[];
  sequences: (SequenceContext & { synthetic_input: boolean })[];
}

function frameRef(frames: FrameSummary[] | undefined, frameId: string): EvidenceFrameRef {
  const frame = frames?.find(item => item.frame_id === frameId);
  return { frame_id: frameId, observation_id: frame?.observation_id ?? null, observed_start_utc: frame?.observed_start_utc ?? null };
}

/** Build the evidence for the given candidates, in their stored order. */
export function buildEvidence(
  candidates: CandidateAnnotation[],
  contexts: Record<string, SequenceContext>,
  exportedAt: string,
): EvidenceFile {
  const sequenceIds = [...new Set(candidates.map(item => item.selection.sequenceId))];
  const sequences = sequenceIds.flatMap(id => contexts[id] ? [{ ...contexts[id], synthetic_input: contexts[id].data_mode === "synthetic" }] : []);
  return {
    format: EVIDENCE_FORMAT,
    schema_version: EVIDENCE_VERSION,
    exported_at_utc: exportedAt,
    notice: EVIDENCE_NOTICE,
    sharing: EVIDENCE_SHARING,
    candidate_count: candidates.length,
    contains_synthetic_input: sequences.some(item => item.synthetic_input),
    candidates: candidates.map(item => {
      const context = contexts[item.selection.sequenceId];
      const { selection } = item;
      return {
        candidate_id: item.id,
        origin: item.origin,
        review_status: "unreviewed candidate",
        note: item.note,
        created_at_utc: item.createdAt,
        updated_at_utc: item.updatedAt,
        sequence_id: selection.sequenceId,
        sequence_snapshot_available: !!context,
        synthetic_input: context ? context.data_mode === "synthetic" : null,
        marked_frame: frameRef(context?.frames, selection.frameId),
        comparison: selection.comparison
          ? { a: frameRef(context?.frames, selection.comparison.aFrameId), b: frameRef(context?.frames, selection.comparison.bFrameId) }
          : null,
        position: {
          grid_pixel: {
            x: selection.x, y: selection.y, coordinate_space: "natural-raster", pixel_origin: "top-left",
            pixel_center_convention: "zero-based-integer-centers",
          },
          sky: item.sky ? { ...item.sky } : null,
          sky_unavailable_reason: item.skyUnavailableReason,
          pixel_has_data: selection.pixelHasData,
          pixel_quality: selection.pixelQuality ?? (selection.pixelHasData===true?'strict-valid':'unknown'),
        },
      };
    }),
    sequences,
  };
}

export function evidenceJson(file: EvidenceFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

function safePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 60) || "sequence";
}

/** Predictable names: one candidate by its ID, a set by its size and export time. */
export function evidenceFilename(candidates: CandidateAnnotation[], exportedAt: string): string {
  if (candidates.length === 1) {
    const [only] = candidates;
    return `khonsu-evidence-${safePart(only!.selection.sequenceId)}-${safePart(only!.id.slice(0, 8))}.json`;
  }
  const stamp = exportedAt.replace(/[-:]/g, "").replace(/\.\d+/, "").slice(0, 16);
  return `khonsu-evidence-${candidates.length}-candidates-${safePart(stamp)}.json`;
}
