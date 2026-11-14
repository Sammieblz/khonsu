export function observationLabel(value: string | null | undefined): string {
  if (!value) return "Observation date unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Observation date unavailable";
  return date.toLocaleString("en-GB", {
    timeZone: "UTC", year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }) + " UTC";
}

export function adjacentFrameIndex(index: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return -1;
  const safeIndex = Math.min(count - 1, Math.max(0, index));
  return Math.min(count - 1, Math.max(0, safeIndex + direction));
}
