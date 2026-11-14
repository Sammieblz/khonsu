import type { CandidateAnnotation, ImageSelection, SequenceManifest, SequenceRequest } from "../explorer/interfaces";
import { pixelToSky } from "../viewer/wcs.ts";

export interface SkyPosition {
  raDeg: number;
  decDeg: number;
  coordinateFrame: "ICRS";
}

export interface AnnotationContext {
  manifest: SequenceManifest;
  query: SequenceRequest | null;
  comparisonFrameIds?: string[];
}

export interface CandidateEvidence {
  schemaVersion: 1;
  origin: "human";
  reviewStatus: "unreviewed";
  capturedAt: string;
  dataMode: SequenceManifest["data_mode"];
  frameId: string;
  skyPosition: SkyPosition | null;
  query: SequenceRequest | null;
  manifest: SequenceManifest;
  comparisonFrameIds: string[];
}

export interface EvidenceBundle {
  schema: "org.khonsu.candidate-evidence";
  schemaVersion: 1;
  exportedAt: string;
  disclaimer: string;
  dataMode: SequenceManifest["data_mode"];
  limitations: string[];
  query: SequenceRequest | null;
  manifest: SequenceManifest;
  comparisonFrameIds: string[];
  candidates: CandidateAnnotation[];
}

export const CANDIDATE_DISCLAIMER =
  "Human-marked preliminary candidates for investigation. These notes do not establish a planet, an orbit, a significant change, or a confirmed discovery.";

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function validComparisonIds(manifest: SequenceManifest, ids: string[] = []): string[] {
  const available = new Set(manifest.frames.map(frame => frame.frame_id));
  return [...new Set(ids.filter(id => available.has(id)))].slice(0, 2);
}

export function captureEvidence(selection: ImageSelection, context: AnnotationContext, capturedAt: string): CandidateEvidence {
  const manifest = context.manifest;
  if (selection.sequenceId !== manifest.sequence_id
    || !manifest.frames.some(frame => frame.frame_id === selection.frameId)
    || !Number.isInteger(selection.x) || !Number.isInteger(selection.y)
    || selection.x < 0 || selection.x >= manifest.grid.width_px
    || selection.y < 0 || selection.y >= manifest.grid.height_px) {
    throw new Error("The selected pixel does not belong to this observation grid.");
  }
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error("Evidence needs a valid capture time.");
  return copy<CandidateEvidence>({
    schemaVersion: 1,
    origin: "human",
    reviewStatus: "unreviewed",
    capturedAt,
    dataMode: manifest.data_mode,
    frameId: selection.frameId,
    skyPosition: pixelToSky(selection, manifest.grid),
    query: context.query,
    manifest,
    comparisonFrameIds: validComparisonIds(manifest, context.comparisonFrameIds),
  });
}

export function createEvidenceBundle(
  annotations: CandidateAnnotation[],
  context: AnnotationContext,
  exportedAt = new Date().toISOString(),
): EvidenceBundle {
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error("Evidence needs a valid export time.");
  const candidates = annotations.filter(item => item.selection.sequenceId === context.manifest.sequence_id);
  const limitations = [
    "Notes are stored in the observer's browser. A shared query URL does not transfer these notes.",
    "This JSON record references images without embedding image bytes. Prepared image URLs can expire; preserve the source FITS data separately for a complete archive.",
    "PNG display values are stretched for inspection and must not be used as calibrated photometric measurements.",
    "Check alignment, wavelength overlap, masks, background, point spread function, and source quality before interpreting a change.",
  ];
  if (!context.query) limitations.push("The original live query is unavailable for this example. The manifest retains its target and field of view.");
  if (context.manifest.data_mode === "synthetic") {
    limitations.push("SYNTHETIC DEVELOPMENT DATA. Images, marks, and any simulated positions are not NASA observations or discovery evidence.");
  }
  if (candidates.some(item => !item.evidence)) {
    limitations.push("Some legacy notes have no capture-time provenance snapshot. Current sequence metadata is provided separately and must not be treated as their original metadata.");
  }
  if (candidates.some(item => item.evidence && !item.evidence.skyPosition)) {
    limitations.push("Some marks have pixel coordinates only because the output WCS could not provide a supported celestial conversion.");
  }
  return copy<EvidenceBundle>({
    schema: "org.khonsu.candidate-evidence",
    schemaVersion: 1,
    exportedAt,
    disclaimer: CANDIDATE_DISCLAIMER,
    dataMode: context.manifest.data_mode,
    limitations,
    query: context.query,
    manifest: context.manifest,
    comparisonFrameIds: validComparisonIds(context.manifest, context.comparisonFrameIds),
    candidates,
  });
}
