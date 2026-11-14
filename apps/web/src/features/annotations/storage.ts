import type { CandidateAnnotation } from "../explorer/interfaces";

export const ANNOTATIONS_KEY = "khonsu.annotations.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseStoredAnnotations(raw: string | null): CandidateAnnotation[] {
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CandidateAnnotation => {
    if (!isRecord(item) || !isRecord(item.selection)) return false;
    const selection = item.selection;
    return typeof item.id === "string" && typeof item.note === "string" && item.note.length <= 500
      && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt))
      && typeof selection.sequenceId === "string" && typeof selection.frameId === "string"
      && typeof selection.x === "number" && Number.isInteger(selection.x) && selection.x >= 0
      && typeof selection.y === "number" && Number.isInteger(selection.y) && selection.y >= 0
      && selection.coordinateSpace === "natural-raster" && selection.pixelOrigin === "top-left";
  });
}
