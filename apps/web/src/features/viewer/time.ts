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

export function timePositions(dates: (string | null | undefined)[]): number[] {
  const values = dates.map(value => value ? Date.parse(value) : NaN);
  const first = Math.min(...values), last = Math.max(...values);
  if (!values.every(Number.isFinite) || last === first)
    return dates.map((_, index) => index / Math.max(1, dates.length - 1));
  return values.map(value => (value - first) / (last - first));
}
export function nearestObservation(positions: number[], value: number): number {
  return positions.reduce((best, position, index) => Math.abs(position - value) < Math.abs((positions[best] ?? 0) - value) ? index : best, 0);
}
export function frameWindow(count: number, index: number, pinned: number[] = []): number[] {
  return [...new Set([index, index - 1, index + 1, ...pinned])].filter(i => i >= 0 && i < count).slice(0, 5);
}

/** One cache policy for PNGs and prepared intensities. Keep A/B at HD sizes. */
export function frameCacheWindow(frames: { raster?: { size_bytes: number } | null }[], index: number, pinned: number[] = []): number[] {
  if (!frames.some(frame => (frame.raster?.size_bytes ?? 0) > 5 * 1024 * 1024)) return frameWindow(frames.length, index, pinned);
  return [...new Set([index, ...pinned, index - 1, index + 1])].filter(i => i >= 0 && i < frames.length).slice(0, 3);
}
