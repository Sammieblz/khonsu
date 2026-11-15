import type { SequenceManifest } from "../explorer/interfaces.ts";

// Plain-language provenance derived only from manifest fields.

/** Missing-data share at which a frame gets its own quality note. */
export const HIGH_MISSING_DATA = 0.1;

export function utcSeconds(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function dataModeLabel(sequence: SequenceManifest): { title: string; detail: string } {
  if (sequence.data_mode === "live") {
    return { title: "LIVE ARCHIVE RESULT", detail: "Real SPHEREx observations retrieved from IRSA for this search and processed for this session." };
  }
  if (sequence.data_mode === "cached-real") {
    const acquired = sequence.processing?.cache_acquired_at_utc;
    return {
      title: "CACHED REAL OBSERVATIONS",
      detail: `Real SPHEREx observations retrieved earlier${typeof acquired === "string" ? `, on ${utcSeconds(acquired)}` : ""}, and saved with the app. They are not a live result for the coordinates in the form.`,
    };
  }
  return { title: "SYNTHETIC DEVELOPMENT DATA", detail: "Generated test images for development. They are not observations and must not be interpreted." };
}

function flag(value: unknown, yes: string, no: string): string | null {
  return value === true ? yes : value === false ? no : null;
}

export function processingSummary(sequence: SequenceManifest): { scale: string | null; display: string; processing: string } {
  const processing = sequence.processing ?? {};
  const unit = typeof processing.science_unit === "string" ? processing.science_unit : "";
  const scale = typeof processing.grid_scale_arcsec === "number" ? processing.grid_scale_arcsec.toFixed(2) : null;
  const display = `${sequence.display.stretch} stretch from ${sequence.display.vmin.toPrecision(4)} to ${sequence.display.vmax.toPrecision(4)}${unit ? ` ${unit}` : ""}, the same for every observation. Display adjustments change appearance only.`;
  const parts = [
    typeof processing.pipeline_version === "string" ? `pipeline ${processing.pipeline_version}` : null,
    typeof processing.reprojection === "string" ? processing.reprojection : null,
    typeof processing.wavelength_policy === "string" ? `wavelength match: ${processing.wavelength_policy}` : null,
    flag(processing.psf_matched, "PSFs matched", "PSFs not matched"),
    flag(processing.background_subtracted, "background subtracted", "background not subtracted"),
    flag(processing.zodiacal_light_subtracted, "zodiacal light subtracted", "zodiacal light not subtracted"),
  ].filter((item): item is string => !!item);
  return { scale, display, processing: parts.length ? `${parts.join("; ")}.` : "No processing record was supplied." };
}

export interface QualityNote { key: string; scope: string; message: string; code: string | null }

/** Sequence warnings, each frame's warnings, and frames with much missing data. */
export function frameNotes(sequence: SequenceManifest): QualityNote[] {
  const notes: QualityNote[] = (sequence.warnings ?? []).map((warning, index) => ({
    key: `sequence-${index}`, scope: "All observations", message: warning.message, code: warning.code,
  }));
  sequence.frames.forEach((frame, index) => {
    const scope = `Observation ${index + 1}`;
    (frame.warnings ?? []).forEach((warning, warningIndex) => notes.push({
      key: `${frame.frame_id}-${warningIndex}`, scope, message: warning.message, code: warning.code,
    }));
    const missing = frame.masked_fraction ?? 0;
    if (missing >= HIGH_MISSING_DATA) notes.push({
      key: `${frame.frame_id}-missing`, scope,
      message: `${(missing * 100).toFixed(1)}% of its pixels have no valid data (masked or outside coverage). Changes near those areas can be gaps, not the sky.`,
      code: null,
    });
  });
  if (!notes.length) notes.push({ key: "none", scope: "All observations", message: "The manifest lists no quality warnings. Masks, PSFs and backgrounds still limit what a difference means.", code: null });
  return notes;
}
