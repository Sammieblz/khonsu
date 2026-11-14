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

export interface TimedFrame { frame_id: string; observed_start_utc?: string | null; }

export function epochMilliseconds(frame: TimedFrame): number | null {
  if (!frame.observed_start_utc) return null;
  const value = Date.parse(frame.observed_start_utc);
  return Number.isFinite(value) ? value : null;
}

// Unknown dates stay unknown. Stable ties preserve separate observations.
export function chronologicalFrames<T extends TimedFrame>(frames: readonly T[]): T[] {
  return frames.map((frame, index) => ({ frame, index, epoch: epochMilliseconds(frame) }))
    .sort((a, b) => (a.epoch ?? Infinity) - (b.epoch ?? Infinity) || a.index - b.index)
    .map(item => item.frame);
}

export interface EpochTimeline {
  mode: "time" | "ordinal";
  positions: (number | null)[];
  firstEpoch: number | null;
  lastEpoch: number | null;
  unknownCount: number;
}

export function epochTimeline(frames: readonly TimedFrame[]): EpochTimeline {
  const epochs = frames.map(epochMilliseconds);
  const known = epochs.filter((value): value is number => value !== null);
  const firstEpoch = known.length ? Math.min(...known) : null;
  const lastEpoch = known.length ? Math.max(...known) : null;
  const unknownCount = epochs.length - known.length;
  if (firstEpoch !== null && lastEpoch !== null && lastEpoch > firstEpoch) {
    return {
      mode: "time", firstEpoch, lastEpoch, unknownCount,
      positions: epochs.map(epoch => epoch === null ? null : (epoch - firstEpoch) / (lastEpoch - firstEpoch)),
    };
  }
  return {
    mode: "ordinal", firstEpoch, lastEpoch, unknownCount,
    positions: frames.map((_, index) => frames.length <= 1 ? .5 : index / (frames.length - 1)),
  };
}

export function nearestTimelineIndex(positions: readonly (number | null)[], position: number): number {
  if (!Number.isFinite(position)) return -1;
  let result = -1;
  let distance = Infinity;
  positions.forEach((value, index) => {
    if (value === null) return;
    const nextDistance = Math.abs(value - Math.max(0, Math.min(1, position)));
    if (nextDistance < distance) { result = index; distance = nextDistance; }
  });
  return result;
}
