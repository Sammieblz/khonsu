import type { components } from "@/lib/api/generated";
import type { CandidateEvidence } from "@/features/annotations/model";

// Robel owns these frontend seams. Tyrone owns the generated API definitions.
export type SequenceRequest = components["schemas"]["SequenceRequest"];
export type SequenceManifest = components["schemas"]["SequenceManifest"];
export type ObservationFrame = SequenceManifest["frames"][number];
export type ViewerTool = "time" | "pan" | "mark";
export type PresetTarget = components["schemas"]["PresetTarget"];
export type SequenceJob = components["schemas"]["SequenceJob"];

export interface ViewerComparison {
  aFrameId: string | null;
  bFrameId: string | null;
}

export interface ImageSelection {
  sequenceId: string;
  frameId: string;
  x: number;
  y: number;
  coordinateSpace: "natural-raster";
  pixelOrigin: "top-left";
}

export interface CandidateAnnotation {
  id: string;
  selection: ImageSelection;
  note: string;
  createdAt: string;
  evidence?: CandidateEvidence;
}

export interface SkyViewerProps {
  sequence: SequenceManifest | null;
  activeFrameId: string | null;
  annotations: CandidateAnnotation[];
  onFrameChange: (frameId: string) => void;
  onSelect: (selection: ImageSelection) => void;
  tool?: ViewerTool;
  onToolChange?: (tool: ViewerTool) => void;
  comparison?: ViewerComparison;
  onComparisonChange?: (comparison: ViewerComparison) => void;
}

export interface AnnotationPanelProps {
  selection: ImageSelection | null;
  annotations: CandidateAnnotation[];
  onAdd: (selection: ImageSelection, note: string) => void;
  onRemove: (annotationId: string) => void;
  sequence: SequenceManifest | null;
  request: SequenceRequest | null;
  comparisonFrameIds?: string[];
  storageWarning?: string | null;
}
