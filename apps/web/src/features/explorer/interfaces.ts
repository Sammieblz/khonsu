import type { components } from "@/lib/api/generated";

// Robel owns these frontend seams. Tyrone owns the generated API definitions.
export type SequenceRequest = components["schemas"]["SequenceRequest"];
export type SequenceManifest = components["schemas"]["SequenceManifest"];
export type ObservationFrame = SequenceManifest["frames"][number];
export type ViewerTool = "time" | "pan" | "mark";

export interface ImageSelection {
  sequenceId: string;
  frameId: string;
  /** Zero-based column and row on the sequence's common output grid. */
  x: number;
  y: number;
  coordinateSpace: "natural-raster";
  pixelOrigin: "top-left";
  /** The A/B comparison chosen in the viewer when the pixel was selected. */
  comparison: { aFrameId: string; bFrameId: string } | null;
  /** Whether the frame has valid data at this pixel; null when only a PNG is available. */
  pixelHasData: boolean | null;
  /** Optional for older saved notes; warning samples never count as strict-valid. */
  pixelQuality?: 'strict-valid' | 'warning-only' | 'unavailable' | 'unknown';
}

export interface SkyPosition {
  ra_deg: number;
  dec_deg: number;
  frame: "ICRS";
  unit: "deg";
  method: string;
}

/** A person's local candidate mark. Version 2 of the stored record. */
export interface CandidateAnnotation {
  id: string;
  origin: "human";
  selection: ImageSelection;
  /** Null when the grid has no WCS this app can convert exactly. */
  sky: SkyPosition | null;
  skyUnavailableReason: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** The observation facts a candidate needs after its sequence has expired. */
export interface FrameSummary {
  frame_id: string;
  observation_id: string | null;
  observed_start_utc: string | null;
  observed_end_utc: string | null;
  release: string | null;
  detector: number | null;
  wavelength_um: number | null;
  bandwidth_um: number | null;
  masked_fraction: number;
  warning_fraction?: number;
  source_fits_url: string | null;
  warnings: { code: string; message: string }[];
}

export interface SequenceContext {
  sequence_id: string;
  data_mode: SequenceManifest["data_mode"];
  title: string;
  disclosure: string;
  target: SequenceManifest["target"];
  requested_fov_arcmin: number;
  grid: SequenceManifest["grid"];
  display: SequenceManifest["display"];
  processing: NonNullable<SequenceManifest["processing"]>;
  warnings: { code: string; message: string }[];
  frames: FrameSummary[];
  /** The search that reproduces this field; null for synthetic fixtures. */
  query: { ra_deg: number; dec_deg: number; fov_arcmin: number; coordinate_frame: "ICRS"; link: string | null; note: string } | null;
  recorded_at_utc: string;
}

export type CandidateStorageState =
  | { kind: "loading" }
  | { kind: "saved"; preservedUnreadable: number }
  | { kind: "unavailable" }
  | { kind: "unreadable"; reason: string }
  | { kind: "write-failed" }
  | { kind: "too-large" };

export interface SkyViewerProps {
  sequence: SequenceManifest | null;
  activeFrameId: string | null;
  annotations: CandidateAnnotation[];
  selectedCandidateId?: string | null;
  onFrameChange: (frameId: string) => void;
  onSelect: (selection: ImageSelection) => void;
}

export interface AnnotationPanelProps {
  sequence: SequenceManifest | null;
  selection: ImageSelection | null;
  annotations: CandidateAnnotation[];
  contexts: Record<string, SequenceContext>;
  selectedCandidateId: string | null;
  storage: CandidateStorageState;
  atCapacity: boolean;
  onAdd: (selection: ImageSelection, note: string) => void;
  onUpdate: (annotationId: string, note: string) => void;
  onRemove: (annotationId: string) => void;
  onSelectCandidate: (annotationId: string | null) => void;
  onStartFresh: () => void;
  onDownloadUnreadable: () => void;
}
