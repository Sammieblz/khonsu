import type { SequenceManifest } from "../explorer/interfaces.ts";

// Plain-language limits of an A/B comparison, from manifest fields only.

/** Missing-data share, or A/B difference, that earns an explicit coverage note. */
export const COVERAGE_NOTE_FRACTION = 0.1;
export const COVERAGE_NOTE_DIFFERENCE = 0.05;

type Frame = SequenceManifest["frames"][number];

export interface ComparisonSummary {
  /** One line per side, for example "A: 07 Nov 2025 20:31 UTC, 2025W45_2A_0292_2, DR1, 1.4132 µm, 3.2% no data". */
  sides: [string, string];
  notes: string[];
}

function when(frame: Frame): string {
  if (!frame.observed_start_utc) return "date unavailable";
  const date = new Date(frame.observed_start_utc);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : "date unavailable";
}

function side(label: "A" | "B", index: number, frame: Frame): string {
  const parts = [
    `${label}: observation ${index + 1}, ${when(frame)}`,
    frame.observation_id ?? null,
    frame.release ?? null,
    frame.wavelength_um != null ? `${frame.wavelength_um.toFixed(4)} µm` : null,
    `${((frame.masked_fraction ?? 0) * 100).toFixed(1)}% no data`,
  ];
  return parts.filter(Boolean).join(", ");
}

function days(a: Frame, b: Frame): number | null {
  if (!a.observed_start_utc || !b.observed_start_utc) return null;
  const difference = Date.parse(b.observed_start_utc) - Date.parse(a.observed_start_utc);
  return Number.isFinite(difference) ? difference / 86_400_000 : null;
}

export function describeComparison(sequence: SequenceManifest, aIndex: number, bIndex: number): ComparisonSummary | null {
  const a = sequence.frames[aIndex], b = sequence.frames[bIndex];
  if (!a || !b) return null;
  const notes: string[] = [];
  if (aIndex === bIndex) {
    notes.push("A and B are the same observation. Choose two different dates to compare.");
    return { sides: [side("A", aIndex, a), side("B", bIndex, b)], notes };
  }
  const apart = days(a, b);
  if (apart !== null) {
    const size = Math.abs(apart);
    const span = size < 1 ? `${(size * 24).toFixed(1)} hours` : `${size.toFixed(1)} days`;
    notes.push(apart === 0 ? "A and B started at the same time." : `B was observed ${span} ${apart > 0 ? "after" : "before"} A.`);
  }
  if (a.release && b.release && a.release !== b.release) {
    const pair = new Set([a.release, b.release]);
    notes.push(pair.has("DR1") && pair.has("QR3")
      ? `A is ${a.release} and B is ${b.release}. IRSA states that DR1 and QR3 spectral images are intended to be used together as a uniformly processed set.`
      : `A is ${a.release} and B is ${b.release}; calibration can differ between releases.`);
  }
  if (a.wavelength_um != null && b.wavelength_um != null && a.wavelength_um !== b.wavelength_um) {
    notes.push(`Wavelength at the target differs by ${Math.abs(a.wavelength_um - b.wavelength_um).toFixed(4)} µm (A ${a.wavelength_um.toFixed(4)}, B ${b.wavelength_um.toFixed(4)}). Brightness can change with wavelength, not only with time.`);
  }
  if (a.detector != null && b.detector != null && a.detector !== b.detector) {
    notes.push(`A uses detector ${a.detector} and B detector ${b.detector}, which have different spectral responses.`);
  }
  const missingA = a.masked_fraction ?? 0, missingB = b.masked_fraction ?? 0;
  if (Math.max(missingA, missingB) >= COVERAGE_NOTE_FRACTION || Math.abs(missingA - missingB) >= COVERAGE_NOTE_DIFFERENCE) {
    notes.push(`Coverage differs: A has ${(missingA * 100).toFixed(1)}% and B ${(missingB * 100).toFixed(1)}% of pixels without valid data. A change near a gap can be missing data, not the sky.`);
  }
  for (const [label, frame] of [["A", a], ["B", b]] as const) {
    for (const warning of frame.warnings ?? []) notes.push(`${label}: ${warning.message}`);
  }
  if (sequence.processing?.psf_matched === false || (sequence.warnings ?? []).some(item => item.code === "DISPLAY_COMPARISON_ONLY")) {
    notes.push("Image sharpness (PSF) and backgrounds are not matched between dates, so a source can look different without changing.");
  }
  return { sides: [side("A", aIndex, a), side("B", bIndex, b)], notes };
}
